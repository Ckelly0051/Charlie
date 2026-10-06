/* HOME AT STARTUP SHOWS THE LIBRARY, NOT FIRST-RUN (SMOKE-110 finding 1)
   Installed 1.12.0-110: with three seasons in the program, Home opened on
   "Get started" and "Start the football year here / Create first season"
   until the coach clicked Season library. Home rendered from TeamHubScreen's
   state before that state had ever loaded: the rail read its empty team list
   as "no team" and the library panel read its empty season list as "no
   seasons".

   Run after build:  node tools/e2e-home-startup-library.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
  await gotoApp(page, APP_URL);
  // Two program seasons, then the library with no season open (startup is
  // library-first, so this is the state every launch begins in).
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: '2025 Startup JV', team: 'Startup', year: '2025', level: 'JV' });
    await app.storage.createSeason({ name: '2026 Startup Varsity', team: 'Startup', year: '2026', level: 'Varsity' });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.homeScreen?.snapshot?.().active);
  await new Promise(r => setTimeout(r, 400));
  const settled = await page.evaluate(() => ({
    open: !!window.app.storage.seasonStore.currentSeasonId,
    seasons: window.app.teamHubScreen.snapshot().seasons?.length || 0,
  }));
  ok(!settled.open && settled.seasons >= 2, 'fixture: startup lands on Home with two seasons and none open', settled);

  // Hold the FIRST season listing after launch open, as a slow desktop catalog
  // does, and look at Home while TeamHubScreen has never loaded.
  const read = () => page.evaluate(() => {
    const text = sel => [...document.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, ' ').trim()).join(' | ');
    return { status: window.app.teamHubScreen.snapshot().status, rail: text('.rail-year'), panel: text('.library-panel') };
  });
  await page.evaluateOnNewDocument(() => {
    let app;
    Object.defineProperty(window, 'app', { configurable: true, get: () => app, set: value => {
      app = value;
      const storage = value?.storage;
      if (!storage || storage.__held) return;
      const real = storage.listSeasons.bind(storage);
      storage.__held = true;
      storage.listSeasons = () => new Promise(resolve => { window.__releaseList = () => resolve(real()); });
    } });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.homeScreen?.snapshot?.().active && window.__releaseList);
  await new Promise(r => setTimeout(r, 300));
  const loading = await read();
  ok(loading.status === 'loading', 'fixture: the hub is still loading', loading.status);
  ok(!/Get started/.test(loading.rail), 'while loading, the rail does not offer Get started', loading.rail);
  ok(!/Start the football year here|Create first season/.test(loading.panel), 'while loading, the library does not show the first-run empty state', loading.panel);
  ok(/Loading seasons/.test(loading.panel), 'while loading, the library says it is loading', loading.panel);

  await page.evaluate(() => window.__releaseList());
  await new Promise(r => setTimeout(r, 300));
  const done = await read();
  ok(done.status === 'ready' && /2025 Startup JV/.test(done.panel) && /2026 Startup Varsity/.test(done.panel) && !/Get started/.test(done.rail),
    'once loaded, the library and rail list both seasons', done);
} finally { await browser.close(); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
