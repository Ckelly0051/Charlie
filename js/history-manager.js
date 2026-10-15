/* Bounded snapshot undo/redo for stored play and game state.
 * Drawing keeps its separate canvas history. */
export class HistoryManager {
  constructor(tagger, overlays) {
    if (!overlays?.toast) throw new Error('HistoryManager requires the native overlay service.');
    this.tagger = tagger;
    this.overlays = overlays;
    this.stack = [];          // [{label, before, after}]
    this.index = -1;          // index of last applied entry
    this.recording = true;
    this.maxSize = 100;
    this.lastSnap = null;
    // Optional fallbacks so the single top-bar undo/redo can also drive
    // canvas annotation undo when there's no play-data action to undo.
    this.onUndoEmpty = null;
    this.onRedoEmpty = null;
    this.fallbackCanUndo = null;
    this.fallbackCanRedo = null;
    // Native Undo/Redo subscribes to change events for button state and labels.

    this._listeners = {};

    tagger.on('play-created', (p) => this._record('Add play ' + (p?.id || '')));
    tagger.on('play-deleted', () => this._record('Delete play'));
    tagger.on('play-updated', (p) => this._record('Edit play ' + (p?.id || '')));
    // Chart's unsaved changes undo inside the open play first.
    tagger.on('draft-updated', () => this._updateUI());
    // Selecting a play changes no play data; the baseline follows it so an Undo
    // of the next save keeps that play open.
    tagger.on('play-selected', () => { if (this.recording) this.lastSnap = this._snapshot(); });
  }

  /* Re-baseline on every season/game load. */
  init() {
    this.lastSnap = this._snapshot();
    this._updateUI();
  }

  /* Reset per-game history on every game load so Undo cannot restore another game's plays. */
  reset() {
    this.stack = [];
    this.index = -1;
    this.lastSnap = this._snapshot();
    this._updateUI();
  }

  _snapshot() {
    return JSON.stringify({
      plays: this.tagger.plays,
      nextId: this.tagger.nextId,
      currentPlayId: this.tagger.currentPlayId
    });
  }

  _record(label) {
    if (!this.recording) return;
    const after = this._snapshot();
    if (after === this.lastSnap) return;

    // Coalesce rapid successive edits to the same play within 800ms
    const now = Date.now();
    const top = this.stack[this.index];
    if (top && top.label === label && (now - top.time) < 800) {
      top.after = after;
      top.time = now;
      this.lastSnap = after;
      this._updateUI();
      return;
    }

    // Drop the redo tail, append, and cap the ring. After this the current
    // position is always the just-pushed entry — the last element — whether or
    // not we shifted the oldest off, so index is simply length-1.
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ label, before: this.lastSnap, after, time: now });
    if (this.stack.length > this.maxSize) this.stack.shift();
    this.index = this.stack.length - 1;
    this.lastSnap = after;
    this._updateUI();
  }

  canUndo() { return this.index >= 0 || !!this.tagger.canUndoDraft?.(); }
  canRedo() { return this.index < this.stack.length - 1 || !!this.tagger.canRedoDraft?.(); }

  /* Publish history state for native Undo/Redo controls. */
  on(event, fn) {
    (this._listeners[event] ||= []).push(fn);
    return () => { this._listeners[event] = (this._listeners[event] || []).filter(f => f !== fn); };
  }
  _emit(event, ...args) {
    (this._listeners[event] || []).forEach(fn => fn(...args));
  }

  /**
   * Single global undo: undo the last play-data action if there is one,
   * otherwise fall through to the canvas annotation undo. Mirrors Ctrl+Z
   * so the one top-bar button covers both kinds of edits.
   */
  undoAll() {
    if (this.undo()) return true;
    if (this.onUndoEmpty) { this.onUndoEmpty(); this._updateUI(); return true; }
    return false;
  }

  redoAll() {
    if (this.redo()) return true;
    if (this.onRedoEmpty) { this.onRedoEmpty(); this._updateUI(); return true; }
    return false;
  }

  undo() {
    if (this.tagger.undoDraft?.()) { this._toast('↶ Undo'); this._updateUI(); return true; }
    if (this.index < 0) return false;
    const entry = this.stack[this.index];
    this._restore(entry.before);
    this.index--;
    this._toast('↶ Undo: ' + entry.label);
    this._updateUI();
    return true;
  }

  redo() {
    if (this.tagger.redoDraft?.()) { this._toast('↷ Redo'); this._updateUI(); return true; }
    if (this.index >= this.stack.length - 1) return false;
    this.index++;
    const entry = this.stack[this.index];
    this._restore(entry.after);
    this._toast('↷ Redo: ' + entry.label);
    this._updateUI();
    return true;
  }

  _restore(snap) {
    if (!snap) return;
    const data = JSON.parse(snap);
    this.recording = false;
    this.tagger.plays = data.plays || [];
    // ?? keeps a stored 0; fall back to max-id+1 (not plays.length+1, which can
    // duplicate an existing id when ids are non-contiguous after deletes).
    this.tagger.nextId = data.nextId ?? (Math.max(0, ...this.tagger.plays.map(p => Number(p.id) || 0)) + 1);
    const cid = data.currentPlayId;
    this.tagger.currentPlayId = cid && this.tagger.getPlay(cid) ? cid : null;
    this.lastSnap = snap;
    this.recording = true;
    // Wholesale plays replacement — announce it so subscribers that mirror
    // the play list (the Film Room grid) re-render. Emitted while recording
    // is back on, but it's not a play-mutation event, so nothing re-records.
    this.tagger._emit('plays-loaded');
  }

  _updateUI() {
    const canUndo = this.canUndo() || (this.fallbackCanUndo && this.fallbackCanUndo());
    const canRedo = this.canRedo() || (this.fallbackCanRedo && this.fallbackCanRedo());
    this._emit('change', {
      canUndo, canRedo,
      undoLabel: this.tagger.canUndoDraft?.() ? 'Unsaved change' : this.index >= 0 ? this.stack[this.index].label : '',
    });
  }

  /**
   * Show feedback through the single native overlay host. Action toasts keep
   * their undo callback and longer window; CSS owns visual text casing.
   */
  _toast(msg, opts = {}) {
    const action = opts.action && typeof opts.action.fn === 'function'
      ? {
          label: String(opts.action.label || 'Undo'),
          fn: opts.action.fn,
        }
      : null;
    return this.overlays.toast({
      message: String(msg ?? ''),
      tone: opts.tone || 'info',
      action,
      duration: opts.duration || (action ? 6000 : 4500),
    });
  }
}
