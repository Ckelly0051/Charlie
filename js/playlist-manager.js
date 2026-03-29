/**
 * PlaylistManager - Manages multiple video clips where each clip is one play.
 *
 * Game film is typically recorded play-by-play as individual clips, not as one
 * continuous video. This module handles:
 * - Loading multiple video files at once (multi-select or folder drop)
 * - Maintaining an ordered playlist of clips
 * - Navigating between clips (prev/next, click-to-select)
 * - Auto-creating a play entry in PlayTagger for each loaded clip
 * - Syncing the active clip with the video player
 */
export class PlaylistManager {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.listeners = {};

    // Each entry: { id, file: File, name: string, objectUrl: string|null, duration: number|null, playId: number|null }
    this.clips = [];
    this.activeClipIndex = -1;

    this.playlistEl = document.getElementById('playlistItems');
    this.clipCountEl = document.getElementById('clipCount');
    this.btnAddClips = document.getElementById('btnAddClips');
    this.clipFileInput = document.getElementById('clipFileInput');
    this.btnPrevClip = document.getElementById('btnPrevClip');
    this.btnNextClip = document.getElementById('btnNextClip');
    this.clipIndicator = document.getElementById('clipIndicator');

    this._nextClipId = 1;

    this._bindEvents();
  }

  _bindEvents() {
    // Add clips button
    this.btnAddClips.addEventListener('click', () => {
      this.clipFileInput.click();
    });

    this.clipFileInput.addEventListener('change', (e) => {
      if (e.target.files.length > 0) {
        this.addFiles(Array.from(e.target.files));
        // Reset so the same files can be re-selected if needed
        e.target.value = '';
      }
    });

    // Prev/next clip
    this.btnPrevClip.addEventListener('click', () => this.prevClip());
    this.btnNextClip.addEventListener('click', () => this.nextClip());

    // Also support drop zone for multiple files
    const dropZone = document.getElementById('videoDropZone');
    const origDropHandler = dropZone.ondrop;

    dropZone.addEventListener('drop', (e) => {
      e.preventDefault();
      dropZone.classList.remove('drag-over');

      const files = Array.from(e.dataTransfer.files).filter(f => f.type.startsWith('video/'));
      if (files.length === 0) return;

      if (files.length === 1 && this.clips.length === 0) {
        // Single file with no existing playlist — use legacy single-video mode
        this.vc.loadFile(files[0]);
      } else {
        // Multiple files or adding to existing playlist
        this.addFiles(files);
      }
    }, true); // capture phase to override existing handler

    // When the main file input loads a single file and there's no playlist,
    // that's fine — single-video mode still works. But if there IS a playlist,
    // treat it as adding a clip.
    this.vc.on('file-loaded', (data) => {
      // If we have an active playlist, don't let single-file loads break it
      // (the single load was initiated by us via switchToClip)
    });
  }

  /**
   * Add multiple video files to the playlist.
   * Sorts them naturally by filename.
   */
  addFiles(files) {
    // Sort files naturally by name (play_01, play_02, etc.)
    const sorted = files.slice().sort((a, b) => {
      return a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });
    });

    for (const file of sorted) {
      const clip = {
        id: this._nextClipId++,
        file: file,
        name: file.name.replace(/\.[^.]+$/, ''), // strip extension for display
        objectUrl: null,
        duration: null,
        playId: null
      };
      this.clips.push(clip);
    }

    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();

    // Auto-create play entries for each new clip
    this._autoCreatePlays();

    // If nothing is playing, activate the first clip
    if (this.activeClipIndex === -1) {
      this.switchToClip(0);
    }

    this._emit('clips-added', { count: sorted.length, total: this.clips.length });
  }

  /**
   * Create a play entry in PlayTagger for each clip that doesn't have one yet.
   * Uses a temporary hidden video to probe each clip's duration.
   */
  async _autoCreatePlays() {
    for (const clip of this.clips) {
      if (clip.playId !== null) continue;

      // Probe duration
      clip.duration = await this._probeDuration(clip.file);

      // Create a play entry
      const play = {
        id: this.tagger.nextId++,
        timestamp: { start: 0, end: clip.duration || 0 },
        tags: {
          down: '',
          distance: '',
          formation: '',
          playType: '',
          defFront: '',
          coverage: '',
          blitz: '',
          result: '',
          yardage: '',
          hash: '',
          custom: []
        },
        annotations: [],
        notes: '',
        clipName: clip.name,
        clipId: clip.id
      };

      this.tagger.plays.push(play);
      clip.playId = play.id;
    }

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this._updatePlaylistUI();
  }

  /**
   * Get a clip's video duration by briefly loading it in a hidden video element.
   */
  _probeDuration(file) {
    return new Promise((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      const url = URL.createObjectURL(file);
      tempVideo.src = url;
      tempVideo.addEventListener('loadedmetadata', () => {
        const dur = tempVideo.duration;
        URL.revokeObjectURL(url);
        tempVideo.src = '';
        resolve(dur);
      });
      tempVideo.addEventListener('error', () => {
        URL.revokeObjectURL(url);
        resolve(0);
      });
    });
  }

  /**
   * Switch the video player to show a specific clip by index.
   */
  switchToClip(index) {
    if (index < 0 || index >= this.clips.length) return;

    const clip = this.clips[index];
    this.activeClipIndex = index;

    // Revoke old URL if this clip had one
    if (clip.objectUrl) {
      URL.revokeObjectURL(clip.objectUrl);
    }
    clip.objectUrl = URL.createObjectURL(clip.file);

    // Load into video player
    this.vc.video.src = clip.objectUrl;
    this.vc.video.load();
    this.vc.fileLabel.textContent = clip.file.name;
    this.vc.placeholder.classList.add('hidden');

    // Select the associated play in the tagger
    if (clip.playId !== null) {
      // Use internal method to avoid re-seeking since we just loaded
      this.tagger.currentPlayId = clip.playId;
      const play = this.tagger.getPlay(clip.playId);
      if (play) {
        this.tagger.playSelect.value = clip.playId;
        this.tagger._loadTagForm(play);
        this.tagger._updateTimeline();
        this.tagger._emit('play-selected', play);
      }
    }

    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._emit('clip-switched', { index, clip });
  }

  nextClip() {
    if (this.activeClipIndex < this.clips.length - 1) {
      this.switchToClip(this.activeClipIndex + 1);
    }
  }

  prevClip() {
    if (this.activeClipIndex > 0) {
      this.switchToClip(this.activeClipIndex - 1);
    }
  }

  /**
   * Find the clip associated with a given play ID and switch to it.
   */
  switchToClipByPlayId(playId) {
    const index = this.clips.findIndex(c => c.playId === playId);
    if (index !== -1 && index !== this.activeClipIndex) {
      this.switchToClip(index);
    }
  }

  removeClip(index) {
    if (index < 0 || index >= this.clips.length) return;
    const clip = this.clips[index];

    // Remove the associated play
    if (clip.playId !== null) {
      this.tagger.plays = this.tagger.plays.filter(p => p.id !== clip.playId);
      if (this.tagger.currentPlayId === clip.playId) {
        this.tagger.currentPlayId = null;
        this.tagger._clearTagForm();
      }
    }

    // Clean up URL
    if (clip.objectUrl) {
      URL.revokeObjectURL(clip.objectUrl);
    }

    this.clips.splice(index, 1);

    // Adjust active index
    if (this.clips.length === 0) {
      this.activeClipIndex = -1;
    } else if (index <= this.activeClipIndex) {
      this.activeClipIndex = Math.max(0, this.activeClipIndex - 1);
      this.switchToClip(this.activeClipIndex);
    }

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
  }

  get hasClips() {
    return this.clips.length > 0;
  }

  get activeClip() {
    return this.clips[this.activeClipIndex] || null;
  }

  // --- UI ---

  _updatePlaylistUI() {
    if (!this.playlistEl) return;
    this.playlistEl.innerHTML = '';

    this.clips.forEach((clip, i) => {
      const item = document.createElement('div');
      item.className = 'playlist-item' + (i === this.activeClipIndex ? ' active' : '');
      item.dataset.index = i;

      const num = document.createElement('span');
      num.className = 'playlist-num';
      num.textContent = (i + 1);

      const name = document.createElement('span');
      name.className = 'playlist-name';
      name.textContent = clip.name;
      name.title = clip.file.name;

      const dur = document.createElement('span');
      dur.className = 'playlist-dur';
      dur.textContent = clip.duration ? this._fmt(clip.duration) : '--:--';

      const removeBtn = document.createElement('button');
      removeBtn.className = 'playlist-remove';
      removeBtn.innerHTML = '&times;';
      removeBtn.title = 'Remove clip';
      removeBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        this.removeClip(i);
      });

      item.appendChild(num);
      item.appendChild(name);
      item.appendChild(dur);
      item.appendChild(removeBtn);

      item.addEventListener('click', () => this.switchToClip(i));

      this.playlistEl.appendChild(item);
    });
  }

  _updateClipIndicator() {
    if (!this.clipIndicator) return;
    if (this.clips.length === 0) {
      this.clipIndicator.textContent = '';
    } else {
      this.clipIndicator.textContent = `Clip ${this.activeClipIndex + 1}/${this.clips.length}`;
    }
  }

  _updateClipCount() {
    if (!this.clipCountEl) return;
    this.clipCountEl.textContent = `${this.clips.length} clip${this.clips.length !== 1 ? 's' : ''}`;
  }

  _fmt(sec) {
    if (!sec || isNaN(sec)) return '--:--';
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  // Event system
  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
