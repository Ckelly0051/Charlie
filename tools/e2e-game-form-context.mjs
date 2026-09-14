/**
 * Add/Edit Game derives its context from the owning season and asks for none.
 *
 * The form used to carry a selector labeled `Film source` bound to
 * `perspective`, offering `Our game · Offense/Defense/Special Teams` and
 * `Opponent film · Scout`. Neither thing it controlled was a film source, and
 * the Scout option was actively destructive: choosing it inside a Program
 * season produced a program game marked scout, and `SeasonManager._selfGames()`
 * excludes scout games, so that game silently left our record, yardage, success
 * rate and turnover margin. Removed by coach decision 2026-09-13.
 *
 * These assertions fail loudly if the control -- or any other writer of
 * `perspective` from the form -- comes back.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { readFileSync } from 'node:fs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

console.log('\n== 1. The control is gone from source, not merely hidden ==');
/* Comments are stripped first. In this repo a comment naming a removed thing is
   usually documentation that it is GONE -- including the one directly above the
   removed submit field -- and matching those would make this section
   permanently red for the wrong reason. Only real code is searched. */
const formSrc = readFileSync('js/native-game-form.jsx', 'utf8')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/(^|[^:])\/\/.*$/gm, '$1');
ok(!/Film source/i.test(formSrc), 'no `Film source` label remains in the game form');
ok(!/name=["']perspective["']/.test(formSrc), 'no form control is named `perspective`');
ok(!/Opponent film\s*[·.]\s*Scout/i.test(formSrc), 'the `Opponent film · Scout` option is gone');
ok(!/start charting (Offense|Defense|Special)/i.test(formSrc), 'the initial-unit options are gone');
ok(!/perspective:/.test(formSrc.split('onSubmit')[0] + (formSrc.split('const result = await onSubmit')[1] || '').split('});')[0]),
  'the form submits no `perspective` field');
// No file, folder, storage-mode or film-source picker belongs in this form.
ok(!/type=["']file["']|webkitdirectory|storageMode|linkFilm/i.test(formSrc),
  'the form contains no file, folder, or storage-mode selector');

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage && window.app?.gameScreen);

/* `open()` resolves only when the dialog closes, so it must NOT be awaited --
   awaiting it inside page.evaluate hangs the whole run. */
const openForm = async () => {
  await page.evaluate(() => { window.app.gameScreen.open({ mode: 'create' }); });
  await page.waitForSelector('[data-native-game-form]', { timeout: 8000 });
};
const closeForm = async () => {
  await page.evaluate(() => {
    const form = document.querySelector('[data-native-game-form]');
    const cancel = [...(form?.querySelectorAll('button') || [])].find(b => /^cancel$/i.test(b.textContent.trim()));
    if (cancel) cancel.click();
  });
  await page.waitForFunction(() => !document.querySelector('[data-native-game-form]'), { timeout: 8000 }).catch(() => {});
};

console.log('\n== 2. A Program season renders no perspective control ==');
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: 'Prog', team: 'PT', year: '2026', level: 'Varsity' });
});
await openForm();
let r = await page.evaluate(() => {
  const form = document.querySelector('[data-native-game-form]');
  return {
    named: form.querySelectorAll('[name="perspective"]').length,
    labels: [...form.querySelectorAll('label > span')].map(s => s.textContent.trim()),
    selects: [...form.querySelectorAll('select')].map(s => s.name),
  };
});
ok(r.named === 0, 'no rendered control is named perspective', JSON.stringify(r.named));
ok(!r.labels.some(l => /film source/i.test(l)), 'no field is labeled Film source', JSON.stringify(r.labels));
ok(!r.selects.includes('perspective'), 'the select list carries no perspective', JSON.stringify(r.selects));
await closeForm();

console.log('\n== 3. A Program season creates a PROGRAM game ==');
r = await page.evaluate(async () => {
  const gs = window.app.gameScreen, st = window.app.storage.seasonStore;
  // Submit through GameScreen.save(), the one seam every save passes through,
  // and include a hostile `perspective:'scout'` the way a reintroduced control
  // would: it must be ignored, not honored.
  const before = st.data.activeGameId;
  const ctx = { mode: 'create', gameId: String(before), before: JSON.parse(JSON.stringify(st.data)), liveInfo: {} };
  const res = await gs.save({ opponent: 'Central', gameType: 'game', perspective: 'scout', scoreUs: '', scoreThem: '' }, ctx);
  const info = window.app.storage.gameInfo || {};
  return { ok: res?.ok !== false, perspective: info.perspective, gameType: info.gameType, kind: st.data.kind || 'program' };
});
ok(r.ok, 'the program game saved', JSON.stringify(r));
ok(r.perspective !== 'scout', 'a Program game is NEVER created as perspective scout', String(r.perspective));
ok(r.perspective === 'offense', 'it uses the existing offense default that opens Break Down', String(r.perspective));
ok(r.gameType !== 'scout', 'a Program game never takes gameType scout', String(r.gameType));

console.log('\n== 4. Editing an existing game does not reset stored context ==');
r = await page.evaluate(async () => {
  const gs = window.app.gameScreen, storage = window.app.storage, st = storage.seasonStore;
  // A game already charted on defense: an edit must leave that alone.
  storage.gameInfo.perspective = 'defense';
  storage.gameInfo.direction = 'left';
  const ctx = { mode: 'edit', gameId: String(st.data.activeGameId), before: JSON.parse(JSON.stringify(st.data)), liveInfo: JSON.parse(JSON.stringify(storage.gameInfo)) };
  await gs.save({ opponent: 'Central Renamed', gameType: 'game', scoreUs: '14', scoreThem: '7' }, ctx);
  const info = storage.gameInfo || {};
  return { perspective: info.perspective, direction: info.direction, opponent: info.opponent, scoreUs: info.scoreUs };
});
ok(r.perspective === 'defense', 'an edit preserves the stored perspective', String(r.perspective));
ok(r.direction === 'left', 'an edit preserves other stored context', String(r.direction));
ok(/Central Renamed/.test(String(r.opponent)) && String(r.scoreUs) === '14', 'the edit still applied its real changes', JSON.stringify(r));

// The create path seeds `offense` explicitly, which would mask a missing guard.
// EDIT is where a reintroduced control could still smuggle a value through, so
// the hostile case has to be asserted here or the guard is untested.
r = await page.evaluate(async () => {
  const gs = window.app.gameScreen, storage = window.app.storage, st = storage.seasonStore;
  const ctx = { mode: 'edit', gameId: String(st.data.activeGameId), before: JSON.parse(JSON.stringify(st.data)), liveInfo: JSON.parse(JSON.stringify(storage.gameInfo)) };
  await gs.save({ opponent: 'Central Renamed', gameType: 'game', perspective: 'scout' }, ctx);
  return { perspective: (storage.gameInfo || {}).perspective, kind: st.data.kind || 'program' };
});
ok(r.perspective !== 'scout',
  'editing a Program game cannot smuggle perspective scout through the save seam', JSON.stringify(r));

console.log('\n== 5. An Opponent Scout season always creates scout source games ==');
r = await page.evaluate(async () => {
  const gs = window.app.gameScreen, storage = window.app.storage, st = storage.seasonStore;
  await storage.createSeason({ name: 'Scout S', team: 'PT', year: '2026', level: 'Varsity', kind: 'scout' });
  st.data.kind = 'scout';
  st.data.scout = { opponent: 'Rival High' };
  const ctx = { mode: 'create', gameId: String(st.data.activeGameId), before: JSON.parse(JSON.stringify(st.data)), liveInfo: {} };
  // Hostile input again: a program perspective must not survive a scout season.
  await gs.save({ sourceTeamA: 'Rival High', sourceTeamB: 'Other High', gameType: 'game', perspective: 'offense' }, ctx);
  const info = storage.gameInfo || {};
  return { perspective: info.perspective, gameType: info.gameType };
});
ok(r.perspective === 'scout', 'a scout source game is always perspective scout', String(r.perspective));
ok(r.gameType === 'scout', 'a scout source game is always gameType scout', String(r.gameType));

console.log('\n== 6. No page errors ==');
ok(errors.length === 0, 'zero page errors across the journey', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
