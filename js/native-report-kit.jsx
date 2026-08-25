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
import { useMemo, useState } from 'preact/hooks';

export function KpiBand({ items }) {
  if (!items?.length) return null;
  return <div class="gi-overview-kpis">
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

export function Module({ title, meta, cls = '', children }) {
  return <section class={`gi-overview-module ${cls}`}>
    <header><strong>{title}</strong>{meta ? <span>{meta}</span> : null}</header>
    {children}
  </section>;
}

export function RowList({ rows }) {
  return <div class="gi-overview-rows">{rows.map(([label, value, cls], i) => <div key={i}>
    <span>{label}</span><strong class={cls || ''}>{value}</strong>
  </div>)}</div>;
}

/** A sortable data table. `columns`: [{key,label,align,numeric}]. `rows`:
 *  array of plain objects; each may carry `onActivate`/`label`/`id`. Sort
 *  state is local UI state — never touches football data or row identity. */
export function DataTable({ columns, rows, className = 'stats-table stats-table-full', emptyText = 'No data yet.' }) {
  const [sort, setSort] = useState(null); // {key, dir}
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = a[sort.key], bv = b[sort.key];
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
  return <div class="gi-table-wrap"><table class={className}>
    <thead><tr>{columns.map(col => <th key={col.key}
      class={sort?.key === col.key ? `is-sorted is-${sort.dir}` : ''}
      onClick={() => toggle(col.key)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(col.key); } }}
    >{col.label}</th>)}</tr></thead>
    <tbody>{sorted.map((row, i) => <Watchable key={row.id ?? i} tag="tr" onActivate={row.onActivate} label={row.label}>
      {columns.map(col => <td key={col.key} data-col={col.key}>{col.render ? col.render(row) : row[col.key]}</td>)}
    </Watchable>)}</tbody>
  </table></div>;
}

/** A grid of click-to-film tiles (Situational, Big Plays quick answers). */
export function TileGrid({ tiles, cls = '' }) {
  return <div class={`gi-overview-tiles ${cls}`}>{tiles.map((tile, i) => <Watchable key={i} onActivate={tile.onActivate} label={tile.label}>
    <span>{tile.title}</span><strong>{tile.value}</strong><small>{tile.sub}</small>
  </Watchable>)}</div>;
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

/** A DIFFERENT, narrower case than ChartBody: legacy HTML that owns genuine
 *  interactive behavior of its own (HeatMaps' multi-tab picker, whose tab
 *  switching and click-to-film wiring live in `heatMaps.bind(node)`, the
 *  same call `_bindContent`'s rebind pass used to make). `bind` runs via a
 *  ref callback exactly once per HTML change — never on every re-render —
 *  mirroring `ReportPane`'s own `LegacyHtml` idempotence guard. Reserved for
 *  the specific, disclosed widgets that still need it; not a general escape
 *  hatch. */
export function LegacyWidget({ html, bind }) {
  if (!html) return null;
  return <div ref={el => {
    if (!el || el.__lastHtml === html) return;
    el.innerHTML = html;
    el.__lastHtml = html;
    try { bind?.(el); } catch { /* a disabled/missing owner must not break the tab */ }
  }} />;
}

export function EmptyState({ title, body }) {
  return <div class="stats-section gi-reports-empty"><h3>{title}</h3><p>{body}</p></div>;
}
