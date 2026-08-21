import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
/* Desktop film-storage setup UX. Runs against the built bundle with a focused
   fake desktop backend so native dialogs/files are deterministic. */
import puppeteer from 'puppeteer';
const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => cond
  ? (pass++, console.log(`  PASS  ${label}`))
  : (fail++, console.log(`  FAIL  ${label}${extra ? ' -- ' + extra : ''}`));
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.goto(URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.uiPolish);

await page.evaluate(() => {
  window.__TAURI__ = { desktopTest: true };
  const state = {
    mode: '', root: '', picked: 'D:/Football/Film', setRootCalls: 0,
    saveOk: true, saved: null, saveAttempts: 0, imported: 0, remembered: [],
  };
  const backend = {
    supportsLinkedFilm: () => true,
    supportsFilm: () => true,
    getFilmStorageMode: () => state.mode || (state.root ? 'linked' : ''),
    setFilmStorageMode: mode => { state.mode = mode; return true; },
    getLibraryRoot: () => state.root,
    pickFolder: async () => state.picked,
    setLibraryRoot: async path => { state.setRootCalls++; state.root = path; return true; },
    allowLibraryDir: async () => true,
    relToRoot: path => path === state.root ? '' : path.startsWith(state.root + '/') ? path.slice(state.root.length + 1) : '',
    linkedGameDir: async dir => dir === '.' ? state.root : `${state.root}/${dir}`,
    linkedAbs: async (dir, rel) => `${dir}/${rel}`,
    gameDirFromRoot: path => path === state.root ? '.' : path.startsWith(state.root + '/') ? path.slice(state.root.length + 1) : null,
    linkedFilmUrl: async path => `asset://${path}`,
    listLinkedFilm: async () => [{ name: 'IMG_6251.mp4', path: 'IMG_6251.mp4' }],
    rememberLinkedDir: path => state.remembered.push(path),
    isLinkedDirAllowed: () => true,
    importFilm: async () => { state.imported++; },
    diskStatus: () => ({ bound: false }),
    saveSeason: async (_seasonId, data) => { state.saveAttempts++; if (!state.saveOk) return false; state.saved = structuredClone(data); return true; },
    createBackup: async () => true,
    listSeasons: async () => [],
  };
  window.__filmSetupState = state;
  window.app.storage.seasonStore.backend = backend;
  window.app.uiPolish._initEmptyStateCTA();
  window.app.uiPolish.initFilmStorageSetup();
});
await page.waitForSelector('[data-overlay-id="team-film-settings"]');
await page.waitForSelector('.gi-settings-mode-actions button:nth-child(2)');
let r = await page.evaluate(() => ({
  native: !!document.querySelector('[data-native-settings]'),
  choices: [...document.querySelectorAll('.gi-settings-mode-actions button')].map(x => x.textContent.trim()),
  title: document.querySelector('[data-overlay-id="team-film-settings"] h2')?.textContent,
  legacyModal: !!document.querySelector('#filmStorageSetupModal'),
}));
ok(r.native && /Set Up Film Storage/.test(r.title) && !r.legacyModal, 'First desktop launch opens the one native film-storage setup owner', JSON.stringify(r));
ok(r.choices.some(x => /existing library/i.test(x) && /nothing is copied/i.test(x))
  && r.choices.some(x => /managed storage/i.test(x) && /copied/i.test(x)),
  'Choice copy clearly distinguishes link-in-place from managed copies', JSON.stringify(r.choices));
r = await page.evaluate(() => ({
  native: document.querySelectorAll('[data-native-settings]').length,
}));
ok(r.native === 1, 'Team & Film Settings has one native presentation owner', JSON.stringify(r));

await page.click('.gi-settings-mode-actions button:nth-child(2)');
await page.waitForSelector('.gi-settings-callout.is-success .gi-settings-primary');
await page.click('.gi-settings-callout.is-success .gi-settings-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));

await page.type('.gi-hub-first input[name="teamName"]', 'Storage Test Team');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForSelector('#btnNativeTeamFilmSettings');
await page.waitForFunction(() => !document.querySelector('.gi-native-toast'));
await page.click('#btnNativeTeamFilmSettings');
await page.waitForSelector('[data-overlay-id="team-film-settings"] [data-native-settings]');
ok(await page.evaluate(() => document.querySelectorAll('[data-overlay-id="team-film-settings"] [data-native-settings]').length === 1),
  'Team Hub settings action opens the consolidated panel before a game is opened');
await page.click('[data-settings-tab="film"]');
await page.waitForSelector('[data-settings-panel="film"]');
r = await page.evaluate(() => ({
  status: document.querySelector('[data-settings-panel="film"] .gi-settings-status')?.textContent || '',
  selected: document.querySelector('.gi-settings-mode-actions .is-selected')?.textContent || '',
}));
ok(/Managed copies/i.test(r.status) && /managed storage/i.test(r.selected) && /copied/i.test(r.selected),
  'Native Film settings persists managed mode and discloses copying', JSON.stringify(r));
await page.evaluate(() => window.app.settingsScreen.close('pre-game-proof-complete'));
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));

r = await page.evaluate(() => ({
  mode: window.__filmSetupState.mode,
  label: document.querySelector('#filmStorageModeLabel')?.textContent,
  path: document.querySelector('#filmStoragePathLabel')?.textContent,
  file: document.querySelector('#videoPlaceholder [data-action="file"]')?.textContent,
  link: document.querySelector('#videoPlaceholder [data-action="link"]')?.textContent,
}));
ok(r.mode === 'managed', 'Managed choice remains persisted after setup', JSON.stringify(r));
ok(r.file === 'Add Video' && r.link === 'Link Game Folder', 'Managed mode keeps import primary and link available', JSON.stringify(r));

await page.evaluate(() => {
  window.__filmSetupState.mode = '';
  window.__filmSetupState.root = '';
  window.app.uiPolish.ensureFilmStorageMode({ force: true });
});
await page.waitForSelector('[data-overlay-id="team-film-settings"]');
await page.waitForSelector('.gi-settings-mode-actions button:first-child');
await page.click('.gi-settings-mode-actions button:first-child');
await page.waitForFunction(() => !!document.querySelector('.gi-settings-callout.is-success .gi-settings-primary'));
r = await page.evaluate(() => ({
  sheet: !!document.querySelector('[data-overlay-id="team-film-settings"]'),
  confirmed: document.querySelector('.gi-settings-callout.is-success')?.textContent || '',
  done: !!document.querySelector('.gi-settings-callout.is-success .gi-settings-primary'),
}));
ok(r.sheet && r.done && /D:\/Football\/Film/.test(r.confirmed) && /no video was copied/i.test(r.confirmed),
  'Linked root selection stays on an exact-path no-copy confirmation', JSON.stringify(r));
if (r.done) await page.click('.gi-settings-callout.is-success .gi-settings-primary');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));
await page.evaluate(() => { window.app.settingsScreen.open({ initialTab:'film' }); });
await page.waitForSelector('[data-settings-panel="film"]');
r = await page.evaluate(() => ({
  ...window.__filmSetupState,
  label: document.querySelector('[data-settings-panel="film"] .gi-settings-status')?.textContent,
  path: document.querySelector('.gi-settings-path strong')?.textContent,
  file: document.querySelector('#videoPlaceholder [data-action="file"]')?.textContent,
  folder: document.querySelector('#videoPlaceholder [data-action="folder"]')?.textContent,
  link: document.querySelector('#videoPlaceholder [data-action="link"]')?.textContent,
  top: document.querySelector('#fileLabel')?.textContent,
}));
ok(r.mode === 'linked' && r.root === 'D:/Football/Film' && r.setRootCalls === 1, 'Existing-library choice saves the selected root once', JSON.stringify(r));
ok(/linked/i.test(r.label) && r.path === 'D:/Football/Film', 'Native Film settings shows linked mode and exact library path', JSON.stringify(r));
ok(r.file === 'Copy Video' && r.folder === 'Copy Folder' && r.link === 'Link Game Folder',
  'Linked mode makes no-copy action primary and labels copy overrides honestly', JSON.stringify(r));
ok(/Link from the game/.test(r.top), 'Linked mode removes the top-bar implication that dropping files is the default', r.top);
await page.evaluate(() => window.app.settingsScreen.close('linked-proof-complete'));
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-film-settings"]'));

r = await page.evaluate(async () => {
  const app = window.app;
  const realLinkFilmFolder = app.storage.linkFilmFolder;
  const state = window.__filmSetupState;
  let linked = 0;
  app.storage.seasonStore.activeGame = () => ({ filmMode: null });
  app.storage.linkFilmFolder = async () => { linked++; return true; };
  app.tagger._choiceDialog = async () => 'copy';
  const copyAccepted = await app.uiPolish.prepareFilmFiles([{}]);
  app.tagger._choiceDialog = async () => 'link';
  const linkAccepted = await app.uiPolish.prepareFilmFiles([{}]);
  state.mode = 'managed';
  const managedAccepted = await app.uiPolish.prepareFilmFiles([{}]);
  app.storage.linkFilmFolder = realLinkFilmFolder;
  return { copyAccepted, linkAccepted, managedAccepted, linked };
});
ok(r.copyAccepted === true, 'Linked default copies only after an explicit Copy choice', JSON.stringify(r));
const intentResult = r;

// Exact installed-smoke regression: the app-level D: root and the game's child
// folder are separate durable values. Linking must never enter managed import.
r = await page.evaluate(async () => {
  const app = window.app;
  const state = window.__filmSetupState;
  const store = app.storage.seasonStore;
  delete store.activeGame; // restore the SeasonStore prototype after the intent test above
  state.mode = 'linked';
  state.root = 'D:/Football/Film';
  state.picked = 'D:/Football/Film/St Peter 41-0';
  state.saveOk = true;
  state.saved = null;
  state.imported = 0;
  state.remembered = [];

  const play = {
    id: 10, timestamp: { start: 0, end: 8 },
    tags: { unit: 'offense', formation: 'Ace', playType: 'Run Inside', result: 'Gain', yardage: '6', custom: [] },
    notes: 'keep me', clipId: 77, clipName: 'IMG_6251', clipPath: 'IMG_6251', catalogClipId: 'clip-1',
  };
  store.currentSeasonId = 's1';
  store.data = {
    version: 5, type: 'season', id: 's1', seasonName: '2025 Mavericks', activeGameId: 'g1',
    games: [{ id: 'g1', name: 'Week 1', status: 'final', gameInfo: { opponent: 'St Peter' },
      plays: [structuredClone(play)], annotations: [], nextId: 11, currentPlayId: 10,
      clipNames: ['IMG_6251'], clipPaths: ['IMG_6251'], clipRefs: [{ id: 'IMG_6251', catalogClipId: 'clip-1' }], isMultiClip: true }],
  };
  app.storage._loadedGameId = 'g1';
  app.storage.gameInfo = { opponent: 'St Peter' };
  app.storage.videoFileName = null;
  app.tagger.plays = [structuredClone(play)];
  app.tagger.currentPlayId = 10;
  app.tagger.nextId = 11;
  app.canvas.annotations = [];
  const playlist = {
    clips: [], activeClipIndex: -1, _nextClipId: 1,
    get hasClips() { return this.clips.length > 0; },
    reset() { this.clips = []; this.activeClipIndex = -1; this._nextClipId = 1; },
    async rehydrateFromDisk(files, plays) {
      this.reset();
      this.clips = files.map((file, i) => ({ id: i + 1, name: file.name.replace(/\.[^.]+$/, ''), clipPath: file.path.replace(/\.[^.]+$/, ''), catalogClipId: 'clip-1', assetUrl: file.url, playId: plays[0]?.id || null }));
      if (plays[0]) { plays[0].clipId = 1; plays[0].clipName = this.clips[0].name; plays[0].clipPath = this.clips[0].clipPath; }
    },
    switchToClip() { this.activeClipIndex = 0; },
    switchToClipByPlayId() { this.activeClipIndex = 0; },
  };
  app.storage.playlist = playlist;

  const linked = await app.storage.linkFilmFolder();
  await new Promise(resolve => setTimeout(resolve, 0));
  const savedGame = state.saved?.games?.[0] || null;
  const nativeSettings = await app.settingsScreen.snapshot();
  const activeSource = nativeSettings.games.find(row => row.game.id === store.data.activeGameId);
  const source = activeSource?.path || '';
  const sourceMode = activeSource?.game?.filmMode || '';

  // A canonical failure must restore the pre-link game instead of returning a
  // success toast over unsaved metadata.
  app.storage.commitActive();
  const beforeFailedLink = structuredClone(store.data.games[0]);
  state.picked = 'D:/Football/Film/Failed Game';
  state.saveOk = false;
  const failed = await app.storage.linkFilmFolder();
  await new Promise(resolve => setTimeout(resolve, 0));
  const afterFailedLink = structuredClone(store.data.games[0]);

  state.saveOk = true;
  state.picked = 'E:/Outside/Game 2';
  const outside = await app.storage.linkFilmFolder();

  const originalLinkedFilmUrl = store.backend.linkedFilmUrl;
  const savesBeforeRace = state.saveAttempts;
  const g1BeforeRace = structuredClone(store.data.games[0]);
  store.data.games.push({ id: 'g2', name: 'Week 2', gameInfo: {}, plays: [], annotations: [], nextId: 1 });
  state.picked = 'D:/Football/Film/Race Game';
  store.backend.linkedFilmUrl = async path => {
    store.data.activeGameId = 'g2';
    return `asset://${path}`;
  };
  const raced = await app.storage.linkFilmFolder();
  store.backend.linkedFilmUrl = originalLinkedFilmUrl;
  const raceSafe = state.saveAttempts === savesBeforeRace && JSON.stringify(store.data.games[0]) === JSON.stringify(g1BeforeRace);

  return {
    linked, root: state.root, setRootCalls: state.setRootCalls, imported: state.imported,
    savedMode: savedGame?.filmMode, savedDir: savedGame?.filmDir,
    savedPlay: savedGame?.plays?.[0], source, sourceMode,
    failed, failedRolledBack: JSON.stringify(afterFailedLink) === JSON.stringify(beforeFailedLink),
    outside, finalRoot: state.root,
    raced, raceSafe,
  };
});
ok(r.linked === true && r.root === 'D:/Football/Film' && r.setRootCalls === 1,
  'Linking Week 1 cannot overwrite the one-time library root', JSON.stringify(r));
ok(r.savedMode === 'linked' && r.savedDir === 'St Peter 41-0',
  'Game link persists canonical linked mode plus child-folder reference', JSON.stringify(r));
ok(r.imported === 0 && r.savedPlay?.id === 10 && r.savedPlay?.tags?.formation === 'Ace' && r.savedPlay?.notes === 'keep me',
  'Linked flow makes no managed copy and preserves play identity/tags/notes', JSON.stringify(r));
ok(r.sourceMode === 'linked' && /D:\/Football\/Film\/St Peter 41-0/.test(r.source),
  'Settings shows the active game actual linked source path', JSON.stringify(r));
ok(r.failed === false && r.failedRolledBack, 'Failed canonical save rolls the entire game link back and reports failure', JSON.stringify(r));
ok(r.outside === false && r.finalRoot === 'D:/Football/Film', 'Outside-root game folder is rejected without changing the library root', JSON.stringify(r));
ok(r.raced === false && r.raceSafe, 'Game switch during native URL resolution fails before any link mutation or save', JSON.stringify(r));
ok(intentResult.linkAccepted === false && intentResult.linked === 1, 'Link choice routes to folder linking before VideoController loads files', JSON.stringify(intentResult));
ok(intentResult.managedAccepted === true, 'Managed mode proceeds through the normal import pipeline', JSON.stringify(intentResult));

// ===================== C2: durable linked-film truth =====================

// C2 root-cause reproduction: linkFilmFolder links the ACTIVE game. The Refuge
// "false success" was reaching the link with the WRONG game active — the coach
// chose Refuge's folder, but a different game was active, so that game got
// linked and Refuge stayed managed (played from its C: copy). Under the C1
// single-owner lifecycle the opened game IS the active game, so the link lands
// on the game the coach opened. This proves both the mechanism and the fix.
let c2 = await page.evaluate(async () => {
  const app = window.app;
  const state = window.__filmSetupState;
  const store = app.storage.seasonStore;
  state.mode = 'linked'; state.root = 'D:/Football/Film'; state.saveOk = true;
  const mkGame = (id, name) => ({
    id, name, status: 'active', gameInfo: { opponent: name },
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', custom: [] }, clipName: `${id}_1`, clipPath: `${id}_1` }],
    annotations: [], nextId: 2, currentPlayId: 1, clipNames: [`${id}_1`], clipPaths: [`${id}_1`], isMultiClip: true,
  });
  store.currentSeasonId = 's2';
  store.data = { version: 5, type: 'season', id: 's2', seasonName: 'Truth', activeGameId: 'other',
    games: [mkGame('refuge', 'Refuge'), mkGame('other', 'ND Prep')] };
  const setActive = (id) => {
    store.data.activeGameId = id;
    app.storage._loadedGameId = id;
    const g = store.data.games.find(x => x.id === id);
    app.tagger.plays = g.plays.map(p => JSON.parse(JSON.stringify(p)));
    app.tagger.currentPlayId = g.currentPlayId; app.tagger.nextId = g.nextId;
  };
  const refugeFolder = 'D:/Football/Film/Refuge 7-13';

  // Reproduction: WRONG game active (ND Prep), coach picks Refuge's folder.
  setActive('other');
  state.picked = refugeFolder;
  await app.storage.linkFilmFolder();
  const wrong = {
    other: store.data.games.find(g => g.id === 'other').filmMode || null,
    refuge: store.data.games.find(g => g.id === 'refuge').filmMode || null,
  };

  // Fix: open Refuge (single-owner lifecycle makes it the active game), link.
  setActive('refuge');
  state.picked = refugeFolder;
  const linkedOk = await app.storage.linkFilmFolder();
  const fixed = {
    refugeMode: store.data.games.find(g => g.id === 'refuge').filmMode || null,
    refugeDir: store.data.games.find(g => g.id === 'refuge').filmDir || null,
    otherMode: store.data.games.find(g => g.id === 'other').filmMode || null,
  };
  return { wrong, linkedOk, fixed };
});
ok(c2.wrong.other === 'linked' && c2.wrong.refuge === null,
  'C2 reproduction: linking with the WRONG game active links that game and leaves the intended game managed (the Refuge false-success class)', JSON.stringify(c2.wrong));
ok(c2.linkedOk === true && c2.fixed.refugeMode === 'linked' && c2.fixed.refugeDir === 'Refuge 7-13' && c2.fixed.otherMode === 'linked',
  'C2 fix: with the intended game active (single-owner lifecycle), the link lands on that game with its D: child folder', JSON.stringify(c2.fixed));

// C2 OL Lakes honesty: a linked game with 82 charted clips but only 65 present
// in its D: folder must report 17 missing — never silently imply complete film.
c2 = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const names = Array.from({ length: 82 }, (_, i) => `OLL_${String(i + 1).padStart(3, '0')}`);
  const present = names.slice(0, 65);   // 17 missing from the linked folder
  const game = {
    id: 'oll', name: 'OL Lakes', filmMode: 'linked', filmDir: 'OLL 13-13', status: 'final',
    gameInfo: { opponent: 'OL Lakes' }, plays: [], annotations: [], nextId: 1,
    clipNames: names.slice(), clipPaths: names.slice(), isMultiClip: true,
  };
  store.currentSeasonId = 's3';
  store.data = { version: 5, type: 'season', id: 's3', seasonName: 'OLL', activeGameId: 'oll', games: [game] };
  const backend = store.backend;
  backend.listLinkedFilm = async () => present.map(n => ({ name: `${n}.mp4`, path: `${n}.mp4` }));
  const health = await app.workspace.filmHealth(game);
  return { state: health.state, mode: health.mode, expected: health.expected, found: health.found, missing: health.missing };
});
ok(c2.state === 'missing' && c2.mode === 'linked' && c2.expected === 82 && c2.found === 65 && c2.missing === 17,
  'C2 OL Lakes: film health reports 17 of 82 charted clips missing from the linked D: folder (no false "complete film")', JSON.stringify(c2));

// C2 no silent fallback: auto-loading a persisted LINKED game must resolve film
// only from the linked D: folder — it must never call the managed-copy backend.
c2 = await page.evaluate(async () => {
  const app = window.app;
  const store = app.storage.seasonStore;
  const backend = store.backend;
  let managedListCalls = 0, managedUrlCalls = 0, linkedListCalls = 0;
  backend.listFilmFiles = async () => { managedListCalls++; return []; };   // managed path (must NOT run)
  backend.filmUrl = async () => { managedUrlCalls++; return null; };        // managed path (must NOT run)
  const origLinkedList = backend.listLinkedFilm;
  backend.listLinkedFilm = async (...a) => { linkedListCalls++; return [{ name: 'OLL_001.mp4', path: 'OLL_001.mp4' }]; };
  const game = {
    id: 'oll2', name: 'OL Lakes', filmMode: 'linked', filmDir: 'OLL 13-13',
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { custom: [] }, clipName: 'OLL_001', clipPath: 'OLL_001' }],
    annotations: [], nextId: 2, currentPlayId: 1, clipNames: ['OLL_001'], clipPaths: ['OLL_001'], isMultiClip: true,
  };
  app.tagger.plays = game.plays.map(p => JSON.parse(JSON.stringify(p)));
  app.tagger.currentPlayId = 1;
  await app.storage._autoLoadFilm(game);
  backend.listLinkedFilm = origLinkedList;
  return { managedListCalls, managedUrlCalls, linkedListCalls };
});
ok(c2.linkedListCalls >= 1 && c2.managedListCalls === 0 && c2.managedUrlCalls === 0,
  'C2 no silent fallback: a persisted linked game auto-loads from the D: folder and never calls the managed-copy backend', JSON.stringify(c2));

// ===== C1+C2 together: the REAL coach path (finding 3, 2026-07-23) =====
// The earlier C2 reproduction used a direct setActive(). This proves the actual
// installed flow that C1 governs: Home -> app.openGame(Refuge) makes Refuge the
// single active game, link its D: folder, PERSIST, then REOPEN from the saved
// payload through the same command and confirm the link resolved from D: with
// zero managed-copy calls. This is the assertion that ties C1's single-owner
// lifecycle to C2's durable linked-film truth end to end.
const real = await page.evaluate(async () => {
  const app = window.app;
  const state = window.__filmSetupState;
  const store = app.storage.seasonStore;
  state.mode = 'linked'; state.root = 'D:/Football/Film'; state.saveOk = true; state.saved = null;
  const backend = store.backend;
  let managedList = 0, managedUrl = 0, linkedList = 0;
  backend.listFilmFiles = async () => { managedList++; return []; };   // managed path — must NOT run for a linked game
  backend.filmUrl = async () => { managedUrl++; return null; };
  backend.listLinkedFilm = async () => { linkedList++; return [{ name: 'RF_001.mp4', path: 'RF_001.mp4' }]; };
  const mkGame = (id, name) => ({
    id, name, status: 'active', gameInfo: { opponent: name },
    plays: [{ id: 1, timestamp: { start: 0, end: 5 }, tags: { unit: 'offense', custom: [] }, clipName: 'RF_001', clipPath: 'RF_001' }],
    annotations: [], nextId: 2, currentPlayId: 1, clipNames: ['RF_001'], clipPaths: ['RF_001'], isMultiClip: true,
  });
  store.currentSeasonId = 's4';
  store.data = { version: 5, type: 'season', id: 's4', seasonName: 'RealPath', activeGameId: 'other',
    games: [mkGame('refuge', 'Refuge'), mkGame('other', 'ND Prep'), mkGame('holy', 'Holy Family')] };
  // Hydrate EVERY live editor surface through the production loader before
  // openGame commits the outgoing game. Seeding only tagger.plays leaves stale
  // gameInfo/playlist state from earlier scenarios and creates a fake mutation.
  app.storage._loadedGameId = null;
  await app.storage._loadActiveGame();
  app.storage.commitActive();
  await store.persist();
  const nonTargetsBefore = JSON.stringify(store.data.games.filter(g => g.id !== 'refuge'));

  // C1: open Refuge through the ONE authoritative command (not setActive).
  // switchToGame runs (and commits/persists) before the workspace transition, so
  // the active-game truth holds even if the shell render is a no-op in-harness.
  let openErr = null;
  try { await app.openGame('refuge'); } catch (e) { openErr = String(e && e.message || e); }
  const activeAfterOpen = store.data.activeGameId;

  // Link Refuge's D: folder — linkFilmFolder targets the ACTIVE game.
  state.picked = 'D:/Football/Film/Refuge 7-13';
  const linkedOk = await app.storage.linkFilmFolder();
  const savedRefuge = (state.saved && state.saved.games || []).find(g => g.id === 'refuge') || {};

  // REOPEN: rebuild the season from the persisted payload (a fresh relaunch)
  // and run the real active-game load path. openGame is idempotent for the
  // already-active game, so a relaunch resolves film through _loadActiveGame ->
  // _autoLoadFilm — which must take the linked D: branch with zero managed calls.
  managedList = 0; managedUrl = 0; linkedList = 0;
  store.data = JSON.parse(JSON.stringify(state.saved));
  const reopenRefuge = store.data.games.find(g => g.id === 'refuge');
  app.storage._loadedGameId = 'refuge';
  app.tagger.plays = reopenRefuge.plays.map(p => JSON.parse(JSON.stringify(p)));
  app.tagger.currentPlayId = reopenRefuge.currentPlayId;
  let reopenErr = null;
  try { await app.storage._autoLoadFilm(reopenRefuge); } catch (e) { reopenErr = String(e && e.message || e); }

  return {
    openErr, reopenErr, activeAfterOpen, linkedOk,
    savedMode: savedRefuge.filmMode || null, savedDir: savedRefuge.filmDir || null,
    reopenMode: reopenRefuge && reopenRefuge.filmMode || null,
    reopenDir: reopenRefuge && reopenRefuge.filmDir || null,
    managedList, managedUrl, linkedList,
    nonTargetsUnchanged: JSON.stringify(store.data.games.filter(g => g.id !== 'refuge')) === nonTargetsBefore,
  };
});
ok(real.activeAfterOpen === 'refuge',
  'C1 real path: app.openGame(Refuge) makes Refuge the single active game', JSON.stringify(real));
ok(real.linkedOk === true && real.savedMode === 'linked' && real.savedDir === 'Refuge 7-13',
  'C2 real path: linking the opened game persists linked metadata to the saved payload', JSON.stringify(real));
ok(real.reopenMode === 'linked' && real.reopenDir === 'Refuge 7-13' && real.linkedList >= 1 && real.managedList === 0 && real.managedUrl === 0,
  'C1+C2 real path: reopening from the saved payload resolves Refuge from D: with zero managed-copy calls', JSON.stringify(real));
ok(real.nonTargetsUnchanged,
  'C2 isolation: opening, linking, saving, and reopening Refuge leaves every complete non-target game byte-identical', JSON.stringify(real));

// ===================== S7-b: film loading survives the legacy shell =====
//
// The two film pickers lived inside #app, which S7-d deletes. They are the
// nonvisual hosts the ledger flagged: no coach sees them, but the native empty
// state and Film settings both click them, so deleting #app from a surface
// count would have taken film loading with it.
//
// These assertions pin the coach-facing path, not the markup: the pickers are
// outside the legacy tree, the visible actions reach them, and a dropped file
// still starts an import.
console.log('\n== S7-b: film loading is independent of the legacy shell ==');
await page.evaluate(() => window.app.workspaceShell.show('breakdown'));
await page.waitForSelector('#videoPlaceholder [data-action="file"]');

let s7b = await page.evaluate(() => {
  const q = id => document.getElementById(id);
  const outsideLegacy = el => !!el && !el.closest('#app') && !el.closest('#wsClassicOutlet');
  const onScreen = el => {
    const r = el?.getBoundingClientRect();
    return !!r && r.width > 0 && r.height > 0 && !el.closest('.hidden,[hidden]');
  };
  // Click the visible Add Video action and record which input it opened. The
  // picker itself cannot open a real dialog headlessly, so the proof is that
  // the click reaches the canonical input exactly once.
  const opened = [];
  const patch = id => {
    const el = q(id);
    const original = el.click.bind(el);
    el.click = () => { opened.push(id); };
    return () => { el.click = original; };
  };
  const restore = [patch('videoFileInput'), patch('videoFolderInput')];
  document.querySelector('#videoPlaceholder [data-action="file"]').click();
  document.querySelector('#videoPlaceholder [data-action="folder"]').click();
  restore.forEach(fn => fn());
  return {
    fileOutside: outsideLegacy(q('videoFileInput')),
    folderOutside: outsideLegacy(q('videoFolderInput')),
    opened,
    placeholderLive: onScreen(q('videoPlaceholder')),
    // The only pre-S7-b drop target. Measured 0x0 inside the hidden outlet, so
    // dropping film had been dead the whole shell era while the empty state
    // still advertised it.
    legacyDropZoneReachable: onScreen(q('videoDropZone')),
  };
});
ok(s7b.fileOutside && s7b.folderOutside,
  'Both film pickers live outside #app and the classic outlet, so final deletion cannot take film loading with it', JSON.stringify(s7b));
ok(s7b.opened.join(',') === 'videoFileInput,videoFolderInput',
  'The native empty-state actions reach the canonical film pickers exactly once each', JSON.stringify(s7b));

// Drop on the live empty state must reach the same files-selected path the
// pickers use. Bound only to the entombed label before S7-b.
s7b = await page.evaluate(async () => {
  const placeholder = document.getElementById('videoPlaceholder');
  // beforeFilesSelected is the canonical import gate every entry point feeds,
  // ahead of any managed/linked branching. Returning false keeps this proof
  // read-only: nothing is imported, copied, or written.
  const original = window.app.vc.beforeFilesSelected;
  let received = null;
  window.app.vc.beforeFilesSelected = files => { received = files.map(f => f.name); return false; };
  // A synthetic DataTransfer's webkitGetAsEntry() yields an entry whose file()
  // callback never fires, so the dropped-FOLDER branch cannot be driven
  // headlessly. This drives the flat-files branch — a dropped file — which is
  // the same handler and the same import gate.
  const fire = type => {
    const ev = new Event(type, { bubbles: true, cancelable: true });
    Object.defineProperty(ev, 'dataTransfer', {
      value: { items: null, files: [new File([new Uint8Array([0])], 'drop-test.mp4', { type: 'video/mp4' })] },
    });
    placeholder.dispatchEvent(ev);
  };
  fire('dragover');
  const over = placeholder.classList.contains('drag-over');
  fire('drop');
  await new Promise(r => setTimeout(r, 150));
  window.app.vc.beforeFilesSelected = original;
  return { over, received, stillOver: placeholder.classList.contains('drag-over') };
});
ok(s7b.over === true && Array.isArray(s7b.received) && s7b.received[0] === 'drop-test.mp4' && s7b.stillOver === false,
  'Dropping film on the live empty state reaches the canonical import gate, which the entombed top-bar label could not', JSON.stringify(s7b));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
