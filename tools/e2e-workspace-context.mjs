/* P0-d shell/workspace contract. Runs against the built bundle; no route in this
   harness is allowed to open/replace production UI. */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`); }
};

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const result = await page.evaluate(async () => {
  const app = window.app;
  const workspace = app?.workspace;
  if (!workspace) return { missing: true };
  const store = app.storage.seasonStore;
  const original = { data: store.data, id: store.currentSeasonId, backend: store.backend };
  const game = {
    id: 'g1', name: 'Week 1 vs Rivals', gameInfo: { opponent: 'Rivals', date: '2026-09-01' },
    status: 'in_progress', plays: [{ id: 1, tags: {}, clipPath: 'endzone/001', clipName: '001' }],
    clipPaths: ['endzone/001'], clipNames: ['001'], isMultiClip: true, filmMode: 'managed'
  };
  store.currentSeasonId = 's1';
  store.data = { id: 's1', seasonName: '2026 Varsity', teamProfile: { teamName: 'Mavericks' }, games: [game], activeGameId: 'g1' };

  const routes = workspace.listRoutes();
  const snapshot = workspace.snapshot();
  const breakRoute = workspace.navigate('breakdown');
  const studyRoute = workspace.navigate('study');
  const planRoute = workspace.navigate('plan');
  const badRoute = workspace.navigate('not-a-route');

  const makeBackend = opts => ({
    supportsFilm: () => !!opts.film,
    supportsLinkedFilm: () => !!opts.linked,
    listFilmFiles: async () => opts.files || [],
    getLibraryRoot: () => opts.root || '',
    linkedGameDir: async dir => opts.absDir === undefined ? dir : opts.absDir,
    isLinkedDirAllowed: () => opts.authorized !== false,
    listLinkedFilm: async () => opts.files || [],
  });
  const health = {};
  game.filmMode = 'managed';
  store.backend = makeBackend({ film: true, files: [{ name: '001.mp4', path: 'endzone/001.mp4' }] });
  health.managed = await workspace.filmHealth(game);
  store.backend = makeBackend({ film: true, files: [] });
  health.missing = await workspace.filmHealth(game);
  store.backend = makeBackend({ film: false });
  health.browser = await workspace.filmHealth(game);
  game.filmMode = 'linked'; game.filmDir = 'Rivals';
  store.backend = makeBackend({ film: true, linked: true, authorized: true, files: [{ name: '001.mp4', path: 'endzone/001.mp4' }] });
  health.linked = await workspace.filmHealth(game);
  store.backend = makeBackend({ film: true, linked: true, authorized: false, files: [] });
  health.unauthorized = await workspace.filmHealth(game);
  workspace.setFilmOperation('g1', 'saving', { done: 3, total: 10 });
  health.saving = await workspace.filmHealth(game);
  workspace.setFilmOperation('g1', 'repairing', { done: 2, total: 4 });
  health.repairing = await workspace.filmHealth(game);
  workspace.clearFilmOperation('g1');
  store.data.activeGameId = 'some-other-game';
  app._showFilmImportProgress(1, 5, 'saving', 'g1');
  health.ownerScoped = await workspace.filmHealth(game);
  app._showFilmImportProgress(5, 5, 'saving', 'g1');
  store.data.activeGameId = 'g1';
  game.filmMode = 'managed'; game.filmDir = null;
  store.backend = makeBackend({ film: true, files: [{ name: '001.mp4', path: 'endzone/001.mp4' }, { name: 'extra.mp4', path: 'extra.mp4' }] });
  health.extra = await workspace.filmHealth(game);
  store.backend.listFilmFiles = async () => { throw new Error('disk offline'); };
  health.listFailure = await workspace.filmHealth(game);
  const empty = { id: 'g2', plays: [], clipNames: [], isMultiClip: false };
  health.empty = await workspace.filmHealth(empty);

  const noSeason = (() => {
    store.data = null; store.currentSeasonId = null;
    return {
      breakdown: workspace.guard('breakdown'),
      study: workspace.guard('study'),
      home: workspace.guard('home')
    };
  })();
  store.data = original.data; store.currentSeasonId = original.id; store.backend = original.backend;
  workspace.navigate('home');
  return { routes, snapshot, breakRoute, studyRoute, planRoute, badRoute, health, noSeason };
});

ok(!result.missing, 'App exposes the P0-d workspace interface');
if (!result.missing) {
  ok(JSON.stringify(result.routes.map(r => r.id)) === JSON.stringify(['home','breakdown','study','plan']), 'Shell routes are stable and ordered');
  ok(result.routes.find(r => r.id === 'breakdown').target === 'classic-workspace' && result.routes.find(r => r.id === 'study').target === 'advanced-reports', 'Break Down and Study preserve current production targets');
  ok(result.routes.find(r => r.id === 'plan').target === 'coming-soon', 'Plan is an explicit controlled coming-soon route');
  ok(result.snapshot.team.name === 'Mavericks' && result.snapshot.season.id === 's1' && result.snapshot.game.id === 'g1', 'Workspace snapshot carries team, season, and game identity');
  ok(result.snapshot.capabilities.canBreakDown && result.snapshot.capabilities.canStudy && result.snapshot.capabilities.canPlan, 'Workspace capabilities derive from open context');
  ok(result.breakRoute.ok && result.studyRoute.ok && result.planRoute.ok && !result.badRoute.ok, 'Route navigation is guarded and unknown routes fail');
  ok(!result.noSeason.breakdown.ok && !result.noSeason.study.ok && result.noSeason.home.ok, 'Routes requiring workspace context fail closed');
  ok(result.health.managed.state === 'managed' && result.health.managed.ready, 'Managed film reports ready');
  ok(result.health.linked.state === 'linked' && result.health.linked.ready, 'Linked film reports ready without implying a copy');
  ok(result.health.missing.state === 'missing' && result.health.missing.missing === 1, 'Missing managed film reports expected count');
  ok(result.health.unauthorized.state === 'unauthorized' && result.health.unauthorized.action === 'reconnect', 'Unauthorized linked folder reports reconnect action');
  ok(result.health.browser.state === 'browser-only' && !result.health.browser.persistent, 'Browser film is explicitly non-persistent');
  ok(result.health.saving.state === 'saving' && result.health.saving.progress.done === 3, 'Saving operation overrides durable health');
  ok(result.health.repairing.state === 'repairing' && result.health.repairing.progress.total === 4, 'Repairing operation overrides durable health');
  ok(result.health.ownerScoped.state === 'saving' && result.health.ownerScoped.progress.done === 1, 'Async progress remains scoped to its originating game');
  ok(result.health.extra.ready && result.health.extra.found === 1, 'Extra disk files do not inflate matched-film count');
  ok(result.health.listFailure.state === 'missing' && result.health.listFailure.detail === 'managed-list-failed', 'Film list failure degrades to actionable missing state');
  ok(result.health.empty.state === 'empty', 'Game with no film references reports empty');
}
ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
