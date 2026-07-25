/* E2 — tag-model read projection + normalize defaults/cleanup + carry + ST strip.
 * Implements the E2-scoped rows of GRIDIRON-IQ-TAG-MODEL.md §10 (tests 1-13,
 * 16-20). Tests 14/15/23/24/25 are E3 (analytics/parity), 21/22 are E4 (library
 * UI); they are intentionally NOT here and are noted at the bottom.
 * Run: node tools/e2e-tag-model.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TagProjection } from '../js/tag-projection.js';
import { SeasonStore } from '../js/season-store.js';
import { PlayTagger } from '../js/play-tagger.js';

let pass = 0, fail = 0;
const test = (label, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${e.message}`); }
};

const tags = (o = {}) => ({
  down: '', distance: '', formation: '', backfield: '', strength: '', personnel: '',
  motion: '', runPass: '', playType: '', result: '', yardage: '', coverage: '',
  defFront: '', blitz: '', unit: 'offense', players: {}, grades: {}, ...o,
});
// A play object whose tags OMIT qbAlignment/coverageFamily entirely (legacy shape).
const legacyPlay = (id, t = {}) => ({ id, timestamp: { start: 0, end: 1 }, tags: tags(t) });

console.log('\n== E2 tag model ==');

/* ---- §5 projection: read-time, no mutation ---- */

test('1 · a newly created play is born with qbAlignment & coverageFamily = ""', () => {
  // Real creation path: createWholeVideoPlay (loading a video into an empty game).
  const pt = Object.create(PlayTagger.prototype);
  pt.plays = []; pt.nextId = 1; pt.currentDrive = 1; pt.defaultUnit = 'offense';
  pt._updatePlaySelect = () => {}; pt._updateTimeline = () => {};
  pt.selectPlay = () => {}; pt._emit = () => {};
  const play = pt.createWholeVideoPlay(5);
  assert.ok(play, 'createWholeVideoPlay returned nothing');
  assert.equal(play.tags.qbAlignment, '');
  assert.equal(play.tags.coverageFamily, '');
});

test('2 · formation "Under Center" reads as qbAlignment; stored object untouched', () => {
  const input = tags({ formation: 'Under Center' });
  const before = JSON.stringify(input);
  const p = TagProjection.project(input);
  assert.equal(p.qbAlignment, 'Under Center');
  assert.equal(p.formation, '');
  assert.equal(JSON.stringify(input), before, 'project() mutated its input');
});

test('3 · "Shotgun + Trips" reads alignment Shotgun, formation Trips', () => {
  const p = TagProjection.project(tags({ formation: 'Shotgun + Trips' }));
  assert.equal(p.qbAlignment, 'Shotgun');
  assert.equal(p.formation, 'Trips');
});

test('4 · projection never overwrites a deliberate qbAlignment / backfield', () => {
  const p = TagProjection.project(tags({ qbAlignment: 'Pistol', formation: 'Shotgun + Trips' }));
  assert.equal(p.qbAlignment, 'Pistol');
});

test('5 · (E1-R3) wrong-field token stripped even when target already set', () => {
  const p = TagProjection.project(tags({ qbAlignment: 'Pistol', formation: 'Shotgun + Trips' }));
  assert.equal(p.formation, 'Trips', 'Shotgun should be stripped, not promoted');
  const c = TagProjection.project(tags({ coverageFamily: 'Zone', coverage: 'Man' }));
  assert.equal(c.coverageFamily, 'Zone');
  assert.equal(c.coverage, '', 'legacy Man must be stripped from coverage');
});

test('6 · coverage "Man" reads as coverageFamily Man, coverage ""', () => {
  const p = TagProjection.project(tags({ coverage: 'Man' }));
  assert.equal(p.coverageFamily, 'Man');
  assert.equal(p.coverage, '');
});

test('7 · "Cover 3" does NOT imply Zone — family stays blank', () => {
  const p = TagProjection.project(tags({ coverage: 'Cover 3' }));
  assert.equal(p.coverage, 'Cover 3');
  assert.equal(p.coverageFamily, '');
});

test('8 · (E1-R8) backfield "Pistol" reads qbAlignment Pistol, backfield ""', () => {
  const p = TagProjection.project(tags({ backfield: 'Pistol' }));
  assert.equal(p.qbAlignment, 'Pistol');
  assert.equal(p.backfield, '');
});

test('8b · (E2-R2) malformed multi-value backfield strips its alignment token', () => {
  const p = TagProjection.project(tags({ backfield: 'Pistol + Diamond' }));
  assert.equal(p.backfield, 'Diamond', 'Pistol must be stripped from a multi-value backfield');
  assert.equal(p.qbAlignment, 'Pistol', 'and it supplies qbAlignment when blank');
});

test('9 · (E1-R8) coverage "Match" strips/projects like Man/Zone', () => {
  const p = TagProjection.project(tags({ coverage: 'Match' }));
  assert.equal(p.coverageFamily, 'Match');
  assert.equal(p.coverage, '');
});

test('10 · (E1-R8) supply precedence: formation token beats backfield-Pistol', () => {
  const p = TagProjection.project(tags({ formation: 'Under Center', backfield: 'Pistol' }));
  assert.equal(p.qbAlignment, 'Under Center', 'formation tier 2 must win over backfield tier 3');
  assert.equal(p.backfield, '', 'Pistol still stripped from backfield');
  assert.equal(p.formation, '');
});

test('11 · (E1-R8) D2 boundary: Empty + explicit backfield keeps backfield, strips Empty', () => {
  const p = TagProjection.project(tags({ formation: 'Empty', backfield: 'Split' }));
  assert.equal(p.backfield, 'Split');
  assert.equal(p.formation, '');
  // and the plain Empty case supplies backfield when blank:
  const q = TagProjection.project(tags({ formation: 'Empty' }));
  assert.equal(q.backfield, 'Empty');
  assert.equal(q.formation, '');
});

test('12 · (E1-R2) projection is defensive: tags lacking the property do not throw', () => {
  const t = tags();
  delete t.qbAlignment; delete t.coverageFamily; // legacy object literal
  assert.ok(!('qbAlignment' in t));
  const p = TagProjection.project(t);
  assert.equal(p.qbAlignment, '');
  assert.equal(p.coverageFamily, '');
});

test('13 · single-value projected dimensions are strings, never " + "-joined', () => {
  const p = TagProjection.project(tags({ formation: 'Under Center + Shotgun + Trips' }));
  // both alignment tokens stripped; qbAlignment is the FIRST, a single value
  assert.equal(p.qbAlignment, 'Under Center');
  assert.ok(!p.qbAlignment.includes(' + '));
  assert.equal(p.formation, 'Trips');
});

/* ---- §7 / §7a ST strip single source + invariant ---- */

test('16 · (E1-R9) ST invariant: any op ending unit:special leaves ST keys blank', () => {
  // liveness: forbidden values are PRESENT first, then stripped by the op.
  const st = legacyPlay(1, {
    unit: 'special', formation: 'Under Center', qbAlignment: 'Shotgun',
    backfield: 'Power', strength: 'Right', coverageFamily: 'Zone', coverage: 'Cover 3',
  });
  // prove they are present before the op
  assert.equal(st.tags.backfield, 'Power');
  const pt = Object.create(PlayTagger.prototype);
  const changed = pt._stripStAlignment(st);
  assert.equal(changed, true, 'strip should report a change (present-then-stripped)');
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(st.tags[k], '', `${k} not stripped`);
  // and _normalize does it retroactively too
  const st2 = legacyPlay(2, { unit: 'special', qbAlignment: 'Pistol', backfield: 'Single' });
  SeasonStore.stripStAlignment(st2);
  assert.equal(st2.tags.qbAlignment, '');
  assert.equal(st2.tags.backfield, '');
});

test('16b · (E1-R9) an offensive source retains its look — strip is unit-conditional', () => {
  const off = legacyPlay(3, { unit: 'offense', formation: 'Trips', qbAlignment: 'Shotgun', backfield: 'Power' });
  const pt = Object.create(PlayTagger.prototype);
  const changed = pt._stripStAlignment(off);
  assert.equal(changed, false, 'offense play must not be stripped');
  assert.equal(off.tags.formation, 'Trips');
  assert.equal(off.tags.backfield, 'Power');
});

test('16c · (E1-R9 mutation) ST_ALIGNMENT_KEYS single source includes the 4 new keys', () => {
  for (const k of ['qbAlignment', 'coverageFamily', 'backfield', 'strength']) {
    assert.ok(SeasonStore.ST_ALIGNMENT_KEYS.includes(k), `ST_ALIGNMENT_KEYS missing ${k}`);
  }
  // play-tagger's strip must consume that same source, not a private copy
  const st = legacyPlay(4, { unit: 'special', strength: 'Left' });
  Object.create(PlayTagger.prototype)._stripStAlignment(st);
  assert.equal(st.tags.strength, '', 'tagger strip drifted from SeasonStore source');
});

test('16d · (E2-R1) Same-as-Last onto an ST result strips forbidden fields', () => {
  // A legacy ST source carrying forbidden alignment. Copying it forward must not
  // reproduce those values on the resulting ST play (E1-R9 invariant, any op).
  const src = legacyPlay(40, {
    unit: 'special', formation: 'Shotgun + Trips', qbAlignment: 'Shotgun',
    backfield: 'Power', strength: 'Right', coverage: 'Cover 3', coverageFamily: 'Zone',
  });
  const cur = legacyPlay(41, { unit: 'offense' });
  assert.equal(src.tags.backfield, 'Power', 'liveness: source carries forbidden values');
  const pt = Object.create(PlayTagger.prototype);
  pt.plays = [src, cur];
  pt.getCurrentPlay = () => cur;
  pt._loadTagForm = () => {}; pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.copyFromPrevious();
  assert.equal(cur.tags.unit, 'special', 'copy carried the special unit');
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(cur.tags[k], '', `${k} leaked via Same-as-Last`);
});

test('16e · (E2-R1) template application onto an ST result strips forbidden fields', () => {
  const cur = legacyPlay(42, { unit: 'offense' });
  const pt = Object.create(PlayTagger.prototype);
  pt.getCurrentPlay = () => cur;
  pt._templateStore = () => ({ leaky: {
    unit: 'special', formation: 'Shotgun + Trips', qbAlignment: 'Shotgun',
    backfield: 'Power', strength: 'Right', coverage: 'Cover 3', coverageFamily: 'Zone',
  } });
  pt._loadTagForm = () => {}; pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.applyTemplate('leaky');
  assert.equal(cur.tags.unit, 'special');
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(cur.tags[k], '', `${k} leaked via template`);
});

test('16f · (E2-R1) an OFFENSE Same-as-Last keeps its look (strip is unit-conditional)', () => {
  const src = legacyPlay(43, { unit: 'offense', formation: 'Trips', qbAlignment: 'Shotgun', backfield: 'Power' });
  const cur = legacyPlay(44, { unit: 'special' });
  const pt = Object.create(PlayTagger.prototype);
  pt.plays = [src, cur];
  pt.getCurrentPlay = () => cur;
  pt._loadTagForm = () => {}; pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.copyFromPrevious();
  assert.equal(cur.tags.unit, 'offense', 'copy carried the offense unit');
  assert.equal(cur.tags.formation, 'Trips', 'offense look must survive');
  assert.equal(cur.tags.backfield, 'Power');
});

/* ---- §7 carry repair ---- */

test('17 · (E1-R6) carry fills the four pre-snap fields on a blank offensive target', () => {
  for (const k of ['qbAlignment', 'backfield', 'strength']) {
    assert.ok(PlayTagger.CARRY_SCHEME_KEYS.includes(k), `CARRY_SCHEME_KEYS missing ${k}`);
    assert.ok(PlayTagger.SCHEME_KEYS.includes(k), `SCHEME_KEYS missing ${k}`);
  }
  assert.ok(PlayTagger.CARRY_SCHEME_KEYS.includes('coverageFamily'));
  const prev = legacyPlay(10, { unit: 'offense', qbAlignment: 'Shotgun', backfield: 'Power', strength: 'Right', formation: 'Trips' });
  const next = legacyPlay(11, { unit: 'offense' });
  const pt = Object.create(PlayTagger.prototype);
  pt._loadTagForm = () => {}; pt._emit = () => {};
  pt.applyCarryScheme(prev, next);
  assert.equal(next.tags.qbAlignment, 'Shotgun');
  assert.equal(next.tags.backfield, 'Power');
  assert.equal(next.tags.strength, 'Right');
});

test('17b · (E1-R6) carry does NOT leak onto a special-teams target', () => {
  const prev = legacyPlay(12, { unit: 'offense', qbAlignment: 'Shotgun', backfield: 'Power' });
  const next = legacyPlay(13, { unit: 'special' });
  const pt = Object.create(PlayTagger.prototype);
  pt._loadTagForm = () => {}; pt._emit = () => {};
  pt.applyCarryScheme(prev, next);
  assert.equal(next.tags.qbAlignment || '', '');
  assert.equal(next.tags.backfield || '', '');
});

test('17c · _normalize preserves legacy custom tags through save/reopen', async () => {
  const saved = [];
  const backend = {
    saveSeason: data => { saved.push(JSON.parse(JSON.stringify(data))); return true; },
    diskStatus: () => ({ bound: false }),
  };
  const store = new SeasonStore(backend);
  const noCustom = { id: 1, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense' } };
  const stringCustom = { id: 2, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense', custom: 'Blitz Alert' } };
  const objectCustom = { id: 3, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense', custom: { label: 'Goal line', color: 'red' } } };
  const realCustom = { id: 4, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense', custom: ['Keep Me'] } };
  store.data = store._normalize({ id: 's1', activeGameId: 'g1', games: [{ id: 'g1', plays: [noCustom, stringCustom, objectCustom, realCustom] }] });

  assert.deepEqual(noCustom.tags.custom, [], 'missing custom becomes an empty array');
  assert.deepEqual(stringCustom.tags.custom, ['Blitz Alert'], 'a scalar legacy tag is preserved');
  assert.deepEqual(objectCustom.tags.custom, ['{"label":"Goal line","color":"red"}'], 'an object-shaped import is preserved as JSON text');
  assert.deepEqual(realCustom.tags.custom, ['Keep Me'], 'an existing custom array is preserved verbatim');

  assert.equal(await store.persist(), true, 'normalized season persists');
  const reopened = new SeasonStore(backend);
  reopened.data = reopened._normalize(JSON.parse(JSON.stringify(saved[0])));
  assert.deepEqual(reopened.data.games[0].plays.map(play => play.tags.custom), [
    [], ['Blitz Alert'], ['{"label":"Goal line","color":"red"}'], ['Keep Me'],
  ], 'custom tags survive the canonical save/reopen boundary');
});
/* ---- §7b bounded, coach-approved ST cleanup ---- */

test('18 · (E1-R7b) _normalize clears backfield/strength on ST plays only, nothing else', () => {
  const stWithBoth = legacyPlay(20, { unit: 'special', backfield: 'Power', strength: 'Right' });
  const stWithBf = legacyPlay(21, { unit: 'special', backfield: 'Single' });
  const offKeep = legacyPlay(22, { unit: 'offense', backfield: 'Power', strength: 'Left' });
  const defKeep = legacyPlay(23, { unit: 'defense', backfield: 'I', strength: 'Right' });
  [stWithBoth, stWithBf, offKeep, defKeep].forEach(p => SeasonStore.stripStAlignment(p));
  assert.equal(stWithBoth.tags.backfield, ''); assert.equal(stWithBoth.tags.strength, '');
  assert.equal(stWithBf.tags.backfield, '');
  assert.equal(offKeep.tags.backfield, 'Power'); assert.equal(offKeep.tags.strength, 'Left');
  assert.equal(defKeep.tags.backfield, 'I'); assert.equal(defKeep.tags.strength, 'Right');
});

test('18b · (E1-R7b) real fixture impact is EXACTLY 12 backfield / 1 strength / 0 other', () => {
  const REAL = 'C:/Users/charl/Downloads/GridIronIQ-mavericks-2025-RECOVERED.json';
  if (!fs.existsSync(REAL)) { console.log('        (real fixture absent — skipped)'); return; }
  const data = JSON.parse(fs.readFileSync(REAL, 'utf-8'));
  const plays = (data.games || []).flatMap(g => g.plays || []);
  // "0 other" must be MEASURED, not asserted by omission — the coach authorized
  // clearing backfield/strength only, and this test must FAIL if the strip list is
  // ever broadened to delete anything else the real special plays actually carry.
  const OTHER = SeasonStore.ST_ALIGNMENT_KEYS.filter(k => k !== 'backfield' && k !== 'strength');
  let bfCleared = 0, strCleared = 0, otherCleared = 0;
  const otherKeys = new Set();
  plays.forEach(p => {
    if ((p.tags?.unit) !== 'special') return;
    const before = { ...p.tags };
    SeasonStore.stripStAlignment(p);
    if (before.backfield && !p.tags.backfield) bfCleared++;
    if (before.strength && !p.tags.strength) strCleared++;
    OTHER.forEach(k => { if (before[k] && !p.tags[k]) { otherCleared++; otherKeys.add(k); } });
  });
  assert.equal(bfCleared, 12, `expected 12 backfield cleared, got ${bfCleared}`);
  assert.equal(strCleared, 1, `expected 1 strength cleared, got ${strCleared}`);
  assert.equal(otherCleared, 0, `authorized boundary broadened: ${otherCleared} other clears (${[...otherKeys].join(', ')})`);
});

test('18c · (E2-R3) persist() strips ST alignment before saving — structural choke', () => {
  // The E1-R9 invariant must hold at the WRITE boundary, not just on load — so a
  // leak from ANY writer (grid inline edit, AI stamp, suggestion engine) can never
  // reach disk, present or future. persist() is the single choke all saves flow
  // through.
  const saved = [];
  const backend = {
    saveSeason: (d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    diskStatus: () => ({ bound: false }),
  };
  const store = new SeasonStore(backend);
  store.currentSeasonId = 's1';
  store.data = { version: 5, type: 'season', activeGameId: 'g1', games: [{ id: 'g1', plays: [
    // a special play a grid/AI/suggestion edit has leaked onto (liveness: values present)
    { id: 1, tags: { unit: 'special', formation: 'Shotgun + Trips', coverage: 'Cover 3',
      backfield: 'Power', strength: 'Right', qbAlignment: 'Shotgun', coverageFamily: 'Zone',
      players: {}, grades: {} } },
    // an offense play whose look must survive the strip
    { id: 2, tags: { unit: 'offense', formation: 'Trips', backfield: 'Power', players: {}, grades: {} } },
  ] }] };
  assert.equal(store.data.games[0].plays[0].tags.formation, 'Shotgun + Trips', 'liveness: leak present pre-persist');
  store.persist();
  assert.equal(saved.length, 1, 'saveSeason was not called');
  const st = saved[0].games[0].plays.find(p => p.id === 1);
  const off = saved[0].games[0].plays.find(p => p.id === 2);
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(st.tags[k] || '', '', `${k} reached disk on a special play`);
  assert.equal(off.tags.formation, 'Trips', 'offense look must survive the persist strip');
  assert.equal(off.tags.backfield, 'Power');
});

test('18d · (E2-R3b) _emit sanitizes a special play before listeners see it (LIVE barrier)', () => {
  // Every writer (grid, AI stamp, suggestion, form, …) mutates a play then emits
  // play-updated/created. Stripping at that seam keeps the LIVE object — which UI
  // and analytics read directly — clean, not just the persisted copy.
  const pt = Object.create(PlayTagger.prototype);
  pt.listeners = {};
  let seen = null;
  pt.on('play-updated', p => { seen = { ...p.tags }; });
  const play = legacyPlay(50, { unit: 'special', formation: 'Shotgun + Trips', backfield: 'Power', coverage: 'Cover 3', strength: 'Right' });
  assert.equal(play.tags.formation, 'Shotgun + Trips', 'liveness: leak present pre-emit');
  pt._emit('play-updated', play);
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(play.tags[k] || '', '', `${k} not stripped on live object`);
  assert.equal(seen.formation || '', '', 'listener saw a dirty play');
  assert.equal(seen.backfield || '', '');
});

test('18d-2 · (E2-R3b) _emit leaves an OFFENSE play untouched', () => {
  const pt = Object.create(PlayTagger.prototype);
  pt.listeners = {};
  const play = legacyPlay(51, { unit: 'offense', formation: 'Trips', backfield: 'Power' });
  pt._emit('play-updated', play);
  assert.equal(play.tags.formation, 'Trips');
  assert.equal(play.tags.backfield, 'Power');
});

test('18e · (E2-R3b) every durable-write path sanitizes this.data (json/snapshot/saveNow/bindDisk)', () => {
  // persist() is not the only serialization path — the fix claimed it was. Backups,
  // downloads, and disk binding must sanitize too, or forbidden ST values reach a
  // restore point or an exported file.
  const backend = {
    saveSeason: () => true, diskStatus: () => ({ bound: false }),
    createBackup: () => ({ id: 'b' }), listBackups: () => [],
    bindDisk: async () => false, writeDisk: async () => true,
  };
  const store = new SeasonStore(backend);
  store.currentSeasonId = 's1';
  const leak = () => ({ version: 5, type: 'season', activeGameId: 'g1', games: [{ id: 'g1', plays: [
    { id: 1, tags: { unit: 'special', formation: 'Shotgun + Trips', backfield: 'Power', players: {}, grades: {} } },
  ] }] });
  // json() — synchronous, returns sanitized text (the Save Season download path)
  store.data = leak();
  assert.equal(JSON.parse(store.json()).games[0].plays[0].tags.formation || '', '', 'json() leaked formation');
  // snapshot / saveNow / bindDisk sanitize this.data synchronously before any await
  for (const method of ['snapshot', 'saveNow', 'bindDisk']) {
    store.data = leak();
    store[method]('x');   // fire; the sanitize is the synchronous first line
    const st = store.data.games[0].plays[0].tags;
    assert.equal(st.formation || '', '', `${method}() did not sanitize this.data`);
    assert.equal(st.backfield || '', '', `${method}() left backfield`);
  }
});

/* ---- §4 existing migration guard must not break ---- */

test('19 · Power-I on a modern play (has backfield) is never migrated', () => {
  const p = legacyPlay(30, { unit: 'offense', formation: 'Power-I', backfield: '' });
  SeasonStore.migratePlayFormation(p);
  assert.equal(p.tags.formation, 'Power-I', 'modern Power-I must survive');
  assert.equal(p.tags.backfield, '');
});

test('20 · a truly legacy play (no backfield property) still migrates as before', () => {
  const p = { id: 31, timestamp: { start: 0, end: 1 }, tags: { unit: 'offense', formation: 'Power-I' } };
  assert.ok(!('backfield' in p.tags));
  SeasonStore.migratePlayFormation(p);
  assert.equal(p.tags.backfield, 'Power', 'legacy Power-I -> backfield Power');
  assert.equal(p.tags.formation, '');
});

/* ---- §20 E3b: lookLabel — the deliberate presentation composition ---- */

test('26 · lookLabel joins alignment + structure for a MODERN split play', () => {
  const t = tags({ unit: 'offense', qbAlignment: 'Shotgun', formation: 'Trips' });
  assert.equal(TagProjection.lookLabel(t), 'Shotgun Trips');
});

test('26b · lookLabel projects a LEGACY mixed formation into the same phrase', () => {
  // "Shotgun + Trips" never appears in the output — it is split then rejoined
  // with a plain space, matching how a coach actually says the call.
  const t = tags({ unit: 'offense', formation: 'Shotgun + Trips' });
  assert.equal(TagProjection.lookLabel(t), 'Shotgun Trips');
  assert.ok(!TagProjection.lookLabel(t).includes('+'), 'the " + " join artifact must not leak into a spoken-call label');
});

test('26b-2 · lookLabel strips the internal "+" from a MULTI-structure formation too', () => {
  // A coach charting TWO structural tags at once ("Flexbone + Trips") leaves
  // projected formation itself " + "-joined — the composed phrase must not
  // just avoid the join between qbAlignment/formation, it must strip every
  // internal "+" in the whole label.
  const t = tags({ unit: 'offense', formation: 'Shotgun + Flexbone + Trips' });
  assert.equal(TagProjection.lookLabel(t), 'Shotgun Flexbone Trips');
  assert.ok(!TagProjection.lookLabel(t).includes('+'));
  // Same check with no alignment charted at all — structure-only multi-value.
  const t2 = tags({ unit: 'offense', formation: 'Flexbone + Trips' });
  assert.equal(TagProjection.lookLabel(t2), 'Flexbone Trips');
});

test('26c · lookLabel omits the missing half instead of inventing a placeholder', () => {
  assert.equal(TagProjection.lookLabel(tags({ formation: 'Trips' })), 'Trips', 'structure only, no alignment');
  assert.equal(TagProjection.lookLabel(tags({ qbAlignment: 'Pistol' })), 'Pistol', 'alignment only, no structure');
  assert.equal(TagProjection.lookLabel(tags({})), '', 'nothing charted -> empty string, never "Unknown"');
});

test('26d · lookLabel never overwrites an explicit qbAlignment with a legacy formation token', () => {
  // Precedence must match project(): explicit qbAlignment wins.
  const t = tags({ unit: 'offense', qbAlignment: 'Under Center', formation: 'Shotgun + Trips' });
  assert.equal(TagProjection.lookLabel(t), 'Under Center Trips');
});

test('26e · lookLabel is a display seam only — it never mutates the input', () => {
  const t = tags({ formation: 'Shotgun + Trips' });
  const before = JSON.stringify(t);
  TagProjection.lookLabel(t);
  assert.equal(JSON.stringify(t), before, 'lookLabel must not write back to the stored tags');
});

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
console.log('   (E3 owns tests 14/15/23/24/25; E4 owns 21/22 — not in this harness)');
if (fail) process.exit(1);
