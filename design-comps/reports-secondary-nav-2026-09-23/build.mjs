/* Builds the Reports secondary-navigation comp captures (2026-09-23).
 *
 *   npm run build && node design-comps/reports-secondary-nav-2026-09-23/build.mjs
 *
 * Loads the PRODUCTION build with a read-only, hash-checked in-memory copy of
 * the canonical `2025-st-joseph-mavericks-jv` season, opens Week 1 vs St. Peter
 * Lutheran, captures current production for reference, then applies this
 * comp's presentation layer (comp.css + comp.js) and captures every proposed
 * view. Focused checks: the global strip's tab boxes are identical with and
 * without the layer, every Offense/Defense module lands in exactly one page,
 * and the canonical season file is unchanged. Nothing is written to app data.
 */
import { APP_URL } from '../../tools/app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT = resolve(HERE, 'captures');
const SOURCE = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/2025-st-joseph-mavericks-jv/season.json';
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const game = season.games.find(g => /St\. Peter Lutheran/i.test(g.gameInfo?.opponent || ''));
mkdirSync(OUT, { recursive: true });

let pass = 0, fail = 0;
const ok = (c, label, detail = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));

async function boot(width, height) {
  await page.setViewport({ width, height });
  await page.goto(APP_URL, { waitUntil: 'networkidle0' });
  await sleep(500);
  await page.evaluate(async (data, id) => {
    const app = window.app, store = app.storage.seasonStore;
    store.data = store._normalize(JSON.parse(JSON.stringify(data)));
    store.currentSeasonId = data.id; store.data.id = data.id; store.data.activeGameId = id;
    await app.storage._loadActiveGame();
    app.roster.players = JSON.parse(JSON.stringify(data.roster || []));
    app.workspaceShell.show('reports');
  }, season, game.id);
  await sleep(400);
}
const quiet = () => page.evaluate(() => document.querySelectorAll('.gi-native-toast').forEach(n => n.remove()));
async function go(tab) {
  await page.evaluate(t => document.querySelector(`[data-report-tab="${t}"]`).click(), tab);
  await sleep(350);
}
async function inject() {
  await page.addStyleTag({ path: resolve(HERE, 'comp.css') });
  await page.addScriptTag({ path: resolve(HERE, 'comp.js') });
  await sleep(150);
}
async function shot(name) {
  await quiet();
  await page.evaluate(() => document.querySelector('.ws-reports')?.scrollTo(0, 0));
  await sleep(120);
  await page.screenshot({ path: `${OUT}/${name}.png` });
  console.log(`  CAPTURED ${name}.png`);
}
const tabBoxes = () => page.evaluate(() => [...document.querySelectorAll('[data-report-tab]')]
  .map(b => { const r = b.getBoundingClientRect(); return [r.x, r.y, r.width, r.height].map(Math.round).join(','); }).join(' '));

/* ── 1440: current production, for reference ─────────────────────────── */
await boot(1440, 900);
const stripBefore = {};
for (const tab of ['overview', 'offense', 'defense', 'players']) { await go(tab); stripBefore[tab] = await tabBoxes(); await shot(`current-1440-${tab}`); }

/* ── 1440: the proposal ──────────────────────────────────────────────── */
await inject();
const views = [
  ['overview', null], ['offense', 0], ['offense', 1], ['offense', 2], ['offense', 3], ['offense', 4], ['offense', 5],
  ['defense', 0], ['defense', 1], ['defense', 2], ['defense', 3],
  ['special', 0], ['special', 1], ['players', 0], ['players', 2], ['selfscout', 0], ['matchup', 0], ['season', 0],
];
for (const [tab, index] of views) {
  await go(tab);
  await page.evaluate(() => window.__cmp.apply());
  if (index != null) await page.evaluate((t, i) => window.__cmp.section(t, i), tab, index);
  await sleep(250);
  if (index === 0 || index == null) {
    const now = await tabBoxes();
    if (stripBefore[tab]) ok(now === stripBefore[tab], `1440 ${tab}: global strip tab boxes unchanged by the proposal`, `${now} vs ${stripBefore[tab]}`);
  }
  await shot(`proposal-1440-${tab}${index == null ? '' : `-${index + 1}`}`);
}
for (const [tab] of [['offense'], ['defense']]) {
  await go(tab);
  await page.evaluate(t => window.__cmp.section(t, 0), tab);
  await page.evaluate(() => window.__cmp.annotate(true));
  await shot(`proposal-1440-${tab}-annotated`);
  await page.evaluate(() => window.__cmp.annotate(false));
}
await go('special');
await page.evaluate(() => window.__cmp.section('special', 0));
await page.evaluate(() => window.__cmp.annotate(true));
await shot('proposal-1440-special-annotated');
await page.evaluate(() => window.__cmp.annotate(false));

/* Every child of the flat board except the retired jump nav and the proposal
   module: bands, KPI strips and headings alike. */
for (const [tab, count, sel] of [['offense', 6, '.gi-offense-board > *:not(.gi-zone-nav):not(.gi-zone-rule):not(.cmp-dd)'], ['defense', 4, '.gi-def2-body > *:not(.cmp-dd)']]) {
  await go(tab);
  const seen = [];
  for (let i = 0; i < count; i++) {
    await page.evaluate((t, n) => window.__cmp.section(t, n), tab, i);
    await sleep(120);
    seen.push(await page.evaluate(s => [...document.querySelectorAll(s)].map((n, k) => (n.offsetParent || n.getClientRects().length) ? k : -1).filter(k => k >= 0), sel));
  }
  const total = await page.evaluate(s => document.querySelectorAll(s).length, sel);
  const flat = seen.flat();
  ok(total > 0 && new Set(flat).size === total && flat.length === total,
    `${tab}: all ${total} existing board blocks appear, each on exactly one of ${count} pages`, JSON.stringify(seen));
  ok(seen.every(list => list.length > 0), `${tab}: no page is empty`, JSON.stringify(seen.map(list => list.length)));
}

/* ── Narrower viewports ──────────────────────────────────────────────── */
for (const [w, h, list] of [[1280, 800, [['overview', null], ['offense', 0], ['special', 0], ['players', 0]]],
  [768, 1024, [['overview', null], ['offense', 3], ['defense', 0], ['players', 0]]]]) {
  await boot(w, h);
  await inject();
  for (const [tab, index] of list) {
    await go(tab);
    await page.evaluate(() => window.__cmp.apply());
    if (index != null) await page.evaluate((t, i) => window.__cmp.section(t, i), tab, index);
    await sleep(250);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    ok(overflow <= 0, `${w}: ${tab} has no page-level horizontal overflow`, String(overflow));
    await shot(`proposal-${w}-${tab}${index == null ? '' : `-${index + 1}`}`);
  }
}

ok(errors.length === 0, 'no console or page errors', errors.slice(0, 3).join(' | '));
ok(createHash('sha256').update(readFileSync(SOURCE)).digest('hex') === before, 'canonical season file unchanged');
await browser.close();
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
