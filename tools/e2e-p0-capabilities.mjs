/* P0-d capability manifest audit.
   This does not replace the referenced journeys. It makes their ownership
   explicit and fails if a migration deletes or renames its behavioral proof. */
import { readFile } from 'node:fs/promises';
import { P0_CAPABILITIES, P0_CRITICAL_CAPABILITY_IDS } from './p0-capability-inventory.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const requiredSurfaces = ['home','shell','breakdown','film-room','study','reports','plan','settings','film-navigation','overlays'];
const ids = P0_CAPABILITIES.map(item => item.id);
ok(new Set(ids).size === ids.length, 'every capability id is unique');
const missingCritical = P0_CRITICAL_CAPABILITY_IDS.filter(id => !ids.includes(id));
ok(!missingCritical.length,
  'every historically vulnerable coach capability has explicit journey ownership',
  missingCritical.join(', '));
ok(requiredSurfaces.every(surface => P0_CAPABILITIES.some(item => item.surface === surface)),
  'every migration surface has at least one owned capability');
ok(P0_CAPABILITIES.every(item => ['behavior','data','a11y'].includes(item.evidence)),
  'primary capability evidence is behavioral, data, or accessibility — never geometry');

const byHarness = new Map();
for (const item of P0_CAPABILITIES) {
  if (!byHarness.has(item.harness)) {
    try { byHarness.set(item.harness, await readFile(new URL(item.harness, import.meta.url), 'utf8')); }
    catch { byHarness.set(item.harness, ''); }
  }
}
const missingFiles = [...byHarness].filter(([, source]) => !source).map(([file]) => file);
ok(!missingFiles.length, 'every capability points to a canonical e2e harness', missingFiles.join(', '));
const missingAssertions = P0_CAPABILITIES.filter(item => !byHarness.get(item.harness)?.includes(item.assertion));
ok(!missingAssertions.length, 'every capability points to an exact live journey assertion',
  missingAssertions.map(item => `${item.id} -> ${item.harness}: ${item.assertion}`).join(' | '));
const weak = P0_CAPABILITIES.filter(item => /(?:width|height|overflow|visible|geometry|pixel)/i.test(item.assertion));
ok(!weak.length, 'no capability is certified only by visibility or geometry', weak.map(item => item.id).join(', '));
const evidence = Object.fromEntries(['behavior','data','a11y'].map(kind => [kind, P0_CAPABILITIES.filter(item => item.evidence === kind).length]));
ok(Object.values(evidence).every(count => count > 0), 'inventory includes behavior, data-integrity, and accessibility evidence', JSON.stringify(evidence));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
