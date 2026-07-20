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

  /** E3b/E4/E4-2: legacy plays carry MULTIPLE dimensions inside ONE stored
   *  field — an alignment inside `formation` (and, rarely, `backfield`), a
   *  receiver-count concept ('Empty') inside `formation`, a family inside
   *  `coverage`. Projection derives the sibling FROM that string, so
   *  overwriting the primary field on an edit would silently destroy it. ONE
   *  descriptor per relationship makes the defence STRUCTURAL rather than a
   *  per-field special case, and keeps every consumer (Film Room's grid
   *  editor, the tag form) from drifting apart.
   *
   *  Shape: primary key -> ARRAY of sibling descriptors (a primary can embed
   *  more than one sibling's legacy token — Formation alone embeds both a QB
   *  Alignment token and a Backfield/'Empty' token). Per descriptor:
   *    sibling     — the projected field to materialize BEFORE overwriting the primary
   *    excludeFrom — the TagProjection list whose values belong to the sibling and
   *                  must never be offered in the primary's picker
   *
   *  `backfield` appears on BOTH sides at once: it is a SIBLING of `formation`
   *  (receives 'Empty' when formation had it and backfield was blank) AND a
   *  PRIMARY in its own right for `qbAlignment` (a legacy 'Pistol' can still be
   *  embedded in backfield's raw string). `reconcileSiblings` below handles
   *  both directions generically — no per-relationship special-casing needed
   *  in either consumer.
   *
   *  E4-2 extended this from the E4 shape (one sibling per primary) to enable
   *  safely moving 'Empty' out of Formation into Backfield and 'Pistol' out of
   *  Backfield into QB Alignment — this descriptor is deliberately extended
   *  and proven FIRST, before either library actually changes (see the E4-2
   *  handoff note). Adding a new relationship here wires promote+strip for
   *  every consumer at once; each consumer's test harness asserts every
   *  registered relationship is covered, so a new one cannot ship untested. */
  static PROJECTED_PAIRS = {
    formation: [
      { sibling: 'qbAlignment', excludeFrom: 'QB_ALIGNMENTS' },
      { sibling: 'backfield',   excludeFrom: 'FORMATION_BACKFIELD_TOKENS' },
    ],
    backfield: [
      { sibling: 'qbAlignment', excludeFrom: 'QB_ALIGNMENTS' },
    ],
    coverage: [
      { sibling: 'coverageFamily', excludeFrom: 'COVERAGE_FAMILIES' },
    ],
  };

  static _split(v) {
    return typeof v === 'string' ? v.split(' + ').map(s => s.trim()).filter(Boolean) : [];
  }
  static _isAlignment(v) { return this.QB_ALIGNMENTS.includes(v); }

  /** Reverse of PROJECTED_PAIRS: given a sibling key, return the ARRAY of
   *  primary keys that may embed its legacy token. `qbAlignment` has TWO
   *  (`formation` and `backfield`); `backfield` and `coverageFamily` each have
   *  ONE. E4 review fix, extended plural in E4-2 for the multi-primary case. */
  static primariesForSibling(siblingKey) {
    const primaries = [];
    for (const [primary, pairs] of Object.entries(this.PROJECTED_PAIRS)) {
      if (pairs.some(pair => pair.sibling === siblingKey)) primaries.push(primary);
    }
    return primaries;
  }

  /**
   * E4 review fix (Codex), extended in E4-2 for multi-sibling primaries: a
   * coach's explicit commit on a SIBLING field — including CLEARING it —
   * must survive a reload. project()'s precedence only re-derives a sibling
   * from a primary when the sibling itself is blank, so writing '' has
   * nothing to override: the primary's still-embedded legacy token would
   * simply win again on the very next read, and the coach's clear silently
   * would not stick. The fix is to strip exactly THIS sibling's own token(s)
   * out of the given primary's RAW stored value at the same moment the
   * sibling is committed — scoped by BOTH primaryKey and siblingKey so a
   * primary with more than one registered relationship (Formation ->
   * QB Alignment AND Formation -> Backfield) never cross-strips the other
   * relationship's tokens. A no-op when there is no token to strip.
   */
  static stripSiblingToken(primaryKey, siblingKey, rawValue) {
    const pairs = this.PROJECTED_PAIRS[primaryKey];
    const pair = pairs && pairs.find(p => p.sibling === siblingKey);
    if (!pair || typeof rawValue !== 'string') return rawValue;
    const tokens = this[pair.excludeFrom];
    if (primaryKey === 'coverage') {
      // Single ATOMIC value: the whole field IS the family token when it
      // matches — Coverage never coexists with a shell AND a family at once.
      return tokens.includes(rawValue) ? '' : rawValue;
    }
    // Multi-value (formation) or defensively-split single-value (backfield,
    // per E2-R2 — a malformed multi-value string still gets its alignment
    // token removed): drop only this pair's tokens, keep everything else.
    return this._split(rawValue).filter(p => !tokens.includes(p)).join(' + ');
  }

  /**
   * E4-2 review fix: a field's raw stored value can hold a legacy token that
   * belongs to a DIFFERENT relationship than the one currently being checked
   * — `backfield` can be a SIBLING of `formation` (for 'Empty') while ALSO
   * being a PRIMARY in its own right (for `qbAlignment`, via a legacy
   * 'Pistol'). Before promoting into a sibling, `reconcileSiblings` must ask
   * "does this field have genuine content of ITS OWN?", not "is its raw
   * string non-empty?" — a raw 'Pistol' is not real backfield content once
   * Pistol is exclusively QB-alignment vocabulary; treating it as such
   * permanently blocked the Formation -> Backfield Empty promotion (the raw
   * value never looked "blank"), and losing that race meant Formation's own
   * Empty token got self-cleaned away in the SAME commit with nowhere left to
   * land — total data loss for a real "Pistol backfield + Empty formation"
   * play. Strips every one of `key`'s OWN registered pairs' tokens (if it has
   * any as a primary) before the blank check; a no-op for fields that are
   * never a primary (qbAlignment, coverageFamily).
   */
  static _ownStructuralValue(key, tags) {
    const raw = tags[key];
    if (typeof raw !== 'string') return '';
    const pairs = this.PROJECTED_PAIRS[key];
    if (!pairs) return raw;
    let value = raw;
    for (const pair of pairs) value = this.stripSiblingToken(key, pair.sibling, value);
    return value;
  }

  /**
   * THE single promote-then-strip commit mechanic (E4/E4-2) — shared by the
   * tag form's per-field save (`PlayTagger._saveField`), its whole-play
   * canonicalization (`PlayTagger.commitProjectedLook`), and Film Room's grid
   * inline editor (`PlayGrid._applyEdit`), so all three call sites use one
   * algorithm instead of drifting copies. Mutates `play.tags` in place for
   * every field OTHER than `key` itself — the caller still writes
   * `play.tags[key] = <the coach's new value>` afterward, once every other
   * field has been protected.
   *
   *  - FORWARD: if `key` is a PRIMARY with registered sibling relationships
   *    (formation, backfield, coverage), promote each relationship's sibling
   *    from the CURRENTLY EFFECTIVE projected value, but ONLY when that
   *    sibling is still blank (an existing explicit sibling always wins,
   *    never overwritten).
   *  - REVERSE: if `key` is a SIBLING (qbAlignment, backfield,
   *    coverageFamily — note `backfield` can be EITHER role depending on
   *    which relationship fired), strip `key`'s own token out of EVERY
   *    primary that may still embed it. `qbAlignment` has two possible
   *    primaries; both are checked.
   *
   * A key can be a primary and a sibling at once (`backfield`): both branches
   * run, in the same call, before the caller's own write — exactly one
   * field-level-merge commit, exactly one undoable transaction.
   *
   * Returns true if anything besides `key` was mutated.
   */
  static reconcileSiblings(play, key) {
    let changed = false;
    const pairs = this.PROJECTED_PAIRS[key];
    if (pairs) {
      for (const pair of pairs) {
        // "Is the sibling already blank?" must check its OWN STRUCTURAL value
        // (with any of ITS OWN registered tokens stripped), not the raw stored
        // value — a sibling can itself be a PRIMARY with an unrelated legacy
        // token embedded (Backfield's raw 'Pistol' belongs to Backfield's OWN
        // qbAlignment relationship, not to Formation's Empty relationship).
        // Checking raw treated 'Pistol' as "already explicit", permanently
        // blocking the Empty promotion — and since Formation's raw Empty token
        // gets stripped in this SAME commit regardless (self-clean, below),
        // the Empty information was lost from BOTH fields at once. Checking
        // the structural value correctly recognizes backfield as having NO
        // real content of its own here, so Empty still gets promoted in.
        if (!String(this._ownStructuralValue(pair.sibling, play.tags) || '').trim()) {
          const effective = this.project(play.tags)[pair.sibling];
          if (effective) { play.tags[pair.sibling] = effective; changed = true; }
        }
      }
    }
    for (const primaryKey of this.primariesForSibling(key)) {
      const stripped = this.stripSiblingToken(primaryKey, key, play.tags[primaryKey]);
      if (stripped !== play.tags[primaryKey]) { play.tags[primaryKey] = stripped; changed = true; }
    }
    return changed;
  }

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
