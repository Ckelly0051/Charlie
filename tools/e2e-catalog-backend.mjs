import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* A3 TauriBackend delegation regression (Codex review, flag-ON failure paths),
   extended for PC-1's explicit-identity API (js/storage-backend.js).
   The flag-OFF 33/33 suite never exercises these because BrowserBackend is the
   headless default. Here we construct a TauriBackend in-page with a FAKE
   window.__TAURI__ fs + an INJECTED fake catalog, so the delegation contract is
   verified without the real wasm/desktop:
     1. saveSeason() must PROPAGATE the catalog's boolean — a canonical (db) write
        that returns false must NOT be reported as success.
     2. deleteSeason() must RETAIN the season.json / mirror / library entry when
        the catalog delete fails (else a stale db resurrects a season whose safety
        copies are gone), and only remove them when the delete is durable.
     3. PC-1: every identity-sensitive method (saveSeason/createBackup/listBackups/
        getBackup/deleteBackup) now takes seasonId as an EXPLICIT first parameter.
        An incorrect ambient this.currentId must not be able to redirect an
        operation the caller explicitly scoped elsewhere -- proven directly by
        pointing be.currentId at the WRONG season while passing the correct
        explicit id, and confirming the explicit id wins.
     4. PC-1 repair (Codex review c51a12c/4ae34e8, finding 2): a rejected
        canonical save must not advance library.json metadata either --
        saveSeason() used to call _touchMeta() unconditionally regardless of
        the canonical result. */
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
const URL = TEST_APP_URL;
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 300));

const result = await page.evaluate(async () => {
  // A fresh TauriBackend (the bundle declares it at top level). The real app keeps
  // its BrowserBackend; we only exercise this throwaway instance.
  window.__TAURI__ = { fs: { BaseDirectory: { AppData: 14, Document: 1 } } };
  const out = {};

  const makeBackend = (catalog) => {
    const be = new TauriBackend();
    const calls = { remove: [], lib: [{ id: 's1' }, { id: 's2' }] };
    be.fs = {
      exists: async () => true,
      readTextFile: async (p) => (p === be.LIB ? JSON.stringify(calls.lib) : '{}'),
      writeTextFile: async (p, txt) => { if (p === be.LIB) calls.lib = JSON.parse(txt); },
      remove: async (p) => { calls.remove.push(p); },
      mkdir: async () => {},
      writeFile: async () => {},
      readFile: async () => new Uint8Array(),
    };
    be.baseDir = 14; be.mirrorDir = undefined; be.currentId = 's1';
    be._catalog = catalog;          // bypass _ensureCatalog/_loadSqlEngine
    try { localStorage.setItem('ffa_sql_catalog', '1'); } catch (e) {}
    return { be, calls };
  };

  // 1. saveSeason propagates a canonical FAILURE.
  {
    const { be } = makeBackend({ saveSeason: async () => false, deleteSeason: async () => true });
    out.saveFalse = await be.saveSeason('s1', { id: 's1', games: [] });
  }
  // 1e. PC-1 (repair of Codex 4ae34e8 finding 2): a rejected canonical save
  //     must not advance library.json metadata either. Reproduced directly
  //     before this fix: saveSeason() called _touchMeta() unconditionally,
  //     regardless of the canonical result, so a rejected import's name/
  //     counts still landed in the library index.
  {
    const { be, calls } = makeBackend({ saveSeason: async () => false, deleteSeason: async () => true });
    const before = JSON.stringify(calls.lib);
    await be.saveSeason('s1', { id: 's1', seasonName: 'Rejected Import', games: [] });
    out.rejectedSaveLibUnchanged = JSON.stringify(calls.lib) === before;
    out.rejectedSaveLibBefore = before;
    out.rejectedSaveLibAfter = JSON.stringify(calls.lib);
  }
  // 1b. saveSeason reports success when the catalog succeeds.
  {
    const { be } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => true });
    out.saveTrue = await be.saveSeason('s1', { id: 's1', games: [] });
  }
  // 1c. An explicit destination and a mismatched payload id must never route
  //     to the catalog, regardless of what be.currentId happens to hold.
  {
    let calls = 0;
    const { be } = makeBackend({ saveSeason: async () => { calls++; return true; }, deleteSeason: async () => true });
    out.crossSave = await be.saveSeason('s1', { id: 's2', games: [] });
    out.crossSaveCalls = calls;
  }
  // 1d. PC-1: an INCORRECT ambient this.currentId must not be able to redirect
  //     the operation. be.currentId is deliberately set to a season neither the
  //     explicit destination nor the payload names; the explicit destination id
  //     alone must decide where the write lands.
  {
    let seenId = null;
    const { be } = makeBackend({ saveSeason: async (id) => { seenId = id; return true; }, deleteSeason: async () => true });
    be.currentId = 'WRONG-AMBIENT-SEASON';
    out.ambientSaveOk = await be.saveSeason('s1', { id: 's1', games: [] });
    out.ambientSaveSeenId = seenId;
  }
  // 2. deleteSeason RETAINS files + library entry AND returns false when the
  //    catalog delete fails (the false surfaces to a coach-facing toast upstream).
  {
    const { be, calls } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => false });
    out.delFailRet = await be.deleteSeason('s1');
    out.delFailRemoves = calls.remove.length;                 // must be 0
    out.delFailLibKept = calls.lib.some(s => s.id === 's1');   // must be true
  }
  // 2b. deleteSeason removes files + library entry AND returns true when durable.
  {
    const { be, calls } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => true });
    out.delOkRet = await be.deleteSeason('s1');
    out.delOkRemoves = calls.remove.length;                    // >= 1
    out.delOkLibDropped = !calls.lib.some(s => s.id === 's1');  // must be true
  }
  // 3. backup ring delegates to the catalog when flag-ON (restore-ring migration):
  //    createBackup returns the catalog id + meta; get/delete route by id shape;
  //    listBackups merges the db ring (no per-season backup JSON file needed).
  {
    let created = null;
    const ring = [];
    const cat = {
      saveSeason: async () => true, deleteSeason: async () => true,
      createBackup: async (id, data, label) => { created = { id, label, plays: (data.games || []).reduce((s, g) => s + (g.plays || []).length, 0) }; ring.push('bk_1'); return 'bk_1'; },
      listBackups: async () => ring.map(id => ({ id, t: '2026-07-12T00:00:00Z', label: 'pt', seasonName: '', games: 1, plays: 1 })),
      getBackup: async (id, bid) => (ring.includes(bid) ? { seasonName: 'restored', games: [] } : null),
      deleteBackup: async (id, bid) => { const i = ring.indexOf(bid); if (i >= 0) ring.splice(i, 1); },
    };
    const { be } = makeBackend(cat);
    // be.currentId is deliberately left at its makeBackend default ('s1') for
    // this positive case, but every call below passes 's1' EXPLICITLY -- the
    // ambient-pointer-cannot-redirect variant right after this one proves the
    // explicit id is what actually matters, not the ambient value agreeing.
    const meta = await be.createBackup('s1', { id: 's1', seasonName: 'X', games: [{ plays: [{}, {}] }] }, 'Point A');
    out.bkId = meta && meta.id;                       // 'bk_1'
    out.bkCatId = created && created.id;              // 's1'
    out.bkList = (await be.listBackups('s1')).some(b => b.id === 'bk_1');
    const got = await be.getBackup('s1', 'bk_1');
    out.bkGot = got && got.seasonName === 'restored';
    await be.deleteBackup('s1', 'bk_1');
    out.bkDeleted = ring.length === 0;
  }
  // 3b. PC-1: an incorrect ambient this.currentId must not redirect a backup
  //     read either -- getBackup('s2', ...) must reach the catalog scoped to
  //     's2' even though be.currentId is deliberately pinned to 's1'.
  {
    let seenScope = null;
    const cat = {
      saveSeason: async () => true, deleteSeason: async () => true,
      createBackup: async () => null, listBackups: async () => [],
      getBackup: async (id, bid) => { seenScope = id; return { seasonName: `restored-${id}`, games: [] }; },
      deleteBackup: async () => {},
    };
    const { be } = makeBackend(cat);   // makeBackend pins be.currentId = 's1'
    const got = await be.getBackup('s2', 'bk_1');
    out.ambientBkScope = seenScope;                 // must be 's2', not 's1'
    out.ambientBkName = got && got.seasonName;       // 'restored-s2'
  }
  // 4. PC-1 (repair of Codex 1aefe8b finding 1): writeDisk() must gate BOTH
  //    the snapshot backup and the Documents-mirror write on the canonical
  //    saveSeason() succeeding. Reproduced directly before this fix:
  //    writeDisk() called _mirrorToDocuments() unconditionally, so a
  //    REJECTED canonical save still landed the rejected payload in the
  //    recovery mirror. be.mirrorDir is given a distinct, defined baseDir
  //    value (1, vs be.baseDir=14) so mirror writes can be isolated from the
  //    unrelated library.json write by the baseDir they're tagged with.
  {
    const mirrorWrites = [];
    let catalogBackupCalled = false;
    const cat = {
      saveSeason: async () => false, deleteSeason: async () => true,
      createBackup: async () => { catalogBackupCalled = true; return 'bk_should_not_happen'; },
    };
    const { be } = makeBackend(cat);
    be.mirrorDir = 1;
    const origWriteTextFile = be.fs.writeTextFile;
    be.fs.writeTextFile = async (path, txt, opts) => { mirrorWrites.push({ path, baseDir: opts && opts.baseDir }); return origWriteTextFile(path, txt, opts); };
    out.writeDiskFailedRet = await be.writeDisk('s1', { id: 's1', games: [] }, { snapshot: true, label: 'test' });
    out.writeDiskFailedMirrorWrites = mirrorWrites.filter(w => w.baseDir === be.mirrorDir).length;
    out.writeDiskFailedCatalogBackup = catalogBackupCalled;
  }
  // 4b. The successful control -- writeDisk() DOES write the mirror when the
  //     canonical save genuinely succeeds, proving the gate above is not
  //     simply disabling the mirror unconditionally.
  {
    const mirrorWrites = [];
    const cat = { saveSeason: async () => true, deleteSeason: async () => true, createBackup: async () => 'bk_1' };
    const { be } = makeBackend(cat);
    be.mirrorDir = 1;
    const origWriteTextFile = be.fs.writeTextFile;
    be.fs.writeTextFile = async (path, txt, opts) => { mirrorWrites.push({ path, baseDir: opts && opts.baseDir }); return origWriteTextFile(path, txt, opts); };
    out.writeDiskOkRet = await be.writeDisk('s1', { id: 's1', games: [] }, { snapshot: false, label: 'test' });
    out.writeDiskOkMirrorWrites = mirrorWrites.filter(w => w.baseDir === be.mirrorDir).length;
  }
  // 5. PC-2 (Invariant #4/#5): when the catalog GENUINELY cannot be opened --
  //    not "no db file exists yet", but _ensureCatalog() itself returning
  //    null (the SQL engine failed to load) -- every identity-sensitive
  //    method fails CLOSED. No method may silently fall back to reading or
  //    writing any season.json/library.json sidecar as a substitute
  //    authority. Unlike sections 1-4b above, this does NOT bypass
  //    _ensureCatalog via be._catalog -- it forces the REAL init path to
  //    fail, so this exercises the actual guard this checkpoint changed.
  {
    const be = new TauriBackend();
    const fsCalls = [];
    be.fs = {
      exists: async (p) => { fsCalls.push(['exists', p]); return false; }, // no season.json / library.db on disk
      readTextFile: async (p) => { fsCalls.push(['readTextFile', p]); return '{}'; },
      writeTextFile: async (p) => { fsCalls.push(['writeTextFile', p]); },
      remove: async (p) => { fsCalls.push(['remove', p]); },
      mkdir: async () => {},
      writeFile: async (p) => { fsCalls.push(['writeFile', p]); },
      readFile: async () => new Uint8Array(),
    };
    be.baseDir = 14; be.mirrorDir = undefined; be.currentId = 's1';
    be._loadSqlEngine = async () => null; // simulate: the wasm resource genuinely failed to load
    try { localStorage.setItem('ffa_sql_catalog', '1'); } catch (e) {}

    let loadThrew = false, peekThrew = false;
    try { await be.loadSeason('s1'); } catch (e) { loadThrew = true; }
    try { await be.peekSeason('s1'); } catch (e) { peekThrew = true; }
    out.failClosedLoadThrows = loadThrew;
    out.failClosedPeekThrows = peekThrew;
    out.failClosedSaveRet = await be.saveSeason('s1', { id: 's1', seasonName: 'Should Never Persist', games: [] });
    out.failClosedDeleteRet = await be.deleteSeason('s1');
    out.failClosedTouchRet = await be.touchOpened('s1');
    out.failClosedBackupRet = await be.createBackup('s1', { id: 's1', games: [] }, 'x');
    // The decisive check: across every one of the six operations above, the
    // fake fs must never have been asked to write a season.json/library.json
    // sidecar as a substitute authority. A single writeTextFile/writeFile
    // targeting a season/library path would mean a fallback fired.
    out.failClosedNoSidecarWrites = fsCalls.filter(([op]) => op === 'writeTextFile' || op === 'writeFile').length;
    out.failClosedCalls = fsCalls.map(c => c[0]);
  }
  return out;
});

ok(result.saveFalse === false, 'saveSeason propagates a canonical db-write FAILURE (not reported as success)', JSON.stringify(result.saveFalse));
ok(result.rejectedSaveLibUnchanged === true, 'a rejected canonical save performs zero library.json metadata writes -- _touchMeta() is gated on the canonical result, not called unconditionally', JSON.stringify({ before: result.rejectedSaveLibBefore, after: result.rejectedSaveLibAfter }));
ok(result.saveTrue === true, 'saveSeason reports success when the catalog save succeeds');
ok(result.crossSave === false && result.crossSaveCalls === 0, 'an explicit destination id and a mismatched payload id are blocked before catalog or fallback writes', JSON.stringify(result));
ok(result.ambientSaveOk === true && result.ambientSaveSeenId === 's1', 'an incorrect ambient this.currentId cannot redirect saveSeason -- the explicit destination id alone chooses the target', JSON.stringify(result));
ok(result.delFailRemoves === 0 && result.delFailLibKept === true && result.delFailRet === false, 'a FAILED catalog delete retains files + library entry AND returns false (for a toast)', JSON.stringify(result));
ok(result.delOkRemoves >= 1 && result.delOkLibDropped === true && result.delOkRet === true, 'a DURABLE catalog delete removes files + library entry AND returns true');
ok(result.bkId === 'bk_1' && result.bkCatId === 's1' && result.bkList === true && result.bkGot === true && result.bkDeleted === true, 'backup ring delegates to the catalog (create/list/get/delete) with an explicit seasonId when flag-ON', JSON.stringify(result));
ok(result.ambientBkScope === 's2' && result.ambientBkName === 'restored-s2', 'an incorrect ambient this.currentId cannot redirect getBackup -- the explicit seasonId argument alone chooses the scope', JSON.stringify(result));
ok(result.writeDiskFailedRet === false && result.writeDiskFailedMirrorWrites === 0 && result.writeDiskFailedCatalogBackup === false,
  'writeDisk() gates the snapshot backup AND the Documents-mirror write on the canonical saveSeason() succeeding -- a rejected canonical save produces zero mirror/backup writes', JSON.stringify(result));
ok(result.writeDiskOkRet === true && result.writeDiskOkMirrorWrites === 1,
  'a SUCCESSFUL canonical save still writes exactly one Documents-mirror copy, proving the gate above is not simply disabling the mirror entirely', JSON.stringify(result));
ok(result.failClosedLoadThrows === true, 'PC-2: loadSeason() throws a visible failure when the catalog genuinely cannot be opened (no JSON fallback)', JSON.stringify(result.failClosedLoadThrows));
ok(result.failClosedPeekThrows === true, 'PC-2: peekSeason() throws a visible failure when the catalog genuinely cannot be opened (no JSON fallback)', JSON.stringify(result.failClosedPeekThrows));
ok(result.failClosedSaveRet === false, 'PC-2: saveSeason() refuses (false) when the catalog genuinely cannot be opened (no JSON fallback write)', JSON.stringify(result.failClosedSaveRet));
ok(result.failClosedDeleteRet === false, 'PC-2: deleteSeason() refuses (false) when the catalog genuinely cannot be opened', JSON.stringify(result.failClosedDeleteRet));
ok(result.failClosedTouchRet === false, 'PC-2: touchOpened() refuses (false) when the catalog genuinely cannot be opened', JSON.stringify(result.failClosedTouchRet));
ok(result.failClosedBackupRet === null, 'PC-2: createBackup() refuses (null) when the catalog genuinely cannot be opened (no legacy JSON restore-point file is created as a fallback)', JSON.stringify(result.failClosedBackupRet));
ok(result.failClosedNoSidecarWrites === 0, 'PC-2: none of the six fail-closed operations above ever wrote a season.json/library.json/backup-file sidecar as a substitute authority', JSON.stringify(result.failClosedCalls));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
