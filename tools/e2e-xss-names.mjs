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
  // Every native self-report tab plus the opponent-scout route. Capture the
  // native Offense surface while it is mounted: coach-controlled formation
  // labels must remain literal text and never become live markup.
  const reports = window.app.reportsScreen;
  call(() => reports.show());
  call(() => reports.selectTab('offense'));
  for (const tab of ['overview', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']) {
    call(() => reports.selectTab(tab));
  }
  call(() => reports.scoutOpponent(P));
  const matrixHtml = reports.content?.innerHTML || '';
  const matrixText = reports.content?.textContent || '';
  const matrixRawImg = !!reports.content?.querySelector('img[src=x]');
  const matrixEscaped = matrixHtml.includes('&lt;img') || matrixText.includes('<img');
  call(() => eng.generateDefensiveSelfScout && eng.generateDefensiveSelfScout());

  // Tag form: render the custom-tag play's chips.
  call(() => { tagger.currentPlayId = id - 1; tagger._renderCustomTags([P]); });

  // Give any onerror a tick to fire.
  await new Promise(r => setTimeout(r, 60));

  const html = document.body.innerHTML;
  const liveImgs = [...document.querySelectorAll('img')].filter(im => (im.getAttribute('src') || '') === 'x').length;
  call(() => window.app.workspaceShell.show('breakdown'));
  return { xss: window.__xss, liveImgs, escapedPresent: html.includes('&lt;img') || html.includes('&amp;lt;img'), matrixRawImg, matrixEscaped };
});

ok(res.xss === 0, 'no payload handler fired across stats dashboard/reports + tag form (formation/front/coverage/blitz/hash/custom)', JSON.stringify(res));
ok(res.liveImgs === 0, 'no live <img src=x> payload element was injected into the DOM', JSON.stringify(res));
ok(res.escapedPresent, 'the payload text is preserved but escaped (rendered as literal text)', JSON.stringify(res));
ok(!res.matrixRawImg && res.matrixEscaped, 'Native Offense escapes coach-controlled formation values (no raw <img in the grid)', JSON.stringify(res));

// Home's game card composes a date label and a score string, both of which can
// carry unescaped coach/import data -- `dateLabel()` deliberately returns the
// raw string for an invalid date, and imported/legacy scoreUs/scoreThem are
// never guaranteed numeric or safe. This once flowed through a string-HTML sink
// (`WorkspaceShell._gameRowHtml`, repaired at Codex review f1a90c2 finding 2)
// which was deleted with the Home comp migration; Home is a Preact route now and
// the values are text children. Drive the REAL route rather than a sink
// function, so this keeps its meaning against whatever renders Home: it fails if
// anyone reintroduces dangerouslySetInnerHTML or an innerHTML assignment here.
const rowRes = await page.evaluate(async () => {
  window.__xssRow = 0;
  const P = '<img src=x onerror="window.__xssRow=(window.__xssRow||0)+1">';
  const app = window.app, store = app.storage.seasonStore;
  const priorData = store.data, priorSeasonId = store.currentSeasonId;
  store.data = store._normalize({
    version: 5, type: 'season', id: 'row-xss-season', seasonName: 'Row XSS', activeGameId: 'row-xss',
    games: [{
      id: 'row-xss', name: '', status: 'active',
      gameInfo: { opponent: 'Opponent', date: P, scoreUs: P, scoreThem: '3' },
      plays: [], annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false,
    }],
  });
  store.currentSeasonId = 'row-xss-season';
  await app.workspaceShell.show('home');
  await new Promise(r => setTimeout(r, 400));
  const host = document.querySelector('.ws-home') || document.body;
  const liveImgs = [...host.querySelectorAll('img')].filter(im => (im.getAttribute('src') || '') === 'x').length;
  const text = host.textContent || '';
  // The payload must survive as literal text, not vanish: silently dropping a
  // hostile value would also pass an "is it escaped" check while losing data.
  const escapedPresent = text.includes('<img src=x');
  store.data = priorData; store.currentSeasonId = priorSeasonId;
  await app.workspaceShell.show('home');
  return { xss: window.__xssRow, liveImgs, escapedPresent, textLength: text.length };
});
ok(rowRes.xss === 0 && rowRes.liveImgs === 0, 'a hostile Home game-row date/score value fires no handler and creates no live element', JSON.stringify(rowRes));
ok(rowRes.escapedPresent, 'the hostile date/score text is preserved but escaped, not silently dropped', JSON.stringify(rowRes));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
