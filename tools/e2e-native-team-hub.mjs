/* S3 native Team Hub journey. Drives the actual route and BrowserBackend. */
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
page.on('pageerror', error => errors.push(error.stack || error.message));
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-native-team-hub]'));

let r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-native-team-hub]').length,
  first: !!document.querySelector('.gi-hub-first'),
  legacy: !document.getElementById('libraryOverlay')?.classList.contains('hidden'),
  outlet: !document.getElementById('wsClassicOutlet')?.hidden,
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
}));
ok(r.active === 'Mavericks' && /No seasons yet/.test(r.empty) && r.profile.teamName === 'Mavericks',
  'First setup creates one active team and a clear empty-season state', JSON.stringify(r));

await page.click('.gi-hub-section-head .gi-hub-primary');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
await page.type('[data-overlay-id="team-hub-create-season"] input[placeholder*="2026"]', '2026 Mavericks');
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
  legacy: !document.getElementById('libraryOverlay')?.classList.contains('hidden'),
  outlet: !document.getElementById('wsClassicOutlet')?.hidden,
}));
ok(r.rows === 1 && /Current/.test(r.current) && /No film linked/.test(r.film) && !r.legacy && !r.outlet,
  'Current season is explicit with honest neutral film health and no legacy owner', JSON.stringify(r));

await page.click('.gi-hub-add-team');
await page.waitForSelector('[data-overlay-id="team-hub-add-team"]');
await page.type('[data-overlay-id="team-hub-add-team"] input[placeholder="St. Joseph Mavericks"]', 'Mavericks JV');
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
await page.waitForFunction(() => document.activeElement?.dataset.overlayAction === 'cancel');
r = await page.evaluate(() => ({
  message: document.querySelector('.gi-overlay-panel.is-destructive')?.textContent || '',
  initial: document.activeElement?.dataset.overlayAction || '',
}));
ok(/1 game/.test(r.message) && /0 plays/.test(r.message) && /Managed film copies/.test(r.message) && /Linked original folders are never deleted/.test(r.message),
  'Season delete names game/play impact and managed-versus-linked film consequences', JSON.stringify(r));
ok(r.initial === 'cancel', 'Season delete defaults focus to Cancel', JSON.stringify(r));
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
await page.waitForFunction(() => document.getElementById('settingsDrawer')?.classList.contains('open'));
r = await page.evaluate(() => ({
  drawer: document.getElementById('settingsDrawer')?.classList.contains('open'),
  roster: !document.getElementById('rosterPanel')?.classList.contains('collapsed'),
}));
ok(r.drawer && r.roster,
  'Team Hub Roster action opens the canonical roster workspace', JSON.stringify(r));
await page.evaluate(() => window.app.uiPolish?._closeDrawer?.());

await page.setViewport({ width: 390, height: 844, isMobile: true, hasTouch: true });
await new Promise(resolve => setTimeout(resolve, 80));
r = await page.evaluate(() => ({
  overflow: document.documentElement.scrollWidth > document.documentElement.clientWidth,
  small: [...document.querySelectorAll('[data-native-team-hub] button')].filter(button => button.getClientRects().length && button.getBoundingClientRect().height < 44).map(button => button.textContent.trim()),
  route: document.getElementById('workspaceShell')?.dataset.route,
}));
ok(!r.overflow && !r.small.length && r.route === 'team-hub',
  'Mobile Team Hub preserves complete touch access without page-level scrolling traps', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);