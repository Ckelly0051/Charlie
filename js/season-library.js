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

  _bind() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest && t.closest('#btnNewSeasonToggle')) { this._showForm(true); return; }
      if (t.closest && t.closest('#btnNewSeasonCancel')) { this._showForm(false); return; }
      if (t.closest && t.closest('#btnLibraryClose')) { this.hide(); return; }

      // Team setup
      if (t.closest && t.closest('#btnTeamSetupSave')) { this._saveTeamSetup(); return; }

      // Team card actions
      if (t.closest && t.closest('#btnEditTeam')) { this._showTeamEdit(true); return; }
      if (t.closest && t.closest('#btnTeamEditSave')) { this._commitTeamEdit(); return; }
      if (t.closest && t.closest('#btnTeamEditCancel')) { this._showTeamEdit(false); return; }
      if (t.closest && t.closest('#btnTeamRoster')) { this._openRoster(); return; }

      // Demo season + Get Started checklist
      if (t.closest && t.closest('#btnExploreDemo')) { this._exploreDemo(); return; }
      if (t.closest && t.closest('#gsDismiss')) { this._dismissChecklist(); return; }
      const gsItem = t.closest && t.closest('.gs-item:not(.done)');
      if (gsItem) { this._runChecklistAction(gsItem.dataset.step); return; }

      // Schedule level (the open season's games — the spine)
      if (t.closest && t.closest('#btnScheduleBack')) { this._setLevel('seasons'); this._render(); return; }
      if (t.closest && t.closest('#btnScheduleNewGame')) { this._newGameFromSchedule(); return; }
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
    });
  }

  _isOpen() { return this.overlay && !this.overlay.classList.contains('hidden'); }

  /** Show the library at the TEAM HOME / SEASONS level. */
  async open() {
    if (!this.overlay) return;
    this._setLevel('seasons');
    this._showForm(false);
    this._showTeamEdit(false);
    this._renderTeamCard();
    await this._render();
    const closeBtn = document.getElementById('btnLibraryClose');
    if (closeBtn) closeBtn.hidden = !this._storage()?.seasonStore.hasCurrent();
    this.overlay.classList.remove('hidden');
  }

  /** Show the library at the SCHEDULE level (the open season's games). */
  async openSchedule() {
    const store = this._storage()?.seasonStore;
    if (!store || !store.hasCurrent()) return this.open();
    if (!this.overlay) return;
    this._setLevel('schedule');
    this._renderSchedule();
    const closeBtn = document.getElementById('btnLibraryClose');
    if (closeBtn) closeBtn.hidden = !store.hasCurrent();
    this.overlay.classList.remove('hidden');
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
    if (!this._hasTeam()) {
      if (card) card.classList.add('hidden');
      if (setup) setup.classList.remove('hidden');
      if (seasonsHead) seasonsHead.style.display = 'none';
      return;
    }
    if (setup) setup.classList.add('hidden');
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

  _saveTeamSetup() {
    const nameEl = document.getElementById('teamSetupName');
    const colorEl = document.getElementById('teamSetupColor');
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }
    const profile = { teamName: name, jerseyColor: colorEl?.value || '' };
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
    this.hide();
    const drawer = document.getElementById('settingsDrawer');
    const scrim = document.querySelector('.drawer-scrim');
    const panel = document.getElementById('rosterPanel');
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
      const date = r.date ? new Date(r.date).toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' }) : '—';
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
        <td><span class="sch-open-link">${r.isActive ? 'Resume' : 'Open'} →</span></td>
      </tr>`;
    }).join('');
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
    if (show) setTimeout(() => document.getElementById('newSeasonYear')?.focus(), 30);
  }

  async _render() {
    if (!this.listEl) return;
    let seasons = [];
    try { seasons = await this._storage().listSeasons(); } catch (e) {}
    const demoId = this._storage()?.demoSeasonId?.() || '';
    this._renderChecklist(seasons, demoId);
    if (!seasons.length) {
      this.listEl.innerHTML = this._hasTeam()
        ? `<div class="library-empty">
            <p>No seasons yet.</p>
            <p class="library-empty-sub">Create your first season — or explore a demo to see what the stats look like.</p>
          </div>`
        : '';
      return;
    }
    const currentId = this._storage().seasonStore.currentSeasonId;
    this.listEl.innerHTML = seasons.map(s => this._cardHtml(s, s.id === currentId, s.id === demoId)).join('');
  }

  _cardHtml(s, isCurrent, isDemo) {
    const sub = [s.year, s.level, s.team].filter(Boolean).join(' · ');
    const last = s.lastOpened ? new Date(s.lastOpened).toLocaleDateString() : '';
    const badge = isCurrent ? ' <span class="season-card-badge">Open</span>'
      : (isDemo ? ' <span class="season-card-badge demo">Demo</span>' : '');
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
    const store = this._storage()?.seasonStore;
    const liveTagged = store?.hasCurrent() && !this._storage().isDemoSeason(store.currentSeasonId)
      && (window.app?.tagger?.plays?.length || 0) > 0;
    const taggedAnywhere = liveTagged || realSeasons.some(s => (s.plays || 0) > 0);
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
      // If a real season exists, jump into its schedule to add/open a game;
      // otherwise start the new-season flow.
      const store = this._storage()?.seasonStore;
      if (store?.hasCurrent() && !this._storage().isDemoSeason(store.currentSeasonId)) this.openSchedule();
      else this._showForm(true);
      return;
    }
    if (step === 'stats') {
      const store = this._storage()?.seasonStore;
      if (store?.hasCurrent()) {
        this.overlay.classList.add('hidden');
        document.getElementById('btnShowStats')?.click();
      } else {
        this._exploreDemo();   // nothing to show yet → demo gives instant stats
      }
      return;
    }
  }

  async _exploreDemo() {
    const storage = this._storage();
    if (!storage || !storage.loadDemoSeason) return;
    try { await storage.loadDemoSeason(); } catch (e) { return; }
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
function esc(s) {
  return String(s == null ? '' : s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
}

const JERSEY_HEX = {
  white: '#e8e8e8', black: '#222', red: '#cc2233', blue: '#2255cc', navy: '#1a2744',
  green: '#228844', yellow: '#c9a227', orange: '#dd6622', purple: '#6633aa',
  maroon: '#772233', gray: '#778899', teal: '#11887a',
};
function jerseyHex(v) { return JERSEY_HEX[v] || ''; }
