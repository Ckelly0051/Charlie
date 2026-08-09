import { h } from 'preact';
import { mountNativeTeamHub, AddTeamForm, CreateSeasonForm, ConfirmDeleteForm } from './native-team-hub.jsx';

const clone = value => value == null ? value : JSON.parse(JSON.stringify(value));

/** Native Team Hub controller. SeasonLibrary remains a temporary registry/data
 * helper during S3, but it no longer owns presentation or route visibility. */
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
  _library() { return this.app.library; }
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
      const library = this._library();
      await library?._recoverFromWipe?.();
      library?._ensureTeamRegistry?.();
      const teams = library?._teams?.() || [];
      const activeTeamId = library?._activeTeamId?.() || teams[0]?.id || '';
      const profile = library?._teamProfile?.() || {};
      const allSeasons = await this._storage().listSeasons();
      const seasons = teams.length ? library._teamSeasons(allSeasons, activeTeamId) : [];
      const currentSeasonId = this._store()?.currentSeasonId || '';
      const rows = await Promise.all(seasons.map(season => this._seasonRow(season, currentSeasonId)));
      const items = teams.length ? library._checklistItems(seasons) : [];
      const doneCount = items.filter(item => item.done).length;
      const checklist = { items, doneCount, visible: !!teams.length && !!items.length && doneCount < items.length && !library._checklistDismissed() };
      if (token !== this._loadToken) return false;
      this._set({ status: 'ready', teams, seasons: rows, activeTeamId, currentSeasonId, profile, checklist, error: '' });
      return true;
    } catch (error) {
      if (token !== this._loadToken) return false;
      this._set({ status: 'error', error: String(error?.message || error || 'Could not load teams and seasons.') });
      return false;
    }
  }

  async _seasonRow(meta, currentSeasonId) {
    const current = String(meta.id) === String(currentSeasonId);
    const live = current ? this._store()?.data : null;
    const games = live?.games || null;
    const gameCount = games ? games.length : Number(meta.games) || 0;
    const playCount = games ? games.reduce((sum, game) => sum + (game.plays?.length || 0), 0) : Number(meta.plays) || 0;
    // J6 — "Open to check film" described an app action and named film, when
    // the subject of the row is the season and this cell is a STATE. It also
    // read as a second command competing with the real `Open →` button beside
    // it. Film health for a closed season genuinely is not known until it is
    // opened, so the honest label says that rather than instructing.
    let film = { state: 'checking', label: current ? 'Checking film' : 'Not checked yet', expected: 0, found: 0, missing: 0 };
    if (games) film = await this._aggregateFilm(games);
    return {
      id: String(meta.id), name: meta.name || 'Untitled Season', year: meta.year || '', level: meta.level || '',
      team: meta.team || '', gameCount, playCount, current, isDemo: this._storage().isDemoSeason(meta.id) || meta.isDemo || meta.kind === 'demo',
      lastOpened: meta.lastOpened || meta.openedAt || meta.created || '', film,
    };
  }

  async _aggregateFilm(games) {
    if (!games.length) return { state: 'none', label: 'No games yet', expected: 0, found: 0, missing: 0 };
    const health = await Promise.all(games.map(game => this.app.workspace.filmHealth(game).catch(() => ({ state: 'missing', expected: 0, found: 0, missing: 0 }))));
    const expected = health.reduce((sum, item) => sum + (item.expected || 0), 0);
    const found = health.reduce((sum, item) => sum + (item.found || (item.ready ? item.expected || 0 : 0)), 0);
    const missing = health.reduce((sum, item) => sum + (item.missing || 0), 0);
    if (!expected) return { state: 'none', label: 'No film linked', expected, found, missing };
    if (health.some(item => item.state === 'unauthorized' || item.action === 'reconnect')) return { state: 'missing', label: 'Reconnect film', expected, found, missing };
    if (missing || health.some(item => item.state === 'missing')) return { state: 'partial', label: `${missing || Math.max(0, expected - found)} clips missing`, expected, found, missing };
    if (health.every(item => item.ready)) return { state: 'ready', label: 'Film ready', expected, found: expected, missing: 0 };
    return { state: 'checking', label: 'Checking film', expected, found, missing };
  }

  close() { return this.app.workspaceShell?.closeTeamHub?.(); }

  openSettings(invoker) { return this.app.settingsScreen?.open?.({ returnFocus: invoker }); }
  openRoster(invoker = null) { return this.app.settingsScreen?.open?.({ initialTab:'roster', returnFocus:invoker || document.activeElement }); }

  dismissChecklist() {
    try { localStorage.setItem('ffa_checklist_dismissed', '1'); } catch {}
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
    if (!id || id === this._library()?._activeTeamId?.()) return true;
    const teams = this._library()?._teams?.() || [];
    const next = teams.find(team => String(team.id) === id);
    if (!next) return false;
    const storage = this._storage();
    const store = this._store();
    const previousId = this._library()?._activeTeamId?.() || '';
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
      try { localStorage.setItem(this._library()._teamRosterKey(previousId), localStorage.getItem('ffa_roster') || '[]'); } catch {}
    }
    try { localStorage.setItem('ffa_active_team_id', id); } catch {}
    this._library()._saveTeamProfile({ teamName: next.teamName, jerseyColor: next.jerseyColor || '' });
    let roster = [];
    try { roster = JSON.parse(localStorage.getItem(this._library()._teamRosterKey(id)) || '[]') || []; } catch {}
    this.app.roster?.loadFrom?.(roster);
    this.app.customChips?.reload?.();
    await this.load();
    this.app.workspaceShell?._syncChrome?.();
    return true;
  }

  async addTeam({ name, jerseyColor = '' }) {
    const clean = String(name || '').trim();
    if (!clean) return { ok: false, message: 'Enter a team name.' };
    const library = this._library();
    const teams = library?._teams?.() || [];
    const team = { id: library._newTeamId(clean, teams.map(item => item.id)), teamName: clean, jerseyColor: String(jerseyColor || '') };
    library._saveTeams([...teams, team]);
    try { localStorage.setItem(library._teamRosterKey(team.id), teams.length ? '[]' : (localStorage.getItem('ffa_roster') || '[]')); } catch {}
    if (teams.length) {
      const switched = await this.switchTeam(team.id);
      if (!switched) {
        library._saveTeams(teams);
        try { localStorage.removeItem(library._teamRosterKey(team.id)); } catch {}
        return { ok: false, message: 'The new team was not added because the open season could not be saved.' };
      }
    } else {
      try { localStorage.setItem('ffa_active_team_id', team.id); } catch {}
      library._saveTeamProfile({ teamName: team.teamName, jerseyColor: team.jerseyColor });
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
    this._library()._saveTeams(rest);
    try { localStorage.removeItem(this._library()._teamRosterKey(id)); } catch {}
    if (rest.length) {
      try { localStorage.setItem('ffa_active_team_id', rest[0].id); } catch {}
      this._library()._saveTeamProfile({ teamName: rest[0].teamName, jerseyColor: rest[0].jerseyColor || '' });
      let roster = [];
      try { roster = JSON.parse(localStorage.getItem(this._library()._teamRosterKey(rest[0].id)) || '[]') || []; } catch {}
      this.app.roster?.loadFrom?.(roster);
    } else {
      for (const key of ['ffa_team_profile', 'ffa_active_team_id', 'ffa_checklist_dismissed', 'ffa_seen_stats']) {
        try { localStorage.removeItem(key); } catch {}
      }
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