/* Cross-game cut-up planner contract (redesign — true cross-game playback).
   Pure module, so this runs in Node directly. Pins the ordered plan a season
   Study query needs to walk matching plays ACROSS games: game order
   (chronological), per-game play order (by timestamp), honest skip accounting,
   and backward-compatible single-game behavior. */
import assert from 'node:assert';
import { CrossGameCutup } from '../js/cross-game-cutup.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const planner = new CrossGameCutup();

const play = (id, start, end, extra = {}) => ({ id, timestamp: { start, end }, clipName: `c${id}`, clipId: id, ...extra });
// g2 is chronologically EARLIER than g1 but listed second — proves date ordering.
const games = [
  { id: 'g1', name: 'Week 2 vs Rivals', gameInfo: { date: '2025-09-08', opponent: 'Rivals' }, plays: [play(1, 30, 36), play(2, 5, 11), play(3, 60, 66)] },
  { id: 'g2', name: 'Week 1 vs Eagles', gameInfo: { date: '2025-09-01', opponent: 'Eagles' }, plays: [play(1, 12, 18), play(2, 40, 46)] },
];

// --- 1. cross-game ordering: game by date, play by timestamp ---
{
  const refs = ['g1::3', 'g1::1', 'g2::2', 'g2::1', 'g1::2'];
  const p = planner.plan(refs, games);
  ok(p.total === 5 && p.skipped.length === 0, 'all resolvable refs become segments', JSON.stringify(p.total));
  ok(eq(p.games.map(g => g.gameId), ['g2', 'g1']), 'games ordered chronologically (g2 earlier date first)', JSON.stringify(p.games));
  ok(eq(p.games.map(g => g.count), [2, 3]), 'per-game segment counts are correct');
  ok(eq(p.segments.map(s => `${s.gameId}::${s.playId}`), ['g2::1', 'g2::2', 'g1::2', 'g1::1', 'g1::3']),
    'segments ordered by game then by timestamp.start within game', JSON.stringify(p.segments.map(s => `${s.gameId}::${s.playId}@${s.start}`)));
  ok(eq(p.segments.map(s => s.order), [0, 1, 2, 3, 4]), 'segments carry a monotonic play order');
  const s0 = p.segments[0];
  ok(s0.clipName === 'c1' && s0.start === 12 && s0.end === 18 && s0.gameName === 'Week 1 vs Eagles', 'each segment carries clip identity + timestamps + game name for the player');
}

// --- 2. honest skip accounting: missing play / missing timestamp / bad ref ---
{
  const bad = [
    { id: 'g1', name: 'G1', gameInfo: { date: '2025-09-01' }, plays: [play(1, 0, 5), { id: 2, timestamp: { start: 3, end: 3 } }, { id: 3 }] },
  ];
  const refs = ['g1::1', 'g1::2', 'g1::3', 'g1::99', 'gX::1', 'not-a-ref'];
  const p = planner.plan(refs, bad);
  ok(p.total === 1 && eq(p.segments.map(s => s.playId), ['1']), 'only the resolvable play is planned');
  ok(eq([...p.skipped].sort(), ['g1::2', 'g1::3', 'g1::99', 'gX::1', 'not-a-ref'].sort()),
    'zero-length timestamp, missing timestamp, unknown play, unknown game, and malformed ref all skip (not crash)', JSON.stringify(p.skipped));
}

// --- 3. de-dup + single-game backward compatibility ---
{
  const p = planner.plan(['g1::1', 'g1::1', 'g1::2'], games);
  ok(p.total === 2, 'duplicate refs are de-duplicated');
  ok(p.games.length === 1 && p.games[0].gameId === 'g1', 'a single-game query yields a single-game plan (backward compatible)');
}

// --- 4. as-listed order option keeps the season array order ---
{
  const p = planner.plan(['g1::1', 'g2::1'], games, { order: 'as-listed' });
  ok(eq(p.games.map(g => g.gameId), ['g1', 'g2']), 'opts.order=as-listed preserves the games[] array order');
}

// --- 5. empty / no-games inputs are safe ---
{
  ok(planner.plan([], games).total === 0, 'no refs -> empty plan');
  ok(planner.plan(['g1::1'], []).total === 0 && planner.plan(['g1::1'], []).skipped.length === 1, 'no games -> everything skipped, no crash');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
