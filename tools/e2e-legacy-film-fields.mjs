/* REGRESSION: SeasonStore.gameFromLegacy must carry MODERN durable film fields
   (clipPaths / clipRefs / filmMode / filmDir) when the source object has them.
   season-manager merges modern game objects through this wrapper; dropping those
   fields (the pre-fix behavior) regressed a game to weak basename-only clip
   identity and broke linked-film auto-load on reopen. Legacy objects that lack
   the fields must NOT gain them. Pure — runs in Node.

   Run:  node tools/e2e-legacy-film-fields.mjs */
import { SeasonStore } from '../js/season-store.js';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };

// gameFromLegacy only uses this.blankGame + this.gameName (+ _newId) — no backend,
// so a prototype instance is enough to exercise it in Node.
const store = Object.create(SeasonStore.prototype);

// --- modern game object (what season-manager merges) ---
const modern = {
  gameInfo: { opponent: 'St. Peter' },
  plays: [{ id: 1, clipName: '0001.mp4', clipPath: 'Game7/endzone/0001.mp4' }],
  clipNames: ['0001.mp4'],
  clipPaths: ['Game7/endzone/0001.mp4'],
  clipRefs: [{ id: 'Game7/endzone/0001.mp4', displayName: '0001.mp4' }],
  filmMode: 'linked',
  filmDir: 'Week7',
  isMultiClip: true,
};
const m = store.gameFromLegacy(modern);
ok(JSON.stringify(m.clipPaths) === JSON.stringify(modern.clipPaths), 'clipPaths survive gameFromLegacy', JSON.stringify(m.clipPaths));
ok(JSON.stringify(m.clipRefs) === JSON.stringify(modern.clipRefs), 'clipRefs survive gameFromLegacy');
ok(m.filmMode === 'linked', 'filmMode survives gameFromLegacy', m.filmMode);
ok(m.filmDir === 'Week7', 'filmDir survives gameFromLegacy', m.filmDir);
ok(JSON.stringify(m.clipNames) === JSON.stringify(modern.clipNames) && m.isMultiClip === true, 'existing clipNames/isMultiClip still preserved');

// --- legacy single-game object (no modern fields) must not gain them ---
const legacy = { gameInfo: {}, plays: [{ id: 1 }], clipNames: ['old.mp4'], isMultiClip: true };
const l = store.gameFromLegacy(legacy);
ok(l.clipPaths === undefined, 'legacy object gains no phantom clipPaths', String(l.clipPaths));
ok(l.filmMode === undefined, 'legacy object gains no phantom filmMode', String(l.filmMode));
ok(l.clipNames.length === 1 && l.isMultiClip === true, 'legacy clipNames/isMultiClip preserved');

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
process.exit(fail ? 1 : 0);
