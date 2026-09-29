/* The film-linked run-gap chart (roadmap Step 1, build contract item 6): frequency and
   performance, the eligible sample, multi-value attribution, strength where
   charted, exact contributing clips, and export parity. Drives the real Reports
   route. Run after build: node tools/e2e-run-gap-report.mjs */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value ? (pass++, console.log('  PASS  ' + label)) : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);
await page.evaluate(async () => { await window.app.storage.createSeason({ name: 'Run Gap QA', team: 'Mavericks', year: '2026', level: 'Varsity' }); });

// The fixture: eleven runs by the coach's explicit Run/Pass, nine of them with a Gap.
const RUNS = [
  { id: 1, gap: 'L-A', playDir: 'Left', yardage: '4', strength: 'Left', playType: 'Run Inside' },
  { id: 2, gap: 'L-A', playDir: 'Left', yardage: '6', strength: 'Right', playType: 'Run Inside' },
  { id: 3, gap: 'R-B', playDir: 'Right', yardage: '12', strength: 'Right', playType: 'Run Inside' },
  { id: 4, gap: 'R-B', playDir: 'Right', yardage: '2', strength: '', playType: 'Run Inside' },
  { id: 5, gap: 'Center', playDir: 'Middle', yardage: '3', strength: 'Left', playType: 'Run Inside' },
  { id: 6, gap: 'Other', playDir: 'Right', yardage: '', strength: '', playType: 'Run Outside' },
  { id: 7, gap: '', playDir: 'Left', yardage: '5', strength: 'Left', playType: 'Run Inside' },      // run, no Gap
  { id: 8, gap: '', playDir: '', yardage: '5', strength: '', playType: 'Run Outside' },             // run, no Gap
  { id: 9, gap: 'R-D', playDir: 'Right', yardage: '9', strength: 'Balanced', playType: 'Run Outside + Reverse' },
  { id: 10, gap: 'L-C', playDir: 'Left', yardage: '7', strength: '', playType: 'Reverse' },
  { id: 13, gap: 'L-B', playDir: 'Left', yardage: '5', strength: '', playType: 'QB Run', qbRun: 'Designed' },
];
const OTHERS = [
  { id: 11, tags: { playType: 'QB Run', runPass: '', gap: 'Center', playDir: 'Middle', qbRun: 'Scramble', yardage: '8' } },   // unclassified: not a run
  { id: 12, tags: { playType: 'Short Pass', runPass: 'Pass', gap: 'R-A', playDir: 'Right', yardage: '11' } },                  // a pass
];
await page.evaluate(async (RUNS, OTHERS) => {
  const store = window.app.storage.seasonStore;
  const base = { custom: [], players: {}, grades: {}, unit: 'offense', formationFamily: 'Spread', runPass: 'Run', result: 'Gain', down: '1', distance: '10', quarter: 'Q1', motion: '' };
  const plays = [...RUNS.map(r => ({ id: r.id, tags: { ...base, ...r, id: undefined } })), ...OTHERS.map(o => ({ id: o.id, tags: { ...base, ...o.tags } }))]
    .sort((a, b) => a.id - b.id).map((p, i) => ({ ...p, timestamp: { start: i * 10, end: i * 10 + 6 }, notes: '', annotations: [] }));
  store.data.games = [{ id: 'g-gap', name: 'Wildcats', nextId: 14, plays,
    gameInfo: { opponent: 'Wildcats', date: '2026-09-04', week: '1', projectName: 'Wildcats', perspective: 'self', scoreUs: 21, scoreThem: 14 },
    annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1 }];
  store.data.activeGameId = 'g-gap';
  await window.app.storage._loadActiveGame({ renderGames: false });
}, RUNS, OTHERS);
await sleep(400);

console.log('\n== 1. The engine: eligible sample, cells, film ==');
const chart = await page.evaluate(() => {
  const app = window.app, plays = app.tagger.plays;
  const c = app.stats.runGapChart(plays, { side: 'offense', fallbackGameId: 'g-gap' });
  const by = Object.fromEntries(c.cells.map(cell => [cell.gap, { n: cell.n, ypp: cell.ypp, yardsMeasured: cell.yardsMeasured, successRate: cell.successRate, refs: cell.refs, share: cell.share }]));
  const reverse = app.stats.runGapChart(plays, { playType: 'Reverse', fallbackGameId: 'g-gap' });
  const outside = app.stats.runGapChart(plays, { playType: 'Run Outside', fallbackGameId: 'g-gap' });
  const qb = app.stats.runGapChart(plays, { playType: 'QB Run', fallbackGameId: 'g-gap' });
  return { runs: c.runs, charted: c.charted, missing: c.missing, by, strength: { sided: c.strength.sided, charted: c.strength.charted, noStrength: c.strength.noStrength, unsided: c.strength.unsided, towardN: c.strength.toward.n, awayN: c.strength.away.n, towardRefs: c.strength.toward.refs, awayRefs: c.strength.away.refs },
    cohortLine: window.app.stats.constructor.runGapCohortLine(c), types: c.playTypes,
    reverse: { runs: reverse.runs, charted: reverse.charted, gaps: reverse.cells.filter(x => x.n).map(x => x.gap) },
    outside: { runs: outside.runs, charted: outside.charted, gaps: outside.cells.filter(x => x.n).map(x => x.gap) },
    qb: { runs: qb.runs, charted: qb.charted, gaps: qb.cells.filter(x => x.n).map(x => x.gap) },
    allRefs: c.refs };
});
ok(chart.runs === 11 && chart.charted === 9 && chart.missing === 2, 'the eligible sample is the explicit runs; a run with no Gap is missing, not a hit', JSON.stringify({ r: chart.runs, c: chart.charted, m: chart.missing }));
ok(chart.cohortLine === '9 of 11 runs charted with a gap', 'the cohort sentence states charted of eligible', chart.cohortLine);
ok(chart.by['L-A'].n === 2 && chart.by['R-B'].n === 2 && chart.by['Center'].n === 1 && chart.by['Other'].n === 1 && chart.by['R-D'].n === 1 && chart.by['L-C'].n === 1 && chart.by['L-B'].n === 1 && chart.by['L-D'].n === 0 && chart.by['R-A'].n === 0 && chart.by['R-C'].n === 0, 'each Gap counts its own runs; the pass and the unclassified QB Run are not in it', JSON.stringify(chart.by));
ok(chart.by['L-A'].ypp === 5 && chart.by['R-B'].ypp === 7 && chart.by['Other'].ypp === null && chart.by['Other'].yardsMeasured === 0, 'yards per play counts only runs with charted yardage; none charted is a dash, not zero', JSON.stringify([chart.by['L-A'].ypp, chart.by['R-B'].ypp, chart.by['Other']]));
ok(chart.by['L-A'].successRate === 50 && chart.by['R-B'].successRate === 50, 'success uses the established rule on the cell', JSON.stringify([chart.by['L-A'].successRate, chart.by['R-B'].successRate]));
ok(same(chart.by['R-B'].refs, ['g-gap::3', 'g-gap::4']) && same(chart.by['L-A'].refs, ['g-gap::1', 'g-gap::2']) && chart.allRefs.length === 9 && !chart.allRefs.includes('g-gap::7') && !chart.allRefs.includes('g-gap::11') && !chart.allRefs.includes('g-gap::12'), 'every cell carries exactly its composite gameId::playId film', JSON.stringify(chart.allRefs));
ok(chart.strength.sided === 7 && chart.strength.charted === 3 && chart.strength.towardN === 2 && chart.strength.awayN === 1 && chart.strength.noStrength === 4 && chart.strength.unsided === 2, 'strength is read only where charted: toward, away, and the rest counted apart', JSON.stringify(chart.strength));
ok(same(chart.strength.towardRefs, ['g-gap::1', 'g-gap::3']) && same(chart.strength.awayRefs, ['g-gap::2']), 'toward and away carry their exact film');
ok(chart.reverse.runs === 2 && chart.reverse.charted === 2 && same(chart.reverse.gaps.sort(), ['L-C', 'R-D']), 'a play tagged Run Outside + Reverse counts under Reverse', JSON.stringify(chart.reverse));
ok(chart.outside.runs === 3 && chart.outside.charted === 2 && same(chart.outside.gaps.sort(), ['Other', 'R-D']), 'and under Run Outside, where the missing-Gap run stays missing', JSON.stringify(chart.outside));
ok(chart.qb.runs === 1 && chart.qb.charted === 1 && same(chart.qb.gaps, ['L-B']), 'a QB Run counts only when the coach set Run/Pass; the unclassified one is not a run', JSON.stringify(chart.qb));
ok(chart.types.some(t => t.name === 'Reverse' && t.n === 2) && chart.types.some(t => t.name === 'Run Outside' && t.n === 2), 'the play types offered are those on charted runs, a two-type snap under each', JSON.stringify(chart.types));

console.log('\n== 2. The Offense report ==');
await page.evaluate(() => window.app.workspaceShell.show('reports'));
await sleep(300);
await page.evaluate(() => { window.app.reportsScreen.offenseSection = 'structure'; window.app.reportsScreen.selectTab('offense'); });
await sleep(900);
const ui = () => page.evaluate(() => {
  const root = document.querySelector('[data-rg-chart="offense"]');
  if (!root) return null;
  const cells = [...root.querySelectorAll('[data-rg-cell]')];
  return {
    cohort: root.querySelector('[data-rg-cohort]')?.textContent, order: cells.map(c => c.dataset.rgCell),
    values: Object.fromEntries(cells.map(c => [c.dataset.rgCell, c.querySelector('.gi-rg-value')?.textContent])),
    subs: Object.fromEntries(cells.map(c => [c.dataset.rgCell, c.querySelector('small')?.textContent || ''])),
    detail: root.querySelector('[data-rg-detail]')?.textContent || '', watch: root.querySelector('[data-rg-watch]')?.textContent || '',
    strength: root.querySelector('[data-rg-strength]')?.textContent || '',
    options: [...root.querySelectorAll('[data-rg-type] option')].map(o => o.textContent),
    view: root.querySelector('[data-rg-view].is-selected')?.dataset.rgView,
    overflow: { doc: document.documentElement.scrollWidth - document.documentElement.clientWidth, chart: root.scrollWidth - root.clientWidth },
    inModule: !!root.closest('.gi-overview-module'),
  };
});
let u = await ui();
ok(!!u && u.cohort === '9 of 11 runs charted with a gap', 'the Structure page shows the chart with its eligible-sample sentence', JSON.stringify(u && u.cohort));
ok(u && u.order.join() === 'L-D,L-C,L-B,L-A,Center,R-A,R-B,R-C,R-D,Other', 'the ten gaps are in football order, left to right', u && u.order.join());
ok(u && u.values['L-A'] === '2' && u.values['R-B'] === '2' && u.values['L-D'] === '-' && u.subs['L-A'] === '22%', 'frequency shows each gap\'s runs and share of the charted runs', JSON.stringify(u && [u.values, u.subs]));
ok(u && !u.inModule, 'the chart is not a report module, so the approved module schema is unchanged');
ok(u && /Toward/.test(u.strength) && /2 runs/.test(u.strength) && /3 of 7 sided runs/.test(u.strength), 'the strength line states its own sample', u && u.strength);
await page.evaluate(() => document.querySelector('[data-rg-view="performance"]').click()); await sleep(200);
u = await ui();
ok(u && u.view === 'performance' && u.values['R-B'] === '7.0' && u.values['Other'] === '-' && u.subs['R-B'] === '50%', 'performance shows yards per play with success', JSON.stringify(u && [u.values['R-B'], u.values['Other'], u.subs['R-B']]));
await page.evaluate(() => document.querySelector('[data-rg-view="frequency"]').click());
// Selecting a gap: the detail and its exact film.
await page.evaluate(() => { window.__watch = []; window.app.filmNavigation.watch = async (refs, options) => { window.__watch.push({ refs: [...refs], label: options?.label }); return { completed: true }; }; });
await page.evaluate(() => document.querySelector('[data-rg-cell="R-B"]').click()); await sleep(200);
u = await ui();
ok(/R-B/.test(u.detail) && /2 runs/.test(u.detail) && /Watch 2 plays/.test(u.watch), 'selecting a gap opens its detail and a Watch action for its runs', u.detail.slice(0, 80));
await page.evaluate(() => document.querySelector('[data-rg-watch]').click()); await sleep(200);
const watched = await page.evaluate(() => window.__watch);
ok(watched.length === 1 && same(watched[0].refs.slice().sort(), ['g-gap::3', 'g-gap::4']), 'Watch plays exactly the contributing clips, no more, no fewer', JSON.stringify(watched));
// Play type narrows the cohort.
u = await ui();
ok(u.options[0] === 'All runs' && u.options.some(o => /^Reverse \(2\)/.test(o)), 'the Play Type control offers the types on charted runs', u.options.join());
await page.evaluate(() => { const s = document.querySelector('[data-rg-type]'); s.value = 'Reverse'; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(250);
u = await ui();
ok(u.cohort === '2 of 2 runs (Reverse) charted with a gap' && u.values['R-D'] === '1' && u.values['L-C'] === '1' && u.values['L-A'] === '-', 'narrowing to Reverse keeps its own sample and counts a two-type snap under it', JSON.stringify(u.cohort));
await page.evaluate(() => { const s = document.querySelector('[data-rg-type]'); s.value = ''; s.dispatchEvent(new Event('change', { bubbles: true })); }); await sleep(200);
// Widths.
for (const [w, h] of [[1440, 900], [1280, 800], [768, 1024], [390, 844]]) {
  await page.setViewport({ width: w, height: h }); await sleep(300);
  const g = await ui();
  ok(g && g.overflow.doc <= 1 && g.overflow.chart <= 1, `no horizontal overflow at ${w}x${h}`, JSON.stringify(g && g.overflow));
}
await page.setViewport({ width: 1440, height: 900 });

console.log('\n== 3. Export parity ==');
const html = await page.evaluate(() => {
  const capture = { html: null };
  const sm = window.app.storage;
  const NativeBlob = window.Blob;
  window.Blob = class TestBlob { constructor(parts, options = {}) { this.parts = parts; this.type = options.type || ''; } };
  try { sm._download = b => { capture.html = b.parts.map(String).join(''); }; sm.exportHtmlReport(window.app.stats); } finally { window.Blob = NativeBlob; }
  if (!capture.html) return null;
  const doc = new DOMParser().parseFromString(capture.html, 'text/html');
  const table = doc.querySelector('[data-rg-export="offense"]');
  const rows = table ? Object.fromEntries([...table.querySelectorAll('tbody tr')].map(tr => [tr.dataset.rgRow, [...tr.children].map(td => td.textContent)])) : null;
  return { rows, cohort: doc.querySelector('[data-rg-cohort]')?.textContent || '', strength: doc.querySelector('[data-rg-strength]')?.textContent || '' };
});
ok(html && html.rows && Object.keys(html.rows).join() === 'L-D,L-C,L-B,L-A,Center,R-A,R-B,R-C,R-D,Other', 'the game report prints the ten gaps in the same order');
const onScreen = await ui();
ok(html && html.rows && Object.entries(html.rows).every(([gap, row]) => row[1] === (onScreen.values[gap] === '-' ? '-' : onScreen.values[gap]) || row[1] === String(onScreen.values[gap])), 'the printed Runs column equals the screen\'s frequency values', JSON.stringify(html && html.rows));
ok(html && html.cohort.startsWith('9 of 11 runs charted with a gap') && /Strength is charted on 3 of 7 sided runs/.test(html.strength), 'the report states the same eligible sample and strength sample', html && html.cohort.slice(0, 60));
ok(html && html.rows['R-B'][3] === '7.0' && html.rows['R-B'][4] === '50%' && html.rows['Other'][3] === '-', 'the printed yards per play and success equal the engine\'s', JSON.stringify(html && html.rows['R-B']));

console.log('\n== 4. The runs a defense faced ==');
const def = await page.evaluate(async () => {
  const app = window.app;
  const plays = app.tagger.plays.map(p => ({ ...p, tags: { ...p.tags, unit: 'defense' }, __gid: 'g-gap' }));
  const c = app.stats.runGapChart(plays, { side: 'defense' });
  return { runs: c.runs, charted: c.charted, line: app.stats.constructor.runGapCohortLine(c), refs: c.cells.find(x => x.gap === 'R-B').refs };
});
ok(def.runs === 11 && def.charted === 9 && def.line === '9 of 11 runs faced charted with a gap' && same(def.refs, ['g-gap::3', 'g-gap::4']), 'a defense\'s faced runs read the same offense-side Gap, with its own wording', JSON.stringify(def));

ok(errors.length === 0, 'no page errors', errors.slice(0, 2).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
