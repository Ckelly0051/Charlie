import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (value, label, extra = '') => value
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.goto(URL, { waitUntil: 'networkidle0' });

await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026' });
  const game = window.app.storage.seasonStore.activeGame();
  game.name = 'Week 1 vs Riverside';
  game.plays = Array.from({ length: 18 }, (_, i) => ({
    id: i + 1,
    timestamp: { start: i * 7, end: i * 7 + 5 },
    tags: {
      unit: 'offense', down: String(i % 4 + 1), distance: String(i % 3 ? 7 : 12),
      formation: i % 2 ? 'Shotgun + Trips' : 'Flexbone',
      playType: i % 2 ? 'Deep Pass' : 'Run Outside + RPO',
      result: i === 4 ? 'Interception + Touchdown' : 'Gain', yardage: String(i + 1),
      players: {}, grades: {}, custom: [],
    },
  }));
  window.app.storage._loadActiveGame();
  await window.app.workspaceShell.show('breakdown');
});

let state = await page.evaluate(() => {
  const video = document.getElementById('videoContainer');
  const controls = document.querySelector('.breakdown-player-controls');
  const cards = [...document.querySelectorAll('.breakdown-play-card')];
  const vr = video.getBoundingClientRect(), cr = controls.getBoundingClientRect();
  return {
    dedicated: !document.querySelector('#wsBreakdown')?.hidden,
    noLegacyChrome: document.querySelectorAll('#wsBreakdown .top-bar, #wsBreakdown .settings-drawer, #wsBreakdown #statsDashboard').length === 0,
    controlsInsideVideo: controls.parentElement === video && cr.left >= vr.left && cr.right <= vr.right,
    cards: cards.length,
    fixedWidths: [...new Set(cards.map(card => Math.round(card.getBoundingClientRect().width)))],
    longText: cards[4]?.textContent,
    stripBeforeActions: document.querySelector('.breakdown-play-strip')?.nextElementSibling?.classList.contains('video-play-controls'),
    copyInActions: document.getElementById('btnCopyPrev')?.parentElement?.classList.contains('video-play-controls'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    oneUnitControl: document.querySelectorAll('#tagUnit').length,
    unitInHeader: !!document.querySelector('.bd-context-units #tagUnit'),
    context: document.querySelector('[data-bd-context].active')?.dataset.bdContext,
    subject: document.getElementById('bdChartSubject')?.textContent,
    progress: document.getElementById('bdTagProgress')?.textContent,
    gridHidden: document.getElementById('playGridSection')?.hidden,
    libraryLinks: document.querySelectorAll('[data-edit-library]').length,
    customize: !!document.querySelector('[data-bd-customize]'),
    gameAction: !!document.querySelector('[data-bd-game]'),
    gameHeaderHidden: getComputedStyle(document.getElementById('btnEditGame')).display === 'none',
    canonicalProgressHidden: getComputedStyle(document.querySelector('#tagForm > .tag-progress-row')).display === 'none',
    templatesCollapsed: !!document.querySelector('.bdv-template-tools:not([open]) #templateSelect'),
    sidebarHidden: getComputedStyle(document.querySelector('.ws-sidebar')).display === 'none',
    topNavVisible: getComputedStyle(document.querySelector('.ws-top-nav')).display === 'flex',
    mediaWidth: Math.round(document.querySelector('.bd-media-column').getBoundingClientRect().width),
    autoplayToggle: !!document.querySelector('.video-play-controls #autoplayNextToggle:checked'),
  };
});
ok(state.controlsInsideVideo, 'Real playback controls are contained inside the video surface', JSON.stringify(state));
ok(state.dedicated && state.noLegacyChrome, 'Video and tagger live in the dedicated route without legacy app chrome', JSON.stringify(state));
ok(state.cards === 18 && state.fixedWidths.length === 1, 'Live plays render as stable fixed-width cards', JSON.stringify(state));
ok(/Interception \+ Touchdown: \+5/.test(state.longText), 'Long result copy remains complete and uses the approved colon separator', state.longText);
ok(state.stripBeforeActions && state.copyInActions, 'Play strip and existing production actions use the approved order');
ok(!state.overflow, 'Desktop Break Down has no page-level horizontal overflow');
ok(state.oneUnitControl === 1 && state.unitInHeader, 'Charting header owns the one canonical unit control', JSON.stringify(state));
ok(state.context === 'self' && state.subject === 'Our offense', 'Self-scout context opens with honest offense wording', JSON.stringify(state));
ok(state.progress === '18 / 18 tagged', 'Charting header projects canonical tagging progress', state.progress);
ok(state.gridHidden, 'Chart mode keeps the full Film Room spreadsheet intentionally out of the video workflow');
ok(state.libraryLinks === 3 && state.customize, 'Formation, Backfield, Front, and header expose one shared library editor', JSON.stringify(state));
ok(state.gameAction && state.gameHeaderHidden && state.canonicalProgressHidden && state.templatesCollapsed,
  'Game setup, duplicate progress, and templates no longer precede the charting groups', JSON.stringify(state));
ok(state.sidebarHidden && state.topNavVisible && state.mediaWidth >= 900,
  'Desktop route gives the approved width to film with compact top navigation', JSON.stringify(state));
ok(state.autoplayToggle, 'Video action bar exposes Autoplay next with the backward-compatible ON default');

state = await page.evaluate(() => {
  const canvas = window.app.canvas;
  const ctx = canvas.ctx;
  const originalClear = ctx.clearRect.bind(ctx);
  let clears = 0;
  ctx.clearRect = (...args) => { clears++; return originalClear(...args); };
  canvas.annotations = [];
  canvas._hasVisiblePlaybackAnnotations = false;
  const emptyRendered = canvas.renderPlaybackFrame();
  canvas.annotations = [{ timestamp: window.app.vc.currentTime, tool: 'line', color: '#fff', lineWidth: 2,
    start: { x: 0, y: 0 }, end: { x: 0.1, y: 0.1 } }];
  const visibleRendered = canvas.renderPlaybackFrame();
  canvas.annotations[0].timestamp = window.app.vc.currentTime + 10;
  const exitRendered = canvas.renderPlaybackFrame();
  const settledRendered = canvas.renderPlaybackFrame();
  ctx.clearRect = originalClear;
  canvas.annotations = [];
  return { emptyRendered, visibleRendered, exitRendered, settledRendered, clears };
});
ok(!state.emptyRendered && state.visibleRendered && state.exitRendered && !state.settledRendered && state.clears === 2,
  'Playback canvas paints only when entering or leaving an annotated frame', JSON.stringify(state));

state = await page.evaluate(() => {
  const storage = window.app.storage;
  const originalSnapshot = storage.seasonStore.snapshot;
  const originalPaused = Object.getOwnPropertyDescriptor(storage.vc, 'paused');
  const originalLastSnapAt = storage._lastSnapAt;
  const originalDeferred = storage._deferredSnapshot;
  let paused = false, snapshots = 0, label = '';
  Object.defineProperty(storage.vc, 'paused', { configurable: true, get: () => paused });
  storage.seasonStore.snapshot = async value => { snapshots++; label = value; return {}; };
  storage._lastSnapAt = 0;
  storage._deferredSnapshot = null;
  storage._maybeSnapshot(false, 'Playback-safe auto');
  const duringPlayback = { snapshots, pending: storage._deferredSnapshot?.label };
  paused = true;
  const flushed = storage._flushDeferredSnapshot();
  const afterPause = { snapshots, label, pending: storage._deferredSnapshot };
  paused = false;
  storage._lastSnapAt = 0;
  storage._maybeSnapshot(false, 'Superseded auto');
  storage._maybeSnapshot(true, 'Manual safety point');
  const afterForced = { snapshots, label, pending: storage._deferredSnapshot };
  storage._lastSnapAt = 0;
  storage._maybeSnapshot(false, 'Old-season auto');
  storage._deferredSnapshot.seasonId = 'not-the-active-season';
  paused = true;
  const crossSeasonFlushed = storage._flushDeferredSnapshot();
  const afterCrossSeason = { snapshots, pending: storage._deferredSnapshot };
  storage.seasonStore.snapshot = originalSnapshot;
  storage._lastSnapAt = originalLastSnapAt;
  storage._deferredSnapshot = originalDeferred;
  if (originalPaused) Object.defineProperty(storage.vc, 'paused', originalPaused);
  else delete storage.vc.paused;
  return { duringPlayback, flushed, afterPause, afterForced, crossSeasonFlushed, afterCrossSeason };
});
ok(state.duringPlayback.snapshots === 0 && state.duringPlayback.pending === 'Playback-safe auto' && state.flushed &&
  state.afterPause.snapshots === 1 && state.afterPause.label === 'Playback-safe auto' && state.afterPause.pending === null,
  'Automatic restore points defer during playback and flush once at pause', JSON.stringify(state));
ok(state.afterForced.snapshots === 2 && state.afterForced.label === 'Manual safety point' && state.afterForced.pending === null,
  'A forced safety point remains immediate and supersedes a deferred automatic snapshot', JSON.stringify(state.afterForced));
ok(!state.crossSeasonFlushed && state.afterCrossSeason.snapshots === 2 && state.afterCrossSeason.pending === null,
  'A deferred restore point can never cross a season boundary', JSON.stringify(state.afterCrossSeason));

await page.$eval('[data-edit-library="formation"]', button => { button.scrollIntoView({ block: 'center' }); button.click(); });
state = await page.evaluate(() => ({ open: document.getElementById('tagLibraryDialog').open, tab: document.querySelector('#tagLibraryDialog [role="tab"][aria-selected="true"]')?.dataset.group }));
ok(state.open && state.tab === 'formation', 'Field-level Edit library opens the shared editor at the correct vocabulary', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.click('[data-bd-customize]');
ok(await page.$eval('#tagLibraryDialog', el => el.open), 'Header Customize fields opens the same team-scoped library editor');
await page.keyboard.press('Escape');

await page.click('.breakdown-play-card[data-play-id="9"]');
state = await page.evaluate(() => ({
  selected: window.app.tagger.currentPlayId,
  active: document.querySelector('.breakdown-play-card.active')?.dataset.playId,
}));
ok(state.selected === 9 && state.active === '9', 'Selecting a play card drives the real PlayTagger and active state', JSON.stringify(state));

state = await page.evaluate(() => {
  const before = document.querySelector('.breakdown-play-card[data-play-id="9"]');
  const play = window.app.tagger.getPlay(9);
  play.tags.result = 'Touchdown';
  play.tags.yardage = '6';
  window.app.tagger._emit('play-updated', play);
  const after = document.querySelector('.breakdown-play-card[data-play-id="9"]');
  return { sameNode: before === after, text: after.textContent };
});
ok(state.sameNode && /Touchdown: \+6/.test(state.text), 'Ordinary tag edits update one stable play card instead of rebuilding the strip', JSON.stringify(state));

const drag = await page.evaluate(() => {
  const handle = document.querySelector('.breakdown-player-drag');
  const video = document.getElementById('videoContainer').getBoundingClientRect();
  const box = handle.getBoundingClientRect();
  return { x: box.left + box.width / 2, y: box.top + box.height / 2, bottom: video.bottom - 14 };
});
await page.mouse.move(drag.x, drag.y);
await page.mouse.down();
await page.mouse.move(drag.x, drag.bottom, { steps: 4 });
await page.mouse.up();

const beforeFilmRoom = await page.evaluate(() => ({ id: window.app.tagger.currentPlayId, play: JSON.stringify(window.app.tagger.getCurrentPlay()) }));
await page.click('[data-bd-view="film-room"]');
await new Promise(resolve => setTimeout(resolve, 100));
state = await page.evaluate(() => ({
  visible: !document.getElementById('playGridSection').hidden,
  mode: document.getElementById('wsBreakdown').classList.contains('bd-film-room-mode'),
  id: window.app.tagger.currentPlayId,
  play: JSON.stringify(window.app.tagger.getCurrentPlay()),
  rows: document.querySelectorAll('#playGridSection .play-grid-row, #playGridSection tbody tr').length,
  controlsBottom: document.querySelector('.breakdown-player-controls').getBoundingClientRect().bottom,
  videoBottom: document.getElementById('videoContainer').getBoundingClientRect().bottom,
}));
ok(state.visible && state.mode && state.id === beforeFilmRoom.id && state.play === beforeFilmRoom.play,
  'Film Room mode preserves play selection and canonical tags', JSON.stringify(state));
ok(state.controlsBottom <= state.videoBottom - 10, 'Moved video controls reclamp inside the film after Film Room resizes it', JSON.stringify(state));
await page.click('[data-bd-view="chart"]');
ok(await page.$eval('#playGridSection', el => el.hidden), 'Chart mode returns in one action without discarding Film Room state');

await page.click('[data-bd-context="scout"]');
await page.click('#tagUnit .pick[data-value="defense"]');
await new Promise(resolve => setTimeout(resolve, 40));
state = await page.evaluate(() => ({
  perspective: document.getElementById('gamePerspective').value,
  scoutClass: document.getElementById('tagForm').classList.contains('is-scout'),
  subject: document.getElementById('bdChartSubject').textContent,
  context: document.querySelector('[data-bd-context].active')?.dataset.bdContext,
}));
ok(state.perspective === 'scout' && state.scoutClass && state.context === 'scout' && state.subject === 'Opponent defense',
  'Opponent scout remains distinct from the selected charting unit', JSON.stringify(state));

await page.click('#tagUnit .pick[data-value="special"]');
await new Promise(resolve => setTimeout(resolve, 40));
state = await page.evaluate(() => document.getElementById('bdChartSubject').textContent);
ok(state === 'Opponent Special Teams', 'Special Teams scout wording is correctly capitalized', state);

await page.click('[data-bd-context="self"]');
state = await page.evaluate(() => ({
  perspective: document.getElementById('gamePerspective').value,
  scoutClass: document.getElementById('tagForm').classList.contains('is-scout'),
  subject: document.getElementById('bdChartSubject').textContent,
}));
ok(state.perspective === 'special' && !state.scoutClass && state.subject === 'Our Special Teams',
  'Returning to self-scout preserves the selected unit through canonical perspective state', JSON.stringify(state));

await page.click('[data-bd-context="quick"]');
state = await page.evaluate(() => ({
  active: window.app.quickChart.isActive,
  context: document.querySelector('[data-bd-context].active')?.dataset.bdContext,
}));
ok(state.active && state.context === 'quick', 'Quick Chart selector invokes the existing production mode', JSON.stringify(state));
await page.click('[data-bd-context="self"]');

await page.evaluate(() => window.app._renderSaveState('pending'));
state = await page.evaluate(() => ({
  text: document.getElementById('bdSaveState').textContent,
  pending: document.getElementById('bdSaveState').classList.contains('is-pending'),
}));
ok(state.text === 'Saving...' && state.pending, 'Charting header projects canonical autosave state', JSON.stringify(state));
await page.evaluate(() => window.app._renderSaveState('saved'));

const labels = {};
for (const context of ['self', 'scout']) {
  await page.click(`[data-bd-context="${context}"]`);
  for (const unit of ['offense', 'defense', 'special']) {
    await page.click(`#tagUnit .pick[data-value="${unit}"]`);
    await new Promise(resolve => setTimeout(resolve, 20));
    labels[`${context}:${unit}`] = await page.$eval('#bdChartSubject', el => el.textContent);
  }
}
ok(JSON.stringify(labels) === JSON.stringify({
  'self:offense': 'Our offense', 'self:defense': 'Our defense', 'self:special': 'Our Special Teams',
  'scout:offense': 'Opponent offense', 'scout:defense': 'Opponent defense', 'scout:special': 'Opponent Special Teams',
}), 'Every film-context and unit combination uses subject-correct wording', JSON.stringify(labels));
await page.click('[data-bd-context="self"]');
await page.click('#tagUnit .pick[data-value="offense"]');

const out = process.env.FFA_BREAKDOWN_SCREENSHOTS;
if (out) {
  await mkdir(out, { recursive: true });
  await page.screenshot({ path: `${out}/breakdown-1440x900.png`, fullPage: false });
  await page.click('[data-bd-view="film-room"]');
  await page.screenshot({ path: `${out}/film-room-1440x900.png`, fullPage: false });
  await page.click('[data-bd-view="chart"]');
  await page.setViewport({ width: 1280, height: 720 });
  await page.screenshot({ path: `${out}/breakdown-1280x720.png`, fullPage: false });
  await page.setViewport({ width: 768, height: 1024 });
  await page.screenshot({ path: `${out}/breakdown-768x1024.png`, fullPage: false });
}

await page.setViewport({ width: 390, height: 844 });
state = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  cardWidth: Math.round(document.querySelector('.breakdown-play-card').getBoundingClientRect().width),
  stripScrolls: document.querySelector('.breakdown-play-track').scrollWidth > document.querySelector('.breakdown-play-track').clientWidth,
  touchHeight: Math.round(document.querySelector('.breakdown-play-card').getBoundingClientRect().height),
  mobileNav: getComputedStyle(document.querySelector('.ws-mobile-nav')).display,
  legacyNav: getComputedStyle(document.querySelector('.bottom-tabs')).display,
  routeSelect: !!document.querySelector('#wsMobileRoute'),
  situationY: Math.round(document.querySelector('[data-bdv-group="situation"]').getBoundingClientRect().top),
  templateY: Math.round(document.querySelector('.bdv-template-tools').getBoundingClientRect().top),
}));
ok(!state.overflow && state.stripScrolls, 'Mobile uses contained horizontal play scrolling without page overflow', JSON.stringify(state));
ok(state.cardWidth === 174 && state.touchHeight >= 61, 'Mobile cards retain readable, touchable geometry', JSON.stringify(state));
ok(state.mobileNav === 'grid' && state.legacyNav === 'none' && !state.routeSelect,
  'Mobile exposes one workspace navigation model', JSON.stringify(state));
ok(state.situationY < state.templateY, 'Mobile charting reaches Situation before secondary template tools', JSON.stringify(state));
if (out) await page.screenshot({ path: `${out}/breakdown-390x844.png`, fullPage: false });

ok(errors.length === 0, 'No page errors', errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
