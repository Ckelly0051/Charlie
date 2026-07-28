/* VISUAL GATE — captures ten distinct coach surfaces at every release viewport.
   This is intentionally a failing harness: route readiness, page overflow, and
   duplicate screenshot bytes all fail the run. The coach still owns visual
   approval; this script makes the evidence complete and auditable.

   Usage: node tools/shots.mjs <label> [outDir] */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';

const label = process.argv[2] || 'shots';
const outDir = path.resolve(process.argv[3] || '_shots');
const viewports = [
  { key:'1440x900', width:1440, height:900 },
  { key:'1280x720', width:1280, height:720 },
  { key:'768x1024', width:768, height:1024 },
  { key:'390x844', width:390, height:844 },
];
fs.mkdirSync(outDir, { recursive:true });
const browser = await puppeteer.launch({ args:['--no-sandbox'], protocolTimeout:180000 });
const page = await browser.newPage();
page.setDefaultTimeout(15000);
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(APP_URL, { waitUntil:'networkidle0' });
await page.waitForFunction(() => window.app?.workspaceShell && window.app?.library);

// Deterministic sample state, reached through the real onboarding controls.
await page.evaluate(() => {
  const input=document.getElementById('teamSetupName');
  if(input){ input.value='St. Joseph Mavericks'; input.dispatchEvent(new Event('input',{bubbles:true})); document.getElementById('btnTeamSetupSave')?.click(); }
});
await page.waitForSelector('#btnExploreDemo');
await page.evaluate(() => document.getElementById('btnExploreDemo')?.click());
await page.waitForFunction(() => (window.app.storage?.seasonStore?.data?.games?.length || 0) > 0);
await page.evaluate(async () => {
  const app=window.app, game=app.storage.seasonStore.data.games[0];
  await app.openGame(game.id);
  if(app.quickChart?.isActive) app.quickChart.toggle();
});

const settle = async () => {
  await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
  await new Promise(resolve => setTimeout(resolve, 120));
};
const visible = async selector => {
  await page.waitForFunction(sel => {
    const el=document.querySelector(sel); if(!el) return false;
    const r=el.getBoundingClientRect(), css=getComputedStyle(el);
    return !el.hidden && css.display!=='none' && css.visibility!=='hidden' && r.width>0 && r.height>0;
  }, {}, selector);
};
const route = async id => { await page.evaluate(async value => { await window.app.workspaceShell.show(value); }, id); await settle(); };
const hashes = new Map();
let count = 0;
const capture = async (viewport, name, selector) => {
  await visible(selector); await settle();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  if(overflow) throw new Error(`${viewport.key}/${name}: page-level horizontal overflow`);
  const buffer = await page.screenshot();
  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  if(hashes.has(hash)) throw new Error(`${viewport.key}/${name}: duplicates ${hashes.get(hash)}`);
  hashes.set(hash, `${viewport.key}/${name}`);
  const file = path.join(outDir, `${label}-${viewport.key}-${name}.png`);
  fs.writeFileSync(file, buffer); count++;
  console.log(`  ${path.basename(file)}`);
};

for(const viewport of viewports){
  await page.setViewport({ width:viewport.width, height:viewport.height });

  await route('home');
  await capture(viewport,'01-home','#wsHome:not([hidden])');

  await page.evaluate(async () => { const s=window.app.storage.seasonStore.data; await window.app.openGame(s.activeGameId || s.games[0].id); window.app.breakdownWorkspace._setView('chart'); });
  await capture(viewport,'02-breakdown-chart','#wsBreakdown:not([hidden]) .bd-route');

  await page.evaluate(() => window.app.breakdownWorkspace._setView('film-room'));
  await capture(viewport,'03-film-room','#wsBreakdown.bd-film-room-mode #playGridSection:not([hidden])');

  await page.evaluate(() => { window.app.breakdownWorkspace._setView('chart'); if(!window.app.quickChart.isActive) window.app.quickChart.toggle(); });
  await capture(viewport,'04-quick-chart','#quickChartPanel:not(.hidden)');
  await page.evaluate(() => { if(window.app.quickChart.isActive) window.app.quickChart.toggle(); });

  await route('study');
  await capture(viewport,'05-study','#wsStudy:not([hidden]) .ws-study-head');

  await route('reports');
  await page.click('[data-report-tab="overview"]');
  await capture(viewport,'06-reports-overview','#wsReports:not([hidden]) [data-native-reports]');

  await page.click('[data-report-tab="offense"]');
  await capture(viewport,'07-reports-offense','#wsReports:not([hidden]) [data-report-tab="offense"].active');

  await route('plan');
  await capture(viewport,'08-plan','#wsPlan:not([hidden]) .ws-plan-head');

  await page.evaluate(() => { window.app.settingsScreen._desktop=()=>true; window.app.settingsScreen.open(); });
  await capture(viewport,'09-settings-film','[data-overlay-id="team-film-settings"] [data-settings-panel="film"]');

  await page.click('[data-overlay-id="team-film-settings"] .gi-settings-tabs button:nth-child(2)');
  await capture(viewport,'10-settings-team','[data-overlay-id="team-film-settings"] [data-settings-panel="team"]');
  await page.evaluate(() => window.app.settingsScreen.close('done'));
  await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
}

if(errors.length) throw new Error(`page errors: ${errors.join(' | ')}`);
console.log(`${label}: ${count} distinct captures across ${viewports.length} viewports -> ${outDir}`);
await browser.close();