/* REGRESSION (P1-2 / P1-3): every film-add path must persist to the desktop
   library, and a managed import/repair must record filmMode:'managed' (clearing
   a stale 'linked') while a linked game is never copied.
   - P1-2: PlaylistManager.addFiles fires the onFilmFiles hook for new files, so
     the Playlist-panel "Add Clips" button (which bypassed importFilm) now persists.
   - P1-3: StorageManager.importFilm sets filmMode='managed' + clears filmDir on a
     managed import, and SKIPS a linked game (referenced in place, never copied).
   Desktop film I/O is stubbed (backend.supportsFilm/importFilm) so the logic runs
   in the headless harness.

   Run after build:  node tools/e2e-film-persist.mjs */
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
  const sm = window.app.storage, store = sm.seasonStore, pl = window.app.tagger.playlist;
  const mkFile = (n) => new File([new Blob([new Uint8Array(8)])], n, { type: 'video/mp4' });

  // ---- P1-2: addFiles fires onFilmFiles for genuinely-new files ----
  window.__hookFiles = null;
  const prevHook = pl.onFilmFiles;
  pl.onFilmFiles = (files) => { window.__hookFiles = files.map(f => f.name); };
  pl.reset();
  pl._probeDuration = async () => 5;
  await pl.addFiles([mkFile('HOOKED.mp4')]);
  const hookFired = Array.isArray(window.__hookFiles) && window.__hookFiles.includes('HOOKED.mp4');
  pl.onFilmFiles = prevHook;

  // ---- P1-3: importFilm managed/linked behavior (stub the desktop backend) ----
  const backend = store.backend;
  const realSupports = backend.supportsFilm, realImport = backend.importFilm;
  backend.supportsFilm = () => true;
  backend.importFilm = async () => ['x'];

  store.data = store._normalize({
    version: 5, type: 'season', id: 'fp', seasonName: 'FP', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'g1', gameInfo: {}, status: 'active', plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipName: 'a', tags: { unit: 'offense', custom: [] } }], annotations: [], nextId: 2, currentPlayId: null, clipNames: ['a'], isMultiClip: true }],
  });
  store.currentSeasonId = 'fp';
  sm._loadActiveGame();
  const g = () => store.data.games.find(x => x.id === 'g1');

  // non-linked import → becomes managed
  delete g().filmMode; g().filmDir = undefined;
  await sm.importFilm([mkFile('m.mp4')]);
  const becameManaged = g().filmMode === 'managed' && !g().filmDir;

  // linked import → skipped, never copied, mode preserved
  g().filmMode = 'linked'; g().filmDir = 'Week1';
  let copiedForLinked = false;
  backend.importFilm = async () => { copiedForLinked = true; return ['x']; };
  await sm.importFilm([mkFile('n.mp4')]);
  const linkedSkipped = g().filmMode === 'linked' && g().filmDir === 'Week1' && !copiedForLinked;

  backend.supportsFilm = realSupports; backend.importFilm = realImport;
  return { hookFired, becameManaged, linkedSkipped };
});

ok(res.hookFired, 'P1-2: addFiles fires onFilmFiles for new clips (Playlist-panel "Add Clips" now persists)', JSON.stringify(res));
ok(res.becameManaged, 'P1-3: a managed import records filmMode="managed" and clears filmDir', JSON.stringify(res));
ok(res.linkedSkipped, 'P1-3: a linked game is skipped by importFilm (never copied, mode preserved)', JSON.stringify(res));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
