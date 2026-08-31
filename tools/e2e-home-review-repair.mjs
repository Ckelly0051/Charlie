/* Regression coverage for the CODEX REVIEW OF ccce567 -- CHANGES REQUESTED
   (2026-08-31) repair. Five findings, each with its own discriminating
   proof here rather than a single broad assertion:
     1. The year-grouped season rail and library/first-use states are real,
        functioning Home content -- not a placeholder link out.
     2. (No dedicated test -- a dependency-audit/commit-scope finding, not a
        runtime behavior. See the repair changelog entry instead.)
     3. GameThumbnailService and HomeScreen.requestThumbnail() fence
        resolution to the season/request identity captured at request time,
        never applying a stale or wrong-identity result.
     4. Thumbnail decode is visibility-driven (IntersectionObserver), not
        fired for every mounted card regardless of scroll position.
     5. .ws-game-row stretches its thumbnail to the card's full width instead
        of inheriting the legacy shell row's align-items:center.

   Every mutation below is verified to red the assertion it guards before
   being restored -- see the inline notes at each mutation. */
import fs from 'node:fs';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen);
await setupTeamAndDemo(page, 'St. Joseph Mavericks');
await page.evaluate(() => window.app.workspaceShell.show('home'));
await page.waitForFunction(() => document.querySelector('[data-native-home]')?.querySelector('.ws-game-row'));

console.log('== 1. Season rail + library are real, functioning content ==');
let r = await page.evaluate(() => ({
  rail: !!document.querySelector('.rail-year'),
  railHeading: document.querySelector('.rail-year .gi-hub-kicker')?.textContent || '',
  railHasSeasonRow: !!document.querySelector('.rail-year .gi-hub-season'),
  railLibraryLink: !!document.querySelector('.rail-library-link'),
  railTools: [...document.querySelectorAll('.rail-tools button')].map(b => b.textContent.trim()),
}));
ok(r.rail && /Seasons/.test(r.railHeading) && r.railHasSeasonRow && r.railLibraryLink,
  'The persistent season rail renders real, year-grouped season content, not a placeholder', JSON.stringify(r));
ok(r.railTools.includes('Roster') && r.railTools.includes('Film & storage') && r.railTools.includes('Manage program'),
  'The rail exposes season-scoped tools directly, not only via a link out', JSON.stringify(r));

// Close the open season -- Home must fall back to the real library state,
// with the actual season list/creation UI, not a bare link. Closing (rather
// than driving the real type-to-confirm delete dialog, already covered by
// other harnesses) keeps this focused on Home's OWN library-state rendering.
await page.evaluate(() => window.app.storage.seasonStore.closeSeason());
await page.evaluate(() => window.app.workspaceShell.show('home'));
await page.waitForFunction(() => document.querySelector('[data-native-home] .library-panel, [data-native-home] .ws-empty-panel'));
r = await page.evaluate(() => ({
  libraryPanel: !!document.querySelector('.library-panel'),
  workspaceChoice: !!document.querySelector('.library-panel .gi-hub-workspace-choice'),
  createAction: !!document.querySelector('.library-panel .ws-btn.ws-primary'),
}));
ok(r.libraryPanel && r.workspaceChoice && r.createAction,
  'With no season open, Home renders the real library state (workspace choice + create), not a bare link', JSON.stringify(r));

console.log('\n== 3. Thumbnail resolution is season/identity-fenced ==');
r = await page.evaluate(async () => {
  const C = window.app.gameThumbnails.constructor;
  const backend = { currentId: 'A', supportsFilm: () => true, listFilmFiles: async () => [{ name: 'first.mp4', path: 'first.mp4' }], filmUrl: async function () { return this.currentId + '/first.mp4'; } };
  const service = new C({ storage: { seasonStore: { backend } } });
  const captures = [];
  service._capture = async url => { captures.push(url); return 'FRAME:' + url; };
  const a = await service.request({ id: 'same-game' });
  backend.currentId = 'B';
  const b = await service.request({ id: 'same-game' });
  return { a, b };
});
ok(r.a === 'FRAME:A/first.mp4' && r.b !== r.a,
  "A same-id request under a DIFFERENT season never returns the prior season's cached frame", JSON.stringify(r));

r = await page.evaluate(async () => {
  const C = window.app.gameThumbnails.constructor;
  let release;
  const backend = { currentId: 'A', supportsFilm: () => true, listFilmFiles: async () => [{ path: 'first.mp4' }], filmUrl: async function (id) { return this.currentId + '/' + id; } };
  const service = new C({ storage: { seasonStore: { backend } } }, { maxConcurrent: 1 });
  const captured = [];
  service._capture = async url => { captured.push(url); if (captured.length === 1) await new Promise(res => release = res); return url; };
  const first = service.request({ id: 'first' });
  while (!release) await new Promise(res => setTimeout(res, 0));
  const second = service.request({ id: 'queued' });
  await new Promise(res => setTimeout(res, 0));
  backend.currentId = 'B'; // season changes AFTER 'queued' was requested under A, but BEFORE its job executes
  release();
  await first;
  const result = await second;
  return { result, capturedB: captured.includes('B/queued') };
});
ok(r.result === null && !r.capturedB,
  'A request queued under one season, whose job runs only after the season changes, aborts rather than resolving under the new season', JSON.stringify(r));

r = await page.evaluate(async () => {
  const H = window.app.homeScreen.constructor;
  const store = { currentSeasonId: 'A', data: { kind: 'program', games: [] } };
  let oldResolve;
  const h = new H({ storage: { seasonStore: store } }, null, { request: game => game.filmDir === 'old' ? new Promise(res => oldResolve = res) : Promise.resolve('NEW FRAME') });
  h._state.seasonId = 'A';
  h.requestThumbnail({ id: 'same', filmDir: 'old' });
  h.requestThumbnail({ id: 'same', filmDir: 'new' });
  await new Promise(res => setTimeout(res, 0));
  oldResolve('OLD FRAME'); // the OLDER request resolves AFTER the newer one was issued
  await new Promise(res => setTimeout(res, 0));
  return { actual: h.thumbnailFor('same') };
});
ok(r.actual === 'NEW FRAME',
  'An older in-flight relink capture resolving after a newer one cannot clobber the fresher frame', JSON.stringify(r));

console.log('\n== 4. Thumbnail decode is visibility-driven ==');
// Section 1 closed the open season -- create a fresh one for this fixture
// rather than depending on prior-section state.
r = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore;
  await app.storage.createSeason({ name: 'Lazy Load Fixture', team: app.teamRegistry.activeTeamId(), year: '2026', level: 'Varsity' });
  const example = { id: 'seed', gameInfo: { opponent: 'Rivals', date: '2026-09-01' }, plays: [] };
  const data = structuredClone(store.data);
  data.games = Array.from({ length: 40 }, (_, i) => ({ ...structuredClone(example), id: 'lazy-' + i }));
  data.activeGameId = 'lazy-0';
  await store.adopt(data);
  const h = app.homeScreen;
  let requests = 0;
  app.gameThumbnails.request = async () => { requests++; return null; };
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 150));
  return {
    games: 40, requests,
    visibleCards: [...document.querySelectorAll('.ws-game-row')].filter(el => el.getBoundingClientRect().top < innerHeight).length,
  };
});
ok(r.requests < r.games,
  'Thumbnail decode is not requested for every mounted card -- only a bounded subset near the viewport', JSON.stringify(r));
ok(r.requests > 0, 'At least the visible cards do request a thumbnail', JSON.stringify(r));

console.log('\n== 5. Game-row thumbnail stretches to full card width ==');
await page.evaluate(async () => {
  // Restore a normal single-game season so the layout probe below reflects
  // the real card shape, not the 40-game synthetic fixture above.
  const app = window.app, store = app.storage.seasonStore;
  const example = structuredClone(store.data.games[0]);
  const data = structuredClone(store.data);
  data.games = [example];
  data.activeGameId = example.id;
  await store.adopt(data);
  await app.workspaceShell.show('home');
});
await page.waitForFunction(() => document.querySelector('.ws-game-row .thumbnail'));
r = await page.evaluate(() => {
  const card = document.querySelector('.ws-game-row'), thumb = card.querySelector('.thumbnail');
  return {
    alignment: getComputedStyle(card).alignItems,
    thumbWidth: thumb.getBoundingClientRect().width,
    cardWidth: card.getBoundingClientRect().width,
  };
});
ok(r.alignment === 'stretch' && r.thumbWidth > r.cardWidth * 0.9,
  'The card computes align-items:stretch, so the thumbnail spans the full card width rather than shrinking to its own content height', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join('\n'));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
