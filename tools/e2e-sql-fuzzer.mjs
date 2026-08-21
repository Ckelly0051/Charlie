/* SQLCATALOG INTEGRITY FUZZER (Node) — the SQLite analogue of e2e-integrity.mjs.
   Loads COPIES of the coach's real season (when present) + a synthetic multi-game
   season into a SqlCatalog, then fuzzes real ops (edit/add/remove play, add/remove
   game, switch active, mutate clip index, restore-from-backup) and after EVERY op
   re-checks the invariants that matter for a persistence layer:
     - ROUNDTRIP : loadSeason(saveSeason(truth)) deep-equals the JSON-normalized truth.
     - ISOLATION : mutating season A never changes season B's rows (multi-season).
     - INTEGRITY : zero orphan games/plays/clips (FK cascade holds).
     - NO-THROW  : no exception across any op or check.
   Seeded + reproducible; logs the op sequence on first violation.

   Run:  node tools/e2e-sql-fuzzer.mjs */
import initSqlJs from 'sql.js';
import assert from 'node:assert';
import fs from 'node:fs';
import { SqlCatalog } from '../js/sql-catalog.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const norm = x => JSON.parse(JSON.stringify(x));
const deepEq = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } };

const SQL = await initSqlJs();

// ---- fixtures ----
const mkPlay = (id, clip, gid) => ({
  id, timestamp: { start: 0, end: 8 + (id % 20) }, clipId: id, clipName: clip, clipPath: `${gid}/${clip}`,
  tags: { unit: ['offense', 'defense', 'special'][id % 3], down: String(1 + id % 4), distance: '10', formation: 'Shotgun', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: String(id % 9), players: {}, grades: {}, custom: [] },
  annotations: [], notes: id % 7 === 0 ? `n${id}` : '',
});
const mkClipRef = (clip, gid) => ({ id: `${gid}/${clip}`, originalName: `${clip}.MOV`, originalRelativePath: `${gid}/${clip}`, displayName: clip, duration: 11.1, importStatus: 'ready' });
const mkGame = (gid, n) => {
  const plays = Array.from({ length: n }, (_, i) => mkPlay(i + 1, `IMG_${gid}_${i + 1}`, gid));
  return { id: gid, name: `Game ${gid}`, status: 'active', gameInfo: { opponent: `Opp ${gid}` }, plays, annotations: [], nextId: n + 1, currentPlayId: 1, videoFileName: null, roster: [], version: 4, clipNames: plays.map(p => p.clipName), clipPaths: plays.map(p => p.clipPath), clipRefs: plays.map(p => mkClipRef(p.clipName, gid)), isMultiClip: true };
};
const mkSeason = (id, ng) => ({ version: 5, type: 'season', id, seasonName: id, team: 'Mavericks', year: '2025', level: 'JV', teamProfile: { teamName: 'Mavericks' }, roster: [], games: Array.from({ length: ng }, (_, i) => mkGame(`${id}G${i}`, 3 + i)), activeGameId: `${id}G0` });

// seeded RNG
const rng = (seed) => { let s = seed >>> 0; return () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; };

const integrityViolations = (cat) => {
  const q = sql => cat._get(sql).n;
  return q("SELECT COUNT(*) n FROM plays p LEFT JOIN games g ON p.game_id=g.id WHERE g.id IS NULL")
    + q("SELECT COUNT(*) n FROM clips c LEFT JOIN games g ON c.game_id=g.id WHERE g.id IS NULL")
    + q("SELECT COUNT(*) n FROM games g LEFT JOIN seasons s ON g.season_id=s.id WHERE s.id IS NULL");
};

async function campaign(seedTruthA, seedTruthB, seed, nOps) {
  const cat = new SqlCatalog(SQL); await cat.open();
  const A = norm(seedTruthA), B = norm(seedTruthB);
  cat.setCurrentSeason(A.id); cat.saveSeason(A);
  cat.setCurrentSeason(B.id); cat.saveSeason(B);
  const rnd = rng(seed); const ri = n => Math.floor(rnd() * n); const pick = a => a[ri(a.length)];
  const log = [];
  let uid = 100000;

  const check = (label) => {
    const bad = [];
    if (!deepEq(cat.loadSeason(A.id), norm(A))) bad.push('A roundtrip');
    if (!deepEq(cat.loadSeason(B.id), norm(B))) bad.push('B ISOLATION/roundtrip');
    if (integrityViolations(cat) !== 0) bad.push('orphan rows');
    if (bad.length) { console.log(`  FAIL  seed ${seed} after [${label}]: ${bad.join(', ')}\n    ops: ${log.join(' → ')}`); fail++; return false; }
    return true;
  };

  const ops = {
    editPlay() { const g = pick(A.games); if (!g.plays.length) return 'editPlay(skip)'; const p = pick(g.plays); p.tags.result = pick(['Gain', 'Loss', 'Touchdown', 'Incomplete']); p.tags.yardage = String(ri(30)); return 'editPlay'; },
    addPlay() { const g = pick(A.games); const id = g.nextId++; const clip = `IMG_new_${uid++}`; g.plays.push(mkPlay(id, clip, g.id)); g.clipRefs.push(mkClipRef(clip, g.id)); g.clipNames.push(clip); g.clipPaths.push(`${g.id}/${clip}`); return 'addPlay'; },
    removePlay() { const g = pick(A.games); if (!g.plays.length) return 'removePlay(skip)'; const i = ri(g.plays.length); const clip = g.plays[i].clipName; g.plays.splice(i, 1); const ci = g.clipRefs.findIndex(c => c.displayName === clip); if (ci >= 0) { g.clipRefs.splice(ci, 1); g.clipNames.splice(ci, 1); g.clipPaths.splice(ci, 1); } return 'removePlay'; },
    addGame() { const g = mkGame(`A_new${uid++}`, 2 + ri(4)); A.games.push(g); return 'addGame'; },
    removeGame() { if (A.games.length <= 1) return 'removeGame(skip)'; const i = ri(A.games.length); const removed = A.games.splice(i, 1)[0]; if (A.activeGameId === removed.id) A.activeGameId = A.games[0].id; return 'removeGame'; },
    setActive() { A.activeGameId = pick(A.games).id; return 'setActive'; },
    mutateClips() { const g = pick(A.games); if (g.clipRefs.length) { g.clipRefs[ri(g.clipRefs.length)].importStatus = pick(['ready', 'missing']); } return 'mutateClips'; },
    touchB() { const g = pick(B.games); if (g.plays.length) g.plays[0].notes = 'b' + ri(999); cat.setCurrentSeason(B.id); cat.saveSeason(B); cat.setCurrentSeason(A.id); return 'touchB'; },
  };

  for (let i = 0; i < nOps; i++) {
    cat.setCurrentSeason(A.id);
    const name = pick(Object.keys(ops));
    let tag;
    try { tag = ops[name](); } catch (e) { console.log(`  FAIL  seed ${seed} op ${name} threw: ${e.message}\n    ops: ${log.join(' → ')}`); fail++; cat.close(); return; }
    log.push(tag);
    try { cat.setCurrentSeason(A.id); cat.saveSeason(A); } catch (e) { console.log(`  FAIL  seed ${seed} saveSeason threw after ${tag}: ${e.message}`); fail++; cat.close(); return; }
    if (!check(tag)) { cat.close(); return; }
  }
  // restore-from-backup round-trips
  const bk = cat.createBackup(A.id, norm(A), 'fuzz point');
  const restored = cat.getBackup(A.id, bk);
  ok(deepEq(restored, norm(A)), `seed ${seed}: backup restore round-trips`);
  cat.close();
  pass++;
}

console.log('\nSqlCatalog integrity fuzzer -----------------------------------');
const real = fs.existsSync('C:/Users/charl/AppData/Roaming/com.gridironiq.app/seasons/2026-varsity-demo/season.json')
  ? (() => { const r = JSON.parse(fs.readFileSync('C:/Users/charl/AppData/Roaming/com.gridironiq.app/seasons/2026-varsity-demo/season.json', 'utf8')); r.id = r.id || '2026-varsity-demo'; return r; })()
  : null;

const seeds = [1, 2, 3, 4, 5, 6, 7, 8];
for (const seed of seeds) {
  const A = (real && seed % 2 === 0) ? { ...norm(real), id: 'realA' } : mkSeason('SA', 2 + (seed % 3));
  await campaign(A, mkSeason('SB', 2), seed, 40);
}
console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} campaigns clean, ${fail} failures`);
process.exit(fail === 0 ? 0 : 1);
