/**
 * TeamRegistry — the team/season identity layer, extracted from SeasonLibrary.
 *
 * WHY THIS EXISTS (S7-c). SeasonLibrary is the legacy Team Hub overlay, and the
 * overlay itself is dead — nothing opens it. But the module is NOT dead: the
 * native Team Hub reaches into TWELVE of its private members for the team
 * registry, team switching, season scoping, roster keys, post-wipe recovery and
 * checklist state, and settings/workspace-context reach in for three more.
 * Deleting the file on "the overlay is unreachable" would have taken team
 * switching and wipe recovery with it.
 *
 * So the data layer moves here first and the overlay becomes the by-product.
 *
 * CONTRACT
 * - No DOM. Not one getElementById, not one class toggle. Presentation belongs
 *   to whoever calls this.
 * - Public API. The native screens stop reaching through `_`-prefixed privates
 *   of a presentation object.
 * - Dependencies are injected, so the whole surface is testable without a page.
 *
 * STORAGE KEYS OWNED HERE
 *   ffa_teams             registry [{id, teamName, jerseyColor}]
 *   ffa_active_team_id    which one is active
 *   ffa_team_profile      the ACTIVE team's profile — every existing reader
 *                         (Game Info sync, checklist, commitActive) keeps
 *                         working unchanged; switching teams rewrites it
 *   ffa_roster_<teamId>   per-team roster snapshot (live ffa_roster is active)
 *   ffa_playbook_<teamId> durable call definitions mirrored into season files
 *   ffa_checklist_dismissed
 * Seasons carry `teamId` in their library meta; metas without one are legacy
 * and belong to the first team.
 */
export class TeamRegistry {
  /**
   * @param {object}   deps
   * @param {function} deps.app        () => the app root, for storage/roster/tagger reads.
   * @param {function} [deps.syncGame] (profile) => void — propagate team identity
   *                                   into the active game's canonical metadata.
   *                                   Injected because that write is app-owned.
   * @param {function} [deps.notify]   (message) => void — coach-visible message.
   */
  constructor({ app, syncGame, notify } = {}) {
    this._appRef = typeof app === 'function' ? app : () => app;
    this._syncGame = typeof syncGame === 'function' ? syncGame : null;
    this._notify = typeof notify === 'function' ? notify : null;
  }

  _app() { try { return this._appRef(); } catch (e) { return null; } }
  _storage() { return this._app()?.storage || null; }

  // ---------------------------------------------------------------- reads --

  teamProfile() {
    try { return JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}; } catch (e) { return {}; }
  }

  hasTeam() { return !!this.teamProfile().teamName; }

  teams() {
    try { return JSON.parse(localStorage.getItem('ffa_teams') || '[]') || []; } catch (e) { return []; }
  }

  activeTeamId() {
    try { return localStorage.getItem('ffa_active_team_id') || ''; } catch (e) { return ''; }
  }

  rosterKey(id) { return 'ffa_roster_' + id; }
  playbookKey(id) { return 'ffa_playbook_' + id; }

  /** A team id that does not collide with `existingIds`. */
  newTeamId(name, existingIds = []) {
    const base = String(name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
    let id = base, n = 2;
    while (existingIds.includes(id)) id = `${base}-${n++}`;
    return id;
  }

  /**
   * Seasons belonging to a team. Legacy metas without a teamId resolve to the
   * first team, and so do metas stamped with a teamId NO registry team owns —
   * a registry rebuilt after a storage wipe gets new ids, and a season that
   * exists on disk must never become invisible.
   */
  seasonsForTeam(seasons, teamId) {
    const teams = this.teams();
    const firstId = (teams[0] || {}).id || '';
    const known = new Set(teams.map(t => t.id));
    return (seasons || []).filter(s => {
      const tid = (s.teamId && known.has(s.teamId)) ? s.teamId : firstId;
      return tid === teamId;
    });
  }

  // ------------------------------------------------------------ mutations --

  saveTeams(arr) {
    try { localStorage.setItem('ffa_teams', JSON.stringify(arr)); } catch (e) {}
  }

  saveTeamProfile(profile) {
    try { localStorage.setItem('ffa_team_profile', JSON.stringify(profile)); } catch (e) {}
  }

  setActiveTeamId(id) {
    try { localStorage.setItem('ffa_active_team_id', String(id || '')); } catch (e) {}
  }

  /**
   * Rename / recolor the active team. Writes the profile, mirrors it into the
   * registry entry, and propagates the two identity fields into the active
   * game's canonical metadata through the injected hook.
   *
   * The hook matters: this used to write through the hidden #gameTeamName /
   * #gameJerseyColor inputs inside #app, which S7-d deletes — it would have
   * become a silent no-op that still reported success.
   *
   * Returns true when the identity was saved. Presentation is the caller's.
   */
  saveTeamIdentity(name, jerseyColor = '') {
    const clean = String(name || '').trim();
    if (!clean) return false;
    const profile = { ...this.teamProfile(), teamName: clean, jerseyColor: String(jerseyColor || '') };
    this.saveTeamProfile(profile);
    const teams = this.teams();
    const active = teams.find(team => team.id === this.activeTeamId());
    if (active) {
      active.teamName = clean;
      active.jerseyColor = profile.jerseyColor;
      this.saveTeams(teams);
    }
    if (this._syncGame) this._syncGame(profile);
    return true;
  }

  /**
   * Removing the last team returns the app to first run. Every identity key
   * this service owns is cleared together — leaving one behind is what
   * produced the "registry without a profile" state `ensureRegistry()` has to
   * self-heal. Season files are NOT touched.
   */
  clearIdentity() {
    for (const key of ['ffa_team_profile', 'ffa_active_team_id', 'ffa_checklist_dismissed', 'ffa_seen_stats']) {
      try { localStorage.removeItem(key); } catch (e) {}
    }
  }

  // ------------------------------------------------------------- lifecycle --

  /**
   * One-time migration + reconcile. Run before reading the registry.
   * - A pre-registry install (single ffa_team_profile) becomes the first
   *   registry team, owning the existing roster and all existing seasons.
   * - A registry with no active profile (partial clear / old bug) re-adopts a
   *   team, so pills and profile never disagree.
   * - Game Info edits write ffa_team_profile directly, so mirror those back
   *   into the active registry entry or the pills show a stale name/color.
   */
  ensureRegistry() {
    let teams = this.teams();
    const profile = this.teamProfile();
    if (!teams.length && profile.teamName) {
      const t = { id: this.newTeamId(profile.teamName, []), teamName: profile.teamName, jerseyColor: profile.jerseyColor || '' };
      teams = [t];
      this.saveTeams(teams);
      this.setActiveTeamId(t.id);
      try { localStorage.setItem(this.rosterKey(t.id), localStorage.getItem('ffa_roster') || '[]'); } catch (e) {}
      return;
    }
    if (teams.length && !profile.teamName) {
      const first = teams.find(t => t.id === this.activeTeamId()) || teams[0];
      this.setActiveTeamId(first.id);
      this.saveTeamProfile({ teamName: first.teamName, jerseyColor: first.jerseyColor || '' });
      return;
    }
    const active = teams.find(t => t.id === this.activeTeamId());
    if (active && profile.teamName &&
        (active.teamName !== profile.teamName || (active.jerseyColor || '') !== (profile.jerseyColor || ''))) {
      active.teamName = profile.teamName;
      active.jerseyColor = profile.jerseyColor || '';
      this.saveTeams(teams);
    }
  }

  /**
   * Post-wipe auto-recovery. A desktop app update (or a browser storage clear
   * that spares the season files) can wipe localStorage — registry, profile,
   * roster — while the seasons survive on disk. Without this the app showed
   * FIRST-RUN SETUP over the coach's data, and the rebuilt registry's new
   * teamId matched no season, so every season was filtered out of view. That
   * was field-reported as "you deleted my season".
   *
   * Each season file carries teamProfile + roster, so identity is fully
   * reconstructable: rebuild one registry entry per distinct stamped teamId,
   * KEEPING the original ids so the metas still match.
   */
  async recoverFromWipe() {
    try {
      if (this.teams().length || this.hasTeam()) return false;  // identity intact
      const store = this._storage()?.seasonStore;
      if (!store) return false;
      const metas = await store.listSeasons();
      if (!metas || !metas.length) return false;                // true first run
      // Recovery is read-only. Never borrow the backend's mutable currentId;
      // an autosave during that window could route one season into another.
      const peek = async (id) => {
        try { return await store.peekSeason(id); }
        catch (e) { return null; }
      };
      const newestFirst = metas.slice().sort((a, b) =>
        (b.openedAt || b.created || 0) - (a.openedAt || a.created || 0));
      // Group by stamped teamId ('' = legacy/unstamped) so a multi-team install
      // recovers every hub, not just the active one.
      const groups = new Map();
      newestFirst.forEach(m => {
        const tid = m.teamId || '';
        if (!groups.has(tid)) groups.set(tid, []);
        groups.get(tid).push(m);
      });
      const teams = [];
      const rosters = {};
      const playbooks = {};
      for (const [tid, group] of groups) {
          let profile = null, roster = null, playbook = null;
          for (const m of group) {                 // newest first wins per durable field
            const data = await peek(m.id);
            if (!data) continue;
            if (roster === null && Array.isArray(data.roster)) roster = data.roster;
            if (playbook === null && data.playbook && Array.isArray(data.playbook.calls)) playbook = data.playbook;
            if (!profile && data.teamProfile && data.teamProfile.teamName) profile = data.teamProfile;
            if (profile && roster !== null && playbook !== null) break;
          }
          const name = (profile && profile.teamName) || group[0].name || 'My Team';
          const id = tid || this.newTeamId(name, teams.map(t => t.id));
          teams.push({ id, teamName: name, jerseyColor: (profile && profile.jerseyColor) || '' });
          if (roster !== null) rosters[id] = roster;
        if (playbook !== null) playbooks[id] = playbook;
      }
      if (!teams.length) return false;
      this.saveTeams(teams);
      this.setActiveTeamId(teams[0].id);
      this.saveTeamProfile({ teamName: teams[0].teamName, jerseyColor: teams[0].jerseyColor || '' });
      Object.entries(rosters).forEach(([id, roster]) => {
        try { localStorage.setItem(this.rosterKey(id), JSON.stringify(roster)); } catch (e) {}
      });
      Object.entries(playbooks).forEach(([id, playbook]) => {
        try {
          const library = this._app()?.playbook;
          if (library?.replace) library.replace(playbook, id);
          else localStorage.setItem(this.playbookKey(id), JSON.stringify(playbook));
        } catch (e) {}
      });
      // Live roster = the active team's. Refresh RosterManager's in-memory copy
      // too, or its next _save() would clobber the recovery with [].
      const rm = this._app()?.roster;
      const liveEmpty = !(rm && rm.players && rm.players.length);
      if (liveEmpty && rosters[teams[0].id]) {
        try { localStorage.setItem('ffa_roster', JSON.stringify(rosters[teams[0].id])); } catch (e) {}
        if (rm) { rm._load(); rm.renderList(); rm.renderQuickPick(); }
      }
      console.warn('GridIron IQ: rebuilt team identity from season files after a storage wipe.');
      if (this._notify) this._notify('Recovered your team, seasons, and roster from disk.');
      return true;
    } catch (e) {
      console.warn('Wipe recovery failed:', e);
      return false;
    }
  }

  // -------------------------------------------------------------- checklist --

  checklistDismissed() {
    try { return localStorage.getItem('ffa_checklist_dismissed') === '1'; } catch (e) { return false; }
  }

  dismissChecklist() {
    try { localStorage.setItem('ffa_checklist_dismissed', '1'); } catch (e) {}
  }

  /**
   * Progressive onboarding state. Sample-season data must never check off a
   * real-data milestone, and loading a video auto-creates placeholder plays —
   * so "tagged" means the coach actually applied a tag.
   */
  checklistItems(seasons) {
    const app = this._app();
    const profile = this.teamProfile();
    const roster = app?.roster?.players || [];
    const storage = this._storage();
    const realSeasons = (seasons || []).filter(s => !storage?.isDemoSeason?.(s.id) && !s.isDemo && s.kind !== 'demo');
    // Season-meta play counts lag a debounced autosave, so also consult the
    // live tagger when a real season is open (a play tagged seconds ago counts).
    const store = storage?.seasonStore;
    const hasRealTag = p => p?.tags && (p.tags.playType || p.tags.runPass || p.tags.result || p.tags.formation);
    const liveTagged = store?.hasCurrent() && !storage.isDemoSeason(store.currentSeasonId)
      && (app?.tagger?.plays || []).some(hasRealTag);
    const taggedAnywhere = liveTagged || realSeasons.some(s => (s.plays || 0) > 0 && s.id !== store?.currentSeasonId);
    let seenStats = false;
    try { seenStats = localStorage.getItem('ffa_seen_stats') === '1'; } catch (e) {}
    return [
      { step: 'team',   label: 'Set up your team',     done: !!profile.teamName },
      { step: 'roster', label: 'Add your roster',      done: roster.length > 0 },
      { step: 'season', label: 'Start a season',       done: realSeasons.length > 0 },
      { step: 'play',   label: 'Tag your first play',  done: taggedAnywhere },
      { step: 'stats',  label: 'See your stats',       done: seenStats },
    ];
  }
}
