import puppeteer from 'puppeteer';
import { pathToFileURL } from 'node:url';
import path from 'node:path';

const root = path.resolve('design-comps/home-workspace-2026-08');
const browser = await puppeteer.launch({ headless: 'new' });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900, deviceScaleFactor: 1 });

for (const mode of ['program', 'scout']) {
  await page.goto(`${pathToFileURL(path.join(root, 'home.html')).href}?mode=${mode}`, { waitUntil: 'networkidle0' });
  await page.screenshot({ path: path.join(root, `home-${mode}-1440x900.png`), fullPage: true });
}

await browser.close();
