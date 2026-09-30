/* E2 — tag-model look read + refusal predicate + normalize defaults/cleanup + carry + ST strip.
 * Implements the E2-scoped rows of GRIDIRON-IQ-TAG-MODEL.md §10 (tests 1-13,
 * 16-20). Tests 14/15/23/24/25 are E3 (analytics/parity), 21/22 are E4 (library
 * UI); they are intentionally NOT here and are noted at the bottom.
 * Run: node tools/e2e-tag-model.mjs */
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TagProjection } from '../js/tag-projection.js';
import { SeasonStore } from '../js/season-store.js';
import { PlayTagger } from '../js/play-tagger.js';
import { SeasonFormat } from '../js/season-format.js';

let pass = 0, fail = 0;
const test = (label, fn) => {
  try { fn(); pass++; console.log(`  PASS  ${label}`); }
  catch (e) { fail++; console.error(`  FAIL  ${label}\n        ${e.message}`); }
};

const tags = (o = {}) => ({
  down: '', distance: '', formationFamily: '', receiverSet: '', backfield: '', strength: '', personnel: '',
  motion: '', runPass: '', playType: '', result: '', yardage: '', coverage: '',
  defFront: '', blitz: '', unit: 'offense', players: {}, grades: {}, ...o,
});
// A play object whose tags OMIT qbAlignment/coverageFamily entirely (legacy shape).
const legacyPlay = (id, t = {}) => ({ id, timestamp: { start: 0, end: 1 }, tags: tags(t) });

console.log('\n== E2 tag model ==');

/* ---- §5 the look read and the old-shape predicate ---- */

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

test('2 · project() reads each look field as stored and never mutates its input', () => {
  const input = tags({ formationFamily: 'Flexbone', receiverSet: '3x1', qbAlignment: 'Under Center', backfield: 'Empty', coverage: 'Cover 3', coverageFamily: 'Zone' });
  const before = JSON.stringify(input);
  const p = TagProjection.project(input);
  assert.equal(p.formationFamily, 'Flexbone');
  assert.equal(p.receiverSet, '3x1');
  assert.equal(p.qbAlignment, 'Under Center');
  assert.equal(p.backfield, 'Empty');
  assert.equal(p.coverage, 'Cover 3');
  assert.equal(p.coverageFamily, 'Zone');
  assert.equal(JSON.stringify(input), before, 'project() mutated its input');
});

test('3 · "Cover 3" does NOT imply Zone — family stays blank', () => {
  const p = TagProjection.project(tags({ coverage: 'Cover 3' }));
  assert.equal(p.coverage, 'Cover 3');
  assert.equal(p.coverageFamily, '');
});

test('4 · project() is defensive: tags lacking the property read as blank strings', () => {
  const t = tags();
  delete t.qbAlignment; delete t.coverageFamily;
  const p = TagProjection.project(t);
  assert.equal(p.qbAlignment, '');
  assert.equal(p.coverageFamily, '');
});

test('5 · isCombined names every old combined shape (the refusal predicate)', () => {
  for (const old of [{ formationFamily: 'Shotgun + Spread' }, { formationFamily: 'Under Center' }, { formationFamily: 'Spread + Empty' },
    { backfield: 'Pistol' }, { backfield: 'Pistol + Diamond' }, { coverage: 'Man' }, { coverage: 'Match' }]) {
    assert.equal(TagProjection.isCombined(tags(old)), true, JSON.stringify(old));
  }
});

test('6 · isCombined passes every current look, a family and a receiver set included', () => {
  for (const cur of [{ formationFamily: 'Flexbone', receiverSet: '3x1', qbAlignment: 'Shotgun' }, { backfield: 'Empty', qbAlignment: 'Pistol' },
    { coverage: 'Cover 3 Match', coverageFamily: 'Man' }, { formationFamily: 'Power-I' }, {}]) {
    assert.equal(TagProjection.isCombined(tags(cur)), false, JSON.stringify(cur));
  }
});

/* ---- §7 / §7a ST strip single source + invariant ---- */

test('16 · (E1-R9) ST invariant: any op ending unit:special leaves ST keys blank', () => {
  // liveness: forbidden values are PRESENT first, then stripped by the op.
  const st = legacyPlay(1, {
    unit: 'special', formationFamily: 'Spread', receiverSet: '3x1', qbAlignment: 'Shotgun',
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
  const off = legacyPlay(3, { unit: 'offense', formationFamily: 'Spread', qbAlignment: 'Shotgun', backfield: 'Power' });
  const pt = Object.create(PlayTagger.prototype);
  const changed = pt._stripStAlignment(off);
  assert.equal(changed, false, 'offense play must not be stripped');
  assert.equal(off.tags.formationFamily, 'Spread');
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
    unit: 'special', formationFamily: 'Spread', qbAlignment: 'Shotgun',
    backfield: 'Power', strength: 'Right', coverage: 'Cover 3', coverageFamily: 'Zone',
  });
  const cur = legacyPlay(41, { unit: 'offense' });
  assert.equal(src.tags.backfield, 'Power', 'liveness: source carries forbidden values');
  const pt = Object.create(PlayTagger.prototype);
  pt.plays = [src, cur];
  pt.getCurrentPlay = () => cur;
  pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.copyFromPrevious();
  assert.equal(cur.tags.unit, 'special', 'copy carried the special unit');
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(cur.tags[k], '', `${k} leaked via Same-as-Last`);
});

test('16e · (E2-R1) template application onto an ST result strips forbidden fields', () => {
  const cur = legacyPlay(42, { unit: 'offense' });
  const pt = Object.create(PlayTagger.prototype);
  pt.getCurrentPlay = () => cur;
  pt._templateStore = () => ({ leaky: {
    unit: 'special', formationFamily: 'Spread', qbAlignment: 'Shotgun',
    backfield: 'Power', strength: 'Right', coverage: 'Cover 3', coverageFamily: 'Zone',
  } });
  pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.applyTemplate('leaky');
  assert.equal(cur.tags.unit, 'special');
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(cur.tags[k], '', `${k} leaked via template`);
});

test('16f · (E2-R1) an OFFENSE Same-as-Last keeps its look (strip is unit-conditional)', () => {
  const src = legacyPlay(43, { unit: 'offense', formationFamily: 'Spread', qbAlignment: 'Shotgun', backfield: 'Power' });
  const cur = legacyPlay(44, { unit: 'special' });
  const pt = Object.create(PlayTagger.prototype);
  pt.plays = [src, cur];
  pt.getCurrentPlay = () => cur;
  pt._updateTimeline = () => {}; pt._emit = () => {};
  pt.copyFromPrevious();
  assert.equal(cur.tags.unit, 'offense', 'copy carried the offense unit');
  assert.equal(cur.tags.formationFamily, 'Spread', 'offense look must survive');
  assert.equal(cur.tags.backfield, 'Power');
});

/* ---- §7 carry repair ---- */

test('17 · (E1-R6) carry fills the four pre-snap fields on a blank offensive target', () => {
  for (const k of ['qbAlignment', 'backfield', 'strength']) {
    assert.ok(PlayTagger.CARRY_SCHEME_KEYS.includes(k), `CARRY_SCHEME_KEYS missing ${k}`);
    assert.ok(PlayTagger.SCHEME_KEYS.includes(k), `SCHEME_KEYS missing ${k}`);
  }
  assert.ok(PlayTagger.CARRY_SCHEME_KEYS.includes('coverageFamily'));
  const prev = legacyPlay(10, { unit: 'offense', qbAlignment: 'Shotgun', backfield: 'Power', strength: 'Right', formationFamily: 'Spread' });
  const next = legacyPlay(11, { unit: 'offense' });
  const pt = Object.create(PlayTagger.prototype);
  pt._emit = () => {};
  pt.applyCarryScheme(prev, next);
  assert.equal(next.tags.qbAlignment, 'Shotgun');
  assert.equal(next.tags.backfield, 'Power');
  assert.equal(next.tags.strength, 'Right');
});

test('17b · (E1-R6) carry does NOT leak onto a special-teams target', () => {
  const prev = legacyPlay(12, { unit: 'offense', qbAlignment: 'Shotgun', backfield: 'Power' });
  const next = legacyPlay(13, { unit: 'special' });
  const pt = Object.create(PlayTagger.prototype);
  pt._emit = () => {};
  pt.applyCarryScheme(prev, next);
  assert.equal(next.tags.qbAlignment || '', '');
  assert.equal(next.tags.backfield || '', '');
});

test('17c · custom tags are a list: missing becomes [], any other shape is refused as old format', () => {
  const store = new SeasonStore({ saveSeason: () => true, diskStatus: () => ({ bound: false }) });
  const noCustom = { id: 1, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense' } };
  const realCustom = { id: 4, timestamp: { start: 0, end: 2 }, tags: { unit: 'offense', custom: ['Keep Me'] } };
  store._normalize({ id: 's1', activeGameId: 'g1', games: [{ id: 'g1', plays: [noCustom, realCustom] }] });
  assert.deepEqual(noCustom.tags.custom, [], 'missing custom becomes an empty array');
  assert.deepEqual(realCustom.tags.custom, ['Keep Me'], 'an existing custom array is preserved verbatim');
  for (const custom of ['Blitz Alert', { label: 'Goal line' }, 7]) {
    const problems = SeasonFormat.playProblems({ id: 9, tags: { unit: 'offense', custom } });
    assert.ok(problems.includes('custom tags not a list'), `custom ${JSON.stringify(custom)} is refused: ${problems}`);
  }
  assert.equal(SeasonFormat.playProblems({ id: 9, tags: { unit: 'offense' } }).length, 0, 'a missing custom key is not a problem');
});/* ---- §7b bounded, coach-approved ST cleanup ---- */

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
    saveSeason: (_seasonId, d) => { saved.push(JSON.parse(JSON.stringify(d))); return true; },
    diskStatus: () => ({ bound: false }),
  };
  const store = new SeasonStore(backend);
  store.currentSeasonId = 's1';
  store.data = { version: 5, type: 'season', activeGameId: 'g1', games: [{ id: 'g1', plays: [
    // a special play a grid/AI/suggestion edit has leaked onto (liveness: values present)
    { id: 1, tags: { unit: 'special', formationFamily: 'Spread', coverage: 'Cover 3',
      backfield: 'Power', strength: 'Right', qbAlignment: 'Shotgun', coverageFamily: 'Zone',
      players: {}, grades: {} } },
    // an offense play whose look must survive the strip
    { id: 2, tags: { unit: 'offense', formationFamily: 'Spread', backfield: 'Power', players: {}, grades: {} } },
  ] }] };
  assert.equal(store.data.games[0].plays[0].tags.formationFamily, 'Spread', 'liveness: leak present pre-persist');
  store.persist();
  assert.equal(saved.length, 1, 'saveSeason was not called');
  const st = saved[0].games[0].plays.find(p => p.id === 1);
  const off = saved[0].games[0].plays.find(p => p.id === 2);
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(st.tags[k] || '', '', `${k} reached disk on a special play`);
  assert.equal(off.tags.formationFamily, 'Spread', 'offense look must survive the persist strip');
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
  const play = legacyPlay(50, { unit: 'special', formationFamily: 'Spread', backfield: 'Power', coverage: 'Cover 3', strength: 'Right' });
  assert.equal(play.tags.formationFamily, 'Spread', 'liveness: leak present pre-emit');
  pt._emit('play-updated', play);
  for (const k of SeasonStore.ST_ALIGNMENT_KEYS) assert.equal(play.tags[k] || '', '', `${k} not stripped on live object`);
  assert.equal(seen.formationFamily || '', '', 'listener saw a dirty play');
  assert.equal(seen.backfield || '', '');
});

test('18d-2 · (E2-R3b) _emit leaves an OFFENSE play untouched', () => {
  const pt = Object.create(PlayTagger.prototype);
  pt.listeners = {};
  const play = legacyPlay(51, { unit: 'offense', formationFamily: 'Spread', backfield: 'Power' });
  pt._emit('play-updated', play);
  assert.equal(play.tags.formationFamily, 'Spread');
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
    { id: 1, tags: { unit: 'special', formationFamily: 'Spread', backfield: 'Power', players: {}, grades: {} } },
  ] }] });
  // json() — synchronous, returns sanitized text (the Save Season download path)
  store.data = leak();
  assert.equal(JSON.parse(store.json()).games[0].plays[0].tags.formationFamily || '', '', 'json() leaked formation');
  // snapshot / saveNow / bindDisk sanitize this.data synchronously before any await
  for (const method of ['snapshot', 'saveNow', 'bindDisk']) {
    store.data = leak();
    store[method]('x');   // fire; the sanitize is the synchronous first line
    const st = store.data.games[0].plays[0].tags;
    assert.equal(st.formationFamily || '', '', `${method}() did not sanitize this.data`);
    assert.equal(st.backfield || '', '', `${method}() left backfield`);
  }
});

/* ---- §4 the formation is read as charted (the v1.9.15 backfield migration is deleted) ---- */

test('19 · a formation is never rewritten into Backfield, with or without a backfield key', () => {
  for (const tags of [{ unit: 'offense', formationFamily: 'Power-I', backfield: '' }, { unit: 'offense', formationFamily: 'Power-I', receiverSet: '3x1' }]) {
    const p = { id: 30, timestamp: { start: 0, end: 1 }, tags: { ...tags } };
    SeasonStore.coerceLookFields(p);
    assert.equal(p.tags.formationFamily, tags.formationFamily, 'formation kept as charted');
    assert.equal(p.tags.receiverSet ?? '', tags.receiverSet ?? '', 'receiver set kept as charted');
    assert.equal(p.tags.backfield, '', 'a missing backfield is a blank string, never inferred');
    assert.equal(p.tags.strength, '');
  }
  assert.equal(typeof SeasonStore.migratePlayFormation, 'undefined', 'the migration is deleted');
});
/* ---- §20 E3b: lookLabel — the deliberate presentation composition ---- */

test('26 · lookLabel joins alignment, family and receiver set for a current play', () => {
  const t = tags({ unit: 'offense', qbAlignment: 'Shotgun', formationFamily: 'Spread', receiverSet: '3x1' });
  assert.equal(TagProjection.lookLabel(t), 'Shotgun Spread 3x1');
});

test('26b · lookLabel composes with plain spaces and no "+"', () => {
  const t = tags({ unit: 'offense', qbAlignment: 'Shotgun', formationFamily: 'Flexbone', receiverSet: '2x2' });
  assert.equal(TagProjection.lookLabel(t), 'Shotgun Flexbone 2x2');
  assert.ok(!TagProjection.lookLabel(t).includes('+'));
  assert.equal(TagProjection.lookLabel(tags({ unit: 'offense', formationFamily: 'Flexbone', receiverSet: '2x2' })), 'Flexbone 2x2');
});

test('26c · lookLabel omits the missing half instead of inventing a placeholder', () => {
  assert.equal(TagProjection.lookLabel(tags({ formationFamily: 'Spread' })), 'Spread', 'family only, no alignment');
  assert.equal(TagProjection.lookLabel(tags({ receiverSet: '3x1' })), '3x1', 'receiver set only');
  assert.equal(TagProjection.lookLabel(tags({ qbAlignment: 'Pistol' })), 'Pistol', 'alignment only, no structure');
  assert.equal(TagProjection.lookLabel(tags({})), '', 'nothing charted -> empty string, never "Unknown"');
});

test('26e · lookLabel is a display seam only — it never mutates the input', () => {
  const t = tags({ formationFamily: 'Spread', qbAlignment: 'Shotgun' });
  const before = JSON.stringify(t);
  TagProjection.lookLabel(t);
  assert.equal(JSON.stringify(t), before, 'lookLabel must not write back to the stored tags');
});

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
console.log('   (E3 owns tests 14/15/23/24/25; E4 owns 21/22 — not in this harness)');
if (fail) process.exit(1);
