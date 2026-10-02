/**
 * An opponent scout BELONGS to one program season, and the workspace switch is
 * one atomic transition.
 *
 * Charlie found this at the board on 2026-09-14: entering Opponent Scout from an
 * open program season visibly moved through Opponent Scout, then Home/library,
 * then an automatic redirect into an unrelated season. The cause was three
 * defects stacked:
 *
 *   1. No parent relationship existed. Scouts were independent season records
 *      keyed only by teamId/year/level, and `_workspaceTarget()` substituted
 *      "most recently opened season of that kind" for ownership.
 *   2. The workspace mode had no owner. `TeamHubScreen._state.workspaceMode`,
 *      `localStorage['giq_home_workspace']` and `WorkspaceShell._isScoutWorkspace()`
 *      (which preferred `store.data.kind`) were three sources for one fact.
 *   3. The transition was a SEQUENCE of navigations: set mode -> load() ->
 *      search by lastOpened -> openSeason() -> show('home'), or `_openLibrary()`
 *      when nothing matched. Every intermediate step rendered.
 *
 * `programSeasonId` is now the durable relationship, `WorkspaceContext` is its
 * one owner, and a switch performs one state change and one render.
 *
 * Mutation-verified: team-wide `lastOpened` scout selection, `_openLibrary()`
 * during a toggle, auto-opening a scout on entering Scout mode, omitting
 * `programSeasonId` on create, listing another parent's scouts, and inferring an
 * ambiguous legacy parent each turn a specific section red. Recorded in
 * docs/OPEN-DEFECTS.md.
 */
import puppeteer from './test-browser.mjs';
import { APP_URL } from './app-entry.mjs';
import { WorkspaceContext } from '../js/workspace-context.js';

let pass = 0, fail = 0;
const ok = (condition, label, detail = '') => condition
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${detail ? ` -- ${detail}` : ''}`));

/* ── 1. The compatibility boundary is pure and decided before any browser ── */
console.log('\n== 1. Legacy parent resolution never guesses ==');
const jv = { id: 'p-jv', kind: 'program', teamId: 't1', year: '2026', level: 'JV' };
const varsity = { id: 'p-var', kind: 'program', teamId: 't1', year: '2026', level: 'Varsity' };
const otherTeam = { id: 'p-other', kind: 'program', teamId: 't2', year: '2026', level: 'JV' };
const seasons = [jv, varsity, otherTeam];

let r = WorkspaceContext.resolveScoutParent({ id: 's1', kind: 'scout', programSeasonId: 'p-var', teamId: 't1', year: '2026', level: 'JV' }, seasons);
ok(r.status === 'explicit' && r.programSeasonId === 'p-var',
  'a stored programSeasonId wins outright, even against a team/year/level match', JSON.stringify(r));

r = WorkspaceContext.resolveScoutParent({ id: 's2', kind: 'scout', teamId: 't1', year: '2026', level: 'JV' }, seasons);
ok(r.status === 'inferred' && r.programSeasonId === 'p-jv',
  'a legacy scout with exactly ONE compatible program season is inferred', JSON.stringify(r));

r = WorkspaceContext.resolveScoutParent({ id: 's3', kind: 'scout', teamId: 't1', year: '2026', level: '' }, seasons);
ok(r.status === 'unassigned' && r.programSeasonId === '',
  'an ambiguous legacy scout is NOT assigned', JSON.stringify(r));

r = WorkspaceContext.resolveScoutParent({ id: 's4', kind: 'scout', teamId: 't9', year: '2026', level: 'JV' }, seasons);
ok(r.status === 'unassigned' && r.candidates.length === 0,
  'a legacy scout with no compatible program season is NOT assigned', JSON.stringify(r));

/* lastOpened must be unable to influence ownership at all. */
const byRecency = [
  { id: 's-jv', kind: 'scout', programSeasonId: 'p-jv', lastOpened: '2020-01-01' },
  { id: 's-var', kind: 'scout', programSeasonId: 'p-var', lastOpened: '2030-01-01' },
];
const scoped = WorkspaceContext.scoutsForParent([...seasons, ...byRecency], 'p-jv');
ok(scoped.length === 1 && scoped[0].id === 's-jv',
  'the most recently opened scout of another parent is not in this parent\'s library', JSON.stringify(scoped.map(s => s.id)));
ok(WorkspaceContext.scoutsForParent([...seasons, ...byRecency], '').length === 0,
  'with no parent context no scout is listed -- an empty parent never means "all"');

/* ── the live app ───────────────────────────────────────────────────────── */
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
await page.setViewport({ width: 1440, height: 900 });
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.storage && window.app?.teamHubScreen && window.app?.workspace);

/* Two program seasons for one team, same year, different levels. */
const built = await page.evaluate(async () => {
  const S = window.app.storage;
  const made = {};
  for (const [key, meta] of Object.entries({
    jv: { name: 'SJM JV 2026', team: 'Mavericks', year: '2026', level: 'JV' },
    varsity: { name: 'SJM Varsity 2026', team: 'Mavericks', year: '2026', level: 'Varsity' },
  })) {
    await S.createSeason(meta);
    made[key] = S.seasonStore.currentSeasonId;
  }
  return made;
});
ok(!!built.jv && !!built.varsity && built.jv !== built.varsity,
  'two program seasons exist for one team at the same year', JSON.stringify(built));

console.log('\n== 2. Entering Opponent Scout is ONE transition, and opens nothing ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace;
  await S.openSeasonById(ids.jv);
  await hub.load();
  // Instrument every navigation the old implementation used as a transition
  // step. None of them may run for a workspace toggle.
  const calls = [];
  const shell = window.app.workspaceShell;
  const realLibrary = shell._openLibrary, realOpen = S.openSeasonById, realClose = S.seasonStore.closeSeason;
  shell._openLibrary = async (...a) => { calls.push('openLibrary'); return realLibrary.apply(shell, a); };
  S.openSeasonById = async (...a) => { calls.push(`openSeasonById:${a[0]}`); return realOpen.apply(S, a); };
  S.seasonStore.closeSeason = (...a) => { calls.push('closeSeason'); return realClose.apply(S.seasonStore, a); };
  // Count renders: every _set() emits to subscribers.
  let renders = 0;
  const off = hub.subscribe(() => { renders++; });
  renders = 0;
  const before = { parent: ctx.programSeasonId(), mode: ctx.workspaceMode(), open: S.seasonStore.currentSeasonId };
  const switched = await hub.selectWorkspace('scout');
  const after = { parent: ctx.programSeasonId(), mode: ctx.workspaceMode(), open: S.seasonStore.currentSeasonId };
  off();
  shell._openLibrary = realLibrary; S.openSeasonById = realOpen; S.seasonStore.closeSeason = realClose;
  return { switched, before, after, calls, renders, scoutMode: shell._isScoutWorkspace() };
}, built);
ok(r.switched === true && r.after.mode === 'scout' && r.scoutMode === true,
  'the switch reports success and the shell agrees the mode is scout', JSON.stringify(r));
ok(r.after.parent === built.jv && r.after.parent === r.before.parent,
  'the parent program season is unchanged by entering Opponent Scout', JSON.stringify({ before: r.before, after: r.after }));
ok(r.after.open === built.jv,
  'the program season stays OPEN -- the scout library does not close it', JSON.stringify(r.after));
ok(!r.calls.includes('openLibrary'), 'the toggle does not call _openLibrary()', JSON.stringify(r.calls));
ok(!r.calls.includes('closeSeason'), 'the toggle does not call closeSeason()', JSON.stringify(r.calls));
ok(!r.calls.some(c => c.startsWith('openSeasonById')),
  'the toggle auto-opens NO season -- least of all a scout', JSON.stringify(r.calls));

console.log('\n== 3. An empty scout library is that parent\'s own empty state ==');
r = await page.evaluate(() => {
  const hub = window.app.teamHubScreen, s = hub.snapshot();
  return { mode: s.workspaceMode, parent: s.programSeasonId, parentName: s.parentSeasonName, scouts: s.seasons.length, rail: s.railSeasons.length };
});
ok(r.mode === 'scout' && r.scouts === 0, 'the parent has no scouts yet, so the list is empty', JSON.stringify(r));
ok(r.parent === built.jv && /JV/.test(r.parentName),
  'the parent season is still named in scout mode, so the context is visible', JSON.stringify(r));
ok(r.rail >= 2, 'the rail still carries the program seasons for navigation', String(r.rail));

console.log('\n== 4. A created scout stores its parent, durably ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace;
  const result = await hub.createScout({
    opponent: 'Central', year: '2026', level: 'JV',
    sourceTeamA: 'Central', sourceTeamB: 'North',
  });
  const liveParent = S.seasonStore.data?.programSeasonId || '';
  const metas = await S.listSeasons();
  const meta = metas.find(m => m.id === result.seasonId) || {};
  const body = await S.seasonStore.backend.loadSeason(result.seasonId);
  return {
    ok: result.ok, seasonId: result.seasonId, liveParent,
    metaParent: meta.programSeasonId || '', bodyParent: body?.programSeasonId || '',
    metaKind: meta.kind, ctxParent: ctx.programSeasonId(), ctxMode: ctx.workspaceMode(),
    expected: ids.jv,
  };
}, built);
ok(r.ok === true && r.metaKind === 'scout', 'the scout was created', JSON.stringify(r));
ok(r.liveParent === built.jv && r.bodyParent === built.jv,
  'the scout body stores the exact parent program season id', JSON.stringify(r));
ok(r.metaParent === built.jv,
  'the library meta carries it too, so a list can be scoped without peeking bodies', JSON.stringify(r));
ok(r.ctxParent === built.jv && r.ctxMode === 'scout',
  'creating a scout does not move the parent context', JSON.stringify(r));
const scoutId = r.seasonId;

console.log('\n== 5. Returning to Our Program goes to the EXACT parent ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace;
  const opens = [];
  const realOpen = S.openSeasonById;
  S.openSeasonById = async (...a) => { opens.push(String(a[0])); return realOpen.apply(S, a); };
  const shell = window.app.workspaceShell;
  const realLibrary = shell._openLibrary;
  let library = 0;
  shell._openLibrary = async (...a) => { library++; return realLibrary.apply(shell, a); };
  const switched = await hub.selectWorkspace('program');
  S.openSeasonById = realOpen; shell._openLibrary = realLibrary;
  return {
    switched, opens, library, open: S.seasonStore.currentSeasonId,
    parent: ctx.programSeasonId(), mode: ctx.workspaceMode(),
    seasons: hub.snapshot().seasons.map(s => s.id),
  };
}, built);
ok(r.switched === true && r.open === built.jv && r.parent === built.jv,
  'the exact parent program season is the open season again', JSON.stringify(r));
ok(r.opens.length === 1 && r.opens[0] === built.jv,
  'exactly ONE season open call, targeting the parent id', JSON.stringify(r.opens));
ok(r.library === 0, 'returning does not pass through the season library', String(r.library));
ok(!r.seasons.includes(scoutId), 'Our Program lists no scouts', JSON.stringify(r.seasons));

console.log('\n== 6. Scout libraries are parent-scoped, not team-wide ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  // A second scout, under the OTHER program season.
  await S.openSeasonById(ids.varsity);
  await hub.load();
  await hub.selectWorkspace('scout');
  const created = await hub.createScout({
    opponent: 'Riverside', year: '2026', level: 'Varsity',
    sourceTeamA: 'Riverside', sourceTeamB: 'South',
  });
  // Back to the JV parent and look at its scout library.
  await S.openSeasonById(ids.jv);
  await hub.load();
  await hub.selectWorkspace('scout');
  const jvScouts = hub.snapshot().seasons.map(s => s.id);
  await S.openSeasonById(ids.varsity);
  await hub.load();
  // Opening a DIFFERENT program season is a new parent context, so it correctly
  // starts on Our Program -- its scout library is a deliberate second step.
  const modeAfterParentChange = hub.snapshot().workspaceMode;
  await hub.selectWorkspace('scout');
  const varsityScouts = hub.snapshot().seasons.map(s => s.id);
  return { varsityScoutId: created.seasonId, jvScouts, varsityScouts, modeAfterParentChange, mode: hub.snapshot().workspaceMode };
}, built);
ok(r.modeAfterParentChange === 'program',
  'switching to another program season starts on Our Program, not its scout library', r.modeAfterParentChange);
ok(r.jvScouts.length === 1 && r.jvScouts[0] === scoutId,
  'the JV parent lists only its own scout', JSON.stringify(r.jvScouts));
ok(r.varsityScouts.length === 1 && r.varsityScouts[0] === r.varsityScoutId,
  'the Varsity parent lists only its own scout', JSON.stringify(r.varsityScouts));
ok(!r.jvScouts.includes(r.varsityScoutId) && !r.varsityScouts.includes(scoutId),
  'neither parent can see the other\'s scout, at the same team and year', JSON.stringify(r));

console.log('\n== 7. Opening a scout keeps its parent, and returning uses it ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace;
  // Start from the WRONG parent to prove the scout carries its own.
  await S.openSeasonById(ids.varsity);
  await hub.load();
  await hub.selectWorkspace('scout');
  const target = hub.snapshot().seasons[0]?.id || '';
  await S.openSeasonById(target);
  await hub.load();
  const onScout = { open: S.seasonStore.currentSeasonId, parent: ctx.programSeasonId(), mode: ctx.workspaceMode() };
  const back = await hub.selectWorkspace('program');
  return { target, onScout, back, open: S.seasonStore.currentSeasonId, parent: ctx.programSeasonId() };
}, built);
ok(r.onScout.open === r.target && r.onScout.mode === 'scout',
  'the scout is the open document', JSON.stringify(r.onScout));
ok(r.onScout.parent === built.varsity,
  'the parent context is the scout\'s own stored parent', JSON.stringify(r.onScout));
ok(r.back === true && r.open === built.varsity && r.parent === built.varsity,
  'Our Program returns to that exact parent in one transition', JSON.stringify(r));

console.log('\n== 8. A legacy scout is surfaced, never silently attached ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  const store = S.seasonStore;
  const teamId = (await S.listSeasons()).find(m => m.id === ids.jv)?.teamId || '';
  /* A LEGACY scout is a real library record that carries no programSeasonId --
     created through the backend's own library path (so it is genuinely listed),
     then its body written without the field. Saving a body for an id the
     library never registered would produce a record no list can see, and the
     section would pass by measuring nothing. */
  const legacy = async (name, year, level) => {
    const rec = await store.backend.createSeason({ name, year, level, kind: 'scout', teamId, team: 'Mavericks' });
    const realId = rec.id;
    const body = {
      id: realId, type: 'season', version: 5, seasonName: name, kind: 'scout',
      teamId, year, level, roster: [], rosterOwnership: 'season',
      games: [{ id: `${realId}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
      activeGameId: `${realId}-g1`,
    };
    await store.backend.saveSeason(realId, body);
    return realId;
  };
  const soloId = await legacy('2026 · JV · Legacy Solo Scout', '2026', 'JV');
  const ambigId = await legacy('Legacy Ambiguous Scout', '2026', '');
  const listed = await S.listSeasons();
  await S.openSeasonById(ids.jv);
  await hub.load();
  await hub.selectWorkspace('scout');
  const snap = hub.snapshot();
  const metas = await S.listSeasons();
  return {
    soloId, ambigId,
    inLibrary: [soloId, ambigId].filter(id => listed.some(m => m.id === id && m.kind === 'scout')),
    listedParents: [soloId, ambigId].map(id => listed.find(m => m.id === id)?.programSeasonId ?? '(missing)'),
    scouts: snap.seasons.map(s => s.id),
    unassigned: (snap.unassignedScouts || []).map(s => s.id),
    parent: snap.programSeasonId, mode: snap.workspaceMode,
    soloStored: metas.find(m => m.id === soloId)?.programSeasonId || '',
    ambigStored: metas.find(m => m.id === ambigId)?.programSeasonId || '',
  };
}, built);
ok(r.inLibrary.length === 2 && r.listedParents.every(v => v === ''),
  'the fixture really is two LISTED scouts carrying no programSeasonId', JSON.stringify({ inLibrary: r.inLibrary, parents: r.listedParents }));
ok(r.scouts.includes(r.soloId),
  'a legacy scout with one safe parent match appears in that parent\'s library', JSON.stringify({ scouts: r.scouts, parent: r.parent, mode: r.mode }));
ok(!r.scouts.includes(r.ambigId),
  'an ambiguous legacy scout is not placed in any parent library', JSON.stringify(r.scouts));
ok(r.unassigned.includes(r.ambigId),
  'it is surfaced as needing assignment instead of being hidden', JSON.stringify(r.unassigned));
ok(r.soloStored === '' && r.ambigStored === '',
  'NEITHER inference was written to disk -- reading is not assigning', JSON.stringify(r));

console.log('\n== 9. The RENDERED rail rows open their exact season ==');
/* Driven through real DOM clicks, not controller calls, because the defect this
   pins was invisible to a controller call: `openSeason()` answered "is this
   season already open?" from the clicked ROW's cached `current` flag. A row
   carries that flag from the `load()` that built it, and `load()` cancels itself
   when a newer one starts (`_loadToken`), so a superseded pass left rows still
   flagged current for a season the coach had navigated away from -- and the
   click then skipped the open and reported success. The rail row looked dead,
   intermittently, depending on which load won the race. The store is now the
   authority for that question. */
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  await S.openSeasonById(ids.jv);
  await hub.load();
  await window.app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 400));
  const click = async id => {
    const sel = `.rail-row[data-season-id="${id}"]`;
    const node = document.querySelector(sel);
    if (!node) return { clicked: false };
    const box = node.getBoundingClientRect();
    // Deliberately STALE the row flags the way a cancelled load would, so the
    // assertion fails if the cached flag is ever trusted again.
    hub._state.railSeasons = (hub._state.railSeasons || []).map(row => ({ ...row, current: true }));
    node.click();
    await new Promise(res => setTimeout(res, 900));
    return {
      clicked: true, rendered: box.width > 0 && box.height > 0,
      open: S.seasonStore.currentSeasonId,
      kind: S.seasonStore.data?.kind || 'program',
      parent: window.app.workspace.programSeasonId(),
      mode: window.app.workspace.workspaceMode(),
      active: document.querySelectorAll('.rail-row.is-current').length,
      library: document.querySelectorAll('.library-panel-head').length,
    };
  };
  // Program season open -> click a SCOUT row.
  await hub.selectWorkspace('scout');
  const scoutId = hub.snapshot().seasons[0]?.id || '';
  const toScout = await click(scoutId);
  // Scout open -> click a PROGRAM row.
  const toProgram = await click(ids.varsity);
  return { scoutId, toScout, toProgram };
}, built);
ok(r.toScout.clicked && r.toScout.rendered && r.toScout.open === r.scoutId && r.toScout.kind === 'scout',
  'Clicking a Scout row while a program season is open opens that exact scout', JSON.stringify(r.toScout));
ok(r.toScout.parent === built.jv && r.toScout.mode === 'scout',
  'That open keeps the scout\'s parent and changes the mode once', JSON.stringify(r.toScout));
ok(r.toProgram.clicked && r.toProgram.open === built.varsity && r.toProgram.kind !== 'scout',
  'Clicking a Program row while a scout is open opens that exact program season -- even with every row flagged stale-current',
  JSON.stringify(r.toProgram));
ok(r.toProgram.parent === built.varsity && r.toProgram.mode === 'program',
  'The parent follows the deliberately opened program season, in one mode change', JSON.stringify(r.toProgram));
ok(r.toScout.active === 1 && r.toProgram.active === 1,
  'Exactly one rail row is active after each rendered click', JSON.stringify({ scout: r.toScout.active, program: r.toProgram.active }));

console.log('\n== 10. A parent is only valid while it exists and is not a scout ==');
r = (() => {
  const pool = [jv, varsity, { id: 's-x', kind: 'scout', programSeasonId: 'p-jv' }];
  return {
    real: WorkspaceContext.isValidParent(pool, 'p-jv'),
    missing: WorkspaceContext.isValidParent(pool, 'p-gone'),
    scout: WorkspaceContext.isValidParent(pool, 's-x'),
    blank: WorkspaceContext.isValidParent(pool, ''),
  };
})();
ok(r.real === true, 'a live program season is a valid parent');
ok(r.missing === false, 'a dangling id -- a deleted or imported foreign parent -- is not', String(r.missing));
ok(r.scout === false, 'a scout can never be another scout\'s parent', String(r.scout));
ok(r.blank === false, 'an empty id is not a parent', String(r.blank));

console.log('\n== 11. A team switch takes the parent context with it ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace, reg = window.app.teamRegistry;
  // Team A already holds a parent from the sections above.
  await S.openSeasonById(hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id);
  await hub.load();
  const teamA = { team: reg.activeTeamId(), parent: ctx.programSeasonId() };
  const added = await hub.addTeam({ teamName: 'Second School', school: 'Second School', nickname: 'Hawks' });
  const afterSwitch = { team: reg.activeTeamId(), parent: ctx.programSeasonId(), mode: ctx.workspaceMode() };
  // Same year and level as Team A's season, so a team-blind match would collide.
  await hub.createSeason({ year: '2026', level: 'JV' });
  await hub.load();
  const teamBParent = ctx.programSeasonId();
  await hub.selectWorkspace('scout');
  const made = await hub.createScout({
    opponent: 'Crosstown', year: '2026', level: 'JV',
    sourceTeamA: 'Crosstown', sourceTeamB: 'Second School',
  });
  const metas = await S.listSeasons();
  const scoutMeta = metas.find(m => m.id === made.seasonId) || {};
  // And a stale persisted context from Team A must not survive validation when
  // no season is open to overwrite it -- the reload-after-team-switch shape.
  S.seasonStore.closeSeason();
  ctx.setParentSeason(teamA.parent);
  await hub.load();
  return {
    added: added.ok, teamA, afterSwitch, teamBParent,
    scoutParent: scoutMeta.programSeasonId || '', scoutId: made.seasonId,
    afterValidation: ctx.programSeasonId(),
    listedForTeamB: hub.snapshot().seasons.map(s => s.id),
  };
});
ok(r.added && r.afterSwitch.team !== r.teamA.team, 'a second team was added and became active', JSON.stringify({ a: r.teamA.team, b: r.afterSwitch.team }));
ok(r.afterSwitch.parent === '' && r.afterSwitch.mode === 'program',
  'the switch CLEARS the outgoing team\'s parent context', JSON.stringify(r.afterSwitch));
ok(r.teamBParent && r.teamBParent !== r.teamA.parent,
  'the new team\'s own season becomes its parent', JSON.stringify({ a: r.teamA.parent, b: r.teamBParent }));
ok(r.scoutParent === r.teamBParent,
  'a scout created under Team B stores Team B\'s program season, at the same year and level', JSON.stringify(r));
ok(r.afterValidation === '',
  'a persisted parent from another team is dropped on validation, not used', JSON.stringify(r.afterValidation));

console.log('\n== 12. An unassigned scout carries no borrowed parent ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace, st = S.seasonStore;
  const programA = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  await S.openSeasonById(programA);
  await hub.load();
  const held = ctx.programSeasonId();
  /* A genuinely UNASSIGNED scout: no stored parent AND no unique compatible
     program season, so the documented read-only inference cannot resolve it
     either. A blank level matches no program season exactly, which is the
     first-launch shape (the scout exists before any season does). */
  const rec = await st.backend.createSeason({
    name: 'Unassigned Opponent · Scout', year: '2026', level: '', kind: 'scout',
    teamId: window.app.teamRegistry.activeTeamId(), team: 'Second School',
  });
  await st.backend.saveSeason(rec.id, {
    id: rec.id, type: 'season', version: 5, seasonName: 'Unassigned Opponent · Scout', kind: 'scout',
    teamId: window.app.teamRegistry.activeTeamId(), year: '2026', level: '', roster: [], rosterOwnership: 'season',
    games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
    activeGameId: `${rec.id}-g1`,
  });
  await S.openSeasonById(rec.id);
  await hub.load();
  const onScout = { parent: ctx.programSeasonId(), mode: ctx.workspaceMode(), open: st.currentSeasonId };
  const back = await hub.selectWorkspace('program');
  const after = { parent: ctx.programSeasonId(), open: st.currentSeasonId, mode: ctx.workspaceMode() };
  return { held, scoutId: rec.id, onScout, back, after, unassigned: (hub.snapshot().unassignedScouts || []).map(s => s.id) };
});
ok(r.held && r.onScout.open === r.scoutId, 'a program season was the parent, then an unassigned scout was opened', JSON.stringify(r));
ok(r.onScout.parent === '',
  'opening it CLEARS the parent instead of borrowing the program season that was held', JSON.stringify(r.onScout));
ok(r.back === false && r.after.open === r.scoutId && r.after.mode === 'scout',
  'Our Program refuses rather than substituting a stale parent -- the scout stays open', JSON.stringify(r.after));
ok(r.unassigned.includes(r.scoutId),
  'the scout is listed for assignment, not lost', JSON.stringify(r.unassigned));
const unassignedId = r.scoutId;

console.log('\n== 13. Assignment is explicit, durable, and verified ==');
r = await page.evaluate(async (scoutId) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore;
  const target = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  const blank = await hub.assignScoutToSeason(scoutId, '');
  const bogus = await hub.assignScoutToSeason(scoutId, 'no-such-season');
  const untouched = String((await st.peekSeason(scoutId))?.programSeasonId || '');
  // A failed durable write must leave it unassigned and say so.
  const realSave = st.backend.saveSeason.bind(st.backend);
  st.backend.saveSeason = async (id, data) => (id === scoutId ? false : realSave(id, data));
  const failed = await hub.assignScoutToSeason(scoutId, target);
  st.backend.saveSeason = realSave;
  const afterFailure = {
    stored: String((await st.peekSeason(scoutId))?.programSeasonId || ''),
    unassigned: (hub.snapshot().unassignedScouts || []).map(s => s.id),
  };
  const good = await hub.assignScoutToSeason(scoutId, target);
  const body = await st.peekSeason(scoutId);
  const meta = (await S.listSeasons()).find(m => m.id === scoutId) || {};
  const again = await hub.assignScoutToSeason(scoutId, target);
  return {
    target, blank, bogus, untouched, failed, afterFailure, good, again,
    bodyParent: String(body?.programSeasonId || ''), metaParent: String(meta.programSeasonId || ''),
    games: (body?.games || []).length, opponent: body?.scout?.opponentSchool ?? null,
  };
}, unassignedId);
ok(r.blank.ok === false && r.bogus.ok === false && r.untouched === '',
  'no parent, or a parent that is not a live program season, is refused and writes nothing', JSON.stringify(r));
ok(r.failed.ok === false && /unchanged and still unassigned/.test(r.failed.message || '')
  && r.afterFailure.stored === '' && r.afterFailure.unassigned.includes(unassignedId),
  'a failed durable write reports failure and leaves the scout unassigned', JSON.stringify({ failed: r.failed, after: r.afterFailure }));
ok(r.good.ok === true && r.bodyParent === r.target && r.metaParent === r.target,
  'a confirmed assignment persists to the season body AND the library row', JSON.stringify(r));
ok(r.games === 1 && r.opponent === null,
  'assignment touches no game, film, tag, roster or opponent-identity field', JSON.stringify({ games: r.games, opponent: r.opponent }));
ok(r.again.ok === false && /already belongs/.test(r.again.message || ''),
  'an already assigned scout is not silently reassigned (reassignment deferred)', JSON.stringify(r.again));

r = await page.evaluate(async (scoutId) => {
  const S = window.app.storage, hub = window.app.teamHubScreen, ctx = window.app.workspace;
  const parent = String((await S.listSeasons()).find(m => m.id === scoutId)?.programSeasonId || '');
  // Reload simulation: drop every live handle and re-read from durable storage.
  S.seasonStore.data = null; S.seasonStore.currentSeasonId = null;
  await S.openSeasonById(parent);
  await hub.load();
  await hub.selectWorkspace('scout');
  return {
    parent, listed: hub.snapshot().seasons.map(s => s.id),
    unassigned: (hub.snapshot().unassignedScouts || []).map(s => s.id),
    ctxParent: ctx.programSeasonId(),
  };
}, unassignedId);
ok(r.listed.includes(unassignedId) && !r.unassigned.includes(unassignedId),
  'after a reload the assigned scout appears under its parent and no longer in the unassigned list', JSON.stringify(r));

console.log('\n== 14. A parent that owns scouts cannot be deleted away ==');
r = await page.evaluate(async (scoutId) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  const parent = String((await S.listSeasons()).find(m => m.id === scoutId)?.programSeasonId || '');
  const owned = await hub._ownedScouts(parent);
  // Drive the REAL command. It opens a blocking, non-destructive dialog and
  // resolves false only once the coach dismisses it, so the promise is held and
  // dismissed from the harness rather than awaited inline.
  window.__deleteResult = hub.deleteSeason(parent);
  return { parent, owned: owned.map(s => s.id) };
}, unassignedId);
const deleteDialog = await page.evaluate(async () => {
  await new Promise(res => setTimeout(res, 300));
  const panel = document.querySelector('[data-overlay-id], .gi-overlay-panel');
  const text = panel?.textContent || '';
  const button = [...(panel?.querySelectorAll('button') || [])].find(b => /close/i.test(b.textContent));
  const hasButton = !!button;
  if (button) button.click();
  await new Promise(res => setTimeout(res, 250));
  const deleted = await window.__deleteResult;
  const S = window.app.storage;
  const metas = await S.listSeasons();
  return {
    text, hasButton, deleted,
    stillThere: metas.some(m => m.id === window.__deleteParent),
    destructive: /delete/i.test(panel?.className || ''),
  };
});
r = await page.evaluate(async (scoutId) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  const parent = String((await S.listSeasons()).find(m => m.id === scoutId)?.programSeasonId || '');
  const owned = await hub._ownedScouts(parent);
  const metas = await S.listSeasons();
  const stillThere = metas.some(m => m.id === parent);
  const scoutSurvives = metas.some(m => m.id === scoutId);
  const deleted = false;
  // A DANGLING parent id -- the imported-foreign-parent case -- must not block,
  // and its scout must land in the unassigned workflow.
  const st = S.seasonStore;
  const body = await st.peekSeason(scoutId);
  body.programSeasonId = 'imported-from-another-machine';
  await st.backend.saveSeason(scoutId, body);
  await S.openSeasonById(parent);
  await hub.load();
  await hub.selectWorkspace('scout');
  return {
    parent, owned: owned.map(s => s.id), deleted, stillThere, scoutSurvives,
    danglingUnassigned: (hub.snapshot().unassignedScouts || []).map(s => s.id),
    danglingListed: hub.snapshot().seasons.map(s => s.id),
  };
}, unassignedId);
ok(r.owned.includes(unassignedId), 'the parent really owns that scout explicitly', JSON.stringify(r.owned));
ok(deleteDialog.hasButton && /opponent scout/i.test(deleteDialog.text) && /Reassign or delete/.test(deleteDialog.text),
  'the block is a real, dismissible dialog naming the owned scouts and the two ways forward', JSON.stringify({ text: deleteDialog.text.slice(0, 180), hasButton: deleteDialog.hasButton }));
ok(deleteDialog.deleted === false && r.stillThere && r.scoutSurvives,
  'deleting it is BLOCKED -- neither season is removed and no scouting data is cascaded', JSON.stringify({ dialog: deleteDialog.deleted, parent: r.stillThere, scout: r.scoutSurvives }));
ok(r.danglingUnassigned.includes(unassignedId),
  'a scout naming a parent that does not exist falls into the unassigned workflow', JSON.stringify(r));

console.log('\n== 15. The unassigned section is RENDERED and its Assign works ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore;
  const teamId = window.app.teamRegistry.activeTeamId();
  const parent = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  // A genuinely unassigned scout for this team (blank level matches no season).
  const rec = await st.backend.createSeason({ name: 'Rendered Assign · Scout', year: '2026', level: '', kind: 'scout', teamId, team: 'Second School' });
  await st.backend.saveSeason(rec.id, {
    id: rec.id, type: 'season', version: 5, seasonName: 'Rendered Assign · Scout', kind: 'scout',
    teamId, year: '2026', level: '', roster: [], rosterOwnership: 'season',
    games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
    activeGameId: `${rec.id}-g1`,
  });
  await S.openSeasonById(parent);
  await hub.load();
  await hub.selectWorkspace('scout');
  await window.app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 500));
  const row = document.querySelector(`[data-unassigned-scout="${rec.id}"]`);
  const select = row?.querySelector('select');
  const options = [...(select?.querySelectorAll('option') || [])].map(o => ({ value: o.value, text: o.textContent }));
  const button = [...(row?.querySelectorAll('button') || [])].find(b => /assign/i.test(b.textContent));
  const box = row?.getBoundingClientRect();
  // Drive the REAL control: choose the season, submit the form.
  if (select) { select.value = parent; select.dispatchEvent(new Event('change', { bubbles: true })); }
  if (button) button.click();
  await new Promise(res => setTimeout(res, 900));
  const meta = (await S.listSeasons()).find(m => m.id === rec.id) || {};
  return {
    scoutId: rec.id, parent,
    rendered: !!row, visible: !!box && box.width > 0 && box.height > 0,
    hasSelect: !!select, hasButton: !!button, options,
    storedParent: String(meta.programSeasonId || ''),
    stillUnassigned: (hub.snapshot().unassignedScouts || []).some(s => s.id === rec.id),
    nowListed: hub.snapshot().seasons.some(s => s.id === rec.id),
  };
});
ok(r.rendered && r.visible && r.hasSelect && r.hasButton,
  'the unassigned scout renders a real, visible row with a season control and an Assign action', JSON.stringify({ rendered: r.rendered, visible: r.visible, select: r.hasSelect, button: r.hasButton }));
ok(r.options.length >= 2 && r.options.some(o => o.value === r.parent && /\d{4}/.test(o.text)),
  'the control offers this team\'s program seasons, labelled with year and level', JSON.stringify(r.options));
ok(r.storedParent === r.parent,
  'submitting the rendered form persists the parent', JSON.stringify({ stored: r.storedParent, parent: r.parent }));
ok(!r.stillUnassigned && r.nowListed,
  'the row leaves the unassigned section and appears in the parent\'s scoped library immediately', JSON.stringify(r));

console.log('\n== 16. A scout of ANOTHER team cannot be assigned here ==');
r = await page.evaluate(async (ids) => {
  const S = window.app.storage, hub = window.app.teamHubScreen;
  // `built.jv` belongs to the FIRST team; the active team is the second one.
  const foreignScouts = (await S.listSeasons()).filter(m => m.kind === 'scout');
  const teamSeasons = window.app.teamRegistry.seasonsForTeam(await S.listSeasons(), window.app.teamRegistry.activeTeamId());
  const foreign = foreignScouts.find(m => !teamSeasons.some(s => s.id === m.id));
  const target = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  const attempt = foreign ? await hub.assignScoutToSeason(foreign.id, target) : null;
  const after = foreign ? String((await S.listSeasons()).find(m => m.id === foreign.id)?.programSeasonId || '') : '';
  return { foreignId: foreign?.id || '', attempt, after, target };
}, built);
ok(!!r.foreignId, 'a scout owned by the other team exists to try', JSON.stringify(r.foreignId));
ok(r.attempt?.ok === false && /could not be found for this team/.test(r.attempt?.message || ''),
  'assigning it is refused at the command boundary, even called directly with its id', JSON.stringify(r.attempt));
ok(r.after !== r.target,
  'and its stored parent is untouched', JSON.stringify({ after: r.after, target: r.target }));

console.log('\n== 17. A dangling parent is repairable; a valid one is not reassigned ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore;
  const parent = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  const scout = hub.snapshot().seasons[0]?.id || '';
  const body = await st.peekSeason(scout);
  const valid = await hub.assignScoutToSeason(scout, parent);
  // Now break the stored parent the way an import from another machine does.
  body.programSeasonId = 'gone-from-this-machine';
  await st.backend.saveSeason(scout, body);
  await hub.load();
  await hub.selectWorkspace('scout');
  const surfaced = (hub.snapshot().unassignedScouts || []).some(s => s.id === scout);
  const repair = await hub.assignScoutToSeason(scout, parent);
  const stored = String((await st.peekSeason(scout))?.programSeasonId || '');
  return { scout, parent, valid, surfaced, repair, stored };
});
ok(r.valid.ok === false && r.valid.reason === 'already-assigned',
  'a scout whose stored parent is still valid is NOT silently reassigned', JSON.stringify(r.valid));
ok(r.surfaced, 'once that parent no longer resolves, the scout is surfaced as unassigned', String(r.surfaced));
ok(r.repair.ok === true && r.repair.repaired === true && r.stored === r.parent,
  'and it can then be REPAIRED by explicit assignment', JSON.stringify({ repair: r.repair, stored: r.stored }));

console.log('\n== 18. The assignment goes through the canonical write boundary ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore;
  const parent = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  const teamId = window.app.teamRegistry.activeTeamId();
  const rec = await st.backend.createSeason({ name: 'Open Assign · Scout', year: '2026', level: '', kind: 'scout', teamId, team: 'Second School' });
  await st.backend.saveSeason(rec.id, {
    id: rec.id, type: 'season', version: 5, seasonName: 'Open Assign · Scout', kind: 'scout',
    teamId, year: '2026', level: '', roster: [], rosterOwnership: 'season',
    games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
    activeGameId: `${rec.id}-g1`,
  });
  // Assign the scout while it is the OPEN season, then take an ordinary save.
  await S.openSeasonById(rec.id);
  const assigned = await hub.assignScoutToSeason(rec.id, parent);
  const liveAfterAssign = String(st.data?.programSeasonId || '');
  S.commitActive();
  const persisted = await st.persist();
  // Reload from durable storage.
  st.data = null; st.currentSeasonId = null;
  await S.openSeasonById(rec.id);
  const body = await st.peekSeason(rec.id);
  const meta = (await S.listSeasons()).find(m => m.id === rec.id) || {};
  // Captured while the SCOUT is still the open season -- the race block below
  // deliberately opens the parent instead.
  const liveParentAfterReload = String(st.data?.programSeasonId || '');
  /* An OVERLAPPING write, constructed so an UNQUEUED assignment loses.
     The ordinary persist's backend write is held open while it still carries the
     OLD parent; the assignment is dispatched during that window. Through the
     per-season queue the assignment waits for the persist and its value is the
     one left on disk. Written directly to the backend instead, it lands first and
     the held persist overwrites it with the stale parent -- which is the whole
     reason this operation belongs in the queue. */
  const other = hub.snapshot().railSeasons.filter(s => !s.isScout && !s.isDemo).map(s => s.id).find(id => id !== parent) || parent;
  // Leave the scout CLOSED for this one. With it open, an in-flight `persist()`
  // serializes the LIVE object at write time and therefore picks up the live
  // parent update on its own -- which is real protection, but it is the live
  // update doing the work, not the ordering. A closed scout removes that help:
  // the frozen stale payload is the only thing the held write carries.
  const frozen = JSON.parse(JSON.stringify(await st.peekSeason(rec.id)));
  frozen.programSeasonId = '';
  await S.openSeasonById(parent);
  const realSave = st.backend.saveSeason.bind(st.backend);
  let release = null;
  const held = new Promise(res => { release = res; });
  let first = true;
  st.backend.saveSeason = async (id, data) => {
    if (id === rec.id && first) { first = false; await held; }
    return realSave(id, data);
  };
  const racePersist = st.persist(rec.id, frozen);   // in flight, carrying NO parent
  await new Promise(res => setTimeout(res, 50));
  const raceAssign = st.assignScoutParent(rec.id, other);
  await new Promise(res => setTimeout(res, 50));
  release();
  await Promise.all([racePersist, raceAssign]);
  await st.drainWrites(rec.id);
  st.backend.saveSeason = realSave;
  const raced = String((await st.peekSeason(rec.id))?.programSeasonId || '');
  return {
    scoutId: rec.id, parent, other, assigned, liveAfterAssign, persisted,
    bodyParent: String(body?.programSeasonId || ''), metaParent: String(meta.programSeasonId || ''),
    liveParent: liveParentAfterReload, raced,
  };
});
ok(r.assigned.ok === true && r.liveAfterAssign === r.parent,
  'assigning the OPEN scout updates the live season object in the same step', JSON.stringify({ ok: r.assigned.ok, live: r.liveAfterAssign }));
ok(r.persisted !== false && r.bodyParent === r.parent && r.metaParent === r.parent,
  'a subsequent ordinary save cannot restore the stale parent -- it survives in body AND catalog row', JSON.stringify(r));
ok(r.liveParent === r.parent, 'and it survives the reload in the live object too', JSON.stringify(r.liveParent));
ok(r.raced === r.other,
  'an overlapping persist and assignment are ordered by the per-season write queue, newest wins', JSON.stringify({ raced: r.raced, expected: r.other }));

console.log('\n== 19. Two unassigned rows cannot transfer a selection ==');
/* Codex finding, 2026-09-14. The rows were unkeyed with uncontrolled selects, so
   when one disappeared after assignment Preact reused its DOM node for the next
   scout -- the season chosen for the ASSIGNED scout stayed selected and could be
   submitted through the NEXT scout's handler. Driven through the rendered
   controls, because that reuse is invisible to a controller call. */
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore;
  const teamId = window.app.teamRegistry.activeTeamId();
  const parent = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo).id;
  const make = async name => {
    const rec = await st.backend.createSeason({ name, year: '2026', level: '', kind: 'scout', teamId, team: 'Second School' });
    await st.backend.saveSeason(rec.id, {
      id: rec.id, type: 'season', version: 5, seasonName: name, kind: 'scout', teamId, year: '2026', level: '',
      roster: [], rosterOwnership: 'season',
      games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [], annotations: [], gameInfo: {}, nextId: 1, status: 'active' }],
      activeGameId: `${rec.id}-g1`,
    });
    return rec.id;
  };
  const first = await make('Transfer One · Scout');
  const second = await make('Transfer Two · Scout');
  await S.openSeasonById(parent);
  await hub.load();
  await hub.selectWorkspace('scout');
  await window.app.workspaceShell.show('home');
  await new Promise(res => setTimeout(res, 500));
  const rowOf = id => document.querySelector(`[data-unassigned-scout="${id}"]`);
  const before = { first: !!rowOf(first), second: !!rowOf(second) };
  // 1-2. Choose a parent for the FIRST scout through its own control, assign it.
  const sel = rowOf(first).querySelector('select');
  sel.value = parent;
  sel.dispatchEvent(new Event('change', { bubbles: true }));
  rowOf(first).querySelector('button[type="submit"]').click();
  await new Promise(res => setTimeout(res, 1200));
  const metas = await S.listSeasons();
  const stored = id => String(metas.find(m => m.id === id)?.programSeasonId || '');
  // 4. The surviving row's selector must be blank.
  const survivor = rowOf(second);
  const survivorValue = survivor?.querySelector('select')?.value ?? '(no row)';
  // 5. Submitting it with nothing chosen must assign nothing.
  survivor?.querySelector('button[type="submit"]')?.click();
  await new Promise(res => setTimeout(res, 900));
  const after = await S.listSeasons();
  return {
    first, second, parent, before, survivorValue,
    firstStored: stored(first), secondStored: stored(second),
    secondAfterBlankSubmit: String(after.find(m => m.id === second)?.programSeasonId || ''),
    stillUnassigned: (hub.snapshot().unassignedScouts || []).map(s => s.id),
  };
});
ok(r.before.first && r.before.second, 'both unassigned scouts render their own row', JSON.stringify(r.before));
ok(r.firstStored === r.parent, 'the scout whose control was used is the one assigned', JSON.stringify({ first: r.firstStored, parent: r.parent }));
ok(r.secondStored === '', 'the other scout is NOT assigned by that submit', JSON.stringify({ second: r.secondStored }));
ok(r.survivorValue === '', 'the surviving row\'s selector is blank, not the departed row\'s value', JSON.stringify(r.survivorValue));
ok(r.secondAfterBlankSubmit === '' && r.stillUnassigned.includes(r.second),
  'submitting the surviving row with no season chosen assigns nothing', JSON.stringify(r));

console.log('\n== 20. The sample season can never own a scout ==');
r = await page.evaluate(async () => {
  const S = window.app.storage, hub = window.app.teamHubScreen, st = S.seasonStore, ctx = window.app.workspace;
  const W = ctx.constructor;
  const demoMeta = { id: 'demo-1', kind: 'demo', isDemo: true, teamId: 't1', year: '2026', level: 'JV' };
  const flagged = { id: 'demo-2', kind: '', isDemo: true, teamId: 't1', year: '2026', level: 'JV' };
  const real = { id: 'real-1', kind: '', teamId: 't1', year: '2026', level: 'JV' };
  const pure = {
    demoKind: W.isValidParent([demoMeta], 'demo-1'),
    demoFlag: W.isValidParent([flagged], 'demo-2'),
    real: W.isValidParent([real], 'real-1'),
    // A demo must not be the unique legacy match either.
    inferDemoOnly: W.resolveScoutParent({ id: 's', kind: 'scout', teamId: 't1', year: '2026', level: 'JV' }, [demoMeta]),
    inferReal: W.resolveScoutParent({ id: 's', kind: 'scout', teamId: 't1', year: '2026', level: 'JV' }, [real]),
  };
  // Live: open the sample season and confirm it establishes no parent.
  const demoId = await S.loadDemoSeason();
  await hub.load();
  const openDemo = { demoId, parent: ctx.programSeasonId(), isDemo: S.isDemoSeason(demoId) };
  // Creating a scout from the sample must write nothing.
  const before = (await S.listSeasons()).length;
  const attempt = await hub.createScout({
    opponent: 'Sample Opponent', year: '2026', level: 'Varsity',
    sourceTeamA: 'Sample Opponent', sourceTeamB: 'Central',
  });
  const after = (await S.listSeasons()).length;
  // An EXISTING scout naming a demo must surface as unassigned, data intact.
  const teamId = window.app.teamRegistry.activeTeamId();
  const rec = await st.backend.createSeason({ name: 'Demo Parent · Scout', year: '2026', level: '', kind: 'scout', teamId, team: 'Second School' });
  await st.backend.saveSeason(rec.id, {
    id: rec.id, type: 'season', version: 5, seasonName: 'Demo Parent · Scout', kind: 'scout', teamId,
    year: '2026', level: '', programSeasonId: demoId, roster: [], rosterOwnership: 'season',
    games: [{ id: `${rec.id}-g1`, name: 'Source', plays: [{ id: 1, tags: { unit: 'offense', custom: [] } }], annotations: [], gameInfo: {}, nextId: 2, status: 'active' }],
    activeGameId: `${rec.id}-g1`,
  });
  const parent = hub.snapshot().railSeasons.find(s => !s.isScout && !s.isDemo)?.id || '';
  await S.openSeasonById(parent);
  await hub.load();
  await hub.selectWorkspace('scout');
  const snap = hub.snapshot();
  const body = await st.peekSeason(rec.id);
  // The sample stays removable, and removing it touches no scout data.
  const removed = await S.seasonStore.deleteSeason(demoId);
  const bodyAfter = await st.peekSeason(rec.id);
  return {
    pure, openDemo, attempt, before, after, scoutId: rec.id,
    unassigned: (snap.unassignedScouts || []).map(s => s.id),
    listed: snap.seasons.map(s => s.id),
    storedParent: String(body?.programSeasonId || ''),
    plays: (body?.games || []).reduce((n, g) => n + (g.plays || []).length, 0),
    removed, playsAfterRemoval: (bodyAfter?.games || []).reduce((n, g) => n + (g.plays || []).length, 0),
    parentStillStored: String(bodyAfter?.programSeasonId || ''),
  };
});
ok(r.pure.demoKind === false && r.pure.demoFlag === false && r.pure.real === true,
  'isValidParent rejects a demo by kind AND by isDemo, and still accepts a real program season', JSON.stringify(r.pure));
ok(r.pure.inferDemoOnly.status === 'unassigned' && r.pure.inferReal.status === 'inferred',
  'legacy inference never treats a demo as the unique compatible parent', JSON.stringify({ demo: r.pure.inferDemoOnly.status, real: r.pure.inferReal.status }));
ok(r.openDemo.isDemo && r.openDemo.parent === '',
  'opening the sample season establishes NO parent context', JSON.stringify(r.openDemo));
ok(r.attempt.ok === false && /sample season cannot own/i.test(r.attempt.message || '') && r.after === r.before,
  'creating a scout from the sample fails closed and writes nothing', JSON.stringify({ attempt: r.attempt, before: r.before, after: r.after }));
ok(r.unassigned.includes(r.scoutId) && !r.listed.includes(r.scoutId),
  'an existing scout naming a demo surfaces as unassigned, in no parent library', JSON.stringify({ unassigned: r.unassigned, listed: r.listed }));
ok(r.storedParent && r.plays === 1,
  'its stored id is NOT rewritten and its charted data is intact', JSON.stringify({ stored: r.storedParent, plays: r.plays }));
ok(r.removed === true && r.playsAfterRemoval === 1 && r.parentStillStored === r.storedParent,
  'the sample stays removable, and removing it changes no scout data', JSON.stringify(r));

console.log('\n== 21. No page or console errors ==');
ok(errors.length === 0, 'zero page/console errors across every transition', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
