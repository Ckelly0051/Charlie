/* S4-c native New/Edit Game journey. Pins one owner, one durable write, and
   complete fail-closed rollback across create/edit/race paths. */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.gameScreen && document.querySelector('[data-native-team-hub]'));

const fixture = await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Native Game', team: 'Mavericks', year: '2026' });
  const store = window.app.storage.seasonStore;
  const game = store.activeGame();
  game.gameInfo = { ...(game.gameInfo || {}), week: '1', opponent: 'Alpha', date: '2026-08-20', perspective: 'offense' };
  game.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', formation: 'Ace', playType: 'Run Inside', result: 'Gain', yardage: '4', players: {}, grades: {}, custom: [] } }];
  await store.persist();
  await window.app.storage._loadActiveGame({ renderGames: false });
  return { firstId: game.id };
});

const beforeCancel = await page.evaluate(() => { window.app.storage.commitActive(); return JSON.stringify(window.app.storage.seasonStore.data); });
await page.evaluate(() => { void window.app.gameScreen.open({ mode: 'create' }); });
await page.waitForSelector('[data-overlay-id="game-details"] [data-native-game-form]');
await page.waitForFunction(() => document.activeElement?.name === 'week');
let r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-overlay-id="game-details"] [data-native-game-form]').length,
  legacy: !!document.getElementById('gameModal'), focused: document.activeElement?.name,
  date: document.querySelector('[data-native-game-form] [name="date"]')?.value,
}));
ok(r.native === 1 && !r.legacy, 'New Game has one native owner and no legacy modal', JSON.stringify(r));
ok(r.focused === 'week' && /^\d{4}-\d{2}-\d{2}$/.test(r.date), 'New Game opens with deterministic focus and today as the default date', JSON.stringify(r));
await page.click('[data-overlay-id="game-details"] [data-overlay-scrim]');
ok(await page.evaluate(() => !!document.querySelector('[data-overlay-id="game-details"]')), 'Game form cannot be discarded by an accidental scrim click');
await page.click('[data-native-game-form] .gi-game-actions button:not(.is-danger)[type="button"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]'));
const afterCancel = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
ok(beforeCancel === afterCancel, 'Canceling New Game preserves the complete season byte-for-byte');

await page.evaluate(() => {
  const store = window.app.storage.seasonStore;
  window.__nativeGamePersist = store.persist.bind(store);
  window.__nativeGamePersistCalls = 0;
  store.persist = async () => { window.__nativeGamePersistCalls++; return window.__nativeGamePersist(); };
  void window.app.gameScreen.open({ mode: 'create' });
});
await page.waitForSelector('[data-native-game-form]');
await page.type('[data-native-game-form] [name="week"]', '2');
await page.type('[data-native-game-form] [name="opponent"]', 'Bravo Bears');
await page.$eval('[data-native-game-form] [name="date"]', el => { el.value = '2026-08-27'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.select('[data-native-game-form] [name="homeAway"]', 'away');
await page.select('[data-native-game-form] [name="gameType"]', 'game');
await page.select('[data-native-game-form] [name="perspective"]', 'scout');
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]') && !window.app.gameScreen.handle);
r = await page.evaluate(async firstId => {
  const store = window.app.storage.seasonStore, active = store.activeGame();
  const durable = await store.backend.loadSeason();
  return { calls: window.__nativeGamePersistCalls, games: store.data.games.length,
    activeId: active.id, firstIntact: JSON.stringify(store.data.games.find(g => g.id === firstId).plays),
    info: active.gameInfo, durableInfo: durable.games.find(g => g.id === active.id)?.gameInfo,
    perspective: document.getElementById('gamePerspective')?.value, defaultUnit: window.app.tagger.defaultUnit,
    dialogClosed: !document.querySelector('[data-overlay-id="game-details"]') && !window.app.gameScreen.handle,
    headerButton: document.getElementById('btnEditGame')?.tagName === 'BUTTON',
    headerSummary: document.getElementById('gameHeaderSummary')?.textContent || '',
    shellContext: document.getElementById('wsContextGame')?.textContent || '' };
}, fixture.firstId);
ok(r.calls === 1 && r.games === 2, 'Create game performs one durable write and adds exactly one game', JSON.stringify(r));
ok(r.dialogClosed, 'Game settings closes after a successful create', JSON.stringify(r));
ok(r.info.opponent === 'Bravo Bears' && r.info.date === '2026-08-27' && r.info.homeAway === 'away' && r.info.perspective === 'scout', 'Create stores the complete football context', JSON.stringify(r.info));
ok(JSON.stringify(r.info) === JSON.stringify(r.durableInfo), 'Created game context survives canonical backend reload', JSON.stringify(r));
ok(r.perspective === 'scout' && r.defaultUnit === 'offense' && /Ace/.test(r.firstIntact), 'Create syncs scout context without mutating prior-game film tags', JSON.stringify(r));
ok(r.headerButton && /Bravo Bears/.test(r.headerSummary) && /Bravo Bears/.test(r.shellContext), 'Game header remains an edit launcher and reflects the created game', JSON.stringify(r));

await page.evaluate(() => { void window.app.gameScreen.open({ mode: 'edit' }); });
await page.waitForSelector('[data-native-game-form]');
await page.waitForFunction(() => document.activeElement?.name === 'opponent');
r = await page.evaluate(() => ({ opponent: document.querySelector('[name="opponent"]')?.value, focused: document.activeElement?.name }));
ok(r.opponent === 'Bravo Bears' && r.focused === 'opponent', 'Edit Game opens pre-filled with the active game and opponent focus', JSON.stringify(r));
const beforeEditCancel = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
await page.$eval('[data-native-game-form] [name="opponent"]', el => { el.value = 'Discard Me'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.click('[data-native-game-form] .gi-game-actions button:not(.is-danger)[type="button"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]'));
ok(beforeEditCancel === await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data)), 'Canceling Edit Game writes nothing');

// Active-game race: a dialog opened for Bravo may never save into Alpha.
await page.evaluate(() => { void window.app.gameScreen.open({ mode: 'edit' }); });
await page.waitForSelector('[data-native-game-form]');
await page.$eval('[data-native-game-form] [name="opponent"]', el => { el.value = 'Wrong Owner'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.evaluate(firstId => window.app.storage.seasonStore.setActive(firstId), fixture.firstId);
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForSelector('[data-native-game-form] .gi-game-error');
r = await page.evaluate(() => ({ error: document.querySelector('.gi-game-error')?.textContent, activeOpp: window.app.storage.seasonStore.activeGame()?.gameInfo?.opponent,
  wrong: window.app.storage.seasonStore.data.games.some(g => g.gameInfo?.opponent === 'Wrong Owner') }));
ok(/open game changed/i.test(r.error) && r.activeOpp === 'Alpha' && !r.wrong, 'A game switch while Edit is open fails closed without cross-game writes', JSON.stringify(r));
await page.click('[data-native-game-form] .gi-game-actions button:not(.is-danger)[type="button"]');

// Canonical save failure: memory and live editor both return to the snapshot.
await page.evaluate(async () => {
  await window.app.storage.switchToGame(window.app.storage.seasonStore.data.games[1].id, { persist: false });
  const store = window.app.storage.seasonStore;
  window.__failedSaveBefore = JSON.stringify(store.data);
  window.__failedSaveInfo = JSON.stringify(window.app.storage.gameInfo);
  store.persist = async () => false;
  void window.app.gameScreen.open({ mode: 'edit' });
});
await page.waitForSelector('[data-native-game-form]');
await page.$eval('[data-native-game-form] [name="opponent"]', el => { el.value = 'Cannot Persist'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForSelector('[data-native-game-form] .gi-game-error');
r = await page.evaluate(() => { const season = JSON.stringify(window.app.storage.seasonStore.data), info = JSON.stringify(window.app.storage.gameInfo); return { season, before: window.__failedSaveBefore, info, beforeInfo: window.__failedSaveInfo, seasonSame: season === window.__failedSaveBefore, infoSame: info === window.__failedSaveInfo, message: document.querySelector('.gi-game-error')?.textContent }; });
ok(r.seasonSame && r.infoSame && /prior season is unchanged/i.test(r.message), 'Failed canonical save restores the complete season and live game context', JSON.stringify(r));
await page.setViewport({ width: 390, height: 844 });
r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  small: [...document.querySelectorAll('[data-native-game-form] button, [data-native-game-form] input, [data-native-game-form] select')]
    .filter(el => el.getClientRects().length && el.getBoundingClientRect().height < 44).map(el => el.name || el.textContent.trim()) }));
ok(!r.overflow && !r.small.length, 'Mobile Game settings has no page overflow and keeps every control touchable', JSON.stringify(r));
await page.evaluate(() => window.app.gameScreen.handle?.close('cancel'));
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]') && !window.app.gameScreen.handle);
await page.evaluate(() => { window.app.storage.seasonStore.persist = window.__nativeGamePersist; });

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
