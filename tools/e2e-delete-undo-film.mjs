/* REGRESSION (P1-6): deleting a game must NOT immediately hard-delete its managed
   film — undoRemoveGame restores the game node and its tags reference that film, so
   a synchronous delete brought the game back pointing at gone film. The film delete
   is deferred until the undo window closes (a newer delete, or leaving the season);
   undo cancels it. Desktop film I/O stubbed to count deleteFilm calls.

   Run after build:  node tools/e2e-delete-undo-film.mjs */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
