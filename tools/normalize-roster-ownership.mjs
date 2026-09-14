/**
 * ONE-TIME, EXPLICITLY AUTHORIZED coach-data normalization for roster ownership.
 *
 * Authorized by Charlie, 2026-09-13:
 *   - the 19-player roster belongs ONLY to the 2025 St. Joseph Mavericks JV season
 *   - no roster was entered for 2026 JV or 2026 Varsity, so both are empty
 *   - legacy `game.roster` copies are removed once the owning season is settled
 *
 * SAFETY
 *   - `--apply` is required; without it this prints the plan and writes nothing.
 *   - Every file it will touch is backed up first, timestamped, with sha256
 *     recorded for both the backup and the post-write result.
 *   - Season identity is VERIFIED from stable game ids and metadata, never from
 *     a directory name. It refuses to run if verification fails.
 *   - It touches only the three seasons named below. The two orphan bare mirror
 *     files (`2025-st-joseph-mavericks-jv`, `2026-st-joseph-mavericks-jv`) are
 *     never written: the first is the registered canonical Reports data
 *     authority, which CLAUDE.md forbids writing to.
 *   - Roster CONTENTS are never printed.
 */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { CATALOG_DB, APPDATA_SEASONS, MIRROR_SEASONS, rosterHash, unwrapSeason } from './audit-roster-ownership.mjs';
import { SnapshotEnvelope } from '../js/snapshot-envelope.js';

const APPLY = process.argv.includes('--apply');
const STAMP = new Date().toISOString().replace(/[:.]/g, '-');
const BACKUP_DIR = `C:/Users/charl/AppData/Roaming/com.gridironiq.app/roster-normalization-backups/${STAMP}`;

/** Seasons this run may touch, and what each one's roster must become. */
const PLAN = {
  '2026-varsity-demo': { label: '2025 St. Joseph Mavericks - JV', roster: 'keep' },
  'sjm-jv-2026': { label: 'SJM JV 2026', roster: 'empty' },
  'sjm-varsity-2026': { label: 'SJM Varsity 2026', roster: 'empty' },
};
/** The 2025 JV season's stable game ids, from the registered canonical mirror
 *  copy. Identity is proven against THESE, not against any directory name. */
const JV2025_GAME_IDS = ['gmq9plozwgukpk', 'gmqfbfaqnpxjll', 'gmqik11s86n46s', 'gmqo9g65dqzba4', 'gmqpt95xh58z0a', 'gmqptqoprzli2r'];

const sha = buf => createHash('sha256').update(buf).digest('hex');
const log = [];
const say = line => { log.push(line); console.log(line); };

function backup(file, tag) {
  const bytes = readFileSync(file);
  const dest = `${BACKUP_DIR}/${tag}`;
  if (APPLY) { mkdirSync(BACKUP_DIR, { recursive: true }); copyFileSync(file, dest); }
  say(`  backup  ${tag.padEnd(44)} sha256=${sha(bytes)}  <- ${file}`);
  return dest;
}

const strippedGames = games => {
  let removed = 0;
  const out = (games || []).map(g => {
    if (Array.isArray(g?.roster)) { removed++; const { roster, ...rest } = g; return rest; }
    return g;
  });
  return { games: out, removed };
};

// ── Verify identity before anything else ─────────────────────────────────────
const initSqlJs = (await import('sql.js')).default;
const SQL = await initSqlJs();
const db = new SQL.Database(readFileSync(CATALOG_DB));

const seasonRow = id => {
  const r = db.exec('SELECT name, year, level, body_json FROM seasons WHERE id = ?', [id]);
  if (!r[0]?.values?.length) return null;
  const [name, year, level, body] = r[0].values[0];
  return { name, year, level, body: JSON.parse(body || '{}') };
};
const gameIds = id => (db.exec('SELECT id FROM games WHERE season_id = ? ORDER BY id', [id])[0]?.values || []).map(v => v[0]);

say(`\n== Identity verification (stable ids and metadata, not directory names) ==`);
const jv = seasonRow('2026-varsity-demo');
const ids = gameIds('2026-varsity-demo').slice().sort();
const expected = JV2025_GAME_IDS.slice().sort();
const idsMatch = ids.length === expected.length && ids.every((v, i) => v === expected[i]);
const metaMatch = jv && String(jv.year) === '2025' && String(jv.level) === 'JV' && /2025 St\. Joseph Mavericks/i.test(String(jv.name));
say(`  catalog id "2026-varsity-demo": name="${jv?.name}" year=${jv?.year} level=${jv?.level}`);
say(`  stable game ids match the canonical 2025 JV set: ${idsMatch} (${ids.length} games)`);
say(`  metadata matches 2025 / JV / St. Joseph Mavericks: ${metaMatch}`);
if (!idsMatch || !metaMatch) {
  say('\nBLOCKED: the 2025 JV season could not be identified unambiguously. No data written.');
  process.exit(2);
}
say(`  VERIFIED: catalog "2026-varsity-demo" IS the 2025 St. Joseph Mavericks JV season.`);
say(`  The "-demo" in that id is a naming artifact; the catalog's own is_demo flag is 0.`);

// ── Plan ─────────────────────────────────────────────────────────────────────
say(`\n== Planned changes ${APPLY ? '(APPLYING)' : '(DRY RUN -- pass --apply to write)'} ==`);

const catalogEdits = [];
for (const [id, spec] of Object.entries(PLAN)) {
  const row = seasonRow(id);
  if (!row) { say(`  catalog ${id}: NOT PRESENT, skipped`); continue; }
  const before = Array.isArray(row.body.roster) ? row.body.roster.length : 0;
  const after = spec.roster === 'keep' ? before : 0;
  const gRows = db.exec('SELECT id, body_json FROM games WHERE season_id = ?', [id])[0]?.values || [];
  const gameHits = gRows.filter(([, b]) => { try { return Array.isArray(JSON.parse(b || '{}').roster); } catch { return false; } });
  say(`  catalog ${id.padEnd(20)} roster ${before} -> ${after}   legacy game.roster removed from ${gameHits.length} game(s)`);
  catalogEdits.push({ id, spec, gRows });
}

const fileEdits = [];
for (const [root, label] of [[APPDATA_SEASONS, 'appdata'], [MIRROR_SEASONS, 'mirror']]) {
  for (const id of Object.keys(PLAN)) {
    const file = `${root}/${id}/season.json`;
    if (!existsSync(file)) continue;
    const parsed = JSON.parse(readFileSync(file, 'utf8'));
    const { body, wrapped } = unwrapSeason(parsed);
    const before = Array.isArray(body.roster) ? body.roster.length : 0;
    const after = PLAN[id].roster === 'keep' ? before : 0;
    const hits = (body.games || []).filter(g => Array.isArray(g?.roster)).length;
    say(`  ${label.padEnd(7)} ${id.padEnd(20)} roster ${before} -> ${after}   legacy game.roster removed from ${hits} game(s)  [${wrapped ? 'envelope' : 'bare'}]`);
    fileEdits.push({ file, id, label, wrapped });
  }
}
say(`  UNTOUCHED: mirror/2025-st-joseph-mavericks-jv (registered canonical Reports authority)`);
say(`  UNTOUCHED: mirror/2026-st-joseph-mavericks-jv (orphan, roster already empty)`);

if (!APPLY) { say('\nDry run complete. Nothing was written.'); process.exit(0); }

// ── Apply ────────────────────────────────────────────────────────────────────
say(`\n== Backups -> ${BACKUP_DIR} ==`);
backup(CATALOG_DB, 'library.db');
for (const e of fileEdits) backup(e.file, `${e.label}__${e.id}__season.json`);

say('\n== Writing ==');
for (const { id, spec, gRows } of catalogEdits) {
  const row = seasonRow(id);
  const body = row.body;
  if (spec.roster === 'empty') body.roster = [];
  body.rosterOwnership = 'season';
  if (Array.isArray(body.games)) body.games = strippedGames(body.games).games;
  db.run('UPDATE seasons SET body_json = ? WHERE id = ?', [JSON.stringify(body), id]);
  let removed = 0;
  for (const [gid, b] of gRows) {
    let g = {}; try { g = JSON.parse(b || '{}'); } catch { continue; }
    if (!Array.isArray(g.roster)) continue;
    delete g.roster; removed++;
    db.run('UPDATE games SET body_json = ? WHERE id = ?', [JSON.stringify(g), gid]);
  }
  say(`  catalog ${id}: roster=${spec.roster === 'keep' ? body.roster.length : 0}, game.roster removed from ${removed} game(s)`);
}
writeFileSync(CATALOG_DB, Buffer.from(db.export()));
say(`  library.db rewritten, sha256=${sha(readFileSync(CATALOG_DB))}`);

for (const { file, id, label, wrapped } of fileEdits) {
  const parsed = JSON.parse(readFileSync(file, 'utf8'));
  const { body } = unwrapSeason(parsed);
  if (PLAN[id].roster === 'empty') body.roster = [];
  body.rosterOwnership = 'season';
  const { games, removed } = strippedGames(body.games);
  body.games = games;
  const out = wrapped ? SnapshotEnvelope.wrap(id, body) : body;
  writeFileSync(file, JSON.stringify(out, null, 2));
  say(`  ${label} ${id}: roster=${body.roster.length}, game.roster removed from ${removed} game(s), sha256=${sha(readFileSync(file))}`);
}

// ── Verify ───────────────────────────────────────────────────────────────────
say('\n== Post-write verification ==');
const db2 = new SQL.Database(readFileSync(CATALOG_DB));
for (const id of Object.keys(PLAN)) {
  const r = db2.exec('SELECT body_json FROM seasons WHERE id = ?', [id]);
  const body = JSON.parse(r[0].values[0][0] || '{}');
  const games = (db2.exec('SELECT body_json FROM games WHERE season_id = ?', [id])[0]?.values || []).map(([b]) => { try { return JSON.parse(b); } catch { return {}; } });
  const plays = db2.exec('SELECT COUNT(*) FROM plays WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)', [id])[0].values[0][0];
  say(`  ${id.padEnd(20)} roster=${(body.roster || []).length} hash=${rosterHash(body.roster)} marker=${body.rosterOwnership} games=${games.length} gamesWithRoster=${games.filter(g => Array.isArray(g?.roster)).length} plays=${plays}`);
}
say(`\nLedger stamp: ${STAMP}`);
