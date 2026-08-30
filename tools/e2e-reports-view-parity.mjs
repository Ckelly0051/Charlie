// REPORTS DATA-CONTRACT PARITY
//
// Native Reports is the only live presentation. This harness proves the four
// primary report surfaces display values from one canonical StatsEngine
// computation, while the retired HTML-string renderers stay physically absent.
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

let pass = 0, fail = 0;
function ok(cond, label, evidence) {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}`); if (evidence !== undefined) console.log('        ' + JSON.stringify(evidence)); }
}

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(String(error?.message || error)));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.reportsScreen, { timeout: 15000 });

const result = await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  const play = (id, over) => ({ id, timestamp: { start: id, end: id + 5 }, tags: {
    unit: 'offense', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4',
    down: '1', distance: '10', formation: 'Trips', quarter: 'Q1', hash: 'Middle',
    players: {}, grades: {}, ...over,
  } });
  store.data = store._normalize({
    seasonName: 'Parity Fixture', activeGameId: 'g1', games: [{
      id: 'g1', name: 'Week 1', gameInfo: { opponent: 'Fixture Opp', scoreUs: '21', scoreThem: '14' },
      roster: [{ num: '22', name: 'Runner' }, { num: '7', name: 'Quarterback' }, { num: '1', name: 'Receiver' }, { num: '55', name: 'Linebacker' }],
      plays: [
        play(1, { players: { ballCarrier: '22' } }),
        play(2, { playType: 'Deep Pass', runPass: 'Pass', result: 'Incomplete', yardage: '0', down: '2' }),
        play(3, { playType: 'Short Pass', runPass: 'Pass', result: 'Touchdown', yardage: '18', down: '3', distance: '4', formation: 'Ace', players: { passer: '7', receiver: '1' } }),
        play(4, { unit: 'defense', playType: 'Run Inside', runPass: 'Run', result: 'Loss', yardage: '-3', defFront: 'Nickel', coverage: 'Cover 3', players: { tackler: '55' } }),
        play(5, { unit: 'defense', playType: 'Short Pass', runPass: 'Pass', result: 'Sack', yardage: '-7', defFront: 'Nickel', coverage: 'Cover 1', players: { tackler: '55' } }),
        play(6, { playType: 'Run Outside', result: 'Fumble', yardage: '-1' }),
      ],
    }],
  });
  store.currentSeasonId = 'parity';
  // Hydrate through the real season-open lifecycle hook rather than calling
  // the lower-level _loadActiveGame directly -- _afterSeasonLoaded is what
  // populates window.app.roster from the season's canonical roster (per the
  // accepted "rosters belong exclusively to seasons" contract), which is
  // required for the Players tab to resolve jersey numbers to names.
  window.app.storage._afterSeasonLoaded();
  window.app.reportsScreen.show();
  const stats = window.app.stats.compute();
  const textFor = tab => {
    window.app.reportsScreen.selectTab(tab);
    return document.querySelector(`[data-native-report-content] [data-pane="${tab}"]`)?.textContent.replace(/\s+/g, ' ').trim() || '';
  };
  const overview = textFor('overview');
  const offense = textFor('offense');
  const defense = textFor('defense');
  const players = textFor('players');
  const topFormation = stats.tendencies.formationList[0];
  const defYards = stats.defPlays.reduce((sum, item) => sum + (parseInt(item.tags.yardage, 10) || 0), 0);
  const defYpp = stats.defPlays.length ? (defYards / stats.defPlays.length).toFixed(1) : '0.0';
  const retired = ['_renderTeamStats', '_renderEfficiency', '_renderDefensive', '_renderIndividualStats', '_overviewHtml', '_offenseHtml', '_playersHtml'];
  return {
    retiredAbsent: retired.every(key => typeof window.app.stats[key] !== 'function' && typeof window.app.reportsScreen[key] !== 'function'),
    canonical: {
      total: stats.allPlays,
      success: stats.efficiency.successRate,
      ypp: window.app.stats.constructor.yardsPerPlay(stats),
      topFormation,
      defensiveSnaps: stats.defPlays.length,
      defYpp,
      runner: stats.individuals.rushers.find(row => String(row.num) === '22'),
      tackler: stats.individuals.tacklers.find(row => String(row.num) === '55'),
    },
    text: { overview, offense, defense, players },
  };
});

ok(result.retiredAbsent, 'Legacy report renderers remain structurally absent');
ok(result.text.overview.includes(String(result.canonical.total))
  && result.text.overview.includes(`${result.canonical.success}%`)
  && result.text.overview.includes(result.canonical.ypp),
  'Overview displays canonical play count, success rate, and yards per play', result.canonical);
ok(result.text.offense.includes(result.canonical.topFormation.name)
  && result.text.offense.includes(String(result.canonical.topFormation.count))
  && result.text.offense.includes(`${result.canonical.topFormation.successPct}%`),
  'Offense displays the canonical leading formation, count, and success rate', result.canonical.topFormation);
ok(result.text.defense.includes(String(result.canonical.defensiveSnaps))
  && result.text.defense.includes(result.canonical.defYpp),
  'Defense displays the canonical defensive snap count and yards allowed per play', result.canonical);
ok(result.canonical.runner?.attempts === 1 && result.canonical.runner?.yards === 4
  && result.text.players.includes('#22') && result.text.players.includes('Runner'),
  'Players displays the canonical rushing attribution', result.canonical.runner);
ok(result.canonical.tackler?.tackles === 2 && result.text.players.includes('#55') && result.text.players.includes('Linebacker'),
  'Players displays the canonical defensive attribution', result.canonical.tackler);
ok(errors.length === 0, 'Zero page errors across native report data parity', errors);

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);