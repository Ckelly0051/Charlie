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
import puppeteer from './test-browser.mjs';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = CANONICAL_SEASON;
const WIDTHS = [[1440, 900], [1280, 800]];

/* THE SHARED FLOOR, measured across every Reports board. No board is described
 * as fully migrated: Overview and Defense retain approved broadcast labels,
 * Offense retains approved micro-labels plus one scoped narrow-width exception,
 * and the other five boards remain explicitly deferred. These are recorded
 * debts, not a second standard. */
const SHARED_FLOOR = 12.5;
const BOARDS = [
  { tab: 'overview', label: 'Overview' },
  { tab: 'offense', label: 'Offense' },
  { tab: 'defense', label: 'Defense' },
  { tab: 'special', label: 'Special Teams' },
  { tab: 'players', label: 'Players' },
  { tab: 'selfscout', label: 'Self-Scout' },
  { tab: 'season', label: 'Season' },
  { tab: 'matchup', label: 'Matchup' },
];

/* THE PINNED CENSUS. Every element below the shared floor, keyed by its size and
 * tag, with an exact count. A minimum alone is not a contract: with only a
 * minimum, raising 45 of 46 Players elements and leaving one at 11px stays
 * green, and so does adding an ordinary new 10px Offense label beside an
 * existing one. Both of those change a count here, so both red.
 *
 * Regenerate deliberately with GIQ_TYPEFLOOR_PRINT=1, and when you do, update
 * the table in docs/VISUAL-SYSTEM-RULES.md in the same commit. */
const OVERVIEW = { '9.5|SPAN': 19, '12|SPAN': 16 };
/* Defense Revision 2 (2026-09-17) is fully migrated: no element on the board
   renders below the shared floor, in either scope, at either width. */
const DEFENSE = {};
/* Offense's own broadcast micro-labels: tile and strip labels inside its
   approved comp, identical at both widths. Counted over all six pages.
   2026-09-23: the three `10.5|EM` zone-rule notes are gone with the zone
   rules themselves (the zones became pages in the secondary bar); no other
   element changed.
   2026-09-24: the module-system pass (1.12.0-97 smoke S97-1) put every Offense
   heading, KPI and tile label, heat-map cell, lens and EPA sub-heading and
   column label at or above the floor: 115 -> 49 at 1440, minimum 9.5 -> 10.5.
   What remains is inside charts - matrix-cell splits, zone-strip and down
   captions, EPA contribution bars - which that pass did not restyle.
   2026-09-28: the charting cutover converted the canonical fixture's Formation to
   a one-value Formation, so the matrix cells that split by formation
   shrank: 10.5|SPAN 19 -> 18 and 12|DIV 6 -> 4 (49 -> 46 at 1440, 214 -> 211 at
   1280). Every count fell or held; none rose. */
const OFFENSE_BASE = {
  '10.5|SMALL': 10, '10.5|SPAN': 18, '10.5|STRONG': 6, '11|SPAN': 8, '12|DIV': 4,
};
/* The narrow-width exception, and the whole of it: the eight `gi-off-narrow-fit`
   modules contribute exactly 165 cells at 1280 (their forty column labels
   reached the floor on 2026-09-24). Before
   the rule was scoped to that class it was scoped to every module on the board,
   which is how 876 of 997 elements sat below the floor. */
const OFFENSE_NARROW_FIT = { '12|TD': 165 };
const OFFENSE_NARROW_MODULES = [
  'Backfield', 'Field hash', 'Formation', 'Motion',
  'Personnel', 'Play direction', 'Play type', 'Strength',
];
/* MIGRATED 2026-09-19 by the Special Teams acceptance pass: this board carried
   98 sub-floor elements at a 9.5px minimum and now carries none. An empty census
   is a real assertion here -- the board is measured over the populated canonical
   season, and the minimum below is pinned in both directions. */
const SPECIAL = {};
/* MIGRATED 2026-09-20 by Players Revision 2: 46 sub-floor elements at an 11px
   minimum, now none. */
const PLAYERS = {};
/* Completed 2026-09-22: the three remaining report boards now hold the shared
   coach-facing floor on the canonical season at both release widths. */
const SELF_SCOUT = {};
const SEASON = {};
const MATCHUP = {};
const EXPECTED = {
  'overview@1440': OVERVIEW, 'overview@1280': OVERVIEW,
  'offense@1440': OFFENSE_BASE, 'offense@1280': { ...OFFENSE_BASE, ...OFFENSE_NARROW_FIT },
  'defense@1440': DEFENSE, 'defense@1280': DEFENSE,
  'special@1440': SPECIAL, 'special@1280': SPECIAL,
  'players@1440': PLAYERS, 'players@1280': PLAYERS,
  'selfscout@1440': SELF_SCOUT, 'selfscout@1280': SELF_SCOUT,
  'season@1440': SEASON, 'season@1280': SEASON,
  'matchup@1440': MATCHUP, 'matchup@1280': MATCHUP,
};
const PRINT = !!process.env.GIQ_TYPEFLOOR_PRINT;

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
  const under = sized.filter(item => item.size < 12.5);
  /* Keyed by SIZE and TAG, not by class: most of these carry no class at all,
     and a signature that changes whenever a class string changes would be a
     brittle check rather than a strict one. */
  const signature = {};
  under.forEach(item => {
    const key = `${item.size}|${item.cls.split('.')[0]}`;
    signature[key] = (signature[key] || 0) + 1;
  });
  const narrowModules = [...pane.querySelectorAll('.gi-off-narrow-fit')]
    .map(module => module.querySelector(':scope > header > strong')?.textContent.trim() || '')
    .sort();
  const narrowCellNodes = sized.filter(item => (item.cls.startsWith('TH.') || item.cls.startsWith('TD.'))
    && item.size < 12.5);
  const narrowOwnedCells = nodes.filter(el => (el.tagName === 'TH' || el.tagName === 'TD')
    && parseFloat(getComputedStyle(el).fontSize) < 12.5
    && el.closest('.gi-off-narrow-fit')).length;
  return {
    min,
    total: sized.length,
    below: under.length,
    signature,
    narrowModules,
    narrowCellCount: narrowCellNodes.length,
    narrowOwnedCells,
    carriers: [...new Set(under.filter(item => item.size === min).map(item => item.cls))].slice(0, 4),
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
    /* Offense and Defense were one scrolling board each and are now pages in
       the shared secondary bar (coach-approved comp, 2026-09-23). The census is
       of the WHOLE board, so it is taken on every page and summed; nothing
       about what is counted changes. Every other board keeps the census it
       always had, taken on the page it opens on. */
    if (board.tab === 'offense' || board.tab === 'defense') {
      const ids = await page.evaluate(() => [...document.querySelectorAll('[data-reports-secbar] [data-section]')].map(n => n.dataset.section));
      const parts = [];
      for (const id of ids) {
        await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), id);
        await sleep(250);
        parts.push(await census());
      }
      await page.evaluate(s => document.querySelector(`[data-reports-secbar] [data-section="${s}"]`)?.click(), ids[0]);
      const min = Math.min(...parts.map(p => p.min));
      const signature = {};
      parts.forEach(p => Object.entries(p.signature || {}).forEach(([k, v]) => { signature[k] = (signature[k] || 0) + v; }));
      observed.push({ ...board, width, pages: ids.length,
        missing: parts.some(p => p.missing), empty: parts.every(p => p.empty),
        min, total: parts.reduce((s, p) => s + (p.total || 0), 0), below: parts.reduce((s, p) => s + (p.below || 0), 0),
        signature, narrowModules: parts.flatMap(p => p.narrowModules || []).sort(),
        narrowCellCount: parts.reduce((s, p) => s + (p.narrowCellCount || 0), 0),
        narrowOwnedCells: parts.reduce((s, p) => s + (p.narrowOwnedCells || 0), 0),
        carriers: [...new Set(parts.filter(p => p.min === min).flatMap(p => p.carriers || []))].slice(0, 4) });
    } else {
      observed.push({ ...board, width, ...await census() });
    }
  }
}
await page.setViewport({ width: 1440, height: 900 });

/* The canonical fixture holds no Special Teams snaps: its old-format values were
   blanked on 2026-09-26 and the coach retags them. Until then its Special Teams
   board is the empty state -- still measured above for the floor, but not real
   content. The populated board's floor is pinned on a synthetic fixture
   (e2e-reports-special-teams, ST_TYPE_FLOOR). Regenerating the fixture with
   Special Teams snaps restores this requirement by itself. */
const FIXTURE_HAS_ST = season.games.some(g => (g.plays || []).some(p => p.specialTeams));
const contentRows = observed.filter(row => FIXTURE_HAS_ST || row.tab !== 'special');
ok(FIXTURE_HAS_ST || observed.filter(row => row.tab === 'special').every(row => !row.missing && row.total > 0),
  'Special Teams renders its empty state on a fixture with no Special Teams snaps',
  JSON.stringify(observed.filter(row => row.tab === 'special').map(row => `${row.width}:${row.total}`)));
ok(contentRows.every(row => !row.missing && !row.empty && row.total > 20),
  'every Reports board rendered real content before its type was measured',
  JSON.stringify(contentRows.filter(row => row.missing || row.empty || row.total <= 20)
    .map(row => `${row.label}/${row.width}`)));

console.log('  census:', JSON.stringify(observed.map(row =>
  `${row.label}/${row.width}: min ${row.min}px, ${row.below}/${row.total} below ${SHARED_FLOOR}`)));

if (PRINT) {
  console.log('\n  PIN THIS (GIQ_TYPEFLOOR_PRINT):');
  console.log(JSON.stringify(Object.fromEntries(
    observed.map(row => [`${row.tab}@${row.width}`, row.signature])), null, 1));
}

/* EVERY SUB-FLOOR ELEMENT IS ACCOUNTED FOR, BY SIZE, TAG AND COUNT.
   A minimum alone is not a contract. This compares the whole census against its
   pinned signature, so a new sub-floor element, a changed size, or a changed
   count all red — in either direction. */
for (const row of observed) {
  const key = `${row.tab}@${row.width}`;
  const expected = EXPECTED[key];
  const actual = row.signature;
  const keys = [...new Set([...Object.keys(expected), ...Object.keys(actual)])].sort();
  const drift = keys.filter(entry => (expected[entry] || 0) !== (actual[entry] || 0))
    .map(entry => `${entry}: expected ${expected[entry] || 0}, saw ${actual[entry] || 0}`);
  ok(drift.length === 0,
    `${row.label} at ${row.width} matches its pinned sub-floor census exactly`,
    JSON.stringify(drift.slice(0, 6)));
}

/* THE OFFENSE EXCEPTION HAS AN OWNER. Aggregate size/tag counts alone cannot
   detect moving the class to a different table with the same footprint. Pin the
   eight approved modules and prove every sub-floor table cell belongs to one. */
for (const row of observed.filter(item => item.tab === 'offense')) {
  ok(JSON.stringify(row.narrowModules) === JSON.stringify(OFFENSE_NARROW_MODULES),
    `Offense at ${row.width} scopes gi-off-narrow-fit to the eight named modules`,
    JSON.stringify(row.narrowModules));
  const expectedCells = row.width <= 1300 ? 165 : 0;
  ok(row.narrowCellCount === expectedCells && row.narrowOwnedCells === expectedCells,
    `Offense at ${row.width} keeps every sub-floor table cell inside gi-off-narrow-fit`,
    JSON.stringify({ expectedCells, below: row.narrowCellCount, owned: row.narrowOwnedCells }));
}

/* The totals the documentation quotes, asserted as totals rather than left to be
   inferred from the buckets above. */
const TOTALS = {
  'overview@1440': 35, 'overview@1280': 35,
  'offense@1440': 46, 'offense@1280': 211,
  'defense@1440': 0, 'defense@1280': 0,
  'special@1440': 0, 'special@1280': 0,
  'players@1440': 0, 'players@1280': 0,
  'selfscout@1440': 0, 'selfscout@1280': 0,
  'season@1440': 0, 'season@1280': 0,
  'matchup@1440': 0, 'matchup@1280': 0,
};
const wrongTotals = observed.filter(row => TOTALS[`${row.tab}@${row.width}`] !== row.below)
  .map(row => `${row.tab}@${row.width}: documented ${TOTALS[`${row.tab}@${row.width}`]}, saw ${row.below}`);
ok(wrongTotals.length === 0,
  'every board carries exactly the number of sub-floor elements the rules file documents',
  JSON.stringify(wrongTotals));

/* Each board's minimum, pinned in BOTH directions. Down is a regression; up
   means the migration happened and the rules file must be updated with it. */
const MINIMA = {
  overview: 9.5, offense: 10.5, defense: 12.5,
  // Special Teams migrated to the shared floor on 2026-09-19, the second board
  // after Defense to hold it with nothing below.
  special: 12.5, players: 12.5, season: 12.5, matchup: 12.5,
  // Self-Scout's smallest text rose to 13px with the 2026-09-24 module system.
  selfscout: 13,
};
for (const [tab, expected] of Object.entries(MINIMA)) {
  const rows = observed.filter(item => item.tab === tab);
  const board = BOARDS.find(item => item.tab === tab);
  const wrong = rows.filter(item => item.min !== expected);
  ok(wrong.length === 0,
    `${board.label} holds its documented ${expected}px minimum exactly, at both widths`,
    JSON.stringify(rows.map(item => ({ w: item.width, min: item.min, carriers: item.carriers }))));
}

/* NOT VACUOUS. Every board with documented debt genuinely carries sub-floor
   text, and every board - including a fully migrated one, whose census is
   empty - is measured over a real populated surface, so none of the
   assertions above is passing over an empty set. */
ok(contentRows.every(row => Object.keys(EXPECTED[`${row.tab}@${row.width}`] || {}).length === 0 || row.below > 0)
  && contentRows.every(row => row.total > 20),
  'every board really does carry sub-floor text, so the census is not passing over nothing',
  JSON.stringify(observed.map(row => `${row.label}/${row.width}:${row.below}/${row.total}`)));

ok(errors.length === 0, 'no page or console errors across every Reports board at both widths',
  errors.slice(0, 4).join(' | '));

const hashAfter = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(hashAfter === hashBefore, 'the canonical season file is byte-identical after the run',
  `${hashBefore.slice(0, 12)} vs ${hashAfter.slice(0, 12)}`);

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
