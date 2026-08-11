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
  // S7 demolition: #app is deleted. #statsDashboard's permanent authored home
  // is #giLegacyEngineHost now, not #app.
  oldId: document.querySelector('#giLegacyEngineHost #legacyStatsDashboard')?.id || '',
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

// The 1.12.0-14 outage: opening a linked game auto-loads film, the dismissed
// legacy Wizard advanced on `video-loaded`, and its step side effect hid
// #statsDashboard — an id that belongs to native Reports. The coach got a fully
// rendered report at 0x0.
//
// S7-b retires that module, so the defect is now structurally impossible rather
// than merely guarded. Both halves are asserted: the coach-facing OUTCOME (a
// video-load leaves Reports visible and populated) and the ABSENCE of the owner,
// so reintroducing a boot-time subscriber that hides the route reds this.
result = await page.evaluate(async () => {
  const app = window.app;
  await app.workspaceShell.show('home');
  let sideEffects = 0;
  const originalHideDashboard = app.stats.hideDashboard;
  app.stats.hideDashboard = (...args) => {
    sideEffects += 1;
    return originalHideDashboard.apply(app.stats, args);
  };
  app.vc._emit('video-loaded', { duration: 600 });
  app.stats.hideDashboard = originalHideDashboard;
  const native = document.querySelector('#wsReports [data-native-reports]');
  const hiddenAfterLoad = native?.classList.contains('hidden');
  const nav = await app.workspaceShell.show('reports');
  const rect = native?.getBoundingClientRect();
  return {
    nav: nav.ok,
    wizard: !!app.wizard,
    wizardBar: !!document.querySelector('.wizard-bar, .wiz-step, #btnToggleWizard'),
    sideEffects,
    hiddenAfterLoad,
    hiddenAfterReports: native?.classList.contains('hidden'),
    width: Math.round(rect?.width || 0),
    height: Math.round(rect?.height || 0),
    textLength: document.querySelector('[data-native-report-content]')?.textContent.trim().length || 0,
  };
});
ok(result.nav && result.sideEffects === 0
  && !result.hiddenAfterLoad && !result.hiddenAfterReports
  && result.width > 0 && result.height > 0 && result.textLength > 0,
  'A linked-film video-load leaves native Reports visible and populated', JSON.stringify(result));
ok(result.wizard === false && result.wizardBar === false,
  'The legacy onboarding wizard is absent, not hidden, so it cannot hide native Reports again', JSON.stringify(result));
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

console.log('\n== S6-4c AX-1: the report stylesheet actually reaches the native route ==');
await page.setViewport({ width: 1400, height: 860 });
// The three-play fixture above proves ownership and lifecycle; it cannot
// produce a KPI hero, a scoreboard or an explosive cohort. Chart a real game so
// the presentation assertions below measure a populated report rather than an
// empty one.
await page.evaluate(async () => {
  const app = window.app, store = app.storage.seasonStore;
  const looks = ['Trips', 'Ace', 'Wing-T', 'Bunch', 'Empty', 'Doubles'];
  const types = ['Run Inside', 'Run Outside', 'Short Pass', 'Deep Pass', 'Screen', 'Play Action'];
  const game = store.data.games.find(entry => entry.id === 'g-self');
  game.plays = Array.from({ length: 64 }, (unused, index) => ({
    id: index + 1, timestamp: { start: index * 5, end: index * 5 + 4 }, notes: '', analysis: null,
    tags: {
      unit: index % 5 === 4 ? 'defense' : 'offense', formation: looks[index % looks.length],
      backfield: index % 2 ? 'I' : 'Single', personnel: index % 2 ? '11' : '21',
      runPass: index % 2 ? 'Run' : 'Pass', playType: types[index % types.length],
      result: index % 9 === 0 ? 'Touchdown' : (index % 7 === 0 ? 'Loss' : 'Gain'),
      yardage: String(index % 9 === 0 ? 18 : (index % 7 === 0 ? -4 : 2 + (index % 14))),
      down: String((index % 4) + 1), distance: String(1 + (index % 12)), quarter: `Q${(index % 4) + 1}`,
      defFront: '4-2-5', coverage: 'Cover 3', custom: [], players: { ballCarrier: '22', tackler: '55' }, grades: {},
    },
  }));
  /* G14 — without these the Negative Plays exclusivity check passes VACUOUSLY.
     The generated 64 carry `result:'Loss'` and no sacks at all, so a sack could
     never be double-counted and removing the guard changed nothing. Two plays
     make it real:
       65  a plain sack — a PASS play with negative yardage, so it lands in both
           `sacks` and `passes` unless the exclusion holds.
       66  a STRIP-SACK — sack AND fumble AND negative yardage. This is the
           coach's own case: one play, three events, so the headline (distinct
           plays) must NOT equal the sum of the rows. */
  game.plays.push({
    id: 65, timestamp: { start: 400, end: 404 }, notes: '', analysis: null,
    tags: { unit: 'offense', formation: 'Trips', backfield: 'Single', personnel: '11',
      runPass: 'Pass', playType: 'Short Pass', result: 'Sack', yardage: '-7',
      down: '3', distance: '8', quarter: 'Q3', defFront: '4-2-5', coverage: 'Cover 3',
      custom: [], players: { passer: '12' }, grades: {} },
  });
  game.plays.push({
    id: 66, timestamp: { start: 410, end: 414 }, notes: '', analysis: null,
    tags: { unit: 'offense', formation: 'Trips', backfield: 'Single', personnel: '11',
      runPass: 'Pass', playType: 'Short Pass', result: 'Sack + Fumble', yardage: '-5',
      down: '2', distance: '10', quarter: 'Q4', defFront: '4-2-5', coverage: 'Cover 3',
      custom: [], players: { passer: '12' }, grades: {} },
  });
  game.nextId = 67;
  store.data.activeGameId = 'g-self';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
});
await new Promise(resolve => setTimeout(resolve, 450));
const kpiStyling = await page.evaluate(async () => {
  document.querySelector('[data-report-tab="offense"]')?.click();
  await new Promise(resolve => setTimeout(resolve, 350));
  const hero = document.querySelector('.gi-reports .gi-hero');
  const card = document.querySelector('.gi-reports .gi-kpi');
  const value = document.querySelector('.gi-reports .gi-kpi-value');
  const heroStyle = hero ? getComputedStyle(hero) : null;
  const cardStyle = card ? getComputedStyle(card) : null;
  return {
    heroes: document.querySelectorAll('.gi-reports .gi-hero').length,
    cards: document.querySelectorAll('.gi-reports .gi-kpi').length,
    display: heroStyle?.display,
    gap: heroStyle ? parseFloat(heroStyle.columnGap) : 0,
    heroBackground: heroStyle?.backgroundColor,
    radius: cardStyle ? parseFloat(cardStyle.borderRadius) : -1,
    padding: cardStyle ? parseFloat(cardStyle.paddingTop) : 0,
    background: cardStyle?.backgroundColor,
    valueSize: value ? parseFloat(getComputedStyle(value).fontSize) : 0,
    valueFont: value ? getComputedStyle(value).fontFamily : '',
    retiredContainers: document.querySelectorAll('.stats-overlay').length,
  };
});
// The board is native-owned: one-pixel joins, square stat blocks, and the
// design-system deck surface. It must not fall back to the rounded legacy
// dashboard cards that first shipped inside this route.
ok(kpiStyling.retiredContainers === 0 && kpiStyling.heroes > 0 && kpiStyling.cards >= 3,
  'Native Reports renders KPI heroes with no retired stats-overlay container present', JSON.stringify(kpiStyling));
ok(kpiStyling.display === 'grid' && kpiStyling.gap === 1 && kpiStyling.radius === 0 && kpiStyling.padding > 0
  && kpiStyling.heroBackground !== 'rgba(0, 0, 0, 0)' && kpiStyling.background !== 'rgba(0, 0, 0, 0)' && kpiStyling.valueSize >= 24,
  'Native Reports KPI metrics form one square-edged design-system scan board', JSON.stringify(kpiStyling));
ok(/IBM Plex Sans Condensed/i.test(kpiStyling.valueFont),
  'Native Reports numbers use the design-system condensed face', JSON.stringify({ valueFont: kpiStyling.valueFont }));

await page.setViewport({ width: 390, height: 844 });
const mobileKpi = await page.evaluate(() => {
  const hero = [...document.querySelectorAll('.gi-reports .gi-hero')].find(node => node.offsetParent !== null);
  const cards = [...(hero?.querySelectorAll(':scope>.gi-kpi') || [])];
  // The product may legitimately gain or lose a metric. Force an odd-card
  // probe only when needed so this tests the responsive rule, not fixture count.
  const probe = cards.length % 2 === 0 && cards.length
    ? cards.at(-1).cloneNode(true)
    : null;
  if (probe) {
    probe.dataset.kpiLayoutProbe = 'true';
    hero.append(probe);
    cards.push(probe);
  }
  const rect = hero?.getBoundingClientRect();
  const last = cards.at(-1)?.getBoundingClientRect();
  const result = {
    sourceCount: cards.length - (probe ? 1 : 0),
    probeCount: cards.length,
    heroWidth: rect?.width || 0,
    lastWidth: last?.width || 0,
    columns: hero ? getComputedStyle(hero).gridTemplateColumns : '',
  };
  probe?.remove();
  return result;
});
ok(mobileKpi.sourceCount >= 3 && mobileKpi.probeCount % 2 === 1 && mobileKpi.lastWidth >= mobileKpi.heroWidth - 3,
  'An odd mobile KPI board gives its final metric the full row without requiring an odd production fixture', JSON.stringify(mobileKpi));
await page.setViewport({ width: 1400, height: 860 });


console.log('\n== S6-4c AX-4/AX-5: Overview composition and shared chart primitives ==');
const composition = await page.evaluate(async () => {
  document.querySelector('[data-report-tab="overview"]')?.click();
  await new Promise(resolve => setTimeout(resolve, 400));
  const teams = [...document.querySelectorAll('.gi-reports .scoreboard-team')].map(node => Math.round(node.getBoundingClientRect().width));
  const sep = document.querySelector('.gi-reports .scoreboard-sep')?.getBoundingClientRect();
  const layout = document.querySelector('.gi-reports .scoreboard-layout');
  const glance = document.querySelector('.gi-reports .gi-glance');
  const svg = document.querySelector('.gi-reports .chart-donut');
  const centre = svg?.querySelector('text');
  const ring = svg?.querySelector('circle');
  const centreBox = centre?.getBBox ? centre.getBBox() : null;
  // The ring's inner hole, computed from the geometry the primitive draws, is
  // what the centre number has to fit inside. Before AX-5 it did not.
  const radius = ring ? parseFloat(ring.getAttribute('r')) : 0;
  const strokeWidth = ring ? parseFloat(ring.getAttribute('stroke-width')) : 0;
  const hole = (radius - strokeWidth / 2) * 2;
  const final = document.querySelector('.gi-reports .scoreboard-final')?.getBoundingClientRect();
  return {
    teams,
    sepCentred: !!(sep && final && teams.length === 2
      && Math.abs((sep.left + sep.width / 2) - (final.left + final.width / 2)) < 3),
    // Scoped to `.gi-glance` deliberately: AX-7's lens board reuses the SAME
    // tile component, which is the point — one tile in the product, not two
    // that drift. An unscoped count would silently start measuring both.
    glanceTiles: document.querySelectorAll('.gi-reports .gi-glance .gi-glance-tile').length,
    glanceLinked: document.querySelectorAll('.gi-reports .gi-glance .gi-glance-tile.cut-row').length,
    glanceInLayout: !!(glance && layout && layout.contains(glance)),
    disclosure: !!document.querySelector('.gi-reports .scoreboard-note summary'),
    inlineTechnical: /TD = 6, FG = 3/.test(document.querySelector('.gi-reports .scoreboard-note')?.querySelector('p')?.textContent || ''),
    donutBlocks: document.querySelectorAll('.gi-reports .chart-donut-block').length,
    titleOutsideSvg: !!document.querySelector('.gi-reports .chart-donut-block > figcaption'),
    legendLabels: [...document.querySelectorAll('.gi-reports .chart-donut-block .chart-leg-item')].map(node => node.textContent.trim()),
    centreWidth: centreBox ? Math.round(centreBox.width) : 0,
    hole: Math.round(hole),
    ringStroke: ring ? getComputedStyle(ring).stroke : '',
  };
});
ok(composition.teams.length === 2 && composition.teams[0] === composition.teams[1] && composition.sepCentred,
  'Scoreboard uses equal team blocks with a centred separator', JSON.stringify(composition.teams));
ok(composition.glanceTiles === 6 && composition.glanceLinked >= 3 && composition.glanceInLayout,
  'Game at a Glance fills the space beside the scoreboard with factual, partly film-linked tiles', JSON.stringify(composition));
ok(composition.disclosure && composition.inlineTechnical,
  'Technical scoring rules sit behind an information affordance rather than as body copy', JSON.stringify({ disclosure: composition.disclosure }));
// Reports redesign (item A): Overview's old Team Summary donut pair (Run Rate
// + Total Yards) duplicated the persistent KPI rail and the Tendencies lens,
// so the Run Rate donut was removed — Yards by Type is the one shape chart
// left here, since it isn't shown as a chart anywhere else. The composition
// rule this assertion actually guards (title outside the ring, a real legend
// below with values, not just a count) does not require a specific count.
ok(composition.donutBlocks >= 1 && composition.titleOutsideSvg && composition.legendLabels.every(label => /\S+\s+\d/.test(label)),
  'Donuts carry their title outside the ring and a complete legend below', JSON.stringify(composition.legendLabels));
ok(composition.centreWidth > 0 && composition.centreWidth <= composition.hole,
  'The donut centre number fits inside the ring hole instead of overlapping the stroke', JSON.stringify({ centreWidth: composition.centreWidth, hole: composition.hole }));
// AX-5: a chart series is a category, not a judgement. Assert the run/pass ink
// resolves to the categorical tokens and is NOT any semantic status colour.
const paletteCheck = await page.evaluate(() => {
  const styles = getComputedStyle(document.documentElement);
  const asRgb = value => { const probe = document.createElement('span'); probe.style.color = value; document.body.appendChild(probe); const out = getComputedStyle(probe).color; probe.remove(); return out; };
  const ring = document.querySelector('.gi-reports .chart-donut circle');
  const status = ['--gi-ok', '--gi-warn', '--gi-turnover', '--gi-first-down'].map(token => asRgb(styles.getPropertyValue(token).trim()));
  return { stroke: ring ? getComputedStyle(ring).stroke : '', run: asRgb(styles.getPropertyValue('--gi-run').trim()), status };
});
ok(paletteCheck.stroke && paletteCheck.stroke === paletteCheck.run && !paletteCheck.status.includes(paletteCheck.stroke),
  'Chart series use the categorical palette and never a semantic status colour', JSON.stringify(paletteCheck));
// The strongest guarantee on this panel: the number the coach reads is the
// number of plays that actually play.
const glanceFilm = await page.evaluate(async () => {
  const app = window.app, calls = [], original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  const tile = [...document.querySelectorAll('.gi-reports .gi-glance .gi-glance-tile.cut-row')]
    .find(node => /explosive/i.test(node.querySelector('span')?.textContent || ''));
  const shown = Number(tile?.querySelector('strong')?.textContent || 0);
  tile?.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  app.filmNavigation.watch = original;
  const activeId = String(app.storage.seasonStore.data.activeGameId);
  const refs = calls[0]?.refs || [];
  return { shown, refCount: refs.length, calls: calls.length,
    composite: refs.every(ref => /^[^:]+::[^:]+$/.test(String(ref))),
    sameGame: refs.every(ref => String(ref).split('::')[0] === activeId) };
});
ok(glanceFilm.calls === 1 && glanceFilm.shown > 0 && glanceFilm.refCount === glanceFilm.shown && glanceFilm.composite && glanceFilm.sameGame,
  'A Game at a Glance tile plays exactly as many composite-ref plays as the number it displays', JSON.stringify(glanceFilm));

console.log('\n== AX-7. Reports answers through five lenses ==');
const lensBoard = await page.evaluate(() => {
  const engine = window.app.stats;
  const stats = engine.compute();
  const lenses = [...document.querySelectorAll('.gi-reports .gi-lens')].map(node => ({
    id: node.dataset.lens,
    hasCaption: !!node.querySelector('.gi-lens-head p'),
    detail: node.querySelector('.gi-lens-more')?.dataset.lensTab || null,
    tiles: [...node.querySelectorAll('.gi-glance-tile')].map(tile => {
      // The label and its (i) definition mark share one <span> (a coach-
      // reported fix: the icon used to land on its own grid row, separate
      // from the label). Reading that span's raw textContent now pulls in
      // the icon glyph plus its hidden tooltip text, so the label is read
      // from a clone with the mark stripped out first.
      const labelEl = tile.querySelector('.gi-glance-label') || tile.querySelector('span');
      const labelClone = labelEl?.cloneNode(true);
      labelClone?.querySelector('.gi-def')?.remove();
      return {
        label: (labelClone?.textContent || '').trim(),
        value: (tile.querySelector('strong')?.textContent || '').trim(),
        cutType: tile.dataset.cutType || '',
        cutVal: tile.dataset.cutVal || '',
        clickable: tile.classList.contains('cut-row'),
      };
    }),
  }));
  const claims = lenses.flatMap(lens => lens.tiles.filter(tile => tile.cutType).map(tile => ({
    lens: lens.id, label: tile.label, clickable: tile.clickable,
    resolves: !!engine._buildCutFilter(tile.cutType, tile.cutVal),
  })));
  const labels = lenses.flatMap(lens => lens.tiles.map(tile => tile.label));
  const value = name => lenses.flatMap(l => l.tiles).find(t => t.label === name)?.value || '';
  return {
    ids: lenses.map(lens => lens.id),
    anyCaption: lenses.some(lens => lens.hasCaption),
    details: lenses.map(lens => lens.detail),
    claims,
    orphanCut: lenses.flatMap(l => l.tiles).some(t => t.cutType && !t.clickable),
    // Nothing the retired KPI hero showed may be lost.
    heroGone: !document.querySelector('.gi-reports [data-pane="overview"] .gi-hero'),
    carried: ['Success rate', 'Yds / play', 'Third down', 'Run rate'].every(name => labels.includes(name)),
    fourth: labels.includes('Pts / drive') || labels.includes('First downs'),
    // Values are READ, never recomputed by the presentation layer.
    successMatches: value('Success rate') === `${Math.round(parseFloat(stats.efficiency.successRate))}%`,
    thirdMatches: value('Third down') === `${Math.round(parseFloat(stats.downs.thirdDownPct))}%`,
    explosiveMatches: value('Explosive rate') === `${Math.round(parseFloat(stats.efficiency.explosivePct))}%`,
    // The lens detail action must NOT wear the tab bar's own attribute:
    // `_syncTabState` walks the whole host and would toggle it as a tab.
    lensWearsTabAttr: !!document.querySelector('.gi-reports .gi-lens [data-report-tab]'),
  };
});
ok(lensBoard.ids.join(',') === 'efficiency,explosiveness,situational,tendencies,negative',
  'Reports Overview answers through the five lenses in order', lensBoard.ids.join(','));
/* This assertion has flipped THREE times across this project's history — first
   requiring a rhetorical sub-head ('?'), then requiring a real defining
   sentence, now requiring NO sentence at all. Each flip is a genuine, direct
   coach decision recorded in CLAUDE.md at the time it happened; the most
   recent one is authoritative. Coach (direct, this session): "these
   definitions are still there. Delete them out." No lens header carries a
   caption paragraph any more — the header and the tiles explain themselves. */
ok(!lensBoard.anyCaption,
  'No lens carries a caption sentence — the coach removed them; the header and tiles explain themselves',
  JSON.stringify(lensBoard.anyCaption));

/* G14 — the Negative Plays lens. Renamed to "Risk" earlier in the Reports
   redesign batch per the accepted five-lens model brief, then the coach
   REVERSED that renaming directly in this same session: "Risk isn't the right
   word there, we changed it a few builds ago." "Negative Plays" is the
   coach's own prior, standing decision — do not rename this again without a
   fresh, explicit instruction from the coach. The defect this section's proof
   replaces was a sack counted in "Negative plays" AND again in "Sacks taken",
   inside one lens, with nothing saying so. These assertions pin the three
   things that fix cannot silently lose: the children are mutually exclusive,
   the headline counts PLAYS while the rows count EVENTS, and the one
   clickable row plays exactly what it says. */
const negLens = await page.evaluate(() => {
  const stats = window.app.stats.compute(window.app.tagger.plays);
  const np = stats.negativePlays;
  const host = document.querySelector('.gi-reports .gi-lens[data-lens="negative"]');
  const rows = [...(host?.querySelectorAll('.gi-np-row') || [])].map(r => ({
    label: r.querySelector('.gi-np-label')?.textContent.trim(),
    value: r.querySelector('.gi-np-value')?.textContent.trim(),
    child: r.classList.contains('is-child'),
    cut: r.dataset.cutType || null,
  }));
  const loss = rows.find(r => r.label === 'Plays for Loss');
  const kids = rows.filter(r => r.child);
  return {
    engine: np,
    present: !!host,
    name: host?.querySelector('.gi-lens-head h4')?.textContent.trim(),
    headline: host?.querySelector('.gi-np-headline b')?.textContent.trim(),
    headlineSub: host?.querySelector('.gi-np-headline span')?.textContent.trim(),
    rows,
    // Children sum EXACTLY to their header — that is what "never double-counted"
    // means arithmetically, and it is only true if the buckets are exclusive.
    kidsSum: kids.reduce((s, r) => s + (parseInt(r.value, 10) || 0), 0),
    lossValue: parseInt(loss?.value, 10) || 0,
    // Rows carry raw counts and NO percentages: the headline counts plays, the
    // rows count events, and a stray % would invite adding them up wrongly.
    rowsHavePct: rows.some(r => /%/.test(r.value || '')),
    // Exactly one row claims a cohort, and it is Plays for Loss.
    cutRows: rows.filter(r => r.cut).map(r => r.label),
    // "Risk" (this batch's brief-driven rename, reversed by the coach in the
    // same session) must be gone from the board entirely.
    riskNameGone: ![...document.querySelectorAll('.gi-reports .gi-lens-head h4')]
      .some(node => node.textContent.trim() === 'Risk'),
    // Coach (direct): "I don't think we need the definitions at all. Remove
    // all of them." No lens tile anywhere on the board may carry a `.gi-def`
    // (i) mark any more.
    definitionCount: document.querySelectorAll('.gi-reports .gi-lens .gi-def').length,
  };
});
ok(negLens.present && negLens.name === 'Negative Plays' && negLens.riskNameGone,
  'The fifth lens is named Negative Plays (coach\'s standing decision), not Risk', JSON.stringify({ name: negLens.name, riskNameGone: negLens.riskNameGone }));
ok(negLens.definitionCount === 0,
  'No lens tile carries a definition (i) mark — the coach removed them; the header and data explain themselves',
  JSON.stringify({ definitionCount: negLens.definitionCount }));
/* Coach-reported, measured not eyeballed: `.gi-glance-tile` declared no
   `grid-template-columns`, so its one implicit column auto-sized to its
   widest child's own content width rather than the tile's real available
   width, and `justify-items:center` then centered every row inside a column
   that was itself off-center — every row shifted the SAME direction by the
   SAME amount, which is exactly what made it look like a real (not
   optical-illusion) shift. Reproduces most visibly on a tile whose sibling
   lens cards are wide (Tendencies, next to five-tile Situational), so this
   checks a tile from that exact lens. Tolerance is 0.5px for ordinary
   sub-pixel layout rounding — the bug measured at ~3px. */
/* Whether this bug produces a visible offset depends on how wide a tile's
   content is relative to its box, which is fixture-dependent — this
   harness's own hand-built fixture happens not to reproduce it measurably,
   though a live probe against the real 40-play synthetic fixture (used by
   the screenshot tooling) showed a real 6px column overflow on this exact
   selector. Rather than depend on the harness's incidental content widths,
   this injects a throwaway `.gi-glance-tile` with deliberately long content
   into a deliberately narrow parent — the same shape as the reported defect
   — and checks the CSS property directly: the tile's one implicit grid
   column must never size wider than the box it lives in. Removed
   immediately after; touches no report content. */
const columnOverflow = await page.evaluate(() => {
  // Every `.gi-glance-tile` rule is scoped `.gi-reports .gi-glance-tile` —
  // the probe must live inside a real `.gi-reports` ancestor or none of the
  // styling (including the fix under test) applies to it at all.
  const host = document.querySelector('.gi-reports') || document.body;
  const probe = document.createElement('div');
  probe.style.cssText = 'position:fixed;left:-9999px;top:0;width:90px';
  // This exact shape — few wrap points relative to its length — is what
  // triggered the real defect ("8 snaps · 63%" on a real tile). A string
  // with many short words wraps down small enough that it stops proving
  // anything; a single unbroken word overflows its own cell regardless of
  // the fix, which is a different (item-level) overflow, not this
  // (track-level) one. This reproduces the actual reported shape.
  probe.innerHTML = '<div class="gi-glance-tile"><span class="gi-glance-label">Top formation</span><strong>Bunch</strong><small>8 snaps &middot; 63%</small></div>';
  host.appendChild(probe);
  const tile = probe.firstElementChild;
  const cs = getComputedStyle(tile);
  const columnPx = parseFloat(cs.gridTemplateColumns);
  const contentWidth = tile.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight);
  probe.remove();
  return { columnPx, contentWidth, overflow: columnPx - contentWidth };
});
ok(columnOverflow.overflow < 0.5,
  'A lens tile\'s implicit grid column never sizes wider than the tile\'s own content box, even when its content would otherwise overflow it',
  JSON.stringify(columnOverflow));
ok(negLens.kidsSum === negLens.lossValue && negLens.lossValue === negLens.engine.lossTotal,
  'Sacks, runs and passes are mutually exclusive and sum exactly to Plays for Loss — no play counted twice',
  JSON.stringify({ kidsSum: negLens.kidsSum, loss: negLens.lossValue, engine: negLens.engine.lossTotal }));
ok(negLens.headline === String(negLens.engine.distinct) && !negLens.rowsHavePct
  && /% of plays/.test(negLens.headlineSub || ''),
  'The headline counts distinct plays and carries the only percentage; rows are raw counts',
  JSON.stringify({ headline: negLens.headline, sub: negLens.headlineSub, rowsHavePct: negLens.rowsHavePct }));
/* The strip-sack case, stated as football rather than arithmetic: one play that
   is a sack AND a turnover must appear on BOTH rows while counting ONCE in the
   headline. If the headline ever equals the sum of the rows on this fixture,
   something has started resolving the overlap by precedence — which is exactly
   what the coach rejected, because it makes a sack disappear into a turnover. */
ok(negLens.engine.lossSacks >= 2 && negLens.engine.turnovers >= 1
  && negLens.engine.distinct < (negLens.engine.turnovers + negLens.engine.lossTotal + negLens.engine.penalties),
  'A strip-sack counts once in the headline while still showing as both a sack and a turnover',
  JSON.stringify({ distinct: negLens.engine.distinct, turnovers: negLens.engine.turnovers,
    lossTotal: negLens.engine.lossTotal, sacks: negLens.engine.lossSacks, penalties: negLens.engine.penalties }));
ok(negLens.cutRows.length === 1 && negLens.cutRows[0] === 'Plays for Loss',
  'Only Plays for Loss claims a film cohort; turnovers, sacks and penalties stay context rather than inventing a cut',
  JSON.stringify(negLens.cutRows));
ok(lensBoard.claims.length >= 8 && lensBoard.claims.every(claim => claim.resolves && claim.clickable) && !lensBoard.orphanCut,
  'Every lens tile that claims a film cohort resolves to a real cut filter, and no tile carries a cut it cannot play',
  JSON.stringify(lensBoard.claims.filter(claim => !claim.resolves)));
ok(lensBoard.heroGone && lensBoard.carried && lensBoard.fourth,
  'The lens board replaces the unlabelled KPI row without dropping a metric it showed', JSON.stringify(lensBoard));
ok(lensBoard.successMatches && lensBoard.thirdMatches && lensBoard.explosiveMatches,
  'Lens values are read from the stats object, never recomputed by the presentation layer', JSON.stringify(lensBoard));
ok(!lensBoard.lensWearsTabAttr && lensBoard.details.filter(Boolean).length >= 3,
  'A lens routes to the report that owns its detail, using its own attribute rather than the tab bar\'s',
  JSON.stringify(lensBoard.details));

// The same guarantee the Glance tile carries: the number a coach reads is the
// number of plays that actually play.
const lensFilm = await page.evaluate(async () => {
  const app = window.app, calls = [], original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  const tile = [...document.querySelectorAll('.gi-reports .gi-lens[data-lens="situational"] .gi-glance-tile.cut-row')][0];
  const shown = Number(tile?.querySelector('strong')?.textContent || 0);
  tile?.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  app.filmNavigation.watch = original;
  const activeId = String(app.storage.seasonStore.data.activeGameId);
  const refs = calls[0]?.refs || [];
  return { shown, refCount: refs.length, calls: calls.length,
    composite: refs.every(ref => /^[^:]+::[^:]+$/.test(String(ref))),
    sameGame: refs.every(ref => String(ref).split('::')[0] === activeId) };
});
ok(lensFilm.calls === 1 && lensFilm.shown > 0 && lensFilm.refCount === lensFilm.shown && lensFilm.composite && lensFilm.sameGame,
  'A Situational lens tile plays exactly as many composite-ref plays as the number it displays', JSON.stringify(lensFilm));

const lensRoute = await page.evaluate(async () => {
  const button = document.querySelector('.gi-reports .gi-lens[data-lens="tendencies"] .gi-lens-more');
  const want = button?.dataset.lensTab || '';
  button?.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  const landed = window.app.reportsScreen.activeTab;
  await window.app.reportsScreen.selectTab('overview');
  return { want, landed, back: window.app.reportsScreen.activeTab };
});
ok(lensRoute.want && lensRoute.landed === lensRoute.want && lensRoute.back === 'overview',
  'The Tendencies lens opens the report that owns its detail', JSON.stringify(lensRoute));

console.log('\n== F3/F4. Every charted game scouts, and the scout says something ==');
const scout = await page.evaluate(() => {
  const engine = window.app.stats;
  const screen = window.app.reportsScreen;
  const listed = engine.listScoutableOpponents();
  const data = engine.generateOpponentScout('Wildcats');
  const join = data?.defenseJoin;
  const root = document.querySelector('#wsReports');
  const rows = [...root.querySelectorAll('[data-opponent-refs]')];
  return {
    listed: listed.map(item => ({ name: item.name, games: item.games, plays: item.plays })),
    // A head-to-head game is a scouting source: their offense read off our
    // defensive snaps, their defense off the fronts we faced.
    headToHeadCounts: !!(data && data.offCount > 0 && data.defCount > 0),
    join: join ? {
      total: join.total, fronts: join.fronts.length, byOurLook: join.byOurLook.length,
      pressureRate: join.pressure.ratePct,
      baseFront: join.baseFront?.name || null,
      // Every row carries its own composite refs, so the join stays film-linked.
      allRefsComposite: [...join.fronts, ...join.coverages, ...join.byOurLook, ...join.bySituation]
        .every(row => row.refs.every(ref => /^[^:]+::[^:]+$/.test(ref))),
      frontRefsMatchCount: join.fronts.every(row => row.refs.length === row.n),
    } : null,
    overviewRows: rows.length,
    perspectiveIsOpponent: screen.perspective === 'opponent',
  };
});
ok(scout.listed.length >= 1 && scout.listed.every(item => item.games > 0 && item.plays > 0),
  'Every opponent with charted film is listed as scoutable, so a scout report exists for each', JSON.stringify(scout.listed));
ok(scout.headToHeadCounts,
  'A head-to-head game feeds the opponent scout — their offense from our defensive snaps, their defense from the fronts we faced', JSON.stringify(scout));
ok(scout.join && scout.join.total > 0 && scout.join.fronts > 0 && scout.join.byOurLook > 0,
  'The defensive scout is the JOIN of their call, our look and the outcome — not a frequency list', JSON.stringify(scout.join));
ok(scout.join?.allRefsComposite && scout.join?.frontRefsMatchCount,
  'Every joined row carries exactly as many composite refs as the snaps it counts', JSON.stringify(scout.join));

const scoutFilm = await page.evaluate(async () => {
  const app = window.app, calls = [], original = app.filmNavigation.watch;
  app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  app.reportsScreen.scoutOpponent('Wildcats');
  await new Promise(resolve => setTimeout(resolve, 200));
  app.reportsScreen.selectTab('defense');
  await new Promise(resolve => setTimeout(resolve, 250));
  const row = document.querySelector('#wsReports [data-opponent-refs]');
  const expected = (row?.dataset.opponentRefs || '').split(',').filter(Boolean);
  const shown = Number(row?.querySelectorAll('td')[1]?.textContent || 0);
  row?.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  app.filmNavigation.watch = original;
  return { calls: calls.length, refs: calls[0]?.refs || [], expected, shown };
});
ok(scoutFilm.calls === 1 && scoutFilm.refs.length === scoutFilm.expected.length && scoutFilm.refs.length === scoutFilm.shown,
  'A defensive scout row plays exactly the snaps it counts', JSON.stringify(scoutFilm));

console.log('\n== F12. The offense has a shape, not just a table ==');
const shape = await page.evaluate(async () => {
  const app = window.app;
  app.reportsScreen.show();
  await new Promise(resolve => setTimeout(resolve, 200));
  app.reportsScreen.selectTab('offense');
  await new Promise(resolve => setTimeout(resolve, 300));
  const root = document.querySelector('#wsReports');
  const engine = app.stats;
  const stats = engine.compute();
  const dist = engine._yardageBins(stats.offPlays);
  const points = engine._scatterPoints(stats.offPlays);
  const zones = engine._fieldZoneStats(stats.offPlays);
  return {
    ramp: root.querySelectorAll('.gi-ramp-row').length,
    rampLinked: root.querySelectorAll('.gi-ramp-row.cut-row').length,
    histBars: root.querySelectorAll('.gi-hist rect').length,
    scatterPoints: root.querySelectorAll('.gi-scatter circle').length,
    zoneCells: root.querySelectorAll('.gi-zone').length,
    multiples: root.querySelectorAll('.gi-multiple').length,
    // The engine owns every derived number; charts.js is handed them.
    engineBins: dist ? dist.bins.reduce((sum, bin) => sum + bin.count, 0) : 0,
    enginePoints: points.length,
    engineZoneTotal: zones.reduce((sum, zone) => sum + zone.count, 0),
    offPlays: stats.offPlays.length,
    // No chart may invent a colour: every fill resolves to a design token.
    rampFill: getComputedStyle(root.querySelector('.gi-ramp-track i') || document.body).backgroundColor,
    losToken: (() => { const probe = document.createElement('div'); probe.style.background = 'var(--gi-los)';
      document.body.appendChild(probe); const value = getComputedStyle(probe).backgroundColor; probe.remove(); return value; })(),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  };
});
ok(shape.ramp > 0 && shape.rampLinked === shape.ramp,
  'Frequency-by-success bars render and every bar plays its own film cohort', JSON.stringify(shape));
ok(shape.histBars > 0 && shape.engineBins === shape.offPlays,
  'The yardage distribution bins every offensive snap exactly once, in the engine', JSON.stringify({ bins: shape.engineBins, plays: shape.offPlays }));
ok(shape.scatterPoints > 0 && shape.scatterPoints === shape.enginePoints,
  'The scatter draws exactly the points the engine derived — no renderer-side filtering', JSON.stringify(shape));
// Empty is OMITTED, not zeroed: with no field position charted the zone strip
// must disappear rather than present six honest-looking 0% cells. This fixture
// tags no yard line, so it pins the omission side of that rule.
ok(shape.multiples > 0 && (shape.engineZoneTotal > 0 ? shape.zoneCells === 6 : shape.zoneCells === 0),
  'Per-down small multiples render, and the field-zone strip appears only when field position is charted', JSON.stringify(shape));
ok(shape.rampFill === shape.losToken,
  'Chart marks resolve to design-system tokens rather than literal colours', JSON.stringify({ fill: shape.rampFill, token: shape.losToken }));
ok(!shape.overflow, 'The visual deck does not push the page sideways', JSON.stringify(shape));

ok(errors.length === 0, 'Native Reports journey produces no page errors', errors.join(' | '));
/* G13 / G2 / G3 / F12c — the opponent Offense rebuild. */
const oppOffense = await page.evaluate(async () => {
  window.app.reportsScreen.scoutOpponent('Wildcats');
  await new Promise(r => setTimeout(r, 400));
  document.querySelector('[data-report-tab="offense"]')?.click();
  await new Promise(r => setTimeout(r, 400));
  const root = document.querySelector('.gi-reports');
  const bt = root?.querySelector('table.bt-table');
  const heads = [...(bt?.querySelectorAll('thead th') || [])].map(th => th.textContent.trim());
  const firstRow = [...(bt?.querySelectorAll('tbody tr:first-child td') || [])].map(td => td.textContent.trim());
  const h3 = [...(root?.querySelectorAll('h3') || [])].map(h => h.textContent.trim());
  return {
    // G13 — cells in charting order: Formation leads, QB alignment second.
    heads, cells: firstRow.length,
    formationFirst: heads[0] === 'Formation' && heads[1] === 'QB align',
    sortable: [...(bt?.querySelectorAll('thead th[data-bt-sort]') || [])].length,
    blankRendersDash: [...(bt?.querySelectorAll('tbody td.bt-blank') || [])].every(td => td.textContent.trim() === '—'),
    // G2 — the two levels above the raw table exist, and the raw table is whole.
    hasByDown: h3.includes('By Down'),
    hasByDistance: h3.includes('By Distance to the Sticks'),
    hasEverySituation: h3.includes('Every Situation'),
    // G3 — the shape visuals reached this tab at all.
    shapeMarks: root?.querySelectorAll('.gi-hist, .gi-scatter, .gi-zones, .gi-multiples, .gi-ramp').length || 0,
    // Opponent rows must NOT claim our cut filters.
    oppShapeCuts: root?.querySelectorAll('.gi-ramp .cut-row').length || 0,
  };
});
ok(oppOffense.formationFirst && oppOffense.sortable === oppOffense.heads.length && oppOffense.blankRendersDash,
  'The Big 13 is sortable cells in charting order — Formation first, untagged dimensions blank',
  JSON.stringify({ heads: oppOffense.heads, sortable: oppOffense.sortable }));
/* G2/G3 — asserted on the opponent Offense HTML the renderer actually produces,
   not on whatever tab the harness happened to leave mounted. Both templates
   call _renderBigTwelve, so a DOM probe can pass against the SELF tab and prove
   nothing about the opponent one. */
const oppRender = await page.evaluate(() => {
  const stats = window.app.stats;
  const data = stats.generateOpponentScout('Wildcats');
  if (!data) return null;
  const html = '';
  const report = stats.generateScoutReport(data.offPlays || []);
  const engine = report ? { byDown: report.byDown, byDistance: report.byDistance,
    situations: (report.downTendency || []).length } : null;
  // Sum of the raw table must equal the charted snaps: the old `.slice(0, 15)`
  // showed 15 rows totalling 30 of 34 and called itself complete.
  const rawTotal = (report?.downTendency || []).reduce((s, d) => s + d.total, 0);
  return { engine, rawTotal, offPlays: (data.offPlays || []).length, html };
});
ok(oppRender?.engine && Array.isArray(oppRender.engine.byDown) && Array.isArray(oppRender.engine.byDistance),
  'The opponent scout derives a by-down and a by-distance-bucket read alongside the raw situations',
  JSON.stringify(oppRender?.engine));
ok(oppRender && oppRender.rawTotal === oppRender.offPlays,
  'Every charted situation is listed — the table accounts for all snaps rather than silently truncating',
  JSON.stringify({ rawTotal: oppRender?.rawTotal, offPlays: oppRender?.offPlays }));

/* ── NO RHETORICAL QUESTIONS IN REPORT COPY ────────────────────────────────
   The coach's standard, stated four separate times: a sub-head is a precise
   definition of the stat below it, never a question posed back at him. Each
   previous sweep removed the instances I happened to grep for and missed the
   rest, because I scoped by ELEMENT (viz-caption, figcaption) instead of by the
   PATTERN. The lens board's question line is a plain <p>, so it survived every
   pass and then spread to the season view when H16 added the lens board there.

   This asserts the pattern across the whole rendered report, so the next place
   copy like this appears fails here instead of in a smoke. Scoped to the
   Reports route: confirmation dialogs legitimately ask questions, and none of
   them render inside this DOM. */
/* MUST WALK EVERY TAB. My first version of this guard ran on whatever pane
   happened to be open at the end of the harness — opponent perspective — and so
   never saw the Offense tab, where _renderShape's headings live. Restoring a
   poetic heading did NOT red it: it was passing vacuously, which is worse than
   no guard because it reads as coverage. Verified by mutation both ways. */
await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  screen.perspective = 'self';
  screen._syncTabState?.();
  screen._renderActiveTab?.();
});
await new Promise(r => setTimeout(r, 400));
const rhetorical = [];
for (const tab of ['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season']) {
  await page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`)?.click(), tab);
  await new Promise(r => setTimeout(r, 500));
  const found = await page.evaluate(tabId => {
    const host = document.querySelector('#statsDashboard, .gi-reports');
    if (!host) return [`${tabId}: NO HOST`];
    const bad = [];
    // Captions and sub-heads: no questions.
    [...host.querySelectorAll('p, figcaption, .viz-caption, .gi-lens-head p, small')]
      .map(el => (el.textContent || '').trim())
      .filter(text => text.endsWith('?') && text.split(/\s+/).length > 2)
      .forEach(text => bad.push(`${tabId}: ${text}`));
  // HEADINGS are the half my first guard could not see: "Where the gains sit"
  // never ends in '?', so a question-mark check passed while the heading above
  // the caption was still poetry. A section heading names the stat below it, so
  // it does not open with an interrogative or a demonstrative.
    const openers = /^(where|how|what|did|do|does|are|is|why|can|should|when|who|this|our|we)\b/i;
    [...host.querySelectorAll('h3, h4')]
      .map(el => (el.textContent || '').trim())
      .filter(text => openers.test(text))
      .forEach(text => bad.push(`${tabId}: ${text}`));
    return bad;
  }, tab);
  found.forEach(item => rhetorical.push(item));
}
ok(rhetorical.length === 0,
  'Report headings and captions name the data literally — no questions, no prose openers',
  JSON.stringify(rhetorical));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
