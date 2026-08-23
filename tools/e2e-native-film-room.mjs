import fs from 'node:fs';
import path from 'node:path';
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const shotDir = process.env.GIQ_S5B_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

console.log('\n== 1. Canonical ownership and parity ==');
const mounted = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'S5b Film Room', team: 'Mavericks', year: '2026' });
  const game = app.storage.seasonStore.activeGame();
  game.plays = Array.from({ length: 8 }, (_, index) => ({
    id: index + 1,
    timestamp: { start: index * 8, end: index * 8 + 6 },
    tags: {
      unit: index === 6 ? 'defense' : 'offense',
      down: String(index % 4 + 1), distance: index % 3 === 0 ? '10' : '4',
      formation: index === 0 ? 'Shotgun + Trips' : index % 2 ? 'Power-I' : 'Ace',
      qbAlignment: '', personnel: '11', runPass: index % 2 ? 'Run' : 'Pass',
      playType: index % 2 ? 'Run Outside' : 'Short Pass',
      result: index === 5 ? 'Touchdown' : 'Gain', yardage: String(index + 1),
      defFront: index === 6 ? '4-2-5' : '', coverage: index === 6 ? 'Cover 3' : '',
      players: {}, grades: {}, custom: [],
    },
    notes: '', analysis: null,
  }));
  app.tagger.plays = game.plays;
  app.tagger.nextId = 9;
  app.tagger._updatePlaySelect();
  app.tagger._updateTimeline();
  app.tagger._emit('plays-loaded');
  app.tagger.selectPlay(1);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const before = JSON.stringify(app.storage.seasonStore.data);
  const expected = app.playGrid._visiblePlays().map(play => play.id);
  // Final Engine Independence: #playGridSection is deleted from the document
  // entirely, not merely hidden -- app.playGrid.section is genuinely null and
  // there is no legacy DOM left to capture or compare against.
  const priorSectionAbsent = !app.playGrid.section;
  const host = document.createElement('div');
  host.id = 's5bTestHost';
  host.style.cssText = 'position:fixed;inset:0;z-index:99999;background:var(--gi-1)';
  document.body.appendChild(host);
  const didMount = app.nativeFilmRoom.mount(host);
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  return {
    didMount,
    native: document.querySelectorAll('[data-native-film-room]').length,
    sectionAbsent: !app.playGrid.section,
    priorSectionAbsent,
    before,
    after: JSON.stringify(app.storage.seasonStore.data),
    expected,
    actual: [...document.querySelectorAll('.gi-film-table-wrap tbody tr')].map(row => Number(row.querySelector('.is-play button').textContent.trim().replace(/^[ODS]/, ''))),
    subscribers: app.playGrid._nativeListeners.size,
  };
});
ok(mounted.didMount && mounted.native === 1 && mounted.priorSectionAbsent && mounted.sectionAbsent,
  'Native deck is the only Film Room presentation -- #playGridSection is absent from the document, not hidden', JSON.stringify(mounted));
ok(mounted.before === mounted.after, 'Mounting native Film Room is a season-data no-op');
ok(JSON.stringify(mounted.actual) === JSON.stringify(mounted.expected), 'Rendered play IDs exactly equal the canonical visible pool', JSON.stringify(mounted));
if (shotDir) await (await page.$('[data-native-film-room]')).screenshot({ path: path.join(shotDir, 'film-room-1440.png') });
let state = await page.evaluate(() => [...document.querySelectorAll('[data-cell][tabindex="0"]')].map(cell => cell.dataset.cell));
ok(JSON.stringify(state) === JSON.stringify(['1:sit']), 'Keyboard users receive one initial grid entry point', JSON.stringify(state));
await page.focus('[data-cell="1:sit"]');
ok(mounted.subscribers === 1, 'Native subscription is scoped to the mounted deck');

state = await page.evaluate(() => {
  const cell = document.querySelector('[data-cell="1:formation"]');
  return {
    text: cell?.textContent.trim(),
    expected: window.app.playGrid._plainCell(window.app.tagger.getPlay(1), window.app.playGrid._visibleCols().find(col => col.key === 'formation')),
    tendency: [...document.querySelectorAll('thead th')].find(th => th.querySelector('span')?.textContent === 'Formation')?.querySelector('small')?.textContent || '',
  };
});
ok(state.text === state.expected && state.text === 'Trips', 'Projected cell text equals the canonical Film Room value', JSON.stringify(state));
ok(!!state.tendency, 'Native header carries the canonical visible-pool tendency');

console.log('\n== 2. Filters, selection, and exact Watch pool ==');
await page.click('[data-filter="downs:3"]');
await page.click('[data-filter="rp:Pass"]');
state = await page.evaluate(() => ({
  actual: [...document.querySelectorAll('.gi-film-table-wrap tbody tr')].map(row => Number(row.querySelector('.is-play button').textContent.trim().replace(/^[ODS]/, ''))),
  expected: window.app.playGrid._visiblePlays().map(play => play.id),
  label: document.querySelector('.gi-film-room-head p')?.textContent,
  tabStops: [...document.querySelectorAll('[data-cell][tabindex="0"]')].map(cell => cell.dataset.cell),
}));
ok(JSON.stringify(state.actual) === JSON.stringify(state.expected) && state.actual.length > 0, 'Native filters use the canonical AND/OR matcher', JSON.stringify(state));
ok(state.tabStops.length === 1 && state.actual.some(id => state.tabStops[0].startsWith(id + ':')), 'Filtering cannot strand roving focus on a hidden row', JSON.stringify(state));
ok(state.label.includes('of 8 plays'), 'Filtered count is honest');

await page.click('input[aria-label^="Select play"]');
await page.evaluate(() => {
  window.app.cutupPlayer.start = (ids, label) => { window.__s5bWatch = { ids, label }; };
  Object.defineProperty(document.getElementById('videoPlayer'), 'src', { value: 'mock-film', configurable: true });
});
await page.click('[data-film-watch]');
state = await page.evaluate(() => ({
  call: window.__s5bWatch,
  expected: window.app.playGrid._watchPool(window.app.playGrid._visiblePlays()).map(play => play.id),
}));
ok(JSON.stringify(state.call?.ids) === JSON.stringify(state.expected), 'Watch receives exactly the canonical selected-and-visible IDs', JSON.stringify(state));

await page.evaluate(() => window.app.playGrid.nativeClearFilters());
await page.waitForFunction(() => document.querySelectorAll('.gi-film-table-wrap tbody tr').length === 8);
await page.click('[data-cell="1:formation"]');
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
await page.keyboard.press('ArrowDown');
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
await page.keyboard.press('ArrowDown');
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
state = await page.evaluate(() => ({ current: window.app.tagger.currentPlayId, focused: document.activeElement?.dataset?.cell }));
ok(state.current === 3 && state.focused === '3:formation', 'Vertical cell focus selects the same play the video follows', JSON.stringify(state));

console.log('\n== 3. Native inline edit and column preferences ==');
await page.click('[data-cell="3:formation"]');
await page.waitForSelector('.gi-film-cell-editor');
await page.evaluate(() => {
  const button = document.querySelector('.gi-film-option-chips button:not(.is-active)');
  window.__s5bEditChoice = button?.textContent.trim() || '';
  button?.click();
});
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
await page.evaluate(() => {
  [...document.querySelectorAll('.gi-film-cell-editor button')].find(item => item.textContent.trim() === 'Done')?.click();
});
await page.waitForFunction(() => !document.querySelector('.gi-film-cell-editor'));
await page.waitForFunction(() => document.querySelector('[data-cell="3:formation"]')?.textContent.includes(window.__s5bEditChoice));
state = await page.evaluate(() => ({
  value: window.app.tagger.getPlay(3).tags.formation,
  cell: document.querySelector('[data-cell="3:formation"]')?.textContent.trim(), choice: window.__s5bEditChoice,
}));
ok(state.choice && state.value.includes(state.choice) && state.cell.includes(state.choice), 'Native multi-select commit uses canonical grid edit semantics', JSON.stringify(state));

await page.click('[data-cell="3:sit"]');
await page.click('[data-cell="3:sit"]');
await page.waitForSelector('.gi-film-cell-editor');
await page.evaluate(() => {
  [...document.querySelectorAll('.gi-film-option-chips button')].find(item => item.textContent.trim() === '4')?.click();
  const input = document.querySelector('.gi-film-cell-editor input');
  input.value = '7';
  input.dispatchEvent(new Event('input', { bubbles: true }));
});
await page.evaluate(() => new Promise(resolve => requestAnimationFrame(resolve)));
await page.evaluate(() => [...document.querySelectorAll('.gi-film-cell-editor button')].find(item => item.textContent.trim() === 'Done')?.click());
await page.waitForFunction(() => !document.querySelector('.gi-film-cell-editor'));
await page.waitForFunction(() => document.querySelector('[data-cell="3:sit"]')?.textContent.includes('4th'));
state = await page.evaluate(() => ({
  down: window.app.tagger.getPlay(3).tags.down,
  distance: window.app.tagger.getPlay(3).tags.distance,
  cell: document.querySelector('[data-cell="3:sit"]')?.textContent.trim(),
}));
ok(state.down === '4' && state.distance === '7' && state.cell.includes('4th'), 'Native composite editor commits Down and Distance together', JSON.stringify(state));

await page.click('[data-film-columns]');
await page.waitForSelector('.gi-film-columns');
await page.evaluate(() => {
  const preset = [...document.querySelectorAll('.gi-film-presets button')].find(button => button.textContent.trim() === 'defense');
  preset?.click();
});
await page.waitForFunction(() => !!document.querySelector('[data-cell="1:defFront"]'));
state = await page.evaluate(() => ({
  cols: window.app.playGrid.cols,
  stored: JSON.parse(localStorage.getItem('ffa_film_room_cols')),
}));
ok(state.cols.includes('defFront') && JSON.stringify(state.cols) === JSON.stringify(state.stored), 'Native column preset persists through the canonical preference path', JSON.stringify(state));
await page.evaluate(() => window.app.overlays.dismissTop('done'));
await page.click('[data-cell="7:coverage"]');
await page.click('[data-cell="7:coverage"]');
await page.waitForSelector('.gi-film-cell-editor');
state = await page.evaluate(() => {
  const button = [...document.querySelectorAll('.gi-film-option-chips button')].find(item => item.textContent.trim() !== 'Cover 3');
  const choice = button?.textContent.trim() || '';
  button?.click();
  return { choice };
});
await page.waitForFunction(() => !document.querySelector('.gi-film-cell-editor'));
state.value = await page.evaluate(() => window.app.tagger.getPlay(7).tags.coverage);
ok(state.choice && state.value === state.choice, 'Native single-select editor commits immediately through canonical semantics', JSON.stringify(state));


console.log('\n== 4. Game replacement, responsive geometry, and exact restore ==');
await page.evaluate(() => {
  window.app.playGrid.nativeSetSelected(1, true);
  window.app.tagger.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', players: {}, grades: {}, custom: [] }, notes: '' }];
  window.app.tagger.currentPlayId = 1;
  window.app.tagger._emit('plays-loaded');
});
await page.waitForFunction(() => document.querySelectorAll('.gi-film-table-wrap tbody tr').length === 1);
state = await page.evaluate(() => ({
  selected: window.app.playGrid.selected.size,
  rows: document.querySelectorAll('.gi-film-table-wrap tbody tr').length,
  // Nothing lazily recreates #playGridSection as plays are wholesale-replaced.
  sectionAbsent: !window.app.playGrid.section,
}));
ok(state.selected === 0 && state.rows === 1, 'Wholesale game replacement clears stale row selection', JSON.stringify(state));
ok(state.sectionAbsent, 'A wholesale game replacement does not resurrect #playGridSection');

const geometry = {};
for (const viewport of [[1440,900],[1280,800],[768,1024],[390,844]]) {
  await page.setViewport({ width: viewport[0], height: viewport[1] });
  if (shotDir && viewport[0] === 390) await page.screenshot({ path: path.join(shotDir, 'film-room-390.png'), fullPage: false });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  geometry[viewport[0]] = await page.evaluate(() => ({
    pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    internal: document.querySelector('.gi-film-table-wrap').scrollWidth >= document.querySelector('.gi-film-table-wrap').clientWidth,
    short: [...document.querySelectorAll('.gi-film-room button')].filter(button => button.getBoundingClientRect().height < (matchMedia('(pointer:coarse)').matches ? 44 : 28)).length,
  }));
}
ok(Object.values(geometry).every(item => !item.pageOverflow && item.internal), 'All release widths keep table overflow internal', JSON.stringify(geometry));
ok(Object.values(geometry).every(item => item.short === 0), 'Native Film Room controls meet pointer-dependent hit targets', JSON.stringify(geometry));

await page.click('[data-film-columns]');
await page.waitForSelector('.gi-film-columns');
state = await page.evaluate(() => {
  const app = window.app;
  const before = JSON.stringify(app.storage.seasonStore.data);
  const overlaysBefore = app.overlays.snapshot().overlays.length;
  const restored = app.nativeFilmRoom.restore();
  return {
    restored,
    nativeGone: !document.querySelector('[data-native-film-room]'),
    sectionAbsent: !app.playGrid.section,
    subscribers: app.playGrid._nativeListeners.size,
    dataSame: before === JSON.stringify(app.storage.seasonStore.data),
    overlaysBefore,
    overlaysAfter: app.overlays.snapshot().overlays.length,
  };
});
ok(state.restored && state.nativeGone && state.subscribers === 0 && state.sectionAbsent,
  'Restore unmounts native presentation and its scoped subscription -- and does not resurrect #playGridSection', JSON.stringify(state));
ok(state.overlaysBefore === 1 && state.overlaysAfter === 0, 'Restore closes Film Room-owned overlays', JSON.stringify(state));
ok(state.dataSame, 'Restore is a season-data no-op');
ok(errors.length === 0, 'Native Film Room journey has zero page errors', errors.join(' | '));

await browser.close();
console.log('\n== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');
process.exit(fail ? 1 : 0);
