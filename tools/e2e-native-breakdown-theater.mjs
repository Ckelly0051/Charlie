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
const desktop = await geometryAt(1440, 900);
ok(desktop.picture[0] >= 1200 && desktop.picture[1] >= 675,
  '1440 theater materially exceeds the measured 1060x596 legacy working picture', JSON.stringify(desktop));
const wide = await geometryAt(1920, 1080);
ok(wide.picture[0] >= 1500 && wide.picture[1] >= 840,
  'Wide theater preserves a large ordinary pixel budget for 1080p and 4K film', JSON.stringify(wide));
ok(desktop.contained && wide.contained,
  'Desktop theater keeps transport, strip, and play actions inside the working viewport', JSON.stringify({ desktop, wide }));
const tablet = await geometryAt(768, 1024);
if (shotDir) console.log('  QA    desktop geometry', JSON.stringify({ desktop, wide }));
await page.setViewport({ width: 1920, height: 1080 });
await page.click('[aria-label="Full screen"]');
await page.waitForFunction(() => (document.fullscreenElement || document.webkitFullscreenElement)?.id === 'videoContainer');
state = await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => {
  window.app.canvas._syncSize();
  const media = document.getElementById('videoContainer').getBoundingClientRect();
  const wrapper = document.getElementById('angleWrapper1').getBoundingClientRect();
  const canvas = document.getElementById('drawingCanvas');
  const drawing = canvas.getBoundingClientRect();
  resolve({
    target: (document.fullscreenElement || document.webkitFullscreenElement)?.id,
    media: [Math.round(media.width), Math.round(media.height)],
    canvasAligned: Math.abs(drawing.left - wrapper.left) <= 1
      && Math.abs(drawing.top - wrapper.top) <= 1
      && Math.abs(drawing.width - wrapper.width) <= 1
      && Math.abs(drawing.height - wrapper.height) <= 1,
    canvasPixels: [canvas.width, canvas.height],
    expectedPixels: [Math.round(wrapper.width * devicePixelRatio), Math.round(wrapper.height * devicePixelRatio)],
  });
})));
ok(state.target === 'videoContainer' && state.media[0] === 1920 && state.media[1] === 1080,
  'Full screen uses the canonical media node at the exact viewport pixel budget', JSON.stringify(state));
ok(state.canvasAligned && state.canvasPixels.join('x') === state.expectedPixels.join('x'),
  'Drawing canvas stays pixel-aligned after native reparent and full screen', JSON.stringify(state));
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
ok(state.restored && state.mediaHome && state.nativeGone && state.legacyRemounted,
  'Restore returns media and remounts the accepted route presentation exactly', JSON.stringify(state));
ok(state.dataSame, 'The complete native theater journey does not rewrite season payloads');
ok(errors.length === 0, 'Native S5a journey has zero page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
