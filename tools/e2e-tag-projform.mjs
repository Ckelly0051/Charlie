/* E4 (D-projform) — GRIDIRON-IQ-TAG-MODEL.md §18. The tag FORM (not Film
   Room's grid, covered separately by e2e-film-room.mjs's E3b-P1 proofs) shows
   the PROJECTED view and writes only on the coach's explicit save. Proves the
   five coach-approved safeguards + the "must prove" list from §20:
     1. Opening/selecting a play NEVER writes.
     2. Programmatic form load MUST NOT mark the play dirty.
     3. An explicit save writes ONLY the affected field — field-level merge,
        never a whole-tags replace.
     4. Editing one field never rewrites a sibling that already has an
        explicit value (existing explicit sibling wins).
     5. Clearing a value is intentional (a coach re-tapping an active chip
        gets a real clear, not a silent revert).
     6. Formation, QB Alignment, Coverage Call, and Coverage Family round-trip
        INDEPENDENTLY.
     7. The tag form's write lands in the SAME shape Film Room / the registry
        already independently prove correct — no new divergent write path.

   IMPORTANT test-harness discipline (found the hard way while writing this):
   NEVER hold a play OBJECT reference across a page.evaluate() boundary.
   Something in the app (autosave/commit cycle) can rebuild tagger.plays with
   fresh objects between evaluate calls, orphaning any JS-side captured
   reference from an earlier call while t.plays holds a new object with the
   same id. Every section below re-fetches its play via t.getPlay(id) FRESH,
   inside the SAME evaluate call it acts on it.

   Run after build: bash build.sh && node tools/e2e-tag-projform.mjs */
import puppeteer from 'puppeteer';

const URL = new globalThis.URL('../football-film-analyzer.html', import.meta.url).href;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const click = (sel) => page.evaluate(s => { const el = document.querySelector(s); if (el) el.click(); return !!el; }, sel);

console.log('\n== 1. Setup: team + demo season + open game + a synthetic fixture ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
await page.evaluate(() => document.querySelectorAll('.sch-row')[0].click());
await sleep(700);

// Only IDs are kept on window — never object references (see the harness note
// in the file header). Every section re-fetches via t.getPlay(id).
const IDS = { legacyFormation: 9101, legacyCoverage: 9102, modern: 9103, modernDef: 9104, explicitWins: 9105 };
await page.evaluate((ids) => {
  const t = window.app.tagger;
  const mk = (id, tags) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: Object.assign({ unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [] }, tags) });
  t.plays.push(
    // LEGACY mixed formation: alignment token still inside `formation`, nothing
    // explicit stored under qbAlignment. Projected view = formation:'Trips',
    // qbAlignment:'Shotgun' (derived).
    mk(ids.legacyFormation, { formation: 'Shotgun + Trips' }),
    // LEGACY mixed coverage: same shape for the defense pair.
    mk(ids.legacyCoverage, { unit: 'defense', coverage: 'Man' }),
    // MODERN, fully split — nothing to promote; used for the independent
    // round-trip + no-sibling-rewrite proofs.
    mk(ids.modern, { formation: 'Ace', qbAlignment: 'Under Center', backfield: 'I' }),
    mk(ids.modernDef, { unit: 'defense', coverage: 'Cover 2', coverageFamily: 'Zone' }),
    // An EXPLICIT qbAlignment that must survive a Formation edit untouched.
    mk(ids.explicitWins, { formation: 'Bunch', qbAlignment: 'Pistol' }),
  );
}, IDS);

console.log('\n== 2. View/select NEVER writes (requirement #1 + #2) ==');
let r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const before = JSON.stringify(t.getPlay(ids.legacyFormation).tags);
  const stackBefore = hist.stack.length;
  t.selectPlay(ids.legacyFormation);   // real selection path, drives _loadTagForm
  return {
    unchanged: JSON.stringify(t.getPlay(ids.legacyFormation).tags) === before,
    noHistoryEntry: hist.stack.length === stackBefore,
    // The projected view IS visible in the form even though nothing was written.
    formationChip: [...document.querySelectorAll('#tagFormation .pick.active')].map(el => el.dataset.value),
    qbAlignmentChip: [...document.querySelectorAll('#tagQbAlignment .pick.active')].map(el => el.dataset.value),
  };
}, IDS);
ok(r.unchanged, 'selecting a LEGACY play writes NOTHING to its stored tags', JSON.stringify(r));
ok(r.noHistoryEntry, 'selecting a play records NO undo/history entry (view is not an edit)', JSON.stringify(r));
ok(JSON.stringify(r.formationChip) === JSON.stringify(['Trips']), 'Formation seeds from the PROJECTED structural value — "Shotgun" is not offered and not active', JSON.stringify(r.formationChip));
ok(JSON.stringify(r.qbAlignmentChip) === JSON.stringify(['Shotgun']), 'QB Alignment seeds from the DERIVED projected value even though nothing is literally stored under that key yet', JSON.stringify(r.qbAlignmentChip));

console.log('\n== 3. Formation/Coverage chip lists no longer offer the moved values ==');
r = await page.evaluate(() => ({
  formationValues: [...document.querySelectorAll('#tagFormation .pick')].map(el => el.dataset.value),
  qbAlignmentValues: [...document.querySelectorAll('#tagQbAlignment .pick')].map(el => el.dataset.value),
  coverageValues: [...document.querySelectorAll('#tagCoverage .pick')].map(el => el.dataset.value),
  coverageFamilyValues: [...document.querySelectorAll('#tagCoverageFamily .pick')].map(el => el.dataset.value),
}));
ok(!r.formationValues.some(v => ['Under Center', 'Shotgun', 'Pistol'].includes(v)), 'Formation offers NO QB-alignment values', JSON.stringify(r.formationValues));
ok(JSON.stringify(r.qbAlignmentValues) === JSON.stringify(['Under Center', 'Pistol', 'Shotgun']), 'QB Alignment offers exactly the three alignment values');
ok(!r.coverageValues.some(v => ['Man', 'Zone', 'Match'].includes(v)), 'Coverage (the call) offers NO family values', JSON.stringify(r.coverageValues));
ok(JSON.stringify(r.coverageFamilyValues) === JSON.stringify(['Man', 'Zone', 'Match']), 'Coverage Family offers exactly the three family values');

console.log('\n== 4. Explicit commit PROMOTES the sibling, ONE undoable transaction — Formation (multi-select) ==');
r = await page.evaluate(async (ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.legacyFormation);
  hist.reset();
  const depth0 = hist.stack.length;
  // Formation is MULTI-select. Turning the ONLY active chip ('Trips', seeded
  // from the projected view) off is a genuine, single explicit commit.
  document.querySelector('#tagFormation .pick[data-value="Trips"]').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = t.getPlay(ids.legacyFormation);
  const afterCommit = { formation: play.tags.formation, qbAlignment: play.tags.qbAlignment, entries: hist.stack.length - depth0 };
  hist.undo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p1 = t.getPlay(ids.legacyFormation);
  const afterUndo = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };
  hist.redo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p2 = t.getPlay(ids.legacyFormation);
  const afterRedo = { formation: p2.tags.formation, qbAlignment: p2.tags.qbAlignment };
  return { afterCommit, afterUndo, afterRedo };
}, IDS);
ok(r.afterCommit.formation === '' && r.afterCommit.qbAlignment === 'Shotgun', 'turning off the only structural chip clears Formation AND promotes the derived QB Alignment', JSON.stringify(r.afterCommit));
ok(r.afterCommit.entries === 1, 'the promote + write commit is EXACTLY one history entry', JSON.stringify(r.afterCommit));
ok(r.afterUndo.formation === 'Shotgun + Trips' && (r.afterUndo.qbAlignment || '') === '', 'UNDO restores the raw legacy primary AND removes the promoted sibling TOGETHER', JSON.stringify(r.afterUndo));
ok(r.afterRedo.formation === '' && r.afterRedo.qbAlignment === 'Shotgun', 'REDO restores the primary AND the promoted sibling TOGETHER', JSON.stringify(r.afterRedo));

console.log('\n== 5. The SAME promotion for the Coverage/Coverage Family pair (single-select) ==');
r = await page.evaluate(async (ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.legacyCoverage);
  hist.reset();
  document.querySelector('#tagCoverage .pick[data-value="Cover 3"]').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = t.getPlay(ids.legacyCoverage);
  return { coverage: play.tags.coverage, coverageFamily: play.tags.coverageFamily, entries: hist.stack.length };
}, IDS);
ok(r.coverage === 'Cover 3' && r.coverageFamily === 'Man' && r.entries === 1, 'explicit Coverage commit promotes the derived Coverage Family in the SAME single transaction', JSON.stringify(r));

console.log('\n== 6. An EXISTING explicit sibling is NEVER overwritten (requirement #4) ==');
r = await page.evaluate(async (ids) => {
  const t = window.app.tagger;
  t.selectPlay(ids.explicitWins);
  const before = JSON.parse(JSON.stringify(t.getPlay(ids.explicitWins).tags));
  document.querySelector('#tagFormation .pick[data-value="Trips"]').click();   // ADDS to the existing 'Bunch' (multi-select)
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = t.getPlay(ids.explicitWins);
  const untouchedKeys = Object.keys(before).every(k => k === 'formation' || JSON.stringify(play.tags[k]) === JSON.stringify(before[k]));
  return { formation: play.tags.formation, qbAlignment: play.tags.qbAlignment, untouchedKeys };
}, IDS);
ok(r.formation === 'Bunch + Trips' && r.qbAlignment === 'Pistol', 'adding a structural formation chip on a play with an EXPLICIT qbAlignment leaves that value alone — never overwritten', JSON.stringify(r));
ok(r.untouchedKeys, 'no field OTHER than formation changed — a genuine field-level merge, not a bulk rewrite', JSON.stringify(r));

console.log('\n== 7. Clearing a value is INTENTIONAL, not a silent revert (requirement #5) ==');
r = await page.evaluate(async (ids) => {
  const t = window.app.tagger;
  t.selectPlay(ids.explicitWins);   // qbAlignment currently 'Pistol' from section 6
  document.querySelector('#tagQbAlignment .pick[data-value="Pistol"]').click();   // re-tap active chip = clear
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const play = t.getPlay(ids.explicitWins);
  return { qbAlignment: play.tags.qbAlignment, activeChips: [...document.querySelectorAll('#tagQbAlignment .pick.active')].length };
}, IDS);
ok((r.qbAlignment || '') === '' && r.activeChips === 0, 're-tapping the active QB Alignment chip clears it — the coach\'s explicit clear is honored, not silently re-derived', JSON.stringify(r));

console.log('\n== 8. Formation / QB Alignment / Coverage Call / Coverage Family round-trip INDEPENDENTLY (requirement #6) ==');
r = await page.evaluate(async (ids) => {
  const t = window.app.tagger;
  t.selectPlay(ids.modern);
  document.querySelector('#tagBackfield .pick[data-value="Split"]').click();   // edit an UNRELATED field
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const off = t.getPlay(ids.modern);
  const offAfter = { formation: off.tags.formation, qbAlignment: off.tags.qbAlignment, backfield: off.tags.backfield };
  t.selectPlay(ids.modernDef);
  document.querySelector('#tagBlitz .pick[data-value="Edge"]').click();        // edit an UNRELATED field
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const def = t.getPlay(ids.modernDef);
  const defAfter = { coverage: def.tags.coverage, coverageFamily: def.tags.coverageFamily, blitz: def.tags.blitz };
  return { offAfter, defAfter };
}, IDS);
ok(r.offAfter.formation === 'Ace' && r.offAfter.qbAlignment === 'Under Center' && r.offAfter.backfield === 'Split', 'Formation and QB Alignment are UNCHANGED by an unrelated Backfield edit', JSON.stringify(r.offAfter));
ok(r.defAfter.coverage === 'Cover 2' && r.defAfter.coverageFamily === 'Zone' && r.defAfter.blitz === 'Edge', 'Coverage Call and Coverage Family are UNCHANGED by an unrelated Blitz edit', JSON.stringify(r.defAfter));

console.log('\n== 9. The "New Drive" bulk-save path does NOT drop a legacy sibling it never touched ==');
// Distinct from _saveField's per-chip path — _saveCurrentTags() re-writes every
// field from its CURRENTLY DISPLAYED (projected) value. Without its own promote
// guard, a coach who just clicks "New Drive" on an untouched legacy play would
// silently lose the alignment token this section proves survives.
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const id = 9106;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Shotgun + Twins' } };
  t.plays.push(play);
  t.selectPlay(id);
  document.getElementById('btnNewDrive').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const after = t.getPlay(id);
  return { formation: after.tags.formation, qbAlignment: after.tags.qbAlignment };
});
ok(r.formation === 'Twins' && r.qbAlignment === 'Shotgun', 'clicking "New Drive" promotes the untouched legacy alignment instead of silently dropping it', JSON.stringify(r));

console.log('\n== 10. Cross-surface identical play set — the tag form write agrees with Film Room / the registry ==');
r = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const play = t.getPlay(ids.legacyFormation);   // now formation:'', qbAlignment:'Shotgun' from section 4
  const SE = window.app.stats.constructor;
  const registry = window.app.analyticsRegistry;
  const proj = SE.proj(play);
  const gid = 'e4-projform-fixture';
  play.__gid = gid;
  const refs = registry.matchingRefs([play], 'qbAlignment', 'Shotgun');
  return {
    storedMatchesProjected: play.tags.formation === proj.formation && play.tags.qbAlignment === proj.qbAlignment,
    registryFindsIt: refs.includes(`${gid}::${play.id}`),
  };
}, IDS);
ok(r.storedMatchesProjected, 'the tag form\'s write already IS the projected shape — proj(play) needs to change nothing further', JSON.stringify(r));
ok(r.registryFindsIt, 'the SAME play the tag form just edited is found by an INDEPENDENT AnalyticsRegistry.matchingRefs lookup for qbAlignment=Shotgun', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
