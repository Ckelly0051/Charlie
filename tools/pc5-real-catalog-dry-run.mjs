/* PC-5 real-catalog dry run -- GridIron IQ Desktop Persistence Convergence.
 *
 * Exercises the FULL production write path (SeasonStore -> TauriBackend ->
 * CatalogPersistence -> SqlCatalog, the exact stack PC-1 through PC-4 built
 * and hardened this session) against an ISOLATED, BYTE-VERIFIED COPY of the
 * coach's real two-season catalog. The LIVE files under
 * %APPDATA%\com.gridironiq.app are NEVER opened for writing anywhere in this
 * script -- every write-capable operation targets only the copy directory
 * passed as DRYRUN_ROOT. Film is never copied, read, or referenced (plan
 * Invariant #8 / Out of Scope).
 *
 * This is a coach-machine-specific diagnostic, not a portable regression
 * test -- it is deliberately NOT named tools/e2e-*.mjs so it is never swept
 * into the CI gate, and it requires the real seasons to already exist on
 * disk (created by the PC-5 forensic-backup + isolated-copy steps recorded
 * in CLAUDE.md). Run manually:
 *
 *   node tools/pc5-real-catalog-dry-run.mjs "<absolute path to the copy's appdata dir>" "<absolute path to the LIVE library.db, read-only>"
 *
 * The 8 phases below match the coach's own explicit protocol verbatim.
 */
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import initSqlJs from 'sql.js';
import { SqlCatalog } from '../js/sql-catalog.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SeasonStore } from '../js/season-store.js';
import { TauriBackend } from '../js/storage-backend.js';

const APPDATA_ROOT = process.argv[2];
const LIVE_DB_PATH = process.argv[3];
if (!APPDATA_ROOT || !LIVE_DB_PATH) {
  console.error('Usage: node tools/pc5-real-catalog-dry-run.mjs <appdata-copy-dir> <live-library.db-path>');
  process.exit(2);
}
const DOCUMENTS_ROOT = path.join(path.dirname(APPDATA_ROOT), 'documents');

let pass = 0, fail = 0, findings = [];
const ok = (label, cond, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; findings.push(label + (extra ? ` -- ${extra}` : '')); console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const section = (t) => { console.log(''); console.log(t); };

if (!globalThis.window) globalThis.window = globalThis;
if (!globalThis.document) globalThis.document = { getElementById: () => null };

// ---- stable, deterministic fingerprint --------------------------------------
function stableStringify(v) {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return '[' + v.map(stableStringify).join(',') + ']';
  const keys = Object.keys(v).sort();
  return '{' + keys.map(k => JSON.stringify(k) + ':' + stableStringify(v[k])).join(',') + '}';
}
function sha(s) { return crypto.createHash('sha256').update(s).digest('hex'); }

// A restore is itself a genuine durable commit (SeasonStore.restoreBackup()
// calls persist() on the restored data), so per the monotonic-revision
// invariant this whole persistence body of work enforces, its revision
// legitimately advances past the pre-snapshot value even though every OTHER
// field reverts exactly -- a restored season must never look "stale" to a
// later revision fence merely because it carries an old revision number.
// Compare everything else exactly; revision only needs to have moved, never
// to match.
function sameContentIgnoringRevision(a, b) {
  const { revision: ra, ...restA } = a;
  const { revision: rb, ...restB } = b;
  return stableStringify(restA) === stableStringify(restB);
}

function fingerprintSeason(data) {
  const games = data.games.map(g => {
    const plays = (g.plays || []).slice().sort((a, b) => String(a.id).localeCompare(String(b.id)));
    const playsBlob = plays.map(p => ({ id: p.id, notes: p.notes || '', tags: p.tags || {}, specialTeams: p.specialTeams || null }));
    return {
      id: g.id, name: g.name, status: g.status,
      playCount: plays.length,
      filmMode: g.filmMode || null,
      filmDir: g.filmDir || null,
      isMultiClip: !!g.isMultiClip,
      clipCount: (g.clipNames || []).length,
      playsHash: sha(stableStringify(playsBlob)),
    };
  }).sort((a, b) => a.id.localeCompare(b.id));
  return {
    id: data.id,
    seasonName: data.seasonName,
    revision: Number.isInteger(data.revision) && data.revision >= 0 ? data.revision : 0,
    gameCount: games.length,
    totalPlays: games.reduce((s, g) => s + g.playCount, 0),
    activeGameId: data.activeGameId,
    games,
  };
}

// ---- fake fs adapter over the copy directory (baseDir 14=AppData, 1=Document) --
function makeFsAdapter() {
  const rootFor = (opts) => (opts && opts.baseDir === 1) ? DOCUMENTS_ROOT : APPDATA_ROOT;
  const abs = (p, opts) => path.join(rootFor(opts), p);
  return {
    exists: async (p, opts) => fs.existsSync(abs(p, opts)),
    readTextFile: async (p, opts) => fs.readFileSync(abs(p, opts), 'utf8'),
    writeTextFile: async (p, text, opts) => { fs.mkdirSync(path.dirname(abs(p, opts)), { recursive: true }); fs.writeFileSync(abs(p, opts), text, 'utf8'); },
    mkdir: async (p, opts) => { fs.mkdirSync(abs(p, opts), { recursive: true }); },
    writeFile: async (p, bytes, opts) => { fs.mkdirSync(path.dirname(abs(p, opts)), { recursive: true }); fs.writeFileSync(abs(p, opts), Buffer.from(bytes)); },
    readFile: async (p, opts) => new Uint8Array(fs.readFileSync(abs(p, opts))),
    remove: async (p, opts) => { try { fs.rmSync(abs(p, opts)); } catch (e) {} },
    readDir: async (p, opts) => {
      const full = abs(p, opts);
      if (!fs.existsSync(full)) return [];
      return fs.readdirSync(full, { withFileTypes: true }).map(d => ({ name: d.name, isDirectory: d.isDirectory() }));
    },
  };
}

async function makeBackend(SQL) {
  globalThis.window.__TAURI__ = { fs: { BaseDirectory: { AppData: 14, Document: 1 } } };
  const be = new TauriBackend();
  be.fs = makeFsAdapter();
  be._loadSqlEngine = async () => SQL;
  return be;
}

const SQL = await initSqlJs();

console.log(`DRYRUN_ROOT (writable copy): ${APPDATA_ROOT}`);
console.log(`LIVE_DB (read-only source):  ${LIVE_DB_PATH}`);

// ============================================================================
// Phase 1 -- fingerprint the LIVE catalog, read-only. This SqlCatalog instance
// is never saved, never exported, never written anywhere -- listSeasons()/
// loadSeason() are the only calls made on it.
// ============================================================================
section('Phase 1 -- fingerprint the live catalog (read-only)');
const liveBytes = fs.readFileSync(LIVE_DB_PATH);
const liveCatalog = new SqlCatalog(SQL);
await liveCatalog.open(new Uint8Array(liveBytes));
const liveMetas = liveCatalog.listSeasons();
ok('live catalog lists exactly 2 seasons', liveMetas.length === 2, JSON.stringify(liveMetas.map(m => m.id)));
const liveFingerprints = {};
for (const meta of liveMetas) {
  const data = liveCatalog.loadSeason(meta.id);
  liveFingerprints[meta.id] = fingerprintSeason(data);
}
const jvId = liveMetas.find(m => m.games === 6)?.id;
const varsityId = liveMetas.find(m => m.games === 2)?.id;
ok('JV season identified (6 games/440 plays)', jvId && liveFingerprints[jvId].gameCount === 6 && liveFingerprints[jvId].totalPlays === 440,
  JSON.stringify({ jvId, gameCount: liveFingerprints[jvId]?.gameCount, totalPlays: liveFingerprints[jvId]?.totalPlays }));
ok('Varsity season identified (2 games/50 plays)', varsityId && liveFingerprints[varsityId].gameCount === 2 && liveFingerprints[varsityId].totalPlays === 50,
  JSON.stringify({ varsityId, gameCount: liveFingerprints[varsityId]?.gameCount, totalPlays: liveFingerprints[varsityId]?.totalPlays }));
console.log('  live fingerprints computed for:', JSON.stringify(Object.keys(liveFingerprints)));

// ============================================================================
// Phase 2 -- the isolated copy already exists at APPDATA_ROOT (created by the
// forensic-backup/copy step recorded in CLAUDE.md, film explicitly excluded).
// Confirm here, read-only, that it is structurally present before Phase 3
// verifies it matches byte-for-byte in substance.
// ============================================================================
section('Phase 2 -- confirm the isolated copy exists and film was never copied');
ok('copy library.db exists', fs.existsSync(path.join(APPDATA_ROOT, 'seasons', 'library.db')));
ok('copy library.json exists', fs.existsSync(path.join(APPDATA_ROOT, 'library.json')));
ok('no film directory anywhere under the copy', !fs.existsSync(path.join(APPDATA_ROOT, 'seasons', jvId, 'films')) && !fs.existsSync(path.join(APPDATA_ROOT, 'seasons', varsityId, 'films')));

// ============================================================================
// Phase 3 -- confirm the copy's INITIAL state matches the live fingerprints
// exactly, via a SEPARATE, independent SqlCatalog instance opened from the
// copy's own bytes (never the live bytes).
// ============================================================================
section('Phase 3 -- confirm the copy initially matches the live fingerprints exactly');
{
  const copyBytes = fs.readFileSync(path.join(APPDATA_ROOT, 'seasons', 'library.db'));
  const copyCatalog = new SqlCatalog(SQL);
  await copyCatalog.open(new Uint8Array(copyBytes));
  for (const id of [jvId, varsityId]) {
    const data = copyCatalog.loadSeason(id);
    const fp = fingerprintSeason(data);
    ok(`copy fingerprint for ${id} matches live exactly`, stableStringify(fp) === stableStringify(liveFingerprints[id]));
  }
  copyCatalog.close();
}

// ============================================================================
// Phase 4 -- against the copy only: repeated JV<->Varsity open/switch cycles,
// a reversible tagged-play edit in each season, save, restart/reopen, verify
// each edit remains in its own season.
// ============================================================================
section('Phase 4 -- repeated switch cycles + a reversible edit per season, surviving a simulated restart');
const EDIT_MARK = 'PC5-DRYRUN-EDIT';
let jvOriginalNote = null, varsityOriginalNote = null;
let jvEditedGameId = null, jvEditedPlayId = null;
let varsityEditedGameId = null, varsityEditedPlayId = null;
{
  const be1 = await makeBackend(SQL);
  const store1 = new SeasonStore(be1);

  await store1.openSeason(jvId);
  ok('opened JV', store1.currentSeasonId === jvId && store1.data && store1.data.id === jvId);
  const jvGame = store1.data.games.find(g => (g.plays || []).length);
  jvEditedGameId = jvGame.id;
  jvEditedPlayId = jvGame.plays[0].id;
  jvOriginalNote = jvGame.plays[0].notes || '';
  jvGame.plays[0].notes = `${jvOriginalNote} [${EDIT_MARK}]`;
  const jvSaved = await store1.persist();
  ok('JV edit persisted', jvSaved !== false);

  await store1.openSeason(varsityId);
  ok('switched to Varsity', store1.currentSeasonId === varsityId && store1.data.id === varsityId);
  const vGame = store1.data.games.find(g => (g.plays || []).length);
  varsityEditedGameId = vGame.id;
  varsityEditedPlayId = vGame.plays[0].id;
  varsityOriginalNote = vGame.plays[0].notes || '';
  vGame.plays[0].notes = `${varsityOriginalNote} [${EDIT_MARK}]`;
  const vSaved = await store1.persist();
  ok('Varsity edit persisted', vSaved !== false);

  // Repeated switch cycles on the SAME live instance -- confirm isolation.
  // NOTE: play ids are only unique WITHIN a game (this is exactly why the
  // production app resolves film by composite gameId::playId refs, not bare
  // ids -- see CLAUDE.md). openSeason() fully replaces store1.data with the
  // opened season's own rows, so store1.data can never literally contain
  // another season's games at all; the real isolation properties worth
  // proving are (a) the edited play, identified by its own (gameId, playId)
  // pair, still carries the marker, and (b) the season's total play count
  // never drifted -- neither gained nor lost plays across the switches.
  for (let i = 0; i < 3; i++) {
    await store1.openSeason(jvId);
    const jGame = store1.data.games.find(g => g.id === jvEditedGameId);
    const jp = jGame && jGame.plays.find(p => p.id === jvEditedPlayId);
    const jvTotal = store1.data.games.reduce((s, g) => s + (g.plays || []).length, 0);
    ok(`cycle ${i}: JV edit present at its own (gameId, playId), total play count unchanged (440)`,
      jp && jp.notes.includes(EDIT_MARK) && jvTotal === 440, JSON.stringify({ jvTotal, hasEdit: !!(jp && jp.notes.includes(EDIT_MARK)) }));

    await store1.openSeason(varsityId);
    const vGame2 = store1.data.games.find(g => g.id === varsityEditedGameId);
    const vp = vGame2 && vGame2.plays.find(p => p.id === varsityEditedPlayId);
    const vTotal = store1.data.games.reduce((s, g) => s + (g.plays || []).length, 0);
    ok(`cycle ${i}: Varsity edit present at its own (gameId, playId), total play count unchanged (50)`,
      vp && vp.notes.includes(EDIT_MARK) && vTotal === 50, JSON.stringify({ vTotal, hasEdit: !!(vp && vp.notes.includes(EDIT_MARK)) }));
  }
}

// Simulated restart: a FRESH backend/store instance re-reading the SAME copy
// files from disk, exactly as an app relaunch would.
{
  const be2 = await makeBackend(SQL);
  const store2 = new SeasonStore(be2);

  const findEdited = (store, gameId, playId) => {
    const g = store.data.games.find(gg => gg.id === gameId);
    return g && g.plays.find(p => p.id === playId);
  };

  await store2.openSeason(jvId);
  const jp = findEdited(store2, jvEditedGameId, jvEditedPlayId);
  ok('JV edit survives a simulated restart', jp && jp.notes.includes(EDIT_MARK));

  await store2.openSeason(varsityId);
  const vp = findEdited(store2, varsityEditedGameId, varsityEditedPlayId);
  ok('Varsity edit survives a simulated restart', vp && vp.notes.includes(EDIT_MARK));

  // Revert both edits now, from this same restarted instance, so the final
  // fingerprint comparison (Phase 8) has the cleanest possible diff.
  await store2.openSeason(jvId);
  const jp2 = findEdited(store2, jvEditedGameId, jvEditedPlayId);
  jp2.notes = jvOriginalNote;
  const jvReverted = await store2.persist();
  ok('JV edit reverted', jvReverted !== false);

  await store2.openSeason(varsityId);
  const vp2 = findEdited(store2, varsityEditedGameId, varsityEditedPlayId);
  vp2.notes = varsityOriginalNote;
  const vReverted = await store2.persist();
  ok('Varsity edit reverted', vReverted !== false);
}

// ============================================================================
// Phase 5 -- exercise backup and restore in each season; verify ids, counts,
// tags, notes, revisions, and linked film metadata remain correctly scoped.
// ============================================================================
section('Phase 5 -- backup + restore in each season, cross-season isolation, film metadata scoped correctly');
{
  const be3 = await makeBackend(SQL);
  const store3 = new SeasonStore(be3);

  await store3.openSeason(jvId);
  const beforeSnapshotFp = fingerprintSeason(store3.data);
  const jvBackupMeta = await store3.snapshot('PC-5 dry run');   // SeasonStore.snapshot() returns a backup META OBJECT ({id, t, label, ...}), not a bare id string
  ok('JV snapshot created', !!jvBackupMeta);
  const jvBackupId = jvBackupMeta && jvBackupMeta.id;
  // Make a throwaway edit, confirm it applied, then restore the snapshot and
  // confirm it reverts to the SNAPSHOT's state (proving restore genuinely
  // works, not merely that nothing changed).
  const throwawayPlay = store3.data.games.flatMap(g => g.plays)[1];
  const throwawayOriginal = throwawayPlay.notes || '';
  throwawayPlay.notes = `${throwawayOriginal} [THROWAWAY-PRE-RESTORE]`;
  await store3.persist();
  const restored = await store3.restoreBackup(jvBackupId);
  ok('JV restore succeeded', !!restored);
  const afterRestoreFp = fingerprintSeason(store3.data);
  ok('JV restore reverted the throwaway edit (matches pre-snapshot fingerprint, revision legitimately advanced)',
    sameContentIgnoringRevision(afterRestoreFp, beforeSnapshotFp) && afterRestoreFp.revision > beforeSnapshotFp.revision,
    JSON.stringify({ beforeRevision: beforeSnapshotFp.revision, afterRevision: afterRestoreFp.revision }));
  // Film metadata specifically, since the coach named it explicitly.
  const filmOk = store3.data.games.every(g => {
    const live = liveFingerprints[jvId].games.find(lg => lg.id === g.id);
    return live && live.filmMode === (g.filmMode || null) && live.filmDir === (g.filmDir || null);
  });
  ok('JV linked D: film metadata (filmMode/filmDir) unchanged by snapshot+restore', filmOk);

  await store3.openSeason(varsityId);
  const vBeforeFp = fingerprintSeason(store3.data);
  const vBackupMeta = await store3.snapshot('PC-5 dry run');
  ok('Varsity snapshot created', !!vBackupMeta);
  const vBackupId = vBackupMeta && vBackupMeta.id;
  const vThrowaway = store3.data.games.flatMap(g => g.plays)[1];
  const vThrowawayOriginal = vThrowaway.notes || '';
  vThrowaway.notes = `${vThrowawayOriginal} [THROWAWAY-PRE-RESTORE]`;
  await store3.persist();
  const vRestored = await store3.restoreBackup(vBackupId);
  ok('Varsity restore succeeded', !!vRestored);
  const vAfterFp = fingerprintSeason(store3.data);
  ok('Varsity restore reverted the throwaway edit (matches pre-snapshot fingerprint, revision legitimately advanced)',
    sameContentIgnoringRevision(vAfterFp, vBeforeFp) && vAfterFp.revision > vBeforeFp.revision,
    JSON.stringify({ beforeRevision: vBeforeFp.revision, afterRevision: vAfterFp.revision }));

  // Cross-season backup scoping: a JV backup id must not be readable/
  // restorable under Varsity's own scope.
  const crossScopeBackup = await be3.getBackup(varsityId, jvBackupId);
  ok('a JV backup id is refused when scoped to Varsity (cross-season isolation)', crossScopeBackup == null);
}

// ============================================================================
// Phase 5b -- Codex review repair (`1de3c54`): a genuine writeDb failure
// SPECIFICALLY during backup creation (distinct from Phase 7's failed
// canonical-save test below) must keep restoreBackup() fail-closed, proven
// against the REAL SeasonStore -> TauriBackend -> CatalogPersistence ->
// SqlCatalog stack, on a copy of the real catalog -- not just the fake
// backends in tools/pc-adversarial-matrix.mjs.
// ============================================================================
section('Phase 5b -- a real writeDb failure during backup creation keeps restore fail-closed on the real class stack');
{
  const be4 = await makeBackend(SQL);
  const store4 = new SeasonStore(be4);
  await store4.openSeason(jvId);
  const preFailureFp = fingerprintSeason(store4.data);

  // Baseline count BEFORE the injected failure -- Phase 5's own JV restore
  // above already created a genuine, legitimate 'Before restore' backup for
  // this same season, so the correct proof is that the count does not grow
  // by the failed attempt, not that no backup with this label exists at all.
  const backupsBeforeFailure = await be4.listBackups(jvId);

  const realCatalog = await be4._ensureCatalog();
  const realFs = realCatalog.fs;
  // Precisely isolate the BACKUP's own writeDb call: within one writeDisk()
  // call, writeDb is invoked exactly twice -- once by saveSeason (the
  // canonical write, which must keep succeeding here) and once by
  // createBackup (the write this phase targets). Failing only the 2nd call
  // proves the canonical save is genuinely unaffected while the backup
  // specifically fails to become durable -- the exact isolation Codex asked
  // for, now proven against the real class stack, not just fake backends.
  let writeDbCallCount = 0;
  realCatalog.fs = { ...realFs, writeDb: async (bytes) => { writeDbCallCount++; if (writeDbCallCount === 2) throw new Error('PC-5 dry run: injected writeDb failure on the backup-specific write only'); return realFs.writeDb(bytes); } };
  const failedSnapshot = await store4.snapshot('Before restore');
  ok('the canonical save succeeds while the backup-specific write fails, and snapshot() reports that honestly (null), never a masked success',
    failedSnapshot === null && writeDbCallCount === 2, JSON.stringify({ failedSnapshot, writeDbCallCount }));

  // Confirm the backup count did not grow -- the in-memory row insert was
  // genuinely rolled back, not merely under-reported while a real row snuck
  // through.
  realCatalog.fs = realFs;   // restore real fs before reading, so the read itself isn't sabotaged
  const backupsAfterFailure = await be4.listBackups(jvId);
  ok('the backup count is unchanged after the failed write -- the in-memory catalog was genuinely rolled back, not just under-reported',
    backupsAfterFailure.length === backupsBeforeFailure.length,
    JSON.stringify({ before: backupsBeforeFailure.length, after: backupsAfterFailure.length }));

  // Now attempt an actual restore using a stale/nonexistent id -- proves
  // restoreBackup() itself remains fail-closed end to end when there is no
  // genuine safety backup to restore from.
  const throwawayPlay2 = store4.data.games.flatMap(g => g.plays)[2];
  const throwawayOriginal2 = throwawayPlay2.notes || '';
  throwawayPlay2.notes = `${throwawayOriginal2} [PHASE-5B-THROWAWAY]`;
  realCatalog.fs = { ...realFs, writeDb: async () => { throw new Error('still failing'); } };
  const restoreResult = await store4.restoreBackup('bk-real-nonexistent-id');
  realCatalog.fs = realFs;
  ok('restoreBackup() refuses when no genuine safety backup exists (getBackup returns nothing for a real-but-unknown id)', restoreResult === null);

  // Revert the throwaway edit directly and confirm the season is otherwise
  // exactly as it was before this phase -- no partial/corrupted state left
  // behind by the injected failures.
  throwawayPlay2.notes = throwawayOriginal2;
  await store4.persist();
  const afterFp = fingerprintSeason(store4.data);
  ok('the season is fully intact after the injected failures, once the throwaway edit is reverted',
    sameContentIgnoringRevision(afterFp, preFailureFp));
}

// ============================================================================
// Phase 6 -- stale sidecars: place a conflicting legacy season.json beside the
// copied catalog and prove normal startup ignores it (PC-2 Invariant #5).
// ============================================================================
section('Phase 6 -- a conflicting legacy season.json sidecar is ignored by normal startup');
{
  const staleFile = path.join(APPDATA_ROOT, 'seasons', jvId, 'season.json');
  const staleBackup = staleFile + '.pc5-dryrun-original';
  fs.copyFileSync(staleFile, staleBackup);
  const tampered = JSON.parse(fs.readFileSync(staleFile, 'utf8'));
  tampered.seasonName = 'TAMPERED — SHOULD NEVER BE READ';
  tampered.games = [];   // an obviously wrong shape
  fs.writeFileSync(staleFile, JSON.stringify(tampered));

  const be4 = await makeBackend(SQL);
  const store4 = new SeasonStore(be4);
  await store4.openSeason(jvId);
  ok('startup with a tampered season.json sidecar still reads the real name from SQLite', store4.data.seasonName !== 'TAMPERED — SHOULD NEVER BE READ');
  ok('startup with a tampered season.json sidecar still reads the real game count from SQLite', store4.data.games.length === 6);

  fs.copyFileSync(staleBackup, staleFile);
  fs.rmSync(staleBackup);
}

// ============================================================================
// Phase 7 -- failed delete/save: confirm no season disappears or resurrects.
// ============================================================================
section('Phase 7 -- a failed delete/save leaves the season fully durable, neither gone nor resurrected');
{
  const be5 = await makeBackend(SQL);
  const store5 = new SeasonStore(be5);
  await store5.openSeason(varsityId);

  // Inject a single transient writeDb failure on the varsityId's backend.
  const realCatalog = await be5._ensureCatalog();
  const realFs = realCatalog.fs;
  let injected = false;
  realCatalog.fs = {
    ...realFs,
    writeDb: async (bytes) => {
      if (!injected) { injected = true; throw new Error('PC-5 dry run: injected transient write failure'); }
      return realFs.writeDb(bytes);
    },
  };
  const failedSave = await store5.persist();
  ok('the injected save failure is visibly reported (not silently treated as success)', failedSave === false);
  realCatalog.fs = realFs;   // restore normal behavior BEFORE the next read, not after
  const stillLoadable = await be5.loadSeason(varsityId);   // TauriBackend.loadSeason() returns the season data object directly
  ok('the season remains fully loadable/durable after the failed save', stillLoadable && Array.isArray(stillLoadable.games) && stillLoadable.games.length === 2,
    JSON.stringify({ hasData: !!stillLoadable, gameCount: stillLoadable && stillLoadable.games ? stillLoadable.games.length : null }));
}

// ============================================================================
// Phase 8 -- final comparison: every field must match the initial live
// fingerprint EXACTLY, except revision (which legitimately advances with
// every write this dry run performed) -- documented explicitly, not hidden.
// ============================================================================
section('Phase 8 -- final comparison against the initial live fingerprints');
{
  const be6 = await makeBackend(SQL);
  const store6 = new SeasonStore(be6);
  for (const id of [jvId, varsityId]) {
    await store6.openSeason(id);
    const finalFp = fingerprintSeason(store6.data);
    const liveFp = liveFingerprints[id];
    const sameExceptRevision = { ...finalFp, revision: liveFp.revision };
    const matches = stableStringify(sameExceptRevision) === stableStringify(liveFp);
    ok(`${id}: every field matches the initial live fingerprint except revision`, matches,
      matches ? '' : JSON.stringify({ liveRevision: liveFp.revision, finalRevision: finalFp.revision }));
    console.log(`  ${id}: revision ${liveFp.revision} -> ${finalFp.revision} (advanced by this dry run's own writes -- expected, not a discrepancy)`);
  }
}

console.log('');
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
if (findings.length) {
  console.log('Findings:');
  findings.forEach(f => console.log(`  - ${f}`));
}
process.exit(fail > 0 ? 1 : 0);
