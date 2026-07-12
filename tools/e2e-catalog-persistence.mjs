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
  const state = { db: null, json: new Map(), mirror: new Map(), mirrorFail: false, writeDbFail: false };
  return {
    state,
    readDb: async () => state.db,
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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
