import path from 'node:path';
import { TauriBackend } from '../js/storage-backend.js';
import { StorageManager } from '../js/storage.js';

let pass = 0, fail = 0;
const ok = (c, label) => { console.log((c ? 'PASS ' : 'FAIL ') + label); c ? pass++ : fail++; };
const memory = new Map([['ffa_film_library_root', 'D:/FilmRoot'], ['ffa_linked_dirs', '["E:/Picked"]']]);
globalThis.localStorage = { getItem: k => memory.get(k) || null, setItem: (k, v) => memory.set(k, String(v)) };
const calls = [], reads = [], converted = [];
const resolve = p => path.win32.resolve(p).replace(/\\/g, '/');
const physical = p => resolve(p).replace(/^D:\/FilmRoot\/junction(?=\/|$)/i, 'D:/Private')
  .replace(/^D:\/FilmRoot\/escape.mp4$/i, 'D:/Private/escape.mp4')
  .replace(/^D:\/FilmAlias(?=\/|$)/i, 'D:/ActualFilm');
globalThis.window = { __TAURI__: {
  fs: { BaseDirectory: { AppData: 1 }, exists: async () => true,
    readDir: async p => { reads.push(p); return p === 'D:/FilmRoot' ? [
      { name: 'clip.mp4', isDirectory: false }, { name: 'junction', isDirectory: true },
      { name: 'escape.mp4', isDirectory: false },
    ] : p === 'D:/ActualFilm' ? [{ name: 'Week1', isDirectory: true }]
      : p === 'D:/ActualFilm/Week1' ? [{ name: 'nested.mp4', isDirectory: false }]
        : [{ name: 'private.mp4', isDirectory: false }]; } },
  dialog: { open: async () => 'F:/New Root' },
  core: { convertFileSrc: p => { converted.push(p); return 'asset:' + p; },
    invoke: async (name, args) => {
      calls.push({ name, ...args });
      if (name !== 'authorize_film_path') return;
      const p = physical(args.path).toLowerCase();
      if (!args.approvedRoots?.some(root => p === physical(root).toLowerCase() || p.startsWith(physical(root).toLowerCase() + '/'))) throw new Error('Not approved');
      return physical(args.path);
    } },
} };
const backend = new TauriBackend();
for (const bad of ['D:/FilmRoot/../Private', 'D:\\FilmRoot\\..\\Private', 'D:/FilmRoot/child/../../Private', 'D:/FilmRoot/child.']) {
  ok(!backend.isLinkedDirAllowed(bad), 'text check refuses noncanonical ' + bad);
  const before = calls.length;
  ok(!await backend.allowLibraryDir(bad) && calls.length === before, 'no grant for ' + bad);
}
ok(await backend.allowLibraryDir('D:/FilmRoot/Week 1'), 'ordinary child authorized');
const grant = calls.at(-1);
ok(grant?.name === 'authorize_film_path' && grant.directory === true && grant.approvedRoots?.includes('D:/FilmRoot')
  && !grant.approvedRoots.includes('D:/FilmRoot/Week 1'), 'grant carries machine-owned roots, not the imported target as consent');
ok(await backend.allowLibraryDir('E:/Picked/Week 2'), 'previously picked outside folder remains authorized');
ok(!await backend.allowLibraryDir('D:/FilmRoot/junction'), 'native denial of outside junction propagates');
const files = await backend.listLinkedFilm('D:/FilmRoot');
ok(files.length === 1 && files[0].name === 'clip.mp4' && !reads.includes('D:/FilmRoot/junction'), 'recursive list refuses outside junction before reading it');
ok(!files.some(f => f.name === 'escape.mp4'), 'rejected file alias is not counted as available film');
memory.set('ffa_film_library_root', 'D:/FilmAlias');
const aliasFiles = await backend.listLinkedFilm('D:/FilmAlias');
ok(aliasFiles.length === 1 && aliasFiles[0].path === 'Week1/nested.mp4', 'approved alias root retains nested films after canonicalization');
memory.set('ffa_film_library_root', 'D:/FilmRoot');
reads.length = 0;
ok((await backend.listLinkedFilm('C:/Unapproved')).length === 0 && reads.length === 0, 'direct listing cannot bypass consent');
ok(await backend.linkedFilmUrl('D:/FilmRoot/junction/private.mp4') === null, 'file URL refuses outside alias');
ok(await backend.linkedFilmUrl('D:/FilmRoot/clip.mp4') === 'asset:D:/FilmRoot/clip.mp4', 'normal film URL uses authorized canonical file');
ok(converted.length === 1, 'only the authorized file reaches convertFileSrc');
const picked = await backend.pickFolder();
ok(await backend.setLibraryRoot(picked) && backend.getLibraryRoot() === picked, 'fresh native picker can establish a new root');
ok(await backend.setLibraryRoot('D:/FilmRoot'), 'prior root remains available for transaction rollback');
memory.set('ffa_film_library_root', 'D:/FilmRoot');
const before = calls.length;
const sm = Object.create(StorageManager.prototype);
Object.assign(sm, { seasonStore: { backend }, _filmLoadSeq: 1, tagger: { toast() {} }, _relinkToast() {} });
await sm._autoLoadLinkedFilm({ id: 'game', filmDir: 'D:/FilmRoot/../Private' }, 1);
ok(!calls.slice(before).some(c => c.path?.includes('../Private')), 'automatic imported-game load never grants the hostile folder');
delete globalThis.localStorage;
delete globalThis.window;
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
