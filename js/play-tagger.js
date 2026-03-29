/**
 * PlayTagger - Manages play segmentation, categorization, and timeline display.
 */
export class PlayTagger {
  constructor(videoController) {
    this.vc = videoController;
    this.plays = [];
    this.currentPlayId = null;
    this.pendingStart = null;
    this.listeners = {};
    this.nextId = 1;

    this.playSelect = document.getElementById('playSelect');
    this.btnMarkStart = document.getElementById('btnMarkStart');
    this.btnMarkEnd = document.getElementById('btnMarkEnd');
    this.btnDeletePlay = document.getElementById('btnDeletePlay');
    this.timelineBar = document.getElementById('timelineBar');

    // Tag form elements
    this.tagFields = {
      down: document.getElementById('tagDown'),
      distance: document.getElementById('tagDistance'),
      formation: document.getElementById('tagFormation'),
      playType: document.getElementById('tagPlayType'),
      defFront: document.getElementById('tagDefFront'),
      coverage: document.getElementById('tagCoverage'),
      blitz: document.getElementById('tagBlitz'),
      result: document.getElementById('tagResult'),
      yardage: document.getElementById('tagYardage'),
      hash: document.getElementById('tagHash'),
    };

    this.tagChips = document.getElementById('tagChips');
    this.customTagInput = document.getElementById('customTagInput');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnMarkStart.addEventListener('click', () => this.markStart());
    this.btnMarkEnd.addEventListener('click', () => this.markEnd());
    this.btnDeletePlay.addEventListener('click', () => this.deleteCurrentPlay());
    this.playSelect.addEventListener('change', () => {
      const id = parseInt(this.playSelect.value);
      if (id) this.selectPlay(id);
    });

    // Tag form changes
    Object.values(this.tagFields).forEach(el => {
      el.addEventListener('change', () => this._saveCurrentTags());
    });

    // Custom tag input
    this.customTagInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        const tag = this.customTagInput.value.trim();
        if (tag && this.currentPlayId) {
          const play = this.getPlay(this.currentPlayId);
          if (play && !play.tags.custom.includes(tag)) {
            play.tags.custom.push(tag);
            this._renderCustomTags(play.tags.custom);
            this._emit('play-updated', play);
          }
          this.customTagInput.value = '';
        }
      }
    });
  }

  markStart() {
    this.pendingStart = this.vc.currentTime;
    this.btnMarkStart.textContent = `Start: ${this._fmt(this.pendingStart)}`;
    this.btnMarkStart.classList.add('btn-active');
  }

  markEnd() {
    if (this.pendingStart === null) {
      this.pendingStart = 0;
    }
    const endTime = this.vc.currentTime;
    if (endTime <= this.pendingStart) return;

    const play = {
      id: this.nextId++,
      timestamp: { start: this.pendingStart, end: endTime },
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
      notes: ''
    };

    this.plays.push(play);
    this.pendingStart = null;
    this.btnMarkStart.textContent = 'Mark Start';
    this.btnMarkStart.classList.remove('btn-active');

    this._updatePlaySelect();
    this._updateTimeline();
    this.selectPlay(play.id);
    this._emit('play-created', play);
  }

  deleteCurrentPlay() {
    if (!this.currentPlayId) return;
    this.plays = this.plays.filter(p => p.id !== this.currentPlayId);
    this.currentPlayId = null;
    this._clearTagForm();
    this._updatePlaySelect();
    this._updateTimeline();
    this._emit('play-deleted');
  }

  selectPlay(id) {
    this.currentPlayId = id;
    const play = this.getPlay(id);
    if (!play) return;

    this.playSelect.value = id;
    this._loadTagForm(play);
    this._updateTimeline();

    // If this play is tied to a clip, emit event so playlist can switch.
    // Otherwise seek within the current video (single-video mode).
    if (play.clipId) {
      this._emit('play-selected', play);
    } else {
      this.vc.seekTo(play.timestamp.start);
      this._emit('play-selected', play);
    }
  }

  getPlay(id) {
    return this.plays.find(p => p.id === id);
  }

  getCurrentPlay() {
    return this.getPlay(this.currentPlayId);
  }

  _saveCurrentTags() {
    const play = this.getCurrentPlay();
    if (!play) return;

    play.tags.down = this.tagFields.down.value;
    play.tags.distance = this.tagFields.distance.value;
    play.tags.formation = this.tagFields.formation.value;
    play.tags.playType = this.tagFields.playType.value;
    play.tags.defFront = this.tagFields.defFront.value;
    play.tags.coverage = this.tagFields.coverage.value;
    play.tags.blitz = this.tagFields.blitz.value;
    play.tags.result = this.tagFields.result.value;
    play.tags.yardage = this.tagFields.yardage.value;
    play.tags.hash = this.tagFields.hash.value;

    this._updateTimeline();
    this._emit('play-updated', play);
  }

  _loadTagForm(play) {
    this.tagFields.down.value = play.tags.down;
    this.tagFields.distance.value = play.tags.distance;
    this.tagFields.formation.value = play.tags.formation;
    this.tagFields.playType.value = play.tags.playType;
    this.tagFields.defFront.value = play.tags.defFront;
    this.tagFields.coverage.value = play.tags.coverage;
    this.tagFields.blitz.value = play.tags.blitz;
    this.tagFields.result.value = play.tags.result;
    this.tagFields.yardage.value = play.tags.yardage;
    this.tagFields.hash.value = play.tags.hash;
    this._renderCustomTags(play.tags.custom);
  }

  _clearTagForm() {
    Object.values(this.tagFields).forEach(el => el.value = '');
    this.tagChips.innerHTML = '';
  }

  _renderCustomTags(tags) {
    this.tagChips.innerHTML = '';
    tags.forEach((tag, i) => {
      const chip = document.createElement('span');
      chip.className = 'tag-chip';
      chip.innerHTML = `${tag} <span class="chip-remove" data-index="${i}">&times;</span>`;
      chip.querySelector('.chip-remove').addEventListener('click', () => {
        tags.splice(i, 1);
        this._renderCustomTags(tags);
        this._emit('play-updated', this.getCurrentPlay());
      });
      this.tagChips.appendChild(chip);
    });
  }

  _updatePlaySelect() {
    const currentVal = this.currentPlayId;
    this.playSelect.innerHTML = '<option value="">-- No plays tagged --</option>';
    this.plays.forEach(p => {
      const opt = document.createElement('option');
      opt.value = p.id;
      let label;
      if (p.clipName) {
        label = `Play ${p.id}: ${p.clipName}`;
      } else {
        label = `Play ${p.id}: ${this._fmt(p.timestamp.start)}-${this._fmt(p.timestamp.end)}`;
      }
      const type = p.tags.playType ? ` (${p.tags.playType})` : '';
      opt.textContent = label + type;
      this.playSelect.appendChild(opt);
    });
    if (currentVal) this.playSelect.value = currentVal;
  }

  _updateTimeline() {
    this.timelineBar.innerHTML = '';
    const duration = this.vc.duration;
    if (!duration) return;

    this.plays.forEach(p => {
      const left = (p.timestamp.start / duration) * 100;
      const width = ((p.timestamp.end - p.timestamp.start) / duration) * 100;
      const div = document.createElement('div');

      let typeClass = 'other';
      if (p.tags.playType && p.tags.playType.toLowerCase().includes('run')) typeClass = 'run';
      else if (p.tags.playType && (p.tags.playType.toLowerCase().includes('pass') || p.tags.playType.toLowerCase().includes('screen'))) typeClass = 'pass';

      div.className = `timeline-play ${typeClass}${p.id === this.currentPlayId ? ' active' : ''}`;
      div.style.left = left + '%';
      div.style.width = Math.max(width, 0.5) + '%';
      div.textContent = `${p.id}`;
      div.title = `Play ${p.id}: ${p.tags.playType || 'Untagged'}`;
      div.addEventListener('click', () => this.selectPlay(p.id));
      this.timelineBar.appendChild(div);
    });
  }

  // Also update scrub bar play markers
  updateScrubBarPlays() {
    const container = document.getElementById('scrubBarPlays');
    if (!container) return;
    container.innerHTML = '';
    const duration = this.vc.duration;
    if (!duration) return;

    this.plays.forEach(p => {
      const left = (p.timestamp.start / duration) * 100;
      const width = ((p.timestamp.end - p.timestamp.start) / duration) * 100;
      const marker = document.createElement('div');
      marker.className = 'play-marker';
      marker.style.left = left + '%';
      marker.style.width = Math.max(width, 0.3) + '%';
      container.appendChild(marker);
    });
  }

  _fmt(sec) {
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
