import assert from 'node:assert/strict';
import { assertCurrentFixture } from './fixture-validation.mjs';
import { integritySeason } from './fixtures/integrity-season.mjs';
import { syntheticEdge } from './fixtures/synthetic-edge.mjs';

let pass = 0, fail = 0;
const test = (label, fn) => { try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (error) { fail++; console.log(`  FAIL  ${label}: ${error.message}`); } };
test('integrity fixture is current before normalization', () => assertCurrentFixture(integritySeason(), 'integrity'));
test('shared parity/Study fixture is current before normalization', () => assertCurrentFixture(syntheticEdge(), 'synthetic edge'));
test('integrity still has 4 games, 48 plays and all three units', () => {
  const season = integritySeason(), plays = season.games.flatMap(g => g.plays);
  assert.equal(season.games.length, 4); assert.equal(plays.length, 48);
  assert.deepEqual([...new Set(plays.map(p => p.tags.unit))].sort(), ['defense', 'offense', 'special']);
});
test('every synthetic Special Teams snap has a structured punt', () => {
  for (const play of integritySeason().games.flatMap(g => g.plays).filter(p => p.tags.unit === 'special')) {
    assert.equal(play.specialTeams?.unit, 'punt'); assert.equal(play.specialTeams?.outcome.status, 'downed');
  }
});
for (const key of ['stType', 'formation', 'receiverStrength']) test(`reject retired ordinary fixture field ${key}`, () => {
  const fixture = integritySeason(); fixture.games[0].plays[0].tags[key] = '';
  assert.throws(() => assertCurrentFixture(fixture, 'mutated'), /invalid ordinary fixture/);
});
test('reject missing unit before normalization', () => {
  const fixture = integritySeason(); delete fixture.games[0].plays[0].tags.unit;
  assert.throws(() => assertCurrentFixture(fixture, 'mutated'), /no unit/);
});
test('reject malformed structured Special Teams', () => {
  const fixture = integritySeason(); fixture.games[0].plays[2].specialTeams = { unit: 'not-a-unit' };
  assert.throws(() => assertCurrentFixture(fixture, 'mutated'), /invalid Special Teams event/);
});
test('reject malformed season structure with an actionable fixture error', () => {
  assert.throws(() => assertCurrentFixture({ games: {} }, 'mutated'), /invalid ordinary fixture/);
});
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exitCode = fail ? 1 : 0;
