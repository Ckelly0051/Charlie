/* PLAN EXPORT HARNESS (Node) — the data half of Phase 3 Plan export/presentation.
   Proves PlanExport.build resolves a plan's composite gameId::playId refs against
   the season games IN PLAN ORDER, pulls play situation/context, flags missing
   film honestly, and that PlanExport.html renders a standalone doc that ESCAPES
   every coach-entered string (stored-XSS boundary). Pure, unwired.
   Run:  node tools/e2e-plan-export.mjs */
import assert from 'node:assert';
import { PlanExport } from '../js/plan-export.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

const play = (id, tags, notes = '') => ({ id, timestamp: { start: 0, end: 5 }, tags, notes });
const games = [
  { id: 'g1', name: 'Week 1 vs Central', gameInfo: { opponent: 'Central' }, plays: [
    play(3, { down: '3', distance: '7', formation: 'Trips', playType: 'Deep Pass', result: 'Gain', yardage: '22' }, 'Y-cross'),
    play(9, { down: '1', distance: '10', formation: 'Wing-T', playType: 'Run Inside', result: 'Gain', yardage: '4' }),
  ] },
  { id: 'g2', name: 'Week 2 vs North', gameInfo: {}, plays: [
    play(4, { down: '2', distance: '3', formation: 'Goal Line', playType: 'Run Outside', result: 'Touchdown', yardage: '3' }),
  ] },
];

// ---- 1. build resolves refs in plan order, with situation/context -----------
{
  const plan = { name: 'Third Down', notes: 'attack the sticks', createdAt: '2026-07-01T00:00:00Z', updatedAt: '2026-07-10T00:00:00Z', items: [
    { id: 'i1', kind: 'finding', label: '3rd & long', note: 'PA shots', refs: ['g1::3', 'g2::4'] },
    { id: 'i2', kind: 'film', label: 'Base runs', refs: ['g1::9'] },
  ] };
  const exp = PlanExport.build(plan, games);
  ok(exp.name === 'Third Down' && exp.itemCount === 2 && exp.playCount === 3 && exp.missingCount === 0, 'build summarizes name + item/play counts', JSON.stringify({ i: exp.itemCount, p: exp.playCount }));
  ok(exp.items[0].label === '3rd & long' && exp.items[1].label === 'Base runs', 'items stay in PLAN order');
  const p0 = exp.items[0].plays[0];
  ok(p0.gameName === 'Week 1 vs Central' && p0.situation === '3rd & 7' && p0.formation === 'Trips' && p0.result === 'Gain' && p0.yardage === '22', 'a ref resolves to its game + situation + context', JSON.stringify(p0));
  ok(exp.items[0].plays[1].gameName === 'Week 2 vs North', 'a cross-game ref resolves to the other game');
}

// ---- 2. missing refs are flagged, not dropped -------------------------------
{
  const plan = { name: 'P', items: [{ id: 'i', kind: 'film', label: 'x', refs: ['g1::3', 'g1::999', 'gX::1', 'bare'] }] };
  const exp = PlanExport.build(plan, games);
  const it = exp.items[0];
  ok(it.refCount === 4 && it.resolved === 1 && it.missing === 2, 'missing play + missing game are flagged; a bare (non-composite) ref is skipped', JSON.stringify({ r: it.refCount, ok: it.resolved, miss: it.missing }));
  ok(exp.missingCount === 2 && exp.playCount === 1, 'plan totals separate resolved from missing');
  ok(it.plays.find(p => p.playId === '999').missing === true && it.plays.find(p => p.gameId === 'gX').missing === true, 'both a missing play and a missing game resolve to a missing marker');
}

// ---- 3. html renders a standalone doc ---------------------------------------
{
  const exp = PlanExport.build({ name: 'Install', notes: 'meeting @ 3', items: [{ id: 'i', kind: 'finding', label: 'Openers', refs: ['g1::3'] }] }, games);
  const html = PlanExport.html(exp);
  ok(html.startsWith('<!doctype html>') && html.includes('<title>Install — Game Plan</title>'), 'html is a standalone document titled by the plan');
  ok(html.includes('Week 1 vs Central') && html.includes('3rd &amp; 7') && html.includes('Openers'), 'html includes resolved play context + item label');
  ok(html.includes('meeting @ 3'), 'html includes staff notes');
}

// ---- 4. XSS: every coach-entered string is escaped in html ------------------
{
  const evil = '<img src=x onerror=alert(1)>';
  const g = [{ id: 'g1', name: evil, plays: [play(1, { down: '1', distance: '10', formation: evil }, evil)] }];
  const plan = { name: evil, notes: evil, items: [{ id: 'i', kind: 'film', label: evil, note: evil, refs: ['g1::1'] }] };
  const html = PlanExport.html(PlanExport.build(plan, g));
  ok(!html.includes('<img src=x'), 'raw payload never appears unescaped in the export html');
  ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), 'coach-entered strings (name/notes/label/game/play notes) are HTML-escaped');
}

// ---- 5. null-safety ---------------------------------------------------------
{
  const empty = PlanExport.build(null, null);
  ok(empty.name === 'Game Plan' && empty.itemCount === 0 && empty.playCount === 0, 'build is null-safe (empty plan)');
  ok(typeof PlanExport.html(empty) === 'string' && PlanExport.html(empty).includes('no items yet'), 'html of an empty plan is a valid doc');
}

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
