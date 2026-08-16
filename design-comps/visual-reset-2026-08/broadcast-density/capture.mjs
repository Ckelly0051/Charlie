// Renders the two Broadcast-density comps at 1440x900 and asserts geometry:
// no page-level horizontal overflow, nothing spilling past the viewport, no text
// clipped by its own box. Writes a -fold.png (exactly 1440x900) per comp plus a
// full-page capture for Reports so total height is verifiable.
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { mkdirSync } from 'node:fs';

const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, 'captures');
mkdirSync(out, { recursive: true });

const COMPS = [
  { name: 'breakdown', full: false },
  { name: 'reports', full: true },
];

const browser = await puppeteer.launch({ args: ['--allow-file-access-from-files'] });
let bad = 0;

for (const comp of COMPS) {
  const page = await browser.newPage();
  await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
  await page.goto('file://' + join(here, comp.name + '.html').replace(/\\/g, '/'),
    { waitUntil: 'networkidle0' });

  const report = await page.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const overflowX = document.documentElement.scrollWidth > vw + 1;
    const spill = [];
    const clipped = [];
    for (const el of document.querySelectorAll('*')) {
      const r = el.getBoundingClientRect();
      if (r.width === 0 && r.height === 0) continue;
      if (r.right > vw + 1) spill.push(el.tagName + '.' + (el.className || '') + ' right=' + Math.round(r.right));
      // text clipped by its own box (single-line elements only)
      if (el.children.length === 0 && el.textContent.trim()) {
        const cs = getComputedStyle(el);
        if (cs.overflow === 'visible' && el.scrollWidth > el.clientWidth + 1 && cs.textOverflow !== 'ellipsis') {
          clipped.push((el.className || el.tagName) + ' "' + el.textContent.trim().slice(0, 28) + '"');
        }
      }
    }
    return {
      overflowX, spill: spill.slice(0, 6), clipped: clipped.slice(0, 6),
      pageHeight: document.documentElement.scrollHeight,
    };
  });

  const fails = [];
  if (report.overflowX) fails.push('page scrolls horizontally');
  if (report.spill.length) fails.push('spill past viewport: ' + report.spill.join(' | '));
  if (report.clipped.length) fails.push('text clipped: ' + report.clipped.join(' | '));

  console.log(`${comp.name.padEnd(10)} height=${String(report.pageHeight).padStart(5)}px  ` +
    (fails.length ? 'FAIL — ' + fails.join('; ') : 'clean'));
  if (fails.length) bad++;

  await page.screenshot({ path: join(out, comp.name + '-fold.png') });
  if (comp.full) await page.screenshot({ path: join(out, comp.name + '-full.png'), fullPage: true });
  await page.close();
}

await browser.close();
console.log(bad ? `\n${bad} comp(s) with geometry failures` : '\nboth clean');
process.exit(bad ? 1 : 0);
