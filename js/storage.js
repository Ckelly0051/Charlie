/**
 * StorageManager - Handles save/load/export for projects.
 */
export class StorageManager {
  constructor(videoController, playTagger, canvasOverlay) {
    this.vc = videoController;
    this.tagger = playTagger;
    this.canvas = canvasOverlay;

    this.autoSaveTimer = null;
    this.videoFileName = null;

    this.btnSave = document.getElementById('btnSave');
    this.btnLoad = document.getElementById('btnLoad');
    this.projectFileInput = document.getElementById('projectFileInput');
    this.btnExportPng = document.getElementById('btnExportPng');
    this.btnExportCsv = document.getElementById('btnExportCsv');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnSave.addEventListener('click', () => this.saveProject());

    this.btnLoad.addEventListener('click', () => {
      this.projectFileInput.click();
    });

    this.projectFileInput.addEventListener('change', (e) => {
      if (e.target.files[0]) this.loadProject(e.target.files[0]);
    });

    this.btnExportPng.addEventListener('click', () => this.exportPng());
    this.btnExportCsv.addEventListener('click', () => this.exportCsv());

    // Track video file name for auto-save key
    this.vc.on('file-loaded', (data) => {
      this.videoFileName = data.name;
      this._tryAutoRestore();
    });
  }

  enableAutoSave() {
    // Called from app.js after everything is wired up
    this.tagger.on('play-created', () => this._autoSave());
    this.tagger.on('play-updated', () => this._autoSave());
    this.tagger.on('play-deleted', () => this._autoSave());
    this.canvas.on('annotations-changed', () => this._autoSave());
    this.canvas.on('annotation-added', () => this._autoSave());
  }

  _autoSave() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = setTimeout(() => {
      if (!this.videoFileName) return;
      const data = this._serialize();
      try {
        localStorage.setItem('ffa_' + this.videoFileName, JSON.stringify(data));
      } catch (e) {
        // localStorage full — silently fail
      }
    }, 1000);
  }

  _tryAutoRestore() {
    if (!this.videoFileName) return;
    try {
      const saved = localStorage.getItem('ffa_' + this.videoFileName);
      if (saved) {
        const ok = confirm('Previous session found for this video. Restore it?');
        if (ok) {
          this._deserialize(JSON.parse(saved));
        }
      }
    } catch (e) {
      // Ignore parse errors
    }
  }

  _serialize() {
    return {
      version: 1,
      videoFileName: this.videoFileName,
      plays: this.tagger.plays,
      annotations: this.canvas.annotations,
      currentPlayId: this.tagger.currentPlayId,
      nextId: this.tagger.nextId,
    };
  }

  _deserialize(data) {
    if (!data) return;
    this.tagger.plays = data.plays || [];
    this.tagger.nextId = data.nextId || (this.tagger.plays.length + 1);
    this.canvas.annotations = data.annotations || [];

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this.tagger.updateScrubBarPlays();

    if (data.currentPlayId) {
      this.tagger.selectPlay(data.currentPlayId);
    }

    this.canvas.render();
  }

  saveProject() {
    const data = this._serialize();
    const json = JSON.stringify(data, null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    const name = (this.videoFileName || 'project').replace(/\.[^.]+$/, '') + '_analysis.json';
    this._download(blob, name);
  }

  loadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);
        this._deserialize(data);
      } catch (err) {
        alert('Invalid project file.');
      }
    };
    reader.readAsText(file);
  }

  exportPng() {
    const video = this.vc.videoElement;
    if (!video.videoWidth) {
      alert('No video loaded.');
      return;
    }

    // Create offscreen canvas at video resolution
    const offscreen = document.createElement('canvas');
    offscreen.width = video.videoWidth;
    offscreen.height = video.videoHeight;
    const ctx = offscreen.getContext('2d');

    // Draw video frame
    ctx.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);

    // Draw annotations on top (scale from normalized to video resolution)
    const currentTime = this.vc.currentTime;
    const frameDur = 1 / (parseInt(this.vc.fpsInput?.value) || 30);

    for (const a of this.canvas.annotations) {
      if (Math.abs(a.timestamp - currentTime) <= frameDur / 2) {
        this.canvas._renderAnnotation(ctx, a, video.videoWidth, video.videoHeight);
      }
    }

    offscreen.toBlob((blob) => {
      const time = this.vc.currentTime.toFixed(2).replace('.', 's');
      this._download(blob, `frame_${time}.png`);
    }, 'image/png');
  }

  exportCsv() {
    if (this.tagger.plays.length === 0) {
      alert('No plays to export.');
      return;
    }

    const headers = [
      'Play #', 'Start', 'End', 'Down', 'Distance', 'Formation',
      'Play Type', 'Def Front', 'Coverage', 'Blitz', 'Result',
      'Yardage', 'Hash', 'Custom Tags', 'Notes'
    ];

    const rows = this.tagger.plays.map(p => [
      p.id,
      p.timestamp.start.toFixed(2),
      p.timestamp.end.toFixed(2),
      p.tags.down,
      p.tags.distance,
      p.tags.formation,
      p.tags.playType,
      p.tags.defFront,
      p.tags.coverage,
      p.tags.blitz,
      p.tags.result,
      p.tags.yardage,
      p.tags.hash,
      (p.tags.custom || []).join('; '),
      (p.notes || '').replace(/"/g, '""')
    ]);

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const name = (this.videoFileName || 'plays').replace(/\.[^.]+$/, '') + '_plays.csv';
    this._download(blob, name);
  }

  _download(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
