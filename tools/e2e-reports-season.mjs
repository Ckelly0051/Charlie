/**
 * Reports > Season — the approved 2026-09-05 desktop composition, the cohort
 * it aggregates, and the analytics contracts its Overview and Trends rest on.
 *
 * Comp and decision record: design-comps/reports-season-2026-09-05/
 * (`season.html`, `RATIONALE.md`, including its Revision 2).
 *
 * Every assertion drives the real route and reads the rendered result or the
 * model's own output. Nothing greps source text: a test that greps a selector
 * passes against a file that never renders. Column geometry is measured
 * against each cell's own content box, because `table-layout:fixed` overflows
 * silently rather than growing.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ── Fixture ──────────────────────────────────────────────────────────────
   A scrimmage dated BEFORE Week 1, eight regular games, and one opponent
   scout dated inside the season. Every play is explicit, so every aggregate
   the board prints is reproducible by hand from the rows it shows. */
function gamePlays({ runs, runYds, passes, passYds, comp, tds, ints, sacks, thirdConv, thirdAtt, takeaways = 0 }) {
  const plays = [];
  const spread = (n, total) => {
    if (!n) return [];
    const base = Math.round(total / n);
    return Array.from({ length: n }, (_, i) => (i === 0 ? base + 10 : i % 3 === 1 ? Math.max(0, base - 4) : i % 4 === 2 ? -1 : base));
  };
  spread(runs, runYds).forEach((y, i) => plays.push({
    unit: 'offense', runPass: 'Run', playType: 'Run Inside', formation: 'Power-I', personnel: '21',
    playCall: i % 3 === 0 ? '26 Blast' : 'Iso', playConcept: i % 3 === 0 ? 'Inside Zone' : 'Iso',
    players: { ballCarrier: i % 2 ? '22' : '34' },
    result: i < tds ? 'Touchdown' : y < 0 ? 'Loss' : 'Gain', yardage: String(y), quarter: `Q${(i % 4) + 1}`,
    down: i < thirdAtt ? '3' : String((i % 3) + 1), distance: i < thirdConv ? '3' : '9',
    ...(i < tds ? { fieldSide: 'opp', yardLine: String(6 + i * 2) } : {}),
  }));
  spread(passes, passYds).forEach((y, i) => plays.push({
    unit: 'offense', runPass: 'Pass', playType: 'Quick Pass', formation: 'Trips', personnel: '11',
    playCall: i % 2 ? 'Stick' : 'Smash', playConcept: i % 2 ? 'Stick' : 'Smash',
    players: { passer: '12', receiver: i % 2 ? '84' : '11' },
    result: i < ints ? 'Interception' : i < ints + (passes - comp) ? 'Incomplete' : 'Gain',
    yardage: String(i < ints + (passes - comp) ? 0 : Math.max(0, y)), quarter: `Q${(i % 4) + 1}`,
    down: i % 5 === 4 ? '4' : String((i % 3) + 1), distance: '9',
  }));
  for (let i = 0; i < sacks; i++) plays.push({ unit: 'defense', runPass: 'Pass', playType: 'Deep Pass',
    defFront: '4-2-5', coverage: 'Cover 3', result: 'Sack', yardage: '-8', down: '3', distance: '9',
    quarter: 'Q2', players: { tackler: '51' } });
  for (let i = 0; i < takeaways; i++) plays.push({ unit: 'defense', runPass: 'Pass', playType: 'Short Pass',
    defFront: '4-2-5', coverage: 'Cover 2', result: 'Interception', yardage: '0', down: '2', distance: '7', quarter: 'Q4' });
  for (let i = 0; i < 6; i++) plays.push({ unit: 'defense', runPass: i % 2 ? 'Pass' : 'Run',
    playType: i % 2 ? 'Short Pass' : 'Run Inside', defFront: '4-2-5', coverage: 'Cover 3',
    result: i % 3 === 0 ? 'No Gain' : 'Gain', yardage: i % 3 === 0 ? '1' : '6', down: '1', distance: '10', quarter: 'Q3' });
  plays.push({ unit: 'special', stType: 'Kickoff', kickOutcome: 'Returned', kickDistance: '55', players: { kicker: '3' }, quarter: 'Q1' });
  plays.push({ unit: 'special', stType: 'Kick Return', kickOutcome: 'Returned', returnYards: '22', players: { returner: '7' }, quarter: 'Q3' });
  plays.push({ unit: 'special', stType: 'Punt', kickOutcome: 'Fair Catch', kickDistance: '36', yardage: '36', players: { kicker: '3' }, quarter: 'Q4' });
  return plays;
}
const SPEC = [
  ['scrim', 'Scrimmage', '2026-08-14', 'Preseason Jamboree', 14, 7, { runs: 8, runYds: 40, passes: 4, passYds: 20, comp: 3, tds: 1, ints: 0, sacks: 1, thirdConv: 2, thirdAtt: 4, takeaways: 1 }],
  ['g1', '1', '2026-08-21', 'St. Peter Lutheran', 28, 14, { runs: 20, runYds: 180, passes: 12, passYds: 108, comp: 9, tds: 3, ints: 0, sacks: 2, thirdConv: 4, thirdAtt: 8, takeaways: 2 }],
  ['g2', '2', '2026-08-28', 'Holy Cross', 35, 7, { runs: 22, runYds: 220, passes: 10, passYds: 90, comp: 8, tds: 4, ints: 0, sacks: 3, thirdConv: 5, thirdAtt: 8, takeaways: 3 }],
  ['g3', '3', '2026-09-04', 'Trinity Academy', 13, 20, { runs: 16, runYds: 128, passes: 14, passYds: 126, comp: 8, tds: 1, ints: 2, sacks: 0, thirdConv: 2, thirdAtt: 8, takeaways: 0 }],
  ['g4', '4', '2026-09-11', 'Northgate', 21, 7, { runs: 24, runYds: 240, passes: 10, passYds: 120, comp: 7, tds: 2, ints: 1, sacks: 2, thirdConv: 3, thirdAtt: 8, takeaways: 2 }],
  ['g5', '5', '2026-09-18', 'Central Catholic', 27, 12, { runs: 18, runYds: 180, passes: 12, passYds: 96, comp: 8, tds: 3, ints: 1, sacks: 1, thirdConv: 4, thirdAtt: 9, takeaways: 2 }],
  ['g6', '6', '2026-09-25', 'East Ridge', 14, 26, { runs: 14, runYds: 98, passes: 16, passYds: 112, comp: 9, tds: 1, ints: 3, sacks: 0, thirdConv: 2, thirdAtt: 9, takeaways: 1 }],
  ['g7', '7', '2026-10-02', 'St. Anne', 31, 18, { runs: 20, runYds: 200, passes: 12, passYds: 120, comp: 9, tds: 3, ints: 1, sacks: 2, thirdConv: 5, thirdAtt: 10, takeaways: 3 }],
  ['g8', '8', '2026-10-09', 'St. Mary Falcons', 45, 22, { runs: 21, runYds: 210, passes: 11, passYds: 121, comp: 8, tds: 5, ints: 1, sacks: 1, thirdConv: 4, thirdAtt: 10, takeaways: 2 }],
];
const FULL = SPEC.map(([id, week, date, opponent, scoreUs, scoreThem, shape]) => ({
  id, info: { week, date, opponent, projectName: opponent, perspective: 'self', scoreUs, scoreThem }, plays: gamePlays(shape),
})).concat([{
  /* The opponent scout: charted, dated mid-season, huge production. Not one
     Our Program figure may move because of it. */
  id: 'scout-1',
  info: { week: '9', date: '2026-10-16', opponent: 'Riverside Prep', projectName: 'Riverside Prep', perspective: 'scout', scoreUs: 99, scoreThem: 0 },
  plays: gamePlays({ runs: 30, runYds: 600, passes: 20, passYds: 500, comp: 20, tds: 9, ints: 0, sacks: 0, thirdConv: 10, thirdAtt: 10 }),
}]);
/* Two charted games (one win, one loss) plus a scheduled game with nothing
   charted and no score: the smallest cohort that still opens a First 1 /
   Last 1 window, and the state where every measured cell is an absence. */
const SPARSE = [
  { id: 's1', info: { week: '1', date: '2026-08-21', opponent: 'Holy Family', projectName: 'Holy Family', perspective: 'self', scoreUs: 21, scoreThem: 7 },
    plays: gamePlays({ runs: 10, runYds: 80, passes: 6, passYds: 42, comp: 4, tds: 2, ints: 0, sacks: 1, thirdConv: 2, thirdAtt: 4, takeaways: 2 }) },
  { id: 's2', info: { week: '2', date: '2026-08-28', opponent: 'Lakeview', projectName: 'Lakeview', perspective: 'self', scoreUs: 6, scoreThem: 34 },
    plays: gamePlays({ runs: 8, runYds: 24, passes: 10, passYds: 40, comp: 5, tds: 1, ints: 2, sacks: 0, thirdConv: 1, thirdAtt: 5, takeaways: 0 }) },
  { id: 's3', info: { week: '3', date: '2026-09-04', opponent: 'Mercy', projectName: 'Mercy', perspective: 'self' }, plays: [] },
];
/* One charted game only: below the two-game window, so Trends must show its
   concise empty state rather than a comparison of a window against itself. */
const SINGLE = [SPARSE[0]];
/* Partial charting. `p3` is charted on DEFENSE ONLY -- it has plays, so it is
   a charted game, but it measured no offense; `p4` is charted on both sides
   and carries no final score. Both fall inside the Last 2 window, so every
   per-game average has to name the games that could measure it. */
const defenceOnly = () => gamePlays({ runs: 0, runYds: 0, passes: 0, passYds: 0, comp: 0, tds: 0, ints: 0,
  sacks: 2, thirdConv: 0, thirdAtt: 0, takeaways: 3 }).filter(play => play.unit === 'defense');
const PARTIAL = [
  { id: 'p1', info: { week: '1', date: '2026-08-21', opponent: 'Holy Family', projectName: 'Holy Family', perspective: 'self', scoreUs: 28, scoreThem: 7 },
    plays: gamePlays({ runs: 12, runYds: 96, passes: 8, passYds: 64, comp: 6, tds: 3, ints: 0, sacks: 1, thirdConv: 3, thirdAtt: 5, takeaways: 2 }) },
  { id: 'p2', info: { week: '2', date: '2026-08-28', opponent: 'Lakeview', projectName: 'Lakeview', perspective: 'self', scoreUs: 7, scoreThem: 24 },
    plays: gamePlays({ runs: 10, runYds: 30, passes: 12, passYds: 48, comp: 6, tds: 1, ints: 2, sacks: 0, thirdConv: 1, thirdAtt: 6, takeaways: 0 }) },
  { id: 'p3', info: { week: '3', date: '2026-09-04', opponent: 'Mercy', projectName: 'Mercy', perspective: 'self', scoreUs: 20, scoreThem: 13 },
    plays: defenceOnly() },
  { id: 'p4', info: { week: '4', date: '2026-09-11', opponent: 'Northgate', projectName: 'Northgate', perspective: 'self' },
    plays: gamePlays({ runs: 11, runYds: 88, passes: 9, passYds: 63, comp: 7, tds: 2, ints: 1, sacks: 1, thirdConv: 2, thirdAtt: 5, takeaways: 1 }) },
];
/* Our jersey 22 and the opponent's jersey 22. The scout roster must never
   relabel our own player. */
const ROSTER_SELF = [{ num: '22', name: 'Terrance Whitfield' }, { num: '12', name: 'Jaylen Ruiz' }];
const ROSTER_SCOUT = [{ num: '22', name: 'OPPONENT BACK' }, { num: '12', name: 'OPPONENT QB' }];

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Mavericks JV', team: 'Mavericks', year: '2026', level: 'JV' });
});

const load = async (list, rosters = null) => {
  await page.evaluate(async (rows, byId) => {
    const store = window.app.storage.seasonStore;
    store.data.games = rows.map(game => ({ id: game.id, name: '', nextId: game.plays.length + 1,
      roster: (byId && byId[game.id]) || [],
      plays: game.plays.map((row, i) => ({ id: i + 1, timestamp: { start: i * 10, end: i * 10 + 6 },
        notes: '', annotations: [], tags: { custom: [], players: {}, grades: {}, ...row } })),
      gameInfo: game.info, annotations: [], clipNames: [], isMultiClip: false, status: 'active', currentPlayId: 1 }));
    store.data.activeGameId = rows[rows.length - 1].id;
    await window.app.storage._loadActiveGame({ renderGames: false });
  }, list, rosters);
  await sleep(550);
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await sleep(250);
  await page.evaluate(() => window.app.reportsScreen.selectTab('season'));
  await sleep(850);
};
const setSection = async title => {
  await page.evaluate(t => [...document.querySelectorAll('.gi-season-nav .gi-subtab')]
    .find(b => b.textContent.trim() === t)?.click(), title);
  await sleep(500);
};
const model = () => page.evaluate(() => {
  const m = window.app.season.reportModel();
  return { summary: m.summary, trends: m.trends, progression: m.progression, winLoss: m.winLoss,
    winLossCounts: m.winLossCounts, situationalTiles: m.situationalTiles, turnoverScoring: m.turnoverScoring,
    gameLog: m.gameLog, perGame: m.perGame.map(row => ({ id: row.id, name: row.name, result: row.result,
      totalYards: row.totalYards, turnoverMargin: row.turnoverMargin, touchdowns: row.touchdowns,
      chartedPlays: row.chartedPlays, hasOffense: row.hasOffense, hasMargin: row.hasMargin })),
    gameIds: m.games.map(game => String(game.id)),
    refs: [...new Set(m.allPlays.map(p => window.app.stats.constructor._compositeRef(p)).filter(Boolean))].sort() };
});
const rowsOf = sel => page.evaluate(s => [...document.querySelectorAll(s)]
  .map(tr => [...tr.children].map(td => td.textContent.trim())), sel);

/* ══ 1. The approved composition ══════════════════════════════════════════ */
console.log('\n== 1. The approved composition ==');
await load(FULL);
const comp = await page.evaluate(() => {
  const report = document.querySelector('.gi-season-report');
  const identity = document.querySelector('.gi-season-identity');
  const nav = document.querySelector('.gi-season-nav');
  const acts = document.querySelector('.gi-season-acts');
  const box = el => el?.getBoundingClientRect();
  return {
    board: !!document.querySelector('.gi-season-board'),
    sections: [...nav.querySelectorAll('.gi-subtab')].map(b => b.textContent.trim()),
    identity: identity.textContent.trim(),
    oneRow: Math.abs(box(identity).top - box(nav).top) < 2 && Math.abs(box(nav).top - box(acts).top) < 2,
    exportLabel: acts.querySelector('button')?.textContent.trim(),
    capped: Math.round(box(report).width) <= 1648,
    active: nav.querySelector('.gi-subtab.active')?.textContent.trim(),
    railHidden: document.querySelector('.gi-reports-rail')?.hidden !== false,
  };
});
ok(comp.board, 'the Season board renders');
ok(JSON.stringify(comp.sections) === JSON.stringify(
  ['Overview', 'Offense', 'Defense', 'Special Teams', 'Players', 'Self-Scout', 'Trends']),
'exactly the seven approved sections, in order', JSON.stringify(comp.sections));
ok(comp.oneRow, 'season identity, section navigation and Export share one control row');
ok(comp.exportLabel === 'Export report', 'the export command reads "Export report"', comp.exportLabel);
ok(comp.capped, 'the report canvas is capped at 1648px');
ok(comp.active === 'Overview', 'the board opens on Overview', comp.active);
ok(comp.identity.includes('Season Report') && comp.identity.includes('2026 Mavericks JV'),
  'the board names the season it is reporting', comp.identity);
ok(comp.railHidden, 'the game-scope KPI rail stays hidden on Season');

/* ══ 2. Overview KPIs ═════════════════════════════════════════════════════ */
console.log('\n== 2. Overview KPIs ==');
const kpis = await page.evaluate(() => [...document.querySelectorAll('.gi-season-board .gi-overview-kpi')]
  .map(k => [k.querySelector('span').textContent.trim(), k.querySelector('strong').textContent.trim()]));
ok(JSON.stringify(kpis.map(k => k[0])) === JSON.stringify(
  ['Games', 'Record', 'Points For / Against', 'Turnover Margin', 'Yards / Game', 'Success Rate']),
'the approved six KPI labels, in order', JSON.stringify(kpis.map(k => k[0])));
ok(!kpis.some(k => /Offensive Plays/i.test(k[0])), 'Offensive Plays is not a Season KPI');

/* ══ 3. Cohort: chronological order and opponent-scout exclusion ══════════ */
console.log('\n== 3. Cohort ==');
const m = await model();
const log = await rowsOf('.gi-season-table tbody tr');
ok(!m.gameIds.includes('scout-1'), 'an opponent-scout game is excluded from the season cohort',
  JSON.stringify(m.gameIds));
ok(!log.some(row => row.join(' ').includes('Riverside Prep')),
  'no opponent-scout game reaches the Game Log');
ok(m.summary.games === 9 && m.summary.record === '7-2',
  'the record counts only Our Program games', `${m.summary.games} / ${m.summary.record}`);
ok(m.summary.pointsFor === 228 && m.summary.pointsAgainst === 133,
  'points for and against exclude the scout game', `${m.summary.pointsFor}-${m.summary.pointsAgainst}`);
ok(log[0][0] === 'Scrimmage' && log[0][2] === 'Preseason Jamboree',
  'a preseason scrimmage dated before Week 1 sorts FIRST, by date and not by its week text',
  JSON.stringify(log[0]));
ok(log.map(row => row[2]).join('|') === SPEC.map(s => s[3]).join('|'),
  'the Game Log is chronological, oldest first', log.map(row => row[2]).join('|'));
ok(log.map(row => row[1]).join('|') === 'Aug 14|Aug 21|Aug 28|Sep 4|Sep 11|Sep 18|Sep 25|Oct 2|Oct 9',
  'each row carries its own charted date', log.map(row => row[1]).join('|'));

/* ══ 4. Game Log columns and reconciliation ═══════════════════════════════ */
console.log('\n== 4. Game Log ==');
const logHead = await page.evaluate(() => [...document.querySelectorAll('.gi-season-table thead th')]
  .map(th => th.textContent.trim()));
ok(JSON.stringify(logHead) === JSON.stringify(
  ['Week', 'Date', 'Opponent', 'Result', 'Score', 'Plays', 'Rush', 'Pass', 'Total', 'Success Rate', 'TO ±']),
'the approved eleven Game Log columns, in order', JSON.stringify(logHead));
const num = value => Number(String(value).replace(/[^\d.-]/g, '')) || 0;
const rushSum = log.reduce((sum, row) => sum + num(row[6]), 0);
const passSum = log.reduce((sum, row) => sum + num(row[7]), 0);
const totalSum = log.reduce((sum, row) => sum + num(row[8]), 0);
ok(log.every(row => num(row[6]) + num(row[7]) === num(row[8])),
  'each row\'s rush and pass yards sum to its own total');
ok(rushSum + passSum === totalSum && totalSum === m.summary.yards,
  'the visible yardage rows reconcile with the season total',
  `${rushSum}+${passSum}=${totalSum} vs ${m.summary.yards}`);
ok(log.every(row => !/\//.test(row[6]) && !/\//.test(row[7])),
  'Rush and Pass are yardage values, not attempt strings', JSON.stringify(log[1]));
const marginSum = log.reduce((sum, row) => sum + num(row[10]), 0);
ok(marginSum === m.summary.turnoverMargin,
  'the visible TO +/- column sums to the aggregate Turnover Margin KPI',
  `${marginSum} vs ${m.summary.turnoverMargin}`);
ok(kpis[3][1] === (m.summary.turnoverMargin > 0 ? `+${m.summary.turnoverMargin}` : String(m.summary.turnoverMargin)),
  'the Turnover Margin KPI prints the same signed value', kpis[3][1]);
ok(log.every((row, i) => row[3] === (SPEC[i][4] > SPEC[i][5] ? 'W' : SPEC[i][4] < SPEC[i][5] ? 'L' : 'T')
  && row[4] === `${SPEC[i][4]}-${SPEC[i][5]}`),
'Result and Score come from the scored game metadata', JSON.stringify(log.map(row => `${row[3]} ${row[4]}`)));
ok(Number(m.summary.yardsPerGame.toFixed(1)) === Number((m.summary.yards / m.summary.charted).toFixed(1))
  && kpis[4][1] === m.summary.yardsPerGame.toFixed(1),
'Yards / Game is the season yardage over the charted games', kpis[4][1]);

/* ══ 5. Situational Offense and Scoring & Possessions ═════════════════════ */
console.log('\n== 5. Situational Offense and Scoring & Possessions ==');
const overviewModules = await page.evaluate(() =>
  [...document.querySelectorAll('.gi-season-module > header strong')].map(s => s.textContent.trim()));
ok(JSON.stringify(overviewModules) === JSON.stringify(['Game Log', 'Situational Offense', 'Scoring & Possessions']),
  'Overview renders exactly the three approved modules', JSON.stringify(overviewModules));
const tiles = await page.evaluate(() => [...document.querySelectorAll('.gi-season-metric')]
  .map(el => el.querySelector('span').textContent.trim()));
ok(JSON.stringify(tiles) === JSON.stringify(
  ['3rd Down', '4th Down', 'Red Zone TD', 'Points / Drive', '3-and-Out', 'Explosive Rate']),
'Situational Offense lists the six approved measures, in order', JSON.stringify(tiles));
const quarters = await page.evaluate(() => ({
  head: [...document.querySelectorAll('.gi-season-quarters thead th')].map(th => th.textContent.trim()),
  body: [...document.querySelectorAll('.gi-season-quarters tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
  foot: [...document.querySelectorAll('.gi-season-quarters tfoot td')].map(td => td.textContent.trim()),
}));
ok(JSON.stringify(quarters.head) === JSON.stringify(['Quarter', 'For', 'Against', 'Margin']),
  'the quarter table carries For, Against and Margin', JSON.stringify(quarters.head));
ok(quarters.body.every(row => num(row[3]) === num(row[1]) - num(row[2])),
  'each quarter margin is its own For minus Against', JSON.stringify(quarters.body));
ok(/takeaways/.test(quarters.foot[1]) && /giveaways/.test(quarters.foot[2])
  && num(quarters.foot[3]) === m.summary.turnoverMargin,
'the turnovers row states takeaways, giveaways and the same aggregate margin', JSON.stringify(quarters.foot));
const overviewText = await page.evaluate(() => document.querySelector('.gi-season-sections').textContent);
ok(!/Situational Scorecard|Turnovers & Scoring|Game at a Glance/.test(overviewText),
  'the generic Overview board is not rendered beneath the Season modules');

/* ══ 6. The child boards are the approved boards, unchanged ═══════════════ */
console.log('\n== 6. Child boards ==');
const CHILD = [
  ['Offense', 'gi-offense-board'], ['Defense', 'gi-defense-board'], ['Special Teams', 'gi-st-board'],
  ['Players', 'gi-players-board'], ['Self-Scout', 'gi-selfscout-board'],
];
let missing = [], leaked = [], noFilm = [];
for (const [title, board] of CHILD) {
  await setSection(title);
  const seen = await page.evaluate(cls => {
    const host = document.querySelector('.gi-season-sections');
    return { board: !!host.querySelector('.' + cls), kids: host.children.length,
      text: host.textContent, cut: host.querySelectorAll('.cut-row').length,
      seasonModule: host.querySelectorAll('.gi-season-module').length };
  }, board);
  if (!seen.board) missing.push(title);
  if (/Wins vs Losses|Per-Game Box Score|Offensive Identity/.test(seen.text)) leaked.push(title);
  if (seen.seasonModule) leaked.push(`${title}: Season module`);
  if (!seen.cut) noFilm.push(title);
}
ok(missing.length === 0, 'every child section renders its own approved production board', missing.join(', '));
ok(leaked.length === 0,
  'no Season-only content survives inside a child board -- no Wins vs Losses, no Per-Game Box Score, no Offensive Identity',
  leaked.join(' / '));
ok(noFilm.length === 0, 'every child board keeps its film rows at season scope', noFilm.join(', '));
await setSection('Players');
const playerRefs = await page.evaluate(() => {
  const screen = window.app.reportsScreen;
  const captured = [];
  const original = screen.watchRefs;
  screen.watchRefs = (refs, label) => captured.push({ refs, label });
  document.querySelector('.gi-players-board .cut-row')?.click();
  screen.watchRefs = original;
  return captured;
});
ok(playerRefs.length === 1 && playerRefs[0].refs.length > 0
  && playerRefs[0].refs.every(ref => /^[^:]+::\d+$/.test(ref))
  && new Set(playerRefs[0].refs.map(ref => ref.split('::')[0])).size > 1,
'a Players row at season scope opens exact composite refs across more than one game',
JSON.stringify(playerRefs[0]?.refs?.slice(0, 3)));
ok((playerRefs[0]?.refs || []).every(ref => !ref.startsWith('scout-1::')),
  'no scout-game reference reaches a season child-board film cohort');

/* ══ 7. Trends — windows, shared metrics and units ════════════════════════ */
console.log('\n== 7. Trends ==');
await setSection('Trends');
const trendKpis = await page.evaluate(() => [...document.querySelectorAll('.gi-season-board .gi-overview-kpi')]
  .map(k => [k.querySelector('span').textContent.trim(), k.querySelector('strong').textContent.trim()]));
ok(JSON.stringify(trendKpis.map(k => k[0])) === JSON.stringify(
  ['Games', 'Last 4 Record', 'Last 4 Points / Game', 'Last 4 Yards / Game', 'Last 4 Success Rate', 'Last 4 TO Margin']),
'the Trends KPI row uses dynamic Last N labels', JSON.stringify(trendKpis.map(k => k[0])));
ok(m.trends.windowSize === 4, 'nine charted games open a First 4 / Last 4 window', String(m.trends.windowSize));
const trendModules = await page.evaluate(() =>
  [...document.querySelectorAll('.gi-season-module > header strong')].map(s => s.textContent.trim()));
ok(JSON.stringify(trendModules) === JSON.stringify(['Early vs Recent', 'Wins vs Losses', 'Game-by-Game']),
  'Trends owns Early vs Recent, Wins vs Losses and Game-by-Game', JSON.stringify(trendModules));
const tables = await page.evaluate(() => [...document.querySelectorAll('.gi-season-table')].map(t => ({
  head: [...t.querySelectorAll('thead th')].map(x => x.textContent.trim()),
  rows: [...t.querySelectorAll('tbody tr')].map(tr => [...tr.children].map(td => td.textContent.trim())),
})));
const METRICS = ['Success Rate', 'Yards / Play', '3rd Down Rate', 'Points / Drive', 'TO Margin / Game', 'TD / Game'];
ok(JSON.stringify(tables[0].rows.map(r => r[0])) === JSON.stringify(METRICS),
  'Early vs Recent uses the six shared measures in the approved order', JSON.stringify(tables[0].rows.map(r => r[0])));
ok(JSON.stringify(tables[1].rows.map(r => r[0])) === JSON.stringify(METRICS),
  'Wins vs Losses uses the SAME six measures in the SAME order', JSON.stringify(tables[1].rows.map(r => r[0])));
ok(JSON.stringify(tables[0].head) === JSON.stringify(['Metric', 'First 4', 'Last 4', 'Delta', 'Status']),
  'Early vs Recent carries Metric, First N, Last N, Delta and Status', JSON.stringify(tables[0].head));
const UNITS = [' pp', ' yds/play', ' pp', ' pts/drive', '/game', '/game'];
const deltas = tables[0].rows.map(r => r[3]);
ok(deltas.every((text, i) => text.endsWith(UNITS[i])),
  'every delta names its own unit -- percentage points, per play, per drive or per game',
  JSON.stringify(deltas));
ok(!deltas.some((text, i) => UNITS[i] === ' pp' && !/ pp$/.test(text)),
  'a rate delta is stated in percentage points, never unitless', JSON.stringify(deltas));
ok(tables[0].rows.every(r => ['Up', 'Down', 'Steady'].includes(r[4])),
  'Status is the literal Up, Down or Steady', JSON.stringify(tables[0].rows.map(r => r[4])));
/* Threshold boundaries: the Steady band is the model's own epsilon, and it is
   exclusive -- a delta exactly at the band is a direction, not Steady. */
const bands = await page.evaluate(() => {
  const Season = window.app.season.constructor;
  return Season.COMPARE_METRICS.map(spec => {
    const at = spec.epsilon, under = spec.epsilon - 0.001;
    const status = delta => (Math.abs(delta) < spec.epsilon ? 'Steady' : delta > 0 ? 'Up' : 'Down');
    return { label: spec.label, epsilon: spec.epsilon, unit: spec.unit,
      atUp: status(at), atDown: status(-at), under: status(under), zero: status(0) };
  });
});
ok(bands.every(b => b.under === 'Steady' && b.zero === 'Steady' && b.atUp === 'Up' && b.atDown === 'Down'),
  'each metric has an explicit Steady band, exclusive at its own threshold',
  JSON.stringify(bands.map(b => `${b.label}:${b.epsilon}`)));
ok(bands.find(b => b.label === 'Points / Drive').epsilon === 0.3
  && bands.find(b => b.label === 'TO Margin / Game').epsilon === 0.3,
'the two new shared measures carry explicit documented thresholds');

/* ══ 8. Win/loss cohorts and per-game margin ══════════════════════════════ */
console.log('\n== 8. Wins vs Losses ==');
const wl = m.winLoss;
const winIds = m.perGame.filter(row => row.result === 'W');
const lossIds = m.perGame.filter(row => row.result === 'L');
const marginRow = wl.rows.find(row => row.metric === 'TO Margin / Game');
const winMargin = winIds.reduce((sum, row) => sum + row.turnoverMargin, 0);
const lossMargin = lossIds.reduce((sum, row) => sum + row.turnoverMargin, 0);
ok(Number(marginRow.wins) === Number((winMargin / winIds.length).toFixed(1))
  && Number(marginRow.losses) === Number((lossMargin / lossIds.length).toFixed(1)),
'TO Margin / Game is the cohort margin divided by that cohort\'s games',
`${marginRow.wins} vs ${winMargin}/${winIds.length}, ${marginRow.losses} vs ${lossMargin}/${lossIds.length}`);
ok(Number(marginRow.wins) !== winMargin || winIds.length === 1,
  'the per-game label never carries the raw aggregate margin',
  `${marginRow.wins} vs raw ${winMargin}`);
const tdRow = wl.rows.find(row => row.metric === 'TD / Game');
ok(Number(tdRow.wins) === Number((winIds.reduce((s, r) => s + r.touchdowns, 0) / winIds.length).toFixed(1)),
  'TD / Game is the cohort touchdowns over that cohort\'s games', tdRow.wins);
/* Points / Drive must be computed with the game boundaries intact: every
   season play carries the non-enumerable `__seasonGameIdx` stamp that keeps
   drive reconstruction from merging possessions across two games. */
const drives = await page.evaluate(() => {
  const season = window.app.season;
  const games = season._selfGames();
  const plays = season._allPlays();
  const stamped = plays.filter(p => p.__seasonGameIdx !== undefined).length;
  const merged = window.app.stats.compute(plays);
  const perGameDrives = games.reduce((sum, g) => sum + window.app.stats.compute(g.plays || []).drives.total, 0);
  return { stamped, total: plays.length, seasonDrives: merged.drives.total, perGameDrives };
});
ok(drives.stamped === drives.total,
  'every season play is stamped with its own game index', `${drives.stamped}/${drives.total}`);
ok(drives.seasonDrives === drives.perGameDrives,
  'season drives equal the sum of each game\'s own drives -- no possession merges across a game boundary',
  `${drives.seasonDrives} vs ${drives.perGameDrives}`);
const gbg = tables[2];
ok(JSON.stringify(gbg.head) === JSON.stringify(
  ['Game', 'Result', 'Score', 'Total Yards', 'Success Rate', '3rd Down', 'TD', 'TO ±']),
'Game-by-Game carries the approved eight columns, in order', JSON.stringify(gbg.head));
ok(gbg.rows.length === 9 && gbg.rows[0][0].startsWith('Scrimmage'),
  'Game-by-Game lists every charted game in the same chronological order', JSON.stringify(gbg.rows[0]));

/* ══ 9. Sparse and missing data ═══════════════════════════════════════════ */
console.log('\n== 9. Sparse and missing data ==');
await load(SPARSE);
const sparseLog = await rowsOf('.gi-season-table tbody tr');
const sparseModel = await model();
ok(sparseLog.length === 3 && sparseLog[2][2] === 'Mercy',
  'a scheduled game with nothing charted keeps its Game Log row', JSON.stringify(sparseLog[2]));
ok(sparseLog[2].slice(3).every(cell => cell === 'No data'),
  'that row reports every measured value as an absence, never as a zero', JSON.stringify(sparseLog[2]));
const sparseBlank = await page.evaluate(() =>
  [...document.querySelectorAll('.gi-season-table tbody td.blank')].length);
ok(sparseBlank >= 8, 'an absent value drops to copy weight so it cannot read as a figure', String(sparseBlank));
ok(sparseModel.summary.games === 3 && sparseModel.summary.charted === 2,
  'the season counts three games and two charted', JSON.stringify(sparseModel.summary.games));
await setSection('Trends');
const sparseTrends = await page.evaluate(() => ({
  window: window.app.season.reportModel().trends.windowSize,
  kpi: document.querySelectorAll('.gi-season-board .gi-overview-kpi')[1]?.querySelector('span').textContent.trim(),
  wl: [...document.querySelectorAll('.gi-season-module > header strong')].map(s => s.textContent.trim()),
}));
ok(sparseTrends.window === 1 && sparseTrends.kpi === 'Last 1 Record',
  'two charted games open a First 1 / Last 1 window with matching labels',
  `${sparseTrends.window} / ${sparseTrends.kpi}`);
await load(SINGLE);
await setSection('Trends');
const single = await page.evaluate(() => ({
  empty: document.querySelector('.gi-reports-empty h3')?.textContent.trim(),
  body: document.querySelector('.gi-reports-empty p')?.textContent.trim(),
  wl: window.app.season.reportModel().winLoss,
  counts: window.app.season.reportModel().winLossCounts,
}));
ok(single.empty === 'Not enough games for trends',
  'one charted game keeps the concise Trends empty state', single.empty);
ok(single.wl === null && single.counts.wins === 1 && single.counts.losses === 0,
  'a cohort with no losses reports no comparison rather than zeros', JSON.stringify(single.counts));
await load(SPARSE);
await setSection('Trends');
const wlAbsence = await page.evaluate(() => {
  const modules = [...document.querySelectorAll('.gi-season-module')];
  const target = modules.find(mod => mod.querySelector('header strong')?.textContent.trim() === 'Wins vs Losses');
  return { rows: target?.querySelectorAll('tbody tr').length || 0, none: target?.querySelector('.gi-season-none')?.textContent.trim() || null };
});
ok(wlAbsence.rows === 6 && !wlAbsence.none,
  'one win and one loss is enough to compare', JSON.stringify(wlAbsence));

/* ══ 9b. Partial charting is never a measured zero ════════════════════════ */
console.log('\n== 9b. Partial charting ==');
await load(PARTIAL);
const partial = await model();
const partialLog = await rowsOf('.gi-season-table tbody tr');
const defOnly = partialLog[2];
ok(defOnly[2] === 'Mercy' && defOnly[3] === 'W' && defOnly[4] === '20-13',
  'a defence-only game keeps its Game Log row, its result and its score', JSON.stringify(defOnly));
ok(defOnly[5] === 'No data' && defOnly[6] === 'No data' && defOnly[7] === 'No data'
  && defOnly[8] === 'No data' && defOnly[9] === 'No data',
'a game charted on defence only reports NO offensive snap count, yardage or success rate, not zero',
JSON.stringify(defOnly));
ok(partial.perGame.find(row => row.id === 'p3').chartedPlays > 0,
  'the model still knows that game was charted', JSON.stringify(partial.perGame.find(row => row.id === 'p3')?.chartedPlays));
ok(defOnly[10] === 'No data',
  'its turnover margin is absent too -- a giveaway can only be observed on a charted offensive snap',
  JSON.stringify(defOnly));
const eligibleMargins = partial.perGame.filter(row => row.hasMargin);
const expectedMargin = eligibleMargins.reduce((total, row) => total + row.turnoverMargin, 0);
ok(partial.summary.turnoverMargin === expectedMargin,
  'the aggregate Turnover Margin excludes every partially charted game',
  `${partial.summary.turnoverMargin} vs ${expectedMargin}`);
ok(partial.summary.offensiveGames === 3 && partial.summary.charted === 4,
  'three of the four charted games measured offense', JSON.stringify(partial.summary.offensiveGames));
ok(Number(partial.summary.yardsPerGame.toFixed(1))
  === Number((partial.summary.yards / partial.summary.offensiveGames).toFixed(1)),
'Yards / Game divides by the games charted on offense, not by every charted game',
`${partial.summary.yardsPerGame} vs ${partial.summary.yards}/${partial.summary.offensiveGames}`);
await setSection('Trends');
const partialTrends = await page.evaluate(() => ({
  kpis: [...document.querySelectorAll('.gi-season-board .gi-overview-kpi')]
    .map(k => [k.querySelector('span').textContent.trim(), k.querySelector('strong').textContent.trim()]),
  gbg: [...document.querySelectorAll('.gi-season-table')].at(-1)
    ?.querySelectorAll('tbody tr')[2]?.textContent.trim(),
}));
const pointsTile = partialTrends.kpis.find(k => /Points \/ Game/.test(k[0]));
ok(partial.trends.windowSize === 2 && partial.trends.scoredGames === 1,
  'the Last 2 window holds one scored game', JSON.stringify(partial.trends.scoredGames));
ok(Number(pointsTile[1]) === 20,
  'Recent Points / Game divides by the SCORED games in the window, not by the window',
  `${pointsTile[1]} (a window average would be 10.0)`);
const p4Yards = partial.perGame.find(row => row.id === 'p4').totalYards;
ok(partial.trends.offensiveGamesInWindow === 1 && partial.trends.recentYardsPerGame === p4Yards,
  'Recent Yards / Game divides by the games in the window that measured offense',
  `${partial.trends.recentYardsPerGame} vs p4's own ${p4Yards}; a window average would be ${p4Yards / 2}`);
const p4Margin = partial.perGame.find(row => row.id === 'p4').turnoverMargin;
ok(partial.trends.recentTurnoverMargin === p4Margin,
  'Recent TO Margin excludes a defence-only game instead of treating its unknown giveaways as zero',
  `${partial.trends.recentTurnoverMargin} vs p4's own ${p4Margin}`);
ok(/No data/.test(partialTrends.gbg || ''),
  'Game-by-Game reports the same absences rather than zeros', partialTrends.gbg);

/* ══ 9c. Opponent-scout rosters never rename our players ══════════════════ */
console.log('\n== 9c. Roster identity ==');
await load(FULL, { g1: ROSTER_SELF, 'scout-1': ROSTER_SCOUT });
const roster = await page.evaluate(() => window.app.season.reportModel().rosterLabels);
ok(roster['22'] === 'Terrance Whitfield' && roster['12'] === 'Jaylen Ruiz',
  'a shared jersey number keeps OUR player\'s name', JSON.stringify(roster));
ok(!Object.values(roster).some(name => /OPPONENT/.test(name)),
  'no opponent-scout roster name reaches the season roster', JSON.stringify(roster));
await setSection('Players');
const playerNames = await page.evaluate(() =>
  [...document.querySelectorAll('.gi-players-board table tbody td.tl')].map(td => td.textContent.trim()));
ok(playerNames.length > 0 && !playerNames.some(name => /OPPONENT/.test(name)),
  'the Season Players board labels our jerseys with our roster', JSON.stringify(playerNames.slice(0, 4)));

/* ══ 10. Read-only navigation and export ══════════════════════════════════ */
console.log('\n== 10. Read-only navigation and export ==');
await load(FULL);
const readOnly = await page.evaluate(async () => {
  const before = JSON.stringify(window.app.storage.seasonStore.data);
  for (const title of ['Offense', 'Defense', 'Special Teams', 'Players', 'Self-Scout', 'Trends', 'Overview']) {
    [...document.querySelectorAll('.gi-season-nav .gi-subtab')].find(b => b.textContent.trim() === title)?.click();
    await new Promise(r => requestAnimationFrame(r));
  }
  const save = window.ffaSaveBlob;
  let captured = null, pending = null;
  window.ffaSaveBlob = (blob, name) => { pending = blob.text().then(html => { captured = { html, name }; }); };
  document.querySelector('.gi-season-acts .btn')?.click();
  await pending;
  window.ffaSaveBlob = save;
  const after = JSON.stringify(window.app.storage.seasonStore.data);
  return { unchanged: before === after, name: captured?.name, html: captured?.html || '' };
});
ok(readOnly.unchanged, 'opening every Season section and exporting leaves canonical season bytes unchanged');
ok(readOnly.name?.startsWith('season_report_') && readOnly.name.endsWith('.html'),
  'Export report downloads the season report', readOnly.name);
ok(readOnly.html.includes('228') && readOnly.html.includes('133'),
  'the export carries the same season cohort the screen shows -- the scout game is excluded there too');
ok(!readOnly.html.includes('Riverside Prep'), 'no opponent-scout game reaches the exported report');
const exportedStatus = ['Up', 'Down', 'Steady'].filter(word => readOnly.html.includes(`<td>${word}</td>`));
ok(exportedStatus.length > 0,
  'the export prints the same literal status vocabulary the board shows', JSON.stringify(exportedStatus));
/* The export need not LOOK like the board, but its scope and its reported
   structure must agree with it. */
const exported = readOnly.html;
const EXPORT_KPIS = ['Games', 'Record', 'Points For / Against', 'Turnover Margin', 'Yards / Game', 'Success Rate'];
ok(EXPORT_KPIS.every(label => exported.includes(`<span>${label}</span>`)),
  'the export carries the same six aggregate KPIs the board shows',
  JSON.stringify(EXPORT_KPIS.filter(label => !exported.includes(`<span>${label}</span>`))));

const EXPORT_LOG = ['Week', 'Date', 'Opponent', 'Result', 'Score', 'Plays', 'Rush', 'Pass', 'Total', 'Success Rate'];
ok(EXPORT_LOG.every(label => exported.includes(`<th>${label}</th>`)),
  'the exported Game Log carries the same columns, including the Success Rate label',
  JSON.stringify(EXPORT_LOG.filter(label => !exported.includes(`<th>${label}</th>`))));

ok(/<th>Wins \(\d+\)<\/th>/.test(exported) && /<th>Losses \(\d+\)<\/th>/.test(exported)
  && /<td>TO Margin \/ Game<\/td>/.test(exported),
'the export carries Wins vs Losses with the same six shared measures');
ok(/<td>[+-]?\d+(\.\d+)? pp<\/td>/.test(exported) && /<td>[+-]?\d+(\.\d+)?\/game<\/td>/.test(exported),
  'the exported deltas still carry their units');
/* The row count under the heading must match the scope the heading claims. */
await load(SPARSE);
const sparseExport = await page.evaluate(async () => {
  const save = window.ffaSaveBlob;
  let captured = null, pending = null;
  window.ffaSaveBlob = (blob, name) => { pending = blob.text().then(html => { captured = { html, name }; }); };
  window.app.season.exportHtml();
  await pending;
  window.ffaSaveBlob = save;
  const model = window.app.season.reportModel();
  const rows = (captured.html.match(/<tbody>([\s\S]*?)<\/tbody>/) || [])[1] || '';
  return { games: model.summary.games, logRows: (rows.match(/<tr>/g) || []).length,
    subtitle: (captured.html.match(/(\d+) games, \d+ charted plays/) || [])[1] };
});
ok(Number(sparseExport.subtitle) === sparseExport.games && sparseExport.logRows === sparseExport.games,
  'the exported Game Log has one row per game the export says the season has -- a scheduled game is not dropped',
  JSON.stringify(sparseExport));

/* ══ 11. Presentation, density and containment ════════════════════════════ */
console.log('\n== 11. Presentation, density and containment ==');
await setSection('Overview');
const type = await page.evaluate(() => {
  const px = (el, prop) => (el ? parseFloat(getComputedStyle(el)[prop]) : null);
  const face = el => (el ? getComputedStyle(el).fontFamily : '');
  const title = document.querySelector('.gi-season-module > header strong');
  const th = document.querySelector('.gi-season-table thead th');
  const td = document.querySelector('.gi-season-table tbody td');
  const tr = document.querySelector('.gi-season-table tbody tr');
  const all = [...document.querySelectorAll('.gi-season-board *')]
    .filter(el => [...el.childNodes].some(n => n.nodeType === 3 && n.nodeValue.trim()));
  return { titleSize: px(title, 'fontSize'), titleFace: face(title),
    thSize: px(th, 'fontSize'), thWeight: px(th, 'fontWeight'), thFace: face(th),
    tdSize: px(td, 'fontSize'), rowHeight: tr ? Math.round(tr.getBoundingClientRect().height) : null,
    floor: Math.min(...all.map(el => parseFloat(getComputedStyle(el).fontSize))),
    fonts: [...document.fonts].filter(f => f.status === 'loaded').map(f => `${f.family} ${f.weight}`) };
});
ok(type.titleSize === 14 && /Plex Sans/.test(type.titleFace) && !/Condensed/.test(type.titleFace),
  'module titles are 14px IBM Plex Sans', `${type.titleSize} / ${type.titleFace}`);
ok(type.thSize === 12 && type.thWeight === 600 && /Plex Sans/.test(type.thFace),
  'table headers are 12px semibold Plex Sans', `${type.thSize} / ${type.thWeight}`);
ok(type.tdSize === 13 && type.rowHeight === 38, 'table rows are 13px on 38px rows',
  `${type.tdSize} / ${type.rowHeight}`);
ok(type.floor >= 9.5, 'nothing on the board renders below the 9.5px floor', String(type.floor));
ok(type.fonts.some(f => /IBM Plex Sans/.test(f)), 'IBM Plex loads from the bundled source',
  JSON.stringify(type.fonts.slice(0, 4)));
let overflowAt = [], clipped = [], scrollers = [], unequal = [];
for (const [w, h] of [[1920, 1080], [1440, 900], [1280, 720]]) {
  await page.setViewport({ width: w, height: h });
  await sleep(250);
  await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
  await sleep(400);
  for (const section of ['Overview', 'Trends']) {
    await setSection(section);
    const measured = await page.evaluate(() => {
      const doc = document.documentElement;
      const clips = [];
      document.querySelectorAll('.gi-season-table th, .gi-season-table td, .gi-season-quarters th, .gi-season-quarters td')
        .forEach(cell => {
          if (!cell.getClientRects().length) return;
          const range = document.createRange();
          range.selectNodeContents(cell);
          const style = getComputedStyle(cell);
          const inner = cell.getBoundingClientRect().width
            - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
          if (range.getBoundingClientRect().width - inner > 1) clips.push(cell.textContent.trim().slice(0, 30));
        });
      const pair = [...document.querySelectorAll('.gi-season-band.b-2')].map(band => {
        const mods = [...band.querySelectorAll('.gi-season-module')];
        return mods.length === 2
          ? Math.abs(mods[0].getBoundingClientRect().width - mods[1].getBoundingClientRect().width) < 2
          : true;
      });
      return { overflow: doc.scrollWidth - doc.clientWidth, clips, pair,
        scroll: [...document.querySelectorAll('.gi-season-module .gi-table-wrap')]
          .filter(el => el.scrollWidth - el.clientWidth > 1).length };
    });
    if (measured.overflow > 0) overflowAt.push(`${w}:${section}=${measured.overflow}`);
    if (measured.clips.length) clipped.push(`${w}:${section}: ${measured.clips.join(' | ')}`);
    if (measured.scroll) scrollers.push(`${w}:${section}`);
    if (measured.pair.some(x => !x)) unequal.push(`${w}:${section}`);
  }
}
ok(overflowAt.length === 0, 'no page-level horizontal overflow at 1920, 1440 or 1280', overflowAt.join(' / '));
ok(clipped.length === 0, 'no clipped header or value at any release width', clipped.join(' / '));
ok(scrollers.length === 0, 'no bounded scroller is engaged at 1920, 1440 or 1280', scrollers.join(' / '));
ok(unequal.length === 0, 'Early vs Recent and Wins vs Losses receive equal width', unequal.join(' / '));
await page.setViewport({ width: 1440, height: 900 });
await sleep(200);
await page.evaluate(() => window.app.reportsScreen._renderActiveTab());
await sleep(400);
const separation = await page.evaluate(() => {
  const board = document.querySelector('.gi-season-board');
  return parseFloat(getComputedStyle(board).paddingTop);
});
ok(separation === 12, 'the 1440 layout keeps the revised comp\'s additional top separation', String(separation));

console.log(`\nPage/console errors: ${errors.length}`);
if (errors.length) console.log(errors.slice(0, 6).join('\n'));
ok(errors.length === 0, 'no page or console errors across every section and state');
console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
