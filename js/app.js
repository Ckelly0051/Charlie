/**
 * App - Main bootstrap module. Wires all components together and manages keyboard shortcuts.
 */
import { VideoController } from './video-controller.js';
import { CanvasOverlay } from './canvas-overlay.js';
import { PlayTagger } from './play-tagger.js';
import { PlayFilter } from './play-filter.js';
import { NotesManager } from './notes-manager.js';
import { StorageManager } from './storage.js';
import { PlayDetector } from './play-detector.js';
import { PlaylistManager } from './playlist-manager.js';
import { QuickChart } from './quick-chart.js';
import { StatsEngine } from './stats-engine.js';
import { HistoryManager } from './history-manager.js';
import { VersionManager } from './version-manager.js';
import { ScoreboardOCR } from './scoreboard-ocr.js';
import { SuggestionEngine } from './suggestion-engine.js';
import { CutupExporter } from './cutup-exporter.js';
import { SeasonManager } from './season-manager.js';
import { CallSheetBuilder } from './call-sheet-builder.js';
import { UIPolish } from './ui-polish.js';
import { Wizard } from './wizard.js';
import { TagWorkspace } from './tag-workspace.js';

class App {
  constructor() {
    // Initialize components
    this.vc = new VideoController();
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.filter = new PlayFilter(this.tagger);
    this.notes = new NotesManager(this.vc, this.tagger);
    this.storage = new StorageManager(this.vc, this.tagger, this.canvas);
    this.detector = new PlayDetector(this.vc, this.tagger);
    this.playlist = new PlaylistManager(this.vc, this.tagger);
    this.quickChart = new QuickChart(this.vc, this.tagger, this.playlist);
    this.stats = new StatsEngine(this.tagger, this.filter);
    this.history = new HistoryManager(this.tagger);
    this.versions = new VersionManager(this.storage, this.tagger);
    this.ocr = new ScoreboardOCR(this.vc, this.tagger);
    this.suggestions = new SuggestionEngine(this.tagger);
    this.cutup = new CutupExporter(this.vc, this.tagger, this.filter, this.playlist);
    this.season = new SeasonManager(this.stats);
    this.callSheet = new CallSheetBuilder(this.tagger);
    this.uiPolish = new UIPolish();
    this.wizard = new Wizard({ videoController: this.vc, tagger: this.tagger, stats: this.stats, history: this.history });
    this.tagWorkspace = new TagWorkspace({ videoController: this.vc, tagger: this.tagger, wizard: this.wizard });

    // Give storage references
    this.storage.playlist = this.playlist;
    this.storage.filter = this.filter;
    this.storage.versions = this.versions;

    // Wire cross-module events
    this._wireEvents();

    // Wire game info form
    this._bindGameInfo();

    // Wire report export
    this._bindReportExport();

    // Keyboard shortcuts
    this._bindKeyboard();

    // Drawing tool UI
    this._bindToolUI();

    // Sidebar panel toggles
    this._bindPanelToggles();

    // Auto-detect UI
    this._bindAutoDetect();

    // Enable auto-save
    this.storage.enableAutoSave();

    // Quick-chart save triggers auto-save via play-updated event
    this.quickChart.on('play-charted', () => {
      this.tagger._emit('play-updated', this.tagger.getCurrentPlay());
    });

    // History needs to seed lastSnap *after* all wiring; do it on next tick
    setTimeout(() => {
      this.history.init();
      this.versions.renderList();
    }, 0);
  }

  _wireEvents() {
    // Re-render canvas annotations when video time changes
    this.vc.on('time-update', () => {
      this.canvas.render();
    });

    // Handle file selection from top bar (single or multi)
    this.vc.on('files-selected', ({ files }) => {
      if (files.length === 1 && !this.playlist.hasClips) {
        // Single file, no existing playlist — legacy single-video mode
        this.vc.loadFile(files[0]);
      } else {
        // Multiple files or adding to playlist — multi-clip mode
        this.playlist.addFiles(files);
      }
    });

    // Update timeline markers when plays change
    this.tagger.on('play-created', () => {
      this.tagger.updateScrubBarPlays();
    });
    this.tagger.on('play-deleted', () => {
      this.tagger.updateScrubBarPlays();
    });
    this.tagger.on('play-updated', () => {
      this.tagger.updateScrubBarPlays();
    });

    // When a play is selected and it has a clip, switch the playlist to that clip
    this.tagger.on('play-selected', (play) => {
      if (play.clipId && this.playlist.hasClips) {
        this.playlist.switchToClipByPlayId(play.id);
      }
      this.canvas.render();
    });

    // When playlist switches clips, re-sync canvas
    this.playlist.on('clip-switched', () => {
      this.canvas.render();
    });

    // Auto-advance to next clip when current clip ends (optional behavior)
    this.vc.videoElement.addEventListener('ended', () => {
      // Don't auto-advance; let user control navigation
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // Let quick-chart handle its own keys when active
      if (this.quickChart.isActive) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.vc.togglePlay();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            this.playlist.prevClip();
          } else {
            e.preventDefault();
            this.vc.stepBack();
          }
          break;
        case 'Comma':
          e.preventDefault();
          this.vc.stepBack();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            this.playlist.nextClip();
          } else {
            e.preventDefault();
            this.vc.stepForward();
          }
          break;
        case 'Period':
          e.preventDefault();
          this.vc.stepForward();
          break;
        case 'BracketLeft':
          e.preventDefault();
          this.tagger.markStart();
          break;
        case 'BracketRight':
          e.preventDefault();
          this.tagger.markEnd();
          break;
        case 'Digit1':
          this._selectTool('line');
          break;
        case 'Digit2':
          this._selectTool('arrow');
          break;
        case 'Digit3':
          this._selectTool('circle');
          break;
        case 'Digit4':
          this._selectTool('rect');
          break;
        case 'Digit5':
          this._selectTool('freehand');
          break;
        case 'Digit6':
          this._selectTool('text');
          break;
        case 'Escape':
          this._selectTool(null);
          break;
        case 'KeyZ':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) {
              // History redo first, fall back to canvas
              if (!this.history.redo()) this.canvas.redo();
            } else {
              if (!this.history.undo()) this.canvas.undo();
            }
          }
          break;
        case 'KeyY':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (!this.history.redo()) this.canvas.redo();
          }
          break;
        case 'KeyS':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.storage.saveProject();
          }
          break;
      }
    });
  }

  _bindToolUI() {
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this._selectTool(this.canvas.currentTool === tool ? null : tool);
      });
    });

    // Color swatches
    document.querySelectorAll('.swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.canvas.color = swatch.dataset.color;
      });
    });

    // Line width slider
    const slider = document.getElementById('lineWidthSlider');
    slider.addEventListener('input', () => {
      this.canvas.lineWidth = parseInt(slider.value);
    });

    // Undo/Redo/Clear
    document.getElementById('btnUndo').addEventListener('click', () => this.canvas.undo());
    document.getElementById('btnRedo').addEventListener('click', () => this.canvas.redo());
    document.getElementById('btnClearAnnotations').addEventListener('click', () => {
      if (confirm('Clear all annotations?')) {
        this.canvas.clearAllAnnotations();
      }
    });
  }

  _selectTool(toolName) {
    this.canvas.currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    // Update cursor
    this.canvas.canvas.style.cursor = toolName ? 'crosshair' : 'default';
  }

  _bindPanelToggles() {
    document.querySelectorAll('.panel-title[data-toggle]').forEach(title => {
      title.addEventListener('click', () => {
        const targetId = title.dataset.toggle;
        const body = document.getElementById(targetId);
        if (body) body.classList.toggle('collapsed');
      });
    });
  }

  _bindAutoDetect() {
    const btnAutoDetect = document.getElementById('btnAutoDetect');
    const btnCancelScan = document.getElementById('btnCancelScan');
    const progressDiv = document.getElementById('autoDetectProgress');
    const progressFill = document.getElementById('scanProgressFill');
    const progressLabel = document.getElementById('scanProgressLabel');
    const settingsDiv = document.getElementById('autoDetectSettings');
    const btnToggleSettings = document.getElementById('btnToggleDetectSettings');
    const resultsDiv = document.getElementById('autoDetectResults');
    const resultCount = document.getElementById('detectResultCount');
    const btnApply = document.getElementById('btnApplyDetected');
    const motionCanvas = document.getElementById('motionGraphCanvas');
    const sensitivitySlider = document.getElementById('detectSensitivity');
    const sensitivityValue = document.getElementById('sensitivityValue');

    // Toggle settings visibility
    btnToggleSettings.addEventListener('click', () => {
      settingsDiv.classList.toggle('hidden');
    });

    // Sensitivity slider label
    sensitivitySlider.addEventListener('input', () => {
      sensitivityValue.textContent = sensitivitySlider.value + '%';
    });

    // Start scan
    btnAutoDetect.addEventListener('click', async () => {
      if (this.detector.isScanning) return;

      // Read settings into detector
      this.detector.motionThreshold = parseInt(sensitivitySlider.value) / 100;
      this.detector.minPlayDuration = parseFloat(document.getElementById('detectMinDuration').value) || 2;
      this.detector.maxPlayDuration = parseFloat(document.getElementById('detectMaxDuration').value) || 30;
      this.detector.cooldownAfterEnd = parseFloat(document.getElementById('detectCooldown').value) || 3;
      this.detector.sampleInterval = parseFloat(document.getElementById('detectSampleRate').value) || 0.2;

      // Show progress, hide results
      progressDiv.classList.remove('hidden');
      btnCancelScan.classList.remove('hidden');
      resultsDiv.classList.add('hidden');
      btnAutoDetect.disabled = true;
      btnAutoDetect.classList.add('scanning');

      try {
        if (this.playlist.hasClips) {
          // Multi-clip mode: scan each clip to find the action window
          const results = await this.detector.scanClips(this.playlist);

          // Show summary
          const totalDetected = results.reduce((s, r) => s + r.detected.length, 0);
          resultCount.textContent = `${totalDetected} action windows found in ${results.length} clips`;
          resultsDiv.classList.remove('hidden');
          btnApply.classList.add('hidden'); // Already applied directly to play entries

          // Draw a combined motion overview for the last scanned clip
          if (results.length > 0) {
            const last = results[results.length - 1];
            if (last.motionData.length > 0) {
              this._drawMotionGraph(motionCanvas, last.motionData, last.detected, this.detector.motionThreshold);
            }
          }
        } else {
          // Single-video mode
          if (!this.vc.videoElement.duration) {
            alert('Load a video first.');
            throw new Error('No video');
          }
          await this.detector.scan();

          const plays = this.detector.detectedPlays;
          resultCount.textContent = `${plays.length} play${plays.length !== 1 ? 's' : ''} detected`;
          resultsDiv.classList.remove('hidden');
          btnApply.classList.remove('hidden');
          this._drawMotionGraph(motionCanvas, this.detector.motionData, plays, this.detector.motionThreshold);
        }
      } catch (e) {
        if (e.message !== 'No video') {
          alert('Scan error: ' + e.message);
        }
      }

      // Scan finished
      btnAutoDetect.disabled = false;
      btnAutoDetect.classList.remove('scanning');
      btnCancelScan.classList.add('hidden');
      progressDiv.classList.add('hidden');
    });

    // Cancel scan
    btnCancelScan.addEventListener('click', () => {
      this.detector.cancelScan();
    });

    // Apply detected plays (single-video mode only)
    btnApply.addEventListener('click', () => {
      const added = this.detector.applyDetectedPlays();
      resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added`;
    });

    // Progress updates
    this.detector.on('scan-progress', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      if (data.clipName) {
        progressLabel.textContent = `${pct}% — ${data.clipName}`;
      } else {
        progressLabel.textContent = pct + '%';
      }
    });
  }

  _bindGameInfo() {
    const fields = ['gameTeamName', 'gameOpponent', 'gameDate', 'gameScoreUs', 'gameScoreThem'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this._saveGameInfo());
        el.addEventListener('input', () => this._saveGameInfo());
      }
    });
  }

  _saveGameInfo() {
    this.storage.gameInfo = {
      teamName: document.getElementById('gameTeamName')?.value || '',
      opponent: document.getElementById('gameOpponent')?.value || '',
      date: document.getElementById('gameDate')?.value || '',
      scoreUs: document.getElementById('gameScoreUs')?.value || '',
      scoreThem: document.getElementById('gameScoreThem')?.value || ''
    };
    this.storage._autoSave();
  }

  _loadGameInfo(info) {
    if (!info) return;
    const map = {
      gameTeamName: info.teamName,
      gameOpponent: info.opponent,
      gameDate: info.date,
      gameScoreUs: info.scoreUs,
      gameScoreThem: info.scoreThem
    };
    for (const [id, val] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    }
  }

  _bindReportExport() {
    const btn = document.getElementById('btnExportReport');
    if (btn) {
      btn.addEventListener('click', () => this.storage.exportHtmlReport(this.stats));
    }
  }

  _drawMotionGraph(canvas, motionData, detectedPlays, threshold) {
    if (!motionData.length) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 60;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Background
    ctx.fillStyle = '#16213e';
    ctx.fillRect(0, 0, w, h);

    // Find max motion for scaling
    let maxMotion = 0;
    for (const d of motionData) {
      if (d.motion > maxMotion) maxMotion = d.motion;
    }
    if (maxMotion === 0) return;

    const duration = motionData[motionData.length - 1].time;

    // Draw detected play regions
    ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
    for (const p of detectedPlays) {
      const x1 = (p.start / duration) * w;
      const x2 = (p.end / duration) * w;
      ctx.fillRect(x1, 0, x2 - x1, h);
    }

    // Draw threshold line
    const threshY = h - (threshold) * (h - 4) - 2;
    ctx.strokeStyle = 'rgba(255, 170, 0, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw motion curve
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < motionData.length; i++) {
      const x = (motionData[i].time / duration) * w;
      const y = h - (motionData[i].motion / maxMotion) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
