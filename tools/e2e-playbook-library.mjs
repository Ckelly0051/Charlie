import assert from 'node:assert/strict';
import { PlaybookLibrary } from '../js/playbook-library.js';
import { SeasonStore } from '../js/season-store.js';

class MemoryStorage {
  constructor() { this.data = new Map(); }
  getItem(key) { return this.data.has(key) ? this.data.get(key) : null; }
  setItem(key, value) { this.data.set(key, String(value)); }
}

let passed = 0;
const test = (name, fn) => {
  try { fn(); passed++; console.log(`  PASS  ${name}`); }
  catch (error) { console.error(`  FAIL  ${name}\n${error.stack}`); process.exitCode = 1; }
};

const storage = new MemoryStorage();
let team = 'mavericks';
const library = new PlaybookLibrary({ storage, teamId: () => team });

test('empty team starts with an empty versioned playbook', () => {
  assert.deepEqual(library.load(), { version: 1, calls: [] });
});

test('a call stores an exact snapshot plus only approved optional defaults', () => {
  const call = library.add({ name: '26 Blast', concept: 'Blast', favorite: true,
    defaults: { runPass: 'Run', playType: 'Run Inside', playDir: 'Right', formation: 'Ace', strength: 'Balanced', notes: 'must not leak' } });
  assert.equal(call.id, 'call_26_blast');
  assert.deepEqual(call, { id: 'call_26_blast', name: '26 Blast', concept: 'Blast', favorite: true,
    defaults: { runPass: 'Run', playType: 'Run Inside', playDir: 'Right', formation: 'Ace', strength: 'Balanced' } });
});

test('malformed stored entries without ids normalize without recursion', () => {
  storage.setItem('ffa_playbook_imported', JSON.stringify({ calls: [{ name: 'Counter', defaults: { playType: 'Run Inside' } }] }));
  team = 'imported';
  assert.equal(library.list()[0].id, 'call_counter');
  team = 'mavericks';
});

test('partial edits preserve defaults the coach did not change', () => {
  const changed = library.update('call_26_blast', { defaults: { formation: 'Power-I' } });
  assert.equal(changed.defaults.formation, 'Power-I');
  assert.equal(changed.defaults.playType, 'Run Inside');
  assert.equal(changed.defaults.playDir, 'Right');
});
test('renaming a definition preserves its durable id', () => {
  const changed = library.update('call_26_blast', { name: '26 Blast Right' });
  assert.equal(changed.id, 'call_26_blast');
  assert.equal(changed.name, '26 Blast Right');
});

test('call definitions are isolated by active team', () => {
  team = 'wildcats';
  assert.deepEqual(library.list(), []);
  library.add({ name: 'Power Read', concept: 'Power' });
  assert.equal(library.list()[0].id, 'call_power_read');
  team = 'mavericks';
  assert.deepEqual(library.list().map(call => call.id), ['call_26_blast']);
});

test('returned snapshots cannot mutate the stored playbook', () => {
  const storedFormation = library.get('call_26_blast').defaults.formation;
  const snapshot = library.list();
  snapshot[0].defaults.formation = 'Victory';
  assert.equal(library.get('call_26_blast').defaults.formation, storedFormation);
});

test('old plays normalize blank call fields without reinterpreting notes or tags', () => {
  const store = new SeasonStore({});
  const source = { id: 's1', activeGameId: 'g1', games: [{ id: 'g1', gameInfo: {}, plays: [{ id: 7, tags: { unit: 'offense', formation: 'Ace', custom: [] }, notes: '26 Blast maybe' }] }] };
  const before = JSON.parse(JSON.stringify(source.games[0].plays[0]));
  const play = store._normalize(source).games[0].plays[0];
  assert.equal(play.tags.playCall, '');
  assert.equal(play.tags.playCallId, '');
  assert.equal(play.tags.playConcept, '');
  assert.equal(play.tags.formation, before.tags.formation);
  assert.equal(play.notes, before.notes);
});

test('recoverable imported call values are coerced, not silently deleted', () => {
  const store = new SeasonStore({});
  const play = store._normalize({ activeGameId: 'g1', games: [{ id: 'g1', plays: [{ id: 1, tags: { unit: 'offense', custom: [], playCall: 26, playCallId: 26, playConcept: null } }] }] }).games[0].plays[0];
  assert.deepEqual([play.tags.playCall, play.tags.playCallId, play.tags.playConcept], ['26', '26', '']);
});
test('existing call snapshots survive normalization unchanged', () => {
  const store = new SeasonStore({});
  const play = store._normalize({ activeGameId: 'g1', games: [{ id: 'g1', plays: [{ id: 1, tags: { unit: 'offense', custom: [], playCall: '26 Blast', playCallId: 'call_26_blast', playConcept: 'Blast' } }] }] }).games[0].plays[0];
  assert.deepEqual([play.tags.playCall, play.tags.playCallId, play.tags.playConcept], ['26 Blast', 'call_26_blast', 'Blast']);
});

test('duplicate call names are rejected case-insensitively', () => {
  assert.equal(library.add({ name: '26 blast right' }), null);
  team = 'wildcats';
  assert.equal(library.update('call_power_read', { name: 'Power Read' }).id, 'call_power_read');
  team = 'mavericks';
});

test('a durable season snapshot restores into the named team without changing the active team', () => {
  const restored = library.replace({ version: 1, calls: [{ id: 'call_counter', name: 'Counter', concept: 'Counter', defaults: { playDir: 'Left', notes: 'ignored' } }] }, 'recovered-team');
  assert.deepEqual(restored.calls[0].defaults, { playDir: 'Left' });
  assert.equal(team, 'mavericks');
  team = 'recovered-team';
  assert.equal(library.get('call_counter').concept, 'Counter');
  team = 'mavericks';
});
console.log(`\n== RESULT: ${passed} passed, ${process.exitCode ? 1 : 0} failed ==`);
if (process.exitCode) process.exit(process.exitCode);
