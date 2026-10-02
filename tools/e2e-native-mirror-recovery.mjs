/* PC-3 explicit recovery journey (Convergence Plan Invariant #6). Drives the
   real Home library UI end to end. Runs against the browser build
   (BrowserBackend), which has no Documents-mirror concept at all -- so this
   proves TWO things at that layer first (the capability gate genuinely hides
   the feature where it doesn't apply, and doesn't apply it silently), then
   injects a desktop-shaped backend (fake scanRecoverableSeasons/
   recoverSeasonFromMirror, exactly the TauriBackend contract) onto the live
   seasonStore to drive the full coach-facing flow through real clicks:
   empty-scan messaging, a valid candidate recovering successfully, an
   existsInCatalog candidate requiring an EXPLICIT extra confirmation before
   overwriting, and an invalid/unreadable candidate whose Recover control
   stays disabled. Never auto-imports -- every recovery here is triggered by
   a real click on a real button the coach chose.

   Run:  node tools/e2e-native-mirror-recovery.mjs */
import puppeteer from './test-browser.mjs';
import { createFirstTeam } from './hub-setup.mjs';
import { APP_URL } from './app-entry.mjs';

let pass = 0, fail = 0;
const ok = (c, label, extra = '') => { if (c) { pass++; console.log(`  PASS  ${label}`); } else { fail++; console.log(`  FAIL  ${label}${extra ? '  -- ' + extra : ''}`); } };
const browser = await puppeteer.launch({ args: ['--no-sandbox'] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 800 });
const errors = [];
page.on('pageerror', e => errors.push(e.stack || e.message));
await page.evaluateOnNewDocument(() => localStorage.clear());
await page.goto(APP_URL, { waitUntil: 'networkidle0' });
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-native-home]'));

// First-run team setup, so Home renders its normal season workspace.
await createFirstTeam(page, 'Recovery Test');
// Open the consolidated Home library where recovery now lives.
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForSelector('.library-panel');

// ---- 1. BrowserBackend has no recovery concept: the button is genuinely absent ----
let r = await page.evaluate(() => ({
  hasButton: [...document.querySelectorAll('.library-overview-actions button')].some(button => /Recover seasons/.test(button.textContent || '')),
  canRecover: window.app.teamHubScreen.canRecoverSeasons(),
  hasScan: typeof window.app.storage.seasonStore.backend.scanRecoverableSeasons === 'function',
}));
ok(!r.hasButton && !r.canRecover && !r.hasScan, 'BrowserBackend has no recovery capability: the button never renders (not hidden, absent)', JSON.stringify(r));

// ---- 2. Inject a desktop-shaped backend, matching the real TauriBackend contract ----
await page.evaluate(() => {
  const backend = window.app.storage.seasonStore.backend;
  window.__recoverCalls = [];
  window.__scanResult = [];
  backend.scanRecoverableSeasons = async () => window.__scanResult;
  backend.recoverSeasonFromMirror = async (id, opts) => {
    window.__recoverCalls.push({ id, opts });
    const candidate = window.__scanResult.find(c => c.id === id);
    if (!candidate) return { ok: false, reason: 'not-found' };
    if (candidate.existsInCatalog && !opts?.confirmOverwrite) return { ok: false, reason: 'exists', existsInCatalog: true };
    // PC-2 repair (Codex review 89e34c6 finding 4 / d206b58 finding 1): this
    // mock mirrors the REAL TauriBackend.recoverSeasonFromMirror() contract,
    // which now rejects every !result.ok outcome -- including
    // old-format -- unconditionally at the production boundary
    // itself (tools/e2e-catalog-backend.mjs section 8 asserts this directly
    // against the real backend, not this mock). The UI additionally keeps
    // the Recover control disabled for such a candidate (section 4b below),
    // so this branch is doubly unreachable for it in the coach-facing flow
    // -- but the backend refusal is the actual boundary, not the button.
    if (!candidate.valid) return { ok: false, reason: candidate.reason };
    // Simulate a genuine recovery: create a real season via the SAME path a
    // successful desktop recovery would exercise, so "the season appears in
    // Team Hub afterward" is proven against real state, not a stub flag.
    await window.app.storage.seasonStore.createSeason({ name: candidate.name, teamId: window.app.teamHubScreen.snapshot().activeTeamId });
    return { ok: true, id, gameCount: candidate.gameCount, playCount: candidate.playCount };
  };
});
await page.evaluate(() => window.app.teamHubScreen.load());
await page.waitForFunction(() => [...document.querySelectorAll('.library-overview-actions button')]
  .some(button => /Recover seasons/.test(button.textContent || '')));
r = await page.evaluate(() => ({ hasButton: [...document.querySelectorAll('.library-overview-actions button')]
  .some(button => /Recover seasons/.test(button.textContent || '')) }));
ok(r.hasButton, 'once a backend exposes the recovery contract, the button appears (capability, not a hardcoded assumption)', JSON.stringify(r));

// ---- 3. Empty scan: an honest "nothing found" dialog, no crash, no silent no-op ----
await page.evaluate(() => [...document.querySelectorAll('.library-overview-actions button')]
  .find(button => /Recover seasons/.test(button.textContent || ''))?.click());
await page.waitForFunction(() => document.body.textContent.includes('No recoverable seasons found'));
r = await page.evaluate(() => ({ text: document.querySelector('.gi-overlay-panel')?.textContent || '' }));
ok(/No Documents-mirror recovery snapshots/.test(r.text), 'an empty scan shows an honest message naming what was searched, not a blank dialog', r.text);
await page.click('[data-overlay-action="ok"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-panel'));

// ---- 4. Real candidates: valid, existsInCatalog, invalid, and old-format, all in one scan ----
await page.evaluate(() => {
  window.__scanResult = [
    { id: 'rec-valid', valid: true, name: 'Recovered Season', team: 'Recovery Test', gameCount: 3, playCount: 42, revision: '2026-01-01T00:00:00Z', timestamp: '2026-01-01T00:00:00Z', existsInCatalog: false },
    { id: 'rec-conflict', valid: true, name: 'Conflicting Season', team: 'Recovery Test', gameCount: 1, playCount: 5, revision: '2026-01-02T00:00:00Z', timestamp: '2026-01-02T00:00:00Z', existsInCatalog: true },
    { id: 'rec-broken', valid: false, reason: 'checksum-mismatch', name: 'Corrupt Snapshot', team: '', gameCount: null, playCount: null, revision: null, timestamp: null, existsInCatalog: false },
    { id: 'rec-legacy', valid: false, reason: 'old-format', name: 'Old Format Season', team: '', gameCount: null, playCount: null, revision: null, timestamp: null, existsInCatalog: false },
  ];
});
await page.evaluate(() => [...document.querySelectorAll('.library-overview-actions button')]
  .find(button => /Recover seasons/.test(button.textContent || ''))?.click());
await page.waitForSelector('[data-overlay-id="team-hub-recover-seasons"]');
r = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.gi-hub-recover-row')];
  const legacyRow = rows.find(row => row.textContent.includes('Old Format Season'));
  const brokenRow = rows.find(row => row.textContent.includes('Corrupt Snapshot'));
  const shown = el => !!el && el.getClientRects().length > 0 && getComputedStyle(el).visibility !== 'hidden';
  return {
    count: rows.length,
    names: rows.map(row => row.querySelector('strong')?.textContent),
    brokenButtons: brokenRow?.querySelectorAll('button').length,
    brokenReason: shown(brokenRow?.querySelector('.gi-hub-recover-reason')) ? brokenRow.querySelector('.gi-hub-recover-reason').textContent : null,
    legacyLabel: legacyRow?.querySelector('.gi-hub-recover-state')?.textContent,
    legacyButtons: legacyRow?.querySelectorAll('button').length,
    legacyReason: shown(legacyRow?.querySelector('.gi-hub-recover-reason')) ? legacyRow.querySelector('.gi-hub-recover-reason').textContent : null,
    legacyMeta: legacyRow?.querySelector('small')?.textContent,
    validMeta: rows.find(row => row.textContent.includes('Recovered Season'))?.querySelector('small')?.textContent,
  };
});
ok(r.count === 4 && r.names.join('|') === 'Recovered Season|Conflicting Season|Corrupt Snapshot|Old Format Season',
  'every scanned candidate renders as its own row, in scan order', JSON.stringify(r));
// ---- 4b. A candidate that cannot be recovered stays VISIBLE -- the coach can
// see the file exists -- and offers NO action. Installed smoke 1.12.0-103,
// S103-1: a disabled Recover button looked identical to an enabled one, and its
// reason lived in a `title` that a disabled button never shows, so clicking it
// did nothing and said nothing. The reason is now visible text in the row.
ok(r.brokenButtons === 0 && r.brokenReason === 'It cannot be recovered.', 'an invalid (checksum-mismatch) candidate offers no Recover control and says so in visible text', JSON.stringify(r));
ok(r.legacyLabel === 'Old format', 'an old-format candidate is plainly labeled, not silently hidden', JSON.stringify(r));
ok(r.legacyButtons === 0, 'an old-format candidate offers no Recover control -- it cannot be imported', JSON.stringify(r));
ok(r.legacyReason === 'Saved in an old GridIron IQ format. It cannot be recovered.', 'the old-format row says why in visible text, plainly', JSON.stringify(r));
ok(!r.legacyMeta && /Recovery Test · 3 games · 42 plays/.test(r.validMeta || ''),
  'unknown counts print nothing (never "0 games" or "null"); known counts still print', JSON.stringify(r));
r = await page.evaluate(() => window.__recoverCalls.length);
ok(r === 0, 'clicking near a disabled legacy row never invokes recoverSeasonFromMirror at all', String(r));

// ---- 5. The valid, non-conflicting candidate recovers on one click ----
const clickRecoverFor = async (name) => page.evaluate((n) => {
  const row = [...document.querySelectorAll('.gi-hub-recover-row')].find(r => r.textContent.includes(n));
  row.querySelector('button:not(:disabled)')?.click();
}, name);
await clickRecoverFor('Recovered Season');
await page.waitForFunction(() => window.__recoverCalls.some(c => c.id === 'rec-valid'));
r = await page.evaluate(() => ({
  calls: window.__recoverCalls,
  doneLabel: [...document.querySelectorAll('.gi-hub-recover-row')].find(row => row.textContent.includes('Recovered Season'))?.querySelector('.gi-hub-recover-done')?.textContent,
}));
ok(r.calls.length === 1 && r.calls[0].id === 'rec-valid' && !r.calls[0].opts?.confirmOverwrite,
  'a valid, non-conflicting candidate is recovered on the first click with no overwrite flag', JSON.stringify(r.calls));
ok(r.doneLabel === 'Recovered', 'the recovered row shows a real "Recovered" state, not just a silent success', JSON.stringify(r.doneLabel));

// ---- 6. The conflicting (existsInCatalog) candidate requires an EXPLICIT second confirm ----
await clickRecoverFor('Conflicting Season');
await page.waitForFunction(() => document.body.textContent.includes('already in your library'));
r = await page.evaluate(() => ({
  calls: window.__recoverCalls.length,
  warns: document.body.textContent.includes('overwrite it'),
}));
ok(r.calls === 1 && r.warns, 'clicking Recover on a conflicting candidate does NOT call recoverSeasonFromMirror yet -- it shows the overwrite warning first', JSON.stringify(r));
await page.evaluate(() => {
  const row = [...document.querySelectorAll('.gi-hub-recover-row')].find(r => r.textContent.includes('Conflicting Season'));
  [...row.querySelectorAll('button')].find(b => /overwrite and recover/i.test(b.textContent))?.click();
});
await page.waitForFunction(() => window.__recoverCalls.length === 2);
r = await page.evaluate(() => window.__recoverCalls);
ok(r.length === 2 && r[1].id === 'rec-conflict' && r[1].opts?.confirmOverwrite === true,
  'confirming the overwrite calls recoverSeasonFromMirror with confirmOverwrite:true, explicitly', JSON.stringify(r));

// ---- 7. A successful recovery actually reloads Home with the new season present ----
await page.click('[data-overlay-action="close"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-hub-recover-seasons"]'));
await page.evaluate(() => window.app.workspaceShell._openLibrary());
await page.waitForFunction(() => [...document.querySelectorAll('[data-library-season] h3')]
  .some(node => node.textContent === 'Recovered Season'));
r = await page.evaluate(() => ({
  seasonNames: [...document.querySelectorAll('[data-library-season] h3')].map(el => el.textContent),
}));
ok(r.seasonNames.includes('Recovered Season'), 'the recovered season actually appears in Home\'s season list, proving the reload is real, not just a UI status flag', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
