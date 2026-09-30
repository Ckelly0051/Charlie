/** Throwaway archive/removal proof. Synthetic catalogs only. */
import { readFileSync, writeFileSync, mkdirSync, mkdtempSync, existsSync, rmSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import os from 'node:os';
import path from 'node:path';
import { SqlCatalog } from '../js/sql-catalog.js';
import { retireHistory } from './archive-charting-history-once.mjs';
const sha = b => createHash('sha256').update(b).digest('hex');
let pass = 0, fail = 0;
const ok = (v, name) => { console.log(`  ${v ? 'PASS' : 'FAIL'}  ${name}`); v ? pass++ : fail++; };
const SQL = await (await import('sql.js')).default();
const tmp = mkdtempSync(path.join(os.tmpdir(), 'giq-history-archive-'));
const mapping = { tokens: {}, plays: {} };
async function fixture(dir) {
  mkdirSync(dir, { recursive: true });
  const cat = new SqlCatalog(SQL); await cat.open();
  const play = { id: 1, notes: 'keep', tags: { unit: 'offense', formation: 'Power-I' } };
  const good = { version: 5, type: 'season', id: 's', seasonName: 'S', games: [{ id: 'g', name: 'G', gameInfo: {}, plays: [play] }], roster: [] };
  const bad = structuredClone(good); bad.games[0].plays[0].tags.stType = 'Kickoff';
  cat.saveSeason(good); cat.createBackup('s', good, 'keep'); cat.createBackup('s', bad, 'retire');
  cat.saveVersion('s', 'g', { id: 'keep', plays: good.games[0].plays });
  cat.saveVersion('s', 'g', { id: 'retire', plays: bad.games[0].plays });
  const bytes = cat.toBytes(), file = path.join(dir, 'library.db'); writeFileSync(file, bytes); cat.close(); return file;
}
try {
  const file = await fixture(path.join(tmp, 'ok')), original = readFileSync(file);
  const archiveDir = path.join(tmp, 'archive');
  const args = { catalogPath: file, archiveDir, mapping, approvedHash: sha(original), expectedCounts: { backups: 1, versions: 1 }, rehearsal: true };
  const receipt = await retireHistory(args);
  ok(receipt.status === 'REMOVED_AND_VERIFIED' && receipt.counts.backups === 1 && receipt.counts.versions === 1, 'only inventoried incompatible records are removed');
  ok(receipt.kept.backups === 1 && receipt.kept.versions === 1, 'compatible restore points and versions remain');
  ok(sha(readFileSync(path.join(archiveDir, 'library.before.db'))) === sha(original), 'complete original catalog is archived byte for byte');
  const manifest = JSON.parse(readFileSync(path.join(archiveDir, 'MANIFEST.json')));
  ok(manifest.entries.every(e => sha(readFileSync(path.join(archiveDir, e.file))) === e.sha256), 'all raw row archives read back with exact hashes');
  ok(readFileSync(path.join(archiveDir, 'MANIFEST.sha256'), 'utf8').trim() === sha(readFileSync(path.join(archiveDir, 'MANIFEST.json'))), 'manifest hash verifies');
  const a = new SqlCatalog(SQL), b = new SqlCatalog(SQL); await a.open(original); await b.open(readFileSync(file));
  ok(JSON.stringify(a._all('SELECT * FROM plays')) === JSON.stringify(b._all('SELECT * FROM plays')) && JSON.stringify(a._all('SELECT * FROM games')) === JSON.stringify(b._all('SELECT * FROM games')) && JSON.stringify(a._all('SELECT * FROM seasons')) === JSON.stringify(b._all('SELECT * FROM seasons')), 'live plays, games and seasons are unchanged');
  ok(JSON.stringify(a._all("SELECT * FROM versions WHERE id = 'keep'")) === JSON.stringify(b._all("SELECT * FROM versions WHERE id = 'keep'")), 'compatible history body and metadata are unchanged');
  a.close(); b.close();
  const corrupt = await fixture(path.join(tmp, 'corrupt')), corruptHash = sha(readFileSync(corrupt)); let corruptError;
  const corruptArchive = path.join(tmp, 'corrupt-archive');
  try { await retireHistory({ ...args, catalogPath: corrupt, archiveDir: corruptArchive, approvedHash: corruptHash, afterArchive: manifest => writeFileSync(path.join(corruptArchive, manifest.entries[0].file), '{}') }); } catch (e) { corruptError = e; }
  ok(/verification failed/.test(corruptError?.message || '') && sha(readFileSync(corrupt)) === corruptHash, 'an archived row with a mismatched hash prevents every live removal');
  for (const [name, change] of [['wrong source hash', { approvedHash: 'wrong' }], ['wrong counts', { expectedCounts: { backups: 0, versions: 1 } }]]) {
    const input = await fixture(path.join(tmp, name)), hash = sha(readFileSync(input)); let error;
    try { await retireHistory({ ...args, catalogPath: input, archiveDir: path.join(tmp, name + '-archive'), approvedHash: hash, ...change }); } catch (e) { error = e; }
    ok(!!error && sha(readFileSync(input)) === hash, `${name} refuses without modifying source`);
  }
  const race = await fixture(path.join(tmp, 'race')), raceHash = sha(readFileSync(race)); let raceError;
  try { await retireHistory({ ...args, catalogPath: race, archiveDir: path.join(tmp, 'race-archive'), approvedHash: raceHash, beforeSwap: () => writeFileSync(race, Buffer.concat([readFileSync(race), Buffer.from([0])])) }); } catch (e) { raceError = e; }
  ok(/changed after archive/.test(raceError?.message || '') && !readdirSync(path.dirname(race)).some(n => n.includes('.pending-')), 'a concurrent catalog change refuses replacement and removes its own staged file');
  ok(JSON.parse(readFileSync(path.join(tmp, 'race-archive', 'REMOVAL-RECEIPT.json'))).status === 'ARCHIVED_AND_VERIFIED', 'an aborted swap never reports removal success');
  ok(!readdirSync(path.dirname(file)).some(n => n.includes('.pending-')), 'successful removal leaves no staged file');
} finally { rmSync(tmp, { recursive: true, force: true }); }
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
