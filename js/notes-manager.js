/**
 * NotesManager - play notes, written into the open play's draft.
 *
 * native-tagging.jsx renders its own controlled textarea and calls
 * `setNotes(value)` on every keystroke. Each keystroke is an unsaved change at
 * once (leaving the play asks), and a run of keystrokes is one Undo step
 * (`PlayTagger.typedChange`); Save stores the note with the play.
 */
export class NotesManager {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
  }

  setNotes(value) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    play.notes = value;
    this.tagger.typedChange(play, 'notes');
    return true;
  }

  /** Append the video time to the open play's notes. The controlled textarea
   *  has no cursor position here, so the stamp goes at the end. */
  insertTimestamp() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    const time = this.vc.currentTime;
    const m = Math.floor(time / 60);
    const s = Math.floor(time % 60).toString().padStart(2, '0');
    const stamp = `[${m}:${s}] `;
    const existing = play.notes || '';
    play.notes = existing && !existing.endsWith('\n') && !existing.endsWith(' ')
      ? `${existing} ${stamp}` : `${existing}${stamp}`;
    this.tagger._emit('play-updated', play);
    return true;
  }
}
