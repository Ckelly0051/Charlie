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

// School/nickname are separate fields now; type only the school so the
// composed teamName ([school, nickname].filter(Boolean).join(' ')) stays
// exactly "Mavericks", matching every downstream assertion below unchanged.
await page.type('.gi-hub-first input[name="school"]', 'Mavericks');
await page.select('.gi-hub-first select', 'blue');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForFunction(() => document.querySelectorAll('[data-hub-team]').length === 1);
r = await page.evaluate(() => ({
  active: document.querySelector('[data-hub-team].is-active')?.textContent.trim(),
  empty: document.querySelector('.gi-hub-empty-inline')?.textContent || '',
  profile: JSON.parse(localStorage.getItem('ffa_team_profile') || '{}'),
  setup: document.querySelector('.gi-hub-setup')?.textContent || '',
  steps: document.querySelectorAll('.gi-hub-setup-steps li').length,
}));
ok(r.active === 'Mavericks' && /Start the football year here/.test(r.empty) && r.profile.teamName === 'Mavericks',
  'First setup creates one active team and a clear empty-season state', JSON.stringify(r));
ok(r.steps === 5 && /1 of 5/.test(r.setup) && /Add your roster/.test(r.setup) && /Start a season/.test(r.setup),
  'Native Team Hub preserves the five-step setup progress with real completion state', JSON.stringify(r));

await page.click('.gi-hub-hero-action');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
r = await page.evaluate(() => ({
  options: [...document.querySelectorAll('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button')].map(button => ({ text: button.textContent.trim(), checked: button.getAttribute('aria-checked') })),
}));
ok(r.options.length === 2 && /Guided setup/.test(r.options[0].text) && r.options[0].checked === 'true' && /Set up manually/.test(r.options[1].text),
  'First season defaults to Guided setup and offers a full manual bypass', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'first-season-choice.png'), fullPage: true });
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button:nth-child(2)');
// Structured season creation (2026-08-31 Home naming contract) replaced the
// free-text season-name field with Year + Level, composed as "Year · Level".
// Prove rapid typed entry still reaches the submit boundary intact on the
// one remaining free-text field: the custom "Other" level name.
await page.select('[data-overlay-id="team-hub-create-season"] select[name="level"]', 'Other');
await page.type('[data-overlay-id="team-hub-create-season"] input[name="customLevel"]', 'Mavericks');
const levelAtSubmit = await page.$eval('[data-overlay-id="team-hub-create-season"] input[name="customLevel"]', input => input.value);
ok(levelAtSubmit === 'Mavericks', 'rapid season-detail entry reaches the submit boundary intact', JSON.stringify(levelAtSubmit));
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
r = await page.evaluate(() => ({
  season: window.app.storage.seasonStore.data?.seasonName,
  teamId: window.app.storage.seasonStore.data?.teamId,
  home: !document.getElementById('wsHome')?.hidden,
  games: window.app.storage.seasonStore.data?.games?.length,
}));
const seasonName = `${new Date().getFullYear()} · Mavericks`;
ok(r.season === seasonName && r.teamId === 'mavericks' && r.home && r.games === 1,
  'Create season stores active-team ownership and hands off to Home', JSON.stringify(r));
ok(!await page.$('[data-overlay-id="team-hub-season-setup"]'),
  'Set up manually bypasses the entire guided workflow');

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
r = await page.evaluate(() => ({ review: document.querySelector('[data-native-hub-review-setup]')?.textContent || '' }));
ok(/Season setup/.test(r.review) && /Review/.test(r.review),
  'Control Center keeps season setup available after creation', JSON.stringify(r));
await page.click('.gi-hub-hero-action');
await page.waitForSelector('[data-overlay-id="team-hub-create-season"]');
r = await page.evaluate(() => ({
  options: [...document.querySelectorAll('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button')].map(button => ({ text: button.textContent.trim(), checked: button.getAttribute('aria-checked') })),
}));
ok(/Quick create/.test(r.options[1].text) && r.options[1].checked === 'true' && /Use guided setup/.test(r.options[0].text),
  'Returning coaches default to Quick create while Guided setup remains optional', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'returning-season-choice.png'), fullPage: true });
await page.evaluate(() => {
  const hub = window.app.teamHubScreen;
  window.__guidedSetupProbe = { createSeason: hub.createSeason, openSeasonSetup: hub.openSeasonSetup, values: null, opens: 0 };
  hub.createSeason = async values => { window.__guidedSetupProbe.values = values; return { ok: true }; };
  hub.openSeasonSetup = () => { window.__guidedSetupProbe.opens += 1; return Promise.resolve(true); };
});
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-setup-mode button:first-child');
// createSeason is mocked above; only setupMode/opens are asserted from it,
// so the default valid Year + Level (Varsity) needs no typing to submit.
await page.click('[data-overlay-id="team-hub-create-season"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => window.__guidedSetupProbe?.opens === 1);
r = await page.evaluate(() => {
  const probe = window.__guidedSetupProbe;
  const result = { mode: probe.values?.setupMode, opens: probe.opens };
  window.app.teamHubScreen.createSeason = probe.createSeason;
  window.app.teamHubScreen.openSeasonSetup = probe.openSeasonSetup;
  delete window.__guidedSetupProbe;
  return result;
});
ok(r.mode === 'guided' && r.opens === 1, 'Selecting Guided setup hands the successful canonical creation boundary to the guide', JSON.stringify(r));
await page.click('[data-native-hub-review-setup]');
await page.waitForSelector('[data-overlay-id="team-hub-season-setup"] .gi-season-guide');
r = await page.evaluate(() => ({
  title: document.querySelector('.gi-season-guide h2')?.textContent.trim(),
  steps: [...document.querySelectorAll('.gi-season-guide-steps li')].map(row => row.textContent.trim()),
  skip: document.querySelector('.gi-season-guide .gi-hub-form-actions button')?.textContent,
}));
ok(r.title === seasonName && r.steps.length === 5 && /Season details/.test(r.steps[0]) && /Roster/.test(r.steps[1]) && /Film storage/.test(r.steps[2]) && /First game/.test(r.steps[3]) && /Ready to chart/.test(r.steps[4]) && /Skip guide/.test(r.skip),
  'Review season setup reopens one resumable, fully skippable guide', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'season-setup-guide.png'), fullPage: true });
await page.click('.gi-season-guide .gi-hub-form-actions button');
await page.waitForFunction(() => document.getElementById('workspaceShell')?.dataset.route === 'home');
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('[data-native-team-hub] [data-season-id]');
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
    // This row is intentionally below the 900px fold in the full Team Hub.
    // The regression is horizontal stretching/overflow; vertical visibility
    // belongs to the document scroll journey, not a viewport-containment check.
    stateFitsWidth: state.left >= 0 && state.right <= innerWidth,
    openText: open.textContent.trim(), removeText: remove.textContent.trim(),
    actionGap: Math.round(removeRect.left - openRect.right),
    directionalCopy: /→/.test(document.querySelector('.gi-hub-season').textContent),
  };
});
ok(r.listWidth <= 1120 && r.rowWidth === r.listWidth && r.stateFitsWidth,
  'Season rows stay compact and fully visible instead of stretching across the viewport', JSON.stringify(r));
ok(r.openText === 'Return to Home' && r.removeText === 'Delete' && r.actionGap >= 8 && !r.directionalCopy,
  'Open is a distinct primary action and Delete is separated without a misleading arrow', JSON.stringify(r));
if (shotDir) await page.screenshot({ path: path.join(shotDir, 'team-hub-1280.png'), fullPage: true });

await page.click('.gi-hub-add-team');
await page.waitForSelector('[data-overlay-id="team-hub-add-team"]');
// School/nickname are separate fields now; typing the whole label into
// school (nickname left blank) still composes teamName === 'Mavericks JV'.
await page.type('[data-overlay-id="team-hub-add-team"] input[name="school"]', 'Mavericks JV');
ok(await page.$eval('[data-overlay-id="team-hub-add-team"] input[name="school"]', input => input.value === 'Mavericks JV'),
  'Rapid team-name entry reaches the submit boundary intact');
await page.click('[data-overlay-id="team-hub-add-team"] .gi-hub-form-actions .is-primary');
await page.waitForFunction(() => document.querySelector('[data-hub-team].is-active')?.textContent.includes('JV'));
r = await page.evaluate(() => ({
  activeId: localStorage.getItem('ffa_active_team_id'),
  current: window.app.storage.seasonStore.currentSeasonId,
  seasons: document.querySelectorAll('[data-season-id]').length,
  roster: window.app.roster.players,
}));
ok(r.activeId === 'mavericks-jv' && !r.current && r.seasons === 0 && r.roster.length === 0,
  'Adding a team starts blank, closes outgoing season context, and scopes its season list', JSON.stringify(r));

await page.click('[data-hub-team="mavericks"]');
await page.waitForFunction(() => document.querySelector('[data-hub-team="mavericks"]')?.classList.contains('is-active'));
r = await page.evaluate(() => ({ rows: document.querySelectorAll('[data-season-id]').length, current: !!document.querySelector('[data-season-id].is-current') }));
ok(r.rows === 1 && !r.current, 'Switching back shows only that team seasons without implicitly opening one', JSON.stringify(r));
// S8-1: a closed (non-current) season's film health is now verified in the
// background against its OWN stored data via SeasonStore.peekSeason, instead
// of being stuck on a permanent "Film status not checked" placeholder. This
// season's one auto-seeded game has no film at all, so it honestly resolves
// to "No film linked" rather than staying an ambiguous non-answer.
await page.waitForFunction(() => document.querySelector('[data-season-id] .gi-hub-film')?.textContent.trim() === 'No film linked', { timeout: 5000 });
ok(true, 'Closed-season film health resolves to a real aggregate instead of a permanent "not checked" placeholder');

r = await page.evaluate(async () => {
  const store = window.app.storage.seasonStore;
  const hub = window.app.teamHubScreen;
  const realPeek = store.peekSeason.bind(store);
  // Never resolves: reproduces the moment verification is genuinely pending.
  store.peekSeason = () => new Promise(() => {});
  await hub.load();
  const pendingLabel = document.querySelector('[data-season-id] .gi-hub-film')?.textContent.trim();
  store.peekSeason = realPeek;
  await hub.load();   // restore real (resolving) state before continuing the journey
  await new Promise(resolve => setTimeout(resolve, 30));
  const resolvedLabel = document.querySelector('[data-season-id] .gi-hub-film')?.textContent.trim();
  return { pendingLabel, resolvedLabel };
});
ok(/Checking film/.test(r.pendingLabel), 'A season row reads an honest "Checking film…" state while verification is pending, never "not checked"', JSON.stringify(r));
ok(r.resolvedLabel === 'No film linked', 'The pending state resolves to a real aggregate once verification completes', JSON.stringify(r));

r = await page.evaluate(async () => {
  const hub = window.app.teamHubScreen;
  const before = JSON.stringify(hub._state.seasons.map(s => ({ id: s.id, film: s.film })));
  const staleToken = hub._loadToken - 1;   // guaranteed to disagree with the live _loadToken
  const rigged = async () => ({ state: 'none', label: 'STALE ANSWER SHOULD NEVER APPEAR', expected: 0, found: 0, missing: 0 });
  const real = hub._aggregateFilm.bind(hub);
  hub._aggregateFilm = rigged;
  hub._verifyFilmHealth(hub._state.seasons, hub._state.currentSeasonId, staleToken);
  await new Promise(resolve => setTimeout(resolve, 30));
  hub._aggregateFilm = real;
  const after = JSON.stringify(hub._state.seasons.map(s => ({ id: s.id, film: s.film })));
  return { before, after };
});
ok(r.before === r.after, 'A film check run under a stale load token cannot patch the live season list', JSON.stringify(r));

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
