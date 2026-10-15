/* Persistence isolation over synthetic catalog/browser backends.
 * Every assertion is a current contract and every failure exits nonzero. */
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SeasonStore } from '../js/season-store.js';
import { BrowserBackend } from '../js/storage-backend.js';
import { TeamRegistry } from '../js/team-registry.js';

let pass = 0, fail = 0;
const results = [];
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; results.push(`  PASS  ${label}`); }
  else { fail++; results.push(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`); }
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
  ok(wrote === false, 'saveSeason(destinationId, payloadWithDifferentId) returns false');
  ok(!fs.state.db, 'no db bytes were ever written on a destination/payload mismatch');
  ok(!fs.state.json.has('season-A') && !fs.state.json.has('season-B'), 'no season.json was written for either id');
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
  ok((await cp1.listSeasons()).some(s => s.id === 'real-season'), 'positive control: the season is genuinely saved before corruption is introduced');

  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // simulates on-disk corruption / a torn write

  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  let threw = false, result = null;
  try { result = await cp2.reconcileFallbacks(); }
  catch (e) { threw = true; }
  ok(threw, 'a corrupt on-disk catalog surfaces a VISIBLE failure (throws) instead of silently opening empty',
    threw ? '' : `reconcileFallbacks() returned ${JSON.stringify(result)} with no exception`);
  // PC-2: season.json is retired as a live authority, so the real season's
  // recoverable evidence now lives ONLY in the Documents-mirror recovery
  // snapshot (never in an app-data season.json fallback that no longer
  // exists). The decisive claim is unchanged in spirit -- the real season is
  // never reported as absent while an intact recovery copy of it exists --
  // just retargeted to the surviving sidecar.
  ok(fs.state.mirror.has('real-season') && threw,
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
  ok(fsA.state.json.has(recA.id), 'the imported season is durably saved under the destination library id',
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
  ok(awaitable, "adopt() returns an awaitable result so a caller can observe durable success/failure",
    awaitable ? '' : `adopt() returned a plain, non-awaitable value (typeof ${typeof result})`);
  if (awaitable) {
    const outcome = await result;
    ok(outcome === false || (outcome && outcome.ok === false),
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

  ok(failing.writes.some(w => w.idMatches && !w.ok),
    'sanity: the import save was attempted under the CORRECT destination id (proving isolation from 3a) and still failed for an external reason',
    JSON.stringify(failing.writes));
  ok(deepEq(failing.store.data, failing.priorSnapshot),
    'a rejected import leaves the live in-memory store byte-identical to before the attempt (reproduced before this fix: live season name changed to the rejected payload\'s)',
    `live data is now ${JSON.stringify(failing.store.data)}`);
  ok(failing.timersArmed === 0,
    'a rejected import never arms the debounced disk/Documents-mirror write timer',
    `armed=${failing.timersArmed}`);
  ok(failing.diskWrites.length === 0,
    'a rejected import performs zero sidecar/mirror writes even after the debounce window has fully elapsed (reproduced before this fix: one mirror write containing the rejected payload)',
    JSON.stringify(failing.diskWrites));
  ok(failing.clearCalled === false, 'loadProject() does not tear down the current editor for a failed import', `clearCalled=${failing.clearCalled}`);
  ok(failing.loadCalled === false, 'loadProject() does not re-render as though the import succeeded on a failed durable save', `loadCalled=${failing.loadCalled}`);
  ok(failing.toasts.some(t => /import failed/i.test(t.msg)), 'loadProject() surfaces the durable-write failure to the coach with a visible toast',
    JSON.stringify(failing.toasts));

  // Case B: the SUCCESSFUL control -- same caller, same shape of file, but
  // the durable write genuinely succeeds. Proves the failure guards above are
  // not simply refusing every import unconditionally, AND that the timer/
  // mirror mechanism genuinely fires and writes when the save is legitimate
  // (so the "zero writes" result above isn't vacuously true because nothing
  // in this fixture can ever write at all).
  const succeeding = await runImport(() => true, 'Imported Season 2');

  ok(succeeding.clearCalled === true && succeeding.loadCalled === true,
    'loadProject() proceeds to load the imported season once the durable write genuinely succeeds',
    `clearCalled=${succeeding.clearCalled} loadCalled=${succeeding.loadCalled}`);
  ok(succeeding.timersArmed === 1,
    'a SUCCESSFUL import arms exactly one debounced disk/Documents-mirror write', `armed=${succeeding.timersArmed}`);
  ok(succeeding.diskWrites.length === 1 && succeeding.diskWrites[0].id === 'lib-imported',
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
  ok(!store.hasCurrent(), 'sanity: no season is open before the first-run import (hasCurrent() is false)');
  sm.seasonStore = store;

  let clearCalled = false, loadCalled = false;
  sm._clearForNewGame = () => { clearCalled = true; };
  sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

  const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
  const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
  sm.loadProject(fakeFile);
  await new Promise(r => setTimeout(r, 50));

  ok(seasons.size === 0,
    'the destination season created solely for this failed import is rolled back (deleted), not left as an orphaned empty library entry',
    `seasons remaining: ${JSON.stringify([...seasons.keys()])}`);
  ok(!store.hasCurrent(), 'the store returns to its pre-import state: no season open', `currentSeasonId=${store.currentSeasonId}`);
  ok(clearCalled === false && loadCalled === false, 'loadProject() never proceeds to load a season that was never durably saved', `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
  ok(toasts.some(t => /import failed/i.test(t.msg)), 'the coach still sees the failure toast', JSON.stringify(toasts));
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
    ok(store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely switched to season B while A's import save was still pending",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, dataId: store.data && store.data.id }));

    resolveSave(false);   // the pending import into A now resolves as a rejected durable write
    const result = await adoptPromise;

    ok(result && result.ok === false, "the stale import into A still reports its own genuine failure",
      JSON.stringify(result && { ok: result.ok }));
    ok(store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
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
    ok(!store.hasCurrent(), 'sanity: no season is open before the first-run import (hasCurrent() is false)');
    sm.seasonStore = store;

    let clearCalled = false, loadCalled = false;
    sm._clearForNewGame = () => { clearCalled = true; };
    sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

    const importedSeasonJson = season('original-machine-id-xyz', 'Imported Season');
    const fakeFile = { name: 'imported.json', __text: JSON.stringify(importedSeasonJson) };
    sm.loadProject(fakeFile);   // creates scaffold S, begins adopt(), blocks on savePromise
    await new Promise(r => setTimeout(r, 20));   // let the FileReader microtask + createSeason() settle

    ok(seasons.has('lib-fresh-scaffold'),
      'sanity: the orphaned scaffold season genuinely exists before the coach switches away');

    // The coach opens season B WHILE the scaffold's import save is still pending.
    await store.openSeason('B');
    ok(store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely opened season B while the scaffold's import save was still pending");

    resolveSave(false);   // the pending scaffold import now resolves as a rejected durable write
    await new Promise(r => setTimeout(r, 20));

    ok(deletedIds.length === 1 && deletedIds[0] === 'lib-fresh-scaffold',
      "the rollback deletes exactly the captured scaffold id, never the season the coach opened meanwhile (reproduced before this fix: re-reading currentSeasonId after the await would have named 'B')",
      JSON.stringify(deletedIds));
    ok(store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      'the store still shows season B untouched -- the failed scaffold import never cleared, reloaded, or replaced it',
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok(clearCalled === false && loadCalled === false,
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

  ok(okDb === false, 'a rejected canonical (db) write reports failure', String(okDb));
  ok(!fs.state.json.has('s1'),
    'a rejected canonical write performs ZERO writes to season.json (reproduced before this fix: the rejected payload was written to the json fallback unconditionally)',
    JSON.stringify([...fs.state.json.keys()]));
  ok(!fs.state.mirror.has('s1'),
    'a rejected canonical write performs ZERO writes to the Documents mirror',
    JSON.stringify([...fs.state.mirror.keys()]));

  // The in-memory catalog must not diverge from disk either -- a same-session
  // load on the SAME cp instance must not read the rejected payload straight
  // back out of memory, even though nothing was ever written to disk.
  fs.state.writeDbFail = false;
  const reload = await cp.loadSeason('s1');
  ok(reload === null,
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
  ok(okDb2 === true && !fs2.state.json.has('s2') && fs2.state.mirror.has('s2'),
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
    ok(!store.hasCurrent(), 'sanity: no season is open before the first-run import begins');
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
    ok(store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely opened season B while the scaffold's own durable creation was still pending");

    resolveCreate();   // the scaffold's durable creation now resolves
    await new Promise(r => setTimeout(r, 20));

    ok(store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      "the store still shows season B untouched -- the scaffold's own durable creation, resolving AFTER the coach switched away, never clobbered it (reproduced before this fix: createSeason()'s unconditional switch would have overwritten currentSeasonId/data with the blank scaffold the instant this resolved)",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok(seasons.has('lib-fresh-scaffold') === false && deletedIds.length === 1 && deletedIds[0] === 'lib-fresh-scaffold',
      'the never-claimed scaffold is durably deleted rather than left as an orphaned library entry',
      JSON.stringify({ stillExists: seasons.has('lib-fresh-scaffold'), deletedIds }));
    ok(clearCalled === false && loadCalled === false,
      'the stale first-run import never re-renders the editor', `clearCalled=${clearCalled} loadCalled=${loadCalled}`);
    ok(toasts.some(t => /import failed/i.test(t.msg)), 'the coach sees the failure toast', JSON.stringify(toasts));
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
    ok(store.currentSeasonId === 'B' && store.data.id === 'B',
      "sanity: the coach genuinely switched to season B while the stale import into A was still pending");

    resolveSave(true);   // the STALE import into A now succeeds durably (its own destination, not B)
    await new Promise(r => setTimeout(r, 20));

    ok(store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && store.data.seasonName === 'Season B',
      "the store still shows season B, byte-identical -- the stale successful import into A never touched it",
      JSON.stringify({ currentSeasonId: store.currentSeasonId, data: store.data && { id: store.data.id, seasonName: store.data.seasonName } }));
    ok(clearCalled === false && loadCalled === false,
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
  ok(!store.hasCurrent(), 'sanity: no season is open before the first-run import begins');
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

  ok(saveCalls.length === 1,
    'first-run import performs exactly ONE canonical (backend.saveSeason) write -- no separate unawaited scaffold-body save races against it (reproduced before this fix: two calls, the second an unawaited blank-scaffold persist with nothing ordering it against the real import write)',
    JSON.stringify(saveCalls.map(c => ({ seasonId: c.seasonId, gameIds: (c.data.games || []).map(g => g.id) }))));
  ok(!!(saveCalls[0] && saveCalls[0].data.games && saveCalls[0].data.games[0] && saveCalls[0].data.games[0].id === 'g1'),
    "that one write contains the imported payload (game id 'g1'), never a blank scaffold shape",
    JSON.stringify(saveCalls[0] && (saveCalls[0].data.games || []).map(g => g.id)));
  ok(clearCalled === true && loadCalled === true, 'the successful first-run import still reloads the editor normally, exactly as before this fix');
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
  ok(typeof capturedOnA === 'function', 'a real disk-write callback was armed via the real setTimeout call');
  capturedOnA();
  ok(writes.length === 1 && writes[0].target === recA.id,
    "firing the real callback while still on season A performs exactly one write, to season A's slot",
    JSON.stringify(writes));

  // NEGATIVE case: arm again, switch seasons, THEN fire the SAME real callback.
  writes.length = 0;
  const capturedBeforeSwitch = arm();
  const recB = await backend.createSeason({ name: 'Season-B' });
  store.currentSeasonId = recB.id; backend.setCurrentSeason(recB.id);
  store.data = store._empty(); store.data.id = recB.id;
  capturedBeforeSwitch(); // the exact callback armed for season A, fired after the switch to B
  ok(writes.length === 0,
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
  ok(cat.getBackup('season-B', bId)?.seasonName === 'Bravo Backup', "positive control: season-B, scoped to itself, can read its own backup");

  // PC-1: an explicit seasonId argument -- not this.currentId -- is what
  // determines scope now. Deliberately point the ambient pointer at the
  // WRONG season (season-A) while still passing 'season-A' explicitly, so
  // this proves the explicit id is what refuses the read, not a coincidence
  // of whatever the ambient pointer happened to hold.
  cat.setCurrentSeason('WRONG-AMBIENT-SEASON');
  const leaked = cat.getBackup('season-A', bId);
  ok(leaked === null, 'getBackup(seasonId, id) scoped to season-A refuses a backup id that belongs to season-B, regardless of the ambient pointer',
    leaked ? `returned season data for '${leaked.seasonName}' instead of null` : '');

  cat.deleteBackup('season-A', bId);
  const stillThere = cat.getBackup('season-B', bId);
  ok(stillThere !== null, "deleteBackup(seasonId, id) scoped to season-A must NOT delete season-B's backup",
    stillThere ? '' : "season-B's backup was deleted by a call scoped to season-A");
  cat.close();
}
flush();

// ============================================================================
// 7. TARGET — same shape as #5/#6, tested by BEHAVIOR (two real scoped
//    records, foreign get/delete), not by function arity. Repair of 529d8ae
//    finding 4.
// ============================================================================
section('7. Version ownership: only the scoped seam exists [LOCK]');
{
  const cat = new SqlCatalog(SQL);
  await cat.open();
  const vA = cat.saveVersion('season-A', 'game-A', { label: 'A point', time: new Date().toISOString(), manual: true, playCount: 3, data: { seasonName: 'A secret data' } });
  const vB = cat.saveVersion('season-B', 'game-B', { label: 'B point', time: new Date().toISOString(), manual: true, playCount: 5, data: { seasonName: 'B secret data' } });
  // LOCK: positive control -- own-scope reads must keep working, or the
  // target reds below could be "achieved" by a broken save/read, not by a
  // real ownership check (Codex 6ed3bb1 finding 2).
  ok(!!cat.getVersionScoped('season-A', 'game-A', vA), 'positive control: a version genuinely exists and reads back for its own scope');
  // The unscoped getVersion(id)/deleteVersion(id) were deleted (2026-10-04):
  // no production caller, and they crossed season/game scope.
  ok(typeof cat.getVersion !== 'function' && typeof cat.deleteVersion !== 'function', 'no unscoped version read or delete exists on SqlCatalog');

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
  ok(r.available && !r.threw && r.result && r.result.seasonName === 'B second record',
    'B/B (correctly scoped) can read its own version through the production getVersionScoped seam',
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));

  r = { name: 'getVersionScoped', ...callScoped('getVersionScoped', 'season-A', 'game-A', vB2) };
  ok(r.available && !r.threw && r.result === null,
    "A/A (foreign) cannot read season-B/game-B's version through the production getVersionScoped seam",
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));

  r = { name: 'deleteVersionScoped', ...callScoped('deleteVersionScoped', 'season-A', 'game-A', vB2) };
  ok(r.available && !r.threw && r.result === false,
    "A/A (foreign) cannot delete season-B/game-B's version through the production deleteVersionScoped seam",
    r.available ? (r.threw ? r.message : `deleted=${r.result}`) : unavailable(r));

  // The decisive check: B/B must STILL read it afterward through the SAME
  // production seam -- rules out a naive "every scoped read returns null"
  // implementation, which would otherwise satisfy the two checks above for free.
  r = { name: 'getVersionScoped', ...callScoped('getVersionScoped', 'season-B', 'game-B', vB2) };
  ok(r.available && !r.threw && r.result && r.result.seasonName === 'B second record',
    'B/B can STILL read its own version through getVersionScoped after the rejected A/A attempt (rules out an always-null implementation)',
    r.available ? (r.threw ? r.message : JSON.stringify(r.result)) : unavailable(r));
  cat.close();
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
  ok(loaded.source === 'db', 'a normal load prefers the healthy catalog over a disagreeing json sidecar', `source=${loaded.source}`);
  ok(loaded.data.seasonName === 'Current, correct name', 'the stale sidecar\'s content is ignored, not merged or preferred', `seasonName='${loaded.data.seasonName}'`);
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

  ok(registry.teams().length === 0 && !registry.hasTeam(), 'sanity: localStorage identity is genuinely wiped before recovery runs');
  const beforeSeasonStoreId = store.currentSeasonId;
  const beforeBackendId = store.backend.currentId;
  const recovered = await registry.recoverFromWipe();
  ok(recovered === true, 'recovery succeeds against seasons that still exist on disk', `recovered=${recovered}`);
  ok(openSeasonCalls.length === 0, 'recoverFromWipe() never calls the real SeasonStore.openSeason (would mutate active identity)', JSON.stringify(openSeasonCalls));
  ok(setCurrentSeasonCalls.length === 0, 'recoverFromWipe() never calls backend.setCurrentSeason directly', JSON.stringify(setCurrentSeasonCalls));
  // The decisive check Codex named: not "was a suspicious method avoided" but
  // "is the real identity byte-for-byte the same afterward."
  ok(store.currentSeasonId === beforeSeasonStoreId, 'SeasonStore.currentSeasonId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeSeasonStoreId}', after='${store.currentSeasonId}'`);
  ok(store.backend.currentId === beforeBackendId, 'StorageBackend.currentId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeBackendId}', after='${store.backend.currentId}'`);
  ok(registry.hasTeam() && registry.teamProfile().teamName === 'Mavericks', 'identity is genuinely rebuilt from the peeked season data', JSON.stringify(registry.teamProfile()));
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
  ok((await backend.getBackup('season-B', bId))?.seasonName === 'Bravo', 'positive control: season-B, scoped to itself, can read its own BrowserBackend backup');

  // PC-1: an incorrect ambient this.currentId ('WRONG-AMBIENT-SEASON', neither
  // season-A nor season-B) must not be able to redirect the read -- only the
  // explicit seasonId argument decides scope.
  backend.currentId = 'WRONG-AMBIENT-SEASON';
  const leaked = await backend.getBackup('season-A', bId);
  // BrowserBackend.getBackup's not-found path can surface as `undefined`
  // (a real quirk of _tx's out.result normalization on a miss), not
  // strictly `null` as its own doc comment promises -- use a loose/"is
  // this absent" check so that quirk doesn't mask the real assertion.
  ok(leaked == null, "BrowserBackend.getBackup(seasonId, id) scoped to season-A refuses a backup id that belongs to season-B, regardless of the ambient pointer",
    leaked != null ? `returned season data for '${leaked.seasonName}' instead of nothing` : '');

  await backend.deleteBackup('season-A', bId);
  const stillThere = await backend.getBackup('season-B', bId);
  ok(stillThere != null, "BrowserBackend.deleteBackup(seasonId, id) scoped to season-A must NOT delete season-B's backup",
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
  ok(selfRestored && selfRestored.seasonName === 'Season B live data', 'positive control: season-B, scoped to itself, can restore its own backup', JSON.stringify(selfRestored));

  // Switch back to A, then attempt to restore B's backup id while scoped to A.
  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id; store.data.seasonName = 'Season A live data';

  const restored = await store.restoreBackup(bBackupId);
  const stillA = store.data.seasonName === 'Season A live data' && store.data.id === recA.id;
  ok(restored === null && stillA,
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
    ok(!!sm.autoSaveTimer, 'sanity: a debounced autosave is genuinely armed before the restore');

    await sm.restoreBackup('bk1');
    ok(!sm.autoSaveTimer,
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
    ok(idleFlush === true && saves.length === 0,
      'flushing with nothing armed is an honest no-op, not a spurious write',
      JSON.stringify({ idleFlush, saves: saves.length }));

    sm._autoSave();
    // PC-4 repair (finding 3): flushPendingSaves() now returns the real
    // promise chain instead of a synchronous `true` the instant the write
    // starts, so a genuine close hook can await it. Await it here too, rather
    // than a bare setTimeout(0) that only worked because the old code never
    // returned anything worth awaiting.
    const flushed = await sm.flushPendingSaves();
    ok(flushed === true && saves.length === 1 && !sm.autoSaveTimer,
      "a pending debounced save is flushed on shutdown instead of dying with the window -- before PC-4 nothing anywhere flushed on exit, so a coach closing within ~1s of their last edit lost that edit's canonical write entirely (Inventory Sec 3.4)",
      JSON.stringify({ flushed, saves: saves.length, stillArmed: !!sm.autoSaveTimer }));
  }

  // -- (iii) the injected, season-owned roster is authoritative even when
  // empty. The cached playbook keeps its separate empty-cache protection.
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

    sm.deps = { roster: { toJSON: () => [] }, playbook: { snapshot: () => ({ version: 1, calls: [] }) } };
    sm.commitActive();

    ok(store.data.roster.length === 0,
      'an intentionally empty season-owned roster replaces the prior roster rather than retaining another season\'s players',
      JSON.stringify({ roster: store.data.roster }));
    ok(store.data.playbook.calls.length === 1 && store.data.playbook.calls[0].name === '26 Blast',
      'an empty cached playbook does not overwrite the season\'s populated playbook',
      JSON.stringify({ roster: store.data.roster.length, calls: store.data.playbook.calls.length }));

    const liveRoster = [{ num: '7', name: 'Ellis' }, { num: '9', name: 'Ward' }];
    sm.deps = { roster: { toJSON: () => liveRoster }, playbook: { snapshot: () => ({ version: 1, calls: [{ id: 'c1' }, { id: 'c2' }] }) } };
    sm.commitActive();
    ok(store.data.roster.length === 2 && store.data.playbook.calls.length === 2,
      'positive control: populated injected roster and playbook both mirror into the season',
      JSON.stringify({ roster: store.data.roster.length, calls: store.data.playbook.calls.length }));
    liveRoster[0].name = 'Changed after commit';
    ok(store.data.roster[0].name === 'Ellis',
      'committed roster players do not alias the service\'s mutable objects');
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
//     discipline. Full detail: docs/archive/plans/GRIDIRON-IQ-PERSISTENCE-INVENTORY.md.
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

    ok(canonicalWrites.length === 2 &&
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

    ok(callOrder.indexOf('save-done') < callOrder.indexOf('delete-done'),
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

    ok(result === false && diskWrites.length === 0 && backupWrites.length === 0,
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

    ok(diskWrites.length === 1 && diskWrites[0].id === 'A' && diskWrites[0].seasonName === 'Season A' &&
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
      ok(!threw, '_wireDesktopCloseFlush() is a safe no-op on the browser build (no window.__TAURI__)');
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
        ok(typeof capturedHandler === 'function',
          '_wireDesktopCloseFlush() registers a real onCloseRequested handler when window.__TAURI__ is present');

        sm._autoSave();   // arm a pending debounced save, as a real coach edit would
        let preventDefaultCalled = false;
        capturedHandler({ preventDefault() { preventDefaultCalled = true; } });
        await closePromise;   // the detached async flush+close must eventually settle

        ok(preventDefaultCalled && saves.length === 1 && closeCalled,
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
//     discipline. Full detail: docs/archive/plans/GRIDIRON-IQ-PERSISTENCE-INVENTORY.md.
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

    ok(!store2.has('A'),
      "a save dispatched while delete is already in flight does not resurrect the season -- reproduced before this fix as delete completing durably, then the later persist still landing and recreating it (Codex's exact reproduction: {case:\"save-after-delete-start\",exists:true})",
      JSON.stringify({ case: 'save-after-delete-start', exists: store2.has('A') }));

    ok((await persistPromise) === false,
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

      ok(saveStillPendingAtSecondCall,
        'sanity: the underlying write is genuinely still pending when the second caller runs',
        JSON.stringify({ saveStillPendingAtSecondCall }));
      ok(r1 === true && r2 === true,
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
      ok(r1 === false && r2 === false,
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

    ok(!destroyed,
      "the window is NOT destroyed after the final save reports failure -- reproduced before this fix as destroyed:true regardless of the flush result (Codex's exact reproduction: {case:\"failed-flush-close\",destroyed:true})",
      JSON.stringify({ case: 'failed-flush-close', destroyed }));
    ok(errorSurfaced,
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

    ok(!settledOnAAlone,
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

      ok(!destroyedOnAAlone,
        'the window is not destroyed merely because A (the write present when close began) succeeded, while B (dispatched mid-close) is still unresolved',
        JSON.stringify({ destroyedOnAAlone }));
      ok(!destroyed && errorSurfaced,
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

    ok(!settledOnAAlone,
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

    ok(!settledOnAAloneBeforeTimerFires && timerWriteDispatched,
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

    ok(directCalls === 0 && result && result.id === 'bk-internal',
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

    ok(result === null && directCalls === 0,
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

    ok(restored === null && store.data === live,
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

    ok(directCalls === 0,
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

console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit((fail > 0 || crashed) ? 1 : 0);
