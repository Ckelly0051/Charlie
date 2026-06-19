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
import { PlayDiagram } from './play-diagram.js';
import { MultiAngle } from './multi-angle.js';
import { Updater } from './updater.js';
import { SeasonLibrary } from './season-library.js';
import { PlayGrid } from './play-grid.js';

/**
 * Single source of truth for the displayed app version. Keep in lockstep with
 * src-tauri/{Cargo.toml,tauri.conf.json,Cargo.lock} on every release (the web
 * bundle can't read those at runtime). On desktop, the live Tauri config
 * version overrides this at runtime via Updater._currentVersion().
 */
const APP_VERSION = '1.9.7';

class App {
  constructor() {
    // Initialize components
    this.vc = new VideoController();
    this.canvas = new CanvasOverlay(this.vc);
    this.tagger = new PlayTagger(this.vc);
    this.roster = new RosterManager(this.tagger);
    this.filter = new PlayFilter(this.tagger);
    this.customFields = new CustomFieldsManager(this.tagger);
    this.playDiagram = new PlayDiagram(this.tagger);
    this.multiAngle = new MultiAngle(this.vc);
    // Re-render custom-field inputs + diagram preview on every form load.
    this.tagger.onLoadForm = (play) => {
      this.customFields.loadValues(play);
      this.playDiagram.renderPreview();
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
    this.history = new HistoryManager(this.tagger);
    this.versions = new VersionManager(this.storage, this.tagger);
    this.ocr = new ScoreboardOCR(this.vc, this.tagger);
    this.suggestions = new SuggestionEngine(this.tagger);
    this.cutup = new CutupExporter(this.vc, this.tagger, this.filter, this.playlist);
    this.cutupPlayer = new CutupPlayer(this.vc, this.tagger);
    this.playGrid = new PlayGrid(this.tagger, this.vc, this.cutupPlayer);
    this.season = new SeasonManager(this.stats);
    this.library = new SeasonLibrary();
    this.callSheet = new CallSheetBuilder(this.tagger);
    this.uiPolish = new UIPolish();
    this.wizard = new Wizard({ videoController: this.vc, tagger: this.tagger, stats: this.stats, history: this.history });

    // Give storage references
    this.storage.playlist = this.playlist;
    this.storage.filter = this.filter;
    this.storage.versions = this.versions;

    // Wire cross-module events
    this._wireEvents();

    // Wire game info form
    this._bindGameInfo();

    // Wire report export
    this._bindReportExport();

    // Wire play import
    this._bindPlayImport();

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

    // Enable auto-save
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
      this._bindSeasonChip();
      this._bindGamesPanel();
      await this.library.open();
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

  /** Wire the top-bar breadcrumb → Team ▸ Season ▸ Game. */
  _bindSeasonChip() {
    const bc = document.getElementById('breadcrumb');
    const bcGame = document.getElementById('bcGame');
    const dropdown = document.getElementById('gameDropdown');
    if (!bc || !dropdown) return;

    // Breadcrumb: Team (home) ▸ Season (schedule) ▸ Game (quick switch)
    document.getElementById('bcHome')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeGameDropdown();
      this.library.open();             // team home (seasons list)
    });
    document.getElementById('bcSeason')?.addEventListener('click', (e) => {
      e.stopPropagation();
      this._closeGameDropdown();
      this.library.openSchedule();     // this season's schedule (the spine)
    });
    bcGame?.addEventListener('click', (e) => {
      e.stopPropagation();
      if (dropdown.classList.contains('hidden')) this._openGameDropdown();
      else this._closeGameDropdown();
    });

    document.getElementById('btnDropdownNewGame')?.addEventListener('click', () => {
      this._closeGameDropdown();
      this.storage.newGame();
      this._updateSeasonChip();
      this.season._renderAll?.();
    });
    document.getElementById('btnDropdownSwitchSeason')?.addEventListener('click', () => {
      this._closeGameDropdown();
      this.library.open();
    });

    document.addEventListener('click', (e) => {
      const bcGameEl = document.getElementById('bcGame');
      if (!dropdown.classList.contains('hidden') && !dropdown.contains(e.target) && !(bcGameEl && bcGameEl.contains(e.target))) {
        this._closeGameDropdown();
      }
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && !dropdown.classList.contains('hidden')) {
        // The dropdown owns Escape while open — don't also close the drawer /
        // deselect the drawing tool from the other document Esc handlers.
        e.stopImmediatePropagation();
        this._closeGameDropdown();
      }
    });

    this._updateSeasonChip();
  }

  _openGameDropdown() {
    const dropdown = document.getElementById('gameDropdown');
    if (!dropdown) return;
    this._renderGameDropdown();
    dropdown.classList.remove('hidden');
  }

  _closeGameDropdown() {
    document.getElementById('gameDropdown')?.classList.add('hidden');
  }

  _renderGameDropdown() {
    const head = document.getElementById('gameDropdownHead');
    const list = document.getElementById('gameDropdownList');
    const store = this.storage?.seasonStore;
    if (!head || !list || !store?.hasCurrent()) return;

    head.textContent = store.data.seasonName || 'Season';

    this.storage.commitActive();
    const games = store.gamesChrono();
    const activeId = store.data.activeGameId;

    if (!games.length) {
      list.innerHTML = '<div style="padding:16px;text-align:center;color:rgba(255,255,255,.4)">No games yet</div>';
      return;
    }

    list.innerHTML = '';
    games.forEach((g, idx) => {
      const r = this._gameRowInfo(g, idx, store, activeId);
      // Parse YYYY-MM-DD as LOCAL (a bare ISO date parses as UTC midnight and
      // shows a day early for US coaches).
      const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(g.gameInfo?.date || '');
      const shortDate = dm ? new Date(+dm[1], +dm[2] - 1, +dm[3]).toLocaleDateString([], { month: 'short', day: 'numeric' })
        : (g.gameInfo?.date ? new Date(g.gameInfo.date).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '');

      const row = document.createElement('div');
      row.className = 'gd-row' + (r.isActive ? ' is-active' : '');

      let dotCls = 'dot-idle';
      if (r.isActive) dotCls = 'dot-active';
      else if (r.isFinal) dotCls = 'dot-final';

      let actions = '';
      if (r.isActive && !r.isFinal) actions = '<button class="gd-finish-btn" data-action="finish">Finish Game</button>';

      row.innerHTML = `
        <div class="gd-dot ${dotCls}"></div>
        <div class="gd-info" data-action="switch">
          <div class="gd-name">${this._esc(r.name)}</div>
          <div class="gd-meta">${r.plays} play${r.plays !== 1 ? 's' : ''}${shortDate ? ' · ' + shortDate : ''}</div>
        </div>
        <div class="gd-badges">${this._gameBadgesHtml(r)}</div>
        <div class="gd-actions">${actions}</div>`;

      row.querySelector('[data-action=switch]')?.addEventListener('click', () => {
        if (!r.isActive) {
          this.storage.switchToGame(g.id);
          this._updateSeasonChip();
          this.season._renderAll?.();
        }
        // Clicking the game you're already in = dismiss and return to it.
        this._closeGameDropdown();
      });

      row.querySelector('[data-action=finish]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._closeGameDropdown();
        this._finishGame();
      });

      list.appendChild(row);
    });
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
    this._updateSeasonChip();
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
      modal.querySelector('#finishCancel').addEventListener('click', () => close(null));
      modal.querySelector('#finishConfirm').addEventListener('click', confirm);

      setTimeout(() => {
        (document.getElementById('finishScoreUs') || modal.querySelector('#finishConfirm'))?.focus();
      }, 50);
    });
  }

  /** Refresh the breadcrumb (Team ▸ Season ▸ Game). */
  _updateSeasonChip() {
    const bc = document.getElementById('breadcrumb');
    const teamText = document.getElementById('bcTeamText');
    const seasonText = document.getElementById('bcSeasonText');
    const gameText = document.getElementById('bcGameText');
    const gameSeg = document.getElementById('bcGame');
    const gameSep = document.getElementById('bcGameSep');
    if (!bc) return;

    let profile = {};
    try { profile = JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}; } catch (e) {}
    if (teamText) teamText.textContent = profile.teamName || 'Team';

    const store = this.storage && this.storage.seasonStore;
    if (!store || !store.hasCurrent()) { bc.hidden = true; return; }
    const d = store.data;
    const game = store.activeGame && store.activeGame();
    const gameName = game ? store.gameName(game, store.activeIndex()) : '';
    if (seasonText) seasonText.textContent = d.seasonName || 'Season';
    const showGame = !!gameName;
    if (gameText) gameText.textContent = gameName;
    if (gameSeg) gameSeg.style.display = showGame ? '' : 'none';
    if (gameSep) gameSep.style.display = showGame ? '' : 'none';
    bc.hidden = false;
  }

  // ---- Games panel (settings drawer) ----------------------------------------

  _bindGamesPanel() {
    document.getElementById('btnPanelNewGame')?.addEventListener('click', () => {
      this.storage.newGame();
      this._updateSeasonChip();
      this._renderGamesPanel();
      this.season._renderAll?.();
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
        this.storage.switchToGame(g.id);
        this._updateSeasonChip();
        this._renderGamesPanel();
        this.season._renderAll?.();
      });

      card.querySelector('[data-action=finish]')?.addEventListener('click', (e) => {
        e.stopPropagation();
        this._finishGame();
      });

      card.querySelector('[data-action=delete]')?.addEventListener('click', async (e) => {
        e.stopPropagation();
        const ok = await this.tagger._confirmDialog(`Remove "Game ${idx + 1}: ${r.name}" from the season? This cannot be undone.`, 'Remove');
        if (!ok) return;
        this.storage.removeGame(g.id);
        this._updateSeasonChip();
        this._renderGamesPanel();
        this.season._renderAll?.();
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

  _showFilmImportProgress(done, total) {
    if (done >= total) {
      this.updater._toast('Film saved to library');
      return;
    }
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
    ['gameProjectName', 'gameOpponent', 'gameDate', 'gameScoreUs', 'gameScoreThem',
     'gameDirection'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    // Team identity (team name, jersey color) carries forward across games, so
    // it's intentionally left in place here.
    this.storage.gameInfo = {
      ...this.storage.gameInfo,
      projectName: '', opponent: '', date: '', scoreUs: '', scoreThem: '', direction: '',
    };
    this._trackedScore = null;
  }

  _wireEvents() {
    // Re-render canvas annotations when video time changes
    this.vc.on('time-update', () => {
      this.canvas.render();
    });

    // Handle file selection from top bar (single or multi)
    this.vc.on('files-selected', ({ files }) => {
      if (files.length === 1 && !this.playlist.hasClips) {
        this.vc.loadFile(files[0]);
      } else {
        this.playlist.addFiles(files);
      }
      this.storage.importFilm(files);
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
      const shortcutsModal = document.getElementById('shortcutsModal');
      const shortcutsOpen = shortcutsModal && !shortcutsModal.classList.contains('hidden');
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

    // Line width slider
    const slider = document.getElementById('lineWidthSlider');
    slider.addEventListener('input', () => {
      this.canvas.lineWidth = parseInt(slider.value);
    });

    // Clear annotations (undo/redo now live as a single pair in the top bar)
    document.getElementById('btnClearAnnotations').addEventListener('click', () => {
      if (confirm('Clear all annotations?')) {
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

    // Start scan
    btnAutoDetect.addEventListener('click', async () => {
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
          console.log('[FFA] starting scan…');
          await this.detector.scan();
          console.log('[FFA] scan resolved');

          const plays = this.detector.detectedPlays;
          console.log(`[FFA] ${plays.length} play(s) detected, ${this.detector.motionData.length} motion samples`);

          // Build team context from Game Info (set once, applies to all plays)
          const teamCtx = this._getTeamContext();
          console.log('[FFA] team context:', JSON.stringify(teamCtx));

          // Seed analyses from the in-browser heuristic analyzer as baseline.
          this._lastAnalyses = this.clipAnalyzer.analyzePlays(plays, this.detector.motionData, teamCtx);
          console.log('[FFA] heuristic analysis:', JSON.stringify(this._lastAnalyses.map(a => a?.tags)));

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
              console.log(`[FFA] sending ${plays.length} play(s) to Claude Vision API`);
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
              console.log(`[FFA] Claude Vision tagged ${visionResults.length} plays in ${(visionMs / 1000).toFixed(1)}s`);
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
            console.log('[FFA] no Claude API key set — enter one in Game Info to enable AI tagging');
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

    btnCancelScan.addEventListener('click', () => {
      this.detector.cancelScan();
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
        badge.textContent = '🟢 AI Server';
        badge.classList.add('online');
        badge.classList.remove('offline');
        const caps = this.backend.getCapabilities();
        badge.title = `Local CV server online\n${caps.join('\n')}\nClick to re-probe`;
      } else {
        badge.textContent = '⚪ Heuristics';
        badge.classList.add('offline');
        badge.classList.remove('online');
        badge.title = 'Using in-browser heuristics. Optional local CV server is off.\nRun `cd server && ./start.sh`, then click to connect.';
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
    console.log(`[FFA] stamped ${stamped} tag fields across ${Math.min(newPlays.length, analyses.length)} plays`);
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
    const fields = ['gameProjectName', 'gameTeamName', 'gameOpponent', 'gameDate', 'gameScoreUs', 'gameScoreThem', 'gameJerseyColor', 'gamePerspective', 'gameDirection'];
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
    if (this._loadingGameInfo) return;
    this.storage.gameInfo = {
      projectName: document.getElementById('gameProjectName')?.value || '',
      teamName: document.getElementById('gameTeamName')?.value || '',
      opponent: document.getElementById('gameOpponent')?.value || '',
      date: document.getElementById('gameDate')?.value || '',
      scoreUs: document.getElementById('gameScoreUs')?.value || '',
      scoreThem: document.getElementById('gameScoreThem')?.value || '',
      jerseyColor: document.getElementById('gameJerseyColor')?.value || '',
      perspective: document.getElementById('gamePerspective')?.value || 'offense',
      direction: document.getElementById('gameDirection')?.value || '',
    };
    this.storage._autoSave();
    this._saveTeamProfile();
    this._checkFinishHint();
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
      this._updateSeasonChip();
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
      gameProjectName: info.projectName,
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
    const modal = document.getElementById('shortcutsModal');
    const btn = document.getElementById('btnShortcuts');
    if (!modal) return;
    this.toggleShortcuts = (show) => {
      const hidden = modal.classList.contains('hidden');
      const willShow = show != null ? show : hidden;
      modal.classList.toggle('hidden', !willShow);
    };
    btn?.addEventListener('click', () => this.toggleShortcuts());
    modal.querySelector('#shortcutsClose')?.addEventListener('click', () => this.toggleShortcuts(false));
    modal.querySelector('.shortcuts-backdrop')?.addEventListener('click', () => this.toggleShortcuts(false));
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

    btnPrev?.addEventListener('click', () => {
      this.tagger.prevPlay();
      this._autoPlayCurrent();
    });
    btnNext?.addEventListener('click', () => this._advancePlay());
    // Skip = move on WITHOUT carrying this play's situation forward (it was
    // previously identical to Save & Next — a fake choice).
    btnSkip?.addEventListener('click', () => this._advancePlay({ skip: true }));

    // Surface tagger feedback (e.g. "Mark the start first") through the
    // shared toast. Lazy lambda — history may not exist yet at bind time.
    this.tagger.toast = (msg) => this.history?._toast(msg);

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
      v.play().catch(() => {});
    }
  }

  /**
   * Save & advance. Commits any focused field, then moves to the next play —
   * which in folder/multi-clip mode also switches to the next video. When we're
   * past the last play but more video clips remain, jump to the next clip so a
   * folder upload keeps flowing video-to-video. Shows a brief toast at the end.
   */
  _advancePlay(opts = {}) {
    // Commit a value still being edited (yardage/notes) before advancing,
    // then blur so the next keystrokes hit the shortcuts, not the input.
    const el = document.activeElement;
    if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.blur();
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
    const tagged = this.tagger.plays.filter(p => p.tags.playType && p.tags.result).length;
    label.textContent = `${tagged} / ${total} tagged`;
    fill.style.width = total > 0 ? Math.round((tagged / total) * 100) + '%' : '0%';
  }

  _bindPlayImport() {
    const btn = document.getElementById('btnImportPlays');
    const modal = document.getElementById('playImportModal');
    if (!btn || !modal) return;

    const fileInput = modal.querySelector('#playImportFile');
    const textArea = modal.querySelector('#playImportText');
    const filename = modal.querySelector('#playImportFilename');
    const parseBtn = modal.querySelector('#playImportParse');
    const applyBtn = modal.querySelector('#playImportApply');
    const cancelBtn = modal.querySelector('#playImportCancel');
    const closeBtn = modal.querySelector('#playImportClose');
    const backdrop = modal.querySelector('.play-import-backdrop');
    const mappingDiv = modal.querySelector('#playImportMapping');
    const mapGrid = modal.querySelector('#playImportMapGrid');
    const previewDiv = modal.querySelector('#playImportPreview');
    const previewTable = modal.querySelector('#playImportPreviewTable');
    const countSpan = modal.querySelector('#playImportCount');

    let lastParsed = null;

    const open = () => { modal.classList.remove('hidden'); lastParsed = null; applyBtn.classList.add('hidden'); mappingDiv.classList.add('hidden'); previewDiv.classList.add('hidden'); };
    const close = () => { modal.classList.add('hidden'); textArea.value = ''; filename.textContent = 'No file chosen'; lastParsed = null; };

    btn.addEventListener('click', open);
    closeBtn.addEventListener('click', close);
    cancelBtn.addEventListener('click', close);
    backdrop.addEventListener('click', close);

    fileInput.addEventListener('change', (e) => {
      const file = e.target.files[0];
      if (!file) return;
      filename.textContent = file.name;
      const reader = new FileReader();
      reader.onload = (ev) => { textArea.value = ev.target.result; };
      reader.readAsText(file);
    });

    const ourFields = ['playType','runPass','result','yardage','down','distance','formation','personnel',
      'motion','playDir','hash','defFront','coverage','blitz','quarter','yardLine','fieldSide','driveNumber',
      'ballCarrier','passer','receiver','tackler','notes'];

    parseBtn.addEventListener('click', () => {
      const text = textArea.value;
      if (!text.trim()) { alert('Paste or upload CSV data first.'); return; }
      const parsed = this.storage.importPlaysFromText(text);
      if (parsed.error) { alert(parsed.error); return; }
      lastParsed = parsed;

      // Show column mapping
      mapGrid.innerHTML = '';
      parsed.headers.forEach((h, i) => {
        const row = document.createElement('div');
        row.className = 'play-import-map-row';
        const mapped = parsed.colMap[i] || '';
        row.innerHTML = `<span class="play-import-col-name">${h}</span>
          <select class="play-import-col-select" data-col="${i}">
            <option value="">(skip)</option>
            ${ourFields.map(f => `<option value="${f}" ${f === mapped ? 'selected' : ''}>${f}</option>`).join('')}
          </select>`;
        row.querySelector('select').addEventListener('change', (e) => {
          if (e.target.value) parsed.colMap[i] = e.target.value;
          else delete parsed.colMap[i];
          renderPreview();
        });
        mapGrid.appendChild(row);
      });
      mappingDiv.classList.remove('hidden');
      renderPreview();
    });

    const renderPreview = () => {
      if (!lastParsed) return;
      const preview = lastParsed.lines.slice(0, 5);
      const mapped = Object.values(lastParsed.colMap);
      let html = '<table class="stats-table stats-table-full"><thead><tr>';
      mapped.forEach(f => { html += `<th>${f}</th>`; });
      html += '</tr></thead><tbody>';
      preview.forEach(cells => {
        html += '<tr>';
        Object.entries(lastParsed.colMap).forEach(([idx]) => {
          html += `<td>${cells[parseInt(idx)] || ''}</td>`;
        });
        html += '</tr>';
      });
      html += '</tbody></table>';
      previewTable.innerHTML = html;
      countSpan.textContent = lastParsed.lines.filter(cells => !cells.every(c => !c)).length;
      previewDiv.classList.remove('hidden');
      applyBtn.classList.remove('hidden');
    };

    applyBtn.addEventListener('click', () => {
      if (!lastParsed) return;
      const count = this.storage.applyPlayImport(lastParsed);
      alert(`Imported ${count} play${count !== 1 ? 's' : ''}.`);
      close();
    });
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
