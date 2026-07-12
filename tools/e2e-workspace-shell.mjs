/* Phase 1 shell/Home contract. The flag is opt-in; classic launch remains the
   default. This test drives the built bundle through real route adapters. */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
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
}));
ok(r.shell && r.active && r.home && r.appInOutlet, 'Feature flag mounts shell and relocates the intact classic app', JSON.stringify(r));
ok(r.flag === '1' && r.breakdownDisabled, 'Classic launch remains opt-in and guarded routes start disabled');

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const g = app.storage.seasonStore.activeGame();
  g.name = 'Week 1 vs Rivals'; g.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  g.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', yardage: '5' } }];
  app.storage._loadActiveGame();
  await app.workspaceShell.show('home');
});
r = await page.evaluate(() => ({
  title: document.querySelector('#wsContinueTitle')?.textContent,
  season: document.querySelector('#wsContextSeason')?.textContent,
  resumeDisabled: document.querySelector('#wsResume')?.disabled,
  filmRows: document.querySelectorAll('.ws-film-row').length,
}));
ok(/Rivals/.test(r.title) && /2026 Varsity/.test(r.season) && !r.resumeDisabled, 'Home renders live season/game context and Resume command', JSON.stringify(r));
ok(r.filmRows >= 1, 'Home renders the active season film inbox');

await page.click('.ws-sidebar [data-ws-route="breakdown"]');
r = await page.evaluate(() => ({ appVisible: !document.querySelector('#wsClassicOutlet')?.hidden, homeHidden: document.querySelector('#wsHome')?.hidden, route: window.app.workspace.currentRoute(), nav: !!document.querySelector('#workspaceShell') }));
ok(r.appVisible && r.homeHidden && r.route === 'breakdown' && r.nav, 'Break Down opens the unchanged classic workspace inside persistent shell');

await page.click('.ws-sidebar [data-ws-route="study"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), appVisible: !document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.route === 'study' && r.stats && r.appVisible, 'Study opens existing Advanced Reports');

await page.click('.ws-sidebar [data-ws-route="plan"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), plan: !document.querySelector('#wsPlan')?.hidden, appHidden: document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.route === 'plan' && r.plan && r.appHidden, 'Plan shows a controlled shell state without adding schema');

r = await page.evaluate(() => {
  const before = localStorage.getItem('ffa_workspace_shell_v2');
  window.app.workspaceShell.useClassic(false);
  return { before, after: localStorage.getItem('ffa_workspace_shell_v2') };
});
ok(r.before === '1' && r.after === null, 'Use classic layout clears the feature flag immediately');

await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => { localStorage.setItem('ffa_workspace_shell_v2', '1'); window.app.workspaceShell.enable(); });
await page.evaluate(() => window.app.workspaceShell.show('home'));
r = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  mobileHeader: getComputedStyle(document.querySelector('.ws-mobile-head')).display !== 'none',
  sidebar: getComputedStyle(document.querySelector('.ws-sidebar')).display,
}));
ok(!r.overflow && r.mobileHeader && r.sidebar === 'none', 'Mobile shell has no page overflow and uses compact header', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
