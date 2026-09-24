/**
 * THE DEFENSE MODULE SYSTEM ON THE REMAINING REPORTS (coach direction,
 * 1.12.0-97 smoke S97-1, 2026-09-24).
 *
 * Offense and Special Teams are pinned in their own harnesses (§14b, §9c).
 * This one walks every section of Players, Self-Scout, Matchup and Season on
 * the canonical 2025 JV season (read-only copy, hash-checked) at 1440 and 1280
 * and pins the one system the coach chose:
 *   - a numbered page heading (the section's name, its cohort) first on the page;
 *   - every module an outlined box with a 50px title bar: a 2px rule in the
 *     board or module accent over a 17px sentence-case title in the body face;
 *   - modules on 20px gutters, never shared 1px rules;
 *   - no uppercase micro-header anywhere on the board;
 *   - no page-level horizontal overflow.
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';

const SOURCE = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json';
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

/* Each board: its tab, its board class, the secondary-bar attribute that
   selects a section, and each section's id and heading title. */
const BOARDS = [
  { tab: 'players', board: '.gi-players-board', attr: 'data-section',
    sections: [['all', 'All roles'], ['off', 'Offense'], ['def', 'Defense'], ['st', 'Special Teams']] },
  { tab: 'selfscout', board: '.gi-selfscout-board', attr: 'data-section',
    sections: [['summary', 'Offensive Summary'], ['offense', 'Calls & Situations'], ['structure', 'Structure'], ['defense', 'Defense'], ['tendencies', 'Tendencies']] },
  /* Matchup builds its sections from its own components; the module is the
     section and its title row is the title bar. */
  { tab: 'matchup', board: '.gi-matchup-board', attr: 'data-section', module: '.gi-mu-section', head: '.gi-mu-title', title: 'h2',
    sections: [['our-offense', 'Our Offense vs Their Defense'], ['our-defense', 'Our Defense vs Their Offense']] },
];

if (!existsSync(SOURCE)) {
  ok(process.env.GIQ_REALDATA_OPTIONAL === '1', `canonical season present at ${SOURCE}`);
  console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
  process.exit(fail ? 1 : 0);
}
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const game = season.games.find(g => /St\. Peter Lutheran/i.test(g.gameInfo?.opponent || ''));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.evaluate(async (data, gid) => {
  const app = window.app, store = app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id; store.data.id = data.id; store.data.activeGameId = gid;
  await app.storage._loadActiveGame(); app.workspaceShell.show('reports');
}, season, game.id);
await sleep(600);
console.log(`  ${season.seasonName}: ${season.games.length} games; St. Peter Lutheran current game; read-only copy`);

const measure = (boardSel, number, title, parts) => page.evaluate((sel, n, t, { moduleSel, headSel, titleSel }) => {
  const board = document.querySelector(`[data-native-report-content] ${sel}`);
  if (!board) return { missing: true };
  const heading = board.querySelector('.gi-report-heading');
  const firstShown = [...board.querySelectorAll('*')].find(el => el.getClientRects().length
    && !el.closest('.gi-secbar') && (el.matches('.gi-report-heading') || el.matches(`${moduleSel}, .gi-overview-kpis, table`)));
  const accentOf = el => getComputedStyle(el).getPropertyValue('--mod-accent').trim();
  const bad = [];
  const mods = [...board.querySelectorAll(moduleSel)].filter(m => m.getClientRects().length);
  for (const m of mods) {
    const head = m.querySelector(`:scope > ${headSel}`);
    const name = (head?.querySelector(titleSel)?.textContent || '?').trim();
    if (!head) { bad.push(`${name}: no title bar`); continue; }
    const cs = getComputedStyle(m), hs = getComputedStyle(head), ts = getComputedStyle(head.querySelector(titleSel));
    if (parseFloat(cs.borderTopWidth) < 1 || parseFloat(cs.borderLeftWidth) < 1 || parseFloat(cs.borderRightWidth) < 1) bad.push(`${name}: no outline`);
    if (getComputedStyle(m, '::before').display !== 'none' && getComputedStyle(m, '::before').content !== 'none') bad.push(`${name}: accent rail`);
    if (Math.round(head.getBoundingClientRect().height) !== 50 || hs.borderTopWidth !== '2px' || !accentOf(m)) bad.push(`${name}: title bar`);
    if (parseFloat(ts.fontSize) < 17 || ts.textTransform !== 'none' || /Condensed/i.test(ts.fontFamily)) bad.push(`${name}: title type`);
  }
  const upper = [...board.querySelectorAll('*')].filter(el => el.getClientRects().length
    && [...el.childNodes].some(x => x.nodeType === 3 && x.textContent.trim())
    && getComputedStyle(el).textTransform === 'uppercase').map(el => el.textContent.trim().slice(0, 24));
  return {
    heading: heading && { n: heading.querySelector('span')?.textContent, title: heading.querySelector('h2')?.textContent,
      first: firstShown === heading, expectedN: String(n).padStart(2, '0'), expectedTitle: t },
    modules: mods.length, bad, upper,
    ovX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
  };
}, boardSel, number, title, parts);

for (const [width, height] of [[1440, 900], [1280, 800]]) {
  await page.setViewport({ width, height });
  await sleep(250);
  for (const board of BOARDS) {
    console.log(`\n== ${board.tab} at ${width} ==`);
    await page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`).click(), board.tab);
    await sleep(400);
    const seen = [];
    for (const [index, [id, title]] of board.sections.entries()) {
      await page.evaluate((a, s) => document.querySelector(`[data-reports-secbar] [${a}="${s}"]`)?.click(), board.attr, id);
      await sleep(250);
      seen.push({ id, ...(await measure(board.board, index + 1, title,
        { moduleSel: board.module || '.gi-overview-module', headSel: board.head || 'header', titleSel: board.title || 'strong' })) });
    }
    ok(seen.every(s => !s.missing && s.heading && s.heading.first && s.heading.n === s.heading.expectedN && s.heading.title === s.heading.expectedTitle),
      `${board.tab} @${width}: every section opens on its numbered heading and name`,
      JSON.stringify(seen.map(s => ({ id: s.id, heading: s.heading, missing: s.missing }))));
    ok(seen.every(s => s.modules > 0 && s.bad.length === 0),
      `${board.tab} @${width}: every module is an outlined box with the 50px title bar and a 17px sentence-case title`,
      JSON.stringify(seen.flatMap(s => s.bad).slice(0, 8)));
    ok(seen.every(s => s.upper.length === 0),
      `${board.tab} @${width}: no label renders as an uppercase micro-header`,
      JSON.stringify(seen.flatMap(s => s.upper).slice(0, 8)));
    ok(seen.every(s => s.ovX <= 0), `${board.tab} @${width}: no page-level horizontal overflow`,
      JSON.stringify(seen.map(s => ({ id: s.id, ovX: s.ovX }))));
  }
}

ok(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
ok(createHash('sha256').update(readFileSync(SOURCE)).digest('hex') === before, 'the canonical season file is byte-identical after the run');
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
