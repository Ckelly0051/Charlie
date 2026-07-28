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
await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Keep working');
state = await page.evaluate(() => ({
  active: document.activeElement?.textContent?.trim(),
  appInert: !!document.getElementById('app')?.closest('[inert]'),
  nativeRouteInert: !!document.querySelector('.gi-native-routes')?.closest('[inert]'),
  modal: document.querySelector('.gi-overlay-dialog .gi-overlay-panel')?.getAttribute('aria-modal'),
}));
ok(state.active === 'Keep working', 'dialog focuses its declared default action', JSON.stringify(state));
ok(state.appInert && state.nativeRouteInert && state.modal === 'true', 'modal dialog makes legacy and native route content inert', JSON.stringify(state));
state = await page.evaluate(async () => {
  const late = document.createElement('button');
  late.id = 'late-body-control';
  late.textContent = 'Late legacy control';
  document.body.appendChild(late);
  await new Promise(resolve => requestAnimationFrame(resolve));
  return { inert: late.inert, hidden: late.getAttribute('aria-hidden') };
});
ok(state.inert && state.hidden === 'true', 'body controls appended after modal open become inert immediately', JSON.stringify(state));
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
await page.waitForFunction(() => document.activeElement?.hasAttribute('data-probe-dialog'));
ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-probe-dialog')), 'dismissible dialog scrim is Cancel and restores focus');
await page.evaluate(() => document.getElementById('late-body-control')?.remove());
ok(await page.evaluate(expected => JSON.stringify(window.app?.storage?.seasonStore?.data || null) === expected, seasonBefore), 'dialog journeys do not mutate season data');

console.log('\n== 2a. Explicit form-owned actions ==');
await page.evaluate(() => {
  window.__emptyActionsHandle = window.__GIQ_NATIVE_TEST__.service.dialog({
    id: 'empty-actions-probe', title: 'Form owns submission', actions: [],
  });
});
await page.waitForSelector('[data-overlay-id="empty-actions-probe"]');
state = await page.evaluate(() => ({
  modelActions: window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.at(-1)?.actions.length,
  actionButtons: document.querySelectorAll('[data-overlay-id="empty-actions-probe"] [data-overlay-action]').length,
}));
ok(state.modelActions === 0 && state.actionButtons === 0, 'an explicit empty action list stays empty for a form-owned dialog', JSON.stringify(state));
await page.evaluate(() => window.__emptyActionsHandle.close('done'));
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="empty-actions-probe"]'));

console.log('\n== 2b. Focus fallback after an unavailable invoker ==');
await page.evaluate(() => {
  const stable = document.createElement('button');
  stable.id = 'focus-stable-probe';
  stable.setAttribute('data-focus-return-root', '');
  stable.textContent = 'Stable route focus';
  document.body.prepend(stable);
  const invoker = document.createElement('button');
  invoker.id = 'focus-dead-probe';
  invoker.textContent = 'Temporary invoker';
  document.body.append(invoker);
  invoker.focus();
  const handle = window.__GIQ_NATIVE_TEST__.service.dialog({
    title: 'Focus fallback', returnFocus: invoker,
    actions: [{ key: 'done', label: 'Done', default: true }],
  });
  window.__focusFallbackHandle = handle;
});
await page.waitForSelector('.gi-overlay-dialog');
await page.evaluate(() => {
  document.getElementById('focus-dead-probe').hidden = true;
  window.__focusFallbackHandle.close('done');
});
const stableFocusRestored = await page.waitForFunction(
  () => document.activeElement?.id === 'focus-stable-probe',
  { timeout: 2000 },
).then(() => true).catch(() => false);
const stableFocusState = await page.evaluate(() => { const stable=document.getElementById('focus-stable-probe'); const dead=document.getElementById('focus-dead-probe'); return { activeId:document.activeElement?.id, stableConnected:stable?.isConnected, stableRects:stable?.getClientRects().length, stableInert:!!stable?.closest('[inert]'), deadHidden:dead?.hidden, overlays:window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length }; });
ok(stableFocusRestored, 'focus falls back to a stable route landmark when the invoker remains hidden', JSON.stringify(stableFocusState));
await page.evaluate(() => {
  document.getElementById('focus-stable-probe')?.remove();
  document.getElementById('focus-dead-probe')?.remove();
  delete window.__focusFallbackHandle;
});

console.log('\n== 3. Sheet desktop/mobile behavior ==');
await page.click('[data-probe-sheet]');
await page.waitForSelector('.gi-overlay-sheet.is-top');
await page.waitForFunction(() => document.activeElement?.getAttribute('aria-label') === 'Practice note');
state = await page.evaluate(() => ({ active: document.activeElement?.getAttribute('aria-label'), appInert: !!document.getElementById('app')?.closest('[inert]'), modal: document.querySelector('.gi-overlay-sheet .gi-overlay-panel')?.getAttribute('aria-modal') }));
ok(state.active === 'Practice note', 'sheet focuses the first working control, never its close button', JSON.stringify(state));
ok(!state.appInert && state.modal == null, 'desktop non-modal sheet leaves the route available', JSON.stringify(state));
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-sheet'));
await page.waitForFunction(() => document.activeElement?.hasAttribute('data-probe-sheet'));
ok(await page.evaluate(() => document.activeElement?.hasAttribute('data-probe-sheet')), 'sheet Escape restores its invoking control');

await page.setViewport({ width: 390, height: 844 });
await page.click('[data-probe-sheet]');
await page.waitForSelector('.gi-overlay-sheet.is-top');
await page.waitForFunction(() => document.querySelector('.gi-overlay-sheet .gi-overlay-panel')?.getAttribute('aria-modal') === 'true'
  && !!document.getElementById('app')?.closest('[inert]')
  && !!document.querySelector('.gi-native-routes')?.closest('[inert]'));
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
await page.waitForFunction(() => document.activeElement?.textContent?.trim() === 'Keep editing');
state = await page.evaluate(() => ({
  lowerInert: document.querySelectorAll('.gi-overlay-layer')[0].inert,
  active: document.activeElement?.textContent?.trim(),
  count: window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length,
}));
ok(state.count === 2 && state.lowerInert, 'dialog may sit over a sheet and makes the sheet inert', JSON.stringify(state));
ok(state.active === 'Keep editing', 'destructive confirmation defaults focus to Cancel', JSON.stringify(state));
await page.evaluate(() => [...document.querySelectorAll('[data-overlay-scrim]')].at(-1).dispatchEvent(new MouseEvent('mousedown', { bubbles: true })));
await sleep(50);
ok(await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length === 2), 'destructive confirmation ignores scrim clicks');
await page.keyboard.press('Escape');
await page.waitForFunction(() => document.querySelectorAll('.gi-overlay-layer').length === 1);
const parentFocusRestored = await page.waitForFunction(() => document.activeElement?.hasAttribute('data-probe-open-confirm'), { timeout: 2000 }).then(() => true).catch(() => false);
ok(parentFocusRestored, 'closing stacked dialog returns focus inside its parent sheet');
await page.keyboard.press('Escape');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));

state = await page.evaluate(async () => {
  const isolated = window.__GIQ_NATIVE_TEST__.createService();
  const sheet = isolated.sheet({ title: 'Parent' });
  const dialog = isolated.dialog({ title: 'Child', destructive: true, parentId: sheet.id,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'delete', label: 'Delete', tone: 'destructive', default: true }] });
  const closed = sheet.close('route-closed');
  const [sheetResult, dialogResult] = await Promise.race([
    Promise.all([sheet.result, dialog.result]),
    new Promise(resolve => setTimeout(() => resolve(['timeout', 'timeout']), 120)),
  ]);
  isolated.destroy();
  return { closed, sheetResult, dialogResult };
});
ok(state.closed && state.sheetResult === 'route-closed' && state.dialogResult === 'parent-closed',
  'programmatically closing a buried parent settles it and every stacked child', JSON.stringify(state));
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
const acknowledgmentDefault = state.defaultAction;
state = await page.evaluate(() => {
  const isolated = window.__GIQ_NATIVE_TEST__.createService();
  let missingCancelRejected = false, unsafe = null;
  try { unsafe = isolated.dialog({ title: 'Unsafe', destructive: true, actions: [{ key: 'delete', label: 'Delete', tone: 'destructive', default: true }] }); }
  catch { missingCancelRejected = true; }
  unsafe?.close('cancel');
  const safe = isolated.dialog({ title: 'Safe', destructive: true,
    actions: [{ key: 'cancel', label: 'Cancel' }, { key: 'delete', label: 'Delete', tone: 'destructive', default: true }] });
  const active = isolated.snapshot().overlays[0];
  safe.close('cancel');
  isolated.destroy();
  return { missingCancelRejected, initial: active.initialAction, cancelDefault: active.actions.find(action => action.key === 'cancel')?.default, deleteDefault: active.actions.find(action => action.key === 'delete')?.default };
});
ok(state.missingCancelRejected && state.initial === 'cancel' && state.cancelDefault && !state.deleteDefault,
  'service enforces an explicit Cancel default for every destructive decision', JSON.stringify(state));
ok(acknowledgmentDefault?.key === 'ok' && acknowledgmentDefault?.default, 'dialog without supplied actions receives a focusable acknowledgement default', JSON.stringify(acknowledgmentDefault));

console.log('\n== 5. Toast semantics ==');
// A destroyed service used to leave its requestAnimationFrame focus retries
// alive. Under load they could wake during this toast and steal focus even
// though ToastStack itself never focuses anything.
await page.evaluate(() => {
  const stale = window.__GIQ_NATIVE_TEST__.createService();
  const unavailable = document.createElement('button');
  unavailable.hidden = true;
  document.body.append(unavailable);
  stale.dialog({ title: 'Stale focus owner', returnFocus: unavailable }).close('cancel');
  stale.destroy();
  unavailable.remove();
});
await page.waitForFunction(() => !document.querySelector('.gi-native-routes')?.closest('[inert]') && window.__GIQ_NATIVE_TEST__.service.snapshot().overlays.length === 0);
await page.focus('[data-probe-toast]');
await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.toast({ message: 'Test save complete', action: { label: 'Undo', fn: () => { document.querySelector('[data-probe-outcome]').textContent = 'undo'; } } }));
await page.waitForSelector('.gi-native-toast');
await page.evaluate(() => new Promise(resolve => {
  let frames = 10;
  const next = () => --frames ? requestAnimationFrame(next) : resolve();
  requestAnimationFrame(next);
}));
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
ok(state.duration >= 4500 && /Undo/.test(state.text), 'undo toast keeps at least the 4.5s action window visible', JSON.stringify(state));
await page.click('.gi-native-toast button');
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
ok(await page.evaluate(() => document.querySelector('[data-probe-outcome]')?.textContent === 'undo'), 'toast action executes once and dismisses');
await page.evaluate(() => window.__GIQ_NATIVE_TEST__.service.toast({ message: 'Save failed', tone: 'error' }));
await page.waitForSelector('.gi-native-toast.is-error');
state = await page.evaluate(() => { const toast=document.querySelector('.gi-native-toast'); return { role:toast.getAttribute('role'), live:toast.getAttribute('aria-live'), text:toast.textContent }; });
ok(state.role === 'alert' && state.live === 'assertive' && state.text.includes('Save failed'), 'failure toast uses an assertive semantic announcement', JSON.stringify(state));
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
