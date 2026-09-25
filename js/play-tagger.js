import { countedUnit, gainedFirstDown, isPlayTagged } from './football-rules.js';
import { PenaltyModel } from './penalty-model.js';
import { SeasonStore } from './season-store.js';
import { TagProjection } from './tag-projection.js';
// E4: the form must SEED from the projected view (StatsEngine.proj), never raw
// tags — see the _loadTagForm/formation comment below for why seeding from raw
// is not just "less honest" but an active data-corruption hazard for ChipField.
// No import cycle: stats-engine.js does not import play-tagger.js.
import { StatsEngine } from './stats-engine.js';

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
 * PlainField — Final Engine Independence: a DOM-free value holder carrying
 * the EXACT same public contract as ChipField above (.value get/set,
 * .toggle(v), .addEventListener('change', fn)), minus the DOM element it
 * used to wrap. PlayTagger's field-consuming logic (_saveField,
 * _loadTagForm, EXCLUSIVE_GROUPS, the multi-value " + " join) is byte-for-
 * byte unchanged whether a field is native-owned (this) or, for any legacy
 * consumer that still constructs one directly, DOM-backed (ChipField) — only
 * the storage backing changes. The coach-visible tag form
 * (native-tagging.jsx) never reads this object at all; it renders its own
 * chip buttons from `state.values[field]` (a plain snapshot of play.tags)
 * and calls PlayTagger's setField/toggleField, which write straight through
 * this holder. There is no hidden DOM this class depends on for correctness.
 */
class PlainField {
  constructor(opts = {}) {
    this.multi = !!opts.multi;
    this.exclusive = opts.exclusive || [];
    this._value = '';
    this._values = [];
    this._listeners = {};
  }
  get value() { return this.multi ? this._values.join(' + ') : this._value; }
  set value(v) {
    if (this.multi) this._values = String(v || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    else this._value = v || '';
  }
  /** Remove values that are mutually exclusive with v (multi mode). Same rule
   *  as ChipField._dropRivals, kept in sync deliberately (both read the same
   *  PlayTagger.EXCLUSIVE_GROUPS table passed in at construction). */
  _dropRivals(v) {
    for (const group of this.exclusive) {
      if (!group.includes(v)) continue;
      this._values = this._values.filter(x => x === v || !group.includes(x));
    }
  }
  toggle(v) {
    if (this.multi) {
      const i = this._values.indexOf(v);
      if (i >= 0) this._values.splice(i, 1);
      else { this._dropRivals(v); this._values.push(v); }
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
 * PlainInput — the same DOM-free contract as PlainField, sized for the plain
 * numeric/text tag fields (yardage, distance, drive number, jersey #, grade)
 * that were never chip groups — the legacy code read/wrote these directly as
 * raw `<input>` elements (`.value`, a `change` event). No toggle/exclusivity
 * semantics; a bare value holder.
 */
class PlainInput {
  constructor() {
    this._value = '';
    this._listeners = {};
  }
  get value() { return this._value; }
  set value(v) { this._value = v == null ? '' : v; }
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

    // Native tagging owns template selection explicitly. This is product state,
    // not a detached form control pretending the deleted legacy UI still exists.
    this.selectedTemplate = '';

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
      qbAlignment: 'tagQbAlignment', coverageFamily: 'tagCoverageFamily',
      kickOutcome: 'tagKickOutcome', kickDistance: 'tagKickDistance',
      returnYards: 'tagReturnYards', hangTime: 'tagHangTime', kickedTo: 'tagKickedTo',
    };
    this.tagFields = {};
    // Multi-select fields stored as " + "-joined strings. Formation: a QB can
    // be Pistol AND Spread. Play Type: an RPO that becomes a run or a pass can
    // carry both "RPO" and the realized look (e.g. "RPO + Short Pass").
    // Def Front: a base front plus a shift package (e.g. "Maverick + Jumbo Shift").
    const multiFields = new Set(PlayTagger.MULTI_TAGS);
    // Within multi-select Result, the base outcomes are mutually exclusive —
    // a play can't be Gain AND Loss. Picking one replaces its rivals, so a
    // correction tap (or keyboard key) never leaves "Gain + Loss" behind.
    // Combinable results (Fumble + Touchdown, Interception + Touchdown,
    // Sack + Fumble, Penalty + anything) are unaffected.
    // Exclusivity groups live on PlayTagger (static) so the Film Room grid's
    // inline editor applies the identical rule — see PlayTagger.EXCLUSIVE_GROUPS.
    // Final Engine Independence: field storage is DOM-free. `inputFields` are
    // the plain numeric fields (never chip groups, even in the legacy form —
    // confirmed against index.html's own markup before this conversion);
    // every other fieldMap key becomes a PlainField (chip-group semantics:
    // toggle, multi-join, exclusivity). Neither reads or writes any DOM
    // element — the coach-visible chips live entirely in native-tagging.jsx,
    // which calls PlayTagger.setField/toggleField (via NativeTaggingScreen),
    // which write straight into these holders exactly as the legacy
    // ChipField-over-hidden-DOM path used to, minus the DOM.
    const inputFields = new Set(['distance', 'yardage', 'yardLine', 'driveNumber', 'kickDistance', 'returnYards', 'hangTime', 'kickedTo']);
    for (const [key] of Object.entries(fieldMap)) {
      this.tagFields[key] = inputFields.has(key)
        ? new PlainInput()
        : new PlainField({ multi: multiFields.has(key), exclusive: PlayTagger.EXCLUSIVE_GROUPS[key] });
    }

    // Per-play player attribution (jersey #) by role.
    this.playerFields = {
      ballCarrier: new PlainInput(), passer: new PlainInput(), receiver: new PlainInput(),
      tackler: new PlainInput(), takeaway: new PlainInput(), kicker: new PlainInput(), returner: new PlainInput(),
    };

    // Per-play player grading (+/- per snap).
    this.gradeFields = {
      ballCarrier: new PlainInput(), passer: new PlainInput(), receiver: new PlainInput(),
      tackler: new PlainInput(), takeaway: new PlainInput(), kicker: new PlainInput(), returner: new PlainInput(),
    };

    // The charting unit (Offense / Defense / Special Teams). The native deck
    // renders it; this field is the tagger's own record of it.
    this.unitField = new PlainField();
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

    this.currentDrive = 1;

    // Optional toast hook (App wires this to the shared toast) for inline
    // feedback like "Mark the start first".
    this.toast = null;

    this._bindEvents();

    if (this.unitField) this.unitField.value = this.defaultUnit;
  }

  /**
   * THE BLANK TAG SCHEMA — every new or cleared play starts from this one
   * object (LG-1, 2026-09-25). Five hand-written copies had drifted: clip
   * import's omitted `unit` (33 unit-less plays in a live season), players,
   * grades and eleven more fields; CSV import's omitted grades and stType.
   * `unit` is always set: a play that did not exist yet takes the carried unit.
   */
  static blankTags({ unit = 'offense', driveNumber = '' } = {}) {
    return {
      down: '', distance: '', formation: '', qbAlignment: '', backfield: '', strength: '',
      playCall: '', playCallId: '', playConcept: '', playType: '', runPass: '',
      defFront: '', coverage: '', coverageFamily: '', blitz: '', result: '', fumbleRecovery: '', yardage: '',
      hash: '', quarter: '', yardLine: '', fieldSide: 'own', personnel: '', motion: '', playDir: '',
      driveNumber: String(driveNumber ?? ''), unit, stType: '',
      players: {}, grades: {}, custom: [], customFields: {},
    };
  }
  /** Tags for a play created now: the carried unit and the current drive. */
  newPlayTags() {
    return PlayTagger.blankTags({ unit: this.defaultUnit || 'offense', driveNumber: this.currentDrive.toString() });
  }

  /** "N / M tagged" — the same computation app.js's legacy _updateTagProgress
   *  wrote into a hidden DOM label; native-tagging-screen.js's snapshot()
   *  calls this directly instead of reading that label's textContent back
   *  out, so the coach-visible progress line has one owner, not a DOM round-trip. */
  progressText() {
    const total = this.plays.length;
    const tagged = this.plays.filter(isPlayTagged).length;
    return `${tagged} / ${total} tagged`;
  }

  _bindEvents() {

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
      this.unitField.addEventListener('change', () => this._onUnitFieldChanged());
    }

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
      tags: this.newPlayTags(),
      annotations: [],
      notes: '',
      clipName: name || ''
    };
    this.plays.push(play);
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
      this.selectPlay(placeholder.id);
      this._emit('play-updated', placeholder);
      return;
    }

    const play = {
      id: this.nextId++,
      timestamp: { start: this.pendingStart, end: endTime },
      tags: this.newPlayTags(),
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

    this.selectPlay(play.id);
    this._emit('play-created', play);
  }

  async deleteCurrentPlay() {
    const id = this.currentPlayId;
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
    // This branch also covers deleting a play with NO film loaded, which is
    // where a durable clip record used to survive its own play indefinitely:
    // the playlist is empty, so nothing else ever signalled the removal.
    const idx = this.plays.findIndex(p => p.id === id);
    const removedIdentity = ((play?.clipPath || play?.clipName) || '').trim();
    if (removedIdentity) window.app?.storage?.forgetClipIdentity?.(removedIdentity);
    this.plays = this.plays.filter(p => p.id !== id);
    this.currentPlayId = null;
    this._clearTagForm();
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
    const play = id ? this.getPlay(id) : null;

    const msg = play
      ? `Clear all tags and notes on Play ${id}? The play and video stay.`
      : 'Clear the current tag selections?';
    const ok = await this._confirmDialog(msg, 'Clear Tags');
    if (!ok) return;

    if (play) {
      // Clearing keeps the play's drive and the unit on screen (code review CR-2).
      play.tags = PlayTagger.blankTags({ unit: countedUnit(play), driveNumber: play.tags.driveNumber || this.currentDrive.toString() });
      play.notes = '';
      this._emit('play-updated', play);
    }

    // Always reset the visible form fields, chips, players, grades and notes.
    this._clearTagForm();
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
    return ['unit', 'qbAlignment', 'formation', 'backfield', 'strength', 'personnel',
            'motion', 'runPass', 'playType', 'defFront', 'coverage', 'coverageFamily',
            'blitz', 'hash'];
  }

  /** Copy scheme tags from the play immediately before the current one. */
  copyFromPrevious() {
    const play = this.getCurrentPlay();
    if (!play) return;
    const idx = this.plays.findIndex(p => p.id === play.id);
    if (idx <= 0) return; // no previous play
    const prev = this.plays[idx - 1];
    PlayTagger.SCHEME_KEYS.forEach(k => { play.tags[k] = prev.tags[k] || (k === 'unit' ? 'offense' : ''); });
    // Copying carries `unit` too — if the result is special, the alignment fields
    // it just copied are forbidden and must be stripped (ST invariant, any op).
    this._stripStAlignment(play);
    this._loadTagForm(play);
    this._emit('play-updated', play);
  }

  _templateStore() {
    try { return JSON.parse(localStorage.getItem('ffa_play_templates') || '{}') || {}; }
    catch { return {}; }
  }
  _saveTemplateStore(obj) {
    try { localStorage.setItem('ffa_play_templates', JSON.stringify(obj)); } catch {}
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
    this.selectedTemplate = name;
    return name;
  }

  applyTemplate(name) {
    const play = this.getCurrentPlay();
    if (!play) return false;
    const tpl = this._templateStore()[name];
    if (!tpl) return false;
    this.selectedTemplate = name;
    Object.entries(tpl).forEach(([k, v]) => { play.tags[k] = v; });
    // A template can carry `unit:'special'` + forbidden alignment (saved from a
    // mis-tagged play); strip it when the result is special (ST invariant).
    this._stripStAlignment(play);
    this._loadTagForm(play);
    this._emit('play-updated', play);
    return true;
  }

  async deleteTemplate(name = this.selectedTemplate) {
    if (!name) return false;
    const store = this._templateStore();
    if (!store[name]) {
      if (this.selectedTemplate === name) this.selectedTemplate = '';
      return false;
    }
    const ok = await this._confirmDialog('Delete the template "' + name + '"?', 'Delete Template');
    if (!ok) return false;
    delete store[name];
    this._saveTemplateStore(store);
    if (this.selectedTemplate === name) this.selectedTemplate = '';
    return true;
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
    if (!play) return;
    this._loadTagForm(play);

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

  /**
   * THE CHARTING WRITE (legacy excision Pass 2, step 1). Writes one tag of a
   * play from an explicit value: projection reconcile, the manual-situation
   * flag, auto Run/Pass, auto Gain and the yardage sign, then one play-updated
   * emit (one undoable transaction). It reads no form field: Chart, Film Room
   * and the keyboard all pass the value, so what is shown and what is stored
   * cannot drift the way a mirrored form field let them (S99-2).
   */
  setTagValue(key, value, play = this.getCurrentPlay()) {
    if (!play) return false;
    // E4/E4-2 D-projform PROMOTE-ON-EXPLICIT-COMMIT — same mechanic + same
    // shared TagProjection descriptor as Film Room's grid editor
    // (play-grid.js _applyEdit, E3b-P1). A legacy play stores a sibling
    // dimension INSIDE a primary field's string (QB alignment inside
    // formation/backfield, 'Empty' inside formation, coverage family inside
    // coverage); overwriting the primary with the coach's new explicit pick
    // would silently destroy that sibling data, and committing a sibling
    // directly (including clearing it) would leave the primary's embedded
    // token to silently re-win on the next read. `reconcileSiblings` runs
    // BOTH directions in one call — see its doc comment for the full
    // rationale, including why a key like `backfield` can be primary and
    // sibling at once. The whole thing happens before the single
    // play-updated emit below, so HistoryManager records it as ONE undoable
    // transaction, exactly like the grid editor's proof requires.
    TagProjection.reconcileSiblings(play, key);
    play.tags[key] = value == null ? '' : value;

    // The coach edited the situation by hand — it's theirs now. Auto D&D
    // stops refreshing these values on this play.
    if (play._autoSit && (key === 'down' || key === 'distance' || key === 'fieldSide' || key === 'yardLine')) {
      play._autoSit = false;
    }

    // Picking an UNAMBIGUOUS play type auto-fills Run/Pass (coach can still
    // override). Ambiguous types — RPO, Play Action, Trick — leave it for the
    // coach to set, which is exactly why the explicit selector exists.
    if (key === 'playType') {
      const auto = PlayTagger.runPassForPlayType(play.tags.playType);
      if (auto && play.tags.runPass !== auto) {
        play.tags.runPass = auto;
      }
    }

    // Entering positive yardage with no result yet means a gain — fill the
    // chip so the coach doesn't tap "Gain" on every routine play. Any explicit
    // result (or a later edit) still wins.
    if (key === 'yardage' && !play.tags.result) {
      const mag = parseInt(play.tags.yardage, 10);
      if (mag > 0) {
        play.tags.result = 'Gain';
      }
    }

    // Yardage is entered as a plain magnitude; the Result supplies the sign
    // (Loss / Sack = lost yards), so the coach never types a minus. tags.yardage
    // stays signed for stats/EPA/exports. Re-derive when either field changes.
    if (key === 'yardage' || key === 'result') {
      this._applyYardageSign(play);
    }
    this._emit('play-updated', play);
  }
  /** Transitional: the fake-field path, now a wrapper over setTagValue. Deleted
   *  with the fields once every caller passes values (Pass 2, step 1). */
  _saveField(key) {
    const play = this.getCurrentPlay();
    if (!play) return;
    this.setTagValue(key, this.tagFields[key].value, play);
    if (this.tagFields.runPass) this.tagFields.runPass.value = play.tags.runPass || '';
    if (this.tagFields.result) this.tagFields.result.value = play.tags.result || '';
  }

  /** The value Chart shows for a tag: the projected value for the look fields,
   *  the magnitude for yardage, the stored value otherwise. A toggle starts
   *  from exactly this, as the deck's chips do. */
  displayTagValue(key, play = this.getCurrentPlay()) {
    if (!play) return '';
    if (key === 'yardage') {
      const y = play.tags.yardage;
      return y === '' || y == null ? '' : String(Math.abs(parseInt(y, 10) || 0));
    }
    if (StatsEngine.PROJECTED_FIELDS.includes(key)) return StatsEngine.projField(play, key) || '';
    if (key === 'fieldSide') return play.tags.fieldSide || 'own';
    return play.tags[key] == null ? '' : String(play.tags[key]);
  }

  /** Tap a chip: a multi-select field adds or removes the value (an added value
   *  replaces its exclusive rivals); a single-select field sets it, or clears it
   *  when it is already set. Then the one write. */
  toggleTagValue(key, value, play = this.getCurrentPlay()) {
    if (!play) return false;
    const current = this.displayTagValue(key, play);
    let next;
    if (PlayTagger.MULTI_TAGS.includes(key)) {
      let parts = current.split(/\s*\+\s*/).map(v => v.trim()).filter(Boolean);
      if (parts.includes(value)) parts = parts.filter(v => v !== value);
      else {
        for (const group of PlayTagger.EXCLUSIVE_GROUPS[key] || []) {
          if (group.includes(value)) parts = parts.filter(v => !group.includes(v));
        }
        parts.push(value);
      }
      next = parts.join(' + ');
    } else {
      next = current === value ? '' : value;
    }
    return this.setTagValue(key, next, play);
  }

  /** Multi-select tags, stored as " + "-joined strings. */
  static MULTI_TAGS = Object.freeze(['formation', 'playType', 'result', 'blitz', 'defFront']);

  /** Player attribution (jersey #) by role; blank removes it. */
  setPlayerValue(role, value, play = this.getCurrentPlay()) {
    if (!play) return false;
    if (!play.tags.players) play.tags.players = {};
    const val = String(value ?? '').trim();
    if (val) play.tags.players[role] = val;
    else delete play.tags.players[role];
    this._emit('play-updated', play);
    return true;
  }

  /** A player's grade on this snap; blank removes it. */
  setGradeValue(role, value, play = this.getCurrentPlay()) {
    if (!play) return false;
    if (!play.tags.grades) play.tags.grades = {};
    const val = String(value ?? '').trim();
    if (val !== '') play.tags.grades[role] = parseInt(val);
    else delete play.tags.grades[role];
    this._emit('play-updated', play);
    return true;
  }


  /** Loss/Sack make yardage negative; everything else positive. Input shows the
   *  magnitude only; play.tags.yardage holds the signed value. */
  _applyYardageSign(play) {
    // The play is the source: the value just written (a magnitude) or the
    // stored signed value when only the result changed. A form field is never
    // read (it once overwrote an API write with its own stale value).
    const el = this.tagFields.yardage;
    const raw = String(play.tags.yardage ?? '').trim();
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
   * RPO, Option, Play Action, Trick Play — coach picks). `Option` is ambiguous
   * for the same reason RPO is and for a different football reason: the read
   * happens after the snap, so the realized play can be either. It is NOT in
   * EXCLUSIVE_GROUPS.playType, so `Option + Run Outside` charts the call and the
   * realized look together.
   */
  static runPassForPlayType(playType) {
    const runTypes = new Set(['Run Inside','Run Outside']);
    const passTypes = new Set(['Screen','Short Pass','Medium Pass','Deep Pass']);
    const ambiguousTypes = new Set(['RPO','Option','Play Action','Trick Play']);
    const types = StatsEngine.splitPlayTypes(playType);
    if (types.some(type => !runTypes.has(type) && !passTypes.has(type) && !ambiguousTypes.has(type))) return '';
    const classified = new Set(types.map(type =>
      runTypes.has(type) ? 'Run' : passTypes.has(type) ? 'Pass' : '').filter(Boolean));
    return classified.size === 1 ? [...classified][0] : '';
  }

  _savePlayer(role) { this.setPlayerValue(role, this.playerFields[role].value); }

  _saveGrade(role) { this.setGradeValue(role, this.gradeFields[role].value); }

  /**
   * D-projform E4 review fix (Codex): Save & Next is this app's "explicit
   * save" gesture (per-field chip saves are already immediate; Save & Next is
   * the coach's deliberate "I'm done with this play" moment — see
   * App._advancePlay). An untouched LEGACY play — reviewed but never given a
   * Formation/Coverage/QB Alignment/Backfield/Coverage Family chip click this
   * visit — previously left with its projected siblings still un-promoted and
   * its primary fields still raw, so it could never leave the (Lane R)
   * "Legacy tags to review" list, whose exit condition (§18 D-laneR) is
   * exactly "the coach explicitly saves the projected play." For each
   * registered PRIMARY (formation, backfield, coverage), this both runs
   * `reconcileSiblings` (promotes each blank sibling) AND re-commits the
   * primary to its OWN fully-projected value (`StatsEngine.proj(play)
   * [primaryKey]`), which strips every registered sibling's token from it at
   * once — the same self-clean an explicit chip commit on that field already
   * produces, applied even when the coach never touched the chip. One
   * field-level-merge commit per primary, never touching any other field
   * (down, playType, result, players, notes, penalties, ST data, ...). A
   * genuinely clean play is a true no-op: no mutation, no history entry, no
   * play-updated emit, so Save & Next stays silent on the overwhelming
   * majority of plays that need no cleanup.
   */
  commitProjectedLook() {
    const play = this.getCurrentPlay();
    if (!play) return;
    let changed = false;
    for (const primaryKey of Object.keys(TagProjection.PROJECTED_PAIRS)) {
      if (TagProjection.reconcileSiblings(play, primaryKey)) changed = true;
      // project() always returns a STRING for these fields, even when blank;
      // a legacy/synthetic play's tags object often has no key at all for a
      // field it was never charted with (`undefined`, not `''`). Comparing
      // those raw would flag a "change" for nearly every ordinary play that
      // simply never carried e.g. `backfield` — normalize both sides through
      // the same blank-equivalence _saveField already uses elsewhere so only
      // a REAL legacy token being stripped counts as a change.
      const projectedSelf = StatsEngine.proj(play)[primaryKey];
      if (String(projectedSelf || '') !== String(play.tags[primaryKey] || '')) {
        play.tags[primaryKey] = projectedSelf;
        changed = true;
      }
    }
    if (!changed) return;
    this._emit('play-updated', play);
  }

  _loadTagForm(play) {
    // E4: Formation and Coverage seed from the PROJECTED view, never raw tags.
    // This is not merely "more honest display" — it is a correctness fix.
    // ChipField.set value() for a MULTI field stores every ' + '-token in
    // `_values`, including ones with no matching chip button (silently, no
    // error). If Formation seeded from a legacy `"Shotgun + Trips"` play, the
    // 'Shotgun' token (no longer a Formation chip — see index.html E4 comment)
    // would sit in `_values` alongside 'Trips', INVISIBLE (no chip shows
    // active), but still present. If the coach then toggled ONLY 'Trips' off,
    // the click handler mutates `_values` by removing just 'Trips' — 'Shotgun'
    // would remain, and the next `change` event would silently WRITE 'Shotgun'
    // back to play.tags.formation as the coach's own "explicit" edit, resurrecting
    // exactly the value E1-E3 worked to remove. Seeding from the projected
    // structural value (which never contains an alignment token) makes that
    // scenario structurally impossible — `_values` can never hold a token with
    // no matching chip in the first place. Coverage (single-select) doesn't have
    // this specific hazard (a lone `_value` fully replaces on the next pick,
    // never partially mutates), but is projected too for display consistency —
    // the coach should see it exactly as every other consumer will read it.
    const projected = StatsEngine.proj(play);
    this.tagFields.down.value = play.tags.down;
    this.tagFields.distance.value = play.tags.distance;
    this.tagFields.formation.value = projected.formation;
    this.tagFields.playType.value = play.tags.playType;
    this.tagFields.runPass.value = play.tags.runPass || '';
    this.tagFields.defFront.value = play.tags.defFront;
    this.tagFields.coverage.value = projected.coverage;
    // Both are explicit-if-present, else DERIVED from a legacy mixed field
    // (e.g. a play tagged only "Shotgun + Trips" shows QB Alignment=Shotgun
    // here even though nothing is literally stored under that key yet) — this
    // IS "the tag form shows the projected view." Nothing is written by this
    // seed; ChipField's value setter never fires a change event.
    this.tagFields.qbAlignment.value = projected.qbAlignment || '';
    this.tagFields.coverageFamily.value = projected.coverageFamily || '';
    this.tagFields.blitz.value = play.tags.blitz;
    this.tagFields.result.value = play.tags.result;
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
    // E4-2: Backfield now has REAL sibling relationships too (it receives
    // 'Empty' promoted from Formation, and supplies 'Pistol' to QB Alignment)
    // — seeding it from RAW tags left a legacy "Wing-T + Empty" play showing
    // Backfield as blank in the FORM while Film Room's grid correctly showed
    // 'Empty' via projField, a real cross-surface divergence. Seed from the
    // projected view like every other projected field. Strength has no
    // sibling relationship (project() passes it through unchanged), but
    // seeding it the same way keeps all six projected fields on ONE
    // consistent seeding path instead of a silently-diverging exception.
    this.tagFields.backfield.value = projected.backfield || '';
    this.tagFields.strength.value = projected.strength || '';
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
    // The play's counted unit, the one every other view shows; the carried
    // unit only seeds new plays (1.12.0-99 smoke, S99-2).
    const unit = countedUnit(play);
    if (this.unitField) this.unitField.value = unit;
    // Let add-ons (e.g. custom fields) re-render whenever a play is shown.
    if (this.onLoadForm) this.onLoadForm(play);
  }



  /**
   * S7 demolition: real domain API replacing the native tag form's synthetic
   * `chip.click()` on the unit toggle. ChipField already has a genuine `.value`
   * setter — the click was never load-bearing behavior, only a habit — so this
   * is the SAME logic the DOM change listener runs, callable directly.
   */
  _onUnitFieldChanged() {
    const play = this.getCurrentPlay();
    // The toggle always keeps a side selected — re-tapping the active side
    // would otherwise clear it, so fall back to the current value.
    let unit = this.unitField.value;
    if (!unit) {
      unit = play ? countedUnit(play) : (this.defaultUnit || 'offense');
      this.unitField.value = unit;
    }
    if (play) this.setPlayUnit(play, unit);
    // Make the side "sticky": the user's choice carries forward to the next
    // untagged play (Save & Next) until they change it again.
    this.defaultUnit = unit;
  }

  /**
   * THE write of a play's unit, shared by Chart and the Film Room Unit column
   * (coach, 2026-09-24: either view, equally weighted, last write wins). Stores
   * the unit, strips the look fields a Special Teams play may not hold, keeps
   * Chart's form in step when this is the play it shows, and emits the one
   * update every view and the save path already follow.
   */
  setPlayUnit(play, unit) {
    if (!play || !['offense', 'defense', 'special'].includes(unit)) return false;
    play.tags.unit = unit;
    const stripped = this._stripStAlignment(play);
    if (play.id === this.currentPlayId) {
      if (this.unitField) this.unitField.value = unit;
      if (stripped) this._loadTagForm(play);
    }
    this._emit('play-updated', play);
    return true;
  }

  /**
   * The coach-facing, STICKY unit change (the toggle a coach taps while
   * charting). Named distinctly from `setUnit()` below, which is an internal
   * carry-forward helper (auto-fills an untagged play's unit from the
   * previous one) with deliberately different, non-sticky semantics — the two
   * used to share a name by coincidence, which silently shadowed one of them.
   */
  setChartingUnit(unit) {
    if (!this.unitField || !['offense', 'defense', 'special'].includes(unit)) return false;
    // A no-op only when the play already STORES this unit. Comparing the
    // displayed value let a play with no stored unit keep none when the coach
    // chose the unit on screen, so Chart and Film Room disagreed (S99-2).
    const play = this.getCurrentPlay();
    if (this.unitField.value === unit && (!play || play.tags.unit === unit)) return true;
    this.unitField.value = unit;
    this._onUnitFieldChanged();
    return true;
  }

  /** Real setters for the two charting-speed toggles. Persist + apply in one
   *  call, so a native control can drive them without a hidden checkbox. */
  setAutoDD(value) {
    this.autoDD = !!value;
    try { localStorage.setItem('ffa_auto_dd', this.autoDD ? '1' : '0'); } catch (e) {}
    return true;
  }
  setCarryScheme(value) {
    this.carryScheme = !!value;
    try { localStorage.setItem('ffa_carry_scheme', this.carryScheme ? '1' : '0'); } catch (e) {}
    return true;
  }

  /** Bump the drive counter on the current play. Extracted from the legacy
   *  button's click handler so native tagging can call it directly. */
  newDrive() {
    this.currentDrive++;
    if (this.tagFields.driveNumber) {
      this.tagFields.driveNumber.value = this.currentDrive;
      this._saveField('driveNumber');
    }
    return true;
  }

  _clearTagForm() {
    for (const el of Object.values(this.tagFields)) el.value = '';
    for (const el of Object.values(this.playerFields)) { if (el) el.value = ''; }
    for (const el of Object.values(this.gradeFields)) { if (el) el.value = ''; }
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
    // The unit shown on the previous play, never the carried one: after a play
    // with no stored unit this stamped the carried unit, Special Teams
    // included, and stripped the next play's look fields (code review CR-3).
    const carryUnit = prev ? countedUnit(prev) : this.defaultUnit;
    const advanced = this.nextPlay();
    if (advanced) {
      const next = this.getCurrentPlay();
      if (next) {
        if (this.autoDD && prev) this.applyNextSituation(prev, next);
        // Placeholder plays are seeded with the game's starting unit when
        // they are created. That seed is not a coach decision: once the coach
        // changes units, Save & Next must keep that choice across untouched
        // plays instead of snapping back to the original seed on every play.
        // Preserve a different unit only when the next play is genuinely
        // charted, using the same canonical rule as progress and Film Room.
        if (carryUnit && !isPlayTagged(next)) this.setUnit(carryUnit);
        if (this.carryScheme && prev) this.applyCarryScheme(prev, next);
      }
    }
    return advanced;
  }

  /** Alignment fields the carry-scheme toggle copies forward — pre-snap looks
   *  only, never what happened on the snap (play type / result / yardage). */
  static get CARRY_SCHEME_KEYS() {
    return ['qbAlignment', 'formation', 'backfield', 'strength', 'personnel',
            'defFront', 'coverage', 'coverageFamily'];
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
    const pu = countedUnit(prev), nu = countedUnit(next);
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
    if (!play || countedUnit(play) !== 'special') return false;
    let changed = false;
    // Single source of truth (GRIDIRON-IQ-TAG-MODEL.md §7): consume SeasonStore's
    // list instead of an inline copy that would silently drift from it.
    SeasonStore.ST_ALIGNMENT_KEYS.forEach(k => {
      if (play.tags[k]) { play.tags[k] = ''; changed = true; }
    });
    return changed;
  }

  /** Set the unit (Offense/Defense/Special) on the current play and relayout. */
  setUnit(unit) {
    unit = unit || 'offense';
    if (this.unitField) this.unitField.value = unit;
    // The carry-forward write goes through the one unit write (Codex review of
    // 48cbf5d), so it cannot drift from Chart's and Film Room's.
    const play = this.getCurrentPlay();
    if (play) this.setPlayUnit(play, unit);
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
    const penalties = PenaltyModel.normalizeList(prev.penalties);
    if (penalties.length) {
      const confirmed = PenaltyModel.confirmedSituation(prev);
      if (confirmed) return {
        down: confirmed.down, distance: confirmed.distance,
        fieldSide: confirmed.fieldSide, yardLine: confirmed.yardLine,
      };
      const accepted = penalties.filter(penalty => penalty.disposition === 'accepted');
      const offsetting = penalties.filter(penalty => penalty.disposition === 'offsetting');
      if (penalties.some(penalty => penalty.disposition === 'unknown')) return null;
      const result = String(t.result || '').split(/\s*\+\s*/).filter(part => part && part !== 'Penalty').join(' + ');
      const ordinary = () => this.computeNextSituation({ ...prev, penalties: [], tags: { ...t, result } });
      if (!accepted.length && !offsetting.length) return ordinary();
      if (offsetting.length && !accepted.length) return {
        down: t.down, distance: t.distance, ...this._sameSpot(t),
      };
      if (accepted.length !== 1 || offsetting.length) return null;
      const penalty = accepted[0];
      const down = Number(t.down), distance = Number(t.distance);
      if (!down || !Number.isFinite(distance) || distance < 1 || penalty.yards == null
        || penalty.team === 'unknown' || penalty.playCounts == null || t.unit === 'special') return null;
      // A counted live-ball foul may be enforced from the previous spot, end
      // of run, or spot of the foul. Only a counted dead-ball foul has an
      // unambiguous end-of-play base; no-play enforcement uses the prior spot.
      if (penalty.playCounts && penalty.phase !== 'deadBall') return null;
      const base = penalty.playCounts ? ordinary() : { down: t.down, distance: t.distance, ...this._sameSpot(t) };
      if (!base?.down || !base?.distance) return null;
      const offenseTeam = t.unit === 'defense' ? 'opponent' : 'subject';
      const gain = penalty.team === offenseTeam ? -penalty.yards : penalty.yards;
      const baseAbs = this._absYL(base);
      const newAbs = baseAbs == null ? null : Math.min(99, Math.max(1, baseAbs + (t.unit === 'defense' ? -gain : gain)));
      const spot = newAbs == null ? { fieldSide: null, yardLine: null }
        : newAbs <= 50 ? { fieldSide: 'own', yardLine: newAbs } : { fieldSide: 'opp', yardLine: 100 - newAbs };
      const toGoal = newAbs == null ? null : t.unit === 'defense' ? newAbs : 100 - newAbs;
      if (penalty.automaticFirstDown && penalty.lossOfDown) return null;
      const firstDown = penalty.automaticFirstDown === true || (gain >= Number(base.distance) && gain > 0);
      const nextDown = firstDown ? 1 : Number(base.down) + (penalty.lossOfDown === true ? 1 : 0);
      if (nextDown > 4) return null;
      const nextDistance = firstDown ? Math.min(10, toGoal ?? 10)
        : Math.min(Math.max(1, Number(base.distance) - gain), toGoal ?? Infinity);
      return { down: String(nextDown), distance: String(Math.max(1, nextDistance)), ...spot };
    }
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
    const unit = countedUnit(prev);
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
    this._emit('play-updated', next);
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
    // LIVE barrier for the ST-alignment invariant (E1-R9): every writer — Film Room
    // grid, AI vision stamp, suggestion engine, the tag form, copy/template — mutates
    // a play and then emits play-created/play-updated. Stripping a special play here,
    // before listeners run, keeps the in-memory object clean for the UI and analytics
    // that read tagger.plays directly (persist() only cleans the season-store copy).
    // Unit-conditional and idempotent. The persist/serialize strip is the second
    // barrier for data at rest.
    if ((event === 'play-updated' || event === 'play-created') && data && data.tags) {
      this._stripStAlignment(data);
    }
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
