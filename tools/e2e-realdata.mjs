import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
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

// This was `process.exit(0)` — a missing fixture reported success, so on any
// machine without the mirror the real-data gate silently did not run and the
// suite still looked green. Fail CLOSED: the review machine must have the
// fixture. A machine that legitimately has no real season sets
// GIQ_REALDATA_OPTIONAL=1 and gets an explicit skip, not a fake pass.
let failures = 0;
let gamesChecked = 0;
let gamesPassed = 0;
if (!files.length) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log('SKIP: no season.json at', MIRROR, '(GIQ_REALDATA_OPTIONAL=1)');
    console.log('\n== RESULT: 0 passed, 0 failed (skipped) ==');
    process.exit(0);
  }
  console.log('No season.json at', MIRROR);
  console.log('\n== RESULT: 0 passed, 1 failed ==');
  console.log('   The real-data check did not run. This is the designated review');
  console.log('   machine unless GIQ_REALDATA_OPTIONAL=1 is set.');
  process.exit(1);
}

const URL = TEST_APP_URL;
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
  ['reports route', async () => { await window.app.workspaceShell.show('reports'); const host=document.getElementById('wsReports'); const content=host?.querySelector('[data-native-report-content]'); if (host?.hidden || !content || !content.textContent.trim()) throw new Error('NATIVE REPORTS BLANK'); }],
  ['tab:offense', () => document.querySelector('#statsDashboard .stats-tab[data-tab="offense"]')?.click()],
  ['tab:defense', () => { const app=window.app,{scoped,labels}=app.reportsScreen._defenseCohort(),expected=app.stats.defensivePerformance(scoped,labels).total; app.reportsScreen.selectTab('defense'); const pane=document.querySelector('[data-native-report-content]'),text=pane?.textContent||'',valid=expected ? pane?.querySelector('.gi-defense-report')&&text.includes('Defensive Snaps')&&text.includes(String(expected)) : pane?.querySelector('.gi-reports-empty')&&/No defensive data tagged yet/.test(text); if(!valid) throw new Error('DEFENSE REPORT WRONG OR BLANK'); }],
  ['tab:selfscout', () => { window.app.reportsScreen.selectTab('selfscout'); const pane=document.querySelector('[data-native-report-content]'); if(!pane?.querySelector('.gi-selfscout-board') || !/Self-Scout/.test(pane.textContent)) throw new Error('SELF-SCOUT REPORT WRONG OR BLANK'); }],
  ['tab:season', () => { window.app.reportsScreen.selectTab('season'); const pane=document.querySelector('[data-native-report-content]'); if(!pane?.querySelector('.gi-season-native') || !/Season Report/.test(pane.textContent)) throw new Error('SEASON REPORT WRONG OR BLANK'); }],
  ['tab:matchup', () => document.querySelector('#statsDashboard .stats-tab[data-tab="matchup"]')?.click()],
  ['selfScoutReport', () => { window.app.reportsScreen.show(); window.app.reportsScreen.selectTab('selfscout'); }],
  ['defensiveReport', () => { window.app.reportsScreen.show(); window.app.reportsScreen.selectTab('defense'); }],
  ['opponentScout', () => window.app.reportsScreen.scoutOpponent(window.__opp)],
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
  // These were printed and never enforced: the self-healing normalization this
  // harness exists to verify could regress on the coach's real season and the
  // run would still report green. Nonzero means stripStAlignment /
  // stripLeakedFronts did not fire — that is a failure, not a note.
  if (seed.stLeak) { console.log(`  FAIL: ${seed.stLeak} ST alignment leak(s) survived normalize`); failures++; }
  if (seed.mav) { console.log(`  FAIL: ${seed.mav} our-own front(s) survived on offense after normalize`); failures++; }

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
    // Every one of these markers used to print and exit 0: a hung render loop on
    // the coach's real season sailed through the gate as green.
    // checked != passed — a failed game must not be reported as a pass.
    gamesChecked++;
    if (hung.length || dialogs.length || threw.length) failures++;
    else gamesPassed++;
  }
  if (errors.length) {
    console.log(`  console/page errors (${errors.length}):`);
    [...new Set(errors)].slice(0, 10).forEach(e => console.log('     - ' + e));
    failures += errors.length;
  }
}
await browser.close();

// A fixture that exists but yields zero checked games is not a pass — it means
// the seasons parsed to nothing and the check was vacuous.
if (!gamesChecked) {
  console.log('  no games were checked despite a present fixture');
  failures++;
}

console.log(`\n${'='.repeat(72)}\nDONE.`);
// gamesPassed, not gamesChecked: a game that hung or threw is checked but NOT
// passed, and reporting it as passed is the same lie in a smaller place.
console.log(`  ${gamesChecked} game(s) checked, ${gamesPassed} clean`);
console.log(`== RESULT: ${gamesPassed} passed, ${failures} failed ==`);
process.exit(failures ? 1 : 0);
