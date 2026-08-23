import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import '../css/native-film-room.css';

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
  useEffect(() => screen.subscribe(setState), [screen]);
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

  return <section class="gi-film-room" data-native-film-room aria-label="Film Room breakdown table">
    <header class="gi-film-room-head">
      <div><span class="gi-eyebrow">Breakdown table</span><h2>FILM ROOM</h2><p>{state.visible === state.total ? state.total + ' plays' : state.visible + ' of ' + state.total + ' plays'}</p></div>
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
    <div class="gi-film-table-wrap" ref={tableRef} onKeyDown={event => {
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
        <tbody>{state.rows.map((row, rowIndex) => <tr key={row.id} class={`is-${row.unit}${row.current ? ' is-current' : ''}${row.untagged ? ' is-untagged' : ''}`}>
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
        </tr>)}</tbody>
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
