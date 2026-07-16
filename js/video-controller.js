/**
 * VideoController - Manages video loading, playback, and frame-by-frame controls.
 */
export class VideoController {
  constructor() {
    this.video = document.getElementById('videoPlayer');
    this.placeholder = document.getElementById('videoPlaceholder');
    this.fileInput = document.getElementById('videoFileInput');
    this.folderInput = document.getElementById('videoFolderInput');
    this.btnLoadFolder = document.getElementById('btnLoadFolder');
    this.folderLoadBadge = document.getElementById('folderLoadBadge');
    this.dropZone = document.getElementById('videoDropZone');
    this.fileLabel = document.getElementById('fileLabel');
    this.btnPlayPause = document.getElementById('btnPlayPause');
    this.iconPlayPause = document.getElementById('iconPlayPause');
    this.btnStepBack = document.getElementById('btnStepBack');
    this.btnStepForward = document.getElementById('btnStepForward');
    this.timeDisplay = document.getElementById('timeDisplay');
    this.scrubBar = document.getElementById('scrubBar');
    this.scrubBarFill = document.getElementById('scrubBarFill');
    this.scrubBarHandle = document.getElementById('scrubBarHandle');
    this.speedSelect = document.getElementById('speedSelect');
    this.fpsInput = document.getElementById('fpsInput');
    this.btnLoop = document.getElementById('btnLoop');
    this.btnLoopA = document.getElementById('btnLoopA');
    this.btnLoopB = document.getElementById('btnLoopB');

    this.fps = 30;
    this.objectUrl = null;
    this.isScrubbing = false;
    this._wasPlayingBeforeScrub = false;
    // Loop playback. loopRegion = { start, end }; loopMode = 'play' | 'ab' | null.
    this.loopRegion = null;
    this.loopMode = null;
    this._abA = null;
    this.listeners = {};
    // Cross-origin handling for the desktop asset protocol. corsBlocked latches
    // true only once a no-crossOrigin RETRY is confirmed to load (see
    // _handleMediaError / _promoteCorsRetry) — so a corrupt clip can't strand
    // the canvas in tainted mode. _corsRetryPending holds the src we're
    // mid-retry on.
    this.corsBlocked = false;
    this._corsRetryPending = null;
    this._lastTimeText = '';

    this._bindEvents();
  }

  _bindEvents() {
    // File input — supports multiple files
    this.fileInput.addEventListener('change', (e) => {
      const files = this._filterVideoFiles(Array.from(e.target.files));
      if (files.length > 0) {
        this._showFolderBadge(files);
        this._emit('files-selected', { files });
      }
    });

    // Folder picker (webkitdirectory) — scoops every video file inside
    if (this.folderInput) {
      this.folderInput.addEventListener('change', (e) => {
        const files = this._filterVideoFiles(Array.from(e.target.files))
          // keep a natural sort order so plays load alphabetically
          .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(
            b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' }));
        if (files.length > 0) {
          this._showFolderBadge(files);
          this._emit('files-selected', { files });
        } else {
          alert('No video files found in that folder.');
        }
      });
    }
    if (this.btnLoadFolder && this.folderInput) {
      this.btnLoadFolder.addEventListener('click', () => this.folderInput.click());
    }

    // Drag and drop — supports single files, multi-files, AND dropped folders
    this.dropZone.addEventListener('dragover', (e) => {
      e.preventDefault();
      this.dropZone.classList.add('drag-over');
    });
    this.dropZone.addEventListener('dragleave', () => {
      this.dropZone.classList.remove('drag-over');
    });
    this.dropZone.addEventListener('drop', async (e) => {
      e.preventDefault();
      this.dropZone.classList.remove('drag-over');

      // Try DataTransferItemList for folder support. Fallback to flat files.
      const items = e.dataTransfer.items;
      let files = [];
      if (items && items.length && typeof items[0].webkitGetAsEntry === 'function') {
        const entries = [];
        for (const it of items) {
          const entry = it.webkitGetAsEntry();
          if (entry) entries.push(entry);
        }
        files = await this._walkEntries(entries);
      } else {
        files = Array.from(e.dataTransfer.files);
      }
      files = this._filterVideoFiles(files)
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(
          b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' }));
      if (files.length > 0) {
        this._showFolderBadge(files);
        this._emit('files-selected', { files });
      } else if (e.dataTransfer.files.length || (items && items.length)) {
        alert('No video files found in that drop. Supported: MP4, MOV, WebM, M4V.');
      }
    });

    // Playback controls
    this.btnPlayPause.addEventListener('click', () => this.togglePlay());
    this.btnStepBack.addEventListener('click', () => this.stepBack());
    this.btnStepForward.addEventListener('click', () => this.stepForward());

    // Loop controls
    if (this.btnLoop) this.btnLoop.addEventListener('click', () => this.toggleLoopPlay());
    if (this.btnLoopA) this.btnLoopA.addEventListener('click', () => this.setLoopA());
    if (this.btnLoopB) this.btnLoopB.addEventListener('click', () => this.setLoopB());

    // Speed
    this.speedSelect.addEventListener('change', () => {
      this.video.playbackRate = parseFloat(this.speedSelect.value);
    });

    // FPS
    this.fpsInput.addEventListener('change', () => {
      this.fps = parseInt(this.fpsInput.value) || 30;
    });

    // Video events
    this.video.addEventListener('loadedmetadata', () => {
      // A load that reaches metadata is valid — if it was a no-crossOrigin
      // retry, that proves crossOrigin was the culprit. Latch it now, before
      // the next clip switch, so we don't re-error+retry on every clip.
      this._promoteCorsRetry();
      this.placeholder.classList.add('hidden');
      this._updateTime();
      // Reapply playback speed — the load algorithm resets playbackRate to 1.0
      const rate = parseFloat(this.speedSelect.value) || 1;
      if (this.video.playbackRate !== rate) this.video.playbackRate = rate;
      this._emit('video-loaded', {
        duration: this.video.duration,
        width: this.video.videoWidth,
        height: this.video.videoHeight
      });
    });

    this.video.addEventListener('timeupdate', () => {
      // Loop: jump back to the region start once we pass the end.
      if (this.loopRegion && !this.isScrubbing) {
        if (this.video.currentTime >= this.loopRegion.end - 0.02 ||
            this.video.currentTime < this.loopRegion.start - 0.3) {
          this.video.currentTime = this.loopRegion.start;
        }
      }
      if (!this.isScrubbing) {
        this._updateScrubBar();
        this._updateTime();
      }
      this._emit('time-update', { time: this.video.currentTime });
    });

    this.video.addEventListener('play', () => {
      this._updatePlayPauseIcon(true);
      this._emit('play-state-change', { playing: true });
    });

    this.video.addEventListener('pause', () => {
      this._updatePlayPauseIcon(false);
      this._emit('play-state-change', { playing: false });
    });

    this.video.addEventListener('ended', () => {
      this._updatePlayPauseIcon(false);
      this._emit('video-ended', {});
    });

    this.video.addEventListener('waiting', () => {
      this.video.classList.add('is-buffering');
    });
    this.video.addEventListener('playing', () => {
      this.video.classList.remove('is-buffering');
    });
    this.video.addEventListener('stalled', () => {
      if (this.video.readyState < 3) this.video.classList.add('is-buffering');
    });
    this.video.addEventListener('canplay', () => {
      this.video.classList.remove('is-buffering');
    });
    this.video.addEventListener('error', () => this._handleMediaError());
    this.video.addEventListener('seeked', () => {
      this.video.classList.remove('is-buffering');
    });

    // Scrub bar interaction (pointer events cover mouse + touch)
    this.scrubBar.addEventListener('pointerdown', (e) => {
      this.scrubBar.setPointerCapture(e.pointerId);
      this._startScrub(e);
    });
    this.scrubBar.addEventListener('pointermove', (e) => {
      if (this.isScrubbing) this._doScrub(e);
    });
    this.scrubBar.addEventListener('pointerup', (e) => {
      if (this.isScrubbing) {
        this.scrubBar.releasePointerCapture(e.pointerId);
        this._endScrub();
      }
    });
  }

  /**
   * Point the <video> at a non-blob URL (desktop asset protocol), applying the
   * crossOrigin attribute unless a confirmed prior CORS failure proved the
   * protocol doesn't serve CORS headers. SINGLE owner of that decision — both
   * loadUrl (single-video) and the multi-clip playlist path call this so the
   * two can never drift.
   */
  setSrc(url) {
    if (this.corsBlocked) this.video.removeAttribute('crossorigin');
    else this.video.crossOrigin = 'anonymous';
    this.video.src = url;
    this.video.load();
  }

  loadFile(file) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.currentFile = file;
    this.objectUrl = URL.createObjectURL(file);
    this.video.removeAttribute('crossorigin');
    this.video.src = this.objectUrl;
    this.video.load();
    this.fileLabel.textContent = file.name;
    this.placeholder.classList.add('hidden');
    this._emit('file-loaded', { name: file.name });
  }

  loadUrl(url, displayName) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.currentFile = null;
    this._loadUrlName = displayName || 'Film';
    this.setSrc(url);
    this.placeholder.classList.add('hidden');
    this.fileLabel.textContent = this._loadUrlName;
    this._emit('file-loaded', { name: this._loadUrlName });
  }

  /** True when an errored load is worth retrying without crossOrigin: a real
   *  (non-blob) source still carrying the attribute that we haven't already
   *  retried. The MediaError CODE is deliberately ignored — a CORS rejection
   *  and a decode error aren't reliably distinguishable by code across
   *  WebViews, so the RETRY's outcome decides (_promoteCorsRetry). */
  _shouldCorsRetry(src) {
    return !!src && !src.startsWith('blob:') &&
      this.video.hasAttribute('crossorigin') && this._corsRetryPending !== src;
  }

  _handleMediaError() {
    this.video.classList.remove('is-buffering');
    this._updatePlayPauseIcon(false);
    if (!this.video.currentSrc && !this.video.getAttribute('src')) return;
    const me = this.video.error;
    const code = me ? me.code : '?';
    const msg = me ? me.message : '';
    const src = this.video.currentSrc || this.video.getAttribute('src') || '';
    // console.WARN (not error): a media error is an expected, handled condition
    // (bad codec, CORS retry, a fixture's fake clip) — the e2e "no console errors"
    // gate must not trip on it, and the app surfaces it via the placeholder + toast.
    console.warn(`Video error code=${code} msg="${msg}" src="${src.slice(0, 200)}"`);
    if (this._shouldCorsRetry(src)) {
      // Retry WITHOUT crossOrigin. Don't latch corsBlocked yet — only if this
      // retry actually loads (_promoteCorsRetry, on loadedmetadata) do we know
      // crossOrigin was the cause. A genuinely corrupt clip errors again and
      // falls through below, leaving corsBlocked false so subsequent good clips
      // keep an untainted canvas for frame export / AI vision.
      this._corsRetryPending = src;
      console.log('Retrying without crossOrigin...');
      this.video.removeAttribute('crossorigin');
      this.video.src = src;
      this.video.load();
      return;
    }
    // Not retryable, or the retry itself just failed: not a CORS problem. Clear
    // the pending mark so a later unrelated success can't falsely latch.
    this._corsRetryPending = null;
    const name = this.currentFile?.name || this.fileLabel?.textContent || 'this file';
    this.placeholder.classList.remove('hidden');
    this.fileLabel.textContent = `⚠ Couldn't play ${name} — try MP4, MOV, or WebM`;
    if (src && (src.includes('asset.localhost') || src.startsWith('asset:'))) {
      const detail = `Video load failed (asset protocol) | Error code: ${code} | Message: ${msg} | URL: ${src.slice(0, 300)}`;
      console.warn('ASSET-DIAG:', detail);
      try { window.app?.tagger?.toast?.(detail, 12000); } catch (_) {}
    }
    this._emit('video-error', { name, code, msg, src });
  }

  /** A load reached metadata. If it was a no-crossOrigin retry, the asset
   *  protocol really lacks CORS headers — latch corsBlocked so every later
   *  load skips crossOrigin up front (a 69-clip game retries once, not 69×). */
  _promoteCorsRetry() {
    if (this._corsRetryPending != null) {
      this.corsBlocked = true;
      this._corsRetryPending = null;
    }
  }

  unloadVideo() {
    try { this.video.pause(); } catch {}
    this.clearLoop();
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
      this.objectUrl = null;
    }
    this.currentFile = null;
    this._corsRetryPending = null;
    this.video.removeAttribute('src');
    this.video.removeAttribute('crossorigin');
    try { this.video.load(); } catch {}
    if (this.placeholder) this.placeholder.classList.remove('hidden');
    if (this.fileLabel) this.fileLabel.textContent = 'Drop video(s) / folder or click to load';
    if (this.folderLoadBadge) this.folderLoadBadge.classList.add('hidden');
    this._setScrubPosition(0);
    this._updatePlayPauseIcon(false);
    if (this.timeDisplay) this.timeDisplay.textContent = '0:00 / 0:00';
    this._emit('video-unloaded', {});
  }

  /**
   * Filter a list of File objects down to supported video files. Some
   * browsers leave the MIME type blank for less-common containers, so we
   * also accept known video extensions as a fallback.
   */
  _filterVideoFiles(files) {
    const exts = /\.(mp4|m4v|mov|webm|mkv|avi|wmv|mpg|mpeg|ogv|3gp|ts|mts|m2ts)$/i;
    return files.filter(f => (f.type && f.type.startsWith('video/')) || exts.test(f.name || ''));
  }

  /**
   * Recursively walk a list of FileSystemEntry objects (dropped folders)
   * and return a flat list of File objects. Subfolders are included.
   */
  async _walkEntries(entries) {
    const out = [];
    const walk = async (entry, relPath = '') => {
      if (!entry) return;
      if (entry.isFile) {
        const file = await new Promise((res, rej) => entry.file(res, rej));
        // Preserve folder path so we can sort naturally
        if (relPath && !file.webkitRelativePath) {
          try { Object.defineProperty(file, 'webkitRelativePath', { value: relPath + file.name }); }
          catch {}
        }
        out.push(file);
      } else if (entry.isDirectory) {
        const reader = entry.createReader();
        const readAll = () => new Promise((resolve, reject) => {
          const all = [];
          const readBatch = () => reader.readEntries((results) => {
            if (!results.length) resolve(all);
            else { all.push(...results); readBatch(); }
          }, reject);
          readBatch();
        });
        const children = await readAll();
        for (const c of children) await walk(c, relPath + entry.name + '/');
      }
    };
    for (const e of entries) await walk(e);
    return out;
  }

  /**
   * Show a small badge on the top bar when a folder of videos was loaded.
   */
  _showFolderBadge(files) {
    if (!this.folderLoadBadge) return;
    if (files.length <= 1) {
      this.folderLoadBadge.classList.add('hidden');
      return;
    }
    this.folderLoadBadge.textContent = `📁 ${files.length} clips`;
    this.folderLoadBadge.classList.remove('hidden');
  }

  togglePlay() {
    if (!this.video.src) return;
    if (this.video.paused) {
      this.video.play().catch(() => {
        this._updatePlayPauseIcon(false);
      });
    } else {
      this.video.pause();
    }
  }

  // ---- Loop playback ---------------------------------------------------
  // App keeps `currentPlayRegion = { start, end }` in sync with the selected
  // play so "Loop play" knows what to repeat.

  toggleLoopPlay() {
    if (this.loopMode === 'play') { this.clearLoop(); return; }
    const r = this.currentPlayRegion;
    if (!r || !(r.end > r.start)) { this.clearLoop(); return; }
    this.loopRegion = { start: r.start, end: r.end };
    this.loopMode = 'play';
    this._abA = null;
    this._updateLoopUI();
    if (this.video.currentTime < r.start || this.video.currentTime >= r.end) {
      this.video.currentTime = r.start;
    }
    if (this.video.src && this.video.paused) this.video.play().catch(() => {});
  }

  setLoopA() {
    this._abA = this.video.currentTime;
    this.loopMode = null;
    this.loopRegion = null;
    this._updateLoopUI();
  }

  setLoopB() {
    const b = this.video.currentTime;
    if (this._abA == null) { this._abA = 0; }
    const start = Math.min(this._abA, b);
    const end = Math.max(this._abA, b);
    if (end - start < 0.1) return;
    this.loopRegion = { start, end };
    this.loopMode = 'ab';
    this._updateLoopUI();
    this.video.currentTime = start;
    if (this.video.src && this.video.paused) this.video.play().catch(() => {});
  }

  clearLoop() {
    this.loopRegion = null;
    this.loopMode = null;
    this._abA = null;
    this._updateLoopUI();
  }

  _updateLoopUI() {
    if (this.btnLoop) this.btnLoop.classList.toggle('active', this.loopMode === 'play');
    if (this.btnLoopA) this.btnLoopA.classList.toggle('set', this._abA != null || this.loopMode === 'ab');
    if (this.btnLoopB) this.btnLoopB.classList.toggle('set', this.loopMode === 'ab');
  }

  stepForward() {
    if (!this.video.src) return;
    this.video.pause();
    this.video.currentTime = Math.min(
      this.video.currentTime + 1 / this.fps,
      this.video.duration
    );
    this._updateScrubBar();
    this._updateTime();
    this._emit('time-update', { time: this.video.currentTime });
  }

  stepBack() {
    if (!this.video.src) return;
    this.video.pause();
    this.video.currentTime = Math.max(this.video.currentTime - 1 / this.fps, 0);
    this._updateScrubBar();
    this._updateTime();
    this._emit('time-update', { time: this.video.currentTime });
  }

  seekTo(time) {
    if (!this.video.src || !isFinite(this.video.duration)) return;
    this.video.currentTime = Math.max(0, Math.min(time, this.video.duration));
    this._updateScrubBar();
    this._updateTime();
  }

  get currentTime() {
    return this.video.currentTime;
  }

  get duration() {
    return this.video.duration || 0;
  }

  get paused() {
    return this.video.paused;
  }

  get videoElement() {
    return this.video;
  }

  _startScrub(e) {
    this._wasPlayingBeforeScrub = !this.video.paused;
    if (this._wasPlayingBeforeScrub) this.video.pause();
    this.isScrubbing = true;
    this._doScrub(e);
  }

  _doScrub(e) {
    const rect = this.scrubBar.getBoundingClientRect();
    const pct = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    this.video.currentTime = pct * this.video.duration;
    this._setScrubPosition(pct);
    this._updateTime();
    this._emit('time-update', { time: this.video.currentTime });
  }

  _endScrub() {
    this.isScrubbing = false;
    if (this._wasPlayingBeforeScrub) {
      this.video.play().catch(() => {
        this._updatePlayPauseIcon(false);
      });
      this._wasPlayingBeforeScrub = false;
    }
  }

  _updateScrubBar() {
    if (!this.video.duration) return;
    const pct = this.video.currentTime / this.video.duration;
    this._setScrubPosition(pct);
  }

  _setScrubPosition(pct) {
    pct = Math.max(0, Math.min(1, Number(pct) || 0));
    const pctStr = (pct * 100) + '%';
    // Transform stays on the compositor; animating width forced layout during
    // playback and made high-resolution desktop film feel less stable.
    this.scrubBarFill.style.transform = `scaleX(${pct})`;
    this.scrubBarHandle.style.left = pctStr;
  }

  _updateTime() {
    const cur = this._formatTime(this.video.currentTime);
    const dur = this._formatTime(this.video.duration || 0);
    const text = `${cur} / ${dur}`;
    if (text !== this._lastTimeText) {
      this.timeDisplay.textContent = text;
      this._lastTimeText = text;
    }
  }

  _formatTime(seconds) {
    if (isNaN(seconds)) return '0:00';
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  _updatePlayPauseIcon(playing) {
    const use = this.iconPlayPause.querySelector('use');
    if (use) {
      use.setAttribute('href', `assets/icons.svg#icon-${playing ? 'pause' : 'play'}`);
    }
  }

  // Simple event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
