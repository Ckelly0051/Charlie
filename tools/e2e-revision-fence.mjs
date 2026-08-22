/* PC-4 REVISION-FENCED AUTOSAVE HARNESS (Node) --------------------------------
   Proves Convergence Plan Invariant #7 and closes Inventory Sec 3.2, the one
   finding PC-0 recorded as "structurally real but not yet reproduced as a
   concrete field symptom". It is reproduced concretely here.

   Every safeguard before PC-4 fenced against a SEASON SWITCH landing mid-flight
   (PC-1). None fenced two writes to the SAME season against each other, and
   both of the following were reproduced against the committed classes before
   this checkpoint:

     1. Two overlapping persists to one season completed OUT OF ORDER, so the
        chronologically-earlier payload landed last and silently reverted the
        newer one. Observed durable write order: [2 plays, 1 play] -- the coach's
        second edit was durably lost while memory still showed it.
     2. A persist dispatched BEFORE a restore landed AFTER it. Observed order:
        [1 play (restore), 3 plays (pre-restore)] -- memory showed the restore
        had worked while disk held the state the coach had just discarded, so
        the restore silently un-did itself on the next reload.

   The fix is two mechanisms, both proven here:
     - a per-season FIFO write queue, so durable writes for one season can never
       complete out of dispatch order (and can never even be in flight
       concurrently);
     - a monotonic `data.revision`, persisted and additive, that makes "which
       state is newer" explicit -- used to fail a DELAYED write closed when its
       frozen payload has been superseded, and wired into PC-3's snapshot
       envelope, which had been carrying a timestamp placeholder.

   Run:  node tools/e2e-revision-fence.mjs */
import { SeasonStore } from '../js/season-store.js';
import { SnapshotEnvelope } from '../js/snapshot-envelope.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const tick = () => new Promise(r => setTimeout(r, 0));

const play = n => ({ id: n, timestamp: { start: 0, end: 5 }, clipId: null, clipName: '', notes: '', annotations: [], tags: { unit: 'offense', custom: [] } });
const season = (id, name, plays = []) => ({
  version: 5, type: 'season', id, seasonName: name, activeGameId: 'g1',
  teamProfile: { teamName: name }, roster: [],
  games: [{ id: 'g1', name: 'G1', gameInfo: {}, status: 'active', plays, annotations: [], nextId: plays.length + 1, currentPlayId: null, videoFileName: '', clipNames: [], isMultiClip: false }],
});
/** A backend whose saveSeason can be held pending, recording exactly what each
 *  call would durably write (snapshotted at call time, like a real serializer). */
const gatedBackend = (extra = {}) => {
  const state = { writes: [], gates: [], hold: false, disk: [] };
  return {
    state,
    currentId: null, RETENTION: 25,
    setCurrentSeason(id) { this.currentId = id; },
    async loadSeason() { return null; },
    async saveSeason(id, data) {
      const snap = JSON.parse(JSON.stringify(data));
      if (!state.hold) { state.writes.push({ id, snap }); return true; }
      return new Promise(res => state.gates.push(() => { state.writes.push({ id, snap }); res(true); }));
    },
    async touchOpened() {},
    diskStatus() { return { bound: false }; },
    async writeDisk(id, data) { state.disk.push({ id, revision: data && data.revision }); return true; },
    ...extra,
  };
};
const playCounts = state => state.writes.map(w => w.snap.games[0].plays.length);

console.log('\n-- 1. the revision field: additive, monotonic, and hostile-value safe --');
{
  const store = new SeasonStore(gatedBackend());
  ok(store._empty().revision === 0, 'a fresh season starts at revision 0', JSON.stringify(store._empty().revision));

  // A season saved before PC-4 has no `revision` key at all.
  const legacy = store._normalize(season('L', 'Legacy'));
  ok(legacy.revision === 0, 'a legacy season with no revision key normalizes to 0 (backward compatible)', JSON.stringify(legacy.revision));

  // A hand-edited / corrupted value must not mint a high-water mark that makes
  // every subsequent legitimate save look stale forever.
  // Number.MAX_SAFE_INTEGER is included deliberately: there, `revision + 1`
  // stops incrementing, every later comparison comes out equal, and the fence
  // goes silently inert -- a failure that looks exactly like working code.
  for (const bad of [-5, 1.5, '900', NaN, null, {}, Infinity, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 1]) {
    const d = season('L', 'Legacy'); d.revision = bad;
    ok(store._normalize(d).revision === 0, `a hostile revision value (${String(bad)}) normalizes to 0, never trusted`, JSON.stringify(store._normalize(d).revision));
  }
}

console.log('\n-- 2. two overlapping persists to ONE season complete in dispatch order --');
{
  const backend = gatedBackend();
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1)]);

  backend.state.hold = true;
  const p1 = store.persist();                       // dispatch #1 (1 play)
  store.data.games[0].plays.push(play(2));          // a later edit
  const p2 = store.persist();                       // dispatch #2 (2 plays)
  await tick();

  ok(backend.state.gates.length === 1,
    'only ONE write for a season is ever in flight -- the second is queued behind the first, so out-of-order completion is impossible by construction',
    JSON.stringify({ inFlight: backend.state.gates.length }));

  // Actively try to force out-of-order completion: always release the most
  // recently-arrived write first.
  for (let i = 0; i < 6 && backend.state.gates.length; i++) { backend.state.gates.pop()(); await tick(); }
  await Promise.all([p1, p2]);

  const counts = playCounts(backend.state);
  ok(counts[counts.length - 1] === 2,
    'the LAST durable write holds the NEWEST state -- reproduced before this fix as [2,1], the earlier payload landing last and reverting the newer edit',
    JSON.stringify({ durableWriteOrder: counts }));

  // The payload is passed BY REFERENCE, deliberately: a write still sitting in
  // the queue serializes the freshest state rather than a stale snapshot frozen
  // at dispatch, and its revision stamp moves with it. So the contract is not
  // "each write has its own distinct revision" -- it is that revisions never go
  // backward, and that the last durable write agrees with memory about which
  // commit is now durable. (A per-dispatch deep clone would buy a distinct
  // number per write at the cost of cloning a 440-play season on every autosave,
  // and would durably write states the coach has already moved past.)
  const revs = backend.state.writes.map(w => w.snap.revision);
  ok(revs.every((r, i) => i === 0 || r >= revs[i - 1]),
    'durable revisions never move backward across writes',
    JSON.stringify({ revisions: revs }));
  ok(revs[revs.length - 1] === store.data.revision,
    'the last durable write agrees with memory about which commit is durable',
    JSON.stringify({ durable: revs[revs.length - 1], inMemory: store.data.revision }));
}

console.log('\n-- 3. a persist dispatched BEFORE a restore never lands after it --');
{
  const backend = gatedBackend({
    async createBackup() { return 'bk1'; },
    async getBackup() { return season('A', 'Season A', [play(1)]); },   // restore target: 1 play
    async writeDisk() { return true; },
  });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1), play(2), play(3)]);    // live: 3 plays

  backend.state.hold = true;
  const stale = store.persist();          // an in-flight save of the 3-play live state
  await tick();

  backend.state.hold = false;             // later writes proceed normally
  const restoring = store.restoreBackup('bk1');
  setTimeout(() => backend.state.gates.forEach(g => g()), 5);   // the pre-restore save lands mid-restore
  await restoring;
  await stale;

  const counts = playCounts(backend.state);
  ok(counts[counts.length - 1] === 1,
    "the restore is the LAST durable write -- reproduced before this fix as [1,3], the pre-restore state landing afterward and silently un-doing the coach's restore on the next reload",
    JSON.stringify({ durableWriteOrder: counts, inMemoryAfterRestore: store.data.games[0].plays.length }));
  ok(store.data.games[0].plays.length === 1, 'memory and disk agree after the restore', JSON.stringify(store.data.games[0].plays.length));
}

console.log('\n-- 4. a restored OLD backup does not mint a stale revision --');
{
  // The decisive case for the revision formula. A backup carries its ORIGINAL
  // (low) revision. Basing the next revision on the payload alone would stamp a
  // number BELOW the live season's, making the restore itself look stale to
  // every later fence -- and, at a rejecting boundary, silently un-restorable.
  const backend = gatedBackend({
    async createBackup() { return 'bk1'; },
    async getBackup() { const s = season('A', 'Season A', [play(1)]); s.revision = 2; return s; },
    async writeDisk() { return true; },
  });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1), play(2)]);
  store.data.revision = 40;
  store._seedRevision('A', store.data);

  await store.restoreBackup('bk1');
  const written = backend.state.writes[backend.state.writes.length - 1];
  ok(written.snap.revision > 40,
    'restoring a revision-2 backup into a revision-40 season commits a NEWER revision, not revision 3 -- a restore is a new commit of older content',
    JSON.stringify({ restoredTo: written.snap.revision }));
}

console.log('\n-- 5. a fresh session continues the PERSISTED sequence, not from 1 --');
{
  const backend = gatedBackend({ async loadSeason() { const s = season('A', 'Season A', [play(1)]); s.revision = 77; return s; } });
  const store = new SeasonStore(backend);
  await store.openSeason('A');
  ok(store.data.revision === 77, 'openSeason loads the persisted revision', JSON.stringify(store.data.revision));
  await store.persist();
  const written = backend.state.writes[backend.state.writes.length - 1];
  ok(written.snap.revision === 78,
    'the first save of a new session continues from the persisted revision (78), never restarting at 1 where it would look stale against the stored 77',
    JSON.stringify({ revision: written.snap.revision }));
}

console.log('\n-- 6. an explicit "Save Season" is ordered against a debounced autosave --');
{
  // Inventory Sec 3.2's FIRST named scenario. saveNow() used to call
  // backend.saveSeason directly, bypassing persist() and therefore any ordering
  // with an in-flight autosave for the same season.
  const backend = gatedBackend({ async createBackup() { return 'bk'; }, async writeDisk() { return true; } });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1)]);

  backend.state.hold = true;
  const auto = store.persist();                     // debounced autosave, in flight
  await tick();
  store.data.games[0].plays.push(play(2));          // the coach keeps working
  const explicit = store.saveNow('Manual save');    // explicit Save Season, dispatched second
  await tick();

  ok(backend.state.gates.length === 1,
    'the explicit save is queued behind the in-flight autosave rather than racing it',
    JSON.stringify({ inFlight: backend.state.gates.length }));

  backend.state.hold = false;
  for (let i = 0; i < 6 && backend.state.gates.length; i++) { backend.state.gates.pop()(); await tick(); }
  await Promise.all([auto, explicit]);

  const revs = backend.state.writes.map(w => w.snap.revision);
  ok(revs.every((r, i) => i === 0 || r > revs[i - 1]),
    'autosave and explicit save land in strict dispatch order with increasing revisions',
    JSON.stringify({ revisions: revs, plays: playCounts(backend.state) }));
}

console.log('\n-- 7. a DELAYED disk write whose frozen payload is superseded fails closed --');
{
  // The literal Invariant #7 case: "Delayed autosaves carry a captured season id
  // and revision. A season switch OR NEWER REVISION makes the delayed save stale
  // and it must fail closed." Unlike an autosave (which re-reads live state at
  // fire time and is therefore never stale in content), the Documents-mirror
  // write freezes its payload at schedule time, so a newer commit genuinely
  // makes that frozen copy a superseded state. Writing it would move the
  // recovery snapshot BACKWARD relative to the canonical row.
  const backend = gatedBackend({ diskStatus() { return { bound: true }; } });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1)]);

  const realSetTimeout = globalThis.setTimeout;
  const arm = (rev) => {
    let captured = null;
    globalThis.setTimeout = (fn) => { captured = fn; return 0; };
    try { store._scheduleDiskWrite('A', store.data, rev); } finally { globalThis.setTimeout = realSetTimeout; }
    return captured;
  };

  // POSITIVE control first, so the negative case below cannot pass merely
  // because the callback never writes at all.
  store._revision.set('A', 5);
  const current = arm(5);
  ok(typeof current === 'function', 'a real disk-write callback was armed through the real setTimeout call');
  current();
  ok(backend.state.disk.length === 1,
    'firing the callback while its revision is still the newest performs exactly one write',
    JSON.stringify(backend.state.disk));

  // NEGATIVE case: arm at revision 5, let a newer commit land, then fire the
  // SAME real callback.
  backend.state.disk.length = 0;
  const stale = arm(5);
  store._revision.set('A', 6);            // a newer commit for the same season
  stale();
  ok(backend.state.disk.length === 0,
    'firing a delayed write whose frozen payload has been superseded by a newer commit performs ZERO writes',
    JSON.stringify(backend.state.disk));
}

console.log('\n-- 8. the PC-3 snapshot envelope carries the REAL commit revision --');
{
  // PC-3 built the envelope's `revision` field and filled it with a timestamp
  // placeholder, disclosing that the real monotonic counter was PC-4's work.
  const data = season('A', 'Season A', [play(1)]);
  data.revision = 42;
  const env = SnapshotEnvelope.wrap('A', data);
  ok(env.revision === 42, 'a PC-4 season stamps its real monotonic revision into the envelope, not a wall-clock timestamp', JSON.stringify(env.revision));
  ok(SnapshotEnvelope.unwrap(env).ok === true, 'the envelope still validates end to end with a numeric revision', JSON.stringify(SnapshotEnvelope.unwrap(env)));

  // Two snapshots written inside the same millisecond are still strictly
  // ordered by revision -- the thing a timestamp cannot do.
  const older = season('A', 'Season A', [play(1)]); older.revision = 41;
  const newer = season('A', 'Season A', [play(1), play(2)]); newer.revision = 42;
  const a = SnapshotEnvelope.wrap('A', older), b = SnapshotEnvelope.wrap('A', newer);
  ok(b.revision > a.revision, 'two snapshots are strictly ordered by commit even when their timestamps are identical',
    JSON.stringify({ a: a.revision, b: b.revision, sameTimestamp: a.timestamp === b.timestamp }));

  // Backward compatibility: a season written before PC-4 has no revision key.
  const legacy = season('A', 'Season A', [play(1)]);
  const legacyEnv = SnapshotEnvelope.wrap('A', legacy);
  ok(typeof legacyEnv.revision === 'string' && SnapshotEnvelope.unwrap(legacyEnv).ok === true,
    'a pre-PC-4 season still wraps and validates, falling back to the timestamp marker',
    JSON.stringify(legacyEnv.revision));
}

console.log('\n-- 9. a durably-deleted season does not leave a ghost revision high-water mark --');
{
  const backend = gatedBackend({ async deleteSeason() { return true; } });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1)]);
  await store.persist();
  ok(store._revision.get('A') >= 1, 'the season has a live revision sequence before deletion');

  await store.deleteSeason('A');
  ok(store._revision.get('A') === undefined && store._writeChain.get('A') === undefined,
    'deleting a season drops its revision sequence and write queue, so a recreated id starts fresh instead of inheriting a ghost high-water mark',
    JSON.stringify({ revision: store._revision.get('A') }));
}

console.log('\n-- 10. a FAILED write does not strand the per-season queue --');
{
  // A rejected save must not leave later writes for that season queued forever
  // behind a promise that never settles cleanly.
  let calls = 0;
  const backend = gatedBackend({
    async saveSeason(id, data) {
      calls++;
      if (calls === 1) throw new Error('canonical write failed');
      this.state.writes.push({ id, snap: JSON.parse(JSON.stringify(data)) });
      return true;
    },
  });
  const store = new SeasonStore(backend);
  store.currentSeasonId = 'A'; backend.setCurrentSeason('A');
  store.data = season('A', 'Season A', [play(1)]);

  const first = await store.persist();
  ok(first === false, 'a throwing canonical write is reported as a failure', JSON.stringify(first));
  const second = await store.persist();
  ok(second === true && backend.state.writes.length === 1,
    'the next write for that season still runs -- a failed write never strands the queue',
    JSON.stringify({ second, writes: backend.state.writes.length }));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
