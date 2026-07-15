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
ok(r.flag === '1' && r.breakdownDisabled, 'Classic launch remains opt-in and guarded routes start disabled');
ok(r.emptyAction === 'Set up team' && r.emptyActionEnabled && r.emptyActionTarget === 'seasons',
  'Empty Home offers an enabled primary setup action instead of appearing dead', JSON.stringify(r));

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
  filmStatus: document.querySelector('.ws-film-row span')?.textContent,
  filmDot: getComputedStyle(document.querySelector('.ws-film-row > i')).backgroundColor,
  seasonCounts: document.querySelector('.ws-season-row.current span')?.textContent,
}));
ok(/Rivals/.test(r.title) && /2026 Varsity/.test(r.season) && !r.resumeDisabled, 'Home renders live season/game context and Resume command', JSON.stringify(r));
ok(r.filmRows >= 1, 'Home renders the active season film inbox');
ok(r.filmStatus && !/^(.*?) · \1$/.test(r.filmStatus), 'Film status does not repeat an empty-state label', r.filmStatus);
ok(r.filmDot !== 'rgb(54, 201, 121)', 'Empty film uses a neutral health indicator, not ready green', r.filmDot);
ok(r.seasonCounts === '1 game · 1 play', 'Current season row uses live counts and correct grammar', r.seasonCounts);
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

await page.click('.ws-top-nav [data-ws-route="study"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), study: !document.querySelector('#wsStudy')?.hidden, statsHidden: document.querySelector('#statsDashboard')?.classList.contains('hidden'), appHidden: document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.route === 'study' && r.study && r.statsHidden && r.appHidden, 'Study opens the query workspace inside the persistent shell');

await page.click('[data-study-action="advanced"]');
r = await page.evaluate(() => ({ stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), appVisible: !document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.stats && r.appVisible, 'Study keeps Advanced Reports one click away');
await page.click('.ws-sidebar [data-ws-route="study"]');

await page.click('.ws-sidebar [data-ws-route="plan"]');
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), plan: !document.querySelector('#wsPlan')?.hidden, appHidden: document.querySelector('#wsClassicOutlet')?.hidden, text: document.querySelector('#wsPlan')?.textContent || '' }));
ok(r.route === 'plan' && r.plan && r.appHidden && /GAME PLAN/.test(r.text), 'Plan opens the live season plan workspace');

r = await page.evaluate(() => {
  const before = localStorage.getItem('ffa_workspace_shell_v2');
  window.app.workspaceShell.useClassic(false);
  return {
    before, after: localStorage.getItem('ffa_workspace_shell_v2'),
    restored: document.querySelector('#app .main-content > .video-section') != null
      && document.querySelector('#app .main-content > #playGridSection') != null
      && document.querySelector('#app .main-content > .tag-section') != null,
  };
});
ok(r.before === '1' && r.after === null && r.restored, 'Use classic layout clears the flag and restores canonical surfaces');

await page.setViewport({ width: 768, height: 1024 });
await page.evaluate(() => { localStorage.setItem('ffa_workspace_shell_v2', '1'); window.app.workspaceShell.enable(); });
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
ok(r.bottomTabs === 'none' && r.workspaceNav === 'grid' && r.routeButtons === 4 && r.active === 'breakdown' && !r.routeSelect,
  'Mobile Break Down uses one Home/Break Down/Study/Plan navigation system', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
