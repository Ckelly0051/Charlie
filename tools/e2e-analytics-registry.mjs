/* P0-c analytics registry contract. Runs against the built bundle so module
   ordering and App wiring are covered as well as the pure registry surface. */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const result = await page.evaluate(() => {
  const registry = window.app?.analyticsRegistry;
  if (!registry) return { missing: true };
  const ids = xs => xs.map(x => x.id);
  const play = { id: 7, __gid: 'g2', tags: {
    unit: 'offense', formation: 'Shotgun + Trips', playType: 'RPO + Short Pass',
    defFront: '4-3 + Jumbo Shift', blitz: 'A-Gap + Edge', result: 'Gain + Touchdown',
    down: '3', distance: '6', quarter: 'Q2', driveNumber: '4', motion: '',
    custom: ['Tempo'], customFields: { wristband: 'Blue' }, players: { passer: '12' },
    grades: { passer: 2 }
  }};
  const stats = registry.stats.compute([play]);
  const matrixDims = registry.stats.constructor._matrixDimensions();
  const matrixValues = Object.fromEntries(matrixDims.map(d => [d.id, d.extract(play)]));
  const matrix = registry.stats._computeMatrix([play], 'formation', 'distBucket');
  return {
    dimensions: ids(registry.listDimensions()),
    measures: ids(registry.listMeasures()),
    blocks: ids(registry.listBlocks()),
    formation: registry.values('formation', play),
    playType: registry.values('playType', play),
    fronts: registry.values('defFront', play),
    blitzes: registry.values('blitz', play),
    results: registry.values('result', play),
    runPass: registry.values('runPass', play),
    custom: registry.values('customTag', play),
    customFields: registry.values('customField', play),
    playerRoles: registry.values('playerRole', play),
    grades: registry.values('grade', play),
    ref: registry.playRef(play),
    selected: registry.readMeasures(stats, ['plays', 'successRate', 'epaPerPlay']),
    blocksSelected: registry.readBlocks(stats, ['rushing', 'advanced']),
    allBlocksExact: registry.listBlocks().every(entry =>
      JSON.stringify(registry.readBlocks(stats, [entry.id])[entry.id]) === JSON.stringify(stats[entry.id])),
    cutMatch: registry.matchingRefs([play], 'formation', 'Shotgun'),
    deferred: registry.getMeasure('frequency')?.availability,
    unknownDimensionThrows: (() => { try { registry.values('not-real', play); return false; } catch { return true; } })(),
    deferredThrows: (() => { try { registry.readMeasures(stats, ['frequency']); return false; } catch { return true; } })(),
    matrixIds: matrixDims.map(d => d.id),
    matrixValues,
    matrixCells: Object.values(matrix.cells),
  };
});

ok(!result.missing, 'App exposes the P0-c analytics registry');
if (!result.missing) {
  const requiredDims = ['team','season','game','opponent','date','quarter','drive','unit','down','distance','fieldZone','hash','scoreSituation','formation','backfield','strength','personnel','motion','playType','playDir','defFront','coverage','blitz','playerRole','grade','specialTeamsPhase','customTag','customField','result','runPass'];
  const requiredMeasures = ['plays','frequency','runShare','passShare','yardsPerPlay','successRate','conversionRate','explosiveRate','negativeRate','turnovers','scoring','havocRate','stopRate','epaPerPlay','sampleSize','dataCompleteness'];
  const requiredBlocks = ['rushing','passing','scoring','downs','turnovers','tendencies','bigPlays','individuals','drives','situational','efficiency','personnel','advanced','defensive','gameFlow','conversions','specialTeams','scoreboard','hash','personnelSituation','frontCoverageCombos','playAction','dirMotion','takeaways'];
  ok(requiredDims.every(x => result.dimensions.includes(x)), 'Registry covers every minimum dimension', JSON.stringify(result.dimensions));
  ok(requiredMeasures.every(x => result.measures.includes(x)), 'Registry covers every minimum measure contract', JSON.stringify(result.measures));
  ok(requiredBlocks.every(x => result.blocks.includes(x)), 'Registry binds every canonical compute block', JSON.stringify(result.blocks));
  ok(JSON.stringify(result.formation) === JSON.stringify(['Shotgun','Trips']), 'Formation uses canonical multi-value splitter');
  ok(JSON.stringify(result.playType) === JSON.stringify(['RPO','Short Pass']), 'Play type uses canonical multi-value splitter');
  ok(JSON.stringify(result.fronts) === JSON.stringify(['4-3','Jumbo Shift']) && JSON.stringify(result.blitzes) === JSON.stringify(['A-Gap','Edge']), 'Defense dimensions use canonical splitters');
  ok(JSON.stringify(result.results) === JSON.stringify(['Gain','Touchdown']), 'Result uses canonical splitter');
  ok(result.runPass[0] === 'Pass', 'Run/pass uses canonical classifier');
  ok(result.custom[0] === 'Tempo' && result.customFields[0] === 'wristband=Blue', 'Custom tags and fields are queryable dimensions');
  ok(result.playerRoles[0] === 'passer=12' && result.grades[0] === 'passer=2', 'Player role and grade dimensions preserve role identity');
  ok(result.ref === 'g2::7', 'Composite play reference is gameId::playId');
  ok(result.selected.plays === 1 && result.selected.successRate === '100.0' && result.selected.epaPerPlay === 0, 'Ready measures select canonical compute outputs', JSON.stringify(result.selected));
  ok(result.blocksSelected.rushing.attempts === 0 && result.blocksSelected.advanced.count === 0, 'Block bindings return canonical objects');
  ok(result.allBlocksExact, 'Every registered block equals its canonical compute output');
  ok(JSON.stringify(result.cutMatch) === JSON.stringify(['g2::7']), 'Cut binding returns composite matching references');
  ok(result.deferred === 'requires-context' && result.deferredThrows, 'Unresolved measure semantics are explicit and unreadable');
  ok(result.unknownDimensionThrows, 'Unknown registry IDs fail loudly');
  ok(result.matrixIds.length === 14 && result.matrixIds.includes('quarter') && result.matrixIds.includes('distBucket'), 'All 14 legacy Matrix extractors are pinned');
  ok(result.matrixValues.distBucket[0] === 'Med (4-6)' && result.matrixValues.runPass[0] === 'Pass', 'Legacy Matrix distance/run-pass behavior is explicit');
  ok(result.matrixCells.length === 2 && result.matrixCells.every(c => c.count === 1 && c.passes === 1), 'Representative multi-formation Matrix cross-product is pinned');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
