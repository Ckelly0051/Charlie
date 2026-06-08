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

    // Each entry: { id, file: File|null, name: string, assetUrl: string|null, objectUrl: string|null, duration: number|null, playId: number|null }
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

  async _autoCreatePlays() {
    for (const clip of this.clips) {
      if (clip.playId !== null) continue;
      const source = clip.assetUrl || clip.file;
      if (source) clip.duration = await this._probeDuration(source);

      const play = {
        id: this.tagger.nextId++,
        timestamp: { start: 0, end: clip.duration || 0 },
        tags: {
          down: '', distance: '', formation: '', playType: '', runPass: '',
          defFront: '', coverage: '', blitz: '', result: '', yardage: '',
          hash: '', custom: []
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

  _probeDuration(source) {
    return new Promise((resolve) => {
      const tempVideo = document.createElement('video');
      tempVideo.preload = 'metadata';
      const isUrl = typeof source === 'string';
      const url = isUrl ? source : URL.createObjectURL(source);
      if (isUrl) tempVideo.crossOrigin = 'anonymous';
      tempVideo.src = url;
      tempVideo.addEventListener('loadedmetadata', () => {
        const dur = tempVideo.duration;
        if (!isUrl) URL.revokeObjectURL(url);
        tempVideo.src = '';
        resolve(dur);
      });
      tempVideo.addEventListener('error', () => {
        if (!isUrl) URL.revokeObjectURL(url);
        resolve(0);
      });
    });
  }

  async rehydrateFromDisk(diskFiles, plays) {
    const nameToPlay = {};
    for (const p of plays) {
      if (p.clipName && !nameToPlay[p.clipName]) nameToPlay[p.clipName] = p;
    }

    const sorted = diskFiles.slice().sort((a, b) =>
      a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' }));

    for (const file of sorted) {
      const displayName = file.name.replace(/\.[^.]+$/, '');
      const entry = {
        id: this._nextClipId++,
        file: null,
        name: displayName,
        assetUrl: file.url,
        objectUrl: null,
        duration: null,
        playId: null,
      };

      const play = nameToPlay[displayName];
      if (play) {
        entry.playId = play.id;
        entry.duration = play.timestamp ? play.timestamp.end : null;
        play.clipId = entry.id;
        delete nameToPlay[displayName];
      }

      this.clips.push(entry);
    }

    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
  }

  /**
   * Switch the video player to show a specific clip by index.
   */
  switchToClip(index) {
    if (index < 0 || index >= this.clips.length) return;

    const clip = this.clips[index];
    this.activeClipIndex = index;

    if (clip.assetUrl) {
      if (clip.objectUrl) { URL.revokeObjectURL(clip.objectUrl); clip.objectUrl = null; }
      this.vc.currentFile = null;
      this.vc.video.crossOrigin = 'anonymous';
      this.vc.video.src = clip.assetUrl;
    } else {
      if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl);
      clip.objectUrl = URL.createObjectURL(clip.file);
      this.vc.currentFile = clip.file;
      this.vc.video.removeAttribute('crossorigin');
      this.vc.video.src = clip.objectUrl;
    }

    this.vc.video.load();
    this.vc.fileLabel.textContent = clip.file ? clip.file.name : clip.name;
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

    // Adjust active index.
    if (this.clips.length === 0) {
      this.activeClipIndex = -1;
    } else if (index < this.activeClipIndex) {
      // Removed a clip before the active one: shift the pointer left so it
      // still points at the same (active) clip.
      this.activeClipIndex -= 1;
      this.switchToClip(this.activeClipIndex);
    } else if (index === this.activeClipIndex) {
      // Removed the active clip: stay at this index, which now holds the NEXT
      // clip, so deleting flows forward. Clamp when we removed the last one.
      this.activeClipIndex = Math.min(index, this.clips.length - 1);
      this.switchToClip(this.activeClipIndex);
    }
    // index > activeClipIndex: the active clip's position is unchanged.

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this._updatePlaylistUI();
    this._updateClipIndicator();
    this._updateClipCount();
  }

  /**
   * Drop every clip (revoking object URLs) and reset the playlist UI. Used when
   * switching to a different game in the season so its clips don't linger.
   * Does not touch tagger.plays — the caller loads the new game's plays.
   */
  reset() {
    for (const clip of this.clips) {
      if (clip.objectUrl) URL.revokeObjectURL(clip.objectUrl);
    }
    this.clips = [];
    this.activeClipIndex = -1;
    this._nextClipId = 1;
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
      name.title = clip.file ? clip.file.name : clip.name;

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
