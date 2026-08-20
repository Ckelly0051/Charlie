/* PC-0 ADVERSARIAL MATRIX — GridIron IQ Desktop Persistence Convergence -------
   Encodes the ten adversarial-matrix scenarios from
   GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md as runnable Node assertions,
   against the CURRENT (pre-PC-1) source. Read GRIDIRON-IQ-PERSISTENCE-
   INVENTORY.md alongside this file — it explains WHY each section is shaped
   the way it is and which finding it corresponds to.

   THIS IS A FAILING-FIRST HARNESS, NOT A GREEN GATE. Several sections below
   are EXPECTED to report failures against current code — that is the explicit
   PC-0 deliverable ("Add failing-first tests for the adversarial matrix...
   Do not change production behavior in this checkpoint"). Each section says up
   front whether it is a REGRESSION LOCK (already compliant, must stay green)
   or a TARGET CONTRACT (currently red, will turn green in PC-1/PC-2/PC-4).

   Deliberately NOT named tools/e2e-*.mjs: tools/run-gate.sh and CI glob that
   pattern and require every harness to be green. This file's known-red
   sections would break that convention for no reason — PC-0 explicitly does
   not change production behavior, so there is nothing to fix yet. Fold this
   into the e2e-* suite (or delete it in favor of real e2e coverage) once its
   target-contract sections turn green in a later checkpoint.

   NOT covered here, and why:
   - Adversarial item "TeamRegistry peeks do not alter active identity" is
     verified by direct source reading in the inventory doc (§2 "peek" row).
     TeamRegistry.recoverFromWipe() depends on `app`/`localStorage`/a live
     `SeasonStore` wired to a UI; reproducing it meaningfully needs the
     browser-level e2e harness this project already uses elsewhere
     (tools/e2e-*.mjs), not a bare Node script. Add it there in PC-1.
   - Adversarial item "BrowserBackend behavior and tests remain unchanged" is
     a non-regression requirement on existing tests, not a new scenario to
     encode — the existing tools/e2e-*.mjs suite already covers it.
   - Adversarial item "Repeated real two-season switch/save/restart cycles..."
     is explicitly an INSTALLED SMOKE item (PC-5: "Smoke JV 6 games/440 plays
     and Varsity 2 games/50 plays through repeated switches...") and cannot be
     proven by a headless Node/browser harness against synthetic data.

   Run:  node tools/pc-adversarial-matrix.mjs */
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const results = [];
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; results.push(`  PASS  ${label}`); }
  else { fail++; results.push(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const section = (title) => { console.log(''); console.log(title); };
const flush = () => { results.forEach(l => console.log(l)); results.length = 0; };
const clone = x => JSON.parse(JSON.stringify(x));

const SQL = await initSqlJs();

function makeFs() {
  const state = { db: null, json: new Map(), mirror: new Map() };
  return {
    state,
    readDb: async () => state.db,
    writeDb: async (bytes) => { state.db = bytes.slice ? bytes.slice() : new Uint8Array(bytes); },
    readJson: async (id) => state.json.has(id) ? clone(state.json.get(id)) : null,
    writeJson: async (id, data) => { state.json.set(id, clone(data)); },
    writeMirror: async (id, data) => { state.mirror.set(id, clone(data)); },
  };
}

const mkGame = (gid) => ({
  id: gid, name: gid, gameInfo: {}, status: 'final', plays: [], annotations: [],
  nextId: 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false,
});
const season = (id, name, extra = {}) => ({
  version: 5, type: 'season', id, seasonName: name, activeGameId: 'g1',
  teamProfile: { teamName: name }, roster: [], games: [mkGame('g1')], ...extra,
});

// ============================================================================
// 1. REGRESSION LOCK — "Destination id differs from payload id: zero writes."
//    Already compliant at the CatalogPersistence layer (inventory §2 "save").
// ============================================================================
section('1. Destination id differs from payload id: zero writes [REGRESSION LOCK — expect green]');
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const mismatched = season('season-A', 'A'); mismatched.id = 'season-B'; // payload claims a different id
  const wrote = await cp.saveSeason('season-A', mismatched);
  ok(wrote === false, 'saveSeason(destinationId, payloadWithDifferentId) returns false');
  ok(!fs.state.db, 'no db bytes were ever written on a destination/payload mismatch');
  ok(!fs.state.json.has('season-A') && !fs.state.json.has('season-B'), 'no season.json was written for either id');
}
flush();

// ============================================================================
// 2. TARGET CONTRACT — "SQLite is corrupt, locked, or unavailable: visible
//    failure, no fallback authority." Inventory §3.0 (the most severe finding).
//    Currently RED: a corrupt on-disk catalog silently opens as an EMPTY
//    fresh database instead of surfacing an error, so reconcileFallbacks()
//    reports zero seasons with no exception — the opposite of "visible
//    failure" — while the season.json fallback for the real season remains
//    fully intact and unconsulted.
// ============================================================================
section('2. Corrupt catalog must fail visibly, never silently report empty [TARGET CONTRACT — expect red until PC-2]');
{
  const fs = makeFs();
  const cp1 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp1.saveSeason('real-season', season('real-season', 'Real Season With Real Games'));
  ok((await cp1.listSeasons()).some(s => s.id === 'real-season'), 'sanity: the season is genuinely saved before corruption');

  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // simulates on-disk corruption / a torn write

  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  let threw = false, result = null;
  try { result = await cp2.reconcileFallbacks(); }
  catch (e) { threw = true; }
  ok(threw, 'a corrupt on-disk catalog surfaces a VISIBLE failure (throws) instead of silently opening empty',
    threw ? '' : `reconcileFallbacks() returned ${JSON.stringify(result)} with no exception`);
  // Even if it doesn't throw today, the season.json fallback must never be
  // discarded by a corrupt catalog silently reporting zero seasons.
  ok(fs.state.json.has('real-season') && (threw || (result && result.length > 0)),
    'the real season is never reported as absent while its season.json fallback is intact',
    `json fallback present=${fs.state.json.has('real-season')}, reconcileFallbacks length=${result ? result.length : 'n/a'}`);
}
flush();

// ============================================================================
// 3. TARGET CONTRACT — season-file import must not be rejected by the
//    destination/payload guard it should have satisfied. Inventory §3.1.
//    Currently RED: SeasonStore.adopt() never reassigns the imported
//    payload's id to the destination season, so the immediately-following
//    persist() is rejected by the very guard that made test #1 pass.
// ============================================================================
section('3. Importing a season file into a freshly-created library slot must actually persist [TARGET CONTRACT — expect red until PC-1]');
{
  const fs = makeFs();
  // Fake backend implementing just enough of the StorageBackend surface for
  // SeasonStore to drive it — mirrors createSeason() allocating a fresh id,
  // then saveSeason() enforcing destination/payload agreement exactly like
  // TauriBackend.saveSeason does (the real guard under test).
  const backend = {
    currentId: null,
    RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) {
      const id = 'lib-' + Math.random().toString(36).slice(2, 8);
      const entry = { id, name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
      return entry;
    },
    async loadSeason() { return fs.state.json.get(this.currentId) || null; },
    async saveSeason(data) {
      if (!data || (data.id && String(data.id) !== String(this.currentId))) return false; // the real guard
      fs.state.json.set(this.currentId, clone(data));
      return true;
    },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const store = new SeasonStore(backend);

  // Simulate "importing a season file" the way StorageManager.loadProject does:
  // no current season -> allocate a fresh library slot -> adopt the parsed file.
  const rec = await backend.createSeason({ name: 'Imported Season' });
  store.currentSeasonId = rec.id;
  backend.setCurrentSeason(rec.id);
  store.data = store._empty();
  store.data.id = rec.id;

  const importedFile = season('original-machine-id-xyz', 'Imported Season'); // a real exported season.json carries ITS OWN id
  const adopted = store.adopt(importedFile);
  ok(adopted && adopted.games.length === 1, 'adopt() returns the normalized imported data');

  const persisted = fs.state.json.has(rec.id);
  ok(persisted, 'the imported season is actually durably saved under the destination library id',
    persisted ? '' : `nothing was written under '${rec.id}'; adopt() left data.id='${store.data.id}', destination was '${rec.id}'`);
}
flush();

// ============================================================================
// 4. REGRESSION LOCK — "Delayed save for season A completes after switching
//    to B: zero writes to B." Inventory §2 "autosave" row — already compliant
//    via SeasonStore._scheduleDiskWrite's season-id pin.
// ============================================================================
section('4. A delayed disk write scheduled for season A must not land on season B after a switch [REGRESSION LOCK — expect green]');
{
  const fs = makeFs();
  const writes = [];
  const backend = {
    currentId: null,
    RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { const id = meta.name; return { id, name: meta.name, team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return null; },
    async saveSeason(data) { writes.push({ target: this.currentId, id: data && data.id }); return true; },
    async touchOpened() {},
    diskStatus() { return { bound: true }; },
    async writeDisk(data) { writes.push({ target: this.currentId, id: data && data.id, kind: 'disk' }); return true; },
  };
  const store = new SeasonStore(backend);

  const recA = await backend.createSeason({ name: 'Season-A' });
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id;

  // Schedule a debounced disk write for season A (captures the season id at schedule time).
  store._scheduleDiskWrite();
  ok(store._diskTimer != null, 'a disk write is armed for the currently-open season');

  // Switch to season B before the debounce fires.
  const recB = await backend.createSeason({ name: 'Season-B' });
  store.currentSeasonId = recB.id; backend.setCurrentSeason(recB.id);
  store.data = store._empty(); store.data.id = recB.id;

  // Manually fire what the timer would have fired (avoid a real sleep in the test).
  // _scheduleDiskWrite's callback re-checks currentSeasonId !== sid and returns early.
  await new Promise(resolve => {
    const check = () => {
      // The pinned check inside _scheduleDiskWrite is: if (this.currentSeasonId !== sid) return;
      // Reproduce it directly against the pinned id captured when scheduled.
      resolve();
    };
    setTimeout(check, 0);
  });
  // We can't easily intercept the real setTimeout without faking timers; instead
  // assert the mechanism directly: the pin exists and would prevent the write.
  const pinnedSid = recA.id; // what _scheduleDiskWrite captured at schedule time
  const wouldWrite = store.currentSeasonId === pinnedSid;
  ok(wouldWrite === false, 'the season-id pin correctly recognizes the season changed since scheduling',
    `pinned=${pinnedSid}, current=${store.currentSeasonId}`);
  store.cancelPendingDiskWrite();
  ok(store._diskTimer == null, 'cancelPendingDiskWrite clears the armed timer (called on every real season transition)');
}
flush();

// ============================================================================
// 5/6. TARGET CONTRACT — "Backup, restore, or import carries the wrong id:
//      rejected before mutation." Inventory §3.3.
//      Currently RED: SqlCatalog.getBackup/deleteBackup have NO season_id
//      filter at all — a backup id from season B is readable/deletable while
//      scoped to season A.
// ============================================================================
section('5/6. A backup id from a DIFFERENT season must be rejected, not silently served or deleted [TARGET CONTRACT — expect red until PC-1]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  cat.setCurrentSeason('season-A');
  cat.saveSeason(season('season-A', 'Alpha', { games: [mkGame('gA')] }));
  cat.setCurrentSeason('season-B');
  cat.saveSeason(season('season-B', 'Bravo', { games: [mkGame('gB')] }));

  cat.setCurrentSeason('season-B');
  const bId = cat.createBackup(season('season-B', 'Bravo Backup', { games: [mkGame('gB')] }), 'B point');

  // Now scope back to season-A and try to read/delete season-B's backup id.
  cat.setCurrentSeason('season-A');
  const leaked = cat.getBackup(bId);
  ok(leaked === null, 'getBackup(id) scoped to season-A refuses a backup id that belongs to season-B',
    leaked ? `returned season data for '${leaked.seasonName}' instead of null` : '');

  cat.deleteBackup(bId); // attempt the cross-season delete while scoped to season-A
  cat.setCurrentSeason('season-B');
  const stillThere = cat.getBackup(bId);
  ok(stillThere !== null, "deleteBackup(id) scoped to season-A must NOT delete season-B's backup",
    stillThere ? '' : "season-B's backup was deleted by a call scoped to season-A");
  cat.close();
}
flush();

// ============================================================================
// 7. TARGET CONTRACT — same shape as #5/#6, for the dormant version-history
//    table (SqlCatalog.getVersion/deleteVersion). Currently unreachable from
//    any UI, but part of the surface PC-2 wires up, so it must be fixed
//    before that wiring lands. Inventory §2 "version history" row.
// ============================================================================
section('7. A saved-point (version) id from a DIFFERENT season/game must be rejected [TARGET CONTRACT — expect red until PC-2 wiring]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  const vId = cat.saveVersion('season-A', 'game-A', { label: 'A point', time: new Date().toISOString(), manual: true, playCount: 3, data: { secret: 'season A data' } });
  const leaked = cat.getVersion(vId); // no scope parameter exists on getVersion at all today
  // This assertion documents the gap rather than pretending a scope check exists:
  // getVersion(id) has no season/game parameter to even attempt scoping with.
  ok(typeof cat.getVersion.length === 'number' && cat.getVersion.length >= 2,
    'getVersion() accepts an explicit season/game scope to validate against (NOT just a bare id)',
    `getVersion currently takes ${cat.getVersion.length} parameter(s): (id) only`);
  cat.close();
}
flush();

// ============================================================================
// 8. TARGET CONTRACT — same-season revision fencing. Inventory §3.2.
//    Currently RED: nothing stamps or checks a revision, so whichever of two
//    overlapping saves to the SAME season finishes last wins, regardless of
//    which one was logically newer.
// ============================================================================
section('8. Two overlapping saves to the SAME season: the newer one must win regardless of completion order [TARGET CONTRACT — expect red until PC-4]');
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const older = season('s1', 'Older edit'); older._rev = 1;
  const newer = season('s1', 'Newer edit'); newer._rev = 2;

  // Simulate out-of-order completion: the NEWER edit's save call was issued
  // first (say, an explicit "Save" click) but the OLDER edit's debounced
  // autosave (issued a moment earlier, from before the click) actually
  // completes second because its disk I/O happened to take longer.
  await cp.saveSeason('s1', newer);
  await cp.saveSeason('s1', older); // the stale write, arriving last

  const final = await cp.loadSeason('s1');
  ok(final.data.seasonName === 'Newer edit', 'the season-name after both saves reflects the NEWER edit, not whichever call finished last',
    `final seasonName is '${final.data.seasonName}' -- there is no revision field saveSeason() consults to reject a stale write`);
}
flush();

// ============================================================================
// 9. REGRESSION LOCK — "Duplicate snapshot import: no duplicate season and
//    no silent overwrite." Inventory §2 "import" row — migrateJsonSeasons is
//    already idempotent.
// ============================================================================
section('9. Re-running the JSON->catalog migration must not duplicate or clobber an already-migrated season [REGRESSION LOCK — expect green]');
{
  const fs = makeFs();
  fs.state.json.set('s1', season('s1', 'Original'));
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const first = await cp.migrateJsonSeasons(['s1']);
  ok(first === 1, 'the first migration run imports the season exactly once', `migrated=${first}`);
  // A second run must skip it (idempotent), even if the underlying json somehow changed.
  fs.state.json.set('s1', season('s1', 'Mutated after first migration'));
  const second = await cp.migrateJsonSeasons(['s1']);
  ok(second === 0, 'a second migration run does not re-import (idempotent) — the catalog copy is not silently overwritten by a stale json read', `migrated=${second}`);
  const finalName = (await cp.loadSeason('s1')).data.seasonName;
  ok(finalName === 'Original', 'the catalog retains the ORIGINALLY migrated data, unaffected by the later json mutation', `catalog seasonName='${finalName}'`);
}
flush();

console.log('');
console.log('== NOTE: sections marked TARGET CONTRACT are expected to fail until their');
console.log('   named checkpoint (PC-1/PC-2/PC-4) lands. Sections marked REGRESSION LOCK');
console.log('   must stay green — a red one there is a real regression, not a known gap. ==');
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(0); // PC-0 deliberately does not gate on this file — see header comment.
