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

    this.fps = 30;
    this.objectUrl = null;
    this.isScrubbing = false;
    this.listeners = {};

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
      }
    });

    // Playback controls
    this.btnPlayPause.addEventListener('click', () => this.togglePlay());
    this.btnStepBack.addEventListener('click', () => this.stepBack());
    this.btnStepForward.addEventListener('click', () => this.stepForward());

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
      this.placeholder.classList.add('hidden');
      this._updateTime();
      this._emit('video-loaded', {
        duration: this.video.duration,
        width: this.video.videoWidth,
        height: this.video.videoHeight
      });
    });

    this.video.addEventListener('timeupdate', () => {
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
    });

    // Scrub bar interaction
    this.scrubBar.addEventListener('mousedown', (e) => this._startScrub(e));
    document.addEventListener('mousemove', (e) => {
      if (this.isScrubbing) this._doScrub(e);
    });
    document.addEventListener('mouseup', () => {
      if (this.isScrubbing) this._endScrub();
    });
  }

  loadFile(file) {
    if (this.objectUrl) {
      URL.revokeObjectURL(this.objectUrl);
    }
    this.currentFile = file;
    this.objectUrl = URL.createObjectURL(file);
    this.video.src = this.objectUrl;
    this.video.load();
    this.fileLabel.textContent = file.name;
    this._emit('file-loaded', { name: file.name });
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
      this.video.play();
    } else {
      this.video.pause();
    }
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
    if (!this.video.src) return;
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
  }

  _updateScrubBar() {
    if (!this.video.duration) return;
    const pct = this.video.currentTime / this.video.duration;
    this._setScrubPosition(pct);
  }

  _setScrubPosition(pct) {
    const pctStr = (pct * 100) + '%';
    this.scrubBarFill.style.width = pctStr;
    this.scrubBarHandle.style.left = pctStr;
  }

  _updateTime() {
    const cur = this._formatTime(this.video.currentTime);
    const dur = this._formatTime(this.video.duration || 0);
    this.timeDisplay.textContent = `${cur} / ${dur}`;
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
