import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
/* E2E tagging-speed harness — drives the built bundle headless through the
   Phase A speed/correctness fixes: form guard when no play is selected,
   Enter-in-yardage advance, auto-Gain from positive yardage, Y hotkey,
   drawing-digit gate, real Skip vs Save & Next, penalty down-replay in
   Auto D&D, markEnd feedback, rare-result expander. Run after build:
     npm run build && node tools/e2e-tagging.mjs

   Final Engine Independence: .tag-section/#tagForm is deleted. The native
   tag form is mounted into a scratch host and driven the same way every
   other rewritten harness this checkpoint does: chip clicks/reads through
   [data-native-field], and a "form enabled" reading through the form's own
   .gi-native-tagging.is-disabled class (which the native form derives
   independently from tagger.getCurrentPlay(), not from the legacy
   _updateFormEnabled() DOM toggle, which is now a guarded no-op). The rare-
   result UI itself changed shape: the old expandable chip section is now a
   <select> "More results" dropdown (native-tagging.jsx's ResultField) — the
   dropdown's placeholder option text shows a "(N)" count when a rare result
   is active, replacing the old show/hide/auto-open behavior. */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
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

const mountNativeForm = () => page.evaluate(() => {
  let host = document.getElementById('taggingTestHost');
  if (!host) { host = document.createElement('div'); host.id = 'taggingTestHost'; document.body.append(host); }
  window.app.nativeTagging.mount(host);
});
// A direct property mutation (currentPlayId = null, bypassing selectPlay())
// doesn't emit an event NativeTaggingScreen listens for -- force a fresh
// render before reading the DOM, same as a real selectPlay()/toggleField()
// would trigger via _queuePublish().
const forcePublish = () => page.evaluate(() => window.app.nativeTagging._publish());
const formState = () => page.evaluate(() => {
  const el = document.querySelector('.gi-native-tagging');
  return { disabled: !!el && el.classList.contains('is-disabled'), headline: el?.querySelector('h2')?.textContent || '' };
});
const clickChip = (field, text) => page.evaluate((f, t) => {
  const btn = [...document.querySelectorAll(`[data-native-field="${f}"] .gi-tag-chips button`)]
    .find(b => b.textContent.trim() === t);
  if (btn) btn.click();
  return !!btn;
}, field, text);
const clickSaveNext = () => page.evaluate(() => {
  const btn = document.querySelector('.gi-tag-nav button.is-primary');
  if (btn) btn.click();
  return !!btn;
});
const clickSkip = () => page.evaluate(() => {
  const btn = [...document.querySelectorAll('.gi-tag-nav button')].find(b => b.textContent.trim() === 'Skip');
  if (btn) btn.click();
  return !!btn;
});

console.log('\n== 1. Setup: team + demo season + open game ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team/season setup lives in the library overlay, opened from the shell Home.
await setupTeamAndDemo(page);
await sleep(900);
// Open game 1 from the shell Home game list (the sole game-entry route).
// V2-A: no per-row Open button -- preview the row, then Continue charting.
await page.evaluate(() => document.querySelector('.ws-game-row')?.click());
await page.evaluate(() => document.getElementById('wsContinueCharting')?.click());
await sleep(700);
ok(await page.evaluate(() => window.app.workspace.currentRoute() === 'breakdown'),
  'setup: opening a game from Home genuinely lands in Break Down');
await mountNativeForm();

console.log('\n== 2. Form guard: enabled with a play, disabled without ==');
await page.evaluate(() => { window.app.tagger.selectPlay(window.app.tagger.plays[0].id); });
let r = { withPlay: await formState() };
ok(!r.withPlay.disabled, 'form enabled while a play is selected', JSON.stringify(r.withPlay));

console.log('\n== 3. Enter inside yardage saves & advances ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const a = t.plays[2], b = t.plays[3];
  t.selectPlay(a.id);
  return { aId: a.id, bId: b.id, aResult: a.tags.result };
});
await page.focus('[data-native-field="yardage"] input');
await page.evaluate(() => { document.querySelector('[data-native-field="yardage"] input').value = ''; });
await page.type('[data-native-field="yardage"] input', '8');
await page.keyboard.press('Enter');
await sleep(150);
r = await page.evaluate((prev) => {
  const t = window.app.tagger;
  const a = t.getPlay(prev.aId);
  return {
    cur: t.currentPlayId, expected: prev.bId,
    savedMag: Math.abs(parseInt(a.tags.yardage, 10)),
    blurred: document.activeElement !== document.querySelector('[data-native-field="yardage"] input'),
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
r = await page.evaluate(() => ({ focused: document.activeElement === document.querySelector('[data-native-field="yardage"] input') }));
ok(r.focused, 'Y focuses the yardage input', JSON.stringify(r));
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
await page.evaluate(() => {
  // No play selected -> digits arm tools again (drawing mode preserved)
  window.app.tagger.currentPlayId = null;
});
await forcePublish();
await page.keyboard.press('3');
r = await page.evaluate(() => ({ tool: window.app.canvas.currentTool }));
r.form = await formState();
ok(r.tool === 'circle', 'digit with NO play selected still arms the tool', JSON.stringify(r));
ok(r.form.disabled, 'form disabled while no play is selected', JSON.stringify(r.form));
ok(r.form.headline === 'Select play', 'headline prompts the coach to select a play', JSON.stringify(r.form));
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
  return { aId: a.id, bId: b.id };
});
await clickSaveNext();
let carried = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const b = t.getPlay(ids.bId);
  return { down: b.tags.down, dist: b.tags.distance, cur: t.currentPlayId, bId: b.id };
}, r);
// reset B, go back to A, use Skip instead
await page.evaluate((ids) => {
  const t = window.app.tagger;
  const b = t.getPlay(ids.bId);
  b.tags.down = ''; b.tags.distance = '';
  t.selectPlay(ids.aId);
}, r);
await clickSkip();
const skipped = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const b = t.getPlay(ids.bId);
  return { down: b.tags.down, dist: b.tags.distance, cur: t.currentPlayId };
}, r);
ok(carried.down === '2' && carried.dist === '6' && carried.cur === carried.bId,
   'Save & Next pre-filled 2nd & 6 on the next play', JSON.stringify(carried));
ok(skipped.down === '' && skipped.dist === '' && skipped.cur === carried.bId,
   'Skip advanced WITHOUT carrying the situation', JSON.stringify(skipped));
console.log('\n== 7b. Save & Next preserves the selected unit across seeded placeholders ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const [a, b, c, d] = t.plays.slice(10, 14);
  const originals = [a, b, c, d].map(play => ({
    tags: structuredClone(play.tags),
    specialTeams: play.specialTeams ? structuredClone(play.specialTeams) : null,
  }));
  const clearMeaningful = play => {
    play.tags = {
      ...play.tags,
      unit: 'special',
      formation: '', playType: '', runPass: '', result: '', stType: '',
      defFront: '', coverage: '', blitz: '',
    };
    delete play.specialTeams;
  };
  clearMeaningful(b);
  clearMeaningful(c);
  clearMeaningful(d);
  a.tags.unit = 'offense';
  d.tags.unit = 'special';
  d.tags.stType = 'Punt'; // genuinely charted: must not be overwritten
  t.autoDD = false;
  t.selectPlay(a.id);
  return { ids: [a.id, b.id, c.id, d.id], originals };
});
await clickSaveNext();
const unitCarryOne = await page.evaluate(() => {
  const play = window.app.tagger.getCurrentPlay();
  return { id: play.id, stored: play.tags.unit, shown: window.app.nativeTagging.snapshot().unit };
});
await clickSaveNext();
const unitCarryTwo = await page.evaluate(() => {
  const play = window.app.tagger.getCurrentPlay();
  return { id: play.id, stored: play.tags.unit, shown: window.app.nativeTagging.snapshot().unit };
});
await clickSaveNext();
const unitCarryCharted = await page.evaluate(() => {
  const play = window.app.tagger.getCurrentPlay();
  return { id: play.id, stored: play.tags.unit, shown: window.app.nativeTagging.snapshot().unit, stType: play.tags.stType };
});
await page.evaluate(({ ids, originals }) => {
  const t = window.app.tagger;
  ids.forEach((id, index) => {
    const play = t.getPlay(id);
    play.tags = originals[index].tags;
    if (originals[index].specialTeams) play.specialTeams = originals[index].specialTeams;
    else delete play.specialTeams;
  });
  t.autoDD = true;
  t.selectPlay(ids[0]);
}, r);
ok(unitCarryOne.id === r.ids[1] && unitCarryOne.stored === 'offense' && unitCarryOne.shown === 'offense'
   && unitCarryTwo.id === r.ids[2] && unitCarryTwo.stored === 'offense' && unitCarryTwo.shown === 'offense',
   'Save & Next keeps the coach-selected unit across untouched plays seeded as Special Teams', JSON.stringify({ unitCarryOne, unitCarryTwo }));
ok(unitCarryCharted.id === r.ids[3] && unitCarryCharted.stored === 'special'
   && unitCarryCharted.shown === 'special' && unitCarryCharted.stType === 'Punt',
   'Save & Next preserves a genuinely charted next play with a different unit', JSON.stringify(unitCarryCharted));

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

console.log('\n== 10. Rare-result "More" dropdown ==');
// The old expandable chip section is now a <select> (native-tagging.jsx's
// ResultField): RESULT_MORE options live inside it, and its own placeholder
// option's text shows "(N)" when N rare results are currently active on the
// play — the coach-visible replacement for the old expand/auto-open state.
await page.evaluate(() => { window.app.tagger.selectPlay(window.app.tagger.plays[0].id); });
r = await page.evaluate(() => {
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  const options = [...select.options].map(o => o.textContent);
  return { placeholder: select.options[0].textContent, rareCount: select.options.length - 1, options };
});
ok(r.placeholder === 'More', 'placeholder reads plain "More" while no rare result is active', JSON.stringify(r));
ok(r.rareCount === 8, 'all eight rare (overflow) results are present in the dropdown', JSON.stringify(r));

// Selecting a rare result (Field Goal) through the dropdown sets it, and the
// placeholder now discloses the count.
r = await page.evaluate(() => {
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  select.value = 'Field Goal';
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await sleep(50);
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  return {
    resultTag: t.getCurrentPlay()?.tags.result,
    placeholder: select.options[0].textContent,
    selectedOptionText: [...select.options].find(o => o.value === 'Field Goal')?.textContent,
  };
});
ok((r.resultTag || '').includes('Field Goal'), 'selecting a rare result through the dropdown tags the play', JSON.stringify(r));
ok(r.placeholder === 'More (1)', 'the placeholder discloses the active rare-result count', JSON.stringify(r));
ok(r.selectedOptionText === 'Selected: Field Goal', 'the active option is visibly marked Selected', JSON.stringify(r));

console.log('\n== 11. Grid editor still offers every result value ==');
r = await page.evaluate(() => {
  // Final Engine Independence: the grid reads Result's option list from the
  // same RESULT_OPTIONS constant native-tagging.jsx exports, not the DOM.
  const grid = window.app.playGrid, PG = grid.constructor;
  grid._optionCache = {};
  const opts = grid._options(PG.COLUMNS.find(c => c.key === 'result'));
  return { count: opts.length, hasFG: opts.includes('Field Goal') };
});
ok(r.count === 16, 'all 16 result values reachable', JSON.stringify(r));
ok(r.hasFG, 'rare value (Field Goal) included');

/* LEGACY/IMPORTED PLAY WITH NO tags.custom.
   SeasonStore._normalize did not backfill `custom`, so a play from an imported
   or pre-field season file arrives without it. Final Engine Independence: the
   coach-visible custom-tag add/remove path is now entirely owned by
   NativeTaggingScreen.addCustomTag/removeCustomTag (native-tagging.jsx's own
   .gi-tag-custom input), a genuinely separate, DOM-free implementation from
   PlayTagger's now-fully-dead .tag-section custom-tag machinery (tagChips/
   customTagInput/_renderCustomTags's write sink -- all deleted this
   checkpoint; their capability was never lost, only ever served by two
   parallel paths, and the native one is the one a coach can actually reach). */
const beforeErrors = errors.length;
r = await page.evaluate(() => {
  const app = window.app, out = {};
  const play = { id: 9901, timestamp: { start: 0, end: 3 },
    tags: { unit: 'offense', down: '', players: {}, grades: {} }, notes: '', annotations: [] };
  app.tagger.plays = [play];
  app.tagger.currentPlayId = 9901;
  app.tagger.selectPlay(9901);
  out.addOk = app.nativeTagging.addCustomTag('Blitz Alert');
  out.custom = app.tagger.plays[0].tags.custom;
  return out;
});
await new Promise(res => setTimeout(res, 120));
r.chips = await page.evaluate(() => document.querySelectorAll('.gi-tag-custom button').length);
ok(r.addOk && Array.isArray(r.custom) && r.custom.includes('Blitz Alert') && r.chips === 1 && errors.length === beforeErrors,
  'A play with no tags.custom survives BOTH the render and the native addCustomTag write path',
  JSON.stringify({ ...r, newErrors: errors.slice(beforeErrors) }));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); errors.forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
