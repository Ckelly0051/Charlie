/* PLAN CONTRACT HARNESS (Node) — Phase 3 Plan foundation: the backward-compatible
   season-level `plans: []` data contract on SeasonStore. Verifies it defaults
   safely on legacy seasons, normalizes defensively while PRESERVING unknown/future
   keys (so the shape can grow without a migration), survives a JSON round-trip, and
   that the mutation seam (create/rename/notes/addItem/removeItem/delete) keeps a
   normalized shape. Pure data — a stub backend, no DOM/disk. NOTHING in the app
   consumes plans yet (the Plan UI + "save Study finding" land next).
   Run:  node tools/e2e-plan-contract.mjs */
import assert from 'node:assert';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const store = () => new SeasonStore({});   // stub backend — we only exercise pure data
const legacy = () => ({ version: 5, type: 'season', seasonName: 'Old', games: [{ id: 'g1', plays: [], gameInfo: {} }], activeGameId: 'g1' });

// ---- 1. backward-compat: a season saved before this contract gets plans:[] ----
{
  const s = store();
  s.data = s._normalize(legacy());
  ok(Array.isArray(s.data.plans) && s.data.plans.length === 0, 'a legacy season (no plans key) normalizes to plans: []', JSON.stringify(s.data.plans));
  ok(!('plans' in legacy()), 'the legacy fixture genuinely has no plans key (guards the test)');
}

// ---- 2. _empty() seeds the contract -----------------------------------------
{
  const s = store();
  ok(Array.isArray(s._empty().plans), '_empty() seeds plans: []');
}

// ---- 3. defensive normalize: fill ids, default fields, filter junk ----------
{
  const s = store();
  const d = legacy();
  d.plans = [
    { name: 'Week 1', color: 'red', items: [ { label: 'Wing-T tell', refs: ['g1::3', 5], mood: 'spicy' }, null, 7 ] },
    null, 42, 'nope',
  ];
  s.data = s._normalize(d);
  ok(s.data.plans.length === 1, 'non-object plan entries are filtered out', String(s.data.plans.length));
  const p = s.data.plans[0];
  ok(!!p.id && !!p.createdAt && !!p.updatedAt && p.notes === '', 'a plan gets an id + timestamps + default notes');
  ok(p.color === 'red', 'UNKNOWN plan keys are preserved (forward-compat)');
  ok(p.items.length === 1, 'non-object plan items are filtered out', String(p.items.length));
  const it = p.items[0];
  ok(it.kind === 'note' && !!it.id, 'a plan item gets an id + default kind');
  ok(JSON.stringify(it.refs) === JSON.stringify(['g1::3', '5']), 'item refs are coerced to strings (composite film ids)', JSON.stringify(it.refs));
  ok(it.mood === 'spicy', 'UNKNOWN item keys are preserved (forward-compat)');
}

// ---- 4. JSON round-trip: plans survive serialize → reload → normalize -------
{
  const s = store();
  s.data = s._normalize(legacy());
  const plan = s.createPlan('Opener script');
  s.addPlanItem(plan.id, { kind: 'finding', label: '3rd & long tendency', refs: ['g1::12', 'g2::4'], query: { dimension: 'formation', measure: 'successRate' } });
  const raw = JSON.parse(JSON.stringify(s.data));            // simulate saveSeason → loadSeason
  const s2 = store();
  s2.data = s2._normalize(raw);
  ok(s2.data.plans.length === 1 && s2.data.plans[0].items.length === 1, 'plans + items survive a JSON round-trip');
  const it = s2.data.plans[0].items[0];
  ok(it.kind === 'finding' && it.query && it.query.dimension === 'formation' && it.refs.length === 2, 'a saved Study finding (query + cross-game refs) round-trips intact', JSON.stringify(it));
}

// ---- 5. mutation seam: create / rename / notes / addItem / removeItem / delete
{
  const s = store();
  s.data = s._normalize(legacy());
  const p = s.createPlan();
  ok(s.plans().length === 1 && p.name === 'Game Plan', 'createPlan() appends a default-named plan');
  const t0 = p.updatedAt;
  s.renamePlan(p.id, '  Red Zone  ');
  ok(s.getPlan(p.id).name === 'Red Zone', 'renamePlan trims + sets the name');
  s.setPlanNotes(p.id, 'attack the boundary');
  ok(s.getPlan(p.id).notes === 'attack the boundary', 'setPlanNotes sets notes');
  const it = s.addPlanItem(p.id, { kind: 'film', refs: ['g1::9'] });
  ok(s.getPlan(p.id).items.length === 1 && it.refs[0] === 'g1::9', 'addPlanItem appends a normalized item');
  ok(s.getPlan(p.id).updatedAt >= t0, 'a mutation advances updatedAt');
  ok(s.removePlanItem(p.id, it.id) === true && s.getPlan(p.id).items.length === 0, 'removePlanItem removes by id');
  ok(s.removePlanItem(p.id, 'nope') === false, 'removePlanItem on a missing id is a no-op false');
  ok(s.deletePlan(p.id) === true && s.plans().length === 0, 'deletePlan removes the plan');
  ok(s.deletePlan('nope') === false, 'deletePlan on a missing id is a no-op false');
}

// ---- 6. mutations on the wrong id never throw / never corrupt ---------------
{
  const s = store();
  s.data = s._normalize(legacy());
  ok(s.getPlan('missing') === null && s.renamePlan('missing', 'x') === null && s.addPlanItem('missing', {}) === null, 'plan mutators on a missing id return null, no throw');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
