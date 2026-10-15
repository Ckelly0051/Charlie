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

function backendFor(overrides) {
  return {
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async loadSeason() { return null; },
    async touchOpened() {},
    ...overrides,
  };
}

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
            // Completion must run on the same transaction object the caller receives.
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

section("Import durability");
{
  const fsA = makeFs();
  const backendA = backendFor({
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(seasonId) { return fsA.state.json.get(seasonId) || null; },
    async saveSeason(seasonId, data) {
      if (!data || (data.id && String(data.id) !== String(seasonId))) return false;
      fsA.state.json.set(seasonId, clone(data));
      return true;
    },
    diskStatus() { return { bound: false }; }
  });
  const storeA = new SeasonStore(backendA);
  const recA = await backendA.createSeason({ name: 'Imported Season' });
  storeA.currentSeasonId = recA.id; backendA.setCurrentSeason(recA.id);
  storeA.data = storeA._empty(); storeA.data.id = recA.id;
  const importedFile = season('original-machine-id-xyz', 'Imported Season'); // a real exported season.json carries ITS OWN id
  storeA.adopt(importedFile);
  await new Promise(r => setTimeout(r, 0)); // let any fire-and-forgotten persist() settle
  ok(fsA.state.json.has(recA.id), 'the imported season is durably saved under the destination library id',
    fsA.state.json.has(recA.id) ? '' : `nothing was written under '${recA.id}'; adopt() left data.id='${storeA.data.id}', destination was '${recA.id}'`);

  const fsB = makeFs();
  const backendB = backendFor({
    async createSeason(meta) { return { id: 'lib-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return false; },
    diskStatus() { return { bound: false }; }
  });
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

section("Import rollback and editor ownership");
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
    const backend = backendFor({
      async createSeason(meta) { return { id: 'lib-imported', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
      async saveSeason(seasonId, data) {
        const idMatches = !!(data && data.id === seasonId);
        const ok = saveSeasonImpl(idMatches);
        writes.push({ id: data && data.id, idMatches, ok });
        return ok;
      },
      diskStatus() { return { bound: true }; },
      async writeDisk(seasonId, data, opts) { diskWrites.push({ seasonId, id: data && data.id, snapshot: !!(opts && opts.snapshot) }); return true; },
      async createBackup() { return null; }
    });
    const store = new SeasonStore(backend);
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

section("Failed first-run import cleanup");
{
  const { StorageManager } = await import('../js/storage.js');   // globals from section 3b already installed
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const toasts = [];
  const tagger = { ...noopEmitter, plays: [], toast(msg, dur) { toasts.push({ msg, dur }); } };
  const canvas = { ...noopEmitter, annotations: [] };
  const sm = new StorageManager(vc, tagger, canvas);

  const seasons = new Map();   // models the library: id -> meta
  const backend = backendFor({
    async createSeason(meta) {
      const rec = { id: 'lib-fresh-' + Math.random().toString(36).slice(2, 8), name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
      seasons.set(rec.id, rec);
      return rec;
    },
    async deleteSeason(id) { return seasons.delete(id); },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return false; },
    diskStatus() { return { bound: false }; }
  });
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

section("Season switches during import");
{
  {
    let resolveSave;
    const savePromise = new Promise(res => { resolveSave = res; });
    const backend = backendFor({
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },
      diskStatus() { return { bound: false }; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const importedFile = season('A', 'Imported'); // a real exported file, id already matches A (isolates this from 3a)
    const adoptPromise = store.adopt(importedFile);   // begins the import into A; blocks on savePromise

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
    const backend = backendFor({
      async createSeason(meta) {
        const rec = { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
        seasons.set(rec.id, rec);
        return rec;
      },
      async deleteSeason(id) { deletedIds.push(id); return seasons.delete(id); },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },
      diskStatus() { return { bound: false }; }
    });
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

section("Season switches during scaffold creation and successful import");
{
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
    const backend = backendFor({
      async createSeason(meta) {
        await createPromise;   // the scaffold's OWN durable creation stays pending
        const rec = { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 };
        seasons.set(rec.id, rec);
        return rec;
      },
      async deleteSeason(id) { deletedIds.push(id); return seasons.delete(id); },
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return true; },
      diskStatus() { return { bound: false }; }
    });
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
    const backend = backendFor({
      async loadSeason(seasonId) { return seasonId === 'B' ? season('B', 'Season B') : null; },
      async saveSeason() { return savePromise; },
      diskStatus() { return { bound: false }; }
    });
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

section("One canonical first-run import write");
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
  const backend = backendFor({
    async createSeason(meta) { return { id: 'lib-fresh-scaffold', name: meta.name || 'Untitled', team: '', year: '', level: '', games: 0, plays: 0 }; },
    async saveSeason(seasonId, data) { saveCalls.push({ seasonId, data: clone(data) }); return true; },
    diskStatus() { return { bound: false }; }
  });
  const store = new SeasonStore(backend);
  ok(!store.hasCurrent(), 'sanity: no season is open before the first-run import begins');
  sm.seasonStore = store;

  let clearCalled = false, loadCalled = false;
  sm._clearForNewGame = () => { clearCalled = true; };
  sm._loadActiveGame = () => { loadCalled = true; return Promise.resolve(); };

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

section("Delayed write ownership after a season switch");
{
  const writes = [];
  const backend = backendFor({
    async createSeason(meta) { return { id: meta.name, name: meta.name, team: '', year: '', level: '', games: 0, plays: 0 }; },
    async loadSeason(_seasonId) { return null; },
    async saveSeason(_seasonId, _data) { return true; },
    diskStatus() { return { bound: true }; },
    async writeDisk(seasonId, data) { writes.push({ target: seasonId, id: data && data.id }); return true; }
  });
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

  const capturedOnA = arm();
  ok(typeof capturedOnA === 'function', 'a real disk-write callback was armed via the real setTimeout call');
  capturedOnA();
  ok(writes.length === 1 && writes[0].target === recA.id,
    "firing the real callback while still on season A performs exactly one write, to season A's slot",
    JSON.stringify(writes));

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

section("Registry recovery preserves active identity");
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
  const backend = {
    currentId: 'already-active-season', RETENTION: 25,
    setCurrentSeason(id) { setCurrentSeasonCalls.push(id); this.currentId = id; },
    async listSeasons() { return fakeSeasons; },
    async peekSeason(id) { return fakeSeasonData[id] || null; },
  };
  const store = new SeasonStore(backend);
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
  ok(store.currentSeasonId === beforeSeasonStoreId, 'SeasonStore.currentSeasonId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeSeasonStoreId}', after='${store.currentSeasonId}'`);
  ok(store.backend.currentId === beforeBackendId, 'StorageBackend.currentId is byte-for-byte unchanged after recoverFromWipe()', `before='${beforeBackendId}', after='${store.backend.currentId}'`);
  ok(registry.hasTeam() && registry.teamProfile().teamName === 'Mavericks', 'identity is genuinely rebuilt from the peeked season data', JSON.stringify(registry.teamProfile()));
}
flush();

section("Browser backup ownership");
{
  installFakeIndexedDB();
  const backend = new BrowserBackend();
  await backend.createBackup('season-A', season('season-A', 'Alpha'), 'A point');
  const bId = (await backend.createBackup('season-B', season('season-B', 'Bravo'), 'B point')).id;
  ok((await backend.getBackup('season-B', bId))?.seasonName === 'Bravo', 'positive control: season-B, scoped to itself, can read its own BrowserBackend backup');

  backend.currentId = 'WRONG-AMBIENT-SEASON';
  const leaked = await backend.getBackup('season-A', bId);
  ok(leaked == null, "BrowserBackend.getBackup(seasonId, id) scoped to season-A refuses a backup id that belongs to season-B, regardless of the ambient pointer",
    leaked != null ? `returned season data for '${leaked.seasonName}' instead of nothing` : '');

  await backend.deleteBackup('season-A', bId);
  const stillThere = await backend.getBackup('season-B', bId);
  ok(stillThere != null, "BrowserBackend.deleteBackup(seasonId, id) scoped to season-A must NOT delete season-B's backup",
    stillThere != null ? '' : "season-B's backup was deleted by a call scoped to season-A");
}
flush();

section("Foreign backup refusal through SeasonStore");
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

  store.data.seasonName = 'mutated before restore';
  const selfRestored = await store.restoreBackup(bBackupId);
  ok(selfRestored && selfRestored.seasonName === 'Season B live data', 'positive control: season-B, scoped to itself, can restore its own backup', JSON.stringify(selfRestored));

  store.currentSeasonId = recA.id; backend.setCurrentSeason(recA.id);
  store.data = store._empty(); store.data.id = recA.id; store.data.seasonName = 'Season A live data';

  const restored = await store.restoreBackup(bBackupId);
  const stillA = store.data.seasonName === 'Season A live data' && store.data.id === recA.id;
  ok(restored === null && stillA,
    "restoreBackup() refuses a backup id belonging to a different season instead of overwriting the current one with it",
    `restoreBackup returned ${restored ? JSON.stringify({ id: restored.id, name: restored.seasonName }) : 'null'}, live data is now ${JSON.stringify({ id: store.data.id, name: store.data.seasonName })}`);
}
flush();

section("Restore cancellation, shutdown flush and injected identity");
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  const { StorageManager } = await import('../js/storage.js');
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const tagger = { ...noopEmitter, plays: [], toast() {} };
  const canvas = { ...noopEmitter, annotations: [] };

  {
    const sm = new StorageManager(vc, tagger, canvas);
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: false }; },
      async createBackup() { return 'bk1'; },
      async getBackup() { return season('A', 'Restored'); },
      async writeDisk() { return true; }
    });
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

  {
    const sm = new StorageManager(vc, tagger, canvas);
    const saves = [];
    const backend = backendFor({
      async saveSeason(id) { saves.push(id); return true; },
      diskStatus() { return { bound: false }; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;   // so commitActive's guard passes
    sm._serialize = () => ({ ...store.data.games[0] });

    const idleFlush = await sm.flushPendingSaves();
    ok(idleFlush === true && saves.length === 0,
      'flushing with nothing armed is an honest no-op, not a spurious write',
      JSON.stringify({ idleFlush, saves: saves.length }));

    sm._autoSave();
    const flushed = await sm.flushPendingSaves();
    ok(flushed === true && saves.length === 1 && !sm.autoSaveTimer,
      "a pending debounced save is flushed on shutdown instead of dying with the window -- before PC-4 nothing anywhere flushed on exit, so a coach closing within ~1s of their last edit lost that edit's canonical write entirely (Inventory Sec 3.4)",
      JSON.stringify({ flushed, saves: saves.length, stillArmed: !!sm.autoSaveTimer }));
  }

  {
    const sm = new StorageManager(vc, tagger, canvas);
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: false }; }
    });
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

section("Write ordering, deletion and captured payloads");
{
  const tick = () => new Promise(r => setTimeout(r, 0));

  {
    const canonicalWrites = [];
    let gate = null;
    const backend = backendFor({
      async saveSeason(id, data) {
        const snap = clone(data);
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => { canonicalWrites.push(snap); res(true); }; }); }
        canonicalWrites.push(snap); return true;
      },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data) { return this.saveSeason(id, data); },
      async createBackup() { return 'bk1'; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const held = { release: null };
    gate = held;
    const snapPromise = store.snapshot('Auto');
    await tick();

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

  {
    const callOrder = [];
    let gate = null;
    const backend = backendFor({
      async saveSeason() {
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => { callOrder.push('save-done'); res(true); }; }); }
        callOrder.push('save-done'); return true;
      },
      async deleteSeason() { callOrder.push('delete-done'); return true; },
      diskStatus() { return { bound: false }; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const held = { release: null };
    gate = held;
    const savePromise = store.persist();          // a save is in flight for A, gated
    await tick();

    const deletePromise = store.deleteSeason('A');

    held.release();                                // the stale pending save now lands
    await savePromise;
    await deletePromise;

    ok(callOrder.indexOf('save-done') < callOrder.indexOf('delete-done'),
      "a save already in flight for a season completes BEFORE its delete can run, never after -- reproduced before this fix as delete->save landing in that order, which resurrected a durably-deleted season",
      JSON.stringify({ callOrder }));
  }

  {
    const diskWrites = [];
    const backupWrites = [];
    const backend = backendFor({
      async saveSeason() { return false; },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data) { diskWrites.push({ id, plays: data.games[0].plays.length }); return true; },
      async createBackup(id, data) { backupWrites.push({ id, plays: data.games[0].plays.length }); return 'bk'; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const result = await store.saveNow('Manual save');

    ok(result === false && diskWrites.length === 0 && backupWrites.length === 0,
      "saveNow() performs zero disk/backup side effects when the canonical save is REJECTED -- reproduced before this fix as a disk write and a backup write still landing after a rejected canonical save",
      JSON.stringify({ result, diskWrites, backupWrites }));
  }

  {
    const diskWrites = [];
    const backupWrites = [];
    let gate = null;
    const backend = backendFor({
      async saveSeason() {
        if (gate) { const g = gate; gate = null; return new Promise(res => { g.release = () => res(true); }); }
        return true;
      },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data) { diskWrites.push({ id, seasonName: data.seasonName, plays: data.games[0].plays.length }); return true; },
      async createBackup(id, data) { backupWrites.push({ id, seasonName: data.seasonName, plays: data.games[0].plays.length }); return 'bk'; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A', { games: [{ ...mkGame('g1'), plays: [{ id: 1 }] }] });

    const held = { release: null };
    gate = held;
    const saveNowPromise = store.saveNow('Manual save');
    await tick();

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

  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    {
      const prevTauri = globalThis.window.__TAURI__;
      delete globalThis.window.__TAURI__;
      const sm = new StorageManager(vc, tagger, canvas);
      let threw = false;
      try { await sm._wireDesktopCloseFlush(); } catch (e) { threw = true; }
      globalThis.window.__TAURI__ = prevTauri;
      ok(!threw, '_wireDesktopCloseFlush() is a safe no-op on the browser build (no window.__TAURI__)');
    }

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
        const backend = backendFor({
          async saveSeason(id) { saves.push(id); return true; },
          diskStatus() { return { bound: false }; }
        });
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

section("Save-after-delete refusal and close failure");
{
  {
    const store2 = new Map();
    const backend = backendFor({
      async saveSeason(id, data) { store2.set(id, data); return true; },
      async deleteSeason(id) { store2.delete(id); return true; },
      diskStatus() { return { bound: false }; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    store2.set('A', store.data);

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

  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    {
      const sm = new StorageManager(vc, tagger, canvas);
      let release = null;
      const backend = backendFor({
        async saveSeason() { return new Promise(res => { release = () => res(true); }); },
        diskStatus() { return { bound: false }; }
      });
      const store = new SeasonStore(backend);
      store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
      store.data = season('A', 'Season A');
      sm.seasonStore = store;
      sm._loadedGameId = store.data.activeGameId;
      sm._serialize = () => ({ ...store.data.games[0] });

      sm._autoSave();
      const first = sm.flushPendingSaves();
      const saveStillPendingAtSecondCall = typeof release === 'function';
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

    {
      const sm = new StorageManager(vc, tagger, canvas);
      let release = null;
      const backend = backendFor({
        async saveSeason() { return new Promise(res => { release = () => res(false); }); },
        diskStatus() { return { bound: false }; }
      });
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

  {
    if (!globalThis.window) globalThis.window = globalThis;
    if (!globalThis.document) globalThis.document = { getElementById: () => null };
    const { StorageManager } = await import('../js/storage.js');
    const noopEmitter = { on() {}, off() {} };
    const vc = { ...noopEmitter, paused: true };
    const tagger = { ...noopEmitter, plays: [], toast() {} };
    const canvas = { ...noopEmitter, annotations: [] };

    const sm = new StorageManager(vc, tagger, canvas);
    const backend = backendFor({
      async saveSeason() { return false; },
      diskStatus() { return { bound: false }; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');
    sm.seasonStore = store;
    sm._loadedGameId = store.data.activeGameId;
    sm._serialize = () => ({ ...store.data.games[0] });
    let errorSurfaced = false;
    store.onPersistError = () => { errorSurfaced = true; };
    // Isolate the close hook's warning from the save owner's separate warning.
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

section("Stable-tail flushing with independently gated writes");
{
  if (!globalThis.window) globalThis.window = globalThis;
  if (!globalThis.document) globalThis.document = { getElementById: () => null };
  const { StorageManager } = await import('../js/storage.js');
  const noopEmitter = { on() {}, off() {} };
  const vc = { ...noopEmitter, paused: true };
  const tagger = { ...noopEmitter, plays: [], toast() {} };
  const canvas = { ...noopEmitter, annotations: [] };

  // Independent release gates prove ordering; microtask timing alone cannot.
  function gatedBackend() {
    const gates = [];   // one release fn per dispatched saveSeason call, in order
    const backend = backendFor({
      async saveSeason() { return new Promise(res => { gates.push(v => res(v)); }); },
      diskStatus() { return { bound: false }; }
    });
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

  {
    const { backend, gates } = gatedBackend();
    const store = freshStore(backend);
    const sm = wireStorageManager(store);

    sm._autoSave();
    const flushPromise = sm.flushPendingSaves();   // dispatches A (gates[0])
    await new Promise(r => setTimeout(r, 0));

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

section("Single backup creation and fail-closed restore");
{
  {
    let directCalls = 0;
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = { id: 'bk-internal', seasonName: data.seasonName }; return true; },
      async createBackup() { directCalls++; return 'bk-should-not-happen'; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const result = await store.snapshot('Before restore');

    ok(directCalls === 0 && result && result.id === 'bk-internal',
      "snapshot() uses writeDisk()'s own internal backup result directly and never makes a second, separate createBackup() call for the same write -- reproduced before this fix as the second call always firing, colliding with the internal one",
      JSON.stringify({ directCalls, result }));
  }

  {
    let directCalls = 0;
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = null; return true; },
      async createBackup() { directCalls++; return 'bk-should-not-happen'; }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    store.data = season('A', 'Season A');

    const result = await store.snapshot('Before restore');

    ok(result === null && directCalls === 0,
      "a genuinely failed internal backup write is reported as null, not silently retried through the direct call -- a retry after a genuine failure would just repeat it, defeating create-each-backup-once",
      JSON.stringify({ result, directCalls }));
  }

  {
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = null; return true; },
      async createBackup() { return null; },
      async getBackup() { return season('A', 'Restored from backup'); }
    });
    const store = new SeasonStore(backend);
    store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
    const live = season('A', 'Live unsaved edits');
    store.data = live;

    const restored = await store.restoreBackup('some-backup-id');

    ok(restored === null && store.data === live,
      "restoreBackup() refuses to proceed when the pre-restore safety backup genuinely fails to be created durably -- live season data is left completely untouched, never partially overwritten",
      JSON.stringify({ restored: restored, dataUnchanged: store.data === live }));
  }

  {
    let directCalls = 0;
    const backend = backendFor({
      async saveSeason() { return true; },
      diskStatus() { return { bound: true }; },
      async writeDisk(id, data, opts) { if (opts && opts.snapshot) opts.createdBackup = { id: 'bk-internal-2' }; return true; },
      async createBackup() { directCalls++; return 'bk-should-not-happen'; }
    });
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
