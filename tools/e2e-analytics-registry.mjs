import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* P0-c analytics registry contract. Runs against the built bundle so module
   ordering and App wiring are covered as well as the pure registry surface. */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
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
  const play = { id: 7, __gid: 'g2', penalties: [
    { id: 'p1', team: 'subject', phase: 'offense', foul: 'Holding', disposition: 'accepted', yards: 8, playCounts: false },
    { id: 'p2', team: 'opponent', phase: 'defense', foul: 'Facemask', disposition: 'declined', yards: null, playCounts: true },
  ], tags: {
    // 'Shotgun' is QB alignment (E1/E2 tag model): TagProjection reads it into
    // qbAlignment and leaves the structural formations 'Trips + Bunch' behind. The
    // fixture keeps a genuine MULTI-structure value so the splitter + 2-cell matrix
    // cross-product stay exercised AND projection is probed on the same play.
    unit: 'offense', formation: 'Shotgun + Trips + Bunch', playType: 'RPO + Short Pass',
    defFront: '4-3 + Jumbo Shift', blitz: 'A-Gap + Edge', result: 'Gain + Touchdown',
    down: '3', distance: '6', quarter: 'Q2', driveNumber: '4', motion: '',
    custom: ['Tempo'], customFields: { wristband: 'Blue' }, players: { passer: '12' },
    grades: { passer: 2 }
  }};
  const stats = registry.stats.compute([play]);
  // Harden (reviewer add, P0-c review): assert EVERY ready measure resolves — not
  // just the 3 spot-checked below — over a MIXED offense+defense set, so a future
  // compute() field rename can't silently break a "ready" measure's path.
  const mixed = [
    play,
    { id: 8, __gid: 'g2', tags: { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '6', down: '1', distance: '10', formation: 'Under Center' } },
    { id: 9, __gid: 'g2', tags: { unit: 'offense', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '-2', down: '2', distance: '9', formation: 'Pistol' } },
    { id: 10, __gid: 'g2', tags: { unit: 'defense', defFront: '4-3', coverage: 'Cover 3', blitz: 'A-Gap', playType: 'Short Pass', runPass: 'Pass', result: 'Sack', yardage: '-5', down: '3', distance: '7' } },
    { id: 11, __gid: 'g2', tags: { unit: 'defense', defFront: '3-4', coverage: 'Cover 2', playType: 'Deep Pass', runPass: 'Pass', result: 'Interception', yardage: '0', down: '2', distance: '8' } },
  ];
  const mixedStats = registry.stats.compute(mixed);
  const readyMeasureIds = registry.listMeasures().filter(m => m.availability === 'ready').map(m => m.id);
  const resolved = registry.readMeasures(mixedStats, readyMeasureIds);
  const unresolvedMeasures = readyMeasureIds.filter(id => resolved[id] === undefined);
  const matrixDims = registry.stats.constructor._matrixDimensions();
  const matrixValues = Object.fromEntries(matrixDims.map(d => [d.id, d.extract(play)]));
  const matrix = registry.stats._computeMatrix([play], 'formation', 'distBucket');
  return {
    dimensions: ids(registry.listDimensions()),
    measures: ids(registry.listMeasures()),
    blocks: ids(registry.listBlocks()),
    formation: registry.values('formation', play),
    qbAlignment: registry.values('qbAlignment', play),
    playType: registry.values('playType', play),
    fronts: registry.values('defFront', play),
    blitzes: registry.values('blitz', play),
    results: registry.values('result', play),
    runPass: registry.values('runPass', play),
    custom: registry.values('customTag', play),
    customFields: registry.values('customField', play),
    playerRoles: registry.values('playerRole', play),
    grades: registry.values('grade', play),
    penaltyTeams: registry.values('penaltyTeam', play),
    penaltyFouls: registry.values('penaltyFoul', play),
    penaltyRulings: registry.values('penaltyRuling', play),
    penaltyCounts: registry.values('penaltyPlayCounts', play),
    ref: registry.playRef(play),
    selected: registry.readMeasures(stats, ['plays', 'successRate', 'epaPerPlay']),
    unresolvedMeasures,
    blocksSelected: registry.readBlocks(stats, ['rushing', 'advanced']),
    allBlocksExact: registry.listBlocks().every(entry =>
      JSON.stringify(registry.readBlocks(stats, [entry.id])[entry.id]) === JSON.stringify(stats[entry.id])),
    cutMatch: registry.matchingRefs([play], 'formation', 'Trips'),
    cutMatchAlign: registry.matchingRefs([play], 'qbAlignment', 'Shotgun'),
    cutMatchRawFormation: registry.matchingRefs([play], 'formation', 'Shotgun'),
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
  ok(JSON.stringify(result.formation) === JSON.stringify(['Trips','Bunch']), 'Formation projects QB alignment out, keeps structural splitter');
  ok(JSON.stringify(result.qbAlignment) === JSON.stringify(['Shotgun']), 'QB alignment dimension reads legacy formation token (projection probe)');
  ok(JSON.stringify(result.playType) === JSON.stringify(['RPO','Short Pass']), 'Play type uses canonical multi-value splitter');
  ok(JSON.stringify(result.fronts) === JSON.stringify(['4-3','Jumbo Shift']) && JSON.stringify(result.blitzes) === JSON.stringify(['A-Gap','Edge']), 'Defense dimensions use canonical splitters');
  ok(JSON.stringify(result.results) === JSON.stringify(['Gain','Touchdown']), 'Result uses canonical splitter');
  ok(result.runPass[0] === 'Pass', 'Run/pass uses canonical classifier');
  ok(result.custom[0] === 'Tempo' && result.customFields[0] === 'wristband=Blue', 'Custom tags and fields are queryable dimensions');
  ok(result.playerRoles[0] === 'passer=12' && result.grades[0] === 'passer=2', 'Player role and grade dimensions preserve role identity');
  ok(JSON.stringify(result.penaltyTeams) === JSON.stringify(['subject','opponent'])
    && JSON.stringify(result.penaltyFouls) === JSON.stringify(['Holding','Facemask'])
    && JSON.stringify(result.penaltyRulings) === JSON.stringify(['accepted','declined'])
    && JSON.stringify(result.penaltyCounts) === JSON.stringify(['No play','Play counts']),
  'Structured penalty dimensions preserve every foul on the play');
  ok(result.ref === 'g2::7', 'Composite play reference is gameId::playId');
  ok(result.selected.plays === 1 && result.selected.successRate === '100.0' && result.selected.epaPerPlay === 0, 'Ready measures select canonical compute outputs', JSON.stringify(result.selected));
  ok(result.unresolvedMeasures.length === 0, 'EVERY ready measure resolves to a defined value (no silent undefined path)', JSON.stringify(result.unresolvedMeasures));
  ok(result.blocksSelected.rushing.attempts === 0 && result.blocksSelected.advanced.count === 0, 'Block bindings return canonical objects');
  ok(result.allBlocksExact, 'Every registered block equals its canonical compute output');
  ok(JSON.stringify(result.cutMatch) === JSON.stringify(['g2::7'])
    && JSON.stringify(result.cutMatchAlign) === JSON.stringify(['g2::7'])
    && JSON.stringify(result.cutMatchRawFormation) === JSON.stringify([]),
    'Cut binding matches projected structure + qbAlignment, NOT raw alignment token');
  ok(result.deferred === 'requires-context' && result.deferredThrows, 'Unresolved measure semantics are explicit and unreadable');
  ok(result.unknownDimensionThrows, 'Unknown registry IDs fail loudly');
  ok(result.matrixIds.length === 16 && result.matrixIds.includes('quarter') && result.matrixIds.includes('distBucket')
    && result.matrixIds.includes('qbAlignment') && result.matrixIds.includes('coverageFamily'),
    'All 16 Matrix extractors are pinned (incl. new qbAlignment + coverageFamily cross-tab axes)');
  ok(result.matrixValues.distBucket[0] === 'Med (4-6)' && result.matrixValues.runPass[0] === 'Pass', 'Legacy Matrix distance/run-pass behavior is explicit');
  ok(result.matrixCells.length === 2 && result.matrixCells.every(c => c.count === 1 && c.passes === 1), 'Representative multi-formation Matrix cross-product is pinned');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
