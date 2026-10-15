import { countedUnit } from './football-rules.js';
/**
 * App - Main bootstrap module. Wires all components together and manages keyboard shortcuts.
 */
import { VideoController } from './video-controller.js';
import { CanvasOverlay } from './canvas-overlay.js';
import { PlayTagger } from './play-tagger.js';
import { RosterManager } from './roster-manager.js';
import { PlayFilter } from './play-filter.js';
import { NotesManager } from './notes-manager.js';
import { StorageManager } from './storage.js';
import { ffaSaveBlob } from './storage-backend.js';
import { PlayDetector } from './play-detector.js';
import { ClipAnalyzer } from './clip-analyzer.js';
import { BackendClient } from './backend-client.js';
import { VisionAnalyzer } from './vision-analyzer.js';
import { PlaylistManager } from './playlist-manager.js';
import { QuickChart } from './quick-chart.js';
import { StatsEngine } from './stats-engine.js';
import { AnalyticsRegistry } from './analytics-registry.js';
import { WorkspaceContext } from './workspace-context.js';
import { StudyQuery } from './study-query.js';
import { CrossGameCutup } from './cross-game-cutup.js';
import { FilmNavigationService } from './film-navigation-service.js';
import { StudyScreen } from './study-screen.js';
import { ReportsScreen } from './reports-screen.js';
import { SettingsScreen } from './settings-screen.js';
import { PlayImportScreen } from './play-import-screen.js';
import { ShortcutsScreen } from './shortcuts-screen.js';
import { TeamHubScreen } from './team-hub-screen.js';
import { GameScreen } from './game-screen.js';
import { HomeScreen } from './home-screen.js';
import { GameThumbnailService } from './game-thumbnail.js';
import { getNativeOverlayService } from './native-root.jsx';
import { StudyPlan } from './study-plan.js';
import { PlanExport } from './plan-export.js';
import { PlanScreen } from './plan-screen.js';
import { WorkspaceShell } from './workspace-shell.js';
import { NativeFilmRoomScreen } from './native-film-room-screen.js';
import { NativeTaggingScreen } from './native-tagging-screen.js';
import { BreakdownTheaterScreen } from './breakdown-theater-screen.js';
import { BreakdownWorkspace } from './breakdown-workspace.js';
import { HistoryManager } from './history-manager.js';
import { VersionManager } from './version-manager.js';
import { ScoreboardOCR } from './scoreboard-ocr.js';
import { CutupExporter } from './cutup-exporter.js';
import { CutupPlayer } from './cutup-player.js';
import { SeasonManager } from './season-manager.js';
import { CallSheetBuilder } from './call-sheet-builder.js';
import { UIPolish } from './ui-polish.js';
import { CustomFieldsManager } from './custom-fields.js';
import { CustomChips } from './custom-chips.js';
import { TagLibrarySettings } from './tag-library-settings.js';
import { BreakdownChartingService } from './breakdown-charting-service.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PlayDiagram } from './play-diagram.js';
import { MultiAngle } from './multi-angle.js';
import { Updater } from './updater.js';
import { TeamRegistry } from './team-registry.js';
import { GameContext } from './game-context.js';
import { PlaybookLibrary } from './playbook-library.js';
import { PlayGrid } from './play-grid.js';
import { AutoDetectScreen } from './auto-detect-screen.js';
import { configureBetaDefaults } from './beta-config.js';
// Import material styles last so they win source order over route styles.

import '../design-system/material.css';

/**
 * Single source of truth for the displayed app version. Keep in lockstep with
 * src-tauri/{Cargo.toml,tauri.conf.json,Cargo.lock} on every release (the web
 * bundle can't read those at runtime). On desktop, the live Tauri config
 * version overrides this at runtime via Updater._currentVersion().
 */
const APP_VERSION = '1.12.0-118';

class App {
  constructor() {
    configureBetaDefaults(localStorage, !!window.__TAURI__, APP_VERSION);
    this.saveBlob = (blob, filename) => ffaSaveBlob(blob, filename,
      { notify: message => this.history?._toast?.(message) });
    try { this.autoPlayNext = localStorage.getItem('ffa_autoplay_next') !== '0'; }
    catch { this.autoPlayNext = true; }

    this.vc = new VideoController({ notify: (message, durationMs) => this.overlays.toast({ message, durationMs }) });
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.roster = new RosterManager(this.tagger);
    this.filter = new PlayFilter(this.tagger);
    this.customFields = new CustomFieldsManager(this.tagger);
    this.customChips = new CustomChips(this.tagger);
    this.playbook = new PlaybookLibrary();
    this.tagLibrarySettings = new TagLibrarySettings(this.customChips, this.tagger,
      options => this.settingsScreen.open(options));
    this.breakdownCharting = new BreakdownChartingService(this.tagger);
    this.multiAngle = new MultiAngle(this.vc);
    this.notes = new NotesManager(this.vc, this.tagger);
    this.storage = new StorageManager(this.vc, this.tagger, this.canvas, { saveBlob: this.saveBlob });
    this.detector = new PlayDetector(this.vc, this.tagger);
    this.clipAnalyzer = new ClipAnalyzer();
    this.backend = new BackendClient();
    this.vision = new VisionAnalyzer({
      apiKey: (typeof localStorage !== 'undefined' && localStorage.getItem('ffa_claude_api_key')) || '',
    });
    this.playlist = new PlaylistManager(this.vc, this.tagger);
    // Let the tagger coordinate with the playlist (e.g. delete a play => also
    // drop its clip and advance, instead of unloading the whole player).
    this.tagger.playlist = this.playlist;
    this.stats = new StatsEngine(this.tagger, this.filter);
    this.stats.roster = this.roster;
    this.analyticsRegistry = new AnalyticsRegistry(this.stats);
    this.study = new StudyQuery(this.analyticsRegistry);
    this.crossGameCutup = new CrossGameCutup();
    this.studyScreen = new StudyScreen(this);
    this.studyPlan = StudyPlan;
    this.planExport = PlanExport;
    this.planScreen = new PlanScreen(this, { saveBlob: this.saveBlob });
    this.reportsScreen = new ReportsScreen(this, { saveBlob: this.saveBlob });
    this.overlays = getNativeOverlayService();
    if (!this.overlays) throw new Error('GridIron IQ native overlay service is unavailable.');
    this.playDiagram = new PlayDiagram(this.tagger, this.overlays);
    this.quickChart = new QuickChart(this.vc, this.tagger, this.playlist, this.overlays);
    this.settingsScreen = new SettingsScreen(this, this.overlays);
    this.playImport = new PlayImportScreen(this, this.overlays);
    this.shortcutsScreen = new ShortcutsScreen(this.overlays);
    this.autoDetectScreen = new AutoDetectScreen(this, this.overlays);
    this.history = new HistoryManager(this.tagger, this.overlays);
    this.versions = new VersionManager(this.storage, this.tagger, this.history);
    this.ocr = new ScoreboardOCR(this.vc, this.tagger);
    this.cutup = new CutupExporter(this.vc, this.tagger, this.filter, this.playlist, { saveBlob: this.saveBlob });
    this.cutupPlayer = new CutupPlayer(this.vc, this.tagger, {
      shouldAutoPlayNext: () => this.autoPlayNext,
    });
    this.playGrid = new PlayGrid(this.tagger, this.vc, this.cutupPlayer, this.playbook, this.customChips);
    this.season = new SeasonManager(this.stats, { storage: this.storage, roster: this.roster, saveBlob: this.saveBlob });

    this.gameContext = new GameContext({
      storage: this.storage,
      applyDraft: patch => this._applyGameInfoDraft(patch),
    });
    this.teamRegistry = new TeamRegistry({
      app: () => this,
      // Team identity updates canonical game metadata through the draft path.

      syncGame: profile => {
        const store = this.storage?.seasonStore;
        if (store?.data && store.data.kind !== 'scout') {
          store.data.teamProfile = { ...profile };
          for (const game of store.data.games || []) {
            game.gameInfo = { ...(game.gameInfo || {}), teamName: profile.teamName, jerseyColor: profile.jerseyColor };
          }
          if (this.storage.gameInfo) this._applyGameInfoDraft({ teamName: profile.teamName, jerseyColor: profile.jerseyColor });
          this.storage._autoSave();
        }
        this.homeScreen?.refreshIdentity?.();
        this.workspaceShell?._syncChrome?.();
      },
      notify: message => this.history?._toast?.(message),
    });
    this.teamHubScreen = new TeamHubScreen(this, this.overlays);
    this.gameScreen = new GameScreen(this, this.overlays);
    this.gameThumbnails = new GameThumbnailService(this);
    this.homeScreen = new HomeScreen(this, this.overlays, this.gameThumbnails);
    this.workspace = new WorkspaceContext(this);
    this.breakdownWorkspace = new BreakdownWorkspace(this);
    this.workspaceShell = new WorkspaceShell(this);
    this.filmNavigation = new FilmNavigationService({
      games: () => this.storage.seasonStore.data?.games || [],
      activeGameId: () => this.storage.seasonStore.data?.activeGameId,
      commitActive: () => this.storage.commitActive(),
      persist: () => this.storage.seasonStore.persist(),
      switchToGame: (gameId, options) => this.storage.switchToGame(gameId, options),
      filmHealth: game => this.workspace.filmHealth(game),
      showBreakdown: () => this.workspaceShell.show('breakdown'),
      syncChrome: () => this.workspaceShell._syncChrome?.(),
      cutupPlayer: this.cutupPlayer,
      tagger: this.tagger,
      videoController: this.vc,
      planner: this.crossGameCutup,
      toast: message => this.tagger.toast?.(message),
    });
    this.stats.filmNavigation = this.filmNavigation;
    this.breakdownTheater = new BreakdownTheaterScreen(this);
    this.nativeFilmRoom = new NativeFilmRoomScreen(this);
    this.nativeTagging = new NativeTaggingScreen(this);
    this.callSheet = new CallSheetBuilder(this.tagger, this.overlays);
    this.uiPolish = new UIPolish(this);
    this.vc.beforeFilesSelected = files => this.uiPolish.prepareFilmFiles(files);

    this.storage.playlist = this.playlist;
    this.storage.filter = this.filter;
    this.storage.versions = this.versions;

    this._wireEvents();

    this._bindGameInfo();

    this._bindKeyboard();

    this._bindToolUI();

    // Keep backend availability fresh for native Analysis settings.

    this._bindBackendStatus();

    this.storage.onSaveState = (s) => this._renderSaveState(s);
    this.storage.enableAutoSave();

    // Surface tagger feedback (e.g. "Mark the start first") through the
    // shared toast. Lazy lambda — history may not exist yet at bind time.
    this.tagger.toast = (msg, opts) => this.history?._toast(msg, opts);
    // Services the tagger and roster use, passed in rather than read off the global app.
    this.tagger.overlays = this.overlays;
    this.tagger.history = this.history;
    this.tagger.storage = this.storage;
    this.roster.storage = this.storage;
    this.roster.notify = message => this.overlays?.toast?.({ message, tone: 'warning' });
    // Read at call time: season and gameContext are built after the engine.
    const app = this;
    this.storage.deps = {
      get updater() { return app.updater; }, get roster() { return app.roster; },
      get playbook() { return app.playbook; }, get teamRegistry() { return app.teamRegistry; },
      get workspace() { return app.workspace; }, get history() { return app.history; },
      get stats() { return app.stats; }, get uiPolish() { return app.uiPolish; },
      get teamHubScreen() { return app.teamHubScreen; }, get tagger() { return app.tagger; },
      get overlays() { return app.overlays; },
      get finishHintShown() { return app._finishHintShown; }, set finishHintShown(value) { app._finishHintShown = value; },
      showFilmImportProgress: (...args) => app._showFilmImportProgress(...args),
      clearGameInfoForm: () => app._clearGameInfoForm(),
      loadGameInfo: info => app._loadGameInfo(info),
    };
    this.stats.deps = {
      get storage() { return app.storage; }, get season() { return app.season; },
      get gameContext() { return app.gameContext; }, get roster() { return app.roster; },
      get overlays() { return app.overlays; },
    };

    this._bindScoutMode();

    this._bindShortcuts();

    // The single top-bar undo/redo also drives canvas annotation undo when
    // there's no play-data action left to undo (mirrors Ctrl+Z).
    this.history.onUndoEmpty = () => this.canvas.undo();
    this.history.onRedoEmpty = () => this.canvas.redo();
    this.history.fallbackCanUndo = () => this.canvas.undoStack.length > 0;
    this.history.fallbackCanRedo = () => this.canvas.redoStack.length > 0;
    // Keep the undo/redo button enabled-state fresh as annotations change.
    this.canvas.on?.('annotation-added', () => this.history._updateUI());
    this.canvas.on?.('annotations-changed', () => this.history._updateUI());

    // Library-first startup: open to the Season Library instead of silently
    // loading a save file. Nothing loads until the coach opens/creates a season
    // (which then seeds history via storage._afterSeasonLoaded). Deferred to the
    // next tick so the global app is set for the modules that still read it.
    setTimeout(async () => {
      await this.storage.initLibrary();
      await this.workspaceShell.init();
      await this.workspaceShell.show('home');
      this.uiPolish.initFilmStorageSetup();
    }, 0);

    this._initVersionLabel();

    // Desktop auto-update (no-op on the web build).
    this.updater = new Updater(this.overlays);
    this.updater.init();
  }

  /** Cache the running version for the native More menu without a legacy DOM owner. */
  _initVersionLabel() {
    const isDesktop = !!(typeof window !== 'undefined' && window.__TAURI__);
    this._versionLabel = `GridIron IQ v${APP_VERSION} · ${isDesktop ? 'Desktop' : 'Web'}`;
    if (!isDesktop) return;
    try {
      const pending = window.__TAURI__?.app?.getVersion?.();
      if (pending && typeof pending.then === 'function') {
        pending.then(version => {
          if (version) this._versionLabel = `GridIron IQ v${version} · Desktop`;
        }).catch(() => {});
      }
    } catch (_) { /* keep the compiled version */ }
  }

  versionLabel() {
    return this._versionLabel || `GridIron IQ v${APP_VERSION} · ${window.__TAURI__ ? 'Desktop' : 'Web'}`;
  }

  /* Open the game through one idempotent command; a failed switch opens nothing and returns false. */
  /**
   * The one game-entry command. `opts.route` is the destination route (the
   * shell game switcher keeps the coach on the route they were reading);
   * omitted, it opens Break Down. Commit, persist, history reset and film load
   * order are the same either way.
   */
  async openGame(gid, opts = {}) {
    const store = this.storage?.seasonStore;
    if (!store?.data || gid == null) return false;
    const already = String(store.data.activeGameId) === String(gid);
    if (!already) {
      // Await the switch so the target game is live before the workspace transition.

      const ok = await this.storage.switchToGame(gid);
      if (ok === false) return false;
    }
    // The mounted shell owns navigation; the fallback handles a missing shell root.

    if (this.workspaceShell?.root) {
      // A requested route that the workspace guard rejects for this game falls
      // back to Break Down rather than stranding the coach on a blocked route.
      const requested = opts.route && this.workspace?.guard(opts.route)?.ok ? opts.route : 'breakdown';
      await this.workspaceShell.show(requested);
    } else {
    }
    return true;
  }

  // ---- Auto-hint: suggest finishing the game when score is entered ----------

  _checkFinishHint() {
    const store = this.storage?.seasonStore;
    if (!store?.hasCurrent()) return;
    const game = store.activeGame();
    if (!game) return;
    // Read the live form state (this.storage.gameInfo) rather than the store
    // node — the score is set synchronously in _saveGameInfo but only committed
    // to the node on the debounced autosave, so the node is still stale here.
    const hasScore = this._hasScore(this.storage.gameInfo);
    const isFinal = store.gameStatus(game) === 'final';
    if (hasScore && !isFinal && !this._finishHintShown) {
      this._finishHintShown = true;
      this.updater._toast('Score entered — mark the game Final in Game settings.');
    }
  }

  /** `ownerSeasonId` is the season the write belongs to, captured by the caller
   *  when the operation started — a film operation is identified by season AND
   *  game, never by a bare game id. */
  _showFilmImportProgress(done, total, operation = 'saving', ownerGameId = null, ownerSeasonId = null) {
    const gameId = ownerGameId || this.storage?.seasonStore?.activeGame?.()?.id;
    const seasonId = ownerSeasonId || null;
    if (done >= total) {
      if (gameId) this.workspace?.clearFilmOperation(gameId, seasonId);
      this.updater._toast('Film saved to library');
      return;
    }
    if (gameId) this.workspace?.setFilmOperation(gameId, operation, { done, total }, seasonId);
    let el = document.getElementById('filmImportToast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'filmImportToast';
      el.className = 'gi-update-toast gi-show';
      document.body.appendChild(el);
    }
    el.textContent = `Saving film to library… ${done}/${total}`;
    if (done >= total - 1) setTimeout(() => el.remove(), 1500);
  }

  _hasScore(gi) {
    return !!(gi && gi.scoreUs !== undefined && gi.scoreUs !== '' &&
              gi.scoreThem !== undefined && gi.scoreThem !== '');
  }

  /* Derive the display fields shared by game lists and selectors. */
  _gameRowInfo(g, idx, store, activeId) {
    const isActive = g.id === activeId;
    const isFinal = store.gameStatus(g) === 'final';
    const name = store.gameName(g, idx);
    const plays = (g.plays || []).length;
    const date = g.gameInfo?.date || '';
    const hasScore = this._hasScore(g.gameInfo);
    const u = g.gameInfo?.scoreUs, t = g.gameInfo?.scoreThem;
    return { isActive, isFinal, name, plays, date, hasScore, u, t };
  }

  _clearGameInfoForm() {
    const carried = this.storage.gameInfo || {};
    this.storage.gameInfo = {
      teamName: carried.teamName || '', jerseyColor: carried.jerseyColor || '',
      projectName: '', week: '', opponent: '', date: '', scoreUs: '', scoreThem: '',
      homeAway: '', gameType: 'game', direction: '', perspective: 'offense',
    };
    // Force publication because a new game can share the outgoing game's unit.

    this.gameContext?.notify({ force: true });
    this._trackedScore = null;
  }
  _wireEvents() {
    // Repaint only when entering or leaving an annotated frame; full-resolution clears are costly.

    this.vc.on('time-update', () => {
      this.canvas.renderPlaybackFrame();
    });

    // The playlist hook persists every addFiles path; browser and linked-film imports are no-ops.

    this.playlist.onFilmFiles = (files) => this.storage.importFilm(files);

    this.vc.on('files-selected', ({ files }) => {
      if (files.length === 1 && !this.playlist.hasClips) {
        // A single continuous video doesn't go through addFiles → persist here.
        this.vc.loadFile(files[0]);
        this.storage.importFilm(files);
      } else {
        // addFiles → onFilmFiles persists the genuinely-new clips.
        this.playlist.addFiles(files);
      }
    });

    const repairInput = document.getElementById('repairFilmInput');
    repairInput?.addEventListener('change', async (e) => {
      const files = this.vc._filterVideoFiles(Array.from(e.target.files || []))
        .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(
          b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' }));
      e.target.value = '';
      await this.storage.repairFilm(files);
    });

    // Marking start/end is optional: a single video loaded into an empty game
    // auto-creates a play spanning the whole file (film usually arrives as one
    // clip per play). Folder mode already does this per clip; this covers the
    // "Add Video" path. The first manual [ / ] mark re-times the placeholder.
    this.vc.on('video-loaded', ({ duration }) => {
      if (this.playlist.hasClips) return;            // folder mode handles its own
      if (this.tagger.plays.length) return;           // existing game data wins
      if (!duration || !isFinite(duration)) return;
      this.tagger.createWholeVideoPlay(duration, this.vc.currentFile?.name || '');
    });

    // When a play is selected and it has a clip, switch the playlist to that clip
    this.tagger.on('play-selected', (play) => {
      if (play.clipId && this.playlist.hasClips) {
        this.playlist.switchToClipByPlayId(play.id);
      }
      // Keep the loop region in sync; if "Loop play" is active, retarget it.
      if (play.timestamp) {
        this.vc.currentPlayRegion = { start: play.timestamp.start, end: play.timestamp.end };
        if (this.vc.loopMode === 'play') {
          this.vc.loopRegion = { start: play.timestamp.start, end: play.timestamp.end };
        }
      }
      this.canvas.render();
    });

    // When playlist switches clips, re-sync canvas. A-B loop regions belong
    // to the previous clip's timeline — clear them so they can't snap
    // playback around the new clip. ('play' loops retarget on play-selected.)
    this.playlist.on('clip-switched', () => {
      if (this.vc.loopMode === 'ab') this.vc.clearLoop();
      // Angle 2 was loaded against the previous clip — drift-syncing it
      // against a different play's timeline shows two unrelated plays.
      if (this.multiAngle.enabled) this.multiAngle.removeAngle2();
      this.canvas.render();
    });

    this.multiAngle.on('view-changed', () => requestAnimationFrame(() => this.canvas._syncSize()));
    this.multiAngle.on('angle-loaded', () => requestAnimationFrame(() => this.canvas._syncSize()));
    this.multiAngle.on('angle-removed', () => requestAnimationFrame(() => this.canvas._syncSize()));
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      /* Focused controls own Space and Enter; do not also trigger playback. */
      const target = e.target;
      const ownsKey = (e.code === 'Space' || e.key === 'Enter')
        && (tag === 'BUTTON' || tag === 'A' || tag === 'SUMMARY' || target?.isContentEditable
          || target?.getAttribute?.('role') === 'button');
      if (ownsKey) return;

      // "?" opens the shortcuts legend. While it or any modal is open, the
      // overlay host keeps keys from reaching this handler.
      if (e.key === '?') { e.preventDefault(); this.toggleShortcuts?.(true); return; }

      // Let quick-chart handle its own keys when active
      if (this.quickChart.isActive) return;

      // Cut-up review: arrows skip plays, Esc exits.
      if (this.cutupPlayer && this.cutupPlayer.active) {
        if (e.code === 'ArrowRight') { e.preventDefault(); this.cutupPlayer.next(); return; }
        if (e.code === 'ArrowLeft') { e.preventDefault(); this.cutupPlayer.prev(); return; }
        if (e.code === 'Escape') { e.preventDefault(); this.cutupPlayer.stop(); return; }
      }

      // Tag shortcuts (play type, result, down via keyboard)
      if (this._handleTagKey(e)) return;

      switch (e.code) {
        case 'Space':
          e.preventDefault();
          this.vc.togglePlay();
          break;
        case 'ArrowLeft':
          if (e.shiftKey) {
            e.preventDefault();
            this.playlist.prevClip();
          } else {
            e.preventDefault();
            this.vc.stepBack();
          }
          break;
        case 'Comma':
          e.preventDefault();
          this.vc.stepBack();
          break;
        case 'ArrowRight':
          if (e.shiftKey) {
            e.preventDefault();
            this.playlist.nextClip();
          } else {
            e.preventDefault();
            this.vc.stepForward();
          }
          break;
        case 'Period':
          e.preventDefault();
          this.vc.stepForward();
          break;
        case 'BracketLeft':
          e.preventDefault();
          this.tagger.markStart();
          break;
        case 'BracketRight':
          e.preventDefault();
          this.tagger.markEnd();
          break;
        // Drawing digits apply only with no selected play or with Drawing Tools open, never during ordinary tagging.

        case 'Digit1':
          if (this._drawingArmed()) this._selectTool('line');
          break;
        case 'Digit2':
          if (this._drawingArmed()) this._selectTool('arrow');
          break;
        case 'Digit3':
          if (this._drawingArmed()) this._selectTool('circle');
          break;
        case 'Digit4':
          if (this._drawingArmed()) this._selectTool('rect');
          break;
        case 'Digit5':
          if (this._drawingArmed()) this._selectTool('freehand');
          break;
        case 'Digit6':
          if (this._drawingArmed()) this._selectTool('text');
          break;
        case 'Escape':
          this._selectTool(null);
          break;
        case 'KeyZ':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            if (e.shiftKey) this.history.redoAll();
            else this.history.undoAll();
          }
          break;
        case 'KeyY':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.history.redoAll();
          }
          break;
        case 'KeyV':
          if (!e.ctrlKey && !e.metaKey && this.multiAngle?.enabled) {
            e.preventDefault();
            this.multiAngle.swapActive();
          }
          break;
        case 'KeyS':
          if (e.ctrlKey || e.metaKey) {
            e.preventDefault();
            this.storage.saveProject();
          }
          break;
      }
    });
  }

  _bindToolUI() {

    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this._selectTool(this.canvas.currentTool === tool ? null : tool);
      });
    });

    document.querySelectorAll('.swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.canvas.color = swatch.dataset.color;
      });
    });
  }

  /** Digits switch drawing tools only when drawing is plausibly intended. */
  _drawingArmed() {
    return !this.tagger.currentPlayId || this.settingsScreen?.activeTab === 'drawing';
  }

  _selectTool(toolName) {
    this.canvas.setTool(toolName);
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });

    this.canvas.canvas.style.cursor = toolName ? 'crosshair' : 'default';
  }

  /* Keep backend availability fresh without network calls while the integration is disabled. */
  _bindBackendStatus() {
    // Kick off an initial probe (non-blocking; probe() itself no-ops with no
    // network call while backend.enabled is false, so a default session
    // never touches the network here either).
    this.backend.probe();
    // Re-probe every 30s while the tab is visible so isAvailable() stays fresh.
    setInterval(() => {
      if (document.visibilityState === 'visible') this.backend.probe();
    }, 30000);
  }

  /**
   * Read jersey color, perspective, and direction from the Game Info
   * panel. Set once per session/game — applies to every play analyzed.
   */
  _getTeamContext() {
    const { jerseyColor, perspective, direction } = this.gameContext.snapshot();
    return { jerseyColor, perspective, direction };
  }

  _bindGameInfo() {

    const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
    if (savedKey) this.vision.apiKey = savedKey;
    const savedModel = localStorage.getItem('ffa_claude_model') || '';
    if (savedModel) this.vision.model = savedModel;

    // Live "tracked" score: recompute from scoring plays whenever they change,
    // and let the coach copy it into the Final Score with one click.
    this.tagger.on('play-created', () => this._updateTrackedScore());
    this.tagger.on('play-updated', () => this._updateTrackedScore());
    this.tagger.on('play-deleted', () => this._updateTrackedScore());
    this._updateTrackedScore();

    // Carry the team identity (name + jersey color) forward from prior games.
    this._applyTeamProfile();
  }

  /** Recompute the running scoreboard from tagged plays. */
  _updateTrackedScore() {
    if (!this.stats) return;
    this._trackedScore = this.stats.computeScoreboard();
  }

  /* Complete the stats checklist only for the coach's own data, never the demo. */
  _markSeenStats() {
    const store = this.storage?.seasonStore;
    if (store && this.storage.isDemoSeason(store.currentSeasonId)) return;
    try { localStorage.setItem('ffa_seen_stats', '1'); } catch (e) {}
  }

  _saveApiKey(value) {
    const apiKey = value === undefined
      ? localStorage.getItem('ffa_claude_api_key') || ''
      : String(value || '').trim();
    localStorage.setItem('ffa_claude_api_key', apiKey);
    this.vision.apiKey = apiKey;
  }

  /* Persist native Analysis settings. */
  _saveAnalysisPreferences(apiKey, model) {
    const nextModel = String(model || 'claude-opus-4-6');
    try {
      this._saveApiKey(apiKey);
      localStorage.setItem('ffa_claude_model', nextModel);
      this.vision.model = nextModel;
      return true;
    } catch (error) {
      console.error('Could not save analysis preferences:', error);
      return false;
    }
  }

  /* Apply game-owned metadata; the caller owns the transaction and durable write. */
  _applyGameInfoDraft(draft = {}) {
    const current = this.storage.gameInfo || {};
    const priorPerspective = current.perspective || 'offense';
    const week = String(draft.week ?? current.week ?? '').trim();
    const opponent = String(draft.opponent ?? current.opponent ?? '').trim();
    const projectName = (week || opponent)
      ? this.storage.seasonStore.gameName({ gameInfo: { week, opponent } })
      : '';
    this.storage.gameInfo = {
      ...current, ...draft, projectName, week, opponent,

      teamName: draft.teamName ?? current.teamName ?? '',
      jerseyColor: draft.jerseyColor ?? current.jerseyColor ?? '',
      direction: draft.direction ?? current.direction ?? '',
      perspective: draft.perspective || current.perspective || 'offense',
      gameType: draft.gameType || current.gameType || 'game',
    };

    // notify() skips unchanged context.

    if (this.storage.gameInfo.perspective !== priorPerspective) this.gameContext?.notify();
    this._checkFinishHint();
    return this.storage.gameInfo;
  }

  _setGameScore(scoreUs, scoreThem) {
    this._applyGameInfoDraft({ scoreUs: String(scoreUs ?? ''), scoreThem: String(scoreThem ?? '') });
    this.storage.commitActive();
    this.storage._autoSave();
  }

  /* Persist authoritative gameInfo and carry team identity forward. */
  _saveGameInfo() {
    if (this._loadingGameInfo) return;
    this.storage._autoSave();
    this._saveTeamProfile();
  }
  /**
   * Persist team-identity fields (team name + jersey color) globally so they
   * carry forward to every new game. Only the last *non-empty* value is kept,
   * so editing another field (e.g. opponent) while the name is blank — or an
   * accidental clear — never wipes the saved identity.
   */
  _saveTeamProfile() {
    try {
      let prev = {};
      try { prev = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}; } catch (e) {}
      const profile = {
        ...prev,
        teamName: (this.storage.gameInfo.teamName || prev.teamName || ''),
        jerseyColor: (this.storage.gameInfo.jerseyColor || prev.jerseyColor || ''),
      };
      localStorage.setItem('ffa_team_profile', JSON.stringify(profile));
    } catch (e) { /* localStorage unavailable — ignore */ }
  }

  /**
   * Pre-fill team-identity fields from the saved profile when they're empty
   * (fresh session, no project loaded yet). A loaded project always wins:
   * _loadGameInfo overwrites these with the project's own values when present,
   * and only falls back to the carried-forward identity when the project omits
   * them.
   */
  _applyTeamProfile() {
    let profile = {};
    try { profile = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}; } catch (e) { return; }
    // Fill only blank identity fields; a game's own identity wins.

    const current = this.gameContext.snapshot();
    const patch = {};
    if (!current.teamName && profile.teamName) patch.teamName = profile.teamName;
    if (!current.jerseyColor && profile.jerseyColor) patch.jerseyColor = profile.jerseyColor;
    if (Object.keys(patch).length && this.gameContext.update(patch)) this._saveGameInfo();
  }

  _loadGameInfo(info) {
    if (!info) return;
    this._loadingGameInfo = true;
    // Force publication because the incoming game can share the outgoing game's perspective.

    this.gameContext?.notify({ force: true });
    const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
    if (savedKey) this.vision.apiKey = savedKey;
    const savedModel = localStorage.getItem('ffa_claude_model') || '';
    if (savedModel) this.vision.model = savedModel;
    this._loadingGameInfo = false;
    // A game with no stored identity inherits the team profile.

    this._applyTeamProfile();
  }
  /** Global `?` keyboard shortcut (see the keydown handler elsewhere in this
   *  file). The shell's own `.ws-global-tools` Shortcuts button and every
   *  other native entry point call `app.shortcutsScreen.open()` directly;
   *  this remains the shared toggle used by the keyboard shortcut, which has
   *  no anchor element of its own -- ShortcutsScreen.open()/toggle() already
   *  default their returnFocus to null. */
  _bindShortcuts() {
    this.toggleShortcuts = (show) => {
      if (show === false) return this.shortcutsScreen.close('cancel');
      if (show === true) return this.shortcutsScreen.open();
      return this.shortcutsScreen.toggle();
    };
  }

  /* Scout mode follows the game context without changing its carried charting unit. */
  _bindScoutMode() {
    const unitFromPerspective = (p) => {
      if (p === 'defense') return 'defense';
      if (p === 'special') return 'special';
      return 'offense'; // offense or scout (charts both, default offense layout)
    };
    const apply = ({ perspective }) => {
      this.tagger.defaultUnit = unitFromPerspective(perspective);
    };
    this.gameContext.subscribe(apply);
    apply(this.gameContext.snapshot());
  }

  _autoPlayCurrent() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return;
    const v = this.vc.videoElement || this.vc.video;
    if (v) {
      v.currentTime = play.timestamp.start;
      if (this.autoPlayNext) v.play().catch(() => {});
      else v.pause();
    }
  }

  /**
   * Save & advance. Commits any focused field, then moves to the next play —
   * which in folder/multi-clip mode also switches to the next video. When we're
   * past the last play but more video clips remain, jump to the next clip so a
   * folder upload keeps flowing video-to-video. Shows a brief toast at the end.
   */
  /* Publish debounced autosave state on the native Break Down indicator; explicit save remains separate. */
  _renderSaveState(state) {
    this.breakdownWorkspace?.setSaveState(state);
  }

  _advancePlay(opts = {}) {
    // Commit a value still being edited (yardage/notes) before advancing,
    // then blur so the next keystrokes hit the shortcuts, not the input.
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }
    // Save & Next saves the open play first, in a cut-up queue too; Skip
    // moves on without saving (leaving asks when there are unsaved changes).
    if (!opts.skip) this.tagger.saveDraft();

    // Analytics rows, Film Room selections, and Study results establish an
    // intentional example set. While that cut-up is active, its queue owns
    // navigation: falling through to chronological nextPlay() silently leaves
    // the grouping the coach asked to review. Do not carry situation/scheme to
    // a filtered example because those plays are usually nonconsecutive.
    if (this.cutupPlayer?.active) {
      this.cutupPlayer.next();
      return;
    }

    // 1) Next play in the list (also switches clip in folder mode).
    //    Skip advances plainly; Save & Next carries situation/unit forward.
    const advanced = opts.skip
      ? this.tagger.nextPlay()
      : this.tagger.nextPlayWithSituation();
    if (advanced) {

      this._autoPlayCurrent();
      return;
    }

    // 2) No next play — if a folder/playlist is loaded, advance to the next
    //    video clip so the user keeps moving through uploaded videos.
    if (this.playlist && this.playlist.hasClips &&
        this.playlist.activeClipIndex < this.playlist.clips.length - 1) {
      this.playlist.nextClip();
      this._autoPlayCurrent();
      return;
    }

    // 3) Nothing left to advance to — offer to finish the game.
    const store = this.storage?.seasonStore;
    const activeGame = store?.activeGame();
    if (activeGame && store.gameStatus(activeGame) !== 'final') {
      this.history?._toast('Last play — all tagged. Mark the game Final in Game settings.');
    } else {
      this.history?._toast('Last play — all tagged');
    }
  }

  _handleTagKey(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return false;
    if (!this.tagger.currentPlayId) return false;

    const keyMap = {
      'KeyR': ['playType', 'Run Inside'],
      'KeyO': ['playType', 'Run Outside'],
      'KeyS': ['playType', 'Screen'],
      'KeyP': ['playType', 'Short Pass'],
      'KeyM': ['playType', 'Medium Pass'],
      'KeyD': ['playType', 'Deep Pass'],
      'KeyA': ['playType', 'Play Action'],
      'KeyQ': ['playType', 'RPO'],
      'KeyB': ['playType', 'Option'],
      'KeyX': ['playType', 'Trick Play'],
      'KeyH': ['playType', 'QB Run'],
      'KeyJ': ['playType', 'Reverse'],
      'KeyG': ['result', 'Gain'],
      'KeyL': ['result', 'Loss'],
      'KeyN': ['result', 'No Gain'],
      'KeyI': ['result', 'Incomplete'],
      'KeyT': ['result', 'Touchdown'],
      'KeyW': ['result', 'Sack'],
      'KeyU': ['result', 'Interception'],
      'KeyF': ['result', 'Fumble'],
      'KeyE': ['result', 'Penalty'],
      'KeyK': ['result', 'Punt'],
    };

    if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey) {
      e.preventDefault();
      if (e.shiftKey) this.tagger.prevPlay();   // Shift+Enter = back one play
      else this._advancePlay();
      return true;
    }

    if (e.shiftKey && e.code >= 'Digit1' && e.code <= 'Digit4') {
      e.preventDefault();
      this.nativeTagging.shortcut('down', () => this.tagger.toggleTagValue('down', e.code.replace('Digit', '')));
      return true;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const curPlay = this.tagger.getCurrentPlay();
    // The unit on screen: a play's counted unit, never the carried one, which
    // only seeds a play that does not exist yet.
    const curUnit = curPlay ? countedUnit(curPlay) : (this.tagger.defaultUnit || 'offense');

    if (e.code === 'KeyY' && !e.shiftKey) {
      e.preventDefault();
      this.nativeTagging.focusYardage();
      return true;
    }

    // C cycles the unit toggle (Offense → Defense → Special Teams).
    if (e.code === 'KeyC' && !e.shiftKey) {
      e.preventDefault();
      const order = ['offense', 'defense', 'special'];
      const nextUnit = order[(order.indexOf(curUnit) + 1) % order.length];
      this.nativeTagging.shortcut('unit', () => this.tagger.setChartingUnit(nextUnit));
      return true;
    }

    // Special Teams digits 1-8 use the model's unit order and the same write as the deck chips.

    if (curUnit === 'special' && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      const units = SpecialTeamsModel.unitOptions().map(([unit]) => unit);
      const n = parseInt(e.code.replace('Digit', ''), 10);
      if (n >= 1 && n <= units.length) {
        e.preventDefault();
        this.nativeTagging.shortcut('special', () => this.breakdownCharting?.setSpecialUnit?.(units[n - 1]));
        return true;
      }
    }

    const mapped = keyMap[e.code];
    if (!mapped) return false;

    e.preventDefault();
    // Multi-select fields (e.g. Play Type) toggle membership; single replace.
    const [field, value] = mapped;
    this.nativeTagging.shortcut(field, () => this.tagger.toggleTagValue(field, value));
    return true;
  }

}

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
