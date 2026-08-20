import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* A3 TauriBackend delegation regression (Codex review, flag-ON failure paths).
   The flag-OFF 33/33 suite never exercises these because BrowserBackend is the
   headless default. Here we construct a TauriBackend in-page with a FAKE
   window.__TAURI__ fs + an INJECTED fake catalog, so the delegation contract is
   verified without the real wasm/desktop:
     1. saveSeason() must PROPAGATE the catalog's boolean — a canonical (db) write
        that returns false must NOT be reported as success.
     2. deleteSeason() must RETAIN the season.json / mirror / library entry when
        the catalog delete fails (else a stale db resurrects a season whose safety
        copies are gone), and only remove them when the delete is durable. */
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
    out.saveFalse = await be.saveSeason({ id: 's1', games: [] });
  }
  // 1b. saveSeason reports success when the catalog succeeds.
  {
    const { be } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => true });
    out.saveTrue = await be.saveSeason({ id: 's1', games: [] });
  }
  // 1c. A stale backend scope must never route a different season payload.
  {
    let calls = 0;
    const { be } = makeBackend({ saveSeason: async () => { calls++; return true; }, deleteSeason: async () => true });
    out.crossSave = await be.saveSeason({ id: 's2', games: [] });
    out.crossSaveCalls = calls;
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
    const meta = await be.createBackup({ id: 's1', seasonName: 'X', games: [{ plays: [{}, {}] }] }, 'Point A');
    out.bkId = meta && meta.id;                       // 'bk_1'
    out.bkCatId = created && created.id;              // 's1'
    out.bkList = (await be.listBackups()).some(b => b.id === 'bk_1');
    const got = await be.getBackup('bk_1');
    out.bkGot = got && got.seasonName === 'restored';
    await be.deleteBackup('bk_1');
    out.bkDeleted = ring.length === 0;
  }
  return out;
});

ok(result.saveFalse === false, 'saveSeason propagates a canonical db-write FAILURE (not reported as success)', JSON.stringify(result.saveFalse));
ok(result.saveTrue === true, 'saveSeason reports success when the catalog save succeeds');
ok(result.crossSave === false && result.crossSaveCalls === 0, 'cross-season payload is blocked before catalog or fallback writes', JSON.stringify(result));
ok(result.delFailRemoves === 0 && result.delFailLibKept === true && result.delFailRet === false, 'a FAILED catalog delete retains files + library entry AND returns false (for a toast)', JSON.stringify(result));
ok(result.delOkRemoves >= 1 && result.delOkLibDropped === true && result.delOkRet === true, 'a DURABLE catalog delete removes files + library entry AND returns true');
ok(result.bkId === 'bk_1' && result.bkCatId === 's1' && result.bkList === true && result.bkGot === true && result.bkDeleted === true, 'backup ring delegates to the catalog (create/list/get/delete) when flag-ON', JSON.stringify(result));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
