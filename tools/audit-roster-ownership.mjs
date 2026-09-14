/**
 * READ-ONLY roster-ownership audit across every store the desktop app can use.
 *
 * Reports, for each season in each store: stable id, display name, team id,
 * year/level/kind, game count, season roster count and hash, how many games
 * carry a legacy `game.roster`, and the storage location. It also sweeps every
 * game for `perspective:'scout'` inside a Program season.
 *
 * WRITES NOTHING. `tools/normalize-roster-ownership.mjs` is the only writer and
 * it refuses to run without this audit's own identity checks passing.
 *
 * Roster CONTENTS are never printed -- only counts and a salted-free sha256 of
 * the jersey list, which is enough to prove two seasons hold the same list
 * without putting player data in a log or in Git.
 */
import { readdirSync, readFileSync, existsSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';

export const CATALOG_DB = 'C:/Users/charl/AppData/Roaming/com.gridironiq.app/seasons/library.db';
export const APPDATA_SEASONS = 'C:/Users/charl/AppData/Roaming/com.gridironiq.app/seasons';
export const MIRROR_SEASONS = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons';

export const rosterHash = roster => (Array.isArray(roster) && roster.length)
  ? createHash('sha256').update(JSON.stringify(roster.map(p => [String(p.num), String(p.name || ''), String(p.pos || ''), String(p.side || '')]))).digest('hex').slice(0, 16)
  : '(empty)';

const seasonShape = (id, body, games, where) => ({
  id,
  name: body.seasonName || body.name || '(unnamed)',
  teamId: body.teamId || '',
  year: body.year || '',
  level: body.level || '',
  kind: body.kind || '',
  games: games.length,
  rosterCount: Array.isArray(body.roster) ? body.roster.length : 0,
  rosterHash: rosterHash(body.roster),
  gamesWithRoster: games.filter(g => Array.isArray(g?.roster) && g.roster.length).length,
  gameRosterHashes: [...new Set(games.filter(g => Array.isArray(g?.roster) && g.roster.length).map(g => rosterHash(g.roster)))],
  scoutGames: games.filter(g => (g?.gameInfo || {}).perspective === 'scout').map(g => ({ id: g.id, name: g.name })),
  where,
});

/** Every season in the SQLite catalog, with its games read from the games table. */
export async function readCatalog() {
  if (!existsSync(CATALOG_DB)) return { present: false, seasons: [] };
  const initSqlJs = (await import('sql.js')).default;
  const SQL = await initSqlJs();
  const db = new SQL.Database(readFileSync(CATALOG_DB));
  const rows = db.exec('SELECT id, name, team, year, level, kind, is_demo, games_count, body_json FROM seasons');
  const seasons = [];
  for (const [id, name, team, year, level, kind, isDemo, gamesCount, body] of (rows[0]?.values || [])) {
    let parsed = {};
    try { parsed = JSON.parse(body || '{}'); } catch {}
    let games = [];
    try {
      const g = db.exec('SELECT body_json FROM games WHERE season_id = ?', [id]);
      games = (g[0]?.values || []).map(([b]) => { try { return JSON.parse(b || '{}'); } catch { return {}; } });
    } catch {}
    if (!games.length && Array.isArray(parsed.games)) games = parsed.games;
    seasons.push({
      ...seasonShape(id, { ...parsed, seasonName: parsed.seasonName || name, year: parsed.year || year, level: parsed.level || level, kind: parsed.kind || kind }, games, 'catalog:library.db'),
      indexName: name, indexTeam: team, indexGamesCount: gamesCount, isDemo: !!isDemo,
    });
  }
  db.close();
  return { present: true, seasons };
}

/**
 * Unwrap a mirror file to the season body.
 *
 * The Documents mirror holds TWO shapes. The current writer
 * (`StorageBackend._mirrorToDocuments`) wraps the season in a PC-3
 * `SnapshotEnvelope` -- `{envelopeVersion, seasonId, revision, timestamp,
 * gameCount, playCount, checksum, data}` -- and the season itself is `data`.
 * Older files are the bare season object. Reading the envelope's TOP level as
 * a season reports every wrapped file as empty and unnamed, which is exactly
 * the wrong answer for an audit that decides what to write.
 */
export function unwrapSeason(parsed) {
  if (parsed && typeof parsed === 'object' && parsed.envelopeVersion && parsed.data && typeof parsed.data === 'object') {
    return { body: parsed.data, envelope: parsed, wrapped: true };
  }
  return { body: parsed || {}, envelope: null, wrapped: false };
}

/** Every season.json under a directory root (app-data copies, or the mirror). */
export function readJsonRoot(root, label) {
  if (!existsSync(root)) return { present: false, seasons: [] };
  const seasons = [];
  for (const dir of readdirSync(root)) {
    const file = `${root}/${dir}/season.json`;
    if (!existsSync(file)) continue;
    let parsed = {};
    try { parsed = JSON.parse(readFileSync(file, 'utf8')); } catch { seasons.push({ id: dir, name: '(parse error)', where: label }); continue; }
    const { body, envelope, wrapped } = unwrapSeason(parsed);
    seasons.push({
      ...seasonShape(dir, body, body.games || [], label),
      mtime: statSync(file).mtime.toISOString(), file, wrapped,
      envelopeSeasonId: envelope?.seasonId || '', revision: envelope?.revision ?? body.revision ?? null,
      declaredPlays: envelope?.playCount ?? null,
    });
  }
  return { present: true, seasons };
}

const pad = (v, n) => String(v ?? '').padEnd(n).slice(0, n);

function table(title, seasons) {
  console.log(`\n=== ${title} ===`);
  if (!seasons.length) { console.log('  (none)'); return; }
  console.log(`  ${pad('season id', 30)} ${pad('display name', 32)} ${pad('teamId', 8)} ${pad('yr/lvl', 14)} ${pad('kind', 8)} ${pad('games', 6)} ${pad('roster', 7)} ${pad('roster hash', 18)} legacy game.roster`);
  for (const s of seasons) {
    const shape = s.wrapped === true ? ' envelope' : s.wrapped === false ? ' bare' : '';
    console.log(`  ${pad(s.id, 30)} ${pad(s.name, 32)} ${pad(s.teamId || '(none)', 8)} ${pad(`${s.year} ${s.level}`, 14)} ${pad(s.kind || '(none)', 8)} ${pad(s.games, 6)} ${pad(s.rosterCount, 7)} ${pad(s.rosterHash, 18)} ${s.gamesWithRoster} of ${s.games}${s.gameRosterHashes?.length ? `  [${s.gameRosterHashes.join(' ')}]` : ''}${shape}`);
  }
}

if (import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`) {
  const catalog = await readCatalog();
  const appdata = readJsonRoot(APPDATA_SEASONS, 'appdata:season.json');
  const mirror = readJsonRoot(MIRROR_SEASONS, 'mirror:season.json');

  table(`CATALOG (authoritative for the installed app) — ${CATALOG_DB}`, catalog.seasons);
  table(`APP-DATA season.json copies — ${APPDATA_SEASONS}`, appdata.seasons);
  table(`DOCUMENTS MIRROR — ${MIRROR_SEASONS}`, mirror.seasons);

  console.log('\n=== Program-season games carrying perspective:\'scout\' ===');
  let scoutHits = 0;
  for (const store of [catalog, appdata, mirror]) {
    for (const s of store.seasons) {
      if (s.kind === 'scout') continue;
      for (const g of s.scoutGames || []) { scoutHits++; console.log(`  ${s.where}  season=${s.id}  game=${g.id} "${g.name}"`); }
    }
  }
  if (!scoutHits) console.log('  NONE. No Program-season game is marked scout in any store.');

  console.log('\n=== Identical season rosters (duplication evidence) ===');
  const byHash = new Map();
  for (const s of catalog.seasons) {
    if (s.rosterHash === '(empty)') continue;
    if (!byHash.has(s.rosterHash)) byHash.set(s.rosterHash, []);
    byHash.get(s.rosterHash).push(s.id);
  }
  for (const [hash, ids] of byHash) {
    console.log(`  ${hash}  ${ids.length} season(s): ${ids.join(', ')}${ids.length > 1 ? '   <-- duplicated' : ''}`);
  }
}
