/* SHELL INDEPENDENCE — measured dependency inventory.
   With the shell mounted and a game open, enumerate what still lives inside the
   legacy #app subtree, which route hosts hold RELOCATED legacy nodes vs native
   markup, and what the outlet is still load-bearing for. */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
const URL = TEST_APP_URL;
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

  // Route hosts: native markup vs relocated legacy nodes.
  const hostInfo = (sel, legacySelectors) => {
    const host = document.querySelector(sel);
    if (!host) return 'ABSENT';
    const relocated = legacySelectors.filter(s => !!host.querySelector(s));
    return { children: host.children.length, relocatedLegacy: relocated };
  };
  res.routes = {
    home:      hostInfo('#wsHome', []),
    breakdown: hostInfo('#wsBreakdown', ['.video-section', '.tag-section', '#playGridSection']),
    study:     hostInfo('#wsStudy', ['#statsDashboard', '.video-section']),
    reports:   hostInfo('#wsReports', ['#statsDashboard']),
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
    seasonOverlay: where('seasonOverlay'),
    nativeShortcuts: document.querySelector('[data-overlay-id="keyboard-shortcuts"]')?.closest('#giNativeRoot') ? 'native root' : 'absent',
    settingsDrawer: where('settingsDrawer'),
    gameModal: where('gameModal'),
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
await browser.close();
