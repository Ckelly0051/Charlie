/* Phase 2 Study UI: real query/compare/view/watch wiring over the built bundle. */
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

const URL = process.env.FFA_STUDY_URL || new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
const screenshotDir = process.env.FFA_STUDY_SCREENSHOTS || '';
const capture = async name => {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await new Promise(resolve => setTimeout(resolve, 120));
  await page.screenshot({ path: `${screenshotDir}/${name}.png`, fullPage: false });
};
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(resolve => setTimeout(resolve, 500));

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', year: '2026' });
  const store = app.storage.seasonStore;
  const g1 = store.activeGame();
  g1.id = 'g-study-1'; g1.name = 'Week 1 vs Rivals'; g1.gameInfo = { opponent: 'Rivals', date: '2026-09-01' };
  g1.plays = [
    { id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'offense', formation: 'Shotgun', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6', down: '1', custom: [] } },
    { id: 2, timestamp: { start: 5, end: 9 }, tags: { unit: 'offense', formation: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '0', down: '2', custom: [] } },
    { id: 3, timestamp: { start: 10, end: 14 }, tags: { unit: 'defense', defFront: '4-2-5', coverage: 'Cover 3', result: 'Gain', yardage: '3', down: '3', custom: [] } },
  ];
  const g2 = store.addGame({ id: 'g-study-2', name: 'Week 2 vs Tigers', status: 'active', gameInfo: { opponent: 'Tigers', date: '2026-09-08' }, plays: [
    { id: 1, timestamp: { start: 0, end: 4 }, tags: { unit: 'offense', formation: 'Wing-T', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', custom: [] } },
    { id: 2, timestamp: { start: 5, end: 9 }, tags: { unit: 'offense', formation: 'Wing-T', runPass: 'Run', playType: 'Run Inside', result: 'Touchdown', yardage: '12', down: '2', custom: [] } },
  ] });
  store.data.activeGameId = g1.id;
  app.storage._clearForNewGame();
  app.storage._loadActiveGame();
  await app.workspaceShell.show('study');
});

let r = await page.evaluate(() => ({
  visible: !document.querySelector('#wsStudy')?.hidden,
  summary: document.querySelector('#wsStudySummary')?.textContent,
  groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent),
  statsHidden: document.querySelector('#statsDashboard')?.classList.contains('hidden'),
}));
ok(r.visible && /2 matching plays/.test(r.summary) && r.groups.includes('Shotgun') && r.groups.includes('Pistol') && !r.groups.includes('Unknown'), 'Study defaults to the active-game cohort', JSON.stringify(r));
ok(r.statsHidden, 'New Study UI does not silently open the legacy dashboard');
await capture('study-game-1280x800');

await page.select('#wsStudyScope', 'season');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(/4 matching plays/.test(r.summary) && r.groups.includes('Wing-T'), 'Full-season scope includes plays from every game', JSON.stringify(r));

await page.select('#wsStudyScope', 'range');
await page.$eval('#wsStudyDateFrom', (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, '2026-09-08');
await page.$eval('#wsStudyDateTo', (el, value) => { el.value = value; el.dispatchEvent(new Event('change', { bubbles: true })); }, '2026-09-08');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent), rangeVisible: !document.querySelector('#wsStudyRange')?.hidden }));
ok(/2 matching plays/.test(r.summary) && r.groups.length === 1 && r.groups[0] === 'Wing-T' && r.rangeVisible, 'Inclusive date range selects only explicitly dated games in range', JSON.stringify(r));
await page.select('#wsStudyScope', 'season');

await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-value="0"]', '1');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, chips: [...document.querySelectorAll('.ws-study-filter-chip')].map(el => el.textContent) }));
ok(/2 matching plays/.test(r.summary) && r.chips.includes('1 ×'), 'A filter narrows the cohort through the registry', JSON.stringify(r));
await page.select('[data-study-filter-value="0"]', '2');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, chips: document.querySelectorAll('.ws-study-filter-chip').length }));
ok(/4 matching plays/.test(r.summary) && r.chips === 2, 'Multiple values within one filter use OR', JSON.stringify(r));
await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-dimension="1"]', 'runPass');
await page.select('[data-study-filter-value="1"]', 'Run');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, filters: document.querySelectorAll('.ws-study-filter-row').length }));
ok(/3 matching plays/.test(r.summary) && r.filters === 2, 'Separate filters combine with AND', JSON.stringify(r));
await capture('study-filters-1280x800');
await page.click('[data-study-action="clear-filters"]');

await page.select('#wsStudyUnit', 'defense');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, groups: [...document.querySelectorAll('.ws-study-row > strong')].map(el => el.textContent) }));
ok(/0 matching plays/.test(r.summary) && r.groups.length === 0, 'Unit filter is ANDed into the selected football question', JSON.stringify(r));

await page.select('#wsStudyUnit', '');
await page.select('#wsStudyMeasure', 'negativeRate');
r = await page.evaluate(() => ({ header: document.querySelector('#wsStudyMetricHead')?.textContent }));
ok(r.header === 'Negative Play Rate', 'Primary metric selection uses registry measure labels', JSON.stringify(r));
r = await page.evaluate(() => ({ kpis: document.querySelectorAll('.ws-study-kpis>div').length, bars: document.querySelectorAll('.ws-study-bar-row').length, linked: !!document.querySelector('.ws-study-bar-row[data-study-row]'), mix: document.querySelector('.ws-study-kpis>div:nth-child(3) strong')?.textContent, highest: document.querySelector('.ws-study-kpis>div:nth-child(2) span')?.textContent, aria: document.querySelector('.ws-study-bar-row')?.getAttribute('aria-label'), decorative: document.querySelector('.ws-study-bar-row i')?.getAttribute('aria-hidden') }));
const mixTotal = (r.mix?.match(/[\d.]+/g) || []).reduce((sum, value) => sum + Number(value), 0);
ok(r.kpis === 3 && r.bars > 0 && r.linked && mixTotal <= 100.01 && /^Highest /.test(r.highest) && /Watch .* film/.test(r.aria) && r.decorative === 'true', 'Study renders accurate, accessible KPI and film-linked effectiveness visuals', JSON.stringify(r));
await page.select('#wsStudyCompare', 'season');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, compareRows: document.querySelectorAll('.ws-study-row-compare').length, scopeDisabled: document.querySelector('#wsStudyScope')?.disabled, watch: document.querySelector('[data-study-action="watch-all"]')?.textContent }));
ok(/2 vs 4 plays/.test(r.summary) && r.compareRows >= 3 && r.scopeDisabled && /Watch current game/.test(r.watch), 'Game-versus-season comparison renders aligned groups', JSON.stringify(r));
r = await page.evaluate(() => ({ deltas: document.querySelectorAll('.ws-study-delta-row').length, linked: !!document.querySelector('.ws-study-delta-row[data-study-row]'), accessible: [...document.querySelectorAll('.ws-study-delta-row')].every(row => /Watch .* film/.test(row.getAttribute('aria-label') || '') && row.querySelector('i')?.getAttribute('aria-hidden') === 'true'), zeroNeutral: [...document.querySelectorAll('.ws-study-delta-row')].filter(row => /(^|\s)0(?:\.0)?(?:\s|$)/.test(row.textContent || '')).every(row => !row.classList.contains('is-favorable') && !row.classList.contains('is-unfavorable')) }));
ok(r.deltas > 0 && r.linked && r.accessible && r.zeroNeutral, 'Comparison renders accessible, polarity-aware film-linked delta visuals', JSON.stringify(r));
await page.select('#wsStudyCompare', 'prior');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent }));
ok(/2 vs 2 plays/.test(r.summary) && /Prior games/.test(r.summary), 'Game-versus-prior-games comparison uses the requested cohort', JSON.stringify(r));
await page.select('#wsStudyCompare', 'rangePrior');
r = await page.evaluate(() => ({ summary: document.querySelector('#wsStudySummary')?.textContent, rangeVisible: !document.querySelector('#wsStudyRange')?.hidden, watch: document.querySelector('[data-study-action="watch-all"]')?.textContent }));
ok(/2 vs 2 plays/.test(r.summary) && /2026-09-08 through 2026-09-08/.test(r.summary) && /Prior dated games/.test(r.summary) && r.rangeVisible && /Watch date range/.test(r.watch), 'Date-range comparison contrasts the selected games with earlier dated games', JSON.stringify(r));
await capture('study-compare-1280x800');

await page.click('[data-study-action="add-filter"]');
await page.select('[data-study-filter-value="0"]', '1');
await page.click('[data-study-action="save"]');
r = await page.evaluate(() => ({ saved: document.querySelectorAll('#wsStudySaved option').length, stored: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length, filters: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]')[0]?.state?.filters?.length }));
ok(r.saved === 2 && r.stored === 1 && r.filters === 1, 'Saved views preserve the complete composable query', JSON.stringify(r));
await page.click('[data-study-action="save-plan"]');
r = await page.evaluate(() => { const p=window.app.storage.seasonStore.plans()[0]; return { plans:window.app.storage.seasonStore.plans().length, items:p?.items.length, refs:p?.items[0]?.refs.length, kind:p?.items[0]?.kind }; });
ok(r.plans === 1 && r.items === 1 && r.refs > 0 && r.kind === 'finding', 'Study saves its exact finding into a persisted season plan', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('plan'));
r = await page.evaluate(() => ({ visible:!document.querySelector('#wsPlan')?.hidden, items:document.querySelectorAll('.ws-plan-items article').length, placeholder:document.querySelector('#wsPlan')?.textContent }));
ok(r.visible && r.items === 1 && !/No game plan yet/.test(r.placeholder), 'Plan route renders the saved Study finding', JSON.stringify(r));
await page.$eval('#wsPlanName', el => { el.value='Rival Week'; el.dispatchEvent(new Event('change',{bubbles:true})); });
await page.$eval('#wsPlanNotes', el => { el.value='Attack the boundary'; el.dispatchEvent(new Event('change',{bubbles:true})); });
r = await page.evaluate(() => { const p=window.app.storage.seasonStore.plans()[0]; return { name:p.name,notes:p.notes }; });
ok(r.name === 'Rival Week' && r.notes === 'Attack the boundary', 'Plan name and staff notes persist through the store seam', JSON.stringify(r));
const planWatch = await page.evaluate(async () => { const app=window.app,calls=[]; const old=app.studyScreen._watch; app.studyScreen._watch=(refs,label)=>calls.push({refs,label}); document.querySelector('[data-plan-watch]')?.click(); document.querySelector('[data-plan-action="watch"]')?.click(); app.studyScreen._watch=old; return calls; });
ok(planWatch.length === 2 && planWatch[0].refs.length > 0 && planWatch[1].refs.length === planWatch[0].refs.length, 'Plan item and whole-plan Watch use the same composite film refs', JSON.stringify(planWatch));
await page.click('[data-plan-remove]');
r = await page.evaluate(() => ({ items:window.app.storage.seasonStore.plans()[0].items.length, empty:/Save a finding from Study/.test(document.querySelector('#wsPlan')?.textContent||'') }));
ok(r.items === 0 && r.empty, 'Plan items remove intentionally without deleting the plan', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('study'));
const savedId = await page.evaluate(() => JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]')[0]?.id || '');
await page.click('[data-study-action="clear-filters"]');
await page.select('#wsStudyMeasure', 'successRate');
await page.select('#wsStudySaved', savedId);
r = await page.evaluate(() => ({ chips: document.querySelectorAll('.ws-study-filter-chip').length, metric: document.querySelector('#wsStudyMeasure')?.value, compare: document.querySelector('#wsStudyCompare')?.value, from: document.querySelector('#wsStudyDateFrom')?.value, to: document.querySelector('#wsStudyDateTo')?.value, deleteEnabled: !document.querySelector('[data-study-action="delete-view"]')?.disabled }));
ok(r.chips === 1 && r.metric === 'negativeRate' && r.compare === 'rangePrior' && r.from === '2026-09-08' && r.to === '2026-09-08' && r.deleteEnabled, 'Loading a saved view restores filters, metric, comparison, and dates', JSON.stringify(r));
await page.click('[data-study-action="delete-view"]');
r = await page.evaluate(() => ({ options: document.querySelectorAll('#wsStudySaved option').length, stored: JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]').length }));
ok(r.options === 1 && r.stored === 0, 'Saved views can be deleted intentionally', JSON.stringify(r));

await page.click('[data-study-action="advanced"]');
r = await page.evaluate(() => ({ stats: !document.querySelector('#statsDashboard')?.classList.contains('hidden'), outlet: !document.querySelector('#wsClassicOutlet')?.hidden }));
ok(r.stats && r.outlet, 'Advanced Reports remains one click away');

await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyCompare', '');
await page.click('[data-study-action="clear-filters"]');
await page.select('#wsStudyScope', 'season');
const cutupContract = await page.evaluate(async () => {
  const app = window.app;
  const empty = await app.cutupPlayer.start([], 'Empty');
  const pending = app.cutupPlayer.start([1], 'Stopped');
  app.cutupPlayer.stop();
  const stopped = await pending;
  const endedPending = app.cutupPlayer.start([1], 'Ended');
  app.vc.video.dispatchEvent(new Event('ended'));
  const ended = await endedPending;
  const prevPending = app.cutupPlayer.start([1, 2], 'Previous');
  app.cutupPlayer.prev();
  const prevIndex = app.cutupPlayer.index;
  app.cutupPlayer.stop();
  await prevPending;
  return { empty, stopped, ended, prevIndex };
});
ok(cutupContract.empty.reason === 'empty' && !cutupContract.empty.completed
  && cutupContract.stopped.reason === 'stopped' && !cutupContract.stopped.completed
  && cutupContract.ended.reason === 'complete' && cutupContract.ended.completed
  && cutupContract.prevIndex === 0,
  'CutupPlayer settles empty/stopped/ended and clamps Previous at the first play', JSON.stringify(cutupContract));

await page.evaluate(() => {
  const app = window.app;
  window.__studyCutupCalls = [];
  window.__studySwitchCalls = [];
  window.__studyPersistCount = 0;
  const originalSwitch = app.storage.switchToGame.bind(app.storage);
  const originalPersist = app.storage.seasonStore.persist.bind(app.storage.seasonStore);
  app.storage.switchToGame = async (id, options) => {
    window.__studySwitchCalls.push({ id, options: { ...(options || {}) } });
    return originalSwitch(id, options);
  };
  app.storage.seasonStore.persist = (...args) => {
    window.__studyPersistCount++;
    return originalPersist(...args);
  };
  app.workspace.filmHealth = async game => ({ ready: game?.id !== 'g-missing' });
  app.cutupPlayer.start = async (ids, label) => {
    window.__studyCutupCalls.push({ gameId: app.storage.seasonStore.data.activeGameId, ids: ids.map(String), label });
    if (ids.length) app.tagger.selectPlay(ids[0]);
    if (window.__studyCutupMode === 'cancel') return { completed: false, reason: 'stopped' };
    return { completed: true, reason: 'complete' };
  };
});
const watchResult = await page.evaluate(() => {
  const row = [...document.querySelectorAll('.ws-study-row')].find(el => el.querySelector('strong')?.textContent === 'Wing-T');
  row?.querySelector('[data-study-row]')?.click();
  return !!row;
});
await new Promise(resolve => setTimeout(resolve, 150));
r = await page.evaluate(() => ({ route: window.app.workspace.currentRoute(), game: window.app.storage.seasonStore.data.activeGameId, calls: window.__studyCutupCalls }));
ok(watchResult && r.route === 'breakdown' && r.calls.at(-1)?.gameId === 'g-study-2' && r.game === 'g-study-1',
  'Watch opens the owning game, then restores the launch game', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyScope', 'season');
const persistBeforeSeason = await page.evaluate(() => window.__studyPersistCount);
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(() => window.__studyCutupCalls?.length >= 3);
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, switches: window.__studySwitchCalls, game: window.app.storage.seasonStore.data.activeGameId, persists: window.__studyPersistCount }));
const seasonCalls = r.calls.slice(-2);
ok(seasonCalls.length === 2 && seasonCalls[0].gameId === 'g-study-1' && seasonCalls[1].gameId === 'g-study-2'
  && /Game 1 of 2/.test(seasonCalls[0].label) && /Game 2 of 2/.test(seasonCalls[1].label)
  && r.game === 'g-study-1' && r.persists === persistBeforeSeason + 1
  && r.switches.some(call => call.id === 'g-study-1' && call.options.reloadActiveFilm === true),
  'Season Watch sequences every matching game with game-aware banner context', JSON.stringify(seasonCalls));

const beforeCancel = r.calls.length;
await page.evaluate(() => {
  window.__studyCutupMode = 'cancel';
  return window.app.workspaceShell.show('study');
});
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(count => window.__studyCutupCalls?.length >= count + 1, {}, beforeCancel);
await new Promise(resolve => setTimeout(resolve, 50));
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, game: window.app.storage.seasonStore.data.activeGameId }));
ok(r.calls.length === beforeCancel + 1 && r.game === 'g-study-1',
  'A cancelled reel stops before the next game and restores the launch game', JSON.stringify(r.calls.slice(beforeCancel)));
await page.evaluate(() => { window.__studyCutupMode = 'complete'; });

const supersession = await page.evaluate(async () => {
  const app = window.app;
  const refs = ['g-study-1::1', 'g-study-2::1'];
  const originalStart = app.cutupPlayer.start;
  const originalStop = app.cutupPlayer.stop;
  const calls = [];
  let releaseFirst = null;
  app.cutupPlayer.start = (ids, label) => {
    calls.push({ game: app.storage.seasonStore.data.activeGameId, label });
    if (label.startsWith('First')) return new Promise(resolve => { releaseFirst = resolve; });
    return Promise.resolve({ completed: true, reason: 'complete' });
  };
  app.cutupPlayer.stop = () => {
    if (releaseFirst) {
      const resolve = releaseFirst;
      releaseFirst = null;
      resolve({ completed: false, reason: 'replaced' });
    }
  };
  const first = app.studyScreen._watch(refs, 'First reel');
  while (!releaseFirst) await new Promise(resolve => setTimeout(resolve, 0));
  const second = app.studyScreen._watch(refs, 'Second reel');
  await Promise.all([first, second]);
  app.cutupPlayer.start = originalStart;
  app.cutupPlayer.stop = originalStop;
  return { calls, game: app.storage.seasonStore.data.activeGameId };
});
ok(supersession.calls.filter(call => call.label.startsWith('First')).length === 1
  && supersession.calls.filter(call => call.label.startsWith('Second')).length === 2
  && supersession.game === 'g-study-1',
  'A second Watch supersedes the first without stale advancement', JSON.stringify(supersession));

const beforeUnavailable = r.calls.length;
await page.evaluate(() => {
  const app = window.app;
  app.vc.video.removeAttribute('src');
  app.workspace.filmHealth = async game => ({ ready: game?.id === 'g-study-1' });
  return app.workspaceShell.show('study');
});
await page.click('[data-study-action="watch-all"]');
await page.waitForFunction(count => window.__studyCutupCalls?.length >= count + 1, {}, beforeUnavailable);
r = await page.evaluate(() => ({ calls: window.__studyCutupCalls, game: window.app.storage.seasonStore.data.activeGameId }));
const availableCall = r.calls[beforeUnavailable];
ok(r.calls.length === beforeUnavailable + 1 && availableCall.gameId === 'g-study-1' && /2 skipped/.test(availableCall.label),
  'Season Watch skips unavailable game film and reports the skipped play count', JSON.stringify(availableCall));

await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => window.app.workspaceShell.show('study'));
await page.select('#wsStudyScope', 'range');
r = await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth, study: !document.querySelector('#wsStudy')?.hidden, tabs: getComputedStyle(document.querySelector('.bottom-tabs')).display, cutup: !!document.querySelector('.cutup-banner') }));
ok(!r.overflow && r.study && r.tabs === 'none' && !r.cutup, 'Mobile Study has no overflow or classic-workflow overlays', JSON.stringify(r));
await page.evaluate(() => window.app.workspaceShell.show('plan'));
r = await page.evaluate(() => ({ overflow:document.documentElement.scrollWidth>document.documentElement.clientWidth, plan:!document.querySelector('#wsPlan')?.hidden, tabs:getComputedStyle(document.querySelector('.bottom-tabs')).display }));
ok(!r.overflow && r.plan && r.tabs === 'none', 'Mobile Plan has no page overflow or classic-workflow overlays', JSON.stringify(r));
await capture('study-390x844');
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
