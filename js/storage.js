import { SeasonStore } from './season-store.js';
import { PlayTagger } from './play-tagger.js';
import { DemoSeason } from './demo-season.js';
import { planClipMatch } from './clip-identity.js';
import { PenaltyModel } from './penalty-model.js';
import { TagProjection } from './tag-projection.js';
import { SeasonFormat } from './season-format.js';
import { ChartingDetails } from './charting-details.js';
// E3b: exportCsv reads the pre-snap look through the projection seam. No cycle —
// stats-engine.js imports charts/heat-maps/metrics, never storage.js.
import { StatsEngine } from './stats-engine.js';
import { buildGameHtmlReport } from './html-report.js';

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
    this._desktopCloseInFlight = false;
    this._deferredSnapshot = null;
    this._snapshotIdleTimer = null;
    this.videoFileName = null;
    this.gameInfo = {};
    this.filter = null;
    this.seasonStore = new SeasonStore();
    this._loadedGameId = null;   // which game the live tagger holds (guards commitActive vs cross-game writes)
    // Clip identities the coach DELIBERATELY removed in this game session.
    // The durable clip index retains everything it has ever recorded, so an
    // intentional deletion needs an explicit signal — otherwise the identity is
    // carried forward forever, which is how a clip outlives both its play and
    // its file. Only an identity no surviving play references is actually
    // dropped, so Undo (which restores the play) restores the clip with it.
    // Per game, like undo history: reset in _loadActiveGame.
    this._removedClipIds = new Set();
    // Latest-film-load-wins guard. Film auto-load is async (list files, resolve
    // N clip URLs, probe, rehydrate) and then mutates the SHARED player/playlist.
    // Two rapid game opens run two overlapping _autoLoadFilm calls; if the FIRST
    // game's load resolves LAST it would stamp its film onto the now-active
    // second game (active=B, loaded=B, but the video shows A). Every load
    // captures this monotonic token at entry and re-checks it is still current
    // before each player/playlist mutation; a superseded load aborts silently.
    this._filmLoadSeq = 0;
    // Managed-film URLs are deterministic for a season/game/file path. Reuse
    // an exact manifest across reopen cycles instead of repeating one desktop
    // filesystem existence check + path conversion per clip. Entries are tied
    // to the backend instance and exact ordered file signature; changed film,
    // a season/backend switch, or a superseding load cannot reuse stale URLs.
    this._managedFilmManifests = new Map();
    // Tell the coach when a save fails (browser storage full) instead of losing
    // work silently. window.app/updater resolve lazily — this fires rarely.
    this.seasonStore.onPersistError = () => {
      try { window.app.updater._toast('⚠ Save failed — browser storage may be full. Use "Save Season" to export a backup file before you lose work.'); } catch (e) {}
    };

    this.projectFileInput = document.getElementById('projectFileInput');

    this._bindEvents();

    // Canonical autosaves remain immediate. The heavier restore-point write can
    // wait for a stable pause so exporting the full catalog never interrupts the
    // next example's playback. A quick scrub pause does not flush: playback must
    // remain paused for a short idle window.
    this.vc.on('play-state-change', ({ playing }) => {
      clearTimeout(this._snapshotIdleTimer);
      this._snapshotIdleTimer = null;
      if (!playing && this._deferredSnapshot) {
        this._snapshotIdleTimer = setTimeout(() => this._flushDeferredSnapshot(), 500);
      }
    });
    this.vc.on('video-ended', () => {
      clearTimeout(this._snapshotIdleTimer);
      this._snapshotIdleTimer = setTimeout(() => this._flushDeferredSnapshot(), 0);
    });
  }

  _bindEvents() {
    // Final Engine Independence: the legacy #btnSave top-bar button is gone
    // -- saveProject() is called directly from WorkspaceShell's More menu
    // ("Save season") now, not proxied through a relocated legacy button.
    this.projectFileInput?.addEventListener('change', (event) => {
      const file = event.target.files?.[0];
      if (file) this.loadProject(file);
    });
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
    // Flush a pending debounced save when the window closes, so an edit made
    // just before closing is not lost. Wired here because the store and tagger
    // are only fully wired once app.js calls this.
    if (typeof window !== 'undefined' && typeof window.addEventListener === 'function') {
      window.addEventListener('beforeunload', () => { try { this.flushPendingSaves(); } catch (e) {} });
    }
    // Desktop only: Tauri's close-requested hook can defer the close until the
    // flush resolves, which a browser beforeunload listener cannot.
    this._wireDesktopCloseFlush();
  }

  /**
   * Desktop only (window.__TAURI__): defer the window close via
   * onCloseRequested, await flushPendingSaves(), then destroy the window
   * through a native command that does not re-enter the hook. Every step is
   * guarded; a failure here never blocks a real close.
   */
  async _wireDesktopCloseFlush() {
    const T = (typeof window !== 'undefined') ? window.__TAURI__ : null;
    if (!T || !T.window || typeof T.window.getCurrentWindow !== 'function'
      || !T.core || typeof T.core.invoke !== 'function') return;
    let win;
    try { win = T.window.getCurrentWindow(); } catch (e) { return; }
    if (!win || typeof win.onCloseRequested !== 'function') return;
    try {
      await win.onCloseRequested((event) => {
        // preventDefault() must be called synchronously, before any await --
        // Tauri's own close sequence is not guaranteed to wait for a later
        // call. The actual flush + explicit close happen in a detached async
        // step below.
        try { if (typeof event.preventDefault === 'function') event.preventDefault(); } catch (e) {}
        if (this._desktopCloseInFlight) return;
        this._desktopCloseInFlight = true;
        (async () => {
          let ok = true;
          try { ok = await this.flushPendingSaves(); } catch (e) { ok = false; }
          if (ok === false) {
            // An observed save failure keeps the window open and reports it
            // through onPersistError, so the coach can retry or export instead
            // of losing work silently.
            try { this.seasonStore && this.seasonStore.onPersistError && this.seasonStore.onPersistError(); } catch (e) {}
            this._desktopCloseInFlight = false;
            return;
          }
          try {
            // Native destruction does not emit another webview close-request,
            // so there is no recursive event or capability mismatch.
            await T.core.invoke('close_after_flush');
          } catch (e) {
            this._desktopCloseInFlight = false;
            try { window.app?.updater?._toast('Unable to close GridIron IQ. Please try again.'); } catch (err) {}
          }
        })();
      });
    } catch (e) {}
  }

  /**
   * Run an armed debounced save now and await every write in flight until the
   * season's writes are stable.
   *
   * Resolves:
   *   - `true`  safe to proceed: nothing to flush, or the last canonical save
   *             succeeded.
   *   - `false` only on an observed save failure, never for "nothing pending".
   *
   * An un-armed timer does not mean nothing is running: the timer nulls
   * itself when it fires, before its write settles, and the browser
   * beforeunload listener and the desktop close hook can both call this for
   * one close. So it falls back to SeasonStore.pendingWrite(), and loops: run
   * any armed debounce (including one re-armed by an edit during an earlier
   * await), drain via SeasonStore.drainWrites(), and repeat until no timer is
   * armed and nothing new was dispatched.
   *
   * The 2.5s Documents-mirror debounce is not drained: it is a recovery
   * snapshot rewritten by the next save; the canonical bytes are what a
   * shutdown must not lose.
   */
  async flushPendingSaves() {
    let ok = true;
    let flushedAnything = false;
    let converged = null;   // the _lastWrite entry the previous iteration already fully drained
    for (;;) {
      if (this.autoSaveTimer) {
        clearTimeout(this.autoSaveTimer);
        this.autoSaveTimer = null;
        // Dispatch synchronously here; drained (with everything else) below,
        // rather than awaited directly -- a write dispatched by ANY OTHER
        // trigger while this one is in flight must be picked up too, and
        // drainWrites() is the one place that guarantee lives.
        if (this.seasonStore && this.seasonStore.data) this._commitAndPersist();
      }
      const seasonId = this.seasonStore ? this.seasonStore.currentSeasonId : null;
      const pending = (seasonId && typeof this.seasonStore.pendingWrite === 'function')
        ? this.seasonStore.pendingWrite(seasonId) : null;
      if (!pending || pending === converged) break;   // nothing armed and nothing new since the last drain -- genuinely stable
      flushedAnything = true;
      let r = true;
      if (typeof this.seasonStore.drainWrites === 'function') {
        r = await this.seasonStore.drainWrites(seasonId);
      } else {
        try { r = await pending; } catch (e) { r = false; }
      }
      ok = r !== false;
      // Re-read rather than assume `pending` is still the final word --
      // drainWrites() may have internally converged past it to a newer
      // write; the NEXT iteration's "already drained" comparison must be
      // against the true final state, not the reference captured before the
      // drain began.
      converged = (seasonId && this.seasonStore.pendingWrite) ? this.seasonStore.pendingWrite(seasonId) : pending;
    }
    return flushedAnything ? ok : true;
  }

  _autoSave() {
    clearTimeout(this.autoSaveTimer);
    this._signalSave('pending');
    // Pin the season the edit belongs to. If the coach switches seasons before
    // the debounce fires, flushing would write this season's data into the
    // other season's slot. Transitions also cancel this timer.
    const sid = this.seasonStore ? this.seasonStore.currentSeasonId : null;
    this.autoSaveTimer = setTimeout(() => {
      // The field is spent the instant the timer fires, so flushPendingSaves()
      // can tell "not armed" from "already fired" and await the write through
      // SeasonStore.pendingWrite() instead of re-triggering it.
      this.autoSaveTimer = null;
      if (this.seasonStore && this.seasonStore.currentSeasonId !== sid) return;
      this._commitAndPersist();
    }, 1000);
  }

  /** Surface save-state to the UI (Break Down's save indicator). States:
   *  'pending' (a save is armed or running), 'saved' (the canonical write
   *  landed), 'failed' (it did not). */
  _signalSave(state) {
    try { if (this.onSaveState) this.onSaveState(state); } catch (e) {}
  }

  /** Cancel debounced writes armed for the CURRENT season (call before leaving it). */
  _cancelPendingSaves() {
    clearTimeout(this.autoSaveTimer);
    this.autoSaveTimer = null;
    clearTimeout(this._snapshotIdleTimer);
    this._snapshotIdleTimer = null;
    this._deferredSnapshot = null;
    if (this.seasonStore && this.seasonStore.cancelPendingDiskWrite) this.seasonStore.cancelPendingDiskWrite();
  }

  /** Write the live active-game state into the season and persist it.
   *  Returns persist()'s durable true/false, so flushPendingSaves() can await
   *  it and know whether it succeeded. */
  _commitAndPersist() {
    if (!this.seasonStore || !this.seasonStore.data) return Promise.resolve(false);
    this.commitActive();
    const result = Promise.resolve(this.seasonStore.persist()).then(ok => ok !== false, () => false);
    this._maybeSnapshot();   // throttled auto restore-point
    // Saved only once the write lands; a newer armed edit keeps its pending state.
    result.then(ok => { if (!this.autoSaveTimer) this._signalSave(ok ? 'saved' : 'failed'); });
    return result;
  }

  /**
   * Create a restore point, but at most once every few minutes during active
   * tagging (explicit saves and risky ops pass force=true). Keeps the ring
   * meaningful without a snapshot per keystroke.
   */
  _maybeSnapshot(force, label) {
    const now = Date.now();
    if (force) {
      this._deferredSnapshot = null;
      clearTimeout(this._snapshotIdleTimer);
      this._snapshotIdleTimer = null;
    }
    if (!force && (this._deferredSnapshot || (this._lastSnapAt && (now - this._lastSnapAt) < 180000))) return;
    if (!force && !this.vc.paused) {
      this._deferredSnapshot = {
        label: label || 'Auto',
        seasonId: this.seasonStore?.currentSeasonId || null,
      };
      return;
    }
    this._takeSnapshot(label);
  }

  _takeSnapshot(label) {
    this._lastSnapAt = Date.now();
    if (this.seasonStore) this.seasonStore.snapshot(label || 'Auto').catch(() => {});
  }

  _flushDeferredSnapshot() {
    this._snapshotIdleTimer = null;
    if (!this._deferredSnapshot || !this.vc.paused) return false;
    const pending = this._deferredSnapshot;
    this._deferredSnapshot = null;
    if (pending.seasonId !== (this.seasonStore?.currentSeasonId || null)) return false;
    this._takeSnapshot(pending.label);
    return true;
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
    // Re-grant the WebView access to the coach's saved film-library folder so
    // linked clips play on reopen (desktop; no-op elsewhere).
    const backend = this.seasonStore.backend;
    if (backend.initLibraryRoot) backend.initLibraryRoot().catch(() => {});
  }

  /** List every season in the library (metas only). */
  async listSeasons() {
    const seasons = await this.seasonStore.listSeasons();
    this._lastSeasonMetas = seasons || [];
    this._reconcileDemoPointer(this._lastSeasonMetas);
    this._reportOldFormatSeasons();
    return seasons;
  }

  /** A retired single-save layout found when the library was created is named
   *  once, so it never disappears without a word. */
  _reportOldFormatSeasons() {
    const oldLayout = this.seasonStore?.backend?.takeOldLayoutNotice?.();
    if (oldLayout) this.tagger?.toast?.(oldLayout, 10000);
  }

  /** Whether this backend supports season recovery (desktop only). */
  canRecoverSeasons() { return this.seasonStore.canRecoverSeasons(); }

  /** Recovery step 1: preview candidates from the Documents mirror. Only ever
   *  called from a coach action, never automatically. */
  async scanRecoverableSeasons() { return this.seasonStore.scanRecoverableSeasons(); }

  /** Recovery step 2: the confirmed import. On success, refreshes the season
   *  list cache so the next render shows the recovered season. */
  async recoverSeasonFromMirror(id, opts) {
    const result = await this.seasonStore.recoverSeasonFromMirror(id, opts);
    if (result && result.ok) { try { await this.listSeasons(); } catch (e) {} }
    return result;
  }

  /**
   * Open an existing season and restore its active game into the app.
   *
   * Returns false, having changed nothing, when the store REFUSES the open --
   * a legacy roster migration conflict, or a migration write that did not land.
   * The season the coach had open stays open with its live state intact, so the
   * app must not run `_afterSeasonLoaded()` on it: reloading the prior season's
   * active game would reset its undo history and film state for a navigation
   * that never happened.
   */
  async openSeasonById(id) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    this._cancelPendingSaves();   // a debounced save must never straddle the switch
    const opened = await this.seasonStore.openSeason(id);
    if (!opened) { this._reportOpenRefusal(); return false; }
    // Only a successful switch closes the outgoing season's delete-undo window.
    // A refused open leaves that season current, so purging earlier
    // would delete its pending film while the coach still has a valid Undo.
    this._purgeStaleDeletedFilm();
    this._afterSeasonLoaded();
    return true;
  }

  /** Create a new season ({name, team, year, level}) and open it. */
  async createSeason(meta) {
    if (this.seasonStore.hasCurrent()) { this.commitActive(); this.seasonStore.persist(); }
    this._cancelPendingSaves();
    this._purgeStaleDeletedFilm();   // leaving the season closes any pending delete's undo window
    const app = window.app;
    const rec = await this.seasonStore.createSeason({ ...(meta || {}), playbook: app?.playbook?.snapshot?.() });
    this._afterSeasonLoaded();
    return rec;
  }

  /** Delete a season; clears the editor if it was the open one. Returns false and
   *  toasts (without tearing down the editor) when the canonical delete failed and
   *  the season was retained — so a stale catalog can't leave the coach thinking a
   *  season was removed when its durable copies are still on disk. */
  async deleteSeason(id) {
    const wasCurrent = this.seasonStore.currentSeasonId === id;
    const wasDemo = this.isDemoSeason(id);
    if (wasCurrent) this._cancelPendingSaves();
    const ok = await this.seasonStore.deleteSeason(id);
    if (ok === false) {
      this.tagger?.toast?.('Could not delete the season — it was kept safe. Please try again.');
      return false;
    }
    if (wasDemo) this._teardownDemo();
    if (wasCurrent) {
      this._clearForNewGame();
      window.app?.roster?.loadFrom?.([], { persist: false });
    }
    return true;
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
    data.teamId = demoTeamId;
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
    const app = window.app;
    const teamId = this.seasonStore.data?.teamId || app?.teamRegistry?.activeTeamId?.() || '';
    if (app?.playbook && !app.playbook.hasStored(teamId) && this.seasonStore.data?.playbook) {
      app.playbook.replace(this.seasonStore.data.playbook, teamId);
    }
    // A roster belongs to one season and is shared only by that season's games.
    // Hydration must replace the live roster even when the saved roster is empty;
    // retaining the prior non-empty value is how JV/Varsity rosters leaked into
    // one another. `persist:false` prevents a read from scheduling a write.
    app?.roster?.loadFrom?.(this.seasonStore.data?.roster || [], { persist: false });
    // One post-open seam adopts the Home parent context, so every path that
    // opens a season -- Home, the shell picker, recovery, import -- lands on the
    // same owner. A program season is its own parent; a scout adopts the parent
    // it stores.
    app?.workspace?.adoptOpenedSeason?.(this.seasonStore.data || null);
    this._clearForNewGame();
    // _loadActiveGame already refreshes the season chip + games panel and resets
    // the finish hint, so only the season-level UI (history/versions) is left.
    this._loadActiveGame();
    if (app) {
      if (app.history) app.history.init();
    }
  }

  /**
   * Tell the coach why a stored season did not open (it is in an old format,
   * SeasonStore._hydrate). Consumed here so it is reported once. Not gated on
   * the refused season being current: a refused open deliberately leaves the
   * PRIOR season current.
   */
  _reportOpenRefusal() {
    const record = this.seasonStore?.openRefusal;
    if (this.seasonStore) this.seasonStore.openRefusal = null;
    if (record && record.message) this.tagger?.toast?.(record.message);
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
    // The active season is the roster authority. Unlike the former ambient
    // localStorage cache, an intentionally empty roster is meaningful and must
    // replace the prior value rather than retaining players from another season.
    if (app && app.roster) {
      const roster = app.roster.toJSON();
      this.seasonStore.data.roster = Array.isArray(roster) ? roster.map(player => ({ ...player })) : [];
    }
    if (app && app.playbook) {
      const playbook = app.playbook.snapshot();
      const liveCalls = (playbook && playbook.calls) || [];
      const savedCalls = (this.seasonStore.data.playbook && this.seasonStore.data.playbook.calls) || [];
      if (liveCalls.length || !savedCalls.length) this.seasonStore.data.playbook = playbook;
    }
    try {
      const prof = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {};
      // Only adopt a real identity — after "Switch team" the profile is empty,
      // and stamping {} here would strip the old season's saved team.
      if (prof.teamName) this.seasonStore.data.teamProfile = prof;
    } catch (e) {}
  }

  /** Persist a roster edit into the active season, never an ambient team/global cache. */
  updateSeasonRoster(roster) {
    if (!this.seasonStore?.data) return false;
    this.seasonStore.data.roster = Array.isArray(roster)
      ? roster.filter(player => player && player.num != null).map(player => ({ ...player }))
      : [];
    this._autoSave();
    return true;
  }

  _loadActiveGame({ renderGames = true } = {}) {
    const g = this.seasonStore.activeGame();
    if (g) this._deserialize(g);
    this._loadedGameId = g ? g.id : null;   // the tagger now holds THIS game; commitActive guards on it
    // Deliberate clip removals are per GAME, exactly like undo history below: a
    // removal recorded while editing one game must never drop a clip from the
    // next one.
    this._removedClipIds = new Set();
    this._applySeasonLabels();   // demo name overlay on / off for this season
    const app = window.app;
    if (app) {
      // Undo/redo is per-GAME: reset the history on every game load (switch, new,
      // restore — not just season open) so an Undo after switching games can't
      // restore the PREVIOUS game's plays into this one. (Cross-game corruption
      // the integrity harness caught: switchToGame never re-init'd history.)
      if (app.history && app.history.reset) app.history.reset();
      if (renderGames && app._renderGamesPanel) app._renderGamesPanel();
      app._finishHintShown = false;
    }
    const filmReady = g
      ? this._autoLoadFilm(g).then(() => true).catch(() => false)
      : Promise.resolve(false);
    this._maybeShowRelinkHint(g);
    return filmReady;
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

  async _managedFilmClips(gameNode, filesOnDisk, backend, stale) {
    const seasonId = this.seasonStore.currentSeasonId || backend.currentSeason?.() || '';
    const key = `${seasonId}::${gameNode.id}`;
    const signature = filesOnDisk.map(fileRef => this._fileRefPath(fileRef)).join('\u001f');
    const catalogIds = this._catalogClipIdsForFiles(gameNode, filesOnDisk);
    const attachCurrentIdentity = clips => clips.map(clip => {
      const { sourceIndex, ...resolved } = clip;
      return { ...resolved, catalogClipId: catalogIds[sourceIndex] || null };
    });
    const cached = this._managedFilmManifests.get(key);
    if (cached?.backend === backend && cached.signature === signature) {
      // Refresh LRU position. Cache only deterministic paths/URLs; catalog ids
      // come from the current game payload so a metadata repair cannot inherit
      // stale identity from an earlier open.
      this._managedFilmManifests.delete(key);
      this._managedFilmManifests.set(key, cached);
      return attachCurrentIdentity(cached.clips);
    }

    const clips = (await Promise.all(filesOnDisk.map(async (fileRef, sourceIndex) => {
      const url = await backend.filmUrl(gameNode.id, fileRef);
      return url ? {
        name: this._fileRefName(fileRef),
        path: this._fileRefPath(fileRef),
        sourceIndex,
        url,
      } : null;
    }))).filter(Boolean);
    if (stale()) return attachCurrentIdentity(clips);

    // A partial resolution may be a transient desktop/filesystem failure. Use
    // what succeeded for this open, but retry the full manifest next time.
    if (clips.length === filesOnDisk.length) {
      this._managedFilmManifests.delete(key);
      this._managedFilmManifests.set(key, { backend, signature, clips: clips.map(clip => ({ ...clip })) });
      while (this._managedFilmManifests.size > 12) {
        this._managedFilmManifests.delete(this._managedFilmManifests.keys().next().value);
      }
    }
    return attachCurrentIdentity(clips);
  }
  async _autoLoadFilm(gameNode) {
    const backend = this.seasonStore.backend;
    // Latest-load-wins: capture this load's token; a newer load (or a game
    // teardown) bumps the sequence, so `stale()` becomes true and this load
    // aborts before touching the shared player/playlist. Closes the overlapping-
    // open race where a slow earlier load clobbers a faster later one.
    const loadToken = ++this._filmLoadSeq;
    const stale = () => loadToken !== this._filmLoadSeq;
    // Linked film: clips live in the coach's own library folder, referenced in
    // place (no copy). Managed film (below) is unchanged.
    if (gameNode.filmMode === 'linked' && backend.supportsLinkedFilm && backend.supportsLinkedFilm()) {
      return this._autoLoadLinkedFilm(gameNode, loadToken);
    }
    if (!backend.supportsFilm || !backend.supportsFilm()) return;
    // Every toast and message below is guarded by `!stale()`, like every
    // player and playlist change: a superseded load must not report the wrong
    // game's missing or incomplete film.
    try {
      const filesOnDisk = await backend.listFilmFiles(gameNode.id);
      if (stale()) return;
      console.log('Film auto-load:', { gameId: gameNode.id, filesOnDisk, isMultiClip: gameNode.isMultiClip, videoFileName: gameNode.videoFileName });
      if (filesOnDisk.length === 0) { this._relinkToast(gameNode, true); return; }

      if (gameNode.isMultiClip && this._expectedClipIdentities(gameNode).length > 0) {
        const missing = this._missingClipIdentities(gameNode, filesOnDisk);
        if (missing.length) {
          const sample = missing.slice(0, 3).join(', ');
          this.tagger.toast?.(`Film incomplete: ${missing.length} clip${missing.length === 1 ? '' : 's'} missing (${sample}${missing.length > 3 ? ', ...' : ''}). Re-add the folder to repair.`, 12000);
        }
        // Resolve clip URLs in parallel (see _autoLoadLinkedFilm) — order-preserving.
        const clips = await this._managedFilmClips(gameNode, filesOnDisk, backend, stale);        if (stale()) return;
        console.log('Multi-clip URLs:', clips.map(c => ({ name: c.name, url: c.url.slice(0, 120) })));
        if (clips.length > 0 && clips[0].url) {
          try {
            const probe = await fetch(clips[0].url, { method: 'HEAD', mode: 'no-cors' });
            if (stale()) return;
            console.log('Asset probe:', probe.type, probe.status, probe.ok);
          } catch (probeErr) {
            if (stale()) return;
            console.warn('Asset probe failed:', probeErr.message);
            this.tagger.toast?.(`Asset protocol probe failed for ${clips[0].name}: ${probeErr.message}`, 10000);
          }
        }
        if (clips.length > 0 && this.playlist && !stale()) {
          await this.playlist.rehydrateFromDisk(clips, this.tagger.plays);
          if (stale()) return;
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
          if (stale()) return;
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
      if (stale()) return;
      console.warn('Film auto-load failed:', e);
      this._relinkToast(gameNode, true);
    }
  }

  /** Auto-load a LINKED game's film from the coach's library folder (no copy).
   * `loadToken` is the latest-load-wins guard captured by the caller — always
   * `_autoLoadFilm` in production. Required (not defaulted): a default of
   * `++this._filmLoadSeq` would silently invalidate any load already in flight
   * as a side effect of merely calling this function, which is exactly the
   * hazard this guard exists to prevent. A direct call (e.g. a test) must
   * capture its own token the same way _autoLoadFilm does. */
  async _autoLoadLinkedFilm(gameNode, loadToken) {
    const backend = this.seasonStore.backend;
    const stale = () => loadToken !== this._filmLoadSeq;
    // Same messaging discipline as _autoLoadFilm (F3): every toast/scope-widening
    // call after an await is guarded by !stale(), not just the final playlist
    // mutation — a superseded load must not narrate the outgoing game.
    try {
      await backend.allowLibraryDir(backend.getLibraryRoot());
      if (stale()) return;
      const absDir = await backend.linkedGameDir(gameNode.filmDir);
      if (stale()) return;
      if (!absDir) { this._relinkToast(gameNode, true); return; }
      // Only re-grant filesystem scope to a folder the coach consented to (under
      // the library root, or explicitly linked on this machine). An absolute
      // filmDir carried in by an IMPORTED season that was never linked here must
      // not silently widen scope — prompt a re-link (a native pick = fresh consent).
      if (backend.isLinkedDirAllowed && !backend.isLinkedDirAllowed(absDir)) {
        this.tagger.toast?.('This game\'s linked film folder isn\'t authorized on this computer. Use "Link from Library" to reconnect it.', 12000);
        return;
      }
      await backend.allowLibraryDir(absDir);
      if (stale()) return;
      const filesOnDisk = await backend.listLinkedFilm(absDir);
      if (stale()) return;
      console.log('Linked film auto-load:', { gameId: gameNode.id, filmDir: gameNode.filmDir, absDir, count: filesOnDisk.length });
      if (!filesOnDisk.length) { this._relinkToast(gameNode, true); return; }
      if (this._expectedClipIdentities(gameNode).length > 0) {
        const missing = this._missingClipIdentities(gameNode, filesOnDisk);
        if (missing.length) {
          const sample = missing.slice(0, 3).join(', ');
          this.tagger.toast?.(`Film incomplete: ${missing.length} clip${missing.length === 1 ? '' : 's'} missing (${sample}${missing.length > 3 ? ', ...' : ''}). Re-link the folder to repair.`, 12000);
        }
      }
      // Resolve clip URLs in PARALLEL — an 80-clip game was ~160 serial IPC
      // round-trips (linkedAbs + linkedFilmUrl per clip) on every reopen. map()
      // preserves order so the playlist stays in folder order.
      const catalogIds = this._catalogClipIdsForFiles(gameNode, filesOnDisk);
      const clips = (await Promise.all(filesOnDisk.map(async (fileRef, i) => {
        const abs = await backend.linkedAbs(absDir, this._fileRefPath(fileRef));
        const url = await backend.linkedFilmUrl(abs);
        return url ? { name: this._fileRefName(fileRef), path: this._fileRefPath(fileRef), catalogClipId: catalogIds[i] || null, url } : null;
      }))).filter(Boolean);
      if (stale()) return;
      if (clips.length > 0 && this.playlist) {
        await this.playlist.rehydrateFromDisk(clips, this.tagger.plays);
        if (stale()) return;
        if (this.tagger.currentPlayId) this.playlist.switchToClipByPlayId(this.tagger.currentPlayId);
        if (this.playlist.activeClipIndex === -1 && this.playlist.clips.length > 0) this.playlist.switchToClip(0);
      }
    } catch (e) {
      if (stale()) return;
      console.warn('Linked film auto-load failed:', e);
      this._relinkToast(gameNode, true);
    }
  }

  /**
   * Link the active game to a folder in the coach's own film library — clips are
   * REFERENCED in place, never copied. First use sets the library root. An
   * existing tagged game re-links its plays 1:1; a new game auto-creates a play
   * per clip. Desktop only.
   */
  async linkFilmFolder() {
    const backend = this.seasonStore.backend;
    if (!backend.supportsLinkedFilm || !backend.supportsLinkedFilm()) {
      this.tagger.toast?.('The film library is available in the desktop app.');
      return false;
    }
    let game = this.seasonStore.activeGame();
    if (!game) { this.tagger.toast?.('Open a game first, then link its film.'); return false; }
    const gameId = game.id;
    // Game ids repeat across seasons, so the season id is part of the owner.
    const seasonId = this.seasonStore.currentSeasonId;
    const moved = () => this.seasonStore.currentSeasonId !== seasonId || this.seasonStore.activeGame()?.id !== gameId;
    let root = backend.getLibraryRoot();
    if (!root) {
      const mode = await window.app?.uiPolish?.ensureFilmStorageMode?.({ force: true });
      root = backend.getLibraryRoot();
      if (mode !== 'linked' || !root) return false;
    }
    const folder = await backend.pickFolder(root);
    if (!folder) return false;
    if (moved()) {
      this.tagger.toast?.('Game changed before the folder was linked. Try again on the intended game.');
      return false;
    }
    if (backend.getLibraryRoot() !== root) {
      this.tagger.toast?.('The film library root changed. Choose this game folder again.');
      return false;
    }
    const norm = value => String(value || '').replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
    const fallbackRel = backend.relToRoot?.(folder) || '';
    const filmDir = backend.gameDirFromRoot
      ? backend.gameDirFromRoot(folder)
      : (norm(folder) === norm(root) ? '.' : (fallbackRel || null));
    if (filmDir == null) {
      this.tagger.toast?.('Choose this game\'s folder inside your Film Library Root. The library root was not changed.', 8000);
      return false;
    }
    if (!await backend.allowLibraryDir(folder)) {
      this.tagger.toast?.('GridIron IQ could not access that game folder. Nothing was changed.');
      return false;
    }
    const files = await backend.listLinkedFilm(folder);
    if (!files.length) { this.tagger.toast?.('No video files found in that folder.'); return false; }
    const clips = await Promise.all(files.map(async f => {
      const abs = await backend.linkedAbs(folder, this._fileRefPath(f));
      const url = await backend.linkedFilmUrl(abs);
      return { name: this._fileRefName(f), path: this._fileRefPath(f), url };
    }));
    if (clips.some(c => !c.url)) {
      this.tagger.toast?.('One or more clips could not be opened from that folder. Nothing was changed.');
      return false;
    }
    // File discovery and URL resolution cross native async boundaries. Recheck
    // immediately before mutation so a game/root change cannot receive another
    // game's playlist or linked-folder metadata.
    if (moved() || backend.getLibraryRoot() !== root) {
      this.tagger.toast?.('Game or film library changed before linking finished. Try again on the intended game.');
      return false;
    }

    // Capture the live game before any relink mutation. The canonical write is
    // the commit point; any exception or false save restores this exact state,
    // but only while the season it started on is still the open one.
    this.commitActive();
    this._cancelPendingSaves();
    const owner = this.seasonStore.data;
    const beforeSeason = JSON.parse(JSON.stringify(owner));
    this._maybeSnapshot(true, 'Before linking film');
    try {
      game = this.seasonStore.activeGame();
      game.filmMode = 'linked';
      game.filmDir = filmDir;
      if (this.tagger.plays.length) {
        await this.playlist.rehydrateFromDisk(clips, this.tagger.plays);
      } else {
        this.playlist.reset();
        for (const c of clips) {
          this.playlist.clips.push({
            id: this.playlist._nextClipId++, file: null,
            name: this._pathWithoutExt(c.name), clipPath: this._pathWithoutExt(c.path),
            assetUrl: c.url, objectUrl: null, duration: null, playId: null,
          });
        }
        await this.playlist._autoCreatePlays();
      }
      if (moved() || this.seasonStore.data !== owner) throw new Error('season or game changed while linking');
      if (this.playlist.activeClipIndex === -1 && this.playlist.clips.length > 0) this.playlist.switchToClip(0);
      this.videoFileName = null;
      this.commitActive();
      const saved = await this.seasonStore.persist(seasonId, owner);
      if (!saved) throw new Error('canonical season save failed');
      backend.rememberLinkedDir?.(folder);
      backend.setFilmStorageMode?.('linked');
      this._signalSave?.('saved');
      this.tagger.toast?.(`Linked ${clips.length} clip${clips.length === 1 ? '' : 's'} from ${folder} - no copy made.`, 7000);
      return true;
    } catch (e) {
      if (this.seasonStore.currentSeasonId === seasonId && this.seasonStore.data === owner) {
        this.seasonStore.cancelPendingDiskWrite?.();
        this.seasonStore.data = beforeSeason;
        this._clearForNewGame();
        await this._loadActiveGame({ renderGames: false });
        this.tagger.toast?.('Film was not linked because the season could not be saved. Your previous film setup was restored.', 10000);
      } else {
        this.tagger.toast?.('Film was not linked because the season changed before it was saved. Link it again from that game.', 10000);
      }
      return false;
    }
  }

  async importFilm(files) {
    const backend = this.seasonStore.backend;
    if (!backend.supportsFilm || !backend.supportsFilm()) return;
    // No desktop film is copied until the coach makes an explicit storage
    // choice. This is the final guard for drag/drop and future import paths.
    if (backend.supportsLinkedFilm?.() && !backend.getFilmStorageMode?.()) {
      const mode = await window.app?.uiPolish?.ensureFilmStorageMode?.();
      if (!mode) {
        this.tagger.toast?.('Choose film storage before adding film.');
        return;
      }
      if (mode === 'linked') {
        this.tagger.toast?.('Your library is linked. Choose the game folder to keep these clips in place.', 6000);
        await this.linkFilmFolder();
        return;
      }
    }
    const game = this.seasonStore.activeGame();
    if (!game) return;
    // Linked games reference clips in the coach's own folder and are never copied
    // into the managed library. This method is the single persist choke point for
    // every add path (top-bar picker + Playlist-panel "Add Clips"), so it must be
    // a safe no-op for a linked game.
    if (game.filmMode === 'linked') return;
    // The season this write belongs to, pinned BEFORE the await: managed film
    // lands under the season open right now, and the in-flight operation is
    // identified by that season plus the game, never by a bare game id.
    const filmSeasonId = this.seasonStore.currentSeasonId;
    try {
      await backend.importFilm(game.id, files, (done, total) => {
        const app = window.app;
        if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total, 'saving', game.id, filmSeasonId);
      });
      // This game's film now lives in the managed library — record the mode so
      // auto-load takes the managed branch on reopen. (Clears a stale filmMode so
      // a game that was linked, then repaired with copied film, stops trying to
      // auto-load the old linked folder.)
      if (game.filmMode !== 'managed' || game.filmDir) {
        game.filmMode = 'managed';
        game.filmDir = null;
        this.seasonStore.persist();
      }
    } catch (e) {
      window.app?.workspace?.clearFilmOperation(game.id, filmSeasonId);
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

    // The repair belongs to the season and game it started on. The copy can take
    // minutes; if the coach opens another game meanwhile, nothing is loaded,
    // committed or saved into that one. The copied film stays in the library.
    const ownerSeasonId = this.seasonStore.currentSeasonId;
    const moved = () => {
      if (this.seasonStore.currentSeasonId === ownerSeasonId && this.seasonStore.data?.activeGameId === game.id
        && this._loadedGameId === game.id) return false;
      window.app?.workspace?.clearFilmOperation(game.id, ownerSeasonId);
      this.tagger.toast?.('Film repair stopped: the game changed. Open that game and repair its film again.', 10000);
      return true;
    };
    // Success is announced only after the season save lands.
    const saveRepair = async () => {
      this.commitActive();
      const saved = await this.seasonStore.persist();
      if (saved === false) {
        this.tagger.toast?.('Film was copied, but the repair was not saved. Try the repair again.', 10000);
        return false;
      }
      this._signalSave('saved');
      return true;
    };

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
      const filmSeasonId = this.seasonStore.currentSeasonId;
      let imported;
      try {
        imported = await backend.importFilm(game.id, [file], (done, total) => {
          const app = window.app;
          if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total, 'repairing', game.id, filmSeasonId);
        });
      } catch (e) {
        window.app?.workspace?.clearFilmOperation(game.id, filmSeasonId);
        throw e;
      }
      const ref = (Array.isArray(imported) && imported[0]) || file.name;
      const url = backend.filmUrl ? await backend.filmUrl(game.id, ref) : null;
      if (moved()) return false;
      this.videoFileName = this._fileRefName(ref) || file.name;
      if (url) this.vc.loadUrl(url, this.videoFileName);
      else this.vc.loadFile(file);
      // Repair copies into the managed library, so this game is managed now — a
      // formerly-linked game must stop auto-loading its old linked folder.
      game.filmMode = 'managed'; game.filmDir = null;
      if (!(await saveRepair())) return false;
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

    const repairSeasonId = this.seasonStore.currentSeasonId;
    try {
      this._maybeSnapshot(true, 'Before film repair');
      const matchedFiles = plan.matches.map(m => m.file);
      const imported = await backend.importFilm(game.id, matchedFiles, (done, total) => {
        const app = window.app;
        if (app && app._showFilmImportProgress) app._showFilmImportProgress(done, total, 'repairing', game.id, repairSeasonId);
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
      if (moved()) return false;
      const missingUrls = playableMatches.filter(m => !m.url).length;
      await this.playlist.repairWithMatches(playableMatches);
      if (moved()) return false;
      this.videoFileName = null;
      // Managed copy now owns this game's film — clear any stale linked mode.
      game.filmMode = 'managed'; game.filmDir = null;
      if (!(await saveRepair())) return false;
      this.tagger.toast?.(missingUrls
        ? `Film repaired, but ${missingUrls} clip${missingUrls === 1 ? '' : 's'} could not be loaded from the library yet.`
        : `Film repaired and loaded: ${plan.matches.length} clip${plan.matches.length === 1 ? '' : 's'} linked.`);
      return true;
    } catch (e) {
      window.app?.workspace?.clearFilmOperation(game.id, repairSeasonId);
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
    this._filmLoadSeq++;   // invalidate any film load still in flight for the outgoing game
    try { if (this.vc && this.vc.unloadVideo) this.vc.unloadVideo(); } catch (e) {}
    try { if (this.playlist && this.playlist.reset) this.playlist.reset(); } catch (e) {}
    this.videoFileName = null;
    this.canvas.annotations = [];
    this._loadedGameId = null;   // nothing loaded → commitActive must not write a blank/stale tagger over a game
    // The outgoing game's selection is meaningless in the next one — and play
    // ids restart per game, so a stale currentPlayId would silently highlight
    // an unrelated play if the incoming game has no saved selection.
    this.tagger.currentPlayId = null;
    if (window.app && window.app._clearGameInfoForm) window.app._clearGameInfoForm();
    this.tagger._emit('plays-loaded');   // Film Room grid: re-render + drop stale row selections
  }

  /** Switch which game is active. Reel playback may opt out of intermediate
   * commits/persists after saving its launch game once. */
  switchToGame(id, options = {}) {
    const { commit = true, persist = true, reloadActiveFilm = false } = options;
    if (!this.seasonStore.data) return Promise.resolve(false);
    if (id === this.seasonStore.data.activeGameId) {
      if (!reloadActiveFilm) return Promise.resolve(true);
      const active = this.seasonStore.activeGame();
      return active
        ? this._autoLoadFilm(active).then(() => true).catch(() => false)
        : Promise.resolve(false);
    }
    if (commit) this.commitActive();
    if (!this.seasonStore.setActive(id)) return Promise.resolve(false);
    if (persist) this.seasonStore.persist();
    this._clearForNewGame();
    return this._loadActiveGame();
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
      const game = this.seasonStore.addGame();
      game.gameInfo = { ...(game.gameInfo || {}), perspective: 'offense' };
    } else {
      window.app?.tagger?.toast?.('Your current game is still empty — it IS the new game. Load film or tag plays to fill it.');
    }
    this.seasonStore.persist();
    this._clearForNewGame();
    this._loadActiveGame();
    return this.seasonStore.activeGame();
  }

  /** Delete a game. Resolves true once the deletion is durable; a failed save
   *  puts the game back, resolves false and never purges its film. */
  async removeGame(id) {
    // Risky op: force a restore point of the pre-delete state.
    this._maybeSnapshot(true, 'Before deleting game');
    const data = this.seasonStore.data;
    const wasActive = data && id === data.activeGameId;
    const beforeGames = data ? data.games.slice() : [];
    const beforeActive = data && data.activeGameId;
    // Stash the node in memory so the post-delete toast can offer Undo (the
    // undo stack is game-scoped by design — lesson #19 — so game deletion
    // needs its own one-shot restore). Session-only, overwritten per delete.
    const games = (this.seasonStore.data && this.seasonStore.data.games) || [];
    const gi = games.findIndex(g => g.id === id);
    // A new delete closes the PREVIOUS delete's undo window → purge that game's
    // film now (it was deferred from its own removeGame so undo could restore it).
    this._purgeStaleDeletedFilm();
    // The film is not purged until the deletion is durable (`durable`) and its
    // undo window closes: the timer, a newer delete, or leaving the season. Undo
    // restores the game node, whose tags reference this film, and cancels the timer.
    const stash = gi >= 0
      ? { node: JSON.parse(JSON.stringify(games[gi])), index: gi, seasonId: this.seasonStore.currentSeasonId, filmGameId: id, durable: false }
      : null;
    this._lastDeletedGame = stash;
    this._cancelFilmPurgeTimer();
    this.seasonStore.removeGame(id);
    const saving = this.seasonStore.persist();
    if (wasActive) { this._clearForNewGame(); this._loadActiveGame(); }
    const saved = await saving;
    if (saved === false) {
      if (stash) stash.filmGameId = null;
      if (this._lastDeletedGame === stash) this._lastDeletedGame = null;
      // Put the game back only in the season it was deleted from, if still open.
      if (this.seasonStore.data === data) {
        data.games.splice(0, data.games.length, ...beforeGames);
        if (wasActive) {
          data.activeGameId = beforeActive;
          this._clearForNewGame();
          await this._loadActiveGame();
        }
      }
      return false;
    }
    if (stash) {
      stash.durable = true;
      if (this._lastDeletedGame === stash) {
        if (stash.filmGameId) this._filmPurgeTimer = setTimeout(() => this._purgeStaleDeletedFilm(), this.undoGameWindowMs());
      } else {
        // A newer delete closed this one's undo window while it was saving.
        this._purgeDeletedFilm(stash);
      }
    }
    return true;
  }

  undoGameWindowMs() { return Number(this.UNDO_FILM_WINDOW_MS) || 30000; }

  _cancelFilmPurgeTimer() { if (this._filmPurgeTimer) { clearTimeout(this._filmPurgeTimer); this._filmPurgeTimer = null; } }

  /** Delete the last-deleted game's film once its undo window has closed (the
   *  undo-window timer fires, a newer delete, or leaving the season). No-op if
   *  the delete was undone (undo nulls the stash, so its film is preserved).
   *  Desktop-only; no film on the browser. */
  _purgeStaleDeletedFilm() {
    this._cancelFilmPurgeTimer();
    this._purgeDeletedFilm(this._lastDeletedGame);
  }

  _purgeDeletedFilm(stash) {
    if (!stash || !stash.filmGameId) return;
    // A deletion still saving purges nothing; removeGame purges or arms the
    // timer once the deletion is durable.
    if (stash.durable === false) return;
    const backend = this.seasonStore.backend;
    if (backend.supportsFilm && backend.supportsFilm()) {
      // Game ids can repeat across seasons. Carry the stash's owner all the way
      // to the filesystem instead of letting the current navigation pointer
      // choose which season's film directory is deleted.
      backend.deleteFilm(stash.filmGameId, stash.seasonId).catch(() => {});
    }
    stash.filmGameId = null;
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
    this._cancelFilmPurgeTimer();   // undo restores the game → its film must NOT be purged
    stash.filmGameId = null;        // nor by a deletion save that settles after the undo
    this._lastDeletedGame = null;
    // Refresh every games view that may be showing (all display-only).
    try { window.app && window.app._renderGamesPanel && window.app._renderGamesPanel(); } catch (e) {}
    return true;
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
      plays: plays,
      annotations: this.canvas.annotations,
      currentPlayId: this.tagger.currentPlayId,
      nextId: this.tagger.nextId,
      clipNames: clipIndex.map(c => c.name),
      clipPaths: clipIndex.map(c => c.clipPath),
      clipRefs: clipIndex.map(c => ({
        id: c.clipPath,
        catalogClipId: c.catalogClipId,
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

  /** The clip identity of a durable clipRef, in the SAME key space the plays
   *  and the playlist use (a trimmed raw path/name). `SqlCatalog
   *  .ensureClipIdentities` reads a ref the same way; this is not a second
   *  resolver, it is that one field order applied to one ref. */
  _refIdentity(ref) {
    if (!ref) return '';
    return String(ref.originalRelativePath || ref.libraryRelativePath || ref.id
      || ref.displayName || ref.originalName || '').trim();
  }

  /** Clip identities recorded on the game node the live tagger is loaded from.
   *  Empty whenever the tagger does not hold the active game, so a cross-game
   *  serialize can never inherit another game's film index. */
  _priorClipRefs() {
    const data = this.seasonStore?.data;
    if (!data || this._loadedGameId == null || this._loadedGameId !== data.activeGameId) return [];
    const node = this.seasonStore.activeGame?.();
    return Array.isArray(node?.clipRefs) ? node.clipRefs : [];
  }

  /** Mark a clip identity as deliberately removed by the coach. Honoured by
   *  `_buildClipIndex` only when no surviving play references it, so a shared
   *  clip survives one of its plays being deleted, and Undo restores both.
   *  The coach's source file is never touched by this. */
  forgetClipIdentity(identity) {
    const id = String(identity || '').trim();
    if (!id) return false;
    if (this._removedClipIds.has(id)) return true;
    this._removedClipIds.add(id);
    // The removal reaches disk on its own: an uncharted clip emits no play
    // event, so without this, closing the app would bring the record back.
    // Debounced like every edit, so the play-backed path coalesces into one
    // write.
    this._autoSave();
    return true;
  }

  /** Undo the signal above: the clip is wanted again, so the durable index stops
   *  dropping it. Called when Undo restores a play whose clip was removed. */
  rememberClipIdentity(identity) {
    const id = String(identity || '').trim();
    if (!id || !this._removedClipIds.has(id)) return false;
    this._removedClipIds.delete(id);
    this._autoSave();
    return true;
  }

  // Ordered clip index for the game node: the game's OWN durable clip records,
  // unioned with every clip the PLAYS reference (their durable clipName/
  // clipPath) and with the live playlist's load state. Never shrinks below what
  // the plays reference — the fix for the film-index wipe — and never below what
  // the game already recorded, which is the fix for the reverse wipe: opening a
  // game WITHOUT its film left the playlist empty, so a save rebuilt the index
  // from the plays alone and silently pruned every clip that had no play
  // (OL Lakes: 89 durable records against 83 charted clips). The only way an
  // identity leaves is `forgetClipIdentity` — a deliberate in-app deletion —
  // and only when no surviving play still references it.
  _buildClipIndex() {
    const order = [];
    const byId = new Map();
    const put = (id, data) => {
      if (!id) return;
      if (!byId.has(id)) { byId.set(id, { name: id, clipPath: id, originalName: id, duration: null, importStatus: 'missing' }); order.push(id); }
      const e = byId.get(id);
      for (const k of Object.keys(data)) if (data[k] != null && data[k] !== '') e[k] = data[k];
    };
    // The game's own record first, so durable order is stable across saves.
    for (const ref of this._priorClipRefs()) {
      const id = this._refIdentity(ref);
      if (!id) continue;
      put(id, {
        name: ref.displayName || ref.originalName || id,
        clipPath: ref.originalRelativePath || ref.libraryRelativePath || id,
        catalogClipId: ref.catalogClipId || null,
        originalName: ref.originalName || ref.displayName || id,
        duration: ref.duration != null ? ref.duration : null,
        importStatus: ref.importStatus || null,
      });
    }
    for (const p of (this.tagger.plays || [])) {
      const id = ((p.clipPath || p.clipName) || '').trim();
      if (!id) continue;
      const dur = (p.timestamp && p.timestamp.end && p.timestamp.end !== 999) ? p.timestamp.end : null;
      put(id, { name: p.clipName || id, clipPath: p.clipPath || p.clipName || id, catalogClipId: p.catalogClipId || null, originalName: p.clipName || id, duration: dur });
    }
    if (this.playlist) {
      for (const c of this.playlist.clips) {
        const id = ((c.clipPath || c.name) || '').trim();
        put(id, { name: c.name || id, clipPath: c.clipPath || c.name || id, catalogClipId: c.catalogClipId || null, originalName: (c.file ? c.file.name : c.name) || id, duration: c.duration || null, importStatus: (c.assetUrl || c.file) ? 'ready' : 'missing' });
      }
    }
    // Deliberate removals, applied last and only where nothing survives that
    // still needs the clip. A play restored by Undo puts its identity back into
    // `referenced` and so keeps its clip.
    if (this._removedClipIds.size) {
      const referenced = new Set();
      for (const p of (this.tagger.plays || [])) {
        const id = ((p.clipPath || p.clipName) || '').trim();
        if (id) referenced.add(id);
      }
      return order.filter(id => !this._removedClipIds.has(id) || referenced.has(id)).map(id => byId.get(id));
    }
    return order.map(id => byId.get(id));
  }

  _catalogClipIdsForFiles(gameNode, files) {
    const refs = (gameNode && Array.isArray(gameNode.clipRefs))
      ? gameNode.clipRefs.filter(ref => ref && ref.catalogClipId)
      : [];
    const ids = new Array((files || []).length).fill(null);
    if (!refs.length || !files || !files.length) return ids;
    const incoming = files.map(file => ({
      path: this._fileRefPath(file),
      name: this._fileRefName(file),
    }));
    const plan = planClipMatch(refs, incoming);
    for (const match of plan.matches) ids[match.clipIndex] = refs[match.playIndex].catalogClipId;
    return ids;
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
    this._signalSave('pending');
    const saved = await Promise.resolve(this.seasonStore.persist()).then(ok => ok !== false, () => false);
    if (!saved) { this._signalSave('failed'); return false; }
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

  /** Restore a previous save; reloads the active game on success. */
  async restoreBackup(id) {
    // A restore discards the current state, so a pending autosave describing
    // it must not survive: it could fire during the restore's awaits and stamp
    // the pre-restore plays into the restored season (the _loadedGameId guard
    // passes, because the active game id is usually unchanged).
    this._cancelPendingSaves();
    const data = await this.seasonStore.restoreBackup(id);
    // Every failure keeps its caller-owned messaging (an old-format restore
    // point sets SeasonStore.lastRestoreRefusal).
    if (!data) return false;
    this._afterSeasonLoaded();
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
   * Load a file picked via the fallback <input>. A current season file (has
   * `games`) replaces the season; an old-format file, a single-game save
   * included, is refused.
   */
  loadProject(file) {
    const reader = new FileReader();
    reader.onload = async (e) => {
      let parsed;
      try { parsed = JSON.parse(e.target.result); }
      catch (err) { alert('Invalid project file.'); return; }

      // An old-format file (a pre-conversion season or a single-game save) is
      // refused before any scaffold season or the open game is touched; the file
      // on disk is unchanged.
      if (parsed && (Array.isArray(parsed.games) || Array.isArray(parsed.plays)) && !SeasonFormat.isCurrentSeason(parsed)) {
        this.tagger?.toast?.(SeasonFormat.MESSAGE, 8000);
        return;
      }

      if (parsed && Array.isArray(parsed.games)) {
        // First run, or no season open (e.g. importing a desktop season into a
        // fresh web app): register a library entry first, since adopt() writes
        // into the current season. The whole import is one fence, re-checked
        // at every await:
        //   1. createUnclaimedSeasonIfEmpty() creates the scaffold and makes it
        //      current only if the coach opened nothing meanwhile.
        //   2. `destSeasonId` is captured right before adopt(), matching the id
        //      adopt() captures itself.
        //   3. On failure, the scaffold this call claimed is deleted by that
        //      captured id, never a value re-read after an await.
        //   4. On success, the editor reloads only if `destSeasonId` is still
        //      the open season.
        let scaffoldSeasonId = null;
        if (!this.seasonStore.hasCurrent()) {
          const { rec, claimed } = await this.seasonStore.createUnclaimedSeasonIfEmpty({
            name: parsed.seasonName || String(file.name || 'Imported Season').replace(/\.json$/i, ''),
            teamId: (() => { try { return localStorage.getItem('ffa_active_team_id') || ''; } catch (err2) { return ''; } })(),
          });
          if (rec && !claimed) {
            // A concurrent operation opened/created a season WHILE this
            // scaffold's own durable creation was in flight. It was never
            // made live and never received any import data -- delete it and
            // abort. The coach's concurrent action is completely untouched;
            // it never shared a code path with any of this.
            try { await this.seasonStore.deleteSeason(rec.id); } catch (err0) {}
            this.tagger?.toast?.('Import failed — the season could not be saved. Nothing on screen changed.', 8000);
            return;
          }
          scaffoldSeasonId = (rec && rec.id) || null;
        }
        const destSeasonId = this.seasonStore.currentSeasonId;   // == what adopt() itself will capture; no await between here and the call below
        // adopt() reports the durable result; a rejected write is never shown
        // as a successful import, and on failure the editor and store are
        // exactly as before.
        const result = await this.seasonStore.adopt(parsed);
        if (!result || result.ok === false) {
          // A destination season created SOLELY for this failed import is now
          // an orphaned, empty library entry with no purpose — roll it back
          // rather than leaving the coach a phantom season they never asked
          // for and that has no data.
          if (scaffoldSeasonId) {
            try { await this.seasonStore.deleteSeason(scaffoldSeasonId); } catch (err3) {}
          }
          this.tagger?.toast?.('Import failed — the season could not be saved. Nothing on screen changed.', 8000);
          return;
        }
        if (this.seasonStore.currentSeasonId !== destSeasonId) {
          // The import's OWN destination season saved durably, but the coach
          // switched to a different season while that save was pending.
          // adopt() already guaranteed their live season was never touched;
          // reloading the editor here would only interrupt whatever they're
          // doing now for no reason connected to it, so skip it silently.
          return;
        }
        this._afterSeasonLoaded();
      } else {
        alert('Invalid project file.');
        return;
      }
      // If the coach is on Team Hub (first-run import), reload it: recovery
      // rebuilds team identity from the imported season's teamProfile, so they
      // land on a populated hub rather than first-run setup.
      const hub = window.app?.teamHubScreen;
      if (hub && hub.host && !hub.host.hidden) await hub.load();
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
    const frameDur = 1 / (Number(this.vc.fps) || 30);

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
      'Field Side', 'Yard Line',
      // The pre-snap look exports through the one projection (GRIDIRON-IQ-TAG-MODEL.md
      // §20), so a CSV agrees with Film Room, Study, and analytics. Formation
      // and Receiver Alignment are their own columns, as are QB Alignment and
      // Coverage Family; a blank exports blank ("Unknown" would read as a real
      // analytics category). The run and motion details follow the field that
      // opens them (ChartingDetails).
      'Formation', 'Receiver Alignment', 'QB Alignment', 'Backfield', 'Offensive Line Strength', 'Personnel', 'Motion',
      'Motion Starts', 'Motion Ends',
      'Play Call', 'Play Call ID', 'Play Concept',
      'Run/Pass', 'Play Type', 'Play Dir', 'Gap', 'RPO Read', 'RPO Defender', 'RPO Decision', 'QB Run Type', 'Def Front',
      'Coverage Call', 'Coverage Family', 'Blitz', 'Result', 'Fumble Recovery',
      'Yardage', 'Hash', 'Ball Carrier', 'Passer', 'Receiver', 'Tackler',
      'Takeaway', 'Kicker', 'Returner',
      'BC Grade', 'Passer Grade', 'Receiver Grade', 'Tackler Grade', 'Takeaway Grade',
      'Penalties JSON', 'Resulting Situation JSON', 'Custom Tags', 'Notes'
    ];

    const rows = this.tagger.plays.map(p => {
      // ONE projection per play, read through the same seam analytics uses, so a
      // CSV row and a Film Room row can never disagree about the same play.
      const look = StatsEngine.proj(p);
      return [
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
      look.formationFamily ?? '',
      look.receiverSet ?? '',
      look.qbAlignment ?? '',
      look.backfield ?? '',
      look.strength ?? '',
      p.tags.personnel || '',
      p.tags.motion || '',
      p.tags.motionStart || '',
      p.tags.motionEnd || '',
      p.tags.playCall || '',
      p.tags.playCallId || '',
      p.tags.playConcept || '',
      p.tags.runPass || '',
      p.tags.playType,
      p.tags.playDir || '',
      p.tags.gap || '',
      p.tags.rpoRead || '',
      p.tags.rpoDefender || '',
      p.tags.rpoDecision || '',
      p.tags.qbRun || '',
      p.tags.defFront,
      look.coverage ?? '',
      look.coverageFamily ?? '',
      p.tags.blitz,
      p.tags.result,
      p.tags.fumbleRecovery || '',
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
      Array.isArray(p.penalties) && p.penalties.length ? JSON.stringify(PenaltyModel.normalizeList(p.penalties)) : '',
      p.resultingSituation ? JSON.stringify(PenaltyModel.normalizeSituation(p.resultingSituation)) : '',
      (p.tags.custom || []).join('; '),
      (p.notes || '')
      ];
    });

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

    // Quote EVERY cell and escape embedded quotes ("→""). Previously only the
    // notes cell escaped, so any formation/custom-tag/player value containing a "
    // produced a malformed row that broke Excel/Hudl import. Also guard against
    // CSV formula injection (a leading = + - @ can execute when the file is opened
    // in a spreadsheet — reachable via an imported season's tag names), but never
    // mangle a real number, so signed yardage like -5 stays numeric.
    const esc = (cell) => {
      let s = String(cell ?? '');
      if (/^[=+\-@\t\r]/.test(s) && !isFinite(Number(s))) s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const csv = [headers, ...rows]
      .map(row => row.map(esc).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv' });
    const name = this._projectFileBase() + '_plays.csv';
    this._download(blob, name);
  }

  exportHtmlReport(statsEngine) {
    if (!statsEngine) return;
    const stats = statsEngine.compute();
    const title = statsEngine._gameTitle ? statsEngine._gameTitle() : 'Game Report';
    const html = buildGameHtmlReport({ title, stats, engine: statsEngine });
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
        if (ch === '"') {
          // A doubled "" inside a quoted field is a literal quote (matches how
          // exportCsv escapes), not two toggles that would drop the character.
          if (inQuotes && line[i + 1] === '"') { current += '"'; i++; continue; }
          inQuotes = !inQuotes; continue;
        }
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
      result: 'result', fumblerecovery: 'fumbleRecovery', recoveryowner: 'fumbleRecovery', gnls: 'yardage', yardage: 'yardage', yards: 'yardage', yds: 'yardage',
      down: 'down', dn: 'down',
      distance: 'distance', dist: 'distance', togo: 'distance',
      // The offense's look, each part its own column (the headers our export
      // writes). Formation is a single coach-named value; combined look values
      // are refused during row validation, never split by an import reader.
      formation: 'formationFamily', formationfamily: 'formationFamily', family: 'formationFamily',
      receiveralignment: 'receiverSet', receiverdistribution: 'receiverSet', receiverset: 'receiverSet', recset: 'receiverSet',
      offensivestrength: 'strength', offensivelinestrength: 'strength',
      motionstarts: 'motionStart', motionstart: 'motionStart', motionends: 'motionEnd', motionend: 'motionEnd',
      gap: 'gap', rporead: 'rpoRead', rpodefender: 'rpoDefender', rpodecision: 'rpoDecision',
      qbruntype: 'qbRun', qbrun: 'qbRun',
      // `Unit` has been an EXPORT column all along but was never imported, so every
      // round-tripped defensive/ST play came back unit-less — and StatsEngine reads a
      // unit-less play as OFFENSE, silently corrupting every unit-partitioned metric
      // while the six projected fields still looked perfect.
      // (`side` is deliberately NOT aliased here — it already means fieldSide below,
      // and a duplicate key would silently resolve to whichever came last.)
      unit: 'unit', unitside: 'unit',
      qbalignment: 'qbAlignment', qbalign: 'qbAlignment', qbal: 'qbAlignment',
      backfield: 'backfield', backs: 'backfield',
      strength: 'strength', formationstrength: 'strength',
      coveragecall: 'coverage', coveragefamily: 'coverageFamily', covfamily: 'coverageFamily',
      personnel: 'personnel', pers: 'personnel', offpers: 'personnel',
      hash: 'hash', hashmark: 'hash',
      motion: 'motion',
      playcall: 'playCall', call: 'playCall',
      playcallid: 'playCallId', callid: 'playCallId',
      playconcept: 'playConcept', concept: 'playConcept',
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
      penaltiesjson: 'penaltiesJson', structuredpenalties: 'penaltiesJson',
      resultingsituationjson: 'resultingSituationJson', nextsituationjson: 'resultingSituationJson',
      notes: 'notes', note: 'notes',
    };

    headers.forEach((h, i) => {
      if (aliases[h]) colMap[i] = aliases[h];
    });

    // Never silently drop fields from the superseded receiver-look schema.
    if (headers.some(h => ['form', 'offform', 'offenseformation', 'receiverlook', 'reclook', 'receiverside', 'recside', 'receiverstrength', 'recstrength', 'linebalance'].includes(h))) {
      return { count: 0, error: SeasonFormat.MESSAGE };
    }

    return { headers: parseLine(lines[0]), colMap, lines: lines.slice(1).map(parseLine), delim };
  }

  applyPlayImport(parsed) {
    if (!parsed || !parsed.lines) return 0;
    const { colMap, lines } = parsed;
    let count = 0;
    this.lastImportRefusal = null;
    const pending = [];

    // Validate the final mapping, including edits made in the import sheet,
    // before duplicate assignments can hide a value from row validation.
    const mappedFields = new Map();
    for (const [colIdx, field] of Object.entries(colMap)) {
      if (!field) continue;
      if (mappedFields.has(field)) {
        const columnName = idx => parsed.headers?.[Number(idx)] || `Column ${Number(idx) + 1}`;
        this.lastImportRefusal = `Columns "${columnName(mappedFields.get(field))}" and "${columnName(colIdx)}" both map to ${field}. Map only one column to each field. Nothing was imported.`;
        return 0;
      }
      mappedFields.set(field, colIdx);
    }

    const playerFields = ['ballCarrier', 'passer', 'receiver', 'tackler'];

    for (const cells of lines) {
      if (cells.every(c => !c)) continue;

      // `unit` defaults to offense to match a blank play from the tag form. A CSV
      // with no Unit column therefore behaves exactly as it did before.
      const tags = PlayTagger.blankTags({ unit: 'offense' });
      let notes = '';
      let penalties = [];
      let resultingSituation = null;
      // Did the coach chart ANY value on this row? Drives the skip guard below.
      // `unit` deliberately does not count — it is defaulted for every row, so
      // counting it would mean never skipping anything.
      let charted = false;

      for (const [colIdx, field] of Object.entries(colMap)) {
        const val = cells[parseInt(colIdx, 10)] || '';
        if (!val) continue;
        if (field === 'notes') { notes = val; continue; }
        if (field === 'penaltiesJson') {
          try { penalties = PenaltyModel.normalizeList(JSON.parse(val)); } catch {}
          continue;
        }
        if (field === 'resultingSituationJson') {
          try { resultingSituation = PenaltyModel.normalizeSituation(JSON.parse(val)); } catch {}
          continue;
        }
        if (playerFields.includes(field)) {
          tags.players[field] = val;
          charted = true;
          continue;
        }
        if (field === 'unit') {
          // Only the three real units may be written. An unrecognized value keeps
          // the 'offense' default rather than inventing a fourth unit that no form,
          // filter, or report knows how to render.
          const u = val.toLowerCase().replace(/[^a-z]/g, '');
          const known = { offense: 'offense', off: 'offense', o: 'offense',
                          defense: 'defense', def: 'defense', d: 'defense',
                          special: 'special', specialteams: 'special', st: 'special' };
          if (known[u]) tags.unit = known[u];
          continue;
        }
        tags[field] = val;
        charted = true;
      }

      // Skip only a row where the coach charted NOTHING. The old guard demanded a
      // playType, result, yardage, down, or penalty, so a play charted solely as
      // "Shotgun + Trips" or "Cover 3" was silently DROPPED on import — which
      // contradicts the standing rule that a coach may chart only the fields they
      // want (blank values are valid; Save & Next never required a chip). `charted`
      // is set by the mapping loop above, so any real value on any mapped column
      // keeps the row, while a genuinely blank row is still skipped.
      if (!charted && !notes && !penalties.length && !resultingSituation) continue;

      const play = {
        id: null,
        timestamp: { start: 0, end: 0 },
        tags,
        annotations: [],
        notes,
        ...(penalties.length ? { penalties } : {}),
        ...(resultingSituation ? { resultingSituation } : {})
      };
      pending.push(play);
    }

    // A row with an old combined look ("Shotgun + Trips" in Formation, a
    // family in Coverage) means an old export: the whole file is refused and
    // nothing is added.
    if (pending.some(p => TagProjection.isCombined(p.tags))) {
      this.lastImportRefusal = SeasonFormat.MESSAGE;
      return 0;
    }
    // A detail without its opening field, or a value the app does not offer:
    // the file is refused with the first row's reason and nothing is added.
    // Nothing is inferred or repaired. Gap and Play Direction are independent.
    for (let i = 0; i < pending.length; i++) {
      const reason = [...ChartingDetails.problems(pending[i].tags), ...ChartingDetails.vocabularyProblems(pending[i].tags)][0];
      if (reason) { this.lastImportRefusal = `Data row ${i + 1}: ${reason}. Nothing was imported.`; return 0; }
    }
    for (const play of pending) {
      play.id = this.tagger.nextId++;
      this.tagger.plays.push(play);
      count++;
    }

    if (count > 0) {
      this.tagger._emit('play-created');
    }

    return count;
  }
}
