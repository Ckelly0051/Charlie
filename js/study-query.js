import { PenaltyModel } from './penalty-model.js';

/**
 * StudyQuery: the pure query executor over AnalyticsRegistry. It groups a play
 * set by one dimension, computes the requested registry measures per group
 * from `StatsEngine.compute` over that group's plays, and returns each group's
 * `matchingPlayIds` so every Study result stays film-linked (Watch, cut-ups,
 * Plan).
 *
 * PARITY CONTRACT (tools/e2e-study-query.mjs): for a dimension with a report
 * drilldown (DIMENSION_CUT), a group's `matchingPlayIds` come from the same
 * `_buildCutFilter` predicate the reports use, so a Study query returns exactly
 * the report drilldown's play set. Measures ride on `compute()`, which
 * `e2e-parity` pins. Dimensions without a canonical cut (quarter, result,
 * grade, player role, custom tag or field, drive, distance, unit) group and
 * film-link through the registry's value extractor.
 *
 * RECORD-SCOPED AGGREGATION. `penaltyTeam`, `penaltyFoul`, `penaltyRuling` and
 * `penaltyPhase` group by penalty record: a play joins the group through one
 * matching record but may carry others (an offsetting pair charges both teams
 * on one play). Measures for these groups compute from a view of the plays
 * whose `.penalties` holds only the matching records
 * (`PENALTY_RECORD_FILTER`, `_recordScopedPlays`); the plays themselves, and so
 * `matchingPlayIds` and refs, are untouched. No other dimension is scoped.
 */
export class StudyQuery {
  static get PENALTY_RECORD_FILTER() {
    return {
      penaltyTeam: (penalty, value) => penalty.team === value,
      penaltyFoul: (penalty, value) => (penalty.foul || 'unknown') === value,
      penaltyRuling: (penalty, value) => penalty.disposition === value,
      penaltyPhase: (penalty, value) => penalty.phase === value,
    };
  }

  constructor(registry) {
    if (!registry || typeof registry.values !== 'function' || !registry.stats) {
      throw new TypeError('StudyQuery requires an AnalyticsRegistry');
    }
    this.registry = registry;
    this.stats = registry.stats;
  }

  /** Dimension id -> the `_buildCutFilter` cut type that reproduces the existing
   *  report drilldown (film-link parity). Dimensions absent here group via the
   *  registry value extractor instead (still film-linked, just not in the golden). */
  static get DIMENSION_CUT() {
    return {
      playCall: 'playCall', playConcept: 'playConcept',
      formationFamily: 'formationFamily', receiverSet: 'receiverSet', qbAlignment: 'qbAlignment', playType: 'playType',
      personnel: 'personnel', backfield: 'backfield', strength: 'strength', down: 'down',
      playDir: 'playDir', motion: 'motion', hash: 'hash', coverage: 'coverage',
      gap: 'gap', motionStart: 'motionStart', motionEnd: 'motionEnd', rpoRead: 'rpoRead', rpoDecision: 'rpoDecision', qbRun: 'qbRun',
      coverageFamily: 'coverageFamily', defFront: 'defFront', blitz: 'blitz', runPass: 'runpass',
    };
  }

  _distinct(plays, dimension, context) {
    const set = new Set();
    for (const p of plays) {
      for (const v of this.registry.values(dimension, p, context)) if (v) set.add(v);
    }
    return [...set].sort();
  }

  /** A play passes a filter when its dimension values intersect the filter's
   *  values (OR within a filter); the cohort keeps plays passing EVERY filter
   *  (AND across filters). */
  _cohort(plays, filters, context) {
    if (!filters || !filters.length) return plays.slice();
    return plays.filter(p => filters.every(f => {
      const want = new Set((f.values || []).map(String));
      if (!want.size) return true;
      return this.registry.values(f.dimension, p, context).some(v => want.has(String(v)));
    }));
  }

  /** Select a single group's plays for `dimension === value`. Uses the shared
   *  `_buildCutFilter` predicate when the dimension maps to a report cut (parity),
   *  else registry value-membership. */
  _groupPlays(cohort, dimension, value, context) {
    const cut = StudyQuery.DIMENSION_CUT[dimension];
    if (cut) {
      const pred = this.stats._buildCutFilter(cut, value);
      if (typeof pred === 'function') return cohort.filter(pred);
    }
    return cohort.filter(p => this.registry.values(dimension, p, context).includes(value));
  }

  /** For the four penalty record dimensions, shallow play copies whose
   *  `.penalties` holds only the records matching this group's value (see the
   *  module doc). Returns `groupPlays` unchanged for every other dimension. */
  _recordScopedPlays(groupPlays, dimension, value) {
    const test = StudyQuery.PENALTY_RECORD_FILTER[dimension];
    if (!test) return groupPlays;
    return groupPlays.map(play => ({
      ...play,
      penalties: PenaltyModel.normalizeList(play?.penalties).filter(penalty => test(penalty, value)),
    }));
  }

  /**
   * run({ plays, dimension, measures?, filters?, minSample?, context? })
   *   -> { dimension, total, measures, minSample,
   *        groups: [{ value, sampleSize, belowMinSample, matchingPlayIds, measures }],
   *        warnings: [ '<value>: sample N below minimum M', ... ] }
   * `matchingPlayIds` are composite `gameId::playId` refs (via registry.playRef),
   * sorted — identical to the parity golden for report-backed dimensions.
   */
  run({ plays, dimension, measures = [], filters = [], minSample = 0, context = {} } = {}) {
    if (!Array.isArray(plays)) throw new TypeError('StudyQuery.run requires a plays array');
    if (!this.registry.getDimension(dimension)) throw new Error(`Unknown Study dimension: ${dimension}`);
    if (this.registry.getDimension(dimension).availability !== 'ready') {
      throw new Error(`Study dimension requires context: ${dimension}`);
    }
    const cohort = this._cohort(plays, filters, context);
    const values = this._distinct(cohort, dimension, context);
    const warnings = [];
    const groups = values.map(value => {
      const groupPlays = this._groupPlays(cohort, dimension, value, context);
      const sampleSize = groupPlays.length;
      const belowMinSample = minSample > 0 && sampleSize < minSample;
      if (belowMinSample) warnings.push(`${value}: sample ${sampleSize} below minimum ${minSample}`);
      const matchingPlayIds = groupPlays.map(p => this.registry.playRef(p, context)).sort();
      // Measures use the record-scoped view; `matchingPlayIds` above come from
      // the real plays, each of which carries a matching record.
      const scopedPlays = this._recordScopedPlays(groupPlays, dimension, value);
      const scopedStats = measures.length ? this.stats.compute(scopedPlays) : null;
      const groupMeasures = scopedStats ? this.registry.readMeasures(scopedStats, measures) : {};
      // `measureRefs[id]`: the metric-eligible refs for measures that declare
      // `refsPath`; null otherwise (study-screen.js then uses
      // `matchingPlayIds`).
      const measureRefs = {};
      if (scopedStats) for (const id of measures) measureRefs[id] = this.registry.readRefs(scopedStats, id);
      return { value, sampleSize, belowMinSample, matchingPlayIds, measures: groupMeasures, measureRefs };
    });
    return { dimension, total: cohort.length, measures: measures.slice(), minSample, groups, warnings };
  }

  _num(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
  }

  /** The AnalyticsMetrics instance bound to `registry.stats`, from
   *  AnalyticsRegistry.metricsEngine(); StudyQuery never builds its own
   *  binding. */
  _metricsEngine() {
    return this.registry.metricsEngine();
  }

  /**
   * runMetrics({ plays, dimension, metricIds, filters?, minSample?, context?, missingAsZero?, allowUnlinkedPlays? })
   *   -> { dimension, total, metricIds, minSample,
   *        groups: [{ value, sampleSize, belowMinSample, matchingPlayIds,
   *                   metrics: { [metricId]: <AnalyticsMetrics shared contract> } }],
   *        warnings }
   *
   * ADDITIVE seam, not a replacement for `run()`. Grouping (dimension value
   * membership, film-link parity via DIMENSION_CUT/_buildCutFilter, min-sample
   * warnings) is byte-identical to `run()` -- this method reuses `_groupPlays`
   * rather than re-deriving cohorts. The only difference is what each group's
   * measures LOOK like: `run()` returns a flat `{name: number}` object;
   * `runMetrics()` returns the full AnalyticsMetrics contract per metric
   * (value/count/eligible/denominator/polarity/state/unlinkedCount/refs),
   * which is what a future Study consumer needs to disclose an
   * insufficient-sample, partial-film, or missing-data state honestly
   * instead of rendering a bare number.
   *
   * `minSample`/`allowUnlinkedPlays` are forwarded into EVERY metric() call
   * as `options`, so a metric's own `state` can be `'insufficient'` on its
   * own denominator even when the group's raw `sampleSize` clears
   * `minSample` (a metric can have fewer *eligible* plays than the group has
   * total plays -- see analytics-metrics.js's docblock). `allowUnlinkedPlays`
   * defaults to false: a Study consumer gets the honest fail-loud default,
   * not the legacy `defensivePerformance` compatibility escape hatch.
   *
   * `run()` and `compare()` are UNCHANGED by this addition -- per the bounded
   * analytics-architecture-cleanup scope, Study's current screen is not
   * redesigned to consume this yet.
   *
   * `gradeRole` (Study Phase 3, additive): forwarded into every metric()
   * call's `options` alongside the rest of `metricOptions` -- required only
   * by the three grade metrics (avgGrade/positiveGradeRate/
   * negativeGradeRate), which need to know which `tags.grades` key to read.
   * `undefined` for every existing caller, so this is a no-op for every
   * pre-Phase-3 query.
   */
  runMetrics({ plays, dimension, metricIds = [], filters = [], minSample = 0, context = {}, missingAsZero = false, allowUnlinkedPlays = false, gradeRole } = {}) {
    if (!Array.isArray(plays)) throw new TypeError('StudyQuery.runMetrics requires a plays array');
    if (!this.registry.getDimension(dimension)) throw new Error(`Unknown Study dimension: ${dimension}`);
    if (this.registry.getDimension(dimension).availability !== 'ready') {
      throw new Error(`Study dimension requires context: ${dimension}`);
    }
    const metricsEngine = this._metricsEngine();
    const metricOptions = { missingAsZero, allowUnlinkedPlays, minSample, gradeRole };
    const cohort = this._cohort(plays, filters, context);
    const values = this._distinct(cohort, dimension, context);
    const warnings = [];
    const groups = values.map(value => {
      const groupPlays = this._groupPlays(cohort, dimension, value, context);
      const sampleSize = groupPlays.length;
      const belowMinSample = minSample > 0 && sampleSize < minSample;
      if (belowMinSample) warnings.push(`${value}: sample ${sampleSize} below minimum ${minSample}`);
      const matchingPlayIds = groupPlays.map(p => this.registry.playRef(p, context)).sort();
      const groupMetrics = {};
      for (const id of metricIds) groupMetrics[id] = metricsEngine.metric(groupPlays, id, context, metricOptions);
      return { value, sampleSize, belowMinSample, matchingPlayIds, metrics: groupMetrics };
    });
    return { dimension, total: cohort.length, metricIds: metricIds.slice(), minSample, groups, warnings };
  }

  /**
   * compare({ base, against, dimension, measures?, filters?, minSample?, context?, labels? })
   * Runs the SAME query over two cohorts (e.g. this game vs the season, or recent
   * vs prior games) and aligns groups by dimension value. Each row keeps BOTH
   * sides' `matchingPlayIds` (each film-linked to its own cohort with the same
   * golden parity as run()), and a numeric `deltas[measure] = base − against`
   * (null when either side's measure isn't numeric or a side has no such group).
   * Both cohorts get the SAME filters. StudyQuery stays pure — the caller slices
   * the two play sets (game/season/date-range); this never reads the store.
   *
   *   -> { dimension, measures, minSample,
   *        a: { label, total }, b: { label, total },
   *        rows: [{ value, a:{sampleSize,belowMinSample,matchingPlayIds,measures},
   *                 b:{…}, deltas:{measure:number|null}, sampleDelta }],
   *        warnings }
   */
  compare({ base, against, dimension, measures = [], filters = [], minSample = 0, context = {}, labels = {} } = {}) {
    if (!Array.isArray(base) || !Array.isArray(against)) {
      throw new TypeError('StudyQuery.compare requires base and against play arrays');
    }
    const a = this.run({ plays: base, dimension, measures, filters, minSample, context });
    const b = this.run({ plays: against, dimension, measures, filters, minSample, context });
    const aMap = new Map(a.groups.map(g => [g.value, g]));
    const bMap = new Map(b.groups.map(g => [g.value, g]));
    // Both comparison sides carry `measureRefs`, so a comparison's Watch
    // action opens each measure's own eligible plays.
    const blank = () => ({ sampleSize: 0, belowMinSample: minSample > 0, matchingPlayIds: [], measures: {}, measureRefs: {} });
    const values = [...new Set([...aMap.keys(), ...bMap.keys()])].sort();
    const rows = values.map(value => {
      const ga = aMap.get(value) || blank();
      const gb = bMap.get(value) || blank();
      const deltas = {};
      for (const m of measures) {
        const na = this._num(ga.measures[m]), nb = this._num(gb.measures[m]);
        deltas[m] = (na === null || nb === null) ? null : Number((na - nb).toFixed(4));
      }
      return {
        value,
        a: { sampleSize: ga.sampleSize, belowMinSample: ga.belowMinSample, matchingPlayIds: ga.matchingPlayIds, measures: ga.measures, measureRefs: ga.measureRefs },
        b: { sampleSize: gb.sampleSize, belowMinSample: gb.belowMinSample, matchingPlayIds: gb.matchingPlayIds, measures: gb.measures, measureRefs: gb.measureRefs },
        deltas, sampleDelta: ga.sampleSize - gb.sampleSize,
      };
    });
    return {
      dimension, measures: measures.slice(), minSample,
      a: { label: labels.base || 'A', total: a.total },
      b: { label: labels.against || 'B', total: b.total },
      rows,
      warnings: [...a.warnings.map(w => `${labels.base || 'A'}: ${w}`), ...b.warnings.map(w => `${labels.against || 'B'}: ${w}`)],
    };
  }

  /**
   * compareMetrics({ base, against, dimension, metricIds?, filters?, minSample?,
   *                  context?, labels?, missingAsZero?, allowUnlinkedPlays? })
   *
   * The two-cohort comparison with each side's measures in the full
   * AnalyticsMetrics contract (value/count/eligible/denominator/polarity/
   * state/refs), so each side shows insufficient, unavailable or partial-film
   * honestly, and a delta is computed only between two `ok` values. `refs` on
   * each side are that metric's own film cohort.
   *
   *   -> { dimension, metricIds, minSample,
   *        a: { label, total }, b: { label, total },
   *        rows: [{ value, a:{sampleSize,belowMinSample,matchingPlayIds,metrics},
   *                 b:{…}, deltas:{metricId:number|null} }],
   *        warnings }
   */
  compareMetrics({ base, against, dimension, metricIds = [], filters = [], minSample = 0, context = {}, labels = {}, missingAsZero = false, allowUnlinkedPlays = false, gradeRole } = {}) {
    if (!Array.isArray(base) || !Array.isArray(against)) {
      throw new TypeError('StudyQuery.compareMetrics requires base and against play arrays');
    }
    const runArgs = { dimension, metricIds, filters, minSample, context, missingAsZero, allowUnlinkedPlays, gradeRole };
    const a = this.runMetrics({ ...runArgs, plays: base });
    const b = this.runMetrics({ ...runArgs, plays: against });
    const aMap = new Map(a.groups.map(g => [g.value, g]));
    const bMap = new Map(b.groups.map(g => [g.value, g]));
    const blank = () => ({ sampleSize: 0, belowMinSample: minSample > 0, matchingPlayIds: [], metrics: {} });
    const values = [...new Set([...aMap.keys(), ...bMap.keys()])].sort();
    const rows = values.map(value => {
      const ga = aMap.get(value) || blank();
      const gb = bMap.get(value) || blank();
      const deltas = {};
      for (const id of metricIds) {
        const ma = ga.metrics[id], mb = gb.metrics[id];
        // A delta is only ever computed between two genuinely usable values --
        // 'ok' or 'partial-film' both carry a real number; 'insufficient' and
        // 'unavailable' do not, and must not silently produce a delta against
        // a value the coach was never shown as trustworthy.
        const na = ma && (ma.state === 'ok' || ma.state === 'partial-film') ? ma.value : null;
        const nb = mb && (mb.state === 'ok' || mb.state === 'partial-film') ? mb.value : null;
        deltas[id] = (na === null || nb === null) ? null : Number((na - nb).toFixed(4));
      }
      return {
        value,
        a: { sampleSize: ga.sampleSize, belowMinSample: ga.belowMinSample, matchingPlayIds: ga.matchingPlayIds, metrics: ga.metrics },
        b: { sampleSize: gb.sampleSize, belowMinSample: gb.belowMinSample, matchingPlayIds: gb.matchingPlayIds, metrics: gb.metrics },
        deltas, sampleDelta: ga.sampleSize - gb.sampleSize,
      };
    });
    return {
      dimension, metricIds: metricIds.slice(), minSample,
      a: { label: labels.base || 'A', total: a.total },
      b: { label: labels.against || 'B', total: b.total },
      rows,
      warnings: [...a.warnings.map(w => `${labels.base || 'A'}: ${w}`), ...b.warnings.map(w => `${labels.against || 'B'}: ${w}`)],
    };
  }
}
