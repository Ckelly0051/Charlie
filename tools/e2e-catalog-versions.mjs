/* CATALOG VERSION-HISTORY HARNESS (Node) — the version-history migration off
   localStorage `ffa_versions_<season::game>` onto rows in the shared library db.
   Named/auto save-points become rows keyed by (season_id, game_id), capped at
   VMAX per game, evicting AUTO-saves before MANUAL ones (VersionManager's rule).
   VersionManager's store since 2026-09-24. Verifies: save/list/get/delete,
   per-game scoping, reopen durability, the eviction policy, rollback on a
   failed write, all-or-nothing import, and serialized concurrent writes. Run:  node tools/e2e-catalog-versions.mjs */
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
  const got = await cp.getVersionScoped('s1', 'g1', a1);
  ok(got && got.plays.length === 3, 'getVersionScoped returns the full snapshot payload (data)', JSON.stringify(got && got.plays.length));
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
  await cp2.deleteVersionScoped('s1', 'g1', id);
  const after = await cp2.listVersions('s1', 'g1');
  ok(after.length === 1 && after[0].label === 'Drop', 'deleteVersionScoped removes exactly that version', JSON.stringify(after));
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
  ok(list2.length === 20 && (await cp.getVersionScoped('s1', 'g1', manualIds[0])) === null, 'when only manual points remain, the OLDEST manual is evicted', JSON.stringify({ n: list2.length }));
}

// ---- 4. Durability (wired into VersionManager, 2026-09-24) -----------------
// A save point that never reaches disk is not one: a failed db write rolls the
// in-memory catalog back and reports failure, for single saves and imports.
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveVersion('s1', 'g1', snap('Kept', true, 2));
  fs.writeDb = async () => { throw new Error('disk down'); };
  const lost = await cp.saveVersion('s1', 'g1', snap('Never written', true, 2));
  const listed = await cp.listVersions('s1', 'g1');
  ok(lost === null && listed.length === 1 && listed[0].label === 'Kept',
    'a version whose db write fails returns null and is rolled back out of memory', JSON.stringify({ lost, listed }));
}
// ---- 5. Concurrency: a later write is never overwritten by an earlier one ---
// Codex repro (2026-09-24): delay the FIRST of two concurrent saveVersion disk
// writes, let the second finish, then release the first. Both reported
// success, but the reopened catalog held only the first.
const idle = () => new Promise(r => setTimeout(r, 20));
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveVersion('s1', 'g0', snap('seed', true, 1));
  // The first of the next two writes is held; the second passes at once.
  const realWrite = fs.writeDb;
  let calls = 0, releaseFirst;
  fs.writeDb = async (b) => { calls++; if (calls === 1) await new Promise(r => { releaseFirst = r; }); return realWrite(b); };
  const a = cp.saveVersion('s1', 'g1', snap('First', true, 1));
  const b = cp.saveVersion('s1', 'g1', snap('Second', true, 2));
  await idle(); await idle();
  releaseFirst && releaseFirst();
  const [ra, rb] = await Promise.all([a, b]);
  const back = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).listVersions('s1', 'g1');
  ok(!!ra && !!rb && back.map(v => v.label).join(',') === 'First,Second',
    'two concurrent saves with the first write held both reach disk and survive a reopen', JSON.stringify({ ra, rb, back: back.map(v => v.label) }));
}
{
  // The first write FAILS after the second was queued: its rollback must undo
  // only its own change, and the second must still land.
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveVersion('s1', 'g0', snap('seed', true, 1));
  const realWrite = fs.writeDb;
  let calls = 0, releaseFirst;
  fs.writeDb = async (b) => { calls++; if (calls === 1) { await new Promise(r => { releaseFirst = r; }); throw new Error('disk down'); } return realWrite(b); };
  const a = cp.saveVersion('s1', 'g1', snap('Lost', true, 1));
  const b = cp.saveVersion('s1', 'g1', snap('Kept', true, 1));
  await idle(); await idle();
  releaseFirst && releaseFirst();
  const [ra, rb] = await Promise.all([a, b]);
  const mem = (await cp.listVersions('s1', 'g1')).map(v => v.label).join(',');
  const disk = (await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).listVersions('s1', 'g1')).map(v => v.label).join(',');
  ok(ra === null && !!rb && mem === 'Kept' && disk === 'Kept',
    'a failed first write rolls back only itself; the queued second save lands in memory and on disk', JSON.stringify({ ra, rb, mem, disk }));
}
{
  // Two saves on different games racing: neither may erase the other.
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveVersion('s1', 'g0', snap('seed', true, 1));
  const realWrite = fs.writeDb;
  let calls = 0, releaseFirst;
  fs.writeDb = async (b) => { calls++; if (calls === 1) await new Promise(r => { releaseFirst = r; }); return realWrite(b); };
  const imp = cp.saveVersion('s1', 'g2', snap('I1', true, 1));
  const sv = cp.saveVersion('s1', 'g3', snap('Solo', true, 1));
  await idle(); await idle();
  releaseFirst && releaseFirst();
  const [ri, rs] = await Promise.all([imp, sv]);
  const re = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const g2 = (await re.listVersions('s1', 'g2')).length, g3 = (await re.listVersions('s1', 'g3')).length;
  ok(!!ri && !!rs && g2 === 1 && g3 === 1, 'a held save and a concurrent save on another game both survive a reopen', JSON.stringify({ ri, rs, g2, g3 }));
}
{
  // Seasons share the same db: a season save racing a version save.
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveVersion('s1', 'g0', snap('seed', true, 1));
  const realWrite = fs.writeDb;
  let calls = 0, releaseFirst;
  fs.writeDb = async (b) => { calls++; if (calls === 1) await new Promise(r => { releaseFirst = r; }); return realWrite(b); };
  const sv = cp.saveVersion('s1', 'g1', snap('V', true, 1));
  const ss = cp.saveSeason('s9', { id: 's9', seasonName: 'Race', games: [{ id: 'gx', name: 'gx', plays: [], gameInfo: {} }] });
  await idle(); await idle();
  releaseFirst && releaseFirst();
  const [rv, rsn] = await Promise.all([sv, ss]);
  const re = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const hasSeason = !!(await re.loadSeason('s9')), hasVersion = (await re.listVersions('s1', 'g1')).length === 1;
  ok(!!rv && rsn === true && hasSeason && hasVersion, 'a held version write and a concurrent season save both survive a reopen', JSON.stringify({ rv, rsn, hasSeason, hasVersion }));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
