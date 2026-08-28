import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

const initial = await page.evaluate(() => ({
  mounted: !!window.app?.multiAngle,
  add: !!document.querySelector('.gi-theater-transport-tools button[aria-label^=Add]'),
  hidden: !document.getElementById('videoContainer')?.classList.contains('has-angle2'),
  obsoleteAdd: !!document.getElementById('btnAddAngle'),
}));
ok(initial.mounted && initial.add && initial.hidden && !initial.obsoleteAdd,
  'Multi-angle is mounted with one intentional Add Angle entry point', JSON.stringify(initial));

const loaded = await page.evaluate(() => {
  const multi = window.app.multiAngle;
  const primary = window.app.vc.videoElement;
  const secondary = multi.video2;
  const events = [];
  const calls = { load: 0, play: 0, pause: 0, revoked: [] };

  URL.createObjectURL = file => `blob:test/${file.name}`;
  URL.revokeObjectURL = url => calls.revoked.push(url);
  secondary.load = () => { calls.load++; };
  secondary.play = () => { calls.play++; return Promise.resolve(); };
  secondary.pause = () => { calls.pause++; };
  Object.defineProperty(primary, 'currentTime', { configurable: true, writable: true, value: 12 });
  Object.defineProperty(primary, 'playbackRate', { configurable: true, writable: true, value: 1.5 });
  Object.defineProperty(primary, 'paused', { configurable: true, get: () => false });
  Object.defineProperty(secondary, 'currentTime', { configurable: true, writable: true, value: 0 });
  Object.defineProperty(secondary, 'playbackRate', { configurable: true, writable: true, value: 1 });
  multi.on('angle-loaded', data => events.push(['loaded', data?.name]));
  multi.on('angle-swapped', data => events.push(['swapped', data?.active]));
  multi.on('view-changed', data => events.push(['view', data?.mode]));
  multi.on('angle-removed', () => events.push(['removed']));
  window.__multiAngleTest = { calls, events };

  multi.loadAngle2(new File(['film'], 'endzone.mp4', { type: 'video/mp4' }));
  secondary.dispatchEvent(new Event('loadedmetadata'));
  const container = document.getElementById('videoContainer');
  return {
    enabled: multi.enabled,
    name: multi.angle2Name,
    src: secondary.getAttribute('src'),
    rate: secondary.playbackRate,
    synced: secondary.currentTime,
    sideBySide: multi.viewMode === 'sideBySide' && container.classList.contains('angle-sbs'),
    obsoleteControls: !!document.getElementById('angleControls'),
    loadCalls: calls.load,
    playCalls: calls.play,
    event: events[0],
  };
});
ok(loaded.enabled && loaded.name === 'endzone.mp4' && /blob:test\/endzone\.mp4/.test(loaded.src || '')
  && loaded.rate === 1.5 && loaded.synced === 12 && loaded.sideBySide && !loaded.obsoleteControls
  && loaded.loadCalls === 1 && loaded.playCalls === 1
  && JSON.stringify(loaded.event) === JSON.stringify(['loaded', 'endzone.mp4']),
  'Loading a second angle syncs playback and opens the desktop side-by-side view', JSON.stringify(loaded));

const sync = await page.evaluate(() => {
  const multi = window.app.multiAngle;
  const primary = window.app.vc.videoElement;
  const secondary = multi.video2;
  const calls = window.__multiAngleTest.calls;

  primary.currentTime = 30;
  secondary.currentTime = 0;
  multi.offset = 1.5;
  multi._syncTime();
  const corrected = secondary.currentTime;

  secondary.currentTime = 31.4;
  window.app.vc._emit('time-update', { time: primary.currentTime });
  const tolerated = secondary.currentTime;
  window.app.vc._emit('play-state-change', { playing: true });
  window.app.vc._emit('play-state-change', { playing: false });

  primary.playbackRate = 0.5;
  primary.dispatchEvent(new Event('ratechange'));
  return {
    corrected, tolerated,
    playCalls: calls.play,
    pauseCalls: calls.pause,
    rate: secondary.playbackRate,
  };
});
ok(sync.corrected === 31.5 && sync.tolerated === 31.4
  && sync.playCalls === 2 && sync.pauseCalls === 1 && sync.rate === 0.5,
  'Second-angle sync corrects real drift, tolerates sub-threshold jitter, and follows transport state', JSON.stringify(sync));

const views = await page.evaluate(() => {
  const multi = window.app.multiAngle;
  const container = document.getElementById('videoContainer');
  multi.setViewMode('pip');
  const pip = multi.viewMode === 'pip' && container.classList.contains('angle-pip');

  document.getElementById('angleWrapper2').click();
  const clickSwap = multi.activeAngle;
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyV', bubbles: true }));
  const keySwap = multi.activeAngle;
  return {
    pip, clickSwap, keySwap,
    activeClass: container.classList.contains(`active-angle-${keySwap}`),
    events: window.__multiAngleTest.events,
  };
});
ok(views.pip && views.clickSwap === 2 && views.keySwap === 1 && views.activeClass
  && views.events.some(event => event[0] === 'view' && event[1] === 'pip')
  && views.events.filter(event => event[0] === 'swapped').length === 2,
  'PiP click and V-key swap the active camera through the production command API', JSON.stringify(views));

const removed = await page.evaluate(() => {
  const multi = window.app.multiAngle;
  multi.removeAngle2();
  const container = document.getElementById('videoContainer');
  return {
    enabled: multi.enabled,
    active: multi.activeAngle,
    name: multi.angle2Name,
    src: multi.video2.getAttribute('src'),
    hasAngle: container.classList.contains('has-angle2'),
    obsoleteControls: !!document.getElementById('angleControls'),
    revoked: window.__multiAngleTest.calls.revoked,
    removedEvents: window.__multiAngleTest.events.filter(event => event[0] === 'removed').length,
  };
});
ok(!removed.enabled && removed.active === 1 && removed.name === null && removed.src === null
  && !removed.hasAngle && !removed.obsoleteControls
  && removed.revoked.includes('blob:test/endzone.mp4') && removed.removedEvents === 1,
  'Removing the second angle revokes its media and restores the single-camera workspace', JSON.stringify(removed));

ok(errors.length === 0, 'multi-angle journey has zero page errors', errors.join(' | '));
await browser.close();

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
