/**
 * ONE-TIME, HASH-GUARDED removal of retired keys from active app storage
 * (legacy excision Pass 2b; coach direction 2026-09-26).
 *
 * Each target was exported byte for byte, with a manifest and hashes, to
 * C:\Users\charl\GridIronIQ-Backups before this code existed:
 *   ffa_versions_default   unscoped-version-history-2026-09-26 (20 game snapshots
 *                          with no season/game ownership, 748,320 bytes)
 *   ffa_roster             retired-roster-keys-2026-09-26 (19 players, equal to
 *   ffa_roster_mavericks   the 2025 JV season roster; and an empty list)
 * No production code reads any of them. A key is removed ONLY when its stored
 * value still hashes to the archived SHA-256; a different value is refused and
 * left exactly as it is, an absent key is a no-op, and every removal is read
 * back. Nothing is restored, assigned or converted. Every removal leaves a
 * receipt in a write-ahead journal (see run()); the final report under MARKER
 * makes the checkpoint run once, and a failure is retried on the next launch.
 *
 * Delete this module once the coach's installed profile has run it and the
 * smoke confirms the report.
 */
export class StorageCleanup {
  static MARKER = 'giq_storage_cleanup_2026_09_26';
  static TARGETS = Object.freeze([
    { key: 'ffa_versions_default', sha256: '94cf7f7e0cf3c96770557ba877250eb85c280d73b49d803635ca8fba33c7a9a6', archive: 'unscoped-version-history-2026-09-26' },
    { key: 'ffa_roster', sha256: '8a631d3fb45847cb737f2a1a3a645d2a714bb82073d95078556847d720f5a8c7', archive: 'retired-roster-keys-2026-09-26' },
    { key: 'ffa_roster_mavericks', sha256: '4f53cda18c2baa0c0354bb5f9a3ecbe5ed12ab4d8e11ba873c2f11161202b945', archive: 'retired-roster-keys-2026-09-26' },
  ]);

  /** SHA-256 of the string's UTF-8 bytes (how the archive hashed it), or null
   *  when no digest is available -- which refuses the removal. */
  static async sha256(text) {
    const subtle = globalThis.crypto && globalThis.crypto.subtle;
    if (!subtle) return null;
    const digest = await subtle.digest('SHA-256', new TextEncoder().encode(text));
    return [...new Uint8Array(digest)].map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * The receipt is a WRITE-AHEAD, per-key journal under JOURNAL. Before a key is
   * removed, its entry -- `removing`, with the verified SHA-256, byte count and
   * archive -- must be durably written; if that write fails, the key is not
   * removed. After the removal is read back, the entry becomes `removed`. A later
   * run resumes from the journal: a `removing` entry whose key is now gone is
   * completed as `removed` (the interrupted run did remove it), one whose key is
   * still present is retried, and a `removed` entry is kept as it is -- a
   * completed removal is never re-recorded as `absent` and never loses its hash,
   * size or archive. When every target is settled, the final report is written
   * under MARKER and the checkpoint never runs again. A receipt that cannot be
   * written is reported (`receipt: 'failed'`), never ignored.
   */
  static async run({ storage = (typeof localStorage !== 'undefined' ? localStorage : null),
    targets = StorageCleanup.TARGETS, marker = StorageCleanup.MARKER, journalKey = `${marker}_journal` } = {}) {
    if (!storage) return { skipped: true, report: null };
    let done = null;
    try { done = storage.getItem(marker); } catch (e) { return { skipped: true, report: null, receipt: 'unreadable' }; }
    if (done) { try { return { skipped: true, report: JSON.parse(done) }; } catch (e) { return { skipped: true, report: null, receipt: 'unreadable' }; } }

    let journal = {};
    try { journal = JSON.parse(storage.getItem(journalKey) || '{}') || {}; } catch (e) { journal = null; }
    if (!journal || typeof journal !== 'object') {
      // An unreadable journal may hold completed removals: touch nothing.
      const report = { ranAt: new Date().toISOString(), results: [], error: 'journal unreadable; nothing removed' };
      try { console.error('[storage-cleanup]', JSON.stringify(report)); } catch (e) {}
      return { skipped: false, report, receipt: 'failed' };
    }
    const writeJournal = () => { try { storage.setItem(journalKey, JSON.stringify(journal)); return true; } catch (e) { return false; } };
    const receiptErrors = [];

    const results = [];
    for (const target of targets) {
      const prior = journal[target.key] || null;
      let value;
      try { value = storage.getItem(target.key); } catch (e) { results.push({ key: target.key, status: 'failed', reason: 'read failed' }); continue; }

      if (prior && prior.status === 'removed' && value == null) { results.push(prior); continue; }
      if (prior && prior.status === 'removing' && value == null) {
        // The interrupted run removed it; its verified record is the receipt.
        journal[target.key] = { ...prior, status: 'removed', completedAt: new Date().toISOString() };
        if (!writeJournal()) receiptErrors.push(target.key);
        results.push(journal[target.key]);
        continue;
      }
      if (value == null) { results.push({ key: target.key, status: 'absent' }); continue; }

      const hash = await StorageCleanup.sha256(value);
      if (hash == null) { results.push({ key: target.key, status: 'failed', reason: 'no SHA-256 available' }); continue; }
      const bytes = new TextEncoder().encode(value).length;
      if (hash !== target.sha256) { results.push({ key: target.key, status: 'refused', reason: 'hash does not match the archive', sha256: hash, bytes }); continue; }
      let now;
      try { now = storage.getItem(target.key); } catch (e) { now = undefined; }
      if (now !== value) { results.push({ key: target.key, status: 'refused', reason: 'changed during the check', bytes }); continue; }

      // Write-ahead: no receipt, no removal.
      journal[target.key] = { key: target.key, status: 'removing', sha256: hash, bytes, archive: target.archive, startedAt: new Date().toISOString() };
      if (!writeJournal()) {
        journal[target.key] = prior;
        receiptErrors.push(target.key);
        results.push({ key: target.key, status: 'failed', reason: 'receipt could not be written; not removed' });
        continue;
      }
      try { storage.removeItem(target.key); } catch (e) { results.push({ key: target.key, status: 'failed', reason: 'remove failed' }); continue; }
      let gone = false;
      try { gone = storage.getItem(target.key) === null; } catch (e) { gone = false; }
      if (!gone) { results.push({ key: target.key, status: 'failed', reason: 'still present after removal' }); continue; }
      journal[target.key] = { ...journal[target.key], status: 'removed', completedAt: new Date().toISOString() };
      if (!writeJournal()) receiptErrors.push(target.key);   // the `removing` entry still holds the record
      results.push(journal[target.key]);
    }

    const report = { ranAt: new Date().toISOString(), results };
    let receipt = receiptErrors.length ? 'failed' : 'written';
    if (!results.some(r => r.status === 'failed') && !receiptErrors.length) {
      try { storage.setItem(marker, JSON.stringify(report)); } catch (e) { receipt = 'failed'; receiptErrors.push(marker); }
    }
    if (receiptErrors.length) report.receiptErrors = receiptErrors;
    try { (receipt === 'failed' ? console.error : console.info)('[storage-cleanup]', JSON.stringify(report)); } catch (e) {}
    return { skipped: false, report, receipt };
  }
}
