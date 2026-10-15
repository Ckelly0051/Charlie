/* Real-time canvas/MediaRecorder cut-up export with captured audio and optional title cards.
 * Produces WebM; recording takes approximately the reel's playback duration. */
import { TagProjection } from './tag-projection.js';

import { h, render } from 'preact';

export class CutupExporter {
  constructor(videoController, playTagger, playFilter, playlistManager, { saveBlob } = {}) {
    this.saveBlob = saveBlob;
    this.vc = videoController;
    this.tagger = playTagger;
    this.filter = playFilter;
    this.playlist = playlistManager;

    this.recording = false;
    this.cancelled = false;
    this.recorder = null;
    this.showTitleCards = true;

  }

  /** After a cancel, ask in the app whether to keep what was recorded. */
  _keepPartial() {
    return this.tagger._confirmDialog('Cut-up cancelled. Save partial video anyway?', 'Save partial video');
  }

  async export() {
    if (this.recording) return;

    // Only export plays with a playable region: end must exceed start.

    let plays = this.tagger.plays.filter(p =>
      p.timestamp && (p.timestamp.end - p.timestamp.start) > 0.05);
    if (this.filter && this.filter.active) {
      plays = this.filter.filter(plays);
    }

    if (!plays.length) {
      this.tagger.toast?.('No plays available to export. Tag some plays or adjust your filters.');
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

    // The in-app confirm: a native confirm() can be suppressed and return false.
    if (!await this.tagger._confirmDialog(
      `Export ${plays.length} plays${filterNote} as a cut-up video? ` +
      `Estimated render time ${m}:${s.toString().padStart(2, '0')} (real time), ` +
      `WebM about ${Math.round(estTotal * 1.5)} MB. The video plays through automatically; you can cancel anytime.`,
      'Export cut-up'
    )) return;

    this.recording = true;
    this.cancelled = false;

    try {
      await this._record(plays);
    } catch (e) {
      this.tagger.toast?.('Cut-up failed: ' + e.message);
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

    const W = video.videoWidth;
    const H = video.videoHeight;
    const canvas = document.createElement('canvas');
    canvas.width = W;
    canvas.height = H;
    const ctx = canvas.getContext('2d');

    const videoStream = canvas.captureStream(30);
    try {
      const vs = video.captureStream ? video.captureStream() : video.mozCaptureStream?.();
      if (vs) {
        vs.getAudioTracks().forEach(t => videoStream.addTrack(t));
      }
    } catch (e) {
      console.warn('Audio capture unavailable:', e);
    }

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

        if (p.clipId && this.playlist && this.playlist.hasClips) {
          this.playlist.switchToClipByPlayId(p.id);
          await this._waitForReady(video);
        }

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

    if (this.cancelled && !await this._keepPartial()) return;

    const blob = new Blob(chunks, { type: mimeType });
    const stamp = new Date().toISOString().slice(0, 16).replace(/[T:]/g, '-');
    const fname = `cutup_${stamp}.webm`;
    this.saveBlob(blob, fname);
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
    const look = TagProjection.lookLabel(t);
    if (look) lines.push(look);
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
    let info, fill;
    render(h('div', { class: 'cutup-modal' },
      h('h3', null, 'Recording Cut-Up'),
      h('div', { class: 'cutup-info', id: 'cutupInfo', ref: node => { info = node; } }, 'Starting…'),
      h('div', { class: 'cutup-bar' }, h('div', { class: 'cutup-bar-fill', id: 'cutupBarFill', ref: node => { fill = node; } })),
      h('div', { class: 'cutup-hint' }, 'Recording in real time. Do not close this tab.'),
      h('button', { class: 'btn btn-sm btn-danger', id: 'cutupCancel', onClick: onCancel }, 'Cancel')), div);
    document.body.appendChild(div);
    return {
      update: (i, n, p) => {
        const tags = p.tags || {};
        const desc = [tags.playType, tags.result].filter(Boolean).join(' · ') || `Play ${p.id}`;
        info.textContent = `${i + 1} / ${n} — ${desc}`;
        fill.style.width = ((i / n) * 100) + '%';
      },
      remove: () => { render(null, div); div.remove(); }
    };
  }
}
