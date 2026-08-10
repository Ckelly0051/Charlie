/**
 * ScoreboardOCR - Read down/distance/quarter/score from a user-defined
 * scoreboard region of the video frame using Tesseract.js.
 *
 * Workflow:
 *   1. User clicks "Set Scoreboard Region" → drag a box over the on-screen
 *      scoreboard. Region is saved per-video in localStorage as normalized
 *      (0..1) coordinates so it works across resolutions.
 *   2. User clicks "Read Scoreboard" (or auto-read on play start). Current
 *      frame is captured, cropped to the region, OCR'd, parsed.
 *   3. Parsed values appear in a confirmation strip — accept to apply,
 *      reject to ignore. Manual override always available.
 *
 * Tesseract.js is loaded from CDN on first use only (~1MB).
 */
export class ScoreboardOCR {
  constructor(videoController, playTagger) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.listeners = {};

    this.region = null;        // {x,y,w,h} normalized 0..1
    this.tesseract = null;
    this.tesseractLoading = null;
    this.autoOnPlayEnd = false;

    this.btnSetRegion = document.getElementById('btnSetScoreboardRegion');
    this.btnReadNow = document.getElementById('btnReadScoreboard');
    this.btnAutoOcr = document.getElementById('btnAutoOcr');
    this.statusEl = document.getElementById('ocrStatus');
    this.previewEl = document.getElementById('ocrPreview');
    this.videoContainer = document.getElementById('videoContainer');

    this._bindEvents();
    this._loadRegion();

    // Auto-read when a play is created (if enabled)
    this.tagger.on('play-created', (p) => {
      if (this.autoOnPlayEnd && this.region) {
        // Defer slightly so the play form is loaded
        setTimeout(() => this.readNow(p), 200);
      }
    });
  }

  _bindEvents() {
    if (this.btnSetRegion) {
      this.btnSetRegion.addEventListener('click', () => this.startRegionSelect());
    }
    if (this.btnReadNow) {
      this.btnReadNow.addEventListener('click', () => this.readNow());
    }
    if (this.btnAutoOcr) {
      this.btnAutoOcr.addEventListener('change', () => this.setAutoOcr(this.btnAutoOcr.checked));
    }
  }

  /** Real setter — a native control can drive this directly. Mirrors into the
   *  optional legacy checkbox rather than depending on it. */
  setAutoOcr(value) {
    this.autoOnPlayEnd = !!value;
    if (this.btnAutoOcr) this.btnAutoOcr.checked = this.autoOnPlayEnd;
    return true;
  }

  _regionKey() {
    const name = this.vc.currentFile?.name || 'default';
    return 'ffa_ocr_region_' + name;
  }

  _loadRegion() {
    try {
      const saved = localStorage.getItem(this._regionKey());
      if (saved) {
        this.region = JSON.parse(saved);
        this._setStatus('Region loaded');
      }
    } catch (e) {}
  }

  _saveRegion() {
    try {
      localStorage.setItem(this._regionKey(), JSON.stringify(this.region));
    } catch (e) {}
  }

  startRegionSelect() {
    const video = this.vc.videoElement;
    if (!video.videoWidth) {
      this._setStatus('Load a video first');
      return;
    }
    this._setStatus('Drag a box around the scoreboard');

    // Build full-container overlay
    const overlay = document.createElement('div');
    overlay.className = 'ocr-region-overlay';
    overlay.style.cssText = 'position:absolute;inset:0;cursor:crosshair;background:rgba(0,0,0,0.35);z-index:50';
    const box = document.createElement('div');
    box.style.cssText = 'position:absolute;border:2px solid #06b6d4;background:rgba(6,182,212,0.18);pointer-events:none';
    overlay.appendChild(box);
    this.videoContainer.appendChild(overlay);

    let startX, startY, dragging = false;
    overlay.addEventListener('mousedown', (e) => {
      const r = overlay.getBoundingClientRect();
      startX = e.clientX - r.left;
      startY = e.clientY - r.top;
      dragging = true;
      box.style.left = startX + 'px';
      box.style.top = startY + 'px';
      box.style.width = '0';
      box.style.height = '0';
    });
    overlay.addEventListener('mousemove', (e) => {
      if (!dragging) return;
      const r = overlay.getBoundingClientRect();
      const x = e.clientX - r.left;
      const y = e.clientY - r.top;
      box.style.left = Math.min(startX, x) + 'px';
      box.style.top = Math.min(startY, y) + 'px';
      box.style.width = Math.abs(x - startX) + 'px';
      box.style.height = Math.abs(y - startY) + 'px';
    });
    overlay.addEventListener('mouseup', (e) => {
      if (!dragging) return;
      dragging = false;
      const r = overlay.getBoundingClientRect();
      const x1 = parseFloat(box.style.left);
      const y1 = parseFloat(box.style.top);
      const w = parseFloat(box.style.width);
      const h = parseFloat(box.style.height);
      if (w < 20 || h < 10) {
        this._setStatus('Region too small — try again');
      } else {
        this.region = {
          x: x1 / r.width,
          y: y1 / r.height,
          w: w / r.width,
          h: h / r.height
        };
        this._saveRegion();
        this._setStatus(`Region saved (${Math.round(w)}×${Math.round(h)}px)`);
      }
      overlay.remove();
    });
    overlay.addEventListener('contextmenu', (e) => {
      e.preventDefault();
      overlay.remove();
      this._setStatus('Region select cancelled');
    });
  }

  async _ensureTesseract() {
    if (this.tesseract) return this.tesseract;
    if (this.tesseractLoading) return this.tesseractLoading;

    this._setStatus('Loading OCR engine (~1MB)…');
    this.tesseractLoading = new Promise((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';
      script.onload = () => {
        this.tesseract = window.Tesseract;
        this._setStatus('OCR engine ready');
        resolve(this.tesseract);
      };
      script.onerror = () => {
        this._setStatus('Failed to load OCR engine — check connection');
        reject(new Error('Tesseract load failed'));
      };
      document.head.appendChild(script);
    });
    return this.tesseractLoading;
  }

  async readNow(targetPlay = null) {
    if (!this.region) {
      this._setStatus('Set scoreboard region first');
      return;
    }
    const video = this.vc.videoElement;
    if (!video.videoWidth) {
      this._setStatus('No video loaded');
      return;
    }

    try {
      await this._ensureTesseract();
    } catch (e) {
      return;
    }

    this._setStatus('Reading scoreboard…');

    // Crop frame to region
    const sx = Math.round(this.region.x * video.videoWidth);
    const sy = Math.round(this.region.y * video.videoHeight);
    const sw = Math.round(this.region.w * video.videoWidth);
    const sh = Math.round(this.region.h * video.videoHeight);

    const canvas = document.createElement('canvas');
    // Upscale 2x for better OCR on small text
    canvas.width = sw * 2;
    canvas.height = sh * 2;
    const ctx = canvas.getContext('2d');
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(video, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);

    // Quick contrast boost
    const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const d = imgData.data;
    for (let i = 0; i < d.length; i += 4) {
      const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
      const v = lum > 128 ? 255 : 0;
      d[i] = d[i + 1] = d[i + 2] = v;
    }
    ctx.putImageData(imgData, 0, 0);

    try {
      const result = await this.tesseract.recognize(canvas, 'eng');
      const text = result.data.text || '';
      const parsed = this._parse(text);
      this._showPreview(text, parsed, targetPlay);
    } catch (e) {
      this._setStatus('OCR error: ' + e.message);
    }
  }

  _parse(text) {
    const out = { raw: text };
    const upper = text.toUpperCase().replace(/[\n\r]+/g, ' ').replace(/\s+/g, ' ');

    // Down & distance: "1ST & 10", "3RD AND 7", "4 & GOAL", "2ND&5"
    const dd = upper.match(/(1ST|2ND|3RD|4TH|\b1|\b2|\b3|\b4)\s*(?:&|AND|\+)\s*(\d{1,2}|GOAL|G\b)/);
    if (dd) {
      const downMap = { '1ST': '1', '2ND': '2', '3RD': '3', '4TH': '4', '1': '1', '2': '2', '3': '3', '4': '4' };
      out.down = downMap[dd[1].trim()] || dd[1].trim();
      out.distance = (dd[2] === 'GOAL' || dd[2] === 'G') ? '0' : dd[2];
    }

    // Quarter: "Q1", "1ST QTR", "QTR 1", "1Q"
    const qm = upper.match(/\bQ\s*([1-4])\b|\b([1-4])(?:ST|ND|RD|TH)?\s*Q(?:TR|UARTER)?\b|\bQTR\s*([1-4])\b/);
    if (qm) {
      const q = qm[1] || qm[2] || qm[3];
      if (q) out.quarter = 'Q' + q;
    }
    if (/\bOT\b|OVERTIME/.test(upper)) out.quarter = 'OT';

    // Score: "21 - 14" or "21-14"
    const sm = upper.match(/\b(\d{1,2})\s*[-–]\s*(\d{1,2})\b/);
    if (sm) {
      out.scoreUs = sm[1];
      out.scoreThem = sm[2];
    }

    return out;
  }

  _showPreview(rawText, parsed, targetPlay) {
    if (!this.previewEl) return;
    const fields = [];
    if (parsed.down) fields.push(`Down: <b>${parsed.down}</b>`);
    if (parsed.distance) fields.push(`Dist: <b>${parsed.distance}</b>`);
    if (parsed.quarter) fields.push(`Qtr: <b>${parsed.quarter}</b>`);
    if (parsed.scoreUs && parsed.scoreThem) fields.push(`Score: <b>${parsed.scoreUs}-${parsed.scoreThem}</b>`);

    if (!fields.length) {
      this._setStatus('No usable values detected');
      this.previewEl.innerHTML = `<div class="ocr-raw">"${this._escape(rawText.trim().slice(0, 80))}"</div>`;
      return;
    }

    this.previewEl.innerHTML = `
      <div class="ocr-fields">${fields.join(' · ')}</div>
      <div class="ocr-actions">
        <button class="btn btn-sm btn-accent" id="btnApplyOcr">Apply</button>
        <button class="btn btn-sm" id="btnDismissOcr">Dismiss</button>
      </div>
    `;
    this.previewEl.querySelector('#btnApplyOcr').addEventListener('click', () => {
      this._apply(parsed, targetPlay);
      this.previewEl.innerHTML = '';
      this._setStatus('Applied');
    });
    this.previewEl.querySelector('#btnDismissOcr').addEventListener('click', () => {
      this.previewEl.innerHTML = '';
      this._setStatus('Dismissed');
    });
    this._setStatus('Review and apply');
  }

  _apply(parsed, targetPlay) {
    const play = targetPlay || this.tagger.getCurrentPlay();
    if (play) {
      if (parsed.down) play.tags.down = parsed.down;
      if (parsed.distance) play.tags.distance = parsed.distance;
      if (parsed.quarter) play.tags.quarter = parsed.quarter;
      this.tagger._loadTagForm(play);
      this.tagger._emit('play-updated', play);
    }
    if (parsed.scoreUs !== '' && parsed.scoreUs != null && parsed.scoreThem !== '' && parsed.scoreThem != null) {
      window.app?._setGameScore?.(parsed.scoreUs, parsed.scoreThem);
    }
  }

  _setStatus(msg) {
    if (this.statusEl) this.statusEl.textContent = msg;
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }
}
