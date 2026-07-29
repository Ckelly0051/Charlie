import { h } from 'preact';
import { NativeQuickChart } from './native-quick-chart.jsx';

/**
 * QuickChart - Rapid keyboard-driven play charting mode.
 *
 * Workflow: watch clip → tag with a few keystrokes → auto-advance.
 * A full 60-play game takes ~5 minutes to chart.
 *
 * Keyboard map (active when quick-chart panel is focused):
 *   Play type:  R = Run Inside, O = Run Outside, P = Short Pass,
 *               M = Medium Pass, D = Deep Pass, S = Screen,
 *               A = Play Action, Q = RPO, K = Kick/Punt, X = Trick
 *   Result:     G = Gain, L = Loss, N = No Gain, I = Incomplete,
 *               T = Touchdown, U = Turnover (INT), F = Fumble,
 *               W = Sack, E = Penalty
 *   Yardage:    0-9 keys set yards, prefix with minus (-) for negative
 *   Down:       Shift+1..4 = set down
 *   Confirm:    Enter = save play & advance to next clip
 *   Replay:     Backspace = replay current clip
 *   Skip:       Tab = skip this play (no tag, advance)
 *   Undo:       Ctrl+Z = go back to previous clip
 */
export class QuickChart {
  constructor(videoController, playTagger, playlistManager, overlays) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.playlist = playlistManager;
    this.overlays = overlays;
    this.listeners = {};
    this.handle = null;

    this.isActive = false;
    this.status = 'Quick Chart active. Use the keyboard to tag plays.';
    this.currentEntry = this._emptyEntry();
    this.yardageStr = '';
    this.yardageNegative = false;

    this.btnToggle = document.getElementById('btnQuickChart');
    this._clearPanelRefs();
    this._bindEvents();
  }

  _bindPanel() {
    this.panel = document.querySelector('[data-native-quick-chart]');
    this.displayType = document.getElementById('qcPlayType');
    this.displayResult = document.getElementById('qcResult');
    this.displayYardage = document.getElementById('qcYardage');
    this.displayDown = document.getElementById('qcDown');
    this.displayExtra = document.getElementById('qcExtra');
    this.displayStatus = document.getElementById('qcStatus');
    this.displayKeys = document.getElementById('qcKeyHints');
    this.inputBallCarrier = document.getElementById('qcBallCarrier');
    this.inputPasser = document.getElementById('qcPasser');
    this.inputReceiver = document.getElementById('qcReceiver');
    this.inputTackler = document.getElementById('qcTackler');
    this._updateDisplay();
    this._updateStatus(this.status);
  }

  _clearPanelRefs() {
    this.panel = null;
    this.displayType = null;
    this.displayResult = null;
    this.displayYardage = null;
    this.displayDown = null;
    this.displayExtra = null;
    this.displayStatus = null;
    this.displayKeys = null;
    this.inputBallCarrier = null;
    this.inputPasser = null;
    this.inputReceiver = null;
    this.inputTackler = null;
  }

  _deactivate({ close = true } = {}) {
    const handle = this.handle;
    this.handle = null;
    this.isActive = false;
    this.btnToggle?.classList.remove('active');
    this._clearPanelRefs();
    if (close) handle?.close('toggle');
    this._emit('mode-changed', false);
  }

  _emptyEntry() {
    return {
      playType: '',
      result: '',
      yardage: '',
      down: '',
      distance: '',
      firstDown: false,
      turnover: false,
      ballCarrier: '',
      passer: '',
      receiver: '',
      tackler: ''
    };
  }

  _bindEvents() {
    // Toggle button
    this.btnToggle.addEventListener('click', () => this.toggle());

    // Keyboard handler — capture all keys when quick chart is active
    document.addEventListener('keydown', (e) => {
      if (!this.isActive) return;

      // Allow normal behavior in player number inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      if (this._handleKey(e)) {
        e.preventDefault();
        e.stopPropagation();
      }
    }, true); // capture phase to override other handlers
  }

  toggle() {
    if (this.isActive) {
      this._deactivate();
      return false;
    }
    if (!this.overlays?.sheet) throw new Error('Quick Chart requires the native overlay service.');

    this.isActive = true;
    this.currentEntry = this._emptyEntry();
    this.yardageStr = '';
    this.yardageNegative = false;
    this.status = 'Quick Chart active. Use the keyboard to tag plays.';
    this.btnToggle?.classList.add('active');
    const handle = this.overlays.sheet({
      id: 'quick-chart',
      title: 'Quick Chart',
      modal: false,
      actions: [],
      initialFocus: '[data-native-quick-chart]',
      returnFocus: document.activeElement && document.activeElement !== document.body ? document.activeElement : this.btnToggle,
      content: h(NativeQuickChart),
    });
    this.handle = handle;
    requestAnimationFrame(() => {
      if (this.isActive && this.handle === handle) this._bindPanel();
    });
    handle.result.finally(() => {
      if (this.handle === handle) this._deactivate({ close: false });
    });
    this._emit('mode-changed', true);
    return true;
  }

  _handleKey(e) {
    const key = e.key.toUpperCase();
    const code = e.code;

    // Enter = confirm and advance
    if (code === 'Enter') {
      this._confirmAndAdvance();
      return true;
    }

    // Backspace = replay current clip
    if (code === 'Backspace') {
      this.vc.seekTo(0);
      this.vc.videoElement.play();
      return true;
    }

    // Tab = skip to next clip
    if (code === 'Tab') {
      this.playlist.nextClip();
      this.currentEntry = this._emptyEntry();
      this.yardageStr = '';
      this.yardageNegative = false;
      this._updateDisplay();
      this._updateStatus('Skipped — next clip');
      return true;
    }

    // Ctrl+Z = go back to previous clip
    if ((e.ctrlKey || e.metaKey) && code === 'KeyZ') {
      this.playlist.prevClip();
      this.currentEntry = this._emptyEntry();
      this.yardageStr = '';
      this.yardageNegative = false;
      this._updateDisplay();
      this._updateStatus('Back to previous clip');
      return true;
    }

    // Space = play/pause
    if (code === 'Space') {
      this.vc.togglePlay();
      return true;
    }

    // Down: Shift + 1-4
    if (e.shiftKey && code >= 'Digit1' && code <= 'Digit4') {
      this.currentEntry.down = code.replace('Digit', '');
      this._updateDisplay();
      return true;
    }

    // Yardage: digits 0-9
    if (!e.shiftKey && code >= 'Digit0' && code <= 'Digit9') {
      this.yardageStr += code.replace('Digit', '');
      if (this.yardageStr.length > 2) this.yardageStr = this.yardageStr.slice(-2);
      this.currentEntry.yardage = (this.yardageNegative ? '-' : '') + this.yardageStr;
      this._updateDisplay();
      return true;
    }

    // Minus key for negative yardage
    if (key === '-' || code === 'Minus') {
      this.yardageNegative = !this.yardageNegative;
      if (this.yardageStr) {
        this.currentEntry.yardage = (this.yardageNegative ? '-' : '') + this.yardageStr;
      }
      this._updateDisplay();
      return true;
    }

    // Play type keys
    const typeMap = {
      'R': 'Run Inside',
      'O': 'Run Outside',
      'P': 'Short Pass',
      'M': 'Medium Pass',
      'D': 'Deep Pass',
      'S': 'Screen',
      'A': 'Play Action',
      'Q': 'RPO',
      'K': 'Kick/Punt',
      'X': 'Trick Play'
    };
    if (typeMap[key] && !e.shiftKey && !e.ctrlKey) {
      this.currentEntry.playType = typeMap[key];
      this._updateDisplay();
      return true;
    }

    // Result keys
    const resultMap = {
      'G': 'Gain',
      'L': 'Loss',
      'N': 'No Gain',
      'I': 'Incomplete',
      'T': 'Touchdown',
      'U': 'Interception',
      'F': 'Fumble',
      'W': 'Sack',
      'E': 'Penalty'
    };
    if (resultMap[key] && !e.shiftKey && !e.ctrlKey) {
      this.currentEntry.result = resultMap[key];
      // Auto-set some flags
      if (key === 'U' || key === 'F') this.currentEntry.turnover = true;
      if (key === 'N') {
        this.yardageStr = '0';
        this.currentEntry.yardage = '0';
      }
      if (key === 'L' || key === 'W') {
        this.yardageNegative = true;
        if (this.yardageStr) {
          this.currentEntry.yardage = '-' + this.yardageStr;
        }
      }
      this._updateDisplay();
      return true;
    }

    // C = clear current entry
    if (key === 'C' && !e.ctrlKey) {
      this.currentEntry = this._emptyEntry();
      this.yardageStr = '';
      this.yardageNegative = false;
      this._updateDisplay();
      this._updateStatus('Cleared');
      return true;
    }

    return false;
  }

  _confirmAndAdvance() {
    // Apply the quick-chart entry to the current play
    const play = this.tagger.getCurrentPlay();
    if (play) {
      if (this.currentEntry.playType) {
        play.tags.playType = this.currentEntry.playType;
        // Auto-classify Run/Pass for unambiguous play types (RPO/PA/Trick left blank).
        const t = this.currentEntry.playType.toLowerCase();
        if (t.includes('run')) play.tags.runPass = 'Run';
        else if (t.includes('pass') || t.includes('screen')) play.tags.runPass = 'Pass';
      }
      if (this.currentEntry.result) play.tags.result = this.currentEntry.result;
      if (this.currentEntry.yardage) play.tags.yardage = this.currentEntry.yardage;
      if (this.currentEntry.down) play.tags.down = this.currentEntry.down;
      // Inherit quarter and drive from previous play if not set
      if (!play.tags.quarter) {
        const prev = this.tagger.plays[this.tagger.plays.length - 2];
        if (prev?.tags.quarter) play.tags.quarter = prev.tags.quarter;
      }

      // Store player assignments
      const carrier = this.inputBallCarrier?.value?.trim();
      const passer = this.inputPasser?.value?.trim();
      const receiver = this.inputReceiver?.value?.trim();
      const tackler = this.inputTackler?.value?.trim();

      if (!play.tags.players) play.tags.players = {};
      if (carrier) play.tags.players.ballCarrier = carrier;
      if (passer) play.tags.players.passer = passer;
      if (receiver) play.tags.players.receiver = receiver;
      if (tackler) play.tags.players.tackler = tackler;

      if (this.currentEntry.firstDown) {
        if (!play.tags.custom) play.tags.custom = [];
        if (!play.tags.custom.includes('1st Down')) play.tags.custom.push('1st Down');
      }
      if (this.currentEntry.turnover) {
        if (!play.tags.custom) play.tags.custom = [];
        if (!play.tags.custom.includes('Turnover')) play.tags.custom.push('Turnover');
      }

      // Auto-detect first down based on yardage vs distance
      const yds = parseInt(this.currentEntry.yardage) || 0;
      const dist = parseInt(play.tags.distance) || 10;
      if (yds >= dist && yds > 0 && !this.currentEntry.turnover) {
        if (!play.tags.custom) play.tags.custom = [];
        if (!play.tags.custom.includes('1st Down')) play.tags.custom.push('1st Down');
      }

      this.tagger._emit('play-updated', play);
    }

    // Clear player inputs
    if (this.inputBallCarrier) this.inputBallCarrier.value = '';
    if (this.inputPasser) this.inputPasser.value = '';
    if (this.inputReceiver) this.inputReceiver.value = '';
    if (this.inputTackler) this.inputTackler.value = '';

    // Advance to next clip
    const clipIdx = this.playlist.activeClipIndex;
    const totalClips = this.playlist.clips.length;

    this.currentEntry = this._emptyEntry();
    this.yardageStr = '';
    this.yardageNegative = false;

    if (clipIdx < totalClips - 1) {
      this.playlist.nextClip();
      this._updateStatus(`Saved — clip ${clipIdx + 2}/${totalClips}`);
    } else {
      this._updateStatus('All clips charted! View stats.');
    }

    this._updateDisplay();
    this._emit('play-charted');
  }

  _updateDisplay() {
    if (this.displayType) {
      this.displayType.textContent = this.currentEntry.playType || '—';
      this.displayType.className = 'gi-qc-value' + (this.currentEntry.playType ? ' is-set' : '');
    }
    if (this.displayResult) {
      this.displayResult.textContent = this.currentEntry.result || '—';
      this.displayResult.className = 'gi-qc-value' + (this.currentEntry.result ? ' is-set' : '');
    }
    if (this.displayYardage) {
      this.displayYardage.textContent = this.currentEntry.yardage || '—';
      this.displayYardage.className = 'gi-qc-value' + (this.currentEntry.yardage ? ' is-set' : '');
    }
    if (this.displayDown) {
      const downLabels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
      this.displayDown.textContent = downLabels[this.currentEntry.down] || '—';
      this.displayDown.className = 'gi-qc-value' + (this.currentEntry.down ? ' is-set' : '');
    }
    if (this.displayExtra) {
      const extras = [];
      if (this.currentEntry.firstDown) extras.push('1ST');
      if (this.currentEntry.turnover) extras.push('TO');
      this.displayExtra.textContent = extras.join(' ') || '';
    }
  }

  _updateStatus(msg) {
    this.status = msg;
    if (this.displayStatus) this.displayStatus.textContent = msg;
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
