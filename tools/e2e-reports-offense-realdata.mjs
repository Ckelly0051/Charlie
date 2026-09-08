/**
 * Reports > Offense — production evidence on the CANONICAL REAL SEASON.
 *
 * `design-approvals/APPROVALS.json` names `2025-st-joseph-mavericks-jv`
 * ("2025 St. Joseph Mavericks - JV") as the only data source that can establish
 * Reports visual parity, football correctness or production acceptance.
 * `e2e-reports-offense` owns the deterministic formula, sparse, empty and
 * over-cap regressions on a synthetic fixture; this file owns the evidence.
 *
 * READ-ONLY. The season is read from the registered Documents-mirror path,
 * deep-copied, and installed into an in-memory store in a Chromium page whose
 * backend is `BrowserBackend` — the coach's file is never a write target, and
 * the run asserts the source is byte-identical afterwards rather than assuming.
 *
 * EVERY GAME, BOTH DESKTOP RELEASE WIDTHS. The static-composition rule is a
 * claim about all real film, not about one game: the same 26 modules, in the
 * same order, none over its approved row allocation, no page overflow and no
 * clipped cell — on each of the six games at 1440 and 1280.
 *
 * The handoff printed at the end names the season, its game and play counts,
 * the selected game, the scope and the source-integrity result, so a missing,
 * empty or wrong season cannot pass unnoticed.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SEASON_NAME = '2025 St. Joseph Mavericks - JV';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const OUT = 'artifacts/offense-production-realdata';
const VIEWPORTS = [[1440, 900], [1280, 800]];

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

if (!existsSync(SOURCE)) {
  if (process.env.GIQ_REALDATA_OPTIONAL === '1') {
    console.log(`SKIP: canonical season not present at ${SOURCE} (GIQ_REALDATA_OPTIONAL=1)`);
    process.exit(0);
  }
  console.log(`FAIL: canonical Reports season missing at ${SOURCE}`);
  console.log('      Reports evidence requires it; set GIQ_REALDATA_OPTIONAL=1 to skip on a runner.');
  process.exit(1);
}

const rawBefore = readFileSync(SOURCE);
const hashBefore = createHash('sha256').update(rawBefore).digest('hex');
const season = JSON.parse(rawBefore.toString('utf8'));
const games = season.games || [];
const totalPlays = games.reduce((t, g) => t + (g.plays || []).length, 0);
const activeId = season.activeGameId || games[0]?.id;
const activeGame = games.find(g => g.id === activeId) || games[0];

console.log(`\nCanonical season: ${season.seasonName} (${season.id || SEASON_ID})`);
console.log(`  ${games.length} games, ${totalPlays} charted plays`);
console.log(`  selected game: ${activeGame?.name} — ${(activeGame?.plays || []).length} plays`);

ok(season.seasonName === SEASON_NAME,
  'the registered canonical season is the one loaded', String(season.seasonName));
ok(games.length > 0 && totalPlays > 0,
  'the canonical season carries real charted film', `${games.length} games / ${totalPlays} plays`);

/* ══ The approved Offense schema, transcribed from the canonical artifact ══
   `design-comps/reports-offense-2026-09-03/offense.html` — 6 zones, 26 modules
   in this order, each with its approved row allocation. Stated as literal
   constants; this file never parses the comp. */
const SCHEMA_MODULES = [
  'Identity', 'Run / pass balance',
  'Play calls', 'Concepts',
  'Formation', 'Play type', 'Play-action',
  'Core tendencies', 'Calls by situation',
  'Personnel', 'Backfield', 'Motion',
  'Play direction', 'Strength', 'Field hash',
  'Personnel × situation', 'Situational',
  'Tendency matrix', 'By quarter',
  'Field heat map',
  'Yards per play', 'Yards vs distance to go',
  'Success by field position', 'Run / pass by down',
  /* RECORDED DIVERGENCE from the comp's 26, pending the coach's decision —
     see the Zone 5 note in `OffenseTab` and the matching note in
     `e2e-reports-offense`. Deleting it drops the yardage spray's axis context
     and the per-quarter hover context that `e2e-native-reports` pins. */
  'Visualizations',
  'Team profile', 'Expected points added',
];
const SCHEMA_ROWS = {
  'Run / pass balance': 4, 'Play calls': 8, Concepts: 10, Formation: 5,
  'Play type': 6, 'Play-action': 3, 'Core tendencies': 8, 'Calls by situation': 8,
  Personnel: 5, Backfield: 5, Motion: 4, 'Play direction': 3, Strength: 3,
  'Field hash': 3, 'Personnel × situation': 6, Situational: 6,
  'Tendency matrix': 5, 'By quarter': 4, 'Team profile': 6,
};

mkdirSync(OUT, { recursive: true });
const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(700);

/* A DEEP COPY into an in-memory store. The page's backend is BrowserBackend,
   so nothing here can reach the coach's file; the hash check below proves it. */
await page.evaluate(async data => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
}, season);

const observed = [];
for (const g of games) {
  await page.evaluate(async gid => {
    window.app.storage.seasonStore.data.activeGameId = gid;
    await window.app.storage._loadActiveGame();
    window.app.workspaceShell.show('reports');
    window.app.reportsScreen.selectTab('offense');
  }, g.id);
  await sleep(900);
  for (const [w, h] of VIEWPORTS) {
    await page.setViewport({ width: w, height: h });
    await sleep(400);
    const r = await page.evaluate(() => {
      const board = document.querySelector('.gi-offense-board');
      if (!board) return { board: false };
      const txt = el => (el?.textContent || '').replace(/\s+/g, ' ').trim();
      const name = m => txt(m.querySelector('header > strong')).replace(/\s*·\s*Big\s*\d+$/, '');
      const mods = [...board.querySelectorAll('.gi-overview-module')];
      const clipped = [];
      mods.forEach(m => m.querySelectorAll('td,th').forEach(c => {
        if (c.scrollWidth - c.clientWidth > 1) clipped.push(`${name(m)}:${txt(c).slice(0, 12)}`);
      }));
      return {
        board: true,
        // The board must be ON SCREEN before any geometry is trusted. A hidden
        // route reports zero overflow just as happily as a correct one.
        visible: board.getBoundingClientRect().width > 200,
        route: document.querySelector('.gi-reports-tab.active')?.getAttribute('data-report-tab'),
        titles: mods.map(name),
        rows: Object.fromEntries(mods.map(m => [name(m), m.querySelectorAll('tbody tr').length])),
        absent: mods.filter(m => /Insufficient charted data/.test(m.textContent)).map(name),
        zones: board.querySelectorAll('.gi-zone-rule').length,
        height: Math.round(board.getBoundingClientRect().height),
        ovX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        clipped: clipped.slice(0, 6),
      };
    });
    observed.push({ game: g.name, w, ...r });

    /* Capture at the board's real height. `fullPage` returns only the viewport
       because the route scrolls inside its own container. */
    const need = await page.evaluate(() => {
      const b = document.querySelector('.gi-offense-board');
      return b ? Math.ceil(b.getBoundingClientRect().height) + 320 : 900;
    });
    await page.setViewport({ width: w, height: Math.min(need, 8000) });
    await sleep(450);
    await page.evaluate(() => document.querySelectorAll('.gi-toast-stack .gi-native-toast').forEach(n => n.remove()));
    const slug = `w${games.indexOf(g) + 1}-${w}`;
    await page.screenshot({ path: `${OUT}/${slug}.png` });
    await page.setViewport({ width: w, height: h });
    await sleep(200);
  }
  await page.setViewport({ width: 1440, height: 900 });
}

console.log('\n== The approved schema holds on every game, at both release widths ==');
ok(observed.length === games.length * VIEWPORTS.length,
  `every game was inspected at ${VIEWPORTS.map(v => v[0]).join(' and ')}`,
  `${observed.length} observations`);
ok(observed.every(o => o.board && o.visible && o.route === 'offense'),
  'the Offense board is rendered and on screen before anything is measured',
  JSON.stringify(observed.filter(o => !(o.board && o.visible && o.route === 'offense'))
    .map(o => ({ game: o.game, w: o.w, board: o.board, visible: o.visible, route: o.route }))));
const wrongInventory = observed.filter(o =>
  JSON.stringify(o.titles) !== JSON.stringify(SCHEMA_MODULES));
ok(wrongInventory.length === 0,
  `all ${SCHEMA_MODULES.length} approved modules render in the approved order on every game`,
  JSON.stringify(wrongInventory.map(o => ({ game: o.game, w: o.w, titles: o.titles }))));
ok(observed.every(o => o.zones === 6), 'six zone rules on every game',
  JSON.stringify(observed.filter(o => o.zones !== 6).map(o => ({ game: o.game, zones: o.zones }))));
const overCap = observed.flatMap(o => Object.entries(SCHEMA_ROWS)
  .filter(([n, cap]) => (o.rows[n] ?? 0) > cap)
  .map(([n, cap]) => `${o.game} @${o.w} ${n}: ${o.rows[n]} > ${cap}`));
ok(overCap.length === 0, 'no module exceeds its approved row allocation on any real game',
  JSON.stringify(overCap.slice(0, 8)));
ok(observed.every(o => o.ovX === 0), 'no page-level horizontal overflow on any game at either width',
  JSON.stringify(observed.filter(o => o.ovX !== 0).map(o => ({ game: o.game, w: o.w, ovX: o.ovX }))));
ok(observed.every(o => o.clipped.length === 0), 'no clipped table cell on any game at either width',
  JSON.stringify(observed.flatMap(o => o.clipped).slice(0, 8)));
/* Absence is the approved treatment, and it must actually OCCUR on this film —
   the coach's season does not chart a play call on every game, so a run that
   reported zero absences would mean the modules had vanished again. */
ok(observed.some(o => o.absent.length > 0),
  'unfilled slots hold their place with the approved absence treatment',
  JSON.stringify(observed.map(o => ({ game: o.game, absent: o.absent.length }))));
ok(observed.every(o => o.absent.every(t => SCHEMA_MODULES.includes(t))),
  'every absence slot belongs to an approved module', JSON.stringify(
    observed.flatMap(o => o.absent.filter(t => !SCHEMA_MODULES.includes(t))).slice(0, 6)));
ok(errors.length === 0, 'the Offense route raises no page or console errors on real film',
  errors.slice(0, 3).join(' | '));

/* ══ The coach's file was never written ═══════════════════════════════════ */
const hashAfter = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(hashAfter === hashBefore, 'the canonical season file is byte-identical after the run',
  `${hashBefore.slice(0, 12)} vs ${hashAfter.slice(0, 12)}`);

await browser.close();

console.log('\n── Evidence handoff ──────────────────────────────────────────');
console.log(`  season      : ${season.seasonName} (${SEASON_ID})`);
console.log(`  games       : ${games.length}   plays: ${totalPlays}`);
console.log(`  exercised   : ${games.map(g => g.name).join(' | ')}`);
console.log(`  selected    : ${activeGame?.name}`);
console.log('  scope       : current game, Reports > Offense');
console.log(`  source      : ${SOURCE}`);
console.log(`  read-only   : ${hashAfter === hashBefore ? 'CONFIRMED, sha256 unchanged' : 'FAILED — source changed'}`);
console.log(`  captures    : ${OUT} (${games.length * VIEWPORTS.length} images, ${VIEWPORTS.map(v => v[0]).join(' and ')})`);
observed.filter(o => o.w === 1440).forEach(o =>
  console.log(`  board       : ${o.game.padEnd(38)} ${o.height}px, ${o.titles.length} modules, ${o.absent.length} absent`));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
