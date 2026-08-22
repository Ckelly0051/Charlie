/* CATALOG PERSISTENCE HARNESS (Node) ----------------------------------------
   Proves CatalogPersistence — the layer that makes the SQLite catalog the
   ONLY canonical desktop season store (PC-2) — before any desktop wiring.
   Real sql.js + a fake in-memory fs, so the whole canonical-write path is
   verified here; the Tauri glue that supplies the real fs adapter + lazy-
   loads the wasm is the only piece left for a manual smoke.

   PC-2 (Convergence Plan Invariant #5): per-season app-data season.json is
   RETIRED as a live read/write authority. saveSeason()/reconcileFallbacks()
   never call fs.writeJson at all any more; loadSeason() never reads it as a
   fallback. The one surviving reader, fs.readJson, is used ONLY by
   migrateJsonSeasons() -- a one-time bootstrap of PRE-EXISTING legacy files,
   proven in section 8, untouched by this checkpoint. The Documents mirror
   survives as the sole sidecar, downgraded to a best-effort recovery
   SNAPSHOT that a normal load never reads back (Invariant #4/#6): a season
   absent from the db is genuinely unavailable, not "degrade to a weaker
   source".

   Checks: lossless db round-trip across a reopen; two seasons isolated in one
   shared db; a MISSING db returns null rather than resurrecting from a stale
   season.json (section 3); a CORRUPT db throws a VISIBLE failure rather than
   silently opening empty (section 4, PC-2 fix of Inventory Sec 3.0 -- the
   most severe finding on record); the mirror is best-effort; a db-write
   failure is ATOMIC (zero mirror/in-memory-catalog writes, and season.json
   is never touched by any path -- section 6); delete removes the season and
   the fake fs's writeJson is asserted to be called ZERO times across the
   entire run (the structural proof, not just per-assertion spot checks).

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

// ---- fake fs (one shared library db + legacy per-season json + optional mirror) ----
// `writeJson` remains DEFINED so a regression that reintroduces the call
// writes visibly into state.json/state.jsonWriteCalls instead of throwing
// "not a function" -- absence of writes is what proves PC-2, not absence of
// the interface. `jsonWriteCalls` is the cumulative structural proof: it
// must still read 0 at the very end of the file, across every section.
function makeFs() {
  const state = { db: null, json: new Map(), mirror: new Map(), mirrorFail: false, writeDbFail: false, readDbFail: false, jsonWriteCalls: 0 };
  return {
    state,
    readDb: async () => { if (state.readDbFail) throw new Error('db read down'); return state.db; },
    writeDb: async (bytes) => { if (state.writeDbFail) throw new Error('db write down'); state.db = bytes.slice ? bytes.slice() : new Uint8Array(bytes); },
    readJson: async (id) => state.json.has(id) ? clone(state.json.get(id)) : null,
    writeJson: async (id, data) => { state.jsonWriteCalls++; state.json.set(id, clone(data)); },
    writeMirror: async (id, data) => { if (state.mirrorFail) throw new Error('mirror down'); state.mirror.set(id, clone(data)); },
  };
}

// ---- fixtures (compact multi-game seasons with clips + plays) ----
const mkPlay = (i, clip) => ({ id: i, timestamp: { start: 0, end: 6 }, clipId: i, clipName: clip, clipPath: `Wk/${clip}`, notes: '', annotations: [], tags: { unit: i % 2 ? 'defense' : 'offense', down: String(1 + (i % 4)), distance: '10', formation: 'Shotgun + Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: String(i % 7), players: {}, grades: {}, custom: [] } });
const mkGame = (gid, n) => ({ id: gid, name: gid, gameInfo: { opponent: gid }, status: 'final', plays: Array.from({ length: n }, (_, i) => mkPlay(i + 1, `${gid}_${i + 1}.mp4`)), annotations: [], nextId: n + 1, currentPlayId: null, videoFileName: '', clipNames: Array.from({ length: n }, (_, i) => `${gid}_${i + 1}.mp4`), isMultiClip: true });
const season = (id, name, games) => ({ version: 5, type: 'season', id, seasonName: name, activeGameId: games[0].id, teamProfile: { teamName: name }, roster: [], games });
const seasonA = () => season('s1', 'Alpha', [mkGame('a1', 3), mkGame('a2', 2)]);
const seasonB = () => season('s2', 'Bravo', [mkGame('b1', 4)]);

// A single fs shared across the whole run, so jsonWriteCalls is the true
// cumulative count over every scenario below (sections make their own `fs`
// per block for isolation, so this is a SEPARATE accumulator recording
// whether ANY makeFs() instance anywhere in this file ever saw a write).
let anyJsonWriteEverSeen = false;
const trackFs = () => {
  const f = makeFs();
  const origWriteJson = f.writeJson;
  f.writeJson = async (...args) => { anyJsonWriteEverSeen = true; return origWriteJson(...args); };
  return f;
};

// Reference: what a plain SqlCatalog round-trip yields for seasonA (isolates
// CatalogPersistence orchestration from catalog normalization).
async function refRoundTrip(obj) {
  const c = await new SqlCatalog(SQL).open();
  c.setCurrentSeason(obj.id); c.saveSeason(clone(obj));
  const out = c.loadSeason(obj.id); c.close(); return out;
}
const refA = await refRoundTrip(seasonA());

// ---- 1. lossless db round-trip across a reopen; season.json never written -
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const savedOk = await cp.saveSeason('s1', seasonA());
  ok(savedOk === true, 'saveSeason reports a successful canonical (db) write');
  ok(!!fs.state.db && !fs.state.json.has('s1') && fs.state.mirror.has('s1'),
    'PC-2: save writes the canonical db + Documents mirror only -- season.json is never written',
    JSON.stringify({ db: !!fs.state.db, json: fs.state.json.has('s1'), mirror: fs.state.mirror.has('s1') }));
  // Reopen as a fresh session sharing the same db bytes.
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const loaded = await cp2.loadSeason('s1');
  ok(loaded && loaded.source === 'db', 'load is db-only', JSON.stringify(loaded?.source));
  ok(deepEq(loaded.data, refA), 'db load is lossless (equals a plain SqlCatalog round-trip)');
  ok(deepEq(clone(fs.state.mirror.get('s1')), loaded.data), 'the Documents mirror equals the db-loaded season');
}

// ---- 2. two seasons isolated in one shared db -----------------------------
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = await cp2.loadSeason('s1'), b = await cp2.loadSeason('s2');
  const aGames = a.data.games.map(g => g.id).sort(), bGames = b.data.games.map(g => g.id).sort();
  ok(JSON.stringify(aGames) === JSON.stringify(['a1', 'a2']) && JSON.stringify(bGames) === JSON.stringify(['b1']), 'two seasons coexist in one db with NO cross-season game bleed', JSON.stringify({ aGames, bGames }));
  ok(a.data.seasonName === 'Alpha' && b.data.seasonName === 'Bravo', 'each season reassembles its own identity');
}

// ---- 3. missing db -> genuinely unavailable, NOT resurrected from json ----
// PC-2 (Invariant #4/#5): a load that finds no matching db row must NOT
// silently resurrect a season from a stale season.json -- that is exactly
// the "JSON competing with the catalog for authority" pattern this
// checkpoint removes. Recovering a season whose db row is missing is now
// the explicit, previewed, confirmed PC-3 recovery flow (owned at the
// TauriBackend layer: scanRecoverableSeasons/recoverSeasonFromMirror),
// never an automatic side effect of an ordinary load.
{
  const fs = trackFs();
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  fs.state.json.set('s1', clone(seasonA())); // simulate a stale legacy season.json still sitting on disk
  fs.state.db = null; // simulate a missing / not-yet-written db (a wiped app-data dir)
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const result = await cp.loadSeason('s1');
  ok(result === null, 'a missing db returns null -- it is NOT resurrected from a stale season.json', JSON.stringify(result));
  ok(!fs.state.db, 'no self-heal write happens: the db is not silently repopulated from json on a normal load', String(!!fs.state.db));
}

// ---- 4. corrupt db MUST throw a visible failure, never silently open empty -
// PC-2 fix of Inventory Sec 3.0, the most severe finding on record: a
// db.open() failure on real corrupt bytes previously fell through to a
// fresh EMPTY db with no exception, so a season with intact bytes on disk
// could be silently reported as "no seasons" -- exactly what Invariant #4
// ("if it cannot initialize, the desktop app fails closed") forbids.
{
  const fs = trackFs();
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  fs.state.db = new Uint8Array([1, 2, 3, 4, 5]); // garbage bytes, not a valid sqlite file
  let threw = false;
  try { await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1'); }
  catch (e) { threw = true; }
  ok(threw, 'a corrupt on-disk db surfaces a VISIBLE failure (throws) instead of silently opening empty');
}

// ---- 4b. a READ FAILURE on an EXISTING db is not the same as "no bytes ever
// existed" -- it too must throw, never silently collapse to a fresh empty
// catalog (PC-2 repair, Codex review 89e34c6, finding 1). Section 4 above
// proves corrupt BYTES throw once catalog.open() sees them; this proves the
// read itself failing (a locked file, a permission error, a transient disk
// fault on a genuinely-existing db) must ALSO throw, never be silently
// swallowed into "there is no db" -- exactly the class of failure Inventory
// Sec 3.0 was originally about, one layer earlier than where it was closed.
{
  const fs = trackFs();
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  fs.state.readDbFail = true;   // the db genuinely exists on disk (state.db is set); reading it fails
  let threw = false;
  try { await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1'); }
  catch (e) { threw = true; }
  ok(threw, 'a db read failure on a genuinely-existing db surfaces a VISIBLE failure (throws), the same as corrupt bytes -- never silently opens empty', String(threw));

  // Control: once the read genuinely recovers, the season is still intact --
  // proving the throw above lost nothing, it only refused to silently
  // substitute an empty catalog while the read was failing.
  fs.state.readDbFail = false;
  const recovered = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1');
  ok(recovered && recovered.data.seasonName === 'Alpha', 'once the disk read recovers, the season is intact', JSON.stringify(recovered && recovered.data.seasonName));
}

// ---- 4c. PC-4: the monotonic revision survives the canonical SQLite round trip
// The desktop path reconstructs a season from columns plus a `body_json` blob.
// If `revision` were dropped there, the persisted sequence would silently reset
// on every desktop reload and the durable half of PC-4's fence would be inert --
// a failure that looks identical to working code from SeasonStore's side, and
// that section 1's round-trip check cannot see (it compares against a reference
// SqlCatalog round trip, so a field dropped by BOTH sides compares equal).
{
  const fs = trackFs();
  const withRevision = seasonA();
  withRevision.revision = 137;
  await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', withRevision);
  const reopened = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1');
  ok(reopened && reopened.data.revision === 137,
    'PC-4: the season-level monotonic revision survives a canonical SQLite save/reopen, so the durable fence is not silently reset on every desktop reload',
    JSON.stringify(reopened && reopened.data.revision));
}

// ---- 5. mirror failure is best-effort; season.json still never written ----
{
  const fs = trackFs();
  fs.state.mirrorFail = true;
  const okDb = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).saveSeason('s1', seasonA());
  ok(okDb === true && !!fs.state.db && !fs.state.json.has('s1') && !fs.state.mirror.has('s1'),
    'a Documents-mirror failure never blocks the canonical save; season.json is never written either way');
}

// ---- 6. db-write failure is ATOMIC: zero mirror/in-memory writes ----------
// A rejected canonical write must produce ZERO writes anywhere: not the
// Documents mirror, and the in-memory catalog itself must roll back rather
// than staying committed to the rejected payload (which a same-session load
// could read straight back out of memory, even with disk completely
// untouched).
{
  const fs = trackFs();
  fs.state.writeDbFail = true;
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const okDb = await cp.saveSeason('s1', seasonA());
  ok(okDb === false, 'a db-write failure returns false', String(okDb));
  ok(!fs.state.db, 'no db bytes were written on a db-write failure');
  ok(!fs.state.mirror.has('s1'),
    'a db-write failure performs ZERO writes to the Documents mirror',
    JSON.stringify([...fs.state.mirror.keys()]));

  // The in-memory catalog must not diverge from disk either. Flip the
  // failure off and load on the SAME instance: since s1 was never actually
  // saved, this must return null, not the staged-then-rejected payload.
  fs.state.writeDbFail = false;
  const reload = await cp.loadSeason('s1');
  ok(reload === null,
    'the in-memory catalog rolls back on a writeDb failure -- a later load on the same instance never reads the rejected payload back out of memory',
    JSON.stringify(reload));

  // Successful control, fresh instance: the same mechanism genuinely writes
  // the mirror once the canonical save legitimately succeeds, proving the
  // gate above is not simply disabling the sidecar write entirely.
  const fs2 = trackFs();
  const okDb2 = await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs: fs2 }).saveSeason('s2', seasonB());
  ok(okDb2 === true && !fs2.state.json.has('s2') && fs2.state.mirror.has('s2'),
    'a successful canonical save writes the mirror only -- season.json is never written', JSON.stringify({ okDb2, json: fs2.state.json.has('s2'), mirror: fs2.state.mirror.has('s2') }));
}

// ---- 7. delete removes the season -----------------------------------------
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  await cp.deleteSeason('s1');
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const gone = await cp2.loadSeason('s1'), kept = await cp2.loadSeason('s2');
  ok(gone === null, 'deleted season is absent from the db');
  ok(kept && kept.data.seasonName === 'Bravo', 'delete leaves other seasons intact');
}

// ---- 8. increment-3 migration: existing season.json files -> shared db -----
// UNCHANGED by PC-2: this is the one-time legacy bootstrap read, still using
// fs.readJson exactly as before -- explicitly the surviving exception to the
// "no live json authority" rule (it consumes pre-existing files once, then
// never needs them again).
{
  const fs = trackFs();
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
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  await cp.saveSeason('s2', seasonB());
  fs.state.writeDbFail = true;            // the canonical db write will fail on delete
  const res = await cp.deleteSeason('s1');
  ok(res === false, 'deleteSeason reports FAILURE when the canonical db write fails', String(res));
  // The on-disk db still has s1 (write failed) — the in-memory catalog must be
  // re-synced to disk so it isn't "deleted in memory / present on disk".
  ok(!!cp.catalog.loadSeason('s1'), 'in-memory catalog is restored on delete failure (no split-brain)');
  ok(fs.state.mirror.has('s1'), 'the Documents mirror safety copy is retained on delete failure');
  // A fresh session opening the same (unchanged) db still sees s1 AND s2.
  fs.state.writeDbFail = false;
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = await cp2.loadSeason('s1'), b = await cp2.loadSeason('s2');
  ok(a && a.source === 'db' && b && b.source === 'db', 'a failed delete left both seasons canonical on disk');
  // A subsequent delete (db healthy) succeeds durably.
  const res2 = await cp2.deleteSeason('s1');
  ok(res2 === true && (await new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs }).loadSeason('s1')) === null, 'a retried delete succeeds durably once the db write recovers');
}

// ---- 10. delete rollback must survive writeDb AND readDb both failing --------
// (Codex A3 accept follow-up #1: snapshot-based rollback, not disk re-read.)
{
  const fs = trackFs();
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
  const fs = trackFs();
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
  const fs = trackFs();
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

// ---- 13. C2: a LINKED game's filmMode/filmDir survive the canonical store ---
// The Refuge failure was a linked game that "played" but persisted as managed.
// This pins the canonical desktop path: a game linked to a D: child folder must
// round-trip filmMode='linked' + filmDir through the REAL SqlCatalog db AND the
// Documents mirror, in a mixed linked/managed season, with per-game isolation.
// If the catalog dropped these fields (the suspected root cause) this reds.
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const refuge = { ...mkGame('refuge', 2), filmMode: 'linked', filmDir: 'Refuge 7-13' };
  const managed = { ...mkGame('nd-prep', 2) }; // no filmMode -> managed by default
  const mixed = season('s-film', 'Film Truth', [refuge, managed]);
  ok(await cp.saveSeason('s-film', mixed) === true, 'C2: canonical save of a mixed linked/managed season succeeds');
  // The Documents mirror carries the linked metadata immediately (before any reopen).
  const mirrorRefuge = fs.state.mirror.get('s-film')?.games.find(g => g.id === 'refuge');
  ok(mirrorRefuge?.filmMode === 'linked' && mirrorRefuge?.filmDir === 'Refuge 7-13',
    'C2: filmMode/filmDir are written to the Documents mirror safety copy on success', JSON.stringify(mirrorRefuge && { m: mirrorRefuge.filmMode, d: mirrorRefuge.filmDir }));
  // Reopen from the on-disk db (fresh session, canonical path).
  const cp2 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const loaded = await cp2.loadSeason('s-film');
  ok(loaded?.source === 'db', 'C2: mixed season reopens from the canonical db', JSON.stringify(loaded?.source));
  const dbRefuge = loaded.data.games.find(g => g.id === 'refuge');
  const dbManaged = loaded.data.games.find(g => g.id === 'nd-prep');
  ok(dbRefuge?.filmMode === 'linked' && dbRefuge?.filmDir === 'Refuge 7-13',
    'C2: the LINKED game reopens from the db still linked to its D: child folder (no silent downgrade to managed)', JSON.stringify(dbRefuge && { m: dbRefuge.filmMode, d: dbRefuge.filmDir }));
  ok((dbManaged?.filmMode == null || dbManaged.filmMode === 'managed') && dbManaged?.filmDir == null,
    'C2: the managed game stays managed — linked metadata does not bleed across games', JSON.stringify(dbManaged && { m: dbManaged.filmMode, d: dbManaged.filmDir }));
  // PC-2: a missing db is now genuinely unavailable, not a silent downgrade
  // to managed AND not a resurrection from any sidecar -- proves the C2
  // guarantee survives the removal of the json self-heal path.
  fs.state.db = null;
  const cp3 = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const afterWipe = await cp3.loadSeason('s-film');
  ok(afterWipe === null, 'C2: a missing db reports the season as unavailable -- it never silently downgrades linked film to managed', JSON.stringify(afterWipe));
}

// ---- 14. Cross-season destination/payload mismatch fails before ALL writes --
// Exact field incident: a stale backend currentId pointed at JV while the live
// payload was Varsity. The old code saved Varsity in SQLite but overwrote JV's
// season.json and library metadata. No store may receive a byte on mismatch.
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  await cp.saveSeason('s1', seasonA());
  const dbBefore = Array.from(fs.state.db || []);
  const mirrorBefore = clone(fs.state.mirror.get('s1'));
  const mismatch = await cp.saveSeason('s1', seasonB());
  ok(mismatch === false, 'cross-season save is rejected');
  ok(deepEq(Array.from(fs.state.db || []), dbBefore), 'rejected save writes zero canonical db bytes');
  ok(deepEq(fs.state.mirror.get('s1'), mirrorBefore) && !fs.state.mirror.has('s2'), 'rejected save writes zero mirror bytes');
  ok(!fs.state.json.has('s1') && !fs.state.json.has('s2'), 'rejected save writes zero json bytes (season.json is never written by any path)');
}

// ---- 15. reconcileFallbacks() rewrites the mirror from canonical truth ------
// PC-2: reconcileFallbacks() no longer repairs a misrouted season.json (that
// interface is gone); it now repairs the Documents MIRROR the same way --
// proving reconciliation still exists as a genuine catalog-is-truth guard,
// just retargeted to the one surviving sidecar.
{
  const fs = trackFs();
  const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs });
  const a = seasonA(); a.teamId = 'jv-team';
  await cp.saveSeason('s1', a);
  fs.state.mirror.set('s1', clone(seasonB())); // recreate the field corruption, now on the mirror
  const metas = await cp.reconcileFallbacks();
  ok(metas.some(m => m.id === 's1' && m.teamId === 'jv-team'), 'canonical season list preserves teamId for Team Hub filtering');
  ok(fs.state.mirror.get('s1')?.id === 's1' && fs.state.mirror.get('s1')?.seasonName === 'Alpha', 'catalog reconciliation repairs a cross-wired Documents mirror');
  ok(!fs.state.json.has('s1'), 'reconciliation writes zero season.json bytes');
}

// ---- 16. STRUCTURAL PROOF: fs.writeJson is never invoked anywhere in this file
// The strongest form of the PC-2 removal: not "every spot check we thought to
// write passed", but "the interface method was literally never called" across
// EVERY scenario above, including failure paths, migrations, and repairs.
ok(anyJsonWriteEverSeen === false, 'fs.writeJson was never called by ANY CatalogPersistence operation across the entire run (structural proof, not per-assertion)');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
