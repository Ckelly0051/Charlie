import puppeteer from 'puppeteer';
import path from 'node:path';

const browser = await puppeteer.launch({ headless: true });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });
await page.goto('http://127.0.0.1:4192/design-comps/home-context-v2a-2026-08/home.html', {
  waitUntil: 'networkidle0',
});

const metrics = await page.evaluate(() => ({
  pageWidth: document.documentElement.scrollWidth,
  viewportWidth: document.documentElement.clientWidth,
  pageHeight: document.documentElement.scrollHeight,
  viewportHeight: document.documentElement.clientHeight,
}));

if (metrics.pageWidth > metrics.viewportWidth || metrics.pageHeight > metrics.viewportHeight) {
  throw new Error(`Unexpected overflow: ${JSON.stringify(metrics)}`);
}

await page.screenshot({
  path: path.resolve('design-comps/home-context-v2a-2026-08/home-1440x900.png'),
});
await page.click('#seasonContext');
await page.screenshot({
  path: path.resolve('design-comps/home-context-v2a-2026-08/season-switcher-1440x900.png'),
});
await browser.close();
console.log(JSON.stringify(metrics));
