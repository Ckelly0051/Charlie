/**
 * Live-data binding for the repaired film-health presentation.
 *
 * Answers the 2026-09-14 coach observation — `5 of 6 games linked` in the season
 * library versus six linked in the opened season — against the REAL installed
 * data and the REAL film sources, and then asserts the repaired owner prints the
 * count those sources actually support.
 *
 * READ-ONLY, without exception. It reads the installed season body and walks the
 * coach's film library; it never writes, renames, relinks or deletes anything,
 * and it never touches the backend the running app is using.
 *
 * WHAT THIS DOES AND DOES NOT PROVE. The per-game truth is computed in NODE from
 * the real season body and the real directories, using the app's own
 * `_expected` / `_identity` / `listLinkedFilm` rules. That truth is then fed to
 * the actual in-page `WorkspaceContext.filmHealth` and
 * `TeamHubScreen._aggregateFilm` through a backend stub that returns those real
 * listings, so the PRESENTATION is asserted against live facts. What is NOT
 * proven here is Tauri's own `fs.readDir`/`exists` behaviour inside the
 * installed WebView2 build — Chromium cannot exercise it. That remains an
 * installed check.
 *
 * Skips honestly when the canonical data is absent (CI, another machine).
 */
import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import puppeteer from 'puppeteer';
import { readFileSync, readdirSync, statSync, existsSync } from 'node:fs';
import { join } from 'node:path';

const SEASON_ID = '2026-varsity-demo';          // library name: 2025 St. Joseph Mavericks - JV
const SEASON_NAME = '2025 St. Joseph Mavericks - JV';
const LIBRARY_ROOT = process.env.GIQ_FILM_LIBRARY_ROOT || 'D:\\Football\\Film';
const APP_DATA = process.env.APPDATA ? join(process.env.APPDATA, 'com.gridironiq.app') : '';
const SEASON_FILE = APP_DATA ? join(APP_DATA, 'seasons', SEASON_ID, 'season.json') : '';
const VIDEO = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;

let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? ' -- ' + JSON.stringify(extra) : ''}`); }
};

if (!SEASON_FILE || !existsSync(SEASON_FILE) || !existsSync(LIBRARY_ROOT)) {
  console.log(`Canonical film data absent (season body or library root) — (skipped)`);
  console.log('== RESULT: 0 passed, 0 failed (skipped) ==');
  process.exit(0);
}

// ---- the app's own rules, reproduced exactly -------------------------------
const identity = value => {
  const raw = typeof value === 'string' ? value : (value?.path || value?.name || '');
  return String(raw).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.[^/.]+$/, '').toLowerCase();
};
const expectedIds = game => {
  if (Array.isArray(game?.clipRefs) && game.clipRefs.length) {
    return game.clipRefs.map(r => r.originalRelativePath || r.libraryRelativePath || r.displayName || r.originalName).map(identity).filter(Boolean);
  }
  if (Array.isArray(game?.clipPaths) && game.clipPaths.length) return game.clipPaths.map(identity).filter(Boolean);
  if (Array.isArray(game?.clipNames) && game.clipNames.length) return game.clipNames.map(identity).filter(Boolean);
  return game?.videoFileName ? [identity(game.videoFileName)] : [];
};
const listLinkedFilm = (absDir, prefix = '') => {
  const out = [];
  let entries;
  try { entries = readdirSync(absDir); } catch { return out; }
  for (const name of entries) {
    const child = join(absDir, name);
    let dir = false;
    try { dir = statSync(child).isDirectory(); } catch { continue; }
    if (dir) out.push(...listLinkedFilm(child, `${prefix}${name}/`));
    else if (VIDEO.test(name)) out.push({ name, path: `${prefix}${name}` });
  }
  return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
};
const linkedGameDir = filmDir => {
  if (!filmDir) return '';
  if (/^([A-Za-z]:[\\/]|\/)/.test(filmDir)) return filmDir;
  if (filmDir === '.') return LIBRARY_ROOT;
  return join(LIBRARY_ROOT, ...String(filmDir).split('/'));
};
const managedDir = gameId => join(APP_DATA, 'seasons', SEASON_ID, 'films', String(gameId));
const walkManaged = (dir, prefix = '') => {
  const out = [];
  let entries;
  try { entries = readdirSync(dir); } catch { return out; }
  for (const name of entries) {
    const child = join(dir, name);
    let d = false;
    try { d = statSync(child).isDirectory(); } catch { continue; }
    if (d) out.push(...walkManaged(child, `${prefix}${name}/`));
    else out.push({ name, path: `${prefix}${name}` });
  }
  return out;
};

// ---- the truth, from the real sources -------------------------------------
const season = JSON.parse(readFileSync(SEASON_FILE, 'utf8'));
const games = season.games || [];
const truth = games.map(game => {
  const ids = expectedIds(game);
  const linked = game.filmMode === 'linked';
  const dir = linked ? linkedGameDir(game.filmDir) : managedDir(game.id);
  const dirExists = !!dir && existsSync(dir);
  const files = !dirExists ? [] : (linked ? listLinkedFilm(dir) : walkManaged(dir));
  const found = new Set(files.map(f => identity(f.path)).filter(Boolean));
  const missing = ids.filter(id => !found.has(id));
  return {
    id: String(game.id), name: game.gameInfo?.opponent || game.name || '',
    mode: game.filmMode || '', filmDir: game.filmDir || '', dir, dirExists,
    expected: ids.length, disk: files.length, missing: missing.length,
    unmatched: missing.slice(0, 5), files,
    ready: !!ids.length && dirExists && missing.length === 0,
  };
});
const readyCount = truth.filter(row => row.ready).length;
const trueLabel = `${readyCount} of ${games.length} game${games.length === 1 ? '' : 's'} linked`;

console.log(`-- live film sources: "${season.seasonName || season.name}" (${SEASON_ID}) --`);
console.log(`   library root ${LIBRARY_ROOT}`);
for (const row of truth) {
  console.log(`   ${row.id}  ${String(row.name).padEnd(28)} mode=${row.mode.padEnd(7)} expected=${String(row.expected).padStart(3)} onDisk=${String(row.disk).padStart(3)} missing=${String(row.missing).padStart(3)} ${row.ready ? 'LINKED' : 'INCOMPLETE'}`);
  if (row.missing) console.log(`        unmatched: ${row.unmatched.join(', ')}  in ${row.dir}`);
}
console.log(`   TRUE COUNT: ${trueLabel}`);
console.log('');

console.log('-- the season body and its sources are internally consistent --');
ok((season.seasonName || season.name) === SEASON_NAME, 'The audited season is the canonical 2025 JV season', season.seasonName || season.name);
ok(games.length === 6, 'The canonical season still has six games', games.length);
ok(truth.every(row => row.expected > 0), 'Every game references film', truth.map(row => row.expected));
ok(truth.every(row => row.dirExists), 'Every game\'s film directory resolves on disk', truth.filter(row => !row.dirExists).map(row => row.dir));

// ---- the repaired presentation, driven by those real listings --------------
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(TEST_APP_URL, { waitUntil: 'networkidle0' });
await new Promise(r => setTimeout(r, 350));

const rendered = await page.evaluate(async (payload) => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const original = { data: store.data, id: store.currentSeasonId, backend: store.backend };
  const byDir = new Map(payload.rows.map(row => [row.dir, row.files]));
  const byGame = new Map(payload.rows.map(row => [row.id, row]));
  const managedCalls = [];
  // A stub that answers with the REAL listings this machine just read. It never
  // touches the app's own backend, so nothing coach-owned is read or written
  // from inside the page.
  store.backend = {
    currentId: payload.seasonId,
    supportsFilm: () => true,
    supportsLinkedFilm: () => true,
    getLibraryRoot: () => payload.root,
    linkedGameDir: async filmDir => {
      const row = payload.rows.find(r => r.filmDir === filmDir);
      return row ? row.dir : '';
    },
    isLinkedDirAllowed: () => true,
    listLinkedFilm: async absDir => byDir.get(absDir) || [],
    listFilmFiles: async (gameId, seasonId) => {
      managedCalls.push({ gameId: String(gameId), seasonId: seasonId === undefined ? '(omitted)' : String(seasonId) });
      if (String(seasonId) !== String(payload.seasonId)) return [];
      return byGame.get(String(gameId))?.files || [];
    },
  };
  store.currentSeasonId = payload.seasonId;
  store.data = { id: payload.seasonId, seasonName: payload.seasonName, games: payload.games };

  const per = [];
  for (const game of payload.games) {
    const health = await app.workspace.filmHealth(game, payload.seasonId);
    per.push({ id: String(game.id), state: health.state, ready: !!health.ready, expected: health.expected, found: health.found, missing: health.missing, season: health.season });
  }
  const aggregate = await app.teamHubScreen._aggregateFilm(payload.games, payload.seasonId);
  const foreign = await app.teamHubScreen._aggregateFilm(payload.games, 'some-other-season');

  store.data = original.data; store.currentSeasonId = original.id; store.backend = original.backend;
  return { per, aggregate, foreign, managedCalls };
}, {
  seasonId: SEASON_ID, seasonName: season.seasonName || season.name, root: LIBRARY_ROOT,
  games: games.map(game => ({
    id: game.id, name: game.name, gameInfo: game.gameInfo, filmMode: game.filmMode, filmDir: game.filmDir,
    clipRefs: game.clipRefs, clipPaths: game.clipPaths, clipNames: game.clipNames, videoFileName: game.videoFileName,
  })),
  rows: truth.map(row => ({ id: row.id, filmDir: row.filmDir, dir: row.dir, files: row.files })),
});

console.log('\n-- the repaired owner agrees with the real sources --');
ok(rendered.aggregate.label === trueLabel,
  `The library label is the count the film sources support (${trueLabel})`, rendered.aggregate);
ok(rendered.aggregate.seasonId === SEASON_ID, 'The aggregate names the season it measured', rendered.aggregate.seasonId);
ok(rendered.per.length === truth.length && rendered.per.every((row, i) => row.ready === truth[i].ready),
  'Every game\'s rendered readiness matches its own film sources',
  rendered.per.map((row, i) => [row.id, row.ready, truth[i].ready]));
ok(rendered.per.every((row, i) => row.expected === truth[i].expected && row.missing === truth[i].missing),
  'Every game\'s rendered expected/missing counts match its own film sources',
  rendered.per.map((row, i) => [row.id, row.expected, truth[i].expected, row.missing, truth[i].missing]));
ok(rendered.per.every(row => row.season === SEASON_ID), 'Every result states this season', rendered.per.map(row => row.season));
const incomplete = truth.filter(row => !row.ready);
ok(rendered.per.filter(row => !row.ready).length === incomplete.length,
  `Exactly ${incomplete.length} game(s) report incomplete film, matching disk`, rendered.per.filter(row => !row.ready));
// This season's six games are all LINKED, and linked film resolves from the
// game's own `filmDir` under the library root — deliberately season-independent,
// because the clips live where the coach keeps them and are never copied. So the
// season id cannot change a linked answer, and asserting that it does would be
// asserting the wrong contract. What must hold here is that these games never
// touch the managed, season-scoped path at all, and that the result still names
// the season it was asked about. The managed season-scoping itself is proven on
// a two-season reused-id fixture in e2e-data-correctness-batch1.
ok(rendered.managedCalls.length === 0,
  'A linked game never falls through to the managed season directory', rendered.managedCalls);
ok(rendered.foreign.seasonId === 'some-other-season' && rendered.aggregate.seasonId === SEASON_ID,
  'Each aggregate names the season it was asked about', [rendered.aggregate.seasonId, rendered.foreign.seasonId]);
ok(truth.every(row => row.mode === 'linked'),
  'Every game in this season is linked, so this audit is of the linked path', truth.map(row => row.mode));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
