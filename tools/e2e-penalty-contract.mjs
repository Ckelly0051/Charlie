/* Phase 4D structured penalty contract. Run: node tools/e2e-penalty-contract.mjs */
import assert from 'node:assert/strict';
import { PenaltyModel } from '../js/penalty-model.js';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const test = (label, fn) => { try { fn(); pass++; console.log(`  PASS  ${label}`); } catch (e) { fail++; console.log(`  FAIL  ${label} -- ${e.message}`); } };

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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
