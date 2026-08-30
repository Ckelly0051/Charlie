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
  // S7 demolition: #app/#wsClassicOutlet are deleted. Final Engine
  // Independence deletes #giLegacyEngineHost too -- there is no legacy host
  // sibling left at all. #giMediaHost (the permanent, accepted native-owned
  // video/canvas/transport host) remains the one thing that lives outside
  // the shell root.
  legacyHostGone: !document.getElementById('giLegacyEngineHost') && !document.getElementById('app'),
  mediaHostPresent: !!document.getElementById('giMediaHost'),
  breakdownDisabled: document.querySelector('[data-ws-route="breakdown"]')?.disabled,
  reportsDisabled: [...document.querySelectorAll('[data-ws-route="reports"]')].every(button => button.disabled),
  // V2-A: Home has no dedicated season-less resume button -- Team Hub owns
  // first-run setup (already proven by `hub` above) and Home's persistent
  // header actions (Team & Film Settings / + Add game) are what keep an
  // empty Home from reading as dead.
  emptyAction: document.querySelector('[data-ws-action="new-game"]')?.textContent,
  emptyActionEnabled: !document.querySelector('[data-ws-action="new-game"]')?.disabled,
  emptyActionTarget: document.querySelector('[data-ws-action="new-game"]')?.dataset.wsAction,
}));
ok(r.shell && r.active && r.hub && r.legacyHostGone && r.mediaHostPresent, 'Shell mounts with the native Team Hub as its single front door and no legacy host anywhere', JSON.stringify(r));

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
  const zones = ['.ws-topbar', '.ws-top-nav', '.ws-mobile-head', '.ws-mobile-nav', '.ws-home-head', '.ws-contextbar'];
  const hits = [];
  zones.forEach(sel => document.querySelectorAll(sel).forEach(z => {
    const t = (z.textContent || '').replace(/\s+/g, ' ').trim();
    if (bad.test(t)) hits.push({ zone: sel, text: t.slice(0, 90) });
  }));
  return {
    hits,
    navLabels: [...document.querySelectorAll('.ws-top-nav [data-ws-route]')].map(b => (b.textContent || '').trim()),
    // The icon <span> specifically, so "has a REAL icon" can be checked rather
    // than merely "has no undefined" — the fallback glyph satisfies the latter.
    navIcons: [...document.querySelectorAll('.ws-top-nav [data-ws-route] span')].map(s => (s.textContent || '').trim()),
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
ok(r.breakdownDisabled && r.reportsDisabled, 'Guarded routes, including Reports, start disabled with no season');
ok(r.emptyAction === '+ Add game' && r.emptyActionEnabled && r.emptyActionTarget === 'new-game',
  'Empty Home offers an enabled primary action instead of appearing dead', JSON.stringify(r));

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
  season: document.querySelector('#wsCtxSeasonValue')?.textContent,
  continueDisabled: document.querySelector('#wsContinueCharting')?.disabled,
  gameRows: document.querySelectorAll('.ws-game-row').length,
  filmStatus: document.querySelector('[data-film-health] strong')?.textContent,
  filmClass: document.querySelector('[data-film-health] strong')?.className,
  summary: document.querySelector('#wsHomeSummary')?.textContent,
}));
ok(/Rivals/.test(r.title) && /2026 Varsity/.test(r.season) && !r.continueDisabled, 'Home renders live season/game context and an enabled Continue command', JSON.stringify(r));
ok(r.gameRows === 2, 'Home renders every game in the active season', JSON.stringify(r));
ok(r.filmStatus && !/^(.*?) · \1$/.test(r.filmStatus), 'Film status does not repeat an empty-state label', r.filmStatus);
ok(r.filmClass !== 'ws-fact-green', 'Unlinked film uses a neutral/warn indicator, not ready green', r.filmClass);
ok(/2 games/.test(r.summary), 'Home summary uses live game counts', r.summary);

await page.evaluate(() => {
  window.__openGameCalls = [];
  window.__openGameOrig = window.app.openGame.bind(window.app);
  window.app.openGame = id => { window.__openGameCalls.push(String(id)); return window.__openGameOrig(id); };
});
await page.click('[data-ws-preview="preview-game"]');
r = await page.evaluate(() => ({
  activeGameId: window.app.storage.seasonStore.data.activeGameId,
  previewId: window.app.workspaceShell._homeSelectedGameId,
  name: document.querySelector('#wsDetailName')?.textContent,
  meta: document.querySelector('#wsDetailMeta')?.textContent,
  us: document.querySelector('#wsDetailUsScore')?.textContent,
  them: document.querySelector('#wsDetailThemScore')?.textContent,
  plays: document.querySelector('#wsFactPlays')?.textContent,
  charted: document.querySelector('#wsFactCharted')?.textContent,
  phase: document.querySelector('#wsFactPhase')?.textContent,
  phaseRows: [...document.querySelectorAll('#wsPhaseRows .ws-phase-row')].map(row => row.textContent.trim()),
  continueText: document.querySelector('#wsContinueCharting')?.textContent,
  selected: document.querySelector('.ws-game-row.selected')?.dataset.gameId,
  pressed: document.querySelector('[data-ws-preview="preview-game"]')?.getAttribute('aria-pressed'),
}));
ok(r.previewId === 'preview-game' && r.activeGameId !== 'preview-game' && r.selected === 'preview-game' && r.pressed === 'true',
  'Selecting a Home game previews it without opening or changing the active editor game', JSON.stringify(r));
ok(/Knights/i.test(r.name) && /Sep/.test(r.meta) && /final/.test(r.meta) && r.us === '14' && r.them === '7',
  'Selected-game summary shows opponent, date, status, and score', JSON.stringify(r));
ok(r.plays === '3' && r.charted === '2 / 3' && r.phase === 'O 1 · D 1 · ST 1' && r.phaseRows.length === 3,
  'Selected-game summary shows total, canonical charted count, unit mix, and per-unit phase rows', JSON.stringify(r));
ok(r.continueText === 'Open selected game',
  'The previewed (non-active) game reads as an explicit open command, not a resume', JSON.stringify(r));
await page.click('#wsContinueCharting');
await new Promise(res => setTimeout(res, 400));
const openCalls = await page.evaluate(() => window.__openGameCalls);
ok(openCalls.length === 1 && openCalls[0] === 'preview-game',
  'Continue charting opens exactly the previewed game through the one canonical App.openGame command', JSON.stringify(openCalls));

// Restore the real App.openGame (the "Continue charting" proof above
// deliberately stubbed it to a single-argument shape to count calls, which
// would silently drop the {route} option any later caller passed) BEFORE
// exercising Open Study / Open Reports below.
await page.evaluate(() => { window.app.openGame = window.__openGameOrig; });

// V2-A: Open Study / Open Reports must act on the PREVIEWED game, not a
// stale already-active one (Codex review f1a90c2, finding 1). preview-game
// is active from the Continue Charting click above; switch active back to
// the OTHER game first, so re-previewing preview-game genuinely previews a
// non-active game and the assertion cannot pass by coincidence.
for (const [action, route] of [['open-study', 'study'], ['open-reports', 'reports']]) {
  await page.evaluate(async () => {
    const store = window.app.storage.seasonStore;
    const other = store.data.games.find(g => String(g.id) !== 'preview-game');
    if (other) store.setActive(other.id);
    await window.app.workspaceShell.show('home');
  });
  await page.click('[data-ws-preview="preview-game"]');
  await page.click(`[data-ws-action="${action}"]`);
  await new Promise(res => setTimeout(res, 400));
  const outcome = await page.evaluate(() => ({
    route: window.app.workspace.currentRoute(),
    activeGameId: window.app.storage.seasonStore.data.activeGameId,
  }));
  ok(outcome.route === route && outcome.activeGameId === 'preview-game',
    `${action} opens the PREVIEWED game (not the prior active one) and lands on ${route}`, JSON.stringify(outcome));
}

await page.evaluate(async () => {
  // Restore pre-click active-game state so a downstream test that assumes
  // 'preview-game' is not yet the active game (and exercises a genuine
  // switch, not the already-active fast path) is not left seeing it as
  // already open.
  const store = window.app.storage.seasonStore;
  const other = store.data.games.find(g => String(g.id) !== 'preview-game');
  if (other) store.setActive(other.id);
  await window.app.workspaceShell.show('home');
});
await capture('home-1280x800');
await page.setViewport({ width: 1440, height: 900 });
await capture('home-1440x900');
await page.setViewport({ width: 1280, height: 800 });

await page.click('.ws-top-nav [data-ws-route="breakdown"]');
r = await page.evaluate(() => ({
  dedicatedVisible: !document.querySelector('#wsBreakdown')?.hidden,
  // S7 demolition: #wsClassicOutlet is deleted. Absence is the assertion.
  classicHidden: !document.querySelector('#wsClassicOutlet'),
  homeHidden: document.querySelector('#wsHome')?.hidden,
  route: window.app.workspace.currentRoute(),
  videoOwners: document.querySelectorAll('#wsBreakdown #videoContainer').length,
  tagOwners: document.querySelectorAll('#wsBreakdown [data-native-tagging]').length,
  legacyChrome: document.querySelectorAll('#wsBreakdown .top-bar, #wsBreakdown .settings-drawer, #wsBreakdown #statsDashboard').length,
  sidebarAbsent: !document.querySelector('.ws-sidebar'),
  topNavDisplay: getComputedStyle(document.querySelector('.ws-top-nav')).display,
  mediaWidth: Math.round(document.querySelector('.gi-breakdown-theater-host').getBoundingClientRect().width),
}));
ok(r.dedicatedVisible && r.classicHidden && r.homeHidden && r.route === 'breakdown', 'Break Down opens its dedicated production route', JSON.stringify(r));
ok(r.videoOwners === 1 && r.tagOwners === 1 && r.legacyChrome === 0, 'Dedicated route has one canonical video/tag owner and no legacy app chrome', JSON.stringify(r));
ok(r.sidebarAbsent && r.topNavDisplay === 'flex' && r.mediaWidth >= 800, 'Desktop uses one compact top navigation, with the retired sidebar absent and film width restored', JSON.stringify(r));

r = await page.evaluate(() => ({
  settingsInShell: !!document.querySelector('.ws-global-tools [data-ws-tool="settings"]'),
  moreInShell: !!document.querySelector('.ws-top-actions #btnNativeMore'),
  settingsVisible: document.querySelector('[data-ws-tool="settings"]')?.offsetParent !== null,
  moreVisible: document.getElementById('btnNativeMore')?.offsetParent !== null,
  retiredOwnersAbsent: !document.getElementById('settingsDrawer') && !document.getElementById('drawerScrim'),
  filmPickersOutsideLegacy: ['projectFileInput','clipFileInput','repairFilmInput'].every(id => document.getElementById(id)?.parentElement === document.body),
}));
ok(r.settingsInShell && r.moreInShell && r.settingsVisible && r.moreVisible && r.retiredOwnersAbsent && r.filmPickersOutsideLegacy,
  'Compact shell keeps Settings and More visible while retired overlays stay absent and film pickers survive outside #app', JSON.stringify(r));

await page.click('[data-ws-tool="settings"]');
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

console.log('\n== Native Call Sheet builder ==');
await page.click('#btnNativeMore');
await page.waitForSelector('[data-popover-item="call-sheet"]');
await page.click('[data-popover-item="call-sheet"]');
await page.waitForSelector('[data-overlay-id="call-sheet-builder"] .gi-call-sheet');
await page.waitForSelector('[data-overlay-id="call-sheet-builder"] .gi-call-sheet-preview');
await capture('call-sheet-1280x800');
r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-overlay-id="call-sheet-builder"] .gi-call-sheet').length,
  legacyGone: !document.getElementById('callSheetModal') && !document.querySelector('.cs-overlay'),
  buckets: document.querySelectorAll('.gi-call-sheet-bucket').length,
  available: [...document.querySelectorAll('.gi-call-sheet-bucket output')].some(node => Number(node.textContent) > 0),
  preview: document.querySelector('.gi-call-sheet-preview')?.getAttribute('srcdoc') || '',
  modal: document.querySelector('[data-overlay-id="call-sheet-builder"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  popoverClosed: !document.querySelector('[role="menu"][aria-label="More actions"]'),
}));
ok(r.native === 1 && r.legacyGone && r.buckets === 13 && r.available && /Call Sheet/.test(r.preview)
    && r.modal === 'true' && r.popoverClosed,
  'Call Sheet opens as one native modal with live football data and no legacy DOM owner', JSON.stringify({ ...r, preview: r.preview.length }));
await page.evaluate(() => {
  const input = document.querySelector('.gi-call-sheet-field.is-title input');
  input.value = '<img src=x onerror=alert(1)> Rival';
  input.dispatchEvent(new Event('input', { bubbles: true }));
  window.__callSheetPrint = [];
  window.__callSheetOriginalPrint = window.app.callSheet.printDocument;
  window.app.callSheet.printDocument = html => { window.__callSheetPrint.push(html); return true; };
});
await page.waitForFunction(() => /&lt;img src=x onerror=alert\(1\)&gt; Rival/.test(document.querySelector('.gi-call-sheet-preview')?.getAttribute('srcdoc') || ''));
await page.click('.gi-call-sheet-print');
await page.waitForFunction(() => window.__callSheetPrint?.length === 1);
r = await page.evaluate(() => {
  const printed = window.__callSheetPrint[0];
  window.app.callSheet.printDocument = window.__callSheetOriginalPrint;
  delete window.__callSheetOriginalPrint;
  delete window.__callSheetPrint;
  window.app.callSheet.hide('test-complete');
  return {
    escaped: printed.includes('&lt;img src=x onerror=alert(1)&gt; Rival'),
    rawAbsent: !printed.includes('<img src=x onerror=alert(1)>'),
  };
});
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="call-sheet-builder"]'));
await page.waitForFunction(() => document.activeElement?.id === 'btnNativeMore');
ok(r.escaped && r.rawAbsent,
  'Call Sheet live preview and Print share the escaped canonical document, then return focus to More', JSON.stringify(r));
/* Final Engine Independence: undo/redo/shortcuts/the CV-server badge used to
   be entombed inside the permanently hidden classic top bar
   (#wsClassicOutlet, then #giLegacyEngineHost -- both since deleted). Undo,
   Redo, Shortcuts and Settings are now real native buttons WorkspaceShell
   itself renders and wires directly into `.ws-global-tools` (data-ws-tool
   attributes, no adopt/relocate mechanism, no #btn*Action ids at all).

   Reachability is measured as "its box actually lands inside the viewport",
   NOT `offsetParent !== null` or a non-zero rect: a closed sliding drawer/
   sheet still reports a laid-out, non-zero box, and both weaker checks would
   score its contents as reachable. That exact false positive is what an
   earlier draft of this test produced. */
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
  undo: await onScreen('[data-ws-tool="undo"]'),
  redo: await onScreen('[data-ws-tool="redo"]'),
  shortcuts: await onScreen('[data-ws-tool="shortcuts"]'),
  settings: await onScreen('[data-ws-tool="settings"]'),
  inTools: await page.evaluate(() => ['undo', 'redo', 'shortcuts', 'settings']
    .every(key => !!document.querySelector(`[data-ws-tool="${key}"]`)?.closest('.ws-global-tools'))),
  order: await page.evaluate(() => [...document.querySelector('.ws-global-tools').children]
    .map(el => el.dataset.wsTool || '')),
  legacyGone: await page.evaluate(() => !document.getElementById('giLegacyEngineHost')
    && !document.getElementById('btnUndoAction') && !document.getElementById('btnRedoAction')
    && !document.getElementById('btnShortcuts') && !document.getElementById('btnSidebarToggle')
    && !document.getElementById('backendStatusBadge')),
};
ok(r.undo && r.redo && r.shortcuts && r.settings && r.inTools
  && r.order.join(',') === 'undo,redo,shortcuts,settings' && r.legacyGone,
  'Undo, Redo, Shortcuts and Settings are the shell\'s own native chrome -- no adopted/relocated legacy element exists anywhere', JSON.stringify(r));

// The native Undo button reflects history-manager state directly (no adopted
// DOM node, no .click() proxy). Proven by a real edit, not by asserting the
// node exists: a decorative button would look identical here.
r = await page.evaluate(() => {
  const app = window.app, history = app.history;
  history.reset();                                   // known-empty history baseline
  const before = document.querySelector('[data-ws-tool="undo"]')?.disabled;
  // A real product edit through the tagger's own API. NOT createWholeVideoPlay:
  // it early-returns when the game already has plays, so on a populated fixture
  // it silently no-ops and the assertion passes for the wrong reason.
  const play = app.tagger.plays[0] || app.tagger.createWholeVideoPlay(30, 'undo-probe');
  app.tagger.selectPlay(play.id);
  app.tagger.setUnit(play.tags?.unit === 'defense' ? 'offense' : 'defense');
  return {
    before,
    after: document.querySelector('[data-ws-tool="undo"]')?.disabled,
    entries: history?.stack?.length,
  };
});
ok(r.entries === 1 && r.before === true && r.after === false,
  'The native Undo button reflects history-manager state via its change subscription and enables on a real edit', JSON.stringify(r));

// Clicking the native Undo button genuinely calls history.undoAll() -- both
// disabled states flip, which a decorative click handler could not produce.
r = await page.evaluate(async () => {
  const undoBefore = document.querySelector('[data-ws-tool="undo"]')?.disabled;
  const redoBefore = document.querySelector('[data-ws-tool="redo"]')?.disabled;
  document.querySelector('[data-ws-tool="undo"]')?.click();
  await new Promise(res => setTimeout(res, 50));
  return {
    undoBefore, redoBefore,
    undoAfter: document.querySelector('[data-ws-tool="undo"]')?.disabled,
    redoAfter: document.querySelector('[data-ws-tool="redo"]')?.disabled,
  };
});
ok(r.undoBefore === false && r.redoBefore === true && r.undoAfter === true && r.redoAfter === false,
  'Clicking the native Undo button genuinely calls history.undoAll()', JSON.stringify(r));

// Optional analysis status belongs inside native Analysis, never in prime
// shell chrome, and there is no legacy status badge anywhere in the document.
await page.click('[data-ws-tool="settings"]');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
await page.click('[data-settings-tab="analysis"]');
await page.waitForSelector('[data-settings-panel="analysis"]');
r = await page.evaluate(() => ({
  legacyBadgeExists: !!document.getElementById('backendStatusBadge'),
  analysisStatus: document.querySelector('[data-settings-panel="analysis"] .gi-settings-status')?.textContent?.trim(),
}));
ok(!r.legacyBadgeExists && r.analysisStatus,
  'Optional analysis status lives only in Settings; no legacy status badge exists anywhere in the document', JSON.stringify(r));
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
  // V2-A: no per-row Open button -- previewing a Home row, then explicit
  // Continue Charting, is the one way to open a game.
  document.querySelector('[data-ws-preview="preview-game"]')?.click();
  document.getElementById('wsContinueCharting')?.click();
  await new Promise(resolve => setTimeout(resolve, 650));
  app.storage._loadActiveGame = originalLoad;
  app.workspaceShell.show = originalShow;
  return {
    loadCompleted,
    breakdownBeforeLoad,
    activeGameId: app.storage.seasonStore.data.activeGameId,
    route: app.workspace.currentRoute(),
    breakdownVisible: !document.getElementById('wsBreakdown')?.hidden,
    settingsVisible: document.querySelector('[data-ws-tool="settings"]')?.offsetParent !== null,
    moreVisible: document.getElementById('btnNativeMore')?.offsetParent !== null,
  };
});
ok(r.loadCompleted && !r.breakdownBeforeLoad && r.activeGameId === 'preview-game'
    && r.route === 'breakdown' && r.breakdownVisible && r.settingsVisible && r.moreVisible,
  'Delayed game switch finishes before Break Down renders and keeps Settings/More visible', JSON.stringify(r));

// C1 (binding amendment 2026-07-23): the legacy Season Library SCHEDULE is
// RETIRED as a game-entry surface. Home is the single place to open a game.
//
// S7-c DELETED the overlay that hosted it, so this no longer drives
// `library._open()` / `library.openSchedule()` and asserts they redirect —
// those functions do not exist. Both halves of the guarantee are kept:
//   1. the OUTCOME — opening a season through the canonical path lands on Home;
//   2. the ABSENCE of the retired surface. Hidden markup is what let this flow
//      resurface twice when an overlay revealed the classic outlet, so the
//      check is that it is gone, which cannot be un-hidden.
r = await page.evaluate(async () => {
  const app = window.app;
  const seasonId = app.storage.seasonStore.currentSeasonId;
  await app.openGame('preview-game');              // start in Break Down
  const beforeRoute = app.workspace.currentRoute();
  await app.teamHubScreen.openSeason(seasonId);    // the surviving native owner
  const afterOpen = {
    route: app.workspace.currentRoute(),
    homeVisible: !document.getElementById('wsHome')?.hidden,
  };
  return {
    beforeRoute, afterOpen,
    library: !!app.library,
    legacyNodes: ['libraryOverlay', 'libraryScheduleView', 'librarySeasonsView', 'scheduleBody']
      .filter(id => !!document.getElementById(id)),
  };
});
ok(r.beforeRoute === 'breakdown', 'Retirement precondition: openGame lands in Break Down', JSON.stringify(r));
ok(r.afterOpen.route === 'home' && r.afterOpen.homeVisible,
  'Retired route: opening a season lands on Home, never a legacy schedule grid', JSON.stringify(r.afterOpen));
ok(r.library === false && r.legacyNodes.length === 0,
  'Retired route: the legacy Season Library controller and its markup are absent, not hidden', JSON.stringify(r));

// Home must highlight the ACTUAL current game after a round trip — never the
// previously opened game (closeout item 2 / amendment proof item 3).
r = await page.evaluate(async () => {
  const app = window.app;
  const A = app.storage.seasonStore.data.games.find(g => g.id !== 'preview-game').id;
  const B = 'preview-game';
  const selectedOnHome = () => document.querySelector('.ws-game-row.selected')?.dataset.gameId;
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
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), study: !document.querySelector('#wsStudy')?.hidden, reportsHidden: document.querySelector('#wsReports')?.hidden, appHidden: !document.querySelector('#wsClassicOutlet') }));
ok(r.route === 'study' && r.study && r.reportsHidden && r.appHidden, 'Study opens the query workspace inside the persistent shell');

await page.click('[data-study-action="advanced"]');
r = await page.evaluate(() => ({ stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), appVisible: !!document.querySelector('#wsClassicOutlet') }));
ok(r.stats, 'Study keeps Advanced Reports one click away (now the Reports destination)', JSON.stringify(r));
// S1 REPORTS OWNERSHIP CONTRACT. The visible dashboard is created inside the
// Preact route, and StatsEngine's own dashboardEl points at exactly that node
// -- no fallback stand-in exists for it to be confused with.
r = await page.evaluate(() => ({
  nativeRoute: !!document.querySelector('#wsReports [data-native-reports]#statsDashboard'),
  nativeContent: !!document.querySelector('#wsReports [data-native-report-content] [data-native-main-report]'),
  legacyNotMoved: !document.querySelector('#wsReports #legacyStatsDashboard'),
  legacyControllerAbsent: !('dashboardEl' in window.app.stats) && !('showDashboard' in window.app.stats),
  mainActions: document.querySelectorAll('#wsReports [data-rp-action]').length,
  tabs: document.querySelectorAll('#wsReports [data-report-tab]').length,
}));
ok(r.nativeRoute && r.nativeContent && r.legacyNotMoved && r.legacyControllerAbsent && r.mainActions === 2 && r.tabs === 8,
  'Native Reports owns its route and actions with no StatsEngine presentation controller', JSON.stringify(r));
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
r = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const states = [];
  for (const tab of ['selfscout', 'defense']) {
    screen.show();
    screen.selectTab(tab);
    states.push({ tab, native: !!screen.content.querySelector(`[data-pane="${tab}"]`) });
  }
  screen.scoutOpponent(window.app.stats._activeOpponent());
  states.push({ tab: 'opponent', native: screen.perspective === 'opponent' && !!screen.content.querySelector('[data-native-main-report]') });
  screen.show();
  return states;
});
ok(r.every(state => state.native),
  'Self-scout, Defense, and Opponent Scout are native report states, not specialized StatsEngine overlays', JSON.stringify(r));await page.evaluate(() => window.app.reportsScreen.show());
const reportsLibrary = await page.evaluate(async () => {
  const shell = window.app.workspaceShell;
  await shell._openLibrary();
  const whileOpen = {
    reportsHidden: document.getElementById('wsReports').hidden,
    hubVisible: !document.getElementById('wsTeamHub').hidden,
    // S7 demolition: #wsClassicOutlet is deleted — absence IS "never visible".
    outletVisible: !!document.getElementById('wsClassicOutlet'),
  };
  await shell.closeTeamHub();
  await new Promise(resolve => setTimeout(resolve, 0));
  return {
    whileOpen,
    after: {
      reportsVisible: !document.getElementById('wsReports').hidden,
      outletHidden: !document.getElementById('wsClassicOutlet'),
    },
  };
});
ok(reportsLibrary.whileOpen.reportsHidden && reportsLibrary.whileOpen.hubVisible && !reportsLibrary.whileOpen.outletVisible
  && reportsLibrary.after.reportsVisible && reportsLibrary.after.outletHidden,
  'Opening and backing out of native Team Hub from Reports restores exactly the Reports route', JSON.stringify(reportsLibrary));await page.click('.ws-top-nav [data-ws-route="study"]');

await page.click('.ws-top-nav [data-ws-route="plan"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), plan: !document.querySelector('#wsPlan')?.hidden, appHidden: !document.querySelector('#wsClassicOutlet'), text: document.querySelector('#wsPlan')?.textContent || '' }));
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
  // S7 demolition: #wsClassicOutlet is deleted. Absence is the assertion —
  // there is no element left to reveal.
  const outletHidden = () => !document.getElementById('wsClassicOutlet');
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
  await shell.show('breakdown');
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
// lifecycle hygiene). It is not reachable from any product affordance.
//
// S7-d2: the media subtree no longer returns to #app, because it now has a
// PERMANENT home outside it. The guarantee is unchanged — teardown parks every
// adopted surface with exactly one owner, so re-enable cannot leak into a
// detached tree — so it is asserted against the permanent host instead of
// being dropped.
await page.evaluate(async () => {
  await window.app.workspaceShell.show('study');
  window.app.studyScreen._openPlanPicker([{
    id: 'lifecycle',
    label: 'Lifecycle finding',
    refs: ['preview-game::1'],
    item: { kind: 'finding', label: 'Lifecycle finding', refs: ['preview-game::1'] },
  }]);
  await new Promise(resolve => requestAnimationFrame(resolve));
});
r = await page.evaluate(() => {
  const study = window.app.studyScreen;
  const dialog = document.querySelector('.ws-plan-picker');
  const pickerWasOpen = !!dialog?.open;
  window.app.workspaceShell.disable();
  // The permanent media host's real structure since the media-cascade
  // ownership work (css/media-foundation.css) is #giMediaHost > #videoContainer
  // (class "video-container") -- the legacy ".video-section" class this
  // assertion was written against no longer exists anywhere in the app.
  const media = document.querySelector('#giMediaHost #videoContainer');
  return {
    studyClean: pickerWasOpen && !dialog.open && study.host === null && study._native === null
      && study._nativeMount === null && study._planPicker === null && study._pendingPlanItems.length === 0,
    // S7 demolition: #app is gone. The tagging/Film-Room backing stores'
    // permanent, original home is #giLegacyEngineHost — teardown must return
    // adopted chrome there, not to a container that no longer exists.
    restored: media != null
      && !media.closest('#giLegacyEngineHost')
      && document.querySelectorAll('#videoContainer').length === 1
      // Final Engine Independence: .tag-section AND #playGridSection are
      // both deleted entirely, not adopted/relocated -- there is no backing
      // store to return to on teardown any more. Absence is the assertion
      // now (same "S7 demolition" pattern already applied to
      // #wsClassicOutlet above).
      && document.querySelector('#playGridSection') == null
      && document.querySelector('.tag-section') == null,
    // Final Engine Independence: Undo/Redo/Shortcuts/Settings are the
    // shell's OWN native buttons rendered inside .ws-global-tools -- there is
    // no adopted legacy element to "restore". disable() removes this.root
    // (and every native chrome button with it), and #giLegacyEngineHost does
    // not exist in the document at all any more.
    chromeGone: !document.querySelector('[data-ws-tool]') && !document.getElementById('giLegacyEngineHost'),
  };
});
ok(r.restored && r.chromeGone, 'disable() (internal teardown) parks media in its permanent host and leaves no native chrome or legacy host behind', JSON.stringify(r));
ok(r.studyClean, 'disable() unmounts native Study, closes its modal, and clears every detached-host bridge', JSON.stringify(r));

await page.setViewport({ width: 768, height: 1024 });
await page.evaluate(() => window.app.workspaceShell.enable());

// mount -> restore -> mount. disable() is asserted above and enable() right
// here, but nothing re-checked that the shell's own chrome buttons come back
// on the second mount with exactly one owner each and a live history
// subscription -- leaving a duplicated button set or a leaked subscription
// after a lifecycle cycle, with every other assertion still green.
r = await page.evaluate(() => ({
  toolsPresent: ['undo', 'redo', 'shortcuts', 'settings']
    .every(key => document.querySelectorAll(`[data-ws-tool="${key}"]`).length === 1),
  inTools: !!document.querySelector('[data-ws-tool="undo"]')?.closest('.ws-global-tools'),
  optionalStatusNotPrime: !document.getElementById('backendStatusBadge'),
  nativeMoreRebuilt: !!document.querySelector('.ws-top-actions #btnNativeMore'),
}));
ok(r.toolsPresent && r.inTools && r.optionalStatusNotPrime && r.nativeMoreRebuilt,
  'Re-enabling rebuilds shell chrome exactly once, with no leftover legacy status badge', JSON.stringify(r));

// The history subscription from the FIRST mount must not still be live --
// otherwise an undo/redo state change on this (second) mount would double-
// fire _syncHistoryButtons via two live subscriptions. Every one of history's
// registered listeners calls this.[_syncHistoryButtons] on the SAME shell
// instance, so overriding it once catches a leaked duplicate from either
// mount, not just the current one.
r = await page.evaluate(() => {
  const shell = window.app.workspaceShell;
  let fired = 0;
  const real = shell._syncHistoryButtons.bind(shell);
  shell._syncHistoryButtons = (...args) => { fired++; real(...args); };
  window.app.history._updateUI();
  shell._syncHistoryButtons = real;
  return { fired };
});
ok(r.fired === 1, 'The history change subscription fires exactly once after a disable/enable cycle -- no leaked duplicate subscription', JSON.stringify(r));
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
  sidebarAbsent: !document.querySelector('.ws-sidebar'),
  bottomTabs: document.querySelector('.bottom-tabs') ? getComputedStyle(document.querySelector('.bottom-tabs')).display : 'absent',
}));
ok(!r.overflow && r.mobileHeader && r.sidebarAbsent && r.bottomTabs === 'absent', 'Mobile Home has no overflow and hides classic navigation', JSON.stringify(r));
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

  // V2-A: per-unit progress moved from a standalone Home widget into the
  // selected-game detail panel's #wsPhaseRows (bar-encoded pct, not a
  // rendered N/M fraction), and the single game here is auto-selected.
  const rows = [...document.querySelectorAll('#wsPhaseRows .ws-phase-row')].map(row => ({
    short: row.querySelector('b')?.textContent,
    total: row.querySelector('span:last-child')?.textContent,
    width: row.querySelector('.ws-bar i')?.style.width,
  }));
  const factCharted = document.getElementById('wsFactCharted')?.textContent || '';
  return { canon, rows, factCharted,
    expected: [canon.offense[1], canon.defense[1], canon.special[1]],
    summedTagged: canon.offense[0] + canon.defense[0] + canon.special[0],
    summedTotal: canon.offense[1] + canon.defense[1] + canon.special[1] };
});
ok(r.rows.length === 3 && Number(r.rows[0].total) === r.expected[0] && Number(r.rows[1].total) === r.expected[1] && Number(r.rows[2].total) === r.expected[2],
  'Home shows charting progress per unit matching the canonical play data', JSON.stringify(r));
ok(r.factCharted === `${r.summedTagged} / ${r.summedTotal}`,
  'Per-unit charted counts sum to the selected-game charted figure', JSON.stringify(r));
ok(r.rows[2].total === '0' && r.rows[2].width === '0%',
  'A unit with no plays reads a real zero rather than a fabricated percentage', JSON.stringify(r.rows[2]));

// Film source: a managed copy and a linked external folder must never read
// identically -- that ambiguity is exactly what made the 1.12.0-8 smoke
// unprovable (P0_CRITICAL id home.film-source). V2-A's Home no longer shows
// the resolved absolute path for a linked folder (that detail lives in Team
// & Film Settings, disclosed as a deviation from the pre-V2-A "film inbox"),
// but it still discloses linked-vs-managed by name, and never claims
// readiness it hasn't confirmed.
r = await page.evaluate(async () => {
  const app = window.app;
  const real = app.workspace.filmHealth.bind(app.workspace);
  app.workspace.filmHealth = async () => ({ state: 'linked', label: 'Linked film ready', ready: true,
    persistent: true, mode: 'linked', expected: 3, found: 3, missing: 0, progress: null,
    action: 'open', detail: '', path: 'D:\\Football\\Film\\Holy Family' });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));
  const linkedText = document.getElementById('wsFactFilm')?.textContent || '';
  const linkedClass = document.getElementById('wsFactFilm')?.className || '';
  app.workspace.filmHealth = async () => ({ state: 'managed', label: 'Managed film ready', ready: true,
    persistent: true, mode: 'managed', expected: 3, found: 3, missing: 0, progress: null,
    action: 'open', detail: '', path: '' });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));
  const managedText = document.getElementById('wsFactFilm')?.textContent || '';
  app.workspace.filmHealth = async () => ({ state: 'missing', label: 'Film needed', ready: false,
    persistent: false, mode: 'managed', expected: 3, found: 0, missing: 3, progress: null,
    action: 'repair', detail: '', path: '' });
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 700));
  const missingText = document.getElementById('wsFactFilm')?.textContent || '';
  const missingClass = document.getElementById('wsFactFilm')?.className || '';
  app.workspace.filmHealth = real;
  return { linkedText, linkedClass, managedText, missingText, missingClass };
});
ok(/3 clips/.test(r.linkedText) && /3 clips/.test(r.managedText) && r.linkedClass === 'ws-fact-green',
  'Ready film reports its clip count with a positive indicator', JSON.stringify(r));
ok(r.linkedText !== r.managedText && /linked/i.test(r.linkedText) && /managed/i.test(r.managedText),
  'A managed copy and a linked folder never read identically -- the exact ambiguity that made a prior smoke unprovable', JSON.stringify(r));
ok(/Film needed/.test(r.missingText) && r.missingClass !== 'ws-fact-green',
  'Missing film states its own label rather than a fabricated ready state', JSON.stringify(r));

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
    const button = document.querySelector('#wsCtxGame');
    const rect = button?.getBoundingClientRect();
    out[route] = { tag: button?.tagName, menu: button?.getAttribute('aria-haspopup'),
      onScreen: !!rect && rect.width > 0 && rect.height > 0 && rect.top >= 0 && rect.right <= document.documentElement.clientWidth };
  }
  return out;
});
ok(Object.values(r).every(entry => entry.tag === 'BUTTON' && entry.menu === 'menu' && entry.onScreen),
  'Game context is a real switcher on every route, not a Home-only round trip', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await page.click('#wsCtxGame');
await page.waitForSelector('.gi-popover-item', { timeout: 5000 });
// The popover moves initial focus on a requestAnimationFrame, so the items
// existing does not mean focus has landed. Measuring straight after the
// selector resolved was a race that reported `focused: undefined` roughly one
// run in ten. Wait for the condition the assertion is about.
await page.waitForFunction(
  () => !!document.activeElement?.closest?.('.gi-popover-panel'),
  { timeout: 5000 },
);
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
    expanded: document.querySelector('#wsCtxGame')?.getAttribute('aria-expanded'),
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
    context: document.querySelector('#wsCtxGameValue')?.textContent,
    focus: document.activeElement?.id, expanded: document.querySelector('#wsCtxGame')?.getAttribute('aria-expanded'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth };
});
ok(contextSwitch.after === contextSwitch.target && contextSwitch.after !== contextSwitch.before && contextSwitch.route === 'reports',
  'Switching a game from Reports changes the canonical active game and stays on Reports', JSON.stringify(contextSwitch));
r = await page.evaluate(async () => {
  await window.app.workspaceShell.show('reports');
  const store = window.app.storage.seasonStore, active = String(store.data.activeGameId);
  const game = store.data.games.find(entry => String(entry.id) === active);
  document.querySelector('#wsCtxGame').click();
  await new Promise(resolve => setTimeout(resolve, 400));
  const row = document.querySelector(`[data-popover-item="game-${active}"] span`)?.textContent;
  const bar = document.querySelector('#wsCtxGameValue')?.textContent;
  const mobile = document.querySelector('#wsMobileContext')?.textContent;
  document.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  await new Promise(resolve => setTimeout(resolve, 200));
  // The canonical rule every other surface uses. The context bar used to run a
  // second rule that preferred the raw stored `game.name`.
  return { canonical: store.gameName(game, store.data.games.indexOf(game)), row, bar, mobile, stored: game.name };
});
ok(r.row === r.canonical && r.bar === r.canonical && r.mobile === r.canonical,
  'The context bar, the mobile context and the switcher all name a game with the one canonical rule', JSON.stringify(r));
ok(contextSwitch.tabAfter === contextSwitch.tabBefore && contextSwitch.tabBefore && /Tigers|Rivals/.test(contextSwitch.context || '') && contextSwitch.focus === 'wsCtxGame' && contextSwitch.expanded === 'false' && !contextSwitch.overflow,
  'The switch preserves the open report view, updates the context label, and returns focus to the switcher', JSON.stringify(contextSwitch));

console.log('\n== V2-A: universal season switcher lands on the new season\'s Home ==');
// A second season for this team, so the switch is observable and req #3
// (season switching from any route lands safely on that season's Home with
// stale game context cleared) can be proven directly rather than inferred.
r = await page.evaluate(async () => {
  const app = window.app;
  const before = { seasonId: app.storage.seasonStore.currentSeasonId, route: 'reports' };
  await app.workspaceShell.show('study');
  const rec = await app.storage.createSeason({ name: '2027 JV', team: 'Mavericks', year: '2027', level: 'JV' });
  // createSeason opens the new season immediately (its own real flow) --
  // reopen the original season first so the switcher itself is what's tested.
  await app.storage.openSeasonById(before.seasonId);
  await app.workspaceShell.show('study');
  const staleGame = document.querySelector('#wsCtxGameValue')?.textContent;
  await app.workspaceShell._openSeasonSwitch(document.getElementById('wsCtxSeason'));
  await new Promise(res => setTimeout(res, 250));
  const rows = [...document.querySelectorAll('.gi-popover-item')].filter(b => /2027 JV/.test(b.textContent || ''));
  rows[0]?.click();
  await new Promise(res => setTimeout(res, 400));
  return {
    route: app.workspace.currentRoute(),
    seasonId: app.storage.seasonStore.currentSeasonId,
    targetId: rec.id,
    season: document.querySelector('#wsCtxSeasonValue')?.textContent,
    game: document.querySelector('#wsCtxGameValue')?.textContent,
    staleGame,
    gameRows: document.querySelectorAll('.ws-game-row').length,
    homeVisible: !document.getElementById('wsHome')?.hidden,
  };
});
ok(r.route === 'home' && r.homeVisible && String(r.seasonId) === String(r.targetId),
  'Switching seasons from a non-Home route lands on the new season\'s Home', JSON.stringify(r));
ok(/2027 JV/.test(r.season) && r.gameRows === 1,
  'Home reflects the new season\'s own name and game list', JSON.stringify(r));
ok(r.game !== r.staleGame,
  'The prior season\'s game context does not leak into the newly opened season', JSON.stringify(r));

// V2-A: a Home-to-Home season switch (route unchanged throughout) previously
// left the OLD season's preview id in place, so a game id collision between
// seasons could carry a stale preview across (Codex review f1a90c2, finding
// 3). Build two seasons whose games deliberately share the literal id
// 'preview-game' and prove the destination season's OWN active game is
// shown, not the source season's stale preview riding through on the id
// match.
r = await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore;
  const recA = await app.storage.createSeason({ name: 'Collision A', team: 'Mavericks', year: '2028' });
  store.data.games = [{ id: 'preview-game', name: '', status: 'active', gameInfo: { opponent: 'Season A Opponent' }, plays: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false }];
  store.data.activeGameId = 'preview-game';
  await store.persist();
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 300));
  document.querySelector('.ws-game-row')?.click();
  const previewedBefore = app.workspaceShell._homeSelectedGameId;
  // The colliding id ('preview-game') is deliberately NOT season B's active
  // game -- a stale, uncleared preview id would match this WRONG row by
  // coincidence; only a genuinely cleared preview correctly falls through to
  // B's real active game ('b-active'). If the two resolved to the same
  // content the test could pass even with the bug present.
  const recB = await app.storage.createSeason({ name: 'Collision B', team: 'Mavericks', year: '2029' });
  store.data.games = [
    { id: 'preview-game', name: '', status: 'active', gameInfo: { opponent: 'Wrong Match B' }, plays: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false },
    { id: 'b-active', name: '', status: 'active', gameInfo: { opponent: 'Season B Opponent' }, plays: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false },
  ];
  store.data.activeGameId = 'b-active';
  await store.persist();
  await app.storage.openSeasonById(recA.id);
  // Already on Home before the switch -- the exact Home-to-Home case the
  // finding named, where `show()`'s own previousRoute!=='home' guard cannot
  // fire because the route never changes.
  await app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 200));
  await app.workspaceShell._openSeasonSwitch(document.getElementById('wsCtxSeason'));
  await new Promise(res => setTimeout(res, 250));
  const row = [...document.querySelectorAll('.gi-popover-item')].find(b => /Collision B/.test(b.textContent || ''));
  row?.click();
  await new Promise(res => setTimeout(res, 400));
  return {
    previewedBefore,
    seasonId: store.currentSeasonId, targetId: recB.id,
    homeSelected: app.workspaceShell._homeSelectedGameId,
    detailName: document.getElementById('wsDetailName')?.textContent,
  };
});
ok(r.previewedBefore === 'preview-game' && String(r.seasonId) === String(r.targetId),
  'setup: a game was previewed in season A before a Home-to-Home switch to season B', JSON.stringify(r));
ok(/Season B Opponent/i.test(r.detailName || ''),
  'A colliding game id across seasons does not carry season A\'s stale preview into season B\'s Home', JSON.stringify(r));

console.log('\n== V2-B closeout: Season selector exposes the full Season Library ==');
r = await page.evaluate(async () => {
  const app = window.app;
  await app.workspaceShell.show('reports');
  await app.workspaceShell._openSeasonSwitch(document.getElementById('wsCtxSeason'));
  await new Promise(res => setTimeout(res, 150));
  const item = document.querySelector('[data-popover-item="season-library"]');
  const label = item?.textContent?.trim() || '';
  item?.click();
  await new Promise(res => setTimeout(res, 300));
  return {
    label,
    route: document.getElementById('workspaceShell')?.dataset.route,
    hubVisible: !document.getElementById('wsTeamHub')?.hidden,
    nativeHub: !!document.querySelector('#wsTeamHub [data-native-team-hub]'),
  };
});
ok(r.label.includes('Season Library'),
  'The universal Season selector names the full Season Library explicitly', JSON.stringify(r));
ok(r.route === 'team-hub' && r.hubVisible && r.nativeHub,
  'Season Library opens the existing native Team Hub instead of a second navigation path', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.closeTeamHub());
await new Promise(res => setTimeout(res, 200));

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
