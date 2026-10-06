/* MARK AS FINAL LIVES IN GAME SETTINGS -----------------------------------------
   Code review 2026-10-06: the only way to mark a game Final was a button on the
   retired games panel, so new games could never count in the season record,
   and two messages pointed at a "season chip" that does not exist. Coach
   ruling 2026-10-06: Mark as Final goes in Game settings.

   Run after build:  node tools/e2e-game-final.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + JSON.stringify(extra) : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900 });
  await gotoApp(page, APP_URL);
  await page.evaluate(async () => {
    const app = window.app;
    await app.storage.createSeason({ name: 'Final Test', team: 'Final', year: '2026' });
    const store = app.storage.seasonStore;
    store.activeGame().gameInfo = { ...(store.activeGame().gameInfo || {}), opponent: 'Central', scoreUs: '21', scoreThem: '14' };
    app.storage._loadActiveGame({ renderGames: false });
    await store.persist();
  });

  const openSettings = () => page.evaluate(() => { window.app.gameScreen.open({ mode: 'edit' }); });
  await openSettings();
  await page.waitForSelector('[data-native-game-form]');
  const before = await page.evaluate(() => ({
    box: !!document.querySelector('[data-native-game-form] input[name="final"]'),
    status: window.app.storage.seasonStore.gameStatus(window.app.storage.seasonStore.activeGame()),
    record: window.app.homeScreen.seasonRecord().text,
  }));
  ok(before.box, 'Game settings offers Mark as Final', before);
  ok(before.status === 'active' && before.record === '—', 'fixture: the scored game is not yet Final and the record is empty', before);

  await page.click('[data-native-game-form] input[name="final"]');
  await page.click('[data-native-game-form] .gi-game-actions .is-primary');
  await page.waitForFunction(() => !document.querySelector('[data-native-game-form]'));
  const marked = await page.evaluate(async () => {
    const store = window.app.storage.seasonStore;
    const stored = await store.backend.loadSeason(store.currentSeasonId);
    return { status: store.gameStatus(store.activeGame()), stored: stored?.games?.find(g => g.id === store.data.activeGameId)?.status, record: window.app.homeScreen.seasonRecord().text };
  });
  ok(marked.status === 'final' && marked.stored === 'final', 'saving with Mark as Final checked stores the game as Final', marked);
  ok(marked.record === '1-0', 'the Final game counts in the season record', marked);

  await openSettings();
  await page.waitForSelector('[data-native-game-form]');
  const reopened = await page.evaluate(() => document.querySelector('[data-native-game-form] input[name="final"]')?.checked);
  ok(reopened === true, 'reopening Game settings shows the game as Final', reopened);
  await page.click('[data-native-game-form] input[name="final"]');
  await page.click('[data-native-game-form] .gi-game-actions .is-primary');
  await page.waitForFunction(() => !document.querySelector('[data-native-game-form]'));
  const cleared = await page.evaluate(() => ({ status: window.app.storage.seasonStore.gameStatus(window.app.storage.seasonStore.activeGame()), record: window.app.homeScreen.seasonRecord().text }));
  ok(cleared.status === 'active' && cleared.record === '—', 'unchecking it returns the game to not Final', cleared);

  const src = (await import('node:fs')).readFileSync(new URL('../js/app.js', import.meta.url), 'utf8');
  ok(!/season chip/.test(src) && (src.match(/Final in Game settings/g) || []).length === 2,
    'the score and last-play messages point to Game settings, not a season chip');
} finally { await browser.close(); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
