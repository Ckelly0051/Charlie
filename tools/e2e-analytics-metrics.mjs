/**
 * Pure-Node contract tests for js/analytics-metrics.js — the shared cohort/
 * metric seam for the bounded analytics architecture cleanup. No browser: the
 * module is genuinely DOM-free, and so are the StatsEngine statics + the two
 * `this`-free instance methods (_isSuccessfulPlay, _buildCutFilter for the
 * cut types exercised here) it reuses rather than reimplements.
 */
import assert from 'node:assert/strict';
import { StatsEngine } from '../js/stats-engine.js';
import { AnalyticsMetrics, MetricPolarity, compositeRef } from '../js/analytics-metrics.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}\n${error.stack}`); process.exitCode = 1; }
};

// _isSuccessfulPlay and _buildCutFilter (for the cut types used below: formation,
// playType, down, runpass) never reference `this` in their bodies -- confirmed
// by reading the source before relying on it here. Binding to {} avoids ever
// needing a real StatsEngine instance, which requires a DOM (document.getElementById
// in its constructor) that pure Node doesn't have.
const isSuccessfulPlay = p => StatsEngine.prototype._isSuccessfulPlay.call({}, p);
const buildCutFilter = (type, val) => StatsEngine.prototype._buildCutFilter.call({}, type, val);

const deps = { isRun: StatsEngine.isRun, isPass: StatsEngine.isPass, hasResult: StatsEngine.hasResult, isSuccessfulPlay, buildCutFilter };
const metrics = new AnalyticsMetrics(deps);

const play = (id, gid, tags = {}) => ({
  id, __gid: gid, timestamp: { start: 0, end: 5 },
  tags: { unit: 'offense', down: '1', distance: '10', ...tags },
});

console.log('\n== Denominator correctness (yardsPerPlay: honest exclusion vs legacy missingAsZero) ==');
test('honest mode excludes plays with no yardage tag from both eligible and denominator', () => {
  const cohort = [
    play(1, 'gA', { yardage: '5' }),
    play(2, 'gA', { yardage: '10' }),
    play(3, 'gA', { yardage: '-2' }),
    play(4, 'gA', {}), // no yardage tag at all
  ];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.equal(result.eligible, 3);
  assert.equal(result.denominator, 3);
  assert.equal(result.value, +((5 + 10 - 2) / 3).toFixed(1));
});
test('legacy missingAsZero mode uses the full cohort as denominator but still reports the true eligible count', () => {
  const cohort = [
    play(1, 'gA', { yardage: '5' }),
    play(2, 'gA', { yardage: '10' }),
    play(3, 'gA', { yardage: '-2' }),
    play(4, 'gA', {}),
  ];
  const result = metrics.metric(cohort, 'yardsPerPlay', {}, { missingAsZero: true });
  assert.equal(result.eligible, 3, 'eligible must stay honest even in legacy mode');
  assert.equal(result.denominator, 4, 'denominator follows the legacy full-cohort division');
  assert.equal(result.value, +((5 + 10 - 2 + 0) / 4).toFixed(1));
  assert.notEqual(result.value, +((5 + 10 - 2) / 3).toFixed(1), 'the two modes must disagree on this fixture, or the test proves nothing');
});

console.log('\n== Overlapping multi-value dimensions ==');
test('a play tagged with two formations ("Ace + Trips") appears in BOTH single-formation cohorts', () => {
  const plays = [
    play(1, 'gA', { formation: 'Ace + Trips' }),
    play(2, 'gA', { formation: 'Trips' }),
    play(3, 'gA', { formation: 'Ace' }),
  ];
  const trips = metrics.cohortByCut(plays, 'formation', 'Trips');
  const ace = metrics.cohortByCut(plays, 'formation', 'Ace');
  assert.deepEqual(trips.map(p => p.id).sort(), [1, 2], 'play 1 must overlap into the Trips cohort, not just Ace');
  assert.deepEqual(ace.map(p => p.id).sort(), [1, 3], 'play 1 must overlap into the Ace cohort, not just Trips');
});
test('overlap does not double-count a single play\'s stopRate cohort membership', () => {
  const plays = [
    play(1, 'gA', { formation: 'Ace + Trips', result: 'Gain', yardage: '2' }), // fails 1st&10 success (needs 5+)
    play(2, 'gA', { formation: 'Trips', result: 'Touchdown', yardage: '20' }),
  ];
  const trips = metrics.cohortByCut(plays, 'formation', 'Trips');
  const result = metrics.metric(trips, 'stopRate');
  assert.equal(result.denominator, 2, 'both plays belong to the Trips cohort exactly once');
  assert.equal(result.count, 1, 'exactly one of the two is a stop (the non-TD, non-1st-down play)');
});

console.log('\n== Metric polarity ==');
test('higher-is-better metrics are labeled higher', () => {
  assert.equal(AnalyticsMetrics.polarityOf('stopRate'), MetricPolarity.HIGHER);
  assert.equal(AnalyticsMetrics.polarityOf('havocRate'), MetricPolarity.HIGHER);
  assert.equal(AnalyticsMetrics.polarityOf('successRate'), MetricPolarity.HIGHER);
});
test('lower-is-better metrics are labeled lower', () => {
  assert.equal(AnalyticsMetrics.polarityOf('yardsPerPlay'), MetricPolarity.LOWER);
  assert.equal(AnalyticsMetrics.polarityOf('explosiveRate'), MetricPolarity.LOWER);
  assert.equal(AnalyticsMetrics.polarityOf('negativeRate'), MetricPolarity.LOWER);
});
test('every returned metric result carries its definition\'s polarity, not a hardcoded default', () => {
  const cohort = [play(1, 'gA', { yardage: '3' })];
  assert.equal(metrics.metric(cohort, 'stopRate').polarity, MetricPolarity.HIGHER);
  assert.equal(metrics.metric(cohort, 'yardsPerPlay').polarity, MetricPolarity.LOWER);
});

console.log('\n== Missing / insufficient data ==');
test('an empty cohort is unavailable, not a fabricated zero', () => {
  const result = metrics.metric([], 'stopRate');
  assert.equal(result.state, 'unavailable');
  assert.equal(result.value, null);
  assert.equal(result.denominator, 0);
  assert.deepEqual(result.refs, []);
});
test('yardsPerPlay is unavailable (not 0) when every play in a non-empty cohort lacks yardage', () => {
  const cohort = [play(1, 'gA', {}), play(2, 'gA', {})];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.equal(result.eligible, 0);
  assert.equal(result.denominator, 0);
  assert.equal(result.state, 'unavailable');
  assert.equal(result.value, null, 'must not silently report 0.0 yards/play when there is no real data');
});
test('a cohort with SOME missing data is still ok, scoped to what is eligible', () => {
  const cohort = [play(1, 'gA', { yardage: '4' }), play(2, 'gA', {})];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.equal(result.state, 'ok');
  assert.equal(result.value, 4);
});

console.log('\n== Exact composite gameId::playId film references ==');
test('two games sharing the same bare play id resolve to distinct composite refs, never collapsed', () => {
  const cohort = [play(5, 'gA', { yardage: '1' }), play(5, 'gB', { yardage: '2' })];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.deepEqual(result.refs, ['gA::5', 'gB::5']);
  assert.equal(result.denominator, 2, 'both plays are counted -- the collision is a ref-identity problem, not a data-loss one');
});
test('refs are deduped and sorted', () => {
  const cohort = [play(9, 'gB', {}), play(2, 'gA', {}), play(9, 'gB', {})]; // id 9/gB present twice
  const result = metrics.metric(cohort, 'stopRate');
  assert.deepEqual(result.refs, ['gA::2', 'gB::9']);
});
test('a play with no resolvable id/game is silently excluded from refs, matching defensivePerformance\'s original behavior (never throws mid-report)', () => {
  const malformed = { id: 5, tags: { unit: 'offense' } }; // no __gid
  const cohort = [play(1, 'gA', {}), malformed];
  const result = metrics.metric(cohort, 'stopRate');
  assert.deepEqual(result.refs, ['gA::1']);
  assert.equal(result.denominator, 2, 'the malformed play still COUNTS toward the rate -- only its film ref is unresolvable');
});
test('compositeRef throws for a DIRECT caller with no resolvable gameId (fail-loud, matching AnalyticsRegistry.playRef)', () => {
  assert.throws(() => compositeRef({ id: 1, tags: {} }), /gameId/);
  assert.equal(compositeRef(play(1, 'gA', {})), 'gA::1');
  assert.equal(compositeRef({ id: 1, tags: {} }, { gameId: 'gC' }), 'gC::1', 'context.gameId is an accepted fallback');
});

console.log(`\n== RESULT: ${passed} passed, ${process.exitCode ? 1 : 0} failed ==`);
if (process.exitCode) process.exit(process.exitCode);
