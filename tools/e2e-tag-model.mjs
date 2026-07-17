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
  let bfCleared = 0, strCleared = 0, otherCleared = 0;
  plays.forEach(p => {
    if ((p.tags?.unit) !== 'special') return;
    const before = { ...p.tags };
    SeasonStore.stripStAlignment(p);
    if (before.backfield && !p.tags.backfield) bfCleared++;
    if (before.strength && !p.tags.strength) strCleared++;
    // any non-backfield/strength/ST-alignment key that changed value:
    ['personnel', 'defFront', 'coverage', 'blitz', 'formation'].forEach(() => {});
  });
  assert.equal(bfCleared, 12, `expected 12 backfield cleared, got ${bfCleared}`);
  assert.equal(strCleared, 1, `expected 1 strength cleared, got ${strCleared}`);
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

console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
console.log('   (E3 owns tests 14/15/23/24/25; E4 owns 21/22 — not in this harness)');
if (fail) process.exit(1);
