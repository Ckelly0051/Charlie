import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
/* E4 (D-projform) — GRIDIRON-IQ-TAG-MODEL.md §18. The tag FORM (not Film
   Room's grid, covered separately by e2e-film-room.mjs) shows each look field as
   stored and writes only on the coach's explicit edit. Plays are current format
   (legacy excision step 7): the promote/strip of old combined values is deleted
   with the old shape, and so are the sections that tested it. Proves the
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

   All tag clicks, history restores, and form reloads asserted below are
   synchronous production operations. Keep those page.evaluate callbacks
   synchronous too: double-requestAnimationFrame waits previously left a
   remote Promise alive across the CDP boundary, and Chromium intermittently
   collected it before Puppeteer received the result.

   Final Engine Independence: .tag-section/#tagFormation etc. are deleted.
   The real native tag form is mounted into a scratch host (mountNativeForm)
   and chip interactions/reads go through clickChip/activeChips/allChipValues
   below — each its OWN page.evaluate() round-trip, never combined with a DOM
   read inside the SAME synchronous callback that just clicked a chip. That
   split matters: NativeTaggingScreen republishes on a queued microtask
   (queueMicrotask, not requestAnimationFrame), which drains between two
   separate page.evaluate() calls but NOT mid-function inside one -- so a
   click and a DOM chip-state read must be two round-trips, while a click and
   a raw tags.* read (application state, not DOM) may safely stay in one,
   since the field mutation itself is synchronous.

   Run after build: npm run build && node tools/e2e-tag-projform.mjs */
import puppeteer from 'puppeteer';

const URL = TEST_APP_URL;
let pass = 0, fail = 0;
const ok = (cond, label, extra = '') => {
  if (cond) { pass++; console.log(`  PASS  ${label}`); }
  else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); }
};
const sleep = ms => new Promise(r => setTimeout(r, ms));

const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
// This file has no enclosing try/finally, so keep the process-level safety
// net even though the collected-Promise trigger is gone. Any future unexpected
// failure must close this harness's Chromium process and still exit non-zero.
let closing = false;
const closeAndExit = async (label, err) => {
  if (closing) return;
  closing = true;
  console.error(`${label}:`, err?.stack || err?.message || err);
  try { await browser.close(); } catch {}
  process.exit(1);
};
process.on('unhandledRejection', err => closeAndExit('UNHANDLED REJECTION', err));
process.on('uncaughtException', err => closeAndExit('UNCAUGHT EXCEPTION', err));
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const errors = [];
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
page.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });

const mountNativeForm = () => page.evaluate(() => {
  let host = document.getElementById('projformTagHost');
  if (!host) { host = document.createElement('div'); host.id = 'projformTagHost'; document.body.append(host); }
  window.app.nativeTagging.mount(host);
});
const clickChip = (field, text) => page.evaluate((f, t) => {
  const btn = [...document.querySelectorAll(`[data-native-field="${f}"] .gi-tag-chips button`)]
    .find(b => b.textContent.trim() === t);
  if (btn) btn.click();
  return !!btn;
}, field, text);
const activeChips = (field) => page.evaluate((f) =>
  [...document.querySelectorAll(`[data-native-field="${f}"] .gi-tag-chips button.is-active`)].map(b => b.textContent.trim()),
  field);
const allChipValues = (field) => page.evaluate((f) =>
  [...document.querySelectorAll(`[data-native-field="${f}"] .gi-tag-chips button`)].map(b => b.textContent.trim()),
  field);
const clickButtonByText = (text) => page.evaluate((t) => {
  const btn = [...document.querySelectorAll('.gi-native-tagging button')].find(b => b.textContent.trim() === t);
  if (btn) btn.click();
  return !!btn;
}, text);
// Save & Next's own button text flips to "Saved" for 650ms after a click
// (native-tagging-screen.js's _saveConfirmed flash) -- matching by class
// (always 'is-primary', text-independent) avoids a silent no-op click if a
// prior Save & Next in this same run hasn't reset yet.
const clickSaveNext = () => page.evaluate(() => {
  const btn = document.querySelector('.gi-tag-nav button.is-primary');
  if (btn) btn.click();
  return !!btn;
});

console.log('\n== 1. Setup: team + demo season + open game + a synthetic fixture ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
// Team/season setup lives in the library overlay, opened from the shell Home.
await setupTeamAndDemo(page);
await sleep(900);
// Open game 1 from the shell Home game list (the sole game-entry route).
// V2-A: no per-row Open button -- preview the row, then Continue charting.
await page.evaluate(() => document.querySelector('.ws-game-row')?.click());
await page.evaluate(() => document.getElementById('wsContinueCharting')?.click());
await sleep(700);
ok(await page.evaluate(() => window.app.workspace.currentRoute() === 'breakdown'),
  'setup: opening a game from Home genuinely lands in Break Down');
await mountNativeForm();

// Only IDs are kept on window — never object references (see the harness note
// in the file header). Every section re-fetches via t.getPlay(id).
const IDS = { lookPlay: 9101, familyPlay: 9102, modern: 9103, modernDef: 9104, explicitWins: 9105 };
await page.evaluate((ids) => {
  const t = window.app.tagger;
  const mk = (id, tags) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: Object.assign({ unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [] }, tags) });
  t.plays.push(
    // Formation and QB alignment, each in its own field.
    mk(ids.lookPlay, { formationFamily: 'Spread', qbAlignment: 'Shotgun' }),
    // A coverage family with no coverage call.
    mk(ids.familyPlay, { unit: 'defense', coverage: '', coverageFamily: 'Man' }),
    // Fully charted plays for the independent round-trip proofs.
    mk(ids.modern, { formationFamily: 'I-Form', qbAlignment: 'Under Center', backfield: 'I' }),
    mk(ids.modernDef, { unit: 'defense', coverage: 'Cover 2', coverageFamily: 'Zone' }),
    // An EXPLICIT qbAlignment that must survive a Formation edit untouched.
    mk(ids.explicitWins, { formationFamily: 'Wing-T', qbAlignment: 'Pistol' }),
  );
}, IDS);

console.log('\n== 2. View/select NEVER writes (requirement #1 + #2) ==');
let r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const before = JSON.stringify(t.getPlay(ids.lookPlay).tags);
  const stackBefore = hist.stack.length;
  t.selectPlay(ids.lookPlay);   // real selection path
  return {
    unchanged: JSON.stringify(t.getPlay(ids.lookPlay).tags) === before,
    noHistoryEntry: hist.stack.length === stackBefore,
  };
}, IDS);
// The stored look is visible in the form; nothing was written.
r.formationFamilyChip = await activeChips('formationFamily');
r.qbAlignmentChip = await activeChips('qbAlignment');
ok(r.unchanged, 'selecting a play writes NOTHING to its stored tags', JSON.stringify(r));
ok(r.noHistoryEntry, 'selecting a play records NO undo/history entry (view is not an edit)', JSON.stringify(r));
ok(JSON.stringify(r.formationFamilyChip) === JSON.stringify(['Spread']), 'Formation shows the stored formation — "Shotgun" is not offered and not active', JSON.stringify(r.formationFamilyChip));
ok(JSON.stringify(r.qbAlignmentChip) === JSON.stringify(['Shotgun']), 'QB Alignment shows the stored alignment', JSON.stringify(r.qbAlignmentChip));

console.log('\n== 3. Formation/Coverage chip lists no longer offer the moved values ==');
r = {
  formationValues: await allChipValues('formationFamily'),
  qbAlignmentValues: await allChipValues('qbAlignment'),
  coverageValues: await allChipValues('coverage'),
  coverageFamilyValues: await allChipValues('coverageFamily'),
};
ok(!r.formationValues.some(v => ['Under Center', 'Shotgun', 'Pistol'].includes(v)), 'Formation offers NO QB-alignment values', JSON.stringify(r.formationValues));
ok(JSON.stringify(r.qbAlignmentValues) === JSON.stringify(['Under Center', 'Pistol', 'Shotgun']), 'QB Alignment offers exactly the three alignment values');
ok(!r.coverageValues.some(v => ['Man', 'Zone', 'Match'].includes(v)), 'Coverage (the call) offers NO family values', JSON.stringify(r.coverageValues));
ok(JSON.stringify(r.coverageFamilyValues) === JSON.stringify(['Man', 'Zone', 'Match']), 'Coverage Family offers exactly the three family values');

console.log('\n== 4. A Formation commit writes ONLY the family, ONE undoable transaction (single-select) ==');
await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.lookPlay);
  hist.reset();
}, IDS);
// The Formation is single-select. Turning the ONLY active chip ('Spread') off is a
// genuine, single explicit commit.
await clickChip('formationFamily', 'Spread');
r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const play = t.getPlay(ids.lookPlay);
  const afterCommit = { formationFamily: play.tags.formationFamily, qbAlignment: play.tags.qbAlignment, entries: hist.stack.length };
  hist.undo();
  const p1 = t.getPlay(ids.lookPlay);
  const afterUndo = { formationFamily: p1.tags.formationFamily, qbAlignment: p1.tags.qbAlignment };
  hist.redo();
  const p2 = t.getPlay(ids.lookPlay);
  const afterRedo = { formationFamily: p2.tags.formationFamily, qbAlignment: p2.tags.qbAlignment };
  return { afterCommit, afterUndo, afterRedo };
}, IDS);
ok((r.afterCommit.formationFamily || '') === '' && r.afterCommit.qbAlignment === 'Shotgun', 'turning off the only formation chip clears Formation; the QB Alignment is untouched', JSON.stringify(r.afterCommit));
ok(r.afterCommit.entries === 1, 'the commit is EXACTLY one history entry', JSON.stringify(r.afterCommit));
ok(r.afterUndo.formationFamily === 'Spread' && r.afterUndo.qbAlignment === 'Shotgun', 'UNDO restores the formation', JSON.stringify(r.afterUndo));
ok((r.afterRedo.formationFamily || '') === '' && r.afterRedo.qbAlignment === 'Shotgun', 'REDO clears it again', JSON.stringify(r.afterRedo));

console.log('\n== 5. A Coverage call commit writes ONLY the call (single-select) ==');
await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.familyPlay);
  hist.reset();
}, IDS);
await clickChip('coverage', 'Cover 3');
r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const play = t.getPlay(ids.familyPlay);
  return { coverage: play.tags.coverage, coverageFamily: play.tags.coverageFamily, entries: hist.stack.length };
}, IDS);
ok(r.coverage === 'Cover 3' && r.coverageFamily === 'Man' && r.entries === 1, 'a Coverage call commit leaves the stored Coverage Family alone, in one transaction', JSON.stringify(r));

console.log('\n== 6. An EXISTING explicit sibling is NEVER overwritten (requirement #4) ==');
const before6 = await page.evaluate((ids) => {
  const t = window.app.tagger;
  t.selectPlay(ids.explicitWins);
  return JSON.parse(JSON.stringify(t.getPlay(ids.explicitWins).tags));
}, IDS);
await clickChip('formationFamily', 'Spread');   // replaces the existing 'Wing-T' (single-select)
r = await page.evaluate((ids, before) => {
  const t = window.app.tagger;
  const play = t.getPlay(ids.explicitWins);
  const untouchedKeys = Object.keys(before).every(k => k === 'formationFamily' || JSON.stringify(play.tags[k]) === JSON.stringify(before[k]));
  return { formationFamily: play.tags.formationFamily, qbAlignment: play.tags.qbAlignment, untouchedKeys };
}, IDS, before6);
ok(r.formationFamily === 'Spread' && r.qbAlignment === 'Pistol', 'choosing another formation on a play with an EXPLICIT qbAlignment leaves that value alone — never overwritten', JSON.stringify(r));
ok(r.untouchedKeys, 'no field OTHER than formation changed — a genuine field-level merge, not a bulk rewrite', JSON.stringify(r));

console.log('\n== 7. Clearing a value is INTENTIONAL, not a silent revert (requirement #5) ==');
await page.evaluate((ids) => window.app.tagger.selectPlay(ids.explicitWins), IDS);   // qbAlignment currently 'Pistol' from section 6
await clickChip('qbAlignment', 'Pistol');   // re-tap active chip = clear
r = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const play = t.getPlay(ids.explicitWins);
  return { qbAlignment: play.tags.qbAlignment };
}, IDS);
r.activeChips = (await activeChips('qbAlignment')).length;
ok((r.qbAlignment || '') === '' && r.activeChips === 0, 're-tapping the active QB Alignment chip clears it — the coach\'s explicit clear is honored, not silently re-derived', JSON.stringify(r));

console.log('\n== 7b. Clearing Coverage Family clears ONLY that field — with revisit + undo/redo ==');
await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9113;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'defense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], coverage: 'Cover 1', coverageFamily: 'Man' } };
  t.plays.push(play);
  t.selectPlay(id);
  hist.reset();
});
await clickChip('coverageFamily', 'Man');   // re-tap the active chip = explicit clear
r = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9113;
  const afterCommit = t.getPlay(id);
  const commitResult = { coverage: afterCommit.tags.coverage, coverageFamily: afterCommit.tags.coverageFamily, entries: hist.stack.length };
  hist.undo();
  const p1 = t.getPlay(id);
  const afterUndo = { coverage: p1.tags.coverage, coverageFamily: p1.tags.coverageFamily };
  hist.redo();
  const p2 = t.getPlay(id);
  const afterRedo = { coverage: p2.tags.coverage, coverageFamily: p2.tags.coverageFamily };
  t.selectPlay(id);
  const revisit = t.getPlay(id);
  return { commitResult, afterUndo, afterRedo, revisitCoverageFamily: revisit.tags.coverageFamily };
});
r.revisitChip = await activeChips('coverageFamily');
ok(r.commitResult.coverage === 'Cover 1' && (r.commitResult.coverageFamily || '') === '' && r.commitResult.entries === 1, 'clearing Coverage Family clears only that field, in one history entry', JSON.stringify(r.commitResult));
ok(r.afterUndo.coverage === 'Cover 1' && r.afterUndo.coverageFamily === 'Man', 'UNDO restores the family', JSON.stringify(r.afterUndo));
ok(r.afterRedo.coverage === 'Cover 1' && (r.afterRedo.coverageFamily || '') === '', 'REDO clears it again', JSON.stringify(r.afterRedo));
ok((r.revisitCoverageFamily || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit', JSON.stringify(r));

console.log('\n== 8. Formation / QB Alignment / Coverage Call / Coverage Family round-trip INDEPENDENTLY (requirement #6) ==');
await page.evaluate((ids) => window.app.tagger.selectPlay(ids.modern), IDS);
await clickChip('backfield', 'Split');   // edit an UNRELATED field
await page.evaluate((ids) => window.app.tagger.selectPlay(ids.modernDef), IDS);
await clickChip('blitz', 'Edge');        // edit an UNRELATED field
r = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const off = t.getPlay(ids.modern);
  const offAfter = { formationFamily: off.tags.formationFamily, qbAlignment: off.tags.qbAlignment, backfield: off.tags.backfield };
  const def = t.getPlay(ids.modernDef);
  const defAfter = { coverage: def.tags.coverage, coverageFamily: def.tags.coverageFamily, blitz: def.tags.blitz };
  return { offAfter, defAfter };
}, IDS);
ok(r.offAfter.formationFamily === 'I-Form' && r.offAfter.qbAlignment === 'Under Center' && r.offAfter.backfield === 'Split', 'Formation and QB Alignment are UNCHANGED by an unrelated Backfield edit', JSON.stringify(r.offAfter));
ok(r.defAfter.coverage === 'Cover 2' && r.defAfter.coverageFamily === 'Zone' && r.defAfter.blitz === 'Edge', 'Coverage Call and Coverage Family are UNCHANGED by an unrelated Blitz edit', JSON.stringify(r.defAfter));

console.log('\n== 9. Save & Next on an untouched play writes NOTHING ==');
await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  // The LAST play, so Save & Next has no next play to advance to and cannot
  // carry anything forward.
  const cleanId = 9110;
  const clean = { id: cleanId, timestamp: { start: cleanId, end: cleanId + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formationFamily: 'I-Form', qbAlignment: 'Under Center' } };
  t.plays.push(clean);
  t.selectPlay(cleanId);
  hist.reset();
  window.__before9 = JSON.stringify(clean.tags);
  window.__depthBefore9 = hist.stack.length;
});
await clickSaveNext();
r = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  return {
    cleanUnchanged: JSON.stringify(t.getPlay(9110).tags) === window.__before9,
    noHistoryEntryForClean: hist.stack.length === window.__depthBefore9,
  };
});
ok(r.cleanUnchanged, 'an untouched play is unchanged by Save & Next', JSON.stringify(r));
ok(r.noHistoryEntryForClean, 'Save & Next on an untouched play creates NO history entry', JSON.stringify(r));

console.log('\n== 10. "New Drive" writes ONLY Drive Number — every other field is left EXACTLY as it was (Codex E4-1 review finding #3) ==');
// Before this fix, New Drive called the bulk _saveCurrentTags() path, which
// re-wrote EVERY displayed field (including Formation/Coverage's PROJECTED
// display) from a click that only meant to bump the drive counter — a
// field-level-merge violation regardless of the promote guard it also had.
// The fix: New Drive now commits ONLY driveNumber via the same single-field
// setTagValue path every other charting write uses.
const before10 = await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9106;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formationFamily: 'Split Back', qbAlignment: 'Shotgun' } };
  t.plays.push(play);
  t.selectPlay(id);
  return JSON.parse(JSON.stringify(t.getPlay(id).tags));
});
await clickButtonByText('New Drive');
r = await page.evaluate((before) => {
  const t = window.app.tagger;
  const id = 9106;
  const after = t.getPlay(id);
  // Codex e0ab568 re-review item #3: compare the UNION of keys on both sides,
  // not just Object.keys(before) — the original check could only detect a
  // CHANGED existing key, so a regression that silently ADDS a brand-new key
  // (e.g. a stray qbAlignment/coverageFamily write) to `after.tags` that was
  // never present in `before` at all would pass undetected.
  const allKeys = new Set([...Object.keys(before), ...Object.keys(after.tags)]);
  const onlyDriveNumberChanged = [...allKeys].every(k => k === 'driveNumber'
    || JSON.stringify(after.tags[k] ?? null) === JSON.stringify(before[k] ?? null));
  return { formationFamily: after.tags.formationFamily, qbAlignment: after.tags.qbAlignment, driveNumber: after.tags.driveNumber, onlyDriveNumberChanged };
}, before10);
ok(r.formationFamily === 'Split Back' && r.qbAlignment === 'Shotgun', '"New Drive" leaves the look exactly as stored', JSON.stringify(r));
ok(!!r.driveNumber, '"New Drive" DOES write the drive number itself', JSON.stringify(r));
ok(r.onlyDriveNumberChanged, 'no field OTHER than driveNumber changed — a genuine single-field commit, not a bulk rewrite', JSON.stringify(r));

console.log('\n== 11. Cross-surface identical play set — the tag form write agrees with Film Room / the registry ==');
r = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const play = t.getPlay(ids.lookPlay);   // formationFamily:'', qbAlignment:'Shotgun' after section 4
  const SE = window.app.stats.constructor;
  const registry = window.app.analyticsRegistry;
  const proj = SE.proj(play);
  const gid = 'e4-projform-fixture';
  play.__gid = gid;
  const refs = registry.matchingRefs([play], 'qbAlignment', 'Shotgun');
  return {
    storedMatchesProjected: play.tags.formationFamily === proj.formationFamily && play.tags.qbAlignment === proj.qbAlignment,
    registryFindsIt: refs.includes(`${gid}::${play.id}`),
  };
}, IDS);
ok(r.storedMatchesProjected, 'the tag form\'s write is what the analytics read (proj) sees', JSON.stringify(r));
ok(r.registryFindsIt, 'the SAME play the tag form just edited is found by an INDEPENDENT AnalyticsRegistry.matchingRefs lookup for qbAlignment=Shotgun', JSON.stringify(r));

console.log('\n== 12. E4-2: Empty leaves Formation, Pistol leaves Backfield — the vocabulary actually moved ==');
r = {
  formationValues: await allChipValues('formationFamily'),
  backfieldValues: await allChipValues('backfield'),
};
ok(!r.formationValues.includes('Empty'), 'Formation no longer offers Empty (moved to Backfield)', JSON.stringify(r.formationValues));
ok(r.backfieldValues.includes('Empty'), 'Backfield still offers its own pre-existing Empty chip', JSON.stringify(r.backfieldValues));
ok(!r.backfieldValues.includes('Pistol'), 'Backfield no longer offers Pistol (moved to QB Alignment)', JSON.stringify(r.backfieldValues));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
