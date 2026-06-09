/* E2E onboarding harness — drives the built bundle headless through:
   first-run → team setup → checklist → demo season → schedule → game → stats
   → label-survival after Season Stats → reload persistence → delete demo →
   upgrade path (existing season, no team profile). Run: node _e2e.mjs */
import puppeteer from 'puppeteer';

const URL = 'file:///home/user/Charlie/football-film-analyzer.html';
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

console.log('\n== 1. Fresh first run ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
let r = await $('#libraryOverlay');
ok(r && r.visible, 'library overlay opens on launch');
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
await click('#btnExploreDemo');
await sleep(900);
r = await $('#libraryScheduleView');
ok(r && r.visible, 'lands on schedule view');
r = await page.evaluate(() => [...document.querySelectorAll('.sch-row')].map(tr => tr.querySelector('.sch-name')?.textContent));
ok(r.length === 2, 'schedule shows 2 demo games', JSON.stringify(r));
r = await page.evaluate(() => [...document.querySelectorAll('.sch-score')].map(e => e.className + ':' + e.textContent));
ok(r.length === 2 && r.some(x => x.includes('win')) && r.some(x => x.includes('loss')), 'W and L pills render', JSON.stringify(r));

console.log('\n== 4. Open a demo game + breadcrumb ==');
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(600);
r = await $('#libraryOverlay');
ok(r && r.hidden, 'overlay closes after opening game');
r = await $('#breadcrumb');
ok(r && r.visible, 'breadcrumb visible');
r = await page.evaluate(() => ({
  team: document.getElementById('bcTeamText')?.textContent,
  season: document.getElementById('bcSeasonText')?.textContent,
  game: document.getElementById('bcGameText')?.textContent }));
ok(r.team === 'Mavericks', 'breadcrumb team = Mavericks', r.team);
ok(/Demo/.test(r.season || ''), 'breadcrumb season = demo name', r.season);
ok(/Riverside|Hawks/.test(r.game || ''), 'breadcrumb game = vs Riverside Hawks', r.game);

console.log('\n== 5. Stats dashboard on demo data ==');
await click('#btnShowStats');
await sleep(900);
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
await click('#btnShowStats');
await sleep(700);
r = await page.evaluate(() => document.getElementById('statsDashboard').textContent.includes('Marcus Carter'));
ok(r, 'names still present after season view render');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));

console.log('\n== 7. Back to Team Home: demo badge + checklist state ==');
await click('#bcHome');
await sleep(500);
r = await page.evaluate(() => [...document.querySelectorAll('.season-card-badge')].map(e => e.textContent));
ok(r.some(t => /Demo/.test(t)), 'demo card carries Demo badge', JSON.stringify(r));
r = await page.evaluate(() => [...document.querySelectorAll('.gs-item.done .gs-label')].map(e => e.textContent));
ok(r.length === 1, 'demo does NOT complete season/play/stats steps', JSON.stringify(r));

console.log('\n== 8. Reload persistence + demo reopen ==');
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
r = await $('#teamCard');
ok(r && r.visible, 'team card persists after reload');
r = await page.evaluate(() => [...document.querySelectorAll('.season-card')].length);
ok(r === 1, 'demo season persists in library', String(r));
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(800);
r = await $('#libraryScheduleView');
ok(r && r.visible, 'reopening demo lands on schedule');
await page.evaluate(() => document.querySelectorAll('.sch-row')[1].click());
await sleep(500);
await click('#btnShowStats');
await sleep(800);
r = await page.evaluate(() => document.getElementById('statsDashboard').textContent.includes('Marcus Carter'));
ok(r, 'label overlay re-applied after reload (game 2)');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));

console.log('\n== 9. Delete demo via UI confirm ==');
await click('#bcHome');
await sleep(400);
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

console.log('\n== 10. Real season flow + checklist completion ==');
await click('#btnNewSeasonToggle');
await sleep(200);
await page.type('#newSeasonYear', '2026');
await page.type('#newSeasonTeam', 'Mavericks');
await click('#btnNewSeasonCreate');
await sleep(700);
r = await $('#libraryScheduleView');
ok(r && r.visible, 'new season lands on (empty) schedule');
await click('#btnScheduleNewGame');
await sleep(500);
// tag one play directly through the tagger (no video needed for the data model)
await page.evaluate(() => {
  const t = window.app.tagger;
  t.plays.push({ id: 1, timestamp: { start: 0, end: 5 }, clipId: null,
    tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7',
            unit: 'offense', players: {}, grades: {}, custom: [] }, notes: '', analysis: null });
  t.nextId = 2;
  window.app.storage._commitAndPersist();
});
await click('#btnShowStats');
await sleep(700);
r = await page.evaluate(() => localStorage.getItem('ffa_seen_stats') === '1');
ok(r, 'real-data stats view sets ffa_seen_stats');
await page.evaluate(() => document.getElementById('statsDashboard').classList.add('hidden'));
await click('#bcHome');
await sleep(500);
r = await page.evaluate(() => {
  const items = [...document.querySelectorAll('.gs-item')];
  return { total: items.length, done: items.filter(i => i.classList.contains('done')).length,
           hidden: document.getElementById('getStartedChecklist').classList.contains('hidden') };
});
ok(r.hidden || r.done >= 4, 'checklist near/at completion with real data', JSON.stringify(r));

console.log('\n== 11. Upgrade path: existing season, NO team profile ==');
await page.evaluate(() => { localStorage.removeItem('ffa_team_profile'); });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
r = await $('#teamSetup');
ok(r && r.visible, 'upgrade user sees team setup');
// open their existing season straight from the card
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(700);
r = await $('#libraryScheduleView');
ok(r && r.visible, 'existing season opens to schedule');
r = await $('#teamSetup');
ok(r && (r.hidden || !r.visible), 'team setup NOT stacked on schedule view', JSON.stringify(r));

console.log('\n== 12. Checklist roster action with no season open ==');
await page.evaluate(() => { localStorage.clear(); });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(700);
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
