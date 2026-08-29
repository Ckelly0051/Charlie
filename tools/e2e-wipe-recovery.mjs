import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
// Regression harness for the update-wipe data-loss bug (field-reported).
// A desktop app update can wipe WebView localStorage (team registry, profile,
// identity) while the season files survive on disk. Before the fix, the app
// showed FIRST-RUN SETUP over the coach's data and every season was filtered
// out of view (teamId matched no registry team) — reading as total data loss.
//
// Models the wipe in the browser build by clearing ONLY the identity keys
// (ffa_teams / ffa_team_profile / ffa_active_team_id) while
// keeping ffa_library + ffa_season_* (the "files on disk" equivalent).
//
// Asserts: auto-recovery rebuilds the registry from season files, the team
// card shows the original name (no setup screen), the seasons list shows the
// season, and opening it restores both plays and its season-owned roster.
import puppeteer from 'puppeteer';
import { fileURLToPath } from 'url';
import path from 'path';

const here = path.dirname(fileURLToPath(import.meta.url));
const bundle = TEST_APP_URL;

let pass = 0, fail = 0;
const check = (name, ok, extra = '') => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`);
  ok ? pass++ : fail++;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
await page.goto(bundle, { waitUntil: 'load' });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'load' });
await page.waitForSelector('.gi-hub-first');

// ---- Seed: team + roster + season + tagged plays ----
await page.type('.gi-hub-first input[placeholder="St. Joseph Mavericks"]', 'Mavericks');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForSelector('[data-hub-team].is-active');
await page.evaluate(async () => {
  await window.app.storage.createSeason({ name: 'Fall 2026' });
  window.app.roster.loadFrom([
    { num: '22', name: 'Marcus Carter', pos: 'RB', side: 'O' },
    { num: '55', name: 'Dee Jones', pos: 'LB', side: 'D' },
  ]);
  window.app.playbook.add({ name: '26 Blast', concept: 'Blast', defaults: { runPass: 'Run', playType: 'Run Inside', playDir: 'Right' } });
  const t = window.app.tagger;
  t.plays.push(
    { id: 1, timestamp: { start: 0, end: 10 }, tags: { down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '7', unit: 'offense', players: {}, grades: {}, custom: [] }, notes: 'Power R 34' },
    { id: 2, timestamp: { start: 10, end: 20 }, tags: { down: '2', distance: '3', playType: 'Short Pass', runPass: 'Pass', result: 'Touchdown', yardage: '23', unit: 'offense', players: {}, grades: {}, custom: [] }, notes: '' }
  );
  t.nextId = 3;
  window.app.storage.commitActive();
  await window.app.storage.seasonStore.persist();
});
await new Promise(r => setTimeout(r, 400));

const seeded = await page.evaluate(() => ({
  teams: JSON.parse(localStorage.getItem('ffa_teams') || '[]').length,
  seasonKeys: Object.keys(localStorage).filter(k => k.startsWith('ffa_season_')).length,
}));
check('seeded: registry + season blob present', seeded.teams === 1 && seeded.seasonKeys >= 1, JSON.stringify(seeded));

// ---- Simulate the update wipe: identity keys gone, season files survive ----
await page.evaluate(() => {
  const teams = JSON.parse(localStorage.getItem('ffa_teams') || '[]');
  localStorage.removeItem('ffa_teams');
  localStorage.removeItem('ffa_team_profile');
  localStorage.removeItem('ffa_active_team_id');
  teams.forEach(t => localStorage.removeItem('ffa_playbook_' + t.id));
  localStorage.removeItem('ffa_checklist_dismissed');
  localStorage.removeItem('ffa_seen_stats');
});
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1000));

// ---- Assert auto-recovery ----
const rec = await page.evaluate(() => {
  const teams = JSON.parse(localStorage.getItem('ffa_teams') || '[]');
  const profile = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}');
  const hub = document.querySelector('[data-native-team-hub]');
  return {
    setupHidden: !document.querySelector('.gi-hub-first'),
    teamShown: !!document.querySelector('[data-hub-team].is-active'),
    teamText: document.querySelector('[data-hub-team].is-active')?.textContent || '',
    teamCount: teams.length,
    teamName: (teams[0] || {}).teamName,
    profileName: profile.teamName,
    rosterInMemory: window.app.roster.players.length,
    playbook: window.app.playbook.list(),
    listText: hub?.textContent || '',
  };
});
check('NO first-run setup screen over existing data', rec.setupHidden, JSON.stringify(rec));
check('native Team Hub restores the original team', rec.teamShown && rec.teamText.includes('Mavericks'));
check('registry rebuilt with original team', rec.teamCount === 1 && rec.teamName === 'Mavericks', JSON.stringify(rec));
check('profile restored', rec.profileName === 'Mavericks');
check('no roster is overlaid before a season is opened', rec.rosterInMemory === 0, 'got ' + rec.rosterInMemory);
check('team playbook restored from the newest season mirror', rec.playbook.length === 1 && rec.playbook[0].name === '26 Blast' && rec.playbook[0].defaults.playDir === 'Right', JSON.stringify(rec.playbook));
check('recovered season is visible in Team Hub', rec.listText.includes('Fall 2026'), rec.listText.slice(0, 200));

// ---- Open the recovered season: plays intact ----
const opened = await page.evaluate(async () => {
  const metas = await window.app.storage.seasonStore.listSeasons();
  const meta = metas.find(m => m.name === 'Fall 2026');
  if (!meta) return { error: 'meta missing' };
  await window.app.storage.openSeasonById(meta.id);
  return {
    plays: window.app.tagger.plays.length,
    notes: (window.app.tagger.plays[0] || {}).notes,
    roster: window.app.roster.players.map(player => player.name),
  };
});
await new Promise(r => setTimeout(r, 300));
check('recovered season opens with both plays', opened.plays === 2, JSON.stringify(opened));
check('play data intact (notes survived)', opened.notes === 'Power R 34');
check('season-owned roster restores only when its season opens', opened.roster.join('|') === 'Marcus Carter|Dee Jones', JSON.stringify(opened.roster));

// ---- Orphan fallback: user re-did setup BEFORE getting the fix ----
await page.evaluate(() => {
  // Wipe identity again, then plant a NEW registry team (what re-running
  // setup on the broken build produced): old seasons' teamId is now orphaned.
  localStorage.removeItem('ffa_team_profile');
  localStorage.removeItem('ffa_active_team_id');
  localStorage.setItem('ffa_teams', JSON.stringify([{ id: 'fresh-team', teamName: 'Fresh Team', jerseyColor: '' }]));
});
await page.reload({ waitUntil: 'load' });
await new Promise(r => setTimeout(r, 1000));
const orphan = await page.evaluate(() => ({
  listText: document.querySelector('[data-native-team-hub]')?.textContent || '',
}));
check('orphaned season still visible under rebuilt team', orphan.listText.includes('Fall 2026'), orphan.listText.slice(0, 200));

const benign = errors.filter(e => !/Failed to load because no supported source|The element has no supported sources/.test(e));
check('no unexpected page errors', benign.length === 0, benign.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
