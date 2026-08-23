import { APP_URL as TEST_APP_URL } from './app-entry.mjs';
import { setupTeamAndDemo, createFirstTeam } from './hub-setup.mjs';
/* CANONICAL SEASON SAVE/REOPEN DURABILITY PROOF — the pre-package item named
   as outstanding since early E3b and never substituted for by anything in
   E4-1/E4-2. Every existing projection test (e2e-tag-projform.mjs,
   e2e-film-room.mjs) proves persistence only within the SAME live session:
   its "revisit" is `t.selectPlay(id)` in the same page, and e2e-integrity.mjs's
   "reload" op calls `backend.loadSeason()` in the same JS context and checks
   only play COUNTS. None of them tear down the live app and reload from
   nothing but what actually landed in the canonical store — the one thing a
   coach closing and reopening the app actually does.

   This harness does that for real: tag plays through the REAL tag-form/Film-
   Room UI (genuine field-level commits, not hand-built tag objects), commit +
   persist through the REAL StorageManager/SeasonStore path, then
   `page.reload()` — which destroys every live JS object, including
   `window.app` itself — and reopen the season fresh from BrowserBackend's
   localStorage store, the same canonical path a relaunch uses. Only then is
   the play's raw AND projected state re-read and compared against what was
   true before the reload — the relevant projection fields (unit, formation,
   qbAlignment, backfield, strength, coverage, coverageFamily) via the `pick()`
   helper below, not a literal full-object diff (reload legitimately fills in
   unrelated blank schema keys a hand-built synthetic fixture may omit; see
   the `pick()` comment).

   Covers, through this genuine reload boundary:
     1. A legacy Formation→QB Alignment promotion (multi-value primary).
     2. A legacy Coverage→Coverage Family promotion (single-value primary).
     3. The combined Pistol+Empty legacy shape, committed via an explicit
        Formation edit (the E4-2 review-fix case, commit path #1).
     4. The SAME combined shape, committed via Save & Next / commitProjectedLook
        (commit path #2 — the two paths share the fix, both must survive).
     5. A Film Room grid edit on one of the four newly-editable columns
        (Backfield).
     6. A derived-value CLEAR (re-tapping an active derived chip) — the exact
        thing that used to silently reappear on revisit before the E4-1 fix;
        this proves it stays gone across an actual reload, not just a
        same-session reselect.
     7. A fully modern, no-legacy-token play as a plain sanity baseline.
   Plus: history is fresh (no leaked undo stack) after the reopen, play count
   is unchanged, and cross-surface parity (tag-form chip state) matches
   pre-reload for every case.

   A second, optional section repeats the same shape against a COPY of a real
   season from the coach's Documents mirror, if present on this machine (same
   fail-open convention as e2e-realdata.mjs's GIQ_REALDATA_OPTIONAL — a
   missing mirror is a skip, never a silent false pass, and it is never
   written back to).

   Run after build: npm run build && node tools/e2e-projform-durability.mjs */
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const URL = TEST_APP_URL;
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
const frame = () => page.evaluate(() => new Promise(res => requestAnimationFrame(() => requestAnimationFrame(res))));

// Final Engine Independence: .tag-section/#tagFormation etc. are deleted.
// The native form's chip buttons carry no data-value attribute -- they are
// matched by their rendered text, same convention as every other rewritten
// harness this checkpoint (e2e-tag-fields.mjs, e2e-tag-library-settings.mjs).
// mountNativeForm() must be called once per fresh page context (initial load
// AND after every page.reload(), since reload destroys window.app entirely).
const mountNativeForm = () => page.evaluate(() => {
  let host = document.getElementById('durabilityTagHost');
  if (!host) { host = document.createElement('div'); host.id = 'durabilityTagHost'; document.body.append(host); }
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
// Matched by class, not text: the button's own text flips to "Saved" for
// 650ms after a click (native-tagging-screen.js's _saveConfirmed flash),
// which /Save/ would also match -- 'is-primary' stays stable either way.
const clickSaveNext = () => page.evaluate(() => {
  const btn = document.querySelector('.gi-tag-nav button.is-primary');
  if (btn) btn.click();
  return !!btn;
});

// Reload/reopen legitimately normalizes a play's tag object to the full
// canonical schema (e.g. filling a blank `strength` key my synthetic fixtures
// never set) — that is season-store's normalize doing its job, not data loss.
// Compare only the fields this proof is actually about, so an unrelated
// schema-fill can't be mistaken for (or mask) a real projection regression.
const RELEVANT = ['unit', 'formation', 'qbAlignment', 'backfield', 'strength', 'coverage', 'coverageFamily'];
const pick = (obj) => JSON.stringify(Object.fromEntries(RELEVANT.map(k => [k, obj[k] ?? ''])));

console.log('\n== 1. Setup: team + a real (non-demo) season + one game ==');
await page.goto(URL, { waitUntil: 'networkidle0' });
await sleep(600);
await createFirstTeam(page);
await sleep(300);
const seasonId = await page.evaluate(async () => {
  const rec = await window.app.storage.createSeason({ name: 'Durability Proof' });
  return rec && rec.id;
});
ok(!!seasonId, 'season created', String(seasonId));
await sleep(300);

const IDS = { legacyFormation: 9301, legacyCoverage: 9302, pistolEmptyEdit: 9303, pistolEmptySaveNext: 9304, gridBackfield: 9305, derivedClear: 9306, modern: 9307 };
await page.evaluate((ids) => {
  const t = window.app.tagger;
  const mk = (id, tags) => ({ id, timestamp: { start: id, end: id + 5 }, notes: '', tags: Object.assign({ unit: 'offense', down: '1', distance: '10', playType: 'Run Inside', runPass: 'Run', result: 'Gain', yardage: '4', players: {}, grades: {}, custom: [] }, tags) });
  t.plays.push(
    mk(ids.legacyFormation, { formation: 'Shotgun + Trips' }),
    mk(ids.legacyCoverage, { unit: 'defense', coverage: 'Man', playType: '', runPass: '', result: '' }),
    mk(ids.pistolEmptyEdit, { formation: 'Ace + Empty', backfield: 'Pistol' }),
    mk(ids.pistolEmptySaveNext, { formation: 'Ace + Empty', backfield: 'Pistol' }),
    mk(ids.gridBackfield, { formation: 'Wing-T', backfield: 'Split' }),
    mk(ids.derivedClear, { formation: 'Shotgun + Wing-T' }),
    mk(ids.modern, { formation: 'Ace', qbAlignment: 'Under Center', backfield: 'I', coverage: 'Cover 2', coverageFamily: 'Zone' }),
  );
  t.nextId = 9400;
}, IDS);

console.log('\n== 2. Commit real edits through the actual tag-form / Film Room UI ==');
await mountNativeForm();

// 2a. Legacy Formation -> QB Alignment promotion (turn off the only structural chip).
await page.evaluate((id) => window.app.tagger.selectPlay(id), IDS.legacyFormation);
await clickChip('formation', 'Trips');
await frame();

// 2b. Legacy Coverage -> Coverage Family promotion.
await page.evaluate((id) => window.app.tagger.selectPlay(id), IDS.legacyCoverage);
await clickChip('coverage', 'Cover 3');
await frame();

// 2c. Combined Pistol+Empty, committed via an explicit Formation edit (adds a
// second structural chip so the commit is genuine, not a no-op).
await page.evaluate((id) => window.app.tagger.selectPlay(id), IDS.pistolEmptyEdit);
await clickChip('formation', 'Trips');
await frame();

// 2d. Combined Pistol+Empty, committed via Save & Next (commitProjectedLook).
await page.evaluate((id) => window.app.tagger.selectPlay(id), IDS.pistolEmptySaveNext);
await clickSaveNext();
await frame();
await sleep(150);

// 2e. Film Room grid edit on Backfield (one of the four newly-editable columns).
// Final Engine Independence: #playGridSection/PlayGrid's classic renderer are
// deleted -- Film Room is reached exclusively through the native route
// (native-film-room.jsx via NativeFilmRoomScreen), mounted into a scratch host
// the same way mountNativeForm() mounts native tagging above. Real DOM shape
// (js/native-film-room.jsx): cell = button[data-cell="playId:colKey"];
// clicking once selects/focuses the cell, a second click (or Enter) opens the
// editor's `.gi-film-option-chips button` picks (single-select commits on
// click, no separate Done needed).
// Backfield is not in PlayGrid.PRESETS.default (['sit','formation',
// 'qbAlignment','playType','result','yardage','penalty']) — add it, same as
// e2e-film-room.mjs does when it needs a non-default column visible.
await page.evaluate(() => {
  const grid = window.app.playGrid;
  if (grid && !grid.cols.includes('backfield')) { grid.cols = [...grid.cols, 'backfield']; }
  const host = document.createElement('div');
  host.id = 'projformFilmRoomHost';
  document.body.append(host);
  window.app.nativeFilmRoom.mount(host);
  if (grid) grid.refresh();
});
// Wait for the CELL, not for a fixed number of milliseconds -- same reasoning
// as before: refresh() renders on a frame, and a blind sleep raced it.
const gridEdit = await page.waitForFunction(
  (id) => !!document.querySelector(`button[data-cell="${id}:backfield"]`),
  { timeout: 5000 }, IDS.gridBackfield,
).then(() => true).catch(() => false);
ok(gridEdit, 'Film Room Backfield cell is present and reachable before the grid-edit case runs');
if (gridEdit) {
  // Two separate round-trips, not two synchronous .click() calls in one
  // evaluate: native-film-room.jsx's click handler compares against `active`
  // state from its OWN closure, which only updates after Preact re-renders --
  // a second click in the same synchronous turn would still see the stale
  // pre-first-click `active` and never detect "this is now the focused cell".
  await page.evaluate((id) => document.querySelector(`button[data-cell="${id}:backfield"]`)?.click(), IDS.gridBackfield);
  await frame();
  await page.evaluate((id) => document.querySelector(`button[data-cell="${id}:backfield"]`)?.click(), IDS.gridBackfield);
  await frame();
  await page.evaluate(() => {
    const btn = [...document.querySelectorAll('.gi-film-option-chips button')].find(b => b.textContent.trim() === 'I');
    if (btn) btn.click();
  });
  await frame();
  const gridCommitted = await page.evaluate((id) => window.app.tagger.getPlay(id).tags.backfield, IDS.gridBackfield);
  ok(gridCommitted === 'I', 'Film Room grid edit on Backfield actually committed (Split -> I) through the real inline editor', gridCommitted);
  await page.evaluate(() => { window.app.nativeFilmRoom.restore(); document.getElementById('projformFilmRoomHost')?.remove(); });
}

// 2f. Derived-value CLEAR: seed QB Alignment 'Shotgun' from the projected view
// (nothing stored yet), then re-tap the derived-active chip to clear it.
// The workspaceShell.disable() call above for the Film Room grid section
// unmounts NativeTaggingScreen along with the rest of the route (it is a
// singleton, restored regardless of which host it was mounted into) --
// remount before this and every later chip interaction needs it.
await mountNativeForm();
await page.evaluate((id) => window.app.tagger.selectPlay(id), IDS.derivedClear);
await clickChip('qbAlignment', 'Shotgun');
await frame();

console.log('\n== 3. Snapshot every case BEFORE reload (raw tags + projected view + chip state) ==');
// Final Engine Independence: chip fields are rendered by the native form only
// for the currently relevant unit (formation/qbAlignment/backfield for
// offense, coverage/coverageFamily for defense) -- unlike the old legacy
// markup, which existed everywhere and was merely hidden. An empty chip
// array for an out-of-unit field is the honest native equivalent, and since
// the assertion below compares before/after equality (not a fixed expected
// value) that's safe either way. Republish is a queued microtask, so every
// selectPlay() needs a tick before the chip DOM reflects it.
const before = await page.evaluate(async (ids) => {
  const t = window.app.tagger;
  const tick = () => new Promise(r => queueMicrotask(r));
  const active = (field) => [...document.querySelectorAll(`[data-native-field="${field}"] .gi-tag-chips button.is-active`)].map(b => b.textContent.trim());
  const out = {};
  for (const [key, id] of Object.entries(ids)) {
    const play = t.getPlay(id);
    t.selectPlay(id);
    await tick();
    out[key] = {
      tags: JSON.parse(JSON.stringify(play.tags)),
      projected: TagProjection.project(play.tags),
      chips: {
        formation: active('formation'),
        qbAlignment: active('qbAlignment'),
        backfield: active('backfield'),
        coverage: active('coverage'),
        coverageFamily: active('coverageFamily'),
      },
    };
  }
  return { plays: out, playCount: t.plays.length };
}, IDS);

ok((before.plays.legacyFormation.tags.formation || '') === '' && before.plays.legacyFormation.tags.qbAlignment === 'Shotgun', 'pre-reload: legacy Formation promotion committed as expected', JSON.stringify(before.plays.legacyFormation.tags));
ok(before.plays.legacyCoverage.tags.coverage === 'Cover 3' && before.plays.legacyCoverage.tags.coverageFamily === 'Man', 'pre-reload: legacy Coverage promotion committed as expected', JSON.stringify(before.plays.legacyCoverage.tags));
ok(before.plays.pistolEmptyEdit.projected.qbAlignment === 'Pistol' && before.plays.pistolEmptyEdit.projected.backfield === 'Empty', 'pre-reload: Pistol+Empty (Formation-edit path) preserves BOTH projected fields', JSON.stringify(before.plays.pistolEmptyEdit.projected));
ok(before.plays.pistolEmptySaveNext.projected.qbAlignment === 'Pistol' && before.plays.pistolEmptySaveNext.projected.backfield === 'Empty', 'pre-reload: Pistol+Empty (Save & Next path) preserves BOTH projected fields', JSON.stringify(before.plays.pistolEmptySaveNext.projected));
ok((before.plays.derivedClear.tags.qbAlignment || '') === '' && before.plays.derivedClear.projected.qbAlignment === '', 'pre-reload: derived QB Alignment clear is genuinely stored (not just hidden)', JSON.stringify(before.plays.derivedClear.tags));

console.log('\n== 4. Persist through the REAL canonical path, then reload the page from nothing ==');
await page.evaluate(() => { window.app.storage.commitActive(); return window.app.storage.seasonStore.persist(); });
await sleep(300);
const storedRaw = await page.evaluate((id) => localStorage.getItem('ffa_season_' + id) != null, seasonId);
ok(storedRaw, 'season blob is actually present in localStorage before reload (persist genuinely wrote)');

await page.reload({ waitUntil: 'load' });
await sleep(700);
const freshAppState = await page.evaluate(() => ({
  hasApp: !!window.app,
  hasSeason: !!(window.app && window.app.storage && window.app.storage.seasonStore && window.app.storage.seasonStore.hasCurrent && window.app.storage.seasonStore.hasCurrent()),
  playsLoaded: !!(window.app && window.app.tagger && window.app.tagger.plays.length),
}));
ok(freshAppState.hasApp && !freshAppState.hasSeason && !freshAppState.playsLoaded, 'reload genuinely tore down the live app — nothing is loaded until the season is explicitly reopened (library-first contract)', JSON.stringify(freshAppState));

console.log('\n== 5. Reopen the season the way a coach relaunching the app would ==');
const reopened = await page.evaluate(async (id) => {
  const metas = await window.app.storage.listSeasons();
  const meta = metas.find(m => m.id === id);
  if (!meta) return { error: 'season not found in library after reload' };
  await window.app.storage.openSeasonById(id);
  return { found: true, playCount: window.app.tagger.plays.length, historyEntries: window.app.history ? window.app.history.stack.length : -1 };
}, seasonId);
ok(reopened.found === true, 'season reopens cleanly after reload', JSON.stringify(reopened));
ok(reopened.playCount === before.playCount, 'exact same play COUNT survives persist -> reload -> reopen', `before=${before.playCount} after=${reopened.playCount}`);
ok(reopened.historyEntries === 0, 'reopening a season starts with a FRESH undo/redo stack — no leaked entries from the pre-reload session', JSON.stringify(reopened));

console.log('\n== 6. Every case: raw tags AND projected view are BYTE-IDENTICAL to the pre-reload snapshot ==');
// page.reload() destroyed window.app entirely -- mount a fresh native form
// into a fresh scratch host before reading chip state again.
await mountNativeForm();
const after = await page.evaluate(async (ids) => {
  const t = window.app.tagger;
  const tick = () => new Promise(r => queueMicrotask(r));
  const active = (field) => [...document.querySelectorAll(`[data-native-field="${field}"] .gi-tag-chips button.is-active`)].map(b => b.textContent.trim());
  const out = {};
  for (const [key, id] of Object.entries(ids)) {
    const play = t.getPlay(id);
    if (!play) { out[key] = { missing: true }; continue; }
    t.selectPlay(id);
    await tick();
    out[key] = {
      tags: JSON.parse(JSON.stringify(play.tags)),
      projected: TagProjection.project(play.tags),
      chips: {
        formation: active('formation'),
        qbAlignment: active('qbAlignment'),
        backfield: active('backfield'),
        coverage: active('coverage'),
        coverageFamily: active('coverageFamily'),
      },
    };
  }
  return out;
}, IDS);

for (const key of Object.keys(IDS)) {
  const b = before.plays[key], a = after[key];
  if (!a || a.missing) { ok(false, `[${key}] play survives the reopen`, 'MISSING after reload'); continue; }
  ok(pick(a.tags) === pick(b.tags), `[${key}] raw stored tags are identical (relevant fields) after persist -> reload -> reopen`, JSON.stringify({ before: b.tags, after: a.tags }));
  ok(pick(a.projected) === pick(b.projected), `[${key}] projected view is identical after reload (no drift / no re-reconciliation on load)`, JSON.stringify({ before: b.projected, after: a.projected }));
  ok(JSON.stringify(a.chips) === JSON.stringify(b.chips), `[${key}] tag-form chip state (cross-surface parity) matches pre-reload after reopening`, JSON.stringify({ before: b.chips, after: a.chips }));
}

console.log('\n== 7. Zero page errors across the whole persist/reload/reopen cycle ==');
ok(errors.length === 0, 'no console/page errors', errors.join(' | '));

console.log('\n== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');

// ---------------------------------------------------------------------------
// Optional section: repeat the shape against a COPY of a real season, if this
// machine has the Documents mirror (same convention as e2e-realdata.mjs).
// Never writes back to the mirror; only ever touches the browser's isolated
// localStorage for a throwaway "Durability Proof (real data)" season.
// ---------------------------------------------------------------------------
const MIRROR = 'C:/Users/charl/OneDrive/Documents/GridIron IQ/seasons';
const realFiles = fs.existsSync(MIRROR)
  ? fs.readdirSync(MIRROR).map(d => path.join(MIRROR, d, 'season.json')).filter(f => fs.existsSync(f))
  : [];

if (!realFiles.length) {
  console.log('\nSKIP: no real season.json at ' + MIRROR + ' — real-data durability section not run on this machine.');
} else {
  console.log('\n== 8. Real-data durability: a genuine coach season survives persist -> reload -> reopen ==');
  const real = JSON.parse(fs.readFileSync(realFiles[0], 'utf-8'));
  const realName = real.seasonName || path.basename(path.dirname(realFiles[0]));

  const realSeasonId = await page.evaluate(async (realSeason) => {
    const rec = await window.app.storage.createSeason({ name: 'Durability Proof (real data)' });
    const store = window.app.storage.seasonStore;
    const clone = JSON.parse(JSON.stringify(realSeason));
    const normalized = store._normalize(clone);
    normalized.id = rec.id;
    store.data = normalized;
    store.currentSeasonId = rec.id;
    window.app.storage._afterSeasonLoaded();
    return rec.id;
  }, real);
  await sleep(400);

  // Fingerprint EVERY game's play array up front, not just the active one —
  // a coach's real season is multi-game, and a save/reopen bug could plausibly
  // corrupt an INACTIVE game's data while leaving the active game (the only
  // one previously checked here) untouched.
  const gameFingerprintsBefore = await page.evaluate(() => {
    const store = window.app.storage.seasonStore;
    return store.data.games.map(g => ({ id: g.id, activeId: store.data.activeGameId, playCount: (g.plays || []).length, fp: JSON.stringify(g.plays) }));
  });
  ok(gameFingerprintsBefore.length >= 1, `real season (${realName}) has at least one game to fingerprint`, String(gameFingerprintsBefore.length));

  const realBefore = await page.evaluate(async () => {
    const t = window.app.tagger;
    if (!t.plays.length) return { error: 'no plays in real fixture active game' };
    // Pick an OFFENSE play deterministically so the Formation chip group is
    // guaranteed present (native-tagging.jsx hides it for other units).
    const offensePlay = t.plays.find(p => (p.tags.unit || 'offense') === 'offense') || t.plays[0];
    const id = offensePlay.id;
    t.selectPlay(id);
    await new Promise(r => queueMicrotask(r));
    const preClick = JSON.parse(JSON.stringify(t.getPlay(id).tags));
    // Apply one genuine legacy-shaped edit through the real UI so this proves
    // an actual WRITE survives, not just an untouched read-back.
    const chip = [...document.querySelectorAll('[data-native-field="formation"] .gi-tag-chips button')]
      .find(b => b.textContent.trim() === 'Trips');
    const chipFound = !!chip;
    if (chip) chip.click();
    return { id, playCount: t.plays.length, preClick, chipFound };
  });
  await frame();
  const realSnapshotBefore = await page.evaluate((id) => {
    const t = window.app.tagger;
    const play = t.getPlay(id);
    return { tags: JSON.parse(JSON.stringify(play.tags)), projected: TagProjection.project(play.tags) };
  }, realBefore.id);

  ok(realBefore.chipFound, 'real-data: the Trips Formation chip is reachable on the edited (offense) play', JSON.stringify(realBefore));
  ok(pick(realSnapshotBefore.tags) !== pick(realBefore.preClick), 'real-data: the UI click genuinely changed the play BEFORE persist (not a vacuous no-op — proves the reload comparison below is testing a real write)', JSON.stringify({ preClick: realBefore.preClick, postClick: realSnapshotBefore.tags }));

  await page.evaluate(() => { window.app.storage.commitActive(); return window.app.storage.seasonStore.persist(); });
  await sleep(300);
  await page.reload({ waitUntil: 'load' });
  await sleep(700);

  const realAfter = await page.evaluate(async (payload) => {
    const { seasonId, playId, playCountBefore } = payload;
    const metas = await window.app.storage.listSeasons();
    const meta = metas.find(m => m.id === seasonId);
    if (!meta) return { error: 'real-data season missing after reload' };
    await window.app.storage.openSeasonById(seasonId);
    const t = window.app.tagger;
    const play = t.getPlay(playId);
    if (!play) return { error: 'edited play missing after reopen', playCount: t.plays.length };
    return {
      playCount: t.plays.length,
      playCountMatches: t.plays.length === playCountBefore,
      tags: JSON.parse(JSON.stringify(play.tags)),
      projected: TagProjection.project(play.tags),
    };
  }, { seasonId: realSeasonId, playId: realBefore.id, playCountBefore: realBefore.playCount });

  ok(!realAfter.error, `real season (${realName}) reopens cleanly after reload`, JSON.stringify(realAfter.error || ''));
  if (!realAfter.error) {
    ok(realAfter.playCountMatches, 'real-data: exact play count preserved across the reload', `before=${realBefore.playCount} after=${realAfter.playCount}`);
    ok(pick(realAfter.tags) === pick(realSnapshotBefore.tags), 'real-data: the genuine UI edit survives persist -> reload -> reopen (relevant fields)', JSON.stringify({ before: realSnapshotBefore.tags, after: realAfter.tags }));
    ok(pick(realAfter.projected) === pick(realSnapshotBefore.projected), 'real-data: projected view is unchanged after reload (no drift on real coach data)', JSON.stringify({ before: realSnapshotBefore.projected, after: realAfter.projected }));

    // Every OTHER (non-edited) game's ENTIRE play array must be byte-identical
    // across the reload — not just the active game's count. Catches data loss
    // in an inactive game that a single-game check would miss entirely.
    const gameFingerprintsAfter = await page.evaluate(() => {
      const store = window.app.storage.seasonStore;
      return store.data.games.map(g => ({ id: g.id, playCount: (g.plays || []).length, fp: JSON.stringify(g.plays) }));
    });
    const editedGameId = gameFingerprintsBefore.find(g => g.id === gameFingerprintsBefore[0].activeId)?.id ?? gameFingerprintsBefore[0].activeId;
    ok(gameFingerprintsAfter.length === gameFingerprintsBefore.length, 'real-data: same number of games survives the reload (no game silently lost)', `before=${gameFingerprintsBefore.length} after=${gameFingerprintsAfter.length}`);
    const otherBefore = gameFingerprintsBefore.filter(g => g.id !== editedGameId);
    for (const g of otherBefore) {
      const match = gameFingerprintsAfter.find(a => a.id === g.id);
      ok(!!match, `real-data: inactive game ${g.id} still exists after reload`, JSON.stringify({ id: g.id }));
      if (match) ok(match.fp === g.fp, `real-data: inactive game ${g.id}'s entire play array is byte-identical after reload (${g.playCount} plays, untouched by the edit)`, `before=${g.playCount} after=${match.playCount}`);
    }
  }
  console.log('\n== RESULT: ' + pass + ' passed, ' + fail + ' failed ==');
}

await browser.close();
process.exit(fail ? 1 : 0);
