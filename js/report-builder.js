import { countedUnit } from './football-rules.js';
import { PenaltyModel } from './penalty-model.js';
import { StudyQuery } from './study-query.js';

/**
 * Dashboards: the coach's own reports, built from views, metrics, groupings and
 * filters (docs/REPORTS-CONTRACTS.md > Dashboards). Pure and DOM-free. Every
 * number comes from an existing formula owner: AnalyticsMetrics through
 * `registry.metricsEngine()`, registry measures read off `StatsEngine.compute()`,
 * and `StatsEngine.playersBoard()` for leaders. Filters use StudyQuery's cohort
 * rule. A group holds the plays whose registry value matches, on either unit:
 * the report cut filters are unit-gated (an offense look matches only
 * offensive snaps), and a defensive dashboard groups by the offense it faced.
 * Every value carries the film refs behind it; nothing is estimated.
 */
export class ReportBuilder {
  static VERSION = 1;

  /** How a widget shows its numbers. */
  static VIEWS = Object.freeze([
    { id: 'kpi', name: 'Number', needs: [] },
    { id: 'bar', name: 'Bar chart', needs: ['dimension'] },
    { id: 'share', name: 'Share', needs: ['dimension', 'split'] },
    { id: 'trend', name: 'Game by game', needs: [] },
    { id: 'matrix', name: 'Heat map', needs: ['dimension', 'dimension2'] },
    { id: 'table', name: 'Table', needs: ['dimension'] },
    { id: 'leaders', name: 'Leaders', needs: ['role'] },
  ]);

  /**
   * The metrics a widget can show. `concept` metrics resolve to the
   * offense-produced or defense-framed AnalyticsMetrics id by the dashboard's
   * unit, so a rate always reads the right way round; `measure` reads a
   * registry measure off compute(); `count` is the cohort size.
   */
  static METRICS = Object.freeze([
    { id: 'plays', name: 'Plays', group: 'Volume', kind: 'count', format: 'count', polarity: 'neutral' },
    { id: 'success', group: 'Efficiency', kind: 'concept', format: 'pct',
      offense: { id: 'successRate', name: 'Success Rate' }, defense: { id: 'stopRate', name: 'Stop Rate' } },
    { id: 'yards', group: 'Efficiency', kind: 'concept', format: 'dec1',
      offense: { id: 'yardsPerPlay', name: 'Yards / Play' }, defense: { id: 'yardsAllowedPerPlay', name: 'Yards Allowed / Play' } },
    { id: 'explosive', group: 'Big plays', kind: 'concept', format: 'pct',
      offense: { id: 'explosiveRate', name: 'Explosive Plays Rate' }, defense: { id: 'explosivesAllowedRate', name: 'Explosive Plays Allowed' } },
    { id: 'negative', group: 'Big plays', kind: 'concept', format: 'pct',
      offense: { id: 'negativeRate', name: 'Negative Play Rate' }, defense: { id: 'negativeRateForced', name: 'Negative Plays Forced' } },
    { id: 'havoc', group: 'Big plays', kind: 'concept', format: 'pct',
      offense: { id: 'havocRateAllowed', name: 'Havoc Allowed' }, defense: { id: 'havocRate', name: 'Havoc Rate' } },
    { id: 'runShare', name: 'Run %', group: 'Tendency', kind: 'share', share: 'run', format: 'pct', polarity: 'neutral' },
    { id: 'passShare', name: 'Pass %', group: 'Tendency', kind: 'share', share: 'pass', format: 'pct', polarity: 'neutral' },
    { id: 'completionRate', name: 'Completion %', group: 'Passing', kind: 'metric', metric: 'completionRate', format: 'pct', passOnly: true },
    { id: 'touchdowns', name: 'Touchdowns', group: 'Scoring', kind: 'metric', metric: 'touchdowns', format: 'count' },
    { id: 'turnovers', name: 'Turnovers', group: 'Scoring', kind: 'measure', measure: 'turnovers', format: 'count', polarity: 'lower', offenseOnly: true },
    { id: 'epa', name: 'EPA / Play', group: 'Advanced', kind: 'measure', measure: 'epaPerPlay', format: 'dec2', offenseOnly: true },
    { id: 'penaltiesUs', name: 'Penalties on Us', group: 'Penalties', kind: 'measure', measure: 'penaltyAcceptedSubject', format: 'count', polarity: 'lower' },
    { id: 'penaltyYardsUs', name: 'Penalty Yards on Us', group: 'Penalties', kind: 'measure', measure: 'penaltyYardsSubject', format: 'count', polarity: 'lower' },
  ]);

  /** What a widget can group by, in the order the editor lists them. */
  static DIMENSIONS = Object.freeze([
    { group: 'Situation', ids: ['down', 'distanceBand', 'fieldZone', 'quarter', 'hash', 'game'] },
    { group: 'Offense look', ids: ['formationFamily', 'personnel', 'backfield', 'qbAlignment', 'strength', 'receiverSet', 'motion'] },
    { group: 'Play', ids: ['runPass', 'playType', 'playCall', 'playConcept', 'playDir', 'gap', 'result'] },
    { group: 'Play details', ids: ['motionStart', 'motionEnd', 'rpoRead', 'rpoDecision', 'qbRun'] },
    { group: 'Tackling', ids: ['missedTackles'] },
    { group: 'Defense look', ids: ['defFront', 'coverage', 'coverageFamily', 'blitz'] },
    { group: 'Special Teams', ids: ['specialTeamsUnit', 'specialTeamsOutcome'] },
    { group: 'Penalties', ids: ['penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase'] },
  ]);

  /** Distance bands over the charted distance; the one grouping this module
   *  owns, because a raw distance has too many values to read. */
  /** Field zones in field order (StatsEngine._fieldZone's bands). */
  static ZONE_ORDER = Object.freeze(['Backed up', 'Own 11–39', 'Midfield', 'Opp 40–20', 'Red zone', 'Goal line']);

  static DISTANCE_BANDS = Object.freeze([['Short (1-3)', 1, 3], ['Medium (4-6)', 4, 6], ['Long (7-10)', 7, 10], ['Very long (11+)', 11, Infinity]]);

  /** Players leaders: a `playersBoard` role and the stat to rank on. */
  static LEADERS = Object.freeze([
    { id: 'tackles', name: 'Tackles', role: 'tackles', stat: 'tkl', read: 'count' },
    { id: 'missedTackles', name: 'Missed Tackles', role: 'tackles', stat: 'mtkl', read: 'count' },
    { id: 'tfl', name: 'Tackles for Loss', role: 'tackles', stat: 'tfl', read: 'count' },
    { id: 'rushYards', name: 'Rushing Yards', role: 'rushing', stat: 'yds', read: 'total' },
    { id: 'carries', name: 'Carries', role: 'rushing', stat: 'att', read: 'count' },
    { id: 'passYards', name: 'Passing Yards', role: 'passing', stat: 'yds', read: 'total' },
    { id: 'receptions', name: 'Receptions', role: 'receiving', stat: 'rec', read: 'count' },
    { id: 'recYards', name: 'Receiving Yards', role: 'receiving', stat: 'yds', read: 'total' },
  ]);

  static SCOPES = Object.freeze([['game', 'This game'], ['last3', 'Last 3 games'], ['season', 'Season']]);
  static UNITS = Object.freeze([['offense', 'Offense'], ['defense', 'Defense'], ['special', 'Special Teams'], ['all', 'All units']]);
  static WIDTHS = Object.freeze([['s', 'Third'], ['m', 'Half'], ['l', 'Full']]);

  /** Starting dashboards. A template is copied into the season when chosen;
   *  editing the copy never changes the template. */
  static TEMPLATES = Object.freeze([
    { id: 'offense', name: 'Offense snapshot', unit: 'offense', scope: 'season', widgets: [
      { view: 'kpi', metric: 'plays', width: 's' }, { view: 'kpi', metric: 'success', width: 's' }, { view: 'kpi', metric: 'yards', width: 's' },
      { view: 'bar', metric: 'success', dimension: 'down', width: 'm' },
      { view: 'share', dimension: 'down', split: 'runPass', width: 'm' },
      { view: 'trend', metric: 'yards', width: 'l' },
      { view: 'table', metrics: ['plays', 'success', 'yards', 'explosive'], dimension: 'formationFamily', width: 'l', sort: 'plays' },
    ] },
    { id: 'defense', name: 'Defense snapshot', unit: 'defense', scope: 'season', widgets: [
      { view: 'kpi', metric: 'plays', width: 's' }, { view: 'kpi', metric: 'success', width: 's' }, { view: 'kpi', metric: 'havoc', width: 's' },
      { view: 'bar', metric: 'success', dimension: 'defFront', width: 'm' },
      { view: 'matrix', metric: 'yards', dimension: 'coverage', dimension2: 'down', width: 'm' },
      { view: 'table', metrics: ['plays', 'success', 'yards', 'explosive'], dimension: 'formationFamily', width: 'm', sort: 'plays' },
      { view: 'leaders', leader: 'tackles', width: 'm' },
    ] },
    { id: 'situational', name: 'Situational', unit: 'offense', scope: 'season', widgets: [
      { view: 'matrix', metric: 'runShare', dimension: 'down', dimension2: 'distanceBand', width: 'l' },
      { view: 'bar', metric: 'success', dimension: 'fieldZone', width: 'm' },
      { view: 'share', dimension: 'fieldZone', split: 'runPass', width: 'm' },
      { view: 'kpi', metric: 'success', filters: [{ dimension: 'down', values: ['3'] }], title: '3rd down success', width: 's' },
      { view: 'kpi', metric: 'success', filters: [{ dimension: 'down', values: ['4'] }], title: '4th down success', width: 's' },
      { view: 'kpi', metric: 'touchdowns', filters: [{ dimension: 'fieldZone', values: ['Red zone', 'Goal line'] }], title: 'Red zone touchdowns', width: 's' },
    ] },
    { id: 'calls', name: 'Play calls', unit: 'offense', scope: 'season', widgets: [
      { view: 'table', metrics: ['plays', 'success', 'yards', 'explosive', 'negative'], dimension: 'playCall', width: 'l', sort: 'plays', limit: 20 },
      { view: 'bar', metric: 'yards', dimension: 'playType', width: 'm' },
      { view: 'share', dimension: 'formationFamily', split: 'playType', width: 'm' },
    ] },
    { id: 'blank', name: 'Blank dashboard', unit: 'offense', scope: 'season', widgets: [] },
  ]);

  constructor({ registry, study }) {
    if (!registry || !study) throw new TypeError('ReportBuilder requires the analytics registry and Study query');
    this.registry = registry;
    this.study = study;
    this.stats = registry.stats;
    this.metrics = registry.metricsEngine();
  }

  // ---- Catalog lookups ---------------------------------------------------

  static metric(id) { return ReportBuilder.METRICS.find(item => item.id === id) || null; }
  static view(id) { return ReportBuilder.VIEWS.find(item => item.id === id) || null; }
  static leader(id) { return ReportBuilder.LEADERS.find(item => item.id === id) || null; }

  /** The metric's coach-facing name in this unit. */
  static metricName(id, unit = 'offense') {
    const entry = ReportBuilder.metric(id);
    if (!entry) return id;
    if (entry.kind === 'concept') return (unit === 'defense' ? entry.defense : entry.offense).name;
    return entry.name;
  }

  dimensionName(id) {
    if (id === 'distanceBand') return 'Distance';
    return this.registry.getDimension(id)?.name || id;
  }

  /** Every dimension the editor offers, grouped, with names. */
  dimensionCatalog() {
    return ReportBuilder.DIMENSIONS.map(section => ({
      group: section.group,
      items: section.ids.filter(id => id === 'distanceBand' || this.registry.getDimension(id)?.availability === 'ready')
        .map(id => ({ id, name: this.dimensionName(id) })),
    }));
  }

  // ---- Dashboards --------------------------------------------------------

  static _id(prefix) { return `${prefix}_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`; }

  /** A dashboard as stored: known fields only, every widget complete. */
  static normalize(raw) {
    const value = raw && typeof raw === 'object' ? raw : {};
    const scope = ReportBuilder.SCOPES.some(([id]) => id === value.scope) ? value.scope : 'season';
    const unit = ReportBuilder.UNITS.some(([id]) => id === value.unit) ? value.unit : 'offense';
    return {
      id: typeof value.id === 'string' && value.id ? value.id : ReportBuilder._id('dash'),
      name: String(value.name || 'Dashboard').trim().slice(0, 60) || 'Dashboard',
      version: ReportBuilder.VERSION, scope, unit,
      filters: ReportBuilder._filters(value.filters),
      widgets: (Array.isArray(value.widgets) ? value.widgets : []).map(ReportBuilder.normalizeWidget).filter(Boolean),
    };
  }

  static _filters(list) {
    return (Array.isArray(list) ? list : [])
      .filter(item => item && typeof item.dimension === 'string' && Array.isArray(item.values))
      .map(item => ({ dimension: item.dimension, values: [...new Set(item.values.map(String))].filter(Boolean) }))
      .filter(item => item.values.length);
  }

  static normalizeWidget(raw) {
    const value = raw && typeof raw === 'object' ? raw : null;
    if (!value || !ReportBuilder.view(value.view)) return null;
    const metric = ReportBuilder.metric(value.metric) ? value.metric : 'plays';
    const metrics = (Array.isArray(value.metrics) ? value.metrics : [metric]).filter(id => ReportBuilder.metric(id));
    return {
      id: typeof value.id === 'string' && value.id ? value.id : ReportBuilder._id('w'),
      view: value.view,
      title: String(value.title || '').trim().slice(0, 60),
      metric, metrics: metrics.length ? metrics : [metric],
      dimension: typeof value.dimension === 'string' ? value.dimension : '',
      dimension2: typeof value.dimension2 === 'string' ? value.dimension2 : '',
      split: typeof value.split === 'string' ? value.split : '',
      leader: ReportBuilder.leader(value.leader) ? value.leader : 'tackles',
      filters: ReportBuilder._filters(value.filters),
      width: ReportBuilder.WIDTHS.some(([id]) => id === value.width) ? value.width : 'm',
      sort: typeof value.sort === 'string' ? value.sort : '',
      limit: Number.isInteger(value.limit) && value.limit > 0 ? Math.min(value.limit, 40) : 12,
      minSample: Number.isInteger(value.minSample) && value.minSample >= 0 ? value.minSample : 5,
    };
  }

  static fromTemplate(templateId, name) {
    const template = ReportBuilder.TEMPLATES.find(item => item.id === templateId) || ReportBuilder.TEMPLATES.at(-1);
    return ReportBuilder.normalize({ ...JSON.parse(JSON.stringify(template)), id: null, name: name || template.name });
  }

  /** The widget's own title, or the one its settings describe. */
  title(widget, unit) {
    if (widget.title) return widget.title;
    const metric = ReportBuilder.metricName(widget.metric, unit);
    if (widget.view === 'kpi') return metric;
    if (widget.view === 'trend') return `${metric} by game`;
    if (widget.view === 'leaders') return `${ReportBuilder.leader(widget.leader)?.name || 'Leaders'} leaders`;
    if (widget.view === 'share') return `${this.dimensionName(widget.split)} by ${this.dimensionName(widget.dimension)}`;
    if (widget.view === 'matrix') return `${metric}: ${this.dimensionName(widget.dimension)} × ${this.dimensionName(widget.dimension2)}`;
    if (widget.view === 'table') return `By ${this.dimensionName(widget.dimension)}`;
    return `${metric} by ${this.dimensionName(widget.dimension)}`;
  }

  // ---- Cohorts -----------------------------------------------------------

  /**
   * The dashboard's plays: the scope's games, the unit, then the dashboard
   * filters. `games` is the season's own-team games in order, each
   * `{ id, label, plays }` with plays stamped `__gid`; `activeGameId` names
   * "This game".
   */
  scopePlays(dashboard, { games = [], activeGameId = null } = {}) {
    const charted = games.filter(game => game.plays.length);
    let chosen = games;
    if (dashboard.scope === 'game') chosen = games.filter(game => String(game.id) === String(activeGameId));
    else if (dashboard.scope === 'last3') chosen = charted.slice(-3);
    const plays = chosen.flatMap(game => game.plays);
    const unit = dashboard.unit;
    const byUnit = unit === 'all' ? plays : plays.filter(play => countedUnit(play) === unit);
    return this._filter(byUnit, dashboard.filters);
  }

  _filter(plays, filters) {
    const own = (filters || []).filter(item => item.dimension !== 'distanceBand');
    const bands = (filters || []).filter(item => item.dimension === 'distanceBand');
    let out = own.length ? this.study.cohort(plays, own) : plays;
    for (const band of bands) out = out.filter(play => band.values.includes(ReportBuilder.distanceBand(play)));
    return out;
  }

  static distanceBand(play) {
    const n = parseInt(play?.tags?.distance, 10);
    if (!Number.isFinite(n) || n < 1) return '';
    return ReportBuilder.DISTANCE_BANDS.find(([, lo, hi]) => n >= lo && n <= hi)?.[0] || '';
  }

  /** `[{ value, label, plays }]` for one dimension, in reading order. */
  groups(plays, dimension, labels = {}) {
    if (!dimension) return [];
    let groups;
    if (dimension === 'distanceBand') {
      groups = ReportBuilder.DISTANCE_BANDS.map(([name]) => ({ value: name, plays: plays.filter(play => ReportBuilder.distanceBand(play) === name) }))
        .filter(group => group.plays.length);
    } else {
      const byValue = new Map();
      for (const play of plays) {
        for (const value of this.registry.values(dimension, play)) {
          if (value === '' || value == null) continue;
          if (!byValue.has(value)) byValue.set(value, []);
          byValue.get(value).push(play);
        }
      }
      // A penalty group measures only its own records: a play with Holding
      // and a Personal Foul counts once in each foul's row, with that foul's
      // yards (StudyQuery's record-scoped rule).
      const scope = StudyQuery.PENALTY_RECORD_FILTER[dimension];
      groups = [...byValue].map(([value, members]) => ({ value, plays: scope ? members.map(play => ReportBuilder._withPenalties(play,
        PenaltyModel.normalizeList(play?.penalties).filter(penalty => scope(penalty, value)))) : members }));
      if (dimension === 'game') {
        const order = Object.keys(labels);
        groups.sort((a, b) => order.indexOf(String(a.value)) - order.indexOf(String(b.value)));
      } else if (dimension === 'fieldZone') {
        groups.sort((a, b) => ReportBuilder.ZONE_ORDER.indexOf(a.value) - ReportBuilder.ZONE_ORDER.indexOf(b.value));
      } else if (groups.every(group => /^\d+$/.test(String(group.value)))) {
        groups.sort((a, b) => Number(a.value) - Number(b.value));
      } else {
        groups.sort((a, b) => b.plays.length - a.plays.length || String(a.value).localeCompare(String(b.value)));
      }
    }
    return groups.map(group => ({ ...group, label: ReportBuilder.valueLabel(dimension, group.value, labels) }));
  }

  /** A shallow copy of a play with only some of its penalty records, keeping
   *  its game id for film refs. */
  static _withPenalties(play, penalties) {
    const copy = { ...play, penalties };
    Object.defineProperty(copy, '__gid', { value: play.__gid, configurable: true, enumerable: false });
    return copy;
  }

  /** Stored penalty values as a coach reads them. Dashboards measure our
   *  own games, so the subject team is ours. */
  static VALUE_LABELS = Object.freeze({
    penaltyTeam: { subject: 'Our team', opponent: 'Opponent', unknown: 'Unknown' },
    penaltyRuling: { accepted: 'Accepted', declined: 'Declined', offsetting: 'Offsetting', unknown: 'Unknown' },
    penaltyPhase: { offense: 'Offense', defense: 'Defense', special: 'Special Teams', deadBall: 'Dead ball', unknown: 'Unknown' },
  });

  /** A value as a coach reads it: 3rd, Q2, Accepted, or the game's opponent. */
  static valueLabel(dimension, value, labels = {}) {
    const text = String(value);
    if (dimension === 'game') return labels[text] || text;
    if (dimension === 'down' && /^[1-4]$/.test(text)) return ['1st', '2nd', '3rd', '4th'][Number(text) - 1];
    if (dimension === 'quarter' && /^[1-4]$/.test(text)) return `Q${text}`;
    const named = ReportBuilder.VALUE_LABELS[dimension]?.[text];
    if (named) return named;
    // Special Teams outcomes are stored as ids (fairCatch); read them as words.
    if (dimension === 'specialTeamsOutcome' && /^[a-z]+[A-Z]/.test(text)) {
      const words = text.replace(/([A-Z])/g, ' $1').toLowerCase();
      return words.charAt(0).toUpperCase() + words.slice(1);
    }
    return text;
  }

  /** Whole-number shares that total 100 (largest remainder), for labels. */
  static wholeShares(shares) {
    const total = shares.reduce((sum, share) => sum + share, 0);
    if (!total) return shares.map(() => 0);
    const exact = shares.map(share => share / total * 100);
    const whole = exact.map(Math.floor);
    let left = 100 - whole.reduce((sum, value) => sum + value, 0);
    exact.map((value, index) => [value - whole[index], index]).sort((a, b) => b[0] - a[0])
      .forEach(([, index]) => { if (left > 0) { whole[index] += 1; left -= 1; } });
    return whole;
  }

  /** A share chart shows four split values; the rest read as Other. */
  static SHARE_KEYS = 4;
  static OTHER = '__other';

  // ---- Measuring -----------------------------------------------------------

  _refs(plays) {
    return [...new Set(plays.map(play => this.registry.playRef(play)))].sort();
  }

  /**
   * One metric over one cohort: `{ value, n, state, refs, polarity, format }`.
   * Polarity is 'higher' or 'lower' (which way is better) or 'neutral' for a
   * count or tendency that has no better direction.
   * `state` is AnalyticsMetrics': 'ok', 'insufficient' (below the widget's
   * minimum sample), 'unavailable' (nothing to measure), or 'partial-film'.
   */
  measure(metricId, plays, { unit = 'offense', minSample = 0 } = {}) {
    const entry = ReportBuilder.metric(metricId);
    if (!entry) throw new Error(`Unknown dashboard metric: ${metricId}`);
    const base = { format: entry.format, polarity: entry.polarity || 'higher' };
    if (entry.kind === 'count') {
      const n = plays.length;
      return { ...base, value: n, n, refs: this._refs(plays), state: n ? (n < minSample ? 'insufficient' : 'ok') : 'unavailable' };
    }
    if (entry.kind === 'share') {
      // Run % / Pass % of the plays classified run or pass, on any unit
      // (StatsEngine.isRun / isPass). compute()'s tendencies are offense-only.
      const SE = this.stats.constructor;
      const runs = plays.filter(play => SE.isRun(play)), passes = plays.filter(play => SE.isPass(play));
      const n = runs.length + passes.length, mine = entry.share === 'run' ? runs : passes;
      return { ...base, value: n ? +(mine.length / n * 100).toFixed(1) : null, n, refs: this._refs(mine),
        state: n ? (n < minSample ? 'insufficient' : 'ok') : 'unavailable' };
    }
    if (entry.offenseOnly && unit !== 'offense') {
      return { ...base, value: null, n: 0, refs: [], state: 'unavailable', reason: 'Offense only' };
    }
    if (entry.kind === 'concept' || entry.kind === 'metric') {
      if (entry.kind === 'concept' && unit !== 'offense' && unit !== 'defense') {
        return { ...base, value: null, n: 0, refs: [], state: 'unavailable', reason: 'Choose Offense or Defense' };
      }
      const id = entry.kind === 'concept' ? (unit === 'defense' ? entry.defense.id : entry.offense.id) : entry.metric;
      const SE = this.stats.constructor;
      const cohort = entry.passOnly ? plays.filter(play => SE.isPass(play)) : plays;
      const r = this.metrics.metric(cohort, id, {}, { minSample, allowUnlinkedPlays: true });
      return { ...base, value: r.value, n: r.denominator, refs: r.refs, state: r.state, polarity: r.polarity };
    }
    const stats = this.stats.compute(plays);
    const value = plays.length ? this.registry.readMeasures(stats, [entry.measure])[entry.measure] : null;
    const refs = this.registry.readRefs(stats, entry.measure) || this._refs(plays);
    const n = plays.length;
    // Some compute() fields are numeric strings (toFixed); blank is unmeasured.
    const parsed = value == null || value === '' ? NaN : Number(value);
    const numeric = Number.isFinite(parsed) ? parsed : null;
    return { ...base, value: numeric, n, refs, state: numeric == null || !n ? 'unavailable' : n < minSample ? 'insufficient' : 'ok' };
  }

  /**
   * Everything one widget shows, ready to draw: `{ title, view, ... }` per
   * view. `context` is `{ games, activeGameId, labels, roster, unit }` with
   * the dashboard cohort already applied in `plays`.
   */
  evaluate(widget, plays, context = {}) {
    const unit = context.unit;
    const labels = context.labels || {};
    const options = { unit, minSample: widget.minSample };
    const cohort = this._filter(plays, widget.filters);
    const head = { id: widget.id, view: widget.view, title: this.title(widget, unit), width: widget.width, total: cohort.length };
    const metricName = ReportBuilder.metricName(widget.metric, unit);
    if (widget.view === 'kpi') {
      const current = this.measure(widget.metric, cohort, options);
      // Counts are not comparable across scopes; rates and averages are.
      const comparable = ReportBuilder.metric(widget.metric)?.format !== 'count';
      const baseline = context.baselinePlays && comparable ? this.measure(widget.metric, this._filter(context.baselinePlays, widget.filters), { unit, minSample: 0 }) : null;
      return { ...head, metricName, current, baseline, baselineLabel: context.baselineLabel || '' };
    }
    if (widget.view === 'trend') {
      const measured = (context.games || []).filter(game => game.plays.length).map(game => {
        const gamePlays = cohort.filter(play => String(play.__gid) === String(game.id));
        return { value: String(game.id), label: game.label, ...this.measure(widget.metric, gamePlays, options) };
      });
      const rows = measured.filter(row => row.n > 0 || row.state !== 'unavailable');
      // A metric this unit cannot read says why, rather than "no games".
      const reason = rows.length ? '' : (measured.find(row => row.reason)?.reason || '');
      return { ...head, metricName, rows, reason };
    }
    if (widget.view === 'leaders') {
      const leader = ReportBuilder.leader(widget.leader);
      const board = this.stats.playersBoard(cohort, { roster: context.roster || {} }).players;
      const rows = board.map(player => {
        const role = player.roles.find(item => item.key === leader.role);
        const fact = role?.stats?.[leader.stat];
        if (!fact) return null;
        const value = leader.read === 'total' ? fact.total : fact.n;
        return { value: player.num, label: player.label, metric: value, refs: fact.refs || [] };
      }).filter(row => row && row.metric).sort((a, b) => b.metric - a.metric || Number(a.value) - Number(b.value)).slice(0, widget.limit);
      return { ...head, metricName: leader.name, rows };
    }
    if (widget.view === 'share') {
      const groups = this.groups(cohort, widget.dimension, labels).slice(0, widget.limit);
      // Segments keep one order on every row, and each row's shares are of
      // the plays that hold a split value (a play neither run nor pass is not
      // a gap in the bar); `n` is that count.
      const keyGroups = this.groups(cohort, widget.split, labels);
      const folded = keyGroups.length > ReportBuilder.SHARE_KEYS + 1;
      const shown = folded ? keyGroups.slice(0, ReportBuilder.SHARE_KEYS) : keyGroups;
      const keys = [...shown.map(group => group.value), ...(folded ? [ReportBuilder.OTHER] : [])];
      const keyLabels = { ...Object.fromEntries(shown.map(group => [group.value, group.label])), ...(folded ? { [ReportBuilder.OTHER]: 'Other' } : {}) };
      const rows = groups.map(group => {
        const parts = [];
        for (const part of this.groups(group.plays, widget.split, labels)) {
          const key = keys.includes(part.value) ? part.value : ReportBuilder.OTHER;
          const existing = parts.find(item => item.value === key);
          if (existing) existing.plays = [...existing.plays, ...part.plays];
          else parts.push({ value: key, label: keyLabels[key], plays: part.plays });
        }
        parts.sort((a, b) => keys.indexOf(a.value) - keys.indexOf(b.value));
        const total = parts.reduce((sum, part) => sum + part.plays.length, 0);
        const whole = ReportBuilder.wholeShares(parts.map(part => part.plays.length));
        return { value: group.value, label: group.label, n: total, refs: this._refs(group.plays),
          parts: parts.map((part, index) => ({ value: part.value, label: part.label, n: part.plays.length,
            share: total ? +(part.plays.length / total * 100).toFixed(1) : 0, whole: whole[index], refs: this._refs(part.plays) })) };
      }).filter(row => row.n);
      return { ...head, rows, keys, keyLabels, dimensionName: this.dimensionName(widget.dimension), splitName: this.dimensionName(widget.split) };
    }
    if (widget.view === 'matrix') {
      const rowGroups = this.groups(cohort, widget.dimension, labels).slice(0, widget.limit);
      const colGroups = this.groups(cohort, widget.dimension2, labels).slice(0, 8);
      // Each cell regroups the row's plays by the column, so a penalty row and
      // a penalty column constrain the same records (accepted Holding never
      // lands in a Declined cell because the play also had a declined foul).
      const rows = rowGroups.map(group => {
        const byCol = new Map(this.groups(group.plays, widget.dimension2, labels).map(col => [col.value, col.plays]));
        return { value: group.value, label: group.label,
          cells: colGroups.map(col => ({ ...this.measure(widget.metric, byCol.get(col.value) || [], options), column: col.value, columnLabel: col.label })) };
      });
      return { ...head, metricName, rows, columns: colGroups.map(col => ({ value: col.value, label: col.label })),
        dimensionName: this.dimensionName(widget.dimension), dimension2Name: this.dimensionName(widget.dimension2) };
    }
    const groups = this.groups(cohort, widget.dimension, labels);
    if (widget.view === 'table') {
      let rows = groups.map(group => ({ value: group.value, label: group.label, n: group.plays.length,
        cells: widget.metrics.map(id => ({ id, ...this.measure(id, group.plays, options) })) }));
      const sortIndex = widget.metrics.indexOf(widget.sort);
      if (sortIndex >= 0) rows.sort((a, b) => (b.cells[sortIndex].value ?? -Infinity) - (a.cells[sortIndex].value ?? -Infinity));
      rows = rows.slice(0, widget.limit);
      return { ...head, rows, columns: widget.metrics.map(id => ({ id, name: ReportBuilder.metricName(id, unit), format: ReportBuilder.metric(id).format })),
        dimensionName: this.dimensionName(widget.dimension) };
    }
    // A narrower scope marks each bar with the same group's season value.
    const baseline = new Map();
    if (context.baselinePlays) {
      for (const group of this.groups(this._filter(context.baselinePlays, widget.filters), widget.dimension, labels)) {
        baseline.set(group.value, this.measure(widget.metric, group.plays, { unit, minSample: 0 }).value);
      }
    }
    const rows = groups.map(group => ({ value: group.value, label: group.label, ...this.measure(widget.metric, group.plays, options),
      baseline: baseline.has(group.value) ? baseline.get(group.value) : null }))
      .slice(0, widget.limit);
    return { ...head, metricName, rows, dimensionName: this.dimensionName(widget.dimension), baselineLabel: context.baselineLabel || '' };
  }

  /** The distinct values of a dimension in a cohort, with play counts, for
   *  the filter picker. */
  values(plays, dimension, labels = {}) {
    return this.groups(plays, dimension, labels).map(group => ({ value: group.value, label: group.label, n: group.plays.length }));
  }

  /** A value as the dashboard prints it. */
  static format(value, format) {
    if (value == null || !Number.isFinite(value)) return '—';
    if (format === 'pct') return `${value.toFixed(1)}%`;
    if (format === 'dec1') return value.toFixed(1);
    if (format === 'dec2') return value.toFixed(2);
    return String(Math.round(value));
  }
}
