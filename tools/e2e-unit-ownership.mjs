/**
 * ONE STORED UNIT, WRITABLE FROM EITHER VIEW (1.12.0-99 smoke, S99-1 / S99-2;
 * coach direction 2026-09-24: "we have to have a way to select the unit from
 * both screens", last write wins).
 *
 * 1. Film Room All plays: the formation-type fields a defensive snap charts
 *    (the offense it faced) and the front-type fields an offensive snap charts
 *    (the defense it faced) display and edit; only Special Teams rows blank the
 *    alignment columns, and only other rows blank the Special Teams columns.
 * 2. A play with no stored unit reads as offense in Chart and Film Room alike,
 *    and choosing its unit in Chart writes it even when the last unit chosen
 *    was that same unit.
 * 3. Film Room's Unit column (like Hudl's ODK) edits the play's unit in the
 *    row, through the same write as Chart; whichever wrote last shows in both.
 * 4. The unit buttons above the table are labeled filters and never write.
 * 5. The lock rule holds in every scope, custom column sets included.
 * 6. Save & Next's carried unit goes through the same write.
 * 7. The keyboard shortcuts, Clear Tags and Save & Next act on the unit on
 *    screen, never the carried one (code review CR-1..3).
 * Run:  node tools/e2e-unit-ownership.mjs
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
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Units', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  const mk = (id, tags) => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [],
    tags: Object.assign({ custom: [], players: {}, grades: {} }, tags) });
  g.plays = [
    // The coach's legacy shape: the opponent formation stored combined, with an
    // empty backfield, on a defensive snap.
    mk(1, { unit: 'defense', formation: 'Under Center + Flexbone', backfield: '', personnel: '11', defFront: 'Maverick', coverage: 'Cover 3', runPass: 'Run', playType: 'Run Outside', result: 'Gain', yardage: '4' }),
    mk(2, { unit: 'offense', formation: 'Trips', qbAlignment: 'Shotgun', defFront: '5-2', runPass: 'Pass', playType: 'Short Pass', result: 'Gain', yardage: '6' }),
    mk(3, { unit: 'special', stType: 'Punt' }),
    // No unit stored at all (legacy); every report counts it as offense.
    mk(4, { formation: 'Ace', runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '2' }),
  ];
  g.nextId = 5;
  app.tagger.plays = g.plays; app.tagger.nextId = 5; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
});
await settle(page);

console.log('\n== 1. All plays: faced looks display and edit (S99-1) ==');
let r = await page.evaluate(async () => {
  const app = window.app;
  app.breakdownWorkspace._setView('film-room');
  app.nativeFilmRoom.clearFilters();
  app.playGrid.cols = ['sit', 'formation', 'qbAlignment', 'personnel', 'defFront', 'coverage', 'stUnit'];
  app.playGrid.refresh();
  await new Promise(res => setTimeout(res, 120));
  const snap = app.nativeFilmRoom.snapshot();
  const row = id => snap.rows.find(x => x.id === id);
  const cell = (id, key) => document.querySelector(`[data-cell="${id}:${key}"]`)?.textContent.trim() ?? null;
  return {
    def: { na: row(1).na, formation: row(1).cells.formation, dom: cell(1, 'formation'), personnel: cell(1, 'personnel') },
    off: { na: row(2).na, front: row(2).cells.defFront, dom: cell(2, 'defFront') },
    st: { na: row(3).na },
  };
});
ok(!r.def.na.includes('formation') && !r.def.na.includes('qbAlignment') && !r.def.na.includes('personnel'),
  'a defensive row does not blank the offense-faced columns', JSON.stringify(r.def));
ok(r.def.formation === 'Flexbone' && r.def.dom === 'Flexbone' && r.def.personnel === '11',
  'a defensive row shows the formation it faced, as the play card does (Flexbone from the legacy combined value)', JSON.stringify(r.def));
ok(!r.off.na.includes('defFront') && !r.off.na.includes('coverage') && r.off.dom === '5-2',
  'an offensive row shows the front it faced', JSON.stringify(r.off));
ok(r.off.na.includes('stUnit') && r.def.na.includes('stUnit'), 'offense and defense rows blank the Special Teams columns', JSON.stringify([r.off.na, r.def.na]));
ok(['formation', 'qbAlignment', 'personnel', 'defFront', 'coverage'].every(k => r.st.na.includes(k)) && !r.st.na.includes('stUnit'),
  'a Special Teams row blanks the alignment columns and keeps its own', JSON.stringify(r.st));

r = await page.evaluate(async () => {
  const button = document.querySelector('[data-cell="1:formation"]');
  button.click(); await new Promise(res => setTimeout(res, 60));
  button.click(); await new Promise(res => setTimeout(res, 120));
  const editor = document.querySelector('.gi-film-editor, [data-film-editor], .gi-film-cell-editor');
  const out = { opened: !!editor };
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  editor?.querySelector('button[data-cancel], .is-cancel')?.click();
  return out;
});
ok(r.opened, 'the defensive row\'s formation cell opens its editor', JSON.stringify(r));

console.log('\n== 2. No stored unit: one reading, and Chart writes it (S99-2) ==');
r = await page.evaluate(async () => {
  const app = window.app;
  app.nativeFilmRoom.clearFilters();
  // The coach last charted a defensive play, so the carried unit is defense.
  app.tagger.selectPlay(1);
  app.tagger.defaultUnit = 'defense';
  app.tagger.selectPlay(4);
  await new Promise(res => setTimeout(res, 60));
  const deck = app.nativeTagging.snapshot().unit;
  const grid = app.nativeFilmRoom.snapshot().rows.find(x => x.id === 4).unit;
  const stored = app.tagger.getPlay(4).tags.unit;
  return { deck, grid, stored };
});
ok(r.deck === 'offense' && r.grid === 'offense' && r.stored === undefined,
  'a play with no stored unit reads as offense in Chart and in Film Room (the reports\' reading), and viewing writes nothing', JSON.stringify(r));
r = await page.evaluate(async () => {
  const app = window.app;
  app.tagger.defaultUnit = 'defense';
  app.tagger.unitField.value = 'defense';
  const done = app.nativeTagging.setUnit('defense');
  await new Promise(res => setTimeout(res, 60));
  return { done, stored: app.tagger.getPlay(4).tags.unit, grid: app.nativeFilmRoom.snapshot().rows.find(x => x.id === 4)?.unit ?? null, deck: app.nativeTagging.snapshot().unit };
});
ok(r.done && r.stored === 'defense' && r.deck === 'defense',
  'choosing Defense in Chart writes it even when Defense was the carried unit', JSON.stringify(r));

console.log('\n== 3. The Unit column: edited in the row, equal to Chart (last write wins) ==');
const unitCell = id => page.evaluate(i => document.querySelector(`[data-cell="${i}:unit"]`)?.textContent.trim() ?? null, id);
const editUnit = async (id, label) => {
  await page.click(`[data-cell="${id}:unit"]`); await settle(page);
  await page.click(`[data-cell="${id}:unit"]`); await settle(page);
  const options = await page.evaluate(() => [...document.querySelectorAll('.gi-film-cell-editor .gi-film-option-chips button')].map(b => b.textContent.trim()).filter(Boolean));
  const clear = await page.evaluate(() => [...document.querySelectorAll('.gi-film-cell-editor footer button')].some(b => b.textContent.trim() === 'Clear'));
  const picked = await page.evaluate(l => {
    const ed = document.querySelector('.gi-film-cell-editor');
    const sel = ed?.querySelector('select');
    if (sel) { sel.value = l; sel.dispatchEvent(new Event('change', { bubbles: true })); }
    else [...(ed?.querySelectorAll('button') || [])].find(b => b.textContent.trim() === l)?.click();
    return !!ed;
  }, label);
  await settle(page);
  const save = await page.evaluate(() => { const b = [...document.querySelectorAll('.gi-film-cell-editor button')].find(x => /^(Save|Apply|Done)$/.test(x.textContent.trim())); b?.click(); return !!b; });
  await settle(page);
  return { options, clear, picked, save };
};
r = await page.evaluate(async () => {
  const app = window.app;
  app.breakdownWorkspace._setView('film-room');
  app.nativeFilmRoom.clearFilters();
  app.tagger.selectPlay(2);
  await new Promise(res => setTimeout(res, 80));
  const heads = [...document.querySelectorAll('[data-native-film-room] thead th span')].map(h => h.textContent.trim());
  const listed = app.nativeFilmRoom.snapshot().allColumns.map(c => c.key);
  return { first: heads[0], listed: listed.includes('unit'), stored: JSON.stringify(app.playGrid.cols).includes('"unit"') };
});
ok(r.first === 'Unit' && !r.listed && !r.stored, 'Unit is the first column, always shown, and not part of any column set', JSON.stringify(r));
ok(await unitCell(2) === 'Offense' && await unitCell(1) === 'Defense' && await unitCell(3) === 'Special Teams', 'the Unit cell names each play\'s unit');
const e1 = await editUnit(2, 'Defense');
r = await page.evaluate(() => ({ stored: window.app.tagger.getPlay(2).tags.unit, deck: window.app.nativeTagging.snapshot().unit, filter: window.app.playGrid.f.unit }));
ok(JSON.stringify(e1.options) === '["Offense","Defense","Special Teams"]', 'the Unit editor offers exactly the three units', JSON.stringify(e1));
ok(e1.clear === false, 'a unit cannot be cleared: the Unit editor has no Clear', JSON.stringify(e1));
ok(r.stored === 'defense' && r.deck === 'defense' && await unitCell(2) === 'Defense', 'editing the Unit cell writes the play, and Chart shows it at once', JSON.stringify(r));
ok(r.filter === '', 'editing a unit never moves the filter', JSON.stringify(r));
r = await page.evaluate(async () => {
  const app = window.app;
  app.nativeTagging.setUnit('offense');
  await new Promise(res => setTimeout(res, 80));
  return { stored: app.tagger.getPlay(2).tags.unit, filter: app.playGrid.f.unit };
});
ok(r.stored === 'offense' && await unitCell(2) === 'Offense' && r.filter === '', 'a later choice in Chart wins, and the Unit cell shows it; the filter stays put', JSON.stringify(r));
const e2 = await editUnit(4, 'Special Teams');
r = await page.evaluate(() => ({ stored: window.app.tagger.getPlay(4).tags.unit, formation: window.app.tagger.getPlay(4).tags.formation }));
ok(r.stored === 'special' && r.formation === '', 'setting Special Teams in the table strips the look fields, as Chart does', JSON.stringify(r));

console.log('\n== 4. Filters are labeled filters, and a filter never writes ==');
r = await page.evaluate(async () => {
  const app = window.app;
  const filters = document.querySelector('[data-film-controls] .gi-film-filters');
  const label = document.getElementById(filters?.getAttribute('aria-labelledby'))?.textContent.trim() ?? null;
  const visible = !!document.querySelector('.gi-film-filters-label')?.getClientRects().length;
  app.tagger.selectPlay(2);
  const before = app.tagger.plays.map(p => p.tags.unit);
  app.nativeFilmRoom.toggleFilter('unit', 'special');
  await new Promise(res => setTimeout(res, 60));
  const after = app.tagger.plays.map(p => p.tags.unit);
  const filter = app.playGrid.f.unit;
  app.nativeFilmRoom.clearFilters();
  return { label, visible, same: JSON.stringify(before) === JSON.stringify(after), filter };
});
ok(r.label === 'Filter plays' && r.visible, 'the table\'s unit buttons sit under a visible Filter plays label', JSON.stringify(r));
ok(r.filter === 'special' && r.same, 'filtering to Special Teams changes no play\'s unit', JSON.stringify(r));

console.log('\n== 5. The lock rule holds in every scope, custom sets included (Codex review of 48cbf5d) ==');
r = await page.evaluate(async () => {
  const app = window.app;
  app.nativeFilmRoom.clearFilters();
  app.nativeFilmRoom.toggleFilter('unit', 'offense');
  const saved = app.playGrid.cols.slice();
  // A coach's custom Offense set that carries a Special Teams column.
  app.nativeFilmRoom.setColumn('stType', true, 'offense');
  app.nativeFilmRoom.setColumn('defFront', true, 'offense');
  await new Promise(res => setTimeout(res, 120));
  const snap = app.nativeFilmRoom.snapshot();
  const row = snap.rows.find(x => x.id === 2);
  const editor = app.playGrid.nativeEditor(2, 'stType');
  const cell = document.querySelector('[data-cell="2:stType"]')?.textContent.trim() ?? null;
  app.playGrid.cols = saved; app.playGrid._saveCols();
  app.nativeFilmRoom.clearFilters();
  return { scope: snap.columnScope, na: row?.na, cell, front: row?.cells.defFront, editorCol: editor?.col?.key ?? null };
});
ok(r.scope === 'offense' && r.na?.includes('stType') && r.cell === '', 'filtered to Offense, a custom set\'s ST Type cell is blank and locked on an offensive play', JSON.stringify(r));
ok(r.editorCol === null, 'the grid itself refuses an editor for that locked cell, not only the view', JSON.stringify(r));
ok(!r.na?.includes('defFront'), 'the same filtered row keeps the front it faced editable', JSON.stringify(r));

console.log('\n== 6. Save & Next carries the unit through the one write ==');
r = await page.evaluate(async () => {
  const app = window.app, t = app.tagger;
  const g = app.storage.seasonStore.activeGame();
  const blank = { id: 90, timestamp: { start: 450, end: 454 }, notes: '', annotations: [], tags: { unit: 'offense', custom: [], players: {}, grades: {} } };
  t.plays.push(blank);
  t.selectPlay(2); t.setChartingUnit('defense');
  const calls = [];
  const original = t.setPlayUnit.bind(t);
  t.setPlayUnit = (play, unit) => { calls.push([play.id, unit]); return original(play, unit); };
  // Move so the next play is the untagged one.
  const idx = t.plays.findIndex(p => p.id === 2);
  t.plays.splice(idx + 1, 0, t.plays.splice(t.plays.indexOf(blank), 1)[0]);
  t.nextPlayWithSituation();
  t.setPlayUnit = original;
  const stored = t.getPlay(90).tags.unit;
  t.plays = t.plays.filter(p => p.id !== 90);
  t.selectPlay(2); t.setChartingUnit('offense');
  return { calls, stored };
});
ok(r.stored === 'defense' && r.calls.some(([id, unit]) => id === 90 && unit === 'defense'),
  'the carried unit lands on the next untagged play through PlayTagger.setPlayUnit', JSON.stringify(r));

console.log('\n== 7. Every path acts on the unit on screen, not the carried one (code review CR-1..3) ==');
// A play with no stored unit is shown, and counted, as offense; the carried
// unit (the last one chosen) must never stand in for it.
const noUnit = id => ({ id, timestamp: { start: id * 5, end: id * 5 + 4 }, notes: '', annotations: [], tags: { formation: 'Ace', defFront: '4-3', custom: [], players: {}, grades: {} } });
r = await page.evaluate(async play => {
  const app = window.app, t = app.tagger;
  t.plays.push(play); t.selectPlay(play.id); t.defaultUnit = 'defense';
  await new Promise(res => setTimeout(res, 40));
  document.activeElement?.blur?.();
  const handled = document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'KeyC', key: 'c', bubbles: true, cancelable: true }));
  await new Promise(res => setTimeout(res, 40));
  const out = { handled, stored: t.getPlay(play.id).tags.unit, formation: t.getPlay(play.id).tags.formation };
  t.plays = t.plays.filter(x => x.id !== play.id);
  return out;
}, noUnit(91));
ok(r.stored === 'defense' && r.formation === 'Ace', 'CR-1: C on a play shown as Offense moves it to Defense, not Special Teams, and keeps its formation', JSON.stringify(r));
r = await page.evaluate(async play => {
  const app = window.app, t = app.tagger;
  t.plays.push(play); t.selectPlay(play.id); t.defaultUnit = 'special';
  await new Promise(res => setTimeout(res, 40));
  document.activeElement?.blur?.();
  document.body.dispatchEvent(new KeyboardEvent('keydown', { code: 'Digit1', key: '1', bubbles: true, cancelable: true }));
  await new Promise(res => setTimeout(res, 40));
  const out = { stType: t.getPlay(play.id).tags.stType || '', unit: t.getPlay(play.id).tags.unit };
  t.plays = t.plays.filter(x => x.id !== play.id);
  return out;
}, noUnit(92));
ok(r.stType === '' && r.unit === undefined, 'CR-1: a digit on a play shown as Offense writes no Special Teams type', JSON.stringify(r));
r = await page.evaluate(async play => {
  const app = window.app, t = app.tagger;
  t.plays.push(play); t.selectPlay(play.id); t.defaultUnit = 'defense';
  const confirm = t._confirmDialog; t._confirmDialog = async () => true;
  await t.clearCurrentTags();
  t._confirmDialog = confirm;
  const out = { stored: t.getPlay(play.id).tags.unit };
  t.plays = t.plays.filter(x => x.id !== play.id);
  return out;
}, noUnit(93));
ok(r.stored === 'offense', 'CR-2: Clear Tags keeps the unit on screen (Offense), not the carried Defense', JSON.stringify(r));
r = await page.evaluate(async ([prev, next]) => {
  const app = window.app, t = app.tagger;
  next.tags = { unit: 'offense', formation: '', custom: [], players: {}, grades: {} };
  t.plays.push(prev, next); t.selectPlay(prev.id); t.defaultUnit = 'special';
  t.nextPlayWithSituation();
  const out = { current: t.currentPlayId, stored: t.getPlay(next.id).tags.unit };
  t.plays = t.plays.filter(x => x.id !== prev.id && x.id !== next.id);
  return out;
}, [noUnit(94), noUnit(95)]);
ok(r.current === 95 && r.stored === 'offense', 'CR-3: Save & Next carries the unit shown on the previous play (Offense), never the carried Special Teams', JSON.stringify(r));

r = await page.evaluate(async play => {
  const app = window.app, t = app.tagger;
  t.plays.push(play); t.selectPlay(play.id); t.defaultUnit = 'special';
  t.unitField.value = '';
  t._onUnitFieldChanged();
  const out = { stored: t.getPlay(play.id).tags.unit, formation: t.getPlay(play.id).tags.formation };
  t.plays = t.plays.filter(x => x.id !== play.id);
  return out;
}, noUnit(96));
ok(r.stored === 'offense' && r.formation === 'Ace', 'an emptied unit field falls back to the unit on screen, never the carried Special Teams', JSON.stringify(r));
console.log('\n== 8. Every new play is born with the full blank tag schema and a unit (LG-1) ==');
r = await page.evaluate(async () => {
  const app = window.app, t = app.tagger;
  const before = new Set(t.plays.map(p => p.id));
  t.defaultUnit = 'defense';
  await app.playlist.addFiles([new File([new Blob([new Uint8Array(32)])], 'LG1_CLIP.mp4', { type: 'video/mp4' })]);
  await new Promise(res => setTimeout(res, 300));
  const made = t.plays.find(p => !before.has(p.id));
  const blank = t.constructor.blankTags ? Object.keys(t.constructor.blankTags()).sort() : null;
  const out = { made: !!made, unit: made?.tags?.unit, drive: made?.tags?.driveNumber, keys: made ? Object.keys(made.tags).sort() : [], blank };
  if (made) t.plays = t.plays.filter(p => p.id !== made.id);
  return out;
});
ok(r.made && r.unit === 'defense', 'a play created by clip import carries the unit being charted (the carried unit seeds a new play)', JSON.stringify({ made: r.made, unit: r.unit }));
ok(Array.isArray(r.blank) && JSON.stringify(r.keys) === JSON.stringify(r.blank), 'its tags are exactly the one blank schema (PlayTagger.blankTags)', JSON.stringify({ keys: r.keys, blank: r.blank }));
ok(r.drive === '', 'a clip import charts no drive: an uncharted clip is not Drive 1 (Codex review of ecbe8b4)', JSON.stringify({ drive: r.drive }));
ok(!errors.length, 'no page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
