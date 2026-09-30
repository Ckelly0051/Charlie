import assert from 'node:assert/strict';
import { ChartingDetails } from '../js/charting-details.js';
import { PlayTagger } from '../js/play-tagger.js';
import { TagProjection } from '../js/tag-projection.js';
import { TagLibrary } from '../js/tag-library.js';
import { SeasonStore } from '../js/season-store.js';
import { SeasonFormat } from '../js/season-format.js';
import { StatsEngine } from '../js/stats-engine.js';
import { AnalyticsRegistry } from '../js/analytics-registry.js';
import { decide, convertPlay, convertSeason, mappingProblems } from './charting-convert.mjs';

let checks = 0;
function test(name, fn) { fn(); checks++; console.log('PASS ' + name); }
test('formation library accepts receiver formation names', () => {
  for (const name of ['Twins','Trips','Bunch','Tight Bunch','Ace','Beast','Victory']) {
    assert.ok(TagLibrary.DEFINITIONS.formationFamily.includes(name));
    assert.ok(!TagLibrary.reservedOwner('formationFamily', name));
    assert.equal(TagProjection.isCombined({ formationFamily: name }), false);
  }
});
test('Receiver Strength is independent and never inferred', () => {
  const t = { formationFamily: 'Trips', receiverSet: '', receiverStrength: 'Left', strength: 'Right' };
  assert.deepEqual(ChartingDetails.orphans(t, 'formationFamily', ''), []);
  t.formationFamily = ''; ChartingDetails.settle(t, 'formationFamily');
  assert.equal(t.receiverStrength, 'Left'); assert.equal(t.strength, 'Right'); assert.equal(t.receiverSet, '');
  assert.equal(TagProjection.project({ formationFamily: 'Trips' }).receiverStrength, '');
});
test('Left, Right and Balanced work without a formation', () => {
  assert.deepEqual(ChartingDetails.RECEIVER_STRENGTHS, ['Left','Right','Balanced']);
  for (const v of ChartingDetails.RECEIVER_STRENGTHS) assert.deepEqual(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverStrength: v } }), []);
  assert.equal(ChartingDetails.vocabularyProblems({ receiverStrength: 'Middle', lineBalance: 'Yes' }).length, 2);
});
test('superseded receiver schema is refused, not interpreted', () => {
  for (const key of ['receiverLook','receiverSide']) {
    assert.ok(SeasonFormat.playProblems({ tags: { unit: 'offense', [key]: '' } }).length);
    assert.ok(SeasonFormat.seasonProblems({ games: [], playbook: { calls: [{ defaults: { [key]: 'Trips' } }] } }).length);
    assert.equal(key in SeasonFormat.currentTagValues({ [key]: 'Trips' }), false);
    assert.equal(key in PlayTagger.blankTags({ unit: 'offense' }), false);
  }
});
test('schema and ST clearing own current fields', () => {
  const t = PlayTagger.blankTags({ unit: 'offense' });
  for (const key of ['formationFamily','receiverStrength','receiverSet','lineBalance']) { assert.equal(t[key], ''); assert.ok(SeasonStore.ST_ALIGNMENT_KEYS.includes(key)); }
});
test('presentation names formation and Receiver Strength without merging the stored fields', () => {
  assert.equal(TagProjection.lookLabel({ qbAlignment: 'Shotgun', backfield: 'Single', formationFamily: 'Tight Bunch', strength: 'Right', receiverStrength: 'Left', receiverSet: '3x1' }), 'Shotgun Tight Bunch Receivers Left 3x1');
});
test('single-value formation still rejects combined fields', () => {
  assert.equal(TagLibrary.reservedOwner('formationFamily', 'Unbalanced'), 'Line Balance');
  assert.ok(TagProjection.isCombined({ formationFamily: 'Trips + Bunch' }));
  assert.ok(TagProjection.isCombined({ formationFamily: 'Trips+Bunch' }));
  assert.ok(TagProjection.isCombined({ formationFamily: 'Shotgun' }));
});
test('exact conversion invents no strength or distribution', () => {
  const d = decide('Trips', {});
  assert.equal(d.status, 'convert'); assert.equal(d.formationFamily, 'Trips'); assert.equal(d.receiverSet, ''); assert.equal(d.receiverStrength, undefined);
});
test('compound names need explicit decisions', () => {
  assert.equal(decide('Trips + Bunch', {}).status, 'unresolved');
  const d = decide('Unbalanced + Bunch + Trips', { combinations: { 'Trips + Bunch + Unbalanced': { formationFamily: 'Bunch', lineBalance: 'Unbalanced' } } });
  assert.equal(d.formationFamily, 'Bunch'); assert.equal(d.lineBalance, 'Unbalanced'); assert.equal(d.receiverStrength, undefined);
});
test('invalid and contradictory mappings are refused', () => {
  assert.ok(mappingProblems({ tokens: { Trips: { receiverStrength: 'Middle' } } }).length);
  assert.ok(mappingProblems({ tokens: { Trips: { receiverLook: 'Trips' } } }).length);
  assert.ok(mappingProblems({ tokens: { Trips: { formationFamily: 'Power-I + Flexbone' } } }).length);
  assert.ok(mappingProblems({ combinations: { 'Trips + Bunch': { formationFamily: 'Bunch' }, 'Bunch + Trips': { formationFamily: 'Trips' } } }).length);
});
test('conversion conflicts preserve the entire source', () => {
  const p = { id: 1, tags: { unit: 'offense', formation: 'Trips', formationFamily: 'Twins' } }, before = structuredClone(p);
  assert.equal(convertPlay(p, {}, 's|g|1').status, 'unresolved'); assert.deepEqual(p, before);
});
test('combination inventory retains composite identity', () => {
  const s = { id: 's', games: [{ id: 'g', plays: [{ id: 1, tags: { unit: 'offense', formation: 'Trips + Unbalanced' } }] }] };
  const r = convertSeason(s, {});
  assert.equal(r.combinations['Trips + Unbalanced'][0].ref, 's|g|1'); assert.equal(r.unresolved.length, 1);
});
test('analytics and film links read independent dimensions', () => {
  const engine = new StatsEngine(null), registry = new AnalyticsRegistry(engine);
  const a = { id: 1, __gid: 'g1', tags: { unit: 'offense', formationFamily: 'Tight Bunch', receiverStrength: 'Left', lineBalance: 'Unbalanced' } };
  const b = { id: 1, __gid: 'g2', tags: { unit: 'offense', formationFamily: 'Trips', receiverStrength: 'Right', lineBalance: 'Balanced' } };
  for (const [key, value] of Object.entries({ formationFamily: 'Tight Bunch', receiverStrength: 'Left', lineBalance: 'Unbalanced' })) {
    assert.deepEqual(registry.values(key, a), [value]);
    assert.deepEqual([a,b].filter(engine._buildCutFilter(key, value)).map(p => `${p.__gid}::${p.id}`), ['g1::1']);
  }
});
console.log(`${checks}/${checks} formation-model checks passed`);
