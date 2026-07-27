import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const url = new URL(APP_URL);
url.searchParams.set('giq_test_route', 'overlay');

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 120000 });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', error => errors.push(`PAGEERROR: ${error.message}`));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(url.href, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.__GIQ_NATIVE_TEST__?.service?.subscriberCount === 1);

console.log('\n== 1. Body-level host and explicit service injection ==');
let state = await page.evaluate(() => ({
  hostOnBody: document.getElementById('giNativeRoot')?.parentElement === document.body,
  hostMarked: document.getElementById('giNativeRoot')?.hasAttribute('data-gi-overlay-host'),
  subscribers: window.__GIQ_NATIVE_TEST__.service.subscriberCount,
  season: JSON.stringify(window.app?.storage?.seasonStore?.data || null),
}));
ok(state.hostOnBody && state.hostMarked, 'one native overlay owner is mounted directly on body', JSON.stringify(state));
ok(state.subscribers === 1, 'Preact root subscribes to its explicitly injected overlay service', JSON.stringify(state));
const seasonBefore = state.season;

console.log('\n== 2. Dialog focus, trap, Escape, scrim, and data no-op ==');
await page.click('[data-probe-dialog]');
await page.waitForSelector('.gi-overlay-dialog.is-top');
await sleep(50);
state = await page.evaluate(() => ({
  active: document.activeElement?.textContent?.trim(),
  appInert: !!document.getElementById('app')?.closest('[inert]'),
  nativeRouteInert: !!document.querySelector('.gi-native-routes')?.closest('[inert]'),
  modal: document.querySelector('.gi-overlay-dialog .gi-overlay-panel')?.getAttribute('aria-modal'),
}));
ok(state.active === 'Keep working', 'dialog focuses its declared default action', JSON.stringify(state));
ok(state.appInert && state.nativeRouteInert && state.modal === 'true', 'modal dialog makes legacy and native route content inert', JSON.stringify(state));
await page.focus('[data-overlay-action="continue"]');
await page.keyboard.press('Tab');
ok(await page.evaluate(() => document.activeElement?.dataset.overlayAction === 'cancel'), 'Tab wraps inside the topmost dialog');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-dialog'));
const escapeFocusRestored = await page.waitForFunction(
  () => document.activeElement?.hasAttribute('data-probe-dialog'),
  { timeout: 2000 },
).then(() => true).catch(() => false);
ok(escapeFocusRestored, 'Escape closes only the dialog and restores its invoker');
await page.click('[data-probe-dialog]');
await page.waitForSelector('[data-overlay-scrim]');
await page.evaluate(() => document.querySelector('[data-overlay-scrim]').dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await page.waitForFunction(() => !document.querySelector('.gi-overlay-dialog'));
await sleep(50);
ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-probe-dialog')), 'dismissible dialog scrim is Cancel and restores focus');
ok(await page.evaluate(expected => JSON.stringify(window.app?.storage?.seasonStore?.data || null) === expected, seasonBefore), 'dialog journeys do not mutate season data');

console.log('\n== 3. Sheet desktop/mobile behavior ==');
await page.click('[data-probe-sheet]');
await page.waitForSelector('.gi-overlay-sheet.is-top');
await sleep(50);
state = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('aria-label'), appInert: !!document.getElementById('app')?.closest('[inert]'), modal: document.querySelector('.gi-overlay-sheet .gi-overlay-panel')?.getAttribute('aria-modal') }));
ok(state.active === 'Practice note', 'sheet focuses the first working control, never its close button', JSON.stringify(state));
ok(!state.appInert && state.modal == null, 'desktop non-modal sheet leaves the route available', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-sheet'));
await sleep(50);
ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-probe-sheet')), 'sheet Escape restores its invoking control');

await page.setViewport({ width: 390, height: 844 });
await page.click('[data-probe-sheet]');
await page.waitForSelector('.gi-overlay-sheet.is-top');
await sleep(50);
state = await page.evaluate(() => {
  const panel = document.querySelector('.gi-overlay-sheet .gi-overlay-panel');
  const controls = [...panel.querySelectorAll('button,input')];
  return {
    appInert: !!document.getElementById('app')?.closest('[inert]'),
    nativeRouteInert: !!document.querySelector('.gi-native-routes')?.closest('[inert]'),
    modal: panel.getAttribute('aria-modal'),
    overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    minControl: Math.min(...controls.map(control => control.getBoundingClientRect().height)),
  };
});
ok(state.appInert && state.nativeRouteInert && state.modal === 'true', 'narrow sheet automatically becomes modal', JSON.stringify(state));
ok(!state.overflow && state.minControl >= 44, 'narrow overlay is overflow-free with touch-sized controls', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-sheet'));
await page.setViewport({ width: 1280, height: 800 });

console.log('\n== 4. Stacking and destructive confirmation rules ==');
await page.click('[data-probe-stack]');
await page.waitForSelector('[data-probe-open-confirm]');
await sleep(50);
await page.click('[data-probe-open-confirm]');
await page.waitForFunction(() => document.querySelectorAll('.gi-overlay-layer').length === 2);
await sleep(50);
state = await page.evaluate(() => ({
  lowerInert: document.querySelectorAll('.gi-overlay-layer')[0].inert,
  active: document.activeElement?.textContent?.trim(),
  count: window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length,
}));
ok(state.count === 2 && state.lowerInert, 'dialog may sit over a sheet and makes the sheet inert', JSON.stringify(state));
ok(state.active === 'Keep editing', 'destructive confirmation defaults focus to Cancel', JSON.stringify(state));
state = await page.evaluate(() => {
  const service = window.__GIQ_NATIVE_TEST__.service;
  const lower = service.snapshot().overlays[0];
  return { refused: service.close(lower.id, 'done') === false, count: service.snapshot().overlays.length, active: document.activeElement?.textContent?.trim() };
});
ok(state.refused && state.count === 2 && state.active === 'Keep editing', 'a buried overlay cannot close or steal focus from the top decision', JSON.stringify(state));
await page.evaluate(() => [...document.querySelectorAll('[data-overlay-scrim]')].at(-1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(50);
ok(await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length === 2), 'destructive confirmation ignores scrim clicks');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelectorAll('.gi-overlay-layer').length === 1);
const parentFocusRestored = await page.waitForFunction(() => document.activeElement?.hasAttribute('data-probe-open-confirm'), { timeout: 2000 }).then(() => true).catch(() => false);
ok(parentFocusRestored, 'closing stacked dialog returns focus inside its parent sheet');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));
await page.click('[data-probe-stack]');
await page.waitForSelector('[data-probe-open-confirm]');
await page.click('[data-probe-open-confirm]');
await page.waitForFunction(() => document.querySelectorAll('.gi-overlay-layer').length === 2);
await page.keyboard.press('Escape');
await page.keyboard.press('Escape');
const rapidEscapeClosed = await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'), { timeout: 2000 }).then(() => true).catch(() => false);
ok(rapidEscapeClosed, 'two rapid Escape presses close the current dialog then sheet without a stale-listener race');
state = await page.evaluate(() => {
  const isolated = window.__GIQ_NATIVE_TEST__.createService();
  const first = isolated.dialog({ title: 'First', actions: [{ key: 'cancel', label: 'Cancel' }] });
  let rejected = false;
  try { isolated.dialog({ title: 'Second' }); } catch { rejected = true; }
  first.close('cancel');
  const acknowledgment = isolated.dialog({ title: 'Notice' });
  const defaultAction = isolated.snapshot().overlays[0]?.actions[0];
  acknowledgment.close('ok');
  isolated.destroy();
  return { rejected, defaultAction };
});
ok(state.rejected, 'service rejects unrelated dialog-on-dialog stacking');
ok(state.defaultAction?.key === 'ok' && state.defaultAction?.default, 'dialog without supplied actions receives a focusable acknowledgement default', JSON.stringify(state));

console.log('\n== 5. Toast semantics ==');
await page.focus('[data-probe-toast]');
await page.click('[data-probe-toast]');
await page.waitForSelector('.gi-native-toast');
state = await page.evaluate(() => {
  const toast = document.querySelector('.gi-native-toast');
  return {
    focusStayed: document.activeElement?.hasAttribute('data-probe-toast'),
    role: toast.getAttribute('role'),
    live: toast.getAttribute('aria-live'),
    duration: Number(toast.dataset.expiresAt) - Number(toast.dataset.createdAt),
    text: toast.textContent,
  };
});
ok(state.focusStayed && state.role === 'status' && state.live === 'polite', 'toast announces politely without stealing focus', JSON.stringify(state));
ok(state.duration >= 4500 && /UNDO/.test(state.text), 'undo toast keeps at least the 4.5s action window visible', JSON.stringify(state));
await page.click('.gi-native-toast button');
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
ok(await page.evaluate(() => document.querySelector('[data-probe-outcome]')?.textContent === 'undo'), 'toast action executes once and dismisses');
await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.toast({ message: 'Save failed', tone: 'error' }));
await page.waitForSelector('.gi-native-toast.is-error');
state = await page.evaluate(() => { const toast=document.querySelector('.gi-native-toast'); return { role:toast.getAttribute('role'), live:toast.getAttribute('aria-live'), text:toast.textContent }; });
ok(state.role === 'alert' && state.live === 'assertive' && state.text.includes('SAVE FAILED'), 'failure toast uses an assertive semantic announcement', JSON.stringify(state));
await page.click('.gi-native-toast');
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
ok(true, 'toast surface itself remains click-to-dismiss');
console.log('\n== 6. Clean unmount and reinjection ==');
state = await page.evaluate(() => {
  const hook = window.__GIQ_NATIVE_TEST__;
  const oldService = hook.service;
  const nextService = hook.createService();
  hook.mount(nextService);
  return { oldSubscribers: oldService.subscriberCount };
});
await page.waitForFunction(() => window.__GIQ_NATIVE_TEST__.service.subscriberCount === 1);
state.nextSubscribers = await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.subscriberCount);
ok(state.oldSubscribers === 0 && state.nextSubscribers === 1, 'remount unsubscribes the old dependency and binds only the injected replacement', JSON.stringify(state));
await page.click('[data-probe-dialog]');
await page.waitForSelector('.gi-overlay-dialog');
state = await page.evaluate(() => ({ count: window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length }));
ok(state.count === 1, 'test route operates through the replacement service instance', JSON.stringify(state));
state = await page.evaluate(() => {
  const hook = window.__GIQ_NATIVE_TEST__;
  const service = hook.service;
  hook.unmount();
  return { subscribers: service.subscriberCount, children: document.getElementById('giNativeRoot').childElementCount, appInert: document.getElementById('app')?.inert };
});
await sleep(50);
state.appInert = await page.evaluate(() => document.getElementById('app')?.inert);
ok(state.subscribers === 0 && state.children === 0 && !state.appInert, 'unmount removes presentation, subscription, key/focus ownership, and route inertness', JSON.stringify(state));
ok(await page.evaluate(expected => JSON.stringify(window.app?.storage?.seasonStore?.data || null) === expected, seasonBefore), 'complete overlay journey leaves canonical season data byte-identical');
ok(errors.length === 0, 'overlay journey produces zero page/console errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
