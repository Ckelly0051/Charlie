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
  // StatsEngine is a top-level class in the bundle's script scope (global
  // lexical binding) — use the canonical classifier as the expected value.
  const expectedThirdPass = window.app.tagger.plays.filter(p =>
    String(p.tags.down) === '3' && StatsEngine.isPass(p)).length;
  const showing = document.getElementById('pgShowing').textContent;
  document.getElementById('pgClear').click();
  await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const cleared = rows();
  return { all, third, expectedThird, thirdPass, expectedThirdPass, showing, cleared };
});
ok(r.third === r.expectedThird && r.third < r.all, 'down filter narrows to 3rd downs', JSON.stringify(r));
ok(r.thirdPass === r.expectedThirdPass && r.thirdPass < r.third, 'stacking Pass matches StatsEngine.isPass count', JSON.stringify(r));
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

// Selected rows hidden by a filter must NOT be counted by Watch (the pool
// the button advertises is exactly the pool _watch() uses).
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const firstDowns = window.app.tagger.plays.filter(p => String(p.tags.down) === '1');
  const grid = window.app.playGrid;
  grid.selected.clear();
  grid.selected.add(firstDowns[0].id); grid.selected.add(firstDowns[1].id);
  document.querySelector('.pg-fgroup[data-group="downs"] .pg-chip[data-val="3"]').click();
  await raf2();
  const watch = document.getElementById('pgWatch');
  const out = { label: watch.textContent, disabled: watch.disabled };
  document.getElementById('pgClear').click();
  grid.selected.clear();
  await raf2();
  return out;
});
ok(/\(0\)/.test(r.label) && r.disabled, 'Watch shows 0 + disables when selection is filtered out', JSON.stringify(r));

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

console.log('\n== 8b. Undo/redo + game switch keep grid in sync (plays-loaded) ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const t = window.app.tagger;
  const before = document.querySelectorAll('#pgRows .pg-row').length;
  // Simulate undo: HistoryManager._restore replaces plays wholesale.
  const full = JSON.stringify({ plays: t.plays, nextId: t.nextId, currentPlayId: null });
  const partial = JSON.stringify({ plays: t.plays.slice(0, 10), nextId: t.nextId, currentPlayId: null });
  window.app.history._restore(partial);
  await raf2();
  const afterUndo = document.querySelectorAll('#pgRows .pg-row').length;
  window.app.history._restore(full);
  await raf2();
  const afterRedo = document.querySelectorAll('#pgRows .pg-row').length;
  return { before, afterUndo, afterRedo };
});
ok(r.afterUndo === 10, 'grid re-renders after history restore (undo)', JSON.stringify(r));
ok(r.afterRedo === r.before, 'grid re-renders after history restore (redo)');

r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const grid = window.app.playGrid;
  const store = window.app.storage.seasonStore;
  // Check two rows in game 1, then switch to game 2 — selection must clear
  // (play ids restart per game, so stale ids would silently pre-check rows).
  document.querySelectorAll('#pgRows .pg-check')[0].click();
  document.querySelectorAll('#pgRows .pg-check')[1].click();
  const otherGame = store.data.games.find(g => g.id !== store.data.activeGameId);
  window.app.storage.switchToGame(otherGame.id);
  await new Promise(r => setTimeout(r, 300));
  await raf2();
  return { selected: grid.selected.size,
           checked: document.querySelectorAll('#pgRows .pg-check:checked').length,
           rows: document.querySelectorAll('#pgRows .pg-row').length,
           current: document.querySelectorAll('#pgRows .pg-row.is-current').length,
           taggerCur: window.app.tagger.currentPlayId };
});
ok(r.selected === 0 && r.checked === 0, 'game switch clears row selection', JSON.stringify(r));
ok(r.rows > 50, 'game 2 plays render after switch', String(r.rows));

console.log('\n== 9. Multi-team: add a JV team, switch between hubs ==');
await click('#bcHome');
await sleep(500);
r = await page.evaluate(() => ({
  pills: [...document.querySelectorAll('.team-pill[data-team]')].map(p => p.textContent.trim()),
  add: !!document.getElementById('btnAddTeam') }));
ok(r.pills.length === 1 && /Mavericks/.test(r.pills[0]), 'one team pill for Mavericks', JSON.stringify(r));
ok(r.add, '+ Add Team pill present');

await click('#btnAddTeam');
await sleep(200);
r = await page.evaluate(() => ({
  setup: !document.getElementById('teamSetup').classList.contains('hidden'),
  cancel: !document.getElementById('btnTeamSetupCancel').classList.contains('hidden') }));
ok(r.setup && r.cancel, 'add-team form shows with Cancel', JSON.stringify(r));
await page.type('#teamSetupName', 'JV Squad');
await click('#btnTeamSetupSave');
await sleep(600);
r = await page.evaluate(() => ({
  name: document.getElementById('teamCardName').textContent,
  active: document.querySelector('.team-pill.active')?.textContent.trim(),
  pills: document.querySelectorAll('.team-pill[data-team]').length,
  seasons: document.querySelectorAll('.season-card').length,
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}').teamName,
  breadcrumbHidden: document.getElementById('breadcrumb').classList.contains('hidden')
    || getComputedStyle(document.getElementById('breadcrumb')).display === 'none',
  hasCurrent: window.app.storage.seasonStore.hasCurrent() }));
// EXACT match — a regex would also match a concatenation bug like
// 'MavericksJV Squad' (leftover setup-input value).
ok(r.pills === 2 && (r.active || '').trim() === 'JV Squad', 'JV team added + active', JSON.stringify(r));
ok(r.name === 'JV Squad' && r.profile === 'JV Squad', 'card + profile show JV', JSON.stringify(r));
ok(r.seasons === 0, "JV hub shows NO seasons (demo belongs to Mavericks)", String(r.seasons));
ok(!r.hasCurrent, 'open season was closed on team switch');

console.log('\n== 10. Per-team rosters ==');
r = await page.evaluate(async () => {
  // Give JV a player, then flip to Mavericks and back.
  window.app.roster.loadFrom([{ num: '7', name: 'JV Kid', pos: 'QB', side: 'O' }]);
  const mavPill = [...document.querySelectorAll('.team-pill[data-team]')].find(p => /Mavericks/.test(p.textContent));
  mavPill.click();
  await new Promise(r => setTimeout(r, 400));
  const mavCount = window.app.roster.players.length;
  const jvPill = [...document.querySelectorAll('.team-pill[data-team]')].find(p => /JV Squad/.test(p.textContent));
  jvPill.click();
  await new Promise(r => setTimeout(r, 400));
  const jvCount = window.app.roster.players.length;
  const jvName = (window.app.roster.players[0] || {}).name || '';
  return { mavCount, jvCount, jvName };
});
ok(r.mavCount === 0, 'Mavericks roster untouched by JV player', JSON.stringify(r));
ok(r.jvCount === 1 && r.jvName === 'JV Kid', 'JV roster restored on switch back', JSON.stringify(r));

console.log('\n== 11. Mavericks hub still owns the demo; remove-team guard ==');
r = await page.evaluate(async () => {
  const mavPill = [...document.querySelectorAll('.team-pill[data-team]')].find(p => /Mavericks/.test(p.textContent));
  mavPill.click();
  await new Promise(r => setTimeout(r, 400));
  return { seasons: document.querySelectorAll('.season-card').length };
});
ok(r.seasons === 1, "Mavericks hub still lists the demo season", String(r.seasons));
await click('#btnEditTeam');
await sleep(200);
await click('#btnTeamRemove');
await sleep(300);
r = await page.evaluate(() => document.querySelector('.ffa-confirm-msg')?.textContent || '');
ok(/still has 1 season/i.test(r), 'team with seasons cannot be removed (guard)', r);
await page.evaluate(() => document.querySelector('[data-act="ok"]')?.click());
await sleep(300);

// JV has no seasons → removable; active falls back to Mavericks.
r = await page.evaluate(async () => {
  const jvPill = [...document.querySelectorAll('.team-pill[data-team]')].find(p => /JV Squad/.test(p.textContent));
  jvPill.click();
  await new Promise(r => setTimeout(r, 400));
  document.getElementById('btnEditTeam').click();
  await new Promise(r => setTimeout(r, 150));
  document.getElementById('btnTeamRemove').click();
  await new Promise(r => setTimeout(r, 250));
  const msg = document.querySelector('.ffa-confirm-msg')?.textContent || '';
  document.querySelector('[data-act="ok"]').click();
  await new Promise(r => setTimeout(r, 400));
  return { msg,
    pills: document.querySelectorAll('.team-pill[data-team]').length,
    active: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}').teamName,
    jvRosterKey: localStorage.getItem('ffa_roster_jv-squad') };
});
ok(/Remove "JV Squad"/.test(r.msg), 'empty team gets the remove confirm', r.msg);
ok(r.pills === 1 && r.active === 'Mavericks', 'JV removed, Mavericks active again', JSON.stringify(r));
ok(!r.jvRosterKey, 'JV roster snapshot deleted');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
