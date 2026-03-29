/**
 * App - Main bootstrap module. Wires all components together and manages keyboard shortcuts.
 */
import { VideoController } from './video-controller.js';
import { CanvasOverlay } from './canvas-overlay.js';
import { PlayTagger } from './play-tagger.js';
import { NotesManager } from './notes-manager.js';
import { StorageManager } from './storage.js';
import { PlayDetector } from './play-detector.js';

class App {
  constructor() {
    // Initialize components
    this.vc = new VideoController();
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.notes = new NotesManager(this.vc, this.tagger);
    this.storage = new StorageManager(this.vc, this.tagger, this.canvas);
    this.detector = new PlayDetector(this.vc, this.tagger);

    // Wire cross-module events
    this._wireEvents();

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
  }

  _wireEvents() {
    // Re-render canvas annotations when video time changes
    this.vc.on('time-update', () => {
      this.canvas.render();
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

    // When a play is selected, load its annotations context
    this.tagger.on('play-selected', () => {
      this.canvas.render();
    });
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.vc.togglePlay();
          break;
        case 'ArrowLeft':
        case 'Comma':
          e.preventDefault();
          this.vc.stepBack();
          break;
        case 'ArrowRight':
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
              this.canvas.redo();
            } else {
              this.canvas.undo();
            }
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
      if (!this.vc.videoElement.duration) {
        alert('Load a video first.');
        return;
      }

      // Read settings
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
        await this.detector.scan();
      } catch (e) {
        alert('Scan error: ' + e.message);
      }

      // Scan finished
      btnAutoDetect.disabled = false;
      btnAutoDetect.classList.remove('scanning');
      btnCancelScan.classList.add('hidden');
      progressDiv.classList.add('hidden');

      // Show results
      const plays = this.detector.detectedPlays;
      resultCount.textContent = `${plays.length} play${plays.length !== 1 ? 's' : ''} detected`;
      resultsDiv.classList.remove('hidden');

      // Draw motion graph
      this._drawMotionGraph(motionCanvas, this.detector.motionData, plays, this.detector.motionThreshold);
    });

    // Cancel scan
    btnCancelScan.addEventListener('click', () => {
      this.detector.cancelScan();
    });

    // Apply detected plays
    btnApply.addEventListener('click', () => {
      const added = this.detector.applyDetectedPlays();
      resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added`;
    });

    // Progress updates
    this.detector.on('scan-progress', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      progressLabel.textContent = pct + '%';
    });
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
    const threshY = h - (threshold * maxMotion / maxMotion) * (h - 4) - 2;
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
