/** Read-only review captures for the three remaining Reports tabs. */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const source = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json';
const out = 'artifacts/reports-canonical-review';
if (!existsSync(source)) throw new Error(`Canonical season missing: ${source}`);
const raw = readFileSync(source);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const games = season.games || [];
const plays = games.reduce((sum, game) => sum + (game.plays || []).length, 0);
if (season.id !== '2025-st-joseph-mavericks-jv' || games.length !== 6 || plays !== 449) {
  throw new Error(`Unexpected canonical cohort: ${season.id}, ${games.length} games, ${plays} plays`);
}
mkdirSync(out, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.evaluate(async data => {
  const app = window.app;
  const store = app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
  const game = store.data.games.find(row => /OL Lakes/.test(row.name)) || store.data.games[0];
  store.data.activeGameId = game.id;
  await app.storage._loadActiveGame();
  app.workspaceShell.show('reports');
}, season);

const pause = () => new Promise(resolve => setTimeout(resolve, 700));
const check = async label => {
  const result = await page.evaluate(() => {
    const pane = document.querySelector('.gi-report-pane');
    return { text: pane?.innerText.trim().length || 0,
      overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth };
  });
  if (result.text < 100 || result.overflow > 1 || errors.length) {
    throw new Error(`${label}: ${JSON.stringify({ ...result, errors })}`);
  }
};
const capture = async (name, width, height) => {
  await page.setViewport({ width, height });
  await pause();
  await check(name);
  const path = join(out, `${name}-${width}.png`);
  await page.screenshot({ path, fullPage: true });
  console.log(path);
};

try {
  for (const [width, height] of [[1440, 900], [1280, 800]]) {
    await page.setViewport({ width, height });
    await page.evaluate(() => window.app.reportsScreen.selectTab('offense'));
    await capture('offense', width, height);
    await page.evaluate(() => window.app.reportsScreen.selectTab('selfscout'));
    await pause();
    for (const [label, name] of [
      ['Offensive Summary', 'self-scout-summary'], ['Calls & Situations', 'self-scout-calls'],
      ['Structure', 'self-scout-structure'], ['Defense', 'self-scout-defense'],
      ['Tendencies', 'self-scout-tendencies'],
    ]) {
      await page.evaluate(text => [...document.querySelectorAll('.gi-selfscout-nav button')]
        .find(button => button.textContent.includes(text))?.click(), label);
      await capture(name, width, height);
    }

    await page.evaluate(() => window.app.reportsScreen.selectTab('season'));
    await pause();
    for (const [section, name] of [['overview', 'season-overview'], ['trends', 'season-trends']]) {
      await page.evaluate(id => document.querySelector(`.gi-season-nav [data-subtab="${id}"]`)?.click(), section);
      await capture(name, width, height);
    }

    await page.evaluate(() => window.app.reportsScreen.selectTab('matchup'));
    await pause();
    for (const [label, name] of [
      ['Our Offense vs Their Defense', 'matchup-our-offense'],
      ['Our Defense vs Their Offense', 'matchup-our-defense'],
    ]) {
      await page.evaluate(text => [...document.querySelectorAll('.gi-mu-tabs button')]
        .find(button => button.textContent.trim() === text)?.click(), label);
      await capture(name, width, height);
    }
  }
  const after = createHash('sha256').update(readFileSync(source)).digest('hex');
  if (before !== after) throw new Error('Canonical season changed during capture');
  console.log(`PASS: ${games.length} canonical games, ${plays} plays, no errors or page overflow, source unchanged`);
} finally {
  await browser.close();
}
