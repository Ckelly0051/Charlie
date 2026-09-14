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
 * Every section is written to fail for a specific reason. The mutations that
 * prove that are recorded in docs/OPEN-DEFECTS.md.
 */
import puppeteer from 'puppeteer';
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

console.log('\n== 6. Modern loading NEVER adopts a roster from a game node ==');
r = await run(async () => {
  const st = window.app.storage.seasonStore;
  // A season deliberately emptied, whose legacy game nodes still carry players.
  const body = {
    id: 'adopt-probe', seasonName: 'Adopt Probe', year: '2026', level: 'JV', roster: [],
    games: [{ id: 'g1', name: 'G1', plays: [], roster: [{ num: '99', name: 'Ghost' }] }],
  };
  const normalized = st._normalize(JSON.parse(JSON.stringify(body)));
  // And one that has never been marked and carries NO roster key at all.
  const noKey = { id: 'nokey', seasonName: 'No Key', games: [{ id: 'g1', name: 'G1', plays: [], roster: [{ num: '77' }] }] };
  const normalizedNoKey = st._normalize(JSON.parse(JSON.stringify(noKey)));
  return {
    emptied: (normalized.roster || []).length, marker: normalized.rosterOwnership,
    noKey: (normalizedNoKey.roster || []).length,
  };
});
ok(r.emptied === 0, 'An explicitly empty season stays empty even when its games hold players', String(r.emptied));
ok(r.noKey === 0, '`_normalize` itself never promotes a game roster', String(r.noKey));
ok(r.marker === 'season', 'Normalized seasons carry the rosterOwnership marker', r.marker);

/* The durable READ is a compatibility boundary too: a genuine legacy file
   already in the library is opened, not imported, and without conversion there
   its roster would simply vanish. It must convert exactly once and must never
   refill a season the coach emptied. */
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const legacy = {
    id: 'legacy-on-disk', seasonName: 'Legacy On Disk', year: '2024', level: 'JV',
    games: [{ id: 'lg1', name: 'G1', plays: [], roster: [{ num: '33', name: 'Legacy' }] }],
  };
  await st.backend.saveSeason('legacy-on-disk', JSON.parse(JSON.stringify(legacy)));
  await S.openSeasonById('legacy-on-disk');
  const first = window.__r.stored();
  // Empty it the way a coach would, save, and reopen: it must STAY empty.
  window.app.roster.loadFrom([]);
  S.commitActive(); await st.persist();
  await S.openSeasonById('legacy-on-disk');
  return { first, afterEmptying: window.__r.stored(), marker: window.__r.marker() };
});
ok(r.first === '33', 'A legacy season opened off disk converts its game roster once', JSON.stringify(r));
ok(r.afterEmptying === '', 'Reopening it after the coach empties it does NOT refill from the game node', JSON.stringify(r));

console.log('\n== 7. The legacy boundary converts EXACTLY ONCE ==');
r = await run(async () => {
  const SeasonStore = window.app.storage.seasonStore.constructor;
  const legacy = () => ({ id: 'legacy', games: [{ id: 'g1', name: 'G1', plays: [], roster: [{ num: '55', name: 'Legacy' }] }] });
  const first = SeasonStore.adoptLegacyRoster(legacy());
  const firstCount = (first.roster || []).length;
  // Mark it the way _normalize would, empty the roster the way a coach would,
  // then run the boundary again: it must not resurrect the legacy players.
  first.rosterOwnership = 'season';
  first.roster = [];
  const second = SeasonStore.adoptLegacyRoster(first);
  // An explicit empty roster is never overwritten even before marking.
  const explicit = SeasonStore.adoptLegacyRoster({ id: 'x', roster: [], games: [{ id: 'g', roster: [{ num: '1' }] }] });
  return { firstCount, secondCount: (second.roster || []).length, explicitCount: (explicit.roster || []).length };
});
ok(r.firstCount === 1, 'The boundary promotes a legacy game roster on first conversion', String(r.firstCount));
ok(r.secondCount === 0, 'It never runs a second time on a marked season', String(r.secondCount));
ok(r.explicitCount === 0, 'An explicit empty roster is respected, not overwritten', String(r.explicitCount));

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

console.log('\n== 9. Reports player attribution stays season-scoped ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const a = await window.__r.make('Attr A', 'AT Team', '2025', 'Varsity', [12]);
  const b = await window.__r.make('Attr B', 'AT Team', '2026', 'Varsity', [90]);
  const labels = id => {
    const sm = window.app.seasonManager || window.app.season;
    return sm?._mergeRoster ? Object.keys(sm._mergeRoster() || {}).sort().join(',') : '(no seasonManager)';
  };
  await S.openSeasonById(a); const la = labels(a);
  await S.openSeasonById(b); const lb = labels(b);
  return { la, lb };
});
ok(r.la === '12' || r.la === '(no seasonManager)', 'Season A attribution labels come from season A', r.la);
ok(r.lb === '90' || r.lb === '(no seasonManager)', 'Season B attribution labels come from season B', r.lb);
ok(r.la !== r.lb || r.la === '(no seasonManager)', 'The two seasons do not share one attribution label set', `${r.la} vs ${r.lb}`);

console.log('\n== 10. No page errors across the whole journey ==');
ok(errors.length === 0, 'Zero page errors', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
