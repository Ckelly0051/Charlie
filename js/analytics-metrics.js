/**
 * AnalyticsMetrics — pure, DOM-free canonical cohort filtering + metric
 * calculation, extracted as the shared seam Study's expansion will build on.
 *
 * This is NOT a stats-engine.js rewrite. It does not reimplement analytics
 * formulas that already have one home (e.g. `_efficiencyStats`,
 * `_tendencyStats`) — those stay exactly where they are. It exists for the
 * metrics that were duplicated inline per-consumer (Reports' defensive
 * Best-Calls builder, and soon Study), so a future consumer computes a rate
 * exactly once, gets back one typed result, and never re-derives a cohort
 * or a formula by hand.
 *
 * THE SHARED RESULT CONTRACT (returned by `metric()`):
 *   {
 *     id:           string,              // metric id, e.g. 'stopRate'
 *     value:        number|null,         // null when unavailable
 *     count:        number,               // the raw numerator behind `value`
 *                                          // (a classified-play count for rate
 *                                          // metrics; total yards for yardsPerPlay)
 *     eligible:     number,               // plays with usable data for this metric,
 *                                          // regardless of `missingAsZero` mode
 *     denominator:  number,               // divisor actually used for `value`
 *     polarity:     'higher'|'lower',     // which direction is better
 *     state:        'ok'|'unavailable',   // 'unavailable' when denominator === 0
 *     refs:         string[],             // composite gameId::playId, sorted, deduped
 *   }
 *
 * `eligible` vs `denominator` matters for exactly one metric here
 * (`yardsPerPlay`): a play with no tagged yardage has no real value to
 * average in. By default (`missingAsZero: false`) such plays are excluded
 * from both `eligible` and `denominator` -- the honest behavior Study's
 * expansion needs. `defensivePerformance`'s existing formula historically
 * treated a missing yardage tag as 0 and folded it into the average anyway;
 * that exact legacy behavior is preserved via `missingAsZero: true`, which
 * still reports the true `eligible` count so the gap is never hidden, only
 * `denominator`/`value` follow the requested (legacy) division. Every other
 * metric here is a boolean per-play classification with no missing-data
 * ambiguity, so `eligible === denominator === cohort.length` for those
 * regardless of mode.
 *
 * Composite refs use the SAME `${gameId}::${playId}` contract as
 * `AnalyticsRegistry.playRef` / the existing `defensivePerformance` closures
 * -- this module deliberately does not import AnalyticsRegistry (no need to
 * couple a pure metrics module to the registry's StatsEngine-instance
 * dependency), so the three-line composite-ref rule is duplicated here
 * rather than shared. If that contract ever changes, both sites must change
 * together -- exactly the discipline `tools/e2e-analytics-metrics.mjs`
 * pins with a cross-game duplicate-id assertion.
 */

export const MetricPolarity = Object.freeze({ HIGHER: 'higher', LOWER: 'lower' });

/** `${gameId}::${playId}` -- throws rather than silently building an
 *  ambiguous bare-id ref, matching AnalyticsRegistry.playRef's contract.
 *  For DIRECT callers only (e.g. a future Study consumer building its own
 *  refs) -- `refsFor` below, used internally by `metric()`, does NOT throw:
 *  `defensivePerformance`'s original closure silently dropped a play with no
 *  resolvable id/game rather than failing the whole report, and `metric()`
 *  preserves that exact behavior rather than making a report-wide throw
 *  reachable from malformed input on a cohort it didn't choose. */
export function compositeRef(play, context = {}) {
  const gameId = play?.__gid ?? context.gameId ?? context.game;
  if (gameId == null || gameId === '' || play?.id == null) {
    throw new Error('Composite play reference requires gameId and play.id');
  }
  return `${gameId}::${play.id}`;
}

function refsFor(cohort, context) {
  const refs = [];
  for (const p of cohort) {
    const gameId = p?.__gid ?? context.gameId ?? context.game;
    if (gameId == null || gameId === '' || p?.id == null) continue;
    refs.push(`${gameId}::${p.id}`);
  }
  return [...new Set(refs)].sort();
}

function yards(p) {
  const v = parseInt(p?.tags?.yardage, 10);
  return Number.isFinite(v) ? v : null;
}

function hasYardage(p) {
  return yards(p) !== null;
}

/**
 * Metric definitions. Each `compute(cohort, deps, options)` returns the
 * pre-rounded `{ value, count, eligible, denominator }` for a cohort that is
 * ALREADY the play set to measure -- filtering the cohort is `cohortByCut`'s
 * job, not this one's, so a metric definition never has to know how it was
 * selected.
 *
 * Polarity reflects each metric's conventional framing in this codebase's
 * existing defensive reporting (defensivePerformance's own tie-break order
 * already encodes higher stopRate / lower yardsPerPlay as "better" -- these
 * definitions make that framing explicit and reusable instead of implicit
 * in a sort comparator).
 */
function rateResult(count, denominator, eligible = denominator) {
  if (!denominator) return { value: null, count: 0, eligible, denominator: 0 };
  return { value: +(count / denominator * 100).toFixed(1), count, eligible, denominator };
}

const METRICS = {
  stopRate: {
    polarity: MetricPolarity.HIGHER,
    compute(cohort, { isSuccessfulPlay }) {
      const stops = cohort.filter(p => !isSuccessfulPlay(p)).length;
      return rateResult(stops, cohort.length);
    },
  },
  successRate: {
    polarity: MetricPolarity.HIGHER,
    compute(cohort, { isSuccessfulPlay }) {
      const succ = cohort.filter(p => isSuccessfulPlay(p)).length;
      return rateResult(succ, cohort.length);
    },
  },
  explosiveRate: {
    // Framed defensively: allowing MORE explosive plays is worse, so lower is better.
    polarity: MetricPolarity.LOWER,
    compute(cohort, { isRun, isPass }) {
      const isExplosive = p => {
        const y = yards(p) || 0;
        return isRun(p) ? y >= 12 : isPass(p) ? y >= 16 : y >= 16;
      };
      return rateResult(cohort.filter(isExplosive).length, cohort.length);
    },
  },
  havocRate: {
    polarity: MetricPolarity.HIGHER,
    compute(cohort, { hasResult }) {
      const isHavoc = p => hasResult(p, 'Sack') || hasResult(p, 'Interception') || hasResult(p, 'Fumble')
        || ((yards(p) || 0) < 0 && !hasResult(p, 'Penalty') && !hasResult(p, 'Kneel') && !hasResult(p, 'Spike'));
      return rateResult(cohort.filter(isHavoc).length, cohort.length);
    },
  },
  negativeRate: {
    polarity: MetricPolarity.LOWER,
    compute(cohort) {
      return rateResult(cohort.filter(p => (yards(p) || 0) < 0).length, cohort.length);
    },
  },
  yardsPerPlay: {
    // Not a rate -- a mean -- so it computes value directly rather than via
    // rateResult, but still reports eligible/denominator/count (count here is
    // the total yards summed, the "numerator" of the average).
    polarity: MetricPolarity.LOWER,
    compute(cohort, _deps, { missingAsZero = false } = {}) {
      const eligible = cohort.filter(hasYardage).length;
      const denominator = missingAsZero ? cohort.length : eligible;
      if (!denominator) return { value: null, count: 0, eligible, denominator: 0 };
      const total = missingAsZero
        ? cohort.reduce((sum, p) => sum + (yards(p) || 0), 0)
        : cohort.filter(hasYardage).reduce((sum, p) => sum + yards(p), 0);
      return { value: +(total / denominator).toFixed(1), count: total, eligible, denominator };
    },
  },
};

export class AnalyticsMetrics {
  /**
   * @param {object} deps - the pure StatsEngine statics this module reuses
   *   rather than reimplementing: isRun, isPass, hasResult, splitFormations,
   *   splitPlayTypes, splitFronts, splitBlitzes. Plus one instance method,
   *   isSuccessfulPlay (bound), since success has no static home. Passing
   *   these in (instead of importing stats-engine.js) keeps this module
   *   genuinely standalone and avoids a stats-engine <-> analytics-metrics
   *   import cycle.
   * @param {function} [deps.buildCutFilter] - optional `(type, value) => predicate`,
   *   e.g. StatsEngine.prototype._buildCutFilter bound to an instance, so
   *   `cohortByCut` can reuse the EXACT existing report drilldown predicates
   *   (multi-value overlap included) rather than re-deriving them.
   */
  constructor(deps = {}) {
    const required = ['isRun', 'isPass', 'hasResult', 'isSuccessfulPlay'];
    for (const key of required) {
      if (typeof deps[key] !== 'function') throw new TypeError(`AnalyticsMetrics requires deps.${key}`);
    }
    this._deps = deps;
  }

  static get METRIC_IDS() { return Object.keys(METRICS); }
  static polarityOf(metricId) { return METRICS[metricId]?.polarity || null; }

  /**
   * Canonical cohort filter. Delegates to the caller-supplied `_buildCutFilter`
   * (the same predicate factory Reports/Study drilldowns already use), so a
   * multi-value dimension like Formation ("Ace + Trips") or Play Type still
   * overlaps cohorts exactly as every existing consumer expects -- this
   * function does not reimplement that matching logic, only centralizes
   * where callers reach it from.
   */
  cohortByCut(plays, cutType, cutValue) {
    if (typeof this._deps.buildCutFilter !== 'function') {
      throw new Error('AnalyticsMetrics.cohortByCut requires deps.buildCutFilter');
    }
    const predicate = this._deps.buildCutFilter(cutType, cutValue);
    if (typeof predicate !== 'function') throw new Error(`Unknown cut: ${cutType}`);
    return (plays || []).filter(predicate);
  }

  /**
   * Compute one metric over an already-selected cohort, returning the shared
   * result contract. `context` supplies the gameId fallback for composite
   * refs (see `compositeRef`); `options` are metric-specific (currently only
   * `yardsPerPlay`'s `missingAsZero` legacy-compatibility switch).
   */
  metric(cohort, metricId, context = {}, options = {}) {
    const def = METRICS[metricId];
    if (!def) throw new Error(`Unknown analytics metric: ${metricId}`);
    const list = cohort || [];
    const { value, count, eligible, denominator } = def.compute(list, this._deps, options);
    return {
      id: metricId,
      value,
      count,
      eligible,
      denominator,
      polarity: def.polarity,
      state: denominator > 0 ? 'ok' : 'unavailable',
      refs: refsFor(list, context),
    };
  }
}
