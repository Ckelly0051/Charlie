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
        the canonical result.
     6. PC-2 repair (Codex review 89e34c6, finding 2): scanRecoverableSeasons()/
        recoverSeasonFromMirror() must bind recovery identity to the snapshot's
        OWN declared seasonId, never coerce it to match whatever mirror folder
        it happened to be found under -- proven directly against the real
        implementations with a genuinely valid envelope whose declared identity
        disagrees with its folder.
     7. PC-2 repair (Codex review 89e34c6, finding 3): recoverSeasonFromMirror()
        must fail CLOSED when it cannot confirm whether the destination season
        already exists, never default to "no conflict" and proceed to save.
     8. PC-2 repair (Codex review d206b58, finding 1): recoverSeasonFromMirror()
        rejects EVERY invalid unwrap() result, including the disclosed
        'legacy-unenveloped' case, at the production boundary itself -- not
        just via a disabled Team Hub button -- with zero catalog writes.
     9. PC-5 dry-run finding (tools/pc5-real-catalog-dry-run.mjs, run against a
        copy of the real coach catalog, 2026-08-22): SeasonStore.snapshot()
        and StorageManager.saveNow() both call writeDisk({snapshot:true, ...})
        and then make a SEPARATE, immediate createBackup() call with the
        identical payload. writeDisk()'s own internal createBackup() call
        already creates that backup; the second call is an exact-duplicate
        JSON match, which the de-dup guard answered with `null` -- read by
        SeasonStore.snapshot()'s caller as "no backup was created", even
        though one genuinely was. Because diskStatus().bound is
        unconditionally true on TauriBackend, this fired on EVERY snapshot()
        call, and SeasonStore.restoreBackup()'s `if (!safetyId) return null;`
        guard made restore refuse to proceed every single time on the real
        desktop app. Fixed by caching the created backup's meta alongside the
        existing de-dup JSON cache and returning it (not null) on the
        identical-duplicate branch. */
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
  // 3c. PC-5 dry-run finding: an immediate duplicate createBackup() call for
  //     the identical (seasonId, data, label) -- exactly what writeDisk()
  //     ({snapshot:true}) followed by SeasonStore.snapshot()'s own trailing
  //     createBackup() call does, on every single snapshot() invocation when
  //     diskStatus().bound is true (unconditionally true on TauriBackend) --
  //     must return the SAME backup's meta, not null. Reproduced directly
  //     against a copy of the real coach catalog before this fix
  //     (tools/pc5-real-catalog-dry-run.mjs): snapshot() returned null on
  //     every call and restoreBackup()'s `if (!safetyId) return null;` guard
  //     made restore refuse to proceed on both real seasons, every time.
  {
    let catalogCalls = 0;
    const cat = {
      saveSeason: async () => true, deleteSeason: async () => true,
      createBackup: async () => { catalogCalls++; return `bk_dup_${catalogCalls}`; },
      listBackups: async () => [], getBackup: async () => null, deleteBackup: async () => {},
    };
    const { be } = makeBackend(cat);
    const data = { id: 's1', seasonName: 'X', games: [{ plays: [{}, {}] }] };
    const first = await be.createBackup('s1', data, 'Before restore');
    const second = await be.createBackup('s1', data, 'Before restore');   // identical call, same payload+label -- the writeDisk()-then-snapshot() collision
    out.dupBackupCatalogCalls = catalogCalls;              // must be 1 -- the duplicate must not create a second row
    out.dupBackupFirstId = first && first.id;
    out.dupBackupSecondId = second && second.id;            // must equal first.id, never null
    out.dupBackupSecondTruthy = !!second;
    // A genuinely NEW edit (different payload) afterward must still create a
    // real new backup -- the fix must not disable the de-dup guard entirely.
    const changedData = { ...data, games: [{ plays: [{}, {}, {}] }] };
    const third = await be.createBackup('s1', changedData, 'Before restore');
    out.dupBackupThirdCatalogCalls = catalogCalls;          // must be 2 -- genuinely different content still reaches the catalog
    out.dupBackupThirdDiffersFromFirst = third && third.id !== (first && first.id);
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
  // 6. PC-2 repair (Codex review 89e34c6, finding 2): recovery identity must be
  //    bound to the snapshot's OWN declared seasonId, never coerced to match
  //    whatever mirror folder it happened to be found under. Exercised
  //    directly against the real scanRecoverableSeasons()/
  //    recoverSeasonFromMirror() implementations, not a UI stub.
  {
    const mirrorRoot = 'GridIron IQ/seasons';
    const seasonAData = { id: 's-A', seasonName: 'Season A', games: [{ id: 'g1', plays: [{}] }] };
    const envelopeForA = SnapshotEnvelope.wrap('s-A', seasonAData); // internally valid: seasonId==='s-A', data.id==='s-A'
    const seasonCData = { id: 's-C', seasonName: 'Season C', games: [{ id: 'g1', plays: [{}, {}] }] };
    const envelopeForC = SnapshotEnvelope.wrap('s-C', seasonCData); // genuinely matches its own folder

    const files = new Map([
      // A season-A snapshot copied/renamed into season-B's mirror folder --
      // the file's OWN envelope still declares itself 's-A', never 's-B'.
      [`${mirrorRoot}/s-B/season.json`, JSON.stringify(envelopeForA)],
      // Positive control: a snapshot that genuinely matches its own folder.
      [`${mirrorRoot}/s-C/season.json`, JSON.stringify(envelopeForC)],
    ]);
    const be = new TauriBackend();
    be.fs = {
      exists: async (p) => p === mirrorRoot || files.has(p),
      readDir: async () => [{ name: 's-B', isDirectory: true }, { name: 's-C', isDirectory: true }],
      readTextFile: async (p) => (p === be.LIB ? '[]' : (files.get(p) || '{}')),
      writeTextFile: async () => {},
      remove: async () => {}, mkdir: async () => {}, writeFile: async () => {}, readFile: async () => new Uint8Array(),
    };
    be.baseDir = 14; be.mirrorDir = 1; be.currentId = null;
    const saveCalls = [];
    be._catalog = {
      saveSeason: async (id, data) => { saveCalls.push({ id, dataId: data.id }); return true; },
      deleteSeason: async () => true,
      listSeasons: async () => [],
    };

    const scan = await be.scanRecoverableSeasons();
    const mismatchRow = scan.find(c => c.id === 's-B');
    const matchRow = scan.find(c => c.id === 's-C');
    out.folderMismatchScanValid = mismatchRow && mismatchRow.valid;
    out.folderMismatchScanReason = mismatchRow && mismatchRow.reason;
    out.folderMatchScanValid = matchRow && matchRow.valid;

    out.folderMismatchRecover = await be.recoverSeasonFromMirror('s-B', {});
    out.folderMismatchSaveCallsAfterMismatch = saveCalls.length;   // must still be 0

    out.folderMatchRecover = await be.recoverSeasonFromMirror('s-C', {});
    out.folderMatchSaveCalls = saveCalls;                          // must record exactly the matching id
  }
  // 7. PC-2 repair (Codex review 89e34c6, finding 3): recoverSeasonFromMirror()
  //    must fail CLOSED when it cannot confirm whether the destination season
  //    already exists -- never default to "no conflict" and silently proceed
  //    to save, bypassing the required overwrite confirmation.
  {
    const mirrorRoot = 'GridIron IQ/seasons';
    const seasonDData = { id: 's-D', seasonName: 'Season D', games: [{ id: 'g1', plays: [{}] }] };
    const envelopeForD = SnapshotEnvelope.wrap('s-D', seasonDData);
    const files = new Map([[`${mirrorRoot}/s-D/season.json`, JSON.stringify(envelopeForD)]]);
    const be = new TauriBackend();
    be.fs = {
      exists: async (p) => files.has(p),
      readTextFile: async (p) => (p === be.LIB ? '[]' : (files.get(p) || '{}')),
      writeTextFile: async () => {},
      remove: async () => {}, mkdir: async () => {}, writeFile: async () => {}, readFile: async () => new Uint8Array(),
    };
    be.baseDir = 14; be.mirrorDir = 1; be.currentId = null;
    let saveCalled = false;
    be._catalog = {
      saveSeason: async () => { saveCalled = true; return true; },
      deleteSeason: async () => true,
      listSeasons: async () => { throw new Error('catalog listSeasons transiently failed'); },
    };
    out.existsCheckFailedResult = await be.recoverSeasonFromMirror('s-D', {});
    out.existsCheckFailedSaveCalled = saveCalled;
  }
  // 8. PC-2 repair (Codex review d206b58, finding 1): the production
  //    persistence boundary rejects EVERY !result.ok outcome, including the
  //    disclosed legacy-unenveloped case -- not just an invalid-checksum
  //    candidate. Disabling the Team Hub button is a UI convenience; this
  //    method is the boundary that actually protects the catalog from an
  //    unverified write, regardless of which caller invokes it. Exercised
  //    directly against the real recoverSeasonFromMirror(), never a UI mock.
  {
    const mirrorRoot = 'GridIron IQ/seasons';
    // A bare pre-PC-3 season.json: no envelopeVersion, no checksum, no
    // validated identity at all -- exactly what unwrap() classifies as
    // 'legacy-unenveloped'.
    const bareLegacySeason = { id: 's-E', seasonName: 'Old Format Season', games: [{ id: 'g1', plays: [{}, {}] }] };
    const files = new Map([[`${mirrorRoot}/s-E/season.json`, JSON.stringify(bareLegacySeason)]]);
    const be = new TauriBackend();
    be.fs = {
      exists: async (p) => files.has(p),
      readTextFile: async (p) => (p === be.LIB ? '[]' : (files.get(p) || '{}')),
      writeTextFile: async () => {},
      remove: async () => {}, mkdir: async () => {}, writeFile: async () => {}, readFile: async () => new Uint8Array(),
    };
    be.baseDir = 14; be.mirrorDir = 1; be.currentId = null;
    let saveCalled = false;
    be._catalog = {
      saveSeason: async () => { saveCalled = true; return true; },
      deleteSeason: async () => true,
      listSeasons: async () => [],
    };
    out.legacyRecoverResult = await be.recoverSeasonFromMirror('s-E', {});
    out.legacyRecoverSaveCalled = saveCalled;
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
ok(result.dupBackupCatalogCalls === 1 && result.dupBackupSecondTruthy === true && result.dupBackupSecondId === result.dupBackupFirstId,
  'PC-5 dry-run finding: an immediate duplicate createBackup() call for the identical (seasonId, data, label) -- the exact writeDisk()-then-snapshot() collision -- returns the SAME backup meta instead of null, without creating a second row', JSON.stringify(result));
ok(result.dupBackupThirdCatalogCalls === 2 && result.dupBackupThirdDiffersFromFirst === true,
  'the de-dup guard is not disabled outright -- a genuinely different edit afterward still reaches the catalog and produces a new backup id', JSON.stringify(result));
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
ok(result.folderMismatchScanValid === false && result.folderMismatchScanReason === 'folder-identity-mismatch', 'PC-2: scanRecoverableSeasons() refuses a snapshot whose OWN declared identity disagrees with the mirror folder it was found under, rather than reporting it as an importable candidate for that folder', JSON.stringify(result));
ok(result.folderMatchScanValid === true, 'PC-2: the positive control -- a snapshot that genuinely matches its own folder -- still scans as a valid candidate', JSON.stringify(result));
ok(result.folderMismatchRecover.ok === false && result.folderMismatchRecover.reason === 'folder-identity-mismatch' && result.folderMismatchSaveCallsAfterMismatch === 0, 'PC-2: recoverSeasonFromMirror() refuses the same folder-identity mismatch at the point of action -- zero catalog writes, identity is never coerced to match the requested folder', JSON.stringify(result));
ok(result.folderMatchRecover.ok === true && result.folderMatchSaveCalls.length === 1 && result.folderMatchSaveCalls[0].id === 's-C' && result.folderMatchSaveCalls[0].dataId === 's-C', 'PC-2: a genuinely folder-matching snapshot still recovers normally, proving the identity check above is not disabling recovery entirely', JSON.stringify(result));
ok(result.existsCheckFailedResult.ok === false && result.existsCheckFailedResult.reason === 'exists-check-failed' && result.existsCheckFailedSaveCalled === false, 'PC-2: a failed conflict check (listSeasons() throws) fails CLOSED -- recovery refuses and performs zero writes, rather than defaulting to "no conflict" and saving on the one-click path', JSON.stringify(result));
ok(result.legacyRecoverResult.ok === false && result.legacyRecoverResult.reason === 'legacy-unenveloped' && result.legacyRecoverSaveCalled === false, 'PC-2: recoverSeasonFromMirror() refuses a bare legacy-unenveloped snapshot at the production boundary itself, with zero catalog writes -- not merely a disabled UI button', JSON.stringify(result));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
