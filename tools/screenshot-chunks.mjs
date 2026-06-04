import puppeteer from 'puppeteer';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const browser = await puppeteer.launch({
  headless: true,
  args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-gpu']
});

const page = await browser.newPage();
await page.setViewport({ width: 1100, height: 800, deviceScaleFactor: 2 });
await page.goto(`file://${join(ROOT, 'sample-analytics-report.html')}`, { waitUntil: 'networkidle0' });

const totalHeight = await page.evaluate(() => document.body.scrollHeight);
const chunkH = 800;
const chunks = Math.ceil(totalHeight / chunkH);

for (let i = 0; i < chunks; i++) {
  await page.screenshot({
    path: join(__dirname, `chunk-${String(i + 1).padStart(2, '0')}.png`),
    clip: { x: 0, y: i * chunkH, width: 1100, height: Math.min(chunkH, totalHeight - i * chunkH) }
  });
  console.log(`chunk-${String(i + 1).padStart(2, '0')}.png`);
}

await browser.close();
console.log(`Done: ${chunks} chunks`);
