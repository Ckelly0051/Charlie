/* STUDY→PLAN HARNESS (Node) — the data half of Phase 3 step 2. Proves the pure
   StudyPlan helpers (label / finding / film / planRefs) and that a built finding
   round-trips through the real SeasonStore plans:[] contract (addPlanItem →
   normalize → JSON reload) and flattens back to the composite refs CrossGameCutup
   consumes. Pure — stub backend, no DOM/film. StudyPlan is UNWIRED; the Plan UI
   wires it. Run:  node tools/e2e-study-plan.mjs */
import assert from 'node:assert';
import { StudyPlan } from '../js/study-plan.js';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

// ---- 1. labels ---------------------------------------------------------------
ok(StudyPlan.label({ groupValue: 'Wing-T', measureName: 'Success Rate', sampleSize: 18 }) === 'Wing-T — Success Rate (n=18)', 'group-scoped label reads "<group> — <measure> (n=…)"');
ok(StudyPlan.label({ dimensionName: 'Formation', measureName: 'Success Rate', scopeLabel: 'full season' }) === 'Formation — Success Rate · full season', 'whole-query label reads "<dimension> — <measure> · <scope>"');
ok(StudyPlan.label({ groupValue: 'Trips', measureName: 'YPP' }) === 'Trips — YPP', 'sample is omitted when absent');
ok(StudyPlan.label({ groupValue: '', dimensionName: 'Down', measureName: 'Conv' }) === 'Down — Conv', 'a blank group falls back to the dimension label');

// ---- 2. finding payload ------------------------------------------------------
{
  const it = StudyPlan.finding({ dimensionName: 'Formation', measureName: 'Success Rate', scopeLabel: 'full season', groupValue: 'Wing-T', sampleSize: 18, dimension: 'formation', measure: 'successRate', scope: 'season', compare: 'prior', cohort: 'against', refs: ['g1::3', 9, 'g2::4'] });
  ok(it.kind === 'finding' && it.label === 'Wing-T — Success Rate (n=18)', 'finding() carries kind + canonical label');
  ok(JSON.stringify(it.refs) === JSON.stringify(['g1::3', '9', 'g2::4']), 'finding() coerces refs to strings', JSON.stringify(it.refs));
  ok(it.query.dimension === 'formation' && it.query.measure === 'successRate' && it.query.scope === 'season' && it.query.group === 'Wing-T', 'finding() preserves the query context (re-runnable)', JSON.stringify(it.query));
  ok(it.query.compare === 'prior' && it.query.cohort === 'against', 'finding() preserves the selected comparison cohort', JSON.stringify(it.query));
}

// ---- 3. film item ------------------------------------------------------------
{
  const it = StudyPlan.film(['g1::1', 'g1::2'], 'Red zone looks');
  ok(it.kind === 'film' && it.query === null && it.refs.length === 2 && it.label === 'Red zone looks', 'film() builds a bare film-ref item with no query');
}

// ---- 4. planRefs flatten + dedup + order ------------------------------------
{
  const plan = { items: [
    { kind: 'finding', refs: ['g1::3', 'g2::4'] },
    { kind: 'note', refs: undefined },
    { kind: 'film', refs: ['g2::4', 'g1::9'] },   // g2::4 is a duplicate
  ] };
  ok(JSON.stringify(StudyPlan.planRefs(plan)) === JSON.stringify(['g1::3', 'g2::4', 'g1::9']), 'planRefs flattens, de-dupes (first wins), preserves order', JSON.stringify(StudyPlan.planRefs(plan)));
  ok(StudyPlan.planRefs(null).length === 0 && StudyPlan.planRefs({}).length === 0, 'planRefs is null-safe');
}

// ---- 5. end-to-end through the real SeasonStore plans contract --------------
{
  const s = new SeasonStore({});   // stub backend — pure data
  s.data = s._normalize({ version: 5, type: 'season', games: [{ id: 'g1', plays: [], gameInfo: {} }], activeGameId: 'g1' });
  const plan = s.createPlan('3rd down attack');
  const item = StudyPlan.finding({ dimensionName: 'Formation', measureName: 'Success Rate', groupValue: 'Wing-T', sampleSize: 12, dimension: 'formation', measure: 'successRate', scope: 'season', refs: ['g1::3', 'g2::9'] });
  const saved = s.addPlanItem(plan.id, item);
  ok(!!saved.id && !!saved.createdAt, 'the store normalizes a StudyPlan finding (adds id + createdAt)');
  // Round-trip through save→load (JSON), then flatten for the cross-game player.
  const reload = new SeasonStore({});
  reload.data = reload._normalize(JSON.parse(JSON.stringify(s.data)));
  const p2 = reload.getPlan(plan.id);
  ok(p2 && p2.items.length === 1 && p2.items[0].query.dimension === 'formation', 'a saved finding round-trips through the plans contract');
  ok(JSON.stringify(StudyPlan.planRefs(p2)) === JSON.stringify(['g1::3', 'g2::9']), 'the reloaded plan flattens to the composite refs CrossGameCutup consumes', JSON.stringify(StudyPlan.planRefs(p2)));
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
