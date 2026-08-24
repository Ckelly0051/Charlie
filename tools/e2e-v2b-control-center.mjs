/* V2-B control-center journey: program/scout front doors and canonical isolation. */
import fs from 'node:fs';
import path from 'node:path';
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', error => errors.push(error.stack || error.message));
const shotDir = process.env.GIQ_V2B_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });

await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-native-team-hub]'));
let r = await page.evaluate(() => ({
  choices: [...document.querySelectorAll('.gi-hub-workspace-choice button')].map(button => button.textContent.trim()),
  storage: document.querySelector('.gi-hub-storage-promise')?.textContent || '',
}));
ok(r.choices.length === 2 && /Our Program/.test(r.choices[0]) && /Opponent Scout/.test(r.choices[1]),
  'First run presents Program and Opponent Scout as explicit football workflows', JSON.stringify(r));
ok(/film stays where you keep it/i.test(r.storage) && /Team & Film Settings/i.test(r.storage),
  'First run explains film storage before a game is opened', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-first-run.png'), fullPage: true });

r = await page.evaluate(async () => window.app.teamHubScreen.addTeam({ name: 'Mavericks', jerseyColor: 'blue' }));
ok(r?.ok, 'Team setup completes without verbal instruction', JSON.stringify(r));

// No season exists yet: the persisted football workspace must still own the
// shell chrome after Team Hub closes. This is the exact Assistant Coach path
// where the two pre-repair scout detectors disagreed.
await page.evaluate(async () => {
  await window.app.teamHubScreen.selectWorkspace('scout');
  await window.app.teamHubScreen.close();
});
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
r = await page.evaluate(() => ({
  stored: localStorage.getItem('giq_home_workspace'),
  active: document.querySelector('[data-ws-action="workspace-scout"]')?.classList.contains('is-active'),
  pressed: document.querySelector('[data-ws-action="workspace-scout"]')?.getAttribute('aria-pressed'),
  eyebrow: document.getElementById('wsHomeEyebrow')?.textContent?.trim(),
}));
ok(r.stored === 'scout' && r.active && r.pressed === 'true' && r.eyebrow === 'Opponent Scout / Film Library',
  'Scout choice and Home copy remain aligned after leaving Team Hub before any season exists', JSON.stringify(r));
await page.evaluate(async () => {
  await window.app.teamHubScreen.selectWorkspace('program');
  await window.app.workspaceShell._openLibrary();
});
await page.waitForFunction(() => document.querySelector('.gi-hub-workspace-choice button.is-active strong')?.textContent === 'Our Program');
r = await page.evaluate(async () => window.app.teamHubScreen.createSeason({ name: '2026 Mavericks', year: '2026', level: 'JV' }));
ok(r?.ok, 'Program season creation uses the program path', JSON.stringify(r));
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
const program = await page.evaluate(() => ({
  id: window.app.storage.seasonStore.currentSeasonId,
  kind: window.app.storage.seasonStore.data.kind,
  games: window.app.storage.seasonStore.data.games.length,
}));
ok(program.kind === 'program' && program.games === 1, 'Program season is explicitly typed and owns its seeded game', JSON.stringify(program));

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-native-team-hub]');
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-program-control-center.png'), fullPage: true });
r = await page.evaluate(() => ({
  control: [...document.querySelectorAll('.gi-hub-control-row strong')].map(node => node.textContent.trim()),
  mode: document.querySelector('.gi-hub-workspace-choice button.is-active strong')?.textContent,
}));
ok(r.mode === 'Our Program' && ['Film storage', 'Roster'].every(label => r.control.includes(label)),
  'Program Home exposes one clear control center for film and roster', JSON.stringify(r));

await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('scout'));
await page.waitForFunction(() => document.querySelector('.gi-hub-workspace-choice button.is-active strong')?.textContent === 'Opponent Scout');
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-season-id]').length,
  empty: document.querySelector('.gi-hub-empty-inline')?.textContent || '',
}));
ok(r.rows === 0 && /without touching our season/.test(r.empty),
  'Scout library starts empty and explicitly promises program isolation', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-scout-library.png'), fullPage: true });

r = await page.evaluate(async () => window.app.teamHubScreen.createScout({
  opponent: 'Holy Family Wildcats', year: '2026',
  sourceTeamA: 'Holy Family Wildcats', sourceTeamB: 'Central Tigers', date: '2026-08-20',
}));
ok(r?.ok, 'Opponent scout creation completes through the dedicated path', JSON.stringify(r));
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
const scout = await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  const game = store.activeGame();
  const seasons = await window.app.storage.listSeasons();
  return {
    id: store.currentSeasonId,
    kind: store.data.kind,
    target: store.data.scout?.opponent,
    perspective: game?.gameInfo?.perspective,
    gameType: game?.gameInfo?.gameType,
    sourceA: game?.gameInfo?.sourceTeamA,
    sourceB: game?.gameInfo?.sourceTeamB,
    homeText: document.body?.textContent || '',
    programRows: seasons.filter(season => season.kind !== 'scout').length,
    scoutRows: seasons.filter(season => season.kind === 'scout').length,
  };
});
ok(scout.kind === 'scout' && scout.target === 'Holy Family Wildcats' && scout.perspective === 'scout' && scout.gameType === 'scout',
  'Scout season carries explicit opponent-scout identity into charting', JSON.stringify(scout));
ok(scout.sourceA === 'Holy Family Wildcats' && scout.sourceB === 'Central Tigers' && /Holy Family Wildcats vs Central Tigers/.test(scout.homeText),
  'Source film records the actual two teams rather than pretending it is our game', JSON.stringify(scout));
ok(scout.programRows === 1 && scout.scoutRows === 1 && scout.id !== program.id,
  'Program and scout remain separate canonical seasons', JSON.stringify(scout));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-scout-home.png'), fullPage: true });

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-native-team-hub]');
await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('program'));
await page.waitForFunction(() => document.querySelector('.gi-hub-workspace-choice button.is-active strong')?.textContent === 'Our Program');
r = await page.evaluate(() => ({
  rows: [...document.querySelectorAll('[data-season-id]')].map(row => row.textContent),
  mode: localStorage.getItem('giq_home_workspace'),
}));
ok(r.mode === 'program' && r.rows.length === 1 && /2026 Mavericks/.test(r.rows[0]) && !/Holy Family/.test(r.rows[0]),
  'Explicitly switching back to Program wins even while a scout season is open', JSON.stringify(r));

await page.evaluate(id => window.app.teamHubScreen.openSeason(id), program.id);
await page.waitForFunction(id => window.app.storage.seasonStore.currentSeasonId === id, {}, program.id);
r = await page.evaluate(() => ({
  kind: window.app.storage.seasonStore.data.kind,
  games: window.app.storage.seasonStore.data.games.length,
  mode: localStorage.getItem('giq_home_workspace'),
}));
ok(r.kind === 'program' && r.games === program.games && r.mode === 'program',
  'Returning to Program restores its untouched schedule and context', JSON.stringify(r));
ok(errors.length === 0, 'No page errors', errors.join('\n'));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);