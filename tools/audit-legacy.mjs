/**
 * LEGACY INVENTORY (docs/LEGACY-EXCISION-PLAN.md, Phase 0). A read-only scan
 * that MEASURES the legacy surfaces the plan removes, so progress is counted
 * rather than asserted and a new copy of an old pattern is caught.
 *
 *   node tools/audit-legacy.mjs            print the inventory
 *   node tools/audit-legacy.mjs --json     print it as JSON
 *   node tools/audit-legacy.mjs --live     also count legacy data shapes in a
 *                                          read-only copy of the installed
 *                                          app's live catalog (this machine)
 *
 * `e2e-legacy-inventory` compares the counts against the recorded baseline
 * (tools/legacy-inventory-baseline.json) and fails when any rises.
 * Nothing here writes to the app, the repo or coach data.
 */
import { readFileSync, readdirSync, existsSync, copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export { CANONICAL_SEASON } from './canonical-season.mjs';
import { CANONICAL_SEASON } from './canonical-season.mjs';
export const LIVE_CATALOG = path.join(process.env.APPDATA || '', 'com.gridironiq.app', 'seasons', 'library.db');

const jsFiles = () => readdirSync(path.join(ROOT, 'js')).filter(f => /\.(js|jsx|mjs)$/.test(f)).map(f => `js/${f}`);
const toolFiles = () => readdirSync(path.join(ROOT, 'tools')).filter(f => /\.(mjs|js|cjs)$/.test(f) && f !== 'audit-legacy.mjs').map(f => `tools/${f}`);
const read = rel => readFileSync(path.join(ROOT, rel), 'utf8');
const count = (text, re) => (text.match(re) || []).length;

/** Names defined at top level or as class methods and referenced nowhere else
 *  in js/ or tools/. A candidate list: string-built or dynamic use must be
 *  checked by hand before a deletion (plan, Phase 1). */
function deadNames(src, all) {
  const out = [];
  for (const [file, text] of Object.entries(src)) {
    const seen = new Set();
    const re = /^(?:export\s+)?(?:async\s+)?(?:function\s+([A-Za-z_$][\w$]*)|(?:const|let|class)\s+([A-Za-z_$][\w$]*))|^  (?:static\s+)?(?:async\s+)?(_?[A-Za-z][\w$]*)\s*\([^)]*\)\s*\{/gm;
    let m;
    while ((m = re.exec(text))) {
      const name = m[1] || m[2] || m[3];
      if (!name || seen.has(name) || ['constructor', 'if', 'for', 'while', 'switch', 'catch', 'render', 'get', 'set'].includes(name)) continue;
      seen.add(name);
      const refs = count(all, new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`, 'g'));
      if (refs <= 1) out.push(`${file}: ${name}`);
    }
  }
  return out.sort();
}

function modulesImportedByNothing(src) {
  const all = Object.values(src).join('\n') + read('index.html');
  return Object.keys(src).filter(file => {
    const base = path.basename(file).replace(/\.(jsx?|mjs)$/, '');
    return !new RegExp(`['"/]${base.replace(/[.$]/g, '\\$&')}(\\.jsx?|\\.mjs)?['"]`).test(all);
  }).sort();
}

/** Legacy data shapes in one season body. */
export function dataShapes(season) {
  const align = /\b(Under Center|Shotgun|Pistol)\b/;
  const s = { plays: 0, noUnit: 0, emptyTags: 0, combinedFormation: 0, legacyStOnly: 0, gameNodeRosters: 0 };
  for (const g of season.games || []) {
    if (Object.prototype.hasOwnProperty.call(g, 'roster')) s.gameNodeRosters++;
    for (const p of g.plays || []) {
      s.plays++;
      const t = p.tags || {};
      if (!Object.keys(t).length) s.emptyTags++;
      else if (t.unit === undefined || t.unit === '') s.noUnit++;
      if (align.test(t.formation || '') && /\s\+\s/.test(t.formation || '')) s.combinedFormation++;
      if (!p.specialTeams && (t.stType || t.kickOutcome)) s.legacyStOnly++;
    }
  }
  return s;
}

export function inventory() {
  const files = jsFiles();
  const src = Object.fromEntries(files.map(f => [f, read(f)]));
  const tools = Object.fromEntries(toolFiles().map(f => [f, read(f)]));
  const js = Object.values(src).join('\n');
  const all = js + '\n' + Object.values(tools).join('\n') + read('index.html');
  const outsideTagger = Object.entries(src).filter(([f]) => f !== 'js/play-tagger.js').map(([, t]) => t).join('\n');
  const unitRules = Object.entries(src).filter(([f]) => f !== 'js/football-rules.js').map(([, t]) => t).join('\n');
  const dead = deadNames(src, all);
  const orphanModules = modulesImportedByNothing(src);
  const counts = {
    deadNames: dead.length,
    orphanModules: orphanModules.length,
    retiredTests: existsSync(path.join(ROOT, 'tools', 'retired')) ? readdirSync(path.join(ROOT, 'tools', 'retired')).length : 0,
    // B: second copies of the one unit rule (football-rules.countedUnit).
    inlineUnitRules: count(unitRules, /\bunit\s*\|\|\s*'offense'|\.unit\)\s*\|\|\s*'offense'|tags\??\.unit\s*\|\|\s*this\.defaultUnit/g),
    projectedPairsAlias: count(js, /PlayGrid\.PROJECTED_PAIRS/g),
    // C: UI state inside the domain model.
    plainFieldRefs: count(js, /\bPlain(Field|Input)\b/g),
    taggerFieldReadsOutsideTagger: count(outsideTagger, /\.(unitField|tagFields|playerFields|gradeFields)\b/g),
    // D: old-format readers (Pass 2 step 7). A read of a retired Special Teams
    // tag; js/season-format.js names them only to refuse them.
    legacyStReads: count(Object.entries(src).filter(([f]) => f !== 'js/season-format.js').map(([, t]) => t).join('\n'),
      /(?:tags|\bt|raw|p\.tags|play\.tags)\??\.(stType|kickOutcome|scoreFor|kickDistance|returnYards|hangTime|kickedTo)\b/g),
    // E: platform choices.
    localStorageCalls: count(js, /localStorage\.(getItem|setItem|removeItem)\(/g),
    windowAppRefs: count(js, /\bwindow\.app\b/g),
    innerHtmlSinks: count(js, /\.innerHTML\s*\+?=/g),
    statsEngineLines: src['js/stats-engine.js'].split('\n').length,
  };
  return { counts, deadNames: dead, orphanModules };
}

export async function liveShapes() {
  if (!existsSync(LIVE_CATALOG)) return { error: `no live catalog at ${LIVE_CATALOG}` };
  const before = createHash('sha256').update(readFileSync(LIVE_CATALOG)).digest('hex');
  const dir = mkdtempSync(path.join(tmpdir(), 'giq-legacy-'));
  const copy = path.join(dir, 'library.db');
  copyFileSync(LIVE_CATALOG, copy);
  try {
    const initSqlJs = (await import('sql.js')).default;
    const SQL = await initSqlJs();
    const db = new SQL.Database(readFileSync(copy));
    const seasons = db.exec('SELECT id, name FROM seasons')[0]?.values || [];
    const out = {};
    for (const [id, name] of seasons) {
      const games = (db.exec(`SELECT id, body_json FROM games WHERE season_id = '${String(id).replace(/'/g, "''")}'`)[0]?.values || [])
        .map(([gid, body]) => {
          let game = {}; try { game = JSON.parse(body); } catch {}
          const plays = (db.exec(`SELECT body_json FROM plays WHERE game_id = '${String(gid).replace(/'/g, "''")}' ORDER BY ord`)[0]?.values || [])
            .map(([b]) => { try { return JSON.parse(b); } catch { return {}; } });
          return { ...game, plays };
        });
      out[name] = dataShapes({ games });
    }
    const after = createHash('sha256').update(readFileSync(LIVE_CATALOG)).digest('hex');
    return { catalogUnchanged: before === after, seasons: out };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const inv = inventory();
  const canonical = existsSync(CANONICAL_SEASON) ? dataShapes(JSON.parse(readFileSync(CANONICAL_SEASON, 'utf8'))) : null;
  const live = process.argv.includes('--live') ? await liveShapes() : undefined;
  if (process.argv.includes('--json')) {
    console.log(JSON.stringify({ ...inv, canonicalMirrorShapes: canonical, live }, null, 2));
  } else {
    console.log('Legacy inventory (docs/LEGACY-EXCISION-PLAN.md)\n');
    for (const [k, v] of Object.entries(inv.counts)) console.log(`  ${k.padEnd(32)} ${v}`);
    console.log(`\n  canonical mirror data shapes     ${canonical ? JSON.stringify(canonical) : 'absent'}`);
    if (live) console.log(`  live catalog data shapes         ${JSON.stringify(live)}`);
    console.log(`\n  orphan modules: ${inv.orphanModules.join(', ') || 'none'}`);
    console.log(`  dead-name candidates (${inv.deadNames.length}):`);
    for (const n of inv.deadNames) console.log(`    ${n}`);
  }
}
