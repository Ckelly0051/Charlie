/**
 * LEGACY INVENTORY RATCHET (docs/archive/plans/LEGACY-EXCISION-PLAN.md, Phase 0). The legacy
 * counts may only fall. A rise means new code copied an old pattern (a second
 * unit rule, a fake form field read, a raw innerHTML sink, a new dead name)
 * and fails here. When a phase removes legacy code, the same commit lowers the
 * baseline in tools/legacy-inventory-baseline.json, so progress is recorded.
 * Static and read-only; it does not open the app.
 * Run:  node tools/e2e-legacy-inventory.mjs
 */
import { readFileSync } from 'node:fs';
import { inventory } from './audit-legacy.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));

const baseline = JSON.parse(readFileSync(new URL('./legacy-inventory-baseline.json', import.meta.url), 'utf8'));
const now = inventory();

console.log('\n== 1. No legacy count rises ==');
for (const [key, was] of Object.entries(baseline.counts)) {
  const is = now.counts[key];
  if (key === 'statsEngineLines') {
    // Size, not a legacy pattern: tracked, allowed to move by a small margin.
    ok(is <= was + 150, `stats-engine.js stays within 150 lines of its recorded size (${is} vs ${was})`);
    continue;
  }
  ok(is <= was, `${key}: ${is} (baseline ${was})`, is > was ? `rose by ${is - was}` : '');
  if (is < was) console.log(`        ${key} fell by ${was - is}: lower the baseline in this commit`);
}

console.log('\n== 2. No new dead names or orphan modules ==');
const newDead = now.deadNames.filter(name => !baseline.deadNames.includes(name));
ok(!newDead.length, 'every dead-name candidate was already recorded', newDead.join(', '));
const newOrphans = now.orphanModules.filter(file => !baseline.orphanModules.includes(file));
ok(!newOrphans.length, 'no module newly imported by nothing', newOrphans.join(', '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
