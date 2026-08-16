/**
 * Captures the six comps at a 1440x900 viewport.
 *
 * Writes two files per comp into captures/:
 *   <dir>-<screen>.png       full page (the whole treatment)
 *   <dir>-<screen>-fold.png  exactly 1440x900 (what the coach sees first)
 *
 * The fold capture is the one that answers "does this show more with less
 * scrolling"; the full-page capture is the one to judge the composition on.
 *
 *   node design-comps/visual-reset-2026-08/capture.mjs
 */
import puppeteer from 'puppeteer';
import { fileURLToPath, pathToFileURL } from 'node:url';
import path from 'node:path';
import fs from 'node:fs';

const here = path.dirname(fileURLToPath(import.meta.url));
const out = path.join(here, 'captures');
fs.mkdirSync(out, { recursive: true });

const COMPS = [
  ['premium-sports-ops', 'reports'],
  ['premium-sports-ops', 'breakdown'],
  ['broadcast-analytics', 'reports'],
  ['broadcast-analytics', 'breakdown'],
  ['tactical-workstation', 'reports'],
  ['tactical-workstation', 'breakdown'],
];

const browser = await puppeteer.launch({ args: ['--no-sandbox', '--force-device-scale-factor=1'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

const report = [];
for (const [dir, screen] of COMPS) {
  const file = path.join(here, dir, `${screen}.html`);
  await page.goto(pathToFileURL(file).href, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 250));

  // Geometry check — the validator covers color, not layout.
  const geo = await page.evaluate(() => {
    const de = document.documentElement;
    const overflowX = de.scrollWidth > window.innerWidth + 1;
    // any element whose right edge runs past the viewport
    const spill = [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.right > window.innerWidth + 1;
      })
      .slice(0, 6)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}`);
    // text that is clipped by its own box
    const clipped = [...document.querySelectorAll('body *')]
      .filter(el => {
        if (el.children.length) return false;
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && cs.textOverflow !== 'ellipsis') return false;
        return el.scrollWidth > el.clientWidth + 2 && cs.textOverflow !== 'ellipsis';
      })
      .slice(0, 6)
      .map(el => `${el.tagName.toLowerCase()}.${(el.className || '').toString().split(' ')[0]}: ${el.textContent.trim().slice(0, 28)}`);
    return { docH: de.scrollHeight, overflowX, spill, clipped };
  });
  report.push({ comp: `${dir}/${screen}`, ...geo });

  await page.screenshot({ path: path.join(out, `${dir}-${screen}.png`), fullPage: true });
  await page.screenshot({ path: path.join(out, `${dir}-${screen}-fold.png`), fullPage: false });
}

await browser.close();
console.table(report.map(r => ({
  comp: r.comp, height: r.docH, overflowX: r.overflowX,
  spill: r.spill.length, clipped: r.clipped.length,
})));
for (const r of report) {
  if (r.spill.length) console.log(`  SPILL   ${r.comp}: ${r.spill.join(' | ')}`);
  if (r.clipped.length) console.log(`  CLIPPED ${r.comp}: ${r.clipped.join(' | ')}`);
}
