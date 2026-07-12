/** Interactive Study workspace over the parity-locked StudyQuery engine. */
export class StudyScreen {
  static get DIMENSIONS() {
    return ['formation', 'playType', 'runPass', 'down', 'personnel', 'backfield',
      'strength', 'motion', 'playDir', 'defFront', 'coverage', 'blitz', 'quarter',
      'result', 'unit'];
  }

  static get MEASURES() {
    return ['sampleSize', 'successRate', 'runShare', 'passShare',
      'explosiveRate', 'negativeRate', 'epaPerPlay'];
  }

  constructor(app) {
    this.app = app;
    this.host = null;
    this.rows = [];
    this._bound = false;
  }

  mount(host) {
    if (!host || this.host === host) return;
    this.host = host;
    const dimensions = StudyScreen.DIMENSIONS.map(id => {
      const item = this.app.analyticsRegistry.getDimension(id);
      return `<option value="${this._esc(id)}">${this._esc(item?.name || id)}</option>`;
    }).join('');
    host.innerHTML = `<div class="ws-study-head"><div><div class="ws-eyebrow">Study the film</div><h1>FIND THE ANSWER</h1><p>Ask a football question. Every result stays linked to video.</p></div><div class="ws-study-actions"><button class="ws-btn" data-study-action="advanced">Advanced Reports</button><button class="ws-btn" data-study-action="save">Save view</button><button class="ws-btn ws-primary" data-study-action="watch-all" disabled>Watch results</button></div></div>
      <div class="ws-study-query"><label>Break down by<select id="wsStudyDimension">${dimensions}</select></label><label>Scope<select id="wsStudyScope"><option value="game">Current game</option><option value="season">Full season</option></select></label><label>Unit<select id="wsStudyUnit"><option value="">All units</option><option value="offense">Offense</option><option value="defense">Defense</option><option value="special">Special teams</option></select></label><label>Minimum sample<select id="wsStudyMin"><option value="0">Show all</option><option value="3">3 plays</option><option value="5">5 plays</option><option value="10">10 plays</option></select></label><label class="ws-study-compare"><input type="checkbox" id="wsStudyCompare"> Compare game vs season</label><label>Saved view<select id="wsStudySaved"><option value="">Choose a saved view</option></select></label></div>
      <div class="ws-study-summary" id="wsStudySummary"></div><div class="ws-study-warning" id="wsStudyWarning" hidden></div>
      <div class="ws-study-results"><div class="ws-study-table-head"><span>Group</span><span>Plays</span><span>Success</span><span>Run / Pass</span><span>Explosive</span><span></span></div><div id="wsStudyRows"></div></div>`;
    this._bind();
    this._loadViews();
  }

  show() {
    if (!this.host) return;
    try { this.app.storage.commitActive(); } catch {}
    this.render();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    this.host.addEventListener('change', e => {
      if (e.target.id === 'wsStudySaved') this._applyView(e.target.value);
      else if (e.target.matches('select,input')) this.render();
    });
    this.host.addEventListener('click', e => {
      const action = e.target.closest('[data-study-action]')?.dataset.studyAction;
      if (action === 'advanced') this.app.workspaceShell.showAdvancedReports();
      if (action === 'save') this._saveView();
      if (action === 'watch-all') this._watch(this.rows.flatMap(r => r.refs), 'Study results');
      const index = e.target.closest('[data-study-row]')?.dataset.studyRow;
      if (index != null) {
        const row = this.rows[Number(index)];
        if (row) this._watch(row.refs, row.label);
      }
    });
  }

  _control(id) { return this.host.querySelector(`#${id}`); }
  _state() {
    return {
      dimension: this._control('wsStudyDimension').value,
      scope: this._control('wsStudyScope').value,
      unit: this._control('wsStudyUnit').value,
      minSample: Number(this._control('wsStudyMin').value) || 0,
      compare: this._control('wsStudyCompare').checked,
    };
  }

  _playSets() {
    const store = this.app.storage.seasonStore;
    const games = store.data?.games || [];
    const activeId = String(store.data?.activeGameId || '');
    const stamp = game => (game?.plays || []).map(play => ({ ...play, __gid: String(game.id) }));
    const active = games.find(game => String(game.id) === activeId);
    return { game: stamp(active), season: games.flatMap(stamp), activeName: active ? this._gameName(active) : 'Current game' };
  }

  render() {
    if (!this.host) return;
    const state = this._state();
    const sets = this._playSets();
    const filters = state.unit ? [{ dimension: 'unit', values: [state.unit] }] : [];
    const args = { dimension: state.dimension, measures: StudyScreen.MEASURES, filters, minSample: state.minSample };
    let result;
    try {
      result = state.compare
        ? this.app.study.compare({ ...args, base: sets.game, against: sets.season, labels: { base: sets.activeName, against: 'Season' } })
        : this.app.study.run({ ...args, plays: sets[state.scope] });
    } catch (error) {
      this.rows = [];
      this._control('wsStudyRows').innerHTML = `<div class="ws-study-empty">${this._esc(error.message || 'Study could not run this query.')}</div>`;
      return;
    }
    state.compare ? this._renderCompare(result) : this._renderQuery(result, state.scope);
    this._renderWarnings(result.warnings || []);
  }

  _renderQuery(result, scope) {
    const groups = result.groups.filter(group => group.sampleSize > 0);
    const matching = [...new Set(groups.flatMap(group => group.matchingPlayIds))];
    this.rows = groups.map(group => ({ label: group.value, refs: group.matchingPlayIds }));
    this._control('wsStudySummary').innerHTML = `<strong>${matching.length} matching play${matching.length === 1 ? '' : 's'}</strong><span>${this._esc(this.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension)} · ${scope === 'game' ? 'current game' : 'full season'}</span>`;
    this._control('wsStudyRows').innerHTML = groups.length ? groups.map((group, index) => {
      const m = group.measures;
      return `<div class="ws-study-row${group.belowMinSample ? ' is-small' : ''}"><strong>${this._esc(group.value)}</strong><span>${group.sampleSize}</span><span>${this._pct(m.successRate)}</span><span>${this._pct(m.runShare)} / ${this._pct(m.passShare)}</span><span>${this._pct(m.explosiveRate)}</span><button class="ws-btn ws-small" data-study-row="${index}" ${group.matchingPlayIds.length ? '' : 'disabled'}>Watch</button></div>`;
    }).join('') : '<div class="ws-study-empty">No plays match this question.</div>';
    this._setWatchAll(matching);
  }

  _renderCompare(result) {
    const rows = result.rows.filter(row => row.a.sampleSize > 0 || row.b.sampleSize > 0);
    const aRefs = [...new Set(rows.flatMap(row => row.a.matchingPlayIds))];
    const bRefs = [...new Set(rows.flatMap(row => row.b.matchingPlayIds))];
    this.rows = rows.map(row => ({ label: row.value, refs: row.a.matchingPlayIds.length ? row.a.matchingPlayIds : row.b.matchingPlayIds }));
    this._control('wsStudySummary').innerHTML = `<strong>${aRefs.length} vs ${bRefs.length} plays</strong><span>${this._esc(result.a.label)} compared with ${this._esc(result.b.label)}</span>`;
    this._control('wsStudyRows').innerHTML = rows.length ? rows.map((row, index) => {
      const delta = row.deltas.successRate;
      const deltaText = delta == null ? '—' : `${delta > 0 ? '+' : ''}${this._number(delta)} pts`;
      return `<div class="ws-study-row ws-study-row-compare"><strong>${this._esc(row.value)}</strong><span>${row.a.sampleSize} / ${row.b.sampleSize}</span><span>${this._pct(row.a.measures.successRate)} / ${this._pct(row.b.measures.successRate)}</span><span>${this._pct(row.a.measures.runShare)} / ${this._pct(row.b.measures.runShare)}</span><span class="${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}">${deltaText}</span><button class="ws-btn ws-small" data-study-row="${index}">Watch</button></div>`;
    }).join('') : '<div class="ws-study-empty">No plays are available to compare.</div>';
    this._setWatchAll(aRefs);
  }

  _renderWarnings(warnings) {
    const el = this._control('wsStudyWarning');
    el.hidden = !warnings.length;
    el.textContent = warnings.length ? `${warnings.length} group${warnings.length === 1 ? '' : 's'} below the selected minimum sample. Results remain visible.` : '';
  }

  _setWatchAll(refs) {
    const unique = [...new Set(refs)];
    const button = this.host.querySelector('[data-study-action="watch-all"]');
    button.disabled = !unique.length;
    button.textContent = unique.length ? `Watch results · ${unique.length}` : 'Watch results';
  }

  async _watch(refs, label) {
    const unique = [...new Set(refs || [])];
    if (!unique.length) return;
    const activeId = String(this.app.storage.seasonStore.data?.activeGameId || '');
    const gameIds = [...new Set(unique.map(ref => String(ref).split('::')[0]))];
    const gameId = gameIds.includes(activeId) ? activeId : gameIds[0];
    if (gameId !== activeId) this.app.storage.switchToGame(gameId);
    const ids = new Set(unique.filter(ref => String(ref).startsWith(`${gameId}::`)).map(ref => String(ref).slice(String(ref).indexOf('::') + 2)));
    await this.app.workspaceShell.show('breakdown');
    this.app.stats._watchPlays(play => ids.has(String(play.id)), label);
    if (gameIds.length > 1) this.app.tagger.toast?.(`Opened ${ids.size} matching plays from this game. Study keeps ${unique.length} matches across ${gameIds.length} games.`);
  }

  _views() { try { return JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]'); } catch { return []; } }
  _loadViews(selected = '') {
    const select = this._control('wsStudySaved');
    const views = this._views();
    select.innerHTML = '<option value="">Choose a saved view</option>' + views.map(view => `<option value="${this._esc(view.id)}"${view.id === selected ? ' selected' : ''}>${this._esc(view.name)}</option>`).join('');
  }
  _saveView() {
    const state = this._state();
    const dimension = this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension;
    const name = `${dimension} · ${state.compare ? 'Game vs season' : state.scope === 'game' ? 'Current game' : 'Season'}${state.unit ? ` · ${state.unit}` : ''}`;
    const views = this._views();
    const id = `${state.dimension}|${state.scope}|${state.unit}|${state.minSample}|${state.compare}`;
    const next = [...views.filter(view => view.id !== id), { id, name, state }].slice(-12);
    localStorage.setItem('ffa_study_views_v1', JSON.stringify(next));
    this._loadViews(id);
    this.app.tagger.toast?.(`Saved Study view: ${name}`);
  }
  _applyView(id) {
    const view = this._views().find(item => item.id === id);
    if (!view) return;
    this._control('wsStudyDimension').value = view.state.dimension;
    this._control('wsStudyScope').value = view.state.scope;
    this._control('wsStudyUnit').value = view.state.unit;
    this._control('wsStudyMin').value = String(view.state.minSample);
    this._control('wsStudyCompare').checked = !!view.state.compare;
    this.render();
  }

  _gameName(game) { return game.name || game.gameInfo?.projectName || game.gameInfo?.opponent || 'Current game'; }
  _pct(value) { const n = Number(value); return Number.isFinite(n) ? `${this._number(n)}%` : '—'; }
  _number(value) { return Number(value).toFixed(1).replace(/\.0$/, ''); }
  _esc(value) { return String(value ?? '').replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char])); }
}
