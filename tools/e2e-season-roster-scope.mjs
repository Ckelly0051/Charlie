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

/* REPOINTED 2026-09-13, not weakened. Legacy game-node recovery used to run
   inside `_normalize`, i.e. on every load, restore and import — so ownership
   was re-inferred forever and a deliberately emptied season re-acquired its old
   players. The coach's ruling moved recovery to ONE explicit compatibility
   boundary, `SeasonStore.adoptLegacyRoster`, marked so it cannot run twice.
   The same four cases are still proven; they are now asserted against the
   boundary, and ordinary loading is proven NOT to recover. */
const legacyBoundaries = await page.evaluate(() => {
  const store = window.app.storage.seasonStore;
  const SeasonStore = store.constructor;
  const game = { id:'legacy-game', roster:[{ num:'8', name:'Legacy Player' }], plays:[] };
  const viaBoundary = payload => store._normalize(SeasonStore.adoptLegacyRoster(structuredClone(payload))).roster.map(player => player.name);
  const viaLoad = payload => store._normalize(structuredClone(payload)).roster.map(player => player.name);
  return {
    absent: viaBoundary({ id:'legacy-absent', games:[game] }),
    explicitEmpty: viaBoundary({ id:'legacy-empty', roster:[], games:[game] }),
    explicitNull: viaBoundary({ id:'legacy-null', roster:null, games:[game] }),
    nowhere: viaBoundary({ id:'legacy-nowhere', games:[{ id:'empty-game', plays:[] }] }),
    loadAbsent: viaLoad({ id:'load-absent', games:[game] }),
    twice: (() => {
      const once = SeasonStore.adoptLegacyRoster({ id:'twice', games:[game] });
      once.rosterOwnership = SeasonStore.ROSTER_OWNERSHIP;
      once.roster = [];
      return SeasonStore.adoptLegacyRoster(once).roster.map(player => player.name);
    })(),
  };
});
ok(legacyBoundaries.absent.join('|') === 'Legacy Player'
  && legacyBoundaries.explicitEmpty.length === 0
  && legacyBoundaries.explicitNull.length === 0
  && legacyBoundaries.nowhere.length === 0,
  'the legacy boundary recovers a game roster only when the season field is genuinely absent', JSON.stringify(legacyBoundaries));
ok(legacyBoundaries.loadAbsent.length === 0,
  'ordinary season loading never recovers a roster from a game node', JSON.stringify(legacyBoundaries.loadAbsent));
ok(legacyBoundaries.twice.length === 0,
  'the legacy boundary cannot convert the same season twice', JSON.stringify(legacyBoundaries.twice));

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

const noSeasonGuard = await page.evaluate(async () => {
  const app = window.app;
  const notices = [];
  const originalToast = app.settingsScreen.overlays.toast;
  app.settingsScreen.overlays.toast = function(payload) {
    notices.push(payload?.message || '');
    return originalToast.call(this, payload);
  };
  app.settingsScreen.open({ initialTab:'film' });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const tab = document.querySelector('[data-settings-tab="roster"]');
  const tabSwitch = app.settingsScreen.setActiveTab('roster');
  const result = app.settingsScreen.addPlayer({ num:'55', name:'Unowned Player', pos:'LB', side:'D' });
  const state = { disabled:!!tab?.disabled, tabSwitch, activeTab:app.settingsScreen.activeTab, result, players:app.roster.players.map(player => player.name), notices };
  app.settingsScreen.close('guard-checked');
  app.settingsScreen.overlays.toast = originalToast;
  return state;
});
ok(noSeasonGuard.disabled && noSeasonGuard.tabSwitch === false && noSeasonGuard.activeTab === 'film' && noSeasonGuard.players.length === 0
  && noSeasonGuard.notices.some(message => /open a program season/i.test(message)),
  'Settings disables roster access with no season and mutation methods fail visibly', JSON.stringify(noSeasonGuard));

const imported = await page.evaluate(async () => {
  const app = window.app;
  const rec = await app.storage.createSeason({ name:'Import Target', team:'Mavericks', teamId:'mavericks', kind:'program' });
  const payload = structuredClone(app.storage.seasonStore.data);
  payload.id = 'foreign-season-id';
  payload.name = 'Imported Program Season';
  payload.roster = [{ num:'22', name:'Imported Tailback', pos:'RB', side:'O' }];
  const file = new File([JSON.stringify(payload)], 'imported-season.json', { type:'application/json' });
  app.storage.loadProject(file);
  const deadline = Date.now() + 3000;
  while (Date.now() < deadline && app.roster.players[0]?.name !== 'Imported Tailback') {
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  const durable = await app.storage.seasonStore.backend.loadSeason(rec.id);
  return {
    id:rec.id,
    currentId:app.storage.seasonStore.currentSeasonId,
    live:app.roster.players.map(player => player.name),
    durable:(durable?.roster || []).map(player => player.name),
  };
});
ok(imported.currentId === imported.id && imported.live.join('|') === 'Imported Tailback'
  && imported.durable.join('|') === 'Imported Tailback',
  'full-season import hydrates and durably keeps the imported roster', JSON.stringify(imported));
await page.evaluate(id => window.app.storage.deleteSeason(id), imported.id);

const scoutGuard = await page.evaluate(async () => {
  const app = window.app;
  const rec = await app.storage.createSeason({ name:'Opponent Scout', team:'Opponent', teamId:'mavericks', kind:'scout' });
  const notices = [];
  const originalToast = app.settingsScreen.overlays.toast;
  app.settingsScreen.overlays.toast = function(payload) {
    notices.push(payload?.message || '');
    return originalToast.call(this, payload);
  };
  app.settingsScreen.open({ initialTab:'film' });
  await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
  const tab = document.querySelector('[data-settings-tab="roster"]');
  const result = app.settingsScreen.importRoster('44, Scout Season Leak, QB, O');
  const state = { id:rec.id, disabled:!!tab?.disabled, result, players:app.roster.players.map(player => player.name), notices };
  app.settingsScreen.close('guard-checked');
  app.settingsScreen.overlays.toast = originalToast;
  return state;
});
ok(scoutGuard.disabled && scoutGuard.result === 0 && scoutGuard.players.length === 0
  && scoutGuard.notices.some(message => /opponent scout seasons/i.test(message)),
  'Settings blocks roster visibility and mutations for opponent scout seasons', JSON.stringify(scoutGuard));
/* Teardown only, after the last assertion. `deleteSeason` resolves IN the page,
   and returning that pending promise across CDP lets it be garbage-collected
   under gate load -- "ProtocolError: Promise was collected" crashed a run in
   which all nineteen assertions had already passed. Awaited in-page so a plain
   value crosses the boundary, and reported rather than swallowed if it still
   cannot confirm. */
try {
  await page.evaluate(async id => { await window.app.storage.deleteSeason(id); return true; }, scoutGuard.id);
} catch (error) {
  console.log(`  NOTE  teardown season delete did not confirm: ${error.message}`);
}

ok(errors.length === 0, 'no page errors', errors.join(' | '));

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
