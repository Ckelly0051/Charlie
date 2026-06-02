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
    this.gameInfo = {};
    this.filter = null;

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

    // Playlist reference (set by app.js after construction)
    this.playlist = null;
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
    // Strip non-serializable File references from plays before saving
    const plays = this.tagger.plays.map(p => {
      const copy = { ...p, tags: { ...p.tags } };
      return copy;
    });

    return {
      version: 4,
      videoFileName: this.videoFileName,
      gameInfo: this.gameInfo,
      roster: (window.app && window.app.roster) ? window.app.roster.toJSON() : [],
      plays: plays,
      annotations: this.canvas.annotations,
      currentPlayId: this.tagger.currentPlayId,
      nextId: this.tagger.nextId,
      clipNames: this.playlist ? this.playlist.clips.map(c => c.name) : [],
      isMultiClip: this.playlist ? this.playlist.hasClips : false,
    };
  }

  _deserialize(data) {
    if (!data) return;
    this.tagger.plays = data.plays || [];
    this.tagger.nextId = data.nextId || (this.tagger.plays.length + 1);
    this.canvas.annotations = data.annotations || [];

    if (data.gameInfo) {
      this.gameInfo = data.gameInfo;
      if (window.app && window.app._loadGameInfo) {
        window.app._loadGameInfo(data.gameInfo);
      }
    }

    if (data.roster && window.app && window.app.roster) {
      window.app.roster.loadFrom(data.roster);
    }

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
      'Play #', 'Clip', 'Start', 'End', 'Quarter', 'Drive', 'Down', 'Distance',
      'Field Side', 'Yard Line', 'Formation', 'Personnel',
      'Play Type', 'Def Front', 'Coverage', 'Blitz', 'Result',
      'Yardage', 'Hash', 'Ball Carrier', 'Passer', 'Receiver', 'Tackler',
      'BC Grade', 'Passer Grade', 'Receiver Grade', 'Tackler Grade',
      'Custom Tags', 'Notes'
    ];

    const rows = this.tagger.plays.map(p => [
      p.id,
      p.clipName || '',
      p.timestamp.start.toFixed(2),
      p.timestamp.end.toFixed(2),
      p.tags.quarter || '',
      p.tags.driveNumber || '',
      p.tags.down,
      p.tags.distance,
      p.tags.fieldSide || '',
      p.tags.yardLine || '',
      p.tags.formation,
      p.tags.personnel || '',
      p.tags.playType,
      p.tags.defFront,
      p.tags.coverage,
      p.tags.blitz,
      p.tags.result,
      p.tags.yardage,
      p.tags.hash,
      p.tags.players?.ballCarrier || '',
      p.tags.players?.passer || '',
      p.tags.players?.receiver || '',
      p.tags.players?.tackler || '',
      p.tags.grades?.ballCarrier ?? '',
      p.tags.grades?.passer ?? '',
      p.tags.grades?.receiver ?? '',
      p.tags.grades?.tackler ?? '',
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

  exportHtmlReport(statsEngine) {
    if (!statsEngine) return;
    const stats = statsEngine.compute();
    const title = statsEngine._gameTitle ? statsEngine._gameTitle().replace(/<[^>]+>/g, '') : 'Game Report';

    // Reuse existing render methods
    const body = [
      statsEngine._renderTeamStats(stats),
      statsEngine._renderEfficiency(stats),
      statsEngine._renderDownAnalysis(stats),
      statsEngine._renderSituational(stats),
      statsEngine._renderDrives(stats),
      statsEngine._renderTendencies(stats),
      statsEngine._renderPersonnel(stats),
      statsEngine._renderBigPlays(stats),
      statsEngine._renderIndividualStats(stats)
    ].join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:-apple-system,sans-serif;background:#fff;color:#222;max-width:1100px;margin:24px auto;padding:0 20px}
h1{border-bottom:3px solid #06b6d4;padding-bottom:8px}
h3{color:#06b6d4;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:13px}
th{background:#06b6d4;color:#fff}
tr:nth-child(even){background:#f4f4f8}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.stat-card{border:1px solid #ddd;padding:12px;border-radius:6px;background:#f9f9fb}
.stat-card-title{font-size:11px;text-transform:uppercase;color:#666}
.stat-card-value{font-size:22px;font-weight:bold;color:#06b6d4}
.stats-two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.stats-section{margin:18px 0}
.tendency-bar{display:flex;height:24px;border-radius:4px;overflow:hidden;margin:8px 0}
.tendency-run{background:#44aa44;color:#fff;text-align:center;line-height:24px;font-size:12px}
.tendency-pass{background:#4488cc;color:#fff;text-align:center;line-height:24px;font-size:12px}
.success-rate-bar{height:14px;background:#eee;border-radius:7px;overflow:hidden;margin:8px 0}
.drive-row{display:flex;align-items:center;gap:8px;padding:4px 0;font-size:13px}
.drive-bar{background:#eee !important}
@media print{body{max-width:none}}
</style></head><body>
<h1>${title}</h1>
<p style="color:#666">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
${body}
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const name = (this.videoFileName || 'game').replace(/\.[^.]+$/, '') + '_report.html';
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

  importPlaysFromText(text) {
    if (!text || !text.trim()) return { count: 0, error: 'No data' };
    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length < 2) return { count: 0, error: 'Need at least a header row and one data row' };

    // Detect delimiter
    const firstLine = lines[0];
    let delim = ',';
    if (firstLine.split('\t').length > firstLine.split(',').length) delim = '\t';
    else if (firstLine.split(';').length > firstLine.split(',').length) delim = ';';

    const parseLine = (line) => {
      const result = [];
      let current = '';
      let inQuotes = false;
      for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') { inQuotes = !inQuotes; continue; }
        if (ch === delim && !inQuotes) { result.push(current.trim()); current = ''; continue; }
        current += ch;
      }
      result.push(current.trim());
      return result;
    };

    const headers = parseLine(lines[0]).map(h => h.toLowerCase().replace(/[^a-z0-9]/g, ''));

    // Map headers to our tag field names
    const colMap = {};
    const aliases = {
      playtype: 'playType', type: 'playType', odk: 'playType',
      result: 'result', gnls: 'yardage', yardage: 'yardage', yards: 'yardage', yds: 'yardage',
      down: 'down', dn: 'down',
      distance: 'distance', dist: 'distance', togo: 'distance',
      formation: 'formation', form: 'formation', offform: 'formation', offenseformation: 'formation',
      personnel: 'personnel', pers: 'personnel', offpers: 'personnel',
      hash: 'hash', hashmark: 'hash',
      deffront: 'defFront', front: 'defFront', defenseformation: 'defFront', defform: 'defFront',
      coverage: 'coverage', cov: 'coverage',
      blitz: 'blitz',
      quarter: 'quarter', qtr: 'quarter', period: 'quarter',
      yardline: 'yardLine', ydln: 'yardLine', ydline: 'yardLine',
      fieldside: 'fieldSide', side: 'fieldSide',
      drivenumber: 'driveNumber', drive: 'driveNumber',
      ballcarrier: 'ballCarrier', bc: 'ballCarrier', carrier: 'ballCarrier',
      passer: 'passer', qb: 'passer',
      receiver: 'receiver', rec: 'receiver',
      tackler: 'tackler',
      notes: 'notes', note: 'notes',
    };

    headers.forEach((h, i) => {
      if (aliases[h]) colMap[i] = aliases[h];
    });

    return { headers: parseLine(lines[0]), colMap, lines: lines.slice(1).map(parseLine), delim };
  }

  applyPlayImport(parsed) {
    if (!parsed || !parsed.lines) return 0;
    const { colMap, lines } = parsed;
    let count = 0;

    const playerFields = ['ballCarrier', 'passer', 'receiver', 'tackler'];

    for (const cells of lines) {
      if (cells.every(c => !c)) continue;

      const tags = {
        down: '', distance: '', formation: '', playType: '',
        defFront: '', coverage: '', blitz: '', result: '',
        yardage: '', hash: '', quarter: '', yardLine: '',
        fieldSide: 'own', personnel: '', driveNumber: '',
        players: {}, custom: []
      };
      let notes = '';

      for (const [colIdx, field] of Object.entries(colMap)) {
        const val = cells[parseInt(colIdx)] || '';
        if (!val) continue;
        if (field === 'notes') { notes = val; continue; }
        if (playerFields.includes(field)) {
          tags.players[field] = val;
          continue;
        }
        tags[field] = val;
      }

      // Skip rows with no useful data
      if (!tags.playType && !tags.result && !tags.yardage && !tags.down) continue;

      const play = {
        id: this.tagger.nextId++,
        timestamp: { start: 0, end: 0 },
        tags,
        annotations: [],
        notes
      };
      this.tagger.plays.push(play);
      count++;
    }

    if (count > 0) {
      this.tagger._updatePlaySelect();
      this.tagger._updateTimeline();
      this.tagger.updateScrubBarPlays();
      this.tagger._emit('play-created');
    }

    return count;
  }
}
