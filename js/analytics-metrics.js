/**
 * AnalyticsMetrics — pure, DOM-free canonical cohort filtering + metric
 * calculation, extracted as the shared seam Study's expansion will build on.
 *
 * This is NOT a stats-engine.js rewrite. It does not reimplement analytics
 * formulas that already have one home (e.g. `_efficiencyStats`,
 * `_tendencyStats`) — those stay exactly where they are. It exists for the
 * metrics that were duplicated inline per-consumer (Reports' defensive
 * Best-Calls builder, and soon Study), so a future consumer computes a rate
 * exactly once and gets back one typed result instead of re-deriving a
 * cohort or a formula by hand.
 *
 * THE SHARED RESULT CONTRACT (returned by `metric()`):
 *   {
 *     id:           string,              // metric id, e.g. 'stopRate'
 *     value:        number|null,         // null when unavailable
 *     count:        number,               // the raw numerator behind `value`
 *                                          // (a classified-play count for rate
 *                                          // metrics; total yards for yardsPerPlay)
 *     eligible:     number,               // plays with REAL underlying data for
 *                                          // this metric -- never a play whose
 *                                          // classification came from a fallback
 *                                          // default, regardless of `missingAsZero`
 *     denominator:  number,               // divisor actually used for `value`
 *     polarity:     'higher'|'lower',     // which direction is better; a fixed,
 *                                          // unambiguous property of the metric
 *                                          // ID itself (see "polarity is per unit"
 *                                          // below) -- never guessed by a caller
 *     state:        'ok'|'insufficient'|'partial-film'|'unavailable',
 *     unlinkedCount: number,              // cohort plays counted in the numerator/
 *                                          // denominator whose film ref could not
 *                                          // be resolved (only nonzero when
 *                                          // `allowUnlinkedPlays` is set -- see below)
 *     refs:         string[],             // composite gameId::playId, sorted, deduped
 *   }
 *
 * STATE is a priority, evaluated in this order:
 *   'unavailable'   denominator === 0 -- no data at all, never a fabricated zero.
 *   'insufficient'  denominator > 0 but below `options.minSample` -- some data,
 *                   not enough to trust. (`minSample` is per-metric here, not a
 *                   query-grouping concept; `StudyQuery.runMetrics` threads its
 *                   own `minSample` into every metric() call so a group can be
 *                   `insufficient` on one metric's denominator while another
 *                   metric in the SAME group has enough eligible plays to be `ok`.)
 *   'partial-film'  a play informed the numerator/denominator but its film ref
 *                   could not be resolved (only reachable with
 *                   `allowUnlinkedPlays: true` -- see below).
 *   'ok'            otherwise.
 *
 * `eligible` vs `denominator`: a play with no REAL underlying data for a metric
 * (no tagged yardage; no tagged down/distance for stop/success classification)
 * is excluded from BOTH by default (`missingAsZero: false`) -- the honest
 * behavior Study's expansion needs, and the fix for a real correctness gap
 * (Codex review, 2026-08-14, finding #3): `defensivePerformance`'s legacy
 * formulas, and `_isSuccessfulPlay` itself, silently treated a missing tag as
 * a fabricated default (missing yardage -> 0, missing distance -> 10) and
 * folded the result in as if it were real. `missingAsZero: true` is the
 * explicit, opt-in compatibility switch that reproduces that exact legacy
 * division (`denominator = cohort.length`, ineligible plays fall through each
 * metric's own zero/false default) -- `eligible` still reports the TRUE count
 * either way, so the gap is never hidden, only which divisor is *used* changes.
 *
 * POLARITY IS PER UNIT, NOT UNIVERSAL (Codex review, 2026-08-14, finding #1):
 * a rate like "explosive plays per snap" is good when YOUR offense produces
 * it and bad when your defense allows it -- the polarity is a property of
 * *whose* plays the cohort represents, which this module cannot see (it only
 * sees whatever cohort the caller passed in). The fix is that every metric ID
 * here names its own unambiguous framing, so polarity never has to be guessed
 * from the cohort: `explosiveRate`/`yardsPerPlay`/`havocRateAllowed`/
 * `negativeRate` are offense-produced (this team's own plays; higher is worse
 * only for negativeRate/havocRateAllowed, matching Study's existing
 * `_lowerIsBetter` convention in study-screen.js), while
 * `explosivesAllowedRate`/`yardsAllowedPerPlay`/`havocRate`/`negativeRateForced`
 * are defense-framed (what this team's defense did TO an opponent). Each pair
 * shares the identical formula -- only the polarity label differs -- because
 * the FRAMING lives entirely in which cohort the caller passes (offensive
 * snaps vs. defensive snaps), never in the formula. `stopRate`/`successRate`
 * are the one pair that needs no "allowed"/"forced" sibling: they are already
 * unambiguous by name (a "stop" is inherently the defense's accomplishment; a
 * "success" is inherently the offense's), and each is exactly the complement
 * of the other over the same underlying classification.
 *
 * FILM-COHORT HONESTY (Codex review, 2026-08-14, finding #2, TWICE): a play
 * that counts toward the numerator/denominator but cannot produce a composite
 * ref used to silently vanish from `refs` -- "N% based on D plays" could open
 * fewer than D clips with no signal that happened. The default now FAILS
 * LOUDLY the moment that happens (`allowUnlinkedPlays: false`, matching
 * `compositeRef`'s existing fail-loud contract for direct callers).
 * `allowUnlinkedPlays: true` is the explicit compatibility escape hatch
 * `defensivePerformance` uses to preserve its historical closure, which never
 * let one malformed play fail an entire report -- even there, `unlinkedCount`
 * is always reported in the contract, so the gap is visible rather than
 * silently absorbed, and `state` becomes `'partial-film'` to say so.
 *
 * The first attempt at this closed the identity half but not the eligibility
 * half: `metric()` resolved refs from the ORIGINAL cohort passed in, while
 * `denominator` came from each metric's own eligible/legacy SUBSET of that
 * cohort -- so in honest mode (the default) an ineligible play was correctly
 * excluded from `denominator` but its ref still landed in `refs`, and a
 * one-play denominator could open two clips. Fixed by having every metric's
 * `compute()` also return `refSource` -- the EXACT play list that produced
 * `denominator` -- and resolving refs from THAT, never from the raw cohort.
 * `resolveRefs` also now counts a DUPLICATE composite ref (two entries in
 * `refSource` resolving to the same `gameId::playId`) the same way as an
 * unresolvable one: it fails loudly by default, and under
 * `allowUnlinkedPlays: true` it increments `unlinkedCount` and excludes the
 * duplicate from `refs` rather than silently collapsing it via `Set`
 * dedup with no accounting. This makes `refs.length + unlinkedCount ===
 * denominator` an INVARIANT, always -- every play the denominator counted
 * either produced a ref or was counted as unlinked; none can vanish silently.
 *
 * Composite refs use the SAME `${gameId}::${playId}` contract as
 * `AnalyticsRegistry.playRef` / the historical `defensivePerformance`
 * closures -- this module deliberately does not import AnalyticsRegistry (no
 * need to couple a pure metrics module to the registry's StatsEngine-instance
 * dependency), so the three-line composite-ref rule is duplicated here rather
 * than shared. `AnalyticsRegistry.metricsEngine()` is the one place that
 * constructs a correctly-bound `AnalyticsMetrics` instance for the live app
 * (Codex review, 2026-08-14, finding #4) -- consumers should get their engine
 * from there rather than re-deriving the `deps` binding.
 */

export const MetricPolarity = Object.freeze({ HIGHER: 'higher', LOWER: 'lower' });

/** `${gameId}::${playId}` -- throws rather than silently building an
 *  ambiguous bare-id ref, matching `AnalyticsRegistry.playRef`'s contract.
 *  For DIRECT callers only (e.g. a future Study consumer building its own
 *  refs one play at a time) -- `resolveRefs` below, used internally by
 *  `metric()`, has its own explicit allow/disallow contract; see the
 *  module docblock's "FILM-COHORT HONESTY" section. */
export function compositeRef(play, context = {}) {
  const gameId = play?.__gid ?? context.gameId ?? context.game;
  if (gameId == null || gameId === '' || play?.id == null) {
    throw new Error('Composite play reference requires gameId and play.id');
  }
  return `${gameId}::${play.id}`;
}

/** Resolves composite refs for the EXACT play list that produced a metric's
 *  `denominator` (`refSource`, never the raw caller-supplied cohort -- see
 *  the module docblock's "FILM-COHORT HONESTY" section). Default
 *  (`allowUnlinkedPlays: false`) throws the instant a play cannot produce a
 *  ref OR produces one already seen (a duplicate composite ref -- two
 *  entries resolving to the same film clip), so `refs.length + unlinkedCount`
 *  always equals `refSource.length`, and a metric's `count`/`denominator`
 *  can never silently outrun its `refs`. `allowUnlinkedPlays: true` preserves
 *  `defensivePerformance`'s historical closure (never fail the whole report
 *  over one bad play), but still reports every unresolvable/duplicate case
 *  via `unlinkedCount` rather than a bare `Set` dedup hiding it. */
function resolveRefs(refSource, context, allowUnlinkedPlays) {
  const seen = new Set();
  const refs = [];
  let unlinkedCount = 0;
  for (const p of refSource) {
    const gameId = p?.__gid ?? context.gameId ?? context.game;
    const unresolvable = gameId == null || gameId === '' || p?.id == null;
    if (unresolvable) {
      unlinkedCount++;
      if (!allowUnlinkedPlays) {
        throw new Error('AnalyticsMetrics: cohort contains a play with no resolvable gameId/id (pass allowUnlinkedPlays:true to preserve legacy silent-omission behavior)');
      }
      continue;
    }
    const ref = `${gameId}::${p.id}`;
    if (seen.has(ref)) {
      unlinkedCount++;
      if (!allowUnlinkedPlays) {
        throw new Error('AnalyticsMetrics: cohort contains a duplicate composite play reference (pass allowUnlinkedPlays:true to preserve legacy silent-collapse behavior)');
      }
      continue;
    }
    seen.add(ref);
    refs.push(ref);
  }
  return { refs: refs.sort(), unlinkedCount };
}

function yards(p) {
  const v = parseInt(p?.tags?.yardage, 10);
  return Number.isFinite(v) ? v : null;
}

function hasYardage(p) {
  return yards(p) !== null;
}

function rateResult(count, denominator, eligible = denominator) {
  if (!denominator) return { value: null, count: 0, eligible, denominator: 0 };
  return { value: +(count / denominator * 100).toFixed(1), count, eligible, denominator };
}

/**
 * Generic eligible/legacy-denominator rate driver shared by every
 * yardage-classified metric (explosive/negative and their allowed/forced
 * siblings) and havoc (result-type OR yardage eligible). `isEligible`
 * determines which plays carry REAL underlying data (no StatsEngine fallback
 * default folded in); `classify` decides whether an eligible (or, in legacy
 * `missingAsZero` mode, any) play counts toward the numerator. In legacy
 * mode `classify` runs against the FULL cohort, so an ineligible play (e.g.
 * no tagged yardage) falls through to whatever default its own classifier
 * uses (`yards(p) || 0` inside `isExplosive`/`isNegative`/`isHavoc`) --
 * exactly reproducing the pre-fix formula. Returns `refSource` alongside the
 * rate fields: the EXACT play list `denominator` was computed from, so
 * `metric()` can resolve film refs from that same set rather than the raw
 * cohort (see the module docblock's "FILM-COHORT HONESTY" section).
 */
function eligibleRate(cohort, isEligible, classify, missingAsZero) {
  const eligible = cohort.filter(isEligible);
  const source = missingAsZero ? cohort : eligible;
  return { ...rateResult(source.filter(classify).length, source.length, eligible.length), refSource: source };
}

const isExplosive = deps => p => {
  const y = yards(p) || 0;
  return deps.isRun(p) ? y >= 12 : deps.isPass(p) ? y >= 16 : y >= 16;
};
const isNegative = () => p => (yards(p) || 0) < 0;
const isHavocEligible = deps => p =>
  deps.hasResult(p, 'Sack') || deps.hasResult(p, 'Interception') || deps.hasResult(p, 'Fumble') || hasYardage(p);
const isHavoc = deps => p =>
  deps.hasResult(p, 'Sack') || deps.hasResult(p, 'Interception') || deps.hasResult(p, 'Fumble')
  || ((yards(p) || 0) < 0 && !deps.hasResult(p, 'Penalty') && !deps.hasResult(p, 'Kneel') && !deps.hasResult(p, 'Spike'));

function yardsPerPlayCompute(cohort, missingAsZero) {
  const eligiblePlays = cohort.filter(hasYardage);
  const source = missingAsZero ? cohort : eligiblePlays;
  const denominator = source.length;
  if (!denominator) return { value: null, count: 0, eligible: eligiblePlays.length, denominator: 0, refSource: source };
  const total = source.reduce((sum, p) => sum + (yards(p) || 0), 0);
  return { value: +(total / denominator).toFixed(1), count: total, eligible: eligiblePlays.length, denominator, refSource: source };
}

/**
 * Metric definitions. Each `compute(cohort, deps, options)` returns the
 * pre-rounded `{ value, count, eligible, denominator }` for a cohort that is
 * ALREADY the play set to measure -- filtering the cohort is `cohortByCut`'s
 * job, not this one's, so a metric definition never has to know how it was
 * selected. Six football concepts, each named to be unambiguous about which
 * unit's plays it favors (see the module docblock's "POLARITY IS PER UNIT"
 * section) -- five of them ship as an offense-produced/defense-framed pair
 * sharing one formula; stopRate/successRate are already unambiguous by name
 * and need no sibling.
 */
const METRICS = {
  stopRate: {
    // The defense's own accomplishment -- unambiguous regardless of cohort.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, { isSuccessfulPlay, isEligiblePlay }, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, isEligiblePlay, p => !isSuccessfulPlay(p), missingAsZero);
    },
  },
  successRate: {
    // The offense's own accomplishment -- unambiguous regardless of cohort.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, { isSuccessfulPlay, isEligiblePlay }, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, isEligiblePlay, isSuccessfulPlay, missingAsZero);
    },
  },
  explosiveRate: {
    // Offense-produced: this cohort's team gained an explosive play.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, hasYardage, isExplosive(deps), missingAsZero);
    },
  },
  explosivesAllowedRate: {
    // Defense-framed: an OPPONENT gained an explosive play against this
    // cohort's defense. Identical formula to explosiveRate; lower is better.
    polarity: MetricPolarity.LOWER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, hasYardage, isExplosive(deps), missingAsZero);
    },
  },
  havocRate: {
    // Defense-created: sacks/turnovers/TFL THIS cohort's defense produced.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, isHavocEligible(deps), isHavoc(deps), missingAsZero);
    },
  },
  havocRateAllowed: {
    // Offense-suffered: sacks/turnovers/TFL THIS cohort's offense gave up.
    // Identical formula to havocRate; lower is better.
    polarity: MetricPolarity.LOWER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, isHavocEligible(deps), isHavoc(deps), missingAsZero);
    },
  },
  negativeRate: {
    // Offense-produced: this cohort's team's own negative-yardage plays.
    polarity: MetricPolarity.LOWER,
    compute(cohort, _deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, hasYardage, isNegative(), missingAsZero);
    },
  },
  negativeRateForced: {
    // Defense-forced: negative-yardage plays THIS cohort's defense forced on
    // the opponent. Identical formula to negativeRate; higher is better.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, _deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, hasYardage, isNegative(), missingAsZero);
    },
  },
  yardsPerPlay: {
    // Offense-produced: yards this cohort's team gained per snap.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, _deps, { missingAsZero = false } = {}) {
      return yardsPerPlayCompute(cohort, missingAsZero);
    },
  },
  yardsAllowedPerPlay: {
    // Defense-framed: yards THIS cohort's defense allowed per snap. Identical
    // formula to yardsPerPlay; lower is better.
    polarity: MetricPolarity.LOWER,
    compute(cohort, _deps, { missingAsZero = false } = {}) {
      return yardsPerPlayCompute(cohort, missingAsZero);
    },
  },
};

export class AnalyticsMetrics {
  /**
   * @param {object} deps - the pure StatsEngine statics/instance methods this
   *   module reuses rather than reimplementing: isRun, isPass, hasResult
   *   (statics), plus isSuccessfulPlay and isEligiblePlay (bound instance
   *   methods -- success/eligibility classification has no static home).
   *   Passing these in (instead of importing stats-engine.js) keeps this
   *   module genuinely standalone and avoids a stats-engine <-> this-module
   *   import cycle.
   * @param {function} [deps.buildCutFilter] - optional `(type, value) => predicate`,
   *   e.g. `StatsEngine.prototype._buildCutFilter` bound to an instance, so
   *   `cohortByCut` can reuse the EXACT existing report drilldown predicates
   *   (multi-value overlap included) rather than re-deriving them. Only
   *   required if `cohortByCut` is actually called.
   */
  constructor(deps = {}) {
    const required = ['isRun', 'isPass', 'hasResult', 'isSuccessfulPlay', 'isEligiblePlay'];
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
   * refs. `options`:
   *   - `missingAsZero` (default false) -- legacy-compatibility divisor, see
   *     the module docblock.
   *   - `allowUnlinkedPlays` (default false) -- legacy-compatibility film-ref
   *     leniency, see the module docblock. Default THROWS on an unresolvable
   *     ref rather than silently omitting it.
   *   - `minSample` (default 0) -- when > 0 and `denominator` is positive but
   *     below it, `state` becomes `'insufficient'` instead of `'ok'`.
   */
  metric(cohort, metricId, context = {}, options = {}) {
    const def = METRICS[metricId];
    if (!def) throw new Error(`Unknown analytics metric: ${metricId}`);
    const list = cohort || [];
    const { value, count, eligible, denominator, refSource } = def.compute(list, this._deps, options);
    // Refs MUST resolve from refSource -- the exact play list that produced
    // `denominator` -- never from `list` (the raw caller cohort), or an
    // ineligible play excluded from the denominator could still open film.
    const { refs, unlinkedCount } = resolveRefs(refSource, context, !!options.allowUnlinkedPlays);
    const minSample = options.minSample || 0;
    let state = 'ok';
    if (denominator === 0) state = 'unavailable';
    else if (minSample > 0 && denominator < minSample) state = 'insufficient';
    else if (unlinkedCount > 0) state = 'partial-film';
    return { id: metricId, value, count, eligible, denominator, polarity: def.polarity, state, unlinkedCount, refs };
  }
}
