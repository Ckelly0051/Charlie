import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* E3a-4 — cross-tabs with the §6.5 eligible-denominator contract. Two dedicated
   single-value × single-value cross-tabs: qbAlignment × strength (new, §8a) and
   coverage-call × coverageFamily. Per §19, each cohort lives in its OWN synthetic
   game tested at that game scope, so `total` is exactly the cohort and expected
   counts are unambiguous and immune to unrelated fixture additions.

   §6.5 contract asserted EXACTLY (not just "cells sum to something"):
     - total    = the game's play count,
     - eligible = plays with a value on BOTH axes (> 0, positively tested),
     - omitted  = total − eligible,
     - a blank-axis play appears in NO cell,
     - each cell's count equals its expected value, and Σ cells === eligible.

   Also exercises projection: some plays carry the legacy alignment token in
   `formation` (e.g. "Under Center + Ace") so the qbAlignment axis is populated by
   TagProjection, not a pre-split field.

   Run: node tools/e2e-crosstab.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const results = await page.evaluate(() => {
  const eng = window.app?.stats;
  if (!eng) return { missing: true };
  const tag = (o) => ({ down: '', distance: '', formation: '', backfield: '', strength: '',
    personnel: '', motion: '', runPass: '', playType: '', result: '', yardage: '',
    coverage: '', defFront: '', blitz: '', unit: 'offense', players: {}, grades: {}, ...o });
  const play = (id, t) => ({ id, timestamp: { start: 0, end: 1 }, tags: tag(t) });
  const out = [];
  const t = (label, cond, detail = '') => out.push({ label, ok: !!cond, detail: String(detail) });
  const cellCount = (m, r, c) => (m.cells[`${r}\0${c}`]?.count) || 0;
  const cellSum = (m) => Object.values(m.cells).reduce((s, c) => s + c.count, 0);

  // ============ COHORT A — qbAlignment × strength (dedicated game) ============
  // P1/P3 carry the alignment token INSIDE formation (projection must read it).
  const gameA = [
    play(1, { unit: 'offense', formation: 'Under Center + Ace', strength: 'Right' }), // (Under Center, Right)
    play(2, { unit: 'offense', qbAlignment: 'Shotgun', formation: 'Ace', strength: 'Left' }), // (Shotgun, Left)
    play(3, { unit: 'offense', formation: 'Pistol + Trips', strength: 'Right' }), // (Pistol, Right)
    play(4, { unit: 'offense', formation: 'Shotgun + Trips', strength: '' }), // blank strength → omitted
    play(5, { unit: 'offense', formation: 'Ace', strength: 'Balanced' }), // blank qbAlignment → omitted
  ];
  const A = eng._computeMatrix(gameA, 'qbAlignment', 'strength');
  t('A total = 5 (game play count)', A.total === 5, `total=${A.total}`);
  t('A eligible = 3 (value on both axes)', A.eligible === 3, `eligible=${A.eligible}`);
  t('A omitted = 2 (total − eligible)', A.omitted === 2, `omitted=${A.omitted}`);
  t('A Σ cells === eligible (single×single)', cellSum(A) === A.eligible, `Σ=${cellSum(A)} eligible=${A.eligible}`);
  t('A cell (Under Center, Right) = 1', cellCount(A, 'Under Center', 'Right') === 1, cellCount(A, 'Under Center', 'Right'));
  t('A cell (Shotgun, Left) = 1', cellCount(A, 'Shotgun', 'Left') === 1, cellCount(A, 'Shotgun', 'Left'));
  t('A cell (Pistol, Right) = 1', cellCount(A, 'Pistol', 'Right') === 1, cellCount(A, 'Pistol', 'Right'));
  // blank-strength play (id 4, projected qb Shotgun) must NOT appear under Shotgun row on any strength col
  t('A blank-strength play in NO cell (no Shotgun×Balanced etc.)', cellCount(A, 'Shotgun', 'Balanced') === 0 && cellCount(A, 'Shotgun', 'Right') === 0, `ShotgunRight=${cellCount(A, 'Shotgun', 'Right')}`);
  // blank-qbAlignment play (id 5, strength Balanced) must NOT appear in any cell
  t('A blank-qbAlignment play in NO cell (no *×Balanced)', A.colKeys.indexOf('Balanced') === -1 || cellSum(A) === 3, `colKeys=${JSON.stringify(A.colKeys)}`);

  // ============ COHORT B — coverage-call × coverageFamily (dedicated game) =====
  // Defensive plays only; a REAL coverage call on EVERY play; family spans
  // Man/Zone/Match AND a blank-family play (so eligible < total, positively).
  const gameB = [
    play(1, { unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Man', defFront: '4-3' }),   // (Cover 3, Man)
    play(2, { unit: 'defense', coverage: 'Cover 3', coverageFamily: 'Zone', defFront: '4-3' }),  // (Cover 3, Zone)
    play(3, { unit: 'defense', coverage: 'Cover 1', coverageFamily: 'Man', defFront: '3-4' }),   // (Cover 1, Man)
    play(4, { unit: 'defense', coverage: 'Cover 2', coverageFamily: 'Match', defFront: '4-3' }), // (Cover 2, Match)
    play(5, { unit: 'defense', coverage: 'Cover 4', coverageFamily: '', defFront: 'Nickel' }),   // blank family → omitted
  ];
  const B = eng._computeMatrix(gameB, 'coverage', 'coverageFamily');
  t('B total = 5 (game play count)', B.total === 5, `total=${B.total}`);
  t('B eligible = 4 (> 0, both axes)', B.eligible === 4, `eligible=${B.eligible}`);
  t('B omitted = 1 (Cover 4 blank family)', B.omitted === 1, `omitted=${B.omitted}`);
  t('B Σ cells === eligible (single×single)', cellSum(B) === B.eligible, `Σ=${cellSum(B)} eligible=${B.eligible}`);
  t('B cell (Cover 3, Man) = 1', cellCount(B, 'Cover 3', 'Man') === 1, cellCount(B, 'Cover 3', 'Man'));
  t('B cell (Cover 3, Zone) = 1', cellCount(B, 'Cover 3', 'Zone') === 1, cellCount(B, 'Cover 3', 'Zone'));
  t('B cell (Cover 1, Man) = 1', cellCount(B, 'Cover 1', 'Man') === 1, cellCount(B, 'Cover 1', 'Man'));
  t('B cell (Cover 2, Match) = 1', cellCount(B, 'Cover 2', 'Match') === 1, cellCount(B, 'Cover 2', 'Match'));
  // Cover 4 has a real call but blank family → present on NO cell; its call must
  // not appear as a row at all (nothing pairs with it).
  t('B blank-family play (Cover 4) in NO cell', B.rowKeys.indexOf('Cover 4') === -1, `rowKeys=${JSON.stringify(B.rowKeys)}`);

  // Guard: the two new dimensions are actually registered as matrix dims.
  const dimIds = eng.constructor._matrixDimensions().map(d => d.id);
  t('matrix dims include qbAlignment + coverageFamily', dimIds.includes('qbAlignment') && dimIds.includes('coverageFamily'), JSON.stringify(dimIds));

  return { out };
});

console.log('\n== E3a cross-tabs (eligible denominator §6.5) ==');
if (results.missing) { console.error('  FAIL  window.app.stats not available'); fail++; }
else for (const r of results.out) ok(r.ok, r.label, r.ok ? '' : r.detail);

ok(errors.length === 0, `zero page errors`, errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
