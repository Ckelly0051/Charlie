/**
 * NotesManager - Manages play-by-play notes tied to tagged plays.
 *
 * Final Engine Independence: notes are DOM-free. The legacy `.tag-section`
 * `<textarea>` this class used to read/write directly is retired;
 * native-tagging.jsx renders its own controlled textarea and calls
 * `setNotes(value)` on every keystroke (native-tagging-screen.js's
 * `screen.setNotes`), which writes straight into `play.notes` — no synthetic
 * DOM `input` event, no cursor-position book-keeping on a hidden element.
 */
export class NotesManager {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.debounceTimer = null;
    this.pending = null;

    this._bindEvents();
  }

  _bindEvents() {
    // Flush on selection change so a debounced edit on the outgoing play is
    // never lost, and so a stale timer can't land on the newly-selected play.
    this.tagger.on('play-selected', () => this.flush());
    this.tagger.on('play-deleted', () => this.flush());
  }

  /** Public write path — called by native tagging on every keystroke/input.
   *  Keeps the canonical play current immediately (a game commit cannot
   *  serialize a pre-debounce value); the timer only batches the
   *  'play-updated' event used by history/autosave. */
  setNotes(value) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    play.notes = value;
    this.pending = { play, value };
    clearTimeout(this.debounceTimer);
    this.debounceTimer = setTimeout(() => this.flush(), 500);
    return true;
  }

  _saveNotes() {
    const pending = this.pending;
    if (pending) {
      // Object identity is intentional: numeric play ids repeat across games.
      // If the list was replaced (game switch/undo), the outgoing object was
      // already updated before commit and must not emit into the new context.
      if (this.tagger.plays.includes(pending.play) && pending.play.notes === pending.value) {
        this.tagger._emit('play-updated', pending.play);
      }
    }
    this.pending = null;
  }

  flush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    if (this.pending) this._saveNotes();
  }

  /** Insert a video timestamp into the current play's notes. The legacy form
   *  inserted at the textarea's cursor position; native's controlled
   *  textarea has no cursor position this class can see, so the timestamp is
   *  appended to the end of the existing notes instead — a small, disclosed
   *  behavior adjustment, not a capability loss (the coach can still edit
   *  the note text around it). */
  insertTimestamp() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    const time = this.vc.currentTime;
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    const stamp = `[${m}:${s}] `;
    const existing = play.notes || '';
    const value = existing && !existing.endsWith('\n') && !existing.endsWith(' ')
      ? `${existing} ${stamp}` : `${existing}${stamp}`;
    play.notes = value;
    this.pending = { play, value };
    this.flush();
    return true;
  }

  /** Retained for any remaining caller that hands notes text in directly
   *  (e.g. project import); flushes any pending debounce first. */
  loadNotes(notes, play = this.tagger.getCurrentPlay()) {
    this.flush();
    if (play) play.notes = notes || '';
  }

  clear() {
    clearTimeout(this.debounceTimer);
    this.pending = null;
  }
}
