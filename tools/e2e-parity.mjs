/* ANALYTICS PARITY HARNESS (redesign Phase 0, P0-a) — the release gate for the
   Study/registry work: "no lost metric, no changed denominator, no lost film link."
   It captures a GOLDEN snapshot of the current production analytics for a fixture
   season:
     - every measure block from StatsEngine.compute() (numbers), with any
       array-of-plays reduced to a SORTED play-ID set (so both the numbers AND the
       matching-play sets embedded in the stats are pinned);
     - the matching play IDs for every drilldown dimension _buildCutFilter exposes
       (the video-link contract — a Study row must return the SAME play set as the
       old report row);
     - the structured scout / self-scout / defensive-scout report objects.

   Usage:
     node tools/e2e-parity.mjs --update   # (re)write the golden baselines
     node tools/e2e-parity.mjs            # re-capture + diff vs golden; fail on drift

   The golden files live in tools/parity-golden/<fixture>.json and are committed,
   so ANY future analytics change (incl. the metric registry / Study query engine)
   is checked against them. When the registry lands, its query output is asserted
   equal to these same snapshots — that is how parity is proven before Study ships. */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const UPDATE = process.argv.includes('--update');
const GOLDEN_DIR = fileURLToPath(new URL('./parity-golden/', import.meta.url));
const goldenPath = name => path.join(GOLDEN_DIR, `${name}.json`);

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

// ---- fixtures -------------------------------------------------------------
const REAL = 'C:/Users/charl/Downloads/GridIronIQ-mavericks-2025-RECOVERED.json';
function syntheticEdge() {
  // Covers parity-contract §4: offense/defense/ST, multi-value play type + result,
  // formation/backfield/strength/personnel/motion, fronts/coverage/blitz, player
  // attribution + shared tackles + grades, EPA/conversions/explosive/TO/scoring,
  // a min-sample formation, a custom field, and an untagged/empty play.
  const P = [];
  let id = 1;
  const mk = (t) => ({ id: id++, timestamp: { start: 0, end: 6 }, notes: '', annotations: [], tags: Object.assign({ unit: 'offense', custom: [], players: {}, grades: {} }, t) });
  // offense — a run-heavy Shotgun/Trips tell + an explosive + a TD + a turnover
  for (let i = 0; i < 6; i++) P.push(mk({ down: '1', distance: '10', formation: 'Shotgun + Trips', backfield: 'Single', strength: 'Right', personnel: '11', motion: i % 2 ? 'Jet' : '', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', playDir: 'Right', hash: 'Middle', fieldSide: 'own', yardLine: '25', players: { ballCarrier: '22' }, grades: { ballCarrier: 1 } }));
  P.push(mk({ down: '2', distance: '5', formation: 'Empty', personnel: '10', playType: 'Deep Pass', runPass: 'Pass', result: 'Gain + Touchdown', yardage: '48', playDir: 'Left', hash: 'Left', fieldSide: 'opp', yardLine: '48', players: { passer: '12', receiver: '80' }, grades: { passer: 2, receiver: 2 } }));
  P.push(mk({ down: '3', distance: '9', formation: 'Shotgun + Trips', personnel: '11', playType: 'RPO + Short Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { passer: '12' } }));
  // a min-sample formation (n=1)
  P.push(mk({ down: '1', distance: '10', formation: 'Wildcat', personnel: '21', playType: 'Run Outside', runPass: 'Run', result: 'Loss', yardage: '3', playDir: 'Right' }));
  // a play with a custom field
  P.push(mk({ down: '2', distance: '7', formation: 'Under Center', personnel: '12', playType: 'Play Action', runPass: 'Pass', result: 'Gain', yardage: '11', custom: ['BOOT'], customFields: { edge: 'Wide' } }));
  // defense — fronts / coverage / blitz + shared tackle + a sack
  for (let i = 0; i < 5; i++) P.push(mk({ unit: 'defense', down: '1', distance: '10', defFront: i % 2 ? '4-3 + Jumbo Shift' : '3-4', coverage: 'Cover 3', blitz: i % 2 ? 'A-Gap + Edge' : '', playType: 'Short Pass', runPass: 'Pass', result: i === 0 ? 'Sack' : 'No Gain', yardage: i === 0 ? '-6' : '2', players: { tackler: i === 0 ? '55' : '55, 22' } }));
  // special teams — a punt + a made FG
  P.push(mk({ unit: 'special', stType: 'Punt', kickOutcome: 'Downed', kickDistance: '42', hangTime: '4.1', kickedTo: '15', players: { kicker: '19' } }));
  P.push(mk({ unit: 'special', stType: 'Field Goal', kickOutcome: 'Good', kickDistance: '37', result: 'Good', players: { kicker: '19' } }));
  // an untagged / empty play (min-data)
  P.push(mk({}));
  const game = (gid, opp, plays) => ({ id: gid, name: opp, gameInfo: { opponent: opp, date: `2025-09-0${gid.slice(-1)}` }, status: 'final', plays, annotations: [], nextId: id, currentPlayId: null, videoFileName: '', clipNames: plays.map(p => `${gid}_${p.id}`), isMultiClip: true });
  // clip names per play so film-link sets are meaningful
  P.forEach(p => { p.clipName = `g1_${p.id}`; });
  return { version: 5, type: 'season', id: 'parity-synth', seasonName: 'Parity Synthetic', activeGameId: 'g1', games: [game('g1', 'Edgecases', P)] };
}

// ---- in-page snapshot (runs against the built bundle) ---------------------
// Captures per SCOPE (parity contract §4: game AND season aggregation, no
// cross-game leakage): the whole season (all games' plays) + each game alone.
const capture = async (page, fixture) => {
  return await page.evaluate((fixture) => {
    const eng = window.app.stats, sm = window.app.storage, store = sm.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
    store.currentSeasonId = fixture.id || 'parity';
    if (!store.data.activeGameId && store.data.games[0]) store.data.activeGameId = store.data.games[0].id;
    sm._loadActiveGame();
    if (eng.filter) eng.filter.active = false;

    const SE = eng.constructor;
    const isPlayArr = v => Array.isArray(v) && v.length && v[0] && v[0].tags && v[0].timestamp;
    const clean = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => isPlayArr(v) ? { __plays: v.map(p => p.id).sort((a, b) => a - b) } : v));

    const snapScope = (plays) => {
      const numbers = clean(eng.compute(plays));
      const distinct = (fn) => { const s = new Set(); for (const p of plays) fn(p).forEach(v => v && s.add(v)); return [...s].sort(); };
      const single = (get) => distinct(p => [get(p)]).filter(Boolean);
      const drill = {};
      const cap = (type, vals) => { for (const val of vals) drill[`${type}::${val}`] = plays.filter(eng._buildCutFilter(type, val)).map(p => p.id).sort((a, b) => a - b); };
      cap('formation', distinct(p => SE.splitFormations(p.tags.formation || '')));
      cap('playType', distinct(p => SE.splitPlayTypes(p.tags.playType || '')));
      cap('defFront', distinct(p => SE.splitFronts(p.tags.defFront || '')));
      cap('blitz', distinct(p => SE.splitBlitzes(p.tags.blitz || '')));
      cap('personnel', single(p => p.tags.personnel));
      cap('backfield', single(p => p.tags.backfield));
      cap('strength', single(p => p.tags.strength));
      cap('down', single(p => p.tags.down));
      cap('playDir', single(p => p.tags.playDir));
      cap('motion', ['Jet', 'Orbit', 'Shift', 'Trade', 'No Motion'].filter(v => v === 'No Motion' || plays.some(p => (p.tags.motion || '') === v)));
      cap('hash', single(p => p.tags.hash));
      cap('coverage', single(p => p.tags.coverage));
      cap('runpass', ['Run', 'Pass']);
      cap('situation', ['redZone', 'goalLine', 'backedUp', 'thirdLong', 'thirdShort', 'explosive', 'negative']);
      const ddKey = (p) => { const d = p.tags.down; if (!d) return null; const dist = parseInt(p.tags.distance, 10) || 0; const b = dist <= 3 ? 'Short' : dist <= 6 ? 'Med' : 'Long'; return `${d}|${b}`; };
      cap('dd', [...new Set(plays.map(ddKey).filter(Boolean))].sort());

      const reports = {};
      try { reports.selfScout = clean(eng.generateSelfScout(plays)); } catch (e) { reports.selfScout = { __err: String(e.message) }; }
      try { reports.defScout = clean(eng.generateDefensiveSelfScout(plays)); } catch (e) { reports.defScout = { __err: String(e.message) }; }
      try { reports.scout = clean(eng.generateScoutReport(plays)); } catch (e) { reports.scout = { __err: String(e.message) }; }
      return { numbers, drill, reports };
    };

    // Scopes: whole season (all games flattened) + each game individually.
    const games = store.data.games || [];
    const out = { season: snapScope(games.flatMap(g => g.plays || [])) };
    for (const g of games) out[`game:${g.id}`] = snapScope(g.plays || []);
    return out;
  }, fixture);
};

// ---- run ------------------------------------------------------------------
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const APP_URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

if (!fs.existsSync(GOLDEN_DIR)) fs.mkdirSync(GOLDEN_DIR, { recursive: true });

// synthetic-edge is committed (reproducible everywhere, covers §4). The real
// 6-game season is a LOCAL confidence run only — its golden holds the coach's real
// data (PII), so it is gitignored and skipped when its golden isn't present.
const fixtures = [{ name: 'synthetic-edge', data: syntheticEdge() }];
if (fs.existsSync(REAL)) fixtures.push({ name: 'mavericks-6game', data: JSON.parse(fs.readFileSync(REAL, 'utf-8')), local: true });
else console.log('  (real 6-game fixture not present — synthetic only)');

for (const fx of fixtures) {
  const snap = await capture(page, fx.data);
  const gp = goldenPath(fx.name);
  const scopes = Object.keys(snap);
  const nDrill = scopes.reduce((s, k) => s + Object.keys(snap[k].drill).length, 0);
  if (UPDATE) {
    fs.writeFileSync(gp, JSON.stringify(snap, null, 1));
    console.log(`  WROTE golden ${fx.name}  (${scopes.length} scopes, ${nDrill} drilldowns)`);
    pass++;
    continue;
  }
  if (!fs.existsSync(gp)) {
    if (fx.local) { console.log(`  SKIP  ${fx.name}: local-only golden absent (run --update to generate it locally)`); continue; }
    ok(false, `${fx.name}: golden exists (run --update first)`); continue;
  }
  const golden = JSON.parse(fs.readFileSync(gp, 'utf-8'));
  if (JSON.stringify(snap) === JSON.stringify(golden)) {
    ok(true, `${fx.name}: analytics snapshot matches golden (${scopes.length} scopes, ${nDrill} drilldowns)`);
  } else {
    const allScopes = [...new Set([...scopes, ...Object.keys(golden)])];
    const bad = allScopes.filter(s => JSON.stringify(snap[s]) !== JSON.stringify(golden[s]));
    let detail = `scopes drifted: ${bad.join(', ')}`;
    if (bad.length) {
      const s = bad[0], A = snap[s] || {}, B = golden[s] || {};
      const secs = ['numbers', 'drill', 'reports'].filter(k => JSON.stringify(A[k]) !== JSON.stringify(B[k]));
      detail += ` | ${s}: ${secs.join(',')}`;
    }
    ok(false, `${fx.name}: analytics snapshot matches golden`, detail);
  }
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
