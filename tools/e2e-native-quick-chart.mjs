/* S4-d native Quick Chart journey: one owner, keyboard parity, scoped writes,
   focus return, and responsive sheet behavior. */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.quickChart && document.querySelector('[data-native-team-hub]'));

const fixture = await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: '2026 Quick Chart', team: 'Mavericks', year: '2026' });
  const store = window.app.storage.seasonStore;
  const first = store.activeGame();
  first.gameInfo = { ...(first.gameInfo || {}), opponent: 'Alpha', perspective: 'offense' };
  first.plays = [{ id: 1, timestamp: { start: 0, end: 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '6', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [] } }];
  const other = store.addGame();
  other.gameInfo = { ...(other.gameInfo || {}), opponent: 'Untouched' };
  other.plays = [{ id: 9, timestamp: { start: 0, end: 4 }, notes: 'other game', tags: { unit: 'defense', defFront: '4-2-5', players: {}, grades: {}, custom: [] } }];
  store.setActive(first.id);
  await store.persist();
  await window.app.storage._loadActiveGame({ renderGames: false });
  window.app.tagger.selectPlay(1);
  await window.app.workspaceShell.show('breakdown');
  window.__qcUpdates = 0;
  window.app.tagger.on('play-updated', () => { window.__qcUpdates++; });
  return { otherId: other.id, otherBefore: JSON.stringify(other), activeId: first.id };
});

await page.click('[data-bd-context="quick"]');
await page.waitForFunction(() => document.activeElement?.matches('[data-native-quick-chart]'));
let state = await page.evaluate(() => {
  const surface = document.querySelector('[data-native-quick-chart]');
  return {
    active: window.app.quickChart.isActive,
    owner: surface?.closest('#giNativeRoot')?.id,
    overlay: window.app.overlays.snapshot().overlays.at(-1)?.id,
    legacy: !!document.getElementById('quickChartPanel'),
    routeInert: !!document.querySelector('.gi-native-routes')?.closest('[inert]'),
    focused: document.activeElement === surface,
  };
});
ok(state.active && state.owner === 'giNativeRoot' && state.overlay === 'quick-chart' && !state.legacy,
  'Quick Chart has one native owner and no legacy panel', JSON.stringify(state));
ok(!state.routeInert && state.focused, 'Desktop Quick Chart keeps film available and owns visible keyboard focus', JSON.stringify(state));
state = await page.evaluate(() => ({
  before: JSON.stringify(window.app.quickChart.currentEntry),
  hint: document.getElementById('qcKeyHints')?.textContent || '',
}));
await page.keyboard.press('KeyK');
const invalidKey = await page.evaluate(before => ({
  unchanged: JSON.stringify(window.app.quickChart.currentEntry) === before,
  type: document.getElementById('qcPlayType')?.textContent,
  status: document.getElementById('qcStatus')?.textContent,
}), state.before);
ok(!state.hint.includes('K Kick') && invalidKey.unchanged && invalidKey.type === '—'
  && invalidKey.status === 'Special Teams: use the full tag form.',
  'Quick Chart rejects ambiguous K with explicit Special Teams guidance and no data write', JSON.stringify({ state, invalidKey }));

await page.keyboard.press('KeyR');
await page.keyboard.press('KeyG');
await page.keyboard.press('Digit7');
await page.keyboard.down('Shift'); await page.keyboard.press('Digit2'); await page.keyboard.up('Shift');
state = await page.evaluate(() => ({
  type: document.getElementById('qcPlayType')?.textContent,
  result: document.getElementById('qcResult')?.textContent,
  yards: document.getElementById('qcYardage')?.textContent,
  down: document.getElementById('qcDown')?.textContent,
}));
ok(state.type === 'Run Inside' && state.result === 'Gain' && state.yards === '7' && state.down === '2nd',
  'Keyboard map renders the intended football entry before save', JSON.stringify(state));

// Quick Chart yardage accepted only two digits: a third keystroke silently
// dropped the first, so a 100-yard kick return charted as 00. The native form
// already accepts 0-109; this pins Quick Chart to the same range through real
// keystrokes, reading the value the coach actually sees. The upper bound is
// pinned too, so the widened field cannot take a value the form would reject.
const typeYards = async digits => {
  await page.evaluate(() => { window.app.quickChart.yardageStr = ''; window.app.quickChart._updateDisplay(); });
  await page.focus('[data-native-quick-chart]');
  for (const d of digits) await page.keyboard.press('Digit' + d);
  return page.evaluate(() => document.getElementById('qcYardage')?.textContent);
};
const yardageProbe = {
  hundred: await typeYards('100'),
  oneOhNine: await typeYards('109'),
  rejectsAbove: await typeYards('110'),
  twoDigit: await typeYards('47'),
};
ok(yardageProbe.hundred === '100' && yardageProbe.oneOhNine === '109',
  'Quick Chart retains a three-digit yardage through 109 instead of dropping the leading digit', JSON.stringify(yardageProbe));
ok(yardageProbe.rejectsAbove === '11' && yardageProbe.twoDigit === '47',
  'Quick Chart refuses a yardage beyond 109 and leaves ordinary two-digit entry unchanged', JSON.stringify(yardageProbe));
// restore the entry the save assertions below expect
await page.evaluate(() => { window.app.quickChart.yardageStr = '7'; window.app.quickChart.currentEntry.yardage = '7'; window.app.quickChart._updateDisplay(); });

await page.type('#qcBallCarrier', '22');
await page.focus('[data-native-quick-chart]');
await page.keyboard.press('Enter');
state = await page.evaluate(otherId => {
  const play = window.app.tagger.getCurrentPlay();
  const other = window.app.storage.seasonStore.data.games.find(game => String(game.id) === String(otherId));
  return { tags: play?.tags, updates: window.__qcUpdates, other: JSON.stringify(other), status: document.getElementById('qcStatus')?.textContent };
}, fixture.otherId);
ok(state.tags.playType === 'Run Inside' && state.tags.runPass === 'Run' && state.tags.result === 'Gain'
  && state.tags.yardage === '7' && state.tags.down === '2' && state.tags.players.ballCarrier === '22',
  'Save mutates the selected play with type, classifier, result, yardage, down, and player', JSON.stringify(state.tags));
ok(state.updates === 1 && state.other === fixture.otherBefore, 'Quick Chart emits one update and leaves every other game byte-identical', JSON.stringify(state));
ok(/All clips charted|Saved/.test(state.status || ''), 'Save reports an affirmative charting outcome', state.status);

await page.click('[data-overlay-id="quick-chart"] .gi-overlay-close');
await page.waitForFunction(() => !window.app.quickChart.isActive && !document.querySelector('[data-native-quick-chart]')
  && document.querySelector('[data-bd-context].active')?.dataset.bdContext === 'self'
  && document.activeElement?.dataset.bdContext === 'quick');
state = await page.evaluate(() => ({ context: document.querySelector('[data-bd-context].active')?.dataset.bdContext, focus: document.activeElement?.dataset.bdContext }));
ok(state.context === 'self' && state.focus === 'quick', 'Close restores the prior film context and invoking control', JSON.stringify(state));

await page.click('[data-bd-context="quick"]');
await page.waitForFunction(() => window.app.quickChart.isActive && document.querySelector('[data-native-quick-chart]'));
await page.evaluate(() => window.app.workspaceShell.show('home'));
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'home'
  && !window.app.quickChart.isActive && !document.querySelector('[data-native-quick-chart]'));
ok(true, 'Leaving Break Down closes Quick Chart instead of leaking it onto another route');
await page.evaluate(() => window.app.workspaceShell.show('breakdown'));

await page.setViewport({ width: 390, height: 844 });
await page.click('[data-bd-tools-toggle]');
await page.waitForFunction(() => document.querySelector('[data-bd-context="quick"]')?.getClientRects().length);
const mobileCommandIsTopmost = await page.evaluate(() => {
  const button = document.querySelector('[data-bd-context="quick"]');
  const box = button?.getBoundingClientRect();
  const hit = box && document.elementFromPoint(box.left + box.width / 2, box.top + box.height / 2);
  return !!button && (hit === button || hit?.closest('[data-bd-context="quick"]') === button);
});
ok(mobileCommandIsTopmost, 'Mobile More tools commands remain above the film hit target');
await page.click('[data-bd-context="quick"]');
await page.waitForFunction(() => document.activeElement?.matches('[data-native-quick-chart]'));
state = await page.evaluate(() => ({
  modal: document.querySelector('[data-overlay-id="quick-chart"] .gi-overlay-panel')?.getAttribute('aria-modal'),
  routeInert: !!document.querySelector('.gi-native-routes')?.closest('[inert]'),
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  small: [...document.querySelectorAll('[data-native-quick-chart] input, [data-overlay-id="quick-chart"] button')]
    .filter(element => element.getClientRects().length && element.getBoundingClientRect().height < 44)
    .map(element => element.id || element.getAttribute('aria-label') || element.textContent.trim()),
}));
ok(state.modal === 'true' && state.routeInert, 'Mobile Quick Chart becomes one modal keyboard workspace', JSON.stringify(state));
ok(!state.overflow && !state.small.length, 'Mobile Quick Chart has no page overflow and keeps controls touchable', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !window.app.quickChart.isActive && !document.querySelector('[data-native-quick-chart]'));
ok(errors.length === 0, 'No page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);