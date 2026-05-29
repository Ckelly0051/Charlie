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
import { ClipAnalyzer } from './clip-analyzer.js';
import { BackendClient } from './backend-client.js';
import { VisionAnalyzer } from './vision-analyzer.js';
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
    this.clipAnalyzer = new ClipAnalyzer();
    this.backend = new BackendClient();
    this.vision = new VisionAnalyzer({
      apiKey: (typeof localStorage !== 'undefined' && localStorage.getItem('ffa_claude_api_key')) || '',
    });
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

    // Probe the local CV backend and keep the status badge in sync
    this._bindBackendStatus();

    // Enable auto-save
    this.storage.enableAutoSave();

    // Quick-chart save triggers auto-save via play-updated event
    this.quickChart.on('play-charted', () => {
      this.tagger._emit('play-updated', this.tagger.getCurrentPlay());
    });

    // Tag navigation & chip shortcuts
    this._bindTagNav();

    // Keep tagging progress updated
    this.tagger.on('play-created', () => this._updateTagProgress());
    this.tagger.on('play-deleted', () => this._updateTagProgress());
    this.tagger.on('play-updated', () => this._updateTagProgress());

    // The single top-bar undo/redo also drives canvas annotation undo when
    // there's no play-data action left to undo (mirrors Ctrl+Z).
    this.history.onUndoEmpty = () => this.canvas.undo();
    this.history.onRedoEmpty = () => this.canvas.redo();
    this.history.fallbackCanUndo = () => this.canvas.undoStack.length > 0;
    this.history.fallbackCanRedo = () => this.canvas.redoStack.length > 0;
    // Keep the undo/redo button enabled-state fresh as annotations change.
    this.canvas.on?.('annotation-added', () => this.history._updateUI());
    this.canvas.on?.('annotations-changed', () => this.history._updateUI());

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

      // Tag shortcuts (play type, result, down via keyboard)
      if (this._handleTagKey(e)) return;

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
            if (e.shiftKey) this.history.redoAll();
            else this.history.undoAll();
          }
          break;
        case 'KeyY':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.history.redoAll();
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

    // Clear annotations (undo/redo now live as a single pair in the top bar)
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
    const btnReview = document.getElementById('btnReviewDetected');
    const motionCanvas = document.getElementById('motionGraphCanvas');
    const strictnessSlider = document.getElementById('detectStrictness');
    const strictnessValue = document.getElementById('strictnessValue');
    const audioToggle = document.getElementById('detectUseAudio');
    const minDur = document.getElementById('detectMinDuration');
    const maxDur = document.getElementById('detectMaxDuration');
    const cooldown = document.getElementById('detectCooldown');

    // Toggle settings visibility
    btnToggleSettings?.addEventListener('click', () => {
      settingsDiv?.classList.toggle('hidden');
    });

    // Strictness slider label (shows Loose → Strict)
    const strictnessLabel = (v) => {
      const n = parseFloat(v);
      if (n <= 0.7) return 'Loose';
      if (n <= 0.95) return 'Relaxed';
      if (n <= 1.15) return 'Balanced';
      if (n <= 1.4) return 'Strict';
      return 'Very Strict';
    };
    strictnessSlider?.addEventListener('input', () => {
      if (strictnessValue) strictnessValue.textContent = strictnessLabel(strictnessSlider.value);
    });
    if (strictnessSlider && strictnessValue) strictnessValue.textContent = strictnessLabel(strictnessSlider.value);

    // Start scan
    btnAutoDetect.addEventListener('click', async () => {
      if (this.detector.isScanning) return;

      // Read settings into v2 detector
      if (strictnessSlider) this.detector.strictness = parseFloat(strictnessSlider.value) || 1.0;
      if (minDur) this.detector.minPlayDuration = parseFloat(minDur.value) || 2;
      if (maxDur) this.detector.maxPlayDuration = parseFloat(maxDur.value) || 30;
      if (cooldown) this.detector.cooldownAfterEnd = parseFloat(cooldown.value) || 2.5;
      if (audioToggle) this.detector.useAudio = audioToggle.checked;

      // Show progress, hide results
      progressDiv.classList.remove('hidden');
      btnCancelScan.classList.remove('hidden');
      resultsDiv.classList.add('hidden');
      btnAutoDetect.disabled = true;
      btnAutoDetect.classList.add('scanning');
      progressLabel.textContent = 'Starting scan…';

      try {
        if (this.playlist.hasClips) {
          // Multi-clip mode (backward-compat stub in v2)
          const results = await this.detector.scanClips(this.playlist);
          const totalDetected = results.reduce((s, r) => s + (r.detected?.length || 0), 0);
          resultCount.textContent = `${totalDetected} action windows found in ${results.length} clips`;
          resultsDiv.classList.remove('hidden');
          btnApply?.classList.add('hidden');
          btnReview?.classList.add('hidden');
        } else {
          // Single-video mode (v2 scan)
          const videoEl = this.vc.videoElement || this.vc.video;
          if (!videoEl || !videoEl.duration) {
            alert('Load a video first.');
            throw new Error('No video');
          }
          console.log('[FFA] starting scan…');
          await this.detector.scan();
          console.log('[FFA] scan resolved');

          const plays = this.detector.detectedPlays;
          console.log(`[FFA] ${plays.length} play(s) detected, ${this.detector.motionData.length} motion samples`);

          // Build team context from Game Info (set once, applies to all plays)
          const teamCtx = this._getTeamContext();
          console.log('[FFA] team context:', JSON.stringify(teamCtx));

          // Seed analyses from the in-browser heuristic analyzer as baseline.
          this._lastAnalyses = this.clipAnalyzer.analyzePlays(plays, this.detector.motionData, teamCtx);
          console.log('[FFA] heuristic analysis:', JSON.stringify(this._lastAnalyses.map(a => a?.tags)));

          let visionUsed = false;
          let visionMs = 0;

          // Primary path: Claude Vision API (sends frames, gets structured tags)
          if (this.vision.apiKey && videoEl && plays.length > 0) {
            const t0 = performance.now();
            let tickHandle = null;
            const modelName = this.vision.model.includes('opus') ? 'Opus' : 'Sonnet';
            const renderTick = () => {
              const elapsed = Math.floor((performance.now() - t0) / 1000);
              const phase = elapsed > 5 ? ' (thinking…)' : '';
              progressLabel.textContent = `🧠 ${modelName} analyzing play ${Math.min(this._visionProgress || 1, plays.length)}/${plays.length} · ${elapsed}s${phase}`;
            };
            renderTick();
            tickHandle = setInterval(renderTick, 500);
            progressFill.style.width = '100%';
            progressFill.classList.add('busy');

            try {
              console.log(`[FFA] sending ${plays.length} play(s) to Claude Vision API`);
              const visionResults = [];
              for (let i = 0; i < plays.length; i++) {
                this._visionProgress = i + 1;
                const p = plays[i];
                try {
                  const result = await this.vision.analyzePlay(videoEl, p.start, p.end, teamCtx);
                  visionResults.push(result);
                } catch (e) {
                  console.warn(`[FFA vision] play ${i + 1} failed:`, e);
                  visionResults.push({ tags: {}, confidence: {}, reasons: {}, extras: { error: e.message } });
                }
              }
              visionMs = Math.round(performance.now() - t0);

              for (let i = 0; i < visionResults.length; i++) {
                const vt = visionResults[i]?.tags || {};
                const ht = this._lastAnalyses[i]?.tags || {};
                const vCount = Object.values(vt).filter(v => v).length;
                const hCount = Object.values(ht).filter(v => v).length;
                if (vCount >= hCount) {
                  this._lastAnalyses[i] = visionResults[i];
                }
              }
              visionUsed = true;
              progressLabel.textContent = `✅ Claude Vision tagged ${visionResults.length} play${visionResults.length !== 1 ? 's' : ''} in ${(visionMs / 1000).toFixed(1)}s`;
              console.log(`[FFA] Claude Vision tagged ${visionResults.length} plays in ${(visionMs / 1000).toFixed(1)}s`);
            } catch (e) {
              visionMs = Math.round(performance.now() - t0);
              console.warn('[FFA] Claude Vision failed, falling back to heuristics:', e);
              progressLabel.textContent = `⚠️ Vision API error after ${(visionMs / 1000).toFixed(1)}s: ${e.message} — using heuristics`;
            } finally {
              if (tickHandle) clearInterval(tickHandle);
              progressFill.classList.remove('busy');
              delete this._visionProgress;
            }
          } else if (!this.vision.apiKey) {
            console.log('[FFA] no Claude API key set — enter one in Game Info to enable AI tagging');
          }

          // Fallback: local YOLO backend (if vision wasn't used and backend is available)
          if (!visionUsed && this.backend.isAvailable()) {
            const sourceFile = this.vc.currentFile || this.vc.file || null;
            if (sourceFile && plays.length > 0) {
              const t0 = performance.now();
              let tickHandle = null;
              const renderTick = () => {
                const elapsed = Math.floor((performance.now() - t0) / 1000);
                progressLabel.textContent = `🤖 Local server analyzing ${plays.length} play${plays.length !== 1 ? 's' : ''} · ${elapsed}s elapsed`;
              };
              renderTick();
              tickHandle = setInterval(renderTick, 500);
              progressFill.style.width = '100%';
              progressFill.classList.add('busy');
              try {
                const windows = plays.map(p => ({ start: p.start, end: p.end }));
                const backendResults = await this.backend.analyzeBatch(sourceFile, windows, teamCtx);
                const backendMs = Math.round(performance.now() - t0);
                if (Array.isArray(backendResults) && backendResults.length === plays.length) {
                  for (let i = 0; i < backendResults.length; i++) {
                    const bt = backendResults[i]?.tags || {};
                    const ht = this._lastAnalyses[i]?.tags || {};
                    const bCount = Object.values(bt).filter(v => v).length;
                    const hCount = Object.values(ht).filter(v => v).length;
                    if (bCount >= hCount) this._lastAnalyses[i] = backendResults[i];
                  }
                  progressLabel.textContent = `✅ Local server tagged ${backendResults.length} plays in ${(backendMs / 1000).toFixed(1)}s`;
                }
              } catch (e) {
                console.warn('[FFA] backend fallback failed:', e);
              } finally {
                if (tickHandle) clearInterval(tickHandle);
                progressFill.classList.remove('busy');
              }
            }
          }

          const taggedFieldCount = this._lastAnalyses.reduce((sum, a) => {
            return sum + Object.values(a?.tags || {}).filter(v => v).length;
          }, 0);
          const analysisLabel = visionUsed
            ? ` · 🧠 Vision AI in ${(visionMs / 1000).toFixed(1)}s`
            : (this.vision.apiKey ? ' · ⚠️ Vision failed, heuristic fallback' : ' · heuristic (set API key for AI tagging)');

          // For a single short clip (≤ 45s, 1 play), skip the review
          // step and stamp tags immediately — the coach loaded one play
          // and expects to see it tagged, not to click Apply first.
          if (plays.length === 1 && (this.vc.video?.duration || 999) <= 45) {
            const before = this.tagger.plays.length;
            this.detector.applyDetectedPlays();
            this._stampAutoTags(before);
            resultCount.textContent = `1 play auto-tagged · ${taggedFieldCount} fields${analysisLabel}`;
            resultsDiv.classList.remove('hidden');
            btnApply?.classList.add('hidden');
            btnReview?.classList.add('hidden');
          } else {
            resultCount.textContent = `${plays.length} play${plays.length !== 1 ? 's' : ''} detected · ${taggedFieldCount} auto-tags${analysisLabel}`;
            resultsDiv.classList.remove('hidden');
            btnApply?.classList.remove('hidden');
            btnReview?.classList.toggle('hidden', plays.length === 0);
          }
          this._drawMotionGraph(motionCanvas, this.detector.motionData, plays, 0);
        }
      } catch (e) {
        if (e.message !== 'No video') {
          alert('Scan error: ' + e.message);
        }
      }

      btnAutoDetect.disabled = false;
      btnAutoDetect.classList.remove('scanning');
      btnCancelScan.classList.add('hidden');
      progressDiv.classList.add('hidden');
    });

    btnCancelScan.addEventListener('click', () => {
      this.detector.cancelScan();
    });

    // Apply all detected plays directly — also stamp heuristic auto-tags
    btnApply?.addEventListener('click', () => {
      const before = this.tagger.plays.length;
      const added = this.detector.applyDetectedPlays();
      this._stampAutoTags(before);
      resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added · tagged from film`;
      btnReview?.classList.add('hidden');
    });

    // Open the review modal so the coach can tweak each detection
    btnReview?.addEventListener('click', () => {
      this._openDetectionReview();
    });

    // Progress updates — single-clip scan
    this.detector.on('scan-progress', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      const timeStr = data.time != null ? ` · ${data.time.toFixed(1)}s` : '';
      progressLabel.textContent = `${pct}%${timeStr}`;
    });

    // Progress updates — folder / multi-clip scan (one update per clip done)
    this.detector.on('clip-scanned', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      progressLabel.textContent = `Clip ${data.index}/${data.total} · ${data.clipName} · ${data.detected} detected`;
    });
  }

  /**
   * Probe the local Python CV backend, update the top-bar status badge,
   * and re-probe periodically so the badge reflects server up/down state
   * while the app is open. When the backend is reachable, auto-detect
   * and clip analysis route through it automatically for real YOLO-based
   * detection instead of in-browser heuristics.
   */
  _bindBackendStatus() {
    const badge = document.getElementById('backendStatusBadge');
    const updateBadge = (available) => {
      if (!badge) return;
      if (available) {
        badge.textContent = '🟢 AI Server';
        badge.classList.add('online');
        badge.classList.remove('offline');
        const caps = this.backend.getCapabilities();
        badge.title = `Local CV server online\n${caps.join('\n')}\nClick to re-probe`;
      } else {
        badge.textContent = '⚪ Heuristics';
        badge.classList.add('offline');
        badge.classList.remove('online');
        badge.title = 'Local CV server not detected — using in-browser heuristics.\nRun `cd server && ./start.sh` then click to re-probe.';
      }
    };

    const updateVisionBadge = () => {
      if (!badge) return false;
      if (this.vision.apiKey) {
        badge.textContent = '🧠 Vision AI';
        badge.classList.add('online');
        badge.classList.remove('offline');
        badge.title = 'Claude Vision API active — plays will be analyzed with AI.\nClick to re-probe local server.';
        return true;
      }
      return false;
    };
    this._updateAnalysisBadge = () => {
      if (!updateVisionBadge()) updateBadge(this.backend.isAvailable());
    };

    if (!updateVisionBadge()) updateBadge(false);
    this.backend.on('availability-changed', (avail) => {
      if (!updateVisionBadge()) updateBadge(avail);
    });

    // Kick off initial probe (non-blocking)
    this.backend.probe().then((avail) => {
      if (!updateVisionBadge()) updateBadge(avail);
    });

    badge?.addEventListener('click', async () => {
      if (updateVisionBadge()) return;
      badge.textContent = '… probing';
      const ok = await this.backend.probe();
      updateBadge(ok);
    });

    // Re-probe every 30s while the tab is visible so the badge stays fresh
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.backend.probe();
      }
    }, 30000);
  }

  /**
   * Read jersey color, perspective, and direction from the Game Info
   * panel. Set once per session/game — applies to every play analyzed.
   */
  _getTeamContext() {
    return {
      jerseyColor: document.getElementById('gameJerseyColor')?.value || '',
      perspective: document.getElementById('gamePerspective')?.value || 'offense',
      direction: document.getElementById('gameDirection')?.value || '',
    };
  }

  /**
   * Merge heuristic auto-tags from this._lastAnalyses onto the plays that
   * were just appended to the tagger. Only writes into empty fields — if
   * the coach already tagged a field manually, we leave it alone.
   */
  _stampAutoTags(startIndex = 0) {
    const analyses = this._lastAnalyses || [];
    if (!analyses.length) return 0;
    const newPlays = this.tagger.plays.slice(startIndex);
    let stamped = 0;
    for (let i = 0; i < newPlays.length && i < analyses.length; i++) {
      const play = newPlays[i];
      const a = analyses[i];
      if (!a || !a.tags) continue;
      for (const [k, v] of Object.entries(a.tags)) {
        // A field is "empty" if blank, or if it's still at its markEnd()
        // default. fieldSide defaults to 'own', so without this the AI's
        // opp-side determination would always be discarded.
        const isDefault = !play.tags[k] || play.tags[k] === ''
          || (k === 'fieldSide' && play.tags[k] === 'own');
        if (v && isDefault) {
          play.tags[k] = v;
          stamped++;
        }
      }
      // Store the raw analysis on the play so the coach can inspect it
      play.analysis = a;
      this.tagger._emit('play-updated', play);
    }
    // Refresh UI panels that depend on tags
    this.tagger._updatePlaySelect?.();
    this.tagger._updateTimeline?.();
    // Reload the tag form so the coach sees the stamped tags immediately.
    // Without this the form still shows the empty defaults from markEnd().
    const current = this.tagger.getCurrentPlay?.();
    if (current) this.tagger._loadTagForm(current);
    console.log(`[FFA] stamped ${stamped} tag fields across ${Math.min(newPlays.length, analyses.length)} plays`);
    return stamped;
  }

  /**
   * Open a review modal where the coach can scrub through each detected
   * play, adjust start/end by ±0.5s, reject false positives, and apply
   * only the ones they want. Mirrors the review step that top coaching
   * tools like Hudl and Catapult provide.
   */
  _openDetectionReview() {
    const plays = (this.detector.detectedPlays || []).map((p, i) => ({
      idx: i,
      start: p.start,
      end: p.end,
      peak: p.peak,
      confidence: p.confidence,
      accepted: true,
    }));
    if (plays.length === 0) {
      alert('No detections to review.');
      return;
    }

    // Remove any prior modal
    document.getElementById('detectReviewModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'detectReviewModal';
    modal.className = 'detect-review-modal';
    modal.innerHTML = `
      <div class="detect-review-backdrop"></div>
      <div class="detect-review-card">
        <div class="detect-review-head">
          <h3>Review Detected Plays</h3>
          <div class="detect-review-sub">Scrub, trim, or reject each detection. Accept all good plays in one click.</div>
          <button class="detect-review-close" id="detectReviewClose" title="Close">×</button>
        </div>
        <div class="detect-review-toolbar">
          <button class="btn btn-sm" id="detectReviewAcceptAll">Accept All</button>
          <button class="btn btn-sm" id="detectReviewRejectLow">Reject Low Confidence</button>
          <span class="detect-review-count" id="detectReviewCount"></span>
        </div>
        <div class="detect-review-list" id="detectReviewList"></div>
        <div class="detect-review-foot">
          <button class="btn btn-sm" id="detectReviewCancel">Cancel</button>
          <button class="btn btn-sm btn-accent" id="detectReviewApply">Apply Selected</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const list = modal.querySelector('#detectReviewList');
    const count = modal.querySelector('#detectReviewCount');
    const video = this.vc.videoElement || this.vc.video;

    const formatTime = (t) => {
      const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
      return `${m}:${s.toString().padStart(2, '0')}.${d}`;
    };

    const analyses = this._lastAnalyses || [];
    const renderTagPills = (a) => {
      if (!a || !a.tags) return '';
      const pills = [];
      for (const [k, v] of Object.entries(a.tags)) {
        if (!v) continue;
        const c = a.confidence?.[k] || 0;
        const confCls = c >= 0.6 ? 'hi' : c >= 0.4 ? 'med' : 'lo';
        const label = ({
          formation: 'Form',
          playType: 'Type',
          hash: 'Dir',
          result: 'Result',
          yardage: 'Yds',
        })[k] || k;
        const title = a.reasons?.[k] ? `${label}: ${v} — ${a.reasons[k]} (${Math.round(c*100)}%)` : `${label}: ${v}`;
        pills.push(`<span class="drr-tag ${confCls}" title="${title.replace(/"/g,'&quot;')}">${label} · ${v}</span>`);
      }
      return pills.length ? `<div class="drr-tags">${pills.join('')}</div>` : '';
    };

    const renderRow = (p) => {
      const row = document.createElement('div');
      row.className = 'detect-review-row' + (p.accepted ? '' : ' rejected');
      row.dataset.idx = p.idx;
      const conf = Math.round((p.confidence || 0) * 100);
      const confClass = conf >= 70 ? 'hi' : conf >= 40 ? 'med' : 'lo';
      const analysis = analyses[p.idx];
      row.innerHTML = `
        <div class="drr-main">
          <div class="drr-head">
            <span class="drr-num">#${p.idx + 1}</span>
            <span class="drr-time">${formatTime(p.start)} → ${formatTime(p.end)}</span>
            <span class="drr-dur">${(p.end - p.start).toFixed(1)}s</span>
            <span class="drr-conf ${confClass}" title="Detection confidence">${conf}%</span>
          </div>
          ${renderTagPills(analysis)}
          <div class="drr-controls">
            <button class="btn-xs" data-act="play">▶ Preview</button>
            <span class="drr-bump">
              Start:
              <button class="btn-xs" data-act="s-">−0.5s</button>
              <button class="btn-xs" data-act="s+">+0.5s</button>
            </span>
            <span class="drr-bump">
              End:
              <button class="btn-xs" data-act="e-">−0.5s</button>
              <button class="btn-xs" data-act="e+">+0.5s</button>
            </span>
          </div>
        </div>
        <div class="drr-side">
          <label class="drr-check">
            <input type="checkbox" ${p.accepted ? 'checked' : ''}>
            <span>Accept</span>
          </label>
        </div>`;

      const bump = (act) => {
        if (act === 's-') p.start = Math.max(0, p.start - 0.5);
        else if (act === 's+') p.start = Math.min(p.end - 0.2, p.start + 0.5);
        else if (act === 'e-') p.end = Math.max(p.start + 0.2, p.end - 0.5);
        else if (act === 'e+') p.end = p.end + 0.5;
        row.querySelector('.drr-time').textContent = `${formatTime(p.start)} → ${formatTime(p.end)}`;
        row.querySelector('.drr-dur').textContent = `${(p.end - p.start).toFixed(1)}s`;
      };

      row.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const act = btn.dataset.act;
          if (act === 'play') {
            if (video) {
              video.currentTime = p.start;
              video.play().catch(() => {});
              // Auto-pause at end
              const stopAt = () => {
                if (video.currentTime >= p.end) {
                  video.pause();
                  video.removeEventListener('timeupdate', stopAt);
                }
              };
              video.addEventListener('timeupdate', stopAt);
            }
          } else {
            bump(act);
          }
        });
      });

      row.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
        p.accepted = e.target.checked;
        row.classList.toggle('rejected', !p.accepted);
        updateCount();
      });

      return row;
    };

    const updateCount = () => {
      const acc = plays.filter(p => p.accepted).length;
      count.textContent = `${acc} / ${plays.length} accepted`;
    };

    plays.forEach(p => list.appendChild(renderRow(p)));
    updateCount();

    const close = () => modal.remove();
    modal.querySelector('#detectReviewClose').addEventListener('click', close);
    modal.querySelector('#detectReviewCancel').addEventListener('click', close);
    modal.querySelector('.detect-review-backdrop').addEventListener('click', close);

    modal.querySelector('#detectReviewAcceptAll').addEventListener('click', () => {
      plays.forEach(p => p.accepted = true);
      list.querySelectorAll('.detect-review-row').forEach(r => {
        r.classList.remove('rejected');
        r.querySelector('input[type=checkbox]').checked = true;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewRejectLow').addEventListener('click', () => {
      plays.forEach(p => { if ((p.confidence || 0) < 0.4) p.accepted = false; });
      list.querySelectorAll('.detect-review-row').forEach(r => {
        const idx = parseInt(r.dataset.idx, 10);
        const p = plays[idx];
        r.classList.toggle('rejected', !p.accepted);
        r.querySelector('input[type=checkbox]').checked = p.accepted;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewApply').addEventListener('click', () => {
      // Keep analyses aligned with the accepted plays so _stampAutoTags
      // tags the right ones after applyDetectedPlays creates them.
      const keptIdxs = [];
      const accepted = [];
      plays.forEach(p => {
        if (!p.accepted) return;
        keptIdxs.push(p.idx);
        accepted.push({ start: p.start, end: p.end, peak: p.peak, confidence: p.confidence });
      });
      const before = this.tagger.plays.length;
      const added = this.detector.applyDetectedPlays(accepted);
      // Rebuild _lastAnalyses in the order the tagger appended them
      const fullAnalyses = this._lastAnalyses || [];
      this._lastAnalyses = keptIdxs.map(i => fullAnalyses[i]);
      this._stampAutoTags(before);
      // Restore the full analyses array in case user re-opens the review
      this._lastAnalyses = fullAnalyses;
      const resultCount = document.getElementById('detectResultCount');
      if (resultCount) resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added · tagged from film`;
      close();
    });
  }

  _bindGameInfo() {
    const fields = ['gameTeamName', 'gameOpponent', 'gameDate', 'gameScoreUs', 'gameScoreThem', 'gameJerseyColor', 'gamePerspective', 'gameDirection'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this._saveGameInfo());
        el.addEventListener('input', () => this._saveGameInfo());
      }
    });
    const apiKeyEl = document.getElementById('gameApiKey');
    if (apiKeyEl) {
      const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
      if (savedKey) apiKeyEl.value = savedKey;
      apiKeyEl.addEventListener('change', () => this._saveApiKey());
      apiKeyEl.addEventListener('blur', () => this._saveApiKey());
    }
    const modelEl = document.getElementById('gameAiModel');
    if (modelEl) {
      const savedModel = localStorage.getItem('ffa_claude_model') || '';
      if (savedModel) modelEl.value = savedModel;
      this.vision.model = modelEl.value;
      modelEl.addEventListener('change', () => {
        this.vision.model = modelEl.value;
        localStorage.setItem('ffa_claude_model', modelEl.value);
      });
    }
  }

  _saveApiKey() {
    const apiKey = document.getElementById('gameApiKey')?.value || '';
    localStorage.setItem('ffa_claude_api_key', apiKey);
    this.vision.apiKey = apiKey;
    this._updateAnalysisBadge?.();
  }

  _saveGameInfo() {
    this.storage.gameInfo = {
      teamName: document.getElementById('gameTeamName')?.value || '',
      opponent: document.getElementById('gameOpponent')?.value || '',
      date: document.getElementById('gameDate')?.value || '',
      scoreUs: document.getElementById('gameScoreUs')?.value || '',
      scoreThem: document.getElementById('gameScoreThem')?.value || '',
      jerseyColor: document.getElementById('gameJerseyColor')?.value || '',
      perspective: document.getElementById('gamePerspective')?.value || 'offense',
      direction: document.getElementById('gameDirection')?.value || '',
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
      gameScoreThem: info.scoreThem,
      gameJerseyColor: info.jerseyColor,
      gamePerspective: info.perspective,
      gameDirection: info.direction,
    };
    for (const [id, val] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    }
    const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
    if (savedKey) {
      const keyEl = document.getElementById('gameApiKey');
      if (keyEl) keyEl.value = savedKey;
      this.vision.apiKey = savedKey;
    }
    const savedModel = localStorage.getItem('ffa_claude_model') || '';
    if (savedModel) {
      const mEl = document.getElementById('gameAiModel');
      if (mEl) mEl.value = savedModel;
      this.vision.model = savedModel;
    }
  }

  _bindReportExport() {
    const btn = document.getElementById('btnExportReport');
    if (btn) {
      btn.addEventListener('click', () => this.storage.exportHtmlReport(this.stats));
    }
  }

  _bindTagNav() {
    const btnPrev = document.getElementById('btnTagPrev');
    const btnNext = document.getElementById('btnTagSaveNext');
    const btnSkip = document.getElementById('btnTagSkip');
    const yardsMinus = document.getElementById('yardsMinus');
    const yardsPlus = document.getElementById('yardsPlus');
    const yardsInput = document.getElementById('tagYardage');

    btnPrev?.addEventListener('click', () => {
      this.tagger.prevPlay();
      this._autoPlayCurrent();
    });
    btnNext?.addEventListener('click', () => {
      if (this.tagger.nextPlay()) this._autoPlayCurrent();
    });
    btnSkip?.addEventListener('click', () => {
      if (this.tagger.nextPlay()) this._autoPlayCurrent();
    });

    yardsMinus?.addEventListener('click', () => {
      const v = parseInt(yardsInput.value) || 0;
      yardsInput.value = v - 1;
      yardsInput.dispatchEvent(new Event('change'));
    });
    yardsPlus?.addEventListener('click', () => {
      const v = parseInt(yardsInput.value) || 0;
      yardsInput.value = v + 1;
      yardsInput.dispatchEvent(new Event('change'));
    });
  }

  _autoPlayCurrent() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    const v = this.vc.videoElement || this.vc.video;
    if (v) {
      v.currentTime = play.timestamp.start;
      v.play().catch(() => {});
    }
  }

  _handleTagKey(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (!this.tagger.currentPlayId) return false;

    const keyMap = {
      'KeyR': ['playType', 'Run Inside'],
      'KeyO': ['playType', 'Run Outside'],
      'KeyS': ['playType', 'Screen'],
      'KeyP': ['playType', 'Short Pass'],
      'KeyM': ['playType', 'Medium Pass'],
      'KeyD': ['playType', 'Deep Pass'],
      'KeyA': ['playType', 'Play Action'],
      'KeyQ': ['playType', 'RPO'],
      'KeyX': ['playType', 'Trick Play'],
      'KeyG': ['result', 'Gain'],
      'KeyL': ['result', 'Loss'],
      'KeyN': ['result', 'No Gain'],
      'KeyI': ['result', 'Incomplete'],
      'KeyT': ['result', 'Touchdown'],
      'KeyW': ['result', 'Sack'],
      'KeyU': ['result', 'Interception'],
      'KeyF': ['result', 'Fumble'],
      'KeyE': ['result', 'Penalty'],
      'KeyK': ['result', 'Punt'],
    };

    if (e.code === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (this.tagger.nextPlay()) this._autoPlayCurrent();
      return true;
    }

    if (e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit4') {
      e.preventDefault();
      const down = e.code.replace('Digit', '');
      const tf = this.tagger.tagFields.down;
      if (tf) {
        tf.value = tf.value === down ? '' : down;
        this.tagger._saveCurrentTags();
      }
      return true;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const mapped = keyMap[e.code];
    if (!mapped) return false;

    e.preventDefault();
    const [field, value] = mapped;
    const tf = this.tagger.tagFields[field];
    if (tf) {
      tf.value = tf.value === value ? '' : value;
      this.tagger._saveCurrentTags();
    }
    return true;
  }

  _updateTagProgress() {
    const label = document.getElementById('tagProgressLabel');
    const fill = document.getElementById('tagProgressFill');
    if (!label || !fill) return;
    const total = this.tagger.plays.length;
    const tagged = this.tagger.plays.filter(p => p.tags.playType && p.tags.result).length;
    label.textContent = `${tagged} / ${total} tagged`;
    fill.style.width = total > 0 ? Math.round((tagged / total) * 100) + '%' : '0%';
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
