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
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-first-launch]'));
let r = await page.evaluate(() => ({
  choices: [...document.querySelectorAll('[data-ws-action="workspace-program"], [data-ws-action="workspace-scout"]')]
    .map(button => button.textContent.trim()),
}));
ok(r.choices.length === 2 && /Our Program/.test(r.choices[0]) && /Opponent Scout/.test(r.choices[1]),
  'First run presents Program and Opponent Scout as explicit football workflows', JSON.stringify(r));
// The first-run film-storage promise (.gi-hub-storage-promise) is retired
// from production -- the approved first-launch composition does not disclose
// storage before a season exists. Film-storage disclosure is proven where it
// now lives, in Team & Film Settings: see e2e-film-storage-setup's "Choice copy
// clearly distinguishes link-in-place from managed copies".
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-first-run.png'), fullPage: true });

// addTeam takes {school, nickname, jerseyColor} now (2026-08-31 Home naming
// contract); an empty nickname keeps teamName exactly "Mavericks".
r = await page.evaluate(async () => window.app.teamHubScreen.addTeam({ school: 'Mavericks', jerseyColor: 'blue' }));
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
  stored: window.app.workspace.workspaceMode(),
  active: document.querySelector('[data-ws-action="workspace-scout"]')?.classList.contains('is-active'),
  pressed: document.querySelector('[data-ws-action="workspace-scout"]')?.getAttribute('aria-pressed'),
  title: document.querySelector('.library-panel-head h2')?.textContent?.trim(),
}));
ok(r.stored === 'scout' && r.active && r.pressed === 'true' && r.title === 'Opponent scouting',
  'Scout choice and Home copy remain aligned after leaving Team Hub before any season exists', JSON.stringify(r));
await page.evaluate(async () => {
  await window.app.teamHubScreen.selectWorkspace('program');
  await window.app.workspaceShell._openLibrary();
});
await page.waitForFunction(() => document.querySelector('[data-ws-action="workspace-program"]')?.classList.contains('is-active'));
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
await page.waitForSelector('.library-panel');
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'v2b-program-control-center.png'), fullPage: true });
r = await page.evaluate(() => ({
  control: [...document.querySelectorAll('.rail-tools button')].map(node => node.textContent.trim()),
  mode: document.querySelector('[data-ws-action="workspace-program"]')?.classList.contains('is-active') ? 'Program' : '',
}));
ok(r.mode === 'Program' && r.control.some(label => /Film & storage/.test(label)),
  'Program Home exposes one clear control center for film and roster', JSON.stringify(r));

await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('scout'));
await page.waitForFunction(() => document.querySelector('[data-ws-action="workspace-scout"]')?.classList.contains('is-active'));
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-library-season]').length,
  empty: document.querySelector('.library-scout-empty')?.textContent || '',
}));
// The old copy promised isolation in words ("without touching our season").
// The copy standard now forbids data-safety language in an empty state, so that
// clause is deliberately gone; isolation is a DATA guarantee, proven by the
// season-isolation and integrity harnesses rather than by reassuring text. What
// the empty state must still do is name the object and the next action.
ok(r.rows === 0 && /No opponents yet/.test(r.empty) && /Create opponent scout/.test(r.empty),
  'Scout library starts empty and names the object and its next action', JSON.stringify(r));
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

/* FIXTURE REPOINTED 2026-09-14. This opened the Season Library first -- which
   closes the season -- and then relied on the toggle restoring one by
   `lastOpened`. That redirect is retired. The claim ("switching back to Program
   wins while a scout season is open") is now exercised directly and is stronger
   for it: the SCOUT stays open, and the toggle returns to that scout's exact
   stored `programSeasonId`. */
await page.evaluate(() => window.app.teamHubScreen.selectWorkspace('program'));
await page.waitForFunction(id => window.app.storage.seasonStore.currentSeasonId === id, {}, program.id);
r = await page.evaluate(() => ({
  season: window.app.storage.seasonStore.data?.seasonName || '',
  mode: window.app.workspace.workspaceMode(),
}));
// createSeason composes its own name as "Year · Level" now (2026-08-31 Home
// naming contract); the caller's "name" field above is ignored, so the real
// season reads "2026 · JV", never "2026 Mavericks".
ok(r.mode === 'program' && /2026 · Mavericks · JV/.test(r.season) && !/Holy Family/.test(r.season),
  'Explicitly switching back to Program wins even while a scout season is open', JSON.stringify(r));

await page.evaluate(id => window.app.teamHubScreen.openSeason(id), program.id);
await page.waitForFunction(id => window.app.storage.seasonStore.currentSeasonId === id, {}, program.id);
r = await page.evaluate(() => ({
  kind: window.app.storage.seasonStore.data.kind,
  games: window.app.storage.seasonStore.data.games.length,
  mode: window.app.workspace.workspaceMode(),
}));
ok(r.kind === 'program' && r.games === program.games && r.mode === 'program',
  'Returning to Program restores its untouched schedule and context', JSON.stringify(r));
ok(errors.length === 0, 'No page errors', errors.join('\n'));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
