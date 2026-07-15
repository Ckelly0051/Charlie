/**
 * NotesManager - Manages play-by-play notes tied to tagged plays.
 */
export class NotesManager {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.notesArea = document.getElementById('notesArea');
    this.btnInsertTimestamp = document.getElementById('btnInsertTimestamp');
    this.debounceTimer = null;
    this.pending = null;

    this._bindEvents();
  }

  _bindEvents() {
    // Auto-save notes on input
    this.notesArea.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      const play = this.tagger.getCurrentPlay();
      if (!play) return;
      const value = this.notesArea.value;
      // Keep the canonical play current immediately so a game commit cannot
      // serialize the pre-debounce value. The timer only batches the mutation
      // event used by history/autosave.
      play.notes = value;
      this.pending = { play, value };
      this.debounceTimer = setTimeout(() => this.flush(), 500);
    });

    // Insert timestamp
    this.btnInsertTimestamp.addEventListener('click', () => {
      this._insertTimestamp();
    });

    // Update notes when play changes
    this.tagger.on('play-selected', (play) => {
      this.flush();
      this.notesArea.value = play.notes || '';
    });

    this.tagger.on('play-deleted', () => {
      this.notesArea.value = '';
    });
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
    } else {
      const play = this.tagger.getCurrentPlay();
      const value = this.notesArea.value;
      if (play && play.notes !== value) {
        play.notes = value;
        this.tagger._emit('play-updated', play);
      }
    }
    this.pending = null;
  }

  flush() {
    clearTimeout(this.debounceTimer);
    this.debounceTimer = null;
    if (this.pending) this._saveNotes();
  }

  _insertTimestamp() {
    const time = this.vc.currentTime;
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    const stamp = `[${m}:${s}] `;

    const start = this.notesArea.selectionStart;
    const end = this.notesArea.selectionEnd;
    const text = this.notesArea.value;
    this.notesArea.value = text.substring(0, start) + stamp + text.substring(end);
    this.notesArea.selectionStart = this.notesArea.selectionEnd = start + stamp.length;
    this.notesArea.focus();
    const play = this.tagger.getCurrentPlay();
    if (play) {
      play.notes = this.notesArea.value;
      this.pending = { play, value: play.notes };
      this.flush();
    }
  }

  loadNotes(notes) {
    this.flush();
    this.notesArea.value = notes || '';
  }

  clear() {
    clearTimeout(this.debounceTimer);
    this.pending = null;
    this.notesArea.value = '';
  }
}
