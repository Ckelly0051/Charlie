import { render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import '../css/native-film-room.css';

// V2-H large-game performance: a fixed fallback row height, used only until
// the real rendered height is measured (see the ResizeObserver in
// NativeFilmRoom). Matches the CSS `.gi-film-table-wrap th,td{height:34px}`
// base rule -- the coarse-pointer override measures its own real 44px height
// once visible, so nothing here needs to track that media query.
const ROW_HEIGHT_FALLBACK = 34;
const OVERSCAN_PX = 480;

// V2-H repair (Codex review): the active row used to be pinned by EXPANDING
// the single contiguous scroll window to also cover it -- so a coach parked
// on row 1 who scrolled to row 700 got a window spanning rows 0..700,
// rendering almost the whole table and defeating the point of windowing.
// This instead returns disjoint, non-overlapping row ranges: the scroll
// window, plus (only when the active row falls outside it) one separate
// single-row range for the active cell. Overlapping/adjacent ranges are
// merged so a zero-width gap never renders its own spacer. Pure and
// exported so the bounded-DOM guarantee is directly unit-testable.
export function computeRowSegments(total, windowStart, windowEnd, activeRowIndex) {
  const ranges = [];
  if (windowStart < windowEnd) ranges.push([windowStart, windowEnd]);
  if (activeRowIndex >= 0 && activeRowIndex < total) {
    const covered = ranges.some(([start, end]) => activeRowIndex >= start && activeRowIndex < end);
    if (!covered) ranges.push([activeRowIndex, activeRowIndex + 1]);
  }
  ranges.sort((a, b) => a[0] - b[0]);
  const merged = [];
  for (const range of ranges) {
    const last = merged[merged.length - 1];
    if (last && range[0] <= last[1]) last[1] = Math.max(last[1], range[1]);
    else merged.push([range[0], range[1]]);
  }
  return merged;
}

const FILTERS = [
  { group: 'unit', value: 'offense', label: 'Offense' },
  { group: 'unit', value: 'defense', label: 'Defense' },
  { group: 'unit', value: 'special', label: 'Special Teams' },
  { group: 'downs', value: '1', label: '1st' },
  { group: 'downs', value: '2', label: '2nd' },
  { group: 'downs', value: '3', label: '3rd' },
  { group: 'downs', value: '4', label: '4th' },
  { group: 'rp', value: 'Run', label: 'Run' },
  { group: 'rp', value: 'Pass', label: 'Pass' },
  { group: 'flags', value: 'td', label: 'TD' },
  { group: 'flags', value: 'to', label: 'TO' },
  { group: 'flags', value: 'pen', label: 'Penalty' },
  { group: 'flags', value: 'untagged', label: 'Untagged' },
];

function filterOn(filters, group, value) {
  if (group === 'unit' || group === 'rp') return filters[group] === value;
  return (filters[group] || []).includes(value);
}

function ColumnsPanel({ screen, state }) {
  const [active, setActive] = useState(() => new Set(state.activeColumns));
  const toggle = (key, checked) => {
    if (!screen.setColumn(key, checked)) return;
    setActive(current => {
      const next = new Set(current);
      if (checked) next.add(key); else next.delete(key);
      return next;
    });
  };
  return <div class="gi-film-columns">
    <div class="gi-film-presets">{state.presets.map(name => <button type="button" key={name} onClick={() => {
      screen.applyPreset(name);
      setActive(new Set(screen.snapshot().activeColumns));
    }}>{name}</button>)}</div>
    <div class="gi-film-column-list">{state.allColumns.map(col => <label key={col.key}>
      <input type="checkbox" checked={active.has(col.key)} onChange={event => toggle(col.key, event.currentTarget.checked)} />
      <span>{col.label}</span>
    </label>)}</div>
  </div>;
}

function CellEditor({ screen, model, close }) {
  const initial = model.col.multi ? String(model.value || '').split(/\s*\+\s*/).filter(Boolean) : model.value;
  const [value, setValue] = useState(initial);
  const commit = next => {
    const output = model.col.multi ? next.join(' + ') : next;
    screen.commitEdit(model.playId, model.col.key, output);
    close();
  };
  if (model.col.type === 'enum') {
    if (model.col.multi) return <div class="gi-film-cell-editor">
      <strong>{model.col.label}</strong>
      <div class="gi-film-option-chips">{model.options.map(option => <button
        type="button" key={option} class={value.includes(option) ? 'is-active' : ''}
        onClick={() => setValue(current => current.includes(option) ? current.filter(item => item !== option) : [...current, option])}
      >{option}</button>)}</div>
      <footer><button type="button" onClick={() => setValue([])}>Clear</button><button type="button" class="is-primary" onClick={() => commit(value)}>Done</button></footer>
    </div>;
    return <div class="gi-film-cell-editor">
      <strong>{model.col.label}</strong>
      <div class="gi-film-option-chips">{model.options.map(option => <button type="button" key={option} class={value === option ? 'is-active' : ''} onClick={() => commit(option)}>{option}</button>)}</div>
      <footer><button type="button" onClick={() => commit('')}>Clear</button></footer>
    </div>;
  }
  if (model.col.type === 'sit') {
    const [down, setDown] = useState(model.value.down || '');
    const [distance, setDistance] = useState(model.value.distance || '');
    return <div class="gi-film-cell-editor">
      <strong>Down and distance</strong>
      <div class="gi-film-option-chips">{['1','2','3','4'].map(item => <button type="button" class={down === item ? 'is-active' : ''} onClick={() => setDown(item)}>{item}</button>)}</div>
      <label>Distance<input type="number" min="1" max="99" value={distance} onInput={event => setDistance(event.currentTarget.value)} /></label>
      <footer><button type="button" onClick={() => commit({ down: '', distance: '' })}>Clear</button><button type="button" class="is-primary" onClick={() => commit({ down, distance })}>Done</button></footer>
    </div>;
  }
  return <form class="gi-film-cell-editor" onSubmit={event => { event.preventDefault(); commit(value); }}>
    <strong>{model.col.label}</strong>
    <input type={model.col.type === 'yds' ? 'number' : 'text'} value={value} autoFocus onInput={event => setValue(event.currentTarget.value)} />
    <footer><button type="button" onClick={() => commit('')}>Clear</button><button type="submit" class="is-primary">Save</button></footer>
  </form>;
}

function NativeFilmRoom({ screen }) {
  const [state, setState] = useState(() => screen.snapshot());
  const [active, setActive] = useState(null);
  const tableRef = useRef(null);
  // V2-H row windowing state. `viewport` is measured, not assumed, and is
  // deliberately never reset back to zero once known -- Film Room stays
  // mounted (just `hidden`) while Chart is showing, so a measurement taken
  // the first time the table was visible must survive the hide/show cycle,
  // or every single switch back to Film Room would re-pay a full, unwindowed
  // layout before the next measurement could shrink it back down.
  const [scrollTop, setScrollTop] = useState(0);
  // A generous initial guess, not a real measurement -- Film Room mounts
  // while `hidden` (display:none) alongside Chart, so the real height reads
  // 0 until the coach's first switch. Guessing a reasonable desktop height
  // up front means that FIRST switch is windowed too, not just every one
  // after it; the ResizeObserver below immediately corrects it to the real
  // value once genuinely visible, so a wrong guess only ever costs one
  // self-correcting re-render, never a lasting inaccuracy.
  const [viewport, setViewport] = useState({ height: 800, rowHeight: ROW_HEIGHT_FALLBACK });
  const scrollRaf = useRef(null);
  // V2-H repair (Codex review): the scroll handler used to capture scrollTop
  // once per animation frame and DROP every scroll event that landed before
  // that frame fired -- a fast scrollbar drag could leave the rendered window
  // one or more events behind the real position. This ref always holds the
  // MOST RECENT position; the queued frame reads it, not whatever value was
  // current when the frame was scheduled.
  const latestScrollTop = useRef(0);
  useEffect(() => screen.subscribe(setState), [screen]);
  // A wholesale play-list replacement (game switch, season open, a full
  // undo/redo) must not leave a scroll position sized for the PREVIOUS
  // game's row count. Left uncorrected, a large offset from a longer game
  // could window past the end of a shorter one and render nothing at all.
  useEffect(() => {
    if (scrollRaf.current) { cancelAnimationFrame(scrollRaf.current); scrollRaf.current = null; }
    latestScrollTop.current = 0;
    setScrollTop(0);
    if (tableRef.current) tableRef.current.scrollTop = 0;
  }, [state.loadGeneration]);
  // Never let a frame scheduled by a still-mounted table keep running (and
  // call setState) after Film Room itself unmounts.
  useEffect(() => () => {
    if (scrollRaf.current) cancelAnimationFrame(scrollRaf.current);
  }, []);
  useLayoutEffect(() => {
    const wrap = tableRef.current;
    if (!wrap || typeof ResizeObserver === 'undefined') return;
    const measure = () => {
      const height = wrap.clientHeight;
      const sample = wrap.querySelector('tbody tr:not(.gi-film-row-spacer)');
      const rowHeight = sample ? sample.getBoundingClientRect().height : 0;
      // Both read 0 while an ancestor is `hidden` (display:none) -- that is
      // not a real "the table is now 0px tall" resize, it is "we can't see
      // it right now." Only a genuine, nonzero measurement may update state.
      if (height > 0 || rowHeight > 0) {
        setViewport(prev => ({
          height: height > 0 ? height : prev.height,
          rowHeight: rowHeight > 0 ? rowHeight : prev.rowHeight,
        }));
      }
    };
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(wrap);
    return () => observer.disconnect();
  }, []);
  const onTableScroll = event => {
    // Record the LATEST position on every event, even while a frame is
    // already queued -- only the scheduling (one requestAnimationFrame per
    // batch of scroll events) is throttled, never the position itself.
    latestScrollTop.current = event.currentTarget.scrollTop;
    if (scrollRaf.current) return;
    scrollRaf.current = requestAnimationFrame(() => {
      scrollRaf.current = null;
      setScrollTop(latestScrollTop.current);
    });
  };
  const activeVisible = !!active && state.rows.some(row => row.id === active.playId)
    && state.columns.some(col => col.key === active.colKey);
  useEffect(() => {
    const first = state.rows[0] && state.columns[0]
      ? { playId: state.rows[0].id, colKey: state.columns[0].key }
      : null;
    if (!activeVisible && first) setActive(first);
    else if (!first && active) setActive(null);
  }, [activeVisible, state.rows, state.columns]);
  const allVisibleSelected = state.rows.length > 0 && state.rows.every(row => row.selected);

  // Only the rows near the current scroll position (plus overscan) are
  // rendered as real <tr> elements. Below the window's natural capacity --
  // every existing fixture, and any ordinary game -- start/end span the
  // whole list, so the rendered rows are identical to rendering everything.
  const rowHeight = viewport.rowHeight || ROW_HEIGHT_FALLBACK;
  const total = state.rows.length;
  const activeRowIndex = active ? state.rows.findIndex(row => row.id === active.playId) : -1;
  let windowStart = 0;
  let windowEnd = total;
  if (viewport.height > 0 && viewport.rowHeight > 0) {
    const overscanRows = Math.max(6, Math.ceil(OVERSCAN_PX / rowHeight));
    windowStart = Math.floor(scrollTop / rowHeight) - overscanRows;
    windowEnd = Math.ceil((scrollTop + viewport.height) / rowHeight) + overscanRows;
  }
  // Clamp BEFORE the active row is considered at all: a filter or a game
  // switch can shrink `total` out from under a scroll position sized for a
  // much longer list (the reset effect above only covers the game-switch
  // case explicitly). In testing, a shrinking scroll range also recovers on
  // its own because the browser re-clamps a scroll container's own
  // scrollTop when its content shrinks -- but that is implicit platform
  // behavior this file has no control over, so the windowing math does not
  // depend on it: clamping here guarantees the scroll window always stays in
  // range regardless of scroll-event timing, at zero cost to the common case.
  windowStart = Math.max(0, Math.min(windowStart, Math.max(0, total - 1)));
  windowEnd = Math.max(windowStart, Math.min(windowEnd, total));
  // The active/focused row is always force-included regardless of scroll
  // position -- keyboard navigation (`move`/`focusCell` below) must never
  // race a scroll-driven window update to find the cell it just focused --
  // but as a SEPARATE, disjoint single-row range, never by expanding the
  // scroll window to span the gap between it and the active row. Expanding
  // the window used to render almost the entire table the moment a coach
  // scrolled far from a still-active row (e.g. row 1 active, scrolled near
  // row 700 -> a rendered window of rows 0..700), defeating windowing
  // entirely. See computeRowSegments() above.
  const segments = computeRowSegments(total, windowStart, windowEnd, activeRowIndex);

  const openColumns = anchor => screen.overlays.sheet({
    title: 'Film Room columns',
    modal: false,
    returnFocus: anchor,
    content: <ColumnsPanel screen={screen} state={state} />,
    actions: [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
  });
  const openSaved = anchor => screen.overlays.popover({
    title: 'Saved Film Room filters',
    anchor,
    items: state.savedFilters.flatMap(item => [
      { key: 'apply-' + item.index, label: item.name, onSelect: () => screen.applySavedFilter(item.index) },
      { key: 'delete-' + item.index, label: 'Delete ' + item.name, tone: 'destructive', onSelect: () => screen.deleteSavedFilter(item.index) },
    ]),
  });
  const saveFilter = anchor => {
    let name = '';
    screen.overlays.dialog({
      title: 'Save this Film Room filter',
      returnFocus: anchor,
      content: <label class="gi-film-save-filter">Filter name<input autoFocus maxLength="40" placeholder="3rd down passes" onInput={event => { name = event.currentTarget.value; }} /></label>,
      actions: [
        { key: 'cancel', label: 'Cancel' },
        { key: 'save', label: 'Save filter', tone: 'primary', default: true, onSelect: () => screen.saveFilter(name) },
      ],
    });
  };
  const openEditor = (anchor, row, col) => {
    const model = screen.editor(row.id, col.key);
    if (!model) return;
    let handle;
    handle = screen.overlays.popover({
      title: 'Edit ' + col.label,
      anchor,
      placement: 'bottom-start',
      content: <CellEditor screen={screen} model={model} close={() => handle.close('commit')} />,
    });
  };
  const focusCell = next => {
    setActive(next);
    screen.selectPlay(next.playId);
    requestAnimationFrame(() => tableRef.current?.querySelector(`[data-cell="${next.playId}:${next.colKey}"]`)?.focus({ preventScroll: true }));
  };
  const move = (event, dx, dy) => {
    if (!active) return;
    const rowIndex = state.rows.findIndex(row => row.id === active.playId);
    const colIndex = state.columns.findIndex(col => col.key === active.colKey);
    if (rowIndex < 0 || colIndex < 0) return;
    event.preventDefault(); event.stopPropagation();
    const row = state.rows[Math.max(0, Math.min(state.rows.length - 1, rowIndex + dy))];
    const col = state.columns[Math.max(0, Math.min(state.columns.length - 1, colIndex + dx))];
    focusCell({ playId: row.id, colKey: col.key });
  };
  const renderSpacer = (key, rowCount) => {
    const height = rowCount * rowHeight;
    return <tr aria-hidden="true" class="gi-film-row-spacer" key={key} style={{ height: height + 'px' }}><td colSpan={state.columns.length + 2} style={{ border: 'none', padding: 0, height: height + 'px' }} /></tr>;
  };
  const renderDataRow = (row, rowIndex) => <tr key={row.id} class={`is-${row.unit}${row.current ? ' is-current' : ''}${row.untagged ? ' is-untagged' : ''}`}>
    <td class="is-check"><input type="checkbox" aria-label={'Select play ' + row.id} checked={row.selected} onChange={event => screen.setSelected(row.id, event.currentTarget.checked)} /></td>
    <th class="is-play" scope="row"><button type="button" onClick={() => screen.selectPlay(row.id)}><span>{row.unit.charAt(0).toUpperCase()}</span>{row.id}</button></th>
    {state.columns.map((col, colIndex) => <td key={col.key}><button
      type="button"
      data-cell={row.id + ':' + col.key}
      tabIndex={(activeVisible ? active?.playId === row.id && active?.colKey === col.key : rowIndex === 0 && colIndex === 0) ? 0 : -1}
      class={active?.playId === row.id && active?.colKey === col.key ? 'is-focus' : ''}
      title={col.editable ? 'Select play; activate again to edit' : 'Select play'}
      onClick={event => {
        const next = { playId: row.id, colKey: col.key };
        const same = active?.playId === row.id && active?.colKey === col.key;
        focusCell(next);
        if (same) openEditor(event.currentTarget, row, col);
      }}
      onDblClick={event => openEditor(event.currentTarget, row, col)}
    >{row.cells[col.key] || <span class="is-empty">--</span>}</button></td>)}
  </tr>;
  // Walks the disjoint segments in order, inserting a spacer for the gap
  // before each one (and a trailing spacer after the last), so the rendered
  // DOM is always exactly the segments plus their surrounding gaps -- never
  // a single span that happens to cover everything in between.
  const buildTbodyChildren = () => {
    const nodes = [];
    let cursor = 0;
    for (const [start, end] of segments) {
      if (start > cursor) nodes.push(renderSpacer(`gap-${cursor}`, start - cursor));
      for (let rowIndex = start; rowIndex < end; rowIndex++) nodes.push(renderDataRow(state.rows[rowIndex], rowIndex));
      cursor = end;
    }
    if (cursor < total) nodes.push(renderSpacer(`gap-${cursor}`, total - cursor));
    return nodes;
  };

  return <section class="gi-film-room" data-native-film-room aria-label="Film Room breakdown table">
    <header class="gi-film-room-head">
      <div class="gi-film-room-head-id"><span class="gi-eyebrow">Breakdown table</span><p>{state.visible === state.total ? state.total + ' plays' : state.visible + ' of ' + state.total + ' plays'}</p></div>
      <div class="gi-film-room-actions">
        {state.filterActive && <button type="button" onClick={() => screen.clearFilters()}>Clear filters</button>}
        {state.filterActive && <button type="button" onClick={event => saveFilter(event.currentTarget)}>Save filter</button>}
        {state.savedFilters.length > 0 && <button type="button" onClick={event => openSaved(event.currentTarget)}>Saved filters</button>}
        <button type="button" data-film-columns onClick={event => openColumns(event.currentTarget)}>Columns</button>
        <button type="button" data-film-watch class="is-primary" disabled={!state.watchCount} onClick={() => screen.watch()}>Watch {state.watchCount}</button>
      </div>
    </header>
    <div class="gi-film-filters" aria-label="Film Room filters">{FILTERS.map(item => <button
      type="button" key={item.group + item.value}
      data-filter={item.group + ':' + item.value}
      class={filterOn(state.filters, item.group, item.value) ? 'is-active' : ''}
      aria-pressed={filterOn(state.filters, item.group, item.value)}
      onClick={() => screen.toggleFilter(item.group, item.value)}
    >{item.label}</button>)}</div>
    <div class="gi-film-table-wrap" ref={tableRef} onScroll={onTableScroll} onKeyDown={event => {
      if (event.key === 'ArrowUp') move(event, 0, -1);
      else if (event.key === 'ArrowDown') move(event, 0, 1);
      else if (event.key === 'ArrowLeft') move(event, -1, 0);
      else if (event.key === 'ArrowRight') move(event, 1, 0);
      else if (event.key === 'Enter' && active) {
        const cell = event.target.closest('[data-cell]');
        const row = state.rows.find(item => item.id === active.playId);
        const col = state.columns.find(item => item.key === active.colKey);
        // Mirror move()'s own stopPropagation: without it, the app's global
        // Enter shortcut (Save & Next) also fires as the event bubbles past
        // this table, silently advancing the selected play underneath the
        // editor that just opened.
        if (cell && row && col) { event.preventDefault(); event.stopPropagation(); openEditor(cell, row, col); }
      }
    }}>
      <table>
        <thead><tr>
          <th class="is-check"><input type="checkbox" aria-label="Select all shown plays" checked={allVisibleSelected} onChange={event => screen.setAllVisible(event.currentTarget.checked)} /></th>
          <th class="is-play">Play</th>
          {state.columns.map(col => <th key={col.key}><span>{col.label}</span>{col.tendency && <small>{col.tendency}</small>}</th>)}
        </tr></thead>
        <tbody>{buildTbodyChildren()}</tbody>
      </table>
      {!state.rows.length && <div class="gi-film-empty">No plays match these filters.</div>}
    </div>
  </section>;
}

export function mountNativeFilmRoom({ host, screen }) {
  if (!host) throw new Error('Native Film Room requires a host.');
  if (!screen) throw new Error('Native Film Room requires a screen controller.');
  render(<NativeFilmRoom screen={screen} />, host);
  return { unmount() { render(null, host); } };
}
