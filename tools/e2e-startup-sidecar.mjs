/* STARTUP NEVER ADOPTS A LEFTOVER SIDECAR (Node) ------------------------------
   A per-season `seasons/<id>/season.json` left on disk is not data. Desktop
   catalog startup must not import it, read it into the catalog or modify it,
   even when the library index lists that season and the catalog has no row.
   Explicit, confirmed recovery from the Documents mirror stays available.

   Run:  node tools/e2e-startup-sidecar.mjs */
import { TauriBackend } from '../js/storage-backend.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SnapshotEnvelope } from '../js/snapshot-envelope.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const season = (id, name) => ({
  version: 5, type: 'season', id, seasonName: name, activeGameId: id + '-g1', revision: 3,
  teamProfile: { teamName: name }, roster: [],
  games: [{ id: id + '-g1', name: 'G1', gameInfo: {}, status: 'active', nextId: 2, currentPlayId: null,
    videoFileName: '', clipNames: [], isMultiClip: false, annotations: [],
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, clipId: null, clipName: '', notes: '', annotations: [], tags: { unit: 'offense', custom: [] } }] }],
});

const SIDECAR = 'seasons/s1/season.json';
const files = new Map([
  ['library.json', JSON.stringify([{ id: 's1', name: 'Leftover' }])],
  [SIDECAR, JSON.stringify(season('s1', 'Leftover'))],
]);
const sidecarBefore = files.get(SIDECAR);
const ops = [];
const fs = {
  BaseDirectory: { AppData: 1, Document: 2 },
  exists: async p => files.has(p) || [...files.keys()].some(k => k.startsWith(p + String.fromCharCode(47))),
  readTextFile: async p => { ops.push(['readText', p]); if (!files.has(p)) throw new Error('missing ' + p); return files.get(p); },
  readFile: async p => { ops.push(['read', p]); if (!files.has(p)) throw new Error('missing ' + p); return files.get(p); },
  writeTextFile: async (p, t) => { ops.push(['writeText', p]); files.set(p, t); },
  writeFile: async (p, b) => { ops.push(['write', p]); files.set(p, b); },
  mkdir: async () => {},
  remove: async p => { ops.push(['remove', p]); files.delete(p); },
  readDir: async () => [],
};
globalThis.window = globalThis.window || {};
window.__TAURI__ = { core: { invoke: async (cmd, args) => {
  ops.push(['invoke', cmd]);
  if (cmd === 'replace_catalog_db') { const tmp = `seasons/${args.tempName}`; files.set('seasons/library.db', files.get(tmp)); files.delete(tmp); }
} } };

const SQL = await (await import('sql.js')).default();
const be = Object.create(TauriBackend.prototype);
Object.assign(be, { fs, baseDir: 1, mirrorDir: 2, MIRROR_ROOT: 'GridIron IQ', LIB: 'library.json', OLD_LAYOUT: 'season.json', _lastWrite: 0, _dirReady: {} });
be._sqlFlag = () => true;
be._loadSqlEngine = async () => SQL;

console.log('\n-- 1. catalog startup with a leftover season.json --');
const cp = await be._ensureCatalog();
ok(!!cp, 'the catalog opens');
let loaded = 'unset';
try { loaded = await be.loadSeason('s1'); } catch (e) { loaded = 'threw: ' + e.message; }
ok(loaded === null, 'the leftover season is not in the catalog', JSON.stringify(loaded && loaded.seasonName || loaded));
ok(files.get(SIDECAR) === sidecarBefore, 'the leftover file is byte-for-byte unchanged');
const touched = ops.filter(([op, p]) => p === SIDECAR);
ok(touched.length === 0, 'startup never reads, writes or removes the leftover file', JSON.stringify(touched));
ok(!ops.some(([op]) => op === 'invoke' || op === 'write'), 'startup writes no catalog bytes', JSON.stringify(ops.filter(([op]) => op !== 'readText' && op !== 'read')));

console.log('\n-- 2. explicit, confirmed recovery still works --');
files.set('GridIron IQ/seasons/s2/season.json', JSON.stringify(SnapshotEnvelope.wrap('s2', season('s2', 'Mirrored'))));
fs.readDir = async (p) => p === 'GridIron IQ/seasons' ? [{ name: 's2', isDirectory: true }] : [];
let scanned = [];
try { scanned = await be.scanRecoverableSeasons(); } catch (e) { scanned = ['threw: ' + e.message]; }
ok(scanned.some(c => c.id === 's2' && c.valid), 'a mirror snapshot is offered as a recovery candidate', JSON.stringify(scanned));
let recovered = null;
try { recovered = await be.recoverSeasonFromMirror('s2', { confirmOverwrite: false }); } catch (e) { recovered = { threw: e.message }; }
const after = await be.loadSeason('s2').catch(e => 'threw: ' + e.message);
ok(recovered && recovered.ok && after && after.seasonName === 'Mirrored', 'the confirmed import lands it in the catalog', JSON.stringify({ recovered, name: after && after.seasonName }));
ok(files.get(SIDECAR) === sidecarBefore, 'the leftover s1 file is still untouched');

console.log('\n-- 3. no startup import path remains --');
ok(typeof CatalogPersistence.prototype.migrateJsonSeasons !== 'function', 'CatalogPersistence has no JSON migration');
ok(typeof TauriBackend.prototype.takeOldFormatRefusals !== 'function', 'the backend has no migration refusal hand-off');
ok(!('readJson' in be._catalogFs()), 'the catalog fs adapter offers no per-season JSON reader');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
