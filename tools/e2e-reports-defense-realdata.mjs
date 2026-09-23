/** Reports > Defense, Revision 2: canonical real-season evidence.
 *
 * Everything here runs against a read-only, in-memory copy of the registered
 * `2025-st-joseph-mavericks-jv` season, hashed before and after.
 *
 * 1. Every real game at 1440 and 1280, Current game scope: the geometry rules
 *    hold on real data, not just on one fixture.
 * 2. The approved Revision 2 composition, pinned: module inventory, order,
 *    width and external height for both scopes at both desktop widths, and the
 *    ten KPIs with their canonical values.
 * 3. The dashboard's existing data contracts, unchanged by Revision 2.
 * 4. The sticky scope bar and the jump links, on the route's real scroller.
 * 5. Populated captures of the whole surface at 1920, 1440, 1280 and 390 in
 *    both scopes, as IMPLEMENTATION EVIDENCE ONLY - they confer no approval.
 *
 * Chromium measures browser layout. It cannot certify installed WebView2
 * scrollbar rendering; that stays an installed check.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const OUT = `artifacts/defense-production-realdata/run-${process.pid}`;
const DESKTOP = [[1440, 900], [1280, 900]];
const KPI_LABELS = ['Total yards allowed', 'Rush yards allowed', 'Pass yards allowed', 'Yards / play', 'Takeaways',
  'Explosive Plays Allowed', 'Touchdowns Allowed', 'Defensive Touchdowns', '3rd Down Stop %', '4th Down Stop %'];
const SECTIONS = ['Defensive performance', 'Opponent offense', 'Scheme and passing defense', 'Situational results'];

/* THE APPROVED REVISION 2 COMPOSITION on the canonical season: [title, width,
   external height]. Read off the approved comp's rendered layout; module order
   is the order after the pairing rule runs. */
const INVENTORY = {
  season: [
    ['Game-by-game', 'full', 380], ['Disruption', 'full', 286], ['Season vs Last 3', 'full', 324],
    ['By down', 'half', 248], ['By quarter', 'half', 248], ['Opponent drive outcomes', 'full', 300],
    ['Defensive player contributions', 'full', 460], ['Opponent possessions', 'full', 460], ['Production by play type', 'full', 380],
    ['Performance by Play Direction', 'full', 210], ['Top 10 Formations Faced', 'full', 460], ['Personnel faced', 'half', 300],
    ['Backfield faced', 'half', 300], ['Run / Pass vs Strength', 'full', 210], ['Defensive answers by offensive look', 'full', 460],
    ['Passing Defense Summary', 'full', 134], ['Call Performance', 'full', 380], ['Blitz Performance', 'full', 248],
    ['Pressure by situation', 'full', 380], ['Front performance', 'half', 220], ['Coverage performance', 'half', 220],
    ['Blitz Type Performance', 'full', 248], ['Passing by coverage', 'full', 220], ['Call use and performance trends', 'full', 460],
    ['Down & Distance', 'full', 460], ['High-leverage field position', 'full', 336], ['Field zone', 'full', 300],
    ['By hash', 'full', 210], ['Motion', 'full', 300],
  ],
  game: [
    ['Disruption', 'full', 286], ['Current game vs Season', 'full', 324], ['By down', 'half', 248],
    ['By quarter', 'half', 248], ['Opponent drive outcomes', 'full', 220], ['Defensive player contributions', 'full', 380],
    ['Opponent possessions', 'full', 300], ['Production by play type', 'full', 300], ['Performance by Play Direction', 'full', 210],
    ['Top 10 Formations Faced', 'full', 220], ['Personnel faced', 'half', 220], ['Backfield faced', 'half', 220],
    ['Run / Pass vs Strength', 'full', 210], ['Defensive answers by offensive look', 'full', 300], ['Passing Defense Summary', 'full', 134],
    ['Call Performance', 'full', 300], ['Blitz Performance', 'full', 248], ['Pressure by situation', 'full', 300],
    ['Front performance', 'half', 220], ['Coverage performance', 'half', 220], ['Blitz Type Performance', 'full', 248],
    ['Passing by coverage', 'full', 220], ['Call use and performance trends', 'full', 300], ['Down & Distance', 'full', 460],
    ['High-leverage field position', 'full', 336], ['Field zone', 'full', 220], ['By hash', 'full', 210],
    ['Motion', 'full', 300],
  ],
};
const KPI_VALUES = {
  season: ['497', '271', '226', '3.2', '2', '7', '7', '0', '81.4%', '47.1%'],
  game: ['0', '0', '0', '0.0', '1', '0', '0', '0', '100.0%', '—'],
};
const FIXED = new Set(['Disruption', 'Season vs Last 3', 'Current game vs Season', 'By down', 'By quarter',
  'Performance by Play Direction', 'Run / Pass vs Strength', 'Blitz Performance', 'Blitz Type Performance',
  'High-leverage field position', 'By hash', 'Passing Defense Summary']);

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!existsSync(SOURCE)) throw new Error(`Canonical Reports season missing: ${SOURCE}`);
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const games = season.games || [];
const stPeter = games.find(game => /St\. Peter Lutheran/i.test(game.gameInfo?.opponent || ''));
if (!stPeter) throw new Error('Canonical St. Peter Lutheran game missing');
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(data => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
}, season);

/** Open a game, set the scope through the REAL scope button, and settle. */
async function openDefense(gameId, scope) {
  await page.evaluate(async id => {
    const app = window.app;
    app.storage.seasonStore.data.activeGameId = id;
    await app.storage._loadActiveGame();
    app.workspaceShell.show('reports');
    app.reportsScreen.selectTab('defense');
    document.querySelectorAll('.gi-native-toast').forEach(node => node.remove());
  }, gameId);
  await sleep(250);
  await page.evaluate(s => document.querySelector(`[data-defense-scope="${s}"]`)?.click(), scope);
  await sleep(350);
  await page.evaluate(() => { document.querySelector('.ws-reports')?.scrollTo(0, 0); document.querySelectorAll('.gi-native-toast').forEach(node => node.remove()); });
}

/** The rendered board, measured. */
const measure = () => page.evaluate(() => {
  const board = document.querySelector('.gi-def2');
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  const modules = [...(board?.querySelectorAll('[data-def2-module]') || [])].map(module => {
    const rect = module.getBoundingClientRect();
    const wrap = module.querySelector('.gi-def2-tablewrap');
    const rows = [...module.querySelectorAll('tbody tr')];
    const held = rows.filter(row => row.classList.contains('is-held')).length;
    const head = module.querySelector('thead');
    const clipped = [...module.querySelectorAll('th, td')].filter(cell => cell.scrollWidth > cell.clientWidth + 1).length;
    return {
      title: module.dataset.def2Module, schema: module.dataset.def2Schema,
      band: [...board.querySelectorAll('.gi-def2-bands')].indexOf(module.closest('.gi-def2-bands')),
      left: Math.round(rect.left), top: Math.round(rect.top), bottom: Math.round(rect.bottom),
      width: Math.round(rect.width), height: Math.round(rect.height),
      rowHeight: parseFloat(getComputedStyle(module).getPropertyValue('--def2-row-height')) || 38,
      dataRows: rows.length - held, held, clipped,
      wrapClient: wrap.clientHeight, wrapScroll: wrap.scrollHeight,
      tableWider: Math.round(module.querySelector('table').scrollWidth - wrap.clientWidth),
      headPosition: head ? getComputedStyle(head).position : '',
      firstCells: rows.filter(row => !row.classList.contains('is-held')).map(row => text(row.cells[0])),
    };
  });
  const boardRect = board?.getBoundingClientRect();
  return {
    present: !!board,
    kpiLabels: [...(board?.querySelectorAll('[data-def2-kpi] span') || [])].map(text),
    kpiValues: [...(board?.querySelectorAll('[data-def2-kpi] strong') || [])].map(text),
    sections: [...(board?.querySelectorAll('[data-def2-section] h2') || [])].map(text),
    // The section's own two-cohort line. `.gi-def2-cohort` is the separate
    // KPI-strip cohort label added by the 1.12.0-90 REVISE and is asserted
    // on its own below, so it is excluded from this one.
    samples: [...(board?.querySelectorAll('[data-def2-section] small:not(.gi-def2-cohort)') || [])].map(text),
    kpiCohort: text(board?.querySelector('[data-def2-cohort="performance"]')),
    moduleMetas: Object.fromEntries([...(board?.querySelectorAll('[data-def2-meta]') || [])]
      .map(node => [node.dataset.def2Meta, text(node)])),
    // Re-derived from the rendered rows: the Snaps column of each module.
    directionSnapSum: [...(board?.querySelectorAll('[data-def2-module="Performance by Play Direction"] tbody tr') || [])]
      .filter(tr => !tr.classList.contains('is-held'))
      .reduce((sum, tr) => sum + (Number(text(tr.cells[1])) || 0), 0),
    playTypeSnapSum: [...(board?.querySelectorAll('[data-def2-module="Production by play type"] tbody tr') || [])]
      .filter(tr => !tr.classList.contains('is-held'))
      .reduce((sum, tr) => sum + (Number(text(tr.cells[1])) || 0), 0),
    modules,
    pageOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    boardRight: boardRect ? Math.round(boardRect.right) : 0,
    viewport: window.innerWidth,
    text: text(board),
    headerSub: text(document.querySelector('[data-reports-title]')?.parentElement),
    route: document.querySelector('.gi-reports-tab.active')?.dataset.reportTab,
    reportTitleClipped: (() => {
      const node = document.querySelector('[data-reports-title]');
      // The approved global-strip head is one fixed row, so the title may only
      // truncate as a last resort; at the release widths it must not.
      return !!node && (node.scrollWidth > node.clientWidth + 1 || node.scrollHeight > node.clientHeight + 1);
    })(),
    linescore: document.querySelector('[data-reports-scorebug]')?.hidden === false,
    /* SHARED CHROME: CONTENT edges, not border boxes. A full-bleed band's own
       box starts at 0 by design; where its content starts has to line up. */
    edges: Object.fromEntries([
      ['title', '.gi-reports-reporthead .gi-reports-title-block'],
      ['headActions', '.gi-reports-reporthead .gi-reports-head-actions'],
      ['stripStart', '[data-reports-strip] .gi-reports-model'],
      ['stripEnd', '[data-reports-strip] .gi-reports-actions'],
      ['pane', '.gi-report-pane'],
    ].map(([key, selector]) => {
      const node = document.querySelector(selector);
      if (!node) return [key, null];
      const rect = node.getBoundingClientRect();
      const style = getComputedStyle(node);
      return [key, { left: Math.round(rect.left + parseFloat(style.paddingLeft)),
        right: Math.round(rect.right - parseFloat(style.paddingRight)) }];
    })),
    /* ONE LEFT EDGE PER COLUMN: a row that opens film and a dash row start their
       label on the same pixel. Measured with a Range, because only the text
       inside an identical cell box would move. */
    columnOrigins: [...(board?.querySelectorAll('[data-def2-module]') || [])].map(module => {
      const rows = [...module.querySelectorAll('tbody tr')];
      if (rows.length < 2) return null;
      const lefts = [...new Set(rows.map(row => {
        const range = document.createRange();
        range.selectNodeContents(row.children[0]);
        return Math.round(range.getBoundingClientRect().left);
      }))];
      return lefts.length > 1 ? `${module.dataset.def2Module}:${lefts.join('/')}` : null;
    }).filter(Boolean),
    /* THE 12.5px FLOOR on every text-bearing element of the board. */
    subFloor: [...(board?.querySelectorAll('*') || [])]
      .filter(node => getComputedStyle(node).visibility !== 'hidden'
        && [...node.childNodes].some(child => child.nodeType === 3 && child.nodeValue.trim()))
      .map(node => ({ what: `${node.tagName}.${String(node.className || '')}:${text(node).slice(0, 20)}`,
        size: parseFloat(getComputedStyle(node).fontSize) }))
      .filter(item => item.size < 12.5),
    titleFonts: [...(board?.querySelectorAll('[data-def2-module] > header > h3') || [])].map(node => getComputedStyle(node).fontFamily),
    /* NO FABRICATED ZERO: a charted look never reads 0 snaps. */
    zeroSnapCells: [...(board?.querySelectorAll('[data-def2-module]') || [])].flatMap(module => {
      if (!['Top 10 Formations Faced', 'Personnel faced', 'Backfield faced', 'Motion', 'By hash',
        'Production by play type', 'Performance by Play Direction', 'Pressure by situation', 'Field zone',
        'Down & Distance'].includes(module.dataset.def2Module)) return [];
      const col = [...module.querySelectorAll('thead th')].findIndex(th => /^Snaps/.test(text(th)));
      return col < 0 ? [] : [...module.querySelectorAll('tbody tr:not(.is-held)')]
        .filter(row => text(row.children[col]) === '0').map(row => `${module.dataset.def2Module}:${text(row.children[0])}`);
    }),
  };
});

/* ══ 1. Every real game, Current game scope, both desktop widths ══════════ */
console.log('\n== 1. Every real game at 1440 and 1280 ==');
const geometry = [];
for (const game of games) {
  await openDefense(game.id, 'game');
  for (const [width, height] of DESKTOP) {
    await page.setViewport({ width, height });
    await sleep(200);
    geometry.push({ game: game.gameInfo?.opponent, width, ...(await measure()) });
  }
}
ok(geometry.every(item => item.present), 'the Revision 2 board renders for every real game at both widths');
ok(geometry.every(item => JSON.stringify(item.kpiLabels) === JSON.stringify(KPI_LABELS)),
  'every game shows the ten KPIs, in order, with their literal labels',
  JSON.stringify(geometry.find(item => JSON.stringify(item.kpiLabels) !== JSON.stringify(KPI_LABELS))?.kpiLabels));
ok(geometry.every(item => JSON.stringify(item.sections) === JSON.stringify(SECTIONS)),
  'every game renders the four sections in order', JSON.stringify(geometry.map(item => item.sections).find(s => JSON.stringify(s) !== JSON.stringify(SECTIONS))));
ok(geometry.every(item => !item.modules.some(module => module.title === 'Game-by-game')),
  'Current game scope never renders Game-by-game');
const heightRule = module => {
  if (FIXED.has(module.title)) return module.height === 96 + Math.max(1, module.dataRows) * module.rowHeight && module.held === 0;
  if (![220, 300, 380, 460].includes(module.height)) return false;
  const capacity = Math.floor((module.height - 96) / module.rowHeight);
  return module.dataRows > capacity ? module.held === 0 : module.held === capacity - module.dataRows;
};
const heightBreaks = geometry.flatMap(item => item.modules.filter(module => !heightRule(module))
  .map(module => `${item.game}@${item.width}:${module.title}:${module.height}/${module.dataRows}+${module.held}`));
ok(heightBreaks.length === 0,
  'fixed-schema modules fit their rows exactly; variable modules take a standard height and fill unused capacity with dash rows',
  JSON.stringify(heightBreaks.slice(0, 6)));
// Data taller than the module's row area (height minus its 96px of chrome).
const overflowing = geometry.flatMap(item => item.modules.filter(module => module.dataRows * module.rowHeight > module.height - 96));
ok(overflowing.length > 0 && overflowing.every(module => module.wrapScroll > module.wrapClient && module.headPosition === 'sticky'),
  'a module whose data exceeds its capacity scrolls internally under a sticky header at its fixed height',
  JSON.stringify(overflowing.slice(0, 3)));
const misaligned = geometry.flatMap(item => {
  const rows = new Map();
  item.modules.forEach(module => rows.set(module.top, [...(rows.get(module.top) || []), module]));
  return [...rows.values()].filter(row => row.length > 1 && (new Set(row.map(module => module.bottom)).size > 1
    || row.some(module => module.width > item.width / 2)))
    .map(row => `${item.game}@${item.width}:${row.map(module => module.title).join('+')}`);
});
ok(misaligned.length === 0, 'paired half-width modules share top and bottom edges', JSON.stringify(misaligned.slice(0, 4)));
/* Inside each section's band, one row of modules ends 20px above the next. */
const gutters = geometry.flatMap(item => {
  const breaks = [];
  for (const band of new Set(item.modules.map(module => module.band))) {
    const tops = [...new Set(item.modules.filter(module => module.band === band).map(module => module.top))].sort((a, b) => a - b);
    tops.slice(1).forEach((top, index) => {
      const bottom = Math.max(...item.modules.filter(module => module.band === band && module.top === tops[index]).map(module => module.bottom));
      if (top - bottom !== 20) breaks.push(`${item.game}@${item.width}:band${band}:${top - bottom}`);
    });
  }
  return breaks;
});
ok(gutters.length === 0, 'modules stack on 20px gutters', JSON.stringify(gutters.slice(0, 4)));
ok(geometry.every(item => item.pageOverflow <= 0 && item.modules.every(module => module.tableWider <= 1)),
  'no page-level or in-module horizontal overflow at desktop widths',
  JSON.stringify(geometry.filter(item => item.pageOverflow > 0 || item.modules.some(module => module.tableWider > 1))
    .map(item => ({ game: item.game, width: item.width, page: item.pageOverflow,
      tables: item.modules.filter(module => module.tableWider > 1).map(module => module.title) })).slice(0, 3)));
ok(geometry.every(item => item.modules.every(module => module.clipped === 0)),
  'no table cell clips its own text',
  JSON.stringify(geometry.flatMap(item => item.modules.filter(module => module.clipped).map(module => `${item.game}@${item.width}:${module.title}`)).slice(0, 5)));
ok(geometry.every(item => item.route === 'defense'), 'Defense is the active report before anything is measured');
ok(geometry.every(item => !item.reportTitleClipped),
  'the complete Reports title remains visible at both release widths',
  JSON.stringify(geometry.filter(item => item.reportTitleClipped).map(item => `${item.game}@${item.width}`).slice(0, 4)));
const withEdges = geometry.filter(item => item.edges?.pane && item.edges?.stripStart && item.edges?.stripEnd && item.edges?.title && item.edges?.headActions);
ok(withEdges.length === geometry.length,
  'every shared Reports band is on screen before its edges are measured',
  JSON.stringify(geometry.filter(item => !withEdges.includes(item)).map(item => `${item.game}@${item.width}`).slice(0, 3)));
const leftRagged = withEdges.flatMap(item => ['title', 'stripStart']
  .filter(key => Math.abs(item.edges[key].left - item.edges.pane.left) > 1)
  .map(key => `${item.game}/${item.width}:${key}:${item.edges[key].left} vs pane ${item.edges.pane.left}`));
ok(leftRagged.length === 0, "the report title and the global strip start on the report frame's own left inset",
  JSON.stringify([...new Set(leftRagged)].slice(0, 4)));
const rightRagged = withEdges.flatMap(item => ['headActions', 'stripEnd']
  .filter(key => Math.abs(item.edges[key].right - item.edges.pane.right) > 1)
  .map(key => `${item.game}/${item.width}:${key}:${item.edges[key].right} vs pane ${item.edges.pane.right}`));
ok(rightRagged.length === 0, "the head commands and the strip's Export end on the report frame's own right inset",
  JSON.stringify([...new Set(rightRagged)].slice(0, 4)));
/* Coach decision, 2026-09-22: the game linescore is an Overview fact. The
   Defense linescore band and its identity strip are retired, not moved. */
ok(geometry.every(item => !item.linescore),
  'current-game Defense carries no linescore at either release width',
  JSON.stringify(geometry.filter(item => item.linescore).map(item => `${item.game}/${item.width}`).slice(0, 4)));
ok(geometry.every(item => item.columnOrigins.length === 0),
  'every first column has one left edge, whether or not a row opens film',
  JSON.stringify([...new Set(geometry.flatMap(item => item.columnOrigins))].slice(0, 4)));
ok(geometry.every(item => item.subFloor.length === 0),
  'every text element on the Defense board meets the 12.5px floor',
  JSON.stringify([...new Set(geometry.flatMap(item => item.subFloor.map(entry => `${entry.what}@${entry.size}`)))].slice(0, 8)));
ok(geometry.every(item => item.titleFonts.length > 20 && item.titleFonts.every(font => /IBM Plex Sans/i.test(font) && !/Condensed/i.test(font))),
  'every Defense module title uses the approved sans face');
ok(geometry.every(item => item.zeroSnapCells.length === 0),
  'no rendered Defense row prints 0 snaps for a charted look',
  JSON.stringify(geometry.filter(item => item.zeroSnapCells.length).map(item => ({ game: item.game, cells: item.zeroSnapCells })).slice(0, 3)));
ok(geometry.every(item => !/Last 3/.test(item.text)),
  'Current game scope never labels one game as Last 3');
ok(geometry.every(item => item.samples.every(sample => /^\d+ charted \/ \d+ with Run\/Pass charted$/.test(sample))),
  'every section names both cohorts: charted and with Run/Pass charted');
/* The 1.12.0-90 REVISE: every module that measures its own cohort names it, in
   counts computed from that cohort. Checked on the canonical season at every
   game, against values derived here from the same rendered rows — the board's
   St. Peter numbers are not written into the assertion. */
ok(geometry.every(item => /^\d+ run\/pass snaps$/.test(item.kpiCohort || '')),
  'the KPI strip names the classified cohort it measures',
  JSON.stringify(geometry.map(item => [item.game, item.kpiCohort]).slice(0, 3)));
ok(geometry.every(item => /^\d+ snaps · \d+ tags$/.test(item.moduleMetas['Production by play type'] || '')),
  'Production by play type states its unique snaps and its overlapping tag count',
  JSON.stringify(geometry.map(item => [item.game, item.moduleMetas['Production by play type']]).slice(0, 3)));
ok(geometry.every(item => /^\d+ direction-tagged snaps$/.test(item.moduleMetas['Performance by Play Direction'] || '')),
  'Performance by Play Direction names its direction-tagged cohort',
  JSON.stringify(geometry.map(item => [item.game, item.moduleMetas['Performance by Play Direction']]).slice(0, 3)));
ok(geometry.every(item => /^\d+ snaps · penalties included$/.test(item.moduleMetas['Opponent possessions'] || '')),
  'Opponent possessions names its cohort and its penalty inclusion',
  JSON.stringify(geometry.map(item => [item.game, item.moduleMetas['Opponent possessions']]).slice(0, 3)));
/* The cohort each label names must be the one the module actually measured, so
   the counts are re-derived from the rendered rows rather than trusted. */
ok(geometry.every(item => {
  const direction = Number((item.moduleMetas['Performance by Play Direction'] || '').match(/^(\d+)/)?.[1]);
  const tags = Number((item.moduleMetas['Production by play type'] || '').match(/· (\d+) tags/)?.[1]);
  return Number.isFinite(direction) && Number.isFinite(tags)
    && direction === item.directionSnapSum && tags === item.playTypeSnapSum;
}), 'every cohort count equals the sum of the rows it describes',
  JSON.stringify(geometry.map(item => [item.game, item.moduleMetas['Performance by Play Direction'],
    item.directionSnapSum, item.moduleMetas['Production by play type'], item.playTypeSnapSum]).slice(0, 3)));
ok(geometry.every(item => !/\bTD\b|ADDED|Click any column|Scroll inside|not a recommended call/.test(item.text)),
  'the board carries no ambiguous TD abbreviation, proposal marker or explanatory prose',
  (geometry.find(item => /\bTD\b|ADDED|Click any column|Scroll inside|not a recommended call/.test(item.text))?.text || '').match(/.{0,40}(\bTD\b|ADDED|Click any column|Scroll inside|not a recommended call).{0,40}/)?.[0]);

/* ══ 2. The approved composition, pinned on the canonical season ═════════ */
console.log('\n== 2. Canonical composition ==');
for (const scope of ['season', 'game']) {
  await openDefense(stPeter.id, scope);
  for (const [width, height] of DESKTOP) {
    await page.setViewport({ width, height });
    await sleep(200);
    const seen = await measure();
    const full = width === 1440 ? 1376 : 1216;
    const half = (full - 20) / 2;
    const inventory = seen.modules.map(module => [module.title,
      Math.abs(module.width - full) <= 6 ? 'full' : Math.abs(module.width - half) <= 4 ? 'half' : `w${module.width}`, module.height]);
    ok(JSON.stringify(inventory) === JSON.stringify(INVENTORY[scope]),
      `${scope} @${width}: module inventory, order, width and height match the approved Revision 2 composition`,
      JSON.stringify(inventory.map((row, i) => JSON.stringify(row) === JSON.stringify(INVENTORY[scope][i]) ? null : { got: row, want: INVENTORY[scope][i] }).filter(Boolean).slice(0, 4)));
    ok(JSON.stringify(seen.kpiValues) === JSON.stringify(KPI_VALUES[scope]),
      `${scope} @${width}: the ten KPIs carry the canonical values`, JSON.stringify(seen.kpiValues));
    if (width === 1440 && scope === 'season') {
      const outcomes = seen.modules.find(module => module.title === 'Opponent drive outcomes')?.firstCells;
      ok(JSON.stringify(outcomes) === JSON.stringify(['Touchdown', 'Punt', 'Turnover', 'Downs', 'Other / unresolved']),
        'season drive outcomes list only the outcomes that occurred, with Touchdown spelled out', JSON.stringify(outcomes));
    }
    if (width === 1440 && scope === 'game') {
      const outcomes = seen.modules.find(module => module.title === 'Opponent drive outcomes')?.firstCells;
      ok(JSON.stringify(outcomes) === JSON.stringify(['Punt', 'Turnover', 'Downs']),
        'the St. Peter Lutheran game lists its own three drive outcomes and no empty ones', JSON.stringify(outcomes));
      ok(/Current game/.test(seen.headerSub) || !/Full season/.test(seen.headerSub),
        'the scope button resynchronizes the shared header to Current game', seen.headerSub);
    }
  }
}

/* The Revision 2 model on the canonical cohort: touchdowns by scoring side and
   the stop percentages as the inverse of the existing allowed percentages. */
const boardModel = await page.evaluate(gameId => {
  const app = window.app;
  const opponents = Object.fromEntries(app.storage.seasonStore.data.games.map(g => [String(g.id), g.gameInfo?.opponent || g.id]));
  const { scoped: seasonPlays, labels } = app.reportsScreen._selfPerspectiveCohort('season');
  const gamePlays = seasonPlays.filter(p => String(p.__gid) === String(gameId));
  const seasonBoard = app.stats.defenseBoard(seasonPlays, { scope: 'season', seasonPlays, labels: opponents });
  const gameBoard = app.stats.defenseBoard(gamePlays, { scope: 'game', seasonPlays, labels: opponents });
  const seasonDash = app.stats.defenseDashboard(seasonPlays, opponents);
  const strip = value => JSON.parse(JSON.stringify(value, (key, v) => key === 'plays' ? undefined : v));
  return {
    season: seasonBoard.kpis, game: gameBoard.kpis,
    third: seasonDash.thirdDownAllowed.rate, fourth: seasonDash.fourthDownAllowed.rate,
    dashboardUnchanged: JSON.stringify(strip(seasonBoard.dashboard)) === JSON.stringify(strip(seasonDash)),
    gameComparison: gameBoard.comparison.find(row => row.name === 'Yards / play'),
    labelsDiffer: labels !== opponents,
    leverage: Object.fromEntries(seasonBoard.highLeverage.map(row => [row.name, { sample: row.sample, touchdownsAllowed: row.touchdownsAllowed }])),
  };
}, stPeter.id);
const leverage = boardModel.leverage;
ok(leverage['Red-zone possessions']?.sample === 8 && leverage['Red-zone possessions']?.touchdownsAllowed === 6,
  '2025 JV full season: 8 opponent red-zone possessions, 6 ending in a touchdown allowed (measured from our goal line)', JSON.stringify(leverage));
ok(leverage['Goal line / snaps']?.sample <= leverage['Inside our 20 / snaps']?.sample
  && leverage['Inside our 20 / snaps']?.touchdownsAllowed >= leverage['Goal line / snaps']?.touchdownsAllowed
  && leverage['Opponent backed up / snaps']?.touchdownsAllowed === 0,
  'goal-line snaps are a subset of inside-our-20 snaps, and no touchdown is allowed from the opponent backed up', JSON.stringify(leverage));
ok(boardModel.season.touchdownsAllowed === 7 && boardModel.season.defensiveTouchdowns === 0,
  '2025 JV full season: Touchdowns Allowed 7, Defensive Touchdowns 0', JSON.stringify(boardModel.season));
ok(boardModel.game.touchdownsAllowed === 0 && boardModel.game.defensiveTouchdowns === 0,
  'St. Peter Lutheran current game: Touchdowns Allowed 0, Defensive Touchdowns 0', JSON.stringify(boardModel.game));
ok(boardModel.season.thirdDownStop === +(100 - boardModel.third).toFixed(1) && boardModel.season.thirdDownStop === 81.4
  && boardModel.season.fourthDownStop === +(100 - boardModel.fourth).toFixed(1) && boardModel.season.fourthDownStop === 47.1,
  '3rd and 4th Down Stop % are the inverse of the existing allowed percentages', JSON.stringify(boardModel));
ok(boardModel.dashboardUnchanged, 'the board carries the existing defenseDashboard output unchanged');
ok(boardModel.gameComparison?.current === 0 && boardModel.gameComparison?.comparison === 3.2,
  'Current game vs Season compares the game with the full season', JSON.stringify(boardModel.gameComparison));

/* ══ 3. The dashboard's existing data contracts ═══════════════════════════ */
console.log('\n== 3. Existing Defense data contracts ==');
await openDefense(season.activeGameId || games[0].id, 'season');
const canonical = await page.evaluate(() => {
  const app = window.app;
  const { scoped, labels } = app.reportsScreen._defenseCohort();
  const model = app.stats.defenseDashboard(scoped, labels);
  return {
    total: model.total, measured: model.measured,
    summarySnaps: model.summary.n, summaryCharted: model.summary.charted,
    summaryMeasured: model.summary.measured,
    yards: model.summary.yards, rush: model.summary.runYards,
    pass: model.summary.passYards, ypp: model.summary.ypp, turnovers: model.summary.turnovers,
    explosives: model.summary.explosives,
    third: model.thirdDownAllowed, fourth: model.fourthDownAllowed,
    dd: model.downDistance.map(row => row.name),
    emptyDd: model.downDistance.filter(row => !row.n).map(row => row.name),
    calls: model.topCalls.map(row => `${row.name}:${row.n}`),
    worstCalls: model.worstCalls.map(row => `${row.name}:${row.n}`),
    firstLongCallPct: model.downDistance.find(row => row.name === '1st & 7+')?.callPct,
    zones: model.zones.map(row => `${row.name}:${row.n}`),
    formationCalls: model.formationCalls.map(row => ({
      name: row.name, n: row.n,
      playTypes: row.playTypes.map(item => ({ name: item.name, n: item.n, pct: item.pct })),
    })),
    formationPlayTypes: model.formationPlayTypes,
    directions: model.directions.map(row => ({ name: row.name, n: row.n, runs: row.runs,
      passes: row.passes, isRelative: row.isRelative })),
    driveOutcomes: model.driveOutcomes.map(row => ({ name: row.name, n: row.n, pct: row.pct })),
    byGame: model.byGame.map(row => ({ name: row.name, n: row.n, charted: row.charted,
      yards: row.yards, rush: row.runYards, pass: row.passYards, ypp: row.ypp })),
    productionRows: [model.summary, ...model.byGame, ...model.downs, ...model.quarters,
      ...model.playTypes, ...model.personnel, ...model.backfields, ...model.directions,
      model.pressure.blitz, model.pressure.noBlitz, ...model.zones, ...model.hashes,
      ...model.motions, ...model.downDistance].map(row => ({ name: row.name, n: row.n,
        charted: row.charted, measured: row.measured, held: !!row.held,
        yards: row.yards, runYards: row.runYards, passYards: row.passYards,
        ypp: row.ypp, explosives: row.explosives })),
    blitzCohort: {
      blitz: model.pressure.blitz.n, noBlitz: model.pressure.noBlitz.n,
      blitzCharted: model.pressure.blitz.charted, noBlitzCharted: model.pressure.noBlitz.charted,
      situations: model.downDistance.map(row => ({ name: row.name, n: row.n,
        charted: row.charted, callPct: row.callPct, blitzPct: row.blitzPct })),
    },
    ranked: {
      formationCalls: model.formationCalls.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      personnel: model.personnel.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      backfields: model.backfields.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      motions: model.motions.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      hashes: model.hashes.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      zones: model.zones.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
      directions: model.directions.map(r => ({ name: r.name, n: r.n, charted: r.charted, measured: r.measured })),
    },
  };
});
/* THE FOUR CANONICAL COHORTS, pinned so a future change cannot quietly merge
   them. Every production measure uses the classified subset. */
const cohorts = await page.evaluate(() => {
  const games = window.app.storage.seasonStore.data.games || [];
  const all = games.flatMap(g => g.plays || []);
  const classified = p => !!(p.tags.playType || p.tags.runPass);
  const off = p => (p.tags.unit || 'offense') === 'offense';
  const def = p => p.tags.unit === 'defense';
  return {
    charted: all.length,
    offenseCharted: all.filter(off).length,
    offenseClassified: all.filter(p => off(p) && classified(p)).length,
    defenseCharted: all.filter(def).length,
    defenseClassified: all.filter(p => def(p) && classified(p)).length,
  };
});
ok(cohorts.charted === 449 && cohorts.offenseCharted === 201 && cohorts.offenseClassified === 173
  && cohorts.defenseCharted === 174 && cohorts.defenseClassified === 154,
  'the canonical season reconciles to its four cohorts: 201/173 offensive, 174/154 defensive',
  JSON.stringify(cohorts));
/* TOTAL YARDS IS THE SUM OF THE TWO COLUMNS BESIDE IT, on every row. */
const unreconciled = canonical.byGame.filter(row => row.yards !== (row.rush || 0) + (row.pass || 0));
ok(unreconciled.length === 0,
  'every Game-by-game row reconciles: Total yds equals Rush yds plus Pass yds',
  JSON.stringify(unreconciled));
const oll = canonical.byGame.find(row => /OL Lakes/.test(row.name));
ok(oll && oll.yards === 127 && oll.rush === 72 && oll.pass === 55,
  'the canonical Week 5 defensive line is 127 = 72 + 55, penalty-only yardage excluded',
  JSON.stringify(oll));
ok(canonical.byGame.reduce((sum, row) => sum + row.yards, 0) === canonical.yards,
  'the six game rows sum to the season total rather than agreeing by coincidence',
  JSON.stringify({ rows: canonical.byGame.map(r => r.yards), season: canonical.yards }));
ok(canonical.total === 174 && canonical.yards === 497 && canonical.rush === 271 && canonical.pass === 226
  && canonical.ypp === 3.2 && canonical.turnovers === 2 && canonical.explosives === 7,
  'the canonical season owns the approved Defense KPI values', JSON.stringify(canonical));
/* A RATE'S TWO HALVES ARE ONE COHORT. */
ok(canonical.ypp === +(canonical.yards / cohorts.defenseClassified).toFixed(1),
  'Yards allowed / play divides the classified yardage by the classified cohort',
  JSON.stringify({ ypp: canonical.ypp, yards: canonical.yards, classified: cohorts.defenseClassified, charted: canonical.total }));
ok(canonical.ypp !== +(canonical.yards / canonical.total).toFixed(1),
  'the two denominators really do differ here, so that assertion can fail',
  JSON.stringify({ classified: cohorts.defenseClassified, charted: canonical.total }));
/* TWO COHORTS, BOTH NAMED. */
ok(canonical.summarySnaps === cohorts.defenseCharted
  && canonical.summaryCharted === cohorts.defenseCharted
  && canonical.summaryMeasured === cohorts.defenseClassified
  && canonical.total === cohorts.defenseCharted && canonical.measured === cohorts.defenseClassified,
  'displayed Snaps is the charted cohort and the measured cohort is named separately',
  JSON.stringify({ snaps: canonical.summarySnaps, charted: canonical.summaryCharted,
    measured: canonical.summaryMeasured, total: canonical.total, modelMeasured: canonical.measured, cohorts }));
const measuredRows = canonical.productionRows.filter(row => !row.held && row.measured > 0);
const mixedProductionRows = measuredRows.filter(row =>
  row.ypp !== +(row.yards / row.measured).toFixed(1)
  || row.yards !== (row.runYards || 0) + (row.passYards || 0));
ok(measuredRows.length >= 40 && mixedProductionRows.length === 0,
  'every measured defensive row reconciles Total yards, Rush plus Pass, and Yards/play over its own measured cohort',
  JSON.stringify({ rows: measuredRows.length, mixed: mixedProductionRows }));
/* CHARTED BUT UNMEASURED: the row keeps its real charted count and reports NO
   production at all. */
const unmeasuredRows = canonical.productionRows.filter(row => !row.held
  && row.charted > 0 && row.measured === 0);
const badUnmeasured = unmeasuredRows.filter(row => row.n !== row.charted
  || row.yards !== null || row.runYards !== null || row.passYards !== null
  || row.ypp !== null || row.explosives !== null);
ok(unmeasuredRows.length > 0 && badUnmeasured.length === 0,
  'a charted-but-unmeasured row keeps its charted Snaps and reports every production value as absent',
  JSON.stringify({ found: unmeasuredRows, bad: badUnmeasured }));
const zeroSnapRows = Object.entries(canonical.ranked).flatMap(([set, rows]) =>
  rows.filter(row => row.charted > 0 && row.n === 0).map(row => `${set}:${row.name}`));
ok(zeroSnapRows.length === 0,
  'no defensive tendency row reports 0 snaps for a look the coach charted',
  JSON.stringify(zeroSnapRows));
const misordered = Object.entries(canonical.ranked)
  .filter(([set]) => ['formationCalls', 'personnel', 'backfields', 'motions'].includes(set))
  .flatMap(([set, rows]) => rows.slice(1)
    .filter((row, i) => (row.charted ?? 0) > (rows[i].charted ?? 0)).map(row => `${set}:${row.name}`));
ok(misordered.length === 0, 'every ranked tendency set orders by charted frequency',
  JSON.stringify(misordered));
const blitzSituations = canonical.blitzCohort.situations;
const blitzDenomMismatch = blitzSituations.filter(row => row.n !== row.charted);
ok(canonical.blitzCohort.blitz === canonical.blitzCohort.blitzCharted
  && canonical.blitzCohort.noBlitz === canonical.blitzCohort.noBlitzCharted
  && blitzDenomMismatch.length === 0,
  'the displayed Blitz and No Blitz counts and every situational blitz rate use one charted cohort',
  JSON.stringify({ cohort: canonical.blitzCohort.blitz, noBlitz: canonical.blitzCohort.noBlitz,
    mismatch: blitzDenomMismatch }));
ok(canonical.third.made === 8 && canonical.third.attempts === 43 && canonical.third.rate === 18.6
  && canonical.fourth.made === 9 && canonical.fourth.attempts === 17 && canonical.fourth.rate === 52.9,
  'third- and fourth-down allowed use offensive conversion polarity', JSON.stringify(canonical));
ok(JSON.stringify(canonical.dd) === JSON.stringify([
  '1st & 1-3', '1st & 4-6', '1st & 7+', '2nd & 1-3', '2nd & 4-6', '2nd & 7+',
  '3rd & 1-3', '3rd & 4-6', '3rd & 7+', '4th & 1-3', '4th & 4-6', '4th & 7+',
]) && canonical.emptyDd.includes('1st & 4-6'),
  'the dashboard keeps all 12 down-and-distance buckets in football order, including the empty cohort', JSON.stringify(canonical.dd));
ok(JSON.stringify(canonical.calls) === JSON.stringify([
  'Maverick + Jumbo Shift | Cover 3 | A-Gap:4',
  'Maverick | Cover 3:109',
  'Maverick + Jumbo Shift | Cover 3:28',
  'Maverick | Cover 3 | A-Gap:7',
]) && canonical.worstCalls.length === 4,
  'call performance ranks the four calls that qualify at four classified snaps', JSON.stringify(canonical));
ok(canonical.firstLongCallPct > 0 && canonical.firstLongCallPct <= 100,
  'call performance uses classified snaps while situational call share uses every charted call', JSON.stringify(canonical.calls));
ok(JSON.stringify(canonical.zones.map(value => value.split(':')[0])) === JSON.stringify([
  'Backed Up', 'Open Field', 'Opp 40–20', 'Red Zone', 'Goal Line',
]), 'field zones use five display slots backed by canonical field-position buckets', JSON.stringify(canonical.zones));
/* FIELD ZONE IS MEASURED FROM OUR GOAL LINE. Read with the offense-oriented
   bucketer this season reported Backed Up 11 / Open Field 110 / Opp 40–20 43 /
   Red Zone 5 and no Goal Line row at all — the opponent's snaps inside our 20
   counted as its own backed-up territory. The zone counts reconcile with the
   High-leverage rows above: Red Zone + Goal Line = inside our 20, Goal Line and
   Backed Up match exactly. */
ok(JSON.stringify(canonical.zones) === JSON.stringify([
  'Backed Up:2', 'Open Field:94', 'Opp 40–20:43', 'Red Zone:26', 'Goal Line:4',
]), '2025 JV full season field zones, measured from our own goal line', JSON.stringify(canonical.zones));
const zoneOf = name => Number((canonical.zones.find(value => value.startsWith(`${name}:`)) || '').split(':')[1]);
ok(zoneOf('Red Zone') + zoneOf('Goal Line') === leverage['Inside our 20 / snaps']?.sample
  && zoneOf('Goal Line') === leverage['Goal line / snaps']?.sample
  && zoneOf('Backed Up') === leverage['Opponent backed up / snaps']?.sample,
  'Field zone and High-leverage field position report the same field position',
  JSON.stringify({ zones: canonical.zones, leverage }));
ok(canonical.formationCalls.length >= 6
  && canonical.formationCalls.every(row => row.name && row.playTypes.length === 7
    && row.playTypes.every(item => item.pct === Math.round(item.n / row.n * 100)))
  && canonical.formationCalls.some(row => row.name === 'I-Form + Twins'
    && row.playTypes.some(item => item.name === 'Run Inside' && item.n > 0)),
  'combined offensive looks are preserved with every canonical play-type share',
  JSON.stringify(canonical.formationCalls));
ok(JSON.stringify(canonical.formationPlayTypes) === JSON.stringify([
  'Run Outside', 'Run Inside', 'RPO', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Screen',
]), 'the formation matrix keeps one fixed seven-play-type schema', JSON.stringify(canonical.formationPlayTypes));
ok(canonical.directions.length === 5
  && canonical.directions.filter(row => !row.isRelative).length === 3
  && canonical.directions.filter(row => row.isRelative).length === 2
  && canonical.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.runs, 0) === 112
  && canonical.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.passes, 0) === 36
  && canonical.directions.some(row => row.name === 'Toward Strength' && row.isRelative)
  && canonical.directions.some(row => row.name === 'Away from Strength' && row.isRelative),
  'direction adds strength-relative rows without double-counting its absolute legend',
  JSON.stringify(canonical.directions));
ok(canonical.driveOutcomes.length === 7,
  'the dashboard keeps its seven aggregate drive outcome groups for the export', JSON.stringify(canonical.driveOutcomes));

const invariants = await page.evaluate(() => {
  const Stats = window.app.stats.constructor;
  const base = { id: 'x', __gid: 'g', tags: { unit: 'defense', down: '4', distance: '5', yardage: '5',
    playType: 'Run Inside', result: 'No Good', defFront: 'Maverick + Jumbo Shift', coverage: 'Cover 3', blitz: 'A-Gap' } };
  const reversed = { ...base, id: 'y', tags: { ...base.tags, defFront: 'Jumbo Shift + Maverick' } };
  const conversion = window.app.stats.defenseDashboard([base]);
  const rateRows = [
    { ...base, id: 'r1', tags: { ...base.tags, down: '1', distance: '10', blitz: '' } },
    { ...base, id: 'r2', tags: { ...base.tags, down: '1', distance: '10', blitz: '' } },
    { ...base, id: 'r3', tags: { ...base.tags, down: '1', distance: '10', defFront: 'Eagle', blitz: 'A-Gap' } },
    { ...base, id: 'r4', tags: { ...base.tags, down: '1', distance: '10', defFront: '', coverage: '', blitz: '' } },
  ];
  const rates = window.app.stats.defenseDashboard(rateRows).downDistance.find(row => row.name === '1st & 7+');
  const lookRows = Array.from({ length: 10 }, (_, index) => ({
    ...base, id: `look-${index}`,
    tags: { ...base.tags, qbAlignment: 'Under Center', backfield: 'I', formation: 'Twins',
      playType: index < 7 ? 'Run Inside' : 'Run Outside' },
  }));
  const look = window.app.stats.defenseDashboard(lookRows).formationCalls[0];
  const directionRows = [
    { ...base, id: 'toward', tags: { ...base.tags, playDir: 'Left', strength: 'Left' } },
    { ...base, id: 'away', tags: { ...base.tags, playDir: 'Right', strength: 'Left' } },
    { ...base, id: 'balanced', tags: { ...base.tags, playDir: 'Left', strength: 'Balanced' } },
  ];
  const directions = window.app.stats.defenseDashboard(directionRows).directions;
  return {
    sameCall: Stats._defenseCallKey(base) === Stats._defenseCallKey(reversed),
    conversionMade: conversion.fourthDownAllowed.made,
    callPct: rates.callPct,
    blitzPct: rates.blitzPct,
    look: { name: look?.name, n: look?.n,
      playTypes: look?.playTypes.map(item => ({ name: item.name, n: item.n, pct: item.pct })) },
    directions: directions.map(row => ({ name: row.name, n: row.n, isRelative: row.isRelative })),
  };
});
ok(invariants.sameCall, 'defensive call identity is independent of multi-select order');
ok(invariants.conversionMade === 1, 'down conversions use line-to-gain ownership even when Result says No Good');
ok(invariants.callPct === 67 && invariants.blitzPct === 33,
  'Call% and Blitz% exclude snaps with no charted defensive structure', JSON.stringify(invariants));
ok(invariants.look.name === 'I-Form + Twins' && invariants.look.n === 10
  && invariants.look.playTypes.find(item => item.name === 'Run Inside')?.n === 7
  && invariants.look.playTypes.find(item => item.name === 'Run Inside')?.pct === 70
  && invariants.look.playTypes.find(item => item.name === 'Run Outside')?.n === 3
  && invariants.look.playTypes.find(item => item.name === 'Run Outside')?.pct === 30,
  'combined offensive looks expose every play-call count and charted share', JSON.stringify(invariants.look));
ok(invariants.directions.find(row => row.name === 'Toward Strength')?.n === 1
  && invariants.directions.find(row => row.name === 'Away from Strength')?.n === 1
  && invariants.directions.filter(row => !row.isRelative).reduce((sum, row) => sum + row.n, 0) === 3,
  'strength-relative direction excludes balanced strength and does not alter absolute direction totals',
  JSON.stringify(invariants.directions));

/* The export is unchanged by Revision 2: the same four-section dashboard
   model, built from the dashboard exactly as before. */
const exportText = await page.evaluate(async () => {
  let saved = null;
  const prior = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => { saved = blob; };
  document.querySelector('.gi-def2 .gi-def-export')?.click();
  const html = saved ? await saved.text() : '';
  window.ffaSaveBlob = prior;
  return html;
});
ok(['Defensive Performance', 'Opponent Offense', 'Scheme', 'Situational Results']
  .every(label => exportText.includes(label)) && !exportText.includes('Defensive Tendency Tells')
  && !exportText.includes('Stop Rate') && exportText.includes('Top 6 formations')
  && exportText.includes('Run Outside') && exportText.includes('Run Inside')
  && /Week \d+ vs /.test(exportText),
  'Defense export keeps its own four-section dashboard model and game labels');
/* The export reads the same dashboard, so its Field zone table carries the
   defensive bands and its opponent drive outcomes carry the scoring-side
   attribution. Rows are matched as cells, so a number from another table
   cannot satisfy them. */
const exportRow = (label, cells) =>
  new RegExp(`<td[^>]*>${label}</td>\\s*${cells.map(cell => `<td[^>]*>${cell}</td>\\s*`).join('')}`).test(exportText);
ok(exportRow('Backed Up', ['2']) && exportRow('Open Field', ['94']) && exportRow('Opp 40–20', ['43'])
  && exportRow('Red Zone', ['26']) && exportRow('Goal Line', ['4']),
  'the Defense export prints the same defensive field zones as the board');
const exportDrives = await page.evaluate(() => {
  const app = window.app;
  const { scoped, labels } = app.reportsScreen._defenseCohort();
  const dashboard = app.stats.defenseDashboard(scoped, labels);
  const board = app.stats.defenseBoard(scoped, { scope: 'season', seasonPlays: scoped, labels });
  const perf = app.stats.defensivePerformance(scoped, labels);
  return {
    outcomes: dashboard.driveOutcomes.map(row => [row.name, row.n]),
    possessions: board.possessions.map(row => row.outcome),
    points: board.possessions.reduce((sum, row) => sum + (row.points || 0), 0),
    situations: perf.situations.map(row => [row.name, row.n]),
    redZoneTdRate: perf.redZoneTdRate,
  };
});
/* `defensivePerformance` is the owner Matchup's Red Zone situation shares. Read
   from the offense's end it reported 5 red-zone snaps, no Goal Line row and a
   0% red-zone touchdown rate on a season that allowed six of them. */
ok(JSON.stringify(exportDrives.situations.find(row => row[0] === 'Red Zone')) === JSON.stringify(['Red Zone', 30])
  && JSON.stringify(exportDrives.situations.find(row => row[0] === 'Goal Line')) === JSON.stringify(['Goal Line', 4])
  && exportDrives.redZoneTdRate === 75,
  'defensive Red Zone and Goal Line situations and the red-zone touchdown rate measure from our goal line',
  JSON.stringify({ situations: exportDrives.situations, rate: exportDrives.redZoneTdRate }));
ok(JSON.stringify(exportDrives.outcomes) === JSON.stringify([['Touchdown', 7], ['Field Goal', 0], ['Missed FG', 0],
  ['Punt', 9], ['Turnover', 6], ['Downs', 7], ['Other / unresolved', 5]]),
  '2025 JV export drive outcomes: 7 opponent touchdowns, and no drive reclassified on a season with no defensive score',
  JSON.stringify(exportDrives.outcomes));
ok(exportDrives.possessions.filter(name => name === 'Touchdown').length === 7 && exportDrives.points === 42,
  'the board possessions carry the same seven opponent touchdowns and 42 points as the export',
  JSON.stringify({ points: exportDrives.points }));

/* KPI VALUES FIT THEIR TILE at every width that keeps the ten-tile row, even
   when every tile carries the widest value the strip can print. The production
   condensed face is wider than the comp's, and `100.0%` once ran 16px past its
   tile divider at 1280. */
const kpiFit = [];
for (const [width, height] of [[1920, 1080], [1600, 900], [1440, 900], [1421, 900], [1400, 900], [1366, 768], [1301, 900], [1280, 900], [1241, 900], [1239, 900], [1101, 900]]) {
  await page.setViewport({ width, height });
  await sleep(150);
  kpiFit.push(...await page.evaluate(w => [...document.querySelectorAll('[data-def2-kpi]')].map(tile => {
    const strong = tile.querySelector('strong');
    const original = strong.textContent;
    strong.textContent = '100.0%';
    const range = document.createRange();
    range.selectNodeContents(strong);
    const text = range.getBoundingClientRect();
    const style = getComputedStyle(tile);
    const right = tile.getBoundingClientRect().right - parseFloat(style.paddingRight) - parseFloat(style.borderRightWidth);
    const row = new Set([...document.querySelectorAll('[data-def2-kpi]')].map(node => Math.round(node.getBoundingClientRect().top))).size;
    strong.textContent = original;
    return { w, kpi: tile.dataset.def2Kpi, over: Math.round((text.right - right) * 10) / 10, size: getComputedStyle(strong).fontSize, rows: row };
  }), width));
}
ok(kpiFit.every(item => item.over <= 0 && item.rows === (item.w > 1240 ? 1 : 2)),
  'the widest KPI value fits its tile at every desktop width: ten tiles on one row above 1240px, five a row below',
  JSON.stringify(kpiFit.filter(item => item.over > 0 || item.rows !== (item.w > 1240 ? 1 : 2)).slice(0, 4)));
await page.setViewport({ width: 1440, height: 900 });

/* ══ 4. Sticky bar and jump links on the route's real scroller ═══════════ */
console.log('\n== 4. Sticky controls and jump links ==');
await page.setViewport({ width: 1440, height: 900 });
await openDefense(stPeter.id, 'season');
const sticky = await page.evaluate(async () => {
  const scroller = document.querySelector('.ws-reports');
  const bar = document.querySelector('.gi-def2-controls');
  const tabs = document.querySelector('[data-reports-strip]');
  const rest = { bar: Math.round(bar.getBoundingClientRect().top), head: Math.round(tabs.getBoundingClientRect().bottom) };
  scroller.scrollTo(0, 3000);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const pinned = Math.round(bar.getBoundingClientRect().top);
  const top = Math.round(scroller.getBoundingClientRect().top);
  const jumps = [];
  for (const link of document.querySelectorAll('[data-def2-jump]')) {
    scroller.scrollTo(0, 0);
    link.click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const heading = document.getElementById(`def2-${link.dataset.def2Jump}`);
    jumps.push({ id: link.dataset.def2Jump, headingTop: Math.round(heading.getBoundingClientRect().top),
      barBottom: Math.round(bar.getBoundingClientRect().bottom), label: link.textContent.trim(),
      cursor: getComputedStyle(link).cursor, underline: getComputedStyle(link).borderBottomStyle });
  }
  return { rest, pinned, top, jumps };
});
ok(sticky.rest.bar <= sticky.rest.head + 1 && sticky.pinned === sticky.top,
  'the scope and jump bar sits directly under the global strip and stays pinned while the report scrolls', JSON.stringify(sticky));
ok(sticky.jumps.length === 4 && sticky.jumps.every(jump => jump.headingTop >= jump.barBottom - 1 && jump.headingTop <= jump.barBottom + 12),
  'each jump link lands its section heading just below the pinned bar', JSON.stringify(sticky.jumps));
ok(JSON.stringify(sticky.jumps.map(jump => jump.label.replace('↓', '').trim())) === JSON.stringify(['Performance', 'Opponent offense', 'Scheme', 'Situations'])
  && sticky.jumps.every(jump => jump.cursor === 'pointer' && jump.underline === 'solid'),
  'the jump links carry their literal labels and read as interactive', JSON.stringify(sticky.jumps));

/* ══ 5. Populated captures of the whole surface ═══════════════════════════ */
console.log('\n== 5. Captures ==');
const captures = [];
for (const scope of ['season', 'game']) {
  for (const [width, height] of [[1920, 1080], [1440, 900], [1280, 900], [390, 844]]) {
    await page.setViewport({ width, height });
    await openDefense(stPeter.id, scope);
    const seen = await measure();
    captures.push({ scope, width, overflow: seen.pageOverflow, boardRight: seen.boardRight,
      tableScroll: seen.modules.filter(module => module.tableWider > 1).length,
      modules: seen.modules.length, columns: new Set(seen.modules.map(module => module.left)).size });
    const total = await page.evaluate(() => document.querySelector('.ws-reports').scrollHeight);
    const step = height - 120;
    let frame = 0;
    for (let top = 0; top < total; top += step) {
      await page.evaluate(t => document.querySelector('.ws-reports').scrollTo(0, t), top);
      await sleep(80);
      await page.screenshot({ path: `${OUT}/${scope}-${width}-${String(++frame).padStart(2, '0')}.png` });
    }
  }
}
ok(captures.every(item => item.overflow <= 0 && item.boardRight <= item.width),
  'no capture width produces page-level horizontal overflow', JSON.stringify(captures.filter(item => item.overflow > 0 || item.boardRight > item.width)));
const phone = captures.filter(item => item.width === 390);
ok(phone.every(item => item.columns === 1 && item.tableScroll > 0),
  'at 390px every module stacks to one column and wide tables scroll inside their own module', JSON.stringify(phone));
const wide = captures.filter(item => item.width === 1920);
ok(wide.every(item => item.columns === 2), 'at 1920px the two-column band and its pairs hold', JSON.stringify(wide));

ok(errors.length === 0, 'the real Defense route raises no page or console errors', errors.slice(0, 3).join(' | '));
const after = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(after === before, 'the canonical season file remains byte-identical');
await browser.close();

console.log(`\nCaptures: ${OUT}`);
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
