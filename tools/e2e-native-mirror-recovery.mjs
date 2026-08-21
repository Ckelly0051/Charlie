/* PC-3 explicit recovery journey (Convergence Plan Invariant #6). Drives the
   real native Team Hub UI end to end. Runs against the browser build
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
import puppeteer from 'puppeteer';
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
await page.waitForFunction(() => window.app?.teamHubScreen && document.querySelector('[data-native-team-hub]'));

// First-run team setup, so Team Hub renders its normal (non-first-team) shell.
await page.type('.gi-hub-first input[placeholder="St. Joseph Mavericks"]', 'Recovery Test');
await page.click('.gi-hub-first .gi-hub-primary');
await page.waitForFunction(() => document.querySelectorAll('[data-hub-team]').length === 1);

// ---- 1. BrowserBackend has no recovery concept: the button is genuinely absent ----
let r = await page.evaluate(() => ({
  hasButton: !!document.querySelector('[data-native-hub-recover]'),
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
    if (!candidate.valid && candidate.reason !== 'legacy-unenveloped') return { ok: false, reason: candidate.reason };
    // Simulate a genuine recovery: create a real season via the SAME path a
    // successful desktop recovery would exercise, so "the season appears in
    // Team Hub afterward" is proven against real state, not a stub flag.
    await window.app.storage.seasonStore.createSeason({ name: candidate.name, teamId: window.app.teamHubScreen.snapshot().activeTeamId });
    return { ok: true, id, gameCount: candidate.gameCount, playCount: candidate.playCount };
  };
});
await page.evaluate(() => window.app.teamHubScreen.load());
await page.waitForFunction(() => !!document.querySelector('[data-native-hub-recover]'));
r = await page.evaluate(() => ({ hasButton: !!document.querySelector('[data-native-hub-recover]') }));
ok(r.hasButton, 'once a backend exposes the recovery contract, the button appears (capability, not a hardcoded assumption)', JSON.stringify(r));

// ---- 3. Empty scan: an honest "nothing found" dialog, no crash, no silent no-op ----
await page.click('[data-native-hub-recover]');
await page.waitForFunction(() => document.body.textContent.includes('No recoverable seasons found'));
r = await page.evaluate(() => ({ text: document.querySelector('.gi-overlay-panel')?.textContent || '' }));
ok(/No Documents-mirror recovery snapshots/.test(r.text), 'an empty scan shows an honest message naming what was searched, not a blank dialog', r.text);
await page.click('[data-overlay-action="ok"]');
await page.waitForFunction(() => !document.querySelector('.gi-overlay-panel'));

// ---- 4. Real candidates: valid, existsInCatalog, and invalid, all in one scan ----
await page.evaluate(() => {
  window.__scanResult = [
    { id: 'rec-valid', valid: true, name: 'Recovered Season', team: 'Recovery Test', gameCount: 3, playCount: 42, revision: '2026-01-01T00:00:00Z', timestamp: '2026-01-01T00:00:00Z', existsInCatalog: false },
    { id: 'rec-conflict', valid: true, name: 'Conflicting Season', team: 'Recovery Test', gameCount: 1, playCount: 5, revision: '2026-01-02T00:00:00Z', timestamp: '2026-01-02T00:00:00Z', existsInCatalog: true },
    { id: 'rec-broken', valid: false, reason: 'checksum-mismatch', name: 'Corrupt Snapshot', team: '', gameCount: 0, playCount: 0, revision: null, timestamp: null, existsInCatalog: false },
  ];
});
await page.click('[data-native-hub-recover]');
await page.waitForSelector('[data-overlay-id="team-hub-recover-seasons"]');
r = await page.evaluate(() => {
  const rows = [...document.querySelectorAll('.gi-hub-recover-row')];
  return {
    count: rows.length,
    names: rows.map(row => row.querySelector('strong')?.textContent),
    brokenDisabled: rows.find(row => row.textContent.includes('Corrupt Snapshot'))?.querySelector('button')?.disabled,
  };
});
ok(r.count === 3 && r.names.join('|') === 'Recovered Season|Conflicting Season|Corrupt Snapshot',
  'every scanned candidate renders as its own row, in scan order', JSON.stringify(r));
ok(r.brokenDisabled === true, 'an invalid (checksum-mismatch) candidate\'s Recover control is disabled -- it cannot be imported', JSON.stringify(r));

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

// ---- 7. A successful recovery actually reloads Team Hub with the new season present ----
await page.click('[data-overlay-action="close"]');
await page.waitForFunction(() => !document.querySelector('[data-overlay-id="team-hub-recover-seasons"]'));
r = await page.evaluate(() => ({
  seasonNames: [...document.querySelectorAll('[data-season-id] strong')].map(el => el.textContent),
}));
ok(r.seasonNames.includes('Recovered Season'), 'the recovered season actually appears in Team Hub\'s season list, proving the reload is real, not just a UI status flag', JSON.stringify(r));

ok(errors.length === 0, 'No page errors', errors.join(' | '));
console.log(`\n== RESULT: ${pass} passed, ${fail} failed ==`);
await browser.close();
process.exit(fail ? 1 : 0);
