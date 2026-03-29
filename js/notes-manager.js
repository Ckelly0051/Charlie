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

    this._bindEvents();
  }

  _bindEvents() {
    // Auto-save notes on input
    this.notesArea.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this._saveNotes(), 500);
    });

    // Insert timestamp
    this.btnInsertTimestamp.addEventListener('click', () => {
      this._insertTimestamp();
    });

    // Update notes when play changes
    this.tagger.on('play-selected', (play) => {
      this.notesArea.value = play.notes || '';
    });

    this.tagger.on('play-deleted', () => {
      this.notesArea.value = '';
    });
  }

  _saveNotes() {
    const play = this.tagger.getCurrentPlay();
    if (play) {
      play.notes = this.notesArea.value;
    }
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
    this._saveNotes();
  }

  loadNotes(notes) {
    this.notesArea.value = notes || '';
  }

  clear() {
    this.notesArea.value = '';
  }
}
