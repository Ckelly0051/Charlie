/* S4-e: the dead season modal is deleted; native Home/Reports retain the live
   season workflow and aggregate analytics without mutating canonical data. */
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
await page.waitForFunction(() => window.app?.workspaceShell?.root && document.querySelector('[data-native-team-hub]'));

const fixture = await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Native Season', team: 'Mavericks', year: '2026' });
  const store = window.app.storage.seasonStore;
  const first = store.activeGame();
  first.gameInfo = { ...(first.gameInfo || {}), opponent: 'Alpha', scoreUs: '14', scoreThem: '7', date: '2026-08-28' };
  first.plays = [
    { id: 1, timestamp: { start: 0, end: 4 }, notes: '', tags: { unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '6', players: {}, grades: {}, custom: [] } },
    { id: 2, timestamp: { start: 5, end: 9 }, notes: '', tags: { unit: 'offense', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '9', players: {}, grades: {}, custom: [] } },
  ];
  const second = store.addGame();
  second.gameInfo = { ...(second.gameInfo || {}), opponent: 'Bravo', scoreUs: '7', scoreThem: '21', date: '2026-09-04' };
  second.plays = [{ id: 3, timestamp: { start: 0, end: 5 }, notes: '', tags: { unit: 'offense', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '-2', players: {}, grades: {}, custom: [] } }];
  store.setActive(first.id);
  await store.persist();
  await window.app.storage._loadActiveGame({ renderGames: false });
  await window.app.workspaceShell.show('home');
  const before = JSON.stringify(store.data);
  window.app.tagger.plays = window.app.tagger.plays.map((play, index) => index
    ? play
    : { ...play, tags: { ...play.tags, yardage: '10' } });
  return { before, firstId: first.id, secondId: second.id };
});

let state = await page.evaluate(() => ({
  legacyIds: ['seasonOverlay','seasonNameInput','seasonGameList','seasonStatsBody','seasonRestorePanel'].filter(id => document.getElementById(id)),
  hasModel: typeof window.app.season?.reportModel === 'function',
  legacyStatsAbsent: typeof window.app.season?.statsHtml === 'undefined',
  deadMethods: ['show','hide','_renderAll','_renderGameList','_renderRestoreList'].filter(key => typeof window.app.season?.[key] === 'function'),
  homeGames: document.querySelectorAll('#wsGameList .ws-game-row').length,
}));
ok(!state.legacyIds.length && state.hasModel && state.legacyStatsAbsent && !state.deadMethods.length,
  'Season analytics remains live while the legacy modal owner and lifecycle are deleted', JSON.stringify(state));
ok(state.homeGames === 2, 'Home remains the single season game-entry surface', JSON.stringify(state));

await page.click('#btnNativeMore');
await page.waitForFunction(() => document.querySelector('[data-overlay-id] [role="menuitem"]'));
await page.evaluate(() => [...document.querySelectorAll('[data-overlay-id] [role="menuitem"]')]
  .find(button => button.textContent.trim().startsWith('Season report'))?.click());
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'reports' && document.querySelector('[data-native-reports]'));
state = await page.evaluate(() => ({
  route: window.app.workspace.currentRoute(),
  classicHidden: !document.getElementById('wsClassicOutlet'), // S7: outlet deleted; absence is the assertion
  legacy: !!document.getElementById('seasonOverlay'),
}));
ok(state.route === 'reports' && state.classicHidden && !state.legacy,
  'More opens the native Reports route without revealing or recreating the legacy modal', JSON.stringify(state));

await page.click('[data-report-tab="season"]');
await page.waitForFunction(() => document.querySelector('[data-native-main-report][data-pane="season"] .season-summary'));
state = await page.evaluate(() => ({
  // Reports redesign (item A): the season KPI rail is now the same .gi-hero/
  // .gi-kpi primitive the game-scope persistent rail uses (see
  // ReportsScreen._syncKpiRail), not the retired .ss-stat/.ss-num markup.
  summary: [...document.querySelectorAll('[data-pane="season"] .season-summary .gi-kpi')].map(card => ({
    value: card.querySelector('.gi-kpi-value')?.textContent.trim(),
    label: card.querySelector('.gi-kpi-label')?.textContent.trim(),
  })),
  subTabs: [...document.querySelectorAll('[data-pane="season"] .gi-subtab')].map(button => button.textContent.trim()),
  model: (() => { const model = window.app.season.reportModel(); return { yards: model.stats.rushing.yards + model.stats.passing.yards, refs: model.allPlays.map(play => window.app.stats.constructor._compositeRef(play)).filter(Boolean).sort() }; })(),
  data: JSON.stringify(window.app.storage.seasonStore.data),
}));
const metric = label => state.summary.find(item => item.label === label)?.value;
ok(metric('Games') === '2' && metric('Record') === '1-1'
  && metric('Points For / Against') === '21-28' && state.model.yards === 17,
  'Native Season report aggregates both games and includes an uncommitted live edit without writing it',
  JSON.stringify({ summary: state.summary, model: state.model }));
// H16 — the season view is now composed from the game report's block set, so
// its sections mirror the game tabs instead of a hand-maintained subset. The
// old assertion pinned four labels; this pins the seven AND the film contract
// that expanding the block set made load-bearing.
ok(state.subTabs.join('|') === 'Overview|Offense|Defense|Special Teams|Players|Self-Scout|Trends',
  'Native Season report retains every season analysis section', JSON.stringify(state.subTabs));
ok(state.model.refs.some(ref => ref.startsWith(fixture.firstId + '::'))
  && state.model.refs.some(ref => ref.startsWith(fixture.secondId + '::')),
  'Season model preserves cross-game composite film identity', JSON.stringify(state.model.refs));

// Approved broadcast-density chrome: Season owns its own aggregate header.
// Returning to Overview reveals the scorebug while the retired KPI rail stays hidden.
const railOnSeason = await page.evaluate(() => document.querySelector('[data-reports-rail]')?.hidden);
await page.click('[data-report-tab="overview"]');
await page.waitForFunction(() => !document.querySelector('[data-reports-scorebug]')?.hidden);
const overviewChrome = await page.evaluate(() => ({ railHidden: document.querySelector('[data-reports-rail]')?.hidden, scorebugVisible: !document.querySelector('[data-reports-scorebug]')?.hidden }));
ok(railOnSeason === true && overviewChrome.railHidden === true && overviewChrome.scorebugVisible,
  'Season hides game chrome; Overview restores the approved scorebug without reviving the retired KPI rail',
  JSON.stringify({ railOnSeason, overviewChrome }));
const diffAt = [...Array(Math.max(state.data.length, fixture.before.length)).keys()]
  .find(index => state.data[index] !== fixture.before[index]);
ok(state.data === fixture.before, 'Opening and reading season analytics leaves canonical season bytes unchanged',
  diffAt == null ? '' : `at ${diffAt}: before=${fixture.before.slice(Math.max(0, diffAt - 80), diffAt + 120)} after=${state.data.slice(Math.max(0, diffAt - 80), diffAt + 120)}`);

await page.setViewport({ width: 390, height: 844 });
state = await page.evaluate(() => ({
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  reportOverflow: document.querySelector('[data-native-reports]')?.scrollWidth > document.querySelector('[data-native-reports]')?.clientWidth,
}));
ok(!state.pageOverflow && !state.reportOverflow, 'Native Season report has no mobile page-level overflow', JSON.stringify(state));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
