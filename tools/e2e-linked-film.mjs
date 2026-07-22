/* LINKED-FILM PURE-LOGIC HARNESS (Node) ------------------------------------
   The linked film library is desktop-only (Tauri fs/dialog/convertFileSrc), so
   its end-to-end path is validated on the desktop build. This covers the PURE,
   portable root-boundary logic: relToRoot for legacy paths and gameDirFromRoot
   for new links. New game folders must resolve to `.` or a relative child;
   outside-root selections fail closed. Windows backslash + case handling
   matters here.

   Run:  node tools/e2e-linked-film.mjs */
import { TauriBackend } from '../js/storage-backend.js';
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const ok = (got, exp, label) => { if (got === exp) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}  got ${JSON.stringify(got)} exp ${JSON.stringify(exp)}`); } };
const rel = TauriBackend.relToRoot;

console.log('\nLinked-film relToRoot -----------------------------------------');
ok(rel('D:/Football/Film', 'D:/Football/Film/St Peter 41-0'), 'St Peter 41-0', 'forward-slash subfolder');
ok(rel('D:\\Football\\Film', 'D:\\Football\\Film\\Sorrows 18-6'), 'Sorrows 18-6', 'backslash root + backslash path');
ok(rel('D:/Football/Film', 'D:\\Football\\Film\\Marist 8-6-2025\\clips'), 'Marist 8-6-2025/clips', 'nested + mixed separators');
ok(rel('D:/Football/Film/', 'D:/Football/Film/OLL 13-13'), 'OLL 13-13', 'trailing slash on root');
ok(rel('D:/Football/Film', 'd:/football/film/Refuge 7-13'), 'Refuge 7-13', 'case-insensitive root match (Windows)');
ok(rel('D:/Football/Film', 'E:/Other/clips'), '', 'folder outside root → empty (store absolute)');
ok(rel('D:/Football/Film', 'D:/Football/Film'), '', 'root itself → empty');
ok(rel('', 'D:/x'), '', 'no root → empty');
ok(rel('D:/Football/Film', ''), '', 'no path → empty');

console.log('\nLinked-film isDirAllowed (P1-7 consent scope) -----------------');
const allowed = TauriBackend.isDirAllowed;
console.log('\nLinked-film gameDirFromRoot boundary --------------------------');
const gameDir = TauriBackend.gameDirFromRoot;
ok(gameDir('D:/Football/Film', 'D:/Football/Film/St Peter 41-0'), 'St Peter 41-0', 'child folder stores a relative reference');
ok(gameDir('D:/Football/Film', 'D:/Football/Film'), '.', 'library root itself stores an explicit dot reference');
ok(gameDir('D:/Football/Film/', 'd:\\football\\film\\Week 2'), 'Week 2', 'mixed separators and case remain inside the root');
ok(gameDir('D:/Football/Film', 'D:/Football/Filmhouse/Week 2'), null, 'prefix lookalike outside root is rejected');
ok(gameDir('D:/Football/Film', 'E:/Other/Week 2'), null, 'different drive is rejected');
ok(gameDir('', 'D:/Football/Film/Week 2'), null, 'missing root fails closed');
ok(gameDir('D:/Football/Film', ''), null, 'missing game folder fails closed');

ok(allowed('C:/GridIron Library', [], 'C:/GridIron Library/Week7'), true, 'under the library root → allowed');
ok(allowed('C:/GridIron Library', [], 'C:/GridIron Library'), true, 'the root itself → allowed');
ok(allowed('C:/GridIron Library', [], 'c:\\gridiron library\\wk7'), true, 'under root, backslash + case → allowed');
ok(allowed('C:/GridIron Library', [], 'E:/Malicious/payload'), false, 'outside root, not linked → BLOCKED (imported-season vector)');
ok(allowed('C:/GridIron Library', ['D:/Football/Film'], 'D:/Football/Film/St Peter'), true, 'under an explicitly-linked dir → allowed');
ok(allowed('C:/GridIron Library', ['D:/Football/Film'], 'D:/Other/clips'), false, 'outside root and outside every linked dir → BLOCKED');
ok(allowed('', [], 'C:/anything'), false, 'no root + nothing linked → BLOCKED');

// --- filmMode/filmDir must survive commitActive (updateActiveGame carry) ---
// _serialize() does NOT emit filmMode/filmDir; without the carry, linking a game
// and committing would drop them and linked film wouldn't survive a reopen.
console.log('\nLinked-film persistence (updateActiveGame carry) --------------');
const store = new SeasonStore({});   // stub backend — updateActiveGame uses no backend
store.data = {
  version: 5, type: 'season', id: 's1', games: [
    { id: 'g1', name: 'Game 1', status: 'final', gameInfo: { opponent: 'X' }, plays: [], filmMode: 'linked', filmDir: 'St Peter 41-0' },
  ], activeGameId: 'g1',
};
// a fresh _serialize()-like object: has NO filmMode/filmDir (that's the bug shape)
store.updateActiveGame({ version: 4, gameInfo: { opponent: 'X' }, plays: [], clipRefs: [], isMultiClip: true });
const node = store.data.games[0];
ok(node.filmMode, 'linked', 'filmMode survives commit (was dropped by _serialize)');
ok(node.filmDir, 'St Peter 41-0', 'filmDir survives commit');
ok(node.status, 'final', 'status still carried');

console.log('\nLinked-film storage preference + root transaction ----------');
const memory = new Map();
globalThis.window = { __TAURI__: {} };
globalThis.localStorage = {
  getItem: key => memory.has(key) ? memory.get(key) : null,
  setItem: (key, value) => memory.set(key, String(value)),
  removeItem: key => memory.delete(key),
};
const backend = new TauriBackend();
backend.allowLibraryDir = async () => false;
let saved = await backend.setLibraryRoot('D:/Denied');
ok(saved, false, 'denied root reports failure');
ok(backend.getLibraryRoot(), '', 'denied root is not remembered');
ok(backend.getFilmStorageMode(), '', 'denied root cannot masquerade as a linked preference');

backend.allowLibraryDir = async () => true;
saved = await backend.setLibraryRoot('D:/Football/Film');
ok(saved, true, 'allowed root reports success');
ok(backend.getLibraryRoot(), 'D:/Football/Film', 'allowed root persists after access succeeds');
ok(backend.getFilmStorageMode(), 'linked', 'preference infers linked for existing pre-setup users');
ok(await backend.linkedGameDir('.'), 'D:/Football/Film', 'dot game reference resolves to the exact library root');
ok(backend.setFilmStorageMode('managed'), true, 'explicit managed preference persists');

console.log('\nCanonical save result contract --------------------------------');
let shouldSave = false, persistWarnings = 0;
const saveBackend = {
  saveSeason: async () => shouldSave,
  diskStatus: () => ({ bound: false }),
};
const saveStore = new SeasonStore(saveBackend);
saveStore.data = { version: 5, type: 'season', id: 'save-1', games: [] };
saveStore.currentSeasonId = 'save-1';
saveStore.onPersistError = () => { persistWarnings++; };
ok(await saveStore.persist(), false, 'failed canonical save resolves false');
ok(persistWarnings, 1, 'failed canonical save surfaces one warning');
shouldSave = true;
ok(backend.getFilmStorageMode(), 'managed', 'explicit preference wins over inferred linked root');
ok(backend.setFilmStorageMode('bogus'), false, 'invalid storage mode is rejected');
ok(await saveStore.persist(), true, 'successful canonical save resolves true');
ok(backend.getFilmStorageMode(), 'managed', 'rejected mode cannot corrupt the saved preference');
delete globalThis.localStorage;
delete globalThis.window;

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
