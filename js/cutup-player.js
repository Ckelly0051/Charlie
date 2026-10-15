/* Sequential review of selected plays through the existing video node.
 * This is playback, not the stitched recording produced by CutupExporter. */
import { playbackOrder } from './football-rules.js';
import { h, render, Fragment } from 'preact';

export class CutupPlayer {
  constructor(videoController, tagger, options = {}) {
    this.vc = videoController;
    this.tagger = tagger;
    this.queue = [];
    this.index = -1;
    this.active = false;
    this.label = '';
    this._armed = false;
    this._settle = null;
    this.bannerEl = null;
    this.shouldAutoPlayNext = typeof options.shouldAutoPlayNext === 'function'
      ? options.shouldAutoPlayNext
      : () => true;

    this.vc.on('time-update', (d) => this._onTime(d.time));
    this.vc.on('video-ended', () => this._onEnded());
  }

  /** Begin a cut-up over the given play IDs, in game order (playbackOrder). */
  start(playIds, label = '') {
    if (this.active) this.stop('replaced');
    const plays = playbackOrder((playIds || [])
      .map(id => this.tagger.getPlay(id))
      .filter(Boolean));
    if (!plays.length) return Promise.resolve({ completed: false, reason: 'empty' });

    this.vc.clearLoop();
    this.queue = plays;
    this.label = label;
    this.active = true;
    const completion = new Promise(resolve => { this._settle = resolve; });
    this._renderBanner();
    this._goTo(0);
    return completion;
  }

  _goTo(i, { autoplay = true } = {}) {
    if (!this.active) return;
    if (i < 0) { this.stop('stopped'); return; }
    if (i >= this.queue.length) { this.stop('complete'); return; }
    this.index = i;
    this._armed = false;
    const play = this.queue[i];
    // selectPlay seeks to the start (and switches clips in multi-clip mode).
    this.tagger.selectPlay(play.id);
    this._updateBanner();
    // Resume playback shortly after the seek lands when requested. Watch starts
    // intentionally play; manual next/previous honors the coach's preference.
    setTimeout(() => {
      if (this.active && autoplay && this.vc.video && this.vc.video.paused) {
        this.vc.video.play().catch(() => {});
      } else if (this.active && !autoplay && this.vc.video) {
        this.vc.video.pause();
      }
    }, 40);
  }

  _onTime(t) {
    if (!this.active || this.index < 0) return;
    const play = this.queue[this.index];
    if (!play) return;
    // Arm only once we're inside the current segment, so a stale timeupdate
    // from before the seek can't trigger a double-advance.
    if (!this._armed) {
      if (t >= play.timestamp.start - 0.15) this._armed = true;
      return;
    }
    if (t >= play.timestamp.end - 0.03) {
      if (this.index < this.queue.length - 1) {
        this._goTo(this.index + 1);
      } else {
        if (this.vc.video) this.vc.video.pause();
        this.stop('complete');
      }
    }
  }

  _onEnded() {
    if (!this.active || this.index < 0) return;
    if (this.index < this.queue.length - 1) this._goTo(this.index + 1);
    else this.stop('complete');
  }

  next() { this._goTo(this.index + 1, { autoplay: this.shouldAutoPlayNext() }); }
  prev() { this._goTo(Math.max(0, this.index - 1), { autoplay: this.shouldAutoPlayNext() }); }

  stop(reason = 'stopped') {
    const settle = this._settle;
    this._settle = null;
    this.active = false;
    this.index = -1;
    this.queue = [];
    this._removeBanner();
    if (settle) settle({ completed: reason === 'complete', reason });
  }

  // --- Banner UI ---

  _renderBanner() {
    this._removeBanner();
    const b = document.createElement('div');
    b.className = 'cutup-banner';
    render(h(Fragment, null,
      h('span', { class: 'cutup-dot' }), h('span', { class: 'cutup-label' }), h('span', { class: 'cutup-count' }),
      h('div', { class: 'cutup-controls' },
        h('button', { class: 'cutup-btn', 'data-act': 'prev', title: 'Previous (←)' }, '◀'),
        h('button', { class: 'cutup-btn', 'data-act': 'next', title: 'Next (→)' }, '▶'),
        h('button', { class: 'cutup-btn cutup-exit', 'data-act': 'exit', title: 'Exit cut-up (Esc)' }, '✕'))), b);
    b.querySelector('[data-act=prev]').addEventListener('click', () => this.prev());
    b.querySelector('[data-act=next]').addEventListener('click', () => this.next());
    b.querySelector('[data-act=exit]').addEventListener('click', () => this.stop());
    document.body.appendChild(b);
    this.bannerEl = b;
    this._updateBanner();
  }

  _updateBanner() {
    if (!this.bannerEl) return;
    const lbl = this.bannerEl.querySelector('.cutup-label');
    const cnt = this.bannerEl.querySelector('.cutup-count');
    if (lbl) lbl.textContent = this.label || 'Cut-up';
    if (cnt) cnt.textContent = `${this.index + 1} / ${this.queue.length}`;
  }

  _removeBanner() {
    if (this.bannerEl && this.bannerEl.parentNode) {
      render(null, this.bannerEl);
      this.bannerEl.parentNode.removeChild(this.bannerEl);
    }
    this.bannerEl = null;
  }
}
