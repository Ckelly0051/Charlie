/* AMBIGUOUS RUN/PASS HARNESS (Node) -------------------------------------------
   A plain RPO with Run/Pass blank counted as a completed pass (Codex review,
   2026-10-05). RPO and Play Action are ambiguous (PlayTagger leaves Run/Pass
   blank for them), so analytics leave them unclassified.

   Run:  node tools/e2e-ambiguous-run-pass.mjs */
import { StatsEngine } from '../js/stats-engine.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
console.log('\n-- ambiguous play types without Run/Pass stay unclassified --');
{
  const snap = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', runPass: '', players: {}, ...tags } });
  const rpo = snap(1, { playType: 'RPO', rpoDecision: 'Give', result: 'Gain', yardage: '5' });
  const pa = snap(2, { playType: 'Play Action', result: 'Gain', yardage: '8' });
  ok(!StatsEngine.isPass(rpo) && !StatsEngine.isRun(rpo), 'RPO with Run/Pass blank is neither run nor pass');
  ok(!StatsEngine.isPass(pa) && !StatsEngine.isRun(pa), 'Play Action with Run/Pass blank is neither run nor pass');
  const s = new StatsEngine(null).compute([rpo, pa]);
  ok(s.passing.attempts === 0 && s.passing.completions === 0 && s.passing.yards === 0 && s.rushing.attempts === 0,
    'neither play adds a passing or rushing attempt or yards',
    JSON.stringify({ att: s.passing.attempts, cmp: s.passing.completions, yds: s.passing.yards, rush: s.rushing.attempts }));
  ok(StatsEngine.isPass(snap(3, { playType: 'RPO', runPass: 'Pass' })) && StatsEngine.isRun(snap(4, { playType: 'RPO', runPass: 'Run' })),
    'a charted Run/Pass still classifies an RPO');
  ok(StatsEngine.isPass(snap(5, { playType: 'Screen' })) && StatsEngine.isRun(snap(6, { playType: 'Run Inside' })),
    'unambiguous play types still classify with Run/Pass blank');
}

/* Codex review of ab3f617e: consumers that counted every non-run as a pass, or
   divided a pass cohort by a different denominator. Fixture: two Play Action
   snaps with Run/Pass blank, one completed Short Pass, one Run Inside. */
console.log('\n-- consumers count only charted passes, and shares are of charted run/pass plays --');
{
  const snap = (id, tags) => ({ id, __gid: 'g', timestamp: { start: 0, end: 5 }, tags: {
    unit: 'offense', runPass: '', players: {}, down: '1', distance: '10', hash: 'Left', playDir: 'Left',
    personnel: '11', formationFamily: 'Spread', defFront: '4-3', coverage: 'Cover 3', ...tags } });
  const plays = [
    snap(1, { playType: 'Play Action', result: 'Gain', yardage: '8' }),
    snap(2, { playType: 'Play Action', result: 'Incomplete', yardage: '0' }),
    snap(3, { runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '10' }),
    snap(4, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '2' }),
  ];
  const engine = new StatsEngine(null);
  const t = engine._tendencyStats(plays);
  ok(t.runs === 1 && t.passes === 1 && t.runPct === '50.0' && t.passPct === '50.0' && t.passSuccRate === '100.0',
    'tendencies: 1 run, 1 pass, 50/50, pass success from the one charted pass',
    JSON.stringify({ runs: t.runs, passes: t.passes, runPct: t.runPct, passPct: t.passPct, passSucc: t.passSuccRate }));
  const pa = t.playTypeList.find(row => row.name === 'Play Action');
  ok(pa && pa.count === 2 && pa.runs === 0 && pa.passes === 0, 'the Play Action row keeps its 2 snaps and credits neither run nor pass', JSON.stringify(pa));
  const action = engine._playActionStats(plays);
  ok(parseFloat(action.paRate) <= 100 && action.paPlays === 0 && action.paRate === '0.0',
    'play-action rate is of charted passes: 0 of 1, never above 100%', JSON.stringify(action));
  const runPassDim = StatsEngine._matrixDimensions().find(d => d.id === 'runPass');
  ok(JSON.stringify(runPassDim.extract(plays[0])) === '[]' && runPassDim.extract(plays[2])[0] === 'Pass',
    'the Run / Pass matrix dimension omits an unclassified play instead of labeling it Pass');
  const down = engine._downStats(plays).byDown['1'];
  ok(down.runs === 1 && down.passes === 1 && down.runPct === '50' && down.passPct === '50', 'down tendencies: 1 run, 1 pass, 50/50', JSON.stringify(down));
  const hash = engine._hashStats(plays).list[0];
  ok(hash.runs === 1 && hash.passes === 1 && hash.runPct === '50', 'hash: 1 run, 1 pass, 50% run', JSON.stringify(hash));
  const dir = engine._directionMotionStats(plays).dirList[0];
  ok(dir.runs === 1 && dir.passes === 1 && dir.runPct === '50' && dir.passPct === '50', 'direction: 1 run, 1 pass, 50/50', JSON.stringify(dir));
  const pers = engine._personnelStats(plays)[0];
  ok(pers.runs === 1 && pers.passes === 1, 'personnel: 1 run, 1 pass', JSON.stringify(pers));
  const byDown = engine._scoutByDown(plays)[0];
  ok(byDown.total === 4 && byDown.runs === 1 && byDown.passes === 1 && byDown.runPct === 50,
    'scout by down: 4 snaps, 1 run, 1 pass, 50% run', JSON.stringify(byDown));
  const scout = engine.generateScoutReport(plays);
  const dt = scout.downTendency.find(row => row.key === '1&10');
  ok(dt && dt.runs === 1 && dt.passes === 1 && dt.runPct === 50, 'scout down & distance: 1 run, 1 pass, 50% run', JSON.stringify(dt));
}

/* Codex review of 4abd7e7a: a sample of one run plus three Run/Pass-blank RPOs
   must not qualify a "100% run" warning, and a row with nothing classified
   must not render as 0R (0%) / 0P (100%). */
console.log('\n-- predictability warnings qualify on the classified sample --');
{
  const snap = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, tags: {
    unit: 'offense', runPass: '', players: {}, down: '1', distance: '10', hash: 'Left', playDir: 'Left',
    formationFamily: 'Spread', motion: 'Jet', ...tags } });
  const plays = [
    snap(1, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '3' }),
    snap(2, { playType: 'RPO', result: 'Gain', yardage: '4' }),
    snap(3, { playType: 'RPO', result: 'Gain', yardage: '2' }),
    snap(4, { playType: 'RPO', result: 'Gain', yardage: '1' }),
  ];
  const engine = new StatsEngine(null);
  const stats = { tendencies: engine._tendencyStats(plays), hash: engine._hashStats(plays), dirMotion: engine._directionMotionStats(plays) };
  const fix = engine._generateTakeaways(stats).fix.map(f => f.text);
  ok(!fix.some(text => /run/i.test(text) && /Spread|hash|motion/i.test(text)),
    'one charted run among four snaps raises no formation, hash or motion run warning', JSON.stringify(fix));
  const more = [...plays, ...[5, 6, 7].map(id => snap(id, { runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '3' }))];
  const statsMore = { tendencies: engine._tendencyStats(more), hash: engine._hashStats(more), dirMotion: engine._directionMotionStats(more) };
  const fixMore = engine._generateTakeaways(statsMore).fix.map(f => f.text);
  ok(fixMore.some(text => /Spread<\/strong> is 100% run \(4 run\/pass plays\)/.test(text))
    && fixMore.some(text => /Left hash<\/strong>: 100% run \(4 run\/pass plays\)/.test(text))
    && fixMore.some(text => /motion, you run <strong>100%<\/strong> of the time \(4 run\/pass plays\)/.test(text)),
    'four charted runs do raise them, reporting the classified sample', JSON.stringify(fixMore));
}

console.log('\n-- the built Offense report shows a dash for a row with nothing classified --');
{
  const { default: puppeteer } = await import('./test-browser.mjs');
  const { APP_URL, gotoApp } = await import('./app-entry.mjs');
  const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
  try {
    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });
    await gotoApp(page, APP_URL);
    const cells = await page.evaluate(async () => {
      const app = window.app;
      await app.storage.createSeason({ name: 'RPO Mix', team: 'Mix', year: '2026' });
      const store = app.storage.seasonStore;
      const game = store.activeGame();
      game.gameInfo = { ...(game.gameInfo || {}), opponent: 'Wildcats', perspective: 'self' };
      game.plays = [1, 2, 3, 4].map(id => ({ id, timestamp: { start: id * 10, end: id * 10 + 5 }, notes: '',
        tags: { unit: 'offense', runPass: '', playType: 'RPO', formationFamily: 'Spread', result: 'Gain', yardage: '3',
          down: '1', distance: '10', custom: [], players: {}, grades: {} } }));
      await store.persist();
      await app.storage._loadActiveGame({ renderGames: false });
      await app.workspaceShell.show('reports');
      app.reportsScreen.selectTab('offense');
      const seen = [];
      for (const button of [...document.querySelectorAll('#wsReports .gi-offense-pages button')]) {
        button.click();
        await new Promise(r => setTimeout(r, 30));
        for (const mod of document.querySelectorAll('#wsReports .gi-off-formation, #wsReports .gi-off-play-type')) {
          for (const row of mod.querySelectorAll('tbody tr')) seen.push(row.textContent.replace(/\s+/g, ' ').trim());
        }
        if (seen.length) break;
      }
      return seen;
    });
    ok(cells.length > 0 && cells.some(text => /Spread|RPO/.test(text)), 'fixture: the Formation and Play type tables list the RPO rows', JSON.stringify(cells));
    ok(!cells.some(text => /0P \(100%\)/.test(text)) && cells.some(text => /—/.test(text)),
      'a row with only Run/Pass-blank plays shows a dash, never 0R (0%) / 0P (100%)', JSON.stringify(cells));
  } finally { await browser.close(); }
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
