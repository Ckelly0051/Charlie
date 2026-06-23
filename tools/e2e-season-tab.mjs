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
     5. Sub-tabs (v1.9.6): the 13 season sections group into Overview / Breakdown
        / Players / Self-Scout; the KPI header stays above the nav; clicking a
        sub-tab swaps the visible pane; leaderboards/heat maps land in the right
        panes.
     6. Chronological order (v1.9.7): gamesChrono keeps an undated Game 1 in its
        real slot instead of shoving it to the end — the "trends are backwards"
        fix — while fully-dated games still sort by date.
     7. No console / page errors across the whole flow.

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

console.log('\n== 4. Sub-tabs organize the 13 sections (Overview/Breakdown/Players/Self-Scout) ==');
r = await page.evaluate(() => {
  const pane = document.querySelector('#statsDashboard [data-pane="season"]');
  const subtabs = Array.from(pane.querySelectorAll('.gi-subnav .gi-subtab')).map(t => t.dataset.subtab);
  const disp = (key) => {
    const p = pane.querySelector(`.gi-subpane[data-subpane="${key}"]`);
    return p ? getComputedStyle(p).display : 'missing';
  };
  const overviewBefore = disp('overview'), playersBefore = disp('players');
  // The header KPI bar sits ABOVE the sub-nav (always visible, not inside a pane).
  const headerOutsidePanes = !!pane.querySelector('.season-summary') &&
    !pane.querySelector('.gi-subpane .season-summary');
  // Switch to the Players sub-tab.
  pane.querySelector('.gi-subtab[data-subtab="players"]').click();
  const overviewAfter = disp('overview'), playersAfter = disp('players');
  const playersPane = pane.querySelector('.gi-subpane[data-subpane="players"]');
  const leaderboardUnderPlayers = !!playersPane?.querySelector('table.stats-table-full tr.player-row');
  // Heat maps (SVG) live under Breakdown and still carry their inner tabs.
  const heatUnderBreakdown = !!pane.querySelector('.gi-subpane[data-subpane="breakdown"] .heatmap-tabs');
  return { subtabs, overviewBefore, playersBefore, overviewAfter, playersAfter,
    headerOutsidePanes, leaderboardUnderPlayers, heatUnderBreakdown };
});
ok(JSON.stringify(r.subtabs) === JSON.stringify(['overview', 'breakdown', 'players', 'scout']), 'four season sub-tabs render in order', JSON.stringify(r));
ok(r.headerOutsidePanes, 'KPI header stays above the sub-nav (always visible)', JSON.stringify(r));
ok(r.overviewBefore === 'block' && r.playersBefore === 'none', 'Overview is the default sub-pane', JSON.stringify(r));
ok(r.overviewAfter === 'none' && r.playersAfter === 'block', 'clicking a sub-tab swaps the visible pane', JSON.stringify(r));
ok(r.leaderboardUnderPlayers, 'player leaderboard lives under the Players sub-tab', JSON.stringify(r));
ok(r.heatUnderBreakdown, 'heat maps live under the Breakdown sub-tab', JSON.stringify(r));

console.log('\n== 5. gamesChrono: undated games keep their slot (trends/progression order) ==');
r = await page.evaluate(() => {
  const SeasonStore = window.app.storage.seasonStore.constructor;
  const order = (defs) => {
    const s = Object.create(SeasonStore.prototype);
    s.data = { games: defs.map(d => ({ id: d.n, name: d.n, gameInfo: { date: d.d || '' }, plays: [] })) };
    return s.gamesChrono().map(g => g.name);
  };
  return {
    // The real St. Joseph case: Week 1 undated, later weeks dated — must NOT be
    // shoved to the end (the "trends are backwards" bug).
    leadingUndated: order([{ n: 'Patriots', d: '' }, { n: 'Irish', d: '2025-08-06' }, { n: 'Ravens', d: '2025-09-13' }]),
    outOfOrderDated: order([{ n: 'Sep', d: '2025-09-13' }, { n: 'Aug', d: '2025-08-06' }, { n: 'Jul', d: '2025-07-01' }]),
    allUndated: order([{ n: 'A', d: '' }, { n: 'B', d: '' }, { n: 'C', d: '' }]),
    middleUndated: order([{ n: 'A', d: '2025-08-01' }, { n: 'B', d: '' }, { n: 'C', d: '2025-09-01' }]),
    trailingUndated: order([{ n: 'A', d: '2025-08-01' }, { n: 'B', d: '2025-08-15' }, { n: 'C', d: '' }]),
  };
});
const seq = (a) => JSON.stringify(a);
ok(seq(r.leadingUndated) === seq(['Patriots', 'Irish', 'Ravens']), 'undated Game 1 stays first, not shoved to the end', JSON.stringify(r.leadingUndated));
ok(seq(r.outOfOrderDated) === seq(['Jul', 'Aug', 'Sep']), 'fully-dated games still sort by date (no regression)', JSON.stringify(r.outOfOrderDated));
ok(seq(r.allUndated) === seq(['A', 'B', 'C']), 'all-undated falls back to creation order', JSON.stringify(r.allUndated));
ok(seq(r.middleUndated) === seq(['A', 'B', 'C']), 'a mid-list undated game keeps its slot', JSON.stringify(r.middleUndated));
ok(seq(r.trailingUndated) === seq(['A', 'B', 'C']), 'a trailing undated game stays last', JSON.stringify(r.trailingUndated));

console.log('\n== 6. Single Game menu: create + edit, fields in the menu, week-aware name ==');
r = await page.evaluate(() => {
  const inMenu = (id) => { const el = document.getElementById(id); return !!el && !!el.closest('#gameModal'); };
  const dup = (id) => document.querySelectorAll('#' + id).length;
  const modal = document.getElementById('gameModal');
  const store = window.app.storage.seasonStore;

  // --- CREATE via the single menu ---
  window.app._openGameModal('create');
  const shownCreate = modal && !modal.classList.contains('hidden');
  const dateDefault = document.getElementById('gameDate').value;
  document.getElementById('gameWeek').value = '5';
  document.getElementById('gameOpponent').value = 'Probe Rivals';
  document.getElementById('gameDate').value = '2025-10-01';
  document.getElementById('gameHomeAway').value = 'home';
  document.getElementById('gameType').value = 'playoff';
  window.app._confirmGameModal();
  window.app.storage.commitActive();   // flush debounced autosave into the node
  const active = store.activeGame();
  const createdName = store.gameName(active, 0);
  const closedAfterCreate = modal.classList.contains('hidden');

  // --- EDIT the same game via the SAME menu ---
  window.app._openGameModal('edit');
  const titleEdit = document.getElementById('gmTitle').textContent;
  const prefillOpp = document.getElementById('gameOpponent').value;
  document.getElementById('gameOpponent').value = 'Probe Rivals B';
  window.app._confirmGameModal();
  window.app.storage.commitActive();
  const editedOpp = store.activeGame()?.gameInfo?.opponent;
  const summaryText = document.getElementById('gameHeaderSummary')?.textContent || '';

  return {
    inMenu: inMenu('gameWeek') && inMenu('gameOpponent') && inMenu('gameDate') && inMenu('gameHomeAway') && inMenu('gameType') && inMenu('gameScoreUs'),
    oppDup: dup('gameOpponent'), weekDup: dup('gameWeek'), typeDup: dup('gameType'),
    shownCreate, dateDefaultLen: (dateDefault || '').length,
    newDate: active?.gameInfo?.date, newOpp: active?.gameInfo?.opponent,
    newHome: active?.gameInfo?.homeAway, newType: active?.gameInfo?.gameType,
    createdName, closedAfterCreate, titleEdit, prefillOpp, editedOpp, summaryText,
    headerIsButton: !!document.getElementById('btnEditGame'),
    headerHasSummary: !!document.getElementById('gameHeaderSummary'),
  };
});
ok(r.inMenu, 'all game-detail inputs live inside the single Game menu (#gameModal)', JSON.stringify(r));
ok(r.oppDup === 1 && r.weekDup === 1 && r.typeDup === 1, 'no duplicate game-field IDs', JSON.stringify(r));
ok(r.shownCreate && r.dateDefaultLen === 10, 'create mode opens with the date defaulted to today', JSON.stringify(r));
ok(r.newDate === '2025-10-01' && r.newOpp === 'Probe Rivals', 'create saves opponent + date', JSON.stringify(r));
ok(r.newHome === 'home' && r.newType === 'playoff', 'create saves Home/Away + Game type', JSON.stringify(r));
ok(r.createdName === 'Week 5 vs Probe Rivals', 'game name is week-aware ("Week 5 vs …")', JSON.stringify(r));
ok(r.closedAfterCreate, 'menu closes after create', JSON.stringify(r));
ok(r.titleEdit === 'Game settings' && r.prefillOpp === 'Probe Rivals', 'edit reopens the SAME menu, pre-filled', JSON.stringify(r));
ok(r.editedOpp === 'Probe Rivals B', 'editing in the menu updates the active game', JSON.stringify(r));
ok(r.headerIsButton && r.headerHasSummary && /Rivals/.test(r.summaryText), 'header is a summary launcher reflecting the game', JSON.stringify(r));

console.log('\n== 7. Expand-video toggle wires to the Fullscreen API ==');
r = await page.evaluate(() => {
  const btn = document.getElementById('btnExpandVideo');
  const target = document.getElementById('videoContainer');
  if (!btn || !target) return { btnExists: false };
  let called = 0;
  target.requestFullscreen = () => { called++; return Promise.resolve(); };  // spy (headless can't really fullscreen)
  btn.click();
  return { btnExists: true, called };
});
ok(r.btnExists, 'Expand button is present in the play controls', JSON.stringify(r));
ok(r.called === 1, 'clicking Expand requests fullscreen on #videoContainer', JSON.stringify(r));

console.log('\n== 8. Drive chart: reconstructs drives + rows carry play ids ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const plays = [
    mk({ unit: 'offense', down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4' }),
    mk({ unit: 'offense', down: '2', distance: '6', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '3' }),
    mk({ unit: 'offense', down: '3', distance: '3', playType: 'Run Inside', runPass: 'Run', result: 'No Gain', yardage: '0' }),
    mk({ unit: 'offense', down: '4', distance: '3', stType: 'Punt', result: 'Punt', yardage: '0' }),
    mk({ unit: 'offense', down: '1', distance: '10', playType: 'Deep Pass', runPass: 'Pass', result: 'Gain', yardage: '40' }),
    mk({ unit: 'offense', down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Touchdown', yardage: '10' }),
  ];
  const ds = eng._driveStats(plays);
  const html = eng._renderDriveChart({ drives: ds });
  return {
    driveCount: ds.list.length,
    hasIds: ds.list.length > 0 && ds.list.every(d => Array.isArray(d.playIds)),
    htmlRows: /drive-row/.test(html) && /data-drive-ids/.test(html),
  };
});
ok(r.driveCount >= 1, 'drives reconstructed from the play sequence', JSON.stringify(r));
ok(r.hasIds, 'each drive carries playIds (click-to-film)', JSON.stringify(r));
ok(r.htmlRows, 'drive chart renders rows with play ids', JSON.stringify(r));

console.log('\n== 9. Matchup: empty state with no scout data, side-by-side with it ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const pane = document.createElement('div');
  const orig = eng._matchupData.bind(eng);
  eng._matchupData = () => ({ opponents: [], yourOff: [] });
  eng._renderMatchupInto(pane);
  const emptyOk = /Opponent Scout/i.test(pane.innerHTML);
  eng._matchupData = () => ({
    opponents: [{ name: 'Test Foe', defPlays: Array.from({ length: 6 }, () => mk({ unit: 'defense', down: '2', distance: '8', defFront: 'Nickel', coverage: 'Cover 3', result: 'Incomplete', yardage: '0' })) }],
    yourOff: Array.from({ length: 6 }, () => mk({ unit: 'offense', down: '1', distance: '10', formation: 'Shotgun', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '6' })),
  });
  eng._renderMatchupInto(pane);
  const populatedOk = /gi-matchup/.test(pane.innerHTML) && /Test Foe/.test(pane.innerHTML);
  eng._matchupData = orig;
  return { emptyOk, populatedOk };
});
ok(r.emptyOk, 'Matchup shows the "scout an opponent" empty state with no scout data', JSON.stringify(r));
ok(r.populatedOk, 'Matchup renders our offense vs the opponent defense when scouted', JSON.stringify(r));

console.log('\n== 10. Depth chart: groups roster by side + position ==');
r = await page.evaluate(() => {
  const roster = window.app.roster;
  roster.players = [
    { num: '7', name: 'Hayes', pos: 'QB', side: 'O' },
    { num: '22', name: 'Carter', pos: 'RB', side: 'O' },
    { num: '55', name: 'Osei', pos: 'LB', side: 'D' },
  ];
  let html = '';
  const origOpen = window.open;
  window.open = () => ({ document: { open() {}, write(s) { html += s; }, close() {} }, focus() {}, print() {} });
  try { roster.exportDepthChart(); } finally { window.open = origOpen; }
  return { hasOffense: /Offense/.test(html), hasDefense: /Defense/.test(html), hasQB: /QB/.test(html), hasPlayer: /Hayes/.test(html) };
});
ok(r.hasOffense && r.hasDefense, 'depth chart groups by side (Offense / Defense)', JSON.stringify(r));
ok(r.hasQB && r.hasPlayer, 'depth chart lists positions + players', JSON.stringify(r));

console.log('\n== 11. Special teams: phase stats (gross/net/TB%, FG, returns) + scoring ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const plays = [
    mk({ unit: 'special', stType: 'Punt', kickDistance: '45', returnYards: '5', hangTime: '4.2', kickOutcome: 'Returned' }),
    mk({ unit: 'special', stType: 'Punt', kickDistance: '40', returnYards: '0', hangTime: '4.6', kickOutcome: 'Touchback' }),
    mk({ unit: 'special', stType: 'Field Goal', kickDistance: '25', kickOutcome: 'Good' }),
    mk({ unit: 'special', stType: 'Field Goal', kickDistance: '45', kickOutcome: 'No Good' }),
    mk({ unit: 'special', stType: 'Kick Return', returnYards: '30' }),
    mk({ unit: 'special', stType: 'Punt Return', returnYards: '12', result: 'Touchdown' }),
  ];
  const st = eng._specialTeamsStats(plays);
  const html = eng._renderSpecialTeams({ specialTeams: st });
  const xpPts = eng.constructor.playPoints({ tags: { stType: 'XP', kickOutcome: 'Good' } });
  return {
    puntN: st.punts.n, gross: st.punts.grossAvg, net: st.punts.netAvg, tb: st.punts.tbPct,
    fgMade: st.fg.made, fgAtt: st.fg.att, prTd: st.returns.punt.td, krAvg: st.returns.kick.avg,
    htmlHasPunts: /Punts/.test(html) && /Special Teams/.test(html), xpPts,
  };
});
ok(r.puntN === 2 && r.gross === 42.5 && r.net === 30, 'punt count + gross/net avg (touchback nets gross−20)', JSON.stringify(r));
ok(r.tb === 50, 'punt touchback % from kick outcome', JSON.stringify(r));
ok(r.fgMade === 1 && r.fgAtt === 2, 'field goals made/att via kickOutcome', JSON.stringify(r));
ok(r.prTd === 1 && r.krAvg === 30, 'return game (punt-return TD + kick-return avg)', JSON.stringify(r));
ok(r.htmlHasPunts, 'Special Teams section renders', JSON.stringify(r));
ok(r.xpPts === 1, 'XP scores via kickOutcome=Good (playPoints)', JSON.stringify(r));

console.log('\n== 12. Phase-aware ST form: fields/chips show per ST Play Type ==');
r = await page.evaluate(() => {
  const tagger = window.app.tagger;
  const fieldHidden = (id) => document.getElementById(id)?.closest('.st-field')?.classList.contains('st-hidden');
  const chipHidden = (val) => document.querySelector(`#tagKickOutcome .pick[data-value="${val}"]`)?.classList.contains('st-hidden');
  tagger._applyStPhase('Punt');
  const punt = { hang: fieldHidden('tagHangTime') === false, dist: fieldHidden('tagKickDistance') === false, good: chipHidden('Good') === true, downed: chipHidden('Downed') === false };
  tagger._applyStPhase('Field Goal');
  const fg = { hangHidden: fieldHidden('tagHangTime') === true, good: chipHidden('Good') === false };
  tagger._applyStPhase('');
  const cleared = fieldHidden('tagKickDistance') === true;
  // Stale-field clearing on a user phase switch (_onStPhaseChange).
  tagger.tagFields.kickOutcome.value = 'Downed';
  tagger._onStPhaseChange('Field Goal');
  const staleCleared = tagger.tagFields.kickOutcome.value === '';
  tagger.tagFields.kickOutcome.value = 'Good';
  tagger._onStPhaseChange('Field Goal');
  const validKept = tagger.tagFields.kickOutcome.value === 'Good';
  return { punt, fg, cleared, staleCleared, validKept };
});
ok(r.punt.hang && r.punt.dist, 'Punt phase shows hang time + kick distance', JSON.stringify(r));
ok(r.punt.good && r.punt.downed, 'Punt shows coverage outcomes, hides Good/No Good', JSON.stringify(r));
ok(r.fg.hangHidden && r.fg.good, 'FG phase hides hang time, shows Good', JSON.stringify(r));
ok(r.cleared, 'no ST phase hides the detail fields', JSON.stringify(r));
ok(r.staleCleared, 'switching phase clears an outcome the new phase cannot use', JSON.stringify(r));
ok(r.validKept, 'switching phase keeps an outcome the new phase still allows', JSON.stringify(r));

console.log('\n== 13. Formation→Backfield migration (Hudl model): split, idempotent, safe ==');
r = await page.evaluate(() => {
  const SeasonStore = window.app.storage.seasonStore.constructor;
  const mig = (formation, backfield) => {
    const p = { tags: { formation, backfield } };
    SeasonStore.migratePlayFormation(p);
    return { f: p.tags.formation, b: p.tags.backfield, s: p.tags.strength };
  };
  const a = mig('Pistol + Singleback + Trips', undefined);
  const b = mig('I-Form', undefined);
  const c = mig('Shotgun + Empty', undefined);
  const d = mig('Shotgun + Trips', 'Strong');
  const a2 = { tags: { formation: a.f, backfield: a.b } };
  SeasonStore.migratePlayFormation(a2);
  return { a, b, c, d, idempotent: a2.tags.formation === a.f && a2.tags.backfield === a.b };
});
ok(r.a.f === 'Pistol + Trips' && r.a.b === 'Single', 'splits the backfield out of formation', JSON.stringify(r.a));
ok(r.b.f === '' && r.b.b === 'I', 'bare backfield formation → backfield, formation empties', JSON.stringify(r.b));
ok(r.c.f === 'Shotgun + Empty' && r.c.b === '', 'Empty stays in formation (dual citizen)', JSON.stringify(r.c));
ok(r.d.f === 'Shotgun + Trips' && r.d.b === 'Strong', 'new-style play + deliberate backfield untouched', JSON.stringify(r.d));
ok(r.idempotent, 'migration is idempotent (re-run is a no-op)', JSON.stringify(r));

console.log('\n== 14. Backfield + Strength dimensions render + cut-to-film ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const plays = [
    mk({ unit: 'offense', backfield: 'I', strength: 'Right', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' }),
    mk({ unit: 'offense', backfield: 'I', strength: 'Right', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7' }),
    mk({ unit: 'offense', backfield: 'Single', strength: 'Left', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '6' }),
  ];
  const html = eng._renderBackfieldStrength({ offPlays: plays });
  const bfCut = eng._buildCutFilter('backfield', 'I');
  const strCut = eng._buildCutFilter('strength', 'Right');
  return {
    rendered: /Backfield/.test(html) && /Strength/.test(html) && /chart-eff/.test(html),
    bfMatched: plays.filter(p => bfCut(p)).length,
    strMatched: plays.filter(p => strCut(p)).length,
  };
});
ok(r.rendered, 'Backfield & Strength tables render', JSON.stringify(r));
ok(r.bfMatched === 2 && r.strMatched === 2, 'backfield + strength cut filters resolve to film', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
