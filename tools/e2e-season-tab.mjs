/* E2E harness — the Season tab in the stats dashboard (added v1.9.4, polished
   v1.9.5). Covers the paths no other harness opens:
     1. Sortable leaderboards (v1.9.5): clicking an individual-stat column header
        re-orders the rows by that column; re-click flips direction; the Player
        column sorts as text. Verified deterministically on the per-game Offense
        tab so only the injected plays are in scope.
     2. The Season tab lazy-renders and aggregates every game: KPI header,
        game-by-game trend line charts, and the season player roll-up leaderboard.
     3. Header hero (v1.9.5): the Season header (.season-summary) actually wears
        the .gi-hero card treatment (display font + card surface), not the legacy
        flat style.
     4. Season leaderboards are wired sortable too (gi-sort-th on the pane).
     5. No console / page errors across the whole flow.

   Run after build:  bash build.sh && node tools/e2e-season-tab.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== Setup: team + demo + open a game (full app init) ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);

// In-page play builder (mirrors e2e-self-scout).
await page.evaluate(() => {
  let idc = 2000;
  window.__mk = (over) => ({
    id: idc++, timestamp: { start: 0, end: 5 }, notes: '',
    tags: Object.assign({
      down: '', distance: '', quarter: '', fieldSide: 'own', yardLine: '',
      formation: '', personnel: '', motion: '', runPass: '', playType: '',
      result: '', yardage: '', hash: '', playDir: '', defFront: '', coverage: '',
      blitz: '', unit: 'offense', stType: '', players: {}, grades: {}, custom: []
    }, over)
  });
});

console.log('\n== 1. Sortable leaderboards: header click re-orders rows (per-game Offense tab) ==');
let r = await page.evaluate(() => {
  const mk = window.__mk;
  // Three rushers with DISTINCT, deliberately out-of-order yardage so a sort is
  // unambiguous: #10=30yds, #20=10yds, #30=20yds (each one carry).
  const plays = [
    mk({ unit: 'offense', down: '1', distance: '10', formation: 'I-Form', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '30', players: { ballCarrier: '10' } }),
    mk({ unit: 'offense', down: '1', distance: '10', formation: 'I-Form', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '10', players: { ballCarrier: '20' } }),
    mk({ unit: 'offense', down: '1', distance: '10', formation: 'I-Form', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '20', players: { ballCarrier: '30' } }),
  ];
  window.app.tagger.plays = plays;
  window.app.stats.filter.active = false;
  window.app.stats.showDashboard();
  document.querySelector('#statsDashboard .stats-tab[data-tab="offense"]').click();
  const pane = document.querySelector('#statsDashboard [data-pane="offense"]');
  const table = Array.from(pane.querySelectorAll('table.stats-table-full')).find(t => t.querySelector('tr.player-row'));
  if (!table) return { noTable: true };
  const heads = Array.from(table.querySelectorAll('thead th'));
  const ydsIdx = heads.findIndex(h => h.textContent.trim() === 'Yds');
  const colVals = () => Array.from(table.querySelectorAll('tbody tr.player-row')).map(tr => parseInt(tr.children[ydsIdx].textContent));
  const before = colVals();
  const ydsHead = heads[ydsIdx];
  ydsHead.click();                  // ascending
  const asc = colVals();
  const ascClass = ydsHead.classList.contains('gi-sort-asc');
  ydsHead.click();                  // descending
  const desc = colVals();
  const descClass = ydsHead.classList.contains('gi-sort-desc');
  // Player column (index 0) sorts as text.
  const playerHead = heads[0];
  playerHead.click();
  const playerOrder = Array.from(table.querySelectorAll('tbody tr.player-row td:first-child')).map(td => td.textContent.trim());
  return {
    headerWired: heads[ydsIdx].classList.contains('gi-sort-th'),
    before, asc, desc, ascClass, descClass, playerOrder, ydsIdx,
  };
});
ok(!r.noTable, 'a rushing leaderboard with player rows rendered', JSON.stringify(r));
ok(r.headerWired, 'leaderboard headers carry the gi-sort-th class', JSON.stringify(r));
ok(JSON.stringify(r.asc) === JSON.stringify([10, 20, 30]), 'clicking Yds sorts ascending', JSON.stringify(r));
ok(r.ascClass, 'ascending click marks the header gi-sort-asc', JSON.stringify(r));
ok(JSON.stringify(r.desc) === JSON.stringify([30, 20, 10]), 're-clicking Yds flips to descending', JSON.stringify(r));
ok(r.descClass, 'descending click marks the header gi-sort-desc', JSON.stringify(r));
ok(JSON.stringify(r.playerOrder) === JSON.stringify(['#10', '#20', '#30']), 'Player column sorts as text', JSON.stringify(r));

console.log('\n== 2. Season tab lazy-renders: header KPIs + trend charts + roll-up ==');
r = await page.evaluate(() => {
  // Keep the injected plays as the active game; the demo contributes a 2nd game,
  // so the season aggregates 2 games (enough for trend lines).
  window.app.stats.showDashboard();
  const tab = document.querySelector('#statsDashboard .stats-tab[data-tab="season"]');
  if (!tab) return { noTab: true };
  tab.click();   // lazy render is synchronous inside the click handler
  const pane = document.querySelector('#statsDashboard [data-pane="season"]');
  const ssNum = pane.querySelector('.season-summary .ss-num');
  const leaderboard = Array.from(pane.querySelectorAll('table.stats-table-full')).find(t => t.querySelector('tr.player-row'));
  return {
    seasonLoaded: pane.dataset.seasonLoaded,
    kpiCount: pane.querySelectorAll('.season-summary .ss-stat').length,
    hasKpi: !!ssNum,
    trendCount: pane.querySelectorAll('.gi-trend').length,
    hasLeaderboard: !!leaderboard,
    leaderboardSortable: leaderboard ? leaderboard.querySelectorAll('th.gi-sort-th').length : 0,
  };
});
ok(!r.noTab, 'the Season tab button exists in the dashboard', JSON.stringify(r));
ok(r.seasonLoaded === '1', 'Season pane lazy-rendered on first open', JSON.stringify(r));
ok(r.hasKpi && r.kpiCount >= 4, 'season header shows KPI cards (games/plays/yards/success…)', JSON.stringify(r));
ok(r.trendCount >= 1, 'game-by-game trend line charts render (>=2 games)', JSON.stringify(r));
ok(r.hasLeaderboard, 'season player roll-up leaderboard renders', JSON.stringify(r));
ok(r.leaderboardSortable >= 1, 'season leaderboard headers are wired sortable too', JSON.stringify(r));

console.log('\n== 3. Header hero (v1.9.5): .season-summary wears the .gi-hero card look ==');
r = await page.evaluate(() => {
  const pane = document.querySelector('#statsDashboard [data-pane="season"]');
  const stat = pane.querySelector('.season-summary .ss-stat');
  const num = pane.querySelector('.season-summary .ss-num');
  const cs = stat ? getComputedStyle(stat) : null;
  const csNum = num ? getComputedStyle(num) : null;
  return {
    radius: cs?.borderTopLeftRadius,
    bg: cs?.backgroundColor,
    numFont: csNum?.fontFamily || '',
  };
});
ok(r.radius === '10px', 'KPI cards use the 10px hero radius (header CSS applied)', JSON.stringify(r));
ok(r.bg === 'rgb(22, 27, 34)', 'KPI cards use the --gi-card surface', JSON.stringify(r));
ok(/Barlow Condensed/i.test(r.numFont), 'KPI numbers use the broadcast display font', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
