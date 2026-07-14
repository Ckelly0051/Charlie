/* Pure beta-default contract. Run: node tools/e2e-beta-config.mjs */
import assert from 'node:assert/strict';
import { configureBetaDefaults } from '../js/beta-config.js';

const memory = initial => {
  const values = new Map(Object.entries(initial || {}));
  return { getItem:key => values.get(key) ?? null, setItem:(key,value) => values.set(key,String(value)), values };
};

let pass = 0;
const test = (label, fn) => { fn(); pass++; console.log(`  PASS  ${label}`); };

test('stable and browser builds never change feature flags', () => {
  const stable = memory();
  assert.equal(configureBetaDefaults(stable, true, '1.12.0'), false);
  assert.equal(configureBetaDefaults(stable, false, '1.12.0-beta.1'), false);
  assert.equal(stable.values.size, 0);
});

test('first desktop beta launch enables the complete reversible beta stack', () => {
  const store = memory();
  assert.equal(configureBetaDefaults(store, true, '1.12.0-beta.1'), true);
  for (const key of ['ffa_workspace_shell_v2','ffa_breakdown_form_v2','ffa_sql_catalog']) assert.equal(store.getItem(key), '1');
  assert.equal(store.getItem('ffa_beta_defaults_1.12.0-beta.1'), '1');
});

test('one-time marker preserves a coach choosing classic afterward', () => {
  const store = memory({ 'ffa_beta_defaults_1.12.0-beta.1':'1', 'ffa_workspace_shell_v2':'0' });
  assert.equal(configureBetaDefaults(store, true, '1.12.0-beta.1'), false);
  assert.equal(store.getItem('ffa_workspace_shell_v2'), '0');
});

console.log(`\n== RESULT: ${pass} passed, 0 failed ==`);
