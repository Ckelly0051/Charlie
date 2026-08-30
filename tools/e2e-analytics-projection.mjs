import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* E3a-6a — BEHAVIORAL projection tests: the PRIMARY (syntax-proof) guarantee that
   every analytics surface reads the PROJECTED four/six-dimension view, not raw
   legacy tags (§19 item 6a). For each surface class we feed a legacy-shaped play
   (`formation:'Shotgun + Trips'`, `coverage:'Man'`, `backfield:'Pistol + Offset'`)
   and assert the surface's OUTPUT reflects projection — the PROJECTED value is
   present AND the RAW token is absent. A surface that still reads raw fails its
   assertion regardless of how the read was coded (dot / optional-chain / bracket /
   alias / destructure), which a grep can't guarantee.

   Runs against the BUILT bundle so module wiring + App bootstrap are covered.
   Run: node tools/e2e-analytics-projection.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const results = await page.evaluate(() => {
  const registry = window.app?.analyticsRegistry;
  const eng = registry?.stats;
  if (!registry || !eng) return { missing: true };
  const SE = eng.constructor;

  // ---- legacy-shaped fixtures (raw tags that projection must move/strip) ----
  const g = '__gid';
  const OFF = { id: 1, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation: 'Shotgun + Trips', playType: 'Short Pass', runPass: 'Pass',
    result: 'Gain', yardage: '8', down: '1', distance: '10' } };
  const OFFBF = { id: 2, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation: 'Ace', backfield: 'Pistol + Offset', playType: 'Run Inside',
    runPass: 'Run', result: 'Gain', yardage: '4', down: '1', distance: '10' } };
  const DEF = { id: 3, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'defense', coverage: 'Man', defFront: '4-3', playType: 'Short Pass', runPass: 'Pass',
    result: 'Incomplete', down: '2', distance: '7' } };
  const DEFSHELL = { id: 4, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Man', defFront: '4-3',
    playType: 'Deep Pass', runPass: 'Pass', result: 'Gain', yardage: '12', down: '3', distance: '8' } };
  // Two calls identical EXCEPT QB alignment — the six-field Big-Call key must keep
  // them distinct; the old four-field key (formation+strength+motion+playType) would
  // collapse them because projected formation is 'Ace' for both.
  const BC1 = { id: 5, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation: 'Under Center + Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3' } };
  const BC2 = { id: 6, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation: 'Shotgun + Ace', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' } };

  const out = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const t = (label, cond, detail = '') => out.push({ label, ok: !!cond, detail: String(detail) });

  // ---- 1. registry dimension values ---------------------------------------
  t('reg formation(OFF) = [Trips] (Shotgun projected out)', eq(registry.values('formation', OFF), ['Trips']), JSON.stringify(registry.values('formation', OFF)));
  t('reg qbAlignment(OFF) = [Shotgun]', eq(registry.values('qbAlignment', OFF), ['Shotgun']), JSON.stringify(registry.values('qbAlignment', OFF)));
  t('reg backfield(OFFBF) = [Offset] (Pistol projected out)', eq(registry.values('backfield', OFFBF), ['Offset']), JSON.stringify(registry.values('backfield', OFFBF)));
  t('reg qbAlignment(OFFBF) = [Pistol] (read from backfield)', eq(registry.values('qbAlignment', OFFBF), ['Pistol']), JSON.stringify(registry.values('qbAlignment', OFFBF)));
  t('reg formation(OFFBF) = [Ace] (structure untouched)', eq(registry.values('formation', OFFBF), ['Ace']), JSON.stringify(registry.values('formation', OFFBF)));
  t('reg coverage(DEF) = [] (legacy Man is not a call)', eq(registry.values('coverage', DEF), []), JSON.stringify(registry.values('coverage', DEF)));
  t('reg coverageFamily(DEF) = [Man]', eq(registry.values('coverageFamily', DEF), ['Man']), JSON.stringify(registry.values('coverageFamily', DEF)));
  t('reg coverage(DEFSHELL) = [Cover 3]', eq(registry.values('coverage', DEFSHELL), ['Cover 3']), JSON.stringify(registry.values('coverage', DEFSHELL)));
  t('reg coverageFamily(DEFSHELL) = [Man]', eq(registry.values('coverageFamily', DEFSHELL), ['Man']), JSON.stringify(registry.values('coverageFamily', DEFSHELL)));

  // ---- 2. compute() report aggregation reads ------------------------------
  const tend = eng.compute([OFF]).tendencies.formations;
  t('compute tendencies.formations keys on projected Trips', tend['Trips'] === 1, JSON.stringify(tend));
  t('compute tendencies.formations has NO raw Shotgun', tend['Shotgun'] === undefined, JSON.stringify(tend));
  t('compute tendencies.formations has NO raw Under Center', tend['Under Center'] === undefined, JSON.stringify(tend));
  const covDef = eng._defensiveStats([DEF]).coverages.map(c => c.name);
  t('_defensiveStats coverages drop legacy Man (projected out)', !covDef.includes('Man'), JSON.stringify(covDef));
  const covShell = eng._defensiveStats([DEFSHELL]).coverages.map(c => c.name);
  t('_defensiveStats coverages keep real shell Cover 3', covShell.includes('Cover 3'), JSON.stringify(covShell));

  // ---- 3. _bigTwelveData six-field key ------------------------------------
  const big = eng._bigTwelveData([BC1, BC2]);
  t('_bigTwelveData keeps two calls distinct by qbAlignment', big.calls.length === 2, `calls=${big.calls.length}`);
  const qbs = big.calls.map(c => c.qb).sort();
  t('_bigTwelveData calls carry projected qbAlignment', eq(qbs, ['Shotgun', 'Under Center']), JSON.stringify(qbs));
  t('_bigTwelveData calls share projected formation Ace', big.calls.every(c => c.form === 'Ace'), JSON.stringify(big.calls.map(c => c.form)));

  // ---- 4. _matrixDimensions extractors ------------------------------------
  const dims = SE._matrixDimensions();
  const dim = id => dims.find(d => d.id === id);
  t('matrix dim formation.extract(OFF) = [Trips]', eq(dim('formation').extract(OFF), ['Trips']), JSON.stringify(dim('formation').extract(OFF)));
  t('matrix dim coverage.extract(DEF) = [] (Man projected out)', eq(dim('coverage').extract(DEF), []), JSON.stringify(dim('coverage').extract(DEF)));
  t('matrix dim backfield.extract(OFFBF) = [Offset]', eq(dim('backfield').extract(OFFBF), ['Offset']), JSON.stringify(dim('backfield').extract(OFFBF)));

  // ---- 5. _buildCutFilter film-link predicates ----------------------------
  t('cut formation=Trips matches OFF', eq(registry.matchingRefs([OFF], 'formation', 'Trips'), ['g1::1']), JSON.stringify(registry.matchingRefs([OFF], 'formation', 'Trips')));
  t('cut formation=Shotgun does NOT match OFF (raw alignment)', eq(registry.matchingRefs([OFF], 'formation', 'Shotgun'), []), JSON.stringify(registry.matchingRefs([OFF], 'formation', 'Shotgun')));
  t('cut qbAlignment=Shotgun matches OFF', eq(registry.matchingRefs([OFF], 'qbAlignment', 'Shotgun'), ['g1::1']), JSON.stringify(registry.matchingRefs([OFF], 'qbAlignment', 'Shotgun')));
  t('cut coverage=Man does NOT match DEF (projected out)', eq(registry.matchingRefs([DEF], 'coverage', 'Man'), []), JSON.stringify(registry.matchingRefs([DEF], 'coverage', 'Man')));
  t('cut coverageFamily=Man matches DEF', eq(registry.matchingRefs([DEF], 'coverageFamily', 'Man'), ['g1::3']), JSON.stringify(registry.matchingRefs([DEF], 'coverageFamily', 'Man')));
  t('cut coverage=Cover 3 matches DEFSHELL', eq(registry.matchingRefs([DEFSHELL], 'coverage', 'Cover 3'), ['g1::4']), JSON.stringify(registry.matchingRefs([DEFSHELL], 'coverage', 'Cover 3')));
  t('cut frontCoverage=4-3|Cover 3 matches DEFSHELL (projected coverage)', eq(registry.matchingRefs([DEFSHELL], 'frontCoverage', '4-3|Cover 3'), ['g1::4']), JSON.stringify(registry.matchingRefs([DEFSHELL], 'frontCoverage', '4-3|Cover 3')));
  t('cut frontCoverage=4-3|Man does NOT match DEF (raw family)', eq(registry.matchingRefs([DEF], 'frontCoverage', '4-3|Man'), []), JSON.stringify(registry.matchingRefs([DEF], 'frontCoverage', '4-3|Man')));
  // bigCall six-field key: only BC1 (Under Center) matches its own key.
  const ucKey = big.calls.find(c => c.qb === 'Under Center').key;
  t('cut bigCall(Under Center key) matches only BC1', eq(registry.matchingRefs([BC1, BC2], 'bigCall', ucKey), ['g1::5']), JSON.stringify(registry.matchingRefs([BC1, BC2], 'bigCall', ucKey)));

  // ================= E3b — newly wired display consumers ====================
  // An ALIGNMENT-ONLY play: stored formation is the alignment token, so its
  // PROJECTED structural formation is blank and it must be OMITTED (§6.4), never
  // shown as a "Shotgun" formation row nor bucketed as "Unknown".
  const ALIGN_ONLY = { id: 9, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation: 'Under Center', playType: 'Run Inside', runPass: 'Run',
    result: 'Gain', yardage: '5', down: '1', distance: '10' } };

  // --- projField: projected for the six, raw passthrough otherwise ---
  t('projField(formation) returns PROJECTED structure', SE.projField(OFF, 'formation') === 'Trips', SE.projField(OFF, 'formation'));
  t('projField(qbAlignment) returns projected alignment', SE.projField(OFF, 'qbAlignment') === 'Shotgun', SE.projField(OFF, 'qbAlignment'));
  t('projField(formation) is BLANK for an alignment-only play', SE.projField(ALIGN_ONLY, 'formation') === '', JSON.stringify(SE.projField(ALIGN_ONLY, 'formation')));
  t('projField passes NON-projected keys through raw', SE.projField(OFF, 'playType') === 'Short Pass', SE.projField(OFF, 'playType'));

  // --- heat maps (Formation × Play Type) ---
  // HeatMaps (the classic renderer) is retired; offenseHeatMapData is the
  // accepted replacement data seam (Final Reports Retirement) consumed by
  // NativeHeatMaps. formationPlayData already builds its formation set from
  // StatsEngine.proj(play).formation, so projection correctness here is a
  // property of that seam, not of this test.
  const hmRows = window.offenseHeatMapData([OFF, ALIGN_ONLY]).formationPlay.rows;
  t('heat map rows use PROJECTED formation (Trips present)', hmRows.some(r => r.formation === 'Trips'), JSON.stringify(hmRows));
  t('heat map has NO raw Shotgun formation row', !hmRows.some(r => r.formation === 'Shotgun'), JSON.stringify(hmRows));
  t('heat map has NO invented Unknown formation row', !hmRows.some(r => r.formation === 'Unknown'), JSON.stringify(hmRows));

  // --- play-filter (drawer "Filter Plays" → cut-up exporter) EQUALITY ---
  // This filter selects the film the coach exports, so its set must EQUAL the
  // registry cut set for the same value. OFF is "Shotgun + Trips" (projects to
  // Trips); ALIGN_ONLY is "Under Center" (projects to no structural formation).
  const pf = window.app.filter;
  const filterSet = (formation, plays) => {
    const saved = JSON.parse(JSON.stringify(pf.criteria));
    pf.criteria.formations = [formation];
    const got = plays.filter(p => pf._matchesPlay(p)).map(p => registry.playRef(p)).sort();
    pf.criteria = saved;
    return got;
  };
  const cohort = [OFF, ALIGN_ONLY, OFFBF];
  t('play-filter[Trips] EQUALS the registry cut set',
    eq(filterSet('Trips', cohort), registry.matchingRefs(cohort, 'formation', 'Trips')),
    JSON.stringify({ filter: filterSet('Trips', cohort), registry: registry.matchingRefs(cohort, 'formation', 'Trips') }));
  t('play-filter[Shotgun] selects NOTHING (alignment is not a formation)',
    eq(filterSet('Shotgun', cohort), []), JSON.stringify(filterSet('Shotgun', cohort)));
  t('play-filter[Under Center] selects NOTHING (alignment-only play omitted)',
    eq(filterSet('Under Center', cohort), []), JSON.stringify(filterSet('Under Center', cohort)));

  // --- EPA byFormation (advanced-metrics groupBy) ---
  // EPA needs field position, so these carry fieldSide/yardLine — without them
  // `withEpa` is empty and the omit-assertion would pass VACUOUSLY.
  const epaPlay = (id, formation) => ({ id, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formation, playType: 'Run Inside', runPass: 'Run', result: 'Gain',
    yardage: '5', down: '1', distance: '10', fieldSide: 'own', yardLine: '25' } });
  const adv = eng.compute([epaPlay(20, 'Shotgun + Trips'), epaPlay(21, 'Under Center')]).advanced;
  const epaForms = (adv.byFormation || []).map(f => f.name).sort();
  t('EPA byFormation is non-vacuous (has rows)', epaForms.length > 0, JSON.stringify(epaForms));
  t('EPA byFormation keys on projected structure only', eq(epaForms, ['Trips']), JSON.stringify(epaForms));
  t('EPA byFormation OMITS the alignment-only play (no Unknown/Shotgun)',
    !epaForms.includes('Unknown') && !epaForms.includes('Shotgun'), JSON.stringify(epaForms));

  return { out };
});

console.log('\n== E3a analytics projection (behavioral) ==');
if (results.missing) { console.error('  FAIL  window.app.analyticsRegistry / stats not available'); fail++; }
else for (const r of results.out) ok(r.ok, r.label, r.ok ? '' : r.detail);

ok(errors.length === 0, `zero page errors`, errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
