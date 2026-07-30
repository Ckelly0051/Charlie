import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
const screenshotDir = process.env.GIQ_REPORTS_SCREENSHOTS || '';
const capture = async name => {
  if (!screenshotDir) return;
  await mkdir(screenshotDir, { recursive: true });
  await page.screenshot({ path: screenshotDir + '/' + name + '.png', fullPage: false });
};
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

console.log('\n== 1. Native Reports owns the route and preserves the legacy node ==');
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Reports QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, unit, tags = {}) => ({
    id, timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags }, notes: '', analysis: null,
  });
  app.storage.seasonStore.data.games = [
    {
      id: 'g-self', name: 'Week 1 vs Wildcats', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'self', scoreUs: 21, scoreThem: 14 },
      plays: [
        play(1, 'offense', { formation: 'Trips', qbAlignment: 'Shotgun', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '8', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { formation: 'Ace', qbAlignment: 'Under Center', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4', down: '2', distance: '6', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        play(3, 'special', { stType: 'Kickoff', kickOutcome: 'Returned', kickDistance: '55', returnYards: '18' }),
      ],
    },
    {
      id: 'g-scout', name: 'Wildcats vs Knights', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'scout' },
      plays: [
        play(1, 'offense', { formation: 'Bunch', qbAlignment: 'Pistol', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '7', down: '3', distance: '5', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { defFront: '3-3-5', coverage: 'Cover 1', blitz: 'Edge' }),
        play(3, 'special', { stType: 'Punt', kickOutcome: 'Returned', kickDistance: '42', returnYards: '6' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'g-self';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
});
await sleep(150);
let result = await page.evaluate(() => ({
  native: document.querySelectorAll('#wsReports > [data-native-reports]').length,
  dashboardIds: document.querySelectorAll('#statsDashboard').length,
  oldId: document.querySelector('#app > #legacyStatsDashboard')?.id || '',
  oldInsideReports: !!document.querySelector('#wsReports #legacyStatsDashboard'),
  tabs: [...document.querySelectorAll('#wsReports [data-report-tab]')].map(node => node.dataset.reportTab),
  actions: [...document.querySelectorAll('#wsReports [data-rp-action]')].map(node => node.dataset.rpAction),
}));
ok(result.native === 1 && result.dashboardIds === 1 && result.oldId === 'legacyStatsDashboard' && !result.oldInsideReports,
  'Reports has one native owner while the legacy dashboard stays in the classic tree', JSON.stringify(result));
ok(result.tabs.join(',') === 'overview,offense,defense,special,players,selfscout,season,matchup',
  'Native Reports exposes all eight football report views', JSON.stringify(result.tabs));
ok(result.actions.includes('scout') && result.actions.includes('export'),
  'Native Reports exposes scout and export commands', JSON.stringify(result.actions));
result = await page.evaluate(() => {
  const host = document.getElementById('wsReports');
  const native = host?.querySelector('[data-native-reports]');
  const hostRect = host?.getBoundingClientRect();
  const nativeRect = native?.getBoundingClientRect();
  const style = host ? getComputedStyle(host) : null;
  return {
    hostWidth: Math.round(hostRect?.width || 0), hostHeight: Math.round(hostRect?.height || 0),
    nativeWidth: Math.round(nativeRect?.width || 0), nativeHeight: Math.round(nativeRect?.height || 0),
    overflowY: style?.overflowY || '',
  };
});
ok(result.hostWidth > 0 && result.hostHeight > 0 && result.nativeWidth > 0 && result.nativeHeight > 0 && result.overflowY === 'auto',
  'Reports owns a non-collapsed scroll viewport in the shell grid', JSON.stringify(result));

result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.content.remove();
  const recovered = app.reportsScreen.show();
  return {
    recovered,
    contentConnected: !!app.reportsScreen.content?.isConnected,
    pane: !!document.querySelector('#wsReports [data-native-main-report]'),
  };
});
ok(result.recovered && result.contentConnected && result.pane,
  'Reports remounts when its native content owner is detached', JSON.stringify(result));

result = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const original = screen._renderActiveTab;
  const originalConsoleError = console.error;
  screen._renderActiveTab = () => { throw new Error('forced report failure'); };
  console.error = () => {};
  const rendered = screen.show();
  console.error = originalConsoleError;
  screen._renderActiveTab = original;
  const alert = document.querySelector('#wsReports [role="alert"]');
  const visibleFailure = /Reports unavailable/.test(alert?.textContent || '') && /film and tags are safe/i.test(alert?.textContent || '');
  const failureStyle = alert ? getComputedStyle(alert) : null;
  const failureTone = failureStyle ? { background:failureStyle.backgroundColor, border:failureStyle.borderLeftColor, width:failureStyle.borderLeftWidth } : null;
  screen.content.innerHTML = screen._emptyHtml();
  const empty = screen.content.querySelector('.gi-reports-empty');
  const emptyStyle = empty ? getComputedStyle(empty) : null;
  const emptyTone = emptyStyle ? { background:emptyStyle.backgroundColor, border:emptyStyle.borderLeftColor } : null;
  const recovered = screen.show();
  return { rendered, visibleFailure, failureTone, emptyTone, recovered, pane: !!document.querySelector('#wsReports [data-native-main-report]') };
});
ok(result.rendered === false && result.visibleFailure && result.recovered && result.pane,
  'Reports fails visibly without stranding the route and recovers on retry', JSON.stringify(result));
ok(result.failureTone?.width !== '0px' && result.failureTone?.background !== result.emptyTone?.background && result.failureTone?.border !== result.emptyTone?.border,
  'Report failure uses a distinct danger surface while no-data guidance remains neutral', JSON.stringify(result));

result = await page.evaluate(async () => {
  const app = window.app;
  await app.workspaceShell.show('home');
  app.wizard.currentStep = 1;
  app.vc._emit('video-loaded', { duration: 600 });
  const native = document.querySelector('#wsReports [data-native-reports]');
  const hiddenAfterLoad = native?.classList.contains('hidden');
  const nav = await app.workspaceShell.show('reports');
  const rect = native?.getBoundingClientRect();
  return {
    nav: nav.ok,
    hiddenAfterLoad,
    hiddenAfterReports: native?.classList.contains('hidden'),
    width: Math.round(rect?.width || 0),
    height: Math.round(rect?.height || 0),
    textLength: document.querySelector('[data-native-report-content]')?.textContent.trim().length || 0,
  };
});
ok(result.nav && !result.hiddenAfterLoad && !result.hiddenAfterReports
  && result.width > 0 && result.height > 0 && result.textLength > 0,
  'Home linked-film auto-load cannot hide the native Reports owner', JSON.stringify(result));
await capture('desktop-overview');

console.log('\n== 2. Every self report is reachable without changing season data ==');
result = await page.evaluate(() => {
  const app = window.app;
  const before = JSON.stringify(app.storage.seasonStore.data);
  const evidence = {};
  const needles = {
    overview: ['Team Stats', 'Down'], offense: ['Offense'], defense: ['Defense'],
    special: ['Special Teams'], players: ['Individual'], selfscout: ['Self-Scout'],
    season: ['Season'], matchup: ['Matchup'],
  };
  for (const tab of Object.keys(needles)) {
    app.reportsScreen.selectTab(tab);
    const pane = document.querySelector(`[data-pane="${tab}"]`);
    const text = (pane?.textContent || '').replace(/\s+/g, ' ').trim();
    evidence[tab] = { exists: !!pane, marker: needles[tab].some(needle => text.includes(needle)), length: text.length };
  }
  const after=JSON.stringify(app.storage.seasonStore.data);let at=0;while(at<before.length&&before[at]===after[at])at++;
  return { evidence, unchanged: before === after, diff:{at,before:before.slice(at,at+180),after:after.slice(at,at+180)} };
});
ok(Object.values(result.evidence).every(item => item.exists && item.length > 0),
  'All eight report views render a real pane', JSON.stringify(result.evidence));
ok(result.evidence.special.marker && result.evidence.selfscout.marker && result.evidence.season.marker,
  'Special Teams, Self-Scout, and Season retain their football-specific surfaces', JSON.stringify(result.evidence));
ok(result.unchanged, 'Report navigation is read-only against canonical season data', JSON.stringify(result.diff));

console.log('\n== 3. A self-report row launches the exact active-game film cohort ==');
result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.selectTab('offense');
  const row = document.querySelector('[data-pane="offense"] .cut-row[data-cut-type]');
  if (!row) return { row: false };
  const predicate = app.stats._buildCutFilter(row.dataset.cutType, row.dataset.cutVal);
  const expected = app.filmNavigation.refsForGame(app.tagger.plays.filter(predicate), 'g-self');
  let call = null;
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { call = { refs, label: options?.label || '' }; return true; };
  row.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  app.filmNavigation.watch = original;
  return { row: true, expected, call, type: row.dataset.cutType, value: row.dataset.cutVal };
});
ok(result.row && JSON.stringify(result.call?.refs) === JSON.stringify(result.expected) && result.expected.length > 0,
  'Keyboard activation sends the exact active-game report cohort to film navigation', JSON.stringify(result));

console.log('\n== 4. Opponent perspective keeps offense, defense, and Special Teams honest ==');
result = await page.evaluate(() => {
  const app = window.app;
  app.reportsScreen.scoutOpponent();
  const data = app.reportsScreen._opponentData;
  return {
    games: data?.games,
    offense: app.reportsScreen._opponentRefs('offense'),
    defense: app.reportsScreen._opponentRefs('defense'),
    special: app.reportsScreen._opponentRefs('special'),
    all: app.reportsScreen._opponentRefs('all'),
    visibleTabs: [...document.querySelectorAll('[data-report-tab]')].filter(node => !node.hidden).map(node => node.dataset.reportTab),
    text: document.querySelector('[data-native-report-content]')?.textContent || '',
  };
});
ok(result.games === 2
  && JSON.stringify(result.offense) === JSON.stringify(['g-self::2', 'g-scout::1'])
  && JSON.stringify(result.defense) === JSON.stringify(['g-self::1', 'g-scout::2']),
  'Opponent offense and defense retain composite game/play identity across duplicate play ids', JSON.stringify(result));
ok(JSON.stringify(result.special) === JSON.stringify(['g-scout::3']) && !result.all.includes('g-self::3'),
  'Opponent Special Teams includes scout film and excludes ambiguous head-to-head ST', JSON.stringify(result));
ok(result.visibleTabs.join(',') === 'overview,offense,defense,special'
  && /Head-to-head self-scout film is not silently perspective-flipped/.test(result.text),
  'Opponent mode exposes only supported views and discloses the Special Teams boundary', JSON.stringify(result));
await capture('desktop-opponent');

result = await page.evaluate(() => {
  const app = window.app;
  const calls = [];
  const original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label || '' }); return true; };
  for (const kind of ['offense', 'defense', 'special']) {
    app.reportsScreen.selectTab(kind);
    document.querySelector(`[data-opponent-watch="${kind}"]`)?.click();
  }
  app.filmNavigation.watch = original;
  return calls;
});
ok(result.length === 3
  && JSON.stringify(result[0].refs) === JSON.stringify(['g-self::2', 'g-scout::1'])
  && JSON.stringify(result[1].refs) === JSON.stringify(['g-self::1', 'g-scout::2'])
  && JSON.stringify(result[2].refs) === JSON.stringify(['g-scout::3']),
  'Opponent Watch controls launch the exact displayed unit cohorts', JSON.stringify(result));

console.log('\n== 5. Export commands stay wired to canonical owners ==');
result = await page.evaluate(() => {
  const app = window.app;
  const calls = [];
  const originals = {
    pdf: app.stats._exportStats,
    html: app.storage.exportHtmlReport,
    csv: app.storage.exportCsv,
    callSheet: app.callSheet.show,
    seasonHtml: app.season.exportHtml,
  };
  app.stats._exportStats = () => calls.push('pdf');
  app.storage.exportHtmlReport = () => calls.push('html');
  app.storage.exportCsv = () => calls.push('csv');
  app.callSheet.show = () => calls.push('call-sheet');
  app.season.exportHtml = () => { calls.push('season-html'); return true; };
  for (const kind of ['pdf', 'html', 'season-html', 'csv', 'call-sheet']) app.reportsScreen.export(kind);
  app.stats._exportStats = originals.pdf;
  app.storage.exportHtmlReport = originals.html;
  app.storage.exportCsv = originals.csv;
  app.callSheet.show = originals.callSheet;
  app.season.exportHtml = originals.seasonHtml;
  return calls;
});
ok(result.join(',') === 'pdf,html,season-html,csv,call-sheet',
  'Native Reports routes game HTML, full-season HTML, PDF, CSV, and Call Sheet to their canonical owners', JSON.stringify(result));

result = await page.evaluate(async () => {
  const app=window.app,before=JSON.stringify(app.storage.seasonStore.data),original=window.ffaSaveBlob;
  let capture=null,pending=null;window.ffaSaveBlob=(blob,name)=>{pending=blob.text().then(html=>{capture={html,name};});};
  const ok=app.season.exportHtml();await pending;window.ffaSaveBlob=original;
  return {ok,name:capture?.name,html:capture?.html||'',unchanged:JSON.stringify(app.storage.seasonStore.data)===before};
});
ok(result.ok && /season_report_/.test(result.name) && /Season Report/.test(result.html) && /Generated .* 2 games/.test(result.html) && result.unchanged,
  'Full-season HTML export is downloadable, honest about scope, and read-only against canonical data', JSON.stringify({ok:result.ok,name:result.name,unchanged:result.unchanged}));

console.log('\n== 6. Mobile Reports contains overflow and preserves touch targets ==');
await page.setViewport({ width: 390, height: 844 });
await page.evaluate(() => {
  window.app.reportsScreen.show();
  window.app.reportsScreen.selectTab('overview');
  window.scrollTo(0, 0);
});
await sleep(100);
result = await page.evaluate(() => {
  const controls = [...document.querySelectorAll('.gi-reports-command,[data-report-tab],.gi-reports-segment button')]
    .filter(node => !node.hidden && getComputedStyle(node).display !== 'none')
    .map(node => ({ label: node.textContent.trim(), height: Math.round(node.getBoundingClientRect().height) }));
  const tabstrip = document.querySelector('.gi-reports-tabs');
  return {
    viewport: document.documentElement.clientWidth,
    pageWidth: document.documentElement.scrollWidth,
    minControl: Math.min(...controls.map(item => item.height)),
    controls,
    tabScrollsInternally: tabstrip.scrollWidth > tabstrip.clientWidth,
  };
});
ok(result.pageWidth <= result.viewport, 'Mobile Reports has no page-level horizontal overflow', JSON.stringify(result));
ok(result.minControl >= 44 && result.tabScrollsInternally,
  'Mobile controls are at least 44px and report tabs scroll inside their own strip', JSON.stringify(result));
await capture('mobile-overview');

ok(errors.length === 0, 'Native Reports journey produces no page errors', errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);