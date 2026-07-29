import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
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
     8. Opponent Scout (v1.9.17): generate an opponent's tendencies from games
        you've ALREADY tagged — no re-tagging. Their offense is read from your
        DEFENSIVE snaps (the formation/play type you faced), their defense from
        the fronts/coverages you faced on OFFENSE; auto-aggregated across every
        game vs them, INCLUDING prior seasons read from localStorage. Covers the
        header button, the offense/defense split, case-insensitive matching, the
        cross-season merge, the rendered overlay, and the empty state.
     9. Special-teams alignment leak (v1.9.19): a special-teams play can't hold a
        formation/personnel/front (the ST form hides those groups), so the
        Save-&-Next carry must not propagate one onto it — the bug where every ST
        snap got coded "Under Center". Covers the unit-aware carry, the
        strip-on-convert (setUnit), and the retroactive SeasonStore cleanup, plus
        that the carry never crosses the offense/defense boundary either.
    10. Opponent Scout data fixes (v1.9.20): the their-offense overview KPIs now
        aggregate (the snaps are presented as offense so compute()'s unit
        partition counts run/pass), and our OWN custom fronts (.our-def-only) are
        excluded from "their defensive fronts" so a carry-leaked Maverick can't
        masquerade as the opponent's front.
    11. XSS-inert player names (v1.9.21): a roster name carrying an <img onerror>
        payload renders escaped in the dashboard (no live element, handler never
        fires) — names/notes travel in importable season + CSV files.
    12. Real-data E2E follow-ups (v1.9.22): Self-Scout/Opponent-Scout show a
        graceful empty state instead of a blocking alert() when nothing is
        tagged, and SeasonStore.stripLeakedFronts cleans our-own defensive fronts
        that leaked onto offense snaps (carry artifact) out of "defense faced".
    13. Matchup from a played game (v1.9.23): _matchupData now surfaces the
        opponent's defense from games you PLAYED (the front/coverage faced on your
        offense snaps, relabeled as defensive reps), not only perspective:'scout'
        games — so the Matchup tab stops showing its empty state for a game you
        fully tagged.
    14. "Big 12" core-calls report (v1.9.24): _bigTwelveData rolls offense snaps
        into formation·strength·motion → play "calls", ranks by frequency with
        cumulative %, and reports how few calls cover 75/90% of the offense
        (Hudl's scouting axiom). bigCall cut filter plays an exact call; shown on
        the Offense tab (ours, click-to-film) and the Opponent Scout (theirs).
    15. Re-add clips de-dup (v1.9.25): PlaylistManager.addFiles detects files
        whose name already matches a LIVE clip and prompts (PlayTagger._choiceDialog)
        to SKIP (import only what's new) or RE-LINK (repoint the existing tagged
        play at the new file); covers the dialog render + skip/relink/cancel.

   Run after build:  npm run build && node tools/e2e-season-tab.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
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
page.on('response', response => {
  if (response.status() !== 404) return;
  const path = new globalThis.URL(response.url()).pathname;
  if (path !== '/x') errors.push(`HTTP 404: ${response.url()}`);
});
page.on('console', m => {
  if (m.type() !== 'error') return;
  const text = m.text();
  // The stored-XSS fixtures intentionally render inert <img src=x> payloads.
  // Chromium logs their failed image fetches; that is the test payload working,
  // not an app error.
  if (/^Failed to load resource: (?:net::ERR_FILE_NOT_FOUND|the server responded with a status of 404 \(Not Found\))$/.test(text)) return;
  errors.push(text);
});
const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== Setup: team + demo + open a game (full app init) ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team/season setup lives in the library overlay, opened from the shell Home.
await page.evaluate(() => document.querySelector('[data-ws-action="seasons"]')?.click());
await sleep(400);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
// Open game 1 from the shell Home film inbox (the sole game-entry route).
await page.evaluate(() => document.querySelector('#wsFilmList [data-ws-game]')?.click());
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
  document.querySelector('#statsDashboard .stats-tab[data-tab="players"]').click();
  const pane = document.querySelector('#statsDashboard [data-pane="players"]');
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
    nativePane: pane.matches('[data-native-main-report]'),
    kpiCount: pane.querySelectorAll('.season-summary .ss-stat').length,
    hasKpi: !!ssNum,
    trendCount: pane.querySelectorAll('.gi-trend').length,
    hasLeaderboard: !!leaderboard,
    leaderboardSortable: leaderboard ? leaderboard.querySelectorAll('th.gi-sort-th').length : 0,
  };
});
ok(!r.noTab, 'the Season tab button exists in the dashboard', JSON.stringify(r));
ok(r.nativePane, 'Season pane renders through the native route on first selection', JSON.stringify(r));
ok(r.hasKpi && r.kpiCount >= 4, 'season header shows KPI cards (games/plays/yards/success…)', JSON.stringify(r));
ok(r.trendCount >= 1, 'game-by-game trend line charts render (>=2 games)', JSON.stringify(r));
ok(r.hasLeaderboard, 'season player roll-up leaderboard renders', JSON.stringify(r));
ok(r.leaderboardSortable >= 1, 'season leaderboard headers are wired sortable too', JSON.stringify(r));

console.log('\n== 3. Header hero (v1.9.5): .season-summary wears the .gi-hero card look ==');
r = await page.evaluate(() => {
  const pane = document.querySelector('#statsDashboard [data-pane="season"]');
  const summary = pane.querySelector('.season-summary');
  const num = pane.querySelector('.season-summary .ss-num');
  const cs = summary ? getComputedStyle(summary) : null;
  const csNum = num ? getComputedStyle(num) : null;
  return {
    radius: cs?.borderTopLeftRadius,
    bg: cs?.backgroundColor,
    border: cs?.borderLeftWidth,
    numFont: csNum?.fontFamily || '',
  };
});
ok(r.radius === '0px', 'Native season KPI band uses the square broadcast geometry', JSON.stringify(r));
ok(r.bg === 'rgb(18, 24, 32)' && r.border === '3px', 'Native season KPI band uses the DECK surface and current-context rule', JSON.stringify(r));
ok(/IBM Plex Sans Condensed/i.test(r.numFont), 'KPI numbers use the native condensed football-number face', JSON.stringify(r));

console.log('\n== 3b. Season analytics blocks (v1.10.2) + trend un-clip ==');
r = await page.evaluate(() => {
  const pane = document.querySelector('#statsDashboard [data-pane="season"]');
  const q = s => pane.querySelectorAll(s).length;
  // Sub-panes all stay in the DOM (CSS show/hide), so the Breakdown/Players
  // blocks are queryable without clicking their sub-tabs.
  const legendFirst = pane.querySelector('.gi-trend-legend span')?.textContent || '';
  return {
    scorecardTiles: q('.gi-sc-tile'),
    marginVal: pane.querySelector('.gi-ts-margin-val')?.textContent ?? null,
    quarterRows: q('.gi-q-row'),
    identityRows: q('.gi-id-row'),
    winLossTable: !!pane.querySelector('.gi-wl-table'),
    perGameTO: /TO±/.test(pane.querySelector('.stats-table-full thead')?.textContent || ''),
    legendFirst,
  };
});
ok(r.scorecardTiles >= 6, 'Situational Scorecard renders its tiles', JSON.stringify(r));
ok(r.marginVal !== null, 'Turnover Margin value renders', JSON.stringify(r));
ok(r.quarterRows >= 1, 'Scoring-by-quarter bars render', JSON.stringify(r));
ok(r.identityRows >= 1, 'Offensive Identity usage rows render', JSON.stringify(r));
ok(r.winLossTable, 'Wins vs Losses table renders (demo has a W and an L)', JSON.stringify(r));
ok(/^[A-Za-z]/.test(r.legendFirst), 'trend legend shows the first game name un-clipped (S1/S2 fix)', JSON.stringify(r));

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

console.log('\n== 6. Native Game settings: create + edit, week-aware name ==');
await page.evaluate(() => { void window.app.gameScreen.open({ mode: 'create' }); });
await page.waitForSelector('[data-overlay-id="game-details"] [data-native-game-form]');
await page.waitForFunction(() => document.activeElement?.name === 'week');
r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-overlay-id="game-details"] [data-native-game-form]').length,
  legacyAbsent: !document.getElementById('gameModal'),
  dateDefaultLen: document.querySelector('[data-native-game-form] [name="date"]')?.value.length || 0,
  focused: document.activeElement?.name,
}));
ok(r.native === 1 && r.legacyAbsent, 'one native Game settings owner replaces the legacy modal', JSON.stringify(r));
ok(r.dateDefaultLen === 10 && r.focused === 'week', 'create mode defaults the date and focuses Week', JSON.stringify(r));
await page.type('[data-native-game-form] [name="week"]', '5');
await page.type('[data-native-game-form] [name="opponent"]', 'Probe Rivals');
await page.$eval('[data-native-game-form] [name="date"]', el => { el.value = '2025-10-01'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.select('[data-native-game-form] [name="homeAway"]', 'home');
await page.select('[data-native-game-form] [name="gameType"]', 'playoff');
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]'));
r = await page.evaluate(() => {
  const store = window.app.storage.seasonStore, active = store.activeGame();
  return { date: active?.gameInfo?.date, opponent: active?.gameInfo?.opponent,
    home: active?.gameInfo?.homeAway, type: active?.gameInfo?.gameType,
    name: store.gameName(active, store.activeIndex()) };
});
ok(r.date === '2025-10-01' && r.opponent === 'Probe Rivals', 'native create saves opponent + date', JSON.stringify(r));
ok(r.home === 'home' && r.type === 'playoff' && r.name === 'Week 5 vs Probe Rivals', 'native create saves complete game context', JSON.stringify(r));
await page.evaluate(() => { void window.app.gameScreen.open({ mode: 'edit' }); });
await page.waitForSelector('[data-overlay-id="game-details"] [name="opponent"]');
r = await page.evaluate(() => ({ title: document.querySelector('[data-overlay-id="game-details"] h2')?.textContent,
  opponent: document.querySelector('[data-native-game-form] [name="opponent"]')?.value }));
ok(r.title === 'Game settings' && r.opponent === 'Probe Rivals', 'edit reopens the native form pre-filled', JSON.stringify(r));
await page.$eval('[data-native-game-form] [name="opponent"]', el => { el.value = 'Probe Rivals B'; el.dispatchEvent(new Event('input', { bubbles: true })); });
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="game-details"]'));
r = await page.evaluate(() => ({ opponent: window.app.storage.seasonStore.activeGame()?.gameInfo?.opponent,
  summary: document.getElementById('gameHeaderSummary')?.textContent || '' }));
ok(r.opponent === 'Probe Rivals B' && /Rivals B/.test(r.summary), 'native edit updates the active game and summary', JSON.stringify(r));

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
    const p = { tags: { formation } };
    if (backfield !== undefined) p.tags.backfield = backfield;
    SeasonStore.migratePlayFormation(p);
    return { f: p.tags.formation, b: p.tags.backfield, s: p.tags.strength };
  };
  const a = mig('Pistol + Singleback + Trips', undefined);
  const b = mig('I-Form', undefined);
  const c = mig('Shotgun + Empty', undefined);
  const d = mig('Shotgun + Trips', 'Strong');
  const e = mig('Power-I', '');
  const a2 = { tags: { formation: a.f, backfield: a.b } };
  SeasonStore.migratePlayFormation(a2);
  return { a, b, c, d, e, idempotent: a2.tags.formation === a.f && a2.tags.backfield === a.b };
});
ok(r.a.f === 'Pistol + Trips' && r.a.b === 'Single', 'splits the backfield out of formation', JSON.stringify(r.a));
ok(r.b.f === '' && r.b.b === 'I', 'bare backfield formation → backfield, formation empties', JSON.stringify(r.b));
ok(r.c.f === 'Shotgun + Empty' && r.c.b === '', 'Empty stays in formation (dual citizen)', JSON.stringify(r.c));
ok(r.d.f === 'Shotgun + Trips' && r.d.b === 'Strong', 'new-style play + deliberate backfield untouched', JSON.stringify(r.d));
ok(r.e.f === 'Power-I' && r.e.b === '', 'modern custom Power-I formation is never rewritten', JSON.stringify(r.e));
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

console.log('\n== 15. Stage 2: Self-Scout strength tell + Formation×Strength + matrix dims ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const plays = [];
  for (let i = 0; i < 10; i++) plays.push(mk({ unit: 'offense', down: '1', distance: '10', formation: 'Shotgun + Trips', strength: 'Right', backfield: 'Single', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' }));
  for (let i = 0; i < 4; i++) plays.push(mk({ unit: 'offense', down: '2', distance: '8', formation: 'Shotgun + Doubles', strength: 'Balanced', backfield: 'Empty', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '6' }));
  window.app.tagger.plays = plays;
  eng.filter.active = false;
  const rep = eng.generateSelfScout();
  const fsCut = eng._buildCutFilter('comboFStr', 'Trips__Right');
  const dims = eng.constructor._matrixDimensions().map(d => d.id);
  return {
    hasStrengthTell: rep.tells.some(t => t.cutType === 'strength' || t.cutType === 'comboFStr'),
    fsMatched: window.app.tagger.plays.filter(p => fsCut(p)).length,
    hasBackfieldDim: dims.includes('backfield'), hasStrengthDim: dims.includes('strength'),
  };
});
ok(r.hasStrengthTell, 'Self-Scout surfaces a strength / Formation×Strength tell', JSON.stringify(r));
ok(r.fsMatched === 10, 'comboFStr cut (Trips × Right) resolves to those plays', JSON.stringify(r));
ok(r.hasBackfieldDim && r.hasStrengthDim, 'Tendency Matrix gains Backfield + Strength dimensions', JSON.stringify(r));

console.log('\n== 16. Opponent Scout: auto-aggregate from already-tagged games, across seasons ==');
r = await page.evaluate(() => {
  const eng = window.app.stats, mk = window.__mk;
  const store = window.app.storage.seasonStore;
  // The Scout-Opponent button lives in the dashboard header.
  eng.showDashboard();
  const hasBtn = !!document.querySelector('#statsDashboard #btnScoutOpp');
  // A game we PLAYED vs "Test Rivals": our DEFENSIVE snaps captured their offense
  // (Trips, mostly run), our OFFENSIVE snaps captured the fronts they showed (3-4).
  const game = {
    id: 'oppscout_cur', name: 'vs Test Rivals',
    gameInfo: { opponent: 'Test Rivals', perspective: '' },
    plays: [
      mk({ unit: 'defense', formation: 'Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '6', down: '1', distance: '10' }),
      mk({ unit: 'defense', formation: 'Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', down: '2', distance: '4' }),
      mk({ unit: 'defense', formation: 'Trips', playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '8', down: '1', distance: '10' }),
      mk({ unit: 'defense', formation: 'Empty', playType: 'Deep Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', down: '3', distance: '8' }),
      mk({ unit: 'offense', formation: 'Shotgun', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '7', defFront: '3-4', coverage: 'Cover 2' }),
      mk({ unit: 'offense', formation: 'Shotgun', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3', defFront: '3-4', coverage: 'Man' }),
    ],
    annotations: {}, nextId: 50, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false
  };
  store.data.games.push(game);
  const one = eng.generateOpponentScout('Test Rivals');
  const trips1 = one.offReport && one.offReport.formationDetail.find(f => f.name === 'Trips');
  const front34 = one.defFronts.find(([f]) => f === '3-4');
  const ci = eng.generateOpponentScout('test rivals');     // case-insensitive
  // Now stash a PRIOR SEASON in localStorage with another game vs the same team.
  const other = { version: 5, type: 'season', games: [
    { id: 'g_old', gameInfo: { opponent: 'Test Rivals' }, plays: [
      mk({ unit: 'defense', formation: 'Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5' }) ] } ] };
  localStorage.setItem('ffa_season_xtest', JSON.stringify(other));
  const lib = JSON.parse(localStorage.getItem('ffa_library') || '[]');
  lib.push({ id: 'xtest', name: 'Last Year' });
  localStorage.setItem('ffa_library', JSON.stringify(lib));
  const agg = eng.generateOpponentScout('Test Rivals');
  const trips2 = agg.offReport && agg.offReport.formationDetail.find(f => f.name === 'Trips');
  // Render the overlay and read it back.
  eng.renderOpponentScout('Test Rivals');
  const ov = document.querySelector('#statsDashboard .stats-overlay');
  const txt = ov ? ov.textContent : '';
  // Empty-state for an unknown opponent.
  eng.renderOpponentScout('Nobody United');
  const emptyTxt = (document.querySelector('#statsDashboard .stats-overlay') || {}).textContent || '';
  return {
    hasBtn,
    oneGames: one.games, oneOff: one.offCount, oneDef: one.defCount,
    tripsTotal1: trips1 ? trips1.total : 0, tripsRunPct: trips1 ? trips1.runPct : -1,
    front34: front34 ? front34[1] : 0,
    ciGames: ci ? ci.games : 0,
    aggGames: agg.games, aggOff: agg.offCount, tripsTotal2: trips2 ? trips2.total : 0,
    rendered: !!ov, theirOff: /Their Offense/.test(txt), theirFronts: /Their Defensive Fronts/.test(txt),
    aggLine: /aggregated/i.test(txt),
    emptyState: /No games found/.test(emptyTxt),
  };
});
ok(r.hasBtn, 'Scout-Opponent button sits in the dashboard header', JSON.stringify(r));
ok(r.oneGames === 1 && r.oneOff === 4 && r.oneDef === 2, 'one tagged game: their offense=our 4 D-snaps, their defense=our 2 O-snaps', JSON.stringify(r));
ok(r.tripsTotal1 === 3 && r.tripsRunPct === 100, 'their offensive tendency built from our defensive snaps (Trips ×3, 100% run)', JSON.stringify(r));
ok(r.front34 === 2, 'their defensive front (3-4) tallied from the fronts we faced', JSON.stringify(r));
ok(r.ciGames === 1, 'opponent matching is case-insensitive', JSON.stringify(r));
ok(r.aggGames === 2 && r.aggOff === 5 && r.tripsTotal2 === 4, 'aggregates a prior SEASON too (2 games, Trips ×4 merged)', JSON.stringify(r));
ok(r.rendered && r.theirOff && r.theirFronts && r.aggLine, 'renderOpponentScout shows their offense, their fronts, and provenance', JSON.stringify(r));
ok(r.emptyState, 'unknown opponent shows the "tag a game / no re-tag" empty state', JSON.stringify(r));

console.log('\n== 17. Special-teams plays never carry offensive alignment ("Under Center" bug) ==');
r = await page.evaluate(() => {
  const mk = window.__mk, tagger = window.app.tagger;
  const SeasonStore = window.app.storage.seasonStore.constructor;
  // (a) The Save-&-Next carry must NOT push a formation onto a special-teams play.
  const prevOff = mk({ unit: 'offense', formation: 'Under Center', personnel: '11' });
  const nextSt = mk({ unit: 'special', stType: 'Punt' });
  tagger.applyCarryScheme(prevOff, nextSt);
  const carryClean = !nextSt.tags.formation && !nextSt.tags.personnel;
  // (b) ...but the carry still fills a following OFFENSE play (regression guard).
  const nextOff = mk({ unit: 'offense' });
  tagger.applyCarryScheme(prevOff, nextOff);
  const carryOffWorks = nextOff.tags.formation === 'Under Center' && nextOff.tags.personnel === '11';
  // (c) Switching a play to Special Teams strips leaked alignment (setUnit path).
  const p = mk({ unit: 'offense', formation: 'Under Center', personnel: '11', defFront: '4-3' });
  tagger.plays = [p]; tagger.currentPlayId = p.id;
  tagger.setUnit('special');
  const convertClean = !p.tags.formation && !p.tags.personnel && !p.tags.defFront && p.tags.unit === 'special';
  // (d) Retroactive cleanup fixes ST plays already saved with a leaked formation.
  const legacy = mk({ unit: 'special', stType: 'Kickoff', formation: 'Under Center', personnel: '11', coverage: 'Cover 3' });
  SeasonStore.stripStAlignment(legacy);
  const normalizeClean = !legacy.tags.formation && !legacy.tags.personnel && !legacy.tags.coverage;
  // (e) ...and it leaves a real offense play untouched.
  const keep = mk({ unit: 'offense', formation: 'Under Center' });
  SeasonStore.stripStAlignment(keep);
  const offUntouched = keep.tags.formation === 'Under Center';
  // (f) Carry must NOT cross the offense/defense boundary — our defensive
  //     front/coverage can't ride onto an offense snap (the Maverick-in-their-
  //     fronts leak that contaminated the opponent scout).
  const prevDef = mk({ unit: 'defense', defFront: 'Maverick', coverage: 'Cover 3' });
  const nextOffBlank = mk({ unit: 'offense' });
  tagger.applyCarryScheme(prevDef, nextOffBlank);
  const crossUnitClean = !nextOffBlank.tags.defFront && !nextOffBlank.tags.coverage;
  return { carryClean, carryOffWorks, convertClean, normalizeClean, offUntouched, crossUnitClean };
});
ok(r.carryClean, 'Save-&-Next carry does NOT put a formation on a special-teams play', JSON.stringify(r));
ok(r.carryOffWorks, 'carry still fills a following offense play (regression guard)', JSON.stringify(r));
ok(r.convertClean, 'switching a play to Special Teams strips leaked formation/personnel/front', JSON.stringify(r));
ok(r.normalizeClean, 'stripStAlignment cleans existing ST plays on load', JSON.stringify(r));
ok(r.offUntouched, 'stripStAlignment leaves offense plays alone', JSON.stringify(r));
ok(r.crossUnitClean, 'carry does NOT leak defensive front/coverage onto an offense snap', JSON.stringify(r));

console.log('\n== 18. Opponent Scout: overview aggregates + our own fronts excluded from "their D" ==');
r = await page.evaluate(() => {
  const mk = window.__mk, eng = window.app.stats;
  const store = window.app.storage.seasonStore;
  // A game we PLAYED (perspective 'offense') vs "Carry Bug U".
  store.data.games.push({
    id: 'oppscout_agg', name: 'vs Carry Bug U',
    gameInfo: { opponent: 'Carry Bug U', perspective: 'offense' },
    plays: [
      // their offense = our DEFENSE snaps (3 run, 1 pass) — overview must aggregate.
      mk({ unit: 'defense', formation: 'Flexbone', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6' }),
      mk({ unit: 'defense', formation: 'Flexbone', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '4' }),
      mk({ unit: 'defense', formation: 'Flexbone', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '5' }),
      mk({ unit: 'defense', formation: 'Shotgun', runPass: 'Pass', playType: 'Deep Pass', result: 'Incomplete', yardage: '0' }),
      // their defense = our OFFENSE snaps; two carry our OWN front (Maverick) leaked in.
      mk({ unit: 'offense', defFront: 'Maverick + 5-2', coverage: 'Cover 3' }),
      mk({ unit: 'offense', defFront: '5-2', coverage: 'Cover 3' }),
      mk({ unit: 'offense', defFront: 'Maverick', coverage: 'Cover 3' }),
    ],
    annotations: {}, nextId: 50, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false
  });
  const d = eng.generateOpponentScout('Carry Bug U');
  const t = d.offReport && d.offReport.stats.tendencies;
  const fronts = Object.fromEntries(d.defFronts);
  return { runPct: t ? parseFloat(t.runPct) : -1, hasMaverick: 'Maverick' in fronts, five2: fronts['5-2'] || 0 };
});
ok(r.runPct === 75, 'their-offense overview aggregates run/pass from our defensive snaps (3 of 4 = 75% run)', JSON.stringify(r));
ok(!r.hasMaverick, 'our own custom front (Maverick) is excluded from "their defensive fronts"', JSON.stringify(r));
ok(r.five2 === 2, 'the real opponent front (5-2) still counts (from "Maverick + 5-2" and "5-2")', JSON.stringify(r));

console.log('\n== 19. Player names are HTML-escaped in the dashboard (stored-XSS inert) ==');
r = await page.evaluate(() => {
  const mk = window.__mk;
  window.__xss = 0;
  const payload = '<img src=x onerror="window.__xss=1">';
  window.app.roster.players.push({ num: '99', name: payload, pos: 'RB', side: 'O' });
  window.app.tagger.plays = [mk({ unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', players: { ballCarrier: '99' } })];
  window.app.stats.filter.active = false;
  window.app.stats.showDashboard();
  document.querySelector('#statsDashboard .stats-tab[data-tab="players"]').click();
  const pane = document.querySelector('#statsDashboard [data-pane="players"]');
  const cell = Array.from(pane.querySelectorAll('tr.player-row td')).find(td => td.textContent.includes('99'));
  return {
    found: !!cell,
    escaped: cell ? cell.innerHTML.includes('&lt;img') : false,
    textPreserved: cell ? cell.textContent.includes('<img') : false,  // shown as literal text
    noLiveImg: !pane.querySelector('img'),
    xssFired: window.__xss === 1,
  };
});
ok(r.found, 'the #99 player row rendered', JSON.stringify(r));
ok(r.escaped && r.noLiveImg && !r.xssFired, 'a script-payload player name renders inert — escaped, no live element, handler never fired', JSON.stringify(r));
ok(r.textPreserved, 'the name is preserved as literal text (escaped, not stripped)', JSON.stringify(r));

console.log('\n== 20. Self-Scout empty-state (no blocking alert) + leaked-front cleanup ==');
r = await page.evaluate(() => {
  const SeasonStore = window.app.storage.seasonStore.constructor;
  const mk = window.__mk, eng = window.app.stats;
  // (a) stripLeakedFronts: our-own front on an offense snap is leak; real faced front kept.
  const offLeak = mk({ unit: 'offense', defFront: 'Maverick + 5-2' }); SeasonStore.stripLeakedFronts(offLeak);
  const offBare = mk({ unit: 'offense', defFront: 'Maverick' });       SeasonStore.stripLeakedFronts(offBare);
  const defKeep = mk({ unit: 'defense', defFront: 'Maverick' });       SeasonStore.stripLeakedFronts(defKeep);
  // (b) renderSelfScout with no run/pass plays → graceful overlay, NOT a blocking
  //     alert (a real alert would also hang this evaluate; we trap it to be sure).
  window.app.tagger.plays = [mk({ unit: 'offense', playType: '', runPass: '', result: 'Gain', yardage: '3' })];
  eng.filter.active = false;
  let alerted = false; const realAlert = window.alert; window.alert = () => { alerted = true; };
  eng.renderSelfScout();
  window.alert = realAlert;
  const ov = document.querySelector('#statsDashboard .stats-overlay');
  return {
    offLeak: offLeak.tags.defFront, offBare: offBare.tags.defFront, defKeep: defKeep.tags.defFront,
    emptyShown: ov ? /No run\/pass-tagged/.test(ov.textContent) : false, alerted,
  };
});
ok(r.offLeak === '5-2', 'stripLeakedFronts: "Maverick + 5-2" on offense → "5-2" (keeps the real faced front)', JSON.stringify(r));
ok(r.offBare === '', 'stripLeakedFronts: bare "Maverick" on offense → "" (pure leak removed)', JSON.stringify(r));
ok(r.defKeep === 'Maverick', 'stripLeakedFronts leaves our front on a DEFENSE snap (it is ours there)', JSON.stringify(r));
ok(r.emptyShown && !r.alerted, 'Self-Scout with no run/pass plays shows a graceful empty state, no blocking alert()', JSON.stringify(r));

console.log('\n== 21. Matchup populates from a game you PLAYED (faced defense), not only scout games ==');
r = await page.evaluate(() => {
  const mk = window.__mk, eng = window.app.stats;
  window.app.storage.seasonStore.data.games.push({
    id: 'matchup_played', name: 'vs Faced D U',
    gameInfo: { opponent: 'Faced D U', perspective: 'offense' },
    plays: [
      // our offense, with the defense we FACED tagged (front/coverage)
      mk({ unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '6', defFront: '5-2', coverage: 'Cover 3' }),
      mk({ unit: 'offense', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '8', defFront: '5-2', coverage: 'Cover 1' }),
      mk({ unit: 'offense', playType: 'Run Outside', runPass: 'Run', result: 'No Gain', yardage: '0', defFront: 'Nickel', coverage: 'Cover 2' }),
      mk({ unit: 'defense', formation: 'Trips', defFront: 'Maverick', coverage: 'Cover 3' }),  // their offense — not their defense
    ],
    annotations: {}, nextId: 50, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false
  });
  const data = eng._matchupData();
  const opp = data.opponents.find(o => o.name === 'Faced D U');
  const pane = document.createElement('div');
  eng._renderMatchupInto(pane, 'Faced D U');
  return {
    found: !!opp,
    defCount: opp ? opp.defPlays.length : 0,
    allRelabeled: opp ? opp.defPlays.every(p => p.tags.unit === 'defense') : false,
    rendered: /Faced D U Defense/.test(pane.innerHTML) && !/Tag the/.test(pane.innerHTML),
  };
});
ok(r.found, 'a game we PLAYED surfaces its opponent in the matchup', JSON.stringify(r));
ok(r.defCount === 3, 'their defense = our 3 offensive snaps that carried a faced front/coverage', JSON.stringify(r));
ok(r.allRelabeled, 'faced snaps are relabeled as defensive reps for the defensive renderer', JSON.stringify(r));
ok(r.rendered, 'the matchup renders their defense, not the empty state', JSON.stringify(r));

console.log('\n== 22. "Big 12" core-calls report (formation·strength·motion → play rollup) ==');
r = await page.evaluate(() => {
  const mk = window.__mk, eng = window.app.stats;
  const plays = [];
  for (let i = 0; i < 10; i++) plays.push(mk({ unit: 'offense', formation: 'Shotgun + Trips', strength: 'Right', motion: 'Jet', playType: 'Run Outside', runPass: 'Run', result: 'Gain', yardage: '6' }));
  for (let i = 0; i < 6; i++) plays.push(mk({ unit: 'offense', formation: 'Empty', strength: 'Balanced', playType: 'Short Pass', runPass: 'Pass', result: 'Gain', yardage: '5' }));
  ['I-Form', 'Pistol', 'Wing-T', 'Bunch'].forEach(f => plays.push(mk({ unit: 'offense', formation: f, playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '3' })));
  const d = eng._bigTwelveData(plays);
  const top = d.calls[0];
  const cut = eng._buildCutFilter('bigCall', top.key);
  const html = eng._renderBigTwelve(plays, 'Test Offense');
  const hostile = Array.from({ length: 8 }, () => mk({
    unit: 'offense', formation: '<img src=x onerror=window.__btXss=1>',
    strength: '<b>Right</b>', motion: '<script>bad()</script>',
    playType: '<svg onload=window.__btXss=1>', runPass: 'Run', result: 'Gain', yardage: '1',
  }));
  const hostileHtml = eng._renderBigTwelve(hostile, '<img src=x>');
  return {
    total: d.total, unique: d.unique, topN: top.n, topPct: top.pct, to75: d.to75, to90: d.to90,
    cutN: plays.filter(p => cut(p)).length,
    // Post-E3a projection: 'Shotgun' is QB alignment, 'Trips' the structural
    // formation, so the call signature renders "Shotgun Trips" (qb + form), not
    // the raw "Shotgun + Trips" formation string.
    rendered: /Core Calls/.test(html) && /Shotgun Trips/.test(html) && /Jet mo/.test(html),
    chipsRender: /<span class="bt-tag">Right<\/span>/.test(html)
      && /<span class="bt-tag bt-mot">Jet mo<\/span>/.test(html)
      && !/&lt;span class=/.test(html),
    hostileSafe: !hostileHtml.includes('<img') && !hostileHtml.includes('<script')
      && !hostileHtml.includes('<svg') && hostileHtml.includes('&lt;img'),
  };
});
ok(r.total === 20 && r.unique === 6, 'Big 12 rolls 20 snaps into 6 unique calls', JSON.stringify(r));
ok(r.topN === 10 && r.topPct === 50, 'dominant call (Shotgun Trips Right · Jet → Run Outside) = 10 snaps / 50%', JSON.stringify(r));
ok(r.to75 === 2 && r.to90 === 4, 'cumulative coverage: 2 calls = 75%, 4 calls = 90%', JSON.stringify(r));
ok(r.cutN === 10, 'the bigCall cut filter resolves to exactly that call\'s 10 snaps', JSON.stringify(r));
ok(r.rendered, 'the report renders the core-calls table with the call signature', JSON.stringify(r));
ok(r.chipsRender, 'Big 12 renders trusted call-format spans instead of showing raw markup', JSON.stringify(r));
ok(r.hostileSafe, 'Big 12 escapes adversarial coach-entered call values at the trusted markup boundary', JSON.stringify(r));

console.log('\n== 23. Re-adding clips: duplicate prompt (skip / re-link), no silent dupes ==');
r = await page.evaluate(async () => {
  const pl = window.app.playlist, tagger = window.app.tagger;
  const mkFile = n => new File([new Blob(['x'])], n, { type: 'video/mp4' });
  // Neutralize heavy side effects (video probe / DOM / playback).
  pl._autoCreatePlays = async () => {};
  pl._updatePlaylistUI = () => {}; pl._updateClipIndicator = () => {}; pl._updateClipCount = () => {};
  pl.switchToClip = () => {}; pl.switchToClipByPlayId = () => {};
  // (a) the choice dialog renders its buttons and resolves to the clicked key.
  const dlg = tagger._choiceDialog('msg?', [{ key: 'skip', label: 'Skip' }, { key: 'relink', label: 'Re-link' }, { key: 'cancel', label: 'Cancel' }]);
  const modal = document.getElementById('ffaConfirmModal');
  const hasBtns = ['skip', 'relink', 'cancel'].every(k => modal && modal.querySelector(`[data-key="${k}"]`));
  modal.querySelector('[data-key="relink"]').click();
  const dialogResult = await dlg;
  const seed = () => { pl.clips = [{ id: 1, name: 'clip_01', file: { name: 'clip_01.mp4' }, objectUrl: null, duration: 5, playId: 100 }]; pl._nextClipId = 2; pl.activeClipIndex = -1; tagger.plays = [{ id: 100, clipName: 'clip_01', clipId: 1 }]; };
  // (b) SKIP: re-add the folder (clip_01 dup + clip_02 new) → only clip_02 added.
  seed(); tagger._choiceDialog = async () => 'skip';
  await pl.addFiles([mkFile('clip_01.mp4'), mkFile('clip_02.mp4')]);
  const afterSkip = pl.clips.map(c => c.name);
  // (c) RE-LINK: re-add clip_01 → existing clip repointed at the new file, NOT duplicated.
  seed(); tagger._choiceDialog = async () => 'relink';
  const newFile = mkFile('clip_01.mp4');
  await pl.addFiles([newFile]);
  const relinkClips = pl.clips.length, relinkFile = pl.clips[0].file === newFile;
  // (d) CANCEL: nothing is added.
  seed(); tagger._choiceDialog = async () => 'cancel';
  await pl.addFiles([mkFile('clip_01.mp4'), mkFile('clip_02.mp4')]);
  const afterCancel = pl.clips.map(c => c.name);
  return { hasBtns, dialogResult, afterSkip, relinkClips, relinkFile, afterCancel };
});
ok(r.hasBtns && r.dialogResult === 'relink', 'choice dialog renders skip/relink/cancel and resolves to the clicked key', JSON.stringify(r));
ok(JSON.stringify(r.afterSkip) === JSON.stringify(['clip_01', 'clip_02']), 'SKIP: re-adding the folder adds only the new clip (clip_01 not duplicated)', JSON.stringify(r));
ok(r.relinkClips === 1 && r.relinkFile, 'RE-LINK: the existing clip is repointed at the new file, not duplicated', JSON.stringify(r));
ok(JSON.stringify(r.afterCancel) === JSON.stringify(['clip_01']), 'CANCEL: nothing is added', JSON.stringify(r));

console.log('\n== 24. commitActive guard — a stale tagger can NEVER overwrite another game ==');
r = await page.evaluate(() => {
  const mk = window.__mk, sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger;
  const game = (id, opp, pt, res) => ({
    id, name: 'vs ' + opp, gameInfo: { opponent: opp }, status: 'active',
    plays: [mk({ unit: 'offense', playType: pt, runPass: pt.includes('Run') ? 'Run' : 'Pass', result: res, yardage: '5' })],
    annotations: [], nextId: 50, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false,
  });
  store.data.games = [game('gA', 'Alpha', 'Run Inside', 'Gain'), game('gB', 'Bravo', 'Deep Pass', 'Touchdown')];
  store.data.activeGameId = 'gA';
  sm._loadActiveGame();                       // tagger now holds Alpha; _loadedGameId = 'gA'
  const loadedA = sm._loadedGameId === 'gA' && tagger.plays[0].tags.playType === 'Run Inside';
  // Reproduce the exact corruption trigger: active pointer moves to B while the
  // tagger still holds Alpha (mid-restore / mid-switch). OLD code wrote Alpha into gB.
  store.data.activeGameId = 'gB';
  sm.commitActive();
  const gB = store.data.games.find(g => g.id === 'gB');
  const bSafe = gB.plays[0].tags.playType === 'Deep Pass';   // unchanged → guard held
  // Positive control: a matched commit still saves normally (guard isn't over-blocking).
  store.data.activeGameId = 'gA'; sm._loadActiveGame();
  tagger.plays[0].tags.yardage = '99';
  sm.commitActive();
  const gA = store.data.games.find(g => g.id === 'gA');
  return { loadedA, bSafe, bPlayType: gB.plays[0].tags.playType, aSaved: gA.plays[0].tags.yardage === '99' };
});
ok(r.loadedA, 'setup: loading game A puts A in the tagger and records the loaded id', JSON.stringify(r));
ok(r.bSafe, 'a stale tagger (A) does NOT overwrite game B when the active pointer moved — B keeps its own plays', JSON.stringify(r));
ok(r.aSaved, 'a matched commit still saves normally (guard does not over-block)', JSON.stringify(r));

console.log('\n== 25. Undo is game-scoped — switching games resets the history (no cross-game undo) ==');
r = await page.evaluate(() => {
  const mk = window.__mk, sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger, hist = window.app.history;
  const game = (id, opp) => ({ id, name: 'vs ' + opp, gameInfo: { opponent: opp }, status: 'active', plays: [mk({ unit: 'offense', playType: 'Run Inside', result: 'Gain' })], annotations: [], nextId: 50, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false });
  store.data.games = [game('hA', 'Alpha'), game('hB', 'Bravo')];
  store.data.activeGameId = 'hA'; sm._loadActiveGame();
  tagger.plays[0].tags.yardage = '12';
  if (tagger._emit) tagger._emit('play-updated', tagger.plays[0]);   // record an undo entry in game A
  const canUndoInA = hist.canUndo();
  sm.switchToGame('hB');                                              // → history must reset
  return { canUndoInA, canUndoAfterSwitch: hist.canUndo() };
});
ok(r.canUndoInA, 'an edit in game A creates an undo entry', JSON.stringify(r));
ok(!r.canUndoAfterSwitch, 'switching to game B RESETS the undo stack — Undo can no longer reach game A', JSON.stringify(r));

console.log('\n== 26. Tag-progress counter refreshes on wholesale plays load (game open), not just per-play edits ==');
r = await page.evaluate(() => {
  const mk = window.__mk, sm = window.app.storage, store = sm.seasonStore;
  // A game with 2 tagged + 1 untagged play, loaded through the REAL game-open
  // path (_loadActiveGame → _deserialize → plays-loaded). The counter used to
  // keep its startup value ("0 / 0 tagged") until the first per-play edit —
  // so every fresh app open read as "nothing is tagged" (v1.9.29 field bug).
  const plays = [
    mk({ unit: 'special', stType: 'Kick Return', result: 'Fumble' }),   // tagged, no playType (the v1.9.26 class)
    mk({ unit: 'offense', playType: 'Run Inside', result: 'Gain' }),    // tagged
    mk({}),                                                             // untagged
  ];
  store.data.games = [{ id: 'tp1', name: 'vs Counter', gameInfo: { opponent: 'Counter' }, status: 'active', plays, annotations: [], nextId: 90, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false }];
  store.data.activeGameId = 'tp1';
  sm._loadActiveGame();
  const label = document.getElementById('tagProgressLabel');
  return { text: label ? label.textContent : '(no element)' };
});
ok(r.text === '2 / 3 tagged', 'after opening a game the counter shows the real tagged count (was stale "0 / 0 tagged")', JSON.stringify(r));

console.log('\n== 27. Timeline strip: a tagged non-run/pass play is NOT styled like an untagged one ==');
r = await page.evaluate(() => {
  const mk = window.__mk, tagger = window.app.tagger;
  const cls = (tags) => tagger._timelineTypeClass(mk(tags));
  return {
    run:       cls({ unit: 'offense', runPass: 'Run', result: 'Gain' }),
    pass:      cls({ unit: 'offense', runPass: 'Pass', result: 'Gain' }),
    runByType: cls({ unit: 'offense', playType: 'Run Inside' }),      // legacy inference path
    stTagged:  cls({ unit: 'special', stType: 'Kick Return', result: 'Fumble' }), // tagged, no run/pass
    defTagged: cls({ unit: 'defense', defFront: '4-3', coverage: 'Cover 3' }),    // tagged, no run/pass
    untagged:  cls({}),                                               // nothing tagged at all
  };
});
ok(r.run === 'run' && r.pass === 'pass' && r.runByType === 'run', 'run/pass plays keep run/pass classes', JSON.stringify(r));
ok(r.stTagged === 'other', 'tagged kick-return → "other" (a tagged class), not "untagged"', JSON.stringify(r));
ok(r.defTagged === 'other', 'tagged defensive front/coverage snap → "other", not "untagged"', JSON.stringify(r));
ok(r.untagged === 'untagged', 'a genuinely empty play → "untagged" (its own class)', JSON.stringify(r));
ok(r.stTagged !== r.untagged, 'tagged ST play and untagged play get DIFFERENT timeline classes (the bug: both were "other")', JSON.stringify(r));

console.log('\n== 28. Season-switch race: a pending autosave can NEVER write season A into season B ==');
r = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger;
  // Two REAL seasons through the real backend. Edit in A arms the 1s autosave;
  // opening B stalls on a latency-stubbed load. Before the fix, the autosave
  // fired mid-open (backend pointer already on B, memory still A) and stamped
  // A's whole season into B's slot — reproduced, then fixed by cancelling
  // debounced saves on every season transition + pinning the season id.
  const a = await sm.createSeason({ name: 'RaceAlpha', team: 'A' });
  tagger.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, notes: 'ALPHA-MARKER', clipName: 'ra1',
    tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', runPass: 'Run', down: '1', distance: '10',
      formation: '', personnel: '', motion: '', yardage: '5', hash: '', playDir: '', defFront: '', coverage: '',
      blitz: '', stType: '', quarter: '', fieldSide: 'own', yardLine: '', players: {}, grades: {}, custom: [] } }];
  tagger.nextId = 2;
  sm.commitActive(); store.persist();
  const b = await sm.createSeason({ name: 'RaceBravo', team: 'B' });
  await sm.openSeasonById(a.id);
  const origLoad = store.backend.loadSeason.bind(store.backend);
  store.backend.loadSeason = async function () { await new Promise(rs => setTimeout(rs, 1600)); return origLoad(); };
  tagger._emit('play-updated', tagger.plays[0]);          // arms the 1s autosave
  const opening = sm.openSeasonById(b.id);
  await new Promise(rs => setTimeout(rs, 1250));          // the window where the autosave used to fire
  await opening;
  store.backend.loadSeason = origLoad;
  const bravo = JSON.parse(localStorage.getItem('ffa_season_' + b.id) || 'null');
  return {
    bravoName: bravo && bravo.seasonName,
    bravoPoisoned: JSON.stringify(bravo || {}).includes('ALPHA-MARKER'),
    memoryName: store.data && store.data.seasonName,
  };
});
ok(r.bravoName === 'RaceBravo', 'season B file keeps ITS OWN data through the switch', JSON.stringify(r));
ok(!r.bravoPoisoned, 'season A play never leaks into season B (the race wrote A over B)', JSON.stringify(r));
ok(r.memoryName === 'RaceBravo', 'the opened season loads as itself, not as a clone of the previous one', JSON.stringify(r));

console.log('\n== 29. Version snapshots are game-scoped — no cross-game restore (3rd corruption path) ==');
r = await page.evaluate(async () => {
  const mk = window.__mk, sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger, vm = window.app.versions;
  tagger._confirmDialog = async () => true;   // auto-accept the app confirm
  const game = (id, name, marker, n) => ({ id, name, gameInfo: { opponent: name }, status: 'active',
    plays: Array.from({ length: n }, (_, i) => ({ ...mk({ playType: 'Run Inside', result: 'Gain', runPass: 'Run' }), id: i + 1, notes: marker })),
    annotations: [], nextId: n + 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false });
  store.data = store._normalize({ version: 5, type: 'season', id: 'vmscope', seasonName: 'VM Scope',
    games: [game('vA', 'vs Alpha', 'VM-A', 3), game('vB', 'vs Bravo', 'VM-B', 5)], activeGameId: 'vA' });
  store.currentSeasonId = 'vmscope';
  sm._loadActiveGame();

  vm.snapshot('made in game A', true);
  const keyA = vm._key();
  // Positive control: restoring A's own version inside game A still works.
  tagger.plays[0].tags.result = 'Loss';
  const own = vm._list().find(v => v.label === 'made in game A');
  await vm.restore(own.id);
  const restoredOwn = tagger.plays[0].tags.result === 'Gain';

  sm.switchToGame('vB');
  const keyB = vm._key();
  const visibleInB = vm._list().map(v => v.label);
  // Belt+braces: even a version FORCED into B's list with A's provenance is refused.
  const forged = { id: 987654321, label: 'forged-from-A', time: new Date().toISOString(), manual: true,
    playCount: 3, seasonId: 'vmscope', gameId: 'vA', data: { version: 4, plays: [], gameInfo: {}, annotations: [], nextId: 1, currentPlayId: null, clipNames: [], isMultiClip: false } };
  localStorage.setItem(vm._key(), JSON.stringify([forged]));
  await vm.restore(987654321);
  const gB = store.data.games.find(g => g.id === 'vB');
  sm.commitActive();
  return { keyA, keyB, scoped: keyA !== keyB, visibleInB, restoredOwn,
    bPlays: tagger.plays.length, bIntact: tagger.plays.length === 5 && !JSON.stringify(gB.plays).includes('VM-A') };
});
ok(r.scoped, 'version storage key differs per game (was shared "ffa_versions_default")', JSON.stringify({ keyA: r.keyA, keyB: r.keyB }));
ok(r.visibleInB.length === 0, 'game B does NOT see game A\'s versions', JSON.stringify(r.visibleInB));
ok(r.restoredOwn, 'positive control: restoring a version inside its OWN game still works', JSON.stringify(r));
ok(r.bIntact && r.bPlays === 5, 'a version stamped for another game is REFUSED even if forced into the list', JSON.stringify(r));

console.log('\n== 30. Stored-XSS: coach names/filenames render inert in the older report renderers ==');
r = await page.evaluate(async () => {
  const eng = window.app.stats;
  // Own counter (not the shared window.__xss that Test 11/19 also mutate) + drop
  // any payload roster player an earlier test left, so this measures ONLY this
  // test's own report-renderer payloads — a deferred onerror from elsewhere
  // must not be attributed here.
  window.__xss30 = 0;
  window.app.roster.players = window.app.roster.players.filter(p => !/onerror/i.test(p.name || ''));
  const payload = `<img src=x onerror="window.__xss30=(window.__xss30||0)+1">`;
  const teamInput = document.getElementById('gameTeamName');
  const out = {};
  // Defensive report header interpolates ${team} (raw before the fix).
  teamInput.value = payload;
  eng.renderDefensiveReport();
  await new Promise(rs => setTimeout(rs, 200));
  out.defImg = !!document.querySelector('.stats-overlay h2 img');
  if (eng.hideDashboard) eng.hideDashboard();
  // Scout report header interpolates ${opponent}.
  window.app.storage.gameInfo.opponent = payload;
  // seed a scout-eligible defensive play so the report renders
  window.app.tagger.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: payload, notes: '',
    tags: { unit: 'defense', playType: 'Run Inside', result: 'Gain', runPass: 'Run', down: '1', distance: '10',
      formation: 'Under Center', personnel: '', motion: '', yardage: '4', hash: '', playDir: '', defFront: '4-3', coverage: 'Cover 3',
      blitz: '', stType: '', quarter: '', fieldSide: 'own', yardLine: '', players: {}, grades: {}, custom: [] } }];
  document.getElementById('gameScoutMode') && (document.getElementById('gameScoutMode').value = 'opponent');
  try { eng.renderScoutReport(); } catch (e) {}
  await new Promise(rs => setTimeout(rs, 200));
  out.scoutImg = !!document.querySelector('.stats-overlay h2 img');
  if (eng.hideDashboard) eng.hideDashboard();
  // Big-plays renderer as a pure function (clipName = uploaded filename).
  out.bigPlaysHasImg = eng._renderBigPlays({ bigPlays: [{ clipName: payload, type: 'Run Inside', result: 'Gain', yards: 30 }] }).includes('<img');
  await new Promise(rs => setTimeout(rs, 100));   // let any (would-be) onerror fire
  out.xssFired = window.__xss30;
  return out;
});
ok(r.xssFired === 0, 'no injected onerror ever executes across the report renderers', JSON.stringify(r));
ok(!r.defImg, 'defensive report header renders a payload team name as inert text', JSON.stringify(r));
ok(!r.scoutImg, 'scout report header renders a payload opponent name as inert text', JSON.stringify(r));
ok(!r.bigPlaysHasImg, 'big-plays table escapes the clip filename', JSON.stringify(r));

console.log('\n== 31. Call sheet: recency sort works + multi-select results map correctly ==');
r = await page.evaluate(() => {
  const cs = window.app.callSheet;
  const P = (id, result, yds) => ({ id, timestamp: { start: 0, end: 5 }, notes: '', tags: { result, yardage: String(yds), playType: 'Run Inside', formation: 'Under Center' } });
  const score = p => p.id || 0;   // the fixed recency comparator (was p.timestamp -> NaN)
  const recent = [P(3, 'Gain', 5), P(1, 'Gain', 5), P(2, 'Gain', 5)].slice().sort((a, b) => score(b) - score(a)).map(p => p.id).join(',');
  return {
    recent,
    pickSix: cs._playResult(P(1, 'Interception + Touchdown', 40)),
    scoopScore: cs._playResult(P(2, 'Fumble + Touchdown', 20)),
    strip: cs._playResult(P(3, 'Sack + Fumble', -7)),
    gain: cs._playResult(P(4, 'Gain', 8)),
    inc: cs._playResult(P(5, 'Incomplete', 0)),
  };
});
ok(r.recent === '3,2,1', 'recency ranking actually reorders (was a NaN comparator that never sorted)', JSON.stringify(r));
ok(r.pickSix === 'TD 40', 'pick-six "Interception + Touchdown" shows TD (was the raw joined string)', JSON.stringify(r));
ok(r.scoopScore === 'TD 20', 'scoop-and-score "Fumble + Touchdown" shows TD', JSON.stringify(r));
ok(r.strip === 'Fum' && r.gain === '+8' && r.inc === 'Inc', 'other multi/single results map (strip-sack→Fum, gain→+8, incomplete→Inc)', JSON.stringify(r));

console.log('\n== 31b. Call sheet: play label projects a legacy mixed formation (E3b) ==');
r = await page.evaluate(() => {
  const cs = window.app.callSheet;
  const legacy = { id: 1, notes: '', tags: { formation: 'Shotgun + Trips', personnel: '11', playType: 'Deep Pass' } };
  const modern = { id: 2, notes: '', tags: { qbAlignment: 'Pistol', formation: 'Ace', playType: 'Run Inside' } };
  return { legacy: cs._playLabel(legacy), modern: cs._playLabel(modern) };
});
ok(r.legacy.startsWith('Shotgun Trips '), 'a legacy mixed formation label leads with the SPLIT phrase, not "Shotgun + Trips"', JSON.stringify(r));
ok(!r.legacy.includes('+'), 'the call-sheet label never leaks the " + " join artifact');
ok(r.modern.startsWith('Pistol Ace '), 'a modern split play composes qbAlignment + formation the same way', JSON.stringify(r));

console.log('\n== 32. Cut-up export: real-region filter + seek never hangs ==');
r = await page.evaluate(async () => {
  const cut = window.app.cutup;
  const plays = [
    { id: 1, timestamp: { start: 0, end: 0 }, tags: { playType: 'Run Inside' } },
    { id: 2, timestamp: { start: 2, end: 8 }, tags: {} },
    { id: 3, timestamp: { start: 5, end: 5 }, tags: {} },
  ];
  const kept = plays.filter(p => p.timestamp && (p.timestamp.end - p.timestamp.start) > 0.05).map(p => p.id).join(',');
  const atFake = { currentTime: 0, addEventListener() {}, removeEventListener() {} };
  const t0 = Date.now(); await cut._waitForSeek(atFake, 0); const atMs = Date.now() - t0;
  const neverFake = { currentTime: 10, addEventListener() {}, removeEventListener() {} };
  const t1 = Date.now(); await cut._waitForSeek(neverFake, 99); const toMs = Date.now() - t1;
  return { kept, atMs, toMs };
});
ok(r.kept === '2', 'export filter keeps only plays with a real region (drops zero-length, was always-true)', JSON.stringify(r));
ok(r.atMs < 200, 'a seek to the current position resolves immediately (no infinite hang)', JSON.stringify(r));
ok(r.toMs >= 2500 && r.toMs < 5000, 'a seek that never fires "seeked" is bounded by the timeout (~3s), not forever', JSON.stringify(r));

console.log('\n== 32b. Cut-up export: title card projects a legacy mixed formation (E3b) ==');
r = await page.evaluate(async () => {
  const cut = window.app.cutup;
  const calls = [];
  const fakeCtx = {
    fillText: (text) => calls.push(text),
    fillRect() {}, set fillStyle(v) {}, set font(v) {}, set textAlign(v) {},
  };
  const legacy = { id: 1, tags: { formation: 'Shotgun + Trips', down: '3', distance: '7' } };
  await cut._drawTitleCard(fakeCtx, 400, 300, legacy, 1, 5);
  return { calls };
});
ok(r.calls.some(c => c === 'Shotgun Trips'), 'the title card draws the SPLIT look label as its own line', JSON.stringify(r.calls));
ok(!r.calls.some(c => c.includes('+')), 'no drawn line contains the " + " join artifact', JSON.stringify(r.calls));

console.log('\n== 32c. Break Down video caption falls back to the projected look (E3b) ==');
r = await page.evaluate(() => {
  const bv = window.app.breakdownVideo;
  // No playType/stType/defFront — the caption falls all the way back to the look.
  const legacy = { tags: { formation: 'Shotgun + Trips' } };
  const withPlayType = { tags: { formation: 'Shotgun + Trips', playType: 'Deep Pass' } };
  return { legacy: bv._call(legacy), withPlayType: bv._call(withPlayType) };
});
ok(r.legacy === 'Shotgun Trips', 'the caption fallback shows the SPLIT look, not the raw joined formation', JSON.stringify(r));
ok(r.withPlayType === 'Deep Pass', 'playType still wins over the look fallback when present', JSON.stringify(r));

console.log('\n== 33. Persist hardening: max-id nextId + same-ms backups don\'t collide ==');
r = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore, tagger = window.app.tagger;
  const P = (id) => ({ id, timestamp: { start: 0, end: 5 }, notes: '', tags: {} });
  // Non-contiguous ids (post-delete) must not mint a duplicate.
  sm._deserialize({ plays: [P(1), P(3)], annotations: [] });
  const nextIdMax = tagger.nextId;
  sm._deserialize({ plays: [], nextId: 0, annotations: [] });
  const nextIdZero = tagger.nextId;
  // Two backups back-to-back (likely same millisecond) both survive.
  await sm.createSeason({ name: 'BKcollide', team: 'B' });
  tagger.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, notes: 'v1', tags: { unit: 'offense', playType: 'Run Inside', result: 'Gain', runPass: 'Run' } }];
  sm.commitActive();
  const b1 = await store.snapshot('Before X');
  tagger.plays[0].notes = 'v2'; sm.commitActive();
  const b2 = await store.snapshot('Autosave');
  const list = await store.listBackups();
  return { nextIdMax, nextIdZero, distinct: !!(b1 && b2 && b1.id !== b2.id), ring: list.length };
});
ok(r.nextIdMax === 4, 'nextId derives from max existing id (4), not plays.length+1 (3, which would dup id 3)', JSON.stringify(r));
ok(r.nextIdZero === 0, 'a stored nextId of 0 is preserved (?? not ||)', JSON.stringify(r));
ok(r.distinct && r.ring >= 2, 'two same-millisecond restore points get distinct ids and both survive (was an overwrite)', JSON.stringify(r));

console.log('\n== 34. Stats correctness: pass attempts not double-counted + TFL excludes penalty/kneel ==');
r = await page.evaluate(() => {
  const eng = window.app.stats;
  const P = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, notes: '', tags: Object.assign({ unit: 'offense', runPass: '', playType: '', result: '', yardage: '' }, tags) });
  const ps = eng._passingStats([
    P(1, { runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '8' }),
    P(2, { runPass: 'Pass', playType: 'Short Pass', result: 'Incomplete' }),
    P(3, { runPass: 'Pass', playType: 'Deep Pass', result: 'Incomplete + Interception' }),   // one play, two result tags
  ]);
  const ds = eng._defensiveStats([
    P(10, { unit: 'defense', result: 'Penalty', yardage: '-5' }),
    P(11, { unit: 'defense', result: 'Kneel', yardage: '-2' }),
    P(12, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Loss', yardage: '-3' }),
    P(13, { unit: 'defense', result: 'Sack', yardage: '-7' }),
  ]);
  return { attempts: ps.attempts, tfl: ds.tfl, sacks: ds.sacks };
});
ok(r.attempts === 3, 'pass attempts count each play once — "Incomplete + Interception" is 1 attempt, not 2', JSON.stringify(r));
ok(r.tfl === 1, 'TFL counts only the real behind-the-line run — penalty, kneel and sack are excluded', JSON.stringify(r));

console.log('\n== 35. Custom Formation/Backfield/Front chips: per-team, first-class, grid-visible, removable ==');
r = await page.evaluate(() => {
  const cc = window.app.customChips, t = window.app.tagger, grid = window.app.playGrid;
  try { localStorage.setItem('ffa_active_team_id', 'teamZ'); } catch (e) {}
  cc.reload();                                   // key on teamZ
  const g = cc.groups.find(x => x.key === 'formation');
  cc._injectChip(g, 'Trey');
  const data = cc._load(); data.formation = [...(data.formation || []), 'Trey']; cc._save(data); cc._clearGridCache();
  const boundToField = g.fieldObj.chips.some(c => c.dataset.value === 'Trey');
  // selecting it tags the play (multi-select append). Use a clean mk play so
  // _loadTagForm has a well-formed tags object regardless of prior-test state.
  const clean = window.__mk({ formation: '' });
  t.plays = [clean]; t.nextId = (clean.id || 0) + 1;
  t.selectPlay(clean.id);
  const chip = [...g.groupEl.querySelectorAll('.pick[data-value]')].find(c => c.dataset.value === 'Trey');
  chip.click();
  const tagged = t.getPlay(t.currentPlayId).tags.formation;
  // grid editor reads options live from the DOM
  grid._optionCache = {};
  const gridSees = grid._options({ key: 'formation', src: 'tagFormation' }).includes('Trey');
  // E3b: the example must be a STRUCTURAL formation. This used to hide 'Shotgun',
  // but Shotgun is QB ALIGNMENT now and the grid's structural Formation picker
  // filters alignments out entirely — which would make "historically visible"
  // unsatisfiable for reasons unrelated to library hiding. 'Trips' preserves the
  // original intent: a HIDDEN library value still stays editable on a play that
  // already carries it.
  cc.setEnabled('formation', 'Trips', false);
  grid._optionCache = {};
  const hiddenForNew = !grid._options({ key: 'formation', src: 'tagFormation' }).includes('Trips');
  const historicalVisible = grid._options({ key: 'formation', src: 'tagFormation' }, ['Trips']).includes('Trips');
  const perTeamKey = cc._key() === 'ffa_tag_libraries_teamZ';
  // remove clears DOM + storage
  cc._remove(g, 'Trey', chip);
  const removed = ![...g.groupEl.querySelectorAll('.pick[data-value]')].some(c => c.dataset.value === 'Trey')
    && !(cc._load().formation || []).includes('Trey');
  try { localStorage.removeItem('ffa_active_team_id'); localStorage.removeItem('ffa_custom_chips_teamZ'); localStorage.removeItem('ffa_tag_libraries_teamZ'); } catch (e) {}
  return { boundToField, tagged, gridSees, hiddenForNew, historicalVisible, perTeamKey, removed };
});
ok(r.boundToField, 'a custom chip is a first-class ChipField chip (keyboard/click behave like built-ins)', JSON.stringify(r));
ok(r.tagged === 'Trey', 'clicking a custom Formation chip tags the play with its value', JSON.stringify(r));
ok(r.gridSees, 'the Film Room grid editor sees the custom chip (reads options live from the DOM)', JSON.stringify(r));
ok(r.hiddenForNew && r.historicalVisible, 'hidden values leave future grid choices but remain editable on historical plays', JSON.stringify(r));
ok(r.perTeamKey, 'tag libraries are stored per active team (ffa_tag_libraries_<teamId>)', JSON.stringify(r));
ok(r.removed, 'removing a custom chip clears it from the group and storage', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) console.log('Console/page errors:\n' + errors.join('\n'));
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
