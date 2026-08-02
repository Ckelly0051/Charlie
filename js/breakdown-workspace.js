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
            <button type="button" data-bd-context="quick">Quick chart</button>
          </div>
          <div class="gi-breakdown-commands">
            <button type="button" data-bd-customize>Customize fields</button>
            <button type="button" data-bd-game>Game</button>
          </div>
          <div class="gi-breakdown-view" role="group" aria-label="Break Down view">
            <button type="button" class="active" data-bd-view="chart" aria-pressed="true">Chart</button>
            <button type="button" data-bd-view="film-room" aria-pressed="false">Film Room</button>
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
    this.host?.querySelectorAll('[data-bd-context]').forEach(btn => {
      btn.addEventListener('click', () => this._setContext(btn.dataset.bdContext));
    });
    this.host?.querySelector('[data-bd-customize]')?.addEventListener('click', () => this.app.tagLibrarySettings?.open());
    this.host?.querySelector('[data-bd-game]')?.addEventListener('click', () => this.app.gameScreen?.open({ mode: 'edit' }));
    this.host?.querySelectorAll('[data-bd-view]').forEach(btn => btn.addEventListener('click', () => this._setView(btn.dataset.bdView)));
  }

  _setView(view) {
    const filmRoom = view === 'film-room';
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
