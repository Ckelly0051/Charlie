import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Study Phase 3 -- Player Performance Analysis.
   Discriminating proof for the checkpoint's required verification list:
     1. One player credited in multiple roles (ballCarrier AND tackler).
     2. Shared tackles versus solo tackles (the same shared-tackle rule
        StatsEngine._individualStats already applies).
     3. Blank grades are excluded from grade denominators (never coerced to 0).
     4. Exact metric refs equal Watch refs -- both the per-row Watch button
        and the aggregate "Watch results" action.
     5. Comparison mode retains player-specific refs on both cohorts.
     6. Cross-game duplicate play ids remain distinguishable (composite refs).
     7. Roster labels render safely (a stored-XSS payload name renders inert).
     8. Insufficient samples never display as zero (real value + "Low sample"
        badge), and a genuine zero sub-count is never misreported as
        unavailable.
     9. Mutation proof for the player-role eligibility gate (a dimension's
        `.values()` extractor) and the film-ref seam (Watch must consume the
        metric's own eligible refs, never a group's broader raw sample).
   Every metric here rides the existing AnalyticsMetrics/StudyQuery/registry
   engine -- no parallel player-stat formula is added in study-screen.js. */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(resolve => setTimeout(resolve, 500));

// ---- fixture ---------------------------------------------------------------
// Two games. Both deliberately reuse bare play id 1 (proof #6). #22 is
// credited as BOTH a ball carrier (offense) and a tackler (defense) (proof
// #1). #5/#44 share a tackle on one play (proof #2). #22's third run play
// carries no grade at all (proof #3). #7's roster name is a stored-XSS
// payload (proof #7). The passer cohort (#7) deliberately includes a sacked
// dropback with a real grade, proving the broadened playerPasser dimension
// gate (see analytics-registry.js's dimension comment) makes a graded sack
// visible to Avg Grade while still being excluded from Completion Rate and
// Yards/Attempt.
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Study Players Fixture', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const roster = app.roster;
  roster.addPlayer('22', "O'Brien", 'RB', 'B');
  roster.addPlayer('7', '<img src=x onerror=window.__playerXss=true>', 'QB', 'O');
  roster.addPlayer('84', 'Diaz', 'WR', 'O');
  roster.addPlayer('5', 'Okafor', 'LB', 'D');
  roster.addPlayer('44', 'Reyes', 'LB', 'D');
  roster.addPlayer('9', 'Kimura', 'K', 'B');
  roster.addPlayer('3', 'Patel', 'WR', 'B');

  const g1 = store.activeGame();
  g1.id = 'g-players-1'; g1.name = 'Week 1 vs Rivals'; g1.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  const t = start => ({ start, end: start + 4 });
  g1.plays = [
    // -- Ball carrier #22: success/negative/explosive, one play blank-graded --
    { id: 1, timestamp: t(0), tags: { unit: 'offense', formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' }, grades: { ballCarrier: 2 } } },
    { id: 2, timestamp: t(4), tags: { unit: 'offense', formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Loss', yardage: '-2', down: '2', distance: '8', players: { ballCarrier: '22' }, grades: { ballCarrier: -1 } } },
    { id: 3, timestamp: t(8), tags: { unit: 'offense', formation: 'Trips', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '20', down: '1', distance: '10', players: { ballCarrier: '22' } } }, // blank grade
    // -- Passer #7 + receiver #84: attempt, target-not-reception, INT, sack --
    { id: 4, timestamp: t(12), tags: { unit: 'offense', formation: 'Trips', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '15', down: '1', distance: '10', players: { passer: '7', receiver: '84' }, grades: { receiver: 1 } } },
    { id: 5, timestamp: t(16), tags: { unit: 'offense', formation: 'Trips', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', down: '2', distance: '10', players: { passer: '7', receiver: '84' } } },
    { id: 6, timestamp: t(20), tags: { unit: 'offense', formation: 'Ace', runPass: 'Pass', playType: 'Deep Pass', result: 'Interception', yardage: '0', down: '3', distance: '5', players: { passer: '7' } } },
    { id: 7, timestamp: t(24), tags: { unit: 'offense', formation: 'Ace', runPass: 'Pass', playType: 'Deep Pass', result: 'Sack', yardage: '-6', down: '1', distance: '10', players: { passer: '7' }, grades: { passer: -2 } } },
    // -- Defense: #5 solo, #5+#44 shared, #5 sack, #22 also a tackler --------
    { id: 8, timestamp: t(28), tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 3', result: 'Gain', yardage: '3', down: '1', distance: '10', players: { tackler: '5' } } },
    { id: 9, timestamp: t(32), tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 2', result: 'Loss', yardage: '-2', down: '2', distance: '8', players: { tackler: '5, 44' } } },
    { id: 10, timestamp: t(36), tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 3', result: 'Sack', yardage: '-7', down: '1', distance: '10', players: { tackler: '5' } } },
    { id: 11, timestamp: t(40), tags: { unit: 'defense', defFront: 'Nickel', coverage: 'Cover 1', result: 'Gain', yardage: '1', down: '3', distance: '2', players: { tackler: '22' } } },
    // -- Special Teams: kicker #9 (made + missed), returner #3 (return + TD) --
    { id: 12, timestamp: t(44), tags: { unit: 'special', players: { kicker: '9' } }, specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 32 }, outcome: { status: 'good', score: 'fieldGoal', scoredBy: 'subject' } } },
    { id: 13, timestamp: t(48), tags: { unit: 'special', players: { kicker: '9' } }, specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 45 }, outcome: { status: 'noGood' } } },
    { id: 14, timestamp: t(52), tags: { unit: 'special', players: { returner: '3' } }, specialTeams: { unit: 'kickoffReturn', return: { attempted: true, yards: 22 }, outcome: { status: 'returned' } } },
    { id: 15, timestamp: t(56), tags: { unit: 'special', result: 'Touchdown', players: { returner: '3' } }, specialTeams: { unit: 'puntReturn', return: { attempted: true, yards: 75 }, outcome: { status: 'returned', score: 'touchdown', scoredBy: 'subject' } } },
  ];
  const g2 = store.addGame({ id: 'g-players-2', name: 'Week 2 vs Tigers', status: 'active', gameInfo: { opponent: 'Tigers', date: '2026-09-08' }, plays: [
    { id: 1, timestamp: t(0), tags: { unit: 'offense', formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', distance: '10', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } } },
    { id: 2, timestamp: t(4), tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 3', result: 'Gain', yardage: '2', down: '2', distance: '5', players: { tackler: '5' } } },
    { id: 3, timestamp: t(8), tags: { unit: 'special', players: { kicker: '9' } }, specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 28 }, outcome: { status: 'good', score: 'fieldGoal', scoredBy: 'subject' } } },
  ] });
  store.data.activeGameId = g1.id;
  app.storage._clearForNewGame();
  app.storage._loadActiveGame();
  await app.workspaceShell.show('study');
});

// ---- direct StudyQuery/AnalyticsMetrics precision checks (bypass <select>) -
const direct = await page.evaluate(() => {
  const app = window.app, study = app.study;
  const sets = app.studyScreen._playSets();
  const game1 = sets.game, season = sets.season;
  const run = (plays, dimension, metricIds, extra = {}) => study.runMetrics({ plays, dimension, metricIds, ...extra });
  const groupFor = (result, value) => result.groups.find(g => String(g.value) === String(value));

  // #1 -- one player, two roles, on the SAME game's play set.
  const carriers = run(game1, 'playerBallCarrier', ['yardsPerPlay']);
  const tacklers = run(game1, 'playerTackler', ['tackles']);
  const carrier22 = groupFor(carriers, '22');
  const tackler22 = groupFor(tacklers, '22');

  // #2 -- shared vs solo tackles for #5 (solo id8, shared id9, solo-sack id10)
  // and #44 (shared id9 only).
  const soloAssist = run(game1, 'playerTackler', ['tackles', 'soloTackles', 'assistedTackles', 'sacksMade', 'tfl']);
  const t5 = groupFor(soloAssist, '5'), t44 = groupFor(soloAssist, '44');

  // #3 -- blank grade excluded from the denominator (id3 has no ballCarrier grade).
  const grades = run(game1, 'playerBallCarrier', ['avgGrade', 'positiveGradeRate', 'negativeGradeRate'], { gradeRole: 'ballCarrier' });
  const carrierGrade = groupFor(grades, '22');

  // Passer's broadened cohort (attempts + sacks): completionRate/yardsPerAttempt
  // exclude the sack; successRate and avgGrade(passer) include it.
  const passer = run(game1, 'playerPasser', ['completionRate', 'yardsPerAttempt', 'completions', 'sacksTaken', 'successRate', 'avgGrade'], { gradeRole: 'passer' });
  const passer7 = groupFor(passer, '7');

  // Kicker/returner (structured Special Teams reuse -- no duplicate formula).
  const kickers = run(game1, 'playerKicker', ['completions', 'completionRate']);
  const kicker9 = groupFor(kickers, '9');
  const returners = run(game1, 'playerReturner', ['touchdowns']);
  const returner3 = groupFor(returners, '3');

  // #6 -- cross-game duplicate bare play id 1: season-scope #22 ballCarrier
  // refs must contain BOTH g-players-1::1 and g-players-2::1, never collapsed.
  const seasonCarriers = run(season, 'playerBallCarrier', ['yardsPerPlay']);
  const carrier22Season = groupFor(seasonCarriers, '22');

  // #8a -- insufficient sample: #22's season ballCarrier successRate has a
  // real denominator of 4 (3 in g1 + 1 in g2); minSample:5 must report
  // 'insufficient', NOT 'unavailable', and must NOT null out the real value.
  const insufficient = run(season, 'playerBallCarrier', ['successRate'], { minSample: 5 });
  const carrier22Insufficient = groupFor(insufficient, '22');

  // #8b -- a genuine zero sub-count (#44 has one tackle play, zero sacks)
  // must report state:'ok', value:0 -- never 'unavailable'.
  const zeroSacks = run(game1, 'playerTackler', ['sacksMade']);
  const t44Sacks = groupFor(zeroSacks, '44');

  return {
    carrier22YPP: carrier22?.metrics.yardsPerPlay,
    tackler22Count: tackler22?.metrics.tackles,
    t5: { tackles: t5?.metrics.tackles, solo: t5?.metrics.soloTackles, assist: t5?.metrics.assistedTackles, sacks: t5?.metrics.sacksMade, tfl: t5?.metrics.tfl },
    t44: { tackles: t44?.metrics.tackles, solo: t44?.metrics.soloTackles, assist: t44?.metrics.assistedTackles, tfl: t44?.metrics.tfl },
    carrierGrade: carrierGrade?.metrics.avgGrade?.value,
    carrierGradeDenom: carrierGrade?.metrics.avgGrade?.denominator,
    carrierPosGrade: carrierGrade?.metrics.positiveGradeRate?.value,
    carrierNegGrade: carrierGrade?.metrics.negativeGradeRate?.value,
    passer7: {
      completionRate: passer7?.metrics.completionRate, yardsPerAttempt: passer7?.metrics.yardsPerAttempt,
      completions: passer7?.metrics.completions, sacksTaken: passer7?.metrics.sacksTaken,
      successRateDenom: passer7?.metrics.successRate?.denominator, avgGrade: passer7?.metrics.avgGrade?.value,
    },
    kicker9: { completions: kicker9?.metrics.completions, completionRate: kicker9?.metrics.completionRate },
    returner3TDs: returner3?.metrics.touchdowns,
    carrier22SeasonRefs: carrier22Season?.metrics.yardsPerPlay?.refs,
    insufficient: { state: carrier22Insufficient?.metrics.successRate?.state, value: carrier22Insufficient?.metrics.successRate?.value, denom: carrier22Insufficient?.metrics.successRate?.denominator },
    zeroSacks: { state: t44Sacks?.metrics.sacksMade?.state, value: t44Sacks?.metrics.sacksMade?.value },
  };
});

ok(direct.carrier22YPP?.denominator === 3 && direct.tackler22Count?.value === 1,
  'One player (#22) is independently credited as a ballCarrier group AND a tackler group from the same play set', JSON.stringify({ ypp: direct.carrier22YPP, tk: direct.tackler22Count }));

ok(direct.t5.tackles.value === 3 && direct.t5.solo.value === 2 && direct.t5.assist.value === 1 && direct.t5.sacks.value === 1 && direct.t5.tfl.value === 1
  && direct.t44.tackles.value === 1 && direct.t44.solo.value === 0 && direct.t44.assist.value === 1 && direct.t44.tfl.value === 1,
  'Shared tackles credit BOTH tacklers; solo/assisted/sacks/TFL split matches StatsEngine\'s own shared-tackle rule', JSON.stringify({ t5: direct.t5, t44: direct.t44 }));

ok(direct.carrierGrade === 0.5 && direct.carrierGradeDenom === 2 && direct.carrierPosGrade === 50 && direct.carrierNegGrade === 50,
  'A blank grade (id3) is excluded from the grade denominator -- avgGrade averages only the 2 graded plays, not all 3', JSON.stringify({ carrierGrade: direct.carrierGrade, denom: direct.carrierGradeDenom, pos: direct.carrierPosGrade, neg: direct.carrierNegGrade }));

ok(direct.passer7.completionRate?.denominator === 3 && direct.passer7.completionRate?.value?.toFixed(1) === '33.3'
  && direct.passer7.yardsPerAttempt?.denominator === 3 && direct.passer7.completions?.value === 1
  && direct.passer7.sacksTaken?.value === 1 && direct.passer7.successRateDenom === 4 && direct.passer7.avgGrade === -2,
  'Passer cohort excludes the sack from Completion Rate/Yards-per-Attempt but includes it in Success Rate and a graded sack is visible to Avg Grade', JSON.stringify(direct.passer7));

ok(direct.kicker9.completions?.value === 1 && direct.kicker9.completionRate?.value === 50 && direct.returner3TDs?.value === 1,
  'Kicker/returner reuse the same completionRate/touchdowns formulas as every other role -- no duplicate Special Teams formula', JSON.stringify({ k: direct.kicker9, r: direct.returner3TDs }));

ok(Array.isArray(direct.carrier22SeasonRefs) && direct.carrier22SeasonRefs.includes('g-players-1::1') && direct.carrier22SeasonRefs.includes('g-players-2::1') && new Set(direct.carrier22SeasonRefs).size === direct.carrier22SeasonRefs.length,
  'Cross-game duplicate bare play id 1 resolves to two distinct composite refs, never collapsed', JSON.stringify(direct.carrier22SeasonRefs));

ok(direct.insufficient.state === 'insufficient' && direct.insufficient.denom === 4 && typeof direct.insufficient.value === 'number' && direct.insufficient.value > 0,
  'An insufficient sample reports state:"insufficient" with a REAL computed value, never a fabricated zero or a nulled-out value', JSON.stringify(direct.insufficient));

ok(direct.zeroSacks.state === 'ok' && direct.zeroSacks.value === 0,
  'A genuine zero sub-count (#44 has zero sacks) reports state:"ok", never "unavailable" -- an honest zero is not the same as no data', JSON.stringify(direct.zeroSacks));

// ---- UI-driven: role/player/metric controls, Watch parity, XSS safety -----
// Clear the generic "Unit" filter -- it defaults to Offense (DEFAULT_UNIT),
// which would silently exclude every defense-tagged tackler play from every
// UI-driven query below. Each player role already carries its own
// unit-appropriate gate internally (see the dimension comments in
// analytics-registry.js); the generic Unit control is orthogonal to that.
await page.select('#wsStudyUnit', '');
await page.select('#wsStudyPlayerRole', 'ballCarrier');
await page.select('#wsStudyPlayerMetric', 'avgGrade');
let r = await page.evaluate(() => {
  const app = window.app;
  const rows = [...document.querySelectorAll('.ws-study-row')];
  return {
    roleOptions: [...document.querySelectorAll('#wsStudyPlayerRole option')].map(o => o.value),
    playerOptions: [...document.querySelectorAll('#wsStudyPlayer option')].map(o => o.value),
    metricOptions: [...document.querySelectorAll('#wsStudyPlayerMetric option')].map(o => o.value),
    measureDisabled: document.querySelector('#wsStudyMeasure')?.disabled,
    columnDisabled: document.querySelector('#wsStudyColumn')?.disabled,
    rowCount: rows.length,
    rowText: rows[0]?.querySelector('strong')?.textContent,
    metricHead: document.querySelector('#wsStudyMetricHead')?.textContent,
    rowRefs: app.studyScreen.rows.map(row => row.refs.slice().sort()),
  };
});
ok(r.roleOptions.includes('ballCarrier') && r.roleOptions.includes('passer') && r.roleOptions.includes('tackler') && r.roleOptions.includes('kicker') && r.roleOptions.includes('returner'),
  'Every required player role is offered on the role picker', JSON.stringify(r.roleOptions));
ok(r.playerOptions.includes('22') && r.metricOptions.includes('avgGrade') && r.measureDisabled === true && r.columnDisabled === true,
  'Choosing a role populates the player pool and role-scoped metrics, and takes over the primary metric/pivot pickers', JSON.stringify({ playerOptions: r.playerOptions, metricOptions: r.metricOptions, measureDisabled: r.measureDisabled, columnDisabled: r.columnDisabled }));
ok(r.rowCount === 1 && r.metricHead === 'Avg Grade' && JSON.stringify(r.rowRefs[0]) === JSON.stringify(['g-players-1::1', 'g-players-1::2']),
  'The Avg Grade leaderboard row for #22 uses exactly the metric\'s own eligible refs (the blank-grade play is excluded)', JSON.stringify(r.rowRefs));

// #4a -- per-row Watch consumes exactly the metric's own refs (not the group's raw sample of 3).
let watch = await page.evaluate(() => {
  const app = window.app, calls = [], old = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => calls.push({ refs: refs.slice().sort(), label: options?.label });
  document.querySelector('[data-study-row="0"]').click();
  app.filmNavigation.watch = old;
  return calls;
});
ok(watch.length === 1 && JSON.stringify(watch[0].refs) === JSON.stringify(['g-players-1::1', 'g-players-1::2']),
  'Row Watch plays exactly the metric\'s eligible refs, excluding the blank-grade play', JSON.stringify(watch));

// #4b -- the aggregate "Watch results" action, over a leaderboard with THREE
// tacklers, unions each row's own metric refs -- proving no player's refs
// leak into another's and none are dropped.
await page.select('#wsStudyPlayerRole', 'tackler');
await page.select('#wsStudyScope', 'season');
await page.select('#wsStudyPlayerMetric', 'tackles');
const aggregateWatch = await page.evaluate(() => {
  const app = window.app, calls = [], old = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => calls.push({ refs: refs.slice().sort(), label: options?.label });
  document.querySelector('[data-study-action="watch-all"]').click();
  app.filmNavigation.watch = old;
  return calls;
});
const expectedTacklerRefs = ['g-players-1::8', 'g-players-1::9', 'g-players-1::10', 'g-players-1::11', 'g-players-2::2'].sort();
ok(aggregateWatch.length === 1 && JSON.stringify(aggregateWatch[0].refs) === JSON.stringify(expectedTacklerRefs),
  'Watch results unions every tackler\'s own refs across the whole season, with no leakage or omission', JSON.stringify({ got: aggregateWatch[0]?.refs, expected: expectedTacklerRefs }));

// #7 -- roster labels render safely: #7's name is a stored-XSS payload.
await page.select('#wsStudyScope', 'game');
await page.select('#wsStudyPlayerRole', 'passer');
await page.select('#wsStudyPlayerMetric', 'completions');
const xss = await page.evaluate(() => {
  const app = window.app;
  const row = document.querySelector('.ws-study-row strong');
  return { text: row?.textContent, executed: window.__playerXss === true, labelRaw: app.roster.getLabel('7') };
});
ok(xss.text === xss.labelRaw && !xss.executed && /<img/.test(xss.text),
  'A roster name containing an XSS payload renders as inert text, never executes', JSON.stringify(xss));

// -- single-player breakdown: existing "Break down by" control is reused as
// the second dimension; player is added as an ordinary filter, never a
// second bespoke picker.
await page.select('#wsStudyDimension', 'down');
await page.select('#wsStudyPlayer', '7');
await page.select('#wsStudyPlayerMetric', 'completionRate');
r = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('.ws-study-row strong')].map(el => el.textContent),
  summary: document.querySelector('#wsStudySummary')?.textContent,
}));
ok(r.rows.every(text => /^(1|2|3|4)$/.test(text)) && r.rows.length > 0 && /for #7/.test(r.summary),
  'Choosing a specific player groups by the EXISTING "Break down by" dimension (Down), filtered to that player\'s own cohort', JSON.stringify(r));

// #5 -- comparison mode retains player-specific refs on BOTH cohorts.
await page.select('#wsStudyPlayer', '');
await page.select('#wsStudyPlayerRole', 'ballCarrier');
await page.select('#wsStudyPlayerMetric', 'yardsPerPlay');
await page.select('#wsStudyCompare', 'prior');
r = await page.evaluate(() => {
  const app = window.app;
  const row = app.studyScreen._saveCohorts;
  return {
    base: (row?.find(c => c.id === 'base')?.refs || []).slice().sort(),
    against: (row?.find(c => c.id === 'against')?.refs || []).slice().sort(),
    rowText: document.querySelector('.ws-study-row-compare strong')?.textContent,
  };
});
ok(JSON.stringify(r.base) === JSON.stringify(['g-players-1::1', 'g-players-1::2', 'g-players-1::3'])
  && JSON.stringify(r.against) === JSON.stringify(['g-players-2::1']),
  'Comparison mode keeps #22\'s refs separate and correct on both the base (game) and against (prior games) cohorts', JSON.stringify(r));
await page.select('#wsStudyCompare', '');

// ---- mutation proof: player-role eligibility gate --------------------------
// Every AnalyticsRegistry dimension entry is Object.freeze()-d (analytics-
// registry.js's `_index`), so a direct property reassignment on the entry
// silently no-ops. The load-bearing seam is the `_dimensionMap` lookup
// itself -- replacing the Map's stored entry (never mutating the frozen
// object in place) reaches every consumer that calls `getDimension()`/
// `values()` fresh, exactly as a genuine registration-time defect would.
const eligibilityMutation = await page.evaluate(() => {
  const app = window.app;
  const map = app.analyticsRegistry._dimensionMap;
  const original = map.get('playerTackler');
  const plays = app.studyScreen._playSets().game;
  const before = app.study.runMetrics({ plays, dimension: 'playerTackler', metricIds: ['tackles'] }).groups.filter(g => g.sampleSize > 0).length;
  map.set('playerTackler', { ...original, values: () => [] });
  const mutated = app.study.runMetrics({ plays, dimension: 'playerTackler', metricIds: ['tackles'] }).groups.filter(g => g.sampleSize > 0).length;
  map.set('playerTackler', original);
  const restored = app.study.runMetrics({ plays, dimension: 'playerTackler', metricIds: ['tackles'] }).groups.filter(g => g.sampleSize > 0).length;
  return { before, mutated, restored };
});
ok(eligibilityMutation.before === 3 && eligibilityMutation.mutated === 0 && eligibilityMutation.restored === 3,
  'Mutation proof: disabling playerTackler\'s eligibility gate collapses the tackler leaderboard to zero groups; restoring it brings all 3 tacklers back', JSON.stringify(eligibilityMutation));

// ---- mutation proof: film-ref seam (Watch must use the metric's own refs) -
await page.select('#wsStudyPlayerRole', 'ballCarrier');
await page.select('#wsStudyPlayerMetric', 'avgGrade');
const refMutation = await page.evaluate(() => {
  const app = window.app, studyScreen = app.studyScreen;
  const proto = Object.getPrototypeOf(studyScreen);
  const original = proto._renderPlayersQuery;
  // Broken variant: consumes the group's raw (broader) matchingPlayIds
  // instead of the metric's own eligible refs -- exactly the class of leak
  // this checkpoint's film-cohort-honesty rule exists to prevent.
  proto._renderPlayersQuery = function (result, metric, label, context) {
    const groups = result.groups.filter(g => g.sampleSize > 0);
    this.rows = groups.map(g => ({ label: label(g.value), refs: (g.matchingPlayIds || []).slice() }));
    const allRefs = [...new Set(groups.flatMap(g => g.matchingPlayIds || []))];
    this._control('wsStudyRows').innerHTML = groups.map((g, i) => `<div class="ws-study-row"><strong>${this._esc(label(g.value))}</strong><button data-study-row="${i}">Watch</button></div>`).join('');
    this._setWatchAll(allRefs);
  };
  studyScreen.render();
  const mutatedRefs = studyScreen.rows[0]?.refs.slice().sort();
  proto._renderPlayersQuery = original;
  studyScreen.render();
  const restoredRefs = studyScreen.rows[0]?.refs.slice().sort();
  return { mutatedRefs, restoredRefs };
});
ok(JSON.stringify(refMutation.mutatedRefs) === JSON.stringify(['g-players-1::1', 'g-players-1::2', 'g-players-1::3']),
  'Mutation proof: swapping the film-ref source to the group\'s raw sample leaks the blank-grade play into Watch', JSON.stringify(refMutation.mutatedRefs));
ok(JSON.stringify(refMutation.restoredRefs) === JSON.stringify(['g-players-1::1', 'g-players-1::2']),
  'Restoring the real render method brings Watch back to exactly the metric\'s eligible refs', JSON.stringify(refMutation.restoredRefs));

// ---- no page errors ---------------------------------------------------------
ok(errors.length === 0, 'No page errors', errors.join('\n'));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
