import { h } from 'preact';
import { mountNativeTeamHub, AddTeamForm, CreateSeasonForm, ConfirmDeleteForm } from './native-team-hub.jsx';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

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
    this._state = { status: 'idle', teams: [], seasons: [], activeTeamId: '', currentSeasonId: '', profile: {}, checklist: { visible: false, items: [], doneCount: 0 }, error: '' };
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
      const seasons = teams.length ? registry.seasonsForTeam(allSeasons, activeTeamId) : [];
      const currentSeasonId = this._store()?.currentSeasonId || '';
      // Season rows render immediately from list metadata (name, counts,
      // current) so a large library or a slow film check never blocks Team
      // Hub from appearing. Film health resolves in the background per row
      // (S8-1) — every row starts 'checking' and is patched in place once its
      // real status is known, instead of a permanent, honest-sounding-but-
      // wrong "not checked" placeholder that never resolves for a season the
      // coach has not personally reopened this session.
      const rows = seasons.map(season => this._seasonRowShell(season, currentSeasonId));
      const items = teams.length ? registry.checklistItems(seasons) : [];
      const doneCount = items.filter(item => item.done).length;
      const checklist = { items, doneCount, visible: !!teams.length && !!items.length && doneCount < items.length && !registry.checklistDismissed() };
      if (token !== this._loadToken) return false;
      this._set({ status: 'ready', teams, seasons: rows, activeTeamId, currentSeasonId, profile, checklist, error: '' });
      this._verifyFilmHealth(rows, currentSeasonId, token);
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
      team: meta.team || '', gameCount, playCount, current, isDemo: this._storage().isDemoSeason(meta.id) || meta.isDemo || meta.kind === 'demo',
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
      const film = await this._aggregateFilm(games);
      if (token !== this._loadToken) return;
      this._set({ seasons: this._state.seasons.map(season => String(season.id) === String(row.id) ? { ...season, film } : season) });
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

  async _aggregateFilm(games) {
    // Peek failed (unreadable file, race with a delete) — stay honest rather
    // than claim "no film linked" for a season we could not actually read.
    if (!Array.isArray(games)) return { state: 'checking', label: 'Checking film…', expected: 0, found: 0, missing: 0 };
    if (!games.length) return { state: 'none', label: 'No games yet', expected: 0, found: 0, missing: 0 };
    const health = await Promise.all(games.map(game => this.app.workspace.filmHealth(game).catch(() => ({ state: 'missing', expected: 0, found: 0, missing: 0 }))));
    const expected = health.reduce((sum, item) => sum + (item.expected || 0), 0);
    const found = health.reduce((sum, item) => sum + (item.found || (item.ready ? item.expected || 0 : 0)), 0);
    const missing = health.reduce((sum, item) => sum + (item.missing || 0), 0);
    const gamesLinked = health.filter(item => item.ready).length;
    if (!expected) return { state: 'none', label: 'No film linked', expected, found, missing };
    if (health.some(item => item.state === 'unauthorized' || item.action === 'reconnect')) return { state: 'missing', label: 'Film needs attention', expected, found, missing };
    if (missing || health.some(item => item.state === 'missing')) return { state: 'partial', label: `${gamesLinked} of ${games.length} game${games.length === 1 ? '' : 's'} linked`, expected, found, missing };
    if (health.every(item => item.ready)) return { state: 'ready', label: 'Film linked', expected, found: expected, missing: 0 };
    return { state: 'checking', label: 'Checking film…', expected, found, missing };
  }

  close() { return this.app.workspaceShell?.closeTeamHub?.(); }

  openSettings(invoker) { return this.app.settingsScreen?.open?.({ returnFocus: invoker }); }
  openRoster(invoker = null) { return this.app.settingsScreen?.open?.({ initialTab:'roster', returnFocus:invoker || document.activeElement }); }

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
    const previousId = this._registry().activeTeamId() || '';
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
    if (previousId) {
      try { localStorage.setItem(this._registry().rosterKey(previousId), localStorage.getItem('ffa_roster') || '[]'); } catch {}
    }
    this._registry().setActiveTeamId(id);
    this._registry().saveTeamProfile({ teamName: next.teamName, jerseyColor: next.jerseyColor || '' });
    let roster = [];
    try { roster = JSON.parse(localStorage.getItem(this._registry().rosterKey(id)) || '[]') || []; } catch {}
    this.app.roster?.loadFrom?.(roster);
    this.app.customChips?.reload?.();
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async addTeam({ name, jerseyColor = '' }) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, message: 'Enter a team name.' };
    const registry = this._registry();
    const teams = registry.teams();
    const team = { id: registry.newTeamId(clean, teams.map(item => item.id)), teamName: clean, jerseyColor: String(jerseyColor || '') };
    registry.saveTeams([...teams, team]);
    try { localStorage.setItem(registry.rosterKey(team.id), teams.length ? '[]' : (localStorage.getItem('ffa_roster') || '[]')); } catch {}
    if (teams.length) {
      const switched = await this.switchTeam(team.id);
      if (!switched) {
        registry.saveTeams(teams);
        try { localStorage.removeItem(registry.rosterKey(team.id)); } catch {}
        return { ok: false, message: 'The new team was not added because the open season could not be saved.' };
      }
    } else {
      registry.setActiveTeamId(team.id);
      registry.saveTeamProfile({ teamName: team.teamName, jerseyColor: team.jerseyColor });
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

  openCreateSeason(invoker) {
    if (!this._state.activeTeamId) return this.openAddTeam(invoker);
    let handle;
    handle = this.overlays.dialog({
      id: 'team-hub-create-season', title: 'Create season', returnFocus: invoker, actions: [],
      content: h(CreateSeasonForm, {
        teamName: this._state.profile.teamName || '',
        onCancel: () => handle.close('cancel'),
        onSubmit: async values => { const result = await this.createSeason(values); if (result.ok) handle.close('created'); return result; },
      }),
    });
    return handle.result;
  }

  async createSeason({ name, year = '', level = '' }) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, message: 'Enter a season name.' };
    try {
      const rec = await this._storage().createSeason({
        name: clean, year: String(year || '').trim(), level: String(level || '').trim(),
        team: this._state.profile.teamName || '', teamId: this._state.activeTeamId,
      });
      if (!rec) return { ok: false, message: 'The season could not be created. Nothing changed.' };
      await this.app.workspaceShell.show('home');
      return { ok: true };
    } catch (error) { return { ok: false, message: String(error?.message || 'The season could not be created.') }; }
  }

  async openSeason(id) {
    const row = this._state.seasons.find(season => season.id === String(id));
    if (!row) return false;
    try {
      if (!row.current) await this._storage().openSeasonById(row.id);
      await this.app.workspaceShell.show('home');
      return true;
    } catch (error) {
      this.overlays.toast({ tone: 'error', message: 'Could not open that season. Your current season is unchanged.' });
      await this.load();
      return false;
    }
  }

  async deleteSeason(id, invoker) {
    const row = this._state.seasons.find(season => season.id === String(id));
    if (!row) return false;
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
    if (this._state.seasons.length) {
      await this.overlays.dialog({
        title: 'Team still has seasons', returnFocus: invoker,
        message: `${team.teamName} owns ${this._state.seasons.length} season${this._state.seasons.length === 1 ? '' : 's'}. Delete or move those seasons before removing the team.`,
        actions: [{ key: 'ok', label: 'Got it', default: true }],
      }).result;
      return false;
    }
    const choice = await this.overlays.dialog({
      title: `Remove ${team.teamName}?`, destructive: true, returnFocus: invoker,
      message: 'This removes the team identity and its roster snapshot. No seasons or film are deleted.',
      actions: [{ key: 'cancel', label: 'Cancel', default: true }, { key: 'delete', label: 'Remove team', tone: 'danger' }],
    }).result;
    if (choice !== 'delete') return false;
    const rest = this._state.teams.filter(item => item.id !== id);
    this._registry().saveTeams(rest);
    try { localStorage.removeItem(this._registry().rosterKey(id)); } catch {}
    try { localStorage.removeItem(this._registry().playbookKey(id)); } catch {}
    if (rest.length) {
      this._registry().setActiveTeamId(rest[0].id);
      this._registry().saveTeamProfile({ teamName: rest[0].teamName, jerseyColor: rest[0].jerseyColor || '' });
      let roster = [];
      try { roster = JSON.parse(localStorage.getItem(this._registry().rosterKey(rest[0].id)) || '[]') || []; } catch {}
      this.app.roster?.loadFrom?.(roster);
    } else {
      this._registry().clearIdentity();
      this.app.roster?.loadFrom?.([]);
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