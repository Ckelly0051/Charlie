/* Phase 4E-a pure special-teams contract. Run: node tools/e2e-special-teams-contract.mjs */
import assert from 'node:assert/strict';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { SeasonStore } from '../js/season-store.js';
import { StatsEngine } from '../js/stats-engine.js';
import { isPlayTagged } from '../js/football-rules.js';

let pass = 0;
const test = (label, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (error) { console.error(`  FAIL  ${label}\n        ${error.message}`); process.exitCode = 1; }
};
const testAsync = async (label, fn) => {
  try { await fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (error) { console.error(`  FAIL  ${label}\n        ${error.message}`); process.exitCode = 1; }
};

const event = (overrides = {}) => ({
  version: 1,
  unit: 'puntReturn',
  subjectRole: 'receiving',
  attemptType: null,
  kick: { kind: 'traditional', direction: 'Left', distance: 43, hangTime: 4.2, landing: { fieldSide: 'own', yardLine: '18' } },
  return: { attempted: true, yards: 12, end: { fieldSide: 'own', yardLine: '30' } },
  outcome: { status: 'returned', recoveredBy: null, score: null, scoredBy: null },
  isOnside: false,
  isFake: false,
  players: { kicker: '', punter: '19', returner: '4', blocker: '', recoverer: '' },
  notes: '',
  legacy: false,
  ...overrides,
});

console.log('\n== Phase 4E-a special-teams contract ==');

test('normalization is idempotent and preserves future keys', () => {
  const input = event({ futureMetric: 'kept', kick: { distance: '43', vendorField: 7 }, return: { attempted: 'yes', yards: '-4' } });
  const once = SpecialTeamsModel.normalize(input);
  const twice = SpecialTeamsModel.normalize(once);
  assert.deepEqual(twice, once);
  assert.equal(once.futureMetric, 'kept');
  assert.equal(once.kick.vendorField, 7);
  assert.equal(once.kick.distance, 43);
  assert.equal(once.return.yards, -4);
  assert.equal(once.return.attempted, null);
});

test('invalid nonnegative measurements fail closed instead of becoming zero', () => {
  const normalized = SpecialTeamsModel.normalize(event({ kick: { distance: -4, hangTime: '-1', operationTime: 'bad' } }));
  assert.equal(normalized.kick.distance, null);
  assert.equal(normalized.kick.hangTime, null);
  assert.equal(normalized.kick.operationTime, null);
});

test('unit owns the canonical subject role', () => {
  assert.equal(SpecialTeamsModel.normalize(event({ unit: 'kickoff', subjectRole: 'receiving' })).subjectRole, 'kicking');
  assert.equal(SpecialTeamsModel.normalize(event({ unit: 'fieldGoalBlock', subjectRole: 'attempting' })).subjectRole, 'defending');
  assert.equal(SpecialTeamsModel.normalize(event({ unit: 'bogus' })), null);
});

test('made kicks attribute points from role without scoreFor', () => {
  const ours = event({ unit: 'fieldGoal', subjectRole: 'attempting', outcome: { status: 'good', score: 'fieldGoal' } });
  const theirs = event({ unit: 'fieldGoalBlock', subjectRole: 'defending', outcome: { status: 'good', score: 'fieldGoal' } });
  assert.equal(SpecialTeamsModel.points(ours), 3);
  assert.equal(SpecialTeamsModel.scoringTeam(ours), 'subject');
  assert.equal(SpecialTeamsModel.scoringTeam(theirs), 'opponent');
});

test('recovery cannot override ownership of a made kick', () => {
  const ours = event({ unit: 'fieldGoal', outcome: { status: 'good', recoveredBy: 'opponent', score: 'fieldGoal' } });
  const theirs = event({ unit: 'fieldGoalBlock', outcome: { status: 'good', recoveredBy: 'subject', score: 'fieldGoal' } });
  assert.equal(SpecialTeamsModel.scoringTeam(ours), 'subject');
  assert.equal(SpecialTeamsModel.scoringTeam(theirs), 'opponent');
});

test('return touchdowns follow the charted unit', () => {
  const ret = event({ unit: 'puntReturn', outcome: { status: 'returned', score: 'touchdown' } });
  const allowed = event({ unit: 'punt', outcome: { status: 'returned', score: 'touchdown' } });
  assert.equal(SpecialTeamsModel.scoringTeam(ret), 'subject');
  assert.equal(SpecialTeamsModel.scoringTeam(allowed), 'opponent');
});

test('recovery and explicit named-team ownership resolve unusual scores', () => {
  const recovered = event({ unit: 'kickoff', outcome: { status: 'recovered', recoveredBy: 'subject', score: 'touchdown' } });
  const override = event({ unit: 'puntReturn', outcome: { status: 'muffed', recoveredBy: 'opponent', score: 'touchdown', scoredBy: 'opponent' } });
  assert.equal(SpecialTeamsModel.scoringTeam(recovered), 'subject');
  assert.equal(SpecialTeamsModel.scoringTeam(override), 'opponent');
});

test('explicit unknown ownership prevents role-based guessing', () => {
  const unknown = event({ unit: 'puntReturn', outcome: { status: 'muffed', recoveredBy: 'unknown', score: 'touchdown', scoredBy: 'unknown' } });
  assert.equal(SpecialTeamsModel.scoringTeam(unknown), 'unknown');
});

test('ambiguous safety fails closed', () => {
  const safety = event({ outcome: { status: 'returned', score: 'safety' } });
  assert.equal(SpecialTeamsModel.points(safety), 2);
  assert.equal(SpecialTeamsModel.scoringTeam(safety), 'unknown');
});

test('punt net requires an explicit touchback rule', () => {
  const returned = event();
  const touchback = event({ unit: 'punt', kick: { distance: 45 }, return: { attempted: false, yards: null }, outcome: { status: 'touchback', score: null } });
  assert.equal(SpecialTeamsModel.netYards(returned), 31);
  assert.equal(SpecialTeamsModel.netYards(touchback), null);
  assert.equal(SpecialTeamsModel.netYards(touchback, { touchbackPenalty: 20 }), 25);
});

test('legacy-only plays are never auto-migrated', () => {
  const play = { tags: { unit: 'special', stType: 'XP', kickOutcome: 'Good', scoreFor: 'them' } };
  assert.equal(SpecialTeamsModel.normalizePlay(play), null);
  assert.equal('specialTeams' in play, false);
  assert.equal(play.tags.scoreFor, 'them');
});

test('malformed structured data is preserved but does not count as tagged', () => {
  const play = { tags: {}, specialTeams: { unit: 'bogus', vendor: 'keep' } };
  assert.equal(SpecialTeamsModel.normalizePlay(play), null);
  assert.equal(play.specialTeams.vendor, 'keep');
  assert.equal(isPlayTagged(play), false);
});

test('season normalization round-trips structured and legacy data', () => {
  const legacy = { id: 1, tags: { unit: 'special', stType: 'Punt', scoreFor: 'them' } };
  const modern = { id: 2, tags: { unit: 'special', stType: '' }, specialTeams: event({ futureMetric: 9 }) };
  const data = { version: 5, type: 'season', games: [{ id: 'g1', plays: [legacy, modern], gameInfo: {} }], activeGameId: 'g1' };
  const store = new SeasonStore({});
  const normalized = store._normalize(JSON.parse(JSON.stringify(data)));
  const reopened = store._normalize(JSON.parse(JSON.stringify(normalized)));
  assert.equal(reopened.games[0].plays[0].tags.scoreFor, 'them');
  assert.equal('specialTeams' in reopened.games[0].plays[0], false);
  assert.equal(reopened.games[0].plays[1].specialTeams.futureMetric, 9);
  assert.equal(reopened.games[0].plays[1].specialTeams.kick.distance, 43);
});

test('StatsEngine prefers structured scoring and keeps legacy fallback', () => {
  const structured = { tags: { unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', scoreFor: 'us' }, specialTeams: event({ unit: 'fieldGoalBlock', outcome: { status: 'good', score: 'fieldGoal' } }) };
  const legacy = { tags: { unit: 'special', stType: 'XP', kickOutcome: 'Good', scoreFor: 'them' } };
  assert.equal(StatsEngine.playPoints(structured), 3);
  assert.equal(StatsEngine.scoringSide(structured), 'them');
  assert.equal(StatsEngine.playPoints(legacy), 1);
  assert.equal(StatsEngine.scoringSide(legacy), 'them');
});

test('a valid non-scoring structured event suppresses stale legacy scoring', () => {
  const missed = { tags: { unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', result: 'Good', scoreFor: 'us' }, specialTeams: event({ unit: 'fieldGoal', outcome: { status: 'noGood', score: null } }) };
  assert.equal(StatsEngine.playPoints(missed), 0);
});

test('a fake may score through its football result without reviving stale kick fields', () => {
  const fakeTd = { tags: { unit: 'special', result: 'Touchdown', kickOutcome: 'No Good' }, specialTeams: event({ unit: 'punt', isFake: true, outcome: { status: 'returned', score: null } }) };
  const fakeMiss = { tags: { unit: 'special', result: 'Good', kickOutcome: 'Good' }, specialTeams: event({ unit: 'fieldGoal', isFake: true, outcome: { status: 'noGood', score: null } }) };
  assert.equal(StatsEngine.playPoints(fakeTd), 6);
  assert.equal(StatsEngine.scoringSide(fakeTd), 'us');
  assert.equal(StatsEngine.playPoints(fakeMiss), 0);
});

test('structured conversion totals and score labels do not depend on legacy tags', () => {
  const xp = { id: 7, tags: { unit: 'special', quarter: 'Q2' }, specialTeams: event({ unit: 'fieldGoal', attemptType: 'extraPoint', outcome: { status: 'good', score: 'extraPoint' } }) };
  const missed = { id: 8, tags: { unit: 'special' }, specialTeams: event({ unit: 'fieldGoal', attemptType: 'extraPoint', outcome: { status: 'noGood', score: null } }) };
  const engine = Object.create(StatsEngine.prototype);
  assert.equal(engine._scoreType(xp), 'XP');
  // refs is additive (Study expansion Phase 2, Codex review finding #1): the
  // exact eligible-cohort composite refs behind att/made. Both plays here are
  // bare fixture objects with no `__gid`, so StatsEngine._compositeRef can't
  // resolve an identity and both ref lists are honestly empty -- not a bug,
  // just this fixture never carrying a game/season context.
  assert.deepEqual(engine._conversionStats([xp, missed]).xp, { att: 2, made: 1, pct: 50, refs: { att: [], made: [], missed: [] } });
});

test('scoreboard tracks ambiguous points without assigning them to either team', () => {
  const safety = { id: 9, tags: { unit: 'special', quarter: 'Q1' }, specialTeams: event({ outcome: { status: 'returned', score: 'safety' } }) };
  const board = Object.create(StatsEngine.prototype).computeScoreboard([safety]);
  assert.equal(board.us, 0);
  assert.equal(board.them, 0);
  assert.equal(board.unattributed, 2);
  assert.equal(board.byQuarter.Q1.unattributed, 2);
});

test('structured reports ignore quarantined legacy details and reconcile unit metrics', () => {
  const play = (id, st, tags = {}) => ({ id, tags: { unit: 'special', ...tags }, specialTeams: st });
  const plays = [
    play(1, event({ unit: 'punt', kick: { distance: 45, hangTime: 4.2 }, return: { attempted: true, yards: 10 }, outcome: { status: 'returned' } })),
    play(2, event({ unit: 'punt', kick: { distance: 40, hangTime: 4.6 }, return: { attempted: false, yards: null }, outcome: { status: 'touchback' } })),
    play(3, event({ unit: 'kickoffReturn', return: { attempted: true, yards: -2 }, outcome: { status: 'returned' } })),
    play(4, event({ unit: 'kickoffReturn', return: { attempted: false, yards: null }, outcome: { status: 'fairCatch' } })),
    play(5, event({ unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 37 }, outcome: { status: 'good', score: 'fieldGoal' } })),
    play(6, event({ unit: 'fieldGoal', attemptType: 'fieldGoal', kick: { distance: 42 }, outcome: { status: 'noGood', score: null } })),
    play(7, event({ unit: 'fieldGoalBlock', outcome: { status: 'blocked', recoveredBy: 'subject' } })),
    { id: 8, tags: { unit: 'special', stType: 'Punt', kickDistance: '99', kickOutcome: 'Touchback' } },
  ];
  const stats = Object.create(StatsEngine.prototype)._specialTeamsStats(plays);
  assert.equal(stats.structured, true);
  assert.equal(stats.punts.n, 2);
  assert.equal(stats.punts.grossAvg, 42.5);
  assert.equal(stats.punts.netAvg, 35);
  assert.equal(stats.returns.kick.avg, -2);
  assert.deepEqual({ made: stats.fg.made, att: stats.fg.att, pct: stats.fg.pct }, { made: 1, att: 2, pct: 50 });
  // refs is additive, same reasoning as above -- this fixture's plays carry
  // no `__gid` either.
  assert.deepEqual(stats.blocks, { n: 1, blocked: 1, refs: { all: [], blocked: [] } });
});

await testAsync('canonical persist, reopen, snapshot, and restore keep the event losslessly', async () => {
  let canonical = null;
  const backups = new Map();
  const backend = {
    saveSeason: async (_seasonId, data) => { canonical = JSON.parse(JSON.stringify(data)); return true; },
    loadSeason: async (_seasonId) => JSON.parse(JSON.stringify(canonical)),
    diskStatus: () => ({ bound: false }),
    createBackup: async (_seasonId, data) => { const id = `b${backups.size + 1}`; backups.set(id, JSON.parse(JSON.stringify(data))); return id; },
    getBackup: async (_seasonId, id) => JSON.parse(JSON.stringify(backups.get(id))),
    listBackups: async (_seasonId) => [],
  };
  const first = new SeasonStore(backend);
  first.currentSeasonId = 's1';
  first.data = first._normalize({ id: 's1', games: [{ id: 'g1', plays: [{ id: 1, tags: { unit: 'special' }, specialTeams: event({ futureMetric: 12 }) }], gameInfo: {} }], activeGameId: 'g1' });
  first.persist();
  await new Promise(resolve => setTimeout(resolve, 0));

  const reopened = new SeasonStore(backend);
  reopened.currentSeasonId = 's1';
  await reopened.load();
  assert.equal(reopened.data.games[0].plays[0].specialTeams.futureMetric, 12);
  const backupId = await reopened.snapshot('Before edit');
  reopened.data.games[0].plays[0].specialTeams.outcome.status = 'muffed';
  await reopened.restoreBackup(backupId);
  assert.equal(reopened.data.games[0].plays[0].specialTeams.outcome.status, 'returned');
  assert.equal(reopened.data.games[0].plays[0].specialTeams.players.returner, '4');
});

console.log(`\n== RESULT: ${pass} passed ==`);
if (process.exitCode) process.exit(process.exitCode);
