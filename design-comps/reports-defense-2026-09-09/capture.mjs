import puppeteer from 'puppeteer';
import { mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(here, 'captures');
await mkdir(output, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});

const metrics = [];
for (const viewport of [{ width: 1440, height: 900 }, { width: 1280, height: 900 }]) {
  await page.setViewport(viewport);
  await page.goto(pathToFileURL(path.join(here, 'defense.html')).href, {
    waitUntil: 'networkidle0',
  });
  await page.evaluate(() => document.fonts.ready);
  for (let section = 1; section <= 4; section++) {
    await page.click(`[data-screen="d${section}"]`);
    await new Promise(resolve => setTimeout(resolve, 50));
    const state = await page.evaluate(() => {
      const board = document.querySelector('.board');
      const active = document.querySelector('.screen.on');
      return {
        active: active?.id,
        overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        overflowY: document.documentElement.scrollHeight - document.documentElement.clientHeight,
        boardBottom: Math.round(board?.getBoundingClientRect().bottom || 0),
        activeBottom: Math.round(active?.getBoundingClientRect().bottom || 0),
      };
    });
    metrics.push({ ...viewport, section, ...state });
    await page.screenshot({
      path: path.join(output, `${viewport.width}-section-${section}.png`),
      fullPage: false,
    });
  }
}

await browser.close();
console.log(JSON.stringify({ errors, metrics }, null, 2));
if (errors.length || metrics.some(item => item.active !== `d${item.section}` || item.overflowX > 0)) {
  process.exit(1);
}
