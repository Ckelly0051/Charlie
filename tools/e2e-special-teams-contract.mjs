/* Phase 4E-a pure special-teams contract. Run: node tools/e2e-special-teams-contract.mjs */
import assert from 'node:assert/strict';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { SeasonStore } from '../js/season-store.js';
import { StatsEngine } from '../js/stats-engine.js';

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

await testAsync('canonical persist, reopen, snapshot, and restore keep the event losslessly', async () => {
  let canonical = null;
  const backups = new Map();
  const backend = {
    saveSeason: async data => { canonical = JSON.parse(JSON.stringify(data)); return true; },
    loadSeason: async () => JSON.parse(JSON.stringify(canonical)),
    diskStatus: () => ({ bound: false }),
    createBackup: async data => { const id = `b${backups.size + 1}`; backups.set(id, JSON.parse(JSON.stringify(data))); return id; },
    getBackup: async id => JSON.parse(JSON.stringify(backups.get(id))),
    listBackups: async () => [],
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
