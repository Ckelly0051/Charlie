/** Reports > Defense: fixed-schema evidence on the canonical real season. */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync } from 'node:fs';

const SEASON_ID = '2025-st-joseph-mavericks-jv';
const SOURCE = `C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons/${SEASON_ID}/season.json`;
const OUT = 'artifacts/defense-production-realdata';
const VIEWPORTS = [[1440, 900], [1280, 800]];
const SECTIONS = [
  { label: 'Defensive performance', modules: ['Game-by-game', 'By down', 'By quarter'] },
  { label: 'Opponent Offense', modules: ['Production by play type', 'Formation faced', 'Personnel faced', 'Backfield faced', 'Attack direction'] },
  { label: 'Scheme', modules: ['Top Calls', 'Worst Calls', 'Blitz vs No Blitz', 'Pressure by situation'] },
  { label: 'Situational results', modules: ['Down & distance', 'Field zone', 'By hash', 'Motion'] },
];
const ROWS = {
  'Game-by-game': 6, 'By down': 4, 'By quarter': 4,
  'Production by play type': 7, 'Formation faced': 6,
  'Personnel faced': 5, 'Backfield faced': 5,
  'Top Calls': 4, 'Worst Calls': 4, 'Pressure by situation': 6,
  'Down & distance': 12, 'Field zone': 5, 'By hash': 5, Motion: 5,
};

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`); }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

if (!existsSync(SOURCE)) throw new Error(`Canonical Reports season missing: ${SOURCE}`);
const raw = readFileSync(SOURCE);
const before = createHash('sha256').update(raw).digest('hex');
const season = JSON.parse(raw.toString('utf8'));
const games = season.games || [];
mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({ args: ['--no-sandbox'], protocolTimeout: 240000 });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.evaluate(data => {
  const store = window.app.storage.seasonStore;
  store.data = store._normalize(JSON.parse(JSON.stringify(data)));
  store.currentSeasonId = data.id;
  store.data.id = data.id;
}, season);

const observations = [];
for (const game of games) {
  await page.evaluate(async gameId => {
    const app = window.app;
    app.storage.seasonStore.data.activeGameId = gameId;
    await app.storage._loadActiveGame();
    app.reportsScreen.defenseScope = 'game';
    app.workspaceShell.show('reports');
    app.reportsScreen.selectTab('defense');
  }, game.id);
  await sleep(500);

  for (const [width, height] of VIEWPORTS) {
    await page.setViewport({ width, height });
    await sleep(250);
    for (const section of SECTIONS) {
      await page.evaluate(label => {
        [...document.querySelectorAll('.gi-def-secnav-item')]
          .find(button => button.textContent.includes(label))?.click();
      }, section.label);
      await sleep(100);
      const result = await page.evaluate(() => {
        const board = document.querySelector('.gi-defense-board');
        const text = node => (node?.textContent || '').replace(/\s+/g, ' ').trim();
        const title = module => text(module.querySelector('header strong'));
        const modules = [...(board?.querySelectorAll('.gi-overview-module') || [])];
        const clipped = [];
        modules.forEach(module => module.querySelectorAll('th,td,strong,small').forEach(cell => {
          if (!cell.closest('.gi-def-pop') && !cell.querySelector('.gi-def-pop')
            && getComputedStyle(cell).visibility !== 'hidden'
            && (cell.scrollWidth > cell.clientWidth + 1 || cell.scrollHeight > cell.clientHeight + 1)) {
            clipped.push(`${title(module)}:${text(cell).slice(0, 24)}`);
          }
        }));
        return {
          route: document.querySelector('.gi-reports-tab.active')?.dataset.reportTab,
          active: text(board?.querySelector('.gi-def-secnav-item.is-active')).replace(/^\d/, '').trim(),
          titles: modules.map(title),
          rows: Object.fromEntries(modules.map(module => [title(module), module.querySelectorAll('tbody tr').length])),
          held: modules.reduce((count, module) => count + module.querySelectorAll('tr.is-absent').length, 0),
          height: Math.round(board?.getBoundingClientRect().height || 0),
          boardWidth: Math.round(board?.getBoundingClientRect().width || 0),
          meta: [...(board?.querySelectorAll('.gi-overview-module>header span') || [])]
            .filter(node => getComputedStyle(node).display !== 'none' && text(node)).length,
          sectionProse: board?.querySelectorAll('.gi-def-secrule p').length || 0,
          tabs: [...(board?.querySelectorAll('.gi-def-secnav-item') || [])].map(node => text(node).replace(/^\d/, '').trim()),
          overflowX: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          clipped,
          contentOverflow: modules.filter(module => module.scrollHeight > module.clientHeight + 1).map(title),
        };
      });
      observations.push({ game: game.name, width, section: section.label, ...result });
    }
  }
}

console.log('\n== Defense fixed-schema real-data gate ==');
ok(games.length === 6 && games.reduce((sum, game) => sum + (game.plays || []).length, 0) > 0,
  'the canonical six-game season is loaded with charted plays');
ok(observations.every(item => item.route === 'defense' && item.boardWidth > 900),
  'Defense is rendered and visible before geometry is measured');
ok(observations.every(item => JSON.stringify(item.tabs) === JSON.stringify(SECTIONS.map(section => section.label))),
  'the four approved useful sections render and the rejected duplicate Self-Scout does not');
const wrongModules = observations.filter(item => {
  const expected = SECTIONS.find(section => section.label === item.section)?.modules || [];
  return JSON.stringify(item.titles) !== JSON.stringify(expected);
});
ok(wrongModules.length === 0, 'every section renders its fixed module inventory', JSON.stringify(wrongModules.slice(0, 3)));
const wrongRows = observations.flatMap(item => Object.entries(ROWS)
  .filter(([name]) => item.titles.includes(name))
  .filter(([name, expected]) => item.rows[name] !== expected)
  .map(([name, expected]) => `${item.game} ${item.width} ${item.section} ${name}:${item.rows[name]}!=${expected}`));
ok(wrongRows.length === 0, 'every table renders exactly its declared allocation', JSON.stringify(wrongRows.slice(0, 6)));
for (const [width] of VIEWPORTS) for (const section of SECTIONS) {
  const rows = observations.filter(item => item.width === width && item.section === section.label);
  const heights = [...new Set(rows.map(item => item.height))];
  ok(heights.length === 1, `${section.label} is one height across all six games at ${width}`,
    JSON.stringify(rows.map(item => ({ game: item.game, height: item.height }))));
}
ok(observations.every(item => item.meta === 0 && item.sectionProse === 0),
  'Defense renders no module or section explainer prose');
ok(observations.some(item => item.held > 0), 'sparse real games hold unfilled slots with dashes');
ok(observations.every(item => item.overflowX === 0), 'no page-level horizontal overflow at either release width');
ok(observations.every(item => item.clipped.length === 0), 'no Defense label or value is clipped',
  JSON.stringify(observations.filter(item => item.clipped.length).slice(0, 4)));
ok(observations.every(item => item.contentOverflow.length === 0), 'every module remains inside its fixed panel',
  JSON.stringify(observations.filter(item => item.contentOverflow.length).slice(0, 4)));
ok(errors.length === 0, 'the real Defense route raises no page or console errors', errors.slice(0, 3).join(' | '));

/* Review captures use the richer full-season cohort and the canonical active game. */
await page.setViewport({ width: 1440, height: 900 });
await page.evaluate(async gameId => {
  const app = window.app;
  app.storage.seasonStore.data.activeGameId = gameId;
  await app.storage._loadActiveGame();
  app.reportsScreen.defenseScope = 'season';
  app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('defense');
}, season.activeGameId || games[0].id);
await sleep(500);
const canonical = await page.evaluate(() => {
  const app = window.app;
  const { scoped, labels } = app.reportsScreen._defenseCohort();
  const model = app.stats.defenseDashboard(scoped, labels);
  return {
    total: model.total, yards: model.summary.yards, rush: model.summary.runYards,
    pass: model.summary.passYards, ypp: model.summary.ypp, turnovers: model.summary.turnovers,
    explosives: model.summary.explosives,
    third: model.thirdDownAllowed, fourth: model.fourthDownAllowed,
    dd: model.downDistance.map(row => row.name),
    emptyDd: model.downDistance.filter(row => !row.n).map(row => row.name),
    calls: model.topCalls.map(row => `${row.name}:${row.n}`),
    firstLongCallPct: model.downDistance.find(row => row.name === '1st & 7+')?.callPct,
  };
});
ok(canonical.total === 174 && canonical.yards === 497 && canonical.rush === 271 && canonical.pass === 226
  && canonical.ypp === 2.9 && canonical.turnovers === 2 && canonical.explosives === 7,
  'the canonical season owns the approved Defense KPI values', JSON.stringify(canonical));
ok(canonical.third.made === 8 && canonical.third.attempts === 43 && canonical.third.rate === 18.6
  && canonical.fourth.made === 9 && canonical.fourth.attempts === 17 && canonical.fourth.rate === 52.9,
  'third- and fourth-down allowed use offensive conversion polarity', JSON.stringify(canonical));
ok(JSON.stringify(canonical.dd) === JSON.stringify([
  '1st & 1-3', '1st & 4-6', '1st & 7+', '2nd & 1-3', '2nd & 4-6', '2nd & 7+',
  '3rd & 1-3', '3rd & 4-6', '3rd & 7+', '4th & 1-3', '4th & 4-6', '4th & 7+',
]) && canonical.emptyDd.includes('1st & 4-6'),
  'all 12 down-and-distance rows remain in football order, including the empty cohort', JSON.stringify(canonical.dd));
ok(JSON.stringify(canonical.calls) === JSON.stringify([
  'Maverick + Jumbo Shift | Cover 3 | A-Gap:4',
  'Maverick | Cover 3:109',
  'Maverick + Jumbo Shift | Cover 3:28',
]) && canonical.firstLongCallPct === 72,
  'call performance uses classified snaps while situational call share uses every charted call', JSON.stringify(canonical.calls));
for (let index = 0; index < SECTIONS.length; index++) {
  await page.evaluate(label => {
    [...document.querySelectorAll('.gi-def-secnav-item')]
      .find(button => button.textContent.includes(label))?.click();
    document.querySelector('.gi-reports-scroll')?.scrollTo(0, 0);
    document.querySelectorAll('.gi-toast-stack .gi-native-toast').forEach(node => node.remove());
  }, SECTIONS[index].label);
  await sleep(150);
  await page.screenshot({ path: `${OUT}/1440-section-${index + 1}.png` });
  const fullHeight = await page.evaluate(() => {
    const board = document.querySelector('.gi-defense-board');
    return Math.max(900, Math.ceil((board?.getBoundingClientRect().bottom || 880) + 16));
  });
  await page.setViewport({ width: 1440, height: Math.min(fullHeight, 1600) });
  await sleep(100);
  await page.screenshot({ path: `${OUT}/1440-section-${index + 1}-full.png` });
  await page.setViewport({ width: 1440, height: 900 });
}

const after = createHash('sha256').update(readFileSync(SOURCE)).digest('hex');
ok(after === before, 'the canonical season file remains byte-identical');
await browser.close();

console.log(`\nCaptures: ${OUT}`);
console.log(`== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
