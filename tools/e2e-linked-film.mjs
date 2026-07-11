/* LINKED-FILM PURE-LOGIC HARNESS (Node) ------------------------------------
   The linked film library is desktop-only (Tauri fs/dialog/convertFileSrc), so
   its end-to-end path is validated on the desktop build. This covers the one
   piece of PURE, portable logic: TauriBackend.relToRoot — resolving a chosen
   folder to a path relative to the library root (or '' when it's outside the
   root, so the caller stores an absolute path). Windows backslash + case
   handling matters here.

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

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
