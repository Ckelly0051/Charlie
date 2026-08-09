import '../css/native-breakdown-route.css';

/** Dedicated Break Down route using the canonical production DOM surfaces. */
export class BreakdownWorkspace {
  constructor(app) {
    this.app = app;
    this.source = document.querySelector('#app .main-content');
    this.video = this.source?.querySelector('.video-section') || null;
    this.grid = this.source?.querySelector('#playGridSection') || null;
    this.tags = this.source?.querySelector('.tag-section') || null;
    this.unitControl = document.querySelector('#tagForm .unit-toggle-section');
    this.unitParent = this.unitControl?.parentNode || null;
    this.unitNext = this.unitControl?.nextSibling || null;
    this.perspective = document.getElementById('gamePerspective');

    this.host = null;
    this.saveState = 'saved';
    this.view = 'chart';
    this.filmFocus = localStorage.getItem('ffa_breakdown_film_focus') === '1';
    this._filmFocusOpenedStrip = false;
    this.scoutMode = 'self';
    this._contextGameId = null;
    this._bound = false;
  }

  mount(host) {
    if (!host || !this.app.breakdownTheater || !this.app.nativeFilmRoom || !this.app.nativeTagging) return false;
    if (this.host === host && this.app.breakdownTheater._mounted) return true;
    if (this.host) this.restore();
    this.host = host;
    host.innerHTML = `
      <div class="gi-breakdown-route" data-native-breakdown-route>
        <header class="gi-breakdown-toolbar" aria-label="Break Down tools">
          <div class="gi-breakdown-context" role="group" aria-label="Film context">
            <button type="button" data-bd-context="self">Our games <small>Self-scout</small></button>
            <button type="button" data-bd-context="scout">Opponent film <small>Scout</small></button>
          </div>
          <div class="gi-breakdown-view" role="group" aria-label="Break Down view">
            <button type="button" class="active" data-bd-view="chart" aria-pressed="true">Chart</button>
            <button type="button" data-bd-view="film-room" aria-pressed="false">Film Room</button>
          </div>
          <div class="gi-breakdown-tools">
            <button type="button" data-bd-tools-toggle aria-haspopup="menu" aria-controls="bdMoreTools" aria-expanded="false">More tools</button>
            <div class="gi-breakdown-commands" id="bdMoreTools" role="menu">
              <button type="button" role="menuitem" data-bd-context="quick">Quick chart</button>
              <button type="button" role="menuitem" data-bd-customize>Customize fields</button>
              <button type="button" role="menuitem" data-bd-game>Game settings</button>
              <button type="button" role="menuitem" data-bd-film-focus aria-pressed="false">Film focus</button>
            </div>
          </div>
          <span class="gi-breakdown-save is-saved" id="bdSaveState">Saved</span>
        </header>
        <div class="gi-breakdown-composition">
          <section class="gi-breakdown-theater-host" data-breakdown-theater-host></section>
          <aside class="gi-breakdown-deck" aria-label="Charting deck">
            <div class="gi-breakdown-tagging-host" data-breakdown-tagging-host></div>
            <div class="gi-breakdown-film-room-host" data-breakdown-film-room-host hidden></div>
          </aside>
        </div>
      </div>`;
    try {
      if (!this.app.breakdownTheater.mount(host.querySelector('[data-breakdown-theater-host]'))) throw new Error('Break Down theater did not mount.');
      if (!this.app.nativeTagging.mount(host.querySelector('[data-breakdown-tagging-host]'))) throw new Error('Break Down tagging did not mount.');
      if (!this.app.nativeFilmRoom.mount(host.querySelector('[data-breakdown-film-room-host]'))) throw new Error('Break Down Film Room did not mount.');
      this._bind();
      this._setView(this.view);
      const savedFilmFocus = this.filmFocus;
      this.filmFocus = false;
      this._setFilmFocus(savedFilmFocus, { persist: false });
      this.render();
      return true;
    } catch (error) {
      this.app.nativeFilmRoom.restore();
      this.app.nativeTagging.restore();
      this.app.breakdownTheater.restore();
      host.innerHTML = '';
      this.host = null;
      throw error;
    }
  }
  _bind() {
    if (!this._bound) {
      this._bound = true;
      ['play-selected', 'play-created', 'play-updated', 'play-deleted', 'plays-loaded']
        .forEach(event => this.app.tagger?.on(event, () => requestAnimationFrame(() => this.render())));
      this.app.quickChart?.on('mode-changed', () => requestAnimationFrame(() => this.render()));
      this.perspective?.addEventListener('change', () => this.render());
      this.unitControl?.addEventListener('click', () => requestAnimationFrame(() => this.render()));
    }
    this.host?.querySelector('[data-bd-tools-toggle]')?.addEventListener('click', () => this._toggleTools());
    this.host?.querySelector('.gi-breakdown-tools')?.addEventListener('keydown', event => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      const button = this.host?.querySelector('[data-bd-tools-toggle]');
      this._closeTools();
      button?.focus();
    });
    this.host?.querySelectorAll('[data-bd-context]').forEach(btn => {
      btn.addEventListener('click', () => {
        this._setContext(btn.dataset.bdContext);
        this._closeTools();
      });
    });
    this.host?.querySelector('[data-bd-customize]')?.addEventListener('click', () => {
      this._closeTools();
      this.app.tagLibrarySettings?.open();
    });
    this.host?.querySelector('[data-bd-game]')?.addEventListener('click', () => {
      this._closeTools();
      this.app.gameScreen?.open({ mode: 'edit' });
    });
    this.host?.querySelectorAll('[data-bd-view]').forEach(btn => btn.addEventListener('click', () => this._setView(btn.dataset.bdView, { userInitiated: true })));
    this.host?.querySelector('[data-bd-film-focus]')?.addEventListener('click', () => {
      this._closeTools();
      this._setFilmFocus(!this.filmFocus);
    });
  }

  _toggleTools() {
    const menu = this.host?.querySelector('.gi-breakdown-tools');
    const button = menu?.querySelector('[data-bd-tools-toggle]');
    const open = !menu?.classList.contains('is-open');
    menu?.classList.toggle('is-open', open);
    button?.setAttribute('aria-expanded', String(open));
  }

  _closeTools() {
    const menu = this.host?.querySelector('.gi-breakdown-tools');
    menu?.classList.remove('is-open');
    menu?.querySelector('[data-bd-tools-toggle]')?.setAttribute('aria-expanded', 'false');
  }

  _setView(view, { userInitiated = false } = {}) {
    const filmRoom = view === 'film-room';
    // H2 — Chart and Film Room were dead inside Film Focus. Focus removes the
    // deck from layout, so swapping the hidden hosts underneath it did nothing
    // visible and the coach had to go back through Show Charting. Asking for a
    // surface IS asking to leave focus.
    //
    // But ONLY when the coach asked. Mount/restore also calls this to reapply
    // the stored view, and exiting focus there wiped the persisted Film Focus
    // on every remount — caught by e2e-breakdown-geometry, which is exactly the
    // regression that harness exists for.
    if (userInitiated && this.filmFocus) this._setFilmFocus(false);
    this.view = filmRoom ? 'film-room' : 'chart';
    const tagging = this.host?.querySelector('[data-breakdown-tagging-host]');
    const grid = this.host?.querySelector('[data-breakdown-film-room-host]');
    if (tagging) tagging.hidden = filmRoom;
    if (grid) grid.hidden = !filmRoom;
    this.host?.classList.toggle('is-film-room', filmRoom);
    this.host?.querySelectorAll('[data-bd-view]').forEach(btn => {
      const active = btn.dataset.bdView === this.view;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  _setFilmFocus(enabled, { persist = true } = {}) {
    const next = !!enabled;
    if (next && !this.filmFocus) {
      this._filmFocusOpenedStrip = !this.app.breakdownTheater?.stripCollapsed;
      this.app.breakdownTheater?.setStripCollapsed?.(true);
    } else if (!next && this.filmFocus && this._filmFocusOpenedStrip) {
      this.app.breakdownTheater?.setStripCollapsed?.(false);
      this._filmFocusOpenedStrip = false;
    }
    this.filmFocus = next;
    const route = this.host?.querySelector('[data-native-breakdown-route]');
    route?.classList.toggle('is-film-focus', this.filmFocus);
    const button = this.host?.querySelector('[data-bd-film-focus]');
    if (button) {
      button.classList.toggle('active', this.filmFocus);
      button.setAttribute('aria-pressed', String(this.filmFocus));
      button.textContent = this.filmFocus ? 'Show charting' : 'Film focus';
    }
    if (persist) localStorage.setItem('ffa_breakdown_film_focus', this.filmFocus ? '1' : '0');
  }
  _setContext(context) {
    if (context === 'quick') {
      this.app.quickChart?.toggle();
      this.render();
      return;
    }
    if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    const requestedScout = context === 'scout';
    if (requestedScout !== this._isScoutFilm()) this._openFilmContextSettings();
    this.render();
  }

  _activeGameId() {
    return String(this.app.storage?.seasonStore?.data?.activeGameId || '');
  }

  _isScoutFilm() {
    return this.perspective?.value === 'scout';
  }

  _openFilmContextSettings() {
    // Film context is a perspective decision, so land the coach on the
    // perspective field. Passed as the native dialog's one focus target.
    this.app.gameScreen?.open({ mode: 'edit', focus: 'perspective' });
  }

  _syncScoutGame() {
    const gameId = this._activeGameId();
    const changedGame = gameId !== this._contextGameId;
    this._contextGameId = gameId;
    this.scoutMode = this._isScoutFilm() ? 'scout' : 'self';
    if (!changedGame || this.app.tagger?.getCurrentPlay()) return;
    const unit = this.app.tagger?.defaultUnit || 'offense';
    if (this.app.tagger?.unitField) this.app.tagger.unitField.value = unit;
    this.app.tagger?.applyUnitMode?.(unit);
  }

  _unit() {
    const playUnit = this.app.tagger?.getCurrentPlay()?.tags?.unit;
    if (playUnit === 'defense' || playUnit === 'special') return playUnit;
    const active = this.unitControl?.querySelector('.pick.active')?.dataset?.value;
    return active === 'defense' || active === 'special' ? active : 'offense';
  }

  setSaveState(state) {
    this.saveState = state === 'pending' ? 'pending' : 'saved';
    this.render();
  }

  render() {
    if (!this.host) return;
    this._syncScoutGame();
    const scout = this.scoutMode === 'scout';
    const quick = !!this.app.quickChart?.isActive;
    this.host.querySelectorAll('[data-bd-context]').forEach(btn => {
      const active = btn.dataset.bdContext === (quick ? 'quick' : scout ? 'scout' : 'self');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
    const save = this.host.querySelector('#bdSaveState');
    if (save) {
      save.textContent = this.saveState === 'pending' ? 'Saving...' : 'Saved';
      save.classList.toggle('is-pending', this.saveState === 'pending');
      save.classList.toggle('is-saved', this.saveState !== 'pending');
    }
  }
  _ordinal(down) {
    return ({ '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' })[String(down)] || String(down);
  }

  restore() {
    if (!this.host) return false;
    if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    this.app.nativeFilmRoom?.restore();
    this.app.nativeTagging?.restore();
    this.app.breakdownTheater?.restore();
    this.host.innerHTML = '';
    this.host = null;
    return true;
  }
}
