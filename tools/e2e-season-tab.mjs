import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0;
let fail = 0;
const ok = (condition, label, detail = '') => {
  if (condition) {
    pass++;
    console.log(`  PASS  ${label}`);
  } else {
    fail++;
    console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`);
  }
};
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
await page.evaluateOnNewDocument(() => localStorage.setItem('ffa_workspace_shell_v2', '1'));
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => {
  if (message.type() === 'error') errors.push(message.text());
});
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await sleep(400);

console.log('\n== Native Season report contract ==');
await page.evaluate(async () => {
  const app = window.app;
  await app.storage.createSeason({ name: '2026 Season QA', team: 'Mavericks', year: '2026', level: 'Varsity' });
  const play = (id, unit, tags = {}) => ({
    id,
    timestamp: { start: id * 10, end: id * 10 + 5 },
    tags: { unit, custom: [], players: {}, grades: {}, ...tags },
    notes: '',
    analysis: null,
  });
  app.storage.seasonStore.data.games = [
    {
      id: 'g-one', name: 'Week 1 vs Wildcats', nextId: 4,
      gameInfo: { opponent: 'Wildcats', perspective: 'self', scoreUs: 21, scoreThem: 14 },
      plays: [
        play(1, 'offense', { runPass: 'Run', playType: 'Run Inside', formation: 'Ace', result: 'Gain', yardage: '6', down: '1', distance: '10', players: { ballCarrier: '22' } }),
        play(2, 'defense', { runPass: 'Pass', playType: 'Deep Pass', result: 'Incomplete', yardage: '0', down: '3', distance: '8', defFront: '4-2-5', coverage: 'Cover 3', players: { tackler: '44' } }),
        play(3, 'special', { stType: 'Kickoff', kickOutcome: 'Returned', kickDistance: '55', returnYards: '18' }),
      ],
    },
    {
      id: 'g-two', name: 'Week 2 vs Knights', nextId: 4,
      gameInfo: { opponent: 'Knights', perspective: 'self', scoreUs: 7, scoreThem: 10 },
      plays: [
        play(1, 'offense', { runPass: 'Pass', playType: 'Short Pass', formation: 'Trips', result: 'Gain', yardage: '9', down: '2', distance: '7', players: { passer: '7', receiver: '2' } }),
        play(2, 'defense', { runPass: 'Run', playType: 'Run Outside', result: 'Loss', yardage: '-2', down: '2', distance: '5', defFront: '3-3-5', coverage: 'Cover 1', players: { tackler: '44' } }),
        play(3, 'special', { stType: 'Punt', kickOutcome: 'Returned', kickDistance: '42', returnYards: '6' }),
      ],
    },
  ];
  app.storage.seasonStore.data.activeGameId = 'g-one';
  app.storage._loadActiveGame();
  await app.workspaceShell.show('reports');
  app.reportsScreen.selectTab('season');
});
await sleep(250);

let result = await page.evaluate(() => {
  const app = window.app;
  const model = app.season.reportModel();
  const pane = document.querySelector('#wsReports [data-native-report-content]');
  return {
    summary: model.summary,
    plays: model.allPlays.length,
    perGame: model.perGame.map(row => row.name),
    refs: model.allPlays.map(play => app.stats.constructor._compositeRef(play)).filter(Boolean).sort(),
    text: pane?.textContent || '',
    native: !!pane?.querySelector('.gi-season-native'),
    tabs: [...(pane?.querySelectorAll('[data-subtab]') || [])].map(node => node.dataset.subtab),
    legacyAbsent: typeof app.season.statsHtml === 'undefined'
      && typeof app.stats._renderSeason === 'undefined'
      && typeof app.stats._renderIndividualStats === 'undefined',
  };
});
ok(result.native && result.legacyAbsent,
  'Season is native Preact with no legacy presentation fallback', JSON.stringify(result));
ok(result.summary.record === '1-1' && result.summary.games === 2
  && result.summary.pointsFor === 28 && result.summary.pointsAgainst === 24,
  'Season summary uses the canonical two-game model', JSON.stringify(result.summary));
ok(result.plays === 6 && result.perGame.join('|') === 'vs Wildcats|Week 2 vs Knights',
  'Season aggregates every game in chronological order', JSON.stringify(result));
ok(result.refs.join('|') === 'g-one::1|g-one::2|g-one::3|g-two::1|g-two::2|g-two::3',
  'Season film identity is composite and cannot collide across games', JSON.stringify(result.refs));
ok(result.text.includes('Season Report') && result.text.includes('vs Wildcats')
  && result.text.includes('Week 2 vs Knights'),
  'Native Season overview renders the canonical season content', result.text.slice(0, 300));
ok(result.tabs.join(',') === 'overview,offense,defense,special,players,scout,trends',
  'Season exposes all seven native report views', JSON.stringify(result.tabs));

result = await page.evaluate(async () => {
  const pane = document.querySelector('#wsReports [data-native-report-content]');
  const labels = {};
  for (const id of ['offense', 'defense', 'special', 'players', 'scout', 'trends']) {
    pane.querySelector(`[data-subtab="${id}"]`).click();
    await new Promise(resolve => setTimeout(resolve, 40));
    labels[id] = pane.querySelector(`[data-subpane="${id}"]`)?.textContent.trim().length || 0;
  }
  return labels;
});
ok(Object.values(result).every(length => length > 0),
  'Every Season subview renders through the native component tree', JSON.stringify(result));

result = await page.evaluate(() => {
  const app = window.app;
  let saved = null;
  const original = window.ffaSaveBlob;
  window.ffaSaveBlob = (blob, name) => { saved = { blob, name }; };
  const before = JSON.stringify(app.storage.seasonStore.data);
  const exported = app.season.exportHtml();
  const after = JSON.stringify(app.storage.seasonStore.data);
  window.ffaSaveBlob = original;
  return { exported, name: saved?.name || '', type: saved?.blob?.type || '', unchanged: before === after };
});
ok(result.exported && result.name.startsWith('season_report_') && result.type === 'text/html' && result.unchanged,
  'Season HTML export shares the structured model and is read-only', JSON.stringify(result));

ok(errors.length === 0, 'Season route produces no page or console errors', errors.join('\n'));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail || errors.length ? 1 : 0);
