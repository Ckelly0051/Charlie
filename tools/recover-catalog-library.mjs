import fs from 'node:fs/promises';
import path from 'node:path';
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const value = name => { const i = args.indexOf(name); return i >= 0 ? args[i + 1] : ''; };
const appData = value('--app-data');
const mirror = value('--mirror');
if (!appData) throw new Error('Usage: node tools/recover-catalog-library.mjs --app-data <dir> [--mirror <dir>] [--apply]');

const dbPath = path.join(appData, 'seasons', 'library.db');
const bytes = new Uint8Array(await fs.readFile(dbPath));
const SQL = await initSqlJs();
const catalog = await new SqlCatalog(SQL).open(bytes);
const metas = catalog.listSeasons();
const seasons = metas.map(meta => ({ meta, data: catalog.loadSeason(meta.id) }));
for (const { meta, data } of seasons) {
  if (!data || String(data.id || '') !== String(meta.id)) throw new Error(`Catalog identity mismatch for ${meta.id}`);
  const plays = (data.games || []).reduce((sum, game) => sum + (game.plays || []).length, 0);
  if (plays !== Number(meta.plays || 0) || (data.games || []).length !== Number(meta.games || 0)) {
    throw new Error(`Catalog count mismatch for ${meta.id}`);
  }
  console.log(`${meta.id}\t${meta.name}\t${meta.games} games\t${meta.plays} plays\tteamId=${meta.teamId || ''}`);
}
if (!apply) {
  console.log(`DRY RUN: ${seasons.length} canonical seasons verified; no files written.`);
  process.exit(0);
}

async function atomicJson(file, value) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.recovery-${process.pid}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(tmp, file);
}
for (const { meta, data } of seasons) {
  await atomicJson(path.join(appData, 'seasons', meta.id, 'season.json'), data);
  if (mirror) await atomicJson(path.join(mirror, 'seasons', meta.id, 'season.json'), data);
}
await atomicJson(path.join(appData, 'library.json'), metas);
console.log(`RECOVERED: ${seasons.length} sidecars and library.json rebuilt from canonical SQLite. Film directories untouched.`);