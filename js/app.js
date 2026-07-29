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
import { getNativeOverlayService } from './native-root.jsx';
import { StudyPlan } from './study-plan.js';
import { PlanExport } from './plan-export.js';
import { PlanScreen } from './plan-screen.js';
import { WorkspaceShell } from './workspace-shell.js';
import { BreakdownVideo } from './breakdown-video.js';
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
import { Wizard } from './wizard.js';
import { CustomFieldsManager } from './custom-fields.js';
import { CustomChips } from './custom-chips.js';
import { TagLibrarySettings } from './tag-library-settings.js';
import { BreakdownForm } from './breakdown-form.js';
import { PlayDiagram } from './play-diagram.js';
import { MultiAngle } from './multi-angle.js';
import { Updater } from './updater.js';
import { SeasonLibrary } from './season-library.js';
import { PlayGrid } from './play-grid.js';
import { configureBetaDefaults } from './beta-config.js';

/**
 * Single source of truth for the displayed app version. Keep in lockstep with
 * src-tauri/{Cargo.toml,tauri.conf.json,Cargo.lock} on every release (the web
 * bundle can't read those at runtime). On desktop, the live Tauri config
 * version overrides this at runtime via Updater._currentVersion().
 */
const APP_VERSION = '1.12.0-12';

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
    this.quickChart = new QuickChart(this.vc, this.tagger, this.playlist);
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
    this.settingsScreen = new SettingsScreen(this, this.overlays);
    this.playImport = new PlayImportScreen(this, this.overlays);
    this.shortcutsScreen = new ShortcutsScreen(this.overlays);
    this.history = new HistoryManager(this.tagger);
    this.versions = new VersionManager(this.storage, this.tagger);
    this.ocr = new ScoreboardOCR(this.vc, this.tagger);
    this.suggestions = new SuggestionEngine(this.tagger);
    this.cutup = new CutupExporter(this.vc, this.tagger, this.filter, this.playlist);
    this.cutupPlayer = new CutupPlayer(this.vc, this.tagger, {
      shouldAutoPlayNext: () => this.autoPlayNext,
    });
    this.playGrid = new PlayGrid(this.tagger, this.vc, this.cutupPlayer);
    this.season = new SeasonManager(this.stats);
    this.library = new SeasonLibrary();
    this.teamHubScreen = new TeamHubScreen(this, this.overlays);
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
    this.callSheet = new CallSheetBuilder(this.tagger);
    this.uiPolish = new UIPolish(this);
    this.vc.beforeFilesSelected = files => this.uiPolish.prepareFilmFiles(files);
    this.wizard = new Wizard({ videoController: this.vc, tagger: this.tagger, stats: this.stats, history: this.history });

    // Give storage references
    this.storage.playlist = this.playlist;
    this.storage.filter = this.filter;
    this.storage.versions = this.versions;

    // Wire cross-module events
    this._wireEvents();

    // Wire game info form
    this._bindGameInfo();
    this._bindGameModal();
    this._bindExpandVideo();

    // Wire report export
    this._bindReportExport();

    // Keyboard shortcuts
    this._bindKeyboard();

    // Drawing tool UI
    this._bindToolUI();

    // Sidebar panel toggles are handled by UIPolish._initPanelCollapse().
    // (A second binding here previously double-toggled every panel, so a
    // collapsed panel like Roster opened then instantly closed on tap.)

    // Auto-detect UI
    this._bindAutoDetect();

    // Probe the local CV backend and keep the status badge in sync
    this._bindBackendStatus();

    // Enable auto-save + surface its state on the top-bar Save button
    // ("● Saving…" while a debounced write is armed → "✓ Saved" settled), so
    // the coach always knows their work persisted (UX audit A1/C2).
    this.storage.onSaveState = (s) => this._renderSaveState(s);
    this.storage.enableAutoSave();

    // Quick-chart save triggers auto-save via play-updated event
    this.quickChart.on('play-charted', () => {
      this.tagger._emit('play-updated', this.tagger.getCurrentPlay());
    });

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

    // Mark the onboarding checklist's "See your stats" step once the coach
    // opens the dashboard for THEIR OWN data (not the demo — exploring the demo
    // shouldn't silently complete onboarding). Flag read by _checklistItems.
    document.getElementById('btnShowStats')?.addEventListener('click', () => {
      const store = this.storage?.seasonStore;
      if (store && this.storage.isDemoSeason(store.currentSeasonId)) return;
      try { localStorage.setItem('ffa_seen_stats', '1'); } catch (e) {}
    });

    // Desktop auto-update (no-op on the web build).
    this.updater = new Updater();
    this.updater.init();
    this._bindUpdateCheck();
    this._bindOpenDataFolder();
  }

  /**
   * Render the version footer in the More menu. Web and desktop ship on
   * independent cadences, so each must show its OWN running version: the web
   * bundle shows the APP_VERSION compiled into it; the desktop build overrides
   * it with the actual installed version from the Tauri runtime (which can
   * legitimately differ from this bundle's constant). The build type is shown
   * too so a bug report identifies both number and platform.
   */
  _initVersionLabel() {
    const el = document.getElementById('appVersionLabel');
    if (!el) return;
    const isDesktop = !!(typeof window !== 'undefined' && window.__TAURI__);
    el.textContent = `GridIron IQ v${APP_VERSION} · ${isDesktop ? 'Desktop' : 'Web'}`;
    if (isDesktop) {
      try {
        const p = window.__TAURI__?.app?.getVersion?.();
        if (p && typeof p.then === 'function') {
          p.then(v => { if (v) el.textContent = `GridIron IQ v${v} · Desktop`; }).catch(() => {});
        }
      } catch (_) { /* fall back to APP_VERSION already shown */ }
    }
  }

  versionLabel() {
    const live = document.getElementById('appVersionLabel')?.textContent?.trim();
    return live || `GridIron IQ v${APP_VERSION} · ${window.__TAURI__ ? 'Desktop' : 'Web'}`;
  }

  /** Wire the "Check for Updates" menu item (desktop build only). */
  _bindUpdateCheck() {
    const btn = document.getElementById('btnCheckUpdate');
    const divider = document.getElementById('updateDivider');
    if (!btn) return;
    // Only meaningful on the Tauri desktop build; stays hidden on the web.
    if (!this.updater.available) return;
    btn.hidden = false;
    if (divider) divider.hidden = false;
    btn.addEventListener('click', () => {
      document.getElementById('moreDropdown')?.classList.add('hidden');
      this.updater.check(true);
    });
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
  async openGame(gid) {
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
    this.season?._renderAll?.();
    // Workspace transition. Break Down is a shell route: its render relocates the
    // canonical Settings/More chrome, so every entry route lands on identical
    // chrome. The redesigned shell is the unconditional product and owns the
    // workspace.
    // The `.root` check is "is the shell mounted" (always true in the product);
    // the else is pure crash-safety, not a second product route.
    if (this.workspaceShell?.root) {
      await this.workspaceShell.show('breakdown');
    } else {
      this.library?.hide?.();
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
      const usEl = document.getElementById('gameScoreUs');
      const themEl = document.getElementById('gameScoreThem');
      if (usEl) usEl.value = result.scoreUs;
      if (themEl) themEl.value = result.scoreThem;
      this._saveGameInfo();
    }

    store.setGameStatus(game.id, 'final');
    this._renderGamesPanel();   // commits live state (incl. status) into the node
    store.persist();
    this.season._renderAll?.();

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
    document.getElementById('btnPanelNewGame')?.addEventListener('click', () => {
      this._openGameModal('create');
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
        const ok = await this.tagger._confirmDialog(`Remove "Game ${idx + 1}: ${r.name}" from the season?`, 'Remove');
        if (!ok) return;
        this.storage.removeGame(g.id);
        this._renderGamesPanel();
        this.season._renderAll?.();
        // In-situ recovery (UX audit A2): the stash-backed one-shot undo.
        this.history?._toast(`Removed "${r.name}"`, {
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

  /** Standard badge HTML (score pill + Final + open) used by dropdown & panel. */
  _gameBadgesHtml(r) {
    let h = '';
    if (r.hasScore) h += this._scorePillHtml(r.u, r.t);
    if (r.isFinal) h += '<span class="gd-badge badge-final">Final</span>';
    if (r.isActive) h += '<span class="gd-badge badge-active-tag">open</span>';
    return h;
  }

  /** Wire the "Open Data Folder" menu item (desktop build only). */
  _bindOpenDataFolder() {
    const btn = document.getElementById('btnOpenDataFolder');
    const divider = document.getElementById('updateDivider');
    const store = this.storage && this.storage.seasonStore;
    if (!btn || !store || !store.canOpenDataDir || !store.canOpenDataDir()) return;
    btn.hidden = false;
    if (divider) divider.hidden = false;
    btn.addEventListener('click', async () => {
      document.getElementById('moreDropdown')?.classList.add('hidden');
      let dir = '';
      try { dir = await store.openDataDir(); } catch (e) {}
      // Always surface the location (the OS file manager may also have opened).
      if (dir) this.updater._toast(`Your seasons are saved in:\n${dir}`);
    });
  }

  /** Blank every Game Info input — used when switching to a different game. */
  _clearGameInfoForm() {
    ['gameWeek', 'gameOpponent', 'gameDate', 'gameScoreUs', 'gameScoreThem',
     'gameHomeAway', 'gameDirection'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    const typeEl = document.getElementById('gameType'); if (typeEl) typeEl.value = 'game';
    const perspectiveEl = document.getElementById('gamePerspective');
    if (perspectiveEl) perspectiveEl.value = 'offense';
    // Team identity (team name, jersey color) carries forward across games, so
    // it's intentionally left in place here.
    this.storage.gameInfo = {
      ...this.storage.gameInfo,
      projectName: '', week: '', opponent: '', date: '', scoreUs: '', scoreThem: '',
      homeAway: '', gameType: '', direction: '', perspective: 'offense',
    };
    // Perspective owns both scout styling and the default unit for the next
    // play. A fresh game must not inherit either from the previous film. Suppress
    // the normal save listener: this form is between games and has no owner yet.
    if (perspectiveEl) {
      const wasLoading = this._loadingGameInfo;
      this._loadingGameInfo = true;
      perspectiveEl.dispatchEvent(new Event('change'));
      this._loadingGameInfo = wasLoading;
    }
    this._trackedScore = null;
    this._renderGameSummary();
  }

  // ---- Game menu — single create/edit surface ------------------------------
  // A game used to be created blank, with its details (date/opponent/score) only
  // reachable in the collapsed Game Info panel inside Settings — skipped, so the
  // season had no chronological anchor. This one menu is the canonical home for
  // game details: + New Game opens it to CREATE, the header opens it to EDIT.
  // Date defaults to today, so games are always dated. While the menu is open,
  // _saveGameInfo is suppressed (_gameModalOpen) so a draft/in-progress edit
  // doesn't auto-write until Save; Cancel restores the inputs from the active
  // game. Games are ordered by date (Hudl model); Week is a label only.
  _bindGameModal() {
    document.getElementById('gmSave')?.addEventListener('click', () => this._confirmGameModal());
    document.getElementById('gmCancel')?.addEventListener('click', () => this._cancelGameModal());
    document.getElementById('gmClose')?.addEventListener('click', () => this._cancelGameModal());
    document.getElementById('btnEditGame')?.addEventListener('click', () => this._openGameModal('edit'));
    const modal = document.getElementById('gameModal');
    modal?.addEventListener('click', (e) => { if (e.target === modal) this._cancelGameModal(); });
    modal?.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') this._cancelGameModal();
      else if (e.key === 'Enter' && e.target.tagName === 'INPUT') { e.preventDefault(); this._confirmGameModal(); }
    });
    this._renderGameSummary();
  }

  /** `opts.focus` names the field that should receive focus. Callers that want
   *  a specific field MUST pass it rather than scheduling their own competing
   *  setTimeout — two racing focus timers meant a ~10ms margin decided where the
   *  coach's keyboard landed, which is both unpredictable for them and a
   *  perpetual source of timing-fragile tests. One modal, one focus decision. */
  _openGameModal(mode, opts = {}) {
    const modal = document.getElementById('gameModal');
    if (!modal) { this.storage.newGame(); this._afterNewGame(); return; }  // graceful fallback
    this._gameModalMode = mode;
    this._gameModalOpen = true;   // suppress auto-save while the menu is open
    const title = document.getElementById('gmTitle');
    const saveBtn = document.getElementById('gmSave');
    if (mode === 'create') {
      ['gameWeek', 'gameOpponent', 'gameScoreUs', 'gameScoreThem', 'gameHomeAway'].forEach(id => this._setVal(id, ''));
      this._setVal('gameType', 'game');
      this._setVal('gmPerspective', 'offense');
      this._setVal('gameDate', new Date().toISOString().slice(0, 10));   // default today → always dated
      if (title) title.textContent = 'New game';
      if (saveBtn) saveBtn.textContent = 'Create game';
    } else {
      // Edit: inputs already reflect the active game (kept by _loadGameInfo).
      this._setVal('gmPerspective', document.getElementById('gamePerspective')?.value || 'offense');
      if (title) title.textContent = 'Game settings';
      if (saveBtn) saveBtn.textContent = 'Save';
    }
    this._updateTrackedScore();
    modal.classList.remove('hidden');
    const focusId = opts.focus || (mode === 'create' ? 'gameWeek' : 'gameOpponent');
    document.getElementById(focusId)?.focus();
  }

  _closeGameModal() {
    this._gameModalOpen = false;
    document.getElementById('gameModal')?.classList.add('hidden');
  }

  _cancelGameModal() {
    // Discard: restore inputs from the (unchanged) active game. A create draft
    // committed nothing, so this just clears the draft back to the current game.
    // Loading metadata normally seeds the next-play unit; Cancel must preserve
    // the coach's current sticky charting choice because no intent changed.
    const defaultUnit = this.tagger?.defaultUnit;
    this._gameModalOpen = false;
    this._loadGameInfo(this.storage.gameInfo || {});
    if (defaultUnit) this.tagger.defaultUnit = defaultUnit;
    this._closeGameModal();
  }

  _confirmGameModal() {
    const val = (id) => (document.getElementById(id)?.value || '').trim();
    const draft = {
      week: val('gameWeek'), opponent: val('gameOpponent'), date: val('gameDate'),
      homeAway: val('gameHomeAway'), gameType: val('gameType') || 'game',
      scoreUs: val('gameScoreUs'), scoreThem: val('gameScoreThem'),
      perspective: val('gmPerspective') || 'offense',
    };
    this._gameModalOpen = false;
    if (this._gameModalMode === 'create') {
      this.storage.newGame();   // commits current game, creates/reuses a blank, loads it (clears inputs)
      this._setVal('gameWeek', draft.week); this._setVal('gameOpponent', draft.opponent); this._setVal('gameDate', draft.date);
      this._setVal('gameHomeAway', draft.homeAway); this._setVal('gameType', draft.gameType);
      this._setVal('gameScoreUs', draft.scoreUs); this._setVal('gameScoreThem', draft.scoreThem);
    }
    const perspectiveEl = document.getElementById('gamePerspective');
    const perspectiveChanged = this._gameModalMode === 'create' || perspectiveEl?.value !== draft.perspective;
    if (perspectiveEl && perspectiveChanged) {
      perspectiveEl.value = draft.perspective;
      perspectiveEl.dispatchEvent(new Event('change', { bubbles: true }));
    } else {
      this._saveGameInfo();
    }
    this._renderGameSummary();
    this._closeGameModal();
    this._afterNewGame();
    // Hand the novice the next step: the empty video area now says why it's
    // empty and what to do (UX audit B3).
    if (this._gameModalMode === 'create') {
      const dt = document.getElementById('dropzoneTitle');
      if (dt) dt.textContent = 'Game created — now add the film';
      this.history?._toast('Game created — add film to start tagging');
    }
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
    this.season?._renderAll?.();
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

    const btnRepairFilm = document.getElementById('btnRepairFilm');
    const repairInput = document.getElementById('repairFilmInput');
    if (btnRepairFilm && repairInput) {
      btnRepairFilm.addEventListener('click', () => repairInput.click());
      repairInput.addEventListener('change', async (e) => {
        const files = this.vc._filterVideoFiles(Array.from(e.target.files || []))
          .sort((a, b) => (a.webkitRelativePath || a.name).localeCompare(
            b.webkitRelativePath || b.name, undefined, { numeric: true, sensitivity: 'base' }));
        e.target.value = '';
        await this.storage.repairFilm(files);
      });
    }

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
    return !this.tagger.currentPlayId ||
      document.querySelector('.settings-drawer')?.classList.contains('open');
  }

  _selectTool(toolName) {
    this.canvas.currentTool = toolName;
    document.querySelectorAll('.tool-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tool === toolName);
    });
    // Update cursor
    this.canvas.canvas.style.cursor = toolName ? 'crosshair' : 'default';
  }


  _bindAutoDetect() {
    const btnAutoDetect = document.getElementById('btnAutoDetect');
    const btnCancelScan = document.getElementById('btnCancelScan');
    const progressDiv = document.getElementById('autoDetectProgress');
    const progressFill = document.getElementById('scanProgressFill');
    const progressLabel = document.getElementById('scanProgressLabel');
    const settingsDiv = document.getElementById('autoDetectSettings');
    const btnToggleSettings = document.getElementById('btnToggleDetectSettings');
    const resultsDiv = document.getElementById('autoDetectResults');
    const resultCount = document.getElementById('detectResultCount');
    const btnApply = document.getElementById('btnApplyDetected');
    const btnReview = document.getElementById('btnReviewDetected');
    const motionCanvas = document.getElementById('motionGraphCanvas');
    const strictnessSlider = document.getElementById('detectStrictness');
    const strictnessValue = document.getElementById('strictnessValue');
    const audioToggle = document.getElementById('detectUseAudio');
    const minDur = document.getElementById('detectMinDuration');
    const maxDur = document.getElementById('detectMaxDuration');
    const cooldown = document.getElementById('detectCooldown');

    // Toggle settings visibility
    btnToggleSettings?.addEventListener('click', () => {
      settingsDiv?.classList.toggle('hidden');
    });

    // Strictness slider label (shows Loose → Strict)
    const strictnessLabel = (v) => {
      const n = parseFloat(v);
      if (n <= 0.7) return 'Loose';
      if (n <= 0.95) return 'Relaxed';
      if (n <= 1.15) return 'Balanced';
      if (n <= 1.4) return 'Strict';
      return 'Very Strict';
    };
    strictnessSlider?.addEventListener('input', () => {
      if (strictnessValue) strictnessValue.textContent = strictnessLabel(strictnessSlider.value);
    });
    if (strictnessSlider && strictnessValue) strictnessValue.textContent = strictnessLabel(strictnessSlider.value);

    // Start scan. Guard the bind: a missing #btnAutoDetect must not throw and
    // abort the rest of _bindAutoDetect (lesson #9). The handler's internal uses
    // only run once it's attached, so they're safe.
    btnAutoDetect?.addEventListener('click', async () => {
      if (this.detector.isScanning) return;

      // Read settings into v2 detector
      if (strictnessSlider) this.detector.strictness = parseFloat(strictnessSlider.value) || 1.0;
      if (minDur) this.detector.minPlayDuration = parseFloat(minDur.value) || 2;
      if (maxDur) this.detector.maxPlayDuration = parseFloat(maxDur.value) || 30;
      if (cooldown) this.detector.cooldownAfterEnd = parseFloat(cooldown.value) || 2.5;
      if (audioToggle) this.detector.useAudio = audioToggle.checked;

      // Show progress, hide results
      progressDiv.classList.remove('hidden');
      btnCancelScan.classList.remove('hidden');
      resultsDiv.classList.add('hidden');
      btnAutoDetect.disabled = true;
      btnAutoDetect.classList.add('scanning');
      progressLabel.textContent = 'Starting scan…';

      try {
        if (this.playlist.hasClips) {
          // Multi-clip mode (backward-compat stub in v2)
          const results = await this.detector.scanClips(this.playlist);
          const totalDetected = results.reduce((s, r) => s + (r.detected?.length || 0), 0);
          resultCount.textContent = `${totalDetected} action windows found in ${results.length} clips`;
          resultsDiv.classList.remove('hidden');
          btnApply?.classList.add('hidden');
          btnReview?.classList.add('hidden');
        } else {
          // Single-video mode (v2 scan)
          const videoEl = this.vc.videoElement || this.vc.video;
          if (!videoEl || !videoEl.duration) {
            alert('Load a video first.');
            throw new Error('No video');
          }
          await this.detector.scan();

          const plays = this.detector.detectedPlays;

          // Build team context from Game Info (set once, applies to all plays)
          const teamCtx = this._getTeamContext();

          // Seed analyses from the in-browser heuristic analyzer as baseline.
          this._lastAnalyses = this.clipAnalyzer.analyzePlays(plays, this.detector.motionData, teamCtx);

          let visionUsed = false;
          let visionMs = 0;

          // Primary path: Claude Vision API (sends frames, gets structured tags)
          if (this.vision.apiKey && videoEl && plays.length > 0) {
            const t0 = performance.now();
            let tickHandle = null;
            const modelName = this.vision.model.includes('opus') ? 'Opus' : 'Sonnet';
            const renderTick = () => {
              const elapsed = Math.floor((performance.now() - t0) / 1000);
              const phase = elapsed > 5 ? ' (thinking…)' : '';
              progressLabel.textContent = `🧠 ${modelName} analyzing play ${Math.min(this._visionProgress || 1, plays.length)}/${plays.length} · ${elapsed}s${phase}`;
            };
            renderTick();
            tickHandle = setInterval(renderTick, 500);
            progressFill.style.width = '100%';
            progressFill.classList.add('busy');

            try {
              const visionResults = [];
              for (let i = 0; i < plays.length; i++) {
                this._visionProgress = i + 1;
                const p = plays[i];
                try {
                  const result = await this.vision.analyzePlay(videoEl, p.start, p.end, teamCtx);
                  visionResults.push(result);
                } catch (e) {
                  console.warn(`[FFA vision] play ${i + 1} failed:`, e);
                  visionResults.push({ tags: {}, confidence: {}, reasons: {}, extras: { error: e.message } });
                }
              }
              visionMs = Math.round(performance.now() - t0);

              for (let i = 0; i < visionResults.length; i++) {
                const vt = visionResults[i]?.tags || {};
                const ht = this._lastAnalyses[i]?.tags || {};
                const vCount = Object.values(vt).filter(v => v).length;
                const hCount = Object.values(ht).filter(v => v).length;
                if (vCount >= hCount) {
                  this._lastAnalyses[i] = visionResults[i];
                }
              }
              visionUsed = true;
              progressLabel.textContent = `✅ Claude Vision tagged ${visionResults.length} play${visionResults.length !== 1 ? 's' : ''} in ${(visionMs / 1000).toFixed(1)}s`;
            } catch (e) {
              visionMs = Math.round(performance.now() - t0);
              console.warn('[FFA] Claude Vision failed, falling back to heuristics:', e);
              progressLabel.textContent = `⚠️ Vision API error after ${(visionMs / 1000).toFixed(1)}s: ${e.message} — using heuristics`;
            } finally {
              if (tickHandle) clearInterval(tickHandle);
              progressFill.classList.remove('busy');
              delete this._visionProgress;
            }
          } else if (!this.vision.apiKey) {
          }

          // Fallback: local YOLO backend (if vision wasn't used and backend is available)
          if (!visionUsed && this.backend.isAvailable()) {
            const sourceFile = this.vc.currentFile || this.vc.file || null;
            if (sourceFile && plays.length > 0) {
              const t0 = performance.now();
              let tickHandle = null;
              const renderTick = () => {
                const elapsed = Math.floor((performance.now() - t0) / 1000);
                progressLabel.textContent = `🤖 Local server analyzing ${plays.length} play${plays.length !== 1 ? 's' : ''} · ${elapsed}s elapsed`;
              };
              renderTick();
              tickHandle = setInterval(renderTick, 500);
              progressFill.style.width = '100%';
              progressFill.classList.add('busy');
              try {
                const windows = plays.map(p => ({ start: p.start, end: p.end }));
                const backendResults = await this.backend.analyzeBatch(sourceFile, windows, teamCtx);
                const backendMs = Math.round(performance.now() - t0);
                if (Array.isArray(backendResults) && backendResults.length === plays.length) {
                  for (let i = 0; i < backendResults.length; i++) {
                    const bt = backendResults[i]?.tags || {};
                    const ht = this._lastAnalyses[i]?.tags || {};
                    const bCount = Object.values(bt).filter(v => v).length;
                    const hCount = Object.values(ht).filter(v => v).length;
                    if (bCount >= hCount) this._lastAnalyses[i] = backendResults[i];
                  }
                  progressLabel.textContent = `✅ Local server tagged ${backendResults.length} plays in ${(backendMs / 1000).toFixed(1)}s`;
                }
              } catch (e) {
                console.warn('[FFA] backend fallback failed:', e);
              } finally {
                if (tickHandle) clearInterval(tickHandle);
                progressFill.classList.remove('busy');
              }
            }
          }

          const taggedFieldCount = this._lastAnalyses.reduce((sum, a) => {
            return sum + Object.values(a?.tags || {}).filter(v => v).length;
          }, 0);
          const analysisLabel = visionUsed
            ? ` · 🧠 Vision AI in ${(visionMs / 1000).toFixed(1)}s`
            : (this.vision.apiKey ? ' · ⚠️ Vision failed, heuristic fallback' : ' · heuristic (set API key for AI tagging)');

          // For a single short clip (≤ 45s, 1 play), skip the review
          // step and stamp tags immediately — the coach loaded one play
          // and expects to see it tagged, not to click Apply first.
          if (plays.length === 1 && (this.vc.video?.duration || 999) <= 45) {
            const before = this.tagger.plays.length;
            this.detector.applyDetectedPlays();
            this._stampAutoTags(before);
            resultCount.textContent = `1 play auto-tagged · ${taggedFieldCount} fields${analysisLabel}`;
            resultsDiv.classList.remove('hidden');
            btnApply?.classList.add('hidden');
            btnReview?.classList.add('hidden');
          } else {
            resultCount.textContent = `${plays.length} play${plays.length !== 1 ? 's' : ''} detected · ${taggedFieldCount} auto-tags${analysisLabel}`;
            resultsDiv.classList.remove('hidden');
            btnApply?.classList.remove('hidden');
            btnReview?.classList.toggle('hidden', plays.length === 0);
          }
          this._drawMotionGraph(motionCanvas, this.detector.motionData, plays, 0);
        }
      } catch (e) {
        if (e.message !== 'No video') {
          alert('Scan error: ' + e.message);
        }
      }

      btnAutoDetect.disabled = false;
      btnAutoDetect.classList.remove('scanning');
      btnCancelScan.classList.add('hidden');
      progressDiv.classList.add('hidden');
    });

    btnCancelScan?.addEventListener('click', () => {
      this.detector.cancelScan();
      // Also abort an in-flight analyze request, or Cancel would appear to do
      // nothing until the request's own timeout (up to minutes) elapsed.
      try { this.backend && this.backend.cancel && this.backend.cancel(); } catch (e) {}
      try { this.vision && this.vision.cancel && this.vision.cancel(); } catch (e) {}
    });

    // Apply all detected plays directly — also stamp heuristic auto-tags
    btnApply?.addEventListener('click', () => {
      const before = this.tagger.plays.length;
      const added = this.detector.applyDetectedPlays();
      this._stampAutoTags(before);
      resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added · tagged from film`;
      btnReview?.classList.add('hidden');
    });

    // Open the review modal so the coach can tweak each detection
    btnReview?.addEventListener('click', () => {
      this._openDetectionReview();
    });

    // Progress updates — single-clip scan
    this.detector.on('scan-progress', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      const timeStr = data.time != null ? ` · ${data.time.toFixed(1)}s` : '';
      progressLabel.textContent = `${pct}%${timeStr}`;
    });

    // Progress updates — folder / multi-clip scan (one update per clip done)
    this.detector.on('clip-scanned', (data) => {
      const pct = Math.round(data.progress * 100);
      progressFill.style.width = pct + '%';
      progressLabel.textContent = `Clip ${data.index}/${data.total} · ${data.clipName} · ${data.detected} detected`;
    });
  }

  /**
   * Probe the local Python CV backend, update the top-bar status badge,
   * and re-probe periodically so the badge reflects server up/down state
   * while the app is open. When the backend is reachable, auto-detect
   * and clip analysis route through it automatically for real YOLO-based
   * detection instead of in-browser heuristics.
   */
  _bindBackendStatus() {
    const badge = document.getElementById('backendStatusBadge');
    const updateBadge = (available) => {
      if (!badge) return;
      if (available) {
        badge.textContent = 'Auto-Detect: Server';
        badge.classList.add('online');
        badge.classList.remove('offline');
        const caps = this.backend.getCapabilities();
        badge.title = `Local CV server online\n${caps.join('\n')}\nClick to re-probe`;
      } else {
        badge.textContent = 'Auto-Detect: Basic';
        badge.classList.add('offline');
        badge.classList.remove('online');
        badge.title = 'Auto-detect play boundaries — requires the companion server. See Settings → Setup.';
      }
    };

    const updateVisionBadge = () => {
      if (!badge) return false;
      if (this.vision.apiKey) {
        badge.textContent = '🧠 Vision AI';
        badge.classList.add('online');
        badge.classList.remove('offline');
        badge.title = 'Claude Vision API active — plays will be analyzed with AI.\nClick to re-probe local server.';
        return true;
      }
      return false;
    };
    this._updateAnalysisBadge = () => {
      if (!updateVisionBadge()) updateBadge(this.backend.isAvailable());
    };

    if (!updateVisionBadge()) updateBadge(false);
    this.backend.on('availability-changed', (avail) => {
      if (!updateVisionBadge()) updateBadge(avail);
    });

    // Kick off initial probe (non-blocking)
    this.backend.probe().then((avail) => {
      if (!updateVisionBadge()) updateBadge(avail);
    });

    badge?.addEventListener('click', async () => {
      if (updateVisionBadge()) return;
      // Clicking the badge opts into the local CV server. Until then we never
      // touch the network, so a default session stays console-clean.
      this.backend.setEnabled(true);
      badge.textContent = '… probing';
      const ok = await this.backend.probe();
      updateBadge(ok);
    });

    // Re-probe every 30s while the tab is visible so the badge stays fresh
    setInterval(() => {
      if (document.visibilityState === 'visible') {
        this.backend.probe();
      }
    }, 30000);
  }

  /**
   * Read jersey color, perspective, and direction from the Game Info
   * panel. Set once per session/game — applies to every play analyzed.
   */
  _getTeamContext() {
    return {
      jerseyColor: document.getElementById('gameJerseyColor')?.value || '',
      perspective: document.getElementById('gamePerspective')?.value || 'offense',
      direction: document.getElementById('gameDirection')?.value || '',
    };
  }

  /**
   * Merge heuristic auto-tags from this._lastAnalyses onto the plays that
   * were just appended to the tagger. Only writes into empty fields — if
   * the coach already tagged a field manually, we leave it alone.
   */
  _stampAutoTags(startIndex = 0) {
    const analyses = this._lastAnalyses || [];
    if (!analyses.length) return 0;
    const newPlays = this.tagger.plays.slice(startIndex);
    let stamped = 0;
    for (let i = 0; i < newPlays.length && i < analyses.length; i++) {
      const play = newPlays[i];
      const a = analyses[i];
      if (!a || !a.tags) continue;
      for (const [k, v] of Object.entries(a.tags)) {
        // A field is "empty" if blank, or if it's still at its markEnd()
        // default. fieldSide defaults to 'own', so without this the AI's
        // opp-side determination would always be discarded.
        const isDefault = !play.tags[k] || play.tags[k] === ''
          || (k === 'fieldSide' && play.tags[k] === 'own');
        if (v && isDefault) {
          play.tags[k] = v;
          stamped++;
        }
      }
      // Store the raw analysis on the play so the coach can inspect it
      play.analysis = a;
      this.tagger._emit('play-updated', play);
    }
    // Refresh UI panels that depend on tags
    this.tagger._updatePlaySelect?.();
    this.tagger._updateTimeline?.();
    // Reload the tag form so the coach sees the stamped tags immediately.
    // Without this the form still shows the empty defaults from markEnd().
    const current = this.tagger.getCurrentPlay?.();
    if (current) this.tagger._loadTagForm(current);
    return stamped;
  }

  /**
   * Open a review modal where the coach can scrub through each detected
   * play, adjust start/end by ±0.5s, reject false positives, and apply
   * only the ones they want. Mirrors the review step that top coaching
   * tools like Hudl and Catapult provide.
   */
  _openDetectionReview() {
    const plays = (this.detector.detectedPlays || []).map((p, i) => ({
      idx: i,
      start: p.start,
      end: p.end,
      peak: p.peak,
      confidence: p.confidence,
      accepted: true,
    }));
    if (plays.length === 0) {
      alert('No detections to review.');
      return;
    }

    // Remove any prior modal
    document.getElementById('detectReviewModal')?.remove();

    const modal = document.createElement('div');
    modal.id = 'detectReviewModal';
    modal.className = 'detect-review-modal';
    modal.innerHTML = `
      <div class="detect-review-backdrop"></div>
      <div class="detect-review-card">
        <div class="detect-review-head">
          <h3>Review Detected Plays</h3>
          <div class="detect-review-sub">Scrub, trim, or reject each detection. Accept all good plays in one click.</div>
          <button class="detect-review-close" id="detectReviewClose" title="Close">×</button>
        </div>
        <div class="detect-review-toolbar">
          <button class="btn btn-sm" id="detectReviewAcceptAll">Accept All</button>
          <button class="btn btn-sm" id="detectReviewRejectLow">Reject Low Confidence</button>
          <span class="detect-review-count" id="detectReviewCount"></span>
        </div>
        <div class="detect-review-list" id="detectReviewList"></div>
        <div class="detect-review-foot">
          <button class="btn btn-sm" id="detectReviewCancel">Cancel</button>
          <button class="btn btn-sm btn-accent" id="detectReviewApply">Apply Selected</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    const list = modal.querySelector('#detectReviewList');
    const count = modal.querySelector('#detectReviewCount');
    const video = this.vc.videoElement || this.vc.video;

    const formatTime = (t) => {
      const m = Math.floor(t / 60), s = Math.floor(t % 60), d = Math.floor((t * 10) % 10);
      return `${m}:${s.toString().padStart(2, '0')}.${d}`;
    };

    const analyses = this._lastAnalyses || [];
    const renderTagPills = (a) => {
      if (!a || !a.tags) return '';
      const pills = [];
      for (const [k, v] of Object.entries(a.tags)) {
        if (!v) continue;
        const c = a.confidence?.[k] || 0;
        const confCls = c >= 0.6 ? 'hi' : c >= 0.4 ? 'med' : 'lo';
        const label = ({
          formation: 'Form',
          playType: 'Type',
          hash: 'Dir',
          result: 'Result',
          yardage: 'Yds',
        })[k] || k;
        const title = a.reasons?.[k] ? `${label}: ${v} — ${a.reasons[k]} (${Math.round(c*100)}%)` : `${label}: ${v}`;
        pills.push(`<span class="drr-tag ${confCls}" title="${title.replace(/"/g,'&quot;')}">${label} · ${v}</span>`);
      }
      return pills.length ? `<div class="drr-tags">${pills.join('')}</div>` : '';
    };

    const renderRow = (p) => {
      const row = document.createElement('div');
      row.className = 'detect-review-row' + (p.accepted ? '' : ' rejected');
      row.dataset.idx = p.idx;
      const conf = Math.round((p.confidence || 0) * 100);
      const confClass = conf >= 70 ? 'hi' : conf >= 40 ? 'med' : 'lo';
      const analysis = analyses[p.idx];
      row.innerHTML = `
        <div class="drr-main">
          <div class="drr-head">
            <span class="drr-num">#${p.idx + 1}</span>
            <span class="drr-time">${formatTime(p.start)} → ${formatTime(p.end)}</span>
            <span class="drr-dur">${(p.end - p.start).toFixed(1)}s</span>
            <span class="drr-conf ${confClass}" title="Detection confidence">${conf}%</span>
          </div>
          ${renderTagPills(analysis)}
          <div class="drr-controls">
            <button class="btn-xs" data-act="play">▶ Preview</button>
            <span class="drr-bump">
              Start:
              <button class="btn-xs" data-act="s-">−0.5s</button>
              <button class="btn-xs" data-act="s+">+0.5s</button>
            </span>
            <span class="drr-bump">
              End:
              <button class="btn-xs" data-act="e-">−0.5s</button>
              <button class="btn-xs" data-act="e+">+0.5s</button>
            </span>
          </div>
        </div>
        <div class="drr-side">
          <label class="drr-check">
            <input type="checkbox" ${p.accepted ? 'checked' : ''}>
            <span>Accept</span>
          </label>
        </div>`;

      const bump = (act) => {
        if (act === 's-') p.start = Math.max(0, p.start - 0.5);
        else if (act === 's+') p.start = Math.min(p.end - 0.2, p.start + 0.5);
        else if (act === 'e-') p.end = Math.max(p.start + 0.2, p.end - 0.5);
        else if (act === 'e+') p.end = p.end + 0.5;
        row.querySelector('.drr-time').textContent = `${formatTime(p.start)} → ${formatTime(p.end)}`;
        row.querySelector('.drr-dur').textContent = `${(p.end - p.start).toFixed(1)}s`;
      };

      row.querySelectorAll('[data-act]').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.preventDefault();
          const act = btn.dataset.act;
          if (act === 'play') {
            if (video) {
              video.currentTime = p.start;
              video.play().catch(() => {});
              // Auto-pause at end
              const stopAt = () => {
                if (video.currentTime >= p.end) {
                  video.pause();
                  video.removeEventListener('timeupdate', stopAt);
                }
              };
              video.addEventListener('timeupdate', stopAt);
            }
          } else {
            bump(act);
          }
        });
      });

      row.querySelector('input[type=checkbox]').addEventListener('change', (e) => {
        p.accepted = e.target.checked;
        row.classList.toggle('rejected', !p.accepted);
        updateCount();
      });

      return row;
    };

    const updateCount = () => {
      const acc = plays.filter(p => p.accepted).length;
      count.textContent = `${acc} / ${plays.length} accepted`;
    };

    plays.forEach(p => list.appendChild(renderRow(p)));
    updateCount();

    const close = () => modal.remove();
    modal.querySelector('#detectReviewClose').addEventListener('click', close);
    modal.querySelector('#detectReviewCancel').addEventListener('click', close);
    modal.querySelector('.detect-review-backdrop').addEventListener('click', close);

    modal.querySelector('#detectReviewAcceptAll').addEventListener('click', () => {
      plays.forEach(p => p.accepted = true);
      list.querySelectorAll('.detect-review-row').forEach(r => {
        r.classList.remove('rejected');
        r.querySelector('input[type=checkbox]').checked = true;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewRejectLow').addEventListener('click', () => {
      plays.forEach(p => { if ((p.confidence || 0) < 0.4) p.accepted = false; });
      list.querySelectorAll('.detect-review-row').forEach(r => {
        const idx = parseInt(r.dataset.idx, 10);
        const p = plays[idx];
        r.classList.toggle('rejected', !p.accepted);
        r.querySelector('input[type=checkbox]').checked = p.accepted;
      });
      updateCount();
    });

    modal.querySelector('#detectReviewApply').addEventListener('click', () => {
      // Keep analyses aligned with the accepted plays so _stampAutoTags
      // tags the right ones after applyDetectedPlays creates them.
      const keptIdxs = [];
      const accepted = [];
      plays.forEach(p => {
        if (!p.accepted) return;
        keptIdxs.push(p.idx);
        accepted.push({ start: p.start, end: p.end, peak: p.peak, confidence: p.confidence });
      });
      const before = this.tagger.plays.length;
      const added = this.detector.applyDetectedPlays(accepted);
      // Rebuild _lastAnalyses in the order the tagger appended them
      const fullAnalyses = this._lastAnalyses || [];
      this._lastAnalyses = keptIdxs.map(i => fullAnalyses[i]);
      this._stampAutoTags(before);
      // Restore the full analyses array in case user re-opens the review
      this._lastAnalyses = fullAnalyses;
      const resultCount = document.getElementById('detectResultCount');
      if (resultCount) resultCount.textContent = `${added} play${added !== 1 ? 's' : ''} added · tagged from film`;
      close();
    });
  }

  _bindGameInfo() {
    const fields = ['gameWeek', 'gameTeamName', 'gameOpponent', 'gameDate', 'gameHomeAway', 'gameType', 'gameScoreUs', 'gameScoreThem', 'gameJerseyColor', 'gamePerspective', 'gameDirection'];
    fields.forEach(id => {
      const el = document.getElementById(id);
      if (el) {
        el.addEventListener('change', () => this._saveGameInfo());
        el.addEventListener('input', () => this._saveGameInfo());
      }
    });
    const apiKeyEl = document.getElementById('gameApiKey');
    if (apiKeyEl) {
      const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
      if (savedKey) apiKeyEl.value = savedKey;
      apiKeyEl.addEventListener('change', () => this._saveApiKey());
      apiKeyEl.addEventListener('blur', () => this._saveApiKey());
    }
    const modelEl = document.getElementById('gameAiModel');
    if (modelEl) {
      const savedModel = localStorage.getItem('ffa_claude_model') || '';
      if (savedModel) modelEl.value = savedModel;
      this.vision.model = modelEl.value;
      modelEl.addEventListener('change', () => {
        this.vision.model = modelEl.value;
        localStorage.setItem('ffa_claude_model', modelEl.value);
      });
    }

    // Live "tracked" score: recompute from scoring plays whenever they change,
    // and let the coach copy it into the Final Score with one click.
    const applyBtn = document.getElementById('btnApplyTrackedScore');
    if (applyBtn) {
      applyBtn.addEventListener('click', () => this._applyTrackedScore());
    }
    this.tagger.on('play-created', () => this._updateTrackedScore());
    this.tagger.on('play-updated', () => this._updateTrackedScore());
    this.tagger.on('play-deleted', () => this._updateTrackedScore());
    this._updateTrackedScore();

    // Carry the team identity (name + jersey color) forward from prior games.
    this._applyTeamProfile();
  }

  /** Recompute the running scoreboard from tagged plays and show it. */
  _updateTrackedScore() {
    const el = document.getElementById('trackedScore');
    if (!el || !this.stats) return;
    const sb = this.stats.computeScoreboard();
    el.textContent = `${sb.us} – ${sb.them}`;
    el.classList.toggle('has-score', sb.hasData);
    this._trackedScore = sb;
  }

  /** Copy the tracked score into the editable Final Score fields. */
  _applyTrackedScore() {
    const sb = this._trackedScore || this.stats.computeScoreboard();
    const usEl = document.getElementById('gameScoreUs');
    const themEl = document.getElementById('gameScoreThem');
    if (usEl) usEl.value = sb.us;
    if (themEl) themEl.value = sb.them;
    this._saveGameInfo();
  }

  _saveApiKey() {
    const apiKey = document.getElementById('gameApiKey')?.value || '';
    localStorage.setItem('ffa_claude_api_key', apiKey);
    this.vision.apiKey = apiKey;
    this._updateAnalysisBadge?.();
  }

  _saveGameInfo() {
    // Programmatic form population (loading a game) must not trigger a save —
    // otherwise a loaded game's team name (e.g. the demo's 'GridIron Demo')
    // cascades through _saveTeamProfile and clobbers the coach's real identity.
    // While the Game menu is open, a draft/in-progress edit must not auto-write
    // until Save (see _openGameModal / _confirmGameModal).
    if (this._loadingGameInfo || this._gameModalOpen) return;
    const week = document.getElementById('gameWeek')?.value || '';
    const opponent = document.getElementById('gameOpponent')?.value || '';
    // projectName (file names / report titles) mirrors the game's display name —
    // derive it from the single source (SeasonStore.gameName) rather than
    // re-implementing the week/opponent composition here.
    const projectName = (week.trim() || opponent)
      ? this.storage.seasonStore.gameName({ gameInfo: { week, opponent } })
      : '';
    this.storage.gameInfo = {
      projectName,
      week,
      teamName: document.getElementById('gameTeamName')?.value || '',
      opponent,
      date: document.getElementById('gameDate')?.value || '',
      homeAway: document.getElementById('gameHomeAway')?.value || '',
      gameType: document.getElementById('gameType')?.value || 'game',
      scoreUs: document.getElementById('gameScoreUs')?.value || '',
      scoreThem: document.getElementById('gameScoreThem')?.value || '',
      jerseyColor: document.getElementById('gameJerseyColor')?.value || '',
      perspective: document.getElementById('gamePerspective')?.value || 'offense',
      direction: document.getElementById('gameDirection')?.value || '',
    };
    this.storage._autoSave();
    this._saveTeamProfile();
    this._checkFinishHint();
    this._renderGameSummary();
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
    const nameEl = document.getElementById('gameTeamName');
    const colorEl = document.getElementById('gameJerseyColor');
    let applied = false;
    if (nameEl && !nameEl.value && profile.teamName) { nameEl.value = profile.teamName; applied = true; }
    if (colorEl && !colorEl.value && profile.jerseyColor) { colorEl.value = profile.jerseyColor; applied = true; }
    // Mirror into storage.gameInfo so stats/scoreboard/exports pick up the
    // carried-forward team name without waiting for a manual field edit.
    if (applied) this._saveGameInfo();
  }

  _loadGameInfo(info) {
    if (!info) return;
    this._loadingGameInfo = true;   // suppress save-on-load cascade (see _saveGameInfo)
    const map = {
      gameTeamName: info.teamName,
      gameOpponent: info.opponent,
      gameDate: info.date,
      gameScoreUs: info.scoreUs,
      gameScoreThem: info.scoreThem,
      gameJerseyColor: info.jerseyColor,
      gamePerspective: info.perspective,
      gameDirection: info.direction,
    };
    for (const [id, val] of Object.entries(map)) {
      const el = document.getElementById(id);
      if (el && val) el.value = val;
    }
    // Week + the selects are set explicitly (even when empty) so a value never
    // carries over from the previously loaded game.
    const weekEl = document.getElementById('gameWeek'); if (weekEl) weekEl.value = info.week || '';
    const haEl = document.getElementById('gameHomeAway'); if (haEl) haEl.value = info.homeAway || '';
    const typeEl = document.getElementById('gameType'); if (typeEl) typeEl.value = info.gameType || 'game';
    this._renderGameSummary(info);
    // Loading sets the perspective programmatically (no native change event),
    // so fire one to re-sync the scout UI and the new-play unit default.
    const perspectiveEl = document.getElementById('gamePerspective');
    if (perspectiveEl) perspectiveEl.dispatchEvent(new Event('change'));
    const savedKey = localStorage.getItem('ffa_claude_api_key') || '';
    if (savedKey) {
      const keyEl = document.getElementById('gameApiKey');
      if (keyEl) keyEl.value = savedKey;
      this.vision.apiKey = savedKey;
    }
    const savedModel = localStorage.getItem('ffa_claude_model') || '';
    if (savedModel) {
      const mEl = document.getElementById('gameAiModel');
      if (mEl) mEl.value = savedModel;
      this.vision.model = savedModel;
    }
    this._loadingGameInfo = false;
  }

  _bindReportExport() {
    const btn = document.getElementById('btnExportReport');
    if (btn) {
      btn.addEventListener('click', () => this.storage.exportHtmlReport(this.stats));
    }
  }

  _bindShortcuts() {
    const btn = document.getElementById('btnShortcuts');
    this.toggleShortcuts = (show) => {
      if (show === false) return this.shortcutsScreen.close('cancel');
      if (show === true) return this.shortcutsScreen.open(btn);
      return this.shortcutsScreen.toggle(btn);
    };
    btn?.addEventListener('click', () => this.toggleShortcuts());
  }

  _bindScoutMode() {
    const perspectiveEl = document.getElementById('gamePerspective');
    const scoutSection = document.getElementById('scoutSection');
    const btnScoutReport = document.getElementById('btnScoutReport');
    if (!perspectiveEl) return;
    const unitFromPerspective = (p) => {
      if (p === 'defense') return 'defense';
      if (p === 'special') return 'special';
      return 'offense'; // offense or scout (charts both, default offense layout)
    };
    const tagForm = document.getElementById('tagForm');
    const toggleScoutUI = () => {
      const isScout = perspectiveEl.value === 'scout';
      if (scoutSection) scoutSection.classList.toggle('hidden', !isScout);
      if (tagForm) tagForm.classList.toggle('is-scout', isScout);
      this.tagger.defaultUnit = unitFromPerspective(perspectiveEl.value);
    };
    perspectiveEl.addEventListener('change', toggleScoutUI);
    toggleScoutUI();
    if (btnScoutReport) {
      btnScoutReport.addEventListener('click', () => this.stats.renderScoutReport());
    }
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

    // Auto down & distance toggle
    const autoDD = document.getElementById('autoDDToggle');
    if (autoDD) {
      autoDD.checked = this.tagger.autoDD;
      autoDD.addEventListener('change', () => {
        this.tagger.autoDD = autoDD.checked;
        try { localStorage.setItem('ffa_auto_dd', autoDD.checked ? '1' : '0'); } catch (e) {}
      });
    }

    // Carry formation/personnel/front/coverage to the next play (opt-in).
    const carryScheme = document.getElementById('carrySchemeToggle');
    if (carryScheme) {
      carryScheme.checked = this.tagger.carryScheme;
      carryScheme.addEventListener('change', () => {
        this.tagger.carryScheme = carryScheme.checked;
        try { localStorage.setItem('ffa_carry_scheme', carryScheme.checked ? '1' : '0'); } catch (e) {}
      });
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
  /** Render the autosave state on the top-bar Save button: "● Saving…" while
   *  a debounced write is armed, settling to "✓ Saved". The button stays the
   *  explicit-save action (Ctrl+S); this just makes persistence VISIBLE. */
  _renderSaveState(state) {
    this.breakdownWorkspace?.setSaveState(state);
    const btn = document.getElementById('btnSave');
    if (!btn) return;
    const label = btn.querySelector('.btn-label');
    btn.classList.toggle('save-pending', state === 'pending');
    btn.classList.toggle('save-ok', state === 'saved');
    if (label) label.textContent = state === 'pending' ? 'Saving…' : 'Saved';
    if (!this._saveTitleSet) {
      btn.title = 'Everything saves automatically. Click to save now + create a restore point (Ctrl+S).';
      this._saveTitleSet = true;
    }
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
      const yd = document.getElementById('tagYardage');
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

  _drawMotionGraph(canvas, motionData, detectedPlays, threshold) {
    if (!motionData.length) return;

    const rect = canvas.parentElement.getBoundingClientRect();
    const w = rect.width;
    const h = 60;
    canvas.width = w * devicePixelRatio;
    canvas.height = h * devicePixelRatio;
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';

    const ctx = canvas.getContext('2d');
    ctx.scale(devicePixelRatio, devicePixelRatio);

    // Background
    ctx.fillStyle = '#2c323c';
    ctx.fillRect(0, 0, w, h);

    // Find max motion for scaling
    let maxMotion = 0;
    for (const d of motionData) {
      if (d.motion > maxMotion) maxMotion = d.motion;
    }
    if (maxMotion === 0) return;

    const duration = motionData[motionData.length - 1].time;

    // Draw detected play regions
    ctx.fillStyle = 'rgba(233, 69, 96, 0.2)';
    for (const p of detectedPlays) {
      const x1 = (p.start / duration) * w;
      const x2 = (p.end / duration) * w;
      ctx.fillRect(x1, 0, x2 - x1, h);
    }

    // Draw threshold line
    const threshY = h - (threshold) * (h - 4) - 2;
    ctx.strokeStyle = 'rgba(255, 170, 0, 0.5)';
    ctx.setLineDash([4, 4]);
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, threshY);
    ctx.lineTo(w, threshY);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw motion curve
    ctx.strokeStyle = '#44ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < motionData.length; i++) {
      const x = (motionData[i].time / duration) * w;
      const y = h - (motionData[i].motion / maxMotion) * (h - 4) - 2;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Boot the app
document.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
