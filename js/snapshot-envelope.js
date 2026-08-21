/**
 * SnapshotEnvelope — the versioned wrapper PC-3 requires around every
 * Documents-mirror recovery snapshot (Convergence Plan Invariant #5/#6).
 * A snapshot is written ONLY from the canonical-commit path, after
 * SQLite has already accepted the write, or by an explicit coach export
 * -- never speculatively, and never as a normal read authority.
 *
 * The envelope carries enough identity/count/checksum information for
 * the EXPLICIT recovery flow (a coach-triggered scan, never automatic)
 * to preview a candidate and reject a corrupt/tampered/mismatched one
 * BEFORE importing it, without first having to trust-and-parse the
 * whole season body.
 *
 * Pure and DOM-free -- no filesystem access, no SqlCatalog dependency,
 * no external hashing library (this codebase's standing "no external
 * libraries" rule). wrap()/unwrap() are total functions: wrap() never
 * throws on a well-formed season object, and unwrap() never throws on
 * ANY input -- a malformed/legacy/tampered snapshot is reported through
 * the returned `{ ok:false, reason }` shape, never as an exception the
 * caller must remember to catch.
 */
export const SnapshotEnvelope = {
  VERSION: 1,

  /**
   * A short, deterministic, dependency-free content checksum. Two
   * independent 32-bit FNV-1a lanes (one seeded on plain content, one on
   * content interleaved with position) concatenated to 16 hex chars --
   * enough to catch accidental corruption and casual tampering for a
   * RECOVERY-PREVIEW gate. This is integrity verification for a local
   * snapshot file, not a cryptographic security boundary.
   */
  checksum(data) {
    const s = SnapshotEnvelope._stableStringify(data);
    let h1 = 0x811c9dc5, h2 = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      const c = s.charCodeAt(i);
      h1 ^= c; h1 = Math.imul(h1, 0x01000193);
      h2 ^= (c + i) & 0xff; h2 = Math.imul(h2, 0x01000193);
    }
    return (h1 >>> 0).toString(16).padStart(8, '0') + (h2 >>> 0).toString(16).padStart(8, '0');
  },

  /** Deterministic stringify — object keys sorted so field order never moves the checksum. */
  _stableStringify(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(SnapshotEnvelope._stableStringify).join(',') + ']';
    const keys = Object.keys(value).sort();
    return '{' + keys.map(k => JSON.stringify(k) + ':' + SnapshotEnvelope._stableStringify(value[k])).join(',') + '}';
  },

  _counts(data) {
    const games = Array.isArray(data && data.games) ? data.games : [];
    let plays = 0;
    for (const g of games) plays += Array.isArray(g && g.plays) ? g.plays.length : 0;
    return { gameCount: games.length, playCount: plays };
  },

  /**
   * Wrap a season object for a Documents-mirror snapshot write.
   *
   * `revision` is a RECENCY MARKER for the explicit recovery preview to
   * compare against the live catalog's own `updated` timestamp -- it is
   * deliberately NOT the strict per-write monotonic counter that PC-4's
   * revision-fenced-autosave work introduces for rejecting stale writes;
   * that is explicitly out of this checkpoint's scope. Defaults to the
   * season's own `updated` field when present.
   */
  wrap(seasonId, data, { revision } = {}) {
    const { gameCount, playCount } = SnapshotEnvelope._counts(data);
    return {
      envelopeVersion: SnapshotEnvelope.VERSION,
      seasonId,
      revision: revision || (data && data.updated) || new Date().toISOString(),
      timestamp: new Date().toISOString(),
      gameCount,
      playCount,
      checksum: SnapshotEnvelope.checksum(data),
      data,
    };
  },

  /**
   * Unwrap + VALIDATE a snapshot read back off disk. Never throws.
   *
   * Returns `{ ok:true, envelope }` only when every declared field
   * (identity, counts, checksum) agrees with the enclosed data.
   * Returns `{ ok:false, reason, ... }` for anything else:
   *   - 'not-an-object' / 'unrecognized'  — not JSON-shaped at all
   *   - 'legacy-unenveloped'              — a bare pre-PC-3 season.json
   *     (carries `data: raw` so a caller MAY still offer it, explicitly,
   *     rather than the file being silently invisible to recovery)
   *   - 'unsupported-version'             — a newer/older envelope format
   *   - 'malformed'                       — missing seasonId/data/games
   *   - 'count-mismatch' / 'checksum-mismatch' — declared vs. actual disagree
   *   - 'identity-mismatch'               — data.id != envelope.seasonId
   */
  unwrap(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' };
    if (!raw.envelopeVersion) {
      if (Array.isArray(raw.games)) return { ok: false, reason: 'legacy-unenveloped', data: raw };
      return { ok: false, reason: 'unrecognized' };
    }
    if (raw.envelopeVersion !== SnapshotEnvelope.VERSION) return { ok: false, reason: 'unsupported-version', declaredVersion: raw.envelopeVersion };
    if (!raw.seasonId || !raw.data || !Array.isArray(raw.data.games)) return { ok: false, reason: 'malformed' };
    const { gameCount, playCount } = SnapshotEnvelope._counts(raw.data);
    if (gameCount !== raw.gameCount || playCount !== raw.playCount) {
      return { ok: false, reason: 'count-mismatch', declared: { gameCount: raw.gameCount, playCount: raw.playCount }, actual: { gameCount, playCount } };
    }
    const actualChecksum = SnapshotEnvelope.checksum(raw.data);
    if (actualChecksum !== raw.checksum) {
      return { ok: false, reason: 'checksum-mismatch', declared: raw.checksum, actual: actualChecksum };
    }
    if (String(raw.data.id || '') !== String(raw.seasonId)) {
      return { ok: false, reason: 'identity-mismatch', declaredSeasonId: raw.seasonId, dataId: raw.data.id };
    }
    return { ok: true, envelope: raw };
  },
};
