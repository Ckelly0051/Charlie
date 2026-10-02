import { StatsEngine } from '../js/stats-engine.js';
import { AnalyticsRegistry } from '../js/analytics-registry.js';
import { PlayFilter } from '../js/play-filter.js';
/* BEHAVIORAL look-field tests: every analytics surface reads each look field
   (formation, QB alignment, backfield, coverage call, coverage family) from its
   own field, and never counts one as another — an alignment is never a
   formation, a family is never a coverage call (§19 item 6a). Plays are current
   format (legacy excision step 7). A surface that mixes fields fails its
   assertion regardless of how the read was coded, which a grep can't guarantee.

   Runs model contracts in Node; App wiring stays in e2e-native-reports.
   Run: node tools/e2e-analytics-projection.mjs */

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const results = (() => {
  const registry = new AnalyticsRegistry(new StatsEngine(null));
  const eng = registry?.stats;
  if (!registry || !eng) return { missing: true };
  const SE = eng.constructor;

  // ---- current-format fixtures, each look field in its own field ----
  const g = '__gid';
  const OFF = { id: 1, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily: 'Spread', qbAlignment: 'Shotgun', playType: 'Short Pass', runPass: 'Pass',
    result: 'Gain', yardage: '8', down: '1', distance: '10' } };
  const OFFBF = { id: 2, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily: 'I-Form', backfield: 'Offset', qbAlignment: 'Pistol', playType: 'Run Inside',
    runPass: 'Run', result: 'Gain', yardage: '4', down: '1', distance: '10' } };
  const DEF = { id: 3, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'defense', coverage: '', coverageFamily: 'Man', defFront: '4-3', playType: 'Short Pass', runPass: 'Pass',
    result: 'Incomplete', down: '2', distance: '7' } };
  const DEFSHELL = { id: 4, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Man', defFront: '4-3',
    playType: 'Deep Pass', runPass: 'Pass', result: 'Gain', yardage: '12', down: '3', distance: '8' } };
  // Two calls identical EXCEPT QB alignment — the six-field Big-Call key must keep
  // them distinct; the old four-field key (formation+strength+motion+playType) would
  // collapse them because the formation is 'I-Form' for both.
  const BC1 = { id: 5, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily: 'I-Form', qbAlignment: 'Under Center', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3' } };
  const BC2 = { id: 6, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily: 'I-Form', qbAlignment: 'Shotgun', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' } };

  const out = [];
  const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
  const t = (label, cond, detail = '') => out.push({ label, ok: !!cond, detail: String(detail) });

  // ---- 1. registry dimension values ---------------------------------------
  t('reg formation(OFF) = [Trips] (the alignment is not a formation)', eq(registry.values('formationFamily', OFF), ['Spread']), JSON.stringify(registry.values('formationFamily', OFF)));
  t('reg qbAlignment(OFF) = [Shotgun]', eq(registry.values('qbAlignment', OFF), ['Shotgun']), JSON.stringify(registry.values('qbAlignment', OFF)));
  t('reg backfield(OFFBF) = [Offset]', eq(registry.values('backfield', OFFBF), ['Offset']), JSON.stringify(registry.values('backfield', OFFBF)));
  t('reg qbAlignment(OFFBF) = [Pistol]', eq(registry.values('qbAlignment', OFFBF), ['Pistol']), JSON.stringify(registry.values('qbAlignment', OFFBF)));
  t('reg formation(OFFBF) = [Ace]', eq(registry.values('formationFamily', OFFBF), ['I-Form']), JSON.stringify(registry.values('formationFamily', OFFBF)));
  t('reg coverage(DEF) = [] (a family is not a call)', eq(registry.values('coverage', DEF), []), JSON.stringify(registry.values('coverage', DEF)));
  t('reg coverageFamily(DEF) = [Man]', eq(registry.values('coverageFamily', DEF), ['Man']), JSON.stringify(registry.values('coverageFamily', DEF)));
  t('reg coverage(DEFSHELL) = [Cover 3]', eq(registry.values('coverage', DEFSHELL), ['Cover 3']), JSON.stringify(registry.values('coverage', DEFSHELL)));
  t('reg coverageFamily(DEFSHELL) = [Man]', eq(registry.values('coverageFamily', DEFSHELL), ['Man']), JSON.stringify(registry.values('coverageFamily', DEFSHELL)));

  // ---- 2. compute() report aggregation reads ------------------------------
  const tend = eng.compute([OFF]).tendencies.formations;
  t('compute tendencies.formations keys on Trips', tend['Spread'] === 1, JSON.stringify(tend));
  t('compute tendencies.formations has NO Shotgun', tend['Shotgun'] === undefined, JSON.stringify(tend));
  t('compute tendencies.formations has NO Under Center', tend['Under Center'] === undefined, JSON.stringify(tend));
  const covDef = eng._defensiveStats([DEF]).coverages.map(c => c.name);
  t('_defensiveStats coverages carry no family (Man is not a call)', !covDef.includes('Man'), JSON.stringify(covDef));
  const covShell = eng._defensiveStats([DEFSHELL]).coverages.map(c => c.name);
  t('_defensiveStats coverages keep real shell Cover 3', covShell.includes('Cover 3'), JSON.stringify(covShell));

  // ---- 3. _bigTwelveData six-field key ------------------------------------
  const big = eng._bigTwelveData([BC1, BC2]);
  t('_bigTwelveData keeps two calls distinct by qbAlignment', big.calls.length === 2, `calls=${big.calls.length}`);
  const qbs = big.calls.map(c => c.qb).sort();
  t('_bigTwelveData calls carry qbAlignment', eq(qbs, ['Shotgun', 'Under Center']), JSON.stringify(qbs));
  t('_bigTwelveData calls share formation Ace', big.calls.every(c => c.form === 'I-Form'), JSON.stringify(big.calls.map(c => c.form)));

  // ---- 4. _matrixDimensions extractors ------------------------------------
  const dims = SE._matrixDimensions();
  const dim = id => dims.find(d => d.id === id);
  t('matrix dim formation.extract(OFF) = [Trips]', eq(dim('formationFamily').extract(OFF), ['Spread']), JSON.stringify(dim('formationFamily').extract(OFF)));
  t('matrix dim coverage.extract(DEF) = [] (a family is not a call)', eq(dim('coverage').extract(DEF), []), JSON.stringify(dim('coverage').extract(DEF)));
  t('matrix dim backfield.extract(OFFBF) = [Offset]', eq(dim('backfield').extract(OFFBF), ['Offset']), JSON.stringify(dim('backfield').extract(OFFBF)));

  // ---- 5. _buildCutFilter film-link predicates ----------------------------
  t('cut formation=Trips matches OFF', eq(registry.matchingRefs([OFF], 'formationFamily', 'Spread'), ['g1::1']), JSON.stringify(registry.matchingRefs([OFF], 'formationFamily', 'Spread')));
  t('cut formation=Shotgun does NOT match OFF (an alignment)', eq(registry.matchingRefs([OFF], 'formationFamily', 'Shotgun'), []), JSON.stringify(registry.matchingRefs([OFF], 'formationFamily', 'Shotgun')));
  t('cut qbAlignment=Shotgun matches OFF', eq(registry.matchingRefs([OFF], 'qbAlignment', 'Shotgun'), ['g1::1']), JSON.stringify(registry.matchingRefs([OFF], 'qbAlignment', 'Shotgun')));
  t('cut coverage=Man does NOT match DEF (a family)', eq(registry.matchingRefs([DEF], 'coverage', 'Man'), []), JSON.stringify(registry.matchingRefs([DEF], 'coverage', 'Man')));
  t('cut coverageFamily=Man matches DEF', eq(registry.matchingRefs([DEF], 'coverageFamily', 'Man'), ['g1::3']), JSON.stringify(registry.matchingRefs([DEF], 'coverageFamily', 'Man')));
  t('cut coverage=Cover 3 matches DEFSHELL', eq(registry.matchingRefs([DEFSHELL], 'coverage', 'Cover 3'), ['g1::4']), JSON.stringify(registry.matchingRefs([DEFSHELL], 'coverage', 'Cover 3')));
  t('cut frontCoverage=4-3|Cover 3 matches DEFSHELL', eq(registry.matchingRefs([DEFSHELL], 'frontCoverage', '4-3|Cover 3'), ['g1::4']), JSON.stringify(registry.matchingRefs([DEFSHELL], 'frontCoverage', '4-3|Cover 3')));
  t('cut frontCoverage=4-3|Man does NOT match DEF (a family)', eq(registry.matchingRefs([DEF], 'frontCoverage', '4-3|Man'), []), JSON.stringify(registry.matchingRefs([DEF], 'frontCoverage', '4-3|Man')));
  // bigCall six-field key: only BC1 (Under Center) matches its own key.
  const ucKey = big.calls.find(c => c.qb === 'Under Center').key;
  t('cut bigCall(Under Center key) matches only BC1', eq(registry.matchingRefs([BC1, BC2], 'bigCall', ucKey), ['g1::5']), JSON.stringify(registry.matchingRefs([BC1, BC2], 'bigCall', ucKey)));

  // ================= E3b — newly wired display consumers ====================
  // An ALIGNMENT-ONLY play: no formation charted, so it must be OMITTED from
  // formation reads (§6.4), never bucketed as "Unknown".
  const ALIGN_ONLY = { id: 9, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily: '', qbAlignment: 'Under Center', playType: 'Run Inside', runPass: 'Run',
    result: 'Gain', yardage: '5', down: '1', distance: '10' } };

  // --- projField: the one field read every look consumer uses ---
  t('projField(formation) returns the formation', SE.projField(OFF, 'formationFamily') === 'Spread', SE.projField(OFF, 'formationFamily'));
  t('projField(qbAlignment) returns the alignment', SE.projField(OFF, 'qbAlignment') === 'Shotgun', SE.projField(OFF, 'qbAlignment'));
  t('projField(formation) is BLANK for an alignment-only play', SE.projField(ALIGN_ONLY, 'formationFamily') === '', JSON.stringify(SE.projField(ALIGN_ONLY, 'formationFamily')));
  t('projField reads non-look keys as stored', SE.projField(OFF, 'playType') === 'Short Pass', SE.projField(OFF, 'playType'));

  // The exploratory Formation × Play heat-map tab is retired from the fixed
  // Reports composition. Field reads remain pinned at their canonical owners
  // above and in every downstream tendency/EPA assertion below.

  // --- play-filter (drawer "Filter Plays" → cut-up exporter) EQUALITY ---
  // This filter selects the film the coach exports, so its set must EQUAL the
  // registry cut set for the same value. OFF is Trips with a Shotgun alignment;
  // ALIGN_ONLY charts an Under Center alignment and no formation.
  const pf = new PlayFilter(null);
  const filterSet = (formation, plays) => {
    const saved = JSON.parse(JSON.stringify(pf.criteria));
    pf.criteria.formationFamilies = [formation];
    const got = plays.filter(p => pf._matchesPlay(p)).map(p => registry.playRef(p)).sort();
    pf.criteria = saved;
    return got;
  };
  const cohort = [OFF, ALIGN_ONLY, OFFBF];
  t('play-filter[Spread] EQUALS the registry cut set',
    eq(filterSet('Spread', cohort), registry.matchingRefs(cohort, 'formationFamily', 'Spread')),
    JSON.stringify({ filter: filterSet('Spread', cohort), registry: registry.matchingRefs(cohort, 'formationFamily', 'Spread') }));
  t('play-filter[Shotgun] selects NOTHING (alignment is not a formation)',
    eq(filterSet('Shotgun', cohort), []), JSON.stringify(filterSet('Shotgun', cohort)));
  t('play-filter[Under Center] selects NOTHING (alignment-only play omitted)',
    eq(filterSet('Under Center', cohort), []), JSON.stringify(filterSet('Under Center', cohort)));

  // --- EPA byFormation (advanced-metrics groupBy) ---
  // EPA needs field position, so these carry fieldSide/yardLine — without them
  // `withEpa` is empty and the omit-assertion would pass VACUOUSLY.
  const epaPlay = (id, formationFamily, qbAlignment) => ({ id, [g]: 'g1', timestamp: { start: 0, end: 1 }, tags: {
    unit: 'offense', formationFamily, qbAlignment, playType: 'Run Inside', runPass: 'Run', result: 'Gain',
    yardage: '5', down: '1', distance: '10', fieldSide: 'own', yardLine: '25' } });
  const adv = eng.compute([epaPlay(20, 'Spread', 'Shotgun'), epaPlay(21, '', 'Under Center')]).advanced;
  const epaForms = (adv.byFormation || []).map(f => f.name).sort();
  t('EPA byFormation is non-vacuous (has rows)', epaForms.length > 0, JSON.stringify(epaForms));
  t('EPA byFormation keys on the formation only', eq(epaForms, ['Spread']), JSON.stringify(epaForms));
  t('EPA byFormation OMITS the alignment-only play (no Unknown/Shotgun)',
    !epaForms.includes('Unknown') && !epaForms.includes('Shotgun'), JSON.stringify(epaForms));

  return { out };
})();

console.log('\n== Analytics look fields (behavioral) ==');
if (results.missing) { console.error('  FAIL  AnalyticsRegistry / StatsEngine not available'); fail++; }
else for (const r of results.out) ok(r.ok, r.label, r.ok ? '' : r.detail);


console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
