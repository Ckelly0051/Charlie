import { SeasonStore } from './season-store.js';
import { DemoSeason } from './demo-season.js';

/**
 * StorageManager - Handles save/load/export for projects.
 *
 * The unit of work is a **season** (see season-store.js): one container holding
 * many games, autosaved in place to localStorage so the app no longer spawns a
 * file per game/save. StorageManager bridges the live tagger/canvas/gameInfo
 * state and the season store — committing the active game on every change and
 * loading a game's state when the coach switches games.
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
    this.seasonStore = new SeasonStore();

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

    // Track the video file name so the active game records which film it used.
    this.vc.on('file-loaded', (data) => {
      this.videoFileName = data.name;
      this._autoSave();
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
    this.autoSaveTimer = setTimeout(() => this._commitAndPersist(), 1000);
  }

  /** Write the live active-game state into the season and persist the season. */
  _commitAndPersist() {
    if (!this.seasonStore || !this.seasonStore.data) return;
    this.commitActive();
    this.seasonStore.persist();
    this._maybeSnapshot();   // throttled auto restore-point
  }

  /**
   * Create a restore point, but at most once every few minutes during active
   * tagging (explicit saves and risky ops pass force=true). Keeps the ring
   * meaningful without a snapshot per keystroke.
   */
  _maybeSnapshot(force, label) {
    const now = Date.now();
    if (!force && this._lastSnapAt && (now - this._lastSnapAt) < 180000) return;
    this._lastSnapAt = now;
    if (this.seasonStore) this.seasonStore.snapshot(label || 'Auto').catch(() => {});
  }

  // ---- Season orchestration (bridge tagger/canvas <-> season store) --------

  /**
   * Library-first startup: do NOT auto-load any season (that was the confusing
   * "data appears with no context" behavior). The app opens to the Season
   * Library; a season is loaded only when the coach explicitly opens or creates
   * one (openSeasonById / createSeason).
   */
  async initLibrary() {
    // Reconnect a previously-bound backup folder in the background (Chromium).
    if (this.seasonStore.restoreDiskBinding) this.seasonStore.restoreDiskBinding().catch(() => {});
  }

  /** List every season in the library (metas only). */
  listSeasons() { return this.seasonStore.listSeasons(); }

  /** Open an existing season and restore its active game into the app. */
  async openSeasonById(id) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    await this.seasonStore.openSeason(id);
    this._afterSeasonLoaded();
  }

  /** Create a new season ({name, team, year, level}) and open it. */
  async createSeason(meta) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    const rec = await this.seasonStore.createSeason(meta);
    this._afterSeasonLoaded();
    return rec;
  }

  /** Delete a season; clears the editor if it was the open one. */
  async deleteSeason(id) {
    const wasCurrent = this.seasonStore.currentSeasonId === id;
    const wasDemo = this.isDemoSeason(id);
    await this.seasonStore.deleteSeason(id);
    if (wasDemo) this._teardownDemo();
    if (wasCurrent) this._clearForNewGame();
  }

  // ---- Demo season (onboarding empty-state) --------------------------------

  /** The library id of the bundled demo season, if one has been created. */
  demoSeasonId() {
    try { return localStorage.getItem('ffa_demo_season_id') || ''; } catch (e) { return ''; }
  }
  isDemoSeason(id) { return !!id && id === this.demoSeasonId(); }

  /**
   * Load (or create) the explorable demo season. Fully non-destructive: the
   * demo carries an EMPTY roster, so the coach's real global roster is never
   * touched. Player names in the demo's stats come from a transient label
   * overlay (see _applySeasonLabels), not the roster.
   */
  async loadDemoSeason() {
    const existing = this.demoSeasonId();
    if (existing) {
      const lib = await this.listSeasons();
      const meta = lib.find(s => s.id === existing);
      // Reopen only if the season actually still has content — if the data was
      // evicted (localStorage quota) but the library entry survived, fall
      // through and regenerate instead of opening an empty "Demo".
      if (meta && (meta.plays || 0) > 0) { await this.openSeasonById(existing); return existing; }
      try { await this.seasonStore.deleteSeason(existing); } catch (e) {}   // clear stale husk
      try { localStorage.removeItem('ffa_demo_season_id'); } catch (e) {}
    }
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    const data = DemoSeason.build();
    let demoTeamId = '';
    try { demoTeamId = localStorage.getItem('ffa_active_team_id') || ''; } catch (e) {}
    const rec = await this.seasonStore.createSeason({
      name: data.seasonName, team: data.team, year: data.year, level: data.level,
      teamId: demoTeamId,   // the demo lives in the active team's hub
    });
    if (!rec) return null;
    data.id = rec.id;
    this.seasonStore.data = this.seasonStore._normalize(data);
    this.seasonStore.data.id = rec.id;
    this.seasonStore.persist();
    try { localStorage.setItem('ffa_demo_season_id', rec.id); } catch (e) {}
    this._afterSeasonLoaded();
    return rec.id;
  }

  /** Clear the demo flag (the demo never persisted anything else). */
  _teardownDemo() {
    try { localStorage.removeItem('ffa_demo_season_id'); } catch (e) {}
  }

  /**
   * Apply the demo's jersey→name overlay to the stats engine while the demo is
   * the active season; clear it for any real season (so demo names never leak
   * into real games). Uses a dedicated `_fixedLabels` field (not `_seasonLabels`,
   * which the Season Stats view nulls after rendering) so the names survive.
   */
  _applySeasonLabels() {
    const app = window.app;
    if (!app || !app.stats) return;
    app.stats._fixedLabels = this.isDemoSeason(this.seasonStore.currentSeasonId)
      ? DemoSeason.LABELS : null;
  }

  /** After a season becomes current: load its active game + refresh app UI. */
  _afterSeasonLoaded() {
    this._clearForNewGame();
    // _loadActiveGame already refreshes the season chip + games panel and resets
    // the finish hint, so only the season-level UI (history/versions) is left.
    this._loadActiveGame();
    const app = window.app;
    if (app) {
      if (app.history) app.history.init();
      if (app.versions) app.versions.renderList();
    }
  }

  /** Capture the live tagger/canvas/gameInfo state into the active game node. */
  commitActive() {
    if (!this.seasonStore || !this.seasonStore.data) return;
    this.seasonStore.updateActiveGame(this._serialize());
    const app = window.app;
    if (app && app.roster) this.seasonStore.data.roster = app.roster.toJSON();
    try {
      const prof = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {};
      // Only adopt a real identity — after "Switch team" the profile is empty,
      // and stamping {} here would strip the old season's saved team.
      if (prof.teamName) this.seasonStore.data.teamProfile = prof;
    } catch (e) {}
  }

  _loadActiveGame() {
    const g = this.seasonStore.activeGame();
    if (g) this._deserialize(g);
    this._applySeasonLabels();   // demo name overlay on / off for this season
    const app = window.app;
    if (app) {
      if (app._updateSeasonChip) app._updateSeasonChip();
      if (app._renderGamesPanel) app._renderGamesPanel();
      app._finishHintShown = false;
    }
    if (g) this._autoLoadFilm(g).catch(() => {});
  }

  async _autoLoadFilm(gameNode) {
    const backend = this.seasonStore.backend;
    if (!backend.supportsFilm || !backend.supportsFilm()) return;
    try {
      const filesOnDisk = await backend.listFilmFiles(gameNode.id);
      if (filesOnDisk.length === 0) return;

      if (gameNode.isMultiClip && gameNode.clipNames && gameNode.clipNames.length > 0) {
        const clips = [];
        for (const filename of filesOnDisk) {
          const url = await backend.filmUrl(gameNode.id, filename);
          if (url) clips.push({ name: filename, url });
        }
        if (clips.length > 0 && this.playlist) {
          await this.playlist.rehydrateFromDisk(clips, this.tagger.plays);
          if (this.tagger.currentPlayId) {
            this.playlist.switchToClipByPlayId(this.tagger.currentPlayId);
          }
          if (this.playlist.activeClipIndex === -1 && this.playlist.clips.length > 0) {
            this.playlist.switchToClip(0);
          }
        }
      } else if (gameNode.videoFileName) {
        const match = filesOnDisk.find(f => f === gameNode.videoFileName) || filesOnDisk[0];
        if (match) {
          const url = await backend.filmUrl(gameNode.id, match);
          if (url) this.vc.loadUrl(url, match);
        }
      }
    } catch (e) { /* film not available — coach can re-link manually */ }
  }

  async importFilm(files) {
    const backend = this.seasonStore.backend;
    if (!backend.supportsFilm || !backend.supportsFilm()) return;
    const game = this.seasonStore.activeGame();
    if (!game) return;
    try {
      await backend.importFilm(game.id, files, (done, total) => {
        const app = window.app;
        if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total);
      });
    } catch (e) {
      console.warn('Film import failed:', e);
    }
  }

  /** Tear down per-game UI before loading a different game. */
  _clearForNewGame() {
    try { if (this.vc && this.vc.unloadVideo) this.vc.unloadVideo(); } catch (e) {}
    try { if (this.playlist && this.playlist.reset) this.playlist.reset(); } catch (e) {}
    this.videoFileName = null;
    this.canvas.annotations = [];
    // The outgoing game's selection is meaningless in the next one — and play
    // ids restart per game, so a stale currentPlayId would silently highlight
    // an unrelated play if the incoming game has no saved selection.
    this.tagger.currentPlayId = null;
    if (window.app && window.app._clearGameInfoForm) window.app._clearGameInfoForm();
    this.tagger._emit('plays-loaded');   // Film Room grid: re-render + drop stale row selections
  }

  /** Switch which game is active, persisting the one we're leaving. */
  switchToGame(id) {
    if (!this.seasonStore.data || id === this.seasonStore.data.activeGameId) return;
    this.commitActive();
    if (!this.seasonStore.setActive(id)) return;
    this.seasonStore.persist();
    this._clearForNewGame();
    this._loadActiveGame();
  }

  /** Start a fresh blank game in the season and switch to it. */
  newGame() {
    this.commitActive();
    this.seasonStore.addGame();
    this.seasonStore.persist();
    this._clearForNewGame();
    this._loadActiveGame();
    return this.seasonStore.activeGame();
  }

  removeGame(id) {
    const wasActive = this.seasonStore.data && id === this.seasonStore.data.activeGameId;
    const backend = this.seasonStore.backend;
    if (backend.supportsFilm && backend.supportsFilm()) {
      backend.deleteFilm(id).catch(() => {});
    }
    this.seasonStore.removeGame(id);
    this.seasonStore.persist();
    if (wasActive) { this._clearForNewGame(); this._loadActiveGame(); }
  }

  /** Add a legacy single-game project object as a game and switch to it. */
  addGameFromData(parsed) {
    if (!parsed || !Array.isArray(parsed.plays)) return false;
    this.commitActive();
    const node = this.seasonStore.gameFromLegacy(parsed);
    // Importing into a still-empty game (e.g. the fresh-start blank) fills it
    // in place instead of leaving a stray empty "Game 1" behind.
    if (this.seasonStore.isEmptyActive()) this.seasonStore.updateActiveGame(node);
    else this.seasonStore.addGame(node);
    this.seasonStore.persist();
    this._clearForNewGame();
    this._loadActiveGame();
    return true;
  }

  setSeasonName(name) {
    if (!this.seasonStore.data) return;
    this.seasonStore.data.seasonName = name || '';
    this.seasonStore.persist();
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

    // Only adopt a project's roster when it actually has players. An empty
    // roster array would otherwise wipe the coach's persisted roster, which
    // is meant to carry forward across games.
    if (Array.isArray(data.roster) && data.roster.length && window.app && window.app.roster) {
      window.app.roster.loadFrom(data.roster);
    }

    this.tagger._updatePlaySelect();
    this.tagger._updateTimeline();
    this.tagger.updateScrubBarPlays();
    this.tagger._emit('plays-loaded');   // Film Room grid: re-render + drop stale row selections

    if (data.currentPlayId) {
      this.tagger.selectPlay(data.currentPlayId);
    }

    this.canvas.render();
  }

  /**
   * Explicit "Save Season". Commits the live game, persists canonically, and
   * makes a durable disk backup with a restore point. On the first save it
   * offers to bind a backup folder (Chromium); without disk support it falls
   * back to a downloaded file plus an in-app restore point.
   */
  async saveProject() {
    this.commitActive();
    this.seasonStore.persist();
    this._maybeSnapshot(true, 'Manual save');
    const st = this.seasonStore;
    if (st.supportsDisk() && !st.diskStatus().bound) {
      const bound = await st.bindDisk();         // prompt once for a backup folder
      if (!bound) st.downloadFile();             // declined → at least hand them a file
      return bound;
    }
    if (st.diskStatus().bound) return st.saveNow('Manual save');
    st.downloadFile();                           // Firefox/Safari: file + ring snapshot
    return true;
  }

  /** Bind (or re-bind) the durable backup folder. */
  async bindBackupFolder() {
    const ok = await this.seasonStore.bindDisk();
    return ok;
  }

  /** Restore a previous save; reloads the active game on success. */
  async restoreBackup(id) {
    const data = await this.seasonStore.restoreBackup(id);
    if (!data) return false;
    this._clearForNewGame();
    this._loadActiveGame();
    return true;
  }

  /**
   * Base filename for exports — prefers the user's Game / Project name (so saves
   * are labeled by game), then the video file name, then a generic fallback.
   */
  _projectFileBase() {
    const projectName = (this.gameInfo && this.gameInfo.projectName) || '';
    const raw = projectName || (this.videoFileName || 'project').replace(/\.[^.]+$/, '');
    // Filesystem-safe slug
    return raw.trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'project';
  }

  /**
   * Load a file picked via the fallback <input>. A season file (has `games`)
   * replaces the season; a legacy single-game file (has `plays`) is appended as
   * a new game so an old save is folded in rather than wiping the season.
   */
  loadProject(file) {
    const reader = new FileReader();
    reader.onload = (e) => {
      let parsed;
      try { parsed = JSON.parse(e.target.result); }
      catch (err) { alert('Invalid project file.'); return; }

      if (parsed && Array.isArray(parsed.games)) {
        this.seasonStore.adopt(parsed);
        this._clearForNewGame();
        this._loadActiveGame();
      } else if (parsed && Array.isArray(parsed.plays)) {
        this.addGameFromData(parsed);
      } else {
        alert('Invalid project file.');
        return;
      }
      if (window.app && window.app.season && window.app.season._renderAll) {
        window.app.season._renderAll();
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
      'Play #', 'Clip', 'Start', 'End', 'Unit', 'Quarter', 'Drive', 'Down', 'Distance',
      'Field Side', 'Yard Line', 'Formation', 'Personnel',
      'Run/Pass', 'Play Type', 'ST Type', 'Def Front', 'Coverage', 'Blitz', 'Result',
      'Yardage', 'Hash', 'Ball Carrier', 'Passer', 'Receiver', 'Tackler',
      'Kicker', 'Returner',
      'BC Grade', 'Passer Grade', 'Receiver Grade', 'Tackler Grade',
      'Custom Tags', 'Notes'
    ];

    const rows = this.tagger.plays.map(p => [
      p.id,
      p.clipName || '',
      p.timestamp.start.toFixed(2),
      p.timestamp.end.toFixed(2),
      p.tags.unit || '',
      p.tags.quarter || '',
      p.tags.driveNumber || '',
      p.tags.down,
      p.tags.distance,
      p.tags.fieldSide || '',
      p.tags.yardLine || '',
      p.tags.formation,
      p.tags.personnel || '',
      p.tags.runPass || '',
      p.tags.playType,
      p.tags.stType || '',
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
      p.tags.players?.kicker || '',
      p.tags.players?.returner || '',
      p.tags.grades?.ballCarrier ?? '',
      p.tags.grades?.passer ?? '',
      p.tags.grades?.receiver ?? '',
      p.tags.grades?.tackler ?? '',
      (p.tags.custom || []).join('; '),
      (p.notes || '').replace(/"/g, '""')
    ]);

    // Append any user-defined custom fields as extra columns.
    let cfDefs = [];
    try { cfDefs = JSON.parse(localStorage.getItem('ffa_custom_fields') || '[]') || []; } catch {}
    if (cfDefs.length) {
      cfDefs.forEach(d => headers.push(d.name));
      this.tagger.plays.forEach((p, i) => {
        const cf = (p.tags && p.tags.customFields) || {};
        cfDefs.forEach(d => rows[i].push(cf[d.id] || ''));
      });
    }

    const csv = [headers, ...rows]
      .map(row => row.map(cell => `"${cell}"`).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const name = this._projectFileBase() + '_plays.csv';
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
      runpass: 'runPass', rp: 'runPass', runorpass: 'runPass',
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
        down: '', distance: '', formation: '', playType: '', runPass: '',
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
