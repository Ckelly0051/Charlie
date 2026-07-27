import { APP_ENTRY_PATH, APP_URL as TEST_APP_URL } from './app-entry.mjs';
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
import { syntheticEdge } from './fixtures/synthetic-edge.mjs';

const UPDATE = process.argv.includes('--update');
const GOLDEN_DIR = fileURLToPath(new URL('./parity-golden/', import.meta.url));
const goldenPath = name => path.join(GOLDEN_DIR, `${name}.json`);

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

// ---- fixtures -------------------------------------------------------------
const REAL = 'C:/Users/charl/Downloads/GridIronIQ-mavericks-2025-RECOVERED.json';
// syntheticEdge() is the shared fixture in tools/fixtures/synthetic-edge.mjs so
// the Study query test (tools/e2e-study-query.mjs) exercises the IDENTICAL season.

// ---- in-page snapshot (runs against the built bundle) ---------------------
// Captures per SCOPE (parity contract §4: game AND season aggregation, no
// cross-game leakage): the whole season (all games' plays) + each game alone.
const capture = async (page, fixture) => {
  return await page.evaluate((fixture) => {
    const eng = window.app.stats, sm = window.app.storage, store = sm.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(fixture)));
    store.currentSeasonId = fixture.id || 'parity';
    if (!store.data.activeGameId && store.data.games[0]) store.data.activeGameId = store.data.games[0].id;
    // Stamp each play with its owning game so references are COMPOSITE
    // (gameId::playId) — play ids restart per game, so a bare id can't identify a
    // play across the season scope (the "no lost film link" contract).
    for (const g of (store.data.games || [])) for (const p of (g.plays || [])) p.__gid = g.id;
    sm._loadActiveGame();
    if (eng.filter) eng.filter.active = false;

    const SE = eng.constructor;
    const pid = p => `${p.__gid || '?'}::${p.id}`;
    const isPlay = v => v && typeof v === 'object' && v.tags && v.timestamp && v.id != null;
    const isPlayArr = v => Array.isArray(v) && v.length && isPlay(v[0]);
    // Reduce any play (single or in an array) to its composite id — pins the
    // matching-play sets AND avoids leaking full play objects into the golden.
    const clean = (obj) => JSON.parse(JSON.stringify(obj, (k, v) => isPlayArr(v) ? { __plays: v.map(pid).sort() } : isPlay(v) ? { __play: pid(v) } : v));
    const bucketOf = t => { const d = parseInt(t.distance, 10) || 0; return d > 0 ? SE._distBucket(d) : null; };

    const snapScope = (plays) => {
      const numbers = clean(eng.compute(plays));
      const off = plays.filter(p => (p.tags.unit || 'offense') === 'offense');
      const def = plays.filter(p => p.tags.unit === 'defense');
      const distinct = (fn) => { const s = new Set(); for (const p of plays) fn(p).forEach(v => v && s.add(v)); return [...s].sort(); };
      const single = (get) => distinct(p => [get(p)]).filter(Boolean);
      const drill = {};
      const cap = (type, vals) => { for (const val of vals) drill[`${type}::${val}`] = plays.filter(eng._buildCutFilter(type, val)).map(pid).sort(); };
      // primary dimensions
      // E3a: capture the PROJECTED pre-snap look, matching production. Enumerating
      // raw values here would bake raw drilldown keys into the golden while
      // production emits projected ones — a green harness validating the wrong thing.
      cap('formation', distinct(p => SE.splitFormations(SE.proj(p).formation)));
      cap('qbAlignment', single(p => SE.proj(p).qbAlignment));
      cap('playType', distinct(p => SE.splitPlayTypes(p.tags.playType || '')));
      cap('defFront', distinct(p => SE.splitFronts(p.tags.defFront || '')));
      cap('blitz', distinct(p => SE.splitBlitzes(p.tags.blitz || '')));
      cap('personnel', single(p => p.tags.personnel));
      cap('backfield', single(p => SE.proj(p).backfield));
      cap('strength', single(p => SE.proj(p).strength));
      cap('down', single(p => p.tags.down));
      cap('playDir', single(p => p.tags.playDir));
      cap('motion', ['Jet', 'Orbit', 'Shift', 'Trade', 'No Motion'].filter(v => v === 'No Motion' || plays.some(p => (p.tags.motion || '') === v)));
      cap('hash', single(p => p.tags.hash));
      cap('coverage', single(p => SE.proj(p).coverage));
      cap('coverageFamily', single(p => SE.proj(p).coverageFamily));
      cap('runpass', ['Run', 'Pass']);
      cap('situation', ['redZone', 'goalLine', 'backedUp', 'thirdLong', 'thirdShort', 'explosive', 'negative']);
      cap('dd', [...new Set(off.map(p => { const b = bucketOf(p.tags); return p.tags.down && b ? `${p.tags.down}|${b}` : null; }).filter(Boolean))].sort());
      // combo / tendency dimensions (self-scout + Big-12 + front×coverage film links)
      const set = (fn) => { const s = new Set(); for (const p of fn.src) fn.keys(p).forEach(v => v && s.add(v)); return [...s].sort(); };
      cap('comboFStr', set({ src: off, keys: p => SE.proj(p).strength ? SE.splitFormations(SE.proj(p).formation).map(f => f && `${f}__${SE.proj(p).strength}`) : [] }));
      cap('comboFD', set({ src: off, keys: p => { const b = bucketOf(p.tags); return (p.tags.down && b) ? SE.splitFormations(SE.proj(p).formation).map(f => f && `${f}__${p.tags.down}|${b}`) : []; } }));
      cap('comboFS', set({ src: off, keys: p => { const sit = eng._matrixSit(p.tags); return sit ? SE.splitFormations(SE.proj(p).formation).map(f => f && `${f}__${sit}`) : []; } }));
      // Six-field projected Big Call (§8a), matching _bigTwelveData's key exactly.
      cap('bigCall', set({ src: off, keys: p => { const r = SE.proj(p); const key = [(r.qbAlignment || '').trim(), (r.formation || '').trim(), (r.backfield || '').trim(), (r.strength || '').trim(), (p.tags.motion || '').trim(), (p.tags.playType || '').trim()]; return key.some(Boolean) ? [key.join('|||')] : []; } }));
      // frontCoverage on the PROJECTED coverage call (line ~2116 in prod reads proj).
      cap('frontCoverage', set({ src: def, keys: p => SE.proj(p).coverage ? SE.splitFronts(p.tags.defFront || '').map(f => f && `${f}|${SE.proj(p).coverage}`) : [] }));
      cap('ddDef', [...new Set(def.map(p => { const b = bucketOf(p.tags); return p.tags.down && b ? `${p.tags.down}|${b}` : null; }).filter(Boolean))].sort());

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
// Bundle-freshness guard: this harness runs against the BUILT bundle, so editing
// modular analytics source and forgetting `npm run build` would test a stale
// bundle and pass falsely. Fail loudly if any source is newer than the bundle.
const bundleFile = APP_ENTRY_PATH;
const newestSourceMtime = () => {
  let newest = 0;
  const visit = dir => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (/\.(?:css|js|jsx|ts|tsx)$/.test(entry.name)) newest = Math.max(newest, fs.statSync(file).mtimeMs);
    }
  };
  for (const rel of ['js', 'css']) visit(fileURLToPath(new URL(`../${rel}/`, import.meta.url)));
  for (const rel of ['../index.html', '../vite.config.js', '../package.json', '../package-lock.json', '../assets/icons.svg']) {
    try { newest = Math.max(newest, fs.statSync(fileURLToPath(new URL(rel, import.meta.url))).mtimeMs); } catch {}
  }
  return newest;
};
if (fs.existsSync(bundleFile) && newestSourceMtime() > fs.statSync(bundleFile).mtimeMs) {
  console.error('  STALE BUILD: source files are newer than dist/index.html.\n  Run `npm run build` before the parity gate.');
  process.exit(1);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
page.on('dialog', async d => { try { await d.dismiss(); } catch {} });
const APP_URL = TEST_APP_URL;
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
