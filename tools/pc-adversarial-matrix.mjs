/* PC-0 ADVERSARIAL MATRIX — GridIron IQ Desktop Persistence Convergence -------
   Encodes the ten adversarial-matrix scenarios from
   GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md as runnable Node assertions
   against CURRENT (pre-PC-1) source, repaired across three rounds of Codex
   review (`529d8ae`, `6ed3bb1`, then `f7c09a3` on the round-2 repair). Read
   GRIDIRON-IQ-PERSISTENCE-INVENTORY.md alongside this file for the "why"
   behind each section.

   REPAIR of `529d8ae` (all six required items, verified against source
   before being changed, none taken on report):

   1. [P1] Regression-lock failures now FAIL THE COMMAND. Every assertion is
      tagged 'lock' (already-correct behavior; must stay green) or 'target'
      (an intentional PC-0 failing-first contract; expected red until its
      named checkpoint). The exit code is nonzero iff any LOCK assertion
      failed, or the script threw. A failed TARGET assertion prints but does
      not affect the exit code -- that is what "failing-first, not yet fixed"
      means. A machine-readable summary line is printed so a later checkpoint
      can grep it to confirm which targets have converted to locks.
   2. [P1] The delayed-save lock (section 4) now drives the ACTUAL callback
      `SeasonStore._scheduleDiskWrite()` registers via `setTimeout`, captured
      by temporarily replacing `globalThis.setTimeout` rather than
      reimplementing the guard's comparison inline. It asserts a POSITIVE
      case (same season -> exactly one real write) before the negative case
      (switched season -> zero real writes), so the lock cannot pass merely
      because nothing ever writes. Mutation-verified by hand before this
      repair was committed: commenting out the `if (this.currentSeasonId !==
      sid) return;` guard in js/season-store.js reproduces a leaked write to
      season B and reds exactly the negative-case assertion; restored, green.
   3. [P1] The import target contract (section 3) now requires BOTH that the
      destination id is honored AND that `adopt()` returns something a caller
      can `await` to observe durable success/failure, including an explicit
      rejected-save case. Reassigning the id alone is no longer sufficient to
      turn this green.
   4. [P2] Version ownership (section 7) now builds two real scoped version
      records via SqlCatalog.saveVersion and asserts a foreign getVersion
      returns null and a foreign deleteVersion preserves the record --
      mirroring the backup test's shape exactly, instead of checking function
      arity.
   5. [P2] Added direct contracts for: TeamRegistry-style peek-does-not-mutate
      identity (section 10, LOCK), a stale-sidecar-ignored-when-SQLite-is-fine
      case distinct from outright corruption (section 6, LOCK), BrowserBackend
      cross-season backup ownership (section 11, TARGET -- the browser-path
      twin of section 5/6), and SeasonStore.restoreBackup's own exposure to
      the same wrong-id case (section 12, TARGET). An exact coverage table
      for all ten plan items is printed at the end, naming each item's
      section, the existing suite that already covers it, or its deferred
      owner/checkpoint -- this file no longer silently substitutes one
      scenario for another without saying so.
   6. [P2] Fixed in GRIDIRON-IQ-PERSISTENCE-INVENTORY.md itself (companion
      doc, not this file): the audited baseline is corrected to `bf081fd`
      (this file's true parent -- `037b53d` was four commits stale and predates
      two persistence-affecting commits this inventory's own findings already
      assumed were in place), and the pointer count is corrected to THREE
      mutable pointers (SeasonStore.currentSeasonId, StorageBackend.currentId,
      SqlCatalog.currentId) plus CatalogPersistence's correctly-explicit
      per-call id parameters, which are not a fourth pointer.

   REPAIR of `6ed3bb1` (all four required items, verified against source
   before being changed, none taken on report):

   1. [P1] Import failure is now proven at the REAL production caller, not
      just inside SeasonStore. New section 3b constructs a genuine
      `StorageManager` (via a minimal window/document/FileReader/alert
      platform shim -- the same "fake the platform, never the code under
      test" discipline as the indexedDB/localStorage shims below) and drives
      its actual `loadProject()`. Proves the destination/payload guard
      correctly rejects the import save, that the failure signal fires
      internally, and that `loadProject()` still calls `_clearForNewGame()`/
      `_loadActiveGame()` unconditionally -- reproducing the exact "looks
      imported, was never saved" failure Codex described.
   2. [P1] Positive/setup controls inside target sections are now correctly
      classified as LOCKS, not targets: the corrupt-catalog sanity save
      (section 2), the version own-record read (section 7), and three new
      own-scope reads added specifically for this repair (section 5/6's
      "season-B can read its own backup", section 11's BrowserBackend twin,
      and section 12's "season-B can restore its own backup"). A broken
      fixture can no longer hide behind an "expected red" label and still
      exit 0.
   3. [P2] Version ownership (section 7) now ALSO tests through a modeled
      scoped API built from the one already-scope-aware version primitive
      that exists today (`SqlCatalog.listVersions(seasonId, gameId)`), since
      the real `getVersion`/`deleteVersion` have no scope parameter to test
      "through" at all. Proves all three directions Codex named: B/B reads
      its own version; A/A is refused both read and delete; B/B can STILL
      read its own version afterward -- the last of which specifically rules
      out a naive "every scoped read returns null" implementation from
      trivially satisfying the first two.
   4. [P2] The TeamRegistry lock (section 10) now constructs a REAL
      `SeasonStore` (only the underlying backend is faked) with BOTH mutable
      pointers (`store.currentSeasonId`, `store.backend.currentId`) pinned to
      an already-active season before recovery runs, and asserts both are
      byte-for-byte unchanged afterward -- not just that certain method names
      were avoided. Mutation-verified against production: temporarily made
      the real `SeasonStore.peekSeason()` also set `this.currentSeasonId =
      id` as a side effect (simulating exactly the regression class Codex
      named), reran -- the pointer-identity assertion reds with
      `before='already-active-season', after='s2'` while the sibling backend-
      pointer assertion correctly stays green (proving the two checks are
      independently meaningful, not redundant); restored (`git diff` confirms
      byte-identical), reran clean.

   REPAIR of `f7c09a3` (the one required item, verified against source
   before being changed, not taken on report):

   1. [P1] Section 7's four "version ownership" target assertions previously
      composed the ownership check THEMSELVES (a `scopedGetVersion`/
      `scopedDeleteVersion` helper built from `listVersions()`), so they
      tested this file's own logic, not production -- a broken PC-2
      implementation could leave that local helper untouched and still
      inherit four green results. That helper is deleted. The section now
      calls two exact, named production methods that do NOT exist yet --
      `SqlCatalog.getVersionScoped(seasonId, gameId, id)` and
      `deleteVersionScoped(seasonId, gameId, id)`, documented as the
      intended PC-2 contract in GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.3
      -- via a small `callScoped()` helper that only checks whether the
      method exists and, if so, invokes it; it contains no ownership logic
      of its own. All four assertions now honestly report
      `unavailable`/red ("does not exist yet") until PC-2 implements those
      two methods, at which point they exercise the real implementation with
      no further change to this file.

   PC-1 (`090d4ab`) closed sections 3, 3b, 5/6, 11, 12 and four of section 7's
   six assertions -- reclassified TARGET -> LOCK, since they now pass against
   real production code (SeasonStore.adopt()'s id-reassignment/awaitability;
   SqlCatalog/BrowserBackend backup ownership scoping; the new
   getVersionScoped/deleteVersionScoped seam). Section 7's two legacy bare
   getVersion/deleteVersion assertions stay TARGET, deliberately, disclosed as
   a dormant gap with zero production callers rather than a scheduled item.

   REPAIR of `1aefe8b` (both required items, verified against source before
   being changed, not taken on report):

   1. [P0] Section 3b was rewritten, not just relabeled. The PC-1 version used
      `bound:false`, so it could not observe either mutation Codex's direct
      reproduction found: a rejected import replacing the live in-memory
      season, and one Documents-mirror write landing the rejected payload on
      disk. Root cause (fixed in js/season-store.js and
      js/storage-backend.js): `SeasonStore.adopt()` mutated `this.data` before
      awaiting `persist()`, with no rollback on failure; `persist()` armed
      `_scheduleDiskWrite()` unconditionally, before the canonical save result
      was known; `TauriBackend.writeDisk()` called `_mirrorToDocuments()`/
      `createBackup()` regardless of whether its own internal `saveSeason()`
      succeeded. Section 3b now uses `bound:true` and the same real-callback-
      capture technique section 4 already established, so it can prove --
      not assume -- zero armed timers and zero disk/mirror writes on a
      rejected import, plus a successful-import control proving the same
      mechanism genuinely writes when the save legitimately succeeds. New
      section 3c proves the second half of the finding: a destination season
      created solely for a failed first-run import (StorageManager.
      loadProject()'s no-current-season bootstrap branch) is rolled back
      (deleted), not left as an orphaned empty library entry.
   2. [P1] Every identity-sensitive method on StorageBackend/BrowserBackend/
      TauriBackend (loadSeason/saveSeason/createBackup/listBackups/getBackup/
      deleteBackup/writeDisk) now takes seasonId as an explicit, required
      first parameter -- SeasonStore, the sole caller anywhere in js/, passes
      this.currentSeasonId explicitly at every call site. SqlCatalog's backup
      methods are also explicit-seasonId now, closing the "below the
      [CatalogPersistence] seam" half Codex named specifically. Sections 5/6
      and 11 were extended to pin an incorrect ambient this.currentId cannot
      redirect a read/write scoped elsewhere by an explicit argument;
      tools/e2e-catalog-backend.mjs proves the same directly against the real
      TauriBackend, plus two new assertions proving TauriBackend.writeDisk()
      gates the snapshot backup and Documents mirror on the canonical save
      succeeding.

   REPAIR of `4ae34e8` (both required items, verified against source before
   being changed, not taken on report):

   1. [P0] Section 3d is new -- proves a season switch WHILE an import save is
      pending never restores or deletes the wrong season, in both cases Codex
      named: an already-open A -> B switch racing adopt()'s own rollback, and
      a first-run scaffold S -> B switch racing StorageManager.loadProject()'s
      scaffold-delete cleanup. Neither case was reachable by sections 3/3b/3c,
      whose fake backends all resolve saveSeason() on the same microtask turn
      the test drives -- there was never a real window for a concurrent switch
      to land inside the pending save. This section holds saveSeason() pending
      via a real unresolved Promise, drives a genuine season switch through
      it, then resolves the stale save and asserts the live store still shows
      exactly what the coach switched to. Root cause (js/season-store.js
      adopt()/persist()/_scheduleDiskWrite(), js/storage.js loadProject()):
      `destSeasonId`/the scaffold's own id are now captured ONCE, synchronously,
      before any await, and every later mutation of the live store or delete
      call uses that captured id -- never a value re-read off
      `this.currentSeasonId` after the await, which by then could name
      whatever season the coach has since opened. Reproduced directly before
      this fix, matching Codex's exact report: the store ended as
      `{ currentSeasonId:'B', data.id:'A', data.seasonName:'Season A' }`.
   2. [P1] Section 3e is new -- drives the REAL CatalogPersistence + SqlCatalog
      through a genuine writeDb() failure (section 3b's fake backend could
      only prove SeasonStore doesn't SCHEDULE a later writeDisk(); it never
      touched the real class where the actual defect lived) and proves every
      sidecar sink -- season.json, the Documents mirror, and the in-memory
      catalog itself -- performs zero writes on a rejected canonical save.
      Root cause (js/catalog-persistence.js saveSeason()): the json/mirror
      writes ran unconditionally after `writeDb()`, gated on nothing; a
      writeDb() failure also left the in-memory sql.js catalog committed to
      the rejected payload while on-disk bytes stayed untouched (a same-
      session, faster-than-disk variant of the identical resurrection
      hazard), with no rollback -- unlike deleteSeason() in the same file,
      which already snapshots pre-mutation bytes and reopens from them on a
      writeDb failure. saveSeason() now does the same. js/storage-backend.js
      TauriBackend.saveSeason() also called `_touchMeta()` (library.json)
      unconditionally regardless of the canonical result; it is now gated on
      `okDb`, pinned directly by a new tools/e2e-catalog-backend.mjs
      assertion. tools/e2e-catalog-persistence.mjs section 6's own assertion
      previously REQUIRED the unsafe json write ("db-write failure ... still
      writes the json fallback (no data loss)") -- that was the exact bug
      dressed up as a passing test; it is now inverted to require zero writes
      anywhere, plus the in-memory-rollback proof and a successful-save
      control.

   REPAIR of `4d75bca` (the one remaining P0, verified against source before
   being changed, not taken on report):

   1. [P0] Section 3f is new -- two narrower races section 3d did not cover.
      (i) A season switch racing the SCAFFOLD's OWN durable creation, BEFORE
      adopt() is even called (3d's scaffold sub-test built its scaffold
      through the OLD unconditional-switch createSeason(), exercising a race
      only during the LATER adopt() await, never during creation itself).
      Root cause (js/season-store.js): createSeason()'s unconditional
      `this.currentSeasonId = rec.id` after its own internal await would
      clobber whatever the coach opened WHILE that await was pending. Fixed
      by splitting creation into `_createSeasonRecordOnly()` (pure durable
      allocation, zero live-state touch) and `_adoptSeasonRecord()` (the
      live-state claim, unguarded); `createSeason()` composes both
      unconditionally (unchanged behavior for its deliberate "New Season"
      callers); a new `createUnclaimedSeasonIfEmpty()` composes them with a
      guard -- claims the record only if `hasCurrent()` is still false when
      the durable create resolves -- used exclusively by
      `StorageManager.loadProject()`'s first-run bootstrap.
      (ii) A stale but GENUINELY SUCCESSFUL import still fired
      loadProject()'s final `_clearForNewGame()`/`_loadActiveGame()` reload
      unconditionally against whatever season the coach had since opened --
      adopt() itself already protected `this.data` (section 3d), but the
      CALLER-level reload had no ownership gate of its own. Fixed
      (js/storage.js): `destSeasonId` is captured once in loadProject(),
      immediately before calling adopt() (identical to what adopt() itself
      captures -- no await separates the two calls), and the final reload is
      skipped when the store no longer owns that id after adopt() resolves.
      Both mutation-verified: reverting createUnclaimedSeasonIfEmpty()'s
      hasCurrent() guard to unconditional (matching plain createSeason())
      reproduces the scaffold clobbering B exactly; removing the
      destSeasonId reload gate reproduces the stale-success reload firing on
      B exactly.

   REPAIR of `95e28c9` (the final remaining P0, verified against source
   before being changed, not taken on report):

   1. [P0] Section 3g is new. Root cause (js/season-store.js): even after the
      3f repair, `createUnclaimedSeasonIfEmpty()` still called `this.persist()`
      (fire-and-forget, never awaited) immediately after claiming the blank
      scaffold as current -- a SEPARATE, unfenced write to the SAME season id
      that `loadProject()`'s immediately-following `adopt()` call also awaits
      its own save to. With no PC-4 revision fencing, nothing orders the two
      `backend.saveSeason()` calls against each other; the blank scaffold's
      write, despite starting first, has no guarantee of finishing first, and
      could silently overwrite the successfully imported season. Fixed by
      removing the call entirely: this method's one caller always calls
      adopt() immediately afterward, which durably UPSERTs the real payload to
      this exact id with no dependency on a pre-existing body row, so
      persisting the blank scaffold first bought nothing. First-run import now
      performs exactly ONE canonical write, containing the imported payload.
      Mutation-verified: reintroducing the removed `this.persist()` call
      reproduces exactly two `saveSeason` calls, the first carrying a
      randomly-generated blank-scaffold game id (never `g1`), reds exactly the
      two new content/count assertions.

   Deliberately NOT named tools/e2e-*.mjs: tools/run-gate.sh and CI glob that
   pattern and require every harness green. This file's target-contract
   sections are supposed to be red until their checkpoint lands. Fold it into
   the e2e-* suite once every section is a lock, or delete it in favor of real
   e2e coverage at that point.

   Run:  node tools/pc-adversarial-matrix.mjs */
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SeasonStore } from '../js/season-store.js';
import { BrowserBackend } from '../js/storage-backend.js';
import { TeamRegistry } from '../js/team-registry.js';

let passLock = 0, failLock = 0, passTarget = 0, failTarget = 0;
const results = [];
const ok = (kind, cond, label, extra = '') => {
  const tag = kind === 'lock' ? 'LOCK  ' : 'TARGET';
  if (cond) {
    if (kind === 'lock') passLock++; else passTarget++;
    results.push(`  PASS  [${tag}]  ${label}`);
  } else {
    if (kind === 'lock') failLock++; else failTarget++;
    results.push(`  FAIL  [${tag}]  ${label}${extra ? '  -- ' + extra : ''}`);
  }
};
const section = (title) => { console.log(''); console.log(title); };
const flush = () => { results.forEach(l => console.log(l)); results.length = 0; };
const clone = x => JSON.parse(JSON.stringify(x));

const SQL = await initSqlJs();

function makeFs() {
  const state = { db: null, json: new Map(), mirror: new Map(), writeDbFail: false };
  return {
    state,
    readDb: async () => state.db,
    writeDb: async (bytes) => { if (state.writeDbFail) throw new Error('db write down'); state.db = bytes.slice ? bytes.slice() : new Uint8Array(bytes); },
    readJson: async (id) => state.json.has(id) ? clone(state.json.get(id)) : null,
    writeJson: async (id, data) => { state.json.set(id, clone(data)); },
    writeMirror: async (id, data) => { state.mirror.set(id, clone(data)); },
  };
}

/** Minimal in-memory indexedDB, just enough for BrowserBackend's `handles`/
 *  `backups` object stores. Mirrors the project's own "inject a fake fs"
 *  pattern (see makeFs above) rather than reimplementing BrowserBackend's
 *  logic -- this fakes the PLATFORM API, never the code under test. */
function installFakeIndexedDB() {
  const objectStores = { handles: new Map(), backups: new Map() };
  globalThis.indexedDB = {
    open() {
      const req = { result: null, onupgradeneeded: null, onsuccess: null, onerror: null };
      queueMicrotask(() => {
        const db = {
          objectStoreNames: { contains: (n) => Object.prototype.hasOwnProperty.call(objectStores, n) },
          createObjectStore(n) { if (!objectStores[n]) objectStores[n] = new Map(); },
          onclose: null, onversionchange: null,
          close() {},
          transaction(_storeName) {
            // The caller sets .oncomplete on whatever this returns -- it must
            // be the SAME object the queued microtask checks, or the promise
            // this backs (BrowserBackend._tx) never settles.
            const tx = { oncomplete: null, onerror: null };
            tx.objectStore = (n) => {
              const map = objectStores[n];
              return {
                get(key) { return { result: map.get(key) }; },
                getAll() { return { result: Array.from(map.values()) }; },
                put(value, key) { map.set(key, value); return { result: key }; },
                delete(key) { map.delete(key); return { result: undefined }; },
              };
            };
            queueMicrotask(() => { if (tx.oncomplete) tx.oncomplete(); });
            return tx;
          },
        };
        req.result = db;
        if (req.onupgradeneeded) req.onupgradeneeded();
        if (req.onsuccess) req.onsuccess();
      });
      return req;
    },
  };
}

/** Minimal in-memory localStorage, just enough for TeamRegistry's reads --
 *  the same "fake the platform API" discipline as the indexedDB shim above. */
function installFakeLocalStorage() {
  const map = new Map();
  globalThis.localStorage = {
    getItem: (k) => (map.has(k) ? map.get(k) : null),
    setItem: (k, v) => { map.set(k, String(v)); },
    removeItem: (k) => { map.delete(k); },
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

let crashed = false;
try {

// ============================================================================
// 1. LOCK — "Destination id differs from payload id: zero writes."
// ============================================================================
section('1. Destination id differs from payload id: zero writes [LOCK]');
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const mismatched = season('season-A', 'A'); mismatched.id = 'season-B';
  const wrote = await cp.saveSeason('season-A', mismatched);
  ok('lock', wrote === false, 'saveSeason(destinationId, payloadWithDifferentId) returns false');
  ok('lock', !fs.state.db, 'no db bytes were ever written on a destination/payload mismatch');
  ok('lock', !fs.state.json.has('season-A') && !fs.state.json.has('season-B'), 'no season.json was written for either id');
}
flush();

// ============================================================================
// 2. LOCK — "SQLite is corrupt, locked, or unavailable: visible failure, no
//    fallback authority." Inventory Sec 3.0, the most severe finding on
//    record. CLOSED at PC-2: CatalogPersistence._ensureLoaded() now
//    distinguishes "bytes exist but failed to open" (throws) from "no bytes
//    ever existed" (opens clean); the throw propagates through
//    reconcileFallbacks()/loadSeason() uncaught, so a corrupt on-disk
//    catalog can never be silently reported as "zero seasons."
// ============================================================================
section('2. Corrupt catalog must fail visibly, never silently report empty [LOCK, closed PC-2]');
{
  const fs = makeFs();
  const cp1 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp1.saveSeason('real-season', season('real-season', 'Real Season With Real Games'));
  ok('lock', (await cp1.listSeasons()).some(s => s.id === 'real-season'), 'positive control: the season is genuinely saved before corruption is introduced');

  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // simulates on-disk corruption / a torn write

  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  let threw = false, result = null;
  try { result = await cp2.reconcileFallbacks(); }
  catch (e) { threw = true; }
  ok('lock', threw, 'a corrupt on-disk catalog surfaces a VISIBLE failure (throws) instead of silently opening empty',
    threw ? '' : `reconcileFallbacks() returned ${JSON.stringify(result)} with no exception`);
  // PC-2: season.json is retired as a live authority, so the real season's
  // recoverable evidence now lives ONLY in the Documents-mirror recovery
  // snapshot (never in an app-data season.json fallback that no longer
  // exists). The decisive claim is unchanged in spirit -- the real season is
  // never reported as absent while an intact recovery copy of it exists --
  // just retargeted to the surviving sidecar.
  ok('lock', fs.state.mirror.has('real-season') && threw,
    'the real season is never reported as absent while its Documents-mirror recovery snapshot is intact',
    `mirror snapshot present=${fs.state.mirror.has('real-season')}, threw=${threw}`);
}
flush();

// ============================================================================
// 3. TARGET — season-file import must be BOTH destination-correct AND
//    durably awaitable with a visible failure path. Inventory Sec 3.1.
//    Repair of 529d8ae finding 3: reassigning the id alone must not be
//    sufficient to satisfy this contract.
// ============================================================================
section('3. Importing a season file must persist under the destination id, awaitably, and fail visibly on a rejected write [LOCK, closed PC-1]');
{
  // Case A: today's real bug -- the destination id is never reassigned.
  const fsA = makeFs();
  const backendA = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(seasonId) { return fsA.state.json.get(seasonId) || null; },
    async saveSeason(seasonId, data) {
      if (!data || (data.id && String(data.id) !== String(seasonId))) return false;
      fsA.state.json.set(seasonId, clone(data));
      return true;
    },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const storeA = new SeasonStore(backendA);
  const recA = await backendA.createSeason({ name: 'Imported Season' });
  storeA.currentSeasonId = recA.id; backendA.setCurrentSeason(recA.id);
  storeA.data = storeA._empty(); storeA.data.id = recA.id;
  const importedFile = season('original-machine-id-xyz', 'Imported Season'); // a real exported season.json carries ITS OWN id
  storeA.adopt(importedFile);
  await new Promise(r => setTimeout(r, 0)); // let any fire-and-forgotten persist() settle
  ok('lock', fsA.state.json.has(recA.id), 'the imported season is durably saved under the destination library id',
    fsA.state.json.has(recA.id) ? '' : `nothing was written under '${recA.id}'; adopt() left data.id='${storeA.data.id}', destination was '${recA.id}'`);

  // Case B: even a future id-reassignment fix must not be satisfiable by a
  // fire-and-forget persist(). adopt() must return an awaitable result, and a
  // REJECTED durable write must be visibly reported, not silently accepted.
  const fsB = makeFs();
  const backendB = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return false; }, // simulates a genuine durable-write failure (disk full, catalog down, etc.)
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const storeB = new SeasonStore(backendB);
  const recB = await backendB.createSeason({ name: 'Imported Season 2' });
  storeB.currentSeasonId = recB.id; backendB.setCurrentSeason(recB.id);
  storeB.data = storeB._empty(); storeB.data.id = recB.id;
  const importedFile2 = season(recB.id, 'Imported Season 2'); // id already correct -- isolates THIS finding from Case A's
  const result = storeB.adopt(importedFile2);
  const awaitable = result && typeof result.then === 'function';
  ok('lock', awaitable, "adopt() returns an awaitable result so a caller can observe durable success/failure (today it returns 'this.data' synchronously; persist() is fired-and-forgotten inside it)",
    awaitable ? '' : `adopt() returned a plain, non-awaitable value (typeof ${typeof result})`);
  if (awaitable) {
    const outcome = await result;
    ok('lock', outcome === false || (outcome && outcome.ok === false),
      'a rejected durable save on import is visibly reported as a failure, not silently treated as success',
      `outcome was ${JSON.stringify(outcome)}`);
  }
}
flush();

// ============================================================================
// 3b. LOCK (closed PC-1, repair of Codex `1aefe8b` finding 1) -- proves the
//     finding at the REAL production caller, not just inside SeasonStore.
//     Section 3 proved adopt() itself is fixed (destination-id reassignment +
//     awaitable durable result); this section proves StorageManager.
//     loadProject() (js/storage.js:1257) actually CONSUMES that result rather
//     than proceeding as though every import succeeded, AND that the whole
//     import is ATOMIC end to end: a rejected save must never mutate the live
//     in-memory store, and must never arm the debounced disk/Documents-mirror
//     write that would otherwise land the rejected payload on disk 2.5s
//     later. This constructs a REAL StorageManager (not a fake) via a minimal
//     platform shim (window/document/FileReader/alert -- the same "fake the
//     platform, not the code under test" discipline as the indexedDB/
//     localStorage shims above) and drives its actual loadProject() method.
//
//     `1aefe8b` finding 1, reproduced independently before this fix, verbatim:
//     "A rejected import still replaces the live in-memory season and writes
//     the failed payload to the desktop sidecar... the new caller test uses
//     bound:false, so it cannot detect either mutation." This section fixes
//     both root causes (js/season-store.js adopt()/persist()) and uses
//     bound:true plus the SAME real-callback-capture technique section 4
//     already established for _scheduleDiskWrite(), so the disk/mirror timer
//     is genuinely reachable and this can prove it is never armed -- not
//     merely assumed to be safe because the fixture never exercised it.
//
//     Deliberately isolated from finding 3a: with the id-reassignment fix in
//     place, a destination/payload id mismatch can no longer be the reason a
//     write fails, so this fixture instead simulates a genuine EXTERNAL
//     durable-write failure (disk full, catalog rejected the write) on an
//     ALREADY-open season being overwritten by import -- the failure a caller
//     can still hit even after 3a is fixed. Both a failure case and a
//     success case are driven through the same real caller, with the success
//     case proving the timer/mirror mechanism is genuinely alive (not merely
//     silent because everything in the fixture is broken).
// ============================================================================
section('3b. StorageManager.loadProject() must be atomic: no live mutation, no disk/mirror write, and a visible failure when the durable save is rejected [LOCK, closed PC-1]');
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  if (!globalThis.alert) globalThis.alert = () => {};
  if (!globalThis.FileReader || !globalThis.__pcFakeFileReaderInstalled) {
    globalThis.FileReader = class {
      readAsText(file) { queueMicrotask(() => { if (this.onload) this.onload({ target: { result: file.__text } }); }); }
    };
    globalThis.__pcFakeFileReaderInstalled = true;
  }
  const { StorageManager } = await import('../js/storage.js');
  const deepEq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  function makeHarness(saveSeasonImpl) {
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const toasts = [];
    const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
    const canvas = { ...noopEmitter, annotations: [] };
    const sm = new StorageManager(vc, tagger, canvas);

    const writes = [];
    const diskWrites = [];
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async createSeason(meta) { return { id: 'lib-imported', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
      async loadSeason() { return null; },
      async saveSeason(seasonId, data) {
        const idMatches = !!(data && data.id === seasonId);
        const ok = saveSeasonImpl(idMatches);
        writes.push({ id: data && data.id, idMatches, ok });
        return ok;
      },
      async touchOpened() {},
      // PC-1: must be bound:true -- Codex's exact finding 1 was that a
      // bound:false fixture cannot observe either mutation this section
      // exists to prove is now impossible.
      diskStatus() { return { bound: true }; },
      async writeDisk(seasonId, data, opts) { diskWrites.push({ seasonId, id: data && data.id, snapshot: !!(opts && opts.snapshot) }); return true; },
      async createBackup() { return null; },
    };
    const store = new SeasonStore(backend);
    // A season is ALREADY open before the import (the realistic case this
    // finding targets: importing a replacement file into the current
    // editor) -- isolates loadProject()'s own no-current-season bootstrap
    // branch (createSeason-on-first-import) from the behavior under test.
    store.currentSeasonId = 'lib-imported';
    backend.setCurrentSeason('lib-imported');
    store.data = store._empty();
    store.data.id = 'lib-imported';
    store.data.seasonName = 'Original Live Season';
    sm.seasonStore = store; // the real constructor's own SeasonStore is discarded in favor of this controllable one

    let clearCalled = false, loadCalled = false;
    sm._clearForNewGame = () => { clearCalled = true; };
    sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };
    return { sm, store, writes, diskWrites, toasts, get clearCalled() { return clearCalled; }, get loadCalled() { return loadCalled; } };
  }

  // Drives one full import attempt, capturing every _scheduleDiskWrite()
  // timer armed during it (the real 2.5s debounce, matched by delay), then
  // FIRES each captured timer exactly as the real debounce eventually would
  // -- so "zero sidecar/mirror writes" is proven by actually letting the
  // timer window elapse, not assumed from the timer never being armed.
  async function runImport(saveSeasonImpl, fileSeasonName) {
    const h = makeHarness(saveSeasonImpl);
    const priorSnapshot = clone(h.store.data);
    const importedSeasonJson = season('original-machine-id-xyz', fileSeasonName); // a real exported file carries ITS OWN id
    const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };

    const realSetTimeout = globalThis.setTimeout;
    const capturedTimers = [];
    globalThis.setTimeout = (fn, ms) => { if (ms === 2500) { capturedTimers.push(fn); return 0; } return realSetTimeout(fn, ms); };
    h.sm.loadProject(fakeFile);
    await new Promise(r => realSetTimeout(r, 50)); // settle the fake FileReader's microtask + adopt()'s awaited persist
    globalThis.setTimeout = realSetTimeout;

    capturedTimers.forEach(fn => fn());   // let the debounce window fully elapse
    return { ...h, priorSnapshot, timersArmed: capturedTimers.length };
  }

  // Case A: the durable write genuinely fails for an external reason, even
  // though the destination/payload id is correct (proving this is NOT a
  // re-test of 3a's id-mismatch bug).
  const failing = await runImport(() => false, 'Imported Season');

  ok('lock', failing.writes.some(w => w.idMatches && !w.ok),
    'sanity: the import save was attempted under the CORRECT destination id (proving isolation from 3a) and still failed for an external reason',
    JSON.stringify(failing.writes));
  ok('lock', deepEq(failing.store.data, failing.priorSnapshot),
    'a rejected import leaves the live in-memory store byte-identical to before the attempt (reproduced before this fix: live season name changed to the rejected payload\'s)',
    `live data is now ${JSON.stringify(failing.store.data)}`);
  ok('lock', failing.timersArmed === 0,
    'a rejected import never arms the debounced disk/Documents-mirror write timer',
    `armed=${failing.timersArmed}`);
  ok('lock', failing.diskWrites.length === 0,
    'a rejected import performs zero sidecar/mirror writes even after the debounce window has fully elapsed (reproduced before this fix: one mirror write containing the rejected payload)',
    JSON.stringify(failing.diskWrites));
  ok('lock', failing.clearCalled === false, 'loadProject() does not tear down the current editor for a failed import', `clearCalled=${failing.clearCalled}`);
  ok('lock', failing.loadCalled === false, 'loadProject() does not re-render as though the import succeeded on a failed durable save', `loadCalled=${failing.loadCalled}`);
  ok('lock', failing.toasts.some(t => /import failed/i.test(t.msg)), 'loadProject() surfaces the durable-write failure to the coach with a visible toast',
    JSON.stringify(failing.toasts));

  // Case B: the SUCCESSFUL control -- same caller, same shape of file, but
  // the durable write genuinely succeeds. Proves the failure guards above are
  // not simply refusing every import unconditionally, AND that the timer/
  // mirror mechanism genuinely fires and writes when the save is legitimate
  // (so the "zero writes" result above isn't vacuously true because nothing
  // in this fixture can ever write at all).
  const succeeding = await runImport(() => true, 'Imported Season 2');

  ok('lock', succeeding.clearCalled === true && succeeding.loadCalled === true,
    'loadProject() proceeds to load the imported season once the durable write genuinely succeeds',
    `clearCalled=${succeeding.clearCalled} loadCalled=${succeeding.loadCalled}`);
  ok('lock', succeeding.timersArmed === 1,
    'a SUCCESSFUL import arms exactly one debounced disk/Documents-mirror write', `armed=${succeeding.timersArmed}`);
  ok('lock', succeeding.diskWrites.length === 1 && succeeding.diskWrites[0].id === 'lib-imported',
    'firing that timer performs exactly one disk/mirror write, matching the durably-saved season',
    JSON.stringify(succeeding.diskWrites));
}
flush();

// ============================================================================
// 3c. LOCK (closed PC-1, repair of Codex `1aefe8b` finding 1, second half) --
//     "roll back a destination created solely for a failed first-run
//     import." Section 3b exercises the already-open-season path exclusively
//     (hasCurrent() true throughout); this section exercises the OTHER
//     branch of StorageManager.loadProject() -- a genuine first-run import
//     with no season open, where loadProject() calls seasonStore.
//     createSeason() to bootstrap a destination BEFORE adopt() runs. If that
//     import then fails, the freshly-created season is an orphaned, empty,
//     purposeless library entry -- it must be deleted, not left behind.
// ============================================================================
section('3c. A first-run import that creates its own destination season rolls that season back on a rejected durable save [LOCK, closed PC-1]');
{
  const { StorageManager } = await import('../js/storage.js');   // globals from section 3b already installed
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const toasts = [];
  const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
  const canvas = { ...noopEmitter, annotations: [] };
  const sm = new StorageManager(vc, tagger, canvas);

  const seasons = new Map();   // models the library: id -> meta
  const backend = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) {
      const rec = { id: 'lib-fresh-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
      seasons.set(rec.id, rec);
      return rec;
    },
    async deleteSeason(id) { return seasons.delete(id); },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return false; },   // the import's durable write always fails
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const store = new SeasonStore(backend);
  ok('lock', !store.hasCurrent(), 'sanity: no season is open before the first-run import (hasCurrent() is false)');
  sm.seasonStore = store;

  let clearCalled = false, loadCalled = false;
  sm._clearForNewGame = () => { clearCalled = true; };
  sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

  const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
  const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
  sm.loadProject(fakeFile);
  await new Promise(r => setTimeout(r, 50));

  ok('lock', seasons.size === 0,
    'the destination season created solely for this failed import is rolled back (deleted), not left as an orphaned empty library entry',
    `seasons remaining: ${JSON.stringify([...seasons.keys()])}`);
  ok('lock', !store.hasCurrent(), 'the store returns to its pre-import state: no season open', `currentSeasonId=${store.currentSeasonId}`);
  ok('lock', clearCalled === false && loadCalled === false, 'loadProject() never proceeds to load a season that was never durably saved', `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
  ok('lock', toasts.some(t => /import failed/i.test(t.msg)), 'the coach still sees the failure toast', JSON.stringify(toasts));
}
flush();

// ============================================================================
// 3d. LOCK (closed PC-1, repair of Codex `4ae34e8` finding 1) -- "A season
//     switch while an import save is pending can restore or delete the wrong
//     season in memory." Sections 3/3b/3c prove adopt()/loadProject() are
//     atomic and durable IN ISOLATION; none of their backends leave a real
//     window for a concurrent switch to land inside the pending save (3b/3c's
//     saveSeason() resolves on the SAME microtask turn the test drives). This
//     section deliberately holds saveSeason() pending via a real unresolved
//     Promise, drives a genuine season switch through it, and only then
//     resolves the save -- proving both cases Codex named explicitly:
//     (i) an already-open season A being overwritten by an import, while the
//         coach switches to B before A's save resolves (adopt()'s own
//         rollback branch);
//     (ii) a genuine first-run import that creates a fresh scaffold season S,
//          while the coach opens B before S's import resolves -- the more
//          destructive half, since the OLD code re-read
//          `this.seasonStore.currentSeasonId` (by then 'B') to decide what
//          to delete on failure, instead of the scaffold id it actually
//          created (StorageManager.loadProject()).
//
//     Reproduced directly before this fix, verbatim from Codex's review:
//     "begin an import into A, open B while the backend save is pending,
//     resolve the A save false; the store ends as { currentSeasonId:'B',
//     data.id:'A', data.seasonName:'Season A' }."
// ============================================================================
section('3d. A season switch while an import save is pending never restores or deletes the wrong season in memory [LOCK, closed PC-1]');
{
  // -- (i) already-open A -> B switch, adopt()'s own rollback -------------
  {
    let resolveSave;
    const savePromise = new Promise(res => { resolveSave = res; });
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },   // the import's durable write for A stays pending
      async touchOpened() {},
      diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const importedFile = season('A', 'Imported'); // a real exported file, id already matches A (isolates this from 3a)
    const adoptPromise = store.adopt(importedFile);   // begins the import into A; blocks on savePromise

    // The coach switches to B WHILE the import save is still pending.
    await store.openSeason('B');
    ok('lock', store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely switched to season B while A's import save was still pending",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, dataId: store.data && store.data.id }));

    resolveSave(false);   // the pending import into A now resolves as a rejected durable write
    const result = await adoptPromise;

    ok('lock', result && result.ok === false, "the stale import into A still reports its own genuine failure",
      JSON.stringify(result && { ok: result.ok }));
    ok('lock', store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      "the store still shows season B -- the stale rejected import into A never restored A's stale data over B's live season (reproduced before this fix: currentSeasonId stayed 'B' while data.id/seasonName silently became A's)",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
  }

  // -- (ii) first-run scaffold S -> B switch, loadProject()'s scaffold-delete
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    if (!globalThis.alert) globalThis.alert = () => {};
    if (!globalThis.FileReader || !globalThis.__pcFakeFileReaderInstalled) {
      globalThis.FileReader = class {
        readAsText(file) { queueMicrotask(() => { if (this.onload) this.onload({ target: { result: file.__text } }); }); }
      };
      globalThis.__pcFakeFileReaderInstalled = true;
    }
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const toasts = [];
    const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
    const canvas = { ...noopEmitter, annotations: [] };
    const sm = new StorageManager(vc, tagger, canvas);

    let resolveSave;
    const savePromise = new Promise(res => { resolveSave = res; });
    const seasons = new Map();
    const deletedIds = [];
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async createSeason(meta) {
        const rec = { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
        seasons.set(rec.id, rec);
        return rec;
      },
      async deleteSeason(id) { deletedIds.push(id); return seasons.delete(id); },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },   // the scaffold import's durable write stays pending
      async touchOpened() {},
      diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    ok('lock', !store.hasCurrent(), 'sanity: no season is open before the first-run import (hasCurrent() is false)');
    sm.seasonStore = store;

    let clearCalled = false, loadCalled = false;
    sm._clearForNewGame = () => { clearCalled = true; };
    sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

    const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
    const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
    sm.loadProject(fakeFile);   // creates scaffold S, begins adopt(), blocks on savePromise
    await new Promise(r => setTimeout(r, 20));   // let the FileReader microtask + createSeason() settle

    ok('lock', seasons.has('lib-fresh-scaffold'),
      'sanity: the orphaned scaffold season genuinely exists before the coach switches away');

    // The coach opens season B WHILE the scaffold's import save is still pending.
    await store.openSeason('B');
    ok('lock', store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely opened season B while the scaffold's import save was still pending");

    resolveSave(false);   // the pending scaffold import now resolves as a rejected durable write
    await new Promise(r => setTimeout(r, 20));

    ok('lock', deletedIds.length === 1 && deletedIds[0] === 'lib-fresh-scaffold',
      "the rollback deletes exactly the captured scaffold id, never the season the coach opened meanwhile (reproduced before this fix: re-reading currentSeasonId after the await would have named 'B')",
      JSON.stringify(deletedIds));
    ok('lock', store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      'the store still shows season B untouched -- the failed scaffold import never cleared, reloaded, or replaced it',
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok('lock', clearCalled === false && loadCalled === false,
      'the stale first-run import never re-renders the editor as though it succeeded', `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
  }
}
flush();

// ============================================================================
// 3e. LOCK (closed PC-1, repair of Codex `4ae34e8` finding 2) -- "A rejected
//     SQLite import still writes the rejected payload to live JSON/mirror
//     metadata, so the import is not atomic on the real desktop stack."
//     Section 3b proved SeasonStore does not SCHEDULE a later writeDisk()
//     after a rejected save; it never drove a REAL CatalogPersistence through
//     an actual writeDb() failure, so it could not see that
//     CatalogPersistence.saveSeason() itself still wrote season.json and the
//     Documents mirror unconditionally after a writeDb() rejection
//     (js/catalog-persistence.js), independent of anything SeasonStore does.
//     This section drives the REAL CatalogPersistence + real SqlCatalog
//     through a genuine writeDb() failure and proves every sidecar sink --
//     json, mirror, AND the in-memory catalog itself (a same-session,
//     faster-than-disk variant of the identical resurrection hazard) --
//     remains completely untouched, alongside a successful-save control on a
//     fresh instance proving the same mechanism genuinely writes when the
//     save legitimately succeeds.
// ============================================================================
section('3e. A rejected canonical (db) write produces zero json, mirror, or in-memory-catalog writes [LOCK, closed PC-1]');
{
  const fs = makeFs();
  fs.state.writeDbFail = true;
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const okDb = await cp.saveSeason('s1', season('s1', 'Rejected Import'));

  ok('lock', okDb === false, 'a rejected canonical (db) write reports failure', String(okDb));
  ok('lock', !fs.state.json.has('s1'),
    'a rejected canonical write performs ZERO writes to season.json (reproduced before this fix: the rejected payload was written to the json fallback unconditionally)',
    JSON.stringify([...fs.state.json.keys()]));
  ok('lock', !fs.state.mirror.has('s1'),
    'a rejected canonical write performs ZERO writes to the Documents mirror',
    JSON.stringify([...fs.state.mirror.keys()]));

  // The in-memory catalog must not diverge from disk either -- a same-session
  // load on the SAME cp instance must not read the rejected payload straight
  // back out of memory, even though nothing was ever written to disk.
  fs.state.writeDbFail = false;
  const reload = await cp.loadSeason('s1');
  ok('lock', reload === null,
    "the in-memory catalog rolls back on a writeDb failure -- a later load on the same instance does not read the rejected payload back out of memory (a same-session, faster-than-disk variant of the resurrection hazard)",
    JSON.stringify(reload));

  // Successful control: the same mechanism genuinely writes the mirror when
  // the canonical save legitimately succeeds, on a FRESH instance so the
  // prior failed attempt cannot leave any state behind to fake this. PC-2:
  // season.json is never written by any path, including this one -- pinned
  // explicitly here rather than assumed.
  const fs2 = makeFs();
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs: fs2 });
  const okDb2 = await cp2.saveSeason('s2', season('s2', 'Legitimate Save'));
  ok('lock', okDb2 === true && !fs2.state.json.has('s2') && fs2.state.mirror.has('s2'),
    'a SUCCESSFUL canonical save writes the mirror only -- season.json is never written (PC-2), proving the gate above is not simply disabling every sidecar write entirely',
    JSON.stringify({ okDb2, json: fs2.state.json.has('s2'), mirror: fs2.state.mirror.has('s2') }));
}
flush();

// ============================================================================
// 3f. LOCK (closed PC-1, repair of Codex `4d75bca`, the P0 remaining after
//     section 3d/3e) -- section 3d proved a season switch racing an import's
//     PENDING SAVE never restores/deletes the wrong season; it did not prove
//     two narrower things Codex's re-review named: (i) a season switch racing
//     the SCAFFOLD's OWN durable creation (before adopt() is even called --
//     3d's scaffold sub-test used the OLD unconditional-switch createSeason()
//     to BUILD its scaffold with no race exercised there, only during the
//     later adopt() await); and (ii) a stale but GENUINELY SUCCESSFUL import
//     still unconditionally firing StorageManager.loadProject()'s final
//     `_clearForNewGame()`/`_loadActiveGame()` reload against whatever
//     DIFFERENT season the coach has since opened -- 3d/3b only ever tested
//     the failure path for that reload gate, since adopt() itself already
//     protects `this.data`, but the CALLER-level reload was never gated on
//     ownership at all.
//
//     (i) is closed by SeasonStore.createUnclaimedSeasonIfEmpty(): the
//     scaffold's durable creation and its live-state claim are now two
//     separate steps, with the claim happening ONLY IF hasCurrent() is still
//     false when the durable create resolves -- so a concurrent
//     open/createSeason() landing during that create can never be clobbered.
//     (ii) is closed by capturing `destSeasonId` once in loadProject(),
//     immediately before calling adopt() (identical to the value adopt()
//     itself captures -- no await separates the two), and gating the final
//     reload on the store still owning it after adopt() resolves.
// ============================================================================
section('3f. Scaffold creation cannot be clobbered by a concurrent season switch during its own await, and a stale but successful import never reloads a different season\'s editor [LOCK, closed PC-1]');
{
  // -- (i) a season switch racing the SCAFFOLD's OWN durable creation ------
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    if (!globalThis.alert) globalThis.alert = () => {};
    if (!globalThis.FileReader || !globalThis.__pcFakeFileReaderInstalled) {
      globalThis.FileReader = class {
        readAsText(file) { queueMicrotask(() => { if (this.onload) this.onload({ target: { result: file.__text } }); }); }
      };
      globalThis.__pcFakeFileReaderInstalled = true;
    }
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const toasts = [];
    const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
    const canvas = { ...noopEmitter, annotations: [] };
    const sm = new StorageManager(vc, tagger, canvas);

    let resolveCreate;
    const createPromise = new Promise(res => { resolveCreate = res; });
    const seasons = new Map();
    const deletedIds = [];
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async createSeason(meta) {
        await createPromise;   // the scaffold's OWN durable creation stays pending
        const rec = { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
        seasons.set(rec.id, rec);
        return rec;
      },
      async deleteSeason(id) { deletedIds.push(id); return seasons.delete(id); },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return true; },   // never reached -- the scaffold is unclaimed, so adopt() never targets it
      async touchOpened() {},
      diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    ok('lock', !store.hasCurrent(), 'sanity: no season is open before the first-run import begins');
    sm.seasonStore = store;

    let clearCalled = false, loadCalled = false;
    sm._clearForNewGame = () => { clearCalled = true; };
    sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

    const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
    const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
    sm.loadProject(fakeFile);   // begins createUnclaimedSeasonIfEmpty(); blocks inside backend.createSeason
    await new Promise(r => setTimeout(r, 20));   // let the FileReader microtask reach the pending create

    // The coach opens season B WHILE the scaffold's own durable creation is
    // still in flight -- BEFORE adopt() is ever called, unlike section 3d.
    await store.openSeason('B');
    ok('lock', store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely opened season B while the scaffold's own durable creation was still pending");

    resolveCreate();   // the scaffold's durable creation now resolves
    await new Promise(r => setTimeout(r, 20));

    ok('lock', store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      "the store still shows season B untouched -- the scaffold's own durable creation, resolving AFTER the coach switched away, never clobbered it (reproduced before this fix: createSeason()'s unconditional switch would have overwritten currentSeasonId/data with the blank scaffold the instant this resolved)",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok('lock', seasons.has('lib-fresh-scaffold') === false && deletedIds.length === 1 && deletedIds[0] === 'lib-fresh-scaffold',
      'the never-claimed scaffold is durably deleted rather than left as an orphaned library entry',
      JSON.stringify({ stillExists: seasons.has('lib-fresh-scaffold'), deletedIds }));
    ok('lock', clearCalled === false && loadCalled === false,
      'the stale first-run import never re-renders the editor', `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
    ok('lock', toasts.some(t => /import failed/i.test(t.msg)), 'the coach sees the failure toast', JSON.stringify(toasts));
  }

  // -- (ii) a stale but GENUINELY SUCCESSFUL import must not reload a
  //         different season's editor -----------------------------------
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    if (!globalThis.alert) globalThis.alert = () => {};
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };
    const sm = new StorageManager(vc, tagger, canvas);

    let resolveSave;
    const savePromise = new Promise(res => { resolveSave = res; });
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },   // the import's durable write for A stays pending
      async touchOpened() {},
      diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;

    let clearCalled = false, loadCalled = false;
    sm._clearForNewGame = () => { clearCalled = true; };
    sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

    const importedFile = season('A', 'Imported');   // id already matches A -- the already-open case
    const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedFile) };
    sm.loadProject(fakeFile);
    await new Promise(r => setTimeout(r, 20));   // let adopt() reach the pending save

    // The coach switches to B WHILE the import's own save is still pending.
    await store.openSeason('B');
    ok('lock', store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely switched to season B while the stale import into A was still pending");

    resolveSave(true);   // the STALE import into A now succeeds durably (its own destination, not B)
    await new Promise(r => setTimeout(r, 20));

    ok('lock', store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      "the store still shows season B, byte-identical -- the stale successful import into A never touched it",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok('lock', clearCalled === false && loadCalled === false,
      "a stale but GENUINELY SUCCESSFUL import never reloads the editor on a season the coach has since opened -- the write itself was already correctly non-corrupting (section 3d), but the caller-level reload previously fired unconditionally on ANY resolution, success included, of whatever season happened to be current by then",
      `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
  }
}
flush();

// ============================================================================
// 3g. LOCK (closed PC-1, repair of Codex `95e28c9`, the final remaining P0)
//     -- "First-run import launches two saves to the same season: an
//     unawaited blank scaffold save, and the actual imported-season save.
//     Without PC-4 revision fencing, the blank save can finish last and
//     overwrite the successfully imported season." Root cause:
//     SeasonStore.createUnclaimedSeasonIfEmpty() called this.persist()
//     (fire-and-forget, unawaited) immediately after claiming the blank
//     scaffold as current; StorageManager.loadProject() then immediately
//     called adopt(), which performs its OWN awaited save to the SAME
//     season id. Nothing fenced the two backend.saveSeason() calls against
//     each other, so whichever one's own internal chain of awaits happened
//     to resolve LAST would win -- and a fire-and-forget call starting
//     first has no guarantee of finishing first.
//
//     Fixed by removing the redundant scaffold persist entirely rather than
//     trying to make the two writes race correctly: this method's one
//     caller (loadProject()'s first-run bootstrap) always calls adopt()
//     immediately afterward, which durably UPSERTs the real imported
//     payload to this exact id -- no pre-existing body row is needed. This
//     section proves the exact contract the review asked for: first-run
//     import now performs exactly ONE canonical (backend.saveSeason) write,
//     and that one write contains the imported payload, never a blank
//     scaffold shape.
// ============================================================================
section('3g. First-run import performs exactly one canonical write, and it contains the imported payload, never a blank scaffold [LOCK, closed PC-1]');
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  if (!globalThis.alert) globalThis.alert = () => {};
  if (!globalThis.FileReader || !globalThis.__pcFakeFileReaderInstalled) {
    globalThis.FileReader = class {
      readAsText(file) { queueMicrotask(() => { if (this.onload) this.onload({ target: { result: file.__text } }); }); }
    };
    globalThis.__pcFakeFileReaderInstalled = true;
  }
  const { StorageManager } = await import('../js/storage.js');
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const toasts = [];
  const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
  const canvas = { ...noopEmitter, annotations: [] };
  const sm = new StorageManager(vc, tagger, canvas);

  const saveCalls = [];
  const backend = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return null; },
    async saveSeason(seasonId, data) { saveCalls.push({ seasonId, data: clone(data) }); return true; },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const store = new SeasonStore(backend);
  ok('lock', !store.hasCurrent(), 'sanity: no season is open before the first-run import begins');
  sm.seasonStore = store;

  let clearCalled = false, loadCalled = false;
  sm._clearForNewGame = () => { clearCalled = true; };
  sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

  // The imported payload's own game carries id 'g1' (via the shared season()
  // fixture) -- a structural marker distinguishing it from a blank scaffold,
  // whose game id is freshly generated by _empty()/_newId() and can never
  // equal 'g1'.
  const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
  const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
  sm.loadProject(fakeFile);
  await new Promise(r => setTimeout(r, 30));

  ok('lock', saveCalls.length === 1,
    'first-run import performs exactly ONE canonical (backend.saveSeason) write -- no separate unawaited scaffold-body save races against it (reproduced before this fix: two calls, the second an unawaited blank-scaffold persist with nothing ordering it against the real import write)',
    JSON.stringify(saveCalls.map(c => ({ seasonId: c.seasonId, gameIds: (c.data.games || []).map(g => g.id) }))));
  ok('lock', !!(saveCalls[0] && saveCalls[0].data.games && saveCalls[0].data.games[0] && saveCalls[0].data.games[0].id === 'g1'),
    "that one write contains the imported payload (game id 'g1'), never a blank scaffold shape",
    JSON.stringify(saveCalls[0] && (saveCalls[0].data.games || []).map(g => g.id)));
  ok('lock', clearCalled === true && loadCalled === true, 'the successful first-run import still reloads the editor normally, exactly as before this fix');
}
flush();

// ============================================================================
// 4. LOCK — "Delayed save for season A completes after switching to B: zero
//    writes to B." Repair of 529d8ae finding 2: drives the REAL callback.
// ============================================================================
section('4. A delayed disk write scheduled for season A must not land on season B after a switch [LOCK]');
{
  const writes = [];
  const backend = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: meta.name, name: meta.name, team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return true; },
    async touchOpened() {},
    diskStatus() { return { bound: true }; }, // must be bound, or _scheduleDiskWrite no-ops before arming anything
    async writeDisk(seasonId, data) { writes.push({ target: seasonId, id: data && data.id }); return true; },
  };
  const store = new SeasonStore(backend);
  const realSetTimeout = globalThis.setTimeout;
  const arm = () => {
    let captured = null;
    globalThis.setTimeout = (fn) => { captured = fn; return 0; };
    try { store._scheduleDiskWrite(); } finally { globalThis.setTimeout = realSetTimeout; }
    return captured;
  };

  const recA = await backend.createSeason({ name: 'Season-A' });
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id;

  // POSITIVE control FIRST: firing the real callback while nothing has
  // changed must actually write. This is what makes the negative case below
  // meaningful rather than a check that would pass on a callback that never
  // writes at all.
  const capturedOnA = arm();
  ok('lock', typeof capturedOnA === 'function', 'a real disk-write callback was armed via the real setTimeout call');
  capturedOnA();
  ok('lock', writes.length === 1 && writes[0].target === recA.id,
    "firing the real callback while still on season A performs exactly one write, to season A's slot",
    JSON.stringify(writes));

  // NEGATIVE case: arm again, switch seasons, THEN fire the SAME real callback.
  writes.length = 0;
  const capturedBeforeSwitch = arm();
  const recB = await backend.createSeason({ name: 'Season-B' });
  store.currentSeasonId = recB.id; backend.setCurrentSeason(recB.id);
  store.data = store._empty(); store.data.id = recB.id;
  capturedBeforeSwitch(); // the exact callback armed for season A, fired after the switch to B
  ok('lock', writes.length === 0,
    "firing season A's real callback AFTER switching to season B performs ZERO writes",
    JSON.stringify(writes));
}
flush();

// ============================================================================
// 5/6. TARGET — "Backup, restore, or import carries the wrong id: rejected
//      before mutation." (backup half). Inventory Sec 3.3.
// ============================================================================
section('5/6. A backup id from a DIFFERENT season must be rejected, not silently served or deleted (SqlCatalog) [LOCK, closed PC-1]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  cat.setCurrentSeason('season-A');
  cat.saveSeason(season('season-A', 'Alpha', { games: [mkGame('gA')] }));
  cat.setCurrentSeason('season-B');
  cat.saveSeason(season('season-B', 'Bravo', { games: [mkGame('gB')] }));

  const bId = cat.createBackup('season-B', season('season-B', 'Bravo Backup', { games: [mkGame('gB')] }), 'B point');
  // LOCK: own-scope positive control -- B/B must be able to read its own
  // backup, or the cross-season target reds below could be "achieved" by a
  // broken createBackup/getBackup pair rather than a real ownership gap
  // (Codex 6ed3bb1 finding 2).
  ok('lock', cat.getBackup('season-B', bId)?.seasonName === 'Bravo Backup', "positive control: season-B, scoped to itself, can read its own backup");

  // PC-1: an explicit seasonId argument -- not this.currentId -- is what
  // determines scope now. Deliberately point the ambient pointer at the
  // WRONG season (season-A) while still passing 'season-A' explicitly, so
  // this proves the explicit id is what refuses the read, not a coincidence
  // of whatever the ambient pointer happened to hold.
  cat.setCurrentSeason('WRONG-AMBIENT-SEASON');
  const leaked = cat.getBackup('season-A', bId);
  ok('lock', leaked === null, 'getBackup(seasonId, id) scoped to season-A refuses a backup id that belongs to season-B, regardless of the ambient pointer',
    leaked ? `returned season data for '${leaked.seasonName}' instead of null` : '');

  cat.deleteBackup('season-A', bId);
  const stillThere = cat.getBackup('season-B', bId);
  ok('lock', stillThere !== null, "deleteBackup(seasonId, id) scoped to season-A must NOT delete season-B's backup",
    stillThere ? '' : "season-B's backup was deleted by a call scoped to season-A");
  cat.close();
}
flush();

// ============================================================================
// 7. TARGET — same shape as #5/#6, tested by BEHAVIOR (two real scoped
//    records, foreign get/delete), not by function arity. Repair of 529d8ae
//    finding 4.
// ============================================================================
section('7. Version ownership: the scoped production seam is closed (LOCK, PC-1); the legacy bare getVersion/deleteVersion remain a disclosed, dormant, unscoped fallback with zero production callers (TARGET, not scheduled -- see comment)');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  const vA = cat.saveVersion('season-A', 'game-A', { label: 'A point', time: new Date().toISOString(), manual: true, playCount: 3, data: { seasonName: 'A secret data' } });
  const vB = cat.saveVersion('season-B', 'game-B', { label: 'B point', time: new Date().toISOString(), manual: true, playCount: 5, data: { seasonName: 'B secret data' } });
  // LOCK: positive control -- own-scope reads must keep working, or the
  // target reds below could be "achieved" by a broken save/read, not by a
  // real ownership check (Codex 6ed3bb1 finding 2).
  ok('lock', !!cat.getVersion(vA), 'positive control: a version genuinely exists and reads back for its own scope');

  // DISCLOSED, DORMANT LEGACY FALLBACK -- deliberately NOT closed this
  // checkpoint. SqlCatalog.getVersion(id)/deleteVersion(id) (the bare,
  // unscoped originals) have ZERO callers anywhere in js/ today (grep-
  // verified) -- CatalogPersistence.getVersion/deleteVersion delegate to
  // them but are themselves never called; the only live production path is
  // the new getVersionScoped/deleteVersionScoped seam proven below. They are
  // intentionally left in place rather than deleted, because
  // tools/e2e-catalog-versions.mjs (an existing, unrelated, already-passing
  // regression suite) exercises their plain CRUD/eviction behavior directly
  // and has no ownership dimension to it -- deleting them would force
  // rewriting that file's fixture for zero live-vulnerability benefit, since
  // nothing in production can reach this path unscoped. This is a real,
  // permanently-disclosed gap in a dormant method, not a scheduled PC-2 item
  // -- PC-2 wires VersionManager onto the SCOPED seam, not this one.
  const leaked = cat.getVersion(vB);
  ok('target', leaked === null, "getVersion(id) refuses a version id that belongs to a different season/game scope (legacy unscoped method, zero production callers, deliberately not closed)",
    leaked ? `returned '${leaked.seasonName}' instead of null` : '');
  cat.deleteVersion(vB);
  const stillThere = cat.getVersion(vB);
  ok('target', stillThere !== null, "deleteVersion(id) must not delete a version outside the caller's scope (legacy unscoped method, zero production callers, deliberately not closed)",
    stillThere ? '' : "season-B/game-B's version was deleted while nominally acting on season-A/game-A");

  // PRODUCTION CONTRACT, CLOSED PC-1 (js/sql-catalog.js, js/catalog-persistence.js):
  //   getVersionScoped(seasonId, gameId, id)    -> the version's body if it
  //     belongs to (seasonId, gameId), else null.
  //   deleteVersionScoped(seasonId, gameId, id) -> true if a version owned by
  //     (seasonId, gameId) was deleted; false (no-op, nothing deleted)
  //     otherwise.
  // The four assertions below call EXACTLY those method names on the real
  // SqlCatalog instance. This file contains NO local implementation of the
  // ownership logic -- it exercises the real production seam directly.
  const vB2 = cat.saveVersion('season-B', 'game-B', { label: 'B point 2', time: new Date().toISOString(), manual: true, playCount: 1, data: { seasonName: 'B second record' } });
  const callScoped = (methodName, ...args) => {
    const fn = cat[methodName];
    if (typeof fn !== 'function') return { available: false };
    try { return { available: true, result: fn.apply(cat, args) }; }
    catch (e) { return { available: true, threw: true, message: e && e.message }; }
  };
  const unavailable = (r) => `SqlCatalog.${r.name} does not exist -- the PC-1 scoped seam is missing/regressed`;

  let r = { name: 'getVersionScoped', ...callScoped('getVersionScoped', 'season-B', 'game-B', vB2) };
  ok('lock', r.available && !r.threw && r.result && r.result.seasonName === 'B second record',
    'B/B (correctly scoped) can read its own version through the production getVersionScoped seam',
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));

  r = { name: 'getVersionScoped', ...callScoped('getVersionScoped', 'season-A', 'game-A', vB2) };
  ok('lock', r.available && !r.threw && r.result === null,
    "A/A (foreign) cannot read season-B/game-B's version through the production getVersionScoped seam",
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));

  r = { name: 'deleteVersionScoped', ...callScoped('deleteVersionScoped', 'season-A', 'game-A', vB2) };
  ok('lock', r.available && !r.threw && r.result === false,
    "A/A (foreign) cannot delete season-B/game-B's version through the production deleteVersionScoped seam",
    r.available ? (r.threw ? r.message : `deleted=${r.result}`) : unavailable(r));

  // The decisive check: B/B must STILL read it afterward through the SAME
  // production seam -- rules out a naive "every scoped read returns null"
  // implementation, which would otherwise satisfy the two checks above for free.
  r = { name: 'getVersionScoped', ...callScoped('getVersionScoped', 'season-B', 'game-B', vB2) };
  ok('lock', r.available && !r.threw && r.result && r.result.seasonName === 'B second record',
    'B/B can STILL read its own version through getVersionScoped after the rejected A/A attempt (rules out an always-null implementation)',
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));
  cat.close();
}
flush();

// ============================================================================
// 8. LOCK — the current closest analog to the plan's future "duplicate
//    snapshot import" contract. Repair of 529d8ae finding 5: honestly
//    relabeled -- the general PC-3 snapshot-import/recovery envelope does
//    not exist yet, so this tests JSON->catalog migration idempotence, which
//    is a real, already-shipped, already-correct guarantee, not a
//    substitute for the future contract. See the coverage table below.
// ============================================================================
section('8. JSON-to-catalog migration is idempotent -- current analog of the future duplicate-snapshot-import contract [LOCK]');
{
  const fs = makeFs();
  fs.state.json.set('s1', season('s1', 'Original'));
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const first = await cp.migrateJsonSeasons(['s1']);
  ok('lock', first === 1, 'the first migration run imports the season exactly once', `migrated=${first}`);
  fs.state.json.set('s1', season('s1', 'Mutated after first migration'));
  const second = await cp.migrateJsonSeasons(['s1']);
  ok('lock', second === 0, 'a second migration run does not re-import (idempotent)', `migrated=${second}`);
  const finalName = (await cp.loadSeason('s1')).data.seasonName;
  ok('lock', finalName === 'Original', 'the catalog retains the ORIGINALLY migrated data, unaffected by the later json mutation', `catalog seasonName='${finalName}'`);
}
flush();

// ============================================================================
// 9. LOCK — new: does NOT throw on a genuinely legitimate startup where the
//    JSON sidecar is simply STALE (out of date) while SQLite is fine. Direct
//    contrast with section 2 (corrupt db). "Stale JSON/library sidecars
//    disagree with SQLite: ignored by normal startup."
// ============================================================================
section('9. A stale JSON sidecar is ignored on normal startup when the catalog is healthy [LOCK]');
{
  const fs = makeFs();
  const cp1 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp1.saveSeason('s1', season('s1', 'Current, correct name'));
  // Simulate a stale sidecar left behind by an interrupted prior write --
  // the db is healthy and current; only the json copy disagrees.
  fs.state.json.set('s1', season('s1', 'STALE name from an old write'));

  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const loaded = await cp2.loadSeason('s1');
  ok('lock', loaded.source === 'db', 'a normal load prefers the healthy catalog over a disagreeing json sidecar', `source=${loaded.source}`);
  ok('lock', loaded.data.seasonName === 'Current, correct name', 'the stale sidecar\'s content is ignored, not merged or preferred', `seasonName='${loaded.data.seasonName}'`);
}
flush();

// ============================================================================
// 10. LOCK — new: "TeamRegistry peeks do not alter active identity."
// ============================================================================
section('10. TeamRegistry.recoverFromWipe() never mutates active season identity while inspecting seasons [LOCK]');
{
  installFakeLocalStorage();
  const fakeSeasons = [
    { id: 's1', name: 'Mavericks 2025', teamId: '', created: 100 },
    { id: 's2', name: 'Mavericks 2024', teamId: '', created: 50 },
  ];
  const fakeSeasonData = {
    s1: { teamProfile: { teamName: 'Mavericks', jerseyColor: 'red' }, roster: [{ num: 1 }], games: [] },
    s2: { teamProfile: { teamName: 'Mavericks', jerseyColor: 'red' }, roster: [], games: [] },
  };
  const setCurrentSeasonCalls = [];
  // A REAL SeasonStore, not a fake seasonStore-shaped object, so
  // recoverFromWipe() exercises the actual SeasonStore.peekSeason() chain
  // (Codex 6ed3bb1 finding 4). Only the underlying backend is faked.
  const backend = {
    currentId: 'already-active-season', RETENTION: 25,
    setCurrentSeason(id) { setCurrentSeasonCalls.push(id); this.currentId = id; },
    async listSeasons() { return fakeSeasons; },
    async peekSeason(id) { return fakeSeasonData[id] || null; },
  };
  const store = new SeasonStore(backend);
  // Pin BOTH real mutable pointers to an already-active season BEFORE
  // recovery runs, modeling the real scenario: localStorage identity keys
  // were wiped, but a season is already loaded in memory from before the
  // wipe was detected. Recovery inspecting OTHER seasons must not disturb it.
  store.currentSeasonId = 'already-active-season';

  const openSeasonCalls = [];
  const realOpenSeason = store.openSeason.bind(store);
  store.openSeason = async (id) => { openSeasonCalls.push(id); return realOpenSeason(id); };

  const fakeApp = {
    storage: { seasonStore: store, isDemoSeason: () => false },
    roster: { players: [], _load() {}, renderList() {}, renderQuickPick() {} },
    playbook: null,
  };
  const registry = new TeamRegistry({ app: () => fakeApp });

  ok('lock', registry.teams().length === 0 && !registry.hasTeam(), 'sanity: localStorage identity is genuinely wiped before recovery runs');
  const beforeSeasonStoreId = store.currentSeasonId;
  const beforeBackendId = store.backend.currentId;
  const recovered = await registry.recoverFromWipe();
  ok('lock', recovered === true, 'recovery succeeds against seasons that still exist on disk', `recovered=${recovered}`);
  ok('lock', openSeasonCalls.length === 0, 'recoverFromWipe() never calls the real SeasonStore.openSeason (would mutate active identity)', JSON.stringify(openSeasonCalls));
  ok('lock', setCurrentSeasonCalls.length === 0, 'recoverFromWipe() never calls backend.setCurrentSeason directly', JSON.stringify(setCurrentSeasonCalls));
  // The decisive check Codex named: not "was a suspicious method avoided" but
  // "is the real identity byte-for-byte the same afterward."
  ok('lock', store.currentSeasonId === beforeSeasonStoreId, 'SeasonStore.currentSeasonId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeSeasonStoreId}', after='${store.currentSeasonId}'`);
  ok('lock', store.backend.currentId === beforeBackendId, 'StorageBackend.currentId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeBackendId}', after='${store.backend.currentId}'`);
  ok('lock', registry.hasTeam() && registry.teamProfile().teamName === 'Mavericks', 'identity is genuinely rebuilt from the peeked season data', JSON.stringify(registry.teamProfile()));
}
flush();

// ============================================================================
// 11. TARGET — the BrowserBackend twin of section 5/6: "Browser backup
//     ownership" was named as an omission in 529d8ae finding 5.
// ============================================================================
section('11. A backup id from a DIFFERENT season must be rejected in the BROWSER backend too, not just SqlCatalog [LOCK, closed PC-1]');
{
  installFakeIndexedDB();
  const backend = new BrowserBackend();
  await backend.createBackup('season-A', season('season-A', 'Alpha'), 'A point');
  const bId = (await backend.createBackup('season-B', season('season-B', 'Bravo'), 'B point')).id;
  // LOCK: own-scope positive control (Codex 6ed3bb1 finding 2).
  ok('lock', (await backend.getBackup('season-B', bId))?.seasonName === 'Bravo', 'positive control: season-B, scoped to itself, can read its own BrowserBackend backup');

  // PC-1: an incorrect ambient this.currentId ('WRONG-AMBIENT-SEASON', neither
  // season-A nor season-B) must not be able to redirect the read -- only the
  // explicit seasonId argument decides scope.
  backend.currentId = 'WRONG-AMBIENT-SEASON';
  const leaked = await backend.getBackup('season-A', bId);
  // BrowserBackend.getBackup's not-found path can surface as `undefined`
  // (a real quirk of _tx's out.result normalization on a miss), not
  // strictly `null` as its own doc comment promises -- use a loose/"is
  // this absent" check so that quirk doesn't mask the real assertion.
  ok('lock', leaked == null, "BrowserBackend.getBackup(seasonId, id) scoped to season-A refuses a backup id that belongs to season-B, regardless of the ambient pointer",
    leaked != null ? `returned season data for '${leaked.seasonName}' instead of nothing` : '');

  await backend.deleteBackup('season-A', bId);
  const stillThere = await backend.getBackup('season-B', bId);
  ok('lock', stillThere != null, "BrowserBackend.deleteBackup(seasonId, id) scoped to season-A must NOT delete season-B's backup",
    stillThere != null ? '' : "season-B's backup was deleted by a call scoped to season-A");
}
flush();

// ============================================================================
// 12. LOCK (closed PC-1) — the SeasonStore-level consequence of the same bug.
//     "restore provenance" (named as omitted in 529d8ae finding 5).
//
//     Rewritten for PC-1: the original fixture built a fully hand-rolled fake
//     backend whose getBackup(id) was DELIBERATELY written to mirror "today's
//     real bug: no ownership check against this.currentId" -- so it could
//     never exercise the real fix landing one layer down in
//     BrowserBackend.getBackup(). SeasonStore.restoreBackup(id) has no
//     ownership logic of its own; it is `await this.backend.getBackup(id)`
//     then bails if that returns falsy -- so it is protected transitively,
//     with ZERO new code in restoreBackup itself, once the backend beneath it
//     is scoped correctly (confirmed by reading js/season-store.js:623-636).
//     This now drives the REAL BrowserBackend (same indexedDB shim as
//     section 11) through a REAL SeasonStore, proving the full integrated
//     stack rather than a fixture that could drift from what the backend
//     actually does.
// ============================================================================
section("12. SeasonStore.restoreBackup(id) must refuse a backup that belongs to a different season, not just the storage layer beneath it [LOCK, closed PC-1]");
{
  installFakeIndexedDB();
  const backend = new BrowserBackend();
  const store = new SeasonStore(backend);

  const recA = await backend.createSeason({ name: 'Season-A' });
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id; store.data.seasonName = 'Season A live data';

  const recB = await backend.createSeason({ name: 'Season-B' });
  store.currentSeasonId = recB.id; backend.setCurrentSeason(recB.id);
  store.data = store._empty(); store.data.id = recB.id; store.data.seasonName = 'Season B live data';
  const bBackupId = (await backend.createBackup(recB.id, clone(store.data), 'B point')).id;

  // LOCK: own-scope positive control -- restoring season-B's OWN backup while
  // still scoped to season-B must genuinely work, or the cross-season lock
  // below could be "achieved" by a broken restoreBackup entirely rather than
  // a real ownership gap (Codex 6ed3bb1 finding 2).
  store.data.seasonName = 'mutated before restore';
  const selfRestored = await store.restoreBackup(bBackupId);
  ok('lock', selfRestored && selfRestored.seasonName === 'Season B live data', 'positive control: season-B, scoped to itself, can restore its own backup', JSON.stringify(selfRestored));

  // Switch back to A, then attempt to restore B's backup id while scoped to A.
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id; store.data.seasonName = 'Season A live data';

  const restored = await store.restoreBackup(bBackupId);
  const stillA = store.data.seasonName === 'Season A live data' && store.data.id === recA.id;
  ok('lock', restored === null && stillA,
    "restoreBackup() refuses a backup id belonging to a different season instead of overwriting the current one with it",
    `restoreBackup returned ${restored ? JSON.stringify({ id: restored.id, name: restored.seasonName }) : 'null'}, live data is now ${JSON.stringify({ id: store.data.id, name: store.data.seasonName })}`);
}
flush();

// ============================================================================
// 13. LOCK (closed PC-4) -- Invariant #7's SAME-season half, and the lifecycle
//     paths PC-4's scope names ("Audit ... backup/restore ... and shutdown").
//
//     Every fence before PC-4 protected against a SEASON SWITCH landing
//     mid-flight (sections 3d/3f/4). Inventory Sec 3.2 recorded the same-season
//     case as "structurally real but not yet reproduced as a concrete field
//     symptom" -- it is reproduced concretely now, and the full contract lives
//     in tools/e2e-revision-fence.mjs. What is pinned HERE is the coach-facing
//     lifecycle half, which needs a real StorageManager rather than a bare
//     SeasonStore: a debounced autosave still describing the state a coach just
//     chose to DISCARD must not survive their restore; a pending save is flushed
//     on shutdown rather than dying with the window; and a commit never mirrors
//     an EMPTY roster/playbook over a populated one -- the last of which is a
//     PRE-EXISTING bug (teamProfile had that guard, roster/playbook did not)
//     that PC-4's shutdown flush made reachable at a new moment, and that the
//     full gate caught via e2e-wipe-recovery rather than any focused suite.
// ============================================================================
section('13. A pending autosave never outlives the restore that discarded its state, shutdown flushes it, and a commit never clobbers saved identity with empties [LOCK, closed PC-4]');
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  const { StorageManager } = await import('../js/storage.js');
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const tagger = { ...noopEmitter, plays: [], toast() {} };
  const canvas = { ...noopEmitter, annotations: [] };

  // -- (i) restore cancels a pending autosave -------------------------------
  {
    const sm = new StorageManager(vc, tagger, canvas);
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
      async createBackup() { return 'bk1'; },
      async getBackup() { return season('A', 'Restored'); },
      async writeDisk() { return true; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;
    sm._clearForNewGame = () => {};
    sm._loadActiveGame = () => {};

    sm._autoSave();   // a debounced autosave is now armed for the pre-restore state
    ok('lock', !!sm.autoSaveTimer, 'sanity: a debounced autosave is genuinely armed before the restore');

    await sm.restoreBackup('bk1');
    ok('lock', !sm.autoSaveTimer,
      "a restore cancels the pending autosave that still described the state the coach just discarded -- without this the 1s timer could fire during the restore's own awaits and commitActive() would stamp the PRE-restore plays into the freshly-restored season (the _loadedGameId guard does not catch it: a restore of the same season keeps the same active game id, so its equality check passes)",
      JSON.stringify({ pendingAutosave: !!sm.autoSaveTimer }));
  }

  // -- (ii) shutdown flushes a pending autosave (Inventory Sec 3.4) ---------
  {
    const sm = new StorageManager(vc, tagger, canvas);
    const saves = [];
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason(id) { saves.push(id); return true; },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;   // so commitActive's guard passes
    sm._serialize = () => ({ ...store.data.games[0] });

    // PC-4 repair (Codex 50e2e50, finding 3): flushPendingSaves() is now
    // consistently async, and "idle" resolves TRUE (genuinely safe to
    // proceed), not false -- false is reserved exclusively for an observed
    // save FAILURE, which is what lets a close hook gate on the boolean
    // without conflating "nothing to do" with "something failed".
    const idleFlush = await sm.flushPendingSaves();
    ok('lock', idleFlush === true && saves.length === 0,
      'flushing with nothing armed is an honest no-op, not a spurious write',
      JSON.stringify({ idleFlush, saves: saves.length }));

    sm._autoSave();
    // PC-4 repair (finding 3): flushPendingSaves() now returns the real
    // promise chain instead of a synchronous `true` the instant the write
    // starts, so a genuine close hook can await it. Await it here too, rather
    // than a bare setTimeout(0) that only worked because the old code never
    // returned anything worth awaiting.
    const flushed = await sm.flushPendingSaves();
    ok('lock', flushed === true && saves.length === 1 && !sm.autoSaveTimer,
      "a pending debounced save is flushed on shutdown instead of dying with the window -- before PC-4 nothing anywhere flushed on exit, so a coach closing within ~1s of their last edit lost that edit's canonical write entirely (Inventory Sec 3.4)",
      JSON.stringify({ flushed, saves: saves.length, stillArmed: !!sm.autoSaveTimer }));
  }

  // -- (iii) a commit never mirrors an EMPTY roster/playbook over a populated
  //          one. The season's copies exist so TeamRegistry.recoverFromWipe()
  //          can rebuild a wiped install, so clobbering them with empties
  //          destroys the very source recovery reads. The live objects read the
  //          localStorage keys a wipe removes, so "live is empty" does not
  //          reliably mean "the coach cleared it". PRE-EXISTING asymmetry --
  //          teamProfile has had this guard all along, roster/playbook did
  //          not -- surfaced by PC-4's shutdown flush running a commit at a
  //          moment when those keys could already be gone.
  {
    const sm = new StorageManager(vc, tagger, canvas);
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; }, async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    store.data.roster = [{ num: '22', name: 'Carter' }];
    store.data.playbook = { version: 1, calls: [{ id: 'c1', name: '26 Blast' }] };
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;
    sm._serialize = () => ({ ...store.data.games[0] });

    // The wipe state: the live objects report empty because their localStorage
    // keys are gone, NOT because the coach cleared them.
    const prevApp = globalThis.window.app;
    globalThis.window.app = { roster: { toJSON: () => [] }, playbook: { snapshot: () => ({ version: 1, calls: [] }) } };
    try { sm.commitActive(); } finally { globalThis.window.app = prevApp; }

    ok('lock', store.data.roster.length === 1 && store.data.playbook.calls.length === 1,
      "a commit never mirrors an EMPTY roster/playbook over a populated one -- reproduced before this fix as roster:[] and playbook:{calls:[]} written over a season holding both, which left TeamRegistry.recoverFromWipe() with nothing to restore on the next launch",
      JSON.stringify({ roster: store.data.roster.length, calls: store.data.playbook.calls.length }));

    // Positive control: a genuinely populated live roster/playbook DOES still
    // mirror, so the guard above is not simply freezing these fields forever.
    const prevApp2 = globalThis.window.app;
    globalThis.window.app = { roster: { toJSON: () => [{ num: '7', name: 'Ellis' }, { num: '9', name: 'Ward' }] }, playbook: { snapshot: () => ({ version: 1, calls: [{ id: 'c1' }, { id: 'c2' }] }) } };
    try { sm.commitActive(); } finally { globalThis.window.app = prevApp2; }
    ok('lock', store.data.roster.length === 2 && store.data.playbook.calls.length === 2,
      'positive control: a populated live roster/playbook still mirrors into the season, so the empty-clobber guard is not freezing these fields',
      JSON.stringify({ roster: store.data.roster.length, calls: store.data.playbook.calls.length }));
  }
}
flush();

// ============================================================================
// 14. LOCK (closed PC-4 repair) -- Codex's 618862c re-review of PC-4 (33b8af1):
//     the per-season write queue section 13 depends on was applied to
//     persist()/saveNow()'s canonical half but not to every OTHER call site
//     that also reaches saveSeason (via writeDisk, which TauriBackend.
//     writeDisk() implements as a SECOND, full canonical saveSeason call
//     before its mirror/backup work -- confirmed by reading the real method,
//     not assumed) or to deleteSeason at all. Each finding was reproduced
//     directly against the real SeasonStore before being fixed, per standing
//     discipline. Full detail: GRIDIRON-IQ-PERSISTENCE-INVENTORY.md.
// ============================================================================
section('14. Every writeDisk/deleteSeason/saveNow call site is genuinely ordered against the per-season queue, and a season switch mid-write cannot smear payloads across seasons [LOCK, closed PC-4 repair]');
{
  const tick = () => new Promise(r => setTimeout(r, 0));

  // -- (i) an older snapshot() cannot land after a newer persist() ----------
  // Reproduced before this fix exactly as described: snapshot()'s writeDisk
  // reached the backend directly, so a 1-play snapshot's write could complete
  // AFTER a 2-play persist() and silently revert it.
  {
    const canonicalWrites = [];
    let gate = null;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason(id, data) {
        const snap = clone(data);
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => { canonicalWrites.push(snap); res(true); }; }); }
        canonicalWrites.push(snap); return true;
      },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      // Mirrors the real TauriBackend.writeDisk shape: it performs a second,
      // full canonical saveSeason call, not merely a mirror write.
      async writeDisk(id, data) { return this.saveSeason(id, data); },
      async createBackup() { return 'bk1'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const held = { release: null };
    gate = held;
    // Start (do not await) a snapshot of the CURRENT 1-play state -- its
    // writeDisk is gated pending.
    const snapPromise = store.snapshot('Auto');
    await tick();

    // The coach keeps working: a second play is added. This persist() must
    // now be genuinely queued behind the still-pending gated snapshot write,
    // not race ahead of it -- so start it too without awaiting yet.
    store.data.games[0].plays.push({ id: 2 });
    const persistPromise = store.persist();

    held.release();          // the gated (older, 1-play) write completes first
    await snapPromise;
    await persistPromise;    // the newer (2-play) write is only now free to run

    ok('lock', canonicalWrites.length === 2 &&
               canonicalWrites[0].games[0].plays.length === 1 &&
               canonicalWrites[1].games[0].plays.length === 2,
      "an older snapshot's writeDisk (a second, unfenced canonical saveSeason call on the real backend) cannot land after a newer persist() and revert it -- both are now strictly ordered by dispatch through the same per-season queue",
      JSON.stringify({ order: canonicalWrites.map(w => w.games[0].plays.length) }));
  }

  // -- (ii) deleteSeason() cannot be resurrected by a save already in flight -
  {
    const callOrder = [];
    let gate = null;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() {
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => { callOrder.push('save-done'); res(true); }; }); }
        callOrder.push('save-done'); return true;
      },
      async deleteSeason() { callOrder.push('delete-done'); return true; },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const held = { release: null };
    gate = held;
    const savePromise = store.persist();          // a save is in flight for A, gated
    await tick();

    // The coach deletes A WHILE that save is still pending. cancelPending
    // DiskWrite() only clears a future-scheduled timer; it cannot cancel a
    // write already dispatched, so the delete itself must queue behind it.
    const deletePromise = store.deleteSeason('A');

    held.release();                                // the stale pending save now lands
    await savePromise;
    await deletePromise;

    ok('lock', callOrder.indexOf('save-done') < callOrder.indexOf('delete-done'),
      "a save already in flight for a season completes BEFORE its delete can run, never after -- reproduced before this fix as delete->save landing in that order, which resurrected a durably-deleted season",
      JSON.stringify({ callOrder }));
  }

  // -- (iii) saveNow() bails closed on a rejected canonical write, performing
  //          zero disk/backup side effects -----------------------------------
  {
    const diskWrites = [];
    const backupWrites = [];
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return false; },   // the canonical write REJECTS
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data) { diskWrites.push({ id, plays: data.games[0].plays.length }); return true; },
      async createBackup(id, data) { backupWrites.push({ id, plays: data.games[0].plays.length }); return 'bk'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const result = await store.saveNow('Manual save');

    ok('lock', result === false && diskWrites.length === 0 && backupWrites.length === 0,
      "saveNow() performs zero disk/backup side effects when the canonical save is REJECTED -- reproduced before this fix as a disk write and a backup write still landing after a rejected canonical save",
      JSON.stringify({ result, diskWrites, backupWrites }));
  }

  // -- (iv) saveNow()'s disk/backup writes use the payload captured at
  //         DISPATCH time, never whatever the live season holds after a
  //         season switch lands during the canonical write's own await ------
  {
    const diskWrites = [];
    const backupWrites = [];
    let gate = null;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() {
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => res(true); }); }
        return true;
      },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data) { diskWrites.push({ id, seasonName: data.seasonName, plays: data.games[0].plays.length }); return true; },
      async createBackup(id, data) { backupWrites.push({ id, seasonName: data.seasonName, plays: data.games[0].plays.length }); return 'bk'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const held = { release: null };
    gate = held;
    const saveNowPromise = store.saveNow('Manual save');
    await tick();

    // A season switch lands WHILE the canonical write for A is still pending.
    store.currentSeasonId = 'B';
    backend.setCurrentSeason('B');
    store.data = season('B', 'Season B');

    held.release();
    await saveNowPromise;

    ok('lock', diskWrites.length === 1 && diskWrites[0].id === 'A' && diskWrites[0].seasonName === 'Season A' &&
               backupWrites.length === 1 && backupWrites[0].id === 'A' && backupWrites[0].seasonName === 'Season A',
      "a season switch landing during saveNow()'s canonical write does not write the NEW season's data into the OLD season's disk/backup slot -- reading this.data after the await (rather than the payload captured at dispatch) would reproduce that class",
      JSON.stringify({ diskWrites, backupWrites }));
  }

  // -- (v) StorageManager._wireDesktopCloseFlush() -- the actual mechanism
  //        finding 3 asked for, not just flushPendingSaves()'s awaitability.
  //        A real close request is deferred (preventDefault, synchronously),
  //        the pending save is genuinely awaited, then the window is
  //        explicitly closed. No-op and non-throwing on the browser build.
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    // No window.__TAURI__ (the browser build) -- must be a safe, non-throwing no-op.
    {
      const prevTauri = globalThis.window.__TAURI__;
      delete globalThis.window.__TAURI__;
      const sm = new StorageManager(vc, tagger, canvas);
      let threw = false;
      try { await sm._wireDesktopCloseFlush(); } catch (e) { threw = true; }
      globalThis.window.__TAURI__ = prevTauri;
      ok('lock', !threw, '_wireDesktopCloseFlush() is a safe no-op on the browser build (no window.__TAURI__)');
    }

    // window.__TAURI__ present (desktop) -- the real close-deferral behavior.
    {
      let capturedHandler = null;
      let closeCalled = false;
      let closeResolve;
      const closePromise = new Promise(res => { closeResolve = res; });
      const win = {
        onCloseRequested(handler) { capturedHandler = handler; return Promise.resolve(); },
      };
      const prevTauri = globalThis.window.__TAURI__;
      globalThis.window.__TAURI__ = {
        window: { getCurrentWindow: () => win },
        core: { async invoke(command) {
          closeCalled = command === 'close_after_flush';
          closeResolve();
        } },
      };
      try {
        const sm = new StorageManager(vc, tagger, canvas);
        const saves = [];
        const backend = {
          currentId: null, RETENTION: 25,
          setCurrentSeason(id) { this.currentId = id; },
          async loadSeason() { return null; },
          async saveSeason(id) { saves.push(id); return true; },
          async touchOpened() {}, diskStatus() { return { bound: false }; },
        };
        const store = new SeasonStore(backend);
        store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
        store.data = season('A', 'Season A');
        sm.seasonStore = store;
        sm._loadedGameId = store.data.activeGameId;
        sm._serialize = () => ({ ...store.data.games[0] });

        await sm._wireDesktopCloseFlush();
        ok('lock', typeof capturedHandler === 'function',
          '_wireDesktopCloseFlush() registers a real onCloseRequested handler when window.__TAURI__ is present');

        sm._autoSave();   // arm a pending debounced save, as a real coach edit would
        let preventDefaultCalled = false;
        capturedHandler({ preventDefault() { preventDefaultCalled = true; } });
        await closePromise;   // the detached async flush+close must eventually settle

        ok('lock', preventDefaultCalled && saves.length === 1 && closeCalled,
          'a real close request is deferred, flushed, then handed to the native non-recursive close command',
          JSON.stringify({ preventDefaultCalled, saves: saves.length, closeCalled }));
      } finally {
        globalThis.window.__TAURI__ = prevTauri;
      }
    }
  }
}
flush();

// ============================================================================
// 15. LOCK (closed PC-4 repair round 2) -- Codex's 50e2e50 re-review of
//     95fc1df: three lifecycle races the section-14 repair's own new cases
//     only covered the EASY direction of (work queued BEFORE delete; a close
//     while the debounce timer is still armed). All three reproduced directly
//     against the committed classes before being fixed, per standing
//     discipline. Full detail: GRIDIRON-IQ-PERSISTENCE-INVENTORY.md.
// ============================================================================
section('15. A save dispatched after delete starts cannot resurrect the season, a close awaits an already-running write, and a failed final save keeps the window open [LOCK, closed PC-4 repair round 2]');
{
  // -- (i) a save dispatched WHILE delete is already in flight is refused,
  //        not merely ordered after it -----------------------------------
  {
    const store2 = new Map();
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason(id, data) { store2.set(id, data); return true; },
      async deleteSeason(id) { store2.delete(id); return true; },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    store2.set('A', store.data);

    // The season remains "current" until deleteSeason's own await resolves,
    // so this persist() is genuinely dispatched WHILE delete is in flight --
    // not before it started, the case the prior repair already ordered
    // correctly.
    const deletePromise = store.deleteSeason('A');
    const persistPromise = store.persist('A', season('A', 'Season A (edited)'));
    await Promise.allSettled([deletePromise, persistPromise]);

    ok('lock', !store2.has('A'),
      "a save dispatched while delete is already in flight does not resurrect the season -- reproduced before this fix as delete completing durably, then the later persist still landing and recreating it (Codex's exact reproduction: {case:\"save-after-delete-start\",exists:true})",
      JSON.stringify({ case: 'save-after-delete-start', exists: store2.has('A') }));

    ok('lock', (await persistPromise) === false,
      'the refused save itself is visibly reported as a failure, not silently swallowed',
      JSON.stringify({ persistResult: await persistPromise }));
  }

  // -- (ii) a shutdown close genuinely awaits a write already in flight,
  //         whether it started from the debounce timer's own natural fire or
  //         from an EARLIER flushPendingSaves() call (beforeunload and the
  //         desktop close-requested hook can both fire for one real close) --
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    // Positive control: the underlying write eventually SUCCEEDS.
    {
      const sm = new StorageManager(vc, tagger, canvas);
      let release = null;
      const backend = {
        currentId: null, RETENTION: 25,
        setCurrentSeason(id) { this.currentId = id; },
        async loadSeason() { return null; },
        async saveSeason() { return new Promise(res => { release = () => res(true); }); },
        async touchOpened() {}, diskStatus() { return { bound: false }; },
      };
      const store = new SeasonStore(backend);
      store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
      store.data = season('A', 'Season A');
      sm.seasonStore = store;
      sm._loadedGameId = store.data.activeGameId;
      sm._serialize = () => ({ ...store.data.games[0] });

      sm._autoSave();
      // A FIRST close-flush trigger starts the write and clears the debounce
      // timer (mirrors either the timer's own natural fire or an earlier
      // flushPendingSaves() call).
      const first = sm.flushPendingSaves();
      const saveStillPendingAtSecondCall = typeof release === 'function';
      // A SECOND caller runs while that write is STILL IN FLIGHT -- this is
      // the exact interleaving Codex's reproduction names.
      const second = sm.flushPendingSaves();
      release();
      const [r1, r2] = await Promise.all([Promise.resolve(first), Promise.resolve(second)]);

      ok('lock', saveStillPendingAtSecondCall,
        'sanity: the underlying write is genuinely still pending when the second caller runs',
        JSON.stringify({ saveStillPendingAtSecondCall }));
      ok('lock', r1 === true && r2 === true,
        'both the first and a second, later flushPendingSaves() call correctly await and observe the SAME already-running write rather than the second reporting nothing to flush -- reproduced before this fix as the second call returning a bare synchronous false while the write was still pending (Codex\'s exact reproduction: {case:"already-in-flight-close",flushed:false,saveStillPending:true})',
        JSON.stringify({ r1, r2 }));
    }

    // Negative control: the underlying write ultimately FAILS -- both callers
    // must observe the failure, not a false positive.
    {
      const sm = new StorageManager(vc, tagger, canvas);
      let release = null;
      const backend = {
        currentId: null, RETENTION: 25,
        setCurrentSeason(id) { this.currentId = id; },
        async loadSeason() { return null; },
        async saveSeason() { return new Promise(res => { release = () => res(false); }); },
        async touchOpened() {}, diskStatus() { return { bound: false }; },
      };
      const store = new SeasonStore(backend);
      store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
      store.data = season('A', 'Season A');
      sm.seasonStore = store;
      sm._loadedGameId = store.data.activeGameId;
      sm._serialize = () => ({ ...store.data.games[0] });

      sm._autoSave();
      const first = sm.flushPendingSaves();
      const second = sm.flushPendingSaves();
      release();
      const [r1, r2] = await Promise.all([Promise.resolve(first), Promise.resolve(second)]);
      ok('lock', r1 === false && r2 === false,
        'a genuinely FAILED in-flight write is observed as a failure by both an early and a late caller, not masked as success',
        JSON.stringify({ r1, r2 }));
    }
  }

  // -- (iii) the desktop close hook keeps the window open and surfaces the
  //          error on a genuinely FAILED final save, instead of destroying
  //          the window regardless -----------------------------------------
  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    const sm = new StorageManager(vc, tagger, canvas);
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return false; },   // the final canonical write REJECTS
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;
    sm._serialize = () => ({ ...store.data.games[0] });
    let errorSurfaced = false;
    store.onPersistError = () => { errorSurfaced = true; };
    // _persistNow()'s own _persistFailed() already calls onPersistError on a
    // rejected persist() -- independent of the close hook. Pre-arming the
    // "warned once already" guard suppresses THAT call, so the only way
    // errorSurfaced can become true below is via _wireDesktopCloseFlush()'s
    // OWN explicit call -- otherwise this assertion would pass even with
    // that call deleted, since _persistNow's own signal would still fire.
    store._persistWarned = true;

    let destroyed = false;
    const win = {
      onCloseRequested(handler) { this._h = handler; return Promise.resolve(); },
      async destroy() { destroyed = true; },
    };
    const prevTauri = globalThis.window.__TAURI__;
    globalThis.window.__TAURI__ = {
      window: { getCurrentWindow: () => win },
      core: { invoke: async () => { destroyed = true; } },
    };
    try {
      await sm._wireDesktopCloseFlush();
      sm._autoSave();
      win._h({ preventDefault() {} });
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
    } finally {
      globalThis.window.__TAURI__ = prevTauri;
    }

    ok('lock', !destroyed,
      "the window is NOT destroyed after the final save reports failure -- reproduced before this fix as destroyed:true regardless of the flush result (Codex's exact reproduction: {case:\"failed-flush-close\",destroyed:true})",
      JSON.stringify({ case: 'failed-flush-close', destroyed }));
    ok('lock', errorSurfaced,
      "the close hook's own explicit onPersistError call surfaces the failure to the coach even when _persistNow's own independent warn-once signal has already been used up this session",
      JSON.stringify({ errorSurfaced }));
  }
}
flush();

// ============================================================================
// 16. LOCK (closed PC-4 repair round 3) -- Codex's c962437 re-review of
//     3dab9f4: pendingWrite() (and by extension the section-15 flush fix) is
//     a SNAPSHOT of the most recently dispatched write, not a stable
//     all-writes drain. If write B is dispatched behind write A while a
//     caller is already awaiting A's snapshot, that caller's already-
//     captured reference resolves the instant A settles, oblivious to B --
//     section 15's own tests only proved two callers awaiting the SAME
//     already-existing write, never a NEWER write arriving mid-await. Both
//     branches (the timer-armed dispatch and the pendingWrite fallback) were
//     reproduced directly against the committed classes before being fixed,
//     using INDEPENDENTLY gated writes -- a first probe attempt raced the
//     microtask queue instead and produced a misleading "safe" result purely
//     from incidental .then()-hop-count timing, not a real guarantee; that
//     construction defect is recorded here so it is not repeated.
// ============================================================================
section('16. flushPendingSaves() drains to a genuinely stable tail -- a write dispatched while an older one is still unresolved is never abandoned, and a freshly re-armed autosave mid-drain is picked up too [LOCK, closed PC-4 repair round 3]');
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  const { StorageManager } = await import('../js/storage.js');
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const tagger = { ...noopEmitter, plays: [], toast() {} };
  const canvas = { ...noopEmitter, annotations: [] };

  function gatedBackend() {
    const gates = [];   // one release fn per dispatched saveSeason call, in order
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return new Promise(res => { gates.push(v => res(v)); }); },
      async touchOpened() {}, diskStatus() { return { bound: false }; },
    };
    return { backend, gates };
  }
  const freshStore = (backend) => {
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    return store;
  };
  const wireStorageManager = (store) => {
    const sm = new StorageManager(vc, tagger, canvas);
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;
    sm._serialize = () => ({ ...store.data.games[0] });
    return sm;
  };

  // -- (i) timer-armed branch: B dispatched (persist()) while A is still
  //        unresolved must be awaited too, before the flush resolves -------
  {
    const { backend, gates } = gatedBackend();
    const store = freshStore(backend);
    const sm = wireStorageManager(store);

    sm._autoSave();
    const flushPromise = sm.flushPendingSaves();   // dispatches A (gates[0])
    await new Promise(r => setTimeout(r, 0));
    store.persist();                               // B dispatched WHILE A is unresolved -- gates[1]
    await new Promise(r => setTimeout(r, 0));

    let settled = false;
    flushPromise.then(() => { settled = true; });

    gates[0](true);   // release A ONLY
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    const settledOnAAlone = settled;

    gates[1](true);   // now release B
    await flushPromise;

    ok('lock', !settledOnAAlone,
      "flushPendingSaves() does not resolve on A alone -- a newer write (B) dispatched while A was still unresolved must also settle first (Codex's exact reverse interleaving: start A, begin flushPendingSaves(), dispatch B while A is unresolved, release A, prove the flush does not resolve until B settles)",
      JSON.stringify({ settledOnAAlone }));
  }

  // -- (ii) same interleaving, but B FAILS -- the close hook must keep the
  //         window open, not merely reflect A's earlier success ------------
  {
    const { backend, gates } = gatedBackend();
    const store = freshStore(backend);
    const sm = wireStorageManager(store);

    let destroyed = false;
    let errorSurfaced = false;
    store.onPersistError = () => { errorSurfaced = true; };
    const win = {
      onCloseRequested(handler) { this._h = handler; return Promise.resolve(); },
      async destroy() { destroyed = true; },
    };
    const prevTauri = globalThis.window.__TAURI__;
    globalThis.window.__TAURI__ = {
      window: { getCurrentWindow: () => win },
      core: { invoke: async () => { destroyed = true; } },
    };
    try {
      await sm._wireDesktopCloseFlush();
      sm._autoSave();
      win._h({ preventDefault() {} });               // dispatches A (gates[0])
      await new Promise(r => setTimeout(r, 0));
      store.persist();                                // B dispatched while A is unresolved -- gates[1]
      await new Promise(r => setTimeout(r, 0));
      gates[0](true);    // A succeeds
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
      const destroyedOnAAlone = destroyed;
      gates[1](false);   // B FAILS
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));
      await new Promise(r => setTimeout(r, 0));

      ok('lock', !destroyedOnAAlone,
        'the window is not destroyed merely because A (the write present when close began) succeeded, while B (dispatched mid-close) is still unresolved',
        JSON.stringify({ destroyedOnAAlone }));
      ok('lock', !destroyed && errorSurfaced,
        "a genuinely failed LATER write (B) keeps the window open and surfaces the failure, even though the EARLIER write (A) succeeded -- repeats Codex's exact instruction to prove this with B failing",
        JSON.stringify({ destroyed, errorSurfaced }));
    } finally {
      globalThis.window.__TAURI__ = prevTauri;
    }
  }

  // -- (iii) the pendingWrite-fallback branch (a second flushPendingSaves()
  //          call, matching beforeunload + close-requested both firing) is
  //          drained just as stably -----------------------------------------
  {
    const { backend, gates } = gatedBackend();
    const store = freshStore(backend);
    const sm = wireStorageManager(store);

    sm._autoSave();
    const first = sm.flushPendingSaves();     // clears the timer, dispatches A (gates[0])
    await new Promise(r => setTimeout(r, 0));
    const second = sm.flushPendingSaves();    // hadTimer=false -- falls back to the drain
    await new Promise(r => setTimeout(r, 0));
    store.persist();                          // B dispatched while both flushes await A -- gates[1]
    await new Promise(r => setTimeout(r, 0));

    let settled = false;
    second.then(() => { settled = true; });

    gates[0](true);
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    const settledOnAAlone = settled;

    gates[1](true);
    await Promise.all([first, second]);

    ok('lock', !settledOnAAlone,
      'the pendingWrite-fallback branch (a second caller in the same close) also drains to B, not merely to whichever write it happened to snapshot first',
      JSON.stringify({ settledOnAAlone }));
  }

  // -- (iv) a debounce timer re-armed WHILE the flush is draining an
  //         already-dispatched write is picked up before the flush resolves,
  //         not lost -- Codex's explicit second requirement -----------------
  {
    const { backend, gates } = gatedBackend();
    const store = freshStore(backend);
    const sm = wireStorageManager(store);

    sm._autoSave();
    const flushPromise = sm.flushPendingSaves();   // dispatches A (gates[0])
    await new Promise(r => setTimeout(r, 0));

    // A fresh edit arms a NEW debounce timer while the flush is still
    // draining A -- not a direct persist() call this time, the timer itself.
    sm._autoSave();
    await new Promise(r => setTimeout(r, 0));

    let settled = false;
    flushPromise.then(() => { settled = true; });

    gates[0](true);   // release A
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    await new Promise(r => setTimeout(r, 0));
    const settledOnAAloneBeforeTimerFires = settled;
    const timerWriteDispatched = gates.length >= 2;

    if (gates.length >= 2) gates[1](true);
    await flushPromise;

    ok('lock', !settledOnAAloneBeforeTimerFires && timerWriteDispatched,
      "a debounce timer re-armed WHILE the flush is draining an existing write is itself dispatched and awaited before the flush resolves -- required because SeasonStore.drainWrites() has no visibility into StorageManager's own timer field, so only the OUTER loop rechecking it can catch this",
      JSON.stringify({ settledOnAAloneBeforeTimerFires, timerWriteDispatched, gatesDispatched: gates.length }));
  }
}
flush();

// ============================================================================
// 17. LOCK (closed PC-5 review repair, Codex `1de3c54`) -- SeasonStore.
//     snapshot()/saveNow() create each backup ONCE. When diskStatus().bound
//     is true, writeDisk()'s own internal createBackup() call is the SOLE
//     owner; the backend's separate, directly-callable createBackup() must
//     never be invoked a second time for the same write. And when writeDisk's
//     internal attempt genuinely fails to produce a durable backup,
//     snapshot()/restoreBackup() must fail closed -- never silently retry
//     and never let the live season data be mutated.
// ============================================================================
section('17. snapshot()/saveNow() create each backup exactly once; a genuinely failed safety backup keeps restore fail-closed [LOCK, closed PC-5 review repair]');
{
  // -- (i) snapshot(): writeDisk's internal success is used directly; the
  //        separate createBackup() is never called a second time -------------
  {
    let directCalls = 0;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = { id: 'bk-internal', seasonName: data.seasonName }; return true; },
      async createBackup() { directCalls++; return 'bk-should-not-happen'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const result = await store.snapshot('Before restore');

    ok('lock', directCalls === 0 && result && result.id === 'bk-internal',
      "snapshot() uses writeDisk()'s own internal backup result directly and never makes a second, separate createBackup() call for the same write -- reproduced before this fix as the second call always firing, colliding with the internal one",
      JSON.stringify({ directCalls, result }));
  }

  // -- (ii) snapshot(): writeDisk's internal attempt genuinely fails a
  //         durable write -- snapshot() reports failure honestly, never a
  //         masked success, and never retries via the direct call -----------
  {
    let directCalls = 0;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = null; return true; },   // the internal backup write genuinely failed
      async createBackup() { directCalls++; return 'bk-should-not-happen'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const result = await store.snapshot('Before restore');

    ok('lock', result === null && directCalls === 0,
      "a genuinely failed internal backup write is reported as null, not silently retried through the direct call -- a retry after a genuine failure would just repeat it, defeating create-each-backup-once",
      JSON.stringify({ result, directCalls }));
  }

  // -- (iii) restoreBackup(): a genuinely failed safety snapshot (case ii's
  //          exact shape) keeps restore fail-closed -- live data untouched --
  {
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = null; return true; },   // the pre-restore safety backup genuinely fails
      async createBackup() { return null; },
      async getBackup() { return season('A', 'Restored from backup'); },   // a real backup to restore FROM exists
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    const live = season('A', 'Live unsaved edits');
    store.data = live;

    const restored = await store.restoreBackup('some-backup-id');

    ok('lock', restored === null && store.data === live,
      "restoreBackup() refuses to proceed when the pre-restore safety backup genuinely fails to be created durably -- live season data is left completely untouched, never partially overwritten",
      JSON.stringify({ restored: restored, dataUnchanged: store.data === live }));
  }

  // -- (iv) saveNow(): the same create-each-backup-once contract, for the
  //         explicit "Save Season" path ---------------------------------------
  {
    let directCalls = 0;
    const backend = {
      currentId: null, RETENTION: 25,
      setCurrentSeason(id) { this.currentId = id; },
      async loadSeason() { return null; },
      async saveSeason() { return true; },
      async touchOpened() {}, diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = { id: 'bk-internal-2' }; return true; },
      async createBackup() { directCalls++; return 'bk-should-not-happen'; },
    };
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    await store.saveNow('Manual save');

    ok('lock', directCalls === 0,
      "saveNow() also creates each backup exactly once -- when writeDisk's internal call already ran, the previously-unconditional second createBackup() call is skipped entirely",
      JSON.stringify({ directCalls }));
  }
}
flush();

} catch (e) {
  crashed = true;
  console.log('');
  console.log(`  HARNESS EXCEPTION: ${e && e.stack ? e.stack : e}`);
}

// ============================================================================
// Coverage table — the plan's exact ten adversarial-matrix items, each mapped
// to where it is proven. Repair of 529d8ae finding 5: never claim "encodes
// the ten" without saying exactly how for each one.
// ============================================================================
console.log('');
console.log('== ADVERSARIAL MATRIX COVERAGE (all ten plan items) ==');
const coverage = [
  ['Destination id differs from payload id: zero writes.', 'DIRECT — section 1'],
  ['Delayed save for season A completes after switching to B: zero writes to B.', 'DIRECT — section 4'],
  ['Backup, restore, or import carries the wrong id: rejected before mutation.', 'DIRECT — sections 3 (import, SeasonStore layer), 3b (import, the real StorageManager.loadProject() caller), 3c (import, first-run scaffold rollback), 3d (import racing a concurrent season switch, both the already-open and first-run-scaffold cases), 3e (a rejected canonical write is atomic across json/mirror/in-memory-catalog), 3f (a season switch racing the scaffold\'s own creation await, and a stale-but-successful import never reloading a different season\'s editor), 3g (first-run import performs exactly one canonical write, never a racing blank-scaffold write), 5/6 (SqlCatalog backup), 11 (BrowserBackend backup), 12 (SeasonStore.restoreBackup)'],
  ['TeamRegistry peeks do not alter active identity.', 'DIRECT — section 10'],
  ['SQLite is corrupt, locked, or unavailable: visible failure, no fallback authority.', 'CLOSED PC-2, at both layers: section 2 here (CatalogPersistence, the corrupt-bytes case) and tools/e2e-catalog-backend.mjs section 5 (TauriBackend, a genuinely-failed-to-init catalog, driven through a fake window.__TAURI__ shim and be._loadSqlEngine override rather than plain Node, since this call site needs a real fs).'],
  ['Stale JSON/library sidecars disagree with SQLite: ignored by normal startup.', 'DIRECT — section 9'],
  ['Delete fails: season remains durable and cannot resurrect from a stale sidecar.', 'COVERED BY EXISTING SUITE — tools/e2e-catalog-persistence.mjs already asserts this exact scenario ("the on-disk db was never mutated by the failed delete"); not duplicated here.'],
  ['Duplicate snapshot import: no duplicate season and no silent overwrite.', 'PARTIAL / RELABELED — section 8 tests JSON-to-catalog migration idempotence, the closest existing analog. The general PC-3 snapshot-import/recovery envelope ("scans snapshots, previews differences, asks for confirmation, then imports") does not exist in production yet; the real contract is deferred to PC-3, where it will get its own direct test against the real envelope.'],
  ['BrowserBackend behavior and tests remain unchanged.', 'NON-REGRESSION — enforced by the existing tools/e2e-*.mjs suite continuing to pass; not a new scenario to encode here.'],
  ['Repeated real two-season switch/save/restart cycles preserve ids, counts, tags, notes, and linked-film metadata.', 'DEFERRED — explicitly an installed-smoke item per the plan itself ("Smoke JV 6 games/440 plays and Varsity 2 games/50 plays through repeated switches..."), owner PC-5. Cannot be proven by a headless harness against synthetic data.'],
];
coverage.forEach(([item, status], i) => console.log(`  ${i + 1}. ${item}\n     -> ${status}`));

console.log('');
console.log('== NOTE: LOCK sections must stay green -- a red one there is a real');
console.log('   regression, not a known gap. TARGET sections are expected to fail');
console.log('   until their named checkpoint lands; they do not affect the exit code. ==');
console.log(JSON.stringify({ locks: { pass: passLock, fail: failLock }, targets: { pass: passTarget, fail: failTarget }, crashed }));
console.log(`== RESULT: ${passLock + passTarget} passed, ${failLock + failTarget} failed (locks ${passLock}/${passLock + failLock}, targets ${passTarget}/${passTarget + failTarget}) ==`);
process.exit((failLock > 0 || crashed) ? 1 : 0);
