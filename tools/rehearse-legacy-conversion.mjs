// Rehearse convert-legacy-once.mjs --apply on scratch copies of app data and the
// Documents mirror: the happy path plus every refusal. The real catalog is only read.
//   node tools/rehearse-legacy-conversion.mjs <scratch dir> <impact.json from a dry run>
// One-time; delete with convert-legacy-once.mjs.
import { cpSync, rmSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { LIVE_CATALOG } from './audit-legacy.mjs';
import { apply, legacyRemaining } from './convert-legacy-once.mjs';
import { SqlCatalog } from '../js/sql-catalog.js';
const root = process.argv[2], approvedPath = process.argv[3];
const sha = p => createHash('sha256').update(readFileSync(p)).digest('hex');
const liveBefore = sha(LIVE_CATALOG);
let pass = 0, fail = 0; const ok = (c, l, d = '') => c ? (pass++, console.log('  PASS  ' + l)) : (fail++, console.log('  FAIL  ' + l + (d ? ' -- ' + d : '')));
const fresh = name => {
  const dir = path.join(root, name); rmSync(dir, { recursive: true, force: true });
  const app = path.join(dir, 'com.gridironiq.app');
  cpSync(path.dirname(path.dirname(LIVE_CATALOG)), app, { recursive: true, filter: s => path.basename(s) !== 'films' });
  cpSync('C:/Users/charl/OneDrive/Documents/GridIron IQ', path.join(dir, 'mirror'), { recursive: true });
  return { dir, catalog: path.join(app, 'seasons', 'library.db'), mirror: path.join(dir, 'mirror'), backup: path.join(dir, 'backup') };
};
const refuses = async (label, opts, expect, check) => {
  try { await apply({ rehearsal: true, ...opts }); ok(false, label, 'did not refuse'); }
  catch (e) { ok(expect.test(e.message), label, e.message); if (check) check(); }
};

// 1. Happy path.
let f = fresh('happy');
const r = await apply({ backupDir: f.backup, approvedPath, catalogPath: f.catalog, mirror: f.mirror, rehearsal: true });
const manifest = JSON.parse(readFileSync(path.join(f.backup, 'manifest.json'), 'utf8'));
ok(r.ok && r.liveHash === r.report.convertedHash, 'approved impact: converts, swaps, re-reads clean', JSON.stringify(r.after));
ok(manifest.every(m => sha(m.backup) === m.sha256) && manifest.some(m => m.source.endsWith('library.json')), `every backed-up file (${manifest.length}, library.json included) matches its recorded hash`);
ok(!readdirSync(path.dirname(f.catalog)).some(n => n.startsWith('library.db.pending-')), 'no staging file left behind');

// 2. Changed input since the review.
f = fresh('changed');
appendFileSync(f.catalog, Buffer.from('x')); const changedHash = sha(f.catalog);
await refuses('a catalog that changed since the dry run is refused before any backup or write',
  { backupDir: f.backup, approvedPath, catalogPath: f.catalog, mirror: f.mirror }, /not the catalog that was reviewed/,
  () => ok(sha(f.catalog) === changedHash, 'refused run left the catalog bytes as they were'));

// 3. Different effect than approved.
f = fresh('impact');
const tampered = JSON.parse(readFileSync(approvedPath, 'utf8'));
const first = Object.keys(tampered.counts)[0]; tampered.counts[first].recharts += 1;
const tamperedPath = path.join(f.dir, 'impact-tampered.json'); writeFileSync(tamperedPath, JSON.stringify(tampered));
const beforeImpact = sha(f.catalog);
await refuses('an effect different from the approved impact is refused', { backupDir: f.backup, approvedPath: tamperedPath, catalogPath: f.catalog, mirror: f.mirror },
  /differs from the approved impact/, () => ok(sha(f.catalog) === beforeImpact, 'catalog unchanged after an impact mismatch'));

// 4. The app writes between the backup and the swap.
f = fresh('race');
let raced = null;
await refuses('a write landing just before the swap is caught by the last re-check', {
  backupDir: f.backup, approvedPath, catalogPath: f.catalog, mirror: f.mirror,
  onBeforeSwap: () => { appendFileSync(f.catalog, Buffer.from('app-save')); raced = sha(f.catalog); },
}, /changed after the backup/, () => {
  ok(sha(f.catalog) === raced, 'the newer catalog is kept, not replaced');
  ok(!readdirSync(path.dirname(f.catalog)).some(n => n.startsWith('library.db.pending-')), 'the staging file is removed on refusal');
});

// 5. Existing backup folder.
f = fresh('dup');
await apply({ backupDir: f.backup, approvedPath, catalogPath: f.catalog, mirror: f.mirror, rehearsal: true });
await refuses('a second run into the same backup folder is refused', { backupDir: f.backup, approvedPath, catalogPath: f.catalog, mirror: f.mirror }, /already exists/);

// 6. Two seasons with the same name: a dirty one must not hide behind a clean one.
{
  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL); await cat.open();
  const season = (id, tags) => ({ id, seasonName: 'Same', games: [{ id: `${id}-g`, name: 'G', plays: [{ id: 1, timestamp: { start: 0, end: 1 }, tags }] }] });
  cat.saveSeason(season('dirty', { formation: 'Under Center + Flexbone', playType: 'Run Inside' }));
  cat.saveSeason(season('clean', { unit: 'offense', formation: 'Flexbone', qbAlignment: 'Under Center', backfield: '', playType: 'Run Inside' }));
  const rem = legacyRemaining(cat);
  ok(Object.keys(rem).length === 2 && rem.dirty?.total > 0 && rem.clean?.total === 0 && rem.dirty.name === 'Same',
    'duplicate season names: each season is checked under its own ID and the dirty one is not hidden', JSON.stringify(rem));
}

ok(sha(LIVE_CATALOG) === liveBefore, 'the real live catalog was never touched');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
