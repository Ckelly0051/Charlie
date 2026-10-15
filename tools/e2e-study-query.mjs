// Query grouping, filters, metrics and exact composite film refs run on the real
// model owners. App wiring and mounted interactions live in e2e-study-screen.
import { StatsEngine } from '../js/stats-engine.js';
import { AnalyticsRegistry } from '../js/analytics-registry.js';
import { StudyQuery } from '../js/study-query.js';
import { SeasonStore } from '../js/season-store.js';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { syntheticEdge } from './fixtures/synthetic-edge.mjs';

const golden = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./parity-golden/synthetic-edge.json', import.meta.url)), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const result = ((fixture) => {
  const stats = new StatsEngine(null);
  const registry = new AnalyticsRegistry(stats);
  const study = new StudyQuery(registry);
  const store = new SeasonStore({});
  store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
  store.currentSeasonId = fixture.id;
  for (const g of store.data.games) for (const p of (g.plays || [])) p.__gid = g.id;
  const plays = store.data.games.flatMap(g => g.plays || []);

  // Read the cut mapping from its owner; independently enumerate its expected groups.
  const dims = { ...study.constructor.DIMENSION_CUT };
  // Independent cut-unit expectations must not borrow StudyQuery's own routing rule.
  const OFF_DIMS = new Set(['formationFamily', 'receiverSet', 'gap', 'motionStart', 'motionEnd', 'rpoRead', 'rpoDecision', 'qbRun', 'qbAlignment', 'playType', 'personnel', 'backfield',
    'strength', 'down', 'playDir', 'motion', 'hash', 'runPass']);
  const isOff = p => (p.tags.unit || 'offense') === 'offense';
  const isDef = p => p.tags.unit === 'defense';
  // Enumerate raw plays, not query output, so a silently dropped group fails.
  const expectedValues = (dim) => {
    const gate = OFF_DIMS.has(dim) ? isOff : isDef;
    const set = new Set();
    for (const p of plays) { if (!gate(p)) continue; for (const v of registry.values(dim, p)) if (v) set.add(v); }
    return [...set].sort();
  };
  const grouped = {};
  for (const [dim, cut] of Object.entries(dims)) {
    const q = study.run({ plays, dimension: dim, measures: ['sampleSize', 'runShare', 'passShare', 'successRate'] });
    grouped[dim] = { cut, total: q.total, expected: expectedValues(dim), groups: q.groups.map(g => ({
      value: g.value, ids: g.matchingPlayIds, sampleSize: g.sampleSize, measures: g.measures,
      // Check registry refs as well as the committed golden.
      registryIds: registry.matchingRefs(plays, cut, g.value),
    })) };
  }

  // OR within a filter, AND across filters.
  const passRun = study.run({ plays, dimension: 'down', filters: [{ dimension: 'runPass', values: ['Run'] }] });
  const expectRun = plays.filter(p => StatsEngine.isRun(p)).length;
  const andQ = study.run({ plays, dimension: 'formationFamily', filters: [{ dimension: 'runPass', values: ['Run'] }, { dimension: 'down', values: ['2'] }] });
  const expectAnd = plays.filter(p => StatsEngine.isRun(p) && (p.tags.down || '') === '2').length;
  const orQ = study.run({ plays, dimension: 'formationFamily', filters: [{ dimension: 'down', values: ['2', '3'] }] });
  const expectOr = plays.filter(p => ['2', '3'].includes(p.tags.down || '')).length;

  // Min-sample warnings (Wildcat/Empty are single-play formations here).
  const minQ = study.run({ plays, dimension: 'formationFamily', minSample: 4 });
  const wild = minQ.groups.find(g => g.value === 'Wildcat');

  // Non-cut dimension (result has no _buildCutFilter cut) still groups + film-links.
  const resultQ = study.run({ plays, dimension: 'result' });
  const tdGroup = resultQ.groups.find(g => g.value === 'Touchdown');

  // Two-cohort comparison: game 1 (base) vs the whole season (against).
  const g1Plays = store.data.games[0].plays;
  const cmp = study.compare({ base: g1Plays, against: plays, dimension: 'formationFamily', measures: ['sampleSize', 'successRate', 'runShare'], labels: { base: 'Game 1', against: 'Season' } });
  /* Shotgun/Pistol are QB alignment, not formations. Spread and game-2-only
 * Flexbone distinguish base-present and base-empty cohorts. */
  const cmpTrips = cmp.rows.find(r => r.value === 'Spread');
  const cmpFlexbone = cmp.rows.find(r => r.value === 'Flexbone'); // g2-only formation
  const cmpMeta = { aTotal: cmp.a.total, bTotal: cmp.b.total, aLabel: cmp.a.label, bLabel: cmp.b.label, valueCount: cmp.rows.length, g1PlayCount: g1Plays.length };

  // Guards.
  const unknownThrows = (() => { try { study.run({ plays, dimension: 'nope' }); return false; } catch { return true; } })();
  /* fieldZone is ready; scoreSituation remains deliberately deferred. */
  const deferredThrows = (() => { try { study.run({ plays, dimension: 'scoreSituation' }); return false; } catch { return true; } })();
  const compareBadArgsThrows = (() => { try { study.compare({ base: plays, against: null, dimension: 'formationFamily' }); return false; } catch { return true; } })();

  // Pin routing where registry membership and cut membership happen to coincide.
  const DC = StudyQuery.DIMENSION_CUT;

  /* runMetrics must group exactly like run; only measure shape differs. stopRate
 * (higher) and yardsAllowedPerPlay (lower) exercise both polarity directions. */
  const richQ = study.runMetrics({ plays, dimension: 'formationFamily', metricIds: ['stopRate', 'yardsAllowedPerPlay'] });
  const richFormationQ = study.run({ plays, dimension: 'formationFamily', measures: ['sampleSize'] });
  const richTrips = richQ.groups.find(g => g.value === 'Spread');

  // One missing yardage guarantees different divisors when missingAsZero is enabled.
  const metricsEngine = registry.metricsEngine();
  const missingYardageCohort = [
    { id: 9001, __gid: 'g1', tags: { unit: 'offense', down: '1', distance: '10', runPass: 'Run', yardage: '6' } },
    { id: 9002, __gid: 'g1', tags: { unit: 'offense', down: '1', distance: '10', runPass: 'Run' } }, // a run with no yardage tag at all
  ];
  const honestYpp = metricsEngine.metric(missingYardageCohort, 'yardsPerPlay');
  const legacyYpp = metricsEngine.metric(missingYardageCohort, 'yardsPerPlay', {}, { missingAsZero: true });

  /* Compare game-1 and season cohorts against the same per-scope golden
 * drilldowns to pin exact film linkage. */
  const cmpMetrics = study.compareMetrics({
    base: g1Plays, against: plays, dimension: 'formationFamily', metricIds: ['stopRate', 'yardsAllowedPerPlay'],
    labels: { base: 'Game 1', against: 'Season' },
  });
  const cmpMetricsTrips = cmpMetrics.rows.find(r => r.value === 'Spread');
  // A metric whose value is genuinely missing on one side must not produce a
  // fabricated delta. 'Flexbone' is the SAME g2-only, base-empty formation
  // already used and verified below for compare()'s own cmpFlexbone case.
  const cmpMetricsFlexbone = cmpMetrics.rows.find(r => r.value === 'Flexbone');
  // Numeric but insufficient samples must not produce a usable delta.
  const cmpMetricsInsufficient = study.compareMetrics({
    base: g1Plays, against: plays, dimension: 'formationFamily', metricIds: ['stopRate'], minSample: 1000,
    labels: { base: 'Game 1', against: 'Season' },
  });
  const cmpMetricsTripsInsufficient = cmpMetricsInsufficient.rows.find(r => r.value === 'Spread');

  /* Query fieldZone directly to prove grouping and film linkage without relying
 * on a report drilldown or golden mapping. */
  const fieldZoneQ = study.run({ plays, dimension: 'fieldZone', measures: ['sampleSize'] });

  return {
    grouped, playCount: plays.length,
    dimCut: { qbAlignment: DC.qbAlignment, coverageFamily: DC.coverageFamily },
    cmpMeta,
    cmpTrips: cmpTrips ? { aIds: cmpTrips.a.matchingPlayIds, bIds: cmpTrips.b.matchingPlayIds, deltas: cmpTrips.deltas, sampleDelta: cmpTrips.sampleDelta } : null,
    cmpFlexbone: cmpFlexbone ? { aSample: cmpFlexbone.a.sampleSize, aIds: cmpFlexbone.a.matchingPlayIds, bIds: cmpFlexbone.b.matchingPlayIds, sampleDelta: cmpFlexbone.sampleDelta } : null,
    compareBadArgsThrows,
    filter: {
      runTotal: passRun.total, expectRun,
      andTotal: andQ.total, expectAnd,
      orTotal: orQ.total, expectOr,
    },
    minWarn: minQ.warnings, wildBelow: wild?.belowMinSample, wildSample: wild?.sampleSize,
    resultTdIds: tdGroup?.matchingPlayIds || null,
    unknownThrows, deferredThrows,
    richGroups: richQ.groups.map(g => ({ value: g.value, sampleSize: g.sampleSize, matchingPlayIds: g.matchingPlayIds })),
    richFormationGroups: richFormationQ.groups.map(g => ({ value: g.value, sampleSize: g.sampleSize, matchingPlayIds: g.matchingPlayIds })),
    richTrips: richTrips ? {
      stopRate: richTrips.metrics.stopRate, yardsAllowedPerPlay: richTrips.metrics.yardsAllowedPerPlay,
      matchingPlayIds: richTrips.matchingPlayIds,
    } : null,
    honestYpp, legacyYpp,
    cmpMetricsMeta: { aTotal: cmpMetrics.a.total, bTotal: cmpMetrics.b.total, aLabel: cmpMetrics.a.label, bLabel: cmpMetrics.b.label },
    cmpMetricsTrips: cmpMetricsTrips ? {
      aStopRate: cmpMetricsTrips.a.metrics.stopRate, bStopRate: cmpMetricsTrips.b.metrics.stopRate,
      deltaStopRate: cmpMetricsTrips.deltas.stopRate,
    } : null,
    cmpMetricsFlexbone: cmpMetricsFlexbone ? {
      aState: cmpMetricsFlexbone.a.metrics.stopRate?.state, bState: cmpMetricsFlexbone.b.metrics.stopRate?.state,
      deltaStopRate: cmpMetricsFlexbone.deltas.stopRate,
    } : null,
    cmpMetricsTripsInsufficient: cmpMetricsTripsInsufficient ? {
      aState: cmpMetricsTripsInsufficient.a.metrics.stopRate?.state, aValue: cmpMetricsTripsInsufficient.a.metrics.stopRate?.value,
      bState: cmpMetricsTripsInsufficient.b.metrics.stopRate?.state, bValue: cmpMetricsTripsInsufficient.b.metrics.stopRate?.value,
      deltaStopRate: cmpMetricsTripsInsufficient.deltas.stopRate,
    } : null,
    // A defense-only cohort grouped by the offense it faced: the offense-gated
    // report cuts would refuse every play, so these group by registry value.
    defenseFaced: ['down', 'formationFamily', 'runPass'].map(dimension => {
      const defense = plays.filter(p => p.tags?.unit === 'defense');
      const q = study.run({ plays: defense, dimension });
      const expected = defense.filter(p => registry.values(dimension, p).length).length;
      return { dimension, groups: q.groups.length, empty: q.groups.filter(g => !g.sampleSize).length,
        grouped: q.groups.reduce((sum, g) => sum + g.sampleSize, 0), expected, multi: !!registry.getDimension(dimension).multi };
    }),
    fieldZoneGroups: fieldZoneQ.groups.map(g => ({ value: g.value, sampleSize: g.sampleSize })),
    fieldZoneTotal: fieldZoneQ.total,
  };
})(syntheticEdge());

{
  // 1. PARITY: every group's matchingPlayIds == the committed golden drilldown.
  const gd = golden.season.drill;
  let parityMismatch = '';
  let checked = 0;
  for (const [dim, block] of Object.entries(result.grouped)) {
    ok(block.total === result.playCount, `${dim}: query cohort == full season play set (${block.total})`);
    for (const g of block.groups) {
      const key = `${block.cut}::${g.value}`;
      const expected = gd[key];
      checked++;
      if (!expected) { parityMismatch = `no golden drilldown for ${key}`; break; }
      if (JSON.stringify(g.ids) !== JSON.stringify(expected)) { parityMismatch = `${key}: ${JSON.stringify(g.ids)} != golden ${JSON.stringify(expected)}`; break; }
      if (g.sampleSize !== g.ids.length) { parityMismatch = `${key}: sampleSize ${g.sampleSize} != ids ${g.ids.length}`; break; }
    }
    if (parityMismatch) break;
  }
  ok(!parityMismatch, `Every Study group's matchingPlayIds equals the parity golden drilldown (${checked} groups)`, parityMismatch);

  /* Registry-ref equality is independent of golden-value equality. */
  let registryMismatch = '';
  let registryChecked = 0;
  for (const [dim, block] of Object.entries(result.grouped)) {
    for (const g of block.groups) {
      registryChecked++;
      if (JSON.stringify(g.ids) !== JSON.stringify(g.registryIds)) {
        registryMismatch = `${dim}::${g.value}: Study ${JSON.stringify(g.ids)} != registry ${JSON.stringify(g.registryIds)}`;
        break;
      }
    }
    if (registryMismatch) break;
  }
  ok(!registryMismatch, `Every Study group's matchingPlayIds equals an INDEPENDENTLY-computed AnalyticsRegistry.matchingRefs (${registryChecked} groups, incl. qbAlignment/coverageFamily)`, registryMismatch);

  // 1d. COMPLETENESS — catches a group Study silently DROPS entirely. Compares
  // the value set Study reported against the value set independently enumerated
  // from raw plays (built above, never touching study.run()'s own output).
  let completenessMismatch = '';
  let dimsChecked = 0;
  for (const [dim, block] of Object.entries(result.grouped)) {
    dimsChecked++;
    const actual = block.groups.map(g => g.value).sort();
    const expected = block.expected;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      completenessMismatch = `${dim}: Study produced ${JSON.stringify(actual)}, independently-enumerated raw plays expect ${JSON.stringify(expected)}`;
      break;
    }
  }
  ok(!completenessMismatch, `Every Study dimension's group SET is complete — no value silently dropped (${dimsChecked} dimensions)`, completenessMismatch);

  // Golden coverage the other way: every report-backed formation drilldown is produced by a group.
  const goldFormations = Object.keys(gd).filter(k => k.startsWith('formationFamily::')).map(k => k.slice('formationFamily::'.length)).sort();
  const queryFormations = result.grouped.formationFamily.groups.map(g => g.value).sort();
  ok(JSON.stringify(goldFormations) === JSON.stringify(queryFormations), 'Formation query values exactly cover the golden formation drilldowns', JSON.stringify({ goldFormations, queryFormations }));

  /* QB alignment and coverage family map to their canonical film cuts. */
  ok(result.dimCut.qbAlignment === 'qbAlignment' && result.dimCut.coverageFamily === 'coverageFamily',
    'Study routes qbAlignment + coverageFamily through their report cuts', JSON.stringify(result.dimCut));

  // 2. Filter semantics.
  ok(result.filter.runTotal === result.filter.expectRun, 'OR-within filter cohort matches isRun set', JSON.stringify(result.filter));
  ok(result.filter.andTotal === result.filter.expectAnd, 'AND-across filters intersect (runPass=Run AND down=2)', JSON.stringify(result.filter));
  ok(result.filter.orTotal === result.filter.expectOr, 'OR-within multi-value filter (down in {2,3})', JSON.stringify(result.filter));

  // 3. Min-sample + non-cut grouping + guards.
  ok(result.wildBelow === true && result.wildSample === 1 && result.minWarn.some(w => /Wildcat/.test(w)), 'Small samples are flagged + warned, not dropped', JSON.stringify({ warn: result.minWarn, s: result.wildSample }));
  ok(JSON.stringify(result.resultTdIds) === JSON.stringify(['g1::7']), 'Non-cut dimension (result) still groups and film-links', JSON.stringify(result.resultTdIds));
  ok(result.unknownThrows, 'Unknown Study dimension fails loudly');
  ok(result.deferredThrows, 'requires-context dimension (scoreSituation) refuses to query');

  // 4. Two-cohort comparison (game vs season).
  const gm = result.cmpMeta;
  ok(gm.aTotal === gm.g1PlayCount && gm.bTotal === result.playCount && gm.aTotal < gm.bTotal && gm.aLabel === 'Game 1' && gm.bLabel === 'Season', 'compare() runs both cohorts with labels + independent totals', JSON.stringify(gm));
  // Both sides stay film-linked to their OWN scope's golden drilldown.
  ok(JSON.stringify(result.cmpTrips.aIds) === JSON.stringify(golden['game:g1'].drill['formationFamily::Spread']), 'compare base side film-links to the game-scope golden');
  ok(JSON.stringify(result.cmpTrips.bIds) === JSON.stringify(golden.season.drill['formationFamily::Spread']), 'compare against side film-links to the season-scope golden');
  ok(typeof result.cmpTrips.deltas.successRate === 'number' && typeof result.cmpTrips.deltas.runShare === 'number', 'compare emits numeric per-measure deltas', JSON.stringify(result.cmpTrips.deltas));
  // A formation present only in game 2 shows an empty base side + a negative sampleDelta.
  ok(result.cmpFlexbone.aSample === 0 && result.cmpFlexbone.aIds.length === 0 && result.cmpFlexbone.sampleDelta < 0 && JSON.stringify(result.cmpFlexbone.bIds) === JSON.stringify(golden.season.drill['formationFamily::Flexbone']), 'compare aligns a value missing from one cohort (Flexbone: base empty, against present)', JSON.stringify(result.cmpFlexbone));
  ok(result.compareBadArgsThrows, 'compare() with a non-array cohort fails loudly');

  // 5. runMetrics() — additive AnalyticsMetrics seam, grouping parity with run().
  ok(JSON.stringify(result.richGroups) === JSON.stringify(result.richFormationGroups),
    'runMetrics() groups identically to run() for the same dimension (same values, sampleSize, matchingPlayIds)',
    JSON.stringify({ rich: result.richGroups, run: result.richFormationGroups }));
  /* Polarity is per unit. Exercise stopRate (higher) and yardsAllowedPerPlay
 * (lower) through the live registry engine. */
  ok(!!result.richTrips && result.richTrips.stopRate.polarity === 'higher' && result.richTrips.yardsAllowedPerPlay.polarity === 'lower',
    'runMetrics() results carry each metric\'s own per-unit polarity', JSON.stringify(result.richTrips));
  ok(!!result.richTrips && JSON.stringify(result.richTrips.stopRate.refs) === JSON.stringify(result.richTrips.matchingPlayIds),
    'runMetrics() metric refs equal the group\'s matchingPlayIds (same composite-ref contract as run())',
    JSON.stringify(result.richTrips));
  /* Use two hand-built plays, one lacking yardage, to guarantee strict
 * inequality when missingAsZero changes. A non-strict comparison could pass
 * with broken forwarding. */
  ok(!!result.honestYpp && !!result.legacyYpp
    && result.honestYpp.denominator === 1 && result.honestYpp.value === 6
    && result.legacyYpp.denominator === 2 && result.legacyYpp.value === 3
    && result.honestYpp.denominator !== result.legacyYpp.denominator,
    'runMetrics({missingAsZero}) genuinely changes the divisor -- exact denominators/values on a fixture proven to differ, not just <=',
    JSON.stringify({ honest: result.honestYpp, legacy: result.legacyYpp }));

  // 6. compareMetrics() — Study expansion, additive runMetrics() sibling of compare().
  ok(result.cmpMetricsMeta.aTotal === result.cmpMeta.aTotal && result.cmpMetricsMeta.bTotal === result.cmpMeta.bTotal,
    'compareMetrics() groups over the SAME two cohorts as compare()', JSON.stringify({ cm: result.cmpMetricsMeta, c: result.cmpMeta }));
  ok(!!result.cmpMetricsTrips && !!result.cmpTrips
    && JSON.stringify(result.cmpMetricsTrips.aStopRate.refs) === JSON.stringify(result.cmpTrips.aIds)
    && JSON.stringify(result.cmpMetricsTrips.bStopRate.refs) === JSON.stringify(result.cmpTrips.bIds),
    'compareMetrics() per-metric refs equal compare()\'s already golden-verified matchingPlayIds for the same rows',
    JSON.stringify({ cm: result.cmpMetricsTrips, c: result.cmpTrips }));
  ok(typeof result.cmpMetricsTrips.deltaStopRate === 'number' && Number.isFinite(result.cmpMetricsTrips.deltaStopRate),
    'compareMetrics() computes a real numeric delta when both sides have usable data', JSON.stringify(result.cmpMetricsTrips));
  ok(!!result.cmpMetricsFlexbone
    // A wholly-missing group has an empty metrics object (matching compare()'s
    // own blank() convention for the flat-measures shape) -- aState is
    // undefined, not a padded 'unavailable' contract.
    && result.cmpMetricsFlexbone.aState === undefined && result.cmpMetricsFlexbone.bState === 'ok'
    && result.cmpMetricsFlexbone.deltaStopRate === null,
    'compareMetrics() never fabricates a delta when one side is unavailable (Flexbone: base empty, against present) -- stays null, not a guessed number',
    JSON.stringify(result.cmpMetricsFlexbone));
  ok(!!result.cmpMetricsTripsInsufficient
    && result.cmpMetricsTripsInsufficient.aState === 'insufficient' && result.cmpMetricsTripsInsufficient.bState === 'insufficient'
    && typeof result.cmpMetricsTripsInsufficient.aValue === 'number' && typeof result.cmpMetricsTripsInsufficient.bValue === 'number'
    && result.cmpMetricsTripsInsufficient.deltaStopRate === null,
    'compareMetrics() never fabricates a delta from two insufficient-sample values, even though both carry real numbers',
    JSON.stringify(result.cmpMetricsTripsInsufficient));

  // 7. fieldZone — real, ready, groups + film-links like any other dimension.
  ok(result.fieldZoneGroups.length > 0 && result.fieldZoneGroups.every(g => g.sampleSize > 0),
    'fieldZone groups the real season fixture into real, non-empty bands', JSON.stringify(result.fieldZoneGroups));
  ok(result.fieldZoneGroups.reduce((sum, g) => sum + g.sampleSize, 0) <= result.fieldZoneTotal,
    'fieldZone group sample sizes never exceed the queried cohort total (single-value dimension, no double count)',
    JSON.stringify({ groups: result.fieldZoneGroups, total: result.fieldZoneTotal }));
}

ok(result.defenseFaced.some(row => row.groups > 0) && result.defenseFaced.every(row => (row.groups > 0 || !row.expected) && row.empty === 0 && (row.multi || row.grouped === row.expected)),
  'Study over defensive plays groups them by the offense they faced: no empty down, formation or run/pass group', JSON.stringify(result.defenseFaced));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
