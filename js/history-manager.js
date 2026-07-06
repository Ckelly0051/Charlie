/**
 * HistoryManager - Unified undo/redo for play data, tags, and game info.
 *
 * Records full snapshots of mutable state after each tagger event.
 * Cheap because plays are small JSON. Capped at maxSize entries.
 * Coexists with CanvasOverlay's local drawing undo (history runs first;
 * if nothing to undo, falls through to canvas).
 */
export class HistoryManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.stack = [];          // [{label, before, after}]
    this.index = -1;          // index of last applied entry
    this.recording = true;
    this.maxSize = 100;
    this.lastSnap = null;
    this.toastEl = null;
    this.btnUndo = null;
    this.btnRedo = null;
    // Optional fallbacks so the single top-bar undo/redo can also drive
    // canvas annotation undo when there's no play-data action to undo.
    this.onUndoEmpty = null;
    this.onRedoEmpty = null;
    this.fallbackCanUndo = null;
    this.fallbackCanRedo = null;

    tagger.on('play-created', (p) => this._record('Add play ' + (p?.id || '')));
    tagger.on('play-deleted', () => this._record('Delete play'));
    tagger.on('play-updated', (p) => this._record('Edit play ' + (p?.id || '')));
  }

  init() {
    this.lastSnap = this._snapshot();
    this.toastEl = document.getElementById('undoToast');
    this.btnUndo = document.getElementById('btnUndoAction');
    this.btnRedo = document.getElementById('btnRedoAction');
    if (this.btnUndo) this.btnUndo.addEventListener('click', () => this.undoAll());
    if (this.btnRedo) this.btnRedo.addEventListener('click', () => this.redoAll());
    this._updateUI();
  }

  /**
   * Clear the undo/redo stack and re-baseline to the current state. Called on
   * every GAME load (not just season open) — the stack is per-game, so without
   * this an Undo after switching games would restore the PREVIOUS game's plays
   * into the current one (cross-game corruption the integrity harness caught).
   * Unlike init() it does NOT re-bind DOM listeners, so it's safe to call often.
   */
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

    // Drop redo tail
    this.stack = this.stack.slice(0, this.index + 1);
    this.stack.push({ label, before: this.lastSnap, after, time: now });
    if (this.stack.length > this.maxSize) {
      this.stack.shift();
    } else {
      this.index = this.stack.length - 1;
    }
    if (this.stack.length === this.maxSize) {
      this.index = this.stack.length - 1;
    }
    this.lastSnap = after;
    this._updateUI();
  }

  canUndo() { return this.index >= 0; }
  canRedo() { return this.index < this.stack.length - 1; }

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
    if (!this.canUndo()) return false;
    const entry = this.stack[this.index];
    this._restore(entry.before);
    this.index--;
    this._toast('↶ Undo: ' + entry.label);
    this._updateUI();
    return true;
  }

  redo() {
    if (!this.canRedo()) return false;
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
    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this.tagger.updateScrubBarPlays();
    const cid = data.currentPlayId;
    if (cid && this.tagger.getPlay(cid)) {
      this.tagger.currentPlayId = cid;
      this.tagger._loadTagForm(this.tagger.getPlay(cid));
      this.tagger.playSelect.value = cid;
    } else {
      this.tagger.currentPlayId = null;
      this.tagger._clearTagForm();
    }
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
    if (this.btnUndo) this.btnUndo.disabled = !canUndo;
    if (this.btnRedo) this.btnRedo.disabled = !canRedo;
    if (this.btnUndo) {
      this.btnUndo.title = this.canUndo()
        ? 'Undo: ' + this.stack[this.index].label + ' (Ctrl+Z)'
        : 'Undo (Ctrl+Z)';
    }
  }

  /**
   * Show a toast. opts.action = { label, fn } renders an inline action button
   * (e.g. "Deleted Play 12 — Undo"); opts.duration overrides the default.
   * Built via DOM (textContent), never innerHTML — msg carries coach text
   * (play/game names) and must stay inert (lesson #18).
   */
  _toast(msg, opts = {}) {
    if (!this.toastEl) return;
    this.toastEl.textContent = '';
    this.toastEl.appendChild(document.createTextNode(msg));
    if (opts.action && typeof opts.action.fn === 'function') {
      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'toast-action';
      btn.textContent = opts.action.label || 'Undo';
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        clearTimeout(this._toastTimer);
        this.toastEl.classList.remove('show');
        try { opts.action.fn(); } catch (err) {}
      });
      this.toastEl.appendChild(btn);
    }
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, opts.duration || (opts.action ? 6000 : 1800));
  }
}
