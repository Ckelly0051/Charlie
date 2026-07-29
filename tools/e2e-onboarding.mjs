import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';

/* Native onboarding journey after S3. Team Hub owns team/season management;
   Home is the sole game-entry surface. The progressive setup checklist is
   native too; no assertion depends on the retired SeasonLibrary overlay. */
let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });

const openHub = async () => {
  await page.evaluate(() => window.app.workspaceShell._openLibrary());
  await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'team-hub'
    && !!document.querySelector('[data-native-team-hub]'));
};
const backHome = async () => {
  await page.evaluate(() => window.app.workspaceShell.show('home'));
  await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
};
const openHomeGame = async (index = 0) => {
  await page.evaluate(i => document.querySelectorAll('#wsFilmList [data-ws-game]')[i]?.click(), index);
  await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
};
const showStats = async () => {
  await page.evaluate(() => document.getElementById('btnShowStats')?.click());
  await page.waitForFunction(() => !document.getElementById('wsReports')?.hidden
    && !!document.querySelector('#wsReports [data-native-main-report]'));
};
const clickButtonText = async (selector, pattern) => page.evaluate((sel, source) => {
  const re = new RegExp(source, 'i');
  const button = [...document.querySelectorAll(sel)].find(item => re.test(item.textContent || ''));
  button?.click();
  return !!button;
}, selector, pattern.source);

console.log('\n== 1. First-run Team Hub ==');
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('.gi-hub-first'));
let r = await page.evaluate(() => ({
  route: document.getElementById('workspaceShell')?.dataset.route,
  first: document.querySelector('.gi-hub-first')?.textContent || '',
  legacy: !document.getElementById('libraryOverlay')?.classList.contains('hidden'),
  outlet: !document.getElementById('wsClassicOutlet')?.hidden,
}));
ok(r.route === 'team-hub' && /Set up your team/.test(r.first) && !r.legacy && !r.outlet,
  'First-run Team Hub offers team setup before any season', JSON.stringify(r));

await page.type('.gi-hub-first input[placeholder="St. Joseph Mavericks"]', 'Mavericks');
await page.select('.gi-hub-first select', 'navy');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForFunction(() => document.querySelector('[data-hub-team].is-active'));
r = await page.evaluate(() => ({
  active: document.querySelector('[data-hub-team].is-active')?.textContent.trim(),
  empty: document.querySelector('.gi-hub-empty')?.textContent || '',
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}'),
  setup: document.querySelector('.gi-hub-setup')?.textContent || '',
  done: document.querySelectorAll('.gi-hub-setup-steps .is-done').length,
  steps: document.querySelectorAll('.gi-hub-setup-steps li').length,
}));
ok(r.active === 'Mavericks' && /No seasons yet/.test(r.empty) && r.profile.teamName === 'Mavericks',
  'First setup creates one active team and a clear season empty state', JSON.stringify(r));
ok(r.steps === 5, 'native onboarding keeps all five setup milestones', JSON.stringify(r));
ok(r.done === 1 && /1 of 5/.test(r.setup), 'team setup completes only the team milestone', JSON.stringify(r));

console.log('\n== 2. Sample season ==');
r = await clickButtonText('.gi-hub-section-head button', /Explore sample season/);
ok(r, 'sample action begins as Explore sample season');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
r = await page.evaluate(() => ({
  games: document.querySelectorAll('#wsFilmList [data-ws-game]').length,
  roster: JSON.parse(localStorage.getItem('ffa_roster') || '[]').length,
}));
ok(r.games === 2, 'Home film inbox shows both sample games', JSON.stringify(r));
ok(r.roster === 0, 'sample season leaves the active team roster untouched', JSON.stringify(r));
r = await page.evaluate(async () => {
  const scores = [];
  for (const button of document.querySelectorAll('#wsFilmList [data-ws-preview]')) {
    button.click();
    await new Promise(resolve => setTimeout(resolve, 80));
    scores.push(document.getElementById('wsScoreValue')?.textContent || '');
  }
  return scores;
});
const parsed = r.map(value => { const match = /^(\d+)\D+(\d+)$/.exec(value.trim()); return match ? [Number(match[1]), Number(match[2])] : null; });
ok(parsed.length === 2 && parsed.every(Boolean), 'Home preview renders a score for each sample game', JSON.stringify(r));
ok(parsed.some(score => score[0] > score[1]) && parsed.some(score => score[0] < score[1]),
  'sample scores include a win and a loss', JSON.stringify(r));

console.log('\n== 3. Sample game and reports ==');
await openHomeGame(0);
r = await page.evaluate(() => ({
  route: window.app.workspace.currentRoute(),
  team: document.getElementById('wsContextTeam')?.textContent,
  season: document.getElementById('wsContextSeason')?.textContent,
  game: document.getElementById('wsContextGame')?.textContent,
}));
ok(r.route === 'breakdown', 'opening a game lands in Break Down', JSON.stringify(r));
ok(r.team === 'Mavericks', 'sample workspace retains the owning team identity', JSON.stringify(r));
ok(/Demo/.test(r.season || '') && /Riverside|Hawks/.test(r.game || ''),
  'sample season and opponent remain explicit in shell context', JSON.stringify(r));
await showStats();
await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
r = await page.evaluate(() => ({
  player: document.querySelector('[data-pane="players"]')?.textContent.includes('Marcus Carter'),
  seen: localStorage.getItem('ffa_seen_stats'),
  roster: JSON.parse(localStorage.getItem('ffa_roster') || '[]').length,
}));
ok(r.player, 'sample player labels render in native Reports', JSON.stringify(r));
ok(!r.seen && r.roster === 0, 'sample Reports neither completes real-data progress nor changes the roster', JSON.stringify(r));
await page.evaluate(() => window.app.season._renderAll());
await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
ok(await page.evaluate(() => document.querySelector('[data-pane="players"]')?.textContent.includes('Marcus Carter')),
  'sample player labels survive season-report rendering');

console.log('\n== 4. Sample persistence and removal ==');
await openHub();
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-season-id]').length,
  sample: document.querySelector('[data-season-id] .gi-hub-season-state')?.textContent,
  action: [...document.querySelectorAll('.gi-hub-section-head button')].find(button => /sample season/i.test(button.textContent))?.textContent,
}));
ok(r.rows === 1 && r.sample === 'Current' && /Open sample season/.test(r.action || ''),
  'Team Hub persists the current sample without misbadging another season', JSON.stringify(r));
ok(await page.evaluate(() => document.querySelectorAll('.gi-hub-setup-steps .is-done').length === 1),
  'sample data does not complete real-season, real-tag, roster, or stats milestones');
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('[data-native-team-hub] [data-season-id]'));
r = await page.evaluate(() => ({
  team: document.querySelector('[data-hub-team].is-active')?.textContent.trim(),
  rows: document.querySelectorAll('[data-season-id]').length,
  sample: document.querySelector('[data-season-id] .gi-hub-season-state')?.textContent,
}));
ok(r.team === 'Mavericks' && r.rows === 1 && /Current|Sample/.test(r.sample || ''),
  'team and sample season persist across reload', JSON.stringify(r));
await page.click('[data-hub-open-season]');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
await openHomeGame(1);
await showStats();
await page.evaluate(() => window.app.reportsScreen.selectTab('players'));
ok(await page.evaluate(() => document.querySelector('[data-pane="players"]')?.textContent.includes('Marcus Carter')),
  'sample labels reapply after reload and a different game open');
await openHub();
await page.click('.gi-hub-delete');
await page.waitForSelector('.gi-overlay-panel.is-destructive');
r = await page.evaluate(() => document.querySelector('.gi-overlay-panel.is-destructive')?.textContent || '');
ok(/sample/i.test(r) && /untouched/i.test(r), 'sample removal explains that real team data stays untouched', r);
await page.click('[data-overlay-action="delete"]');
await page.waitForFunction(() => !document.querySelector('[data-season-id]'));
r = await page.evaluate(() => ({
  pointer: localStorage.getItem('ffa_demo_season_id'),
  action: [...document.querySelectorAll('.gi-hub-section-head button')].find(button => /sample season/i.test(button.textContent))?.textContent,
}));
ok(!r.pointer && /Explore sample season/.test(r.action || ''), 'removing the sample clears its pointer and restores Explore', JSON.stringify(r));

console.log('\n== 5. Real season and Home game entry ==');
await page.click('.gi-hub-section-head .gi-hub-primary');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
await page.type('[data-overlay-id="team-hub-create-season"] input[name="seasonName"]', '2026 Mavericks');
const seasonNameAtSubmit = await page.$eval('[data-overlay-id="team-hub-create-season"] input[name="seasonName"]', input => input.value);
ok(seasonNameAtSubmit === '2026 Mavericks', 'rapid season-name entry reaches the submit boundary intact', JSON.stringify(seasonNameAtSubmit));
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
r = await page.evaluate(() => ({
  name: window.app.storage.seasonStore.data?.seasonName,
  teamId: window.app.storage.seasonStore.data?.teamId,
  action: !!document.querySelector('[data-ws-action="new-game"]'),
}));
ok(r.name === '2026 Mavericks' && r.teamId === 'mavericks', 'real season is durably owned by the active team', JSON.stringify(r));
await page.click('[data-ws-action="new-game"]');
await page.waitForSelector('[data-overlay-id="game-details"] [data-native-game-form]');
await page.type('[data-native-game-form] [name="opponent"]', 'Opening Night');
await page.click('[data-native-game-form] .gi-game-actions .is-primary');
await page.waitForFunction(() => window.app.workspace.currentRoute() === 'breakdown');
ok(await page.evaluate(() => window.app.workspace.currentRoute() === 'breakdown' && !!window.app.storage.seasonStore.activeGame()),
  'Home New Game action opens a chartable game in Break Down');
await page.evaluate(async () => {
  const tagger = window.app.tagger;
  tagger.plays.push({ id: 1, timestamp: { start: 0, end: 5 }, clipId: null,
    tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7', unit: 'offense', players: {}, grades: {}, custom: [] },
    notes: '', analysis: null });
  tagger.nextId = 2;
  await window.app.storage._commitAndPersist();
});
await showStats();
ok(await page.evaluate(() => localStorage.getItem('ffa_seen_stats') === '1'),
  'real-data Reports records that analytics were reached');
await openHub();
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-season-id]').length,
  state: document.querySelector('[data-season-id] .gi-hub-season-state')?.textContent,
  done: document.querySelectorAll('.gi-hub-setup-steps .is-done').length,
  setup: document.querySelector('.gi-hub-setup')?.textContent || '',
}));
ok(r.rows === 1 && r.state !== 'Sample', 'real season is never labeled as sample', JSON.stringify(r));
ok(r.done === 4 && /4 of 5/.test(r.setup) && /Add your roster/.test(r.setup),
  'native setup progress reflects real season, tag, and stats while leaving roster actionable', JSON.stringify(r));

console.log('\n== 6. Demo-pointer sanitation ==');
await page.evaluate(() => {
  const id = document.querySelector('[data-season-id]')?.dataset.seasonId;
  localStorage.setItem('ffa_demo_season_id', id || '');
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('[data-native-team-hub] [data-season-id]'));
r = await page.evaluate(() => ({
  pointer: localStorage.getItem('ffa_demo_season_id'),
  state: document.querySelector('[data-season-id] .gi-hub-season-state')?.textContent,
}));
ok(!r.pointer && r.state !== 'Sample', 'stale demo pointer cannot relabel a real season', JSON.stringify(r));
await page.evaluate(() => localStorage.setItem('ffa_demo_season_id', 'missing-demo-season'));
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('[data-native-team-hub] [data-season-id]'));
r = await page.evaluate(() => ({
  pointer: localStorage.getItem('ffa_demo_season_id'),
  action: [...document.querySelectorAll('.gi-hub-section-head button')].find(button => /sample season/i.test(button.textContent))?.textContent,
}));
ok(!r.pointer && /Explore sample season/.test(r.action || ''), 'missing demo pointer returns the sample action to Explore', JSON.stringify(r));

console.log('\n== 7. Existing-season upgrade recovery ==');
await page.evaluate(() => {
  localStorage.removeItem('ffa_team_profile');
  localStorage.removeItem('ffa_teams');
  localStorage.removeItem('ffa_active_team_id');
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => document.querySelector('[data-native-team-hub]'));
r = await page.evaluate(() => ({
  first: !!document.querySelector('.gi-hub-first'),
  team: document.querySelector('[data-hub-team].is-active')?.textContent.trim(),
  seasons: document.querySelectorAll('[data-season-id]').length,
}));
ok(!r.first && !!r.team && r.seasons === 1, 'existing season rebuilds team identity instead of showing destructive first-run setup', JSON.stringify(r));
await page.click('[data-hub-open-season]');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
ok(await page.evaluate(() => !!window.app.storage.seasonStore.currentSeasonId), 'recovered existing season opens to Home');

ok(errors.length === 0, 'No console or page errors', errors.slice(0, 8).join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);