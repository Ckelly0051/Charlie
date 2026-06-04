/**
 * MultiAngle — two camera angles of the same game, time-locked.
 *
 * Typical use: sideline (primary) + end zone (secondary). Both videos
 * play/pause/seek in sync; the coach toggles, views side-by-side, or
 * uses picture-in-picture. Tags and drawings attach to the shared play
 * data, not to a specific angle — they show the same snap.
 *
 * View modes:
 *   - single (Toggle):      one angle visible at a time, V key swaps.
 *   - sideBySide:           both angles 50/50, active one has outline.
 *   - pip (Picture-in-Pic): primary full-size, secondary small overlay.
 */
export class MultiAngle {
  constructor(vc) {
    this.vc = vc;
    this.video2 = document.getElementById('videoPlayer2');
    this.container = document.getElementById('videoContainer');
    this.objectUrl2 = null;
    this.offset = 0;
    this.enabled = false;
    this.viewMode = 'single';
    this.activeAngle = 1;
    this.listeners = {};
    this._driftThreshold = 0.15;
    this._userSetViewMode = false;

    this._bindUI();
    this._bindSync();
  }

  _bindUI() {
    const btnAdd = document.getElementById('btnAddAngle');
    const fileInput = document.getElementById('angle2FileInput');
    const btnRemove = document.getElementById('btnRemoveAngle');
    const viewSelect = document.getElementById('angleViewMode');
    const btnSwap = document.getElementById('btnSwapAngle');
    const offsetInput = document.getElementById('angleSyncOffset');

    if (btnAdd && fileInput) {
      btnAdd.addEventListener('click', () => fileInput.click());
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) this.loadAngle2(file);
        fileInput.value = '';
      });
    }

    btnRemove?.addEventListener('click', () => this.removeAngle2());
    btnSwap?.addEventListener('click', () => this.swapActive());

    viewSelect?.addEventListener('change', () => {
      this.setViewMode(viewSelect.value);
    });

    offsetInput?.addEventListener('change', () => {
      this.offset = parseFloat(offsetInput.value) || 0;
      this._syncTime();
    });

    const wrapper2 = document.getElementById('angleWrapper2');
    wrapper2?.addEventListener('click', () => {
      if (this.enabled && this.viewMode === 'pip') this.swapActive();
    });
  }

  _bindSync() {
    this.vc.on('play-state-change', ({ playing }) => {
      if (!this.enabled || !this.video2) return;
      if (playing) this.video2.play().catch(() => {});
      else this.video2.pause();
    });

    this.vc.on('time-update', () => {
      if (this.enabled) this._syncTime();
    });

    this.vc.videoElement.addEventListener('ratechange', () => {
      if (this.enabled && this.video2) {
        this.video2.playbackRate = this.vc.videoElement.playbackRate;
      }
    });

    this.vc.on('video-unloaded', () => {
      this.removeAngle2();
    });
  }

  _syncTime() {
    if (!this.video2 || !this.enabled) return;
    const target = this.vc.currentTime + this.offset;
    if (Math.abs(this.video2.currentTime - target) > this._driftThreshold) {
      this.video2.currentTime = Math.max(0, target);
    }
  }

  loadAngle2(file) {
    if (this.objectUrl2) URL.revokeObjectURL(this.objectUrl2);
    this.objectUrl2 = URL.createObjectURL(file);
    this.video2.src = this.objectUrl2;
    this.video2.load();
    this.enabled = true;
    this.angle2Name = file.name;
    this.activeAngle = 1;

    this.video2.playbackRate = this.vc.videoElement.playbackRate;

    this.video2.addEventListener('loadedmetadata', () => {
      this._syncTime();
      if (!this.vc.paused) this.video2.play().catch(() => {});
    }, { once: true });

    if (!this._userSetViewMode) {
      const mode = window.innerWidth >= 1100 ? 'sideBySide' : 'single';
      this.viewMode = mode;
      const vs = document.getElementById('angleViewMode');
      if (vs) vs.value = mode;
    }

    this._updateUI();
    this._emit('angle-loaded', { name: file.name });
  }

  removeAngle2() {
    if (!this.enabled && !this.objectUrl2) return;
    if (this.objectUrl2) {
      URL.revokeObjectURL(this.objectUrl2);
      this.objectUrl2 = null;
    }
    if (this.video2) {
      this.video2.pause();
      this.video2.removeAttribute('src');
      try { this.video2.load(); } catch {}
    }
    this.enabled = false;
    this.activeAngle = 1;
    this.angle2Name = null;
    this._userSetViewMode = false;
    this._updateUI();
    this._emit('angle-removed');
  }

  swapActive() {
    if (!this.enabled) return;
    this.activeAngle = this.activeAngle === 1 ? 2 : 1;
    this._updateUI();
    this._emit('angle-swapped', { active: this.activeAngle });
  }

  setViewMode(mode) {
    this._userSetViewMode = true;
    this.viewMode = mode;
    this._updateUI();
    this._emit('view-changed', { mode });
  }

  _updateUI() {
    const c = this.container;
    if (!c) return;

    const info = document.getElementById('angle2Info');
    const nameEl = document.getElementById('angle2Name');
    const label1 = document.getElementById('angleLabel1');
    const label2 = document.getElementById('angleLabel2');

    if (info) info.classList.toggle('hidden', !this.enabled);
    if (nameEl) nameEl.textContent = this.enabled ? this.angle2Name : '';

    c.classList.toggle('has-angle2', this.enabled);
    c.classList.remove('angle-single', 'angle-sbs', 'angle-pip');
    c.classList.remove('active-angle-1', 'active-angle-2');

    if (this.enabled) {
      c.classList.add('active-angle-' + this.activeAngle);
      switch (this.viewMode) {
        case 'sideBySide': c.classList.add('angle-sbs'); break;
        case 'pip': c.classList.add('angle-pip'); break;
        default: c.classList.add('angle-single'); break;
      }
    }

    if (label1) {
      label1.classList.toggle('active', this.activeAngle === 1);
      label1.style.display = this.enabled ? '' : 'none';
    }
    if (label2) {
      label2.classList.toggle('active', this.activeAngle === 2);
      label2.style.display = this.enabled ? '' : 'none';
    }
  }

  get activeVideoElement() {
    if (this.activeAngle === 2 && this.enabled) return this.video2;
    return this.vc.videoElement;
  }

  on(event, cb) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(cb);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
