/* A3 DUAL-WRITE ORCHESTRATOR HARNESS (Node) --------------------------------
   Proves CatalogPersistence — the layer that makes the SQLite catalog the
   CANONICAL season store with JSON as a self-healing fallback — before any
   desktop wiring. Real sql.js + a fake in-memory fs, so the whole risky
   canonical-write path is verified here; the Tauri glue that supplies the real
   fs adapter + lazy-loads the wasm is the only piece left for a manual smoke.

   Checks: lossless db round-trip across a reopen; two seasons isolated in one
   shared db; a MISSING db falls back to season.json AND self-heals (re-migrates
   into the db so the next load is canonical); a CORRUPT db degrades to json
   without throwing; the Documents mirror is best-effort; a db-write failure
   surfaces false yet still leaves the json safety net; delete removes the season.

   Run:  node tools/e2e-catalog-persistence.mjs */
import initSqlJs from 'sql.js';
import assert from 'node:assert';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const clone = x => JSON.parse(JSON.stringify(x));
const deepEq = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } };

const SQL = await initSqlJs();

// ---- fake fs (one shared library db + per-season json + optional mirror) ----
function makeFs() {
  const state = { db: null, json: new Map(), mirror: new Map(), mirrorFail: false, writeDbFail: false, readDbFail: false };
  return {
    state,
    readDb: async () => { if (state.readDbFail) throw new Error('db read down'); return state.db; },
    writeDb: async (bytes) => { if (state.writeDbFail) throw new Error('db write down'); state.db = bytes.slice ? bytes.slice() : new Uint8Array(bytes); },
    readJson: async (id) => state.json.has(id) ? clone(state.json.get(id)) : null,
    writeJson: async (id, data) => { state.json.set(id, clone(data)); },
    writeMirror: async (id, data) => { if (state.mirrorFail) throw new Error('mirror down'); state.mirror.set(id, clone(data)); },
  };
}

// ---- fixtures (compact multi-game seasons with clips + plays) ----
const mkPlay = (i, clip) => ({ id: i, timestamp: { start: 0, end: 6 }, clipId: i, clipName: clip, clipPath: `Wk/${clip}`, notes: '', annotations: [], tags: { unit: i % 2 ? 'defense' : 'offense', down: String(1 + (i % 4)), distance: '10', formation: 'Shotgun + Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: String(i % 7), players: {}, grades: {}, custom: [] } });
const mkGame = (gid, n) => ({ id: gid, name: gid, gameInfo: { opponent: gid }, status: 'final', plays: Array.from({ length: n }, (_, i) => mkPlay(i + 1, `${gid}_${i + 1}.mp4`)), annotations: [], nextId: n + 1, currentPlayId: null, videoFileName: '', clipNames: Array.from({ length: n }, (_, i) => `${gid}_${i + 1}.mp4`), isMultiClip: true });
const season = (id, name, games) => ({ version: 5, type: 'season', id, seasonName: name, activeGameId: games[0].id, teamProfile: { teamName: name }, roster: [], games });
const seasonA = () => season('s1', 'Alpha', [mkGame('a1', 3), mkGame('a2', 2)]);
const seasonB = () => season('s2', 'Bravo', [mkGame('b1', 4)]);

// Reference: what a plain SqlCatalog round-trip yields for seasonA (isolates
// CatalogPersistence orchestration from catalog normalization).
async function refRoundTrip(obj) {
  const c = await new SqlCatalog(SQL).open();
  c.setCurrentSeason(obj.id); c.saveSeason(clone(obj));
  const out = c.loadSeason(obj.id); c.close(); return out;
}
const refA = await refRoundTrip(seasonA());

// ---- 1. lossless db round-trip across a reopen ----------------------------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const savedOk = await cp.saveSeason('s1', seasonA());
  ok(savedOk === true, 'saveSeason reports a successful canonical (db) write');
  ok(!!fs.state.db && fs.state.json.has('s1') && fs.state.mirror.has('s1'), 'save dual-writes db + season.json + Documents mirror');
  // Reopen as a fresh session sharing the same db bytes.
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const loaded = await cp2.loadSeason('s1');
  ok(loaded && loaded.source === 'db', 'load prefers the canonical db after a reopen', JSON.stringify(loaded?.source));
  ok(deepEq(loaded.data, refA), 'db load is lossless (equals a plain SqlCatalog round-trip)');
  ok(deepEq(clone(fs.state.json.get('s1')), loaded.data), 'the dual-written season.json equals the db-loaded season');
}

// ---- 2. two seasons isolated in one shared db -----------------------------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = await cp2.loadSeason('s1'), b = await cp2.loadSeason('s2');
  const aGames = a.data.games.map(g => g.id).sort(), bGames = b.data.games.map(g => g.id).sort();
  ok(JSON.stringify(aGames) === JSON.stringify(['a1', 'a2']) && JSON.stringify(bGames) === JSON.stringify(['b1']), 'two seasons coexist in one db with NO cross-season game bleed', JSON.stringify({ aGames, bGames }));
  ok(a.data.seasonName === 'Alpha' && b.data.seasonName === 'Bravo', 'each season reassembles its own identity');
}

// ---- 3. missing db -> json fallback + self-heal ---------------------------
{
  const fs = makeFs();
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  fs.state.db = null; // simulate a missing / not-yet-written db (flag just turned on)
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const first = await cp.loadSeason('s1');
  ok(first && first.source === 'json', 'a missing db falls back to season.json', JSON.stringify(first?.source));
  ok(deepEq(first.data.games.map(g => g.id), ['a1', 'a2']), 'json fallback returns the intact season');
  ok(!!fs.state.db, 'fallback SELF-HEALS: the season is re-migrated into the db');
  const second = await cp.loadSeason('s1');
  ok(second && second.source === 'db', 'the next load is canonical again (db) after self-heal', JSON.stringify(second?.source));
}

// ---- 4. corrupt db -> json fallback, no throw -----------------------------
{
  const fs = makeFs();
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // garbage bytes, not a valid sqlite file
  let threw = false, res = null;
  try { res = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1'); } catch (e) { threw = true; }
  ok(!threw && res && res.source === 'json', 'a corrupt db degrades to the json fallback without throwing', JSON.stringify({ threw, source: res?.source }));
}

// ---- 5. mirror failure is best-effort -------------------------------------
{
  const fs = makeFs();
  fs.state.mirrorFail = true;
  const okDb = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  ok(okDb === true && !!fs.state.db && fs.state.json.has('s1') && !fs.state.mirror.has('s1'), 'a Documents-mirror failure never blocks the canonical save');
}

// ---- 6. db-write failure surfaces false but keeps the json safety net ------
{
  const fs = makeFs();
  fs.state.writeDbFail = true;
  const okDb = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  ok(okDb === false && fs.state.json.has('s1') && !fs.state.db, 'a db-write failure returns false yet still writes the json fallback (no data loss)');
}

// ---- 7. delete removes the season -----------------------------------------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  await cp.deleteSeason('s1');
  fs.state.json.delete('s1'); // the caller (TauriBackend) removes the json/mirror files
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const gone = await cp2.loadSeason('s1'), kept = await cp2.loadSeason('s2');
  ok(gone === null, 'deleted season is absent from the db (no json resurrection once the caller clears it)');
  ok(kept && kept.data.seasonName === 'Bravo', 'delete leaves other seasons intact');
}

// ---- 8. increment-3 migration: existing season.json files -> shared db -----
{
  const fs = makeFs();
  // Simulate a pre-catalog install: two seasons on disk as season.json only, no db.
  fs.state.json.set('s1', clone(seasonA()));
  fs.state.json.set('s2', clone(seasonB()));
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const n = await cp.migrateJsonSeasons(['s1', 's2', 'missing']);
  ok(n === 2, 'migrate imports every existing season.json (skips a missing id)', String(n));
  ok(!!fs.state.db, 'migration writes the shared db once');
  // Both now load canonically from the db.
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = await cp2.loadSeason('s1'), b = await cp2.loadSeason('s2');
  ok(a && a.source === 'db' && b && b.source === 'db', 'migrated seasons load canonically from the db');
  ok(deepEq(a.data, refA), 'migrated season is lossless');
  // Idempotent: re-running migrates nothing and doesn't duplicate.
  const n2 = await cp2.migrateJsonSeasons(['s1', 's2']);
  const reload = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1');
  ok(n2 === 0 && reload.data.games.length === seasonA().games.length, 'migration is idempotent (no duplicate on re-run)');
}

// ---- 9. delete DB-write failure must NOT split-brain (Codex A3 review #2) ------
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  fs.state.writeDbFail = true;            // the canonical db write will fail on delete
  const res = await cp.deleteSeason('s1');
  ok(res === false, 'deleteSeason reports FAILURE when the canonical db write fails', String(res));
  // The on-disk db still has s1 (write failed) — the in-memory catalog must be
  // re-synced to disk so it isn't "deleted in memory / present on disk".
  ok(!!cp.catalog.loadSeason('s1'), 'in-memory catalog is restored on delete failure (no split-brain)');
  ok(fs.state.json.has('s1'), 'the JSON safety copy is retained on delete failure');
  // A fresh session opening the same (unchanged) db still sees s1 AND s2.
  fs.state.writeDbFail = false;
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = await cp2.loadSeason('s1'), b = await cp2.loadSeason('s2');
  ok(a && a.source === 'db' && b && b.source === 'db', 'a failed delete left both seasons canonical on disk');
  // A subsequent delete (db healthy) succeeds durably.
  const res2 = await cp2.deleteSeason('s1');
  fs.state.json.delete('s1');
  ok(res2 === true && (await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1')) === null, 'a retried delete succeeds durably once the db write recovers');
}

// ---- 10. delete rollback must survive writeDb AND readDb both failing --------
// (Codex A3 accept follow-up #1: snapshot-based rollback, not disk re-read.)
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  fs.state.writeDbFail = true;   // the delete's canonical write fails
  fs.state.readDbFail = true;    // AND the disk is momentarily unreadable
  const res = await cp.deleteSeason('s1');
  ok(res === false, 'deleteSeason still reports failure when writeDb AND readDb both fail', String(res));
  // Without a pre-delete snapshot the rollback would re-read the failing disk and
  // blank the WHOLE catalog; the snapshot keeps both seasons in memory.
  ok(!!cp.catalog.loadSeason('s1') && !!cp.catalog.loadSeason('s2'), 'both seasons remain in memory (snapshot rollback, no disk dependency)');
  // Disk recovers: a fresh session still sees both (on-disk db was never mutated).
  fs.state.writeDbFail = false; fs.state.readDbFail = false;
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  ok(!!(await cp2.loadSeason('s1')) && !!(await cp2.loadSeason('s2')), 'the on-disk db was never mutated by the failed delete');
}

// ---- 11. re-save must REPLACE, not accumulate (FK-cascade-off corruption) -----
// db.export() (the dual-write) resets PRAGMA foreign_keys OFF, so a DELETE that
// relies on cascade orphans plays/clips and they re-attach on the next save —
// doubling play rows on every autosave. Pin the fix (explicit child deletes).
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const twoPlay = () => season('s1', 'RS', [ { ...mkGame('g1', 2) } ]);
  for (let i = 1; i <= 4; i++) {
    await cp.saveSeason('s1', twoPlay());
    const r = await cp.loadSeason('s1');
    ok(r.data.games[0].plays.length === 2, `re-save #${i} keeps exactly 2 plays (no duplication)`, String(r.data.games[0].plays.length));
  }
  const raw = cp.catalog._all('SELECT count(*) n FROM plays')[0].n;
  ok(raw === 2, 'no orphaned play rows accumulate across re-saves', `raw rows=${raw}`);
  // Shrink then grow: replacement is exact both ways.
  await cp.saveSeason('s1', season('s1', 'RS', [{ ...mkGame('g1', 1) }]));
  ok((await cp.loadSeason('s1')).data.games[0].plays.length === 1, 're-save with FEWER plays shrinks exactly');
  await cp.saveSeason('s1', season('s1', 'RS', [{ ...mkGame('g1', 3) }]));
  ok((await cp.loadSeason('s1')).data.games[0].plays.length === 3, 're-save with MORE plays grows exactly');
}

// ---- 12. backup ring lives in the shared db (restore-ring migration) --------
// Restore points are rows in the library db (not per-season backup JSON files);
// create/list/get/delete + prune + durability across a reopen.
{
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  const b1 = await cp.createBackup('s1', seasonA(), 'First point');
  ok(!!b1, 'createBackup returns a restore-point id');
  ok(!!fs.state.db, 'a restore point is written to the shared db');
  const list = await cp.listBackups('s1');
  ok(list.length === 1 && list[0].label === 'First point' && list[0].games === 2, 'listBackups reports the restore point with meta', JSON.stringify(list[0]));
  const got = await cp.getBackup('s1', b1);
  ok(got && deepEq(got.games.map(g => g.id), ['a1', 'a2']), 'getBackup returns the full season snapshot');
  // Isolation: a backup on s2 never appears under s1.
  await cp.saveSeason('s2', seasonB());
  await cp.createBackup('s2', seasonB(), 'B point');
  ok((await cp.listBackups('s1')).length === 1 && (await cp.listBackups('s2')).length === 1, 'restore points are isolated per season');
  // Durability across a reopen (fresh session, same db bytes).
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  ok((await cp2.listBackups('s1'))[0].id === b1, 'restore points survive a reopen from the on-disk db');
  await cp2.deleteBackup('s1', b1);
  ok((await cp2.listBackups('s1')).length === 0, 'deleteBackup removes the restore point');
  // Prune to RETENTION (25): 27 points -> 25 newest kept.
  for (let i = 0; i < 27; i++) await cp2.createBackup('s1', season('s1', `v${i}`, [mkGame('a1', 1)]), `p${i}`);
  ok((await cp2.listBackups('s1')).length === 25, 'backup ring prunes to RETENTION (25)', String((await cp2.listBackups('s1')).length));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
