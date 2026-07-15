/** Production presentation layer for the video-first Break Down workspace. */
export class BreakdownVideo {
  constructor(tagger) {
    this.tagger = tagger;
    this.video = document.getElementById('videoContainer');
    this.controls = document.querySelector('.playback-controls');
    this.actions = document.querySelector('.video-play-controls');
    this.track = null;
    this.hideTimer = null;
    this._mount();
  }

  _enabled() {
    try { return localStorage.getItem('ffa_workspace_shell_v2') === '1'; } catch { return false; }
  }

  _mount() {
    if (!this._enabled() || !this.video || !this.controls || !this.actions) return;
    this.video.classList.add('breakdown-video-v2');
    this.controls.classList.add('breakdown-player-controls');

    const handle = document.createElement('button');
    handle.type = 'button';
    handle.className = 'breakdown-player-drag';
    handle.setAttribute('aria-label', 'Move video controls');
    handle.title = 'Drag up or down; double-click to reset';
    handle.textContent = '⋮⋮';
    this.controls.prepend(handle);
    this.video.appendChild(this.controls);

    const strip = document.createElement('section');
    strip.className = 'breakdown-play-strip';
    strip.setAttribute('aria-label', 'Plays');
    strip.innerHTML = '<header><strong>PLAYS</strong><span data-play-count>No plays</span></header><div class="breakdown-play-track"></div>';
    this.track = strip.querySelector('.breakdown-play-track');
    this.actions.parentNode.insertBefore(strip, this.actions);

    const copy = document.getElementById('btnCopyPrev');
    if (copy) {
      copy.textContent = 'Copy Last';
      copy.classList.add('breakdown-copy-last');
      const clear = document.getElementById('btnClearTags');
      this.actions.insertBefore(copy, clear || null);
    }

    ['play-created', 'play-deleted', 'plays-loaded']
      .forEach(event => this.tagger.on(event, () => this.render()));
    this.tagger.on('play-updated', play => this._renderPlay(play));
    this.tagger.on('play-selected', play => this._renderSelection(play));
    this._bindPlayer(handle);
    this.render();
  }

  _bindPlayer(handle) {
    const show = () => {
      clearTimeout(this.hideTimer);
      this.video.classList.remove('breakdown-controls-hidden');
      this.hideTimer = setTimeout(() => {
        if (!this.controls.matches(':focus-within')) this.video.classList.add('breakdown-controls-hidden');
      }, 1600);
    };
    this.video.addEventListener('pointermove', show);
    this.video.addEventListener('pointerenter', show);
    this.video.addEventListener('pointerleave', () => {
      clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(() => this.video.classList.add('breakdown-controls-hidden'), 350);
    });
    this.controls.addEventListener('focusin', () => {
      clearTimeout(this.hideTimer);
      this.video.classList.remove('breakdown-controls-hidden');
    });
    this.controls.addEventListener('focusout', show);

    const place = ratio => {
      ratio = Math.max(0, Math.min(1, Number(ratio) || 0));
      this.controlRatio = ratio;
      const max = Math.max(0, this.video.clientHeight - this.controls.offsetHeight - 24);
      this.controls.style.top = `${12 + max * ratio}px`;
      this.controls.style.bottom = 'auto';
    };
    try {
      const raw = localStorage.getItem('ffa_video_controls_y');
      const stored = raw === null ? NaN : Number(raw);
      if (Number.isFinite(stored) && stored >= 0 && stored <= 1) requestAnimationFrame(() => place(stored));
    } catch {}
    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(() => {
        if (Number.isFinite(this.controlRatio)) requestAnimationFrame(() => place(this.controlRatio));
      });
      this.resizeObserver.observe(this.video);
    }

    handle.addEventListener('pointerdown', event => {
      event.preventDefault();
      clearTimeout(this.hideTimer);
      handle.setPointerCapture?.(event.pointerId);
      const move = current => {
        const rect = this.video.getBoundingClientRect();
        const max = Math.max(1, rect.height - this.controls.offsetHeight - 24);
        const top = Math.max(12, Math.min(rect.height - this.controls.offsetHeight - 12,
          current.clientY - rect.top - this.controls.offsetHeight / 2));
        const ratio = (top - 12) / max;
        place(ratio);
        try { localStorage.setItem('ffa_video_controls_y', String(ratio)); } catch {}
      };
      const up = () => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', up);
        show();
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', up);
    });
    handle.addEventListener('dblclick', () => {
      this.controlRatio = null;
      this.controls.style.top = '';
      this.controls.style.bottom = '';
      try { localStorage.removeItem('ffa_video_controls_y'); } catch {}
      show();
    });
    show();
  }

  _situation(play) {
    const down = String(play.tags?.down || '');
    const ordinal = ({ '1':'1st', '2':'2nd', '3':'3rd', '4':'4th' })[down] || 'Down —';
    return ordinal + (play.tags?.distance ? ` & ${play.tags.distance}` : '');
  }

  _call(play) {
    const tags = play.tags || {};
    return tags.playType || tags.stType || tags.defFront || tags.formation || 'Untagged';
  }

  _result(play) {
    const tags = play.tags || {};
    const result = tags.result || tags.kickOutcome || 'No result';
    const raw = String(tags.yardage ?? '').trim();
    if (!raw) return result;
    const yards = Number(raw);
    return `${result}: ${yards > 0 ? '+' : ''}${raw}`;
  }

  render() {
    if (!this.track) return;
    const plays = this.tagger.plays || [];
    this.track.replaceChildren();
    plays.forEach(play => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'breakdown-play-card';
      button.dataset.playId = String(play.id);
      const number = document.createElement('span');
      number.className = 'breakdown-play-number';
      const situation = document.createElement('strong');
      const call = document.createElement('span');
      call.className = 'breakdown-play-call';
      button.append(number, situation, call);
      button.addEventListener('click', () => this.tagger.selectPlay(play.id));
      this._updateCard(button, play);
      this.track.appendChild(button);
    });
    const count = this.track.parentElement.querySelector('[data-play-count]');
    count.textContent = plays.length ? `${plays.length} play${plays.length === 1 ? '' : 's'}` : 'No plays';
    requestAnimationFrame(() => this.track.querySelector('.active')?.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }

  _updateCard(button, play) {
    if (!button || !play) return;
    button.classList.toggle('active', play.id === this.tagger.currentPlayId);
    button.setAttribute('aria-label', `Open play ${play.id}: ${this._situation(play)}, ${this._call(play)}, ${this._result(play)}`);
    button.querySelector('.breakdown-play-number').textContent = `PLAY ${play.id}`;
    button.querySelector('strong').textContent = this._situation(play);
    button.querySelector('.breakdown-play-call').textContent = `${this._call(play)} · ${this._result(play)}`;
  }

  _renderPlay(play) {
    if (!this.track || !play) return;
    const button = [...this.track.children].find(item => item.dataset.playId === String(play.id));
    if (button) this._updateCard(button, play);
    else this.render();
  }

  _renderSelection(play) {
    if (!this.track) return;
    [...this.track.children].forEach(button => button.classList.toggle('active', button.dataset.playId === String(play?.id ?? '')));
    const active = this.track.querySelector('.active');
    if (active) requestAnimationFrame(() => active.scrollIntoView({ block: 'nearest', inline: 'center' }));
  }
}
