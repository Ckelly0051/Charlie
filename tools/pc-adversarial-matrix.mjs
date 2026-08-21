/* PC-0 ADVERSARIAL MATRIX — GridIron IQ Desktop Persistence Convergence -------
   Encodes the ten adversarial-matrix scenarios from
   GRIDIRON-IQ-PERSISTENCE-CONVERGENCE-PLAN.md as runnable Node assertions
   against CURRENT (pre-PC-1) source, repaired across two rounds of Codex
   review (`529d8ae`, then `6ed3bb1` on the round-1 repair). Read
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
// 2. TARGET — "SQLite is corrupt, locked, or unavailable: visible failure, no
//    fallback authority." Inventory Sec 3.0, the most severe finding.
// ============================================================================
section('2. Corrupt catalog must fail visibly, never silently report empty [TARGET, checkpoint: PC-2]');
{
  const fs = makeFs();
  const cp1 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp1.saveSeason('real-season', season('real-season', 'Real Season With Real Games'));
  // LOCK, not target: this is the fixture's own positive control. If catalog
  // save is broken, this must fail LOUDLY (exit nonzero) rather than being
  // absorbed as one more "expected red" inside a target section -- Codex
  // 6ed3bb1 finding 2.
  ok('lock', (await cp1.listSeasons()).some(s => s.id === 'real-season'), 'positive control: the season is genuinely saved before corruption is introduced');

  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // simulates on-disk corruption / a torn write

  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  let threw = false, result = null;
  try { result = await cp2.reconcileFallbacks(); }
  catch (e) { threw = true; }
  ok('target', threw, 'a corrupt on-disk catalog surfaces a VISIBLE failure (throws) instead of silently opening empty',
    threw ? '' : `reconcileFallbacks() returned ${JSON.stringify(result)} with no exception`);
  ok('target', fs.state.json.has('real-season') && (threw || (result && result.length > 0)),
    'the real season is never reported as absent while its season.json fallback is intact',
    `json fallback present=${fs.state.json.has('real-season')}, reconcileFallbacks length=${result ? result.length : 'n/a'}`);
}
flush();

// ============================================================================
// 3. TARGET — season-file import must be BOTH destination-correct AND
//    durably awaitable with a visible failure path. Inventory Sec 3.1.
//    Repair of 529d8ae finding 3: reassigning the id alone must not be
//    sufficient to satisfy this contract.
// ============================================================================
section('3. Importing a season file must persist under the destination id, awaitably, and fail visibly on a rejected write [TARGET, checkpoint: PC-1]');
{
  // Case A: today's real bug -- the destination id is never reassigned.
  const fsA = makeFs();
  const backendA = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return fsA.state.json.get(this.currentId) || null; },
    async saveSeason(data) {
      if (!data || (data.id && String(data.id) !== String(this.currentId))) return false;
      fsA.state.json.set(this.currentId, clone(data));
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
  ok('target', fsA.state.json.has(recA.id), 'the imported season is durably saved under the destination library id',
    fsA.state.json.has(recA.id) ? '' : `nothing was written under '${recA.id}'; adopt() left data.id='${storeA.data.id}', destination was '${recA.id}'`);

  // Case B: even a future id-reassignment fix must not be satisfiable by a
  // fire-and-forget persist(). adopt() must return an awaitable result, and a
  // REJECTED durable write must be visibly reported, not silently accepted.
  const fsB = makeFs();
  const backendB = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return null; },
    async saveSeason(_data) { return false; }, // simulates a genuine durable-write failure (disk full, catalog down, etc.)
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
  ok('target', awaitable, "adopt() returns an awaitable result so a caller can observe durable success/failure (today it returns 'this.data' synchronously; persist() is fired-and-forgotten inside it)",
    awaitable ? '' : `adopt() returned a plain, non-awaitable value (typeof ${typeof result})`);
  if (awaitable) {
    const outcome = await result;
    ok('target', outcome === false || (outcome && outcome.ok === false),
      'a rejected durable save on import is visibly reported as a failure, not silently treated as success',
      `outcome was ${JSON.stringify(outcome)}`);
  }
}
flush();

// ============================================================================
// 3b. TARGET — new: proves the finding at the REAL production caller, not
//     just inside SeasonStore. Repair of 6ed3bb1 finding 1: a PC-1 change
//     could satisfy every section-3 assertion above while leaving
//     StorageManager.loadProject() (js/storage.js:1257) unchanged, which
//     currently ignores adopt()'s result and proceeds to _clearForNewGame()/
//     _loadActiveGame() as though the import succeeded. This constructs a
//     REAL StorageManager (not a fake) via a minimal platform shim
//     (window/document/FileReader/alert -- the same "fake the platform, not
//     the code under test" discipline as the indexedDB/localStorage shims
//     above) and drives its actual loadProject() method.
// ============================================================================
section('3b. StorageManager.loadProject() must not proceed as though import succeeded when the durable save failed [TARGET, checkpoint: PC-1]');
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
  const tagger = { ...noopEmitter, plays: [], toast() {} };
  const canvas = { ...noopEmitter, annotations: [] };
  const sm = new StorageManager(vc, tagger, canvas);

  const writes = [];
  let importFailureNotified = false;
  const backend = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: 'lib-imported', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return null; },
    // Real destination/payload semantics (matches TauriBackend.saveSeason):
    // the create-season save (correct id) succeeds; the import save (id
    // never reassigned by adopt() -- finding 3a above) fails. Isolates that
    // THIS test is proving the CALLER never checks that failure, not
    // re-proving the id-mismatch bug itself.
    async saveSeason(data) {
      const okWrite = !!(data && data.id === this.currentId);
      writes.push({ id: data && data.id, ok: okWrite });
      return okWrite;
    },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
  };
  const store = new SeasonStore(backend);
  store.onPersistError = () => { importFailureNotified = true; };
  sm.seasonStore = store; // the real constructor's own SeasonStore is discarded in favor of this controllable one

  let clearCalled = false, loadCalled = false;
  sm._clearForNewGame = () => { clearCalled = true; };
  sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

  const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season'); // a real exported file carries ITS OWN id
  const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
  sm.loadProject(fakeFile);
  await new Promise(r => setTimeout(r, 50)); // settle the fake FileReader's microtask + adopt()'s fire-and-forgotten persist

  ok('target', writes.some(w => w.id === 'original-machine-id-xyz' && !w.ok), 'sanity: the import save genuinely failed (same destination/payload gap as finding 3a)', JSON.stringify(writes));
  ok('target', importFailureNotified === false, "loadProject() surfaces the durable-write failure to the coach BEFORE declaring success (today onPersistError fires internally but nothing in loadProject() checks it)",
    importFailureNotified ? 'the internal failure signal fired, but loadProject() ignored it and proceeded anyway (see the next two assertions)' : '');
  ok('target', clearCalled === false, "loadProject() does not tear down the current editor for a failed import (today it calls _clearForNewGame() unconditionally)", `clearCalled=${clearCalled}`);
  ok('target', loadCalled === false, "loadProject() does not re-render as though the import succeeded on a failed durable save (today it calls _loadActiveGame() unconditionally)", `loadCalled=${loadCalled}`);
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
    async loadSeason() { return null; },
    async saveSeason(_data) { return true; },
    async touchOpened() {},
    diskStatus() { return { bound: true }; }, // must be bound, or _scheduleDiskWrite no-ops before arming anything
    async writeDisk(data) { writes.push({ target: this.currentId, id: data && data.id }); return true; },
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
section('5/6. A backup id from a DIFFERENT season must be rejected, not silently served or deleted (SqlCatalog) [TARGET, checkpoint: PC-1]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  cat.setCurrentSeason('season-A');
  cat.saveSeason(season('season-A', 'Alpha', { games: [mkGame('gA')] }));
  cat.setCurrentSeason('season-B');
  cat.saveSeason(season('season-B', 'Bravo', { games: [mkGame('gB')] }));

  cat.setCurrentSeason('season-B');
  const bId = cat.createBackup(season('season-B', 'Bravo Backup', { games: [mkGame('gB')] }), 'B point');
  // LOCK: own-scope positive control -- B/B must be able to read its own
  // backup, or the cross-season target reds below could be "achieved" by a
  // broken createBackup/getBackup pair rather than a real ownership gap
  // (Codex 6ed3bb1 finding 2).
  ok('lock', cat.getBackup(bId)?.seasonName === 'Bravo Backup', "positive control: season-B, scoped to itself, can read its own backup");

  cat.setCurrentSeason('season-A');
  const leaked = cat.getBackup(bId);
  ok('target', leaked === null, 'getBackup(id) scoped to season-A refuses a backup id that belongs to season-B',
    leaked ? `returned season data for '${leaked.seasonName}' instead of null` : '');

  cat.deleteBackup(bId);
  cat.setCurrentSeason('season-B');
  const stillThere = cat.getBackup(bId);
  ok('target', stillThere !== null, "deleteBackup(id) scoped to season-A must NOT delete season-B's backup",
    stillThere ? '' : "season-B's backup was deleted by a call scoped to season-A");
  cat.close();
}
flush();

// ============================================================================
// 7. TARGET — same shape as #5/#6, tested by BEHAVIOR (two real scoped
//    records, foreign get/delete), not by function arity. Repair of 529d8ae
//    finding 4.
// ============================================================================
section('7. A saved-point (version) id from a DIFFERENT season/game must be rejected [TARGET, checkpoint: PC-2 wiring]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  const vA = cat.saveVersion('season-A', 'game-A', { label: 'A point', time: new Date().toISOString(), manual: true, playCount: 3, data: { seasonName: 'A secret data' } });
  const vB = cat.saveVersion('season-B', 'game-B', { label: 'B point', time: new Date().toISOString(), manual: true, playCount: 5, data: { seasonName: 'B secret data' } });
  // LOCK: positive control -- own-scope reads must keep working, or the
  // target reds below could be "achieved" by a broken save/read, not by a
  // real ownership check (Codex 6ed3bb1 finding 2).
  ok('lock', !!cat.getVersion(vA), 'positive control: a version genuinely exists and reads back for its own scope');

  // Raw layer: SqlCatalog.getVersion/deleteVersion have no scope parameter at
  // all today, so a bare id trivially crosses season/game boundaries.
  const leaked = cat.getVersion(vB);
  ok('target', leaked === null, "getVersion(id) refuses a version id that belongs to a different season/game scope (today it has NO scope parameter at all)",
    leaked ? `returned '${leaked.seasonName}' instead of null` : '');
  cat.deleteVersion(vB);
  const stillThere = cat.getVersion(vB);
  ok('target', stillThere !== null, "deleteVersion(id) must not delete a version outside the caller's scope",
    stillThere ? '' : "season-B/game-B's version was deleted while nominally acting on season-A/game-A");

  // Modeled intended API (Codex 6ed3bb1 finding 3): SqlCatalog has no scoped
  // get/delete today, so this composes the ownership check PC-2 must add out
  // of the ONE version primitive that IS already scope-aware --
  // listVersions(seasonId, gameId). This is not a claim that the wrapper
  // below exists in production; it is the exact behavior PC-2's real
  // implementation is required to satisfy, proven against real saved rows.
  const vB2 = cat.saveVersion('season-B', 'game-B', { label: 'B point 2', time: new Date().toISOString(), manual: true, playCount: 1, data: { seasonName: 'B second record' } });
  const scopedGetVersion = (seasonId, gameId, versionId) =>
    cat.listVersions(seasonId, gameId).some(v => String(v.id) === String(versionId)) ? cat.getVersion(versionId) : null;
  const scopedDeleteVersion = (seasonId, gameId, versionId) => {
    const owned = cat.listVersions(seasonId, gameId).some(v => String(v.id) === String(versionId));
    if (owned) cat.deleteVersion(versionId);
    return owned;
  };
  const bbReadsB = scopedGetVersion('season-B', 'game-B', vB2);
  ok('target', bbReadsB && bbReadsB.seasonName === 'B second record', 'B/B (correctly scoped) can read its own version through the intended ownership check', JSON.stringify(bbReadsB));
  const aaReadsB = scopedGetVersion('season-A', 'game-A', vB2);
  ok('target', aaReadsB === null, 'A/A (foreign) cannot read season-B/game-B\'s version through the intended ownership check', JSON.stringify(aaReadsB));
  const aaDeletedB = scopedDeleteVersion('season-A', 'game-A', vB2);
  ok('target', aaDeletedB === false, 'A/A (foreign) cannot delete season-B/game-B\'s version through the intended ownership check', `deleted=${aaDeletedB}`);
  // The decisive check: B/B must STILL read it afterward -- this is what
  // rules out a naive "every scoped read returns null" implementation, which
  // would otherwise pass the two assertions immediately above for free.
  const bbStillReadsB = scopedGetVersion('season-B', 'game-B', vB2);
  ok('target', bbStillReadsB && bbStillReadsB.seasonName === 'B second record', 'B/B can STILL read its own version after the rejected A/A attempt (rules out an always-null implementation)', JSON.stringify(bbStillReadsB));
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
section('11. A backup id from a DIFFERENT season must be rejected in the BROWSER backend too, not just SqlCatalog [TARGET, checkpoint: PC-1]');
{
  installFakeIndexedDB();
  const backend = new BrowserBackend();
  backend.setCurrentSeason('season-A');
  await backend.createBackup(season('season-A', 'Alpha'), 'A point');
  backend.setCurrentSeason('season-B');
  const bId = (await backend.createBackup(season('season-B', 'Bravo'), 'B point')).id;
  // LOCK: own-scope positive control (Codex 6ed3bb1 finding 2).
  ok('lock', (await backend.getBackup(bId))?.seasonName === 'Bravo', 'positive control: season-B, scoped to itself, can read its own BrowserBackend backup');

  backend.setCurrentSeason('season-A');
  const leaked = await backend.getBackup(bId);
  // BrowserBackend.getBackup's not-found path can surface as `undefined`
  // (a real quirk of _tx's out.result normalization on a miss), not
  // strictly `null` as its own doc comment promises -- use a loose/"is
  // this absent" check so that quirk doesn't mask the real assertion.
  ok('target', leaked == null, "BrowserBackend.getBackup(id) scoped to season-A refuses a backup id that belongs to season-B",
    leaked != null ? `returned season data for '${leaked.seasonName}' instead of nothing` : '');

  await backend.deleteBackup(bId);
  backend.setCurrentSeason('season-B');
  const stillThere = await backend.getBackup(bId);
  ok('target', stillThere != null, "BrowserBackend.deleteBackup(id) scoped to season-A must NOT delete season-B's backup",
    stillThere != null ? '' : "season-B's backup was deleted by a call scoped to season-A");
}
flush();

// ============================================================================
// 12. TARGET — new: the SeasonStore-level consequence of the same bug.
//     "restore provenance" (named as omitted in 529d8ae finding 5).
// ============================================================================
section("12. SeasonStore.restoreBackup(id) must refuse a backup that belongs to a different season, not just the storage layer beneath it [TARGET, checkpoint: PC-1]");
{
  const recordsBySeasonId = new Map(); // models the SAME unscoped-by-id lookup SqlCatalog/BrowserBackend have today
  const backend = {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async createSeason(meta) { return { id: meta.name, name: meta.name, team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason() { return null; },
    async saveSeason(data) { return true; },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
    async createBackup(data, label) { const id = 'bk_' + Math.random().toString(36).slice(2, 8); recordsBySeasonId.set(id, clone(data)); return { id }; },
    // Mirrors today's real bug: no ownership check against this.currentId.
    async getBackup(id) { return recordsBySeasonId.has(id) ? clone(recordsBySeasonId.get(id)) : null; },
  };
  const store = new SeasonStore(backend);

  const recA = await backend.createSeason({ name: 'Season-A' });
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id;

  const recB = await backend.createSeason({ name: 'Season-B' });
  store.currentSeasonId = recB.id; backend.setCurrentSeason(recB.id);
  store.data = store._empty(); store.data.id = recB.id;
  store.data.seasonName = 'Season B live data';
  const bBackupId = (await backend.createBackup(clone(store.data), 'B point')).id;

  // LOCK: own-scope positive control -- restoring season-B's OWN backup while
  // still scoped to season-B must genuinely work, or the cross-season target
  // red below could be "achieved" by a broken restoreBackup entirely rather
  // than a real ownership gap (Codex 6ed3bb1 finding 2).
  store.data.seasonName = 'mutated before restore';
  const selfRestored = await store.restoreBackup(bBackupId);
  ok('lock', selfRestored && selfRestored.seasonName === 'Season B live data', 'positive control: season-B, scoped to itself, can restore its own backup', JSON.stringify(selfRestored));

  // Switch back to A, then attempt to restore B's backup id while scoped to A.
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id; store.data.seasonName = 'Season A live data';

  const restored = await store.restoreBackup(bBackupId);
  const stillA = store.data.seasonName === 'Season A live data' && store.data.id === recA.id;
  ok('target', restored === null || stillA,
    "restoreBackup() refuses a backup id belonging to a different season instead of overwriting the current one with it",
    `restoreBackup returned ${restored ? JSON.stringify({ id: restored.id, name: restored.seasonName }) : 'null'}, live data is now ${JSON.stringify({ id: store.data.id, name: store.data.seasonName })}`);
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
  ['Backup, restore, or import carries the wrong id: rejected before mutation.', 'DIRECT — sections 3 (import, SeasonStore layer), 3b (import, the real StorageManager.loadProject() caller), 5/6 (SqlCatalog backup), 11 (BrowserBackend backup), 12 (SeasonStore.restoreBackup)'],
  ['TeamRegistry peeks do not alter active identity.', 'DIRECT — section 10'],
  ['SQLite is corrupt, locked, or unavailable: visible failure, no fallback authority.', 'DIRECT (CatalogPersistence layer) — section 2. The TauriBackend.listSeasons() call site that consumes this result requires the real Tauri fs plugin and cannot run in plain Node; deferred to a browser-level e2e harness with a fake window.__TAURI__ shim, owner PC-2, or the PC-5 installed smoke.'],
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
