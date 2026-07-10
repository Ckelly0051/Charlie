/* LINKED-FILM PURE-LOGIC HARNESS (Node) ------------------------------------
   The linked film library is desktop-only (Tauri fs/dialog/convertFileSrc), so
   its end-to-end path is validated on the desktop build. This covers the one
   piece of PURE, portable logic: TauriBackend.relToRoot — resolving a chosen
   folder to a path relative to the library root (or '' when it's outside the
   root, so the caller stores an absolute path). Windows backslash + case
   handling matters here.

   Run:  node tools/e2e-linked-film.mjs */
import { TauriBackend } from '../js/storage-backend.js';

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

console.log(`\n${fail === 0 ? 'ALL PASS' : 'FAILURES'} — ${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
