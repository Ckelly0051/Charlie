/**
 * ChipField — lightweight wrapper so a div.pick-group behaves like a
 * <select> for the rest of the tagger: .value get/set, change events.
 */
class ChipField {
  constructor(el) {
    this.el = el;
    this._value = '';
    this._listeners = {};
    this.chips = [...el.querySelectorAll('[data-value]')];
    this.chips.forEach(chip => {
      chip.addEventListener('click', (e) => {
        e.preventDefault();
        const v = chip.dataset.value;
        this.value = this._value === v ? '' : v;
        this._fire('change');
      });
    });
  }
  get value() { return this._value; }
  set value(v) {
    this._value = v || '';
    this.chips.forEach(c => c.classList.toggle('active', c.dataset.value === this._value));
  }
  addEventListener(event, fn) {
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(fn);
  }
  _fire(event) {
    (this._listeners[event] || []).forEach(fn => fn());
  }
}

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

    // Tag form elements — chip groups wrapped as ChipField, inputs used directly
    const fieldMap = {
      down: 'tagDown', distance: 'tagDistance', formation: 'tagFormation',
      playType: 'tagPlayType', defFront: 'tagDefFront', coverage: 'tagCoverage',
      blitz: 'tagBlitz', result: 'tagResult', yardage: 'tagYardage',
      hash: 'tagHash', quarter: 'tagQuarter', yardLine: 'tagYardLine',
      fieldSide: 'tagFieldSide', personnel: 'tagPersonnel',
      driveNumber: 'tagDriveNumber',
    };
    this.tagFields = {};
    for (const [key, id] of Object.entries(fieldMap)) {
      const el = document.getElementById(id);
      this.tagFields[key] = el?.classList.contains('pick-group') ? new ChipField(el) : el;
    }

    // Per-play player attribution (jersey #) by role.
    this.playerFields = {
      ballCarrier: document.getElementById('tagPlayerBC'),
      passer: document.getElementById('tagPlayerPasser'),
      receiver: document.getElementById('tagPlayerReceiver'),
      tackler: document.getElementById('tagPlayerTackler'),
    };

    // Per-play player grading (+/- per snap).
    this.gradeFields = {
      ballCarrier: document.getElementById('tagGradeBC'),
      passer: document.getElementById('tagGradePasser'),
      receiver: document.getElementById('tagGradeReceiver'),
      tackler: document.getElementById('tagGradeTackler'),
    };

    this.tagChips = document.getElementById('tagChips');
    this.customTagInput = document.getElementById('customTagInput');

    this.btnNewDrive = document.getElementById('btnNewDrive');
    this.currentDrive = 1;

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

    // Tag form changes — save only the changed field, not all fields,
    // so clicking one chip doesn't overwrite other fields with stale values.
    for (const [key, el] of Object.entries(this.tagFields)) {
      el.addEventListener('change', () => this._saveField(key));
    }

    // Player-role inputs save into play.tags.players.
    for (const [role, el] of Object.entries(this.playerFields)) {
      if (!el) continue;
      el.addEventListener('change', () => this._savePlayer(role));
    }

    // Grade selects save into play.tags.grades.
    for (const [role, el] of Object.entries(this.gradeFields)) {
      if (!el) continue;
      el.addEventListener('change', () => this._saveGrade(role));
    }

    // New Drive button
    if (this.btnNewDrive) {
      this.btnNewDrive.addEventListener('click', () => {
        this.currentDrive++;
        if (this.tagFields.driveNumber) this.tagFields.driveNumber.value = this.currentDrive;
        this._saveCurrentTags();
      });
    }

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
        quarter: '',
        yardLine: '',
        fieldSide: 'own',
        personnel: '',
        driveNumber: this.currentDrive.toString(),
        players: {},
        grades: {},
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

  _saveField(key) {
    const play = this.getCurrentPlay();
    if (!play) return;
    play.tags[key] = this.tagFields[key].value;
    this._updateTimeline();
    this._emit('play-updated', play);
  }

  _savePlayer(role) {
    const play = this.getCurrentPlay();
    if (!play) return;
    if (!play.tags.players) play.tags.players = {};
    const val = (this.playerFields[role].value || '').trim();
    if (val) play.tags.players[role] = val;
    else delete play.tags.players[role];
    this._emit('play-updated', play);
  }

  _saveGrade(role) {
    const play = this.getCurrentPlay();
    if (!play) return;
    if (!play.tags.grades) play.tags.grades = {};
    const val = (this.gradeFields[role].value || '').trim();
    if (val !== '') play.tags.grades[role] = parseInt(val);
    else delete play.tags.grades[role];
    this._emit('play-updated', play);
  }

  _saveCurrentTags() {
    const play = this.getCurrentPlay();
    if (!play) return;
    for (const [key, el] of Object.entries(this.tagFields)) {
      play.tags[key] = el.value;
    }
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
    this.tagFields.quarter.value = play.tags.quarter || '';
    this.tagFields.yardLine.value = play.tags.yardLine || '';
    this.tagFields.fieldSide.value = play.tags.fieldSide || 'own';
    this.tagFields.personnel.value = play.tags.personnel || '';
    this.tagFields.driveNumber.value = play.tags.driveNumber || '';
    const players = play.tags.players || {};
    for (const [role, el] of Object.entries(this.playerFields)) {
      if (el) el.value = players[role] || '';
    }
    const grades = play.tags.grades || {};
    for (const [role, el] of Object.entries(this.gradeFields)) {
      if (el) el.value = grades[role] != null ? String(grades[role]) : '';
    }
    this._renderCustomTags(play.tags.custom);
  }

  _clearTagForm() {
    for (const el of Object.values(this.tagFields)) el.value = '';
    for (const el of Object.values(this.playerFields)) { if (el) el.value = ''; }
    for (const el of Object.values(this.gradeFields)) { if (el) el.value = ''; }
    this.tagChips.innerHTML = '';
  }

  nextPlay() {
    const idx = this.plays.findIndex(p => p.id === this.currentPlayId);
    if (idx >= 0 && idx < this.plays.length - 1) {
      this.selectPlay(this.plays[idx + 1].id);
      return true;
    }
    return false;
  }

  prevPlay() {
    const idx = this.plays.findIndex(p => p.id === this.currentPlayId);
    if (idx > 0) {
      this.selectPlay(this.plays[idx - 1].id);
      return true;
    }
    return false;
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
