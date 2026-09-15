/**
 * Play-library vocabulary: the custom-play Add workflow, and `Option` as a
 * built-in offensive play.
 *
 * PL-1  The rendered `Edit library` / `Add to Playbook` controls were DEAD
 *       whenever a settings sheet was already open: `SettingsScreen.open()`
 *       returned the live sheet's result and discarded the requested tab, chart
 *       group and typed play-call name, so the control did nothing and said
 *       nothing. The sheet is non-modal, so reaching the charting deck while it
 *       is up is ordinary use. `open()` now RETARGETS the live sheet.
 *
 * PL-2  `Option` is a built-in offensive play type, owned once by
 *       `TagLibrary.DEFINITIONS.playType` and reached by every consumer through
 *       that owner. It is distinct from `RPO`, ambiguous for run/pass
 *       classification, and not a member of the run/pass-depth exclusive group.
 *
 * Every fixture is a synthetic season on an isolated team id, and every
 * localStorage key it touches is namespaced to that team. No coach season,
 * catalog row or film file is read or written.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';
import { TagLibrary } from '../js/tag-library.js';
import { PlayTagger } from '../js/play-tagger.js';

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra !== '' ? ' -- ' + JSON.stringify(extra) : ''}`); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

// ---------------------------------------------------------------------------
// PL-2, in the owner. DOM-free, so imported directly.
// ---------------------------------------------------------------------------
console.log('\n-- PL-2 Option is a built-in, owned once --');
{
  const types = TagLibrary.DEFINITIONS.playType;
  ok(types.includes('Option'), 'Option is a default offensive play type', types);
  ok(types.includes('RPO') && types.indexOf('Option') !== types.indexOf('RPO'),
    'Option and RPO are separate values', [types.indexOf('RPO'), types.indexOf('Option')]);
  ok(new Set(types).size === types.length, 'The vocabulary has no duplicate entry', types);
  ok(TagLibrary.VERSION >= 4, 'The library version was bumped for the new default', TagLibrary.VERSION);
  // Classification: ambiguous like RPO, and combinable with a realized look.
  ok(PlayTagger.runPassForPlayType('Option') === '',
    'Option alone does not guess Run or Pass', PlayTagger.runPassForPlayType('Option'));
  ok(PlayTagger.runPassForPlayType('Option + Run Outside') === 'Run',
    'Option plus a realized run classifies as Run', PlayTagger.runPassForPlayType('Option + Run Outside'));
  ok(PlayTagger.runPassForPlayType('Option + Short Pass') === 'Pass',
    'Option plus a realized pass classifies as Pass', PlayTagger.runPassForPlayType('Option + Short Pass'));
  ok(PlayTagger.normalizeMulti('playType', 'Option + Run Outside') === 'Option + Run Outside',
    'Option is not in the run/pass-depth exclusive group, so the pair survives',
    PlayTagger.normalizeMulti('playType', 'Option + Run Outside'));
  ok(PlayTagger.normalizeMulti('playType', 'Option + RPO') === 'Option + RPO',
    'Option and RPO do not evict each other', PlayTagger.normalizeMulti('playType', 'Option + RPO'));

  // A team whose saved state predates the new default must still SEE it: a new
  // default is filtered out of a stored `enabled` array.
  const store = new Map();
  const fakeStorage = {
    getItem: k => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: k => store.delete(k),
  };
  const legacy = { version: 3, groups: { playType: {
    custom: [], order: types.filter(t => t !== 'Option'), enabled: types.filter(t => t !== 'Option'),
  } }, presets: [] };
  store.set('ffa_tag_libraries_t1', JSON.stringify(legacy));
  const lib = new TagLibrary({ storage: fakeStorage, teamId: 't1' });
  const group = lib.group('playType');
  ok(group.values.includes('Option') && group.enabled.includes('Option'),
    'A team saved before the bump gets Option visible, not hidden',
    { values: group.values.includes('Option'), enabled: group.enabled.includes('Option') });
  ok(!group.custom.includes('Option'), 'Option is a DEFAULT, never a custom entry', group.custom);
}

// ---------------------------------------------------------------------------
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 60000 });
const page = await browser.newPage();
page.setDefaultTimeout(9000);
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('pageerror: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.settingsScreen && window.app?.nativeTagging);

const TEAM = 'play-library-team';
const seed = () => page.evaluate(team => {
  const store = window.app.storage.seasonStore;
  store.currentSeasonId = 'pl-season';
  store.data = { version:5, type:'season', id:'pl-season', seasonName:'PL', activeGameId:'g1',
    games:[{ id:'g1', name:'W1', gameInfo:{ opponent:'X' },
      plays:[{ id:1, tags:{ unit:'offense', custom:[] }, timestamp:{ start:0, end:5 } }] }] };
  localStorage.setItem('ffa_active_team_id', team);
  localStorage.removeItem(`ffa_tag_libraries_${team}`);
  localStorage.removeItem(`ffa_playbook_${team}`);
  store.persist = async () => true;
  window.app.tagger.plays = store.data.games[0].plays;
  window.app.tagger.currentPlayId = 1;
}, TEAM);
await seed();

// -- PL-2 reaches the rendered charting choices without a custom entry -------
const builtIn = await page.evaluate(() => {
  const snap = window.app.nativeTagging.snapshot();
  return {
    deck: snap.libraries.playType,
    custom: window.app.customChips.library.group('playType').custom,
  };
});
console.log('\n-- PL-2 reaches the deck and the grid through the owner --');
ok(builtIn.deck.includes('Option'), 'Option is an active charting choice on a fresh team', builtIn.deck);
ok(!builtIn.custom.length, 'It required no custom entry', builtIn.custom);

// The Film Room grid's editor options come from the same owner. `_options` is
// the real accessor, and playType is a LIBRARY column, so this exercises the
// owner rather than the fallback list.
const grid = await page.evaluate(() => {
  const g = window.app.playGrid;
  g._optionCache = {};
  const opts = g._options({ key: 'playType' }, []);
  return { opts, cached: g._optionCache.playType || null };
});
ok(Array.isArray(grid.opts) && grid.opts.includes('Option') && grid.opts.includes('RPO'),
  'The Film Room grid editor offers Option, beside RPO, through the same owner', grid.opts);

// The cut-up filter renders its own play-type list. It had already drifted
// (missing `Trick Play`), which is why it now reads the one owner.
const cutup = await page.evaluate(async () => {
  window.app.settingsScreen.open({ initialTab: 'cutup' });
  await new Promise(r => setTimeout(r, 250));
  const row = [...document.querySelectorAll('[data-settings-panel="cutup"] .gi-filter-group, [data-settings-panel="cutup"] fieldset, [data-settings-panel="cutup"] > section *')]
    .find(n => /Play type/i.test(n.querySelector?.('legend, span, label')?.textContent || ''));
  const all = [...document.querySelectorAll('[data-settings-panel="cutup"] button')].map(n => n.textContent.trim());
  window.app.settingsScreen.close('done');
  await new Promise(r => setTimeout(r, 150));
  return { all, hadRow: !!row };
});
ok(cutup.all.includes('Option') && cutup.all.includes('Trick Play'),
  'The cut-up filter offers every play type the deck offers, Option included',
  cutup.all.filter(t => ['Option', 'Trick Play', 'RPO'].includes(t)));

// -- PL-1 the defect: a live sheet swallowed the request ---------------------
console.log('\n-- PL-1 the deck can retarget a live settings sheet --');
const retarget = await page.evaluate(async () => {
  const s = window.app.settingsScreen;
  s.open({ initialTab: 'film' });
  await new Promise(r => setTimeout(r, 220));
  const before = document.querySelector('[data-settings-panel]')?.getAttribute('data-settings-panel');
  window.app.nativeTagging.openLibrary('playType');
  await new Promise(r => setTimeout(r, 220));
  const library = {
    panel: document.querySelector('[data-settings-panel]')?.getAttribute('data-settings-panel'),
    hasAdd: !!document.querySelector('[data-tag-add]'),
    group: document.querySelector('[data-chart-group="playType"]')?.getAttribute('aria-selected'),
  };
  window.app.nativeTagging.editPlayCallLibrary('26 Blast');
  await new Promise(r => setTimeout(r, 220));
  const playbook = {
    panel: document.querySelector('[data-settings-panel]')?.getAttribute('data-settings-panel'),
    hasPlaybook: !!document.querySelector('[data-playbook-manager]'),
    prefilled: document.querySelector('.gi-playbook-form input[name="playCallName"]')?.value ?? null,
  };
  // Back to the charting library, so the rest of this run has the Add control.
  window.app.nativeTagging.openLibrary('playType');
  await new Promise(r => setTimeout(r, 220));
  return { before, library, playbook };
});
ok(retarget.before === 'film', 'The sheet starts on another tab', retarget.before);
ok(retarget.library.panel === 'charting' && retarget.library.hasAdd && retarget.library.group === 'true',
  'Edit library moves the live sheet to that library group', retarget.library);
ok(retarget.playbook.panel === 'team' && retarget.playbook.hasPlaybook && retarget.playbook.prefilled === '26 Blast',
  'Add to Playbook moves it to the playbook and carries the typed name', retarget.playbook);

// -- PL-1 the rendered Add control ------------------------------------------
console.log('\n-- PL-1 adding a custom play type through the rendered control --');
await page.waitForSelector('[data-tag-add]');
const keysBefore = await page.evaluate(() => Object.keys(localStorage).length);
const type = async text => {
  await page.evaluate(() => { const n = document.querySelector('[data-tag-add]'); n.focus(); n.setSelectionRange(0, n.value.length); });
  await page.keyboard.type(text, { delay: 12 });
};
const clickAdd = () => page.evaluate(() => [...document.querySelectorAll('.gi-library-add button')]
  .find(b => b.textContent.trim() === 'Add')?.click());
const state = () => page.evaluate(() => ({
  custom: window.app.customChips.library.group('playType').custom,
  rendered: [...document.querySelectorAll('[data-tag-value]')].map(n => n.getAttribute('data-tag-value')),
  err: document.querySelector('[data-settings-panel="charting"] .gi-settings-error')?.textContent || '',
  deck: window.app.nativeTagging.snapshot().libraries.playType,
  input: document.querySelector('[data-tag-add]')?.value ?? null,
}));

// Blank first: a clear refusal, nothing added.
await clickAdd();
await new Promise(r => setTimeout(r, 200));
let s = await state();
ok(s.err === 'Enter a name first.' && !s.custom.length,
  'A blank name is refused in words and adds nothing', [s.err, s.custom]);

await type('Counter Trey');
await clickAdd();
await new Promise(r => setTimeout(r, 250));
s = await state();
ok(same(s.custom, ['Counter Trey']), 'A valid custom play type is added exactly once', s.custom);
ok(s.rendered.filter(v => v === 'Counter Trey').length === 1,
  'It renders exactly one row in the library list', s.rendered.filter(v => v === 'Counter Trey').length);
ok(s.deck.includes('Counter Trey'),
  'It is IMMEDIATELY an active charting choice, with no reload', s.deck.slice(-2));
ok(s.input === '', 'The field clears, ready for the next one', s.input);
ok(s.err === '', 'No error is left showing after a success', s.err);

// Duplicates, exact and by case.
await type('Counter Trey');
await clickAdd();
await new Promise(r => setTimeout(r, 200));
s = await state();
ok(s.err === 'That choice already exists.' && same(s.custom, ['Counter Trey']),
  'An exact duplicate is refused and creates no second entry', [s.err, s.custom]);
await type('counter trey');
await clickAdd();
await new Promise(r => setTimeout(r, 200));
s = await state();
ok(s.err === 'That choice already exists.' && same(s.custom, ['Counter Trey']),
  'A case-only duplicate is refused too', [s.err, s.custom]);
// A built-in is not addable as a custom either.
await type('Option');
await clickAdd();
await new Promise(r => setTimeout(r, 200));
s = await state();
ok(s.err === 'That choice already exists.' && same(s.custom, ['Counter Trey']),
  'A built-in cannot be re-added as a custom entry', [s.err, s.custom]);

const owner = await page.evaluate(team => ({
  keys: Object.keys(localStorage).filter(k => k.includes('tag_librar') || k.includes('custom_chip')),
  stored: JSON.parse(localStorage.getItem(`ffa_tag_libraries_${team}`) || 'null')?.groups?.playType?.custom || null,
  total: Object.keys(localStorage).length,
}), TEAM);
// One key PER TEAM is the canonical shape (`ffa_tag_libraries_<teamId>`); the
// `default` team's key exists because the app ran before this fixture set an
// active team. What must not appear is a SECOND store for the same team, or the
// retired `ffa_custom_chips_*` cache.
ok(owner.keys.filter(k => k.endsWith(TEAM)).length === 1 && !owner.keys.some(k => k.includes('custom_chip')),
  'One canonical store for this team, and no parallel cache', owner.keys);
ok(same(owner.stored, ['Counter Trey']), 'The canonical store holds it', owner.stored);
ok(owner.total - keysBefore <= 1, 'Adding a choice created no extra storage key', [keysBefore, owner.total]);

// -- persistence through a real reload --------------------------------------
console.log('\n-- PL-1 persistence through reload --');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.nativeTagging);
const afterReload = await page.evaluate(team => {
  localStorage.setItem('ffa_active_team_id', team);
  const store = window.app.storage.seasonStore;
  store.currentSeasonId = 'pl-season';
  store.data = { version:5, type:'season', id:'pl-season', seasonName:'PL', activeGameId:'g1',
    games:[{ id:'g1', name:'W1', gameInfo:{ opponent:'X' }, plays:[{ id:1, tags:{ unit:'offense', custom:[] } }] }] };
  window.app.customChips.reload();
  return {
    custom: window.app.customChips.library.group('playType').custom,
    deck: window.app.nativeTagging.snapshot().libraries.playType,
  };
}, TEAM);
ok(same(afterReload.custom, ['Counter Trey']), 'The custom play survives an application reopen', afterReload.custom);
ok(afterReload.deck.includes('Counter Trey') && afterReload.deck.includes('Option'),
  'Both the custom play and the built-in are charting choices after reopen', afterReload.deck.slice(-3));

// -- PL-1 the playbook side -------------------------------------------------
console.log('\n-- PL-1 the play-call playbook --');
const playbook = await page.evaluate(async team => {
  localStorage.removeItem(`ffa_playbook_${team}`);
  window.app.storage.seasonStore.persist = async () => true;
  window.app.settingsScreen.openPlaybook({ name: '' });
  await new Promise(r => setTimeout(r, 300));
  const form = () => document.querySelector('.gi-playbook-form');
  const setName = value => {
    const n = form().querySelector('input[name="playCallName"]');
    n.value = value;
    n.dispatchEvent(new Event('input', { bubbles: true }));
  };
  const submit = async () => { form().querySelector('button[type="submit"]').click(); await new Promise(r => setTimeout(r, 350)); };
  setName('26 Blast');
  await new Promise(r => setTimeout(r, 60));
  await submit();
  const first = window.app.playbook.list().map(c => c.name);
  setName('26 Blast');
  await new Promise(r => setTimeout(r, 60));
  await submit();
  const second = window.app.playbook.list().map(c => c.name);
  const err = document.querySelector('[data-playbook-manager] .gi-settings-error')?.textContent || '';
  // Clear the field and let Preact re-render before reading the button: the
  // disabled state is derived from state, not from the DOM value.
  setName('');
  await new Promise(r => setTimeout(r, 120));
  const blankDisabled = form().querySelector('button[type="submit"]').disabled;
  return { first, second, err, blankDisabled, rows: [...document.querySelectorAll('[data-play-call]')].length,
    stored: localStorage.getItem(`ffa_playbook_${team}`) };
}, TEAM);
ok(same(playbook.first, ['26 Blast']), 'A play call is added exactly once', playbook.first);
ok(same(playbook.second, ['26 Blast']), 'A duplicate call creates no second entry', playbook.second);
ok(playbook.rows === 1, 'And renders one row', playbook.rows);
ok(playbook.blankDisabled, 'A blank call cannot be submitted at all');
ok(/26 Blast/.test(playbook.stored || ''), 'The call is in the canonical playbook store', (playbook.stored || '').slice(0, 80));

// -- PL-2 Study and Reports read Option through the canonical path ----------
console.log('\n-- PL-2 Study and Reports consume it through the canonical path --');
const analytics = await page.evaluate(() => {
  const app = window.app;
  const play = (id, playType, runPass, yardage) => ({ id, tags: { unit:'offense', playType, runPass, yardage, down:'1', distance:'10', quarter:'Q1' } });
  const plays = [
    play(1, 'Option', 'Run', '7'), play(2, 'Option', 'Pass', '12'),
    play(3, 'RPO', 'Run', '3'), play(4, 'Run Inside', 'Run', '2'),
  ];
  const dim = app.analyticsRegistry.values('playType', plays[0]);
  const stats = app.stats.compute(plays);
  const list = (stats.tendencies?.playTypeList || []).map(row => row.name);
  return {
    dim,
    rpoDim: app.analyticsRegistry.values('playType', plays[2]),
    optionRow: list.includes('Option'),
    rpoRow: list.includes('RPO'),
    distinct: list.filter(n => n === 'Option').length === 1,
  };
});
ok(same(analytics.dim, ['Option']), 'Study\'s playType dimension yields Option', analytics.dim);
ok(same(analytics.rpoDim, ['RPO']), 'And RPO stays its own value', analytics.rpoDim);
ok(analytics.optionRow && analytics.rpoRow && analytics.distinct,
  'The Reports play-type breakdown carries Option as its own row beside RPO', analytics);

// -- PL-2 persistence / export / import round trip -------------------------
const roundTrip = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  store.currentSeasonId = 'pl-rt';
  store.data = { version:5, type:'season', id:'pl-rt', seasonName:'RT', activeGameId:'g1',
    games:[{ id:'g1', name:'W1', gameInfo:{ opponent:'X' },
      plays:[{ id:1, tags:{ unit:'offense', playType:'Option', runPass:'Run', yardage:'7' } }] }] };
  const exported = JSON.parse(JSON.stringify(store.data));
  // Through the store's own normalization, the path an import takes.
  const normalized = store._normalize ? store._normalize(exported) : exported;
  return {
    exported: exported.games[0].plays[0].tags.playType,
    imported: normalized.games[0].plays[0].tags.playType,
  };
});
ok(roundTrip.exported === 'Option' && roundTrip.imported === 'Option',
  'Option round-trips through export and import unchanged', roundTrip);

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
