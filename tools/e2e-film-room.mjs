import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';
/* E2E Film Room harness -- drives the built bundle headless through the
   NATIVE Film Room route/mode (window.app.nativeFilmRoom / native-film-room.jsx,
   window.app.playGrid's native* API): render on demo data, row click-to-select,
   chip filters, bulk selection + Watch fallback, saved-column/filter
   persistence, projected-column editing, switch-team back-out. Run after build:
     npm run build && node tools/e2e-film-room.mjs

   Final Engine Independence: #playGridSection (the classic inline collapsible
   breakdown strip and its #pgRows/.pg-row/.pg-chip/.pg-pop markup) is DELETED
   from index.html entirely. Film Room is now a full native MODE inside the
   Break Down route (window.app.breakdownWorkspace, toggled via
   [data-bd-view="film-room"]), sharing the route with Chart mode rather than
   living as a separate collapsible section below the video. The former
   "collapse persistence" / "narrow screen defaults collapsed" tests tested a
   classic-only UI affordance (localStorage ffa_film_room_collapsed) that has
   no native equivalent -- that concept was already retired by the S5d
   ownership flip, well before this milestone, and is not reintroduced here. */
import puppeteer from 'puppeteer';
// Plays are current format (legacy excision step 7): each look field is its
// own field, and an edit writes only the field edited.

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const frame = () => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));

// Two SEPARATE evaluate round-trips with a real tick between them -- the
// native cell button's "second click opens the editor" comparison reads
// `active` from a closure captured at the LAST RENDER, so two clicks fired
// inside one synchronous evaluate call both see the SAME stale `active` and
// the editor never opens (found + fixed in e2e-projform-durability.mjs
// during this same milestone -- same root cause, same fix shape here).
const openCellEditor = async (playId, colKey) => {
  const sel = `[data-cell="${playId}:${colKey}"]`;
  await page.evaluate(s => document.querySelector(s)?.click(), sel);
  await frame();
  await page.evaluate(s => document.querySelector(s)?.click(), sel);
  await frame();
};
const clickOptionChip = (text) => page.evaluate(t => {
  const btn = [...document.querySelectorAll('.gi-film-option-chips button')].find(b => b.textContent.trim() === t);
  if (btn) btn.click();
}, text);
const clickEditorFooter = (text) => page.evaluate(t => {
  const btn = [...document.querySelectorAll('.gi-film-cell-editor footer button')].find(b => b.textContent.trim() === t);
  if (btn) btn.click();
}, text);
const escapeEditor = () => page.evaluate(() => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
const editorOpen = () => page.evaluate(() => !!document.querySelector('.gi-film-cell-editor'));

// Home -> open the sample game -> Film Room view. If a prior team switch
// closed the season, reopen it through Home's consolidated library first.
// Film Room is a MODE inside the native breakdown route, never a standalone
// reveal-able surface.
const openFilmRoom = async () => {
  const hasSeason = await page.evaluate(() => !!window.app.storage.seasonStore.hasCurrent());
  if (!hasSeason) {
    await page.evaluate(() => window.app.workspaceShell._openLibrary());
    await page.waitForSelector('[data-library-season] .library-open');
    await page.click('[data-library-season] .library-open');
    await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent());
  }
  await page.evaluate(() => window.app.workspaceShell.show('home'));
  await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
  // V2-A: no per-row Open button -- preview the row, then Continue charting.
  await page.click('.ws-game-row');
  await page.click('#wsContinueCharting');
  await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
  await page.waitForFunction(() => !!document.querySelector('[data-native-film-room]'));
  await page.evaluate(() => { if (window.app.breakdownWorkspace.view !== 'film-room') window.app.breakdownWorkspace._setView('film-room', { userInitiated: true }); });
  await page.waitForFunction(() => !document.querySelector('[data-breakdown-film-room-host]')?.hidden);
  await frame();
};

// Reopen the season and same game through Home after the multi-team section
// closes the active season.
const reopenFilmRoom = async () => {
  await openFilmRoom();
};

console.log('\n== 1. Setup: team + demo season + open game ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await setupTeamAndDemo(page);
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
await page.click('.ws-game-row');
await page.click('#wsContinueCharting');
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
await page.waitForFunction(() => !!document.querySelector('[data-native-film-room]'));
await page.evaluate(() => window.app.breakdownWorkspace._setView('film-room', { userInitiated: true }));
await page.waitForFunction(() => !document.querySelector('[data-breakdown-film-room-host]')?.hidden);
await frame();

console.log('\n== 2. Grid renders on demo data ==');
let r = await page.evaluate(() => {
  const owners = document.querySelectorAll('[data-native-film-room]').length;
  const domRows = document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length;
  const snapshot = window.app.playGrid.nativeSnapshot();
  return { owners, domRows, plays: window.app.tagger.plays.length, visible: snapshot.visible, total: snapshot.total };
});
ok(r.owners === 1, 'exactly one native Film Room owner mounted', JSON.stringify(r));
// V2-H: a game this large (the demo season, 70 plays) is now windowed --
// the DOM renders only the rows near the current scroll position, not one
// <tr> per play. The model is the source of truth for "every play has a
// row"; the DOM only needs to be a genuinely smaller, nonempty subset.
ok(r.visible === r.plays && r.total === r.plays, 'every play is represented in the Film Room model', JSON.stringify(r));
ok(r.domRows > 0 && r.domRows < r.plays, 'the rendered table is a nonempty, windowed subset of a large game', JSON.stringify(r));

console.log('\n== 3. Row click selects the play (click-to-seek path) ==');
r = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('[data-native-film-room] tbody tr')];
  const row = rows[4];
  const cell = row.querySelector('[data-cell]');
  const id = parseInt(cell.dataset.cell.split(':')[0], 10);
  row.querySelector('th.is-play button').click();
  return { id, cur: window.app.tagger.currentPlayId };
});
ok(r.cur === r.id, 'row click sets currentPlayId', JSON.stringify(r));
await frame();
r = await page.evaluate((id) => {
  const row = [...document.querySelectorAll('[data-native-film-room] tbody tr')]
    .find(tr => tr.querySelector('[data-cell]')?.dataset.cell.split(':')[0] === String(id));
  return { hl: !!row?.classList.contains('is-current') };
}, r.id);
ok(r.hl, 'clicked row highlighted', JSON.stringify(r));
r = await page.evaluate(async () => {
  const other = window.app.tagger.plays[9].id;
  window.app.tagger.selectPlay(other);
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const row = [...document.querySelectorAll('[data-native-film-room] tbody tr')]
    .find(tr => tr.classList.contains('is-current'));
  const hl = row ? parseInt(row.querySelector('[data-cell]').dataset.cell.split(':')[0], 10) : null;
  return { other, hl };
});
ok(r.hl === r.other, 'external selectPlay moves grid highlight', JSON.stringify(r));

console.log('\n== 4. Filters ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const chip = (group, val) => document.querySelector(`.gi-film-filters button[data-filter="${group}:${val}"]`);
  // V2-H: a large game windows its rendered rows, so a literal DOM <tr> count
  // is no longer "how many plays match this filter" -- the model's own
  // visible count is, and is exactly what every comparison below already
  // means by "rows()".
  const rows = () => window.app.playGrid.nativeSnapshot().visible;
  const clearFilters = () => [...document.querySelectorAll('.gi-film-controls-actions button')].find(b => b.textContent.trim() === 'Clear filters')?.click();
  const all = rows();
  chip('downs', '3').click();
  await raf2();
  const third = rows();
  const expectedThird = window.app.tagger.plays.filter(p => String(p.tags.down) === '3').length;
  chip('rp', 'Pass').click();
  await raf2();
  const thirdPass = rows();
  // The canonical classifier supplies the expected value -- never a second
  // run/pass rule written here. Reached through the live public service that
  // owns the class, not through a test-only global.
  const SE = window.app.stats.constructor;
  const expectedThirdPass = window.app.tagger.plays.filter(p =>
    String(p.tags.down) === '3' && SE.isPass(p)).length;
  const showing = document.querySelector('.gi-film-controls-head p').textContent;
  clearFilters();
  await raf2();
  const cleared = rows();
  return { all, third, expectedThird, thirdPass, expectedThirdPass, showing, cleared };
});
ok(r.third === r.expectedThird && r.third < r.all, 'down filter narrows to 3rd downs', JSON.stringify(r));
ok(r.thirdPass === r.expectedThirdPass && r.thirdPass < r.third, 'stacking Pass matches StatsEngine.isPass count', JSON.stringify(r));
ok(new RegExp(`${r.thirdPass} of ${r.all} plays`).test(r.showing), '"X of Y plays" count shown', r.showing);
ok(r.cleared === r.all, 'Clear restores all rows');

r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelector('.gi-film-filters button[data-filter="flags:td"]').click();
  await raf2();
  const rows = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  const expected = window.app.tagger.plays.filter(p =>
    String(p.tags.result || '').split(/\s*\+\s*/).map(s => s.trim()).includes('Touchdown')).length;
  [...document.querySelectorAll('.gi-film-controls-actions button')].find(b => b.textContent.trim() === 'Clear filters')?.click();
  await raf2();
  return { rows, expected };
});
ok(r.rows === r.expected && r.rows > 0, 'TD flag filter matches result splits', JSON.stringify(r));

r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelector('.gi-film-filters button[data-filter="flags:untagged"]').click();
  await raf2();
  const rows = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  const emptyShown = !!document.querySelector('.gi-film-empty');
  [...document.querySelectorAll('.gi-film-controls-actions button')].find(b => b.textContent.trim() === 'Clear filters')?.click();
  await raf2();
  return { rows, emptyShown };
});
ok(r.rows === 0 && r.emptyShown, 'Untagged on fully-tagged demo -> empty state', JSON.stringify(r));

console.log('\n== 5. Bulk selection + Watch fallback (no video) ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const boxes = document.querySelectorAll('[data-native-film-room] tbody td.is-check input');
  boxes[0].click(); boxes[1].click();
  await raf2();   // Preact's refresh() defers _notifyNative() via rAF -- the
                   // button's rendered label only reflects the selection after
                   // a real re-render tick (classic's imperative DOM write was
                   // synchronous; native is not).
  const label = document.querySelector('[data-film-watch]').textContent;
  const firstRow = document.querySelectorAll('[data-native-film-room] tbody tr')[0];
  const firstId = parseInt(firstRow.querySelector('[data-cell]').dataset.cell.split(':')[0], 10);
  document.querySelector('[data-film-watch]').click();
  await new Promise(res => setTimeout(res, 150));
  // demo has no film -> fallback selects the first pooled play, no cut-up banner
  return { label, firstId, cur: window.app.tagger.currentPlayId,
           banner: !!document.querySelector('.cutup-banner'),
           cutupActive: window.app.cutupPlayer.active };
});
ok(/Watch 2\b/.test(r.label), 'Watch button shows selection count', r.label);
ok(!r.cutupActive && r.cur === r.firstId, 'no-video Watch falls back to selecting first play', JSON.stringify(r));

r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  document.querySelector('[data-native-film-room] thead input[type="checkbox"]').click();
  await raf2();
  // V2-H: the checkbox column selects every VISIBLE play in the model, not
  // just the ones currently windowed into the DOM -- app.playGrid.selected
  // is the true selection set the Watch button and any bulk action consume.
  const total = window.app.playGrid.nativeSnapshot().visible;
  const checked = window.app.playGrid.selected.size;
  const label = document.querySelector('[data-film-watch]').textContent;
  document.querySelector('[data-native-film-room] thead input[type="checkbox"]').click();
  await raf2();
  const after = window.app.playGrid.selected.size;
  return { total, checked, label, after };
});
ok(r.checked === r.total && new RegExp(`Watch ${r.total}\\b`).test(r.label), 'select-all checks every visible row', JSON.stringify(r));
ok(r.after === 0, 'select-all toggles off');

// Selected rows hidden by a filter must NOT be counted by Watch (the pool
// the button advertises is exactly the pool _watch() uses).
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const firstDowns = window.app.tagger.plays.filter(p => String(p.tags.down) === '1');
  const grid = window.app.playGrid;
  grid.selected.clear();
  grid.selected.add(firstDowns[0].id); grid.selected.add(firstDowns[1].id);
  document.querySelector('.gi-film-filters button[data-filter="downs:3"]').click();
  await raf2();
  const watch = document.querySelector('[data-film-watch]');
  const out = { label: watch.textContent, disabled: watch.disabled };
  [...document.querySelectorAll('.gi-film-controls-actions button')].find(b => b.textContent.trim() === 'Clear filters')?.click();
  grid.selected.clear();
  await raf2();
  return out;
});
ok(/Watch 0\b/.test(r.label) && r.disabled, 'Watch shows 0 + disables when selection is filtered out', JSON.stringify(r));

console.log('\n== 8. Play CRUD keeps grid in sync ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const t = window.app.tagger;
  const before = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  const play = t.plays[0];
  t.selectPlay(play.id);
  play.tags.result = 'Touchdown';
  t._emit('play-updated', play);
  await raf2();
  const cellText = document.querySelector(`[data-cell="${play.id}:result"]`)?.textContent || '';
  return { before, cellText };
});
ok(/Touchdown/.test(r.cellText), 'play-updated refreshes row content', r.cellText);

console.log('\n== 8b. Undo/redo + game switch keep grid in sync (plays-loaded) ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const t = window.app.tagger;
  const before = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  // Simulate undo: HistoryManager._restore replaces plays wholesale.
  const full = JSON.stringify({ plays: t.plays, nextId: t.nextId, currentPlayId: null });
  const partial = JSON.stringify({ plays: t.plays.slice(0, 10), nextId: t.nextId, currentPlayId: null });
  window.app.history._restore(partial);
  await raf2();
  const afterUndo = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  window.app.history._restore(full);
  await raf2();
  const afterRedo = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  return { before, afterUndo, afterRedo };
});
ok(r.afterUndo === 10, 'grid re-renders after history restore (undo)', JSON.stringify(r));
ok(r.afterRedo === r.before, 'grid re-renders after history restore (redo)');

r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const grid = window.app.playGrid;
  const store = window.app.storage.seasonStore;
  // Check two rows in game 1, then switch to game 2 -- selection must clear
  // (play ids restart per game, so stale ids would silently pre-check rows).
  const boxes = document.querySelectorAll('[data-native-film-room] tbody td.is-check input');
  boxes[0].click(); boxes[1].click();
  const otherGame = store.data.games.find(g => g.id !== store.data.activeGameId);
  window.app.storage.switchToGame(otherGame.id);
  await new Promise(res => setTimeout(res, 300));
  await raf2();
  return { selected: grid.selected.size,
           checked: document.querySelectorAll('[data-native-film-room] tbody td.is-check input:checked').length,
           // V2-H: a large game's rows are windowed in the DOM -- the model's
           // own total is "did game 2's plays actually load", not a literal
           // per-play <tr> count.
           total: grid.nativeSnapshot().total,
           domRows: document.querySelectorAll('[data-native-film-room] tbody tr:not(.gi-film-row-spacer)').length,
           current: document.querySelectorAll('[data-native-film-room] tbody tr.is-current').length,
           taggerCur: window.app.tagger.currentPlayId };
});
ok(r.selected === 0 && r.checked === 0, 'game switch clears row selection', JSON.stringify(r));
ok(r.total > 50, 'game 2 plays render after switch', JSON.stringify(r));

console.log('\n== 8c. v2: tendency row + inline editing ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid;
  // The tendency line is a DISPLAY surface driven by grid.nativeSnapshot() --
  // read the exact same computed value the native table header renders,
  // rather than parsing a classic .pg-tend row that no longer exists.
  const formTend = grid.nativeSnapshot().columns.find(c => c.key === 'formation')?.tendency || '';
  const counts = {};
  let total = 0;
  // E3b: the tendency line is a DISPLAY surface and reads the PROJECTED formation,
  // so the independent expectation must project too. `total` is therefore the §6.5
  // ELIGIBLE denominator -- an alignment-only play (projected formation blank) is
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

  // DETERMINISTIC multi-value case -- does NOT mirror the implementation. Three
  // eligible plays, "Wing-T" on ALL of them, one carrying a second token:
  //   eligible plays = 3, Wing-T = 3  ->  "Wing-T 100%"
  // The token-counting bug yields 4 tokens -> "Wing-T 75%", so this case FAILS on
  // the old math and is the failing-first pin for the denominator.
  const mk = (id, formation) => ({ id, timestamp: { start: 0, end: 1 }, tags: { unit: 'offense', formation } });
  const multi = [mk(1, 'Wing-T + Trips'), mk(2, 'Wing-T'), mk(3, 'Wing-T')];
  const multiTend = grid._tendency({ key: 'formation', type: 'enum' }, multi);
  // Top value on a SUBSET: Trips is on 2 of 3 eligible plays -> "Trips 67%".
  // (Token math would be 2/4 = 50%, so this also discriminates.)
  const subset = [mk(1, 'Wing-T + Trips'), mk(2, 'Trips'), mk(3, 'Ace')];
  const subsetTend = grid._tendency({ key: 'formation', type: 'enum' }, subset);
  return { text: formTend, expected, multiTend, subsetTend };
});
ok(r.text === r.expected, 'formation tendency = top value + share', JSON.stringify(r));
ok(r.multiTend === 'Wing-T 100%', 'tendency denominator counts ELIGIBLE PLAYS, not tokens (multi-value)', JSON.stringify(r.multiTend));
ok(r.subsetTend === 'Trips 67%', 'tendency share of a subset value uses the eligible-play denominator (2/3, not 2/4)', JSON.stringify(r.subsetTend));

console.log('\n== 8c-2. E3b: tendency value/share + eligible denominator across ALL SIX projected columns ==');
// Review finding (E3b): the P3 contract says "the tendency line must use the
// SAME projected grouping and eligible denominator" for the projected columns
// generally, but the prior pass only wired it for the two columns that were
// editable at the time (formation, coverage) and left the other four
// (qbAlignment, backfield, strength, coverageFamily -- DISPLAY-ONLY/
// `proj-readonly` in E3b, made genuinely editable in E4-2) rendering nothing.
// Whether a column is editable is a separate concern from whether a summary
// is useful, so _tendency() routes every projected column through the
// identical enum math. All four are single-value, so the multi-value split
// is a no-op for them; this is genuinely the SAME calculation, not a parallel
// one. Fully pure -- unaffected by the classic-DOM deletion.
r = await page.evaluate(() => {
  const grid = window.app.playGrid;
  const mkDef = (id, coverage, coverageFamily) => ({ id, timestamp: { start: 0, end: 1 }, tags: { unit: 'defense', coverage, coverageFamily } });
  // The fourth play charts a family (Man) and no call -- Coverage Call is
  // blank (ineligible). _tendency() requires >= 3 ELIGIBLE plays before it
  // shows anything at all, so three real Cover 2 calls establish that floor;
  // the family-only play must NOT count toward it. If Coverage Call's tendency counted the Man play anyway,
  // eligible=4/Cover2=3 -> "75%" instead of the correct eligible=3/Cover2=3
  // -> "100%" (mirrors the Formation multi-value discriminator above, for a
  // single-value column instead).
  const covPlays = [mkDef(1, 'Cover 2'), mkDef(2, 'Cover 2'), mkDef(3, 'Cover 2'), mkDef(4, '', 'Man')];
  const coverageTend = grid._tendency(grid.constructor.COLUMNS.find(c => c.key === 'coverage'), covPlays);

  // Each proj-readonly column gets the SAME three-part proof formation/coverage
  // already had: (a) top value + correct share, (b) a blank play EXCLUDED from
  // the eligible denominator rather than counted as ineligible-but-present,
  // (c) below the 3-eligible-play floor renders nothing at all.
  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 1 }, tags: Object.assign({ unit: 'offense' }, tags) });
  const fixtures = {
    qbAlignment: [mk(1, { qbAlignment: 'Shotgun' }), mk(2, { qbAlignment: 'Shotgun' }), mk(3, { qbAlignment: 'Under Center' }), mk(4, {})],
    // NOT 'Pistol' -- Pistol is a QB alignment, never a backfield value.
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
    // (the 4th play stays -- still blank/ineligible) drops eligible count to 2.
    const belowFloor = grid._tendency(col, fixtures[key].filter(p => p.id !== 3));
    projReadonly[key] = { type: col.type, full, belowFloor };
  }
  return { coverageTend, projReadonly, expectedTop };
});
ok(r.coverageTend === 'Cover 2 100%', 'coverage (Coverage Call) tendency uses the ELIGIBLE denominator -- the family-only play is excluded, not counted as a fourth eligible play', JSON.stringify(r.coverageTend));
for (const key of ['qbAlignment', 'backfield', 'strength', 'coverageFamily']) {
  const c = r.projReadonly[key];
  const expected = `${r.expectedTop[key]} 67%`;
  ok(c.type === 'enum', `${key} is a genuine editable enum column (E4-2) -- confirms this proof targets the right half of the six columns`, JSON.stringify(c));
  ok(c.full === expected, `${key} tendency = top value + share, with the blank play EXCLUDED from the eligible denominator (2/3, not 2/4)`, JSON.stringify({ key, ...c }));
  ok(c.belowFloor === '', `${key} renders NOTHING below the minimum-3-eligible-play threshold (2 eligible plays here)`, JSON.stringify({ key, ...c }));
}

console.log('\n== 8d. E3b/E4-2: projected cells + editable projected columns + saved-column upgrade ==');
// Fully pure -- _cellText/_cell and PG.COLUMNS never touch the classic .pg-*
// markup. (The saved-column upgrade from old stock lists is converted once at
// boot and tested in e2e-settings-format.)
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const mk = (id, tags) => ({ id, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'offense' }, tags) });
  const cell = (p, key) => grid._cellText(p, PG.COLUMNS.find(c => c.key === key));
  const alignOnly = mk(1, { formation: '', qbAlignment: 'Under Center' });   // no formation charted
  const structural = mk(2, { formation: 'Trips', qbAlignment: 'Shotgun' });
  const defFam = mk(3, { unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Zone' });
  return {
    alignFormation: cell(alignOnly, 'formation'),
    alignQb: cell(alignOnly, 'qbAlignment'),
    structFormation: cell(structural, 'formation'),
    structQb: cell(structural, 'qbAlignment'),
    covFamily: cell(defFam, 'coverageFamily'),
    // E4-2: these columns are now genuinely editable (behavior proven in the
    // dedicated BEHAVIORAL block below) -- this just confirms the declared type.
    qbType: PG.COLUMNS.find(c => c.key === 'qbAlignment').type,
    famType: PG.COLUMNS.find(c => c.key === 'coverageFamily').type,
    newDefault: PG.PRESETS.default,
    newDefense: PG.PRESETS.defense,
  };
});
ok(/Not charted/.test(r.alignFormation) && !/Shotgun/.test(r.alignFormation) && !/Unknown/.test(r.alignFormation),
  'alignment-only play: Formation cell reads "Not charted" (never Shotgun/Unknown)', JSON.stringify(r.alignFormation));
ok(/Under Center/.test(r.alignQb), 'QB Alignment column shows the stored alignment', JSON.stringify(r.alignQb));
ok(/Trips/.test(r.structFormation) && !/Shotgun/.test(r.structFormation),
  'Formation cell shows the formation only', JSON.stringify(r.structFormation));
ok(/Shotgun/.test(r.structQb), 'QB Alignment column shows its own field beside the formation', JSON.stringify(r.structQb));
ok(/Zone/.test(r.covFamily), 'Coverage Family column shows the stored family', JSON.stringify(r.covFamily));
ok(r.qbType === 'enum' && r.famType === 'enum',
  'QB Alignment + Coverage Family are declared as genuine editable enum columns (E4-2)', JSON.stringify(r));

ok(r.newDefault.includes('qbAlignment') && r.newDefense.includes('coverageFamily'),
  'the presets expose QB Alignment and Coverage Family', JSON.stringify({ d: r.newDefault, f: r.newDefense }));

console.log('\n== Multi-enum inline edit: Result cell (native, real overlay editor) ==');
r = await page.evaluate(() => {
  const row = document.querySelectorAll('[data-native-film-room] tbody tr')[2];
  const id = parseInt(row.querySelector('[data-cell]').dataset.cell.split(':')[0], 10);
  return { id };
});
const resultId = r.id;
await openCellEditor(resultId, 'result');
const resultEditorOpened = await editorOpen();
if (resultEditorOpened) {
  // clear any active chips, pick Touchdown, Done
  await page.evaluate(() => {
    document.querySelectorAll('.gi-film-option-chips button.is-active').forEach(c => c.click());
  });
  await clickOptionChip('Touchdown');
  await clickEditorFooter('Done');
  await frame();
}
r = await page.evaluate((id) => {
  const play = window.app.tagger.getPlay(id);
  const cellText = document.querySelector(`[data-cell="${id}:result"]`)?.textContent || '';
  const formVal = window.app.nativeTagging.snapshot().values.result;   // play is selected -> Chart shows it
  return { tag: play.tags.result, cellText, formVal, popGone: !document.querySelector('.gi-film-cell-editor') };
}, resultId);
ok(resultEditorOpened, 'second click on the same cell opens the editor', String(resultEditorOpened));
ok(r.tag === 'Touchdown' && /Touchdown/.test(r.cellText), 'multi-enum edit commits to tags + cell', JSON.stringify(r));
ok(r.formVal === 'Touchdown', 'Chart shows the grid edit for the selected play', r.formVal);
ok(r.popGone, 'editor closes after Done');

// Yardage magnitude + Loss sign rule (mirror of the form). Fully pure.
r = await page.evaluate(() => {
  const grid = window.app.playGrid;
  const play = window.app.tagger.plays.find(p => (p.tags.result || '').includes('Loss'));
  grid._applyEdit(play, { key: 'yardage', type: 'yds' }, '9');
  return { stored: play.tags.yardage };
});
ok(r.stored === '-9', 'yardage magnitude gets Loss sign (-9)', r.stored);

console.log('\n== Dn & Dist composite editor (native) ==');
r = await page.evaluate(() => {
  const row = document.querySelectorAll('[data-native-film-room] tbody tr')[4];
  const id = parseInt(row.querySelector('[data-cell]').dataset.cell.split(':')[0], 10);
  return { id };
});
const sitId = r.id;
await openCellEditor(sitId, 'sit');
await clickOptionChip('3');
await page.evaluate(() => {
  const input = document.querySelector('.gi-film-cell-editor input[type="number"]');
  if (input) { input.value = '8'; input.dispatchEvent(new Event('input', { bubbles: true })); }
});
await clickEditorFooter('Done');
await frame();
r = await page.evaluate((id) => {
  const play = window.app.tagger.getPlay(id);
  return { down: play.tags.down, dist: play.tags.distance,
           cell: document.querySelector(`[data-cell="${id}:sit"]`)?.textContent || '' };
}, sitId);
ok(r.down === '3' && r.dist === '8' && /3rd & 8/.test(r.cell), 'Dn & Dist editor commits both fields', JSON.stringify(r));

console.log('\n== 8d. v2: keyboard navigation ==');
await page.evaluate(() => document.querySelector('[data-native-film-room] [data-cell$=":formation"]')?.click());
await frame();
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const focused = document.querySelector('[data-native-film-room] .is-focus');
  const id0 = focused ? parseInt(focused.dataset.cell.split(':')[0], 10) : null;
  focused?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }));
  await raf2();
  const f1el = document.querySelector('[data-native-film-room] .is-focus');
  const f1 = f1el ? { playId: parseInt(f1el.dataset.cell.split(':')[0], 10), colKey: f1el.dataset.cell.split(':')[1] } : null;
  f1el?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
  await new Promise(res => setTimeout(res, 80));
  const popOpen = !!document.querySelector('.gi-film-cell-editor');
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  await new Promise(res => setTimeout(res, 80));
  return { id0, f1, popOpen, popClosed: !document.querySelector('.gi-film-cell-editor'),
           selectedFollows: f1 ? window.app.tagger.currentPlayId === f1.playId : false };
});
ok(!!r.f1 && r.f1.playId !== r.id0 && r.f1.colKey === 'formation', 'ArrowDown moves focus to next play, same column', JSON.stringify(r.f1));
ok(r.selectedFollows, 'video selection follows vertical focus moves', JSON.stringify(r));
ok(r.popOpen && r.popClosed, 'Enter opens editor, Esc closes', JSON.stringify(r));

console.log('\n== 8e. v2: custom columns ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const screen = window.app.nativeFilmRoom;
  screen.applyPreset('defense');
  await raf2();
  const defHeads = [...document.querySelectorAll('[data-native-film-room] thead th span')].map(h => h.textContent.trim());
  const saved = ((g) => (JSON.parse(localStorage.getItem(g.columnsKey()) || '{}') || {})[g._colScope()] || [])(window.app.playGrid);
  screen.setColumn('quarter', true);
  await raf2();
  const withQtr = ((g) => (JSON.parse(localStorage.getItem(g.columnsKey()) || '{}') || {})[g._colScope()] || [])(window.app.playGrid);
  screen.applyPreset('default');
  await raf2();
  return { defHeads, saved, withQtr, expected: window.app.playGrid.constructor.PRESETS.defense };
});
ok(r.defHeads.includes('Front') && r.defHeads.includes('Cover') && !r.defHeads.includes('Formation'),
  'Defense preset swaps columns', JSON.stringify(r.defHeads));
// E3b: the Defense preset now carries Coverage Family immediately after Coverage
// Call (coach-specified placement) -- compared against the real preset array
// rather than a hardcoded snapshot, so this can't drift silently.
ok(JSON.stringify(r.saved) === JSON.stringify(r.expected),
  'preset persisted to localStorage', JSON.stringify(r.saved));
ok(r.withQtr.includes('quarter'), 'setColumn adds a column (persisted)', JSON.stringify(r.withQtr));

console.log('\n== 8f. v2: saved filters ==');
r = await page.evaluate(async () => {
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const chip = (g, v) => document.querySelector(`.gi-film-filters button[data-filter="${g}:${v}"]`);
  chip('downs', '3').click(); await raf2();
  chip('rp', 'Pass').click(); await raf2();
  const filteredCount = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  const screen = window.app.nativeFilmRoom;
  const saveOk = screen.saveFilter('3rd down passes');
  await raf2();
  const stored = JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]');
  screen.clearFilters();
  await raf2();
  const clearedCount = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  screen.applySavedFilter(0);
  await raf2();
  const reapplied = document.querySelectorAll('[data-native-film-room] tbody tr').length;
  // delete it
  screen.deleteSavedFilter(0);
  await raf2();
  const after = JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]');
  screen.clearFilters();
  await raf2();
  return { saveOk, filteredCount, stored, clearedCount, reapplied, after };
});
ok(r.saveOk, 'saveFilter reports success', JSON.stringify(r.saveOk));
ok(r.stored.length === 1 && r.stored[0].name === '3rd down passes' &&
   JSON.stringify(r.stored[0].f.downs) === '["3"]' && r.stored[0].f.rp === 'Pass',
  'filter saved with full criteria', JSON.stringify(r.stored));
ok(r.reapplied === r.filteredCount && r.reapplied < r.clearedCount,
  'saved filter re-applies identically', JSON.stringify({ f: r.filteredCount, re: r.reapplied, all: r.clearedCount }));
ok(r.after.length === 0, 'saved filter deletable');

console.log('\n== 9. Multi-team: add a JV team through the canonical controller ==');
await page.evaluate(async () => { await window.app.workspaceShell.enable(); await window.app.workspaceShell._openLibrary(); });
await page.waitForSelector('.library-panel');
r = await page.evaluate(() => ({
  teams: window.app.teamRegistry.teams().map(team => team.teamName),
  route: document.getElementById('workspaceShell')?.dataset.route,
}));
ok(r.teams.length === 1 && r.teams[0] === 'Mavericks' && r.route === 'home',
  'Home library begins with the Mavericks program', JSON.stringify(r));

await page.evaluate(() => { window.app.teamHubScreen.openAddTeam(null); });
await page.waitForSelector('[data-overlay-id="team-hub-add-team"]');
r = await page.evaluate(() => ({
  form: !!document.querySelector('[data-overlay-id="team-hub-add-team"] .gi-hub-dialog-form'),
  cancel: [...document.querySelectorAll('[data-overlay-id="team-hub-add-team"] button')].some(button => button.textContent.trim() === 'Cancel'),
}));
ok(r.form && r.cancel, 'native add-team dialog shows with Cancel', JSON.stringify(r));
await page.type('[data-overlay-id="team-hub-add-team"] input[name="school"]', 'JV Squad');
await page.click('[data-overlay-id="team-hub-add-team"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => JSON.parse(localStorage.getItem('ffa_team_profile') || '{}').teamName === 'JV Squad');
r = await page.evaluate(() => ({
  active: window.app.teamHubScreen.snapshot().profile.teamName,
  teams: window.app.teamRegistry.teams().length,
  seasons: window.app.teamHubScreen.snapshot().railSeasons.length,
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}').teamName,
  hasCurrent: window.app.storage.seasonStore.hasCurrent(),
}));
ok(r.teams === 2 && r.active === 'JV Squad', 'JV team added and active', JSON.stringify(r));
ok(r.profile === 'JV Squad', 'canonical profile shows JV', JSON.stringify(r));
ok(r.seasons === 0, 'JV program has no seasons because the sample belongs to Mavericks', String(r.seasons));
ok(!r.hasCurrent, 'open season was closed on team switch');

console.log('\n== 10. No-season roster state cannot leak across teams ==');
await page.evaluate(() => window.app.roster.loadFrom([{ num: '7', name: 'JV Kid', pos: 'QB', side: 'O' }]));
await page.evaluate(() => window.app.teamHubScreen.switchTeam('mavericks'));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'mavericks');
const mavCount = await page.evaluate(() => window.app.roster.players.length);
await page.evaluate(() => window.app.teamHubScreen.switchTeam('jv-squad'));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'jv-squad');
r = await page.evaluate(() => ({ count:window.app.roster.players.length, name:window.app.roster.players[0]?.name || '' }));
ok(mavCount === 0, 'Mavericks roster untouched by JV player', String(mavCount));
ok(r.count === 0 && !r.name, 'a roster with no owning season is not restored on switch back', JSON.stringify(r));

console.log('\n== 11. Mavericks still owns the sample; remove-team guard ==');
await page.evaluate(() => window.app.teamHubScreen.switchTeam('mavericks'));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'mavericks');
r = await page.evaluate(() => ({
  seasonIds: window.app.teamHubScreen.snapshot().railSeasons.map(season => season.id),
  demoId: localStorage.getItem('ffa_demo_season_id') || '',
}));
const mavericksSeasonCount = r.seasonIds.length;
ok(mavericksSeasonCount >= 1 && r.demoId && r.seasonIds.includes(r.demoId),
  'Mavericks still lists the sample season by canonical id', JSON.stringify(r));
await page.evaluate(() => { window.app.teamHubScreen.removeActiveTeam(null); });
await page.waitForSelector('.gi-overlay-panel');
r = await page.evaluate(() => document.querySelector('.gi-overlay-panel')?.textContent || '');
ok(new RegExp(`owns ${mavericksSeasonCount} seasons?`, 'i').test(r),
  'team with seasons cannot be removed and reports the current season count', r);
await page.click('[data-overlay-action="ok"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));

await page.evaluate(() => window.app.teamHubScreen.switchTeam('jv-squad'));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'jv-squad');
await page.evaluate(() => { window.app.teamHubScreen.removeActiveTeam(null); });
await page.waitForSelector('.gi-overlay-panel.is-destructive');
r = await page.evaluate(() => document.querySelector('.gi-overlay-panel.is-destructive')?.textContent || '');
ok(/Remove JV Squad/i.test(r), 'empty team gets the remove confirmation', r);
await page.click('[data-overlay-action="delete"]');
await page.waitForFunction(() => window.app.teamRegistry.teams().length === 1);
r = await page.evaluate(() => ({
  teams:window.app.teamRegistry.teams().length,
  active:JSON.parse(localStorage.getItem('ffa_team_profile') || '{}').teamName,
  rosterCount:window.app.roster.players.length,
}));
ok(r.teams === 1 && r.active === 'Mavericks', 'JV removed and Mavericks active again', JSON.stringify(r));
ok(r.rosterCount === 0, 'removing a team does not hydrate an ambient roster');

// Grid inline editor must match the tag form's semantics exactly (v1.9.30):
// exclusivity (no "Gain + Loss"), auto-Gain on positive yardage, and clearing
// _autoSit so Save & Next can't overwrite a grid Dn&Dist correction. Fully
// pure -- synthetic play objects, no DOM at all.
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
ok(r.exclusive === 'Loss', 'grid drops the exclusive rival: "Gain + Loss" -> "Loss" (was stored as-is)', JSON.stringify(r));
ok(r.exclSign === '-8', 'yardage then takes the Loss sign (-8), not flipped from a stale "Gain + Loss"', JSON.stringify(r));
ok(r.autoGain === 'Gain' && r.autoGainSign === '12', 'positive yardage with no result auto-sets Gain (mirror of the form)', JSON.stringify(r));
ok(r.autoSitCleared && r.sit === '3&7', 'a grid Dn&Dist edit clears _autoSit so Save & Next cannot overwrite it', JSON.stringify(r));


// ===================================================================
// E3b INTERACTIVE tests run LAST on purpose: they drive real clicks and open
// editors, which changes the grid's selection/focus. Reopen Film Room first --
// the multi-team section closed the active season on team switch, so it must
// be re-entered through Team Hub -> Home -> the same game -> Film Room view.
// ===================================================================
await reopenFilmRoom();

// BEHAVIORAL editable proof (E4-2) -- the type check above is a DECLARATION
// and would stay green even if the editor still refused these columns.
// Drive the real interactions: E4-2 made qbAlignment/coverageFamily
// genuinely editable, but OPENING the editor (without picking a chip) must
// still write nothing -- the same view/cancel-never-writes contract
// D-projform requires of the tag form.
r = await page.evaluate(() => {
  const tagger = window.app.tagger;
  const play = tagger.plays[0];
  // Since 2026-09-24 a defense column is blank on an offensive row in All plays,
  // so Coverage Family is exercised on a defensive play, as a coach would.
  const def = tagger.plays.find(p => p.tags?.unit === 'defense');
  return { skip: !play, playId: play?.id, defId: def?.id ?? play?.id };
});
if (r.skip) {
  ok(true, 'the now-editable columns actually render a cell to interact with (skipped: no play)');
  ok(true, 'E4-2 BEHAVIORAL: a 2nd click genuinely OPENS the editor on the new columns (skipped: no play)');
  ok(true, 'E4-2 BEHAVIORAL: Enter also opens the editor (skipped: no play)');
  ok(true, 'E4-2 BEHAVIORAL: a direct editor() call also produces an editable model (skipped: no play)');
  ok(true, 'E4-2 BEHAVIORAL: OPENING (never committing) fires no play-updated event (skipped: no play)');
  ok(true, 'E4-2 BEHAVIORAL: play tags are byte-identical after opening + canceling every interaction (skipped: no play)');
} else {
  const playId = r.playId, defId = r.defId;
  const playFor = key => (key === 'coverageFamily' ? defId : playId);
  await page.evaluate((id) => window.app.tagger.selectPlay(id), playId);
  await frame();
  const colsBefore = await page.evaluate(() => window.app.playGrid.cols.slice());
  const selBefore = await page.evaluate(() => window.app.tagger.currentPlayId);
  const before = await page.evaluate((ids) => JSON.stringify(ids.map(id => window.app.tagger.getPlay(id).tags)), [playId, defId]);
  await page.evaluate(() => { window.__giUpdCount = 0; window.app.tagger.on('play-updated', () => { window.__giUpdCount++; }); });

  const results = {};
  for (const key of ['qbAlignment', 'coverageFamily']) {
    const pid = playFor(key);
    // Bring the key's play into the table's rendered window.
    await page.evaluate((id) => { const rows = window.app.playGrid.nativeSnapshot().rows; const i = rows.findIndex(r => r.id === id); const wrap = document.querySelector('.gi-film-table-wrap'); if (wrap && i >= 0) { wrap.scrollTop = Math.max(0, i * 34 - 40); wrap.dispatchEvent(new Event('scroll')); } }, pid);
    await frame();
    await page.evaluate((k) => {
      const grid = window.app.playGrid;
      if (!grid.cols.includes(k)) { grid.cols = [...grid.cols, k]; grid._notifyNative(); }
    }, key);
    await frame();
    results[key + 'Rendered'] = await page.evaluate((id, k) => !!document.querySelector(`[data-cell="${id}:${k}"]`), pid, key);
    if (!results[key + 'Rendered']) continue;

    // 2nd click on the same cell genuinely opens the editor.
    await openCellEditor(pid, key);
    results[key + 'EditorFromClick'] = await editorOpen();
    await escapeEditor();
    await frame();

    // Enter on the focused cell also opens it.
    await page.evaluate((id, k) => document.querySelector(`[data-cell="${id}:${k}"]`)?.click(), pid, key);
    await frame();
    await page.evaluate(() => document.querySelector('[data-native-film-room] .is-focus')
      ?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
    await new Promise(res => setTimeout(res, 80));
    results[key + 'EditorFromEnter'] = await editorOpen();
    await escapeEditor();
    await frame();

    // A direct native editor() call (the non-UI path) also produces a real
    // editable model -- the exact function the JSX itself calls to build the
    // popover, without going through a click at all.
    results[key + 'EditorFromDirect'] = await page.evaluate((id, k) => !!window.app.nativeFilmRoom.editor(id, k), pid, key);
  }
  const updatesCount = await page.evaluate(() => window.__giUpdCount);
  const after = await page.evaluate((ids) => JSON.stringify(ids.map(id => window.app.tagger.getPlay(id).tags)), [playId, defId]);
  r = { skip: false, ...results, updates: updatesCount, unchanged: after === before };
  await page.evaluate((cols) => { window.app.playGrid.cols = cols; window.app.playGrid._notifyNative(); }, colsBefore);
  await frame();
  if (selBefore != null) { await page.evaluate((id) => window.app.tagger.selectPlay(id), selBefore); await frame(); }

  ok(r.qbAlignmentRendered && r.coverageFamilyRendered,
    'the now-editable columns actually render a cell to interact with', JSON.stringify(r));
  ok(r.qbAlignmentEditorFromClick && r.coverageFamilyEditorFromClick,
    'E4-2 BEHAVIORAL: a 2nd click genuinely OPENS the editor on the new columns (not just a type declaration)', JSON.stringify(r));
  ok(r.qbAlignmentEditorFromEnter && r.coverageFamilyEditorFromEnter,
    'E4-2 BEHAVIORAL: Enter also opens the editor', JSON.stringify(r));
  ok(r.qbAlignmentEditorFromDirect && r.coverageFamilyEditorFromDirect,
    'E4-2 BEHAVIORAL: a direct editor() call also produces an editable model', JSON.stringify(r));
  ok(r.updates === 0, 'E4-2 BEHAVIORAL: OPENING (never committing) fires no play-updated event', JSON.stringify(r));
  ok(r.unchanged, 'E4-2 BEHAVIORAL: play tags are byte-identical after opening + canceling every interaction -- view/cancel never writes', JSON.stringify(r));
}

console.log('\n== 8e. Formation editor seed; a Formation commit writes ONLY the formation ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const col = PG.COLUMNS.find(c => c.key === 'formation');
  const mk = (tags) => ({ id: 9001, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'offense' }, tags) });
  const out = {};

  // (a) SEED -- proven through the REAL native editor() model builder, the
  // exact non-UI function the JSX calls to construct the popover's initial state.
  const openOn = (formationValue) => {
    const real = grid.tagger.plays[0];
    const saved = real.tags.formation;
    real.tags.formation = formationValue;
    const model = window.app.nativeFilmRoom.editor(real.id, 'formation');
    const active = model.col.multi
      ? String(model.value || '').split(/\s*\+\s*/).filter(Boolean)
      : (model.value ? [model.value] : []);
    const res = { opened: !!model, active, offered: model.options };
    real.tags.formation = saved;
    return res;
  };
  const blankOpen = openOn('');
  out.blankOpened = blankOpen.opened;
  out.seedBlankActive = blankOpen.active;                  // must be EMPTY
  // A seen alignment value must still not reach the Formation picker.
  grid._optionCache = {};
  out.optsHaveAlignment = blankOpen.offered.concat(grid._options(col, ['Shotgun', 'Trips'])).some(o => ['Under Center', 'Shotgun', 'Pistol'].includes(o));
  out.seedMultiActive = openOn('Trips + Bunch').active;     // both values

  // (b) a Formation commit leaves the stored QB alignment alone.
  const p1 = mk({ formation: '', qbAlignment: 'Under Center' });
  grid._applyEdit(p1, col, 'Trips');
  out.kept = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };
  const p2 = mk({ formation: 'Trips', qbAlignment: 'Pistol' });
  grid._applyEdit(p2, col, 'Bunch');
  out.explicitWins = { formation: p2.tags.formation, qbAlignment: p2.tags.qbAlignment };
  // (c) a play with no alignment gains none (no invention).
  const p3 = mk({ formation: 'Ace' });
  grid._applyEdit(p3, col, 'Trips');
  out.noInvention = { formation: p3.tags.formation, qbAlignment: p3.tags.qbAlignment || '' };
  // (d) editing a DIFFERENT field leaves the look alone.
  const p4 = mk({ formation: 'Ace', qbAlignment: '', playType: '' });
  grid._applyEdit(p4, PG.COLUMNS.find(c => c.key === 'playType'), 'Run Inside');
  out.otherField = { formation: p4.tags.formation, qbAlignment: p4.tags.qbAlignment || '' };

  // (e) building the direct editor() model writes NOTHING.
  const real = grid.tagger.plays[0];
  if (real) {
    const selBefore = grid.tagger.currentPlayId;
    const before5 = JSON.stringify(real.tags);
    const model = window.app.nativeFilmRoom.editor(real.id, 'formation');
    out.editorOpened = !!model;
    out.openCancelUnchanged = JSON.stringify(real.tags) === before5;
    if (selBefore != null) grid.tagger.selectPlay(selBefore);
  } else { out.editorOpened = false; out.openCancelUnchanged = true; }
  return out;
});
ok(r.blankOpened, 'seed: the Formation editor model builds (seed assertions are not vacuous)', JSON.stringify(r.blankOpened));
ok(Array.isArray(r.seedBlankActive) && r.seedBlankActive.length === 0,
  'seed: a play with no formation seeds the REAL editor model with NO active value', JSON.stringify(r.seedBlankActive));
ok(JSON.stringify(r.seedMultiActive) === JSON.stringify(['Trips', 'Bunch']),
  'seed: a multi-value formation activates each of its values in the real editor model', JSON.stringify(r.seedMultiActive));
ok(!r.optsHaveAlignment, 'the Formation picker offers NO QB alignments', JSON.stringify(r.optsHaveAlignment));
ok(r.kept.formation === 'Trips' && r.kept.qbAlignment === 'Under Center',
  'a Formation commit writes the formation and leaves the QB alignment as stored', JSON.stringify(r.kept));
ok(r.explicitWins.formation === 'Bunch' && r.explicitWins.qbAlignment === 'Pistol',
  'an explicit qbAlignment is never overwritten by a Formation commit', JSON.stringify(r.explicitWins));
ok(r.noInvention.formation === 'Trips' && r.noInvention.qbAlignment === '',
  'no alignment is INVENTED when the play never had one', JSON.stringify(r.noInvention));
ok(r.otherField.formation === 'Ace' && r.otherField.qbAlignment === '',
  'editing a DIFFERENT field leaves the look alone', JSON.stringify(r.otherField));
ok(r.editorOpened, 'the Formation editor model DOES build (so the no-write check is not vacuous)', JSON.stringify(r.editorOpened));
ok(r.openCancelUnchanged, 'building the editor model writes NOTHING', JSON.stringify(r.openCancelUnchanged));

console.log('\n== 8f. COVERAGE CALL: the call picker offers no family; a call commit writes only the call ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const col = PG.COLUMNS.find(c => c.key === 'coverage');
  const mkD = (tags) => ({ id: 9101, timestamp: { start: 0, end: 1 }, notes: '', tags: Object.assign({ unit: 'defense' }, tags) });
  const out = {};
  grid._optionCache = {};
  out.offered = grid._options(col, ['Man']);
  out.offersFamily = out.offered.some(o => ['Man', 'Zone', 'Match'].includes(o));
  const c1 = mkD({ coverage: '', coverageFamily: 'Man' });
  grid._applyEdit(c1, col, 'Cover 3');
  out.kept = { coverage: c1.tags.coverage, coverageFamily: c1.tags.coverageFamily };
  const c2 = mkD({ coverage: 'Cover 1', coverageFamily: 'Zone' });
  grid._applyEdit(c2, col, 'Cover 2');
  out.explicitWins = { coverage: c2.tags.coverage, coverageFamily: c2.tags.coverageFamily };
  const c3 = mkD({ coverage: 'Cover 1' });
  grid._applyEdit(c3, col, 'Cover 4');
  out.noInvention = { coverage: c3.tags.coverage, coverageFamily: c3.tags.coverageFamily || '' };
  const c4 = mkD({ coverage: '', coverageFamily: 'Man' });
  grid._applyEdit(c4, PG.COLUMNS.find(c => c.key === 'result'), 'Incomplete');
  out.otherField = { coverage: c4.tags.coverage || '', coverageFamily: c4.tags.coverageFamily || '' };
  return out;
});
ok(!r.offersFamily, 'the Coverage CALL picker offers NO family values (Man/Zone/Match)', JSON.stringify(r.offered));
ok(r.kept.coverage === 'Cover 3' && r.kept.coverageFamily === 'Man',
  'a Coverage commit writes the call and leaves the stored family', JSON.stringify(r.kept));
ok(r.explicitWins.coverage === 'Cover 2' && r.explicitWins.coverageFamily === 'Zone',
  'an explicit coverageFamily is never overwritten by a Coverage commit', JSON.stringify(r.explicitWins));
ok(r.noInvention.coverage === 'Cover 4' && r.noInvention.coverageFamily === '',
  'no family is INVENTED when the play never had one', JSON.stringify(r.noInvention));
ok(r.otherField.coverage === '' && r.otherField.coverageFamily === 'Man',
  'editing a DIFFERENT field leaves the coverage alone', JSON.stringify(r.otherField));

console.log('\n== 8g. A look edit through the grid is ONE undoable transaction and touches ONLY its field (real history) ==');
// NO skip path: the prerequisites are explicit assertions that FAIL CLOSED.
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const prereq = { hasHistory: !!(hist && typeof hist.undo === 'function' && Array.isArray(hist.stack)),
                   playCount: tagger.plays.length };
  if (!prereq.hasHistory) throw new Error('8g PREREQ FAILED: no real HistoryManager -- undo/redo proofs cannot run');
  if (!prereq.playCount) throw new Error('8g PREREQ FAILED: no real plays -- undo/redo proofs cannot run');
  // Edit colKey from oldVal to pick on a real play whose neighbor field holds
  // otherVal; the neighbor must be untouched through commit, undo and redo.
  const runField = (colKey, other, oldVal, otherVal, pick, unit) => {
    const play = tagger.plays[0];
    const saved = { col: play.tags[colKey], other: play.tags[other], unit: play.tags.unit };
    play.tags.unit = unit; play.tags[colKey] = oldVal; play.tags[other] = otherVal;
    hist.reset();
    const depth0 = hist.stack.length;
    grid._applyEdit(play, PG.COLUMNS.find(c => c.key === colKey), pick);
    const entries = hist.stack.length - depth0;
    const now = () => { const q = tagger.getPlay(play.id); return { v: q?.tags[colKey] || '', o: q?.tags[other] || '' }; };
    const after = now();
    hist.undo();
    const undone = now();
    hist.redo();
    const redone = now();
    const q = tagger.getPlay(play.id);
    if (q) { q.tags[colKey] = saved.col; q.tags[other] = saved.other; q.tags.unit = saved.unit; }
    return { entries, after, undone, redone };
  };
  return {
    prereq,
    formation: runField('formation', 'qbAlignment', 'Ace', 'Under Center', 'Trips', 'offense'),
    qbAlignment: runField('qbAlignment', 'formation', 'Shotgun', 'Trips', 'Pistol', 'offense'),
    backfield: runField('backfield', 'qbAlignment', 'I', 'Pistol', 'Empty', 'offense'),
    coverage: runField('coverage', 'coverageFamily', 'Cover 1', 'Man', 'Cover 3', 'defense'),
    coverageFamily: runField('coverageFamily', 'coverage', 'Man', 'Cover 3', 'Zone', 'defense'),
  };
});
ok(r.prereq.hasHistory, '8g prereq: a real HistoryManager is present', JSON.stringify(r.prereq));
ok(r.prereq.playCount > 0, '8g prereq: real plays exist to edit', JSON.stringify(r.prereq));
for (const [name, c, oldVal, otherVal, pick] of [
  ['Formation', r.formation, 'Ace', 'Under Center', 'Trips'],
  ['QB Alignment', r.qbAlignment, 'Shotgun', 'Trips', 'Pistol'],
  ['Backfield', r.backfield, 'I', 'Pistol', 'Empty'],
  ['Coverage', r.coverage, 'Cover 1', 'Man', 'Cover 3'],
  ['Coverage Family', r.coverageFamily, 'Man', 'Cover 3', 'Zone'],
]) {
  ok(c.entries === 1, name + ': the commit records EXACTLY ONE history entry', JSON.stringify(c));
  ok(c.after.v === pick && c.after.o === otherVal, name + ': the commit writes its field and leaves the neighbor field as stored', JSON.stringify(c.after));
  ok(c.undone.v === oldVal && c.undone.o === otherVal, name + ': UNDO restores the field; the neighbor is unchanged', JSON.stringify(c.undone));
  ok(c.redone.v === pick && c.redone.o === otherVal, name + ': REDO reapplies the field; the neighbor is unchanged', JSON.stringify(c.redone));
}

console.log('\n== 8h. E4-2: safe Film Room editing for QB Alignment/Backfield/Strength/Coverage Family ==');
// These four columns were DISPLAY-ONLY (`proj-readonly`) in E3b, pending the
// field-level-merge machinery E4/E4-2 built. Proves the same non-writing
// view/cancel contract D-projform requires of the tag form ALSO holds for the
// grid's inline editor, now that these cells are real editable enum cells --
// plus one-step undo/redo for a relationship-free column (Strength) and
// cross-surface parity (a grid edit is visible identically in the tag form
// for the currently-loaded play, mounted into a throwaway scratch host since
// .tag-section/#tagQbAlignment are deleted).
r = await page.evaluate(() => {
  const tagger = window.app.tagger;
  const play = tagger.plays[1];
  return { playId: play.id, saved: JSON.parse(JSON.stringify(play.tags)), selBefore: tagger.currentPlayId };
});
const playId8h = r.playId, saved8h = r.saved, selBefore8h = r.selBefore;

// 1) VIEW/SELECT never writes -- selecting the row (video follows) must not
//    touch any of the four newly-editable projected fields.
r = await page.evaluate((id) => {
  window.app.tagger.selectPlay(id);
  return JSON.parse(JSON.stringify(window.app.tagger.getPlay(id).tags));
}, playId8h);
const selectUnchanged8h = JSON.stringify(r) === JSON.stringify(saved8h);
await frame();

// 2) OPEN + CANCEL never writes -- open the QB Alignment editor popover via
//    two real clicks (with a tick between), then close it WITHOUT committing
//    (Escape), and confirm the play is untouched.
await page.evaluate(() => {
  const grid = window.app.playGrid;
  if (!grid.cols.includes('qbAlignment')) { grid.cols = [...grid.cols, 'qbAlignment']; grid._notifyNative(); }
});
await frame();
await openCellEditor(playId8h, 'qbAlignment');
const editorOpened8h = await editorOpen();
await escapeEditor();
await frame();
r = await page.evaluate((id) => JSON.parse(JSON.stringify(window.app.tagger.getPlay(id).tags)), playId8h);
const cancelUnchanged8h = JSON.stringify(r) === JSON.stringify(saved8h);

// 3) STRENGTH has NO registered sibling relationship at all -- an explicit
//    edit must touch ONLY strength, in exactly one undoable transaction.
r = await page.evaluate((id) => {
  const grid = window.app.playGrid, hist = window.app.history;
  const tagger = window.app.tagger;
  const play = tagger.getPlay(id);
  const saved = JSON.parse(JSON.stringify(play.tags));
  play.tags.unit = 'offense'; play.tags.strength = '';
  grid._notifyNative();
  hist.reset();
  const depth0 = hist.stack.length;
  grid._applyEdit(play, grid.constructor.COLUMNS.find(c => c.key === 'strength'), 'Right');
  const strengthEntries = hist.stack.length - depth0;
  const afterStrength = tagger.getPlay(id);
  const strengthOnlyChanged = Object.keys(saved).every(k =>
    k === 'strength' || k === 'unit' || JSON.stringify(afterStrength.tags[k] ?? null) === JSON.stringify(saved[k] ?? null));
  hist.undo();
  const strengthUndone = tagger.getPlay(id).tags.strength || '';
  return { strengthEntries, strengthOnlyChanged, strengthUndone };
}, playId8h);
const { strengthEntries, strengthOnlyChanged, strengthUndone } = r;
await frame();

// 4) CROSS-SURFACE PARITY -- select the play into the tag form (mounted into
//    a scratch host, since the real tagging host is currently in film-room
//    mode and hidden) and confirm the QB Alignment chip reflects the grid's
//    earlier edit identically -- the grid write and the form's read must
//    never diverge. The real host is captured and remounted afterward so
//    later sections keep a genuine mounted tagging surface.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, PG = grid.constructor;
  const tagger = window.app.tagger;
  const parityId = 9201;
  const parityPlay = { id: parityId, timestamp: { start: parityId, end: parityId + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Wing-T', qbAlignment: '' } };
  tagger.plays.push(parityPlay);
  grid._applyEdit(parityPlay, PG.COLUMNS.find(c => c.key === 'qbAlignment'), 'Under Center');
  const realHost = document.querySelector('[data-breakdown-tagging-host]');
  const scratchHost = document.createElement('div');
  document.body.append(scratchHost);
  window.app.nativeTagging.mount(scratchHost);
  tagger.selectPlay(parityId);
  await new Promise(res => queueMicrotask(res));
  const formChip = [...scratchHost.querySelectorAll('[data-native-field="qbAlignment"] .gi-tag-chips button.is-active')].map(b => b.textContent.trim());
  window.app.nativeTagging.restore();
  scratchHost.remove();
  if (realHost) window.app.nativeTagging.mount(realHost);
  const parity = { gridQbAlignment: tagger.getPlay(parityId).tags.qbAlignment, formChip };
  tagger.plays = tagger.plays.filter(pl => pl.id !== parityId);
  return parity;
});
const parity8h = r;

// restore
await page.evaluate((data) => {
  const { playId, saved, selBefore } = data;
  const p = window.app.tagger.getPlay(playId);
  if (p) Object.assign(p.tags, saved);
  const grid = window.app.playGrid;
  grid.cols = grid.constructor.PRESETS.default.slice();
  grid._notifyNative();
  if (selBefore != null) window.app.tagger.selectPlay(selBefore);
}, { playId: playId8h, saved: saved8h, selBefore: selBefore8h });
await frame();

ok(selectUnchanged8h, 'E4-2: selecting a row (view) writes NOTHING to any of the four newly-editable projected fields');
ok(editorOpened8h, 'E4-2 prereq: the QB Alignment editor actually opened (proves the guard was lifted, not that nothing ran)');
ok(cancelUnchanged8h, 'E4-2: opening then CANCELING the QB Alignment editor writes NOTHING');
ok(strengthEntries === 1, 'E4-2: an explicit Strength edit (no registered relationship) is exactly ONE history entry', String(strengthEntries));
ok(strengthOnlyChanged, 'E4-2: editing Strength touches NO other field');
ok(strengthUndone === '', 'E4-2: UNDO reverts the Strength edit', strengthUndone);
ok(parity8h.gridQbAlignment === 'Under Center' && JSON.stringify(parity8h.formChip) === JSON.stringify(['Under Center']),
  'E4-2 cross-surface parity: a QB Alignment edit made in the GRID is what the TAG FORM displays -- no divergent write path', JSON.stringify(parity8h));

console.log('\n== 8i. A direct CLEAR of QB Alignment, Backfield and Coverage Family through the GRID clears only that field, with revisit + undo/redo ==');
r = await page.evaluate(() => {
  const grid = window.app.playGrid, PG = grid.constructor, hist = window.app.history;
  const tagger = window.app.tagger;
  const runClear = (key, stored, other, otherVal, unit, id) => {
    const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit, down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], [key]: stored, [other]: otherVal } };
    tagger.plays.push(play);
    const shownBefore = grid._cellText(play, PG.COLUMNS.find(c => c.key === key));
    hist.reset();
    const depth0 = hist.stack.length;
    grid._applyEdit(play, PG.COLUMNS.find(c => c.key === key), '');
    const entries = hist.stack.length - depth0;
    const now = () => { const q = tagger.getPlay(id); return { v: q?.tags[key] || '', o: q?.tags[other] || '' }; };
    const afterCommit = now();
    hist.undo();
    const undone = now();
    hist.redo();
    const redone = now();
    const revisitCell = grid._cellText(tagger.getPlay(id), PG.COLUMNS.find(c => c.key === key));
    tagger.plays = tagger.plays.filter(pl => pl.id !== id);
    return { shownBefore, entries, afterCommit, undone, redone, revisitCell };
  };
  return {
    qbAlignment: runClear('qbAlignment', 'Shotgun', 'formation', 'Ace', 'offense', 9202),
    backfield: runClear('backfield', 'Empty', 'formation', 'Wing-T', 'offense', 9203),
    coverageFamily: runClear('coverageFamily', 'Man', 'coverage', 'Cover 1', 'defense', 9204),
  };
});
for (const [name, c, stored, otherVal] of [
  ['QB Alignment', r.qbAlignment, 'Shotgun', 'Ace'],
  ['Backfield', r.backfield, 'Empty', 'Wing-T'],
  ['Coverage Family', r.coverageFamily, 'Man', 'Cover 1'],
]) {
  ok(c.shownBefore.includes(stored), name + ': the stored value is shown before any commit', JSON.stringify(c.shownBefore));
  ok(c.entries === 1, name + ': the direct clear is EXACTLY one history entry', JSON.stringify(c));
  ok(c.afterCommit.v === '' && c.afterCommit.o === otherVal, name + ': the clear empties its field; the neighbor field is unchanged', JSON.stringify(c.afterCommit));
  ok(c.undone.v === stored && c.undone.o === otherVal, name + ': UNDO restores the value', JSON.stringify(c.undone));
  ok(c.redone.v === '' && c.redone.o === otherVal, name + ': REDO clears it again', JSON.stringify(c.redone));
  ok(!c.revisitCell.includes(stored), name + ': the clear STICKS after a fresh cell read', JSON.stringify(c.revisitCell));
}

console.log('\n== 9. E3b-P3: rendered row equality + Watch equality (all 6 projected columns) ==');
// P3's exact contract (TAG-MODEL.md §20): Film Room has NO six-field quick
// filter, so do not add one here -- instead group the RENDERED row IDs by each
// projected cell value, assert those sets equal AnalyticsRegistry.matchingRefs
// (an INDEPENDENT computation, not Film Room's own code), then select one exact
// row set and assert Watch receives the same refs. This is the LAST section
// (see the E3b-INTERACTIVE banner above) and restores every piece of state it
// touches.
r = await page.evaluate(async () => {
  const grid = window.app.playGrid, tagger = window.app.tagger, registry = window.app.analyticsRegistry;
  const SE = window.app.stats.constructor;
  const raf2 = () => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  // matchingRefs is a pure function over the plays it's given + a gameId for the
  // composite ref -- it never reads the season store, so a synthetic id is fine
  // even with no season currently open (an earlier section closes the season).
  const gameId = 'e3b-p3-fixture';
  const compositeRef = (id) => `${gameId}::${id}`;

  const savedPlays = tagger.plays;
  const savedCols = grid.cols.slice();
  const savedSelected = new Set(grid.selected);
  const savedVc = grid.vc, savedCutup = grid.cutup;

  const mk = (id, unit, tags) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: Object.assign({ unit }, tags), __gid: gameId });
  const plays = [
    // OFFENSE -- formation (incl. multi-value), qbAlignment, backfield, strength.
    mk(9001, 'offense', { formation: 'Trips',              qbAlignment: 'Shotgun',      strength: 'Right',   playType: 'Short Pass' }),
    mk(9002, 'offense', { formation: 'Bunch',              qbAlignment: 'Shotgun',                              playType: 'Deep Pass' }),
    mk(9003, 'offense', { formation: 'Ace',                 qbAlignment: 'Under Center', backfield: 'I', strength: 'Balanced', playType: 'Run Inside' }),
    mk(9004, 'offense', { formation: 'Ace',                                                              playType: 'Run Inside' }), // no alignment/backfield/strength charted -> INELIGIBLE for those three
    mk(9009, 'offense', { formation: 'Trips + Bunch',                                     strength: 'Left',   playType: 'Screen' }),      // MULTI-structural: contributes to BOTH Trips and Bunch groups
    mk(9010, 'offense', { formation: '',                                     backfield: 'Empty',             playType: 'Screen' }),       // formation "Not charted" but backfield still eligible
    // DEFENSE -- coverage (Coverage Call) + coverageFamily.
    mk(9005, 'defense', { coverage: '',         coverageFamily: 'Man', defFront: '4-3' }),                           // family only: Coverage Call ineligible
    mk(9006, 'defense', { coverage: 'Cover 2',  coverageFamily: 'Zone', defFront: '4-3' }),
    mk(9007, 'defense', { coverage: 'Cover 3',  coverageFamily: 'Man',  defFront: '3-4' }),
    mk(9008, 'defense', { coverage: 'Cover 4',  defFront: '4-3' }),                                                  // no family charted -> coverageFamily INELIGIBLE
  ];

  tagger.plays = plays;
  grid.cols = ['sit', 'formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily', 'playType'];
  grid.selected.clear();
  grid._notifyNative();
  await raf2();

  const emDash = '—';
  const NOT_CHARTED = 'Not charted';
  // Groups RENDERED row ids (as COMPOSITE refs -- finding 3) by a column's cell
  // text. `multi: true` (formation only) splits a "A + B" cell into both groups.
  const groupByRenderedCell = (colKey, multi = false) => {
    const out = {};
    document.querySelectorAll('[data-native-film-room] tbody tr').forEach(row => {
      const idCell = row.querySelector('[data-cell]');
      const id = idCell ? parseInt(idCell.dataset.cell.split(':')[0], 10) : null;
      const cell = id != null ? row.querySelector(`[data-cell="${id}:${colKey}"]`) : null;
      const text = cell ? cell.textContent.trim() : '';
      if (!text || text === emDash || text === NOT_CHARTED || text === '--') return;   // blank/placeholder = ineligible
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
  // Independent completeness enumeration -- straight off raw `plays`, never
  // through the rendered table, so a value the renderer silently DROPS still
  // shows up here and surfaces as a set mismatch instead of nothing to
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

  // Select the RENDERED qbAlignment="Shotgun" row set and click Watch --
  // cutup.start must receive EXACTLY those plays. Watch/selection are Film
  // Room's OWN bare-id API (single-game scoped by construction), so bare ids
  // are derived here ONLY for driving that call -- the comparison above never
  // strips composite identity.
  const shotgunRefs = perCol.qbAlignment.rendered['Shotgun'] || [];
  const shotgunIds = shotgunRefs.map(ref => parseInt(ref.split('::')[1], 10)).sort((a, b) => a - b);
  grid.selected.clear();
  shotgunIds.forEach(id => grid.selected.add(id));
  grid._notifyNative();
  await raf2();
  // Review finding: comparing bare watched ids against bare shotgunIds (both
  // stripped) weakened the composite-identity proof back to the same gap
  // finding 3 already fixed elsewhere in this section. Convert the intercepted
  // ids straight BACK into composite refs and compare against `shotgunRefs`
  // (never stripped) -- the whole Watch proof now stays at composite-ref
  // granularity end to end.
  let watchedRefs = null;
  grid.vc = { video: { src: 'fake.mp4' } };
  grid.cutup = { start: (ids) => { watchedRefs = ids.map(compositeRef).sort(); } };
  document.querySelector('[data-film-watch]').click();

  const out = { perCol, shotgunRefs, watchedRefs };

  grid.vc = savedVc; grid.cutup = savedCutup;
  tagger.plays = savedPlays;
  grid.cols = savedCols;
  grid.selected = savedSelected;
  grid._notifyNative();
  await raf2();
  return out;
});

const setEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
for (const key of ['formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily']) {
  const c = r.perCol[key];
  ok(c.renderedValues.length > 0, `${key}: the synthetic fixture actually renders a non-empty group set (not a vacuous pass)`, JSON.stringify(c.rendered));
  ok(setEq(c.rendered, c.registry), `${key}: rendered row groups (composite refs) == AnalyticsRegistry.matchingRefs, per value`, JSON.stringify({ rendered: c.rendered, registry: c.registry }));
  ok(setEq(c.renderedValues, c.expected), `${key}: rendered group SET is complete -- no value silently dropped`, JSON.stringify({ rendered: c.renderedValues, expected: c.expected }));
}
ok(setEq(r.perCol.qbAlignment.rendered['Shotgun'], ['e3b-p3-fixture::9001', 'e3b-p3-fixture::9002']),
  'both Shotgun plays (9001, 9002) land in the SAME rendered Shotgun group -- composite refs', JSON.stringify(r.perCol.qbAlignment.rendered['Shotgun']));
ok(setEq(r.perCol.formation.rendered['Trips'], ['e3b-p3-fixture::9001', 'e3b-p3-fixture::9009']) &&
   setEq(r.perCol.formation.rendered['Bunch'], ['e3b-p3-fixture::9002', 'e3b-p3-fixture::9009']),
  'a MULTI-structural formation play (9009, "Trips + Bunch") lands in BOTH rendered groups, alongside their single-value siblings', JSON.stringify({ trips: r.perCol.formation.rendered['Trips'], bunch: r.perCol.formation.rendered['Bunch'] }));
ok(r.shotgunRefs.length > 0 && setEq(r.watchedRefs, r.shotgunRefs.slice().sort()), 'Watch receives EXACTLY the COMPOSITE refs of the selected rendered row group, no more, no fewer', JSON.stringify({ selected: r.shotgunRefs, watched: r.watchedRefs }));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('CONSOLE/PAGE ERRORS:'); errors.slice(0, 10).forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail ? 1 : 0);
