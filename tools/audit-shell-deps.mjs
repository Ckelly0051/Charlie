/* SHELL INDEPENDENCE — measured dependency inventory.
   With the shell mounted and a game open, enumerate what still lives inside the
   legacy #app subtree, which route hosts hold RELOCATED legacy nodes vs native
   markup, and what the outlet is still load-bearing for. */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { readFile, readdir } from 'node:fs/promises';
import { resolve } from 'node:path';
import puppeteer from 'puppeteer';
const URL = TEST_APP_URL;

// A stylesheet that is not reachable from the Vite entry is dead in the
// product, however correct it looks in isolation. This exact drift blanked
// Reports in the 1.12.0-13 installed smoke.
const root = resolve(import.meta.dirname, '..');
const cssFiles = (await readdir(resolve(root, 'css'))).filter(name => name.endsWith('.css'));
const jsFiles = (await readdir(resolve(root, 'js'))).filter(name => /\.(?:js|jsx)$/.test(name));
const viteSources = [
  await readFile(resolve(root, 'index.html'), 'utf8'),
  ...await Promise.all(jsFiles.map(name => readFile(resolve(root, 'js', name), 'utf8'))),
].join('\n');
const deadStylesheets = cssFiles.filter(name => !viteSources.includes(`css/${name}`));
if (deadStylesheets.length) {
  throw new Error(`CSS unreachable from the Vite product: ${deadStylesheets.join(', ')}`);
}
console.log(`Vite stylesheet ownership: ${cssFiles.length}/${cssFiles.length} reachable`);
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 700));
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'S', team: 'M', year: '2026', level: 'V' });
  app.storage.seasonStore.data.games = [{ id: 'g1', name: 'W1', plays: [], gameInfo: {}, annotations: {}, nextId: 1 }];
  app.storage.seasonStore.data.activeGameId = 'g1';
  await app.openGame('g1');
});
await new Promise(r => setTimeout(r, 800));
await page.evaluate(() => { window.app.toggleShortcuts(true); });
await page.waitForSelector('[data-overlay-id="keyboard-shortcuts"]');

const out = await page.evaluate(() => {
  const res = {};
  const appEl = document.getElementById('app');
  res.appInsideOutlet = !!appEl?.closest('#wsClassicOutlet');

  // Top-level children still living in the legacy #app subtree.
  res.appChildren = [...(appEl?.children || [])].map(c =>
    (c.id ? '#' + c.id : '.' + (c.className || '').toString().split(' ')[0]) +
    `  [${c.children.length} kids]`);

  // Every element with an id that is still inside #app (the migration surface).
  res.idsStillInApp = [...(appEl?.querySelectorAll('[id]') || [])].map(e => e.id).length;

  // Route hosts: native markup vs relocated legacy nodes. These are two
  // DIFFERENT things and must not share one bucket: #statsDashboard under
  // #wsReports is the live, native-owned Reports section (native-reports.jsx
  // renders it directly, carrying data-native-reports) -- it is the intended,
  // provable single owner, not residue. #statsDashboard appearing under any
  // OTHER route (study/plan) would still be a real leak and stays flagged as
  // relocatedLegacy there.
  const hostInfo = (sel, legacySelectors, nativeOwnedSelectors = []) => {
    const host = document.querySelector(sel);
    if (!host) return 'ABSENT';
    const relocated = legacySelectors.filter(s => !!host.querySelector(s));
    const nativeOwned = nativeOwnedSelectors.filter(s => !!host.querySelector(s));
    return { children: host.children.length, relocatedLegacy: relocated, nativeOwned };
  };
  res.routes = {
    home:      hostInfo('#wsHome', []),
    breakdown: hostInfo('#wsBreakdown', ['.video-section', '.tag-section']),
    study:     hostInfo('#wsStudy', ['#statsDashboard', '.video-section']),
    reports:   hostInfo('#wsReports', [], ['[data-native-reports]#statsDashboard']),
    plan:      hostInfo('#wsPlan', ['#statsDashboard']),
  };

  // Overlays / modals — where do they actually live?
  const where = id => {
    const e = document.getElementById(id);
    if (!e) return 'absent';
    if (e.closest('#wsClassicOutlet')) return 'INSIDE #app (legacy outlet)';
    if (e.parentElement === document.body) return 'body';
    return 'in ' + (e.parentElement?.id || e.parentElement?.className || '?');
  };
  res.overlays = {
    libraryOverlay: where('libraryOverlay'),
    statsDashboard: where('statsDashboard'),
    nativeShortcuts: document.querySelector('[data-overlay-id="keyboard-shortcuts"]')?.closest('#giNativeRoot') ? 'native root' : 'absent',
    settingsDrawer: where('settingsDrawer'),
    legacyGameModal: where('gameModal'),
    importModal: where('importModal'),
    legacyMore: where('moreDropdown'),
    legacyUndoToast: where('undoToast'),
    projectFileInput: where('projectFileInput'),
  };

  // Does anything still REVEAL the outlet?
  res.outletRevealers = [];
  const src = (window.app?.constructor?.toString?.() || '');
  return res;
});

console.log('appInsideOutlet:', out.appInsideOutlet);
console.log('ids still inside #app:', out.idsStillInApp);
console.log('\n#app top-level children (the legacy residue):');
out.appChildren.forEach(c => console.log('   ' + c));
console.log('\nROUTE HOSTS — relocated legacy nodes:');
for (const [k, v] of Object.entries(out.routes)) console.log('   ' + k.padEnd(10), JSON.stringify(v));
console.log('\nOVERLAYS / MODALS:');
for (const [k, v] of Object.entries(out.overlays)) console.log('   ' + k.padEnd(16), v);

// This diagnostic is not part of the automated gate, but the claim below is
// load-bearing enough (it's what a future cleanup pass reads to decide what's
// safe to delete) that it must be a real assertion, not just a printed line.
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
console.log('\nASSERTIONS:');
ok(
  Array.isArray(out.routes.reports?.nativeOwned) && out.routes.reports.nativeOwned.length === 1
    && Array.isArray(out.routes.reports?.relocatedLegacy) && out.routes.reports.relocatedLegacy.length === 0,
  "Reports' #statsDashboard is native-owned (data-native-reports), not relocated legacy markup",
  JSON.stringify(out.routes.reports),
);

// The retired legacy global bridge published engine classes onto globalThis so
// harnesses could reach them. e2e-p0-exit pins its absence from source; this is
// the runtime half -- with the shell mounted and a game open, a representative
// spread of those classes must be unreachable as globals.
const globals = await page.evaluate(() => {
  const app = window.app;
  // Some engine names collide with a platform global -- `StorageManager` is a real
  // DOM interface (navigator.storage), so "the name is taken" proves nothing. Where
  // a live instance exists, compare CLASS IDENTITY instead; only fall back to name
  // absence for the classes the running app holds no instance of.
  const live = {
    StatsEngine: app?.stats?.constructor,
    SeasonStore: app?.storage?.seasonStore?.constructor,
    StorageManager: app?.storage?.constructor,
    PlayTagger: app?.tagger?.constructor,
    StudyScreen: app?.studyScreen?.constructor,
    WorkspaceShell: app?.workspaceShell?.constructor,
  };
  const leaked = [];
  for (const [name, cls] of Object.entries(live)) {
    if (cls && globalThis[name] === cls) leaked.push(name);
  }
  for (const name of ['TauriBackend', 'Charts', 'TagProjection', 'SnapshotEnvelope']) {
    if (typeof globalThis[name] !== 'undefined') leaked.push(name);
  }
  return leaked;
});
ok(globals.length === 0,
  'no engine class is published as a global at runtime -- the app boots with the bridge gone',
  `still global: ${globals.join(', ')}`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
if (fail) process.exitCode = 1;
