/* Phase 1 shell/Home contract. The flag is opt-in; classic launch remains the
   default. This test drives the built bundle through real route adapters. */
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
const screenshotDir = process.env.FFA_SHELL_SCREENSHOTS || '';
const capture = async name => {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: false });
};
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));

let r = await page.evaluate(() => ({
  shell: !!document.querySelector('#workspaceShell'),
  active: document.body.classList.contains('ws-shell-active'),
  home: !document.querySelector('#wsHome')?.hidden,
  appInOutlet: document.querySelector('#wsClassicOutlet > #app')?.id === 'app',
  flag: localStorage.getItem('ffa_workspace_shell_v2'),
  breakdownDisabled: document.querySelector('[data-ws-route="breakdown"]')?.disabled,
  emptyAction: document.querySelector('#wsResume')?.textContent,
  emptyActionEnabled: !document.querySelector('#wsResume')?.disabled,
  emptyActionTarget: document.querySelector('#wsResume')?.dataset.wsAction,
}));
ok(r.shell && r.active && r.home && r.appInOutlet, 'Feature flag mounts shell and relocates the intact classic app', JSON.stringify(r));

// NO JS VALUES IN THE CHROME (coach smoke, 2026-07-25). Adding the Reports
// route without adding its nav icon rendered the literal string "undefined"
// into all three navs. Scan the shell's own chrome — nav buttons, context bar,
// headers — for values that mean "a variable escaped into the UI". Scoped to
// chrome deliberately: report BODIES can legitimately contain odd values from
// real data, but navigation and context never should.
// NOTE: uses its own variable — `r` is shared by the assertions that follow.
const chromeScan = await page.evaluate(() => {
  // NO \b AROUND `undefined`. Self-review 2026-07-25 mutation-tested this and
  // found the guard MISSED the very bug it was written for: the real leak
  // rendered as "undefinedReports" — the value concatenated straight against the
  // adjacent label, so there is no word boundary after "undefined" and \b failed
  // to match. A leaked value is almost always glued to neighbouring text, which
  // is exactly the case boundaries exclude. NaN/null keep boundaries (they are
  // short enough to appear inside real words); "undefined" and "[object Object]"
  // are distinctive enough to match bare.
  const bad = /undefined|\[object Object\]|\bNaN\b|\bnull\b/;
  const zones = ['.ws-sidebar', '.ws-topbar', '.ws-mobile-head', '.ws-mobile-nav', '.ws-home-head', '.ws-context'];
  const hits = [];
  zones.forEach(sel => document.querySelectorAll(sel).forEach(z => {
    const t = (z.textContent || '').replace(/\s+/g, ' ').trim();
    if (bad.test(t)) hits.push({ zone: sel, text: t.slice(0, 90) });
  }));
  return {
    hits,
    navLabels: [...document.querySelectorAll('.ws-sidebar [data-ws-route]')].map(b => (b.textContent || '').trim()),
    // The icon <span> specifically, so "has a REAL icon" can be checked rather
    // than merely "has no undefined" — the fallback glyph satisfies the latter.
    navIcons: [...document.querySelectorAll('.ws-sidebar [data-ws-route] span')].map(s => (s.textContent || '').trim()),
  };
});
ok(chromeScan.hits.length === 0, 'No JS value (undefined/NaN/null/[object Object]) leaks into shell chrome', JSON.stringify(chromeScan.hits));
// Mutation-verified in self-review: removing ONLY the reports icon leaves the
// '•' fallback, which the old version of this assertion happily accepted while
// claiming "renders a real icon". Every registered route must carry its own
// icon; the fallback exists to stop a JS value reaching the UI, not to be a
// silently acceptable resting state.
ok(chromeScan.navLabels.length >= 5 && chromeScan.navLabels.every(l => l && !/undefined/.test(l)),
  'Every shell nav button renders a label with no leaked value', JSON.stringify(chromeScan.navLabels));
ok(chromeScan.navIcons.length >= 5 && chromeScan.navIcons.every(i => i && i !== '•'),
  'Every shell route carries its OWN icon, not the missing-icon fallback', JSON.stringify(chromeScan.navIcons));
ok(r.flag === '1' && r.breakdownDisabled, 'Classic launch remains opt-in and guarded routes start disabled');
ok(r.emptyAction === 'Set up team' && r.emptyActionEnabled && r.emptyActionTarget === 'seasons',
  'Empty Home offers an enabled primary setup action instead of appearing dead', JSON.stringify(r));

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const g = app.storage.seasonStore.activeGame();
  g.name = 'Week 1 vs Rivals'; g.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  g.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', yardage: '5' } }];
  app.storage.seasonStore.data.games.push({
    id: 'preview-game', name: 'Week 2 vs Knights', status: 'final', nextId: 4,
    gameInfo: { opponent: 'Knights', date: '2026-09-08', scoreUs: 14, scoreThem: 7 },
    plays: [
      { id: 1, timestamp:{start:0,end:5}, tags:{unit:'offense',playType:'Run Outside',result:'Gain',yardage:'8'} },
      { id: 2, timestamp:{start:6,end:11}, tags:{unit:'defense',defFront:'4-3',coverage:'Cover 3'} },
      { id: 3, timestamp:{start:12,end:17}, tags:{unit:'special'} },
    ],
  });
  app.storage._loadActiveGame();
  await app.workspaceShell.show('home');
});
r = await page.evaluate(() => ({
  title: document.querySelector('#wsContinueTitle')?.textContent,
  season: document.querySelector('#wsContextSeason')?.textContent,
  resumeDisabled: document.querySelector('#wsResume')?.disabled,
  filmRows: document.querySelectorAll('.ws-film-row').length,
  filmStatus: document.querySelector('.ws-film-row span')?.textContent,
  filmDot: getComputedStyle(document.querySelector('.ws-film-row .ws-film-select > i')).backgroundColor,
  seasonCounts: document.querySelector('.ws-season-row.current span')?.textContent,
}));
ok(/Rivals/.test(r.title) && /2026 Varsity/.test(r.season) && !r.resumeDisabled, 'Home renders live season/game context and Resume command', JSON.stringify(r));
ok(r.filmRows === 2, 'Home renders every game in the active season', JSON.stringify(r));
ok(r.filmStatus && !/^(.*?) · \1$/.test(r.filmStatus), 'Film status does not repeat an empty-state label', r.filmStatus);
ok(r.filmDot !== 'rgb(54, 201, 121)', 'Empty film uses a neutral health indicator, not ready green', r.filmDot);
ok(r.seasonCounts === '2 games · 4 plays', 'Current season row uses live counts and correct grammar', r.seasonCounts);

await page.click('[data-ws-preview="preview-game"]');
r = await page.evaluate(() => ({
  activeGameId: window.app.storage.seasonStore.data.activeGameId,
  previewId: window.app.workspaceShell._homeSelectedGameId,
  title: document.querySelector('#wsContinueTitle')?.textContent,
  meta: document.querySelector('#wsContinueMeta')?.textContent,
  score: document.querySelector('#wsScoreValue')?.textContent,
  plays: document.querySelector('#wsPlaysValue')?.textContent,
  charted: document.querySelector('#wsChartedValue')?.textContent,
  units: document.querySelector('#wsUnitsValue')?.textContent,
  progress: document.querySelector('#wsProgressText')?.textContent,
  action: document.querySelector('#wsResume')?.textContent,
  actionGame: document.querySelector('#wsResume')?.dataset.wsGame,
  selected: document.querySelector('[data-film-id="preview-game"]')?.classList.contains('selected'),
  pressed: document.querySelector('[data-ws-preview="preview-game"]')?.getAttribute('aria-pressed'),
}));
ok(r.previewId === 'preview-game' && r.activeGameId !== 'preview-game' && r.selected && r.pressed === 'true',
  'Selecting a Home game previews it without opening or changing the active editor game', JSON.stringify(r));
ok(/Knights/.test(r.title) && /Sep/.test(r.meta) && /final/.test(r.meta) && r.score === '14–7',
  'Selected-game summary shows opponent, date, status, and score', JSON.stringify(r));
ok(r.plays === '3' && r.charted === '2 / 3' && r.units === 'O 1 · D 1 · ST 1' && r.progress === '2 of 3 charted',
  'Selected-game summary shows total, canonical charted count, unit mix, and progress', JSON.stringify(r));
ok(r.action === 'Open selected game' && r.actionGame === 'preview-game',
  'Opening the selected game remains a separate explicit command', JSON.stringify(r));
await capture('home-1280x800');
await page.setViewport({ width: 1440, height: 900 });
await capture('home-1440x900');
await page.setViewport({ width: 1280, height: 800 });

await page.click('.ws-sidebar [data-ws-route="breakdown"]');
r = await page.evaluate(() => ({
  dedicatedVisible: !document.querySelector('#wsBreakdown')?.hidden,
  classicHidden: document.querySelector('#wsClassicOutlet')?.hidden,
  homeHidden: document.querySelector('#wsHome')?.hidden,
  route: window.app.workspace.currentRoute(),
  videoOwners: document.querySelectorAll('#wsBreakdown #videoContainer').length,
  tagOwners: document.querySelectorAll('#wsBreakdown #tagForm').length,
  legacyChrome: document.querySelectorAll('#wsBreakdown .top-bar, #wsBreakdown .settings-drawer, #wsBreakdown #statsDashboard').length,
  sidebarDisplay: getComputedStyle(document.querySelector('.ws-sidebar')).display,
  topNavDisplay: getComputedStyle(document.querySelector('.ws-top-nav')).display,
  mediaWidth: Math.round(document.querySelector('.bd-media-column').getBoundingClientRect().width),
}));
ok(r.dedicatedVisible && r.classicHidden && r.homeHidden && r.route === 'breakdown', 'Break Down opens its dedicated production route', JSON.stringify(r));
ok(r.videoOwners === 1 && r.tagOwners === 1 && r.legacyChrome === 0, 'Dedicated route has one canonical video/tag owner and no legacy app chrome', JSON.stringify(r));
ok(r.sidebarDisplay === 'none' && r.topNavDisplay === 'flex' && r.mediaWidth >= 800, 'Desktop Break Down replaces the sidebar with compact navigation and restores film width', JSON.stringify(r));

r = await page.evaluate(() => ({
  settingsInShell: !!document.querySelector('.ws-global-tools #btnSidebarToggle'),
  moreInShell: !!document.querySelector('.ws-global-tools #btnMoreMenu'),
  settingsVisible: document.getElementById('btnSidebarToggle')?.offsetParent !== null,
  moreVisible: document.getElementById('btnMoreMenu')?.offsetParent !== null,
  drawerOutsideHiddenApp: document.getElementById('settingsDrawer')?.parentElement === document.body,
}));
ok(r.settingsInShell && r.moreInShell && r.settingsVisible && r.moreVisible && r.drawerOutsideHiddenApp,
  'Compact shell keeps canonical Settings and More controls visible and the drawer renderable', JSON.stringify(r));

await page.click('#btnSidebarToggle');
await new Promise(resolve => setTimeout(resolve, 320));
r = await page.evaluate(() => ({ drawerOpen: document.getElementById('settingsDrawer')?.classList.contains('open') }));
ok(r.drawerOpen, 'Shell Settings opens the canonical settings drawer', JSON.stringify(r));
await page.evaluate(() => document.getElementById('settingsDrawerClose')?.click());
await new Promise(resolve => setTimeout(resolve, 320));
await page.click('#btnMoreMenu');
r = await page.evaluate(() => ({ moreOpen: !document.getElementById('moreDropdown')?.classList.contains('hidden') }));
ok(r.moreOpen, 'Shell More opens the canonical action menu', JSON.stringify(r));
await page.click('#btnMoreMenu');

/* ENTOMBED-CAPABILITY GUARD. The classic top bar lives inside #app, which lives
   inside the permanently hidden #wsClassicOutlet. So a control the shell does
   not relocate is not "legacy chrome still showing" — it is a capability with
   NO reachable affordance anywhere in the product. Measured 2026-07-25: undo,
   redo, shortcuts and the CV-server badge were all in that state on every route.

   Reachability is measured as "its box actually lands inside the viewport", NOT
   `offsetParent !== null` or a non-zero rect: the settings drawer slides on a
   transform, so a CLOSED drawer still reports a laid-out, non-zero box and both
   weaker checks score its contents as reachable. That exact false positive is
   what an earlier draft of this test produced. */
const onScreen = sel => page.evaluate(s => [...document.querySelectorAll(s)].some(el => {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 0 || rect.height <= 0) return false;
  if (getComputedStyle(el).visibility === 'hidden') return false;
  for (let n = el; n && n !== document.body; n = n.parentElement) {
    if (n.hidden || getComputedStyle(n).display === 'none') return false;
  }
  return rect.right > 0 && rect.bottom > 0 && rect.left < window.innerWidth && rect.top < window.innerHeight;
}), sel);

r = {
  undo: await onScreen('#btnUndoAction'),
  redo: await onScreen('#btnRedoAction'),
  shortcuts: await onScreen('#btnShortcuts'),
  inTools: await page.evaluate(() => ['btnUndoAction', 'btnRedoAction', 'btnShortcuts']
    .every(id => !!document.getElementById(id)?.closest('.ws-global-tools'))),
};
ok(r.undo && r.redo && r.shortcuts && r.inTools,
  'Undo, Redo and Shortcuts are reachable in shell chrome, not entombed in the hidden classic bar', JSON.stringify(r));

// Relocation must move the LIVE element, so history-manager's existing binding
// and its disabled-state driving survive. Proven by a real edit, not by asserting
// the node exists: a cloned/rebuilt button would look identical here but be dead.
r = await page.evaluate(() => {
  const app = window.app, history = app.history;
  history.reset();                                   // known-empty history baseline
  const before = document.getElementById('btnUndoAction')?.disabled;
  // A real product edit through the tagger's own API. NOT createWholeVideoPlay:
  // it early-returns when the game already has plays, so on a populated fixture
  // it silently no-ops and the assertion passes for the wrong reason.
  const play = app.tagger.plays[0] || app.tagger.createWholeVideoPlay(30, 'undo-probe');
  app.tagger.selectPlay(play.id);
  app.tagger.setUnit(play.tags?.unit === 'defense' ? 'offense' : 'defense');
  return {
    sameNode: history?.btnUndo === document.getElementById('btnUndoAction'),
    inTools: !!history?.btnUndo?.closest('.ws-global-tools'),
    before,
    after: document.getElementById('btnUndoAction')?.disabled,
    entries: history?.stack?.length,
  };
});
ok(r.sameNode && r.inTools && r.entries === 1 && r.before === true && r.after === false,
  'Relocated Undo stays wired to history-manager and enables on a real edit', JSON.stringify(r));

// The CV badge is deliberately NOT prime chrome: it reports an optional local
// server. It belongs with the low-frequency setup tools, so it must be absent
// from the top bar and present once the drawer is open.
const badgeClosed = await onScreen('#backendStatusBadge');
await page.click('#btnSidebarToggle');
await new Promise(resolve => setTimeout(resolve, 360));
const badgeOpen = await onScreen('#backendStatusBadge');
r = { badgeClosed, badgeOpen, inHead: await page.evaluate(() => !!document.getElementById('backendStatusBadge')?.closest('.settings-drawer-head')) };
ok(!r.badgeClosed && r.badgeOpen && r.inHead,
  'CV-server badge is rehoused in the drawer head: hidden with the drawer closed, reachable when open', JSON.stringify(r));

// Classic top-bar media rules are written for the classic bar's cramping but
// several are UNSCOPED, so they follow a control that gets relocated. Two would
// have landed silently here: `.backend-status-badge{display:none}` under 1200px
// (badge vanishes inside the drawer, worst on the small windows where the drawer
// matters most) and `#btnShortcuts span{display:none}` under 1450px (label
// reappears on a wide monitor and reflows the top bar). Pin both ends.
await page.setViewport({ width: 1152, height: 860 });
await new Promise(resolve => setTimeout(resolve, 260));
const narrowBadge = await onScreen('#backendStatusBadge');
await page.setViewport({ width: 1680, height: 900 });
await new Promise(resolve => setTimeout(resolve, 260));
const wideShortcutsLabel = await page.evaluate(() =>
  getComputedStyle(document.querySelector('.ws-global-tools #btnShortcuts span')).display);
r = { narrowBadge, wideShortcutsLabel };
ok(r.narrowBadge && r.wideShortcutsLabel === 'none',
  'Relocated controls ignore the classic bar\'s unscoped width rules (badge survives <1200px, Shortcuts stays icon-only >1450px)', JSON.stringify(r));
await page.setViewport({ width: 1280, height: 800 });
await new Promise(resolve => setTimeout(resolve, 260));
await page.evaluate(() => document.getElementById('settingsDrawerClose')?.click());
await new Promise(resolve => setTimeout(resolve, 320));

await capture('breakdown-tools-1280x800');
// Linked-film reload can be slower under CPU/GPU or disk pressure. The route
// must wait for switchToGame() instead of racing shell render against it.
r = await page.evaluate(async () => {
  const app = window.app;
  await app.workspaceShell.show('home');
  const originalLoad = app.storage._loadActiveGame;
  const originalShow = app.workspaceShell.show;
  let loadCompleted = false;
  let breakdownBeforeLoad = false;
  app.storage._loadActiveGame = async function (...args) {
    await new Promise(resolve => setTimeout(resolve, 180));
    const result = await originalLoad.apply(this, args);
    loadCompleted = true;
    return result;
  };
  app.workspaceShell.show = async function (route) {
    if (route === 'breakdown' && !loadCompleted) breakdownBeforeLoad = true;
    return originalShow.call(this, route);
  };
  document.querySelector('[data-ws-game="preview-game"]')?.click();
  await new Promise(resolve => setTimeout(resolve, 650));
  app.storage._loadActiveGame = originalLoad;
  app.workspaceShell.show = originalShow;
  return {
    loadCompleted,
    breakdownBeforeLoad,
    activeGameId: app.storage.seasonStore.data.activeGameId,
    route: app.workspace.currentRoute(),
    breakdownVisible: !document.getElementById('wsBreakdown')?.hidden,
    settingsVisible: document.getElementById('btnSidebarToggle')?.offsetParent !== null,
    moreVisible: document.getElementById('btnMoreMenu')?.offsetParent !== null,
  };
});
ok(r.loadCompleted && !r.breakdownBeforeLoad && r.activeGameId === 'preview-game'
    && r.route === 'breakdown' && r.breakdownVisible && r.settingsVisible && r.moreVisible,
  'Delayed game switch finishes before Break Down renders and keeps Settings/More visible', JSON.stringify(r));

// C1 (binding amendment 2026-07-23): the legacy Season Library SCHEDULE is
// RETIRED as a game-entry surface. In the shell, Home is the single place to
// open a game. Opening a season through the legacy handler must land on Home,
// and a direct call to the retired schedule surface must redirect to Home and
// never expose the game grid — it cannot be reached, mounted, or restored.
r = await page.evaluate(async () => {
  const app = window.app;
  const seasonId = app.storage.seasonStore.currentSeasonId;
  await app.openGame('preview-game');              // start in Break Down
  const beforeRoute = app.workspace.currentRoute();
  await app.library._open(seasonId);               // legacy "Open season" handler
  const afterOpen = {
    route: app.workspace.currentRoute(),
    scheduleHidden: document.getElementById('libraryScheduleView')?.classList.contains('hidden'),
    libraryHidden: app.library.overlay.classList.contains('hidden'),
    homeVisible: !document.getElementById('wsHome')?.hidden,
  };
  await app.library.openSchedule();                // direct call to the retired surface
  const afterSchedule = {
    route: app.workspace.currentRoute(),
    scheduleHidden: document.getElementById('libraryScheduleView')?.classList.contains('hidden'),
    homeVisible: !document.getElementById('wsHome')?.hidden,
  };
  return { beforeRoute, afterOpen, afterSchedule };
});
ok(r.beforeRoute === 'breakdown', 'Retirement precondition: openGame lands in Break Down', JSON.stringify(r));
ok(r.afterOpen.route === 'home' && r.afterOpen.homeVisible && r.afterOpen.scheduleHidden && r.afterOpen.libraryHidden,
  'Retired route: opening a season lands on Home, never the legacy schedule grid', JSON.stringify(r.afterOpen));
ok(r.afterSchedule.route === 'home' && r.afterSchedule.homeVisible && r.afterSchedule.scheduleHidden,
  'Retired route: a direct openSchedule() redirects to Home and never shows the game grid', JSON.stringify(r.afterSchedule));

// Home must highlight the ACTUAL current game after a round trip — never the
// previously opened game (closeout item 2 / amendment proof item 3).
r = await page.evaluate(async () => {
  const app = window.app;
  const A = app.storage.seasonStore.data.games.find(g => g.id !== 'preview-game').id;
  const B = 'preview-game';
  const selectedOnHome = () => document.querySelector('.ws-film-row.selected [data-ws-preview]')?.dataset.wsPreview;
  await app.openGame(A); await app.workspaceShell.show('home'); const afterA = selectedOnHome();
  await app.openGame(B); await app.workspaceShell.show('home'); const afterB = selectedOnHome();
  return { A, B, afterA, afterB, active: app.storage.seasonStore.data.activeGameId };
});
ok(String(r.afterA) === String(r.A), 'Home highlights Game A after opening A and returning Home', JSON.stringify(r));
ok(String(r.afterB) === String(r.B) && r.active === r.B,
  'Game A -> Home -> Game B -> Home highlights Game B, never the previously opened game', JSON.stringify(r));

// Re-opening the already-active game is idempotent: no extra film load, one
// state owner, and it stays in Break Down (amendment proof item 5).
r = await page.evaluate(async () => {
  const app = window.app;
  await app.openGame('preview-game');
  const orig = app.storage._loadActiveGame; let loads = 0;
  app.storage._loadActiveGame = function (...a) { loads++; return orig.apply(this, a); };
  await app.openGame('preview-game');
  await app.openGame('preview-game');
  app.storage._loadActiveGame = orig;
  return { loads, active: app.storage.seasonStore.data.activeGameId, route: app.workspace.currentRoute() };
});
ok(r.loads === 0 && r.active === 'preview-game' && r.route === 'breakdown',
  'Re-opening the active game is idempotent — no extra film load, stays in Break Down', JSON.stringify(r));

// Stale Home async (slow film-health from a prior game) cannot pull the
// workspace off the game the coach actually opened next (amendment proof item 4).
r = await page.evaluate(async () => {
  const app = window.app;
  const A = app.storage.seasonStore.data.games.find(g => g.id !== 'preview-game').id;
  await app.openGame(A);
  const origHealth = app.workspace.filmHealth;
  app.workspace.filmHealth = async (g) => { await new Promise(res => setTimeout(res, 160)); return { state: 'ready', label: `HEALTH ${g.id}`, expected: 0, found: 0 }; };
  const homePromise = app.workspaceShell.show('home');   // A-context refreshHome, slow tail
  await new Promise(res => setTimeout(res, 15));
  await app.openGame('preview-game');                    // open B before the tail resolves
  await homePromise.catch(() => {});
  await new Promise(res => setTimeout(res, 260));         // let the stale A tail settle
  app.workspace.filmHealth = origHealth;
  return { route: app.workspace.currentRoute(), active: app.storage.seasonStore.data.activeGameId, breakdownVisible: !document.getElementById('wsBreakdown')?.hidden };
});
ok(r.route === 'breakdown' && r.active === 'preview-game' && r.breakdownVisible,
  'Stale Home async from a prior game cannot pull the workspace off the game just opened', JSON.stringify(r));

await page.click('.ws-top-nav [data-ws-route="study"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), study: !document.querySelector('#wsStudy')?.hidden, statsHidden: document.querySelector('#statsDashboard')?.classList.contains('hidden'), appHidden: document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.route === 'study' && r.study && r.statsHidden && r.appHidden, 'Study opens the query workspace inside the persistent shell');

await page.click('[data-study-action="advanced"]');
r = await page.evaluate(() => ({ stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), appVisible: !document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.stats, 'Study keeps Advanced Reports one click away (now the Reports destination)', JSON.stringify(r));
await page.click('.ws-sidebar [data-ws-route="study"]');

await page.click('.ws-sidebar [data-ws-route="plan"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), plan: !document.querySelector('#wsPlan')?.hidden, appHidden: document.querySelector('#wsClassicOutlet')?.hidden, text: document.querySelector('#wsPlan')?.textContent || '' }));
ok(r.route === 'plan' && r.plan && r.appHidden && /GAME PLAN/.test(r.text), 'Plan opens the live season plan workspace');

// Finding 2 (2026-07-23): the classic-layout escape hatch is fully retired —
// there is no "Use classic layout" button and no useClassic() method, so there
// is exactly one product route. Checked while the shell is mounted.
r = await page.evaluate(() => ({
  noClassicBtn: !document.querySelector('[data-ws-action="classic"]'),
  noUseClassic: typeof window.app.workspaceShell.useClassic !== 'function',
  newGameBtn: !!document.querySelector('[data-ws-action="new-game"]'),
}));
ok(r.noClassicBtn && r.noUseClassic, 'Classic-layout escape hatch fully retired: no "Use classic" button, no useClassic()', JSON.stringify(r));
ok(r.newGameBtn, 'Home exposes a direct New Game action (finding 4)', JSON.stringify(r));

// COACH SMOKE REGRESSION (2026-07-24): the `⋯` button (_openLibrary) and
// Advanced Reports (showAdvancedReports) both REVEAL #wsClassicOutlet, because
// the library overlay and stats dashboard live inside the relocated classic
// #app. Closing them only removed their own overlay — nothing re-hid the outlet
// — so the entire retired classic UI, legacy breadcrumb and game dropdown
// included, was left exposed underneath. The coach re-found the old flow exactly
// this way. FAILING-FIRST: remove the restoreRouteVisibility() calls from
// SeasonLibrary.hide() / StatsEngine.hideDashboard() and these red.
r = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  const outlet = () => document.getElementById('wsClassicOutlet').hidden;
  await shell.show('breakdown');
  // 1. the `⋯` seasons button reveals the outlet, then the library is closed
  document.querySelector('[data-ws-action="seasons"]').click();
  await new Promise(res => setTimeout(res, 400));
  const outletWhileLibraryOpen = outlet();
  window.app.library.hide();
  await new Promise(res => setTimeout(res, 200));
  const outletAfterLibraryClose = outlet();
  // 2. Advanced Reports reveals it, then the dashboard is closed
  shell.showAdvancedReports();
  await new Promise(res => setTimeout(res, 300));
  const outletWhileReportsOpen = outlet();
  window.app.stats.hideDashboard();
  await new Promise(res => setTimeout(res, 200));
  return {
    outletWhileLibraryOpen, outletAfterLibraryClose,
    outletWhileReportsOpen, outletAfterReportsClose: outlet(),
    // Was "hidden under the shell". Now DELETED: hidden markup is exactly what
    // let the retired game-entry flow resurface whenever an overlay revealed the
    // classic outlet. Absence is the stronger contract — it cannot be un-hidden.
    breadcrumbGone: !document.getElementById('breadcrumb') && !document.getElementById('gameDropdown'),
  };
});
// The library still lives inside the classic #app, so opening it must still
// reveal the outlet — and closing it must put the outlet back, or the retired
// classic top bar is left exposed (the coach found exactly this by clicking ⋯).
// Liveness: assert the outlet really IS revealed while open, so "hidden after"
// cannot pass against code that never showed it.
ok(r.outletWhileLibraryOpen === false,
  'liveness: opening the library really does reveal the classic outlet', JSON.stringify(r));
ok(r.outletAfterLibraryClose === true,
  'Closing the library re-hides the classic outlet (no retired UI left exposed)', JSON.stringify(r));
// Reports is now a real shell destination, so it never needs the outlet at all
// — strictly better than revealing-then-restoring.
ok(r.outletWhileReportsOpen === true && r.outletAfterReportsClose === true,
  'Advanced Reports NEVER reveals the classic outlet (it is a shell route now)', JSON.stringify(r));
ok(r.breadcrumbGone,
  'The legacy breadcrumb + game dropdown are DELETED, not merely hidden', JSON.stringify(r));

// disable() remains as the INTERNAL mount/restore teardown contract (tested
// lifecycle hygiene — proves the shell returns #app intact). It is not reachable
// from any product affordance.
r = await page.evaluate(() => {
  window.app.workspaceShell.disable();
  return {
    restored: document.querySelector('#app .main-content > .video-section') != null
      && document.querySelector('#app .main-content > #playGridSection') != null
      && document.querySelector('#app .main-content > .tag-section') != null,
    // Every adopted control must go home, not just the two the shell started
    // with — an un-restored one would leak into a detached tree on re-enable.
    chromeRestored: ['btnSidebarToggle', 'btnUndoAction', 'btnRedoAction', 'btnShortcuts', 'backendStatusBadge']
      .every(id => !!document.querySelector(`#app .top-bar #${id}`))
      && !!document.querySelector('#app .top-bar .more-menu #btnMoreMenu')
      && !!document.querySelector('#app #settingsDrawer'),
  };
});
ok(r.restored && r.chromeRestored, 'disable() (internal teardown) restores canonical surfaces and every adopted chrome control', JSON.stringify(r));

await page.setViewport({ width: 768, height: 1024 });
await page.evaluate(() => { localStorage.setItem('ffa_workspace_shell_v2', '1'); window.app.workspaceShell.enable(); });

// mount -> restore -> mount. disable() is asserted above and enable() right
// here, but nothing re-checked that the ADOPTED controls come back into shell
// chrome on the second mount — leaving the newly relocated ones (undo, redo,
// shortcuts, CV badge) re-entombed inside the hidden classic bar after a
// lifecycle cycle, with every other assertion still green.
r = await page.evaluate(() => ({
  reAdopted: ['btnUndoAction', 'btnRedoAction', 'btnShortcuts', 'btnSidebarToggle']
    .every(id => !!document.getElementById(id)?.closest('.ws-global-tools')),
  badgeReHoused: !!document.getElementById('backendStatusBadge')?.closest('.settings-drawer-head'),
  moreReAdopted: !!document.getElementById('btnMoreMenu')?.closest('.ws-global-tools'),
  // and nothing got duplicated by mounting twice
  singletons: ['btnUndoAction', 'btnRedoAction', 'btnShortcuts', 'backendStatusBadge']
    .every(id => document.querySelectorAll(`#${id}`).length === 1),
}));
ok(r.reAdopted && r.badgeReHoused && r.moreReAdopted && r.singletons,
  'Re-enabling after teardown re-adopts every relocated control exactly once', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell.show('home'));
await capture('home-768x1024');
await page.setViewport({ width: 390, height: 844 });
r = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  mobileHeader: getComputedStyle(document.querySelector('.ws-mobile-head')).display !== 'none',
  sidebar: getComputedStyle(document.querySelector('.ws-sidebar')).display,
  bottomTabs: getComputedStyle(document.querySelector('.bottom-tabs')).display,
}));
ok(!r.overflow && r.mobileHeader && r.sidebar === 'none' && r.bottomTabs === 'none', 'Mobile Home has no overflow and hides classic navigation', JSON.stringify(r));
await capture('home-390x844');

await page.evaluate(() => window.app.workspaceShell.show('breakdown'));
r = await page.evaluate(() => ({
  bottomTabs: getComputedStyle(document.querySelector('.bottom-tabs')).display,
  workspaceNav: getComputedStyle(document.querySelector('.ws-mobile-nav')).display,
  routeButtons: document.querySelectorAll('.ws-mobile-nav [data-ws-route]').length,
  active: document.querySelector('.ws-mobile-nav [data-ws-route].active')?.dataset.wsRoute,
  routeSelect: !!document.querySelector('#wsMobileRoute'),
}));
ok(r.bottomTabs === 'none' && r.workspaceNav === 'grid' && r.routeButtons === 5 && r.active === 'breakdown' && !r.routeSelect,
  'Mobile Break Down uses one Home/Break Down/Study/Reports/Plan navigation system', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
