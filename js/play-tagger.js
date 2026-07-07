import { gainedFirstDown, isPlayTagged } from './football-rules.js';

/**
 * ChipField — lightweight wrapper so a div.pick-group behaves like a
 * <select> for the rest of the tagger: .value get/set, change events.
 */
class ChipField {
  constructor(el, opts = {}) {
    this.el = el;
    this.multi = !!opts.multi;       // allow multiple chips active at once
    // Presentational marker so CSS can style multi-select groups (tinted +
    // border + ✓) distinctly from single-choice groups (solid fill). No logic
    // change — the design refresh keys off this to make radio-vs-checkbox
    // groups legible at a glance (§4.1).
    if (this.multi) el.classList.add('cf-multi');
    // Groups of mutually exclusive values within a multi field: adding one
    // removes its rivals (e.g. a play can't be both Gain and Loss, but can be
    // Fumble + Touchdown). Array of arrays.
    this.exclusive = opts.exclusive || [];
    this._value = '';
    this._values = [];               // selected values when multi
    this._listeners = {};
    this.chips = [...el.querySelectorAll('[data-value]')];
    this.chips.forEach(chip => this._bindChip(chip));
  }
  /** Wire a chip's toggle behavior (shared by the constructor + runtime chips). */
  _bindChip(chip) {
    chip.addEventListener('click', (e) => {
      e.preventDefault();
      const v = chip.dataset.value;
      if (this.multi) {
        const i = this._values.indexOf(v);
        if (i >= 0) this._values.splice(i, 1);
        else { this._dropRivals(v); this._values.push(v); }
        this._syncMulti();
      } else {
        this.value = this._value === v ? '' : v;
      }
      this._fire('change');
    });
  }
  /** Bind + track an externally-created chip button (custom user chips), so it
   *  behaves exactly like a built-in chip. Re-syncs active state for the case a
   *  play carrying this value is already loaded. */
  registerChip(btn) {
    if (!btn || this.chips.includes(btn)) return;
    this._bindChip(btn);
    this.chips.push(btn);
    if (this.multi) this._syncMulti();
    else if (this._value === btn.dataset.value) btn.classList.add('active');
  }
  /** Stop tracking a chip (removed custom chip). Does not touch stored values. */
  unregisterChip(btn) {
    const i = this.chips.indexOf(btn);
    if (i >= 0) this.chips.splice(i, 1);
  }
  /** Remove values that are mutually exclusive with v (multi mode). */
  _dropRivals(v) {
    for (const group of this.exclusive) {
      if (!group.includes(v)) continue;
      this._values = this._values.filter(x => x === v || !group.includes(x));
    }
  }
  // For multi fields .value is a " + "-joined string (e.g. "Pistol + Spread")
  // so the rest of the tagger and all downstream consumers keep treating the
  // field as a plain string.
  get value() { return this.multi ? this._values.join(' + ') : this._value; }
  set value(v) {
    if (this.multi) {
      this._values = String(v || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
      this._syncMulti();
    } else {
      this._value = v || '';
      this.chips.forEach(c => c.classList.toggle('active', c.dataset.value === this._value));
    }
  }
  _syncMulti() {
    const set = new Set(this._values);
    this.chips.forEach(c => c.classList.toggle('active', set.has(c.dataset.value)));
  }
  /** Toggle a value (membership for multi, on/off for single). */
  toggle(v) {
    if (this.multi) {
      const i = this._values.indexOf(v);
      if (i >= 0) this._values.splice(i, 1);
      else { this._dropRivals(v); this._values.push(v); }
      this._syncMulti();
    } else {
      this.value = this._value === v ? '' : v;
    }
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
    this.btnCopyPrev = document.getElementById('btnCopyPrev');
    this.templateSelect = document.getElementById('templateSelect');
    this.btnSaveTemplate = document.getElementById('btnSaveTemplate');
    this.btnDeleteTemplate = document.getElementById('btnDeleteTemplate');
    this.timelineBar = document.getElementById('timelineBar');

    // Tag form elements — chip groups wrapped as ChipField, inputs used directly
    const fieldMap = {
      down: 'tagDown', distance: 'tagDistance', formation: 'tagFormation',
      playType: 'tagPlayType', defFront: 'tagDefFront', coverage: 'tagCoverage',
      blitz: 'tagBlitz', result: 'tagResult', yardage: 'tagYardage',
      hash: 'tagHash', quarter: 'tagQuarter', yardLine: 'tagYardLine',
      fieldSide: 'tagFieldSide', personnel: 'tagPersonnel',
      driveNumber: 'tagDriveNumber', stType: 'tagStType',
      runPass: 'tagRunPass', motion: 'tagMotion', playDir: 'tagPlayDir',
      scoreFor: 'tagScoreFor', backfield: 'tagBackfield', strength: 'tagStrength',
      kickOutcome: 'tagKickOutcome', kickDistance: 'tagKickDistance',
      returnYards: 'tagReturnYards', hangTime: 'tagHangTime', kickedTo: 'tagKickedTo',
    };
    this.tagFields = {};
    // Multi-select fields stored as " + "-joined strings. Formation: a QB can
    // be Pistol AND Spread. Play Type: an RPO that becomes a run or a pass can
    // carry both "RPO" and the realized look (e.g. "RPO + Short Pass").
    // Def Front: a base front plus a shift package (e.g. "Maverick + Jumbo Shift").
    const multiFields = new Set(['formation', 'playType', 'result', 'blitz', 'defFront']);
    // Within multi-select Result, the base outcomes are mutually exclusive —
    // a play can't be Gain AND Loss. Picking one replaces its rivals, so a
    // correction tap (or keyboard key) never leaves "Gain + Loss" behind.
    // Combinable results (Fumble + Touchdown, Interception + Touchdown,
    // Sack + Fumble, Penalty + anything) are unaffected.
    // Exclusivity groups live on PlayTagger (static) so the Film Room grid's
    // inline editor applies the identical rule — see PlayTagger.EXCLUSIVE_GROUPS.
    for (const [key, id] of Object.entries(fieldMap)) {
      const el = document.getElementById(id);
      this.tagFields[key] = el?.classList.contains('pick-group')
        ? new ChipField(el, { multi: multiFields.has(key), exclusive: PlayTagger.EXCLUSIVE_GROUPS[key] })
        : el;
    }

    // Per-play player attribution (jersey #) by role.
    this.playerFields = {
      ballCarrier: document.getElementById('tagPlayerBC'),
      passer: document.getElementById('tagPlayerPasser'),
      receiver: document.getElementById('tagPlayerReceiver'),
      tackler: document.getElementById('tagPlayerTackler'),
      takeaway: document.getElementById('tagPlayerTakeaway'),
      kicker: document.getElementById('tagPlayerKicker'),
      returner: document.getElementById('tagPlayerReturner'),
    };

    // Per-play player grading (+/- per snap).
    this.gradeFields = {
      ballCarrier: document.getElementById('tagGradeBC'),
      passer: document.getElementById('tagGradePasser'),
      receiver: document.getElementById('tagGradeReceiver'),
      tackler: document.getElementById('tagGradeTackler'),
      takeaway: document.getElementById('tagGradeTakeaway'),
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

    // Carry scheme: pre-fill the next play's alignment fields (formation,
    // personnel, def front, coverage) from the previous play. Opt-in — teams
    // that rarely change looks save four taps a snap. Default OFF.
    this.carryScheme = (typeof localStorage !== 'undefined')
      && localStorage.getItem('ffa_carry_scheme') === '1';

    this.tagChips = document.getElementById('tagChips');
    this.customTagInput = document.getElementById('customTagInput');

    this.btnNewDrive = document.getElementById('btnNewDrive');
    this.currentDrive = 1;

    // Result chips: the six rare outcomes (FG/Good/No Good/Kneel/Spike/Safety)
    // hide behind a "More" expander so the common row stays scannable.
    this.resultRareWrap = document.getElementById('tagResultRare');
    this.btnResultMore = document.getElementById('tagResultMore');
    if (this.btnResultMore && this.resultRareWrap) {
      this.btnResultMore.addEventListener('click', () => {
        const show = this.resultRareWrap.classList.toggle('show');
        this.btnResultMore.classList.toggle('open', show);
        this.btnResultMore.textContent = show ? 'Less ▴' : 'More ▾';
      });
    }

    // Optional toast hook (App wires this to the shared toast) for inline
    // feedback like "Mark the start first".
    this.toast = null;

    this._bindEvents();

    // Lay the form out for the default side before any play is selected,
    // otherwise every side group would be visible at once.
    if (this.unitField) this.unitField.value = this.defaultUnit;
    this.applyUnitMode(this.defaultUnit);

    // Start disabled — chip taps with no play selected used to LOOK accepted
    // but were silently discarded (_saveField bails). Dim + block the form
    // until a play exists so input can never vanish.
    this._updateFormEnabled();

    // A disabled form must never feel dead: clicking the gray area explains
    // how to activate it instead of silently doing nothing.
    this.tagForm?.addEventListener('click', (e) => {
      if (!this.tagForm.classList.contains('form-disabled')) return;
      if (e.target.closest('.tag-nav')) return;
      const plain = this._disabledHintText().replace(/<[^>]+>/g, '').replace(/&amp;/g, '&');
      this.toast?.(plain);
      const hint = document.getElementById('tagFormHint');
      if (hint && !hint.classList.contains('hidden')) {
        hint.classList.remove('hint-pulse');
        void hint.offsetWidth;
        hint.classList.add('hint-pulse');
      }
    });
  }

  /**
   * Enable the tag form only when a play is selected. Without this, ChipField
   * toggles the chip visuals before _saveField() finds no current play, so
   * the coach's input looks saved but writes nowhere — silent data loss.
   */
  _updateFormEnabled() {
    if (!this.tagForm) return;
    const enabled = !!this.getCurrentPlay();
    this.tagForm.classList.toggle('form-disabled', !enabled);
    const hint = document.getElementById('tagFormHint');
    if (hint) {
      hint.classList.toggle('hidden', enabled);
      if (!enabled) hint.innerHTML = this._disabledHintText();
    }
  }

  _disabledHintText() {
    return this.plays.length
      ? 'Select a play to tag — click a row in the play list, or hit <b>Save &amp; Next</b> to start at play 1'
      : 'Mark a play to start tagging — press <kbd>[</kbd> at the snap, <kbd>]</kbd> at the whistle (or the Mark Start / Mark End buttons under the video)';
  }

  _bindEvents() {
    this.btnMarkStart.addEventListener('click', () => this.markStart());
    this.btnMarkEnd.addEventListener('click', () => this.markEnd());
    this.btnDeletePlay.addEventListener('click', () => this.deleteCurrentPlay());
    if (this.btnClearTags) {
      this.btnClearTags.addEventListener('click', () => this.clearCurrentTags());
    }
    if (this.btnCopyPrev) this.btnCopyPrev.addEventListener('click', () => this.copyFromPrevious());
    if (this.btnSaveTemplate) this.btnSaveTemplate.addEventListener('click', () => this.saveTemplate());
    if (this.btnDeleteTemplate) this.btnDeleteTemplate.addEventListener('click', () => this.deleteSelectedTemplate());
    if (this.templateSelect) {
      this.templateSelect.addEventListener('change', () => {
        if (this.templateSelect.value) this.applyTemplate(this.templateSelect.value);
      });
      this._refreshTemplateSelect();
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

    // Phase-aware special teams: when the ST Play Type changes, show only the
    // detail fields/chips that phase uses (kickoff hang time, punt net, FG
    // result, etc.).
    if (this.tagFields.stType) {
      this.tagFields.stType.addEventListener('change', () => this._onStPhaseChange(this.tagFields.stType.value));
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
          if (this._stripStAlignment(play)) this._loadTagForm(play);
          this._emit('play-updated', play);
        }
        // Make the side "sticky": the user's choice carries forward to the
        // next untagged play (Save & Next) until they change it again.
        this.defaultUnit = unit;
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

  /**
   * Marking start/end is OPTIONAL when film arrives as one clip per play:
   * loading a video into an empty game auto-creates a play spanning the whole
   * file so the coach can tag immediately. The play carries `autoFull` so the
   * first manual [ / ] mark RE-TIMES it (continuous-film workflow) instead of
   * leaving a stray whole-film play behind.
   */
  createWholeVideoPlay(duration, name) {
    if (this.plays.length) return null;
    const play = {
      id: this.nextId++,
      timestamp: { start: 0, end: duration || 0 },
      autoFull: true,
      tags: {
        down: '', distance: '', formation: '', playType: '', runPass: '',
        defFront: '', coverage: '', blitz: '', result: '', yardage: '',
        hash: '', quarter: '', yardLine: '', fieldSide: 'own', personnel: '',
        motion: '', playDir: '',
        driveNumber: this.currentDrive.toString(),
        unit: this.defaultUnit || 'offense',
        stType: '', players: {}, grades: {}, custom: []
      },
      annotations: [],
      notes: '',
      clipName: name || ''
    };
    this.plays.push(play);
    this._updatePlaySelect();
    this._updateTimeline();
    this.selectPlay(play.id);
    this._emit('play-created', play);
    return play;
  }

  /** The reusable whole-video placeholder: sole play, auto-created, untagged. */
  _wholeVideoPlaceholder() {
    if (this.plays.length !== 1) return null;
    const p = this.plays[0];
    if (!p.autoFull) return null;
    const t = p.tags || {};
    const untouched = !t.playType && !t.result && !t.formation && !t.runPass &&
      !t.yardage && !(p.notes || '').trim();
    return untouched ? p : null;
  }

  /** Marking needs film. Clicking Mark with nothing loaded used to no-op
   *  silently — the #1 novice trap ("is the app broken?"). Loaded = the src
   *  attribute (set by setSrc/loadUrl, removed by unloadVideo) or currentSrc. */
  _requireVideo() {
    const el = this.vc && this.vc.videoElement;
    if (el && (el.getAttribute('src') || el.currentSrc)) return true;
    this.toast?.('Load film first — drag a video in, or click Add Video above');
    return false;
  }

  markStart() {
    if (!this._requireVideo()) return;
    this.pendingStart = this.vc.currentTime;
    this.btnMarkStart.textContent = `Start: ${this._fmt(this.pendingStart)}`;
    this.btnMarkStart.classList.add('btn-active');
  }

  markEnd() {
    if (!this._requireVideo()) return;
    if (this.pendingStart === null) {
      this.toast?.('Mark the start first — press [ at the snap');
      return;
    }
    const endTime = this.vc.currentTime;
    if (endTime <= this.pendingStart) {
      this.toast?.('End must be after start — play forward, then press ]');
      return;
    }

    // First manual mark in a fresh single-video game: re-time the auto-created
    // whole-video placeholder instead of stacking a second play on top of it.
    const placeholder = this._wholeVideoPlaceholder();
    if (placeholder) {
      placeholder.timestamp = { start: this.pendingStart, end: endTime };
      delete placeholder.autoFull;
      this.pendingStart = null;
      this.btnMarkStart.textContent = 'Mark Start';
      this.btnMarkStart.classList.remove('btn-active');
      this._updatePlaySelect();
      this._updateTimeline();
      this.selectPlay(placeholder.id);
      this._emit('play-updated', placeholder);
      return;
    }

    const play = {
      id: this.nextId++,
      timestamp: { start: this.pendingStart, end: endTime },
      tags: {
        down: '',
        distance: '',
        formation: '',
        playType: '',
        runPass: '',
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
        motion: '',
        playDir: '',
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

    // Insert in chronological order — a play marked after scrubbing back must
    // not land at the end of the list, or Save & Next and Auto D&D would jump
    // from it to the wrong neighbor. (Single-video mode only; multi-clip plays
    // are clip-relative and stay in playlist order.)
    const insertAt = (this.playlist && this.playlist.hasClips) ? this.plays.length
      : this.plays.findIndex(p => (p.timestamp?.start ?? 0) > play.timestamp.start);
    if (insertAt === -1 || insertAt >= this.plays.length) this.plays.push(play);
    else this.plays.splice(insertAt, 0, play);
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

    // Folder/multi-clip mode: the play is backed by a playlist clip. Deleting
    // it must drop the clip too AND advance to an adjacent clip — NOT unload
    // the whole player (which orphaned the remaining clips and forced a full
    // re-upload). Detect that case and delegate to the playlist.
    const play = this.getPlay(id);
    const clipIdx = (this.playlist && this.playlist.hasClips && play && play.clipId != null)
      ? this.playlist.clips.findIndex(c => c.playId === id)
      : -1;
    const inPlaylist = clipIdx !== -1;

    // Use an in-app modal instead of native confirm(): browsers suppress
    // repeated confirm() dialogs ("prevent additional dialogs"), which made
    // delete silently do nothing.
    // Single-video mode: only the LAST play takes the video with it — deleting
    // one of several marked plays must not nuke the film and every other play.
    const lastSingle = !inPlaylist && this.plays.length <= 1;
    const ok = await this._confirmDialog(
      inPlaylist
        ? `Delete Play ${id} and remove its clip from the playlist? The remaining videos stay loaded (your source file is not deleted).`
        : lastSingle
          ? `Delete Play ${id} and unload the video? The play is removed and the video clears from the player (your source file is not deleted).`
          : `Delete Play ${id}? The video and your other plays stay loaded.`,
      'Delete Play'
    );
    if (!ok) return;

    // In-situ recovery (UX audit A2): the deletion lands on the undo stack —
    // offer Undo right in the toast instead of requiring Ctrl+Z knowledge.
    const undoToast = () => {
      if (this.toast) this.toast(`Deleted Play ${id}`, {
        action: { label: 'Undo', fn: () => window.app?.history?.undo() },
      });
    };

    if (inPlaylist) {
      // removeClip() filters out the play, revokes its URL, fixes the active
      // index, and switches to an adjacent clip (keeping video + a valid
      // current play so Save & Next keeps working).
      this.playlist.removeClip(clipIdx);   // emits play-deleted itself
      // If that emptied the playlist, clear the player too.
      if (!this.playlist.hasClips && this.vc && typeof this.vc.unloadVideo === 'function') {
        this.vc.unloadVideo();
      }
      undoToast();
      return;
    }

    // Single-video mode: remove the play. Keep the film loaded while other
    // plays remain — select the adjacent play so tagging flows on.
    const idx = this.plays.findIndex(p => p.id === id);
    this.plays = this.plays.filter(p => p.id !== id);
    this.currentPlayId = null;
    this._clearTagForm();
    this._updatePlaySelect();
    this._updateTimeline();
    this._emit('play-deleted');
    undoToast();
    if (this.plays.length > 0) {
      const next = this.plays[Math.min(Math.max(idx, 0), this.plays.length - 1)];
      if (next) this.selectPlay(next.id);
      return;
    }
    // Last play gone: clear the player too (does NOT delete the file).
    if (this.vc && typeof this.vc.unloadVideo === 'function') {
      this.vc.unloadVideo();
    }
  }

  /**
   * Reset the current play's tags back to blank, keeping the play segment and
   * the loaded video so the coach can re-tag the same snap. Confirms first,
   * then clears the on-screen form (and the current play's stored tags/notes
   * when one exists) so the button always has an obvious effect.
   */
  async clearCurrentTags() {
    let id = this.currentPlayId;
    if (!id && this.playSelect && this.playSelect.value) {
      id = parseInt(this.playSelect.value);
    }
    const play = id ? this.getPlay(id) : null;

    const msg = play
      ? `Clear all tags and notes on Play ${id}? The play and video stay.`
      : 'Clear the current tag selections?';
    const ok = await this._confirmDialog(msg, 'Clear Tags');
    if (!ok) return;

    if (play) {
      play.tags = {
        down: '', distance: '', formation: '', playType: '', runPass: '', defFront: '',
        coverage: '', blitz: '', result: '', yardage: '', hash: '', quarter: '',
        yardLine: '', fieldSide: 'own', personnel: '', motion: '', playDir: '',
        driveNumber: play.tags.driveNumber || this.currentDrive.toString(),
        unit: play.tags.unit || this.defaultUnit || 'offense',
        stType: '', players: {}, grades: {}, custom: [], customFields: {}
      };
      play.notes = '';
      this._updatePlaySelect();
      this._updateTimeline();
      this._emit('play-updated', play);
    }

    // Always reset the visible form fields, chips, players, grades and notes.
    this._clearTagForm();
    const notesEl = document.getElementById('notesArea');
    if (notesEl) notesEl.value = '';
    // Custom-field chips and roster quick-pick chips render outside the core
    // form and only refresh on play-selected — re-announce the (now blank)
    // play so they don't stay lit and read as "the clear didn't work".
    if (play) this._emit('play-selected', play);
    // In-situ recovery (UX audit A2): the clear is on the undo stack — offer
    // it right here instead of requiring the coach to know Ctrl+Z.
    if (play && this.toast) {
      this.toast(`Cleared tags on Play ${id}`, {
        action: { label: 'Undo', fn: () => window.app?.history?.undo() },
      });
    }
  }

  // --- Copy-from-previous + reusable tag templates ----------------------
  // The "scheme" tag keys these helpers carry over (pre-snap alignment +
  // play concept). Play-specific fields (result, yardage, players, notes,
  // down/distance — owned by Auto D&D) are intentionally NOT copied.
  static get SCHEME_KEYS() {
    return ['unit', 'formation', 'personnel', 'motion', 'runPass', 'playType',
            'defFront', 'coverage', 'blitz', 'hash'];
  }

  /** Copy scheme tags from the play immediately before the current one. */
  copyFromPrevious() {
    const play = this.getCurrentPlay();
    if (!play) return;
    const idx = this.plays.findIndex(p => p.id === play.id);
    if (idx <= 0) return; // no previous play
    const prev = this.plays[idx - 1];
    PlayTagger.SCHEME_KEYS.forEach(k => { play.tags[k] = prev.tags[k] || (k === 'unit' ? 'offense' : ''); });
    this._loadTagForm(play);
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  _templateStore() {
    try { return JSON.parse(localStorage.getItem('ffa_play_templates') || '{}') || {}; }
    catch { return {}; }
  }
  _saveTemplateStore(obj) {
    try { localStorage.setItem('ffa_play_templates', JSON.stringify(obj)); } catch {}
  }

  _refreshTemplateSelect() {
    if (!this.templateSelect) return;
    const store = this._templateStore();
    const names = Object.keys(store).sort((a, b) => a.localeCompare(b));
    const cur = this.templateSelect.value;
    this.templateSelect.innerHTML = '<option value="">Templates…</option>' +
      names.map(n => `<option value="${n.replace(/"/g, '&quot;')}">${n}</option>`).join('');
    if (cur && store[cur]) this.templateSelect.value = cur;
  }

  /** Save the current play's scheme tags as a named, reusable template. */
  async saveTemplate() {
    const play = this.getCurrentPlay();
    if (!play) { this.toast?.('Select a play first, then save its tags as a template.'); return; }
    // In-app prompt: window.prompt() gets suppressed like confirm() does
    // (Key Decision #8) and then "Save…" silently does nothing.
    const name = ((await this._promptDialog(
      'Template name', 'Save Template', 'e.g. "Gun Trips Rt / 4-3 Cover 3"')) || '').trim();
    if (!name) return;
    const store = this._templateStore();
    const subset = {};
    PlayTagger.SCHEME_KEYS.forEach(k => { if (play.tags[k]) subset[k] = play.tags[k]; });
    store[name] = subset;
    this._saveTemplateStore(store);
    this._refreshTemplateSelect();
    this.templateSelect.value = name;
  }

  applyTemplate(name) {
    const play = this.getCurrentPlay();
    if (!play) return;
    const tpl = this._templateStore()[name];
    if (!tpl) return;
    Object.entries(tpl).forEach(([k, v]) => { play.tags[k] = v; });
    this._loadTagForm(play);
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  async deleteSelectedTemplate() {
    if (!this.templateSelect || !this.templateSelect.value) return;
    const name = this.templateSelect.value;
    const ok = await this._confirmDialog(`Delete the template "${name}"?`, 'Delete Template');
    if (!ok) return;
    const store = this._templateStore();
    delete store[name];
    this._saveTemplateStore(store);
    this._refreshTemplateSelect();
    this.templateSelect.value = '';
  }

  /**
   * Lightweight in-app confirmation modal. Returns a Promise<boolean>.
   * Reliable replacement for window.confirm (which can be suppressed by the
   * browser). Enter / the Delete button confirm; Esc / Cancel / backdrop reject.
   */
  /**
   * Multi-choice modal (Windows-conflict-dialog style). buttons is an array of
   * { key, label, variant }; resolves to the chosen key, or null on Esc/backdrop.
   * Reuses the confirm-modal chrome + capture-phase keydown so the app's global
   * single-letter shortcuts can't fire underneath.
   */
  _choiceDialog(message, buttons) {
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
          <div class="ffa-confirm-actions"></div>
        </div>`;
      overlay.querySelector('.ffa-confirm-msg').textContent = message;
      const actions = overlay.querySelector('.ffa-confirm-actions');
      (buttons || []).forEach(b => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-sm ' + (b.variant || '');
        btn.dataset.key = b.key;
        btn.textContent = b.label;
        actions.appendChild(btn);
      });
      document.body.appendChild(overlay);
      const cleanup = (val) => { document.removeEventListener('keydown', onKey, true); overlay.remove(); resolve(val); };
      const onKey = (e) => {
        if (this._trapTab(e, overlay)) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cleanup(null); }
      };
      overlay.addEventListener('click', (e) => {
        const key = e.target.dataset ? e.target.dataset.key : null;
        if (key) cleanup(key);
        else if (e.target.classList.contains('ffa-confirm-backdrop')) cleanup(null);
      });
      document.addEventListener('keydown', onKey, true);
      const first = overlay.querySelector('[data-key]');
      if (first) first.focus();
    });
  }

  /** Keep Tab inside an open dialog — cycle its visible buttons/inputs.
   *  Returns true when the event was a handled Tab (caller returns early). */
  _trapTab(e, overlay) {
    if (e.key !== 'Tab') return false;
    e.preventDefault(); e.stopImmediatePropagation();
    const f = [...overlay.querySelectorAll('button, input')].filter(el => el.offsetParent !== null);
    if (!f.length) return true;
    const i = f.indexOf(document.activeElement);
    f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    return true;
  }

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
        if (this._trapTab(e, overlay)) return;
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

  /**
   * In-app text prompt (same shell as _confirmDialog — window.prompt() gets
   * suppressed by browsers too). Resolves the entered string, or null on
   * cancel/Esc/backdrop.
   */
  _promptDialog(message, confirmLabel = 'Save', placeholder = '') {
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
          <input type="text" class="ffa-confirm-input" />
          <div class="ffa-confirm-actions">
            <button type="button" class="btn btn-sm" data-act="cancel">Cancel</button>
            <button type="button" class="btn btn-sm btn-primary" data-act="ok"></button>
          </div>
        </div>`;
      overlay.querySelector('.ffa-confirm-msg').textContent = message;
      overlay.querySelector('[data-act="ok"]').textContent = confirmLabel;
      const input = overlay.querySelector('.ffa-confirm-input');
      input.placeholder = placeholder;
      document.body.appendChild(overlay);

      const cleanup = (val) => {
        document.removeEventListener('keydown', onKey, true);
        overlay.remove();
        resolve(val);
      };
      const onKey = (e) => {
        if (this._trapTab(e, overlay)) return;
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); cleanup(null); }
        else if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); cleanup(input.value); }
        else e.stopPropagation();   // typing must not fire tagging shortcuts
      };
      overlay.addEventListener('click', (e) => {
        const act = e.target.dataset ? e.target.dataset.act : null;
        if (act === 'ok') cleanup(input.value);
        else if (act === 'cancel' || e.target.classList.contains('ffa-confirm-backdrop')) cleanup(null);
      });
      document.addEventListener('keydown', onKey, true);
      input.focus();
    });
  }

  selectPlay(id) {
    this.currentPlayId = id;
    const play = this.getPlay(id);
    this._updateFormEnabled();
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

    // The coach edited the situation by hand — it's theirs now. Auto D&D
    // stops refreshing these values on this play.
    if (play._autoSit && (key === 'down' || key === 'distance' || key === 'fieldSide' || key === 'yardLine')) {
      play._autoSit = false;
    }
    if (key === 'down' || key === 'distance') this._updateDdReadout();

    // Picking an UNAMBIGUOUS play type auto-fills Run/Pass (coach can still
    // override). Ambiguous types — RPO, Play Action, Trick — leave it for the
    // coach to set, which is exactly why the explicit selector exists.
    if (key === 'playType') {
      const auto = PlayTagger.runPassForPlayType(play.tags.playType);
      if (auto && play.tags.runPass !== auto) {
        play.tags.runPass = auto;
        if (this.tagFields.runPass) this.tagFields.runPass.value = auto;
      }
    }

    // Entering positive yardage with no result yet means a gain — fill the
    // chip so the coach doesn't tap "Gain" on every routine play. Any explicit
    // result (or a later edit) still wins.
    if (key === 'yardage' && !play.tags.result) {
      const mag = parseInt(this.tagFields.yardage.value, 10);
      if (mag > 0) {
        play.tags.result = 'Gain';
        if (this.tagFields.result) this.tagFields.result.value = 'Gain';
      }
    }

    // Yardage is entered as a plain magnitude; the Result supplies the sign
    // (Loss / Sack = lost yards), so the coach never types a minus. tags.yardage
    // stays signed for stats/EPA/exports. Re-derive when either field changes.
    if (key === 'yardage' || key === 'result') {
      this._applyYardageSign(play);
    }

    this._updateTimeline();
    this._emit('play-updated', play);
  }

  /** Loss/Sack make yardage negative; everything else positive. Input shows the
   *  magnitude only; play.tags.yardage holds the signed value. */
  _applyYardageSign(play) {
    const el = this.tagFields.yardage;
    const raw = el ? String(el.value).trim() : String(play.tags.yardage ?? '');
    if (raw === '') { play.tags.yardage = ''; return; }
    const mag = Math.abs(parseInt(raw, 10) || 0);
    const parts = String(play.tags.result || '').split(/\s*\+\s*/);
    const neg = parts.includes('Loss') || parts.includes('Sack');
    play.tags.yardage = String(neg ? -mag : mag);
    if (el) el.value = String(mag); // keep the field showing the magnitude
  }

  // Mutually-exclusive members within a multi-select field: a play can't be
  // both Gain and Loss, or two realized pass looks. Single source of truth for
  // BOTH the tag-form chips (ChipField.exclusive) and the Film Room grid's
  // inline editor, so the two can never disagree (they used to: the grid had no
  // exclusivity and could store "Gain + Loss", which then flipped a gain
  // negative in _applyEdit).
  static EXCLUSIVE_GROUPS = {
    result: [['Gain', 'Loss', 'No Gain', 'Incomplete', 'Sack', 'Kneel', 'Spike'],
             ['Good', 'No Good']],
    playType: [['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass', 'Deep Pass']],
  };

  /** Normalize a " + "-joined multi value so no exclusive group has two members
   *  (keeps the LAST selected of each group — mirrors the form's drop-rivals). */
  static normalizeMulti(key, value) {
    let parts = String(value || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    const groups = PlayTagger.EXCLUSIVE_GROUPS[key];
    if (groups) {
      for (const group of groups) {
        const inGroup = parts.filter(p => group.includes(p));
        if (inGroup.length > 1) {
          const keep = inGroup[inGroup.length - 1];
          parts = parts.filter(p => !group.includes(p) || p === keep);
        }
      }
    }
    return parts.join(' + ');
  }

  /**
   * Map a play type to Run/Pass when it's unambiguous, else '' (ambiguous:
   * RPO, Play Action, Trick Play — coach picks).
   */
  static runPassForPlayType(playType) {
    const t = (playType || '').toLowerCase();
    if (!t) return '';
    if (t.includes('run')) return 'Run';
    if (t.includes('pass') || t.includes('screen')) return 'Pass';
    return ''; // RPO, Play Action, Trick Play
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
    this.tagFields.runPass.value = play.tags.runPass || '';
    this.tagFields.defFront.value = play.tags.defFront;
    this.tagFields.coverage.value = play.tags.coverage;
    this.tagFields.blitz.value = play.tags.blitz;
    this.tagFields.result.value = play.tags.result;
    // If this play carries a rare result (FG/Good/Kneel/…) keep the "More"
    // section open so the active chip is visible.
    if (this.resultRareWrap) {
      const hasRare = !!this.resultRareWrap.querySelector('.pick.active');
      if (hasRare && !this.resultRareWrap.classList.contains('show')) {
        this.resultRareWrap.classList.add('show');
        if (this.btnResultMore) {
          this.btnResultMore.classList.add('open');
          this.btnResultMore.textContent = 'Less ▴';
        }
      }
    }
    // Yardage is stored signed but shown as a magnitude (sign comes from Result).
    this.tagFields.yardage.value = (play.tags.yardage === '' || play.tags.yardage == null)
      ? '' : String(Math.abs(parseInt(play.tags.yardage, 10) || 0));
    this.tagFields.hash.value = play.tags.hash;
    this.tagFields.quarter.value = play.tags.quarter || '';
    this.tagFields.yardLine.value = play.tags.yardLine || '';
    this.tagFields.fieldSide.value = play.tags.fieldSide || 'own';
    this.tagFields.personnel.value = play.tags.personnel || '';
    this.tagFields.motion.value = play.tags.motion || '';
    this.tagFields.playDir.value = play.tags.playDir || '';
    this.tagFields.backfield.value = play.tags.backfield || '';
    this.tagFields.strength.value = play.tags.strength || '';
    this.tagFields.driveNumber.value = play.tags.driveNumber || '';
    this.tagFields.stType.value = play.tags.stType || '';
    this.tagFields.scoreFor.value = play.tags.scoreFor || '';
    this.tagFields.kickOutcome.value = play.tags.kickOutcome || '';
    this.tagFields.kickDistance.value = play.tags.kickDistance || '';
    this.tagFields.returnYards.value = play.tags.returnYards || '';
    this.tagFields.hangTime.value = play.tags.hangTime || '';
    this.tagFields.kickedTo.value = play.tags.kickedTo || '';
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
    this._applyStPhase(play.tags.stType || '');
    this._renderCustomTags(play.tags.custom);
    // Let add-ons (e.g. custom fields) re-render whenever a play is shown.
    if (this.onLoadForm) this.onLoadForm(play);
    this._updateDdReadout();
  }

  /** Live scorebug readout of the current Down & Distance in the tag form —
   *  the signature .dd-badge, mirroring how it renders in the play table. */
  _updateDdReadout() {
    const el = this.ddReadout !== undefined ? this.ddReadout
      : (this.ddReadout = document.getElementById('ddReadout'));
    if (!el) return;
    const down = this.tagFields.down.value;
    const dist = this.tagFields.distance.value;
    if (!down) { el.textContent = ''; el.style.display = 'none'; return; }
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' }[down] || down;
    el.textContent = dist ? `${ord} & ${dist}` : ord;
    el.classList.toggle('dd-badge--key', down === '3' || down === '4');
    el.style.display = '';
  }

  /**
   * User switched ST Play Type: drop any ST detail values the new phase doesn't
   * use, so a corrected phase can't leave stale data behind (e.g. a Punt's
   * "Downed" outcome on a play the coach re-tagged as a Field Goal — which would
   * silently keep that FG out of the made-kick count). Loading a saved play
   * calls _applyStPhase directly, so saved values are never cleared.
   */
  _onStPhaseChange(stType) {
    const phase = stType || '';
    const ok = (el) => !!el && (el.dataset.phases || '').split('|').includes(phase);
    const ko = this.tagFields.kickOutcome;
    if (ko && ko.value && !ok(document.querySelector(`#tagKickOutcome .pick[data-value="${ko.value}"]`))) {
      ko.value = ''; this._saveField('kickOutcome');
    }
    ['kickDistance', 'hangTime', 'returnYards', 'kickedTo'].forEach(key => {
      const el = this.tagFields[key];
      if (el && el.value && !ok(el.closest && el.closest('.st-field'))) { el.value = ''; this._saveField(key); }
    });
    this._applyStPhase(stType);
  }

  /**
   * Show only the special-teams detail fields/chips the selected ST Play Type
   * uses. Each .st-field and each Kick Outcome chip carries data-phases (the
   * stTypes it belongs to, "|"-separated); an empty stType hides them all.
   */
  _applyStPhase(stType) {
    const phase = stType || '';
    const inPhase = (el) => (el.dataset.phases || '').split('|').filter(Boolean).includes(phase);
    document.querySelectorAll('.st-field').forEach(el => el.classList.toggle('st-hidden', !phase || !inPhase(el)));
    document.querySelectorAll('#tagKickOutcome .pick[data-phases]').forEach(chip => chip.classList.toggle('st-hidden', !phase || !inPhase(chip)));
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

    // Special teams: the results that matter (Good / No Good / Field Goal)
    // live in the "More" expander — open it so charting the kicking game
    // doesn't cost an extra tap on every play.
    if (this.resultRareWrap && this.btnResultMore) {
      const showRare = unit === 'special' || !!this.resultRareWrap.querySelector('.pick.active');
      this.resultRareWrap.classList.toggle('show', showRare);
      this.btnResultMore.classList.toggle('open', showRare);
      this.btnResultMore.textContent = showRare ? 'Less ▴' : 'More ▾';
    }
  }

  _clearTagForm() {
    for (const el of Object.values(this.tagFields)) el.value = '';
    for (const el of Object.values(this.playerFields)) { if (el) el.value = ''; }
    for (const el of Object.values(this.gradeFields)) { if (el) el.value = ''; }
    this.tagChips.innerHTML = '';
    this._updateFormEnabled();
  }

  nextPlay() {
    const idx = this.plays.findIndex(p => p.id === this.currentPlayId);
    // No current selection: jump to the first play if any exist.
    if (idx === -1) {
      if (this.plays.length) {
        this.selectPlay(this.plays[0].id);
        return true;
      }
      return false;
    }
    if (idx < this.plays.length - 1) {
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

  /**
   * Like nextPlay(), but carries situation + unit forward. The down & distance
   * advance is gated on Auto D&D; the unit (Offense/Defense/Special) always
   * carries to an untagged next play so the coach doesn't re-pick the side
   * every snap ("persistent until changed").
   */
  nextPlayWithSituation() {
    const prev = this.getCurrentPlay();
    const carryUnit = (prev && prev.tags.unit) || this.defaultUnit;
    const advanced = this.nextPlay();
    if (advanced) {
      const next = this.getCurrentPlay();
      if (next) {
        if (this.autoDD && prev) this.applyNextSituation(prev, next);
        // Carry the side forward only when the next play hasn't been set yet,
        // so we never overwrite a play already tagged as a different unit.
        if (carryUnit && !next.tags.unit) this.setUnit(carryUnit);
        if (this.carryScheme && prev) this.applyCarryScheme(prev, next);
      }
    }
    return advanced;
  }

  /** Alignment fields the carry-scheme toggle copies forward — pre-snap looks
   *  only, never what happened on the snap (play type / result / yardage). */
  static get CARRY_SCHEME_KEYS() {
    return ['formation', 'personnel', 'defFront', 'coverage'];
  }

  /** Fill the next play's blank alignment fields from the previous play.
   *  Existing values are never overwritten — a different look the coach
   *  already tagged always wins, and one tap changes any carried chip. */
  applyCarryScheme(prev, next) {
    // Carry alignment ONLY within the same unit. These fields flip meaning across
    // a possession change: on an OFFENSE snap defFront/coverage are the DEFENSE
    // FACED (the opponent's), on a DEFENSE snap they're OUR defense — so carrying
    // across the boundary leaks our own front/coverage onto the "defense faced"
    // (e.g. our Maverick front showing up as the opponent's), and an offensive
    // formation onto a defensive snap. Special teams uses none of these fields.
    // Same class of bug as the ST "Under Center" leak.
    const pu = prev.tags.unit || 'offense', nu = next.tags.unit || 'offense';
    if (nu === 'special' || pu !== nu) return;
    let changed = false;
    PlayTagger.CARRY_SCHEME_KEYS.forEach(k => {
      if (!next.tags[k] && prev.tags[k]) {
        next.tags[k] = prev.tags[k];
        changed = true;
      }
    });
    if (changed) {
      this._loadTagForm(next);
      this._emit('play-updated', next);
    }
  }

  /** The ST tag form hides Formation/Personnel + Front/Coverage/Blitz, so those
   *  fields can't be set on a special-teams play — any value there is a leak
   *  (e.g. a formation carried over from an offense snap). Clear them when a play
   *  is special. Returns true if anything changed. */
  _stripStAlignment(play) {
    if (!play || (play.tags.unit || 'offense') !== 'special') return false;
    let changed = false;
    ['formation', 'personnel', 'defFront', 'coverage', 'blitz'].forEach(k => {
      if (play.tags[k]) { play.tags[k] = ''; changed = true; }
    });
    return changed;
  }

  /** Set the unit (Offense/Defense/Special) on the current play and relayout. */
  setUnit(unit) {
    unit = unit || 'offense';
    if (this.unitField) this.unitField.value = unit;
    const play = this.getCurrentPlay();
    if (play) {
      play.tags.unit = unit;
      if (this._stripStAlignment(play)) this._loadTagForm(play);
      this._emit('play-updated', play);
    }
    this.applyUnitMode(unit);
  }

  _absYL(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  /** Carry the previous play's spot unchanged (spike/kneel/penalty replay).
   *  The spot is unit-agnostic — only special teams (possession flip) skips it. */
  _sameSpot(t) {
    const spot = { fieldSide: null, yardLine: null };
    if (t.unit === 'special') return spot;
    const abs = this._absYL(t);
    if (abs != null) {
      if (abs <= 50) { spot.fieldSide = 'own'; spot.yardLine = abs; }
      else { spot.fieldSide = 'opp'; spot.yardLine = 100 - abs; }
    }
    return spot;
  }

  /**
   * Given the just-tagged previous play, compute the next play's situation.
   * Returns null when the possession ends (TD, turnover, punt, FG, etc.) or
   * when there isn't enough info — in those cases we leave the next play blank
   * for the coach to start fresh.
   */
  computeNextSituation(prev) {
    const t = prev.tags;
    const stop = new Set(['Touchdown', 'Interception', 'Fumble', 'Punt', 'Field Goal', 'Good', 'No Good', 'Safety']);
    const resultParts = String(t.result || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    if (resultParts.some(r => stop.has(r))) return null;

    // Spike/Kneel burn a down within the same possession (2nd & 10 → spike →
    // 3rd & 10) — exactly the two-minute / victory situations where re-typing
    // the situation hurts most. Treat as a 0-yard play at the same spot.
    if (resultParts.includes('Spike') || resultParts.includes('Kneel')) {
      const down = parseInt(t.down);
      const distance = parseInt(t.distance);
      if (!down || isNaN(distance) || down >= 4) return null;
      return { down: String(down + 1), distance: String(distance), ...this._sameSpot(t) };
    }

    const down = parseInt(t.down);
    const distance = parseInt(t.distance);
    if (!down || isNaN(distance)) return null;

    // A penalty usually replays the down (possibly at a new distance the
    // penalty set). Pre-fill the SAME down & distance instead of blanking the
    // form — the coach adjusts distance if the flag moved the sticks, which is
    // still faster than re-entering everything. Field position carries as-is.
    if (resultParts.includes('Penalty')) {
      return { down: String(down), distance: String(distance), ...this._sameSpot(t) };
    }

    let gained = parseInt(t.yardage);
    if (isNaN(gained)) gained = 0;

    const firstDown = gainedFirstDown(t);

    // Field position: our offense drives the ball UP the field (abs grows);
    // when we're tagging defense, the opponent's offense has the ball and
    // their gains move it toward OUR goal (abs shrinks). Either way the spot
    // advances — only special teams is left blank (possession flips).
    const unit = t.unit || 'offense';
    let fieldSide = null, yardLine = null, distToGoal = null;
    if (unit === 'offense' || unit === 'defense') {
      const abs = this._absYL(t);
      if (abs != null) {
        const newAbs = Math.min(99, Math.max(1, unit === 'defense' ? abs - gained : abs + gained));
        if (newAbs <= 50) { fieldSide = 'own'; yardLine = newAbs; }
        else { fieldSide = 'opp'; yardLine = 100 - newAbs; }
        // Goal-to-go is measured toward whichever goal the ball is moving:
        // the opponent's for our offense, ours for theirs.
        distToGoal = unit === 'defense' ? newAbs : 100 - newAbs;
      }
    }

    let nextDown, nextDist;
    if (firstDown) {
      nextDown = 1;
      nextDist = (distToGoal != null && distToGoal < 10) ? distToGoal : 10;
    } else {
      if (down >= 4) return null; // turnover on downs — new possession
      nextDown = down + 1;
      nextDist = Math.max(1, distance - gained);
      if (distToGoal != null && distToGoal < nextDist) nextDist = Math.max(1, distToGoal);
    }
    return { down: String(nextDown), distance: String(nextDist), fieldSide, yardLine };
  }

  /**
   * Pre-fill the next play's situation. The coach's own entries always win:
   * a down the coach typed (or imported data) is never touched. But values
   * THIS feature wrote earlier are marked (`play._autoSit`) and stay live —
   * correcting the previous play's yardage/result and advancing again
   * re-computes them, so a fixed play never strands a stale auto-filled
   * situation downstream. Any manual edit to down/distance/field position
   * clears the mark and freezes the values (see _saveField).
   */
  applyNextSituation(prev, next) {
    // The game clock doesn't reset when the ball changes hands — carry the
    // quarter into a blank field no matter how the previous play ended (it
    // used to carry only mid-possession, so every score/punt/turnover dropped
    // it and the next series came up unquartered).
    const carriedQuarter = !next.tags.quarter && !!prev.tags.quarter;
    if (carriedQuarter) next.tags.quarter = prev.tags.quarter;

    if (next.tags.down && !next._autoSit) {
      // Coach/imported situation — hands off, but still show the carried quarter.
      if (carriedQuarter) { this._loadTagForm(next); this._emit('play-updated', next); }
      return;
    }
    const sit = this.computeNextSituation(prev);
    if (!sit) {
      // Possession now ends on the corrected previous play — the situation we
      // auto-filled before is wrong. Blank it (only ever touches auto values).
      let changed = carriedQuarter;
      if (next._autoSit) {
        next.tags.down = '';
        next.tags.distance = '';
        next._autoSit = false;
        changed = true;
      }
      if (changed) {
        this._loadTagForm(next);
        this._updateTimeline();
        this._emit('play-updated', next);
      }
      return;
    }
    next.tags.down = sit.down;
    next.tags.distance = sit.distance;
    if (sit.fieldSide != null) next.tags.fieldSide = sit.fieldSide;
    if (sit.yardLine != null) next.tags.yardLine = String(sit.yardLine);
    // Same drive continues unless already set.
    if (!next.tags.driveNumber && prev.tags.driveNumber) next.tags.driveNumber = prev.tags.driveNumber;
    next._autoSit = true;
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
    // "No plays yet" — this placeholder shows when the game has NO plays; it
    // used to say "No plays tagged", which misread as a tagging-status claim.
    this.playSelect.innerHTML = '<option value="">No plays yet</option>';
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
    this._updateFormEnabled();
  }

  /**
   * Timeline segment color class. Run/pass come from the run-pass classifier;
   * otherwise a TAGGED non-run/pass snap (special teams, penalty, defense with
   * no run/pass) is 'other', and only a genuinely UNTAGGED play is 'untagged'.
   * Without the split, a tagged kick-return rendered identically to an empty
   * play (both fell through to the gray 'other'), so tagged ST/defense snaps
   * looked untagged on the strip. isPlayTagged is the shared "is this tagged"
   * rule (same one the counter + Film Room grid use).
   */
  _timelineTypeClass(p) {
    const rp = p.tags.runPass;
    const t = (p.tags.playType || '').toLowerCase();
    if (rp === 'Run' || (!rp && t.includes('run'))) return 'run';
    if (rp === 'Pass' || (!rp && (t.includes('pass') || t.includes('screen')))) return 'pass';
    return isPlayTagged(p) ? 'other' : 'untagged';
  }

  _updateTimeline() {
    this.timelineBar.innerHTML = '';
    this.timelineBar.style.width = '';   // reset any high-N expansion

    // Multi-clip mode: per-play timestamps are all clip-relative (0..clipDur),
    // so positioning them against the CURRENT clip's duration stacks every
    // play at left:0. Render one equal segment per play in playlist order
    // instead — the strip becomes a clip navigator.
    const playlist = this.playlist;
    if (playlist && playlist.hasClips) {
      const n = this.plays.length;
      if (!n) return;
      this.plays.forEach((p, i) => {
        const div = document.createElement('div');
        const typeClass = this._timelineTypeClass(p);
        div.className = `timeline-play ${typeClass}${p.id === this.currentPlayId ? ' active' : ''}`;
        div.style.left = (i / n) * 100 + '%';
        div.style.width = Math.max(100 / n - 0.15, 0.4) + '%';
        div.textContent = n <= 40 ? `${p.id}` : '';
        div.title = `Play ${p.id}: ${p.tags.playType || p.tags.stType || p.tags.defFront || (isPlayTagged(p) ? 'tagged' : 'Untagged')}`;
        div.addEventListener('click', () => this.selectPlay(p.id));
        this.timelineBar.appendChild(div);
      });
      // Expand AFTER appending: while the bar is empty the strip is
      // display:none (the :empty collapse), so clientWidth reads 0.
      this._expandTimelineFor(n);
      this._centerActiveTimeline();
      return;
    }

    const duration = this.vc.duration;
    if (!duration) return;

    this.plays.forEach(p => {
      const left = (p.timestamp.start / duration) * 100;
      const width = ((p.timestamp.end - p.timestamp.start) / duration) * 100;
      const div = document.createElement('div');

      const typeClass = this._timelineTypeClass(p);

      div.className = `timeline-play ${typeClass}${p.id === this.currentPlayId ? ' active' : ''}`;
      div.style.left = left + '%';
      div.style.width = Math.max(width, 0.5) + '%';
      div.textContent = `${p.id}`;
      div.title = `Play ${p.id}: ${p.tags.playType || p.tags.stType || p.tags.defFront || (isPlayTagged(p) ? 'tagged' : 'Untagged')}`;
      div.addEventListener('click', () => this.selectPlay(p.id));
      this.timelineBar.appendChild(div);
    });
    this._expandTimelineFor(this.plays.length);
    this._centerActiveTimeline();
  }

  /** High clip counts turned the Field Strip into un-clickable slivers
   *  (81 clips ≈ 6px each). Guarantee each marker ~16px by widening the BAR
   *  (markers are %-positioned, so they scale with it) and letting the strip
   *  scroll horizontally; the active play is kept centered in view. */
  _expandTimelineFor(n) {
    const MIN_MARKER = 16;
    const strip = this.timelineBar.parentElement;
    if (!strip) return;
    const need = n * MIN_MARKER;
    if (need > strip.clientWidth && strip.clientWidth > 0) {
      this.timelineBar.style.width = need + 'px';
    }
    // Wheel scrolls the strip horizontally when it overflows (one-time bind).
    if (!strip._ffaWheelBound) {
      strip._ffaWheelBound = true;
      strip.addEventListener('wheel', (e) => {
        if (strip.scrollWidth <= strip.clientWidth) return;
        e.preventDefault();
        strip.scrollLeft += (e.deltaY || e.deltaX);
      }, { passive: false });
    }
  }

  _centerActiveTimeline() {
    const strip = this.timelineBar.parentElement;
    if (!strip || strip.scrollWidth <= strip.clientWidth) return;
    const act = this.timelineBar.querySelector('.timeline-play.active');
    if (!act) return;
    strip.scrollLeft = act.offsetLeft - strip.clientWidth / 2 + act.offsetWidth / 2;
  }

  // Also update scrub bar play markers
  updateScrubBarPlays() {
    const container = document.getElementById('scrubBarPlays');
    if (!container) return;
    container.innerHTML = '';
    // Multi-clip mode: clip-relative timestamps would draw one overlapping
    // blob over the whole bar — the scrub bar tracks ONE clip, so skip them.
    if (this.playlist && this.playlist.hasClips) return;
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
