/* S3 native Team Hub journey. Drives the actual route and BrowserBackend. */
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
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-native-team-hub]'));

let r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-native-team-hub]').length,
  first: !!document.querySelector('.gi-hub-first'),
  // S7-c: the legacy overlay is DELETED. `!el?.classList.contains(...)` would
  // read true once el is gone, so this asserts absence, which cannot invert.
  legacy: !!document.getElementById('libraryOverlay'),
  outlet: !!document.getElementById('wsClassicOutlet'), // S7: outlet deleted; absence is the assertion
  route: document.getElementById('workspaceShell')?.dataset.route,
}));
ok(r.native === 1 && r.first && !r.legacy && !r.outlet && r.route === 'team-hub',
  'Startup has one native Team Hub owner and never reveals the classic outlet', JSON.stringify(r));

await page.type('.gi-hub-first input[placeholder="St. Joseph Mavericks"]', 'Mavericks');
await page.select('.gi-hub-first select', 'blue');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForFunction(() => document.querySelectorAll('[data-hub-team]').length === 1);
r = await page.evaluate(() => ({
  active: document.querySelector('[data-hub-team].is-active')?.textContent.trim(),
  empty: document.querySelector('.gi-hub-empty')?.textContent || '',
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}'),
  setup: document.querySelector('.gi-hub-setup')?.textContent || '',
  steps: document.querySelectorAll('.gi-hub-setup-steps li').length,
}));
ok(r.active === 'Mavericks' && /No seasons yet/.test(r.empty) && r.profile.teamName === 'Mavericks',
  'First setup creates one active team and a clear empty-season state', JSON.stringify(r));
ok(r.steps === 5 && /1 of 5/.test(r.setup) && /Add your roster/.test(r.setup) && /Start a season/.test(r.setup),
  'Native Team Hub preserves the five-step setup progress with real completion state', JSON.stringify(r));

await page.click('.gi-hub-section-head .gi-hub-primary');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
await page.type('[data-overlay-id="team-hub-create-season"] input[name="seasonName"]', '2026 Mavericks');
const seasonNameAtSubmit = await page.$eval('[data-overlay-id="team-hub-create-season"] input[name="seasonName"]', input => input.value);
ok(seasonNameAtSubmit === '2026 Mavericks', 'rapid season-name entry reaches the submit boundary intact', JSON.stringify(seasonNameAtSubmit));
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
r = await page.evaluate(() => ({
  season: window.app.storage.seasonStore.data?.seasonName,
  teamId: window.app.storage.seasonStore.data?.teamId,
  home: !document.getElementById('wsHome')?.hidden,
  games: window.app.storage.seasonStore.data?.games?.length,
}));
ok(r.season === '2026 Mavericks' && r.teamId === 'mavericks' && r.home && r.games === 1,
  'Create season stores active-team ownership and hands off to Home', JSON.stringify(r));

await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-native-team-hub] [data-season-id]');
r = await page.evaluate(() => ({
  rows: document.querySelectorAll('[data-season-id]').length,
  current: document.querySelector('[data-season-id].is-current')?.textContent || '',
  film: document.querySelector('[data-season-id].is-current .gi-hub-film')?.textContent.trim(),
  // S7-c: the legacy overlay is DELETED. `!el?.classList.contains(...)` would
  // read true once el is gone, so this asserts absence, which cannot invert.
  legacy: !!document.getElementById('libraryOverlay'),
  outlet: !!document.getElementById('wsClassicOutlet'), // S7: outlet deleted; absence is the assertion
}));
ok(r.rows === 1 && /Current/.test(r.current) && /No film linked/.test(r.film) && !r.legacy && !r.outlet,
  'Current season is explicit with honest neutral film health and no legacy owner', JSON.stringify(r));
r = await page.evaluate(() => {
  const list = document.querySelector('.gi-hub-seasons').getBoundingClientRect();
  const row = document.querySelector('.gi-hub-season').getBoundingClientRect();
  const state = document.querySelector('.gi-hub-season-state').getBoundingClientRect();
  const open = document.querySelector('.gi-hub-season-open');
  const remove = document.querySelector('.gi-hub-delete');
  const openRect = open.getBoundingClientRect();
  const removeRect = remove.getBoundingClientRect();
  return {
    listWidth: Math.round(list.width), rowWidth: Math.round(row.width),
    stateVisible: state.left >= 0 && state.right <= innerWidth && row.top >= 0 && row.bottom <= innerHeight,
    openText: open.textContent.trim(), removeText: remove.textContent.trim(),
    actionGap: Math.round(removeRect.left - openRect.right),
    directionalCopy: /→/.test(document.querySelector('.gi-hub-season').textContent),
  };
});
ok(r.listWidth <= 1120 && r.rowWidth === r.listWidth && r.stateVisible,
  'Season rows stay compact and fully visible instead of stretching across the viewport', JSON.stringify(r));
ok(r.openText === 'Return to Home' && r.removeText === 'Delete' && r.actionGap >= 8 && !r.directionalCopy,
  'Open is a distinct primary action and Delete is separated without a misleading arrow', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'team-hub-1280.png'), fullPage: true });

await page.click('.gi-hub-add-team');
await page.waitForSelector('[data-overlay-id="team-hub-add-team"]');
await page.type('[data-overlay-id="team-hub-add-team"] input[placeholder="St. Joseph Mavericks"]', 'Mavericks JV');
ok(await page.$eval('[data-overlay-id="team-hub-add-team"] input[name="teamName"]', input => input.value === 'Mavericks JV'),
  'Rapid team-name entry reaches the submit boundary intact');
await page.click('[data-overlay-id="team-hub-add-team"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => document.querySelector('[data-hub-team].is-active')?.textContent.includes('JV'));
r = await page.evaluate(() => ({
  activeId: localStorage.getItem('ffa_active_team_id'),
  current: window.app.storage.seasonStore.currentSeasonId,
  seasons: document.querySelectorAll('[data-season-id]').length,
  roster: JSON.parse(localStorage.getItem('ffa_roster') || '[]'),
}));
ok(r.activeId === 'mavericks-jv' && !r.current && r.seasons === 0 && r.roster.length === 0,
  'Adding a team starts blank, closes outgoing season context, and scopes its season list', JSON.stringify(r));

await page.click('[data-hub-team="mavericks"]');
await page.waitForFunction(() => document.querySelector('[data-hub-team="mavericks"]')?.classList.contains('is-active'));
r = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-season-id]').length, current: !!document.querySelector('[data-season-id].is-current') }));
ok(r.rows === 1 && !r.current, 'Switching back shows only that team seasons without implicitly opening one', JSON.stringify(r));
ok(await page.$eval('[data-season-id] .gi-hub-film', node => node.textContent.trim() === 'Film status not checked'),
  'Closed-season film health names the subject instead of showing an ambiguous status');

await page.click('[data-hub-open-season]');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-season-id].is-current');
await page.evaluate(() => { window.__realPersist = window.app.storage.seasonStore.persist; window.app.storage.seasonStore.persist = async () => false; });
await page.click('[data-hub-team="mavericks-jv"]');
await new Promise(resolve => setTimeout(resolve, 100));
r = await page.evaluate(() => ({
  active: localStorage.getItem('ffa_active_team_id'),
  current: window.app.storage.seasonStore.currentSeasonId,
  toast: [...document.querySelectorAll('.gi-native-toast')].at(-1)?.textContent || '',
}));
ok(r.active === 'mavericks' && r.current && /not saved/.test(r.toast),
  'Team switch fails closed when the outgoing canonical season save fails', JSON.stringify(r));
await page.click('.gi-native-toast');
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
await page.evaluate(() => { window.app.storage.seasonStore.persist = window.__realPersist; });

const beforeDelete = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
await page.click('.gi-hub-delete');
await page.waitForSelector('[data-overlay-id] .gi-overlay-panel.is-destructive');
await page.waitForFunction(() => document.activeElement?.name === 'confirm');
r = await page.evaluate(() => ({
  message: document.querySelector('.gi-overlay-panel.is-destructive')?.textContent || '',
  initial: document.activeElement?.name || '',
  overlayInitialAction: window.app.overlays.snapshot().overlays.at(-1)?.initialAction || '',
  defaultActions: window.app.overlays.snapshot().overlays.at(-1)?.actions.filter(action => action.default).map(action => action.key) || [],
  cancelActions: document.querySelectorAll('[data-overlay-action="cancel"]').length,
  deleteDisabled: document.querySelector('.gi-confirm-delete button.is-danger')?.disabled,
}));
ok(/1 game/.test(r.message) && /0 plays/.test(r.message) && /Managed film copies/.test(r.message) && /Linked original folders are never deleted/.test(r.message),
  'Season delete names game/play impact and managed-versus-linked film consequences', JSON.stringify(r));
ok(r.initial === 'confirm' && r.overlayInitialAction === 'cancel' && JSON.stringify(r.defaultActions) === '["cancel"]',
  'Typed season delete focuses its confirmation field while Cancel remains the sole safe default action', JSON.stringify(r));
ok(r.cancelActions === 1 && r.deleteDisabled,
  'Season delete has one service-owned Cancel action and starts disarmed', JSON.stringify(r));
await page.type('.gi-confirm-delete input[name="confirm"]', 'dele');
ok(await page.$eval('.gi-confirm-delete button.is-danger', button => button.disabled),
  'An incomplete confirmation phrase cannot delete the season');
await page.type('.gi-confirm-delete input[name="confirm"]', 'te');
ok(await page.$eval('.gi-confirm-delete button.is-danger', button => !button.disabled),
  'The exact confirmation phrase arms the destructive action');
await page.click('[data-overlay-action="cancel"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));
const afterDeleteCancel = await page.evaluate(() => JSON.stringify(window.app.storage.seasonStore.data));
ok(beforeDelete === afterDeleteCancel, 'Canceling season delete preserves the complete open season byte-for-byte');
await page.click('.gi-hub-team-actions .is-danger');
await page.waitForSelector('[data-overlay-id] .gi-overlay-panel');
r = await page.evaluate(() => ({ title: document.querySelector('.gi-overlay-panel h2')?.textContent, text: document.querySelector('.gi-overlay-panel')?.textContent || '', destructive: !!document.querySelector('.gi-overlay-panel.is-destructive') }));
ok(/Team still has seasons/.test(r.title) && /owns 1 season/.test(r.text) && !r.destructive,
  'A team with seasons has no destructive removal path', JSON.stringify(r));
await page.click('[data-overlay-action="ok"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-layer'));

await page.click('#btnNativeTeamFilmSettings');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
ok(await page.evaluate(() => document.querySelectorAll('[data-overlay-id="team-film-settings"] [data-native-settings]').length === 1),
  'Team Hub opens the one native Team & Film Settings owner before a game is opened');
await page.evaluate(() => window.app.settingsScreen.close('test-complete'));

await page.click('.gi-hub-team-actions button:first-child');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-settings-panel="roster"]');
r = await page.evaluate(() => ({
  owners: document.querySelectorAll('[data-settings-panel="roster"]').length,
  legacy: !!document.getElementById('settingsDrawer') || !!document.getElementById('rosterPanel'),
  selected: document.querySelector('[data-settings-tab="roster"]')?.getAttribute('aria-current'),
}));
ok(r.owners === 1 && !r.legacy && r.selected === 'page',
  'Team Hub Roster action opens the canonical native roster workspace', JSON.stringify(r));
await page.evaluate(() => window.app.settingsScreen.close('test-complete'));

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await new Promise(resolve => setTimeout(resolve, 80));
r = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  small: [...document.querySelectorAll('[data-native-team-hub] button')].filter(button => button.getClientRects().length && button.getBoundingClientRect().height < 44).map(button => button.textContent.trim()),
  route: document.getElementById('workspaceShell')?.dataset.route,
}));
ok(!r.overflow && !r.small.length && r.route === 'team-hub',
  'Mobile Team Hub preserves complete touch access without page-level scrolling traps', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'team-hub-390.png'), fullPage: true });

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);