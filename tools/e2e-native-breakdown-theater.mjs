import fs from 'node:fs';
import path from 'node:path';
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
const shotDir = process.env.GIQ_S5A_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

console.log('\n== 1. Native ownership, drive grouping, and data no-op ==');
const mounted = await page.evaluate(async () => {
  const app = window.app;
  app.workspaceShell.disable();
  await app.storage.createSeason({ name: 'S5a Theater', team: 'Mavericks', year: '2026' });
  const game = app.storage.seasonStore.activeGame();
  game.plays = Array.from({ length: 12 }, (_, index) => ({
    id: index + 1, timestamp: { start: index * 8, end: index * 8 + 6 },
    tags: { unit: 'offense', driveNumber: index < 4 ? '1' : index < 9 ? '2' : '',
      down: String(index % 4 + 1), distance: index === 6 ? '26' : '10',
      formation: index % 2 ? 'Power-I' : 'Ace', qbAlignment: index % 2 ? 'Under Center' : 'Shotgun',
      runPass: index % 2 ? 'Run' : 'Pass', playType: index === 6 ? 'Deep Pass + Play Action' : index % 2 ? 'Run Outside' : 'Short Pass',
      result: index === 6 ? 'Interception + Touchdown' : index === 9 ? 'Touchdown' : 'Gain',
      yardage: index === 6 ? '-12' : String(index + 2), players: {}, grades: {}, custom: [] }, notes: '', analysis: null,
  }));
  app.tagger.plays = game.plays; app.tagger.nextId = 13; app.tagger._updatePlaySelect(); app.tagger._updateTimeline(); app.tagger._emit('plays-loaded'); app.tagger.selectPlay(1);
  const before = JSON.stringify(app.storage.seasonStore.data);
  const media = document.getElementById('videoContainer');
  const host = document.createElement('div'); host.id = 's5aTestHost';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--gi-film)';
  document.body.appendChild(host); const didMount = app.breakdownTheater.mount(host);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return { didMount, native: document.querySelectorAll('[data-native-breakdown-theater]').length,
    sameMedia: document.querySelector('[data-native-media-slot] > #videoContainer') === media,
    legacyControls: !!host.querySelector('.playback-controls, .video-play-controls, .breakdown-play-strip'),
    dataSame: before === JSON.stringify(app.storage.seasonStore.data),
    cards: host.querySelectorAll('[data-native-play-id]').length,
    drives: [...host.querySelectorAll('.gi-drive-group h3')].map(node => node.textContent) };
});
ok(mounted.didMount && mounted.native === 1 && mounted.sameMedia, 'One native theater adopts the one canonical media node', JSON.stringify(mounted));
ok(!mounted.legacyControls, 'Native theater owns its controls and strip instead of legacy chrome');
ok(mounted.dataSame, 'Mounting the theater is a season-data no-op');
ok(mounted.cards === 12 && mounted.drives.join('|') === 'Drive 1|Drive 2|No drive', 'Strip preserves order and groups plays by drive', JSON.stringify(mounted));

let state = await page.evaluate(() => {
  const cards = [...document.querySelectorAll('.gi-play-card')];
  const long = document.querySelector('[data-native-play-id="7"] small');
  const row = long?.getBoundingClientRect();
  const children = [...(long?.children || [])];
  return { widths: [...new Set(cards.map(card => Math.round(card.getBoundingClientRect().width)))],
    text: long?.textContent, fits: children.every(node => node.scrollWidth <= node.clientWidth)
      && children.every(node => node.getBoundingClientRect().right <= row.right + 1),
    internal: document.querySelector('[data-drive-scroll]').scrollWidth > document.querySelector('[data-drive-scroll]').clientWidth,
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
ok(state.widths.length === 1 && state.widths[0] === 220, 'Play cards use one stable, intentionally wide footprint', JSON.stringify(state));
ok(state.fits && /Interception \+ Touchdown: -12/.test(state.text || ''), 'Long football copy is complete and not clipped', JSON.stringify(state));
ok(state.internal && !state.pageOverflow, 'High play counts scroll inside the strip without page overflow', JSON.stringify(state));

await page.click('[aria-label="Hide play strip"]');
state = await page.evaluate(() => ({
  collapsed: document.querySelector('.gi-drive-strip').classList.contains('is-collapsed'),
  hidden: document.querySelector('[data-drive-scroll]').hidden,
  expanded: document.querySelector('[aria-label="Show play strip"]')?.getAttribute('aria-expanded'),
}));
ok(state.collapsed && state.hidden && state.expanded === 'false',
  'Coach can collapse the play strip to trade navigation for film pixels', JSON.stringify(state));
await page.click('[aria-label="Show play strip"]');

console.log('\n== 2. Native commands drive canonical controllers ==');
await page.click('[data-native-play-id="7"]');
state = await page.evaluate(() => ({ current: window.app.tagger.currentPlayId,
  active: document.querySelector('.gi-play-card.is-current')?.dataset.nativePlayId,
  call: document.querySelector('[data-native-play-id="7"] small')?.textContent }));
ok(state.current === 7 && state.active === '7', 'Native play selection drives canonical PlayTagger identity', JSON.stringify(state));
ok(/Interception \+ Touchdown: -12/.test(state.call || ''), 'Selected play keeps complete result and yardage', state.call);

await page.evaluate(() => {
  const screen = window.app.breakdownTheater;
  const calls = { play: 0, back: 0, forward: 0, prev: 0, next: 0, loop: 0, draw: 0, angle: 0, copy: 0 };
  const bind = (owner, key, counter) => { owner[key] = () => { calls[counter]++; }; };
  bind(window.app.vc, 'togglePlay', 'play'); bind(window.app.vc, 'stepBack', 'back');
  bind(window.app.vc, 'stepForward', 'forward'); bind(window.app.vc, 'toggleLoopPlay', 'loop');
  bind(window.app.playlist, 'prevClip', 'prev'); bind(window.app.playlist, 'nextClip', 'next');
  bind(screen, 'openDrawing', 'draw'); bind(screen, 'addAngle', 'angle');
  bind(window.app.tagger, 'copyFromPrevious', 'copy'); window.__s5aCalls = calls;
});
for (const label of ['Previous clip', 'Step back one frame', 'Play film', 'Step forward one frame', 'Next clip', 'Loop current play', 'Drawing tools']) {
  await page.click(`[aria-label="${label}"]`);
}
await page.click('[aria-label="Add camera angle"]');
await page.click('.gi-theater-actions-primary button:nth-child(3)');
state = await page.evaluate(() => window.__s5aCalls);
ok(Object.values(state).every(value => value === 1), 'Transport, drawing, angle, and Copy Last delegate exactly once', JSON.stringify(state));

await page.click('.gi-autoplay-toggle input');
state = await page.evaluate(() => ({ app: window.app.autoPlayNext,
  stored: localStorage.getItem('ffa_autoplay_next'), legacy: document.getElementById('autoplayNextToggle').checked }));
ok(state.app === false && state.stored === '0' && state.legacy === false,
  'Autoplay stays synchronized across native, app, storage, and compatibility state', JSON.stringify(state));

if (shotDir) await (await page.$('.gi-breakdown-theater')).screenshot({ path: path.join(shotDir, 'breakdown-theater-1440.png') });
console.log('\n== 3. Theater geometry spends the viewport on film ==');
const geometryAt = async (width, height) => {
  await page.setViewport({ width, height });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  return page.evaluate(() => {
    const media = document.getElementById('videoContainer').getBoundingClientRect();
    const pictureWidth = Math.min(media.width, media.height * 16 / 9);
    const theater = document.querySelector('.gi-breakdown-theater').getBoundingClientRect();
    const transport = document.querySelector('.gi-theater-transport').getBoundingClientRect();
    const strip = document.querySelector('.gi-drive-strip').getBoundingClientRect();
    const actions = document.querySelector('.gi-theater-actions').getBoundingClientRect();
    const pictureHeight = Math.min(media.height, media.width * 9 / 16);
    return { media: [Math.round(media.width), Math.round(media.height)], picture: [Math.round(pictureWidth), Math.round(pictureHeight)],
      theater: [Math.round(theater.top), Math.round(theater.bottom)],
      rows: [transport, strip, actions].map(row => [Math.round(row.top), Math.round(row.bottom), Math.round(row.height)]),
      contained: theater.top >= 0 && actions.bottom <= innerHeight
        && transport.height > 0 && strip.height > 0 && actions.height > 0
        && transport.top >= media.bottom - 1 && strip.top >= transport.bottom - 1 && actions.top >= strip.bottom - 1,
      pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
  });
};
// Broadcast Density Part 1 (CLAUDE.md, 2026-08-16) adds a REQUIRED live
// below-film lower-third — the brief's own words: "Add the information strip
// below the video." A fixed-height row below the stage necessarily takes some
// picture height from the stage's minmax(...,1fr) row; there is no amount of
// padding-trimming that makes a visible, legible strip cost zero pixels.
// These floors were re-measured on the accepted composition (chyron included,
// trimmed to its tightest legible padding) rather than silently lowered: the
// picture STILL materially exceeds the 1060x596 legacy baseline at 1440x900
// (was ~1112x596 pre-lower-third per S5a; now ~1121x631 with it) and still
// preserves a large 1080p/4K budget at 1920x1080 (~1441x811). Floors sit a
// small margin below the measured values so normal rendering variance can't
// flake this assertion; they must NOT be lowered further without the same
// kind of honest re-measurement and a documented reason.
const desktop = await geometryAt(1440, 900);
ok(desktop.picture[0] >= 1100 && desktop.picture[1] >= 615,
  '1440 theater materially exceeds the legacy working picture with the Broadcast Density lower-third included', JSON.stringify(desktop));
const wide = await geometryAt(1920, 1080);
ok(wide.picture[0] >= 1400 && wide.picture[1] >= 795,
  'Wide theater preserves a large ordinary pixel budget for 1080p and 4K film with the lower-third included', JSON.stringify(wide));
ok(desktop.contained && wide.contained,
  'Desktop theater keeps transport, strip, and play actions inside the working viewport', JSON.stringify({ desktop, wide }));
const tablet = await geometryAt(768, 1024);
if (shotDir) console.log('  QA    desktop geometry', JSON.stringify({ desktop, wide }));
await page.setViewport({ width: 1920, height: 1080 });
await page.click('[aria-label="Full screen"]');
await page.waitForFunction(() => (document.fullscreenElement || document.webkitFullscreenElement)?.matches?.('[data-native-player-surface]'));
state = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
  window.app.canvas._syncSize();
  const media = document.getElementById('videoContainer').getBoundingClientRect();
  const wrapper = document.getElementById('angleWrapper1').getBoundingClientRect();
  const canvas = document.getElementById('drawingCanvas');
  const drawing = canvas.getBoundingClientRect();
  resolve({
    target: (document.fullscreenElement || document.webkitFullscreenElement)?.matches?.('[data-native-player-surface]') || false,
    transportInside: !!(document.fullscreenElement || document.webkitFullscreenElement)?.querySelector?.('.gi-theater-transport'),
    transportVisible: document.querySelector('.gi-theater-transport').getBoundingClientRect().height > 0,
    media: [Math.round(media.width), Math.round(media.height)],
    canvasAligned: Math.abs(drawing.left - wrapper.left) <= 1
      && Math.abs(drawing.top - wrapper.top) <= 1
      && Math.abs(drawing.width - wrapper.width) <= 1
      && Math.abs(drawing.height - wrapper.height) <= 1,
    canvasPixels: [canvas.width, canvas.height],
    expectedPixels: [Math.round(wrapper.width * devicePixelRatio), Math.round(wrapper.height * devicePixelRatio)],
  });
})));
ok(state.target && state.transportInside && state.transportVisible && state.media[0] === 1920 && state.media[1] < 1080,
  'Full screen uses the complete player surface with visible transport and a viewport-width media stage', JSON.stringify(state));
ok(state.canvasAligned && state.canvasPixels.join('x') === state.expectedPixels.join('x'),
  'Drawing canvas stays pixel-aligned after native reparent and full screen', JSON.stringify(state));
state = await page.evaluate(() => {
  const theater = window.app.breakdownTheater;
  const originalPublish = theater._publish;
  let publishes = 0;
  theater._publish = () => { publishes++; };
  for (let index = 0; index < 20; index++) window.app.vc._emit('time-update', { time: index / 10 });
  const scrub = document.querySelector('.gi-theater-scrub');
  window.app.vc.videoElement.currentTime = 7;
  Object.defineProperty(window.app.vc.videoElement, 'duration', { configurable: true, value: 10 });
  window.app.vc._emit('time-update', { time: 7 });
  const transportLive = scrub.value === '0.7' && document.querySelectorAll('.gi-theater-time')[0].textContent === '0:07';
  const canvas = document.getElementById('drawingCanvas');
  const dormant = canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'hidden';
  window.app._selectTool('line');
  const armed = !canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'visible';
  window.app._selectTool(null);
  const disarmed = canvas.classList.contains('is-dormant') && getComputedStyle(canvas).visibility === 'hidden';
  theater._publish = originalPublish;
  return { publishes, transportLive, dormant, armed, disarmed };
});
ok(state.publishes === 0 && state.transportLive,
  'Fullscreen playback ticks update the visible transport without re-rendering the play strip', JSON.stringify(state));
ok(state.dormant && state.armed && state.disarmed,
  'Transparent drawing canvas leaves fullscreen composition until a drawing tool needs it', JSON.stringify(state));
await page.evaluate(() => (document.exitFullscreen || document.webkitExitFullscreen)?.call(document));
await page.waitForFunction(() => !(document.fullscreenElement || document.webkitFullscreenElement));
const mobile = await geometryAt(390, 844);
ok(!desktop.pageOverflow && !wide.pageOverflow && !tablet.pageOverflow && !mobile.pageOverflow,
  'Theater has zero page-level horizontal overflow at all release widths', JSON.stringify({ desktop, wide, tablet, mobile }));
state = await page.evaluate(() => {
  const hits = [...document.querySelectorAll('.gi-breakdown-theater button')].map(node => ({ label: node.getAttribute('aria-label') || node.textContent.trim(), height: node.getBoundingClientRect().height }));
  return { minHit: Math.min(...hits.map(item => item.height)), short: hits.filter(item => item.height < 44),
    internal: document.querySelector('[data-drive-scroll]').scrollWidth > document.querySelector('[data-drive-scroll]').clientWidth };
});
ok(state.minHit >= 44 && state.internal, 'Mobile controls meet touch targets and the strip remains swipeable', JSON.stringify(state));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'breakdown-theater-390.png') });

console.log('\n== 4. Exact restore leaves current route ownership untouched ==');
state = await page.evaluate(() => {
  const media = document.getElementById('videoContainer');
  const original = window.app.breakdownTheater._home.parent;
  const before = JSON.stringify(window.app.storage.seasonStore.data);
  const restored = window.app.breakdownTheater.restore();
  return { restored, mediaHome: media.parentElement === original,
    nativeGone: !document.querySelector('[data-native-breakdown-theater]'),
    dataSame: before === JSON.stringify(window.app.storage.seasonStore.data),
    legacyRemounted: window.app.breakdownVideo._mounted
      && !!document.querySelector('.breakdown-player-controls, .breakdown-play-strip') };
});
ok(state.restored && state.mediaHome && state.nativeGone && !state.legacyRemounted,
  'Restore returns media without reviving the retired legacy presentation', JSON.stringify(state));
ok(state.dataSame, 'The complete native theater journey does not rewrite season payloads');
// ===================== S7-d2: the permanent media foundation ==============
//
// The one canonical media subtree now lives in #giMediaHost on BODY, not inside
// #app. It is adopted into the route while mounted and parked back in the
// permanent host on restore, so S7-d8 cannot take film with the legacy shell.
console.log('\n== S7-d2: media has a permanent home outside the legacy shell ==');
const d2 = await page.evaluate(async () => {
  const app = window.app;
  const media = document.getElementById('videoContainer');
  const host = document.getElementById('giMediaHost');
  const theater = app.breakdownTheater;
  const mountedIn = media?.closest('#app') ? 'app' : (media?.closest('#giMediaHost') ? 'host' : 'route');
  // Park it: restore must return the media to the PERMANENT host, never to #app.
  const restored = theater.restore();
  const parked = document.getElementById('videoContainer');
  const out = {
    hostExists: !!host,
    hostOutsideApp: !!host && !host.closest('#app'),
    mountedIn,
    restored,
    parkedInHost: !!parked?.closest('#giMediaHost'),
    parkedInApp: !!parked?.closest('#app'),
    // The theater's captured home must BE the permanent host, not legacy markup.
    homeOutsideApp: !!theater._home?.parent && !theater._home.parent.closest('#app'),
    // Every piece of the media foundation travelled together.
    pieces: ['videoPlayer', 'drawingCanvas', 'angleWrapper2', 'videoPlayer2',
             'btnPlayPause', 'scrubBar', 'timelineBar', 'playSelect']
      .filter(id => !!document.getElementById(id)?.closest('#giMediaHost, .gi-theater-media-slot')),
  };
  await app.workspaceShell.show('breakdown');
  await new Promise(r => setTimeout(r, 400));
  out.remountedOutsideApp = !document.getElementById('videoContainer')?.closest('#app');
  return out;
});
ok(d2.hostExists && d2.hostOutsideApp,
  'A permanent media host exists on body, outside the legacy shell', JSON.stringify(d2));
ok(d2.parkedInHost && !d2.parkedInApp && d2.homeOutsideApp,
  'Restoring the theater parks the media in the permanent host, never back inside #app', JSON.stringify(d2));
ok(d2.pieces.length === 8,
  'Video, canvas, multi-angle, transport, scrub/timeline and play controls all moved together', JSON.stringify(d2));
ok(d2.remountedOutsideApp,
  'Re-entering Break Down re-adopts the media without reaching into the legacy shell', JSON.stringify(d2));

// VideoController kept the film name in #fileLabel.textContent and read it back
// on an error. That top-bar label is entombed today and deleted at S7-d7, so the
// name now lives on the controller and the label is an optional mirror.
//
// LIMIT, stated rather than implied: this removes the label after boot, which is
// evidence of decoupling, NOT deletion authority. S7-d7 must re-prove it cold.
const d2b = await page.evaluate(() => {
  const vc = window.app.vc;
  const label = document.getElementById('fileLabel');
  const badge = document.getElementById('folderLoadBadge');
  const zone = document.getElementById('videoDropZone');
  [label, badge, zone].forEach(el => el?.remove());
  vc.fileLabel = document.getElementById('fileLabel');
  vc.folderLoadBadge = document.getElementById('folderLoadBadge');
  let threw = null;
  try {
    vc.loadUrl('asset://localhost/x.mp4', 'Week 3 vs Alpha.mp4');
    vc._showFolderBadge([{ name: 'a.mp4' }, { name: 'b.mp4' }]);
  } catch (e) { threw = String(e); }
  return { threw, remembered: vc.currentFileName, labelGone: !document.getElementById('fileLabel') };
});
ok(d2b.threw === null && d2b.labelGone && d2b.remembered === 'Week 3 vs Alpha.mp4',
  'Film loading survives the top-bar label and folder badge being gone, and the film name has a real owner', JSON.stringify(d2b));

ok(errors.length === 0, 'Native S5a journey has zero page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
