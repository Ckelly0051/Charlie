/** Stable shell routes for the redesign. These descriptors validate context;
 * WorkspaceShell owns the corresponding UI adapters. */
const WORKSPACE_ROUTES = Object.freeze([
  Object.freeze({ id: 'home', name: 'Home', target: 'team-home', requires: null }),
  Object.freeze({ id: 'breakdown', name: 'Break Down', target: 'classic-workspace', requires: 'game' }),
  Object.freeze({ id: 'study', name: 'Study', target: 'study-workspace', requires: 'season' }),
  // Reports is a distinct job from Study. Study is "ask a question" (pick a
  // dimension, filter, compare, watch the film). Reports is "show me
  // everything" — the full team picture. That job never had a redesigned home,
  // so it fell through to the original dashboard and made the whole redesign
  // read as unfinished. It hosts the canonical StatsEngine render output; no
  // metric is reimplemented here (redesign plan §4 parity contract).
  Object.freeze({ id: 'reports', name: 'Reports', target: 'reports-workspace', requires: 'season' }),
  Object.freeze({ id: 'plan', name: 'Plan', target: 'plan-workspace', requires: 'season' }),
]);

/**
 * WorkspaceContext - pure navigation/context interface for Home, Break Down,
 * Study, and Plan, plus an async film-health view model over StorageBackend.
 */
export class WorkspaceContext {
  /** The one durable key for the Home parent context. It replaces
   *  `giq_home_workspace`, which stored only the mode and left ownership to be
   *  re-guessed from `lastOpened` on every switch. */
  static PARENT_KEY = 'giq_home_parent';

  constructor(app) {
    if (!app || !app.storage) throw new TypeError('WorkspaceContext requires App storage');
    this.app = app;
    this._route = 'home';
    this._filmOperations = new Map();
    // THE ONE OWNER of the Home parent context. `_programSeasonId` is the
    // program season that owns this workspace; `_workspaceMode` is which of its
    // two views is showing. They are deliberately separate from "which season
    // document is currently open in the store": entering Opponent Scout changes
    // the view without closing the parent, and opening a scout changes the open
    // document without changing the parent.
    this._programSeasonId = '';
    this._workspaceMode = 'program';
    this._restoreParent();
  }

  listRoutes() { return WORKSPACE_ROUTES.slice(); }
  currentRoute() { return this._route; }

  _store() { return this.app.storage?.seasonStore || null; }

  // ---- Home parent context (the single ownership seam) ---------------------

  /** The program season that owns the current Home workspace. Never inferred
   *  from `lastOpened`, team/year/level, or which document happens to be open. */
  programSeasonId() { return this._programSeasonId; }
  workspaceMode() { return this._workspaceMode; }

  /** Adopt a program season as the parent context. Called when a program season
   *  is opened, and when a scout is opened (with the scout's own stored
   *  `programSeasonId`). Returns the id actually held. */
  setParentSeason(id) {
    const next = String(id || '');
    if (next !== this._programSeasonId) {
      this._programSeasonId = next;
      this._persistParent();
    }
    return this._programSeasonId;
  }

  /** Drop the parent context entirely. Used when the active TEAM changes (the
   *  prior team's season cannot own the new team's workspace) and when the open
   *  scout names no parent at all. */
  clearParent() {
    if (this._programSeasonId === '' && this._workspaceMode === 'program') return '';
    this._programSeasonId = '';
    this._workspaceMode = 'program';
    this._persistParent();
    return '';
  }

  /**
   * A held parent is only usable while it is still a real program season of the
   * APPLICABLE team collection. Persisted context outlives the thing it points
   * at: a team switch, a deleted season, or an imported season body carrying a
   * foreign `programSeasonId` all leave a parent id that resolves to nothing —
   * or, worse, to a scout. An invalid parent is dropped, which puts any scout
   * that named it into the unassigned workflow instead of a dangling context.
   */
  validateParent(seasons) {
    if (!this._programSeasonId) return '';
    if (!WorkspaceContext.isValidParent(seasons, this._programSeasonId)) return this.clearParent();
    return this._programSeasonId;
  }

  /**
   * A valid scout parent is a REAL PROGRAM SEASON. Not a scout, not the sample
   * season, not a blank id, and not a record that does not exist.
   *
   * The demo exclusion is not cosmetic. The sample season is disposable and
   * regenerable, while valid-parent reassignment is deferred and a parent that
   * owns scouts cannot be deleted — so adopting it as a parent could trap real
   * opponent film under a season built to be thrown away, or block the coach
   * from removing the sample at all. The assignment UI already excluded demos;
   * this makes every other path agree.
   */
  static isProgramSeasonRecord(record) {
    if (!record) return false;
    if (record.kind === 'scout' || record.kind === 'demo') return false;
    return !record.isDemo;
  }

  /** True only when `id` names a record in `seasons` that
   *  `isProgramSeasonRecord` accepts. A missing id is dangling; a scout can
   *  never be another scout's parent; a demo is disposable. */
  static isValidParent(seasons, id) {
    const wanted = String(id || '');
    if (!wanted) return false;
    return WorkspaceContext.isProgramSeasonRecord((seasons || []).find(season => String(season?.id) === wanted));
  }

  setWorkspaceMode(mode) {
    const next = mode === 'scout' ? 'scout' : 'program';
    if (next !== this._workspaceMode) {
      this._workspaceMode = next;
      this._persistParent();
    }
    return this._workspaceMode;
  }

  /** Adopt the parent implied by a season record that has just been opened: a
   *  program season IS its own parent; a scout names its parent explicitly. A
   *  scout with no stored parent CLEARS the parent rather than guessing one or
   *  keeping the last one — an unassigned scout is surfaced, never attached. */
  adoptOpenedSeason(data) {
    if (!data) return this._programSeasonId;
    const id = String(data.id || '');
    // A scout can only be open in the Opponent Scout view, so the mode is
    // DERIVED here rather than stored -- there is no ambiguity to record.
    if (data.kind === 'scout') {
      const parent = String(data.programSeasonId || '');
      // An UNASSIGNED scout CLEARS the parent rather than inheriting whatever was
      // held before it. Keeping the previous parent let an unrelated program
      // season stand in as this scout's owner, which then answered "return to Our
      // Program" with a season the scout has no relationship to.
      if (parent) this.setParentSeason(parent);
      else if (this._programSeasonId) { this._programSeasonId = ''; this._persistParent(); }
      this.setWorkspaceMode('scout');
      return this._programSeasonId;
    }
    if (!id) return this._programSeasonId;
    // Opening the SAMPLE season is a request for Our Program, but the sample can
    // never become the parent context: a scout stamped with it would be trapped
    // under a disposable season. The parent is cleared instead, which surfaces
    // any scout that named it as unassigned rather than attaching it elsewhere.
    if (!WorkspaceContext.isProgramSeasonRecord(data)) {
      this._programSeasonId = '';
      this.setWorkspaceMode('program');
      this._persistParent();
      return this._programSeasonId;
    }
    // DELIBERATELY opening a program season is a request for Our Program -- a
    // rail row, the season picker, the library. The mode follows.
    this.setParentSeason(id);
    this.setWorkspaceMode('program');
    return this._programSeasonId;
  }

  /**
   * PASSIVE re-read of the open document (a re-render, not a navigation).
   *
   * It may only adopt the parent, never the mode of a program season: a program
   * season is legitimately open in EITHER view — Our Program, or its own scout
   * library while it stays open as the parent. Forcing the mode here is what
   * silently undid a switch the coach had just made, because `load()` runs on
   * every pass. A scout still pins the mode, because a scout cannot be open in
   * Our Program at all.
   */
  syncParentFromOpen(data) {
    if (!data) return this._programSeasonId;
    if (data.kind === 'scout') {
      const parent = String(data.programSeasonId || '');
      // An UNASSIGNED scout CLEARS the parent rather than inheriting whatever was
      // held before it. Keeping the previous parent let an unrelated program
      // season stand in as this scout's owner, which then answered "return to Our
      // Program" with a season the scout has no relationship to.
      if (parent) this.setParentSeason(parent);
      else if (this._programSeasonId) { this._programSeasonId = ''; this._persistParent(); }
      this.setWorkspaceMode('scout');
      return this._programSeasonId;
    }
    const id = String(data.id || '');
    // Same rule on the passive path: a sample season never becomes the parent.
    if (!WorkspaceContext.isProgramSeasonRecord(data)) {
      if (this._programSeasonId) { this._programSeasonId = ''; this._persistParent(); }
      return this._programSeasonId;
    }
    if (id) this.setParentSeason(id);
    return this._programSeasonId;
  }

  _persistParent() {
    try {
      localStorage.setItem(WorkspaceContext.PARENT_KEY,
        JSON.stringify({ programSeasonId: this._programSeasonId, mode: this._workspaceMode }));
    } catch (e) {}
  }

  _restoreParent() {
    try {
      const raw = JSON.parse(localStorage.getItem(WorkspaceContext.PARENT_KEY) || 'null');
      if (raw && typeof raw === 'object') {
        this._programSeasonId = String(raw.programSeasonId || '');
        this._workspaceMode = raw.mode === 'scout' ? 'scout' : 'program';
        return;
      }
    } catch (e) {}
    // One-time carry from the mode-only key this replaces. The mode is all it
    // ever held, so no parent can be recovered from it — and none is invented.
    try { this._workspaceMode = localStorage.getItem('giq_home_workspace') === 'scout' ? 'scout' : 'program'; }
    catch (e) {}
  }

  /**
   * THE COMPATIBILITY BOUNDARY for a scout record written before
   * `programSeasonId` existed.
   *
   * Exactly one program season sharing the scout's teamId, year and level is an
   * unambiguous parent and may be adopted. Zero or several is NOT resolvable,
   * and guessing is forbidden — the scout keeps its data and is reported as
   * needing assignment. `lastOpened` is never consulted: it orders scouts
   * inside an already-correct parent and can never establish ownership.
   *
   * Pure: reads metas, writes nothing.
   * @returns {{ status: 'explicit'|'inferred'|'unassigned', programSeasonId: string, candidates: string[] }}
   */
  static resolveScoutParent(scout, seasons) {
    const explicit = String(scout?.programSeasonId || '');
    if (explicit) {
      // An explicit id is authoritative ONLY while it resolves to a real program
      // season of this collection. A deleted parent, or a body imported from
      // another machine carrying a foreign id, otherwise left the scout filed
      // under a season that does not exist -- present in storage and invisible in
      // every parent-scoped list. It becomes UNASSIGNED instead, which is the
      // visible, recoverable state. The stored id is reported, never rewritten.
      if (WorkspaceContext.isValidParent(seasons, explicit)) {
        return { status: 'explicit', programSeasonId: explicit, candidates: [explicit] };
      }
      return { status: 'unassigned', programSeasonId: '', candidates: [], danglingParentId: explicit };
    }
    const key = value => String(value ?? '').trim().toLowerCase();
    // Legacy inference offers REAL program seasons only -- the sample season is
    // never a candidate, so it can never become the unique match.
    const candidates = (seasons || []).filter(season => WorkspaceContext.isProgramSeasonRecord(season)
      && key(season.teamId) === key(scout?.teamId)
      && key(season.year) === key(scout?.year)
      && key(season.level) === key(scout?.level));
    if (candidates.length === 1) {
      return { status: 'inferred', programSeasonId: String(candidates[0].id), candidates: [String(candidates[0].id)] };
    }
    return { status: 'unassigned', programSeasonId: '', candidates: candidates.map(season => String(season.id)) };
  }

  /** The scouts belonging to one program season. Parent-scoped by the durable
   *  relationship only; `lastOpened` may ORDER them and nothing more. */
  static scoutsForParent(seasons, programSeasonId) {
    const parent = String(programSeasonId || '');
    if (!parent) return [];
    return (seasons || [])
      .filter(season => season?.kind === 'scout'
        && WorkspaceContext.resolveScoutParent(season, seasons).programSeasonId === parent)
      .sort((a, b) => String(b.lastOpened || '').localeCompare(String(a.lastOpened || '')));
  }

  snapshot() {
    const store = this._store();
    const data = store?.data || null;
    const game = data && store?.activeGame ? store.activeGame() : null;
    const profile = data?.teamProfile || {};
    let teamId = data?.teamId || '';
    if (!teamId) {
      try { teamId = this.app.teamRegistry?.activeTeamId?.() || ''; } catch (e) {}
    }
    let ownerName = '';
    try { ownerName = this.app.teamRegistry?.teams?.().find(team => String(team.id) === String(teamId))?.teamName || ''; } catch (e) {}
    const teamName = ownerName || profile.teamName || data?.team || '';
    const games = data?.games || [];
    const seasonId = store?.currentSeasonId || '';
    const gameInfo = game?.gameInfo || {};
    return {
      route: this._route,
      // The Home parent context, read from its one owner. `season` below is the
      // OPEN document, which in Opponent Scout is a scout rather than the parent.
      workspaceMode: this._workspaceMode,
      programSeasonId: this._programSeasonId,
      team: teamName || teamId ? { id: teamId, name: teamName } : null,
      season: data && seasonId ? {
        id: seasonId,
        name: data.seasonName || teamName || 'Untitled Season',
        year: data.year || '', level: data.level || '', gameCount: games.length,
      } : null,
      game: game ? {
        id: game.id,
        // ONE naming rule (S6-4a). This used to prefer the raw stored
        // `game.name`, so the shell context bar could read "New Game" while the
        // games panel, schedule and game switcher all read "Week 3 vs Rivals"
        // for the same game — `SeasonStore.gameName()` is football-first
        // (week + opponent) and is what every other surface already uses.
        // Building the switcher beside the context bar is what exposed it.
        name: (store?.gameName ? store.gameName(game, games.indexOf(game)) : '')
          || game.name || gameInfo.projectName || gameInfo.opponent || 'Untitled Game',
        opponent: gameInfo.opponent || '', date: gameInfo.date || '',
        status: game.status || (store?.gameStatus ? store.gameStatus(game) : 'not_started'),
        playCount: (game.plays || []).length,
      } : null,
      capabilities: {
        canBreakDown: !!game,
        canStudy: !!(data && seasonId),
        canPlan: !!(data && seasonId),
      },
    };
  }

  guard(routeId) {
    const route = WORKSPACE_ROUTES.find(r => r.id === routeId);
    if (!route) return { ok: false, route: null, reason: 'unknown-route' };
    const context = this.snapshot();
    if (route.requires === 'season' && !context.season) return { ok: false, route, reason: 'season-required' };
    if (route.requires === 'game' && !context.game) return { ok: false, route, reason: 'game-required' };
    return { ok: true, route, reason: '' };
  }

  navigate(routeId) {
    const result = this.guard(routeId);
    if (result.ok) this._route = routeId;
    return { ...result, current: this._route };
  }

  setFilmOperation(gameId, state, progress = {}) {
    if (!gameId || !['saving', 'repairing'].includes(state)) return false;
    this._filmOperations.set(String(gameId), {
      state,
      progress: {
        done: Math.max(0, Number(progress.done) || 0),
        total: Math.max(0, Number(progress.total) || 0),
      }
    });
    return true;
  }

  clearFilmOperation(gameId) { this._filmOperations.delete(String(gameId || '')); }

  _identity(value) {
    const raw = typeof value === 'string' ? value : (value?.path || value?.name || '');
    return String(raw).replace(/\\/g, '/').replace(/^\.\//, '').replace(/\.[^/.]+$/, '').toLowerCase();
  }

  _expected(game) {
    if (Array.isArray(game?.clipRefs) && game.clipRefs.length) {
      return game.clipRefs.map(ref => ref.originalRelativePath || ref.libraryRelativePath || ref.displayName || ref.originalName).map(v => this._identity(v)).filter(Boolean);
    }
    if (Array.isArray(game?.clipPaths) && game.clipPaths.length) return game.clipPaths.map(v => this._identity(v)).filter(Boolean);
    if (Array.isArray(game?.clipNames) && game.clipNames.length) return game.clipNames.map(v => this._identity(v)).filter(Boolean);
    return game?.videoFileName ? [this._identity(game.videoFileName)] : [];
  }

  _view(state, opts = {}) {
    const labels = {
      empty: 'No film added', 'browser-only': 'Film must be re-added',
      managed: 'Film managed', linked: 'Film linked',
      missing: 'Film missing', saving: 'Saving film', repairing: 'Repairing film',
      unauthorized: 'Linked folder unavailable'
    };
    return {
      state, label: labels[state], ready: state === 'managed' || state === 'linked',
      persistent: opts.persistent ?? (state !== 'browser-only' && state !== 'empty'),
      mode: opts.mode || null, expected: opts.expected || 0, found: opts.found || 0,
      missing: opts.missing || 0, progress: opts.progress || null,
      action: opts.action || null, detail: opts.detail || '',
      // Resolved source, so Home can be honest about WHERE film lives rather than
      // only how many clips it found. Linked games carry the real directory that
      // filmHealth already resolved for its own listing — this adds no new read.
      // Managed games have no coach-facing path; they say so instead of guessing.
      path: opts.path || '',
      // The season this answer is ABOUT. Managed film resolves under a season
      // directory, so a result with no stated season cannot be checked against
      // the season the caller asked about.
      season: opts.season == null ? '' : String(opts.season),
    };
  }

  /** Film health for one game, scoped to the season that OWNS it.
   *  `seasonId` is required whenever the game does not belong to the open
   *  season — Home and the season library peek closed seasons, and managed
   *  film paths are season-scoped. Omitting it means "the open season". */
  async filmHealth(gameOverride = null, seasonId = null) {
    const store = this._store();
    const game = gameOverride || store?.activeGame?.();
    const season = seasonId == null || seasonId === ''
      ? (store?.currentSeasonId ?? store?.data?.id ?? '')
      : seasonId;
    if (!game) return this._view('empty', { persistent: false, action: 'add-film', season });
    const expectedIds = this._expected(game);
    const expected = expectedIds.length;
    const operation = this._filmOperations.get(String(game.id));
    if (operation) {
      return this._view(operation.state, {
        mode: game.filmMode || 'managed', expected,
        progress: { ...operation.progress }, persistent: true, season,
      });
    }
    if (!expected) return this._view('empty', { persistent: false, action: 'add-film', season });

    const backend = store?.backend;
    const supportsFilm = !!(backend?.supportsFilm && backend.supportsFilm());
    if (!supportsFilm) {
      return this._view('browser-only', { mode: 'browser', expected, missing: expected, persistent: false, action: 'repair', season });
    }

    const linked = game.filmMode === 'linked';
    let files = [];
    // Hoisted so the resolved linked directory can be reported alongside the
    // clip counts. It is the same value the listing below already required.
    let sourcePath = '';
    if (linked) {
      if (!backend.supportsLinkedFilm || !backend.supportsLinkedFilm()) {
        return this._view('unauthorized', { mode: 'linked', expected, missing: expected, action: 'reconnect', season });
      }
      const absDir = await backend.linkedGameDir(game.filmDir);
      if (!absDir || (backend.isLinkedDirAllowed && !backend.isLinkedDirAllowed(absDir))) {
        return this._view('unauthorized', { mode: 'linked', expected, missing: expected, action: 'reconnect', season });
      }
      sourcePath = absDir;
      try { files = await backend.listLinkedFilm(absDir); }
      catch (e) {
        return this._view('missing', { mode: 'linked', expected, missing: expected, action: 'reconnect', persistent: true, detail: 'linked-list-failed', path: sourcePath, season });
      }
    } else {
      // Season id FIRST-CLASS, not inherited from backend.currentId.
      try { files = await backend.listFilmFiles(game.id, season); }
      catch (e) {
        return this._view('missing', { mode: 'managed', expected, missing: expected, action: 'repair', persistent: true, detail: 'managed-list-failed', season });
      }
    }

    const foundIds = new Set((files || []).map(file => this._identity(file)).filter(Boolean));
    const missing = expectedIds.filter(id => !foundIds.has(id)).length;
    const found = Math.max(0, expected - missing);
    if (missing) {
      return this._view('missing', {
        mode: linked ? 'linked' : 'managed', expected, found, missing,
        action: linked ? 'reconnect' : 'repair', persistent: true, path: sourcePath, season,
      });
    }
    return this._view(linked ? 'linked' : 'managed', {
      mode: linked ? 'linked' : 'managed', expected, found, persistent: true, action: 'open',
      path: sourcePath, season,
    });
  }
}
