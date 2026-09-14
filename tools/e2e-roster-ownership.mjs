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
 * Every section is written to fail for a specific reason. Mutation-verified:
 * restoring "first non-empty copy wins" reds 7's conflict assertions; keeping
 * the game-level copies reds 7/7b/7d/8's removal assertions; converting in
 * memory only (skipping the durable write) reds 7b's on-disk assertions; and
 * marking a conflicted season reds 7c. Recorded in docs/OPEN-DEFECTS.md.
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
  // A modern season -- no game node carries the field at all.
  const modern = st._normalize({ id: 'modern', roster: [{ num: '5' }], games: [{ id: 'g1', plays: [] }] });
  return {
    emptied: (normalized.roster || []).length, legacyMarker: normalized.rosterOwnership || '(none)',
    noKey: (normalizedNoKey.roster || []).length,
    modernMarker: modern.rosterOwnership || '(none)',
  };
});
ok(r.emptied === 0, 'An explicitly empty season stays empty even when its games hold players', String(r.emptied));
ok(r.noKey === 0, '`_normalize` itself never promotes a game roster', String(r.noKey));
ok(r.modernMarker === 'season', 'A season with no game-level copies is marked as the roster owner', r.modernMarker);
/* The marker asserts BOTH halves of the contract -- season ownership AND no
   surviving game copy. Stamping it on a season that still carries legacy game
   rosters would record an unfinished migration as settled, which is exactly how
   a conflicting season would be stranded with its copies forever. */
ok(r.legacyMarker === '(none)',
  '`_normalize` refuses to mark a season whose games still carry rosters', r.legacyMarker);

console.log('\n== 7. The boundary VALIDATES; it never guesses which copy wins ==');
r = await run(async () => {
  const SeasonStore = window.app.storage.seasonStore.constructor;
  const player = (num, name) => ({ num, name, pos: 'RB', side: 'O' });
  // Two games, the SAME roster written twice -- differing only in row order,
  // key order and stray whitespace, which carry no player meaning.
  const agreeing = SeasonStore.adoptLegacyRoster({
    id: 'agree',
    games: [
      { id: 'g1', plays: [], roster: [player('55', 'Vega'), player('7', 'Ames')] },
      { id: 'g2', plays: [], roster: [{ name: 'Ames ', side: 'O', pos: 'RB', num: ' 7' }, player('55', 'Vega')] },
    ],
  });
  // Two games whose rosters genuinely DISAGREE: one player differs.
  const conflicting = SeasonStore.adoptLegacyRoster({
    id: 'conflict',
    games: [
      { id: 'g1', name: 'Week 1', plays: [], roster: [player('55', 'Vega')] },
      { id: 'g2', name: 'Week 2', plays: [], roster: [player('55', 'Vega'), player('9', 'Reyes')] },
    ],
  });
  // A marked season, emptied by the coach, whose legacy nodes were re-attached.
  const marked = SeasonStore.adoptLegacyRoster({
    id: 'marked', rosterOwnership: 'season', roster: [],
    games: [{ id: 'g1', plays: [], roster: [player('55', 'Vega')] }],
  });
  // An explicit empty roster before marking.
  const explicit = SeasonStore.adoptLegacyRoster({
    id: 'x', roster: [], games: [{ id: 'g', roster: [player('1', 'One')] }],
  });
  const noCopies = SeasonStore.adoptLegacyRoster({ id: 'none', games: [{ id: 'g1', plays: [] }] });
  const gameKeys = out => out.data.games.filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length;
  return {
    agree: { nums: (agreeing.data.roster || []).map(p => String(p.num).trim()).sort().join(','), status: agreeing.status, left: gameKeys(agreeing), removed: agreeing.removed.length },
    conflict: {
      status: conflicting.status, roster: Object.prototype.hasOwnProperty.call(conflicting.data, 'roster'),
      left: gameKeys(conflicting), variants: conflicting.conflict?.variants,
      games: conflicting.conflict?.games || [], message: conflicting.conflict?.message || '',
      marker: conflicting.data.rosterOwnership || '(none)',
    },
    marked: { count: (marked.data.roster || []).length, status: marked.status, left: gameKeys(marked) },
    explicit: { count: (explicit.data.roster || []).length, status: explicit.status, left: gameKeys(explicit) },
    noCopies: { count: (noCopies.data.roster || []).length, status: noCopies.status },
  };
});
ok(r.agree.status === 'converted' && r.agree.nums === '55,7', 'Identical legacy game rosters converge on ONE season roster', JSON.stringify(r.agree));
ok(r.agree.left === 0 && r.agree.removed === 2, 'Conversion removes the `roster` property from EVERY game node', JSON.stringify(r.agree));
ok(r.conflict.status === 'conflict' && r.conflict.roster === false,
  'Disagreeing legacy rosters are NOT silently promoted -- no copy is selected', JSON.stringify(r.conflict));
ok(r.conflict.left === 2 && r.conflict.marker === '(none)',
  'A conflict leaves the source game rosters intact and the season unmarked', JSON.stringify(r.conflict));
ok(r.conflict.variants === 2 && r.conflict.games.join(',') === 'Week 1,Week 2' && /different rosters/.test(r.conflict.message),
  'The conflict names the games and what to do about it', JSON.stringify(r.conflict));
ok(r.marked.count === 0, 'A marked season never converts a second time', JSON.stringify(r.marked));
ok(r.explicit.count === 0 && r.explicit.status === 'explicit', 'An explicit empty roster wins over a legacy game copy', JSON.stringify(r.explicit));
ok(r.marked.left === 0 && r.explicit.left === 0,
  'A stale game-level copy is removed even when the season roster already wins', JSON.stringify({ marked: r.marked, explicit: r.explicit }));
ok(r.noCopies.count === 0 && r.noCopies.status === 'empty', 'A season with no legacy copies converts to an empty roster', JSON.stringify(r.noCopies));

console.log('\n== 7b. The first legacy open is a DURABLE, once-only migration ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const legacy = {
    id: 'legacy-on-disk', seasonName: 'Legacy On Disk', year: '2024', level: 'JV',
    games: [
      { id: 'lg1', name: 'G1', plays: [], roster: [{ num: '33', name: 'Legacy', pos: 'QB', side: 'O' }] },
      { id: 'lg2', name: 'G2', plays: [], roster: [{ num: '33', name: 'Legacy', pos: 'QB', side: 'O' }] },
    ],
  };
  await st.backend.saveSeason('legacy-on-disk', JSON.parse(JSON.stringify(legacy)));
  const onDisk = async () => {
    const body = await st.backend.loadSeason('legacy-on-disk');
    return {
      roster: (body?.roster || []).map(p => String(p.num)).sort().join(','),
      marker: body?.rosterOwnership || '(none)',
      gameRosters: (body?.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length,
      revision: body?.revision ?? null,
      games: (body?.games || []).length,
      plays: (body?.games || []).reduce((n, g) => n + (g.plays || []).length, 0),
    };
  };
  const before = await onDisk();
  const reports = [];
  st.onRosterMigration = record => reports.push(record && {
    ok: record.ok, status: record.status, players: record.players, removedFrom: (record.removedFrom || []).length,
  });
  await S.openSeasonById('legacy-on-disk');
  const firstLive = window.__r.stored();
  const firstDisk = await onDisk();
  const firstRecord = reports.length === 1 ? reports[0] : null;
  /* A SECOND open must perform no second conversion: nothing on disk moves, not
     even the revision, because no migration write is dispatched at all. Taken
     at SeasonStore.openSeason -- the owner of the migration -- because
     StorageManager.openSeasonById legitimately commits and persists the
     outgoing season first, which would bump the revision for reasons that have
     nothing to do with this claim. */
  await st.openSeason('legacy-on-disk');
  const secondDisk = await onDisk();
  const secondRecord = st.rosterMigration;
  await S.openSeasonById('legacy-on-disk');   // back through the real path for what follows
  // And a coach who empties it keeps it empty, across a save and a reopen.
  window.app.roster.loadFrom([]);
  S.commitActive(); await st.persist();
  await S.openSeasonById('legacy-on-disk');
  const afterEmptying = { live: window.__r.stored(), disk: await onDisk() };
  st.onRosterMigration = null;
  return { before, firstLive, firstDisk, firstRecord, secondDisk, secondRecord, afterEmptying, reports };
});
ok(r.before.roster === '' && r.before.marker === '(none)' && r.before.gameRosters === 2,
  'The fixture really is a legacy season on disk before it is opened', JSON.stringify(r.before));
ok(r.firstLive === '33', 'A legacy season opened off disk converts its game roster', JSON.stringify({ live: r.firstLive }));
ok(r.firstDisk.roster === '33' && r.firstDisk.marker === 'season' && r.firstDisk.gameRosters === 0,
  'The first open WRITES the roster, the marker and the removal to disk -- not just to memory', JSON.stringify(r.firstDisk));
ok(r.firstDisk.games === 2 && r.firstDisk.plays === r.before.plays,
  'The migration write preserves every game and play', JSON.stringify(r.firstDisk));
ok(r.firstRecord && r.firstRecord.ok === true && r.firstRecord.status === 'converted' && r.firstRecord.players === 1 && r.firstRecord.removedFrom === 2,
  'The migration reports exactly what it did', JSON.stringify(r.firstRecord));
ok(r.secondDisk.revision === r.firstDisk.revision && r.secondDisk.roster === '33' && r.secondDisk.gameRosters === 0,
  'A second open performs NO second conversion and dispatches no migration write', JSON.stringify({ first: r.firstDisk.revision, second: r.secondDisk.revision }));
ok(r.secondRecord === null, 'A settled season reports no migration at all', JSON.stringify(r.secondRecord));
ok(r.afterEmptying.live === '' && r.afterEmptying.disk.roster === '' && r.afterEmptying.disk.gameRosters === 0,
  'Emptying and saving the roster does NOT resurrect players on the next open', JSON.stringify(r.afterEmptying));

console.log('\n== 7c. A conflicting legacy season opens WITHOUT a silent decision ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  const body = {
    id: 'legacy-conflict', seasonName: 'Legacy Conflict', year: '2024', level: 'JV',
    games: [
      { id: 'cg1', name: 'Week 1', plays: [], roster: [{ num: '11', name: 'Ames' }] },
      { id: 'cg2', name: 'Week 2', plays: [], roster: [{ num: '22', name: 'Vega' }] },
    ],
  };
  await st.backend.saveSeason('legacy-conflict', JSON.parse(JSON.stringify(body)));
  const reports = [];
  st.onRosterMigration = record => reports.push(record);
  await S.openSeasonById('legacy-conflict');
  const disk = await st.backend.loadSeason('legacy-conflict');
  const out = {
    live: window.__r.stored(),
    liveGameRosters: (st.data.games || []).filter(g => Array.isArray(g.roster)).length,
    diskMarker: disk?.rosterOwnership || '(none)',
    diskRoster: (disk?.roster || []).length,
    diskGameRosters: (disk?.games || []).filter(g => Array.isArray(g.roster)).length,
    diskNums: (disk?.games || []).flatMap(g => (g.roster || []).map(p => String(p.num))).sort().join(','),
    reported: reports.map(rec => rec && { ok: rec.ok, status: rec.status, variants: rec.variants }),
  };
  /* And the ordinary save that switching seasons performs must not settle it
     either. `openSeasonById` commits and persists the outgoing season, so a
     season marked in memory during a conflicted open would have that marker
     written to disk by the very next navigation -- stranding the conflicting
     copies behind a marker that says the migration is finished. */
  await window.__r.make('Conflict Exit', 'CE Team', '2026', 'Varsity', [5]);
  const after = await st.backend.loadSeason('legacy-conflict');
  out.afterSwitch = {
    marker: after?.rosterOwnership || '(none)',
    gameRosters: (after?.games || []).filter(g => Array.isArray(g.roster)).length,
  };
  st.onRosterMigration = null;
  return out;
});
ok(r.live === '', 'Neither conflicting roster is promoted to the season', r.live);
ok(r.diskGameRosters === 2 && r.diskNums === '11,22' && r.diskRoster === 0,
  'Both source rosters are left exactly as found on disk', JSON.stringify(r));
ok(r.diskMarker === '(none)',
  'An unresolved conflict is never recorded as a settled migration', r.diskMarker);
ok(r.reported.length === 1 && r.reported[0].ok === false && r.reported[0].status === 'conflict' && r.reported[0].variants === 2,
  'The conflict is surfaced to the app, not swallowed', JSON.stringify(r.reported));
ok(r.afterSwitch.marker === '(none)' && r.afterSwitch.gameRosters === 2,
  'Leaving the season does not write a settled marker over an unresolved conflict', JSON.stringify(r.afterSwitch));

console.log('\n== 7d. Import and adopt obey the same ownership contract ==');
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  await S.createSeason({ name: 'Import Target', team: 'IT Team', year: '2026', level: 'Varsity' });
  // A legacy SEASON export whose games carry the roster.
  const imported = await st.adopt({
    type: 'season', seasonName: 'Imported', year: '2023', level: 'JV',
    games: [
      { id: 'ig1', name: 'G1', plays: [], roster: [{ num: '44', name: 'Imported' }] },
      { id: 'ig2', name: 'G2', plays: [], roster: [{ num: '44', name: 'Imported' }] },
    ],
  });
  const afterImport = {
    ok: imported.ok, roster: (st.data.roster || []).map(p => String(p.num)).join(','),
    gameRosters: (st.data.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length,
    marker: st.data.rosterOwnership,
  };
  const disk = await st.backend.loadSeason(st.currentSeasonId);
  // A legacy SINGLE-GAME save whose roster lives on the payload's game node.
  const single = await st.adopt({ plays: [], gameInfo: { opponent: 'Legacy Opp' }, roster: [{ num: '66', name: 'Single' }] });
  return {
    afterImport,
    diskRoster: (disk?.roster || []).map(p => String(p.num)).join(','),
    diskGameRosters: (disk?.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length,
    single: { ok: single.ok, roster: (st.data.roster || []).map(p => String(p.num)).join(','), gameRosters: (st.data.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length },
  };
});
ok(r.afterImport.ok && r.afterImport.roster === '44' && r.afterImport.marker === 'season',
  'An imported legacy season converts to one season roster', JSON.stringify(r.afterImport));
ok(r.afterImport.gameRosters === 0 && r.diskGameRosters === 0 && r.diskRoster === '44',
  'The imported season retains no game-level roster, in memory or on disk', JSON.stringify(r));
ok(r.single.ok && r.single.roster === '66' && r.single.gameRosters === 0,
  'A legacy single-game import puts its roster on the season and nowhere else', JSON.stringify(r.single));

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

/* A backup can predate the season roster model, so restore is a boundary too --
   and it must land the same structure every other boundary does. */
r = await run(async () => {
  const S = window.app.storage, st = S.seasonStore;
  await window.__r.make('Restore Legacy', 'RL Team', '2025', 'Varsity', [50]);
  const id = st.currentSeasonId;
  const rec = await st.backend.createBackup(id, {
    id, type: 'season', seasonName: 'Restore Legacy', version: 1,
    games: [{ id: 'rg1', name: 'G1', plays: [], roster: [{ num: '31', name: 'FromBackup' }] }],
  }, 'legacy backup');
  const bid = rec && typeof rec === 'object' ? rec.id : rec;
  const restored = bid != null ? await st.restoreBackup(bid) : null;
  const disk = await st.backend.loadSeason(id);
  return {
    attempted: bid != null,
    roster: (restored?.roster || []).map(p => String(p.num)).join(','),
    gameRosters: (restored?.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length,
    marker: restored?.rosterOwnership || '(none)',
    diskRoster: (disk?.roster || []).map(p => String(p.num)).join(','),
    diskGameRosters: (disk?.games || []).filter(g => Object.prototype.hasOwnProperty.call(g, 'roster')).length,
  };
});
ok(r.attempted, 'A legacy-shaped backup could be written and restored', JSON.stringify(r));
ok(r.roster === '31' && r.marker === 'season', 'Restoring a pre-season-model backup converts its roster', JSON.stringify(r));
ok(r.gameRosters === 0 && r.diskGameRosters === 0 && r.diskRoster === '31',
  'A restore retains no game-level roster, in memory or on disk', JSON.stringify(r));

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
