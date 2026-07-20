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
// E4: Formation lost Under Center/Pistol/Shotgun (moved to QB Alignment, a
// fixed non-customizable group) — 20 -> 17 default formation rows.
// E4-2: Formation also lost Empty (moved to Backfield, which already had its
// own Empty chip) — 17 -> 16.
ok(state.open && state.tabs === 3 && state.rows === 16, 'Team Settings opens all three tag-library categories', JSON.stringify(state));
ok(/Existing plays and analytics stay unchanged/.test(state.promise), 'Editor states the non-destructive visibility contract');

// E4: 'Shotgun' is no longer a Formation library value (moved to QB Alignment,
// fixed/non-customizable) — 'Wing-T' is the equivalent still-hideable example.
await page.evaluate(() => {
  window.app.tagger.plays = [{ id: 1, tags: { unit: 'offense', formation: 'Wing-T', backfield: '' } }];
  document.querySelector('.tag-library-row input[data-value="Wing-T"]').click();
});
state = await page.evaluate(() => ({
  enabled: window.app.customChips.library.group('formation').enabled.includes('Wing-T'),
  hidden: document.querySelector('#tagFormation .pick[data-value="Wing-T"]').classList.contains('library-hidden'),
  tag: window.app.tagger.plays[0].tags.formation,
}));
ok(!state.enabled && state.hidden, 'Hiding a default removes it from future charting choices');
ok(state.tag === 'Wing-T', 'Hiding a choice never rewrites historical play tags');

await page.click('[data-group="front"]');
await page.type('#tagLibraryAdd', 'Bear');
await page.click('.tag-library-add button[type="submit"]');
state = await page.evaluate(() => ({
  stored: window.app.customChips.library.group('front').custom.includes('Bear'),
  chip: !!document.querySelector('#tagDefFront .pick[data-value="Bear"]'),
  checked: document.querySelector('.tag-library-row input[data-value="Bear"]')?.checked,
}));
ok(state.stored && state.chip && state.checked, 'A custom Front is persisted, enabled, and immediately chartable', JSON.stringify(state));

await page.type('#tagLibraryAdd', 'Bear "Zero"');
await page.click('.tag-library-add button[type="submit"]');
state = await page.evaluate(() => {
  const value = 'Bear "Zero"';
  const input = [...document.querySelectorAll('#tagLibraryDialog input[data-value]')].find(item => item.dataset.value === value);
  const remove = [...document.querySelectorAll('#tagLibraryDialog [data-remove]')].find(item => item.dataset.remove === value);
  return {
    stored: window.app.customChips.library.group('front').custom.includes(value),
    input: !!input,
    remove: !!remove,
    aria: remove?.getAttribute('aria-label'),
    stray: !!input?.getAttribute('zero"'),
  };
});
ok(state.stored && state.input && state.remove && state.aria === 'Remove Bear "Zero"' && !state.stray, 'Quoted custom names remain exact inert DOM data', JSON.stringify(state));

for (const [group, value] of [['formation','Trey Open'], ['backfield','Ace Offset']]) {
  await page.click(`[data-group="${group}"]`);
  await page.type('#tagLibraryAdd', value);
  await page.click('.tag-library-add button[type="submit"]');
}
await page.click('[data-action="close"]');
state = await page.evaluate(() => {
  const play = { id: 77, timestamp: { start:0, end:5 }, tags: { unit:'offense', formation:'', backfield:'', defFront:'', players:{}, grades:{}, custom:[] } };
  window.app.tagger.plays = [play]; window.app.tagger.currentPlayId = 77; window.app.tagger._loadTagForm(play);
  document.querySelector('#tagFormation .pick[data-value="Trey Open"]').click();
  document.querySelector('#tagBackfield .pick[data-value="Ace Offset"]').click();
  document.querySelector('#tagDefFront .pick[data-value="Bear"]').click();
  return { tags:{...play.tags}, custom: Object.fromEntries(['formation','backfield','front'].map(key => [key, window.app.customChips.library.group(key).custom])) };
});
ok(state.tags.formation === 'Trey Open' && state.tags.backfield === 'Ace Offset' && state.tags.defFront === 'Bear', 'Custom Formation, Backfield, and Front write immediately through PlayTagger', JSON.stringify(state));

await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="defense"]').click());
state = await page.evaluate(() => ({ visible: getComputedStyle(document.querySelector('#tagDefFront .pick[data-value="Bear"]')).display !== 'none', value: window.app.tagger.getCurrentPlay().tags.defFront }));
ok(state.visible && state.value === 'Bear', 'Custom Front remains chartable as Our Defensive Call', JSON.stringify(state));
await page.evaluate(() => document.querySelector('#tagUnit .pick[data-value="offense"]').click());
state = await page.evaluate(() => ({ visible: getComputedStyle(document.querySelector('#tagDefFront .pick[data-value="Bear"]')).display !== 'none', value: window.app.tagger.getCurrentPlay().tags.defFront }));
ok(state.visible && state.value === 'Bear', 'Custom Front remains chartable in Defense Faced', JSON.stringify(state));

state = await page.evaluate(() => {
  localStorage.setItem('ffa_active_team_id', 'settings-other-team');
  window.app.customChips.reload();
  const absent = ['Trey Open','Ace Offset','Bear'].every(value => !document.querySelector(`.pick[data-value="${value}"]`));
  localStorage.setItem('ffa_active_team_id', 'settings-test');
  window.app.customChips.reload();
  const restored = ['Trey Open','Ace Offset','Bear'].every(value => !!document.querySelector(`.pick[data-value="${value}"]`));
  return { absent, restored };
});
ok(state.absent && state.restored, 'Switching teams isolates and restores each staff vocabulary', JSON.stringify(state));

await page.evaluate(() => window.app.tagLibrarySettings.open('front'));

await page.click('.tag-library-remove[data-remove="Bear"]');
await page.waitForFunction(() => !document.querySelector('.tag-library-row input[data-value="Bear"]'));
state = await page.evaluate(() => ({
  stored: window.app.customChips.library.group('front').custom.includes('Bear'),
  chip: !!document.querySelector('#tagDefFront .pick[data-value="Bear"]'),
}));
ok(!state.stored && !state.chip, 'Removing a custom choice updates both editor and charting UI');

await page.click('[data-action="restore"]');
state = await page.evaluate(() => ({
  wingT: window.app.customChips.library.group('formation').enabled.includes('Wing-T'),
  custom: Object.values(window.app.customChips.library.load().groups).some(group => group.custom.length),
}));
ok(state.wingT && !state.custom, 'Restore defaults reenables built-ins and clears custom choices');

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
