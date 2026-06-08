/**
 * SeasonLibrary — the app's front door (Hudl-style team home).
 *
 * The app is library-first: instead of silently loading one shared save file,
 * it opens to a Library of seasons. Each season is its own file/folder (see
 * storage-backend.js) holding many games. The coach explicitly picks a season
 * to open or creates a new one (year / team / level) — nothing loads with no
 * context.
 *
 * This is purely the *library-level* UI (choose / create / delete a season).
 * The within-season schedule + aggregate stats live in season-manager.js
 * (the "Season Stats" modal), which operates on whichever season is open.
 */
export class SeasonLibrary {
  constructor() {
    this.overlay = document.getElementById('libraryOverlay');
    this.listEl = document.getElementById('libraryList');
    this.form = document.getElementById('librarySeasonForm');
    this._bind();
  }

  _storage() { return window.app && window.app.storage; }

  _bind() {
    document.addEventListener('click', (e) => {
      const t = e.target;
      if (t.closest && t.closest('#btnNewSeasonToggle')) { this._showForm(true); return; }
      if (t.closest && t.closest('#btnNewSeasonCancel')) { this._showForm(false); return; }
      if (t.closest && t.closest('#btnLibraryClose')) { this.hide(); return; }

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

  /** Show the library at the SEASONS level (choose / create a season). */
  async open() {
    if (!this.overlay) return;
    this._setLevel('seasons');
    this._showForm(false);
    await this._render();
    const closeBtn = document.getElementById('btnLibraryClose');
    if (closeBtn) closeBtn.hidden = !this._storage()?.seasonStore.hasCurrent();
    this.overlay.classList.remove('hidden');
  }

  /** Show the library at the SCHEDULE level (the open season's games). */
  async openSchedule() {
    const store = this._storage()?.seasonStore;
    if (!store || !store.hasCurrent()) return this.open();   // nothing open → seasons level
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
    if (sub) sub.textContent = level === 'schedule' ? 'Schedule' : 'Season Library';
  }

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
      body.innerHTML = '<tr><td colspan="7" class="sch-empty">No games yet. Click “+ New Game” to start tagging film.</td></tr>';
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
    if (!this._storage()?.seasonStore.hasCurrent()) return;  // can't dismiss with nothing loaded
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
    if (!seasons.length) {
      this.listEl.innerHTML = `<div class="library-empty">
        <p>No seasons yet.</p>
        <p class="library-empty-sub">Create your first season to get started — give it a year, team, and level.</p>
      </div>`;
      return;
    }
    const currentId = this._storage().seasonStore.currentSeasonId;
    this.listEl.innerHTML = seasons.map(s => this._cardHtml(s, s.id === currentId)).join('');
  }

  _cardHtml(s, isCurrent) {
    const sub = [s.year, s.level, s.team].filter(Boolean).join(' · ');
    const last = s.lastOpened ? new Date(s.lastOpened).toLocaleDateString() : '';
    return `<div class="season-card${isCurrent ? ' is-current' : ''}" data-id="${esc(s.id)}" title="Open this season">
      <div class="season-card-main">
        <div class="season-card-name">${esc(s.name || 'Untitled Season')}${isCurrent ? ' <span class="season-card-badge">Open</span>' : ''}</div>
        ${sub ? `<div class="season-card-sub">${esc(sub)}</div>` : ''}
        <div class="season-card-meta">${s.games || 0} game${(s.games || 0) === 1 ? '' : 's'} · ${s.plays || 0} plays${last ? ` · opened ${esc(last)}` : ''}</div>
      </div>
      <button class="season-card-del" data-lib-del title="Delete this season" aria-label="Delete season">✕</button>
    </div>`;
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
    this.openSchedule();   // land on the (empty) schedule, ready to add a game
  }

  async _open(id) {
    await this._storage().openSeasonById(id);
    if (window.app?._updateSeasonChip) window.app._updateSeasonChip();
    this.openSchedule();   // land on the schedule (pick a game) — not the player
  }

  async _delete(id, card) {
    const tagger = window.app && window.app.tagger;
    const name = card?.querySelector('.season-card-name')?.textContent || 'this season';
    const msg = `Delete "${name.replace(' Open', '')}"? This removes the season and all its games. This cannot be undone.`;
    let ok = false;
    if (tagger && tagger._confirmDialog) ok = await tagger._confirmDialog(msg, 'Delete Season');
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
