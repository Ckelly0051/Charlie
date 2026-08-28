import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* E2E harness — VideoController cross-origin retry logic. Covers the desktop
   asset-protocol playback path that the other harnesses (blob URLs / API play
   selection) never exercise. Drives the error/promote handlers directly with
   video.load() stubbed, so the assertions are deterministic without a real
   asset:// server or a real CORS failure.

   The regression this guards: a corrupt clip must NOT latch corsBlocked (which
   would taint the canvas for every later good clip), while a genuine CORS
   failure (retry succeeds) MUST latch it so a 69-clip game retries once.

   Run after build:  npm run build && node tools/e2e-video-cors.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
// This harness intentionally drives the <video> error path and points src at a
// non-existent asset.localhost URL, so media-error logs and connection-refused
// noise are EXPECTED — filter them; only unexpected errors should fail the run.
const expected = t => /Video error code=/.test(t) || /ERR_CONNECTION_REFUSED/.test(t)
  || /Failed to load resource/.test(t) || /MEDIA_ELEMENT_ERROR/.test(t);
page.on('pageerror', e => { if (!expected(e.message)) errors.push('PAGEERROR: ' + e.message); });
page.on('console', m => { if (m.type() === 'error' && !expected(m.text())) errors.push(m.text()); });

await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(500);

// All assertions run in-page against the live VideoController instance, with
// video.load() stubbed to a no-op so no real network load fires async errors
// that would race our synchronous checks.
const ASSET = 'https://asset.localhost/seasons/1/films/1/IMG_6313.mp4';
const ASSET2 = 'https://asset.localhost/seasons/1/films/1/IMG_6314.mp4';

console.log('\n== 1. _shouldCorsRetry pure logic ==');
let r = await page.evaluate((ASSET) => {
  const vc = window.app.vc;
  vc.video.load = () => {};
  const reset = (cross, src, pending) => {
    if (cross) vc.video.crossOrigin = 'anonymous'; else vc.video.removeAttribute('crossorigin');
    vc.video.removeAttribute('src');
    if (src) vc.video.setAttribute('src', src);
    vc._corsRetryPending = pending;
  };
  reset(true, ASSET, null);
  const fresh = vc._shouldCorsRetry(ASSET);
  reset(true, 'blob:whatever', null);
  const blob = vc._shouldCorsRetry('blob:whatever');
  reset(false, ASSET, null);
  const noCross = vc._shouldCorsRetry(ASSET);
  reset(true, ASSET, ASSET);
  const alreadyPending = vc._shouldCorsRetry(ASSET);
  const empty = vc._shouldCorsRetry('');
  return { fresh, blob, noCross, alreadyPending, empty };
}, ASSET);
ok(r.fresh === true, 'retry a fresh crossorigin asset URL', JSON.stringify(r));
ok(r.blob === false, 'never retry a blob: URL', JSON.stringify(r));
ok(r.noCross === false, 'no retry when crossorigin already absent', JSON.stringify(r));
ok(r.alreadyPending === false, 'no retry when this src is already pending', JSON.stringify(r));
ok(r.empty === false, 'no retry on empty src', JSON.stringify(r));

console.log('\n== 2. Corrupt clip: error then error must NOT latch corsBlocked ==');
r = await page.evaluate((ASSET) => {
  const vc = window.app.vc;
  vc.video.load = () => {};
  vc.corsBlocked = false; vc._corsRetryPending = null;
  vc.video.crossOrigin = 'anonymous';
  vc.video.setAttribute('src', ASSET);
  // First error: handler should retry without crossorigin, NOT latch yet.
  vc._handleMediaError();
  const afterFirst = { hasCross: vc.video.hasAttribute('crossorigin'),
                       pending: vc._corsRetryPending, blocked: vc.corsBlocked };
  // The retry also fails (corrupt file) — crossorigin is now absent, so the
  // handler must fall through and clear pending, leaving corsBlocked false.
  vc._handleMediaError();
  const afterSecond = { hasCross: vc.video.hasAttribute('crossorigin'),
                        pending: vc._corsRetryPending, blocked: vc.corsBlocked };
  return { afterFirst, afterSecond };
}, ASSET);
ok(r.afterFirst.hasCross === false && r.afterFirst.pending === ASSET && r.afterFirst.blocked === false,
   'first error retries without crossorigin, no latch', JSON.stringify(r.afterFirst));
ok(r.afterSecond.blocked === false && r.afterSecond.pending === null,
   'second (retry) failure leaves corsBlocked FALSE — canvas stays usable', JSON.stringify(r.afterSecond));

console.log('\n== 3. True CORS failure: error then successful load latches corsBlocked ==');
r = await page.evaluate((ASSET) => {
  const vc = window.app.vc;
  vc.video.load = () => {};
  vc.corsBlocked = false; vc._corsRetryPending = null;
  vc.video.crossOrigin = 'anonymous';
  vc.video.setAttribute('src', ASSET);
  vc._handleMediaError();                 // retry without crossorigin
  const mid = { pending: vc._corsRetryPending, blocked: vc.corsBlocked };
  vc._promoteCorsRetry();                  // simulates loadedmetadata firing
  const after = { pending: vc._corsRetryPending, blocked: vc.corsBlocked };
  return { mid, after };
}, ASSET);
ok(r.mid.pending === ASSET && r.mid.blocked === false, 'mid-retry not yet latched', JSON.stringify(r.mid));
ok(r.after.blocked === true && r.after.pending === null, 'confirmed retry latches corsBlocked', JSON.stringify(r.after));

console.log('\n== 4. A normal successful load never falsely latches ==');
r = await page.evaluate(() => {
  const vc = window.app.vc;
  vc.corsBlocked = false; vc._corsRetryPending = null;
  vc._promoteCorsRetry();   // no pending → must do nothing
  return { blocked: vc.corsBlocked, pending: vc._corsRetryPending };
});
ok(r.blocked === false && r.pending === null, 'promote with no pending is a no-op', JSON.stringify(r));

console.log('\n== 5. setSrc owns the crossOrigin decision (single source) ==');
r = await page.evaluate((ASSET, ASSET2) => {
  const vc = window.app.vc;
  let loaded = 0; vc.video.load = () => { loaded++; };
  vc.corsBlocked = false;
  vc.setSrc(ASSET);
  const open = { cross: vc.video.getAttribute('crossorigin'), loaded };
  vc.corsBlocked = true;
  vc.setSrc(ASSET2);
  const blocked = { cross: vc.video.getAttribute('crossorigin'), loaded };
  return { open, blocked };
}, ASSET, ASSET2);
ok(r.open.cross === 'anonymous' && r.open.loaded === 1, 'setSrc sets crossorigin when not blocked + calls load', JSON.stringify(r.open));
ok(r.blocked.cross === null && r.blocked.loaded === 2, 'setSrc omits crossorigin when corsBlocked', JSON.stringify(r.blocked));

console.log('\n== 6. Multi-clip switchToClip delegates to setSrc (corsBlocked honored) ==');
r = await page.evaluate((ASSET) => {
  const vc = window.app.vc;
  const pl = window.app.playlist;
  vc.video.load = () => {};
  // corsBlocked true → the clip must load WITHOUT crossorigin via setSrc.
  vc.corsBlocked = true;
  pl.clips = [{ id: 1, file: null, name: 'IMG_6313', assetUrl: ASSET, objectUrl: null, duration: 5, playId: null }];
  pl.activeClipIndex = -1;
  pl.switchToClip(0);
  const blocked = { cross: vc.video.getAttribute('crossorigin'), src: vc.video.getAttribute('src') };
  // corsBlocked false → crossorigin applied.
  vc.corsBlocked = false;
  pl.switchToClip(0);
  const open = { cross: vc.video.getAttribute('crossorigin') };
  return { blocked, open };
}, ASSET);
ok(r.blocked.cross === null && r.blocked.src === ASSET, 'switchToClip skips crossorigin when corsBlocked', JSON.stringify(r.blocked));
ok(r.open.cross === 'anonymous', 'switchToClip applies crossorigin when not blocked', JSON.stringify(r.open));

console.log('\n== 7. Playlist preloads exactly one useful next clip and releases stale resources ==');
r = await page.evaluate(() => {
  const vc = window.app.vc;
  const pl = window.app.playlist;
  const originalLoad = HTMLMediaElement.prototype.load;
  const originalCreate = URL.createObjectURL;
  const originalRevoke = URL.revokeObjectURL;
  const revoked = [];
  HTMLMediaElement.prototype.load = () => {};
  URL.createObjectURL = value => originalCreate.call(URL, value);
  URL.revokeObjectURL = url => { revoked.push(url); originalRevoke.call(URL, url); };
  try {
    pl.reset();
    const clips = ['one.mp4', 'two.mp4', 'three.mp4'].map((name, i) => ({
      id: i + 1,
      file: new File(['clip'], name, { type: 'video/mp4' }),
      name,
      assetUrl: null,
      objectUrl: null,
      duration: 5,
      playId: null,
    }));
    pl.clips = clips;
    pl.activeClipIndex = -1;

    pl.switchToClip(0);
    const first = {
      active: pl.activeClipIndex,
      urls: clips.map(c => c.objectUrl),
      preloadIndex: pl._nextPreloadIndex,
      preloadMode: pl._nextPreloadEl?.preload,
      preloadSrc: pl._nextPreloadEl?.getAttribute('src'),
    };
    const reusedUrl = clips[1].objectUrl;

    pl.switchToClip(1);
    const advanced = {
      active: pl.activeClipIndex,
      videoSrc: vc.video.getAttribute('src'),
      urls: clips.map(c => c.objectUrl),
      preloadIndex: pl._nextPreloadIndex,
      reusedUrl,
    };

    const staleThirdUrl = clips[2].objectUrl;
    pl.switchToClip(0);
    const jumped = {
      active: pl.activeClipIndex,
      urls: clips.map(c => c.objectUrl),
      preloadIndex: pl._nextPreloadIndex,
      staleThirdRevoked: revoked.includes(staleThirdUrl),
    };

    const removedNext = clips[1];
    pl.removeClip(1);
    const removed = {
      names: pl.clips.map(c => c.name),
      active: pl.activeClipIndex,
      preloadIndex: pl._nextPreloadIndex,
      preloadSrc: pl._nextPreloadEl?.getAttribute('src'),
      removedUrlCleared: removedNext.objectUrl === null,
    };

    pl.clips.push({ id: 99, file: null, name: 'missing.mp4', assetUrl: null, objectUrl: null, duration: null, playId: null });
    const activeBeforeMissing = pl.activeClipIndex;
    const videoBeforeMissing = vc.video.getAttribute('src');
    pl.switchToClip(pl.clips.length - 1);
    const missing = {
      activeUnchanged: pl.activeClipIndex === activeBeforeMissing,
      videoUnchanged: vc.video.getAttribute('src') === videoBeforeMissing,
    };

    const retained = [...pl.clips];
    pl.reset();
    const reset = {
      preloadCleared: pl._nextPreloadEl === null && pl._nextPreloadIndex === -1,
      playlistCleared: pl.clips.length === 0 && pl.activeClipIndex === -1,
      urlsCleared: retained.every(c => c.objectUrl == null),
    };
    return { first, advanced, jumped, removed, missing, reset };
  } finally {
    HTMLMediaElement.prototype.load = originalLoad;
    URL.createObjectURL = originalCreate;
    URL.revokeObjectURL = originalRevoke;
  }
});
ok(r.first.active === 0 && r.first.urls[0] && r.first.urls[1] && r.first.urls[2] === null && r.first.preloadIndex === 1 && r.first.preloadMode === 'auto' && r.first.preloadSrc === r.first.urls[1],
   'first switch retains active + exactly one preloaded successor', JSON.stringify(r.first));
ok(r.advanced.active === 1 && r.advanced.videoSrc === r.advanced.reusedUrl && r.advanced.urls[0] === null && r.advanced.urls[1] === r.advanced.reusedUrl && r.advanced.urls[2] && r.advanced.preloadIndex === 2,
   'advancing reuses the preloaded URL and releases the prior clip', JSON.stringify(r.advanced));
ok(r.jumped.active === 0 && r.jumped.urls[0] && r.jumped.urls[1] && r.jumped.urls[2] === null && r.jumped.preloadIndex === 1 && r.jumped.staleThirdRevoked,
   'jumping rebuilds only the useful successor and revokes the stale preload', JSON.stringify(r.jumped));
ok(r.removed.names.join(',') === 'one.mp4,three.mp4' && r.removed.active === 0 && r.removed.preloadIndex === 1 && r.removed.preloadSrc && r.removed.removedUrlCleared,
   'removing the queued successor clears it and preloads the new successor', JSON.stringify(r.removed));
ok(r.missing.activeUnchanged && r.missing.videoUnchanged,
   'a missing clip cannot move the active pointer or replace the current video', JSON.stringify(r.missing));
ok(r.reset.preloadCleared && r.reset.playlistCleared && r.reset.urlsCleared,
   'reset releases detached preload state and every object URL', JSON.stringify(r.reset));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:\n' + errors.join('\n')); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
