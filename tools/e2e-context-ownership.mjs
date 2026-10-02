/* CONTEXT OWNERSHIP HARNESS (Node) --------------------------------------------
   Codex review of f698ef0b (2026-10-02). Each case below was reproduced against
   the committed classes before its repair:

     1. A failed season read opened an EMPTY season, and the next persist()
        replaced the saved plays with zero plays.
     2. A version restore that waited on its reads finished against whatever
        game was open by then: it backed up B, replaced B with A's snapshot and
        committed B.
     3. Two overlapping season opens finishing out of order left the season id
        and backend pointer on B while the loaded data was A.
     4. Film repair resumed after its copy without checking the context: A's
        video loaded into B and commitActive() committed B.
     5. Film repair reported success when the season save failed.
     6. On desktop, every canonical save was followed 2.5s later by a deferred
        disk sync that saved the whole season AGAIN, although the canonical
        save had already written the recovery mirror.

   Run:  node tools/e2e-context-ownership.mjs */
import { SeasonStore } from '../js/season-store.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { VersionManager } from '../js/version-manager.js';
import { StorageManager } from '../js/storage.js';
import { SeasonFormat } from '../js/season-format.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const tick = () => new Promise(r => setTimeout(r, 0));
const deferred = () => { let resolve, reject; const promise = new Promise((a, b) => { resolve = a; reject = b; }); return { promise, resolve, reject }; };

globalThis.window = globalThis.window || {};

const play = n => ({ id: n, timestamp: { start: 0, end: 5 }, clipId: null, clipName: '', notes: '', annotations: [], tags: { unit: 'offense', custom: [] } });
const season = (id, name, plays = []) => ({
  version: 5, type: 'season', id, seasonName: name, activeGameId: 'g1',
  teamProfile: { teamName: name }, roster: [],
  games: [{ id: 'g1', name: 'G1', gameInfo: {}, status: 'active', plays, annotations: [], nextId: plays.length + 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false }],
});
const backendWith = (loadSeason, extra = {}) => {
  const state = { saves: [], disk: [] };
  return {
    state, currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    currentSeason() { return this.currentId; },
    loadSeason,
    async saveSeason(id, data) { state.saves.push({ id, plays: data.games.reduce((n, g) => n + g.plays.length, 0) }); return true; },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
    async writeDisk(id) { state.disk.push(id); return true; },
    ...extra,
  };
};
const openOn = (backend, id, plays) => {
  const store = new SeasonStore(backend);
  store.currentSeasonId = id;
  store.data = store._normalize(season(id, id, plays));
  backend.setCurrentSeason(id);
  return store;
};

console.log('\n-- 1. a failed season read refuses the open; it never opens an empty season --');
{
  const backend = backendWith(async id => { if (id === 'B') throw new Error('transient read failure'); return null; });
  const store = openOn(backend, 'A', [play(1), play(2)]);
  const before = store.data;
  const opened = await store.openSeason('B');
  ok(opened === null, 'openSeason resolves null when the read throws', String(opened && opened.id));
  ok(store.currentSeasonId === 'A' && store.data === before && backend.currentId === 'A',
    'the season already open stays open, with its data and backend pointer',
    JSON.stringify({ id: store.currentSeasonId, same: store.data === before, ptr: backend.currentId }));
  ok(!!(store.openRefusal && /could not be read/i.test(store.openRefusal.message)),
    'the refusal says the season could not be read', JSON.stringify(store.openRefusal));
  await store.persist();
  ok(!backend.state.saves.some(s => s.id === 'B'), 'a persist after the failed read writes nothing to the unread season',
    JSON.stringify(backend.state.saves));

  // The live seam: a catalog row that throws while loading is a failed read,
  // not an absent season.
  const cp = new CatalogPersistence({
    catalog: { db: {}, saveSeason() {}, open() {}, loadSeason(id) { if (id === 'bad') throw new Error('malformed row'); return null; } },
    fs: { readDb: async () => null, writeDb: async () => {} },
  });
  cp._loaded = true;
  let threw = false;
  try { await cp.loadSeason('bad'); } catch (e) { threw = true; }
  ok(threw, 'CatalogPersistence.loadSeason raises an unreadable row instead of reporting it absent');
  ok((await cp.loadSeason('missing')) === null, 'a season with no row is still reported absent (null)');
}

console.log('\n-- 2. overlapping season opens: the latest request owns the result --');
for (const order of [['B', 'A'], ['A', 'B']]) {
  const gates = { A: deferred(), B: deferred() };
  const backend = backendWith(id => gates[id].promise);
  const store = openOn(backend, 'Z', [play(1)]);
  const openA = store.openSeason('A');
  const openB = store.openSeason('B');
  for (const id of order) { gates[id].resolve(season(id, id, id === 'A' ? [play(1), play(2)] : [play(1)])); await tick(); await tick(); }
  const [ra, rb] = await Promise.all([openA, openB]);
  ok(store.currentSeasonId === 'B' && store.data && store.data.id === 'B' && backend.currentId === 'B',
    `reads resolving ${order.join(' then ')}: id, data and pointer all belong to B`,
    JSON.stringify({ id: store.currentSeasonId, data: store.data && store.data.id, ptr: backend.currentId }));
  ok(ra === null && rb && rb.id === 'B', `reads resolving ${order.join(' then ')}: the superseded open resolves null`,
    JSON.stringify({ ra: ra && ra.id, rb: rb && rb.id }));
}
{
  // While the read is pending the open season is still the prior one, whole.
  const gate = deferred();
  const backend = backendWith(() => gate.promise);
  const store = openOn(backend, 'A', [play(1), play(2)]);
  const pending = store.openSeason('B');
  ok(store.currentSeasonId === 'A' && store.data.id === 'A' && backend.currentId === 'A',
    'during the read, id, data and pointer still all belong to the season already open',
    JSON.stringify({ id: store.currentSeasonId, data: store.data.id, ptr: backend.currentId }));
  gate.resolve(season('B', 'B', [play(1)]));
  await pending;
}

console.log('\n-- 3. version restore re-checks its season and game after every wait --');
const restoreRig = () => {
  const log = [];
  const read = deferred();
  const store = {
    currentSeasonId: 'S', data: { activeGameId: 'A' },
    backend: {
      async listVersions() { return [{ id: '7', label: 'v7', playCount: 3 }]; },
      getVersion() { return read.promise; },
      async saveVersion(sid, gid) { log.push(`backup ${sid}::${gid}`); return 'b1'; },
    },
    async persist() { log.push(`persist ${this.data.activeGameId}`); return true; },
  };
  const storage = {
    seasonStore: store, _loadedGameId: 'A',
    _serialize() { return { plays: [], gameId: store.data.activeGameId }; },
    _deserialize(d) { log.push(`deserialize into ${store.data.activeGameId}`); },
    commitActive() { log.push(`commit ${store.data.activeGameId}`); },
  };
  const toasts = [];
  const tagger = { async _confirmDialog() { return true; }, toast(m) { toasts.push(m); } };
  const vm = Object.create(VersionManager.prototype);
  Object.assign(vm, { storage, tagger, changeCount: 0 });
  return { vm, store, storage, log, read, toasts };
};
{
  const game = { plays: [], gameInfo: {} };
  ok(SeasonFormat.isCurrentGame(game), 'fixture: the restored snapshot is a current-format game');
  const { vm, store, storage, log, read, toasts } = restoreRig();
  const restoring = vm.restore('7');
  await tick();
  store.data.activeGameId = 'B'; storage._loadedGameId = 'B';   // the coach opens game B
  read.resolve(game);
  const result = await restoring;
  ok(result === false, 'a restore whose game changed during the read returns false', String(result));
  ok(!log.length, 'nothing is backed up, replaced or committed in the game opened meanwhile', JSON.stringify(log));
  ok(toasts.some(m => /game changed/i.test(m)), 'the coach is told the restore stopped because the game changed', JSON.stringify(toasts));
}
{
  // The backup itself awaits; a switch there must also stop the restore.
  const { vm, store, storage, log, read } = restoreRig();
  const game = { plays: [], gameInfo: {} };
  const backupGate = deferred();
  store.backend.saveVersion = async (sid, gid) => { log.push(`backup ${sid}::${gid}`); await backupGate.promise; return 'b1'; };
  const restoring = vm.restore('7');
  read.resolve(game);
  for (let i = 0; i < 6; i++) await tick();
  store.data.activeGameId = 'B'; storage._loadedGameId = 'B';
  backupGate.resolve();
  const result = await restoring;
  ok(result === false && !log.some(l => /deserialize|commit|persist/.test(l)),
    'a game switch during the backup stops the restore before anything is replaced', JSON.stringify({ result, log }));
}
{
  const { vm, log, read } = restoreRig();
  read.resolve({ plays: [], gameInfo: {} });
  const result = await vm.restore('7');
  ok(result === true && log.join('|') === 'backup S::A|deserialize into A|commit A|persist A',
    'an undisturbed restore still backs up, replaces, commits and persists game A', JSON.stringify({ result, log }));
}

console.log('\n-- 4/5. film repair: context and the save result decide the outcome --');
const repairRig = ({ persistResult = true, multi = false } = {}) => {
  const log = [];
  const copy = deferred();
  const gameA = { id: 'A', isMultiClip: multi, filmMode: 'linked', filmDir: 'X' };
  const store = {
    currentSeasonId: 'S', data: { activeGameId: 'A', games: [gameA] },
    backend: {
      supportsFilm: () => true,
      importFilm() { return copy.promise; },
      async filmUrl(gid, ref) { return `asset://${gid}/${ref}`; },
    },
    activeGame() { return this.data.games.find(g => g.id === this.data.activeGameId) || null; },
    async persist() { log.push(`persist ${this.data.activeGameId}`); return persistResult; },
  };
  const toasts = [], signals = [];
  const sm = Object.create(StorageManager.prototype);
  Object.assign(sm, {
    seasonStore: store, _loadedGameId: 'A',
    tagger: { plays: [play(1)], async _choiceDialog() { return 'repair'; }, toast(m) { toasts.push(m); } },
    vc: { loadUrl(u) { log.push(`load ${u}`); }, loadFile() { log.push('loadFile'); } },
    playlist: { async repairWithMatches() { log.push('relink'); } },
    _maybeSnapshot() {},
    _signalSave(s) { signals.push(s); },
    commitActive() { log.push(`commit ${store.data.activeGameId}`); },
  });
  if (multi) sm._planClipRepair = files => ({ matches: files.map((file, i) => ({ file, play: { id: i + 1 } })), missing: [], totalPlays: files.length, extraFiles: 0, orderMatches: 0 });
  const files = multi ? [{ name: 'p1.mp4', type: 'video/mp4' }, { name: 'p2.mp4', type: 'video/mp4' }] : [{ name: 'game.mp4', type: 'video/mp4' }];
  return { sm, store, log, copy, toasts, signals, files, gameA };
};
for (const multi of [false, true]) {
  const tag = multi ? 'multi-clip' : 'single-video';
  {
    const { sm, store, log, copy, toasts, files, gameA } = repairRig({ multi });
    const repairing = sm.repairFilm(files);
    for (let i = 0; i < 4; i++) await tick();
    store.data.games.push({ id: 'B' }); store.data.activeGameId = 'B'; sm._loadedGameId = 'B';
    copy.resolve(files.map(f => f.name));
    const result = await repairing;
    ok(result === false, `${tag}: a game switch during the copy returns false`, String(result));
    ok(!log.length, `${tag}: no film is loaded into, committed or saved over the game opened meanwhile`, JSON.stringify(log));
    ok(gameA.filmMode === 'linked', `${tag}: the repaired game's film mode is not changed by an abandoned repair`, gameA.filmMode);
    ok(toasts.some(m => /game changed/i.test(m)), `${tag}: the coach is told to repair again`, JSON.stringify(toasts));
  }
  {
    const { sm, copy, toasts, signals, files } = repairRig({ multi, persistResult: false });
    const repairing = sm.repairFilm(files);
    copy.resolve(files.map(f => f.name));
    const result = await repairing;
    ok(result === false, `${tag}: a failed season save returns false`, String(result));
    ok(!signals.includes('saved'), `${tag}: the save state is not marked saved`, JSON.stringify(signals));
    ok(toasts.length && !toasts.some(m => /^Film repaired/.test(m)) && toasts.some(m => /not saved/i.test(m)),
      `${tag}: the coach is told the repair was not saved`, JSON.stringify(toasts));
  }
  {
    const { sm, log, copy, signals, files } = repairRig({ multi });
    const repairing = sm.repairFilm(files);
    copy.resolve(files.map(f => f.name));
    const result = await repairing;
    ok(result === true && signals.includes('saved') && log.includes('commit A') && log.includes('persist A'),
      `${tag}: an undisturbed repair still loads, commits, saves and reports saved`, JSON.stringify({ result, log, signals }));
  }
}

console.log('\n-- 6. a backend whose canonical save writes the mirror skips the deferred re-save --');
{
  const realSetTimeout = globalThis.setTimeout;
  const timers = [];
  globalThis.setTimeout = (fn, ms) => { if (ms === 2500) { timers.push(fn); return timers.length; } return realSetTimeout(fn, ms); };
  try {
    for (const mirrors of [true, false]) {
      timers.length = 0;
      const backend = backendWith(async () => null, {
        diskStatus() { return { bound: true }; },
        mirrorsOnCanonicalSave() { return mirrors; },
      });
      const store = openOn(backend, 'A', [play(1)]);
      await store.persist();
      timers.forEach(fn => fn());
      await tick(); await tick();
      const expected = mirrors ? 'save' : 'save|disk';
      const seen = [...backend.state.saves.map(() => 'save'), ...backend.state.disk.map(() => 'disk')].join('|');
      ok(seen === expected, mirrors
        ? 'desktop: one canonical save, no deferred second save'
        : 'browser folder backup: the deferred disk write still runs', seen);
    }
  } finally { globalThis.setTimeout = realSetTimeout; }
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
