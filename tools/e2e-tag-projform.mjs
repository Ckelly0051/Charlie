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
// Team/season setup lives in the library overlay, opened from the shell Home.
await page.evaluate(() => document.querySelector('[data-ws-action="seasons"]')?.click());
await sleep(400);
await page.type('#teamSetupName', 'Mavericks');
await click('#btnTeamSetupSave');
await sleep(300);
await click('#btnExploreDemo');
await sleep(900);
// Open game 1 from the shell Home film inbox (the sole game-entry route).
await page.evaluate(() => document.querySelector('#wsFilmList [data-ws-game]')?.click());
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

console.log('\n== 7b. Clearing a LEGACY-DERIVED sibling STRIPS the primary too — the clear actually SURVIVES a re-visit (Codex E4-1 review finding #1) ==');
// Section 7 only proved clearing a MODERN explicit value. Before this fix,
// clearing a DERIVED value (nothing explicit stored yet, only projected from
// the primary field's embedded legacy token) had nothing to override:
// project()'s precedence falls back to the still-embedded token whenever the
// sibling is blank, so the clear looked like it worked in the moment, then
// silently reappeared the next time the play was opened.
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const id = 9108;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Shotgun + Wing-T' } };
  t.plays.push(play);
  t.selectPlay(id);   // seeds QB Alignment 'Shotgun' from the DERIVED projected value (nothing stored yet)
  document.querySelector('#tagQbAlignment .pick[data-value="Shotgun"]').click();   // re-tap the derived-active chip = explicit clear
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(id);
  const rawAfterCommit = { formation: afterCommit.tags.formation, qbAlignment: afterCommit.tags.qbAlignment };
  // Re-visit: select the play again fresh, as if the coach came back to it —
  // proves the clear survives on the STORED tags, not just the live chip UI.
  t.selectPlay(id);
  const revisit = t.getPlay(id);
  return {
    rawAfterCommit,
    revisitQbAlignment: revisit.tags.qbAlignment,
    revisitChip: [...document.querySelectorAll('#tagQbAlignment .pick.active')].map(el => el.dataset.value),
  };
});
ok((r.rawAfterCommit.qbAlignment || '') === '' && r.rawAfterCommit.formation === 'Wing-T', 'clearing the DERIVED QB Alignment strips the Shotgun token out of Formation\'s raw stored value in the SAME commit', JSON.stringify(r.rawAfterCommit));
ok((r.revisitQbAlignment || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit — Shotgun does not silently reappear, because the raw legacy token is actually gone, not just hidden this one time', JSON.stringify(r));

console.log('\n== 7c. Coverage Family DERIVED clear strips Coverage too — the DISTINCT single-value branch, with revisit + undo/redo (Codex e0ab568 re-review, item #1) ==');
// 7b only exercised stripSiblingToken's MULTI-value (formation) branch.
// Coverage is single-value: the whole raw field IS the family token when it
// matches, so stripSiblingToken has a genuinely separate code path
// (`primaryKey === 'coverage'` -> return '' instead of filter-and-rejoin).
// This also proves the undo/redo pairing Codex asked for on this branch,
// mirroring section 4's Formation undo/redo but for the reverse (clear) case.
r = await page.evaluate(async () => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9113;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'defense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], coverage: 'Man' } };
  t.plays.push(play);
  t.selectPlay(id);   // seeds Coverage Family 'Man' from the DERIVED value — the whole raw `coverage` IS the family token
  hist.reset();
  const depth0 = hist.stack.length;
  document.querySelector('#tagCoverageFamily .pick[data-value="Man"]').click();   // re-tap the derived-active chip = explicit clear
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(id);
  const commitResult = { coverage: afterCommit.tags.coverage, coverageFamily: afterCommit.tags.coverageFamily, entries: hist.stack.length - depth0 };

  hist.undo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p1 = t.getPlay(id);
  const afterUndo = { coverage: p1.tags.coverage, coverageFamily: p1.tags.coverageFamily };

  hist.redo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p2 = t.getPlay(id);
  const afterRedo = { coverage: p2.tags.coverage, coverageFamily: p2.tags.coverageFamily };

  // Re-visit AFTER the undo/redo cycle — proves the clear survives on the
  // STORED tags, not just the live chip UI from the original commit.
  t.selectPlay(id);
  const revisit = t.getPlay(id);
  return {
    commitResult, afterUndo, afterRedo,
    revisitCoverageFamily: revisit.tags.coverageFamily,
    revisitChip: [...document.querySelectorAll('#tagCoverageFamily .pick.active')].map(el => el.dataset.value),
  };
});
ok(r.commitResult.coverage === '' && r.commitResult.coverageFamily === '', 'clearing the DERIVED Coverage Family strips the Man token out of Coverage\'s raw stored value (the distinct single-value branch) in the SAME commit', JSON.stringify(r.commitResult));
ok(r.commitResult.entries === 1, 'the strip + clear commit is EXACTLY one history entry', JSON.stringify(r.commitResult));
ok(r.afterUndo.coverage === 'Man' && (r.afterUndo.coverageFamily || '') === '', 'UNDO restores the raw legacy Coverage AND removes the cleared Coverage Family TOGETHER', JSON.stringify(r.afterUndo));
ok((r.afterRedo.coverage || '') === '' && (r.afterRedo.coverageFamily || '') === '', 'REDO restores the stripped Coverage AND the cleared Coverage Family TOGETHER', JSON.stringify(r.afterRedo));
ok((r.revisitCoverageFamily || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit after the undo/redo cycle — Man does not silently reappear', JSON.stringify(r));

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

console.log('\n== 9. Save & Next (the explicit-save gesture) canonicalizes an UNTOUCHED legacy play; a clean play stays a true no-op (Codex E4-1 review finding #2) ==');
// D-projform rule 3 names "Save & Next, etc." as the explicit save. Before
// this fix, Save & Next only flushed a focused input and navigated — a play
// the coach merely REVIEWED (selected, never clicked a Formation/QB Alignment/
// Coverage/Coverage Family chip) left with its legacy token still embedded and
// its sibling still un-promoted, so it could never leave the (Lane R) "Legacy
// tags to review" list, whose exit condition is exactly this explicit save.
r = await page.evaluate(async () => {
  const t = window.app.tagger, hist = window.app.history;
  const legacyId = 9109;
  const legacy = { id: legacyId, timestamp: { start: legacyId, end: legacyId + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Under Center + Ace' } };
  t.plays.push(legacy);
  t.selectPlay(legacyId);   // review only — no chip touched
  // At this point legacyId is the LAST play in t.plays (cleanId is pushed
  // below, after this action), so nextPlayWithSituation() finds no next play
  // to advance to — Save & Next's canonicalization is the ONLY thing that can
  // touch history here, isolating the one-entry assertion from advance-related
  // carry-forward writes (auto D&D / carry scheme), which only ever fire
  // inside the `if (advanced)` branch.
  hist.reset();
  const depth0 = hist.stack.length;
  document.getElementById('btnTagSaveNext').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(legacyId);
  const commitResult = { formation: afterCommit.tags.formation, qbAlignment: afterCommit.tags.qbAlignment, entries: hist.stack.length - depth0 };

  hist.undo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p1 = t.getPlay(legacyId);
  const afterUndo = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };

  hist.redo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p2 = t.getPlay(legacyId);
  const afterRedo = { formation: p2.tags.formation, qbAlignment: p2.tags.qbAlignment };
  const legacyResult = commitResult;

  // A CLEAN modern play (nothing to canonicalize) must stay a true no-op — Save
  // & Next must not manufacture a history entry on every ordinary navigation.
  const cleanId = 9110;
  const clean = { id: cleanId, timestamp: { start: cleanId, end: cleanId + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace', qbAlignment: 'Under Center' } };
  t.plays.push(clean);
  t.selectPlay(cleanId);
  hist.reset();
  const depthBefore = hist.stack.length;
  document.getElementById('btnTagSaveNext').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterClean = t.getPlay(cleanId);
  return {
    legacyResult, afterUndo, afterRedo,
    cleanUnchanged: afterClean.tags.formation === 'Ace' && afterClean.tags.qbAlignment === 'Under Center',
    noHistoryEntryForClean: hist.stack.length === depthBefore,
  };
});
ok(r.legacyResult.formation === 'Ace' && r.legacyResult.qbAlignment === 'Under Center', 'Save & Next canonicalizes an untouched legacy play\'s projected look — it can now leave the Legacy Tags to Review list', JSON.stringify(r.legacyResult));
ok(r.legacyResult.entries === 1, 'the canonicalization commit is EXACTLY one history entry, even though it touches BOTH the primary and the sibling', JSON.stringify(r.legacyResult));
ok(r.afterUndo.formation === 'Under Center + Ace' && (r.afterUndo.qbAlignment || '') === '', 'UNDO restores BOTH raw legacy pairs together (Formation back to its embedded string, QB Alignment back to unset)', JSON.stringify(r.afterUndo));
ok(r.afterRedo.formation === 'Ace' && r.afterRedo.qbAlignment === 'Under Center', 'REDO restores BOTH canonical pairs together', JSON.stringify(r.afterRedo));
ok(r.cleanUnchanged, 'a play with nothing to canonicalize is untouched by Save & Next', JSON.stringify(r));
ok(r.noHistoryEntryForClean, 'Save & Next on an already-clean play creates NO history entry — a true no-op, not busywork on every navigation', JSON.stringify(r));

console.log('\n== 9b. Filtered cut-up navigation does NOT trigger the canonicalization (Codex E4-1 review finding #2, full scope) ==');
// Codex scoped the commit to NORMAL chronological advance only — not Skip,
// and not a filtered Study/Film Room cut-up review, where the coach is
// scanning a curated example set that may not even be in play order.
// Simulate an active cut-up (stub next() so this stays a pure canonicalization
// check, no video required) and prove an untouched legacy play is left
// exactly as it was while a cut-up owns navigation.
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const id = 9111;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Under Center + Bunch' } };
  t.plays.push(play);
  t.selectPlay(id);
  const cutup = window.app.cutupPlayer;
  const realNext = cutup.next.bind(cutup);
  cutup.next = () => {};   // stub — no real cut-up queue is needed for this check
  cutup.active = true;
  document.getElementById('btnTagSaveNext').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  cutup.active = false;
  cutup.next = realNext;
  const after = t.getPlay(id);
  return { formation: after.tags.formation, qbAlignment: after.tags.qbAlignment };
});
ok(r.formation === 'Under Center + Bunch' && (r.qbAlignment || '') === '', 'Save & Next during an ACTIVE filtered cut-up leaves the play untouched — canonicalization is scoped to normal chronological advance only', JSON.stringify(r));

console.log('\n== 10. "New Drive" writes ONLY Drive Number — a legacy sibling it never touched is left EXACTLY as it was (Codex E4-1 review finding #3) ==');
// Before this fix, New Drive called the bulk _saveCurrentTags() path, which
// re-wrote EVERY displayed field (including Formation/Coverage's PROJECTED
// display) from a click that only meant to bump the drive counter — a
// field-level-merge violation regardless of the promote guard it also had.
// The fix: New Drive now commits ONLY driveNumber via the same single-field
// _saveField path every other field's own change listener uses.
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const id = 9106;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Shotgun + Twins' } };
  t.plays.push(play);
  t.selectPlay(id);
  const before = JSON.parse(JSON.stringify(t.getPlay(id).tags));
  document.getElementById('btnNewDrive').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const after = t.getPlay(id);
  // Codex e0ab568 re-review item #3: compare the UNION of keys on both sides,
  // not just Object.keys(before) — the original check could only detect a
  // CHANGED existing key, so a regression that silently ADDS a brand-new key
  // (e.g. a stray qbAlignment/coverageFamily write) to `after.tags` that was
  // never present in `before` at all would pass undetected.
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after.tags)]);
  const onlyDriveNumberChanged = [...allKeys].every(k => k === 'driveNumber'
    || JSON.stringify(after.tags[k] ?? null) === JSON.stringify(before[k] ?? null));
  return { formation: after.tags.formation, qbAlignment: after.tags.qbAlignment, driveNumber: after.tags.driveNumber, onlyDriveNumberChanged };
});
ok(r.formation === 'Shotgun + Twins' && (r.qbAlignment || '') === '', '"New Drive" leaves an untouched legacy Formation exactly as stored — it does NOT promote or strip anything', JSON.stringify(r));
ok(!!r.driveNumber, '"New Drive" DOES write the drive number itself', JSON.stringify(r));
ok(r.onlyDriveNumberChanged, 'no field OTHER than driveNumber changed — a genuine single-field commit, not a bulk rewrite', JSON.stringify(r));

console.log('\n== 11. Cross-surface identical play set — the tag form write agrees with Film Room / the registry ==');
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

console.log('\n== 12. E4-2: Empty leaves Formation, Pistol leaves Backfield — the vocabulary actually moved ==');
r = await page.evaluate(() => ({
  formationValues: [...document.querySelectorAll('#tagFormation .pick')].map(el => el.dataset.value),
  backfieldValues: [...document.querySelectorAll('#tagBackfield .pick')].map(el => el.dataset.value),
}));
ok(!r.formationValues.includes('Empty'), 'Formation no longer offers Empty (moved to Backfield)', JSON.stringify(r.formationValues));
ok(r.backfieldValues.includes('Empty'), 'Backfield still offers its own pre-existing Empty chip', JSON.stringify(r.backfieldValues));
ok(!r.backfieldValues.includes('Pistol'), 'Backfield no longer offers Pistol (moved to QB Alignment)', JSON.stringify(r.backfieldValues));

console.log('\n== 13. E4-2: explicit Formation commit PROMOTES Backfield (Empty), ONE undoable transaction ==');
// Mirrors section 4 (Formation -> QB Alignment) for the NEW Formation ->
// Backfield relationship (Empty). A legacy play stores "Ace + Empty" with a
// blank backfield; turning off Formation's only OTHER structural chip must
// promote 'Empty' into Backfield in the SAME commit as the Formation write.
r = await page.evaluate(async () => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9114;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty' } };
  t.plays.push(play);
  t.selectPlay(id);   // Formation seeds 'Ace' (Empty stripped from the projected view); Backfield seeds '' explicitly, but the CHIP shows 'Empty' derived
  hist.reset();
  const depth0 = hist.stack.length;
  document.querySelector('#tagFormation .pick[data-value="Ace"]').click();   // turn off the only active structural chip
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(id);
  const commitResult = { formation: afterCommit.tags.formation, backfield: afterCommit.tags.backfield, entries: hist.stack.length - depth0 };
  hist.undo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p1 = t.getPlay(id);
  const afterUndo = { formation: p1.tags.formation, backfield: p1.tags.backfield };
  hist.redo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p2 = t.getPlay(id);
  const afterRedo = { formation: p2.tags.formation, backfield: p2.tags.backfield };
  return { commitResult, afterUndo, afterRedo };
});
ok(r.commitResult.formation === '' && r.commitResult.backfield === 'Empty', 'turning off the only structural chip clears Formation AND promotes the derived Backfield (Empty)', JSON.stringify(r.commitResult));
ok(r.commitResult.entries === 1, 'the promote + write commit is EXACTLY one history entry', JSON.stringify(r.commitResult));
ok(r.afterUndo.formation === 'Ace + Empty' && (r.afterUndo.backfield || '') === '', 'UNDO restores the raw legacy Formation AND removes the promoted Backfield TOGETHER', JSON.stringify(r.afterUndo));
ok(r.afterRedo.formation === '' && r.afterRedo.backfield === 'Empty', 'REDO restores Formation AND the promoted Backfield TOGETHER', JSON.stringify(r.afterRedo));

console.log('\n== 14. E4-2: explicit Backfield commit PROMOTES QB Alignment (Pistol) AND strips Formation, ONE undoable transaction ==');
// Backfield is BOTH a sibling (of Formation, for Empty) and a primary (for
// QB Alignment, for Pistol) at once. A legacy play stores backfield='Pistol'
// with a blank qbAlignment; explicitly committing a NEW Backfield value must
// promote qbAlignment='Pistol' in the SAME commit.
r = await page.evaluate(async () => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9115;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], backfield: 'Pistol' } };
  t.plays.push(play);
  t.selectPlay(id);   // Backfield chip shows blank (Pistol stripped from the projected view); QB Alignment shows 'Pistol' derived
  hist.reset();
  const depth0 = hist.stack.length;
  document.querySelector('#tagBackfield .pick[data-value="Diamond"]').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(id);
  const commitResult = { backfield: afterCommit.tags.backfield, qbAlignment: afterCommit.tags.qbAlignment, entries: hist.stack.length - depth0 };
  hist.undo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p1 = t.getPlay(id);
  const afterUndo = { backfield: p1.tags.backfield, qbAlignment: p1.tags.qbAlignment };
  hist.redo();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const p2 = t.getPlay(id);
  const afterRedo = { backfield: p2.tags.backfield, qbAlignment: p2.tags.qbAlignment };
  return { commitResult, afterUndo, afterRedo };
});
ok(r.commitResult.backfield === 'Diamond' && r.commitResult.qbAlignment === 'Pistol', 'picking a new Backfield value promotes the derived QB Alignment (Pistol) instead of silently dropping it', JSON.stringify(r.commitResult));
ok(r.commitResult.entries === 1, 'the promote + write commit is EXACTLY one history entry', JSON.stringify(r.commitResult));
ok(r.afterUndo.backfield === 'Pistol' && (r.afterUndo.qbAlignment || '') === '', 'UNDO restores the raw legacy Backfield AND removes the promoted QB Alignment TOGETHER', JSON.stringify(r.afterUndo));
ok(r.afterRedo.backfield === 'Diamond' && r.afterRedo.qbAlignment === 'Pistol', 'REDO restores Backfield AND the promoted QB Alignment TOGETHER', JSON.stringify(r.afterRedo));

console.log('\n== 15. E4-2: clearing a DERIVED Backfield (Empty from Formation) strips Formation too — survives a re-visit ==');
// Mirrors section 7b/7c for the THIRD registered relationship. Backfield
// shows 'Empty' derived from Formation's embedded token; clearing it directly
// must strip 'Empty' out of Formation's raw value, or the clear would not
// stick on the next read.
r = await page.evaluate(async () => {
  const t = window.app.tagger;
  const id = 9116;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Wing-T + Empty' } };
  t.plays.push(play);
  t.selectPlay(id);   // Backfield chip shows 'Empty' derived (nothing stored yet)
  document.querySelector('#tagBackfield .pick[data-value="Empty"]').click();   // re-tap the derived-active chip = explicit clear
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterCommit = t.getPlay(id);
  const rawAfterCommit = { formation: afterCommit.tags.formation, backfield: afterCommit.tags.backfield };
  t.selectPlay(id);   // re-visit
  const revisit = t.getPlay(id);
  return {
    rawAfterCommit,
    revisitBackfield: revisit.tags.backfield,
    revisitChip: [...document.querySelectorAll('#tagBackfield .pick.active')].map(el => el.dataset.value),
  };
});
ok((r.rawAfterCommit.backfield || '') === '' && r.rawAfterCommit.formation === 'Wing-T', 'clearing the DERIVED Backfield strips the Empty token out of Formation\'s raw stored value in the SAME commit', JSON.stringify(r.rawAfterCommit));
ok((r.revisitBackfield || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit — Empty does not silently reappear', JSON.stringify(r));

console.log('\n== 16. E4-2 review fix: "Pistol backfield + Empty formation" survives BOTH an explicit Formation edit and Save & Next ==');
// Codex E4-2 review, item #1 (High): formation:"Ace + Empty", backfield:"Pistol"
// correctly PROJECTS as qbAlignment=Pistol / formation=Ace / backfield=Empty —
// but committing (either an explicit Formation edit or the untouched-play
// Save & Next canonicalization) used to LOSE the Empty. Root cause: the
// forward-promote blank-check read RAW backfield ("Pistol", non-empty) and
// treated it as "already explicit", permanently blocking the Empty
// promotion — and Formation's own Empty token gets self-cleaned away in the
// SAME commit regardless, so the information vanished from BOTH fields at
// once. Fixed via TagProjection._ownStructuralValue, which strips backfield's
// OWN qbAlignment-relationship token before checking blankness.
r = await page.evaluate(async () => {
  const t = window.app.tagger, hist = window.app.history;
  const SE = window.app.stats.constructor;
  const mk = (id) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty', backfield: 'Pistol' } });

  // Path A: an explicit Formation commit (toggle the only active chip off).
  const idA = 9117;
  const playA = mk(idA);
  t.plays.push(playA);
  const beforeA = SE.proj(playA);
  t.selectPlay(idA);
  hist.reset();
  document.querySelector('#tagFormation .pick[data-value="Ace"]').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterA = t.getPlay(idA);
  const resultA = { formation: afterA.tags.formation, backfield: afterA.tags.backfield, qbAlignment: afterA.tags.qbAlignment };

  // Path B: Save & Next on a wholly untouched play (commitProjectedLook).
  const idB = 9118;
  const playB = mk(idB);
  t.plays.push(playB);
  const beforeB = SE.proj(playB);
  t.selectPlay(idB);
  document.getElementById('btnTagSaveNext').click();
  await new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res)));
  const afterB = t.getPlay(idB);
  const resultB = { formation: afterB.tags.formation, backfield: afterB.tags.backfield, qbAlignment: afterB.tags.qbAlignment };

  return { beforeA, resultA, beforeB, resultB };
});
ok(r.beforeA.qbAlignment === 'Pistol' && r.beforeA.formation === 'Ace' && r.beforeA.backfield === 'Empty',
  'prereq: the fixture genuinely projects as Pistol / Ace / Empty before any commit', JSON.stringify(r.beforeA));
ok(r.resultA.backfield === 'Empty' && r.resultA.qbAlignment === 'Pistol',
  'Path A (explicit Formation edit): Backfield stays Empty and QB Alignment stays Pistol — neither is lost', JSON.stringify(r.resultA));
ok(r.resultB.formation === 'Ace' && r.resultB.backfield === 'Empty' && r.resultB.qbAlignment === 'Pistol',
  'Path B (Save & Next canonicalization): all three dimensions land correctly — Empty is not lost to the self-clean race', JSON.stringify(r.resultB));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
