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
import { useEffect, useMemo, useState } from 'preact/hooks';

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

/** A sortable data table. `columns`: [{key,label,align,numeric,sortValue,cellClass}]. `rows`:
 *  array of plain objects; each may carry `onActivate`/`label`/`id`. Sort
 *  state is local UI state — never touches football data or row identity. */
export function DataTable({ columns, rows, className = 'stats-table stats-table-full', emptyText = 'No data yet.' }) {
  const [sort, setSort] = useState(null); // {key, dir}
  const sorted = useMemo(() => {
    if (!sort) return rows;
    const col = columns.find(c => c.key === sort.key);
    const copy = rows.slice();
    copy.sort((a, b) => {
      const av = col?.sortValue ? col.sortValue(a) : a[sort.key];
      const bv = col?.sortValue ? col.sortValue(b) : b[sort.key];
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
  return <div class="gi-table-wrap"><table class={className}>
    <thead><tr>{columns.map(col => <th key={col.key}
      class={`${sort?.key === col.key ? `is-sorted is-${sort.dir}` : ''}${col.tl ? ' tl' : ''}`.trim()}
      onClick={() => toggle(col.key)}
      role="button" tabIndex={0}
      onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); toggle(col.key); } }}
    >{col.label}</th>)}</tr></thead>
    <tbody>{sorted.map((row, i) => <Watchable key={row.id ?? i} tag="tr" class={row.class} onActivate={row.onActivate} label={row.label}>
      {columns.map(col => <td key={col.key} data-col={col.key}
        class={[col.tl ? 'tl' : '', typeof col.cellClass === 'function' ? col.cellClass(row) : col.cellClass || ''].filter(Boolean).join(' ') || undefined}
      >{col.render ? col.render(row) : row[col.key]}</td>)}
    </Watchable>)}</tbody>
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
 * A zone header. Offense carries roughly three times as many bands as Overview,
 * so the board needs a scan structure Overview's four bands never required.
 * Same type, colour and geometry as every other module header — the only new
 * thing is the level in the hierarchy.
 */
export function ZoneRule({ id, title, label, note = null }) {
  return <div class="gi-zone-rule" id={id}>
    <h2>{title}</h2>{label ? <p>{label}</p> : null}{note ? <em>{note}</em> : null}
  </div>;
}

/**
 * Secondary navigation for a long report. Real buttons with a stable hit area,
 * hover, `:focus-visible`, and an active state that follows the coach down the
 * page via IntersectionObserver — the observer is disconnected on unmount, and
 * a route/tab/game/season/perspective change unmounts this component, so the
 * active zone resets by construction rather than by a reset call.
 *
 * `zones` is [{ id, label }]. Jumping honours `prefers-reduced-motion`.
 */
export function ZoneNav({ zones, ariaLabel = 'Report sections' }) {
  const [active, setActive] = useState(zones[0]?.id || null);
  useEffect(() => {
    const targets = zones.map(zone => document.getElementById(zone.id)).filter(Boolean);
    if (!targets.length || typeof IntersectionObserver !== 'function') return undefined;
    // A zone counts as current once its header crosses the upper third of the
    // scroller; the last one to cross wins, which is what reading down the page
    // feels like. rootMargin keeps a zone current while its body is on screen.
    const observer = new IntersectionObserver(entries => {
      const visible = entries.filter(entry => entry.isIntersecting)
        .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
      if (visible.length) setActive(visible[0].target.id);
    }, { rootMargin: '-72px 0px -62% 0px', threshold: 0 });
    targets.forEach(target => observer.observe(target));
    return () => observer.disconnect();
  }, [zones.map(zone => zone.id).join('|')]);
  const jump = id => {
    const target = document.getElementById(id);
    if (!target) return;
    setActive(id);
    const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
    target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
  };
  return <nav class="gi-zone-nav" aria-label={ariaLabel}>
    {zones.map((zone, index) => <button
      key={zone.id}
      type="button"
      class={`gi-zone-nav-item${active === zone.id ? ' is-active' : ''}`}
      data-zone-jump={zone.id}
      aria-current={active === zone.id ? 'true' : undefined}
      onClick={() => jump(zone.id)}
    ><b>{index + 1}</b>{zone.label}</button>)}
  </nav>;
}
