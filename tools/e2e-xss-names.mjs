import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* REGRESSION: coach-definable / importable NAMES (formation, defFront, coverage,
   blitz, hash, playDir, motion) and per-play custom tags must render INERT in the
   stats dashboard/reports and the tag form. They arrive via season/CSV import, so
   a name like <img src=x onerror=…> is stored-XSS if interpolated raw into
   innerHTML. stats-engine tell text + several hand-built table rows, and
   play-tagger._renderCustomTags, were unescaped. (Same class as lesson #18.)

   Run after build:  node tools/e2e-xss-names.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
page.on('console', m => {
  if (m.type() !== 'error') return;
  // The payload's failed <img src=x> fetch is the test working, not an app error.
  if (/Failed to load resource|net::ERR/i.test(m.text())) return;
});
const URL = TEST_APP_URL;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const res = await page.evaluate(async () => {
  window.__xss = 0;
  const P = '<img src=x onerror="window.__xss=(window.__xss||0)+1">';
  const sm = window.app.storage, store = sm.seasonStore, eng = window.app.stats, tagger = window.app.tagger;

  const mkPlay = (id, unit, extra) => ({
    id, timestamp: { start: 0, end: 5 }, notes: '', annotations: '',
    tags: Object.assign({ unit, down: '1', distance: '10', result: 'Gain', yardage: '5', custom: [], players: {}, grades: {} }, extra),
  });
  const plays = [];
  let id = 1;
  // 8 offensive plays, all the payload formation, dominant run → a self-scout tell,
  // plus payload hash/playDir/motion to hit those table rows.
  for (let i = 0; i < 8; i++) plays.push(mkPlay(id++, 'offense', { formation: P, playType: 'Run Inside', runPass: 'Run', hash: P, playDir: P, motion: P, personnel: '11' }));
  // 6 defensive plays with payload front/coverage/blitz.
  for (let i = 0; i < 6; i++) plays.push(mkPlay(id++, 'defense', { defFront: P, coverage: P, blitz: P, playType: 'Short Pass', runPass: 'Pass' }));
  // one play carrying a payload custom tag.
  plays.push(mkPlay(id++, 'offense', { formation: 'Shotgun', playType: 'Short Pass', runPass: 'Pass', custom: [P] }));
  // a BIG play (high yardage/TD) with the payload formation → EPA/big-play tables.
  plays.push(mkPlay(id++, 'offense', { formation: P, playType: 'Deep Pass', runPass: 'Pass', result: 'Touchdown', yardage: '55' }));

  store.data = store._normalize({
    version: 5, type: 'season', id: 'xss', seasonName: 'XSS', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: { opponent: P, perspective: 'scout' }, status: 'active', plays, annotations: [], nextId: id, currentPlayId: null, clipNames: [], isMultiClip: false }],
  });
  store.currentSeasonId = 'xss';
  sm._loadActiveGame();

  const call = (fn) => { try { fn(); } catch (e) {} };
  // Stats dashboard + every tab + the focused reports.
  call(() => eng.showDashboard());
  for (const t of ['game', 'offense', 'defense', 'selfscout', 'season', 'matchup']) {
    const b = document.querySelector(`#statsDashboard .stats-tab[data-tab="${t}"]`);
    if (b) call(() => b.click());
  }
  call(() => eng.renderSelfScout());
  call(() => eng.renderDefensiveReport());
  call(() => { const r = eng.generateScoutReport && eng.generateScoutReport(); if (eng.renderScoutReport) eng.renderScoutReport(); });
  call(() => eng.generateDefensiveSelfScout && eng.generateDefensiveSelfScout());

  // Tendency Matrix: row/col keys are coach-controlled formation/coverage/custom
  // library values (importable). _renderMatrixGrid interpolates them into <td>,
  // <th>, and the title="" attribute — a direct stored-XSS sink.
  let matrixHtml = '';
  call(() => { matrixHtml = eng._renderMatrixGrid(eng._computeMatrix(plays.filter(p => p.tags.unit === 'offense'), 'formation', 'down')); });
  const matrixRawImg = /<img/i.test(matrixHtml);
  const matrixEscaped = matrixHtml.includes('&lt;img');

  // Tag form: render the custom-tag play's chips.
  call(() => { tagger.currentPlayId = id - 1; tagger._renderCustomTags([P]); });

  // Give any onerror a tick to fire.
  await new Promise(r => setTimeout(r, 60));

  const html = document.body.innerHTML;
  const liveImgs = [...document.querySelectorAll('img')].filter(im => (im.getAttribute('src') || '') === 'x').length;
  if (eng.hideDashboard) call(() => eng.hideDashboard());
  return { xss: window.__xss, liveImgs, escapedPresent: html.includes('&lt;img') || html.includes('&amp;lt;img'), matrixRawImg, matrixEscaped };
});

ok(res.xss === 0, 'no payload handler fired across stats dashboard/reports + tag form (formation/front/coverage/blitz/hash/custom)', JSON.stringify(res));
ok(res.liveImgs === 0, 'no live <img src=x> payload element was injected into the DOM', JSON.stringify(res));
ok(res.escapedPresent, 'the payload text is preserved but escaped (rendered as literal text)', JSON.stringify(res));
ok(!res.matrixRawImg && res.matrixEscaped, 'Tendency Matrix escapes coach-controlled row/col values (no raw <img in the grid)', JSON.stringify(res));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
