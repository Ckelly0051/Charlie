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
import puppeteer from 'puppeteer';

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
    play(9, { ...struct, down: '1', distance: '10', runPass: 'Run', playType: 'Run Inside', yardage: '1', result: 'Touchdown', scoreFor: 'us', personnel: '12' }),
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
const board = () => page.evaluate(() => {
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
  && JSON.stringify(seen.pressed) === JSON.stringify(['season:false', 'game:true']),
  'Current game scope omits Game-by-game, compares with the season, and presses its own button', JSON.stringify(seen.pressed));
await clickScope('season');
seen = await board();
ok(moduleOf(seen, 'Game-by-game')?.rows.map(row => row[0]).join('|') === 'Wildcats|Knights'
  && moduleOf(seen, 'Season vs Last 3') && JSON.stringify(seen.pressed) === JSON.stringify(['season:true', 'game:false']),
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
  const defense = scoped.filter(p => p.tags.unit === 'defense' && app.stats.constructor._tryPenaltyResolved(p));
  return [...new Set(app.stats._driveStats(defense, { all: scoped }).list.map(drive => drive.outcome))];
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
const heldText = await page.evaluate(() => [...document.querySelectorAll('[data-def2-module="Personnel faced"] tr.is-held td')].map(td => td.textContent));
ok(heldText.length === 5 && heldText.every(value => value === '-'), 'a held row is a formatted dash in every column', JSON.stringify(heldText));

await clickScope('season');
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

/* ══ 8. Jump links ═══════════════════════════════════════════════════════ */
console.log('\n== 8. Jump links ==');
await clickScope('season');
const jumps = await page.evaluate(async () => {
  const scroller = document.querySelector('.ws-reports');
  const bar = document.querySelector('.gi-def2-controls');
  const out = [];
  for (const link of document.querySelectorAll('[data-def2-jump]')) {
    scroller.scrollTo(0, 0);
    link.click();
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const heading = document.getElementById(`def2-${link.dataset.def2Jump}`);
    out.push({ id: link.dataset.def2Jump, heading: Math.round(heading.getBoundingClientRect().top),
      bar: Math.round(bar.getBoundingClientRect().bottom), scrolled: scroller.scrollTop, hash: location.hash });
  }
  return out;
});
ok(jumps.length === 4 && jumps.every(jump => jump.heading >= jump.bar - 1 && jump.heading <= jump.bar + 12)
  && jumps.slice(1).every(jump => jump.scrolled > 0) && jumps.every(jump => !jump.hash.includes('def2')),
  'each jump link scrolls its section heading to just below the pinned bar without rewriting the route hash', JSON.stringify(jumps));

/* ══ 9. Literal labels ═══════════════════════════════════════════════════ */
seen = await board();
ok(!/\bTD\b|ADDED/.test(seen.text) && /Touchdowns Allowed/.test(seen.text) && /Explosive Plays Allowed/.test(seen.text)
  && /with Run\/Pass charted/.test(seen.text) && /1st Downs Allowed/.test(seen.text) && /Allowed %/.test(seen.text)
  && /Red-zone Touchdown Rate/.test(seen.text),
  'the board uses its literal labels and no ambiguous TD abbreviation or proposal marker');

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
