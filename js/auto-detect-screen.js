import { h } from 'preact';
import { AutoDetectContent } from './native-autodetect.jsx';

/**
 * Native Auto-Detect operation + state API.
 *
 * Final Engine Independence: this replaces App._bindAutoDetect(), which read
 * settings off hidden DOM sliders and wrote progress/results directly into
 * descendants of the permanently hidden `#giAutoDetectHost`. The scan
 * orchestration itself (PlayDetector + Vision/local-CV fallback + tag
 * stamping) is UNCHANGED -- only its presentation moved. This class owns
 * live state (settings, status, progress, results) and a native
 * subscribe()/snapshot() seam; `native-autodetect.jsx` renders it inside a
 * real NativeOverlayService sheet, opened from the visible "Auto-detect
 * plays" command in the tag form. There is no hidden host any more.
 *
 * The detection-review step (`openReview()`) is unchanged from its prior
 * App._openDetectionReview() implementation: it already built its modal
 * directly onto `document.body`, not inside the hidden host, so it was
 * always genuinely reachable -- only relocated here for one owner.
 */
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
    this._visionProgress = 0;
    this._motionCanvas = null;

    this.detector.on('scan-progress', (data) => {
      const pct = Math.round(data.progress * 100);
      const timeStr = data.time != null ? ` · ${data.time.toFixed(1)}s` : '';
      this._setState({ progress: pct, statusText: `${pct}%${timeStr}` });
    });
    this.detector.on('clip-scanned', (data) => {
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

  /** Draw the motion-signal graph into a canvas the Preact panel owns. Pure
   *  reuse of the original imperative renderer -- it always took a canvas
   *  element parameter, never assumed a fixed DOM id. */
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

  /** Start a scan. Mirrors the original click handler's orchestration exactly
   *  -- PlayDetector scan, Vision/local-CV tagging fallback chain, tag
   *  stamping -- but writes to native state instead of DOM elements. */
  async start() {
    if (this.detector.isScanning) return;
    const app = this.app;
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
        const totalDetected = results.reduce((sum, r) => sum + (r.detected?.length || 0), 0);
        this._setState({ resultText: `${totalDetected} action windows found in ${results.length} clips`, canApply: false, canReview: false });
      } else {
        const videoEl = app.vc.videoElement || app.vc.video;
        if (!videoEl || !videoEl.duration) {
          this._toast('Load a video first.', 'warning');
          throw new Error('No video');
        }
        await this.detector.scan();
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
              const vCount = Object.values(vt).filter((v) => v).length;
              const hCount = Object.values(ht).filter((v) => v).length;
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
              const elapsed = Math.floor((performance.now() - t0) / 1000);
              this._setState({ progress: 100, statusText: `🤖 Local server analyzing ${plays.length} play${plays.length !== 1 ? 's' : ''} · ${elapsed}s elapsed` });
            };
            renderTick();
            tickHandle = setInterval(renderTick, 500);
            try {
              const windows = plays.map((p) => ({ start: p.start, end: p.end }));
              const backendResults = await app.backend.analyzeBatch(sourceFile, windows, teamCtx);
              const backendMs = Math.round(performance.now() - t0);
              if (Array.isArray(backendResults) && backendResults.length === plays.length) {
                for (let i = 0; i < backendResults.length; i++) {
                  const bt = backendResults[i]?.tags || {};
                  const ht = this._lastAnalyses[i]?.tags || {};
                  const bCount = Object.values(bt).filter((v) => v).length;
                  const hCount = Object.values(ht).filter((v) => v).length;
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

        const taggedFieldCount = this._lastAnalyses.reduce((sum, a) => sum + Object.values(a?.tags || {}).filter((v) => v).length, 0);
        const analysisLabel = visionUsed
          ? ` · 🧠 Vision AI in ${(visionMs / 1000).toFixed(1)}s`
          : (app.vision.apiKey ? ' · ⚠️ Vision failed, heuristic fallback' : ' · heuristic (set API key for AI tagging)');

        if (plays.length === 1 && (app.vc.video?.duration || 999) <= 45) {
          const before = app.tagger.plays.length;
          this.detector.applyDetectedPlays();
          this._stampAutoTags(before);
          this._setState({ resultText: `1 play auto-tagged · ${taggedFieldCount} fields${analysisLabel}`, canApply: false, canReview: false });
        } else {
          this._setState({
            resultText: `${plays.length} play${plays.length !== 1 ? 's' : ''} detected · ${taggedFieldCount} auto-tags${analysisLabel}`,
            canApply: true, canReview: plays.length > 0,
          });
        }
        this._motionReady = true;
      }
    } catch (e) {
      if (e.message !== 'No video') this._toast('Scan error: ' + e.message, 'error');
    }

    this._setState({ status: 'done', progress: 100 });
  }

  cancel() {
    this.detector.cancelScan();
    try { this.app.backend?.cancel?.(); } catch (e) {}
    try { this.app.vision?.cancel?.(); } catch (e) {}
  }

  applyAll() {
    const before = this.app.tagger.plays.length;
    const added = this.detector.applyDetectedPlays();
    this._stampAutoTags(before);
    this._setState({ resultText: `${added} play${added !== 1 ? 's' : ''} added · tagged from film`, canReview: false });
  }

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
      for (const [k, v] of Object.entries(a.tags)) {
        const isDefault = !play.tags[k] || play.tags[k] === ''
          || (k === 'fieldSide' && play.tags[k] === 'own');
        if (v && isDefault) { play.tags[k] = v; stamped++; }
      }
      play.analysis = a;
      tagger._emit('play-updated', play);
    }
    tagger._updatePlaySelect?.();
    tagger._updateTimeline?.();
    const current = tagger.getCurrentPlay?.();
    if (current) tagger._loadTagForm(current);
    return stamped;
  }

  /** Open the scrub/trim/accept review modal. Unchanged from its prior
   *  App._openDetectionReview() implementation -- it already appends
   *  directly to document.body, so it was never part of the hidden host. */
  openReview() {
    const plays = (this.detector.detectedPlays || []).map((p, i) => ({
      idx: i, start: p.start, end: p.end, peak: p.peak, confidence: p.confidence, accepted: true,
    }));
    if (plays.length === 0) {
      this._toast('No detections to review.', 'warning');
      return;
    }
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
    const video = this.app.vc.videoElement || this.app.vc.video;

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
        const label = ({ formation: 'Form', playType: 'Type', hash: 'Dir', result: 'Result', yardage: 'Yds' })[k] || k;
        const title = a.reasons?.[k] ? `${label}: ${v} — ${a.reasons[k]} (${Math.round(c * 100)}%)` : `${label}: ${v}`;
        pills.push(`<span class="drr-tag ${confCls}" title="${title.replace(/"/g, '&quot;')}">${label} · ${v}</span>`);
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
            <span class="drr-bump">Start:
              <button class="btn-xs" data-act="s-">−0.5s</button>
              <button class="btn-xs" data-act="s+">+0.5s</button>
            </span>
            <span class="drr-bump">End:
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

      row.querySelectorAll('[data-act]').forEach((btn) => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const act = btn.dataset.act;
          if (act === 'play') {
            if (video) {
              video.currentTime = p.start;
              video.play().catch(() => {});
              const stopAt = () => {
                if (video.currentTime >= p.end) { video.pause(); video.removeEventListener('timeupdate', stopAt); }
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
      const acc = plays.filter((p) => p.accepted).length;
      count.textContent = `${acc} / ${plays.length} accepted`;
    };

    plays.forEach((p) => list.appendChild(renderRow(p)));
    updateCount();

    const close = () => modal.remove();
    modal.querySelector('#detectReviewClose').addEventListener('click', close);
    modal.querySelector('#detectReviewCancel').addEventListener('click', close);
    modal.querySelector('.detect-review-backdrop').addEventListener('click', close);

    modal.querySelector('#detectReviewAcceptAll').addEventListener('click', () => {
      plays.forEach((p) => p.accepted = true);
      list.querySelectorAll('.detect-review-row').forEach((r) => {
        r.classList.remove('rejected');
        r.querySelector('input[type=checkbox]').checked = true;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewRejectLow').addEventListener('click', () => {
      plays.forEach((p) => { if ((p.confidence || 0) < 0.4) p.accepted = false; });
      list.querySelectorAll('.detect-review-row').forEach((r) => {
        const idx = parseInt(r.dataset.idx, 10);
        const p = plays[idx];
        r.classList.toggle('rejected', !p.accepted);
        r.querySelector('input[type=checkbox]').checked = p.accepted;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewApply').addEventListener('click', () => {
      const keptIdxs = [];
      const accepted = [];
      plays.forEach((p) => {
        if (!p.accepted) return;
        keptIdxs.push(p.idx);
        accepted.push({ start: p.start, end: p.end, peak: p.peak, confidence: p.confidence });
      });
      const before = this.app.tagger.plays.length;
      const added = this.detector.applyDetectedPlays(accepted);
      const fullAnalyses = this._lastAnalyses || [];
      this._lastAnalyses = keptIdxs.map((i) => fullAnalyses[i]);
      this._stampAutoTags(before);
      this._lastAnalyses = fullAnalyses;
      this._setState({ resultText: `${added} play${added !== 1 ? 's' : ''} added · tagged from film` });
      close();
    });
  }
}
