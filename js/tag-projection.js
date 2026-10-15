/* Plain look-field reads and reserved vocabulary for pickers/format validation.
 * Fields are stored separately; presentation lookLabel composes them without inference. */
export class TagProjection {
  // QB alignments: their own field, never a Formation or Backfield value.
  static QB_ALIGNMENTS = ['Under Center', 'Shotgun', 'Pistol'];
  // Coverage families: their own field, never a Coverage call.
  static COVERAGE_FAMILIES = ['Man', 'Zone', 'Match'];
  // 'Empty' is a Backfield value, never a Formation value.
  static FORMATION_BACKFIELD_TOKENS = ['Empty'];

  /** Values a field's picker must never offer, because they belong to another
   *  field: the Formation offers no alignment and no 'Empty', Backfield
   *  no alignment, the Coverage call no family. */
  static PICKER_EXCLUDE = Object.freeze({
    formationFamily: [...TagProjection.QB_ALIGNMENTS, ...TagProjection.FORMATION_BACKFIELD_TOKENS, 'Unbalanced'],
    backfield: [...TagProjection.QB_ALIGNMENTS],
    coverage: [...TagProjection.COVERAGE_FAMILIES],
  });

  static _split(v) {
    return typeof v === 'string' ? v.split(' + ').map(s => s.trim()).filter(Boolean) : [];
  }

  /** True when a field holds a value that belongs to another field -- the old
   *  combined shape. Used only to refuse old files (SeasonFormat). */
  static isCombined(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const f = this._split(t.formationFamily), b = this._split(t.backfield);
    return (typeof t.formationFamily === 'string' && t.formationFamily.includes('+')) || f.some(p => this.PICKER_EXCLUDE.formationFamily.includes(p))
      || b.some(p => this.PICKER_EXCLUDE.backfield.includes(p))
      || this.PICKER_EXCLUDE.coverage.includes(typeof t.coverage === 'string' ? t.coverage : '');
  }

  /** The look as stored: every look field present, blank when uncharted. */
  static project(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const s = v => (typeof v === 'string' ? v : '');
    return { ...t, qbAlignment: s(t.qbAlignment), formationFamily: s(t.formationFamily), receiverSet: s(t.receiverSet),
      backfield: s(t.backfield), coverage: s(t.coverage), coverageFamily: s(t.coverageFamily) };
  }

  /**
   * PRESENTATION label for a play's pre-snap look, e.g. "Shotgun Spread 3x1": a
   * call sheet, a cut-up overlay and a play-strip caption name the call the way
   * a coach says it. Column-shaped surfaces keep each field in its own cell and
   * must not use this. Analytics never reads it.
   */
  static lookLabel(tags) {
    const p = this.project(tags);
    return [p.qbAlignment, p.formationFamily, p.receiverSet].filter(Boolean).join(' ');
  }
}
