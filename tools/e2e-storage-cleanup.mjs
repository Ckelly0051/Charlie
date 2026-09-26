/* The one-time, hash-guarded removal of retired storage keys (js/storage-cleanup.js;
   legacy excision Pass 2b, coach direction 2026-09-26).

   1. The owner, on injected targets: a matching value is removed and read back
      gone; a mismatch, a value changed during the check, and a missing digest are
      refused with the value untouched; an absent key is a no-op; a removal that
      does not land records no marker and is retried; the marker makes it once-only.
   2. The production targets are exactly the three archived keys with their
      archived hashes (checked against the archive manifests when this machine
      has them), and the browser digest equals the archive's UTF-8 SHA-256.
   3. The real app at boot: a production key holding a DIFFERENT value is refused
      and kept; on this machine, the archived bytes themselves are removed and
      verified gone, with the archive files unchanged.

   Run after build: node tools/e2e-storage-cleanup.mjs */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { StorageCleanup } from '../js/storage-cleanup.js';

let pass = 0, fail = 0;
const ok = (c, label, d = '') => c ? (pass++, console.log('  PASS  ' + label)) : (fail++, console.log('  FAIL  ' + label + (d ? ' -- ' + d : '')));
const sha = s => crypto.createHash('sha256').update(Buffer.from(s, 'utf8')).digest('hex');
class Mem { constructor(seed = {}) { this.m = new Map(Object.entries(seed)); } getItem(k) { return this.m.has(k) ? this.m.get(k) : null; } setItem(k, v) { this.m.set(k, String(v)); } removeItem(k) { this.m.delete(k); } }

console.log('\n== 1. The owner, on injected targets ==');
{
  const A = '[{"id":1,"data":{"plays":[]}}]', B = '[{"num":"7","name":"Ames é 🏈"}]', C = '[]';
  const targets = [{ key: 'k_a', sha256: sha(A), archive: 'x' }, { key: 'k_b', sha256: sha(B), archive: 'x' }, { key: 'k_c', sha256: sha(C), archive: 'x' }, { key: 'k_absent', sha256: sha('z'), archive: 'x' }];
  const st = new Mem({ k_a: A, k_b: B, k_c: '[ ]', keep: 'other' });
  const r = await StorageCleanup.run({ storage: st, targets, marker: 'm1' });
  const by = k => r.report.results.find(x => x.key === k);
  ok(by('k_a').status === 'removed' && st.getItem('k_a') === null && by('k_b').status === 'removed' && st.getItem('k_b') === null,
    'a value that hashes to its archive is removed and read back gone (non-ASCII included)', JSON.stringify(r.report));
  ok(by('k_c').status === 'refused' && /does not match/.test(by('k_c').reason) && st.getItem('k_c') === '[ ]',
    'a different value is refused and left byte for byte', JSON.stringify(by('k_c')));
  ok(by('k_absent').status === 'absent', 'an absent key is a no-op');
  ok(st.getItem('keep') === 'other', 'no other key is touched');
  ok(JSON.parse(st.getItem('m1')).results.length === 4, 'the outcome is recorded under the marker');
  st.setItem('k_a', A);
  const again = await StorageCleanup.run({ storage: st, targets, marker: 'm1' });
  ok(again.skipped && st.getItem('k_a') === A, 'with the marker present it never runs again', JSON.stringify(again));

  // A removal that does not land: no marker, retried next launch.
  const stuck = new Mem({ k_a: A }); stuck.removeItem = () => {};
  const f = await StorageCleanup.run({ storage: stuck, targets: [targets[0]], marker: 'm2' });
  ok(f.report.results[0].status === 'failed' && /still present/.test(f.report.results[0].reason) && stuck.getItem('m2') === null && stuck.getItem('k_a') === A,
    'a removal that does not land is reported failed, writes no marker, and keeps the value', JSON.stringify(f.report));
  delete stuck.removeItem;
  const retry = await StorageCleanup.run({ storage: stuck, targets: [targets[0]], marker: 'm2' });
  ok(retry.report.results[0].status === 'removed' && stuck.getItem('k_a') === null, 'the next launch retries and removes it');

  // The value changes while the digest is awaited.
  const shifty = new Mem({ k_a: A }); let reads = 0; const get = shifty.getItem.bind(shifty);
  shifty.getItem = k => (k === 'k_a' && ++reads === 2 ? A + ' ' : get(k));
  const s = await StorageCleanup.run({ storage: shifty, targets: [targets[0]], marker: 'm3' });
  ok(s.report.results[0].status === 'refused' && /changed during/.test(s.report.results[0].reason) && get('k_a') === A,
    'a value that changes during the check is refused and kept', JSON.stringify(s.report));

  // No digest available: refused, never removed on trust.
  const realSha = StorageCleanup.sha256; StorageCleanup.sha256 = async () => null;
  const nd = new Mem({ k_a: A });
  const n = await StorageCleanup.run({ storage: nd, targets: [targets[0]], marker: 'm4' });
  StorageCleanup.sha256 = realSha;
  ok(n.report.results[0].status === 'failed' && nd.getItem('k_a') === A && nd.getItem('m4') === null, 'with no SHA-256 available nothing is removed', JSON.stringify(n.report));
}

console.log('\n== 2. The production targets are the archived keys and hashes ==');
const PINNED = {
  ffa_versions_default: '94cf7f7e0cf3c96770557ba877250eb85c280d73b49d803635ca8fba33c7a9a6',
  ffa_roster: '8a631d3fb45847cb737f2a1a3a645d2a714bb82073d95078556847d720f5a8c7',
  ffa_roster_mavericks: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945',
};
ok(JSON.stringify(StorageCleanup.TARGETS.map(t => [t.key, t.sha256])) === JSON.stringify(Object.entries(PINNED)),
  'exactly three targets, each with its archived SHA-256, and nothing scoped', JSON.stringify(StorageCleanup.TARGETS));
ok(await StorageCleanup.sha256('Ames é 🏈') === sha('Ames é 🏈'), 'the browser digest is the archive hash (SHA-256 of UTF-8 bytes)');
const BACKUPS = 'C:/Users/charl/GridIronIQ-Backups';
const ARCHIVES = { 'unscoped-version-history-2026-09-26': 'e7ee139626d15e66568020bd8378a765efbd3675c5b36e46735e2e1c96b90fd0',
  'retired-roster-keys-2026-09-26': '2a1458c7a6c998ac454401007e5a89c74df558cf9fbb96dc891b88e1e6e11e05' };
const haveArchives = Object.keys(ARCHIVES).every(a => fs.existsSync(path.join(BACKUPS, a, 'manifest.json')));
const archiveFingerprint = () => Object.keys(ARCHIVES).flatMap(a => fs.readdirSync(path.join(BACKUPS, a), { recursive: true })
  .map(f => path.join(BACKUPS, a, String(f))).filter(f => fs.statSync(f).isFile()).sort()
  .map(f => f + ':' + crypto.createHash('sha256').update(fs.readFileSync(f)).digest('hex'))).join('\n');
let archived = null, before = null;
if (!haveArchives) {
  console.log('  SKIP  archive cross-checks: the archives are not on this machine (the pinned hashes above still hold)');
} else {
  before = archiveFingerprint();
  const manifests = Object.fromEntries(Object.keys(ARCHIVES).map(a => [a, fs.readFileSync(path.join(BACKUPS, a, 'manifest.json'))]));
  ok(Object.entries(ARCHIVES).every(([a, h]) => crypto.createHash('sha256').update(manifests[a]).digest('hex') === h), 'both archive manifests are the ones recorded');
  archived = {};
  const rows = StorageCleanup.TARGETS.map(t => {
    const m = JSON.parse(manifests[t.archive].toString('utf8')).keys.find(k => k.key === t.key);
    const bytes = fs.readFileSync(path.join(BACKUPS, t.archive, m.file));
    archived[t.key] = bytes.toString('utf8');
    return { key: t.key, manifest: m.sha256 === t.sha256, file: crypto.createHash('sha256').update(bytes).digest('hex') === t.sha256 };
  });
  ok(rows.every(r => r.manifest && r.file), 'every target hash equals its manifest entry and its archived file', JSON.stringify(rows));
}

console.log('\n== 3. The real app at boot ==');
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const boot = async (seed) => {
  const page = await browser.newPage();
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.evaluateOnNewDocument(s => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); sessionStorage.setItem('seeded', '1'); } }, seed);
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await page.waitForFunction(() => !!window.app?.storageCleanup, { timeout: 15000 });
  const out = await page.evaluate(async keys => {
    await window.app.storageCleanup;
    return { marker: JSON.parse(localStorage.getItem('giq_storage_cleanup_2026_09_26') || 'null'), values: Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)])) };
  }, Object.keys(PINNED));
  await page.close();
  return { ...out, errors };
};
{
  const r = await boot({ ffa_roster: '[{"num":"99","name":"Not archived"}]', ffa_teams: '[]' });
  const res = k => r.marker?.results?.find(x => x.key === k)?.status;
  ok(res('ffa_roster') === 'refused' && r.values.ffa_roster === '[{"num":"99","name":"Not archived"}]',
    'boot refuses a production key whose value is not the archived one, and keeps it', JSON.stringify(r.marker));
  ok(res('ffa_versions_default') === 'absent' && res('ffa_roster_mavericks') === 'absent', 'boot treats absent targets as no-ops');
  ok(!r.errors.length, 'no page errors', r.errors.join(' | '));
}
if (archived) {
  const r = await boot({ ...archived, ffa_teams: '[]' });
  const statuses = Object.keys(PINNED).map(k => [k, r.marker?.results?.find(x => x.key === k)?.status]);
  ok(statuses.every(([, s]) => s === 'removed') && Object.values(r.values).every(v => v === null),
    'boot removes exactly the three archived values and verifies each is gone', JSON.stringify({ statuses, values: Object.keys(r.values) }));
  ok(archiveFingerprint() === before, 'the archives are unchanged');
  ok(!r.errors.length, 'no page errors', r.errors.join(' | '));
}
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
