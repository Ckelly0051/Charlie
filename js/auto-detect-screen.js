import { h } from 'preact';
import { AutoDetectContent } from './native-autodetect.jsx';
import { DetectionReview } from './native-detection-review.jsx';
import { SeasonFormat } from './season-format.js';

/* Owns detection settings, scanning, progress and reviewed tag suggestions.
 * Native views render its snapshot; the overlay service owns its sheets/dialogs. */
export class AutoDetectScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.detector = app.detector;
    this.handle = null;
    this._listeners = new Set();

    this.status = 'idle';        // idle | scanning | done
    this.progress = 0;           // 0-100
    this.statusText = '';
    this.resultText = '';
    this.canReview = false;
    this.canApply = false;
    this.settings = {
      strictness: 1.0,
      useAudio: true,
      minPlayDuration: 2,
      maxPlayDuration: 30,
      cooldownAfterEnd: 2.5,
    };

    this._lastAnalyses = [];
    this._scanContext = null;
    this._visionProgress = 0;
    this._motionCanvas = null;

    this.detector.on('scan-progress', (data) => {
      if (this.status !== 'scanning') return;
      if (this._scanContext && !this._ownsContext(this._scanContext)) {
        this._expireContext(this._scanContext);
        return;
      }
      const pct = Math.round(data.progress * 100);
      const timeStr = data.time != null ? ` · ${data.time.toFixed(1)}s` : '';
      this._setState({ progress: pct, statusText: `${pct}%${timeStr}` });
    });
    this.detector.on('clip-scanned', (data) => {
      if (this.status !== 'scanning') return;
      if (this._scanContext && !this._ownsContext(this._scanContext)) {
        this._expireContext(this._scanContext);
        return;
      }
      const pct = Math.round(data.progress * 100);
      this._setState({ progress: pct, statusText: `Clip ${data.index}/${data.total} · ${data.clipName} · ${data.detected} detected` });
    });
  }

  open({ returnFocus = null } = {}) {
    if (this.handle) return this.handle.result;
    const handle = this.overlays.sheet({
      id: 'auto-detect',
      title: 'Auto-Detect Plays',
      modal: false,
      returnFocus,
      content: h(AutoDetectContent, { screen: this }),
      actions: [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
    });
    this.handle = handle;
    const result = handle.result.finally(() => {
      if (this.handle === handle) this.handle = null;
    });
    return result;
  }

  close(value) { this.handle?.close?.(value); }

  subscribe(listener) {
    this._listeners.add(listener);
    return () => this._listeners.delete(listener);
  }

  snapshot() {
    return {
      status: this.status,
      progress: this.progress,
      statusText: this.statusText,
      resultText: this.resultText,
      canReview: this.canReview,
      canApply: this.canApply,
      canCancel: this.status === 'scanning',
      settings: { ...this.settings },
      strictnessLabel: this._strictnessLabel(this.settings.strictness),
    };
  }

  _setState(patch) {
    Object.assign(this, patch);
    this._publish();
  }

  _publish() {
    const state = this.snapshot();
    this._listeners.forEach((listener) => listener(state));
  }

  _strictnessLabel(v) {
    const n = parseFloat(v);
    if (n <= 0.7) return 'Loose';
    if (n <= 0.95) return 'Relaxed';
    if (n <= 1.15) return 'Balanced';
    if (n <= 1.4) return 'Strict';
    return 'Very Strict';
  }

  setSetting(key, value) {
    if (!(key in this.settings)) return;
    const numeric = key === 'useAudio' ? !!value : Number(value);
    if (key !== 'useAudio' && !Number.isFinite(numeric)) return;
    this.settings = { ...this.settings, [key]: key === 'useAudio' ? numeric : numeric };
    this._publish();
  }

  /* Draw the motion-signal graph into the panel-owned canvas. */
  drawMotionGraph(canvas) {
    if (!canvas) return;
    const motionData = this.detector.motionData;
    const detectedPlays = this.detector.detectedPlays;
    if (!motionData?.length) return;
    const rect = canvas.parentElement?.getBoundingClientRect();
    const w = rect?.width || 300;
    const h = 60;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);
    ctx.fillStyle = '#2c323c';
    ctx.fillRect(0, 0, w, h);
    let maxMotion = 0;
    for (const d of motionData) if (d.motion > maxMotion) maxMotion = d.motion;
    if (maxMotion === 0) return;
    const duration = motionData[motionData.length - 1].time;
    ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
    for (const p of detectedPlays) {
      const x1 = (p.start / duration) * w;
      const x2 = (p.end / duration) * w;
      ctx.fillRect(x1, 0, x2 - x1, h);
    }
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < motionData.length; i++) {
      const x = (motionData[i].time / duration) * w;
      const y = h - (motionData[i].motion / maxMotion) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }

  _toast(message, tone = 'info') {
    return this.overlays?.toast?.({ message: String(message ?? ''), tone });
  }

  _context() {
    const store = this.app.storage?.seasonStore;
    return {
      seasonId: String(store?.currentSeasonId || ''),
      gameId: String(store?.data?.activeGameId || ''),
    };
  }

  _ownsContext(expected) {
    if (!expected?.seasonId || !expected?.gameId) return false;
    const current = this._context();
    return current.seasonId === expected.seasonId && current.gameId === expected.gameId;
  }

  _expireContext(expected = this._scanContext) {
    if (!expected || this._scanContext !== expected) return false;
    this.detector.cancelScan?.();
    try { this.app.backend?.cancel?.(); } catch (e) {}
    try { this.app.vision?.cancel?.(); } catch (e) {}
    this._scanContext = null;
    this._lastAnalyses = [];
    this._setState({
      status: 'done', progress: 0, statusText: '',
      resultText: 'Scan expired because the active game changed. Scan this game again.',
      canReview: false, canApply: false,
    });
    this._toast('Auto-detect results expired because the active game changed.', 'warning');
    return false;
  }

  _guardContext(expected = this._scanContext) {
    return expected && this._scanContext === expected && this._ownsContext(expected)
      ? true
      : this._expireContext(expected);
  }

  _consumeResults(resultText) {
    this._scanContext = null;
    this._lastAnalyses = [];
    this._setState({ status: 'done', progress: 100, resultText, canReview: false, canApply: false });
  }

  /* Scan with PlayDetector, then apply the vision/local-CV fallback chain and publish progress. */
  async start() {
    if (this.detector.isScanning) return;
    const app = this.app;
    const scanContext = this._context();
    if (!scanContext.seasonId || !scanContext.gameId) {
      this._toast('Open a game before scanning film.', 'warning');
      return;
    }
    this._scanContext = scanContext;
    const s = this.settings;
    this.detector.strictness = Number(s.strictness) || 1.0;
    this.detector.minPlayDuration = Number(s.minPlayDuration) || 2;
    this.detector.maxPlayDuration = Number(s.maxPlayDuration) || 30;
    this.detector.cooldownAfterEnd = Number(s.cooldownAfterEnd) || 2.5;
    this.detector.useAudio = !!s.useAudio;

    this._setState({
      status: 'scanning', progress: 0, statusText: 'Starting scan…',
      resultText: '', canReview: false, canApply: false,
    });

    try {
      if (app.playlist.hasClips) {
        const results = await this.detector.scanClips(app.playlist);
        if (!this._guardContext(scanContext)) return;
        const totalDetected = results.reduce((sum, r) => sum + (r.detected?.length || 0), 0);
        this._setState({ resultText: `${totalDetected} action windows found in ${results.length} clips`, canApply: false, canReview: false });
      } else {
        const videoEl = app.vc.videoElement || app.vc.video;
        if (!videoEl || !videoEl.duration) {
          this._toast('Load a video first.', 'warning');
          throw new Error('No video');
        }
        await this.detector.scan();
        if (!this._guardContext(scanContext)) return;
        const plays = this.detector.detectedPlays;
        const teamCtx = app._getTeamContext();
        this._lastAnalyses = app.clipAnalyzer.analyzePlays(plays, this.detector.motionData, teamCtx);

        let visionUsed = false;
        let visionMs = 0;

        if (app.vision.apiKey && videoEl && plays.length > 0) {
          const t0 = performance.now();
          let tickHandle = null;
          const modelName = app.vision.model.includes('opus') ? 'Opus' : 'Sonnet';
          const renderTick = () => {
            if (!this._guardContext(scanContext)) return;
            const elapsed = Math.floor((performance.now() - t0) / 1000);
            const phase = elapsed > 5 ? ' (thinking…)' : '';
            this._setState({ progress: 100, statusText: `🧠 ${modelName} analyzing play ${Math.min(this._visionProgress || 1, plays.length)}/${plays.length} · ${elapsed}s${phase}` });
          };
          renderTick();
          tickHandle = setInterval(renderTick, 500);
          try {
            const visionResults = [];
            for (let i = 0; i < plays.length; i++) {
              this._visionProgress = i + 1;
              const p = plays[i];
              try {
                const result = await app.vision.analyzePlay(videoEl, p.start, p.end, teamCtx);
                if (!this._guardContext(scanContext)) return;
                visionResults.push(result);
              } catch (e) {
                console.warn(`[FFA vision] play ${i + 1} failed:`, e);
                visionResults.push({ tags: {}, confidence: {}, reasons: {}, extras: { error: e.message } });
              }
            }
            visionMs = Math.round(performance.now() - t0);
            for (let i = 0; i < visionResults.length; i++) {
              const vCount = Object.values(AutoDetectScreen.currentTags(visionResults[i])).filter((v) => v).length;
              const hCount = Object.values(AutoDetectScreen.currentTags(this._lastAnalyses[i])).filter((v) => v).length;
              if (vCount >= hCount) this._lastAnalyses[i] = visionResults[i];
            }
            visionUsed = true;
            this._setState({ statusText: `✅ Claude Vision tagged ${visionResults.length} play${visionResults.length !== 1 ? 's' : ''} in ${(visionMs / 1000).toFixed(1)}s` });
          } catch (e) {
            visionMs = Math.round(performance.now() - t0);
            console.warn('[FFA] Claude Vision failed, falling back to heuristics:', e);
            this._setState({ statusText: `⚠️ Vision API error after ${(visionMs / 1000).toFixed(1)}s: ${e.message} — using heuristics` });
          } finally {
            if (tickHandle) clearInterval(tickHandle);
            delete this._visionProgress;
          }
        }

        if (!visionUsed && app.backend.isAvailable()) {
          const sourceFile = app.vc.currentFile || app.vc.file || null;
          if (sourceFile && plays.length > 0) {
            const t0 = performance.now();
            let tickHandle = null;
            const renderTick = () => {
              if (!this._guardContext(scanContext)) return;
              const elapsed = Math.floor((performance.now() - t0) / 1000);
              this._setState({ progress: 100, statusText: `🤖 Local server analyzing ${plays.length} play${plays.length !== 1 ? 's' : ''} · ${elapsed}s elapsed` });
            };
            renderTick();
            tickHandle = setInterval(renderTick, 500);
            try {
              const windows = plays.map((p) => ({ start: p.start, end: p.end }));
              const backendResults = await app.backend.analyzeBatch(sourceFile, windows, teamCtx);
              if (!this._guardContext(scanContext)) return;
              const backendMs = Math.round(performance.now() - t0);
              if (Array.isArray(backendResults) && backendResults.length === plays.length) {
                for (let i = 0; i < backendResults.length; i++) {
                  const bCount = Object.values(AutoDetectScreen.currentTags(backendResults[i])).filter((v) => v).length;
                  const hCount = Object.values(AutoDetectScreen.currentTags(this._lastAnalyses[i])).filter((v) => v).length;
                  if (bCount >= hCount) this._lastAnalyses[i] = backendResults[i];
                }
                this._setState({ statusText: `✅ Local server tagged ${backendResults.length} plays in ${(backendMs / 1000).toFixed(1)}s` });
              }
            } catch (e) {
              console.warn('[FFA] backend fallback failed:', e);
            } finally {
              if (tickHandle) clearInterval(tickHandle);
            }
          }
        }

        const taggedFieldCount = this._lastAnalyses.reduce((sum, a) => sum + Object.values(AutoDetectScreen.currentTags(a)).filter((v) => v).length, 0);
        const analysisLabel = visionUsed
          ? ` · 🧠 Vision AI in ${(visionMs / 1000).toFixed(1)}s`
          : (app.vision.apiKey ? ' · ⚠️ Vision failed, heuristic fallback' : ' · heuristic (set API key for AI tagging)');

        if (plays.length === 1 && (app.vc.video?.duration || 999) <= 45) {
          if (!this._guardContext(scanContext)) return;
          const before = app.tagger.plays.length;
          this.detector.applyDetectedPlays();
          this._stampAutoTags(before);
          this._consumeResults(`1 play auto-tagged · ${taggedFieldCount} fields${analysisLabel}`);
        } else {
          if (!this._guardContext(scanContext)) return;
          this._setState({
            resultText: `${plays.length} play${plays.length !== 1 ? 's' : ''} detected · ${taggedFieldCount} auto-tags${analysisLabel}`,
            canApply: true, canReview: plays.length > 0,
          });
        }
        this._motionReady = true;
      }
    } catch (e) {
      if (this._scanContext !== scanContext || !this._ownsContext(scanContext)) return;
      if (e.message !== 'No video') this._toast('Scan error: ' + e.message, 'error');
    }

    if (this._scanContext === scanContext && this._ownsContext(scanContext)) {
      this._setState({ status: 'done', progress: 100 });
    }
  }

  cancel() {
    this.detector.cancelScan();
    try { this.app.backend?.cancel?.(); } catch (e) {}
    try { this.app.vision?.cancel?.(); } catch (e) {}
  }

  applyAll() {
    if (!this.canApply || !this._guardContext()) return 0;
    const before = this.app.tagger.plays.length;
    const added = this.detector.applyDetectedPlays();
    this._stampAutoTags(before);
    this._consumeResults(`${added} play${added !== 1 ? 's' : ''} added · tagged from film`);
    return added;
  }

  /** An analyzer's tags in the current format: every backend (vision, local
   *  CV, the optional Python server) passes through here, so a retired key or a
   *  value that belongs to another field (formation 'Shotgun', coverage 'Man')
   *  is dropped rather than stamped as an old-format play. */
  static currentTags(a) { return SeasonFormat.currentTagValues(a?.tags || {}); }

  /** Merge heuristic/vision auto-tags onto plays just appended to the tagger.
   *  Only writes into empty fields -- a coach's manual tag always wins. */
  _stampAutoTags(startIndex = 0) {
    const analyses = this._lastAnalyses || [];
    if (!analyses.length) return 0;
    const tagger = this.app.tagger;
    const newPlays = tagger.plays.slice(startIndex);
    let stamped = 0;
    for (let i = 0; i < newPlays.length && i < analyses.length; i++) {
      const play = newPlays[i];
      const a = analyses[i];
      if (!a || !a.tags) continue;
      for (const [k, v] of Object.entries(AutoDetectScreen.currentTags(a))) {
        const isDefault = !play.tags[k] || play.tags[k] === ''
          || (k === 'fieldSide' && play.tags[k] === 'own');
        if (v && isDefault) { play.tags[k] = v; stamped++; }
      }
      play.analysis = a;
      tagger._emit('play-updated', play);
    }
    tagger._updatePlaySelect?.();
    tagger._updateTimeline?.();
    return stamped;
  }

  /** Review local trims and selections before committing the scan. */
  openReview() {
    if (!this.canReview || !this._guardContext()) return;
    const plays = (this.detector.detectedPlays || []).map((play, idx) => ({ ...play, idx, accepted: true }));
    if (!plays.length) { this._toast('No detections to review.', 'warning'); return; }
    this._reviewHandle?.close('replaced');
    this._reviewRevision = (this._reviewRevision || 0) + 1;
    let handle;
    const close = () => handle.close();
    handle = this.overlays.dialog({
      id: 'detect-review', title: 'Review Detected Plays', actions: [], unsaved: true,
      initialFocus: '#detectReviewCancel',
      content: h(DetectionReview, {
        key: this._reviewRevision,
        plays, analyses: this._lastAnalyses || [], currentTags: AutoDetectScreen.currentTags,
        video: this.app.vc.videoElement || this.app.vc.video, close,
        apply: reviewed => {
          if (!this._guardContext()) { close(); return; }
          const kept = reviewed.filter(play => play.accepted);
          const accepted = kept.map(({ start, end, peak, confidence }) => ({ start, end, peak, confidence }));
          const before = this.app.tagger.plays.length;
          const added = this.detector.applyDetectedPlays(accepted);
          const fullAnalyses = this._lastAnalyses || [];
          this._lastAnalyses = kept.map(play => fullAnalyses[play.idx]);
          try { this._stampAutoTags(before); } finally { this._lastAnalyses = fullAnalyses; }
          this._consumeResults(`${added} play${added !== 1 ? 's' : ''} added \u00b7 tagged from film`);
          close();
        },
      }),
    });
    this._reviewHandle = handle;
    handle.result.finally(() => { if (this._reviewHandle === handle) this._reviewHandle = null; });
  }
}
