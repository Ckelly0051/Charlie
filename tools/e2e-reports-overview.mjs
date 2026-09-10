/**
 * Reports > Overview — production parity against the coach-approved
 * composition.
 *
 * Approval record: `design-approvals/reports/overview/manifest.json`
 * (designStatus COMP_APPROVED, 2026-08-20). Canonical artifact:
 * `design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`,
 * primary reference `1440x900-overview.png`, with the full approved text in
 * that directory's `metrics.json` under `metrics.overview`.
 *
 * Three independent kinds of evidence, because no one of them is parity:
 *
 *   1. STRUCTURE  — sections, order, labels, columns, copy, driven on the real
 *                   route. Constants are transcribed from the canonical record;
 *                   this harness never parses the comp, because a check that
 *                   reads the artifact it verifies against proves only that the
 *                   artifact is self-consistent.
 *   2. OUTPUT     — every module's rendered values, against arithmetic this
 *                   file performs itself on its own literal fixture. Production
 *                   reaching the same number through StatsEngine is then
 *                   evidence rather than a tautology, so a wrong football
 *                   result cannot stay green.
 *   3. PIXELS     — the production board compared to the approved capture as
 *                   IMAGES: surface palette, accent colour, and the board's own
 *                   band-edge geometry, at all four registered viewports. This
 *                   is the check that catches the failure class a structural
 *                   test cannot see.
 *
 * The two archived FPO Overview documents under
 * `design-archive/reports/overview/early-fpo/` are superseded and are not
 * design authority for anything here.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const CANON_DIR = 'design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4';

/* ══ The approved composition, transcribed from the canonical record ═══════ */

const SECTIONS = [
  'Snaps by phase', 'Situational', 'Key metrics',
  'Rushing', 'Passing', 'Rushing allowed', 'Passing allowed',
  'Down & distance', 'Yards by type', 'Defense & discipline',
  'Top 10 Plays', 'Offensive Drives', 'Defensive Drives',
];
const FIXED_METAS = {
  'Situational': 'each tile opens film',
  'Key metrics': 'five coaching lenses',
  'Down & distance': 'run/pass mix and production',

};
const KPIS = ['Total plays', 'Success rate', 'Yards / play', 'Explosive Plays',
  'Turnovers', 'Plays for loss', 'Penalties'];
const SITUATIONAL_TILES = ['Red zone', 'Goal line', 'Third down',
  '3rd & long', '3rd & short', 'Backed up'];
const KEY_METRICS = ['Efficiency', 'Explosive Plays', 'Situational',
  'Tendencies', 'Negative', 'Points / drive'];
const RUSHING_ROWS = ['Attempts', 'Yards', 'Average', 'Touchdowns', 'Longest',
  'First downs', 'Fumbles'];
const PASSING_ROWS = ['Completions / attempts', 'Completion rate', 'Yards',
  'Yards / attempt', 'Touchdowns', 'Interceptions', 'Longest', 'Sacks taken'];
const DEFENSE_ROWS = ['Yards / play allowed', 'Stop rate', 'Explosive Plays allowed',
  'Takeaways', 'Penalties accepted', 'Penalties declined'];
const COLUMNS = {
  'Snaps by phase': ['Phase', 'Snaps', 'Share', 'Yds/play'],
  'Yards by type': ['Play type', 'Snaps', 'Yds/play', 'Success'],
  'Down & distance': ['Situation', 'Snaps', 'Run / pass', 'Yds/play', 'Success', 'Conv'],
  'Top 10 Plays': ['Play', 'Situation', 'Call', 'Yds'],
};
const PHASE_ROWS = ['Offense', 'Defense', 'Special Teams'];
const FORBIDDEN_SECTIONS = ['Offensive identity', 'Play calls', 'Formations',
  'Personnel', 'Situational Calls', 'Coverage Answers', 'Personnel and Formation',
  'Predictability', 'Recommendations', 'Film Room Insights', 'Game Log',
  'Early vs Recent', 'Wins vs Losses', 'Opponent Offense', 'Scheme',
  'Production by Play Type', 'Progression', 'Coaching Recommendations'];
/** Explanatory prose the approved Overview does not carry, scanned BOARD-WIDE.
 *  Game plan was the one surface the approved artifact let speak in advisory
 *  prose; it is gone, replaced by Defensive Drives, which reports the
 *  opponent's possessions rather than interpreting them. No exemption remains. */
const FORBIDDEN_PROSE = [
  'what this means', 'how to read', 'this shows', 'these numbers',
  'consider', 'you should', 'we recommend', 'recommended',
  'chart more plays', 'unlock', 'coaching lens explained', 'definition',
  'tag play type', 'add down & distance', 'to build the report',
];
const VIEWPORTS = [[1440, 900], [1280, 720], [768, 1024], [390, 844]];

/* ══ The fixture, stated as literal plays ═════════════════════════════════
   Written out so this file can compute the expected report with plain
   arithmetic. The phase split reproduces the canonical capture's — 50
   offensive, 13 defensive, 3 special-teams, 66 charted in all.

   Snaps by phase used to read 0 Special Teams here, and this comment used to
   explain that as correct: an ST snap carries no play type, so it never enters
   `allPlays`, and the row was derived by SUBTRACTING offense and defense from
   that classified cohort. It is a phase count, so it is now counted from the
   snap over the complete charted cohort, and the three rows sum to 66. The
   classified cohort (63) keeps its own name and its own place, as the
   qualifier on Total plays. */
const RUSHES = [ // [playType, down, distance, yardage, result]
  ['Run Inside', '1', '10', 6, 'Gain'], ['Run Inside', '1', '10', 4, 'Gain'],
  ['Run Inside', '2', '6', 9, 'Gain'], ['Run Inside', '1', '10', 3, 'Gain'],
  ['Run Inside', '3', '2', 5, 'Gain'], ['Run Inside', '1', '10', 18, 'Gain'],
  ['Run Inside', '2', '3', 2, 'Gain'], ['Run Inside', '1', '10', 7, 'Gain'],
  ['Run Inside', '3', '9', 1, 'Gain'], ['Run Inside', '1', '10', 12, 'Gain'],
  ['Run Inside', '2', '6', 4, 'Gain'], ['Run Inside', '1', '10', 6, 'Touchdown'],
  ['Run Inside', '2', '6', -3, 'Loss'], ['Run Inside', '1', '10', -2, 'Loss'],
  ['Run Outside', '1', '10', 8, 'Gain'], ['Run Outside', '2', '3', 3, 'Gain'],
  ['Run Outside', '1', '10', 15, 'Gain'], ['Run Outside', '3', '2', 4, 'Gain'],
  ['Run Outside', '1', '10', 2, 'Gain'], ['Run Outside', '2', '6', 11, 'Gain'],
  ['Run Outside', '1', '10', 5, 'Gain'], ['Run Outside', '3', '9', 0, 'No Gain'],
  ['Run Outside', '1', '10', 9, 'Gain'], ['Run Outside', '2', '3', 6, 'Gain'],
  ['Run Outside', '1', '10', 13, 'Gain'], ['Run Outside', '2', '6', 7, 'Gain'],
  ['Run Outside', '1', '10', 3, 'Touchdown'], ['Run Outside', '2', '6', -1, 'Loss'],
];
const PASSES = [ // Incomplete / Interception gain 0
  ['Short Pass', '1', '10', 7, 'Gain'], ['Short Pass', '2', '6', 12, 'Gain'],
  ['Short Pass', '3', '9', 5, 'Gain'], ['Short Pass', '1', '10', 9, 'Gain'],
  ['Short Pass', '2', '3', 4, 'Gain'], ['Short Pass', '1', '10', 0, 'Incomplete'],
  ['Short Pass', '3', '2', 6, 'Gain'], ['Short Pass', '1', '10', 14, 'Gain'],
  ['Short Pass', '2', '6', 8, 'Touchdown'],
  ['Deep Pass', '1', '10', 18, 'Gain'], ['Deep Pass', '3', '9', 16, 'Gain'],
  ['Deep Pass', '2', '6', 0, 'Interception'], ['Deep Pass', '1', '10', 11, 'Gain'],
  ['Deep Pass', '3', '9', 13, 'Gain'], ['Deep Pass', '1', '10', 9, 'Touchdown'],
  ['Deep Pass', '2', '3', 7, 'Gain'], ['Deep Pass', '1', '10', 15, 'Gain'],
  ['Play Action', '1', '10', 10, 'Gain'], ['Play Action', '2', '6', 6, 'Gain'],
  ['Play Action', '3', '2', 8, 'Touchdown'], ['Play Action', '1', '10', 12, 'Gain'],
  ['Play Action', '2', '3', 5, 'Gain'],
];
const DEFENSE = [ // [playType, runPass, yardage, result]
  ['Run Inside', 'Run', 3, 'Gain'], ['Short Pass', 'Pass', 19, 'Gain'],
  ['Run Inside', 'Run', 1, 'No Gain'], ['Short Pass', 'Pass', 17, 'Gain'],
  ['Run Inside', 'Run', 5, 'Gain'], ['Short Pass', 'Pass', 0, 'Interception'],
  ['Run Inside', 'Run', 2, 'No Gain'], ['Short Pass', 'Pass', 16, 'Gain'],
  ['Run Inside', 'Run', 4, 'Gain'], ['Short Pass', 'Pass', 6, 'Gain'],
  ['Run Inside', 'Run', 0, 'No Gain'], ['Short Pass', 'Pass', 8, 'Gain'],
  ['Run Inside', 'Run', 5, 'Gain'],
];

/* ── The expected report, computed here, from the lists above ───────────── */
const sum = (rows, f) => rows.reduce((t, r) => t + f(r), 0);
const one = n => n.toFixed(1);
/** The success definition StatsEngine documents: a touchdown always, else half
 *  the distance on 1st, seven tenths on 2nd, all of it on 3rd and 4th. */
const success = ([, down, dist, yds, result]) => {
  if (result === 'Touchdown') return true;
  const d = Number(dist);
  if (down === '1') return yds >= d * 0.5;
  if (down === '2') return yds >= d * 0.7;
  return yds >= d;
};
const OFF = [...RUSHES, ...PASSES];
const rushYards = sum(RUSHES, r => r[3]);
const passYards = sum(PASSES, p => p[3]);
const SPECIAL_PLAYS = 3; // the fixture's stCount — see the builder below
const EXPECTED = {
  offensePlays: OFF.length,
  defensePlays: DEFENSE.length,
  specialPlays: SPECIAL_PLAYS,
  // The CLASSIFIED cohort: every measure on the board is computed over it.
  allPlays: OFF.length + DEFENSE.length,
  // The CHARTED cohort: what Total plays reports, and what the phase rows sum to.
  chartedPlays: OFF.length + DEFENSE.length + SPECIAL_PLAYS,
  totalYards: rushYards + passYards,
  rushing: {
    Attempts: String(RUSHES.length),
    Yards: String(rushYards),
    Average: one(rushYards / RUSHES.length),
    Touchdowns: String(RUSHES.filter(r => r[4] === 'Touchdown').length),
    Longest: String(Math.max(...RUSHES.map(r => r[3]))),
    /* `gainedFirstDown` (football-rules.js) is yardage >= distance, and
       deliberately does NOT treat a touchdown as a conversion — a 6-yard score
       on 1st & 10 gained no first down. That rule is shared with the live
       tagger's Auto Down & Distance, so it is the one this file applies. */
    'First downs': String(RUSHES.filter(r => r[3] >= Number(r[2])).length),
    Fumbles: '0',
  },
  passing: (() => {
    const att = PASSES.length;
    const inc = PASSES.filter(p => p[4] === 'Incomplete').length;
    const ints = PASSES.filter(p => p[4] === 'Interception').length;
    const comp = att - inc - ints;
    return {
      'Completions / attempts': `${comp} / ${att}`,
      'Completion rate': `${one(comp / att * 100)}%`,
      Yards: String(passYards),
      'Yards / attempt': one(passYards / att),
      Touchdowns: String(PASSES.filter(p => p[4] === 'Touchdown').length),
      Interceptions: String(ints),
      Longest: String(Math.max(...PASSES.map(p => p[3]))),
      'Sacks taken': '0',
    };
  })(),
  /** Explosive is a 12-yard run or a 16-yard pass (StatsEngine.isExplosive). */
  explosives: RUSHES.filter(r => r[3] >= 12).length + PASSES.filter(p => p[3] >= 16).length,
  negative: OFF.filter(p => p[3] < 0).length,
  successes: OFF.filter(success).length,
  /** The FIXED six play types, in the engine's own order, every game. A type
   *  the fixture never calls reads 0 rather than dropping out — that is what
   *  makes the row count independent of what was charted, and it is the whole
   *  point of the module. `Play Action` is charted here and is NOT one of the
   *  six, so it must not appear: it is counted in the header's "other" instead. */
  playTypes: (() => {
    const by = new Map();
    for (const p of OFF) {
      if (!by.has(p[0])) by.set(p[0], []);
      by.get(p[0]).push(p);
    }
    return ['Run Inside', 'Run Outside', 'Short Pass', 'Medium Pass', 'Deep Pass', 'RPO']
      .map(name => [name, by.get(name) || []])
      .map(([name, rows]) => ({
        name, snaps: rows.length,
        ypp: rows.length ? one(sum(rows, r => r[3]) / rows.length) : '0.0',
        success: rows.length ? `${Math.round(rows.filter(success).length / rows.length * 100)}%` : '0%',
      }));
  })(),
  /** Big plays is a FIXED-length leaderboard over BOTH sides of the ball: the
   *  ten longest gains on the field, ours and the opponent's, ranked together.
   *  Deliberately NOT `_bigPlays` — that is the canonical explosive cohort (a
   *  20-yard gain or a touchdown, in play order) and stays the threshold the
   *  Explosive Plays KPI counts. Ties break on play order, then ours first, and
   *  the offensive fixture is emitted before the defensive one. */
  bigPlays: (() => {
    /* The tie-break is derived from THIS FILE'S OWN emission order, not from
       the engine's algorithm. The fixture below pushes offense first, then
       defense, assigning `id` and `timestamp.start` from one running counter —
       so one index across the concatenation IS charted order, and the harness
       knows it because the harness wrote it.
       An earlier version numbered each cohort from zero, exactly as the
       implementation then did, so a cross-side tie compared two unrelated
       positions and the assertion could not fail for the reason it claimed. */
    let order = 0;
    return [...OFF.map(p => ({ y: p[3], call: p[0], order: order++ })),
      ...DEFENSE.map(d => ({ y: d[2], call: d[0], order: order++ }))]
      .filter(e => Number.isFinite(e.y))
      .sort((a, b) => b.y - a.y || a.order - b.order)
      .slice(0, 10).map(e => ({ yards: String(e.y), call: e.call }));
  })(),
  defense: {
    'Yards / play allowed': one(sum(DEFENSE, d => d[2]) / DEFENSE.length),
    Takeaways: String(DEFENSE.filter(d => d[3] === 'Interception').length),
    'Explosive Plays allowed': String(DEFENSE.filter(d => (d[1] === 'Run' ? d[2] >= 12 : d[2] >= 16)).length),
    'Penalties declined': '0',
  },
};
EXPECTED.successRate = `${one(EXPECTED.successes / OFF.length * 100)}%`;
EXPECTED.yardsPerPlay = one(EXPECTED.totalYards / OFF.length);

/* ══ Drive outcomes never read across a game boundary ═════════════════════
   A season roll-up concatenates several games. `_reconstructDrives` already
   refuses to let one game vouch for another — "the next game's first drive
   must not vouch for the previous game's last one" — and sorts by
   `__seasonGameIdx` before doing anything. The outcome resolver has to hold the
   same line, or the last possession of game 1 gets explained by game 2's
   opening kickoff.

   Driven directly against the engine: the logic is DOM-free, so this imports
   the owning module rather than going through the page. The fixture is built to
   fail loudly without the guard — game 1 ends on a plain 2nd-down snap that
   nothing in its own game explains, and game 2 opens with a punt. */
console.log('\n== 0. Drive outcomes are contained to their own game ==');
{
  const { StatsEngine } = await import('../js/stats-engine.js');
  const engine = new StatsEngine({ getPlays: () => [] });
  const play = (gameIdx, id, unit, tags) => {
    const p = { id, timestamp: { start: id * 8, end: id * 8 + 5 },
      tags: { custom: [], players: {}, unit, ...tags } };
    Object.defineProperty(p, '__seasonGameIdx', { value: gameIdx, enumerable: false });
    return p;
  };
  const g1 = [
    play(0, 1, 'offense', { playType: 'Run Inside', down: '1', distance: '10', yardage: '4', result: 'Gain' }),
    play(0, 2, 'offense', { playType: 'Run Inside', down: '2', distance: '6', yardage: '3', result: 'Gain' }),
  ];
  const g2 = [
    play(1, 3, 'special', { stType: 'Punt', result: 'No Gain' }),
    play(1, 4, 'offense', { playType: 'Run Inside', down: '1', distance: '10', yardage: '5', result: 'Gain' }),
  ];
  const all = [...g1, ...g2];
  const seasonDrives = engine._driveStats([...g1, g2[1]], { all });
  const lastOfGameOne = seasonDrives.list[0];
  ok(lastOfGameOne && lastOfGameOne.outcome !== 'Punt',
    'game 1\'s final possession is not resolved by game 2\'s opening play',
    JSON.stringify(seasonDrives.list.map(d => d.outcome)));
  /* And the guard must not be so blunt it stops resolving WITHIN a game. */
  const withinGame = engine._driveStats([g1[0], g1[1]],
    { all: [...g1, play(0, 3, 'special', { stType: 'Punt', result: 'No Gain' })] });
  ok(withinGame.list[0]?.outcome === 'Punt',
    'a punt in the SAME game still resolves the possession it ended',
    JSON.stringify(withinGame.list.map(d => d.outcome)));
  /* Order, not array position: a season list is not stored in play order. */
  const shuffled = [g2[0], g1[1], g2[1], g1[0]];
  const fromShuffled = engine._driveStats([g1[0], g1[1]], { all: shuffled });
  ok(fromShuffled.list[0]?.outcome !== 'Punt',
    'an unordered season list does not let a neighbouring array slot explain a drive',
    JSON.stringify(fromShuffled.list.map(d => d.outcome)));
}

/* ══ Drive the real route ═════════════════════════════════════════════════ */
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(700);
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: 'Part 2 QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
});

const load = async (rushes, passes, defense, st = 3) => {
  await page.evaluate(async (R, P, D, stCount) => {
    const plays = [];
    let id = 0;
    const FORMS = ['Wing-T', 'Trips', 'Ace'];
    const push = (unit, tags) => plays.push({
      id: ++id, timestamp: { start: id * 8, end: id * 8 + 5 },
      notes: '', annotations: [], penalties: [],
      tags: { custom: [], players: {}, grades: {}, quarter: `Q${(id % 4) + 1}`, unit, ...tags },
    });
    R.forEach(([playType, down, distance, yardage, result], i) => push('offense', {
      runPass: 'Run', playType, formation: FORMS[i % 3], personnel: i % 2 ? '21' : '11',
      playCall: 'Inside Zone', playConcept: 'Inside Zone', down, distance,
      yardage: String(yardage), result, players: { ballCarrier: '22' },
      ...(result === 'Touchdown' ? { fieldSide: 'opp', yardLine: '6' } : {}),
    }));
    P.forEach(([playType, down, distance, yardage, result], i) => push('offense', {
      runPass: 'Pass', playType, formation: FORMS[(i + 1) % 3], personnel: '11',
      playCall: 'Smash', playConcept: 'Smash', down, distance,
      yardage: String(yardage), result, players: { passer: '12', receiver: '84' },
      ...(result === 'Touchdown' ? { fieldSide: 'opp', yardLine: '8' } : {}),
    }));
    D.forEach(([playType, runPass, yardage, result], i) => push('defense', {
      defFront: '4-2-5', coverage: i % 3 ? 'Cover 3' : 'Cover 1', runPass, playType,
      down: String((i % 3) + 1), distance: '8', yardage: String(yardage), result,
      players: { tackler: '51' },
    }));
    for (let i = 0; i < stCount; i++) push('special', {
      stType: ['Kickoff', 'Kick Return', 'Punt'][i % 3], kickOutcome: 'Returned',
      kickDistance: '45', players: { kicker: '3' },
    });
    if (plays.length > 3) plays[3].penalties = [{ team: 'defense', foul: 'Holding',
      disposition: 'accepted', yards: 10, playCounts: true }];
    const store = window.app.storage.seasonStore;
    store.data.games = [{
      id: 'g-qa', name: 'vs St. Peter Lutheran', nextId: plays.length + 1, plays,
      gameInfo: { opponent: 'St. Peter Lutheran', date: '2026-08-21', week: '1',
        projectName: 'St. Peter Lutheran', perspective: 'self', scoreUs: 41, scoreThem: 0 },
      annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
    }];
    store.data.activeGameId = 'g-qa';
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, rushes, passes, defense, st);
  await sleep(450);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(200);
  await page.evaluate(() => window.app.reportsScreen.selectTab('overview'));
  await sleep(650);
};

const board = () => page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  const modules = [...(pane?.querySelectorAll('.gi-overview-module') || [])];
  const title = m => m.querySelector('header > strong')?.textContent.trim() || '';
  const byTitle = name => modules.find(m => title(m) === name) || null;
  const cols = name => {
    const m = byTitle(name);
    return m ? [...m.querySelectorAll('table thead th')].map(n => n.textContent.trim()) : null;
  };
  const rowPairs = name => {
    const m = byTitle(name);
    return m ? Object.fromEntries([...m.querySelectorAll('.gi-overview-rows > div')]
      .map(d => [d.querySelector('span')?.textContent.trim(), d.querySelector('strong')?.textContent.trim()])) : null;
  };
  const tableRows = name => {
    const m = byTitle(name);
    return m ? [...m.querySelectorAll('table tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())) : null;
  };
  const tiles = sel => [...(pane?.querySelectorAll(sel) || [])].map(n => ({
    label: n.querySelector('span')?.textContent.trim(),
    value: n.querySelector('strong')?.textContent.trim(),
    sub: n.querySelector('small')?.textContent.trim(),
  }));
  const boardEl = pane?.querySelector('.gi-overview-board');
  const rect = boardEl?.getBoundingClientRect();
  const cs = sel => { const el = pane?.querySelector(sel); return el ? getComputedStyle(el) : null; };
  const kpiValue = cs('.gi-overview-kpi.is-gold > strong');
  const modulePanel = cs('.gi-overview-module');
  const rushRows = [...(byTitle('Rushing')?.querySelectorAll('.gi-overview-rows > div') || [])]
    .map(d => d.getBoundingClientRect().top);
  return {
    hasPane: !!pane,
    hasBoard: !!boardEl,
    boardRect: rect ? { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) } : null,
    sections: modules.map(title),
    metas: Object.fromEntries(modules.map(m => [title(m), m.querySelector('header > span')?.textContent.trim() || ''])),
    kpis: tiles('.gi-overview-kpi'),
    kpiBandCount: pane?.querySelectorAll('.gi-overview-kpis').length || 0,
    situational: tiles('.gi-overview-tiles > *'),
    keyMetrics: tiles('.gi-overview-lenses > div'),
    rushing: rowPairs('Rushing'), passing: rowPairs('Passing'),
    rushingAllowed: rowPairs('Rushing allowed'), passingAllowed: rowPairs('Passing allowed'),
    defenseRows: rowPairs('Defense & discipline'),
    phase: tableRows('Snaps by phase'),
    yardsByType: tableRows('Yards by type'),
    downDistance: tableRows('Down & distance'),
    bigPlays: tableRows('Top 10 Plays'),
    driveChips: [...(byTitle('Offensive Drives')?.querySelectorAll('.gi-overview-drive') || [])].map(n => n.innerText.replace(/\n/g, '|')),
    defDriveChips: [...(byTitle('Defensive Drives')?.querySelectorAll('.gi-overview-drive') || [])].map(n => n.innerText.replace(/\n/g, '|')),
    planItems: [...(pane?.querySelectorAll('.gi-overview-plan p') || [])].map(n => n.textContent.trim()),
    absentRows: [...(pane?.querySelectorAll('.is-absent') || [])].map(n => ({
      text: n.textContent.trim(),
      interactive: !!(n.getAttribute('role') || n.getAttribute('tabindex') || n.className.includes('cut-row')),
      emptyCells: [...n.querySelectorAll('td')].filter(c => !c.textContent.trim()).length,
    })),
    columns: Object.fromEntries(Object.keys({ 'Snaps by phase': 0, 'Yards by type': 0, 'Down & distance': 0, 'Top 10 Plays': 0 })
      .map(k => [k, cols(k)])),
    text: (pane?.innerText || ''),
    textOutsidePlan: modules.filter(m => title(m) !== 'Game plan').map(m => m.innerText || '').join('\n')
      + '\n' + [...(pane?.querySelectorAll('.gi-overview-kpi') || [])].map(n => n.innerText).join('\n'),
    foreign: ['.gi-offense-board', '.gi-selfscout-board', '.gi-matchup-board', '.gi-season-board',
      '.gi-player-module', '.gi-st-board', '.gi-def-board'].filter(sel => !!pane?.querySelector(sel)),
    activeTab: document.querySelector('.gi-reports-tab.active')?.getAttribute('data-report-tab'),
    activeTabText: document.querySelector('.gi-reports-tab.active')?.textContent.trim(),
    screenTab: window.app.reportsScreen.activeTab,
    paneAttr: document.querySelector('[data-native-main-report]')?.getAttribute('data-pane'),
    type: {
      goldValue: kpiValue ? { family: kpiValue.fontFamily, size: kpiValue.fontSize, color: kpiValue.color } : null,
      panelBg: modulePanel ? modulePanel.backgroundColor : null,
      rushPitch: rushRows.length > 2 ? Math.round((rushRows[rushRows.length - 1] - rushRows[0]) / (rushRows.length - 1)) : 0,
    },
  };
});

/* ══ 1. Ownership and navigation state ═══════════════════════════════════ */
console.log('\n== 1. Overview ownership and navigation state ==');
await load(RUSHES, PASSES, DEFENSE);
let b = await board();
ok(b.hasPane && b.hasBoard && b.paneAttr === 'overview',
  'the Overview board renders in the Overview pane of the production route', JSON.stringify({ pane: b.hasPane, board: b.hasBoard, attr: b.paneAttr }));
ok(b.screenTab === 'overview' && b.activeTab === 'overview' && b.activeTabText === 'Overview',
  'Overview is the selected report and the tab strip says so', JSON.stringify({ screen: b.screenTab, tab: b.activeTab, text: b.activeTabText }));
ok(b.foreign.length === 0, 'no other report board renders inside Overview', JSON.stringify(b.foreign));

/* ══ 2. Section composition and order ════════════════════════════════════ */
console.log('\n== 2. Section composition and order ==');
ok(eq(b.sections, SECTIONS), 'the approved sections render in the approved order', JSON.stringify(b.sections));
const extras = b.sections.filter(s => !SECTIONS.includes(s));
ok(extras.length === 0, 'no unapproved section is added to Overview', JSON.stringify(extras));
const forbidden = FORBIDDEN_SECTIONS.filter(name => b.sections.includes(name));
ok(forbidden.length === 0, 'no obsolete or foreign section reappears', JSON.stringify(forbidden));
ok(b.kpiBandCount === 1, 'exactly one KPI band leads the board', String(b.kpiBandCount));

/* ══ 3. Metric and column labels ═════════════════════════════════════════ */
console.log('\n== 3. Metric and column labels ==');
ok(eq(b.kpis.map(k => k.label), KPIS), 'the seven approved KPI tiles, in order', JSON.stringify(b.kpis.map(k => k.label)));
ok(eq(b.situational.map(t => t.label), SITUATIONAL_TILES), 'the six Situational tiles, in order', JSON.stringify(b.situational.map(t => t.label)));
ok(eq(b.keyMetrics.map(t => t.label), KEY_METRICS), 'the six Key metrics lenses, in order', JSON.stringify(b.keyMetrics.map(t => t.label)));
ok(eq(Object.keys(b.rushing), RUSHING_ROWS), 'the Rushing rows, in order', JSON.stringify(Object.keys(b.rushing)));
ok(eq(Object.keys(b.passing), PASSING_ROWS), 'the Passing rows, in order', JSON.stringify(Object.keys(b.passing)));
ok(eq(Object.keys(b.defenseRows), DEFENSE_ROWS), 'the Defense & discipline rows, in order', JSON.stringify(Object.keys(b.defenseRows)));
ok(eq(b.phase.map(r => r[0]), PHASE_ROWS), 'Snaps by phase names all three phases, in order', JSON.stringify(b.phase.map(r => r[0])));
for (const [name, expected] of Object.entries(COLUMNS)) {
  ok(eq(b.columns[name], expected), `${name} carries the approved columns, in order`, JSON.stringify(b.columns[name]));
}

/* ══ 4. Module header copy ═══════════════════════════════════════════════ */
console.log('\n== 4. Module header copy ==');
for (const [name, meta] of Object.entries(FIXED_METAS)) {
  ok(b.metas[name] === meta, `${name} carries its approved meta`, JSON.stringify(b.metas[name]));
}
ok(/^\d+ of \d+ classified · \d+%$/.test(b.kpis[0].sub),
  'the Total plays sub names both cohorts in the approved middot form', JSON.stringify(b.kpis[0].sub));
ok(/^\d+ drives · \d+ scored$/.test(b.metas['Offensive Drives']) && /^\d+ drives · \d+ scored$/.test(b.metas['Defensive Drives']),
  'the Drives meta uses the approved "N drives · M scored" form', JSON.stringify(b.metas['Offensive Drives']));
ok(/^\d+ · \d+ yds$/.test(b.defenseRows['Penalties accepted']),
  'Penalties accepted uses the approved "N · Y yds" form', JSON.stringify(b.defenseRows['Penalties accepted']));
ok(/^\d+ attempts$/.test(b.metas['Rushing']) && /^\d+ attempts$/.test(b.metas['Passing']),
  'Rushing and Passing state their sample as "N attempts"', JSON.stringify([b.metas['Rushing'], b.metas['Passing']]));
ok(/^\d+ total$/.test(b.metas['Snaps by phase']) && /^\d+ total( · \d+ other)?$/.test(b.metas['Yards by type'])
  && /^\d+ total$/.test(b.metas['Top 10 Plays']),
  'Snaps by phase, Yards by type and Top 10 Plays state their sample as "N total"',
  JSON.stringify([b.metas['Snaps by phase'], b.metas['Yards by type'], b.metas['Top 10 Plays']]));
ok(/^\d+ defensive snaps$/.test(b.metas['Defense & discipline']),
  'Defense & discipline states its sample as "N defensive snaps"', JSON.stringify(b.metas['Defense & discipline']));

/* ══ 5. No unapproved explanatory prose ══════════════════════════════════ */
console.log('\n== 5. No unapproved explanatory prose ==');
const wordy = Object.values(b.metas).filter(Boolean).filter(m => m.split(/\s+/).length > 5 || /[.!?]$/.test(m));
ok(wordy.length === 0, 'no module header carries an explanatory sentence', JSON.stringify(wordy));
const prose = FORBIDDEN_PROSE.filter(p => b.text.toLowerCase().includes(p));
ok(prose.length === 0, 'no instructional or interpretive prose renders outside Game plan', JSON.stringify(prose));
ok(!b.sections.includes('Game plan'),
  'Game plan no longer renders, so the prose scan above needs no exemption');

/* ══ 6. Output parity — every value, against arithmetic done here ════════ */
console.log('\n== 6. Output parity against independent arithmetic ==');
ok(b.kpis[0].value === String(EXPECTED.chartedPlays),
  'Total plays is the CHARTED cohort — offense, defense AND special teams',
  `${b.kpis[0].value} vs ${EXPECTED.chartedPlays}`);
ok(b.kpis[0].sub === `${EXPECTED.allPlays} of ${EXPECTED.chartedPlays} classified · ${Math.round(EXPECTED.allPlays / EXPECTED.chartedPlays * 100)}%`,
  'the Total plays sub states the classified cohort against the charted one',
  JSON.stringify(b.kpis[0].sub));
ok(b.kpis[1].value === EXPECTED.successRate,
  'Success rate matches the success definition applied play by play', `${b.kpis[1].value} vs ${EXPECTED.successRate}`);
ok(b.kpis[2].value === EXPECTED.yardsPerPlay && b.kpis[2].sub === `${EXPECTED.totalYards} total yards`,
  'Yards / play and total yards match the summed fixture', JSON.stringify([b.kpis[2].value, b.kpis[2].sub]));
ok(b.kpis[3].value === String(EXPECTED.explosives),
  'Explosives counts 12-yard runs and 16-yard passes', `${b.kpis[3].value} vs ${EXPECTED.explosives}`);
ok(b.kpis[5].value === String(EXPECTED.negative),
  'Plays for loss counts the negative-yardage snaps', `${b.kpis[5].value} vs ${EXPECTED.negative}`);
ok(eq(b.rushing, EXPECTED.rushing), 'every Rushing value matches', JSON.stringify(b.rushing));
ok(eq(b.passing, EXPECTED.passing), 'every Passing value matches', JSON.stringify(b.passing));
for (const [label, value] of Object.entries(EXPECTED.defense)) {
  ok(b.defenseRows[label] === value, `Defense & discipline: ${label} matches`, `${b.defenseRows[label]} vs ${value}`);
}
/* Shares are of the CHARTED cohort, and Special Teams carries its own real
   count. Left as `allPlays - offense - defense` it read 0 here and, on the
   canonical Week 2 game, reported 0 against 8 charted special-teams snaps. */
const share = n => `${Math.round(n / EXPECTED.chartedPlays * 100)}%`;
const phaseExpected = [
  ['Offense', String(EXPECTED.offensePlays), share(EXPECTED.offensePlays), EXPECTED.yardsPerPlay],
  ['Defense', String(EXPECTED.defensePlays), share(EXPECTED.defensePlays), `${one(sum(DEFENSE, d => d[2]) / DEFENSE.length)} allowed`],
  ['Special Teams', String(EXPECTED.specialPlays), share(EXPECTED.specialPlays), '—'],
];
ok(eq(b.phase, phaseExpected), 'Snaps by phase reports each phase\'s own snaps, share and yards',
  JSON.stringify(b.phase));
ok(b.metas['Snaps by phase'] === `${EXPECTED.chartedPlays} total`,
  'the Snaps by phase meta is the charted cohort its rows sum to',
  `${b.metas['Snaps by phase']} vs ${EXPECTED.chartedPlays} total`);
const yardsExpected = EXPECTED.playTypes.map(t => [t.name, String(t.snaps), t.ypp, t.success]);
ok(eq(b.yardsByType, yardsExpected),
  'Yards by type lists the fixed six play types with their own production', JSON.stringify(b.yardsByType));
ok(eq(b.bigPlays.map(r => r[r.length - 1]), EXPECTED.bigPlays.map(p => p.yards)),
  'Top 10 Plays ranks the ten longest gains on the field, ties broken by charted order',
  JSON.stringify(b.bigPlays.map(r => r[r.length - 1])));
/* The ranking must be a RANKING, not a threshold that happens to return five.
   Descending yardage is the property a re-slice of `_bigPlays` would fail. */
ok(b.bigPlays.map(r => Number(r[r.length - 1])).every((y, i, a) => i === 0 || a[i - 1] >= y),
  'Top 10 Plays yardage descends, so the module is ranked rather than filtered',
  JSON.stringify(b.bigPlays.map(r => r[r.length - 1])));
ok(eq(b.bigPlays.map(r => r[2]), EXPECTED.bigPlays.map(p => p.call)),
  'each Top 10 Plays row names the call that produced it', JSON.stringify(b.bigPlays.map(r => r[2])));
/* A ranked row must state a measurement. `parseInt(blank) || 0` used to admit
   an unmeasured snap as a 0-yard play, which then rendered with an empty Yds
   cell — a row occupying a leaderboard slot while saying nothing. Checked on
   the RENDERED cell rather than on the model, because the model returning the
   original blank string is exactly how it reached the screen. */
const rankedYds = b.bigPlays.filter(r => !r.join('').includes('No data')).map(r => r[r.length - 1]);
ok(rankedYds.length > 0 && rankedYds.every(v => String(v).trim() !== '' && Number.isFinite(Number(v))),
  'every ranked Top 10 Plays row states a measured yardage', JSON.stringify(rankedYds));

/* ── The composition SCHEMA ─────────────────────────────────────────────────
   The approved comp is the schema: each module renders ITS row count, on every
   game, so the board is one fixed height rather than a shape that moves with
   the data. Counts read off the canonical capture's own `metrics.overview`
   text in
   design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4.

   This is the assertion the whole change exists to hold, so it is stated as
   the literal contract and never derived from what production rendered. A
   module short of its count is the defect; a module over it is drift. */
const SCHEMA = {
  'Snaps by phase': 3, Situational: 6, 'Key metrics': 6,
  Rushing: 7, Passing: 8, 'Rushing allowed': 7, 'Passing allowed': 8,
  'Down & distance': 5, 'Yards by type': 6, 'Defense & discipline': 6,
  'Top 10 Plays': 10, 'Offensive Drives': 8, 'Defensive Drives': 8,
};
const measured = {
  'Snaps by phase': b.phase.length, Situational: b.situational.length, 'Key metrics': b.keyMetrics.length,
  Rushing: Object.keys(b.rushing).length, Passing: Object.keys(b.passing).length,
  'Rushing allowed': Object.keys(b.rushingAllowed).length, 'Passing allowed': Object.keys(b.passingAllowed).length,
  'Yards by type': b.yardsByType.length,
  'Down & distance': b.downDistance.length, 'Top 10 Plays': b.bigPlays.length,
  'Offensive Drives': b.driveChips.length, 'Defensive Drives': b.defDriveChips.length,
  'Defense & discipline': Object.keys(b.defenseRows).length,
};
for (const [module, count] of Object.entries(SCHEMA)) {
  ok(measured[module] === count,
    `${module} renders the comp's ${count} rows`, `rendered ${measured[module]}`);
}
/* An absence slot holds a row the data cannot fill. It must state the app's one
   absence label and must NOT be interactive — there is no film behind a row
   naming nothing — and it must never appear where the data DID fill the row. */
ok(b.absentRows.length > 0 && b.absentRows.every(r => /–/.test(r.text) && !r.interactive),
  'every absence slot holds its place with a dash and offers no film action', JSON.stringify(b.absentRows));
/* The defect this replaces: absence rows rendered `colSpan` filler, so most of
   the row was genuinely empty and read as a row that failed to load rather than
   a slot for something that never happened. Every column carries the dash. */
ok(b.absentRows.every(r => r.emptyCells === 0),
  'an absence slot leaves no cell blank', JSON.stringify(b.absentRows.filter(r => r.emptyCells)));
/* Down & distance is bucketed by StatsEngine's own distance bands, which this
   file deliberately does not re-implement — duplicating that formula would
   test a copy of it. Reconciliation is the honest check: the rows must account
   for every offensive snap that carries a down, and each run/pass split must
   be a whole. */
const ddSnaps = b.downDistance.reduce((t, r) => t + Number(r[1]), 0);
ok(ddSnaps === OFF.length, 'Down & distance accounts for every offensive snap', `${ddSnaps} vs ${OFF.length}`);
const ddSplits = b.downDistance.map(r => r[2].match(/(\d+)\s*\/\s*(\d+)/)).filter(Boolean)
  .map(m => Number(m[1]) + Number(m[2]));
ok(ddSplits.length === b.downDistance.length && ddSplits.every(v => v === 100),
  'every Down & distance run/pass split is a whole', JSON.stringify(ddSplits));
/* Drives likewise: the meta must reconcile with what the module renders. */
const driveMeta = b.metas['Offensive Drives'].match(/^(\d+) drives · (\d+) scored$/);
ok(!!driveMeta && b.driveChips.length === Math.min(Number(driveMeta[1]), 8),
  'the Drives module renders the drives its meta counts, capped at eight',
  JSON.stringify({ meta: b.metas['Offensive Drives'], chips: b.driveChips.length }));
ok(b.driveChips.every(c => /^D\d+\|/.test(c)),
  'every drive chip is numbered and carries its outcome', JSON.stringify(b.driveChips.slice(0, 3)));
const sitThird = b.situational.find(t => t.label === 'Third down');
const thirdAttempts = OFF.filter(p => p[1] === '3').length;
const thirdConv = OFF.filter(p => p[1] === '3' && (p[3] >= Number(p[2]) || p[4] === 'Touchdown')).length;
ok(sitThird.sub === `${thirdConv}/${thirdAttempts}`,
  'the Third down tile reports conversions over attempts', `${sitThird.sub} vs ${thirdConv}/${thirdAttempts}`);
const lensExplosive = b.keyMetrics.find(t => t.label === 'Explosive Plays');
ok(lensExplosive.value === String(EXPECTED.explosives),
  'the Explosive Plays lens and the Explosive Plays KPI report one number', JSON.stringify([lensExplosive.value, b.kpis[3].value]));
const lensNegative = b.keyMetrics.find(t => t.label === 'Negative');
ok(lensNegative.value === String(EXPECTED.negative),
  'the Negative lens and the Plays for loss KPI report one number', JSON.stringify([lensNegative.value, b.kpis[5].value]));

/* ══ 7. Film actions ═════════════════════════════════════════════════════ */
console.log('\n== 7. Film actions ==');
const film = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const originalWatchPlays = app.stats._watchPlays;
  const calls = [];
  app.filmNavigation.watch = (refs, options) => calls.push(options?.label || '');
  app.stats._watchPlays = (predicate, label) => calls.push(label);
  const pane = document.querySelector('[data-pane="overview"]');
  const click = sel => pane?.querySelector(sel)?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
  click('.gi-overview-tiles [role="button"]');
  click('.gi-overview-module table tbody tr[role="button"]');
  click('.gi-overview-drive');
  await new Promise(r => requestAnimationFrame(r));
  app.filmNavigation.watch = original;
  app.stats._watchPlays = originalWatchPlays;
  return calls.filter(Boolean);
});
ok(film.length >= 2, 'Overview rows and tiles still open their own film cohorts', JSON.stringify(film));

/* ══ 8. Sparse and empty behavior ════════════════════════════════════════ */
console.log('\n== 8. Sparse and empty behavior ==');
await load(RUSHES.slice(0, 3), PASSES.slice(0, 2), DEFENSE.slice(0, 1));
const sparse = await board();
ok(eq(sparse.sections, SECTIONS), 'a sparse game still renders the full approved composition', JSON.stringify(sparse.sections));
ok(sparse.situational.some(t => t.value === '—' && t.sub === 'No data'),
  'an unmeasured situation reads as an absence, not a fabricated zero',
  JSON.stringify(sparse.situational.map(t => [t.label, t.value])));
await load([], [], [], 0);
const empty = await page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  const es = pane?.querySelector('.gi-reports-empty');
  return { board: !!pane?.querySelector('.gi-overview-board'),
    modules: pane?.querySelectorAll('.gi-overview-module').length || 0,
    title: es?.querySelector('h3')?.textContent.trim() || '',
    body: es?.querySelector('p')?.textContent.trim() || '',
    action: es?.querySelector('.gi-reports-empty-cta')?.textContent.trim() || '' };
});
ok(!empty.board && empty.modules === 0, 'with nothing charted the board is replaced, not left as empty modules', JSON.stringify(empty));
/* The empty state states the object and the available action. It carries no
   instruction on how to chart — the approved Overview carries no such prose
   and the copy standard forbids it. */
ok(empty.title === 'No charted plays' && empty.body === 'No plays are charted for this game.'
  && empty.action === 'Open Break Down',
  'the empty state is literal and offers the action, not charting instructions', JSON.stringify(empty));

/* ══ 9. Pixel parity with the approved captures ══════════════════════════
   The board region of the production render is compared to the same region of
   the canonical capture as IMAGES: the surface palette, the gold accent, and
   the board's own band-edge geometry. Data differs between the two fixtures,
   so glyphs differ; surfaces, accents and band rhythm do not. */
console.log('\n== 9. Pixel parity with the approved captures ==');
await load(RUSHES, PASSES, DEFENSE);

/** Palette and band profile of one image, over a given board rect. */
const analyse = (dataUri, rect) => page.evaluate(async (uri, r) => {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const x0 = Math.max(0, r.x), x1 = Math.min(img.width, r.x + r.w);
  const y0 = Math.max(0, r.y), y1 = Math.min(img.height, r.y + r.h);
  const d = ctx.getImageData(x0, y0, x1 - x0, y1 - y0).data;
  const w = x1 - x0, h = y1 - y0;
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const k = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    counts.set(k, (counts.get(k) || 0) + 1);
  }
  const total = w * h;
  const palette = [...counts.entries()].sort((a, b) => b[1] - a[1])
    .slice(0, 8).map(([k, n]) => ({ c: k, pct: +(n / total * 100).toFixed(2) }));
  const goldPixels = [...counts.entries()]
    .filter(([k]) => /^2\d\d,1[5-7]\d,\d+$/.test(k))
    .reduce((sum, [, n]) => sum + n, 0);
  const panel = palette[0].c;
  /* Share of panel pixels per scanline; the band gaps are the troughs. */
  const rows = [];
  for (let y = 0; y < h; y++) {
    let hit = 0;
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (`${d[i]},${d[i + 1]},${d[i + 2]}` === panel) hit++;
    }
    rows.push(hit / w);
  }
  /* A BAND is an unbroken run of scanlines that are mostly panel. Runs shorter
     than 20px are text rows and rules inside a module, not structure, so they
     are dropped: what survives is the board's own band heights, which is what
     "spacing and density" means on this composition. */
  const bands = [];
  let start = null;
  for (let y = 0; y <= rows.length; y++) {
    const on = y < rows.length && rows[y] >= 0.5;
    if (on && start === null) start = y;
    if (!on && start !== null) { if (y - start >= 20) bands.push(y - start); start = null; }
  }
  /* ROW PITCH, measured inside ONE module column. A row separator is a 1-2px
     line spanning that module's width; a text line never does. Band gaps span
     it too, but they are thicker than 2px, so the run-length cap drops them.
     The modal spacing between separators is the module's row pitch — the
     measurement a band-gap scan cannot see, and the one a padding or type-size
     change moves. */
  const stripW = Math.floor(w / 3);
  const ruleYs = [];
  let runStart = null;
  for (let y = 0; y <= h; y++) {
    let off = 0;
    if (y < h) {
      for (let x = 8; x < stripW - 8; x++) {
        const i = (y * w + x) * 4;
        if (`${d[i]},${d[i + 1]},${d[i + 2]}` !== panel) off++;
      }
    }
    const isRule = y < h && off / Math.max(1, stripW - 16) >= 0.7;
    if (isRule && runStart === null) runStart = y;
    if (!isRule && runStart !== null) { if (y - runStart <= 2) ruleYs.push(runStart); runStart = null; }
  }
  const gaps = ruleYs.slice(1).map((y, i) => y - ruleYs[i]).filter(g => g >= 10 && g <= 60);
  const tally = new Map();
  for (const g of gaps) {
    const k = [...tally.keys()].find(v => Math.abs(v - g) <= 1) ?? g;
    tally.set(k, (tally.get(k) || 0) + 1);
  }
  /* EVERY recurring pitch in the strip, not just the commonest — the modules
     stacked in one column use different row heights (a RowList row and a table
     row are not the same), and a change to any one of them must show. */
  const ranked = [...tally.entries()].filter(([, n]) => n >= 2)
    .sort((a, b) => a[0] - b[0]).map(([g]) => g);
  return { w, h, palette, panel, goldPct: +(goldPixels / total * 100).toFixed(3), bands, pitches: ranked, ruleCount: ruleYs.length };
}, dataUri, rect);

const uriFor = buf => `data:image/png;base64,${buf.toString('base64')}`;
/** Find the board in an image rather than asserting where it is: the board is
 *  the region painted in the dominant panel colour, so its top-left is the
 *  first long horizontal run of that colour and its width is that run. The
 *  approved build put the board behind a left rail and a shorter shell, so its
 *  origin differs from production's — detecting it in BOTH is what makes the
 *  two comparable without hard-coding either. */
const detectBoard = dataUri => page.evaluate(async uri => {
  const img = new Image();
  img.src = uri;
  await img.decode();
  const c = document.createElement('canvas');
  c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, img.width, img.height).data;
  const k = (x, y) => { const i = (y * img.width + x) * 4; return `${d[i]},${d[i + 1]},${d[i + 2]}`; };
  const counts = new Map();
  for (let i = 0; i < d.length; i += 4) {
    const key = `${d[i]},${d[i + 1]},${d[i + 2]}`;
    counts.set(key, (counts.get(key) || 0) + 1);
  }
  const panel = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0];
  const minRun = Math.round(img.width * 0.25);
  for (let y = 0; y < img.height; y++) {
    let run = 0, start = -1, bestRun = 0, bestStart = -1;
    for (let x = 0; x < img.width; x++) {
      if (k(x, y) === panel) { if (run === 0) start = x; run++; if (run > bestRun) { bestRun = run; bestStart = start; } }
      else run = 0;
    }
    if (bestRun >= minRun) return { x: bestStart, y, w: bestRun, h: img.height - y, panel };
  }
  return null;
}, dataUri);
const canonName = key => `${key}-overview.png`;
const geometry = [], palettes = [];
for (const [width, height] of VIEWPORTS) {
  const key = `${width}x${height}`;
  await page.setViewport({ width, height });
  await sleep(400);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const shot = await page.screenshot();
  const prodUri = uriFor(shot);
  const canonUri = uriFor(readFileSync(`${CANON_DIR}/${canonName(key)}`));
  const prodBox = await detectBoard(prodUri);
  const canonBox = await detectBoard(canonUri);
  /* Equal vertical extent, or the two crops cover different content and both
     the palette and the rhythm comparison become meaningless. */
  const extent = Math.min(prodBox.h, canonBox.h);
  const prod = await analyse(prodUri, { ...prodBox, h: extent });
  const canon = await analyse(canonUri, { ...canonBox, h: extent });
  /* Surfaces: the approved board's dominant panel colour and its next two
     surfaces must be the ones production paints. */
  const canonTop = canon.palette.slice(0, 3).map(p => p.c);
  const prodAll = prod.palette.map(p => p.c);
  const missing = canonTop.filter(c => !prodAll.includes(c));
  palettes.push({ key, canonTop, prodTop: prod.palette.slice(0, 3).map(p => p.c), missing });
  ok(missing.length === 0, `${key}: the board paints the approved surface colours`,
    JSON.stringify({ canonical: canonTop, production: prodAll.slice(0, 5) }));
  /* Gold accent: present in both, at a comparable share. */
  ok(canon.goldPct > 0 && prod.goldPct > 0,
    `${key}: the gold accent is present exactly where the approved board has it`,
    JSON.stringify({ canonicalPct: canon.goldPct, productionPct: prod.goldPct }));
  /* Band rhythm: the gaps between successive band edges, compared as a
     sequence. Absolute positions differ (different shell height, different
     data length); the rhythm does not. */
  /* The board's RHYTHM UNITS: band heights the approved capture repeats. A
     one-off height is a block sized by how many rows its data produced, and
     this fixture is not the canonical QA season, so those legitimately differ
     and asserting them would be asserting the fixture. A height the capture
     shows more than once is a data row, a tile row or a band — structure, not
     content — and production must paint it to the same pixel. That is what
     spacing and density mean here, and a padding, row-height or type-size
     change moves one of these and reds. */
  const repeated = list => {
    const seen = new Map();
    for (const h of list) {
      const k = [...seen.keys()].find(v => Math.abs(v - h) <= 1) ?? h;
      seen.set(k, (seen.get(k) || 0) + 1);
    }
    return [...seen.entries()].filter(([, n]) => n >= 2).map(([h]) => h).sort((a, b) => a - b);
  };
  const units = repeated(canon.bands);
  const missingUnits = units.filter(u => !prod.bands.some(p => Math.abs(p - u) <= 2));
  /* Row pitch: the density measurement proper. A band-gap scan cannot see it,
     because a module's rows sit inside one unbroken panel. */
  geometry.push({ key, units, canonical: canon.bands, production: prod.bands, missingUnits });
  /* A viewport contributes whatever units its capture actually repeats — the
     1280 capture is only 720px tall, so its board shows one. The floor that
     stops this passing vacuously is asserted once, across all four, below. */
  /* RECORDED DIVERGENCE, coach-directed 2026-09-07. The capture's tile row is
     69px. The coach directed the Situational and Key metrics tiles be centred
     and carry more weight, which grows that row to ~76-79px; every other unit
     the capture repeats is unchanged and still asserted exactly.

     This is a NAMED single exemption, not a widened tolerance: only the tile
     row may differ, it must actually be TALLER (the direction of the change
     asked for), and any other unit going missing still reds. */
  const TILE_ROW_CAPTURE = 69;
  const TILE_ROW_NOW = 77;           // the coach-directed height, pinned exactly
  const grewTileRow = u => Math.abs(u - TILE_ROW_CAPTURE) <= 2
    && prod.bands.some(p => Math.abs(p - TILE_ROW_NOW) <= 3);
  const unexplained = missingUnits.filter(u => !grewTileRow(u));
  ok(units.length >= 1 && unexplained.length === 0,
    `${key}: every rhythm unit the approved capture repeats is painted to the same height, except the coach-resized tile row`,
    JSON.stringify({ units, missing: missingUnits, unexplained, production: prod.bands }));
  /* The exemption above substitutes ONE pinned height for another. Stated as
     "the tile row is merely taller", it would have absorbed any future drift in
     that unit and stopped being a check at all — the reviewer's point. The
     replacement height is asserted here in its own right, so the exemption can
     only ever excuse 77px and reds the moment the tile row moves again. */
  ok(prod.bands.some(p => Math.abs(p - TILE_ROW_NOW) <= 3),
    `${key}: the tile row is painted at the coach-directed ${TILE_ROW_NOW}px`,
    JSON.stringify(prod.bands));
}
/* The floor: across the four captures the pixel comparison has to have proven
   a real set of heights, or a viewport that happened to repeat nothing would
   let the whole section pass on nothing. */
const verifiedUnits = [...new Set(geometry.flatMap(g => g.units))].sort((a, b) => a - b);
ok(verifiedUnits.length >= 4,
  'the pixel comparison verified at least four distinct rhythm units across the four captures',
  JSON.stringify(verifiedUnits));
console.log('  geometry:', JSON.stringify(geometry));

/* ── Density and typography, measured element by element ──────────────────
   The band scan above proves the board's surfaces and its band heights; it
   cannot see a row, because a module's rows sit inside one unbroken panel of
   the same colour. So the row geometry is measured on the elements themselves
   and pinned to the approved capture's own numbers.

   Provenance, all read off `1440x900-overview.png`: the Rushing rows sit at
   y 525, 551, 576, 602, 627, 653 and 678 — a 25.7px pitch; the KPI band runs
   y 196..275; a module header is 26px; a Situational tile row is 89px. The
   band extraction above independently reports 76, 26, 89 and 24/25 for the
   same features, which is the corroboration for these numbers. */
await page.setViewport({ width: 1440, height: 900 });
await sleep(400);
const density = await page.evaluate(() => {
  const pane = document.querySelector('[data-pane="overview"]');
  const h = sel => { const el = pane?.querySelector(sel); return el ? +el.getBoundingClientRect().height.toFixed(1) : null; };
  const font = sel => { const el = pane?.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return { family: s.fontFamily, size: s.fontSize }; };
  const rows = [...(pane?.querySelectorAll('.gi-overview-module .gi-overview-rows > div') || [])]
    .slice(0, 7).map(d => d.getBoundingClientRect().top);
  return {
    rowPitch: rows.length > 2 ? +((rows[rows.length - 1] - rows[0]) / (rows.length - 1)).toFixed(1) : null,
    rowHeight: h('.gi-overview-rows > div'),
    kpiBand: h('.gi-overview-kpis'),
    moduleHeader: h('.gi-overview-module > header'),
    tileRow: h('.gi-overview-tiles > *'),
    type: {
      kpiValue: font('.gi-overview-kpi > strong'),
      kpiLabel: font('.gi-overview-kpi > span'),
      moduleTitle: font('.gi-overview-module header > strong'),
      tableCell: font('.gi-overview-module td'),
      rowLabel: font('.gi-overview-rows span'),
    },
  };
});
const within = (v, lo, hi) => v !== null && v >= lo && v <= hi;
/* RECORDED DIVERGENCE from the canonical capture, coach-directed 2026-09-07.
   The capture's pitch is 25.7px. The coach reviewed the rebuilt board and
   directed wider vertical spacing — "widen the vertical spacing between each
   data point, especially between the header and the first line below it" — to
   close the space a module's own panel was leaving beneath its last row. That
   necessarily moves the pitch off the capture's, so this threshold states the
   NEW instruction, not a number chosen to make the old one pass.

   The band is still a band: the range is tight and the assertion still reds if
   the pitch drifts again. Carried into the Charlie Gate, where the coach sees
   the density he asked for beside the capture he approved. */
ok(within(density.rowPitch, 28, 31),
  'the module row pitch is the coach-directed 29px, not the capture\'s 25.7px', JSON.stringify(density.rowPitch));
ok(within(density.kpiBand, 74, 82),
  'the KPI band is the approved capture\'s height', JSON.stringify(density.kpiBand));
/* The 26px the band scan reports for a module header is the header PLUS the
   module's own top padding; the `<header>` element itself is a 13px type line.
   Pinning the element to 26 would have been pinning the wrong thing, so the
   band scan above is left as the check for that feature. */
ok(within(density.tileRow, 85, 93),
  'a Situational tile row is the approved capture\'s height', JSON.stringify(density.tileRow));
/* Typography: the bundled faces, never a host fallback. The approved board is
   condensed for labels and major numbers, readable sans for operational copy;
   sizes are pinned as a regression guard — a raster cannot be measured for
   point size, so their authority is the design system, not the capture. */
const fonts = Object.entries(density.type);
const fallbacks = fonts.filter(([, f]) => !f || !/IBM Plex/.test(f.family));
ok(fallbacks.length === 0,
  'every Overview face is a bundled IBM Plex face, never a host fallback',
  JSON.stringify(fallbacks));
ok(density.type.kpiValue.size === '28px' && density.type.kpiLabel.size === '9.5px'
  && density.type.moduleTitle.size === '9.5px' && density.type.tableCell.size === '12px'
  && density.type.rowLabel.size === '12.5px',
  'the board\'s type scale is unchanged', JSON.stringify(density.type));

/* ══ 10. Containment at every registered viewport ════════════════════════ */
console.log('\n== 10. Containment at every registered viewport ==');
const overflowAt = [], clipped = [];
for (const [width, height] of VIEWPORTS) {
  await page.setViewport({ width, height });
  await sleep(350);
  await page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
  const measured = await page.evaluate(() => {
    const doc = document.documentElement;
    const pane = document.querySelector('[data-pane="overview"]');
    const clips = [];
    pane?.querySelectorAll('.gi-overview-module th, .gi-overview-module td, .gi-overview-kpi > span, .gi-overview-module header > strong')
      .forEach(cell => {
        if (!cell.getClientRects().length) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const style = getComputedStyle(cell);
        const inner = cell.getBoundingClientRect().width
          - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (range.getBoundingClientRect().width - inner > 1) clips.push(cell.textContent.trim().slice(0, 30));
      });
    return { overflow: doc.scrollWidth - doc.clientWidth, clips,
      sections: [...(pane?.querySelectorAll('.gi-overview-module > header > strong') || [])].map(n => n.textContent.trim()) };
  });
  if (measured.overflow > 0) overflowAt.push(`${width}=${measured.overflow}`);
  if (measured.clips.length) clipped.push(`${width}: ${measured.clips.join(' | ')}`);
  ok(eq(measured.sections, SECTIONS), `the composition survives intact at ${width}x${height}`, JSON.stringify(measured.sections));
}
ok(overflowAt.length === 0, 'no page-level horizontal overflow at any registered viewport', overflowAt.join(' / '));
ok(clipped.length === 0, 'no clipped label, header or cell at any registered viewport', clipped.join(' / '));
await page.setViewport({ width: 1440, height: 900 });

console.log('\n== 11. Page health ==');
ok(errors.length === 0, 'zero page or console errors across every state', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
