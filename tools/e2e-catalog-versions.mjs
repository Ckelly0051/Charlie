/* CATALOG VERSION-HISTORY HARNESS (Node) — the version-history migration off
   localStorage `ffa_versions_<season::game>` onto rows in the shared library db.
   Named/auto save-points become rows keyed by (season_id, game_id), capped at
   VMAX per game, evicting AUTO-saves before MANUAL ones (VersionManager's rule).
   Pure module, NOT yet wired into VersionManager (dormant groundwork). Verifies:
   save/list/get/delete, per-game scoping, reopen durability, and the eviction
   policy. Run:  node tools/e2e-catalog-versions.mjs */
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const SQL = await initSqlJs();

// A VersionManager-shaped snapshot.
let seq = 0;
const snap = (label, manual, plays, data) => ({
  id: `${Date.now()}_${++seq}`, label, time: new Date(2026, 0, 1, 0, 0, seq).toISOString(),
  manual, playCount: plays, data: data || { plays: Array.from({ length: plays }, (_, i) => ({ id: i + 1 })) },
});

function makeFs() {
  const state = { db: null };
  return { state,
    readDb: async () => state.db,
    writeDb: async (b) => { state.db = b.slice ? b.slice() : new Uint8Array(b); },
    readJson: async () => null, writeJson: async () => {}, writeMirror: async () => {},
  };
}

// ---- 1. save / list / get + per-game scoping -------------------------------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a1 = await cp.saveVersion('s1', 'g1', snap('First', true, 3));
  await cp.saveVersion('s1', 'g1', snap('Auto', false, 4));
  await cp.saveVersion('s1', 'g2', snap('Other game', true, 9));
  ok(!!a1, 'saveVersion returns an id');
  ok(!!fs.state.db, 'a version is written to the shared db');
  const g1 = await cp.listVersions('s1', 'g1');
  const g2 = await cp.listVersions('s1', 'g2');
  ok(g1.length === 2 && g2.length === 1, 'versions are scoped per season::game (g1=2, g2=1)', JSON.stringify({ g1: g1.length, g2: g2.length }));
  ok(g1[0].label === 'First' && g1[0].manual === true, 'listVersions returns oldest-first with meta (label/manual/playCount)', JSON.stringify(g1[0]));
  const got = await cp.getVersion(a1);
  ok(got && got.plays.length === 3, 'getVersion returns the full snapshot payload (data)', JSON.stringify(got && got.plays.length));
}

// ---- 2. delete + reopen durability -----------------------------------------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const id = await cp.saveVersion('s1', 'g1', snap('Keep', true, 2));
  await cp.saveVersion('s1', 'g1', snap('Drop', false, 2));
  // Reopen a fresh session from the same db bytes.
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  ok((await cp2.listVersions('s1', 'g1')).length === 2, 'versions survive a reopen from the on-disk db');
  await cp2.deleteVersion(id);
  const after = await cp2.listVersions('s1', 'g1');
  ok(after.length === 1 && after[0].label === 'Drop', 'deleteVersion removes exactly that version', JSON.stringify(after));
}

// ---- 3. prune to VMAX, evicting AUTO-saves before MANUAL --------------------
{
  const fs = makeFs();
  const cat = new SqlCatalog(SQL); await cat.open();
  const cp = new CatalogPersistence({ catalog: cat, fs });
  // 5 manual points first, then 20 auto-saves → 25 total, cap 20 → drop 5.
  const manualIds = [];
  for (let i = 0; i < 5; i++) manualIds.push(await cp.saveVersion('s1', 'g1', snap(`M${i}`, true, 1)));
  for (let i = 0; i < 20; i++) await cp.saveVersion('s1', 'g1', snap(`A${i}`, false, 1));
  const list = await cp.listVersions('s1', 'g1');
  ok(list.length === 20, 'version ring caps at VMAX (20)', String(list.length));
  const manualsKept = list.filter(v => v.manual).length;
  ok(manualsKept === 5, 'the 5 MANUAL points all survive (auto-saves evicted first)', String(manualsKept));
  // Now overflow with manuals too: 20 more manual → must evict oldest manual.
  for (let i = 0; i < 20; i++) await cp.saveVersion('s1', 'g1', snap(`M2_${i}`, true, 1));
  const list2 = await cp.listVersions('s1', 'g1');
  ok(list2.length === 20 && (await cp.getVersion(manualIds[0])) === null, 'when only manual points remain, the OLDEST manual is evicted', JSON.stringify({ n: list2.length }));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
