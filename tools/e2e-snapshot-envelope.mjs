/* SNAPSHOT ENVELOPE HARNESS (Node, pure, DOM-free) --------------------------
   Proves SnapshotEnvelope -- the versioned wrapper PC-3 requires around every
   Documents-mirror recovery snapshot (Convergence Plan Invariant #5/#6).
   No fs, no SqlCatalog, no mocking: wrap()/unwrap() are pure functions.

   Checks: a well-formed wrap; a genuine round-trip through JSON.stringify/
   parse validates ok; tampered content (checksum), tampered declared counts,
   and identity mismatch are all caught with the exact named reason; a bare
   legacy pre-envelope season.json is recognized (not silently accepted, not
   silently invisible -- `legacy-unenveloped` with its data attached); garbage
   input never throws; the checksum is key-order-independent (deterministic
   stringify) and content-sensitive (two different seasons never collide).

   Run:  node tools/e2e-snapshot-envelope.mjs */
import { SnapshotEnvelope } from '../js/snapshot-envelope.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const clone = x => JSON.parse(JSON.stringify(x));

const mkPlay = (i) => ({ id: i, timestamp: { start: 0, end: 6 }, clipId: i, notes: '', tags: { unit: 'offense', down: '1', distance: '10', formation: 'Shotgun', playType: 'Run Inside', result: 'Gain', yardage: String(i) } });
const mkGame = (gid, n) => ({ id: gid, name: gid, plays: Array.from({ length: n }, (_, i) => mkPlay(i + 1)) });
const season = (id, name, games) => ({ version: 5, type: 'season', id, seasonName: name, games });

const seasonA = season('s1', 'Alpha', [mkGame('a1', 3), mkGame('a2', 2)]);
const seasonB = season('s2', 'Bravo', [mkGame('b1', 4)]);

// ---- 1. wrap() produces a well-formed envelope -----------------------------
{
  const env = SnapshotEnvelope.wrap('s1', seasonA);
  ok(env.envelopeVersion === SnapshotEnvelope.VERSION, 'wrap sets the current envelope version');
  ok(env.seasonId === 's1', 'wrap carries the destination seasonId');
  ok(env.gameCount === 2 && env.playCount === 5, 'wrap computes game/play counts from the real data', JSON.stringify({ g: env.gameCount, p: env.playCount }));
  ok(typeof env.checksum === 'string' && env.checksum.length === 16, 'wrap produces a 16-hex-char checksum', env.checksum);
  ok(env.data === seasonA, 'wrap preserves the original data object');
  ok(typeof env.timestamp === 'string' && !Number.isNaN(Date.parse(env.timestamp)), 'wrap stamps a parseable ISO timestamp');
}

// ---- 2. a genuine wrap round-trips through JSON.stringify/parse -----------
{
  const env = SnapshotEnvelope.wrap('s1', seasonA);
  const roundTripped = JSON.parse(JSON.stringify(env));
  const result = SnapshotEnvelope.unwrap(roundTripped);
  ok(result.ok === true, 'a genuine envelope round-trips through JSON as ok:true', JSON.stringify(result.ok === false ? result : 'ok'));
  ok(JSON.stringify(result.envelope.data) === JSON.stringify(seasonA), 'the unwrapped data equals the original season, byte for byte');
}

// ---- 3. tampered content is caught by checksum mismatch -------------------
{
  const env = clone(SnapshotEnvelope.wrap('s1', seasonA));
  env.data.games[0].plays[0].tags.yardage = '999'; // tamper AFTER the checksum was computed
  const result = SnapshotEnvelope.unwrap(env);
  ok(result.ok === false && result.reason === 'checksum-mismatch', 'tampered play content is caught as checksum-mismatch', JSON.stringify(result));
}

// ---- 4. a lied declared count is caught, independent of the checksum ------
{
  const env = clone(SnapshotEnvelope.wrap('s1', seasonA));
  env.gameCount = 999; // declared count disagrees with the enclosed data
  const result = SnapshotEnvelope.unwrap(env);
  ok(result.ok === false && result.reason === 'count-mismatch', 'a lied declared gameCount is caught before the checksum is even consulted', JSON.stringify(result));
  ok(result.actual && result.actual.gameCount === 2, 'count-mismatch reports the TRUE actual count alongside the false declared one', JSON.stringify(result.actual));
}

// ---- 5. identity mismatch (envelope says one season, data is another) -----
{
  const env = clone(SnapshotEnvelope.wrap('s1', seasonA));
  env.data.id = 'some-other-season'; // the checksum still matches (computed over THIS data)... but identity doesn't
  // Recompute the checksum honestly so this exercises ONLY the identity check,
  // not an incidental checksum failure.
  env.checksum = SnapshotEnvelope.checksum(env.data);
  const result = SnapshotEnvelope.unwrap(env);
  ok(result.ok === false && result.reason === 'identity-mismatch', 'envelope.seasonId disagreeing with data.id is caught as identity-mismatch, independent of the checksum', JSON.stringify(result));
}

// ---- 6. a bare legacy pre-envelope season.json is recognized, not silently skipped
{
  const bare = clone(seasonA); // no envelopeVersion at all -- a pre-PC-3 mirror file
  const result = SnapshotEnvelope.unwrap(bare);
  ok(result.ok === false && result.reason === 'legacy-unenveloped', 'a bare legacy season.json is reported as legacy-unenveloped, not silently accepted or silently invisible', JSON.stringify(result.reason));
  ok(result.data && result.data.id === 's1', 'the legacy raw data is still attached so a caller MAY choose to offer it for recovery', JSON.stringify(result.data && result.data.id));
}

// ---- 7. garbage input never throws -----------------------------------------
{
  const cases = [null, undefined, 42, 'not json', [], {}, { games: 'not-an-array' }];
  let anyThrew = false;
  const reasons = [];
  for (const c of cases) {
    try { reasons.push(SnapshotEnvelope.unwrap(c).reason); }
    catch (e) { anyThrew = true; }
  }
  ok(!anyThrew, 'unwrap() never throws on any malformed input', String(anyThrew));
  ok(reasons.every(r => typeof r === 'string'), 'every malformed case reports a string reason', JSON.stringify(reasons));
}

// ---- 8. unsupported envelope version -----------------------------------
{
  const env = clone(SnapshotEnvelope.wrap('s1', seasonA));
  env.envelopeVersion = 999;
  const result = SnapshotEnvelope.unwrap(env);
  ok(result.ok === false && result.reason === 'unsupported-version', 'a future/unknown envelope version is refused rather than guessed at', JSON.stringify(result));
}

// ---- 9. malformed envelope (declares a version but is missing required fields)
{
  const result = SnapshotEnvelope.unwrap({ envelopeVersion: SnapshotEnvelope.VERSION });
  ok(result.ok === false && result.reason === 'malformed', 'an envelope missing seasonId/data/games is refused as malformed', JSON.stringify(result));
}

// ---- 10. checksum is key-order-independent (deterministic stringify) ------
{
  const s1 = { b: 2, a: 1, nested: { z: 9, y: 8 } };
  const s2 = { a: 1, b: 2, nested: { y: 8, z: 9 } }; // same content, different key insertion order
  ok(SnapshotEnvelope.checksum(s1) === SnapshotEnvelope.checksum(s2), 'checksum is identical for the same content regardless of object key order', JSON.stringify({ c1: SnapshotEnvelope.checksum(s1), c2: SnapshotEnvelope.checksum(s2) }));
}

// ---- 11. checksum is content-sensitive: two different seasons never collide
{
  const cA = SnapshotEnvelope.checksum(seasonA);
  const cB = SnapshotEnvelope.checksum(seasonB);
  ok(cA !== cB, 'two genuinely different seasons produce different checksums (not a degenerate constant hash)', JSON.stringify({ cA, cB }));
  // A single-character change in a deep field must also change the checksum.
  const almostA = clone(seasonA); almostA.games[0].plays[0].tags.yardage = '4';
  ok(SnapshotEnvelope.checksum(seasonA) !== SnapshotEnvelope.checksum(almostA), 'a single deep-field change moves the checksum');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
