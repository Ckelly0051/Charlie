/* E2E Film Room harness — drives the built bundle headless through the
   Phase 2 play grid: render on demo data, row click-to-select, chip filters,
   bulk selection + Watch fallback, collapse persistence, narrow-screen
   default, switch-team back-out. Run after build:
     bash build.sh && node tools/e2e-film-room.mjs */
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

console.log('\n== 8c. v2: tendency row + inline editing ==');
r = await page.evaluate(() => {
  const tend = document.querySelector('.pg-tend');
  const formTd = tend && tend.querySelector('.pg-c-formation');
  // manual top-formation calc over visible plays (no filters active)
  const counts = {};
  let total = 0;
  // E3b: the tendency line is a DISPLAY surface and reads the PROJECTED formation,
  // so the independent expectation must project too. `total` is therefore the §6.5
  // ELIGIBLE denominator — an alignment-only play (projected formation blank) is
  // omitted rather than counted as a "Shotgun" formation.
  const SE = window.app.stats.constructor;
  window.app.tagger.plays.forEach(p => {
    const vals = String(SE.projField(p, 'formation') || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    if (!vals.length) return;
    total++;                                   // ONE per eligible play (§6.5)
    vals.forEach(v => { counts[v] = (counts[v] || 0) + 1; });
  });
  const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
  const expected = `${top[0]} ${Math.round(top[1] / total * 100)}%`;

  // DETERMINISTIC multi-value case — does NOT mirror the implementation. Three
  // eligible plays, "Wing-T" on ALL of them, one carrying a second token:
  //   eligible plays = 3, Wing-T = 3  ->  "Wing-T 100%"
  // The token-counting bug yields 4 tokens -> "Wing-T 75%", so this case FAILS on
  // the old math and is the failing-first pin for the denominator.
  const mk = (id, formation) => ({ id, timestamp: { start: 0, end: 1 }, tags: { unit: 'offense', formation } });
  const multi = [mk(1, 'Wing-T + Trips'), mk(2, 'Wing-T'), mk(3, 'Wing-T')];
  const multiTend = window.app.playGrid._tendency({ key: 'formation', type: 'enum' }, multi);
  // Top value on a SUBSET: Trips is on 2 of 3 eligible plays -> "Trips 67%".
  // (Token math would be 2/4 = 50%, so this also discriminates.)
  const subset = [mk(1, 'Wing-T + Trips'), mk(2, 'Trips'), mk(3, 'Ace')];
  const subsetTend = window.app.playGrid._tendency({ key: 'formation', type: 'enum' }, subset);
  return { text: formTd ? formTd.textContent.trim() : null, expected, multiTend, subsetTend };
});
ok(r.text === r.expected, 'formation tendency = top value + share', JSON.stringify(r));
ok(r.multiTend === 'Wing-T 100%', 'tendency denominator counts ELIGIBLE PLAYS, not tokens (multi-value)', JSON.stringify(r.multiTend));
ok(r.subsetTend === 'Trips 67%', 'tendency share of a subset value uses the eligible-play denominator (2/3, not 2/4)', JSON.stringify(r.subsetTend));

console.log('\n== 8d. E3b: projected cells + display-only columns + saved-column upgrade ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'offense' }, tags) });
  const cell = (p, key) => grid._cellHtml
    ? grid._cellHtml(p, PG.COLUMNS.find(c => c.key === key))
    : grid._cell(p, PG.COLUMNS.find(c => c.key === key));
  const alignOnly = mk(1, { formation: 'Under Center' });      // projects to NO structural formation
  const structural = mk(2, { formation: 'Shotgun + Trips' });  // projects to Trips
  const defFam = mk(3, { unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Zone' });
  return {
    alignFormation: cell(alignOnly, 'formation'),
    alignQb: cell(alignOnly, 'qbAlignment'),
    structFormation: cell(structural, 'formation'),
    structQb: cell(structural, 'qbAlignment'),
    covFamily: cell(defFam, 'coverageFamily'),
    // display-only: the editor must refuse to open for the new columns
    qbType: PG.COLUMNS.find(c => c.key === 'qbAlignment').type,
    famType: PG.COLUMNS.find(c => c.key === 'coverageFamily').type,
    // P4 upgrade rule
    upgradeStockDefault: PG._upgradeCols(PG.LEGACY_PRESETS.default.slice()),
    upgradeStockDefense: PG._upgradeCols(PG.LEGACY_PRESETS.defense.slice()),
    upgradeCustom: PG._upgradeCols(['sit', 'formation', 'notes']),
    newDefault: PG.PRESETS.default,
    newDefense: PG.PRESETS.defense,
  };
});
ok(/Not charted/.test(r.alignFormation) && !/Shotgun/.test(r.alignFormation) && !/Unknown/.test(r.alignFormation),
  'alignment-only play: Formation cell reads "Not charted" (never Shotgun/Unknown)', JSON.stringify(r.alignFormation));
ok(/QB alignment is charted separately/.test(r.alignFormation),
  'the "Not charted" cell carries the explanatory tooltip', JSON.stringify(r.alignFormation));
ok(/Under Center/.test(r.alignQb), 'QB Alignment column shows the projected alignment', JSON.stringify(r.alignQb));
ok(/Trips/.test(r.structFormation) && !/Shotgun/.test(r.structFormation),
  'structural play: Formation cell shows projected structure only', JSON.stringify(r.structFormation));
ok(/Shotgun/.test(r.structQb), 'QB Alignment column shows alignment split out of a mixed formation', JSON.stringify(r.structQb));
ok(/Zone/.test(r.covFamily), 'Coverage Family column shows the projected family', JSON.stringify(r.covFamily));
ok(r.qbType === 'proj-readonly' && r.famType === 'proj-readonly',
  'QB Alignment + Coverage Family are DISPLAY-ONLY in E3b (editor refuses to open)', JSON.stringify(r));
ok(JSON.stringify(r.upgradeStockDefault) === JSON.stringify(r.newDefault),
  'P4: a saved list matching the OLD default preset upgrades to the new one', JSON.stringify(r.upgradeStockDefault));
ok(JSON.stringify(r.upgradeStockDefense) === JSON.stringify(r.newDefense),
  'P4: a saved list matching the OLD defense preset upgrades to the new one', JSON.stringify(r.upgradeStockDefense));
ok(JSON.stringify(r.upgradeCustom) === JSON.stringify(['sit', 'formation', 'notes']),
  'P4: a CUSTOM saved layout is preserved untouched', JSON.stringify(r.upgradeCustom));

// Multi-enum inline edit: Result cell — click to focus, click again to edit.
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const row = document.querySelectorAll('#pgRows .pg-row')[2];
  const id = parseInt(row.dataset.id, 10);
  const cell = row.querySelector('td[data-k="result"]');
  cell.click(); await raf2();
  const focused = cell.classList.contains('pg-cell-focus');
  cell.click(); await new Promise(r => setTimeout(r, 80));
  const pop = document.querySelector('.pg-pop');
  if (!pop) return { focused, pop: false };
  // clear current chips, pick Touchdown, Done
  pop.querySelectorAll('.pg-chip.active').forEach(c => c.click());
  [...pop.querySelectorAll('.pg-chip[data-v]')].find(c => c.dataset.v === 'Touchdown').click();
  [...pop.querySelectorAll('[data-act="done"]')][0].click();
  await raf2(); await raf2();
  const play = window.app.tagger.getPlay(id);
  const cellText = document.querySelector(`#pgRows .pg-row[data-id="${id}"] td[data-k="result"]`).textContent;
  const formVal = window.app.tagger.tagFields.result.value;   // play is selected → form synced
  return { focused, pop: true, tag: play.tags.result, cellText, formVal, popGone: !document.querySelector('.pg-pop') };
});
ok(r.focused && r.pop, 'click focuses cell, second click opens editor', JSON.stringify(r));
ok(r.tag === 'Touchdown' && /Touchdown/.test(r.cellText), 'multi-enum edit commits to tags + cell', JSON.stringify(r));
ok(r.formVal === 'Touchdown', 'tag form synced for the selected play', r.formVal);
ok(r.popGone, 'editor closes after Done');

// Yardage magnitude + Loss sign rule (mirror of the form).
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const grid = window.app.playGrid;
  const play = window.app.tagger.plays.find(p => (p.tags.result || '').includes('Loss'));
  grid._applyEdit(play, { key: 'yardage', type: 'yds' }, '9');
  await raf2();
  return { stored: play.tags.yardage };
});
ok(r.stored === '-9', 'yardage magnitude gets Loss sign (-9)', r.stored);

// Dn & Dist composite editor.
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const row = document.querySelectorAll('#pgRows .pg-row')[4];
  const id = parseInt(row.dataset.id, 10);
  const cell = row.querySelector('td[data-k="sit"]');
  cell.click(); await raf2();
  document.querySelector(`#pgRows .pg-row[data-id="${id}"] td[data-k="sit"]`).click();
  await new Promise(r => setTimeout(r, 80));
  const pop = document.querySelector('.pg-pop');
  [...pop.querySelectorAll('.pg-chip[data-v]')].find(c => c.dataset.v === '3').click();
  pop.querySelector('#pgSitDist').value = '8';
  pop.querySelector('[data-act="done"]').click();
  await raf2(); await raf2();
  const play = window.app.tagger.getPlay(id);
  return { down: play.tags.down, dist: play.tags.distance,
           cell: document.querySelector(`#pgRows .pg-row[data-id="${id}"] td[data-k="sit"]`).textContent };
});
ok(r.down === '3' && r.dist === '8' && /3rd & 8/.test(r.cell), 'Dn & Dist editor commits both fields', JSON.stringify(r));

console.log('\n== 8d. v2: keyboard navigation ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const grid = window.app.playGrid;
  const rows = document.querySelectorAll('#pgRows .pg-row');
  const id0 = parseInt(rows[0].dataset.id, 10);
  rows[0].querySelector('td[data-k="formation"]').click();
  await raf2();
  const sec = document.getElementById('playGridSection');
  sec.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await raf2();
  const f1 = { ...grid._focus };
  sec.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(r => setTimeout(r, 80));
  const popOpen = !!document.querySelector('.pg-pop');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(r => setTimeout(r, 80));
  return { id0, f1, popOpen, popClosed: !document.querySelector('.pg-pop'),
           selectedFollows: window.app.tagger.currentPlayId === f1.playId };
});
ok(r.f1.playId !== r.id0 && r.f1.colKey === 'formation', 'ArrowDown moves focus to next play, same column', JSON.stringify(r.f1));
ok(r.selectedFollows, 'video selection follows vertical focus moves');
ok(r.popOpen && r.popClosed, 'Enter opens editor, Esc closes', JSON.stringify(r));

console.log('\n== 8e. v2: custom columns ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  document.getElementById('pgColsBtn').click();
  await new Promise(r => setTimeout(r, 80));
  const pop = document.querySelector('.pg-pop');
  if (!pop) return { pop: false };
  // Defense preset
  pop.querySelector('[data-preset="defense"]').click();
  await raf2(); await raf2();
  const defHeads = [...document.querySelectorAll('#pgThead th')].map(h => h.textContent.trim());
  const saved = JSON.parse(localStorage.getItem('ffa_film_room_cols') || '[]');
  // add Qtr via checkbox
  pop.querySelector('input[data-col="quarter"]').click();
  await raf2(); await raf2();
  const withQtr = JSON.parse(localStorage.getItem('ffa_film_room_cols') || '[]');
  // back to default preset for the rest of the run
  pop.querySelector('[data-preset="default"]').click();
  await raf2();
  document.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));   // close popover
  await new Promise(r => setTimeout(r, 60));
  return { pop: true, defHeads, saved, withQtr };
});
ok(r.pop && r.defHeads.includes('Front') && r.defHeads.includes('Cover') && !r.defHeads.includes('Formation'),
  'Defense preset swaps columns', JSON.stringify(r.defHeads));
// E3b: the Defense preset now carries Coverage Family immediately after Coverage
// Call (coach-specified placement).
ok(JSON.stringify(r.saved) === JSON.stringify(['sit','defFront','coverage','coverageFamily','blitz','result','yardage','penalty','penaltyYards']),
  'preset persisted to localStorage', JSON.stringify(r.saved));
ok(r.withQtr.includes('quarter'), 'checkbox adds a column (persisted)', JSON.stringify(r.withQtr));

console.log('\n== 8f. v2: saved filters ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
  const chip = (g, v) => document.querySelector(`.pg-fgroup[data-group="${g}"] .pg-chip[data-val="${v}"]`);
  chip('downs', '3').click(); await raf2();
  chip('rp', 'Pass').click(); await raf2();
  const filteredCount = document.querySelectorAll('#pgRows .pg-row').length;
  document.getElementById('pgSaveFilter').click();
  await new Promise(r => setTimeout(r, 80));
  const pop = document.querySelector('.pg-pop');
  pop.querySelector('#pgFilterName').value = '3rd down passes';
  pop.querySelector('#pgFilterSaveOk').click();
  await raf2(); await raf2();
  const stored = JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]');
  document.getElementById('pgClear').click(); await raf2();
  const clearedCount = document.querySelectorAll('#pgRows .pg-row').length;
  const menuVisible = !document.getElementById('pgFiltersMenu').classList.contains('hidden');
  document.getElementById('pgFiltersMenu').click();
  await new Promise(r => setTimeout(r, 80));
  document.querySelector('.pg-pop [data-apply]').click();
  await raf2(); await raf2();
  const reapplied = document.querySelectorAll('#pgRows .pg-row').length;
  // delete it
  document.getElementById('pgFiltersMenu').click();
  await new Promise(r => setTimeout(r, 80));
  document.querySelector('.pg-pop [data-del]').click();
  await raf2();
  const after = JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]');
  document.getElementById('pgClear').click(); await raf2();
  return { filteredCount, stored, clearedCount, menuVisible, reapplied, after };
});
ok(r.stored.length === 1 && r.stored[0].name === '3rd down passes' &&
   JSON.stringify(r.stored[0].f.downs) === '["3"]' && r.stored[0].f.rp === 'Pass',
  'filter saved with full criteria', JSON.stringify(r.stored));
ok(r.menuVisible && r.reapplied === r.filteredCount && r.reapplied < r.clearedCount,
  'saved filter re-applies identically', JSON.stringify({ f: r.filteredCount, re: r.reapplied, all: r.clearedCount }));
ok(r.after.length === 0, 'saved filter deletable');

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

// Grid inline editor must match the tag form's semantics exactly (v1.9.30):
// exclusivity (no "Gain + Loss"), auto-Gain on positive yardage, and clearing
// _autoSit so Save & Next can't overwrite a grid Dn&Dist correction.
r = await page.evaluate(() => {
  const grid = window.app.playGrid;
  const col = (key, multi, type) => ({ key, multi, type: type || (multi ? 'enum' : 'text') });
  const mk = () => ({ id: 9001, timestamp: { start: 0, end: 5 }, notes: '', tags: { unit: 'offense', playType: '', result: '', runPass: '', yardage: '', down: '', distance: '', players: {}, grades: {}, custom: [] } });
  const out = {};
  let p = mk(); p.tags.yardage = '8';
  grid._applyEdit(p, col('result', true, 'enum'), 'Gain + Loss');
  out.exclusive = p.tags.result; out.exclSign = p.tags.yardage;
  p = mk(); grid._applyEdit(p, col('yardage', false, 'text'), '12');
  out.autoGain = p.tags.result; out.autoGainSign = p.tags.yardage;
  p = mk(); p._autoSit = true; grid._applyEdit(p, col('sit', false, 'sit'), { down: '3', distance: '7' });
  out.autoSitCleared = p._autoSit === false; out.sit = p.tags.down + '&' + p.tags.distance;
  return out;
});
ok(r.exclusive === 'Loss', 'grid drops the exclusive rival: "Gain + Loss" → "Loss" (was stored as-is)', JSON.stringify(r));
ok(r.exclSign === '-8', 'yardage then takes the Loss sign (-8), not flipped from a stale "Gain + Loss"', JSON.stringify(r));
ok(r.autoGain === 'Gain' && r.autoGainSign === '12', 'positive yardage with no result auto-sets Gain (mirror of the form)', JSON.stringify(r));
ok(r.autoSitCleared && r.sit === '3&7', 'a grid Dn&Dist edit clears _autoSit so Save & Next cannot overwrite it', JSON.stringify(r));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
