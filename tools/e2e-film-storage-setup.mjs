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
  const state = { mode: '', root: '', picked: 'D:/Football/Film', setRootCalls: 0 };
  const backend = {
    supportsLinkedFilm: () => true,
    getFilmStorageMode: () => state.mode || (state.root ? 'linked' : ''),
    setFilmStorageMode: mode => { state.mode = mode; return true; },
    getLibraryRoot: () => state.root,
    pickFolder: async () => state.picked,
    setLibraryRoot: async path => { state.setRootCalls++; state.root = path; return true; },
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
  return { copyAccepted, linkAccepted, managedAccepted, linked };
});
ok(r.copyAccepted === true, 'Linked default copies only after an explicit Copy choice', JSON.stringify(r));
ok(r.linkAccepted === false && r.linked === 1, 'Link choice routes to folder linking before VideoController loads files', JSON.stringify(r));
ok(r.managedAccepted === true, 'Managed mode proceeds through the normal import pipeline', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
