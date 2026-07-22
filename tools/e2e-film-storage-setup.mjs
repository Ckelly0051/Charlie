/* Desktop film-storage setup UX. Runs against the built bundle with a focused
   fake desktop backend so native dialogs/files are deterministic. */
import puppeteer from 'puppeteer';
const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
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
    saveSeason: async data => { state.saveAttempts++; if (!state.saveOk) return false; state.saved = structuredClone(data); return true; },
    createBackup: async () => true,
  };
  window.__filmSetupState = state;
  window.app.storage.seasonStore.backend = backend;
  window.app.uiPolish._initEmptyStateCTA();
  window.app.uiPolish.initFilmStorageSetup();
});
await page.waitForSelector('#filmStorageSetupModal');
let r = await page.evaluate(() => ({
  panelVisible: !document.querySelector('#filmStoragePanel')?.hidden,
  choices: [...document.querySelectorAll('.film-storage-option')].map(x => x.textContent.trim()),
  title: document.querySelector('#filmStorageTitle')?.textContent,
}));
ok(r.panelVisible && /Where should your film live/.test(r.title), 'First desktop launch opens intentional storage setup', JSON.stringify(r));
ok(r.choices.some(x => /existing film library/i.test(x) && /no copy/i.test(x))
  && r.choices.some(x => /manage film/i.test(x) && /copied/i.test(x)),
  'Choice copy clearly distinguishes link-in-place from managed copies', JSON.stringify(r.choices));
r = await page.evaluate(() => ({
  nested: !!document.querySelector('#gameInfoPanel #filmStoragePanel'),
  hubButton: !!document.getElementById('btnTeamFilmSettings'),
}));
ok(r.nested, 'Film Storage lives inside Team & Film Settings instead of a competing panel', JSON.stringify(r));
ok(r.hubButton, 'Team Hub exposes Team & Film Settings before a game is opened', JSON.stringify(r));
if (r.hubButton) {
  await page.evaluate(() => document.getElementById('btnTeamFilmSettings').click());
  r = await page.evaluate(() => ({ drawer: document.getElementById('settingsDrawer')?.classList.contains('open'), panel: !document.getElementById('gameInfoPanel')?.classList.contains('collapsed') }));
  ok(r.drawer && r.panel, 'Team Hub settings action opens the consolidated panel', JSON.stringify(r));
  await page.evaluate(() => document.getElementById('settingsDrawerClose')?.click());
}


await page.click('[data-storage-action="managed"]');
await page.waitForFunction(() => !document.querySelector('#filmStorageSetupModal'));
r = await page.evaluate(() => ({
  mode: window.__filmSetupState.mode,
  label: document.querySelector('#filmStorageModeLabel')?.textContent,
  path: document.querySelector('#filmStoragePathLabel')?.textContent,
  file: document.querySelector('#videoPlaceholder [data-action="file"]')?.textContent,
  link: document.querySelector('#videoPlaceholder [data-action="link"]')?.textContent,
}));
ok(r.mode === 'managed' && /Managed/.test(r.label) && /copied/.test(r.path), 'Managed choice persists and discloses copying', JSON.stringify(r));
ok(r.file === 'Add Video' && r.link === 'Link Game Folder', 'Managed mode keeps import primary and link available', JSON.stringify(r));

await page.evaluate(() => {
  window.__filmSetupState.mode = '';
  window.__filmSetupState.root = '';
  window.app.uiPolish.ensureFilmStorageMode({ force: true });
});
await page.waitForSelector('#filmStorageSetupModal');
await page.click('[data-storage-action="linked"]');
await new Promise(resolve => setTimeout(resolve, 50));
r = await page.evaluate(() => ({
  modal: !!document.querySelector('#filmStorageSetupModal'),
  confirmed: document.querySelector('[data-storage-confirmation]')?.textContent || '',
  done: !!document.querySelector('[data-storage-action="done"]'),
}));
ok(r.modal && r.done && /D:\/Football\/Film/.test(r.confirmed) && /no video will be copied/i.test(r.confirmed),
  'Linked root selection stays on an exact-path no-copy confirmation', JSON.stringify(r));
if (r.done) await page.click('[data-storage-action="done"]');
await page.waitForFunction(() => !document.querySelector('#filmStorageSetupModal'));
r = await page.evaluate(() => ({
  ...window.__filmSetupState,
  label: document.querySelector('#filmStorageModeLabel')?.textContent,
  path: document.querySelector('#filmStoragePathLabel')?.textContent,
  file: document.querySelector('#videoPlaceholder [data-action="file"]')?.textContent,
  folder: document.querySelector('#videoPlaceholder [data-action="folder"]')?.textContent,
  link: document.querySelector('#videoPlaceholder [data-action="link"]')?.textContent,
  top: document.querySelector('#fileLabel')?.textContent,
}));
ok(r.mode === 'linked' && r.root === 'D:/Football/Film' && r.setRootCalls === 1, 'Existing-library choice saves the selected root once', JSON.stringify(r));
ok(/linked/i.test(r.label) && r.path === 'D:/Football/Film', 'Settings always shows linked mode and exact library path', JSON.stringify(r));
ok(r.file === 'Copy Video' && r.folder === 'Copy Folder' && r.link === 'Link Game Folder',
  'Linked mode makes no-copy action primary and labels copy overrides honestly', JSON.stringify(r));
ok(/Link from the game/.test(r.top), 'Linked mode removes the top-bar implication that dropping files is the default', r.top);

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
  app.uiPolish._renderFilmStorageSettings();
  await new Promise(resolve => setTimeout(resolve, 0));
  const source = document.getElementById('gameFilmSourcePath')?.textContent || '';
  const sourceMode = document.getElementById('gameFilmSourceMode')?.textContent || '';

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
ok(/Linked/i.test(r.sourceMode) && /D:\/Football\/Film\/St Peter 41-0/.test(r.source),
  'Settings shows the active game actual linked source path', JSON.stringify(r));
ok(r.failed === false && r.failedRolledBack, 'Failed canonical save rolls the entire game link back and reports failure', JSON.stringify(r));
ok(r.outside === false && r.finalRoot === 'D:/Football/Film', 'Outside-root game folder is rejected without changing the library root', JSON.stringify(r));
ok(r.raced === false && r.raceSafe, 'Game switch during native URL resolution fails before any link mutation or save', JSON.stringify(r));
ok(intentResult.linkAccepted === false && intentResult.linked === 1, 'Link choice routes to folder linking before VideoController loads files', JSON.stringify(intentResult));
ok(intentResult.managedAccepted === true, 'Managed mode proceeds through the normal import pipeline', JSON.stringify(intentResult));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
