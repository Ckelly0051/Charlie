/* AMBIGUOUS RUN/PASS HARNESS (Node) -------------------------------------------
   A plain RPO with Run/Pass blank counted as a completed pass (Codex review,
   2026-10-05). RPO and Play Action are ambiguous (PlayTagger leaves Run/Pass
   blank for them), so analytics leave them unclassified.

   Run:  node tools/e2e-ambiguous-run-pass.mjs */
import { StatsEngine } from '../js/stats-engine.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => { if (cond) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
console.log('\n-- ambiguous play types without Run/Pass stay unclassified --');
{
  const snap = (id, tags) => ({ id, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', runPass: '', players: {}, ...tags } });
  const rpo = snap(1, { playType: 'RPO', rpoDecision: 'Give', result: 'Gain', yardage: '5' });
  const pa = snap(2, { playType: 'Play Action', result: 'Gain', yardage: '8' });
  ok(!StatsEngine.isPass(rpo) && !StatsEngine.isRun(rpo), 'RPO with Run/Pass blank is neither run nor pass');
  ok(!StatsEngine.isPass(pa) && !StatsEngine.isRun(pa), 'Play Action with Run/Pass blank is neither run nor pass');
  const s = new StatsEngine(null).compute([rpo, pa]);
  ok(s.passing.attempts === 0 && s.passing.completions === 0 && s.passing.yards === 0 && s.rushing.attempts === 0,
    'neither play adds a passing or rushing attempt or yards',
    JSON.stringify({ att: s.passing.attempts, cmp: s.passing.completions, yds: s.passing.yards, rush: s.rushing.attempts }));
  ok(StatsEngine.isPass(snap(3, { playType: 'RPO', runPass: 'Pass' })) && StatsEngine.isRun(snap(4, { playType: 'RPO', runPass: 'Run' })),
    'a charted Run/Pass still classifies an RPO');
  ok(StatsEngine.isPass(snap(5, { playType: 'Screen' })) && StatsEngine.isRun(snap(6, { playType: 'Run Inside' })),
    'unambiguous play types still classify with Run/Pass blank');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
