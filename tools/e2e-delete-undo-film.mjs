import { APP_URL as TEST_APP_URL, gotoApp } from './app-entry.mjs';
/* REGRESSION (P1-6): deleting a game must NOT immediately hard-delete its managed
   film — undoRemoveGame restores the game node and its tags reference that film, so
   a synchronous delete brought the game back pointing at gone film. The film delete
   is deferred until the undo window closes (a newer delete, or leaving the season);
   undo cancels it. Desktop film I/O stubbed to count deleteFilm calls.

   Run after build:  node tools/e2e-delete-undo-film.mjs */
import puppeteer from './test-browser.mjs';
import { TauriBackend } from '../js/storage-backend.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = TEST_APP_URL;
await gotoApp(page, URL);

const res = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore;
  const backend = store.backend;
  const realSupports = backend.supportsFilm, realDelete = backend.deleteFilm;
  const deleted = [];
  backend.supportsFilm = () => true;
  backend.deleteFilm = async (id) => { deleted.push(id); };

  const g = (n) => ({ id: n, name: n, gameInfo: {}, status: 'active', plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: n + '_a', tags: { unit: 'offense', custom: [] } }], annotations: [], nextId: 2, currentPlayId: null, clipNames: [n + '_a'], isMultiClip: true });
  store.data = store._normalize({ version: 5, type: 'season', id: 'du', seasonName: 'DU', activeGameId: 'g1', games: [g('g1'), g('g2'), g('g3'), g('g4')] });
  store.currentSeasonId = 'du';
  sm._loadActiveGame();

  const has = (id) => store.data.games.some(x => x.id === id);

  // 1) delete a non-active game — film NOT deleted yet (deferred for undo)
  sm.removeGame('g2');
  const afterDel2 = { deleted: deleted.slice(), g2Present: has('g2') };

  // 2) undo — game back, film still never deleted
  const undoOk = sm.undoRemoveGame();
  const afterUndo = { deleted: deleted.slice(), g2Present: has('g2'), undoOk };

  // 3) delete g3 (deferred), then g4 — g4's delete closes g3's undo window → purge g3
  sm.removeGame('g3');
  const afterDel3 = deleted.slice();
  sm.removeGame('g4');
  const afterDel4 = deleted.slice();

  // 4) leaving the season purges the still-pending g4
  sm._purgeStaleDeletedFilm();
  const afterLeave = deleted.slice();

  backend.supportsFilm = realSupports; backend.deleteFilm = realDelete;
  return { afterDel2, afterUndo, afterDel3, afterDel4, afterLeave };
});

ok(res.afterDel2.deleted.length === 0 && !res.afterDel2.g2Present, 'deleting a game defers the film delete (film not touched, game removed)', JSON.stringify(res.afterDel2));
ok(res.afterUndo.undoOk && res.afterUndo.g2Present && res.afterUndo.deleted.length === 0, 'undo restores the game AND its film was never deleted', JSON.stringify(res.afterUndo));
ok(JSON.stringify(res.afterDel3) === '[]', 'deleting g3 defers its film too (nothing purged yet)', JSON.stringify(res.afterDel3));
ok(JSON.stringify(res.afterDel4) === JSON.stringify(['g3']), 'a newer delete (g4) purges the previous game (g3) whose undo window closed', JSON.stringify(res.afterDel4));
ok(JSON.stringify(res.afterLeave) === JSON.stringify(['g3', 'g4']), 'leaving the season purges the last still-pending film (g4)', JSON.stringify(res.afterLeave));

// ---- undo-window TIMER: purge fires on its own; undo cancels it ----
const timers = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore, backend = store.backend;
  const realSupports = backend.supportsFilm, realDelete = backend.deleteFilm;
  const deleted = [];
  backend.supportsFilm = () => true;
  backend.deleteFilm = async (id) => { deleted.push(id); };
  const defaultWindow = sm.undoGameWindowMs();
  sm.UNDO_FILM_WINDOW_MS = 60;   // shrink the shared UI + film-recovery window for the test
  const overrideWindow = sm.undoGameWindowMs();

  const g = (n) => ({ id: n, name: n, gameInfo: {}, status: 'active', plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: n + '_a', tags: { unit: 'offense', custom: [] } }], annotations: [], nextId: 2, currentPlayId: null, clipNames: [n + '_a'], isMultiClip: true });
  const fresh = () => { store.data = store._normalize({ version: 5, type: 'season', id: 'tm', seasonName: 'TM', activeGameId: 'a', games: [g('a'), g('b'), g('c')] }); store.currentSeasonId = 'tm'; sm._loadActiveGame(); };
  const sleep = ms => new Promise(r => setTimeout(r, ms));

  // (1) delete + walk away → timer purges after the window
  fresh(); deleted.length = 0;
  sm.removeGame('b');
  const beforeTimer = deleted.slice();
  await sleep(140);
  const afterTimer = deleted.slice();

  // (2) delete + undo within the window → timer cancelled, film kept
  fresh(); deleted.length = 0;
  sm.removeGame('c');
  sm.undoRemoveGame();
  await sleep(140);
  const afterUndoTimer = deleted.slice();

  backend.supportsFilm = realSupports; backend.deleteFilm = realDelete;
  return { defaultWindow, overrideWindow, beforeTimer, afterTimer, afterUndoTimer };
});
ok(timers.defaultWindow === 30000 && timers.overrideWindow === 60, 'one duration seam owns both the visible Undo and deferred film purge window', JSON.stringify(timers));
ok(timers.beforeTimer.length === 0, 'film is not purged immediately on delete (undo window open)', JSON.stringify(timers));
ok(JSON.stringify(timers.afterTimer) === JSON.stringify(['b']), 'the undo-window timer purges the film on its own (delete + walk away)', JSON.stringify(timers));
ok(timers.afterUndoTimer.length === 0, 'undo within the window cancels the purge timer — film kept', JSON.stringify(timers));

// ---- refused season open: the coach did not leave, so Undo stays valid ----
const refused = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore, backend = store.backend;
  const realSupports = backend.supportsFilm, realDelete = backend.deleteFilm;
  const deleted = [];
  backend.supportsFilm = () => true;
  backend.deleteFilm = async (id) => { deleted.push(id); };
  sm.UNDO_FILM_WINDOW_MS = 60000;

  const g = n => ({ id: n, name: n, gameInfo: {}, status: 'active', plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: n + '_a', tags: { unit: 'offense', custom: [] } }], annotations: [], nextId: 2, currentPlayId: null, clipNames: [n + '_a'], isMultiClip: true });
  store.data = store._normalize({ version: 5, type: 'season', id: 'undo-held', seasonName: 'Undo Held', activeGameId: 'a', games: [g('a'), g('b')] });
  store.currentSeasonId = 'undo-held';
  backend.setCurrentSeason('undo-held');
  await backend.saveSeason('undo-held', structuredClone(store.data));
  sm._loadActiveGame();

  sm.removeGame('b');
  const pendingBefore = {
    filmGameId: sm._lastDeletedGame?.filmGameId || null,
    timer: Boolean(sm._filmPurgeTimer),
    deleted: deleted.slice(),
  };
  await backend.saveSeason('undo-conflict', {
    id: 'undo-conflict', seasonName: 'Undo Conflict', activeGameId: 'c1',
    games: [
      { id: 'c1', name: 'Week 1', plays: [], roster: [{ num: '11', name: 'One' }] },
      { id: 'c2', name: 'Week 2', plays: [], roster: [{ num: '22', name: 'Two' }] },
    ],
  });

  const opened = await sm.openSeasonById('undo-conflict');
  const pendingAfter = {
    seasonId: store.currentSeasonId,
    filmGameId: sm._lastDeletedGame?.filmGameId || null,
    timer: Boolean(sm._filmPurgeTimer),
    deleted: deleted.slice(),
  };
  const undoOk = sm.undoRemoveGame();
  const gameRestored = store.data.games.some(game => game.id === 'b');

  backend.supportsFilm = realSupports;
  backend.deleteFilm = realDelete;
  return { opened, pendingBefore, pendingAfter, undoOk, gameRestored, deleted };
});

ok(refused.opened === false && refused.pendingAfter.seasonId === 'undo-held',
  'a migration-refused open leaves the outgoing season current', JSON.stringify(refused));
ok(refused.pendingBefore.filmGameId === 'b' && refused.pendingBefore.timer
  && refused.pendingAfter.filmGameId === 'b' && refused.pendingAfter.timer
  && refused.deleted.length === 0,
  'a refused open preserves the pending film and its undo-window timer', JSON.stringify(refused));
ok(refused.undoOk && refused.gameRestored && refused.deleted.length === 0,
  'Undo still restores the deleted game without losing its film after a refused open', JSON.stringify(refused));

// ---- successful switch: deletion remains scoped to the outgoing season ----
const scoped = await page.evaluate(async () => {
  const sm = window.app.storage, store = sm.seasonStore, backend = store.backend;
  const realSupports = backend.supportsFilm, realDelete = backend.deleteFilm;
  const deleted = [];
  backend.supportsFilm = () => true;
  backend.deleteFilm = async (gameId, seasonId) => { deleted.push({ gameId, seasonId, pointer: backend.currentSeason() }); };
  sm.UNDO_FILM_WINDOW_MS = 60000;

  const g = id => ({ id, name: id, gameInfo: {}, status: 'active', plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: id + '_a', tags: { unit: 'offense', custom: [] } }], annotations: [], nextId: 2, currentPlayId: null, clipNames: [id + '_a'], isMultiClip: true });
  const outgoing = store._normalize({ version: 5, type: 'season', id: 'film-outgoing', seasonName: 'Film Outgoing', activeGameId: 'keep', games: [g('keep'), g('shared-game')] });
  const incoming = store._normalize({ version: 5, type: 'season', id: 'film-incoming', seasonName: 'Film Incoming', activeGameId: 'shared-game', games: [g('shared-game')] });
  await backend.saveSeason('film-outgoing', structuredClone(outgoing));
  await backend.saveSeason('film-incoming', structuredClone(incoming));
  store.data = outgoing;
  store.currentSeasonId = 'film-outgoing';
  backend.setCurrentSeason('film-outgoing');
  sm._loadActiveGame();

  sm.removeGame('shared-game');
  const opened = await sm.openSeasonById('film-incoming');
  const current = store.currentSeasonId;

  backend.supportsFilm = realSupports;
  backend.deleteFilm = realDelete;
  return { opened, current, deleted };
});

ok(scoped.opened === true && scoped.current === 'film-incoming',
  'the successful-switch fixture opens the incoming season with the reused game id', JSON.stringify(scoped));
ok(scoped.deleted.length === 1
  && scoped.deleted[0].gameId === 'shared-game'
  && scoped.deleted[0].seasonId === 'film-outgoing'
  && scoped.deleted[0].pointer === 'film-incoming',
  'film purge carries the outgoing season id instead of using the incoming backend pointer', JSON.stringify(scoped));

const desktopPath = TauriBackend.prototype._filmsDir.call(
  { currentId: 'film-incoming' }, 'shared-game', 'film-outgoing');
ok(desktopPath === 'seasons/film-outgoing/films/shared-game',
  'the desktop filesystem path honors the explicit season id when game ids collide', desktopPath);

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
