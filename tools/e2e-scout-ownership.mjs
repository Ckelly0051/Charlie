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
import puppeteer from 'puppeteer';
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

console.log('\n== 10. No page or console errors ==');
ok(errors.length === 0, 'zero page/console errors across every transition', errors.slice(0, 3).join(' | '));

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
if (fail) process.exit(1);
