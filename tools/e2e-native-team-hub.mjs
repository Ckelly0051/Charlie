/* TeamHubScreen integration through the consolidated Home owner. The retired
 * full-page Team Hub renderer is deliberately absent; its controllers and
 * focused dialogs remain the canonical season/team operation boundary. */
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
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
const shotDir = process.env.GIQ_TEAM_HUB_SHOTS_DIR || '';
if (shotDir) fs.mkdirSync(shotDir, { recursive: true });
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-first-launch]'));

let r = await page.evaluate(() => ({
  route: document.getElementById('workspaceShell')?.dataset.route,
  first: !!document.querySelector('[data-first-launch]'),
  teamHubHosts: document.querySelectorAll('[data-native-team-hub], #wsTeamHub').length,
  legacy: !!document.getElementById('libraryOverlay') || !!document.getElementById('wsClassicOutlet'),
}));
ok(r.route === 'home' && r.first && r.teamHubHosts === 0 && !r.legacy,
  'Startup uses the sole Home renderer while TeamHubScreen remains the service owner', JSON.stringify(r));

await page.type('[data-first-launch] input[name="school"]', 'Mavericks');
await page.click('[data-first-launch] .first-setup-choice button:nth-child(2)');
await page.click('[data-first-launch] .ws-primary');
await page.waitForFunction(() => !document.querySelector('[data-first-launch]') && window.app.storage.seasonStore.hasCurrent());
const seasonName = `${new Date().getFullYear()} · Mavericks · JV`;
r = await page.evaluate(() => ({
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}'),
  season: window.app.storage.seasonStore.data?.seasonName,
  games: window.app.storage.seasonStore.data?.games?.length,
  route: document.getElementById('workspaceShell')?.dataset.route,
}));
ok(r.profile.teamName === 'Mavericks' && r.season === seasonName && r.games === 1 && r.route === 'home',
  'Home setup creates the canonical team and season', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('.library-panel [data-library-season]');
await page.waitForFunction(() => document.querySelector('[data-library-season] .library-film')?.textContent.trim() === 'No film linked');
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('.library-panel [data-library-season]').length,
  open: document.querySelector('[data-library-season] .library-open')?.textContent.trim(),
  film: document.querySelector('[data-library-season] .library-film')?.textContent.trim(),
  teamHubHosts: document.querySelectorAll('[data-native-team-hub], #wsTeamHub').length,
}));
ok(r.rows === 1 && r.open === 'Open season' && r.film === 'No film linked' && r.teamHubHosts === 0,
  'Home library renders the season with honest film health and no competing owner', JSON.stringify(r));

await page.click('.library-panel-head .ws-primary');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
r = await page.evaluate(() => ({
  options: [...document.querySelectorAll('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button')]
    .map(button => ({ text: button.textContent.trim(), checked: button.getAttribute('aria-checked') })),
}));
ok(/Quick create/.test(r.options[1]?.text) && r.options[1]?.checked === 'true' && /Use guided setup/.test(r.options[0]?.text),
  'Home opens the canonical create-season dialog with optional guided setup', JSON.stringify(r));
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions button');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-hub-create-season"]'));

await page.click('[data-library-season] .library-open');
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent());
await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')].find(button => /Season setup/.test(button.textContent))?.click());
await page.waitForSelector('[data-overlay-id="team-hub-season-setup"] .gi-season-guide');
r = await page.evaluate(() => ({
  title: document.querySelector('.gi-season-guide h2')?.textContent.trim(),
  steps: [...document.querySelectorAll('.gi-season-guide-steps li')].map(row => row.textContent.trim()),
  skip: document.querySelector('.gi-season-guide .gi-hub-form-actions button')?.textContent,
}));
ok(r.title === seasonName && r.steps.length === 5 && /Skip guide/.test(r.skip),
  'Home rail reopens the canonical resumable season guide', JSON.stringify(r));
const guideFonts = await page.evaluate(() => {
  const family = selector => getComputedStyle(document.querySelector(selector)).fontFamily;
  return {
    title: family('[data-overlay-id="team-hub-season-setup"] .gi-overlay-head h2'),
    season: family('.gi-season-guide-head h2'),
    number: family('.gi-season-guide-number'),
  };
});
ok(Object.values(guideFonts).every(family => family.includes('IBM Plex Sans') && !family.includes('Condensed')),
  'Season setup titles and step numbers use the current sans type, not the old condensed display font', JSON.stringify(guideFonts));
await page.click('.gi-season-guide .gi-hub-form-actions button');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-hub-season-setup"]'));

const setupStatus = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const store = window.app.storage.seasonStore;
  const games = store.data.games;
  const players = window.app.roster.players;
  try {
    store.data.games = [store.blankGame()];
    window.app.roster.players = [];
    const empty = hub._seasonSetupStatus();
    store.data.games.push({ id: 'configured-later', name: 'Week 1 vs Patriots',
      gameInfo: { opponent: 'Patriots', date: '2026-09-21' }, plays: [] });
    const withGame = hub._seasonSetupStatus();
    const control = await hub._controlStatus();
    window.app.roster.players = [{ num: '12', name: 'Player' }];
    const complete = hub._seasonSetupStatus();
    const readyControl = await hub._controlStatus();
    return { empty, withGame, control, complete, readyControl };
  } finally {
    store.data.games = games;
    window.app.roster.players = players;
  }
});
ok(!setupStatus.empty.steps[3].done && !setupStatus.empty.steps[4].done,
  'An untouched starter game does not complete either setup step');
ok(setupStatus.withGame.steps[3].done && setupStatus.withGame.steps[3].detail === 'Week 1 vs Patriots'
  && !setupStatus.withGame.steps[4].done && setupStatus.control.setupLabel === '2 of 3 setup areas ready',
  'A later configured game completes First game in both setup summaries, despite a blank starter', JSON.stringify(setupStatus.withGame));
ok(setupStatus.complete.steps[4].done && setupStatus.readyControl.setupReady,
  'A roster plus storage and a later configured game complete Ready to chart in both summaries');

await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')].find(button => /Film & storage/.test(button.textContent))?.click());
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
ok(await page.evaluate(() => document.querySelectorAll('[data-overlay-id="team-film-settings"] [data-native-settings]').length === 1),
  'Home rail opens the one native Team and Film Settings owner');
await page.evaluate(() => window.app.settingsScreen.close('test-complete'));

await page.evaluate(() => [...document.querySelectorAll('.rail-tools button')].find(button => /^Roster$/.test(button.textContent.trim()))?.click());
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-settings-panel="roster"]');
ok(await page.evaluate(() => document.querySelectorAll('[data-settings-panel="roster"]').length === 1),
  'Home rail opens the canonical roster workspace');
await page.evaluate(() => window.app.settingsScreen.close('test-complete'));

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-library-season] .library-delete');
const beforeDelete = await page.evaluate(() => JSON.stringify(window.app.teamHubScreen.snapshot().railSeasons.map(row => row.id)));
await page.click('[data-library-season] .library-delete');
await page.waitForSelector('.gi-confirm-delete input[name="confirm"]');
r = await page.evaluate(() => ({
  deleteDisabled: document.querySelector('.gi-confirm-delete button.is-danger')?.disabled,
  cancelActions: document.querySelectorAll('[data-overlay-action="cancel"]').length,
  impact: document.querySelector('.gi-confirm-delete')?.textContent || '',
}));
ok(r.deleteDisabled && r.cancelActions === 1,
  'Season deletion remains typed, disarmed, and cancel-safe', JSON.stringify(r));
ok(/1 game/.test(r.impact) && /0 plays/.test(r.impact) && /Managed film copies/.test(r.impact)
  && /Linked original folders are never deleted/.test(r.impact),
  'Season deletion names game/play impact and managed-versus-linked film consequences', r.impact);
await page.click('[data-overlay-action="cancel"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));
const afterDelete = await page.evaluate(() => JSON.stringify(window.app.teamHubScreen.snapshot().railSeasons.map(row => row.id)));
ok(beforeDelete === afterDelete, 'Canceling season deletion preserves the library');

// Team switching is still a service-level operation now that the duplicate
// full-page team selector has been retired. Exercise its fail-closed boundary
// against a real open season and a second registered team.
await page.evaluate(() => window.app.teamHubScreen.addTeam({ school: 'Bench Team' }));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'bench-team');
await page.evaluate(() => window.app.teamHubScreen.switchTeam('mavericks'));
await page.waitForFunction(() => window.app.teamRegistry.activeTeamId() === 'mavericks');
await page.evaluate(async () => {
  const season = window.app.teamHubScreen.snapshot().railSeasons[0];
  await window.app.teamHubScreen.openSeason(season.id);
});
await page.waitForFunction(() => window.app.storage.seasonStore.hasCurrent());
r = await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  const originalPersist = store.persist.bind(store);
  store.persist = async () => false;
  const switched = await window.app.teamHubScreen.switchTeam('bench-team');
  store.persist = originalPersist;
  return {
    switched,
    activeTeamId: window.app.teamRegistry.activeTeamId(),
    hasCurrent: store.hasCurrent(),
  };
});
ok(r.switched === false && r.activeTeamId === 'mavericks' && r.hasCurrent,
  'Team switch fails closed when the outgoing canonical season save fails', JSON.stringify(r));
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('.library-panel');

await page.evaluate(async () => {
  await window.app.teamHubScreen.load();
  const season = window.app.teamHubScreen.snapshot().railSeasons.find(row => row.kind !== 'scout');
  if (season) await window.app.teamHubScreen.openSeason(season.id);
});
await page.evaluate(() => { window.app.teamHubScreen.openEditSeason(); });
await page.waitForSelector('[data-overlay-id="team-hub-edit-season"]');
const editSeasonFonts = await page.evaluate(() => ({
  title: getComputedStyle(document.querySelector('[data-overlay-id="team-hub-edit-season"] .gi-overlay-head h2')).fontFamily,
  preview: getComputedStyle(document.querySelector('.gi-hub-name-preview strong')).fontFamily,
}));
ok(Object.values(editSeasonFonts).every(family => family.includes('IBM Plex Sans') && !family.includes('Condensed')),
  'Edit season details title and preview use the current sans type', JSON.stringify(editSeasonFonts));
await page.click('[data-overlay-id="team-hub-edit-season"] .gi-hub-form-actions button');
await page.evaluate(() => { window.app.settingsScreen.open({ initialTab: 'team' }); });
await page.waitForSelector('[data-settings-panel="team"]');
const identityInputs = '[data-settings-panel="team"] .gi-settings-field input';
await page.evaluate(selector => {
  const [school, nickname] = document.querySelectorAll(selector);
  school.value = 'St. Joseph';
  school.dispatchEvent(new Event('input', { bubbles: true }));
  nickname.value = 'Mavericks';
  nickname.dispatchEvent(new Event('input', { bubbles: true }));
}, identityInputs);
await page.click('[data-settings-panel="team"] .gi-settings-primary');
const identitySaved = await page.evaluate(() => ({
  notice: document.querySelector('.gi-settings-saved')?.textContent || '',
  profile: window.app.teamRegistry.teamProfile(),
  team: window.app.teamRegistry.teams().find(row => row.id === window.app.teamRegistry.activeTeamId()),
  game: window.app.storage.gameInfo.teamName,
  season: window.app.storage.seasonStore.data?.teamProfile?.teamName,
  kind: window.app.storage.seasonStore.data?.kind,
  games: window.app.storage.seasonStore.data?.games?.map(game => game.gameInfo?.teamName),
}));
ok(identitySaved.notice === 'Team identity saved' && identitySaved.profile.teamName === 'St. Joseph Mavericks'
  && identitySaved.team?.teamName === identitySaved.profile.teamName && identitySaved.game === identitySaved.profile.teamName,
  'Team identity save updates profile, registry, and active game together', JSON.stringify(identitySaved));
await page.evaluate(async () => {
  window.app.settingsScreen.close('identity-test');
  await window.app.storage.flushPendingSaves();
});
await page.reload({ waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamRegistry);
await page.evaluate(async () => {
  await window.app.teamHubScreen.load();
  const season = window.app.teamHubScreen.snapshot().railSeasons.find(row => row.kind !== 'scout');
  if (season) await window.app.teamHubScreen.openSeason(season.id);
});
const identityReopened = await page.evaluate(() => ({
  profile: window.app.teamRegistry.teamProfile().teamName,
  team: window.app.teamRegistry.teams().find(row => row.id === window.app.teamRegistry.activeTeamId())?.teamName,
  season: window.app.storage.seasonStore.data?.teamProfile?.teamName,
}));
ok(identityReopened.profile === 'St. Joseph Mavericks' && identityReopened.team === identityReopened.profile
  && identityReopened.season === identityReopened.profile,
  'Team identity remains aligned after a canonical save and application reopen', JSON.stringify(identityReopened));

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await page.evaluate(() => { scrollTo(0, 0); return new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
r = await page.evaluate(() => {
  const primary = document.querySelector('.library-panel-head .ws-primary');
  const box = primary?.getBoundingClientRect();
  return {
    overflow: document.documentElement.scrollWidth - innerWidth,
    route: document.getElementById('workspaceShell')?.dataset.route,
    primaryVisible: !!box && box.top >= 0 && box.bottom <= innerHeight && box.width > 0,
    teamHubHosts: document.querySelectorAll('[data-native-team-hub], #wsTeamHub').length,
  };
});
ok(r.overflow <= 1 && r.route === 'home' && r.primaryVisible && r.teamHubHosts === 0,
  'Mobile Home library preserves a reachable primary action without reviving Team Hub', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'home-library-390.png'), fullPage: true });

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
