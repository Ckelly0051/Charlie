/* E2E tagging-speed harness — drives the built bundle headless through the
   Phase A speed/correctness fixes: form guard when no play is selected,
   Enter-in-yardage advance, auto-Gain from positive yardage, Y hotkey,
   drawing-digit gate, real Skip vs Save & Next, penalty down-replay in
   Auto D&D, markEnd feedback, rare-result expander. Run after build:
     bash build.sh && node tools/e2e-tagging.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== 1. Setup: team + demo season + open game ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team/season setup lives in the library overlay, opened from the shell Home.
await page.evaluate(() => document.querySelector('[data-ws-action="seasons"]')?.click());
await sleep(400);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
// Open game 1 from the shell Home film inbox (the sole game-entry route).
await page.evaluate(() => document.querySelector('#wsFilmList [data-ws-game]')?.click());
await sleep(700);

console.log('\n== 2. Form guard: enabled with a play, disabled without ==');
let r = await page.evaluate(() => {
  const t = window.app.tagger;
  t.selectPlay(t.plays[0].id);
  const form = document.getElementById('tagForm');
  const hint = document.getElementById('tagFormHint');
  const withPlay = {
    disabled: form.classList.contains('form-disabled'),
    hintShown: hint && !hint.classList.contains('hidden'),
  };
  return { withPlay };
});
ok(!r.withPlay.disabled, 'form enabled while a play is selected');
ok(!r.withPlay.hintShown, 'hint hidden while a play is selected');

console.log('\n== 3. Enter inside yardage saves & advances ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const a = t.plays[2], b = t.plays[3];
  t.selectPlay(a.id);
  return { aId: a.id, bId: b.id, aResult: a.tags.result };
});
await page.focus('#tagYardage');
await page.evaluate(() => { document.getElementById('tagYardage').value = ''; });
await page.type('#tagYardage', '8');
await page.keyboard.press('Enter');
await sleep(150);
r = await page.evaluate((prev) => {
  const t = window.app.tagger;
  const a = t.getPlay(prev.aId);
  return {
    cur: t.currentPlayId, expected: prev.bId,
    savedMag: Math.abs(parseInt(a.tags.yardage, 10)),
    blurred: document.activeElement !== document.getElementById('tagYardage'),
  };
}, r);
ok(r.cur === r.expected, 'Enter in yardage advanced to the next play', JSON.stringify(r));
ok(r.savedMag === 8, 'typed yardage committed before advancing', JSON.stringify(r));
ok(r.blurred, 'input blurred so shortcuts work on the next play');

console.log('\n== 4. Positive yardage auto-fills Gain when result is blank ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const p = t.plays[5];
  t.selectPlay(p.id);
  // blank the result, then enter yardage like a coach would
  t.tagFields.result.value = '';
  t._saveField('result');
  t.tagFields.yardage.value = '7';
  t._saveField('yardage');
  const afterPositive = { result: p.tags.result, yardage: p.tags.yardage };
  // explicit result still wins: switch to Loss, yardage goes negative
  t.tagFields.result.value = 'Loss';
  t._saveField('result');
  const afterLoss = { result: p.tags.result, yardage: p.tags.yardage };
  return { afterPositive, afterLoss };
});
ok(r.afterPositive.result === 'Gain' && r.afterPositive.yardage === '7',
   'blank result + positive yards -> Gain', JSON.stringify(r.afterPositive));
ok(r.afterLoss.result === 'Loss' && r.afterLoss.yardage === '-7',
   'explicit Loss overrides and re-signs yardage', JSON.stringify(r.afterLoss));

console.log('\n== 5. Y hotkey jumps to yardage ==');
await page.evaluate(() => {
  const t = window.app.tagger;
  t.selectPlay(t.plays[6].id);
  document.activeElement && document.activeElement.blur();
});
await page.keyboard.press('y');
r = await page.evaluate(() => ({ focused: document.activeElement?.id }));
ok(r.focused === 'tagYardage', 'Y focuses the yardage input', JSON.stringify(r));
await page.keyboard.press('Escape');
await page.evaluate(() => document.activeElement && document.activeElement.blur());

console.log('\n== 6. Digits no longer arm drawing tools while tagging ==');
r = await page.evaluate(() => {
  window.app.canvas.currentTool = null;
  return { cur: window.app.tagger.currentPlayId };
});
await page.keyboard.press('3');
r = await page.evaluate(() => ({ tool: window.app.canvas.currentTool }));
ok(r.tool === null, 'digit with a play selected leaves drawing tool unarmed', JSON.stringify(r));
r = await page.evaluate(() => {
  // No play selected -> digits arm tools again (drawing mode preserved)
  window.app.tagger.currentPlayId = null;
  window.app.tagger._updateFormEnabled();
  return {};
});
await page.keyboard.press('3');
r = await page.evaluate(() => {
  const tool = window.app.canvas.currentTool;
  const form = document.getElementById('tagForm');
  const hint = document.getElementById('tagFormHint');
  return { tool, disabled: form.classList.contains('form-disabled'),
           hintShown: hint && !hint.classList.contains('hidden') };
});
ok(r.tool === 'circle', 'digit with NO play selected still arms the tool', JSON.stringify(r));
ok(r.disabled, 'form disabled while no play is selected');
ok(r.hintShown, 'mark-a-play hint visible while no play is selected');
await page.evaluate(() => { // restore
  window.app.canvas.currentTool = null;
  const t = window.app.tagger;
  t.selectPlay(t.plays[0].id);
});

console.log('\n== 7. Save & Next carries situation; Skip does not ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const a = t.plays[10], b = t.plays[11];
  // A: 1st & 10, gain of 4 -> next should be 2nd & 6
  a.tags.down = '1'; a.tags.distance = '10'; a.tags.result = 'Gain';
  a.tags.yardage = '4'; a.tags.unit = 'offense';
  a.tags.custom = []; // demo data may carry a '1st Down' custom tag
  b.tags.down = ''; b.tags.distance = '';
  t.autoDD = true;
  t.selectPlay(a.id);
  document.getElementById('btnTagSaveNext').click();
  const carried = { down: b.tags.down, dist: b.tags.distance, cur: t.currentPlayId, bId: b.id };
  // reset B, go back to A, use Skip instead
  b.tags.down = ''; b.tags.distance = '';
  t.selectPlay(a.id);
  document.getElementById('btnTagSkip').click();
  const skipped = { down: b.tags.down, dist: b.tags.distance, cur: t.currentPlayId };
  return { carried, skipped };
});
ok(r.carried.down === '2' && r.carried.dist === '6' && r.carried.cur === r.carried.bId,
   'Save & Next pre-filled 2nd & 6 on the next play', JSON.stringify(r.carried));
ok(r.skipped.down === '' && r.skipped.dist === '' && r.skipped.cur === r.carried.bId,
   'Skip advanced WITHOUT carrying the situation', JSON.stringify(r.skipped));

console.log('\n== 8. Penalty replays the down in Auto D&D ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const sit = t.computeNextSituation({ tags: {
    down: '2', distance: '7', result: 'Penalty', yardage: '5',
    unit: 'offense', fieldSide: 'own', yardLine: '40',
  }});
  const stillStops = t.computeNextSituation({ tags: {
    down: '2', distance: '7', result: 'Interception', yardage: '0', unit: 'offense',
  }});
  return { sit, stillStops };
});
ok(r.sit && r.sit.down === '2' && r.sit.distance === '7',
   'penalty pre-fills the SAME down & distance (replay)', JSON.stringify(r.sit));
ok(r.sit && r.sit.fieldSide === 'own' && r.sit.yardLine === 40,
   'penalty keeps the previous spot', JSON.stringify(r.sit));
ok(r.stillStops === null, 'possession-ending results still blank the next play');

console.log('\n== 9. markEnd feedback instead of silent no-op ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const before = t.plays.length;
  let toasted = '';
  const orig = t.toast;
  t.toast = (m) => { toasted = m; };
  // 9a. NO film loaded: marks guard with "load film first" (UX pass U4) —
  // never a silent no-op, never a bogus play.
  t.pendingStart = null;
  t.markEnd();
  const noFilm = { toasted, count: t.plays.length };
  // 9b/9c. Film "loaded" (the src attribute is what setSrc/loadUrl set and
  // unloadVideo removes): the ordering toasts fire as before.
  t.vc.videoElement.setAttribute('src', 'blob:test-stub');
  toasted = '';
  t.pendingStart = null;
  t.markEnd();
  const noStart = { toasted, count: t.plays.length };
  toasted = '';
  t.pendingStart = 99999; // way past the playhead
  t.markEnd();
  const badEnd = { toasted, count: t.plays.length };
  t.pendingStart = null;
  t.vc.videoElement.removeAttribute('src');
  t.toast = orig;
  return { before, noFilm, noStart, badEnd };
});
ok(r.noFilm.count === r.before && /load film/i.test(r.noFilm.toasted),
   'no film -> "load film first" guard toast, no bogus play', JSON.stringify(r.noFilm));
ok(r.noStart.count === r.before && /start/i.test(r.noStart.toasted),
   'no pending start -> toast, no bogus 0:00 play', JSON.stringify(r.noStart));
ok(r.badEnd.count === r.before && /after/i.test(r.badEnd.toasted),
   'end before start -> toast, no play', JSON.stringify(r.badEnd));

console.log('\n== 10. Rare-result expander ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  t.selectPlay(t.plays[0].id);
  const wrap = document.getElementById('tagResultRare');
  const btn = document.getElementById('tagResultMore');
  const hiddenAtRest = getComputedStyle(wrap).display === 'none';
  btn.click();
  const shownAfterClick = getComputedStyle(wrap).display !== 'none';
  const label = btn.textContent;
  btn.click(); // collapse again
  const collapsed = getComputedStyle(wrap).display === 'none';
  // loading a play with a rare result auto-opens the section
  const p = t.plays[1];
  const prevResult = p.tags.result;
  p.tags.result = 'Field Goal';
  t.selectPlay(p.id);
  const autoOpened = getComputedStyle(wrap).display !== 'none';
  p.tags.result = prevResult;
  return { hiddenAtRest, shownAfterClick, label, collapsed, autoOpened,
           options: wrap.querySelectorAll('.pick').length };
});
ok(r.hiddenAtRest, 'rare results hidden at rest');
ok(r.shownAfterClick && /Less/.test(r.label), 'More reveals the rare chips');
ok(r.collapsed, 'second click collapses again');
ok(r.autoOpened, 'loading a play with a rare result auto-opens the section');
ok(r.options === 6, 'all six rare results present', String(r.options));

console.log('\n== 11. Grid editor still offers every result value ==');
r = await page.evaluate(() => {
  // The grid reads options live from the form DOM; the wrapper span must not
  // hide the rare chips from it, and the More button must not leak in.
  const opts = [...document.querySelectorAll('#tagResult .pick')]
    .map(b => b.dataset.value).filter(Boolean);
  return { count: opts.length, hasFG: opts.includes('Field Goal'),
           hasMore: opts.includes(undefined) };
});
ok(r.count === 16, 'all 16 result values reachable', JSON.stringify(r));
ok(r.hasFG, 'rare value (Field Goal) included');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); errors.forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
