/**
 * TeamRegistry contract (S7-c).
 *
 * The native Team Hub used to reach into TWELVE private members of the legacy
 * SeasonLibrary overlay. Deleting that overlay on "nothing opens it" would have
 * taken team switching and post-wipe recovery with it. The data moved to
 * TeamRegistry first; this pins the contract at the service, where
 * `e2e-wipe-recovery` and `e2e-native-team-hub` can only exercise it through a
 * journey.
 *
 * Read-only with respect to coach data: every case runs on identity keys and
 * synthetic season metas. No season is written.
 */
import puppeteer from 'puppeteer';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (cond, name, extra = '') => {
  console.log(`  ${cond ? 'PASS' : 'FAIL'}  ${name}${cond ? '' : ' -- ' + extra}`);
  cond ? pass++ : fail++;
};

const browser = await puppeteer.launch({ headless: 'new', args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(String(e)));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamRegistry, { timeout: 20000 });

let r;

console.log('\n== 1. The service exists, owns no DOM, and replaced the overlay ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  const api = ['teams', 'activeTeamId', 'teamProfile', 'hasTeam', 'rosterKey', 'newTeamId',
    'seasonsForTeam', 'saveTeams', 'saveTeamProfile', 'setActiveTeamId', 'saveTeamIdentity',
    'clearIdentity', 'ensureRegistry', 'recoverFromWipe', 'checklistDismissed',
    'dismissChecklist', 'checklistItems'];
  return {
    missing: api.filter(k => typeof reg[k] !== 'function'),
    // The whole point of the extraction: no presentation reaches into this.
    domInSource: /getElementById|querySelector|classList|innerHTML/.test(
      Object.getOwnPropertyNames(Object.getPrototypeOf(reg))
        .map(k => String(reg[k])).join('\n')),
    legacyOverlayGone: !window.app.library && !document.getElementById('libraryOverlay'),
  };
});
ok(r.missing.length === 0, 'TeamRegistry exposes the full public identity API', JSON.stringify(r));
ok(r.domInSource === false, 'TeamRegistry touches no DOM, so presentation cannot leak back into it', JSON.stringify(r));
ok(r.legacyOverlayGone, 'The legacy SeasonLibrary controller and overlay are absent, not hidden', JSON.stringify(r));

console.log('\n== 2. Registry reconciliation — every branch ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  const keys = ['ffa_teams', 'ffa_team_profile', 'ffa_active_team_id', 'ffa_roster'];
  const saved = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
  const wipe = () => keys.forEach(k => localStorage.removeItem(k));
  const out = {};
  try {
    // (a) a pre-registry install: one profile, no registry. Becomes team one,
    //     and the existing roster belongs to it.
    wipe();
    localStorage.setItem('ffa_team_profile', JSON.stringify({ teamName: 'Mavericks', jerseyColor: 'blue' }));
    localStorage.setItem('ffa_roster', JSON.stringify([{ num: '7', name: 'QB' }]));
    reg.ensureRegistry();
    const migrated = reg.teams();
    out.migrate = {
      count: migrated.length, name: migrated[0]?.teamName,
      active: reg.activeTeamId() === migrated[0]?.id,
      rosterAdopted: localStorage.getItem(reg.rosterKey(migrated[0].id)) === JSON.stringify([{ num: '7', name: 'QB' }]),
    };

    // (b) self-heal: a registry with no active profile must re-adopt a team,
    //     or the pills and the profile disagree forever.
    wipe();
    localStorage.setItem('ffa_teams', JSON.stringify([{ id: 'jv', teamName: 'JV', jerseyColor: 'red' }]));
    reg.ensureRegistry();
    out.selfHeal = { profile: reg.teamProfile().teamName, active: reg.activeTeamId() };

    // (c) mirror-back: Game Info writes ffa_team_profile directly, so a renamed
    //     active team must be reflected in the registry entry.
    wipe();
    localStorage.setItem('ffa_teams', JSON.stringify([{ id: 'jv', teamName: 'Stale', jerseyColor: 'red' }]));
    localStorage.setItem('ffa_active_team_id', 'jv');
    localStorage.setItem('ffa_team_profile', JSON.stringify({ teamName: 'Renamed', jerseyColor: 'navy' }));
    reg.ensureRegistry();
    const mirrored = reg.teams()[0];
    out.mirror = { name: mirrored.teamName, color: mirrored.jerseyColor };

    // (d) idempotent: a second pass must change nothing.
    const before = localStorage.getItem('ffa_teams');
    reg.ensureRegistry();
    out.idempotent = localStorage.getItem('ffa_teams') === before;
  } finally {
    keys.forEach(k => saved[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[k]));
  }
  return out;
});
ok(r.migrate.count === 1 && r.migrate.name === 'Mavericks' && r.migrate.active && r.migrate.rosterAdopted,
  'A pre-registry install migrates to one team that owns the existing roster', JSON.stringify(r.migrate));
ok(r.selfHeal.profile === 'JV' && r.selfHeal.active === 'jv',
  'A registry with no active profile self-heals instead of showing first-run setup', JSON.stringify(r.selfHeal));
ok(r.mirror.name === 'Renamed' && r.mirror.color === 'navy',
  'A team renamed through Game Info is mirrored back into its registry entry', JSON.stringify(r.mirror));
ok(r.idempotent === true, 'Reconciliation is idempotent across repeated opens', JSON.stringify(r));

console.log('\n== 3. Season scoping — a season on disk is never invisible ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  const saved = localStorage.getItem('ffa_teams');
  try {
    localStorage.setItem('ffa_teams', JSON.stringify([
      { id: 'jv', teamName: 'JV' }, { id: 'varsity', teamName: 'Varsity' },
    ]));
    const metas = [
      { id: 's1', teamId: 'jv' },
      { id: 's2', teamId: 'varsity' },
      { id: 's3' },                    // legacy, never stamped
      { id: 's4', teamId: 'ghost' },   // stamped for a team the registry lost
    ];
    return {
      jv: reg.seasonsForTeam(metas, 'jv').map(s => s.id),
      varsity: reg.seasonsForTeam(metas, 'varsity').map(s => s.id),
    };
  } finally { saved == null ? localStorage.removeItem('ffa_teams') : localStorage.setItem('ffa_teams', saved); }
});
ok(r.jv.join(',') === 's1,s3,s4' && r.varsity.join(',') === 's2',
  'Legacy and orphaned-teamId seasons resolve to the first team rather than disappearing', JSON.stringify(r));

console.log('\n== 4. Team ids never collide ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  return {
    plain: reg.newTeamId('St. Joseph Mavericks', []),
    collide: reg.newTeamId('Mavericks', ['mavericks', 'mavericks-2']),
    blank: reg.newTeamId('', []),
  };
});
ok(r.plain === 'st-joseph-mavericks' && r.collide === 'mavericks-3' && r.blank === 'team',
  'Team ids slugify, avoid collisions, and never come out empty', JSON.stringify(r));

console.log('\n== 5. Team identity reaches game metadata WITHOUT hidden legacy inputs ==');
// This is the S7-d landmine the extraction had to close. The old path poked
// #gameTeamName / #gameJerseyColor inside #app and called _saveGameInfo(),
// which reads those inputs back. Once #app is deleted it would have become a
// no-op that still reported success.
r = await page.evaluate(async () => {
  const app = window.app;
  const reg = app.teamRegistry;
  await app.storage.loadDemoSeason();
  const savedProfile = localStorage.getItem('ffa_team_profile');
  const savedTeams = localStorage.getItem('ffa_teams');
  const before = JSON.stringify(app.storage.seasonStore.data);
  try {
    // Remove the hidden legacy inputs entirely — the state after S7-d.
    const removed = [];
    for (const id of ['gameTeamName', 'gameJerseyColor']) {
      const el = document.getElementById(id);
      if (el) { removed.push([el, el.parentElement, el.nextSibling]); el.remove(); }
    }
    const saved = reg.saveTeamIdentity('Bulldogs', 'maroon');
    const result = {
      saved,
      profile: reg.teamProfile(),
      gameInfoName: app.storage.gameInfo?.teamName,
      gameInfoColor: app.storage.gameInfo?.jerseyColor,
      inputsPresent: removed.length === 0,
      blankRejected: reg.saveTeamIdentity('   ') === false,
    };
    removed.forEach(([el, parent, next]) => parent?.insertBefore(el, next));
    return result;
  } finally {
    savedProfile == null ? localStorage.removeItem('ffa_team_profile') : localStorage.setItem('ffa_team_profile', savedProfile);
    savedTeams == null ? localStorage.removeItem('ffa_teams') : localStorage.setItem('ffa_teams', savedTeams);
    void before;
  }
});
ok(r.saved === true && r.profile.teamName === 'Bulldogs' && r.profile.jerseyColor === 'maroon',
  'Saving team identity writes the profile through the service', JSON.stringify(r));
ok(r.gameInfoName === 'Bulldogs' && r.gameInfoColor === 'maroon',
  'Team identity reaches the active game metadata with the hidden legacy inputs removed', JSON.stringify(r));
ok(r.blankRejected === true, 'A blank team name is refused rather than wiping the identity', JSON.stringify(r));

console.log('\n== 6. Post-wipe recovery keeps original team ids ==');
// Rebuilding a registry with FRESH ids is what made every season invisible in
// the field-reported bug: the metas still carried the old teamId. Recovery must
// group by the stamped id and keep it.
r = await page.evaluate(async () => {
  const app = window.app;
  const reg = app.teamRegistry;
  const keys = ['ffa_teams', 'ffa_team_profile', 'ffa_active_team_id'];
  const saved = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
  const realList = app.storage.seasonStore.listSeasons.bind(app.storage.seasonStore);
  const realBackend = app.storage.seasonStore.backend;
  try {
    keys.forEach(k => localStorage.removeItem(k));
    // Two teams' worth of season files survive on disk; identity is wiped.
    app.storage.seasonStore.listSeasons = async () => ([
      { id: 'a1', teamId: 'jv-2025', name: 'JV 2025', openedAt: 200 },
      { id: 'b1', teamId: 'varsity-2025', name: 'Varsity 2025', openedAt: 100 },
    ]);
    app.storage.seasonStore.backend = {
      setCurrentSeason() {},
      async loadSeason() { return { teamProfile: { teamName: 'Recovered', jerseyColor: 'gold' }, roster: [{ num: '1' }] }; },
    };
    const recovered = await reg.recoverFromWipe();
    const teams = reg.teams();
    return {
      recovered,
      ids: teams.map(t => t.id),
      names: teams.map(t => t.teamName),
      active: reg.activeTeamId(),
      // The whole point: the rebuilt ids still match the season metas.
      seasonsVisible: reg.seasonsForTeam(
        [{ id: 'a1', teamId: 'jv-2025' }, { id: 'b1', teamId: 'varsity-2025' }], 'jv-2025').map(s => s.id),
      // Identity intact must be left alone.
      secondPass: await reg.recoverFromWipe(),
    };
  } finally {
    app.storage.seasonStore.listSeasons = realList;
    app.storage.seasonStore.backend = realBackend;
    keys.forEach(k => saved[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[k]));
  }
});
ok(r.recovered === true && r.ids.join(',') === 'jv-2025,varsity-2025',
  'Wipe recovery rebuilds one team per stamped teamId and KEEPS the original ids', JSON.stringify(r));
ok(r.seasonsVisible.join(',') === 'a1',
  'Seasons on disk stay visible after recovery because their teamId still matches', JSON.stringify(r));
ok(r.names[0] === 'Recovered' && r.active === 'jv-2025',
  'Recovery restores the team name and profile from the season files', JSON.stringify(r));
ok(r.secondPass === false, 'Recovery is a no-op when identity is already intact', JSON.stringify(r));

console.log('\n== 7. Checklist truth ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  const saved = localStorage.getItem('ffa_checklist_dismissed');
  try {
    localStorage.removeItem('ffa_checklist_dismissed');
    const beforeDismiss = reg.checklistDismissed();
    reg.dismissChecklist();
    const afterDismiss = reg.checklistDismissed();
    const items = reg.checklistItems([{ id: 'demo-1', isDemo: true, plays: 40 }]);
    return {
      beforeDismiss, afterDismiss,
      steps: items.map(i => i.step),
      seasonStepDoneOnDemoOnly: items.find(i => i.step === 'season')?.done,
    };
  } finally { saved == null ? localStorage.removeItem('ffa_checklist_dismissed') : localStorage.setItem('ffa_checklist_dismissed', saved); }
});
ok(r.beforeDismiss === false && r.afterDismiss === true,
  'Dismissing the getting-started checklist persists', JSON.stringify(r));
ok(r.steps.join(',') === 'team,roster,season,play,stats' && r.seasonStepDoneOnDemoOnly === false,
  'Sample-season data never checks off a real-data onboarding milestone', JSON.stringify(r));

console.log('\n== 8. Clearing identity removes every key this service owns ==');
r = await page.evaluate(() => {
  const reg = window.app.teamRegistry;
  const keys = ['ffa_team_profile', 'ffa_active_team_id', 'ffa_checklist_dismissed', 'ffa_seen_stats'];
  const saved = Object.fromEntries(keys.map(k => [k, localStorage.getItem(k)]));
  try {
    keys.forEach(k => localStorage.setItem(k, 'x'));
    reg.clearIdentity();
    return { left: keys.filter(k => localStorage.getItem(k) !== null) };
  } finally { keys.forEach(k => saved[k] == null ? localStorage.removeItem(k) : localStorage.setItem(k, saved[k])); }
});
ok(r.left.length === 0,
  'Removing the last team clears every identity key together, leaving no half state', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
