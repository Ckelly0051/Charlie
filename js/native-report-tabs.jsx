/**
 * Reports Presentation Independence — real Preact tab components.
 *
 * ReportsScreen computes/aggregates (delegating every formula to StatsEngine)
 * and passes the result to these components. No component here recomputes a
 * football value; each reads a pre-computed field off `stats`/a report object
 * and turns it into markup. Film clicks call screen methods directly — no
 * post-render DOM query/rebind pass.
 */
import { useMemo, useState } from 'preact/hooks';
import { Hero, KpiBand, Module, RowList, DataTable, TileGrid, Watchable, WatchableRefs, ChartBody, EmptyState, ReportSectionBar, DownDistanceChart } from './native-report-kit.jsx';
import * as view from './reports-view.js';
import { SpecialTeamsModel } from './special-teams.js';
import { Charts } from './charts.js';
import { NativeHeatMaps } from './native-offense-visuals.jsx';
import { DefenseTab } from './native-defense-board.jsx';

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
const directionStrengthColumns = [
  { key: 'name', label: 'Direction' },
  { key: 'count', label: 'Snaps', numeric: true },
  { key: 'runs', label: 'Run Rate', numeric: true },
  { key: 'passes', label: 'Pass Rate', numeric: true },
  { key: 'ypp', label: 'Yds/play', numeric: true },
  { key: 'success', label: 'Success' },
];
function breakdownRows(rows, screen) {
  // A held slot passes through untouched: no cut, no film, no label.
  return rows.map(row => (row.absent ? row
    : { ...row, onActivate: () => screen.watchCut(row.cutType, row.cutVal, row.cutLabel), label: row.cutLabel }));
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

/* The approved Overview composition is the SCHEMA: each module renders the row
   count the comp renders, on every game, so the board is one fixed height
   instead of a shape that moves with the data. Read off the canonical capture
   `design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`.

   A module whose rows enumerate a fixed football set already met this by
   construction — Snaps by phase 3, Situational 6, Key metrics 6, Rushing 7,
   Passing 8, Defense & discipline 6. The four below are RANKED lists, which
   need the count stated because their source can supply more or fewer, and
   ranking is what decides which entries occupy the fixed rows. */
const OVERVIEW_ROWS = {
  'Down & distance': 5,
  'Top 10 Plays': 10,  // both sides of the ball, ranked together
  'Drives': 8,         // per drives module: ours, and theirs
};

export function OverviewTab({ stats, screen, gameLabels = null }) {
  /* Literal absence, not instruction. The previous body ("Tag Play Type,
     Result, and Yardage to build the report...") told the coach how to use the
     charting deck from inside a report; the approved Overview carries no such
     prose, and the copy standard states the object and the available action.
     Same shape the Players and Self-Scout boards already use. */
  if (!stats.allPlays) return <EmptyState title="No charted plays" body="No plays are charted for this game."
    action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown?.() }} />;
  const engine = screen.app.stats;
  const cut = (type, val, label) => () => screen.watchCut(type, val, label);
  const phase = view.snapsByPhase(stats);
  const tiles = view.situationalTiles(stats).map(t => ({ ...t, onActivate: t.plays ? cut(t.cutType, t.cutVal, t.cutLabel) : undefined }));
  const yards = view.yardsByType(stats, engine);
  const dd = view.downDistanceRows(stats, engine, OVERVIEW_ROWS['Down & distance']);
  const bigPlays = view.bigPlaysRows(stats, engine, gameLabels, OVERVIEW_ROWS['Top 10 Plays']);
  /* The rows are padded to the fixed count; the meta must state how many plays
     actually exist. igPlays.length is always the schema count, so it said
     10 total for a game with five measured plays and five absence slots. */
  const bigPlaysReal = bigPlays.filter(row => !row.absent).length;
  const drives = view.drivesRows(stats, gameLabels, OVERVIEW_ROWS['Drives']);
  const drivesAllowed = view.opponentDrivesRows(stats, engine, gameLabels, OVERVIEW_ROWS['Drives']);
  const oppRush = view.opponentRushingRows(stats, engine);
  const oppPass = view.opponentPassingRows(stats, engine);
  const driveList = rows => rows.map((drive, i) => drive.absent
    ? <div key={`absent-${i}`} class="gi-overview-drive is-absent"><span>{view.ABSENT_SLOT}</span><i /><small>{view.ABSENT_SLOT}</small></div>
    : <Watchable key={`${drive.number}-${drive.refs[0] || ''}`} class="gi-overview-drive" onActivate={() => {
      if (drive.refs.length) screen.watchRefs(drive.refs, `Drive ${drive.number}`);
      else { const ids = new Set(drive.playIds.map(String)); screen.watchPredicate(p => ids.has(String(p.id)), `Drive ${drive.number}`); }
    }} label={`Drive ${drive.number}`}>
      <span>D{drive.number}{drive.game && <em>{drive.game}</em>}</span><i><b style={`--w:${drive.widthPct}%`} /></i><small>{drive.outcome}</small>
    </Watchable>);

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
    {/* Four modules, one comparison: our production beside what we allowed.
        A defensive snap records the opponent's offense, so the same rushing
        and passing formulas measure both sides and the rows line up label for
        label. Offense first on each row, defense beneath it. */}
    <div class="gi-overview-band gi-overview-band-4 gi-overview-production">
      <Module title="Rushing" meta={view.rushingRows(stats).meta} cls="is-offense"><RowList rows={view.rushingRows(stats).rows} /></Module>
      <Module title="Passing" meta={view.passingRows(stats).meta} cls="is-offense"><RowList rows={view.passingRows(stats).rows} /></Module>
      <Module title="Rushing allowed" meta={oppRush.meta} cls="is-defense"><RowList rows={oppRush.rows} /></Module>
      <Module title="Passing allowed" meta={oppPass.meta} cls="is-defense"><RowList rows={oppPass.rows} /></Module>
    </div>
    <div class="gi-overview-band gi-overview-band-3 gi-overview-decisions">
      <Module title="Down &amp; distance" meta="run/pass mix and production">
        <table><thead><tr><th>Situation</th><th>Snaps</th><th>Run / pass</th><th>Yds/play</th><th>Success</th><th>Conv</th></tr></thead><tbody>
          {dd.map((row, i) => row.absent
            ? <tr key={`absent-${i}`} class="is-absent">{Array.from({ length: 6 }, (_, c) => <td key={c}>{view.ABSENT_SLOT}</td>)}</tr>
            : <Watchable key={row.situation} tag="tr" onActivate={cut(row.cutType, row.cutVal, row.cutLabel)} label={row.cutLabel}>
            <td>{row.situation}</td><td>{row.snaps}</td>
            <td><span class="gi-mini-mix"><i style={`--n:${row.runPct}`} /><i style={`--n:${row.passPct}`} /></span>{row.runPct} / {row.passPct}</td>
            <td>{row.ypp}</td><td>{row.success}</td><td>{row.conv}</td>
          </Watchable>)}
        </tbody></table>
      </Module>
      <Module title="Yards by type" meta={`${yards.total} total${yards.other ? ` · ${yards.other} other` : ''}`} cls="is-offense">
        <div class="gi-yards-split"><i style={`--n:${yards.rushWidth}`} /><i style={`--n:${yards.passWidth}`} /></div>
        <div class="gi-yards-legend"><span>Rush {yards.rush}</span><span>Pass {yards.pass}</span></div>
        <DataTable columns={[
          { key: 'name', label: 'Play type' }, { key: 'snaps', label: 'Snaps', numeric: true }, { key: 'ypp', label: 'Yds/play', numeric: true }, { key: 'success', label: 'Success' },
        ]} rows={yards.rows.map(row => ({ ...row,
          onActivate: row.plays ? cut(row.cutType, row.cutVal, row.cutLabel) : undefined, label: row.cutLabel }))} />
      </Module>
      <Module title="Defense &amp; discipline" meta={view.defenseDisciplineRows(stats, engine).meta} cls="is-defense">
        <RowList rows={view.defenseDisciplineRows(stats, engine).rows} />
      </Module>
    </div>
    <div class="gi-overview-band gi-overview-support">
      <Module title="Top 10 Plays" meta={`${bigPlaysReal} total`} cls="is-offense">
        <table><thead><tr>{gameLabels&&<th>Game</th>}<th>Play</th><th>Situation</th><th>Call</th><th>Yds</th></tr></thead><tbody>
          {bigPlays.map((play, i) => play.absent
            ? <tr key={`absent-${i}`} class="is-absent">{Array.from({ length: gameLabels ? 5 : 4 }, (_, c) => <td key={c}>{view.ABSENT_SLOT}</td>)}</tr>
            : <Watchable key={play.ref || play.id} tag="tr" class={play.side === 'them' ? 'is-them' : 'is-us'} onActivate={() => play.ref ? screen.watchRefs([play.ref], `Play ${play.id}`) : screen.watchPredicate(p => String(p.id) === String(play.id), `Play ${play.id}`)} label={`Play ${play.id}`}>
            {gameLabels&&<td>{play.game}</td>}<td>{play.id}</td><td>{play.situation}</td><td>{play.call}</td><td>{play.yards}</td>
          </Watchable>)}
        </tbody></table>
      </Module>
      <div class="gi-overview-support-stack">
        {/* Middot, per the approved Overview ("12 drives · 5 scored"). Ours on
            top, theirs beneath: the opponent's drives ARE our defensive
            performance, reconstructed from the same snaps by the same rule. */}
        <Module title="Offensive Drives" meta={`${drives.total} drives · ${drives.scoring} scored`} cls="is-offense">
          <div class="gi-overview-drives">{driveList(drives.rows)}</div>
        </Module>
        <Module title="Defensive Drives" meta={`${drivesAllowed.total} drives · ${drivesAllowed.scoring} scored`} cls="is-defense">
          <div class="gi-overview-drives is-defense">{driveList(drivesAllowed.rows)}</div>
        </Module>
      </div>
    </div>
  </div>;
}

/**
 * The three Play Calls surfaces the approved Offense composition places in two
 * different bands: call performance (wide), the concept roll-up (narrow), and
 * calls-by-situation. They share one `_playCallAnalysis` result so the engine
 * is asked once, and every row keeps the exact composite-ref film activation it
 * had when all three lived inside a single module.
 */
function playCallParts({ stats, screen }) {
  const engine = screen.app.stats;
  const analysis = engine._playCallAnalysis(stats.offPlays);
  /* NEVER null. These are three modules of the approved composition; returning
     null removed them from the board entirely, so a game with no resolvable
     call identity rendered a different board from one that had them. Each now
     holds its slot and states the absence, which is what the comp's own sparse
     capture does. */
  const gameId = screen.app.storage?.seasonStore?.activeGame?.()?.id || '';
  const pct = v => `${Number(v || 0).toFixed(1).replace(/\.0$/, '')}%`;
  const refsFor = row => row.refs?.length ? row.refs : row.playIds.map(id => `${gameId}::${id}`);
  const watch = (row, label) => () => screen.watchRefs(refsFor(row), label);

  const calls = <Module title="Play calls" cls="is-offense"
    meta={`${analysis.eligible} plays`}>
    <DataTable emptyText="Insufficient charted data" columns={[
      { key: 'name', label: 'Play Call' }, { key: 'concept', label: 'Concept', tl: true }, { key: 'n', label: 'Plays', numeric: true },
      { key: 'share', label: 'Frequency', numeric: true }, { key: 'success', label: 'Success Rate', numeric: true },
      { key: 'ypp', label: 'Yds/Play', numeric: true }, { key: 'explosive', label: 'Explosive Plays Rate', numeric: true }, { key: 'negative', label: 'Negative', numeric: true },
    ]} rows={mapFit(analysis.calls, OFFENSE_ROWS['Play calls'], row => ({
      id: row.name, name: row.name, concept: row.concept || '—', n: row.n, share: pct(row.sharePct), success: pct(row.successRate),
      ypp: row.yardsPerPlay.toFixed(1), explosive: pct(row.explosiveRate), negative: pct(row.negativeRate),
      onActivate: watch(row, `Play Call: ${row.name}`), label: `Play Call: ${row.name}`,
    }))} />
  </Module>;

  const concepts = <Module title="Concepts" meta="call family roll-up">
    <DataTable emptyText="Insufficient charted data" columns={[
      { key: 'name', label: 'Concept / Call' }, { key: 'n', label: 'Plays', numeric: true }, { key: 'success', label: 'Success Rate', numeric: true }, { key: 'ypp', label: 'Yds/Play', numeric: true },
    ]} rows={fitRows(analysis.concepts.flatMap(concept => [
      { id: `c-${concept.name}`, name: concept.name, n: concept.n, success: pct(concept.successRate), ypp: concept.yardsPerPlay.toFixed(1), onActivate: watch(concept, `Concept: ${concept.name}`), label: `Concept: ${concept.name}` },
      ...concept.calls.map(call => ({ id: `${concept.name}-${call.name}`, class: 'is-sub', name: call.name, n: call.n, success: pct(call.successRate), ypp: call.yardsPerPlay.toFixed(1), onActivate: watch(call, `Play Call: ${call.name}`), label: `Play Call: ${call.name}` })),
    ]), OFFENSE_ROWS.Concepts)} />
  </Module>;

  /* A FIXED internal schema, not a data-sized one. Capping the total rows at
     eight still let the number of lens headings and nested tables vary, so
     eight rows split across one lens or three produced different heights. The
     module now always renders the same lenses, in the same order, each holding
     the same row count — `OFFENSE_LENSES` × `OFFENSE_LENS_ROWS`. A lens the
     film cannot fill holds its rows with the dash, exactly as every other
     table on this board does. Ranking inside a lens is its own (most-faced
     situation first), not a re-sort invented here. */
  const lensRows = new Map(OFFENSE_LENSES.map(([lens, cap]) => [lens, fitRows(
    analysis.situations.filter(row => row.lens === lens)
      .sort((a, b) => b.contextN - a.contextN || a.value.localeCompare(b.value)),
    cap)]));
  const renderLenses = lenses => <div class="gi-call-context-grid">{lenses.map(lens => {
      const rows = lensRows.get(lens);
      return <div class="gi-call-context" key={lens}><h4>{lens}</h4><DataTable emptyText="Insufficient charted data" columns={[
        { key: 'value', label: 'Situation' }, { key: 'call', label: 'Top Call', tl: true }, { key: 'use', label: 'Use' }, { key: 'success', label: 'Success Rate', numeric: true }, { key: 'ypp', label: 'Yds/Play', numeric: true },
      ]} rows={rows.map((row, i) => (row.absent ? { absent: true, id: `${lens}-absent-${i}` }
        : { id: `${lens}-${row.value}`, value: row.value, call: row.call, use: `${row.n}/${row.contextN}`, success: pct(row.successRate), ypp: row.yardsPerPlay.toFixed(1),
          onActivate: watch(row, `${lens}: ${row.value} — ${row.call}`), label: `${lens}: ${row.value} — ${row.call}` }))} /></div>;
    })}</div>;
  const situations = <Module title="Calls by situation">
    {renderLenses(['Down & Distance', 'Field Position'])}
  </Module>;
  return { calls, concepts, situations };
}


/**
 * `data.to90` is the computed count of calls covering 90% of snaps, so the
 * "Big N" is derived from the eligible rows in BOTH variants — never a literal.
 *
 * `variant='zone'` is the redesigned Offense tab's shortened title (approved
 * label change, RATIONALE §5: the team name is already in the context bar and
 * the page title). `variant='legacy'` is what OPPONENT Offense still renders;
 * that tab has not had its design pass and must not change here.
 */
function BigTwelve({ data, screen, cls = '', variant = 'legacy' }) {
  /* The zone variant holds its slot: this is an approved module, and returning
     null removed it from the board on a game with no eligible tendency. The
     legacy variant (Opponent Offense) keeps its previous behaviour. */
  if (!data) return variant === 'zone'
    ? <Module title="Core tendencies" cls={cls}><p class="gi-table-empty">Insufficient charted data</p></Module>
    : null;
  /* N is the count of rows the module actually RENDERS, per RATIONALE \u00a78
     ("N computed from the rendered rows") and the honest-limit rule. `to90` \u2014
     the calls covering 90% of snaps \u2014 can exceed the approved slot count, and
     printing it above eight rows claimed a breadth the table was not showing. */
  const zoneRows = fitRows(data.rows || [], OFFENSE_ROWS['Core tendencies']);
  const title = variant === 'zone'
    ? `Core tendencies \u00b7 Big ${zoneRows.length}`
    : `The “Big ${data.to90}” — ${data.label}'s Core Tendencies`;
  const meta = variant === 'zone'
    ? `${data.label}, sorted by frequency`
    : 'Snaps sorted by frequency; click any column or row to sort. Click any row to watch the film.';
  return <Module title={title} cls={cls} meta={meta}>
    <DataTable emptyText="Insufficient charted data" columns={[
      { key: 'form', label: 'Formation' }, { key: 'qb', label: 'QB align' }, { key: 'bf', label: 'Backfield' }, { key: 'str', label: 'Strength' }, { key: 'mot', label: 'Motion' }, { key: 'pt', label: 'Play' },
      { key: 'n', label: 'N', numeric: true }, { key: 'succ', label: 'Success', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'runPct', label: 'Run%', numeric: true },
    /* The zone variant holds the approved slot count; `variant='legacy'` is
       Opponent Offense, which has not had its design pass and keeps every row.
       `to90` in the title stays computed from the full eligible set, so the
       stated "Big N" describes the tendency, not the truncated view. */
    ]} rows={(variant === 'zone' ? zoneRows : data.rows)
      .map(row => ({ ...row, onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, row.cutLabel) : row.cutType ? () => screen.watchCut(row.cutType, row.cutVal, row.cutLabel) : undefined, label: row.cutLabel }))} />
  </Module>;
}

/* `Top 5 Tendencies`, not `Tendency matrix`. The module renders the five most
   frequent row values and deterministically drops the rest, so the title names
   the cap the way `Top 10 Plays` does. At full-season scope its rows grew to
   70px — five of them plus a 30px header need 380px inside a 316px wrap in a
   378px fixed panel — so `.tm-wrap`'s `overflow:auto` engaged and the last row
   escaped the module by 60px. The panel does not grow: the row pitch is fixed
   instead, so five rows always fit and the capacity named in the title is a
   constant rather than a property of the data. */
const MATRIX_TITLE = 'Top 5 Tendencies';
function TendencyMatrixPanel({ engine, plays, defaultRow = 'formation', defaultCol = 'down', title = MATRIX_TITLE }) {
  const [rowId, setRowId] = useState(defaultRow);
  const [colId, setColId] = useState(defaultCol);
  const dims = engine.constructor._matrixDimensions();
  /* Holds its slot, and holds the approved row allocation. The matrix used to
     return null under three plays -- removing an approved module -- and to
     render a row per distinct value, which on a season of formations grew the
     module without limit. Rows come back already ordered by the view model; the
     cap only keeps the approved number of them. */
  const thin = !plays?.length || plays.length < 3;
  const raw = thin ? null : view.matrixData(engine, plays, rowId, colId);
  /* The row slots are fixed like every other module's: truncate a long set,
     pad a short one with empty keys that render as a held row. The COLUMN
     dimension is chosen by the coach at runtime, so it cannot be enumerated
     the same way — that is what the panel's reserved footprint covers. */
  const slots = OFFENSE_ROWS['Top 5 Tendencies'];
  const rowKeys = raw ? raw.rowKeys.slice(0, slots) : [];
  while (raw && rowKeys.length < slots) rowKeys.push('');
  const matrix = raw ? { ...raw, rowKeys } : null;
  return <Module title={title} cls="gi-off-matrix">
    <div class="tm-controls">
      <label>Rows: <select value={rowId} onChange={e => setRowId(e.currentTarget.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
      <span style="opacity:.5;margin:0 4px">×</span>
      <label>Cols: <select value={colId} onChange={e => setColId(e.currentTarget.value)}>{dims.map(d => <option key={d.id} value={d.id}>{d.label}</option>)}</select></label>
    </div>
    {thin ? <p class="gi-table-empty">Insufficient charted data</p>
      : rowId === colId ? <p class="gi-table-empty">Pick two different dimensions.</p> : <MatrixGrid matrix={matrix} />}
  </Module>;
}

function MatrixGrid({ matrix }) {
  if (!matrix.rowKeys.length || !matrix.colKeys.length) return <p style="opacity:.6">Not enough data for this combination.</p>;
  const maxCount = Math.max(1, ...Object.values(matrix.cells).map(c => c.count));
  return <>
    <div class="tm-wrap"><table class="stats-table stats-table-full tm-table">
      <thead><tr><th>{matrix.rowDim.label} \ {matrix.colDim.label}</th>{matrix.colKeys.map(c => <th key={c}>{c}</th>)}</tr></thead>
      <tbody>{matrix.rowKeys.map((r, ri) => <tr key={r || `slot-${ri}`} class={r ? undefined : 'is-absent'}>
        <td style="font-weight:600;white-space:nowrap">{r || '–'}</td>
        {matrix.colKeys.map(c => {
          const cell = !r ? null : matrix.cells[`${r}\0${c}`];
          if (!cell?.count) return <td key={c} class="tm-cell" style="opacity:.2">—</td>;
          const intensity = cell.count / maxCount;
          const succPct = Math.round((cell.successes / cell.count) * 100);
          const avg = (cell.yards / cell.count).toFixed(1);
          const runPct = Math.round((cell.runs / cell.count) * 100);
          const border = succPct >= 50 ? '1px solid rgba(68,255,136,0.4)' : succPct <= 30 ? '1px solid rgba(255,102,102,0.25)' : '1px solid transparent';
          return <td key={c} class="tm-cell" style={`background:rgba(74,158,255,${(intensity * 0.45 + 0.05).toFixed(2)});border:${border}`} title={`${r} × ${c}: ${cell.count} plays, ${runPct}% run, ${succPct}% success, ${avg} avg`}>
            <div class="tm-count">{cell.count}</div><div class="tm-split">{runPct}R/{100 - runPct}P</div><div class="tm-succ">{succPct}%, {avg}y</div>
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </>;
}

/* Holds its slot, like every other module on this board. Returning null on an
   ungraded game removed an approved module outright. The title is the approved
   label change (RATIONALE §5): spelled out once, the abbreviation in the meta. */
function EpaContribution({ rows, screen }) {
  const fitted = fitRows(rows, OFFENSE_EPA_ROWS['By play type']);
  const max = Math.max(1, ...fitted.filter(row => !row.absent).map(row => Math.abs(row.totalValue)));
  return <div class="gi-epa-contribution" aria-label="EPA contribution by play type">
    <h4 class="gi-epa-chart-title">EPA contribution by play type</h4>
    <div class="gi-epa-zero" />
    {fitted.map((row, i) => row.absent
      ? <div key={`epa-bar-${i}`} class="gi-epa-bar is-absent"><span>–</span><i /><strong>–</strong></div>
      : <Watchable key={row.name} class="gi-epa-bar" onActivate={() => screen.watchCut('playType', row.name, `${row.name} — ${row.count} plays`)} label={`${row.name} — ${row.count} plays`}>
          <span>{row.name}</span>
          <i class={row.totalValue >= 0 ? 'is-positive' : 'is-negative'} style={`--epa:${Math.abs(row.totalValue) / max * 50}%`} />
          <strong class={row.totalClass}>{row.total}</strong>
        </Watchable>)}
  </div>;
}

/** Fixed answer beneath the two tendency tables: which play types are actually
 * paired with the offense's primary formations. The top three formations and
 * top five play types are a stable 3 x 5 board; unavailable slots hold with a
 * dash rather than changing the module's dimensions. */
function FormationPlayTypeMatrix({ engine, plays }) {
  const raw = view.matrixData(engine, plays, 'formation', 'playType');
  const rowKeys = raw.rowKeys.slice(0, OFFENSE_ROWS['Formation × Play Type']);
  const colKeys = raw.colKeys.slice(0, OFFENSE_MATRIX_COLS);
  while (rowKeys.length < OFFENSE_ROWS['Formation × Play Type']) rowKeys.push('');
  while (colKeys.length < OFFENSE_MATRIX_COLS) colKeys.push('');
  const shown = rowKeys.filter(Boolean).flatMap(r => colKeys.filter(Boolean)
    .map(c => raw.cells[`${r}\0${c}`]).filter(Boolean));
  const maxCount = Math.max(1, ...shown.map(cell => cell.count));

  return <Module title="Formation × Play Type" cls="is-offense gi-off-form-type">
    <div class="gi-form-type-grid"><table>
      <thead><tr><th>Formation</th>{colKeys.map((col, i) => <th key={`${col}-${i}`}>{col || '—'}</th>)}</tr></thead>
      <tbody>{rowKeys.map((row, ri) => <tr key={row || `formation-slot-${ri}`} class={row ? undefined : 'is-absent'}>
        <td>{row || '—'}</td>
        {colKeys.map((col, ci) => {
          const cell = row && col ? raw.cells[`${row}\0${col}`] : null;
          if (!cell?.count) return <td key={`${col}-${ci}`} class="gi-form-type-cell is-absent">—</td>;
          const success = Math.round((cell.successes / cell.count) * 100);
          const ypp = (cell.yards / cell.count).toFixed(1);
          const heat = Math.round(12 + (cell.count / maxCount) * 48);
          return <td key={`${col}-${ci}`} class={`gi-form-type-cell ${success >= 50 ? 'is-good' : success <= 30 ? 'is-bad' : ''}`}
            style={`--heat:${heat}%`} title={`${row} × ${col}: ${cell.count} plays, ${success}% success, ${ypp} yards/play`}>
            <strong>{cell.count}</strong><span>/ {success}%</span>
          </td>;
        })}
      </tr>)}</tbody>
    </table></div>
  </Module>;
}

function AdvancedEpa({ data, screen }) {
  if (!data) return <Module title="Expected points added" meta="EPA">
    <p class="gi-table-empty">Insufficient charted data</p>
  </Module>;
  return <Module title="Expected points added" meta="EPA">
    <div class="stats-grid">
      <div class="stat-card"><div class="stat-card-title">Total EPA</div><div class={`stat-card-value ${data.totalClass}`}>{data.totalText}</div></div>
      <div class="stat-card"><div class="stat-card-title">EPA / Play</div><div class={`stat-card-value ${data.perPlayClass}`}>{data.perPlayText}</div></div>
      <div class="stat-card"><div class="stat-card-title">Plays Scored</div><div class="stat-card-value">{data.count}</div></div>
    </div>
    <div class="gi-epa-visuals">
      <div class="epa-curve-wrap"><svg viewBox={`0 0 ${data.W} ${data.H}`} class="epa-curve" preserveAspectRatio="xMidYMid meet">
        <line x1={data.P} y1={data.zeroY} x2={data.W - data.P} y2={data.zeroY} stroke="#555" stroke-dasharray="3,3" />
        <path d={data.path} fill="none" stroke="var(--accent)" stroke-width="2" />
        <text x={data.P} y="14" fill="#aaa" font-size="11">Cumulative EPA</text>
        <text x={data.P} y={data.H - 8} fill="#aaa" font-size="10">Play 1</text>
        <text x={data.W - data.P} y={data.H - 8} fill="#aaa" font-size="10" text-anchor="end">Play {data.n}</text>
        <text x={data.W - data.P} y="14" fill="#aaa" font-size="11" text-anchor="end">High {data.hi.toFixed(1)} / Low {data.lo.toFixed(1)}</text>
      </svg></div>
      <EpaContribution rows={data.byType} screen={screen} />
    </div>
    <div class="stats-two-col">
      <EpaGroupTable title="By play type" rows={fitRows(data.byType, OFFENSE_EPA_ROWS['By play type'])} />
      <EpaGroupTable title="By formation" rows={fitRows(data.byFormation, OFFENSE_EPA_ROWS['By formation'])} />
    </div>
    <div class="stats-two-col">
      <EpaGroupTable title="By personnel" rows={fitRows(data.byPersonnel, OFFENSE_EPA_ROWS['By personnel'])} />
      <div><h4 class="gi-epa-subhead">By down</h4><table class="stats-table stats-table-full epa-table">
        <thead><tr><th>Down</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
        <tbody>{fitRows(data.byDown, OFFENSE_EPA_ROWS['By down']).map((d, i) => (d.absent
          ? <tr key={`epa-down-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
          : <tr key={d.down}><td>{d.down}</td><td>{d.count}</td><td class={d.totalClass}>{d.total}</td><td class={d.perPlayClass}>{d.perPlay}</td></tr>))}</tbody>
      </table></div>
    </div>
    <div class="stats-two-col">
      <EpaPlayTable title="Top 5 EPA plays" tone="is-win" rows={fitRows(data.top, OFFENSE_EPA_ROWS['Top 5'])} />
      <EpaPlayTable title="Worst 5 EPA plays" tone="is-loss" rows={fitRows(data.worst, OFFENSE_EPA_ROWS['Worst 5'])} />
    </div>
  </Module>;
}
function EpaGroupTable({ title, rows }) {
  /* Holds its slot. `if (!rows.length) return null` removed a sub-table from
     the EPA module entirely, so that module's height moved with the data. */
  return <div><h4 class="gi-epa-subhead">{title}</h4><table class="stats-table stats-table-full epa-table">
    <thead><tr><th>{title}</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
    <tbody>{rows.map((r, i) => (r.absent
      ? <tr key={`epa-g-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
      : <tr key={r.name}><td>{r.name}</td><td>{r.count}</td><td class={r.totalClass}>{r.total}</td><td class={r.perPlayClass}>{r.perPlay}</td></tr>))}</tbody>
  </table></div>;
}
function EpaPlayTable({ title, tone, rows }) {
  return <div><h4 class={`gi-epa-subhead ${tone}`}>{title}</h4><table class="stats-table stats-table-full epa-table">
    <thead><tr><th>#</th><th>Situation</th><th>Yds</th><th>EPA</th></tr></thead>
    <tbody>{rows.map((r, i) => (r.absent
      ? <tr key={`epa-p-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
      : <tr key={r.id}><td>#{r.id}</td><td>{r.label}</td><td>{r.yards}</td><td class={r.epaClass}>{r.epaText}</td></tr>))}</tbody>
  </table></div>;
}

/**
 * The four "offensive shape" graphics, returned individually so the approved
 * composition can place them in Zone 5's equal-width bands instead of letting
 * them inherit whatever width is left beside an unrelated narrow table.
 */
/**
 * The original paired shape layout. Still the presentation for OPPONENT
 * Offense, which has not had its own design pass — Offense's own zone-5 bands
 * use `shapeParts` instead. Do not fold these together until the opponent tab
 * is redesigned.
 */
function ShapePanels({ shape }) {
  if (!shape) return null;
  return <>
    <PairedBand slots={[
      shape.histogram ? <Module title="Yards gained per play, distribution"><ChartBody {...shape.histogram} /></Module> : null,
      shape.scatter ? <Module title="Yards gained vs distance to go"><ChartBody {...shape.scatter} /></Module> : null,
    ]} />
    {shape.zones && <Module title="Success Rate by Field Position"><ChartBody {...shape.zones} /></Module>}
    {shape.downs && <Module title="Run/pass split and success rate by down"><ChartBody {...shape.downs} /></Module>}
  </>;
}

/* Four modules of the approved composition, ALWAYS all four. Each previously
   collapsed to null when its own chart had nothing to draw, and the band then
   rendered one module or vanished outright — so the board's shape moved with
   the data, which is the thing the static rule forbids. A chart with no data
   now holds its slot and states the absence, the same treatment every table on
   this board uses. Metas are the comp's, not the earlier paraphrases. */
function shapeParts(shape) {
  const panel = (title, meta, body) => <Module title={title} meta={meta}>
    {body ? <ChartBody html={body.html} /> : <p class="gi-table-empty">Insufficient charted data</p>}
  </Module>;
  return {
    histogram: panel('Yards per play', 'distribution', shape?.histogram),
    scatter: panel('Yards vs distance to go', 'conversion pressure', shape?.scatter),
    zones: panel('Success by field position', 'zone strip', shape?.zones),
    downs: panel('Run / pass by down', 'split & success', shape?.downs),
  };
}

/* Holds its slot. Returning null removed an approved module from the board
   whenever the radar had no axes or failed to draw, so the board's module count
   moved with the data. */
function TeamProfile({ profile, cls = '' }) {
  const axes = fitRows(profile?.axes, OFFENSE_ROWS['Team profile']);
  const chart = axes.length ? Charts.radar(axes, { label: 'Team profile: this game vs season average', compareName: 'season average' }) : null;
  /* The table holds its six rows either way; only the radar is conditional, and
     its slot keeps the layout's shape. Swapping the whole module for one line
     was a different module height on a game with no season comparison. */
  if (!chart) return <Module title="Team profile" meta="this game vs season average" cls={`gi-team-profile ${cls}`}>
    <div class="gi-tp-layout">
      <div class="gi-tp-chart-slot" />
      <div class="gi-tp-table-wrap"><table class="stats-table gi-tp-table">
        <thead><tr><th>Metric</th><th>This game</th><th>Season avg</th><th>Season best</th></tr></thead>
        <tbody>{axes.map((axis, i) => <tr key={`tp-empty-${i}`} class="is-absent">
          <td>–</td><td>–</td><td>–</td><td>–</td>
        </tr>)}</tbody>
      </table></div>
    </div>
  </Module>;
  const best = axis => typeof axis.best === 'number'
    ? (Number.isInteger(axis.best) ? axis.best : axis.best.toFixed(1))
    : axis.best;
  return <Module title="Team profile" meta="this game vs season average" cls={`gi-team-profile ${cls}`}>
    <div class="gi-tp-layout">
      <ChartBody html={chart} />
      <div class="gi-tp-table-wrap"><table class="stats-table gi-tp-table">
        <thead><tr><th>Metric</th><th>This game</th><th>Season avg</th><th>Season best</th></tr></thead>
        <tbody>{axes.map((axis, i) => (axis.absent
          ? <tr key={`tp-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
          : <tr key={axis.label}>
          <td>{axis.label}</td><td class="gi-tp-now">{axis.valueLabel}</td><td>{axis.compareLabel}</td>
          <td>{axis.lower ? '≤ ' : ''}{best(axis)}{axis.isBest && <span class="gi-tp-best-mark" title="Season best"> ★</span>}</td>
        </tr>))}</tbody>
      </table></div>
    </div>
  </Module>;
}

/** The Identity strip: existing breakdowns surfaced in the first viewport. */
function IdentityStrip({ items, screen }) {
  if (!items?.length) return null;
  // `_playCallAnalysis` supplies bare `playIds` and leaves `refs` empty for a
  // single-game cohort, so a tile fed from it had no film action at all. The
  // Play Calls table already composes ids into `gameId::playId` (playCallParts
  // `refsFor`); the same composition is used here so both entry points open
  // the identical cut from the identical identity.
  const gameId = screen.app.storage?.seasonStore?.activeGame?.()?.id || '';
  const refsOf = item => (item.refs?.length ? item.refs
    : (item.playIds || []).map(id => `${gameId}::${id}`));
  return <div class="gi-off-identity-strip">{items.map(item => {
    const refs = refsOf(item);
    const onActivate = refs.length
      ? () => screen.watchRefs(refs, item.cutLabel)
      : item.cutType ? () => screen.watchCut(item.cutType, item.cutVal, item.cutLabel) : undefined;
    return <Watchable key={item.label} onActivate={onActivate} label={item.cutLabel}>
      <span>{item.label}</span><strong>{item.value}</strong><small>{item.sub}</small>
    </Watchable>;
  })}</div>;
}

/** A module that states why it is thin instead of rendering an empty table. */
/* NO LONGER USED BY OffenseTab. It swapped a module's whole table for a single
   line when the cohort was empty, which is a different module height — the
   board then measured 5102..5478px across six real games. Offense modules hold
   their approved rows instead (`fitRows`), so the absence is stated inside the
   schema rather than by replacing it. Kept for the tabs that have not had their
   static-composition pass. */
function SparseModule({ title, meta, cls = '', rows, children }) {
  return <Module title={title} meta={meta} cls={cls}>
    {rows && rows.length ? children : <p class="gi-table-empty">Insufficient charted data</p>}
  </Module>;
}

/* The six approved zones are PAGES (coach-approved comp,
   design-comps/reports-secondary-nav-2026-09-23): one on screen at a time,
   selected from the shared secondary bar. Every module keeps its zone; the
   coach kept six pages to leave room for growth. */
const OFFENSE_PAGES = [
  ['identity', 'Identity', 'Offensive identity'],
  ['calls', 'Calls & tendencies', 'Calls and tendencies'],
  ['structure', 'Structure', 'Structure and deployment'],
  ['situations', 'Situations', 'Situational analysis'],
  ['field', 'Field & production', 'Field and production'],
  ['advanced', 'Advanced', 'Advanced metrics'],
];

/* The approved Offense composition is the SCHEMA — the single owner for every
   fixed count on this board. Read off the registered canonical artifact,
   `design-comps/reports-offense-2026-09-03/offense.html`, plus the recorded
   coach-directed density revisions: 6 zones, 14 bands and 29 modules. The
   same modules and slots render in sparse and populated states.

   Numbers live HERE, not scattered through JSX, view helpers and tests. A
   module's row count is what it renders on every game in every season: a short
   cohort holds the slot with the approved absence treatment, a long one is
   deterministically ranked and capped. Data never adds a row, removes a module
   or resizes the board.

   `EPA_ROWS` covers the six sub-tables inside the single Expected points added
   module, which the comp renders as one `mod`. */
const OFFENSE_ROWS = {
  'Run / pass balance': 4,     // one row per down, an enumerable set
  'Play calls': 5,
  Concepts: 5,
  Formation: 5,
  'Play type': 5,
  'Formation × Play Type': 3,
  'Play-action': 3,
  'Core tendencies': 5,
  'Calls by situation': 8,
  'Direction vs Strength': 4,
  Personnel: 5,
  Backfield: 5,
  Motion: 4,
  'Play direction': 3,
  Strength: 3,
  'Field hash': 3,
  'Personnel × situation': 6,
  Situational: 6,
  'Top 5 Tendencies': 5,
  'By quarter': 4,             // one row per quarter, an enumerable set
  'Team profile': 6,
};
/** `Calls by situation`'s fixed internal schema: the same lenses, in the same
 *  order, each holding the same rows — 3 + 3 + 2 = the module's 8, matching the
 *  comp's own three lens tables.
 *
 *  RECORDED MISMATCH: the comp's third lens is `Hash`, and
 *  `_playCallAnalysis` computes no hash dimension — its five are Down &
 *  Distance, Formation, Personnel, Field Position and Direction vs Strength.
 *  The third slot briefly took `Direction vs Strength` as the nearest
 *  situational dimension the engine does produce. That is what put a CALL lens
 *  under a module named for a charted dimension, leaving it permanently empty
 *  on a season charting no play calls. That module measures the dimension
 *  itself now (`StatsEngine._dirStrengthStats`), so this one holds only the
 *  two lenses both the engine and the comp have. The absent hash lens stays
 *  raised in the implementation RATIONALE for the coach. */
const OFFENSE_LENSES = [['Down & Distance', 4], ['Field Position', 4]];
const OFFENSE_MATRIX_COLS = 5;
const OFFENSE_EPA_ROWS = {
  'By play type': 6, 'By formation': 5, 'By personnel': 5, 'By down': 4,
  'Top 5': 5, 'Worst 5': 5,
};
/** Every module the approved comp renders, in its approved order. The board
 *  shows exactly these, always, whatever the data holds. */
const OFFENSE_MODULES = [
  'Identity', 'Run / pass balance',
  'Play calls', 'Concepts',
  'Formation', 'Play type', 'Play-action', 'Formation × Play Type',
  'Core tendencies', 'Direction vs Strength', 'Calls by situation', 'Drive outcomes',
  'Personnel', 'Backfield', 'Motion',
  'Play direction', 'Strength', 'Field hash',
  'Personnel × situation', 'Situational',
  'Top 5 Tendencies', 'By quarter',
  'Field heat map',
  'Yards per play', 'Yards vs distance to go',
  'Success by field position', 'Run / pass by down',
  'Team profile', 'Expected points added',
];
/** EXACTLY the approved slot count — truncate a long cohort, PAD a short one.
 *
 *  Capping alone was only half the rule and produced only half a static board:
 *  module presence was fixed but every module was still content-sized, so the
 *  same 1440 board measured 5102px on one game and 5478px on another. A slot
 *  the data cannot fill is held by an absence row carrying the dash in every
 *  column, so a module's height is a property of the schema and not of the
 *  film. `–` marks a row that DOES NOT EXIST; `Insufficient charted data`
 *  remains the module-level statement when nothing at all was charted. */
const fitRows = (rows, limit) => {
  const out = Array.isArray(rows) ? rows.slice(0, limit) : [];
  while (out.length < limit) out.push({ absent: true, class: 'is-absent' });
  return out;
};
/** Map the REAL rows, then pad. Padding first sends held slots — which carry
 *  no `yardsPerPlay`, no `successRate` — into formatters that call `.toFixed`
 *  on them. This keeps every row formatter dealing only with real data. */
const mapFit = (rows, limit, fn) =>
  fitRows((Array.isArray(rows) ? rows : []).slice(0, limit).map(fn), limit);
/*  A TABULAR module always renders its exact allocation, including when the
 *  cohort is empty — the held rows ARE its absence treatment. The comp states
 *  absence as `Insufficient charted data`, and its own sparse capture is 415px
 *  shorter than its populated one; that line and stable geometry cannot both
 *  hold. The coach's rule is explicit that the board has stable geometry for
 *  every game at a given viewport, so the module-level line is kept only for
 *  the modules that have no row structure to hold (the Zone 5 charts, the
 *  Identity strip, the Tendency matrix grid), and tabular modules hold their
 *  rows instead. Recorded in the implementation RATIONALE §2. */

/**
 * The approved six-zone Offense composition
 * (design-comps/reports-offense-2026-09-03). Every section the flat stack
 * carried is still here — the change is composition, not content. The mapping
 * from the old stack to these zones is RATIONALE.md §2.
 */
export function OffenseTab({ stats, screen }) {
  const engine = screen.app.stats;
  const [page, setPageState] = useState(OFFENSE_PAGES.some(([id]) => id === screen.offenseSection) ? screen.offenseSection : 'identity');
  const setPage = id => { screen.offenseSection = id; setPageState(id); document.querySelector('.ws-reports')?.scrollTo?.(0, 0); };
  if (!stats.offPlays.length) {
    return <EmptyState
      title="No offensive snaps charted"
      body="Chart offensive plays to populate this report."
      action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown() }} />;
  }
  const shape = engine._dataShape(stats);
  const parts = shapeParts(shape);
  const tend = view.tendencyBreakdown(stats);
  const bf = view.backfieldStrength(stats, engine);
  const dm = view.directionMotion(stats);
  const dirStrength = view.dirStrengthTendencies(engine, stats.offPlays);
  const pa = view.playAction(stats);
  const advanced = view.advancedData(stats, engine);
  const personnel = view.personnelGroups(stats);
  const hash = view.hashTendencies(stats);
  const personnelSit = view.personnelSituation(stats);
  const sit = view.situationalBreakdown(stats);
  const calls = playCallParts({ stats, screen });
  const identity = view.offenseIdentity(stats, engine, calls ? engine._playCallAnalysis(stats.offPlays) : null);
  const byDown = view.runPassByDown(stats, engine);
  const cut = (type, val, label) => () => screen.watchCut(type, val, label);

  return <div class="gi-overview-board gi-offense-board" data-offense-page={page}>
    <ReportSectionBar screen={screen} label="Offense report sections" navClass="gi-offense-pages" numbered
      sections={OFFENSE_PAGES.map(([id, label]) => ({ id, label }))} active={page} onSelect={setPage} />
    {/* The page heading, in the Defense board's hierarchy (coach direction,
        1.12.0-97 smoke S97-1): number, the zone's full name, then its cohort.
        The count is compute()'s offensive cohort, which is the classified one. */}
    {(() => {
      const index = OFFENSE_PAGES.findIndex(([id]) => id === page);
      return <header class="gi-off-heading">
        <span>{String(index + 1).padStart(2, '0')}</span><h2>{OFFENSE_PAGES[index][2]}</h2>
        <small>{stats.offPlays.length} classified snaps</small>
      </header>;
    })()}

    {/* ── ZONE 1 — offensive identity ───────────────────────────────── */}
    {page === 'identity' && <>
    <KpiBand items={view.offenseKpis(stats)} />
    <div class="gi-overview-band gi-off-identity">
      <Module title="Identity" cls="is-offense" meta={`${stats.offPlays.length} snaps`}>
        <IdentityStrip items={identity} screen={screen} />
      </Module>
      <Module title="Run / pass balance" meta="by down">
        <table><thead><tr><th>Down</th><th>Snaps</th><th>Run / pass</th><th>Yds/play</th></tr></thead><tbody>
          {fitRows(byDown, OFFENSE_ROWS['Run / pass balance']).map((row, i) => row.absent
            ? <tr key={`rp-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
            : <Watchable key={row.down} tag="tr" onActivate={cut(row.cutType, row.cutVal, row.cutLabel)} label={row.cutLabel}>
            <td>{row.down}</td><td>{row.snaps}</td>
            <td><span class="gi-mini-mix"><i style={`--n:${row.runPct}`} /><i style={`--n:${row.passPct}`} /></span>{row.runPct} / {row.passPct}</td>
            <td>{row.ypp}</td>
          </Watchable>)}
        </tbody></table>
      </Module>
    </div>
    </>}

    {/* ── ZONE 2 — calls and tendencies ─────────────────────────────── */}
    {page === 'calls' && <>
    {/* The comp pairs these two in one band (`b-2`); production gave each a
        full-width band of its own, which is a different composition. */}
    <div class="gi-overview-band gi-off-b2">{calls.calls}{calls.concepts}</div>
    <div class="gi-overview-band gi-overview-band-3 gi-off-tendency-band">
      <Module title="Formation" meta="frequency &amp; success" cls="is-offense gi-off-formation gi-off-narrow-fit" rows={tend.formations}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(tend.formations, OFFENSE_ROWS.Formation), screen)} />
      </Module>
      <Module title="Play type" meta="frequency &amp; success" cls="is-offense gi-off-play-type gi-off-narrow-fit" rows={tend.playTypes}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(tend.playTypes, OFFENSE_ROWS['Play type']), screen)} />
      </Module>
      <Module title="Play-action" meta="vs straight dropback" cls="is-offense gi-off-play-action">
        {/* The table and its four tiles render unconditionally: the `pa ? … :`
            branch and the `formations.length > 0` branch each swapped a
            three-row table for a one-line statement, which is a different
            module height on a game that charted no play-action. */}
        <>
          <DataTable columns={[{ key: 'name', label: 'Formation' }, { key: 'count', label: 'PA Plays', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Success%' }]} rows={mapFit(pa?.formations, OFFENSE_ROWS['Play-action'], (f, i) => ({ id: i, ...f }))} />
          <div class="gi-overview-tiles gi-off-pa-tiles">
            <div><span>PA rate</span><strong>{pa ? `${pa.paRate}%` : '–'}</strong><small>{pa ? `${pa.paPlays} of dropbacks` : 'of dropbacks'}</small></div>
            <div><span>PA comp</span><strong>{pa ? `${pa.paCompPct}%` : '–'}</strong><small>completion</small></div>
            <div><span>PA YPA</span><strong>{pa ? pa.paYPA : '–'}</strong><small>per attempt</small></div>
            <div><span>Straight YPA</span><strong>{pa ? pa.straightYPA : '–'}</strong><small>no play-action</small></div>
          </div>
        </>
      </Module>
      <FormationPlayTypeMatrix engine={engine} plays={stats.offPlays} />
    </div>
    {/* The comp pairs these in one `b-2` band. A previous pass split them into
        two full-width bands because, paired, "Calls by situation" stacked its
        three lens tables in the narrow track and ran ~1330px, leaving ~960px
        dead beside Big N. That measurement was taken with the lens grid free to
        stack; capping Big N at the approved 8 rows and letting the lens grid
        keep its own columns inside the narrow track restores the comp's band
        without reproducing the gap. Measured per band below, on real film. */}
    <div class="gi-overview-band gi-off-b2 gi-off-call-band">
      <div class="gi-off-call-stack">
        <BigTwelve data={view.bigTwelve(engine, stats.offPlays, engine._subjectName('Our Offense'))} screen={screen} cls="is-offense" variant="zone" />
        <Module title="Direction vs Strength" meta="usage and production by relationship" cls="is-offense">
          <DataTable emptyText="Insufficient charted data" columns={directionStrengthColumns}
            rows={breakdownRows(fitRows(dirStrength, OFFENSE_ROWS['Direction vs Strength']), screen)} />
        </Module>
      </div>
      {calls.situations}
    </div>
    <div class="gi-overview-band gi-off-full">
      <Module title="Drive outcomes" meta="possessions" cls="is-offense">
        <div class="gi-drive-outcomes">
          {view.driveOutcomeStrip(stats).map(item => <WatchableRefs key={item.label} refs={item.refs} label={item.label} screen={screen} class="gi-drive-outcome">
            <span>{item.label}</span><strong>{item.value}</strong><small>{item.detail}</small>
          </WatchableRefs>)}
        </div>
      </Module>
    </div>
    </>}

    {/* ── ZONE 3 — structure and deployment ─────────────────────────── */}
    {page === 'structure' && <>
    <div class="gi-overview-band gi-overview-band-3">
      <Module title="Personnel" meta="grouping" cls="is-offense gi-off-narrow-fit" rows={personnel}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(personnel, OFFENSE_ROWS.Personnel), screen)} />
      </Module>
      <Module title="Backfield" meta="alignment" cls="is-offense gi-off-narrow-fit" rows={bf.backfield}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(bf.backfield, OFFENSE_ROWS.Backfield), screen)} />
      </Module>
      <Module title="Motion" meta="pre-snap movement" cls="is-offense gi-off-narrow-fit" rows={dm?.motion}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(dm?.motion || [], OFFENSE_ROWS.Motion), screen)} />
      </Module>
    </div>
    <div class="gi-overview-band gi-overview-band-3">
      <Module title="Play direction" meta="ball direction" cls="is-offense gi-off-narrow-fit" rows={dm?.direction}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(dm?.direction || [], OFFENSE_ROWS['Play direction']), screen)} />
      </Module>
      <Module title="Strength" meta="declared side" cls="is-offense gi-off-narrow-fit" rows={bf.strength}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(bf.strength, OFFENSE_ROWS.Strength), screen)} />
      </Module>
      <Module title="Field hash" meta="starting position" cls="is-offense gi-off-narrow-fit" rows={hash}>
        <DataTable emptyText="Insufficient charted data" columns={breakdownColumns} rows={breakdownRows(fitRows(hash, OFFENSE_ROWS['Field hash']), screen)} />
      </Module>
    </div>
    </>}

    {/* ── ZONE 4 — situational analysis ─────────────────────────────── */}
    {page === 'situations' && <>
    {/* First on the page (comp design-comps/reports-secondary-nav-2026-09-23):
        our down and distance over the board's own offensive cohort. A live
        current-game play has no stamped game, so its film ref takes the active
        game's id, which is the game it belongs to. */}
    <DownDistanceChart side="offense" title="Down & distance" screen={screen}
      chart={engine.downDistanceChart(stats.offPlays, { side: 'offense',
        fallbackGameId: screen.app?.storage?.seasonStore?.data?.activeGameId ?? null })} />
    {/* The comp's two bands: Personnel × situation beside Situational, then the
        Tendency matrix beside By quarter. Production had split these into two
        full-width bands and a pair in the wrong order, so Zone 4 read as four
        sections rather than the approved two comparisons. */}
    <div class="gi-overview-band gi-off-b2e">
      <Module title="Personnel × situation" meta="grouping by down &amp; distance" cls="is-offense" rows={personnelSit}>
        <DataTable emptyText="Insufficient charted data"
          columns={[{ key: 'personnel', label: 'Personnel' }, { key: 'situation', label: 'Situation', tl: true }, { key: 'count', label: 'Plays', numeric: true }, { key: 'runPct', label: 'Run%', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Success%' }]}
          rows={mapFit(personnelSit, OFFENSE_ROWS['Personnel × situation'], (row, i) => ({ id: i, ...row }))} />
      </Module>
      <Module title="Situational" meta="production by situation" cls="is-offense" rows={sit.rows}>
        <DataTable emptyText="Insufficient charted data"
          columns={[{ key: 'name', label: 'Situation' }, { key: 'total', label: '#', numeric: true }, { key: 'yards', label: 'Yds', numeric: true }, { key: 'avg', label: 'Avg', numeric: true }, { key: 'success', label: 'Succ%' }, { key: 'tds', label: 'TD', numeric: true }]}
          rows={mapFit(sit.rows, OFFENSE_ROWS.Situational, row => ({ ...row, id: row.key, onActivate: cut('situation', row.key, `${row.name} — ${row.total} plays`), label: `${row.name} — ${row.total} plays` }))} />
      </Module>
    </div>
    <div class="gi-overview-band gi-off-b2">
      <TendencyMatrixPanel engine={engine} plays={stats.offPlays} />
      <Module title="By quarter" meta="production over the game">
        <table><thead><tr><th>Qtr</th><th>Plays</th><th>Yds</th><th>TD</th></tr></thead>
          <tbody>{fitRows(sit.byQuarter, OFFENSE_ROWS['By quarter']).map((q, i) => q.absent
            ? <tr key={`q-${i}`} class="is-absent"><td>–</td><td>–</td><td>–</td><td>–</td></tr>
            : <tr key={q.q}><td>{q.q}</td><td>{q.plays}</td><td>{q.yards}</td><td>{q.tds}</td></tr>)}</tbody>
        </table>
      </Module>
    </div>
    </>}

    {/* ── ZONE 5 — field and production ─────────────────────────────── */}
    {page === 'field' && <>
    {/* Three bands, always. The two paired bands were conditional and used
        `.filter(Boolean)`, so a band could render one module, or none, and the
        board's shape moved with the data.

        `NativeOffenseVisualizations` is GONE. The approved Zone 5 carries five
        modules and no `Visualizations`, and the module restated two of them
        directly: its `Success by Field Zone` strip against the approved
        `Success by field position`, and its `By Quarter` bars against Zone 4's
        `By quarter`. Its spray is the same field-position view the approved
        `Field heat map` already renders on its Field Position tab. Keeping it
        was a 27th module the comp does not carry, duplicating approved
        tendencies in a second format and materially lengthening the board. */}
    <div class="gi-overview-band gi-off-full"><NativeHeatMaps plays={stats.offPlays} screen={screen} /></div>
    <div class="gi-overview-band gi-off-b2e">{parts.histogram}{parts.scatter}</div>
    <div class="gi-overview-band gi-off-b2e">{parts.zones}{parts.downs}</div>
    </>}

    {/* ── ZONE 6 — advanced metrics ─────────────────────────────────── */}
    {page === 'advanced' && <>
    {/* Both bands always render; the modules themselves state any absence. */}
    <div class="gi-overview-band gi-off-full"><TeamProfile profile={shape?.teamProfile} cls="is-offense" /></div>
    <div class="gi-overview-band gi-off-full"><AdvancedEpa data={advanced} screen={screen} /></div>
    </>}
  </div>;
}
/* The six roles the engine attributes, in the approved board order. `w` is the
 * width the role's colgroup asks for (identity floor plus every measurement
 * column), and it is what decides whether a band can stay paired -- see the
 * `--p-*` steps and the stacking derivation in css/native-reports.css. */
/* ROW CAPACITY IS THE MODULE'S SIZE, and it is deliberate per role rather than
   inherited from whatever a cohort happens to hold. `cap` is the number of
   VISIBLE data-row slots: fewer rows pad with the shared held-row dash, more
   rows scroll inside the module body while its header and column header stay
   put. Three sizes only — 3, 6 and 9 — sized from the real canonical range
   (Passing 1-2, Kicking 0-2, Receiving 0-6, Return Game 0-7, Rushing 3-9,
   Tackles 7-12), so a module is never a large empty interior and never a
   stretched neighbour. */
const PLAYER_ROLES = [
  { key: 'rushing', title: 'Rushing', phase: 'off', section: 'off', w: 620, cap: 6, sort: { key: 'yds', dir: 'desc' } },
  { key: 'passing', title: 'Passing', phase: 'off', section: 'off', w: 632, cap: 3, sort: { key: 'yds', dir: 'desc' } },
  { key: 'receiving', title: 'Receiving', phase: 'off', section: 'off', w: 498, cap: 6, sort: { key: 'yds', dir: 'desc' } },
  { key: 'tackles', title: 'Tackles', phase: 'def', section: 'def', w: 638, cap: 9, sort: { key: 'tkl', dir: 'desc' } },
  { key: 'returns', title: 'Return Game', phase: 'st', section: 'st', w: 482, cap: 6, sort: { key: 'yds', dir: 'desc' } },
  // Kicking / Punting opens unmarked: the engine orders it by made plus punts,
  // which is not a single column, and claiming a sorted column it does not have
  // would be a false statement about the data.
  { key: 'kicking', title: 'Kicking / Punting', phase: 'st', section: 'st', w: 448, cap: 3 },
];
/* Phase is the ONLY grouping. Offense, Defense and Special Teams each stay
   contiguous and keep their listed role order; nothing pairs across a phase
   boundary, which is what produced the rejected Receiving/Tackles checkerboard.
   Phase identity comes from the composition and the existing per-phase module
   colour, never from added copy. */
const PLAYER_PHASES = ['off', 'def', 'st'];
const PLAYER_SECTIONS = [
  ['all', 'All roles'], ['off', 'Offense'], ['def', 'Defense'], ['st', 'Special Teams'],
];
/* Column width step per measurement, keyed by the view model's own column key.
 * Six steps, each sized from the widest thing that column must hold -- its own
 * header or a full-season figure. A single width clipped Solo, Sack, Fum and
 * Punt Avg; a four-step set sized against one game let a season `122/201`, a
 * four-digit season yardage and `Punt Avg` overrun. Identity takes the slack. */
const PLAYER_COL_SIZE = {
  tds: 's', fr: 's',
  att: 'c', rec: 'c', ret: 'c', tkl: 'c', ast: 'c', tfl: 'c', ints: 'c', sacks: 'c',
  yds: 'm', avg: 'm',
  solo: 'l2',
  long: 'l', fum: 'l', punts: 'l',
  pct: 'pct', ca: 'ca', grade: 'g',
  fg: 'xl', puntAvg: 'xl',
};
/* One key, two columns: `sacks` is Passing's `Sck` (a count) and Tackles'
   `Sack` (a wider header). A column is sized from what IT holds, so the wider
   of the two is not imposed on the other. */
const PLAYER_COL_SIZE_BY_ROLE = { tackles: { sacks: 'l2' } };
/* A band half is (VW - 32 board padding - 1 gap) / 2 - 24 module padding:
 * 599px at 1280. A band whose widest table needs more than that stacks there;
 * the rest stay paired, so Return Game and Kicking / Punting are not stacked
 * merely because Tackles is wide. */
const PLAYER_HALF_1280 = 599;

const PLAYER_NO_DATA_CELL = 'No data';

/* Selected games: a compact checklist of the program season's own games. It
   selects nothing on its own -- an empty selection keeps the full season cohort
   rather than silently emptying the board -- writes nothing to stored data, and
   never offers an opponent-scout game, because those are not our players. */
function GamePicker({ screen }) {
  const [open, setOpen] = useState(false);
  const games = screen._playersSelectableGames();
  const selected = screen.playersSelectedGames || new Set();
  if (!games.length) return null;
  return <div class="gi-players-picker">
    <button type="button" class="gi-players-pickbtn" data-players-picker aria-haspopup="true" aria-expanded={open}
      onClick={() => setOpen(!open)}>{screen._playersSelectedLabel()} ▾</button>
    {open && <div class="gi-players-pickpanel" role="menu" aria-label="Select games">
      {games.map(game => <label key={game.id} class="gi-players-pickitem" role="menuitemcheckbox"
        aria-checked={selected.has(game.id)}>
        <input type="checkbox" checked={selected.has(game.id)} data-players-game={game.id}
          onChange={() => screen.togglePlayersGame(game.id)} />
        <span>{game.label}</span>
      </label>)}
    </div>}
  </div>;
}

/* ── Revision 2: the player detail view ────────────────────────────────────
   One player, every role they were credited in, the same buckets split by game
   and by a charted dimension. It opens IN the tab: Reports never navigates away
   from itself. Roles stay separate and labelled -- there is no overall rating,
   because a tackle and a reception do not add up to one number. */
function PlayerStat({ label, value, refs, screen, watchLabel }) {
  const clickable = Array.isArray(refs) && refs.length && value !== PLAYER_NO_DATA_CELL;
  return <div class="gi-pd-stat">
    <span>{label}</span>
    {clickable
      ? <button type="button" class="gi-player-stat" data-pd-stat={label}
          onClick={() => screen.watchRefs(refs, watchLabel)}>{value}</button>
      : <strong class={value === PLAYER_NO_DATA_CELL ? 'blank' : ''}>{value}</strong>}
  </div>;
}

function PlayerDetail({ detail, screen, scopeLabel }) {
  const engine = screen.app.stats;
  const roleKeys = detail.roles.map(role => role.key);
  /* The situational selection is CONTROLLER state, like the scope and the open
     player: an ordinary re-render remounts this component, and the export has to
     print the breakdown the coach is actually looking at. Held locally, the
     export independently chose the first dimension of every role and could not
     match the screen. */
  const [, forceRender] = useState(0);
  const activeRole = roleKeys.includes(screen.playersSituRole) ? screen.playersSituRole : roleKeys[0];
  const setDimRole = value => { screen.playersSituRole = value; screen.playersSituDimension = ''; forceRender(n => n + 1); };
  const dimensions = engine.constructor.PLAYER_DIMENSIONS.filter(item => item.roles.includes(activeRole));
  const setDimension = value => { screen.playersSituDimension = value; forceRender(n => n + 1); };
  const activeDim = dimensions.some(item => item.key === screen.playersSituDimension)
    ? screen.playersSituDimension : (dimensions[0]?.key || '');
  const situational = activeDim
    ? engine.playerSituational(screen._playersScopedPlays || [], detail.num, activeRole, activeDim)
    : [];
  const situationalMeasures = (engine.constructor.PLAYER_ROLES
    .find(item => item.key === activeRole) || {}).measures || [];
  const cells = role => PLAYER_DETAIL_STATS[role.key].map(([bucket, label]) => {
    const fact = role.stats[bucket];
    const value = PLAYER_DETAIL_TOTALS[role.key]?.includes(bucket)
      ? (fact && fact.n ? fact.total : (fact && fact.n === 0 ? PLAYER_NO_DATA_CELL : 0))
      : (fact ? fact.n : 0);
    return { label, value, refs: fact?.refs || [] };
  });
  return <div class="gi-pd" data-player-detail={detail.num}>
    <div class="gi-pd-head">
      <button type="button" class="gi-pd-back" data-pd-back onClick={() => screen.closePlayerDetail()}>← All players</button>
      <h3><i>#{detail.num}</i>{detail.name ? ` ${detail.name}` : ''}</h3>
      <span class="gi-pd-scope">{scopeLabel}</span>
    </div>
    <div class="gi-pd-roles">
      {detail.roles.map(role => <section key={role.key} class="gi-overview-module gi-pd-role">
        <header><strong>{role.label}</strong>
          <span>{role.grade == null ? 'No grade charted' : `Grade ${role.grade > 0 ? '+' : ''}${role.grade}`}</span></header>
        <div class="gi-pd-stats">
          {cells(role).map(cell => <PlayerStat key={cell.label} {...cell} screen={screen}
            watchLabel={`#${detail.num} ${role.label} ${cell.label}`} />)}
        </div>
      </section>)}
    </div>
    <section class="gi-overview-module gi-pd-games">
      <header><strong>Game by game</strong><span>{detail.games.length} game{detail.games.length === 1 ? '' : 's'}</span></header>
      <div class="gi-st-table-wrap"><table class="stats-table gi-pd-table"><thead><tr>
        <th class="tl">Opponent</th>{detail.roles.map(role =>
          <th key={role.key}>{role.label}</th>)}
      </tr></thead><tbody>
        {detail.games.map(game => <tr key={game.gid}>
          <td class="tl">{game.opponent}</td>
          {detail.roles.map(role => {
            const inGame = game.roles[role.key];
            if (!inGame) return <td key={role.key} class="blank">{PLAYER_NO_DATA_CELL}</td>;
            /* One owner for the summary, shared with the printed report: the
               measures that actually happened, or the credited play count. */
            const text = inGame.summary;
            if (!text) return <td key={role.key} class="blank">{PLAYER_NO_DATA_CELL}</td>;
            return <td key={role.key}>
              <button type="button" class="gi-player-stat" data-pd-game={`${game.gid}:${role.key}`}
                onClick={() => screen.watchRefs(inGame.refs, `#${detail.num} ${role.label} vs ${game.opponent}`)}>
                {text}</button>
            </td>;
          })}
        </tr>)}
      </tbody></table></div>
    </section>
    <section class="gi-overview-module gi-pd-situ">
      <header><strong>Situational</strong>
        <span>
          <select aria-label="Role" value={activeRole} onChange={event => setDimRole(event.currentTarget.value)}>
            {detail.roles.map(role => <option key={role.key} value={role.key}>{role.label}</option>)}
          </select>
          <select aria-label="Dimension" value={activeDim} onChange={event => setDimension(event.currentTarget.value)}>
            {dimensions.map(item => <option key={item.key} value={item.key}>{item.label}</option>)}
          </select>
        </span>
      </header>
      {situational.length ? <div class="gi-st-table-wrap">
        {/* One sortable results table, every column sortable by click, Enter or
            Space — the same DataTable the leaderboard uses. Each role brings its
            OWN measures, so a punt-only kicking group states its punts and a
            takeaway-only defender states the takeaway instead of reading 0. */}
        <DataTable className="stats-table gi-player-table gi-pd-situ-table"
          defaultSort={{ key: 'plays', dir: 'desc' }}
          columns={[
            { key: 'value', label: dimensions.find(item => item.key === activeDim)?.label || 'Value', tl: true, size: 'ident' },
            { key: 'plays', label: 'Plays', numeric: true, size: 'c',
              render: row => <button type="button" class="gi-player-stat" data-pd-situ={row.value}
                onClick={() => screen.watchRefs(row.refs, `#${detail.num} ${activeRole} ${row.value}`)}>{row.plays}</button> },
            ...(situationalMeasures || []).map(measure => ({
              key: measure.key, label: measure.label, numeric: true, size: 'm',
              render: row => {
                const cell = row.cells[measure.key];
                if (!cell || !cell.measured) return <span class="blank">{PLAYER_NO_DATA_CELL}</span>;
                if (!cell.refs.length) return cell.value;
                return <button type="button" class="gi-player-stat" data-pd-situ-stat={`${measure.key}:${row.value}`}
                  onClick={() => screen.watchRefs(cell.refs, `#${detail.num} ${row.value} ${measure.label}`)}>{cell.value}</button>;
              },
            })),
            /* Grade DISPLAYS `No data` but must SORT on its number, or the
               string converts to 0 and an ungraded row lands above a negative
               grade. `gradeSort` is null when ungraded, which DataTable already
               groups last in both directions. */
            { key: 'grade', label: 'Grade', numeric: true, size: 'g',
              sortValue: row => row.gradeSort,
              cellClass: row => (row.gradeSort == null ? 'blank' : undefined) },
          ]}
          rows={situational.map(row => ({
            id: row.value, value: row.value, plays: row.n,
            cells: Object.fromEntries(row.measures.map(measure => [measure.key, measure])),
            /* An UNMEASURED value stays null in the sort data. Flattened to its
               displayed 0 it was indistinguishable from a measured zero and
               sorted ahead of negative values in both directions. */
            ...Object.fromEntries(row.measures.map(measure =>
              [measure.key, measure.measured ? measure.value : null])),
            grade: row.grade == null ? PLAYER_NO_DATA_CELL : `${row.grade > 0 ? '+' : ''}${row.grade}`,
            gradeSort: row.grade,
          }))} />
      </div> : <p class="gi-st-empty">{PLAYER_NO_DATA_CELL}</p>}
    </section>
  </div>;
}

/* The detail view's stat rows, per role: the bucket, then its literal label. */
const PLAYER_DETAIL_STATS = {
  rushing: [['att', 'Attempts'], ['yds', 'Yards'], ['td', 'Touchdowns'], ['fum', 'Fumbles']],
  passing: [['att', 'Attempts'], ['cmp', 'Completions'], ['yds', 'Yards'], ['td', 'Touchdowns'], ['int', 'Interceptions'], ['sck', 'Sacks']],
  receiving: [['rec', 'Receptions'], ['yds', 'Yards'], ['td', 'Touchdowns']],
  tackles: [['tkl', 'Tackles'], ['solo', 'Solo'], ['ast', 'Assists'], ['sack', 'Sacks'], ['tfl', 'Tackles for loss'], ['int', 'Interceptions'], ['fr', 'Fumbles recovered']],
  returns: [['ret', 'Returns'], ['yds', 'Return yards'], ['td', 'Touchdowns']],
  kicking: [['fgAtt', 'Field goal attempts'], ['fgMade', 'Field goals made'], ['punts', 'Punts'], ['puntYds', 'Punt yards']],
};
/* The buckets whose displayed value is a TOTAL rather than a count. */
const PLAYER_DETAIL_TOTALS = {
  rushing: ['yds'], passing: ['yds'], receiving: ['yds'], returns: ['yds'], kicking: ['puntYds'],
};
const PLAYER_GAME_CELL = {
  rushing: (n, yds) => `${n} att, ${yds} yds`,
  passing: (n, yds) => `${n} att, ${yds} yds`,
  receiving: (n, yds) => `${n} rec, ${yds} yds`,
  tackles: n => `${n} tkl`,
  returns: (n, yds) => `${n} ret, ${yds} yds`,
  kicking: (n, yds) => `${n} FG, ${yds} punt yds`,
};
const PLAYER_SITU_HEAD = {
  rushing: ['Att', 'Yds'], passing: ['Att', 'Yds'], receiving: ['Rec', 'Yds'],
  tackles: ['Tkl', 'Tkl'], returns: ['Ret', 'Yds'], kicking: ['FG att', 'Punt yds'],
};

/* Revision 2: a compact column menu per role table. Presentation state only —
   hiding a column changes nothing about a calculation, a sort source or a film
   cohort, and Player is never hideable because a row without its identity
   cannot be read. Defaults are the approved schemas. */
function ColumnMenu({ role, columns, hidden, onToggle }) {
  const [open, setOpen] = useState(false);
  const optional = columns.filter(([key]) => key !== 'player');
  if (!optional.length) return null;
  return <div class="gi-player-colmenu">
    <button type="button" class="gi-player-colbtn" aria-haspopup="true" aria-expanded={open}
      aria-label={`${role.title} columns`} title="Columns" onClick={() => setOpen(!open)}>&#9636;</button>
    {open && <div class="gi-player-colpanel" role="menu" aria-label={`${role.title} columns`}>
      {optional.map(([key, label]) => <label key={key} class="gi-player-colitem" role="menuitemcheckbox"
        aria-checked={!hidden.includes(key)}>
        <input type="checkbox" checked={!hidden.includes(key)} onChange={() => onToggle(key)} />
        <span>{label}</span>
      </label>)}
    </div>}
  </div>;
}

function PlayerRoleModule({ role, table, screen }) {
  const rows = table?.rows || [];
  const hiddenAll = screen.playersHiddenColumns || (screen.playersHiddenColumns = {});
  const [hidden, setHiddenState] = useState(hiddenAll[role.key] || []);
  const toggle = key => {
    const next = hidden.includes(key) ? hidden.filter(item => item !== key) : [...hidden, key];
    hiddenAll[role.key] = next;
    setHiddenState(next);
  };
  const columns = (table?.columns || []).filter(([key]) => key === 'player' || !hidden.includes(key))
    .map(([key, label, numeric, sortKey]) => ({
    key, label, numeric, tl: key === 'player',
    size: key === 'player' ? 'ident'
      : (PLAYER_COL_SIZE_BY_ROLE[role.key]?.[key] || PLAYER_COL_SIZE[key] || 'm'),
    // Jersey number and name are one string in the view model, so they are one
    // cell here. The number is picked out so a coach who charts by number can
    // find a row without reading the names.
    /* IDENTITY OPENS THE PLAYER, A STATISTIC OPENS ITS OWN PLAYS. The whole-row
       action was the only affordance and it was too broad: every cell in the row
       did the same thing. Identity now opens player detail, and each measured
       value with clips of its own is a button carrying exactly that bucket's
       composite refs. A `No data` cell and a measured zero with no clips stay
       visible and stay unclickable -- there is no playlist to open. */
    render: key === 'player'
      ? row => <button type="button" class="gi-player-ident" data-player-open={row.num}
          onClick={event => { event.stopPropagation(); screen.openPlayerDetail?.(row.num); }}>
          <i class="gi-player-num"><span>{`#${row.num}`}</span></i>{` ${String(row.player ?? '').replace(/^#\S+\s*/, '')}`}</button>
      : row => {
        const refs = row.statRefs?.[key] || [];
        const value = row[key];
        if (!refs.length || value === PLAYER_NO_DATA_CELL) return value;
        return <button type="button" class="gi-player-stat" data-player-stat={`${role.key}:${key}:${row.num}`}
          onClick={event => { event.stopPropagation(); screen.watchRefs(refs, `${row.label} — ${role.title} ${label}`); }}
        >{value}</button>;
      },
    sortValue: sortKey ? row => row[sortKey] : undefined,
    // An uncharted measurement drops to copy weight so it cannot read as a
    // figure; a measured zero keeps full strength.
    cellClass: row => [key === 'grade' ? row.gradeClass : '',
      row[key] === 'No data' ? 'blank' : ''].filter(Boolean).join(' ') || undefined,
  }));
  /* THE MODULE IS ITS ROW CAPACITY. Unused slots are the shared HELD row — a
     dash in every column, never interactive and never sorted above real data —
     so a sparse role is a correctly sized module instead of dead space. A cohort
     over capacity scrolls inside the body; the module header and the column
     header do not move, because only the table wrap scrolls. */
  const cap = role.cap || 6;
  const held = Math.max(0, cap - rows.length);
  const bodyRows = [
    ...rows.map(row => ({ ...row, player: row.label, id: `${role.key}-${row.num}`,
      label: `${row.label} — ${role.title}` })),
    ...Array.from({ length: held }, (_, index) => ({ id: `${role.key}-held-${index}`, absent: true })),
  ];
  return <Module title={role.title}
    meta={`${rows.length} player${rows.length === 1 ? '' : 's'}`}
    cls={`gi-player-module is-${role.phase}${rows.length > cap ? ' is-scrolling' : ''}`}
    action={<ColumnMenu role={role} columns={table?.columns || []} hidden={hidden} onToggle={toggle} />}>
    <div class="gi-player-body" data-player-cap={cap} style={`--player-cap:${cap}`}>
      <DataTable className="stats-table gi-player-table" columns={columns} defaultSort={role.sort || null}
        rows={bodyRows} />
    </div>
  </Module>;
}

export function PlayersTab({ stats, scoped = null, screen, labels = null, fixedScope = false }) {
  /* Section lives on the controller, the way `playersScope` does. A scope change
     calls `_renderActiveTab()`, which unmounts and remounts this component, so a
     purely local selection was discarded and the board snapped back to All
     roles. Local state still drives the render, so switching SECTION re-renders
     in place and does not disturb sort state; the controller property is what
     survives the remount. */
  const [section, setSectionState] = useState(screen.playersSection || 'all');
  const setSection = id => { screen.playersSection = id; setSectionState(id); };
  const engine = screen.app.stats;
  const playerLabel = num => labels?.[String(num)] ? `#${num} ${labels[String(num)]}` : engine._playerLabel(num);
  /* ONE CREDIT INDEX BEHIND EVERYTHING. The leaderboard's per-stat film, the
     detail view, the game split and the situational split all read this board,
     so a figure and its clips are the same play list. */
  const board = engine.playersBoard(scoped || [], {
    roster: Object.fromEntries((screen._playersRoster?.() || []).map(item => [String(item.num), item.name])),
    labels: screen._playersGameLabels?.() || {},
  });
  const tables = view.individualStats(stats, 'all', playerLabel, board);
  const openNum = screen.playersPlayer ? String(screen.playersPlayer) : '';
  const detail = openNum
    ? engine.playerDetail(scoped || [], openNum, {
      roster: Object.fromEntries((screen._playersRoster?.() || []).map(item => [String(item.num), item.name])),
      labels: screen._playersGameLabels?.() || {},
      gameOrder: (screen._playersGameOrder?.() || []),
    })
    : null;
  if (!tables.length) return <EmptyState title="No player attribution" body="No players are attributed to charted plays."
    action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown?.() }} />;

  const tableByKey = Object.fromEntries(tables.map(table => [table.key, table]));
  const rolePlayers = keys => new Set(keys.flatMap(key => (tableByKey[key]?.rows || []).map(row => String(row.num))));
  const sectionKeys = id => PLAYER_ROLES.filter(role => id === 'all' || role.section === id).map(role => role.key);
  const playerCount = rolePlayers(sectionKeys('all')).size;
  const playCount = scoped?.length ?? stats?.allPlays?.length ?? 0;

  /* PHASE GROUPS, NOT PAIRS. Each phase keeps its own roles together and in
   * order; the groups are laid out in two columns at desktop width (Offense
   * beside Defense + Special Teams) and stack into one column when a column
   * can no longer hold its widest table. The roles with no attribution still
   * consolidate into one literal `No data` row that names them. */
  const shown = sectionKeys(section);
  const populated = shown.filter(key => tableByKey[key]?.rows.length);
  const absent = shown.filter(key => !tableByKey[key]?.rows.length);
  const roleOf = key => PLAYER_ROLES.find(role => role.key === key);
  const groupOf = phase => populated.filter(key => roleOf(key).phase === phase);
  const groups = PLAYER_PHASES.map(phase => ({ phase, keys: groupOf(phase) })).filter(group => group.keys.length);
  // One phase on screen is one column: the same capacities, order and held rows,
  // sized to its own widest table instead of stretched over the whole board.
  const columns = section === 'all'
    ? [groups.filter(g => g.phase === 'off'), groups.filter(g => g.phase !== 'off')].filter(col => col.length)
    : [groups];

  return <div class="gi-overview-board gi-players-board">
    <div class="gi-players-report">
      {/* Roles and the three-way scope live in the shared secondary bar
          (coach-approved comp, 2026-09-23); the sample line stays with the
          board it describes. A player's detail view keeps the scope and hides
          the role pages, as before. */}
      <ReportSectionBar screen={screen} label="Player roles" navClass="gi-players-roles"
        sections={detail ? [] : PLAYER_SECTIONS.map(([id, title]) => {
          const count = rolePlayers(sectionKeys(id)).size;
          return { id, label: title, count: String(count), none: !count };
        })}
        active={section} onSelect={setSection}
        scope={fixedScope ? null : [['game', 'Current game'], ['season', 'Full season'], ['selected', 'Selected games']].map(([id, label]) => ({
          id, label, active: screen.playersScope === id, onSelect: () => screen.setPlayersScope(id), attrs: { 'data-players-scope': id } }))}
        scopeExtra={!fixedScope && screen.playersScope === 'selected' ? <GamePicker screen={screen} /> : null} />
      {/* The page heading, the Defense board's hierarchy (coach direction,
          1.12.0-97 smoke S97-1). A player's detail view keeps its own heading. */}
      {/* The role count keeps its denominator whenever a role is unattributed:
          `5 roles` reads as the whole set, `5/6 roles` says one is missing.
          A full six drops the denominator, because there is nothing absent
          for it to name. The sample line is the heading's cohort statement,
          so it is said once; with a player open it stays above the detail. */}
      {(() => {
        const sample = fixedScope ? null : <span class="gi-players-sample"><b>{playerCount}</b> players · <b>{
          tables.length === PLAYER_ROLES.length ? String(tables.length) : `${tables.length}/${PLAYER_ROLES.length}`
        }</b> roles · <b>{playCount}</b> charted plays{screen.playersScope === 'selected'
          ? ` · ${screen._playersSelectedLabel()}` : ''}</span>;
        if (detail) return sample ? <div class="gi-players-toolbar">{sample}</div> : null;
        const index = PLAYER_SECTIONS.findIndex(([id]) => id === section);
        return <header class="gi-report-heading">
          <span>{String(index + 1).padStart(2, '0')}</span><h2>{PLAYER_SECTIONS[index][1]}</h2>
          <small class="gi-players-toolbar">{sample || `${rolePlayers(sectionKeys(section)).size} players`}</small>
        </header>;
      })()}
      {detail ? <PlayerDetail detail={detail} screen={screen} scopeLabel={screen._playersScopeLabel()} /> : null}
      {detail ? null : <div class={`gi-players-sections cols-${columns.length}`} data-players-columns={columns.length}>
        {columns.map((column, index) => <div key={`${section}-col-${index}`} class="gi-players-col">
          {column.map(group => <div key={group.phase} class={`gi-player-phase is-${group.phase}`} data-players-phase={group.phase}>
            {group.keys.map(key => <PlayerRoleModule key={key} role={roleOf(key)} table={tableByKey[key]} screen={screen} />)}
          </div>)}
        </div>)}
        {absent.length ? <div class="gi-player-empty-summary">
          <span>No data</span><strong>{absent.map(key => roleOf(key).title).join(' · ')}</strong>
        </div> : null}
      </div>}
    </div>
  </div>;
}

/* Reports > Defense lives in its own owner, `native-defense-board.jsx`
   (Revision 2). It is re-exported here so every importer keeps one entry. */
export { DefenseTab };

function OpponentWatch({ kind, count, label, screen }) {
  if (!count) return null;
  const refs = screen._opponentRefs(kind);
  if (!refs.length) return null;
  return <button type="button" class="gi-reports-watch" data-opponent-watch={kind} onClick={() => screen.watchRefs(refs, label)}>
    {label} <span>{count}</span>
  </button>;
}

function OpponentAnswerList({ title, rows, screen }) {
  if (!rows.length) return null;
  return <Module title={title}><div class="gi-answer-list">{rows.map((row, i) =>
    <WatchableRefs key={`${row.label}-${i}`} refs={row.refs} label={`${title}: ${row.label}`} screen={screen} class="gi-answer-row">
      <span>{row.label}</span><strong>{row.value}</strong>{row.sub ? <small>{row.sub}</small> : null}
    </WatchableRefs>)}</div></Module>;
}

/** Native opponent answer sheet. Values come directly from generateOpponentScout;
 * film actions use the exact composite refs carried by its grouped rows. */
export function OpponentOverviewTab({ data, screen }) {
  if (!data?.games) return <EmptyState title="No opponent sample yet" body="Tag a game against this opponent, or chart their film in Opponent Scout. Reports separate their offense, defense, and Special Teams without re-tagging." />;
  const join = data.defenseJoin;
  const off = data.offReport;
  const runPct = off?.stats?.tendencies?.runPct;
  const identity = [join?.baseFront ? `${join.baseFront.name} front` : '', join?.baseCoverage?.name || '', runPct != null ? `${Math.round(parseFloat(runPct))}% run` : ''].filter(Boolean).join(', ');
  const cards = [
    { label: 'Games charted', value: data.games, sub: 'opponent sample' },
    { label: 'Offensive snaps', value: data.offCount, sub: 'their offense', cls: 'is-gold' },
    { label: 'Defensive snaps', value: data.defCount, sub: 'their defense' },
    { label: 'Special Teams', value: data.stCount, sub: 'scout-film snaps' },
  ];
  const expect = (off?.formationDetail || []).slice(0, 3).map(row => ({ label: row.name, value: `${row.total} snaps`, sub: `${row.runPct}% run`, refs: row.refs }));
  const attack = join?.best ? [{ label: join.best.name, value: `${join.best.succPct}% success`, sub: `${join.best.n} snaps, ${join.best.avg} avg`, refs: join.best.refs }] : [];
  const avoid = join?.worst && join.worst !== join.best ? [{ label: join.worst.name, value: `${join.worst.succPct}% success`, sub: `${join.worst.n} snaps, ${join.worst.avg} avg`, refs: join.worst.refs }] : [];
  const risk = join ? [
    { label: 'Blitz rate', value: `${join.pressure.ratePct}%`, sub: `${join.pressure.blitzed.n} pressure snaps`, refs: join.pressure.blitzed.refs },
    { label: 'Sacks allowed', value: join.pressure.blitzed.sacks + join.pressure.noBlitz.sacks, sub: 'across this cohort', refs: [...join.pressure.blitzed.refs, ...join.pressure.noBlitz.refs] },
  ] : [];
  return <div class="gi-overview-board">
    <div class="gi-answer-head"><div><span class="gi-answer-eyebrow">Opponent identity</span><h3>{data.opponent}</h3>{identity && <p class="gi-answer-identity">{identity}</p>}<p class="gi-answer-sample">{data.games} games, {data.offCount + data.defCount + data.stCount} charted snaps</p></div>
      <OpponentWatch kind="all" count={data.offCount + data.defCount + data.stCount} label={`Watch all ${data.opponent} film`} screen={screen} /></div>
    <KpiBand items={cards} />
    <div class="gi-overview-band gi-overview-band-auto">
      <OpponentAnswerList title="Expect" rows={expect} screen={screen} />
      <OpponentAnswerList title="Attack" rows={attack} screen={screen} />
      <OpponentAnswerList title="Avoid" rows={avoid} screen={screen} />
      <OpponentAnswerList title="Risk" rows={risk} screen={screen} />
    </div>
    <Module title="Film" meta="exact charted cohorts">
      <div class="gi-reports-watch-row">
        <OpponentWatch kind="offense" count={data.offCount} label="Their offense" screen={screen} />
        <OpponentWatch kind="defense" count={data.defCount} label="Their defense" screen={screen} />
        <OpponentWatch kind="special" count={data.stCount} label="Their Special Teams" screen={screen} />
      </div>
    </Module>
  </div>;
}

function scoutRows(rows, screen, prefix) {
  return (rows || []).map(row => ({ ...row, id: row.key || row.name || row.label,
    situation: row.label || row.key, snaps: row.total, runPct: row.runPct, passPct: 100 - row.runPct,
    onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${prefix}: ${row.label || row.key || row.name}`) : undefined,
    label: `${prefix}: ${row.label || row.key || row.name}` }));
}

/** Their offense, rebuilt from the structured scout model with no legacy HTML renderer. */
export function OpponentOffenseTab({ data, screen }) {
  const report = data?.offReport;
  if (!report) return <EmptyState title="No opponent offensive snaps" body="On head-to-head film, chart our unit as Defense. On opponent film, choose Opponent Scout and chart their Offense." />;
  const engine = screen.app.stats;
  const totalYards = report.stats.rushing.yards + report.stats.passing.yards;
  const big = engine._bigTwelveData(data.offPlays);
  const bigRows = big.calls.map(call => {
    const predicate = engine._buildCutFilter('bigCall', call.key);
    const refs = [...new Set(data.offPlays.filter(predicate).filter(p => p.__gid != null && p.id != null).map(p => `${p.__gid}::${p.id}`))];
    const runPct = call.n ? Math.round(call.runs / call.n * 100) : 0;
    return { ...call, id: call.key, n: call.n, succ: call.n ? Math.round(call.succ / call.n * 100) : 0,
      avg: call.n ? (call.yards / call.n).toFixed(1) : '0.0', runPct, refs,
      cutLabel: `${call.form || call.qb || 'Opponent call'} ${call.pt || ''} — ${call.n} plays` };
  });
  const bigData = big.total >= 8 ? { to90: big.to90, label: data.opponent, rows: bigRows } : null;
  const columns = [{ key: 'situation', label: 'Situation' }, { key: 'snaps', label: 'Snaps', numeric: true },
    { key: 'runPct', label: 'Run', numeric: true, render: row => `${row.runPct}%` },
    { key: 'passPct', label: 'Pass', numeric: true, render: row => `${row.passPct}%` }, { key: 'avg', label: 'Avg', numeric: true }];
  const formations = scoutRows(report.formationDetail.map(row => ({ ...row, key: row.name, label: row.name, avg: row.total ? (row.yards / row.total).toFixed(1) : '0.0' })), screen, 'Formation');
  return <div class="gi-overview-board">
    <div class="gi-st-toolbar"><strong class="gi-st-toolbar-label">Their offense</strong><OpponentWatch kind="offense" count={data.offCount} label="Watch opponent offense" screen={screen} /></div>
    <KpiBand items={[
      { label: 'Snaps', value: report.totalPlays, sub: 'charted offense' },
      { label: 'Run / pass', value: report.stats.tendencies.runPassRatio, sub: `${report.stats.tendencies.runPct}% run`, cls: 'is-gold' },
      { label: 'Yards / play', value: report.totalPlays ? (totalYards / report.totalPlays).toFixed(1) : '0.0', sub: `${totalYards} yards` },
      { label: 'Third down', value: report.thirdDown.total ? `${report.thirdDown.converted}/${report.thirdDown.total}` : 'N/A', sub: report.thirdDown.total ? `${Math.round(report.thirdDown.converted / report.thirdDown.total * 100)}%` : 'no sample' },
      { label: 'Red-zone TD', value: report.redZone.total ? `${report.redZone.tds}/${report.redZone.total}` : 'N/A', sub: 'scoring trips' },
    ]} />
    <Module title="Formation tendencies" meta="each row opens exact film"><DataTable columns={columns} rows={formations} /></Module>
    <ShapePanels shape={engine._dataShape(report.stats, { plays: data.offPlays, cut: false, profile: false })} />
    <TendencyMatrixPanel engine={engine} plays={data.offPlays} defaultRow="formation" defaultCol="dirVsStrength" title="Tendencies — pivot any two dimensions" />
    {bigData && <BigTwelve data={bigData} screen={screen} />}
    <div class="gi-overview-band gi-overview-band-2">
      <Module title="By down"><DataTable columns={columns} rows={scoutRows(report.byDown, screen, 'Down')} /></Module>
      <Module title="By distance to the sticks"><DataTable columns={columns} rows={scoutRows(report.byDistance, screen, 'Distance')} /></Module>
    </div>
    <Module title="Every situation" meta={`${report.downTendency.length} combinations, all snaps accounted for`}>
      <DataTable columns={columns.slice(0, 4)} rows={scoutRows(report.downTendency, screen, 'Situation')} />
    </Module>
  </div>;
}

function OpponentDefenseTable({ title, meta, first, rows, screen }) {
  return <Module title={title} meta={meta}><DataTable columns={[
    { key: 'name', label: first }, { key: 'n', label: 'Snaps', numeric: true }, { key: 'avg', label: 'Yds/play', numeric: true },
    { key: 'succPct', label: 'Our success', numeric: true, render: row => `${row.succPct}%` },
    { key: 'explPct', label: 'Explosive Plays Rate', numeric: true, render: row => `${row.explPct}%` }, { key: 'sacks', label: 'Sacks', numeric: true },
  ]} rows={rows.map(row => ({ ...row, id: row.name, onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${title}: ${row.name}`) : undefined, label: `${title}: ${row.name}` }))} emptyText={`No ${first.toLowerCase()} charted.`} /></Module>;
}

/** Their defense, rebuilt around the joined front/coverage/outcome model. */
export function OpponentDefenseTab({ data, screen }) {
  const join = data?.defenseJoin;
  if (!join) return <EmptyState title="No opponent defensive snaps" body="Chart our unit as Offense on head-to-head film. Every offensive snap records the front, coverage, and pressure they showed." />;
  const pressure = join.pressure;
  return <div class="gi-overview-board">
    <div class="gi-st-toolbar"><strong class="gi-st-toolbar-label">Their defense</strong><OpponentWatch kind="defense" count={data.defCount} label="Watch opponent defense" screen={screen} /></div>
    <KpiBand items={[
      { label: 'Snaps', value: join.total, sub: 'charted defense' },
      { label: 'Blitz rate', value: `${pressure.ratePct}%`, sub: `${pressure.blitzed.n} pressure snaps`, cls: 'is-gold' },
      { label: 'Success vs blitz', value: pressure.blitzed.n ? `${pressure.blitzed.succPct}%` : 'N/A', sub: `${pressure.blitzed.avg} yds/play` },
      { label: 'Success vs no blitz', value: `${pressure.noBlitz.succPct}%`, sub: `${pressure.noBlitz.avg} yds/play` },
      { label: 'Sacks allowed', value: pressure.blitzed.sacks + pressure.noBlitz.sacks, sub: 'all calls' },
    ]} />
    <OpponentDefenseTable title="Fronts — and what they cost us" meta="frequency, production, explosives, and sacks" first="Front" rows={join.fronts} screen={screen} />
    <OpponentDefenseTable title="Coverages — and what they cost us" meta="frequency, production, explosives, and sacks" first="Coverage" rows={join.coverages} screen={screen} />
    <div class="gi-overview-band gi-overview-band-2">
      <OpponentDefenseTable title="What they play against our looks" meta="our formation, their answer, our result" first="Our formation" rows={join.byOurLook} screen={screen} />
      <OpponentDefenseTable title="By situation" meta="money downs, red zone, and backed up" first="Situation" rows={join.bySituation} screen={screen} />
    </div>
    {join.changeups.length > 0 && <OpponentDefenseTable title="Changeups" meta={`calls outside ${join.baseFront?.name || 'their base'}`} first="Front" rows={join.changeups} screen={screen} />}
  </div>;
}
export function OpponentSpecialTeamsTab({ data, screen }) {
  if (!data?.stStats) return <EmptyState title="No opponent Special Teams scout film" body="Chart a future opponent game in Opponent Scout to build kick, return, field-goal, and try tendencies. Head-to-head film is not auto-flipped because the stored subject is our team." />;
  const summary = screen.app.stats._specialTeamsSummary(data.stPlays, data.stStats);
  return <SpecialTeamsTab stats={data.stStats} summary={summary} screen={screen} fixedScope title="Their Special Teams"
    toolbarAction={<OpponentWatch kind="special" count={data.stCount} label="Watch opponent Special Teams" screen={screen} />} />;
}
/** The five Special Teams surfaces. Not one tab per unit: a coordinator studies
 *  the kicking unit against the receiving unit that faces it, so each pair is
 *  co-located. The units stay DISTINCT inside a surface -- separate modules,
 *  separate denominators -- they are never merged. */
/* Each tab's badge states WHAT it counts. A bare number over five different
   sections counted five different things -- snaps, then unit snaps, then
   attempts, then rostered players -- and said so nowhere. `counts` is the noun
   the badge belongs to; the section keeps its own label. */
const ST_SECTIONS = [
  { id: 'st1', label: 'All units', counts: 'snaps', title: 'All units' },
  { id: 'st2', label: 'Kickoff & Kick Return', counts: 'snaps', title: 'Kickoff and kick return' },
  { id: 'st3', label: 'Punt & Punt Return', counts: 'snaps', title: 'Punt and punt return' },
  { id: 'st4', label: 'Kicking game', counts: 'attempts', title: 'Kicking game' },
  { id: 'st5', label: 'Specialists', counts: 'players', title: 'Specialists' },
];

/** Aligned label/value lines. A null value is the report's one absence label. */
function StatRows({ rows }) {
  return <div class="gi-st-rows">{rows.map((row, i) => <div key={i} class="gi-st-row">
    <span>{row.label}</span>
    <strong class={`${row.value == null ? 'is-blank' : (row.cls || '')}${row.sub ? ' is-sub' : ''}`}>
      {row.value == null ? view.ST_NO_DATA : row.value}
    </strong>
  </div>)}</div>;
}

/** One unit module. An empty unit says so and shows nothing else -- never a
 *  zero, because zero snaps is not zero performance. */
function UnitModule({ title, meta, rows, refs, label, screen, cls = '' }) {
  const empty = !rows.length;
  return <Module title={title} meta={empty ? '' : meta} cls={`gi-st-unit${empty ? ' is-none' : ''} ${cls}`}>
    {empty
      ? <p class="gi-st-empty">{view.ST_NO_DATA}</p>
      : <WatchableRefs tag="div" refs={refs} label={label} screen={screen}><StatRows rows={rows} /></WatchableRefs>}
  </Module>;
}

/** How a unit's snaps actually ended. Each bar opens exactly its own plays. */
function OutcomeBars({ items, screen, unit }) {
  if (!items.length) return <p class="gi-st-empty">{view.ST_NO_DATA}</p>;
  return <div class="gi-st-outcomes">{items.map(item => {
    const label = `${unit} — ${item.label}`;
    return <WatchableRefs key={item.key} tag="button" type="button" class="gi-st-outcome"
      refs={item.refs} label={label} screen={screen} title={`${label}, ${item.n}`}>
      <span class="gi-st-outcome-label">{item.label}</span>
      <span class="gi-st-outcome-bar">
        {/* The bar's width is the SHARE it states, not its size against the
            biggest bar. Scaling to the max made whatever led always fill the
            track, so a 29% outcome read as the whole unit. */}
        {item.tone === 'blank' ? null : <i class={item.tone ? `is-${item.tone}` : ''}
          style={`width:${item.pct}%`} />}
      </span>
      <span class="gi-st-outcome-value">{item.n} ({item.pct}%)</span>
    </WatchableRefs>;
  })}</div>;
}

/** The unit ledger -- all six units, always, including the empty ones. */
function UnitLedger({ units, screen }) {
  return <div class="gi-st-ledger">{units.map(unit => unit.blank
    ? <div key={unit.key} class="gi-st-unit-card is-none">
        <span class="gi-st-unit-name">{unit.name}</span>
        <span class="gi-st-unit-n">{view.ST_NO_DATA}</span>
      </div>
    : <WatchableRefs key={unit.key} tag="button" type="button" class="gi-st-unit-card"
        refs={unit.refs} label={`${unit.name} — ${unit.n} ${unit.noun}`} screen={screen}>
        <span class="gi-st-unit-name">{unit.name}</span>
        {/* Count and headline are CO-PRIMARY on one line (coach, 2026-09-04) --
            the headline is as much a real number as the count, and stacking it
            underneath spent a third line to say so. */}
        <span class="gi-st-unit-line">
          <span class="gi-st-unit-n">{unit.n} <i>{unit.noun}</i></span>
          <span class="gi-st-unit-sep" aria-hidden="true">|</span>
          <span class="gi-st-unit-head">{unit.headline}</span>
        </span>
      </WatchableRefs>)}
  </div>;
}

/** Special Teams Presentation Independence -- a real Preact re-derivation of
 *  the structured Special Teams seams, recomposed into
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
export function SpecialTeamsTab({ stats, summary, screen, fixedScope = false, title = 'Special Teams', toolbarAction = null }) {
  const engine = screen.app.stats;
  const st = stats.specialTeams;
  const conv = stats.conversions;
  const hasIndividuals = (stats.individuals?.returners?.length || 0) > 0 || (stats.individuals?.kickers?.length || 0) > 0;
  if (!st?.hasData && !conv?.hasData && !hasIndividuals) {
    return <EmptyState title="No Special Teams snaps charted" body=""
      action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown?.() }} />;
  }
  const kpis = view.specialTeamsKpis(stats, summary);
  const [section, setSection] = useState('st1');
  const units = view.specialTeamsUnits(stats);
  const unit = key => units.find(u => u.key === key) || { n: null, refs: [] };
  const rowsFor = key => view.specialTeamsUnitRows(stats, key);
  const outcomesFor = key => view.specialTeamsOutcomes(stats, key);
  const unassigned = view.specialTeamsUnassigned(stats, summary);

  const tables = view.individualStats(stats, 'special', num => engine._playerLabel(num));
  const returnTable = tables.find(table => table.key === 'returns');
  const specialistTable = tables.find(table => table.key === 'kicking');
  const impactRows = (summary.impact || []).map(item => {
    const label = `${item.label} — ${item.n} play${item.n === 1 ? '' : 's'}`;
    return { id: item.label, type: item.label, plays: item.n,
      onActivate: item.refs?.length ? () => screen.watchRefs(item.refs, label) : undefined, label };
  });
  const tryRows = rowsFor('tries');
  const tryCharted = st?.tries?.n != null ? st.tries.n : ((conv?.xp?.att || 0) + (conv?.two?.att || 0));

  const sectionCounts = {
    st1: summary.snaps.n,
    st2: (unit('kickoff').n || 0) + (unit('kickReturn').n || 0),
    st3: (unit('punt').n || 0) + (unit('puntReturn').n || 0),
    st4: (unit('fieldGoal').n || 0) + (unit('fieldGoalBlock').n || 0) + tryCharted,
    st5: (returnTable?.rows.length || 0) + (specialistTable?.rows.length || 0),
  };

  // `long` is the longest MADE kick, so attempts with no make leave it
  // unavailable. It must never render 0 -- a zero-yard field goal is not a
  // thing, and reading an absence as one inverts the whole report.
  const fgMeta = st?.fg?.att
    ? `${st.fg.made}/${st.fg.att} made, ${st.fg.pct}%, long ${st.fg.long ? `${st.fg.long} yds` : view.ST_NO_DATA}`
    : '';
  const BUCKETS = ['<30', '30-39', '40-49', '50+'];
  const byDist = new Map((st?.fg?.byDist || []).map(b => [b.label, b]));

  /* Sections, scope and the report export live in the shared secondary bar
     (coach-approved comp, 2026-09-23). A fixed-scope board (Season's child,
     the opponent scout) keeps its titled toolbar and its own export there. */
  const setScope = scope => { screen.specialTeamsScope = scope; screen._syncHeader(); screen._renderActiveTab(); };
  const scope = fixedScope ? null : [
    { id: 'game', label: 'Current game', active: screen.specialTeamsScope === 'game', onSelect: () => setScope('game'), attrs: { 'data-st-scope': 'game' } },
    { id: 'season', label: 'Full season', active: screen.specialTeamsScope === 'season', onSelect: () => setScope('season'), attrs: { 'data-st-scope': 'season' } },
  ];
  const exportAction = fixedScope ? null : { label: 'Export report', attrs: { class: 'gi-secbar-export gi-st-export', 'data-report-export': 'special' },
    onSelect: () => screen.exportSpecialTeams(stats, summary) };

  return <div class="gi-overview-board gi-st-board">
    <ReportSectionBar screen={screen} label="Special Teams units" navClass="gi-st-sections"
      sections={ST_SECTIONS.map(s => ({ id: s.id, label: s.label, count: `${sectionCounts[s.id]} ${s.counts}`,
        none: !sectionCounts[s.id], attrs: { 'data-st-section': s.id } }))}
      active={section} onSelect={setSection} scope={scope} exportAction={exportAction} />
    {/* The page heading, the Defense board's hierarchy (coach direction,
        1.12.0-97 smoke S97-1): number, the section's name, its count. */}
    {(() => {
      const index = ST_SECTIONS.findIndex(s => s.id === section);
      const current = ST_SECTIONS[index];
      return <header class="gi-st-heading">
        <span>{String(index + 1).padStart(2, '0')}</span><h2>{current.title}</h2>
        <small>{sectionCounts[current.id]} {current.counts}</small>
      </header>;
    })()}
    {fixedScope && <div class="gi-st-toolbar">
      <strong class="gi-st-toolbar-label">{title}</strong>
      {toolbarAction}
      <button class="btn btn-sm gi-st-export" onClick={() => screen.export('season-html')}>Export Report</button>
    </div>}

    {/* A `stats` tile renders label/number rows instead of one big figure --
        the same markup and classes the rail's Turnovers tile uses, so the two
        read identically. KpiBand's value slot takes a VNode. */}
    <KpiBand items={kpis.map(k => ({
      ...k,
      cls: `${k.cls || ''}${k.blank ? ' is-blank' : ''}`,
      value: k.stats
        ? <div class="gi-kpi-stats">{k.stats.map((row, ri) =>
            <div class="gi-kpi-stat-row" key={ri}>{row.map(([label, value], si) => [
              si > 0 ? <span class="gi-kpi-stat-sep" aria-hidden="true">|</span> : null,
              <span class="gi-kpi-stat" key={label}>
                <span class="gi-kpi-stat-l">{label}</span>
                <span class="gi-kpi-stat-n">{value}</span>
              </span>,
            ])}</div>)}</div>
        : k.value,
    }))} />
    <UnitLedger units={units} screen={screen} />

    {/* Only the exception, never the arithmetic: the full snap reconciliation
        restated the ledger directly above it. What survives is the one fact no
        ledger card can show -- a snap belonging to no unit at all. */}
    {unassigned > 0 && <p class="gi-st-unassigned">
      <b>{unassigned}</b> {unassigned === 1 ? 'snap is' : 'snaps are'} not assigned to a unit
    </p>}


    {section === 'st1' && <>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title="Kickoff" rows={rowsFor('kickoff')} refs={unit('kickoff').refs} label="Kickoffs" screen={screen} />
        <UnitModule title="Kick Return" rows={rowsFor('kickReturn')} refs={unit('kickReturn').refs} label="Kick returns" screen={screen} />
      </div>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title="Punt" rows={rowsFor('punt')} refs={unit('punt').refs} label="Punts" screen={screen} />
        <UnitModule title={SpecialTeamsModel.UNIT_LABELS.puntReturn} rows={rowsFor('puntReturn')} refs={unit('puntReturn').refs} label="Punt returns" screen={screen} />
      </div>
      <div class="gi-st-band gi-st-band-3">
        <UnitModule title="Field Goal" rows={rowsFor('fieldGoal')} refs={unit('fieldGoal').refs} label="Field goals" screen={screen} />
        <UnitModule title={SpecialTeamsModel.UNIT_LABELS.fieldGoalBlock} rows={rowsFor('fieldGoalBlock')} refs={unit('fieldGoalBlock').refs} label="Field goal block" screen={screen} />
        <UnitModule title="Tries" rows={tryRows} refs={st?.tries?.refs?.all || []} label="Tries" screen={screen} />
      </div>
    </>}

    {section === 'st2' && <>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title="Kickoff" meta={`${unit('kickoff').n || 0} snaps`} rows={rowsFor('kickoff')}
          refs={unit('kickoff').refs} label="Kickoffs" screen={screen} />
        <Module title="Kickoff outcomes" cls={`gi-st-unit${outcomesFor('kickoff').length ? '' : ' is-none'}`}>
          <OutcomeBars items={outcomesFor('kickoff')} screen={screen} unit="Kickoff" />
        </Module>
      </div>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title="Kick Return" meta={`${unit('kickReturn').n || 0} snaps`} rows={rowsFor('kickReturn')}
          refs={unit('kickReturn').refs} label="Kick returns" screen={screen} />
        <Module title="Kick return outcomes" cls={`gi-st-unit${outcomesFor('kickReturn').length ? '' : ' is-none'}`}>
          <OutcomeBars items={outcomesFor('kickReturn')} screen={screen} unit="Kick return" />
        </Module>
      </div>
    </>}

    {section === 'st3' && <>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title="Punt" meta={`${unit('punt').n || 0} snaps`} rows={rowsFor('punt')}
          refs={unit('punt').refs} label="Punts" screen={screen} />
        <Module title="Punt outcomes" cls={`gi-st-unit${outcomesFor('punt').length ? '' : ' is-none'}`}>
          <OutcomeBars items={outcomesFor('punt')} screen={screen} unit="Punt" />
        </Module>
      </div>
      <div class="gi-st-band gi-st-band-2">
        <UnitModule title={SpecialTeamsModel.UNIT_LABELS.puntReturn} meta={`${unit('puntReturn').n || 0} snaps`} rows={rowsFor('puntReturn')}
          refs={unit('puntReturn').refs} label="Punt returns" screen={screen} />
        <Module title="Punt return outcomes" cls={`gi-st-unit${outcomesFor('puntReturn').length ? '' : ' is-none'}`}>
          <OutcomeBars items={outcomesFor('puntReturn')} screen={screen} unit="Punt return" />
        </Module>
      </div>
    </>}

    {section === 'st4' && <>
      <div class="gi-st-band gi-st-band-2">
        <Module title="Field goals by distance" meta={fgMeta} cls={`gi-st-unit${st?.fg?.att ? '' : ' is-none'}`}>
          {st?.fg?.att ? <div class="gi-st-buckets">{BUCKETS.map(label => {
            const bucket = byDist.get(label);
            if (!bucket) return <div key={label} class="gi-st-bucket is-none">
              <span>{label} yds</span><strong>{view.ST_NO_DATA}</strong></div>;
            return <WatchableRefs key={label} tag="button" type="button" class="gi-st-bucket"
              refs={bucket.refs} label={`Field goals ${label}`} screen={screen}>
              <span>{label} yds</span><strong>{bucket.made}/{bucket.att}</strong>
              <small>{Math.round(bucket.made / bucket.att * 100)}% made</small>
            </WatchableRefs>;
          })}</div> : <p class="gi-st-empty">{view.ST_NO_DATA}</p>}
        </Module>
        <Module title="Attempt outcomes" cls={`gi-st-unit${outcomesFor('fieldGoal').length ? '' : ' is-none'}`}>
          <OutcomeBars items={outcomesFor('fieldGoal')} screen={screen} unit="Field goal" />
        </Module>
      </div>
      <div class="gi-st-band gi-st-band-3">
        <UnitModule title="Field Goal" rows={rowsFor('fieldGoal')} refs={unit('fieldGoal').refs} label="Field goals" screen={screen} />
        <UnitModule title={SpecialTeamsModel.UNIT_LABELS.fieldGoalBlock} rows={rowsFor('fieldGoalBlock')} refs={unit('fieldGoalBlock').refs} label="Field goal block" screen={screen} />
        <UnitModule title="Tries" rows={tryRows} refs={st?.tries?.refs?.all || []} label="Tries" screen={screen} />
      </div>
    </>}

    {section === 'st5' && <>
      <div class="gi-st-band gi-st-band-42">
        <Module title="Return game" cls={`gi-st-unit${returnTable ? '' : ' is-none'}`}>
          {returnTable
            ? <div class="gi-st-table-wrap"><DataTable
                columns={returnTable.columns.map(([key, label, numeric]) => ({ key, label, numeric }))}
                rows={returnTable.rows.map(row => ({ ...row, id: row.num, player: row.label,
                  onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${row.label} returns`) : undefined,
                  label: `${row.label} returns` }))} /></div>
            : <p class="gi-st-empty">{view.ST_NO_DATA}</p>}
        </Module>
        <Module title="Impact plays" meta={impactRows.length ? `${impactRows.reduce((sum, r) => sum + r.plays, 0)} total` : ''}
          cls={`gi-st-unit${impactRows.length ? '' : ' is-none'}`}>
          {impactRows.length
            ? <div class="gi-st-impact">{impactRows.map(row => <WatchableRefs key={row.id} tag="button" type="button"
                class="gi-st-impact-row" refs={[]} label={row.label} screen={screen}
                onActivate={row.onActivate}>
                <span>{row.type}</span><strong>{row.plays}</strong></WatchableRefs>)}</div>
            : <p class="gi-st-empty">{view.ST_NO_DATA}</p>}
        </Module>
      </div>
      <div class="gi-st-band gi-st-band-1">
        <Module title="Kicking and punting" cls={`gi-st-unit${specialistTable ? '' : ' is-none'}`}>
          {specialistTable
            ? <div class="gi-st-table-wrap"><DataTable
                columns={specialistTable.columns.map(([key, label, numeric]) => ({ key, label, numeric }))}
                /* `individualStats` is shared with the Players tab and renders
                   an em dash for an absent cell. This board speaks ONE absence
                   language, so the dash is mapped here at the sink rather than
                   in the shared view model, which would change Players too. */
                rows={specialistTable.rows.map(row => ({ ...row, id: row.num, player: row.label,
                  fg: row.fg === '—' ? view.ST_NO_DATA : row.fg,
                  punts: row.punts === '—' ? view.ST_NO_DATA : row.punts,
                  puntAvg: row.puntAvg === '—' ? view.ST_NO_DATA : row.puntAvg,
                  onActivate: row.refs?.length ? () => screen.watchRefs(row.refs, `${row.label} kicking`) : undefined,
                  label: `${row.label} kicking` }))} /></div>
            : <p class="gi-st-empty">{view.ST_NO_DATA}</p>}
        </Module>
      </div>
    </>}
  </div>;
}
/* ─────────────────────────────────────────────────────────────────────────
   Reports > Season — the approved 2026-09-05 desktop composition
   (design-comps/reports-season-2026-09-05, whose RATIONALE is the record).

   Season owns its identity bar, six aggregate KPIs, the chronological Game
   Log, Situational Offense, Scoring & Possessions, and the Trends
   comparisons. Offense, Defense, Special Teams, Players and Self-Scout reuse
   their OWN approved production boards at full-season scope — Season builds
   no alternate version of any of them.

   Every value rendered here arrives pre-computed from
   `SeasonManager.reportModel()`, which delegates every formula to StatsEngine.
   Nothing in this file aggregates, ranks, averages or classifies.
   ───────────────────────────────────────────────────────────────────────── */
const SEASON_SECTIONS = [
  ['overview', 'Overview'], ['offense', 'Offense'], ['defense', 'Defense'],
  ['special', 'Special Teams'], ['players', 'Players'], ['scout', 'Self-Scout'],
  ['trends', 'Trends'],
];
const SEASON_NO_DATA = 'No data';
const seasonSigned = value => (value > 0 ? `+${value}` : String(value));
const seasonTone = value => (value > 0 ? 'is-pos' : value < 0 ? 'is-neg' : undefined);

function SeasonModule({ title, children }) {
  return <Module title={title} cls="gi-season-module">{children}</Module>;
}
function SeasonBand({ cls = 'b-1', children }) {
  return <div class={`gi-season-band ${cls}`}>{children}</div>;
}
function SeasonTable({ columns, rows }) {
  return <DataTable className="stats-table gi-season-table" columns={columns} rows={rows} emptyText={SEASON_NO_DATA} />;
}
/** An absence is the literal, never a zero standing in for one -- and it drops
 *  to copy weight so it can never read as a measured figure. */
const seasonMissing = value => value === null || value === undefined || value === '';
const seasonText = value => (seasonMissing(value) ? SEASON_NO_DATA : value);
const seasonBlank = key => row => (seasonMissing(row[key]) ? 'blank' : undefined);

const seasonGameLogColumns = [
  { key: 'week', label: 'Week', size: 'wk', render: row => seasonText(row.week), cellClass: seasonBlank('week') },
  { key: 'dateLabel', label: 'Date', size: 'dt', render: row => seasonText(row.dateLabel), cellClass: seasonBlank('dateLabel') },
  { key: 'opponent', label: 'Opponent', tl: true, size: 'label', render: row => seasonText(row.opponent), cellClass: seasonBlank('opponent') },
  { key: 'result', label: 'Result', size: 'res', cellClass: seasonBlank('result'),
    render: row => (row.result ? <b class={`gi-season-res is-${row.result.toLowerCase()}`}>{row.result}</b> : SEASON_NO_DATA) },
  { key: 'score', label: 'Score', size: 'sc', render: row => seasonText(row.score), cellClass: seasonBlank('score') },
  { key: 'plays', label: 'Plays', numeric: true, size: 'num', render: row => seasonText(row.plays), cellClass: seasonBlank('plays') },
  { key: 'rushYards', label: 'Rush', numeric: true, size: 'num', render: row => seasonText(row.rushYards), cellClass: seasonBlank('rushYards') },
  { key: 'passYards', label: 'Pass', numeric: true, size: 'num', render: row => seasonText(row.passYards), cellClass: seasonBlank('passYards') },
  { key: 'totalYards', label: 'Total', numeric: true, size: 'num', render: row => seasonText(row.totalYards), cellClass: seasonBlank('totalYards') },
  { key: 'successRate', label: 'Success Rate', numeric: true, size: 'rate', cellClass: seasonBlank('successRate'),
    render: row => (row.successRate == null ? SEASON_NO_DATA : `${row.successRate}%`) },
  { key: 'turnoverMargin', label: 'TO ±', numeric: true, size: 'to', cellClass: seasonBlank('turnoverMargin'),
    render: row => (row.turnoverMargin == null ? SEASON_NO_DATA
      : <b class={seasonTone(row.turnoverMargin)}>{seasonSigned(row.turnoverMargin)}</b>) },
];

function SeasonOverview({ model, screen }) {
  const summary = model.summary;
  const scoring = model.turnoverScoring;
  return <>
    <KpiBand items={[
      { label: 'Games', value: String(summary.games) },
      { label: 'Record', value: summary.played ? summary.record : SEASON_NO_DATA,
        cls: summary.played ? 'is-record' : 'is-record is-blank' },
      { label: 'Points For / Against', value: summary.played ? `${summary.pointsFor}-${summary.pointsAgainst}` : SEASON_NO_DATA,
        cls: summary.played ? '' : 'is-blank' },
      { label: 'Turnover Margin', value: summary.turnoverMargin == null ? SEASON_NO_DATA : seasonSigned(summary.turnoverMargin),
        cls: summary.turnoverMargin == null ? 'is-blank' : seasonTone(summary.turnoverMargin) },
      { label: 'Yards / Game', value: summary.yardsPerGame == null ? SEASON_NO_DATA : summary.yardsPerGame.toFixed(1),
        cls: summary.yardsPerGame == null ? 'is-blank' : '' },
      { label: 'Success Rate', value: `${summary.successRate.toFixed(1)}%` },
    ]} />
    <SeasonBand>
      <SeasonModule title="Game Log">
        <SeasonTable columns={seasonGameLogColumns} rows={model.gameLog.map(row => ({ ...row, id: row.id,
          label: `Open ${row.opponent} game report`,
          onActivate: () => screen.app.openGame(row.id, { route: 'reports' })
            .then(opened => { if (opened) screen.selectTab('overview'); }),
        }))} />
      </SeasonModule>
    </SeasonBand>
    <SeasonBand cls="b-64">
      <SeasonModule title="Situational Offense">
        <div class="gi-season-metrics">{model.situationalTiles.map(tile => <div key={tile.label} class="gi-season-metric">
          <span>{tile.label}</span>
          <strong class={tile.value == null ? 'is-blank' : undefined}>{seasonText(tile.value)}</strong>
        </div>)}</div>
      </SeasonModule>
      <SeasonModule title="Scoring &amp; Possessions">
        <div class="gi-table-wrap"><table class="stats-table gi-season-quarters">
          <thead><tr><th class="tl">Quarter</th><th>For</th><th>Against</th><th>Margin</th></tr></thead>
          <tbody>{scoring.quarters.length
            ? scoring.quarters.map(row => <tr key={row.quarter}>
              <td class="tl">{row.quarter}</td><td>{row.us}</td><td>{row.them}</td>
              <td class={seasonTone(row.us - row.them)}>{seasonSigned(row.us - row.them)}</td>
            </tr>)
            : <tr><td class="tl">{SEASON_NO_DATA}</td><td>{SEASON_NO_DATA}</td><td>{SEASON_NO_DATA}</td><td>{SEASON_NO_DATA}</td></tr>}
          </tbody>
          <tfoot><tr>
            <td class="tl">Turnovers</td>
            {scoring.margin == null ? <><td>{SEASON_NO_DATA}</td><td>{SEASON_NO_DATA}</td><td>{SEASON_NO_DATA}</td></>
              : <><td>{scoring.takeaways} gained</td><td>{scoring.giveaways} lost</td>
                <td class={seasonTone(scoring.margin)}>{seasonSigned(scoring.margin)}</td></>}
          </tr></tfoot>
        </table></div>
      </SeasonModule>
    </SeasonBand>
  </>;
}

function SeasonTrends({ model }) {
  const trends = model.trends;
  if (!trends.windowSize) return <EmptyState title="Not enough games for trends"
    body="Chart at least two games to compare progression." />;
  const n = trends.windowSize;
  const winLoss = model.winLoss;
  const counts = model.winLossCounts;
  return <>
    <KpiBand items={[
      { label: 'Games', value: String(model.summary.games) },
      { label: `Last ${n} Record`, value: trends.recentRecord },
      // An unscored or offence-less game is excluded from its own average
      // rather than averaged in as a zero; with none left there is nothing to
      // report, and the tile says so.
      { label: `Last ${n} Points / Game`, cls: trends.recentPointsPerGame == null ? 'is-blank' : '',
        value: trends.recentPointsPerGame == null ? SEASON_NO_DATA : trends.recentPointsPerGame.toFixed(1) },
      { label: `Last ${n} Yards / Game`, cls: trends.recentYardsPerGame == null ? 'is-blank' : '',
        value: trends.recentYardsPerGame == null ? SEASON_NO_DATA : trends.recentYardsPerGame.toFixed(1) },
      { label: `Last ${n} Success Rate`, value: `${trends.recentSuccessRate.toFixed(1)}%` },
      { label: `Last ${n} TO Margin`, value: trends.recentTurnoverMargin == null ? SEASON_NO_DATA : seasonSigned(trends.recentTurnoverMargin),
        cls: trends.recentTurnoverMargin == null ? 'is-blank' : seasonTone(trends.recentTurnoverMargin) },
    ]} />
    <SeasonBand cls="b-2">
      <SeasonModule title="Early vs Recent">
        <SeasonTable columns={[
          { key: 'label', label: 'Metric', tl: true, size: 'label' },
          { key: 'from', label: `First ${n}`, numeric: true, size: 'win' },
          { key: 'to', label: `Last ${n}`, numeric: true, size: 'win' },
          { key: 'deltaText', label: 'Delta', numeric: true, size: 'delta',
            render: row => <b class={`gi-season-delta is-${row.direction}`}>{row.deltaText}</b> },
          { key: 'status', label: 'Status', numeric: true, size: 'status' },
        ]} rows={model.progression.map(row => ({ ...row, id: row.label }))} />
      </SeasonModule>
      <SeasonModule title="Wins vs Losses">
        {winLoss
          ? <SeasonTable columns={[
            { key: 'metric', label: 'Metric', tl: true, size: 'label' },
            { key: 'wins', label: 'Wins', numeric: true, size: 'win' },
            { key: 'losses', label: 'Losses', numeric: true, size: 'win' },
          ]} rows={winLoss.rows.map(row => ({ ...row, id: row.key }))} />
          : <p class="gi-season-none">{counts.wins
            ? 'No losses charted.' : counts.losses ? 'No wins charted.' : 'No scored games charted.'}</p>}
      </SeasonModule>
    </SeasonBand>
    <SeasonBand>
      <SeasonModule title="Game-by-Game">
        <SeasonTable columns={[
          { key: 'name', label: 'Game', tl: true, size: 'label' },
          { key: 'result', label: 'Result', size: 'res',
            render: row => (row.result ? <b class={`gi-season-res is-${row.result.toLowerCase()}`}>{row.result}</b> : SEASON_NO_DATA) },
          { key: 'score', label: 'Score', size: 'sc', render: row => seasonText(row.score), cellClass: seasonBlank('score') },
          { key: 'totalYards', label: 'Total Yards', numeric: true, size: 'yards',
            render: row => seasonText(row.totalYards), cellClass: seasonBlank('totalYards') },
          { key: 'successRate', label: 'Success Rate', numeric: true, size: 'rate', cellClass: seasonBlank('successRate'),
            render: row => (seasonMissing(row.successRate) ? SEASON_NO_DATA : `${row.successRate}%`) },
          { key: 'thirdDown', label: '3rd Down', numeric: true, size: 'third', cellClass: seasonBlank('thirdDown'),
            render: row => (seasonMissing(row.thirdDown) ? SEASON_NO_DATA : `${row.thirdDown}%`) },
          { key: 'touchdowns', label: 'TD', numeric: true, size: 'td',
            render: row => seasonText(row.touchdowns), cellClass: seasonBlank('touchdowns') },
          { key: 'turnoverMargin', label: 'TO ±', numeric: true, size: 'to', cellClass: seasonBlank('turnoverMargin'),
            render: row => (seasonMissing(row.turnoverMargin) ? SEASON_NO_DATA
              : <b class={seasonTone(row.turnoverMargin)}>{seasonSigned(row.turnoverMargin)}</b>) },
        ]} rows={model.perGame.map(row => ({ ...row, id: row.id }))} />
      </SeasonModule>
    </SeasonBand>
  </>;
}

export function SeasonTab({ model, screen }) {
  const [active, setActive] = useState('overview');
  const engine = screen.app.stats;
  /* One shim per mounted Season tab, not one per render: the child boards
     hold their own section selection on the screen object (Players' role
     section, Self-Scout's), and a shim rebuilt on every render would discard
     it the moment anything else re-rendered. */
  const seasonScreen = useMemo(() => {
    const refsFor = predicate => [...new Set((model?.allPlays || [])
      .filter(predicate).map(engine.constructor._compositeRef).filter(Boolean))].sort();
    return { app: screen.app, defenseScope: 'season', specialTeamsScope: 'season', _renderActiveTab: () => {},
      watchRefs: (refs, label) => screen.watchRefs(refs, label),
      watchCut: (type, val, label) => screen.watchRefs(refsFor(engine._buildCutFilter(type, val)), label),
      watchPredicate: (predicate, label) => screen.watchRefs(refsFor(predicate), label),
      // OffenseTab renders inside Season, so this shim must answer every call
      // that tab makes. Its empty-state command is one of them: without
      // openBreakDown the Season copy of the tab throws on click.
      openBreakDown: () => screen.openBreakDown?.(),
      export: kind => screen.export(kind === 'html' ? 'season-html' : kind) };
  }, [screen, engine, model]);
  if (!model?.stats) return <EmptyState title="No season data yet" body="Add a game and chart plays to build season-wide reports." />;

  let body = null;
  if (active === 'overview') body = <SeasonOverview model={model} screen={screen} />;
  else if (active === 'offense') body = <OffenseTab stats={model.stats} screen={seasonScreen} />;
  else if (active === 'defense') body = <DefenseTab board={model.defenseBoard}
    scoped={model.allPlays} screen={seasonScreen} fixedScope />;
  else if (active === 'special') body = <SpecialTeamsTab stats={model.stats} summary={model.specialSummary} screen={seasonScreen} fixedScope />;
  else if (active === 'players') body = <PlayersTab stats={model.stats} scoped={model.allPlays} screen={seasonScreen} labels={model.rosterLabels} fixedScope />;
  else if (active === 'scout') body = <SelfScoutTab report={model.selfScout} defScout={model.defScout} performance={model.stats} callRows={model.callRows} screen={seasonScreen} />;
  else body = <SeasonTrends model={model} />;

  const seasonName = screen.app.storage?.seasonStore?.data?.seasonName || 'Season';
  /* Sections and the season export live in the shared secondary bar
     (coach-approved comp, 2026-09-23). The season name is already the report
     title in the fixed head, so the board no longer repeats it. The child
     boards below are embedded and carry their own pages inline. */
  return <div class="gi-overview-board gi-season-board" data-season-name={seasonName}>
    <ReportSectionBar screen={screen} label="Season sections" navClass="gi-season-pages"
      sections={SEASON_SECTIONS.map(([id, label]) => ({ id, label, attrs: { 'data-subtab': id } }))}
      active={active} onSelect={setActive}
      exportAction={{ label: 'Export report', attrs: { class: 'gi-secbar-export', 'data-report-export': 'season' }, onSelect: () => screen.export('season-html') }} />
    <div class="gi-season-report">
      <div class="gi-season-sections" data-subpane={active}>{body}</div>
    </div>
  </div>;
}
/* ═══ Reports > Matchup — the approved 2026-09-06 desktop composition ══════
   Comp and decision record: design-comps/reports-matchup-2026-09-06
   (`matchup.html`, `RATIONALE.md`).

   Two matchup directions, one on screen at a time, each led by the
   situational join. Every value below arrives already measured by
   `StatsEngine.matchupReport()` and already formatted by `reports-view.js`:
   nothing here groups, ranks, joins, averages, qualifies or classifies
   anything.

   Film is TWO explicit controls, `Opponent` and `Season`, never one
   ambiguous combined action and never an unlabelled icon. A side with no
   references renders no enabled control at all.
   ───────────────────────────────────────────────────────────────────────── */
const MATCHUP_TABS = [
  ['our-offense', 'Our Offense vs Their Defense'],
  ['our-defense', 'Our Defense vs Their Offense'],
];

/** The row's two film cohorts, each opening only the exact composite refs
 *  that produced its own side of the row. */
function MuFilm({ opponent, season, label, screen }) {
  return <span class="gi-mu-film">
    {opponent?.length ? <button type="button" class="gi-mu-opp"
      onClick={() => screen.watchRefs(opponent, `${label} — opponent film`)}>Opponent</button> : null}
    {season?.length ? <button type="button"
      onClick={() => screen.watchRefs(season, `${label} — season film`)}>Season</button> : null}
  </span>;
}

/** Every Matchup table owns its column geometry through a colgroup and
 *  renders `table-layout:fixed`, so one measurement is one width in every
 *  table on the board. Rows carry no activation of their own — film is the
 *  row's own explicit controls, so there is no ambiguous whole-row action. */
function MuTable({ cls = '', cols, columns, rows, empty }) {
  if (!rows.length) return <p class="gi-table-empty">{empty}</p>;
  return <div class="gi-table-wrap"><table class={`stats-table gi-mu-table ${cls}`.trim()}>
    <colgroup>{cols.map((name, i) => <col key={`${name}-${i}`} class={name} />)}</colgroup>
    <thead><tr>{columns.map(col => <th key={col.key} class={col.tl ? 'tl' : undefined}>{col.label}</th>)}</tr></thead>
    <tbody>{rows.map(row => <tr key={row.id}>
      {columns.map(col => <td key={col.key} data-col={col.key}
        class={[col.tl ? 'tl' : '', typeof col.cellClass === 'function' ? col.cellClass(row) : col.cellClass || ''].filter(Boolean).join(' ') || undefined}
      >{col.render ? col.render(row) : row[col.key]}</td>)}
    </tr>)}</tbody>
  </table></div>;
}

/** A bounded truncation: a composite call label longer than any panel can
 *  give it ellipsises inside its own cell rather than overrunning into the
 *  measurements, and keeps the full value on its own title. */
const muTrunc = value => <span class="gi-mu-trunc" title={String(value ?? '')}>{value}</span>;

function MuSection({ title, keyed = false, children }) {
  return <section class="gi-mu-section">
    <div class="gi-mu-title"><h2>{title}</h2>
      {keyed ? <div class="gi-mu-key">
        <span><b class="is-opp"></b>Opponent film</span><span><b class="is-season"></b>Season film</span>
      </div> : null}
    </div>
    {children}
  </section>;
}

/** The two independent samples behind the lane, each counted on its own
 *  terms. They share no denominator and are never merged. */
function MuUnits({ season, opponent }) {
  return <div class="gi-mu-units">
    <div class="gi-mu-unit"><div><span>Season film</span><strong>{season.name}</strong></div><small>{season.sample}</small></div>
    <div class="gi-mu-unit is-opp"><div><span>Opponent film</span><strong>{opponent.name}</strong></div><small>{opponent.sample}</small></div>
  </div>;
}

/** Situational Calls: their most frequent call in each fixed situation, and
 *  our own result against that exact displayed look. `kind` is the lane's
 *  polarity — an offense lane reports Success, a defense lane Stop Rate. */
function MuSituations({ lane, kind, screen }) {
  const rows = view.matchupSituationRows(lane, kind);
  const columns = [
    { key: 'situation', label: 'Situation', tl: true, cellClass: 'gi-mu-sit' },
    /* A LOOK, not a call. The value is a composite identity — Personnel |
       Formation | Call on the defence-facing lane, Front | Coverage | Pressure
       on the offence-facing one — with blank components dropped. The canonical
       season charts no playCall and no playConcept anywhere, so on 32 of its
       defensive snaps the label collapses to personnel alone and read as
       `Their Primary Call: 22`. Personnel is not a play call. Both lanes carry
       the composite, so both headers name it. */
    { key: 'look', label: 'Their Top Look', tl: true, cellClass: 'gi-mu-look', render: row => muTrunc(row.look) },
    { key: 'rate', label: 'Rate' },
    { key: 'sample', label: kind === 'offense' ? 'Snaps' : 'Plays' },
    { key: 'answer', label: 'Our Best Answer', tl: true,
      cellClass: row => (row.blank ? 'gi-mu-absent' : 'gi-mu-answer'), render: row => muTrunc(row.answer) },
    { key: 'count', label: kind === 'offense' ? 'Plays' : 'Snaps' },
    { key: 'avg', label: 'Yds / Play' },
    { key: 'result', label: kind === 'offense' ? 'Success' : 'Stop Rate' },
    { key: 'film', label: 'Film', cellClass: 'gi-mu-filmcell',
      render: row => <MuFilm opponent={row.oppRefs} season={row.seasonRefs} screen={screen}
        label={`${row.situation}: ${row.look}`} /> },
  ];
  return <MuTable cls="gi-mu-decision" cols={['sit', 'look', 'freq', 'n', 'answer', 'n', 'metric', 'metric', 'film']}
    columns={columns} rows={rows} empty={view.MATCHUP_NO_DATA} />;
}

/** One half of the paired play-type context. Each cohort keeps its own
 *  denominator: the two tables are never divided by a shared total. */
function MuPlayTypes({ title, rows, kind, side, screen }) {
  const display = view.matchupPlayTypeRows(rows, kind);
  const columns = [
    { key: 'name', label: 'Play Type', tl: true, render: row => muTrunc(row.name),
      cellClass: side === 'opponent' ? 'gi-mu-look' : 'gi-mu-answer' },
    { key: 'count', label: kind === 'offense' ? 'Plays' : 'Snaps' },
    { key: 'avg', label: kind === 'offense' ? 'Yds / Play' : 'Yds / Play Allowed' },
    { key: 'result', label: kind === 'offense' ? 'Success' : 'Stop Rate' },
    { key: 'film', label: 'Film', cellClass: 'gi-mu-filmcell',
      render: row => <MuFilm screen={screen} label={`${title}: ${row.name}`}
        opponent={side === 'opponent' ? row.refs : null} season={side === 'opponent' ? null : row.refs} /> },
  ];
  return <div class={`gi-mu-compare${side === 'opponent' ? ' is-opp' : ''}`}>
    <h3>{title}</h3>
    <MuTable cls="gi-mu-pair" cols={['label', 'num', 'num', 'num', 'film']}
      columns={columns} rows={display} empty={view.MATCHUP_NO_DATA} />
  </div>;
}

function MuOffenseLane({ lane, names, screen }) {
  return <div class="gi-mu-pane">
    <MuUnits season={names.season} opponent={names.opponent} />
    <MuSection title="Situational Calls" keyed><MuSituations lane={lane} kind="offense" screen={screen} /></MuSection>
    <MuSection title="Production by Play Type">
      <div class="gi-mu-compare-grid">
        <MuPlayTypes title="Our Offense" rows={lane.playTypes.season} kind="offense" side="season" screen={screen} />
        <MuPlayTypes title={names.opponent.name} rows={lane.playTypes.opponent} kind="defense" side="opponent" screen={screen} />
      </div>
    </MuSection>
    <MuSection title="Coverage Answers">
      <MuTable cls="gi-mu-support" cols={['label', 'answer', 'num', 'num', 'num', 'num', 'film']}
        columns={[
          { key: 'coverage', label: 'Coverage', tl: true, cellClass: 'gi-mu-look', render: row => muTrunc(row.coverage) },
          { key: 'answer', label: 'Our Top Call', tl: true, render: row => muTrunc(row.answer),
            cellClass: row => (row.blank ? 'gi-mu-absent' : 'gi-mu-answer') },
          { key: 'count', label: 'Plays' },
          { key: 'avg', label: 'Yds / Play' },
          { key: 'success', label: 'Success' },
          { key: 'explosive', label: 'Explosive Plays Rate' },
          { key: 'film', label: 'Film', cellClass: 'gi-mu-filmcell',
            render: row => <MuFilm season={row.refs} screen={screen} label={`${row.coverage}: ${row.answer}`} /> },
        ]}
        rows={view.matchupCoverageRows(lane.coverages)} empty={view.MATCHUP_NO_DATA} />
    </MuSection>
  </div>;
}

function MuDefenseLane({ lane, names, screen }) {
  return <div class="gi-mu-pane">
    <MuUnits season={names.season} opponent={names.opponent} />
    <MuSection title="Situational Calls" keyed><MuSituations lane={lane} kind="defense" screen={screen} /></MuSection>
    <MuSection title="Production by Play Type">
      <div class="gi-mu-compare-grid">
        <MuPlayTypes title={names.opponent.name} rows={lane.playTypes.opponent} kind="offense" side="opponent" screen={screen} />
        <MuPlayTypes title="Our Defense" rows={lane.playTypes.season} kind="defense" side="season" screen={screen} />
      </div>
    </MuSection>
    <MuSection title="Personnel and Formation">
      <MuTable cls="gi-mu-support" cols={['pers', 'answer', 'num', 'num', 'num', 'num', 'film']}
        columns={[
          { key: 'personnel', label: 'Personnel', tl: true, cellClass: 'gi-mu-look', render: row => muTrunc(row.personnel) },
          { key: 'formation', label: 'Formation', tl: true, cellClass: 'gi-mu-look', render: row => muTrunc(row.formation) },
          { key: 'count', label: 'Their Plays' },
          { key: 'runRate', label: 'Run Rate' },
          { key: 'avg', label: 'Yds / Play' },
          { key: 'stop', label: 'Our Stop Rate', cellClass: row => (row.blank ? 'gi-mu-absent' : '') },
          { key: 'film', label: 'Film', cellClass: 'gi-mu-filmcell',
            render: row => <MuFilm opponent={row.oppRefs} season={row.seasonRefs} screen={screen}
              label={`${row.personnel} | ${row.formation}`} /> },
        ]}
        rows={view.matchupPersonnelRows(lane.personnel)} empty={view.MATCHUP_NO_DATA} />
    </MuSection>
  </div>;
}

/** An absence stated literally: which opponent unit is missing, and which
 *  matchup that removes. No fabricated selection, sample, row or zero. */
function MuNote({ title, body }) {
  return <div class="gi-mu-note"><strong>{title}</strong><span>{body}</span></div>;
}

export function MatchupTab({ model, screen }) {
  /* The selected direction is controller state, the way Players' and
     Self-Scout's sections are: an ordinary Reports re-render unmounts and
     remounts this component, so a selection held only here would be lost
     and the board would snap back under the coach's hands. */
  const [tab, setTabState] = useState(screen.matchupTab || MATCHUP_TABS[0][0]);
  const setTab = id => { screen.matchupTab = id; setTabState(id); };
  if (!model?.opponent || (!model.offense && !model.defense)) {
    return <div class="gi-overview-board gi-matchup-board"><div class="gi-mu-report">
      <MuNote title="No opponent matchup data" body="No opponent offense or defense charted." />
    </div></div>;
  }
  const { opponent, opponents } = model;
  const sample = view.matchupSample(model);
  /* Only a direction the opponent film can actually answer is selectable: a
     dead tab rendered as though data existed is the one thing the partial
     state must not do. */
  const available = MATCHUP_TABS.filter(([id]) => (id === 'our-offense' ? model.offense : model.defense));
  const active = available.some(([id]) => id === tab) ? tab : available[0][0];
  const names = {
    'our-offense': {
      season: { name: 'Our Offense', sample: sample.units.offense.season },
      opponent: { name: `${opponent.name} Defense`, sample: sample.units.offense.opponent },
    },
    'our-defense': {
      season: { name: 'Our Defense', sample: sample.units.defense.season },
      opponent: { name: `${opponent.name} Offense`, sample: sample.units.defense.opponent },
    },
  };
  return <div class="gi-overview-board gi-matchup-board">
    <div class="gi-mu-report">
      {/* The two directions are this report's pages and the opponent picker
          filters it, so both live in the shared secondary bar (coach-approved
          comp, 2026-09-23). The opponent sample stays with the board. */}
      <ReportSectionBar screen={screen} label="Matchup direction" navClass="gi-mu-directions"
        sections={available.map(([id, label]) => ({ id, label }))} active={active} onSelect={setTab}
        scopeExtra={<label class="gi-secbar-scope gi-secbar-picker" for="gi-mu-opponent"><span>Opponent</span>
          <select id="gi-mu-opponent" value={opponent.name}
            onChange={event => { screen.matchupOpponent = event.currentTarget.value; screen._renderActiveTab(); }}>
            {opponents.map(item => <option key={item.name} value={item.name}>{item.name}</option>)}
          </select></label>} />
      {/* The page heading, the Defense board's hierarchy (coach direction,
          1.12.0-97 smoke S97-1); the opponent sample is its cohort statement. */}
      {(() => {
        const index = MATCHUP_TABS.findIndex(([id]) => id === active);
        return <header class="gi-report-heading">
          <span>{String(index + 1).padStart(2, '0')}</span><h2>{MATCHUP_TABS[index][1]}</h2>
          <small class="gi-mu-bar"><span class="gi-mu-sample">
            <div><span>Opponent sample</span><strong>{sample.opponent}</strong></div>
          </span></small>
        </header>;
      })()}
      {active === 'our-offense'
        ? <MuOffenseLane lane={model.offense} names={names['our-offense']} screen={screen} />
        : <MuDefenseLane lane={model.defense} names={names['our-defense']} screen={screen} />}
      {!model.defense ? <MuNote title="Opponent offense not charted"
        body="Our Defense vs Their Offense is unavailable." /> : null}
      {!model.offense ? <MuNote title="Opponent defense not charted"
        body="Our Offense vs Their Defense is unavailable." /> : null}
    </div>
  </div>;
}
/* ─────────────────────────────────────────────────────────────────────────
   Reports > Self-Scout — the approved 2026-09-05 desktop composition
   (design-comps/reports-self-scout-2026-09-05, RATIONALE sections 17-18).

   Five sections, one on screen at a time. Every value below arrives
   pre-computed from StatsEngine — generateSelfScout, generateDefensiveSelfScout,
   compute, selfScoutSummary, selfScoutDefenseSummary. Nothing here groups,
   ranks, qualifies, averages or classifies anything.

   Module headers carry the TITLE ONLY: no counts, thresholds, sample language
   or explanatory subheads. The scope line and the section-navigation counts
   remain, because they identify the active sample and where the report has
   content rather than explaining a module.
   ───────────────────────────────────────────────────────────────────────── */
const SELF_SCOUT_SECTIONS = [
  ['summary', 'Offensive Summary'],
  ['offense', 'Calls & Situations'],
  ['structure', 'Structure'],
  ['defense', 'Defense'],
  ['tendencies', 'Tendencies'],
];
const SS_NO_DATA = 'No data';
const ssPredClass = value => (value >= 70 ? 'p70' : value >= 30 ? 'p30' : 'p0');

/** The exact contributing film cohort: composite gameId::playId refs when the
 *  row carries them, the established cut filter otherwise, and no click
 *  affordance at all when neither resolves. Never a dead click. */
function ssWatch(screen, row, cutType, label) {
  if (row.refs?.length) return () => screen.watchRefs(row.refs, label);
  if (cutType) return () => screen.watchCut(cutType, row.key, label);
  return undefined;
}

/** A label and its measured value on one report row. */
function SsCounts({ items }) {
  return <div class="gi-ss-counts">{items.map(([label, value]) => <div class="gi-ss-crow" key={label}>
    <span>{label}</span><strong>{value}</strong>
  </div>)}</div>;
}
function SsModule({ title, phase, children }) {
  return <Module title={title} cls={`gi-ss-module is-${phase}`}>{children}</Module>;
}
function SsBand({ cls = 'b-1', children }) {
  return <div class={`gi-ss-band ${cls}`}>{children}</div>;
}
/** Every Self-Scout table declares its own column geometry through the
 *  colgroup, so one measurement is one width in every table on the board and
 *  no sort or section change moves a column edge. */
function SsTable({ columns, rows }) {
  return <DataTable className="stats-table gi-ss-table" columns={columns} rows={rows} emptyText={SS_NO_DATA} />;
}
/** Run and pass share, and a scheme lean, drawn as a track behind the figure. */
function SsBar({ tone, pct, text }) {
  return <span class={`gi-ss-bar is-${tone}`} style={{ '--p': `${pct}%` }} title={text}><i>{text}</i></span>;
}
function SsEmpty({ title, body, screen }) {
  return <EmptyState title={title} body={body}
    action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown?.() }} />;
}
const ssTrunc = value => <span class="gi-ss-trunc" title={String(value ?? '')}>{value}</span>;
const SS_NO_OFFENSE = ['No offensive attribution', 'No offensive plays are classified as run or pass.'];

/* The shared offensive result shape: what the call/situation/formation/
   personnel produced, with run-pass share as the last supporting column. */
/* A HELD row is a fixed football category the cohort never faced. It keeps its
   label and renders the approved absence treatment in every measured cell —
   never a fabricated 0, 0.0 or 0%. */
const SS_HELD = '-';
const ssCell = (row, render) => (row.held ? SS_HELD : render(row));
const ssOutcomeColumns = label => [
  { key: 'display', label, tl: true, size: 'label', render: row => ssTrunc(row.display) },
  { key: 'n', label: 'Plays', numeric: true, size: 'n', render: row => ssCell(row, r => r.n) },
  { key: 'avg', label: 'Yds / Play', numeric: true, size: 'avg', render: row => ssCell(row, r => r.avg) },
  { key: 'succRate', label: 'Success', numeric: true, size: 'pct', render: row => ssCell(row, r => `${r.succRate}%`) },
  { key: 'explosives', label: 'Explosive Plays', numeric: true, size: 'expl', render: row => ssCell(row, r => r.explosives) },
  { key: 'tds', label: 'TD', numeric: true, size: 'n', render: row => ssCell(row, r => r.tds) },
  // "Giveaways" was the last legacy label on this board; a giveaway IS a
  // turnover, and Reports say Turnovers.
  { key: 'turnovers', label: 'Turnovers', numeric: true, size: 'pct', render: row => ssCell(row, r => r.turnovers) },
  { key: 'mix', label: 'Run / Pass', size: 'split', sortValue: row => row.runPct,
    render: row => ssCell(row, r => r.mix) },
];
const ssOutcomeRows = (rows, screen, { cutType, display } = {}) => rows.map(row => {
  const text = display ? display(row.key) : row.key;
  const label = `${text} — ${row.n} plays`;
  return { ...row, id: row.key, display: text, label, mix: `${row.runPct} / ${row.passPct}`,
    // A held row has no cohort behind it, so it gets no film affordance.
    onActivate: row.held ? undefined : ssWatch(screen, row, cutType, label) };
});

const ssCallColumns = [
  { key: 'display', label: 'Call / Concept', tl: true, size: 'label', render: row => ssTrunc(row.display) },
  { key: 'n', label: 'Plays', numeric: true, size: 'n' },
  { key: 'avg', label: 'Yds / Play', numeric: true, size: 'avg' },
  { key: 'succRate', label: 'Success', numeric: true, size: 'pct', render: row => `${row.succRate}%` },
];
const ssDefenseCallColumns = [
  { key: 'display', label: 'Call', tl: true, size: 'label', render: row => ssTrunc(row.display) },
  { key: 'n', label: 'Plays', numeric: true, size: 'n' },
  { key: 'stopRate', label: 'Stop', numeric: true, size: 'pct', render: row => `${row.stopRate}%` },
  { key: 'avgYds', label: 'Yds / Play', numeric: true, size: 'avg' },
];
const ssRankedRows = (rows, screen, cutType) => rows.map(row => {
  const label = `${row.key} — ${row.n} plays`;
  return { ...row, id: row.key, display: row.key, label, onActivate: ssWatch(screen, row, cutType, label) };
});

function SsSummarySection({ summary, performance, screen }) {
  const kpis = summary.kpis;
  const positive = summary.positive, negative = summary.negative;
  return <>
    <KpiBand items={[
      { label: 'Success Rate', value: `${kpis.successRate}%` },
      { label: 'Yards / Play', value: kpis.yardsPerPlay },
      { label: 'Explosive Plays Rate', value: `${kpis.explosiveRate}%` },
      { label: 'Negative Play Rate', value: `${kpis.negativePlayRate}%` },
      { label: 'Third Down', value: `${kpis.thirdDownRate}%` },
      kpis.redZoneTdRate != null
        ? { label: 'Red Zone TD', value: `${kpis.redZoneTdRate}%` }
        : { label: 'Red Zone TD', value: SS_NO_DATA, cls: 'is-blank' },
    ]} />
    <SsBand cls="b-2">
      <SsModule title="Positive Plays" phase="off"><SsCounts items={[
        ['Successful plays', positive.successful], ['Explosive plays', positive.explosive],
        ['Touchdowns', positive.touchdowns], ['Third-down conversions', positive.thirdDownConversions],
        ['Red-zone touchdowns', positive.redZoneTouchdowns],
      ]} /></SsModule>
      <SsModule title="Negative Plays" phase="off"><SsCounts items={[
        ['Negative plays', negative.negative], ['Turnovers', negative.turnovers],
        ['Sacks', negative.sacks], ['Plays for loss', negative.playsForLoss],
        ['Penalties', negative.penalties],
      ]} /></SsModule>
    </SsBand>
    <SsBand cls="b-2">
      <SsModule title="Top Calls" phase="off">
        <SsTable columns={ssCallColumns} rows={ssRankedRows(summary.topCalls, screen, 'playCallOrConcept')} />
      </SsModule>
      <SsModule title="Worst Calls" phase="off">
        <SsTable columns={ssCallColumns} rows={ssRankedRows(summary.worstCalls, screen, 'playCallOrConcept')} />
      </SsModule>
    </SsBand>
    <SsBand cls="b-2">
      <SsModule title="Run Offense" phase="off"><SsCounts items={[
        ['Attempts', summary.run.attempts], ['Rushing yards', summary.run.yards],
        ['Yards per carry', summary.run.avg], ['Success rate', `${summary.run.succRate}%`],
        ['Explosive runs', summary.run.explosives],
      ]} /></SsModule>
      <SsModule title="Pass Offense" phase="off"><SsCounts items={[
        ['Attempts', summary.pass.attempts], ['Passing yards', summary.pass.yards],
        ['Yards per attempt', summary.pass.avg], ['Success rate', `${summary.pass.succRate}%`],
        ['Explosive passes', summary.pass.explosives], ['Sacks', summary.pass.sacks],
      ]} /></SsModule>
    </SsBand>
  </>;
}

function SsCallsSection({ report, callRows, screen }) {
  const engine = screen.app.stats;
  const bands = [];
  if (callRows.length) bands.push(<SsBand key="calls"><SsModule title="By call and concept" phase="off">
    <SsTable columns={ssOutcomeColumns('Call / Concept')}
      rows={ssOutcomeRows(callRows, screen, { cutType: 'playCallOrConcept' })} />
  </SsModule></SsBand>);
  if (report.downDistRows.length) bands.push(<SsBand key="dd"><SsModule title="By down and distance" phase="off">
    <SsTable columns={ssOutcomeColumns('Down & Dist')}
      rows={ssOutcomeRows(report.downDistRows, screen, { cutType: 'dd', display: key => engine._ddPretty(key) })} />
  </SsModule></SsBand>);
  if (!bands.length) return <SsEmpty title="No situational data"
    body="No offensive plays carry a down and distance or a play call." screen={screen} />;
  return <>{bands}</>;
}

function SsStructureSection({ report, screen }) {
  const bands = [];
  if (report.formationRows.length) bands.push(<SsBand key="forms"><SsModule title="By formation" phase="off">
    <SsTable columns={ssOutcomeColumns('Formation')}
      rows={ssOutcomeRows(report.formationRows, screen, { cutType: 'formation' })} />
  </SsModule></SsBand>);
  if (report.personnelRows.length) bands.push(<SsBand key="pers"><SsModule title="By personnel" phase="off">
    <SsTable columns={ssOutcomeColumns('Personnel')}
      rows={ssOutcomeRows(report.personnelRows, screen, { cutType: 'personnel' })} />
  </SsModule></SsBand>);
  const diversity = (report.personnelDiversity || []).filter(item => item.topPct >= 75);
  if (diversity.length) bands.push(<SsBand key="pf"><SsModule title="Personnel to formation" phase="off">
    <SsTable columns={[
      { key: 'personnel', label: 'Personnel', tl: true, size: 'label', render: row => ssTrunc(row.personnel) },
      { key: 'n', label: 'Plays', numeric: true, size: 'n' },
      { key: 'uniqueFormations', label: 'Formations', numeric: true, size: 'forms' },
      { key: 'topFormation', label: 'Top formation', size: 'scheme', render: row => ssTrunc(row.topFormation) },
      { key: 'topPct', label: 'Top %', numeric: true, size: 'pct', render: row => `${row.topPct}%` },
      { key: 'distribution', label: 'Distribution', size: 'scheme', render: row => ssTrunc(row.distribution) },
      { key: 'read', label: 'Read', size: 'lean' },
    ]} rows={diversity.map(item => {
      const label = `${item.personnel} personnel — ${item.n} plays`;
      return { ...item, id: item.personnel, label,
        distribution: item.formations.map(f => `${f.formation} ${f.pct}%`).join(', '),
        read: item.topPct >= 90 ? 'Locked' : 'Leaning',
        onActivate: () => screen.watchCut('personnel', item.personnel, label) };
    })} />
  </SsModule></SsBand>);
  if (!bands.length) return <SsEmpty title="No structural data"
    body="No offensive plays carry a formation or a personnel grouping." screen={screen} />;
  return <>{bands}</>;
}

function SsDefenseSection({ defScout, defSummary, screen }) {
  if (!defScout || defScout.insufficient) {
    const charted = defScout?.defPlays || 0;
    const scheme = defScout?.schemePlays || 0;
    const required = defScout?.required || 6;
    const body = !charted ? 'No defensive plays are charted.'
      : !scheme ? `${charted} defensive plays are charted. None carries a Front, Coverage or Blitz.`
        : `${scheme} of ${required} scheme-tagged defensive plays required.`;
    return <SsEmpty title="Defensive Self-Scout" body={body} screen={screen} />;
  }
  const kpis = defSummary.kpis;
  return <>
    {/* Yards Allowed / Play LEADS. Stop Rate held the headline slot after the
        coach rejected it as the primary defensive comparison — it is the
        inverse of offensive play success, so its down-specific thresholds make
        the comparison misleading at a glance (reports-defense-2026-09-09
        RATIONALE). It keeps its place as supporting context in the last tile
        and as the ranking key in the defensive call tables below; the approved
        six-tile band is unchanged in count and order otherwise. */}
    <KpiBand items={[
      kpis.yardsAllowedPerPlay == null ? { label: 'Yards Allowed / Play', value: SS_NO_DATA, cls: 'is-blank' }
        : { label: 'Yards Allowed / Play', value: kpis.yardsAllowedPerPlay },
      { label: 'Havoc Rate', value: `${kpis.havocRate || '0.0'}%` },
      { label: 'Sacks', value: String(kpis.sacks) },
      { label: 'TFL', value: String(kpis.tfl) },
      { label: 'Takeaways', value: String(kpis.takeaways) },
      kpis.stopRate == null ? { label: 'Stop Rate', value: SS_NO_DATA, cls: 'is-blank' }
        : { label: 'Stop Rate', value: `${kpis.stopRate}%` },
    ]} />
    <SsBand cls="b-2">
      <SsModule title="Positive Plays" phase="def"><SsCounts items={[
        ['Stops', defSummary.positive.stops], ['Sacks', defSummary.positive.sacks],
        ['Tackles for loss', defSummary.positive.tfl], ['Takeaways', defSummary.positive.takeaways],
      ]} /></SsModule>
      <SsModule title="Negative Plays" phase="def"><SsCounts items={[
        ['Successful plays allowed', defSummary.negative.successfulAllowed],
        ['Explosive plays allowed', defSummary.negative.explosiveAllowed],
        ['Touchdowns allowed', defSummary.negative.touchdownsAllowed],
      ]} /></SsModule>
    </SsBand>
    <SsBand cls="b-2">
      <SsModule title="Top Calls" phase="def">
        <SsTable columns={ssDefenseCallColumns} rows={ssRankedRows(defSummary.topCalls, screen, null)} />
      </SsModule>
      <SsModule title="Worst Calls" phase="def">
        <SsTable columns={ssDefenseCallColumns} rows={ssRankedRows(defSummary.worstCalls, screen, null)} />
      </SsModule>
    </SsBand>
    <SsBand cls="b-2">
      <SsModule title="Run Defense" phase="def"><SsCounts items={[
        ['Attempts', defSummary.run.attempts], ['Rushing yards allowed', defSummary.run.yardsAllowed],
        ['Yards allowed per play', defSummary.run.yardsPerPlay],
        ['Stop rate', `${defSummary.run.stopRate}%`], ['Explosive runs allowed', defSummary.run.explosivesAllowed],
        ['Tackles for loss', defSummary.run.tfl],
      ]} /></SsModule>
      <SsModule title="Pass Defense" phase="def"><SsCounts items={[
        ['Attempts', defSummary.pass.attempts], ['Passing yards allowed', defSummary.pass.yardsAllowed],
        ['Yards allowed per play', defSummary.pass.yardsPerPlay],
        ['Stop rate', `${defSummary.pass.stopRate}%`], ['Explosive passes allowed', defSummary.pass.explosivesAllowed],
        ['Sacks', defSummary.pass.sacks],
      ]} /></SsModule>
    </SsBand>
  </>;
}

function SsTendenciesSection({ report, defScout, screen }) {
  const engine = screen.app.stats;
  const tone = ssPredClass(report.predictability);
  const bands = [<SsBand key="pred"><SsModule title="Predictability" phase="off">
    <div class="gi-ss-pred">
      <span class={`gi-ss-pred-val is-${tone}`}>{report.predictability}<small>/100</small></span>
      <span class="gi-ss-pred-meter"><i class={`bg-${tone}`} style={{ width: `${report.predictability}%` }} /></span>
      <span class="gi-ss-pred-cls">{report.predLabel}</span>
    </div>
  </SsModule></SsBand>];

  bands.push(<SsBand key="tells"><SsModule title="Offensive tendencies" phase="off">
    <SsTable columns={[
      { key: 'display', label: 'Situation', tl: true, size: 'label', render: row => ssTrunc(row.display) },
      { key: 'dim', label: 'Type', size: 'dim', render: row => ssTrunc(row.dim) },
      { key: 'leanPct', label: 'Lean', numeric: true, size: 'lean',
        render: row => <SsBar tone={row.lean === 'Run' ? 'run' : 'pass'} pct={row.leanPct} text={`${row.lean} ${row.leanPct}%`} /> },
      { key: 'leanAvg', label: 'Yds / Play', numeric: true, size: 'avg' },
      { key: 'leanSuccRate', label: 'Success', numeric: true, size: 'pct', render: row => `${row.leanSuccRate}%` },
      { key: 'n', label: 'Plays', numeric: true, size: 'n' },
    ]} rows={report.tells.map((tell, index) => {
      const label = `${tell.label} — ${tell.n} plays`;
      return { ...tell, id: `${tell.dim}-${tell.label}-${index}`, display: tell.label, label,
        onActivate: tell.cutType ? () => screen.watchCut(tell.cutType, tell.cutVal, label) : undefined };
    })} />
  </SsModule></SsBand>);

  const view = engine._selfScoutMatrixView(report.matrix);
  if (view) bands.push(<SsBand key="map"><SsModule title="Predictability map" phase="off">
    <div class="gi-table-wrap"><table class="stats-table gi-ss-map">
      <thead><tr><th class="tl">Formation / Situation</th>
        {view.cols.map(col => <th key={col.key}>{col.label}</th>)}</tr></thead>
      <tbody>{view.rows.map(row => <tr key={row.formation}>
        <td class="tl">{row.formation} <i>n={row.n}</i></td>
        {row.cells.map(cell => {
          if (cell.empty) return <td key={cell.situation.key} class="gi-ss-cell is-nodata"><span class="lean">{SS_NO_DATA}</span></td>;
          const label = `${row.formation} on ${cell.situation.label} — ${cell.cell.n} plays`;
          return <Watchable key={cell.situation.key} tag="td" class={`gi-ss-cell is-${cell.state}`} label={label}
            onActivate={() => screen.watchCut('comboFS', `${row.formation}__${cell.situation.key}`, label)}>
            <span class="lean">{cell.lean} {cell.leanPct}%</span>
            <span class="n">n={cell.cell.n}{cell.strong ? '' : ', low sample'}</span>
          </Watchable>;
        })}
      </tr>)}</tbody>
    </table></div>
    <div class="gi-ss-legend">
      <span class="k-exploit"><b />Predictable, below baseline</span>
      <span class="k-working"><b />Predictable, at or above baseline</span>
      <span class="k-balanced"><b />Balanced</span>
      <span class="k-low"><b />Under {view.minCount} plays</span>
    </div>
  </SsModule></SsBand>);

  if (defScout && !defScout.insufficient && defScout.tells.length) {
    bands.push(<SsBand key="deftells"><SsModule title="Defensive tendencies" phase="def">
      <SsTable columns={[
        { key: 'display', label: 'Situation', tl: true, size: 'label', render: row => ssTrunc(row.display) },
        { key: 'tellType', label: 'Call', size: 'tell' },
        { key: 'tellPct', label: 'Lean', numeric: true, size: 'lean',
          render: row => <SsBar tone="run" pct={row.tellPct} text={`${row.tellVal} ${row.tellPct}%`} /> },
        { key: 'stopRate', label: 'Stop', numeric: true, size: 'pct', render: row => `${row.stopRate}%` },
        { key: 'havocRate', label: 'Havoc', numeric: true, size: 'pct', render: row => `${row.havocRate}%` },
        { key: 'n', label: 'Plays', numeric: true, size: 'n' },
      ]} rows={defScout.tells.map((tell, index) => {
        const label = `${tell.label} — ${tell.n} plays`;
        return { ...tell, id: `${tell.dim}-${tell.tellType}-${tell.label}-${index}`, display: tell.label, label,
          onActivate: tell.refs?.length ? () => screen.watchRefs(tell.refs, label)
            : (tell.cutType ? () => screen.watchCut(tell.cutType, tell.cutVal, label) : undefined) };
      })} />
    </SsModule></SsBand>);
  }
  return <>{bands}</>;
}

/** How many rows or findings each section holds, so a coach can see where the
 *  report has something before opening it. */
function ssSectionCount(id, { report, callRows, defScout, defSummary }) {
  switch (id) {
    /* The sample the summary is COMPUTED over, not the ranked play-call list.
       `callRows` comes from `playCall || playConcept`, and the canonical season
       charts neither in any of its six games — so this badge read 0 in both
       scopes above a section rendering populated KPIs, positive and negative
       plays, top and worst calls and the run/pass split, and the zero also
       dimmed the tab through `is-none`. */
    case 'summary': return report ? report.totalPlays : 0;
    case 'offense': return report ? report.downDistRows.length + callRows.length : 0;
    case 'structure': return report ? report.formationRows.length + report.personnelRows.length : 0;
    case 'defense': return (defScout && !defScout.insufficient) ? defSummary.calls.length : 0;
    case 'tendencies': return report
      ? report.tells.length + ((defScout && !defScout.insufficient) ? defScout.tells.length : 0) : 0;
    default: return 0;
  }
}

export function SelfScoutTab({ report, defScout, performance, callRows, screen }) {
  const engine = screen.app.stats;
  /* Section lives on the controller, the way Players' does: an ordinary
     Reports re-render unmounts and remounts this component, so a selection
     held only here would be discarded and the board would snap back to
     Offensive Summary. Local state still drives the render. */
  const [section, setSectionState] = useState(screen.selfScoutSection || 'summary');
  const setSection = id => { screen.selfScoutSection = id; setSectionState(id); };
  const rows = callRows || [];
  const summary = useMemo(() => (report ? engine.selfScoutSummary(performance, rows) : null),
    [engine, report, performance, rows]);
  const defSummary = useMemo(() => engine.selfScoutDefenseSummary(performance),
    [engine, performance]);
  const counts = { report, callRows: rows, defScout, defSummary };

  let body;
  if (section === 'defense') body = <SsDefenseSection defScout={defScout} defSummary={defSummary} screen={screen} />;
  else if (!report) body = <SsEmpty title={SS_NO_OFFENSE[0]} body={SS_NO_OFFENSE[1]} screen={screen} />;
  else if (section === 'offense') body = <SsCallsSection report={report} callRows={rows} screen={screen} />;
  else if (section === 'structure') body = <SsStructureSection report={report} screen={screen} />;
  else if (section === 'tendencies') body = <SsTendenciesSection report={report} defScout={defScout} screen={screen} />;
  else body = <SsSummarySection summary={summary} performance={performance} screen={screen} />;

  return <div class="gi-overview-board gi-selfscout-board" data-ss-section={section}>
    <div class="gi-selfscout-report">
      {/* Sections and the report export live in the shared secondary bar
          (coach-approved comp, 2026-09-23); the sample stays with the board. */}
      <ReportSectionBar screen={screen} label="Self-Scout sections" navClass="gi-selfscout-pages"
        sections={SELF_SCOUT_SECTIONS.map(([id, title]) => {
          const count = ssSectionCount(id, counts);
          return { id, label: title, count: String(count), none: !count };
        })}
        active={section} onSelect={setSection}
        exportAction={{ label: 'Export report', attrs: { class: 'gi-secbar-export', 'data-report-export': 'selfscout' },
          onSelect: () => (screen.exportSelfScout ? screen.exportSelfScout(report, defScout, performance, rows) : screen.export('season-html')) }} />
      {/* The page heading, the Defense board's hierarchy (coach direction,
          1.12.0-97 smoke S97-1); the sample line is its cohort statement. */}
      {(() => {
        const index = SELF_SCOUT_SECTIONS.findIndex(([id]) => id === section);
        return <header class="gi-report-heading">
          <span>{String(index + 1).padStart(2, '0')}</span><h2>{SELF_SCOUT_SECTIONS[index][1]}</h2>
          <small class="gi-selfscout-toolbar"><span class="gi-selfscout-sample">
            {/* Both halves name the cohort. The defensive half said "defensive
                plays" while measuring the same classified subset, so it read as
                a different cohort from the offensive half beside it. */}
            <b>{report ? report.totalPlays : 0}</b> classified offensive plays · <b>{defSummary.totalPlays}</b> classified defensive plays
          </span></small>
        </header>;
      })()}
      <div class="gi-selfscout-sections">{body}</div>
    </div>
  </div>;
}
export function ReportPane({ tab, children, opponent }) {
  return <section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane={tab}
    data-report-perspective-pane={opponent ? 'opponent' : undefined}>
    <div>{children}</div>
  </section>;
}
