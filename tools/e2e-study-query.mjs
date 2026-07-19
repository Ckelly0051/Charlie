/* StudyQuery executor contract + PARITY gate (redesign Phase 2 spine).
   Proves the pure query engine (window.app.study) that rides on the accepted
   P0-c AnalyticsRegistry:
     1. groups a season play set by a dimension and returns per-group
        `matchingPlayIds` that are BYTE-IDENTICAL to the committed parity golden
        drilldowns (tools/e2e-parity.mjs) for every report-backed dimension — the
        "no lost film link" contract, machine-checked;
     2. AND-across / OR-within filter cohort semantics;
     3. min-sample warnings, non-cut dimension grouping, and fail-loud guards.
   Runs against the BUILT bundle using the SHARED synthetic-edge fixture so the
   golden and this test exercise the identical season. */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { syntheticEdge } from './fixtures/synthetic-edge.mjs';

const golden = JSON.parse(fs.readFileSync(fileURLToPath(new URL('./parity-golden/synthetic-edge.json', import.meta.url)), 'utf-8'));
let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
const APP_URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const result = await page.evaluate((fixture) => {
  const sm = window.app.storage, store = sm.seasonStore, study = window.app.study;
  if (!study) return { missing: true };
  store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
  store.currentSeasonId = fixture.id;
  for (const g of store.data.games) for (const p of (g.plays || [])) p.__gid = g.id;
  sm._loadActiveGame();
  if (window.app.stats.filter) window.app.stats.filter.active = false;
  const plays = store.data.games.flatMap(g => g.plays || []);

  // Dimension -> the golden drilldown cut type it must reproduce.
  const dims = { formation: 'formation', qbAlignment: 'qbAlignment', coverage: 'coverage', coverageFamily: 'coverageFamily', defFront: 'defFront', runPass: 'runpass', down: 'down', personnel: 'personnel', blitz: 'blitz' };
  const grouped = {};
  for (const [dim, cut] of Object.entries(dims)) {
    const q = study.run({ plays, dimension: dim, measures: ['sampleSize', 'runShare', 'passShare', 'successRate'] });
    grouped[dim] = { cut, total: q.total, groups: q.groups.map(g => ({ value: g.value, ids: g.matchingPlayIds, sampleSize: g.sampleSize, measures: g.measures })) };
  }

  // Filter semantics: OR within a filter, AND across filters.
  const isOff = p => (p.tags.unit || 'offense') === 'offense';
  const passRun = study.run({ plays, dimension: 'down', filters: [{ dimension: 'runPass', values: ['Run'] }] });
  const expectRun = plays.filter(p => window.app.stats.constructor.isRun(p)).length;
  const andQ = study.run({ plays, dimension: 'formation', filters: [{ dimension: 'runPass', values: ['Run'] }, { dimension: 'down', values: ['2'] }] });
  const expectAnd = plays.filter(p => window.app.stats.constructor.isRun(p) && (p.tags.down || '') === '2').length;
  const orQ = study.run({ plays, dimension: 'formation', filters: [{ dimension: 'down', values: ['2', '3'] }] });
  const expectOr = plays.filter(p => ['2', '3'].includes(p.tags.down || '')).length;

  // Min-sample warnings (Wildcat/Empty are single-play formations here).
  const minQ = study.run({ plays, dimension: 'formation', minSample: 4 });
  const wild = minQ.groups.find(g => g.value === 'Wildcat');

  // Non-cut dimension (result has no _buildCutFilter cut) still groups + film-links.
  const resultQ = study.run({ plays, dimension: 'result' });
  const tdGroup = resultQ.groups.find(g => g.value === 'Touchdown');

  // Two-cohort comparison: game 1 (base) vs the whole season (against).
  const g1Plays = store.data.games[0].plays;
  const cmp = study.compare({ base: g1Plays, against: plays, dimension: 'formation', measures: ['sampleSize', 'successRate', 'runShare'], labels: { base: 'Game 1', against: 'Season' } });
  // Post-E3a projection: 'Shotgun'/'Pistol' are QB ALIGNMENT, not formations, so the
  // surviving structural formations are used — 'Trips' (both games) and 'Flexbone'
  // (g2-only), mirroring the base-present / base-empty cohort intent.
  const cmpTrips = cmp.rows.find(r => r.value === 'Trips');
  const cmpFlexbone = cmp.rows.find(r => r.value === 'Flexbone'); // g2-only formation
  const cmpMeta = { aTotal: cmp.a.total, bTotal: cmp.b.total, aLabel: cmp.a.label, bLabel: cmp.b.label, valueCount: cmp.rows.length, g1PlayCount: g1Plays.length };

  // Guards.
  const unknownThrows = (() => { try { study.run({ plays, dimension: 'nope' }); return false; } catch { return true; } })();
  const deferredThrows = (() => { try { study.run({ plays, dimension: 'fieldZone' }); return false; } catch { return true; } })();
  const compareBadArgsThrows = (() => { try { study.compare({ base: plays, against: null, dimension: 'formation' }); return false; } catch { return true; } })();

  // Finding 1: the new dimensions must ROUTE THROUGH the report cut (film-link
  // parity), not registry membership. On this fixture both paths coincide, so pin
  // the mapping structurally — removing it must fail here.
  const DC = window.app.study.constructor.DIMENSION_CUT;
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
  };
}, syntheticEdge());

ok(!result.missing, 'App exposes window.app.study (StudyQuery)');
if (!result.missing) {
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

  // Golden coverage the other way: every report-backed formation drilldown is produced by a group.
  const goldFormations = Object.keys(gd).filter(k => k.startsWith('formation::')).map(k => k.slice('formation::'.length)).sort();
  const queryFormations = result.grouped.formation.groups.map(g => g.value).sort();
  ok(JSON.stringify(goldFormations) === JSON.stringify(queryFormations), 'Formation query values exactly cover the golden formation drilldowns', JSON.stringify({ goldFormations, queryFormations }));

  // 1b. The two new E3a dimensions map to their canonical cuts (film-link parity,
  //     not registry membership) — finding 1.
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
  ok(result.deferredThrows, 'requires-context dimension (fieldZone) refuses to query');

  // 4. Two-cohort comparison (game vs season).
  const gm = result.cmpMeta;
  ok(gm.aTotal === gm.g1PlayCount && gm.bTotal === result.playCount && gm.aTotal < gm.bTotal && gm.aLabel === 'Game 1' && gm.bLabel === 'Season', 'compare() runs both cohorts with labels + independent totals', JSON.stringify(gm));
  // Both sides stay film-linked to their OWN scope's golden drilldown.
  ok(JSON.stringify(result.cmpTrips.aIds) === JSON.stringify(golden['game:g1'].drill['formation::Trips']), 'compare base side film-links to the game-scope golden');
  ok(JSON.stringify(result.cmpTrips.bIds) === JSON.stringify(golden.season.drill['formation::Trips']), 'compare against side film-links to the season-scope golden');
  ok(typeof result.cmpTrips.deltas.successRate === 'number' && typeof result.cmpTrips.deltas.runShare === 'number', 'compare emits numeric per-measure deltas', JSON.stringify(result.cmpTrips.deltas));
  // A formation present only in game 2 shows an empty base side + a negative sampleDelta.
  ok(result.cmpFlexbone.aSample === 0 && result.cmpFlexbone.aIds.length === 0 && result.cmpFlexbone.sampleDelta < 0 && JSON.stringify(result.cmpFlexbone.bIds) === JSON.stringify(golden.season.drill['formation::Flexbone']), 'compare aligns a value missing from one cohort (Flexbone: base empty, against present)', JSON.stringify(result.cmpFlexbone));
  ok(result.compareBadArgsThrows, 'compare() with a non-array cohort fails loudly');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
