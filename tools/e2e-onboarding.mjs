import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

/* Current onboarding journey. Home is the sole first-run, season-library,
   and game-entry presentation. TeamHubScreen remains the canonical service
   for team and season operations, but it owns no full-page DOM. */
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

const showHomeLibrary = async () => {
  await page.evaluate(() => window.app.workspaceShell._openLibrary());
  await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home'
    && !!document.querySelector('.library-panel'));
};
const showReports = async () => {
  await page.evaluate(() => window.app.workspaceShell.show('reports'));
  await page.waitForSelector('#wsReports [data-native-main-report]');
};

console.log('\n== 1. First-run Home ==');
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForSelector('[data-first-launch]');
let r = await page.evaluate(() => ({
  route: document.getElementById('workspaceShell')?.dataset.route,
  copy: document.querySelector('[data-first-launch]')?.textContent || '',
  retired: document.querySelectorAll('[data-native-team-hub], #libraryOverlay, #wsClassicOutlet').length,
}));
ok(r.route === 'home' && /Create your first season/.test(r.copy) && r.retired === 0,
  'First run is owned by Home with no retired Team Hub presentation', JSON.stringify(r));

// Establish the team-only milestone through the registry so this harness can
// independently exercise Home's zero-season state. The combined UI setup is
// owned by e2e-home-first-launch.
await page.evaluate(async () => {
  window.app.teamRegistry.saveTeamIdentity('Mavericks', '', 'navy');
  await window.app.teamHubScreen.load();
  await window.app.workspaceShell._openLibrary();
});
await page.waitForSelector('.library-panel');
r = await page.evaluate(() => ({
  title: document.querySelector('.library-panel-head h2')?.textContent.trim(),
  empty: document.querySelector('.ws-empty-panel')?.textContent || '',
  teams: window.app.teamRegistry.teams().length,
  seasons: window.app.teamHubScreen.snapshot().railSeasons.length,
}));
ok(r.title === 'Mavericks home' && /Start the football year here/.test(r.empty)
  && r.teams === 1 && r.seasons === 0,
  'Team-only setup lands in the useful zero-season Home library', JSON.stringify(r));

console.log('\n== 2. Sample season ==');
await page.evaluate(() => window.app.teamHubScreen.exploreSample());
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent()
  && document.querySelectorAll('.ws-game-row').length === 2);
r = await page.evaluate(() => ({
  games: document.querySelectorAll('.ws-game-row').length,
  roster: window.app.roster.players.length,
  season: window.app.storage.seasonStore.data?.seasonName || '',
}));
ok(r.games === 2 && /Demo/.test(r.season), 'Sample opens two useful games on Home', JSON.stringify(r));
ok(r.roster === 0, 'Sample season does not alter the active team roster', JSON.stringify(r));

await page.click('.ws-game-row .game-card-select');
await page.click('#wsContinueCharting');
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
await showReports();
await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
r = await page.evaluate(() => ({
  player: document.querySelector('[data-pane="players"]')?.textContent.includes('Marcus Carter'),
  seen: localStorage.getItem('ffa_seen_stats'),
}));
ok(r.player, 'Sample player labels render in Reports', JSON.stringify(r));
ok(!r.seen, 'Sample analytics do not mark real-season reporting progress', JSON.stringify(r));

console.log('\n== 3. Sample persistence and removal ==');
await showHomeLibrary();
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-library-season]').length,
  state: document.querySelector('.library-season-state')?.textContent.trim(),
  sampleId: localStorage.getItem('ffa_demo_season_id') || '',
}));
ok(r.rows === 1 && r.state === 'Sample season' && !!r.sampleId,
  'Home library identifies the sample season without a competing badge', JSON.stringify(r));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-library-season]');
ok(await page.evaluate(() => document.querySelector('[data-library-season]')?.textContent.includes('Demo')),
  'Team and sample season persist across reload');

await page.evaluate(() => {
  const row = window.app.teamHubScreen.snapshot().seasons[0];
  window.app.teamHubScreen.deleteSeason(row.id, null);
});
await page.waitForSelector('.gi-overlay-panel.is-destructive');
r = await page.evaluate(() => document.querySelector('.gi-overlay-panel.is-destructive')?.textContent || '');
ok(/sample/i.test(r) && /untouched/i.test(r), 'Sample removal explains that real team data stays untouched', r);
await page.click('[data-overlay-action="delete"]');
await page.waitForFunction(() => window.app.teamHubScreen.snapshot().seasons.length === 0);
ok(await page.evaluate(() => !localStorage.getItem('ffa_demo_season_id')),
  'Removing the sample clears its durable pointer');

console.log('\n== 4. Real season and game entry ==');
await page.evaluate(() => { window.app.teamHubScreen.openCreateSeason(null); });
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button:nth-child(2)');
await page.select('[data-overlay-id="team-hub-create-season"] select[name="level"]', 'Other');
await page.type('[data-overlay-id="team-hub-create-season"] input[name="customLevel"]', 'Freshman B');
ok(await page.$eval('[data-overlay-id="team-hub-create-season"] input[name="customLevel"]', input => input.value) === 'Freshman B',
  'Rapid season-detail entry reaches the submit boundary intact');
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent());
const expectedSeasonName = `${new Date().getFullYear()} · Mavericks · Freshman B`;
r = await page.evaluate(() => ({
  name: window.app.storage.seasonStore.data?.seasonName,
  teamId: window.app.storage.seasonStore.data?.teamId,
  newGame: !!document.querySelector('[data-ws-action="new-game"]'),
}));
ok(r.name === expectedSeasonName && r.teamId === 'mavericks' && r.newGame,
  'Real season is owned by Mavericks and exposes Home game entry', JSON.stringify(r));

await page.click('[data-ws-action="new-game"]');
await page.waitForSelector('[data-overlay-id="game-details"] [data-native-game-form]');
await page.type('[data-native-game-form] [name="opponent"]', 'Opening Night');
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
ok(await page.evaluate(() => window.app.workspace.currentRoute() === 'breakdown'),
  'Opening a Home game lands in Break Down');
ok(!!(await page.evaluate(() => window.app.storage.seasonStore.activeGame())),
  'Home New Game opens a chartable game in Break Down');
await page.evaluate(async () => {
  const tagger = window.app.tagger;
  tagger.plays.push({ id: 1, timestamp: { start: 0, end: 5 }, clipId: null,
    tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7', unit: 'offense', players: {}, grades: {}, custom: [] },
    notes: '', analysis: null });
  tagger.nextId = 2;
  await window.app.storage._commitAndPersist();
});
await showReports();
ok(await page.evaluate(() => localStorage.getItem('ffa_seen_stats') === '1'),
  'Real-data Reports records that analytics were reached');

console.log('\n== 5. Resumable setup and pointer sanitation ==');
await page.evaluate(() => window.app.workspaceShell.show('home'));
await page.waitForSelector('.rail-tools');
await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')]
  .find(button => /Season setup/.test(button.textContent || ''))?.click());
await page.waitForSelector('[data-overlay-id="team-hub-season-setup"] .gi-season-guide');
r = await page.evaluate(() => ({
  steps: document.querySelectorAll('.gi-season-guide-steps li').length,
  skip: document.querySelector('.gi-season-guide')?.textContent || '',
}));
ok(r.steps === 5 && /Skip guide/.test(r.skip), 'Season setup remains resumable and fully skippable', JSON.stringify(r));
await page.evaluate(() => [...document.querySelectorAll('[data-overlay-id="team-hub-season-setup"] button')]
  .find(button => /Skip guide/.test(button.textContent || ''))?.click());
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-hub-season-setup"]'));
await showHomeLibrary();
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-library-season]').length,
  state: document.querySelector('.library-season-state')?.textContent.trim(),
  id: document.querySelector('[data-library-season]')?.dataset.seasonId || '',
}));
ok(r.rows === 1 && r.state !== 'Sample season', 'Real season is never labeled as sample', JSON.stringify(r));
await page.evaluate(id => localStorage.setItem('ffa_demo_season_id', id), r.id);
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-library-season]');
ok(await page.evaluate(() => !localStorage.getItem('ffa_demo_season_id')
  && document.querySelector('.library-season-state')?.textContent.trim() !== 'Sample season'),
  'Stale demo pointer cannot relabel a real season');

console.log('\n== 6. Existing-season identity recovery ==');
await page.evaluate(() => {
  localStorage.removeItem('ffa_team_profile');
  localStorage.removeItem('ffa_teams');
  localStorage.removeItem('ffa_active_team_id');
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForSelector('[data-library-season]');
r = await page.evaluate(() => ({
  first: !!document.querySelector('[data-first-launch]'),
  team: window.app.teamHubScreen.snapshot().profile.teamName,
  seasons: document.querySelectorAll('[data-library-season]').length,
}));
ok(!r.first && !!r.team && r.seasons === 1,
  'Existing season rebuilds team identity instead of showing first-run setup', JSON.stringify(r));

ok(errors.length === 0, 'No console or page errors', errors.slice(0, 8).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
