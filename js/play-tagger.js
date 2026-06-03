/**
 * ChipField — lightweight wrapper so a div.pick-group behaves like a
 * <select> for the rest of the tagger: .value get/set, change events.
 */
class ChipField {
  constructor(el) {
    this.el = el;
    this._value = '';
    this._listeners = {};
    this.chips = [...el.querySelectorAll('[data-value]')];
    this.chips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const v = chip.dataset.value;
        this.value = this._value === v ? '' : v;
        this._fire('change');
      });
    });
  }
  get value() { return this._value; }
  set value(v) {
    this._value = v || '';
    this.chips.forEach(c => c.classList.toggle('active', c.dataset.value === this._value));
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _fire(event) {
    (this._listeners[event] || []).forEach(fn => fn());
  }
}

/**
 * PlayTagger - Manages play segmentation, categorization, and timeline display.
 */
export class PlayTagger {
  constructor(videoController) {
    this.vc = videoController;
    this.plays = [];
    this.currentPlayId = null;
    this.pendingStart = null;
    this.listeners = {};
    this.nextId = 1;

    this.playSelect = document.getElementById('playSelect');
    this.btnMarkStart = document.getElementById('btnMarkStart');
    this.btnMarkEnd = document.getElementById('btnMarkEnd');
    this.btnDeletePlay = document.getElementById('btnDeletePlay');
    this.btnClearTags = document.getElementById('btnClearTags');
    this.timelineBar = document.getElementById('timelineBar');

    // Tag form elements — chip groups wrapped as ChipField, inputs used directly
    const fieldMap = {
      down: 'tagDown', distance: 'tagDistance', formation: 'tagFormation',
      playType: 'tagPlayType', defFront: 'tagDefFront', coverage: 'tagCoverage',
      blitz: 'tagBlitz', result: 'tagResult', yardage: 'tagYardage',
      hash: 'tagHash', quarter: 'tagQuarter', yardLine: 'tagYardLine',
      fieldSide: 'tagFieldSide', personnel: 'tagPersonnel',
      driveNumber: 'tagDriveNumber', stType: 'tagStType',
    };
    this.tagFields = {};
    for (const [key, id] of Object.entries(fieldMap)) {
      const el = document.getElementById(id);
      this.tagFields[key] = el?.classList.contains('pick-group') ? new ChipField(el) : el;
    }

    // Per-play player attribution (jersey #) by role.
    this.playerFields = {
      ballCarrier: document.getElementById('tagPlayerBC'),
      passer: document.getElementById('tagPlayerPasser'),
      receiver: document.getElementById('tagPlayerReceiver'),
      tackler: document.getElementById('tagPlayerTackler'),
      kicker: document.getElementById('tagPlayerKicker'),
      returner: document.getElementById('tagPlayerReturner'),
    };

    // Per-play player grading (+/- per snap).
    this.gradeFields = {
      ballCarrier: document.getElementById('tagGradeBC'),
      passer: document.getElementById('tagGradePasser'),
      receiver: document.getElementById('tagGradeReceiver'),
      tackler: document.getElementById('tagGradeTackler'),
      kicker: document.getElementById('tagGradeKicker'),
      returner: document.getElementById('tagGradeReturner'),
    };

    // Unit toggle (Offense / Defense / Special Teams) — drives the tag-form
    // layout per play. Stored on play.tags.unit; defaults from Game Info
    // perspective via this.defaultUnit (set by App).
    this.tagForm = document.getElementById('tagForm');
    const unitEl = document.getElementById('tagUnit');
    this.unitField = unitEl ? new ChipField(unitEl) : null;
    this.defaultUnit = 'offense';

    // Auto down & distance: when advancing to the next (untagged) play, pre-fill
    // its down/distance/field position from the previous play's result.
    this.autoDD = (typeof localStorage === 'undefined')
      || localStorage.getItem('ffa_auto_dd') !== '0';

    this.tagChips = document.getElementById('tagChips');
    this.customTagInput = document.getElementById('customTagInput');

    this.btnNewDrive = document.getElementById('btnNewDrive');
    this.currentDrive = 1;

    this._bindEvents();

    // Lay the form out for the default side before any play is selected,
    // otherwise every side group would be visible at once.
    if (this.unitField) this.unitField.value = this.defaultUnit;
    this.applyUnitMode(this.defaultUnit);
  }

  _bindEvents() {
    this.btnMarkStart.addEventListener('click', () => this.markStart());
    this.btnMarkEnd.addEventListener('click', () => this.markEnd());
    this.btnDeletePlay.addEventListener('click', () => this.deleteCurrentPlay());
    if (this.btnClearTags) {
      this.btnClearTags.addEventListener('click', () => this.clearCurrentTags());
    }
    this.playSelect.addEventListener('change', () => {
      const id = parseInt(this.playSelect.value);
      if (id) this.selectPlay(id);
    });

    // Tag form changes — save only the changed field, not all fields,
    // so clicking one chip doesn't overwrite other fields with stale values.
    for (const [key, el] of Object.entries(this.tagFields)) {
      el.addEventListener('change', () => this._saveField(key));
    }

    // Player-role inputs save into play.tags.players.
    for (const [role, el] of Object.entries(this.playerFields)) {
      if (!el) continue;
      el.addEventListener('change', () => this._savePlayer(role));
    }

    // Grade selects save into play.tags.grades.
    for (const [role, el] of Object.entries(this.gradeFields)) {
      if (!el) continue;
      el.addEventListener('change', () => this._saveGrade(role));
    }

    // Unit toggle: save the side on the play and re-lay-out the form.
    if (this.unitField) {
      this.unitField.addEventListener('change', () => {
        const play = this.getCurrentPlay();
        // The toggle always keeps a side selected — re-tapping the active
        // side would otherwise clear it, so fall back to the current value.
        let unit = this.unitField.value;
        if (!unit) {
          unit = (play && play.tags.unit) || this.defaultUnit || 'offense';
          this.unitField.value = unit;
        }
        if (play) {
          play.tags.unit = unit;
          this._emit('play-updated', play);
        }
        this.applyUnitMode(unit);
      });
    }

    // Collapsible secondary side groups (e.g. "Defense Faced" while charting
    // offense). Clicking the group header toggles its body.
    if (this.tagForm) {
      this.tagForm.querySelectorAll('.tag-group-head').forEach(head => {
        head.addEventListener('click', () => {
          head.parentElement.classList.toggle('collapsed');
        });
      });
    }

    // New Drive button
    if (this.btnNewDrive) {
      this.btnNewDrive.addEventListener('click', () => {
        this.currentDrive++;
        if (this.tagFields.driveNumber) this.tagFields.driveNumber.value = this.currentDrive;
        this._saveCurrentTags();
      });
    }

    // Custom tag input
    this.customTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = this.customTagInput.value.trim();
        if (tag && this.currentPlayId) {
          const play = this.getPlay(this.currentPlayId);
          if (play && !play.tags.custom.includes(tag)) {
            play.tags.custom.push(tag);
            this._renderCustomTags(play.tags.custom);
            this._emit('play-updated', play);
          }
          this.customTagInput.value = '';
        }
      }
    });
  }

  markStart() {
    this.pendingStart = this.vc.currentTime;
    this.btnMarkStart.textContent = `Start: ${this._fmt(this.pendingStart)}`;
    this.btnMarkStart.classList.add('btn-active');
  }

  markEnd() {
    if (this.pendingStart === null) {
      this.pendingStart = 0;
    }
    const endTime = this.vc.currentTime;
    if (endTime <= this.pendingStart) return;

    const play = {
      id: this.nextId++,
      timestamp: { start: this.pendingStart, end: endTime },
      tags: {
        down: '',
        distance: '',
        formation: '',
        playType: '',
        defFront: '',
        coverage: '',
        blitz: '',
        result: '',
        yardage: '',
        hash: '',
        quarter: '',
        yardLine: '',
        fieldSide: 'own',
        personnel: '',
        driveNumber: this.currentDrive.toString(),
        unit: this.defaultUnit || 'offense',
        stType: '',
        players: {},
        grades: {},
        custom: []
      },
      annotations: [],
      notes: ''
    };

    this.plays.push(play);
    this.pendingStart = null;
    this.btnMarkStart.textContent = 'Mark Start';
    this.btnMarkStart.classList.remove('btn-active');

    this._updatePlaySelect();
    this._updateTimeline();
    this.selectPlay(play.id);
    this._emit('play-created', play);
  }

  async deleteCurrentPlay() {
    // Fall back to the dropdown selection if no play is actively loaded
    // (e.g. after importing/loading plays without re-selecting one), so the
    // Delete button always acts on the play the user can see.
    let id = this.currentPlayId;
    if (!id && this.playSelect && this.playSelect.value) {
      id = parseInt(this.playSelect.value);
    }
    if (!id) return;
    // Use an in-app modal instead of native confirm(): browsers suppress
    // repeated confirm() dialogs ("prevent additional dialogs"), which made
    // delete silently do nothing.
    const ok = await this._confirmDialog(
      `Delete Play ${id} and unload the video? The play is removed and the video clears from the player (your source file is not deleted).`,
      'Delete Play'
    );
    if (!ok) return;
    this.plays = this.plays.filter(p => p.id !== id);
    this.currentPlayId = null;
    this._clearTagForm();
    this._updatePlaySelect();
    this._updateTimeline();
    this._emit('play-deleted');
    // Remove the loaded video from the player (does NOT delete the file).
    if (this.vc && typeof this.vc.unloadVideo === 'function') {
      this.vc.unloadVideo();
    }
  }

  /**
   * Reset the current play's tags back to blank, keeping the play segment and
   * the loaded video so the coach can re-tag the same snap.
   */
  async clearCurrentTags() {
    let id = this.currentPlayId;
    if (!id && this.playSelect && this.playSelect.value) {
      id = parseInt(this.playSelect.value);
    }
    if (!id) return;
    const play = this.getPlay(id);
    if (!play) return;
    const ok = await this._confirmDialog(
      `Clear all tags on Play ${id}? Only the tag values reset — the play and video stay.`,
      'Clear Tags'
    );
    if (!ok) return;

    play.tags = {
      down: '', distance: '', formation: '', playType: '', defFront: '',
      coverage: '', blitz: '', result: '', yardage: '', hash: '', quarter: '',
      yardLine: '', fieldSide: 'own', personnel: '',
      driveNumber: play.tags.driveNumber || this.currentDrive.toString(),
      unit: play.tags.unit || this.defaultUnit || 'offense',
      stType: '', players: {}, grades: {}, custom: []
    };
    play.notes = '';

    // Reflect the reset in the UI if this play is the one on screen.
    if (this.currentPlayId === id) {
      this._loadTagForm(play);
      const notesEl = document.getElementById('notesArea');
      if (notesEl) notesEl.value = '';
    }
    this._updatePlaySelect();
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  /**
   * Lightweight in-app confirmation modal. Returns a Promise<boolean>.
   * Reliable replacement for window.confirm (which can be suppressed by the
   * browser). Enter / the Delete button confirm; Esc / Cancel / backdrop reject.
   */
  _confirmDialog(message, confirmLabel = 'Delete') {
    return new Promise(resolve => {
      const prev = document.getElementById('ffaConfirmModal');
      if (prev) prev.remove();

      const overlay = document.createElement('div');
      overlay.className = 'ffa-confirm-modal';
      overlay.id = 'ffaConfirmModal';
      overlay.innerHTML = `
        <div class="ffa-confirm-backdrop"></div>
        <div class="ffa-confirm-card" role="dialog" aria-modal="true">
          <p class="ffa-confirm-msg"></p>
          <div class="ffa-confirm-actions">
            <button type="button" class="btn btn-sm" data-act="cancel">Cancel</button>
            <button type="button" class="btn btn-sm btn-danger" data-act="ok"></button>
          </div>
        </div>`;
      overlay.querySelector('.ffa-confirm-msg').textContent = message;
      overlay.querySelector('[data-act="ok"]').textContent = confirmLabel;
      document.body.appendChild(overlay);

      const cleanup = (val) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(val);
      };
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cleanup(false); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); cleanup(true); }
      };
      overlay.addEventListener('click', (e) => {
        const act = e.target.dataset ? e.target.dataset.act : null;
        if (act === 'ok') cleanup(true);
        else if (act === 'cancel' || e.target.classList.contains('ffa-confirm-backdrop')) cleanup(false);
      });
      // Capture phase so the app's global key shortcuts don't also fire.
      document.addEventListener('keydown', onKey, true);

      const okBtn = overlay.querySelector('[data-act="ok"]');
      if (okBtn) okBtn.focus();
    });
  }

  selectPlay(id) {
    this.currentPlayId = id;
    const play = this.getPlay(id);
    if (!play) return;

    this.playSelect.value = id;
    this._loadTagForm(play);
    this._updateTimeline();

    // If this play is tied to a clip, emit event so playlist can switch.
    // Otherwise seek within the current video (single-video mode).
    if (play.clipId) {
      this._emit('play-selected', play);
    } else {
      this.vc.seekTo(play.timestamp.start);
      this._emit('play-selected', play);
    }
  }

  getPlay(id) {
    return this.plays.find(p => p.id === id);
  }

  getCurrentPlay() {
    return this.getPlay(this.currentPlayId);
  }

  _saveField(key) {
    const play = this.getCurrentPlay();
    if (!play) return;
    play.tags[key] = this.tagFields[key].value;
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  _savePlayer(role) {
    const play = this.getCurrentPlay();
    if (!play) return;
    if (!play.tags.players) play.tags.players = {};
    const val = (this.playerFields[role].value || '').trim();
    if (val) play.tags.players[role] = val;
    else delete play.tags.players[role];
    this._emit('play-updated', play);
  }

  _saveGrade(role) {
    const play = this.getCurrentPlay();
    if (!play) return;
    if (!play.tags.grades) play.tags.grades = {};
    const val = (this.gradeFields[role].value || '').trim();
    if (val !== '') play.tags.grades[role] = parseInt(val);
    else delete play.tags.grades[role];
    this._emit('play-updated', play);
  }

  _saveCurrentTags() {
    const play = this.getCurrentPlay();
    if (!play) return;
    for (const [key, el] of Object.entries(this.tagFields)) {
      play.tags[key] = el.value;
    }
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  _loadTagForm(play) {
    this.tagFields.down.value = play.tags.down;
    this.tagFields.distance.value = play.tags.distance;
    this.tagFields.formation.value = play.tags.formation;
    this.tagFields.playType.value = play.tags.playType;
    this.tagFields.defFront.value = play.tags.defFront;
    this.tagFields.coverage.value = play.tags.coverage;
    this.tagFields.blitz.value = play.tags.blitz;
    this.tagFields.result.value = play.tags.result;
    this.tagFields.yardage.value = play.tags.yardage;
    this.tagFields.hash.value = play.tags.hash;
    this.tagFields.quarter.value = play.tags.quarter || '';
    this.tagFields.yardLine.value = play.tags.yardLine || '';
    this.tagFields.fieldSide.value = play.tags.fieldSide || 'own';
    this.tagFields.personnel.value = play.tags.personnel || '';
    this.tagFields.driveNumber.value = play.tags.driveNumber || '';
    this.tagFields.stType.value = play.tags.stType || '';
    const players = play.tags.players || {};
    for (const [role, el] of Object.entries(this.playerFields)) {
      if (el) el.value = players[role] || '';
    }
    const grades = play.tags.grades || {};
    for (const [role, el] of Object.entries(this.gradeFields)) {
      if (el) el.value = grades[role] != null ? String(grades[role]) : '';
    }
    const unit = play.tags.unit || this.defaultUnit || 'offense';
    if (this.unitField) this.unitField.value = unit;
    this.applyUnitMode(unit);
    this._renderCustomTags(play.tags.custom);
  }

  /**
   * Lay out the tag form for the given unit. The active side's fields lead;
   * the other side collapses into a one-tap "faced" group; Special Teams
   * swaps in its own fields. Nothing is destroyed — just reordered/hidden.
   */
  applyUnitMode(unit) {
    unit = unit || 'offense';
    const form = this.tagForm;
    if (!form) return;
    form.classList.remove('mode-offense', 'mode-defense', 'mode-special');
    form.classList.add('mode-' + unit);

    const groups = {
      offense: form.querySelector('.group-offense'),
      defense: form.querySelector('.group-defense'),
      special: form.querySelector('.group-special'),
    };
    for (const g of Object.values(groups)) {
      if (g) g.classList.remove('is-secondary', 'is-hidden', 'collapsed');
    }
    if (unit === 'offense') {
      groups.defense && groups.defense.classList.add('is-secondary', 'collapsed');
      groups.special && groups.special.classList.add('is-hidden');
    } else if (unit === 'defense') {
      groups.offense && groups.offense.classList.add('is-secondary', 'collapsed');
      groups.special && groups.special.classList.add('is-hidden');
    } else { // special teams
      groups.offense && groups.offense.classList.add('is-hidden');
      groups.defense && groups.defense.classList.add('is-hidden');
    }
  }

  _clearTagForm() {
    for (const el of Object.values(this.tagFields)) el.value = '';
    for (const el of Object.values(this.playerFields)) { if (el) el.value = ''; }
    for (const el of Object.values(this.gradeFields)) { if (el) el.value = ''; }
    this.tagChips.innerHTML = '';
  }

  nextPlay() {
    const idx = this.plays.findIndex(p => p.id === this.currentPlayId);
    if (idx >= 0 && idx < this.plays.length - 1) {
      this.selectPlay(this.plays[idx + 1].id);
      return true;
    }
    return false;
  }

  prevPlay() {
    const idx = this.plays.findIndex(p => p.id === this.currentPlayId);
    if (idx > 0) {
      this.selectPlay(this.plays[idx - 1].id);
      return true;
    }
    return false;
  }

  /** Like nextPlay(), but carries the down & distance situation forward. */
  nextPlayWithSituation() {
    const prev = this.getCurrentPlay();
    const advanced = this.nextPlay();
    if (advanced && this.autoDD && prev) {
      const next = this.getCurrentPlay();
      if (next) this.applyNextSituation(prev, next);
    }
    return advanced;
  }

  /** Set the unit (Offense/Defense/Special) on the current play and relayout. */
  setUnit(unit) {
    unit = unit || 'offense';
    if (this.unitField) this.unitField.value = unit;
    const play = this.getCurrentPlay();
    if (play) {
      play.tags.unit = unit;
      this._emit('play-updated', play);
    }
    this.applyUnitMode(unit);
  }

  _absYL(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  /**
   * Given the just-tagged previous play, compute the next play's situation.
   * Returns null when the possession ends (TD, turnover, punt, FG, etc.) or
   * when there isn't enough info — in those cases we leave the next play blank
   * for the coach to start fresh.
   */
  computeNextSituation(prev) {
    const t = prev.tags;
    const stop = ['Touchdown', 'Interception', 'Fumble', 'Punt', 'Field Goal', 'Kneel', 'Spike', 'Penalty'];
    if (stop.includes(t.result)) return null;

    const down = parseInt(t.down);
    const distance = parseInt(t.distance);
    if (!down || isNaN(distance)) return null;

    let gained = parseInt(t.yardage);
    if (isNaN(gained)) gained = 0;

    const firstDown = (gained >= distance) || (Array.isArray(t.custom) && t.custom.includes('1st Down'));

    // Field position only makes sense for the offense's own yardage.
    let fieldSide = null, yardLine = null, newAbs = null;
    if (t.unit === 'offense' || !t.unit) {
      const abs = this._absYL(t);
      if (abs != null) {
        newAbs = Math.min(99, Math.max(1, abs + gained));
        if (newAbs <= 50) { fieldSide = 'own'; yardLine = newAbs; }
        else { fieldSide = 'opp'; yardLine = 100 - newAbs; }
      }
    }

    let nextDown, nextDist;
    if (firstDown) {
      nextDown = 1;
      nextDist = (newAbs != null && (100 - newAbs) < 10) ? (100 - newAbs) : 10;
    } else {
      if (down >= 4) return null; // turnover on downs — new possession
      nextDown = down + 1;
      nextDist = Math.max(1, distance - gained);
      if (newAbs != null && (100 - newAbs) < nextDist) nextDist = Math.max(1, 100 - newAbs);
    }
    return { down: String(nextDown), distance: String(nextDist), fieldSide, yardLine };
  }

  /** Pre-fill the next play's situation, without overwriting existing tags. */
  applyNextSituation(prev, next) {
    if (next.tags.down) return; // already has a down — respect manual/imported data
    const sit = this.computeNextSituation(prev);
    if (!sit) return;
    next.tags.down = sit.down;
    next.tags.distance = sit.distance;
    if (sit.fieldSide != null) next.tags.fieldSide = sit.fieldSide;
    if (sit.yardLine != null) next.tags.yardLine = String(sit.yardLine);
    // Same drive/quarter continues unless already set.
    if (!next.tags.quarter && prev.tags.quarter) next.tags.quarter = prev.tags.quarter;
    if (!next.tags.driveNumber && prev.tags.driveNumber) next.tags.driveNumber = prev.tags.driveNumber;
    this._loadTagForm(next);
    this._updateTimeline();
    this._emit('play-updated', next);
  }

  _renderCustomTags(tags) {
    this.tagChips.innerHTML = '';
    tags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag} <span class="chip-remove" data-index="${i}">&times;</span>`;
      chip.querySelector('.chip-remove').addEventListener('click', () => {
        tags.splice(i, 1);
        this._renderCustomTags(tags);
        this._emit('play-updated', this.getCurrentPlay());
      });
      this.tagChips.appendChild(chip);
    });
  }

  _updatePlaySelect() {
    const currentVal = this.currentPlayId;
    this.playSelect.innerHTML = '<option value="">-- No plays tagged --</option>';
    this.plays.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      let label;
      if (p.clipName) {
        label = `Play ${p.id}: ${p.clipName}`;
      } else {
        label = `Play ${p.id}: ${this._fmt(p.timestamp.start)}-${this._fmt(p.timestamp.end)}`;
      }
      const type = p.tags.playType ? ` (${p.tags.playType})` : '';
      opt.textContent = label + type;
      this.playSelect.appendChild(opt);
    });
    if (currentVal) this.playSelect.value = currentVal;
  }

  _updateTimeline() {
    this.timelineBar.innerHTML = '';
    const duration = this.vc.duration;
    if (!duration) return;

    this.plays.forEach(p => {
      const left = (p.timestamp.start / duration) * 100;
      const width = ((p.timestamp.end - p.timestamp.start) / duration) * 100;
      const div = document.createElement('div');

      let typeClass = 'other';
      if (p.tags.playType && p.tags.playType.toLowerCase().includes('run')) typeClass = 'run';
      else if (p.tags.playType && (p.tags.playType.toLowerCase().includes('pass') || p.tags.playType.toLowerCase().includes('screen'))) typeClass = 'pass';

      div.className = `timeline-play ${typeClass}${p.id === this.currentPlayId ? ' active' : ''}`;
      div.style.left = left + '%';
      div.style.width = Math.max(width, 0.5) + '%';
      div.textContent = `${p.id}`;
      div.title = `Play ${p.id}: ${p.tags.playType || 'Untagged'}`;
      div.addEventListener('click', () => this.selectPlay(p.id));
      this.timelineBar.appendChild(div);
    });
  }

  // Also update scrub bar play markers
  updateScrubBarPlays() {
    const container = document.getElementById('scrubBarPlays');
    if (!container) return;
    container.innerHTML = '';
    const duration = this.vc.duration;
    if (!duration) return;

    this.plays.forEach(p => {
      const left = (p.timestamp.start / duration) * 100;
      const width = ((p.timestamp.end - p.timestamp.start) / duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'play-marker';
      marker.style.left = left + '%';
      marker.style.width = Math.max(width, 0.3) + '%';
      container.appendChild(marker);
    });
  }

  _fmt(sec) {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
