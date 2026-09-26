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
 * back. Nothing is restored, assigned or converted. The outcome is recorded
 * under MARKER so the checkpoint runs once; a failed removal leaves no marker
 * and is retried on the next launch.
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

  static async run({ storage = (typeof localStorage !== 'undefined' ? localStorage : null),
    targets = StorageCleanup.TARGETS, marker = StorageCleanup.MARKER } = {}) {
    if (!storage) return { skipped: true, report: null };
    let done = null;
    try { done = storage.getItem(marker); } catch (e) { return { skipped: true, report: null }; }
    if (done) { try { return { skipped: true, report: JSON.parse(done) }; } catch (e) { return { skipped: true, report: null }; } }

    const results = [];
    for (const target of targets) {
      let value;
      try { value = storage.getItem(target.key); } catch (e) { results.push({ key: target.key, status: 'failed', reason: 'read failed' }); continue; }
      if (value == null) { results.push({ key: target.key, status: 'absent' }); continue; }
      const hash = await StorageCleanup.sha256(value);
      if (hash == null) { results.push({ key: target.key, status: 'failed', reason: 'no SHA-256 available' }); continue; }
      const bytes = new TextEncoder().encode(value).length;
      if (hash !== target.sha256) { results.push({ key: target.key, status: 'refused', reason: 'hash does not match the archive', sha256: hash, bytes }); continue; }
      // The digest awaited: the value must still be the one that was checked.
      let now;
      try { now = storage.getItem(target.key); } catch (e) { now = undefined; }
      if (now !== value) { results.push({ key: target.key, status: 'refused', reason: 'changed during the check', bytes }); continue; }
      try { storage.removeItem(target.key); } catch (e) { results.push({ key: target.key, status: 'failed', reason: 'remove failed' }); continue; }
      let gone = false;
      try { gone = storage.getItem(target.key) === null; } catch (e) { gone = false; }
      results.push(gone
        ? { key: target.key, status: 'removed', sha256: hash, bytes, archive: target.archive }
        : { key: target.key, status: 'failed', reason: 'still present after removal' });
    }
    const report = { ranAt: new Date().toISOString(), results };
    if (!results.some(r => r.status === 'failed')) {
      try { storage.setItem(marker, JSON.stringify(report)); } catch (e) {}
    }
    try { console.info('[storage-cleanup]', JSON.stringify(report)); } catch (e) {}
    return { skipped: false, report };
  }
}
