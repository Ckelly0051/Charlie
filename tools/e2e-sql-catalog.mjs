/* SQLCATALOG ROUND-TRIP HARNESS (Node) ------------------------------------
   Proves the SQLite persistence layer is LOSSLESS and structurally sound before
   it's wired into the app. sql.js runs the real schema + queries in Node, so the
   decompose→save→load→reassemble path is verified here (the desktop Tauri glue is
   the only piece that still needs a manual smoke test).

   Checks: open→migrate; save/load deep-equals the JSON-normalized season for a
   synthetic multi-game season AND the coach's real recovered season (when present);
   clips persist as first-class rows even for a game saved with NO clip arrays (the
   v1.10.7 wipe is now structurally impossible); persistence survives toBytes()→
   reopen; deleteSeason cascades; listSeasons/createSeason/backups behave.

   Run:  node tools/e2e-sql-catalog.mjs */
import initSqlJs from 'sql.js';
import assert from 'node:assert';
import fs from 'node:fs';
import { SqlCatalog } from '../js/sql-catalog.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const norm = x => JSON.parse(JSON.stringify(x));
const deepEq = (a, b) => { try { assert.deepStrictEqual(a, b); return true; } catch (e) { return false; } };

const SQL = await initSqlJs();

// ---- fixtures ----
const play = (i, clip) => ({
  id: i, timestamp: { start: 0, end: 10 + i * 0.5 },
  clipId: i, clipName: clip, clipPath: `Wk1/${clip}`,
  tags: { unit: i % 3 === 1 ? 'defense' : 'offense', down: String(1 + (i % 4)), distance: '10', formation: 'Shotgun + Trips', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: String(i % 9), players: {}, grades: {}, custom: [] },
  annotations: [], notes: i % 5 === 0 ? `note ${i}` : '',
});
const clipRef = (clip) => ({ id: `Wk1/${clip}`, originalName: `${clip}.MOV`, originalRelativePath: `Wk1/${clip}`, displayName: clip, duration: 12.5, importStatus: 'ready' });
const mkGame = (gid, n, withClips) => {
  const plays = Array.from({ length: n }, (_, i) => play(i + 1, `IMG_${gid}_${i + 1}`));
  return {
    id: gid, name: `Game ${gid}`, status: 'final', gameInfo: { opponent: `Opp ${gid}`, date: '2025-09-07' },
    plays, annotations: [{ t: 1, shape: 'line' }], nextId: n + 1, currentPlayId: 2,
    videoFileName: null, roster: [{ num: '5', name: 'A' }], version: 4,
    clipNames: withClips ? plays.map(p => p.clipName) : [],
    clipPaths: withClips ? plays.map(p => p.clipPath) : [],
    clipRefs: withClips ? plays.map(p => clipRef(p.clipName)) : [],
    isMultiClip: withClips,
  };
};
const synthetic = {
  version: 5, type: 'season', id: 'sea_synth', seasonName: 'Synthetic', team: 'Mavericks', year: '2025', level: 'JV',
  teamProfile: { teamName: 'Mavericks', jerseyColor: '#2f6bf0' }, roster: [{ num: '5', name: 'A', pos: 'RB' }],
  games: [mkGame('A', 6, true), mkGame('B', 4, true)], activeGameId: 'A',
};

console.log('\nSqlCatalog round-trip -----------------------------------------');
const cat = new SqlCatalog(SQL);
await cat.open();

// 1. round-trip (synthetic)
cat.setCurrentSeason('sea_synth');
cat.saveSeason(synthetic);
const back = cat.loadSeason('sea_synth');
ok(deepEq(back, norm(synthetic)), 'synthetic season round-trips losslessly',
  back ? `games ${back.games.length}/${synthetic.games.length}` : 'null');

// 2. clips are first-class rows
const clipRows = cat._get('SELECT COUNT(*) n FROM clips').n;
const playRows = cat._get('SELECT COUNT(*) n FROM plays').n;
ok(clipRows === 10, 'clips projected as rows (6+4)', `got ${clipRows}`);
ok(playRows === 10, 'plays stored as rows (6+4)', `got ${playRows}`);

// 3. the v1.10.7 scenario: a game saved with NO clip arrays but real plays
const noClipSeason = { ...norm(synthetic), id: 'sea_noclip', games: [mkGame('C', 5, false)], activeGameId: 'C' };
cat.setCurrentSeason('sea_noclip');
cat.saveSeason(noClipSeason);
const bn = cat.loadSeason('sea_noclip');
ok(deepEq(bn, norm(noClipSeason)), 'game with no clip arrays round-trips (plays intact)');
ok(bn.games[0].plays.length === 5, 'plays survive when film index is empty', `got ${bn && bn.games[0].plays.length}`);

// 4. persistence: export bytes → reopen → still round-trips
const bytes = cat.toBytes();
const cat2 = new SqlCatalog(SQL); await cat2.open(bytes);
ok(deepEq(cat2.loadSeason('sea_synth'), norm(synthetic)), 'round-trips after toBytes()→reopen (persistence)');

// 5. delete cascades
cat2.deleteSeason('sea_synth');
const gLeft = cat2._get('SELECT COUNT(*) n FROM games WHERE season_id = ?', ['sea_synth']).n;
const pLeft = cat2._get("SELECT COUNT(*) n FROM plays WHERE game_id IN ('A','B')").n;
const cLeft = cat2._get("SELECT COUNT(*) n FROM clips WHERE game_id IN ('A','B')").n;
ok(cat2.loadSeason('sea_synth') === null && gLeft === 0 && pLeft === 0 && cLeft === 0, 'deleteSeason cascades to games/plays/clips', `g${gLeft} p${pLeft} c${cLeft}`);

// 6. library ops + backups
const rec = cat2.createSeason({ name: 'Fresh', team: 'Mavericks', year: '2025', level: 'V' });
ok(rec && rec.id && cat2.listSeasons().some(s => s.id === rec.id && s.name === 'Fresh'), 'createSeason + listSeasons');
cat2.setCurrentSeason('sea_noclip');
const bkId = cat2.createBackup(norm(noClipSeason), 'test point');
ok(cat2.listBackups().some(b => b.id === bkId) && deepEq(cat2.getBackup(bkId), norm(noClipSeason)), 'backup ring create/list/get round-trips');

// 7. the coach's REAL recovered season (when present) — realistic round-trip
const REAL = 'C:/Users/charl/AppData/Roaming/com.gridironiq.app/seasons/2026-varsity-demo/season.json';
if (fs.existsSync(REAL)) {
  const real = JSON.parse(fs.readFileSync(REAL, 'utf8'));
  const cat3 = new SqlCatalog(SQL); await cat3.open();
  cat3.setCurrentSeason(real.id || '2026-varsity-demo');
  real.id = real.id || '2026-varsity-demo';
  cat3.saveSeason(real);
  const rb = cat3.loadSeason(real.id);
  ok(deepEq(rb, norm(real)), `REAL season round-trips (${real.games.length} games, ${SqlCatalog._countPlays(real)} plays)`,
    rb ? '' : 'null');
} else {
  console.log('  SKIP  real season fixture not present');
}

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
