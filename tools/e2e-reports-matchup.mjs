/**
 * Reports > Matchup — the approved 2026-09-06 desktop composition, the
 * situational join it rests on, and the film contract that keeps the two
 * cohorts separate.
 *
 * Comp and decision record: design-comps/reports-matchup-2026-09-06
 * (`matchup.html`, `RATIONALE.md`).
 *
 * Every assertion drives the real route and reads the rendered result or the
 * engine's own output. None of it searches source text: a test that greps a
 * selector passes against a file that never renders. Where a test is about
 * column geometry it measures the rendered cell against its own content box,
 * because `table-layout:fixed` overflows silently rather than growing.
 *
 * The fixture is deliberate. The opponent's film is a SCOUT game and our own
 * season is two self games against other opponents, so the two film cohorts
 * are genuinely disjoint and the disjointness assertion measures something.
 * Every count, rate, ranking and tie below is reproducible by hand from the
 * play list.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { mkdir } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));
/* DEFERRED TYPE FLOOR. `docs/VISUAL-SYSTEM-RULES.md` sets 12.5px as the shared
   coach-facing floor. This board has NOT been migrated to it: raising its labels
   means re-deriving the fixed row math its approved comp pins, so the migration
   is open work in `docs/OPEN-DEFECTS.md`. THIS HARNESS RUNS A SYNTHETIC
   FIXTURE, so it cannot establish the value -- `CLAUDE.md` is explicit that
   synthetic data cannot establish Reports visual parity. The number below is
   measured on the canonical season by `tools/e2e-reports-typefloor-realdata.mjs`
   and mirrored here as a same-fixture regression guard only. The
   canonical minimum for this board is 11px. Pinning it here means the board
   cannot drift further from the floor while it waits, and the number moves only
   when the migration moves it -- it is a deferral, not a second standard. */
const MATCHUP_TYPE_FLOOR = 12.5;


const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Matchup QA', team: 'Mavericks', year: '2026', level: 'JV' });
});

const off = t => ({ unit: 'offense', ...t });
const def = t => ({ unit: 'defense', ...t });
const rep = (n, fn) => Array.from({ length: n }, (_, i) => fn(i));

/* ── St. Mary Falcons, charted directly as opponent scout film ────────────
   Their DEFENSE. 1st Down carries two structured calls plus two snaps with
   no defensive structure at all: those must never become a `No Blitz` call
   and must never enter the Rate denominator. 3rd & 1-3 ties two calls at two
   snaps each, so the count-then-name tie-break is exercised, not assumed. */
const SCOUT_DEFENSE = [
  ...rep(6, () => def({ defFront: '4-2-5', coverage: 'Cover 3', runPass: 'Run', playType: 'Run Inside',
    result: 'Gain', yardage: '4', down: '1', distance: '10' })),
  ...rep(3, () => def({ defFront: 'Odd', coverage: 'Cover 1', blitz: 'Mike', runPass: 'Pass', playType: 'Quick Pass',
    result: 'Gain', yardage: '6', down: '1', distance: '10' })),
  ...rep(2, () => def({ runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '3', down: '1', distance: '10' })),
  ...rep(4, () => def({ defFront: '3-3-5', coverage: 'Cover 2', runPass: 'Pass', playType: 'Quick Pass',
    result: 'No Gain', yardage: '1', down: '2', distance: '9' })),
  ...rep(3, () => def({ runPass: 'Pass', playType: 'Quick Pass', result: 'Gain', yardage: '9', down: '2', distance: '9' })),
  ...rep(2, () => def({ defFront: 'Bear', coverage: 'Cover 0', blitz: 'Edge', runPass: 'Run', playType: 'Run Inside',
    result: 'No Gain', yardage: '0', down: '3', distance: '2' })),
  ...rep(2, () => def({ defFront: 'Apex', coverage: 'Cover 0', blitz: 'Edge', runPass: 'Run', playType: 'Run Inside',
    result: 'Gain', yardage: '3', down: '3', distance: '2' })),
  ...rep(3, () => def({ defFront: 'Bear', coverage: 'Cover 6', blitz: 'Field', runPass: 'Pass', playType: 'Deep Pass',
    result: 'Incomplete', yardage: '0', down: '3', distance: '9' })),
  /* A DEFENSIVE red-zone rep is charted at the defense's OWN 8: on a defensive
     snap the offense is attacking that goal line. Charted `opp 8` the ball is on
     the offense's own 8, which is the opponent backed up, not the red zone. */
  ...rep(4, () => def({ defFront: '4-4', coverage: 'Cover 1', runPass: 'Run', playType: 'Run Outside',
    result: 'Gain', yardage: '3', down: '2', distance: '4', fieldSide: 'own', yardLine: '8' })),
];
/* Their OFFENSE, charted on the same scout film. */
const SCOUT_OFFENSE = [
  ...rep(6, () => off({ personnel: '21', formationFamily: 'Pro I', playCall: 'Inside Zone', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: '5', down: '1', distance: '10' })),
  ...rep(3, () => off({ personnel: '11', formationFamily: 'Spread', playCall: 'Quick Game', runPass: 'Pass',
    playType: 'Quick Pass', result: 'Gain', yardage: '6', down: '1', distance: '10' })),
  ...rep(3, () => off({ personnel: '11', formationFamily: 'Doubles', playCall: 'Mesh', runPass: 'Pass',
    playType: 'Short Pass', result: 'Gain', yardage: '7', down: '2', distance: '8' })),
  ...rep(2, () => off({ personnel: '22', formationFamily: 'Pro I', playCall: 'Power', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: '3', down: '3', distance: '2' })),
  ...rep(2, () => off({ personnel: '10', formationFamily: 'Empty', playCall: 'Four Verts', runPass: 'Pass',
    playType: 'Deep Pass', result: 'Gain', yardage: '12', down: '3', distance: '9' })),
  ...rep(3, () => off({ personnel: '12', formationFamily: 'Wing-T', playCall: 'Buck Sweep', runPass: 'Run',
    playType: 'Run Outside', result: 'Gain', yardage: '4', down: '2', distance: '4', fieldSide: 'opp', yardLine: '8' })),
];

/* ── Our own season. Two self games against OTHER opponents, so nothing here
   can also be St. Mary's film and the two ref cohorts stay disjoint. Every
   offensive snap carries the defense we faced; every defensive snap carries
   the offense we faced. */
const SEASON_OFFENSE = [
  ...rep(5, i => off({ formationFamily: 'Spread', personnel: '11', playCall: 'Inside Zone', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: ['3', '5', '7', '9', '13'][i], down: '1', distance: '10',
    defFront: '4-2-5', coverage: 'Cover 3' })),
  ...rep(3, () => off({ formationFamily: 'Doubles', personnel: '11', playCall: 'Stick', runPass: 'Pass',
    playType: 'Quick Pass', result: 'Gain', yardage: '5', down: '1', distance: '10',
    defFront: '4-2-5', coverage: 'Cover 3' })),
  /* The SAME front and coverage, but blitzed: a displayed `No Blitz` must
     never admit these. */
  ...rep(2, () => off({ formationFamily: 'Spread', personnel: '11', playCall: 'Inside Zone', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: '9', down: '1', distance: '10',
    defFront: '4-2-5', coverage: 'Cover 3', blitz: 'Mike' })),
  ...rep(4, i => off({ formationFamily: 'Spread', personnel: '11', playCall: 'Mesh', runPass: 'Pass',
    playType: 'Short Pass', result: 'Gain', yardage: i < 2 ? '8' : '3', down: '2', distance: '9',
    defFront: '3-3-5', coverage: 'Cover 2' })),
  ...rep(3, () => off({ formationFamily: 'Pro I', personnel: '21', playCall: 'Power', runPass: 'Run',
    playType: 'Run Inside', result: 'Gain', yardage: '3', down: '3', distance: '2',
    defFront: 'Apex', coverage: 'Cover 0', blitz: 'Edge' })),
  /* 3rd & 7+ exists in our season, but never against Bear | Cover 6 | Field. */
  ...rep(3, () => off({ formationFamily: 'Empty', personnel: '10', playCall: 'Verts', runPass: 'Pass',
    playType: 'Deep Pass', result: 'Gain', yardage: '11', down: '3', distance: '10',
    defFront: 'Nickel', coverage: 'Cover 3', blitz: 'Sam' })),
  ...rep(3, () => off({ formationFamily: 'Wing-T', personnel: '12', playCall: 'Buck Sweep', runPass: 'Run',
    playType: 'Run Outside', result: 'Gain', yardage: '4', down: '2', distance: '4',
    fieldSide: 'opp', yardLine: '8', defFront: '4-4', coverage: 'Cover 1' })),
];
const SEASON_DEFENSE = [
  ...rep(5, i => def({ defFront: '4-4', coverage: 'Cover 3', personnel: '21', formationFamily: 'Pro I',
    playCall: 'Inside Zone', runPass: 'Run', playType: 'Run Inside',
    result: i === 4 ? 'Gain' : 'No Gain', yardage: i === 4 ? '7' : '2', down: '1', distance: '10' })),
  ...rep(2, () => def({ defFront: 'Nickel', coverage: 'Cover 1', blitz: 'Sam', personnel: '21', formationFamily: 'Pro I',
    playCall: 'Inside Zone', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6',
    down: '1', distance: '10' })),
  ...rep(4, () => def({ defFront: 'Nickel', coverage: 'Cover 1', blitz: 'Sam', personnel: '11', formationFamily: 'Doubles',
    playCall: 'Mesh', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '5',
    down: '2', distance: '8' })),
  ...rep(3, () => def({ defFront: 'Bear', coverage: 'Cover 0', blitz: 'Mike', personnel: '22', formationFamily: 'Pro I',
    playCall: 'Power', runPass: 'Run', playType: 'Run Inside', result: 'No Gain', yardage: '1',
    down: '3', distance: '2' })),
  /* 3rd & 7+ exists, but never against 10 | Empty | Four Verts. */
  ...rep(3, () => def({ defFront: 'Nickel', coverage: 'Cover 3', personnel: '10', formationFamily: 'Empty',
    playCall: 'Smash', runPass: 'Pass', playType: 'Deep Pass', result: 'Gain', yardage: '9',
    down: '3', distance: '9' })),
  /* Our own red-zone defensive reps: their offense on OUR 8. */
  ...rep(3, () => def({ defFront: '4-4', coverage: 'Cover 1', personnel: '12', formationFamily: 'Wing-T',
    playCall: 'Buck Sweep', runPass: 'Run', playType: 'Run Outside', result: 'No Gain', yardage: '2',
    down: '2', distance: '4', fieldSide: 'own', yardLine: '8' })),
];

const game = (id, opponent, perspective, plays, week) => ({
  id, name: `${perspective === 'scout' ? 'Scout' : `Week ${week}`} vs ${opponent}`,
  nextId: plays.length + 1,
  /* `__penalties` on a fixture row becomes the play's own `penalties` list --
     a penalty lives on the PLAY, not in its tags. */
  plays: plays.map(({ __penalties, ...row }, i) => ({ id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 },
    notes: '', annotations: [], penalties: __penalties || [],
    tags: { custom: [], players: {}, grades: {}, quarter: 'Q1', ...row } })),
  gameInfo: { opponent, date: `2026-09-0${week || 1}`, week: String(week || 1), projectName: opponent,
    perspective, scoreUs: 21, scoreThem: 14 },
  annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
});

const FULL = () => [
  game('g1', 'Northgate', 'self', [...SEASON_OFFENSE, ...SEASON_DEFENSE], 1),
  game('g2', 'East Ridge', 'self', [...SEASON_OFFENSE.slice(0, 6), ...SEASON_DEFENSE.slice(0, 6)], 2),
  game('scout-sm', 'St. Mary Falcons', 'scout', [...SCOUT_DEFENSE, ...SCOUT_OFFENSE], 3),
];
/* Partial: the opponent's DEFENSE is charted and their offense is not. */
const PARTIAL = () => [
  game('g1', 'Northgate', 'self', [...SEASON_OFFENSE, ...SEASON_DEFENSE], 1),
  game('scout-hc', 'Holy Cross', 'scout', [...SCOUT_DEFENSE], 3),
];
/* ── The join's edges, isolated so every figure below is hand-checkable ────
   A nullified penalty snap, a call charted only as a CONCEPT, the same
   multi-select front charted in two selection orders, and four cohorts whose
   contributing game counts genuinely differ. Nothing here shares a fixture
   with the populated board, so each expected number stands alone. */
const EDGE = () => [
  game('e-both', 'Northgate', 'self', [
    /* Our answer to their `4-2-5 + Nickel`, charted in the OTHER order. */
    ...rep(3, () => off({ formationFamily: 'Spread', personnel: '11', playCall: 'Inside Zone', playConcept: 'Zone',
      runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', distance: '10',
      defFront: 'Nickel + 4-2-5', coverage: 'Cover 3' })),
    ...rep(2, () => off({ formationFamily: 'Spread', personnel: '11', playCall: 'Verts', runPass: 'Pass',
      playType: 'Deep Pass', result: 'Gain', yardage: '9', down: '3', distance: '9',
      defFront: 'Bear', coverage: 'Cover 6' })),
    /* Our answer to a concept-only opponent call: these carry BOTH a play call
       and that concept, so a matcher that re-derives `playCall || playConcept`
       misses them entirely. */
    ...rep(3, () => def({ defFront: '4-4', coverage: 'Cover 3', personnel: '11', formationFamily: 'Spread',
      playCall: 'Inside Zone', playConcept: 'Zone', runPass: 'Run', playType: 'Run Inside',
      result: 'No Gain', yardage: '2', down: '1', distance: '10' })),
  ], 1),
  /* Charted on OFFENSE only: it contributes to the offensive sample and must
     not appear in the defensive one. */
  game('e-off', 'Northgate', 'self', rep(3, () => off({ formationFamily: 'I-Form', personnel: '12', playCall: 'Power',
    runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '5', down: '1', distance: '10',
    defFront: 'Odd', coverage: 'Cover 1' })), 2),
  /* Their DEFENSE only. The same front is charted in both selection orders,
     and one Deep Pass snap is nullified by an accepted penalty. */
  game('e-scout-def', 'Riverside', 'scout', [
    ...rep(2, () => def({ defFront: '4-2-5 + Nickel', coverage: 'Cover 3', runPass: 'Run',
      playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' })),
    ...rep(2, () => def({ defFront: 'Nickel + 4-2-5', coverage: 'Cover 3', runPass: 'Run',
      playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' })),
    def({ defFront: 'Bear', coverage: 'Cover 6', runPass: 'Pass', playType: 'Deep Pass',
      result: 'Gain', yardage: '2', down: '3', distance: '9' }),
    def({ defFront: 'Bear', coverage: 'Cover 6', runPass: 'Pass', playType: 'Deep Pass',
      result: 'Gain', yardage: '99', down: '3', distance: '9',
      __penalties: [{ team: 'defense', foul: 'Pass Interference', disposition: 'accepted',
        yards: 15, playCounts: false }] }),
  ], 3),
  /* Their OFFENSE only, and their call is charted as a CONCEPT with no play
     call at all. */
  game('e-scout-off', 'Riverside', 'scout', rep(3, () => off({ personnel: '11', formationFamily: 'Spread',
    playConcept: 'Zone', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '5',
    down: '1', distance: '10' })), 4),
];
/* Empty: our own film only, with no defensive structure and no opponent film,
   so no opponent unit exists at all. */
const EMPTY = () => [
  game('g1', 'Northgate', 'self', SEASON_OFFENSE.map(play => {
    const copy = { ...play };
    delete copy.defFront; delete copy.coverage; delete copy.blitz;
    return copy;
  }), 1),
];

const load = async (games, opponent = '', activeId = 'g1') => {
  await page.evaluate(async (list, active) => {
    const store = window.app.storage.seasonStore;
    store.data.games = list;
    store.data.activeGameId = active;
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, games, activeId);
  await sleep(400);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(200);
  await page.evaluate(name => {
    window.app.reportsScreen.matchupOpponent = name;
    window.app.reportsScreen.matchupTab = 'our-offense';
  }, opponent);
  await page.evaluate(() => window.app.reportsScreen.selectTab('matchup'));
  await sleep(600);
};
const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const setDirection = async label => {
  await page.evaluate(text => [...document.querySelectorAll('[data-reports-secbar] .gi-mu-directions button')]
    .find(b => b.textContent.trim() === text)?.click(), label);
  await sleep(350);
};
const model = () => page.evaluate(() => window.app.stats.matchupReport(window.app.reportsScreen.matchupOpponent));
const rows = selector => page.evaluate(sel => [...document.querySelectorAll(`${sel} tbody tr`)]
  .map(tr => [...tr.children].map(td => td.textContent.trim())), selector);

const SECTIONS = ['Situational Calls', 'Production by Play Type'];
const SITUATIONS = ['1st Down', '2nd & 7+', '3rd & 1-3', '3rd & 7+', 'Red Zone'];

/* ══ 1. The approved composition ══════════════════════════════════════════ */
console.log('\n== 1. The approved composition ==');
await load(FULL(), 'St. Mary Falcons');
const comp = await page.evaluate(() => {
  const board = document.querySelector('.gi-matchup-board');
  const report = document.querySelector('.gi-mu-report');
  const row = document.querySelector('table.gi-mu-decision tbody td');
  const head = document.querySelector('table.gi-mu-decision thead th');
  const style = row && getComputedStyle(row);
  return {
    board: !!board, report: !!report,
    capped: report ? Math.round(report.getBoundingClientRect().width) : 0,
    padding: board ? getComputedStyle(board).paddingLeft : '',
    tabs: [...document.querySelectorAll('[data-reports-secbar] .gi-mu-directions button')].map(b => b.textContent.trim()),
    panes: document.querySelectorAll('.gi-mu-pane').length,
    sections: [...document.querySelectorAll('.gi-mu-title h2')].map(h => h.textContent.trim()),
    units: [...document.querySelectorAll('.gi-mu-unit strong')].map(u => u.textContent.trim()),
    kpiStrip: document.querySelectorAll('.gi-matchup-board .gi-overview-kpis, .gi-matchup-board .gi-overview-kpi').length,
    rowHeight: row ? Math.round(row.getBoundingClientRect().height) : 0,
    bodyFont: style ? parseFloat(style.fontSize) : 0,
    headFont: head ? parseFloat(getComputedStyle(head).fontSize) : 0,
    fixed: row ? getComputedStyle(row.closest('table')).tableLayout : '',
    colgroup: document.querySelectorAll('table.gi-mu-decision col').length,
    sticky: head ? getComputedStyle(head).position : '',
    sharedRail: !!document.querySelector('[data-reports-rail], .gi-reports-rail'),
    sharedBug: !document.querySelector('[data-reports-scorebug]')?.hidden,
    sharedTitle: document.querySelector('[data-reports-title]')?.textContent.trim(),
    sharedContext: document.querySelector('[data-reports-context]')?.textContent.trim(),
  };
});
ok(comp.board && comp.report, 'the Matchup board renders its own report canvas', JSON.stringify(comp));
ok(comp.padding === '0px' && comp.capped > 0 && comp.capped <= 1648,
  'the report canvas is capped and the board carries no padding of its own', JSON.stringify(comp));
ok(comp.tabs.length === 2 && comp.tabs[0] === 'Our Offense vs Their Defense'
  && comp.tabs[1] === 'Our Defense vs Their Offense',
  'both matchup directions are offered, named exactly as the comp names them', JSON.stringify(comp.tabs));
ok(comp.panes === 1, 'exactly one direction is on screen at a time', String(comp.panes));
ok(JSON.stringify(comp.sections) === JSON.stringify([...SECTIONS, 'Coverages']),
  'the offense-facing tab renders Situational Calls, Production by Play Type and Coverages',
  JSON.stringify(comp.sections));
ok(comp.units.length === 2 && comp.units[0] === 'Our Offense' && comp.units[1] === 'St. Mary Falcons Defense',
  'the lane names its two independent cohorts', JSON.stringify(comp.units));
ok(comp.kpiStrip === 0, 'no broad KPI strip is rendered', String(comp.kpiStrip));
ok(!comp.sharedRail && !comp.sharedBug && comp.sharedTitle === 'Matchup: St. Mary Falcons'
  && comp.sharedContext === 'Season film and opponent film',
  'Matchup never sits beneath current-game shared chrome', JSON.stringify(comp));
ok(comp.rowHeight === 40 && comp.bodyFont >= MATCHUP_TYPE_FLOOR && comp.headFont >= MATCHUP_TYPE_FLOOR,
  `body rows are 40px and the board holds the shared ${MATCHUP_TYPE_FLOOR}px coach-facing floor`,
  JSON.stringify(comp));
ok(comp.fixed === 'fixed' && comp.colgroup === 9,
  'the situational table owns its column geometry through a colgroup', JSON.stringify(comp));
ok(comp.sticky === 'relative',
  'the table headers opt out of the route-wide sticky rule', comp.sticky);

/* ══ 2. Opponent selection ════════════════════════════════════════════════ */
console.log('\n== 2. Opponent selection ==');
const picker = await page.evaluate(() => {
  const select = document.querySelector('#gi-mu-opponent');
  return { options: [...select.options].map(o => o.value), value: select.value };
});
ok(picker.value === 'St. Mary Falcons' && picker.options.includes('Northgate') && picker.options.includes('East Ridge'),
  'the opponent selector names every opponent with charted film and shows the selected one', JSON.stringify(picker));
await page.select('#gi-mu-opponent', 'Northgate');
await sleep(500);
const switched = await page.evaluate(() => ({
  screen: window.app.reportsScreen.matchupOpponent,
  unit: document.querySelector('.gi-mu-unit.is-opp strong')?.textContent.trim(),
  sample: document.querySelector('.gi-mu-sample strong')?.textContent.trim(),
}));
ok(switched.screen === 'Northgate' && switched.unit === 'Northgate Defense',
  'selecting an opponent re-reports the board against that opponent', JSON.stringify(switched));
await page.select('#gi-mu-opponent', 'St. Mary Falcons');
await sleep(500);

/* ══ 3. Both matchup directions ═══════════════════════════════════════════ */
console.log('\n== 3. Both matchup directions ==');
await setDirection('Our Defense vs Their Offense');
const defended = await page.evaluate(() => ({
  sections: [...document.querySelectorAll('.gi-mu-title h2')].map(h => h.textContent.trim()),
  units: [...document.querySelectorAll('.gi-mu-unit strong')].map(u => u.textContent.trim()),
  screen: window.app.reportsScreen.matchupTab,
}));
ok(JSON.stringify(defended.sections) === JSON.stringify([...SECTIONS, 'Personnel and Formation']),
  'the defense-facing tab renders Situational Calls, Production by Play Type and Personnel and Formation',
  JSON.stringify(defended.sections));
ok(defended.units[0] === 'Our Defense' && defended.units[1] === 'St. Mary Falcons Offense',
  'the defense-facing lane names our defense against their offense', JSON.stringify(defended.units));
/* The direction is controller state: an ordinary Reports re-render must not
   discard it, the same correction Players and Self-Scout both needed. */
await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
await sleep(400);
const held = await page.evaluate(() => document.querySelector('[data-reports-secbar] .gi-mu-directions button.active')?.textContent.trim());
ok(defended.screen === 'our-defense' && held === 'Our Defense vs Their Offense',
  'the selected direction survives an ordinary Reports re-render', `${defended.screen} / ${held}`);
await setDirection('Our Offense vs Their Defense');

/* ══ 4. The five situation definitions ════════════════════════════════════ */
console.log('\n== 4. The five situation definitions ==');
const situationRows = await rows('table.gi-mu-decision');
ok(JSON.stringify(situationRows.map(r => r[0])) === JSON.stringify(SITUATIONS),
  'exactly the five fixed situations render, in the approved order', JSON.stringify(situationRows.map(r => r[0])));
/* Rows overlap by design. A red-zone third down belongs to BOTH cohorts, and
   the engine's own situation predicates must say so. */
const overlap = await page.evaluate(() => {
  const engine = window.app.stats;
  const play = { tags: { down: '3', distance: '2', fieldSide: 'opp', yardLine: '6' } };
  const specs = engine._matchupSituations();
  return specs.filter(spec => spec.match(play)).map(spec => spec.label);
});
ok(overlap.includes('3rd & 1-3') && overlap.includes('Red Zone'),
  'a red-zone third down belongs to both its down-and-distance cohort and Red Zone', JSON.stringify(overlap));
/* THE RED ZONE IS READ FROM THE PERSPECTIVE THE SNAP WAS CHARTED IN. One lane
   always holds a defensive cohort, where the offense attacks our goal line, so a
   single `>= 80` threshold measured the wrong end of the field on that side. */
const redZoneSides = await page.evaluate(() => {
  const engine = window.app.stats;
  const spec = engine._matchupSituations().find(item => item.key === 'red-zone');
  const snap = (unit, fieldSide, chartedUnit) => ({
    tags: { unit, down: '2', distance: '4', fieldSide, yardLine: '8' },
    ...(chartedUnit ? { __chartedUnit: chartedUnit } : {}),
  });
  const lane = engine.matchupReport('St. Mary Falcons').defense;
  const row = lane.situations.find(item => item.key === 'red-zone');
  return {
    predicates: [spec.match(snap('defense', 'own')), spec.match(snap('defense', 'opp')),
      spec.match(snap('offense', 'opp')), spec.match(snap('offense', 'own')),
      spec.match(snap('offense', 'own', 'defense'))],
    opponent: row?.opponent ? { n: row.opponent.n, label: row.opponent.label } : null,
    season: row?.season ? { label: row.season.label, n: row.season.n } : null,
  };
});
ok(JSON.stringify(redZoneSides.predicates) === JSON.stringify([true, false, true, false, true]),
  'a defensive snap on our own 8 is a red-zone rep and one on the opponent 8 is not; an offensive snap is the mirror',
  JSON.stringify(redZoneSides.predicates));
/* A defensive lane measures OUR defense, so a touchdown we scored is a stop on
   this board too — `defensiveCohortMetrics` is the owner both surfaces read. */
const laneScoringSide = await page.evaluate(() => {
  const engine = window.app.stats;
  const snap = (id, tags) => ({ id, __gid: 'm', tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags } });
  const cohort = [
    snap(1, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '2', result: 'Gain', yardLine: '12', fieldSide: 'own' }),
    snap(2, { down: '3', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception + Touchdown', yardLine: '10', fieldSide: 'own', players: { takeaway: '22' } }),
  ];
  const allowed = [cohort[0], snap(2, { down: '3', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '10', result: 'Touchdown', yardLine: '10', fieldSide: 'own' })];
  // Head-to-head film supplies THEIR defense by cross-reading OUR offensive
  // snap. The relabel changes tags.unit, while __chartedUnit keeps score and
  // field ownership anchored to the offense the coach actually charted.
  const crossRead = snap(3, { down: '1', distance: '10', runPass: 'Pass', playType: 'Deep Pass', yardage: '20',
    result: 'Touchdown', yardLine: '20', fieldSide: 'opp' });
  crossRead.__chartedUnit = 'offense';
  return { ours: engine._matchupDefenseMetrics(cohort), theirs: engine._matchupDefenseMetrics(allowed),
    opponentDefense: engine.defensiveCohortMetrics([crossRead]),
    crossReadSide: engine.constructor.scoringSide(crossRead) };
});
ok(laneScoringSide.ours.stopRate === 100 && laneScoringSide.theirs.stopRate === 50,
  'a defensive lane counts our pick-six as a stop and an opponent touchdown on the same snap as their success',
  JSON.stringify(laneScoringSide));
ok(laneScoringSide.opponentDefense.stopRate === 0 && laneScoringSide.opponentDefense.touchdowns === 1
  && laneScoringSide.crossReadSide === 'us',
  'an offense-origin touchdown cross-read as opponent defense remains our score and their touchdown allowed',
  JSON.stringify(laneScoringSide));
ok(redZoneSides.opponent?.n === 3 && redZoneSides.opponent?.label === '12 | Wing-T | Buck Sweep'
  && redZoneSides.season?.label === '4-4 | Cover 1 | No Blitz' && redZoneSides.season?.n === 3,
  'Our Defense vs Their Offense joins their red-zone offense with our own red-zone defensive reps',
  JSON.stringify(redZoneSides));

/* ══ 5. Ranking, tie-breaking and the Rate denominator ════════════════════ */
console.log('\n== 5. Ranking, tie-breaking and the Rate denominator ==');
const lane = (await model()).offense;
const first = lane.situations[0], short = lane.situations[2];
/* 1st Down: six `4-2-5 | Cover 3` snaps and three `Odd | Cover 1 | Mike`
   snaps carry a call; two more carry no defensive structure at all. Rate is
   6/9 = 67%, never 6/11 -- a snap that can never reach the numerator must
   not sit in the denominator. */
ok(first.opponent.label === '4-2-5 | Cover 3 | No Blitz' && first.opponent.n === 6,
  'the opponent row is their most frequently charted call in the situation', JSON.stringify(first.opponent));
ok(first.opponent.eligible === 9 && situationRows[0][2] === '67%',
  'Rate is the call\'s share of ELIGIBLE opponent snaps in that situation', JSON.stringify(first.opponent));
/* 3rd & 1-3 ties `Apex | Cover 0 | Edge` and `Bear | Cover 0 | Edge` at two
   snaps each. Count descending, then displayed name ascending: Apex wins. */
ok(short.opponent.label === 'Apex | Cover 0 | Edge' && short.opponent.n === 2,
  'a frequency tie breaks deterministically on the displayed call name', JSON.stringify(short.opponent));
ok(situationRows[2][2] === '50%', 'the tied call reports its own share, 2 of 4', situationRows[2][2]);

/* ══ 6. The season-side join is exact ═════════════════════════════════════ */
console.log('\n== 6. The season-side join is exact ==');
/* Ten season snaps are 1st Down against `4-2-5 | Cover 3` with no blitz --
   five per game, gaining 3, 5, 7, 9 and 13. 74 yards / 10 = 7.4, and eight
   of the ten reach half the distance to go, so Success is 80%. The two
   snaps against the SAME front and coverage that were blitzed are excluded. */
ok(first.season.label === 'Spread | Inside Zone' && first.season.n === 10,
  'the season answer is our most frequently charted formation and call against that exact look',
  JSON.stringify(first.season));
ok(first.season.yardsPerPlay === 7.4 && first.season.successRate === 80,
  'the season metrics are measured over the exact displayed call cohort', JSON.stringify(first.season));
ok(!first.season.refs.some(ref => ref === 'g1::9' || ref === 'g1::10'),
  'a blitzed snap never satisfies a displayed No Blitz call', JSON.stringify(first.season.refs));
ok(situationRows[0][4] === 'Spread | Inside Zone' && situationRows[0][5] === '10'
  && situationRows[0][6] === '7.4' && situationRows[0][7] === '80%',
  'the rendered row prints exactly what the engine measured', JSON.stringify(situationRows[0]));

/* ══ 7. No matching snaps, never a fabricated zero ════════════════════════ */
console.log('\n== 7. No matching snaps ==');
const long = lane.situations[3];
ok(long.opponent && long.season === null,
  'an opponent call our season never faced produces no season join', JSON.stringify(long));
ok(situationRows[3][4] === 'No matching snaps'
  && situationRows[3][5] === '' && situationRows[3][6] === '' && situationRows[3][7] === '',
  'a missing season cohort renders No matching snaps and no fabricated values', JSON.stringify(situationRows[3]));
const absentClass = await page.evaluate(() => document.querySelectorAll('table.gi-mu-decision td.gi-mu-absent').length);
ok(absentClass === 1, 'the absence drops to copy weight rather than reading as a value', String(absentClass));

/* ══ 8. No Blitz versus an uncharted defense ══════════════════════════════ */
console.log('\n== 8. No Blitz versus an uncharted defense ==');
const blitz = await page.evaluate(() => {
  const Engine = window.app.stats.constructor;
  const tagged = { tags: { defFront: '4-2-5', coverage: 'Cover 3' } };
  const covered = { tags: { coverage: 'Cover 3' } };
  const blitzed = { tags: { defFront: '4-2-5', coverage: 'Cover 3', blitz: 'Mike' } };
  const bare = { tags: {} };
  return {
    tagged: Engine.isNoBlitz(tagged), covered: Engine.isNoBlitz(covered),
    blitzed: Engine.isNoBlitz(blitzed), bare: Engine.isNoBlitz(bare),
    taggedLook: Engine._matchupDefenseLook(tagged)?.label || null,
    bareLook: Engine._matchupDefenseLook(bare),
  };
});
ok(blitz.tagged === true && blitz.covered === true && blitz.blitzed === false && blitz.bare === false,
  'the no-blitz convention admits a structured snap and refuses an untagged one', JSON.stringify(blitz));
ok(blitz.taggedLook === '4-2-5 | Cover 3 | No Blitz' && blitz.bareLook === null,
  'an entirely uncharted defensive snap produces no call at all, never a confirmed No Blitz',
  JSON.stringify(blitz));

/* ══ 9. Offensive and defensive polarity ══════════════════════════════════ */
console.log('\n== 9. Offensive and defensive polarity ==');
/* Polarity is per COHORT, not per lane: a lane holds both cohorts, and each
   must be reported by its own unit's metric. The situational join and our own
   half of the paired tables carry the lane's polarity; the opponent half
   carries the other. */
const heads = () => page.evaluate(() => {
  const read = sel => [...document.querySelectorAll(sel)].map(t => t.textContent.trim());
  return {
    join: read('table.gi-mu-decision th'),
    ours: read('.gi-mu-compare:not(.is-opp) th'),
    theirs: read('.gi-mu-compare.is-opp th'),
  };
});
const offHeads = await heads();
await setDirection('Our Defense vs Their Offense');
const defHeads = await heads();
const defRows = await rows('table.gi-mu-decision');
ok(offHeads.join.includes('Success') && !offHeads.join.includes('Stop Rate')
  && offHeads.ours.includes('Success') && !offHeads.ours.includes('Yds / Play Allowed')
  && offHeads.theirs.includes('Stop Rate') && offHeads.theirs.includes('Yds / Play Allowed'),
  'on the offense-facing lane our production reports Success and their defense reports Stop Rate',
  JSON.stringify(offHeads));
ok(defHeads.join.includes('Stop Rate') && !defHeads.join.includes('Success')
  && defHeads.ours.includes('Stop Rate') && defHeads.ours.includes('Yds / Play Allowed')
  && defHeads.theirs.includes('Success') && !defHeads.theirs.includes('Stop Rate'),
  'on the defense-facing lane our defense reports Stop Rate and their offense reports Success',
  JSON.stringify(defHeads));
/* Our defense on 1st Down against `21 | Pro I | Inside Zone`: ten snaps, of
   which eight held the offense short. Three yards a snap, an 80% stop rate. */
ok(defRows[0][4] === '4-4 | Cover 3 | No Blitz' && defRows[0][5] === '10'
  && defRows[0][6] === '3.0' && defRows[0][7] === '80%',
  'the defense-facing join reports our own front, coverage and pressure against their exact look',
  JSON.stringify(defRows[0]));
const polarity = await page.evaluate(() => {
  const engine = window.app.stats;
  const model = engine.matchupReport('St. Mary Falcons');
  return {
    offense: Object.keys(model.offense.situations[0].season),
    defense: Object.keys(model.defense.situations[0].season),
  };
});
ok(polarity.offense.includes('successRate') && !polarity.offense.includes('stopRate')
  && polarity.defense.includes('stopRate') && !polarity.defense.includes('successRate'),
  'the two lanes are measured by different owners and never carry each other\'s metric',
  JSON.stringify(polarity));

/* ══ 10. Production by Play Type ══════════════════════════════════════════ */
console.log('\n== 10. Production by Play Type ==');
const pairs = await page.evaluate(() => [...document.querySelectorAll('.gi-mu-compare')].map(panel => ({
  title: panel.querySelector('h3').textContent.trim(),
  opp: panel.classList.contains('is-opp'),
  rows: [...panel.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
})));
ok(pairs.length === 2 && pairs[0].title === 'St. Mary Falcons Offense' && pairs[0].opp
  && pairs[1].title === 'Our Defense' && !pairs[1].opp,
  'the paired play-type tables name each cohort and mark which film it is', JSON.stringify(pairs.map(p => p.title)));
/* Independent denominators: their offense charted 19 plays, our defense 26
   snaps, and neither table's counts sum to the other's total. */
const totals = pairs.map(panel => panel.rows.reduce((sum, row) => sum + Number(row[1]), 0));
ok(totals[0] === 19 && totals[1] === 26,
  'each play-type cohort keeps its own denominator', JSON.stringify(totals));
ok(pairs[0].rows.every(row => row[4] === 'Opponent') && pairs[1].rows.every(row => row[4] === 'Season'),
  'each play-type row opens only its own side\'s film', JSON.stringify(pairs.map(p => p.rows.map(r => r[4]))));

/* ══ 11. Personnel and Formation ══════════════════════════════════════════ */
console.log('\n== 11. Personnel and Formation ==');
const personnel = await rows('table.gi-mu-support');
const personnelModel = (await model()).defense.personnel;
ok(personnel[0][0] === '21' && personnel[0][1] === 'Pro I' && personnel[0][2] === '6' && personnel[0][3] === '100%',
  'their most charted personnel and formation reports their own plays and run rate', JSON.stringify(personnel[0]));
ok(personnel.some(row => row[5] === 'No matching snaps' && row[6] === 'Opponent'),
  'a combination our season never faced reports No matching snaps and offers only their film',
  JSON.stringify(personnel));
ok(personnelModel.every(row => !row.season
  || row.opponent.refs.every(ref => !row.season.refs.includes(ref))),
  'the opponent and season reference sets on a personnel row are separate cohorts',
  JSON.stringify(personnelModel.map(r => [r.opponent.refs.length, r.season?.refs.length ?? 0])));

/* ══ 12. Coverages ══════════════════════════════════════════════════════════ */
console.log('\n== 12. Coverages ==');
await setDirection('Our Offense vs Their Defense');
const coverage = await rows('table.gi-mu-support');
const coverageModel = (await model()).offense.coverages;
ok(coverage.map(row => row[0]).join(',') === 'Cover 1,Cover 3,Cover 0,Cover 2,Cover 6',
  'Coverages is driven by the coverages the opponent defense charted, ranked by frequency',
  JSON.stringify(coverage.map(row => row[0])));
ok(!coverage.some(row => row[0] === 'Unknown' || row[0] === ''),
  'an uncharted coverage is omitted rather than invented as Unknown', JSON.stringify(coverage.map(r => r[0])));
/* Twelve season snaps against Cover 3 are charted Inside Zone: 92 yards over
   twelve is 7.7, ten of the twelve succeed, and the two 13-yard runs are the
   explosives. */
ok(coverage[1][0] === 'Cover 3' && coverage[1][1] === 'Inside Zone' && coverage[1][2] === '12'
  && coverage[1][3] === '7.7' && coverage[1][4] === '83%' && coverage[1][5] === '17%',
  'each coverage reports our most charted call against it and that exact cohort\'s own result',
  JSON.stringify(coverage[1]));
ok(coverage[4][0] === 'Cover 6' && coverage[4][1] === 'No matching snaps' && coverage[4][6] === '',
  'a coverage our season never faced renders no values and no enabled film control',
  JSON.stringify(coverage[4]));
ok(coverageModel.every(row => !row.season || row.season.refs.every(ref => ref.startsWith('g'))),
  'Coverages preserves exact season film references',
  JSON.stringify(coverageModel.map(r => r.season?.refs?.slice(0, 2) ?? null)));

/* ══ 13. The film contract ════════════════════════════════════════════════ */
console.log('\n== 13. The film contract ==');
const film = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const watches = [];
  app.filmNavigation.watch = (refs, options) => watches.push({ refs, label: options?.label || '' });
  const cell = [...document.querySelectorAll('table.gi-mu-decision tbody tr')][0]
    .querySelector('.gi-mu-film');
  const buttons = [...cell.querySelectorAll('button')];
  buttons.forEach(button => button.click());
  await new Promise(r => requestAnimationFrame(r));
  app.filmNavigation.watch = original;
  return {
    labels: buttons.map(b => b.textContent.trim()),
    watches,
    texts: [...document.querySelectorAll('.gi-mu-film button')].map(b => b.textContent.trim()),
  };
});
ok(JSON.stringify(film.labels) === JSON.stringify(['Opponent', 'Season']),
  'a joined row carries exactly two film controls, read Opponent and Season', JSON.stringify(film.labels));
ok(new Set(film.texts).size === 2 && !film.texts.includes('THEM') && !film.texts.includes('US'),
  'no film control on the board uses THEM, US or an unlabelled icon', JSON.stringify([...new Set(film.texts)]));
ok(film.watches.length === 2
  && JSON.stringify(film.watches[0].refs) === JSON.stringify(first.opponent.refs)
  && JSON.stringify(film.watches[1].refs) === JSON.stringify(first.season.refs),
  'Opponent opens exactly the opponent cohort and Season exactly the season cohort',
  JSON.stringify(film.watches));
ok(film.watches[0].refs.every(ref => ref.startsWith('scout-sm::'))
  && film.watches[1].refs.every(ref => ref.startsWith('g1::') || ref.startsWith('g2::'))
  && film.watches[0].refs.every(ref => !film.watches[1].refs.includes(ref)),
  'the two cohorts are exact composite gameId::playId sets and never combined',
  JSON.stringify(film.watches.map(w => w.refs)));
const sortedRefs = await page.evaluate(() => {
  const lane = window.app.stats.matchupReport('St. Mary Falcons').offense;
  const all = lane.situations.flatMap(row => [row.opponent?.refs || [], row.season?.refs || []]);
  return all.every(refs => refs.length === new Set(refs).size
    && JSON.stringify(refs) === JSON.stringify([...refs].sort())
    && refs.every(ref => /^[^:]+::[^:]+$/.test(ref)));
});
ok(sortedRefs, 'every reference set is deduplicated, sorted and composite');

/* ══ 14. Copy ═════════════════════════════════════════════════════════════ */
console.log('\n== 14. Copy ==');
const copy = await page.evaluate(() => document.querySelector('[data-pane="matchup"]').textContent);
const banned = ['production against the structure they show', 'our answers against what they run',
  'chart more plays', 'without touching', 'Not charted yet', 'matchup score', 'recommend'];
const found = banned.filter(phrase => copy.toLowerCase().includes(phrase.toLowerCase()));
ok(found.length === 0, 'none of the retired report prose survives on the board', JSON.stringify(found));

/* ══ 15. Partial ══════════════════════════════════════════════════════════ */
console.log('\n== 15. Partial ==');
await load(PARTIAL(), 'Holy Cross');
const partial = await page.evaluate(() => ({
  tabs: [...document.querySelectorAll('[data-reports-secbar] .gi-mu-directions button')].map(b => b.textContent.trim()),
  sections: [...document.querySelectorAll('.gi-mu-title h2')].map(h => h.textContent.trim()),
  note: document.querySelector('.gi-mu-note')?.textContent.trim() || '',
  rows: document.querySelectorAll('table.gi-mu-decision tbody tr').length,
}));
ok(partial.tabs.length === 1 && partial.tabs[0] === 'Our Offense vs Their Defense',
  'the partial state offers only the direction the opponent film can answer', JSON.stringify(partial.tabs));
ok(partial.rows === 5 && partial.sections.includes('Situational Calls'),
  'the partial state preserves the available matchup in full', JSON.stringify(partial));
ok(partial.note.includes('Opponent offense not charted')
  && partial.note.includes('Our Defense vs Their Offense is unavailable.'),
  'the partial state names the missing opponent unit literally', partial.note);

/* ══ 16. Empty ════════════════════════════════════════════════════════════ */
console.log('\n== 16. Empty ==');
await load(EMPTY(), '');
const empty = await page.evaluate(() => ({
  note: document.querySelector('.gi-mu-note')?.textContent.trim() || '',
  bar: document.querySelectorAll('.gi-mu-bar').length,
  tables: document.querySelectorAll('table.gi-mu-table').length,
  select: document.querySelectorAll('#gi-mu-opponent').length,
}));
ok(empty.note.includes('No opponent matchup data') && empty.note.includes('No opponent offense or defense charted.'),
  'the empty state uses exactly the approved copy', empty.note);
ok(empty.bar === 0 && empty.tables === 0 && empty.select === 0,
  'the empty state renders no fabricated selection, sample, row or zero', JSON.stringify(empty));

/* ══ 17. Containment at the release widths ════════════════════════════════ */
console.log('\n== 17. Containment at the release widths ==');
const overflowAt = [], clipped = [];
await load(FULL(), 'St. Mary Falcons');
for (const [w, h] of [[1440, 900], [1280, 720]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(250);
  for (const direction of ['Our Offense vs Their Defense', 'Our Defense vs Their Offense']) {
    await setDirection(direction);
    await frame();
    const measured = await page.evaluate(() => {
      const doc = document.documentElement;
      /* `table-layout:fixed` overflows SILENTLY, so a clipped cell is invisible
         to scrollWidth. Measure the text against the cell's own content box. A
         truncation is ALLOWED only when the element ellipsises AND keeps the
         full value on its own title -- a clipped column header, which has no
         title to fall back on, is always a defect. */
      const bounded = cell => {
        const inner = cell.firstElementChild;
        if (!inner || cell.childElementCount !== 1) return false;
        const style = getComputedStyle(inner);
        return style.textOverflow === 'ellipsis' && style.overflow !== 'visible'
          && !!(inner.getAttribute('title') || '').trim();
      };
      const clips = [];
      document.querySelectorAll('table.gi-mu-table td, table.gi-mu-table th').forEach(cell => {
        if (!cell.getClientRects().length) return;
        const range = document.createRange();
        range.selectNodeContents(cell);
        const text = range.getBoundingClientRect().width;
        const style = getComputedStyle(cell);
        const inner = cell.getBoundingClientRect().width
          - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
        if (text - inner > 1 && !bounded(cell)) clips.push(cell.textContent.trim().slice(0, 34));
      });
      /* A film control that cannot show its own label is a defect the cell
         measurement above cannot see, because the button sits in an
         overflow-visible cell. */
      document.querySelectorAll('.gi-mu-film button').forEach(button => {
        if (button.scrollWidth - button.clientWidth > 1) clips.push(`film:${button.textContent.trim()}`);
      });
      return { overflow: doc.scrollWidth - doc.clientWidth, clips,
        paired: [...document.querySelectorAll('.gi-mu-compare-grid')].every(grid => {
          const panels = [...grid.children];
          return panels.length === 2
            && Math.abs(panels[0].getBoundingClientRect().top - panels[1].getBoundingClientRect().top) < 2;
        }),
        scrollers: [...document.querySelectorAll('.gi-mu-section .gi-table-wrap')]
          .filter(el => el.scrollWidth - el.clientWidth > 1).length };
    });
    if (measured.overflow > 0) overflowAt.push(`${w}:${direction}=${measured.overflow}`);
    if (measured.clips.length) clipped.push(`${w}:${direction}: ${measured.clips.join(' | ')}`);
    if (measured.scrollers) clipped.push(`${w}:${direction}: ${measured.scrollers} engaged scroller(s)`);
    if (!measured.paired) clipped.push(`${w}:${direction}: play-type tables stacked`);
  }
}
ok(overflowAt.length === 0, 'no page-level horizontal overflow at 1440 or 1280', overflowAt.join(' / '));
ok(clipped.length === 0, 'no clipped cell, header or film control and no engaged scroller at 1440 or 1280',
  clipped.join(' / '));
await page.setViewport({ width: 1440, height: 900 });
await sleep(200);

if (process.argv.includes('--capture')) {
  const dir = 'artifacts/matchup-production';
  await mkdir(dir, { recursive: true });
  const shoot = async (name, width, height) => {
    await page.setViewport({ width, height });
    await sleep(300);
    await page.mouse.move(4, 4);
    await frame();
    await page.screenshot({ path: `${dir}/${name}.png`, fullPage: true });
  };
  await load(FULL(), 'St. Mary Falcons');
  for (const [width, height] of [[1440, 900], [1280, 720]]) {
    await setDirection('Our Offense vs Their Defense');
    await shoot(`${width}-offense-vs-defense`, width, height);
    await setDirection('Our Defense vs Their Offense');
    await shoot(`${width}-defense-vs-offense`, width, height);
  }
  await load(PARTIAL(), 'Holy Cross');
  await shoot('1440-partial', 1440, 900);
  await load(EMPTY(), '');
  await shoot('1440-empty', 1440, 900);
  console.log(`\ncaptures written to ${dir}`);
}

/* ══ 18. The join's edges ═════════════════════════════════════════════════ */
console.log('\n== 18. The join\'s edges ==');
await load(EDGE(), 'Riverside');
const edge = await model();

/* A nullified penalty snap is not a defensive rep. Their 3rd & 7+ cohort is
   two Deep Pass snaps charted Bear | Cover 6, one gaining 2 and one gaining
   99 on a penalty that wiped the play out. Measured raw that reads 2 snaps at
   50.5 yards allowed, with both plays in the film cohort. */
const edgeDeep = edge.offense.playTypes.opponent.find(row => row.label === 'Deep Pass');
ok(edgeDeep.n === 1 && edgeDeep.yardsPerPlay === 2 && edgeDeep.refs.length === 1
  && edgeDeep.refs[0] === 'e-scout-def::5',
  'a nullified penalty snap is excluded from the defensive measurement and its film cohort',
  JSON.stringify(edgeDeep));
const edgeLong = edge.offense.situations.find(row => row.key === 'third-long');
ok(edgeLong.opponent.n === 1 && edgeLong.opponent.eligible === 1
  && !edgeLong.opponent.refs.includes('e-scout-def::6'),
  'a nullified penalty snap sets no call frequency, no Rate and no opponent film reference',
  JSON.stringify(edgeLong.opponent));
ok(edge.opponent.defense === 5,
  'the opponent defensive sample counts only the snaps the report can measure', String(edge.opponent.defense));

/* The same front charted in two selection orders is ONE call, and it answers
   our own snaps charted in the other order. */
const edgeFirst = edge.offense.situations.find(row => row.key === 'first');
ok(edgeFirst.opponent.label === '4-2-5 + Nickel | Cover 3 | No Blitz' && edgeFirst.opponent.n === 4,
  'a multi-select front charted in two selection orders groups as one call',
  JSON.stringify(edgeFirst.opponent));
ok(edgeFirst.season && edgeFirst.season.label === 'Spread | Inside Zone' && edgeFirst.season.n === 3,
  'a season snap charted in the other selection order still answers that call',
  JSON.stringify(edgeFirst.season));

/* Their call is charted as a CONCEPT with no play call. Ours carries both a
   play call and that concept, so the join must compare the concept field the
   display came from. */
const edgeDef = edge.defense.situations.find(row => row.key === 'first');
ok(edgeDef.opponent.label === '11 | Spread | Zone',
  'a concept-only opponent call displays the concept it was charted as', JSON.stringify(edgeDef.opponent));
ok(edgeDef.season && edgeDef.season.label === '4-4 | Cover 3 | No Blitz' && edgeDef.season.n === 3
  && edgeDef.season.stopRate === 100,
  'a concept-charted call is answered by season snaps carrying that concept',
  JSON.stringify(edgeDef.season));
const callFields = await page.evaluate(() => {
  const Engine = window.app.stats.constructor;
  const conceptOnly = { tags: { playConcept: 'Zone' } };
  const both = { tags: { playCall: 'Inside Zone', playConcept: 'Zone' } };
  const look = Engine._matchupOffenseLook(conceptOnly);
  return { field: look.callField, call: look.call,
    matches: Engine._matchupMatchesOffenseLook(both, look),
    callLook: Engine._matchupOffenseLook(both).callField };
});
ok(callFields.field === 'playConcept' && callFields.call === 'Zone' && callFields.matches
  && callFields.callLook === 'playCall',
  'the displayed call remembers which field produced it and matches that same field',
  JSON.stringify(callFields));

/* Four cohorts, four independent game counts. */
const counts = await page.evaluate(() => [...document.querySelectorAll('.gi-mu-unit small')]
  .map(node => node.textContent.trim()));
ok(edge.season.offenseGames === 2 && edge.season.defenseGames === 1
  && edge.opponent.defenseGames === 1 && edge.opponent.offenseGames === 1 && edge.opponent.games === 2,
  'each of the four cohorts carries its own contributing game count',
  JSON.stringify({ season: edge.season, opponent: edge.opponent }));
/* Every count names its cohort. Matchup keeps every CHARTED snap, because a
   formation and personnel exist on snaps with no play type and excluding them
   would discard real looks; that is a different cohort from the CLASSIFIED one
   every production measure uses. Printed as bare numbers the two read as a
   contradiction — 201 against 173 on the canonical season. */
ok(JSON.stringify(counts) === JSON.stringify(['2 games | 8 charted snaps', '1 game | 5 charted snaps']),
  'the offense-facing unit headers state their own cohort\'s games and name the charted cohort',
  JSON.stringify(counts));
await setDirection('Our Defense vs Their Offense');
const defCounts = await page.evaluate(() => [...document.querySelectorAll('.gi-mu-unit small')]
  .map(node => node.textContent.trim()));
ok(JSON.stringify(defCounts) === JSON.stringify(['1 game | 3 charted snaps', '1 game | 3 charted snaps']),
  'an offense-only game never inflates the defensive sample beside it', JSON.stringify(defCounts));
await load(FULL(), 'St. Mary Falcons');

console.log('\n== 19. Opening Matchup writes nothing ==');
const beforeMatchupOpen = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.matchupOpponent = 'Northgate';
  app.reportsScreen.selectTab('matchup');
});
await sleep(50);
await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.matchupTab = 'our-defense';
  app.reportsScreen._renderActiveTab();
});
await sleep(50);
const afterMatchupOpen = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.matchupOpponent = 'St. Mary Falcons';
  app.reportsScreen.matchupTab = 'our-offense';
  app.reportsScreen._renderActiveTab();
});
const untouched = beforeMatchupOpen === afterMatchupOpen;
ok(untouched, 'opening Matchup and switching opponent or direction writes nothing to canonical season data');

/* ══ 20. A look is not a play call ════════════════════════════════════════
   `Their Primary Call` sat over a COMPOSITE identity — Personnel | Formation |
   Call on the defence-facing lane, Front | Coverage | Pressure on the
   offence-facing one — with blank components dropped. The canonical season
   charts no playCall and no playConcept anywhere, so on 32 of its 174
   defensive snaps the label collapsed to personnel alone and the column read
   `Their Primary Call: 22`. Personnel is not a play call. */
console.log('\n== 20. A look is never labelled a play call ==');
await load(FULL(), 'St. Mary Falcons');
for (const direction of ['Our Offense vs Their Defense', 'Our Defense vs Their Offense']) {
  await setDirection(direction);
  const heads = await page.evaluate(() => {
    const table = [...document.querySelectorAll('.gi-mu-decision')][0];
    return table ? [...table.querySelectorAll('th')].map(th => th.textContent.trim()) : [];
  });
  ok(heads.includes('Their Top Look') && heads.includes('Our Best Answer'),
    `${direction}: the situational columns name a look and an answer`, JSON.stringify(heads));
  ok(!heads.some(h => /call/i.test(h)),
    `${direction}: no composite-identity column is labelled a play call`,
    JSON.stringify(heads.filter(h => /call/i.test(h))));
}

console.log('\n== 21. Page health ==');
ok(errors.length === 0, 'zero page or console errors across every state', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
