/* REAL-DATA E2E — drives the built app against the coach's actual saved seasons
   (the Documents mirror). Fresh page per game (no state accumulation); each view
   driven under its own timeout so a hang/slow render is localized to an exact
   game+view instead of wedging the whole run. Also re-checks the data AFTER
   normalize to confirm the self-healing strip fired.

   Usage:  node tools/e2e-realdata.mjs */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const MIRROR = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons';
const files = fs.existsSync(MIRROR)
  ? fs.readdirSync(MIRROR).map(d => path.join(MIRROR, d, 'season.json')).filter(f => fs.existsSync(f)) : [];
if (!files.length) { console.log('No season.json at', MIRROR); process.exit(0); }

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
const OUR = ['Maverick', 'Eagle', 'Falcon', 'Jumbo Shift'];
const VIEW_MS = 20000;

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 60000 });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
let dialogs = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + (e.message || e)));
page.on('console', m => { if (m.type() === 'error') errors.push('CONSOLE: ' + m.text()); });
// Auto-dismiss native dialogs (alert/confirm) so they don't wedge headless — and
// record them: a recorded dialog on a "hung" view means the cause is a BLOCKING
// alert, not an infinite loop.
page.on('dialog', async d => { dialogs.push(d.message()); try { await d.dismiss(); } catch (e) {} });

const race = (fn, ...a) => Promise.race([
  page.evaluate(fn, ...a),
  new Promise((_, rej) => setTimeout(() => rej(new Error('TIMEOUT')), VIEW_MS)),
]);

const seedFn = (season, OUR) => {
  const split = s => String(s || '').split('+').map(x => x.trim()).filter(Boolean);
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(season)));
  store.currentSeasonId = season.id || 'realdata';
  store.data.id = season.id || 'realdata';
  window.app.roster.players = season.roster || window.app.roster.players;
  let stLeak = 0, mav = 0;
  for (const g of store.data.games) for (const p of (g.plays || [])) {
    const t = p.tags || {}, u = t.unit || 'offense';
    if (u === 'special' && (t.formation || t.personnel || t.defFront || t.coverage || t.blitz)) stLeak++;
    if (u !== 'defense') for (const f of split(t.defFront)) if (OUR.includes(f)) mav++;
  }
  return { games: store.data.games.map(g => ({ id: g.id, opp: (g.gameInfo && g.gameInfo.opponent) || '(unnamed)', plays: (g.plays || []).length })), stLeak, mav };
};

const VIEWS = [
  ['dashboard', () => window.app.stats.showDashboard()],
  ['tab:offense', () => document.querySelector('#statsDashboard .stats-tab[data-tab="offense"]')?.click()],
  ['tab:defense', () => document.querySelector('#statsDashboard .stats-tab[data-tab="defense"]')?.click()],
  ['tab:selfscout', () => document.querySelector('#statsDashboard .stats-tab[data-tab="selfscout"]')?.click()],
  ['tab:season', () => document.querySelector('#statsDashboard .stats-tab[data-tab="season"]')?.click()],
  ['tab:matchup', () => document.querySelector('#statsDashboard .stats-tab[data-tab="matchup"]')?.click()],
  ['selfScoutReport', () => window.app.stats.renderSelfScout()],
  ['defensiveReport', () => window.app.stats.renderDefensiveReport()],
  ['opponentScout', () => window.app.stats.renderOpponentScout(window.__opp)],
  ['filmGrid', () => window.app.playGrid && window.app.playGrid.refresh()],
];

for (const file of files) {
  const season = JSON.parse(fs.readFileSync(file, 'utf-8'));
  const name = season.seasonName || season.id || path.basename(path.dirname(file));
  console.log(`\n${'='.repeat(72)}\nSEASON: ${name}  (${(season.games || []).length} games)`);
  errors.length = 0;

  await page.goto(URL, { waitUntil: 'networkidle0' });
  await new Promise(r => setTimeout(r, 400));
  const seed = await page.evaluate(seedFn, season, OUR);
  console.log(`  normalize self-heal: ST leaks after load = ${seed.stLeak}  |  our-own front on offense after load = ${seed.mav}`);

  for (const g of seed.games) {
    // Fresh page per game so a prior hang can't bleed over and state can't accrue.
    await page.goto(URL, { waitUntil: 'networkidle0' });
    await new Promise(r => setTimeout(r, 300));
    await page.evaluate(seedFn, season, OUR);
    // Load the target game WITHOUT commitActive (a fresh page has an empty tagger,
    // and switchToGame would commit that empty state over the active game first).
    await page.evaluate((gid, opp) => {
      const sm = window.app.storage;
      sm.seasonStore.data.activeGameId = gid;
      sm._loadActiveGame();
      window.__opp = opp;
    }, g.id, g.opp);

    const hung = []; const threw = []; dialogs = [];
    for (const [label, fn] of VIEWS) {
      if (label === 'opponentScout' && g.opp === '(unnamed)') continue;
      const before = dialogs.length;
      try { await race(fn); }
      catch (e) {
        if (e.message === 'TIMEOUT') { hung.push({ label, dialog: dialogs.length > before ? dialogs[dialogs.length - 1] : null }); break; }
        threw.push(`${label}: ${e.message}`);
      }
    }
    let status = '✓ all views ok';
    if (hung.length) status = `🔴 ${hung[0].label} HUNG — real render loop (no dialog fired)`;
    else if (dialogs.length) status = `🟠 alert popped: "${dialogs[dialogs.length - 1]}"`;
    else if (threw.length) status = `!! ${threw.length} exception(s)`;
    console.log(`  vs ${g.opp.padEnd(30)} plays=${String(g.plays).padStart(3)}  ${status}`);
    threw.forEach(t => console.log('       - ' + t));
  }
  if (errors.length) {
    console.log(`  console/page errors (${errors.length}):`);
    [...new Set(errors)].slice(0, 10).forEach(e => console.log('     - ' + e));
  }
}
await browser.close();
console.log(`\n${'='.repeat(72)}\nDONE.`);
process.exit(0);
