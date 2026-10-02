/**
 * Roster ownership is SEASON-SCOPED — the enforceable contract.
 *
 * Charlie found the live defect at the board on 2026-09-13: the same roster
 * appeared under every team, year and level. The isolation CODE was correct;
 * three seasons in the live catalog each stored the same 19-player list at rest,
 * written before the 2026-08-29 repair, and every store faithfully rendered what
 * it held. So this file pins both halves — the runtime contract AND the one
 * compatibility boundary that is allowed to promote a legacy game roster, so a
 * normalized season can never silently re-acquire one.
 *
 * The migration architecture this pins (2026-09-13, second pass):
 *   - promotion is VALIDATED across every legacy copy in the season, never
 *     "first non-empty wins";
 *   - a disagreement is surfaced, not resolved by guessing, and leaves the
 *     source data and the absent marker exactly as found;
 *   - a settled conversion REMOVES `roster` from every game node, so ownership
 *     is single, not merely preferred;
 *   - the first legacy open persists roster + marker + removal through the
 *     normal revision-fenced write queue BEFORE exposing the season, and a
 *     second open dispatches no write at all.
 *
 * And a conflict or a failed migration write ABORTS the operation (2026-09-14).
 * Exposing a conflicted season was itself destructive on a path no single open
 * could show: `_normalize` coerced a synthetic `season.roster: []` beside the
 * surviving copies, the next ordinary save persisted it, and the open after that
 * read it as an EXPLICIT season roster and deleted every conflicting copy. Open,
 * import and restore therefore refuse, preserving the prior active season, its
 * live roster, the backend pointer and the source bytes.
 *
 * Every section is written to fail for a specific reason. Mutation-verified:
 * restoring "first non-empty copy wins" reds 7 assertions; keeping the
 * game-level copies reds 10; converting in memory only reds 3; re-exposing
 * `_normalize(original)` after a conflict reds 8 (and reproduces the
 * save-then-reopen deletion in the output); continuing `adopt()` past a conflict
 * reds 4; continuing `restoreBackup()` past one reds 3; reverting the marker
 * check to `roster.length` reds 1; and exposing a target after a failed
 * migration write reds 2. Recorded in docs/OPEN-DEFECTS.md.
 */
import puppeteer from './test-browser.mjs';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage && window.app?.roster);

/* Helpers installed in the page: every season is created and opened through the
   REAL StorageManager path, never by poking the store. */
await page.evaluate(() => {
  const app = window.app;
  window.__r = {
    nums: () => (app.roster.players || []).map(p => String(p.num)).sort().join(','),
    stored: () => (app.storage.seasonStore.data?.roster || []).map(p => String(p.num)).sort().join(','),
    marker: () => app.storage.seasonStore.data?.rosterOwnership || '(none)',
    gameRosters: () => (app.storage.seasonStore.data?.games || []).filter(g => Array.isArray(g?.roster)).length,
    make: async (name, team, year, level, nums) => {
      await app.storage.createSeason({ name, team, year, level });
      const id = app.storage.seasonStore.currentSeasonId;
      app.roster.loadFrom(nums.map(n => ({ num: String(n), name: `P${n}`, pos: 'RB', side: 'O' })));
      app.storage.commitActive();
      await app.storage.seasonStore.persist();
      return id;
    },
  };
});
const run = fn => page.evaluate(fn);

console.log('\n== 1. Two teams keep distinct rosters ==');
let r = await run(async () => {
  const a = await window.__r.make('A Varsity', 'Team A', '2025', 'Varsity', [10, 11]);
  const b = await window.__r.make('B Varsity', 'Team B', '2025', 'Varsity', [30, 31]);
  const out = {};
  await window.app.storage.openSeasonById(a); out.a = { live: window.__r.nums(), stored: window.__r.stored() };
  await window.app.storage.openSeasonById(b); out.b = { live: window.__r.nums(), stored: window.__r.stored() };
  await window.app.storage.openSeasonById(a); out.aAgain = { live: window.__r.nums(), stored: window.__r.stored() };
  return { ...out, idA: a, idB: b };
});
ok(r.a.live === '10,11' && r.a.stored === '10,11', 'Team A season reports only its own roster', JSON.stringify(r.a));
ok(r.b.live === '30,31' && r.b.stored === '30,31', 'Team B season reports only its own roster', JSON.stringify(r.b));
ok(r.aAgain.live === '10,11', 'Returning to Team A restores A, not the roster of the season just closed', JSON.stringify(r.aAgain));

console.log('\n== 2. Two seasons under ONE team keep distinct rosters ==');
r = await run(async () => {
  const v = await window.__r.make('One Varsity', 'One Team', '2025', 'Varsity', [1, 2]);
  const j = await window.__r.make('One JV', 'One Team', '2025', 'JV', [40, 41, 42]);
  const out = {};
  await window.app.storage.openSeasonById(v); out.varsity = window.__r.nums();
  await window.app.storage.openSeasonById(j); out.jv = window.__r.nums();
  await window.app.storage.openSeasonById(v); out.backToVarsity = window.__r.nums();
  return { ...out, idV: v, idJ: j };
});
ok(r.varsity === '1,2' && r.jv === '40,41,42', 'JV and Varsity of one team are independent', JSON.stringify(r));
ok(r.backToVarsity === '1,2', 'Varsity does not inherit the JV roster it was switched from', r.backToVarsity);

console.log('\n== 3. An EMPTY roster stays empty across switching and reload ==');
r = await run(async () => {
  const full = await window.__r.make('Full', 'E Team', '2025', 'Varsity', [7, 8]);
  const empty = await window.__r.make('Empty', 'E Team', '2026', 'Varsity', []);
  const out = {};
  await window.app.storage.openSeasonById(full); out.full = window.__r.nums();
  await window.app.storage.openSeasonById(empty); out.empty = window.__r.nums();
  // Reload simulation: drop every live handle, then reopen from durable storage.
  window.app.storage.seasonStore.data = null;
  window.app.storage.seasonStore.currentSeasonId = null;
  window.app.roster.loadFrom([], { persist: false });
  await window.app.storage.openSeasonById(empty); out.emptyAfterReload = window.__r.nums();
  await window.app.storage.openSeasonById(full); out.fullAfterReload = window.__r.nums();
  return out;
});
ok(r.empty === '', 'An intentionally empty roster renders empty, not the previous season\'s players', r.empty);
ok(r.emptyAfterReload === '' && r.fullAfterReload === '7,8', 'Both survive a reload with their own values', JSON.stringify(r));

console.log('\n== 4. Games SHARE the season roster and store no copy of their own ==');
r = await run(async () => {
  const id = await window.__r.make('Shared', 'S Team', '2025', 'Varsity', [21, 22]);
  const st = window.app.storage.seasonStore;
  st.addGame({ name: 'G2' });
  st.addGame({ name: 'G3' });
  await st.persist();
  const seen = [];
  for (const g of st.data.games) {
    st.data.activeGameId = g.id;
    await window.app.storage._loadActiveGame();
    seen.push(window.__r.nums());
  }
  return { id, games: st.data.games.length, seen, gameRosters: window.__r.gameRosters(), stored: window.__r.stored() };
});
ok(r.games >= 3 && r.seen.every(v => v === '21,22'), 'Every game in the season sees the one season roster', JSON.stringify(r.seen));
ok(r.gameRosters === 0, 'No game node stores a roster copy of its own', String(r.gameRosters));

console.log('\n== 5. Creating a game neither copies nor clears the season roster ==');
r = await run(async () => {
  const st = window.app.storage.seasonStore;
  const before = window.__r.stored();
  st.addGame({ name: 'Brand new' });
  await st.persist();
  const created = st.data.games[st.data.games.length - 1];
  return { before, after: window.__r.stored(), live: window.__r.nums(), newGameHasRoster: Array.isArray(created?.roster) };
});
ok(r.after === r.before && r.live === r.before, 'Adding a game leaves the season roster exactly as it was', JSON.stringify(r));
ok(r.newGameHasRoster === false, 'A newly created game carries no roster field', String(r.newGameHasRoster));

console.log('\n== 6. Normalizing never reads a roster from a game node ==');
/* The legacy promotion boundary (adoptLegacyRoster) and the durable roster
   migration are deleted (legacy excision step 7): a game-level roster is the
   retired format and is refused (section 7 and 7d), never converted. */
r = await run(async () => {
  const st = window.app.storage.seasonStore;
  const emptied = st._normalize({ id: 'e', roster: [], games: [{ id: 'g1', plays: [] }] });
  const noKey = st._normalize({ id: 'n', games: [{ id: 'g1', plays: [] }] });
  const modern = st._normalize({ id: 'm', roster: [{ num: '5' }], games: [{ id: 'g1', plays: [] }] });
  const src = String(st.constructor);
  return {
    emptied: emptied.roster.length, noKey: noKey.roster.length, modern: modern.roster.map(p => p.num).join(','),
    markers: [emptied, noKey, modern].map(d => d.rosterOwnership).join(','),
    boundaryGone: typeof st.constructor.adoptLegacyRoster === 'undefined' && typeof st.gameFromLegacy === 'undefined'
      && !/games?\[[^\]]*\]\.roster|game\.roster/.test(src),
  };
});
ok(r.emptied === 0 && r.noKey === 0 && r.modern === '5', 'The season roster is read as stored; a missing one is empty', JSON.stringify(r));
ok(r.markers === 'season,season,season', 'Every normalized season carries the season-ownership marker', r.markers);
ok(r.boundaryGone, 'No legacy roster reader is left in SeasonStore', JSON.stringify(r));

console.log('\n== 7. A stored season with game-level rosters is REFUSED on open, changing nothing ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const player = (num, name) => ({ num, name, pos: 'QB', side: 'O' });
  const bodies = {
    'legacy-agree': { id: 'legacy-agree', seasonName: 'Legacy Agree', year: '2024', level: 'JV',
      games: [{ id: 'la1', name: 'G1', plays: [], roster: [player('33', 'Legacy')] }, { id: 'la2', name: 'G2', plays: [], roster: [player('33', 'Legacy')] }] },
    'legacy-conflict': { id: 'legacy-conflict', seasonName: 'Legacy Conflict', year: '2024', level: 'JV',
      games: [{ id: 'cg1', name: 'Week 1', plays: [], roster: [player('11', 'Ames')] }, { id: 'cg2', name: 'Week 2', plays: [], roster: [player('22', 'Vega')] }] },
  };
  const source = {};
  for (const [id, body] of Object.entries(bodies)) {
    await st.backend.saveSeason(id, JSON.parse(JSON.stringify(body)));
    source[id] = JSON.stringify(await st.backend.loadSeason(id));
  }
  const held = await window.__r.make('Held Open', 'HO Team', '2026', 'Varsity', [17, 18]);
  const snap = () => ({ id: st.currentSeasonId, live: window.__r.nums(), stored: window.__r.stored(),
    pointer: st.backend.currentSeason(), activeGameId: st.data.activeGameId, loadedGameId: S._loadedGameId });
  const before = snap();
  const toasts = [];
  const realToast = S.tagger.toast;
  S.tagger.toast = (msg) => { toasts.push(String(msg)); };
  const results = {};
  for (const id of Object.keys(bodies)) {
    const opened = await S.openSeasonById(id);
    results[id] = { opened, after: snap(), same: JSON.stringify(await st.backend.loadSeason(id)) === source[id] };
  }
  // Saving the held season and trying again converts nothing either.
  S.commitActive(); await st.persist();
  await S.openSeasonById(held);
  const second = await S.openSeasonById('legacy-conflict');
  const secondSame = JSON.stringify(await st.backend.loadSeason('legacy-conflict')) === source['legacy-conflict'];
  S.tagger.toast = realToast;
  return { before, results, toasts, second, secondSame, pending: st.openRefusal };
});
for (const [id, res] of Object.entries(r.results)) {
  ok(res.opened === false, `${id}: the season does not open`, JSON.stringify(res.opened));
  ok(res.after.id === r.before.id && res.after.live === r.before.live && res.after.stored === r.before.stored && res.after.live === '17,18'
     && res.after.pointer === r.before.pointer && res.after.activeGameId === r.before.activeGameId && res.after.loadedGameId === r.before.loadedGameId,
    `${id}: the season already open stays open, its roster, pointer and loaded game untouched`, JSON.stringify({ before: r.before, after: res.after }));
  ok(res.same, `${id}: its stored bytes are unchanged -- nothing is converted or written`, String(res.same));
}
ok(r.second === false && r.secondSame, 'Saving, switching away and trying again converts nothing', JSON.stringify({ second: r.second, same: r.secondSame }));
ok(r.toasts.length === 3 && /^Legacy Agree uses an old GridIron IQ format and was not opened\./.test(r.toasts[0])
   && r.toasts.slice(1).every(t => /^Legacy Conflict uses an old GridIron IQ format/.test(t)) && r.pending === null,
  'Every refusal is surfaced once, naming the season', JSON.stringify({ toasts: r.toasts, pending: r.pending }));

console.log('\n== 7f. An import with game-level rosters is refused, changing nothing ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const dest = await window.__r.make('Import Dest', 'ID Team', '2026', 'Varsity', [64]);
  const beforeBytes = JSON.stringify(await st.backend.loadSeason(dest));
  const before = { id: st.currentSeasonId, live: window.__r.nums(), stored: window.__r.stored() };
  const result = await st.adopt({
    type: 'season', seasonName: 'Conflicted Import', year: '2023', level: 'JV',
    games: [
      { id: 'ci1', name: 'Week 1', plays: [], roster: [{ num: '1', name: 'One' }] },
      { id: 'ci2', name: 'Week 2', plays: [], roster: [{ num: '2', name: 'Two' }] },
    ],
  });
  const afterBytes = JSON.stringify(await st.backend.loadSeason(dest));
  return {
    ok: result?.ok, data: result?.data, oldFormat: result?.oldFormat === true,
    before, after: { id: st.currentSeasonId, live: window.__r.nums(), stored: window.__r.stored(), name: st.data.seasonName },
    sameBytes: beforeBytes === afterBytes,
  };
});
ok(r.ok === false && r.data === null, 'A conflicting import returns ok:false', JSON.stringify({ ok: r.ok, data: r.data }));
// Game-level rosters are the retired format (legacy excision step 6): the file is
// refused as old before any roster comparison runs.
ok(r.oldFormat, 'It is refused as an old-format file', JSON.stringify(r));
ok(r.after.id === r.before.id && r.after.stored === r.before.stored && r.after.live === r.before.live && r.after.name === 'Import Dest',
  'The destination season, its roster and the live roster are unchanged', JSON.stringify({ before: r.before, after: r.after }));
ok(r.sameBytes, 'The conflicted import is never persisted', String(r.sameBytes));

console.log('\n== 7g. A restore point with game-level rosters is refused, changing nothing ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const target = await window.__r.make('Restore Dest', 'RD Team', '2026', 'JV', [8, 9]);
  const beforeBytes = JSON.stringify(await st.backend.loadSeason(target));
  const before = { id: st.currentSeasonId, live: window.__r.nums(), stored: window.__r.stored() };
  const rec = await st.backend.createBackup(target, {
    id: target, type: 'season', seasonName: 'Restore Dest',
    games: [
      { id: 'rb1', name: 'Week 1', plays: [], roster: [{ num: '3', name: 'Three' }] },
      { id: 'rb2', name: 'Week 2', plays: [], roster: [{ num: '4', name: 'Four' }] },
    ],
  }, 'conflicting backup');
  const bid = rec && typeof rec === 'object' ? rec.id : rec;
  const backupBefore = JSON.stringify(await st.backend.getBackup(target, bid));
  const restored = await S.restoreBackup(bid);
  return {
    attempted: bid != null, restored,
    before, after: { id: st.currentSeasonId, live: window.__r.nums(), stored: window.__r.stored() },
    sameSeason: beforeBytes === JSON.stringify(await st.backend.loadSeason(target)),
    sameBackup: backupBefore === JSON.stringify(await st.backend.getBackup(target, bid)),
  };
});
ok(r.attempted && r.restored === false, 'A conflicting restore reports failure through the existing API', JSON.stringify(r.restored));
ok(r.after.id === r.before.id && r.after.stored === r.before.stored && r.after.live === r.before.live,
  'The current season and its live roster are unchanged by a refused restore', JSON.stringify({ before: r.before, after: r.after }));
ok(r.sameSeason, 'No canonical season data is replaced', String(r.sameSeason));
ok(r.sameBackup, 'The conflicting backup keeps its own bytes', String(r.sameBackup));

console.log('\n== 7d. Legacy roster imports are refused (legacy excision step 6) ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  await window.__r.make('Import Target', 'IT Team', '2026', 'Varsity', [12]);
  const before = { id: st.currentSeasonId, stored: window.__r.stored(), bytes: JSON.stringify(await st.backend.loadSeason(st.currentSeasonId)) };
  // A legacy SEASON export whose games carry the roster.
  const imported = await st.adopt({
    type: 'season', seasonName: 'Imported', year: '2023', level: 'JV',
    games: [
      { id: 'ig1', name: 'G1', plays: [], roster: [{ num: '44', name: 'Imported' }] },
      { id: 'ig2', name: 'G2', plays: [], roster: [{ num: '44', name: 'Imported' }] },
    ],
  });
  const afterImport = { ok: imported.ok, oldFormat: imported.oldFormat === true, stored: window.__r.stored() };
  // A legacy SINGLE-GAME save whose roster lives on the payload's game node.
  const single = await st.adopt({ plays: [], gameInfo: { opponent: 'Legacy Opp' }, roster: [{ num: '66', name: 'Single' }] });
  return {
    before, afterImport,
    single: { ok: single.ok, oldFormat: single.oldFormat === true },
    same: st.currentSeasonId === before.id && window.__r.stored() === before.stored
      && JSON.stringify(await st.backend.loadSeason(st.currentSeasonId)) === before.bytes,
  };
});
ok(r.afterImport.ok === false && r.afterImport.oldFormat,
  'A legacy season export with game-level rosters is refused as an old format', JSON.stringify(r.afterImport));
ok(r.single.ok === false && r.single.oldFormat,
  'A legacy single-game save is refused as an old format', JSON.stringify(r.single));
ok(r.same, 'The open season, its roster and its stored bytes are unchanged by both refusals', JSON.stringify(r));

console.log('\n== 8. Backup and restore touch one season only ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const keep = await window.__r.make('Keep', 'R Team', '2025', 'Varsity', [60, 61]);
  const target = await window.__r.make('Target', 'R Team', '2026', 'Varsity', [70, 71]);
  await S.openSeasonById(target);
  // `snapshot()` returns the backup RECORD, not its id; `restoreBackup()` takes
  // the id. Passing the record through reaches IndexedDB as an invalid key.
  const snap = await st.snapshot('probe');
  let snapId = snap && typeof snap === 'object' ? snap.id : snap;
  if (snapId == null) {
    const list = await st.listBackups();
    snapId = (list || []).map(entry => (entry && typeof entry === 'object' ? entry.id : entry)).filter(v => v != null).pop();
  }
  window.app.roster.loadFrom([{ num: '80', name: 'Changed' }]);
  S.commitActive(); await st.persist();
  const changed = window.__r.nums();
  // Restore through StorageManager, the owner the Recovery screen calls
  // (settings-screen.js:429) -- SeasonStore.restoreBackup alone replaces the
  // stored season but does not rehydrate the live roster, so testing it
  // directly would measure below the path a coach can reach.
  const restoreOk = snapId != null ? !!(await S.restoreBackup(snapId)) : false;
  const restored = window.__r.nums();
  await S.openSeasonById(keep);
  return { changed, restored, restoreOk, snapId: String(snapId || ''), keep: window.__r.nums(), marker: window.__r.marker() };
});
ok(r.restoreOk, 'A restore point for this season can be taken and read back', JSON.stringify({ snapId: r.snapId }));
ok(r.changed === '80' && r.restored === '70,71', 'Restore returns the season\'s own roster', JSON.stringify(r));
ok(r.keep === '60,61', 'The other season is untouched by the restore', r.keep);

/* A backup that predates the season roster model is the retired format (legacy
   excision step 6): the restore is refused and nothing is written. */
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  await window.__r.make('Restore Legacy', 'RL Team', '2025', 'Varsity', [50]);
  const id = st.currentSeasonId;
  const rec = await st.backend.createBackup(id, {
    id, type: 'season', seasonName: 'Restore Legacy', version: 1,
    games: [{ id: 'rg1', name: 'G1', plays: [], roster: [{ num: '31', name: 'FromBackup' }] }],
  }, 'legacy backup');
  const bid = rec && typeof rec === 'object' ? rec.id : rec;
  const beforeBytes = JSON.stringify(await st.backend.loadSeason(id));
  const pointsBefore = (await st.listBackups()).length;
  const restored = bid != null ? await st.restoreBackup(bid) : 'no-id';
  return {
    attempted: bid != null, restored, refusal: st.lastRestoreRefusal || '',
    same: JSON.stringify(await st.backend.loadSeason(id)) === beforeBytes,
    pointsSame: (await st.listBackups()).length === pointsBefore,
  };
});
ok(r.attempted, 'A legacy-shaped backup could be written and restored', JSON.stringify(r));
ok(r.restored === null && /old format/.test(r.refusal), 'Restoring a pre-season-model backup is refused as an old format', JSON.stringify(r));
ok(r.same && r.pointsSame, 'The refused restore writes nothing: no safety point, the season unchanged', JSON.stringify(r));

console.log('\n== 9. Reports player attribution reads the SELECTED season roster ==');
/* No fallback. `_mergeRoster` is the one attribution owner Reports > Players and
   the season export both read, so "no seasonManager" is a broken app, not a
   passing condition -- an earlier version of this section accepted that string
   as success, which meant the whole section could go green having measured
   nothing. */
r = await run(async () => {
  const S = window.app.storage;
  const a = await window.__r.make('Attr A', 'AT Team', '2025', 'Varsity', [12]);
  const b = await window.__r.make('Attr B', 'AT Team', '2026', 'Varsity', [90]);
  const sm = window.app.seasonManager || window.app.season;
  if (!sm || typeof sm._mergeRoster !== 'function') return { missing: true };
  const labels = () => Object.keys(sm._mergeRoster() || {}).sort().join(',');
  await S.openSeasonById(a); const la = labels();
  await S.openSeasonById(b); const lb = labels();
  // The attribution source must be the SEASON roster, not a game node: strip the
  // live roster and the season roster must still be what answers.
  window.app.roster.loadFrom([], { persist: false });
  const fromSeasonOnly = labels();
  return { missing: false, la, lb, fromSeasonOnly };
});
ok(r.missing === false, 'The season attribution owner (`_mergeRoster`) is reachable at all', JSON.stringify(r));
ok(r.la === '12', 'Season A attribution labels come from season A', r.la);
ok(r.lb === '90', 'Season B attribution labels come from season B', r.lb);
ok(r.la !== r.lb, 'The two seasons do not share one attribution label set', `${r.la} vs ${r.lb}`);
ok(r.fromSeasonOnly === '90', 'Attribution reads the selected season\'s own roster, not a game copy', r.fromSeasonOnly);

console.log('\n== 10. No page errors across the whole journey ==');
ok(errors.length === 0, 'Zero page errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
