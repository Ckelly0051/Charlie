/** Throwaway history retirement for the confirmed charting cutover. No app imports. */
import { readFileSync, writeFileSync, copyFileSync, mkdirSync, existsSync, renameSync, openSync, closeSync, fsyncSync, rmSync } from 'node:fs';
import { createHash, randomUUID } from 'node:crypto';
import { execSync } from 'node:child_process';
import path from 'node:path';
import { SqlCatalog } from '../js/sql-catalog.js';
import { SeasonFormat } from '../js/season-format.js';
import { convertSeason } from './charting-convert.mjs';

const sha = data => createHash('sha256').update(data).digest('hex');
const encode = row => JSON.stringify(row);
const ordered = rows => rows.map(encode).sort();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const TABLES = ['backups', 'versions'];
const checkClosed = () => {
  if (execSync('tasklist /fo csv /nh', { encoding: 'utf8' }).split('\n').some(line => /"gridiron-iq\.exe"/i.test(line))) throw new Error('Close GridIron IQ before retiring history.');
};
async function open(bytes) {
  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL); await cat.open(bytes); return cat;
}
function incompatible(row, mapping) {
  let doc;
  try { doc = JSON.parse(row.body_json); } catch { return ['invalid JSON']; }
  if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return ['malformed snapshot'];
  const isSeason = Array.isArray(doc.games);
  if (!isSeason && !Array.isArray(doc.plays)) return ['no plays list'];
  const season = isSeason ? doc : { id: doc.id || row.id, games: [{ id: doc.id || row.id, plays: doc.plays }], playbook: doc.playbook };
  const result = convertSeason(season, mapping, row.id);
  const converted = isSeason ? season : { ...doc, plays: season.games[0].plays };
  const problems = isSeason ? SeasonFormat.seasonProblems(converted) : SeasonFormat.gameProblems(converted);
  return [...new Set([...problems.map(p => p.problem), ...result.unresolved.flatMap(p => p.reasons), ...result.old.flatMap(p => p.reasons), ...result.playbook.unresolved.map(() => 'unresolved playbook')])];
}
function allTables(cat) {
  return Object.fromEntries(cat._all("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").map(({ name }) => [name, cat._all(`SELECT * FROM "${name.replaceAll('"', '""')}"`)]));
}

export async function retireHistory({ catalogPath, archiveDir, mapping, approvedHash, expectedCounts, rehearsal = false, afterArchive = null, beforeSwap = null }) {
  if (!rehearsal) checkClosed();
  if (existsSync(archiveDir)) throw new Error('Archive directory already exists.');
  const original = readFileSync(catalogPath), sourceHash = sha(original);
  if (sourceHash !== approvedHash) throw new Error('Catalog differs from the approved inventory. Nothing written.');
  const cat = await open(original);
  let staged;
  try {
    const before = allTables(cat);
    const selected = TABLES.flatMap(table => before[table].flatMap(row => {
      const reasons = incompatible(row, mapping);
      return reasons.length ? [{ table, row, reasons }] : [];
    }));
    const counts = Object.fromEntries(TABLES.map(table => [table, selected.filter(e => e.table === table).length]));
    if (!same(counts, expectedCounts)) throw new Error('Retirement counts differ from the approved inventory. Nothing written.');
    mkdirSync(path.join(archiveDir, 'records'), { recursive: true });
    copyFileSync(catalogPath, path.join(archiveDir, 'library.before.db'));
    if (sha(readFileSync(path.join(archiveDir, 'library.before.db'))) !== sourceHash) throw new Error('Catalog backup verification failed.');
    const entries = selected.map(({ table, row, reasons }, i) => {
      const file = `records/${table}-${i + 1}.json`, bytes = Buffer.from(encode(row));
      writeFileSync(path.join(archiveDir, file), bytes);
      return { table, id: row.id, seasonId: row.season_id, file, size: bytes.length, sha256: sha(bytes), bodyHash: sha(row.body_json), reasons };
    });
    const manifest = { source: catalogPath, sourceHash, mappingHash: sha(JSON.stringify(mapping)), counts, entries };
    const manifestFile = path.join(archiveDir, 'MANIFEST.json');
    writeFileSync(manifestFile, JSON.stringify(manifest, null, 2));
    writeFileSync(path.join(archiveDir, 'MANIFEST.sha256'), sha(readFileSync(manifestFile)) + '\n');
    if (rehearsal && afterArchive) afterArchive(manifest);
    const verified = JSON.parse(readFileSync(manifestFile, 'utf8'));
    if (!same(verified, manifest) || readFileSync(path.join(archiveDir, 'MANIFEST.sha256'), 'utf8').trim() !== sha(readFileSync(manifestFile))) throw new Error('Archive manifest verification failed.');
    for (const entry of verified.entries) {
      const bytes = readFileSync(path.join(archiveDir, entry.file));
      const current = before[entry.table].find(row => row.id === entry.id);
      if (bytes.length !== entry.size || sha(bytes) !== entry.sha256 || !current || bytes.toString('utf8') !== encode(current) || sha(current.body_json) !== entry.bodyHash) throw new Error('Archived record verification failed.');
      cat._run(`DELETE FROM ${entry.table} WHERE id = ? AND body_json = ?`, [entry.id, current.body_json]);
    }
    const after = allTables(cat);
    for (const [table, rows] of Object.entries(before)) {
      const removed = new Set(entries.filter(e => e.table === table).map(e => e.id));
      if (!same(ordered(rows.filter(row => !removed.has(row.id))), ordered(after[table]))) throw new Error(`Unexpected catalog change in ${table}.`);
    }
    const bytes = cat.toBytes(), convertedHash = sha(bytes);
    const reread = await open(bytes);
    try {
      if (!same(Object.fromEntries(Object.entries(after).map(([t, r]) => [t, ordered(r)])), Object.fromEntries(Object.entries(allTables(reread)).map(([t, r]) => [t, ordered(r)])))) throw new Error('Catalog read-back mismatch.');
    } finally { reread.close(); }
    const receiptFile = path.join(archiveDir, 'REMOVAL-RECEIPT.json');
    writeFileSync(receiptFile, JSON.stringify({ status: 'ARCHIVED_AND_VERIFIED', sourceHash, convertedHash, counts }, null, 2));
    staged = path.join(path.dirname(catalogPath), `library.db.pending-${randomUUID()}`);
    const fd = openSync(staged, 'wx');
    try { writeFileSync(fd, bytes); fsyncSync(fd); } finally { closeSync(fd); }
    if (sha(readFileSync(staged)) !== convertedHash) throw new Error('Staged catalog verification failed.');
    if (rehearsal && beforeSwap) beforeSwap();
    if (!rehearsal) checkClosed();
    if (sha(readFileSync(path.join(archiveDir, 'library.before.db'))) !== sourceHash) throw new Error('Catalog backup changed after verification.');
    if (sha(readFileSync(catalogPath)) !== sourceHash) throw new Error('Catalog changed after archive. Nothing removed.');
    renameSync(staged, catalogPath); staged = null;
    if (sha(readFileSync(catalogPath)) !== convertedHash) throw new Error('Live read-back mismatch; restore library.before.db.');
    const live = await open(readFileSync(catalogPath));
    try {
      if (!same(Object.fromEntries(Object.entries(after).map(([t, r]) => [t, ordered(r)])), Object.fromEntries(Object.entries(allTables(live)).map(([t, r]) => [t, ordered(r)])))) throw new Error('Live record verification failed; restore library.before.db.');
    } finally { live.close(); }
    for (const entry of entries) if (sha(readFileSync(path.join(archiveDir, entry.file))) !== entry.sha256) throw new Error('Archive changed after removal.');
    const receipt = { status: 'REMOVED_AND_VERIFIED', sourceHash, liveHash: convertedHash, counts, kept: Object.fromEntries(TABLES.map(t => [t, after[t].length])), manifestHash: sha(readFileSync(manifestFile)), completedAt: new Date().toISOString() };
    writeFileSync(receiptFile, JSON.stringify(receipt, null, 2));
    if (!same(JSON.parse(readFileSync(receiptFile, 'utf8')), receipt)) throw new Error('Receipt verification failed.');
    return receipt;
  } finally {
    cat.close();
    if (staged && existsSync(staged)) rmSync(staged);
  }
}
