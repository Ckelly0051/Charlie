/* E2E Film Room harness — drives the built bundle headless through the
   Phase 2 play grid: render on demo data, row click-to-select, chip filters,
   bulk selection + Watch fallback, collapse persistence, narrow-screen
   default, switch-team back-out. Run after build:
     bash build.sh && node tools/e2e-film-room.mjs */
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

const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== 1. Setup: team + demo season + open game ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);

console.log('\n== 2. Grid renders on demo data ==');
let r = await page.evaluate(() => {
  const sec = document.getElementById('playGridSection');
  return { hidden: sec.hidden, rows: document.querySelectorAll('#pgRows .pg-row').length,
           plays: window.app.tagger.plays.length,
           collapsed: sec.classList.contains('collapsed') };
});
ok(!r.hidden, 'grid section visible with plays');
ok(r.rows === r.plays && r.rows > 50, 'one row per play', JSON.stringify(r));
ok(!r.collapsed, 'expanded by default on widescreen');

console.log('\n== 3. Row click selects the play (click-to-seek path) ==');
r = await page.evaluate(() => {
  const row = document.querySelectorAll('#pgRows .pg-row')[4];
  const id = parseInt(row.dataset.id, 10);
  row.click();
  return { id, cur: window.app.tagger.currentPlayId,
           hl: document.querySelector('#pgRows .pg-row.is-current')?.dataset.id };
});
ok(r.cur === r.id, 'row click sets currentPlayId', JSON.stringify(r));
ok(parseInt(r.hl, 10) === r.id, 'clicked row highlighted');
r = await page.evaluate(() => {
  // selecting elsewhere (play selector path) moves the grid highlight too
  const other = window.app.tagger.plays[9].id;
  window.app.tagger.selectPlay(other);
  return { other, hl: parseInt(document.querySelector('#pgRows .pg-row.is-current')?.dataset.id, 10) };
});
ok(r.hl === r.other, 'external selectPlay moves grid highlight', JSON.stringify(r));

console.log('\n== 4. Filters ==');
r = await page.evaluate(async () => {
  const chip = (group, val) => document.querySelector(`.pg-fgroup[data-group="${group}"] .pg-chip[data-val="${val}"]`);
  const rows = () => document.querySelectorAll('#pgRows .pg-row').length;
  const all = rows();
  chip('downs', '3').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const third = rows();
  const expectedThird = window.app.tagger.plays.filter(p => String(p.tags.down) === '3').length;
  chip('rp', 'Pass').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const thirdPass = rows();
  const showing = document.getElementById('pgShowing').textContent;
  document.getElementById('pgClear').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cleared = rows();
  return { all, third, expectedThird, thirdPass, showing, cleared };
});
ok(r.third === r.expectedThird && r.third < r.all, 'down filter narrows to 3rd downs', JSON.stringify(r));
ok(r.thirdPass <= r.third, 'stacking Pass narrows further', JSON.stringify(r));
ok(new RegExp(`${r.thirdPass} of ${r.all}`).test(r.showing), '"X of Y" count shown', r.showing);
ok(r.cleared === r.all, 'Clear restores all rows');

r = await page.evaluate(async () => {
  const chip = document.querySelector('.pg-fgroup[data-group="flags"] .pg-chip[data-val="td"]');
  chip.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rows = document.querySelectorAll('#pgRows .pg-row').length;
  const expected = window.app.tagger.plays.filter(p =>
    String(p.tags.result || '').split(/\s*\+\s*/).map(s => s.trim()).includes('Touchdown')).length;
  document.getElementById('pgClear').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { rows, expected };
});
ok(r.rows === r.expected && r.rows > 0, 'TD flag filter matches result splits', JSON.stringify(r));

r = await page.evaluate(async () => {
  const chip = document.querySelector('.pg-fgroup[data-group="flags"] .pg-chip[data-val="untagged"]');
  chip.click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const rows = document.querySelectorAll('#pgRows .pg-row').length;
  const emptyShown = !document.getElementById('pgEmpty').classList.contains('hidden');
  document.getElementById('pgClear').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  return { rows, emptyShown };
});
ok(r.rows === 0 && r.emptyShown, 'Untagged on fully-tagged demo → empty state', JSON.stringify(r));

console.log('\n== 5. Bulk selection + Watch fallback (no video) ==');
r = await page.evaluate(async () => {
  const boxes = document.querySelectorAll('#pgRows .pg-check');
  boxes[0].click(); boxes[1].click();
  const label = document.getElementById('pgWatch').textContent;
  const firstId = parseInt(document.querySelectorAll('#pgRows .pg-row')[0].dataset.id, 10);
  document.getElementById('pgWatch').click();
  await new Promise(r => setTimeout(r, 150));
  // demo has no film → fallback selects the first pooled play, no cut-up banner
  return { label, firstId, cur: window.app.tagger.currentPlayId,
           banner: !!document.querySelector('.cutup-banner'),
           cutupActive: window.app.cutupPlayer.active };
});
ok(/Watch \(2\)/.test(r.label), 'Watch button shows selection count', r.label);
ok(!r.cutupActive && r.cur === r.firstId, 'no-video Watch falls back to selecting first play', JSON.stringify(r));
r = await page.evaluate(async () => {
  document.getElementById('pgCheckAll').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const total = document.querySelectorAll('#pgRows .pg-check').length;
  const checked = document.querySelectorAll('#pgRows .pg-check:checked').length;
  const label = document.getElementById('pgWatch').textContent;
  document.getElementById('pgCheckAll').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const after = document.querySelectorAll('#pgRows .pg-check:checked').length;
  return { total, checked, label, after };
});
ok(r.checked === r.total && new RegExp(`\\(${r.total}\\)`).test(r.label), 'select-all checks every visible row', JSON.stringify(r));
ok(r.after === 0, 'select-all toggles off');

console.log('\n== 6. Collapse persistence ==');
await click('#pgCollapse');
r = await page.evaluate(() => ({
  collapsed: document.getElementById('playGridSection').classList.contains('collapsed'),
  saved: localStorage.getItem('ffa_film_room_collapsed') }));
ok(r.collapsed && r.saved === '1', 'collapse toggles + persists', JSON.stringify(r));
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(700);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);
r = await page.evaluate(() => ({
  collapsed: document.getElementById('playGridSection').classList.contains('collapsed'),
  rows: document.querySelectorAll('#pgRows .pg-row').length }));
ok(r.collapsed, 'collapsed state survives reload');
ok(r.rows > 50, 'grid re-populated after reload (storage hook)', String(r.rows));
await click('#pgCollapse');

console.log('\n== 7. Narrow screen defaults collapsed (fresh pref) ==');
await page.evaluate(() => localStorage.removeItem('ffa_film_room_collapsed'));
await page.setViewport({ width: 800, height: 900 });
await page.reload({ waitUntil: 'networkidle0' });
await sleep(800);
await page.evaluate(() => document.querySelector('.season-card').click());
await sleep(700);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);
r = await page.evaluate(() => document.getElementById('playGridSection').classList.contains('collapsed'));
ok(r, 'narrow viewport defaults to collapsed');
await page.setViewport({ width: 1440, height: 900 });

console.log('\n== 8. Play CRUD keeps grid in sync ==');
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const before = document.querySelectorAll('#pgRows .pg-row').length;
  const play = t.plays[0];
  t.selectPlay(play.id);
  play.tags.result = 'Touchdown';
  t._emit('play-updated', play);
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cellText = document.querySelector(`#pgRows .pg-row[data-id="${play.id}"] .pg-c-result`).textContent;
  return { before, cellText };
});
ok(/Touchdown/.test(r.cellText), 'play-updated refreshes row content', r.cellText);

console.log('\n== 9. Switch team: back out to team setup ==');
await click('#bcHome');
await sleep(500);
await click('#btnEditTeam');
await sleep(200);
r = await page.evaluate(() => {
  const btn = document.getElementById('btnTeamSwitch');
  const cs = btn && getComputedStyle(btn);
  return { exists: !!btn, visible: !!btn && cs.display !== 'none' && btn.offsetParent !== null };
});
ok(r.exists && r.visible, 'Switch team link visible in edit panel', JSON.stringify(r));
await click('#btnTeamSwitch');
await sleep(300);
r = await page.evaluate(() => document.querySelector('.ffa-confirm-msg')?.textContent || '');
ok(/different team/i.test(r) && /stay/i.test(r), 'confirm explains non-destructive switch', r);
await page.evaluate(() => document.querySelector('[data-act="ok"]').click());
await sleep(500);
r = await page.evaluate(() => ({
  setup: !document.getElementById('teamSetup').classList.contains('hidden'),
  card: document.getElementById('teamCard').classList.contains('hidden'),
  profile: localStorage.getItem('ffa_team_profile'),
  seasons: document.querySelectorAll('.season-card').length }));
ok(r.setup && r.card, 'back at team setup after switch', JSON.stringify(r));
ok(!r.profile, 'team profile cleared');
ok(r.seasons === 1, 'seasons kept (non-destructive)', String(r.seasons));
await page.type('#teamSetupName', 'New Squad');
await click('#btnTeamSetupSave');
await sleep(400);
r = await page.evaluate(() => ({
  name: document.getElementById('teamCardName').textContent,
  checklist: !document.getElementById('getStartedChecklist').classList.contains('hidden') }));
ok(r.name === 'New Squad', 'new team set up cleanly', r.name);
ok(r.checklist, 'checklist restarts for the new team');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
