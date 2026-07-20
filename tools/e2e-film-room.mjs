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

console.log('\n== 8c-2. E3b: tendency value/share + eligible denominator across ALL SIX projected columns ==');
// Review finding (E3b): the P3 contract says "the tendency line must use the
// SAME projected grouping and eligible denominator" for the projected columns
// generally, but the prior pass only wired it for the two columns that were
// editable at the time (formation, coverage) and left the other four
// (qbAlignment, backfield, strength, coverageFamily — DISPLAY-ONLY/
// `proj-readonly` in E3b, made genuinely editable in E4-2) rendering nothing.
// Whether a column is editable is a separate concern from whether a summary
// is useful, so _tendency() routes every projected column through the
// identical enum math. All four are single-value, so the multi-value split
// is a no-op for them; this is genuinely the SAME calculation, not a parallel
// one.
r = await page.evaluate(() => {
  const grid = window.app.playGrid;
  const mkDef = (id, coverage, coverageFamily) => ({ id, timestamp: { start: 0, end: 1 }, tags: { unit: 'defense', coverage, coverageFamily } });
  // 'Man' here is a LEGACY family value raw in `coverage` — projects to
  // Coverage Call = '' (ineligible), Coverage Family = 'Man'. _tendency()
  // requires >= 3 ELIGIBLE plays before it shows anything at all, so three
  // real Cover 2 calls establish that floor; the fourth (Man) play must NOT
  // count toward it. If Coverage Call's tendency counted the Man play anyway,
  // eligible=4/Cover2=3 -> "75%" instead of the correct eligible=3/Cover2=3
  // -> "100%" (mirrors the Formation multi-value discriminator above, for a
  // single-value column instead).
  const covPlays = [mkDef(1, 'Cover 2'), mkDef(2, 'Cover 2'), mkDef(3, 'Cover 2'), mkDef(4, 'Man')];
  const coverageTend = grid._tendency(grid.constructor.COLUMNS.find(c => c.key === 'coverage'), covPlays);

  // Each proj-readonly column gets the SAME three-part proof formation/coverage
  // already had: (a) top value + correct share, (b) a blank play EXCLUDED from
  // the eligible denominator rather than counted as ineligible-but-present,
  // (c) below the 3-eligible-play floor renders nothing at all.
  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 1 }, tags: Object.assign({ unit: 'offense' }, tags) });
  const fixtures = {
    qbAlignment: [mk(1, { qbAlignment: 'Shotgun' }), mk(2, { qbAlignment: 'Shotgun' }), mk(3, { qbAlignment: 'Under Center' }), mk(4, {})],
    // NOT 'Pistol' — per TagProjection/E1, Pistol is exclusively QB alignment
    // terminology now and gets stripped OUT of backfield unconditionally, so
    // it would project to '' here rather than being a genuine second value.
    backfield:   [mk(1, { backfield: 'I' }),         mk(2, { backfield: 'I' }),         mk(3, { backfield: 'Power' }),          mk(4, {})],
    strength:    [mk(1, { strength: 'Right' }),      mk(2, { strength: 'Right' }),      mk(3, { strength: 'Left' }),            mk(4, {})],
    coverageFamily: [mk(1, { coverageFamily: 'Zone' }), mk(2, { coverageFamily: 'Zone' }), mk(3, { coverageFamily: 'Man' }), mk(4, {})],
  };
  const expectedTop = { qbAlignment: 'Shotgun', backfield: 'I', strength: 'Right', coverageFamily: 'Zone' };
  const projReadonly = {};
  for (const key of Object.keys(fixtures)) {
    const col = grid.constructor.COLUMNS.find(c => c.key === key);
    const full = grid._tendency(col, fixtures[key]);
    // Minimum-3-play threshold: the SAME fixture minus its 3rd eligible play
    // (the 4th play stays — still blank/ineligible) drops eligible count to 2.
    const belowFloor = grid._tendency(col, fixtures[key].filter(p => p.id !== 3));
    projReadonly[key] = { type: col.type, full, belowFloor };
  }
  return { coverageTend, projReadonly, expectedTop };
});
ok(r.coverageTend === 'Cover 2 100%', 'coverage (Coverage Call) tendency uses the ELIGIBLE denominator — the legacy family-mapped play is excluded, not counted as a third eligible play', JSON.stringify(r.coverageTend));
for (const key of ['qbAlignment', 'backfield', 'strength', 'coverageFamily']) {
  const c = r.projReadonly[key];
  const expected = `${r.expectedTop[key]} 67%`;
  ok(c.type === 'enum', `${key} is a genuine editable enum column (E4-2) — confirms this proof targets the right half of the six columns`, JSON.stringify(c));
  ok(c.full === expected, `${key} tendency = top value + share, with the blank play EXCLUDED from the eligible denominator (2/3, not 2/4)`, JSON.stringify({ key, ...c }));
  ok(c.belowFloor === '', `${key} renders NOTHING below the minimum-3-eligible-play threshold (2 eligible plays here)`, JSON.stringify({ key, ...c }));
}

console.log('\n== 8d. E3b/E4-2: projected cells + editable projected columns + saved-column upgrade ==');
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
    // E4-2: these columns are now genuinely editable (behavior proven in the
    // dedicated BEHAVIORAL block below) — this just confirms the declared type.
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
ok(r.qbType === 'enum' && r.famType === 'enum',
  'QB Alignment + Coverage Family are declared as genuine editable enum columns (E4-2)', JSON.stringify(r));


// P4 through the REAL persistence path. Calling _upgradeCols() directly proves
// only the helper — removing its call from _loadCols() would leave that green. So
// write localStorage and read back through _loadCols().
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const saved = localStorage.getItem('ffa_film_room_cols');
  const via = (value) => {
    if (value === null) localStorage.removeItem('ffa_film_room_cols');
    else localStorage.setItem('ffa_film_room_cols', JSON.stringify(value));
    return grid._loadCols();
  };
  const out = {
    none: via(null),
    legacyDefault: via(PG.LEGACY_PRESETS.default),
    legacyOffense: via(PG.LEGACY_PRESETS.offense),
    legacyDefense: via(PG.LEGACY_PRESETS.defense),
    custom: via(['sit', 'formation', 'notes']),
    newDefault: PG.PRESETS.default, newOffense: PG.PRESETS.offense, newDefense: PG.PRESETS.defense,
  };
  if (saved === null) localStorage.removeItem('ffa_film_room_cols'); else localStorage.setItem('ffa_film_room_cols', saved);
  return out;
});
const eqJ = (a, b) => JSON.stringify(a) === JSON.stringify(b);
ok(eqJ(r.none, r.newDefault), 'P4 via _loadCols: NO saved preference -> new defaults', JSON.stringify(r.none));
ok(eqJ(r.legacyDefault, r.newDefault), 'P4 via _loadCols: saved OLD default preset -> upgraded', JSON.stringify(r.legacyDefault));
ok(eqJ(r.legacyOffense, r.newOffense), 'P4 via _loadCols: saved OLD offense preset -> upgraded', JSON.stringify(r.legacyOffense));
ok(eqJ(r.legacyDefense, r.newDefense), 'P4 via _loadCols: saved OLD defense preset -> upgraded', JSON.stringify(r.legacyDefense));
ok(eqJ(r.custom, ['sit', 'formation', 'notes']), 'P4 via _loadCols: CUSTOM layout preserved untouched', JSON.stringify(r.custom));
ok(r.newDefault.includes('qbAlignment') && r.newDefense.includes('coverageFamily'),
  'P4: the upgraded presets actually expose the new columns', JSON.stringify({ d: r.newDefault, f: r.newDefense }));



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


// ===================================================================
// E3b INTERACTIVE tests run LAST on purpose: they drive real clicks and open
// editors, which changes the grid's selection/focus. An earlier test relies on
// its row already being the current play (a first click that RE-selects triggers
// a refresh that clears focus, so its "second click opens the editor" never
// fires). Keeping these at the end means they cannot perturb anything upstream.
// ===================================================================
// BEHAVIORAL editable proof (E4-2) — the type check above is a DECLARATION
// and would stay green even if _openEditor still refused these columns.
// Drive the real interactions: E4-2 made qbAlignment/coverageFamily
// genuinely editable, but OPENING the editor (without picking a chip) must
// still write nothing — the same view/cancel-never-writes contract
// D-projform requires of the tag form.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, tagger = window.app.tagger;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = tagger.plays[0];
  if (!play) return { skip: true };
  const colsBefore = grid.cols.slice();   // RESTORED below — later tests assume the default set
  const selBefore = tagger.currentPlayId; // RESTORED below — clicking cells re-selects, and a
                                          // later test relies on its row already being current
                                          // (a first click that re-selects refreshes and clears
                                          // focus, so its "second click opens" would not fire).
  const before = JSON.stringify(play.tags);
  let updates = 0;
  const onUpd = () => { updates++; };
  tagger.on('play-updated', onUpd);

  const results = {};
  for (const key of ['qbAlignment', 'coverageFamily']) {
    // make sure the column is actually rendered
    if (!grid.cols.includes(key)) { grid.cols = [...grid.cols, key]; grid.refresh(); await raf2(); }
    const td = grid._cellEl(play.id, key);
    results[key + 'Rendered'] = !!td;
    if (!td) continue;
    td.dispatchEvent(new MouseEvent('click', { bubbles: true })); await raf2();
    td.dispatchEvent(new MouseEvent('click', { bubbles: true })); await raf2();   // 2nd click = open
    results[key + 'EditorFromClick'] = !!document.querySelector('.pg-pop, .pg-editor, .pg-pop-chips');
    grid._closeEditor();
    td.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); await raf2();
    results[key + 'EditorFromEnter'] = !!document.querySelector('.pg-pop, .pg-editor, .pg-pop-chips');
    grid._closeEditor();
    grid._openEditor(play.id, key); await raf2();                                  // direct call
    results[key + 'EditorFromDirect'] = !!document.querySelector('.pg-pop, .pg-editor, .pg-pop-chips');
    grid._closeEditor(); await raf2();                                             // cancel — no chip picked
  }
  tagger.off ? tagger.off('play-updated', onUpd) : null;
  const res = { skip: false, ...results, updates, unchanged: JSON.stringify(play.tags) === before };
  grid.cols = colsBefore; grid.refresh(); await raf2();   // restore shared state
  if (selBefore != null) { tagger.selectPlay(selBefore); await raf2(); }
  return res;
});
ok(r.skip || (r.qbAlignmentRendered && r.coverageFamilyRendered),
  'the now-editable columns actually render a cell to interact with', JSON.stringify(r));
ok(r.skip || (r.qbAlignmentEditorFromClick && r.coverageFamilyEditorFromClick),
  'E4-2 BEHAVIORAL: a 2nd click genuinely OPENS the editor on the new columns (not just a type declaration)', JSON.stringify(r));
ok(r.skip || (r.qbAlignmentEditorFromEnter && r.coverageFamilyEditorFromEnter),
  'E4-2 BEHAVIORAL: Enter also opens the editor', JSON.stringify(r));
ok(r.skip || (r.qbAlignmentEditorFromDirect && r.coverageFamilyEditorFromDirect),
  'E4-2 BEHAVIORAL: a direct _openEditor call also opens it', JSON.stringify(r));
ok(r.skip || r.updates === 0, 'E4-2 BEHAVIORAL: OPENING (never committing) fires no play-updated event', JSON.stringify(r));
ok(r.skip || r.unchanged, 'E4-2 BEHAVIORAL: play tags are byte-identical after opening + canceling every interaction — view/cancel never writes', JSON.stringify(r));

console.log('\n== 8e. E3b-P1: Formation editor projected seed + promote-on-commit ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const SE = window.app.stats.constructor;
  const col = PG.COLUMNS.find(c => c.key === 'formation');
  const mk = (tags) => ({ id: 9001, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'offense' }, tags) });
  const colsSnapshot = grid.cols.slice();
  const out = {};

  // (a) SEED — proven by OPENING THE REAL EDITOR and inspecting the rendered
  //     chips. (An earlier version asserted on its own SE.projField() call, which
  //     tested projField rather than the editor: reverting the seed to raw left it
  //     green. Found by mutation.)
  const openOn = (formationValue) => {
    const real = grid.tagger.plays[0];
    const saved = real.tags.formation;
    real.tags.formation = formationValue;
    grid.refresh();
    grid._openEditor(real.id, 'formation');
    const pop = document.querySelector('.pg-pop');
    const chips = pop ? [...pop.querySelectorAll('.pg-chip[data-v]')] : [];
    const res = {
      opened: !!pop,
      active: chips.filter(c => c.classList.contains('active')).map(c => c.dataset.v),
      offered: chips.map(c => c.dataset.v),
    };
    grid._closeEditor();
    real.tags.formation = saved;
    grid.refresh();
    return res;
  };
  const legacyOpen = openOn('Under Center');
  out.legacyOpened = legacyOpen.opened;
  out.seedLegacyActive = legacyOpen.active;                 // must be EMPTY
  out.optsHaveAlignment = legacyOpen.offered.some(o => ['Under Center', 'Shotgun', 'Pistol'].includes(o));
  const mixedOpen = openOn('Shotgun + Trips');
  out.seedMixedActive = mixedOpen.active;                   // must be ['Trips'] only

  // NOTE (honest scope): for FORMATION the `_options` alignment filter alone
  // removes the chip, so the PROJECTED SEED is not independently observable through
  // the rendered chips — reverting the seed to raw leaves these green (verified by
  // mutation). The filter is the enforcing mechanism and IS discriminating (see the
  // "offers NO QB alignments" assertion); the projected seed is defense-in-depth.

  // (b) PROMOTE on explicit commit — alignment preserved into qbAlignment.
  const p1 = mk({ formation: 'Under Center' });
  grid._applyEdit(p1, col, 'Trips');
  out.promoted = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };

  // (c) an EXISTING explicit qbAlignment WINS (never overwritten).
  const p2 = mk({ formation: 'Shotgun + Trips', qbAlignment: 'Pistol' });
  grid._applyEdit(p2, col, 'Bunch');
  out.explicitWins = { formation: p2.tags.formation, qbAlignment: p2.tags.qbAlignment };

  // (d) a play with NO alignment anywhere gains none (no invention).
  const p3 = mk({ formation: 'Ace' });
  grid._applyEdit(p3, col, 'Trips');
  out.noInvention = { formation: p3.tags.formation, qbAlignment: p3.tags.qbAlignment || '' };

  // (e) editing a DIFFERENT field never promotes (no sibling rewrite).
  const p4 = mk({ formation: 'Under Center', playType: '' });
  grid._applyEdit(p4, PG.COLUMNS.find(c => c.key === 'playType'), 'Run Inside');
  out.otherField = { formation: p4.tags.formation, qbAlignment: p4.tags.qbAlignment || '' };

  // (f) OPENING and CANCELLING must write NOTHING. Use an EXISTING rendered play —
  // injecting a synthetic one into tagger.plays moves selection and leaves the
  // tagger pointing at a popped play, which broke four later tests.
  const real = grid.tagger.plays[0];
  if (real) {
    const selBefore = grid.tagger.currentPlayId;
    const before5 = JSON.stringify(real.tags);
    grid._openEditor(real.id, 'formation');
    out.editorOpened = !!document.querySelector('.pg-pop');   // it IS editable (not a no-op test)
    grid._closeEditor();
    out.openCancelUnchanged = JSON.stringify(real.tags) === before5;
    if (selBefore != null) grid.tagger.selectPlay(selBefore);   // restore via the real path
  } else { out.editorOpened = false; out.openCancelUnchanged = true; }
  return out;
});
ok(r.legacyOpened, 'P1 seed: the Formation editor opens (seed assertions are not vacuous)', JSON.stringify(r.legacyOpened));
ok(Array.isArray(r.seedLegacyActive) && r.seedLegacyActive.length === 0,
  'P1 seed: an alignment-only play seeds the REAL editor with NO active chip', JSON.stringify(r.seedLegacyActive));
ok(JSON.stringify(r.seedMixedActive) === JSON.stringify(['Trips']),
  'P1 seed: a mixed play activates ONLY its structural chip in the real editor', JSON.stringify(r.seedMixedActive));
ok(!r.optsHaveAlignment, 'P1: the structural Formation picker offers NO QB alignments', JSON.stringify(r.optsHaveAlignment));
ok(r.promoted.formation === 'Trips' && r.promoted.qbAlignment === 'Under Center',
  'P1 promote: explicit commit writes the structural choice AND preserves the alignment', JSON.stringify(r.promoted));
ok(r.explicitWins.formation === 'Bunch' && r.explicitWins.qbAlignment === 'Pistol',
  'P1: an EXISTING explicit qbAlignment wins (never overwritten)', JSON.stringify(r.explicitWins));
ok(r.noInvention.formation === 'Trips' && r.noInvention.qbAlignment === '',
  'P1: no alignment is INVENTED when the play never had one', JSON.stringify(r.noInvention));
ok(r.otherField.formation === 'Under Center' && r.otherField.qbAlignment === '',
  'P1: editing a DIFFERENT field promotes nothing (no sibling rewrite)', JSON.stringify(r.otherField));
ok(r.editorOpened, 'P1: the Formation editor DOES open (so the cancel test is not vacuous)', JSON.stringify(r.editorOpened));
ok(r.openCancelUnchanged, 'P1: opening then cancelling the editor writes NOTHING', JSON.stringify(r.openCancelUnchanged));

console.log('\n== 8f. E3b-P1b: COVERAGE CALL — same promote class as Formation ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const col = PG.COLUMNS.find(c => c.key === 'coverage');
  const mkD = (tags) => ({ id: 9101, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'defense' }, tags) });
  const out = {};
  // options must not offer the FAMILY values (Man/Zone/Match) in the CALL picker
  grid._optionCache = {};
  out.offered = grid._options(col, ['Man']);
  out.offersFamily = out.offered.some(o => ['Man', 'Zone', 'Match'].includes(o));
  // promote: legacy coverage:'Man' projects to blank call + family Man
  const c1 = mkD({ coverage: 'Man' });
  grid._applyEdit(c1, col, 'Cover 3');
  out.promoted = { coverage: c1.tags.coverage, coverageFamily: c1.tags.coverageFamily };
  // explicit family wins
  const c2 = mkD({ coverage: 'Man', coverageFamily: 'Zone' });
  grid._applyEdit(c2, col, 'Cover 2');
  out.explicitWins = { coverage: c2.tags.coverage, coverageFamily: c2.tags.coverageFamily };
  // no invention when there was never a family
  const c3 = mkD({ coverage: 'Cover 1' });
  grid._applyEdit(c3, col, 'Cover 4');
  out.noInvention = { coverage: c3.tags.coverage, coverageFamily: c3.tags.coverageFamily || '' };
  // editing a different field promotes nothing
  const c4 = mkD({ coverage: 'Man' });
  grid._applyEdit(c4, PG.COLUMNS.find(c => c.key === 'result'), 'Incomplete');
  out.otherField = { coverage: c4.tags.coverage, coverageFamily: c4.tags.coverageFamily || '' };
  return out;
});
ok(!r.offersFamily, 'P1b: the Coverage CALL picker offers NO family values (Man/Zone/Match)', JSON.stringify(r.offered));
ok(r.promoted.coverage === 'Cover 3' && r.promoted.coverageFamily === 'Man',
  'P1b promote: explicit Coverage commit preserves the family (Man) instead of destroying it', JSON.stringify(r.promoted));
ok(r.explicitWins.coverage === 'Cover 2' && r.explicitWins.coverageFamily === 'Zone',
  'P1b: an EXISTING explicit coverageFamily wins', JSON.stringify(r.explicitWins));
ok(r.noInvention.coverage === 'Cover 4' && r.noInvention.coverageFamily === '',
  'P1b: no family is INVENTED when the play never had one', JSON.stringify(r.noInvention));
ok(r.otherField.coverage === 'Man' && r.otherField.coverageFamily === '',
  'P1b: editing a DIFFERENT field promotes nothing', JSON.stringify(r.otherField));

console.log('\n== 8g. E3b-P1c: promotion is ONE undoable transaction (real history) ==');
// NO skip path. An earlier version returned {skip:true} when the play or
// HistoryManager was missing and every assertion accepted it — so it could
// certify undo behaviour it never exercised. The prerequisites are now explicit
// assertions that FAIL CLOSED, and BOTH registered pairs are driven.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  // Codex E4-2 review, item #2: enumerate every DESCRIPTOR RELATIONSHIP
  // (primary -> sibling pair), not just primary KEYS — Object.keys(PROJECTED_PAIRS)
  // is ['formation','backfield','coverage'], which is only 3, but Formation
  // alone has TWO registered relationships (-> qbAlignment AND -> backfield),
  // so a primary-keyed enumeration silently lets Formation -> Backfield escape
  // coverage entirely (it did, in the version this review corrected).
  const relationships = Object.entries(PG.PROJECTED_PAIRS)
    .flatMap(([primary, pairs]) => pairs.map(pair => `${primary}->${pair.sibling}`));
  const prereq = { hasHistory: !!(hist && typeof hist.undo === 'function' && Array.isArray(hist.stack)),
                   playCount: tagger.plays.length,
                   relationships };
  // FAIL CLOSED with a readable reason instead of the old skip (or a bare
  // TypeError deeper in): the proofs below must never be reported as passing
  // because the machinery they claim to exercise was absent.
  if (!prereq.hasHistory) throw new Error('P1c PREREQ FAILED: no real HistoryManager — undo/redo proofs cannot run');
  if (!prereq.playCount) throw new Error('P1c PREREQ FAILED: no real plays — undo/redo proofs cannot run');
  const runPair = async (colKey, sibling, legacyPrimary, pick, unit) => {
    const play = tagger.plays[0];
    const saved = { primary: play.tags[colKey], sib: play.tags[sibling], unit: play.tags.unit };
    play.tags.unit = unit; play.tags[colKey] = legacyPrimary; play.tags[sibling] = '';
    grid.refresh(); await raf2();
    hist.reset();
    const depth0 = hist.stack.length;
    grid._applyEdit(play, PG.COLUMNS.find(c => c.key === colKey), pick);
    await raf2();
    const entries = hist.stack.length - depth0;
    const now = () => { const p = tagger.getPlay(play.id); return { p: p?.tags[colKey], s: p?.tags[sibling] || '' }; };
    const after = now();
    hist.undo(); await raf2();
    const undone = now();
    hist.redo(); await raf2();
    const redone = now();
    const p = tagger.getPlay(play.id);
    if (p) { p.tags[colKey] = saved.primary; p.tags[sibling] = saved.sib; p.tags.unit = saved.unit; }
    grid.refresh(); await raf2();
    return { entries, after, undone, redone };
  };
  return {
    prereq,
    formationQb: await runPair('formation', 'qbAlignment', 'Under Center', 'Trips', 'offense'),
    // E4-2 review fix: this relationship escaped every prior test — Formation
    // alone embeds BOTH a QB Alignment token and (now) a Backfield 'Empty'
    // token, and the two must be driven independently since one primary
    // commit must protect BOTH siblings in the same transaction.
    formationBackfield: await runPair('formation', 'backfield', 'Ace + Empty', 'Trips', 'offense'),
    // Backfield is now ALSO a registered primary in its own right (a legacy
    // 'Pistol' can still be embedded in backfield's raw string, promoted to
    // qbAlignment).
    backfieldQb: await runPair('backfield', 'qbAlignment', 'Pistol', 'Diamond', 'offense'),
    coverageFamily: await runPair('coverage', 'coverageFamily', 'Man', 'Cover 3', 'defense'),
  };
});
// Prerequisites fail closed — if these break, the proofs below cannot silently pass.
ok(r.prereq.hasHistory, 'P1c prereq: a real HistoryManager is present', JSON.stringify(r.prereq));
ok(r.prereq.playCount > 0, 'P1c prereq: real plays exist to edit', JSON.stringify(r.prereq));
ok(JSON.stringify(r.prereq.relationships) === JSON.stringify(['formation->qbAlignment', 'formation->backfield', 'backfield->qbAlignment', 'coverage->coverageFamily']),
  'P1c prereq: ALL FOUR registered RELATIONSHIPS are covered by this test — enumerated by relationship, not by primary key, so Formation->Backfield cannot silently escape again', JSON.stringify(r.prereq.relationships));
for (const [name, c, primaryLegacy, primaryNew, sibValue] of [
  ['Formation/QB Alignment', r.formationQb, 'Under Center', 'Trips', 'Under Center'],
  ['Formation/Backfield', r.formationBackfield, 'Ace + Empty', 'Trips', 'Empty'],
  ['Backfield/QB Alignment', r.backfieldQb, 'Pistol', 'Diamond', 'Pistol'],
  ['Coverage/Coverage Family', r.coverageFamily, 'Man', 'Cover 3', 'Man'],
]) {
  ok(c.entries === 1, `P1c ${name}: the promote+write commit records EXACTLY ONE history entry`, JSON.stringify(c));
  ok(c.after.p === primaryNew && c.after.s === sibValue, `P1c ${name}: commit wrote the primary + promoted sibling`, JSON.stringify(c.after));
  ok(c.undone.p === primaryLegacy && c.undone.s === '', `P1c ${name}: UNDO restores the raw primary AND blank sibling TOGETHER`, JSON.stringify(c.undone));
  ok(c.redone.p === primaryNew && c.redone.s === sibValue, `P1c ${name}: REDO restores the primary AND promoted sibling TOGETHER`, JSON.stringify(c.redone));
}

console.log('\n== 8h. E4-2: safe Film Room editing for QB Alignment/Backfield/Strength/Coverage Family ==');
// These four columns were DISPLAY-ONLY (`proj-readonly`) in E3b, pending the
// field-level-merge machinery E4/E4-2 built. Proves the same non-writing
// view/cancel contract D-projform requires of the tag form ALSO holds for the
// grid's inline editor, now that these cells are real editable enum cells —
// plus one-step undo/redo for a relationship-free column (Strength) and
// cross-surface parity (a grid edit is visible identically in the tag form
// for the currently-loaded play).
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = tagger.plays[1];
  const saved = JSON.parse(JSON.stringify(play.tags));
  const selBefore = tagger.currentPlayId;   // RESTORED below — this section reselects twice

  // 1) VIEW/SELECT never writes — selecting the row (video follows) must not
  //    touch any of the four newly-editable projected fields.
  tagger.selectPlay(play.id);
  await raf2();
  const afterSelect = JSON.parse(JSON.stringify(tagger.getPlay(play.id).tags));
  const selectUnchanged = JSON.stringify(afterSelect) === JSON.stringify(saved);

  // 2) OPEN + CANCEL never writes — open the QB Alignment editor popover, then
  //    close it WITHOUT committing (mirrors pressing Escape), and confirm the
  //    play is untouched.
  grid._openEditor(play.id, 'qbAlignment');
  await raf2();
  const editorOpened = !!grid._editor;
  grid._closeEditor();
  await raf2();
  const afterCancel = JSON.parse(JSON.stringify(tagger.getPlay(play.id).tags));
  const cancelUnchanged = JSON.stringify(afterCancel) === JSON.stringify(saved);

  // 3) STRENGTH has NO registered sibling relationship at all — an explicit
  //    edit must touch ONLY strength, in exactly one undoable transaction.
  play.tags.unit = 'offense'; play.tags.strength = '';
  grid.refresh(); await raf2();
  hist.reset();
  const depth0 = hist.stack.length;
  grid._applyEdit(play, PG.COLUMNS.find(c => c.key === 'strength'), 'Right');
  await raf2();
  const strengthEntries = hist.stack.length - depth0;
  const afterStrength = tagger.getPlay(play.id);
  const strengthOnlyChanged = Object.keys(saved).every(k =>
    k === 'strength' || k === 'unit' || JSON.stringify(afterStrength.tags[k] ?? null) === JSON.stringify(saved[k] ?? null));
  hist.undo(); await raf2();
  const strengthUndone = tagger.getPlay(play.id).tags.strength || '';

  // 4) CROSS-SURFACE PARITY — select the play into the tag form and confirm
  //    the QB Alignment chip reflects the grid's earlier edit identically
  //    (the grid write and the form's read must never diverge).
  const legacyId = 9201;
  const legacyPlay = { id: legacyId, timestamp: { start: legacyId, end: legacyId + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Under Center + Wing-T' } };
  tagger.plays.push(legacyPlay);
  grid._applyEdit(legacyPlay, PG.COLUMNS.find(c => c.key === 'formation'), 'Wing-T');
  await raf2();
  tagger.selectPlay(legacyId);
  const formChip = [...document.querySelectorAll('#tagQbAlignment .pick.active')].map(el => el.dataset.value);
  const parity = { gridQbAlignment: tagger.getPlay(legacyId).tags.qbAlignment, formChip };

  // restore
  const p = tagger.getPlay(play.id);
  if (p) Object.assign(p.tags, saved);
  tagger.plays = tagger.plays.filter(pl => pl.id !== legacyId);
  if (selBefore != null) tagger.selectPlay(selBefore);
  grid.refresh(); await raf2();

  return { selectUnchanged, editorOpened, cancelUnchanged, strengthEntries, strengthOnlyChanged, strengthUndone, parity };
});
ok(r.selectUnchanged, 'E4-2: selecting a row (view) writes NOTHING to any of the four newly-editable projected fields', JSON.stringify(r));
ok(r.editorOpened, 'E4-2 prereq: the QB Alignment editor actually opened (proves the guard was lifted, not that nothing ran)', JSON.stringify(r));
ok(r.cancelUnchanged, 'E4-2: opening then CANCELING the QB Alignment editor writes NOTHING', JSON.stringify(r));
ok(r.strengthEntries === 1, 'E4-2: an explicit Strength edit (no registered relationship) is exactly ONE history entry', JSON.stringify(r));
ok(r.strengthOnlyChanged, 'E4-2: editing Strength touches NO other field', JSON.stringify(r));
ok(r.strengthUndone === '', 'E4-2: UNDO reverts the Strength edit', JSON.stringify(r));
ok(r.parity.gridQbAlignment === 'Under Center' && JSON.stringify(r.parity.formChip) === JSON.stringify(['Under Center']),
  'E4-2 cross-surface parity: a Formation edit made in the GRID promotes QB Alignment identically to how the TAG FORM displays it — no divergent write path', JSON.stringify(r.parity));

console.log('\n== 8i. E4-2 review fix: DIRECT commit-and-clear of QB Alignment, Backfield, and Coverage Family through the GRID, each with revisit + undo/redo ==');
// Codex E4-2 review, item #2: 8h only directly committed Strength (no
// registered relationship) and only VIEWED/CANCELED QB Alignment — it never
// directly committed THEN CLEARED a sibling's own grid cell. This drives the
// SAME derived-clear-survives-a-revisit proof e2e-tag-projform.mjs runs
// through the tag form, but through the GRID's real _applyEdit path, for all
// three siblings that can be genuinely derived: qbAlignment (from Formation),
// backfield (from Formation's Empty), coverageFamily (from Coverage).
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));

  const runClear = async (siblingKey, primaryKey, primaryLegacy, unit, id) => {
    const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit, down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], [primaryKey]: primaryLegacy } };
    tagger.plays.push(play);
    grid.refresh(); await raf2();
    const derivedBefore = grid._cellHtml(play, PG.COLUMNS.find(c => c.key === siblingKey));
    hist.reset();
    const depth0 = hist.stack.length;
    // A direct commit of '' on the SIBLING's own column — exactly what the
    // grid's "✕ none" chip-popover choice produces via _openEditor's commit.
    grid._applyEdit(play, PG.COLUMNS.find(c => c.key === siblingKey), '');
    await raf2();
    const entries = hist.stack.length - depth0;
    const now = () => { const p = tagger.getPlay(id); return { primary: p?.tags[primaryKey], sibling: p?.tags[siblingKey] || '' }; };
    const afterCommit = now();
    hist.undo(); await raf2();
    const undone = now();
    hist.redo(); await raf2();
    const redone = now();
    // Revisit: re-render the grid from scratch and re-read the cell — proves
    // the clear is durable in the DATA, not merely a transient DOM state.
    grid.refresh(); await raf2();
    const revisitCell = grid._cellHtml(tagger.getPlay(id), PG.COLUMNS.find(c => c.key === siblingKey));
    tagger.plays = tagger.plays.filter(pl => pl.id !== id);
    grid.refresh(); await raf2();
    return { derivedBefore, entries, afterCommit, undone, redone, revisitCell };
  };

  return {
    qbAlignment: await runClear('qbAlignment', 'formation', 'Ace + Shotgun', 'offense', 9202),
    backfield: await runClear('backfield', 'formation', 'Wing-T + Empty', 'offense', 9203),
    coverageFamily: await runClear('coverageFamily', 'coverage', 'Man', 'defense', 9204),
  };
});
for (const [name, c, derivedText, primaryAfterClear, primaryAfterUndo] of [
  ['QB Alignment (from Formation)', r.qbAlignment, 'Shotgun', 'Ace', 'Ace + Shotgun'],
  ['Backfield (from Formation)', r.backfield, 'Empty', 'Wing-T', 'Wing-T + Empty'],
  ['Coverage Family (from Coverage)', r.coverageFamily, 'Man', '', 'Man'],
]) {
  ok(c.derivedBefore === derivedText,
    `${name}: the DERIVED value is genuinely shown before any commit`, JSON.stringify(c.derivedBefore));
  ok(c.entries === 1, `${name}: the direct clear is EXACTLY one history entry`, JSON.stringify(c));
  ok(c.afterCommit.sibling === '' && c.afterCommit.primary === primaryAfterClear,
    `${name}: clearing the sibling strips the primary's raw token in the SAME commit`, JSON.stringify(c.afterCommit));
  ok(c.undone.primary === primaryAfterUndo && c.undone.sibling === '',
    `${name}: UNDO restores the raw legacy primary TOGETHER with the (still-derived, not explicit) sibling`, JSON.stringify(c.undone));
  ok(c.redone.primary === primaryAfterClear && c.redone.sibling === '',
    `${name}: REDO restores the stripped primary TOGETHER with the cleared sibling`, JSON.stringify(c.redone));
  ok(c.revisitCell !== derivedText,
    `${name}: the clear STICKS after a full grid re-render — the derived value does not silently reappear`, JSON.stringify(c.revisitCell));
}

console.log('\n== 8j. E4-2 review fix: the combined "Pistol backfield + Empty formation" case, exercised through the GRID ==');
// Codex named this exact combined shape explicitly ("including the combined
// Pistol Empty case"). formation:"Ace + Empty", backfield:"Pistol" projects
// as qbAlignment=Pistol / formation=Ace / backfield=Empty; an explicit
// Formation commit through the GRID's real _applyEdit path must preserve
// BOTH promotions (qbAlignment AND backfield) in one transaction, with
// working undo/redo. tools/e2e-tag-projform.mjs section 16 proves this same
// shape through the TAG FORM; this is the Film Room grid's own proof, since
// the review explicitly asked this not be Film-Room-untested.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const SE = window.app.stats.constructor;
  const id = 9205;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty', backfield: 'Pistol' } };
  tagger.plays.push(play);
  const before = SE.proj(play);
  grid.refresh(); await raf2();
  hist.reset();
  const depth0 = hist.stack.length;
  grid._applyEdit(play, PG.COLUMNS.find(c => c.key === 'formation'), 'Trips');
  await raf2();
  const entries = hist.stack.length - depth0;
  const now = () => { const p = tagger.getPlay(id); return { formation: p?.tags.formation, backfield: p?.tags.backfield, qbAlignment: p?.tags.qbAlignment }; };
  const afterCommit = now();
  hist.undo(); await raf2();
  const undone = now();
  hist.redo(); await raf2();
  const redone = now();
  tagger.plays = tagger.plays.filter(pl => pl.id !== id);
  grid.refresh(); await raf2();
  return { before, entries, afterCommit, undone, redone };
});
ok(r.before.qbAlignment === 'Pistol' && r.before.formation === 'Ace' && r.before.backfield === 'Empty',
  'prereq: the fixture genuinely projects as Pistol / Ace / Empty', JSON.stringify(r.before));
ok(r.entries === 1, 'the Formation commit through the grid is EXACTLY one history entry', JSON.stringify(r));
ok(r.afterCommit.formation === 'Trips' && r.afterCommit.backfield === 'Empty' && r.afterCommit.qbAlignment === 'Pistol',
  'a GRID Formation commit preserves BOTH promotions (QB Alignment AND Backfield) — neither is lost', JSON.stringify(r.afterCommit));
ok(r.undone.formation === 'Ace + Empty' && r.undone.backfield === 'Pistol' && (r.undone.qbAlignment || '') === '',
  'UNDO restores the raw legacy Formation and Backfield ("Pistol") together, removing only the PROMOTED QB Alignment', JSON.stringify(r.undone));
ok(r.redone.formation === 'Trips' && r.redone.backfield === 'Empty' && r.redone.qbAlignment === 'Pistol',
  'REDO restores the commit and BOTH promoted siblings together', JSON.stringify(r.redone));

console.log('\n== 9. E3b-P3: rendered row equality + Watch equality (all 6 projected columns) ==');
// P3's exact contract (TAG-MODEL.md §20): Film Room has NO six-field quick
// filter, so do not add one here — instead group the RENDERED row IDs by each
// projected cell value, assert those sets equal AnalyticsRegistry.matchingRefs
// (an INDEPENDENT computation, not Film Room's own code), then select one exact
// row set and assert Watch receives the same refs. This is the LAST section
// (see the E3b-INTERACTIVE banner above) and restores every piece of state it
// touches.
//
// Review findings on the first pass of this section, all fixed here:
//  - covered 2 of the 6 StatsEngine.PROJECTED_FIELDS (only qbAlignment/
//    coverageFamily) -> now all six: formation, qbAlignment, backfield,
//    strength, coverage, coverageFamily.
//  - stripped `gameId::` and compared bare play ids, weakening the composite
//    film-identity contract -> both sides now compare FULL composite refs;
//    bare ids are derived only at the point Film Room's own selection API
//    (grid.selected, a Set<number>) requires them.
//  - both the row-equality and completeness checks derived their "expected"
//    set from the CONSUMER'S OWN rendered output, so a value the renderer
//    silently drops was invisible -> added a completeness check that
//    independently enumerates the true value set from raw plays via
//    StatsEngine.proj/splitFormations (never touching grid._render()'s
//    output), matching the same fix applied to Study in this round.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, tagger = window.app.tagger, registry = window.app.analyticsRegistry;
  const SE = window.app.stats.constructor;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  // matchingRefs is a pure function over the plays it's given + a gameId for the
  // composite ref — it never reads the season store, so a synthetic id is fine
  // even with no season currently open (an earlier section closes the season).
  const gameId = 'e3b-p3-fixture';
  const compositeRef = (id) => `${gameId}::${id}`;

  const savedPlays = tagger.plays;
  const savedCols = grid.cols.slice();
  const savedSelected = new Set(grid.selected);
  const savedVc = grid.vc, savedCutup = grid.cutup;

  const mk = (id, unit, tags) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: Object.assign({ unit }, tags), __gid: gameId });
  const plays = [
    // OFFENSE — formation (incl. multi-value), qbAlignment, backfield, strength.
    mk(9001, 'offense', { formation: 'Trips',              qbAlignment: 'Shotgun',      strength: 'Right',   playType: 'Short Pass' }),
    mk(9002, 'offense', { formation: 'Shotgun + Bunch',                                                       playType: 'Deep Pass' }),  // legacy -> projects formation=Bunch, qbAlignment=Shotgun
    mk(9003, 'offense', { formation: 'Ace',                 qbAlignment: 'Under Center', backfield: 'I', strength: 'Balanced', playType: 'Run Inside' }),
    mk(9004, 'offense', { formation: 'Ace',                                                              playType: 'Run Inside' }), // no alignment/backfield/strength charted -> INELIGIBLE for those three
    mk(9009, 'offense', { formation: 'Trips + Bunch',                                     strength: 'Left',   playType: 'Screen' }),      // MULTI-structural: contributes to BOTH Trips and Bunch groups
    mk(9010, 'offense', { formation: '',                                     backfield: 'Pistol',            playType: 'Screen' }),       // formation "Not charted" but backfield still eligible
    // DEFENSE — coverage (Coverage Call) + coverageFamily.
    mk(9005, 'defense', { coverage: 'Man',      defFront: '4-3' }),                                                  // legacy -> projects coverage='' (blank/Coverage Call ineligible), coverageFamily='Man'
    mk(9006, 'defense', { coverage: 'Cover 2',  coverageFamily: 'Zone', defFront: '4-3' }),
    mk(9007, 'defense', { coverage: 'Cover 3',  coverageFamily: 'Man',  defFront: '3-4' }),
    mk(9008, 'defense', { coverage: 'Cover 4',  defFront: '4-3' }),                                                  // no family charted -> coverageFamily INELIGIBLE
  ];

  tagger.plays = plays;
  grid.cols = ['sit', 'formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily', 'playType'];
  grid.selected.clear();
  grid._render();
  await raf2();

  const emDash = '—';
  const NOT_CHARTED = 'Not charted';
  // Groups RENDERED row ids (as COMPOSITE refs — finding 3) by a column's cell
  // text. `multi: true` (formation only) splits a "A + B" cell into both groups.
  const groupByRenderedCell = (colKey, multi = false) => {
    const out = {};
    document.querySelectorAll('#pgRows .pg-row').forEach(row => {
      const id = parseInt(row.dataset.id, 10);
      const cell = row.querySelector(`td[data-k="${colKey}"]`);
      const text = cell ? cell.textContent.trim() : '';
      if (!text || text === emDash || text === NOT_CHARTED) return;   // blank/placeholder = ineligible
      const vals = multi ? text.split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean) : [text];
      vals.forEach(v => { (out[v] = out[v] || []).push(compositeRef(id)); });
    });
    Object.values(out).forEach(arr => arr.sort());
    return out;
  };
  const registryGroup = (cutType, values) => {
    const out = {};
    for (const value of values) out[value] = registry.matchingRefs(plays, cutType, value);   // already composite + sorted
    return out;
  };
  // Independent completeness enumeration — straight off raw `plays`, never
  // through grid._render()'s output, so a value the renderer silently DROPS
  // still shows up here and surfaces as a set mismatch instead of nothing to
  // compare against.
  const OFF_COLS = new Set(['formation', 'qbAlignment', 'backfield', 'strength']);
  const isOff = p => (p.tags.unit || 'offense') === 'offense';
  const isDef = p => p.tags.unit === 'defense';
  const expectedValues = (colKey, multi) => {
    const gate = OFF_COLS.has(colKey) ? isOff : isDef;
    const set = new Set();
    for (const p of plays) {
      if (!gate(p)) continue;
      const raw = SE.proj(p)[colKey];
      const vals = multi ? SE.splitFormations(raw) : (raw ? [raw] : []);
      vals.forEach(v => { if (v) set.add(v); });
    }
    return [...set].sort();
  };

  const COLS = [
    { key: 'formation', cut: 'formation', multi: true },
    { key: 'qbAlignment', cut: 'qbAlignment', multi: false },
    { key: 'backfield', cut: 'backfield', multi: false },
    { key: 'strength', cut: 'strength', multi: false },
    { key: 'coverage', cut: 'coverage', multi: false },
    { key: 'coverageFamily', cut: 'coverageFamily', multi: false },
  ];
  const perCol = {};
  for (const c of COLS) {
    const rendered = groupByRenderedCell(c.key, c.multi);
    perCol[c.key] = {
      rendered,
      registry: registryGroup(c.cut, Object.keys(rendered)),
      expected: expectedValues(c.key, c.multi),
      renderedValues: Object.keys(rendered).sort(),
    };
  }

  // Select the RENDERED qbAlignment="Shotgun" row set and click Watch —
  // cutup.start must receive EXACTLY those plays. Watch/selection are Film
  // Room's OWN bare-id API (single-game scoped by construction), so bare ids
  // are derived here ONLY for driving that call — the comparison above never
  // strips composite identity.
  const shotgunRefs = perCol.qbAlignment.rendered['Shotgun'] || [];
  const shotgunIds = shotgunRefs.map(ref => parseInt(ref.split('::')[1], 10)).sort((a, b) => a - b);
  grid.selected.clear();
  shotgunIds.forEach(id => grid.selected.add(id));
  grid._render();
  await raf2();
  // Review finding: comparing bare watched ids against bare shotgunIds (both
  // stripped) weakened the composite-identity proof back to the same gap
  // finding 3 already fixed elsewhere in this section. Convert the intercepted
  // ids straight BACK into composite refs and compare against `shotgunRefs`
  // (never stripped) — the whole Watch proof now stays at composite-ref
  // granularity end to end.
  let watchedRefs = null;
  grid.vc = { video: { src: 'fake.mp4' } };
  grid.cutup = { start: (ids) => { watchedRefs = ids.map(compositeRef).sort(); } };
  document.getElementById('pgWatch').click();

  const out = { perCol, shotgunRefs, watchedRefs };

  grid.vc = savedVc; grid.cutup = savedCutup;
  tagger.plays = savedPlays;
  grid.cols = savedCols;
  grid.selected = savedSelected;
  grid._render();
  await raf2();
  return out;
});

const setEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const key of ['formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily']) {
  const c = r.perCol[key];
  ok(c.renderedValues.length > 0, `${key}: the synthetic fixture actually renders a non-empty group set (not a vacuous pass)`, JSON.stringify(c.rendered));
  ok(setEq(c.rendered, c.registry), `${key}: rendered row groups (composite refs) == AnalyticsRegistry.matchingRefs, per value`, JSON.stringify({ rendered: c.rendered, registry: c.registry }));
  ok(setEq(c.renderedValues, c.expected), `${key}: rendered group SET is complete — no value silently dropped`, JSON.stringify({ rendered: c.renderedValues, expected: c.expected }));
}
ok(setEq(r.perCol.qbAlignment.rendered['Shotgun'], ['e3b-p3-fixture::9001', 'e3b-p3-fixture::9002']),
  'the legacy mixed play (9002) projects into the SAME rendered Shotgun group as the modern play (9001) — composite refs', JSON.stringify(r.perCol.qbAlignment.rendered['Shotgun']));
ok(setEq(r.perCol.formation.rendered['Trips'], ['e3b-p3-fixture::9001', 'e3b-p3-fixture::9009']) &&
   setEq(r.perCol.formation.rendered['Bunch'], ['e3b-p3-fixture::9002', 'e3b-p3-fixture::9009']),
  'a MULTI-structural formation play (9009, "Trips + Bunch") lands in BOTH rendered groups, alongside their single-value siblings', JSON.stringify({ trips: r.perCol.formation.rendered['Trips'], bunch: r.perCol.formation.rendered['Bunch'] }));
ok(r.shotgunRefs.length > 0 && setEq(r.watchedRefs, r.shotgunRefs.slice().sort()), 'Watch receives EXACTLY the COMPOSITE refs of the selected rendered row group, no more, no fewer', JSON.stringify({ selected: r.shotgunRefs, watched: r.watchedRefs }));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
