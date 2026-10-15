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

/* Missing structured Special Teams data has no legacy fallback and must remain
 * unavailable. */
test('StatsEngine scores the structured event; retired tags score nothing', () => {
  const structured = { tags: { unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', scoreFor: 'us' }, specialTeams: event({ unit: 'fieldGoalBlock', outcome: { status: 'good', score: 'fieldGoal' } }) };
  const legacy = { tags: { unit: 'special', stType: 'XP', kickOutcome: 'Good', scoreFor: 'them' } };
  assert.equal(StatsEngine.playPoints(structured), 3);
  assert.equal(StatsEngine.scoringSide(structured), 'them');
  assert.equal(StatsEngine.playPoints(legacy), 0);
  assert.notEqual(StatsEngine.scoringSide(legacy), 'them', 'scoreFor no longer attributes');
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

test('structured conversion totals and score labels come from the Try unit', () => {
  const xp = { id: 7, tags: { unit: 'special', quarter: 'Q2' }, specialTeams: event({ unit: 'try', attemptType: 'extraPoint', result: 'converted', outcome: { score: 'extraPoint' } }) };
  const missed = { id: 8, tags: { unit: 'special' }, specialTeams: event({ unit: 'try', attemptType: 'extraPoint', result: 'failed', outcome: { score: null } }) };
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

test('return yards come from the possession and end spots, never a stored value', () => {
  const spot = (fieldSide, yardLine) => ({ fieldSide, yardLine });
  const ret = (unit, from, to, extra = {}) => event({ unit, kick: { landing: from }, return: { attempted: true, end: to, ...extra }, outcome: { status: 'returned' } });
  // Coach smoke 112: OLV opening kick return, own 22 to own 38.
  assert.equal(SpecialTeamsModel.returnYards(ret('kickoffReturn', spot('own', '22'), spot('own', '38'))), 16);
  assert.equal(SpecialTeamsModel.returnYards(ret('puntReturn', spot('own', '45'), spot('opp', '30'))), 25);
  // Their return of our kick runs toward our goal: opp 41 to opp 47 is 6.
  assert.equal(SpecialTeamsModel.returnYards(ret('kickoff', spot('opp', '41'), spot('opp', '47'))), 6);
  assert.equal(SpecialTeamsModel.returnYards(ret('punt', spot('own', '40'), spot('own', '44'))), -4);
  assert.equal(SpecialTeamsModel.returnYards(ret('kickoffReturn', spot('own', '20'), spot('own', '20'))), 0);
  // A stored Return Yards value is not read; a missing or invalid spot is unmeasured.
  assert.equal(SpecialTeamsModel.returnYards(ret('puntReturn', spot('', ''), spot('', ''), { yards: 7 })), null);
  assert.equal(SpecialTeamsModel.returnYards(ret('kickoffReturn', spot('own', '22'), spot('own', ''))), null);
  assert.equal(SpecialTeamsModel.returnYards(ret('kickoffReturn', spot('own', '22'), spot('own', '60'))), null);
  assert.equal(SpecialTeamsModel.returnYards(ret('fieldGoalBlock', spot('own', '22'), spot('own', '38'))), null);
  const play = (id, st) => ({ id, tags: { unit: 'special' }, specialTeams: st });
  const stats = Object.create(StatsEngine.prototype)._specialTeamsStats([
    play(1, ret('kickoffReturn', spot('own', '22'), spot('own', '38'))),
    play(2, ret('kickoffReturn', spot('', ''), spot('', ''), { yards: 30 })),
  ]);
  assert.deepEqual({ attempts: stats.returns.kick.attempts, yards: stats.returns.kick.yards }, { attempts: 1, yards: 16 });
});

test('structured reports ignore quarantined legacy details and reconcile unit metrics', () => {
  const play = (id, st, tags = {}) => ({ id, tags: { unit: 'special', ...tags }, specialTeams: st });
  const plays = [
    play(1, event({ unit: 'punt', kick: { distance: 45, hangTime: 4.2, landing: { fieldSide: 'opp', yardLine: '30' } }, return: { attempted: true, end: { fieldSide: 'opp', yardLine: '40' } }, outcome: { status: 'returned' } })),
    play(2, event({ unit: 'punt', kick: { distance: 40, hangTime: 4.6 }, return: { attempted: false, yards: null }, outcome: { status: 'touchback' } })),
    play(3, event({ unit: 'kickoffReturn', kick: { landing: { fieldSide: 'own', yardLine: '20' } }, return: { attempted: true, end: { fieldSide: 'own', yardLine: '18' } }, outcome: { status: 'returned' } })),
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

/* ══ Blocked punt return — the authoring path the board already reported ═══
   The report, the model and the film refs always supported a blocked punt the
   receiving team recovers; the charting vocabulary did not offer `blocked` on
   that unit, so the state could not be authored. The stored unit stays
   `puntReturn`: there is no `puntBlock` value and no migration. */
console.log('\n== Blocked punt return ==');

const blockedTd = () => event({
  outcome: { status: 'blocked', recoveredBy: 'subject', score: 'touchdown', scoredBy: null },
  return: { attempted: true, yards: 18, end: { fieldSide: 'opp', yardLine: '0' } },
  players: { kicker: '', punter: '', returner: '4', blocker: '55', recoverer: '55' },
});

test('the punt-return unit offers Blocked, and the label names the block', () => {
  assert.equal(SpecialTeamsModel.UNIT_LABELS.puntReturn, 'Punt Return / Block');
  assert.ok(SpecialTeamsModel.STATUSES.has('blocked'));
  // No new unit, no new schema value.
  assert.equal(SpecialTeamsModel.ROLES.puntBlock, undefined);
  assert.equal(SpecialTeamsModel.UNIT_LABELS.puntBlock, undefined);
  assert.deepEqual(SpecialTeamsModel.unitOptions().find(([value]) => value === 'puntReturn'),
    ['puntReturn', 'Punt Return / Block']);
});

test('a blocked punt recovered by the subject and returned scores six for the subject', () => {
  const normalized = SpecialTeamsModel.normalize(blockedTd());
  assert.equal(normalized.unit, 'puntReturn');
  assert.equal(normalized.subjectRole, 'receiving');
  assert.equal(normalized.outcome.status, 'blocked');
  assert.equal(normalized.outcome.recoveredBy, 'subject');
  assert.equal(normalized.outcome.score, 'touchdown');
  assert.equal(SpecialTeamsModel.points(normalized), 6);
  assert.equal(SpecialTeamsModel.scoringTeam(normalized), 'subject');
});

test('the same block recovered by the opponent scores for the opponent, and an unknown recovery scores for nobody', () => {
  const theirs = SpecialTeamsModel.normalize(event({
    outcome: { status: 'blocked', recoveredBy: 'opponent', score: 'touchdown', scoredBy: null } }));
  assert.equal(SpecialTeamsModel.scoringTeam(theirs), 'opponent');
  assert.equal(SpecialTeamsModel.points(theirs), 6);
  // Nothing defaults to us: an unrecovered block with a touchdown stays
  // unattributed rather than silently awarding the subject six points.
  const unknown = SpecialTeamsModel.normalize(event({
    outcome: { status: 'blocked', recoveredBy: 'unknown', score: 'touchdown', scoredBy: null } }));
  assert.equal(SpecialTeamsModel.scoringTeam(unknown), 'unknown');
});

test('a loose ball with Possession left BLANK is attributed to nobody, and its points are not lost', () => {
  /* Blank Possession is an ordinary incomplete charting state. Every loose-ball
 * status must fail closed instead of assigning points to a default side. */
  const engine = new StatsEngine(null);
  for (const status of ['blocked', 'muffed', 'recovered']) {
    const blank = SpecialTeamsModel.normalize(event({
      outcome: { status, recoveredBy: null, score: 'touchdown', scoredBy: null } }));
    assert.equal(SpecialTeamsModel.scoringTeam(blank), 'unknown', `${status} with no possession charted`);
    assert.equal(SpecialTeamsModel.points(blank), 6, `${status} still scored six points`);
    const board = engine.computeScoreboard([{ id: 4, tags: { unit: 'special', quarter: 'Q1' }, specialTeams: blank }]);
    assert.equal(board.us, 0, `${status} awards us nothing`);
    assert.equal(board.them, 0, `${status} awards them nothing`);
    assert.equal(board.unattributed, 6, `${status} keeps its points as unattributed`);
  }
  // The coach's explicit answer still wins, in both directions.
  const ours = SpecialTeamsModel.normalize(event({
    outcome: { status: 'blocked', recoveredBy: 'subject', score: 'touchdown', scoredBy: null } }));
  assert.equal(SpecialTeamsModel.scoringTeam(ours), 'subject');
  // And a kick the receiving unit simply fielded keeps its unit default: a
  // return touchdown with no possession field charted is still ours.
  const returned = SpecialTeamsModel.normalize(event({
    outcome: { status: 'returned', recoveredBy: null, score: 'touchdown', scoredBy: null } }));
  assert.equal(SpecialTeamsModel.scoringTeam(returned), 'subject');
});

test('the scoreboard owner credits the block six to us and nothing to them', () => {
  const engine = new StatsEngine(null);
  const play = { id: 7, tags: { unit: 'special', quarter: 'Q2' }, specialTeams: blockedTd() };
  const board = engine.computeScoreboard([play]);
  assert.equal(board.us, 6);
  assert.equal(board.them, 0);
  assert.equal(board.unattributed, undefined);
  assert.equal(board.events.length, 1);
  assert.equal(board.events[0].type, 'TD');
  assert.equal(board.events[0].side, 'us');
  const theirs = engine.computeScoreboard([{ id: 7, tags: { unit: 'special', quarter: 'Q2' },
    specialTeams: event({ outcome: { status: 'blocked', recoveredBy: 'opponent', score: 'touchdown', scoredBy: null } }) }]);
  assert.equal(theirs.us, 0);
  assert.equal(theirs.them, 6);
});

test('the report counts one punt blocked, one punt-return touchdown and the exact film reference', () => {
  const engine = new StatsEngine(null);
  const play = { id: 7, __gid: 'g9', tags: { unit: 'special' }, specialTeams: blockedTd() };
  const st = engine._specialTeamsStats([play]);
  assert.equal(st.returns.punt.n, 1);
  assert.equal(st.returns.punt.blocked, 1);
  assert.equal(st.returns.punt.td, 1);
  assert.equal(st.punts.blocked, 0, 'our punt team did not have a punt blocked');
  assert.equal(st.punts.tdAllowed, 0);
  assert.deepEqual(st.returns.punt.refs.blocked, ['g9::7']);
  assert.deepEqual(st.returns.punt.refs.td, ['g9::7']);
});

await testAsync('the blocked-punt touchdown survives save, reopen and normalization', async () => {
  let canonical = null;
  const backend = {
    saveSeason: async (_id, data) => { canonical = JSON.parse(JSON.stringify(data)); return true; },
    loadSeason: async () => JSON.parse(JSON.stringify(canonical)),
    diskStatus: () => ({ bound: false }),
    createBackup: async () => 'b1',
    listBackups: async () => [],
  };
  const store = new SeasonStore(backend);
  store.currentSeasonId = 's9';
  store.data = store._normalize({ id: 's9', activeGameId: 'g1',
    games: [{ id: 'g1', gameInfo: {}, plays: [{ id: 7, tags: { unit: 'special' }, specialTeams: blockedTd() }] }] });
  store.persist();
  await new Promise(resolve => setTimeout(resolve, 0));

  const reopened = new SeasonStore(backend);
  reopened.currentSeasonId = 's9';
  await reopened.load();
  const saved = reopened.data.games[0].plays[0].specialTeams;
  assert.equal(saved.unit, 'puntReturn');
  assert.equal(saved.outcome.status, 'blocked');
  assert.equal(saved.outcome.recoveredBy, 'subject');
  assert.equal(saved.outcome.score, 'touchdown');
  assert.equal(saved.return.yards, 18);
  assert.equal(saved.players.blocker, '55');
  assert.equal(saved.players.recoverer, '55');
  assert.equal(saved.players.returner, '4');
  // The reopened bytes, not a fresh object, still score the same way.
  assert.equal(SpecialTeamsModel.points(saved), 6);
  assert.equal(SpecialTeamsModel.scoringTeam(saved), 'subject');
  assert.equal(new StatsEngine(null).computeScoreboard(reopened.data.games[0].plays).us, 6);
});

/* ══ The try cohort owns the legacy-compatible XP shape ═══════════════════ */
console.log('\n== Try cohort ownership ==');

// The Field Goal unit's extra point was converted to the Try unit once
// (2026-09-26) and is refused at import; the model no longer reads it.
test('an extra point stored on the Field Goal unit is neither a field goal nor a try', () => {
  const engine = new StatsEngine(null);
  const xpOnKickUnit = { id: 16, __gid: 'g2', tags: { unit: 'special' },
    specialTeams: { version: 1, unit: 'fieldGoal', attemptType: 'extraPoint',
      outcome: { status: 'good', score: 'extraPoint' } } };
  const tryUnit = { id: 27, __gid: 'g2', tags: { unit: 'special' },
    specialTeams: { version: 1, unit: 'tryDefense', attemptType: 'extraPoint', result: 'converted',
      outcome: { score: 'extraPoint' } } };
  const st = engine._specialTeamsStats([xpOnKickUnit, tryUnit]);
  assert.equal(st.fg.att, 0, 'an extra point is not a field-goal attempt');
  assert.equal(st.tries.n, 1, 'only the Try unit charts a try');
  assert.equal(st.tries.tryUnits, 1);
  assert.equal(st.tries.defending, 1);
  assert.deepEqual(st.tries.refs.all, ['g2::27']);
  assert.equal(StatsEngine.playPoints(xpOnKickUnit), 0, 'the retired shape scores nothing');
});

console.log(`\n== RESULT: ${pass} passed ==`);
if (process.exitCode) process.exit(process.exitCode);
