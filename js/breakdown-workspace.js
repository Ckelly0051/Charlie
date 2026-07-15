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
    this._bound = false;
  }

  mount(host) {
    if (!host || !this.source || !this.video || !this.grid || !this.tags) return false;
    this.host = host;
    host.innerHTML = `
      <div class="bd-route">
        <header class="bd-context-bar" aria-label="Charting context">
          <div class="bd-context-units"></div>
          <div class="bd-film-context" role="group" aria-label="Film context">
            <span class="bd-context-label">Film context</span>
            <button type="button" data-bd-context="self">Our games <small>Self-scout</small></button>
            <button type="button" data-bd-context="scout">Opponent film <small>Scout</small></button>
            <button type="button" data-bd-context="quick">Quick chart</button>
          </div>
          <button type="button" class="bd-customize" data-bd-customize>Customize fields</button>
          <button type="button" class="bd-game" data-bd-game>Game</button>
          <div class="bd-view-switch" role="group" aria-label="Break Down view">
            <button type="button" class="active" data-bd-view="chart" aria-pressed="true">Chart</button>
            <button type="button" data-bd-view="film-room" aria-pressed="false">Film Room</button>
          </div>
          <div class="bd-play-context" aria-live="polite">
            <span id="bdChartSubject">Our offense</span>
            <strong id="bdCurrentPlay">No play selected</strong>
            <small id="bdPlayMeta">No tag is required</small>
          </div>
          <div class="bd-route-state">
            <span id="bdTagProgress">0 / 0 tagged</span>
            <span id="bdSaveState" class="is-saved">Saved</span>
          </div>
        </header>
        <div class="bd-workspace"><section class="bd-media-column"></section><aside class="bd-coder-column"></aside></div>
      </div>`;
    if (this.unitControl) host.querySelector('.bd-context-units').append(this.unitControl);
    host.querySelector('.bd-media-column').append(this.video, this.grid);
    host.querySelector('.bd-coder-column').append(this.tags);
    this.grid.hidden = true;
    this._bind();
    this.render();
    return true;
  }

  _bind() {
    if (!this._bound) {
      this._bound = true;
      ['play-selected', 'play-created', 'play-updated', 'play-deleted', 'plays-loaded']
        .forEach(event => this.app.tagger?.on(event, () => requestAnimationFrame(() => this.render())));
      this.perspective?.addEventListener('change', () => this.render());
      this.unitControl?.addEventListener('click', () => requestAnimationFrame(() => this.render()));
    }
    this.host?.querySelectorAll('[data-bd-context]').forEach(btn => {
      btn.addEventListener('click', () => this._setContext(btn.dataset.bdContext));
    });
    this.host?.querySelector('[data-bd-customize]')?.addEventListener('click', () => this.app.tagLibrarySettings?.open());
    this.host?.querySelector('[data-bd-game]')?.addEventListener('click', () => document.getElementById('btnEditGame')?.click());
    this.host?.querySelectorAll('[data-bd-view]').forEach(btn => btn.addEventListener('click', () => this._setView(btn.dataset.bdView)));
  }

  _setView(view) {
    const filmRoom = view === 'film-room';
    this.view = filmRoom ? 'film-room' : 'chart';
    this.grid.hidden = !filmRoom;
    this.host?.classList.toggle('bd-film-room-mode', filmRoom);
    this.host?.querySelectorAll('[data-bd-view]').forEach(btn => {
      const active = btn.dataset.bdView === (filmRoom ? 'film-room' : 'chart');
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
    if (!this.perspective) return;
    if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    this.perspective.value = context === 'scout' ? 'scout' : this._unit();
    this.perspective.dispatchEvent(new Event('change', { bubbles: true }));
    this.render();
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
    this.grid.hidden = this.view !== 'film-room';
    const unit = this._unit();
    const scout = this.perspective?.value === 'scout';
    const quick = !!this.app.quickChart?.isActive;
    const unitLabel = unit === 'defense' ? 'defense' : unit === 'special' ? 'Special Teams' : 'offense';
    const subject = this.host.querySelector('#bdChartSubject');
    if (subject) subject.textContent = `${scout ? 'Opponent' : 'Our'} ${unitLabel}`;

    this.host.querySelectorAll('[data-bd-context]').forEach(btn => {
      const active = btn.dataset.bdContext === (quick ? 'quick' : scout ? 'scout' : 'self');
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });

    const play = this.app.tagger?.getCurrentPlay();
    const current = this.host.querySelector('#bdCurrentPlay');
    const meta = this.host.querySelector('#bdPlayMeta');
    if (current) current.textContent = play ? `Play ${play.id}` : 'No play selected';
    if (meta) {
      const down = play?.tags?.down;
      const distance = play?.tags?.distance;
      meta.textContent = down ? `${this._ordinal(down)} & ${distance || '?'} · No tag is required` : 'No tag is required';
    }

    const progress = this.host.querySelector('#bdTagProgress');
    const canonicalProgress = document.getElementById('tagProgressLabel');
    if (progress) progress.textContent = canonicalProgress?.textContent || '0 / 0 tagged';
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
    if (!this.source || !this.video || !this.grid || !this.tags) return;
    if (this.unitControl && this.unitParent) this.unitParent.insertBefore(this.unitControl, this.unitNext);
    this.grid.hidden = false;
    this.source.append(this.video, this.grid, this.tags);
    if (this.host) this.host.innerHTML = '';
    this.host = null;
  }
}
