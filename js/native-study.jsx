import { render } from 'preact';
import { useMemo, useRef, useState } from 'preact/hooks';
import { StudyPlanPicker } from './native-study-plan-picker.jsx';
import { buildStudyView } from './study-view.js';

function GroupedOptions({ ids, groups, nameOf }) {
  const used = new Set();
  const blocks = groups.map(group => {
    const members = group.ids.filter(id => ids.includes(id)); members.forEach(id => used.add(id));
    return members.length ? <optgroup label={group.name}>{members.map(id => <option value={id}>{nameOf(id) || id}</option>)}</optgroup> : null;
  });
  const rest = ids.filter(id => !used.has(id));
  if (rest.length) blocks.push(<optgroup label="Other">{rest.map(id => <option value={id}>{nameOf(id) || id}</option>)}</optgroup>);
  return blocks;
}

function Field({ label, children, hint, id }) { return <label id={id}>{label}{children}{hint ? <small>{hint}</small> : null}</label>; }

function Filters({ screen, state, setState }) {
  const dimensions = screen._filterDimensions();
  const update = (index, patch) => setState(old => ({ ...old, filters: old.filters.map((f, i) => i === index ? { ...f, ...patch } : f) }));
  return <div class="ws-study-filters">
    <div class="ws-study-filter-head"><strong>Filters</strong><span>Values within a filter use OR. Filters combine with AND.</span>
      <button class="ws-link" data-study-action="add-filter" onClick={() => setState(old => ({ ...old, filters: [...old.filters, { dimension: 'down', values: [] }] }))}>+ Add filter</button>
      <button class="ws-link" data-study-action="clear-filters" hidden={!state.filters.length} onClick={() => setState(old => ({ ...old, filters: [] }))}>Clear</button>
    </div>
    {state.filters.map((filter, index) => {
      const available = screen._filterValues(filter.dimension, state).filter(value => !filter.values.includes(value));
      return <div class="ws-study-filter-row" key={`${index}-${filter.dimension}`}>
        <select data-study-filter-dimension={index} aria-label="Filter dimension" value={filter.dimension} onChange={e => update(index, { dimension: e.currentTarget.value, values: [] })}>{dimensions.map(item => <option value={item.id}>{item.name}</option>)}</select>
        <div class="ws-study-filter-values">{filter.values.length ? filter.values.map((value, valueIndex) => <button class="ws-study-filter-chip" title={`Remove ${value}`} onClick={() => update(index, { values: filter.values.filter((_, i) => i !== valueIndex) })}>{value} ×</button>) : <span>Any value</span>}</div>
        <select data-study-filter-value={index} aria-label="Add filter value" value="" onChange={e => { const value = e.currentTarget.value; if (value) update(index, { values: [...filter.values, value] }); }}><option value="">Add value…</option>{available.map(value => <option value={value}>{value}</option>)}</select>
        <button class="ws-icon-btn" data-study-filter-remove={index} aria-label="Remove filter" onClick={() => setState(old => ({ ...old, filters: old.filters.filter((_, i) => i !== index) }))}>×</button>
      </div>;
    })}
  </div>;
}

function StudyVisual({ screen, visual }) {
  if (!visual) return null;
  return <div class="ws-study-visuals">
    {visual.kpis ? <section class="ws-study-kpis">{visual.kpis.map(([label, value, detail]) => <div><span>{label}</span><strong>{value}</strong>{detail ? <small>{detail}</small> : null}</div>)}</section> : null}
    <section class="ws-study-chart"><header><strong>{visual.title}</strong><span>{visual.meta}</span></header>
      {(visual.bars || []).map(bar => <button class="ws-study-bar-row" data-study-row="visual" aria-label={`Watch ${bar.label} film`} disabled={!bar.refs.length} onClick={() => screen.watch(bar.refs, bar.label)}><span>{bar.label}</span><i aria-hidden="true"><b style={`width:${bar.width}%`} /></i><strong>{bar.value}</strong></button>)}
      {(visual.deltas || []).map(bar => <button class={`ws-study-delta-row ${bar.tone}`} data-study-row="visual" aria-label={`Watch ${bar.label} film`} onClick={() => screen.watch(bar.refs, bar.label)}><span>{bar.label}</span><i aria-hidden="true"><b class={bar.negative ? 'negative' : ''} style={`width:${bar.width}%`} /></i><strong>{bar.value}</strong></button>)}
    </section>
  </div>;
}

function PivotCell({ screen, cell, label, total = false }) {
  if (!cell) return <td class={`ws-pivot-cell${total ? ' ws-pivot-total' : ''} is-none`}><span class="ws-pivot-value">—</span><span class="ws-pivot-n">no plays</span></td>;
  return <td class={`ws-pivot-cell${total ? ' ws-pivot-total' : ''}${cell.dim ? ' is-small' : ''}`}><button type="button" class="ws-pivot-btn" disabled={!cell.refs.length} aria-label={`Watch ${label}, ${cell.refs.length} plays`} onClick={() => screen.watch(cell.refs, label)}><span class="ws-pivot-value">{cell.value}</span><span class="ws-pivot-n">{cell.count}{cell.state ? ` · ${cell.state.toLowerCase()}` : ''}</span></button></td>;
}

function Results({ screen, model }) {
  if (model.kind === 'unit-prompt') return <div id="wsStudyUnitPrompt" class="ws-study-unit-prompt">{model.message}</div>;
  const prompt = <div id="wsStudyUnitPrompt" class="ws-study-unit-prompt" hidden />;
  if (model.kind === 'empty') return <>{prompt}<div class="ws-study-results"><div class="ws-study-empty">{model.message || 'No plays match this question.'}</div></div></>;
  return <>{prompt}
    <div class="ws-study-summary" id="wsStudySummary"><strong>{model.summary}</strong><span>{model.summaryMeta}</span></div>
    <div class="ws-study-warning" id="wsStudyWarning" hidden={!model.warnings?.length}>{model.warnings?.length} group{model.warnings?.length === 1 ? '' : 's'} below the selected minimum sample. Results remain visible.</div>
    <StudyVisual screen={screen} visual={model.visual} />
    {model.kind === 'pivot' ? <div class="ws-study-results"><div class="ws-pivot-scroll"><table class="ws-pivot"><caption class="ws-pivot-caption">{model.pivot.caption}</caption><thead><tr><th class="ws-pivot-corner">{model.pivot.corner}</th>{model.pivot.columns.map(col => <th>{col}</th>)}<th class="ws-pivot-total">Total</th></tr></thead><tbody>{model.pivot.rows.map(row => <tr><th>{row.label}</th>{row.cells.map((cell, i) => <PivotCell screen={screen} cell={cell} label={`${row.label} · ${model.pivot.columns[i]}`} />)}<PivotCell screen={screen} cell={row.total} label={row.label} total /></tr>)}</tbody><tfoot><tr><th>All</th>{model.pivot.totals.map((cell, i) => <PivotCell screen={screen} cell={cell} label={model.pivot.columns[i]} />)}<td class="ws-pivot-cell ws-pivot-total"><button class="ws-pivot-btn" onClick={() => screen.watch(model.pivot.refs, 'All matching plays')}><span class="ws-pivot-value">{model.pivot.refs.length}</span><span class="ws-pivot-n">plays</span></button></td></tr></tfoot></table></div></div>
      : <div class="ws-study-results"><div class="ws-study-table-head"><span>Group</span><span>Plays</span><span id="wsStudyMetricHead">{model.metricHead}</span><span>Run / Pass</span><span id="wsStudyDeltaHead">{model.deltaHead}</span><span></span></div>{model.rows.length ? model.rows.map((row, index) => <div class={`ws-study-row${model.compare ? ' ws-study-row-compare' : ''}${row.dim ? ' is-small' : ''}`}><strong>{row.label}</strong><span>{row.plays}</span><span>{row.metric}{row.state ? <small class="ws-study-state"> {row.state}</small> : null}</span><span>{row.mix}</span><span class={row.deltaTone || ''}>{row.delta}</span><button class="ws-btn ws-small" data-study-row={index} disabled={!row.refs.length} onClick={() => screen.watch(row.refs, row.label)}>Watch</button></div>) : <div class="ws-study-empty">No plays match this question.</div>}</div>}
  </>;
}

function NativeStudy({ screen }) {
  const [state, setState] = useState(() => screen.initialState());
  const [revision, force] = useState(0);
  const priorUnit = useRef(state.unit);
  const stateRef = useRef(state);
  stateRef.current = state;
  const update = (key, value) => setState(old => {
    const next = { ...old, [key]: value };
    if (key === 'playerRole') { const role = screen.constructor.PLAYER_ROLES[value]; next.player = ''; next.playerMetric = role?.metrics[0] || ''; }
    if (key === 'dimension' || key === 'column') {
      const required = screen._requiredUnit(next);
      if (required) { if (!screen._requiredUnit(old)) priorUnit.current = old.unit; next.unit = required; }
      else if (screen._requiredUnit(old)) next.unit = priorUnit.current || '';
    }
    if (next.compare) next.column = '';
    return next;
  });
  const requiredUnit = state.playerRole ? '' : screen._requiredUnit(state);
  const model = useMemo(() => buildStudyView(screen, state), [screen, state, revision]);
  const views = screen._views();
  const role = screen.constructor.PLAYER_ROLES[state.playerRole];
  const playerOptions = useMemo(() => screen.playerOptions(state.playerRole, state), [screen, state.playerRole, state, revision]);
    screen.rows = model.rows || []; screen._saveCohorts = model.saveCohorts || []; screen._watchAllRefs = model.watchAll?.refs || []; screen._watchAllLabel = model.watchAll?.label || 'Watch results';
  screen._native = { getState: () => stateRef.current, setState, refresh: () => force(n => n + 1) };
  const dimName = id => screen.app.analyticsRegistry.getDimension(id)?.name;
  const metricName = id => screen.constructor.RICH_METRIC_PAIRS[id]?.name || screen.app.analyticsRegistry.getMeasure(id)?.name;
  const columnBlocked = !!state.compare || !!state.playerRole;
  return <>
    <div class="ws-study-head"><div><div class="ws-eyebrow">Study the film</div><h1>FIND THE ANSWER</h1><p>Ask a football question. Every result stays linked to video.</p></div><div class="ws-study-actions">
      <button class="ws-btn" data-study-action="advanced" onClick={() => screen.app.workspaceShell.showAdvancedReports()}>Advanced Reports</button>
      <button class="ws-btn" data-study-action="save" onClick={() => screen._saveView()}>Save view</button>
      <button class="ws-btn" data-study-action="save-plan" onClick={() => screen._saveToPlan()}>Save to Plan</button>
      <button class="ws-btn ws-primary" data-study-action="watch-all" disabled={!model.watchAll?.refs?.length} onClick={() => screen.watch(model.watchAll.refs, model.watchAll.label)}>{model.watchAll?.refs?.length ? `${model.watchAll.label} · ${model.watchAll.refs.length}` : 'Watch results'}</button>
    </div></div>
    <div class="ws-study-query">
      <Field label="Break down by"><select id="wsStudyDimension" value={state.dimension} onChange={e => update('dimension', e.currentTarget.value)}><GroupedOptions ids={screen.constructor.DIMENSIONS} groups={screen.constructor.DIMENSION_GROUPS} nameOf={dimName} /></select></Field>
      <label>Then by<select id="wsStudyColumn" disabled={columnBlocked} value={state.column} onChange={e => update('column', e.currentTarget.value)}><option value="">—</option><GroupedOptions ids={screen.constructor.DIMENSIONS} groups={screen.constructor.DIMENSION_GROUPS} nameOf={dimName} /></select><small id="wsStudyColumnHint" hidden={!state.compare}>Unavailable while comparing two cohorts.</small></label>
      <Field label="Scope"><select id="wsStudyScope" disabled={!!state.compare} value={state.scope} onChange={e => update('scope', e.currentTarget.value)}><option value="game">Current game</option><option value="season">Full season</option><option value="range">Date range</option></select></Field>
      <Field label="Unit"><select id="wsStudyUnit" class={requiredUnit ? 'is-unit-forced' : ''} disabled={!!state.playerRole || !!requiredUnit} value={state.unit} onChange={e => update('unit', e.currentTarget.value)}><option value="">All units</option><option value="offense">Offense</option><option value="defense">Defense</option><option value="special">Special Teams</option></select></Field>
      <Field label="Primary metric"><select id="wsStudyMeasure" disabled={!!state.playerRole} value={state.measure} onChange={e => update('measure', e.currentTarget.value)}><GroupedOptions ids={screen.constructor.SELECTABLE_METRICS} groups={screen.constructor.MEASURE_LENSES} nameOf={metricName} /></select></Field>
      <Field label="Minimum sample"><select id="wsStudyMin" value={state.minSample} onChange={e => update('minSample', Number(e.currentTarget.value))}><option value="0">Show all</option><option value="3">3 plays</option><option value="5">5 plays</option><option value="10">10 plays</option></select></Field>
      <Field label="Compare"><select id="wsStudyCompare" value={state.compare} onChange={e => update('compare', e.currentTarget.value)}><option value="">No comparison</option><option value="season">Game vs season</option><option value="prior">Game vs prior games</option><option value="recent">Recent vs prior period</option><option value="rangePrior">Date range vs prior</option></select></Field>
      <Field id="wsStudyPeriodWrap" label="Period size"><select id="wsStudyPeriodGames" value={state.periodGames} onChange={e => update('periodGames', Number(e.currentTarget.value))}><option value="2">2 games</option><option value="3">3 games</option><option value="5">5 games</option></select></Field>
      <div class="ws-study-saved"><Field label="Saved view"><select id="wsStudySaved" value={state.savedView} onChange={e => { update('savedView', e.currentTarget.value); screen._applyView(e.currentTarget.value); }}><option value="">Choose a saved view</option>{views.map(view => <option value={view.id}>{view.name}</option>)}</select></Field><button class="ws-icon-btn" data-study-action="delete-view" aria-label="Delete selected view" disabled={!state.savedView} onClick={() => screen._deleteView()}>×</button></div>
    </div>
    <div class="ws-study-players" id="wsStudyPlayers"><strong>Players</strong><Field label="Role"><select id="wsStudyPlayerRole" value={state.playerRole} onChange={e => update('playerRole', e.currentTarget.value)}><option value="">Not a player question</option>{Object.entries(screen.constructor.PLAYER_ROLES).map(([id, item]) => <option value={id}>{item.name}</option>)}</select></Field><Field label="Player"><select id="wsStudyPlayer" disabled={!role} value={state.player} onChange={e => update('player', e.currentTarget.value)}><option value="">Every player (leaderboard)</option>{playerOptions.map(item => <option value={item.value}>{item.label}</option>)}</select></Field><Field label="Player metric"><select id="wsStudyPlayerMetric" disabled={!role} value={state.playerMetric} onChange={e => update('playerMetric', e.currentTarget.value)}>{(role?.metrics || []).map(id => <option value={id}>{screen.constructor.PLAYER_METRIC_LABELS[state.playerRole]?.[id] || id}</option>)}</select></Field><small>Choose a role to compare players, or pick one player and break them down by the field above.</small></div>
    <div class="ws-study-range" id="wsStudyRange" hidden={state.scope !== 'range' && state.compare !== 'rangePrior'}><strong>Date range</strong><Field label="From"><input type="date" id="wsStudyDateFrom" max={state.dateTo} value={state.dateFrom} onChange={e => update('dateFrom', e.currentTarget.value)} /></Field><span>through</span><Field label="To"><input type="date" id="wsStudyDateTo" min={state.dateFrom} value={state.dateTo} onChange={e => update('dateTo', e.currentTarget.value)} /></Field><small>Only games with dates are included.</small></div>
    <Filters screen={screen} state={state} setState={setState} />
    <Results screen={screen} model={model} />
    {screen._planPicker ? <StudyPlanPicker key={screen._planPicker.key} screen={screen} model={screen._planPicker} /> : null}
  </>;
}

export function mountNativeStudy(screen, host) {
  render(<NativeStudy screen={screen} />, host);
  return { refresh: () => screen._native?.refresh(), unmount: () => render(null, host) };
}
