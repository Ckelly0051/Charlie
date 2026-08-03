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
  app.wizard.setDismissed(true);
  app.wizard.currentStep = 1;
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
    wizardStep: app.wizard.currentStep,
    sideEffects,
    hiddenAfterLoad,
    hiddenAfterReports: native?.classList.contains('hidden'),
    width: Math.round(rect?.width || 0),
    height: Math.round(rect?.height || 0),
    textLength: document.querySelector('[data-native-report-content]')?.textContent.trim().length || 0,
  };
});
ok(result.nav && result.wizardStep === 1 && result.sideEffects === 0
  && !result.hiddenAfterLoad && !result.hiddenAfterReports
  && result.width > 0 && result.height > 0 && result.textLength > 0,
  'Dismissed wizard ignores linked-film video-load events and cannot hide native Reports', JSON.stringify(result));
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
  game.nextId = 65;
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
    border: cardStyle ? parseFloat(cardStyle.borderTopWidth) : 0,
    padding: cardStyle ? parseFloat(cardStyle.paddingTop) : 0,
    background: cardStyle?.backgroundColor,
    valueSize: value ? parseFloat(getComputedStyle(value).fontSize) : 0,
    valueFont: value ? getComputedStyle(value).fontFamily : '',
    retiredContainers: document.querySelectorAll('.stats-overlay').length,
  };
});
// Every number here was wrong before the rescope: display `block`, border and
// padding 0, transparent background, and the KPI value at the inherited 13px —
// a stack of raw text where the coach expects stat cards.
ok(kpiStyling.retiredContainers === 0 && kpiStyling.heroes > 0 && kpiStyling.cards >= 3,
  'Native Reports renders KPI heroes with no retired stats-overlay container present', JSON.stringify(kpiStyling));
ok(kpiStyling.display === 'grid' && kpiStyling.border > 0 && kpiStyling.padding > 0
  && kpiStyling.background !== 'rgba(0, 0, 0, 0)' && kpiStyling.valueSize >= 24,
  'Native Reports KPI cards are real stat blocks, not unstyled stacked text', JSON.stringify(kpiStyling));
ok(/IBM Plex Sans Condensed/i.test(kpiStyling.valueFont),
  'Native Reports numbers use the design-system condensed face', JSON.stringify({ valueFont: kpiStyling.valueFont }));

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
    glanceTiles: document.querySelectorAll('.gi-reports .gi-glance-tile').length,
    glanceLinked: document.querySelectorAll('.gi-reports .gi-glance-tile.cut-row').length,
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
ok(composition.donutBlocks >= 2 && composition.titleOutsideSvg && composition.legendLabels.every(label => /\S+\s+\d/.test(label)),
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
  const tile = [...document.querySelectorAll('.gi-reports .gi-glance-tile.cut-row')]
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

ok(errors.length === 0, 'Native Reports journey produces no page errors', errors.join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);