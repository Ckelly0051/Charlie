import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* P0 regression: latest-film-load-wins. Two overlapping game opens run two
   overlapping _autoLoadFilm calls. If the FIRST (slow) game's film resolves
   LAST, it must NOT stamp its video onto the now-active SECOND game — the coach
   would tag game B while watching game A's film (active=B, loaded=B, film=A).
   The load captures a monotonic token at entry and re-checks it before every
   player/playlist mutation; a superseded load aborts. Runs against the built
   bundle. Mutation check: drop the `!stale()` guard on vc.loadUrl in
   js/storage.js and this reds (the slow load clobbers).

   TIMING NOTE (self-review finding F1, 2026-07-23): _autoLoadFilm now also
   checks `stale()` right after its very FIRST await (listFilmFiles), for
   messaging correctness (F3). If pSlow and pFast were started back-to-back in
   the same synchronous tick, BOTH loads' token bumps happen before either one's
   first microtask resumes — so "slow" would go stale at that very first
   checkpoint and never reach the deep gate (filmUrl/linkedFilmUrl) this test
   means to exercise, silently defeating the mutation check on the LATER guards
   (vc.loadUrl, rehydrateFromDisk). Every scenario below inserts a real
   macrotask yield (setTimeout(0)) between starting slow and starting fast, so
   slow genuinely progresses — while still current — down to the real gate
   before fast supersedes it. This matches the real-world shape of the bug: two
   game-opens separated by actual time, not two calls issued in the same tick. */
import puppeteer from 'puppeteer';
const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage);

// --- Single-video overlapping open: slow first, fast second ---
const r = await page.evaluate(async () => {
  const app = window.app;
  const loaded = [];
  app.vc.loadUrl = (url) => loaded.push(url);   // spy — record every film swap, in order
  let release;
  const gate = new Promise(res => { release = res; });
  const backend = {
    supportsFilm: () => true,
    supportsLinkedFilm: () => false,
    listFilmFiles: async id => [{ name: `${id}.mp4`, path: `${id}.mp4` }],
    // The FIRST-opened game ('slow') stalls at URL resolution until we release
    // it — long enough for the SECOND game to finish loading first.
    filmUrl: async (id) => { if (id === 'slow') await gate; return `asset://${id}`; },
  };
  app.storage.seasonStore.backend = backend;
  const mk = id => ({ id, videoFileName: `${id}.mp4`, isMultiClip: false, plays: [], clipNames: [], clipPaths: [] });

  const pSlow = app.storage._autoLoadFilm(mk('slow'));   // starts
  await new Promise(res => setTimeout(res, 0));          // let slow reach the real gate at filmUrl while still current
  const pFast = app.storage._autoLoadFilm(mk('fast'));   // now starts, supersedes slow
  await pFast;
  const afterFast = loaded.slice();
  release();                                             // slow's filmUrl now resolves LAST
  await pSlow;
  return { loaded, afterFast, last: loaded[loaded.length - 1] };
});

ok(r.afterFast.length === 1 && r.afterFast[0] === 'asset://fast',
  'The later (fast) open loads its own film', JSON.stringify(r.afterFast));
ok(r.last === 'asset://fast' && !r.loaded.includes('asset://slow'),
  'The superseded (slow) earlier load never clobbers the active game film', JSON.stringify(r));

// --- The reverse direction still works: a lone load applies normally ---
const r2 = await page.evaluate(async () => {
  const app = window.app;
  const loaded = [];
  app.vc.loadUrl = (url) => loaded.push(url);
  app.storage.seasonStore.backend = {
    supportsFilm: () => true, supportsLinkedFilm: () => false,
    listFilmFiles: async id => [{ name: `${id}.mp4`, path: `${id}.mp4` }],
    filmUrl: async id => `asset://${id}`,
  };
  await app.storage._autoLoadFilm({ id: 'only', videoFileName: 'only.mp4', isMultiClip: false, plays: [], clipNames: [], clipPaths: [] });
  return { loaded };
});
ok(r2.loaded.length === 1 && r2.loaded[0] === 'asset://only',
  'A single (non-racing) load applies its film normally', JSON.stringify(r2));

// --- Multi-clip overlapping open: the race's REAL shape (your six games are
// all linked/multi-clip). Self-review finding F1 (2026-07-23): the original
// harness only exercised the single-video branch; the multi-clip rehydrate
// guard and the linked-film branch had zero coverage. ---
const r3 = await page.evaluate(async () => {
  const app = window.app;
  const calls = [];   // each entry: the array of clip urls handed to rehydrateFromDisk
  app.storage.playlist = {
    rehydrateFromDisk: async clips => { calls.push(clips.map(c => c.url)); },
    switchToClipByPlayId() {}, switchToClip() {}, activeClipIndex: -1, clips: [],
  };
  app.tagger.currentPlayId = null;
  let release;
  const gate = new Promise(res => { release = res; });
  const backend = {
    supportsFilm: () => true,
    supportsLinkedFilm: () => false,
    listFilmFiles: async id => [{ name: 'c1.mp4', path: 'c1.mp4' }],
    filmUrl: async (id, fileRef) => { if (id === 'slow') await gate; return `asset://${id}/${fileRef.name}`; },
  };
  app.storage.seasonStore.backend = backend;
  const mk = id => ({ id, isMultiClip: true, clipPaths: ['c1'], clipNames: ['c1'], plays: [] });

  const pSlow = app.storage._autoLoadFilm(mk('slow'));
  await new Promise(res => setTimeout(res, 0));   // let slow reach the real gate at filmUrl while still current
  const pFast = app.storage._autoLoadFilm(mk('fast'));
  await pFast;
  const afterFast = calls.slice();
  release();
  await pSlow;
  return { calls, afterFast };
});
ok(r3.afterFast.length === 1 && r3.afterFast[0][0] === 'asset://fast/c1.mp4',
  'Multi-clip: the later (fast) open rehydrates its own clips', JSON.stringify(r3.afterFast));
ok(r3.calls.length === 1 && r3.calls[0][0] === 'asset://fast/c1.mp4',
  'Multi-clip: the superseded (slow) earlier load never rehydrates the playlist over the active game', JSON.stringify(r3));

// --- V2-H: unchanged managed manifests reuse deterministic asset URLs. ---
const cacheResult = await page.evaluate(async () => {
  const app = window.app;
  app.storage._managedFilmManifests.clear();
  const urlCalls = [];
  const rehydrated = [];
  let files = ['c1.mp4', 'c2.mp4', 'c3.mp4'];
  const backend = {
    supportsFilm: () => true,
    supportsLinkedFilm: () => false,
    currentSeason: () => 'season-cache',
    listFilmFiles: async () => files.map(name => ({ name, path: name })),
    filmUrl: async (gameId, fileRef) => {
      urlCalls.push(`${gameId}/${fileRef.path}`);
      return `asset://${gameId}/${fileRef.path}`;
    },
  };
  app.storage.seasonStore.backend = backend;
  app.storage.playlist = {
    rehydrateFromDisk: async clips => { rehydrated.push(clips.map(clip => ({ url: clip.url, id: clip.catalogClipId }))); },
    switchToClipByPlayId() {}, switchToClip() {}, activeClipIndex: -1, clips: [],
  };
  app.tagger.currentPlayId = null;
  const savedCatalogIds = app.storage._catalogClipIdsForFiles;
  let catalogIds = ['old-1', 'old-2', 'old-3'];
  app.storage._catalogClipIdsForFiles = () => catalogIds;
  const savedFetch = window.fetch;
  window.fetch = async () => ({ type: 'basic', status: 200, ok: true });
  const game = { id: 'cached', isMultiClip: true, clipPaths: ['c1', 'c2', 'c3'], clipNames: ['c1', 'c2', 'c3'], plays: [] };
  await app.storage._autoLoadFilm(game);
  catalogIds = ['new-1', 'new-2', 'new-3'];
  await app.storage._autoLoadFilm(game);
  const afterExactReopen = urlCalls.length;
  files = [...files, 'c4.mp4'];
  game.clipPaths.push('c4');
  game.clipNames.push('c4');
  catalogIds = [...catalogIds, 'new-4'];
  await app.storage._autoLoadFilm(game);
  window.fetch = savedFetch;
  app.storage._catalogClipIdsForFiles = savedCatalogIds;
  return { afterExactReopen, finalCalls: urlCalls.length, rehydrated, secondIds: rehydrated[1].map(clip => clip.id) };});
ok(cacheResult.afterExactReopen === 3 && cacheResult.rehydrated.length === 3
    && cacheResult.rehydrated[1].length === 3 && cacheResult.secondIds.join(',') === 'new-1,new-2,new-3',
  'Reopening an unchanged managed game reuses its resolved clip manifest', JSON.stringify(cacheResult));
ok(cacheResult.finalCalls === 7 && cacheResult.rehydrated[2].length === 4,
  'A changed managed-film file list invalidates the URL manifest before rehydrate', JSON.stringify(cacheResult));
const partialResult = await page.evaluate(async () => {
  const app = window.app;
  app.storage._managedFilmManifests.clear();
  let calls = 0;
  let miss = true;
  const backend = {
    currentSeason: () => 'season-partial',
    filmUrl: async (_gameId, fileRef) => {
      calls++;
      if (miss && fileRef.path === 'c2.mp4') return null;
      return `asset://${fileRef.path}`;
    },
  };
  const files = ['c1.mp4', 'c2.mp4', 'c3.mp4'].map(name => ({ name, path: name }));
  const game = { id: 'partial', clipRefs: [] };
  const savedCatalogIds = app.storage._catalogClipIdsForFiles;
  app.storage._catalogClipIdsForFiles = () => ['partial-1', 'partial-2', 'partial-3'];
  const first = await app.storage._managedFilmClips(game, files, backend, () => false);
  miss = false;
  const second = await app.storage._managedFilmClips(game, files, backend, () => false);
  app.storage._catalogClipIdsForFiles = savedCatalogIds;
  return { calls, first: first.length, second: second.length, firstIds: first.map(clip => clip.catalogClipId) };
});
ok(partialResult.calls === 6 && partialResult.first === 2 && partialResult.second === 3 && partialResult.firstIds.join(',') === 'partial-1,partial-3',
  'A partial URL resolution is used once but never cached as a permanently incomplete game', JSON.stringify(partialResult));
// --- Linked-film overlapping open: same shape through _autoLoadLinkedFilm. ---
const r4 = await page.evaluate(async () => {
  const app = window.app;
  const calls = [];
  app.storage.playlist = {
    rehydrateFromDisk: async clips => { calls.push(clips.map(c => c.url)); },
    switchToClipByPlayId() {}, switchToClip() {}, activeClipIndex: -1, clips: [],
  };
  app.tagger.currentPlayId = null;
  let release;
  const gate = new Promise(res => { release = res; });
  const backend = {
    supportsFilm: () => true,
    supportsLinkedFilm: () => true,
    getLibraryRoot: () => 'D:/Root',
    allowLibraryDir: async () => true,
    isLinkedDirAllowed: () => true,
    linkedGameDir: async filmDir => `D:/Root/${filmDir}`,
    listLinkedFilm: async absDir => [{ name: 'c1.mp4', path: 'c1.mp4' }],
    linkedAbs: async (absDir, rel) => `${absDir}/${rel}`,
    // Gated on the resolved absolute path (carries 'slow'/'fast' via filmDir)
    // since gameNode.id isn't threaded through the linked resolver chain.
    linkedFilmUrl: async abs => { if (abs.includes('slow')) await gate; return `asset://${abs}`; },
  };
  app.storage.seasonStore.backend = backend;
  const mk = id => ({ id, filmMode: 'linked', filmDir: `${id}-dir`, isMultiClip: true, clipPaths: ['c1'], clipNames: ['c1'], plays: [] });

  const pSlow = app.storage._autoLoadFilm(mk('slow'));
  await new Promise(res => setTimeout(res, 0));   // let slow reach the real gate at linkedFilmUrl while still current
  const pFast = app.storage._autoLoadFilm(mk('fast'));
  await pFast;
  const afterFast = calls.slice();
  release();
  await pSlow;
  return { calls, afterFast };
});
ok(r4.afterFast.length === 1 && /fast-dir/.test(r4.afterFast[0][0]),
  'Linked film: the later (fast) open rehydrates its own clips', JSON.stringify(r4.afterFast));
ok(r4.calls.length === 1 && /fast-dir/.test(r4.calls[0][0]),
  'Linked film: the superseded (slow) earlier load never rehydrates the playlist over the active game', JSON.stringify(r4));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
