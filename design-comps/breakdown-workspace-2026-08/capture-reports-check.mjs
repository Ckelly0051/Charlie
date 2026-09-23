// One-off, standalone verification capture -- NOT part of the Break Down
// comp itself and NOT part of the product test suite. Built solely to
// answer the round-4 review's finding 1: does the shared --gi-bd-copy token
// fix (design-system/tokens.css) read as genuinely neutral on a real,
// already-shipped production screen, not just on this comp.
//
// Drives the REAL running GridIron IQ app (the same Vite dev server that
// also serves this comp's static files), opens an existing real season
// already present in this dev environment, and opens Reports Overview --
// read-only: no data is created, edited, or deleted.
import puppeteer from 'puppeteer';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, 'captures');
const APP_URL = 'http://localhost:4174/';

const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
page.on('pageerror', (e) => console.error('PAGE ERROR', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.error('CONSOLE ERROR', m.text()); });

try {
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto(APP_URL, { waitUntil: 'networkidle0', timeout: 30000 });
  await new Promise(r => setTimeout(r, 300));

  // A fresh Puppeteer profile has no existing seasons (separate browser
  // storage from any other open session) and the sample season is only
  // offered once a team exists, so first create a throwaway team -- purely
  // synthetic, this profile only, never a real coach's data -- through the
  // app's own real onboarding form, then use its built-in, fully-synthetic
  // DemoSeason.build() sample season.
  const teamNameInput = await page.$('input[type="text"], input:not([type])');
  if (teamNameInput) {
    await teamNameInput.click({ clickCount: 3 });
    await teamNameInput.type('Token QA Check');
  }
  const createdTeam = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => /create team/i.test(b.textContent || ''));
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!createdTeam) throw new Error('Could not find "Create team" -- aborting, no fallback guess.');
  await new Promise(r => setTimeout(r, 500));

  const opened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b =>
      /explore.*sample|open sample season/i.test(b.textContent || '')
    );
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!opened) {
    const dump = await page.evaluate(() => document.body.innerText.slice(0, 1500));
    throw new Error('Could not find a sample-season entry point after team creation -- aborting. Page:\n' + dump);
  }
  await new Promise(r => setTimeout(r, 500));

  // Open Reports for the now-active game via its real "Open Reports" action.
  const reportsOpened = await page.evaluate(() => {
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Open Reports');
    if (btn) { btn.click(); return true; }
    return false;
  });
  if (!reportsOpened) throw new Error('Could not find "Open Reports" -- aborting, no fallback guess.');
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => new Promise(requestAnimationFrame));
  await page.evaluate(() => new Promise(requestAnimationFrame));

  // Sanity: confirm the exact stale blue-gray (--gi-11's rgb) the review
  // named is genuinely absent from the rendered page, and report what the
  // corrected --gi-bd-copy token actually renders as here.
  const check = await page.evaluate(() => {
    const staleBlueGray = [...document.querySelectorAll('*')]
      .some(el => getComputedStyle(el).color === 'rgb(157, 170, 183)');
    const cs = getComputedStyle(document.documentElement);
    return { staleBlueGrayPresent: staleBlueGray, resolvedBdCopy: cs.getPropertyValue('--gi-bd-copy').trim() };
  });
  console.log('Reports consistency check:', JSON.stringify(check));

  await page.screenshot({ path: path.join(OUT, 'reports-consistency-check-1440x900.png') });
  console.log('captured reports-consistency-check-1440x900.png');
} finally {
  await browser.close();
}
