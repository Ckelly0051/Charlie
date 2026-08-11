/**
 * StudyQuery — the redesign's pure query executor over the accepted P0-c
 * AnalyticsRegistry. It groups a play set by ONE dimension, computes the
 * requested registry measures per group from the canonical `StatsEngine.compute`
 * over that group's plays, and returns each group's `matchingPlayIds` so every
 * Study result stays film-linked (Watch / cut-ups / Plan).
 *
 * PARITY CONTRACT (the release gate, tools/e2e-study-query.mjs):
 *   For a dimension that maps to an existing report drilldown (DIMENSION_CUT),
 *   a group's `matchingPlayIds` are produced by the SAME `_buildCutFilter`
 *   predicate the current reports use — so a Study "formation = Shotgun" query
 *   returns the EXACT play set as the old report's Shotgun drilldown
 *   (`tools/e2e-parity.mjs` golden). No lost film link, no changed denominator:
 *   the numbers ride on `compute()`, which the parity harness already pins.
 *
 * It reimplements NO analytics. Grouping/film links go through the registry +
 * `_buildCutFilter`; measures go through `registry.readMeasures(compute(group))`.
 * Dimensions without a canonical cut (quarter, result, grade, player role,
 * custom tag/field, drive, distance, unit) still group + film-link via the
 * registry's value extractor — new query surfaces, honestly outside the report
 * golden.
 */
export class StudyQuery {
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
      formation: 'formation', qbAlignment: 'qbAlignment', playType: 'playType',
      personnel: 'personnel', backfield: 'backfield', strength: 'strength', down: 'down',
      playDir: 'playDir', motion: 'motion', hash: 'hash', coverage: 'coverage',
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
      const groupMeasures = measures.length
        ? this.registry.readMeasures(this.stats.compute(groupPlays), measures)
        : {};
      return { value, sampleSize, belowMinSample, matchingPlayIds, measures: groupMeasures };
    });
    return { dimension, total: cohort.length, measures: measures.slice(), minSample, groups, warnings };
  }

  _num(v) {
    const n = typeof v === 'number' ? v : parseFloat(v);
    return Number.isFinite(n) ? n : null;
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
    const blank = () => ({ sampleSize: 0, belowMinSample: minSample > 0, matchingPlayIds: [], measures: {} });
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
        a: { sampleSize: ga.sampleSize, belowMinSample: ga.belowMinSample, matchingPlayIds: ga.matchingPlayIds, measures: ga.measures },
        b: { sampleSize: gb.sampleSize, belowMinSample: gb.belowMinSample, matchingPlayIds: gb.matchingPlayIds, measures: gb.measures },
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
}
