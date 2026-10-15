/* Startup library distinguishes loading, ready and failed catalog reads from
 * first-run state. Retry must issue a fresh read and render the saved seasons. */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
  const waitForLibrary = async status => {
    await page.waitForFunction(expected => {
      const app = window.app;
      const panel = document.querySelector('[data-native-home] .library-panel');
      if (!app?.homeScreen?.snapshot?.().active || app.teamHubScreen.snapshot().status !== expected
        || !panel?.getClientRects().length) return false;
      if (expected === 'loading') return !!panel.querySelector('[data-library-loading]');
      if (expected === 'error') return !!panel.querySelector('[data-library-error] button');
      return app.teamHubScreen.snapshot().seasons?.length >= 2
        && panel.querySelectorAll('[data-library-season]').length >= 2;
    }, { timeout: 8000 }, status);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  };
  await gotoApp(page, APP_URL);
  // Two program seasons, then the library with no season open (startup is
  // library-first, so this is the state every launch begins in).
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: '2025 Startup JV', team: 'Startup', year: '2025', level: 'JV' });
    await app.storage.createSeason({ name: '2026 Startup Varsity', team: 'Startup', year: '2026', level: 'Varsity' });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await waitForLibrary('ready');
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
      storage.listSeasons = () => new Promise((resolve, reject) => {
        window.__listReadCount = (window.__listReadCount || 0) + 1;
        window.__releaseList = () => resolve(real());
        window.__rejectList = () => reject(new Error('catalog read failed'));
      });
    } });
  });
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.homeScreen?.snapshot?.().active && window.__releaseList);
  await waitForLibrary('loading');
  const loading = await read();
  ok(loading.status === 'loading', 'fixture: the hub is still loading', loading.status);
  ok(!/Get started/.test(loading.rail), 'while loading, the rail does not offer Get started', loading.rail);
  ok(!/Start the football year here|Create first season/.test(loading.panel), 'while loading, the library does not show the first-run empty state', loading.panel);
  ok(/Loading seasons/.test(loading.panel), 'while loading, the library says it is loading', loading.panel);

  await page.evaluate(() => window.__releaseList());
  await waitForLibrary('ready');
  const done = await read();
  ok(done.status === 'ready' && /2025 Startup JV/.test(done.panel) && /2026 Startup Varsity/.test(done.panel) && !/Get started/.test(done.rail),
    'once loaded, the library and rail list both seasons', done);

  // A failed first read shows an error and Retry, never an endless loading state.
  await page.reload({ waitUntil: 'networkidle0' });
  await page.waitForFunction(() => window.app?.homeScreen?.snapshot?.().active && window.__rejectList);
  await page.evaluate(() => window.__rejectList());
  await waitForLibrary('error');
  const failed = await read();
  ok(failed.status === 'error', 'fixture: the first season read failed', failed.status);
  ok(!/Loading seasons/.test(failed.panel) && /could not be loaded|did not load/i.test(failed.panel) && /Retry/.test(failed.panel),
    'a failed first read shows an error with Retry instead of loading forever', failed.panel);
  ok(!/Get started/.test(failed.rail) && !/Start the football year here|Create first season/.test(failed.panel),
    'a failed first read never falls back to first-run', failed);
  const readsBeforeRetry = await page.evaluate(() => {
    window.__retryReleaseBefore = window.__releaseList;
    return window.__listReadCount;
  });
  await page.evaluate(() => [...document.querySelectorAll('.library-panel button')].find(b => b.textContent.trim() === 'Retry')?.click());
  await page.waitForFunction(previous => window.__listReadCount > previous
    && typeof window.__releaseList === 'function' && window.__releaseList !== window.__retryReleaseBefore,
  { timeout: 8000 }, readsBeforeRetry);
  const freshRetry = await page.evaluate(previous => window.__listReadCount > previous
    && window.__releaseList !== window.__retryReleaseBefore, readsBeforeRetry);
  ok(freshRetry, 'Retry issues a fresh catalog read with a new release callback');
  await waitForLibrary('loading');
  await page.evaluate(() => window.__releaseList());
  await waitForLibrary('ready');
  const retried = await read();
  ok(retried.status === 'ready' && /2025 Startup JV/.test(retried.panel), 'Retry loads the seasons', retried);
} finally { await browser.close(); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
