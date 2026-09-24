/**
 * Reports Presentation Independence — the shared presentation kit.
 *
 * Every Reports tab component in native-report-tabs.jsx is built from these
 * primitives. They own ZERO football computation — every value they render
 * arrives pre-computed from StatsEngine's data methods (js/reports-view.js
 * and StatsEngine's _data*() methods). This file's only job is turning a
 * structured view model into markup, film-click wiring, and sort behavior.
 *
 * Film actions call `screen.watch(refs, label)` directly as a real onClick —
 * there is no post-render DOM query/rebind pass (the old `_bindContent`
 * pattern). A row with no resolvable refs renders with no click affordance
 * at all, never a dead click.
 */
import { render } from 'preact';
import { useLayoutEffect, useMemo, useState } from 'preact/hooks';
import { StatsEngine } from './stats-engine.js';

export function KpiBand({ items }) {
  if (!items?.length) return null;
  return <div class="gi-overview-kpis" style={`--gi-kpi-cols:${Math.min(items.length, 7)}`}>
    {items.map((item, i) => <div key={i} class={`gi-overview-kpi ${item.cls || ''}`}>
      <span>{item.label}</span><strong>{item.value}</strong>{item.sub ? <small>{item.sub}</small> : null}
    </div>)}
  </div>;
}

export function Hero({ kpis }) {
  if (!kpis?.length) return null;
  return <div class="gi-hero">{kpis.map((k, i) => <div key={i} class="gi-kpi" title={k.tip || undefined}>
    <div class="gi-kpi-label">{k.label}</div>
    <div class={`gi-kpi-value ${k.tone || ''}`}>{k.value}</div>
    {k.sub ? <div class="gi-kpi-sub">{k.sub}</div> : null}
  </div>)}</div>;
}

/** A watch-clickable row/tile, generic over HOW a click resolves to film —
 *  callers pass the exact activation the old code used for that section
 *  (a composite-ref `filmNavigation.watch`, or a cut-type predicate through
 *  `_watchPlays`) via `onActivate`. No click affordance at all when
 *  `onActivate` is absent — never a dead click. */
export function Watchable({ tag: Tag = 'div', onActivate, label, class: cls, children, ...rest }) {
  const clickable = typeof onActivate === 'function';
  const onKeyDown = clickable ? e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onActivate(); } } : undefined;
  return <Tag
    class={`${cls || ''}${clickable ? ' cut-row' : ''}`}
    onClick={clickable ? onActivate : undefined}
    onKeyDown={onKeyDown}
    tabIndex={clickable ? 0 : undefined}
    role={clickable ? 'button' : undefined}
    title={clickable ? `Watch: ${label}` : undefined}
    {...rest}
  >{children}</Tag>;
}

/** refs-based convenience — the common case (composite gameId::playId refs
 *  through FilmNavigationService). Renders nothing clickable when refs is
 *  empty, same rule as Watchable. */
export function WatchableRefs({ refs, label, screen, ...rest }) {
  const onActivate = Array.isArray(refs) && refs.length ? () => screen.watchRefs(refs, label) : undefined;
  return <Watchable onActivate={onActivate} label={label} {...rest} />;
}

export function Module({ title, meta, cls = '', action = null, children }) {
  return <section class={`gi-overview-module ${cls}`}>
    <header><strong>{title}</strong>{meta ? <span>{meta}</span> : null}{action}</header>
    {children}
  </section>;
}

export function RowList({ rows }) {
  return <div class="gi-overview-rows">{rows.map(([label, value, cls], i) => <div key={i}>
    <span>{label}</span><strong class={cls || ''}>{value}</strong>
  </div>)}</div>;
}

/** A sortable data table. `columns`: [{key,label,align,numeric,sortValue,cellClass}]. `rows`:
 *  array of plain objects; each may carry `onActivate`/`label`/`id`. Sort
 *  state is local UI state — never touches football data or row identity. */
export function DataTable({ columns, rows, className = 'stats-table stats-table-full', emptyText = 'No data yet.', defaultSort = null }) {
  // `defaultSort` marks the column the view model ALREADY orders by, so the
  // sort affordance is visible at rest instead of only after a click. It is
  // presentation state: it never reorders anything the model did not already
  // order that way. Third click still clears back to the model's own order.
  const [sort, setSort] = useState(defaultSort); // {key, dir}
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : a[sort.key];
      const bv = col?.sortValue ? col.sortValue(b) : b[sort.key];
      // A held slot never sorts above real data, in either direction.
      if (!!a.absent !== !!b.absent) return a.absent ? 1 : -1;
      const aMissing = av === null || av === undefined || av === '';
      const bMissing = bv === null || bv === undefined || bv === '';
      // Missing measurements stay last in both directions. Treating them as
      // zero would put an ungraded player ahead of a negative grade.
      if (aMissing !== bMissing) return aMissing ? 1 : -1;
      let cmp;
      if (col?.numeric) cmp = (Number(av) || 0) - (Number(bv) || 0);
      else cmp = String(av ?? '').localeCompare(String(bv ?? ''));
      return sort.dir === 'desc' ? -cmp : cmp;
    });
    return copy;
  }, [rows, sort, columns]);
  const toggle = key => setSort(current => current?.key === key
    ? (current.dir === 'desc' ? { key, dir: 'asc' } : null)
    : { key, dir: 'desc' });
  if (!rows.length) return <p class="gi-table-empty">{emptyText}</p>;
  // `col.tl` marks a LABEL column. The stylesheet right-aligns every column
  // after the first because they are measurements; a text label right-aligned
  // beside a number throws a wide gap between a row's key and its data, which
  // is the eye-traverse problem the approved Offense comp removed.
  // A `size` on any column means the caller owns its column geometry: the
  // colgroup is emitted and the stylesheet gives each step its width. Without
  // it a table is laid out from content, so the same measurement is a
  // different width in every table and a scope change moves a column edge.
  const sized = columns.some(col => col.size);
  return <div class="gi-table-wrap"><table class={className}>
    {sized && <colgroup>{columns.map(col => <col key={col.key} class={col.size || undefined} />)}</colgroup>}
    <thead><tr>{columns.map(col => <th key={col.key}
      class={`${sort?.key === col.key ? `is-sorted is-${sort.dir}` : ''}${col.tl ? ' tl' : ''}`.trim()}
      onClick={() => toggle(col.key)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(col.key); } }}
    >{col.label}</th>)}</tr></thead>
    {/* A row marked `absent` is a HELD SLOT — a place the schema reserves that
        this cohort cannot fill. It carries the dash in every column, is never
        interactive (there is no film behind a row naming nothing), and never
        sorts above real data. Rendering it here rather than at each call site
        means one treatment for every table on every board. */}
    <tbody>{sorted.map((row, i) => (row.absent
      ? <tr key={`absent-${i}`} class="is-absent">
        {columns.map(col => <td key={col.key} data-col={col.key}
          class={col.tl ? 'tl' : undefined}>–</td>)}
      </tr>
      : <Watchable key={row.id ?? i} tag="tr" class={row.class} onActivate={row.onActivate} label={row.label}>
        {columns.map(col => <td key={col.key} data-col={col.key}
          class={[col.tl ? 'tl' : '', typeof col.cellClass === 'function' ? col.cellClass(row) : col.cellClass || ''].filter(Boolean).join(' ') || undefined}
        >{col.render ? col.render(row) : row[col.key]}</td>)}
      </Watchable>))}</tbody>
  </table></div>;
}

/** A grid of click-to-film tiles (Situational, Big Plays quick answers). */
export function TileGrid({ tiles, cls = '' }) {
  return <div class={`gi-overview-tiles ${cls}`}>{tiles.map((tile, i) => <Watchable key={i} onActivate={tile.onActivate} label={tile.label}>
    <span>{tile.title}</span><strong>{tile.value}</strong><small>{tile.sub}</small>
  </Watchable>)}</div>;
}

/** Real SVG, not `Charts.gauge()`'s HTML string -- a byte-for-byte JSX
 *  re-derivation of that primitive's markup/geometry for sections that must
 *  render with no `dangerouslySetInnerHTML` at all (Reports Presentation
 *  Independence: Defense's Scheme Detail). Keep this in sync with
 *  `Charts.gauge` in js/charts.js if that geometry ever changes. */
export function Gauge({ pct, label = '', color = 'var(--accent)', size = 100, tip = '' }) {
  const clamped = Math.min(100, Math.max(0, pct));
  const frac = clamped / 100;
  const r = size * 0.38;
  const cx = size / 2, cy = size * 0.52;
  const sw = size * 0.09;
  const halfCirc = Math.PI * r;
  const dash = `${(halfCirc * frac).toFixed(2)} ${(halfCirc * (1 - frac)).toFixed(2)}`;
  const h = +(size * 0.62).toFixed(0);
  const arc = `M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}`;
  return <div class="chart-gauge" title={tip || undefined}>
    <svg viewBox={`0 0 ${size} ${h}`} width={size} height={h}>
      <path d={arc} fill="none" stroke="var(--gauge-track, #1c2128)" stroke-width={sw.toFixed(1)} stroke-linecap="round" />
      <path d={arc} fill="none" style={{ stroke: color }} stroke-width={sw.toFixed(1)} stroke-linecap="round" stroke-dasharray={dash} opacity="0.9" />
      <text x={cx} y={(cy - 1).toFixed(1)} text-anchor="middle" fill="var(--text,#E9EEF5)" font-size={(size * 0.2).toFixed(0)} font-weight="700">{Math.round(pct)}%</text>
    </svg>
    {label ? <div class="chart-gauge-label">{label}</div> : null}
  </div>;
}

/** A definitional "i" tooltip button -- the native replacement for
 *  the retired HTML-string tooltip and delegated-click binding
 *  binding pattern. Real Preact interactivity (local `useState`), not a
 *  post-render selector-binding pass. `text` is a static, developer-authored
 *  definition string (StatsEngine.DEFINITIONS), never coach data, so plain
 *  JSX text interpolation is the correct (and safe) sink. Renders nothing
 *  when `text` is blank, matching `defMark()`'s own "no term, no button"
 *  contract. Each instance opens/closes independently rather than the
 *  legacy single delegated "only one open at a time" -- a disclosed, purely
 *  cosmetic difference; the definition content and reachability are
 *  identical. */
export function DefMark({ text }) {
  const [open, setOpen] = useState(false);
  if (!text) return null;
  return <button type="button" class={`gi-def${open ? ' is-open' : ''}`}
    aria-label={`What this measures: ${text}`}
    onClick={e => { e.preventDefault(); e.stopPropagation(); setOpen(o => !o); }}
    onKeyDown={e => { if (e.key === 'Escape' && open) { e.stopPropagation(); setOpen(false); } }}
  >i<span class="gi-def-pop" role="tooltip" aria-hidden="true">{text}</span></button>;
}

/** A disclosed, narrow safe-embed for the handful of genuine chart bodies
 *  that still come from Charts.* (histogram/scatter/zone-strip/small-
 *  multiples/radar) — a separate, pre-existing presentational module, not
 *  StatsEngine's own Reports markup, and these fragments carry no click-to-
 *  film wiring of their own (verified against source before choosing this).
 *  Every OTHER interactive element on a migrated tab is a real component. */
export function ChartBody({ note, html }) {
  if (!html) return null;
  return <div>{note ? <p class="viz-caption">{note}</p> : null}<div dangerouslySetInnerHTML={{ __html: html }} /></div>;
}

/**
 * The compact report empty state. `action` is optional; when present it is a
 * real command button, not a link — the caller passes the app's own navigation
 * command so there is never a second route mechanism. Deliberately short: it
 * sits at the top of the report and reserves no height, leaving the rest of the
 * route as ordinary background.
 */
export function EmptyState({ title, body, action = null }) {
  return <div class="gi-reports-empty">
    <div><h3>{title}</h3><p>{body}</p></div>
    {action ? <button type="button" class="gi-reports-empty-cta" onClick={action.onSelect}>{action.label}</button> : null}
  </div>;
}

/**
 * THE SECONDARY BAR (coach-approved comp
 * design-comps/reports-secondary-nav-2026-09-23). One component for every
 * multi-section report, rendered once directly under the fixed global strip.
 *
 *   - Left, SECONDARY NAVIGATION: this report's pages. A tab switches the
 *     visible page, the Special Teams / Players interaction.
 *   - Right, SCOPE: controls that filter this report (Current game first).
 *   - Right, REPORT EXPORT: this report's own full export. A page selection
 *     never narrows it.
 *
 * `sections` is [{ id, label, count?, none?, attrs? }]. `numbered` prefixes
 * each tab with its position (Offense, Defense). `scope` is
 * [{ id, label, active, onSelect, attrs? }] or null; `scopeExtra` renders
 * beside it (Players' game picker, Matchup's opponent select). `exportAction`
 * is { label, onSelect, attrs? } or null. `navClass` keeps a report's own
 * navigation hook on the bar that replaced its in-board navigation.
 */
export function SectionBar({ label, sections, active, onSelect, numbered = false, navClass = '',
  scope = null, scopeLabel = 'Scope', scopeExtra = null, exportAction = null, inline = false }) {
  if (!sections?.length && !scope && !scopeExtra && !exportAction) return null;
  return <div class={`gi-secbar${inline ? ' is-inline' : ''}`} data-reports-secbar-bar>
    <nav class={`gi-secbar-tabs ${navClass}`.trim()} role="tablist" aria-label={label}>
      {(sections || []).map((section, index) => {
        const on = section.id === active;
        return <button key={section.id} type="button" role="tab" aria-selected={on} aria-current={on ? 'true' : undefined}
          class={`gi-secbar-tab${on ? ' active' : ''}${section.none ? ' is-none' : ''}`} data-section={section.id}
               aria-label={section.count != null && section.count !== '' ? `${section.label} ${section.count}` : undefined}
          {...(section.attrs || {})} onClick={() => onSelect(section.id)}>
          {numbered ? <i>{index + 1}</i> : null}<span>{section.label}</span>
          {section.count != null && section.count !== '' ? <b>{section.count}</b> : null}
        </button>;
      })}
    </nav>
    {scope || scopeExtra || exportAction ? <div class="gi-secbar-right">
      {scope ? <div class="gi-secbar-scope" role="group" aria-label={`${label} scope`}>
        <span>{scopeLabel}</span>
        <div class="gi-secbar-seg">
          {scope.map(item => <button key={item.id} type="button" class={item.active ? 'active' : ''} aria-pressed={item.active}
            {...(item.attrs || {})} onClick={item.onSelect}>{item.label}</button>)}
        </div>
      </div> : null}
      {scopeExtra}
      {exportAction ? <button type="button" class="gi-secbar-export" {...(exportAction.attrs || {})}
        onClick={exportAction.onSelect}>{exportAction.label || 'Export report'}</button> : null}
    </div> : null}
  </div>;
}

/**
 * Where the bar renders. At the top level it portals into the route's one bar
 * host, directly under the global strip, so every report's bar has the same
 * position whatever the board below it does. A board embedded in another
 * report (Season's child boards) has no host and keeps the same bar inline.
 * The portal lives and dies with the board: a tab change unmounts it.
 *
 * It is core Preact, never preact/compat. Importing compat installs global
 * option hooks that turn every text and date input's onChange into onInput
 * across the whole app, which broke charting yardage, Study date ranges and
 * every other change-committed field the moment Reports loaded.
 */
function HostPortal({ host, children }) {
  useLayoutEffect(() => { render(children, host); });
  useLayoutEffect(() => () => render(null, host), [host]);
  return null;
}

export function ReportSectionBar({ screen, ...props }) {
  const host = screen?.sectionBarHost?.() || null;
  const bar = <SectionBar {...props} inline={!host} />;
  return host ? <HostPortal host={host}>{bar}</HostPortal> : bar;
}

/**
 * THE DOWN-AND-DISTANCE CHART (comp design-comps/reports-secondary-nav-
 * 2026-09-23). A fixed 4 x 3 grid - 1st to 4th down by 1-3, 4-6 and 7+ yards to
 * go - and a detail panel for the selected cell. Every value, every printed
 * string and the cohort sentence come from `StatsEngine.downDistanceChart` and
 * its formatters; this lays them out. An unfaced situation is a held dash and
 * cannot be selected. The selection is controller state per side, so a
 * re-render keeps it; with none, the busiest cell opens (football order breaks
 * a tie).
 */
export function DownDistanceChart({ chart, screen, side, title }) {
  const store = screen && Object.isExtensible(screen) ? (screen.ddSelection ||= {}) : {};
  const busiest = (chart?.cells || []).filter(cell => !cell.held)
    .reduce((best, cell) => (!best || cell.n > best.n ? cell : best), null);
  const [picked, setPicked] = useState(store[side]);
  const selected = chart?.cells.find(cell => cell.key === picked && !cell.held) || busiest;
  const choose = key => { store[side] = key; setPicked(key); };
  const fmt = StatsEngine.formatDownDistanceCell;
  const max = Math.max(1, ...(chart?.cells || []).map(cell => cell.n));
  const detail = selected ? fmt(selected) : null;
  const successLabel = side === 'defense' ? 'Opponent success' : 'Success';
  const yppLabel = side === 'defense' ? 'Yds/play allowed' : 'Yds/play';
  const rows = ['1', '2', '3', '4'];
  const ordinal = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' };
  return <section class="gi-dd" data-dd-chart={side} aria-label={title}>
    <header><strong>{title}</strong><span data-dd-cohort>{StatsEngine.downDistanceCohortLine(chart)}</span></header>
    <div class="gi-dd-body">
      <div class="gi-dd-grid" role="grid" aria-label={`${title} by down and yards to go`}>
        <i aria-hidden="true" />{['1-3', '4-6', '7+'].map(label => <i key={label} class="gi-dd-col">{label}</i>)}
        {rows.map(down => [<i key={`r${down}`} class="gi-dd-row">{ordinal[down]}</i>,
          ...chart.cells.filter(cell => cell.down === down).map(cell => {
            const text = fmt(cell);
            if (cell.held) return <div key={cell.key} class="gi-dd-cell is-held" data-dd-cell={cell.key} role="gridcell" aria-label={`${cell.label}: no snaps`}><span>-</span></div>;
            const on = selected?.key === cell.key;
            return <button key={cell.key} type="button" role="gridcell" class={`gi-dd-cell${on ? ' is-selected' : ''}`}
              data-dd-cell={cell.key} aria-pressed={on} style={`--v:${(cell.n / max).toFixed(3)}`}
              aria-label={`${cell.label}: ${text.plays} plays, ${text.split}, ${successLabel.toLowerCase()} ${text.success}, ${yppLabel.toLowerCase()} ${text.ypp}`}
              onClick={() => choose(cell.key)}>
              <strong data-dd-plays>{text.plays}</strong>
              <em class="gi-dd-mix" aria-hidden="true"><i style={`--n:${cell.runs}`} /><i style={`--n:${cell.passes}`} /></em>
              <small data-dd-split>{text.split}</small>
              <small><span data-dd-success>{text.success}</span> · <span data-dd-ypp>{text.ypp}</span></small>
            </button>;
          })])}
      </div>
      <aside class="gi-dd-detail" data-dd-detail>
        {selected ? <>
          <h4>{selected.label} <span>{detail.plays} plays</span></h4>
          <dl>
            <div><dt>Run / pass</dt><dd>{detail.split}</dd></div>
            <div><dt>{successLabel}</dt><dd>{detail.success}</dd><small>{selected.successEligible} of {selected.n} measurable</small></div>
            <div><dt>{yppLabel}</dt><dd>{detail.ypp}</dd><small>{selected.yardsMeasured} of {selected.n} with yardage</small></div>
          </dl>
          <p>Top play types{selected.typeTags > selected.n ? ` · ${selected.typeTags} tags on ${selected.n} snaps` : ''}</p>
          <ol data-dd-types>{selected.playTypes.slice(0, 3).map(type => <li key={type.name}><span>{type.name}</span><b>{type.n}</b></li>)}
            {selected.untyped ? <li class="is-muted"><span>No play type</span><b>{selected.untyped}</b></li> : null}</ol>
          {selected.refs.length
            ? <button type="button" class="gi-dd-watch" data-dd-watch
              onClick={() => screen?.watchRefs?.(selected.refs, `${selected.label} — ${title}`)}>Watch {selected.refs.length} plays</button>
            : null}
        </> : <p>No down and distance charted</p>}
      </aside>
    </div>
  </section>;
}
