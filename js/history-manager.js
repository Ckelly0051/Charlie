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

    tagger.on('play-created', (p) => this._record('Add play ' + (p?.id || '')));
    tagger.on('play-deleted', () => this._record('Delete play'));
    tagger.on('play-updated', (p) => this._record('Edit play ' + (p?.id || '')));
  }

  init() {
    this.lastSnap = this._snapshot();
    this.toastEl = document.getElementById('undoToast');
    this.btnUndo = document.getElementById('btnUndoAction');
    this.btnRedo = document.getElementById('btnRedoAction');
    if (this.btnUndo) this.btnUndo.addEventListener('click', () => this.undo());
    if (this.btnRedo) this.btnRedo.addEventListener('click', () => this.redo());
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
    this.tagger.nextId = data.nextId || (this.tagger.plays.length + 1);
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
  }

  _updateUI() {
    if (this.btnUndo) this.btnUndo.disabled = !this.canUndo();
    if (this.btnRedo) this.btnRedo.disabled = !this.canRedo();
    if (this.btnUndo && this.canUndo()) {
      this.btnUndo.title = 'Undo: ' + this.stack[this.index].label + ' (Ctrl+Z)';
    }
  }

  _toast(msg) {
    if (!this.toastEl) return;
    this.toastEl.textContent = msg;
    this.toastEl.classList.add('show');
    clearTimeout(this._toastTimer);
    this._toastTimer = setTimeout(() => {
      this.toastEl.classList.remove('show');
    }, 1800);
  }
}
