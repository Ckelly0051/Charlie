/** Reports > Defense, Revision 2: focused contracts on a synthetic season.
 *
 * The canonical season (`e2e-reports-defense-realdata`) proves the approved
 * composition on real data. This fixture exists for the cases that season does
 * not contain: touchdowns scored by BOTH sides, a takeaway without a touchdown,
 * a Safety and a Field Goal possession, more possessions than a module holds,
 * and charting with no front, coverage or play type at all. Every team, game and
 * player here is synthetic, isolated in memory, and never persisted.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(500);

/* THE FIXTURE. Game A carries both touchdown sides, a takeaway without a
   touchdown, and third/fourth downs with known conversions. Game B carries no
   front, coverage or play type, and enough possessions to overflow a module. */
await page.evaluate(async () => {
  const app = window.app;
  const play = (id, tags, extra = {}) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 },
    tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags }, ...extra });
  const struct = { defFront: 'Maverick', coverage: 'Cover 3' };
  const gameA = [
    play(1, { ...struct, down: '3', distance: '5', runPass: 'Run', playType: 'Run Inside', yardage: '2', result: 'Gain', personnel: '11', players: { tackler: '5' } }),
    play(2, { ...struct, down: '3', distance: '5', runPass: 'Run', playType: 'Run Inside', yardage: '6', result: 'Gain', personnel: '11', players: { tackler: '7' } }),
    play(3, { ...struct, down: '3', distance: '10', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Incomplete', personnel: '11' }),
    play(4, { ...struct, down: '3', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception', personnel: '11', players: { takeaway: '22' } }),
    play(5, { ...struct, down: '4', distance: '2', runPass: 'Run', playType: 'Run Outside', yardage: '3', result: 'Gain', personnel: '11', players: { tackler: '5, 9' } }),
    play(6, { ...struct, down: '4', distance: '1', runPass: 'Run', playType: 'Run Outside', yardage: '40', result: 'Touchdown', personnel: '11', players: { tackler: '9' } }),
    play(7, { ...struct, down: '1', distance: '10', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception + Touchdown', personnel: '12', players: { takeaway: '22' } }),
    play(8, { ...struct, down: '2', distance: '7', runPass: 'Run', playType: 'Run Inside', yardage: '-2', result: 'Fumble + Touchdown', fumbleRecovery: 'subject', personnel: '12', players: { tackler: '31' } }),
    // Our score with no charted takeaway: a fumble returned for a touchdown whose
    // recovery was never charted (the retired scoreFor carried this before 2026-09-26).
    play(9, { ...struct, down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '1', result: 'Fumble + Touchdown', personnel: '12' }),
    // A fourth takeaway with no touchdown, so takeaways (4) and defensive
    // touchdowns (3) can never agree by coincidence.
    play(10, { ...struct, down: '2', distance: '6', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception', personnel: '12', players: { takeaway: '22' } }),
  ];
  const gameB = [
    ...Array.from({ length: 12 }, (_, index) => play(index + 1, { down: '4', distance: '6', yardage: '0', result: 'Punt' })),
    play(13, { down: '2', distance: '9', yardage: '-3', result: 'Safety' }),
    play(14, { down: '4', distance: '4', yardage: '0', result: 'Field Goal' }),
  ];
  const store = app.storage.seasonStore;
  store.data = store._normalize({ id: 'def2-fixture', name: 'Defense Board Fixture', teamId: 'def2-fixture-team',
    year: 2025, games: [], roster: [] });
  store.currentSeasonId = 'def2-fixture';
  app.storage.seasonStore.data.roster = [
    { num: '5', name: 'Alpha' }, { num: '7', name: 'Bravo' }, { num: '9', name: 'Charlie' },
    { num: '22', name: 'Delta' }, { num: '31', name: 'Echo' },
  ];
  app.storage.seasonStore.data.games = [
    { id: 'a', name: 'Week 1', nextId: 11, gameInfo: { opponent: 'Wildcats', perspective: 'self', date: '2025-09-01' }, plays: gameA },
    { id: 'b', name: 'Week 2', nextId: 15, gameInfo: { opponent: 'Knights', perspective: 'self', date: '2025-09-08' }, plays: gameB },
    { id: 'c', name: 'Scout', nextId: 2, gameInfo: { opponent: 'Rivals', perspective: 'scout', date: '2025-09-02' },
      plays: [play(1, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '9', result: 'Touchdown' })] },
  ];
  app.storage.seasonStore.data.activeGameId = 'a';
  await app.storage._loadActiveGame();
  app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('defense');
});
await sleep(400);

const clickScope = async scope => {
  await page.evaluate(s => document.querySelector(`[data-defense-scope="${s}"]`)?.click(), scope);
  await sleep(300);
  await page.evaluate(() => document.querySelectorAll('.gi-native-toast').forEach(node => node.remove()));
};
const setGame = async id => {
  await page.evaluate(async gameId => {
    const app = window.app;
    app.storage.seasonStore.data.activeGameId = gameId;
    await app.storage._loadActiveGame();
    app.reportsScreen.selectTab('defense');
  }, id);
  await sleep(300);
};
/* The board is four pages in the shared secondary bar (coach-approved comp,
   2026-09-23). `board()` walks all four and merges them, so every assertion
   below still sees the whole report; each module sits on exactly one page. */
const PAGES = ['performance', 'opponent', 'scheme', 'situations'];
const showPage = async id => {
  await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), id);
  await sleep(120);
};
const board = async () => {
  const parts = [];
  for (const id of PAGES) {
    await showPage(id);
    const part = await boardPage();
    part.modules.forEach(module => { module.page = id; });
    parts.push(part);
  }
  await showPage('performance');
  return {
    ...parts[0],
    kpis: Object.assign({}, ...parts.map(part => part.kpis)),
    modules: parts.flatMap(part => part.modules),
    text: parts.map(part => part.text).join(' '),
    bandWidth: Math.max(...parts.map(part => part.bandWidth)),
  };
};
const boardPage = () => page.evaluate(() => {
  const root = document.querySelector('.gi-def2');
  const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
  return {
    kpis: Object.fromEntries([...(root?.querySelectorAll('[data-def2-kpi]') || [])].map(node => [node.dataset.def2Kpi, text(node.querySelector('strong'))])),
    modules: [...(root?.querySelectorAll('[data-def2-module]') || [])].map(module => {
      const rect = module.getBoundingClientRect();
      const rows = [...module.querySelectorAll('tbody tr')];
      return { title: module.dataset.def2Module, schema: module.dataset.def2Schema,
        top: Math.round(rect.top), bottom: Math.round(rect.bottom), width: Math.round(rect.width), height: Math.round(rect.height),
        wide: module.classList.contains('is-wide'),
        rows: rows.filter(row => !row.classList.contains('is-held')).map(row => [...row.cells].map(text)),
        held: rows.filter(row => row.classList.contains('is-held')).length };
    }),
    text: text(root),
    header: text(document.querySelector('[data-reports-title]')?.parentElement),
    pressed: [...document.querySelectorAll('[data-defense-scope]')].map(button => `${button.dataset.defenseScope}:${button.getAttribute('aria-pressed')}`),
    bandWidth: Math.round(root?.querySelector('.gi-def2-bands')?.getBoundingClientRect().width || 0),
  };
});
const moduleOf = (seen, title) => seen.modules.find(module => module.title === title);

/* ══ 1. Touchdowns by scoring side, takeaways and stop inversion ═════════ */
console.log('\n== 1. KPIs on game A ==');
await clickScope('game');
let seen = await board();
ok(seen.kpis['Touchdowns Allowed'] === '1',
  'Touchdowns Allowed counts only the touchdown scored by the opponent', JSON.stringify(seen.kpis));
ok(seen.kpis['Defensive Touchdowns'] === '3',
  'Defensive Touchdowns counts the interception return, the fumble return and the explicitly credited score', JSON.stringify(seen.kpis));
ok(seen.kpis.Takeaways === '4',
  'Takeaways counts three interceptions and the fumble recovery; neither count is inferred from the other', JSON.stringify(seen.kpis));
ok(seen.kpis['3rd Down Stop %'] === '75.0%' && seen.kpis['4th Down Stop %'] === '0.0%',
  'Stop % is the inverse of allowed %: 1 of 4 third downs converted is 75.0%, 2 of 2 fourth downs is a measured 0.0%', JSON.stringify(seen.kpis));
const model = await page.evaluate(() => {
  const app = window.app;
  const { scoped } = app.reportsScreen._defenseCohort();
  const { scoped: seasonPlays } = app.reportsScreen._selfPerspectiveCohort('season');
  const b = app.stats.defenseBoard(scoped, { scope: 'game', seasonPlays, labels: { a: 'Wildcats', b: 'Knights' } });
  const d = app.stats.defenseDashboard(scoped, { a: 'Wildcats', b: 'Knights' });
  const strip = value => JSON.parse(JSON.stringify(value, (key, v) => key === 'plays' ? undefined : v));
  const quarter = b.quarters.find(row => row.name === 'Q1');
  return { kpis: b.kpis, third: d.thirdDownAllowed, fourth: d.fourthDownAllowed,
    unchanged: JSON.stringify(strip(b.dashboard)) === JSON.stringify(strip(d)),
    dashboardTouchdowns: d.summary.touchdowns, quarterNull: quarter };
});
ok(model.third.rate === 25 && model.kpis.thirdDownStop === 75 && model.fourth.rate === 100 && model.kpis.fourthDownStop === 0,
  'the engine derives stop percentages from the existing allowed percentages', JSON.stringify(model));
ok(model.unchanged, 'defenseBoard carries the existing defenseDashboard output unchanged');

/* ══ 2. Scope switching ══════════════════════════════════════════════════ */
console.log('\n== 2. Scope switching ==');
ok(!moduleOf(seen, 'Game-by-game') && moduleOf(seen, 'Current game vs Season')
  && JSON.stringify(seen.pressed) === JSON.stringify(['game:true', 'season:false']),
  'Current game scope omits Game-by-game, compares with the season, and presses its own button', JSON.stringify(seen.pressed));
await clickScope('season');
seen = await board();
ok(moduleOf(seen, 'Game-by-game')?.rows.map(row => row[0]).join('|') === 'Wildcats|Knights'
  && moduleOf(seen, 'Season vs Last 3') && JSON.stringify(seen.pressed) === JSON.stringify(['game:false', 'season:true']),
  'Full season renders Game-by-game by opponent, excludes the scout game, and compares with the last three games',
  JSON.stringify({ games: moduleOf(seen, 'Game-by-game')?.rows, pressed: seen.pressed }));
ok(/Full season/.test(seen.header), 'the scope button resynchronizes the shared header', seen.header);
ok(!seen.text.includes('Rivals'), 'no opponent-scout film reaches the board');
ok(moduleOf(seen, 'Game-by-game')?.rows.find(row => row[0] === 'Wildcats')?.[7] === '1',
  'Game-by-game Touchdowns Allowed uses the same scoring-side rule as the KPI', JSON.stringify(moduleOf(seen, 'Game-by-game')?.rows));

/* ══ 3. Drive outcomes are data-driven ═══════════════════════════════════ */
console.log('\n== 3. Drive outcomes ==');
const outcomes = moduleOf(seen, 'Opponent drive outcomes')?.rows || [];
const engineOutcomes = await page.evaluate(() => {
  const app = window.app;
  const { scoped } = app.reportsScreen._selfPerspectiveCohort('season');
  // The board's scoring-side-aware possessions, not raw `_driveStats`, which
  // would read our return touchdowns as opponent touchdowns.
  return [...new Set(app.stats.defenseBoard(scoped, { scope: 'season', seasonPlays: scoped }).possessions.map(drive => drive.outcome))];
});
ok(outcomes.some(row => row[0] === 'Safety') && outcomes.some(row => row[0] === 'Field Goal')
  && outcomes.some(row => row[0] === 'Punt') && outcomes.some(row => row[0] === 'Touchdown'),
  'Safety, Field Goal, Punt and Touchdown each appear as their own outcome row when they occur',
  JSON.stringify({ outcomes, engineOutcomes }));
ok(outcomes.length === engineOutcomes.length && outcomes.every(row => Number(row[1]) > 0)
  && !outcomes.some(row => /^(TD|FG|Missed FG)$/.test(row[0])),
  'one row per reconstructed outcome, no empty outcome rows, and no abbreviated outcome names', JSON.stringify(outcomes));
const possessions = moduleOf(seen, 'Opponent possessions');
ok(possessions && possessions.rows.every(row => !/^(TD|FG)$/.test(row[6])) && possessions.rows.some(row => row[6] === 'Safety'),
  'possession outcomes spell the outcome out', JSON.stringify(possessions?.rows.map(row => row[6])));

/* ══ 4. Fixed-schema, variable and scrolling modules ═════════════════════ */
console.log('\n== 4. Module geometry ==');
const fixedSpec = [['By down', 4, 38], ['By quarter', 4, 38], ['Disruption', 5, 38], ['Blitz Performance', 4, 38],
  ['Blitz Type Performance', 4, 38], ['Run / Pass vs Strength', 3, 38], ['High-leverage field position', 5, 48],
  ['Passing Defense Summary', 1, 38]];
const fixedBreaks = fixedSpec.map(([title, rows, pitch]) => ({ title, rows, pitch, module: moduleOf(seen, title) }))
  .filter(({ rows, pitch, module }) => !module || module.rows.length !== rows || module.held !== 0 || module.height !== 96 + rows * pitch)
  .map(({ title, module }) => ({ title, rows: module?.rows.length, held: module?.held, height: module?.height }));
ok(fixedBreaks.length === 0, 'fixed-schema modules hold exactly their possible rows with no dead space or placeholder rows', JSON.stringify(fixedBreaks));
ok(JSON.stringify(moduleOf(seen, 'Blitz Type Performance')?.rows) === JSON.stringify(['A-Gap', 'B-Gap', 'C-Gap', 'D-Gap']
  .map(name => [name, '—', '—', '—', '—', '—'])),
  'Blitz Type Performance keeps its four gap rows and prints an em dash where nothing was charted',
  JSON.stringify(moduleOf(seen, 'Blitz Type Performance')?.rows));
ok(JSON.stringify(moduleOf(seen, 'Blitz Performance')?.rows.map(row => row[0])) === JSON.stringify(['Blitz vs Run', 'No Blitz vs Run', 'Blitz vs Pass', 'No Blitz vs Pass'])
  && JSON.stringify(moduleOf(seen, 'Run / Pass vs Strength')?.rows.map(row => row[0])) === JSON.stringify(['Toward strength', 'Away from strength', 'Balanced strength']),
  'Blitz Performance and Run / Pass vs Strength hold their exact cohorts in order');

await clickScope('game');
seen = await board();
const personnel = moduleOf(seen, 'Personnel faced');
ok(personnel?.rows.length === 2 && personnel.height === 220 && personnel.held === 1,
  'a variable module with unused capacity renders dash rows instead of dead space', JSON.stringify(personnel));
await showPage(personnel?.page);
const heldText = await page.evaluate(() => [...document.querySelectorAll('[data-def2-module="Personnel faced"] tr.is-held td')].map(td => td.textContent));
await showPage('performance');
ok(heldText.length === 5 && heldText.every(value => value === '-'), 'a held row is a formatted dash in every column', JSON.stringify(heldText));

await clickScope('season');
await showPage(moduleOf(await board(), 'Opponent possessions')?.page || 'performance');
const scroll = await page.evaluate(async () => {
  const module = document.querySelector('[data-def2-module="Opponent possessions"]');
  const wrap = module.querySelector('.gi-def2-tablewrap');
  const head = module.querySelector('thead');
  const height = module.getBoundingClientRect().height;
  wrap.scrollTop = wrap.scrollHeight;
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { height, after: module.getBoundingClientRect().height, client: wrap.clientHeight, scrollHeight: wrap.scrollHeight,
    scrolled: wrap.scrollTop > 0, headOffset: Math.round(head.getBoundingClientRect().top - wrap.getBoundingClientRect().top),
    rows: module.querySelectorAll('tbody tr:not(.is-held)').length, held: module.querySelectorAll('tbody tr.is-held').length };
});
ok(scroll.rows > 8 && scroll.height === 460 && scroll.after === 460 && scroll.scrollHeight > scroll.client && scroll.scrolled && scroll.held === 0,
  'more possessions than capacity scroll inside a fixed 460px module with no dash rows', JSON.stringify(scroll));
ok(Math.abs(scroll.headOffset) <= 1, 'the table header stays visible at the top of the module while it scrolls', JSON.stringify(scroll));
await showPage('performance');

/* ══ 5. Pairing ══════════════════════════════════════════════════════════ */
console.log('\n== 5. Pairing ==');
seen = await board();
const byDown = moduleOf(seen, 'By down'), byQuarter = moduleOf(seen, 'By quarter'), disruption = moduleOf(seen, 'Disruption');
ok(byDown && byQuarter && !byDown.wide && !byQuarter.wide && byDown.top === byQuarter.top && byDown.bottom === byQuarter.bottom
  && byDown.width === (seen.bandWidth - 20) / 2,
  'two half-width modules of equal height pair with aligned top and bottom edges', JSON.stringify({ byDown, byQuarter, band: seen.bandWidth }));
ok(disruption?.wide && disruption.width === seen.bandWidth,
  'a half-width module with no equal-height partner spans the row rather than leaving empty paired space', JSON.stringify(disruption));

/* ══ 6. Zero-sample suppression ══════════════════════════════════════════ */
console.log('\n== 6. Zero-sample suppression (game B) ==');
await setGame('b');
await clickScope('game');
seen = await board();
ok(!moduleOf(seen, 'Front performance') && !moduleOf(seen, 'Coverage performance'),
  'a game with no charted front or coverage renders neither structure module',
  JSON.stringify(seen.modules.map(module => module.title)));
const types = moduleOf(seen, 'Production by play type');
ok(types && types.rows.length === 0 && types.held === 3,
  'no play type charted: the module keeps its compact height with dash rows and prints no zero-snap row', JSON.stringify(types));
ok(moduleOf(seen, 'Pressure by situation')?.rows.every(row => Number(row[1]) > 0)
  && moduleOf(seen, 'By hash')?.rows.length === 0 && moduleOf(seen, 'Field zone')?.rows.length === 0,
  'situation, hash and zone rows with no snaps are suppressed', JSON.stringify(seen.modules.filter(m => ['Pressure by situation', 'By hash', 'Field zone'].includes(m.title))));
ok(seen.kpis['4th Down Stop %'] !== '—' && seen.kpis['Yards / play'] === '—',
  'a KPI with no classified snap prints the em dash while a measured rate still prints', JSON.stringify(seen.kpis));

/* ══ 7. Sorting every player column, by mouse and keyboard ═══════════════ */
console.log('\n== 7. Player contributions sorting ==');
await setGame('a');
await clickScope('game');
// Player contributions is on the Performance page.
await showPage('performance');
const readPlayers = () => page.evaluate(() => {
  const table = document.querySelector('[data-def2-module="Defensive player contributions"] table');
  return {
    heads: [...table.querySelectorAll('th')].map(th => ({ sort: th.getAttribute('aria-sort'), tab: th.tabIndex })),
    rows: [...table.querySelectorAll('tbody tr')].map(tr => ({ held: tr.classList.contains('is-held'), cells: [...tr.cells].map(td => td.textContent.trim()) })),
  };
});
const value = text => parseFloat(String(text).replace(/[^0-9.-]/g, ''));
const ordered = (rows, column, direction) => rows.slice(1).every((row, index) => {
  const a = rows[index].cells[column], b = row.cells[column];
  const an = value(a), bn = value(b);
  const cmp = Number.isNaN(an) || Number.isNaN(bn) ? a.localeCompare(b, undefined, { numeric: true }) : an - bn;
  return direction === 'asc' ? cmp <= 0 : cmp >= 0;
});
const players = await readPlayers();
ok(players.heads.length === 9 && players.heads.every(head => head.tab === 0 && head.sort === 'none'),
  'every player column header is keyboard focusable and starts unsorted', JSON.stringify(players.heads));
const sortBreaks = [];
let changedOrder = 0;
for (let column = 0; column < 9; column++) {
  await page.evaluate(index => document.querySelectorAll('[data-def2-module="Defensive player contributions"] th')[index].click(), column);
  await sleep(60);
  const asc = await readPlayers();
  await page.evaluate(index => document.querySelectorAll('[data-def2-module="Defensive player contributions"] th')[index].click(), column);
  await sleep(60);
  const desc = await readPlayers();
  const data = state => state.rows.filter(row => !row.held);
  if (JSON.stringify(data(asc)) !== JSON.stringify(data(desc))) changedOrder++;
  if (!ordered(data(asc), column, 'asc') || asc.heads[column].sort !== 'ascending'
    || !ordered(data(desc), column, 'desc') || desc.heads[column].sort !== 'descending'
    || asc.rows.some((row, i) => row.held && asc.rows.slice(i).some(other => !other.held))) sortBreaks.push(column);
}
ok(sortBreaks.length === 0 && changedOrder >= 6,
  'clicking any column sorts ascending, clicking again sorts descending, and dash rows stay last',
  JSON.stringify({ sortBreaks, changedOrder }));
await page.focus('[data-def2-module="Defensive player contributions"] th:nth-child(2)');
await page.keyboard.press('Enter');
await sleep(60);
const byEnter = await readPlayers();
await page.keyboard.press('Space');
await sleep(60);
const bySpace = await readPlayers();
ok(byEnter.heads[1].sort === 'ascending' && ordered(byEnter.rows.filter(row => !row.held), 1, 'asc')
  && bySpace.heads[1].sort === 'descending' && ordered(bySpace.rows.filter(row => !row.held), 1, 'desc'),
  'Enter and Space on a focused header sort that column', JSON.stringify({ enter: byEnter.heads[1], space: bySpace.heads[1] }));
ok(byEnter.rows.some(row => row.cells[0] === '#22 Delta') && byEnter.rows.some(row => row.cells[0] === '#31 Echo'),
  'players carry their roster names, including a takeaway-only player', JSON.stringify(byEnter.rows.map(row => row.cells[0])));

/* ══ 8. Pages (supersede the retired jump links) ═════════════════════════ */
console.log('\n== 8. Pages ==');
await clickScope('season');
const pages = [];
for (const id of PAGES) {
  await page.evaluate(() => document.querySelector('.ws-reports')?.scrollTo(0, 400));
  await showPage(id);
  pages.push(await page.evaluate(() => ({
    page: document.querySelector('.gi-def2')?.dataset.def2Page,
    sections: [...document.querySelectorAll('[data-def2-section]')].map(node => node.dataset.def2Section),
    scrolled: document.querySelector('.ws-reports')?.scrollTop,
    hash: location.hash,
    jumpLinks: document.querySelectorAll('[data-def2-jump]').length,
  })));
}
await showPage('performance');
ok(pages.every((item, i) => item.page === PAGES[i] && item.sections.length === 1 && item.scrolled === 0
    && !item.hash.includes('def2') && item.jumpLinks === 0),
  'each page shows exactly one section, opens at the top of the report, and never rewrites the route hash', JSON.stringify(pages));

/* ══ 9. Literal labels ═══════════════════════════════════════════════════ */
seen = await board();
ok(!/\bTD\b|ADDED/.test(seen.text) && /Touchdowns Allowed/.test(seen.text) && /Explosive Plays\b/.test(seen.text) && !/Explosive Plays Allowed/.test(seen.text)
  && /with Run\/Pass charted/.test(seen.text) && /1st Downs Allowed/.test(seen.text) && /Allowed %/.test(seen.text)
  && /Red-zone Touchdown Rate/.test(seen.text),
  'the board uses its literal labels and no ambiguous TD abbreviation or proposal marker');

/* ══ 10. Scoring side, conversions, run TFL, unmeasured cohorts, field end ═ */
console.log('\n== 10. Review repairs ==');
const wildcats = moduleOf(seen, 'Opponent possessions')?.rows.filter(row => row[0] === 'Wildcats') || [];
const knights = moduleOf(seen, 'Opponent possessions')?.rows.filter(row => row[0] === 'Knights') || [];
ok(wildcats.filter(row => row[6] === 'Touchdown').length === 1
  && wildcats.reduce((sum, row) => sum + (Number(row[7]) || 0), 0) === 6
  && knights.find(row => row[6] === 'Safety')?.[7] === '0',
  'our return touchdowns and our safety score the opponent nothing in Opponent possessions',
  JSON.stringify({ wildcats, knights: knights.filter(row => row[6] !== 'Punt') }));
ok(moduleOf(seen, 'Opponent drive outcomes')?.rows.find(row => row[0] === 'Touchdown')?.[1] === '1',
  'Opponent drive outcomes counts only the opponent touchdown', JSON.stringify(moduleOf(seen, 'Opponent drive outcomes')?.rows));
const repairs = await page.evaluate(() => {
  const play = (id, tags) => ({ id, __gid: 'r', __seasonGameIdx: 0, timestamp: { start: id * 10, end: id * 10 + 6 },
    tags: { unit: 'defense', custom: [], players: {}, grades: {}, ...tags } });
  const plays = [
    play(1, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '4', result: 'Gain', yardLine: '30', fieldSide: 'own' }),
    play(2, { down: '3', distance: '6', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception + Touchdown', yardLine: '34', fieldSide: 'own', players: { takeaway: '22' } }),
    play(3, { down: '2', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '-4', result: 'Loss', yardLine: '40', fieldSide: 'opp' }),
    play(4, { down: '3', distance: '12', runPass: 'Run', playType: 'Run Inside', yardage: '18', result: 'Touchdown', yardLine: '18', fieldSide: 'own' }),
    play(5, { down: '1', distance: '10', defFront: 'Bear', yardage: '25', result: 'Gain', yardLine: '5', fieldSide: 'opp' }),
    play(6, { down: '2', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '-3', result: 'Safety', yardLine: '3', fieldSide: 'opp' }),
  ];
  const b = window.app.stats.defenseBoard(plays, { scope: 'game', seasonPlays: plays, labels: { r: 'Repairs' } });
  const d = window.app.stats.defenseDashboard([plays[1]], { r: 'Repairs' });
  return {
    possessions: b.possessions.map(row => [row.outcome, row.points]),
    outcomes: b.driveOutcomes.map(row => row.name),
    thirdAndMedium: b.downDistance.find(row => row.name === '3rd & 4-6'),
    thirdAllowed: d.thirdDownAllowed,
    runTfl: b.disruption.find(row => row.name === 'Run TFL'),
    bear: b.fronts.find(row => row.name === 'Bear'),
    leverage: Object.fromEntries(b.highLeverage.map(row => [row.name, [row.sample, row.touchdownsAllowed]])),
  };
});
ok(JSON.stringify(repairs.possessions) === JSON.stringify([['Turnover', 0], ['Touchdown', 6], ['Safety', 0]])
  && repairs.outcomes.filter(name => name === 'Touchdown').length === 1 && repairs.outcomes.includes('Turnover'),
  'a pick-six ends the opponent possession as a Turnover for 0 points; only their own touchdown scores 6', JSON.stringify(repairs));
ok(repairs.thirdAndMedium?.firstDowns === 0 && repairs.thirdAllowed?.rate === 0,
  'a defensive touchdown on third down is neither a 1st down allowed nor a third down allowed', JSON.stringify(repairs.thirdAndMedium));
ok(repairs.runTfl?.plays === 1 && repairs.runTfl.refs.join() === 'r::6',
  'Run TFL counts the negative run and not the negative-yardage pass', JSON.stringify(repairs.runTfl));
ok(repairs.bear && repairs.bear.n === 1 && repairs.bear.explosives === null,
  'a structure cohort with no Run/Pass charted reports no explosive count rather than 0', JSON.stringify(repairs.bear));
ok(JSON.stringify(repairs.leverage['Red-zone possessions']) === '[1,1]'
  && JSON.stringify(repairs.leverage['Inside our 20 / snaps']) === '[1,1]'
  && JSON.stringify(repairs.leverage['Goal line / snaps']) === '[0,0]'
  && JSON.stringify(repairs.leverage['Opponent backed up / snaps']) === '[2,0]',
  'high-leverage rows measure from our goal: our 18 is inside our 20, the opponent 3 and 5 are backed up', JSON.stringify(repairs.leverage));

/* ══ 11. Field-zone perspective and one drive-attribution owner ═══════════ */
console.log('\n== 11. Defensive field zones and the shared drive owner ==');
const zoneModel = await page.evaluate(() => {
  const engine = window.app.stats;
  const at = (yardLine, fieldSide) => ({ yardLine: String(yardLine), fieldSide });
  const spots = [[3, 'own'], [5, 'own'], [6, 'own'], [20, 'own'], [21, 'own'], [50, 'own'], [40, 'opp'], [11, 'opp'], [10, 'opp'], [5, 'opp']];
  const unit = (tags, u, charted) => ({ id: 1, tags: { unit: u, custom: [], players: {}, grades: {}, ...tags }, ...(charted ? { __chartedUnit: charted } : {}) });
  return {
    bands: spots.map(([yardLine, fieldSide]) => {
      const tags = at(yardLine, fieldSide);
      return [engine._absYardLine(tags), engine._defensiveFieldZone(tags), engine._fieldZone(tags)];
    }),
    blank: [engine._defensiveFieldZone({}), engine._fieldZone({}),
      engine.fieldZoneOf(unit({}, 'defense')), engine.fieldZoneOf(unit({}, 'offense'))],
    // A relabeled Matchup rep keeps the perspective it was charted in.
    perspective: [
      engine.fieldZoneOf(unit(at(12, 'own'), 'defense')),
      engine.fieldZoneOf(unit(at(12, 'own'), 'offense')),
      engine.fieldZoneOf(unit(at(12, 'own'), 'offense', 'defense')),
      engine.fieldZoneOf(unit(at(12, 'own'), 'defense', 'offense')),
      engine.fieldZoneOf(unit(at(12, 'own'), 'special')),
    ],
    redZone: [
      engine._inRedZone(unit(at(12, 'own'), 'defense')), engine._inRedZone(unit(at(12, 'opp'), 'defense')),
      engine._onGoalLine(unit(at(4, 'own'), 'defense')), engine._onGoalLine(unit(at(12, 'own'), 'defense')),
      engine._inRedZone(unit(at(12, 'opp'), 'offense')), engine._inRedZone(unit(at(12, 'own'), 'offense')),
    ],
    // The Matchup Red Zone situation is one of these predicates, not a threshold.
    matchup: (() => {
      const spec = engine._matchupSituations().find(item => item.key === 'red-zone');
      return [spec.match(unit(at(12, 'own'), 'defense')), spec.match(unit(at(12, 'opp'), 'defense')),
        spec.match(unit(at(12, 'opp'), 'offense')), spec.match(unit(at(12, 'own'), 'offense'))];
    })(),
  };
});
ok(JSON.stringify(zoneModel.bands) === JSON.stringify([
  [3, 'Goal line', 'Backed up'], [5, 'Goal line', 'Backed up'], [6, 'Red zone', 'Backed up'],
  [20, 'Red zone', 'Own 11–39'], [21, 'Opp 40–20', 'Own 11–39'], [50, 'Midfield', 'Midfield'],
  [60, 'Midfield', 'Opp 40–20'], [89, 'Own 11–39', 'Red zone'], [90, 'Backed up', 'Red zone'],
  [95, 'Backed up', 'Goal line'],
]), 'the defensive bucketer mirrors the six bands and leaves the offense bucketer unchanged', JSON.stringify(zoneModel.bands));
ok(JSON.stringify(zoneModel.blank) === JSON.stringify(['', '', '', '']),
  'a snap with no charted field position joins no band in either perspective', JSON.stringify(zoneModel.blank));
ok(JSON.stringify(zoneModel.perspective) === JSON.stringify(['Red zone', 'Own 11–39', 'Red zone', 'Own 11–39', 'Own 11–39']),
  'the zone follows the unit the coach charted, including a relabeled Matchup rep', JSON.stringify(zoneModel.perspective));
ok(JSON.stringify(zoneModel.redZone) === JSON.stringify([true, false, true, false, true, false])
  && JSON.stringify(zoneModel.matchup) === JSON.stringify([true, false, true, false]),
  'our 12 is a defensive red-zone snap and the opponent 12 is not; Matchup reads the same predicate',
  JSON.stringify(zoneModel));
const drives = await page.evaluate(async () => {
  const app = window.app;
  const play = (id, tags) => ({ id, __gid: 'z', __seasonGameIdx: 0, timestamp: { start: id * 10, end: id * 10 + 6 },
    tags: { unit: 'defense', custom: [], players: {}, grades: {}, defFront: 'Bear', coverage: 'Cover 3', ...tags } });
  const plays = [
    // One snap per band, from our own goal outward.
    play(1, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '3', result: 'Touchdown', yardLine: '3', fieldSide: 'own' }),
    play(2, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '4', result: 'Gain', yardLine: '14', fieldSide: 'own' }),
    play(3, { down: '2', distance: '6', runPass: 'Pass', playType: 'Short Pass', yardage: '5', result: 'Field Goal', yardLine: '30', fieldSide: 'own' }),
    play(4, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Outside', yardage: '6', result: 'Gain', yardLine: '50', fieldSide: 'own' }),
    play(5, { down: '3', distance: '4', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception + Touchdown', yardLine: '25', fieldSide: 'opp', players: { takeaway: '22' } }),
    play(6, { down: '2', distance: '9', runPass: 'Run', playType: 'Run Inside', yardage: '-2', result: 'Fumble + Touchdown', fumbleRecovery: 'subject', yardLine: '6', fieldSide: 'opp', players: { tackler: '31' } }),
    play(7, { down: '2', distance: '8', runPass: 'Run', playType: 'Run Inside', yardage: '-3', result: 'Safety', yardLine: '3', fieldSide: 'opp' }),
    play(8, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '1', result: 'Fumble + Touchdown', yardLine: '8', fieldSide: 'opp' }),
  ];
  const dashboard = app.stats.defenseDashboard(plays, { z: 'Zoners' });
  const board = app.stats.defenseBoard(plays, { scope: 'game', seasonPlays: plays, labels: { z: 'Zoners' } });
  let saved = null;
  const prior = window.ffaSaveBlob;
  window.ffaSaveBlob = blob => { saved = blob; };
  const screenScope = app.reportsScreen.defenseScope;
  app.reportsScreen.defenseScope = 'game';
  app.reportsScreen.exportDefense(dashboard, plays);
  app.reportsScreen.defenseScope = screenScope;
  window.ffaSaveBlob = prior;
  return {
    zones: dashboard.zones.map(row => [row.name, row.n]),
    boardZones: board.zones.map(row => [row.name, row.n]),
    outcomes: dashboard.driveOutcomes.filter(row => row.n).map(row => [row.name, row.n]),
    possessions: board.possessions.map(row => [row.outcome, row.points]),
    html: saved ? await saved.text() : '',
  };
});
const exportedRow = (html, label, value) =>
  new RegExp(`<td[^>]*>${label}</td>\\s*<td[^>]*>${value}</td>`).test(html);
ok(JSON.stringify(drives.zones) === JSON.stringify([['Backed Up', 3], ['Open Field', 2], ['Opp 40–20', 1], ['Red Zone', 1], ['Goal Line', 1]]),
  'defensive Field zone buckets each snap from our own goal line', JSON.stringify(drives.zones));
ok(JSON.stringify(drives.boardZones) === JSON.stringify(drives.zones),
  'the Revision 2 Field zone module shows the dashboard\'s defensive zones', JSON.stringify(drives.boardZones));
ok(['Backed Up:3', 'Open Field:2', 'Opp 40–20:1', 'Red Zone:1', 'Goal Line:1']
  .every(pair => exportedRow(drives.html, pair.split(':')[0], pair.split(':')[1])),
  'the Defense export prints those same defensive zones', drives.html.length ? 'export produced' : 'no export HTML');
ok(JSON.stringify(drives.possessions) === JSON.stringify([['Touchdown', 6], ['Field Goal', 3], ['Turnover', 0], ['Turnover', 0], ['Safety', 0], ['Unresolved', 0]]),
  'board possessions: their touchdown 6, their field goal 3, our pick-six and fumble return 0, our safety 0, an unattributable return unresolved',
  JSON.stringify(drives.possessions));
ok(JSON.stringify(drives.outcomes) === JSON.stringify([['Touchdown', 1], ['Field Goal', 1], ['Turnover', 2], ['Other / unresolved', 2]]),
  'the export drive outcomes agree: one opponent touchdown, one field goal, two turnovers, a safety and an unresolved return',
  JSON.stringify(drives.outcomes));
ok(exportedRow(drives.html, 'Touchdown', '1') && exportedRow(drives.html, 'Turnover', '2')
  && exportedRow(drives.html, 'Field Goal', '1') && !exportedRow(drives.html, 'Touchdown', '3'),
  'the printed report never counts our return touchdowns as opponent touchdowns');

/* ══ 12. A red-zone pick-six is a stop, not opponent production ═══════════ */
console.log('\n== 12. Scoring side in defensivePerformance ==');
const pickSix = await page.evaluate(() => {
  const app = window.app;
  const play = (id, tags) => ({ id, __gid: 'p', __seasonGameIdx: 0, timestamp: { start: id * 10, end: id * 10 + 6 },
    tags: { unit: 'defense', custom: [], players: {}, grades: {}, defFront: 'Bear', coverage: 'Cover 3', ...tags } });
  // One drive: a first-down run stopped short on our 12, then a pick-six from
  // our own 10 on third down. Nothing here is the opponent's production.
  const ours = [
    play(1, { down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '2', result: 'Gain', yardLine: '12', fieldSide: 'own' }),
    play(2, { down: '3', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '0', result: 'Interception + Touchdown', yardLine: '10', fieldSide: 'own', players: { takeaway: '22' } }),
  ];
  // The same two snaps, but the touchdown is the opponent's.
  const theirs = ours.map(row => row.id === 2
    ? play(2, { down: '3', distance: '8', runPass: 'Pass', playType: 'Short Pass', yardage: '10', result: 'Touchdown', yardLine: '10', fieldSide: 'own' })
    : row);
  const read = plays => {
    const perf = app.stats.defensivePerformance(plays, { p: 'Pick Six' });
    const redZone = perf.situations.find(row => row.name === 'Red Zone');
    return { redZoneTdRate: perf.redZoneTdRate, thirdDownStopRate: perf.thirdDownStopRate,
      touchdowns: redZone?.touchdowns, stops: redZone?.stops, stopRate: redZone?.stopRate,
      summaryTouchdowns: perf.summary.touchdowns,
      cohort: app.stats.defensiveCohortMetrics(plays),
      calls: app.stats._defenseCallRows(plays).map(row => [row.n, row.stops, row.tds]),
      selfScout: app.stats.selfScoutDefenseSummary({ defPlays: plays, defensive: {} }).negative,
    };
  };
  return { ours: read(ours), theirs: read(theirs) };
});
ok(pickSix.ours.touchdowns === 0 && pickSix.ours.redZoneTdRate === 0 && pickSix.ours.summaryTouchdowns === 0,
  'our red-zone pick-six is not a touchdown allowed and leaves the red-zone touchdown rate at 0%', JSON.stringify(pickSix.ours));
ok(pickSix.ours.stops === 2 && pickSix.ours.stopRate === 100 && pickSix.ours.thirdDownStopRate === 100,
  'the pick-six counts as a stop on third down and in its red-zone cohort', JSON.stringify(pickSix.ours));
ok(pickSix.ours.cohort.touchdowns === 0 && pickSix.ours.cohort.stopRate === 100
  && JSON.stringify(pickSix.ours.calls) === JSON.stringify([[2, 2, 0]])
  && pickSix.ours.selfScout.touchdownsAllowed === 0 && pickSix.ours.selfScout.successfulAllowed === 0,
  'every defensivePerformance consumer agrees: the shared cohort metric, the call row and Self-Scout',
  JSON.stringify({ cohort: pickSix.ours.cohort, calls: pickSix.ours.calls, selfScout: pickSix.ours.selfScout }));
ok(pickSix.theirs.touchdowns === 1 && pickSix.theirs.redZoneTdRate === 100 && pickSix.theirs.stopRate === 50
  && pickSix.theirs.thirdDownStopRate === 0 && pickSix.theirs.calls[0][2] === 1
  && pickSix.theirs.selfScout.touchdownsAllowed === 1,
  'an opponent red-zone touchdown on the same snap still reads as allowed production',
  JSON.stringify(pickSix.theirs));

/* === Cohort metadata (1.12.0-90 REVISE) ===
   The modules on this board legitimately measure different cohorts, and the
   installed smoke read that silence as broken arithmetic. Each one now names its
   own cohort in counts. Every count is COMPUTED from the rows it describes —
   asserted here against a synthetic season whose numbers are nothing like the
   canonical one's, so a hardcoded St. Peter value cannot pass. */
const cohortMeta = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const play = (id, tags) => ({ id, timestamp: { start: id * 10, end: id * 10 + 6 }, notes: '', annotations: [],
    tags: { unit: 'defense', quarter: 'Q1', down: '1', distance: '10', driveNumber: '1',
      fieldSide: 'opp', yardLine: '40', custom: [], players: {}, grades: {}, ...tags } });
  /* Six defensive snaps: four classified run/pass (two of them multi-tagged, so
     the play-type rows carry more tags than snaps), one with no direction, and
     one penalty snap with no run/pass at all. */
  const plays = [
    play(1, { runPass: 'Run', playType: 'Run Inside', playDir: 'Left', result: 'Gain', yardage: '4' }),
    play(2, { runPass: 'Run', playType: 'Run Outside + RPO', playDir: 'Right', result: 'Gain', yardage: '6' }),
    play(3, { runPass: 'Run', playType: 'Run Outside + RPO', playDir: 'Right', result: 'Loss', yardage: '-2' }),
    play(4, { runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete', yardage: '' }),
    play(5, { result: 'Penalty + Gain', yardage: '5' }),
    play(6, { result: 'Penalty + Loss', yardage: '-5' }),
  ];
  store.data.games = [{ id: 'g-meta', name: 'Week 1', nextId: 20,
    gameInfo: { opponent: 'Cohorts', date: '2026-09-01', week: '1', perspective: 'offense', scoreUs: 10, scoreThem: 0 },
    plays, annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1 }];
  store.data.activeGameId = 'g-meta';
  await app.storage._loadActiveGame({ renderGames: false });
  app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('defense');
  await new Promise(r => setTimeout(r, 300));
  document.querySelector('[data-defense-scope="game"]')?.click();
  await new Promise(r => setTimeout(r, 500));
  const text = n => (n?.textContent || '').replace(/\s+/g, ' ').trim();
  // Module cohort labels are read on every page they live on.
  const metaEntries = [], kpiEntries = [];
  let cohortText = '';
  for (const id of ['performance', 'opponent', 'scheme', 'situations']) {
    document.querySelector(`[data-reports-secbar] [data-section="${id}"]`)?.click();
    await new Promise(r => setTimeout(r, 150));
    metaEntries.push(...[...document.querySelectorAll('[data-def2-meta]')].map(n => [n.dataset.def2Meta, text(n)]));
    kpiEntries.push(...[...document.querySelectorAll('[data-def2-kpi]')].map(n => [n.dataset.def2Kpi, text(n.querySelector('strong'))]));
    cohortText ||= text(document.querySelector('[data-def2-cohort="performance"]'));
  }
  document.querySelector('[data-reports-secbar] [data-section="performance"]')?.click();
  const board = app.stats.defenseBoard(app.reportsScreen._defenseScopedPlays || plays.map(p => ({ ...p, __gid: 'g-meta' })),
    { labels: { 'g-meta': 'Cohorts' }, seasonPlays: plays.map(p => ({ ...p, __gid: 'g-meta' })), roster: {}, scope: 'game' });
  return {
    cohort: cohortText,
    metas: Object.fromEntries(metaEntries),
    kpis: Object.fromEntries(kpiEntries),
    // Independently derived from the board model, not from the rendered string.
    model: { measured: board.measured, total: board.total,
      directionSnaps: board.directions.reduce((s, r) => s + r.n, 0),
      playTypeTags: board.playTypes.reduce((s, r) => s + r.n, 0),
      playTypeSnaps: new Set(board.playTypes.flatMap(r => r.refs || [])).size,
      possessionSnaps: board.possessions.reduce((s, r) => s + (Number(r.plays) || 0), 0) },
  };
});
ok(cohortMeta.cohort === `${cohortMeta.model.measured} run/pass snaps` && cohortMeta.model.measured === 4,
  'Defensive performance names the classified cohort its KPIs measure',
  JSON.stringify([cohortMeta.cohort, cohortMeta.model]));
ok(cohortMeta.metas['Production by play type']
  === `${cohortMeta.model.playTypeSnaps} snaps · ${cohortMeta.model.playTypeTags} tags`
  && cohortMeta.model.playTypeTags > cohortMeta.model.playTypeSnaps,
  'Production by play type states unique snaps AND its overlapping tag count, so the overlap needs no sentence',
  JSON.stringify([cohortMeta.metas['Production by play type'], cohortMeta.model]));
ok(cohortMeta.metas['Performance by Play Direction']
  === `${cohortMeta.model.directionSnaps} direction-tagged snaps` && cohortMeta.model.directionSnaps === 3,
  'Performance by Play Direction names its narrower direction-tagged cohort',
  JSON.stringify([cohortMeta.metas['Performance by Play Direction'], cohortMeta.model]));
ok(cohortMeta.metas['Opponent possessions']
  === `${cohortMeta.model.possessionSnaps} snaps · penalties included`
  && cohortMeta.model.possessionSnaps === 6,
  'Opponent possessions names the full charted cohort and its penalty inclusion',
  JSON.stringify([cohortMeta.metas['Opponent possessions'], cohortMeta.model]));
ok(cohortMeta.kpis['Total yards allowed'] === '8' && cohortMeta.kpis['Rush yards allowed'] === '8'
  && cohortMeta.kpis['Pass yards allowed'] === '0' && cohortMeta.kpis['Yards / play'] === '2.0',
  'the metadata changed no total: the classified cohort still measures 4+6-2 over four snaps',
  JSON.stringify(cohortMeta.kpis));

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
