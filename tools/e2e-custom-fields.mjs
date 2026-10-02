/**
 * CUSTOM TAG FIELD EDITOR on the overlay service (rebuilt 2026-09-27 from a
 * hand-built dialog; GRIDIRON-IQ-OVERLAY-SPEC). Driven through the charting
 * deck's real "Edit custom fields" button: the sheet opens as a modal overlay,
 * Save stores the definitions and the deck shows them at once, Escape and
 * Cancel write nothing, a nameless row is dropped, focus returns to the button,
 * and a chip writes the play's value.
 * Run:  node tools/e2e-custom-fields.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log('  PASS  ' + label))
  : (fail++, console.log('  FAIL  ' + label + (detail ? ' -- ' + detail : '')));
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(() => setTimeout(r, 60)))));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => { if (!sessionStorage.getItem('seeded')) { localStorage.clear(); sessionStorage.setItem('seeded', '1'); } });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.teamHubScreen, { timeout: 15000 });

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'Fields', team: 'Mavs', year: '2026' });
  const g = app.storage.seasonStore.activeGame();
  g.plays = [{ id: 1, timestamp: { start: 0, end: 4 }, notes: '', annotations: [],
    tags: { unit: 'offense', down: '1', distance: '10', custom: [], players: {}, grades: {} } }];
  g.nextId = 2;
  app.tagger.plays = g.plays; app.tagger.nextId = 2; app.tagger._emit('plays-loaded');
  await app.storage.commitActive();
  await app.workspaceShell.show('breakdown');
  app.tagger.selectPlay(1);
});
await settle(page);

const editButton = async () => (await page.evaluateHandle(() =>
  [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Edit custom fields'))).asElement();
const open = async () => {
  // The button lives in the deck's "Notes & Details" group, folded by default.
  const folded = await page.evaluate(() => { const d = [...document.querySelectorAll('details.gi-tag-group')].find(g => g.querySelector('summary')?.textContent.includes('Notes & Details')); return d && !d.open; });
  if (folded) {
    const summary = (await page.evaluateHandle(() => [...document.querySelectorAll('details.gi-tag-group summary')].find(s => s.textContent.includes('Notes & Details')))).asElement();
    await summary.evaluate(s => s.scrollIntoView({ block: 'center' }));
    await summary.click(); await settle(page);
  }
  const btn = await editButton();
  // A toast from the previous save can sit over the button; activate it directly.
  await btn.evaluate(b => { b.scrollIntoView({ block: 'center' }); b.focus(); b.click(); });
  await page.waitForSelector('[data-overlay-id="custom-fields"] [data-custom-fields]', { timeout: 5000 });
  await settle(page);
};
const stored = () => page.evaluate(() => JSON.parse(localStorage.getItem('ffa_custom_fields') || '[]'));
const typeInto = async (selector, text) => { const el = await page.$(selector); await el.click({ clickCount: 3 }); await page.keyboard.type(text); };

console.log('\n== 1. The deck button opens a modal sheet on the overlay service ==');
ok(!!(await editButton()), 'the charting deck shows Edit custom fields');
await open();
let r = await page.evaluate(() => {
  const panel = document.querySelector('[data-overlay-id="custom-fields"]');
  const dialog = panel?.closest('[role="dialog"]') || panel?.querySelector('[role="dialog"]') || (panel?.getAttribute('role') === 'dialog' ? panel : null);
  return { panel: !!panel, dialog: !!dialog, modal: dialog?.getAttribute('aria-modal'), title: panel?.textContent.includes('Custom tag fields'),
    focusInside: !!panel?.contains(document.activeElement), legacy: !!document.getElementById('cfManagerModal') || !!document.querySelector('.ffa-confirm-modal'),
    empty: panel?.querySelector('.gi-custom-fields-empty')?.textContent.trim() };
});
ok(r.panel && r.dialog && r.modal === 'true' && r.title, 'a titled modal dialog opens', JSON.stringify(r));
ok(r.focusInside, 'focus moves into the sheet', JSON.stringify(r));
ok(!r.legacy, 'the old hand-built dialog is not created', JSON.stringify(r));
ok(r.empty === 'No custom fields.', 'an empty list says so literally', JSON.stringify(r));

console.log('\n== 2. Save stores the fields and the deck shows them at once ==');
await page.click('[data-custom-field-add]'); await settle(page);
await typeInto('[data-custom-field-row]:nth-of-type(1) [data-custom-field-name]', 'Pressure');
await typeInto('[data-custom-field-row]:nth-of-type(1) [data-custom-field-options]', 'Tempo Hot, Tempo Cold');
await page.click('[data-custom-field-add]'); await settle(page);
await typeInto('[data-custom-field-row]:nth-of-type(2) [data-custom-field-name]', 'Coach note');
await page.click('[data-custom-field-add]'); await settle(page); // left nameless: dropped on save
await page.click('[data-custom-fields-save]'); await settle(page); await settle(page);
const defs = await stored();
r = await page.evaluate(() => ({
  open: !!document.querySelector('[data-overlay-id="custom-fields"]'),
  focusOnButton: document.activeElement?.textContent.trim() === 'Edit custom fields',
  chips: [...document.querySelectorAll('button')].filter(b => ['Tempo Hot', 'Tempo Cold'].includes(b.textContent.trim())).length,
  noteInput: [...document.querySelectorAll('.gi-tag-input span')].some(s => s.textContent.trim() === 'Coach note'),
  toast: document.body.textContent.includes('Custom fields saved'),
}));
ok(defs.length === 2 && defs[0].name === 'Pressure' && defs[0].options.join('|') === 'Tempo Hot|Tempo Cold' && defs[1].name === 'Coach note' && defs[1].options.length === 0,
  'two fields are stored (chips and text); the nameless row is dropped', JSON.stringify(defs));
ok(!r.open && r.toast, 'the sheet closes and says Custom fields saved', JSON.stringify(r));
ok(r.chips === 2 && r.noteInput, 'the deck shows the new chips and text field without a reload', JSON.stringify(r));
ok(r.focusOnButton, 'focus returns to Edit custom fields', JSON.stringify(r));

console.log('\n== 3. Escape and Cancel write nothing ==');
await open();
await typeInto('[data-custom-field-row]:nth-of-type(1) [data-custom-field-name]', 'Changed');
await page.keyboard.press('Escape'); await settle(page);
ok(!(await page.$('[data-overlay-id="custom-fields"]')) && JSON.stringify(await stored()) === JSON.stringify(defs), 'Escape closes without saving');
await open();
await page.click('[data-custom-field-row]:nth-of-type(2) [data-custom-field-remove]'); await settle(page);
r = await page.evaluate(() => document.querySelectorAll('[data-custom-field-row]').length);
await page.click('[data-custom-fields-cancel]'); await settle(page);
ok(r === 1 && JSON.stringify(await stored()) === JSON.stringify(defs), 'Remove then Cancel leaves the stored fields unchanged', String(r));

console.log('\n== 4. Remove and Save; a chip writes the play value ==');
await open();
await page.click('[data-custom-field-row]:nth-of-type(2) [data-custom-field-remove]'); await settle(page);
await page.click('[data-custom-fields-save]'); await settle(page);
const after = await stored();
ok(after.length === 1 && after[0].id === defs[0].id, 'a removed field is gone after Save; the kept one keeps its id', JSON.stringify(after));
await page.evaluate(() => [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Tempo Cold')?.click()); await settle(page);
r = await page.evaluate(id => window.app.tagger.getPlay(1)?.tags?.customFields?.[id], defs[0].id);
ok(r === 'Tempo Cold', 'a custom chip writes the play value', String(r));

console.log('\n== 5. A failed write keeps the sheet and draft open and claims nothing (Codex, dc4328c) ==');
const before = await stored();
await page.evaluate(() => {
  const real = Storage.prototype.setItem;
  window.__restoreSetItem = () => { Storage.prototype.setItem = real; };
  Storage.prototype.setItem = function (k, v) { if (k === 'ffa_custom_fields') throw new DOMException('full', 'QuotaExceededError'); return real.call(this, k, v); };
});
await open();
await page.click('[data-custom-field-add]'); await settle(page);
await typeInto('[data-custom-field-row]:nth-of-type(2) [data-custom-field-name]', 'Unsaved field');
const toastsBefore = await page.evaluate(() => (document.body.textContent.match(/Custom fields saved/g) || []).length);
await page.click('[data-custom-fields-save]'); await settle(page);
r = await page.evaluate(() => ({
  open: !!document.querySelector('[data-overlay-id="custom-fields"] [data-custom-fields]'),
  error: document.querySelector('[data-custom-fields-error]')?.textContent.trim() || '',
  draft: [...document.querySelectorAll('[data-custom-field-name]')].map(i => i.value),
  toasts: (document.body.textContent.match(/Custom fields saved/g) || []).length,
  defs: window.app.customFields.defs.map(d => d.name),
}));
await page.evaluate(() => window.__restoreSetItem());
ok(r.open && /could not be saved/i.test(r.error) && r.draft.includes('Unsaved field'), 'the sheet stays open with the draft and a plain error', JSON.stringify(r));
ok(r.defs.join('|') === before.map(d => d.name).join('|') && JSON.stringify(await stored()) === JSON.stringify(before), 'the definitions in memory and in storage are unchanged', JSON.stringify(r.defs));
ok(r.toasts === toastsBefore, 'no success toast is shown for a failed save', JSON.stringify(r));
await page.click('[data-custom-fields-save]'); await settle(page);
ok(!(await page.$('[data-overlay-id="custom-fields"]')) && (await stored()).some(d => d.name === 'Unsaved field'), 'once storage works, Save from the same draft succeeds');

ok(errors.length === 0, 'no page or console errors', errors.slice(0, 3).join(' | '));
await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
