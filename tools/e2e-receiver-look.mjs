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
test('four distinct receiver looks', () => assert.deepEqual(ChartingDetails.RECEIVER_LOOKS, ['Twins', 'Trips', 'Bunch', 'Tight Bunch']));
test('a look does not invent side or distribution', () => {
  const tags = { receiverLook: 'Trips', formationFamily: 'I-Form', receiverSet: '' };
  ChartingDetails.settle(tags, 'receiverLook');
  assert.equal(tags.receiverSide, undefined); assert.equal(tags.receiverSet, ''); assert.equal(tags.formationFamily, 'I-Form');
});
test('changing look preserves charted side and line balance', () => {
  const tags = { receiverLook: 'Tight Bunch', receiverSide: 'Right', lineBalance: 'Unbalanced' };
  ChartingDetails.settle(tags, 'receiverLook'); assert.equal(tags.receiverSide, 'Right'); assert.equal(tags.lineBalance, 'Unbalanced');
});
test('removing look names side for confirmation and clears only side', () => {
  const tags = { receiverLook: 'Trips', receiverSide: 'Left', receiverSet: '3x1', lineBalance: 'Unbalanced' };
  assert.deepEqual(ChartingDetails.orphans(tags, 'receiverLook', '').map(o => o.key), ['receiverSide']);
  tags.receiverLook = ''; ChartingDetails.settle(tags, 'receiverLook');
  assert.equal(tags.receiverSide, ''); assert.equal(tags.receiverSet, '3x1'); assert.equal(tags.lineBalance, 'Unbalanced');
});
test('imports reject side without look and invalid vocabulary', () => {
  assert.match(ChartingDetails.problems({ receiverSide: 'Left' }).join(), /Receiver Look/);
  assert.equal(ChartingDetails.vocabularyProblems({ receiverLook: 'Trips + Bunch', receiverSide: 'Middle', lineBalance: 'Yes' }).length, 3);
  assert.ok(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverSide: 'Left' } }).some(p => p.includes('Receiver Look')));
  assert.equal(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverLook: 'Bunch', receiverSide: '', lineBalance: 'Unbalanced' } }).length, 0);
  assert.ok(SeasonFormat.seasonProblems({ games: [], playbook: { calls: [{ name: 'Invalid look', defaults: { receiverSide: 'Left' } }] } }).length);
});
test('new plays and ST clearing include all fields', () => {
  const tags = PlayTagger.blankTags({ unit: 'offense' });
  for (const k of ['receiverLook', 'receiverSide', 'lineBalance']) { assert.equal(tags[k], ''); assert.ok(SeasonStore.ST_ALIGNMENT_KEYS.includes(k)); }
});
test('presentation preserves distinct meanings', () => {
  assert.equal(TagProjection.lookLabel({ qbAlignment: 'Shotgun', formationFamily: 'Spread', receiverLook: 'Tight Bunch', receiverSide: 'Left', lineBalance: 'Unbalanced', receiverSet: '3x1' }), 'Shotgun Spread Unbalanced Tight Bunch Left 3x1');
  assert.equal(TagProjection.project({}).receiverSide, '');
});
test('receiver and line words cannot be added as exact Family choices', () => {
  for (const name of ChartingDetails.RECEIVER_LOOKS) assert.equal(TagLibrary.reservedOwner('formationFamily', name), 'Receiver Look');
  assert.equal(TagLibrary.reservedOwner('formationFamily', 'Unbalanced'), 'Line Balance');
  assert.ok(TagProjection.isCombined({ formationFamily: 'Bunch' }));
  assert.ok(SeasonFormat.playProblems({ tags: { unit: 'offense', formationFamily: 'Unbalanced' } }).includes('combined look'));
});
test('explicit mapping preserves look with uncharted side and set', () => {
  const d = decide('Trips + Unbalanced', { tokens: { Trips: { receiverLook: 'Trips' }, Unbalanced: { lineBalance: 'Unbalanced' } } });
  assert.equal(d.status, 'convert'); assert.equal(d.receiverLook, 'Trips'); assert.equal(d.lineBalance, 'Unbalanced');
  assert.equal(d.receiverSet, ''); assert.equal(d.receiverSide, undefined);
});
test('compound receiver names require an explicit play decision', () => {
  const mapping = { tokens: { Trips: { receiverLook: 'Trips' }, Bunch: { receiverLook: 'Bunch' } }, plays: {} };
  assert.equal(decide('Trips + Bunch', mapping).status, 'unresolved');
  mapping.plays['s|g|1'] = { receiverLook: 'Bunch', receiverSide: 'Right' };
  assert.equal(decide('Trips + Bunch', mapping, 's|g|1').receiverSide, 'Right');
});
test('one explicit combination decision applies regardless of token order', () => {
  const mapping = { combinations: { 'Trips + Bunch + Unbalanced': { receiverLook: 'Bunch', lineBalance: 'Unbalanced' } } };
  const d = decide('Unbalanced + Bunch + Trips', mapping);
  assert.equal(d.receiverLook, 'Bunch'); assert.equal(d.receiverSet, ''); assert.equal(d.receiverSide, undefined);
  assert.equal(decide('Trips + Bunch', mapping).status, 'unresolved');
});
test('contradictory combination decisions are refused', () => {
  const mapping = { combinations: { 'Trips + Bunch': { receiverLook: 'Bunch' }, 'Bunch + Trips': { receiverLook: 'Trips' } } };
  assert.ok(mappingProblems(mapping).length); assert.equal(decide('Trips + Bunch', mapping).status, 'unresolved');
});
test('invalid mapping fields and values are refused', () => {
  assert.ok(mappingProblems({ tokens: { Trips: { receiverLook: 'Trips', receiverSide: 'Middle' } } }).length);
  assert.ok(mappingProblems({ tokens: { Trips: { receiverLook: 'Trips', bunch: true } } }).length);
  assert.equal(decide('Trips', { tokens: { Trips: { receiverLook: 'Trips', bunch: true } } }).status, 'unresolved');
  assert.ok(mappingProblems({ tokens: { Trips: { formationFamily: 'Power-I + Flexbone' } } }).length);
});
test('a conflict leaves the entire source play unchanged', () => {
  const p = { id: 1, tags: { unit: 'offense', formation: 'Trips', receiverLook: 'Twins' } };
  const before = structuredClone(p);
  assert.equal(convertPlay(p, { tokens: { Trips: { receiverLook: 'Trips' } } }, 's|g|1').status, 'unresolved'); assert.deepEqual(p, before);
});
test('combination inventory carries exact composite identities', () => {
  const s = { id: 's', games: [{ id: 'g', plays: [{ id: 1, tags: { unit: 'offense', formation: 'Trips + Unbalanced' } }] }] };
  const r = convertSeason(s, { tokens: {}, plays: {} });
  assert.equal(r.combinations['Trips + Unbalanced'][0].ref, 's|g|1'); assert.equal(r.unresolved.length, 1);
  assert.equal(s.games[0].plays[0].tags.formation, 'Trips + Unbalanced');
});
test('analytics reads each new dimension and its film filter without inference', () => {
  const engine = new StatsEngine(null), registry = new AnalyticsRegistry(engine);
  const a = { id: 1, __gid: 'g1', tags: { unit: 'offense', receiverLook: 'Tight Bunch', receiverSide: 'Left', lineBalance: 'Unbalanced' } };
  const b = { id: 1, __gid: 'g2', tags: { unit: 'offense', receiverLook: 'Trips', receiverSide: 'Right', lineBalance: 'Balanced' } };
  for (const [key, value] of Object.entries({ receiverLook: 'Tight Bunch', receiverSide: 'Left', lineBalance: 'Unbalanced' })) {
    assert.deepEqual(registry.values(key, a), [value]);
    assert.deepEqual([a,b].filter(engine._buildCutFilter(key, value)).map(p => `${p.__gid}::${p.id}`), ['g1::1']);
  }
});
console.log(`${checks}/${checks} receiver-look checks passed`);
