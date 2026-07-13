import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (value, label, extra = '') => value ? (pass++, console.log(`  PASS  ${label}`)) : (fail++, console.log(`  FAIL  ${label}${extra ? ` -- ${extra}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.setViewport({ width: 1280, height: 800 });
await page.evaluateOnNewDocument(() => {
  localStorage.clear();
  localStorage.setItem('ffa_active_team_id', 'settings-test');
});
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.evaluate(() => { window.app.tagger._confirmDialog = async () => true; });

await page.click('#btnSidebarToggle');
await page.evaluate(() => {
  document.querySelector('[data-toggle="tagLibrariesPanel"]').click();
  document.querySelector('#btnTagLibraries').click();
});
let state = await page.evaluate(() => ({
  open: document.querySelector('#tagLibraryDialog').open,
  tabs: document.querySelectorAll('#tagLibraryDialog [role="tab"]').length,
  rows: document.querySelectorAll('#tagLibraryDialog .tag-library-row').length,
  promise: document.querySelector('.tag-library-promise').textContent,
}));
ok(state.open && state.tabs === 3 && state.rows === 17, 'Team Settings opens all three tag-library categories', JSON.stringify(state));
ok(/Existing plays and analytics stay unchanged/.test(state.promise), 'Editor states the non-destructive visibility contract');

await page.evaluate(() => {
  window.app.tagger.plays = [{ id: 1, tags: { unit: 'offense', formation: 'Shotgun', backfield: '' } }];
  document.querySelector('.tag-library-row input[data-value="Shotgun"]').click();
});
state = await page.evaluate(() => ({
  enabled: window.app.customChips.library.group('formation').enabled.includes('Shotgun'),
  hidden: document.querySelector('#tagFormation .pick[data-value="Shotgun"]').classList.contains('library-hidden'),
  tag: window.app.tagger.plays[0].tags.formation,
}));
ok(!state.enabled && state.hidden, 'Hiding a default removes it from future charting choices');
ok(state.tag === 'Shotgun', 'Hiding a choice never rewrites historical play tags');

await page.click('[data-group="front"]');
await page.type('#tagLibraryAdd', 'Bear');
await page.click('.tag-library-add button[type="submit"]');
state = await page.evaluate(() => ({
  stored: window.app.customChips.library.group('front').custom.includes('Bear'),
  chip: !!document.querySelector('#tagDefFront .pick[data-value="Bear"]'),
  checked: document.querySelector('.tag-library-row input[data-value="Bear"]')?.checked,
}));
ok(state.stored && state.chip && state.checked, 'A custom Front is persisted, enabled, and immediately chartable', JSON.stringify(state));

await page.click('.tag-library-remove[data-remove="Bear"]');
await page.waitForFunction(() => !document.querySelector('.tag-library-row input[data-value="Bear"]'));
state = await page.evaluate(() => ({
  stored: window.app.customChips.library.group('front').custom.includes('Bear'),
  chip: !!document.querySelector('#tagDefFront .pick[data-value="Bear"]'),
}));
ok(!state.stored && !state.chip, 'Removing a custom choice updates both editor and charting UI');

await page.click('[data-action="restore"]');
state = await page.evaluate(() => ({
  shotgun: window.app.customChips.library.group('formation').enabled.includes('Shotgun'),
  custom: Object.values(window.app.customChips.library.load().groups).some(group => group.custom.length),
}));
ok(state.shotgun && !state.custom, 'Restore defaults reenables built-ins and clears custom choices');

await page.setViewport({ width: 390, height: 844 });
state = await page.evaluate(() => ({
  pageOverflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  dialogOverflow: document.querySelector('#tagLibraryDialog').scrollWidth > document.querySelector('#tagLibraryDialog').clientWidth,
  shortest: Math.min(...[...document.querySelectorAll('#tagLibraryDialog [role="tab"], #tagLibraryDialog .tag-library-row')].map(el => el.getBoundingClientRect().height)),
}));
ok(!state.pageOverflow && !state.dialogOverflow && state.shortest >= 44, 'Mobile editor is overflow-free with touch-sized rows', JSON.stringify(state));

await page.keyboard.press('Escape');
ok(!(await page.$eval('#tagLibraryDialog', el => el.open)), 'Escape closes the settings dialog');
ok(errors.length === 0, 'No page errors', errors.join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
