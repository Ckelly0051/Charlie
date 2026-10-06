/* SAVE STATE SIGNAL HARNESS (Node) ---------------------------------------------
   Code review 2026-10-06: the explicit Save season (`saveProject`) and the
   autosave commit (`_commitAndPersist`) signalled "Saved" before the canonical
   write finished and never looked at its result, so a failed write still read
   as saved. "Saved" now follows a durable write; a failed write signals
   "failed" and Save season returns false without its disk or download steps.

   Run:  node tools/e2e-save-signal.mjs */
import { StorageManager } from '../js/storage.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const tick = () => new Promise(r => setTimeout(r, 0));
globalThis.window = globalThis.window || {};

const rig = () => {
  let resolveSave;
  const signals = [], log = [];
  const store = {
    data: { id: 'A' }, currentSeasonId: 'A',
    persist() { log.push('persist'); return new Promise(r => { resolveSave = r; }); },
    supportsDisk: () => false, diskStatus: () => ({ bound: false }),
    downloadFile() { log.push('download'); }, saveNow: async () => { log.push('saveNow'); return true; },
    hasCurrent: () => true,
  };
  const sm = Object.create(StorageManager.prototype);
  Object.assign(sm, { seasonStore: store, onSaveState: s => signals.push(s), commitActive() {}, _maybeSnapshot() { log.push('snapshot'); } });
  return { sm, signals, log, resolve: v => resolveSave(v) };
};

console.log('\n-- Save season --');
{
  const { sm, signals, log, resolve } = rig();
  const saving = sm.saveProject();
  await tick();
  ok(!signals.includes('saved'), 'Save season does not show Saved while the write is still running', JSON.stringify(signals));
  resolve(false);
  const result = await saving;
  ok(result === false && signals.at(-1) === 'failed' && !signals.includes('saved'),
    'a failed write reports failure and never Saved', JSON.stringify({ result, signals }));
  ok(!log.includes('download') && !log.includes('snapshot'), 'a failed write skips the restore point and the download', JSON.stringify(log));
}
{
  const { sm, signals, log, resolve } = rig();
  const saving = sm.saveProject();
  resolve(true);
  const result = await saving;
  ok(result === true && signals.at(-1) === 'saved' && log.includes('snapshot') && log.includes('download'),
    'a durable write shows Saved, then takes the restore point and the download', JSON.stringify({ result, signals, log }));
}

console.log('\n-- autosave commit --');
{
  const { sm, signals, resolve } = rig();
  const committing = sm._commitAndPersist();
  await tick();
  ok(!signals.includes('saved'), 'autosave does not show Saved while the write is still running', JSON.stringify(signals));
  resolve(false);
  const result = await committing;
  ok(result === false && signals.at(-1) === 'failed', 'a failed autosave reports failure', JSON.stringify({ result, signals }));
}
{
  const { sm, signals, resolve } = rig();
  const committing = sm._commitAndPersist();
  resolve(true);
  ok((await committing) === true && signals.at(-1) === 'saved', 'a durable autosave shows Saved', JSON.stringify(signals));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
