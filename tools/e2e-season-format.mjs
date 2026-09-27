/**
 * OLD FILES ARE REFUSED, BEFORE ANY WRITE (legacy excision Pass 2, step 6).
 *
 * The live catalog was converted once (2026-09-26). Every path that brings data
 * in from elsewhere asks SeasonFormat first and refuses an old-format file with
 * a plain message, having written nothing; the file on disk is untouched.
 *
 *   1. SeasonFormat detects each retired shape, and passes current data
 *      (including the generated sample season).
 *   2. Documents-mirror recovery and the first-run JSON import refuse old
 *      seasons (node, with stand-in file systems).
 *   3. In the app: season file import, a single-game save, a season restore
 *      point and a game version are each refused with nothing written; a current
 *      season file still imports; a template applies no retired value.
 * Run:  node tools/e2e-season-format.mjs
 */
import { APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { SeasonFormat } from '../js/season-format.js';
import { DemoSeason } from '../js/demo-season.js';
import { SnapshotEnvelope } from '../js/snapshot-envelope.js';
import { TauriBackend } from '../js/storage-backend.js';
import { CatalogPersistence } from '../js/catalog-persistence.js';
import { SqlCatalog } from '../js/sql-catalog.js';

let pass = 0, fail = 0;
const ok = (c, label, d = '') => c ? (pass++, console.log('  PASS  ' + label)) : (fail++, console.log('  FAIL  ' + label + (d ? ' -- ' + d : '')));

const play = (id, tags, extra = {}) => ({ id, timestamp: { start: id, end: id + 1 }, notes: '', annotations: [], tags: { unit: 'offense', players: {}, grades: {}, custom: [], ...tags }, ...extra });
const season = (id, plays, gameExtra = {}) => ({ id, seasonName: id, roster: [], games: [{ id: `${id}-g`, name: 'Week 1', plays, ...gameExtra }] });
const CURRENT = season('current', [play(1, { formation: 'Flexbone', qbAlignment: 'Under Center', playType: 'Run Inside' })]);

console.log('\n== 1. SeasonFormat detects every retired shape ==');
const kinds = s => SeasonFormat.seasonProblems(s).map(p => p.problem);
ok(SeasonFormat.isCurrentSeason(CURRENT), 'a current season passes', JSON.stringify(kinds(CURRENT)));
ok(kinds(season('a', [play(1, { unit: '' , playType: 'Run Inside' })])).includes('no unit'), 'a charted play with no unit');
ok(kinds(season('a', [play(1, { formation: 'Under Center + Flexbone' })])).includes('combined look'), 'an alignment inside Formation');
ok(kinds(season('a', [play(1, { coverage: 'Man' })])).includes('combined look') || kinds(season('a', [play(1, { formation: 'Empty' })])).includes('combined look'), 'a family in Coverage or Empty in Formation');
ok(kinds(season('a', [play(1, { unit: 'special', stType: 'Punt' })])).includes('retired Special Teams tag'), 'a retired Special Teams tag (stType)');
ok(kinds(season('a', [play(1, { unit: 'special', stType: '' })])).includes('retired Special Teams tag'), 'even an empty retired key');
ok(kinds(season('a', [play(1, { unit: 'special' }, { specialTeams: { unit: 'fieldGoal', attemptType: 'extraPoint', outcome: { status: 'good' } } })])).includes('extra point on a Field Goal unit'), 'an extra point on the Field Goal unit');
ok(kinds(season('a', [play(1, {})], { roster: [] })).includes('game roster'), 'a game node carrying a roster');
ok(kinds({ plays: [play(1, {})] }).includes('single-game save'), 'a single-game save');
ok(SeasonFormat.isCurrentSeason(DemoSeason.build()), 'the generated sample season is current', JSON.stringify(kinds(DemoSeason.build()).slice(0, 3)));
// Codex review of 448c95a: structure is validated, not assumed.
ok(kinds(season('a', [play(1, { unit: null, playType: 'Run Inside' })])).includes('no unit'), 'a charted play whose unit is null');
ok(kinds(season('a', [play(1, { unit: 'kickoff' })])).includes('no unit'), 'a play whose unit is not one of the three');
ok(kinds(season('a', [{ id: 1, timestamp: { start: 0, end: 1 }, tags: {} }])).includes('no unit'), 'a play with empty tags');
{
  const k = kinds(season('a', [{ id: 1, specialTeams: { unit: 'fieldGoal', attemptType: 'extraPoint' } }]));
  ok(k.includes('missing tags') && k.includes('extra point on a Field Goal unit'), 'a play with no tags is refused AND its Special Teams event is still checked', JSON.stringify(k));
}
ok(kinds({ games: [{}] }).includes('no plays list') && kinds({ games: [null] }).includes('malformed game') && kinds({}).includes('not a GridIron IQ season'),
  'a season whose game has no plays list, a null game, or no games array', JSON.stringify([kinds({ games: [{}] }), kinds({ games: [null] }), kinds({})]));
ok(SeasonFormat.isCurrentSeason(season('empty', [])), 'a season whose game has an empty plays list is current');
ok(!SeasonFormat.isCurrentGame({}) && SeasonFormat.gameProblems({})[0]?.problem === 'no plays list', 'a game version {} is refused (restoring it would empty the game)', JSON.stringify(SeasonFormat.gameProblems({})));
ok(SeasonFormat.isCurrentGame({ plays: [] }) && SeasonFormat.isCurrentGame({ plays: [play(1, { formation: 'Trips' })] }), 'a game version with plays (or an empty list) is current');

console.log('\n== 2. Mirror recovery and first-run import refuse old seasons ==');
{
  const old = season('old-mirror', [play(1, { formation: 'Shotgun + Trips' })]);
  const env = SnapshotEnvelope.wrap('old-mirror', old);
  let catalogTouched = false;
  const fakeThis = {
    _ok: () => true, mirrorDir: 1, MIRROR_ROOT: 'GridIron IQ',
    fs: { exists: async () => true, readTextFile: async () => JSON.stringify(env),
          readDir: async () => [{ name: 'old-mirror', isDirectory: true }] },
    _ensureCatalog: async () => { catalogTouched = true; return { listSeasons: async () => [], saveSeason: async () => { throw new Error('WROTE'); } }; },
  };
  const rec = await TauriBackend.prototype.recoverSeasonFromMirror.call(fakeThis, 'old-mirror', { confirmOverwrite: true });
  ok(rec.ok === false && rec.reason === 'old-format' && rec.message === SeasonFormat.MESSAGE && !catalogTouched,
    'recovering an old mirror copy is refused before any catalog lookup or write', JSON.stringify({ rec, catalogTouched }));
  const scan = await TauriBackend.prototype.scanRecoverableSeasons.call(fakeThis);
  ok(scan.length === 1 && scan[0].valid === false && scan[0].reason === 'old-format', 'the recovery list shows it as Old format, not recoverable', JSON.stringify(scan));

  const SQL = await (await import('sql.js')).default();
  const cat = new SqlCatalog(SQL); await cat.open();
  let writes = 0;
  const cp = new CatalogPersistence({ catalog: cat, fs: {
    readDb: async () => null, writeDb: async () => { writes++; },
    readJson: async id => id === 'old' ? season('old', [play(1, { stType: 'Punt', unit: 'special' })]) : season('fresh', [play(1, { formation: 'Trips' })]),
  } });
  const migrated = await cp.migrateJsonSeasons(['old', 'fresh']);
  ok(migrated === 1 && !cat.loadSeason('old') && !!cat.loadSeason('fresh'), 'first-run JSON import skips an old season and imports a current one', JSON.stringify({ migrated, writes }));
  ok(JSON.stringify(cp.oldFormatRefusals) === JSON.stringify([{ id: 'old', name: 'old' }]), 'the refused season is named, not silently dropped', JSON.stringify(cp.oldFormatRefusals));
  const backendThis = { _oldFormatSeasons: cp.oldFormatRefusals };
  const handed = TauriBackend.prototype.takeOldFormatRefusals.call(backendThis);
  const again = TauriBackend.prototype.takeOldFormatRefusals.call(backendThis);
  ok(handed.length === 1 && again.length === 0, 'the backend hands the refusals over once', JSON.stringify({ handed, again }));
}

console.log('\n== 3. In the app: refused with nothing written ==');
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.evaluateOnNewDocument(() => localStorage.clear());
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => !!window.app?.storage?.seasonStore, { timeout: 15000 });

const r = await page.evaluate(async ({ CURRENT, MESSAGE, RESTORE }) => {
  const app = window.app, store = app.storage.seasonStore, sm = app.storage;
  const toasts = []; const origToast = app.tagger.toast; app.tagger.toast = m => { toasts.push(String(m)); };
  const settingsToasts = []; const origSettingsToast = app.settingsScreen._toast.bind(app.settingsScreen);
  app.settingsScreen._toast = (m, k) => { settingsToasts.push(`${k || ''}:${m}`); };
  const load = (obj) => new Promise(res => { sm.loadProject(new File([JSON.stringify(obj)], 'x.json')); setTimeout(res, 400); });
  const out = {};

  // No season open: an old file must not even create a scaffold season.
  const seasonsBefore = (await store.listSeasons()).length;
  await load({ ...CURRENT, id: 'imp-old', seasonName: 'Old import', games: [{ id: 'g', name: 'G', plays: [{ id: 1, timestamp: { start: 0, end: 1 }, tags: { formation: 'Under Center + Flexbone' } }] }] });
  out.oldImport = { toast: toasts.at(-1), seasonsAfter: (await store.listSeasons()).length, seasonsBefore, open: store.hasCurrent() };

  await load({ plays: [{ id: 1, timestamp: { start: 0, end: 1 }, tags: { unit: 'offense' } }] });
  out.singleGame = { toast: toasts.at(-1), seasonsAfter: (await store.listSeasons()).length };

  // A current season file still imports.
  await load({ ...CURRENT, seasonName: 'Current import' });
  await new Promise(res => setTimeout(res, 400));
  out.currentImport = { open: store.hasCurrent(), plays: store.data?.games?.[0]?.plays?.length ?? null, name: store.data?.seasonName };

  // A season restore point in the old format.
  const oldPoint = JSON.parse(JSON.stringify(store.data)); oldPoint.games[0].plays[0].tags.stType = 'Punt';
  await store.backend.createBackup(store.currentSeasonId, oldPoint, 'Old point');
  const pointId = (await store.listBackups()).find(b => b.label === 'Old point')?.id;
  const pointsBefore = (await store.listBackups()).length;
  const dataBefore = JSON.stringify(store.data);
  const restored = await app.settingsScreen.restoreSeasonPoint.call(Object.assign(Object.create(app.settingsScreen), {
    overlays: { dialog: () => ({ result: Promise.resolve('restore') }) } }), pointId);
  out.restorePoint = { restored, pointsAfter: (await store.listBackups()).length, pointsBefore, unchanged: JSON.stringify(store.data) === dataBefore, toast: settingsToasts.at(-1) };

  // A game version in the old format.
  const scope = { seasonId: store.currentSeasonId, gameId: store.data.activeGameId };
  const oldVersion = { plays: [{ id: 1, timestamp: { start: 0, end: 1 }, tags: { unit: 'special', kickOutcome: 'Downed' } }] };
  await store.backend.saveVersion(scope.seasonId, scope.gameId, { id: 'v-old', t: Date.now(), label: 'Old version', manual: true, playCount: 1, data: oldVersion });
  let confirmAsked = false; const origConfirm = app.tagger._confirmDialog; app.tagger._confirmDialog = async () => { confirmAsked = true; return true; };
  const versionsBefore = (await app.versions.list()).length;
  const playsBefore = JSON.stringify(app.tagger.plays);
  const vr = await app.versions.restore('v-old');
  out.version = { vr, confirmAsked, versionsAfter: (await app.versions.list()).length, versionsBefore, unchanged: JSON.stringify(app.tagger.plays) === playsBefore, toast: toasts.at(-1) };
  // A malformed version ({}): refused before the confirmation; the game keeps its plays.
  await store.backend.saveVersion(scope.seasonId, scope.gameId, { id: 'v-empty', t: Date.now(), label: 'Empty', manual: true, playCount: 0, data: {} });
  confirmAsked = false;
  const playsBefore2 = JSON.stringify(app.tagger.plays);
  const ve = await app.versions.restore('v-empty');
  out.emptyVersion = { ve, confirmAsked, unchanged: JSON.stringify(app.tagger.plays) === playsBefore2, plays: app.tagger.plays.length };
  app.tagger._confirmDialog = origConfirm;

  // First-run refusals reach the coach once, through the library listing.
  const origTake = store.backend.takeOldFormatRefusals;
  let pending = [{ id: 'x', name: 'Old Season' }];
  store.backend.takeOldFormatRefusals = () => { const l = pending; pending = []; return l; };
  const t0 = toasts.length; await sm.listSeasons(); const firstToasts = toasts.slice(t0);
  const t1 = toasts.length; await sm.listSeasons(); const secondToasts = toasts.slice(t1);
  store.backend.takeOldFormatRefusals = origTake;
  out.firstRun = { firstToasts, secondToasts };

  // A template saved before the conversion applies no retired value.
  const store2 = app.tagger._templateStore(); store2['Old tpl'] = { stType: 'Punt', kickOutcome: 'Downed', formation: 'Shotgun + Trips', playType: 'Short Pass' };
  app.tagger._saveTemplateStore(store2);
  // If a regression above emptied the game, keep this check running (and named).
  if (!app.tagger.plays.length) app.tagger.plays.push({ id: 900, timestamp: { start: 0, end: 1 }, notes: '', annotations: [], tags: app.tagger.constructor.blankTags({ unit: 'offense' }) });
  app.tagger.selectPlay(app.tagger.plays[0].id);
  const tplBefore = app.tagger.getCurrentPlay().tags;
  const before = { formation: tplBefore.formation, qb: tplBefore.qbAlignment };
  app.tagger.applyTemplate('Old tpl');
  const t = app.tagger.getCurrentPlay().tags;
  out.template = { stType: 'stType' in t, kickOutcome: 'kickOutcome' in t, formation: t.formation, qb: t.qbAlignment, playType: t.playType, before };

  app.tagger.toast = origToast; app.settingsScreen._toast = origSettingsToast;
  return out;
}, { CURRENT, MESSAGE: SeasonFormat.MESSAGE, RESTORE: SeasonFormat.RESTORE_MESSAGE });

ok(r.oldImport.toast === SeasonFormat.MESSAGE && r.oldImport.seasonsAfter === r.oldImport.seasonsBefore && !r.oldImport.open,
  'an old season file is refused with the plain message, before any scaffold season is created', JSON.stringify(r.oldImport));
ok(r.singleGame.toast === SeasonFormat.MESSAGE && r.singleGame.seasonsAfter === r.oldImport.seasonsBefore, 'a single-game save is refused the same way', JSON.stringify(r.singleGame));
ok(r.currentImport.open && r.currentImport.plays === 1 && r.currentImport.name === 'Current import', 'a current season file still imports', JSON.stringify(r.currentImport));
ok(r.restorePoint.restored === false && r.restorePoint.unchanged && r.restorePoint.pointsAfter === r.restorePoint.pointsBefore && r.restorePoint.toast === `error:${SeasonFormat.RESTORE_MESSAGE}`,
  'an old season restore point is refused: no safety snapshot, season unchanged, plain message', JSON.stringify(r.restorePoint));
ok(r.version.vr === false && !r.version.confirmAsked && r.version.unchanged && r.version.versionsAfter === r.version.versionsBefore && r.version.toast === SeasonFormat.RESTORE_MESSAGE,
  'an old game version is refused before the confirmation: no backup version, game unchanged', JSON.stringify(r.version));
ok(r.emptyVersion.ve === false && !r.emptyVersion.confirmAsked && r.emptyVersion.unchanged && r.emptyVersion.plays > 0,
  'a malformed game version ({}) is refused before the confirmation; the game keeps its plays', JSON.stringify(r.emptyVersion));
ok(r.firstRun.firstToasts.length === 1 && /1 season file uses an old GridIron IQ format and was not opened: Old Season\. Export it again/.test(r.firstRun.firstToasts[0]) && r.firstRun.secondToasts.length === 0,
  'a season the first-run import refused is named to the coach once', JSON.stringify(r.firstRun));
ok(!r.template.stType && !r.template.kickOutcome && r.template.playType === 'Short Pass'
  && r.template.formation === r.template.before.formation && r.template.qb === r.template.before.qb && !String(r.template.formation || '').includes('+'),
  'an old template applies its current values only; its combined look is not applied', JSON.stringify(r.template));
// A STORED payload that is not a season (a single-game save written into the
// library slot, or any other shape) is refused on open and on reload, never
// opened as an empty season a later save would write over. Only no stored
// payload at all starts empty.
const stored = await page.evaluate(async () => {
  const S = app.storage, st = S.seasonStore;
  const charted = { id: 1, timestamp: { start: 0, end: 1 }, notes: '', annotations: [], tags: { unit: 'offense', playType: 'Run Inside', players: {}, grades: {}, custom: [] } };
  const toasts = [];
  const realToast = S.tagger.toast;
  S.tagger.toast = msg => { toasts.push(String(msg)); };
  const snap = () => ({ id: st.currentSeasonId, pointer: st.backend.currentSeason(), plays: S.tagger.plays.length, dataId: st.data?.id });
  const out = { cases: {} };
  for (const [slot, payload] of [['stored-single-game', { plays: [charted], gameInfo: { opponent: 'Old' } }], ['stored-not-season', ['x']]]) {
    await st.backend.saveSeason(slot, payload);
    const bytes = JSON.stringify(await st.backend.loadSeason(slot));
    const before = snap();
    const opened = await S.openSeasonById(slot);
    out.cases[slot] = { stored: bytes !== 'null', opened, before, after: snap(), same: JSON.stringify(await st.backend.loadSeason(slot)) === bytes };
  }
  // load(): the OPEN season's own stored bytes replaced by a single-game payload.
  const liveId = st.currentSeasonId;
  const livePlays = st.data.games.reduce((n, g) => n + (g.plays || []).length, 0);
  const liveBytes = JSON.stringify(await st.backend.loadSeason(liveId));
  await st.backend.saveSeason(liveId, { plays: [charted] });
  const reloaded = await st.load();
  out.load = { sameObject: reloaded === st.data, plays: st.data.games.reduce((n, g) => n + (g.plays || []).length, 0), livePlays,
    refusal: st.openRefusal?.message || '', id: st.currentSeasonId === liveId };
  st.openRefusal = null;
  await st.backend.saveSeason(liveId, JSON.parse(liveBytes));
  // Nothing stored at all still starts an empty season.
  out.empty = await (async () => { const r = await st.openSeason('never-saved-slot'); return !!r && Array.isArray(r.games); })();
  S.tagger.toast = realToast;
  out.toasts = toasts;
  return out;
});
for (const [slot, c] of Object.entries(stored.cases)) {
  ok(c.stored && c.opened === false && c.after.id === c.before.id && c.after.pointer === c.before.pointer && c.after.plays === c.before.plays && c.after.dataId === c.before.dataId,
    `${slot}: a stored payload that is not a season does not open; the open season, pointer and plays are untouched`, JSON.stringify(c));
  ok(c.same, `${slot}: its stored bytes are unchanged`, String(c.same));
}
ok(stored.toasts.length === 2 && stored.toasts.every(t => /uses an old GridIron IQ format and was not opened/.test(t)), 'each refusal is surfaced', JSON.stringify(stored.toasts));
ok(stored.load.sameObject && stored.load.id && stored.load.plays === stored.load.livePlays && /was not opened/.test(stored.load.refusal),
  'load() refuses a stored single-game payload and keeps the live season as it was', JSON.stringify(stored.load));
ok(stored.empty, 'a slot with nothing stored still opens as a new empty season');

ok(!errors.length, 'no page errors', errors.join(' | '));

// A save from before the season library (one top-level season.json on desktop,
// one `ffa_season` key in a browser) is the retired layout: never read, left
// where it is, and named once when the library is first created.
{
  const files = new Map([['season.json', JSON.stringify({ games: [{ id: 'g', plays: [] }], seasonName: 'Pre-library' })]]);
  const writes = [];
  const be = Object.create(TauriBackend.prototype);
  Object.assign(be, { fs: {}, baseDir: 0, LIB: 'library.json', OLD_LAYOUT: 'season.json' });
  be._exists = async p => files.has(p);
  be._readJson = async p => { throw new Error('read ' + p); };
  be._writeLib = async arr => { writes.push(['library.json', JSON.stringify(arr)]); files.set('library.json', JSON.stringify(arr)); };
  await be._ensureLibrary();
  const notice = be.takeOldLayoutNotice();
  await be._ensureLibrary();
  ok(notice === 'An old-format GridIron IQ save was found and not opened. It was left where it is.' && be.takeOldLayoutNotice() === null
     && JSON.stringify(writes) === '[["library.json","[]"]]' && files.get('season.json').includes('Pre-library'),
    'desktop: an old top-level season.json is not read, is left in place, and is named once', JSON.stringify({ notice, writes }));
}
{
  const page2 = await browser.newPage();
  const errors2 = []; page2.on('pageerror', e => errors2.push(e.message));
  await page2.evaluateOnNewDocument(() => {
    if (sessionStorage.getItem('seeded')) return;
    localStorage.clear();
    localStorage.setItem('ffa_season', JSON.stringify({ seasonName: 'Pre-library', games: [{ id: 'g', plays: [] }] }));
    sessionStorage.setItem('seeded', '1');
  });
  const toasts = [];
  await page2.exposeFunction('__toast', m => toasts.push(String(m)));
  await page2.evaluateOnNewDocument(() => {
    const hook = () => { const t = window.app?.tagger; if (t && !t.__hooked) { const real = t.toast?.bind(t); t.toast = (m, ...r) => { window.__toast(m); return real?.(m, ...r); }; t.__hooked = true; } else if (!t) setTimeout(hook, 5); };
    hook();
  });
  await page2.goto(APP_URL, { waitUntil: 'networkidle0' });
  const r = await page2.evaluate(async () => {
    await window.app.storage.listSeasons();
    return { old: localStorage.getItem('ffa_season'), lib: localStorage.getItem('ffa_library'), seasons: (await window.app.storage.listSeasons()).length };
  });
  ok(toasts.filter(t => /old-format GridIron IQ save was found and not opened/.test(t)).length === 1 && JSON.parse(r.old).seasonName === 'Pre-library' && r.lib === '[]' && r.seasons === 0,
    'browser: an old ffa_season key is not read, is left in place, and is named once', JSON.stringify({ toasts, r }));
  ok(!errors2.length, 'no page errors (old layout)', errors2.join(' | '));
  await page2.close();
}

await browser.close();
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
