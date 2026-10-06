import { h } from 'preact';
import { mountNativeTeamHub, AddTeamForm, CreateSeasonForm, CreateScoutForm, EditSeasonForm, SeasonSetupGuide, ConfirmDeleteForm, RecoverSeasonsForm } from './native-team-hub.jsx';
import { fullIdentity, seasonIdentity } from './identity-labels.js';
import { WorkspaceContext } from './workspace-context.js';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));
const configuredGame = games => (games || []).find(game => {
  const info = game?.gameInfo || {};
  return [info.opponent, info.week, info.date].some(value => String(value || '').trim());
});

/** Native Team Hub controller. It is the only Team Hub: the legacy
 * SeasonLibrary overlay was deleted in S7-c, and TeamRegistry owns the
 * registry/identity data it used to hold. */
export class TeamHubScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.host = null;
    this._native = null;
    this._listeners = new Set();
    // `workspaceMode`, `programSeasonId` and `parentSeasonName` are RENDERING
    // PROJECTIONS of WorkspaceContext, which owns the parent program season and
    // the mode. Not a second cache: load() reads both back from that owner on
    // every pass, and nothing else writes them.
    this._state = {
      // `loaded` turns true with the first successful load and stays true, so a
      // view can tell "no teams yet" from "not read yet" during a reload too.
      status: 'idle', loaded: false, teams: [], seasons: [], railSeasons: [], activeTeamId: '', currentSeasonId: '',
      profile: {}, checklist: { visible: false, items: [], doneCount: 0 },
      workspaceMode: 'program', programSeasonId: '', parentSeasonName: '', unassignedScouts: [],
      allTeamSeasonCount: 0, control: null, error: '',
    };
    this._loadToken = 0;
  }

  mount(host) {
    if (!host) return false;
    this.host = host;
    this._native?.unmount?.();
    this._native = mountNativeTeamHub({ host, screen: this });
    return true;
  }

  restore() {
    this._loadToken++;
    this._native?.unmount?.();
    this._native = null;
    this.host = null;
    this._listeners.clear();
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.snapshot());
    return () => this._listeners.delete(listener);
  }

  snapshot() { return clone(this._state); }
  _emit() { const state = this.snapshot(); for (const listener of this._listeners) listener(state); }
  _set(patch) { this._state = { ...this._state, ...patch }; this._emit(); }
  /** S7-c: the team/season identity layer. Was twelve private members of the
   *  legacy SeasonLibrary overlay; now one public service that owns no DOM. */
  _registry() { return this.app.teamRegistry; }
  _storage() { return this.app.storage; }
  _store() { return this.app.storage?.seasonStore; }

  // Check and write share one queue; concurrent dialogs cannot both reserve
  // the same identity. Queued edits retain their submitted season identity.
  _changeSeason(work, seasonId = null) {
    const teamId = this._registry().activeTeamId();
    const current = () => teamId === this._registry().activeTeamId()
      && (seasonId === null || seasonId === this._store()?.currentSeasonId);
    const run = async () => {
      if (!current()) return { ok: false, message: 'The workspace changed. Reopen the form and try again.' };
      try { return await work(current); }
      catch (error) { return { ok: false, message: error?.message || 'The season could not be saved.' }; }
    };
    const result = (this._seasonChanges || Promise.resolve()).then(run, run);
    this._seasonChanges = result.then(() => undefined, () => undefined);
    return result;
  }

  async _controlStatus(teamSeasons = []) {
    const store = this._store();
    const backend = store?.backend;
    const desktop = !!(window.__TAURI__ && backend?.supportsLinkedFilm?.());
    const root = desktop ? backend.getLibraryRoot?.() || '' : '';
    const mode = desktop ? backend.getFilmStorageMode?.() || '' : 'browser';
    const games = teamSeasons.reduce((sum, season) => sum + (Number(season.games) || 0), 0);
    const plays = teamSeasons.reduce((sum, season) => sum + (Number(season.plays) || 0), 0);
    const rosterCount = this.app.roster?.players?.length || 0;
    const current = store?.data;
    const canReviewSetup = !!current && current.kind !== 'scout';
    const firstGame = canReviewSetup ? configuredGame(current.games) : null;
    const storageReady = !desktop || !!root || mode === 'managed';
    const gameReady = !!firstGame;
    const setupDone = [rosterCount > 0, storageReady, gameReady].filter(Boolean).length;
    return {
      desktop, root, mode, games, plays, rosterCount, canReviewSetup,
      setupReady: canReviewSetup && setupDone === 3,
      setupLabel: canReviewSetup ? (setupDone === 3 ? 'Roster, film, and first game ready' : `${setupDone} of 3 setup areas ready`) : 'Open a program season to review setup',
      recovery: this.canRecoverSeasons() ? 'Recovery ready' : 'Browser backup ring',
      storageLabel: !desktop ? 'Browser storage' : root ? 'Linked library' : mode === 'managed' ? 'Managed app storage' : 'Film storage not set',
    };
  }

  /** The one owner of the Home parent context (`app.workspace`). */
  _context() { return this.app.workspace || null; }

  /**
   * ONE ATOMIC WORKSPACE TRANSITION.
   *
   * Our Program and Opponent Scout are two VIEWS of one parent program season,
   * so switching between them changes a view, not a season. There is exactly
   * one state change and one render:
   *
   *   - Entering Opponent Scout keeps the parent program season open and
   *     renders its own scoped scout library. It does not close the season, does
   *     not call `_openLibrary()`, and never auto-opens a scout — the coach picks
   *     one.
   *   - Returning to Our Program re-opens the parent only when the OPEN document
   *     is a scout, and then by the scout's exact `programSeasonId`. If the
   *     parent is already the open season there is no open at all.
   *
   * What this replaced: set mode -> load() (render 1) -> search every team
   * season by kind and `lastOpened` -> openSeason() (render 2) ->
   * show('home') (render 3), or `_openLibrary()` when nothing matched — which is
   * the Scout / library / unrelated-season bounce the coach reported.
   */
  async selectWorkspace(mode) {
    const context = this._context();
    const workspaceMode = mode === 'scout' ? 'scout' : 'program';
    const previousMode = context ? context.workspaceMode() : this._state.workspaceMode;
    if (workspaceMode === previousMode) return true;
    const store = this._store();
    const openIsScout = store?.data?.kind === 'scout';
    const parentId = context?.programSeasonId?.() || '';

    // Returning to Our Program from an open scout is the only case that needs a
    // season open, and it targets the scout's exact parent id -- never a
    // team/year/level search and never `lastOpened`.
    if (workspaceMode === 'program' && openIsScout) {
      const target = String(store?.data?.programSeasonId || parentId || '');
      if (!target) {
        this.overlays.toast({ tone: 'error', message: 'This scout is not assigned to a program season yet.' });
        return false;
      }
      const opened = await this._storage().openSeasonById(target);
      if (opened === false) {
        // A refused open leaves the prior context and UI exactly as they were.
        this.app.workspaceShell?._syncChrome?.();
        return false;
      }
      context?.setWorkspaceMode('program');
      const loaded = await this.load();
      this.app.workspaceShell?._syncChrome?.();
      return loaded !== false;
    }

    context?.setWorkspaceMode(workspaceMode);
    this._state.workspaceMode = workspaceMode;
    const loaded = await this.load();
    if (!loaded) {
      context?.setWorkspaceMode(previousMode);
      this._state.workspaceMode = previousMode;
      this.app.workspaceShell?._syncChrome?.();
      return false;
    }
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async show() {
    if (!this.host) return false;
    this.host.hidden = false;
    await this.load();
    return true;
  }

  hide() { if (this.host) this.host.hidden = true; }

  async load() {
    const token = ++this._loadToken;
    this._set({ status: 'loading', error: '' });
    try {
      const registry = this._registry();
      await registry.recoverFromWipe();
      registry.ensureRegistry();
      const teams = registry.teams();
      const activeTeamId = registry.activeTeamId() || teams[0]?.id || '';
      const profile = registry.teamProfile();
      const allSeasons = await this._storage().listSeasons();
      const teamSeasons = teams.length ? registry.seasonsForTeam(allSeasons, activeTeamId) : [];
      const currentSeasonId = this._store()?.currentSeasonId || '';
      const context = this._context();
      let workspaceMode = context ? context.workspaceMode() : this._state.workspaceMode;
      if (!['program', 'scout'].includes(workspaceMode)) workspaceMode = 'program';
      // THE PARENT PROGRAM SEASON owns this workspace. It is whatever the
      // context owner holds; when nothing is held yet (first load) an open
      // program season adopts itself, and an open scout adopts its own stored
      // parent. Nothing here searches by team/year/level or lastOpened.
      const liveData = this._store()?.data || null;
      // PASSIVE: a re-render adopts the parent but must not restate the mode of
      // an open program season, or it would undo the switch that triggered it.
      if (context && liveData) context.syncParentFromOpen(liveData);
      // Then validate it against THIS team's collection. Persisted context
      // outlives what it points at -- a team switch, a deleted parent, or an
      // imported body carrying a foreign programSeasonId all leave an id that
      // resolves to nothing, or to a scout. An invalid parent is dropped here, so
      // its scouts fall into the unassigned workflow instead of a dangling view.
      let programSeasonId = context ? context.validateParent(teamSeasons) : '';
      // A LEGACY scout with no stored parent but exactly one compatible program
      // season is listed under that season, so navigation must agree with the
      // list: adopt the inferred parent for this session only. Read-only -- the
      // inference is never written to the scout. An ambiguous scout resolves to
      // nothing and stays in the unassigned workflow.
      if (context && !programSeasonId && liveData?.kind === 'scout' && !String(liveData.programSeasonId || '')) {
        const meta = teamSeasons.find(season => String(season.id) === String(liveData.id));
        const resolved = meta ? WorkspaceContext.resolveScoutParent(meta, teamSeasons) : null;
        if (resolved?.status === 'inferred') programSeasonId = context.setParentSeason(resolved.programSeasonId);
      }
      const parentSeason = teamSeasons.find(season => String(season.id) === String(programSeasonId)) || null;
      // `seasons` stays the MAIN-PANEL filtered collection (the library grid
      // and Team Hub's own list follow the coach's workspace choice).
      // `railSeasons` is the COMPLETE team collection, unfiltered: the Home
      // rail is a context navigator, not a view of the selected workspace
      // mode, so entering Opponent Scout must never remove the program
      // seasons from navigation (the recorded rail defect). Two collections,
      // one source -- no second storage or ownership path.
      // Opponent Scout shows only the scouts belonging to THIS parent program
      // season, through the durable `programSeasonId` relationship (or the
      // documented single-candidate inference for a legacy record). A scout
      // belonging to another season, year, level or team cannot appear, and
      // `lastOpened` only orders what is already correctly scoped.
      const seasons = workspaceMode === 'scout'
        ? WorkspaceContext.scoutsForParent(teamSeasons, programSeasonId)
        : teamSeasons.filter(season => season.kind !== 'scout');
      // Scouts this team owns that name no resolvable parent. Kept intact and
      // surfaced so the coach can assign one; never attached to a guess.
      const unassignedScouts = teamSeasons
        .filter(season => season.kind === 'scout'
          && WorkspaceContext.resolveScoutParent(season, teamSeasons).status === 'unassigned')
        .map(season => this._seasonRowShell(season, currentSeasonId));
      // Season rows render immediately from list metadata so a large library
      // or a slow film check never blocks Team Hub. Each row starts
      // 'checking' and is patched in place once its film health is known.
      const rows = seasons.map(season => this._seasonRowShell(season, currentSeasonId));
      const railRows = teamSeasons.map(season => this._seasonRowShell(season, currentSeasonId));
      const items = teams.length ? registry.checklistItems(seasons) : [];
      const doneCount = items.filter(item => item.done).length;
      const checklist = { items, doneCount, visible: !!teams.length && !!items.length && doneCount < items.length && !registry.checklistDismissed() };
      if (token !== this._loadToken) return false;
      const control = await this._controlStatus(teamSeasons);
      if (token !== this._loadToken) return false;
      this._set({
        status: 'ready', loaded: true, teams, seasons: rows, railSeasons: railRows, activeTeamId, currentSeasonId,
        profile, checklist, workspaceMode, allTeamSeasonCount: teamSeasons.length, control, error: '',
        // Parent identity travels with the state so BOTH views can name the
        // program season that owns them without re-deriving it.
        programSeasonId,
        parentSeasonName: parentSeason?.name || (String(programSeasonId) === String(currentSeasonId) ? (this._store()?.data?.seasonName || '') : ''),
        unassignedScouts,
      });
      this._verifyFilmHealth(railRows, currentSeasonId, token);
      return true;
    } catch (error) {
      if (token !== this._loadToken) return false;
      this._set({ status: 'error', error: String(error?.message || error || 'Could not load teams and seasons.') });
      return false;
    }
  }

  _seasonRowShell(meta, currentSeasonId) {
    const current = String(meta.id) === String(currentSeasonId);
    const live = current ? this._store()?.data : null;
    const games = live?.games || null;
    const gameCount = games ? games.length : Number(meta.games) || 0;
    const playCount = games ? games.reduce((sum, game) => sum + (game.plays?.length || 0), 0) : Number(meta.plays) || 0;
    return {
      id: String(meta.id), name: meta.name || 'Untitled Season', year: meta.year || '', level: meta.level || '',
      team: meta.team || '', kind: meta.kind || '', gameCount, playCount, current, isScout: meta.kind === 'scout', isDemo: this._storage().isDemoSeason(meta.id) || meta.isDemo || meta.kind === 'demo',
      lastOpened: meta.lastOpened || meta.openedAt || meta.created || '',
      // The honest transient — real state is filled in by _verifyFilmHealth.
      // Never "not checked": that reads as an error/unlinked state rather
      // than "verification is in progress right now."
      film: { state: 'checking', label: 'Checking film…', expected: 0, found: 0, missing: 0 },
    };
  }

  /** Resolves each row's real film state in the background and patches it
   *  into _state.seasons as each one completes — never blocking the initial
   *  render. `token` is the load() call this verification belongs to: a
   *  season/team switch calls load() again, bumping _loadToken, and every
   *  check below this closure was already committed to reads against by
   *  the time that happens; the guard makes a stale check's late-arriving
   *  patch a silent no-op instead of overwriting a newer render with an
   *  answer about a season the coach has since navigated away from. */
  _verifyFilmHealth(rows, currentSeasonId, token) {
    rows.forEach(async row => {
      const games = String(row.id) === String(currentSeasonId)
        ? (this._store()?.data?.games || null)
        : await this._peekGames(row.id);
      if (token !== this._loadToken) return;
      const film = await this._aggregateFilm(games, row.id);
      if (token !== this._loadToken) return;
      const patch = list => list.map(season => String(season.id) === String(row.id) ? { ...season, film } : season);
      this._set({ seasons: patch(this._state.seasons), railSeasons: patch(this._state.railSeasons || []) });
    });
  }

  /** Read-only peek at a non-active season's games, for film verification
   *  only — never opens the season, never touches currentSeasonId, and never
   *  writes anything (SeasonStore.peekSeason/StorageBackend.peekSeason are
   *  both read-only). Canonical film-health data source stays
   *  WorkspaceContext.filmHealth(); this only supplies the games array a
   *  non-current season doesn't have loaded into memory. */
  async _peekGames(seasonId) {
    try { const data = await this._store()?.peekSeason?.(seasonId); return data?.games || null; }
    catch (e) { return null; }
  }

  /** `seasonId` is the season these games BELONG to, and it is required: a
   *  closed season's managed film lives under its own season directory, so a
   *  check that omitted it resolved against `backend.currentId` and answered
   *  about the OPEN season's film whenever the two seasons reuse a game id.
   *  Every Home and library presentation consumes this one result. */
  async _aggregateFilm(games, seasonId) {
    // Peek failed (unreadable file, race with a delete) — stay honest rather
    // than claim "no film linked" for a season we could not actually read.
    if (!Array.isArray(games)) return { state: 'checking', label: 'Checking film…', expected: 0, found: 0, missing: 0, seasonId: String(seasonId ?? '') };
    if (!games.length) return { state: 'none', label: 'No games yet', expected: 0, found: 0, missing: 0, seasonId: String(seasonId ?? '') };
    const health = await Promise.all(games.map(game => this.app.workspace.filmHealth(game, seasonId).catch(() => ({ state: 'error', detail: 'health-lookup-failed', expected: 0, found: 0, missing: 0 }))));
    const expected = health.reduce((sum, item) => sum + (item.expected || 0), 0);
    const found = health.reduce((sum, item) => sum + (item.found || (item.ready ? item.expected || 0 : 0)), 0);
    const missing = health.reduce((sum, item) => sum + (item.missing || 0), 0);
    const gamesLinked = health.filter(item => item.ready).length;
    const season = String(seasonId ?? '');
    // Always an explicit count, never a bare "Film linked": the coach compares
    // this line against the opened season, and "linked" cannot be reconciled
    // with "5 of 6" by looking at it.
    const linkedOf = count => `${count} of ${games.length} game${games.length === 1 ? '' : 's'} linked`;
    // Only a genuinely in-flight check is 'checking'. A settled season always
    // ends on an explicit count: with one linked game beside one game that has
    // no film added, neither `missing` nor `every(ready)` held, so the row sat
    // on "Checking film…" permanently — a transient label over a final answer.
    if (health.some(item => ['checking', 'saving', 'repairing'].includes(item.state))) {
      return { state: 'checking', label: 'Checking film…', expected, found, missing, seasonId: season };
    }
    // A failed lookup cannot contribute an honest denominator or linked count.
    // Check it before the zero-expected shortcut, which would otherwise turn
    // an all-failed season into "No film linked".
    // Gating the attention state on
    // `action === 'reconnect'` instead swallowed the ordinary partial case: a
    // linked game missing one clip also asks to reconnect, so the coach's real
    // 2025 JV season (89 expected, 88 on disk in one of six games) reported
    // `Film needs attention` where the honest answer is `5 of 6 games linked`.
    if (health.some(item => item.state === 'unauthorized' || ['linked-list-failed', 'managed-list-failed', 'health-lookup-failed'].includes(item.detail))) {
      return { state: 'missing', label: 'Film needs attention', expected, found, missing, seasonId: season };
    }
    if (!expected) return { state: 'none', label: 'No film linked', expected, found, missing, seasonId: season };
    if (gamesLinked === games.length) return { state: 'ready', label: linkedOf(games.length), expected, found: expected, missing: 0, seasonId: season };
    return { state: 'partial', label: linkedOf(gamesLinked), expected, found, missing, seasonId: season };
  }

  close() { return this.app.workspaceShell?.closeTeamHub?.(); }

  openSettings(invoker, initialTab = 'film') { return this.app.settingsScreen?.open?.({ initialTab, returnFocus: invoker }); }
  openRoster(invoker = null) {
    const current = this._store()?.data;
    if (!current || current.kind === 'scout') {
      this.overlays.toast({ tone: 'info', message: 'Open a program season before editing its roster.' });
      return false;
    }
    return this.app.settingsScreen?.open?.({ initialTab:'roster', returnFocus:invoker || document.activeElement });
  }

  dismissChecklist() {
    this._registry().dismissChecklist();
    this._set({ checklist: { ...this._state.checklist, visible: false } });
  }

  async runChecklistAction(step, invoker) {
    if (step === 'roster') { this.openRoster(); return true; }
    if (step === 'season') { this.openCreateSeason(invoker); return true; }
    const real = this._state.seasons.find(season => !season.isDemo && (step !== 'stats' || season.playCount > 0));
    if (step === 'play') {
      if (real) return this.openSeason(real.id);
      this.openCreateSeason(invoker);
      return true;
    }
    if (step === 'stats') {
      if (real) {
        if (!real.current) await this.openSeason(real.id);
        await this.app.workspaceShell.show('reports');
        return true;
      }
      const loaded = await this.exploreSample();
      if (loaded) await this.app.workspaceShell.show('reports');
      return loaded;
    }
    return false;
  }

  async switchTeam(id) {
    id = String(id || '');
    if (!id || id === this._registry().activeTeamId()) return true;
    const teams = this._registry().teams();
    const next = teams.find(team => String(team.id) === id);
    if (!next) return false;
    const storage = this._storage();
    const store = this._store();
    if (store?.hasCurrent?.()) {
      storage.commitActive();
      const saved = await store.persist();
      if (saved === false) {
        this.overlays.toast({ tone: 'error', message: 'Could not switch teams because the open season was not saved. Your current team is unchanged.' });
        return false;
      }
      store.closeSeason();
      storage._clearForNewGame();
    }
    // The Home parent context belongs to the OUTGOING team. Cleared in the same
    // step that changes the active team, before anything can read it: a stale
    // parent here meant a scout created under the new team could be stamped with
    // the previous team's program-season id.
    this._context()?.clearParent();
    this._registry().setActiveTeamId(id);
    this._registry().saveTeamProfile({ teamName: next.teamName, school:next.school || '', nickname:next.nickname || '', jerseyColor: next.jerseyColor || '' });
    // No season is open after a team switch, so no roster has an owner yet.
    // The selected season will hydrate its own roster when the coach opens it.
    this.app.roster?.loadFrom?.([], { persist: false });
    this.app.customChips?.reload?.();
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async addTeam({ school, nickname = '', jerseyColor = '' }) {
    const cleanSchool = String(school || '').trim();
    const cleanNickname = String(nickname || '').trim();
    if (!cleanSchool) return { ok: false, message: 'Enter a school or organization name.' };
    const clean = [cleanSchool, cleanNickname].filter(Boolean).join(' ');
    const registry = this._registry();
    const teams = registry.teams();
    if (teams.some(item => String(item.school || item.teamName || '').trim().toLowerCase() === cleanSchool.toLowerCase())) {
      return { ok: false, message: `A program named ${cleanSchool} already exists.` };
    }
    const team = { id: registry.newTeamId(clean, teams.map(item => item.id)), teamName: clean, school: cleanSchool, nickname: cleanNickname, jerseyColor: String(jerseyColor || '') };
    registry.saveTeams([...teams, team]);
    if (teams.length) {
      const switched = await this.switchTeam(team.id);
      if (!switched) {
        registry.saveTeams(teams);
        return { ok: false, message: 'The new team was not added because the open season could not be saved.' };
      }
    } else {
      registry.setActiveTeamId(team.id);
      registry.saveTeamProfile({ teamName: team.teamName, school: team.school, nickname: team.nickname, jerseyColor: team.jerseyColor });
      await this.load();
      this.overlays.toast({ tone: 'success', message: 'Team saved. Start a season when you are ready.' });
    }
    return { ok: true };
  }

  openAddTeam(invoker) {
    let handle;
    handle = this.overlays.dialog({
      id: 'team-hub-add-team', title: 'Add team', returnFocus: invoker, actions: [],
      content: h(AddTeamForm, {
        onCancel: () => handle.close('cancel'),
        onSubmit: async values => { const result = await this.addTeam(values); if (result.ok) handle.close('created'); return result; },
      }),
    });
    return handle.result;
  }

  openCreateScout(invoker) {
    if (!this._state.activeTeamId) return this.openAddTeam(invoker);
    let handle;
    handle = this.overlays.dialog({
      id: 'team-hub-create-scout', title: 'Create opponent scout', returnFocus: invoker, actions: [],
      content: h(CreateScoutForm, {
        onCancel: () => handle.close('cancel'),
        onOpenExisting: async id => { handle.close('open-existing'); await this.openSeason(id); },
        onSubmit: async values => { const result = await this.createScout(values); if (result.ok) handle.close('created'); return result; },
      }),
    });
    return handle.result;
  }

  /** Duplicate program/year/level/opponent detection for a new opponent
   *  scout, at the shared creation boundary. Reads the live library at submit
   *  time (`listSeasons()`, not cached state), so a stale form or an
   *  overlapping submission cannot bypass it. */
  async _findDuplicateScout(year, level, opponentSchool) {
    const all = await this._storage().listSeasons();
    const candidates = all.filter(s => s.kind === 'scout' && String(s.teamId || '') === this._state.activeTeamId
      && String(s.year || '').trim() === year && String(s.level || '').trim().toLowerCase() === level.toLowerCase());
    for (const season of candidates) {
      const body = await this._store().peekSeason(season.id);
      if (!body) throw new Error('An existing scout could not be checked. Try again before creating another.');
      const opponent = body.scout?.opponentSchool || body.scout?.opponent || '';
      if (String(opponent).trim().toLowerCase() === opponentSchool.toLowerCase()) return season;
    }
    return null;
  }

  /** Scouts whose stored `programSeasonId` is EXPLICITLY this season. Read fresh
   *  from the library, never from cached rows, because deletion is irreversible. */
  async _ownedScouts(programSeasonId) {
    const wanted = String(programSeasonId || '');
    if (!wanted) return [];
    const all = await this._storage().listSeasons();
    return all.filter(season => season?.kind === 'scout' && String(season.programSeasonId || '') === wanted);
  }

  /**
   * Assign an UNASSIGNED scout to an explicit program season.
   *
   * The coach chooses the parent; nothing here infers one. The relationship is
   * written through the canonical storage APIs into BOTH the season body and the
   * library row, and only a durable write counts: a failed persist leaves the
   * scout unassigned, restores the body, and reports the failure rather than
   * showing an assignment that did not land. No game, film, tag, roster,
   * opponent identity or source-game field is read or written.
   */
  async assignScoutToSeason(scoutId, programSeasonId) {
    const scout = String(scoutId || ''), parent = String(programSeasonId || '');
    if (!scout || !parent) return { ok: false, message: 'Choose the program season this scout belongs to.' };
    const all = await this._storage().listSeasons();
    const teamSeasons = this._registry().seasonsForTeam(all, this._state.activeTeamId);
    if (!WorkspaceContext.isValidParent(teamSeasons, parent)) {
      return { ok: false, message: 'That program season is no longer available. Pick another.' };
    }
    // THE SCOUT MUST BELONG TO THE ACTIVE TEAM. Validating only the parent left
    // the scout resolved from the whole catalog, so a direct call with another
    // team's scout id would have attached it to this team's season.
    const record = teamSeasons.find(season => String(season.id) === scout);
    if (!record || record.kind !== 'scout') {
      return { ok: false, message: 'That opponent scout could not be found for this team.' };
    }
    const store = this._store();
    const body = String(store.currentSeasonId || '') === scout ? store.data : await store.peekSeason(scout);
    if (!body) return { ok: false, message: 'That opponent scout could not be read. Nothing was changed.' };
    /* Three states, three answers. A BLANK parent is assignable. A stored parent
       that no longer resolves to a real program season of this team -- deleted,
       or imported from another machine -- is REPAIRABLE, which is what makes the
       parent-deletion dialog's "reassign or delete" instruction true. A parent
       that is still valid is left alone: silent reassignment is not this
       workflow's job (see docs/OPEN-DEFECTS.md). */
    const stored = String(body.programSeasonId || '');
    if (stored && WorkspaceContext.isValidParent(teamSeasons, stored)) {
      return { ok: false, message: 'That scout already belongs to a program season.', reason: 'already-assigned' };
    }
    const result = await store.assignScoutParent(scout, parent);
    if (!result.ok) {
      return { ok: false, message: 'The assignment could not be saved. The scout is unchanged and still unassigned.' };
    }
    await this.load();
    return { ok: true, seasonId: scout, programSeasonId: parent, repaired: !!stored };
  }

  /** The Home unassigned-scout row's Assign action: the same command, with
   *  coach-facing feedback either way. */
  async assignScoutFromHome(scoutId, programSeasonId) {
    if (!String(programSeasonId || '')) {
      this.overlays.toast({ tone: 'error', message: 'Choose the program season this scout belongs to.' });
      return false;
    }
    const result = await this.assignScoutToSeason(scoutId, programSeasonId);
    this.overlays.toast(result.ok
      ? { tone: 'success', message: 'Opponent scout assigned to its program season.' }
      : { tone: 'error', message: result.message });
    return result.ok;
  }

  createScout(values) { return this._changeSeason(current => this._createScout(values, current)); }

  async _createScout({ opponent, opponentNickname = '', year = '', level = 'Varsity', sourceTeamA = '', sourceTeamANickname = '', sourceTeamB = '', sourceTeamBNickname = '', date = '' }, current) {
    const cleanOpponent = String(opponent || '').trim();
    const cleanOpponentNickname = String(opponentNickname || '').trim();
    const aSchool = String(sourceTeamA || '').trim();
    const aNickname = String(sourceTeamANickname || '').trim();
    const bSchool = String(sourceTeamB || '').trim();
    const bNickname = String(sourceTeamBNickname || '').trim();
    const a = fullIdentity(aSchool, aNickname);
    const b = fullIdentity(bSchool, bNickname);
    if (!cleanOpponent) return { ok: false, message: 'Enter the opponent you are scouting.' };
    if (!aSchool || !bSchool) return { ok: false, message: 'Enter both teams from the source film.' };
    if (a.toLowerCase() === b.toLowerCase()) return { ok: false, message: 'Name the opponent and enter two different source-game teams.' };
    const cleanYear = String(year || '').trim();
    const cleanLevel = String(level || '').trim() || 'Varsity';
    const opponentIdentity = fullIdentity(cleanOpponent, cleanOpponentNickname);
    const duplicate = await this._findDuplicateScout(cleanYear, cleanLevel, cleanOpponent);
    if (!current()) return { ok: false, message: 'The workspace changed. Reopen the form and try again.' };
    if (duplicate) return { ok: false, message: `A ${cleanYear} · ${cleanLevel} scout of ${cleanOpponent} already exists.`, duplicateId: duplicate.id, duplicateName: duplicate.name };
    const seasonName = [cleanYear, cleanLevel, opponentIdentity, 'Scout'].filter(Boolean).join(' · ');
    // The scout is created INSIDE a parent program season's workspace, so that
    // season's id is stored on it durably. Without a parent there is nothing to
    // own the scout, and inventing one from team/year/level is the guess this
    // model exists to remove.
    // Created inside a parent program season's Opponent Scout view, that season
    // owns it. Created at FIRST LAUNCH -- the accepted opponent-first setup path,
    // where no program season exists yet -- it is born unassigned and surfaced
    // as needing a parent, exactly like a legacy scout. Refusing here instead
    // would delete a coach flow, and inventing a program season to own it would
    // be the guess this model exists to remove.
    // FAIL CLOSED from the sample season. It can never own a scout (a
    // disposable season would trap real opponent film, and a parent that owns
    // scouts cannot be deleted), and silently creating the scout unassigned here
    // would be indistinguishable from first launch while the coach is plainly
    // sitting in a season. Nothing is written -- this returns before any record
    // is created, so there is no partially saved scout.
    // Only the SAMPLE season blocks. An open SCOUT does not: creating a second
    // scout from inside the Opponent Scout workspace is ordinary, and the parent
    // context is held by WorkspaceContext, not by whichever document is open.
    const openData = this._store()?.data;
    if (openData && (openData.isDemo || openData.kind === 'demo')) {
      return { ok: false, message: 'The sample season cannot own an opponent scout. Open or create a program season first.' };
    }
    const programSeasonId = String(this._context()?.programSeasonId?.() || '');
    try {
      const rec = await this._storage().createSeason({
        name: seasonName, year: cleanYear, level: cleanLevel, kind: 'scout',
        team: this._state.profile.teamName || '', teamId: this._state.activeTeamId,
        programSeasonId,
      });
      if (!rec) return { ok: false, message: 'The opponent scout could not be created. Nothing changed.' };
      const store = this._store();
      const game = store?.activeGame?.();
      if (!game) return { ok: false, message: 'The source game could not be created.' };
      store.data.kind = 'scout';
      // The durable relationship is written into the season body, which is what
      // `listSeasons()` reads it back from -- not only into the library row.
      store.data.programSeasonId = programSeasonId;
      store.data.scout = { opponent: opponentIdentity, opponentSchool: cleanOpponent, opponentNickname: cleanOpponentNickname, year: cleanYear, level: cleanLevel };
      this.app._applyGameInfoDraft({
        opponent: opponentIdentity, date: String(date || '').trim(), perspective: 'scout', gameType: 'scout',
        sourceTeamA: a, sourceTeamASchool: aSchool, sourceTeamANickname: aNickname,
        sourceTeamB: b, sourceTeamBSchool: bSchool, sourceTeamBNickname: bNickname,
      });
      game.name = `${a} vs ${b}`;
      this._storage().gameInfo.projectName = game.name;
      this._storage().commitActive();
      const saved = await store.persist();
      if (saved === false) throw new Error('The opponent scout could not be saved.');
      // The new scout is now the open document, and its parent is unchanged --
      // `adoptOpenedSeason` reads the parent off the scout itself.
      this._context()?.adoptOpenedSeason(store.data);
      this._state.workspaceMode = 'scout';
      await this.app.workspaceShell.show('home');
      this.overlays.toast({ tone: 'success', message: `${cleanOpponent} scout created. Link the source-game folder, then chart the opponent.` });
      return { ok: true, seasonId: rec.id, gameId: String(game.id) };
    } catch (error) {
      return { ok: false, message: `${error?.message || 'The opponent scout could not be created.'} No existing program season was changed.` };
    }
  }
  _seasonSetupStatus() {
    const store = this._store();
    const data = store?.data;
    if (!store?.hasCurrent?.() || data?.kind === 'scout') return null;
    const season = this._state.seasons.find(item => item.current) || this._state.seasons.find(item => item.id === this._state.currentSeasonId);
    const backend = store.backend;
    const desktop = !!(window.__TAURI__ && backend?.supportsLinkedFilm?.());
    const root = desktop ? backend.getLibraryRoot?.() || '' : '';
    const mode = desktop ? backend.getFilmStorageMode?.() || '' : 'browser';
    const rosterCount = this.app.roster?.players?.length || 0;
    const firstGame = configuredGame(data.games);
    const info = firstGame?.gameInfo || {};
    const storageReady = !desktop || !!root || mode === 'managed';
    const gameReady = !!firstGame;
    const coreReady = rosterCount > 0 && storageReady && gameReady;
    return {
      seasonName: data.seasonName || season?.name || data.name || 'Current season',
      steps: [
        { label: 'Season details', detail: [data.year, data.level].filter(Boolean).join(' · ') || 'Season created', done: true },
        { label: 'Roster', detail: rosterCount ? `${rosterCount} players ready` : 'Add players now or later', done: rosterCount > 0, action: 'roster', button: 'Add roster' },
        { label: 'Film storage', detail: storageReady ? (root || 'Storage ready') : 'Choose where game film lives', done: storageReady, action: 'film', button: 'Set film storage' },
        { label: 'First game', detail: gameReady ? (firstGame?.name || info.opponent || 'Game details saved') : 'Add the opponent, date, and game details', done: gameReady, action: 'game', button: 'Set game details' },
        { label: 'Ready to chart', detail: coreReady ? 'The season is ready for film and charting' : 'Complete what you need, or skip the guide', done: coreReady },
      ],
    };
  }

  openSeasonSetup(invoker = null) {
    const setup = this._seasonSetupStatus();
    if (!setup) {
      this.overlays.toast({ tone: 'info', message: 'Open a program season to review its setup.' });
      return Promise.resolve(false);
    }
    let handle;
    const leave = async action => {
      handle.close(action);
      if (action === 'roster') this.openRoster(invoker);
      else if (action === 'film') this.openSettings(invoker, 'film');
      else if (action === 'game') await this.app.gameScreen?.open?.({ mode: 'edit', returnFocus: invoker });
    };
    handle = this.overlays.dialog({
      id: 'team-hub-season-setup', title: 'Review season setup', returnFocus: invoker, actions: [],
      content: h(SeasonSetupGuide, {
        setup,
        onAction: leave,
        onClose: () => { handle.close('skip'); void this.app.workspaceShell?.show?.('home'); },
      }),
    });
    return handle.result;
  }
  openCreateSeason(invoker) {
    if (!this._state.activeTeamId) return this.openAddTeam(invoker);
    let handle;
    handle = this.overlays.dialog({
      id: 'team-hub-create-season', title: 'Create season', returnFocus: invoker, actions: [],
      content: h(CreateSeasonForm, {
        teamName: this._state.profile.teamName || '',
        hasExistingData: this._state.allTeamSeasonCount > 0,
        onCancel: () => handle.close('cancel'),
        onOpenExisting: async id => { handle.close('open-existing'); await this.openSeason(id); },
        onSubmit: async values => { const result = await this.createSeason(values); if (result.ok) { handle.close('created'); if (values.setupMode === 'guided') setTimeout(() => this.openSeasonSetup(null), 0); } return result; },
      }),
    });
    return handle.result;
  }

  /** Runs inside _changeSeason's check-and-write queue. Custom levels are
   *  exact identities, never fuzzy matches against a standard level. */
  async _findDuplicateSeason(year, level, excludeId = null) {
    const all = await this._storage().listSeasons();
    return all.find(s => s.kind !== 'scout' && String(s.teamId || '') === this._state.activeTeamId
      && String(s.id) !== String(excludeId || '')
      && String(s.year || '').trim() === year && String(s.level || '').trim().toLowerCase() === level.toLowerCase());
  }

  createSeason(values) { return this._changeSeason(current => this._createSeason(values, current)); }

  async _createSeason({ year = '', level = '' }, current) {
    const cleanYear = String(year || '').trim();
    const cleanLevel = String(level || '').trim() || 'Varsity';
    if (!/^\d{4}$/.test(cleanYear)) return { ok: false, message: 'Enter a four-digit year.' };
    const duplicate = await this._findDuplicateSeason(cleanYear, cleanLevel);
    if (!current()) return { ok: false, message: 'The workspace changed. Reopen the form and try again.' };
    if (duplicate) return { ok: false, message: `${cleanYear} · ${cleanLevel} already exists.`, duplicateId: duplicate.id, duplicateName: duplicate.name };
    const name = seasonIdentity(cleanYear, this._state.profile.teamName, cleanLevel);
    try {
      const rec = await this._storage().createSeason({
        name, year: cleanYear, level: cleanLevel,
        team: this._state.profile.teamName || '', teamId: this._state.activeTeamId, kind: 'program'
      });
      if (!rec) return { ok: false, message: 'The season could not be created. Nothing changed.' };
      this._state.workspaceMode = 'program';
      await this.app.workspaceShell.show('home');
      return { ok: true };
    } catch (error) { return { ok: false, message: String(error?.message || 'The season could not be created.') }; }
  }

  /** Explicit metadata correction for the open program season: only the
   *  year, level and generated name; never the season id, games, roster or
   *  film. A scout's identity is its opponent, corrected through
   *  `createScout`'s form. */
  updateSeasonDetails(values) {
    return this._changeSeason(current => this._updateSeasonDetails(values, current), this._store()?.currentSeasonId);
  }

  async _updateSeasonDetails({ year = '', level = '' }, current) {
    const store = this._store();
    if (!store?.hasCurrent?.() || store.data?.kind === 'scout') return { ok: false, message: 'Open a program season to edit its details.' };
    const cleanYear = String(year || '').trim();
    const cleanLevel = String(level || '').trim() || 'Varsity';
    if (!/^\d{4}$/.test(cleanYear)) return { ok: false, message: 'Enter a four-digit year.' };
    const duplicate = await this._findDuplicateSeason(cleanYear, cleanLevel, store.currentSeasonId);
    if (!current()) return { ok: false, message: 'The workspace changed. Reopen the form and try again.' };
    if (duplicate) return { ok: false, message: `${cleanYear} · ${cleanLevel} already exists.`, duplicateId: duplicate.id, duplicateName: duplicate.name };
    const data = store.data;
    const before = {year:data.year, level:data.level, seasonName:data.seasonName};
    store.data.year = cleanYear;
    store.data.level = cleanLevel;
    store.data.seasonName = seasonIdentity(cleanYear, this._state.profile.teamName, cleanLevel);
    this._storage().commitActive();
    const saved = await store.persist();
    if (saved === false) {
      Object.assign(data, before);
      return { ok: false, message: 'Season details could not be saved. Nothing changed.' };
    }
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return { ok: true };
  }

  openEditSeason(invoker) {
    const store = this._store();
    if (!store?.hasCurrent?.() || store.data?.kind === 'scout') {
      this.overlays.toast({ tone: 'info', message: 'Open a program season to edit its details.' });
      return Promise.resolve(false);
    }
    let handle;
    handle = this.overlays.dialog({
      id: 'team-hub-edit-season', title: 'Edit season details', returnFocus: invoker, actions: [],
      content: h(EditSeasonForm, {
        year: store.data.year || '', level: store.data.level || 'Varsity', teamName: this._state.profile.teamName || '',
        onCancel: () => handle.close('cancel'),
        onOpenExisting: async id => { handle.close('open-existing'); await this.openSeason(id); },
        onSubmit: async values => { const result = await this.updateSeasonDetails(values); if (result.ok) handle.close('saved'); return result; },
      }),
    });
    return handle.result;
  }

  /** Desktop-only check for the explicit recovery flow. Synchronous, because
   *  the JSX render reads it. */
  canRecoverSeasons() { return !!this._storage()?.canRecoverSeasons?.(); }

  /** Explicit recovery: fetch the preview once and hand it to a dialog the
   *  coach confirms row by row. Never automatic. Each confirmed recovery
   *  reloads Team Hub so the season appears immediately. */
  async recoverSeasons(invoker) {
    const candidates = await this._storage().scanRecoverableSeasons();
    if (!candidates.length) {
      await this.overlays.dialog({
        title: 'No recoverable seasons found', returnFocus: invoker,
        message: 'No Documents-mirror recovery snapshots were found on this machine.',
        actions: [{ key: 'ok', label: 'Got it', default: true }],
      }).result;
      return false;
    }
    const handle = this.overlays.dialog({
      id: 'team-hub-recover-seasons', title: 'Recover seasons', returnFocus: invoker,
      actions: [{ key: 'close', label: 'Close', default: true }],
      content: h(RecoverSeasonsForm, {
        candidates,
        onRecover: async (candidate, confirmOverwrite) => {
          const result = await this._storage().recoverSeasonFromMirror(candidate.id, { confirmOverwrite });
          if (result?.ok) await this.load();
          return result;
        },
      }),
    });
    await handle.result;
    return true;
  }

  /** Resolves against the COMPLETE team collection, not the main-panel
   *  filtered one: the persistent Home rail lists every program season and
   *  every opponent scout at once, so a coach in Opponent Scout mode
   *  clicking a program-season row must open it. Resolving from the filtered
   *  list would make exactly those rows dead. */
  _findSeasonRow(id) {
    const wanted = String(id);
    return (this._state.railSeasons || []).find(season => season.id === wanted)
      || this._state.seasons.find(season => season.id === wanted)
      || null;
  }

  async openSeason(id) {
    const row = this._findSeasonRow(id);
    if (!row) return false;
    try {
      // "Already open?" is answered by the LIVE STORE, never by the row's cached
      // `current` flag. A rail row carries the flag from the `load()` that built
      // it, and `load()` cancels itself when a newer one starts (`_loadToken`),
      // so a superseded pass leaves rows still flagged current for a season the
      // coach has since navigated away from. Trusting that flag made this method
      // skip the open entirely and report success -- the rail row looked dead,
      // intermittently, depending on which load won the race.
      const alreadyOpen = String(this._store()?.currentSeasonId || '') === String(row.id);
      // Fail closed on a REFUSED open too, not only on a thrown one: the store
      // returns false when a legacy roster migration conflict blocks the season,
      // and the prior season is still the live one, so navigating would show
      // Home for a season the coach did not open. It reports its own message.
      if (!alreadyOpen && (await this._storage().openSeasonById(row.id)) === false) {
        await this.load();
        return false;
      }
      // Opening a season sets the parent context at its one owner: a program
      // season is its own parent, and a scout adopts the parent it stores.
      const mode = row.kind === 'scout' ? 'scout' : 'program';
      this._context()?.adoptOpenedSeason(this._store()?.data || { id: row.id, kind: row.kind });
      this._state.workspaceMode = this._context()?.workspaceMode?.() || mode;
      await this.app.workspaceShell.show('home');
      return true;
    } catch (error) {
      this.overlays.toast({ tone: 'error', message: 'Could not open that season. Your current season is unchanged.' });
      await this.load();
      return false;
    }
  }

  async deleteSeason(id, invoker) {
    const row = this._state.seasons.find(season => season.id === String(id))
      || (this._state.railSeasons || []).find(season => season.id === String(id));
    if (!row) return false;
    /* A program season that OWNS scouts cannot be deleted out from under them.
       Cascading would destroy charted opponent film the coach never asked to
       lose, and deleting the parent alone would strand its scouts: they would
       name an id that resolves to nothing and drop out of every parent-scoped
       list. So the delete is BLOCKED with the count and the two ways forward.
       Only EXPLICIT owners block -- a legacy scout merely inferred to this
       season is not durably owned by it, and losing that inference moves it into
       the unassigned workflow, which is visible and recoverable. */
    if (!row.isScout) {
      const owned = (await this._ownedScouts(row.id));
      if (owned.length) {
        await this.overlays.dialog({
          title: `${row.name} has ${owned.length} opponent scout${owned.length === 1 ? '' : 's'}`,
          returnFocus: invoker,
          message: `Reassign or delete ${owned.length === 1 ? 'it' : 'them'} first: ${owned.map(scout => scout.name).join(', ')}. Deleting this season now would leave that scouting film with no season.`,
          actions: [{ key: 'close', label: 'Close', default: true }],
        }).result;
        return false;
      }
    }
    const linkedCopy = row.isDemo
      ? 'Your teams, roster, and other seasons are untouched.'
      : 'Managed film copies stored by GridIron IQ for this season are also removed. Linked original folders are never deleted.';
    const impact = `${row.gameCount} game${row.gameCount === 1 ? '' : 's'} and ${row.playCount} play${row.playCount === 1 ? '' : 's'} will be removed. ${linkedCopy}`;
    // J8 — the sample season is disposable and regenerable, so it keeps the
    // ordinary confirm. A real season does not: it is the largest destructible
    // object in the product and there is no undo for it.
    let choice;
    if (row.isDemo) {
      choice = await this.overlays.dialog({
        title: 'Remove sample season?', destructive: true, returnFocus: invoker, message: impact,
        actions: [
          { key: 'cancel', label: 'Cancel', default: true },
          { key: 'delete', label: 'Remove sample', tone: 'danger' },
        ],
      }).result;
    } else {
      const handle = this.overlays.dialog({
        title: `Delete ${row.name}?`, destructive: true, returnFocus: invoker,
        initialFocus: '[name="confirm"]',
        actions: [{ key: 'cancel', label: 'Cancel', default: true }],
        content: h(ConfirmDeleteForm, {
          impact, confirmLabel: 'Delete season',
          onSubmit: async () => { handle.close('delete'); return { ok: true }; },
        }),
      });
      choice = await handle.result;
    }
    if (choice !== 'delete') return false;
    const deleted = await this._storage().deleteSeason(row.id);
    if (deleted === false) { await this.load(); return false; }
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async removeActiveTeam(invoker) {
    const id = this._state.activeTeamId;
    const team = this._state.teams.find(item => item.id === id);
    if (!team) return false;
    if (this._state.allTeamSeasonCount) {
      await this.overlays.dialog({
        title: 'Team still has seasons', returnFocus: invoker,
        message: `${team.teamName} owns ${this._state.allTeamSeasonCount} season${this._state.allTeamSeasonCount === 1 ? '' : 's'}. Delete or move those seasons before removing the team.`,
        actions: [{ key: 'ok', label: 'Got it', default: true }],
      }).result;
      return false;
    }
    const choice = await this.overlays.dialog({
      title: `Remove ${team.teamName}?`, destructive: true, returnFocus: invoker,
      message: 'This removes the team identity. No seasons, rosters, or film are deleted.',
      actions: [{ key: 'cancel', label: 'Cancel', default: true }, { key: 'delete', label: 'Remove team', tone: 'danger' }],
    }).result;
    if (choice !== 'delete') return false;
    const rest = this._state.teams.filter(item => item.id !== id);
    this._registry().saveTeams(rest);
    try { localStorage.removeItem(this._registry().playbookKey(id)); } catch {}
    if (rest.length) {
      this._registry().setActiveTeamId(rest[0].id);
      this._registry().saveTeamProfile({ teamName: rest[0].teamName, school:rest[0].school || '', nickname:rest[0].nickname || '', jerseyColor: rest[0].jerseyColor || '' });
      this.app.roster?.loadFrom?.([], { persist: false });
    } else {
      this._registry().clearIdentity();
      this.app.roster?.loadFrom?.([], { persist: false });
    }
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async exploreSample() {
    try {
      const loaded = await this._storage().loadDemoSeason();
      if (loaded == null) throw new Error('Demo storage failed');
      await this.app.workspaceShell.show('home');
      return true;
    } catch {
      this.overlays.toast({ tone: 'error', message: 'Could not load the sample season. Nothing else changed.' });
      return false;
    }
  }
}
