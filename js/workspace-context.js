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
  constructor(app) {
    if (!app || !app.storage) throw new TypeError('WorkspaceContext requires App storage');
    this.app = app;
    this._route = 'home';
    this._filmOperations = new Map();
  }

  listRoutes() { return WORKSPACE_ROUTES.slice(); }
  currentRoute() { return this._route; }

  _store() { return this.app.storage?.seasonStore || null; }

  snapshot() {
    const store = this._store();
    const data = store?.data || null;
    const game = data && store?.activeGame ? store.activeGame() : null;
    const profile = data?.teamProfile || {};
    let teamId = data?.teamId || '';
    if (!teamId) {
      try { teamId = this.app.library?._activeTeamId?.() || ''; } catch (e) {}
    }
    let ownerName = '';
    try { ownerName = this.app.library?._teams?.().find(team => String(team.id) === String(teamId))?.teamName || ''; } catch (e) {}
    const teamName = ownerName || profile.teamName || data?.team || '';
    const games = data?.games || [];
    const seasonId = store?.currentSeasonId || '';
    const gameInfo = game?.gameInfo || {};
    return {
      route: this._route,
      team: teamName || teamId ? { id: teamId, name: teamName } : null,
      season: data && seasonId ? {
        id: seasonId,
        name: data.seasonName || teamName || 'Untitled Season',
        year: data.year || '', level: data.level || '', gameCount: games.length,
      } : null,
      game: game ? {
        id: game.id,
        name: game.name || gameInfo.projectName || gameInfo.opponent || 'Untitled Game',
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
      managed: 'Managed film ready', linked: 'Linked film ready',
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
    };
  }

  async filmHealth(gameOverride = null) {
    const store = this._store();
    const game = gameOverride || store?.activeGame?.();
    if (!game) return this._view('empty', { persistent: false, action: 'add-film' });
    const expectedIds = this._expected(game);
    const expected = expectedIds.length;
    const operation = this._filmOperations.get(String(game.id));
    if (operation) {
      return this._view(operation.state, {
        mode: game.filmMode || 'managed', expected,
        progress: { ...operation.progress }, persistent: true,
      });
    }
    if (!expected) return this._view('empty', { persistent: false, action: 'add-film' });

    const backend = store?.backend;
    const supportsFilm = !!(backend?.supportsFilm && backend.supportsFilm());
    if (!supportsFilm) {
      return this._view('browser-only', { mode: 'browser', expected, missing: expected, persistent: false, action: 'repair' });
    }

    const linked = game.filmMode === 'linked';
    let files = [];
    // Hoisted so the resolved linked directory can be reported alongside the
    // clip counts. It is the same value the listing below already required.
    let sourcePath = '';
    if (linked) {
      if (!backend.supportsLinkedFilm || !backend.supportsLinkedFilm()) {
        return this._view('unauthorized', { mode: 'linked', expected, missing: expected, action: 'reconnect' });
      }
      const absDir = await backend.linkedGameDir(game.filmDir);
      if (!absDir || (backend.isLinkedDirAllowed && !backend.isLinkedDirAllowed(absDir))) {
        return this._view('unauthorized', { mode: 'linked', expected, missing: expected, action: 'reconnect' });
      }
      sourcePath = absDir;
      try { files = await backend.listLinkedFilm(absDir); }
      catch (e) {
        return this._view('missing', { mode: 'linked', expected, missing: expected, action: 'reconnect', persistent: true, detail: 'linked-list-failed', path: sourcePath });
      }
    } else {
      try { files = await backend.listFilmFiles(game.id); }
      catch (e) {
        return this._view('missing', { mode: 'managed', expected, missing: expected, action: 'repair', persistent: true, detail: 'managed-list-failed' });
      }
    }

    const foundIds = new Set((files || []).map(file => this._identity(file)).filter(Boolean));
    const missing = expectedIds.filter(id => !foundIds.has(id)).length;
    const found = Math.max(0, expected - missing);
    if (missing) {
      return this._view('missing', {
        mode: linked ? 'linked' : 'managed', expected, found, missing,
        action: linked ? 'reconnect' : 'repair', persistent: true, path: sourcePath,
      });
    }
    return this._view(linked ? 'linked' : 'managed', {
      mode: linked ? 'linked' : 'managed', expected, found, persistent: true, action: 'open',
      path: sourcePath,
    });
  }
}
