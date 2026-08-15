import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Study expansion Phase 2 -- Penalties + Special Teams coaching analysis.
   Discriminating proof for the ten requirements of that checkpoint:
     1. Accepted/declined/offsetting/unresolved/no-play penalties.
     2. Team and unit perspective.
     3. Penalty yards and denominator eligibility.
     4. Every Special Teams phase.
     5. Tries stay isolated from ordinary FG/offensive efficiency measures.
     6. Missing structured data never renders as zero.
     7. Metric refs exactly equal Watch-film refs.
     8. Cross-game refs remain composite and do not collide.
     9. Comparisons use identical metric definitions on both sides.
     10. Existing core Study behavior and parity remain unchanged -- proven by
         the UNCHANGED e2e-study-screen.mjs, e2e-study-query.mjs, e2e-parity.mjs,
         and e2e-analytics-registry.mjs suites, not re-tested here.
   All measures ride the SAME run()/compare()/readMeasures() path every legacy
   flat measure already used before this checkpoint -- no parallel query engine. */
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
// Deliberately reuses bare play id 1 in BOTH games (proof #8: composite refs
// must not collide). Game 1 covers every penalty disposition + every Special
// Teams phase; Game 2 is a small second cohort for the game-vs-season compare
// proofs (#9) and for exercising an EMPTY onside/punt cohort (#6).
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Phase 2 Fixture', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const g1 = store.activeGame();
  g1.id = 'g-pen-st-1'; g1.name = 'Week 1 vs Rivals'; g1.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  const t = (start) => ({ start, end: start + 4 });
  g1.plays = [
    // -- Penalties: every disposition, every phase, both teams -------------
    { id: 1, timestamp: t(0), tags: { unit: 'offense', formation: 'Trips', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '2', down: '1', distance: '10' },
      penalties: [{ team: 'subject', phase: 'offense', foul: 'Holding', disposition: 'accepted', yards: 10, playCounts: false }] },
    { id: 2, timestamp: t(4), tags: { unit: 'offense', formation: 'Ace', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', down: '2', distance: '4' },
      penalties: [{ team: 'opponent', phase: 'defense', foul: 'Pass Interference', disposition: 'accepted', yards: 15, playCounts: true, automaticFirstDown: true }] },
    { id: 3, timestamp: t(8), tags: { unit: 'defense', defFront: '4-2-5', coverage: 'Cover 3', result: 'Gain', yardage: '3', down: '3', distance: '7' },
      penalties: [{ team: 'subject', phase: 'defense', foul: 'Facemask', disposition: 'declined', yards: 15 }] },
    { id: 4, timestamp: t(12), tags: { unit: 'offense', formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Penalty', yardage: '0', down: '1', distance: '10' },
      penalties: [
        { team: 'subject', phase: 'offense', foul: 'False Start', disposition: 'offsetting', yards: 5 },
        { team: 'opponent', phase: 'defense', foul: 'Offside', disposition: 'offsetting', yards: 5 },
      ] },
    { id: 5, timestamp: t(16), tags: { unit: 'offense', formation: 'Trips', runPass: 'Pass', playType: 'Deep Pass', result: 'Incomplete', yardage: '0', down: '1', distance: '10' },
      penalties: [{ team: 'unknown', phase: 'unknown', foul: '', disposition: 'unknown', yards: null }] },
    // -- Special Teams: every phase ------------------------------------------
    { id: 6, timestamp: t(20), tags: { unit: 'special' }, specialTeams: { unit: 'kickoff', kick: { distance: 55 }, outcome: { status: 'touchback' } } },
    { id: 7, timestamp: t(24), tags: { unit: 'special' }, specialTeams: { unit: 'kickoff', kick: { distance: 12 }, isOnside: true, outcome: { status: 'recovered', recoveredBy: 'subject' } } },
    { id: 8, timestamp: t(28), tags: { unit: 'special' }, specialTeams: { unit: 'kickoffReturn', return: { attempted: true, yards: 22 }, outcome: { status: 'returned' } } },
    { id: 9, timestamp: t(32), tags: { unit: 'special' }, specialTeams: { unit: 'kickoffReturn', outcome: { status: 'muffed', recoveredBy: 'subject' } } },
    { id: 10, timestamp: t(36), tags: { unit: 'special' }, specialTeams: { unit: 'punt', kick: { distance: 40, hangTime: 4.2 }, outcome: { status: 'downed' } } },
    { id: 11, timestamp: t(40), tags: { unit: 'special' }, specialTeams: { unit: 'punt', kick: { distance: 38 }, outcome: { status: 'fairCatch' } } },
    { id: 12, timestamp: t(44), tags: { unit: 'special' }, specialTeams: { unit: 'punt', kick: { distance: 30 }, outcome: { status: 'blocked' } } },
    { id: 13, timestamp: t(48), tags: { unit: 'special' }, specialTeams: { unit: 'puntReturn', return: { attempted: true, yards: 8 }, outcome: { status: 'returned' } } },
    { id: 14, timestamp: t(52), tags: { unit: 'special' }, specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 32 }, outcome: { status: 'good', score: 'fieldGoal', scoredBy: 'subject' } } },
    { id: 15, timestamp: t(56), tags: { unit: 'special' }, specialTeams: { unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 45 }, outcome: { status: 'noGood' } } },
    { id: 16, timestamp: t(60), tags: { unit: 'special' }, specialTeams: { unit: 'fieldGoalBlock', outcome: { status: 'blocked' } } },
    { id: 17, timestamp: t(64), tags: { unit: 'special' }, specialTeams: { unit: 'try', attemptType: 'extraPoint', result: 'converted', outcome: { score: 'extraPoint', scoredBy: 'subject' } } },
    { id: 18, timestamp: t(68), tags: { unit: 'special' }, specialTeams: { unit: 'try', attemptType: 'twoPoint', result: 'converted', outcome: { score: 'twoPoint', scoredBy: 'subject' } } },
    { id: 19, timestamp: t(72), tags: { unit: 'special' }, specialTeams: { unit: 'try', attemptType: 'extraPoint', result: 'failed' } },
  ];
  const g2 = store.addGame({ id: 'g-pen-st-2', name: 'Week 2 vs Tigers', status: 'active', gameInfo: { opponent: 'Tigers', date: '2026-09-08' }, plays: [
    { id: 1, timestamp: t(0), tags: { unit: 'offense', formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '1', distance: '10' },
      penalties: [{ team: 'subject', phase: 'offense', foul: 'Holding', disposition: 'accepted', yards: 10 }] },
    { id: 2, timestamp: t(4), tags: { unit: 'special' }, specialTeams: { unit: 'kickoff', kick: { distance: 50 }, outcome: { status: 'touchback' } } },
  ] });
  store.data.activeGameId = g1.id;
  app.storage._clearForNewGame();
  app.storage._loadActiveGame();
  await app.workspaceShell.show('study');
});

// ---- direct StudyQuery precision checks (bypass <select> for exact math) --
const direct = await page.evaluate(() => {
  const app = window.app, study = app.study;
  const sets = app.studyScreen._playSets();
  const game1 = sets.game, season = sets.season;
  const run = (plays, dimension, measures) => study.run({ plays, dimension, measures });

  // 1/3: accepted/declined/offsetting/unresolved/no-play + accepted-only yards.
  const ruling = run(game1, 'penaltyRuling', ['penaltyFouls']);
  const rulingCounts = Object.fromEntries(ruling.groups.map(g => [g.value, g.matchingPlayIds.length]));
  const teamYards = run(game1, 'penaltyTeam', ['penaltyYardsSubject', 'penaltyYardsOpponent', 'penaltyAcceptedSubject', 'penaltyAcceptedOpponent']);
  const subjectGroup = teamYards.groups.find(g => g.value === 'subject');
  const opponentGroup = teamYards.groups.find(g => g.value === 'opponent');
  const noPlay = run(game1, 'unit', ['penaltyNoPlay']);

  // 2: team + unit (byPhase) perspective -- `phase` is the FOUL's own
  // side-of-ball, independent of which team's SNAP the play was tagged
  // (P2 is an offense-unit play carrying a phase:'defense' foul -- the
  // opponent's pass interference against OUR offense). Both measures read
  // off the SAME cohort so this is a genuine same-cohort cross-check, not
  // two different groups compared against each other.
  const phaseStats = app.stats.compute(game1);
  const phaseYards = app.analyticsRegistry.readMeasures(phaseStats, ['penaltyAcceptedOffense', 'penaltyAcceptedDefense']);

  // 4: every Special Teams phase groups under its literal label.
  const stUnits = study.run({ plays: game1, dimension: 'specialTeamsUnit', measures: [] }).groups.map(g => g.value).sort();

  // 5: tries isolated from FG/offensive measures.
  const fg = run(game1, 'unit', ['stFieldGoalAtt', 'stFieldGoalMade', 'stExtraPointAtt', 'stExtraPointMade', 'stTwoPointAtt', 'stTwoPointMade']);
  const fgSpecial = fg.groups.find(g => g.value === 'special')?.measures || {};

  // 6: missing structured data. Two DISTINCT cases, deliberately not conflated:
  //  (a) a structured cohort that genuinely tracked zero punts -- the rate
  //      field's own denominator (punts.n) is 0, so the registry's
  //      zeroDenominatorPath coercion nulls the rate. stPuntCount itself
  //      stays a real, informative 0 (we DID track special teams; there
  //      just were none) -- not touched by the coercion.
  //  (b) a cohort with NO structured Special Teams data at all -- onside is
  //      not a legacy concept (a legacy onside kick was its own separate
  //      stType, never a Kickoff modifier), so it is an honest structural
  //      null regardless of whether any kickoffs were charted.
  const g2Plays = sets.season.filter(p => p.__gid === 'g-pen-st-2');
  const g2Stats = app.stats.compute(g2Plays);
  const g2PuntRate = app.analyticsRegistry.readMeasures(g2Stats, ['stPuntTouchbackPct', 'stPuntCount']);
  const g2OffenseOnly = app.stats.compute(g2Plays.filter(p => p.tags.unit === 'offense'));
  const g2Onside = app.analyticsRegistry.readMeasures(g2OffenseOnly, ['stKickoffOnsideAtt', 'stFieldGoalBlockSnaps', 'stTryDownsCount']);

  // 8: cross-game composite refs never collide despite both games using bare id 1.
  const seasonByUnit = study.run({ plays: season, dimension: 'unit', measures: [] });
  const specialGroup = seasonByUnit.groups.find(g => g.value === 'special');
  const g1Ref = specialGroup?.matchingPlayIds.find(r => r.startsWith('g-pen-st-1::'));
  const bareIdOneRefs = [
    run(game1, 'penaltyTeam', []).groups.find(g => g.value === 'subject')?.matchingPlayIds.includes('g-pen-st-1::1'),
    run(season, 'penaltyTeam', []).groups.find(g => g.value === 'subject')?.matchingPlayIds.includes('g-pen-st-2::1'),
  ];

  // 9: game-vs-season compare uses one shared run() call shape both sides.
  const compareResult = study.compare({ base: game1, against: season, dimension: 'penaltyTeam', measures: ['penaltyYardsSubject'] });
  const compareRow = compareResult.rows.find(row => row.value === 'subject');

  return {
    rulingCounts,
    subjectYards: subjectGroup?.measures.penaltyYardsSubject,
    opponentYards: opponentGroup?.measures.penaltyYardsOpponent,
    subjectAccepted: subjectGroup?.measures.penaltyAcceptedSubject,
    opponentAccepted: opponentGroup?.measures.penaltyAcceptedOpponent,
    noPlayOffense: noPlay.groups.find(g => g.value === 'offense')?.measures.penaltyNoPlay,
    phaseOffenseAccepted: phaseYards.penaltyAcceptedOffense,
    phaseDefenseAccepted: phaseYards.penaltyAcceptedDefense,
    stUnits,
    fgSpecial,
    g2PuntRate,
    g2Onside,
    bareIdOneRefs,
    compareA: compareRow?.a.measures.penaltyYardsSubject,
    compareB: compareRow?.b.measures.penaltyYardsSubject,
    compareDelta: compareRow?.deltas.penaltyYardsSubject,
  };
});

ok(direct.rulingCounts.accepted === 2 && direct.rulingCounts.declined === 1 && direct.rulingCounts.offsetting === 1 && direct.rulingCounts.unknown === 1,
  'Every penalty disposition (accepted/declined/offsetting/unresolved) is groupable and distinct', JSON.stringify(direct.rulingCounts));
ok(direct.subjectYards === 10 && direct.opponentYards === 15,
  'Accepted-only yards exclude declined/offsetting/unresolved records', JSON.stringify({ subjectYards: direct.subjectYards, opponentYards: direct.opponentYards }));
ok(direct.noPlayOffense === 1, 'No-play/retry penalties are counted independent of disposition', JSON.stringify(direct.noPlayOffense));

ok(direct.subjectAccepted === 1 && direct.opponentAccepted === 1,
  'Team-scoped accepted counts do not double-count an offsetting pair onto both teams (each side has 1 genuinely accepted foul plus 1 offsetting one)', JSON.stringify({ subjectAccepted: direct.subjectAccepted, opponentAccepted: direct.opponentAccepted }));
ok(direct.phaseOffenseAccepted === 1 && direct.phaseDefenseAccepted === 1,
  'Unit/phase-scoped penalty measures answer "penalties on our offensive snaps vs our defensive snaps" honestly', JSON.stringify({ offense: direct.phaseOffenseAccepted, defense: direct.phaseDefenseAccepted }));

const expectedStUnits = ['Extra Point', 'Field Goal', 'Field Goal Block', 'Kick Return', 'Kickoff', 'Punt', 'Punt Return', 'Two-Point Try'];
ok(expectedStUnits.every(u => direct.stUnits.includes(u)) && direct.stUnits.length === expectedStUnits.length,
  'Every Special Teams phase groups under its literal football label, including the XP/2-Pt split', JSON.stringify(direct.stUnits));

ok(direct.fgSpecial.stFieldGoalAtt === 2 && direct.fgSpecial.stFieldGoalMade === 1
  && direct.fgSpecial.stExtraPointAtt === 2 && direct.fgSpecial.stExtraPointMade === 1
  && direct.fgSpecial.stTwoPointAtt === 1 && direct.fgSpecial.stTwoPointMade === 1,
  'Tries (XP/2-Pt) never fold into Field Goal attempted/made counts', JSON.stringify(direct.fgSpecial));

ok(direct.g2PuntRate.stPuntTouchbackPct == null && direct.g2PuntRate.stPuntCount === 0,
  'A structured cohort with zero punts nulls the touchback RATE (never "0%") while the raw punt COUNT stays a real, informative 0', JSON.stringify(direct.g2PuntRate));
ok(direct.g2Onside.stKickoffOnsideAtt == null && direct.g2Onside.stFieldGoalBlockSnaps == null && direct.g2Onside.stTryDownsCount == null,
  'A cohort with no structured Special Teams data at all resolves onside/FG-block/try measures to null -- concepts legacy charting cannot represent, not silently zero', JSON.stringify(direct.g2Onside));

ok(direct.bareIdOneRefs[0] === true && direct.bareIdOneRefs[1] === true,
  'Composite refs distinguish bare play id 1 reused across two different games', JSON.stringify(direct.bareIdOneRefs));

ok(direct.compareA === 10 && direct.compareB === 20 && direct.compareDelta === -10,
  'Game-vs-season comparison computes both sides through the identical measure definition', JSON.stringify({ a: direct.compareA, b: direct.compareB, delta: direct.compareDelta }));

// ---- proof #7: metric refs exactly equal Watch-film refs (through the UI) --
let watch = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const calls = [];
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs: [...refs], label: options?.label }); return Promise.resolve({ completed: true }); };
  document.querySelector('#wsStudyScope').value = 'game';
  document.querySelector('#wsStudyScope').dispatchEvent(new Event('change', { bubbles: true }));
  // The default primary metric is a RICH coaching concept requiring an
  // explicit Offense/Defense unit; a flat penalty measure is unit-agnostic
  // and renders rows regardless, so switch to one before clearing Unit.
  document.querySelector('#wsStudyMeasure').value = 'penaltyFouls';
  document.querySelector('#wsStudyMeasure').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#wsStudyDimension').value = 'penaltyTeam';
  document.querySelector('#wsStudyDimension').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#wsStudyUnit').value = '';
  document.querySelector('#wsStudyUnit').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const rowIndex = [...document.querySelectorAll('.ws-study-row > strong')].findIndex(el => el.textContent === 'opponent');
  document.querySelector(`[data-study-row="${rowIndex}"]`)?.click();
  app.filmNavigation.watch = original;
  return calls;
});
ok(watch.length === 1 && watch[0].refs.sort().join(',') === 'g-pen-st-1::2,g-pen-st-1::4',
  'Clicking Watch on a penaltyTeam=opponent row plays exactly the two plays carrying an opponent-charged penalty (including the offsetting-pair play), no more', JSON.stringify(watch));

watch = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const calls = [];
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs: [...refs], label: options?.label }); return Promise.resolve({ completed: true }); };
  document.querySelector('#wsStudyDimension').value = 'specialTeamsUnit';
  document.querySelector('#wsStudyDimension').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const rowIndex = [...document.querySelectorAll('.ws-study-row > strong')].findIndex(el => el.textContent === 'Field Goal');
  document.querySelector(`[data-study-row="${rowIndex}"]`)?.click();
  app.filmNavigation.watch = original;
  return calls;
});
ok(watch.length === 1 && watch[0].refs.sort().join(',') === 'g-pen-st-1::14,g-pen-st-1::15',
  'Clicking Watch on a Field Goal phase row plays exactly the two FG-attempt plays, never the try-unit plays', JSON.stringify(watch));

// ---- UI-level: measure lens groups exist, denominator honesty, no-zero -----
let ui = await page.evaluate(() => {
  const measureSelect = document.querySelector('#wsStudyMeasure');
  const groupLabels = [...measureSelect.querySelectorAll('optgroup')].map(g => g.label);
  const penaltyOptions = [...measureSelect.querySelectorAll('optgroup[label="Penalties"] option')].map(o => o.value);
  const stOptions = [...measureSelect.querySelectorAll('optgroup[label="Special Teams"] option')].map(o => o.value);
  return { groupLabels, penaltyOptions, stOptions };
});
ok(ui.groupLabels.includes('Penalties') && ui.groupLabels.includes('Special Teams'),
  'The primary-metric picker has clearly labeled Penalties and Special Teams lenses', JSON.stringify(ui.groupLabels));
ok(ui.penaltyOptions.includes('penaltyYardsSubject') && ui.stOptions.includes('stFieldGoalPct'),
  'Penalty and Special Teams measures are selectable as the primary metric', JSON.stringify({ penaltyOptions: ui.penaltyOptions.length, stOptions: ui.stOptions.length }));

// Select a rate measure whose true denominator (FG attempts) differs from the
// group's raw play count, and confirm the Plays column discloses the gap.
await page.select('#wsStudyDimension', 'unit');
await page.select('#wsStudyMeasure', 'stFieldGoalPct');
ui = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ws-study-row')].map(row => ({
    group: row.querySelector('strong')?.textContent,
    plays: row.querySelectorAll('span')[0]?.textContent,
    value: row.querySelectorAll('span')[1]?.textContent,
  }));
  return { rows };
});
const specialRow = ui.rows.find(r => r.group === 'special');
ok(!!specialRow && /^\d+ of \d+$/.test(specialRow.plays),
  'A rate measure with its own denominator discloses "N of M" in the Plays column rather than the raw group sample', JSON.stringify(specialRow));

// A cohort with zero XP attempts anywhere (down/distance dimension, a bucket
// with no special-teams plays at all) must render the rate as "-", not "0%".
await page.select('#wsStudyDimension', 'down');
await page.select('#wsStudyMeasure', 'stExtraPointPct');
ui = await page.evaluate(() => [...document.querySelectorAll('.ws-study-row')].map(row => ({
  group: row.querySelector('strong')?.textContent,
  value: row.querySelectorAll('span')[1]?.textContent,
})));
const downGroup = ui.find(r => r.group === '1' || r.group === '2' || r.group === '3');
ok(!!downGroup && downGroup.value === '—',
  'A down-and-distance group with zero XP attempts renders the rate as "-", never "0%"', JSON.stringify(downGroup));

// ---- saved view round-trip preserves a penalty/Special Teams measure -------
await page.select('#wsStudyDimension', 'penaltyTeam');
await page.select('#wsStudyMeasure', 'penaltyYardsSubject');
await page.evaluate(() => document.querySelector('[data-study-action="save"]').click());
await new Promise(r => setTimeout(r, 50));
await page.select('#wsStudyDimension', 'down');
await page.select('#wsStudyMeasure', 'stFieldGoalPct');
const savedId = await page.evaluate(() => document.querySelector('#wsStudySaved option:last-child')?.value);
await page.select('#wsStudySaved', savedId || '');
ui = await page.evaluate(() => ({
  dimension: document.querySelector('#wsStudyDimension').value,
  measure: document.querySelector('#wsStudyMeasure').value,
}));
ok(ui.dimension === 'penaltyTeam' && ui.measure === 'penaltyYardsSubject',
  'A saved view referencing a penalty measure restores its exact dimension and measure', JSON.stringify(ui));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Page errors:', errors); fail++; }
await browser.close();
process.exit(fail ? 1 : 0);
