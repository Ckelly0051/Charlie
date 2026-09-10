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
   `design-comps/reports-offense-2026-09-03/offense.html`, plus the coach-approved
   2026-09-08 density revision — 6 zones, 29 modules
   in this order, each with its approved row allocation. Stated as literal
   constants; this file never parses the comp. */
const SCHEMA_MODULES = [
  'Identity', 'Run / pass balance',
  'Play calls', 'Concepts',
  'Formation', 'Play type', 'Play-action', 'Formation × Play Type',
  'Core tendencies', 'Direction vs Strength', 'Calls by situation', 'Drive outcomes',
  'Personnel', 'Backfield', 'Motion',
  'Play direction', 'Strength', 'Field hash',
  'Personnel × situation', 'Situational',
  'Top 5 Tendencies', 'By quarter',
  'Field heat map',
  'Yards per play', 'Yards vs distance to go',
  'Success by field position', 'Run / pass by down',
  'Team profile', 'Expected points added',
];
const SCHEMA_ROWS = {
  'Run / pass balance': 4, 'Play calls': 5, Concepts: 5, Formation: 5,
  'Play type': 5, 'Play-action': 3, 'Formation × Play Type': 3, 'Core tendencies': 5,
  'Direction vs Strength': 4, 'Calls by situation': 8,
  Personnel: 5, Backfield: 5, Motion: 4, 'Play direction': 3, Strength: 3,
  'Field hash': 3, 'Personnel × situation': 6, Situational: 6,
  'Top 5 Tendencies': 5, 'By quarter': 4, 'Team profile': 6,
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
      const last = mods.at(-1);
      const boardRect = board.getBoundingClientRect();
      const lastRect = last?.getBoundingClientRect();
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
        moduleHeights: Object.fromEntries(mods.map(m => [name(m), Math.round(m.getBoundingClientRect().height)])),
        heldRows: mods.reduce((t, m) => t + m.querySelectorAll('tr.is-absent').length, 0),
        absent: mods.filter(m => m.querySelector('tr.is-absent')).map(name),
        teamProfileLabels: [...(mods.find(m => name(m) === 'Team profile')?.querySelectorAll('tbody tr td:first-child') || [])]
          .map(cell => txt(cell)),
        driveOutcomes: [...board.querySelectorAll('.gi-drive-outcome')].map(cell => ({
          label: txt(cell.querySelector('span')), value: txt(cell.querySelector('strong')),
        })),
        epaBars: [...board.querySelectorAll('.gi-epa-bar')].map(bar => ({
          label: txt(bar.querySelector('span')), value: txt(bar.querySelector('strong')),
        })),
        zones: board.querySelectorAll('.gi-zone-rule').length,
        formType: {
          rows: board.querySelectorAll('.gi-form-type-grid tbody tr').length,
          cols: board.querySelectorAll('.gi-form-type-grid thead th').length - 1,
          populated: board.querySelectorAll('.gi-form-type-cell:not(.is-absent)').length,
        },
        height: Math.round(board.getBoundingClientRect().height),
        bottomEdge: {
          title: name(last),
          inside: !!lastRect && lastRect.bottom <= boardRect.bottom + 1,
          contentFits: !!last && last.scrollHeight <= last.clientHeight + 1,
          gap: lastRect ? Math.round(boardRect.bottom - lastRect.bottom) : null,
        },
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
/* EXACT, not `<= cap`. The first version of this assertion certified a ceiling
   and called it a schema: it passed while every module was still content-sized,
   recorded six different board heights, and never failed on them. A declared
   allocation is the number of rows the module renders, on every game. */
const wrongRows = observed.flatMap(o => Object.entries(SCHEMA_ROWS)
  .filter(([n, exact]) => (o.rows[n] ?? -1) !== exact)
  .map(([n, exact]) => `${o.game} @${o.w} ${n}: ${o.rows[n]} != ${exact}`));
ok(wrongRows.length === 0, 'every module renders EXACTLY its approved row allocation on every real game',
  JSON.stringify(wrongRows.slice(0, 8)));

/* ONE BOARD HEIGHT PER VIEWPORT. This is the whole claim — "the board has
   stable geometry for every game at a given viewport" — and nothing asserted
   it before. Six games producing 5102..5478px passed the old suite. */
for (const [w] of VIEWPORTS) {
  const heights = [...new Set(observed.filter(o => o.w === w).map(o => o.height))];
  ok(heights.length === 1,
    `the board is ONE height at ${w} across all ${games.length} games`,
    JSON.stringify(observed.filter(o => o.w === w).map(o => ({ game: o.game, h: o.height }))));
}
const tallest1440 = observed.find(o => o.w === 1440)?.moduleHeights || {};
ok(Math.max(...Object.values(tallest1440)) <= 950,
  'no individual module becomes a chart-sized void at 1440',
  JSON.stringify(Object.entries(tallest1440).filter(([, h]) => h > 950)));
const PROFILE_LABELS = ['Yards / play', 'Success rate', 'Explosive rate', 'Negative rate', '3rd down', 'Points / drive'];
ok(observed.every(o => JSON.stringify(o.teamProfileLabels) === JSON.stringify(PROFILE_LABELS)),
  'Team profile renders the approved six metrics in the approved order on every real game',
  JSON.stringify(observed.filter(o => JSON.stringify(o.teamProfileLabels) !== JSON.stringify(PROFILE_LABELS))
    .map(o => ({ game: o.game, labels: o.teamProfileLabels }))));
ok(observed.every(o => o.driveOutcomes.length === 7 && o.driveOutcomes[0]?.label === 'Drives'),
  'Drive outcomes holds the same seven possession measures on every game',
  JSON.stringify(observed.filter(o => o.driveOutcomes.length !== 7).map(o => ({ game: o.game, cells: o.driveOutcomes }))));
ok(observed.every(o => o.formType.rows === 3 && o.formType.cols === 5 && o.formType.populated > 0),
  'Formation × Play Type holds a populated 3 x 5 footprint on every real game',
  JSON.stringify(observed.filter(o => !(o.formType.rows === 3 && o.formType.cols === 5 && o.formType.populated > 0))
    .map(o => ({ game: o.game, w: o.w, matrix: o.formType }))));
ok(observed.every(o => o.epaBars.length === 6),
  'EPA contribution holds six ranked play-type slots beside the cumulative curve',
  JSON.stringify(observed.filter(o => o.epaBars.length !== 6).map(o => ({ game: o.game, bars: o.epaBars }))));
ok(observed.every(o => o.ovX === 0), 'no page-level horizontal overflow on any game at either width',
  JSON.stringify(observed.filter(o => o.ovX !== 0).map(o => ({ game: o.game, w: o.w, ovX: o.ovX }))));
ok(observed.every(o => o.clipped.length === 0), 'no clipped table cell on any game at either width',
  JSON.stringify(observed.flatMap(o => o.clipped).slice(0, 8)));
ok(observed.every(o => o.bottomEdge?.title === 'Expected points added'
    && o.bottomEdge.inside && o.bottomEdge.contentFits && o.bottomEdge.gap >= 0),
  'the final module and its content remain inside the board bottom on every game at either width',
  JSON.stringify(observed.filter(o => !(o.bottomEdge?.title === 'Expected points added'
    && o.bottomEdge.inside && o.bottomEdge.contentFits && o.bottomEdge.gap >= 0))
    .map(o => ({ game: o.game, w: o.w, bottom: o.bottomEdge }))));
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

/* ══ SEASON SCOPE — the scope this file did not exercise ══════════════════
   Reports > Season embeds this same Offense board at full-season scope, and
   `Top 5 Tendencies` only misbehaved there: its rows grew to 70px on the
   season cohort, so five of them plus a 30px header needed 380px inside a
   316px wrap in a 378px fixed panel. `.tm-wrap`'s overflow:auto engaged and
   the last row escaped the module by 60px. Game scope was clean, which is
   exactly why a game-scoped harness never saw it. */
console.log('\n── Season scope containment ──────────────────────────────────');
for (const [width, height] of VIEWPORTS) {
  await page.setViewport({ width, height });
  await new Promise(r => setTimeout(r, 250));
  await page.evaluate(() => { window.app.reportsScreen.selectTab('season'); });
  await new Promise(r => setTimeout(r, 500));
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.gi-report-pane nav button, .gi-report-pane [role="tab"]')]
      .find(node => /^Offense$/.test(node.textContent.trim()));
    if (btn) btn.click();
  });
  await new Promise(r => setTimeout(r, 600));
  const measured = await page.evaluate(() => {
    const pane = document.querySelector('.gi-report-pane');
    const modules = [...(pane?.querySelectorAll('.gi-overview-module') || [])];
    const named = name => modules.find(m => m.querySelector('header strong')?.textContent.trim() === name);
    const matrix = named('Top 5 Tendencies');
    const wrap = matrix?.querySelector('.tm-wrap');
    const lastRow = matrix?.querySelector('.tm-table tbody tr:last-child');
    return {
      present: !!matrix,
      title: matrix?.querySelector('header strong')?.textContent.trim(),
      rows: matrix?.querySelectorAll('.tm-table tbody tr').length ?? 0,
      panelHeight: matrix ? Math.round(matrix.getBoundingClientRect().height) : 0,
      wrapOverflow: wrap ? wrap.scrollHeight - wrap.clientHeight : 0,
      escape: (matrix && lastRow)
        ? Math.round(lastRow.getBoundingClientRect().bottom - matrix.getBoundingClientRect().bottom) : 0,
      engagedScrollers: [...(pane?.querySelectorAll('*') || [])].filter(node => {
        const cs = getComputedStyle(node);
        return ((cs.overflowY === 'auto' || cs.overflowY === 'scroll') && node.scrollHeight > node.clientHeight + 1)
          || ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && node.scrollWidth > node.clientWidth + 1);
      }).map(node => String(node.className).slice(0, 40)),
      pageOverflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    };
  });
  ok(measured.present && measured.title === 'Top 5 Tendencies' && measured.rows === 5,
    `${width}: Season > Offense renders Top 5 Tendencies with its five allocated rows`,
    JSON.stringify(measured));
  ok(measured.wrapOverflow === 0,
    `${width}: the tendency panel engages no internal vertical scrollbar at season scope`,
    JSON.stringify({ overflow: measured.wrapOverflow }));
  ok(measured.escape <= 0,
    `${width}: no tendency row escapes its fixed panel at season scope`,
    JSON.stringify({ escape: measured.escape }));
  ok(measured.panelHeight === 378,
    `${width}: the reserved panel height is unchanged`, String(measured.panelHeight));
  ok(measured.engagedScrollers.length === 0 && measured.pageOverflowX === 0,
    `${width}: Season > Offense engages no scroller and no page overflow`,
    JSON.stringify(measured.engagedScrollers));
}

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
const moduleRanges = Object.keys(observed.find(o => o.w === 1440)?.moduleHeights || {}).map(name => {
  const values = observed.filter(o => o.w === 1440).map(o => o.moduleHeights[name]);
  return { name, min: Math.min(...values), max: Math.max(...values) };
}).filter(row => row.min !== row.max);
if (moduleRanges.length) console.log(`  variable    : ${JSON.stringify(moduleRanges)}`);
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
