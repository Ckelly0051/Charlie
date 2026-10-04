/**
 * SnapshotEnvelope: the versioned wrapper around every Documents-mirror
 * recovery snapshot. A snapshot is written only after the catalog accepted a
 * commit, or by an explicit coach export; it is never a normal read source.
 *
 * The envelope carries identity, counts and a checksum so the explicit
 * recovery flow can preview a candidate and reject a corrupt, tampered or
 * mismatched one before importing it.
 *
 * Pure and DOM-free, with no hashing library. wrap() never throws on a
 * well-formed season; unwrap() never throws on any input and reports a bad
 * snapshot as `{ ok:false, reason }`.
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
   * `revision` is the season's commit counter (`data.revision`), so recovery
   * compares a candidate to the live season by commit order, not clock time.
   * The timestamp fallback covers a season or bare object without one.
   */
  wrap(seasonId, data, { revision } = {}) {
    const { gameCount, playCount } = SnapshotEnvelope._counts(data);
    const committed = (data && Number.isInteger(data.revision) && data.revision >= 0) ? data.revision : null;
    let stamp = revision;
    if (stamp == null) stamp = committed;
    if (stamp == null) stamp = (data && data.updated) || new Date().toISOString();
    return {
      envelopeVersion: SnapshotEnvelope.VERSION,
      seasonId,
      revision: stamp,
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
   *   - 'old-format'                      — a bare pre-envelope season.json
   *     (an old format: listed by recovery, never read or imported)
   *   - 'unsupported-version'             — a newer/older envelope format
   *   - 'malformed'                       — missing seasonId/data/games
   *   - 'count-mismatch' / 'checksum-mismatch' — declared vs. actual disagree
   *   - 'identity-mismatch'               — data.id != envelope.seasonId
   */
  unwrap(raw) {
    if (!raw || typeof raw !== 'object') return { ok: false, reason: 'not-an-object' };
    if (!raw.envelopeVersion) {
      if (Array.isArray(raw.games)) return { ok: false, reason: 'old-format' };
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
