import { SeasonFormat } from '../js/season-format.js';
import { SeasonStore } from '../js/season-store.js';
import { TauriBackend } from '../js/storage-backend.js';

let pass = 0, fail = 0;
function ok(value, label) {
  if (value) { pass++; console.log('PASS ' + label); }
  else { fail++; console.log('FAIL ' + label); }
}
const unsafe = ['.', '..', 'a/b', 'a\\b', 'a.', 'CON', 'nul.json', 'LPT1', 'a:stream', ' a', 12];
const season = id => ({ id: 'safe-season', games: [{ id, plays: [] }] });
for (const id of unsafe) {
  ok(!SeasonFormat.isCurrentSeason(season(id)), 'refuse unsafe game ID ' + JSON.stringify(id));
  ok(!SeasonFormat.isCurrentSeason({ ...season('normal-game'), id }), 'refuse unsafe season ID ' + JSON.stringify(id));
}
ok(SeasonFormat.isCurrentSeason(season('normal.game-12')), 'normal opaque IDs remain valid');
ok(SeasonFormat.isCurrentSeason({ games: [{ plays: [] }] }), 'missing IDs can still be generated');
let writes = 0;
const store = new SeasonStore({ saveSeason: async () => { writes++; return true; } });
store.currentSeasonId = 'safe-season';
const prior = store.data = season('keep-game');
const result = await store.adopt(season('.'));
ok(result.ok === false && writes === 0 && store.data === prior, 'unsafe import writes nothing and preserves the open season');

const removed = [], invoked = [];
globalThis.window = { __TAURI__: { core: { invoke: async (name, args) => invoked.push({ name, ...args }) } } };
const backend = Object.create(TauriBackend.prototype);
Object.assign(backend, { currentId: 'safe-season', baseDir: 'AppData', fs: {
  exists: async () => true, remove: async path => removed.push(path),
} });
for (const id of unsafe) {
  const before = removed.length + invoked.length;
  try { await backend.deleteFilm(id); } catch {}
  ok(removed.length + invoked.length === before, 'direct deletion refuses ' + JSON.stringify(id));
  ok(await backend.managedGameDir(id) === '', 'absolute managed folder refuses ' + JSON.stringify(id));
}
await backend.deleteFilm('normal-game', 'safe-season');
ok(removed.length === 0 && invoked.length === 1 && invoked[0].name === 'delete_managed_film'
  && invoked[0].gameId === 'normal-game' && invoked[0].seasonId === 'safe-season', 'normal deletion uses the native owning-game boundary');
delete globalThis.window;
console.log(`RESULT: ${pass} passed, ${fail} failed`);
process.exitCode = fail ? 1 : 0;
