import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo } from './hub-setup.mjs';
/* Keyboard and charting workflows through the mounted native deck: empty-play
 * guard, Yards/Enter, Loss signing, drawing shortcuts, Skip vs Save & Next,
 * clip marks and the More results selector. Pure situation rules live in e2e-core. */
import puppeteer from './test-browser.mjs';
import { chartDeckControls } from './chart-deck-test.mjs';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const completion = { timeout: 15000 };

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = chartDeckControls(await browser.newPage());
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
await page.waitForFunction(() => window.app?.teamHubScreen && window.app?.nativeTagging
  && document.querySelector('[data-first-launch] input[name="school"]'), completion);
await setupTeamAndDemo(page);
await page.waitForSelector('.ws-game-row', completion);
await page.evaluate(() => document.querySelector('.ws-game-row')?.click());
await page.waitForFunction(() => {
  const button = document.getElementById('wsContinueCharting');
  return button && !button.disabled && button.getClientRects().length > 0;
}, completion);
await page.evaluate(() => document.getElementById('wsContinueCharting')?.click());
await page.waitForFunction(() => {
  const app = window.app, store = app?.storage?.seasonStore;
  return app?.workspace.currentRoute() === 'breakdown'
    && !!store?.data?.activeGameId && app.storage._loadedGameId === store.data.activeGameId
    && app.tagger.plays.length > 0 && !!document.querySelector('#wsBreakdown [data-native-tagging]');
}, completion);
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
await page.waitForFunction(({ aId, bId }) => {
  const t = window.app.tagger;
  return t.currentPlayId === bId && Math.abs(parseInt(t.getPlay(aId)?.tags.yardage, 10)) === 8
    && document.activeElement !== document.querySelector('[data-native-field="yardage"] input');
}, completion, r);
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

console.log('\n== 4. Explicit Loss overrides and re-signs yardage ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  t.selectPlay(t.plays[5].id);
  // What Chart shows: the open play's draft.
  const p = t.getCurrentPlay();
  // blank the result, then enter yardage like a coach would
  t.setTagValue('result', '');
  t.setTagValue('yardage', '7');
  // explicit result still wins: switch to Loss, yardage goes negative
  t.setTagValue('result', 'Loss');
  const afterLoss = { result: p.tags.result, yardage: p.tags.yardage };
  t.saveDraft();
  return { afterLoss };
});
ok(r.afterLoss.result === 'Loss' && r.afterLoss.yardage === '-7',
   'explicit Loss overrides and re-signs yardage', JSON.stringify(r.afterLoss));

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
  // Filled in on screen (the open play's draft); stored when the play is saved.
  const b = t.getCurrentPlay();
  return { down: b.tags.down, dist: b.tags.distance, cur: t.currentPlayId, bId: ids.bId };
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
  const b = t.getCurrentPlay();
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
      formationFamily: '', playType: '', runPass: '', result: '',
      defFront: '', coverage: '', blitz: '',
    };
    delete play.specialTeams;
  };
  clearMeaningful(b);
  clearMeaningful(c);
  clearMeaningful(d);
  a.tags.unit = 'offense';
  d.tags.unit = 'special';
  d.specialTeams = { version: 1, unit: 'punt' }; // genuinely charted: must not be overwritten
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
  return { id: play.id, stored: play.tags.unit, shown: window.app.nativeTagging.snapshot().unit, stUnit: play.specialTeams?.unit || '' };
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
   && unitCarryCharted.shown === 'special' && unitCarryCharted.stUnit === 'punt',
   'Save & Next preserves a genuinely charted next play with a different unit', JSON.stringify(unitCarryCharted));

console.log('\n== 9. markEnd feedback instead of silent no-op ==');
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const before = t.plays.length;
  let toasted = '';
  const orig = t.toast;
  t.toast = (m) => { toasted = m; };
  // Missing film must produce feedback without creating a play.
  t.pendingStart = null;
  t.markEnd();
  const noFilm = { toasted, count: t.plays.length };
  // A src attribute enables the mark-order guards without loading real film.
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
// The placeholder counts active rare results; each selected option is labeled.
await page.evaluate(() => { window.app.tagger.selectPlay(window.app.tagger.plays[0].id); });
r = await page.evaluate(() => {
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  const options = [...select.options].map(o => o.textContent);
  return { placeholder: select.options[0].textContent, rareCount: select.options.length - 1, options };
});
ok(r.rareCount === 8, 'all eight rare (overflow) results are present in the dropdown', JSON.stringify(r));

// Selecting a rare result (Field Goal) through the dropdown sets it, and the
// placeholder now discloses the count.
r = await page.evaluate(() => {
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  select.value = 'Field Goal';
  select.dispatchEvent(new Event('change', { bubbles: true }));
});
await page.waitForFunction(() => {
  const select = document.querySelector('[data-native-field="result"] .gi-tag-more-select');
  return (window.app.tagger.getCurrentPlay()?.tags.result || '').includes('Field Goal')
    && select?.options[0].textContent === 'More (1)'
    && [...select.options].find(o => o.value === 'Field Goal')?.textContent === 'Selected: Field Goal';
}, completion);
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
  // The grid reads the shared result vocabulary, not the deck DOM.
  const grid = window.app.playGrid, PG = grid.constructor;
  grid._optionCache = {};
  const opts = grid._options(PG.COLUMNS.find(c => c.key === 'result'));
  return { count: opts.length, hasFG: opts.includes('Field Goal') };
});
ok(r.count === 16, 'all 16 result values reachable', JSON.stringify(r));
ok(r.hasFG, 'rare value (Field Goal) included');

/* Missing tags.custom must not prevent the native add path or chip rendering. */
const beforeErrors = errors.length;
r = await page.evaluate(() => {
  const app = window.app, out = {};
  const play = { id: 9901, timestamp: { start: 0, end: 3 },
    tags: { unit: 'offense', down: '', players: {}, grades: {} }, notes: '', annotations: [] };
  app.tagger.plays = [play];
  app.tagger.currentPlayId = 9901;
  app.tagger.selectPlay(9901);
  out.addOk = app.nativeTagging.addCustomTag('Blitz Alert');
  out.custom = app.tagger.getCurrentPlay().tags.custom;
  return out;
});
await page.waitForFunction(() => {
  const chips = document.querySelectorAll('.gi-tag-custom button');
  return chips.length === 1 && chips[0].textContent.includes('Blitz Alert');
}, completion);
r.chips = await page.evaluate(() => document.querySelectorAll('.gi-tag-custom button').length);
ok(r.addOk && Array.isArray(r.custom) && r.custom.includes('Blitz Alert') && r.chips === 1 && errors.length === beforeErrors,
  'A play with no tags.custom survives BOTH the render and the native addCustomTag write path',
  JSON.stringify({ ...r, newErrors: errors.slice(beforeErrors) }));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (errors.length) { console.log('Console/page errors:'); errors.forEach(e => console.log('  ' + e)); }
else console.log('No console/page errors.');
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
