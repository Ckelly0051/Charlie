/* Season roster ownership regression.
   Two seasons under one program must never share ambient roster state. */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (value, label, detail = '') => value
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage?.seasonStore && window.app?.roster);

const ids = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const jv = await app.storage.createSeason({ name: '2026 JV', team: 'Mavericks', teamId: 'mavericks', year: '2026', level: 'JV' });
  app.roster.loadFrom([{ num: '7', name: 'JV Quarterback', pos: 'QB', side: 'O' }]);
  app.tagger.plays = [{
    id: 1, timestamp: { start: 0, end: 5 }, notes: '',
    tags: { unit: 'offense', playType: 'Run Outside', result: 'Gain', yardage: '6', players: { ballCarrier: '7' }, grades: {}, custom: [] },
  }];
  app.tagger.nextId = 2;
  app.storage.commitActive();
  await store.persist();

  const varsity = await app.storage.createSeason({ name: '2026 Varsity', team: 'Mavericks', teamId: 'mavericks', year: '2026', level: 'Varsity' });
  const varsityStartsEmpty = app.roster.players.length === 0;
  app.roster.loadFrom([{ num: '12', name: 'Varsity Quarterback', pos: 'QB', side: 'O' }]);
  app.tagger.plays = [{
    id: 1, timestamp: { start: 0, end: 5 }, notes: '',
    tags: { unit: 'offense', playType: 'Short Pass', result: 'Gain', yardage: '8', players: { passer: '12' }, grades: {}, custom: [] },
  }];
  app.tagger.nextId = 2;
  app.storage.newGame();
  const rosterAfterGameSwitch = app.roster.players.map(player => player.name);
  app.storage.commitActive();
  await store.persist();
  const backup = await store.snapshot('Varsity roster baseline');
  app.roster.loadFrom([{ num: '99', name: 'Temporary Wrong Roster', pos: 'QB', side: 'O' }]);
  app.storage.commitActive();
  await store.persist();
  const restored = backup?.id ? await app.storage.restoreBackup(backup.id) : false;
  const rosterAfterRestore = app.roster.players.map(player => player.name);
  return { jv: jv.id, varsity: varsity.id, varsityStartsEmpty, rosterAfterGameSwitch, restored, rosterAfterRestore };
});

ok(ids.varsityStartsEmpty, 'a newly-created season starts with an empty roster');
ok(ids.rosterAfterGameSwitch.join('|') === 'Varsity Quarterback', 'switching games leaves the season roster unchanged', JSON.stringify(ids));
ok(ids.restored && ids.rosterAfterRestore.join('|') === 'Varsity Quarterback', 'restoring a season backup hydrates its restored roster', JSON.stringify(ids));

let result = await page.evaluate(async ({ jv, varsity }) => {
  const app = window.app;
  const store = app.storage.seasonStore;
  await app.storage.openSeasonById(jv);
  const jvRoster = app.roster.players.map(player => player.name);
  const assignment = store.activeGame().plays[0]?.tags?.players?.ballCarrier;
  await app.storage.openSeasonById(varsity);
  const varsityRoster = app.roster.players.map(player => player.name);
  const durableJv = await store.backend.loadSeason(jv);
  const durableVarsity = await store.backend.loadSeason(varsity);
  return {
    jvRoster, varsityRoster, assignment,
    durableJv: durableJv.roster.map(player => player.name),
    durableVarsity: durableVarsity.roster.map(player => player.name),
    gameRosterFields: [...durableJv.games, ...durableVarsity.games].filter(game => Object.prototype.hasOwnProperty.call(game, 'roster')).length,
  };
}, ids);

ok(result.jvRoster.join('|') === 'JV Quarterback', 'opening JV loads only the JV roster', JSON.stringify(result));
ok(result.varsityRoster.join('|') === 'Varsity Quarterback', 'opening Varsity loads only the Varsity roster', JSON.stringify(result));
ok(result.durableJv.join('|') === 'JV Quarterback' && result.durableVarsity.join('|') === 'Varsity Quarterback', 'canonical season records keep distinct rosters', JSON.stringify(result));
ok(result.assignment === '7', 'season switches do not alter per-play player assignments', JSON.stringify(result));
ok(result.gameRosterFields === 0, 'game records no longer duplicate roster ownership', JSON.stringify(result));

await page.evaluate(async jv => {
  const app = window.app;
  await app.storage.openSeasonById(jv);
  app.roster.loadFrom([]);
  app.storage.commitActive();
  await app.storage.seasonStore.persist();
  localStorage.setItem('ffa_roster', JSON.stringify([{ num: '99', name: 'Ambient Leak' }]));
  localStorage.setItem('ffa_roster_mavericks', JSON.stringify([{ num: '98', name: 'Team Leak' }]));
}, ids.jv);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage?.seasonStore && window.app?.roster);

result = await page.evaluate(async ({ jv, varsity }) => {
  const app = window.app;
  const beforeOpen = app.roster.players.map(player => player.name);
  await app.storage.openSeasonById(jv);
  const jvRoster = app.roster.players.map(player => player.name);
  await app.storage.openSeasonById(varsity);
  const varsityRoster = app.roster.players.map(player => player.name);
  return { beforeOpen, jvRoster, varsityRoster };
}, ids);

ok(result.beforeOpen.length === 0, 'legacy ambient caches are not live roster authorities', JSON.stringify(result));
ok(result.jvRoster.length === 0, 'an intentionally-cleared season roster survives restart as empty', JSON.stringify(result));
ok(result.varsityRoster.join('|') === 'Varsity Quarterback', 'another season remains intact after clearing JV', JSON.stringify(result));
const rosterAfterDelete = await page.evaluate(async varsity => {
  await window.app.storage.deleteSeason(varsity);
  return window.app.roster.players.length;
}, ids.varsity);
ok(rosterAfterDelete === 0, 'deleting the open season clears its now-unowned live roster');
ok(errors.length === 0, 'no page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
