import { mountNativeHome } from './native-home.jsx';
import { matchupLabels } from './identity-labels.js';
import { isPlayTagged } from './football-rules.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/**
 * Native Home controller. Home is the season-scoped game workspace: search/
 * sort/filter/view over the open season's games, plus a selected-game detail
 * panel. Season/program switching, season/scout creation, and team-wide
 * management are NOT duplicated here -- they live on the shell's persistent
 * Program/Season/Game context selectors and the native Team Hub
 * (`TeamHubScreen`), which this class calls directly rather than re-owning
 * that data (2026-08-31 Home rebuild).
 *
 * `selectedGameId` is a PREVIEW, never the canonical active/open game --
 * selecting a row highlights it and populates the detail panel with no
 * side effect on `SeasonStore.data.activeGameId`. Continue Charting / Open
 * Study / Open Reports / Link Film / Game Settings all activate the
 * previewed game through the one authoritative `App.openGame()` seam before
 * acting, so a coach comparing games never leaves the wrong one open.
 */
export class HomeScreen {
  constructor(app, overlays, thumbnails) {
    this.app = app;
    this.overlays = overlays;
    this.thumbnails = thumbnails;
    this.host = null;
    this._native = null;
    this._listeners = new Set();
    this._filmToken = 0;
    this._state = {
      status: 'idle', seasonId: '', selectedGameId: null,
      query: '', sort: 'newest', filter: 'all', view: 'grid',
      filmHealth: {}, thumbnails: {},
    };
  }

  mount(host) {
    if (!host) return false;
    this.host = host;
    this._native?.unmount?.();
    this._native = mountNativeHome({ host, screen: this });
    return true;
  }

  restore() {
    this._filmToken++;
    this._native?.unmount?.();
    this._native = null;
    this.host = null;
    this._listeners.clear();
  }

  subscribe(listener) { this._listeners.add(listener); listener(this.snapshot()); return () => this._listeners.delete(listener); }
  snapshot() { return clone(this._state); }
  _emit() { const state = this.snapshot(); for (const listener of this._listeners) listener(state); }
  _set(patch) { this._state = { ...this._state, ...patch }; this._emit(); }

  get selectedGameId() { return this._state.selectedGameId; }

  _store() { return this.app.storage?.seasonStore || null; }
  _data() { return this._store()?.data || null; }
  _games() { return this._data()?.games || []; }
  // Season kind wins when a season is open; with none open, fall back to the
  // coach's persisted workspace choice -- the single `_isScoutWorkspace()`
  // owner on the shell, reused rather than reimplemented here so this can't
  // diverge from it (the exact class of bug this project's history is about).
  isScout() {
    const data = this._data();
    if (data) return data.kind === 'scout';
    return this.app.workspaceShell?._isScoutWorkspace?.() || false;
  }

  /** Called by WorkspaceShell.show('home') on every visit -- re-verifies film
   *  health each time (a coach may have just relinked film elsewhere).
   *  `previousRoute` is whatever route the coach was just on: a preview
   *  belongs only to the CURRENT Home visit, so returning from any other
   *  route resets it to the canonical active game rather than resurfacing a
   *  stale preview. A genuine season change resets search/sort/filter too. */
  async show(previousRoute) {
    const seasonId = this._store()?.currentSeasonId || '';
    const seasonChanged = seasonId !== this._state.seasonId;
    if (seasonChanged) {
      this._state = { ...this._state, seasonId, selectedGameId: null, query: '', filter: 'all', sort: 'newest' };
    } else if (previousRoute !== 'home') {
      this._state = { ...this._state, selectedGameId: null };
    }
    this._resolveSelection();
    this._set({ status: 'ready' });
    this._syncTopFilm();
    this._verifyFilm();
    return true;
  }

  _resolveSelection() {
    const games = this._games();
    if (!games.length) { this._state.selectedGameId = null; return; }
    const exists = games.some(g => String(g.id) === String(this._state.selectedGameId));
    if (exists) return;
    const activeId = String(this._data()?.activeGameId || '');
    this._state.selectedGameId = games.some(g => String(g.id) === activeId) ? activeId : String(games[0].id);
  }

  selectGame(id) {
    if (!this._games().some(g => String(g.id) === String(id))) return false;
    this._set({ selectedGameId: String(id) });
    this._syncTopFilm();
    return true;
  }

  setQuery(value) { this._set({ query: String(value ?? '') }); }
  setSort(value) { this._set({ sort: value === 'schedule' ? 'schedule' : 'newest' }); }
  setFilter(value) { this._set({ filter: ['chart', 'film'].includes(value) ? value : 'all' }); }
  setView(value) { this._set({ view: value === 'list' ? 'list' : 'grid' }); }

  selectedGame() { return this._games().find(g => String(g.id) === String(this._state.selectedGameId)) || null; }

  filterCounts() {
    const games = this._games();
    return {
      all: games.length,
      chart: games.filter(g => this._needsChart(g)).length,
      film: games.filter(g => !(this._state.filmHealth[String(g.id)]?.ready)).length,
    };
  }
  _needsChart(g) { const total = g.plays?.length || 0; const tagged = (g.plays || []).filter(isPlayTagged).length; return tagged < total || !total; }

  filteredGames() {
    const q = this._state.query.trim().toLowerCase();
    const filtered = this._games().filter(g => {
      if (this._state.filter === 'chart' && !this._needsChart(g)) return false;
      if (this._state.filter === 'film' && this._state.filmHealth[String(g.id)]?.ready) return false;
      if (!q) return true;
      const hay = [this.matchupTitle(g), this.fullTitle(g), g.gameInfo?.week ? `Week ${g.gameInfo.week}` : ''].join(' ').toLowerCase();
      return hay.includes(q);
    });
    return filtered.slice().sort((a, b) => {
      const da = a.gameInfo?.date || '', db = b.gameInfo?.date || '';
      if (!da) return db ? 1 : String(a.id).localeCompare(String(b.id));
      if (!db) return -1;
      const byDate = this._state.sort === 'newest' ? db.localeCompare(da) : da.localeCompare(db);
      if (byDate) return byDate;
      return (Number(a.gameInfo?.week || 0) - Number(b.gameInfo?.week || 0)) || String(a.id).localeCompare(String(b.id));
    });
  }

  // -- Identity (2026-08-31 Home naming contract: school/nickname compose) --
  _activeTeam() {
    const registry = this.app.teamRegistry;
    const id = registry?.activeTeamId?.();
    return registry?.teams?.().find(t => String(t.id) === String(id)) || registry?.teamProfile?.() || {};
  }
  teamName() { const t = this._activeTeam(); return t.school || t.teamName || ''; }
  _teamNickname() { return this._activeTeam().nickname || ''; }
  isActive(id) { return String(this._data()?.activeGameId || '') === String(id); }
  identities(game) {
    const gi = game?.gameInfo || {};
    if (this.isScout()) {
      return [
        { name: gi.sourceTeamASchool || gi.sourceTeamA || '', nickname: gi.sourceTeamANickname || '' },
        { name: gi.sourceTeamBSchool || gi.sourceTeamB || '', nickname: gi.sourceTeamBNickname || '' },
      ];
    }
    return [
      { name: this.teamName(), nickname: this._teamNickname() },
      { name: gi.opponentSchool || gi.opponent || '', nickname: gi.opponentNickname || '' },
    ];
  }
  matchupTitle(game) {
    const [a, b] = this.identities(game);
    const [an, bn] = matchupLabels(a.name, a.nickname, b.name, b.nickname);
    return [an, bn].filter(Boolean).join(' vs ') || 'Untitled Game';
  }
  fullTitle(game) {
    const [a, b] = this.identities(game);
    return [a.name, b.name].filter(Boolean).join(' vs ');
  }
  matchupSchoolLine(game) {
    if (this.isScout()) return this.fullTitle(game);
    const [, opp] = this.identities(game);
    return opp.name || '';
  }

  dateLabel(value) {
    if (!value) return '';
    const d = new Date(`${value}T12:00:00`);
    return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  }

  seasonRecord() {
    const games = this._games();
    const store = this._store();
    let w = 0, l = 0, t = 0;
    games.forEach((g, i) => {
      const r = this.app._gameRowInfo(g, i, store, store.data.activeGameId);
      if (!r.isFinal || !r.hasScore) return;
      const u = Number(r.u), th = Number(r.t);
      if (u > th) w++; else if (u < th) l++; else t++;
    });
    const text = t ? `${w}-${l}-${t}` : (w || l ? `${w}-${l}` : '');
    return { w, l, t, text: text || '—' };
  }

  eyebrow() {
    const c = this.app.workspace.snapshot();
    return this.isScout() ? 'Opponent Scout / Film Library' : (c.team ? 'Our Program / Season Home' : 'Team workspace');
  }

  activeRouteLabel() {
    const labels = { home: 'Home', breakdown: 'Break Down', study: 'Study', reports: 'Reports', plan: 'Plan' };
    return labels[this.app.workspace.currentRoute()] || 'Reports';
  }

  /** Per-unit charted progress -- identical formula to the accepted per-unit
   *  progress rows, ported verbatim (S6-1). `isPlayTagged` is the single
   *  canonical "is this play charted" predicate shared with Film Room and
   *  analytics. */
  gameSummary(game) {
    const plays = game?.plays || [];
    const tagged = plays.filter(isPlayTagged).length;
    const units = { offense: 0, defense: 0, special: 0 };
    const unitTagged = { offense: 0, defense: 0, special: 0 };
    plays.forEach(play => {
      const unit = play?.tags?.unit || 'offense';
      if (Object.hasOwn(units, unit)) { units[unit]++; if (isPlayTagged(play)) unitTagged[unit]++; }
    });
    const unitProgress = ['offense', 'defense', 'special'].map(key => ({
      key, short: key === 'offense' ? 'O' : key === 'defense' ? 'D' : 'ST',
      total: units[key], tagged: unitTagged[key],
      pct: units[key] ? Math.round(unitTagged[key] / units[key] * 100) : 0,
    }));
    const gi = game?.gameInfo || {};
    const hasUs = gi.scoreUs !== '' && gi.scoreUs != null && Number.isFinite(Number(gi.scoreUs));
    const hasThem = gi.scoreThem !== '' && gi.scoreThem != null && Number.isFinite(Number(gi.scoreThem));
    return {
      total: plays.length, tagged, pct: plays.length ? Math.round(tagged / plays.length * 100) : 0,
      offense: units.offense, defense: units.defense, special: units.special, unitProgress,
      score: hasUs && hasThem ? `${Number(gi.scoreUs)}–${Number(gi.scoreThem)}` : 'Not entered',
      date: this.dateLabel(gi.date), status: String(game?.status || 'not_started').replace(/_/g, ' '),
    };
  }

  // -- Film health, background-verified per game, token-guarded -----------
  async _verifyFilm() {
    const token = ++this._filmToken;
    const seasonId = this._state.seasonId;
    this._games().forEach(async g => {
      let h;
      try { h = await this.app.workspace.filmHealth(g); }
      catch { h = { state: 'missing', label: 'Film unavailable', action: 'repair', expected: 0, found: 0 }; }
      if (token !== this._filmToken || this._state.seasonId !== seasonId) return;
      this._set({ filmHealth: { ...this._state.filmHealth, [String(g.id)]: h } });
      if (String(g.id) === String(this._state.selectedGameId)) this._syncTopFilm();
    });
  }

  /** The compact game-row film cell (grid card badge / list row). */
  rowFilmView(gameId) {
    const h = this._state.filmHealth[String(gameId)];
    if (!h) return { text: 'Checking…', cls: 'ws-loading', detail: '' };
    const ready = h.state === 'linked' || h.state === 'managed';
    const detail = h.progress ? `${h.progress.done} of ${h.progress.total || '?'} clips` : h.expected ? `${h.found} of ${h.expected} clips` : '';
    return { text: ready ? '● Film linked' : (h.label || 'Film needed'), cls: ready ? 'ws-fact-green' : 'ws-fact-warn', detail };
  }

  /** The selected-game detail panel's Film fact -- a managed copy and a
   *  linked external folder must never read identically (the exact
   *  ambiguity that made an earlier smoke unprovable). */
  filmFactView(gameId) {
    const h = this._state.filmHealth[String(gameId)];
    const ready = h && (h.state === 'linked' || h.state === 'managed');
    const source = h?.state === 'linked' ? 'linked' : h?.state === 'managed' ? 'managed copy' : '';
    const text = h ? (ready ? `${h.expected || h.found || 0} clips · ${source}` : (h.label || 'Checking film…')) : 'Checking film…';
    return { text, cls: `ws-fact-${ready ? 'green' : h ? 'warn' : 'muted'}` };
  }

  _syncTopFilm() {
    const id = this._state.selectedGameId;
    const h = id ? this._state.filmHealth[String(id)] : null;
    this.app.workspaceShell?._setTopFilm?.(h || null);
  }

  // -- Thumbnails -----------------------------------------------------------
  requestThumbnail(game) {
    if (!this.thumbnails || !game) return;
    const key = String(game.id);
    const seasonId = this._state.seasonId;
    this.thumbnails.request(game).then(dataUrl => {
      if (this._state.seasonId !== seasonId) return; // a stale in-flight capture from a season the coach has left
      if (this._state.thumbnails[key] === dataUrl) return;
      this._set({ thumbnails: { ...this._state.thumbnails, [key]: dataUrl } });
    }).catch(() => {});
  }
  thumbnailFor(id) { return this._state.thumbnails[String(id)]; }

  // -- Actions ---------------------------------------------------------------
  /** Home's direct "+ Add game" action -- no season open sends the coach to
   *  the library first; otherwise GameScreen owns the create transaction and
   *  the new game is opened through the one authoritative App.openGame(). */
  async addGame() {
    if (!this._store()?.hasCurrent?.()) { await this.app.workspaceShell._openLibrary(); return false; }
    const id = await this.app.gameScreen.open({ mode: 'create' });
    if (id && id !== 'cancel') { await this.app.openGame(id); return true; }
    return false;
  }

  async openBreakdown(id) { return id ? this.app.openGame(id, { route: 'breakdown' }) : false; }
  async openStudy(id) { return id ? this.app.openGame(id, { route: 'study' }) : false; }
  async openReportsForGame(id) { return id ? this.app.openGame(id, { route: 'reports' }) : false; }
  async openSeasonReport() { await this.app.workspaceShell.show('reports'); this.app.reportsScreen?.selectTab?.('season'); return true; }
  async openPlan() { return this.app.workspaceShell.show('plan'); }
  openRoster(invoker) { return this.app.teamHubScreen?.openRoster?.(invoker); }
  openFilmSettings(invoker) { return this.app.teamHubScreen?.openSettings?.(invoker, 'film'); }
  openSeasonSetup(invoker) { return this.app.teamHubScreen?.openSeasonSetup?.(invoker); }
  openEditSeason(invoker) { return this.app.teamHubScreen?.openEditSeason?.(invoker); }
  manageProgram(invoker) { return this.app.teamHubScreen?.openSettings?.(invoker, 'film'); }
  openSeasonLibrary() { return this.app.workspaceShell._openLibrary(); }

  /** Game settings / Link film both need the SELECTED (previewed) game to be
   *  the ACTIVE one first -- reused through the one authoritative
   *  App.openGame() seam, landing back on Home rather than navigating away. */
  async _activateSelected(id) {
    if (String(this._data()?.activeGameId || '') === String(id)) return true;
    return this.app.openGame(id, { route: 'home' });
  }
  async openGameSettings(id, invoker) {
    if (!id || !(await this._activateSelected(id))) return false;
    const result = await this.app.gameScreen.open({ mode: 'edit', returnFocus: invoker });
    this._emit(); // reflect a saved edit (or a no-op cancel) the instant the dialog closes
    return result;
  }
  async openLinkFilm(id, invoker) {
    if (!id || !(await this._activateSelected(id))) return false;
    const result = await this.app.teamHubScreen?.openSettings?.(invoker, 'film');
    this._verifyFilm();
    this._emit();
    return result;
  }
  async continueCharting(id) {
    if (!id) return false;
    return this.app.openGame(id);
  }
}
