import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
// Targeted verification for the field-report fixes:
//  1. Folder re-upload re-links clips to saved plays (no duplicates).
//  2. Quarter carries across possession changes; defense field position advances.
//  3. Takeaway role credits INT/FR without a phantom tackle.
//  4. Carry-scheme toggle fills blank alignment fields on advance.
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = TEST_APP_URL;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(bundle, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 600));
await createFirstTeam(page, 'Test Team');
await page.evaluate(() => {
  document.getElementById('libNewName') && (document.getElementById('libNewName').value = 'S1');
  // Create a season through the library API to get a live tagger.
  window.app.storage.createSeason({ name: 'Test Season' });
});
await new Promise(r => setTimeout(r, 400));

// ---- 1. Folder re-upload re-link ----
const relink = await page.evaluate(async () => {
  const t = window.app.tagger;
  const pl = window.app.playlist;
  // Simulate a reopened save: plays exist with clipName + stale clipIds.
  t.plays.length = 0;
  t.plays.push(
    { id: 1, timestamp: { start: 0, end: 12 }, tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '5', unit: 'offense', custom: [] }, notes: '', clipName: 'clip_01', clipId: 7 },
    { id: 2, timestamp: { start: 0, end: 10 }, tags: { down: '2', distance: '5', playType: '', runPass: '', result: '', yardage: '', unit: '', custom: [] }, notes: '', clipName: 'clip_02', clipId: 8 },
    // Extra play marked inside clip_01 — shares its stale clipId, no clipName.
    { id: 3, timestamp: { start: 4, end: 9 }, tags: { down: '', distance: '', custom: [] }, notes: '', clipId: 7 }
  );
  t.nextId = 4;
  t.currentPlayId = 2;
  const before = t.plays.length;
  const files = [
    new File([new Uint8Array(64)], 'clip_01.mp4', { type: 'video/mp4' }),
    new File([new Uint8Array(64)], 'clip_02.mp4', { type: 'video/mp4' }),
  ];
  pl.addFiles(files);
  await new Promise(r => setTimeout(r, 800)); // let _autoCreatePlays settle
  const c1 = pl.clips.find(c => c.name === 'clip_01');
  const c2 = pl.clips.find(c => c.name === 'clip_02');
  return {
    playCount: t.plays.length, before,
    c1Play: c1 && c1.playId, c2Play: c2 && c2.playId,
    p1Clip: t.plays[0].clipId === c1.id,
    p3Follows: t.plays.find(p => p.id === 3).clipId === c1.id,
    tagsKept: t.plays[0].tags.playType === 'Run Inside',
  };
});
check('re-upload creates NO duplicate plays', relink.playCount === relink.before, JSON.stringify(relink));
check('clips re-linked to saved plays by name', relink.c1Play === 1 && relink.c2Play === 2, JSON.stringify(relink));
check('extra play inside a clip follows the stale clipId', relink.p3Follows === true);
check('tags survive the re-link', relink.tagsKept === true);

// ---- 2. Quarter carry + defense field position ----
const situ = await page.evaluate(() => {
  const t = window.app.tagger;
  const out = {};
  // Quarter carries across a possession-ending play (TD).
  const prevTD = { tags: { down: '2', distance: '4', quarter: 'Q2', result: 'Touchdown', yardage: '12', unit: 'offense' } };
  const next1 = { tags: { down: '', distance: '', quarter: '', custom: [] } };
  t.applyNextSituation(prevTD, next1);
  out.qtrAfterTD = next1.tags.quarter;
  // Defense: opponent gains 7 from our opp-40 (their 40) → ball moves toward
  // our goal: abs 60 → 53 (opp 47... wait abs is from OUR goal). own/opp:
  // opp 40 → abs 60; defense gain 7 → abs 53 → 'opp', yardLine 47.
  const prevDef = { tags: { down: '1', distance: '10', quarter: 'Q3', result: 'Gain', yardage: '7', unit: 'defense', fieldSide: 'opp', yardLine: '40' } };
  const sit = t.computeNextSituation(prevDef);
  out.defSit = sit;
  // Defense goal-to-go: opponent 1st down at our 6 → 1st & 6 (goal).
  const prevDefG = { tags: { down: '1', distance: '10', quarter: 'Q4', result: 'Gain', yardage: '14', unit: 'defense', fieldSide: 'own', yardLine: '20' } };
  out.defGoal = t.computeNextSituation(prevDefG);
  return out;
});
check('quarter carries across a TD (possession end)', situ.qtrAfterTD === 'Q2', JSON.stringify(situ));
check('defense field position advances toward our goal', situ.defSit && situ.defSit.down === '2' && situ.defSit.distance === '3' && situ.defSit.fieldSide === 'opp' && String(situ.defSit.yardLine) === '47', JSON.stringify(situ.defSit));
check('defense goal-to-go uses OUR goal line', situ.defGoal && situ.defGoal.down === '1' && situ.defGoal.distance === '6' && situ.defGoal.fieldSide === 'own' && String(situ.defGoal.yardLine) === '6', JSON.stringify(situ.defGoal));

// ---- 3. Takeaway crediting ----
const takeaway = await page.evaluate(() => {
  const se = window.app.stats;
  const mk = (id, tags) => ({ id, timestamp: { start: id * 10, end: id * 10 + 5 }, tags });
  const plays = [
    // Interception credit is explicit and independent of tackle credit.
    mk(1, { unit: 'defense', playType: 'Deep Pass', runPass: 'Pass', result: 'Interception', yardage: '0', players: { takeaway: '21' }, custom: [] }),
    // A tackler alone does not prove who recovered a fumble.
    mk(2, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Fumble', yardage: '2', players: { tackler: '55' }, custom: [] }),
    // Confirmed recovery: the Takeaway role receives the FR credit.
    mk(3, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Fumble', fumbleRecovery: 'subject', yardage: '1', players: { takeaway: '44' }, custom: [] }),
  ];
  const stats = se.compute(plays);
  const p21 = stats.individuals.tacklers.find(x => x.num === '21');
  const p55 = stats.individuals.tacklers.find(x => x.num === '55');
  const p44 = stats.individuals.tacklers.find(x => x.num === '44');
  return { p21, p55, p44 };
});
check('Takeaway role credits INT without a tackle', takeaway.p21 && takeaway.p21.ints === 1 && takeaway.p21.tackles === 0, JSON.stringify(takeaway.p21));
check('tackler-only fumble with unknown recovery gets no false FR credit', takeaway.p55 && takeaway.p55.fumblesRec === 0 && takeaway.p55.tackles === 1, JSON.stringify(takeaway.p55));
check('confirmed fumble recovery credits the Takeaway player', takeaway.p44 && takeaway.p44.fumblesRec === 1 && takeaway.p44.tackles === 0, JSON.stringify(takeaway.p44));

// ---- 4. Carry scheme ----
const carry = await page.evaluate(() => {
  const t = window.app.tagger;
  t.carryScheme = true;
  const prev = { tags: { formation: 'Wing-T', personnel: '21', defFront: '', coverage: '', custom: [] } };
  const next = { tags: { formation: '', personnel: '', defFront: '', coverage: '', custom: [] } };
  // applyCarryScheme reloads the form for the CURRENT play; next isn't current,
  // so just verify the data carry.
  t.applyCarryScheme(prev, next);
  const blocked = { tags: { formation: 'Spread', personnel: '', custom: [] } };
  t.applyCarryScheme(prev, blocked);
  return { f: next.tags.formation, p: next.tags.personnel, kept: blocked.tags.formation, filled: blocked.tags.personnel };
});
check('carry-scheme fills blank formation/personnel', carry.f === 'Wing-T' && carry.p === '21', JSON.stringify(carry));
check('carry-scheme never overwrites a tagged look', carry.kept === 'Spread' && carry.filled === '21', JSON.stringify(carry));

// Toggle exists and persists
const toggle = await page.evaluate(() => {
  const el = document.getElementById('carrySchemeToggle');
  if (!el) return { exists: false };
  el.checked = true;
  el.dispatchEvent(new Event('change'));
  return { exists: true, stored: localStorage.getItem('ffa_carry_scheme') };
});
check('carry-scheme toggle wired + persisted', toggle.exists && toggle.stored === '1', JSON.stringify(toggle));

// Takeaway input present in the form
const roleInput = await page.evaluate(() => ({
  input: !!document.getElementById('tagPlayerTakeaway'),
  rosterRole: !!(window.app.roster && window.app.roster.roleInputs.takeaway),
}));
check('Takeaway role input present + registered with roster', roleInput.input && roleInput.rosterRole);

const benign = errors.filter(e => !/Failed to load because no supported source|The element has no supported sources/.test(e));
check('no unexpected page errors', benign.length === 0, benign.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
