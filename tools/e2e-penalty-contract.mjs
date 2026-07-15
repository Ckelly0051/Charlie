/* Phase 4D structured penalty contract. Run: node tools/e2e-penalty-contract.mjs */
import assert from 'node:assert/strict';
import { PenaltyModel } from '../js/penalty-model.js';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const test = (label, fn) => { try { fn(); pass++; console.log(`  PASS  ${label}`); } catch (e) { fail++; console.log(`  FAIL  ${label} -- ${e.message}`); } };
const testAsync = async (label, fn) => { try { await fn(); pass++; console.log(`  PASS  ${label}`); } catch (e) { fail++; console.log(`  FAIL  ${label} -- ${e.message}`); } };

console.log('\n== Structured penalty contract ==');

test('normalization is idempotent, forward-compatible, and repairs duplicate ids', () => {
  const source = [{ id:'same', team:'subject', phase:'offense', foul:'Holding', disposition:'accepted', yards:'8', playCounts:false, future:7 }, { id:'same', team:'opponent', foul:'Offside', disposition:'declined' }];
  const once = PenaltyModel.normalizeList(source);
  const twice = PenaltyModel.normalizeList(once);
  assert.deepEqual(twice, once);
  assert.notEqual(once[0].id, once[1].id);
  assert.equal(once[0].yards, 8);
  assert.equal(once[0].future, 7);
});

test('invalid enforcement fails closed', () => {
  const p = PenaltyModel.normalizePenalty({ team:'bad', phase:'bad', disposition:'bad', yards:-5, playCounts:'no' });
  assert.deepEqual({ team:p.team, phase:p.phase, disposition:p.disposition, yards:p.yards, playCounts:p.playCounts }, { team:'unknown', phase:'unknown', disposition:'unknown', yards:null, playCounts:null });
});

test('multiple accepted, declined, and offsetting records reconcile separately', () => {
  const plays = [{ id:1, penalties:[
    { team:'subject', phase:'offense', foul:'Holding', disposition:'accepted', yards:8 },
    { team:'opponent', phase:'defense', foul:'Offside', disposition:'declined', yards:5 },
  ] }, { id:2, penalties:[
    { team:'subject', phase:'special', foul:'Block in the Back', disposition:'offsetting', yards:10 },
    { team:'opponent', phase:'special', foul:'Holding', disposition:'offsetting', yards:10 },
  ] }];
  const s = PenaltyModel.summarize(plays);
  assert.deepEqual({ flagged:s.flaggedPlays, fouls:s.fouls, accepted:s.accepted, declined:s.declined, offsetting:s.offsetting, subjectYards:s.subjectYards, opponentYards:s.opponentYards }, { flagged:2, fouls:4, accepted:1, declined:1, offsetting:2, subjectYards:8, opponentYards:0 });
});

test('confirmed resulting situation requires every field', () => {
  const play = { resultingSituation:{ down:'1', distance:'10', fieldSide:'opp', yardLine:'35', confirmed:true } };
  assert.equal(PenaltyModel.confirmedSituation(play).yardLine, '35');
  play.resultingSituation.distance = '';
  assert.equal(PenaltyModel.confirmedSituation(play), null);
});

test('legacy Penalty result is preserved and never migrated', () => {
  const play = { tags:{ result:'Gain + Penalty', yardage:'12' } };
  PenaltyModel.normalizePlay(play);
  assert.equal('penalties' in play, false);
  assert.equal(play.tags.result, 'Gain + Penalty');
});

test('season JSON round-trip keeps multiple fouls and resulting situation', () => {
  const data = { games:[{ id:'g1', gameInfo:{}, plays:[{ id:1, tags:{unit:'offense'}, penalties:[{team:'subject',foul:'Holding',disposition:'accepted',yards:8},{team:'opponent',foul:'Facemask',disposition:'accepted',yards:15}], resultingSituation:{down:'1',distance:'10',fieldSide:'opp',yardLine:'35',confirmed:true} }] }], activeGameId:'g1' };
  const store = new SeasonStore({});
  const reopened = store._normalize(JSON.parse(JSON.stringify(store._normalize(data))));
  assert.equal(reopened.games[0].plays[0].penalties.length, 2);
  assert.equal(PenaltyModel.confirmedSituation(reopened.games[0].plays[0]).down, '1');
});

await testAsync('canonical persist, reopen, snapshot, and restore keep structured enforcement losslessly', async () => {
  let canonical = null;
  const backups = new Map();
  const backend = {
    saveSeason: async data => { canonical = JSON.parse(JSON.stringify(data)); return true; },
    loadSeason: async () => JSON.parse(JSON.stringify(canonical)),
    diskStatus: () => ({ bound:false }),
    createBackup: async data => { const id = `b${backups.size + 1}`; backups.set(id, JSON.parse(JSON.stringify(data))); return id; },
    getBackup: async id => JSON.parse(JSON.stringify(backups.get(id))),
    listBackups: async () => [],
  };
  const source = { id:'s1', games:[{ id:'g1', gameInfo:{}, plays:[{ id:1, tags:{unit:'offense'}, penalties:[
    { team:'subject', phase:'offense', foul:'Holding', disposition:'accepted', yards:8, playCounts:false, notes:'Spot foul' },
    { team:'opponent', phase:'defense', foul:'Facemask', disposition:'declined', yards:15, player:'44' },
  ], resultingSituation:{down:'1',distance:'10',fieldSide:'opp',yardLine:'35',confirmed:true} }] }], activeGameId:'g1' };
  const first = new SeasonStore(backend); first.currentSeasonId = 's1'; first.data = first._normalize(source); first.persist();
  await new Promise(resolve => setTimeout(resolve, 0));
  const reopened = new SeasonStore(backend); reopened.currentSeasonId = 's1'; await reopened.load();
  const saved = reopened.data.games[0].plays[0];
  assert.equal(saved.penalties[0].notes, 'Spot foul'); assert.equal(saved.penalties[1].player, '44');
  const backupId = await reopened.snapshot('Before edit');
  saved.penalties[0].yards = 10; saved.resultingSituation.confirmed = false;
  await reopened.restoreBackup(backupId);
  const restored = reopened.data.games[0].plays[0];
  assert.equal(restored.penalties[0].yards, 8); assert.equal(restored.resultingSituation.confirmed, true);
});

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
