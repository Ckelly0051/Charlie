import { render } from 'preact';
import { useEffect, useMemo, useState } from 'preact/hooks';
import { ReportBuilder } from './report-builder.js';
import '../css/native-report-builder.css';

/* Dashboards (docs/REPORTS-CONTRACTS.md > Dashboards). ReportBuilderScreen
   owns state and persistence; ReportBuilder owns every number. This file only
   lays them out. Every value with film opens it. */

const fmt = (value, format) => ReportBuilder.format(value, format);
const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
const stateNote = cell => cell.state === 'insufficient' ? 'Small sample' : cell.state === 'unavailable' ? (cell.reason || 'Not charted') : '';

function UnitClass(unit) {
  return unit === 'defense' ? 'is-defense' : unit === 'special' ? 'is-special' : unit === 'all' ? 'is-all' : 'is-offense';
}

function Segment({ label, options, value, onChoose }) {
  return <div class="gi-rb-segment" role="group" aria-label={label}>
    {options.map(([id, name]) => <button key={id} type="button" aria-pressed={value === id} onClick={() => onChoose(id)}>{name}</button>)}
  </div>;
}

function DimensionSelect({ catalog, value, onChange, label, allowNone = false }) {
  return <label class="gi-rb-field"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.currentTarget.value)}>
      {allowNone && <option value="">None</option>}
      {catalog.map(section => <optgroup key={section.group} label={section.group}>
        {section.items.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
      </optgroup>)}
    </select>
  </label>;
}

function MetricSelect({ value, onChange, unit, label = 'Metric' }) {
  const groups = [...new Set(ReportBuilder.METRICS.map(item => item.group))];
  return <label class="gi-rb-field"><span>{label}</span>
    <select value={value} onChange={event => onChange(event.currentTarget.value)}>
      {groups.map(group => <optgroup key={group} label={group}>
        {ReportBuilder.METRICS.filter(item => item.group === group).map(item => <option key={item.id} value={item.id}>{ReportBuilder.metricName(item.id, unit)}</option>)}
      </optgroup>)}
    </select>
  </label>;
}

/* ---- Filters ------------------------------------------------------------- */

function FilterPicker({ screen, catalog, filters, onApply, onClose, label = 'Add filter' }) {
  const [dimension, setDimension] = useState(catalog[0]?.items[0]?.id || '');
  const values = useMemo(() => screen.filterValues(dimension), [dimension]);
  const current = filters.find(item => item.dimension === dimension)?.values || [];
  const [chosen, setChosen] = useState(new Set(current));
  useEffect(() => setChosen(new Set(filters.find(item => item.dimension === dimension)?.values || [])), [dimension]);
  const toggle = value => setChosen(prev => { const next = new Set(prev); next.has(value) ? next.delete(value) : next.add(value); return next; });
  return <div class="gi-rb-filter-picker" role="group" aria-label={label} data-rb-filter-picker>
    <DimensionSelect catalog={catalog} value={dimension} onChange={setDimension} label="Filter by" />
    <div class="gi-rb-filter-values">
      {values.length ? values.map(item => <label key={item.value} class="gi-rb-check">
        <input type="checkbox" checked={chosen.has(item.value)} onChange={() => toggle(item.value)} />
        <span>{item.label}</span><small>{item.n}</small>
      </label>) : <p class="gi-rb-muted">No charted values in this scope.</p>}
    </div>
    <div class="gi-rb-row-actions">
      <button type="button" onClick={onClose}>Cancel</button>
      <button type="button" class="is-primary" onClick={() => onApply(dimension, [...chosen])}>Apply</button>
    </div>
  </div>;
}

function FilterChips({ filters, dimensionName, labels, onRemove }) {
  return filters.map(filter => <span key={filter.dimension} class="gi-rb-chip" data-rb-filter={filter.dimension}>
    <strong>{dimensionName(filter.dimension)}:</strong> {filter.values.map(value => ReportBuilder.valueLabel(filter.dimension, value, labels)).join(', ')}
    <button type="button" aria-label={`Remove ${dimensionName(filter.dimension)} filter`} onClick={() => onRemove(filter.dimension)}>×</button>
  </span>);
}

/* ---- Views --------------------------------------------------------------- */

function Watch({ screen, refs, label, children, style, class: className = 'gi-rb-watch' }) {
  if (!refs?.length) return <span class={className} style={style}>{children}</span>;
  return <button type="button" class={className} style={style} title={`Watch ${plural(refs.length, 'play')}`} onClick={() => screen.watch(refs, label)}>{children}</button>;
}

function KpiView({ screen, data }) {
  const { current, baseline } = data;
  const delta = current.state !== 'unavailable' && baseline && baseline.value != null && current.value != null ? current.value - baseline.value : null;
  const better = delta == null || delta === 0 || current.polarity === 'neutral' ? '' : (delta > 0) === (current.polarity !== 'lower') ? 'is-better' : 'is-worse';
  return <div class="gi-rb-kpi">
    <Watch screen={screen} refs={current.refs} label={data.title} class="gi-rb-kpi-value">{fmt(current.value, current.format)}</Watch>
    <div class="gi-rb-kpi-meta">
      {current.format !== 'count' && <span>{plural(current.n, 'play')}</span>}
      {stateNote(current) && <span class="gi-rb-note">{stateNote(current)}</span>}
      {delta != null && <span class={['gi-rb-delta', better].filter(Boolean).join(' ')}>{delta > 0 ? '+' : ''}{fmt(delta, current.format)} vs {data.baselineLabel}</span>}
    </div>
  </div>;
}

const noneCharted = name => <p class="gi-rb-empty">No {name} charted in this scope.</p>;

function BarView({ screen, data }) {
  if (!data.rows.length) return noneCharted(data.dimensionName);
  const values = data.rows.flatMap(row => [row.value, row.baseline]).filter(value => value != null);
  const lo = Math.min(0, ...values), hi = Math.max(0, data.scaleMax ?? 0, ...values);
  const span = hi - lo;
  const at = value => span > 0 ? (value - lo) / span * 100 : 0;
  const zero = at(0);
  const fill = value => {
    if (value == null || span <= 0) return { left: `${zero}%`, width: '0%' };
    const end = at(value);
    return { left: `${Math.min(zero, end)}%`, width: `${Math.max(Math.abs(end - zero), 1)}%` };
  };
  const marked = data.rows.some(row => row.baseline != null);
  return <div class="gi-rb-bar-view">
  <ol class="gi-rb-bars">{data.rows.map(row => <li key={row.value} class={[row.state === 'ok' ? '' : 'is-thin', row.value < 0 ? 'is-negative' : ''].filter(Boolean).join(' ')}>
    <span class="gi-rb-bar-label">{row.label}</span>
    <Watch screen={screen} refs={row.refs} label={`${data.title}: ${row.label}`} class="gi-rb-bar-track">
      <span class="gi-rb-bar-fill" style={fill(row.value)} />
      {lo < 0 && <span class="gi-rb-bar-zero" style={{ left: `${zero}%` }} />}
      {row.baseline != null && span > 0 && <span class="gi-rb-bar-mark" title={`${data.baselineLabel}: ${fmt(row.baseline, row.format)}`}
        style={{ left: `${at(row.baseline)}%` }} />}
    </Watch>
    <span class="gi-rb-bar-value">{fmt(row.value, row.format)}</span>
    <small class="gi-rb-bar-n">{row.n}</small>
  </li>)}</ol>
  {marked && <p class="gi-rb-muted"><span class="gi-rb-mark-key" /> {data.baselineLabel}</p>}
  </div>;
}

const SHARE_TONES = ['gi-rb-tone-1', 'gi-rb-tone-2', 'gi-rb-tone-3', 'gi-rb-tone-4', 'gi-rb-tone-5'];
function ShareView({ screen, data }) {
  if (!data.rows.length) return noneCharted(`${data.dimensionName} with ${data.splitName}`);
  const tone = value => value === ReportBuilder.OTHER ? SHARE_TONES[SHARE_TONES.length - 1] : SHARE_TONES[Math.max(0, data.keys.indexOf(value))];
  return <div class="gi-rb-share">
    <ul class="gi-rb-legend">{data.keys.map(key => <li key={key}><span class={['gi-rb-swatch', tone(key)].join(' ')} />{data.keyLabels?.[key] || key}</li>)}</ul>
    <ol class="gi-rb-share-rows">{data.rows.map(row => <li key={row.value}>
      <span class="gi-rb-bar-label">{row.label}</span>
      <span class="gi-rb-share-track">{row.parts.map(part => <Watch key={part.value} screen={screen} refs={part.refs} label={`${row.label}: ${part.label}`}
        class={['gi-rb-share-part', tone(part.value)].join(' ')} style={{ flexBasis: `${part.share}%` }}>{part.share >= 12 ? `${part.whole}%` : ''}</Watch>)}</span>
      <small class="gi-rb-bar-n">{row.n}</small>
    </li>)}</ol>
  </div>;
}

function TrendView({ screen, data }) {
  const rows = data.rows;
  if (!rows.length) return <p class="gi-rb-empty">{data.reason || 'No games with plays in this scope.'}</p>;
  const values = rows.map(row => row.value).filter(value => value != null);
  const lo = Math.min(...values, 0), hi = Math.max(...values, 1);
  // Percent positions: the line is drawn in a stretched 100x100 box with a
  // non-scaling stroke, and points and labels are HTML so their text never
  // scales below the type floor.
  // Each game sits at the center of its own tick column.
  const x = i => (i + 0.5) / rows.length * 100;
  const y = v => 8 + (1 - (v - lo) / (hi - lo || 1)) * 80;
  const path = rows.map((row, i) => row.value == null ? null : [x(i), y(row.value)]).filter(Boolean)
    .map((p, i) => `${i ? 'L' : 'M'}${p[0].toFixed(2)},${p[1].toFixed(2)}`).join(' ');
  return <div class="gi-rb-trend" role="group" aria-label={data.title}>
    <div class="gi-rb-trend-plot">
      <svg class="gi-rb-trend-line" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true"><path d={path} /></svg>
      {rows.map((row, i) => row.value != null && <Watch key={row.value} screen={screen} refs={row.refs} label={`${data.title}: ${row.label}`}
        class={row.state === 'ok' ? 'gi-rb-point' : 'gi-rb-point is-thin'} style={{ left: `${x(i)}%`, top: `${y(row.value)}%` }}>
        <span>{fmt(row.value, row.format)}</span>
      </Watch>)}
    </div>
    <ol class="gi-rb-trend-ticks" style={{ gridTemplateColumns: `repeat(${rows.length}, minmax(0, 1fr))` }}>
      {rows.map(row => <li key={row.value} title={row.label}>{row.label}<small>{row.n}</small></li>)}
    </ol>
  </div>;
}

function MatrixView({ screen, data }) {
  if (!data.rows.length || !data.columns.length) return noneCharted(`${data.dimensionName} with ${data.dimension2Name}`);
  const ok = data.rows.flatMap(row => row.cells).filter(cell => cell.state === 'ok' && cell.value != null).map(cell => cell.value);
  const lo = Math.min(...ok), hi = Math.max(...ok);
  const heat = cell => {
    if (cell.state !== 'ok' || cell.value == null || !ok.length) return 0;
    const t = hi === lo ? 0.5 : (cell.value - lo) / (hi - lo);
    return cell.polarity === 'lower' ? 1 - t : t;
  };
  const polarity = data.rows.flatMap(row => row.cells).find(cell => cell.polarity)?.polarity;
  return <div class="gi-rb-matrix-wrap">
    <table class="gi-rb-matrix">
      <thead><tr><th scope="col">{data.dimensionName}</th>{data.columns.map(col => <th key={col.value} scope="col">{col.label}</th>)}</tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.value}><th scope="row">{row.label}</th>
        {row.cells.map(cell => <td key={cell.column} style={{ '--rb-heat': heat(cell).toFixed(2) }} class={cell.state === 'ok' ? '' : 'is-thin'}>
          <Watch screen={screen} refs={cell.refs} label={`${row.label} × ${cell.columnLabel}`} class="gi-rb-cell">
            <span>{fmt(cell.value, cell.format)}</span><small>{cell.n}</small>
          </Watch>
        </td>)}</tr>)}</tbody>
    </table>
    <p class="gi-rb-muted">{polarity === 'neutral' ? 'Brighter is higher' : 'Brighter is better'}</p>
  </div>;
}

function TableView({ screen, data }) {
  if (!data.rows.length) return noneCharted(data.dimensionName);
  return <div class="gi-rb-table-wrap">
    <table class="gi-rb-table">
      <thead><tr><th scope="col">{data.dimensionName}</th>{data.columns.map(col => <th key={col.id} scope="col">{col.name}</th>)}</tr></thead>
      <tbody>{data.rows.map(row => <tr key={row.value}><th scope="row">{row.label}</th>
        {row.cells.map(cell => <td key={cell.id} class={cell.state === 'ok' ? '' : 'is-thin'}>
          <Watch screen={screen} refs={cell.refs} label={`${row.label}: ${cell.id}`} class="gi-rb-cell">{fmt(cell.value, cell.format)}</Watch>
        </td>)}</tr>)}</tbody>
    </table>
  </div>;
}

function LeadersView({ screen, data }) {
  if (!data.rows.length) return <p class="gi-rb-empty">No player credited in this scope.</p>;
  const max = Math.max(...data.rows.map(row => row.metric));
  return <ol class="gi-rb-bars is-leaders">{data.rows.map((row, i) => <li key={row.value}>
    <span class="gi-rb-bar-label"><b>{i + 1}</b> {row.label}</span>
    <Watch screen={screen} refs={row.refs} label={`${data.metricName}: ${row.label}`} class="gi-rb-bar-track">
      <span class="gi-rb-bar-fill" style={{ width: `${Math.max(2, row.metric / max * 100)}%` }} />
    </Watch>
    <span class="gi-rb-bar-value">{row.metric}</span>
  </li>)}</ol>;
}

const VIEWS = { kpi: KpiView, bar: BarView, share: ShareView, trend: TrendView, matrix: MatrixView, table: TableView, leaders: LeadersView };

function WidgetBody({ screen, data }) {
  if (!data) return null;
  if (data.error) return <p class="gi-rb-empty" role="alert">{data.error}</p>;
  const View = VIEWS[data.view];
  return View ? <View screen={screen} data={data} /> : null;
}

const WIDTH_CLASS = { s: 'is-w4', m: 'is-w6', l: 'is-w12' };

function WidgetCard({ screen, data, index, count }) {
  const close = event => event.currentTarget.closest('details')?.removeAttribute('open');
  return <article class={['gi-rb-card', WIDTH_CLASS[data.width] || 'is-w6'].join(' ')} data-rb-widget={data.id} data-rb-view={data.view}>
    <header class="gi-rb-card-head">
      <h3>{data.title}</h3>
      <div class="gi-rb-card-actions">
        <span class="gi-rb-muted">{plural(data.total ?? 0, 'play')}</span>
        <button type="button" onClick={() => screen.editWidget(data.id)}>Edit</button>
        <details class="gi-rb-menu">
          <summary aria-label={`More for ${data.title}`}>More</summary>
          <div role="menu">
            {ReportBuilder.WIDTHS.map(([id, name]) => <button key={id} type="button" role="menuitem" aria-pressed={data.width === id}
              onClick={event => { close(event); screen.resizeWidget(data.id, id); }}>{name} width</button>)}
            <button type="button" role="menuitem" disabled={index === 0} onClick={event => { close(event); screen.moveWidget(data.id, -1); }}>Move earlier</button>
            <button type="button" role="menuitem" disabled={index === count - 1} onClick={event => { close(event); screen.moveWidget(data.id, 1); }}>Move later</button>
            <button type="button" role="menuitem" onClick={event => { close(event); screen.duplicateWidget(data.id); }}>Duplicate</button>
            <button type="button" role="menuitem" class="is-risk" onClick={event => { close(event); screen.removeWidget(data.id); }}>Remove</button>
          </div>
        </details>
      </div>
    </header>
    <WidgetBody screen={screen} data={data} />
  </article>;
}

/* ---- Editor -------------------------------------------------------------- */

export function WidgetEditor({ screen, widget, isNew, onSave, onCancel }) {
  const [draft, setDraft] = useState(widget);
  const [picking, setPicking] = useState(false);
  const unit = screen.active().unit;
  const catalog = screen.builder.dimensionCatalog();
  const set = patch => setDraft(prev => ({ ...prev, ...patch }));
  const preview = useMemo(() => screen.preview(draft), [JSON.stringify(draft)]);
  const view = draft.view;
  const needs = id => ReportBuilder.view(view)?.needs.includes(id);
  const usesMetric = ['kpi', 'bar', 'trend', 'matrix'].includes(view);
  const toggleMetric = id => set({ metrics: draft.metrics.includes(id) ? draft.metrics.filter(item => item !== id) : [...draft.metrics, id] });
  const firstDimension = catalog[0]?.items[0]?.id || 'down';
  const chooseView = id => set({ view: id,
    dimension: ReportBuilder.view(id).needs.includes('dimension') && !draft.dimension ? firstDimension : draft.dimension,
    dimension2: id === 'matrix' && !draft.dimension2 ? 'fieldZone' : draft.dimension2,
    split: id === 'share' && !draft.split ? 'runPass' : draft.split });
  return <div class={['gi-rb-editor', UnitClass(unit)].join(' ')} data-report-widget-editor>
    <div class="gi-rb-editor-form">
      <div class="gi-rb-field"><span>View</span>
        <div class="gi-rb-segment is-wrap" role="group" aria-label="View">
          {ReportBuilder.VIEWS.map(item => <button key={item.id} type="button" aria-pressed={view === item.id} onClick={() => chooseView(item.id)}>{item.name}</button>)}
        </div>
      </div>
      <label class="gi-rb-field"><span>Title</span>
        <input type="text" value={draft.title} placeholder={screen.builder.title({ ...draft, title: '' }, unit)} onInput={event => set({ title: event.currentTarget.value })} />
      </label>
      {usesMetric && <MetricSelect value={draft.metric} unit={unit} onChange={metric => set({ metric })} />}
      {view === 'table' && <div class="gi-rb-field"><span>Columns</span>
        <div class="gi-rb-checks">{ReportBuilder.METRICS.map(item => <label key={item.id} class="gi-rb-check">
          <input type="checkbox" checked={draft.metrics.includes(item.id)} onChange={() => toggleMetric(item.id)} />
          <span>{ReportBuilder.metricName(item.id, unit)}</span>
        </label>)}</div>
      </div>}
      {view === 'table' && <label class="gi-rb-field"><span>Sort by</span>
        <select value={draft.sort} onChange={event => set({ sort: event.currentTarget.value })}>
          <option value="">Grouping order</option>
          {draft.metrics.map(id => <option key={id} value={id}>{ReportBuilder.metricName(id, unit)}</option>)}
        </select>
      </label>}
      {needs('dimension') && <DimensionSelect catalog={catalog} value={draft.dimension} label={view === 'matrix' ? 'Rows' : 'Group by'} onChange={dimension => set({ dimension })} />}
      {needs('dimension2') && <DimensionSelect catalog={catalog} value={draft.dimension2} label="Columns" onChange={dimension2 => set({ dimension2 })} />}
      {needs('split') && <DimensionSelect catalog={catalog} value={draft.split} label="Split by" onChange={split => set({ split })} />}
      {view === 'leaders' && <label class="gi-rb-field"><span>Leaders in</span>
        <select value={draft.leader} onChange={event => set({ leader: event.currentTarget.value })}>
          {ReportBuilder.LEADERS.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select>
      </label>}
      <div class="gi-rb-field-row">
        <div class="gi-rb-field"><span>Width</span>
          <Segment label="Width" options={ReportBuilder.WIDTHS} value={draft.width} onChoose={width => set({ width })} />
        </div>
        {view !== 'kpi' && view !== 'trend' && <label class="gi-rb-field is-narrow"><span>Row limit</span>
          <input type="number" min="1" max="40" value={draft.limit} onChange={event => set({ limit: Math.max(1, Math.min(40, parseInt(event.currentTarget.value, 10) || 12)) })} />
        </label>}
        <label class="gi-rb-field is-narrow"><span>Small sample under</span>
          <input type="number" min="0" max="50" value={draft.minSample} onChange={event => set({ minSample: Math.max(0, Math.min(50, parseInt(event.currentTarget.value, 10) || 0)) })} />
        </label>
      </div>
      <div class="gi-rb-field"><span>Widget filters</span>
        <div class="gi-rb-chips">
          <FilterChips filters={draft.filters} dimensionName={id => screen.builder.dimensionName(id)} labels={{}}
            onRemove={dimension => set({ filters: draft.filters.filter(item => item.dimension !== dimension) })} />
          {!picking && <button type="button" class="gi-rb-add" onClick={() => setPicking(true)}>Add filter</button>}
        </div>
        {picking && <FilterPicker screen={screen} catalog={catalog} filters={draft.filters} label="Widget filter"
          onClose={() => setPicking(false)}
          onApply={(dimension, values) => { set({ filters: [...draft.filters.filter(item => item.dimension !== dimension), ...(values.length ? [{ dimension, values }] : [])] }); setPicking(false); }} />}
      </div>
    </div>
    <section class="gi-rb-editor-preview" aria-label="Preview">
      <h4>Preview</h4>
      {preview && <article class="gi-rb-card is-w12"><header class="gi-rb-card-head"><h3>{preview.title}</h3>
        <span class="gi-rb-muted">{plural(preview.total ?? 0, 'play')}</span></header>
        <WidgetBody screen={screen} data={preview} /></article>}
    </section>
    <footer class="gi-rb-editor-actions">
      <button type="button" onClick={onCancel}>Cancel</button>
      <button type="button" class="is-primary" data-rb-save onClick={() => onSave(draft)}>{screen.isTemplate() ? 'Save as new dashboard' : isNew ? 'Add widget' : 'Save widget'}</button>
    </footer>
  </div>;
}

/* ---- The board ------------------------------------------------------------- */

const UNIT_NAMES = Object.fromEntries(ReportBuilder.UNITS);
const SCOPE_NAMES = Object.fromEntries(ReportBuilder.SCOPES);
const describe = item => [UNIT_NAMES[item.unit], SCOPE_NAMES[item.scope], plural(item.widgets, 'widget')].join(' · ');

function DashboardRow({ item, onOpen, onDelete, template }) {
  return <li class={['gi-rb-home-row', UnitClass(item.unit)].join(' ')} data-rb-row={template ? `template:${item.id}` : item.id}>
    <div class="gi-rb-home-name"><strong>{item.name}</strong><span>{describe(item)}</span></div>
    <div class="gi-rb-home-actions">
      <button type="button" class="is-primary" onClick={onOpen}>Open</button>
      {onDelete && <button type="button" class="is-risk" onClick={onDelete}>Delete</button>}
    </div>
  </li>;
}

function NavIcon({ name }) {
  return <svg class="gi-reports-icon" aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;
}

/** The Dashboards strip: back to the Dashboards home, Prev / Next through the
 *  home page's order, and Go to reports set apart at the far end. */
function DashboardsNav({ screen, state }) {
  const open = !!state.dashboard;
  return <nav class="gi-rb-nav" aria-label="Dashboards" data-rb-nav>
    {open
      ? <button type="button" class="gi-reports-back" data-rb-home-link onClick={() => screen.home()}><NavIcon name="prev-clip" />Back to dashboards</button>
      : <span class="gi-rb-nav-label">Dashboards</span>}
    {open && <div class="gi-rb-step">
      <button type="button" data-rb-prev disabled={!state.hasPrev} onClick={() => screen.step(-1)}>Prev</button>
      <button type="button" data-rb-next disabled={!state.hasNext} onClick={() => screen.step(1)}>Next</button>
    </div>}
    <button type="button" class="gi-reports-back gi-rb-to-reports" data-rb-to-reports onClick={() => screen.toReports()}>Go to reports</button>
  </nav>;
}

/** Dashboards home: the saved dashboards and the templates, always reachable. */
function DashboardsHome({ screen, state }) {
  return <div class="gi-rb-home" data-rb-home>
    <header class="gi-rb-home-head">
      <h2>Dashboards</h2>
      <button type="button" class="is-primary" data-rb-new onClick={() => screen.createBlank()}>New dashboard</button>
    </header>
    <section class="gi-rb-home-section" aria-label="Saved dashboards">
      <h3>Saved</h3>
      {state.dashboards.length
        ? <ol class="gi-rb-home-list">{state.dashboards.map(item => <DashboardRow key={item.id} item={item}
            onOpen={() => screen.open(item.id)} onDelete={() => screen.remove(item.id)} />)}</ol>
        : <p class="gi-rb-muted">No saved dashboards</p>}
    </section>
    <section class="gi-rb-home-section" aria-label="Templates">
      <h3>Templates</h3>
      <ol class="gi-rb-home-list">{state.templates.map(item => <DashboardRow key={item.id} item={item} template
        onOpen={() => screen.openTemplate(item.id)} />)}</ol>
    </section>
  </div>;
}

export function NativeReportBuilder({ screen }) {
  const [state, setState] = useState(() => screen.snapshot());
  const [picking, setPicking] = useState(false);
  // Re-read on subscribe: a change made before this effect ran is not missed.
  useEffect(() => { const off = screen.subscribe(setState); setState(screen.snapshot()); return off; }, [screen]);
  const { dashboard, result } = state;
  if (!dashboard) return <><DashboardsNav screen={screen} state={state} /><div class="gi-rb" data-report-builder><DashboardsHome screen={screen} state={state} /></div></>;
  return <><DashboardsNav screen={screen} state={state} /><div class={['gi-rb', UnitClass(dashboard.unit)].join(' ')} data-report-builder>
    <div class="gi-rb-toolbar">
      <div class="gi-rb-title">
        <h2>{dashboard.name}</h2>
        {state.isTemplate && <span class="gi-rb-tag">Template</span>}
      </div>
      <div class="gi-rb-toolbar-actions">
        <button type="button" data-rb-export onClick={() => { screen.exportHtml(); }}>Export</button>
        {state.isTemplate
          ? <button type="button" data-rb-save-as onClick={() => screen.saveTemplateAs()}>Save as new</button>
          : <>
            <button type="button" onClick={() => screen.rename()}>Rename</button>
            <button type="button" onClick={() => screen.duplicate()}>Duplicate</button>
            <button type="button" class="is-risk" onClick={() => screen.remove()}>Delete</button>
          </>}
        <button type="button" class="is-primary" data-rb-add-widget onClick={() => screen.editWidget()}>Add widget</button>
      </div>
    </div>
    <div class="gi-rb-filters">
      <Segment label="Scope" options={ReportBuilder.SCOPES} value={dashboard.scope} onChoose={scope => screen.setScope(scope)} />
      <Segment label="Unit" options={ReportBuilder.UNITS} value={dashboard.unit} onChoose={unit => screen.setUnit(unit)} />
      <div class="gi-rb-chips">
        <FilterChips filters={dashboard.filters} dimensionName={state.dimensionName} labels={state.labels} onRemove={dimension => screen.setFilter(dimension, [])} />
        {!picking && <button type="button" class="gi-rb-add" data-rb-add-filter onClick={() => setPicking(true)}>Add filter</button>}
      </div>
      <Watch screen={screen} refs={result.refs} label={dashboard.name} class="gi-rb-total">{plural(result.plays, 'play')}</Watch>
    </div>
    {picking && <FilterPicker screen={screen} catalog={state.dimensions} filters={dashboard.filters}
      onClose={() => setPicking(false)} onApply={(dimension, values) => { screen.setFilter(dimension, values); setPicking(false); }} />}
    {result.widgets.length
      ? <div class="gi-rb-grid">{result.widgets.map((data, index) => <WidgetCard key={data.id} screen={screen} data={data} index={index} count={result.widgets.length} />)}</div>
      : <section class="gi-rb-start"><h2>No widgets yet</h2>
          <button type="button" class="is-primary" onClick={() => screen.editWidget()}>Add widget</button></section>}
  </div></>;
}

export function mountReportBuilder({ host, screen }) {
  if (!host || !screen) throw new Error('Dashboards need a host and a controller.');
  render(<NativeReportBuilder screen={screen} />, host);
}
