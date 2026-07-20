/**
 * Read-time tag projection — the single source of truth for reading a play's
 * pre-snap look after the BETA-005/006 model split (GRIDIRON-IQ-TAG-MODEL.md §5).
 *
 * Legacy plays charted QB alignment INTO `formation` (and, rarely, `Pistol` into
 * `backfield`) and coverage family INTO `coverage`, because the old single field
 * forced it. This module READS such a play in the four correct dimensions and
 * removes the wrong-field token from the old dimension. It NEVER writes: it
 * returns a new object; the stored play is untouched. Every analytics/UI consumer
 * (E3/E4) must read a play's look through `project()` — no consumer may parse
 * `formation` for alignment itself.
 *
 * Pure, DOM-free, Node-testable — same mold as special-teams.js / football-rules.js.
 */
export class TagProjection {
  // The three QB-alignment values, wrong in BOTH `formation` and `backfield` (D1).
  static QB_ALIGNMENTS = ['Under Center', 'Shotgun', 'Pistol'];
  // Coverage family values, wrong in `coverage` (D2/E1-R8: Match included).
  static COVERAGE_FAMILIES = ['Man', 'Zone', 'Match'];
  // The one backfield value that legacy data stored in `formation` (D2).
  static FORMATION_BACKFIELD_TOKENS = ['Empty'];

  static _split(v) {
    return typeof v === 'string' ? v.split(' + ').map(s => s.trim()).filter(Boolean) : [];
  }
  static _isAlignment(v) { return this.QB_ALIGNMENTS.includes(v); }

  /**
   * Return a projected READ-VIEW of `tags`. Input is never mutated. Missing
   * `qbAlignment`/`coverageFamily` properties read as blank (E1-R2: legacy plays
   * lack them entirely — consumers must not assume the key exists).
   */
  static project(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const out = { ...t };

    // --- Formation: split off alignment tokens and the Empty backfield token. ---
    const fParts = this._split(t.formation);
    const alignInFormation = fParts.filter(p => this._isAlignment(p));
    const emptyInFormation = fParts.some(p => this.FORMATION_BACKFIELD_TOKENS.includes(p));
    const structure = fParts.filter(p => !this._isAlignment(p) && !this.FORMATION_BACKFIELD_TOKENS.includes(p));

    // --- Backfield: strip alignment tokens UNCONDITIONALLY (E2-R2). Backfield is
    //     single-value in normal data, but a malformed/imported multi-value string
    //     (`Pistol + Diamond`) must have its alignment token removed too — split it
    //     symmetrically with formation rather than matching the whole value. ---
    const bfParts = this._split(t.backfield);
    const alignInBackfield = bfParts.filter(p => this._isAlignment(p));
    const bfStructure = bfParts.filter(p => !this._isAlignment(p));

    // --- qbAlignment supply precedence (E1-R8): explicit > first formation token
    //     > backfield alignment token. Explicit is never overwritten. ---
    let qb = typeof t.qbAlignment === 'string' ? t.qbAlignment : '';
    if (!qb) qb = alignInFormation[0] || '';
    if (!qb) qb = alignInBackfield[0] || '';

    // Backfield projected: alignment tokens removed; supply Empty from formation
    // only when the backfield is otherwise blank (never overwrite a deliberate pick).
    let backfield = bfStructure.join(' + ');
    if (!backfield && emptyInFormation) backfield = 'Empty';

    // --- Coverage (single-value): a family token IS the whole value. ---
    const covRaw = typeof t.coverage === 'string' ? t.coverage : '';
    const covIsFamily = this.COVERAGE_FAMILIES.includes(covRaw);
    let family = typeof t.coverageFamily === 'string' ? t.coverageFamily : '';
    if (!family && covIsFamily) family = covRaw;

    out.qbAlignment = qb;
    out.formation = structure.join(' + ');
    out.backfield = backfield;
    out.coverage = covIsFamily ? '' : covRaw;
    out.coverageFamily = family;
    return out;
  }

  /**
   * E3b — PRESENTATION label for a play's pre-snap look, e.g. "Shotgun Trips".
   *
   * DELIBERATE COMPOSITION, stated here because it is the one place the two
   * dimensions are intentionally rejoined: a call sheet, a cut-up overlay, and a
   * play-strip caption name the call the way a coach SAYS it, in one phrase. That
   * is not the same job as a Formation COLUMN, which must never show an alignment
   * under a Formation header (the coach's Film Room ruling — a column implies a
   * classification, a spoken call does not). Column-shaped surfaces therefore keep
   * projected `formation` and `qbAlignment` in separate cells and must NOT use this.
   *
   * Analytics never reads this: it is a string for humans, never a grouping key.
   * Order is alignment-then-structure, and either half may be absent — a play with
   * only "Trips" reads "Trips", and one with only "Shotgun" reads "Shotgun".
   *
   * Projected `formation` is itself a " + "-joined MULTI-value string when the
   * coach charted more than one structural tag (e.g. "Flexbone + Trips"). A naive
   * `[qbAlignment, formation].join(' ')` therefore leaks that internal storage
   * delimiter into the phrase ("Shotgun Flexbone + Trips") — re-split every
   * structural token and join the WHOLE phrase with plain spaces so no "+" ever
   * reaches a human-facing surface.
   */
  static lookLabel(tags) {
    const p = this.project(tags);
    return [p.qbAlignment, ...this._split(p.formation)].filter(Boolean).join(' ');
  }
}
