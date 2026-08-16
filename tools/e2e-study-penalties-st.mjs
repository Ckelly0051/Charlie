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
    // Codex re-review finding #3: a SECOND onside attempt that FAILS to
    // recover (opponent recovers) -- id7 above is a subject recovery, so
    // without this play "attempted" and "recovered" would be the same
    // single-play set and could never discriminate the fix.
    { id: 20, timestamp: t(76), tags: { unit: 'special' }, specialTeams: { unit: 'kickoff', kick: { distance: 10 }, isOnside: true, outcome: { status: 'recovered', recoveredBy: 'opponent' } } },
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

  // Codex review finding #2, reproduced on this fixture's own numbers (not
  // the reviewer's literal 2-vs-3): plays P1 (accepted), P3 (declined), and
  // P4 (offsetting) each carry a genuine subject-team record, so the
  // penaltyTeam=subject ROW correctly matches all 3 plays -- but P4 ALSO
  // carries a sibling OPPONENT-side offsetting record. A whole-play filter
  // that then sums every penalty record on the 3 matched plays (the exact
  // pre-fix bug) would count P1:1 + P3:1 + P4:2 = 4 -- one too many, the
  // opponent's own foul leaking onto the subject row. The GENERIC
  // (non-team-scoped) `penaltyFouls` measure, record-scoped, must report
  // exactly 3: each play's own subject-team record, never P4's opponent one.
  const genericFoulsByTeam = run(game1, 'penaltyTeam', ['penaltyFouls']);
  const subjectFouls = genericFoulsByTeam.groups.find(g => g.value === 'subject');

  // Codex review finding #1, same cohort: the 'subject' group's raw
  // `matchingPlayIds` are still BOTH plays (P1 + P4 -- both genuinely carry a
  // subject record), but the MEASURE's own `measureRefs.penaltyFouls`
  // (record-scoped, via readRefs) must be just those 2 composite refs --
  // proving the record-scoped VALUE and the record-scoped REFS agree.
  const subjectFoulsMatchingPlays = subjectFouls?.matchingPlayIds || [];
  const subjectFoulsRefs = subjectFouls?.measureRefs?.penaltyFouls || [];

  // Codex review finding #3: `penaltyTiming` must no longer exist as a
  // registered/selectable dimension anywhere -- registry, DIMENSIONS array,
  // and DIMENSION_GROUPS.
  const timingDimension = app.analyticsRegistry.getDimension('penaltyTiming');
  const timingInDimensionsList = app.studyScreen.constructor.DIMENSIONS.includes('penaltyTiming');
  const timingInGroups = app.studyScreen.constructor.DIMENSION_GROUPS.some(group => group.ids.includes('penaltyTiming'));
  const timingInSelect = Array.from(document.querySelectorAll('#wsStudyDimension option')).some(o => o.value === 'penaltyTiming');

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

  // Codex re-review finding #2: punt hang time is charted on ONLY id10 (id11
  // fairCatch and id12 blocked both omit `kick.hangTime` entirely). The
  // average must be computed AND film-linked from that single eligible play,
  // never all 3 punts.
  const g1Stats = app.stats.compute(game1);
  const puntHangRefs = app.analyticsRegistry.readRefs(g1Stats, 'stPuntHangAvg');
  const puntHangValue = app.analyticsRegistry.readMeasures(g1Stats, ['stPuntHangAvg']).stPuntHangAvg;

  // Codex re-review finding #3: id7 is a subject-recovered onside kick, id20
  // (added for this repair) is a SEPARATE onside attempt the opponent
  // recovered. "Attempted" must open both; "Recovered" must open only id7 --
  // never id20's failed recovery.
  const onsideAttRefs = app.analyticsRegistry.readRefs(g1Stats, 'stKickoffOnsideAtt');
  const onsideRecoveredRefs = app.analyticsRegistry.readRefs(g1Stats, 'stKickoffOnsideRecovered');
  const onsideRecoveredValue = app.analyticsRegistry.readMeasures(g1Stats, ['stKickoffOnsideAtt', 'stKickoffOnsideRecovered']);

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

  // Codex re-review finding #1, direct: compare()'s row sides must carry
  // measureRefs through from run(), not just matchingPlayIds. Use the exact
  // reviewer-cited shape (a measure whose eligible cohort is narrower than
  // the group's raw sample) grouped by 'unit' and compared game-vs-season.
  const stCompare = study.compare({ base: game1, against: season, dimension: 'unit', measures: ['stFieldGoalAtt'] });
  const stCompareRow = stCompare.rows.find(row => row.value === 'special');

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
    puntHangRefs: (puntHangRefs || []).slice().sort(),
    puntHangValue,
    onsideAttRefs: (onsideAttRefs || []).slice().sort(),
    onsideRecoveredRefs: (onsideRecoveredRefs || []).slice().sort(),
    onsideRecoveredValue,
    stCompareARefs: (stCompareRow?.a.measureRefs?.stFieldGoalAtt || []).slice().sort(),
    stCompareAMatching: (stCompareRow?.a.matchingPlayIds || []).slice().sort(),
    subjectFouls: subjectFouls?.measures.penaltyFouls,
    subjectFoulsMatchingPlays: subjectFoulsMatchingPlays.slice().sort(),
    subjectFoulsRefs: subjectFoulsRefs.slice().sort(),
    timingDimension,
    timingInDimensionsList,
    timingInGroups,
    timingInSelect,
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

// ---- Codex re-review finding #2: average denominators match their refs ----
ok(direct.puntHangValue === 4.2,
  'Punt Hang Time averages only the 1 punt (id10) that actually charted a hang time', String(direct.puntHangValue));
ok(direct.puntHangRefs.join(',') === 'g-pen-st-1::10',
  'Codex re-review finding #2: Punt Hang Time refs open exactly the 1 play the average was computed from -- not all 3 punts, 2 of which never charted a hang time', JSON.stringify(direct.puntHangRefs));

// ---- Codex re-review finding #3: "Recovered" refs exclude a failed recovery
ok(direct.onsideRecoveredValue.stKickoffOnsideAtt === 2 && direct.onsideRecoveredValue.stKickoffOnsideRecovered === 1,
  'Onside Kicks Attempted counts both attempts; Recovered counts only the subject recovery', JSON.stringify(direct.onsideRecoveredValue));
ok(direct.onsideAttRefs.join(',') === 'g-pen-st-1::20,g-pen-st-1::7' && direct.onsideRecoveredRefs.join(',') === 'g-pen-st-1::7',
  'Codex re-review finding #3: "Onside Kicks Recovered" opens only the subject-recovered attempt (id7) -- never id20, whose recovery the opponent won', JSON.stringify({ att: direct.onsideAttRefs, recovered: direct.onsideRecoveredRefs }));

// ---- Codex re-review finding #1, direct: compare() threads measureRefs ----
ok(direct.stCompareAMatching.length === 15,
  'Precondition: the "special" group\'s raw matchingPlayIds (game1 side) is the full 15-play unit sample, broader than the FG-rate measure\'s own eligible cohort', JSON.stringify(direct.stCompareAMatching));
ok(direct.stCompareARefs.join(',') === 'g-pen-st-1::14,g-pen-st-1::15',
  'Codex re-review finding #1: compare()\'s row carries the measure\'s own eligible refs (the 2 FG-attempt plays), not the group\'s broader 15-play matchingPlayIds', JSON.stringify(direct.stCompareARefs));

ok(direct.g2PuntRate.stPuntTouchbackPct == null && direct.g2PuntRate.stPuntCount === 0,
  'A structured cohort with zero punts nulls the touchback RATE (never "0%") while the raw punt COUNT stays a real, informative 0', JSON.stringify(direct.g2PuntRate));
ok(direct.g2Onside.stKickoffOnsideAtt == null && direct.g2Onside.stFieldGoalBlockSnaps == null && direct.g2Onside.stTryDownsCount == null,
  'A cohort with no structured Special Teams data at all resolves onside/FG-block/try measures to null -- concepts legacy charting cannot represent, not silently zero', JSON.stringify(direct.g2Onside));

ok(direct.bareIdOneRefs[0] === true && direct.bareIdOneRefs[1] === true,
  'Composite refs distinguish bare play id 1 reused across two different games', JSON.stringify(direct.bareIdOneRefs));

ok(direct.compareA === 10 && direct.compareB === 20 && direct.compareDelta === -10,
  'Game-vs-season comparison computes both sides through the identical measure definition', JSON.stringify({ a: direct.compareA, b: direct.compareB, delta: direct.compareDelta }));

// ---- Codex review finding #2: multi-foul rows do not leak sibling records --
ok(direct.subjectFouls === 3,
  'Codex review finding #2: the generic (non-team-scoped) penaltyFouls measure, grouped by penaltyTeam=subject, reports exactly the row\'s own 3 subject-team records (P1+P3+P4) -- not 4, which would include P4\'s sibling opponent-side offsetting foul', JSON.stringify(direct.subjectFouls));
ok(direct.subjectFoulsMatchingPlays.join(',') === 'g-pen-st-1::1,g-pen-st-1::3,g-pen-st-1::4' && direct.subjectFoulsRefs.join(',') === 'g-pen-st-1::1,g-pen-st-1::3,g-pen-st-1::4',
  'The subject row\'s raw matchingPlayIds (all 3 plays genuinely carry a subject record) and its record-scoped measureRefs agree -- the value (3) and the ref set (3) describe the same plays, and neither leaks a 4th ref for P4\'s opponent-side sibling', JSON.stringify({ matching: direct.subjectFoulsMatchingPlays, refs: direct.subjectFoulsRefs }));

// ---- Codex review finding #3: penaltyTiming is fully removed, not fixed ----
ok(direct.timingDimension == null,
  'Codex review finding #3: penaltyTiming is no longer a registered AnalyticsRegistry dimension', String(direct.timingDimension));
ok(direct.timingInDimensionsList === false && direct.timingInGroups === false && direct.timingInSelect === false,
  'penaltyTiming does not appear in StudyScreen.DIMENSIONS, DIMENSION_GROUPS, or the rendered dimension <select> -- fabricated pre-snap/live-ball timing is fully retracted, not merely hidden', JSON.stringify({ list: direct.timingInDimensionsList, groups: direct.timingInGroups, select: direct.timingInSelect }));

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
  // Proof #1's decisive case: measure = a Special Teams RATE (its own
  // eligible cohort is the FG-attempt subset, not every Special Teams play)
  // grouped by an UNRELATED dimension ('unit') so the 'special' group's raw
  // sample (14 plays) is far broader than the measure's own denominator (2).
  document.querySelector('#wsStudyMeasure').value = 'stFieldGoalAtt';
  document.querySelector('#wsStudyMeasure').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#wsStudyDimension').value = 'unit';
  document.querySelector('#wsStudyDimension').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const rowIndex = [...document.querySelectorAll('.ws-study-row > strong')].findIndex(el => el.textContent === 'special');
  document.querySelector(`[data-study-row="${rowIndex}"]`)?.click();
  app.filmNavigation.watch = original;
  return calls;
});
ok(watch.length === 1 && watch[0].refs.sort().join(',') === 'g-pen-st-1::14,g-pen-st-1::15',
  'Codex review finding #1: Watch on the "special" unit row plays exactly the 2 FG-attempt plays that produced Field Goal Rate, not all 14 Special Teams plays in that unit group', JSON.stringify(watch));

// ---- Codex re-review finding #1: the SAME check, but in COMPARE mode -------
watch = await page.evaluate(async () => {
  const app = window.app;
  const original = app.filmNavigation.watch;
  const calls = [];
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs: [...refs], label: options?.label }); return Promise.resolve({ completed: true }); };
  document.querySelector('#wsStudyMeasure').value = 'stFieldGoalAtt';
  document.querySelector('#wsStudyMeasure').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#wsStudyDimension').value = 'unit';
  document.querySelector('#wsStudyDimension').dispatchEvent(new Event('change', { bubbles: true }));
  document.querySelector('#wsStudyCompare').value = 'season';
  document.querySelector('#wsStudyCompare').dispatchEvent(new Event('change', { bubbles: true }));
  await new Promise(r => setTimeout(r, 50));
  const rowIndex = [...document.querySelectorAll('.ws-study-row-compare > strong')].findIndex(el => el.textContent === 'special');
  document.querySelector(`[data-study-row="${rowIndex}"]`)?.click();
  document.querySelector('#wsStudyCompare').value = '';
  document.querySelector('#wsStudyCompare').dispatchEvent(new Event('change', { bubbles: true }));
  app.filmNavigation.watch = original;
  return calls;
});
ok(watch.length === 1 && watch[0].refs.sort().join(',') === 'g-pen-st-1::14,g-pen-st-1::15',
  'Codex re-review finding #1: in COMPARE mode (game vs season), Watch on the "special" row still plays exactly the 2 FG-attempt plays -- compare() no longer drops measureRefs and falls back to the 15-play raw group sample', JSON.stringify(watch));

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

// ---- Codex re-review (16941d9): Plays discloses the EXACT film cohort, ----
// ---- not the raw group and not an unrelated attempted-event denominator --
await page.select('#wsStudyDimension', 'unit');
await page.select('#wsStudyMeasure', 'stPuntHangAvg');
ui = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ws-study-row')].map(row => ({
    group: row.querySelector('strong')?.textContent,
    plays: row.querySelectorAll('span')[0]?.textContent,
  }));
  return { rows };
});
const puntHangSpecialRow = ui.rows.find(r => r.group === 'special');
ok(puntHangSpecialRow?.plays === '1 of 15',
  'Codex re-review: Punt Hang Time\'s Plays column discloses "1 of 15" (the exact measured punt) rather than the raw 15-play "special" unit sample', JSON.stringify(puntHangSpecialRow));

await page.select('#wsStudyDimension', 'specialTeamsUnit');
await page.select('#wsStudyMeasure', 'stKickoffOnsideRecovered');
ui = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ws-study-row')].map(row => ({
    group: row.querySelector('strong')?.textContent,
    plays: row.querySelectorAll('span')[0]?.textContent,
  }));
  return { rows };
});
const onsideKickoffRow = ui.rows.find(r => r.group === 'Kickoff');
ok(onsideKickoffRow?.plays === '1 of 3',
  'Codex re-review: "Onside Kicks Recovered"\'s Plays column discloses "1 of 3" (the exact recovered play, out of 3 Kickoff-unit plays) -- never "2" (attempted onsides, a different film cohort than what Watch opens)', JSON.stringify(onsideKickoffRow));

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

// ---- Codex review finding #4: a neutral measure gets no favorable/
// unfavorable coloring in compare mode, even with a real, non-zero delta ----
await page.select('#wsStudyDimension', 'penaltyTeam');
await page.select('#wsStudyMeasure', 'penaltyFouls');
await page.select('#wsStudyCompare', 'season');
await new Promise(r => setTimeout(r, 50));
const neutralDelta = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.ws-study-row-compare')];
  const subjectRow = rows.find(row => row.querySelector('strong')?.textContent === 'subject');
  const deltaSpan = subjectRow?.querySelectorAll('span')[3];
  const barRow = document.querySelector('.ws-study-delta-row');
  return {
    deltaText: deltaSpan?.textContent,
    deltaClass: deltaSpan?.className || '',
    barClass: barRow?.className || '',
  };
});
ok(neutralDelta.deltaText && neutralDelta.deltaText !== '—' && neutralDelta.deltaText !== '0' && neutralDelta.deltaText !== '+0',
  'The neutral-measure compare row has a real, non-zero delta to color (precondition for the finding)', JSON.stringify(neutralDelta));
ok(!/is-positive|is-negative/.test(neutralDelta.deltaClass) && !/is-favorable|is-unfavorable/.test(neutralDelta.barClass),
  'Codex review finding #4: a neutral measure (a raw penalty foul count -- neither declared higher-nor-lower-is-better) receives no favorable/unfavorable green-or-red class on its non-zero delta, in either the row or the bar visualization', JSON.stringify(neutralDelta));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Page errors:', errors); fail++; }
await browser.close();
process.exit(fail ? 1 : 0);
