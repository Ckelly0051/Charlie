/**
 * Reports Presentation Independence — real Preact tab components.
 *
 * ReportsScreen computes/aggregates (delegating every formula to StatsEngine)
 * and passes the result to these components. No component here recomputes a
 * football value; each reads a pre-computed field off `stats`/a report object
 * and turns it into markup. Film clicks call screen methods directly — no
 * post-render DOM query/rebind pass.
 */
import { useState } from 'preact/hooks';
import { Hero, KpiBand, Module, RowList, DataTable, TileGrid, Watchable, WatchableRefs, ChartBody, LegacyWidget, Gauge, DefMark, EmptyState } from './native-report-kit.jsx';
import * as view from './reports-view.js';
import { Visualizations } from './visualizations.js';

const breakdownColumns = [
  { key: 'name', label: 'Name' }, { key: 'count', label: 'Plays', numeric: true },
  // Run/Pass composition — the same underlying `runs`/`passes` counts every
  // legacy Formation/Play Type/Personnel/Backfield/Strength row already
  // carries via Charts.effectivenessRows' stacked bar ("Run: 16 (64%)").
  // Counts in the "24R/3P" shorthand the Offense hero already uses, plus the
  // run share legacy's bar leads with, so this row genuinely reads as one
  // number a coach cross-checks against the bar, not two disconnected facts.
  { key: 'runPass', label: 'Run/Pass', render: row => {
    if (!Number.isFinite(row.runs) || !Number.isFinite(row.passes)) return '—';
    const total = row.runs + row.passes;
    const runPct = total ? Math.round((row.runs / total) * 100) : 0;
    return `${row.runs}R (${runPct}%) / ${row.passes}P (${100 - runPct}%)`;
  } },
  { key: 'ypp', label: 'Yds/play', numeric: true }, { key: 'success', label: 'Success' },
];
function breakdownRows(rows, screen) {
  return rows.map(row => ({ ...row, onActivate: () => screen.watchCut(row.cutType, row.cutVal, row.cutLabel), label: row.cutLabel }));
}

/** Two Modules that share a fixed-width `gi-overview-band-2` grid track when
 *  BOTH have data, but a lone survivor must never sit in that grid — the
 *  second track's 340px-minimum column stays reserved and renders as a dead
 *  gray gap (house rule: fill the space or kill the space). `slots` is an
 *  array of nullable nodes; nulls are dropped before deciding whether to wrap. */
function PairedBand({ slots, cls = 'stats-two-col' }) {
  const present = slots.filter(Boolean);
  if (!present.length) return null;
  if (present.length === 1) return present[0];
  return <div class={cls}>{present}</div>;
}

export function OverviewTab({ stats, screen }) {
  if (!stats.allPlays) return <EmptyState title="No charted data yet" body="Tag Play Type, Result, and Yardage to build the report. Add Down & Distance and Formation for situational tendencies." />;
  const engine = screen.app.stats;
  const cut = (type, val, label) => () => screen.watchCut(type, val, label);
  const phase = view.snapsByPhase(stats);
  const tiles = view.situationalTiles(stats).map(t => ({ ...t, onActivate: t.plays ? cut(t.cutType, t.cutVal, t.cutLabel) : undefined }));
  const yards = view.yardsByType(stats);
  const dd = view.downDistanceRows(stats);
  const plan = view.gamePlan(stats);
  const bigPlays = view.bigPlaysRows(stats, engine);
  const drives = view.drivesRows(stats);

  return <div class="gi-overview-board">
    <KpiBand items={view.overviewKpis(stats)} />
    <div class="gi-overview-band gi-overview-band-3 gi-overview-phase">
      <Module title="Snaps by phase" meta={`${phase.total} total`}>
        <div class="gi-phase-ramp"><i style={`--n:${phase.off}`} /><i style={`--n:${phase.def}`} /><i style={`--n:${phase.special}`} /></div>
        <table><thead><tr><th>Phase</th><th>Snaps</th><th>Share</th><th>Yds/play</th></tr></thead><tbody>
          {phase.rows.map(row => <tr key={row.label} class={row.cls}><td>{row.label}</td><td>{row.count}</td><td>{row.share}%</td><td>{row.ypp}</td></tr>)}
        </tbody></table>
      </Module>
      <Module title="Situational" meta="each tile opens film"><TileGrid tiles={tiles} /></Module>
      <Module title="Key metrics" meta="five coaching lenses" cls="is-lenses">
        <div class="gi-overview-lenses">{view.keyMetrics(stats).map(([label, value, sub]) => <div key={label}><span>{label}</span><strong>{value}</strong><small>{sub}</small></div>)}</div>
      </Module>
    </div>
    <div class="gi-overview-band gi-overview-band-3 gi-overview-production">
      <Module title="Rushing" meta={view.rushingRows(stats).meta} cls="is-offense"><RowList rows={view.rushingRows(stats).rows} /></Module>
      <Module title="Passing" meta={view.passingRows(stats).meta} cls="is-offense"><RowList rows={view.passingRows(stats).rows} /></Module>
      <Module title="Yards by type" meta={`${yards.total} total`} cls="is-offense">
        <div class="gi-yards-split"><i style={`--n:${yards.rushWidth}`} /><i style={`--n:${yards.passWidth}`} /></div>
        <div class="gi-yards-legend"><span>Rush {yards.rush}</span><span>Pass {yards.pass}</span></div>
        <DataTable columns={[
          { key: 'name', label: 'Play type' }, { key: 'snaps', label: 'Snaps', numeric: true }, { key: 'ypp', label: 'Yds/play', numeric: true }, { key: 'success', label: 'Success' },
        ]} rows={yards.rows.map(row => ({ ...row, onActivate: cut(row.cutType, row.cutVal, row.cutLabel), label: row.cutLabel }))} />
      </Module>
    </div>
    <div class="gi-overview-band gi-overview-band-2 gi-overview-decisions">
      <Module title="Down &amp; distance" meta="run/pass mix and production">
        <table><thead><tr><th>Situation</th><th>Snaps</th><th>Run / pass</th><th>Yds/play</th><th>Success</th><th>Conv</th></tr></thead><tbody>
          {dd.map(row => <Watchable key={row.situation} tag="tr" onActivate={cut(row.cutType, row.cutVal, row.cutLabel)} label={row.cutLabel}>
            <td>{row.situation}</td><td>{row.snaps}</td>
            <td><span class="gi-mini-mix"><i style={`--n:${row.runPct}`} /><i style={`--n:${row.passPct}`} /></span>{row.runPct} / {row.passPct}</td>
            <td>{row.ypp}</td><td>{row.success}</td><td>{row.conv}</td>
          </Watchable>)}
        </tbody></table>
      </Module>
      <Module title="Game plan" meta="what the tags say" cls="is-plan">
        <div class="gi-overview-plan is-good">{plan.working.map((item, i) => <p key={i} class={item.cut ? 'cut-row' : ''}
          onClick={item.cut ? cut(item.cut[0], item.cut[1], 'Game plan') : undefined}
          tabIndex={item.cut ? 0 : undefined} role={item.cut ? 'button' : undefined}>{item.text}</p>)}</div>
        <div class="gi-overview-plan is-fix">{plan.fix.map((item, i) => <p key={i} class={item.cut ? 'cut-row' : ''}
          onClick={item.cut ? cut(item.cut[0], item.cut[1], 'Game plan') : undefined}
          tabIndex={item.cut ? 0 : undefined} role={item.cut ? 'button' : undefined}>{item.text}</p>)}</div>
      </Module>
    </div>
    <div class="gi-overview-band gi-overview-support">
      <Module title="Big plays" meta={`${stats.bigPlays.length} total`} cls="is-offense">
        <table><thead><tr><th>Play</th><th>Situation</th><th>Call</th><th>Yds</th></tr></thead><tbody>
          {bigPlays.map(play => <Watchable key={play.id} tag="tr" onActivate={() => screen.watchPredicate(p => String(p.id) === String(play.id), `Play ${play.id}`)} label={`Play ${play.id}`}>
            <td>{play.id}</td><td>{play.situation}</td><td>{play.call}</td><td>{play.yards}</td>
          </Watchable>)}
        </tbody></table>
      </Module>
      <div class="gi-overview-support-stack">
        <Module title="Drives" meta={`${drives.total} drives · ${drives.scoring} scored`}>
          <div class="gi-overview-drives">{drives.rows.map(drive => <Watchable key={drive.number} onActivate={() => {
            const ids = new Set(drive.playIds.map(String));
            screen.watchPredicate(p => ids.has(String(p.id)), `Drive ${drive.number}`);
          }} label={`Drive ${drive.number}`}>
            <span>D{drive.number}</span><i><b style={`--w:${drive.widthPct}%`} /></i><small>{drive.outcome}</small>
          </Watchable>)}</div>
        </Module>
        <Module title="Defense &amp; discipline" meta={view.defenseDisciplineRows(stats, engine).meta} cls="is-defense">
          <RowList rows={view.defenseDisciplineRows(stats, engine).rows} />
        </Module>
      </div>
    </div>
  </div>;
}

function PlayCalls({ stats, screen }) {
  const engine = screen.app.stats;
  const analysis = engine._playCallAnalysis(stats.offPlays);
  if (!analysis.eligible) return null;
  const gameId = screen.app.storage?.seasonStore?.activeGame?.()?.id || '';
  const pct = v => `${Number(v || 0).toFixed(1).replace(/\.0$/, '')}%`;
  const refsFor = row => row.playIds.map(id => `${gameId}::${id}`);
  const watch = (row, label) => () => screen.watchRefs(refsFor(row), label);
  return <Module title="Play Calls" meta={`${analysis.eligible} offensive snaps have an exact call. Frequency uses those call-charted snaps; every row opens its exact film.`}>
    <div class="gi-call-grid">
      <div><h4>Call performance</h4><DataTable columns={[
        { key: 'name', label: 'Play Call' }, { key: 'concept', label: 'Concept' }, { key: 'n', label: 'Plays', numeric: true },
        { key: 'share', label: 'Frequency', numeric: true }, { key: 'success', label: 'Success Rate', numeric: true },
        { key: 'ypp', label: 'Yds/Play', numeric: true }, { key: 'explosive', label: 'Explosive', numeric: true }, { key: 'negative', label: 'Negative', numeric: true },
      ]} rows={analysis.calls.map(row => ({
        id: row.name, name: row.name, concept: row.concept || '—', n: row.n, share: pct(row.sharePct), success: pct(row.successRate),
        ypp: row.yardsPerPlay.toFixed(1), explosive: pct(row.explosiveRate), negative: pct(row.negativeRate),
        onActivate: watch(row, `Play Call: ${row.name}`), label: `Play Call: ${row.name}`,
      }))} /></div>
      <div><h4>Concept roll-up</h4>{analysis.concepts.length ? <DataTable columns={[
        { key: 'name', label: 'Concept / Call' }, { key: 'n', label: 'Plays', numeric: true }, { key: 'success', label: 'Success Rate', numeric: true }, { key: 'ypp', label: 'Yds/Play', numeric: true },
      ]} rows={analysis.concepts.flatMap(concept => [
        { id: `c-${concept.name}`, name: concept.name, n: concept.n, success: pct(concept.successRate), ypp: concept.yardsPerPlay.toFixed(1), onActivate: watch(concept, `Concept: ${concept.name}`), label: `Concept: ${concept.name}` },
        ...concept.calls.map(call => ({ id: `${concept.name}-${call.name}`, name: call.name, n: call.n, success: pct(call.successRate), ypp: call.yardsPerPlay.toFixed(1), onActivate: watch(call, `Play Call: ${call.name}`), label: `Play Call: ${call.name}` })),
      ])} /> : <p>No concepts assigned yet.</p>}</div>
    </div>
    <h4>What we call by situation</h4>
    <div class="gi-call-context-grid">{[...new Set(analysis.situations.map(row => row.lens))].map(lens => {
      const rows = analysis.situations.filter(row => row.lens === lens).sort((a, b) => b.contextN - a.contextN || a.value.localeCompare(b.value));
      return <div class="gi-call-context" key={lens}><h4>{lens}</h4><DataTable columns={[
        { key: 'value', label: 'Situation' }, { key: 'call', label: 'Top Call' }, { key: 'use', label: 'Use' }, { key: 'success', label: 'Success Rate', numeric: true }, { key: 'ypp', label: 'Yds/Play', numeric: true },
      ]} rows={rows.map(row => ({ id: `${lens}-${row.value}`, value: row.value, call: row.call, use: `${row.n}/${row.contextN}`, success: pct(row.successRate), ypp: row.yardsPerPlay.toFixed(1),
        onActivate: watch(row, `${lens}: ${row.value} — ${row.call}`), label: `${lens}: ${row.value} — ${row.call}` }))} /></div>;
    })}</div>
  </Module>;
}

function BigTwelve({ data, screen }) {
  if (!data) return null;
  return <Module title={`The “Big ${data.to90}” — ${data.label}'s Core Tendencies`} meta="Snaps sorted by frequency; click any column or row to sort. Click any row to watch the film.">
    <DataTable columns={[
      { key: 'form', label: 'Formation' }, { key: 'qb', label: 'QB align' }, { key: 'bf', label: 'Backfield' }, { key: 'str', label: 'Strength' }, { key: 'mot', label: 'Motion' }, { key: 'pt', label: 'Play' },
      { key: 'n', label: 'N', numeric: true }, { key: 'succ', label: 'Success', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'runPct', label: 'Run%', numeric: true },
    ]} rows={data.rows.map(row => ({ ...row, onActivate: row.cutType ? () => screen.watchCut(row.cutType, row.cutVal, row.cutLabel) : undefined, label: row.cutLabel }))} />
  </Module>;
}

function TendencyMatrixPanel({ engine, plays, defaultRow = 'formation', defaultCol = 'down', title = 'Tendency Matrix' }) {
  const [rowId, setRowId] = useState(defaultRow);
  const [colId, setColId] = useState(defaultCol);
  if (!plays?.length || plays.length < 3) return null;
  const dims = engine.constructor._matrixDimensions();
  const matrix = view.matrixData(engine, plays, rowId, colId);
  return <Module title={title}>
    <div class="tm-controls">
      <label>Rows: <select value={rowId} onChange={e => setRowId(e.currentTarget.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
      <span style="opacity:.5;margin:0 4px">×</span>
      <label>Cols: <select value={colId} onChange={e => setColId(e.currentTarget.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
    </div>
    {rowId === colId ? <p style="opacity:.6">Pick two different dimensions.</p> : <MatrixGrid matrix={matrix} />}
  </Module>;
}

function MatrixGrid({ matrix }) {
  if (!matrix.rowKeys.length || !matrix.colKeys.length) return <p style="opacity:.6">Not enough data for this combination.</p>;
  const maxCount = Math.max(1, ...Object.values(matrix.cells).map(c => c.count));
  return <>
    <p class="tm-eligible" style="opacity:.7;font-size:.85em;margin:0 0 6px">{matrix.eligible} of {matrix.total} plays charted on both axes{matrix.omitted ? ` · ${matrix.omitted} omitted (blank on ${matrix.rowDim.label} or ${matrix.colDim.label})` : ''}</p>
    <div class="tm-wrap"><table class="stats-table stats-table-full tm-table">
      <thead><tr><th>{matrix.rowDim.label} \ {matrix.colDim.label}</th>{matrix.colKeys.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{matrix.rowKeys.map(r => <tr key={r}>
        <td style="font-weight:600;white-space:nowrap">{r}</td>
        {matrix.colKeys.map(c => {
          const cell = matrix.cells[`${r}\0${c}`];
          if (!cell?.count) return <td key={c} class="tm-cell" style="opacity:.2">—</td>;
          const intensity = cell.count / maxCount;
          const succPct = Math.round((cell.successes / cell.count) * 100);
          const avg = (cell.yards / cell.count).toFixed(1);
          const runPct = Math.round((cell.runs / cell.count) * 100);
          const border = succPct >= 50 ? '1px solid rgba(68,255,136,0.4)' : succPct <= 30 ? '1px solid rgba(255,102,102,0.25)' : '1px solid transparent';
          return <td key={c} class="tm-cell" style={`background:rgba(74,158,255,${(intensity * 0.45 + 0.05).toFixed(2)});border:${border}`} title={`${r} × ${c}: ${cell.count} plays, ${runPct}% run, ${succPct}% success, ${avg} avg`}>
            <div class="tm-count">{cell.count}</div><div class="tm-split">{runPct}R/{100 - runPct}P</div><div class="tm-succ">{succPct}% · {avg}y</div>
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </>;
}

function AdvancedEpa({ data }) {
  if (!data) return null;
  return <Module title="Expected Points (EPA)">
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-title">Total EPA</div><div class={`stat-card-value ${data.totalClass}`}>{data.totalText}</div></div>
      <div class="stat-card"><div class="stat-card-title">EPA / Play</div><div class={`stat-card-value ${data.perPlayClass}`}>{data.perPlayText}</div></div>
      <div class="stat-card"><div class="stat-card-title">Plays Scored</div><div class="stat-card-value">{data.count}</div></div>
    </div>
    <div class="epa-curve-wrap"><svg viewBox={`0 0 ${data.W} ${data.H}`} class="epa-curve" preserveAspectRatio="xMidYMid meet">
      <line x1={data.P} y1={data.zeroY} x2={data.W - data.P} y2={data.zeroY} stroke="#555" stroke-dasharray="3,3" />
      <path d={data.path} fill="none" stroke="var(--accent)" stroke-width="2" />
      <text x={data.P} y="14" fill="#aaa" font-size="11">Cumulative EPA</text>
      <text x={data.P} y={data.H - 8} fill="#aaa" font-size="10">Play 1</text>
      <text x={data.W - data.P} y={data.H - 8} fill="#aaa" font-size="10" text-anchor="end">Play {data.n}</text>
      <text x={data.W - data.P} y="14" fill="#aaa" font-size="11" text-anchor="end">High {data.hi.toFixed(1)} / Low {data.lo.toFixed(1)}</text>
    </svg></div>
    <div class="stats-two-col">
      <EpaGroupTable title="Play Type" rows={data.byType} />
      <EpaGroupTable title="Formation" rows={data.byFormation} />
    </div>
    <div class="stats-two-col">
      <EpaGroupTable title="Personnel" rows={data.byPersonnel} />
      <div><h4 style="margin:8px 0 4px">By Down</h4><table class="stats-table stats-table-full epa-table">
        <thead><tr><th>Down</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
        <tbody>{data.byDown.length ? data.byDown.map(d => <tr key={d.down}><td>{d.down}</td><td>{d.count}</td><td class={d.totalClass}>{d.total}</td><td class={d.perPlayClass}>{d.perPlay}</td></tr>) : <tr><td colspan="4" style="opacity:.6">No data</td></tr>}</tbody>
      </table></div>
    </div>
    <div class="stats-two-col">
      <EpaPlayTable title="Top 5 EPA Plays" color="#44ff88" rows={data.top} />
      <EpaPlayTable title="Worst 5 EPA Plays" color="#ff6666" rows={data.worst} />
    </div>
  </Module>;
}
function EpaGroupTable({ title, rows }) {
  if (!rows.length) return null;
  return <div><h4 style="margin:8px 0 4px">{title}</h4><table class="stats-table stats-table-full epa-table">
    <thead><tr><th>{title}</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.name}><td>{r.name}</td><td>{r.count}</td><td class={r.totalClass}>{r.total}</td><td class={r.perPlayClass}>{r.perPlay}</td></tr>)}</tbody>
  </table></div>;
}
function EpaPlayTable({ title, color, rows }) {
  return <div><h4 style={`margin:8px 0 4px;color:${color}`}>{title}</h4><table class="stats-table stats-table-full epa-table">
    <thead><tr><th>#</th><th>Situation</th><th>Yds</th><th>EPA</th></tr></thead>
    <tbody>{rows.map(r => <tr key={r.id}><td>#{r.id}</td><td>{r.label}</td><td>{r.yards}</td><td class={r.epaClass}>{r.epaText}</td></tr>)}</tbody>
  </table></div>;
}

export function OffenseTab({ stats, screen }) {
  const engine = screen.app.stats;
  if (!stats.offPlays.length) return <EmptyState title="No offensive snaps charted" body="Set Unit to Offense to populate this report." />;
  const shape = engine._dataShape(stats);
  const tend = view.tendencyBreakdown(stats);
  const bf = view.backfieldStrength(stats, engine);
  const dm = view.directionMotion(stats);
  const pa = view.playAction(stats);
  const advanced = view.advancedData(stats, engine);
  const cut = (type, val, label) => () => screen.watchCut(type, val, label);
  return <div class="gi-overview-board">
    <Hero kpis={view.offenseHero(stats, engine)} />
    <PlayCalls stats={stats} screen={screen} />
    <div class="gi-overview-band gi-overview-band-2">
      <Module title="Formation frequency and success rate" meta="each row opens film">
        <DataTable columns={breakdownColumns} rows={breakdownRows(tend.formations, screen)} />
      </Module>
      <Module title="Play type breakdown" meta="each row opens film">
        <DataTable columns={breakdownColumns} rows={breakdownRows(tend.playTypes, screen)} />
      </Module>
    </div>
    <PairedBand slots={[
      shape?.histogram ? <Module title="Yards gained per play, distribution"><ChartBody {...shape.histogram} /></Module> : null,
      shape?.scatter ? <Module title="Yards gained vs distance to go"><ChartBody {...shape.scatter} /></Module> : null,
    ]} />
    {shape?.zones && <Module title="Success Rate by Field Position"><ChartBody {...shape.zones} /></Module>}
    {shape?.downs && <Module title="Run/pass split and success rate by down"><ChartBody {...shape.downs} /></Module>}
    {pa && <Module title="Play-Action">
      <div class="stats-grid stats-grid-flex">
        <div class="stat-card"><div class="stat-card-title">PA Rate</div><div class="stat-card-value">{pa.paRate}%</div><div class="stat-card-sub">{pa.paPlays} of dropbacks</div></div>
        <div class="stat-card"><div class="stat-card-title">PA Comp%</div><div class="stat-card-value">{pa.paCompPct}%</div></div>
        <div class="stat-card"><div class="stat-card-title">PA YPA</div><div class="stat-card-value">{pa.paYPA}</div></div>
        <div class="stat-card"><div class="stat-card-title">Straight YPA</div><div class="stat-card-value">{pa.straightYPA}</div></div>
      </div>
      {pa.formations.length > 0 && <DataTable columns={[{ key: 'name', label: 'Formation' }, { key: 'count', label: 'PA Plays', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Success%' }]} rows={pa.formations.map((f, i) => ({ id: i, ...f }))} />}
    </Module>}
    <BigTwelve data={view.bigTwelve(engine, stats.offPlays, engine._subjectName('Our Offense'))} screen={screen} />
    <PairedBand cls="gi-overview-band gi-overview-band-2" slots={[
      bf.backfield.length > 0 ? <Module title="Backfield"><DataTable columns={breakdownColumns} rows={breakdownRows(bf.backfield, screen)} /></Module> : null,
      bf.strength.length > 0 ? <Module title="Strength"><DataTable columns={breakdownColumns} rows={breakdownRows(bf.strength, screen)} /></Module> : null,
    ]} />
    {view.personnelGroups(stats).length > 0 && <Module title="Personnel Groupings"><DataTable columns={breakdownColumns} rows={breakdownRows(view.personnelGroups(stats), screen)} /></Module>}
    <PairedBand slots={[
      dm?.direction.length > 0 ? <Module title="Play Direction"><DataTable columns={breakdownColumns} rows={breakdownRows(dm.direction, screen)} /></Module> : null,
      dm?.motion.length > 0 ? <Module title="Motion"><DataTable columns={breakdownColumns} rows={breakdownRows(dm.motion, screen)} /></Module> : null,
    ]} />
    {view.hashTendencies(stats).length > 0 && <Module title="Hash Tendencies"><DataTable columns={breakdownColumns} rows={breakdownRows(view.hashTendencies(stats), screen)} /></Module>}
    {view.personnelSituation(stats).length > 0 && <Module title="Personnel × Situation">
      <DataTable columns={[{ key: 'personnel', label: 'Personnel' }, { key: 'situation', label: 'Situation' }, { key: 'count', label: 'Plays', numeric: true }, { key: 'runPct', label: 'Run%', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Success%' }]}
        rows={view.personnelSituation(stats).map((row, i) => ({ id: i, ...row }))} />
    </Module>}
    <TendencyMatrixPanel engine={engine} plays={stats.offPlays} />
    {(() => { const sit = view.situationalBreakdown(stats); return sit.rows.length ? <Module title="Situational">
      <div class="stats-two-col">
        <DataTable columns={[{ key: 'name', label: 'Situation' }, { key: 'total', label: '#', numeric: true }, { key: 'yards', label: 'Yds', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Succ%' }, { key: 'tds', label: 'TD', numeric: true }]}
          rows={sit.rows.map(row => ({ ...row, id: row.key, onActivate: cut('situation', row.key, `${row.name} — ${row.total} plays`), label: `${row.name} — ${row.total} plays` }))} />
        <div><h4 style="margin:0 0 6px">By Quarter</h4>{sit.byQuarter.length ? <table class="stats-table stats-table-full"><thead><tr><th>Q</th><th>Plays</th><th>Yds</th><th>TD</th></tr></thead>
          <tbody>{sit.byQuarter.map(q => <tr key={q.q}><td>{q.q}</td><td>{q.plays}</td><td>{q.yards}</td><td>{q.tds}</td></tr>)}</tbody></table> : <p style="opacity:.6">No quarter data tagged.</p>}</div>
      </div>
    </Module> : null; })()}
    <LegacyWidget html={engine.heatMaps.render(stats.offPlays)} bind={node => {
      try { engine.constructor.bindDefs(node); } catch { /* no definitions in this fragment */ }
      try { engine.heatMaps.bind(node); } catch { /* heat-map tab wiring */ }
    }} />
    <LegacyWidget html={Visualizations.render(stats.offPlays)} />
    {shape?.teamProfileHtml && <ChartBody html={shape.teamProfileHtml} />}
    <AdvancedEpa data={advanced} />
  </div>;
}

export function PlayersTab({ stats, screen }) {
  const engine = screen.app.stats;
  const tables = view.individualStats(stats, 'all', num => engine._playerLabel(num));
  if (!tables.length) return <EmptyState title="No player attribution yet" body="Add ball carrier, passer, receiver, tackler, returner, or kicker to chart individual performance." />;
  return <div class="gi-overview-board">
    {tables.map(table => <Module key={table.key} title={table.title}>
      <DataTable columns={table.columns.map(([key, label, numeric]) => ({ key, label, numeric }))}
        rows={table.rows.map(row => ({ ...row, id: row.num, player: row.label, onActivate: () => engine._watchPlayer(row.num), label: `${row.label}'s plays` }))} />
    </Module>)}
  </div>;
}

/** Defense keeps its own established visual language (`stats-section`/`h3`,
 *  `.gi-def-*` classes with dedicated CSS) rather than adopting Overview's
 *  `gi-overview-module` shell -- this is a presentation-ownership migration,
 *  not a visual redesign, so the existing appearance is the target. */
function DefSection({ title, children }) {
  return <section class="stats-section"><h3>{title}</h3>{children}</section>;
}

const defTypeColumns = [
  { key: 'name', label: 'Play Run Against Us' }, { key: 'n', label: 'Snaps', numeric: true },
  { key: 'yardsPerPlay', label: 'Yds/Play', numeric: true, render: row => row.yardsPerPlay.toFixed(1) },
  { key: 'stopRate', label: 'Stop Rate', numeric: true, render: row => `${row.stopRate}%` },
  { key: 'explosiveRate', label: 'Explosive Rate', numeric: true, render: row => `${row.explosiveRate}%` },
  { key: 'havocRate', label: 'Havoc Rate', numeric: true, render: row => `${row.havocRate}%` },
  { key: 'touchdowns', label: 'TD Allowed', numeric: true },
];
const defGameColumns = [
  { key: 'name', label: 'Game' }, { key: 'n', label: 'Snaps', numeric: true },
  { key: 'yardsPerPlay', label: 'Yds/Play', numeric: true, render: row => row.yardsPerPlay.toFixed(1) },
  { key: 'stopRate', label: 'Stop Rate', numeric: true, render: row => `${row.stopRate}%` },
  { key: 'explosives', label: 'Explosive', numeric: true },
  { key: 'havoc', label: 'Havoc', numeric: true },
  { key: 'touchdowns', label: 'TD', numeric: true },
];
const defSitColumns = [
  { key: 'name', label: 'Situation' }, { key: 'n', label: 'Snaps', numeric: true },
  { key: 'yardsPerPlay', label: 'Yds/Play', numeric: true, render: row => row.yardsPerPlay.toFixed(1) },
  { key: 'stopRate', label: 'Stop Rate', numeric: true, render: row => `${row.stopRate}%` },
  { key: 'explosiveRate', label: 'Explosive', numeric: true, render: row => `${row.explosiveRate}%` },
  { key: 'havocRate', label: 'Havoc', numeric: true, render: row => `${row.havocRate}%` },
];
// A row with no resolved film ref keeps its data but loses the click
// affordance -- the same "never a dead click" rule every migrated table
// follows. Defense refs are pre-resolved composite arrays on the row itself
// (built by StatsEngine.defensivePerformance), so activation is a direct
// watchRefs call, not a cut-type/val lookup.
function defRows(rows, label, screen) {
  return rows.map(row => ({ ...row, id: row.name,
    onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${row.name} ${label}`) : undefined,
    label: `${row.name} ${label}` }));
}

function DefAnswerCell({ answer, screen }) {
  if (!answer) return <span class="gi-def-no-sample">Not enough snaps</span>;
  const label = `${answer.name} answer`;
  return <WatchableRefs tag="button" type="button" class="gi-def-answer" refs={answer.refs} label={label} screen={screen}>
    <strong>{answer.name}</strong><span>{answer.stopRate}% stop · {answer.yardsPerPlay.toFixed(1)} yds/play · {answer.n} snaps</span>
  </WatchableRefs>;
}

/** One front/coverage/blitz breakdown row -- a plain, non-sortable `<tr>`
 *  (matching the legacy `_renderDefensive` table's own behavior exactly;
 *  the already-migrated tables around it are sortable `DataTable`s, but
 *  this section was never one, and this is a presentation-ownership
 *  migration, not a redesign). Reuses the shared `Watchable` primitive so a
 *  row with no resolvable refs renders with no click affordance at all --
 *  the same "never a dead click" rule the rest of the tab follows. */
function SchemeRow({ onActivate, label, children }) {
  return <Watchable tag="tr" onActivate={onActivate} label={label}>{children}</Watchable>;
}

/** Scheme Detail's "Defensive Analytics" body -- a real Preact re-derivation
 *  of `StatsEngine._renderDefensive()`'s markup, reading the SAME
 *  `compute(scoped).defensive` object that renderer always has (additive
 *  `refs` arrays only; no formula moved or duplicated). No LegacyWidget, no
 *  dangerouslySetInnerHTML, no post-render selector binding -- every click
 *  is a real onClick, and the Havoc Rate gauge is real SVG (`Gauge`, not
 *  `Charts.gauge()`'s HTML string). */
function SchemeDetail({ defensive, screen }) {
  const engine = screen.app.stats;
  const d = defensive;
  if (!d.hasData) return null;
  const havocPctVal = parseFloat(d.havocRate);
  const havocColor = havocPctVal >= 20 ? '#22c55e' : havocPctVal >= 12 ? '#f59e0b' : '#ef4444';
  const avg = (yards, count) => (count ? yards / count : 0).toFixed(1);
  const share = (n, count) => count ? (n / count * 100).toFixed(0) : '0';
  return <div class="stats-section">
    <h3>Defensive Analytics</h3>
    <div class="def-top-row">
      <Gauge pct={havocPctVal} label={`Havoc Rate (${d.havocPlays})`} color={havocColor} size={110} />
      <div class="stats-grid stats-grid-flex">
        <div class="stat-card"><div class="stat-card-title">Sacks</div><div class="stat-card-value">{d.sacks}</div><div style="font-size:11px;opacity:.6">{d.sackYards} yds</div></div>
        <div class="stat-card"><div class="stat-card-title">TFL</div><div class="stat-card-value">{d.tfl}</div></div>
        <div class="stat-card"><div class="stat-card-title">Turnovers</div><div class="stat-card-value">{d.turnovers}</div><div style="font-size:11px;opacity:.6">{d.interceptions} INT / {d.fumblesRecovered} FR</div></div>
        <div class="stat-card"><div class="stat-card-title">Blitz Rate</div><div class="stat-card-value">{d.blitzRate}%</div><div style="font-size:11px;opacity:.6">{d.blitzTotal} plays</div></div>
        <div class="stat-card"><div class="stat-card-title">Blitz Havoc</div><div class="stat-card-value" style={{ color: parseFloat(d.blitzHavocRate) >= 20 ? '#44ff88' : '#fff' }}>{d.blitzHavocRate}%</div></div>
        <div class="stat-card"><div class="stat-card-title">Forced Inc</div><div class="stat-card-value">{d.incompletions}</div></div>
        <div class="stat-card"><div class="stat-card-title">3-and-Outs</div><div class="stat-card-value">{d.threeAndOuts}</div></div>
      </div>
    </div>
    {d.fronts.length > 0 && <>
      <h4 style="margin:16px 0 4px">Defensive Front Breakdown</h4>
      <div class="gi-def-table-wrap"><table class="stats-table stats-table-full">
        <thead><tr><th>Front</th><th>#</th><th>Run/Pass</th><th>Yds</th><th>Avg</th>
          <th>Stop%<DefMark text={engine.constructor.DEFINITIONS.stopPct} /></th>
          <th>Havoc%<DefMark text={engine.constructor.DEFINITIONS.havoc} /></th></tr></thead>
        <tbody>{d.fronts.map(f => <SchemeRow key={f.name}
          onActivate={f.refs?.length ? () => screen.watchRefs(f.refs, `${f.name} front — ${f.count} plays`) : undefined}
          label={`${f.name} front — ${f.count} plays`}>
          <td>{f.name}</td><td>{f.count}</td><td>{f.runs}/{f.passes}</td><td>{f.yards}</td>
          <td>{avg(f.yards, f.count)}</td><td>{share(f.successes, f.count)}%</td><td>{share(f.havoc, f.count)}%</td>
        </SchemeRow>)}</tbody>
      </table></div>
    </>}
    {d.coverages.length > 0 && <>
      <h4 style="margin:16px 0 4px">Coverage Breakdown</h4>
      <div class="gi-def-table-wrap"><table class="stats-table stats-table-full">
        <thead><tr><th>Coverage</th><th>#</th><th>Comp</th><th>Inc</th><th>INT</th><th>Sack</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead>
        <tbody>{d.coverages.map(c => <SchemeRow key={c.name}
          onActivate={c.refs?.length ? () => screen.watchRefs(c.refs, `${c.name} — ${c.count} plays`) : undefined}
          label={`${c.name} — ${c.count} plays`}>
          <td>{c.name}</td><td>{c.count}</td><td>{c.comps}</td><td>{c.incs}</td><td>{c.ints}</td><td>{c.sacks}</td>
          <td>{c.yards}</td><td>{avg(c.yards, c.count)}</td><td>{share(c.successes, c.count)}%</td>
        </SchemeRow>)}</tbody>
      </table></div>
    </>}
    {d.blitzes.length > 0 && <>
      <h4 style="margin:16px 0 4px">Blitz Analysis</h4>
      <div class="gi-def-table-wrap"><table class="stats-table stats-table-full">
        <thead><tr><th>Blitz</th><th>#</th><th>Sacks</th><th>Havoc%</th><th>Avg Yds</th><th>Stop%</th></tr></thead>
        <tbody>{d.blitzes.map(b => <SchemeRow key={b.name}
          onActivate={b.refs?.length ? () => screen.watchRefs(b.refs, `${b.name} blitz — ${b.count} plays`) : undefined}
          label={`${b.name} blitz — ${b.count} plays`}>
          <td>{b.name}</td><td>{b.count}</td><td>{b.sacks}</td><td>{share(b.havoc, b.count)}%</td>
          <td>{avg(b.yards, b.count)}</td><td>{share(b.successes, b.count)}%</td>
        </SchemeRow>)}</tbody>
      </table></div>
    </>}
    {(d.earlyDownFronts.fronts.length > 0 || d.passingDownFronts.fronts.length > 0) && <div class="stats-two-col" style="margin-top:12px">
      {[d.earlyDownFronts, d.passingDownFronts].filter(sit => sit.fronts.length > 0).map(sit => <div key={sit.label}>
        <h4 style="margin:8px 0 4px">{sit.label} ({sit.total})</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead>
          <tbody>{sit.fronts.map(([name, count]) => <tr key={name}>
            <td>{name}</td><td>{count}</td><td>{sit.total ? (count / sit.total * 100).toFixed(0) : 0}%</td>
          </tr>)}</tbody>
        </table>
      </div>)}
    </div>}
  </div>;
}

function verdictIcon(v) { return v === 'dominant' ? '▲' : v === 'effective' ? '▬' : '▼'; }
function verdictLabel(v) { return v === 'dominant' ? 'Dominant' : v === 'effective' ? 'Effective' : 'Exploitable'; }

/** One structured recommendation (see `StatsEngine.generateDefensiveSelfScout`'s
 *  own comment) rendered as real JSX -- the SAME selection this section has
 *  always shown, formatted here instead of via `_defScoutRecommendationHtml`'s
 *  HTML-string sink. `item.label`/`tellVal` arrive raw (not pre-escaped),
 *  matching every other JSX text child in this file. */
function DefRecommendation({ item }) {
  switch (item.kind) {
    case 'exploitable-summary':
      return <div class="ss-rec"><strong>{item.count} exploitable defensive tendenc{item.count > 1 ? 'ies' : 'y'}</strong> — a prepared OC will identify and attack these alignments.</div>;
    case 'exploitable-item':
      return <div class="ss-rec"><span class="ss-rec-label">{item.label}</span>: {item.tellType} tell — {item.tellVal} {item.tellPct}% of the time (n={item.n}), but only {item.stopRate}% stop rate. Mix in alternative looks.</div>;
    case 'exploitable-more': {
      const shown = item.names.slice(0, 4).join(', ');
      const extra = item.names.length > 4 ? `, +${item.names.length - 4} more` : '';
      return <div class="ss-rec"><strong>{item.count} more alignments</strong> tip the same way ({shown}{extra}). One change of look covers all of them.</div>;
    }
    case 'dominant':
      return <div class="ss-rec"><span class="ss-rec-label ss-rec-strength">{item.label}</span>: {item.tellVal} {item.tellPct}% is predictable but <strong>working</strong> — {item.stopRate}% stop rate{item.havocRate >= 15 ? `, ${item.havocRate}% havoc` : ''}. The alignment is earning its keep.</div>;
    case 'balanced':
    default:
      return <div class="ss-rec">No strong defensive tells at the current sample size — your scheme mix looks balanced across situations.</div>;
  }
}

/** Defensive Self-Scout -- a real Preact re-derivation of
 *  `StatsEngine._renderDefScoutSection(ds, hideKpis=true)`'s markup (the
 *  exact call DefenseTab always made: the KPI strip is suppressed here
 *  because Defensive Performance, two sections above, already shows the
 *  same numbers). Renders nothing at all when the sample is insufficient,
 *  matching `_defScoutBlock(defScout, showEmpty=false, ...)`'s exact
 *  contract -- the Defense tab's own top-level empty state already covers
 *  that case. */
function DefensiveSelfScout({ defScout, screen }) {
  if (!defScout || defScout.insufficient) return null;
  const engine = screen.app.stats;
  const mc = engine.constructor._meterColor(defScout.predictability);
  return <div class="stats-section ss-def-section">
    <div class="ss-def-header">
      <h3>Defensive Self-Scout</h3>
      <div class="ss-def-summary">{defScout.totalPlays} defensive plays</div>
    </div>
    <div class="ss-def-predictability">Predictability: <span style={{ color: mc, fontWeight: 700 }}>{defScout.predictability}/100 ({defScout.predLabel})</span></div>
    {defScout.recommendations.length > 0 && <div class="ss-recs" style="margin-bottom:12px">
      {defScout.recommendations.map((item, i) => <DefRecommendation key={i} item={item} />)}
    </div>}
    <h4 style="margin:12px 0 6px;font-size:13px;color:var(--text-dim)">Defensive Tendency Tells</h4>
    {defScout.tells.length > 0 ? <table class="stats-table stats-table-full ss-tells">
      <thead><tr><th>Situation</th><th>Type</th><th>Tell</th><th>Lean</th><th>Stop%</th><th>Havoc%</th><th>Assessment</th><th>n</th></tr></thead>
      <tbody>{defScout.tells.map((t, i) => <SchemeRow key={i}
        onActivate={t.refs?.length ? () => screen.watchRefs(t.refs, `${t.label} — ${t.n} plays`) : undefined}
        label={`${t.label} — ${t.n} plays`}>
        <td>{t.label}</td>
        <td><span class="ss-dim">{t.dim}</span></td>
        <td>{t.tellType}</td>
        <td><span class={`ss-bar ss-bar-${t.tellType === 'Blitz' ? 'pass' : 'run'}`} style={{ '--p': `${t.tellPct}%` }}>{t.tellVal} {t.tellPct}%</span></td>
        <td>{t.stopRate}%</td>
        <td>{t.havocRate}%</td>
        <td><span class={`ss-verdict ss-verdict-${t.verdict}`}>{verdictIcon(t.verdict)} {verdictLabel(t.verdict)}</span></td>
        <td>{t.n}</td>
      </SchemeRow>)}</tbody>
    </table> : <p style="color:var(--text-dim)">No defensive scheme tells at the current sample size.</p>}
    {defScout.ddRows.length > 0 && <>
      <h4 style="margin:16px 0 6px;font-size:13px;color:var(--text-dim)">Scheme by Situation</h4>
      <table class="stats-table stats-table-full ss-split">
        <thead><tr><th>Situation</th><th>#</th><th>Top Front</th><th>Top Coverage</th><th>Blitz%</th><th>Stop%</th><th>Havoc%</th><th>Avg Yds</th></tr></thead>
        <tbody>{defScout.ddRows.map(r => <tr key={r.key}>
          <td>{engine._ddPretty(r.key)}</td><td>{r.n}</td>
          <td>{r.topFrontName ? `${r.topFrontName} ${r.topFrontPct}%` : '—'}</td>
          <td>{r.topCovName ? `${r.topCovName} ${r.topCovPct}%` : '—'}</td>
          <td>{r.blitzPct}%</td><td>{r.stopRate}%</td><td>{r.havocRate}%</td><td>{r.avgYds}</td>
        </tr>)}</tbody>
      </table>
    </>}
  </div>;
}

export function DefenseTab({ report, scoped, screen }) {
  const engine = screen.app.stats;
  if (!report.total) return <EmptyState title="No defensive data tagged yet" body="Tag plays as Defense and add the opponent's play type, result and yardage to build this report." />;
  const pct = value => value == null ? 'N/A' : `${value}%`;
  const typeSummary = report.playTypes.filter(row => row.name === 'All Runs' || row.name === 'All Passes');
  const typeDetail = report.playTypes.filter(row => row.name !== 'All Runs' && row.name !== 'All Passes')
    .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
  // Charlie Gate finding #5: a Best Calls table dominated by "Not enough
  // snaps" rows is a large decision table mostly reporting the absence of a
  // decision. Qualified rows (at least one real front/coverage/pressure
  // answer) lead the table; opponent play types with no qualified answer at
  // all collapse behind one disclosure line instead of one dead row each.
  const qualifiedAnswers = report.answers.filter(row => row.front || row.coverage || row.pressure);
  const emptyAnswers = report.answers.filter(row => !row.front && !row.coverage && !row.pressure);
  const scopedStats = engine.compute(scoped);
  const defScout = engine.generateDefensiveSelfScout(scoped);
  const teamName = () => screen.app.gameContext?.snapshot?.()?.teamName || 'Our Defense';
  return <div class="gi-defense-report">
    <div class="gi-def-toolbar">
      <div class="gi-def-scope" role="group" aria-label="Defense report scope">
        <button type="button" data-defense-scope="season" class={screen.defenseScope === 'season' ? 'active' : ''}
          onClick={() => { screen.defenseScope = 'season'; screen._renderActiveTab(); }}>Full season</button>
        <button type="button" data-defense-scope="game" class={screen.defenseScope === 'game' ? 'active' : ''}
          onClick={() => { screen.defenseScope = 'game'; screen._renderActiveTab(); }}>Current game</button>
      </div>
      <button class="btn btn-sm" onClick={() => engine._exportDefensiveReport(engine.compute(scoped), teamName())}>Export Report</button>
    </div>
    <DefSection title="Defensive Performance">
      <div class="gi-def-kpis">
        <div class="gi-def-kpi"><span>Defensive Snaps</span><strong>{report.total}</strong></div>
        <div class="gi-def-kpi"><span>Yards / Play Allowed</span><strong>{report.summary.yardsPerPlay.toFixed(1)}</strong></div>
        <div class="gi-def-kpi"><span>Stop Rate</span><strong>{pct(report.summary.stopRate)}</strong></div>
        <div class="gi-def-kpi"><span>Explosives Allowed</span><strong>{report.summary.explosives}</strong><small>{report.summary.explosiveRate}%</small></div>
        <div class="gi-def-kpi"><span>3rd Down Stop Rate</span><strong>{pct(report.thirdDownStopRate)}</strong></div>
        <div class="gi-def-kpi"><span>Red Zone TD Rate</span><strong>{pct(report.redZoneTdRate)}</strong></div>
        <div class="gi-def-kpi"><span>Takeaways</span><strong>{report.takeaways}</strong></div>
        <div class="gi-def-kpi"><span>Havoc Rate</span><strong>{pct(report.summary.havocRate)}</strong></div>
      </div>
    </DefSection>
    <DefSection title="Opponent Offense by Play Type">
      <div class="gi-def-type-totals">
        {typeSummary.map(row => <WatchableRefs key={row.name} tag="button" type="button" class="gi-def-type-summary"
          refs={row.refs} label={`${row.name} — ${row.n} defensive snaps`} screen={screen}>
          <span>{row.name}</span><strong>{row.n} snaps</strong>
          <small>{row.yardsPerPlay.toFixed(1)} yds/play · {row.stopRate}% stop · {row.explosiveRate}% explosive</small>
        </WatchableRefs>)}
      </div>
      <div class="gi-def-table-wrap">
        <DataTable className="stats-table stats-table-full gi-def-type" columns={defTypeColumns}
          rows={typeDetail.map(row => ({ ...row, id: row.name,
            onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${row.name} — ${row.n} defensive snaps`) : undefined,
            label: `${row.name} — ${row.n} defensive snaps` }))} />
      </div>
    </DefSection>
    {(qualifiedAnswers.length > 0 || emptyAnswers.length > 0) && <DefSection title="Best Calls by Opponent Play Type">
      {qualifiedAnswers.length > 0 && <div class="gi-def-table-wrap"><table class="stats-table stats-table-full gi-def-answers">
        <thead><tr><th>Opponent Play Type</th><th>Best Front</th><th>Best Coverage</th><th>Blitz Decision</th></tr></thead>
        <tbody>{qualifiedAnswers.map(row => <tr key={row.playType}>
          <td><strong>{row.playType}</strong><small>{row.n} snaps</small></td>
          <td><DefAnswerCell answer={row.front} screen={screen} /></td>
          <td><DefAnswerCell answer={row.coverage} screen={screen} /></td>
          <td><DefAnswerCell answer={row.pressure} screen={screen} /></td>
        </tr>)}</tbody>
      </table></div>}
      {emptyAnswers.length > 0 && <p class="viz-caption">{emptyAnswers.length} more opponent play type{emptyAnswers.length === 1 ? '' : 's'} ({emptyAnswers.map(row => row.playType).join(', ')}) didn't have enough snaps for a best-answer call yet.</p>}
    </DefSection>}
    {/* Charlie Gate finding #4: pairing Game Trend with the taller Situational
        Defense table in a fixed two-column row left the shorter side (usually
        Game Trend -- one row per game, often just 1-6 rows) with a large empty
        half-panel below it. Stacked full width instead. */}
    <DefSection title="Game Trend">
      <div class="gi-def-table-wrap">
        <DataTable columns={defGameColumns} rows={defRows(report.byGame, 'defense', screen)} />
      </div>
    </DefSection>
    <DefSection title="Situational Defense">
      <div class="gi-def-table-wrap">
        <DataTable columns={defSitColumns} rows={defRows(report.situations, 'defense', screen)} />
      </div>
    </DefSection>
    <DefSection title="Scheme Detail">
      <SchemeDetail defensive={scopedStats.defensive} screen={screen} />
    </DefSection>
    <DefensiveSelfScout defScout={defScout} screen={screen} />
  </div>;
}

/** One compact phase card (Kickoffs / Kick Returns / Punts / Punt Returns /
 *  Field Goals / Conversions) -- the "phase summary" band. Unlike Defense's
 *  per-row film links, a phase card's content is a fixed handful of aligned
 *  stat lines rather than a table, so the whole card body is one click-to-
 *  film affordance (`WatchableRefs` wrapping `RowList`) instead of wiring
 *  each line separately. Renders nothing clickable when the phase has no
 *  resolvable refs, same rule as every other migrated surface. */
function SpecialTeamsPhase({ phase, screen }) {
  return <Module title={phase.title}>
    <WatchableRefs tag="div" refs={phase.refs} label={phase.label} screen={screen}>
      <RowList rows={phase.rows} />
    </WatchableRefs>
  </Module>;
}

/** Special Teams Presentation Independence -- a real Preact re-derivation of
 *  the legacy `_renderSpecialTeams()`/`_renderConversions()`/
 *  `_renderIndividualStats(stats,'special')` concatenation, recomposed into
 *  the same dense broadcast-density language Overview and Defense already
 *  established (`.gi-overview-board`/KpiBand/Module/DataTable) instead of
 *  reproducing their old three-card layout. No LegacyWidget, no
 *  `dangerouslySetInnerHTML`, no post-render selector binding -- every film
 *  action is a real onClick/onKeyDown closure. Season-capable like Defense:
 *  `stats`/`summary` arrive already scoped to `screen.specialTeamsScope`
 *  (Full season by default), so a phase/table row's own refs are always the
 *  exact composite `gameId::playId` cohort behind its own count, correct
 *  even when two games in the cohort reuse the same bare play id. */
function SpecialTeamsPlayerTable({ table, screen }) {
  return <Module title={table.title}>
    <DataTable columns={table.columns.map(([key, label, numeric]) => ({ key, label, numeric }))}
      rows={table.rows.map(row => {
        const label = `${row.label}'s Special Teams plays`;
        return { ...row, id: row.num, player: row.label,
          onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, label) : undefined, label };
      })} />
  </Module>;
}

/** Native Special Teams report: structured data in, Preact presentation and exact-film actions out. */
export function SpecialTeamsTab({ stats, summary, screen }) {
  const engine = screen.app.stats;
  const st = stats.specialTeams;
  const conv = stats.conversions;
  const hasIndividuals = (stats.individuals?.returners?.length || 0) > 0 || (stats.individuals?.kickers?.length || 0) > 0;
  if (!st?.hasData && !conv?.hasData && !hasIndividuals) {
    return <EmptyState title="No Special Teams snaps charted" body="Chart kickoff, return, punt, field goal, and try units to populate this report." />;
  }
  const kpis = view.specialTeamsKpis(stats, summary);
  const phases = view.specialTeamsPhases(stats);
  const fgHasAttempts = !!st?.fg?.att;
  const fgRows = (st?.fg?.byDist || []).map(bucket => {
    const label = `Field goals ${bucket.label} — ${bucket.att} attempt${bucket.att === 1 ? '' : 's'}`;
    return { id: bucket.label, label, dist: bucket.label, made: bucket.made, att: bucket.att,
      pct: bucket.att ? Math.round(bucket.made / bucket.att * 100) : 0,
      onActivate: bucket.refs?.length ? () => screen.watchRefs(bucket.refs, label) : undefined };
  });
  const tables = view.individualStats(stats, 'special', num => engine._playerLabel(num));
  const returnTable = tables.find(table => table.key === 'returns');
  const specialistTable = tables.find(table => table.key === 'kicking');
  const impactRows = (summary.impact || []).map(item => {
    const label = `${item.label} — ${item.n} play${item.n === 1 ? '' : 's'}`;
    return { id: item.label, type: item.label, plays: item.n,
      onActivate: item.refs?.length ? () => screen.watchRefs(item.refs, label) : undefined, label };
  });
  return <div class="gi-overview-board">
    <div class="gi-st-toolbar">
      <strong class="gi-st-toolbar-label">Special Teams</strong>
      <div class="gi-st-scope" role="group" aria-label="Special Teams report scope">
        <button type="button" class={screen.specialTeamsScope === 'season' ? 'active' : ''}
          onClick={() => { screen.specialTeamsScope = 'season'; screen._renderActiveTab(); }}>Full season</button>
        <button type="button" class={screen.specialTeamsScope === 'game' ? 'active' : ''}
          onClick={() => { screen.specialTeamsScope = 'game'; screen._renderActiveTab(); }}>Current game</button>
      </div>
    </div>
    <KpiBand items={kpis} />
    {phases.length > 0 && <div class="gi-overview-band gi-overview-band-auto">
      {phases.map(phase => <SpecialTeamsPhase key={phase.key} phase={phase} screen={screen} />)}
    </div>}
    {(returnTable || fgHasAttempts || specialistTable || impactRows.length > 0) &&
      <div class={`gi-overview-band gi-st-detail-band${returnTable ? ' has-return-game' : ''}`}>
        {returnTable && <SpecialTeamsPlayerTable table={returnTable} screen={screen} />}
        <div class="gi-st-detail-stack">
          {fgHasAttempts && <Module title="Field Goals by Distance"
            meta={`${st.fg.made}/${st.fg.att} made · ${st.fg.pct}% · long ${st.fg.long || '—'}`}>
            <DataTable columns={[
              { key: 'dist', label: 'Distance' }, { key: 'made', label: 'Made', numeric: true },
              { key: 'att', label: 'Att', numeric: true }, { key: 'pct', label: 'Pct', numeric: true, render: row => `${row.pct}%` },
            ]} rows={fgRows} emptyText="Attempts charted with no distance recorded." />
          </Module>}
          {specialistTable && <SpecialTeamsPlayerTable table={specialistTable} screen={screen} />}
          {impactRows.length > 0 && <Module title="Impact Plays"
            meta={`${impactRows.reduce((sum, row) => sum + row.plays, 0)} total`}>
            <DataTable columns={[
              { key: 'type', label: 'Result' }, { key: 'plays', label: 'Plays', numeric: true },
            ]} rows={impactRows} />
          </Module>}
        </div>
      </div>}
  </div>;
}
/** Native Matchup resolves every displayed tendency against its own stamped
 * cross-game cohort. It never falls through to the active game's tagger. */
function matchupRefs(plays, engine, cutType, cutVal) {
  const predicate = engine._buildCutFilter(cutType, cutVal);
  return [...new Set((plays || []).filter(predicate).map(engine.constructor._compositeRef).filter(Boolean))].sort();
}

function MatchupOffense({ title, lane, screen }) {
  const stats = lane.stats;
  const engine = screen.app.stats;
  if (!lane.plays.length) return <div class="gi-matchup-side is-empty"><h4>{title}</h4><p>No offensive snaps charted.</p></div>;
  const tendencies = view.tendencyBreakdown(stats);
  const rows = (source, kind) => source.slice(0, 4).map(row => {
    const refs = matchupRefs(lane.plays, engine, row.cutType, row.cutVal);
    return { ...row, kind, id: `${kind}-${row.name}`, onActivate: refs.length ? () => screen.watchRefs(refs, `${title}: ${row.name}`) : undefined, label: `${title}: ${row.name}` };
  });
  const profiles = [...rows(tendencies.formations, 'Formation'), ...rows(tendencies.playTypes, 'Play type')];
  return <div class="gi-matchup-side is-offense">
    <h4>{title}</h4>
    <div class="gi-matchup-kpis">{view.offenseHero(stats, engine).slice(0, 5).map(item => <div key={item.label} class={item.tone || ''}><span>{item.label}</span><strong>{item.value}</strong><small>{item.sub || ''}</small></div>)}</div>
    <DataTable columns={[
      { key:'kind', label:'Profile' }, { key:'name', label:'Name' }, { key:'count', label:'Plays', numeric:true },
      { key:'runPass', label:'Run/Pass', render:row => { const total=row.runs+row.passes; const runPct=total?Math.round(row.runs/total*100):0; return `${row.runs}R (${runPct}%) / ${row.passes}P (${100-runPct}%)`; } },
      { key:'ypp', label:'Yds/play', numeric:true }, { key:'success', label:'Success' },
    ]} rows={profiles} />
  </div>;
}

function MatchupDefense({ title, lane, screen }) {
  const report = lane.report;
  if (!lane.plays.length || !report.total) return <div class="gi-matchup-side is-empty"><h4>{title}</h4><p>No defensive snaps charted.</p></div>;
  const summary = report.summary;
  const def = lane.stats.defensive || {};
  const playRows = report.playTypes.filter(row => row.name !== 'All Runs' && row.name !== 'All Passes').slice(0, 4).map(row => ({
    kind:'Play type', name:row.name, count:row.n, ypp:row.yardsPerPlay.toFixed(1), result:`${row.stopRate}% stop`, refs:row.refs,
  }));
  const schemeRows = [
    ...(def.fronts || []).slice(0, 3).map(row => ({ kind:'Front', name:row.name, count:row.count, ypp:row.count ? (row.yards / row.count).toFixed(1) : '0.0', result:`${row.count ? Math.round(row.successes / row.count * 100) : 0}% stop`, refs:row.refs })),
    ...(def.coverages || []).slice(0, 3).map(row => ({ kind:'Coverage', name:row.name, count:row.count, ypp:row.count ? (row.yards / row.count).toFixed(1) : '0.0', result:`${row.count ? Math.round(row.successes / row.count * 100) : 0}% stop`, refs:row.refs })),
  ];
  const rows = [...playRows, ...schemeRows].map(row => ({ ...row, id:`${row.kind}-${row.name}`, onActivate:row.refs?.length ? () => screen.watchRefs(row.refs, `${title}: ${row.name}`) : undefined, label:`${title}: ${row.name}` }));
  return <div class="gi-matchup-side is-defense">
    <h4>{title}</h4>
    <div class="gi-matchup-kpis">
      <div><span>Snaps</span><strong>{report.total}</strong></div>
      <div><span>Yds/play allowed</span><strong>{summary.yardsPerPlay.toFixed(1)}</strong></div>
      <div><span>Stop rate</span><strong>{summary.stopRate}%</strong></div>
      <div><span>Explosive allowed</span><strong>{summary.explosiveRate}%</strong></div>
      <div><span>Havoc</span><strong>{summary.havocRate}%</strong></div>
    </div>
    <DataTable columns={[
      {key:'kind',label:'Profile'},{key:'name',label:'Name'},{key:'count',label:'Snaps',numeric:true},
      {key:'ypp',label:'Yds/play',numeric:true},{key:'result',label:'Result'},
    ]} rows={rows} />
  </div>;
}
export function MatchupTab({ model, screen }) {
  if (!model.opponent) return <EmptyState title="No opponent matchup yet" body="Chart the front and coverage you face, or add an Opponent Scout game, to compare both sides of the ball." />;
  const { opponent, opponents, lanes } = model;
  const hasFirst = lanes.ourOffense.plays.length > 0 && lanes.theirDefense.plays.length > 0;
  const hasSecond = lanes.ourDefense.plays.length > 0 && lanes.theirOffense.plays.length > 0;
  const missing = [];
  if (!hasFirst) missing.push('Their defense: chart the front and coverage you face on offensive snaps.');
  if (!hasSecond) missing.push('Their offense: chart formation and play type on defensive snaps.');
  return <div class="gi-overview-board gi-matchup-board">
    <div class="gi-matchup-toolbar">
      <div><span>Opponent matchup</span><strong>{opponent.name}</strong><small>{opponent.games} game{opponent.games === 1 ? '' : 's'} charted · {opponent.offPlays.length} offensive · {opponent.defPlays.length} defensive snaps</small></div>
      {opponents.length > 1 && <label>Opponent<select value={opponent.name} onChange={event => { screen.matchupOpponent = event.currentTarget.value; screen._renderActiveTab(); }}>{opponents.map(item => <option key={item.name} value={item.name}>{item.name} · {item.offPlays.length} O / {item.defPlays.length} D</option>)}</select></label>}
    </div>
    {hasFirst && <Module title={`Our offense vs ${opponent.name} defense`} meta="production against the structure they show"><div class="gi-matchup-pair"><MatchupOffense title="Our Offense" lane={lanes.ourOffense} screen={screen} /><MatchupDefense title={`${opponent.name} Defense`} lane={lanes.theirDefense} screen={screen} /></div></Module>}
    {hasSecond && <Module title={`Our defense vs ${opponent.name} offense`} meta="our answers against what they run"><div class="gi-matchup-pair"><MatchupDefense title="Our Defense" lane={lanes.ourDefense} screen={screen} /><MatchupOffense title={`${opponent.name} Offense`} lane={lanes.theirOffense} screen={screen} /></div></Module>}
    {missing.length > 0 && <Module title="Not charted yet"><ul class="gi-matchup-missing">{missing.map(item => <li key={item}>{item}</li>)}</ul></Module>}
  </div>;
}
function InlineReportText({ html }) {
  const doc = new DOMParser().parseFromString('<body>' + (html || '') + '</body>', 'text/html');
  const node = (item, key) => {
    if (item.nodeType === 3) return item.nodeValue;
    if (item.nodeType !== 1) return null;
    const children = [...item.childNodes].map((child, i) => node(child, key + '-' + i));
    if (item.tagName === 'STRONG' || item.tagName === 'B') return <strong key={key}>{children}</strong>;
    if (item.tagName === 'SPAN') {
      const allowed = ['ss-rec-label', 'ss-rec-strength'].filter(name => item.classList.contains(name));
      return <span key={key} class={allowed.join(' ') || undefined}>{children}</span>;
    }
    return item.textContent;
  };
  return <>{[...doc.body.childNodes].map((item, i) => node(item, i))}</>;
}
function SelfScoutSplitTable({ rows, label, cutType, screen }) {
  if (!rows?.length) return null;
  const engine = screen.app.stats;
  return <DataTable className="stats-table stats-table-full ss-split" columns={[
    { key:'display', label }, { key:'n', label:'#', numeric:true },
    { key:'runPct', label:'Run', numeric:true, render:r => <span class="ss-split-bar ss-bar-run" style={{'--p':r.runPct+'%'}}>{r.runPct}%</span> },
    { key:'passPct', label:'Pass', numeric:true, render:r => <span class="ss-split-bar ss-bar-pass" style={{'--p':r.passPct+'%'}}>{r.passPct}%</span> },
    { key:'runAvg', label:'R Avg', numeric:true }, { key:'passAvg', label:'P Avg', numeric:true },
    { key:'succRate', label:'Succ%', numeric:true, render:r => r.succRate+'%' },
    { key:'leanPct', label:'Read', numeric:true, render:r => r.tell ? <span class="ss-flag">{r.lean} {r.leanPct}%</span> : <span class="ss-ok">Balanced</span> },
  ]} rows={rows.map(r => {
    const display = label === 'Down & Dist' ? engine._ddPretty(r.key) : r.key;
    const filmLabel = display + ' — ' + r.n + ' plays';
    return {...r,id:r.key,display,label:filmLabel,onActivate:cutType ? () => screen.watchCut(cutType,r.key,filmLabel) : undefined};
  })}/>;
}
function SelfScoutTells({ tells, screen }) {
  if (!tells?.length) return <p class="viz-caption">No strong tells at the current sample size.</p>;
  return <DataTable className="stats-table stats-table-full ss-tells" columns={[
    {key:'label',label:'Situation'}, {key:'dim',label:'Type',render:r=><span class="ss-dim">{r.dim}</span>},
    {key:'leanPct',label:'Tendency',numeric:true,render:r=><span class={'ss-bar ss-bar-'+(r.lean==='Run'?'run':'pass')} style={{'--p':r.leanPct+'%'}}>{r.lean} {r.leanPct}%</span>},
    {key:'leanAvg',label:'Avg',numeric:true}, {key:'leanSuccRate',label:'Succ%',numeric:true,render:r=>r.leanSuccRate+'%'},
    {key:'verdict',label:'Assessment',render:r=><span class={'ss-verdict ss-verdict-'+r.verdict}>{verdictIcon(r.verdict)} {verdictLabel(r.verdict)}</span>},
    {key:'n',label:'n',numeric:true},
  ]} rows={tells.map((t,i)=>({...t,id:t.dim+'-'+t.label+'-'+i,class:'ss-verdict-'+t.verdict,onActivate:t.cutType?()=>screen.watchCut(t.cutType,t.cutVal,t.label+' — '+t.n+' plays'):undefined}))}/>;
}
function SelfScoutPersonnel({ items, screen }) {
  const rows=(items||[]).filter(x=>x.topPct>=75).map(x=>({...x,id:x.personnel,
    distribution:x.formations.map(f=>f.formation+' '+f.pct+'%').join(' · '),
    read:x.topPct>=90?'Locked':'Leaning',label:x.personnel+' personnel — '+x.n+' plays',
    onActivate:()=>screen.watchCut('personnel',x.personnel,x.personnel+' personnel — '+x.n+' plays')}));
  if(!rows.length)return null;
  return <Module title="Personnel to Formation" meta="what the huddle gives away" cls="ss-personnel-diversity"><DataTable columns={[
    {key:'personnel',label:'Personnel'},{key:'n',label:'#',numeric:true},{key:'uniqueFormations',label:'Forms',numeric:true},
    {key:'topFormation',label:'Top Formation'},{key:'topPct',label:'Top %',numeric:true,render:r=>r.topPct+'%'},
    {key:'distribution',label:'Distribution'},{key:'read',label:'Read'}
  ]} rows={rows}/></Module>;
}
function SelfScoutMatrix({ matrix, screen }) {
  const view=screen.app.stats._selfScoutMatrixView(matrix);
  if(!view)return null;
  return <Module title="Predictability Map" meta={'formation by situation · '+view.baseline+'% success baseline'}>
    <p class="viz-caption">Red is predictable and below your normal success; gold is predictable but working; low samples stay neutral. Select any populated cell to watch it.</p>
    <div class="sm-wrap"><table class="stats-table stats-table-full sm-table"><thead><tr><th class="sm-corner">Formation / Situation</th>{view.cols.map(c=><th key={c.key}>{c.label}</th>)}</tr></thead>
    <tbody>{view.rows.map(row=><tr key={row.formation}><th class="sm-row-label">{row.formation} <span class="sm-rown">n={row.n}</span></th>{row.cells.map(v=>{
      const c=v.situation; if(v.empty)return <td key={c.key} class="sm-cell sm-empty"><span class="sm-nodata">No data</span></td>;
      const label=row.formation+' on '+c.label+' — '+v.cell.n+' plays';
      return <Watchable key={c.key} tag="td" class={'sm-cell is-'+v.state} onActivate={()=>screen.watchCut('comboFS',row.formation+'__'+c.key,label)} label={label}>
        <span class="sm-lean">{v.lean} {v.leanPct}%</span><span class="sm-n">n={v.cell.n}{v.strong?'':' · low'}</span>
      </Watchable>;})}</tr>)}</tbody></table></div>
  </Module>;
}
function SelfScoutDefense({ defScout, performance, screen }) {
  if(!defScout||defScout.insufficient){
    const dp=defScout?.defPlays||0,sp=defScout?.schemePlays||0;
    const body=!dp?'No defensive plays are tagged yet. Chart defensive snaps to see what your fronts, coverages, and pressures reveal.':!sp?dp+' defensive plays are charted, but none include Front, Coverage, or Blitz.':sp+' scheme-tagged defensive plays are available; six are needed to identify reliable tendencies.';
    return <EmptyState title="Defensive Self-Scout" body={body}/>;
  }
  const d=performance.defensive||{},plays=performance.defPlays||[];
  const stop=plays.length?Math.round(plays.filter(p=>!screen.app.stats._isSuccessfulPlay(p)).length/plays.length*100):0;
  const ypp=plays.length?(plays.reduce((sum,p)=>sum+(parseInt(p.tags.yardage)||0),0)/plays.length).toFixed(1):'0.0';
  return <div class="gi-selfscout-defense"><KpiBand items={[
    {label:'Stop Rate',value:stop+'%'},{label:'Yards Allowed / Play',value:ypp},{label:'Havoc Rate',value:(d.havocRate||'0.0')+'%'},
    {label:'Sacks',value:d.sacks||0},{label:'TFL',value:d.tfl||0},{label:'Takeaways',value:d.turnovers||0},
  ]}/><DefensiveSelfScout defScout={defScout} screen={screen}/></div>;
}
export function SelfScoutTab({ report, defScout, performance, callRows, screen }) {
  const engine=screen.app.stats;
  if(!report)return <div class="gi-selfscout-board"><EmptyState title="No offensive self-scout yet" body="Tag Run/Pass or Play Type on offensive snaps to reveal your tendencies."/><SelfScoutDefense defScout={defScout} performance={performance} screen={screen}/></div>;
  const e=performance.efficiency||{},d=performance.downs||{},rz=performance.situational?.redZone||{},neg=performance.negativePlays||{};
  const color=engine.constructor._meterColor(report.predictability);
  return <div class="gi-selfscout-board">
    <div class="gi-selfscout-toolbar"><div><strong>Self-Scout</strong><span>{report.totalPlays} classified offensive plays</span></div>
      <button class="btn btn-sm" onClick={()=>engine._exportSelfScout(report,screen.app.gameContext.snapshot().teamName||'Our Offense')}>Export Report</button></div>
    <KpiBand items={[
      {label:'Success Rate',value:(e.successRate||'0.0')+'%'},{label:'Yards / Play',value:engine.constructor.yardsPerPlay(performance)},
      {label:'Explosive Rate',value:(e.explosivePct||'0.0')+'%'},{label:'Negative Plays',value:(e.negativePct||'0.0')+'%'},
      {label:'Third Down',value:(d.thirdDownPct||'0.0')+'%'},{label:'Red Zone TD',value:rz.total?Math.round((rz.tds||0)/rz.total*100)+'%':'N/A'},
    ]}/>
    <div class="gi-overview-band gi-selfscout-answer-band">
      <Module title="Top Tells" meta="select a row to watch film"><SelfScoutTells tells={report.tells} screen={screen}/></Module>
      <Module title="Recommendations" meta="what to keep and what to break"><div class="ss-recs">{report.recommendations.map((x,i)=><div class="ss-rec" key={i}><InlineReportText html={x}/></div>)}</div></Module>
    </div>
    {report.downDistRows.length>0&&<Module title="Situational Performance" meta="run/pass mix and production by down"><SelfScoutSplitTable rows={report.downDistRows} label="Down & Dist" cutType="dd" screen={screen}/></Module>}
    {callRows.length>0&&<Module title="Call and Concept Performance" meta="charted calls and concepts"><SelfScoutSplitTable rows={callRows} label="Call / Concept" cutType="playCallOrConcept" screen={screen}/></Module>}
    <Module title="Negative & Explosive Plays" meta="where possessions are won or lost"><div class="gi-selfscout-event-grid">{[
      ['Explosive Rate',(e.explosivePct||'0.0')+'%'],['Negative Plays',neg.distinct||0],['Turnovers',neg.turnovers||0],
      ['Sacks',neg.lossSacks||0],['Plays for Loss',neg.lossTotal||0],['Penalties',neg.penalties||0],
    ].map(([l,v])=><div key={l}><span>{l}</span><strong>{v}</strong></div>)}</div></Module>
    <div class="gi-selfscout-tier"><span>Tendencies and predictability</span></div>
    <div class="gi-overview-band gi-selfscout-splits">
      {report.formationRows.length>0&&<Module title="By Formation" meta={report.formationRows.length+' looks'}><SelfScoutSplitTable rows={report.formationRows} label="Formation" cutType="formation" screen={screen}/></Module>}
      {report.personnelRows.length>0&&<Module title="By Personnel" meta={report.personnelRows.length+' groupings'}><SelfScoutSplitTable rows={report.personnelRows} label="Personnel" cutType="personnel" screen={screen}/></Module>}
    </div>
    <SelfScoutPersonnel items={report.personnelDiversity} screen={screen}/>
    <Module title="Predictability" meta={report.predLabel+' · '+report.totalPlays+' plays'}><div class="gi-selfscout-meter"><div><span style={{width:report.predictability+'%',background:color}}/></div><strong style={{color}}>{report.predictability}<small>/100</small></strong><p>0 is balanced; 100 is one-dimensional. Weighted by the largest run/pass share in each qualified situation.</p></div></Module>
    <SelfScoutMatrix matrix={report.matrix} screen={screen}/>
    {report.insights.length>0&&<Module title="Film Room Insights" meta={report.insights.length+' coaching reads'}><div class="ss-insights">{report.insights.map((x,i)=><div class={'ss-insight ss-insight-'+x.type} key={i}><span class={'ss-insight-tag ss-tag-'+x.type}>{x.tag}</span><span class="ss-insight-text"><InlineReportText html={x.text}/></span></div>)}</div></Module>}
    <div class="gi-selfscout-tier"><span>Defensive self-scout</span></div><SelfScoutDefense defScout={defScout} performance={performance} screen={screen}/>
  </div>;
}
export function ReportPane({ tab, html, children, opponent }) {
  // The real fix for the LegacyHtml/component reconciliation hazard lives in
  // ReportsScreen._renderActiveTab(), which calls `render(null, this.content)`
  // before every tab switch — a genuine full unmount, so no diff is ever
  // computed against a tree a LegacyHtml sibling's raw `innerHTML=` write may
  // have invalidated. (Reproduced live: without it, switching straight from
  // Defense (legacy) to Offense (native) left the OLD legacy empty-state text
  // on screen with zero errors thrown anywhere.) `key` here is now inert
  // (nothing survives the unmount for a key to distinguish) but harmless.
  return <section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane={tab}
    data-report-perspective-pane={opponent ? 'opponent' : undefined}>
    {children != null ? <div key={`native-${tab}`}>{children}</div> : <LegacyHtml key={`legacy-${tab}`} html={html} />}
  </section>;
}

function LegacyHtml({ html }) {
  return <div ref={el => { if (el && el.__lastHtml !== html) { el.innerHTML = html; el.__lastHtml = html; } }} />;
}
