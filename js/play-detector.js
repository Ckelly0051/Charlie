/**
 * PlayDetector v2 — multi-signal play detection.
 *
 * Signals combined:
 *   • grid-based motion (camera-pan rejected)
 *   • scene-cut detection via luminance histogram delta
 *   • audio envelope (RMS of decoded audio) for whistles / crowd roar
 *
 * Detection strategy:
 *   1. Scan the video by PLAYING it (muted, 4× speed) and sampling frames
 *      via requestVideoFrameCallback. This is ~10-20× faster than seek-per-frame.
 *   2. For each sample, compute per-cell motion on a 6×4 grid inside the
 *      field ROI. Drop frames with uniform motion (camera pan) by checking
 *      grid variance.
 *   3. Compute luminance histogram delta. Large deltas = scene cut.
 *   4. Build a smoothed motion signal. Compute baseline noise from the
 *      quietest 20% of samples. Threshold = baseline + k * stddev (adaptive).
 *   5. Peak-detect plays: look for motion bursts of duration >= minPlay that
 *      peak above threshold, bounded by scene cuts on either side.
 *   6. Refine boundaries to the flanking low-motion points around each peak.
 *
 * The old threshold / sensitivity slider is kept for power users as a
 * "strictness" multiplier applied to the adaptive threshold.
 */
export class PlayDetector {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.listeners = {};

    // User-tunable
    this.strictness = 1.0;       // 0.5..2.0 — multiplier on adaptive threshold
    this.minPlayDuration = 2.0;  // seconds
    this.maxPlayDuration = 30.0;
    this.cooldownAfterEnd = 2.5;
    this.playbackRate = 4.0;     // how fast to run the video during scan
    this.gridCols = 6;
    this.gridRows = 4;
    this.useAudio = true;

    // Field ROI (normalized 0..1). Default: middle 70% vertically/horizontally,
    // which crops the sideline chrome & scoreboard on most broadcasts.
    this.roi = this._loadROI() || { x: 0.05, y: 0.10, w: 0.90, h: 0.75 };

    this.isScanning = false;
    this.scanProgress = 0;
    this.motionData = [];     // { time, motion, cut, audio }
    this.detectedPlays = [];

    this._offscreen = document.createElement('canvas');
    this._offCtx = this._offscreen.getContext('2d', { willReadFrequently: true });
    this._prevCellMotion = null;
    this._prevHist = null;
  }

  _loadROI() {
    try { return JSON.parse(localStorage.getItem('ffa_detect_roi')); } catch { return null; }
  }
  saveROI(roi) {
    this.roi = roi;
    localStorage.setItem('ffa_detect_roi', JSON.stringify(roi));
  }

  /**
   * Scan the current loaded video.
   */
  async scan(startTime = 0, endTime = null) {
    const video = this.vc.video || this.vc.videoElement;
    if (!video || !video.duration) throw new Error('No video loaded');

    const end = endTime || video.duration;
    const wasPlaying = !video.paused;
    const origTime = video.currentTime;
    const origRate = video.playbackRate;
    const origMuted = video.muted;

    this.isScanning = true;
    this.motionData = [];
    this._prevCellMotion = null;
    this._prevHist = null;

    // Downsample for speed
    const sampleW = 240;
    const sampleH = Math.round(sampleW * (video.videoHeight / video.videoWidth)) || 135;
    this._offscreen.width = sampleW;
    this._offscreen.height = sampleH;

    this._emit('scan-start', { duration: end - startTime });

    // Set up audio analyser if requested
    let audioCtx = null, analyser = null, audioData = null;
    if (this.useAudio) {
      try {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const src = audioCtx.createMediaElementSource(video);
        analyser = audioCtx.createAnalyser();
        analyser.fftSize = 1024;
        src.connect(analyser);
        // Route to a muted gain so audio never plays, but analyser still fires
        const gain = audioCtx.createGain();
        gain.gain.value = 0;
        analyser.connect(gain);
        gain.connect(audioCtx.destination);
        audioData = new Uint8Array(analyser.frequencyBinCount);
      } catch (e) {
        // MediaElementSource can only be created once per video; fail silently
        audioCtx = null;
        analyser = null;
      }
    }

    // Start playing video muted at fast rate
    video.muted = true;
    video.playbackRate = this.playbackRate;
    video.currentTime = startTime;
    try { await video.play(); } catch { /* autoplay block */ }

    // Sample via requestVideoFrameCallback (Chrome/Edge/Safari). Fallback to rAF.
    const useRVFC = typeof video.requestVideoFrameCallback === 'function';
    let lastSampleT = -1;
    const sampleStep = 0.15; // seconds between logical samples

    return new Promise((resolve) => {
      let finished = false;
      const finish = async () => {
        if (finished) return;
        finished = true;
        video.removeEventListener('ended', finish);
        // Restore video state
        try { video.pause(); } catch {}
        video.playbackRate = origRate;
        video.muted = origMuted;
        video.currentTime = origTime;
        if (audioCtx) try { await audioCtx.close(); } catch {}

        this.isScanning = false;
        this.scanProgress = 1;
        this.detectedPlays = this._detectPlaysFromSignal();

        // If the detector found nothing and the clip is short (≤ 45s),
        // it's almost certainly a pre-cut single play. Treat the whole
        // clip as one play so the analyzer still runs on it.
        const clipLen = end - startTime;
        if (this.detectedPlays.length === 0 && clipLen <= 45 && this.motionData.length >= 4) {
          const peakMotion = Math.max(...this.motionData.map(d => d.motion));
          this.detectedPlays.push({
            start: startTime,
            end: end,
            peak: peakMotion,
            confidence: 0.6,
          });
        }

        this._emit('scan-complete', {
          plays: this.detectedPlays,
          motionData: this.motionData,
        });
        resolve(this.detectedPlays);
      };

      const tick = (_now, metadata) => {
        if (!this.isScanning) return finish();
        const t = metadata ? metadata.mediaTime : video.currentTime;

        if (t >= end || video.ended) return finish();
        if (t - lastSampleT < sampleStep) {
          if (useRVFC) video.requestVideoFrameCallback(tick);
          else requestAnimationFrame(() => tick(performance.now(), null));
          return;
        }
        lastSampleT = t;

        // Capture frame
        this._offCtx.drawImage(video, 0, 0, sampleW, sampleH);
        const roi = this._roiRect(sampleW, sampleH);
        let motion = 0, cut = 0, cx = 0.5, cy = 0.5, spread = 0;
        try {
          const imageData = this._offCtx.getImageData(roi.x, roi.y, roi.w, roi.h);
          const sig = this._computeFrameSignal(imageData, roi.w, roi.h);
          motion = sig.motion;
          cut = sig.cut;
          cx = sig.cx;
          cy = sig.cy;
          spread = sig.spread;
        } catch {}

        // Audio level
        let audio = 0;
        if (analyser && audioData) {
          analyser.getByteFrequencyData(audioData);
          // Focus on 1-4 kHz band (whistle + voices + crowd roar)
          const binHz = audioCtx.sampleRate / 2 / audioData.length;
          const lo = Math.floor(1000 / binHz);
          const hi = Math.floor(4000 / binHz);
          let sum = 0;
          for (let i = lo; i < hi && i < audioData.length; i++) sum += audioData[i];
          audio = sum / ((hi - lo) * 255);
        }

        this.motionData.push({ time: t, motion, cut, audio, cx, cy, spread });

        this.scanProgress = (t - startTime) / (end - startTime);
        this._emit('scan-progress', { progress: this.scanProgress, time: t, motion });

        if (useRVFC) video.requestVideoFrameCallback(tick);
        else requestAnimationFrame(() => tick(performance.now(), null));
      };

      // Safety net: requestVideoFrameCallback stops firing when the
      // video ends (no new frames), so tick() never runs the finish
      // check. Listen for 'ended' directly to guarantee we complete.
      video.addEventListener('ended', finish);

      if (useRVFC) video.requestVideoFrameCallback(tick);
      else requestAnimationFrame(() => tick(performance.now(), null));
    });
  }

  cancelScan() { this.isScanning = false; }

  /**
   * Per-frame feature extraction: grid motion + scene cut.
   */
  _computeFrameSignal(imageData, w, h) {
    const data = imageData.data;
    const cols = this.gridCols, rows = this.gridRows;
    const cellW = Math.floor(w / cols);
    const cellH = Math.floor(h / rows);
    const cellLum = new Float32Array(cols * rows);
    const hist = new Uint32Array(16);

    // Compute per-cell luminance AND global histogram in one pass
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const lum = data[i] * 0.299 + data[i + 1] * 0.587 + data[i + 2] * 0.114;
        const cx = Math.min(cols - 1, Math.floor(x / cellW));
        const cy = Math.min(rows - 1, Math.floor(y / cellH));
        cellLum[cy * cols + cx] += lum;
        hist[Math.min(15, lum >> 4)]++;
      }
    }

    // Normalize cells by area
    const cellArea = cellW * cellH;
    for (let i = 0; i < cellLum.length; i++) cellLum[i] /= cellArea;

    let motion = 0;
    let centroidX = 0.5, centroidY = 0.5, spread = 0;
    if (this._prevCellMotion) {
      // Per-cell delta
      const deltas = new Float32Array(cellLum.length);
      let sum = 0, max = 0;
      for (let i = 0; i < cellLum.length; i++) {
        const d = Math.abs(cellLum[i] - this._prevCellMotion[i]);
        deltas[i] = d;
        sum += d;
        if (d > max) max = d;
      }
      const mean = sum / deltas.length;

      // Variance of cell deltas — low variance means all cells moved the same
      // (camera pan). High variance means localized motion (actual play).
      let variance = 0;
      for (let i = 0; i < deltas.length; i++) {
        const diff = deltas[i] - mean;
        variance += diff * diff;
      }
      variance /= deltas.length;
      const stddev = Math.sqrt(variance);

      // Motion score: use sum but dampen if the motion is too uniform (pan).
      // uniformityRatio close to 1 means pan; close to 0 means localized.
      const uniformityRatio = mean > 0 ? Math.max(0, 1 - stddev / mean) : 0;
      const panPenalty = uniformityRatio > 0.6 ? (1 - uniformityRatio) : 1;

      motion = (sum / (255 * deltas.length)) * panPenalty;

      // Weighted motion centroid (in normalized ROI coords 0..1). Used by
      // ClipAnalyzer to classify run/pass/direction/yards.
      if (sum > 0) {
        let wx = 0, wy = 0;
        for (let cy2 = 0; cy2 < rows; cy2++) {
          for (let cx2 = 0; cx2 < cols; cx2++) {
            const d = deltas[cy2 * cols + cx2];
            const nx = (cx2 + 0.5) / cols;
            const ny = (cy2 + 0.5) / rows;
            wx += nx * d;
            wy += ny * d;
          }
        }
        centroidX = wx / sum;
        centroidY = wy / sum;

        // Spread = weighted avg distance of active cells from centroid.
        // Low spread = concentrated motion (run), high spread = fanned out (pass).
        let distSum = 0, distW = 0;
        for (let cy2 = 0; cy2 < rows; cy2++) {
          for (let cx2 = 0; cx2 < cols; cx2++) {
            const d = deltas[cy2 * cols + cx2];
            if (d <= mean) continue;
            const nx = (cx2 + 0.5) / cols;
            const ny = (cy2 + 0.5) / rows;
            const dx = nx - centroidX, dy = ny - centroidY;
            distSum += Math.sqrt(dx * dx + dy * dy) * d;
            distW += d;
          }
        }
        spread = distW > 0 ? distSum / distW : 0;
      }
    }
    this._prevCellMotion = cellLum;

    // Scene-cut via histogram chi-squared distance
    let cut = 0;
    if (this._prevHist) {
      let chi = 0;
      let totalNow = 0, totalPrev = 0;
      for (let i = 0; i < 16; i++) { totalNow += hist[i]; totalPrev += this._prevHist[i]; }
      if (totalNow > 0 && totalPrev > 0) {
        for (let i = 0; i < 16; i++) {
          const a = hist[i] / totalNow;
          const b = this._prevHist[i] / totalPrev;
          const d = a + b;
          if (d > 0) chi += ((a - b) * (a - b)) / d;
        }
        cut = chi;
      }
    }
    this._prevHist = hist;

    return { motion, cut, cx: centroidX, cy: centroidY, spread };
  }

  _roiRect(w, h) {
    return {
      x: Math.max(0, Math.floor(w * this.roi.x)),
      y: Math.max(0, Math.floor(h * this.roi.y)),
      w: Math.max(1, Math.floor(w * this.roi.w)),
      h: Math.max(1, Math.floor(h * this.roi.h)),
    };
  }

  /**
   * Analyze the multi-signal motion data to find plays.
   */
  _detectPlaysFromSignal() {
    const data = this.motionData;
    if (data.length < 10) return [];

    // 1. Fuse signals: combined score = motion + 0.5 * audio
    const raw = data.map(d => ({
      time: d.time,
      v: d.motion + (d.audio || 0) * 0.5,
      cut: d.cut,
    }));

    // 2. Smooth with 5-sample boxcar
    const smooth = this._boxcar(raw.map(r => r.v), 5);
    for (let i = 0; i < raw.length; i++) raw[i].s = smooth[i];

    // 3. Adaptive threshold from quietest 20% of samples
    const sorted = smooth.slice().sort((a, b) => a - b);
    const q20 = sorted[Math.floor(sorted.length * 0.2)];
    const q80 = sorted[Math.floor(sorted.length * 0.8)] || 1;
    const baseline = q20;
    const range = Math.max(0.001, q80 - baseline);
    const threshold = (baseline + range * 0.35) * this.strictness;

    // 4. Scene-cut threshold: top 2% of cut values
    const cutSorted = raw.map(r => r.cut).sort((a, b) => a - b);
    const cutThreshold = Math.max(0.15, cutSorted[Math.floor(cutSorted.length * 0.98)]);

    const cutTimes = raw.filter(r => r.cut > cutThreshold).map(r => r.time);

    // 5. Peak-finding: walk through smoothed signal, find bursts above threshold
    const plays = [];
    let start = null, peak = 0, peakTime = 0;
    for (let i = 0; i < raw.length; i++) {
      const v = raw[i].s;
      const t = raw[i].time;

      // If we hit a scene cut, end any in-progress play immediately
      const nearCut = cutTimes.some(ct => Math.abs(ct - t) < 0.3);

      if (start === null) {
        if (v > threshold) { start = t; peak = v; peakTime = t; }
      } else {
        if (v > peak) { peak = v; peakTime = t; }
        const elapsed = t - start;
        const endingDueToQuiet = v < threshold * 0.75 && elapsed > this.minPlayDuration * 0.5;
        const endingDueToCut = nearCut && elapsed > 1.0;
        const endingDueToMax = elapsed >= this.maxPlayDuration;

        if (endingDueToQuiet || endingDueToCut || endingDueToMax) {
          if (elapsed >= this.minPlayDuration && peak > threshold * 1.15) {
            // Refine boundaries: walk outward from peak to flanking low-motion points
            let sIdx = i;
            while (sIdx > 0 && raw[sIdx - 1].time > peakTime - 4 && raw[sIdx - 1].s > baseline + range * 0.15) sIdx--;
            let eIdx = i;
            while (eIdx < raw.length - 1 && raw[eIdx + 1].time < peakTime + this.maxPlayDuration && raw[eIdx + 1].s > baseline + range * 0.15) eIdx++;

            plays.push({
              start: Math.max(0, raw[sIdx].time - 0.3),
              end: raw[eIdx].time + 0.5,
              peak: peak,
              confidence: Math.min(1, (peak - threshold) / (range * 0.5 + 0.001)),
            });
          }
          start = null;
          peak = 0;
          // cooldown — skip ahead
          const cdEnd = t + this.cooldownAfterEnd;
          while (i < raw.length - 1 && raw[i + 1].time < cdEnd) i++;
        }
      }
    }

    // Deduplicate overlapping plays
    plays.sort((a, b) => a.start - b.start);
    const deduped = [];
    for (const p of plays) {
      const last = deduped[deduped.length - 1];
      if (last && p.start < last.end) {
        last.end = Math.max(last.end, p.end);
        last.peak = Math.max(last.peak, p.peak);
      } else {
        deduped.push(p);
      }
    }
    return deduped;
  }

  _boxcar(arr, w) {
    const half = Math.floor(w / 2);
    const out = new Float32Array(arr.length);
    for (let i = 0; i < arr.length; i++) {
      let s = 0, c = 0;
      for (let j = i - half; j <= i + half; j++) {
        if (j >= 0 && j < arr.length) { s += arr[j]; c++; }
      }
      out[i] = s / c;
    }
    return out;
  }

  /**
   * Apply accepted detections to the PlayTagger.
   */
  applyDetectedPlays(plays = null) {
    const list = plays || this.detectedPlays;
    let added = 0;
    for (const dp of list) {
      const overlaps = this.tagger.plays.some(p =>
        !p.clipId && p.timestamp && dp.start < p.timestamp.end && dp.end > p.timestamp.start
      );
      if (overlaps) continue;

      this.tagger.pendingStart = dp.start;
      const origTime = this.vc.currentTime;
      if (this.vc.videoElement) this.vc.videoElement.currentTime = dp.end;
      else if (this.vc.video) this.vc.video.currentTime = dp.end;
      this.tagger.markEnd();
      if (this.vc.videoElement) this.vc.videoElement.currentTime = origTime;
      else if (this.vc.video) this.vc.video.currentTime = origTime;
      added++;
    }
    this.tagger._updatePlaySelect?.();
    this.tagger._updateTimeline?.();
    this.tagger.updateScrubBarPlays?.();
    return added;
  }

  /**
   * Multi-clip scan. Designed for the "folder of plays" workflow where each
   * file already contains exactly one play: we find the action window inside
   * each clip and stamp a PlayTagger entry for it.
   *
   * For each clip we:
   *   1. switch the playlist to that clip (loads the file into the video)
   *   2. wait for metadata
   *   3. run a full single-clip scan
   *   4. take the most confident detection as "the play" and register it
   */
  async scanClips(playlistManager) {
    if (!playlistManager || !playlistManager.hasClips) throw new Error('No clips loaded');
    const clips = playlistManager.clips;
    const results = [];
    this._emit('scan-start', { duration: clips.length });

    const video = this.vc.videoElement || this.vc.video;
    const waitMeta = () => new Promise(resolve => {
      if (video.readyState >= 1 && video.duration) return resolve();
      const h = () => { video.removeEventListener('loadedmetadata', h); resolve(); };
      video.addEventListener('loadedmetadata', h);
    });

    for (let i = 0; i < clips.length; i++) {
      if (!this.isScanning && i > 0) break;
      const clip = clips[i];
      try {
        playlistManager.switchToClip(i);
        await waitMeta();
        // Small settle delay so play() in scan() doesn't race the src swap
        await new Promise(r => setTimeout(r, 120));

        // Reset per-clip histories
        this._prevCellMotion = null;
        this._prevHist = null;

        const plays = await this.scan();
        const top = plays.sort((a, b) => b.confidence - a.confidence)[0] || null;

        // Stamp the top detection as a play on this clip
        let added = 0;
        if (top) {
          this.tagger.pendingStart = top.start;
          const orig = video.currentTime;
          video.currentTime = top.end;
          this.tagger.markEnd();
          video.currentTime = orig;
          added = 1;
        }

        results.push({
          clipId: clip.id,
          clipName: clip.name,
          motionData: this.motionData.slice(),
          detected: plays,
          top,
          added,
        });

        this._emit('clip-scanned', {
          progress: (i + 1) / clips.length,
          clipName: clip.name,
          detected: plays.length,
          total: clips.length,
          index: i + 1,
        });
      } catch (e) {
        results.push({ clipId: clip.id, clipName: clip.name, motionData: [], detected: [], error: e.message });
      }
    }

    this.tagger._updatePlaySelect?.();
    this.tagger._updateTimeline?.();
    this.tagger.updateScrubBarPlays?.();
    this._emit('clips-scan-complete', { results });
    return results;
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
