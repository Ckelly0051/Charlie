import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

/* S5d Break Down ownership lifecycle.
 * The route owns one native theater and one native deck. Legacy presentation
 * remains only as an off-screen behavior adapter until S7.
 */
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await new Promise(resolve => setTimeout(resolve, 500));

console.log('\n== 1. One native route owns the accepted S5 surfaces ==');
let state = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'S5d Route', team: 'Mavericks', year: '2026' });
  const game = app.storage.seasonStore.activeGame();
  game.plays = [
    { id: 1, timestamp: { start: 0, end: 6 }, tags: { unit: 'offense', down: '1', distance: '10', formation: 'I-Form', backfield: 'I', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', players: {}, grades: {}, custom: [] }, notes: '', analysis: null },
    { id: 2, timestamp: { start: 8, end: 14 }, tags: { unit: 'defense', down: '2', distance: '4', formation: 'Trips', qbAlignment: 'Shotgun', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', players: {}, grades: {}, custom: [] }, notes: '', analysis: null },
    { id: 3, timestamp: { start: 16, end: 22 }, tags: { unit: 'offense', down: '3', distance: '2', formation: 'Split Back', backfield: 'Split', runPass: 'Run', playType: 'Run Outside', result: 'Touchdown', yardage: '12', players: {}, grades: {}, custom: [] }, notes: '', analysis: null },
  ];
  app.tagger.plays = game.plays;
  app.tagger.nextId = 4;
  app.tagger._updatePlaySelect();
  app.tagger._updateTimeline();
  app.tagger._emit('plays-loaded');
  app.tagger.selectPlay(1);
  const before = JSON.stringify(app.storage.seasonStore.data);
  const media = document.getElementById('videoContainer');
  media.__s5dIdentity = true;
  await app.workspaceShell.show('breakdown');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    before,
    nativeRoute: document.querySelectorAll('[data-native-breakdown-route]').length,
    theater: document.querySelectorAll('[data-native-breakdown-theater]').length,
    tagging: document.querySelectorAll('[data-native-tagging]').length,
    filmRoom: document.querySelectorAll('[data-native-film-room]').length,
    mediaOwner: document.querySelectorAll('[data-breakdown-theater-host] #videoContainer').length,
    legacyVideo: document.querySelectorAll('.breakdown-player-controls, .breakdown-play-strip').length,
    legacyTagVisible: app.nativeTagging.source.offsetParent !== null,
    classicVisible: document.getElementById('wsClassicOutlet').hidden === false,
    dataSame: before === JSON.stringify(app.storage.seasonStore.data),
  };
});
ok(state.nativeRoute === 1 && state.theater === 1 && state.tagging === 1 && state.filmRoom === 1,
  'Route composes exactly one theater, tag form, and Film Room owner', JSON.stringify(state));
ok(state.mediaOwner === 1 && state.legacyVideo === 0 && !state.legacyTagVisible && !state.classicVisible,
  'Canonical media is native and legacy presentation is not coach-visible', JSON.stringify(state));
ok(state.dataSame, 'Ownership flip is a season-data no-op');

console.log('\n== 2. Chart and Film Room share one play identity ==');
state = await page.evaluate(() => ({
  chartVisible: !document.querySelector('[data-breakdown-tagging-host]').hidden,
  filmHidden: document.querySelector('[data-breakdown-film-room-host]').hidden,
  play: window.app.tagger.currentPlayId,
  tagPlay: window.app.nativeTagging.snapshot().currentPlayId,
}));
ok(state.chartVisible && state.filmHidden && state.play === 1 && state.tagPlay === 1,
  'Chart mode shows native tagging for the canonical selected play', JSON.stringify(state));
await page.click('[data-bd-view="film-room"]');
state = await page.evaluate(() => {
  const snap = window.app.nativeFilmRoom.snapshot();
  return {
    chartHidden: document.querySelector('[data-breakdown-tagging-host]').hidden,
    filmVisible: !document.querySelector('[data-breakdown-film-room-host]').hidden,
    rowIds: snap.rows.map(row => row.id),
    displayed: document.querySelector('.gi-film-room-head p')?.textContent,
    mediaSame: document.getElementById('videoContainer').__s5dIdentity === true,
  };
});
ok(state.chartHidden && state.filmVisible && state.mediaSame,
  'Film Room replaces only the deck; the canonical video never remounts', JSON.stringify(state));
ok(JSON.stringify(state.rowIds) === '[1,2,3]' && state.displayed === '3 plays',
  'Displayed play total and row identities equal the source game', JSON.stringify(state));
await page.click('[data-filter="unit:offense"]');
await page.waitForFunction(() => document.querySelector('.gi-film-room-head p')?.textContent === '2 of 3 plays');
state = await page.evaluate(() => {
  const snap = window.app.nativeFilmRoom.snapshot();
  return { rowIds: snap.rows.map(row => row.id), count: snap.watchCount, displayed: document.querySelector('.gi-film-room-head p')?.textContent };
});
ok(JSON.stringify(state.rowIds) === '[1,3]' && state.count === 2 && state.displayed === '2 of 3 plays',
  'Film Room filter, displayed count, and Watch cohort resolve the exact same plays', JSON.stringify(state));

console.log('\n== 3. Shell teardown and remount keep one owner ==');
state = await page.evaluate(async () => {
  const app = window.app;
  const media = document.getElementById('videoContainer');
  const selected = app.tagger.currentPlayId;
  app.workspaceShell.disable();
  await new Promise(resolve => setTimeout(resolve, 100));
  const disabled = {
    native: document.querySelectorAll('[data-native-breakdown-route]').length,
    mediaHome: media.parentElement === app.breakdownTheater._home.parent,
    tagRestored: !app.nativeTagging.source.hasAttribute('data-native-tag-source'),
  };
  await app.workspaceShell.enable();
  await app.workspaceShell.show('breakdown');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    disabled,
    route: document.querySelectorAll('[data-native-breakdown-route]').length,
    theater: document.querySelectorAll('[data-native-breakdown-theater]').length,
    tagging: document.querySelectorAll('[data-native-tagging]').length,
    filmRoom: document.querySelectorAll('[data-native-film-room]').length,
    legacyVideo: document.querySelectorAll('.breakdown-player-controls, .breakdown-play-strip').length,
    mediaSame: document.getElementById('videoContainer') === media,
    selectedSame: app.tagger.currentPlayId === selected,
  };
});
ok(state.disabled.native === 0 && state.disabled.mediaHome && state.disabled.tagRestored,
  'Internal teardown restores every adopted source before removing the shell', JSON.stringify(state));
ok(state.route === 1 && state.theater === 1 && state.tagging === 1 && state.filmRoom === 1 && state.legacyVideo === 0,
  'Remount rebuilds exactly one native composition with no legacy duplicate', JSON.stringify(state));
ok(state.mediaSame && state.selectedSame, 'Remount preserves media DOM identity and selected play');

console.log('\n== 4. Route-integrated release viewports ==');
const shotDir = process.env.GIQ_S5D_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const sizes = [[1440,900],[1280,720],[768,1024],[390,844]];
for (const [width,height] of sizes) {
  await page.setViewport({ width, height });
  await page.evaluate(() => window.app.breakdownWorkspace._setView('chart'));
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const geometry = await page.evaluate(() => {
    const route = document.querySelector('[data-native-breakdown-route]').getBoundingClientRect();
    const theater = document.querySelector('[data-breakdown-theater-host]').getBoundingClientRect();
    const media = document.getElementById('videoContainer').getBoundingClientRect();
    const deck = document.querySelector('[data-breakdown-tagging-host]').getBoundingClientRect();
    const toolbarButtons = [...document.querySelectorAll('.gi-breakdown-toolbar button')].map(button => button.getBoundingClientRect().height);
    return {
      route: [route.left, route.right, route.top, route.bottom],
      theater: [theater.left, theater.right, theater.top, theater.bottom],
      media: [media.left, media.right, media.top, media.bottom],
      deck: [deck.left, deck.right, deck.top, deck.bottom],
      overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      mediaContained: media.left >= theater.left - 1 && media.right <= theater.right + 1 && media.top >= theater.top - 1 && media.bottom <= theater.bottom + 1,
      minToolbarHit: Math.min(...toolbarButtons),
    };
  });
  ok(!geometry.overflow && geometry.mediaContained && geometry.media[1] > geometry.media[0],
    width + 'x' + height + ' keeps video visible, contained, and free of page overflow', JSON.stringify(geometry));
  if (width <= 620) ok(geometry.minToolbarHit >= 44,
    width + 'x' + height + ' keeps route controls touch-sized', JSON.stringify(geometry));
  if (shotDir) await page.screenshot({ path: path.join(shotDir, 'breakdown-' + width + 'x' + height + '.png'), fullPage: true });
}

ok(errors.length === 0, 'Native Break Down ownership journey has zero page errors', errors.join(' | '));
await browser.close();
console.log('\n== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');
process.exit(fail ? 1 : 0);
