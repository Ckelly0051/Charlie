/**
 * Pure-Node contract tests for js/analytics-metrics.js — the shared cohort/
 * metric seam for the bounded analytics architecture cleanup. No browser: the
 * module is genuinely DOM-free, and so are the StatsEngine statics + the
 * `this`-free instance methods (_isSuccessfulPlay, _isSuccessfulPlayEligible,
 * _buildCutFilter for the cut types exercised here) it reuses rather than
 * reimplements.
 *
 * Covers the five Codex review findings from 2026-08-14 explicitly, each
 * under its own section header below:
 *   1. Metric polarity is per unit (offense-produced vs defense-framed pairs).
 *   2. Metric and film cohorts cannot silently disagree (allowUnlinkedPlays).
 *   3. Missing/insufficient data is a distinct state, not silently "ok".
 *   4. (Registry duplication — see e2e-analytics-registry.mjs / AnalyticsRegistry.metricsEngine().)
 *   5. (missingAsZero forwarding is asserted with strict inequality below.)
 */
import assert from 'node:assert/strict';
import { StatsEngine } from '../js/stats-engine.js';
import { AnalyticsMetrics, MetricPolarity, compositeRef } from '../js/analytics-metrics.js';

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}\n${error.stack}`); process.exitCode = 1; }
};

// _isSuccessfulPlay, _isSuccessfulPlayEligible, and _buildCutFilter (for the
// cut types used below: formation, playType) never reference `this` in their
// bodies -- confirmed by reading the source before relying on it here.
// Binding to {} avoids ever needing a real StatsEngine instance, which
// requires a DOM (document.getElementById in its constructor) that pure
// Node doesn't have.
const isSuccessfulPlay = p => StatsEngine.prototype._isSuccessfulPlay.call({}, p);
const isEligiblePlay = p => StatsEngine.prototype._isSuccessfulPlayEligible.call({}, p);
const buildCutFilter = (type, val) => StatsEngine.prototype._buildCutFilter.call({}, type, val);

const deps = { isRun: StatsEngine.isRun, isPass: StatsEngine.isPass, hasResult: StatsEngine.hasResult, isSuccessfulPlay, isEligiblePlay, buildCutFilter };
const metrics = new AnalyticsMetrics(deps);

const play = (id, gid, tags = {}) => ({
  id, __gid: gid, timestamp: { start: 0, end: 5 },
  tags: { unit: 'offense', down: '1', distance: '10', ...tags },
});

console.log('\n== Constructor contract ==');
test('constructor requires isEligiblePlay alongside the other deps', () => {
  assert.throws(() => new AnalyticsMetrics({ isRun: StatsEngine.isRun, isPass: StatsEngine.isPass, hasResult: StatsEngine.hasResult, isSuccessfulPlay }), /isEligiblePlay/);
});

console.log('\n== Finding 1: metric polarity is per unit, not universal ==');
test('metrics named for the accomplishing side are higher-is-better (explosiveRate/yardsPerPlay produced; havocRate/negativeRateForced created)', () => {
  assert.equal(AnalyticsMetrics.polarityOf('explosiveRate'), MetricPolarity.HIGHER, 'gaining explosive plays is good for the team that gained them');
  assert.equal(AnalyticsMetrics.polarityOf('yardsPerPlay'), MetricPolarity.HIGHER, 'gaining more yards/play is good for the team that gained them');
  assert.equal(AnalyticsMetrics.polarityOf('negativeRateForced'), MetricPolarity.HIGHER, 'a defense forcing negative plays on the opponent is good');
  assert.equal(AnalyticsMetrics.polarityOf('havocRate'), MetricPolarity.HIGHER, 'a defense creating havoc is good');
});
test('defense-framed "Allowed" siblings flip polarity for the identical formula', () => {
  assert.equal(AnalyticsMetrics.polarityOf('explosivesAllowedRate'), MetricPolarity.LOWER, 'allowing explosive plays is bad for the defense that allowed them');
  assert.equal(AnalyticsMetrics.polarityOf('yardsAllowedPerPlay'), MetricPolarity.LOWER, 'allowing more yards/play is bad for the defense that allowed them');
  assert.equal(AnalyticsMetrics.polarityOf('havocRateAllowed'), MetricPolarity.LOWER, 'an offense suffering havoc (sacked/picked/stripped) is bad');
  assert.equal(AnalyticsMetrics.polarityOf('negativeRate'), MetricPolarity.LOWER, 'an offense\'s own negative-yardage plays are bad');
});
test('stopRate/successRate need no sibling -- already unambiguous by name, and complementary', () => {
  assert.equal(AnalyticsMetrics.polarityOf('stopRate'), MetricPolarity.HIGHER);
  assert.equal(AnalyticsMetrics.polarityOf('successRate'), MetricPolarity.HIGHER);
});
test('an offense-produced metric and its defense-framed sibling compute the IDENTICAL value from the same cohort -- only polarity differs', () => {
  const cohort = [
    play(1, 'gA', { yardage: '20' }), // explosive (pass default threshold 16)
    play(2, 'gA', { yardage: '3' }),
  ];
  const produced = metrics.metric(cohort, 'explosiveRate');
  const allowed = metrics.metric(cohort, 'explosivesAllowedRate');
  assert.equal(produced.value, allowed.value);
  assert.equal(produced.count, allowed.count);
  assert.notEqual(produced.polarity, allowed.polarity);
});

console.log('\n== Finding 3: eligibility is real, not "every play in the cohort" ==');
test('stopRate/successRate exclude a play with no tagged down/distance/yardage from eligible+denominator by default', () => {
  const cohort = [
    play(1, 'gA', { down: '1', distance: '10', yardage: '6' }), // real data, eligible
    play(2, 'gA', { down: '', distance: '', yardage: '' }),     // nothing tagged -- NOT eligible
  ];
  const stop = metrics.metric(cohort, 'stopRate');
  assert.equal(stop.eligible, 1, 'only the fully-tagged play is eligible');
  assert.equal(stop.denominator, 1, 'the untagged play must not silently inflate the denominator via a fabricated default');
});
test('Codex finding #1 (repair 2): a "1 play" denominator can never open more than 1 clip -- the ineligible play\'s ref must NOT leak into refs even though it has a perfectly resolvable __gid/id', () => {
  const cohort = [
    play(1, 'gA', { down: '1', distance: '10', yardage: '6' }), // eligible
    play(2, 'gA', { down: '', distance: '', yardage: '' }),     // ineligible, but fully resolvable (__gid/id present)
  ];
  const stop = metrics.metric(cohort, 'stopRate');
  assert.equal(stop.denominator, 1);
  assert.deepEqual(stop.refs, ['gA::1'], 'must be exactly one ref -- the ineligible play\'s valid __gid/id must not add a second');
  assert.equal(stop.refs.length, stop.denominator, 'refs.length must equal denominator when nothing is unlinked');
});
test('a short-circuit result (Touchdown/Good/No Good/1st-Down-custom) is eligible even with no down/distance/yardage tagged', () => {
  const cohort = [play(1, 'gA', { down: '', distance: '', yardage: '', result: 'Touchdown' })];
  const stop = metrics.metric(cohort, 'stopRate');
  assert.equal(stop.eligible, 1);
  assert.equal(stop.denominator, 1);
});
test('legacyOptions.missingAsZero reproduces the historical fabricating behavior for stopRate/successRate on request', () => {
  const cohort = [
    play(1, 'gA', { down: '1', distance: '10', yardage: '6' }),
    play(2, 'gA', { down: '', distance: '', yardage: '' }),
  ];
  const honest = metrics.metric(cohort, 'stopRate');
  const legacy = metrics.metric(cohort, 'stopRate', {}, { missingAsZero: true });
  assert.equal(honest.eligible, 1);
  assert.equal(legacy.eligible, 1, 'eligible stays honest even in legacy mode');
  assert.equal(honest.denominator, 1);
  assert.equal(legacy.denominator, 2, 'legacy mode uses the full cohort as denominator');
  assert.notEqual(honest.denominator, legacy.denominator, 'the two modes must disagree on this fixture, or the test proves nothing');
});
test('explosiveRate/negativeRate/havocRate also exclude a play with no tagged yardage from eligible+denominator by default', () => {
  const cohort = [play(1, 'gA', { yardage: '20' }), play(2, 'gA', { yardage: '' })];
  const explosive = metrics.metric(cohort, 'explosiveRate');
  const negative = metrics.metric(cohort, 'negativeRate');
  assert.equal(explosive.eligible, 1);
  assert.equal(explosive.denominator, 1);
  assert.equal(negative.eligible, 1);
  assert.equal(negative.denominator, 1);
});
test('havocRate treats a Sack/INT/Fumble result as eligible even with no yardage tagged (result alone is real data)', () => {
  const cohort = [play(1, 'gA', { yardage: '', result: 'Sack' })];
  const havoc = metrics.metric(cohort, 'havocRate');
  assert.equal(havoc.eligible, 1);
  assert.equal(havoc.denominator, 1);
  assert.equal(havoc.count, 1);
});
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
test('a group below minSample reports state:insufficient, not ok', () => {
  const cohort = [play(1, 'gA', { yardage: '4' }), play(2, 'gA', { yardage: '5' })];
  const ok = metrics.metric(cohort, 'yardsPerPlay', {}, { minSample: 2 });
  const insufficient = metrics.metric(cohort, 'yardsPerPlay', {}, { minSample: 3 });
  assert.equal(ok.state, 'ok');
  assert.equal(insufficient.state, 'insufficient', 'denominator 2 < minSample 3');
});
test('state priority: unavailable beats insufficient (denominator 0 is never merely "insufficient")', () => {
  const result = metrics.metric([], 'yardsPerPlay', {}, { minSample: 3 });
  assert.equal(result.state, 'unavailable');
});
test('minSample is a per-metric denominator check, not a raw-cohort-size check -- a metric can be insufficient while its cohort is large', () => {
  const cohort = [
    play(1, 'gA', { yardage: '4' }), // eligible
    play(2, 'gA', { yardage: '' }), play(3, 'gA', { yardage: '' }), play(4, 'gA', { yardage: '' }), play(5, 'gA', { yardage: '' }),
  ];
  const result = metrics.metric(cohort, 'yardsPerPlay', {}, { minSample: 2 });
  assert.equal(result.eligible, 1, 'only one of the five plays has real yardage');
  assert.equal(result.state, 'insufficient', 'denominator 1 < minSample 2, even though the cohort has 5 plays');
});

console.log('\n== Finding 2: metric and film cohorts cannot silently disagree ==');
test('by default, a play with no resolvable id/game FAILS LOUDLY instead of silently vanishing from refs', () => {
  const malformed = { id: 5, tags: { unit: 'offense', down: '1', distance: '10', yardage: '2' } }; // real data, no __gid -- must be ELIGIBLE so it actually reaches ref resolution
  const cohort = [play(1, 'gA', { yardage: '6' }), malformed];
  assert.throws(() => metrics.metric(cohort, 'stopRate'), /allowUnlinkedPlays/);
});
test('an INELIGIBLE malformed play never reaches ref resolution at all -- excluded from denominator, so its bad ref cannot even trigger the throw', () => {
  const malformed = { id: 5, tags: { unit: 'offense' } }; // no down/distance/yardage, no __gid
  const cohort = [play(1, 'gA', { yardage: '6' }), malformed];
  const result = metrics.metric(cohort, 'stopRate'); // must NOT throw
  assert.equal(result.denominator, 1, 'only the eligible play counts');
  assert.deepEqual(result.refs, ['gA::1']);
});
test('allowUnlinkedPlays:true preserves the legacy silent-omission behavior AND reports unlinkedCount, never hiding the gap', () => {
  const malformed = { id: 5, tags: { unit: 'offense', down: '1', distance: '10', yardage: '2' } }; // real data, no __gid
  const cohort = [play(1, 'gA', { yardage: '6' }), malformed];
  const result = metrics.metric(cohort, 'stopRate', {}, { allowUnlinkedPlays: true });
  assert.deepEqual(result.refs, ['gA::1']);
  assert.equal(result.unlinkedCount, 1);
  assert.equal(result.denominator, 2, 'the malformed play still COUNTS toward the rate -- only its film ref is unresolvable');
  assert.equal(result.state, 'partial-film', 'the gap must be visible in state, not silently absorbed into "ok"');
});
test('unlinkedCount is 0 and state is ok when every play resolves', () => {
  const cohort = [play(1, 'gA', { yardage: '6' }), play(2, 'gA', { yardage: '2' })];
  const result = metrics.metric(cohort, 'stopRate', {}, { allowUnlinkedPlays: true });
  assert.equal(result.unlinkedCount, 0);
  assert.equal(result.state, 'ok');
});
test('state priority: insufficient beats partial-film when both apply to the same result', () => {
  const malformed = { id: 5, tags: { unit: 'offense', down: '1', distance: '10', yardage: '2' } }; // no __gid
  const cohort = [play(1, 'gA', { yardage: '6' }), malformed]; // denominator 2, both unlinked-eligible via allowUnlinkedPlays
  const result = metrics.metric(cohort, 'yardsPerPlay', {}, { allowUnlinkedPlays: true, minSample: 5 });
  assert.equal(result.unlinkedCount, 1, 'partial-film condition is genuinely present');
  assert.equal(result.denominator, 2, 'below minSample:5 -- insufficient condition is genuinely present too');
  assert.equal(result.state, 'insufficient', 'insufficient must win the priority over partial-film');
});
test('compositeRef throws for a DIRECT caller with no resolvable gameId (fail-loud, matching AnalyticsRegistry.playRef)', () => {
  assert.throws(() => compositeRef({ id: 1, tags: {} }), /gameId/);
  assert.equal(compositeRef(play(1, 'gA', {})), 'gA::1');
  assert.equal(compositeRef({ id: 1, tags: {} }, { gameId: 'gC' }), 'gC::1', 'context.gameId is an accepted fallback');
});

console.log('\n== Overlapping multi-value dimensions (cohortByCut delegation) ==');
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
  const result = metrics.metric(trips, 'stopRate', {}, { allowUnlinkedPlays: true });
  assert.equal(result.denominator, 2, 'both plays belong to the Trips cohort exactly once');
  assert.equal(result.count, 1, 'exactly one of the two is a stop (the non-TD, non-1st-down play)');
});

console.log('\n== Exact composite gameId::playId film references ==');
test('two games sharing the same bare play id resolve to distinct composite refs, never collapsed', () => {
  const cohort = [play(5, 'gA', { yardage: '1' }), play(5, 'gB', { yardage: '2' })];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.deepEqual(result.refs, ['gA::5', 'gB::5']);
  assert.equal(result.denominator, 2, 'both plays are counted -- the collision is a ref-identity problem, not a data-loss one');
});
test('refs come back sorted', () => {
  const cohort = [play(9, 'gB', { yardage: '4' }), play(2, 'gA', { yardage: '3' })];
  const result = metrics.metric(cohort, 'yardsPerPlay');
  assert.deepEqual(result.refs, ['gA::2', 'gB::9']);
});
test('a genuine duplicate composite ref (two entries resolving to the same clip) FAILS LOUDLY by default, matching an unresolvable ref', () => {
  const cohort = [play(9, 'gB', { yardage: '4' }), play(9, 'gB', { yardage: '4' })]; // same id, same game -- twice
  assert.throws(() => metrics.metric(cohort, 'yardsPerPlay'), /duplicate composite play reference/);
});
test('allowUnlinkedPlays:true excludes a duplicate from refs and counts it -- never silently keeps one copy while the denominator counts two', () => {
  const cohort = [play(9, 'gB', { yardage: '4' }), play(9, 'gB', { yardage: '4' }), play(2, 'gA', { yardage: '3' })];
  const result = metrics.metric(cohort, 'yardsPerPlay', {}, { allowUnlinkedPlays: true });
  assert.equal(result.denominator, 3, 'all three plays still count toward the value');
  assert.deepEqual(result.refs, ['gA::2', 'gB::9'], 'the duplicate contributes exactly one ref, not two, not zero');
  assert.equal(result.unlinkedCount, 1, 'the second gB::9 occurrence is the one unresolved-for-film play');
  assert.equal(result.refs.length + result.unlinkedCount, result.denominator, 'invariant: refs + unlinked always equals denominator');
  assert.equal(result.state, 'partial-film');
});

console.log(`\n== RESULT: ${passed} passed, ${process.exitCode ? 1 : 0} failed ==`);
if (process.exitCode) process.exit(process.exitCode);
