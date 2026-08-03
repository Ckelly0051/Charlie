import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Phase 1 shell/Home contract. The flag is opt-in; classic launch remains the
   default. This test drives the built bundle through real route adapters. */
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = TEST_APP_URL;
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
  hub: !document.querySelector('#wsTeamHub')?.hidden && !!document.querySelector('[data-native-team-hub]'),
  appInOutlet: document.querySelector('#wsClassicOutlet > #app')?.id === 'app',
  flag: localStorage.getItem('ffa_workspace_shell_v2'),
  breakdownDisabled: document.querySelector('[data-ws-route="breakdown"]')?.disabled,
  reportsDisabled: [...document.querySelectorAll('[data-ws-route="reports"]')].every(button => button.disabled),
  emptyAction: document.querySelector('#wsResume')?.textContent,
  emptyActionEnabled: !document.querySelector('#wsResume')?.disabled,
  emptyActionTarget: document.querySelector('#wsResume')?.dataset.wsAction,
}));
ok(r.shell && r.active && r.hub && r.appInOutlet, 'Shell mounts with the native Team Hub as its single front door', JSON.stringify(r));

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
ok(r.flag === '1' && r.breakdownDisabled && r.reportsDisabled, 'Guarded routes, including Reports, start disabled with no season');
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
  tagOwners: document.querySelectorAll('#wsBreakdown [data-native-tagging]').length,
  legacyChrome: document.querySelectorAll('#wsBreakdown .top-bar, #wsBreakdown .settings-drawer, #wsBreakdown #statsDashboard').length,
  sidebarDisplay: getComputedStyle(document.querySelector('.ws-sidebar')).display,
  topNavDisplay: getComputedStyle(document.querySelector('.ws-top-nav')).display,
  mediaWidth: Math.round(document.querySelector('.gi-breakdown-theater-host').getBoundingClientRect().width),
}));
ok(r.dedicatedVisible && r.classicHidden && r.homeHidden && r.route === 'breakdown', 'Break Down opens its dedicated production route', JSON.stringify(r));
ok(r.videoOwners === 1 && r.tagOwners === 1 && r.legacyChrome === 0, 'Dedicated route has one canonical video/tag owner and no legacy app chrome', JSON.stringify(r));
ok(r.sidebarDisplay === 'none' && r.topNavDisplay === 'flex' && r.mediaWidth >= 800, 'Desktop Break Down replaces the sidebar with compact navigation and restores film width', JSON.stringify(r));

r = await page.evaluate(() => ({
  settingsInShell: !!document.querySelector('.ws-global-tools #btnSidebarToggle'),
  moreInShell: !!document.querySelector('.ws-top-actions #btnNativeMore'),
  settingsVisible: document.getElementById('btnSidebarToggle')?.offsetParent !== null,
  moreVisible: document.getElementById('btnNativeMore')?.offsetParent !== null,
  retiredOwnersAbsent: !document.getElementById('settingsDrawer') && !document.getElementById('drawerScrim'),
  filmPickersOutsideLegacy: ['projectFileInput','clipFileInput','repairFilmInput'].every(id => document.getElementById(id)?.parentElement === document.body),
}));
ok(r.settingsInShell && r.moreInShell && r.settingsVisible && r.moreVisible && r.retiredOwnersAbsent && r.filmPickersOutsideLegacy,
  'Compact shell keeps Settings and More visible while retired overlays stay absent and film pickers survive outside #app', JSON.stringify(r));

await page.click('#btnSidebarToggle');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
r = await page.evaluate(() => ({
  nativeSettings: document.querySelectorAll('[data-overlay-id="team-film-settings"] [data-native-settings]').length,
  retiredOwnersAbsent: !document.getElementById('settingsDrawer') && !document.getElementById('drawerScrim'),
}));
ok(r.nativeSettings === 1 && r.retiredOwnersAbsent, 'Shell Settings opens the single native Settings owner with no drawer or scrim', JSON.stringify(r));
await page.click('[data-overlay-id="team-film-settings"] [data-overlay-action="done"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
await page.click('#btnNativeMore');
await page.waitForSelector('[role="menu"][aria-label="More actions"] [data-popover-item="open"]');
await capture('more-1280x800');
r = await page.evaluate(() => ({
  moreOpen: !!document.querySelector('[role="menu"][aria-label="More actions"]'),
  nativeOwner: !!document.querySelector('#giNativeRoot [data-popover-item="import"]'),
  legacyAbsent: !document.getElementById('moreDropdown') && !document.getElementById('btnMoreMenu') && !document.querySelector('.more-menu'),
  projectInputOutsideLegacy: document.getElementById('projectFileInput')?.parentElement === document.body,
  expanded: document.getElementById('btnNativeMore')?.getAttribute('aria-expanded'),
}));
ok(r.moreOpen && r.nativeOwner && r.legacyAbsent && r.projectInputOutsideLegacy && r.expanded === 'true',
  'Shell More is the single action-menu owner and the season-file picker survives outside the legacy tree', JSON.stringify(r));

await page.evaluate(() => {
  const input = document.getElementById('projectFileInput');
  window.__nativeOpenCalls = 0;
  window.__nativeOpenOriginal = input.click;
  input.click = () => { window.__nativeOpenCalls++; };
});
await page.click('[data-popover-item="open"]');
await page.waitForFunction(() => window.__nativeOpenCalls === 1);
r = await page.evaluate(() => {
  const input = document.getElementById('projectFileInput');
  input.click = window.__nativeOpenOriginal;
  delete window.__nativeOpenOriginal;
  return {
    calls: window.__nativeOpenCalls,
    closed: !document.querySelector('[role="menu"][aria-label="More actions"]'),
  };
});
ok(r.calls === 1 && r.closed, 'Native Open season file reaches the canonical picker exactly once', JSON.stringify(r));
await page.click('#btnNativeMore');
await page.waitForSelector('[data-popover-item="import"]');

// Import Plays is a distinct workflow from export/import data parity. Prove the
// live shell affordance opens the canonical importer and that cancelling it is
// a canonical-season no-op; a storage-only CSV round trip cannot cover either.
const beforeImport = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
await page.click('[data-popover-item="import"]');
await page.waitForSelector('[data-overlay-id="play-import"] [data-native-play-import]');
await page.type('#playImportText', 'Unit,QB Alignment,Backfield,Strength,Coverage Call,Coverage Family,Play Type,Result,Yards\nOffense,Shotgun,Empty,Right,Cover 3,Zone,Run Inside,Gain,5');
await page.click('[data-overlay-id="play-import"] .gi-play-import-parse button');
await page.waitForSelector('[data-overlay-id="play-import"] .gi-play-import-preview tbody tr');
await capture('import-1280x800');
const importJourney = await page.evaluate(before => {
  const sheet = document.querySelector('[data-overlay-id="play-import"]');
  const count = sheet?.querySelector('.gi-play-import-section:last-of-type header strong')?.textContent;
  const selects = [...(sheet?.querySelectorAll('.gi-play-import-mapping select') || [])];
  const mapped = selects.length;
  const mappingValues = selects.map(select => select.value);
  const legacyGone = !document.getElementById('playImportModal') && !document.getElementById('btnImportPlays');
  sheet?.querySelector('.gi-play-import-actions button')?.click();
  return {
    native: !!sheet,
    count,
    mapped,
    mappingValues,
    legacyGone,
    popoverClosed: !document.querySelector('[role="menu"][aria-label="More actions"]'),
    unchanged: before === JSON.stringify(window.app.storage.seasonStore.data),
  };
}, beforeImport);
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="play-import"]'));
await page.waitForFunction(() => document.activeElement?.id === 'btnNativeMore');
importJourney.focusReturned = true;
ok(importJourney.native && importJourney.count === '1 play' && importJourney.mapped === 9
    && ['unit','qbAlignment','backfield','strength','coverage','coverageFamily'].every(field => importJourney.mappingValues.includes(field))
    && importJourney.legacyGone && importJourney.popoverClosed && importJourney.unchanged && importJourney.focusReturned,
  'Native Import Plays parses and previews CSV; Cancel preserves the season and no legacy modal remains',
  JSON.stringify(importJourney));

const beforeNativeApply = await page.evaluate(() => window.app.tagger.plays.length);
await page.click('#btnNativeMore');
await page.waitForSelector('[data-popover-item="import"]');
await page.click('[data-popover-item="import"]');
await page.waitForSelector('[data-overlay-id="play-import"] [data-native-play-import]');
await page.type('#playImportText', 'Play Type,Result,Yards\nRun Outside,Gain,9');
await page.click('[data-overlay-id="play-import"] .gi-play-import-parse button');
await page.waitForSelector('[data-overlay-id="play-import"] .gi-play-import-preview tbody tr');
await page.click('[data-overlay-id="play-import"] .gi-play-import-actions .is-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="play-import"]')
  || !!document.querySelector('[data-overlay-id="play-import"] .gi-play-import-error'));
r = await page.evaluate(before => {
  const sheet = document.querySelector('[data-overlay-id="play-import"]');
  const plays = window.app.tagger.plays;
  const imported = plays.at(-1);
  return {
    before,
    after: plays.length,
    playType: imported?.tags?.playType,
    result: imported?.tags?.result,
    yardage: imported?.tags?.yardage,
    applyError: sheet?.querySelector('.gi-play-import-error')?.textContent || '',
    successToast: [...document.querySelectorAll('.gi-native-toast')].some(node => /Imported 1 play/i.test(node.textContent || '')),
  };
}, beforeNativeApply);
if (r.applyError) await page.evaluate(() => window.app.playImport.close('test-cleanup'));
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="play-import"]'));
ok(!r.applyError && r.after === r.before + 1 && r.playType === 'Run Outside' && r.result === 'Gain'
    && String(r.yardage) === '9' && r.successToast,
  'Native Import confirms one mapped football play and reports success', JSON.stringify(r));

await page.evaluate(() => {
  const storage = window.app.storage;
  window.__nativeMoreSaveCalls = 0;
  window.__nativeMoreOriginalSave = storage.saveProject;
  storage.saveProject = () => { window.__nativeMoreSaveCalls++; };
});
await page.click('#btnNativeMore');
await page.waitForSelector('[data-popover-item="save"]');
await page.click('[data-popover-item="save"]');
await page.waitForFunction(() => window.__nativeMoreSaveCalls === 1);
await page.waitForFunction(() => document.activeElement?.id === 'btnNativeMore');
r = await page.evaluate(() => {
  window.app.storage.saveProject = window.__nativeMoreOriginalSave;
  delete window.__nativeMoreOriginalSave;
  return {
    calls: window.__nativeMoreSaveCalls,
    closed: !document.querySelector('[role="menu"][aria-label="More actions"]'),
    focus: document.activeElement?.id,
    legacyAbsent: !document.getElementById('moreDropdown') && !document.getElementById('btnMoreMenu'),
  };
});
ok(r.calls === 1 && r.closed && r.focus === 'btnNativeMore' && r.legacyAbsent,
  'Native More invokes the storage Save command exactly once, restores its launcher, and has no legacy owner', JSON.stringify(r));

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
  order: await page.evaluate(() => [...document.querySelector('.ws-global-tools').children]
    .map(el => el.id || el.querySelector('button')?.id || '')),
};
ok(r.undo && r.redo && r.shortcuts && r.inTools
  && r.order.slice(0, 4).join(',') === 'btnUndoAction,btnRedoAction,btnShortcuts,btnSidebarToggle',
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

// Optional analysis status belongs inside native Analysis, never in prime shell chrome.
const badgeClosed = await onScreen('#backendStatusBadge');
await page.click('#btnSidebarToggle');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.click('[data-settings-tab="analysis"]');
await page.waitForSelector('[data-settings-panel="analysis"]');
r = await page.evaluate(() => ({
  badgeClosed: document.getElementById('backendStatusBadge')?.offsetParent !== null,
  analysisStatus: document.querySelector('[data-settings-panel="analysis"] .gi-settings-status')?.textContent?.trim(),
  shortcutsLabel: getComputedStyle(document.querySelector('.ws-global-tools #btnShortcuts span')).display,
}));
ok(!badgeClosed && !r.badgeClosed && r.analysisStatus && r.shortcutsLabel === 'none',
  'Optional analysis status lives in Settings while prime chrome stays quiet and Shortcuts remains icon-only', JSON.stringify(r));
await page.click('[data-overlay-id="team-film-settings"] [data-overlay-action="done"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
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
    moreVisible: document.getElementById('btnNativeMore')?.offsetParent !== null,
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
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), study: !document.querySelector('#wsStudy')?.hidden, reportsHidden: document.querySelector('#wsReports')?.hidden, appHidden: document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.route === 'study' && r.study && r.reportsHidden && r.appHidden, 'Study opens the query workspace inside the persistent shell');

await page.click('[data-study-action="advanced"]');
r = await page.evaluate(() => ({ stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), appVisible: !document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.stats, 'Study keeps Advanced Reports one click away (now the Reports destination)', JSON.stringify(r));
// S1 REPORTS OWNERSHIP CONTRACT. The visible dashboard is created inside the
// Preact route; the hidden legacy node stays home and relinquishes its public id.
r = await page.evaluate(() => ({
  nativeRoute: !!document.querySelector('#wsReports [data-native-reports]#statsDashboard'),
  nativeContent: !!document.querySelector('#wsReports [data-native-report-content] [data-native-main-report]'),
  legacyNotMoved: !document.querySelector('#wsReports #legacyStatsDashboard'),
  legacyStillHome: !!document.querySelector('#app #legacyStatsDashboard'),
  mainActions: document.querySelectorAll('#wsReports [data-rp-action]').length,
  tabs: document.querySelectorAll('#wsReports [data-report-tab]').length,
}));
ok(r.nativeRoute && r.nativeContent && r.legacyNotMoved && r.legacyStillHome && r.mainActions === 2 && r.tabs === 8,
  'Native Reports owns its route, actions, and football section navigation without moving the legacy dashboard', JSON.stringify(r));
r = await page.evaluate(() => {
  const screen = window.app.reportsScreen, calls = [];
  const original = screen.export;
  screen.export = kind => { calls.push(kind); return true; };
  document.getElementById('btnExportStats').click();
  document.querySelector('.gi-reports-menu [role="menuitem"]')?.click();
  screen.export = original;
  return { calls };
});
ok(r.calls.length === 1 && r.calls[0] === 'pdf',
  'Native Reports Export menu invokes the canonical game-report action', JSON.stringify(r));
await page.evaluate(() => window.app.stats._emptyOverlay('Scout Report', 'No opponent data yet.'));
await new Promise(resolve => setTimeout(resolve, 0));
r = await page.evaluate(() => ({
  routeHeadHidden: [...document.querySelectorAll('#wsReports [data-reports-main-chrome]')].every(node => node.hidden),
  title: document.querySelector('#wsReports .stats-header h2')?.textContent,
  closeVisible: document.getElementById('btnCloseEmptyOv')?.offsetParent !== null,
}));
ok(r.routeHeadHidden && r.title === 'Scout Report' && r.closeVisible,
  'Specialized/empty report keeps its truthful title and canonical Close action', JSON.stringify(r));
await page.keyboard.press('Escape');
await new Promise(resolve => setTimeout(resolve, 0));
r = await page.evaluate(() => ({ main: !!document.getElementById('btnExportStats'), route: window.app.workspace.currentRoute() }));
ok(r.main && r.route === 'reports', 'Escape from a specialized report returns to the Reports dashboard', JSON.stringify(r));
const reportStates = await page.evaluate(() => {
  const stats = window.app.stats;
  const capture = (render, expectedTitle, exportSelector) => {
    render();
    const header = document.querySelector('#wsReports .stats-header');
    return {
      expectedTitle,
      title: header?.querySelector('h2')?.textContent || '',
      visible: !!header && getComputedStyle(header).display !== 'none',
      close: !!header?.querySelector('[id^="btnClose"]'),
      export: exportSelector ? !!header?.querySelector(exportSelector) : true,
    };
  };
  return [
    capture(() => stats.renderOpponentScout('Knights'), 'Opponent Report', null),
    capture(() => stats.renderScoutReport(), 'Scout Report', '#btnExportScoutReport'),
    capture(() => stats.renderSelfScout(), 'Self-Scout', '#btnExportSelfScout'),
    capture(() => stats.renderDefensiveReport(), 'Defensive Report', null),
  ];
});
ok(reportStates.every(state => state.visible && state.close && state.export && state.title.includes(state.expectedTitle)),
  'Opponent, scout, self-scout, and defensive report states retain their canonical controls', JSON.stringify(reportStates));
await page.evaluate(() => window.app.reportsScreen.show());
const reportsLibrary = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  await shell._openLibrary();
  const whileOpen = {
    reportsHidden: document.getElementById('wsReports').hidden,
    hubVisible: !document.getElementById('wsTeamHub').hidden,
    outletVisible: !document.getElementById('wsClassicOutlet').hidden,
  };
  await shell.closeTeamHub();
  await new Promise(resolve => setTimeout(resolve, 0));
  return {
    whileOpen,
    after: {
      reportsVisible: !document.getElementById('wsReports').hidden,
      outletHidden: document.getElementById('wsClassicOutlet').hidden,
    },
  };
});
ok(reportsLibrary.whileOpen.reportsHidden && reportsLibrary.whileOpen.hubVisible && !reportsLibrary.whileOpen.outletVisible
  && reportsLibrary.after.reportsVisible && reportsLibrary.after.outletHidden,
  'Opening and backing out of native Team Hub from Reports restores exactly the Reports route', JSON.stringify(reportsLibrary));await page.click('.ws-sidebar [data-ws-route="study"]');

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

// S3 ownership regression: Teams and seasons are a native route. Opening the
// Hub from another workspace route must never reveal #wsClassicOutlet, and Back
// must restore the exact invoking route. Reports remains native too.
r = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  const outletHidden = () => document.getElementById('wsClassicOutlet').hidden;
  await shell.show('breakdown');
  await shell._openLibrary();
  const hubVisible = !document.getElementById('wsTeamHub').hidden;
  const outletWhileHubOpen = outletHidden();
  await shell.closeTeamHub();
  const breakdownRestored = !document.getElementById('wsBreakdown').hidden;
  const outletAfterHubClose = outletHidden();
  shell.showAdvancedReports();
  await new Promise(resolve => setTimeout(resolve, 0));
  const outletWhileReportsOpen = outletHidden();
  window.app.stats.hideDashboard();
  await new Promise(resolve => setTimeout(resolve, 0));
  return {
    hubVisible, outletWhileHubOpen, breakdownRestored, outletAfterHubClose,
    outletWhileReportsOpen, outletAfterReportsClose: outletHidden(),
    breadcrumbGone: !document.getElementById('breadcrumb') && !document.getElementById('gameDropdown'),
  };
});
ok(r.hubVisible && r.outletWhileHubOpen && r.breakdownRestored && r.outletAfterHubClose,
  'Native Team Hub never reveals the classic outlet and Back restores Break Down', JSON.stringify(r));
ok(r.outletWhileReportsOpen && r.outletAfterReportsClose,
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
      && !document.querySelector('#app .top-bar .more-menu')
      && !document.getElementById('settingsDrawer')
      && !document.getElementById('drawerScrim'),
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
  optionalStatusNotPrime: !document.getElementById('backendStatusBadge')?.closest('.ws-global-tools'),
  nativeMoreRebuilt: !!document.querySelector('.ws-top-actions #btnNativeMore'),
  singletons: ['btnUndoAction', 'btnRedoAction', 'btnShortcuts', 'backendStatusBadge']
    .every(id => document.querySelectorAll(`#${id}`).length === 1),
}));
ok(r.reAdopted && r.optionalStatusNotPrime && r.nativeMoreRebuilt && r.singletons,
  'Re-enabling re-adopts live global commands and rebuilds native More exactly once', JSON.stringify(r));
r = await page.evaluate(async () => {
  await window.app.workspaceShell.show('reports');
  const screen = window.app.reportsScreen, calls = [];
  const original = screen.export;
  screen.export = kind => { calls.push(kind); return true; };
  const button = document.querySelector('#wsReports [data-rp-action="export"]');
  button?.click();
  document.querySelector('#wsReports .gi-reports-menu [role="menuitem"]')?.click();
  screen.export = original;
  return {
    calls,
    buttonConnected: !!button?.isConnected,
    nativeRoute: !!document.querySelector('#wsReports [data-native-reports]#statsDashboard'),
    legacyNotMoved: !document.querySelector('#wsReports #legacyStatsDashboard'),
  };
});
ok(r.calls.length === 1 && r.calls[0] === 'pdf' && r.buttonConnected && r.nativeRoute && r.legacyNotMoved,
  'Native Reports actions rebind to the replacement host after shell teardown/re-enable', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell.show('home'));
await capture('home-768x1024');
await page.setViewport({ width: 390, height: 844 });
r = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  mobileHeader: getComputedStyle(document.querySelector('.ws-mobile-head')).display !== 'none',
  sidebar: getComputedStyle(document.querySelector('.ws-sidebar')).display,
  bottomTabs: document.querySelector('.bottom-tabs') ? getComputedStyle(document.querySelector('.bottom-tabs')).display : 'absent',
}));
ok(!r.overflow && r.mobileHeader && r.sidebar === 'none' && r.bottomTabs === 'absent', 'Mobile Home has no overflow and hides classic navigation', JSON.stringify(r));
await capture('home-390x844');

await page.evaluate(() => window.app.workspaceShell.show('breakdown'));
r = await page.evaluate(() => ({
  bottomTabs: document.querySelector('.bottom-tabs') ? getComputedStyle(document.querySelector('.bottom-tabs')).display : 'absent',
  workspaceNav: getComputedStyle(document.querySelector('.ws-mobile-nav')).display,
  routeButtons: document.querySelectorAll('.ws-mobile-nav [data-ws-route]').length,
  active: document.querySelector('.ws-mobile-nav [data-ws-route].active')?.dataset.wsRoute,
  routeSelect: !!document.querySelector('#wsMobileRoute'),
}));
ok(r.bottomTabs === 'absent' && r.workspaceNav === 'grid' && r.routeButtons === 5 && r.active === 'breakdown' && !r.routeSelect,
  'Mobile Break Down uses one Home/Break Down/Study/Reports/Plan navigation system', JSON.stringify(r));
await page.click('#btnNativeMoreMobile');
await page.waitForSelector('[role="menu"][aria-label="More actions"] [data-popover-item="settings"]');
await capture('more-390x844');
const mobileMore = await page.evaluate(() => ({
  items: document.querySelectorAll('[role="menu"][aria-label="More actions"] [role="menuitem"]:not([disabled])').length,
  minHeight: Math.min(...[...document.querySelectorAll('[role="menu"][aria-label="More actions"] [role="menuitem"]:not([disabled])')].map(item => item.getBoundingClientRect().height)),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
ok(mobileMore.items >= 10 && mobileMore.minHeight >= 44 && !mobileMore.overflow,
  'Mobile More exposes settings and file/report commands as touch targets without page overflow', JSON.stringify(mobileMore));
await page.click('[data-popover-item="settings"]');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.waitForFunction(() => !!document.getElementById('workspaceShell')?.closest('[inert]'));
r = await page.evaluate(() => ({
  modal: document.querySelector('[data-overlay-id="team-film-settings"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  routeInert: !!document.getElementById('workspaceShell')?.closest('[inert]'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
ok(r.modal === 'true' && r.routeInert && !r.overflow,
  'Mobile Settings is a focused modal sheet with no page overflow', JSON.stringify(r));
await page.click('[data-overlay-id="team-film-settings"] [data-overlay-action="done"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
await page.click('#btnNativeMoreMobile');
await page.waitForSelector('[role="menu"][aria-label="More actions"] [data-popover-item="shortcuts"]');
r = await page.evaluate(() => {
  const items = ['undo','redo','shortcuts'].map(key => document.querySelector(`[role="menu"][aria-label="More actions"] [data-popover-item="${key}"]`));
  return {
    allPresent: items.every(Boolean),
    minHeight: Math.min(...items.map(item => item.getBoundingClientRect().height)),
    retiredOwnersAbsent: !document.getElementById('settingsDrawer') && !document.getElementById('drawerScrim'),
  };
});
ok(r.allPresent && r.minHeight >= 44 && r.retiredOwnersAbsent,
  'Mobile More keeps Undo, Redo, and Shortcuts touch-reachable without reviving the drawer', JSON.stringify(r));
await page.click('[data-popover-item="shortcuts"]');
await page.waitForSelector('[data-overlay-id="keyboard-shortcuts"] [data-native-shortcuts]', { timeout: 10000 });
await capture('shortcuts-390x844');
r = await page.evaluate(() => ({
  shortcutsOpen: !!document.querySelector('[data-overlay-id="keyboard-shortcuts"] [data-native-shortcuts]'),
  legacyGone: !document.getElementById('shortcutsModal'),
  groups: document.querySelectorAll('[data-overlay-id="keyboard-shortcuts"] .gi-shortcuts section').length,
  modal: document.querySelector('[data-overlay-id="keyboard-shortcuts"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
}));
ok(r.shortcutsOpen && r.legacyGone && r.groups === 4 && r.modal === 'true' && !r.overflow,
  'Mobile Shortcuts opens the native focused dialog without legacy markup or overflow', JSON.stringify(r));
await page.click('[data-overlay-id="keyboard-shortcuts"] [data-overlay-action="done"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="keyboard-shortcuts"]'));
await page.waitForFunction(() => document.activeElement?.id === 'btnNativeMoreMobile');
r = await page.evaluate(() => ({ focusReturned: document.activeElement?.id === 'btnNativeMoreMobile' }));
ok(r.focusReturned, 'Closing native Shortcuts restores focus to the mobile More launcher', JSON.stringify(r));

console.log('\n== S6-1 Home: charting progress by unit and honest film source ==');
await page.setViewport({ width: 1440, height: 900 });
r = await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'S6 Home Progress', teamId: 't1' });
  const store = app.storage.seasonStore, game = store.activeGame();
  const mk = (id, unit, charted) => ({ id, timestamp: { start: id, end: id + 3 },
    tags: { unit, playType: charted ? 'Run Inside' : '', result: charted ? 'Gain' : '', yardage: charted ? '5' : '',
      runPass: charted ? 'Run' : '', formation: '', players: {}, grades: {}, custom: [] }, notes: '' });
  // offense 3 of 4, defense 1 of 3, special teams has NO plays at all
  game.plays = [mk(1,'offense',true), mk(2,'offense',true), mk(3,'offense',true), mk(4,'offense',false),
                mk(5,'defense',true), mk(6,'defense',false), mk(7,'defense',false)];
  await store.persist();
  await app.storage._loadActiveGame({ renderGames: false });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));

  // Canonical truth recomputed here, independent of the renderer.
  const canon = { offense: [0, 0], defense: [0, 0], special: [0, 0] };
  game.plays.forEach(p => { const u = p.tags.unit; canon[u][1]++; if (p.tags.playType && p.tags.result) canon[u][0]++; });

  const rows = [...document.querySelectorAll('#wsUnitProgress .ws-unit-row')].map(row => ({
    key: row.querySelector('.ws-unit-key')?.textContent,
    value: row.querySelector('strong')?.textContent,
    empty: row.classList.contains('is-empty'),
  }));
  const headline = document.getElementById('wsProgressText')?.textContent || '';
  const summed = rows.reduce((n, row) => n + (Number(String(row.value).split('/')[0]) || 0), 0);
  return { canon, rows, headline, summed,
    expected: [`${canon.offense[0]}/${canon.offense[1]}`, `${canon.defense[0]}/${canon.defense[1]}`] };
});
ok(r.rows.length === 3 && r.rows[0].value === r.expected[0] && r.rows[1].value === r.expected[1],
  'Home shows charting progress per unit matching the canonical play data', JSON.stringify(r));
ok(r.headline.startsWith(`${r.summed} of `),
  'Per-unit charted counts sum to the headline progress figure', JSON.stringify({ headline: r.headline, summed: r.summed }));
ok(r.rows[2].value === 'none' && r.rows[2].empty === true,
  'A unit with no plays reads "none" rather than 0%, which would look like uncharted film', JSON.stringify(r.rows[2]));

// Film source: the row must state WHERE film lives, not only how many clips
// matched. A managed copy and a linked D: folder previously read identically.
r = await page.evaluate(async () => {
  const app = window.app;
  const real = app.workspace.filmHealth.bind(app.workspace);
  app.workspace.filmHealth = async () => ({ state: 'linked', label: 'Linked film ready', ready: true,
    persistent: true, mode: 'linked', expected: 3, found: 3, missing: 0, progress: null,
    action: 'open', detail: '', path: 'D:\\Football\\Film\\Holy Family' });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));
  const linked = document.querySelector('[data-film-source]');
  const linkedText = linked?.textContent || ''; const linkedHidden = !!linked?.hidden;
  app.workspace.filmHealth = async () => ({ state: 'managed', label: 'Managed film ready', ready: true,
    persistent: true, mode: 'managed', expected: 3, found: 3, missing: 0, progress: null,
    action: 'open', detail: '', path: '' });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));
  const managed = document.querySelector('[data-film-source]');
  const managedText = managed?.textContent || '';
  app.workspace.filmHealth = real;
  return { linkedText, linkedHidden, managedText };
});
ok(r.linkedText === 'D:\\Football\\Film\\Holy Family' && !r.linkedHidden,
  'Film inbox reports the resolved linked folder alongside its clip count', JSON.stringify(r));
ok(/managed copy/i.test(r.managedText),
  'A managed game says so instead of implying a path the coach could open', JSON.stringify(r));

console.log('\n== S6-4a UX-2: universal game context switcher ==');
// A second game with a distinct score/charting profile, so the switcher's rows
// and the switch itself are both observable.
await page.evaluate(async () => {
  const store = window.app.storage.seasonStore, games = store.data.games;
  const first = games[0];
  first.gameInfo = { ...(first.gameInfo || {}), opponent: 'Rivals', date: '2026-09-01', scoreUs: 28, scoreThem: 21 };
  store.addGame({ id: 'ux2-switch-target', name: 'Week 9 vs Tigers', status: 'active',
    gameInfo: { opponent: 'Tigers', date: '2026-11-07' },
    plays: [{ id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'defense', playType: 'Run Inside', result: 'Gain', yardage: '3', custom: [] } }] });
  await store.persist();
});
r = await page.evaluate(async () => {
  const out = {};
  for (const route of ['home', 'breakdown', 'study', 'reports', 'plan']) {
    await window.app.workspaceShell.show(route);
    const button = document.querySelector('#wsContextSwitch');
    const rect = button?.getBoundingClientRect();
    out[route] = { tag: button?.tagName, menu: button?.getAttribute('aria-haspopup'),
      onScreen: !!rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.right <= document.documentElement.clientWidth };
  }
  return out;
});
ok(Object.values(r).every(entry => entry.tag === 'BUTTON' && entry.menu === 'menu' && entry.onScreen),
  'Game context is a real switcher on every route, not a Home-only round trip', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await page.click('#wsContextSwitch');
await page.waitForSelector('.gi-popover-item', { timeout: 5000 });
r = await page.evaluate(() => {
  const store = window.app.storage.seasonStore, games = store.data.games;
  const rows = [...document.querySelectorAll('.gi-popover-item')].filter(button => /^game-/.test(button.dataset.popoverItem || ''));
  // Recompute the expected current row from canonical state, not from the render.
  const activeKey = `game-${store.data.activeGameId}`;
  return {
    headings: [...document.querySelectorAll('[data-popover-heading]')].map(node => node.textContent),
    gameRows: rows.length, gameCount: games.length,
    current: rows.filter(button => button.getAttribute('aria-current') === 'true').map(button => button.dataset.popoverItem),
    activeKey,
    details: rows.map(button => button.querySelector('small')?.textContent || ''),
    focused: document.activeElement?.dataset?.popoverItem,
    headingTabIndex: document.querySelector('[data-popover-heading]')?.tabIndex,
    expanded: document.querySelector('#wsContextSwitch')?.getAttribute('aria-expanded'),
  };
});
ok(r.gameRows === r.gameCount && r.headings[0] && JSON.stringify(r.current) === JSON.stringify([r.activeKey]) && r.expanded === 'true',
  'The switcher lists every game of the open season under its season name and marks the current one', JSON.stringify(r));
ok(r.details.every(detail => /charted/.test(detail)) && r.details.some(detail => /W 28-21/.test(detail)) && r.details.some(detail => /Not played/.test(detail)),
  'Each game row carries its result state and charting progress', JSON.stringify(r.details));
ok(r.focused && /^game-/.test(r.focused) && r.headingTabIndex === -1,
  'Keyboard focus enters the game rows and the season heading is not an activatable menu item', JSON.stringify(r));
await page.keyboard.press('ArrowDown');
r = await page.evaluate(() => document.activeElement?.dataset?.popoverItem);
ok(/^game-/.test(r || ''), 'Arrow keys rove between game rows, skipping the heading', String(r));
const contextSwitch = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore;
  const before = store.data.activeGameId;
  const target = store.data.games.find(game => String(game.id) !== String(before));
  // Reports sub-view: choose a tab that is NOT the default, so preservation is
  // observable rather than coincidental.
  const tabs = [...document.querySelectorAll('.stats-tab')];
  if (tabs[2]) tabs[2].click();
  await new Promise(resolve => setTimeout(resolve, 150));
  const tabBefore = document.querySelector('.stats-tab.active')?.textContent.trim();
  document.querySelector(`[data-popover-item="game-${target.id}"]`).click();
  await new Promise(resolve => setTimeout(resolve, 900));
  return { before, target: String(target.id), after: String(store.data.activeGameId),
    route: app.workspace.currentRoute(), tabBefore, tabAfter: document.querySelector('.stats-tab.active')?.textContent.trim(),
    context: document.querySelector('#wsContextGame')?.textContent,
    focus: document.activeElement?.id, expanded: document.querySelector('#wsContextSwitch')?.getAttribute('aria-expanded'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
ok(contextSwitch.after === contextSwitch.target && contextSwitch.after !== contextSwitch.before && contextSwitch.route === 'reports',
  'Switching a game from Reports changes the canonical active game and stays on Reports', JSON.stringify(contextSwitch));
r = await page.evaluate(async () => {
  await window.app.workspaceShell.show('reports');
  const store = window.app.storage.seasonStore, active = String(store.data.activeGameId);
  const game = store.data.games.find(entry => String(entry.id) === active);
  document.querySelector('#wsContextSwitch').click();
  await new Promise(resolve => setTimeout(resolve, 400));
  const row = document.querySelector(`[data-popover-item="game-${active}"] span`)?.textContent;
  const bar = document.querySelector('#wsContextGame')?.textContent;
  const mobile = document.querySelector('#wsMobileContext')?.textContent;
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
  // The canonical rule every other surface uses. The context bar used to run a
  // second rule that preferred the raw stored `game.name`.
  return { canonical: store.gameName(game, store.data.games.indexOf(game)), row, bar, mobile, stored: game.name };
});
ok(r.row === r.canonical && r.bar === r.canonical && r.mobile === r.canonical,
  'The context bar, the mobile context and the switcher all name a game with the one canonical rule', JSON.stringify(r));
ok(contextSwitch.tabAfter === contextSwitch.tabBefore && contextSwitch.tabBefore && /Tigers|Rivals/.test(contextSwitch.context || '') && contextSwitch.focus === 'wsContextSwitch' && contextSwitch.expanded === 'false' && !contextSwitch.overflow,
  'The switch preserves the open report view, updates the context label, and returns focus to the switcher', JSON.stringify(contextSwitch));

console.log('\n== S6-4b UX-4: shell palette resolves and stays legible ==');
r = await page.evaluate(() => {
  const styles = getComputedStyle(document.documentElement);
  const roles = ['--ws-ink', '--ws-nav', '--ws-surface', '--ws-field', '--ws-raised', '--ws-hover', '--ws-active',
    '--ws-line', '--ws-line-strong', '--ws-text', '--ws-text-soft', '--ws-muted', '--ws-blue', '--ws-green',
    '--ws-amber', '--ws-red', '--ws-sel', '--ws-sel-line', '--ws-sel-text', '--ws-warn-surface'];
  const resolved = Object.fromEntries(roles.map(role => [role, styles.getPropertyValue(role).trim()]));
  const rgb = value => {
    const probe = document.createElement('span');
    probe.style.color = value; document.body.appendChild(probe);
    const parsed = getComputedStyle(probe).color.match(/[\d.]+/g).slice(0, 3).map(Number);
    probe.remove(); return parsed;
  };
  const luminance = channels => {
    const linear = channels.map(channel => { const s = channel / 255; return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4; });
    return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
  };
  const ratio = (a, b) => { const [x, y] = [luminance(rgb(a)), luminance(rgb(b))].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
  const pairs = {
    'text on ink': ratio(resolved['--ws-text'], resolved['--ws-ink']),
    'text on nav': ratio(resolved['--ws-text'], resolved['--ws-nav']),
    'muted on nav': ratio(resolved['--ws-muted'], resolved['--ws-nav']),
    'muted on raised': ratio(resolved['--ws-muted'], resolved['--ws-raised']),
    'selected label on selected surface': ratio(resolved['--ws-sel-text'], resolved['--ws-sel']),
  };
  return { resolved, pairs, unresolved: roles.filter(role => !resolved[role]) };
});
ok(r.unresolved.length === 0 && Object.values(r.resolved).every(value => /^(#|rgb)/.test(value)),
  'Every shell colour role resolves to a real value through the design-system tokens', JSON.stringify(r.unresolved));
ok(Object.values(r.pairs).every(value => value >= 4.5),
  'Shell text stays at or above WCAG AA contrast on every surface it sits on', JSON.stringify(r.pairs));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
