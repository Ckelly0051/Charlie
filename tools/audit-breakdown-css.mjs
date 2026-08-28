import fs from 'node:fs';
import path from 'node:path';
import postcss from 'postcss';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

const ROOT = path.resolve(import.meta.dirname, '..');
const CSS_DIRS = ['css', 'design-system'];
const files = CSS_DIRS.flatMap(dir => fs.readdirSync(path.join(ROOT, dir))
  .filter(name => name.endsWith('.css'))
  .map(name => path.join(dir, name)));

const selectors = [];
for (const file of files) {
  const root = postcss.parse(fs.readFileSync(path.join(ROOT, file), 'utf8'), { from: file });
  root.walkRules(rule => {
    const media = [];
    for (let parent = rule.parent; parent; parent = parent.parent) {
      if (parent.type === 'atrule' && parent.name === 'media') media.push(parent.params);
    }
    for (const selector of postcss.list.comma(rule.selector)) {
      const probe = selector
        .replace(/::[-\w()]+/g, '')
        .replace(/:(?:hover|active|focus|focus-visible|focus-within|disabled|checked|fullscreen|-webkit-full-screen|placeholder-shown)\b/g, '');
      selectors.push({ file, line: rule.source.start.line, selector, probe, media });
    }
  });
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });

await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: 'CSS ownership audit', team: 'Mavericks', year: '2026' });
  const game = app.storage.seasonStore.activeGame();
  game.plays = [{
    id: 1, timestamp: { start: 0, end: 6 }, notes: '', analysis: null,
    tags: { unit: 'offense', down: '1', distance: '10', formation: 'Ace',
      runPass: 'Run', playType: 'Run Inside', result: 'Gain', yardage: '6',
      players: {}, grades: {}, custom: [] },
  }];
  app.tagger.plays = game.plays;
  app.tagger.nextId = 2;
  app.tagger._emit('plays-loaded');
  app.tagger.selectPlay(1);
  await app.workspaceShell.show('breakdown');
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
});

async function matches(mode) {
  if (mode === 'film-room') {
    await page.click('[data-bd-view="film-room"]');
    await page.waitForFunction(() => !document.querySelector('[data-breakdown-film-room-host]')?.hidden);
  }
  return page.evaluate(items => {
    const route = document.querySelector('[data-native-breakdown-route]');
    return items.map(item => {
      try {
        if (item.media.some(query => !matchMedia(query).matches)) return false;
        const nodes = [...document.querySelectorAll(item.probe)];
        return nodes.some(node => node === route || route?.contains(node));
      } catch {
        return false;
      }
    });
  }, selectors);
}

const chart = await matches('chart');
const filmRoom = await matches('film-room');
const byFile = new Map();
selectors.forEach((item, index) => {
  if (!chart[index] && !filmRoom[index]) return;
  const list = byFile.get(item.file) || [];
  list.push({ ...item, chart: chart[index], filmRoom: filmRoom[index] });
  byFile.set(item.file, list);
});

console.log('Breakdown live selector ownership at 1440x900');
for (const [file, rules] of [...byFile].sort(([a], [b]) => a.localeCompare(b))) {
  console.log(`\n${file} (${rules.length})`);
  for (const rule of rules) {
    const modes = rule.chart && rule.filmRoom ? 'both' : rule.chart ? 'chart' : 'film';
    console.log(`  ${String(rule.line).padStart(5)}  ${modes.padEnd(5)}  ${rule.selector}`);
  }
}

const utilitySelectors = new Set(['*', '*::before', '*::after', '[hidden]', '.hidden']);
const globalRules = [...byFile]
  .filter(([file]) => file.replaceAll('\\', '/') === 'css/styles.css')
  .flatMap(([, rules]) => rules);
const forbiddenGlobal = globalRules.filter(rule => !utilitySelectors.has(rule.selector));
if (forbiddenGlobal.length) {
  throw new Error(`Historical css/styles.css still reaches Breakdown: ${forbiddenGlobal.map(rule => rule.selector).join(', ')}`);
}
if (![...byFile.keys()].some(file => file.replaceAll('\\', '/') === 'css/media-foundation.css')) {
  throw new Error('Canonical css/media-foundation.css did not reach the live Breakdown route');
}
console.log('\nPASS: global styles.css reaches Breakdown through universal utilities only');

await browser.close();
