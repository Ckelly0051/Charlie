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

   Original mutation evidence is recorded with the corresponding repair.
   Sections 6-8 cover the independently reproduced e3930fb findings. */
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
  // RailSeasonRow (2026-08-31 second review repair) -- a purpose-built
  // compact row, not the reused Team Hub SeasonRow markup; check for its
  // own real content instead (a year heading, plus a row whose label and
  // count are non-empty, not just present).
  railYearLabel: document.querySelector('.rail-year-label')?.textContent || '',
  railRowText: document.querySelector('.rail-row strong')?.textContent || '',
  railRowCount: document.querySelector('.rail-row small')?.textContent || '',
  railLibraryLink: !!document.querySelector('.rail-library-link'),
  railTools: [...document.querySelectorAll('.rail-tools button')].map(b => b.textContent.trim()),
}));
ok(r.rail && /Seasons/.test(r.railHeading) && /^\d{4}$/.test(r.railYearLabel) &&
   r.railRowText.trim().length > 0 && /game/.test(r.railRowCount) && r.railLibraryLink,
  'The persistent season rail renders real, year-grouped season content, not a placeholder', JSON.stringify(r));
ok(r.railTools.includes('Roster') && r.railTools.includes('Film & storage') && r.railTools.includes('Manage program'),
  'The rail exposes season-scoped tools directly, not only via a link out', JSON.stringify(r));

r = { saved:await page.evaluate(() => {
  const saved = window.app.teamRegistry.saveTeamLogo('data:image/png;base64,AAAA');
  window.app.homeScreen.refreshIdentity();
  return saved;
}) };
await page.waitForFunction(() => document.querySelector('.ws-home-logo') && document.querySelector('.rail-logo'));
Object.assign(r, await page.evaluate(() => ({
  head:document.querySelector('.ws-home-logo')?.getAttribute('src'),
  rail:document.querySelector('.rail-logo')?.getAttribute('src'),
})));
await page.evaluate(() => { window.app.teamRegistry.removeTeamLogo(); window.app.homeScreen.refreshIdentity(); });
ok(r.saved && r.head === 'data:image/png;base64,AAAA' && r.rail === r.head,
  'A team-owned logo appears in both populated Home identity surfaces', JSON.stringify(r));

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

console.log('\n== 1b. Real Team Hub controllers accept the school/nickname/year+level forms ==');
// setupTeamAndDemo() above already exercised createFirstTeam() through the
// real .gi-hub-first form -- confirm the team it produced actually carries
// the typed identity (not a rejected/defaulted one), then drive a REAL
// year+level season creation through the actual CreateSeasonForm, not the
// sample-season shortcut (which bypasses createSeason() entirely).
r = await page.evaluate(() => {
  const registry = window.app.teamRegistry;
  const active = registry.teams().find(t => t.id === registry.activeTeamId());
  return { school: active?.school, teamName: active?.teamName };
});
ok(r.school === 'St. Joseph Mavericks' && r.teamName === 'St. Joseph Mavericks',
  'The real first-team form produced a team with the typed school identity intact', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-native-team-hub]');
await page.evaluate(() => {
  const button = [...document.querySelectorAll('.gi-hub-hero-action, .gi-hub-primary')].find(b => /new season/i.test(b.textContent));
  button?.click();
});
await page.waitForSelector('.gi-hub-dialog-form input[name="year"]');
// Clear the way a coach does -- select-all + Backspace through the real
// keyboard -- not by assigning `.value`, which changes the DOM without firing
// an input event and lets a re-render swallow the next keystroke. That race
// was dropping a character (observed `202` for a typed `2027`), so the season
// name never matched and the wait below timed out. Assert the field holds the
// complete value BEFORE submitting, so silent input loss fails here with the
// actual value rather than as an opaque timeout.
// The overlay service moves the dialog's initial focus on a DEFERRED frame.
// Typing before that lands sends the first character to the field and every
// character after it to whatever the service focuses next -- observed as a
// year of "2" with document.activeElement on a BUTTON. Instantaneous test
// typing used to beat that frame, which is why this raced intermittently
// rather than failing outright. Wait for focus to settle inside the dialog
// first, then take the field deliberately, then assert the whole value landed
// so silent input loss reports the actual value instead of a bare timeout.
await page.waitForFunction(() => {
  const form = document.querySelector('.gi-hub-dialog-form');
  return form && form.contains(document.activeElement);
}, { timeout: 5000 });
await page.click('.gi-hub-dialog-form input[name="year"]');
await page.keyboard.down('Control');
await page.keyboard.press('KeyA');
await page.keyboard.up('Control');
await page.type('.gi-hub-dialog-form input[name="year"]', '2027', { delay: 20 });
await page.waitForFunction(() => document.querySelector('.gi-hub-dialog-form input[name="year"]')?.value === '2027', { timeout: 5000 })
  .catch(async () => {
    const got = await page.evaluate(() => document.querySelector('.gi-hub-dialog-form input[name="year"]')?.value);
    throw new Error(`year field lost input: expected "2027", got "${got}"`);
  });
await page.click('.gi-hub-dialog-form .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent() && window.app.storage.seasonStore.data.seasonName === '2027 · St. Joseph Mavericks · Varsity', { timeout: 15000 });
r = await page.evaluate(() => ({ seasonName: window.app.storage.seasonStore.data.seasonName, kind: window.app.storage.seasonStore.data.kind }));
ok(r.seasonName === '2027 · St. Joseph Mavericks · Varsity' && r.kind === 'program',
  'A real Year + Level season submission (no free-text name field) is accepted and creates a real program season', JSON.stringify(r));

console.log('\n== 2. Settings save does not corrupt team identity ==');
page.evaluate(() => window.app.settingsScreen.open({ initialTab: 'team' })); // stays open; do not await its close promise
await page.waitForSelector('[data-settings-panel="team"] .gi-settings-primary');
await page.click('[data-settings-panel="team"] .gi-settings-primary');
await page.waitForFunction(() => document.querySelector('[data-settings-panel="team"] .gi-settings-saved'), { timeout: 10000 });
r = await page.evaluate(() => window.app.teamRegistry.teamProfile());
ok(r.teamName === 'St. Joseph Mavericks' && r.school === 'St. Joseph Mavericks' && (r.jerseyColor || '') !== '' || r.nickname === '',
  'Saving Settings with no field changes does not rewrite the composed team name or clear the jersey color', JSON.stringify(r));
ok(!/undefined/.test(r.teamName || '') && r.teamName !== `${r.school} ${r.jerseyColor}`,
  'The jersey color never leaks into the composed team name (the exact corruption reproduced by the review)', JSON.stringify(r));
await page.evaluate(() => window.app.settingsScreen.close?.());

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

console.log('\n== 4b. Relinking a game invalidates its DISPLAYED thumbnail through the real Preact component ==');
// The manual-request unit tests above (section 3) prove the SERVICE and the
// per-game generation counter are correct when two requests ARE issued. This
// proves the PRODUCTION path actually issues the second request at all --
// the real defect: Thumbnail's own effect bailed out on any cached URL,
// regardless of whether it matched the game's CURRENT film source, so a
// relink never triggered a second request in the first place.
r = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore, h = app.homeScreen;
  const calls = [];
  app.gameThumbnails.request = async game => {
    calls.push(game.filmDir || '');
    return game.filmDir === 'new-folder' ? 'data:image/svg+xml;base64,NEW' : 'data:image/svg+xml;base64,OLD';
  };
  const example = structuredClone(store.data.games[0]);
  example.filmMode = 'linked'; example.filmDir = 'old-folder';
  const data = structuredClone(store.data);
  data.games = [example];
  data.activeGameId = example.id;
  await store.adopt(data);
  await app.workspaceShell.show('home');
  // Wait for the FIRST (old-folder) frame to resolve and paint.
  await new Promise(resolve => {
    const check = () => { if (h.thumbnailFor(example.id) === 'data:image/svg+xml;base64,OLD') resolve(); else setTimeout(check, 20); };
    check();
  });
  const afterFirst = { calls: calls.slice(), displayed: h.thumbnailFor(example.id) };
  // Relink: the SAME game id, a DIFFERENT film source.
  const relinked = structuredClone(store.data);
  relinked.games[0].filmDir = 'new-folder';
  await store.adopt(relinked);
  await app.workspaceShell.show('home');
  await new Promise(resolve => {
    const check = () => { if (h.thumbnailFor(example.id) === 'data:image/svg+xml;base64,NEW') resolve(); else if (calls.length > 4) resolve(); else setTimeout(check, 20); };
    check();
  });
  return { afterFirst, calls, finalDisplayed: h.thumbnailFor(example.id) };
});
ok(r.calls.filter(c => c === 'new-folder').length > 0,
  'Relinking a game (same id, new filmDir) issues a NEW thumbnail request instead of silently trusting the cached one', JSON.stringify(r));
ok(r.finalDisplayed === 'data:image/svg+xml;base64,NEW',
  'The displayed thumbnail updates to the relinked source rather than retaining the pre-relink frame', JSON.stringify(r));

console.log('\n== 6. Root and first-file changes refresh mounted thumbnails ==');
r = await page.evaluate(async () => {
  const app = window.app, h = app.homeScreen, game = h.selectedGame();
  const backend = app.storage.seasonStore.backend, service = app.gameThumbnails;
  const methods = ['supportsFilm', 'supportsLinkedFilm', 'linkedGameDir', 'listLinkedFilm', 'linkedFilmUrl'];
  const saved = Object.fromEntries(methods.map(key => [key, backend[key]]));
  const capture = service._capture, request = service.request;
  const original = { filmMode: game.filmMode, filmDir: game.filmDir };
  const calls = [];
  let root = 'C:/original', first = 'first.mp4';
  const frame = path => 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7#' + path;
  const waitForFrame = async path => {
    const until = Date.now() + 3000;
    while (Date.now() < until) {
      const img = document.querySelector('.detail-pane .thumbnail img, .ws-game-row .thumbnail img');
      if (h.thumbnailFor(game.id) === frame(path) && img?.getAttribute('src') === frame(path)) return true;
      await new Promise(resolve => setTimeout(resolve, 20));
    }
    return false;
  };
  try {
    // Restore the real service after earlier request-count fixtures. Only the
    // filesystem and video-decode boundaries are substituted here.
    service.request = Object.getPrototypeOf(service).request;
    backend.supportsFilm = backend.supportsLinkedFilm = () => true;
    backend.linkedGameDir = async dir => `${root}/${dir}`;
    backend.listLinkedFilm = async () => [{ path: first }];
    backend.linkedFilmUrl = async path => path;
    service._capture = async path => { calls.push(path); return frame(path); };
    game.filmMode = 'linked'; game.filmDir = 'Week1';
    h.refreshFilm();
    const initial = await waitForFrame('C:/original/Week1/first.mp4');
    root = 'D:/replacement';
    h.refreshFilm();
    const rootChanged = await waitForFrame('D:/replacement/Week1/first.mp4');
    first = 'replacement.mp4';
    await app.workspaceShell.show('home');
    const fileChanged = await waitForFrame('D:/replacement/Week1/replacement.mp4');
    const before = calls.length;
    h.refreshFilm();
    const unchanged = await waitForFrame('D:/replacement/Week1/replacement.mp4');
    return { initial, rootChanged, fileChanged, cached: unchanged && calls.length === before, calls };
  } finally {
    Object.assign(backend, saved); Object.assign(game, original);
    service._capture = capture; service.request = request;
  }
});
ok(r.initial && r.rootChanged, 'Changing library root refreshes the displayed frame without changing filmDir', JSON.stringify(r));
ok(r.fileChanged, 'Replacing the first clip refreshes the displayed frame without changing filmDir', JSON.stringify(r));
ok(r.cached, 'Unchanged resolved film reuses its decoded frame on refresh', JSON.stringify(r));

console.log('\n== 7. Full-width desktop composition ==');
for (const width of [1920, 1440, 1280]) {
  await page.setViewport({ width, height: 900 });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  r = await page.evaluate(() => {
    const rail = document.querySelector('.rail-year').getBoundingClientRect();
    const content = document.querySelector('.home-content').getBoundingClientRect();
    const tools = document.querySelector('.rail-tools').getBoundingClientRect();
    // The rail now carries TWO permanent trees (Program Seasons + Opponent
    // Scouts), so "the last year group" is no longer the last thing above
    // the tools -- an empty Opponent Scouts section legitimately sits
    // between them. Anchor to the lowest real content inside the trees
    // instead, which measures the same guarantee (no dead space before the
    // tools) against the current structure at the same 80px threshold.
    const content_els = [...document.querySelectorAll('.rail-trees .rail-group, .rail-trees .rail-empty')];
    const last = content_els.length ? Math.max(...content_els.map(el => el.getBoundingClientRect().bottom)) : null;
    return { left: rail.left, right: content.right, width: innerWidth,
      overflow: document.documentElement.scrollWidth - innerWidth,
      sections: document.querySelectorAll('.rail-section').length,
      toolGap: last !== null ? tools.top - last : null };
  });
  ok(r.left < 2 && r.right > width - 2 && r.overflow <= 1 && r.sections === 2 && r.toolGap !== null && r.toolGap < 80,
    `Home uses the available ${width}px workspace without outer gutters or horizontal overflow`, JSON.stringify(r));
}

console.log('\n== 8. Season duplicate checks serialize real writes ==');
r = await page.evaluate(async () => {
  const app = window.app, hub = app.teamHubScreen;
  const program = await Promise.all([hub.createSeason({ year: '2031', level: 'JV' }), hub.createSeason({ year: '2031', level: 'JV' })]);
  const programRows = (await app.storage.listSeasons()).filter(s => s.year === '2031' && s.level === 'JV');
  const values = { opponent: 'Central', year: '2032', level: 'Varsity', sourceTeamA: 'Central', sourceTeamB: 'Holy Family' };
  const scout = [await hub.createScout(values), await hub.createScout({ ...values, opponent: ' central ' })];
  const different = await hub.createScout({ ...values, opponent: 'Riverside', sourceTeamA: 'Riverside' });
  const concurrent = await Promise.all([hub.createScout({ ...values, year: '2033' }), hub.createScout({ ...values, year: '2033' })]);
  const scoutRows = (await app.storage.listSeasons()).filter(s => s.year === '2033' && s.kind === 'scout');
  return { program, programCount: programRows.length, scout, different, concurrent, scoutCount: scoutRows.length };
});
ok(r.program.filter(x => x.ok).length === 1 && r.programCount === 1 && r.program.some(x => x.duplicateId),
  'Concurrent Program creates produce exactly one season and one duplicate refusal', JSON.stringify(r));
ok(r.scout[0].ok && !r.scout[1].ok && r.scout[1].duplicateId && r.different.ok,
  'Scout duplicate checks read canonical opponent metadata, normalize case/space, and allow another opponent', JSON.stringify(r));
ok(r.concurrent.filter(x => x.ok).length === 1 && r.scoutCount === 1 && r.concurrent.some(x => x.duplicateId),
  'Concurrent Scout creates also produce exactly one season', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join('\n'));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
