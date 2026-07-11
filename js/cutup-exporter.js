/**
 * CutupExporter - Stitch filtered plays into a single downloadable video.
 *
 * Strategy: real-time MediaRecorder capture from a canvas that mirrors the
 * video element. For each play, seek to start, play through end, drawing
 * frames to the canvas via requestAnimationFrame. Audio is captured from
 * the video element via captureStream() and merged into the recording.
 *
 * Output is .webm (universally supported by browsers, MediaRecorder can't
 * reliably produce mp4). Recording is real-time, so a cut-up of 60 plays
 * averaging 8 seconds each takes ~8 minutes to render.
 *
 * UX:
 *   - Confirmation dialog shows count + estimated render time
 *   - Modal progress overlay with current play, count, progress bar, cancel
 *   - Title cards (optional) overlaid between plays showing play number + tags
 */
export class CutupExporter {
  constructor(videoController, playTagger, playFilter, playlistManager) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.filter = playFilter;
    this.playlist = playlistManager;

    this.recording = false;
    this.cancelled = false;
    this.recorder = null;
    this.showTitleCards = true;

    this.btn = document.getElementById('btnExportCutup');
    if (this.btn) this.btn.addEventListener('click', () => this.export());
  }

  async export() {
    if (this.recording) return;

    // A cut-up can only stitch plays with a real, playable region. The old
    // `p.tags.playType || p.timestamp` was always true (every play has a
    // timestamp OBJECT), so untagged / zero-length plays were exported and a
    // zero-length region later stalled the recorder. Require end > start.
    let plays = this.tagger.plays.filter(p =>
      p.timestamp && (p.timestamp.end - p.timestamp.start) > 0.05);
    if (this.filter && this.filter.active) {
      plays = this.filter.filter(plays);
    }

    if (!plays.length) {
      alert('No plays available to export. Tag some plays or adjust your filters.');
      return;
    }

    // Clamp each play's duration for the ESTIMATE only: a failed duration probe
    // can leave end at a sentinel (~999s), which otherwise inflates the quoted
    // render time to hours. The record loop itself is bounded by video.ended.
    const totalSec = plays.reduce((s, p) => s + Math.min(p.timestamp.end - p.timestamp.start, 120), 0);
    const titleSec = this.showTitleCards ? plays.length * 1.0 : 0;
    const estTotal = totalSec + titleSec;
    const m = Math.floor(estTotal / 60);
    const s = Math.round(estTotal % 60);
    const filterNote = (this.filter && this.filter.active) ? ' (filtered)' : '';

    if (!confirm(
      `Export ${plays.length} plays${filterNote} as a cut-up video?\n\n` +
      `Estimated render time: ${m}:${s.toString().padStart(2, '0')} (real-time recording)\n` +
      `Output: WebM video (~${Math.round(estTotal * 1.5)} MB)\n\n` +
      `The video will play through automatically. You can cancel anytime.`
    )) return;

    this.recording = true;
    this.cancelled = false;

    try {
      await this._record(plays);
    } catch (e) {
      alert('Cut-up failed: ' + e.message);
      console.error(e);
    } finally {
      this.recording = false;
    }
  }

  async _record(plays) {
    const video = this.vc.videoElement;
    if (!video.videoWidth) {
      throw new Error('No video loaded');
    }

    // Setup canvas at video resolution
    const W = video.videoWidth;
    const H = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    // Build composite stream: canvas video + video element audio
    const videoStream = canvas.captureStream(30);
    try {
      const vs = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
      if (vs) {
        vs.getAudioTracks().forEach(t => videoStream.addTrack(t));
      }
    } catch (e) {
      console.warn('Audio capture unavailable:', e);
    }

    // Pick best supported mime type
    const mimeOptions = [
      'video/webm;codecs=vp9,opus',
      'video/webm;codecs=vp8,opus',
      'video/webm'
    ];
    const mimeType = mimeOptions.find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';

    this.recorder = new MediaRecorder(videoStream, { mimeType, videoBitsPerSecond: 4_000_000 });
    const chunks = [];
    this.recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
    const recordingDone = new Promise(resolve => { this.recorder.onstop = resolve; });

    this.recorder.start();

    const progress = this._showProgress(plays.length, () => {
      this.cancelled = true;
    });

    // rAF draw loop
    let drawing = true;
    const drawFrame = () => {
      if (!drawing) return;
      ctx.drawImage(video, 0, 0, W, H);
      requestAnimationFrame(drawFrame);
    };
    drawFrame();

    try {
      for (let i = 0; i < plays.length; i++) {
        if (this.cancelled) break;
        const p = plays[i];
        progress.update(i, plays.length, p);

        // Switch clip if multi-clip mode
        if (p.clipId && this.playlist && this.playlist.hasClips) {
          this.playlist.switchToClipByPlayId(p.id);
          await this._waitForReady(video);
        }

        // Title card
        if (this.showTitleCards) {
          drawing = false;
          await this._drawTitleCard(ctx, W, H, p, i + 1, plays.length);
          await this._sleep(1000);
          drawing = true;
          drawFrame();
        }

        video.currentTime = p.timestamp.start;
        await this._waitForSeek(video, p.timestamp.start);
        video.muted = false;
        try { await video.play(); } catch (e) { /* user gesture issue */ }

        await this._waitUntil(() =>
          this.cancelled || video.currentTime >= p.timestamp.end || video.ended
        );
        video.pause();
      }
    } finally {
      drawing = false;
      // Allow last frames to flush
      await this._sleep(200);
      if (this.recorder.state !== 'inactive') this.recorder.stop();
      await recordingDone;
      progress.remove();
    }

    if (this.cancelled) {
      if (!confirm('Cut-up cancelled. Save partial video anyway?')) return;
    }

    const blob = new Blob(chunks, { type: mimeType });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const fname = `cutup_${stamp}.webm`;
    window.ffaSaveBlob(blob, fname);
  }

  async _drawTitleCard(ctx, W, H, p, n, total) {
    ctx.fillStyle = '#0a0a14';
    ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = '#06b6d4';
    ctx.fillRect(0, H - 6, W, 6);

    ctx.fillStyle = '#fff';
    ctx.textAlign = 'center';
    ctx.font = `bold ${Math.round(H * 0.12)}px sans-serif`;
    ctx.fillText(`Play ${n} / ${total}`, W / 2, H * 0.35);

    ctx.font = `${Math.round(H * 0.05)}px sans-serif`;
    ctx.fillStyle = '#aaa';
    const t = p.tags || {};
    const lines = [];
    if (t.quarter) lines.push(t.quarter);
    if (t.down) lines.push(`${t.down}${this._suffix(t.down)} & ${t.distance || '?'}`);
    if (t.formation) lines.push(t.formation);
    if (t.playType) lines.push(t.playType);
    if (t.result) lines.push(`${t.result}${t.yardage ? ' (' + t.yardage + ' yds)' : ''}`);

    let y = H * 0.5;
    for (const line of lines) {
      ctx.fillText(line, W / 2, y);
      y += H * 0.07;
    }

    ctx.textAlign = 'left';
  }

  _suffix(d) {
    return ({ '1': 'st', '2': 'nd', '3': 'rd', '4': 'th' })[d] || '';
  }

  _waitForSeek(video, target) {
    return new Promise(resolve => {
      // A seek to the position the video is ALREADY at fires no 'seeked' event,
      // so waiting for one hangs the whole export forever (classically start:0
      // on a clip already at 0). Resolve immediately when we're there.
      if (typeof target === 'number' && Math.abs(video.currentTime - target) < 0.05) { resolve(); return; }
      let done = false;
      const finish = () => { if (done) return; done = true; video.removeEventListener('seeked', h); clearTimeout(timer); resolve(); };
      const h = () => finish();
      video.addEventListener('seeked', h);
      // Never hang if 'seeked' never arrives (stall / codec / no-op seek).
      const timer = setTimeout(finish, 3000);
    });
  }

  _waitForReady(video) {
    return new Promise(resolve => {
      if (video.readyState >= 2) return resolve();
      // Never hang the whole export if 'loadeddata' never fires on a broken clip
      // mid-cut-up (matches _waitForSeek's timeout guard).
      let done = false;
      const finish = () => { if (done) return; done = true; video.removeEventListener('loadeddata', h); clearTimeout(timer); resolve(); };
      const h = () => finish();
      video.addEventListener('loadeddata', h);
      const timer = setTimeout(finish, 5000);
    });
  }

  _waitUntil(cond) {
    return new Promise(resolve => {
      const check = () => cond() ? resolve() : requestAnimationFrame(check);
      check();
    });
  }

  _sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  }

  _showProgress(total, onCancel) {
    const div = document.createElement('div');
    div.className = 'cutup-progress-overlay';
    div.innerHTML = `
      <div class="cutup-modal">
        <h3>Recording Cut-Up</h3>
        <div class="cutup-info" id="cutupInfo">Starting…</div>
        <div class="cutup-bar"><div class="cutup-bar-fill" id="cutupBarFill"></div></div>
        <div class="cutup-hint">Recording in real time. Do not close this tab.</div>
        <button class="btn btn-sm btn-danger" id="cutupCancel">Cancel</button>
      </div>
    `;
    document.body.appendChild(div);
    const info = div.querySelector('#cutupInfo');
    const fill = div.querySelector('#cutupBarFill');
    div.querySelector('#cutupCancel').addEventListener('click', () => {
      onCancel();
    });
    return {
      update: (i, n, p) => {
        const tags = p.tags || {};
        const desc = [tags.playType, tags.result].filter(Boolean).join(' · ') || `Play ${p.id}`;
        info.textContent = `${i + 1} / ${n} — ${desc}`;
        fill.style.width = ((i / n) * 100) + '%';
      },
      remove: () => div.remove()
    };
  }
}
