/* B2 dedicated try/scoring/routing contract. Run: node tools/e2e-b2-tries.mjs */
import assert from 'node:assert/strict';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { StatsEngine } from '../js/stats-engine.js';
import { SeasonStore } from '../js/season-store.js';
import { isPlayTagged } from '../js/football-rules.js';

let pass = 0;
let fail = 0;
const test = (label, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (error) { fail++; console.error(`  FAIL  ${label}\n        ${error.message}`); process.exitCode = 1; }
};

const special = (overrides = {}) => ({
  version: 1,
  unit: 'try',
  subjectRole: 'attempting',
  attemptType: 'twoPoint',
  result: 'converted',
  events: { badSnap: false, blocked: false, turnover: null, defensiveReturn: false },
  kick: {},
  return: {},
  outcome: { status: null, recoveredBy: null, score: 'twoPoint', scoredBy: null, returnAward: null },
  isOnside: false,
  isFake: false,
  players: {},
  notes: '',
  legacy: false,
  ...overrides,
});

const play = (id, st, tags = {}, extra = {}) => ({
  id,
  tags: {
    unit: 'special', playType: '', runPass: '', result: '', yardage: '',
    down: '', distance: '', fieldSide: 'own', yardLine: '', players: {}, grades: {},
    ...tags,
  },
  specialTeams: st,
  ...extra,
});

console.log('\n== B2 dedicated tries ==');

test('try units normalize canonical role, attempt, result, and independent events', () => {
  const ours = SpecialTeamsModel.normalize(special({
    subjectRole: 'defending',
    events: { badSnap: true, blocked: 'yes', turnover: 'interception', defensiveReturn: true },
  }));
  const theirs = SpecialTeamsModel.normalize(special({ unit: 'tryDefense', subjectRole: 'attempting' }));
  assert.equal(ours.subjectRole, 'attempting');
  assert.equal(theirs.subjectRole, 'defending');
  assert.deepEqual(ours.events, { badSnap: true, blocked: false, turnover: 'interception', defensiveReturn: true });
  assert.equal(ours.result, 'converted');
});

test('only an officially resolved try counts as charted progress', () => {
  assert.equal(isPlayTagged(play(1, special())), true);
  assert.equal(isPlayTagged(play(2, special({ attemptType: null, outcome: { score: null } }))), false);
  assert.equal(isPlayTagged(play(3, special({ result: 'failed', events: { defensiveReturn: true }, outcome: { returnAward: null } }))), false);
  assert.equal(isPlayTagged(play(4, special({ result: 'failed', events: { defensiveReturn: true }, outcome: { returnAward: 'none' } }))), true);
  assert.equal(isPlayTagged(play(5, special(), {}, { penalties: [{ disposition: 'unknown', playCounts: null }] })), false);
  assert.equal(isPlayTagged(play(6, special(), {}, { penalties: [{ disposition: 'accepted', playCounts: false }] })), false);
  assert.equal(isPlayTagged(play(7, special({ result: 'noPlay', outcome: { score: null } }), {}, { penalties: [{ disposition: 'accepted', playCounts: false }] })), true);
});
// The Field Goal unit attempts a field goal and nothing else: the old
// "extra point on the Field Goal unit" shape was converted once (2026-09-26) and
// is refused at import, so the model no longer reads it.
test('field goals stay field goals; the Field Goal unit carries no extra point', () => {
  const fg = SpecialTeamsModel.normalize(special({ unit: 'fieldGoal', attemptType: 'fieldGoal', result: undefined, events: undefined, outcome: { status: 'good', score: 'fieldGoal' } }));
  const xp = SpecialTeamsModel.normalize(special({ unit: 'fieldGoal', attemptType: 'extraPoint', result: undefined, events: undefined, outcome: { status: 'good', score: 'extraPoint' } }));
  assert.equal(fg.attemptType, 'fieldGoal');
  assert.equal(SpecialTeamsModel.points(fg), 3);
  assert.equal(xp.attemptType, null);
  assert.equal(SpecialTeamsModel.points(xp), 0);
});

test('converted, failed, and no-play results govern try points', () => {
  const converted = special();
  const failed = special({ result: 'failed', outcome: { score: 'twoPoint' } });
  const noPlay = special({ result: 'noPlay', outcome: { score: 'twoPoint' } });
  assert.equal(SpecialTeamsModel.points(converted), 2);
  assert.equal(SpecialTeamsModel.points(failed), 0);
  assert.equal(SpecialTeamsModel.points(noPlay), 0);
});

test('bad snap plus converted and blocked XP plus two-point conversion remain representable', () => {
  const badSnap = SpecialTeamsModel.normalize(special({ events: { badSnap: true } }));
  const brokenKick = SpecialTeamsModel.normalize(special({
    attemptType: 'extraPoint',
    events: { blocked: true },
    outcome: { score: 'twoPoint' },
  }));
  assert.equal(badSnap.events.badSnap, true);
  assert.equal(SpecialTeamsModel.points(badSnap), 2);
  assert.equal(brokenKick.attemptType, 'extraPoint');
  assert.equal(brokenKick.outcome.score, 'twoPoint');
  assert.equal(SpecialTeamsModel.points(brokenKick), 2);
});

test('a defensive return never scores without an explicit persisted ruling', () => {
  const unresolved = special({
    result: 'failed',
    events: { turnover: 'interception', defensiveReturn: true },
    outcome: { score: null, scoredBy: null, returnAward: null },
  });
  const none = special({
    result: 'failed',
    events: { turnover: 'interception', defensiveReturn: true },
    outcome: { score: null, scoredBy: null, returnAward: 'none' },
  });
  assert.equal(SpecialTeamsModel.points(unresolved), 0);
  assert.equal(SpecialTeamsModel.points(none), 0);
  assert.equal(SpecialTeamsModel.normalize(none).outcome.returnAward, 'none');
});

test('explicit defensive-return awards score two for the selected team', () => {
  const toOpponent = special({
    result: 'failed',
    events: { turnover: 'interception', defensiveReturn: true },
    outcome: { score: 'twoPoint', scoredBy: 'opponent', returnAward: 'opponent' },
  });
  const toSubject = special({
    unit: 'tryDefense',
    result: 'failed',
    events: { turnover: 'fumble', defensiveReturn: true },
    outcome: { score: 'twoPoint', scoredBy: 'subject', returnAward: 'subject' },
  });
  assert.equal(SpecialTeamsModel.points(toOpponent), 2);
  assert.equal(SpecialTeamsModel.scoringTeam(toOpponent), 'opponent');
  assert.equal(SpecialTeamsModel.points(toSubject), 2);
  assert.equal(SpecialTeamsModel.scoringTeam(toSubject), 'subject');
});

test('conversion totals use official score, exclude no-play and playCounts false', () => {
  const plays = [
    play(1, special()),
    play(2, special({ attemptType: 'extraPoint', events: { blocked: true }, outcome: { score: 'twoPoint' } })),
    play(3, special({ result: 'failed', outcome: { score: null } })),
    play(4, special({ result: 'noPlay', outcome: { score: null } })),
    play(5, special({ result: 'converted' }), {}, { penalties: [{ disposition: 'accepted', playCounts: false }] }),
  ];
  const stats = Object.create(StatsEngine.prototype)._conversionStats(plays);
  // refs is additive (Study expansion Phase 2, Codex review finding #1) --
  // the exact eligible-cohort composite refs behind att/made. This fixture's
  // plays carry no `__gid`, so StatsEngine._compositeRef can't resolve an
  // identity and both ref lists are honestly empty.
  // refs.missed is additive too (Special Teams Presentation Independence) --
  // the exact complement of made within att; empty here for the same reason.
  assert.deepEqual(stats.two, { att: 3, made: 2, pct: 67, refs: { att: [], made: [], missed: [] } });
  assert.deepEqual(stats.xp, { att: 0, made: 0, pct: 0, refs: { att: [], made: [], missed: [] } });
});

test('scoreboard follows explicit try ownership and ignores no-play', () => {
  const board = Object.create(StatsEngine.prototype).computeScoreboard([
    play(1, special(), { quarter: 'Q1' }),
    play(2, special({ unit: 'tryDefense' }), { quarter: 'Q1' }),
    play(3, special({ result: 'noPlay', outcome: { score: 'twoPoint' } }), { quarter: 'Q1' }),
  ]);
  assert.equal(board.us, 2);
  assert.equal(board.them, 2);
  assert.equal(board.unattributed || 0, 0);
});

test('tries stay out of player box scores while a fake rush remains eligible', () => {
  const tryRun = play(1, special(), {
    playType: 'Run Inside', runPass: 'Run', yardage: '3', result: 'Gain',
    players: { ballCarrier: '2' },
  });
  const fakeRun = play(2, SpecialTeamsModel.normalize(special({
    unit: 'punt', result: undefined, events: undefined, attemptType: null,
    outcome: { status: 'returned', score: null }, isFake: true,
  })), {
    playType: 'Run Outside', runPass: 'Run', yardage: '8', result: 'Gain',
    stType: 'Punt', players: { ballCarrier: '4' },
  });
  const stats = Object.create(StatsEngine.prototype)._individualStats([tryRun, fakeRun]);
  assert.deepEqual(stats.rushers.map(row => row.num), ['4']);
  assert.equal(stats.rushers[0].yards, 8);
});

test('generic scout tendencies exclude Special Teams classifiable plays', () => {
  const offense = play(1, null, { unit: 'offense', playType: 'Run Inside', runPass: 'Run', down: '1', distance: '10', formationFamily: 'I-Form', yardage: '5' });
  delete offense.specialTeams;
  const punt = play(2, SpecialTeamsModel.normalize(special({
    unit: 'punt', result: undefined, events: undefined, attemptType: null,
    outcome: { status: 'returned', score: null }, isFake: true,
  })), { playType: 'Run Outside', runPass: 'Run', down: '4', distance: '8', yardage: '10' });
  const engine = Object.create(StatsEngine.prototype);
  engine.compute = () => ({ tendencies: {} });
  const report = engine.generateScoutReport([offense, punt]);
  assert.equal(report.totalPlays, 1);
  assert.deepEqual(report.downTendency.map(row => row.key), ['1&10']);
});

test('compute routes untyped structured plays into their own ST report', () => {
  const punt = play(1, SpecialTeamsModel.normalize(special({
    unit: 'punt', result: undefined, events: undefined, attemptType: null,
    kick: { distance: 40 }, return: { attempted: false },
    outcome: { status: 'downed', score: null }, isFake: false,
  })));
  const engine = Object.create(StatsEngine.prototype);
  engine.tagger = { plays: [punt] };
  engine.filter = null;
  engine.advanced = { summarize: () => ({}) };
  const stats = engine.compute();
  assert.equal(stats.specialTeams.structured, true);
  assert.equal(stats.specialTeams.punts.n, 1);
});

test('compute includes untyped ST specialists without admitting untyped ST tacklers', () => {
  const kickReturn = play(1, SpecialTeamsModel.normalize(special({
    unit: 'kickoffReturn', result: undefined, events: undefined, attemptType: null,
    return: { attempted: true, yards: 19 }, players: { returner: '7' },
    outcome: { status: 'returned', score: null }, isFake: false,
  })), { players: { tackler: '55' } });
  const punt = play(2, SpecialTeamsModel.normalize(special({
    unit: 'punt', result: undefined, events: undefined, attemptType: null,
    kick: { distance: 42 }, players: { punter: '' },
    outcome: { status: 'downed', score: null }, isFake: false,
  })), { players: { kicker: '9' } });
  // A Special Teams snap with no unit charted credits nobody.
  const uncharted = play(3, null, {
    yardage: '11', players: { returner: '3', tackler: '44' },
  });
  delete uncharted.specialTeams;
  const engine = Object.create(StatsEngine.prototype);
  engine.tagger = { plays: [kickReturn, punt, uncharted] };
  engine.filter = null;
  engine.advanced = { summarize: () => ({}) };
  const stats = engine.compute();
  assert.deepEqual(stats.individuals.returners.map(row => row.num).sort(), ['7']);
  assert.equal(stats.individuals.returners.find(row => row.num === '7').yards, 19);
  assert.deepEqual(stats.individuals.kickers.map(row => row.num), ['9']);
  assert.equal(stats.individuals.kickers[0].punts, 1);
  assert.equal(stats.individuals.kickers[0].puntYds, 42);
  assert.deepEqual(stats.individuals.tacklers, []);
});
// ---- Run/Pass and Fake tries (coach, 2026-09-27) -------------------------
test('a run/pass try scores 2 by default and 1 when charted so (youth rules)', () => {
  assert.equal(SpecialTeamsModel.points(special()), 2);
  const one = SpecialTeamsModel.normalize(special({ outcome: { score: 'extraPoint' } }));
  assert.equal(one.outcome.score, 'extraPoint');
  assert.equal(SpecialTeamsModel.points(one), 1);
  assert.equal(SpecialTeamsModel.points(special({ attemptType: 'extraPoint', outcome: { score: 'twoPoint' } })), 2, 'a kick charted for 2 keeps 2');
  assert.equal(SpecialTeamsModel.points(special({ attemptType: 'extraPoint', outcome: { score: null } })), 1, 'a converted kick defaults to 1');
});

test('isRunPassTry names Run/Pass and Fake tries on either side, never a kick', () => {
  const is = st => SpecialTeamsModel.isRunPassTry({ specialTeams: st });
  assert.equal(is(special()), true);
  assert.equal(is(special({ isFake: true })), true);
  assert.equal(is(special({ unit: 'tryDefense', subjectRole: 'defending' })), true);
  assert.equal(is(special({ attemptType: 'extraPoint' })), false);
  assert.equal(is(special({ unit: 'punt', attemptType: null, result: undefined, events: undefined, isFake: true, outcome: { status: 'returned' } })), false);
  assert.equal(SpecialTeamsModel.isRunPassTry({ tags: {} }), false);
});

test('a run/pass try keeps its look; a kicked try is stripped', () => {
  const look = { formationFamily: 'Spread', receiverSet: '3x1', personnel: '11', qbAlignment: 'Shotgun' };
  const runPass = play(1, special(), { ...look });
  SeasonStore.stripStAlignment(runPass);
  assert.deepEqual([runPass.tags.formationFamily, runPass.tags.receiverSet, runPass.tags.personnel, runPass.tags.qbAlignment], ['Spread', '3x1', '11', 'Shotgun']);
  const kick = play(2, special({ attemptType: 'extraPoint' }), { ...look });
  SeasonStore.stripStAlignment(kick);
  assert.deepEqual([kick.tags.formationFamily, kick.tags.receiverSet, kick.tags.personnel, kick.tags.qbAlignment], ['', '', '', '']);
});

test('a run/pass try is in no analytics cohort (coach: the ST report carries kick versus go)', () => {
  const offense = play(1, null, { unit: 'offense', playType: 'Run Inside', runPass: 'Run', formationFamily: 'I-Form', down: '1', distance: '10', yardage: '5', result: 'Gain' });
  delete offense.specialTeams;
  const tryRun = play(2, special(), { playType: 'Run Outside', runPass: 'Run', formationFamily: 'Spread', yardage: '3', result: 'Touchdown', players: { ballCarrier: '2' } });
  const fake = play(3, special({ isFake: true }), { playType: 'Short Pass', runPass: 'Pass', formationFamily: 'Wing-T', yardage: '3', result: 'Touchdown', players: { passer: '7' } });
  const engine = Object.create(StatsEngine.prototype);
  engine.tagger = { plays: [offense, tryRun, fake] };
  engine.filter = null;
  engine.advanced = { summarize: () => ({}) };
  const stats = engine.compute();
  assert.equal(stats.allPlays, 1, 'the classified cohort holds only the scrimmage snap');
  assert.equal(stats.totalPlays, 1);
  assert.deepEqual(stats.individuals.rushers.map(r => r.num), []);
  assert.equal(engine._currentPlays().length, 1);
  assert.equal(stats.specialTeams.tries.n, 2, 'both tries still reach the Special Teams try module');
});
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (process.exitCode) process.exit(process.exitCode);

