/* P0 regression: latest-film-load-wins. Two overlapping game opens run two
   overlapping _autoLoadFilm calls. If the FIRST (slow) game's film resolves
   LAST, it must NOT stamp its video onto the now-active SECOND game — the coach
   would tag game B while watching game A's film (active=B, loaded=B, film=A).
   The load captures a monotonic token at entry and re-checks it before every
   player/playlist mutation; a superseded load aborts. Runs against the built
   bundle. Mutation check: drop the `!stale()` guard on vc.loadUrl in
   js/storage.js and this reds (the slow load clobbers). */
import puppeteer from 'puppeteer';
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage);

// --- Single-video overlapping open: slow first, fast second ---
const r = await page.evaluate(async () => {
  const app = window.app;
  const loaded = [];
  app.vc.loadUrl = (url) => loaded.push(url);   // spy — record every film swap, in order
  let release;
  const gate = new Promise(res => { release = res; });
  const backend = {
    supportsFilm: () => true,
    supportsLinkedFilm: () => false,
    listFilmFiles: async id => [{ name: `${id}.mp4`, path: `${id}.mp4` }],
    // The FIRST-opened game ('slow') stalls at URL resolution until we release
    // it — long enough for the SECOND game to finish loading first.
    filmUrl: async (id) => { if (id === 'slow') await gate; return `asset://${id}`; },
  };
  app.storage.seasonStore.backend = backend;
  const mk = id => ({ id, videoFileName: `${id}.mp4`, isMultiClip: false, plays: [], clipNames: [], clipPaths: [] });

  const pSlow = app.storage._autoLoadFilm(mk('slow'));   // starts, blocks in filmUrl
  const pFast = app.storage._autoLoadFilm(mk('fast'));   // no gate — resolves, loads 'fast'
  await pFast;
  const afterFast = loaded.slice();
  release();                                             // slow's filmUrl now resolves LAST
  await pSlow;
  return { loaded, afterFast, last: loaded[loaded.length - 1] };
});

ok(r.afterFast.length === 1 && r.afterFast[0] === 'asset://fast',
  'The later (fast) open loads its own film', JSON.stringify(r.afterFast));
ok(r.last === 'asset://fast' && !r.loaded.includes('asset://slow'),
  'The superseded (slow) earlier load never clobbers the active game film', JSON.stringify(r));

// --- The reverse direction still works: a lone load applies normally ---
const r2 = await page.evaluate(async () => {
  const app = window.app;
  const loaded = [];
  app.vc.loadUrl = (url) => loaded.push(url);
  app.storage.seasonStore.backend = {
    supportsFilm: () => true, supportsLinkedFilm: () => false,
    listFilmFiles: async id => [{ name: `${id}.mp4`, path: `${id}.mp4` }],
    filmUrl: async id => `asset://${id}`,
  };
  await app.storage._autoLoadFilm({ id: 'only', videoFileName: 'only.mp4', isMultiClip: false, plays: [], clipNames: [], clipPaths: [] });
  return { loaded };
});
ok(r2.loaded.length === 1 && r2.loaded[0] === 'asset://only',
  'A single (non-racing) load applies its film normally', JSON.stringify(r2));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
