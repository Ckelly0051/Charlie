/** Interactive Study workspace over the parity-locked StudyQuery engine. */
export class StudyScreen {
  static get DIMENSIONS() {
    return ['formation', 'playType', 'runPass', 'down', 'distance', 'quarter',
      'drive', 'unit', 'hash', 'personnel', 'backfield', 'strength', 'motion',
      'playDir', 'defFront', 'coverage', 'blitz', 'result', 'playerRole', 'grade',
      'specialTeamsPhase', 'customTag', 'customField'];
  }

  static get MEASURES() {
    return ['sampleSize', 'successRate', 'runShare', 'passShare',
      'explosiveRate', 'negativeRate', 'turnovers', 'touchdowns', 'havocRate',
      'epaPerPlay'];
  }

  constructor(app) {
    this.app = app;
    this.host = null;
    this.rows = [];
    this.filters = [];
    this._bound = false;
    this._watchToken = 0;
  }

  mount(host) {
    if (!host || this.host === host) return;
    this.host = host;
    const dimensions = StudyScreen.DIMENSIONS.map(id => {
      const item = this.app.analyticsRegistry.getDimension(id);
      return `<option value="${this._esc(id)}">${this._esc(item?.name || id)}</option>`;
    }).join('');
    const measures = StudyScreen.MEASURES.filter(id => id !== 'sampleSize').map(id => {
      const item = this.app.analyticsRegistry.getMeasure(id);
      return `<option value="${this._esc(id)}">${this._esc(item?.name || id)}</option>`;
    }).join('');
    host.innerHTML = `<div class="ws-study-head"><div><div class="ws-eyebrow">Study the film</div><h1>FIND THE ANSWER</h1><p>Ask a football question. Every result stays linked to video.</p></div><div class="ws-study-actions"><button class="ws-btn" data-study-action="advanced">Advanced Reports</button><button class="ws-btn" data-study-action="save">Save view</button><button class="ws-btn ws-primary" data-study-action="watch-all" disabled>Watch results</button></div></div>
      <div class="ws-study-query"><label>Break down by<select id="wsStudyDimension">${dimensions}</select></label><label>Scope<select id="wsStudyScope"><option value="game">Current game</option><option value="season">Full season</option><option value="range">Date range</option></select></label><label>Unit<select id="wsStudyUnit"><option value="">All units</option><option value="offense">Offense</option><option value="defense">Defense</option><option value="special">Special teams</option></select></label><label>Primary metric<select id="wsStudyMeasure">${measures}</select></label><label>Minimum sample<select id="wsStudyMin"><option value="0">Show all</option><option value="3">3 plays</option><option value="5">5 plays</option><option value="10">10 plays</option></select></label><label>Compare<select id="wsStudyCompare"><option value="">No comparison</option><option value="season">Game vs season</option><option value="prior">Game vs prior games</option><option value="rangePrior">Date range vs prior</option></select></label><div class="ws-study-saved"><label>Saved view<select id="wsStudySaved"><option value="">Choose a saved view</option></select></label><button class="ws-icon-btn" data-study-action="delete-view" aria-label="Delete selected view" disabled>×</button></div></div>
      <div class="ws-study-range" id="wsStudyRange" hidden><strong>Date range</strong><label>From<input type="date" id="wsStudyDateFrom"></label><span>through</span><label>To<input type="date" id="wsStudyDateTo"></label><small>Only games with dates are included.</small></div>
      <div class="ws-study-filters"><div class="ws-study-filter-head"><strong>Filters</strong><span>Values within a filter use OR. Filters combine with AND.</span><button class="ws-link" data-study-action="add-filter">+ Add filter</button><button class="ws-link" data-study-action="clear-filters" hidden>Clear</button></div><div id="wsStudyFilters"></div></div>
      <div class="ws-study-summary" id="wsStudySummary"></div><div class="ws-study-warning" id="wsStudyWarning" hidden></div><div class="ws-study-visuals" id="wsStudyVisuals"></div>
      <div class="ws-study-results"><div class="ws-study-table-head"><span>Group</span><span>Plays</span><span id="wsStudyMetricHead">Success</span><span>Run / Pass</span><span id="wsStudyDeltaHead">Explosive</span><span></span></div><div id="wsStudyRows"></div></div>`;
    this._bind();
    this._loadViews();
    this._renderFilters();
  }

  show() {
    if (!this.host) return;
    try { this.app.storage.commitActive(); } catch {}
    this._seedDateRange();
    this.render();
  }

  _bind() {
    if (this._bound) return;
    this._bound = true;
    this.host.addEventListener('change', e => {
      if (e.target.id === 'wsStudySaved') { this._applyView(e.target.value); this._syncDeleteView(); }
      else if (e.target.matches('[data-study-filter-dimension]')) {
        const filter = this.filters[Number(e.target.dataset.studyFilterDimension)];
        if (filter) { filter.dimension = e.target.value; filter.values = []; this._renderFilters(); this.render(); }
      } else if (e.target.matches('[data-study-filter-value]')) {
        const filter = this.filters[Number(e.target.dataset.studyFilterValue)];
        if (filter && e.target.value && !filter.values.includes(e.target.value)) filter.values.push(e.target.value);
        this._renderFilters(); this.render();
      } else if (e.target.matches('select,input')) {
        if (e.target.id === 'wsStudyScope' || e.target.id === 'wsStudyDateFrom' || e.target.id === 'wsStudyDateTo') this._renderFilters();
        this.render();
      }
    });
    this.host.addEventListener('click', e => {
      const action = e.target.closest('[data-study-action]')?.dataset.studyAction;
      if (action === 'advanced') this.app.workspaceShell.showAdvancedReports();
      if (action === 'save') this._saveView();
      if (action === 'delete-view') this._deleteView();
      if (action === 'watch-all') this._watch(this.rows.flatMap(r => r.refs), 'Study results');
      if (action === 'add-filter') { this.filters.push({ dimension: 'down', values: [] }); this._renderFilters(); }
      if (action === 'clear-filters') { this.filters = []; this._renderFilters(); this.render(); }
      const removeFilter = e.target.closest('[data-study-filter-remove]')?.dataset.studyFilterRemove;
      if (removeFilter != null) { this.filters.splice(Number(removeFilter), 1); this._renderFilters(); this.render(); }
      const removeValue = e.target.closest('[data-study-value-remove]')?.dataset.studyValueRemove;
      if (removeValue) {
        const [filterIndex, valueIndex] = removeValue.split(':').map(Number);
        this.filters[filterIndex]?.values.splice(valueIndex, 1); this._renderFilters(); this.render();
      }
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
      measure: this._control('wsStudyMeasure').value,
      minSample: Number(this._control('wsStudyMin').value) || 0,
      compare: this._control('wsStudyCompare').value,
      dateFrom: this._control('wsStudyDateFrom').value,
      dateTo: this._control('wsStudyDateTo').value,
      filters: this.filters.map(filter => ({ dimension: filter.dimension, values: filter.values.slice() })),
    };
  }

  _playSets(state = this._state()) {
    const store = this.app.storage.seasonStore;
    const games = store.data?.games || [];
    const activeId = String(store.data?.activeGameId || '');
    const stamp = game => (game?.plays || []).map(play => ({ ...play, __gid: String(game.id) }));
    const active = games.find(game => String(game.id) === activeId);
    const dated = games.filter(game => /^\d{4}-\d{2}-\d{2}$/.test(game?.gameInfo?.date || ''));
    const rangeGames = dated.filter(game => (!state.dateFrom || game.gameInfo.date >= state.dateFrom) && (!state.dateTo || game.gameInfo.date <= state.dateTo));
    const beforeRange = state.dateFrom ? dated.filter(game => game.gameInfo.date < state.dateFrom) : [];
    return {
      game: stamp(active), season: games.flatMap(stamp),
      prior: games.filter(game => String(game.id) !== activeId).flatMap(stamp),
      range: rangeGames.flatMap(stamp), beforeRange: beforeRange.flatMap(stamp),
      activeName: active ? this._gameName(active) : 'Current game',
      rangeName: this._rangeLabel(state.dateFrom, state.dateTo),
    };
  }

  render() {
    if (!this.host) return;
    const state = this._state();
    const sets = this._playSets(state);
    const filters = [...state.filters, ...(state.unit ? [{ dimension: 'unit', values: [state.unit] }] : [])];
    const args = { dimension: state.dimension, measures: StudyScreen.MEASURES, filters, minSample: state.minSample };
    this._control('wsStudyScope').disabled = !!state.compare;
    this._syncRangeControls(state);
    let result;
    try {
      result = state.compare
        ? state.compare === 'rangePrior'
          ? this.app.study.compare({ ...args, base: sets.range, against: sets.beforeRange, labels: { base: sets.rangeName, against: 'Prior dated games' } })
          : this.app.study.compare({ ...args, base: sets.game, against: sets[state.compare], labels: { base: sets.activeName, against: state.compare === 'prior' ? 'Prior games' : 'Season' } })
        : this.app.study.run({ ...args, plays: sets[state.scope] });
    } catch (error) {
      this.rows = [];
      this._control('wsStudyVisuals').innerHTML = '';
      this._control('wsStudyRows').innerHTML = `<div class="ws-study-empty">${this._esc(error.message || 'Study could not run this query.')}</div>`;
      return;
    }
    this._control('wsStudyMetricHead').textContent = this.app.analyticsRegistry.getMeasure(state.measure)?.name || state.measure;
    this._control('wsStudyDeltaHead').textContent = state.compare ? 'Delta' : 'Explosive';
    state.compare ? this._renderCompare(result, state.measure, state.compare) : this._renderQuery(result, state.scope, state.measure, sets.rangeName);
    this._renderWarnings(result.warnings || []);
  }

  _renderQuery(result, scope, measure, rangeName) {
    const groups = result.groups.filter(group => group.sampleSize > 0);
    const matching = [...new Set(groups.flatMap(group => group.matchingPlayIds))];
    this.rows = groups.map(group => ({ label: group.value, refs: group.matchingPlayIds }));
    const scopeLabel = scope === 'game' ? 'current game' : scope === 'range' ? rangeName : 'full season';
    this._control('wsStudySummary').innerHTML = `<strong>${matching.length} matching play${matching.length === 1 ? '' : 's'}</strong><span>${this._esc(this.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension)} · ${this._esc(scopeLabel)}</span>`;
    this._control('wsStudyRows').innerHTML = groups.length ? groups.map((group, index) => {
      const m = group.measures;
      return `<div class="ws-study-row${group.belowMinSample ? ' is-small' : ''}"><strong>${this._esc(group.value)}</strong><span>${group.sampleSize}</span><span>${this._measure(measure, m[measure])}</span><span>${this._pct(m.runShare)} / ${this._pct(m.passShare)}</span><span>${this._pct(m.explosiveRate)}</span><button class="ws-btn ws-small" data-study-row="${index}" ${group.matchingPlayIds.length ? '' : 'disabled'}>Watch</button></div>`;
    }).join('') : '<div class="ws-study-empty">No plays match this question.</div>';
    this._renderQueryVisuals(groups, measure, matching.length);
    this._setWatchAll(matching);
  }

  _renderCompare(result, measure, compareMode) {
    const rows = result.rows.filter(row => row.a.sampleSize > 0 || row.b.sampleSize > 0);
    const aRefs = [...new Set(rows.flatMap(row => row.a.matchingPlayIds))];
    const bRefs = [...new Set(rows.flatMap(row => row.b.matchingPlayIds))];
    this.rows = rows.map(row => ({ label: row.value, refs: row.a.matchingPlayIds.length ? row.a.matchingPlayIds : row.b.matchingPlayIds }));
    this._control('wsStudySummary').innerHTML = `<strong>${aRefs.length} vs ${bRefs.length} plays</strong><span>${this._esc(result.a.label)} compared with ${this._esc(result.b.label)}</span>`;
    this._control('wsStudyRows').innerHTML = rows.length ? rows.map((row, index) => {
      const delta = row.deltas[measure];
      const deltaText = delta == null ? '—' : `${delta > 0 ? '+' : ''}${this._measure(measure, delta, false)}`;
      return `<div class="ws-study-row ws-study-row-compare"><strong>${this._esc(row.value)}</strong><span>${row.a.sampleSize} / ${row.b.sampleSize}</span><span>${this._measure(measure, row.a.measures[measure])} / ${this._measure(measure, row.b.measures[measure])}</span><span>${this._pct(row.a.measures.runShare)} / ${this._pct(row.b.measures.runShare)}</span><span class="${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}">${deltaText}</span><button class="ws-btn ws-small" data-study-row="${index}">Watch</button></div>`;
    }).join('') : '<div class="ws-study-empty">No plays are available to compare.</div>';
    this._renderCompareVisuals(rows, measure, result.a.label, result.b.label);
    this._setWatchAll(aRefs, compareMode === 'rangePrior' ? 'Watch date range' : 'Watch current game');
  }

  _renderWarnings(warnings) {
    const el = this._control('wsStudyWarning');
    el.hidden = !warnings.length;
    el.textContent = warnings.length ? `${warnings.length} group${warnings.length === 1 ? '' : 's'} below the selected minimum sample. Results remain visible.` : '';
  }

  _setWatchAll(refs, label = 'Watch results') {
    const unique = [...new Set(refs)];
    const button = this.host.querySelector('[data-study-action="watch-all"]');
    button.disabled = !unique.length;
    button.textContent = unique.length ? `${label} · ${unique.length}` : label;
  }

  _filterDimensions() {
    const excluded = new Set(['team', 'season', 'game', 'opponent', 'date']);
    return this.app.analyticsRegistry.listDimensions()
      .filter(item => item.availability === 'ready' && !excluded.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  _renderQueryVisuals(groups, measure, total) {
    const host = this._control('wsStudyVisuals');
    if (!groups.length) { host.innerHTML = ''; return; }
    const ranked = groups.slice().sort((a, b) => (Number(b.measures[measure]) || 0) - (Number(a.measures[measure]) || 0));
    const top = ranked[0], max = Math.max(1, ...ranked.map(group => Math.abs(Number(group.measures[measure]) || 0)));
    const metricName = this.app.analyticsRegistry.getMeasure(measure)?.name || measure;
    const bars = ranked.slice(0, 8).map(group => {
      const index = groups.indexOf(group), value = Number(group.measures[measure]) || 0;
      const width = Math.max(2, Math.round(Math.abs(value) / max * 100));
      return `<button class="ws-study-bar-row" data-study-row="${index}"><span>${this._esc(group.value)}</span><i><b style="width:${width}%"></b></i><strong>${this._measure(measure, value)}</strong></button>`;
    }).join('');
    const weighted = key => groups.reduce((sum, group) => sum + (Number(group.measures[key]) || 0) * group.sampleSize, 0) / Math.max(1, total);
    host.innerHTML = `<section class="ws-study-kpis"><div><span>Matching plays</span><strong>${total}</strong></div><div><span>Top ${this._esc(metricName)}</span><strong>${this._esc(top.value)}</strong><small>${this._measure(measure, top.measures[measure])}</small></div><div><span>Run / Pass</span><strong>${this._pct(weighted('runShare'))} / ${this._pct(weighted('passShare'))}</strong><small>${groups.length} groups</small></div></section><section class="ws-study-chart"><header><strong>${this._esc(metricName)} by group</strong><span>Select a bar to watch film</span></header>${bars}</section>`;
  }

  _renderCompareVisuals(rows, measure, aLabel, bLabel) {
    const host = this._control('wsStudyVisuals');
    if (!rows.length) { host.innerHTML = ''; return; }
    const ranked = rows.slice().sort((a, b) => Math.abs(Number(b.deltas[measure]) || 0) - Math.abs(Number(a.deltas[measure]) || 0));
    const max = Math.max(1, ...ranked.map(row => Math.abs(Number(row.deltas[measure]) || 0)));
    const bars = ranked.slice(0, 8).map(row => {
      const index = rows.indexOf(row), delta = Number(row.deltas[measure]) || 0;
      const width = Math.max(2, Math.round(Math.abs(delta) / max * 50));
      return `<button class="ws-study-delta-row" data-study-row="${index}"><span>${this._esc(row.value)}</span><i><b class="${delta < 0 ? 'negative' : ''}" style="width:${width}%"></b></i><strong class="${delta > 0 ? 'is-positive' : delta < 0 ? 'is-negative' : ''}">${delta > 0 ? '+' : ''}${this._measure(measure, delta, false)}</strong></button>`;
    }).join('');
    host.innerHTML = `<section class="ws-study-chart"><header><strong>Largest changes</strong><span>${this._esc(aLabel)} vs ${this._esc(bLabel)}</span></header>${bars}</section>`;
  }

  _seedDateRange() {
    const from = this._control('wsStudyDateFrom'), to = this._control('wsStudyDateTo');
    if (!from || !to || from.value || to.value) return;
    const dates = (this.app.storage.seasonStore.data?.games || [])
      .map(game => game?.gameInfo?.date || '').filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    if (dates.length) { from.value = dates[0]; to.value = dates[dates.length - 1]; }
  }

  _syncRangeControls(state) {
    this._control('wsStudyRange').hidden = state.scope !== 'range' && state.compare !== 'rangePrior';
    const from = this._control('wsStudyDateFrom'), to = this._control('wsStudyDateTo');
    from.max = state.dateTo || ''; to.min = state.dateFrom || '';
  }

  _rangeLabel(from, to) {
    if (from && to) return `${from} through ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Through ${to}`;
    return 'Selected date range';
  }

  _filterValues(dimension) {
    const state = this._state();
    const sets = this._playSets();
    const plays = state.scope === 'game' ? sets.game : sets.season;
    const values = new Set();
    try {
      for (const play of plays) {
        for (const value of this.app.analyticsRegistry.values(dimension, play)) if (value) values.add(String(value));
      }
    } catch { return []; }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  _renderFilters() {
    if (!this.host) return;
    const container = this._control('wsStudyFilters');
    const dimensions = this._filterDimensions();
    container.innerHTML = this.filters.map((filter, filterIndex) => {
      const dimensionOptions = dimensions.map(item => `<option value="${this._esc(item.id)}"${item.id === filter.dimension ? ' selected' : ''}>${this._esc(item.name)}</option>`).join('');
      const selected = filter.values.map((value, valueIndex) => `<button class="ws-study-filter-chip" data-study-value-remove="${filterIndex}:${valueIndex}" title="Remove ${this._esc(value)}">${this._esc(value)} ×</button>`).join('');
      const available = this._filterValues(filter.dimension).filter(value => !filter.values.includes(value));
      const valueOptions = available.map(value => `<option value="${this._esc(value)}">${this._esc(value)}</option>`).join('');
      return `<div class="ws-study-filter-row"><select data-study-filter-dimension="${filterIndex}" aria-label="Filter dimension">${dimensionOptions}</select><div class="ws-study-filter-values">${selected || '<span>Any value</span>'}</div><select data-study-filter-value="${filterIndex}" aria-label="Add filter value"><option value="">Add value…</option>${valueOptions}</select><button class="ws-icon-btn" data-study-filter-remove="${filterIndex}" aria-label="Remove filter">×</button></div>`;
    }).join('');
    this.host.querySelector('[data-study-action="clear-filters"]').hidden = !this.filters.length;
  }

  async _watch(refs, label) {
    const unique = [...new Set(refs || [])];
    if (!unique.length) return;
    const games = this.app.storage.seasonStore.data?.games || [];
    const plan = this.app.crossGameCutup.plan(unique, games);
    if (!plan.total) {
      this.app.tagger.toast?.(`No playable film found${plan.skipped.length ? ` · ${plan.skipped.length} skipped` : ''}`);
      return;
    }
    const token = ++this._watchToken;
    this.app.cutupPlayer?.stop('replaced');
    const playable = [];
    const unresolved = plan.skipped.length;
    let unavailable = 0;
    const activeId = String(this.app.storage.seasonStore.data?.activeGameId || '');
    const hasActiveVideo = !!this.app.vc?.video?.src;
    for (const game of plan.games) {
      const node = games.find(item => String(item.id) === String(game.gameId));
      let health = null;
      try { health = await this.app.workspace.filmHealth(node); } catch {}
      if (token !== this._watchToken) return;
      if (health?.ready || (String(game.gameId) === activeId && hasActiveVideo)) playable.push(game);
      else unavailable += game.count;
    }
    if (!playable.length) {
      const skipped = unresolved + unavailable;
      this.app.tagger.toast?.(`No matching film is available${skipped ? ` · ${skipped} play${skipped === 1 ? '' : 's'} skipped` : ''}`);
      return;
    }
    const launchGameId = this.app.storage.seasonStore.data?.activeGameId;
    // Save live charting once. Intermediate reel hops are read-only and remain
    // transient; the persisted active game therefore stays at the launch scope.
    this.app.storage.commitActive();
    this.app.storage.seasonStore.persist();
    await this.app.workspaceShell.show('breakdown');
    let gamesPlayed = 0;
    try {
      for (let index = 0; index < playable.length; index++) {
        if (token !== this._watchToken) return;
        const game = playable[index];
        const loaded = await this.app.storage.switchToGame(game.gameId, {
          commit: false, persist: false, reloadActiveFilm: true,
        });
        if (token !== this._watchToken) return;
        if (!loaded) { unavailable += game.count; continue; }
        this.app.workspaceShell._syncChrome?.();
        const wanted = new Set(plan.segments
          .filter(segment => segment.gameId === game.gameId)
          .map(segment => String(segment.playId)));
        const ids = (this.app.tagger.plays || [])
          .filter(play => wanted.has(String(play.id)))
          .map(play => play.id);
        unavailable += Math.max(0, wanted.size - ids.length);
        if (!ids.length) continue;
        const skipped = unresolved + unavailable;
        const context = `${label} · ${game.gameName} · Game ${index + 1} of ${playable.length}${skipped ? ` · ${skipped} skipped` : ''}`;
        const result = await this.app.cutupPlayer.start(ids, context);
        if (!result?.completed) return;
        gamesPlayed++;
      }
      if (token === this._watchToken) {
        const played = plan.total - unavailable;
        const skipped = unresolved + unavailable;
        this.app.tagger.toast?.(`Finished ${played} play${played === 1 ? '' : 's'} across ${gamesPlayed} game${gamesPlayed === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}`);
      }
    } finally {
      if (token === this._watchToken && launchGameId != null
        && this.app.storage.seasonStore.data?.activeGameId !== launchGameId) {
        await this.app.storage.switchToGame(launchGameId, {
          commit: false, persist: false, reloadActiveFilm: true,
        });
        this.app.workspaceShell._syncChrome?.();
      }
    }
  }

  _views() { try { const views = JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]'); return Array.isArray(views) ? views : []; } catch { return []; } }
  _loadViews(selected = '') {
    const select = this._control('wsStudySaved');
    const views = this._views();
    select.innerHTML = '<option value="">Choose a saved view</option>' + views.map(view => `<option value="${this._esc(view.id)}"${view.id === selected ? ' selected' : ''}>${this._esc(view.name)}</option>`).join('');
    this._syncDeleteView();
  }
  _saveView() {
    const state = this._state();
    const dimension = this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension;
    const comparison = state.compare === 'rangePrior' ? 'Range vs prior' : state.compare === 'prior' ? 'Game vs prior' : state.compare === 'season' ? 'Game vs season' : state.scope === 'game' ? 'Current game' : state.scope === 'range' ? 'Date range' : 'Season';
    const name = `${dimension} · ${comparison}${state.unit ? ` · ${state.unit}` : ''}${state.filters.length ? ` · ${state.filters.length} filter${state.filters.length === 1 ? '' : 's'}` : ''}`;
    const views = this._views();
    const id = `${state.dimension}|${state.scope}|${state.unit}|${state.measure}|${state.minSample}|${state.compare}|${state.dateFrom}|${state.dateTo}|${JSON.stringify(state.filters)}`;
    const next = [...views.filter(view => view.id !== id), { id, name, state }].slice(-12);
    try { localStorage.setItem('ffa_study_views_v1', JSON.stringify(next)); }
    catch { this.app.tagger.toast?.('Could not save this Study view'); return; }
    this._loadViews(id);
    this.app.tagger.toast?.(`Saved Study view: ${name}`);
  }
  _applyView(id) {
    const view = this._views().find(item => item.id === id);
    if (!view) return;
    this._control('wsStudyDimension').value = view.state.dimension;
    this._control('wsStudyScope').value = view.state.scope;
    this._control('wsStudyUnit').value = view.state.unit;
    this._control('wsStudyMeasure').value = view.state.measure || 'successRate';
    this._control('wsStudyMin').value = String(view.state.minSample);
    this._control('wsStudyCompare').value = view.state.compare === true ? 'season' : (view.state.compare || '');
    this._control('wsStudyDateFrom').value = view.state.dateFrom || '';
    this._control('wsStudyDateTo').value = view.state.dateTo || '';
    this.filters = Array.isArray(view.state.filters) ? view.state.filters
      .filter(filter => this.app.analyticsRegistry.getDimension(filter.dimension)?.availability === 'ready')
      .map(filter => ({ dimension: filter.dimension, values: (filter.values || []).map(String) })) : [];
    this._renderFilters();
    this.render();
  }
  _syncDeleteView() {
    const button = this.host?.querySelector('[data-study-action="delete-view"]');
    if (button) button.disabled = !this._control('wsStudySaved')?.value;
  }
  _deleteView() {
    const id = this._control('wsStudySaved').value;
    if (!id) return;
    const next = this._views().filter(view => view.id !== id);
    try { localStorage.setItem('ffa_study_views_v1', JSON.stringify(next)); } catch { return; }
    this._loadViews();
    this.app.tagger.toast?.('Study view deleted');
  }

  _gameName(game) { return game.name || game.gameInfo?.projectName || game.gameInfo?.opponent || 'Current game'; }
  _pct(value) { const n = Number(value); return Number.isFinite(n) ? `${this._number(n)}%` : '—'; }
  _measure(id, value, suffix = true) {
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    if (['successRate', 'runShare', 'passShare', 'explosiveRate', 'negativeRate', 'havocRate'].includes(id)) return `${this._number(n)}${suffix ? '%' : ' pts'}`;
    if (id === 'epaPerPlay') return this._number(n);
    return this._number(n);
  }
  _number(value) { return Number(value).toFixed(1).replace(/\.0$/, ''); }
  _esc(value) { return String(value ?? '').replace(/[&<>"]/g, char => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[char])); }
}
