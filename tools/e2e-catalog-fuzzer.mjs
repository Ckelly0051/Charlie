/* CATALOG PERSISTENCE FUZZER (Node) — the lesson-#19 stress harness for the A3
   canonical store. Fuzzes RANDOM sequences of save / load / delete / migrate over
   many seasons in one shared library db, with injected disk faults (writeDb /
   readDb failures), and re-checks INVARIANTS after EVERY op:
     - LOSSLESS: every alive season loads with its exact game/play shape.
     - ISOLATION: no season's games/plays bleed into another (the corruption sig).
     - ATOMIC save failure (PC-1 repair, Codex review c51a12c/4ae34e8 finding 2):
       saveSeason returns false AND performs zero writes anywhere -- the season
       stays at whatever it was before the attempt (a prior version, or absent),
       never the rejected payload. This inverts the file's original invariant
       here ("the season is still loadable via the json safety copy" after a
       failed save) -- that described the exact bug: a faulted save used to
       still write the json fallback and leave the in-memory catalog committed
       to the rejected payload.
     - NO RESURRECTION on a failed delete: deleteSeason returns false, the season
       is retained (db + json kept), never half-deleted.
     - DURABLE delete removes it; a later reopen never revives it.
   Deterministic (fixed seeds) so a failure reproduces. Pure — no bundle, no DOM;
   exercises the ACCEPTED persistence code without changing it.

   Run:  node tools/e2e-catalog-fuzzer.mjs */
import initSqlJs from 'sql.js';
import assert from 'node:assert';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const clone = x => JSON.parse(JSON.stringify(x));
const SQL = await initSqlJs();

function makeFs() {
  const state = { db: null, json: new Map(), mirror: new Map(), writeDbFail: false, readDbFail: false };
  return {
    state,
    readDb: async () => { if (state.readDbFail) throw new Error('read down'); return state.db; },
    writeDb: async (b) => { if (state.writeDbFail) throw new Error('write down'); state.db = b.slice ? b.slice() : new Uint8Array(b); },
    readJson: async (id) => state.json.has(id) ? clone(state.json.get(id)) : null,
    writeJson: async (id, d) => { state.json.set(id, clone(d)); },
    writeMirror: async (id, d) => { state.mirror.set(id, clone(d)); },
  };
}
// A season with a random-ish but deterministic shape (id, N games, M plays each).
const mkPlay = i => ({ id: i, timestamp: { start: i, end: i + 5 }, clipName: `c${i}.mp4`, clipId: i, notes: '', annotations: [], tags: { unit: i % 2 ? 'defense' : 'offense', down: String(1 + (i % 4)), formation: 'Shotgun', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: String(i % 7), players: {}, grades: {}, custom: [] } });
const mkGame = (gid, n) => ({ id: gid, name: gid, gameInfo: { opponent: gid }, status: 'final', plays: Array.from({ length: n }, (_, i) => mkPlay(i + 1)), annotations: [], nextId: n + 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: true });
const mkSeason = (id, ver, g, p) => ({ version: 5, type: 'season', id, seasonName: `${id} v${ver}`, activeGameId: `${id}_g1`, teamProfile: { teamName: id }, roster: [], games: Array.from({ length: g }, (_, i) => mkGame(`${id}_g${i + 1}`, p + i)) });
const shape = data => data && { name: data.seasonName, games: data.games.map(g => ({ id: g.id, plays: (g.plays || []).length })) };

// TauriBackend.deleteSeason semantics: durable db delete -> also drop json/mirror; retained -> keep everything.
async function deleteFull(cp, fs, id) {
  const okDel = await cp.deleteSeason(id);
  if (okDel) { fs.state.json.delete(id); fs.state.mirror.delete(id); }
  return okDel;
}

// LCG for deterministic op streams.
function rng(seed) { let s = seed >>> 0; return () => (s = (s * 1664525 + 1013904223) >>> 0) / 2 ** 32; }

async function fuzzOne(seed, ops) {
  const fs = makeFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const rand = rng(seed);
  const ids = ['A', 'B', 'C', 'D'];
  const model = new Map();   // id -> expected shape (alive seasons)
  const ver = new Map();
  const log = [];

  const checkAll = async (where) => {
    for (const id of ids) {
      const r = await cp.loadSeason(id);
      const got = r ? shape(r.data) : null;
      const want = model.get(id) || null;
      assert.deepStrictEqual(got, want, `${where}: season ${id} mismatch\n got=${JSON.stringify(got)}\n want=${JSON.stringify(want)}`);
    }
    // ISOLATION: no game id appears under two different seasons.
    const owner = new Map();
    for (const id of ids) {
      const r = await cp.loadSeason(id);
      if (!r) continue;
      for (const g of r.data.games) {
        assert.ok(!owner.has(g.id) || owner.get(g.id) === id, `${where}: game ${g.id} bled across seasons`);
        owner.set(g.id, id);
      }
    }
  };

  for (let n = 0; n < ops; n++) {
    const id = ids[Math.floor(rand() * ids.length)];
    const op = rand();
    const fault = rand() < 0.18;   // sometimes the disk misbehaves for this op
    if (op < 0.5) {
      // SAVE (new version)
      const v = (ver.get(id) || 0) + 1; ver.set(id, v);
      const data = mkSeason(id, v, 1 + Math.floor(rand() * 3), 1 + Math.floor(rand() * 4));
      fs.state.writeDbFail = fault;
      const okSave = await cp.saveSeason(id, data);
      fs.state.writeDbFail = false;
      log.push(`op${n} SAVE ${id} v${v} fault=${fault} shape=${JSON.stringify(shape(data))}`);
      // PC-1 repair (Codex review c51a12c/4ae34e8, finding 2): a faulted save
      // is now ATOMIC -- CatalogPersistence.saveSeason() performs ZERO writes
      // anywhere (json, mirror, in-memory catalog) when writeDb() fails, and
      // rolls the in-memory catalog back to its pre-attempt snapshot. So the
      // model must stay at whatever it was BEFORE this attempt (a prior
      // successful shape, or absent if this is the season's first-ever save)
      // -- only a genuinely successful save advances it. This inverts the
      // prior assumption here ("whether the db write faulted or not... the
      // model advances to the new shape"), which described the exact bug:
      // a faulted save used to still write the json fallback and leave the
      // in-memory catalog committed to the rejected payload.
      if (!fault) model.set(id, shape(data));
      if (fault) assert.strictEqual(okSave, false, `seed ${seed} op ${n}: faulted save must report false`);
      else assert.strictEqual(okSave, true, `seed ${seed} op ${n}: clean save must report true`);
    } else if (op < 0.75) {
      // DELETE (full, TauriBackend semantics)
      fs.state.writeDbFail = fault;
      const okDel = await deleteFull(cp, fs, id);
      fs.state.writeDbFail = false;
      log.push(`op${n} DELETE ${id} fault=${fault} ok=${okDel}`);
      if (fault && model.has(id)) {
        assert.strictEqual(okDel, false, `seed ${seed} op ${n}: faulted delete must report false`);
        // retained: model unchanged (no resurrection worry — it was never removed)
      } else {
        model.delete(id);
      }
    } else if (op < 0.9) {
      // LOAD (read; occasionally with a transient read fault — must not corrupt)
      fs.state.readDbFail = fault;
      await cp.loadSeason(id);
      fs.state.readDbFail = false;
      log.push(`op${n} LOAD ${id} fault=${fault}`);
    } else {
      // MIGRATE (idempotent import of any json-only seasons) — must be a no-op here
      const nmig = await cp.migrateJsonSeasons(ids);
      log.push(`op${n} MIGRATE n=${nmig} json=${[...fs.state.json.keys()]}`);
    }
    try { await checkAll(`seed ${seed} op ${n}`); }
    catch (e) { console.error('OP LOG:\n' + log.slice(-12).join('\n')); throw e; }
  }
  // Final: reopen from the on-disk db (fresh session) and re-verify the durable set.
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  for (const id of ids) {
    const r = await cp2.loadSeason(id);
    const got = r ? shape(r.data) : null;
    // After reopen, a season present in json (dual-write safety) must still load;
    // a durably-deleted season (json removed) must be gone.
    if (fs.state.json.has(id)) assert.ok(got, `seed ${seed}: reopen lost season ${id} that still has a json copy`);
    else assert.strictEqual(got, null, `seed ${seed}: reopen revived durably-deleted season ${id}`);
  }
}

let seeds = 0, opsTotal = 0;
try {
  for (let seed = 1; seed <= 16; seed++) { await fuzzOne(seed, 40); seeds++; opsTotal += 40; }
  ok(true, `${seeds} seeds × 40 ops fuzzed clean (lossless + isolated + no-loss + no-resurrection, ${opsTotal} ops)`);
} catch (e) {
  ok(false, 'catalog fuzz invariants hold under random save/load/delete/migrate + disk faults', String(e.message).split('\n')[0]);
  console.error(e.message);
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
