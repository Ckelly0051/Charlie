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
  const dims = { formation: 'formation', coverage: 'coverage', defFront: 'defFront', runPass: 'runpass', down: 'down', personnel: 'personnel', blitz: 'blitz' };
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

  // Guards.
  const unknownThrows = (() => { try { study.run({ plays, dimension: 'nope' }); return false; } catch { return true; } })();
  const deferredThrows = (() => { try { study.run({ plays, dimension: 'fieldZone' }); return false; } catch { return true; } })();

  return {
    grouped, playCount: plays.length,
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

  // 2. Filter semantics.
  ok(result.filter.runTotal === result.filter.expectRun, 'OR-within filter cohort matches isRun set', JSON.stringify(result.filter));
  ok(result.filter.andTotal === result.filter.expectAnd, 'AND-across filters intersect (runPass=Run AND down=2)', JSON.stringify(result.filter));
  ok(result.filter.orTotal === result.filter.expectOr, 'OR-within multi-value filter (down in {2,3})', JSON.stringify(result.filter));

  // 3. Min-sample + non-cut grouping + guards.
  ok(result.wildBelow === true && result.wildSample === 1 && result.minWarn.some(w => /Wildcat/.test(w)), 'Small samples are flagged + warned, not dropped', JSON.stringify({ warn: result.minWarn, s: result.wildSample }));
  ok(JSON.stringify(result.resultTdIds) === JSON.stringify(['g1::7']), 'Non-cut dimension (result) still groups and film-links', JSON.stringify(result.resultTdIds));
  ok(result.unknownThrows, 'Unknown Study dimension fails loudly');
  ok(result.deferredThrows, 'requires-context dimension (fieldZone) refuses to query');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
