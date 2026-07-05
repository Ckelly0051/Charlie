/* VISUAL HARNESS — walks every major surface of the app and writes labeled
   screenshots for before/after design comparison. Not a pass/fail gate (the
   e2e suites own correctness) — this is the "look at it" discipline from the
   design refreshes, made permanent.

   Usage:
     node tools/shots.mjs <label> [outDir]
   Writes <outDir>/<label>-NN-<surface>.png (default outDir: ./_shots).
   Requires the bundle at ../football-film-analyzer.html (file://) — no server. */
import puppeteer from 'puppeteer';
import fs from 'fs';

const label = process.argv[2] || 'shots';
const outDir = process.argv[3] || new URL('../_shots/', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
fs.mkdirSync(outDir, { recursive: true });
const URL_ = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;

const b = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 180000 });
const page = await b.newPage();
await page.setViewport({ width: 1440, height: 900 });
page.on('dialog', async d => { try { await d.accept(); } catch (e) {} });
const sleep = ms => new Promise(r => setTimeout(r, ms));
let n = 0;
const shot = async name => {
  n++;
  await page.screenshot({ path: `${outDir}/${label}-${String(n).padStart(2, '0')}-${name}.png` });
  console.log(`  ${label}-${String(n).padStart(2, '0')}-${name}.png`);
};

await page.goto(URL_, { waitUntil: 'networkidle0' });
await sleep(800);
await shot('lobby-firstrun');

// Team setup → Team Home
await page.evaluate(() => { const i = document.getElementById('teamSetupName'); if (i) { i.value = 'St. Joseph Mavericks'; document.getElementById('btnTeamSetupSave')?.click(); } });
await sleep(900);
await shot('lobby-teamhome');

// Demo season → schedule
await page.evaluate(() => document.getElementById('btnExploreDemo')?.click());
await sleep(1500);
await shot('lobby-schedule');

// Open first game → workspace
await page.evaluate(() => { document.querySelector('.sch-row')?.click(); });
await sleep(1500);
await page.evaluate(() => { const t = window.app.tagger; const p = t.plays.find(x => (x.tags.formation || '').includes('+')) || t.plays[4]; if (p) t.selectPlay(p.id); });
await sleep(500);
await shot('workspace-main');

// Tag rail bottom (players / notes / diagram / situation)
await page.evaluate(() => { document.querySelector('.tag-section, .sidebar')?.scrollTo(0, 99999); });
await sleep(400);
await shot('workspace-rail-bottom');
await page.evaluate(() => { document.querySelector('.tag-section, .sidebar')?.scrollTo(0, 0); });

// Film Room grid
await page.evaluate(() => { document.getElementById('playGridSection')?.scrollIntoView({ block: 'start' }); });
await sleep(400);
await shot('filmroom-grid');
await page.evaluate(() => window.scrollTo(0, 0));

// Game modal (ng-modal) via the game header Edit
await page.evaluate(() => document.querySelector('.game-header-bar')?.click());
await sleep(600);
await shot('game-modal');
await page.keyboard.press('Escape');
await sleep(400);

// Settings drawer
await page.evaluate(() => document.getElementById('btnSidebarToggle')?.click());
await sleep(600);
await shot('drawer');
await page.keyboard.press('Escape');
await sleep(400);

// Stats dashboard (Game tab) — must remain the locked broadcast look
await page.evaluate(() => (document.getElementById('btnShowStats') || document.getElementById('btnStats'))?.click());
await sleep(1600);
await shot('stats-game');
await page.evaluate(() => window.app.stats.hideDashboard());
await sleep(300);

// Quick Chart strip
await page.evaluate(() => document.getElementById('btnQuickChart')?.click());
await sleep(600);
await shot('quickchart');
await page.keyboard.press('Escape');

console.log(`${label}: ${n} surfaces captured → ${outDir}`);
await b.close();
