/** Reports down-and-distance chart (Offense > Situations, Defense > Situations;
 * comp design-comps/reports-secondary-nav-2026-09-23, item 7).
 *
 * 1. SYNTHETIC ENGINE CONTRACT, `StatsEngine.downDistanceChart`: the fixed 4 x 3
 *    grid; the run/pass cohort; nothing inferred for a missing or invalid down
 *    or distance, a missing play type or a missing yardage; a multi-select play
 *    type credits each component once without adding a snap; zero-denominator
 *    cells print `-`; our-side vs opponent-side success (a pick-six is not the
 *    opponent's success); nullified-penalty and non-defensive snaps excluded
 *    on defense; exact composite refs, including two games reusing bare ids and
 *    the live current-game fallback.
 * 2. SYNTHETIC RENDERED: first on each Situations page; the selected cell's
 *    detail and `Watch N plays` with the cell's exact refs; held cells not
 *    selectable; the selection survives a re-render; Defense current game vs
 *    full season; Season > Offense and Season > Defense; on-screen vs
 *    game / season / Defense export parity.
 * 3. CANONICAL 2025 JV (read-only, hash-checked): the same parity on real data,
 *    the chart's cohort reconciled with each board's own run/pass count, every
 *    ref resolving to a real play in the cell's situation, and captures of both
 *    charts at 1440, 1280 and 768 -- IMPLEMENTATION EVIDENCE ONLY.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = CANONICAL_SEASON;
const OUT = 'artifacts/reports-down-distance';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

/* ══ 1. Synthetic engine contract ═══════════════════════════════════════ */
console.log('\n== 1. Engine contract (synthetic) ==');
const engine = await page.evaluate(() => {
  const e = window.app.stats;
  const P = (id, tags, gid = 'gA', extra = {}) => ({ id, __gid: gid, tags: { custom: [], players: {}, grades: {}, ...tags }, ...extra });
  const off = [
    P(1, { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '1', distance: '10', yardage: '6', result: 'Gain' }),
    P(2, { unit: 'offense', runPass: 'Pass', playType: 'Short Pass', down: '1', distance: '10', yardage: '', result: 'Incomplete' }),
    P(3, { unit: 'offense', runPass: 'Run', playType: 'Run Inside + RPO', down: '1', distance: '8', yardage: '2', result: 'Gain' }),
    P(4, { unit: 'offense', runPass: 'Pass', playType: '', down: '3', distance: '2', yardage: '3', result: 'Gain' }),
    P(5, { unit: 'offense', runPass: 'Run', playType: 'Run Outside', down: '', distance: '10', yardage: '4' }),
    P(6, { unit: 'offense', runPass: 'Run', playType: 'Run Outside', down: '2', distance: '', yardage: '4' }),
    P(7, { unit: 'offense', runPass: 'Run', playType: 'Run Outside', down: '2', distance: '0', yardage: '4' }),
    P(8, { unit: 'offense', runPass: 'Run', playType: 'Run Outside', down: '5', distance: '4', yardage: '4' }),
    P(9, { unit: 'offense', playType: 'Option', down: '2', distance: '5', yardage: '9' }),
    P(10, { unit: 'offense', runPass: 'Pass', playType: 'Deep Pass', down: '4', distance: '15', yardage: '', result: 'Touchdown' }),
    P(1, { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '1', distance: '12', yardage: '7', result: 'Gain' }, 'gB'),
  ];
  const o = e.downDistanceChart(off, { side: 'offense' });
  const cell = key => o.cells.find(c => c.key === key);
  const def = [
    P(21, { unit: 'defense', runPass: 'Run', playType: 'Run Inside', down: '3', distance: '4', yardage: '5', result: 'Gain' }),
    P(22, { unit: 'defense', runPass: 'Pass', playType: 'Short Pass', down: '3', distance: '6', yardage: '0', result: 'Interception + Touchdown', players: { takeaway: '22' } }),
    P(23, { unit: 'defense', runPass: 'Pass', playType: 'Short Pass', down: '3', distance: '5', yardage: '10', result: 'Touchdown' }),
    P(24, { unit: 'defense', runPass: 'Run', playType: 'Run Inside', down: '3', distance: '5', yardage: '40', result: 'Gain' }, 'gA',
      { penalties: [{ id: 'x', team: 'opponent', phase: 'offense', foul: 'Holding', disposition: 'accepted', playCounts: false }] }),
    P(25, { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '3', distance: '5', yardage: '3' }),
    P(26, { unit: 'special', stType: 'Punt', down: '4', distance: '5' }),
  ];
  const d = e.downDistanceChart(def, { side: 'defense' });
  const live = e.downDistanceChart([{ id: 7, tags: { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '2', distance: '3', yardage: '2' } }],
    { side: 'offense', fallbackGameId: 'gLive' });
  const fmt = window.app.stats.constructor.formatDownDistanceCell;
  return {
    keys: o.cells.map(c => c.key), measured: o.measured, placed: o.placed, missing: o.missingDownDistance,
    c1: cell('1|Long'), c3: cell('3|Short'), c4: cell('4|Long'), held: cell('2|Medium'),
    heldText: fmt(cell('2|Medium')), c1Text: fmt(cell('1|Long')), c3Text: fmt(cell('3|Short')), c4Text: fmt(cell('4|Long')),
    sumN: o.cells.reduce((s, c) => s + c.n, 0), splitOk: o.cells.every(c => c.runs + c.passes === c.n),
    d: { measured: d.measured, charted: d.charted, cell: d.cells.find(c => c.key === '3|Medium'), placed: d.placed },
    liveRefs: live.cells.find(c => c.key === '2|Short').refs,
    line: window.app.stats.constructor.downDistanceCohortLine(o),
    dline: window.app.stats.constructor.downDistanceCohortLine(d),
  };
});
ok(eq(engine.keys, ['1|Short', '1|Medium', '1|Long', '2|Short', '2|Medium', '2|Long', '3|Short', '3|Medium', '3|Long', '4|Short', '4|Medium', '4|Long']),
  'the grid is always the twelve situations in football order', JSON.stringify(engine.keys));
ok(engine.measured === 10 && engine.placed === 6 && engine.missing === 4 && engine.sumN === engine.placed,
  'the Option snap (neither run nor pass) is outside the cohort; blank down, blank distance, distance 0 and down 5 are not placed; cells sum to the placed count',
  JSON.stringify({ measured: engine.measured, placed: engine.placed, missing: engine.missing, sum: engine.sumN }));
ok(engine.line === '6 of 10 run/pass snaps carry down and distance', 'the cohort sentence states the placed and measured counts', engine.line);
ok(engine.c1.n === 4 && engine.c1.runs === 3 && engine.c1.passes === 1 && engine.splitOk,
  'a cell counts snaps, and its run/pass split always sums to its snaps', JSON.stringify(engine.c1));
ok(eq(engine.c1.playTypes, [{ name: 'Run Inside', n: 3 }, { name: 'RPO', n: 1 }, { name: 'Short Pass', n: 1 }]) && engine.c1.typeTags === 5 && engine.c1.n === 4,
  'a multi-select play type credits each component once and never adds a snap (5 tags on 4 snaps)', JSON.stringify(engine.c1.playTypes));
ok(engine.c1.yardsMeasured === 3 && engine.c1.ypp === 5 && engine.c1Text.ypp === '5.0',
  'yards per play divides only by snaps with charted yardage (the blank-yardage pass is not a zero)', JSON.stringify(engine.c1));
ok(engine.c1.successEligible === 3 && engine.c1.successes === 2 && engine.c1Text.success === '67%',
  'success counts only measurable snaps, with the canonical success rule', JSON.stringify(engine.c1));
ok(engine.c3.untyped === 1 && engine.c3.playTypes.length === 0 && engine.c3Text.top === '-',
  'a snap with no play type is counted as untyped, never invented', JSON.stringify(engine.c3));
ok(engine.c4.n === 1 && engine.c4.yardsMeasured === 0 && engine.c4.ypp === null && engine.c4Text.ypp === '-'
  && engine.c4.successEligible === 1 && engine.c4Text.success === '100%',
  'zero-denominator yards per play prints -, while a touchdown with no yardage is still a measurable success', JSON.stringify(engine.c4));
ok(engine.held.held && engine.held.n === 0 && engine.held.successRate === null && engine.held.ypp === null
  && Object.values(engine.heldText).every(v => v === '-'),
  'an unfaced situation is held: null values and a dash, never a zero', JSON.stringify(engine.heldText));
ok(eq(engine.c1.refs, ['gA::1', 'gA::2', 'gA::3', 'gB::1']),
  'refs are exact composite ids; two games reusing bare id 1 stay distinct', JSON.stringify(engine.c1.refs));
ok(eq(engine.liveRefs, ['gLive::7']), 'a live current-game play takes the active game id for its film ref', JSON.stringify(engine.liveRefs));
ok(engine.d.charted === 3 && engine.d.measured === 3 && engine.d.cell.n === 3,
  'defense: only defensive snaps enter; a nullified-penalty snap, an offensive snap and a special-teams snap do not', JSON.stringify(engine.d));
ok(engine.d.cell.successEligible === 3 && engine.d.cell.successes === 2,
  'defense: a converted run and the opponent touchdown are their successes; our pick-six is not (isOpponentSuccess)', JSON.stringify(engine.d.cell));
ok(engine.dline === '3 of 3 opponent run/pass snaps carry down and distance', 'the defensive cohort sentence names the opponent', engine.dline);

/* ══ 2. Synthetic rendered ══════════════════════════════════════════════ */
console.log('\n== 2. Rendered (synthetic season) ==');
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 D&D QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const P = (id, tags) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 }, notes: '', annotations: [],
    tags: { custom: [], players: {}, grades: {}, quarter: 'Q1', ...tags } });
  const make = seed => [
    P(1, { unit: 'offense', runPass: 'Run', playType: 'Run Inside', down: '1', distance: '10', yardage: '5', result: 'Gain', formation: 'Ace' }),
    P(2, { unit: 'offense', runPass: 'Pass', playType: 'Short Pass + Screen', down: '1', distance: '10', yardage: String(seed), result: 'Gain', formation: 'Ace' }),
    P(3, { unit: 'offense', runPass: 'Run', playType: 'Run Outside', down: '3', distance: '2', yardage: '3', result: 'Gain', formation: 'Ace' }),
    P(4, { unit: 'offense', runPass: 'Pass', playType: 'Deep Pass', down: '2', distance: '9', yardage: '', result: 'Incomplete', formation: 'Ace' }),
    P(8, { unit: 'offense', runPass: 'Run', playType: '', down: '4', distance: '1', yardage: '1', result: 'Gain', formation: 'Ace' }),
    P(5, { unit: 'defense', runPass: 'Run', playType: 'Run Inside', down: '1', distance: '10', yardage: '4', result: 'Gain', defFront: '4-3', coverage: 'Cover 3' }),
    P(6, { unit: 'defense', runPass: 'Pass', playType: 'Short Pass', down: '3', distance: '7', yardage: '8', result: 'Gain', defFront: '4-3', coverage: 'Cover 3' }),
    P(7, { unit: 'defense', runPass: 'Pass', playType: 'Short Pass', down: '3', distance: '8', yardage: '2', result: 'Gain', defFront: '4-3', coverage: 'Cover 3' }),
  ];
  const store = app.storage.seasonStore;
  store.data.games = [
    { id: 'syn-a', name: 'Week 1', nextId: 9, plays: make(7), annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
      gameInfo: { opponent: 'Wildcats', date: '2026-09-04', week: '1', perspective: 'self', scoreUs: 14, scoreThem: 7 } },
    { id: 'syn-b', name: 'Week 2', nextId: 9, plays: make(12), annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1,
      gameInfo: { opponent: 'Knights', date: '2026-09-11', week: '2', perspective: 'self', scoreUs: 7, scoreThem: 10 } },
  ];
  store.data.activeGameId = 'syn-a';
  await app.storage._loadActiveGame({ renderGames: false });
  app.workspaceShell.show('reports');
});
await sleep(500);

const go = tab => page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`).click(), tab).then(() => sleep(300));
const pageTo = id => page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), id).then(() => sleep(200));
/** The rendered chart: every cell's printed strings, the detail panel, and
 *  whether it is the first thing on its page. */
const readChart = (side, root = '') => page.evaluate((s, r) => {
  const chart = document.querySelector(`${r} [data-dd-chart="${s}"]`.trim());
  if (!chart) return null;
  const text = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  const cells = Object.fromEntries([...chart.querySelectorAll('[data-dd-cell]')].map(c => [c.dataset.ddCell,
    c.classList.contains('is-held') ? { held: true, tag: c.tagName }
      : { plays: text(c.querySelector('[data-dd-plays]')), split: text(c.querySelector('[data-dd-split]')),
        success: text(c.querySelector('[data-dd-success]')), ypp: text(c.querySelector('[data-dd-ypp]')),
        selected: c.classList.contains('is-selected'), tag: c.tagName }]));
  const board = chart.parentElement;
  // The page heading (number, title, cohort) is page chrome, as the Defense
  // section heading is; the chart must be the first MODULE under it.
  const first = s === 'offense'
    ? [...board.children].find(n => n.getClientRects().length && !n.matches('.gi-secbar, .gi-off-heading')) === chart
    : chart.previousElementSibling?.matches('[data-def2-section]') && chart.nextElementSibling?.matches('.gi-def2-bands');
  return { cells, first, cohort: text(chart.querySelector('[data-dd-cohort]')),
    detail: text(chart.querySelector('[data-dd-detail] h4')), watch: text(chart.querySelector('[data-dd-watch]')),
    types: [...chart.querySelectorAll('[data-dd-types] li')].map(text) };
}, side, root);
const engineChart = (side, scope) => page.evaluate((s, sc) => {
  const app = window.app, e = app.stats;
  if (s === 'offense') return e.downDistanceChart(e.compute().offPlays, { side: 'offense', fallbackGameId: app.storage.seasonStore.data.activeGameId });
  const { scoped } = app.reportsScreen._selfPerspectiveCohort(sc);
  return e.downDistanceChart(scoped, { side: 'defense' });
}, side, scope);
const formatted = (chart) => page.evaluate(c => Object.fromEntries(c.cells.map(cell =>
  [cell.key, window.app.stats.constructor.formatDownDistanceCell(cell)])), chart);
const sameAsEngine = (shown, fmt) => Object.entries(fmt).every(([key, f]) => {
  const s = shown.cells[key];
  return f.plays === '-' ? s?.held === true && s.tag === 'DIV'
    : s && s.plays === f.plays && s.split === f.split && s.success === f.success && s.ypp === f.ypp && s.tag === 'BUTTON';
});

await go('offense'); await pageTo('situations');
let shown = await readChart('offense');
let model = await engineChart('offense');
ok(!!shown && shown.first, 'Offense > Situations opens on the down-and-distance chart', JSON.stringify(shown && { first: shown.first }));
ok(sameAsEngine(shown, await formatted(model)) && shown.cohort === '5 of 5 run/pass snaps carry down and distance',
  'every rendered offense cell prints the engine\'s values; held cells are dashes and not buttons', JSON.stringify({ shown: shown.cells, cohort: shown.cohort }));
ok(shown.cells['1|Long'].selected && /1st & 7\+ 2 plays/.test(shown.detail) && shown.watch === 'Watch 2 plays',
  'the busiest cell opens selected with its detail and Watch N plays', JSON.stringify({ detail: shown.detail, watch: shown.watch }));
ok(shown.types.some(t => /Short Pass\s*1/.test(t)) && shown.types.some(t => /Screen\s*1/.test(t)) && shown.types.some(t => /Run Inside\s*1/.test(t)),
  'the detail lists the cell\'s top play types, each multi-select component credited', JSON.stringify(shown.types));
const watched = await page.evaluate(async () => {
  const calls = []; const original = window.app.filmNavigation.watch;
  window.app.filmNavigation.watch = (refs, options) => { calls.push({ refs, label: options?.label }); return Promise.resolve({ completed: true }); };
  document.querySelector('[data-dd-chart="offense"] [data-dd-cell="3|Short"]').click();
  await new Promise(r => setTimeout(r, 120));
  document.querySelector('[data-dd-chart="offense"] [data-dd-watch]').click();
  window.app.filmNavigation.watch = original;
  return calls;
});
ok(watched.length === 1 && eq(watched[0].refs, ['syn-a::3']) && /3rd & 1-3/.test(watched[0].label),
  'selecting a cell and pressing Watch opens exactly that cell\'s composite refs (live game stamped with its id)', JSON.stringify(watched));
await page.evaluate(() => document.querySelector('[data-dd-chart="offense"] [data-dd-cell="4|Short"]').click()); await sleep(120);
const untyped = await readChart('offense');
ok(eq(untyped.types, ['No play type1']) && /4th & 1-3 1 plays/.test(untyped.detail),
  'a cell holding only untyped snaps lists the counted No play type row once, with no second absence line', JSON.stringify(untyped.types));
await page.evaluate(() => document.querySelector('[data-dd-chart="offense"] [data-dd-cell="3|Short"]').click()); await sleep(120);
await page.evaluate(() => window.app.reportsScreen._renderActiveTab()); await sleep(200);
ok((await readChart('offense')).cells['3|Short'].selected, 'the selected cell is controller state and survives a re-render');
const heldClick = await page.evaluate(() => {
  const held = document.querySelector('[data-dd-chart="offense"] [data-dd-cell="4|Long"]');
  return { tag: held?.tagName, focusable: held?.tabIndex >= 0 };
});
ok(heldClick.tag === 'DIV' && !heldClick.focusable, 'an unfaced situation cannot be selected', JSON.stringify(heldClick));

/* Defense: current game, then full season. */
await go('defense'); await pageTo('situations');
shown = await readChart('defense');
model = await engineChart('defense', 'game');
ok(shown?.first && sameAsEngine(shown, await formatted(model)) && shown.cohort === '3 of 3 opponent run/pass snaps carry down and distance',
  'Defense > Situations opens on the opponent chart for the current game, matching the engine', JSON.stringify(shown && { cohort: shown.cohort, first: shown.first }));
await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-defense-scope="season"]').click()); await sleep(300);
shown = await readChart('defense');
model = await engineChart('defense', 'season');
ok(sameAsEngine(shown, await formatted(model)) && shown.cohort === '6 of 6 opponent run/pass snaps carry down and distance'
  && shown.cells['3|Long'].plays === '4',
  'Full season doubles the cohort across both games and the chart follows the scope', JSON.stringify(shown.cells['3|Long']));
const defWatch = await page.evaluate(async () => {
  const calls = []; const original = window.app.filmNavigation.watch;
  window.app.filmNavigation.watch = refs => { calls.push(refs); return Promise.resolve({ completed: true }); };
  document.querySelector('[data-dd-chart="defense"] [data-dd-cell="3|Long"]').click();
  await new Promise(r => setTimeout(r, 100));
  document.querySelector('[data-dd-chart="defense"] [data-dd-watch]').click();
  window.app.filmNavigation.watch = original;
  return calls[0];
});
ok(eq(defWatch, ['syn-a::6', 'syn-a::7', 'syn-b::6', 'syn-b::7']), 'the season cell opens both games\' exact plays', JSON.stringify(defWatch));
/* Export parity: the Defense export from the Situations page carries the same cells. */
const exportRows = html => page.evaluate((h, side) => {
  const doc = new DOMParser().parseFromString(h, 'text/html');
  const t = doc.querySelector(`[data-dd-export="${side}"]`);
  if (!t) return null;
  return { rows: Object.fromEntries([...t.querySelectorAll('[data-dd-row]')].map(r => [r.dataset.ddRow, [...r.cells].map(c => c.textContent.trim())])),
    cohort: t.closest('section')?.querySelector('[data-dd-cohort]')?.textContent.trim() };
}, html.html, html.side);
const capture = fn => page.evaluate(async body => {
  const saved = []; const original = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => saved.push(blob);
  await (0, eval)(body)();
  window.ffaSaveBlob = original;
  return saved.length ? saved[0].text() : '';
}, fn);
const exportMatches = (rows, fmt) => rows && Object.entries(fmt).every(([key, f]) => eq(rows.rows[key]?.slice(1), [f.plays, f.split, f.success, f.ypp, f.top]));
const defExport = await capture("() => document.querySelector('[data-reports-secbar] [data-report-export=\"defense\"]').click()");
let rows = await exportRows({ html: defExport, side: 'defense' });
ok(exportMatches(rows, await formatted(model)) && rows.cohort.startsWith('6 of 6 opponent run/pass snaps carry down and distance'),
  'the Defense export prints the same twelve cells and cohort sentence as the season board', JSON.stringify(rows?.cohort));
await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-defense-scope="game"]').click()); await sleep(200);

/* Game export: both charts. */
const gameExport = await capture("() => window.app.reportsScreen.export('html')");
rows = await exportRows({ html: gameExport, side: 'offense' });
ok(exportMatches(rows, await formatted(await engineChart('offense'))), 'the game export prints the Offense chart\'s cells', JSON.stringify(rows?.cohort));
rows = await exportRows({ html: gameExport, side: 'defense' });
ok(exportMatches(rows, await formatted(await engineChart('defense', 'game'))), 'the game export prints the current game\'s opponent chart', JSON.stringify(rows?.cohort));

/* Season: embedded Offense and Defense, and the season export. */
await go('season');
await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-subtab="offense"]').click()); await sleep(300);
await page.evaluate(() => document.querySelector('[data-pane="season"] .gi-secbar.is-inline [data-section="situations"]')?.click()); await sleep(200);
const seasonOff = await readChart('offense', '[data-pane="season"]');
const seasonModel = await page.evaluate(() => {
  const m = window.app.season.reportModel();
  return { off: window.app.stats.downDistanceChart(m.stats.offPlays, { side: 'offense' }), def: m.defenseBoard.downDistanceChart };
});
ok(seasonOff && sameAsEngine(seasonOff, await formatted(seasonModel.off)) && seasonOff.cohort === '10 of 10 run/pass snaps carry down and distance',
  'Season > Offense > Situations shows the season chart', JSON.stringify(seasonOff?.cohort));
await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-subtab="defense"]').click()); await sleep(300);
await page.evaluate(() => document.querySelector('[data-pane="season"] .gi-secbar.is-inline [data-section="situations"]')?.click()); await sleep(200);
const seasonDef = await readChart('defense', '[data-pane="season"]');
ok(seasonDef && sameAsEngine(seasonDef, await formatted(seasonModel.def)) && seasonDef.cohort === '6 of 6 opponent run/pass snaps carry down and distance',
  'Season > Defense > Situations shows the season opponent chart', JSON.stringify(seasonDef?.cohort));
const seasonExport = await capture("() => window.app.season.exportHtml()");
ok(exportMatches(await exportRows({ html: seasonExport, side: 'offense' }), await formatted(seasonModel.off))
  && exportMatches(await exportRows({ html: seasonExport, side: 'defense' }), await formatted(seasonModel.def)),
  'the season export prints both season charts with the board\'s values');

/* ══ 3. Canonical 2025 JV ═══════════════════════════════════════════════ */
console.log('\n== 3. Canonical 2025 JV ==');
if (!existsSync(SOURCE)) {
  ok(process.env.GIQ_REALDATA_OPTIONAL === '1', `canonical season present at ${SOURCE}`);
} else {
  const raw = readFileSync(SOURCE);
  const before = createHash('sha256').update(raw).digest('hex');
  const season = JSON.parse(raw.toString('utf8'));
  const stPeter = season.games.find(game => /St\. Peter Lutheran/i.test(game.gameInfo?.opponent || ''));
  await page.evaluate(async (data, gameId) => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(data)));
    store.currentSeasonId = data.id; store.data.id = data.id; store.data.activeGameId = gameId;
    await app.storage._loadActiveGame();
    app.workspaceShell.show('reports');
    app.reportsScreen.defenseScope = 'game';
  }, season, stPeter.id);
  await sleep(500);
  console.log(`  ${season.seasonName}: ${season.games.length} games, ${season.games.reduce((s, g) => s + (g.plays || []).length, 0)} plays; St. Peter Lutheran current game and full season; read-only copy`);

  await go('offense'); await pageTo('situations');
  shown = await readChart('offense');
  model = await engineChart('offense');
  const offCohort = await page.evaluate(() => { const S = window.app.stats.constructor;
    return window.app.stats.compute().offPlays.filter(p => S.isRun(p) || S.isPass(p)).length; });
  ok(shown?.first && sameAsEngine(shown, await formatted(model)), 'canonical Offense chart matches the engine cell for cell');
  ok(model.measured === offCohort && model.placed + model.missingDownDistance === model.measured
    && model.cells.reduce((s, c) => s + c.n, 0) === model.placed,
    'canonical Offense cohort reconciles with the board\'s own run/pass snaps', JSON.stringify({ measured: model.measured, board: offCohort, placed: model.placed }));
  const refCheck = await page.evaluate(chart => {
    const e = window.app.stats;
    const byRef = new Map(window.app.season._allPlays().map(p => [`${p.__gid}::${p.id}`, p]));
    const bad = [];
    for (const cell of chart.cells) for (const ref of cell.refs) {
      const p = byRef.get(ref);
      if (!p || e._ddKey(p.tags) !== cell.key) bad.push(`${cell.key}:${ref}`);
    }
    return { bad, refs: chart.cells.reduce((s, c) => s + c.refs.length, 0), n: chart.cells.reduce((s, c) => s + c.n, 0) };
  }, model);
  ok(refCheck.bad.length === 0 && refCheck.refs === refCheck.n,
    'every canonical Offense ref resolves to a real play in its cell\'s situation, one ref per snap', JSON.stringify(refCheck));

  await go('defense'); await pageTo('situations');
  const defBoard = await page.evaluate(() => {
    const { scoped } = window.app.reportsScreen._defenseCohort();
    return window.app.stats.defenseBoard(scoped, { scope: 'game' });
  });
  shown = await readChart('defense');
  ok(shown?.first && sameAsEngine(shown, await formatted(defBoard.downDistanceChart))
    && defBoard.downDistanceChart.measured === defBoard.measured,
    'canonical Defense current-game chart matches the engine and the board\'s run/pass count', JSON.stringify({ chart: defBoard.downDistanceChart.measured, board: defBoard.measured, cohort: shown?.cohort }));
  for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024]]) {
    await page.setViewport({ width: w, height: h }); await sleep(250);
    for (const side of ['offense', 'defense']) {
      await go(side); await pageTo('situations');
      const fit = await page.evaluate(s => {
        const chart = document.querySelector(`[data-dd-chart="${s}"]`);
        const clipped = [...chart.querySelectorAll('*')].filter(n => n.getClientRects().length
          && [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())
          && (n.scrollWidth > n.clientWidth + 1 && getComputedStyle(n).overflow !== 'visible'
            || n.getBoundingClientRect().right > chart.getBoundingClientRect().right + 0.5))
          .map(n => n.textContent.trim().slice(0, 20));
        const small = [...chart.querySelectorAll('*')].filter(n => n.getClientRects().length
          && [...n.childNodes].some(c => c.nodeType === 3 && c.textContent.trim())
          && parseFloat(getComputedStyle(n).fontSize) < 12.5).map(n => n.textContent.trim().slice(0, 20));
        const r = chart.getBoundingClientRect();
        return { clipped, small, overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          width: Math.round(r.width), inside: r.right <= window.innerWidth + 1 };
      }, side);
      ok(fit.clipped.length === 0 && fit.small.length === 0 && fit.overflow <= 0 && fit.inside,
        `${w}: the ${side} chart has no clipped text, nothing under 12.5px and no page overflow`, JSON.stringify(fit));
      await page.evaluate(() => { const s = document.querySelector('.ws-reports'); const c = document.querySelector('.gi-dd'); if (s && c) s.scrollTop += c.getBoundingClientRect().top - s.getBoundingClientRect().top - 8; });
      await sleep(120);
      const shot = `${OUT}/${side}-${w}.png`;
      const box = await page.evaluate(() => { const r = document.querySelector('.gi-dd').getBoundingClientRect(); return { x: 0, y: Math.max(0, r.top - 60), width: window.innerWidth, height: Math.min(window.innerHeight - Math.max(0, r.top - 60), r.height + 80) }; });
      await page.screenshot({ path: shot, clip: box });
    }
  }
  await page.setViewport({ width: 1440, height: 900 }); await sleep(200);
  await go('defense'); await pageTo('situations');
  await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-defense-scope="season"]').click()); await sleep(400);
  const seasonBoard = await page.evaluate(() => {
    const { scoped } = window.app.reportsScreen._defenseCohort();
    return window.app.stats.defenseBoard(scoped, { scope: 'season' });
  });
  shown = await readChart('defense');
  ok(sameAsEngine(shown, await formatted(seasonBoard.downDistanceChart)) && seasonBoard.downDistanceChart.measured === seasonBoard.measured,
    'canonical Defense full-season chart matches the engine and the board\'s run/pass count', JSON.stringify({ chart: seasonBoard.downDistanceChart.measured, board: seasonBoard.measured }));
  const canonDef = await capture("() => document.querySelector('[data-reports-secbar] [data-report-export=\"defense\"]').click()");
  ok(exportMatches(await exportRows({ html: canonDef, side: 'defense' }), await formatted(seasonBoard.downDistanceChart)),
    'canonical Defense export prints the same season chart');
  await page.evaluate(() => { const s = document.querySelector('.ws-reports'); const c = document.querySelector('.gi-dd'); if (s && c) s.scrollTop += c.getBoundingClientRect().top - s.getBoundingClientRect().top - 8; });
  await sleep(120);
  await page.screenshot({ path: `${OUT}/defense-season-1440.png` });
  await page.evaluate(() => document.querySelector('[data-reports-secbar] [data-defense-scope="game"]').click()); await sleep(200);
  const canonGame = await capture("() => window.app.reportsScreen.export('html')");
  ok(exportMatches(await exportRows({ html: canonGame, side: 'offense' }), await formatted(await engineChart('offense')))
    && exportMatches(await exportRows({ html: canonGame, side: 'defense' }), await formatted(await engineChart('defense', 'game'))),
    'canonical game export prints both current-game charts');
  const after = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
  ok(after === before, 'the canonical season file is byte-identical after the run');
}

ok(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\nCaptures: ${OUT}`);
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
