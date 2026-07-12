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
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
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
  // 2. deleteSeason RETAINS files + library entry when the catalog delete fails.
  {
    const { be, calls } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => false });
    await be.deleteSeason('s1');
    out.delFailRemoves = calls.remove.length;                 // must be 0
    out.delFailLibKept = calls.lib.some(s => s.id === 's1');   // must be true
  }
  // 2b. deleteSeason removes files + library entry when the catalog delete is durable.
  {
    const { be, calls } = makeBackend({ saveSeason: async () => true, deleteSeason: async () => true });
    await be.deleteSeason('s1');
    out.delOkRemoves = calls.remove.length;                    // >= 1
    out.delOkLibDropped = !calls.lib.some(s => s.id === 's1');  // must be true
  }
  return out;
});

ok(result.saveFalse === false, 'saveSeason propagates a canonical db-write FAILURE (not reported as success)', JSON.stringify(result.saveFalse));
ok(result.saveTrue === true, 'saveSeason reports success when the catalog save succeeds');
ok(result.delFailRemoves === 0 && result.delFailLibKept === true, 'a FAILED catalog delete retains season.json + mirror + library entry (no resurrection)', JSON.stringify(result));
ok(result.delOkRemoves >= 1 && result.delOkLibDropped === true, 'a DURABLE catalog delete removes the season files + library entry');
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
