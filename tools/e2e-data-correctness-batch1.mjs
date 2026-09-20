/**
 * Repair Batch 1 - data correctness regressions.
 *
 * Three defects, each asserted so that reintroducing it reds a named check:
 *
 *  B1-1  Season film-health counts. Managed film lives under the OWNING season,
 *        so `WorkspaceContext.filmHealth(game, seasonId)` and
 *        `StorageBackend.listFilmFiles(gameId, seasonId)` carry the season id to
 *        the filesystem lookup. Dropping it resolves against
 *        `backend.currentId`, which answers about the open season whenever two
 *        seasons reuse a game id. Fixture: two seasons, SAME game id, different
 *        film on disk.
 *
 *  B1-2  Drive grouping. A drive identity is possession side + drive number,
 *        because each team runs its own sequence. Keying on the raw
 *        `driveNumber` tag merged our Drive 1 with the opponent's Drive 1.
 *        Asserted in the shared owner (football-rules.js), in Breakdown's play
 *        strip, and in Study's `drive` dimension.
 *
 *  B1-3  Field Goal / XP. `unit:'fieldGoal'` is always "the subject
 *        attempting", so an opponent extra point charted there scored for us.
 *        New XP/try authoring exists only under Try / Defending a Try. Existing
 *        `unit:'fieldGoal', attemptType:'extraPoint'` records stay readable.
 *
 * Coach data is never touched: every fixture is synthetic and every store /
 * backend substitution is restored.
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import {
  groupPlaysByDrive, drivePossessionSide, driveNumberOf, driveLabel,
} from '../js/football-rules.js';
import { SpecialTeamsModel } from '../js/special-teams.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const REPO = dirname(dirname(fileURLToPath(import.meta.url)));
const source = name => readFileSync(join(REPO, 'js', name), 'utf8');

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -- ' + JSON.stringify(extra) : ''}`); }
};

// ---------------------------------------------------------------------------
// B1-1  The DESKTOP managed-film path. Chromium cannot exercise the Tauri
// filesystem, so the season-scoped directory resolution is pinned in source.
// This is the one half of B1-1 an installed check still has to confirm.
// ---------------------------------------------------------------------------
console.log('\n-- B1-1 desktop managed-film path (pinned in source) --');
{
  const backendSrc = source('storage-backend.js');
  ok(/async listFilmFiles\(gameId, seasonId = this\.currentId\)/.test(backendSrc),
    'TauriBackend.listFilmFiles takes the owning season id');
  ok(/async listFilmFiles\(gameId, seasonId = this\.currentId\) \{[\s\S]{0,200}?this\._filmsDir\(gameId, seasonId\)/.test(backendSrc),
    'TauriBackend.listFilmFiles resolves its directory from that season id, not currentId');
  ok(/_filmsDir\(gameId, seasonId = this\.currentId\) \{ return `seasons\/\$\{seasonId\}\/films\/\$\{gameId\}`/.test(backendSrc),
    'The managed film directory is built from an explicit season id');
  ok(/async listFilmFiles\(_gameId, _seasonId\)/.test(backendSrc),
    'The backend base class declares the season-scoped signature');

  // B1-4: every producer of an in-flight film operation must name the season it
  // pinned before its await. A caller that stops threading it silently reopens
  // the cross-season identity hole, which no in-page assertion can see.
  const appSrc = source('app.js');
  ok(/_showFilmImportProgress\(done, total, operation = 'saving', ownerGameId = null, ownerSeasonId = null\)/.test(appSrc),
    'The progress seam takes the owning season id');
  ok(/clearFilmOperation\(gameId, seasonId\)/.test(appSrc) && /setFilmOperation\(gameId, operation, \{ done, total \}, seasonId\)/.test(appSrc),
    'The progress seam passes that season id to both operation calls');
  const storageSrc = source('storage.js');
  const progressCalls = storageSrc.match(/_showFilmImportProgress\([^)]*\)/g) || [];
  ok(progressCalls.length === 3 && progressCalls.every(call => /game\.id, (film|repair)SeasonId/.test(call)),
    'Every film write reports progress against a season id pinned before its await', progressCalls);
  const clearCalls = storageSrc.match(/clearFilmOperation\([^)]*\)/g) || [];
  ok(clearCalls.length === 3 && clearCalls.every(call => /game\.id, (film|repair)SeasonId/.test(call)),
    'Every film-write failure path clears the operation it actually created', clearCalls);
}

// ---------------------------------------------------------------------------
// B1-2  Drive identity, in the shared owner. DOM-free, so imported directly.
// ---------------------------------------------------------------------------
console.log('\n-- B1-2 drive identity (football-rules) --');

const play = (id, unit, drive) => ({ id, tags: { unit, driveNumber: String(drive) } });
// Alternating possessions, both teams holding Drives 1 and 2.
const alternating = [
  play(1, 'offense', 1), play(2, 'offense', 1),
  play(3, 'defense', 1), play(4, 'defense', 1),
  play(5, 'offense', 2), play(6, 'offense', 2),
  play(7, 'defense', 2),
];
const groups = groupPlaysByDrive(alternating);
ok(groups.length === 4, 'Alternating possessions produce four drive groups, not two', groups.map(g => g.label));
ok(new Set(groups.map(g => g.key)).size === 4, 'Every drive group has a distinct identity key', groups.map(g => g.key));
ok(JSON.stringify(groups.map(g => g.label)) === JSON.stringify(['Our Drive 1', 'Opponent Drive 1', 'Our Drive 2', 'Opponent Drive 2']),
  'Each group names its possession side and number', groups.map(g => g.label));
ok(JSON.stringify(groups.map(g => g.plays.length)) === JSON.stringify([2, 2, 2, 1]),
  'No play leaks between the two teams\' same-numbered drives', groups.map(g => g.plays.length));
ok(groups[0].plays.every(p => p.tags.unit === 'offense') && groups[1].plays.every(p => p.tags.unit === 'defense'),
  'Our Drive 1 holds only our snaps and Opponent Drive 1 only theirs');

// A special-teams snap carries no proven possession owner, so it continues the
// surrounding drive of the same number rather than splitting it in two.
const withSpecial = groupPlaysByDrive([
  play(1, 'special', 1), play(2, 'offense', 1), play(3, 'special', 1),
  play(4, 'defense', 1),
]);
ok(withSpecial.length === 2 && withSpecial[0].plays.length === 3 && withSpecial[0].label === 'Our Drive 1',
  'A special-teams snap joins its surrounding drive instead of splitting it', withSpecial.map(g => [g.label, g.plays.length]));
ok(withSpecial[1].label === 'Opponent Drive 1', 'The possession change after a kick still starts a new drive', withSpecial[1].label);

// Legacy data with no charted unit keeps the plain label - possession is never
// invented from a blank field.
const legacy = groupPlaysByDrive([{ id: 1, tags: { driveNumber: '1' } }, { id: 2, tags: { driveNumber: '2' } }]);
ok(legacy.length === 2 && legacy[0].label === 'Drive 1' && legacy[1].label === 'Drive 2',
  'An untagged unit reports a plain drive label rather than inventing a side', legacy.map(g => g.label));
ok(groupPlaysByDrive([{ id: 1, tags: { unit: 'offense' } }])[0].label === 'No drive',
  'A snap with no drive number reports No drive');
ok(drivePossessionSide({ unit: 'offense' }) === 'subject' && drivePossessionSide({ unit: 'defense' }) === 'opponent'
  && drivePossessionSide({ unit: 'special' }) === '' && drivePossessionSide({}) === '',
  'Possession side is read from the charted unit only');
ok(driveNumberOf({ driveNumber: ' 3 ' }) === '3' && driveNumberOf({}) === '', 'Drive number is trimmed text');
ok(driveLabel('subject', '1', 'unit') === 'Offense Drive 1' && driveLabel('opponent', '1', 'unit') === 'Defense Drive 1',
  'Scout / cross-season wording names the unit instead of claiming a perspective');

// ---------------------------------------------------------------------------
// B1-3  Field Goal / XP ownership, in the pure model.
// ---------------------------------------------------------------------------
console.log('\n-- B1-3 field-goal / try ownership (SpecialTeamsModel) --');

ok(SpecialTeamsModel.defaultAttemptType('fieldGoal') === 'fieldGoal'
  && SpecialTeamsModel.defaultAttemptType('fieldGoalBlock') === 'fieldGoal',
  'A field-goal unit is seeded as a field-goal attempt');
ok(SpecialTeamsModel.defaultAttemptType('try') === null && SpecialTeamsModel.defaultAttemptType('kickoff') === null,
  'No other unit is seeded with an attempt type');

const tryEvent = (unit) => ({
  version: 1, unit, subjectRole: SpecialTeamsModel.ROLES[unit], attemptType: 'extraPoint',
  result: 'converted', events: {}, kick: {}, return: {}, outcome: {}, players: {},
});
ok(SpecialTeamsModel.scoringTeam(tryEvent('try')) === 'subject' && SpecialTeamsModel.points(tryEvent('try')) === 1,
  'Try credits the extra point to the attempting subject');
ok(SpecialTeamsModel.scoringTeam(tryEvent('tryDefense')) === 'opponent' && SpecialTeamsModel.points(tryEvent('tryDefense')) === 1,
  'Defending a Try credits the extra point to the other team');

// Read compatibility: a historical field-goal-shaped XP still normalizes with
// its attempt type and its one point intact. It is never rewritten.
const historical = SpecialTeamsModel.normalize({
  version: 1, unit: 'fieldGoal', attemptType: 'extraPoint', events: {}, kick: {}, return: {},
  outcome: { status: 'good', score: 'extraPoint' }, players: {},
});
ok(historical && historical.attemptType === 'extraPoint' && historical.outcome.score === 'extraPoint',
  'A historical field-goal-shaped extra point still reads as one', historical);
ok(SpecialTeamsModel.points(historical) === 1, 'A historical field-goal-shaped extra point still scores one point');

// ---------------------------------------------------------------------------
// In-page checks: the season-scoped film lookup, the play strip, the Study
// dimension, and the absence of any extra-point authoring route.
// ---------------------------------------------------------------------------
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const result = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const original = { data: store.data, id: store.currentSeasonId, backend: store.backend };
  const out = {};

  // ---- B1-1 season-scoped film health ------------------------------------
  // Two seasons reuse game id 'g1'. Season A has its clip on disk; season B
  // has none. A lookup that drops the season id falls back to currentId ('A')
  // and reports season B as fully linked.
  const disk = { A: [{ name: '001.mp4', path: 'endzone/001.mp4' }], B: [] };
  const calls = [];
  const backend = {
    currentId: 'A',
    supportsFilm: () => true,
    supportsLinkedFilm: () => false,
    listFilmFiles: async (gameId, seasonId) => {
      calls.push({ gameId: String(gameId), seasonId: seasonId === undefined ? '(omitted)' : String(seasonId) });
      return disk[String(seasonId ?? 'A')] || [];
    },
  };
  const gameFor = () => ({
    id: 'g1', name: 'Week 1', plays: [{ id: 1, tags: {}, clipPath: 'endzone/001', clipName: '001' }],
    clipPaths: ['endzone/001'], clipNames: ['001'], isMultiClip: true, filmMode: 'managed',
  });
  store.currentSeasonId = 'A';
  store.data = { id: 'A', seasonName: '2025 JV', games: [gameFor()], activeGameId: 'g1' };
  store.backend = backend;

  out.healthA = await app.workspace.filmHealth(gameFor(), 'A');
  out.healthB = await app.workspace.filmHealth(gameFor(), 'B');
  out.healthOpen = await app.workspace.filmHealth(gameFor());
  out.calls = calls.slice();

  // The Home/library aggregate consumes that same season-scoped result and
  // always prints an explicit count.
  const hub = app.teamHubScreen;
  out.aggA = await hub._aggregateFilm([gameFor()], 'A');
  out.aggB = await hub._aggregateFilm([gameFor()], 'B');
  out.aggMixed = await hub._aggregateFilm([gameFor(), { id: 'g2', plays: [], clipNames: [], isMultiClip: false }], 'A');
  out.aggNoGames = await hub._aggregateFilm([], 'A');

  // A LINKED game missing one clip is an ordinary partial season, not an
  // uncountable one: its per-game action is 'reconnect', and gating the
  // needs-attention branch on that action swallowed the count on the coach's
  // real 2025 JV season (89 expected, 88 on disk in one of six games).
  const linkedBackend = files => ({
    currentId: 'A', supportsFilm: () => true, supportsLinkedFilm: () => true,
    getLibraryRoot: () => 'D:/root',
    linkedGameDir: async dir => (dir === '(gone)' ? '' : `D:/root/${dir}`),
    isLinkedDirAllowed: () => true,
    listLinkedFilm: async () => files,
    listFilmFiles: async () => [],
  });
  const linkedGame = (id, dir) => ({
    id, filmMode: 'linked', filmDir: dir, isMultiClip: true,
    clipPaths: ['endzone/001', 'endzone/002'], clipNames: ['001', '002'],
    plays: [{ id: 1, clipPath: 'endzone/001' }, { id: 2, clipPath: 'endzone/002' }],
  });
  store.backend = linkedBackend([{ name: '001.mp4', path: 'endzone/001.mp4' }]);
  out.linkedPartialGame = await app.workspace.filmHealth(linkedGame('lg1', 'Week 1'), 'A');
  out.linkedPartialAgg = await hub._aggregateFilm([linkedGame('lg1', 'Week 1'), linkedGame('lg2', 'Week 2')], 'A');
  // An unavailable linked FOLDER genuinely cannot be counted, so it keeps the
  // needs-attention state rather than printing a fabricated count.
  out.linkedGoneAgg = await hub._aggregateFilm([linkedGame('lg3', '(gone)')], 'A');
  store.backend = { ...backend, listFilmFiles: async () => { throw new Error('managed listing failed'); } };
  out.managedListFailed = await hub._aggregateFilm([gameFor()], 'A');
  store.backend = backend;
  const realFilmHealth = app.workspace.filmHealth;
  app.workspace.filmHealth = async () => { throw new Error('film health failed'); };
  out.allLookupsFailed = await hub._aggregateFilm([gameFor()], 'A');
  app.workspace.filmHealth = async function(game, seasonId) {
    if (game.id === 'g2') throw new Error('one film health lookup failed');
    return realFilmHealth.call(this, game, seasonId);
  };
  out.oneLookupFailed = await hub._aggregateFilm([gameFor(), { id: 'g2', plays: [], clipNames: [] }], 'A');
  app.workspace.filmHealth = realFilmHealth;
  store.backend = backend;

  // ---- B1-4 in-flight film operations are season-scoped too --------------
  // Both seasons have their film on disk, so both are settled; only the season
  // actually saving may report the transient state. Keyed by game id alone, a
  // save in season A made season B report "Checking film..." over a real count.
  disk.B = [{ name: '001.mp4', path: 'endzone/001.mp4' }];
  const ws = app.workspace;
  ws.setFilmOperation('g1', 'saving', { done: 3, total: 10 }, 'A');
  out.opA = await ws.filmHealth(gameFor(), 'A');
  out.opB = await ws.filmHealth(gameFor(), 'B');
  out.opAggB = await hub._aggregateFilm([gameFor()], 'B');
  out.opAggA = await hub._aggregateFilm([gameFor()], 'A');
  // An explicit season clears exactly that season's operation.
  ws.clearFilmOperation('g1', 'A');
  out.opAfterClearA = await ws.filmHealth(gameFor(), 'A');
  // No season given: the fail-safe sweep removes every season's entry for this
  // game, so a stale operation can never pin a season on a transient label.
  ws.setFilmOperation('g1', 'saving', { done: 1, total: 4 }, 'A');
  ws.setFilmOperation('g1', 'repairing', { done: 2, total: 4 }, 'B');
  out.sweptReturn = ws.clearFilmOperation('g1');
  out.opSweptA = await ws.filmHealth(gameFor(), 'A');
  out.opSweptB = await ws.filmHealth(gameFor(), 'B');
  // Omitting the season at CREATION means the season open at that moment, not
  // every season that shares the id.
  ws.setFilmOperation('g1', 'saving', { done: 2, total: 5 });
  out.opDefaultA = await ws.filmHealth(gameFor(), 'A');
  out.opDefaultB = await ws.filmHealth(gameFor(), 'B');
  ws.clearFilmOperation('g1');
  out.opKey = app.workspace.constructor.operationKey('A', 'g1');
  disk.B = [];

  // ---- B1-2 the play strip groups on the composite identity --------------
  const theater = app.breakdownTheater;
  const strip = theater._driveGroups([
    { id: 1, tags: { unit: 'offense', driveNumber: '1' } },
    { id: 2, tags: { unit: 'defense', driveNumber: '1' } },
    { id: 3, tags: { unit: 'offense', driveNumber: '2' } },
    { id: 4, tags: { unit: 'defense', driveNumber: '2' } },
  ]);
  out.strip = strip.map(g => ({ key: g.key, label: g.label, n: g.plays.length }));

  // A scout season charts another team's film, so neither side is "ours".
  store.data = { ...store.data, kind: 'scout' };
  out.stripScout = theater._driveGroups([
    { id: 1, tags: { unit: 'offense', driveNumber: '1' } },
    { id: 2, tags: { unit: 'defense', driveNumber: '1' } },
  ]).map(g => g.label);
  delete store.data.kind;

  // ---- B1-2 Study's Drive dimension shares the identity ------------------
  const reg = app.analyticsRegistry;
  out.studyDrive = {
    ours: reg.values('drive', { tags: { unit: 'offense', driveNumber: '1' } }),
    theirs: reg.values('drive', { tags: { unit: 'defense', driveNumber: '1' } }),
    special: reg.values('drive', { tags: { unit: 'special', driveNumber: '1' } }),
    none: reg.values('drive', { tags: { unit: 'offense' } }),
  };
  out.driveCanonical = reg.getDimension('drive')?.canonical || '';

  // ---- B1-3 no extra-point authoring under the field-goal units ----------
  const tagging = app.nativeTagging;
  // The charting service must refuse an extra point on a field-goal unit, and
  // the screen must expose no action key that could author one.
  const play1 = { id: 1, tags: {}, specialTeams: null };
  const taggerStub = app.tagger;
  const realGet = taggerStub.getCurrentPlay;
  const realEmit = taggerStub._emit;
  taggerStub.getCurrentPlay = () => play1;
  taggerStub._emit = () => {};
  await app.breakdownCharting.setSpecialUnit('fieldGoal');
  out.seededAttempt = play1.specialTeams?.attemptType || null;
  out.attemptRouteRefused = tagging.specialAction('attempt', 'extraPoint') === false;
  out.attemptKeyGone = app.breakdownCharting.specialAction('stAttempt', 'extraPoint') === false;
  out.attemptAfterRefusal = play1.specialTeams?.attemptType || null;
  // The seeded attempt type is the unit's definition, not charted detail, so
  // switching units off an untouched field goal must not warn about data loss.
  out.untouchedHasNoDetails = app.breakdownCharting._hasSpecialDetails(play1.specialTeams) === false;
  taggerStub.getCurrentPlay = realGet;
  taggerStub._emit = realEmit;

  store.data = original.data; store.currentSeasonId = original.id; store.backend = original.backend;
  return out;
});

console.log('\n-- B1-1 season-scoped film health --');
ok(result.healthA.state === 'managed' && result.healthA.ready,
  'The season that owns the film reports it linked', result.healthA);
ok(result.healthB.state === 'missing' && result.healthB.missing === 1,
  'A different season reusing the same game id reports its own (missing) film', result.healthB);
ok(result.healthA.season === 'A' && result.healthB.season === 'B',
  'Every film-health result states the season it is about', [result.healthA.season, result.healthB.season]);
ok(result.healthOpen.season === 'A' && result.healthOpen.ready,
  'Omitting the season id means the OPEN season, not an unstated default', result.healthOpen);
ok(result.calls.length >= 2 && result.calls.every(c => c.seasonId !== '(omitted)'),
  'The season id reaches the filesystem lookup on every call', result.calls);
ok(result.calls.some(c => c.seasonId === 'B'),
  'The closed season is looked up under its own season id', result.calls);
ok(result.aggA.label === '1 of 1 game linked' && result.aggA.state === 'ready',
  'The library prints an explicit linked count for a fully linked season', result.aggA);
ok(result.aggB.label === '0 of 1 game linked' && result.aggB.state === 'partial',
  'A season whose film is absent prints its own count, not the open season\'s', result.aggB);
ok(result.aggMixed.label === '1 of 2 games linked' && result.aggMixed.state === 'partial',
  'A partly linked season prints N of M games linked', result.aggMixed);
ok(result.aggA.seasonId === 'A' && result.aggB.seasonId === 'B',
  'The aggregate result names the season it measured', [result.aggA.seasonId, result.aggB.seasonId]);
ok(result.aggNoGames.state === 'none' && result.aggNoGames.label === 'No games yet',
  'A season with no games says so rather than reporting a film count', result.aggNoGames);
ok(result.linkedPartialGame.state === 'missing' && result.linkedPartialGame.action === 'reconnect',
  'A linked game missing a clip still asks to reconnect at the game level', result.linkedPartialGame);
ok(result.linkedPartialAgg.state === 'partial' && result.linkedPartialAgg.label === '0 of 2 games linked',
  'A linked season missing one clip prints its count, not "Film needs attention"', result.linkedPartialAgg);
ok(result.linkedGoneAgg.state === 'missing' && result.linkedGoneAgg.label === 'Film needs attention',
  'A linked folder that cannot be reached keeps the needs-attention state', result.linkedGoneAgg);
ok(result.managedListFailed.state === 'missing' && result.managedListFailed.label === 'Film needs attention',
  'A failed managed listing cannot be reported as a linked count', result.managedListFailed);
ok(result.allLookupsFailed.state === 'missing' && result.allLookupsFailed.label === 'Film needs attention',
  'Rejected health lookups cannot become No film linked', result.allLookupsFailed);
ok(result.oneLookupFailed.state === 'missing' && result.oneLookupFailed.label === 'Film needs attention',
  'One rejected lookup invalidates a mixed season count', result.oneLookupFailed);

console.log('\n-- B1-4 in-flight film operations are season-scoped --');
ok(result.opA.state === 'saving' && result.opA.progress?.done === 3,
  'The season actually saving reports its own in-flight operation', result.opA);
ok(result.opB.state === 'managed' && result.opB.ready,
  'Another season reusing the game id reports its OWN settled film, not the operation', result.opB);
ok(result.opAggB.label === '1 of 1 game linked' && result.opAggB.state === 'ready',
  'The library prints the untouched season\'s real count, not "Checking film…"', result.opAggB);
ok(result.opAggA.state === 'checking',
  'The season with the in-flight write is the one that reads as checking', result.opAggA);
ok(result.opAfterClearA.state === 'managed' && result.opAfterClearA.ready,
  'Clearing with an explicit season releases that season', result.opAfterClearA);
ok(result.sweptReturn === true && result.opSweptA.state === 'managed' && result.opSweptB.state === 'managed',
  'Clearing without a season sweeps every season\'s entry for that game',
  [result.sweptReturn, result.opSweptA.state, result.opSweptB.state]);
ok(result.opDefaultA.state === 'saving' && result.opDefaultB.state === 'managed',
  'An operation created with no season id belongs to the season open at that moment',
  [result.opDefaultA.state, result.opDefaultB.state]);
ok(result.opKey === 'A::g1', 'The operation key is season plus game', result.opKey);

console.log('\n-- B1-2 play strip and Study dimension --');
ok(result.strip.length === 4 && new Set(result.strip.map(g => g.key)).size === 4,
  'The play strip renders four distinct drives for two teams with Drives 1 and 2', result.strip);
ok(JSON.stringify(result.strip.map(g => g.label)) === JSON.stringify(['Our Drive 1', 'Opponent Drive 1', 'Our Drive 2', 'Opponent Drive 2']),
  'The play strip labels each drive with its possession side', result.strip.map(g => g.label));
ok(JSON.stringify(result.stripScout) === JSON.stringify(['Offense Drive 1', 'Defense Drive 1']),
  'A scout season names the charted unit instead of claiming Our/Opponent', result.stripScout);
ok(JSON.stringify(result.studyDrive.ours) === JSON.stringify(['Offense Drive 1'])
  && JSON.stringify(result.studyDrive.theirs) === JSON.stringify(['Defense Drive 1']),
  'Study\'s Drive dimension separates the two possession sides', result.studyDrive);
ok(result.studyDrive.ours[0] !== result.studyDrive.theirs[0],
  'Study cannot place both teams\' Drive 1 in one bucket');
ok(JSON.stringify(result.studyDrive.special) === JSON.stringify(['Drive 1']),
  'A special-teams snap keeps a plain Study drive value', result.studyDrive.special);
ok(JSON.stringify(result.studyDrive.none) === JSON.stringify([]),
  'A snap with no drive number contributes no Study drive value', result.studyDrive.none);
ok(/driveLabel/.test(result.driveCanonical),
  'The Drive dimension declares the shared owner as its canonical source', result.driveCanonical);

console.log('\n-- B1-3 no field-goal extra-point authoring --');
ok(result.seededAttempt === 'fieldGoal',
  'A new field-goal event is already a field-goal attempt', result.seededAttempt);
ok(result.attemptRouteRefused, 'The screen exposes no action that authors an attempt type');
ok(result.attemptKeyGone, 'The charting service has no stAttempt route left to author an extra point');
ok(result.attemptAfterRefusal === 'fieldGoal',
  'A refused extra point leaves the field-goal attempt type untouched', result.attemptAfterRefusal);
ok(result.untouchedHasNoDetails,
  'The seeded attempt type is not treated as charted detail');

// The coach-facing vocabulary and the absence of the authoring control. The
// bundle is minified, so a literal-string search there cannot distinguish the
// deleted selector from the Study dimension label that legitimately reads
// "Extra Point" — these are asserted against the owning source instead.
{
  const bundleText = await page.evaluate(async () => {
    const src = [...document.querySelectorAll('script[type=module][src]')].map(s => s.src);
    const texts = await Promise.all(src.map(u => fetch(u).then(r => r.text()).catch(() => '')));
    return texts.join('\n');
  });
  ok(!/Field Goal \/ XP/.test(bundleText), 'The shipped bundle no longer offers a "Field Goal / XP" unit');

  /* The unit NAMES moved to their one owner on 2026-09-19 —
     `SpecialTeamsModel.UNIT_LABELS` — which the deck, the chyron, the Film Room
     grid, the Study dimension and the Reports ledger all read. The subject of
     this assertion is unchanged (the field-goal unit is `Field Goal`, never
     `Field Goal / XP`); it is asserted at the owner, plus the fact that the deck
     reads that owner instead of a private copy. The RENDERED unit chips are
     asserted in `e2e-native-tagging`, which has the charting deck on screen. */
  const modelLabels = source('special-teams.js');
  ok(/fieldGoal: 'Field Goal'/.test(modelLabels) && !/Field Goal \/ XP/.test(modelLabels),
    'The unit list presents the field-goal unit as "Field Goal"');
  const taggingSrc = source('native-tagging.jsx');
  ok(/ST_UNITS = SpecialTeamsModel\.unitOptions\(\)/.test(taggingSrc),
    'The deck takes its unit list from that owner rather than carrying its own copy');
  ok(!/Field Goal \/ XP/.test(taggingSrc), 'The "Field Goal / XP" unit label is gone from its owner');
  ok(!/\['extraPoint','Extra Point'\]/.test(taggingSrc),
    'No "Field Goal or Extra Point" attempt selector remains in the Special Teams editor');
  ok(!/specialAction\('attempt'/.test(taggingSrc), 'Nothing in the editor dispatches an attempt-type action');
  ok(!/isKickAttempt/.test(taggingSrc), 'The attempt-selector condition is deleted, not left dormant');

  const screenSrc = source('native-tagging-screen.js');
  ok(!/attempt:'stAttempt'/.test(screenSrc), 'The screen maps no action key to the deleted attempt route');
  const chartingSrc = source('breakdown-charting-service.js');
  ok(!/if \(key === 'stAttempt'\) return/.test(chartingSrc),
    'The charting service holds no stAttempt writer');
  ok(/attemptType:SpecialTeamsModel\.defaultAttemptType\(unit\)/.test(chartingSrc),
    'A new special-teams event takes its attempt type from the one owner');

  // Read compatibility is a contract, not a side effect: `normalize` must keep
  // accepting the historical value even though nothing can author it.
  const modelSrc = source('special-teams.js');
  ok(/value\.attemptType === 'fieldGoal' \|\| value\.attemptType === 'extraPoint'/.test(modelSrc),
    'The model still READS a historical field-goal-shaped extra point');
  const grid = source('play-grid.js');
  ok(/SpecialTeamsModel\.UNIT_LABELS/.test(grid) && !/Field Goal \/ XP/.test(grid),
    'The Film Room grid names the unit Field Goal');
}

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
