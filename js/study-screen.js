/** Interactive Study workspace over the parity-locked StudyQuery engine. */
export class StudyScreen {
  static get DIMENSIONS() {
    // E3b review finding: qbAlignment/coverageFamily were 'ready' in the
    // AnalyticsRegistry and fully proven at the query-engine level (registry-set
    // equality, completeness), but this hardcoded list never listed them — so a
    // coach could not select either dimension in Study at all. Positioned next to
    // their structural counterpart (qbAlignment after formation, coverageFamily
    // after coverage), mirroring the Film Room column placement.
    return ['formation', 'qbAlignment', 'playType', 'runPass', 'down', 'distance', 'quarter',
      'drive', 'unit', 'hash', 'personnel', 'backfield', 'strength', 'motion',
      'playDir', 'defFront', 'coverage', 'coverageFamily', 'blitz', 'result', 'playerRole', 'grade',
      'specialTeamsPhase', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore',
      'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts',
      'customTag', 'customField'];
  }

  /** The dimension Study opens on. Stated, not inferred from list order. */
  static get DEFAULT_DIMENSION() { return 'formation'; }

  static get MEASURES() {
    return ['sampleSize', 'successRate', 'runShare', 'passShare',
      'explosiveRate', 'negativeRate', 'turnovers', 'touchdowns', 'havocRate',
      'epaPerPlay'];
  }

  /**
   * AX-7 — the five lenses, applied to the metric picker.
   *
   * A coach picking a primary metric is asking a football question, and the
   * five questions are Efficiency, Explosiveness, Situational, Tendencies and
   * Risk. Situational is a SCOPE rather than a metric, so it has no entry
   * here; it is expressed through the dimension and filters instead.
   *
   * Grouping does NOT preserve overall option order — a group has to gather
   * its members — so anything that depended on "the first option" has to be
   * pinned explicitly. `_bind()` restores the historical default dimension for
   * exactly that reason. Option VALUES are untouched, so every saved view and
   * every query is byte-identical.
   */
  static get MEASURE_LENSES() {
    return [
      { name: 'Efficiency', ids: ['successRate', 'epaPerPlay'] },
      { name: 'Explosiveness', ids: ['explosiveRate', 'touchdowns'] },
      { name: 'Tendencies', ids: ['runShare', 'passShare'] },
      { name: 'Risk', ids: ['negativeRate', 'turnovers', 'havocRate'] },
    ];
  }

  /**
   * Dimensions are the axes a question is broken down BY, not the question
   * itself, so they are grouped by football category rather than forced into
   * the five lenses — calling a coverage shell an "Efficiency" dimension would
   * be a label that means nothing. Every dimension keeps its id and its place;
   * only the surrounding <optgroup> is new.
   */
  static get DIMENSION_GROUPS() {
    return [
      { name: 'Situation', ids: ['down', 'distance', 'quarter', 'drive', 'hash'] },
      { name: 'Offensive look', ids: ['formation', 'qbAlignment', 'backfield', 'strength', 'personnel', 'motion', 'playDir', 'playType', 'runPass'] },
      { name: 'Defensive call', ids: ['defFront', 'coverage', 'coverageFamily', 'blitz'] },
      { name: 'Outcome & risk', ids: ['result', 'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts'] },
      { name: 'Special Teams', ids: ['specialTeamsPhase', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore'] },
      { name: 'Players', ids: ['unit', 'playerRole', 'grade'] },
      { name: 'Custom', ids: ['customTag', 'customField'] },
    ];
  }

  /**
   * Build grouped <option> markup. Anything a group list forgets still ships,
   * under "Other" — a dimension must never become unreachable because someone
   * added it to DIMENSIONS and not to a group. That silent-drop is exactly how
   * qbAlignment and coverageFamily were unselectable for a whole milestone.
   */
  _groupedOptions(ids, groups, lookup) {
    const remaining = new Set(ids);
    const option = id => `<option value="${this._esc(id)}">${this._esc(lookup(id) || id)}</option>`;
    const blocks = groups.map(group => {
      const members = group.ids.filter(id => remaining.has(id));
      members.forEach(id => remaining.delete(id));
      if (!members.length) return '';
      return `<optgroup label="${this._esc(group.name)}">${members.map(option).join('')}</optgroup>`;
    }).filter(Boolean);
    const leftovers = ids.filter(id => remaining.has(id));
    if (leftovers.length) blocks.push(`<optgroup label="Other">${leftovers.map(option).join('')}</optgroup>`);
    return blocks.join('');
  }

  constructor(app) {
    this.app = app;
    this.host = null;
    this.rows = [];
    this.filters = [];
    this._bound = false;
    this._pendingPlanItems = [];
    this._saveCohorts = [];
  }

  mount(host) {
    if (!host || this.host === host) return;
    this.host = host;
    const dimensions = this._groupedOptions(
      StudyScreen.DIMENSIONS,
      StudyScreen.DIMENSION_GROUPS,
      id => this.app.analyticsRegistry.getDimension(id)?.name,
    );
    const measures = this._groupedOptions(
      StudyScreen.MEASURES.filter(id => id !== 'sampleSize'),
      StudyScreen.MEASURE_LENSES,
      id => this.app.analyticsRegistry.getMeasure(id)?.name,
    );
    host.innerHTML = `<div class="ws-study-head"><div><div class="ws-eyebrow">Study the film</div><h1>FIND THE ANSWER</h1><p>Ask a football question. Every result stays linked to video.</p></div><div class="ws-study-actions"><button class="ws-btn" data-study-action="advanced">Advanced Reports</button><button class="ws-btn" data-study-action="save">Save view</button><button class="ws-btn" data-study-action="save-plan">Save to Plan</button><button class="ws-btn ws-primary" data-study-action="watch-all" disabled>Watch results</button></div></div>
      <div class="ws-study-query"><label>Break down by<select id="wsStudyDimension">${dimensions}</select></label><label>Then by<select id="wsStudyColumn"><option value="">Nothing — single list</option>${dimensions}</select></label><label>Scope<select id="wsStudyScope"><option value="game">Current game</option><option value="season">Full season</option><option value="range">Date range</option></select></label><label>Unit<select id="wsStudyUnit"><option value="">All units</option><option value="offense">Offense</option><option value="defense">Defense</option><option value="special">Special Teams</option></select></label><label>Primary metric<select id="wsStudyMeasure">${measures}</select></label><label>Minimum sample<select id="wsStudyMin"><option value="0">Show all</option><option value="3">3 plays</option><option value="5">5 plays</option><option value="10">10 plays</option></select></label><label>Compare<select id="wsStudyCompare"><option value="">No comparison</option><option value="season">Game vs season</option><option value="prior">Game vs prior games</option><option value="rangePrior">Date range vs prior</option></select></label><div class="ws-study-saved"><label>Saved view<select id="wsStudySaved"><option value="">Choose a saved view</option></select></label><button class="ws-icon-btn" data-study-action="delete-view" aria-label="Delete selected view" disabled>×</button></div></div>
      <div class="ws-study-range" id="wsStudyRange" hidden><strong>Date range</strong><label>From<input type="date" id="wsStudyDateFrom"></label><span>through</span><label>To<input type="date" id="wsStudyDateTo"></label><small>Only games with dates are included.</small></div>
      <div class="ws-study-filters"><div class="ws-study-filter-head"><strong>Filters</strong><span>Values within a filter use OR. Filters combine with AND.</span><button class="ws-link" data-study-action="add-filter">+ Add filter</button><button class="ws-link" data-study-action="clear-filters" hidden>Clear</button></div><div id="wsStudyFilters"></div></div>
      <div class="ws-study-summary" id="wsStudySummary"></div><div class="ws-study-warning" id="wsStudyWarning" hidden></div><div class="ws-study-visuals" id="wsStudyVisuals"></div>
      <div class="ws-study-results"><div class="ws-study-table-head"><span>Group</span><span>Plays</span><span id="wsStudyMetricHead">Success</span><span>Run / Pass</span><span id="wsStudyDeltaHead">Explosive</span><span></span></div><div id="wsStudyRows"></div></div>`;
    // AX-7: a <select> with no explicit value selects its FIRST option, and
    // grouping moved which option that is. Study has always opened on
    // Formation; that is a coach-facing default, not a side effect of list
    // order, so it is now stated rather than inherited.
    const dimensionSelect = host.querySelector('#wsStudyDimension');
    if (dimensionSelect && StudyScreen.DIMENSIONS.includes(StudyScreen.DEFAULT_DIMENSION)) {
      dimensionSelect.value = StudyScreen.DEFAULT_DIMENSION;
    }
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
      if (e.target.id === 'wsStudyPlanTarget' || e.target.id === 'wsStudyPlanCohort') this._syncPlanPicker();
      else if (e.target.id === 'wsStudySaved') { this._applyView(e.target.value); this._syncDeleteView(); }
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
      if (action === 'save-plan') this._saveToPlan();
      if (action === 'plan-picker-cancel') this._closePlanPicker();
      if (action === 'plan-picker-save') this._confirmPlanPicker();
      if (action === 'delete-view') this._deleteView();
      if (action === 'watch-all') this.app.filmNavigation.watch(this.rows.flatMap(r => r.refs), { label: 'Study results' });
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
        if (row) this.app.filmNavigation.watch(row.refs, { label: row.label });
      }
    });
  }

  _control(id) { return this.host.querySelector(`#${id}`); }
  _state() {
    return {
      dimension: this._control('wsStudyDimension').value,
      column: this._control('wsStudyColumn')?.value || '',
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
      this._saveCohorts = [];
      this._control('wsStudyVisuals').innerHTML = '';
      this._control('wsStudyRows').innerHTML = `<div class="ws-study-empty">${this._esc(error.message || 'Study could not run this query.')}</div>`;
      return;
    }
    this._control('wsStudyMetricHead').textContent = this.app.analyticsRegistry.getMeasure(state.measure)?.name || state.measure;
    this._control('wsStudyDeltaHead').textContent = state.compare ? 'Delta' : 'Explosive';
    // A second dimension turns the list into a cross-tab. Compare mode already
    // owns the two-cohort view, so the two are mutually exclusive.
    const pivot = !state.compare && state.column && state.column !== state.dimension;
    this.host.classList.toggle('is-pivot', !!pivot);
    if (pivot) this._renderPivot(result, state, sets, args);
    else state.compare ? this._renderCompare(result, state.measure, state.compare) : this._renderQuery(result, state.scope, state.measure, sets.rangeName);
    this._renderWarnings(result.warnings || []);
  }

  _renderQuery(result, scope, measure, rangeName) {
    const groups = result.groups.filter(group => group.sampleSize > 0);
    const matching = [...new Set(groups.flatMap(group => group.matchingPlayIds))];
    this.rows = groups.map(group => ({ label: group.value, refs: group.matchingPlayIds }));
    const scopeLabel = scope === 'game' ? 'current game' : scope === 'range' ? rangeName : 'full season';
    this._saveCohorts = [{ id: 'result', label: scopeLabel, refs: matching }];
    this._control('wsStudySummary').innerHTML = `<strong>${matching.length} matching play${matching.length === 1 ? '' : 's'}</strong><span>${this._esc(this.app.analyticsRegistry.getDimension(result.dimension)?.name || result.dimension)} · ${this._esc(scopeLabel)}</span>`;
    this._control('wsStudyRows').innerHTML = groups.length ? groups.map((group, index) => {
      const m = group.measures;
      return `<div class="ws-study-row${group.belowMinSample ? ' is-small' : ''}"><strong>${this._esc(group.value)}</strong><span>${group.sampleSize}</span><span>${this._measure(measure, m[measure])}</span><span>${this._pct(m.runShare)} / ${this._pct(m.passShare)}</span><span>${this._pct(m.explosiveRate)}</span><button class="ws-btn ws-small" data-study-row="${index}" ${group.matchingPlayIds.length ? '' : 'disabled'}>Watch</button></div>`;
    }).join('') : '<div class="ws-study-empty">No plays match this question.</div>';
    this._renderQueryVisuals(groups, measure, matching);
    this._setWatchAll(matching);
  }

  /**
   * Cross-tab built by COMPOSING the parity-locked query engine, never by
   * recomputing anything here. Each cell is a real `study.run()` grouped by the
   * row dimension with the column value added as an ordinary filter, so its
   * value, sample size, below-min-sample flag and composite `gameId::playId`
   * refs are all engine output. That is what keeps a cell's Watch action playing
   * exactly the plays the cell counted.
   *
   * Cost is 2 + N queries (rows, columns, one per column value). StudyQuery is
   * pure and in-memory, and dimensions are small vocabularies.
   */
  _renderPivot(rowResult, state, sets, args) {
    const plays = sets[state.scope] || [];
    const colValues = this._pivotValues(state.column, plays);
    const rowGroups = rowResult.groups.filter(group => group.sampleSize > 0);
    let colResult;
    try { colResult = this.app.study.run({ ...args, dimension: state.column, plays }); }
    catch { colResult = { groups: [] }; }
    const colTotals = new Map(colResult.groups.map(group => [String(group.value), group]));

    const cells = new Map();
    for (const value of colValues) {
      let res;
      try {
        res = this.app.study.run({
          ...args,
          plays,
          filters: [...args.filters, { dimension: state.column, values: [value] }],
        });
      } catch { continue; }
      // Pivot key = row value + separator + column value. The separator is
      // written as an ESCAPE, never as a literal control character: a raw NUL
      // byte in the source made this whole file read as binary, so ripgrep and
      // the repo's own search tooling silently refused to match anything in
      // it. Same character, same keys — just visible.
      for (const group of res.groups) cells.set(`${group.value}\u0000${value}`, group);
    }

    // Watch targets: every cell, every row total, every column total.
    this.rows = [];
    const cellIndex = new Map();
    const addTarget = (label, refs) => { const i = this.rows.length; this.rows.push({ label, refs }); return i; };

    const measure = state.measure;
    const head = [`<th scope="col" class="ws-pivot-corner">${this._esc(this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension)}</th>`]
      .concat(colValues.map(value => `<th scope="col">${this._esc(value)}</th>`))
      .concat(`<th scope="col" class="ws-pivot-total">Total</th>`).join('');

    const body = rowGroups.map(group => {
      const rowLabel = String(group.value);
      const tds = colValues.map(value => {
        const cell = cells.get(`${rowLabel}\u0000${value}`);
        if (!cell || !cell.sampleSize) return `<td class="ws-pivot-cell is-none"><span class="ws-pivot-value">—</span><span class="ws-pivot-n">no plays</span></td>`;
        const idx = addTarget(`${rowLabel} · ${value}`, cell.matchingPlayIds);
        cellIndex.set(idx, true);
        // Under-sampled cells stay visible and are labelled. Hiding them is how a
        // coach ends up trusting a 2-play cell without knowing it is a 2-play cell.
        const small = cell.belowMinSample ? ' is-small' : '';
        return `<td class="ws-pivot-cell${small}"><button type="button" class="ws-pivot-btn" data-study-row="${idx}" aria-label="Watch ${this._esc(rowLabel)} ${this._esc(value)}, ${cell.sampleSize} play${cell.sampleSize === 1 ? '' : 's'}"><span class="ws-pivot-value">${this._measure(measure, cell.measures[measure])}</span><span class="ws-pivot-n">${cell.sampleSize}${cell.belowMinSample ? ' · low sample' : ''}</span></button></td>`;
      }).join('');
      const totalIdx = addTarget(rowLabel, group.matchingPlayIds);
      const totalCell = `<td class="ws-pivot-cell ws-pivot-total${group.belowMinSample ? ' is-small' : ''}"><button type="button" class="ws-pivot-btn" data-study-row="${totalIdx}" aria-label="Watch all ${this._esc(rowLabel)}, ${group.sampleSize} plays"><span class="ws-pivot-value">${this._measure(measure, group.measures[measure])}</span><span class="ws-pivot-n">${group.sampleSize}${group.belowMinSample ? ' · low sample' : ''}</span></button></td>`;
      return `<tr><th scope="row">${this._esc(rowLabel)}</th>${tds}${totalCell}</tr>`;
    }).join('');

    const footCells = colValues.map(value => {
      const total = colTotals.get(String(value));
      if (!total || !total.sampleSize) return '<td class="ws-pivot-cell is-none"><span class="ws-pivot-value">—</span></td>';
      const idx = addTarget(String(value), total.matchingPlayIds);
      return `<td class="ws-pivot-cell${total.belowMinSample ? ' is-small' : ''}"><button type="button" class="ws-pivot-btn" data-study-row="${idx}" aria-label="Watch all ${this._esc(value)}, ${total.sampleSize} plays"><span class="ws-pivot-value">${this._measure(measure, total.measures[measure])}</span><span class="ws-pivot-n">${total.sampleSize}</span></button></td>`;
    }).join('');

    const matching = [...new Set(rowGroups.flatMap(group => group.matchingPlayIds))];
    const grandIdx = addTarget('All matching plays', matching);
    const scopeLabel = state.scope === 'game' ? 'current game' : state.scope === 'range' ? sets.rangeName : 'full season';
    this._saveCohorts = [{ id: 'result', label: scopeLabel, refs: matching }];
    this._control('wsStudySummary').innerHTML = `<strong>${matching.length} matching play${matching.length === 1 ? '' : 's'}</strong><span>${this._esc(this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension)} × ${this._esc(this.app.analyticsRegistry.getDimension(state.column)?.name || state.column)} · ${this._esc(scopeLabel)}</span>`;
    this._control('wsStudyRows').innerHTML = rowGroups.length && colValues.length
      ? `<div class="ws-pivot-scroll"><table class="ws-pivot"><caption class="ws-pivot-caption">${this._esc(this.app.analyticsRegistry.getMeasure(measure)?.name || measure)} — every cell plays its own film</caption><thead><tr>${head}</tr></thead><tbody>${body}</tbody><tfoot><tr><th scope="row">All</th>${footCells}<td class="ws-pivot-cell ws-pivot-total"><button type="button" class="ws-pivot-btn" data-study-row="${grandIdx}" aria-label="Watch all ${matching.length} matching plays"><span class="ws-pivot-value">${matching.length}</span><span class="ws-pivot-n">plays</span></button></td></tr></tfoot></table></div>`
      : '<div class="ws-study-empty">No plays match this question.</div>';
    this._control('wsStudyVisuals').innerHTML = '';
    this._setWatchAll(matching);
  }

  /** Column vocabulary, capped so a free-text dimension cannot produce a table
   *  a coach has to scroll sideways forever. Capping is by sample size, and the
   *  cap is disclosed in the caption rather than silently truncating. */
  _pivotValues(dimension, plays) {
    const counts = new Map();
    try {
      for (const play of plays) {
        for (const value of this.app.analyticsRegistry.values(dimension, play)) {
          if (!value) continue;
          const key = String(value);
          counts.set(key, (counts.get(key) || 0) + 1);
        }
      }
    } catch { return []; }
    return [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }))
      .slice(0, 12).map(entry => entry[0])
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  _renderCompare(result, measure, compareMode) {
    const rows = result.rows.filter(row => row.a.sampleSize > 0 || row.b.sampleSize > 0);
    const aRefs = [...new Set(rows.flatMap(row => row.a.matchingPlayIds))];
    const bRefs = [...new Set(rows.flatMap(row => row.b.matchingPlayIds))];
    const bothRefs = [...new Set([...aRefs, ...bRefs])];
    this._saveCohorts = [
      { id: 'base', label: result.a.label, refs: aRefs },
      { id: 'against', label: result.b.label, refs: bRefs },
      { id: 'both', label: 'Both cohorts', refs: bothRefs },
    ];
    this.rows = rows.map(row => ({ label: row.value, refs: row.a.matchingPlayIds.length ? row.a.matchingPlayIds : row.b.matchingPlayIds }));
    this._control('wsStudySummary').innerHTML = `<strong>${aRefs.length} vs ${bRefs.length} plays</strong><span>${this._esc(result.a.label)} compared with ${this._esc(result.b.label)}</span>`;
    this._control('wsStudyRows').innerHTML = rows.length ? rows.map((row, index) => {
      const delta = row.deltas[measure];
      const deltaText = delta == null ? '—' : `${delta > 0 ? '+' : ''}${this._measure(measure, delta, false)}`;
      return `<div class="ws-study-row ws-study-row-compare"><strong>${this._esc(row.value)}</strong><span>${row.a.sampleSize} / ${row.b.sampleSize}</span><span>${this._measure(measure, row.a.measures[measure])} / ${this._measure(measure, row.b.measures[measure])}</span><span>${this._pct(row.a.measures.runShare)} / ${this._pct(row.b.measures.runShare)}</span><span class="${this._deltaClass(measure, delta)}">${deltaText}</span><button class="ws-btn ws-small" data-study-row="${index}">Watch</button></div>`;
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

  _renderQueryVisuals(groups, measure, refs) {
    const host = this._control('wsStudyVisuals');
    if (!groups.length) { host.innerHTML = ''; return; }
    const ranked = groups.slice().sort((a, b) => (Number(b.measures[measure]) || 0) - (Number(a.measures[measure]) || 0));
    const top = ranked[0], max = Math.max(1, ...ranked.map(group => Math.abs(Number(group.measures[measure]) || 0)));
    const metricName = this.app.analyticsRegistry.getMeasure(measure)?.name || measure;
    const bars = ranked.slice(0, 8).map(group => {
      const index = groups.indexOf(group), value = Number(group.measures[measure]) || 0;
      const width = Math.max(2, Math.round(Math.abs(value) / max * 100));
      return `<button class="ws-study-bar-row" data-study-row="${index}" aria-label="Watch ${this._esc(group.value)} film"><span>${this._esc(group.value)}</span><i aria-hidden="true"><b style="width:${width}%"></b></i><strong>${this._measure(measure, value)}</strong></button>`;
    }).join('');
    const mix = this._runPassForRefs(refs);
    host.innerHTML = `<section class="ws-study-kpis"><div><span>Matching plays</span><strong>${refs.length}</strong></div><div><span>Highest ${this._esc(metricName)}</span><strong>${this._esc(top.value)}</strong><small>${this._measure(measure, top.measures[measure])}</small></div><div><span>Run / Pass</span><strong>${this._pct(mix.run)} / ${this._pct(mix.pass)}</strong><small>${mix.classified} classified plays</small></div></section><section class="ws-study-chart"><header><strong>${this._esc(metricName)} by group</strong><span>Select a bar to watch film</span></header>${bars}</section>`;
  }

  _renderCompareVisuals(rows, measure, aLabel, bLabel) {
    const host = this._control('wsStudyVisuals');
    if (!rows.length) { host.innerHTML = ''; return; }
    const ranked = rows.slice().sort((a, b) => Math.abs(Number(b.deltas[measure]) || 0) - Math.abs(Number(a.deltas[measure]) || 0));
    const max = Math.max(1, ...ranked.map(row => Math.abs(Number(row.deltas[measure]) || 0)));
    const bars = ranked.slice(0, 8).map(row => {
      const index = rows.indexOf(row), delta = Number(row.deltas[measure]) || 0;
      const width = Math.max(2, Math.round(Math.abs(delta) / max * 50));
      const favorable = this._isFavorableDelta(measure, delta);
      return `<button class="ws-study-delta-row ${favorable ? 'is-favorable' : delta ? 'is-unfavorable' : ''}" data-study-row="${index}" aria-label="Watch ${this._esc(row.value)} film"><span>${this._esc(row.value)}</span><i aria-hidden="true"><b class="${delta < 0 ? 'negative' : ''}" style="width:${width}%"></b></i><strong class="${this._deltaClass(measure, delta)}">${delta > 0 ? '+' : ''}${this._measure(measure, delta, false)}</strong></button>`;
    }).join('');
    host.innerHTML = `<section class="ws-study-chart"><header><strong>Largest changes</strong><span>${this._esc(aLabel)} vs ${this._esc(bLabel)}</span></header>${bars}</section>`;
  }

  _runPassForRefs(refs) {
    const wanted = new Set(refs);
    let run = 0, pass = 0;
    for (const game of (this.app.storage.seasonStore.data?.games || [])) for (const play of (game.plays || [])) {
      if (!wanted.has(`${game.id}::${play.id}`)) continue;
      const values = this.app.analyticsRegistry.values('runPass', play);
      if (values.includes('Run')) run++;
      else if (values.includes('Pass')) pass++;
    }
    const classified = run + pass;
    return { run: classified ? run / classified * 100 : 0, pass: classified ? pass / classified * 100 : 0, classified };
  }

  _lowerIsBetter(measure) { return ['negativeRate', 'turnovers'].includes(measure); }
  _isFavorableDelta(measure, delta) { return delta !== 0 && (this._lowerIsBetter(measure) ? delta < 0 : delta > 0); }
  _deltaClass(measure, delta) { return !delta ? '' : this._isFavorableDelta(measure, delta) ? 'is-positive' : 'is-negative'; }

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
    if (from && to && from === to) return from;
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
    return this.app.filmNavigation.watch(refs, { label });
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
  _saveToPlan() {
    const state = this._state();
    const dimensionName = this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension;
    const measureName = this.app.analyticsRegistry.getMeasure(state.measure)?.name || state.measure;
    const cohorts = this._saveCohorts.filter(cohort => cohort.refs.length).map(cohort => ({
      ...cohort,
      item: this.app.studyPlan.finding({
        dimensionName, measureName, scopeLabel: cohort.label,
        dimension: state.dimension, measure: state.measure, scope: state.scope,
        compare: state.compare || null, cohort: cohort.id, refs: cohort.refs,
      }),
    }));
    if (!cohorts.length) { this.app.tagger.toast?.('No Study results to save'); return; }
    this._openPlanPicker(cohorts);
  }
  _openPlanPicker(items) {
    this._closePlanPicker();
    const plans = this.app.storage.seasonStore.plans();
    const activeId = plans.some(plan => plan.id === this.app.planScreen.activeId) ? this.app.planScreen.activeId : plans[0]?.id;
    const target = activeId || '__new__';
    this._pendingPlanItems = items;
    const item = items[0].item;
    const cohortField = items.length > 1 ? `<label>Film to attach<select id="wsStudyPlanCohort">${items.map(choice => `<option value="${this._esc(choice.id)}">${this._esc(choice.label)} · ${choice.refs.length} play${choice.refs.length === 1 ? '' : 's'}</option>`).join('')}</select></label>` : '';
    const dialog = document.createElement('dialog');
    dialog.className = 'ws-plan-picker';
    dialog.innerHTML = `<form method="dialog"><div class="ws-eyebrow">Save Study finding</div><h2>Choose a game plan</h2><p><strong data-plan-picker-label>${this._esc(item.label || 'Study finding')}</strong><span data-plan-picker-count>${item.refs.length} linked play${item.refs.length === 1 ? '' : 's'} will stay attached.</span></p>${cohortField}<label>Destination<select id="wsStudyPlanTarget">${plans.map(plan => `<option value="${this._esc(plan.id)}"${plan.id === target ? ' selected' : ''}>${this._esc(plan.name)}</option>`).join('')}<option value="__new__"${target === '__new__' ? ' selected' : ''}>Create new plan</option></select></label><label class="ws-plan-picker-name">Plan name<input id="wsStudyPlanName" maxlength="80" value="Game Plan" autocomplete="off"></label><div class="ws-plan-picker-actions"><button class="ws-btn" value="cancel" data-study-action="plan-picker-cancel">Cancel</button><button class="ws-btn ws-primary" value="default" data-study-action="plan-picker-save">Save finding</button></div></form>`;
    dialog.addEventListener('cancel', event => { event.preventDefault(); this._closePlanPicker(); });
    dialog.querySelector('form').addEventListener('submit', event => { event.preventDefault(); this._confirmPlanPicker(); });
    this.host.appendChild(dialog);
    this._syncPlanPicker();
    dialog.showModal();
    requestAnimationFrame(() => (target === '__new__' ? dialog.querySelector('#wsStudyPlanName') : dialog.querySelector('#wsStudyPlanTarget'))?.focus());
  }
  _syncPlanPicker() {
    const dialog = this.host?.querySelector('.ws-plan-picker');
    if (!dialog) return;
    const isNew = dialog.querySelector('#wsStudyPlanTarget')?.value === '__new__';
    dialog.querySelector('.ws-plan-picker-name').hidden = !isNew;
    const choice = this._selectedPlanChoice();
    if (choice) {
      dialog.querySelector('[data-plan-picker-label]').textContent = choice.item.label;
      dialog.querySelector('[data-plan-picker-count]').textContent = `${choice.refs.length} linked play${choice.refs.length === 1 ? '' : 's'} will stay attached.`;
    }
  }
  _selectedPlanChoice() {
    const selected = this.host?.querySelector('#wsStudyPlanCohort')?.value;
    return this._pendingPlanItems.find(choice => choice.id === selected) || this._pendingPlanItems[0] || null;
  }
  _confirmPlanPicker() {
    const dialog = this.host?.querySelector('.ws-plan-picker');
    const choice = this._selectedPlanChoice();
    if (!dialog || !choice) return;
    const store = this.app.storage.seasonStore;
    const target = dialog.querySelector('#wsStudyPlanTarget')?.value;
    let plan = target === '__new__'
      ? store.createPlan(dialog.querySelector('#wsStudyPlanName')?.value.trim() || 'Game Plan')
      : store.getPlan(target);
    if (plan) plan = this.app.planScreen.addFindingTo(plan.id, choice.item);
    if (!plan) { this.app.tagger.toast?.('Could not save this plan finding'); return; }
    this._closePlanPicker();
    this.app.tagger.toast?.(`Saved to ${plan.name}`);
  }
  _closePlanPicker() {
    const dialog = this.host?.querySelector('.ws-plan-picker');
    if (dialog) { if (dialog.open) dialog.close(); dialog.remove(); }
    this._pendingPlanItems = [];
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
