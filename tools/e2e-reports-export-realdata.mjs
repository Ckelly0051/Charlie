/** Canonical-data visual and print contract for the shared HTML exporter. */
import { APP_URL } from './app-entry.mjs';
import puppeteer from './test-browser.mjs';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { CANONICAL_SEASON } from './canonical-season.mjs';

const SOURCE = CANONICAL_SEASON;
const SCREENSHOTS = process.env.GIQ_REPORTS_EXPORT_REALDATA_SCREENSHOTS || '';
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};

if (!existsSync(SOURCE)) {
  console.log('SKIP: canonical 2025 JV season is unavailable');
  process.exit(0);
}
const raw = readFileSync(SOURCE);
const sourceHash = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
// Old-format Special Teams values were blanked on 2026-09-26; the coach retags them.
const FIXTURE_HAS_ST = season.games.some(g => (g.plays || []).some(p => p.specialTeams));
const playCount = (season.games || []).reduce((sum, game) => sum + (game.plays || []).length, 0);
if (season.id !== '2025-st-joseph-mavericks-jv' || season.games?.length !== 6 || playCount !== 449) {
  throw new Error(`Unexpected canonical cohort: ${season.id}, ${season.games?.length}, ${playCount}`);
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const appPage = await browser.newPage();
const errors = [];
appPage.on('pageerror', error => errors.push(error.message));
appPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await appPage.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await appPage.goto(APP_URL, { waitUntil: 'networkidle0' });
await appPage.evaluate(async data => {
  const app = window.app;
  const store = app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
  const game = store.data.games.find(row => /OL Lakes/.test(row.name)) || store.data.games[0];
  store.data.activeGameId = game.id;
  await app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
}, season);

const captures = await appPage.evaluate(async () => {
  const app = window.app;
  const saved = [];
  const pending = [];
  const original = window.ffaSaveBlob;
  window.ffaSaveBlob = (blob, name) => pending.push(blob.text().then(html => saved.push({ name, html })));
  try {
    app.storage.exportHtmlReport(app.stats);
    app.season.exportHtml();
    app.reportsScreen.selectTab('special');
    const { scoped } = app.reportsScreen._specialTeamsCohort();
    const stats = app.stats.compute(scoped);
    const summary = app.stats._specialTeamsSummary(scoped, stats);
    app.reportsScreen.exportSpecialTeams(stats, summary);
    await Promise.all(pending);
  } finally {
    window.ffaSaveBlob = original;
  }
  return saved;
});

const game = captures.find(item => /_report\.html$/.test(item.name) && !/^(season|special_teams)_report_/.test(item.name));
const seasonReport = captures.find(item => /^season_report_/.test(item.name));
const special = captures.find(item => /^special_teams_report_/.test(item.name));
ok(!!game && !!seasonReport && !!special, 'canonical game, season and Special Teams exports are produced', JSON.stringify(captures.map(item => item.name)));

const exportPage = await browser.newPage();
exportPage.on('pageerror', error => errors.push(error.message));
exportPage.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await exportPage.setViewport({ width: 1056, height: 816 });
if (SCREENSHOTS) mkdirSync(SCREENSHOTS, { recursive: true });

for (const [name, item, charts] of [['game', game, true], ['season', seasonReport, true], ['special-teams', special, false]]) {
  if (!item) continue;
  await exportPage.emulateMediaType('screen');
  await exportPage.setContent(item.html, { waitUntil: 'domcontentloaded' });
  const screen = await exportPage.evaluate(() => ({
    charts: document.querySelectorAll('.export-chart').length,
    svgs: document.querySelectorAll('.export-chart svg').length,
    histogram: !!document.querySelector('.export-chart.is-histogram svg'),
    scatter: !!document.querySelector('.export-chart.is-scatter svg'),
    zones: !!document.querySelector('.export-chart.is-zones .gi-zones'),
    downs: !!document.querySelector('.export-chart.is-downs .gi-multiples'),
    epaCurve: !!document.querySelector('.export-chart.is-epa .export-epa svg'),
    epaBars: document.querySelectorAll('.export-chart.is-epa .export-epa-bars > div').length,
    overflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
    white: getComputedStyle(document.body).backgroundColor,
  }));
  ok(screen.white === 'rgb(255, 255, 255)' && screen.overflow <= 0,
    `${name} export fits a letter-landscape-width white canvas`, JSON.stringify(screen));
  if (charts) ok(screen.charts === 5 && screen.svgs === 3
      && screen.histogram && screen.scatter && screen.zones && screen.downs
      && screen.epaCurve && screen.epaBars > 0,
    `${name} export carries the canonical Offense chart layer`, JSON.stringify(screen));
  /* The canonical fixture's old-format Special Teams values were blanked on
     2026-09-26 (the coach retags them), so its Special Teams export has no
     performance chapter until then; this comes back into force by itself. */
  if (name === 'special-teams' && FIXTURE_HAS_ST) {
    const structure = await exportPage.evaluate(() => {
      const chapter = [...document.querySelectorAll('.chapter')]
        .find(node => node.querySelector('h1')?.textContent === 'Special Teams Performance');
      const units = chapter?.querySelector('.report-section h2')?.textContent || '';
      return { chapter: !!chapter, units, leadingUnits: !!document.querySelector('main.page > .report-section'),
        breakBefore: chapter ? getComputedStyle(chapter).breakBefore : '' };
    });
    ok(structure.chapter && structure.units === 'Units' && !structure.leadingUnits,
      'Special Teams keeps its unit ledger inside its performance chapter', JSON.stringify(structure));
  }
  if (SCREENSHOTS) await exportPage.screenshot({ path: join(SCREENSHOTS, `${name}-export.png`), fullPage: true });
  await exportPage.emulateMediaType('print');
  const pdf = await exportPage.pdf({ format: 'letter', landscape: true, printBackground: true, preferCSSPageSize: true });
  const pageCount = (Buffer.from(pdf).toString('latin1').match(/\/Type\s*\/Page\b/g) || []).length;
  ok(pageCount > 0 && pageCount < 40, `${name} export produces bounded paginated PDF output`, String(pageCount));
}

const finalHash = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(finalHash === sourceHash, 'canonical season bytes remain unchanged');
ok(errors.length === 0, 'canonical export rendering produces no page or console errors', errors.join('\n'));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
