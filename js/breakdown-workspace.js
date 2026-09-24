import '../css/native-breakdown-route.css';

/** Dedicated Break Down route using the canonical production DOM surfaces. */
export class BreakdownWorkspace {
  /* FILM ROOM LAYOUT (coach direction, 2026-09-23). Video first: the editable
     table docks below the film by default. The coach can move it beside the
     film, drag the split within usable limits, and reset. `video` is the film's
     share of the split axis (height below, width beside), kept per dock. A few
     bytes of preference, so it lives in localStorage like the other view
     settings; version history no longer shares that store. */
  static LAYOUT_KEY = 'ffa_film_room_layout';
  static LAYOUT_DEFAULT = Object.freeze({ dock: 'bottom', bottom: 62, side: 45 });
  static LAYOUT_LIMITS = Object.freeze({ bottom: [40, 75], side: [30, 65] });

  static readLayout(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const D = BreakdownWorkspace.LAYOUT_DEFAULT, L = BreakdownWorkspace.LAYOUT_LIMITS;
    let raw = null;
    try { raw = JSON.parse(storage?.getItem(BreakdownWorkspace.LAYOUT_KEY) || 'null'); } catch (e) { raw = null; }
    const clamp = (value, [lo, hi], fallback) => (value != null && value !== '' && Number.isFinite(Number(value)) ? Math.min(hi, Math.max(lo, Number(value))) : fallback);
    return {
      dock: raw?.dock === 'side' ? 'side' : 'bottom',
      bottom: clamp(raw?.bottom, L.bottom, D.bottom),
      side: clamp(raw?.side, L.side, D.side),
    };
  }

  constructor(app) {
    this.app = app;
    // S7-d1: game context comes from the service, not a hidden <select>.
    this.host = null;
    this.saveState = 'saved';
    this.view = 'chart';
    this.filmFocus = (() => { try { return localStorage.getItem('ffa_breakdown_film_focus') === '1'; } catch (e) { return false; } })();
    this.filmLayout = BreakdownWorkspace.readLayout();
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
            <button type="button" data-bd-context="self">Our Program</button>
            <button type="button" data-bd-context="scout">Opponent Scout</button>
          </div>
          <div class="gi-breakdown-view" role="group" aria-label="Break Down view">
            <button type="button" class="active" data-bd-view="chart" aria-pressed="true">Chart</button>
            <button type="button" data-bd-view="film-room" aria-pressed="false">Film Room</button>
          </div>
          <div class="gi-breakdown-layout" role="group" aria-label="Film Room layout">
            <span class="gi-breakdown-layout-label" aria-hidden="true">Table</span>
            <button type="button" data-fr-dock="bottom" aria-pressed="true" aria-label="Table below film">Below</button>
            <button type="button" data-fr-dock="side" aria-pressed="false" aria-label="Table beside film">Beside</button>
            <button type="button" data-fr-reset aria-label="Reset Film Room layout">Reset</button>
          </div>
          <div class="gi-breakdown-tools">
            <button type="button" data-bd-tools-toggle aria-haspopup="menu" aria-controls="bdMoreTools" aria-expanded="false">More tools</button>
            <div class="gi-breakdown-commands" id="bdMoreTools" role="menu">
              <button type="button" role="menuitem" data-bd-context="quick"><svg aria-hidden="true"><use href="assets/icons.svg#icon-chart"/></svg>Quick chart</button>
              <button type="button" role="menuitem" data-bd-customize><svg aria-hidden="true"><use href="assets/icons.svg#icon-tag"/></svg>Customize fields</button>
              <button type="button" role="menuitem" data-bd-game><svg aria-hidden="true"><use href="assets/icons.svg#icon-notes"/></svg>Game settings</button>
              <button type="button" role="menuitem" data-bd-film-focus aria-pressed="false"><svg aria-hidden="true"><use href="assets/icons.svg#icon-scan"/></svg><span>Film focus</span></button>
            </div>
          </div>
          <span class="gi-breakdown-save is-saved" id="bdSaveState">Saved</span>
        </header>
        <div class="gi-breakdown-composition">
          <section class="gi-breakdown-theater-host" data-breakdown-theater-host></section>
          <aside class="gi-breakdown-rail-host" data-breakdown-rail-host aria-label="Game plays"></aside>
          <div class="gi-breakdown-splitter" data-fr-splitter role="separator" tabindex="0" aria-label="Resize film and table"></div>
          <aside class="gi-breakdown-deck" aria-label="Charting deck">
            <div class="gi-breakdown-tagging-host" data-breakdown-tagging-host></div>
            <div class="gi-breakdown-film-room-host" data-breakdown-film-room-host hidden></div>
          </aside>
        </div>
      </div>`;
    try {
      if (!this.app.breakdownTheater.mount(host.querySelector('[data-breakdown-theater-host]'), { railHost: host.querySelector('[data-breakdown-rail-host]') })) throw new Error('Break Down theater did not mount.');
      if (!this.app.nativeTagging.mount(host.querySelector('[data-breakdown-tagging-host]'))) throw new Error('Break Down tagging did not mount.');
      if (!this.app.nativeFilmRoom.mount(host.querySelector('[data-breakdown-film-room-host]'))) throw new Error('Break Down Film Room did not mount.');
      this._bind();
      this._applyLayout();
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
      this.app.gameContext?.subscribe(() => this.render());
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
    this.host?.querySelectorAll('button[data-fr-dock]').forEach(btn => btn.addEventListener('click', () => this.setFilmLayout({ dock: btn.dataset.frDock })));
    this.host?.querySelector('[data-fr-reset]')?.addEventListener('click', () => this.resetFilmLayout());
    this._bindSplitter();
  }

  /** Change the dock and/or the film's share of the current dock; persisted. */
  setFilmLayout({ dock, video } = {}, { persist = true } = {}) {
    const next = { ...this.filmLayout };
    if (dock === 'bottom' || dock === 'side') next.dock = dock;
    if (video != null) {
      const [lo, hi] = BreakdownWorkspace.LAYOUT_LIMITS[next.dock];
      next[next.dock] = Math.round(Math.min(hi, Math.max(lo, Number(video))) * 10) / 10;
    }
    this.filmLayout = next;
    this._applyLayout();
    if (persist) this._saveLayout();
    return this.filmLayout;
  }
  resetFilmLayout() {
    this.filmLayout = { ...BreakdownWorkspace.LAYOUT_DEFAULT };
    this._applyLayout();
    try { localStorage.removeItem(BreakdownWorkspace.LAYOUT_KEY); } catch (e) {}
    return this.filmLayout;
  }
  _saveLayout() {
    try { localStorage.setItem(BreakdownWorkspace.LAYOUT_KEY, JSON.stringify(this.filmLayout)); }
    catch (e) { console.error('Film Room layout could not be saved', e); }
  }
  _applyLayout() {
    const route = this.host?.querySelector('[data-native-breakdown-route]');
    if (!route) return;
    const { dock } = this.filmLayout, video = this.filmLayout[dock];
    const [lo, hi] = BreakdownWorkspace.LAYOUT_LIMITS[dock];
    route.dataset.frDock = dock;
    route.style.setProperty('--fr-video', `${video}%`);
    const splitter = this.host.querySelector('[data-fr-splitter]');
    if (splitter) {
      // The separator runs across the split: a horizontal line between stacked
      // panes, a vertical one between side-by-side panes.
      splitter.setAttribute('aria-orientation', dock === 'bottom' ? 'horizontal' : 'vertical');
      splitter.setAttribute('aria-valuemin', String(lo));
      splitter.setAttribute('aria-valuemax', String(hi));
      splitter.setAttribute('aria-valuenow', String(video));
      splitter.setAttribute('aria-valuetext', `Film ${Math.round(video)}%`);
    }
    // utton[...]: the route itself carries data-fr-dock as its dock state.
    this.host.querySelectorAll('button[data-fr-dock]').forEach(btn => {
      const active = btn.dataset.frDock === dock;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }
  _bindSplitter() {
    const splitter = this.host?.querySelector('[data-fr-splitter]');
    const composition = this.host?.querySelector('.gi-breakdown-composition');
    if (!splitter || !composition) return;
    const pctAt = event => {
      const rect = composition.getBoundingClientRect();
      return this.filmLayout.dock === 'bottom'
        ? ((event.clientY - rect.top) / rect.height) * 100
        : ((event.clientX - rect.left) / rect.width) * 100;
    };
    splitter.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      event.preventDefault();
      splitter.setPointerCapture?.(event.pointerId);
      splitter.classList.add('is-dragging');
      const move = e => this.setFilmLayout({ video: pctAt(e) }, { persist: false });
      const up = e => {
        splitter.releasePointerCapture?.(e.pointerId);
        splitter.classList.remove('is-dragging');
        splitter.removeEventListener('pointermove', move);
        splitter.removeEventListener('pointerup', up);
        splitter.removeEventListener('pointercancel', up);
        this._saveLayout();
      };
      splitter.addEventListener('pointermove', move);
      splitter.addEventListener('pointerup', up);
      splitter.addEventListener('pointercancel', up);
    });
    splitter.addEventListener('dblclick', () => this.setFilmLayout({ video: BreakdownWorkspace.LAYOUT_DEFAULT[this.filmLayout.dock] }));
    splitter.addEventListener('keydown', event => {
      const bottom = this.filmLayout.dock === 'bottom';
      const [lo, hi] = BreakdownWorkspace.LAYOUT_LIMITS[this.filmLayout.dock];
      const now = this.filmLayout[this.filmLayout.dock];
      const step = { [bottom ? 'ArrowUp' : 'ArrowLeft']: -2, [bottom ? 'ArrowDown' : 'ArrowRight']: 2, PageUp: -10, PageDown: 10 }[event.key];
      let next = null;
      if (step != null) next = now + step;
      else if (event.key === 'Home') next = lo;
      else if (event.key === 'End') next = hi;
      if (next == null) return;
      event.preventDefault();
      this.setFilmLayout({ video: next });
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
    this.app.breakdownTheater?.setView(this.view);
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
      button.querySelector('span').textContent = this.filmFocus ? 'Show charting' : 'Film focus';
    }
    if (persist) { try { localStorage.setItem('ffa_breakdown_film_focus', this.filmFocus ? '1' : '0'); } catch (e) {} }
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
    return this.app.gameContext?.isScout() === true;
  }

  _openFilmContextSettings() {
    // There is no perspective FIELD any more -- Program versus Opponent Scout
    // is derived from the owning season and the charting unit is chosen here in
    // Break Down. Game settings still owns the rest of the game's context, so
    // this lands on the game's identity instead of a `[name="perspective"]`
    // selector that would now match nothing and leave the dialog unfocused.
    this.app.gameScreen?.open({ mode: 'edit', focus: 'opponent' });
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
