/* E2E onboarding harness — drives the built bundle headless through the ONE
   product route (the redesigned workspace shell; the classic layout was retired
   2026-07-23). Flow: first-run shell Home -> Set up team (library overlay) ->
   checklist -> demo season -> shell Home games -> open game -> stats -> label
   survival -> reload persistence -> delete demo -> real season + New Game on
   Home -> upgrade path (existing season, no team profile). Run: node _e2e.mjs

   NOTE ON SELECTORS. Team/season MANAGEMENT still lives in the library overlay
   (#libraryOverlay), reached from Home via [data-ws-action="seasons"]. GAME entry
   is the shell Home film inbox (#wsFilmList [data-ws-game]); the old schedule
   grid is retired. Stats open as a body-level overlay via app.stats. */
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

const $ = (sel) => page.evaluate(s => {
  const el = document.querySelector(s);
  if (!el) return null;
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return { exists: true, visible: cs.display !== 'none' && cs.visibility !== 'hidden' && r.width > 0 && r.height > 0,
           text: (el.textContent || '').trim().slice(0, 120), hidden: el.hidden || el.classList.contains('hidden') };
}, sel);
const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);
// Team/season management lives in the library overlay, opened from Home.
const openLibrary = async () => {
  const v = await $('#libraryOverlay');
  if (!(v && v.visible)) {
    await page.evaluate(() => document.querySelector('[data-ws-action="seasons"]')?.click());
    await sleep(500);
  }
};
const backHome = async () => { await page.evaluate(() => window.app.workspaceShell.show('home')); await sleep(400); };
// Open the Nth game from the shell Home film inbox (the sole game-entry route).
const openHomeGame = async (i = 0) => {
  await page.evaluate(n => { const b = document.querySelectorAll('#wsFilmList [data-ws-game]')[n]; if (b) b.click(); }, i);
  await sleep(700);
};
// The full team report now has its own shell destination (Reports), and
// #statsDashboard is re-parented into it. Clicking the canonical #btnShowStats
// both routes there AND sets ffa_seen_stats for real data, so this drives the
// real product path — no outlet poking required.
const showStats = async () => {
  await page.evaluate(() => document.getElementById('btnShowStats')?.click());
  await sleep(800);
};

console.log('\n== 1. Fresh first run ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(700);
let r = await $('#wsHome');
ok(r && r.visible, 'shell Home shown on launch (one product route)');
r = await $('#wsResume');
ok(/Set up team/i.test(r?.text || ''), 'empty Home offers Set up team', r && r.text);
await openLibrary();
r = await $('#libraryOverlay');
ok(r && r.visible, 'library overlay opens from Home');
r = await $('#teamSetup');
ok(r && r.visible, 'team setup prompt shown (no team yet)');
r = await $('#teamCard');
ok(r && r.hidden, 'team card hidden before setup');
r = await $('#getStartedChecklist');
ok(r && r.hidden, 'checklist hidden before team exists');

console.log('\n== 2. Team setup ==');
await page.type('#teamSetupName', 'Mavericks');
await page.select('#teamSetupColor', 'navy');
await click('#btnTeamSetupSave');
await sleep(400);
r = await $('#teamCard');
ok(r && r.visible, 'team card appears after setup');
r = await $('#teamCardName');
ok(r && r.text === 'Mavericks', 'team card shows name', r && r.text);
r = await $('#teamSetup');
ok(r && r.hidden, 'setup prompt hidden after setup');
r = await $('#getStartedChecklist');
ok(r && r.visible, 'Get Started checklist appears');
r = await page.evaluate(() => [...document.querySelectorAll('.gs-item.done .gs-label')].map(e => e.textContent));
ok(r.length === 1 && /team/i.test(r[0]), 'exactly the team step is checked', JSON.stringify(r));

console.log('\n== 3. Explore demo season ==');
r = await $('#btnExploreDemo');
ok(/Explore sample season/i.test(r?.text || ''), 'sample CTA starts as Explore sample season', r && r.text);
await click('#btnExploreDemo');
await sleep(900);
r = await $('#libraryOverlay');
ok(r && (r.hidden || !r.visible), 'exploring demo closes the library overlay');
r = await $('#wsHome');
ok(r && r.visible, 'lands on shell Home (games in the film inbox, not a schedule grid)');
r = await page.evaluate(() => document.querySelectorAll('#wsFilmList [data-ws-game]').length);
ok(r === 2, 'Home film inbox shows 2 demo games', String(r));
// Self-review finding S4 (2026-07-23): the retired schedule grid had a `.sch-score`
// W/L pill and this harness asserted it RENDERED. The shell has no per-game W/L
// pill, and an earlier rewrite quietly downgraded this to reading gameInfo — which
// tests the fixture, not the product. Home's game preview does render a real score
// (#wsScoreValue via _renderGamePreview), so assert THAT: select each demo game
// through its Home preview button and read the rendered score text.
r = await page.evaluate(async () => {
  const out = [];
  const rows = [...document.querySelectorAll('#wsFilmList [data-ws-preview]')];
  for (const btn of rows) {
    btn.click();
    await new Promise(res => setTimeout(res, 120));
    out.push(document.getElementById('wsScoreValue')?.textContent || '');
  }
  return out;
});
const parsed = r.map(t => {
  const m = /^(\d+)\D+(\d+)$/.exec(String(t).trim());
  return m ? { us: Number(m[1]), them: Number(m[2]) } : null;
});
ok(parsed.length === 2 && parsed.every(Boolean),
  'Home preview RENDERS a real score for each demo game', JSON.stringify(r));
ok(parsed.every(Boolean) && parsed.some(x => x.us > x.them) && parsed.some(x => x.us < x.them),
  'the rendered scores show one win and one loss', JSON.stringify(r));

console.log('\n== 4. Open a demo game + shell context ==');
await openHomeGame(0);
r = await $('#libraryOverlay');
ok(r && (r.hidden || !r.visible), 'overlay stays closed after opening a game from Home');
r = await page.evaluate(() => window.app.workspace.currentRoute());
ok(r === 'breakdown', 'opening a game lands in Break Down', r);
r = await page.evaluate(() => ({
  team: document.getElementById('wsContextTeam')?.textContent,
  season: document.getElementById('wsContextSeason')?.textContent,
  game: document.getElementById('wsContextGame')?.textContent }));
ok(r.team === 'Mavericks', 'shell context team = Mavericks', r.team);
ok(/Demo/.test(r.season || ''), 'shell context season = demo name', r.season);
ok(/Riverside|Hawks/.test(r.game || ''), 'shell context game = vs Riverside Hawks', r.game);

console.log('\n== 5. Stats dashboard on demo data ==');
await showStats();
r = await $('#statsDashboard .stats-overlay');   // parent has zero rect (fixed child)
ok(r && r.visible, 'stats dashboard opens');
r = await page.evaluate(() => document.getElementById('statsDashboard').textContent.includes('Marcus Carter'));
ok(r, 'player names from label overlay (#22 Marcus Carter)');
r = await page.evaluate(() => !localStorage.getItem('ffa_seen_stats'));
ok(r, 'demo stats view does NOT set ffa_seen_stats');
r = await page.evaluate(() => (JSON.parse(localStorage.getItem('ffa_roster') || '[]')).length === 0);
ok(r, 'global roster untouched by demo');

console.log('\n== 6. Labels survive Season Stats render (the _fixedLabels fix) ==');
await page.evaluate(() => { window.app.season._renderAll(); });   // the path that nulls _seasonLabels
await showStats();
r = await page.evaluate(() => document.getElementById('statsDashboard').textContent.includes('Marcus Carter'));
ok(r, 'names still present after season view render');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));

console.log('\n== 7. Back to Team Home: demo badge + checklist state ==');
await backHome();
await openLibrary();
r = await page.evaluate(() => [...document.querySelectorAll('.season-card-badge')].map(e => e.textContent));
ok(r.some(t => /Demo/.test(t)), 'demo card carries Demo badge', JSON.stringify(r));
r = await page.evaluate(() => [...document.querySelectorAll('.gs-item.done .gs-label')].map(e => e.textContent));
ok(r.length === 1, 'demo does NOT complete season/play/stats steps', JSON.stringify(r));

console.log('\n== 8. Reload persistence + demo reopen ==');
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
await openLibrary();
r = await $('#teamCard');
ok(r && r.visible, 'team card persists after reload');
r = await page.evaluate(() => [...document.querySelectorAll('.season-card')].length);
ok(r === 1, 'demo season persists in library', String(r));
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(800);
r = await $('#wsHome');
ok(r && r.visible, 'reopening demo lands on shell Home');
await openHomeGame(1);
await showStats();
r = await page.evaluate(() => document.getElementById('statsDashboard').textContent.includes('Marcus Carter'));
ok(r, 'label overlay re-applied after reload (game 2)');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));

console.log('\n== 9. Delete demo via UI confirm ==');
await backHome();
await openLibrary();
await page.evaluate(() => document.querySelector('.season-card-del').click());
await sleep(300);
r = await page.evaluate(() => document.querySelector('.ffa-confirm-msg')?.textContent || '');
ok(/demo/i.test(r) && /untouched/i.test(r), 'demo-specific confirm copy', r);
await page.evaluate(() => document.querySelector('[data-act="ok"]').click());
await sleep(500);
r = await page.evaluate(() => document.querySelectorAll('.season-card').length);
ok(r === 0, 'demo removed from library', String(r));
r = await page.evaluate(() => !localStorage.getItem('ffa_demo_season_id'));
ok(r, 'demo flag cleared');
r = await $('#btnExploreDemo');
ok(/Explore sample season/i.test(r?.text || ''), 'after deleting sample, CTA returns to Explore sample season', r && r.text);

console.log('\n== 10. Real season flow + New Game on Home + checklist completion ==');
await click('#btnNewSeasonToggle');
await sleep(200);
await page.type('#newSeasonYear', '2026');
await page.type('#newSeasonTeam', 'Mavericks');
await click('#btnNewSeasonCreate');
await sleep(800);
r = await $('#wsHome');
ok(r && r.visible, 'new season lands on shell Home');
// New Game is a first-class Home action now (finding 4), not buried under More.
r = await $('[data-ws-action="new-game"]');
ok(r && r.visible, 'Home exposes a direct New Game action', JSON.stringify(r));
await click('[data-ws-action="new-game"]');
await sleep(700);
r = await page.evaluate(() => window.app.workspace.currentRoute());
ok(r === 'breakdown', 'New Game opens straight into Break Down', r);
// tag one play directly through the tagger (no video needed for the data model)
await page.evaluate(() => {
  const t = window.app.tagger;
  t.plays.push({ id: 1, timestamp: { start: 0, end: 5 }, clipId: null,
    tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7',
            unit: 'offense', players: {}, grades: {}, custom: [] }, notes: '', analysis: null });
  t.nextId = 2;
  window.app.storage._commitAndPersist();
});
await showStats();
r = await page.evaluate(() => localStorage.getItem('ffa_seen_stats') === '1');
ok(r, 'real-data stats view sets ffa_seen_stats');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));
await backHome();
await openLibrary();
r = await page.evaluate(() => [...document.querySelectorAll('.season-card-badge')].map(e => e.textContent));
ok(!r.some(t => /Demo/.test(t)), 'real season is not badged Demo after sample deletion', JSON.stringify(r));
r = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.gs-item')];
  return { total: items.length, done: items.filter(i => i.classList.contains('done')).length,
           hidden: document.getElementById('getStartedChecklist').classList.contains('hidden') };
});
ok(r.hidden || r.done >= 4, 'checklist near/at completion with real data', JSON.stringify(r));

console.log('\n== 10b. Corrupt demo pointer cannot mark a real season as demo ==');
await page.evaluate(() => {
  const realId = document.querySelector('.season-card')?.dataset.id;
  if (realId) localStorage.setItem('ffa_demo_season_id', realId);
});
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
await openLibrary();
r = await page.evaluate(() => ({
  pointer: localStorage.getItem('ffa_demo_season_id'),
  badges: [...document.querySelectorAll('.season-card-badge')].map(e => e.textContent),
  cards: [...document.querySelectorAll('.season-card')].map(c => ({ id: c.dataset.id, text: c.textContent }))
}));
ok(!r.pointer, 'stale demo pointer to real season is cleared', JSON.stringify(r));
ok(!r.badges.some(t => /Demo/.test(t)), 'corrupt pointer does not badge real season as Demo', JSON.stringify(r));

console.log('\n== 10c. Missing demo pointer resets to sample CTA ==');
await page.evaluate(() => { localStorage.setItem('ffa_demo_season_id', 'missing-demo-season'); });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
await openLibrary();
r = await page.evaluate(() => ({
  pointer: localStorage.getItem('ffa_demo_season_id'),
  cta: document.getElementById('btnExploreDemo')?.textContent || '',
  badges: [...document.querySelectorAll('.season-card-badge')].map(e => e.textContent),
}));
ok(!r.pointer, 'missing demo pointer is cleared', JSON.stringify(r));
ok(/Explore sample season/i.test(r.cta), 'missing demo pointer leaves CTA as Explore sample season', JSON.stringify(r));
ok(!r.badges.some(t => /Demo/.test(t)), 'missing demo pointer leaves no Demo badge', JSON.stringify(r));

console.log('\n== 11. Upgrade path: existing season, NO team profile ==');
// Simulate a genuine pre-team-hub install: no profile AND no team registry.
// Since the wipe-recovery fix, the library REBUILDS team identity from the
// season files instead of showing first-run setup over existing data.
await page.evaluate(() => {
  localStorage.removeItem('ffa_team_profile');
  localStorage.removeItem('ffa_teams');
  localStorage.removeItem('ffa_active_team_id');
});
await page.reload({ waitUntil: 'networkidle0' });
await sleep(900);
await openLibrary();
r = await $('#teamSetup');
ok(r && (r.hidden || !r.visible), 'upgrade user does NOT see setup over existing data (auto-recovery)', JSON.stringify(r));
// open their existing season straight from the card
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(800);
r = await $('#wsHome');
ok(r && r.visible, 'existing season opens to shell Home');
r = await $('#teamSetup');
ok(r && (r.hidden || !r.visible), 'team setup NOT stacked on the workspace', JSON.stringify(r));

console.log('\n== 12. Checklist roster action with no season open ==');
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
await openLibrary();
await page.type('#teamSetupName', 'TestTeam');
await click('#btnTeamSetupSave');
await sleep(400);
await page.evaluate(() => { [...document.querySelectorAll('.gs-item')].find(i => i.dataset.step === 'roster')?.click(); });
await sleep(400);
r = await page.evaluate(() => {
  const overlay = document.getElementById('libraryOverlay');
  const drawer = document.getElementById('settingsDrawer');
  const oVis = !overlay.classList.contains('hidden');
  const dOpen = drawer.classList.contains('open');
  const oZ = parseInt(getComputedStyle(overlay).zIndex || '0', 10);
  const dZ = parseInt(getComputedStyle(drawer).zIndex || '0', 10);
  return { oVis, dOpen, oZ, dZ, usable: dOpen && (!oVis || dZ > oZ) };
});
ok(r.usable, 'roster drawer actually reachable from checklist', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
