import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');
const reportPath = join(ROOT, 'sample-analytics-report.html');
const outDir = join(ROOT, 'tools');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
await page.setViewport({ width: 1200, height: 900, deviceScaleFactor: 2 });
await page.goto(`file://${reportPath}`, { waitUntil: 'networkidle0' });

// Full page screenshot
await page.screenshot({ path: join(outDir, 'report-full.png'), fullPage: true });
console.log('Wrote report-full.png (full page)');

// Section-by-section screenshots for readability
const sections = await page.$$('.stats-section');
let i = 0;
for (const section of sections) {
  i++;
  const name = `report-section-${String(i).padStart(2, '0')}.png`;
  await section.screenshot({ path: join(outDir, name) });
  console.log(`Wrote ${name}`);
}

// Also grab the dividers + first few sections as hero shots
await page.evaluate(() => window.scrollTo(0, 0));
await page.screenshot({ path: join(outDir, 'report-top.png'), clip: { x: 0, y: 0, width: 1200, height: 900 } });
console.log('Wrote report-top.png');

await browser.close();
console.log('Done.');
