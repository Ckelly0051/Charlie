/**
 * SeasonLibrary — the app's front door (team hub).
 *
 * The hierarchy is Team → Season → Games → Plays → Stats.
 * The library opens to the Team Home: a team identity card (name, jersey
 * color, roster count) with the seasons list below. Coaches start here,
 * drill into a season (schedule), then into a game (film + tagging).
 *
 * First-time users see a "Set up your team" prompt before anything else.
 * The team profile is stored in localStorage `ffa_team_profile`.
 */
export class SeasonLibrary {
  constructor() {
    this.overlay = document.getElementById('libraryOverlay');
    this.listEl = document.getElementById('libraryList');
    this.form = document.getElementById('librarySeasonForm');
    this._bind();
  }

  _storage() { return window.app && window.app.storage; }

  // ---- Team registry (multi-team: e.g. JV + Varsity on one device) ----
  //
  // `ffa_teams` is the registry [{id, teamName, jerseyColor}]; `ffa_active_team_id`
  // points at the active one. `ffa_team_profile` REMAINS the active team's
  // profile — every existing reader (breadcrumb, Game Info sync, checklist,
  // commitActive) keeps working unchanged; switching teams just rewrites it.
  // Each team owns a roster snapshot under `ffa_roster_<teamId>`; the live
  // `ffa_roster` is always the active team's (RosterManager untouched).
  // Seasons carry `teamId` in their library meta; metas without one (legacy)
  // belong to the first/migrated team.

  _teamProfile() {
    try { return JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}; } catch (e) { return {}; }
  }

  _saveTeamProfile(profile) {
    try { localStorage.setItem('ffa_team_profile', JSON.stringify(profile)); } catch (e) {}
  }

  _hasTeam() {
    const p = this._teamProfile();
    return !!(p.teamName);
  }

  _teams() {
    try { return JSON.parse(localStorage.getItem('ffa_teams') || '[]') || []; } catch (e) { return []; }
  }
  _saveTeams(arr) {
    try { localStorage.setItem('ffa_teams', JSON.stringify(arr)); } catch (e) {}
  }
  _activeTeamId() {
    try { return localStorage.getItem('ffa_active_team_id') || ''; } catch (e) { return ''; }
  }
  _teamRosterKey(id) { return 'ffa_roster_' + id; }

  /**
   * One-time migration + reconcile, run on every library open:
   * - A pre-registry install (single ffa_team_profile) becomes the first
   *   registry team, owning the existing roster and all existing seasons
   *   (legacy metas without teamId resolve to the first team).
   * - Game Info edits update ffa_team_profile directly (_saveTeamProfile in
   *   app.js) — mirror those edits back into the active registry entry so
   *   the pills never show a stale name/color.
   */
  _ensureTeamRegistry() {
    let teams = this._teams();
    const profile = this._teamProfile();
    if (!teams.length && profile.teamName) {
      const t = { id: this._newTeamId(profile.teamName, []), teamName: profile.teamName, jerseyColor: profile.jerseyColor || '' };
      teams = [t];
      this._saveTeams(teams);
      try { localStorage.setItem('ffa_active_team_id', t.id); } catch (e) {}
      // The pre-registry roster belongs to this team.
      try { localStorage.setItem(this._teamRosterKey(t.id), localStorage.getItem('ffa_roster') || '[]'); } catch (e) {}
      return;
    }
    // Self-heal: a registry without an active profile (partial clear / old
    // bug) re-adopts a team so the pills and profile never disagree.
    if (teams.length && !profile.teamName) {
      const first = teams.find(t => t.id === this._activeTeamId()) || teams[0];
      try { localStorage.setItem('ffa_active_team_id', first.id); } catch (e) {}
      this._saveTeamProfile({ teamName: first.teamName, jerseyColor: first.jerseyColor || '' });
      return;
    }
    const active = teams.find(t => t.id === this._activeTeamId());
    if (active && profile.teamName &&
        (active.teamName !== profile.teamName || (active.jerseyColor || '') !== (profile.jerseyColor || ''))) {
      active.teamName = profile.teamName;
      active.jerseyColor = profile.jerseyColor || '';
      this._saveTeams(teams);
    }
  }

  _newTeamId(name, existingIds) {
    const base = String(name || 'team').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'team';
    let id = base, n = 2;
    while (existingIds.includes(id)) id = `${base}-${n++}`;
    return id;
  }

  /**
   * Post-wipe auto-recovery. A desktop app update (or a browser storage
   * clear that spares the season files) can wipe localStorage — team
   * registry, profile, roster — while the seasons survive on disk. Without
   * this, the app showed FIRST-RUN SETUP over the coach's data and the
   * rebuilt registry's new teamId matched no season, so every season was
   * filtered out of view (field-reported as "you deleted my season").
   * Each season file carries teamProfile + roster, so identity is fully
   * reconstructable: rebuild a registry entry per distinct stamped teamId
   * (KEEPING the original ids so the metas still match), restore the
   * profile and roster, and never show setup over recoverable data.
   */
  async _recoverFromWipe() {
    try {
      if (this._teams().length || this._hasTeam()) return; // identity intact
      const store = this._storage()?.seasonStore;
      if (!store) return;
      const metas = await store.listSeasons();
      if (!metas || !metas.length) return;                 // true first run
      const backend = store.backend;
      const prevId = store.currentSeasonId || null;
      const peek = async (id) => {
        try { backend.setCurrentSeason(id); return await backend.loadSeason(); }
        catch (e) { return null; }
      };
      const newestFirst = metas.slice().sort((a, b) =>
        (b.openedAt || b.created || 0) - (a.openedAt || a.created || 0));
      // Group by stamped teamId ('' = legacy/unstamped) so multi-team
      // installs recover every hub, not just the active one.
      const groups = new Map();
      newestFirst.forEach(m => {
        const tid = m.teamId || '';
        if (!groups.has(tid)) groups.set(tid, []);
        groups.get(tid).push(m);
      });
      const teams = [];
      const rosters = {};
      for (const [tid, group] of groups) {
        let profile = null, roster = null;
        for (const m of group) {                 // newest first wins
          const data = await peek(m.id);
          if (!data) continue;
          if (!roster && Array.isArray(data.roster) && data.roster.length) roster = data.roster;
          if (data.teamProfile && data.teamProfile.teamName) { profile = data.teamProfile; break; }
        }
        const name = (profile && profile.teamName) || group[0].name || 'My Team';
        const id = tid || this._newTeamId(name, teams.map(t => t.id));
        teams.push({ id, teamName: name, jerseyColor: (profile && profile.jerseyColor) || '' });
        if (roster) rosters[id] = roster;
      }
      backend.setCurrentSeason(prevId);
      if (!teams.length) return;
      this._saveTeams(teams);
      try { localStorage.setItem('ffa_active_team_id', teams[0].id); } catch (e) {}
      this._saveTeamProfile({ teamName: teams[0].teamName, jerseyColor: teams[0].jerseyColor || '' });
      Object.entries(rosters).forEach(([id, roster]) => {
        try { localStorage.setItem(this._teamRosterKey(id), JSON.stringify(roster)); } catch (e) {}
      });
      // Live roster = active team's. Refresh RosterManager's in-memory copy
      // too, or its next _save() would clobber the recovery with [].
      const rm = window.app && window.app.roster;
      const liveEmpty = !(rm && rm.players && rm.players.length);
      if (liveEmpty && rosters[teams[0].id]) {
        try { localStorage.setItem('ffa_roster', JSON.stringify(rosters[teams[0].id])); } catch (e) {}
        if (rm) { rm._load(); rm.renderList(); rm.renderQuickPick(); }
      }
      console.warn('GridIron IQ: rebuilt team identity from season files after a storage wipe.');
      window.app?.history?._toast?.('Recovered your team, seasons, and roster from disk.');
    } catch (e) { console.warn('Wipe recovery failed:', e); }
  }

  /** Seasons belonging to a team (legacy metas without teamId → first team).
   *  Metas stamped with a teamId that NO registry team owns (registry was
   *  wiped by an app update / storage clear and rebuilt) also resolve to the
   *  first team — a season that exists on disk must never be invisible. */
  _teamSeasons(seasons, teamId) {
    const teams = this._teams();
    const firstId = (teams[0] || {}).id || '';
    const known = new Set(teams.map(t => t.id));
    return (seasons || []).filter(s => {
      const tid = (s.teamId && known.has(s.teamId)) ? s.teamId : firstId;
      return tid === teamId;
    });
  }

  /**
   * Switch the active team (e.g. JV ↔ Varsity). Commits + closes any open
   * season (it belongs to the outgoing team), snapshots the outgoing roster,
   * and loads the incoming team's profile + roster. Library stays open on
   * Team Home showing the incoming team's seasons.
   */
  async _setActiveTeam(id) {
    const teams = this._teams();
    const next = teams.find(t => t.id === id);
    if (!next || id === this._activeTeamId()) return;

    const storage = this._storage();
    const prevId = this._activeTeamId();
    // 1. Commit + persist + close the outgoing season (with its roster intact).
    if (storage?.seasonStore?.hasCurrent()) {
      storage.commitActive();
      storage.seasonStore.persist();
      storage.seasonStore.closeSeason();
      storage._clearForNewGame();
    }
    // 2. Snapshot the outgoing team's roster, then load the incoming one.
    if (prevId) {
      try { localStorage.setItem(this._teamRosterKey(prevId), localStorage.getItem('ffa_roster') || '[]'); } catch (e) {}
    }
    try { localStorage.setItem('ffa_active_team_id', id); } catch (e) {}
    this._saveTeamProfile({ teamName: next.teamName, jerseyColor: next.jerseyColor || '' });
    let roster = [];
    try { roster = JSON.parse(localStorage.getItem(this._teamRosterKey(id)) || '[]') || []; } catch (e) {}
    if (window.app?.roster) window.app.roster.loadFrom(roster);   // persists to ffa_roster

    this._syncGameInfoFromTeam({ teamName: next.teamName, jerseyColor: next.jerseyColor || '' });
    this._setLevel('seasons');   // also refreshes the header subtitle to the new team
    this._renderTeamCard();
    await this._render();
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  /** "+ Add Team" → show the setup form in adding mode (with a Cancel). */
  _showAddTeam() {
    this._addingTeam = true;
    this._showTeamEdit(false);   // don't stack the edit panel under the form
    const setup = document.getElementById('teamSetup');
    const card = document.getElementById('teamCard');
    const cancel = document.getElementById('btnTeamSetupCancel');
    const intro = setup?.querySelector('.library-intro');
    // Stash the first-run welcome copy so it can be restored if this team is
    // later removed and the app returns to first-run state.
    if (intro && !this._introOriginal) this._introOriginal = intro.textContent;
    // Always start blank — a leftover value from first-run setup would be
    // concatenated into the new team's name.
    const nameEl = document.getElementById('teamSetupName');
    const colorEl = document.getElementById('teamSetupColor');
    if (nameEl) nameEl.value = '';
    if (colorEl) colorEl.value = '';
    if (intro) intro.textContent = 'Add another team (e.g. your JV squad).';
    if (cancel) cancel.classList.remove('hidden');
    if (card) card.classList.add('hidden');
    if (setup) setup.classList.remove('hidden');
    setTimeout(() => document.getElementById('teamSetupName')?.focus(), 30);
  }

  _cancelAddTeam() {
    this._addingTeam = false;
    const cancel = document.getElementById('btnTeamSetupCancel');
    if (cancel) cancel.classList.add('hidden');
    const intro = document.querySelector('#teamSetup .library-intro');
    if (intro && this._introOriginal) intro.textContent = this._introOriginal;
    this._renderTeamCard();
  }

  /**
   * Remove the active team from the registry. Guarded: a team that still has
   * seasons can't be removed (delete its seasons first) — that keeps removal
   * non-destructive and unambiguous.
   */
  async _removeTeam() {
    const teams = this._teams();
    const id = this._activeTeamId();
    const team = teams.find(t => t.id === id);
    if (!team) return;
    let seasons = [];
    try { seasons = await this._storage().listSeasons(); } catch (e) {}
    const owned = this._teamSeasons(seasons, id);
    const tagger = window.app && window.app.tagger;
    if (owned.length) {
      const msg = `"${team.teamName}" still has ${owned.length} season${owned.length === 1 ? '' : 's'}. Delete them from the list first — removing a team never deletes its seasons silently.`;
      if (tagger && tagger._confirmDialog) await tagger._confirmDialog(msg, 'OK');
      else alert(msg);
      return;
    }
    const msg = `Remove "${team.teamName}"? Its roster snapshot is deleted. This team has no seasons.`;
    let ok = false;
    if (tagger && tagger._confirmDialog) ok = await tagger._confirmDialog(msg, 'Remove Team');
    else ok = confirm(msg);
    if (!ok) return;

    const rest = teams.filter(t => t.id !== id);
    this._saveTeams(rest);
    try { localStorage.removeItem(this._teamRosterKey(id)); } catch (e) {}
    this._showTeamEdit(false);
    if (rest.length) {
      try { localStorage.setItem('ffa_active_team_id', rest[0].id); } catch (e) {}
      this._saveTeamProfile({ teamName: rest[0].teamName, jerseyColor: rest[0].jerseyColor || '' });
      let roster = [];
      try { roster = JSON.parse(localStorage.getItem(this._teamRosterKey(rest[0].id)) || '[]') || []; } catch (e) {}
      if (window.app?.roster) window.app.roster.loadFrom(roster);
    } else {
      try { localStorage.removeItem('ffa_team_profile'); } catch (e) {}
      try { localStorage.removeItem('ffa_active_team_id'); } catch (e) {}
      try { localStorage.removeItem('ffa_checklist_dismissed'); } catch (e) {}
      try { localStorage.removeItem('ffa_seen_stats'); } catch (e) {}
      if (window.app?.roster) window.app.roster.loadFrom([]);
      // Back to first-run: restore the welcome copy "Add another team…"
      // replaced when _showAddTeam ran.
      const intro = document.querySelector('#teamSetup .library-intro');
      if (intro && this._introOriginal) intro.textContent = this._introOriginal;
    }
    this._renderTeamCard();
    await this._render();
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  _bind() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest && t.closest('#btnNewSeasonToggle')) { this._showForm(true); return; }
      if (t.closest && t.closest('#btnNewSeasonCancel')) { this._showForm(false); return; }
      if (t.closest && t.closest('#btnLibraryClose')) { this.hide(); return; }

      // Team setup
      if (t.closest && t.closest('#btnTeamSetupSave')) { this._saveTeamSetup(); return; }
      // First-run escape hatch: import a season file saved on another copy of
      // the app (desktop/web don't sync) WITHOUT having to create a team
      // first — the imported file carries the team identity.
      if (t.closest && t.closest('#btnSetupOpenFile')) {
        document.getElementById('projectFileInput')?.click();
        return;
      }

      // Team card actions
      if (t.closest && t.closest('#btnEditTeam')) { this._showTeamEdit(true); return; }
      if (t.closest && t.closest('#btnTeamEditSave')) { this._commitTeamEdit(); return; }
      if (t.closest && t.closest('#btnTeamEditCancel')) { this._showTeamEdit(false); return; }
      if (t.closest && t.closest('#btnTeamRemove')) { this._removeTeam(); return; }
      if (t.closest && t.closest('#btnTeamRoster')) { this._openRoster(); return; }

      // Team switcher pills (multi-team: JV / Varsity / …)
      if (t.closest && t.closest('#btnAddTeam')) { this._showAddTeam(); return; }
      if (t.closest && t.closest('#btnTeamSetupCancel')) { this._cancelAddTeam(); return; }
      const pill = t.closest && t.closest('.team-pill[data-team]');
      if (pill) { this._setActiveTeam(pill.dataset.team); return; }

      // Demo season + Get Started checklist
      if (t.closest && t.closest('#btnExploreDemo')) { this._exploreDemo(); return; }
      if (t.closest && t.closest('#gsDismiss')) { this._dismissChecklist(); return; }
      const gsItem = t.closest && t.closest('.gs-item:not(.done)');
      if (gsItem) { this._runChecklistAction(gsItem.dataset.step); return; }

      // Schedule level (the open season's games — the spine)
      if (t.closest && t.closest('#btnScheduleBack')) { this._setLevel('seasons'); this._render(); return; }
      if (t.closest && t.closest('#btnScheduleNewGame')) { this._newGameFromSchedule(); return; }
      const delGame = t.closest && t.closest('[data-del-game]');
      if (delGame) { this._deleteGameFromSchedule(delGame.dataset.delGame); return; }
      const schRow = t.closest && t.closest('.sch-row');
      if (schRow) { this._openGame(schRow.dataset.game); return; }

      const card = t.closest && t.closest('.season-card');
      if (card) {
        if (t.closest('[data-lib-del]')) { this._delete(card.dataset.id, card); return; }
        this._open(card.dataset.id);
      }
    });

    if (this.form) {
      this.form.addEventListener('submit', (e) => { e.preventDefault(); this._create(); });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this._isOpen() && this._storage()?.seasonStore.hasCurrent()) this.hide();
      // Checklist items are role=button tabindex=0 — honor Enter/Space.
      if ((e.key === 'Enter' || e.key === ' ') && e.target.closest) {
        const gsItem = e.target.closest('.gs-item:not(.done)');
        if (gsItem) { e.preventDefault(); this._runChecklistAction(gsItem.dataset.step); }
      }
    });
  }

  _isOpen() { return this.overlay && !this.overlay.classList.contains('hidden'); }

  /** Show the library at the TEAM HOME / SEASONS level. */
  async open() {
    if (!this.overlay) return;
    await this._recoverFromWipe();   // rebuild identity from disk post-update-wipe
    this._ensureTeamRegistry();
    this._setLevel('seasons');
    this._showForm(false);
    this._showTeamEdit(false);
    this._renderTeamCard();
    await this._render();
    this._updateCloseBtn();
    this.overlay.classList.remove('hidden');
  }

  /** Show the library at the SCHEDULE level (the open season's games). */
  async openSchedule() {
    const store = this._storage()?.seasonStore;
    if (!store || !store.hasCurrent()) return this.open();
    if (!this.overlay) return;
    this._setLevel('schedule');
    this._renderSchedule();
    this._updateCloseBtn();
    this.overlay.classList.remove('hidden');
  }

  /**
   * Close only makes sense when a season is open behind the overlay —
   * otherwise there's nothing to return to and hide() would no-op (a visible
   * button that does nothing). Re-evaluated on every state change that can
   * open/close a season while the library is up (team switch, season delete).
   */
  _updateCloseBtn() {
    const closeBtn = document.getElementById('btnLibraryClose');
    if (closeBtn) closeBtn.hidden = !this._storage()?.seasonStore.hasCurrent();
  }

  /** Toggle the overlay between the seasons list and the schedule table. */
  _setLevel(level) {
    const seasonsView = document.getElementById('librarySeasonsView');
    const scheduleView = document.getElementById('libraryScheduleView');
    const sub = document.getElementById('libraryBrandSub');
    if (seasonsView) seasonsView.classList.toggle('hidden', level === 'schedule');
    if (scheduleView) scheduleView.classList.toggle('hidden', level !== 'schedule');
    if (sub) {
      if (level === 'schedule') {
        const store = this._storage()?.seasonStore;
        sub.textContent = store?.data?.seasonName || 'Schedule';
      } else {
        const profile = this._teamProfile();
        sub.textContent = profile.teamName || 'Team Hub';
      }
    }
  }

  // ---- Team card & setup ----

  _renderTeamCard() {
    const card = document.getElementById('teamCard');
    const setup = document.getElementById('teamSetup');
    const seasonsHead = document.querySelector('.team-seasons-head');
    this._renderTeamPills();
    const newSection = document.querySelector('.library-new');
    if (!this._hasTeam()) {
      if (card) card.classList.add('hidden');
      if (setup) setup.classList.remove('hidden');
      if (seasonsHead) seasonsHead.style.display = 'none';
      // One guided path on first run: set up the team first. The New Season /
      // demo CTAs would let a coach create team-less seasons.
      if (newSection) newSection.style.display = 'none';
      return;
    }
    if (newSection) newSection.style.display = '';
    if (setup) setup.classList.add('hidden');
    const cancel = document.getElementById('btnTeamSetupCancel');
    if (cancel) cancel.classList.add('hidden');
    this._addingTeam = false;
    if (seasonsHead) seasonsHead.style.display = '';
    if (!card) return;

    const profile = this._teamProfile();
    const nameEl = document.getElementById('teamCardName');
    const metaEl = document.getElementById('teamCardMeta');
    const swatchEl = document.getElementById('teamCardSwatch');

    if (nameEl) nameEl.textContent = profile.teamName || 'Team';
    if (metaEl) {
      const roster = window.app?.roster;
      const count = roster?.players?.length || 0;
      metaEl.textContent = count ? `${count} player${count !== 1 ? 's' : ''} on roster` : 'No roster yet';
    }
    if (swatchEl) {
      swatchEl.style.background = jerseyHex(profile.jerseyColor) || 'rgba(255,255,255,.15)';
    }
    card.classList.remove('hidden');
  }

  /** Team switcher: one pill per team (active highlighted) + "+ Add Team".
   *  This is how a coach on multiple staffs (JV + Varsity) flips between
   *  hubs — each team has its own seasons list and roster. */
  _renderTeamPills() {
    const el = document.getElementById('teamPills');
    if (!el) return;
    const teams = this._teams();
    if (!teams.length) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    const activeId = this._activeTeamId();
    el.classList.remove('hidden');
    el.innerHTML = teams.map(t => `
      <button class="team-pill${t.id === activeId ? ' active' : ''}" data-team="${esc(t.id)}" type="button"
        title="${t.id === activeId ? 'Current team' : `Switch to ${esc(t.teamName)}`}">
        <span class="team-pill-dot" style="background:${jerseyHex(t.jerseyColor) || 'rgba(255,255,255,.2)'}"></span>${esc(t.teamName)}
      </button>`).join('') +
      `<button class="team-pill team-pill-add" id="btnAddTeam" type="button" title="Add another team (e.g. JV)">+ Add Team</button>`;
  }

  _saveTeamSetup() {
    const nameEl = document.getElementById('teamSetupName');
    const colorEl = document.getElementById('teamSetupColor');
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }
    const adding = !!this._addingTeam;
    this._addingTeam = false;

    // Register the team. First-run: it inherits the existing roster (players
    // may predate the team). Added teams start with an empty roster.
    const teams = this._teams();
    const team = { id: this._newTeamId(name, teams.map(t => t.id)), teamName: name, jerseyColor: colorEl?.value || '' };
    teams.push(team);
    this._saveTeams(teams);
    if (nameEl) nameEl.value = '';
    if (colorEl) colorEl.value = '';
    if (adding) {
      try { localStorage.setItem(this._teamRosterKey(team.id), '[]'); } catch (e) {}
      this._setActiveTeam(team.id);   // closes any open season, swaps roster, re-renders
      return;
    }
    try { localStorage.setItem('ffa_active_team_id', team.id); } catch (e) {}
    try { localStorage.setItem(this._teamRosterKey(team.id), localStorage.getItem('ffa_roster') || '[]'); } catch (e) {}
    const profile = { teamName: name, jerseyColor: team.jerseyColor };
    this._saveTeamProfile(profile);
    this._syncGameInfoFromTeam(profile);
    this._renderTeamCard();
    this._render();   // surface the Get Started checklist now that a team exists
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  _showTeamEdit(show) {
    const card = document.getElementById('teamCard');
    const edit = document.getElementById('teamEdit');
    if (card) card.classList.toggle('hidden', show);
    if (edit) edit.classList.toggle('hidden', !show);
    if (show) {
      const profile = this._teamProfile();
      const nameEl = document.getElementById('teamEditName');
      const colorEl = document.getElementById('teamEditColor');
      if (nameEl) nameEl.value = profile.teamName || '';
      if (colorEl) colorEl.value = profile.jerseyColor || '';
      setTimeout(() => nameEl?.focus(), 30);
    }
  }

  _commitTeamEdit() {
    const nameEl = document.getElementById('teamEditName');
    const colorEl = document.getElementById('teamEditColor');
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }
    const profile = { teamName: name, jerseyColor: colorEl?.value || '' };
    this._saveTeamProfile(profile);
    // Keep the registry entry in lockstep so the pills show the new identity.
    const teams = this._teams();
    const active = teams.find(t => t.id === this._activeTeamId());
    if (active) { active.teamName = name; active.jerseyColor = profile.jerseyColor; this._saveTeams(teams); }
    this._syncGameInfoFromTeam(profile);
    this._showTeamEdit(false);
    this._renderTeamCard();
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  _syncGameInfoFromTeam(profile) {
    const nameEl = document.getElementById('gameTeamName');
    const colorEl = document.getElementById('gameJerseyColor');
    if (nameEl && profile.teamName) nameEl.value = profile.teamName;
    if (colorEl && profile.jerseyColor) colorEl.value = profile.jerseyColor;
    if (window.app?._saveGameInfo) window.app._saveGameInfo();
  }

  _openRoster() {
    this.hide();   // no-ops when no season is open (overlay must stay)
    const drawer = document.getElementById('settingsDrawer');
    const scrim = document.querySelector('.drawer-scrim');
    const panel = document.getElementById('rosterPanel');
    // If the library overlay is still up (no season open), the drawer's normal
    // z-index (600) would put it BEHIND the overlay (4000) — the click would
    // look dead. Raise it above; ui-polish strips the class on drawer close.
    if (this._isOpen()) {
      drawer?.classList.add('drawer-above-library');
      scrim?.classList.add('drawer-above-library');
    }
    if (drawer && !drawer.classList.contains('open')) {
      drawer.classList.add('open');
      if (scrim) scrim.classList.add('active');
    }
    if (panel && panel.classList.contains('collapsed')) {
      panel.classList.remove('collapsed');
    }
  }

  // ---- Schedule ----

  /** Render the open season's games as a schedule table (the spine). */
  _renderSchedule() {
    const app = window.app;
    const store = this._storage()?.seasonStore;
    const body = document.getElementById('scheduleBody');
    const title = document.getElementById('scheduleTitle');
    if (!app || !store || !store.hasCurrent() || !body) return;
    app.storage.commitActive();
    if (title) title.textContent = store.data.seasonName || 'Season';
    const games = store.gamesChrono();
    const activeId = store.data.activeGameId;
    if (!games.length) {
      body.innerHTML = '<tr><td colspan="7" class="sch-empty">No games yet. Click "+ New Game" to start tagging film.</td></tr>';
      return;
    }
    body.innerHTML = games.map((g, idx) => {
      const r = app._gameRowInfo(g, idx, store, activeId);
      const dot = r.isActive ? 'dot-active' : (r.isFinal ? 'dot-final' : 'dot-idle');
      const date = r.date ? libLocalDate(r.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
      const result = r.hasScore ? app._scorePillHtml(r.u, r.t, 'sch-score') : '<span class="sch-dim">—</span>';
      const status = r.isFinal ? '<span class="sch-status final">Final</span>'
        : (r.isActive ? '<span class="sch-status open">Open</span>' : '<span class="sch-dim">—</span>');
      return `<tr class="sch-row${r.isActive ? ' is-active' : ''}" data-game="${esc(g.id)}" title="Open this game">
        <td><span class="sch-dot ${dot}"></span></td>
        <td class="sch-name">${esc(r.name)}</td>
        <td class="sch-dim">${esc(date)}</td>
        <td>${result}</td>
        <td>${r.plays}</td>
        <td>${status}</td>
        <td><span class="sch-open-link">${r.isActive ? 'Resume' : 'Open'} →</span>
            <button class="sch-del" data-del-game="${esc(g.id)}" title="Delete this game" aria-label="Delete game">✕</button></td>
      </tr>`;
    }).join('');
  }

  async _deleteGameFromSchedule(id) {
    const storage = this._storage();
    const store = storage?.seasonStore;
    if (!storage || !store) return;
    const g = (store.data?.games || []).find(x => x.id === id);
    if (!g) return;
    const name = g.name || 'this game';
    const plays = (g.plays || []).length;
    const tagger = window.app?.tagger;
    const msg = `Delete "${name}"${plays ? ` and its ${plays} tagged play${plays === 1 ? '' : 's'}` : ''}? This can't be undone (a restore point is saved first).`;
    const ok = tagger?._confirmDialog ? await tagger._confirmDialog(msg, 'Delete Game') : confirm(msg);
    if (!ok) return;
    storage.removeGame(id);
    this._renderSchedule();
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  _openGame(id) {
    const storage = this._storage();
    const store = storage?.seasonStore;
    if (!storage || !store) return;
    if (store.data && store.data.activeGameId !== id) storage.switchToGame(id);
    this.overlay.classList.add('hidden');
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
    if (window.app?.season?._renderAll) window.app.season._renderAll();
  }

  _newGameFromSchedule() {
    const storage = this._storage();
    if (storage) storage.newGame();
    this.overlay.classList.add('hidden');
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
  }

  /** Hide the library — only meaningful once a season is open. */
  hide() {
    if (!this.overlay) return;
    if (!this._storage()?.seasonStore.hasCurrent()) return;
    this.overlay.classList.add('hidden');
  }

  _showForm(show) {
    if (this.form) this.form.classList.toggle('hidden', !show);
    const toggle = document.getElementById('btnNewSeasonToggle');
    if (toggle) toggle.classList.toggle('hidden', show);
    if (show) {
      // Pre-fill the team field from the active team so JV seasons are born
      // labeled JV — the coach only types the year.
      const teamEl = document.getElementById('newSeasonTeam');
      if (teamEl && !teamEl.value) teamEl.value = this._teamProfile().teamName || '';
      setTimeout(() => document.getElementById('newSeasonYear')?.focus(), 30);
    }
  }

  async _render() {
    if (!this.listEl) return;
    this._updateCloseBtn();
    let seasons = [];
    try { seasons = await this._storage().listSeasons(); } catch (e) {}
    // Team Home shows only the ACTIVE team's seasons (JV and Varsity each
    // have their own hub; the pills switch between them).
    if (this._teams().length) seasons = this._teamSeasons(seasons, this._activeTeamId());
    const demoId = this._storage()?.demoSeasonId?.() || '';
    this._renderChecklist(seasons, demoId);
    if (!seasons.length) {
      this.listEl.innerHTML = this._hasTeam()
        ? `<div class="library-empty">
            <p>No seasons yet for this team.</p>
            <p class="library-empty-sub">Create your first season — or explore a demo to see what the stats look like.</p>
          </div>`
        : '';
      return;
    }
    const currentId = this._storage().seasonStore.currentSeasonId;
    this.listEl.innerHTML = seasons.map(s => this._cardHtml(s, s.id === currentId, s.id === demoId)).join('');
    this._updateCloseBtn();
  }

  _cardHtml(s, isCurrent, isDemo) {
    const sub = [s.year, s.level, s.team].filter(Boolean).join(' · ');
    const last = s.lastOpened ? new Date(s.lastOpened).toLocaleDateString() : '';
    const badge = [
      isCurrent ? ' <span class="season-card-badge">Open</span>' : '',
      isDemo ? ' <span class="season-card-badge demo">Demo</span>' : '',
    ].join('');
    const delTitle = isDemo ? 'Remove the demo season' : 'Delete this season';
    return `<div class="season-card${isCurrent ? ' is-current' : ''}${isDemo ? ' is-demo' : ''}" data-id="${esc(s.id)}" title="Open this season">
      <div class="season-card-main">
        <div class="season-card-name">${esc(s.name || 'Untitled Season')}${badge}</div>
        ${sub ? `<div class="season-card-sub">${esc(sub)}</div>` : ''}
        <div class="season-card-meta">${s.games || 0} game${(s.games || 0) === 1 ? '' : 's'} · ${s.plays || 0} plays${last ? ` · opened ${esc(last)}` : ''}</div>
      </div>
      <button class="season-card-del" data-lib-del title="${delTitle}" aria-label="${delTitle}">✕</button>
    </div>`;
  }

  // ---- Get Started checklist (progressive onboarding) ----

  _checklistDismissed() {
    try { return localStorage.getItem('ffa_checklist_dismissed') === '1'; } catch (e) { return false; }
  }
  _dismissChecklist() {
    try { localStorage.setItem('ffa_checklist_dismissed', '1'); } catch (e) {}
    const el = document.getElementById('getStartedChecklist');
    if (el) el.classList.add('hidden');
  }

  _checklistItems(seasons, demoId) {
    const profile = this._teamProfile();
    const roster = window.app?.roster?.players || [];
    const realSeasons = (seasons || []).filter(s => s.id !== demoId);
    // Season-meta play counts lag a debounced autosave, so also consult the
    // live tagger when a real season is open (a play tagged seconds ago counts).
    // "Tagged" means the coach actually applied a tag — loading a video
    // auto-creates placeholder plays, which must NOT check this step off.
    const store = this._storage()?.seasonStore;
    const hasRealTag = p => p?.tags && (p.tags.playType || p.tags.runPass || p.tags.result || p.tags.formation);
    const liveTagged = store?.hasCurrent() && !this._storage().isDemoSeason(store.currentSeasonId)
      && (window.app?.tagger?.plays || []).some(hasRealTag);
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

  _renderChecklist(seasons, demoId) {
    const el = document.getElementById('getStartedChecklist');
    if (!el) return;
    // Only show once a team exists (before that, the setup form is the guide),
    // and never after it's complete or dismissed.
    const items = this._checklistItems(seasons, demoId);
    const doneCount = items.filter(i => i.done).length;
    const complete = doneCount === items.length;
    if (!this._hasTeam() || complete || this._checklistDismissed()) {
      el.classList.add('hidden');
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <div class="gs-head">
        <div class="gs-title">Get started <span class="gs-count">${doneCount} of ${items.length}</span></div>
        <button class="gs-dismiss" id="gsDismiss" title="Hide this checklist" aria-label="Hide checklist">×</button>
      </div>
      <div class="gs-bar"><div class="gs-bar-fill" style="width:${Math.round(doneCount / items.length * 100)}%"></div></div>
      <ul class="gs-items">
        ${items.map(i => `
          <li class="gs-item${i.done ? ' done' : ''}" data-step="${i.step}"${i.done ? '' : ' role="button" tabindex="0"'}>
            <span class="gs-check">${i.done ? '✓' : ''}</span>
            <span class="gs-label">${i.label}</span>
            ${i.done ? '' : '<span class="gs-go">→</span>'}
          </li>`).join('')}
      </ul>`;
  }

  _runChecklistAction(step) {
    if (step === 'team') { this._showTeamEdit(true); return; }
    if (step === 'roster') { this._openRoster(); return; }
    if (step === 'season') { this._showForm(true); return; }
    if (step === 'play') {
      // Jump into a REAL season's schedule to add/open a game. If the current
      // season is the demo (or nothing is open), prefer an existing real
      // season over pushing the coach into creating a duplicate one.
      const storage = this._storage();
      const store = storage?.seasonStore;
      if (store?.hasCurrent() && !storage.isDemoSeason(store.currentSeasonId)) { this.openSchedule(); return; }
      storage?.listSeasons().then(seasons => {
        const real = (seasons || []).find(s => s.id !== storage.demoSeasonId());
        if (real) this._open(real.id);     // most recently opened real season
        else this._showForm(true);
      }).catch(() => this._showForm(true));
      return;
    }
    if (step === 'stats') {
      // Demo stats never set ffa_seen_stats, so the step can't complete from
      // the demo — prefer an open REAL season; otherwise the demo is still
      // the best teaching tool (the step completes later on real data).
      const storage = this._storage();
      const store = storage?.seasonStore;
      if (store?.hasCurrent() && !storage.isDemoSeason(store.currentSeasonId)) {
        this.overlay.classList.add('hidden');
        document.getElementById('btnShowStats')?.click();
        return;
      }
      storage?.listSeasons().then(seasons => {
        const real = (seasons || []).find(s => s.id !== storage.demoSeasonId() && (s.plays || 0) > 0);
        if (real) {
          this._open(real.id).then(() => {
            this.overlay.classList.add('hidden');
            document.getElementById('btnShowStats')?.click();
          });
        } else if (store?.hasCurrent()) {
          this.overlay.classList.add('hidden');
          document.getElementById('btnShowStats')?.click();
        } else {
          this._exploreDemo();   // nothing to show yet → demo gives instant stats
        }
      }).catch(() => this._exploreDemo());
      return;
    }
  }

  async _exploreDemo() {
    const storage = this._storage();
    if (!storage || !storage.loadDemoSeason) return;
    let demoOk = null;
    try { demoOk = await storage.loadDemoSeason(); } catch (e) { demoOk = null; }
    if (demoOk == null) {
      window.app?.updater?._toast?.('Could not load the demo season — browser storage may be full.');
      return;
    }
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
    window.app?.updater?._toast?.('Demo season loaded — open a game, then tap Stats to explore. (No film attached.)');
    this.openSchedule();   // land on the populated schedule (two finished games)
  }

  async _create() {
    const meta = {
      year: val('newSeasonYear'),
      team: val('newSeasonTeam'),
      level: val('newSeasonLevel'),
      name: val('newSeasonName'),
      teamId: this._activeTeamId(),   // season belongs to the active team's hub
    };
    if (!meta.name) {
      meta.name = [meta.year, meta.level, meta.team].filter(Boolean).join(' ').trim();
    }
    if (!meta.name) { alert('Give the season a year, team, or name first.'); return; }
    await this._storage().createSeason(meta);
    ['newSeasonYear', 'newSeasonTeam', 'newSeasonName'].forEach(id => { const el = document.getElementById(id); if (el) el.value = ''; });
    this._showForm(false);
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
    this.openSchedule();
  }

  async _open(id) {
    await this._storage().openSeasonById(id);
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
    this.openSchedule();
  }

  async _delete(id, card) {
    const tagger = window.app && window.app.tagger;
    const isDemo = this._storage()?.isDemoSeason?.(id);
    // Read the season name from the leading text node only — the badge ("Open"/
    // "Demo") is a sibling <span>, so textContent would wrongly include it (and
    // truncate real names that legitimately contain "Demo").
    const nameEl = card?.querySelector('.season-card-name');
    const cleanName = (nameEl?.firstChild?.textContent || nameEl?.textContent || 'this season').trim();
    const msg = isDemo
      ? 'Remove the demo season? Your own seasons and roster are untouched.'
      : `Delete "${cleanName}"? This removes the season and all its games. This cannot be undone.`;
    let ok = false;
    if (tagger && tagger._confirmDialog) ok = await tagger._confirmDialog(msg, isDemo ? 'Remove Demo' : 'Delete Season');
    else ok = confirm(msg);
    if (!ok) return;
    await this._storage().deleteSeason(id);
    await this._render();
    if (window.app && window.app._updateSeasonChip) window.app._updateSeasonChip();
  }
}

function val(id) { const el = document.getElementById(id); return el ? el.value.trim() : ''; }
/* Parse a YYYY-MM-DD game date as LOCAL time. new Date('2026-09-04') is UTC
   midnight, which toLocaleDateString renders as Sep 3 anywhere west of UTC. */
function libLocalDate(str) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(str || ''));
  return m ? new Date(+m[1], +m[2] - 1, +m[3]) : new Date(str);
}
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const JERSEY_HEX = {
  white: '#e8e8e8', black: '#222', red: '#cc2233', blue: '#2255cc', navy: '#1a2744',
  green: '#228844', yellow: '#c9a227', orange: '#dd6622', purple: '#6633aa',
  maroon: '#772233', gray: '#778899', teal: '#11887a',
};
function jerseyHex(v) { return JERSEY_HEX[v] || ''; }
