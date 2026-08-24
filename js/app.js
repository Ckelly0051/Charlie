import { isPlayTagged } from './football-rules.js';
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
import { getNativeOverlayService } from './native-root.jsx';
import { h } from 'preact';
import { ConfirmDeleteForm } from './native-team-hub.jsx';
import { StudyPlan } from './study-plan.js';
import { PlanExport } from './plan-export.js';
import { PlanScreen } from './plan-screen.js';
import { WorkspaceShell } from './workspace-shell.js';
import { NativeFilmRoomScreen } from './native-film-room-screen.js';
import { NativeTaggingScreen } from './native-tagging-screen.js';
import { BreakdownVideo } from './breakdown-video.js';
import { BreakdownTheaterScreen } from './breakdown-theater-screen.js';
import { BreakdownWorkspace } from './breakdown-workspace.js';
import { HistoryManager } from './history-manager.js';
import { VersionManager } from './version-manager.js';
import { ScoreboardOCR } from './scoreboard-ocr.js';
import { SuggestionEngine } from './suggestion-engine.js';
import { CutupExporter } from './cutup-exporter.js';
import { CutupPlayer } from './cutup-player.js';
import { SeasonManager } from './season-manager.js';
import { CallSheetBuilder } from './call-sheet-builder.js';
import { UIPolish } from './ui-polish.js';
import { CustomFieldsManager } from './custom-fields.js';
import { CustomChips } from './custom-chips.js';
import { TagLibrarySettings } from './tag-library-settings.js';
import { BreakdownForm } from './breakdown-form.js';
import { PlayDiagram } from './play-diagram.js';
import { MultiAngle } from './multi-angle.js';
import { Updater } from './updater.js';
import { TeamRegistry } from './team-registry.js';
import { GameContext } from './game-context.js';
import { PlaybookLibrary } from './playbook-library.js';
import { PlayGrid } from './play-grid.js';
import { AutoDetectScreen } from './auto-detect-screen.js';
import { configureBetaDefaults } from './beta-config.js';
// LAST IMPORT ON PURPOSE. The material layer (edge light, elevation, the ramp)
// crosses every route, so it has to win on source order against the per-route
// stylesheets those modules pull in. Importing it after them puts it last in
// the CSS graph. Verified in the BUILT bundle, not assumed — an earlier version
// of this block sat inside native-reports.css and was already being overridden
// by .gi-overlay-panel 8kb further down the output.
import '../design-system/material.css';

/**
 * Single source of truth for the displayed app version. Keep in lockstep with
 * src-tauri/{Cargo.toml,tauri.conf.json,Cargo.lock} on every release (the web
 * bundle can't read those at runtime). On desktop, the live Tauri config
 * version overrides this at runtime via Updater._currentVersion().
 */
const APP_VERSION = '1.12.0-66';

class App {
  constructor() {
    configureBetaDefaults(localStorage, !!window.__TAURI__, APP_VERSION);
    try { this.autoPlayNext = localStorage.getItem('ffa_autoplay_next') !== '0'; }
    catch { this.autoPlayNext = true; }
    // Initialize components
    this.vc = new VideoController();
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.roster = new RosterManager(this.tagger);
    this.filter = new PlayFilter(this.tagger);
    this.customFields = new CustomFieldsManager(this.tagger);
    this.customChips = new CustomChips(this.tagger);
    this.playbook = new PlaybookLibrary();
    this.tagLibrarySettings = new TagLibrarySettings(this.customChips, this.tagger);
    this.breakdownForm = new BreakdownForm(this.tagger, { tagLibrarySettings: this.tagLibrarySettings });
    this.playDiagram = new PlayDiagram(this.tagger);
    this.multiAngle = new MultiAngle(this.vc);
    // Re-render custom-field inputs + diagram preview on every form load.
    this.tagger.onLoadForm = (play) => {
      this.customFields.loadValues(play);
      this.playDiagram.renderPreview();
      this.breakdownForm.loadPlay(play);
    };
    this.notes = new NotesManager(this.vc, this.tagger);
    this.storage = new StorageManager(this.vc, this.tagger, this.canvas);
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
    this.planScreen = new PlanScreen(this);
    this.reportsScreen = new ReportsScreen(this);
    this.overlays = getNativeOverlayService();
    if (!this.overlays) throw new Error('GridIron IQ native overlay service is unavailable.');
    this.quickChart = new QuickChart(this.vc, this.tagger, this.playlist, this.overlays);
    this.settingsScreen = new SettingsScreen(this, this.overlays);
    this.playImport = new PlayImportScreen(this, this.overlays);
    this.shortcutsScreen = new ShortcutsScreen(this.overlays);
    this.autoDetectScreen = new AutoDetectScreen(this, this.overlays);
    this.history = new HistoryManager(this.tagger, this.overlays);
    this.versions = new VersionManager(this.storage, this.tagger);
    this.ocr = new ScoreboardOCR(this.vc, this.tagger);
    this.suggestions = new SuggestionEngine(this.tagger);
    this.cutup = new CutupExporter(this.vc, this.tagger, this.filter, this.playlist);
    this.cutupPlayer = new CutupPlayer(this.vc, this.tagger, {
      shouldAutoPlayNext: () => this.autoPlayNext,
    });
    this.playGrid = new PlayGrid(this.tagger, this.vc, this.cutupPlayer, this.playbook, this.customChips);
    this.season = new SeasonManager(this.stats);
    // S7-c: the team/season identity layer. SeasonLibrary's overlay is dead but
    // twelve of its private members were still the registry, so the data moved
    // here first and the overlay becomes the by-product.
    // S7-d1: the per-game charting context. Perspective, direction and team
    // identity used to travel through hidden inputs in #legacyGameContextState
    // and a synthetic `change` event on #gamePerspective — an event bus made of
    // markup that S7-d8 deletes. This is that bus, DOM-free.
    this.gameContext = new GameContext({
      storage: this.storage,
      applyDraft: patch => this._applyGameInfoDraft(patch),
    });
    this.teamRegistry = new TeamRegistry({
      app: () => this,
      // Team identity propagates into the active game's canonical metadata
      // through the draft path, not through hidden inputs inside #app.
      syncGame: profile => {
        if (!this.storage?.gameInfo) return;
        this._applyGameInfoDraft({
          teamName: profile.teamName || '',
          jerseyColor: profile.jerseyColor || '',
        });
        this.storage._autoSave();
      },
      notify: message => this.history?._toast?.(message),
    });
    this.teamHubScreen = new TeamHubScreen(this, this.overlays);
    this.gameScreen = new GameScreen(this, this.overlays);
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
    this.breakdownVideo = new BreakdownVideo(this.tagger);
    this.breakdownTheater = new BreakdownTheaterScreen(this);
    this.nativeFilmRoom = new NativeFilmRoomScreen(this);
    this.nativeTagging = new NativeTaggingScreen(this);
    this.callSheet = new CallSheetBuilder(this.tagger);
    this.uiPolish = new UIPolish(this);
    this.vc.beforeFilesSelected = files => this.uiPolish.prepareFilmFiles(files);
    // S7-b: the legacy onboarding Wizard is retired. It was default-dismissed
    // with no toggle control and injected its bar into the hidden classic
    // outlet, so no coach could reach it — but it stayed subscribed to
    // video-loaded and called stats.hideDashboard(), which is what blanked
    // native Reports in 1.12.0-14. Deleting the module closes that class at the
    // root; e2e-native-reports asserts its absence so it cannot return.

    // Give storage references
    this.storage.playlist = this.playlist;
    this.storage.filter = this.filter;
    this.storage.versions = this.versions;

    // Wire cross-module events
    this._wireEvents();

    // Wire game info form
    this._bindGameInfo();
    this._bindExpandVideo();

    // Keyboard shortcuts
    this._bindKeyboard();

    // Drawing tool UI
    this._bindToolUI();

    // Sidebar panel toggles are handled by UIPolish._initPanelCollapse().
    // (A second binding here previously double-toggled every panel, so a
    // collapsed panel like Roster opened then instantly closed on tap.)

    // Auto-detect UI: AutoDetectScreen owns operation + presentation now (see
    // its constructor call above); nothing left to bind here.

    // Probe the local CV backend and re-probe periodically so
    // backend.isAvailable() stays accurate for the native Analysis settings
    // tab, which reads it directly rather than a legacy status badge.
    this._bindBackendStatus();

    // Enable auto-save + surface its state on the top-bar Save button
    // ("● Saving…" while a debounced write is armed → "✓ Saved" settled), so
    // the coach always knows their work persisted (UX audit A1/C2).
    this.storage.onSaveState = (s) => this._renderSaveState(s);
    this.storage.enableAutoSave();


    // Tag navigation & chip shortcuts
    this._bindTagNav();

    // Scout mode UI
    this._bindScoutMode();

    // Keyboard shortcuts legend
    this._bindShortcuts();

    // Keep tagging progress updated
    this.tagger.on('play-created', () => this._updateTagProgress());
    this.tagger.on('play-deleted', () => this._updateTagProgress());
    this.tagger.on('play-updated', () => this._updateTagProgress());
    // Wholesale plays-replacement (open game, new game, undo/redo) emits
    // plays-loaded, NOT play-created/updated — without this the counter shows
    // a stale "0 / 0 tagged" on every game open until the first edit.
    this.tagger.on('plays-loaded', () => this._updateTagProgress());

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
    // next tick so `window.app` (referenced by the storage bridge) is set.
    setTimeout(async () => {
      await this.storage.initLibrary();
      this._bindGamesPanel();
      await this.workspaceShell.init();
      await this.workspaceShell._openLibrary();
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

  /**
   * The single authoritative "open this game into the workspace" command (C1).
   * Every entry route — Home, the Season Library schedule, the classic top-bar
   * game dropdown, the games panel, and the season-stats modal — funnels
   * through here so active-game selection, chrome refresh, and the workspace
   * transition are identical no matter where the coach clicked. That is what
   * makes Settings/More availability a deterministic workspace state rather
   * than an accident of which route mounted the screen.
   *
   * Idempotent: re-opening the already-active game does NOT re-switch,
   * re-persist, or reload film. A failed switch opens nothing and returns false.
   */
  /**
   * The one authoritative game-entry command (C1). `opts.route` lets the S6-4a
   * shell game switcher land back on the route the coach was already reading
   * instead of bouncing every switch through Break Down. It is a destination
   * argument only: commit/persist/history-reset/film-load ordering below is
   * untouched, and omitting it keeps the historical Break Down default, so no
   * existing caller changes behavior.
   */
  async openGame(gid, opts = {}) {
    const store = this.storage?.seasonStore;
    if (!store?.data || gid == null) return false;
    const already = String(store.data.activeGameId) === String(gid);
    if (!already) {
      // switchToGame owns commit/persist/history-reset/film-load. AWAIT it so
      // Break Down never renders before the target game is live (the
      // delayed-switch race); a stale film-health or prior-game callback that
      // resolves later cannot move the selection back, because the switch has
      // already committed by the time the workspace transition runs.
      const ok = await this.storage.switchToGame(gid);
      if (ok === false) return false;
    }
    // Deterministic chrome refresh.
    this._renderGamesPanel();
    // Workspace transition. Break Down is a shell route: its render relocates the
    // canonical Settings/More chrome, so every entry route lands on identical
    // chrome. The redesigned shell is the unconditional product and owns the
    // workspace.
    // The `.root` check is "is the shell mounted" (always true in the product);
    // the else is pure crash-safety, not a second product route.
    if (this.workspaceShell?.root) {
      // A requested route that the workspace guard rejects for this game falls
      // back to Break Down rather than stranding the coach on a blocked route.
      const requested = opts.route && this.workspace?.guard(opts.route)?.ok ? opts.route : 'breakdown';
      await this.workspaceShell.show(requested);
    } else {
    }
    return true;
  }

  /**
   * Finish Game flow: prompt for final score if missing, mark game as Final.
   * Reversible — the status can be cleared by re-opening and editing.
   */
  async _finishGame() {
    const store = this.storage?.seasonStore;
    if (!store?.hasCurrent()) return;

    this.storage.commitActive();
    const game = store.activeGame();
    if (!game) return;

    const hasScore = this._hasScore(game.gameInfo);

    const result = await this._showFinishModal(game, hasScore);
    if (!result) return;
    // The modal doesn't lock the app; if the coach switched games while it was
    // open, don't finalize (or write a score into) the wrong game.
    if (store.activeGame()?.id !== game.id) return;

    if (result.scoreUs !== undefined) {
      this._setGameScore(result.scoreUs, result.scoreThem);
    }

    store.setGameStatus(game.id, 'final');
    this._renderGamesPanel();   // commits live state (incl. status) into the node
    store.persist();

    const name = store.gameName(game, store.activeIndex());
    this.updater._toast(`"${name}" marked as Final`);
  }

  _showFinishModal(game, hasScore) {
    return new Promise(resolve => {
      const existing = document.getElementById('finishGameModal');
      if (existing) existing.remove();

      const name = this.storage.seasonStore.gameName(game, this.storage.seasonStore.activeIndex());
      const gi = game.gameInfo || {};

      const modal = document.createElement('div');
      modal.id = 'finishGameModal';
      modal.className = 'finish-game-modal';
      modal.innerHTML = `
        <div class="finish-game-backdrop"></div>
        <div class="finish-game-card">
          <button type="button" class="ng-modal-x" data-fg="close" title="Close" aria-label="Close">×</button>
          <h3>Finish Game: ${this._esc(name)}</h3>
          ${hasScore
            ? `<p>Final score: ${this._esc(gi.scoreUs)}-${this._esc(gi.scoreThem)}. Mark this game as complete?</p>`
            : `<p>Enter the final score, then mark this game as complete.</p>
               <div class="finish-game-scores">
                 <label>Us <input type="number" id="finishScoreUs" value="${this._esc(gi.scoreUs || '')}" min="0" placeholder="0"></label>
                 <label>Them <input type="number" id="finishScoreThem" value="${this._esc(gi.scoreThem || '')}" min="0" placeholder="0"></label>
               </div>`}
          <div class="finish-game-btns">
            <button class="btn btn-sm" id="finishCancel">Cancel</button>
            <button class="btn btn-sm btn-accent" id="finishConfirm">Mark as Final</button>
          </div>
        </div>`;

      document.body.appendChild(modal);

      const close = (val) => {
        document.removeEventListener('keydown', onKey, true);
        modal.remove();
        resolve(val);
      };

      const confirm = () => {
        if (hasScore) {
          close({});
        } else {
          close({
            scoreUs: document.getElementById('finishScoreUs')?.value || '',
            scoreThem: document.getElementById('finishScoreThem')?.value || '',
          });
        }
      };

      // Capture-phase so Esc/Enter act here first and don't leak to the game
      // dropdown's Esc handler or the document-level tagging shortcuts (matches
      // PlayTagger._confirmDialog). Tab is trapped inside the modal.
      const onKey = (e) => {
        if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); close(null); return; }
        if (e.key === 'Enter') { e.preventDefault(); e.stopImmediatePropagation(); confirm(); return; }
        if (e.key === 'Tab') {
          const f = modal.querySelectorAll('input, button');
          if (!f.length) return;
          const first = f[0], last = f[f.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      };

      document.addEventListener('keydown', onKey, true);
      modal.querySelector('.finish-game-backdrop').addEventListener('click', () => close(null));
      modal.querySelector('[data-fg="close"]')?.addEventListener('click', () => close(null));
      modal.querySelector('#finishCancel').addEventListener('click', () => close(null));
      modal.querySelector('#finishConfirm').addEventListener('click', confirm);

      setTimeout(() => {
        (document.getElementById('finishScoreUs') || modal.querySelector('#finishConfirm'))?.focus();
      }, 50);
    });
  }

  // ---- Games panel (settings drawer) ----------------------------------------

  _bindGamesPanel() {
    document.getElementById('btnPanelNewGame')?.addEventListener('click', event => {
      this.gameScreen.open({ mode: 'create', returnFocus: event.currentTarget });
    });
  }

  _renderGamesPanel() {
    const list = document.getElementById('gamesPanelList');
    const badge = document.getElementById('gamesBadge');
    const store = this.storage?.seasonStore;
    if (!list || !store?.hasCurrent()) { if (list) list.innerHTML = ''; if (badge) badge.textContent = '0'; return; }

    this.storage.commitActive();
    const games = store.gamesChrono();
    const activeId = store.data.activeGameId;
    if (badge) badge.textContent = String(games.length);

    if (!games.length) {
      list.innerHTML = '<div style="padding:12px;text-align:center;color:rgba(255,255,255,.4);font-size:12px">No games yet.</div>';
      return;
    }

    list.innerHTML = '';
    games.forEach((g, idx) => {
      const r = this._gameRowInfo(g, idx, store, activeId);

      const card = document.createElement('div');
      card.className = 'gp-card' + (r.isActive ? ' is-active' : '');

      let actions = '';
      if (!r.isActive) actions += `<button class="btn btn-sm" data-action="open">Open</button>`;
      if (r.isActive && !r.isFinal) actions += `<button class="btn btn-sm" data-action="finish" style="border-color:rgba(34,197,94,.4);color:#22c55e">Finish Game</button>`;
      actions += `<button class="btn btn-sm btn-danger" data-action="delete" title="Remove game">Delete</button>`;

      card.innerHTML = `
        <div class="gp-card-head">
          <span class="gp-card-name">Game ${idx + 1}: ${this._esc(r.name)}</span>
          <div class="gp-card-badges">${this._gameBadgesHtml(r)}</div>
        </div>
        <div class="gp-card-meta">${r.plays} play${r.plays !== 1 ? 's' : ''}${r.date ? ' · ' + r.date : ''}</div>
        <div class="gp-card-actions">${actions}</div>`;

      card.querySelector('[data-action=open]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this.openGame(g.id);   // one authoritative open path (C1)
      });

      card.querySelector('[data-action=finish]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._finishGame();
      });

      card.querySelector('[data-action=delete]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        // J8 — delete-game takes the same type-to-confirm gate as delete-season
        // (coach: "delete game should get the same gate, yes").
        //
        // The 30-second undo below STAYS. The gate and the undo answer different
        // failures: the gate stops the click you did not mean to make, the undo
        // recovers the one you did. Removing either because the other exists
        // would be the cheaper-looking and worse choice — and the undo is the
        // only thing that brings the film back.
        const plays = (g.plays || []).length;
        const handle = this.overlays.dialog({
          title: `Delete ${r.name}?`, destructive: true,
          initialFocus: '[name="confirm"]',
          actions: [{ key: 'cancel', label: 'Cancel', default: true }],
          content: h(ConfirmDeleteForm, {
            impact: `${plays} charted play${plays === 1 ? '' : 's'} will be removed from this season. Film stays recoverable for ${Math.round(this.storage.undoGameWindowMs() / 1000)} seconds after deleting.`,
            confirmLabel: 'Delete game',
            onSubmit: async () => { handle.close('delete'); return { ok: true }; },
          }),
        });
        if (await handle.result !== 'delete') return;
        this.storage.removeGame(g.id);
        this._renderGamesPanel();
        // In-situ recovery (UX audit A2): the stash-backed one-shot undo.
        this.history?._toast(`Removed "${r.name}"`, {
          duration: this.storage.undoGameWindowMs(),
          action: { label: 'Undo', fn: () => {
            if (this.storage.undoRemoveGame()) this.history?._toast('Game restored');
          } },
        });
      });

      list.appendChild(card);
    });
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
      this.updater._toast('Score entered — you can mark this game as Final from the season chip.');
    }
  }

  _esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  _showFilmImportProgress(done, total, operation = 'saving', ownerGameId = null) {
    const gameId = ownerGameId || this.storage?.seasonStore?.activeGame?.()?.id;
    if (done >= total) {
      if (gameId) this.workspace?.clearFilmOperation(gameId);
      this.updater._toast('Film saved to library');
      return;
    }
    if (gameId) this.workspace?.setFilmOperation(gameId, operation, { done, total });
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

  /** Escaped W/L/T score pill. Pass a className for callers with their own CSS. */
  _scorePillHtml(u, t, className = 'gd-score') {
    const uN = parseInt(u, 10), tN = parseInt(t, 10);
    const cls = uN > tN ? 'win' : (uN < tN ? 'loss' : 'tie');
    return `<span class="${className} ${cls}">${this._esc(u)}-${this._esc(t)}</span>`;
  }

  /**
   * Derive the display fields for a game row. Called once per game per render
   * by the dropdown, games panel, and (via SeasonManager) the season-stats list.
   */
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

  /** Standard badge HTML (score pill + Final + open) shared by live game lists. */
  _gameBadgesHtml(r) {
    let h = '';
    if (r.hasScore) h += this._scorePillHtml(r.u, r.t);
    if (r.isFinal) h += '<span class="gd-badge badge-final">Final</span>';
    if (r.isActive) h += '<span class="gd-badge badge-active-tag">open</span>';
    return h;
  }

  _clearGameInfoForm() {
    const carried = this.storage.gameInfo || {};
    this.storage.gameInfo = {
      teamName: carried.teamName || '', jerseyColor: carried.jerseyColor || '',
      projectName: '', week: '', opponent: '', date: '', scoreUs: '', scoreThem: '',
      homeAway: '', gameType: 'game', direction: '', perspective: 'offense',
    };
    // S7-d1: a new game resets to the offense default and republishes. force,
    // because the outgoing game may already have been 'offense' while every
    // subscriber still needs to re-render for the new game.
    this.gameContext?.notify({ force: true });
    this._trackedScore = null;
    this._renderGameSummary();
  }
  /** Build the always-visible header summary from the active game's info. */
  _renderGameSummary(giOverride) {
    const el = document.getElementById('gameHeaderSummary');
    if (!el) return;
    const cap = (s) => s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
    const gi = giOverride || this.storage.gameInfo || {};
    const store = this.storage.seasonStore;
    const hasGame = !!(store && store.hasCurrent && store.hasCurrent());
    const hasDetails = !!(gi.opponent || String(gi.week || '').trim());
    let name = '';
    if (hasGame && hasDetails) {
      try { name = store.gameName({ gameInfo: gi }, store.activeIndex ? store.activeIndex() : 0); } catch (e) { name = ''; }
    }
    const meta = [];
    if (gi.date) { const d = new Date(gi.date + 'T00:00:00'); if (!isNaN(d)) meta.push(d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })); }
    if (gi.homeAway) meta.push(cap(gi.homeAway));
    if (gi.gameType && gi.gameType !== 'game') meta.push(cap(gi.gameType));
    const us = gi.scoreUs, them = gi.scoreThem;
    if (us !== '' && us != null && them !== '' && them != null) meta.push(`${us}–${them}`);
    const label = name || (hasGame ? 'Set up this game' : 'No game open');
    el.innerHTML = `<span class="${name ? 'ghb-name' : 'ghb-name is-empty'}">${this._esc(label)}</span>`
      + (name && meta.length ? `<span class="ghb-meta">${this._esc(meta.join(' · '))}</span>` : '');
  }

  _afterNewGame() {
    this._renderGamesPanel?.();
  }

  /** Set an input/select value by id (no-op when the element is absent). */
  _setVal(id, v) { const el = document.getElementById(id); if (el) el.value = v; }

  // "Expand" toggles the video to full screen so a coach can watch a play
  // bigger; the default size is unchanged. Native Fullscreen API on
  // #videoContainer (video + canvas + playback controls). The Fullscreen target
  // is resolved at click time (not bind time) so it stays correct if support
  // changes. The drawing canvas is re-fit whenever the video resizes.
  _bindExpandVideo() {
    const btn = document.getElementById('btnExpandVideo');
    const target = document.getElementById('videoContainer');
    if (!btn || !target) return;
    btn.addEventListener('click', () => {
      const fsEl = document.fullscreenElement || document.webkitFullscreenElement;
      if (fsEl) { (document.exitFullscreen || document.webkitExitFullscreen)?.call(document); return; }
      const enter = target.requestFullscreen || target.webkitRequestFullscreen;
      if (!enter) { this.tagger?.toast?.("Full screen isn't supported here."); return; }
      const p = enter.call(target);
      if (p && p.catch) p.catch(() => this.tagger?.toast?.("Couldn't enter full screen."));
    });
    const onChange = () => {
      const on = (document.fullscreenElement || document.webkitFullscreenElement) === target;
      btn.textContent = on ? 'Exit Full Screen' : 'Expand';
      btn.classList.toggle('is-active', on);
      this._onVideoResize();
    };
    document.addEventListener('fullscreenchange', onChange);
    document.addEventListener('webkitfullscreenchange', onChange);
  }

  /** Re-fit the drawing canvas after the video element resizes. */
  _onVideoResize() {
    requestAnimationFrame(() => { try { this.canvas && this.canvas._syncSize && this.canvas._syncSize(); } catch (e) {} });
  }

  _wireEvents() {
    // Re-render only when playback enters/leaves an annotated frame. Clearing a
    // full-resolution transparent canvas on every timeupdate caused visible
    // hitches even in the overwhelmingly common no-drawings path.
    this.vc.on('time-update', () => {
      this.canvas.renderPlaybackFrame();
    });

    // Persist added film through ONE choke point: the playlist's onFilmFiles
    // hook fires for every add that goes through addFiles (the top-bar picker's
    // folder/multi path AND the Playlist-panel "Add Clips" button), so we no
    // longer call importFilm inline for that path (the panel path used to skip
    // it, dropping its clips on reopen). No-ops on browser; skips linked games.
    this.playlist.onFilmFiles = (files) => this.storage.importFilm(files);

    // Handle file selection from top bar (single or multi)
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

    // Update timeline markers when plays change
    this.tagger.on('play-created', () => {
      this.tagger.updateScrubBarPlays();
    });
    this.tagger.on('play-deleted', () => {
      this.tagger.updateScrubBarPlays();
    });
    this.tagger.on('play-updated', () => {
      this.tagger.updateScrubBarPlays();
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

    // Re-sync canvas overlay when multi-angle layout changes
    this.multiAngle.on('view-changed', () => requestAnimationFrame(() => this.canvas._syncSize()));
    this.multiAngle.on('angle-loaded', () => requestAnimationFrame(() => this.canvas._syncSize()));
    this.multiAngle.on('angle-removed', () => requestAnimationFrame(() => this.canvas._syncSize()));
  }

  _bindKeyboard() {
    document.addEventListener('keydown', (e) => {
      // Don't capture keys when typing in inputs
      const tag = e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;

      // "?" toggles the shortcuts legend; Esc closes it (handle before others).
      const shortcutsOpen = this.shortcutsScreen?.isOpen();
      if (e.key === '?') { e.preventDefault(); this.toggleShortcuts?.(); return; }
      if (shortcutsOpen && e.code === 'Escape') { e.preventDefault(); this.toggleShortcuts?.(false); return; }
      if (shortcutsOpen) return; // swallow other keys while the legend is open

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
        // Drawing-tool digits arm when no play is selected OR the settings
        // drawer (Drawing Tools panel) is open — a play is now auto-selected
        // the moment film loads, so "no play selected" alone was unreachable.
        // While tagging with the drawer closed, a stray digit must never
        // silently switch to the crosshair.
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
    // Tool buttons
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const tool = btn.dataset.tool;
        this._selectTool(this.canvas.currentTool === tool ? null : tool);
      });
    });

    // Color swatches
    document.querySelectorAll('.swatch').forEach(swatch => {
      swatch.addEventListener('click', () => {
        document.querySelectorAll('.swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        this.canvas.color = swatch.dataset.color;
      });
    });

    // Line width slider. Guarded: an absent element must not throw here and
    // abort the rest of the constructor's wiring (the whole app init runs in
    // one chain, so one missing node used to silently break everything below).
    const slider = document.getElementById('lineWidthSlider');
    if (slider) slider.addEventListener('input', () => {
      this.canvas.lineWidth = parseInt(slider.value, 10);
    });

    // Clear annotations (undo/redo now live as a single pair in the top bar).
    // Uses the in-app confirm (lesson #8: native confirm() gets suppressed on
    // repeat and silently returns false, making the button look broken).
    const btnClear = document.getElementById('btnClearAnnotations');
    if (btnClear) btnClear.addEventListener('click', async () => {
      if (await this.tagger._confirmDialog('Clear all annotations on this play?', 'Clear Annotations')) {
        this.canvas.clearAllAnnotations();
      }
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
    // Update cursor
    this.canvas.canvas.style.cursor = toolName ? 'crosshair' : 'default';
  }

  /**
   * Keep the local Python CV backend's live availability fresh, so
   * SettingsScreen.analysisProfile() (read by the native Analysis tab, which
   * computes its own status/enable affordance directly from backend.
   * isAvailable()/vision.apiKey) never reads a stale probe result.
   *
   * Final Engine Independence: there is no status badge to write into --
   * that badge lived inside the permanently hidden #giLegacyEngineHost, which
   * made its click-to-enable affordance genuinely unreachable to a coach. The
   * opt-in action now lives in Settings → Analysis (SettingsScreen.
   * enableLocalServer()); this method only keeps backend.probe()'s own
   * network-only-when-enabled invariant doing its background work.
   */
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
    document.getElementById('btnEditGame')?.addEventListener('click', event => {
      this.gameScreen.open({ mode: 'edit', returnFocus: event.currentTarget });
    });
    // S7-d1: the hidden context inputs are gone. GameContext is the bus, and
    // native Settings owns the analysis provider/model, so nothing here binds
    // to legacy form DOM. Vision is seeded straight from storage.
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

  /** Copy the tagged score into the active game's final score. */
  _applyTrackedScore() {
    const sb = this._trackedScore || this.stats.computeScoreboard();
    this._setGameScore(sb.us, sb.them);
  }

  /** Mark the onboarding checklist's "See your stats" step complete once the
   *  coach opens Reports for THEIR OWN data (not the demo -- exploring the
   *  demo shouldn't silently complete onboarding). Flag read by
   *  _checklistItems. Called from WorkspaceShell.show('reports') -- Reports
   *  is a native shell route now, not a legacy button click. */
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

  /** Persist native Analysis settings without depending on retired form DOM. */
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

  /** Apply game-owned metadata without reading a retired DOM form or writing
   * durable storage. The caller owns the transaction and persist decision. */
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
      // S7-d1: the draft and the stored value are the only sources. The hidden
      // #gameTeamName / #gameJerseyColor / #gameDirection reads are gone —
      // `direction` in particular used to fall back to an input that S7-d8
      // deletes, which would have written '' over the coach's stored value.
      teamName: draft.teamName ?? current.teamName ?? '',
      jerseyColor: draft.jerseyColor ?? current.jerseyColor ?? '',
      direction: draft.direction ?? current.direction ?? '',
      perspective: draft.perspective || current.perspective || 'offense',
      gameType: draft.gameType || current.gameType || 'game',
    };

    // S7-d1: publish through the service instead of dispatching a synthetic
    // `change` on a hidden <select>. notify() no-ops when nothing moved, so a
    // reload does not churn every subscriber.
    if (this.storage.gameInfo.perspective !== priorPerspective) this.gameContext?.notify();
    this._renderGameSummary();
    this._checkFinishHint();
    return this.storage.gameInfo;
  }

  _setGameScore(scoreUs, scoreThem) {
    this._applyGameInfoDraft({ scoreUs: String(scoreUs ?? ''), scoreThem: String(scoreThem ?? '') });
    this.storage.commitActive();
    this.storage._autoSave();
  }

  /**
   * Commit the current game context. S7-d1: this used to re-read four hidden
   * inputs and write them back, which is how `direction` would have been
   * blanked once they were deleted. gameInfo is already authoritative, so this
   * only persists and mirrors team identity forward.
   */
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
    // S7-d1: carry identity forward through the context service. Only fills a
    // BLANK field, so a game that carries its own identity is never overwritten.
    const current = this.gameContext.snapshot();
    const patch = {};
    if (!current.teamName && profile.teamName) patch.teamName = profile.teamName;
    if (!current.jerseyColor && profile.jerseyColor) patch.jerseyColor = profile.jerseyColor;
    if (Object.keys(patch).length && this.gameContext.update(patch)) this._saveGameInfo();
  }

  _loadGameInfo(info) {
    if (!info) return;
    this._loadingGameInfo = true;
    this._renderGameSummary(info);
    // S7-d1: opening a game republishes the context. force, because the
    // incoming game may share the outgoing game's perspective while every
    // subscriber still has to re-render for the new game.
    this.gameContext?.notify({ force: true });
    const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
    if (savedKey) this.vision.apiKey = savedKey;
    const savedModel = localStorage.getItem('ffa_claude_model') || '';
    if (savedModel) this.vision.model = savedModel;
    this._loadingGameInfo = false;
    // S7-d1: a game with no stored identity inherits the team profile. This
    // used to happen by accident — the hidden #gameTeamName input kept the
    // previous game's value across _deserialize's gameInfo overwrite, and
    // _saveGameInfo read it back out of the DOM. With the input gone the carry
    // has a real owner: the team profile, which is where it always belonged.
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

  /**
   * Scout mode follows the game context. S7-d1: this was a `change` listener on
   * the hidden #gamePerspective <select>; it is now a GameContext subscriber,
   * so the sticky charting unit survives deleting that markup.
   */
  _bindScoutMode() {
    const unitFromPerspective = (p) => {
      if (p === 'defense') return 'defense';
      if (p === 'special') return 'special';
      return 'offense'; // offense or scout (charts both, default offense layout)
    };
    const apply = ({ perspective }) => {
      const isScout = perspective === 'scout';
      document.getElementById('scoutSection')?.classList.toggle('hidden', !isScout);
      document.getElementById('tagForm')?.classList.toggle('is-scout', isScout);
      this.tagger.defaultUnit = unitFromPerspective(perspective);
    };
    this.gameContext.subscribe(apply);
    apply(this.gameContext.snapshot());
    document.getElementById('btnScoutReport')
      ?.addEventListener('click', () => this.stats.renderScoutReport());
  }

  _bindTagNav() {
    const btnPrev = document.getElementById('btnTagPrev');
    const btnNext = document.getElementById('btnTagSaveNext');
    const btnSkip = document.getElementById('btnTagSkip');
    const yardsMinus = document.getElementById('yardsMinus');
    const yardsPlus = document.getElementById('yardsPlus');
    const yardsInput = document.getElementById('tagYardage');
    const autoplayNext = document.getElementById('autoplayNextToggle');

    if (autoplayNext) {
      autoplayNext.checked = this.autoPlayNext;
      autoplayNext.addEventListener('change', () => {
        this.autoPlayNext = autoplayNext.checked;
        try { localStorage.setItem('ffa_autoplay_next', this.autoPlayNext ? '1' : '0'); } catch {}
      });
    }

    btnPrev?.addEventListener('click', () => {
      this.notes?.flush();
      if (this.cutupPlayer?.active) {
        this.cutupPlayer.prev();
        return;
      }
      this.tagger.prevPlay();
      this._autoPlayCurrent();
    });
    btnNext?.addEventListener('click', () => this._advancePlay());
    // Skip = move on WITHOUT carrying this play's situation forward (it was
    // previously identical to Save & Next — a fake choice).
    btnSkip?.addEventListener('click', () => this._advancePlay({ skip: true }));

    // Surface tagger feedback (e.g. "Mark the start first") through the
    // shared toast. Lazy lambda — history may not exist yet at bind time.
    this.tagger.toast = (msg, opts) => this.history?._toast(msg, opts);

    // Enter inside yardage/distance saves & advances — the global Enter
    // shortcut ignores inputs, which forced a mouse trip to Save & Next on
    // every play. This is the hottest path in the whole tagging flow.
    [yardsInput, document.getElementById('tagDistance')].forEach(inp => {
      inp?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          e.preventDefault();
          this._advancePlay();
        }
      });
    });

    // Auto down & distance toggle. S7: PlayTagger.setAutoDD is the one write
    // path now — the checkbox (if present) is an optional mirror of it.
    const autoDD = document.getElementById('autoDDToggle');
    if (autoDD) {
      autoDD.checked = this.tagger.autoDD;
      autoDD.addEventListener('change', () => this.tagger.setAutoDD(autoDD.checked));
    }

    // Carry formation/personnel/front/coverage to the next play (opt-in).
    const carryScheme = document.getElementById('carrySchemeToggle');
    if (carryScheme) {
      carryScheme.checked = this.tagger.carryScheme;
      carryScheme.addEventListener('change', () => this.tagger.setCarryScheme(carryScheme.checked));
    }

    // Yardage is a magnitude (positive); the Result chip sets the direction.
    yardsMinus?.addEventListener('click', () => {
      const v = parseInt(yardsInput.value) || 0;
      yardsInput.value = Math.max(0, v - 1);
      yardsInput.dispatchEvent(new Event('change'));
    });
    yardsPlus?.addEventListener('click', () => {
      const v = parseInt(yardsInput.value) || 0;
      yardsInput.value = v + 1;
      yardsInput.dispatchEvent(new Event('change'));
    });
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
  /** Render the autosave state on the native Break Down route's save
   *  indicator: "Saving..." while a debounced write is armed, settling to
   *  "Saved". Ctrl+S / the More menu remain the explicit-save action; this
   *  just makes persistence VISIBLE. Final Engine Independence: the legacy
   *  #btnSave top-bar button this used to also render into is gone. */
  _renderSaveState(state) {
    this.breakdownWorkspace?.setSaveState(state);
  }

  /** Brief "saved ✓" acknowledgment on Save & Next — closure for the hottest
   *  action in the app. Pure class toggle; CSS renders it (and the ✓ shows
   *  even under prefers-reduced-motion — it's state, not motion). */
  _flashSaved() {
    const btn = document.getElementById('btnTagSaveNext');
    if (!btn) return;
    btn.classList.add('just-saved');
    clearTimeout(this._savedFlashTimer);
    this._savedFlashTimer = setTimeout(() => btn.classList.remove('just-saved'), 650);
  }

  _advancePlay(opts = {}) {
    // Commit a value still being edited (yardage/notes) before advancing,
    // then blur so the next keystrokes hit the shortcuts, not the input.
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
    }
    this.notes?.flush();

    // Analytics rows, Film Room selections, and Study results establish an
    // intentional example set. While that cut-up is active, its queue owns
    // navigation: falling through to chronological nextPlay() silently leaves
    // the grouping the coach asked to review. Do not carry situation/scheme to
    // a filtered example because those plays are usually nonconsecutive.
    if (this.cutupPlayer?.active) {
      if (!opts.skip) this._flashSaved();
      this.cutupPlayer.next();
      return;
    }

    // D-projform (E4 review fix): Save & Next/Enter is the app's "explicit
    // save" gesture for the play being LEFT, during NORMAL chronological
    // advance only — not Skip (deliberately excluded: it means "moving on
    // without committing anything here," the same reason it doesn't carry
    // situation forward), and not filtered cut-up navigation (already handled
    // and returned above — a curated Study/Film Room review queue isn't the
    // coach's "I'm done with this play" moment the way ordinary charting is).
    // Canonicalize the projected Formation/QB Alignment/Coverage/Coverage
    // Family fields now, even if the coach never touched one of those chips
    // this visit. A play with nothing to canonicalize is a true no-op (see
    // PlayTagger.commitProjectedLook).
    if (!opts.skip) this.tagger.commitProjectedLook?.();

    // 1) Next play in the list (also switches clip in folder mode).
    //    Skip advances plainly; Save & Next carries situation/unit forward.
    const advanced = opts.skip
      ? this.tagger.nextPlay()
      : this.tagger.nextPlayWithSituation();
    if (advanced) {
      if (!opts.skip) this._flashSaved();
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
      this.history?._toast('Last play — all tagged. Finish the game from the season chip.');
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
      'KeyX': ['playType', 'Trick Play'],
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
      const down = e.code.replace('Digit', '');
      const tf = this.tagger.tagFields.down;
      if (tf) {
        tf.value = tf.value === down ? '' : down;
        this.tagger._saveField('down');
      }
      return true;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return false;

    const curPlay = this.tagger.getCurrentPlay();
    const curUnit = (curPlay && curPlay.tags.unit) || this.tagger.defaultUnit || 'offense';

    // Y jumps to the yardage input (type the number, Enter advances) —
    // closing the only step that still forced a mouse trip every play.
    if (e.code === 'KeyY' && !e.shiftKey) {
      e.preventDefault();
      const nativeYd = document.querySelector('[data-native-tagging] [data-native-field="yardage"] input');
      const yd = nativeYd?.getClientRects().length ? nativeYd : document.getElementById('tagYardage');
      if (yd) { yd.focus(); yd.select(); }
      return true;
    }

    // C cycles the unit toggle (Offense → Defense → Special Teams).
    if (e.code === 'KeyC' && !e.shiftKey) {
      e.preventDefault();
      const order = ['offense', 'defense', 'special'];
      const nextUnit = order[(order.indexOf(curUnit) + 1) % order.length];
      this.tagger.setUnit(nextUnit);
      return true;
    }

    // In Special Teams mode, digits 1-9 pick the ST play type.
    if (curUnit === 'special' && !e.shiftKey && /^Digit[1-9]$/.test(e.code)) {
      const stTypes = ['Kickoff', 'Kick Return', 'Punt', 'Punt Return', 'Field Goal', 'XP', '2-Pt', 'Onside', 'Fake'];
      const n = parseInt(e.code.replace('Digit', ''), 10);
      if (n >= 1 && n <= stTypes.length) {
        e.preventDefault();
        const tf = this.tagger.tagFields.stType;
        const val = stTypes[n - 1];
        if (tf) {
          tf.value = tf.value === val ? '' : val;
          this.tagger._saveField('stType');
        }
        return true;
      }
    }

    const mapped = keyMap[e.code];
    if (!mapped) return false;

    e.preventDefault();
    const [field, value] = mapped;
    const tf = this.tagger.tagFields[field];
    if (tf) {
      // Multi-select fields (e.g. Play Type) toggle membership; single replace.
      if (typeof tf.toggle === 'function') tf.toggle(value);
      else tf.value = tf.value === value ? '' : value;
      this.tagger._saveField(field);
    }
    return true;
  }

  _updateTagProgress() {
    const label = document.getElementById('tagProgressLabel');
    const fill = document.getElementById('tagProgressFill');
    if (!label || !fill) return;
    const total = this.tagger.plays.length;
    const tagged = this.tagger.plays.filter(isPlayTagged).length;
    label.textContent = `${tagged} / ${total} tagged`;
    fill.style.width = total > 0 ? Math.round((tagged / total) * 100) + '%' : '0%';
  }

  // _drawMotionGraph moved to AutoDetectScreen.drawMotionGraph (Final Engine
  // Independence) -- same imperative canvas renderer, now called with the
  // Preact panel's own canvas ref instead of #motionGraphCanvas.
}

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
