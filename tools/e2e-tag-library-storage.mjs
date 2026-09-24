/**
 * The installed `Could not save that choice` finding (2026-09-23/24).
 *
 * Root cause, reproduced on a copy of the coach's installed WebView2 profile:
 * localStorage was full to the byte (5,242,879 of Chromium's 5,242,880
 * characters), 99% of it VersionManager's whole-game snapshots under
 * `ffa_versions_<season>::<game>`. Every settings write then threw
 * QuotaExceededError; TagLibrary swallowed it and reported only a failed
 * readback. The repair moves version history into the storage backend and
 * makes library writes name their failure.
 *
 * This harness fills localStorage the same way, proves the add fails with a
 * diagnosable message, runs the one-time migration, and then proves: every
 * version moved identically and the scoped keys are gone, the orphaned
 * unscoped key is untouched, a failed import keeps its key, the add succeeds
 * and reaches the deck immediately for all six library groups, it persists
 * across a reload, it is scoped to the team, existing charted values are
 * unchanged, and new snapshots never write localStorage again.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (value, label, extra = '') => value ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.evaluate(async () => { localStorage.clear(); indexedDB.deleteDatabase('ffa_fs'); });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.settingsScreen && window.app?.versions);
await page.evaluate(() => { window.app.tagger._confirmDialog = async () => true; });

/* A season with one charted defensive play, so "existing values stay intact"
   has something to check, on the Break Down deck. */
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: 'Library storage QA', team: 'Mavericks', year: '2026' });
  const game = window.app.storage.seasonStore.activeGame();
  game.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, notes: '',
    tags: { unit: 'defense', defFront: 'Maverick', coverage: 'Cover 3', players: {}, grades: {}, custom: [] } }];
  await window.app.storage._loadActiveGame();
  await window.app.teamHubScreen?.load?.();
  await window.app.workspaceShell.show('breakdown');
  window.app.tagger.selectPlay(1);
});
await page.waitForSelector('[data-native-tagging]');
const scope = await page.evaluate(() => ({ seasonId: window.app.storage.seasonStore.currentSeasonId,
  gameId: window.app.storage.seasonStore.data.activeGameId, team: localStorage.getItem('ffa_active_team_id') }));

console.log('\n== 1. A full localStorage reproduces the installed failure ==');
/* Version history for this game and a second (other) game, an orphaned
   unscoped key, then filler version history until setItem throws. */
const seeded = await page.evaluate(({ seasonId, gameId }) => {
  const snap = (id, label, manual, gid) => ({ id, label, time: new Date(2026, 8, 1, 0, 0, id % 60).toISOString(), manual, playCount: 1,
    seasonId, gameId: gid, data: { plays: [{ id: 1, tags: { unit: 'defense', defFront: 'Maverick' } }], pad: 'x'.repeat(40000), marker: `${gid}:${id}` } });
  localStorage.setItem(`ffa_versions_${seasonId}::${gameId}`, JSON.stringify([snap(101, 'Named', true, gameId), snap(102, 'Auto-save', false, gameId)]));
  localStorage.setItem(`ffa_versions_${seasonId}::g-other`, JSON.stringify([snap(201, 'Other game', true, 'g-other')]));
  localStorage.setItem('ffa_versions_default', JSON.stringify([{ id: 1, label: 'orphan', data: { plays: [] } }]));
  // Fill as on the coach's machine: 40 KB snapshots, then ever smaller ones,
  // until no version-sized write fits (a few characters of slack remain).
  let n = 0, last = null;
  for (let pad = 40000; pad >= 1; pad = Math.floor(pad / 2)) {
    for (;;) {
      const v = snap(300 + n, 'Fill', false, `g-fill${n}`); v.data.pad = 'x'.repeat(pad);
      try { localStorage.setItem(`ffa_versions_${seasonId}::g-fill${n}`, JSON.stringify([v])); n++; }
      catch (e) { last = e.name; break; }
    }
  }
  // Probe with a write the size of the stored charting library (~1.6 KB).
  let probe = 'ok'; try { localStorage.setItem('p', 'x'.repeat(1600)); localStorage.removeItem('p'); } catch (e) { probe = e.name; }
  return { full: last, probe, fillKeys: n };
}, scope);
ok(seeded.full === 'QuotaExceededError' && seeded.probe === 'QuotaExceededError', 'localStorage is full of version history: a library-sized write fails', JSON.stringify(seeded));
const failed = await page.evaluate(() => window.app.settingsScreen.addTagChoice('front', 'Rhino'));
ok(failed.ok === false && /settings storage is full/.test(failed.message),
  'adding a front on a full store fails with a message naming the real cause, not "available app storage"', JSON.stringify(failed.message));
ok(await page.evaluate(() => window.app.customChips.library.lastError?.name === 'QuotaExceededError'),
  'the library records the QuotaExceededError for diagnosis');

console.log('\n== 2. The one-time migration moves version history out, verified ==');
const report = await page.evaluate(() => window.app.versions.migrateLegacy());
const after = await page.evaluate(async ({ seasonId, gameId }) => {
  const vm = window.app.versions, backend = window.app.storage.seasonStore.backend;
  const list = await backend.listVersions(seasonId, gameId);
  const named = await backend.getVersion(seasonId, gameId, '101');
  const other = await backend.getVersion(seasonId, 'g-other', '201');
  const scoped = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^ffa_versions_.+::.+/.test(k)) scoped.push(k); }
  let probe = 'ok'; try { localStorage.setItem('__probe__', 'x'.repeat(100000)); localStorage.removeItem('__probe__'); } catch (e) { probe = e.name; }
  return { list, named: named?.marker, other: other?.marker, scoped, orphan: localStorage.getItem('ffa_versions_default'), probe, uiList: await vm.list() };
}, scope);
ok(report.moved.length === seeded.fillKeys + 2 && report.failed.length === 0,
  `every scoped key moved (${report.moved.length} keys, ${report.versions} versions) and none failed`, JSON.stringify({ moved: report.moved.length, failed: report.failed, kept: report.kept }));
ok(after.list.length === 2 && after.list.some(v => v.id === '101' && v.manual && v.label === 'Named') && after.named === `${scope.gameId}:101`,
  'the open game\'s versions read back from the backend with their labels, flags and data');
ok(after.other === 'g-other:201', 'another game\'s versions moved under their own game');
ok(after.scoped.length === 0, 'no scoped ffa_versions key remains in localStorage', JSON.stringify(after.scoped.slice(0, 3)));
ok(after.orphan && JSON.parse(after.orphan)[0]?.label === 'orphan' && report.kept.includes('ffa_versions_default'),
  'the orphaned unscoped ffa_versions_default is left exactly as it was');
ok(after.probe === 'ok', 'localStorage has room again after the move');
ok(after.uiList.length === 2, 'Recovery lists the open game\'s moved versions');

console.log('\n== 3. A failed import keeps its key ==');
const kept = await page.evaluate(async ({ seasonId }) => {
  const backend = window.app.storage.seasonStore.backend, real = backend.importVersions.bind(backend);
  localStorage.setItem(`ffa_versions_${seasonId}::g-keep`, JSON.stringify([{ id: 9, label: 'k', manual: true, data: { plays: [] } }]));
  backend.importVersions = async () => false;
  const r = await window.app.versions.migrateLegacy();
  backend.importVersions = real;
  const still = localStorage.getItem(`ffa_versions_${seasonId}::g-keep`);
  const retry = await window.app.versions.migrateLegacy();
  return { failed: r.failed, still: !!still, retried: retry.moved, gone: !localStorage.getItem(`ffa_versions_${seasonId}::g-keep`) };
}, scope);
ok(kept.failed.length === 1 && kept.still, 'a key whose import fails stays in localStorage untouched', JSON.stringify(kept));
ok(kept.retried.length === 1 && kept.gone, 'the next run moves it');

console.log('\n== 4. Adding choices works again, for all six library groups ==');
const GROUPS = [['formation', 'formation', 'offense', 'Rhino Trips'], ['backfield', 'backfield', 'offense', 'Rhino Back'],
  ['playType', 'playType', 'offense', 'Rhino Run'], ['front', 'defFront', 'defense', 'Rhino'],
  ['coverage', 'coverage', 'defense', 'Rhino Cover'], ['blitz', 'blitz', 'defense', 'Rhino Blitz']];
for (const [group, field, unit, value] of GROUPS) {
  const r = await page.evaluate(async (g, f, u, v) => {
    const res = window.app.settingsScreen.addTagChoice(g, v);
    window.app.nativeTagging?.setUnit?.(u);
    await new Promise(x => setTimeout(x, 150));
    const box = document.querySelector(`[data-native-field="${f}"]`);
    const inDeck = !!box && [...box.querySelectorAll('button')].some(b => b.textContent.trim() === v);
    return { ok: res.ok, message: res.message, inDeck };
  }, group, field, unit, value);
  ok(r.ok && r.inDeck, `${group}: "${value}" saves and appears in the ${unit} deck immediately`, JSON.stringify(r));
}

console.log('\n== 5. Persistence, team scoping and charted data ==');
await page.evaluate(async () => { await window.app.storage.seasonStore.persist(); });
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.customChips?.library);
const persisted = await page.evaluate(() => {
  const lib = window.app.customChips.library;
  return ['formation', 'backfield', 'playType', 'front', 'coverage', 'blitz'].map(g => lib.group(g).custom);
});
ok(persisted.every(list => list.some(v => v.startsWith('Rhino'))), 'every added choice survives a reload', JSON.stringify(persisted));
const scoping = await page.evaluate(team => {
  const lib = window.app.customChips.library;
  localStorage.setItem('ffa_active_team_id', 'other-team');
  const other = lib.group('front').custom;
  localStorage.setItem('ffa_active_team_id', team);
  return { other, own: lib.group('front').custom };
}, scope.team);
ok(!scoping.other.includes('Rhino') && scoping.own.includes('Rhino'), 'the choice belongs to its team; another team does not see it', JSON.stringify(scoping));
const charted = await page.evaluate(async seasonId => {
  const saved = await window.app.storage.seasonStore.backend.loadSeason(seasonId);
  const game = saved?.games?.find(g => g.plays?.some(p => p.id === 1));
  return game?.plays.find(p => p.id === 1)?.tags;
}, scope.seasonId);
ok(charted?.defFront === 'Maverick' && charted?.coverage === 'Cover 3', 'existing charted values are unchanged by library edits', JSON.stringify(charted));

console.log('\n== 6. New save points go to the backend, never localStorage ==');
const fresh = await page.evaluate(async seasonId => {
  const app = window.app;
  await app.teamHubScreen?.openSeason?.(seasonId);
  const id = await app.versions.snapshot('After migration', true);
  const keys = []; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (/^ffa_versions_.+::.+/.test(k)) keys.push(k); }
  return { id, keys, listed: (await app.versions.list()).some(v => v.label === 'After migration') };
}, scope.seasonId);
ok(fresh.id && fresh.listed && fresh.keys.length === 0, 'a new game version is stored and listed without touching localStorage', JSON.stringify(fresh));

console.log('\n== 7. Restore replaces the game only after its backup is durable ==');
const restore = await page.evaluate(async () => {
  const app = window.app, tagger = app.tagger, backend = app.storage.seasonStore.backend;
  const play = () => tagger.plays.find(p => p.id === 1);
  play().tags.yardage = '7'; tagger._emit('play-updated', play());
  const v1 = await app.versions.snapshot('Seven yards', true);
  play().tags.yardage = '3'; tagger._emit('play-updated', play());
  const confirm = tagger._confirmDialog;
  tagger._confirmDialog = async () => true;
  const toasts = []; const toast = tagger.toast; tagger.toast = m => toasts.push(m);
  // Failure: the backup save point does not reach disk.
  const save = backend.saveVersion.bind(backend);
  backend.saveVersion = async () => null;
  const failed = await app.versions.restore(v1);
  backend.saveVersion = save;
  const afterFail = { yards: play().tags.yardage, backups: (await app.versions.list()).filter(v => v.label === 'Backup before restore').length };
  // Success: the backup lands, then the version replaces the game.
  const done = await app.versions.restore(v1);
  const afterOk = { yards: tagger.plays.find(p => p.id === 1)?.tags.yardage, backups: (await app.versions.list()).filter(v => v.label === 'Backup before restore').length };
  tagger._confirmDialog = confirm; tagger.toast = toast;
  return { v1, failed, afterFail, done, afterOk, toasts };
});
ok(restore.v1 && restore.failed === false && restore.afterFail.yards === '3' && restore.afterFail.backups === 0
  && restore.toasts.some(t => /could not be backed up/.test(t)),
  'a restore whose backup fails stops, says so, and leaves the current game unchanged', JSON.stringify(restore));
ok(restore.done === true && restore.afterOk.yards === '7' && restore.afterOk.backups === 1,
  'with a durable backup the restore replaces the game and keeps one backup', JSON.stringify(restore));

ok(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
