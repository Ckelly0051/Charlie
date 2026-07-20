/**
 * SuggestionEngine - Learns formation/personnel/playType patterns from
 * already-tagged plays in the current game and pre-fills empty fields
 * with the most-likely value when the user picks a related field.
 *
 * Behavior:
 *   - When user changes Formation, if Personnel is empty, suggest most-common
 *     personnel for that formation. Same for PlayType→DefFront→Coverage.
 *   - Suggestions are *applied* to the empty field with a brief yellow flash
 *     so the user can see (and override). Never overrides a non-empty value.
 *   - A small "💡 N" badge in the panel header shows how many fields were
 *     auto-filled in the current play.
 *
 * UX rule: Only fires once per play per field. After the user manually edits
 * a field, that field is locked for that play.
 */
export class SuggestionEngine {
  constructor(playTagger) {
    this.tagger = playTagger;
    this.enabled = true;
    this.suggestedThisPlay = new Set();  // 'playId:field' tracking
    this.suggestionCount = 0;

    this.toggleEl = document.getElementById('btnToggleSuggestions');
    this.badgeEl = document.getElementById('suggestionBadge');

    this._bindEvents();
  }

  _bindEvents() {
    if (this.toggleEl) {
      this.toggleEl.addEventListener('change', () => {
        this.enabled = this.toggleEl.checked;
      });
    }

    // Hook field-change events to fire suggestions
    const fields = this.tagger.tagFields;
    if (fields.formation) {
      fields.formation.addEventListener('change', () => this._afterChange('formation'));
    }
    if (fields.personnel) {
      fields.personnel.addEventListener('change', () => this._afterChange('personnel'));
    }
    if (fields.playType) {
      fields.playType.addEventListener('change', () => this._afterChange('playType'));
    }
    if (fields.defFront) {
      fields.defFront.addEventListener('change', () => this._afterChange('defFront'));
    }

    // Reset per-play tracking when a new play is selected
    this.tagger.on('play-selected', () => {
      this.suggestionCount = 0;
      this._updateBadge();
    });
  }

  _afterChange(changedField) {
    if (!this.enabled) return;
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    const tags = play.tags;

    // Suggestion rules — chained
    if (changedField === 'formation') {
      this._suggestField(play, 'personnel', { formation: tags.formation });
    } else if (changedField === 'personnel') {
      // personnel change — no further auto-fill (playType is always manual)
    } else if (changedField === 'playType') {
      this._suggestField(play, 'defFront', { playType: tags.playType });
      this._suggestField(play, 'coverage', { playType: tags.playType });
    }
  }

  _suggestField(play, field, conditions) {
    if (play.tags[field]) return; // never override
    const key = `${play.id}:${field}`;
    if (this.suggestedThisPlay.has(key)) return;

    const value = this._mostLikely(field, conditions);
    if (!value) return;

    play.tags[field] = value;
    const el = this.tagger.tagFields[field];
    if (el) {
      el.value = value;
      this._flash(el);
      this._addSuggestionHint(el, conditions);
    }
    this.suggestedThisPlay.add(key);
    this.suggestionCount++;
    this._updateBadge();
    this.tagger._emit('play-updated', play);
  }

  /**
   * Among already-tagged plays in this game, find the most common value of `field`
   * matching all `conditions` (e.g. {formation: 'Shotgun'}). Returns null if
   * fewer than 2 historical plays match (not enough signal).
   */
  _mostLikely(field, conditions) {
    const matches = this.tagger.plays.filter(p => {
      if (!p.tags[field]) return false;
      for (const [k, v] of Object.entries(conditions)) {
        if (!v) continue;
        if (p.tags[k] !== v) return false;
      }
      return true;
    });
    if (matches.length < 2) return null;

    const counts = {};
    matches.forEach(p => {
      const v = p.tags[field];
      counts[v] = (counts[v] || 0) + 1;
    });
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    // Require the top choice to make up at least 40% of matches
    const top = sorted[0];
    if (top[1] / matches.length < 0.4) return null;
    return top[0];
  }

  // PRE-EXISTING bug, found (not introduced) while building E4's tag-form
  // proofs: all three of _suggestField's real targets (personnel, defFront,
  // coverage) are chip-group fields, so `this.tagger.tagFields[field]` is
  // always a ChipField WRAPPER, never a raw DOM element — .classList/.title
  // don't exist on it. `el.value = value` (the actual suggestion) worked fine
  // (ChipField has a value setter), so the suggestion silently applied; only
  // the cosmetic flash+tooltip crashed immediately after, every time this ran.
  // Unwrap to the real DOM node the same way ChipField itself is defined
  // (`this.el` in its constructor) when present.
  _domEl(el) { return el && el.el ? el.el : el; }

  _flash(el) {
    const node = this._domEl(el);
    node.classList.add('field-suggested');
    setTimeout(() => node.classList.remove('field-suggested'), 1200);
  }

  _addSuggestionHint(el, conditions) {
    const condText = Object.entries(conditions).filter(([, v]) => v).map(([k, v]) => `${k}=${v}`).join(', ');
    this._domEl(el).title = `Suggested from ${condText} (click to change)`;
  }

  _updateBadge() {
    if (!this.badgeEl) return;
    if (this.suggestionCount > 0) {
      this.badgeEl.textContent = `💡 ${this.suggestionCount}`;
      this.badgeEl.style.display = '';
    } else {
      this.badgeEl.style.display = 'none';
    }
  }
}
