/* FAILED-SAVE OWNERSHIP HARNESS (Node + one browser case) ---------------------
   An async operation must keep the season, game or program it started on all
   the way through a failed save and its rollback. Each case was reproduced
   against the committed code before its repair:

     1. Deleting a game whose save failed still purged its managed film when
        the undo window closed or the coach left the season.
     2. A season restore that waited on its reads wrote A's restore point into
        season B, and a failed restore save put A's prior data into B's editor.
     3. Linking film whose save failed restored the captured season over the
        season opened meanwhile; a switch before the save wrote A's link into B.
     4. A failed playbook save rolled back the program active after the await,
        replacing program B's calls with program A's.

   Run after build:  node tools/e2e-failed-save-ownership.mjs */
import puppeteer from './test-browser.mjs';
import { APP_URL, gotoApp } from './app-entry.mjs';
import { SeasonStore } from '../js/season-store.js';
import { StorageManager } from '../js/storage.js';
import { SeasonFormat } from '../js/season-format.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const tick = () => new Promise(r => setTimeout(r, 0));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const deferred = () => { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; };

globalThis.window = globalThis.window || {};

const play = n => ({ id: n, timestamp: { start: 0, end: 5 }, clipId: null, clipName: '', notes: '', annotations: [], tags: { unit: 'offense', custom: [] } });
const game = (id, plays = [play(1)]) => ({ id, name: id, gameInfo: {}, status: 'active', plays, annotations: [], nextId: plays.length + 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false });
const season = (id, name = id, games = [game('g1')]) => ({
  version: 5, type: 'season', id, seasonName: name, activeGameId: games[0].id,
  teamProfile: { teamName: name }, roster: [], games,
});

/** A backend whose season saves can be held open or failed per call. */
const makeBackend = (stored = {}) => {
  const b = {
    currentId: null, saves: [], filmDeletes: [], saveResult: true, saveGate: null,
    setCurrentSeason(id) { this.currentId = id; },
    currentSeason() { return this.currentId; },
    async loadSeason(id) { return stored[id] ? structuredClone(stored[id]) : null; },
    async saveSeason(id, data) {
      this.saves.push({ id, name: data.seasonName });
      if (this.saveGate) { const gate = this.saveGate; this.saveGate = null; return gate.promise; }
      return this.saveResult;
    },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
    supportsFilm: () => true,
    async deleteFilm(gameId, seasonId) { b.filmDeletes.push(`${seasonId}::${gameId}`); },
  };
  return b;
};
const storeOn = (backend, data) => {
  const store = new SeasonStore(backend);
  store.data = store._normalize(structuredClone(data));
  store.currentSeasonId = data.id;
  backend.setCurrentSeason(data.id);
  return store;
};

console.log('\n-- 1. a failed game deletion keeps its game and its film --');
const deleteRig = (saveResult) => {
  const backend = makeBackend();
  backend.saveResult = saveResult;
  const store = storeOn(backend, season('A', 'A', [game('g1'), game('g2'), game('g3')]));
  const sm = Object.create(StorageManager.prototype);
  const loads = [];
  Object.assign(sm, {
    seasonStore: store, UNDO_FILM_WINDOW_MS: 20, _lastDeletedGame: null, _filmPurgeTimer: null,
    _maybeSnapshot() {}, _clearForNewGame() {}, _loadActiveGame() { loads.push(store.data.activeGameId); },
  });
  return { sm, store, backend, loads };
};
{
  const { sm, store, backend } = deleteRig(false);
  const result = await sm.removeGame('g2');
  await sleep(60);
  sm._purgeStaleDeletedFilm();   // leaving the season
  ok(result === false, 'removeGame resolves false when the season save fails', String(result));
  ok(!backend.filmDeletes.length, 'no film is purged: not by the undo-window timer, not by leaving the season', JSON.stringify(backend.filmDeletes));
  ok(store.data.games.map(g => g.id).join(',') === 'g1,g2,g3', 'the game stays in the season the coach still has on disk', store.data.games.map(g => g.id).join(','));
}
{
  const { sm, store, backend, loads } = deleteRig(false);
  const result = await sm.removeGame('g1');
  ok(result === false && store.data.activeGameId === 'g1' && store.data.games.map(g => g.id).join(',') === 'g1,g2,g3'
    && loads[loads.length - 1] === 'g1',
    'a failed deletion of the open game reopens that game', JSON.stringify({ result, active: store.data.activeGameId, loads }));
  await sleep(60);
  ok(!backend.filmDeletes.length, 'the open game\'s film is not purged', JSON.stringify(backend.filmDeletes));
}
{
  // The coach leaves the season while the save is still running, then it fails.
  const { sm, backend } = deleteRig(true);
  const gate = deferred();
  backend.saveGate = gate;
  const deleting = sm.removeGame('g2');
  sm._purgeStaleDeletedFilm();
  gate.resolve(false);
  await deleting; await sleep(60);
  ok(!backend.filmDeletes.length, 'leaving the season before a failing save settles purges nothing', JSON.stringify(backend.filmDeletes));
}
{
  const { sm, store, backend } = deleteRig(true);
  const result = await sm.removeGame('g2');
  ok(result === true && !store.data.games.some(g => g.id === 'g2') && !backend.filmDeletes.length,
    'a durable deletion removes the game and still waits for the undo window', JSON.stringify({ result, deletes: backend.filmDeletes }));
  await sleep(60);
  ok(JSON.stringify(backend.filmDeletes) === '["A::g2"]', 'the undo-window timer then purges the deleted game\'s film', JSON.stringify(backend.filmDeletes));
}

console.log('\n-- 2. a season restore stays on the season it started on --');
const restoreRig = () => {
  const stored = { B: season('B', 'B', [game('g1', [play(1), play(2)])]) };
  const backend = makeBackend(stored);
  const read = deferred(), safety = deferred();
  backend.getBackup = (sid, id) => { backend.backupRead = `${sid}::${id}`; return read.promise; };
  backend.createBackup = (sid) => { backend.safetyFor = sid; return safety.promise; };
  const store = storeOn(backend, season('A', 'A'));
  return { store, backend, read, safety };
};
const restorePoint = season('A', 'A restore point', [game('g1', [play(1), play(2), play(3)])]);
ok(SeasonFormat.isCurrentSeason(structuredClone(restorePoint)), 'fixture: the restore point is a current-format season');
{
  const { store, backend, read, safety } = restoreRig();
  const restoring = store.restoreBackup('r1');
  await tick();
  await store.openSeason('B');
  read.resolve(structuredClone(restorePoint)); safety.resolve('safe1');
  const result = await restoring;
  ok(result === null, 'a season switch during the restore-point read stops the restore', String(result && result.seasonName));
  ok(!backend.saves.length && !backend.safetyFor, 'nothing is snapshotted or saved, in A or in B', JSON.stringify({ saves: backend.saves, safety: backend.safetyFor }));
  ok(store.currentSeasonId === 'B' && store.data.seasonName === 'B', 'season B stays open with its own data', store.data.seasonName);
}
{
  const { store, backend, read, safety } = restoreRig();
  const restoring = store.restoreBackup('r1');
  read.resolve(structuredClone(restorePoint));
  for (let i = 0; i < 4; i++) await tick();
  await store.openSeason('B');
  safety.resolve('safe1');
  const result = await restoring;
  ok(result === null && !backend.saves.length, 'a season switch during the safety snapshot saves nothing into B',
    JSON.stringify({ result: result && result.seasonName, saves: backend.saves }));
  ok(store.currentSeasonId === 'B' && store.data.seasonName === 'B', 'season B keeps its own data', store.data.seasonName);
}
{
  const { store, backend, read, safety } = restoreRig();
  const gate = deferred();
  backend.saveGate = gate;
  const restoring = store.restoreBackup('r1');
  read.resolve(structuredClone(restorePoint)); safety.resolve('safe1');
  for (let i = 0; i < 6; i++) await tick();
  ok(backend.saves.length === 1 && backend.saves[0].id === 'A', 'fixture: the restore save is running against A', JSON.stringify(backend.saves));
  await store.openSeason('B');
  gate.resolve(false);
  const result = await restoring;
  ok(result === null && store.currentSeasonId === 'B' && store.data.seasonName === 'B',
    'a failed restore save leaves the season opened meanwhile untouched', JSON.stringify({ result: result && result.seasonName, id: store.currentSeasonId, name: store.data.seasonName }));
}
{
  const { store, backend, read, safety } = restoreRig();
  read.resolve(structuredClone(restorePoint)); safety.resolve('safe1');
  const result = await store.restoreBackup('r1');
  ok(result && result.seasonName === 'A restore point' && backend.saves.length === 1 && backend.saves[0].id === 'A'
    && backend.backupRead === 'A::r1' && backend.safetyFor === 'A',
    'an undisturbed restore still snapshots A, then replaces and saves A', JSON.stringify({ name: result && result.seasonName, saves: backend.saves }));
}
{
  const { store, backend, read, safety } = restoreRig();
  backend.saveResult = false;
  read.resolve(structuredClone(restorePoint)); safety.resolve('safe1');
  const before = store.data;
  const result = await store.restoreBackup('r1');
  ok(result === null && store.data === before, 'a failed restore save on the same season puts its prior data back');
}

console.log('\n-- 3. linking film: a failed save rolls back only the season it started on --');
const linkRig = ({ bGameId = 'g9' } = {}) => {
  const stored = { B: season('B', 'B', [game(bGameId)]) };
  const backend = makeBackend(stored);
  Object.assign(backend, {
    supportsLinkedFilm: () => true,
    getLibraryRoot: () => 'R',
    async pickFolder() { return 'R/wk1'; },
    gameDirFromRoot: () => 'wk1',
    async allowLibraryDir() { return true; },
    async listLinkedFilm() { return [{ name: 'a.mp4', path: 'a.mp4' }]; },
    async linkedAbs(folder, rel) { return `${folder}/${rel}`; },
    async linkedFilmUrl(abs) { return `asset://${abs}`; },
    rememberLinkedDir() {}, setFilmStorageMode() {},
  });
  const store = storeOn(backend, season('A', 'A'));
  const toasts = [], loads = [];
  const rehydrate = deferred();
  const sm = Object.create(StorageManager.prototype);
  Object.assign(sm, {
    seasonStore: store,
    tagger: { plays: [play(1)], toast(m) { toasts.push(m); } },
    playlist: { activeClipIndex: 0, clips: [{}], async rehydrateFromDisk() { await rehydrate.promise; }, switchToClip() {} },
    commitActive() {}, _cancelPendingSaves() {}, _maybeSnapshot() {}, _clearForNewGame() {}, _signalSave() {},
    async _loadActiveGame() { loads.push(store.currentSeasonId); },
  });
  return { sm, store, backend, toasts, loads, rehydrate };
};
{
  const { sm, store, backend, toasts, loads, rehydrate } = linkRig();
  const gate = deferred();
  backend.saveGate = gate;
  const linking = sm.linkFilmFolder();
  rehydrate.resolve();
  for (let i = 0; i < 20 && !backend.saves.length; i++) await tick();
  ok(backend.saves.length === 1 && backend.saves[0].id === 'A', 'fixture: the link save is running against A', JSON.stringify(backend.saves));
  await store.openSeason('B');
  const liveB = store.data;
  gate.resolve(false);
  const result = await linking;
  ok(result === false, 'the failed link reports false', String(result));
  ok(store.currentSeasonId === 'B' && store.data === liveB && store.data.seasonName === 'B',
    'season B stays open with its own data after A\'s link fails', JSON.stringify({ id: store.currentSeasonId, name: store.data && store.data.seasonName }));
  ok(!loads.length, 'B\'s game is not reloaded from A\'s data', JSON.stringify(loads));
  ok(toasts.some(m => /not linked/i.test(m)), 'the coach is told the film was not linked', JSON.stringify(toasts));
}
{
  // B reuses A's game id, so only the season id tells the two apart.
  const { sm, store, backend, rehydrate } = linkRig({ bGameId: 'g1' });
  const linking = sm.linkFilmFolder();
  for (let i = 0; i < 20; i++) await tick();
  await store.openSeason('B');
  rehydrate.resolve();
  const result = await linking;
  ok(result === false && !backend.saves.some(s => s.id === 'B'),
    'a season switch before the save writes nothing into B, even with the same game id', JSON.stringify({ result, saves: backend.saves }));
  ok(!store.data.games[0].filmMode, 'B\'s game is not marked linked', String(store.data.games[0].filmMode));
}
{
  const { sm, store, backend, loads, rehydrate } = linkRig();
  backend.saveResult = false;
  rehydrate.resolve();
  const result = await sm.linkFilmFolder();
  ok(result === false && store.currentSeasonId === 'A' && !store.data.games[0].filmMode && loads.join() === 'A',
    'a failed link on the same season still restores its prior film setup', JSON.stringify({ result, mode: store.data.games[0].filmMode, loads }));
}
{
  const { sm, store, rehydrate } = linkRig();
  rehydrate.resolve();
  const result = await sm.linkFilmFolder();
  ok(result === true && store.data.games[0].filmMode === 'linked' && store.data.games[0].filmDir === 'wk1',
    'an undisturbed link still links and saves', JSON.stringify({ result, game: store.data.games[0] }));
}

console.log('\n-- 4. a failed playbook save rolls back only its own program --');
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
try {
  const page = await browser.newPage();
  page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
  await gotoApp(page, APP_URL);
  const r = await page.evaluate(async () => {
    const app = window.app, store = app.storage.seasonStore, pb = app.playbook;
    const callsOf = team => JSON.parse(localStorage.getItem(`ffa_playbook_${team}`) || 'null')?.calls?.map(c => c.name) || [];
    await app.storage.createSeason({ name: 'Playbook Owner A', team: 'Owner A', year: '2026' });
    const teamA = pb._teamId();
    pb.replace({ version: 1, calls: [{ id: 'a1', name: 'A Call' }] }, teamA);
    store.data.playbook = pb.snapshot();
    await store.persist();
    const seasonA = store.data;

    const realSave = store.backend.saveSeason.bind(store.backend);
    let release;
    store.backend.saveSeason = () => new Promise(res => { release = res; });
    const adding = app.settingsScreen.addPlayCall({ name: 'A New Call' });
    await new Promise(r => setTimeout(r, 0));

    // The coach switches program while A's save is still running.
    store.backend.saveSeason = realSave;
    const teamB = 'owner-b-' + Date.now();
    localStorage.setItem('ffa_active_team_id', teamB);
    pb.replace({ version: 1, calls: [{ id: 'b1', name: 'B Call' }] }, teamB);
    release(false);
    const result = await adding;
    return { teamA, teamB, result: result.ok, aCalls: callsOf(teamA), bCalls: callsOf(teamB), seasonAPlaybook: seasonA.playbook?.calls?.map(c => c.name) };
  });
  ok(r.result === false, 'the failed save reports the call as not saved', JSON.stringify(r));
  ok(JSON.stringify(r.bCalls) === '["B Call"]', 'program B keeps its own calls', JSON.stringify(r.bCalls));
  ok(JSON.stringify(r.aCalls) === '["A Call"]', 'program A is rolled back to its prior calls', JSON.stringify(r.aCalls));
  ok(JSON.stringify(r.seasonAPlaybook) === '["A Call"]', 'season A\'s playbook is rolled back too', JSON.stringify(r.seasonAPlaybook));
} finally { await browser.close(); }

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
