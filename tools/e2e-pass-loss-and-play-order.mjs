/* PASS-FOR-LOSS AND PLAYBACK ORDER HARNESS (Node) -----------------------------
   Codex review of f698ef0b (2026-10-02), both reproduced before the repair:

     - A completed pass stopped behind the line (Run/Pass Pass, result Loss,
       -3 yards) produced 0 attempts, 0 completions and -3 passing yards: the
       completion check knew Gain, No Gain and Touchdown only. The same gap was
       in the Defense board, play action, individual credits and Study.
     - Cut-ups sorted by timestamp.start. In a multi-clip game each play's
       timestamps are local to its own clip, so play 1 starting 30s into its
       clip played after plays 2 and 3 starting at 0 in theirs.

   Run:  node tools/e2e-pass-loss-and-play-order.mjs */
import { StatsEngine } from '../js/stats-engine.js';
import { CutupPlayer } from '../js/cutup-player.js';
import { CrossGameCutup } from '../js/cross-game-cutup.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const snap = (id, tags, players = {}) => ({ id, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', runPass: 'Pass', players, ...tags } });

console.log('\n-- 1. a completed pass for a loss is an attempt and a completion --');
{
  const engine = new StatsEngine(null);
  const screen = snap(1, { result: 'Loss', yardage: '-3' }, { passer: '7', receiver: '22' });
  const p = engine.compute([screen]).passing;
  ok(p.attempts === 1 && p.completions === 1 && p.yards === -3,
    'offense passing line: 1 attempt, 1 completion, -3 yards', JSON.stringify({ att: p.attempts, cmp: p.completions, yds: p.yards }));

  const mixed = [screen, snap(2, { result: 'Gain', yardage: '12' }), snap(3, { result: 'Incomplete', yardage: '0' }), snap(4, { result: 'Sack', yardage: '-6' })];
  const m = engine.compute(mixed).passing;
  ok(m.attempts === 3 && m.completions === 2 && m.yards === 9 && m.sacks === 1,
    'with a gain, an incompletion and a sack: 3 attempts, 2 completions, 9 yards, 1 sack',
    JSON.stringify({ att: m.attempts, cmp: m.completions, yds: m.yards, sacks: m.sacks }));
  ok(!StatsEngine.isCompletionResult?.(snap(5, { runPass: 'Run', result: 'Interception' })), 'an Interception alone is not a completion result');

  const role = engine._playerCredits([screen]).get('7')?.roles.get('passing');
  const n = key => role?.stats.get(key)?.length || 0;
  const yds = (role?.stats.get('yds') || []).reduce((sum, entry) => sum + entry.value, 0);
  ok(n('att') === 1 && n('cmp') === 1 && yds === -3,
    'individual passer credits: 1 attempt, 1 completion, -3 yards', JSON.stringify({ att: n('att'), cmp: n('cmp'), yds }));

  ok(StatsEngine.isMadeAttempt(screen, StatsEngine.hasResult), 'Study completions count the pass for a loss');

  const def = snap(6, { unit: 'defense', result: 'Loss', yardage: '-2' });
  const board = engine.defenseBoard([def], { scope: 'game' });
  const passing = board?.passingSummary;
  ok(passing && passing.attempts === 1 && passing.completions === 1,
    'Defense board passing: the screen for a loss is an attempt and a completion allowed', JSON.stringify(passing));

  const cov = engine._defensiveStats([
    snap(8, { unit: 'defense', result: 'Loss', yardage: '-2', coverage: 'Cover 3' }),
    snap(9, { unit: 'defense', runPass: 'Run', result: 'Loss', yardage: '-2', coverage: 'Cover 3' }),
  ]).coverages.find(row => row.name === 'Cover 3');
  ok(cov && cov.comps === 1, 'coverage: the pass for a loss is a completion allowed; a run for a loss is not', JSON.stringify(cov));

  const pa = engine._playActionStats([snap(7, { playType: 'Play Action', result: 'Loss', yardage: '-1' })]);
  ok(String(pa.paCompPct) === '100.0', 'play action: a play-action screen for a loss is a completion', JSON.stringify(pa));
}

console.log('\n-- 2. cut-ups play a multi-clip game in game order --');
const clipPlay = (id, start) => ({ id, clipId: `clip-${id}`, clipName: `p${id}.mp4`, timestamp: { start, end: start + 5 }, tags: {} });
{
  const plays = [clipPlay(1, 30), clipPlay(2, 0), clipPlay(3, 0)];
  const tagger = { getPlay: id => plays.find(p => p.id === id), selectPlay() {} };
  const vc = { on() {}, clearLoop() {}, video: null };
  const player = new CutupPlayer(vc, tagger);
  player._renderBanner = () => {}; player._updateBanner = () => {};
  player.start([3, 1, 2], 'test');
  ok(player.queue.map(p => p.id).join(',') === '1,2,3', 'CutupPlayer: plays 1, 2, 3', player.queue.map(p => p.id).join(','));
  player.active = false;

  const single = [{ id: 5, timestamp: { start: 90, end: 95 }, tags: {} }, { id: 6, timestamp: { start: 10, end: 15 }, tags: {} }];
  const singleTagger = { getPlay: id => single.find(p => p.id === id), selectPlay() {} };
  const p2 = new CutupPlayer(vc, singleTagger);
  p2._renderBanner = () => {}; p2._updateBanner = () => {};
  p2.start([5, 6], 'one video');
  ok(p2.queue.map(p => p.id).join(',') === '6,5', 'CutupPlayer: one continuous video still plays by time', p2.queue.map(p => p.id).join(','));
  p2.active = false;

  const game = { id: 'g1', gameInfo: { date: '2025-09-01' }, plays };
  const plan = new CrossGameCutup().plan(['g1::3', 'g1::1', 'g1::2'], [game]);
  ok(plan.segments.map(s => s.playId).join(',') === '1,2,3', 'CrossGameCutup: plays 1, 2, 3', plan.segments.map(s => s.playId).join(','));
  ok(plan.segments.every(s => !('play' in s)) && plan.segments.every((s, i) => s.order === i),
    'CrossGameCutup: segments keep their documented shape and order index', JSON.stringify(plan.segments[0]));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
