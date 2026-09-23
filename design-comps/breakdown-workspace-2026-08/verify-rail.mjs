import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import puppeteer from 'puppeteer';

const browser = await puppeteer.launch({ headless: true });
try {
  const page = await browser.newPage();
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.evaluate(() => new Promise(resolve =>
    requestAnimationFrame(() => requestAnimationFrame(resolve))));
  const state = () => page.evaluate(() => ({
    closeVisible: !!document.getElementById('playsClose').getClientRects().length,
    hintVisible: !!document.getElementById('railScrollHint').getClientRects().length,
    hint: document.getElementById('railScrollHint').textContent,
    scrim: document.getElementById('playsScrim').classList.contains('is-open'),
    focus: document.activeElement.id,
  }));
  const capture = name => page.screenshot({ path: fileURLToPath(new URL(`captures/${name}`, import.meta.url)) });
  await page.setViewport({ width: 1920, height: 1080 });
  await page.goto(new URL('breakdown.html', import.meta.url).href, { waitUntil: 'networkidle0' });
  await page.evaluate(() => {
    document.querySelector('.qa-harness').classList.add('is-hidden');
    return document.fonts.ready;
  });
  await settle();
  assert.equal((await state()).closeVisible, false, 'Docked rail has no close control');
  assert.equal((await state()).hintVisible, false, 'Fitting list has no scroll indicator');
  await capture('1920x1080-offense-chart.png');

  await page.setViewport({ width: 1280, height: 720 });
  await page.click('#playsToggle');
  await settle();
  assert.equal((await state()).closeVisible, true);
  assert.equal((await state()).hintVisible, true);
  assert.equal((await state()).hint, '\u2193', 'Top of overflowing list shows down');
  await capture('1280x720-plays-browser-open.png');
  await page.evaluate(() => { document.getElementById('railScroll').scrollTop = 50; });
  await settle();
  assert.equal((await state()).hint, '\u2195', 'Middle shows both directions');
  await page.evaluate(() => { document.getElementById('railScroll').scrollTop = 10000; });
  await settle();
  assert.equal((await state()).hint, '\u2191', 'Bottom stops indicating content below');
  await capture('1280x720-plays-browser-bottom.png');
  await page.keyboard.press('Escape');
  assert.equal((await state()).scrim, false);
  assert.equal((await state()).focus, 'playsToggle');

  await page.click('#playsToggle');
  await page.setViewport({ width: 1920, height: 1080 });
  await settle();
  assert.equal((await state()).scrim, false, 'Resizing to docked mode dismisses overlay');
  assert.equal((await state()).closeVisible, false);
  assert.equal((await state()).hintVisible, false);
  await page.setViewport({ width: 1280, height: 720 });
  await page.evaluate(() => render('sparse'));
  await page.click('#playsToggle');
  await settle();
  assert.equal((await state()).hintVisible, false, 'Empty list has no scroll indicator');
  assert.deepEqual(errors, []);
  console.log('Rail checks passed: docked/open, top/middle/bottom, Escape/focus, resize, empty state; zero page errors.');
} finally {
  await browser.close();
}
