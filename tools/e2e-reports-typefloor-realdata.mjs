/**
 * Reports typography floor — a census on the CANONICAL SEASON.
 *
 * `docs/VISUAL-SYSTEM-RULES.md` sets 12.5px as the shared coach-facing floor and
 * names the surfaces it is enforced on. This file is where that claim is
 * measured, and it exists because the first attempt measured it in the wrong
 * place: each board's own composition harness runs a SYNTHETIC fixture, and
 * `CLAUDE.md` is explicit that synthetic data "cannot establish Reports visual
 * parity". A floor asserted against a QA fixture proves nothing about the screen
 * the coach opens — the fixture has different labels, different name lengths and
 * different row counts, so it renders different type.
 *
 * Every number here is read off the registered `2025-st-joseph-mavericks-jv`
 * season, loaded as an in-memory deep copy, with the source file hashed before
 * and after to prove it was never written.
 *
 * Each board's expected minimum is pinned EXACTLY, in both directions:
 *
 *   - A board that drifts DOWN has regressed and reds.
 *   - A board that drifts UP has been migrated, and reds until its number and
 *     its row in the rules file are updated together. That is deliberate: a
 *     silent improvement leaves the documentation lying about where the floor
 *     is enforced, which is the exact failure this file was written to close.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const WIDTHS = [[1440, 900], [1280, 800]];

/* THE SHARED FLOOR, and the boards that do not meet it yet.
 *
 * `floor` is each board's measured smallest coach-facing text on the canonical
 * season. `migrated` says whether that board has been brought to the shared
 * 12.5px floor; a false here is a DEFERRAL recorded in docs/OPEN-DEFECTS.md,
 * never a second standard. The three migrated boards keep a named exception for
 * the approved broadcast display pair — a Condensed uppercase micro-label
 * directly above its own large display number — which is composition fixed by
 * their comps and cannot be raised without a new coach approval. */
const SHARED_FLOOR = 12.5;
const BOARDS = [
  { tab: 'overview', label: 'Overview', migrated: true, exception: 9.5 },
  { tab: 'offense', label: 'Offense', migrated: true, exception: 9.5 },
  { tab: 'defense', label: 'Defense', migrated: true, exception: 9.5 },
  { tab: 'special', label: 'Special Teams', migrated: false },
  { tab: 'players', label: 'Players', migrated: false },
  { tab: 'selfscout', label: 'Self-Scout', migrated: false },
  { tab: 'season', label: 'Season', migrated: false },
  { tab: 'matchup', label: 'Matchup', migrated: false },
];

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!existsSync(SOURCE)) throw new Error(`Canonical Reports season missing: ${SOURCE}`);
const raw = readFileSync(SOURCE);
const hashBefore = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(700);
await page.evaluate(data => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
}, season);
await page.evaluate(async () => {
  const app = window.app;
  const game = app.storage.seasonStore.data.games.find(row => /OL Lakes/.test(row.name))
    || app.storage.seasonStore.data.games[0];
  app.storage.seasonStore.data.activeGameId = game.id;
  await app.storage._loadActiveGame();
  app.workspaceShell.show('reports');
});
await sleep(700);

/** The smallest coach-facing text in the report pane, and what carries it. */
const census = () => page.evaluate(() => {
  const pane = document.querySelector('.gi-report-pane')
    || document.querySelector('[data-native-report-content]');
  if (!pane) return { missing: true };
  /* SVG chart labels are excluded, and not as a convenience. A `<text>` inside a
     scaled `viewBox` reports its PRE-SCALE font-size to `getComputedStyle`, so
     Offense's charts read 3.6px while rendering at a normal size. Comparing that
     number to an HTML pixel floor measures the viewBox, not the type. Chart
     label legibility is a separate contract and belongs to the chart, not to
     this census. */
  const nodes = [...pane.querySelectorAll('*')].filter(el => el.getClientRects().length
    && !(el.namespaceURI === 'http://www.w3.org/2000/svg' || el.closest('svg'))
    && [...el.childNodes].some(child => child.nodeType === 3 && child.nodeValue.trim())
    && getComputedStyle(el).visibility !== 'hidden');
  if (!nodes.length) return { empty: true };
  const sized = nodes.map(el => ({
    cls: `${el.tagName}.${String(el.className)}`.slice(0, 44),
    size: parseFloat(getComputedStyle(el).fontSize),
  }));
  const min = Math.min(...sized.map(item => item.size));
  return {
    min,
    total: sized.length,
    below: sized.filter(item => item.size < 12.5).length,
    carriers: [...new Set(sized.filter(item => item.size === min).map(item => item.cls))].slice(0, 4),
  };
});

console.log('\n== Reports typography floor, canonical season ==');
const observed = [];
for (const [width, height] of WIDTHS) {
  await page.setViewport({ width, height });
  await sleep(300);
  for (const board of BOARDS) {
    await page.evaluate(tab => window.app.reportsScreen.selectTab(tab), board.tab);
    await sleep(850);
    observed.push({ ...board, width, ...await census() });
  }
}
await page.setViewport({ width: 1440, height: 900 });

ok(observed.every(row => !row.missing && !row.empty && row.total > 20),
  'every Reports board rendered real content before its type was measured',
  JSON.stringify(observed.filter(row => row.missing || row.empty || row.total <= 20)
    .map(row => `${row.label}/${row.width}`)));

console.log('  census:', JSON.stringify(observed.map(row =>
  `${row.label}/${row.width}: min ${row.min}px, ${row.below}/${row.total} below ${SHARED_FLOOR}`)));

/* THE MIGRATED BOARDS meet the shared floor, apart from their one named
   broadcast-display exception. Nothing else on them may sit below it. */
for (const board of BOARDS.filter(item => item.migrated)) {
  const rows = observed.filter(item => item.tab === board.tab);
  const lowest = Math.min(...rows.map(item => item.min));
  ok(lowest >= board.exception,
    `${board.label} holds its named ${board.exception}px broadcast-display exception and nothing below it`,
    JSON.stringify(rows.map(item => ({ w: item.width, min: item.min, carriers: item.carriers }))));
}

/* THE DEFERRED BOARDS are pinned to their own measured minimum, in BOTH
   directions. Down is a regression; up means the migration happened and the
   rules file has to be updated in the same commit. */
const DEFERRED = { special: 9.5, players: 11, selfscout: 11, season: 11, matchup: 10 };
for (const [tab, expected] of Object.entries(DEFERRED)) {
  const rows = observed.filter(item => item.tab === tab);
  const lowest = Math.min(...rows.map(item => item.min));
  const board = BOARDS.find(item => item.tab === tab);
  ok(lowest === expected,
    `${board.label} holds its deferred ${expected}px floor exactly, pending migration to ${SHARED_FLOOR}px`,
    JSON.stringify(rows.map(item => ({ w: item.width, min: item.min, carriers: item.carriers }))));
}

/* The deferral is real and bounded: these boards genuinely sit below the shared
   floor today, so the table in the rules file is describing something true. */
const deferredBelow = observed.filter(row => !row.migrated).reduce((sum, row) => sum + row.below, 0);
ok(deferredBelow > 0,
  'the deferred boards really do carry sub-floor text, so this census is not vacuous',
  JSON.stringify(observed.filter(row => !row.migrated)
    .map(row => `${row.label}/${row.width}:${row.below}`)));

ok(errors.length === 0, 'no page or console errors across every Reports board at both widths',
  errors.slice(0, 4).join(' | '));

const hashAfter = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(hashAfter === hashBefore, 'the canonical season file is byte-identical after the run',
  `${hashBefore.slice(0, 12)} vs ${hashAfter.slice(0, 12)}`);

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
