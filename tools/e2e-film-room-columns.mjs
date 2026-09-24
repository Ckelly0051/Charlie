/**
 * FILM ROOM COLUMN SETS PER UNIT (coach direction, 2026-09-24). The table keeps
 * four column sets -- Offense, Defense, Special Teams and All plays -- and the
 * unit FILTER picks the one on screen. Editing columns while a unit is shown
 * changes only that unit's set. Sets persist per program. The coach's existing
 * single column list seeds All plays and is left untouched. In All plays a
 * unit-specific column is blank, and not editable, on a row of another unit.
 * Run:  node tools/e2e-film-room-columns.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 40)))));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
// A coach arriving with an existing custom single column list.
await page.evaluateOnNewDocument(() => {
  if (!sessionStorage.getItem('seeded')) {
    localStorage.setItem('ffa_film_room_cols', JSON.stringify(['sit', 'formation', 'defFront', 'result']));
    sessionStorage.setItem('seeded', '1');
  }
});
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

const seed = () => page.evaluate(async () => {
  const app = window.app;
  if (!app.storage.seasonStore.data) await app.storage.createSeason({ name: 'Columns', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const mk = (id, unit, extra) => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [],
    tags: Object.assign({ unit, down: '1', distance: '10', result: 'Gain', yardage: '4', custom: [], players: {}, grades: {} }, extra) });
  g.plays = [
    mk(1, 'offense', { formation: 'Ace', playType: 'Run Inside', runPass: 'Run' }),
    mk(2, 'defense', { defFront: '4-3', coverage: 'Cover 3', runPass: 'Pass', playType: 'Short Pass' }),
    mk(3, 'special', { stType: 'Punt' }),
  ];
  g.nextId = 4;
  app.tagger.plays = g.plays; app.tagger.nextId = 4; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
  document.querySelector('[data-bd-view="film-room"]').click();
});
const view = () => page.evaluate(() => {
  const grid = window.app.playGrid, snap = grid.nativeSnapshot();
  const heads = [...document.querySelectorAll('[data-native-film-room] thead th span')].map(h => h.textContent.trim());
  let stored = null; try { stored = JSON.parse(localStorage.getItem(grid.columnsKey())); } catch {}
  return { scope: snap.columnScope, label: snap.columnScopeLabel, cols: snap.activeColumns, heads, stored, key: grid.columnsKey(),
    legacy: localStorage.getItem('ffa_film_room_cols') };
});
const filter = async (value) => { await page.click(`[data-film-controls] [data-filter="unit:${value}"]`); await settle(page); };

console.log('\n== 1. The unit filter picks the column set ==');
await seed(); await settle(page);
const PG = await page.evaluate(() => { const P = window.app.playGrid.constructor; return { default: P.PRESETS.default, offense: P.PRESETS.offense, defense: P.PRESETS.defense, special: P.PRESETS.special }; });
let v = await view();
ok(v.scope === 'all' && JSON.stringify(v.cols) === JSON.stringify(['sit', 'formation', 'defFront', 'result']),
  'All plays inherits the existing custom column list', JSON.stringify(v));
await filter('offense'); v = await view();
ok(v.scope === 'offense' && JSON.stringify(v.cols) === JSON.stringify(PG.offense), 'Offense shows the offense set (seeded from its preset)', JSON.stringify(v.cols));
await filter('defense'); v = await view();
ok(v.scope === 'defense' && JSON.stringify(v.cols) === JSON.stringify(PG.defense) && v.heads.includes('Front') && !v.heads.includes('Formation'),
  'Defense shows the defense set', JSON.stringify(v.heads));
await filter('special'); v = await view();
ok(v.scope === 'special' && JSON.stringify(v.cols) === JSON.stringify(PG.special), 'Special Teams shows its own set', JSON.stringify(v.cols));
await page.evaluate(() => window.app.nativeFilmRoom.clearFilters()); await settle(page); v = await view();
ok(v.scope === 'all' && v.cols.includes('formation'), 'clearing the filter returns to All plays', JSON.stringify(v));

console.log('\n== 2. Editing columns changes only the set on screen ==');
await filter('defense');
await page.evaluate(() => window.app.nativeFilmRoom.setColumn('quarter', true)); await settle(page);
v = await view();
ok(v.cols.includes('quarter') && v.heads.includes('Qtr'), 'Qtr added while viewing Defense appears in the defense table', JSON.stringify(v.heads));
ok(v.stored && v.stored.defense.includes('quarter') && !v.stored.offense.includes('quarter') && !v.stored.all.includes('quarter') && !v.stored.special.includes('quarter'),
  'only the defense set changed, and it is stored', JSON.stringify(v.stored));
const team = await page.evaluate(() => localStorage.getItem('ffa_active_team_id') || 'default');
ok(v.key === `ffa_film_room_columns_${team}` && v.legacy === JSON.stringify(['sit', 'formation', 'defFront', 'result']),
  'sets are stored per program; the old single list is left untouched', JSON.stringify({ key: v.key, legacy: v.legacy }));
await filter('offense'); v = await view();
ok(!v.cols.includes('quarter') && !v.heads.includes('Qtr'), 'the offense table is unaffected', JSON.stringify(v.heads));

console.log('\n== 3. The Columns panel edits the set on screen ==');
await filter('defense');
await page.click('[data-film-controls] [data-film-columns]');
await settle(page);
const panel = await page.evaluate(() => {
  const title = [...document.querySelectorAll('h1,h2,h3,[class*="title"]')].map(e => e.textContent.trim()).find(t => /columns$/i.test(t)) || '';
  const scope = document.querySelector('.gi-film-columns-scope')?.textContent.trim();
  const units = [...document.querySelectorAll('.gi-film-column-list label')].map(l => l.dataset.columnUnit);
  return { title, scope, firstUnits: units.slice(0, 4), lastDefense: units.lastIndexOf('defense'), firstOther: units.findIndex(u => u !== 'defense') };
});
ok(/Defense columns/.test(panel.title) && panel.scope === 'Columns for Defense', 'the panel names the set it edits', JSON.stringify(panel));
ok(panel.firstUnits.every(u => u === 'defense') && panel.lastDefense < panel.firstOther, 'defense fields lead the list', JSON.stringify(panel));
// Codex (c1cce33): the sheet is non-modal. Changing the unit filter behind it
// closes it, and a write naming the old set is refused.
// The sheet covers the filter card at this width; the filter can still change
// underneath it (keyboard, another surface), so drive it through the controller.
await page.evaluate(() => window.app.nativeFilmRoom.toggleFilter('unit', 'offense')); await settle(page);
const moved = await page.evaluate(() => {
  const open = !!document.querySelector('.gi-film-column-list');
  const refused = window.app.nativeFilmRoom.setColumn('hash', true, 'defense');
  const grid = window.app.playGrid;
  return { open, refused, offenseHasHash: grid.cols.includes('hash'), scope: grid._colScope() };
});
ok(!moved.open, 'changing the unit filter closes the Columns sheet it was opened for', JSON.stringify(moved));
ok(moved.refused === false && !moved.offenseHasHash, 'a column write naming another unit\'s set is refused', JSON.stringify(moved));
await page.evaluate(() => window.app.overlays.dismissTop('done')); await settle(page);

console.log('\n== 4. All plays: a column of another unit is blank and not editable ==');
await page.evaluate(() => window.app.nativeFilmRoom.clearFilters()); await settle(page);
const mixed = await page.evaluate(() => {
  const cell = (id, k) => document.querySelector(`[data-cell="${id}:${k}"]`);
  return { frontOnOffense: cell(1, 'defFront')?.textContent.trim(), frontOnDefense: cell(2, 'defFront')?.textContent.trim(),
    formationOnDefense: cell(2, 'formation')?.textContent.trim(), formationOnOffense: cell(1, 'formation')?.textContent.trim() };
});
ok(mixed.frontOnOffense === '' && mixed.formationOnDefense === '' && mixed.frontOnDefense === '4-3' && mixed.formationOnOffense === 'Ace',
  'unit-specific cells are blank on other units and filled on their own', JSON.stringify(mixed));
await page.click('[data-cell="1:defFront"]'); await settle(page);
await page.click('[data-cell="1:defFront"]'); await settle(page);
const naOpen = await page.evaluate(() => !!document.querySelector('.gi-film-cell-editor'));
await page.keyboard.press('Enter'); await settle(page);
const naEnter = await page.evaluate(() => !!document.querySelector('.gi-film-cell-editor'));
await page.click('[data-cell="2:defFront"]'); await settle(page);
await page.click('[data-cell="2:defFront"]'); await settle(page);
const ownOpen = await page.evaluate(() => !!document.querySelector('.gi-film-cell-editor'));
await page.evaluate(() => window.app.overlays.dismissTop('cancel')); await settle(page);
ok(!naOpen && !naEnter && ownOpen, 'a blank other-unit cell opens no editor by click or Enter; its own unit\'s cell does', JSON.stringify({ naOpen, naEnter, ownOpen }));

console.log('\n== 5. Persistence and program scoping ==');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });
await seed(); await settle(page);
await filter('defense'); v = await view();
ok(v.cols.includes('quarter'), 'the defense set survives a reload', JSON.stringify({ cols: v.cols, key: v.key, team, stored: v.stored }));
const other = await page.evaluate(() => {
  const real = localStorage.getItem('ffa_active_team_id');
  localStorage.setItem('ffa_active_team_id', 'team-b');
  const grid = window.app.playGrid;
  const cols = grid.cols.slice(), key = grid.columnsKey(), all = grid._colSets().all.slice();
  if (real == null) localStorage.removeItem('ffa_active_team_id'); else localStorage.setItem('ffa_active_team_id', real);
  return { cols, key, all, claim: localStorage.getItem('ffa_film_room_cols_claimed_by'), legacy: localStorage.getItem('ffa_film_room_cols') };
});
ok(other.key === 'ffa_film_room_columns_team-b' && !other.cols.includes('quarter') && JSON.stringify(other.cols) === JSON.stringify(PG.defense),
  'another program has its own sets', JSON.stringify(other));
// Codex (c1cce33): the old single list is global and seeds ONE program's All plays.
ok(JSON.stringify(other.all) === JSON.stringify(PG.default) && other.claim && other.claim !== 'team-b'
  && other.legacy === JSON.stringify(['sit', 'formation', 'defFront', 'result']),
  'another program\'s All plays starts from the preset, not the first program\'s old list, which stays untouched', JSON.stringify(other));
const bad = await page.evaluate(() => {
  const grid = window.app.playGrid, real = localStorage.getItem('ffa_active_team_id');
  localStorage.setItem('ffa_active_team_id', 'team-c');
  localStorage.setItem('ffa_film_room_columns_team-c', JSON.stringify({ all: ['nope'], defense: 'x', offense: ['sit', 'bogus', 'formation'] }));
  const all = grid._colSets().all, off = grid._colSets().offense, def = grid._colSets().defense;
  if (real == null) localStorage.removeItem('ffa_active_team_id'); else localStorage.setItem('ffa_active_team_id', real);
  return { all, off, def };
});
ok(bad.off.join() === 'sit,formation' && bad.def.join() === PG.defense.join() && bad.all.length > 0,
  'unknown columns are dropped and an unusable set falls back', JSON.stringify(bad));

ok(errors.length === 0, 'no page errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
