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
    this._loadedGameId = null;   // which game the live tagger holds (guards commitActive vs cross-game writes)
    // Tell the coach when a save fails (browser storage full) instead of losing
    // work silently. window.app/updater resolve lazily — this fires rarely.
    this.seasonStore.onPersistError = () => {
      try { window.app.updater._toast('⚠ Save failed — browser storage may be full. Use "Save Season" to export a backup file before you lose work.'); } catch (e) {}
    };

    this.btnSave = document.getElementById('btnSave');
    this.btnLoad = document.getElementById('btnLoad');
    this.projectFileInput = document.getElementById('projectFileInput');
    this.btnExportPng = document.getElementById('btnExportPng');
    this.btnExportCsv = document.getElementById('btnExportCsv');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnSave.addEventListener('click', () => this.saveProject());
    // Mobile hides the top-bar Save; the More menu keeps a first-class one.
    document.getElementById('btnSaveMenu')?.addEventListener('click', () => this.saveProject());

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
    this._signalSave('pending');
    // Pin the season the edit belongs to. If the coach switches seasons before
    // the debounce fires, the backend pointer has moved — flushing then would
    // write THIS season's data into the OTHER season's slot (reproduced: a 1s
    // autosave firing during openSeason(B)'s awaited load stamped season A over
    // B's file). Transitions also cancel this timer; the pin is belt-and-braces.
    const sid = this.seasonStore ? this.seasonStore.currentSeasonId : null;
    this.autoSaveTimer = setTimeout(() => {
      if (this.seasonStore && this.seasonStore.currentSeasonId !== sid) return;
      this._commitAndPersist();
    }, 1000);
  }

  /** Surface save-state to the UI (App renders it on the top-bar Save button).
   *  States: 'pending' (a debounced save is armed) → 'saved' (persisted). */
  _signalSave(state) {
    try { if (this.onSaveState) this.onSaveState(state); } catch (e) {}
  }

  /** Cancel debounced writes armed for the CURRENT season (call before leaving it). */
  _cancelPendingSaves() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
    if (this.seasonStore && this.seasonStore.cancelPendingDiskWrite) this.seasonStore.cancelPendingDiskWrite();
  }

  /** Write the live active-game state into the season and persist the season. */
  _commitAndPersist() {
    if (!this.seasonStore || !this.seasonStore.data) return;
    this.commitActive();
    this.seasonStore.persist();
    this._maybeSnapshot();   // throttled auto restore-point
    this._signalSave('saved');
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
  async listSeasons() {
    const seasons = await this.seasonStore.listSeasons();
    this._lastSeasonMetas = seasons || [];
    this._reconcileDemoPointer(this._lastSeasonMetas);
    return seasons;
  }

  /** Open an existing season and restore its active game into the app. */
  async openSeasonById(id) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    this._cancelPendingSaves();   // a debounced save must never straddle the switch
    await this.seasonStore.openSeason(id);
    this._afterSeasonLoaded();
  }

  /** Create a new season ({name, team, year, level}) and open it. */
  async createSeason(meta) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    this._cancelPendingSaves();
    const rec = await this.seasonStore.createSeason(meta);
    this._afterSeasonLoaded();
    return rec;
  }

  /** Delete a season; clears the editor if it was the open one. */
  async deleteSeason(id) {
    const wasCurrent = this.seasonStore.currentSeasonId === id;
    const wasDemo = this.isDemoSeason(id);
    if (wasCurrent) this._cancelPendingSaves();
    await this.seasonStore.deleteSeason(id);
    if (wasDemo) this._teardownDemo();
    if (wasCurrent) this._clearForNewGame();
  }

  // ---- Demo season (onboarding empty-state) --------------------------------

  /** The library id of the bundled demo season, if one has been created. */
  demoSeasonId() {
    try { return localStorage.getItem('ffa_demo_season_id') || ''; } catch (e) { return ''; }
  }
  isDemoSeason(id) {
    if (!id) return false;
    const data = this.seasonStore && this.seasonStore.currentSeasonId === id ? this.seasonStore.data : null;
    if (this._isDemoData(data)) return true;
    const meta = (this._lastSeasonMetas || []).find(s => s.id === id);
    if (this._isDemoMeta(meta)) return true;
    const cached = this.demoSeasonId();
    if (cached === id && meta && !this._isDemoMeta(meta)) this._clearDemoPointer();
    return false;
  }

  _isDemoMeta(meta) {
    if (!meta) return false;
    if (meta.isDemo || meta.kind === 'demo') return true;
    return meta.name === DemoSeason.SEASON_NAME && meta.team === 'GridIron Demo';
  }

  _isDemoData(data) {
    if (!data) return false;
    if (data.isDemo || data.kind === 'demo') return true;
    const games = Array.isArray(data.games) ? data.games : [];
    return data.seasonName === DemoSeason.SEASON_NAME
      && data.team === 'GridIron Demo'
      && games.length > 0
      && games.every(g => String(g.id || '').startsWith('g_demo_'));
  }

  _clearDemoPointer() {
    try { localStorage.removeItem('ffa_demo_season_id'); } catch (e) {}
  }

  _setDemoPointer(id) {
    try { if (id) localStorage.setItem('ffa_demo_season_id', id); } catch (e) {}
  }

  _reconcileDemoPointer(seasons) {
    const list = seasons || [];
    const cached = this.demoSeasonId();
    const cachedMeta = cached ? list.find(s => s.id === cached) : null;
    if (cachedMeta) {
      if (this._isDemoMeta(cachedMeta)) return cached;
      this._clearDemoPointer();
    } else if (cached) {
      this._clearDemoPointer();
    }
    const demo = list.find(s => this._isDemoMeta(s));
    if (demo) {
      this._setDemoPointer(demo.id);
      return demo.id;
    }
    return '';
  }

  /**
   * Load (or create) the explorable demo season. Fully non-destructive: the
   * demo carries an EMPTY roster, so the coach's real global roster is never
   * touched. Player names in the demo's stats come from a transient label
   * overlay (see _applySeasonLabels), not the roster.
   */
  async loadDemoSeason() {
    const seasons = await this.listSeasons();
    const existing = this._reconcileDemoPointer(seasons);
    if (existing) {
      const meta = (this._lastSeasonMetas || []).find(s => s.id === existing);
      // Reopen only if the season actually still has content — if the data was
      // evicted (localStorage quota) but the library entry survived, fall
      // through and regenerate instead of opening an empty "Demo".
      if (meta && this._isDemoMeta(meta) && (meta.plays || 0) > 0) { await this.openSeasonById(existing); return existing; }
      try { await this.seasonStore.deleteSeason(existing); } catch (e) {}   // clear stale husk
      this._clearDemoPointer();
    }
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    const data = DemoSeason.build();
    let demoTeamId = '';
    try { demoTeamId = localStorage.getItem('ffa_active_team_id') || ''; } catch (e) {}
    const rec = await this.seasonStore.createSeason({
      name: data.seasonName, team: data.team, year: data.year, level: data.level,
      isDemo: true, kind: 'demo',
      teamId: demoTeamId,   // the demo lives in the active team's hub
    });
    if (!rec) return null;
    data.id = rec.id;
    this.seasonStore.data = this.seasonStore._normalize(data);
    this.seasonStore.data.id = rec.id;
    this.seasonStore.persist();
    this._setDemoPointer(rec.id);
    this._afterSeasonLoaded();
    return rec.id;
  }

  /** Clear the demo flag (the demo never persisted anything else). */
  _teardownDemo() {
    this._clearDemoPointer();
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
    // CRITICAL: only flush the live tagger into the game it was actually loaded
    // from. updateActiveGame() writes to whatever activeGameId points at, with no
    // check that the tagger belongs there — so if the pointer moved (restore /
    // mid game-switch) while the tagger still holds the previous game, a blind
    // commit stamps THIS game's plays onto ANOTHER game (the cross-game
    // corruption that put Lakers tags on the Lancers game). Mismatch, or nothing
    // loaded → skip the write entirely.
    if (this._loadedGameId == null || this._loadedGameId !== this.seasonStore.data.activeGameId) return;
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
    this._loadedGameId = g ? g.id : null;   // the tagger now holds THIS game; commitActive guards on it
    this._applySeasonLabels();   // demo name overlay on / off for this season
    const app = window.app;
    if (app) {
      // Undo/redo is per-GAME: reset the history on every game load (switch, new,
      // restore — not just season open) so an Undo after switching games can't
      // restore the PREVIOUS game's plays into this one. (Cross-game corruption
      // the integrity harness caught: switchToGame never re-init'd history.)
      if (app.history && app.history.reset) app.history.reset();
      if (app._updateSeasonChip) app._updateSeasonChip();
      if (app._renderGamesPanel) app._renderGamesPanel();
      app._finishHintShown = false;
    }
    if (g) this._autoLoadFilm(g).catch(() => {});
    this._maybeShowRelinkHint(g);
  }

  /**
   * Browser build only: film files aren't stored (too large), so reopening a
   * tagged game shows a dead player with no explanation — tell the coach
   * exactly what to re-add. Plays re-link automatically by clip name.
   */
  _maybeShowRelinkHint(g) {
    const backend = this.seasonStore && this.seasonStore.backend;
    if (!g || !backend || (backend.supportsFilm && backend.supportsFilm())) return;
    this._relinkToast(g);
  }

  /** Tell the coach exactly which file to re-add — never a silent dead player. */
  _relinkToast(g, savedNote) {
    if (!g || !(g.plays && g.plays.length)) return;
    const expectedCount = (g.clipRefs && g.clipRefs.length) || (g.clipPaths && g.clipPaths.length) || (g.clipNames && g.clipNames.length) || 0;
    const what = (g.isMultiClip && expectedCount)
      ? `the clip folder (${expectedCount} clips)`
      : g.videoFileName ? `"${g.videoFileName}"` : null;
    if (!what) return;
    this.tagger.toast?.(`Tags loaded — use Repair Film in Playlist to reconnect ${what}${savedNote ? ' and save it to the desktop library' : ''}.`);
  }

  async _autoLoadFilm(gameNode) {
    const backend = this.seasonStore.backend;
    if (!backend.supportsFilm || !backend.supportsFilm()) return;
    try {
      const filesOnDisk = await backend.listFilmFiles(gameNode.id);
      console.log('Film auto-load:', { gameId: gameNode.id, filesOnDisk, isMultiClip: gameNode.isMultiClip, videoFileName: gameNode.videoFileName });
      if (filesOnDisk.length === 0) { this._relinkToast(gameNode, true); return; }

      if (gameNode.isMultiClip && this._expectedClipIdentities(gameNode).length > 0) {
        const missing = this._missingClipIdentities(gameNode, filesOnDisk);
        if (missing.length) {
          const sample = missing.slice(0, 3).join(', ');
          this.tagger.toast?.(`Film incomplete: ${missing.length} clip${missing.length === 1 ? '' : 's'} missing (${sample}${missing.length > 3 ? ', ...' : ''}). Re-add the folder to repair.`, 12000);
        }
        const clips = [];
        for (const fileRef of filesOnDisk) {
          const url = await backend.filmUrl(gameNode.id, fileRef);
          if (url) clips.push({ name: this._fileRefName(fileRef), path: this._fileRefPath(fileRef), url });
        }
        console.log('Multi-clip URLs:', clips.map(c => ({ name: c.name, url: c.url.slice(0, 120) })));
        if (clips.length > 0 && clips[0].url) {
          try {
            const probe = await fetch(clips[0].url, { method: 'HEAD', mode: 'no-cors' });
            console.log('Asset probe:', probe.type, probe.status, probe.ok);
          } catch (probeErr) {
            console.warn('Asset probe failed:', probeErr.message);
            this.tagger.toast?.(`Asset protocol probe failed for ${clips[0].name}: ${probeErr.message}`, 10000);
          }
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
        const match = filesOnDisk.find(f => this._fileRefName(f) === gameNode.videoFileName) || filesOnDisk[0];
        if (match) {
          const url = await backend.filmUrl(gameNode.id, match);
          console.log('Single-video URL:', url?.slice(0, 200));
          if (url) {
            this.vc.loadUrl(url, this._fileRefName(match));
          } else {
            console.warn('filmUrl returned null for', match);
            this._relinkToast(gameNode, true);
          }
        }
      }
    } catch (e) {
      console.warn('Film auto-load failed:', e);
      this._relinkToast(gameNode, true);
    }
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
      this.tagger.toast?.('Could not save film to the library — it will need re-adding next session.');
    }
  }

  async repairFilm(files) {
    const backend = this.seasonStore.backend;
    if (!backend.supportsFilm || !backend.supportsFilm()) {
      this.tagger.toast?.('Film repair is available in the desktop app.');
      return false;
    }
    const game = this.seasonStore.activeGame();
    const videoFiles = this._videoFiles(files);
    if (!game || !this.tagger.plays.length) {
      this.tagger.toast?.('Open the tagged game first, then repair its film.');
      return false;
    }
    if (!videoFiles.length) {
      this.tagger.toast?.('No video files found in that folder.');
      return false;
    }

    if (videoFiles.length === 1 && !game.isMultiClip) {
      const file = videoFiles[0];
      const ok = await this.tagger._choiceDialog(
        `Repair this game with "${file.name}"? Your tags stay in place; the video will be copied into the desktop film library.`,
        [
          { key: 'repair', label: 'Repair Film', variant: 'btn-accent' },
          { key: 'cancel', label: 'Cancel' },
        ]);
      if (ok !== 'repair') return false;
      this._maybeSnapshot(true, 'Before film repair');
      const imported = await backend.importFilm(game.id, [file], (done, total) => {
        const app = window.app;
        if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total);
      });
      const ref = (Array.isArray(imported) && imported[0]) || file.name;
      const url = backend.filmUrl ? await backend.filmUrl(game.id, ref) : null;
      this.videoFileName = this._fileRefName(ref) || file.name;
      if (url) this.vc.loadUrl(url, this.videoFileName);
      else this.vc.loadFile(file);
      this.commitActive();
      this.seasonStore.persist();
      this._signalSave('saved');
      this.tagger.toast?.(url ? 'Film repaired and loaded from the library.' : 'Film repaired; using the selected file until restart.');
      return true;
    }

    const plan = this._planClipRepair(videoFiles);
    if (!plan.matches.length) {
      this.tagger.toast?.('Could not match that folder to this game. Choose the original clip folder for the active game.');
      return false;
    }
    if (plan.missing.length) {
      this.tagger.toast?.(`Matched ${plan.matches.length} of ${plan.totalPlays} plays. No changes made. Choose the folder with every clip for this game.`, 12000);
      return false;
    }

    const extra = plan.extraFiles ? ` ${plan.extraFiles} extra video${plan.extraFiles === 1 ? '' : 's'} will be ignored.` : '';
    const order = plan.orderMatches ? ` ${plan.orderMatches} old clip${plan.orderMatches === 1 ? '' : 's'} will be matched by folder order.` : '';
    const choice = await this.tagger._choiceDialog(
      `Repair film for this game? ${plan.matches.length} tagged play${plan.matches.length === 1 ? '' : 's'} will keep their tags and get new film paths.${order}${extra}`,
      [
        { key: 'repair', label: 'Repair Film', variant: 'btn-accent' },
        { key: 'cancel', label: 'Cancel' },
      ]);
    if (choice !== 'repair') return false;

    try {
      this._maybeSnapshot(true, 'Before film repair');
      const matchedFiles = plan.matches.map(m => m.file);
      const imported = await backend.importFilm(game.id, matchedFiles, (done, total) => {
        const app = window.app;
        if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total);
      });
      const playableMatches = await Promise.all(plan.matches.map(async (m, i) => {
        const ref = (Array.isArray(imported) && imported[i]) || (m.file && (m.file.webkitRelativePath || m.file.relativePath || m.file.path || m.file.name)) || '';
        const url = ref && backend.filmUrl ? await backend.filmUrl(game.id, ref) : null;
        return {
          ...m,
          path: ref || this._fileIdentity(m.file),
          url
        };
      }));
      const missingUrls = playableMatches.filter(m => !m.url).length;
      await this.playlist.repairWithMatches(playableMatches);
      this.videoFileName = null;
      this.commitActive();
      this.seasonStore.persist();
      this._signalSave('saved');
      this.tagger.toast?.(missingUrls
        ? `Film repaired, but ${missingUrls} clip${missingUrls === 1 ? '' : 's'} could not be loaded from the library yet.`
        : `Film repaired and loaded: ${plan.matches.length} clip${plan.matches.length === 1 ? '' : 's'} linked.`);
      return true;
    } catch (e) {
      console.warn('Film repair failed:', e);
      this.tagger.toast?.('Film repair failed before changes were saved. Try the folder again.');
      return false;
    }
  }

  _videoFiles(files) {
    const exts = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
    return (files || [])
      .filter(f => (f && f.type && f.type.startsWith('video/')) || exts.test((f && f.name) || ''))
      .sort((a, b) => this._fileIdentity(a).localeCompare(this._fileIdentity(b), undefined, { numeric: true, sensitivity: 'base' }));
  }

  _planClipRepair(files) {
    const plays = this.tagger.plays.slice();
    const fileRows = files.map((file, index) => ({
      file, index,
      identity: this._fileIdentity(file),
      name: this._displayName(file)
    }));
    const usedFiles = new Set();
    const usedPlays = new Set();
    const matches = [];
    let orderMatches = 0;

    const add = (play, row, method) => {
      if (!play || !row || usedPlays.has(play) || usedFiles.has(row)) return false;
      usedPlays.add(play);
      usedFiles.add(row);
      matches.push({ play, file: row.file, method });
      if (method === 'order') orderMatches++;
      return true;
    };

    const byIdentity = new Map(fileRows.map(row => [row.identity, row]));
    for (const play of plays) {
      const key = this._pathWithoutExt(play.clipPath || '');
      if (key && byIdentity.has(key)) add(play, byIdentity.get(key), 'path');
    }

    const byName = new Map();
    for (const row of fileRows) {
      if (usedFiles.has(row)) continue;
      if (!byName.has(row.name)) byName.set(row.name, []);
      byName.get(row.name).push(row);
    }
    for (const play of plays) {
      if (usedPlays.has(play)) continue;
      const rows = byName.get(this._pathWithoutExt(play.clipName || '')) || [];
      const openRows = rows.filter(row => !usedFiles.has(row));
      if (openRows.length === 1) add(play, openRows[0], 'name');
    }

    const remainingPlays = plays.filter(play => !usedPlays.has(play));
    const remainingFiles = fileRows.filter(row => !usedFiles.has(row));
    if (remainingPlays.length && remainingPlays.length === remainingFiles.length) {
      remainingPlays.forEach((play, i) => add(play, remainingFiles[i], 'order'));
    }

    return {
      matches,
      missing: plays.filter(play => !usedPlays.has(play)),
      extraFiles: fileRows.filter(row => !usedFiles.has(row)).length,
      orderMatches,
      totalPlays: plays.length
    };
  }

  _fileRefName(fileRef) {
    return typeof fileRef === 'string' ? fileRef.split('/').pop() : (fileRef && fileRef.name) || '';
  }

  _fileRefPath(fileRef) {
    return typeof fileRef === 'string' ? fileRef : (fileRef && (fileRef.path || fileRef.name)) || '';
  }

  _pathWithoutExt(path) {
    return String(path || '').replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
  }

  _displayName(fileOrPath) {
    const raw = typeof fileOrPath === 'string' ? fileOrPath : (fileOrPath && fileOrPath.name) || '';
    const leaf = raw.split(/[\\/]/).pop() || raw;
    return this._pathWithoutExt(leaf);
  }

  _fileIdentity(file) {
    const raw = (file && (file.webkitRelativePath || file.relativePath || file.path || file.name)) || '';
    return this._pathWithoutExt(raw);
  }

  _expectedClipIdentities(gameNode) {
    if (!gameNode) return [];
    if (Array.isArray(gameNode.clipRefs) && gameNode.clipRefs.length) {
      return gameNode.clipRefs.map(c => this._pathWithoutExt(c.originalRelativePath || c.libraryRelativePath || c.displayName || c.originalName)).filter(Boolean);
    }
    if (Array.isArray(gameNode.clipPaths) && gameNode.clipPaths.length) {
      return gameNode.clipPaths.map(p => this._pathWithoutExt(p)).filter(Boolean);
    }
    if (Array.isArray(gameNode.clipNames)) {
      return gameNode.clipNames.map(n => this._pathWithoutExt(n)).filter(Boolean);
    }
    return [];
  }

  _missingClipIdentities(gameNode, filesOnDisk) {
    const found = new Set((filesOnDisk || []).map(f => this._pathWithoutExt(this._fileRefPath(f))));
    return this._expectedClipIdentities(gameNode).filter(id => !found.has(id));
  }

  /** Tear down per-game UI before loading a different game. */
  _clearForNewGame() {
    try { if (this.vc && this.vc.unloadVideo) this.vc.unloadVideo(); } catch (e) {}
    try { if (this.playlist && this.playlist.reset) this.playlist.reset(); } catch (e) {}
    this.videoFileName = null;
    this.canvas.annotations = [];
    this._loadedGameId = null;   // nothing loaded → commitActive must not write a blank/stale tagger over a game
    // The outgoing game's selection is meaningless in the next one — and play
    // ids restart per game, so a stale currentPlayId would silently highlight
    // an unrelated play if the incoming game has no saved selection.
    this.tagger.currentPlayId = null;
    // Blank the tag form too — otherwise the previous game's chips stay lit
    // and a coach clicking them edits nothing (currentPlayId is null).
    try { this.tagger._clearTagForm(); } catch (e) {}
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
    // Don't stack empty husks: if the active game is still blank (no plays,
    // no film, no identity), "New Game" just re-presents it instead of
    // leaving a stray "Game N — 0 plays" in the schedule. Tell the coach —
    // a click that closes the menu and changes nothing reads as broken.
    const reused = this.seasonStore.isEmptyActive();
    if (!reused) {
      this.seasonStore.addGame();
    } else {
      window.app?.tagger?.toast?.('Your current game is still empty — it IS the new game. Load film or tag plays to fill it.');
    }
    this.seasonStore.persist();
    this._clearForNewGame();
    this._loadActiveGame();
    return this.seasonStore.activeGame();
  }

  removeGame(id) {
    // Risky op: force a restore point of the pre-delete state.
    this._maybeSnapshot(true, 'Before deleting game');
    const wasActive = this.seasonStore.data && id === this.seasonStore.data.activeGameId;
    // Stash the node in memory so the post-delete toast can offer Undo (the
    // undo stack is game-scoped by design — lesson #19 — so game deletion
    // needs its own one-shot restore). Session-only, overwritten per delete.
    const games = (this.seasonStore.data && this.seasonStore.data.games) || [];
    const gi = games.findIndex(g => g.id === id);
    this._lastDeletedGame = gi >= 0
      ? { node: JSON.parse(JSON.stringify(games[gi])), index: gi, seasonId: this.seasonStore.currentSeasonId }
      : null;
    const backend = this.seasonStore.backend;
    if (backend.supportsFilm && backend.supportsFilm()) {
      backend.deleteFilm(id).catch(() => {});
    }
    this.seasonStore.removeGame(id);
    this.seasonStore.persist();
    if (wasActive) { this._clearForNewGame(); this._loadActiveGame(); }
  }

  /** One-shot restore of the last deleted game (the Undo toast's action).
   *  Refuses across a season switch — the stash belongs to its season. */
  undoRemoveGame() {
    const stash = this._lastDeletedGame;
    if (!stash || !this.seasonStore.data) return false;
    if (stash.seasonId !== this.seasonStore.currentSeasonId) return false;
    const games = this.seasonStore.data.games;
    if (games.some(g => g.id === stash.node.id)) return false;   // already back
    games.splice(Math.min(stash.index, games.length), 0, stash.node);
    this.seasonStore.persist();
    this._lastDeletedGame = null;
    // Refresh every games view that may be showing (all display-only).
    try { window.app && window.app._updateSeasonChip && window.app._updateSeasonChip(); } catch (e) {}
    try { window.app && window.app._renderGamesPanel && window.app._renderGamesPanel(); } catch (e) {}
    try { window.app && window.app.library && window.app.library._renderSchedule && window.app.library._renderSchedule(); } catch (e) {}
    return true;
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

    // Film index — derive from the PLAYS' own clip identities (durable: they
    // survive even when the film isn't in the library) UNIONED with the live
    // playlist (fresh clips + real duration / load state). Deriving from the
    // playlist ALONE silently WIPED a game's film index every time it was opened
    // without its film loaded (79 clips -> 11, 83 -> 0, isMultiClip -> false).
    // The plays keep clipName/clipPath, so they are the source of truth for
    // which clips the game references; the index must never shrink below them.
    const clipIndex = this._buildClipIndex();

    return {
      version: 4,
      videoFileName: this.videoFileName,
      gameInfo: this.gameInfo,
      roster: (window.app && window.app.roster) ? window.app.roster.toJSON() : [],
      plays: plays,
      annotations: this.canvas.annotations,
      currentPlayId: this.tagger.currentPlayId,
      nextId: this.tagger.nextId,
      clipNames: clipIndex.map(c => c.name),
      clipPaths: clipIndex.map(c => c.clipPath),
      clipRefs: clipIndex.map(c => ({
        id: c.clipPath,
        originalName: c.originalName,
        originalRelativePath: c.clipPath,
        displayName: c.name,
        duration: c.duration,
        importStatus: c.importStatus
      })),
      // Multi-clip when the plays reference more than one distinct clip, or film
      // is loaded. A true single continuous video has no per-play clip ids.
      isMultiClip: clipIndex.length > 1 || (this.playlist ? this.playlist.hasClips : false),
    };
  }

  // Ordered clip index for the game node: every clip the PLAYS reference (their
  // durable clipName/clipPath) enriched by the live playlist's load state. Never
  // shrinks below what the plays reference — the fix for the film-index wipe.
  _buildClipIndex() {
    const order = [];
    const byId = new Map();
    const put = (id, data) => {
      if (!id) return;
      if (!byId.has(id)) { byId.set(id, { name: id, clipPath: id, originalName: id, duration: null, importStatus: 'missing' }); order.push(id); }
      const e = byId.get(id);
      for (const k of Object.keys(data)) if (data[k] != null && data[k] !== '') e[k] = data[k];
    };
    for (const p of (this.tagger.plays || [])) {
      const id = ((p.clipPath || p.clipName) || '').trim();
      if (!id) continue;
      const dur = (p.timestamp && p.timestamp.end && p.timestamp.end !== 999) ? p.timestamp.end : null;
      put(id, { name: p.clipName || id, clipPath: p.clipPath || p.clipName || id, originalName: p.clipName || id, duration: dur });
    }
    if (this.playlist) {
      for (const c of this.playlist.clips) {
        const id = ((c.clipPath || c.name) || '').trim();
        put(id, { name: c.name || id, clipPath: c.clipPath || c.name || id, originalName: (c.file ? c.file.name : c.name) || id, duration: c.duration || null, importStatus: (c.assetUrl || c.file) ? 'ready' : 'missing' });
      }
    }
    return order.map(id => byId.get(id));
  }

  _deserialize(data) {
    if (!data) return;
    this.tagger.plays = data.plays || [];
    // Use the stored nextId if present (?? keeps a legitimate 0); otherwise
    // derive it from the HIGHEST existing id, not plays.length — with
    // non-contiguous ids (after deletes) plays.length+1 can equal an existing
    // id and mint a duplicate, which breaks selection / undo / cut-ups.
    this.tagger.nextId = data.nextId ?? (Math.max(0, ...this.tagger.plays.map(p => Number(p.id) || 0)) + 1);
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
    this._signalSave('saved');
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
    reader.onload = async (e) => {
      let parsed;
      try { parsed = JSON.parse(e.target.result); }
      catch (err) { alert('Invalid project file.'); return; }

      if (parsed && Array.isArray(parsed.games)) {
        // First-run / library-only state (e.g. importing a season saved on
        // the desktop app into a fresh web app): there's no current season,
        // so register a library entry first — adopt() persists into the
        // CURRENT season's slot and silently went nowhere without one.
        if (!this.seasonStore.hasCurrent()) {
          await this.seasonStore.createSeason({
            name: parsed.seasonName || String(file.name || 'Imported Season').replace(/\.json$/i, ''),
            teamId: (() => { try { return localStorage.getItem('ffa_active_team_id') || ''; } catch (err2) { return ''; } })(),
          });
        }
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
      // If the library overlay is up (first-run import), re-open it: the
      // recovery pass rebuilds team identity from the imported season's
      // teamProfile, so the coach lands on a populated Team Home, not setup.
      const lib = window.app && window.app.library;
      if (lib && lib._isOpen && lib._isOpen()) await lib.open();
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
    const frameDur = 1 / (parseInt(this.vc.fpsInput?.value, 10) || 30);

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
      'Field Side', 'Yard Line', 'Formation', 'Personnel', 'Motion',
      'Run/Pass', 'Play Type', 'Play Dir', 'ST Type', 'Def Front', 'Coverage', 'Blitz', 'Result',
      'Yardage', 'Hash', 'Ball Carrier', 'Passer', 'Receiver', 'Tackler',
      'Takeaway', 'Kicker', 'Returner',
      'BC Grade', 'Passer Grade', 'Receiver Grade', 'Tackler Grade', 'Takeaway Grade',
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
      p.tags.motion || '',
      p.tags.runPass || '',
      p.tags.playType,
      p.tags.playDir || '',
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
      p.tags.players?.takeaway || '',
      p.tags.players?.kicker || '',
      p.tags.players?.returner || '',
      p.tags.grades?.ballCarrier ?? '',
      p.tags.grades?.passer ?? '',
      p.tags.grades?.receiver ?? '',
      p.tags.grades?.tackler ?? '',
      p.tags.grades?.takeaway ?? '',
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
    window.ffaSaveBlob(blob, filename);
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
      motion: 'motion',
      playdir: 'playDir', direction: 'playDir', playdirection: 'playDir', dir: 'playDir',
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
        fieldSide: 'own', personnel: '', motion: '', playDir: '', driveNumber: '',
        players: {}, custom: []
      };
      let notes = '';

      for (const [colIdx, field] of Object.entries(colMap)) {
        const val = cells[parseInt(colIdx, 10)] || '';
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
