/**
 * App - Main bootstrap module. Wires all components together and manages keyboard shortcuts.
 */
import { VideoController } from './video-controller.js';
import { CanvasOverlay } from './canvas-overlay.js';
import { PlayTagger } from './play-tagger.js';
import { NotesManager } from './notes-manager.js';
import { StorageManager } from './storage.js';

class App {
  constructor() {
    // Initialize components
    this.vc = new VideoController();
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.notes = new NotesManager(this.vc, this.tagger);
    this.storage = new StorageManager(this.vc, this.tagger, this.canvas);

    // Wire cross-module events
    this._wireEvents();

    // Keyboard shortcuts
    this._bindKeyboard();

    // Drawing tool UI
    this._bindToolUI();

    // Sidebar panel toggles
    this._bindPanelToggles();

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
}

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
