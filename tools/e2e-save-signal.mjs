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
  const resolvers = [];
  const signals = [], log = [];
  const store = {
    data: { id: 'A' }, currentSeasonId: 'A',
    persist() { log.push('persist'); return new Promise(r => { resolvers.push(r); }); },
    supportsDisk: () => false, diskStatus: () => ({ bound: false }),
    downloadFile() { log.push('download'); }, saveNow: async () => { log.push('saveNow'); return true; },
    hasCurrent: () => true,
  };
  const sm = Object.create(StorageManager.prototype);
  Object.assign(sm, { seasonStore: store, onSaveState: s => signals.push(s), commitActive() {}, _maybeSnapshot() { log.push('snapshot'); } });
  return { sm, store, signals, log, resolve: v => resolvers.at(-1)(v), resolveAt: (i, v) => resolvers[i](v) };
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

console.log('\n-- races (Codex review of 885026d7) --');
{
  // An older save finishing while a newer one is still running is not "Saved".
  const { sm, signals, resolveAt } = rig();
  const first = sm._commitAndPersist();
  const second = sm._commitAndPersist();
  resolveAt(0, true); await first; await tick();
  ok(!signals.includes('saved'), 'an older save landing while a newer one runs does not show Saved', JSON.stringify(signals));
  resolveAt(1, true); await second; await tick();
  ok(signals.at(-1) === 'saved', 'the newest save landing shows Saved', JSON.stringify(signals));
}
{
  // An older failure after a newer success does not flip the indicator either.
  const { sm, signals, resolveAt } = rig();
  const first = sm._commitAndPersist();
  const second = sm._commitAndPersist();
  resolveAt(1, true); await second; await tick();
  resolveAt(0, false); await first; await tick();
  ok(signals.at(-1) === 'saved', 'a stale result never overwrites the newest one', JSON.stringify(signals));
}
{
  // Save season started on A finishes after the coach opened B.
  const { sm, store, signals, log, resolve } = rig();
  const saving = sm.saveProject();
  await tick();
  store.currentSeasonId = 'B'; store.data = { id: 'B' };
  resolve(true);
  await saving;
  ok(!log.includes('snapshot') && !log.includes('download') && !log.includes('saveNow'),
    'Save season stops its restore point and download after a season switch', JSON.stringify(log));
  ok(!signals.includes('saved'), 'Save season does not show Saved for the season opened meanwhile', JSON.stringify(signals));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
