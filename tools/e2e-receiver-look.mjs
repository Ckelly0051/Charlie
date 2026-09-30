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
test('Receiver Alignment and Offensive Line Strength stay independent', () => {
  const t = { formationFamily: 'Trips', receiverSet: '3x1', strength: 'Right' };
  assert.deepEqual(ChartingDetails.orphans(t, 'formationFamily', ''), []);
  t.formationFamily = ''; ChartingDetails.settle(t, 'formationFamily');
  assert.equal(t.receiverSet, '3x1'); assert.equal(t.strength, 'Right');
  assert.equal(TagProjection.project({ formationFamily: 'Trips' }).receiverSet, '');
});
test('all left/right alignments with one to five receivers are numerically ordered', () => {
  const expected = [];
  for (let left = 0; left <= 5; left++) for (let right = 0; right <= 5; right++) if (left + right > 0 && left + right <= 5) expected.push(`${left}x${right}`);
  assert.deepEqual(ChartingDetails.RECEIVER_SETS, expected);
  for (const v of expected) assert.deepEqual(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverSet: v } }), []);
  assert.equal(ChartingDetails.vocabularyProblems({ receiverSet: '0x0', strength: 'Yes' }).length, 2);
});
test('superseded receiver schema is refused, not interpreted', () => {
  for (const key of ['receiverLook','receiverSide','receiverStrength','lineBalance']) {
    assert.ok(SeasonFormat.playProblems({ tags: { unit: 'offense', [key]: '' } }).length);
    assert.ok(SeasonFormat.seasonProblems({ games: [], playbook: { calls: [{ defaults: { [key]: 'Trips' } }] } }).length);
    assert.equal(key in SeasonFormat.currentTagValues({ [key]: 'Trips' }), false);
    assert.equal(key in PlayTagger.blankTags({ unit: 'offense' }), false);
  }
});
test('Receiver Alignment rejects non-string values before import or restore', () => {
  for (const receiverSet of [['3x1'], [], {}, 31, false]) {
    assert.ok(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverSet } }).length);
    assert.ok(SeasonFormat.gameProblems({ plays: [{ tags: { unit: 'offense', receiverSet } }] }).length);
    assert.ok(SeasonFormat.seasonProblems({ games: [], playbook: { calls: [{ defaults: { receiverSet } }] } }).length);
  }
  for (const receiverSet of ['', null, undefined, '3x1']) {
    assert.deepEqual(SeasonFormat.playProblems({ tags: { unit: 'offense', receiverSet } }), []);
  }
});
test('schema and ST clearing own current fields', () => {
  const t = PlayTagger.blankTags({ unit: 'offense' });
  for (const key of ['formationFamily','receiverSet','strength']) { assert.equal(t[key], ''); assert.ok(SeasonStore.ST_ALIGNMENT_KEYS.includes(key)); }
});
test('unbalanced line strength preserves its label and derives only its direction', () => {
  assert.deepEqual(ChartingDetails.LINE_STRENGTHS, ['Left','Right','Balanced','Unbalanced Left','Unbalanced Right']);
  const engine = new StatsEngine(null);
  for (const [strength, direction] of [['Unbalanced Left','Left'], ['Unbalanced Right','Right']]) {
    assert.equal(ChartingDetails.strengthSide(strength), direction);
    assert.deepEqual(ChartingDetails.vocabularyProblems({ strength }), []);
    const p = { id: 1, tags: { unit: 'offense', strength, playDir: direction, gap: direction === 'Left' ? 'L-A' : 'R-A', runPass: 'Run', playType: 'Run Inside', yardage: '4' } };
    const c = engine.runGapChart([p], { fallbackGameId: 'g' });
    assert.equal(c.strength.toward.n, 1);
    assert.equal(c.strength.away.n, 0);
    assert.equal(TagProjection.project(p.tags).strength, strength);
    assert.ok(engine._buildCutFilter('strength', strength)(p));
    p.tags.playDir = direction === 'Left' ? 'Right' : 'Left';
    p.tags.gap = direction === 'Left' ? 'R-A' : 'L-A';
    assert.equal(engine.runGapChart([p], { fallbackGameId: 'g' }).strength.away.n, 1);
  }
  assert.equal(ChartingDetails.strengthSide('Balanced'), '');
});
test('presentation keeps the directional alignment as charted', () => {
  assert.equal(TagProjection.lookLabel({ qbAlignment: 'Shotgun', backfield: 'Single', formationFamily: 'Tight Bunch', strength: 'Right', receiverSet: '3x1' }), 'Shotgun Tight Bunch 3x1');
});
test('single-value formation still rejects combined fields', () => {
  assert.equal(TagLibrary.reservedOwner('formationFamily', 'Unbalanced'), 'Offensive Line Strength');
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
  const d = decide('Unbalanced + Bunch + Trips', { combinations: { 'Trips + Bunch + Unbalanced': { formationFamily: 'Bunch', strength: 'Unbalanced Left' } } });
  assert.equal(d.formationFamily, 'Bunch'); assert.equal(d.strength, 'Unbalanced Left'); assert.equal(d.receiverStrength, undefined);
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
  const a = { id: 1, __gid: 'g1', tags: { unit: 'offense', formationFamily: 'Tight Bunch', receiverSet: '3x1', strength: 'Unbalanced Left' } };
  const b = { id: 1, __gid: 'g2', tags: { unit: 'offense', formationFamily: 'Trips', receiverSet: '1x3', strength: 'Balanced' } };
  for (const [key, value] of Object.entries({ formationFamily: 'Tight Bunch', receiverSet: '3x1', strength: 'Unbalanced Left' })) {
    assert.deepEqual(registry.values(key, a), [value]);
    assert.deepEqual([a,b].filter(engine._buildCutFilter(key, value)).map(p => `${p.__gid}::${p.id}`), ['g1::1']);
  }
});
console.log(`${checks}/${checks} formation-model checks passed`);
