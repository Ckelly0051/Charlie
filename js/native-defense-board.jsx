/**
 * Reports > Defense, Revision 2.
 *
 * Four PAGES selected from the shared secondary bar (coach-approved comp,
 * design-comps/reports-secondary-nav-2026-09-23) - Performance, Opponent
 * offense, Scheme & passing, Situations - each its existing numbered section
 * of fixed-height modules; Performance opens with the ten-KPI strip. Every value comes
 * from `StatsEngine.defenseBoard()`; this file formats and lays out, and derives
 * no football value.
 *
 * MODULE GEOMETRY IS A CONTRACT, not a style. A module's external height is
 * fixed from its allocated rows and never grows with data:
 *
 *   - FIXED schema (a finite football set): exactly its possible rows.
 *   - SUMMARY: one line.
 *   - VARIABLE schema: the next standard height (220 / 300 / 380 / 460) that
 *     holds its allocation. Unused visible capacity renders as `-` rows; data
 *     beyond capacity scrolls inside the module under a sticky header.
 *
 * Half-width modules pair with the next half-width module of the SAME height
 * so a pair's top and bottom edges align; an unmatched module spans the row.
 */
import { useState } from 'preact/hooks';
import { Watchable, EmptyState, ReportSectionBar } from './native-report-kit.jsx';
import '../css/native-defense-board.css';

/* Module chrome: a 50px header, a 44px table header and two 1px borders. */
const MODULE_CHROME = 96;
const STANDARD_HEIGHTS = [220, 300, 380, 460];

export function defenseModuleHeight({ rows, slots, pitch = 38, schema = 'variable' }) {
  const visible = Math.max(1, Math.min(rows, slots));
  const exact = MODULE_CHROME + visible * pitch;
  if (schema !== 'variable') return exact;
  const minimum = pitch > 38 ? 300 : 220;
  const standard = STANDARD_HEIGHTS.find(height => exact <= height) || STANDARD_HEIGHTS.at(-1);
  return Math.max(minimum, standard);
}

/** The pairing rule, in order: each half-width module takes the next unpaired
 *  half-width module of equal height, or spans the row alone. */
export function pairDefenseModules(modules) {
  const pending = modules.map(module => ({ ...module }));
  const ordered = [];
  while (pending.length) {
    const module = pending.shift();
    ordered.push(module);
    if (module.wide) continue;
    const match = pending.findIndex(other => !other.wide && other.height === module.height);
    if (match < 0) { module.wide = true; continue; }
    ordered.push(pending.splice(match, 1)[0]);
  }
  return ordered;
}

/* ABSENCE. A measured zero prints `0`; a value with no denominator or no
   charting prints the em dash. A `-` row is unused capacity, never data. */
export const cell = value => value == null || (typeof value === 'number' && Number.isNaN(value)) ? '—'
  : typeof value === 'number' && !Number.isInteger(value) ? value.toFixed(1) : String(value);
const percent = value => value == null ? null : `${value.toFixed(1)}%`;
const wholePercent = value => value == null ? null : `${value}%`;
const runPass = row => row.n ? `${row.runs}R / ${row.passes}P` : null;

const SECTIONS = [
  { id: 'performance', number: '01', title: 'Defensive performance', page: 'Performance' },
  { id: 'opponent', number: '02', title: 'Opponent offense', page: 'Opponent offense' },
  { id: 'scheme', number: '03', title: 'Scheme and passing defense', page: 'Scheme & passing' },
  { id: 'situations', number: '04', title: 'Situational results', page: 'Situations' },
];

/** Row data for a table: `cells` in column order, plus its own film refs. */
const row = (cells, refs) => ({ cells, refs: refs || [] });

function buildSections(board, seasonScope) {
  const b = board;
  const performance = [];
  if (seasonScope) performance.push({ title: 'Game-by-game', wide: true, slots: 6,
    heads: ['Opponent', 'Yards', 'Rush', 'Pass', 'Yds/play', 'Explosive Plays', 'TO', 'Touchdowns Allowed'],
    rows: b.byGame.map(r => row([r.name, r.yards, r.runYards, r.passYards, r.ypp, r.explosives, r.takeaways, r.touchdownsAllowed], r.refs)) });
  performance.push(
    { title: 'Disruption', schema: 'fixed', slots: 6, heads: ['Event', 'Plays', 'Rate', 'Eligible snaps'],
      rows: b.disruption.map(r => row([r.name, r.plays, percent(r.rate), r.eligible], r.refs)) },
    { title: seasonScope ? 'Season vs Last 3' : 'Current game vs Season', schema: 'fixed', slots: 6,
      heads: ['Measure', seasonScope ? 'Season' : 'Game', seasonScope ? 'Last 3' : 'Season'],
      rows: b.comparison.map(r => row([r.name, r.kind === 'percent' ? percent(r.current) : r.current,
        r.kind === 'percent' ? percent(r.comparison) : r.comparison])) },
    { title: 'By down', schema: 'fixed', slots: 4, heads: ['Down', 'Total yards', 'Yds/play', 'Explosive Plays'],
      rows: b.downs.map(r => row([r.name, r.yards, r.ypp, r.explosives], r.refs)) },
    { title: 'By quarter', schema: 'fixed', slots: 4, heads: ['Quarter', 'Total yards', 'Yds/play', 'Vs baseline', 'Touchdowns Allowed'],
      rows: b.quarters.map(r => row([r.name, r.yards, r.ypp, r.vsAverage, r.touchdownsAllowed], r.refs)) },
    { title: 'Opponent drive outcomes', wide: true, slots: 7, heads: ['Outcome', 'Drives', 'Share', 'Avg plays', 'Avg yards'],
      rows: b.driveOutcomes.map(r => row([r.name, r.n, wholePercent(r.share), r.avgPlays, r.avgYards], r.refs)) },
    { title: 'Defensive player contributions', wide: true, slots: 10, sortable: true,
      heads: ['Player', 'Tackles', 'Solo', 'Ast', 'Sacks', 'TFL', 'INT', 'FR', 'Grade'],
      rows: b.players.map(r => row([r.name, r.tackles, r.solo, r.assists, r.sacks, r.tfl, r.interceptions, r.fumblesRecovered, r.grade], r.refs)) },
    /* Possessions measure every charted defensive snap and their `Yards*` is the
       drive's tagged yardage WITH penalty movement, which is why they do not
       reconcile with the classified production above them. Both facts are stated
       as counts, from the rows themselves. */
    { title: 'Opponent possessions', wide: true, slots: 8,
      meta: `${b.possessions.reduce((sum, r) => sum + (Number(r.plays) || 0), 0)} snaps · penalties included`,
      heads: ['Opponent', 'Possession', 'Start', 'Last snap', 'Plays', 'Yards*', 'Outcome', 'Pts*'],
      rows: b.possessions.map(r => row([r.opponent, r.name, r.start, r.lastSnap, r.plays, r.yards, r.outcome, r.points], r.refs)) },
  );

  const opponent = [
    /* A multi-select play type counts in every row it names, so the rows carry
       more TAGS than there are snaps and cannot be summed into a team total.
       Both numbers are printed — the unique snaps behind the module and the tag
       count its rows add up to — which makes the overlap visible without a
       sentence about it. The unique count comes from the rows' own film refs. */
    { title: 'Production by play type', slots: 7, heads: ['Play type', 'Snaps', 'Yards', 'Yds/play', 'Explosive Plays', 'Touchdowns Allowed'],
      meta: `${new Set(b.playTypes.flatMap(r => r.refs || [])).size} snaps · ${
        b.playTypes.reduce((sum, r) => sum + (Number(r.n) || 0), 0)} tags`,
      rows: b.playTypes.map(r => row([r.name, r.n, r.yards, r.ypp, r.explosives, r.touchdownsAllowed], r.refs)) },
    /* A snap with no charted direction is not in this module at all, which is the
       whole gap between its yardage and the classified total above it. */
    { title: 'Performance by Play Direction', schema: 'fixed', slots: 4,
      meta: `${b.directions.reduce((sum, r) => sum + (Number(r.n) || 0), 0)} direction-tagged snaps`,
      heads: ['Direction', 'Snaps', 'Share', 'Run / pass', 'Yards', 'Yds/play', 'Off succ', 'Explosive Plays'],
      rows: b.directions.map(r => row([r.name, r.n, percent(r.share), runPass(r), r.yards, r.ypp, percent(r.success), r.explosives], r.refs)) },
    { title: 'Top 10 Formations Faced', wide: true, slots: 10, cap: true,
      heads: ['Offensive look', 'Snaps', 'Share', 'Run / pass', 'Rush y/p', 'Pass y/p', 'Off succ', 'Explosive Plays'],
      rows: b.formations.map(r => row([r.name, r.n, percent(r.share), `${r.runs}R / ${r.passes}P`, r.rushYpp, r.passYpp, percent(r.success), r.explosives], r.refs)) },
    { title: 'Personnel faced', slots: 5, heads: ['Personnel', 'Snaps', 'Run / pass', 'Yds/play', 'Explosive Plays'],
      rows: b.personnel.map(r => row([r.name, r.n, runPass(r), r.ypp, r.explosives], r.refs)) },
    { title: 'Backfield faced', slots: 5, heads: ['Backfield', 'Snaps', 'Run / pass', 'Yds/play', 'Explosive Plays'],
      rows: b.backfields.map(r => row([r.name, r.n, runPass(r), r.ypp, r.explosives], r.refs)) },
    { title: 'Run / Pass vs Strength', wide: true, schema: 'fixed', slots: 3,
      heads: ['Relationship', 'Snaps', 'Share', 'Runs', 'Run Rate', 'Rush y/p', 'Passes', 'Pass Rate', 'Pass y/p', 'Off succ', 'Explosive Plays'],
      rows: b.strength.map(r => row([r.name, r.n, percent(r.share), r.runs, percent(r.runRate), r.rushYpp, r.passes,
        percent(r.passRate), r.passYpp, percent(r.success), r.explosives], r.refs)) },
    { title: 'Defensive answers by offensive look', wide: true, slots: 10, pitch: 60, cls: 'is-answers',
      heads: ['Offensive look', 'Defensive call', 'Snaps', 'Call share', 'Rush y/p', 'Pass y/p', 'Explosive Plays', 'Off succ'],
      rows: b.answers.map(r => row([r.look, r.call, r.n, percent(r.share), r.rushYpp, r.passYpp, r.explosives, percent(r.success)], r.refs)) },
  ];

  const s = b.passingSummary;
  const callCells = r => row([r.name, r.n, r.yards, r.ypp, r.vsAverage, r.explosives], r.refs);
  const callHeads = ['Call', 'Snaps', 'Yards', 'Yds/play', 'Vs avg', 'Explosive Plays'];
  const scheme = [
    { title: 'Passing Defense Summary', wide: true, schema: 'summary', slots: 1,
      heads: ['Dropbacks', 'Comp / att', 'Comp%', 'Yds/att', 'Sacks', 'INT'],
      rows: [row([s.dropbacks, `${s.completions} / ${s.attempts}`, percent(s.completionRate), s.yardsPerAttempt, s.sacks, s.interceptions], s.refs)] },
    ...(b.calls.combined
      ? [{ title: 'Call Performance', wide: true, slots: 4, pitch: 64, cls: 'is-calls', heads: callHeads, rows: b.calls.top.map(callCells) }]
      : [{ title: 'Top Calls', slots: 4, pitch: 64, cls: 'is-calls', cap: true, heads: callHeads, rows: b.calls.top.map(callCells) },
        { title: 'Worst Calls', slots: 4, pitch: 64, cls: 'is-calls', cap: true, heads: callHeads, rows: b.calls.worst.map(callCells) }]),
    { title: 'Blitz Performance', wide: true, schema: 'fixed', slots: 4,
      heads: ['Cohort', 'Snaps', 'Share', 'Yds/play', 'Off succ', 'Explosive Plays', 'Comp / att', 'Sacks', 'INT'],
      rows: b.blitz.map(r => row([r.name, r.n, percent(r.share), r.ypp, percent(r.success), r.explosives,
        r.attempts == null ? null : `${r.completions} / ${r.attempts}`, r.sacks, r.interceptions], r.refs)) },
    { title: 'Pressure by situation', slots: 6, heads: ['Situation', 'Snaps', 'Blitz%', 'Blitz y/p', 'Base y/p'],
      rows: b.pressure.map(r => row([r.name, r.n, wholePercent(r.blitzPct), r.blitzYpp, r.baseYpp], r.refs)) },
    ...[['Front performance', b.fronts], ['Coverage performance', b.coverages]].filter(([, rows]) => rows.length)
      .map(([title, rows]) => ({ title, slots: 7, heads: ['Structure', 'Snaps', 'Rush y/p', 'Pass y/p', 'Off succ', 'Explosive Plays'],
        rows: rows.map(r => row([r.name, r.n, r.rushYpp, r.passYpp, percent(r.success), r.explosives], r.refs)) })),
    { title: 'Blitz Type Performance', wide: true, schema: 'fixed', slots: 4,
      heads: ['Structure', 'Snaps', 'Rush y/p', 'Pass y/p', 'Off succ', 'Explosive Plays'],
      rows: b.blitzTypes.map(r => row([r.name, r.n, r.rushYpp, r.passYpp, percent(r.success), r.explosives], r.refs)) },
    { title: 'Passing by coverage', slots: 7, heads: ['Scheme', 'Dropbacks', 'Comp / att', 'Comp%', 'Yds/att', 'Sacks', 'INT'],
      rows: b.passingByCoverage.map(r => row([r.name, r.dropbacks, r.attempts ? `${r.completions} / ${r.attempts}` : null,
        percent(r.completionRate), r.yardsPerAttempt, r.sacks, r.interceptions], r.refs)) },
    { title: 'Call use and performance trends', wide: true, slots: 8, pitch: 48,
      heads: ['Defensive call', seasonScope ? 'Season share' : 'Game share', seasonScope ? 'Last 3 share' : 'Season share',
        seasonScope ? 'Season y/p' : 'Game y/p', seasonScope ? 'Last 3 y/p' : 'Season y/p'],
      rows: b.callTrends.map(r => row([r.name, percent(r.share), percent(r.comparisonShare), r.ypp, r.comparisonYpp], r.refs)) },
  ];

  const situations = [
    { title: 'Down & Distance', wide: true, slots: 12, pitch: 64, cls: 'is-situations',
      heads: ['Situation', 'Snaps', 'Run / pass', 'Yards', 'Yds/play', '1st Downs Allowed', 'Allowed %', 'Top call', 'Blitz%'],
      rows: b.downDistance.map(r => row([r.name, r.n, `${r.runs}R / ${r.passes}P`, r.yards, r.ypp, r.firstDowns,
        percent(r.allowedPct), r.topCall, wholePercent(r.blitzPct)], r.refs)) },
    { title: 'High-leverage field position', wide: true, schema: 'fixed', slots: 6, pitch: 48,
      heads: ['Situation', 'Sample', 'Yds/play', 'Touchdowns Allowed'],
      rows: b.highLeverage.map(r => row([r.name, r.sampleRate !== undefined ? percent(r.sampleRate) : r.sample, r.ypp, r.touchdownsAllowed], r.refs)) },
    { title: 'Field zone', wide: true, slots: 5, heads: ['Zone', 'Snaps', 'Yards', 'Yds/play', 'Explosive Plays'],
      rows: b.zones.map(r => row([r.name, r.n, r.yards, r.ypp, r.explosives], r.refs)) },
    { title: 'By hash', schema: 'fixed', slots: 5, heads: ['Hash', 'Snaps', 'Yards', 'Yds/play'],
      rows: b.hashes.map(r => row([r.name, r.n, r.yards, r.ypp], r.refs)) },
    { title: 'Motion', slots: 5, heads: ['Motion', 'Snaps', 'Run / pass', 'Yds/play', 'Explosive Plays'],
      rows: b.motions.map(r => row([r.name, r.n, runPass(r), r.ypp, r.explosives], r.refs)) },
  ];

  const size = module => {
    const pitch = module.pitch || 38;
    const schema = module.schema || 'variable';
    const height = defenseModuleHeight({ rows: module.rows.length, slots: module.slots, pitch, schema });
    return { ...module, pitch, schema, height, wide: !!module.wide };
  };
  return Object.fromEntries(Object.entries({ performance, opponent, scheme, situations })
    .map(([id, modules]) => [id, pairDefenseModules(modules.map(size))]));
}

/* Sorting reads the RENDERED cell, the same text the coach sees: a number
   sorts numerically, and anything without a number sorts as text. */
const sortValue = text => parseFloat(String(text).replace(/[^0-9.-]/g, ''));
function compareCells(a, b) {
  const an = sortValue(a), bn = sortValue(b);
  return Number.isNaN(an) || Number.isNaN(bn) ? String(a).localeCompare(String(b), undefined, { numeric: true }) : an - bn;
}

function DefenseModule({ module, screen }) {
  const [sort, setSort] = useState({ column: null, direction: null });
  const { title, heads, pitch, schema, height, wide, cls = '', sortable, meta } = module;
  let rows = module.cap ? module.rows.slice(0, module.slots) : module.rows.slice();
  if (sortable && sort.column != null) {
    rows.sort((a, b) => {
      const result = compareCells(cell(a.cells[sort.column]), cell(b.cells[sort.column]));
      return sort.direction === 'asc' ? result : -result;
    });
  }
  const capacity = Math.max(1, Math.floor((height - MODULE_CHROME) / pitch));
  const held = schema === 'variable' && rows.length <= capacity ? capacity - rows.length : 0;
  const sortBy = column => setSort(current => ({ column,
    direction: current.column === column && current.direction === 'asc' ? 'desc' : 'asc' }));
  return <section class={`gi-def2-module${wide ? ' is-wide' : ''}${cls ? ` ${cls}` : ''}`}
    data-def2-module={title} data-def2-schema={schema}
    style={`--def2-module-height:${height}px;--def2-row-height:${pitch}px`}>
    {/* THE COHORT IS NAMED, IN COUNTS, NOT IN PROSE. Modules on this board
        legitimately measure different cohorts — the classified run/pass subset,
        the direction-tagged subset, every charted snap with penalty movement —
        and presenting them unlabelled is what made correct arithmetic read as a
        contradiction. Each count is computed from the cohort it describes. */}
    <header><h3>{title}</h3>{meta ? <span class="gi-def2-meta" data-def2-meta={title}>{meta}</span> : null}</header>
    <div class="gi-def2-tablewrap">
      <table data-def2-sortable={sortable ? 'true' : undefined}>
        <thead><tr>{heads.map((head, index) => sortable
          ? <th key={head} tabIndex={0} title={`Sort by ${head}`}
              aria-sort={sort.column === index ? (sort.direction === 'asc' ? 'ascending' : 'descending') : 'none'}
              onClick={() => sortBy(index)}
              onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); sortBy(index); } }}>
              {head}<span class="gi-def2-sortmark" aria-hidden="true">↕</span></th>
          : <th key={head} class={head === 'Explosive Plays' ? 'is-expl' : undefined}>{head}</th>)}</tr></thead>
        <tbody>
          {rows.map((item, index) => <Watchable key={`${index}-${item.cells[0]}`} tag="tr"
            onActivate={item.refs.length ? () => screen.watchRefs(item.refs, `${item.cells[0]} ${title}`) : undefined}
            label={`${item.cells[0]} ${title}`}>
            {item.cells.map((value, column) => <td key={column}>{cell(value)}</td>)}
          </Watchable>)}
          {Array.from({ length: held }, (_, index) => <tr key={`held-${index}`} class="is-held">
            {heads.map((_, column) => <td key={column}>-</td>)}</tr>)}
        </tbody>
      </table>
    </div>
  </section>;
}

export function DefenseTab({ board, scoped, screen, fixedScope = false }) {
  /* The page is controller state, like every other report's section: a scope
     change re-renders the board, and a page held only here would reset. */
  const [page, setPageState] = useState(SECTIONS.some(s => s.id === screen.defenseSection) ? screen.defenseSection : 'performance');
  const setPage = id => { screen.defenseSection = id; setPageState(id); document.querySelector('.ws-reports')?.scrollTo?.(0, 0); };
  if (!board?.total) return <EmptyState title="No defensive snaps charted" body="No defensive plays are charted for this scope."
    action={{ label: 'Open Break Down', onSelect: () => screen.openBreakDown?.() }} />;
  const seasonScope = fixedScope || screen.defenseScope === 'season';
  const sections = buildSections(board, seasonScope);
  const sample = `${board.total} charted / ${board.measured} with Run/Pass charted`;
  const k = board.kpis;
  const kpis = [
    ['Total yards allowed', cell(k.yards)], ['Rush yards allowed', cell(k.runYards)], ['Pass yards allowed', cell(k.passYards)],
    ['Yards / play', k.ypp == null ? '—' : k.ypp.toFixed(1)], ['Takeaways', cell(k.takeaways)],
    ['Explosive Plays', cell(k.explosives)], ['Touchdowns Allowed', cell(k.touchdownsAllowed)],
    ['Defensive Touchdowns', cell(k.defensiveTouchdowns)],
    ['3rd Down Stop %', cell(percent(k.thirdDownStop))], ['4th Down Stop %', cell(percent(k.fourthDownStop))],
  ];
  const setScope = scope => {
    screen.defenseScope = scope;
    document.querySelector('.ws-reports')?.scrollTo?.(0, 0);
    screen._syncHeader();
    screen._renderActiveTab();
  };
  /* Scope and the report export live in the shared bar. The export is the
     FULL four-section report whatever page is showing. */
  const scope = fixedScope ? null : [
    { id: 'game', label: 'Current game', active: !seasonScope, onSelect: () => setScope('game'), attrs: { 'data-defense-scope': 'game' } },
    { id: 'season', label: 'Full season', active: seasonScope, onSelect: () => setScope('season'), attrs: { 'data-defense-scope': 'season' } },
  ];
  const exportAction = { label: 'Export report', attrs: { class: 'gi-secbar-export gi-def-export', 'data-report-export': 'defense' },
    onSelect: () => (fixedScope ? screen.export('season-html') : screen.exportDefense(screen._defenseExportDashboard(), scoped)) };

  return <div class="gi-def2" data-def2-scope={seasonScope ? 'season' : 'game'} data-def2-page={page}>
    <ReportSectionBar screen={screen} label="Defense report sections" navClass="gi-def2-pages" numbered
      sections={SECTIONS.map(section => ({ id: section.id, label: section.page }))} active={page} onSelect={setPage}
      scope={scope} exportAction={exportAction} />
    <div class="gi-def2-body">
      {SECTIONS.filter(section => section.id === page).map(section => <>
        <div class="gi-def2-heading" id={`def2-${section.id}`} key={`heading-${section.id}`} data-def2-section={section.id}>
          <span>{section.number}</span><h2>{section.title}</h2><small>{sample}</small>
          {/* The KPI strip below measures the classified subset, and says so in
              the same counted form the modules use. */}
          {section.id === 'performance'
            ? <small class="gi-def2-cohort" data-def2-cohort="performance">{`${board.measured} run/pass snaps`}</small>
            : null}
        </div>
        {section.id === 'performance' && <div class="gi-def2-kpis" key="kpis"
          data-def2-kpi-cohort={`${board.measured} run/pass snaps`}>
          {kpis.map(([label, value]) => <div key={label} data-def2-kpi={label}><span>{label}</span><strong>{value}</strong></div>)}
        </div>}
        <div class="gi-def2-bands" key={`bands-${section.id}`}>
          {sections[section.id].map(module => <DefenseModule key={`${section.id}-${module.title}`} module={module} screen={screen} />)}
        </div>
      </>)}
    </div>
  </div>;
}
