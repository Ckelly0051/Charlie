import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
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
  };
}, IDS);
// The projected view IS visible in the form even though nothing was written.
r.formationChip = await activeChips('formation');
r.qbAlignmentChip = await activeChips('qbAlignment');
ok(r.unchanged, 'selecting a LEGACY play writes NOTHING to its stored tags', JSON.stringify(r));
ok(r.noHistoryEntry, 'selecting a play records NO undo/history entry (view is not an edit)', JSON.stringify(r));
ok(JSON.stringify(r.formationChip) === JSON.stringify(['Trips']), 'Formation seeds from the PROJECTED structural value — "Shotgun" is not offered and not active', JSON.stringify(r.formationChip));
ok(JSON.stringify(r.qbAlignmentChip) === JSON.stringify(['Shotgun']), 'QB Alignment seeds from the DERIVED projected value even though nothing is literally stored under that key yet', JSON.stringify(r.qbAlignmentChip));

console.log('\n== 3. Formation/Coverage chip lists no longer offer the moved values ==');
r = {
  formationValues: await allChipValues('formation'),
  qbAlignmentValues: await allChipValues('qbAlignment'),
  coverageValues: await allChipValues('coverage'),
  coverageFamilyValues: await allChipValues('coverageFamily'),
};
ok(!r.formationValues.some(v => ['Under Center', 'Shotgun', 'Pistol'].includes(v)), 'Formation offers NO QB-alignment values', JSON.stringify(r.formationValues));
ok(JSON.stringify(r.qbAlignmentValues) === JSON.stringify(['Under Center', 'Pistol', 'Shotgun']), 'QB Alignment offers exactly the three alignment values');
ok(!r.coverageValues.some(v => ['Man', 'Zone', 'Match'].includes(v)), 'Coverage (the call) offers NO family values', JSON.stringify(r.coverageValues));
ok(JSON.stringify(r.coverageFamilyValues) === JSON.stringify(['Man', 'Zone', 'Match']), 'Coverage Family offers exactly the three family values');

console.log('\n== 4. Explicit commit PROMOTES the sibling, ONE undoable transaction — Formation (multi-select) ==');
await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.legacyFormation);
  hist.reset();
}, IDS);
// Formation is MULTI-select. Turning the ONLY active chip ('Trips', seeded
// from the projected view) off is a genuine, single explicit commit.
await clickChip('formation', 'Trips');
r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const play = t.getPlay(ids.legacyFormation);
  const afterCommit = { formation: play.tags.formation, qbAlignment: play.tags.qbAlignment, entries: hist.stack.length };
  hist.undo();
  const p1 = t.getPlay(ids.legacyFormation);
  const afterUndo = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };
  hist.redo();
  const p2 = t.getPlay(ids.legacyFormation);
  const afterRedo = { formation: p2.tags.formation, qbAlignment: p2.tags.qbAlignment };
  return { afterCommit, afterUndo, afterRedo };
}, IDS);
ok(r.afterCommit.formation === '' && r.afterCommit.qbAlignment === 'Shotgun', 'turning off the only structural chip clears Formation AND promotes the derived QB Alignment', JSON.stringify(r.afterCommit));
ok(r.afterCommit.entries === 1, 'the promote + write commit is EXACTLY one history entry', JSON.stringify(r.afterCommit));
ok(r.afterUndo.formation === 'Shotgun + Trips' && (r.afterUndo.qbAlignment || '') === '', 'UNDO restores the raw legacy primary AND removes the promoted sibling TOGETHER', JSON.stringify(r.afterUndo));
ok(r.afterRedo.formation === '' && r.afterRedo.qbAlignment === 'Shotgun', 'REDO restores the primary AND the promoted sibling TOGETHER', JSON.stringify(r.afterRedo));

console.log('\n== 5. The SAME promotion for the Coverage/Coverage Family pair (single-select) ==');
await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  t.selectPlay(ids.legacyCoverage);
  hist.reset();
}, IDS);
await clickChip('coverage', 'Cover 3');
r = await page.evaluate((ids) => {
  const t = window.app.tagger, hist = window.app.history;
  const play = t.getPlay(ids.legacyCoverage);
  return { coverage: play.tags.coverage, coverageFamily: play.tags.coverageFamily, entries: hist.stack.length };
}, IDS);
ok(r.coverage === 'Cover 3' && r.coverageFamily === 'Man' && r.entries === 1, 'explicit Coverage commit promotes the derived Coverage Family in the SAME single transaction', JSON.stringify(r));

console.log('\n== 6. An EXISTING explicit sibling is NEVER overwritten (requirement #4) ==');
const before6 = await page.evaluate((ids) => {
  const t = window.app.tagger;
  t.selectPlay(ids.explicitWins);
  return JSON.parse(JSON.stringify(t.getPlay(ids.explicitWins).tags));
}, IDS);
await clickChip('formation', 'Trips');   // ADDS to the existing 'Bunch' (multi-select)
r = await page.evaluate((ids, before) => {
  const t = window.app.tagger;
  const play = t.getPlay(ids.explicitWins);
  const untouchedKeys = Object.keys(before).every(k => k === 'formation' || JSON.stringify(play.tags[k]) === JSON.stringify(before[k]));
  return { formation: play.tags.formation, qbAlignment: play.tags.qbAlignment, untouchedKeys };
}, IDS, before6);
ok(r.formation === 'Bunch + Trips' && r.qbAlignment === 'Pistol', 'adding a structural formation chip on a play with an EXPLICIT qbAlignment leaves that value alone — never overwritten', JSON.stringify(r));
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

console.log('\n== 7b. Clearing a LEGACY-DERIVED sibling STRIPS the primary too — the clear actually SURVIVES a re-visit (Codex E4-1 review finding #1) ==');
// Section 7 only proved clearing a MODERN explicit value. Before this fix,
// clearing a DERIVED value (nothing explicit stored yet, only projected from
// the primary field's embedded legacy token) had nothing to override:
// project()'s precedence falls back to the still-embedded token whenever the
// sibling is blank, so the clear looked like it worked in the moment, then
// silently reappeared the next time the play was opened.
await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9108;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Shotgun + Wing-T' } };
  t.plays.push(play);
  t.selectPlay(id);   // seeds QB Alignment 'Shotgun' from the DERIVED projected value (nothing stored yet)
});
await clickChip('qbAlignment', 'Shotgun');   // re-tap the derived-active chip = explicit clear
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9108;
  const afterCommit = t.getPlay(id);
  const rawAfterCommit = { formation: afterCommit.tags.formation, qbAlignment: afterCommit.tags.qbAlignment };
  // Re-visit: select the play again fresh, as if the coach came back to it —
  // proves the clear survives on the STORED tags, not just the live chip UI.
  t.selectPlay(id);
  const revisit = t.getPlay(id);
  return { rawAfterCommit, revisitQbAlignment: revisit.tags.qbAlignment };
});
r.revisitChip = await activeChips('qbAlignment');
ok((r.rawAfterCommit.qbAlignment || '') === '' && r.rawAfterCommit.formation === 'Wing-T', 'clearing the DERIVED QB Alignment strips the Shotgun token out of Formation\'s raw stored value in the SAME commit', JSON.stringify(r.rawAfterCommit));
ok((r.revisitQbAlignment || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit — Shotgun does not silently reappear, because the raw legacy token is actually gone, not just hidden this one time', JSON.stringify(r));

console.log('\n== 7c. Coverage Family DERIVED clear strips Coverage too — the DISTINCT single-value branch, with revisit + undo/redo (Codex e0ab568 re-review, item #1) ==');
// 7b only exercised stripSiblingToken's MULTI-value (formation) branch.
// Coverage is single-value: the whole raw field IS the family token when it
// matches, so stripSiblingToken has a genuinely separate code path
// (`primaryKey === 'coverage'` -> return '' instead of filter-and-rejoin).
// This also proves the undo/redo pairing Codex asked for on this branch,
// mirroring section 4's Formation undo/redo but for the reverse (clear) case.
await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9113;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'defense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], coverage: 'Man' } };
  t.plays.push(play);
  t.selectPlay(id);   // seeds Coverage Family 'Man' from the DERIVED value — the whole raw `coverage` IS the family token
  hist.reset();
});
await clickChip('coverageFamily', 'Man');   // re-tap the derived-active chip = explicit clear
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

  // Re-visit AFTER the undo/redo cycle — proves the clear survives on the
  // STORED tags, not just the live chip UI from the original commit.
  t.selectPlay(id);
  const revisit = t.getPlay(id);
  return { commitResult, afterUndo, afterRedo, revisitCoverageFamily: revisit.tags.coverageFamily };
});
r.revisitChip = await activeChips('coverageFamily');
ok(r.commitResult.coverage === '' && r.commitResult.coverageFamily === '', 'clearing the DERIVED Coverage Family strips the Man token out of Coverage\'s raw stored value (the distinct single-value branch) in the SAME commit', JSON.stringify(r.commitResult));
ok(r.commitResult.entries === 1, 'the strip + clear commit is EXACTLY one history entry', JSON.stringify(r.commitResult));
ok(r.afterUndo.coverage === 'Man' && (r.afterUndo.coverageFamily || '') === '', 'UNDO restores the raw legacy Coverage AND removes the cleared Coverage Family TOGETHER', JSON.stringify(r.afterUndo));
ok((r.afterRedo.coverage || '') === '' && (r.afterRedo.coverageFamily || '') === '', 'REDO restores the stripped Coverage AND the cleared Coverage Family TOGETHER', JSON.stringify(r.afterRedo));
ok((r.revisitCoverageFamily || '') === '' && JSON.stringify(r.revisitChip) === JSON.stringify([]), 'the clear STICKS on a later re-visit after the undo/redo cycle — Man does not silently reappear', JSON.stringify(r));

console.log('\n== 8. Formation / QB Alignment / Coverage Call / Coverage Family round-trip INDEPENDENTLY (requirement #6) ==');
await page.evaluate((ids) => window.app.tagger.selectPlay(ids.modern), IDS);
await clickChip('backfield', 'Split');   // edit an UNRELATED field
await page.evaluate((ids) => window.app.tagger.selectPlay(ids.modernDef), IDS);
await clickChip('blitz', 'Edge');        // edit an UNRELATED field
r = await page.evaluate((ids) => {
  const t = window.app.tagger;
  const off = t.getPlay(ids.modern);
  const offAfter = { formation: off.tags.formation, qbAlignment: off.tags.qbAlignment, backfield: off.tags.backfield };
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
await page.evaluate(() => {
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
});
await clickSaveNext();
r = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const legacyId = 9109;
  const afterCommit = t.getPlay(legacyId);
  const commitResult = { formation: afterCommit.tags.formation, qbAlignment: afterCommit.tags.qbAlignment, entries: hist.stack.length };

  hist.undo();
  const p1 = t.getPlay(legacyId);
  const afterUndo = { formation: p1.tags.formation, qbAlignment: p1.tags.qbAlignment };

  hist.redo();
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
  window.__depthBefore9 = hist.stack.length;
  return { legacyResult, afterUndo, afterRedo };
});
await clickSaveNext();
const r9b = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const cleanId = 9110;
  const afterClean = t.getPlay(cleanId);
  return {
    cleanUnchanged: afterClean.tags.formation === 'Ace' && afterClean.tags.qbAlignment === 'Under Center',
    noHistoryEntryForClean: hist.stack.length === window.__depthBefore9,
  };
});
Object.assign(r, r9b);
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
await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9111;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Under Center + Bunch' } };
  t.plays.push(play);
  t.selectPlay(id);
  const cutup = window.app.cutupPlayer;
  window.__realNext9b = cutup.next.bind(cutup);
  cutup.next = () => {};   // stub — no real cut-up queue is needed for this check
  cutup.active = true;
});
await clickSaveNext();
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9111;
  const cutup = window.app.cutupPlayer;
  cutup.active = false;
  cutup.next = window.__realNext9b;
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
const before10 = await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9106;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Shotgun + Twins' } };
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
  return { formation: after.tags.formation, qbAlignment: after.tags.qbAlignment, driveNumber: after.tags.driveNumber, onlyDriveNumberChanged };
}, before10);
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
r = {
  formationValues: await allChipValues('formation'),
  backfieldValues: await allChipValues('backfield'),
};
ok(!r.formationValues.includes('Empty'), 'Formation no longer offers Empty (moved to Backfield)', JSON.stringify(r.formationValues));
ok(r.backfieldValues.includes('Empty'), 'Backfield still offers its own pre-existing Empty chip', JSON.stringify(r.backfieldValues));
ok(!r.backfieldValues.includes('Pistol'), 'Backfield no longer offers Pistol (moved to QB Alignment)', JSON.stringify(r.backfieldValues));

console.log('\n== 13. E4-2: explicit Formation commit PROMOTES Backfield (Empty), ONE undoable transaction ==');
// Mirrors section 4 (Formation -> QB Alignment) for the NEW Formation ->
// Backfield relationship (Empty). A legacy play stores "Ace + Empty" with a
// blank backfield; turning off Formation's only OTHER structural chip must
// promote 'Empty' into Backfield in the SAME commit as the Formation write.
await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9114;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty' } };
  t.plays.push(play);
  t.selectPlay(id);   // Formation seeds 'Ace' (Empty stripped from the projected view); Backfield seeds '' explicitly, but the CHIP shows 'Empty' derived
  hist.reset();
});
await clickChip('formation', 'Ace');   // turn off the only active structural chip
r = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9114;
  const afterCommit = t.getPlay(id);
  const commitResult = { formation: afterCommit.tags.formation, backfield: afterCommit.tags.backfield, entries: hist.stack.length };
  hist.undo();
  const p1 = t.getPlay(id);
  const afterUndo = { formation: p1.tags.formation, backfield: p1.tags.backfield };
  hist.redo();
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
await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9115;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], backfield: 'Pistol' } };
  t.plays.push(play);
  t.selectPlay(id);   // Backfield chip shows blank (Pistol stripped from the projected view); QB Alignment shows 'Pistol' derived
  hist.reset();
});
await clickChip('backfield', 'Diamond');
r = await page.evaluate(() => {
  const t = window.app.tagger, hist = window.app.history;
  const id = 9115;
  const afterCommit = t.getPlay(id);
  const commitResult = { backfield: afterCommit.tags.backfield, qbAlignment: afterCommit.tags.qbAlignment, entries: hist.stack.length };
  hist.undo();
  const p1 = t.getPlay(id);
  const afterUndo = { backfield: p1.tags.backfield, qbAlignment: p1.tags.qbAlignment };
  hist.redo();
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
await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9116;
  const play = { id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Wing-T + Empty' } };
  t.plays.push(play);
  t.selectPlay(id);   // Backfield chip shows 'Empty' derived (nothing stored yet)
});
await clickChip('backfield', 'Empty');   // re-tap the derived-active chip = explicit clear
r = await page.evaluate(() => {
  const t = window.app.tagger;
  const id = 9116;
  const afterCommit = t.getPlay(id);
  const rawAfterCommit = { formation: afterCommit.tags.formation, backfield: afterCommit.tags.backfield };
  t.selectPlay(id);   // re-visit
  const revisit = t.getPlay(id);
  return { rawAfterCommit, revisitBackfield: revisit.tags.backfield };
});
r.revisitChip = await activeChips('backfield');
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
const before16 = await page.evaluate(() => {
  const t = window.app.tagger;
  const SE = window.app.stats.constructor;
  const mk = (id) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty', backfield: 'Pistol' } });

  // Path A: an explicit Formation commit (toggle the only active chip off).
  const idA = 9117;
  const playA = mk(idA);
  t.plays.push(playA);
  const beforeA = SE.proj(playA);
  t.selectPlay(idA);
  window.app.history.reset();
  return { beforeA };
});
await clickChip('formation', 'Ace');
const midA16 = await page.evaluate(() => {
  const t = window.app.tagger;
  const afterA = t.getPlay(9117);
  return { formation: afterA.tags.formation, backfield: afterA.tags.backfield, qbAlignment: afterA.tags.qbAlignment };
});
await page.evaluate(() => {
  const t = window.app.tagger;
  const SE = window.app.stats.constructor;
  const mk = (id) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: { unit: 'offense', down: '', distance: '', playType: '', result: '', yardage: '', players: {}, grades: {}, custom: [], formation: 'Ace + Empty', backfield: 'Pistol' } });
  // Path B: Save & Next on a wholly untouched play (commitProjectedLook).
  const idB = 9118;
  const playB = mk(idB);
  t.plays.push(playB);
  window.__beforeB16 = SE.proj(playB);
  t.selectPlay(idB);
});
await clickSaveNext();
const resultB16 = await page.evaluate(() => {
  const t = window.app.tagger;
  const afterB = t.getPlay(9118);
  return { beforeB: window.__beforeB16, resultB: { formation: afterB.tags.formation, backfield: afterB.tags.backfield, qbAlignment: afterB.tags.qbAlignment } };
});
r = { beforeA: before16.beforeA, resultA: midA16, beforeB: resultB16.beforeB, resultB: resultB16.resultB };
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
