/**
 * AnalyticsMetrics: pure, DOM-free cohort filtering and metric calculation
 * shared by Reports and Study, so a rate is computed once and returned as one
 * typed result. Formulas that already have one home in stats-engine.js stay
 * there.
 *
 * RESULT CONTRACT (`metric()`):
 *   {
 *     id:           string,              // metric id, e.g. 'stopRate'
 *     value:        number|null,         // null when unavailable
 *     count:        number,              // raw numerator (a play count for rates;
 *                                         // total yards for yardsPerPlay)
 *     eligible:     number,              // plays with real underlying data, never
 *                                         // one classified from a fallback default
 *     denominator:  number,              // divisor actually used for `value`
 *     polarity:     'higher'|'lower',    // fixed by the metric id
 *     state:        'ok'|'insufficient'|'partial-film'|'unavailable',
 *     unlinkedCount: number,             // counted plays with no resolvable film
 *                                         // ref (only with allowUnlinkedPlays)
 *     refs:         string[],            // composite gameId::playId, sorted, deduped
 *   }
 *
 * STATE, in priority order:
 *   'unavailable'   denominator === 0; never a fabricated zero.
 *   'insufficient'  denominator below `options.minSample` (per metric, so one
 *                   group can be insufficient on one metric and ok on another).
 *   'partial-film'  a counted play's film ref could not be resolved
 *                   (only with `allowUnlinkedPlays: true`).
 *   'ok'            otherwise.
 *
 * ELIGIBILITY. A play with no real data for a metric (no yardage; no
 * down/distance for stop/success) is excluded from both `eligible` and
 * `denominator` by default. `missingAsZero: true` opts into the legacy
 * division (`denominator = cohort.length`, missing values fall to each
 * metric's default); `eligible` still reports the true count.
 *
 * POLARITY IS PER UNIT. The same formula is good when our offense produces it
 * and bad when our defense allows it, and this module only sees the cohort it
 * is given. So each metric id names its framing: `explosiveRate`,
 * `yardsPerPlay`, `havocRateAllowed`, `negativeRate` are offense-framed;
 * `explosivesAllowedRate`, `yardsAllowedPerPlay`, `havocRate`,
 * `negativeRateForced` are defense-framed. Each pair shares a formula.
 * `stopRate` and `successRate` are unambiguous by name and complements.
 *
 * FILM. Refs come from each metric's `refSource`, the exact plays that formed
 * `denominator`. A play with no resolvable ref, or a duplicate ref, throws by
 * default; with `allowUnlinkedPlays: true` (used by defensivePerformance so one
 * malformed play cannot fail a report) it is counted in `unlinkedCount` and
 * `state` becomes 'partial-film'. Invariant:
 * `refs.length + unlinkedCount === denominator`.
 *
 * Composite refs follow the `${gameId}::${playId}` rule of
 * AnalyticsRegistry.playRef; it is repeated here so this module needs no
 * registry dependency. Get a bound instance from StatsEngine.metricsEngine().
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

/** Study Phase 3: "this attempt succeeded", reused across completionRate/
 *  completions for passer, receiver, AND kicker. A completed pass has no
 *  `specialTeams` data -- its signal is `tags.result` (the SAME three-result
 *  check `StatsEngine._individualStats` already uses to decide whether a pass
 *  counts as a reception). A structured kick attempt has no meaningful
 *  `tags.result` at all -- its signal is the structured event's own
 *  `outcome.status === 'good'`. `deps.isMadeAttempt` (bound in
 *  `StatsEngine.metricsEngine()`) branches on which shape is present rather
 *  than this module importing SpecialTeamsModel directly, preserving this
 *  file's deliberate independence from other engine modules. */
function isComplete(deps, p) {
  return deps.isMadeAttempt(p);
}

/**
 * Study Phase 3: raw-count driver, the counting sibling of `rateResult`. A
 * player measure like "Solo Tackles" or "Touchdowns" is not a rate over the
 * cohort -- it IS the cohort (or an exact sub-filter of it), and there is no
 * meaningful percentage to display. Unlike `rateResult`, `denominator` is set
 * to the MATCHED count itself, not the cohort size: `refs` must describe
 * exactly the matched plays (never a coarser set), so denominator has to
 * equal that same number to preserve the `refs.length + unlinkedCount ===
 * denominator` invariant `metric()` establishes for every metric family.
 * `eligible` stays the cohort's own size (how many role-credited plays this
 * player actually had) -- `metric()`'s `countMetric` branch reads THIS field
 * for its min-sample/unavailable checks (see the field's own comment there),
 * so a real, honest zero sub-count is never misreported as "insufficient" or
 * "unavailable" -- only an EMPTY cohort (no opportunities at all) is.
 */
function countResult(cohort, classify) {
  const matched = cohort.filter(classify);
  return { value: matched.length, count: matched.length, eligible: cohort.length, denominator: matched.length, refSource: matched };
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

  // ---- Study Phase 3: player performance ------------------------------
  // Every metric below operates on an ALREADY player+role-scoped cohort --
  // "plays where jersey #22 is the credited ballCarrier/passer/receiver/
  // tackler/kicker/returner" -- produced by AnalyticsRegistry's
  // playerBallCarrier/playerPasser/playerReceiver/playerTackler/
  // playerKicker/playerReturner dimensions (analytics-registry.js). A metric
  // here never re-derives "is this player credited" -- that gate lives once,
  // in the dimension's own value extractor, built on StatsEngine.
  // effectivePlayers()/countsFootballRoles() -- it only classifies WITHIN
  // whatever cohort it is handed, matching this module's existing design
  // principle ("a metric definition never has to know how it was selected").
  //
  // `successRate`/`explosiveRate`/`negativeRate`/`yardsPerPlay` above are
  // REUSED AS-IS for ball carrier Success Rate/Explosive Rate/Negative Rate/
  // Yards-per-Carry -- a run-play cohort scoped to one ball carrier makes
  // "yards per play" exactly "yards per carry", no new formula needed.
  // `stopRate`/`yardsAllowedPerPlay` are likewise reused as-is for a
  // tackler's "plays involving them" Stop Rate/Yards Allowed.
  completionRate: {
    // Reused for passer "Completion Rate" (cohort = every dropback, attempts
    // + sacks -- see playerPasser's dimension comment), receiver "Catch Rate"
    // (cohort = targets, never contains a sack), and kicker "Field Goal %"
    // (cohort = FG attempts, never contains a sack) -- one formula, three
    // coach-facing names resolved by the caller (study-screen.js). A sack is
    // explicitly excluded from ELIGIBLE (not just from completions): a sack
    // is not a pass "attempt" by the official football definition, so it
    // must not lower a passer's completion rate the way an incompletion
    // would. This exclusion is a no-op for receiver/kicker cohorts, which
    // never contain a sack play to begin with.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return eligibleRate(cohort, p => !deps.hasResult(p, 'Sack'), p => isComplete(deps, p), missingAsZero);
    },
  },
  yardsPerReception: {
    // "Per reception," not "per target": averages only over the completed
    // subset of whatever cohort is passed, reusing `yardsPerPlayCompute`'s
    // exact avg-yards driver on that pre-filtered subset -- an incomplete
    // target has no yards to average in.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return yardsPerPlayCompute(cohort.filter(p => isComplete(deps, p)), missingAsZero);
    },
  },
  yardsPerAttempt: {
    // Passer "Yards/Attempt": explicitly excludes sacks from BOTH the
    // numerator and the denominator (a sack is not a pass attempt, and its
    // negative yardage is not "passing yardage"), unlike the generic
    // `yardsPerPlay` this checkpoint reuses as-is for ball-carrier ("Yards/
    // Carry") and receiver ("Yards/Target") cohorts. The rushing cohort includes
    // QB sacks under the college-style convention. This player metric is NOT reused
    // verbatim across roles, because Y/A's sack-exclusion is specific to the
    // passer's broadened (attempts + sacks) dimension cohort.
    polarity: MetricPolarity.HIGHER,
    compute(cohort, deps, { missingAsZero = false } = {}) {
      return yardsPerPlayCompute(cohort.filter(p => !deps.hasResult(p, 'Sack')), missingAsZero);
    },
  },
  // Blank grades are ineligible, not zero (Study Phase 3 requirement): each
  // of the three grade metrics below excludes a play whose `tags.grades
  // [gradeRole]` is not a real number, including a genuine 0 grade counting
  // as REAL data (`typeof g === 'number'`, never `g || fallback`).
  avgGrade: {
    polarity: MetricPolarity.HIGHER,
    compute(cohort, _deps, { gradeRole, missingAsZero = false } = {}) {
      if (!gradeRole) throw new Error('avgGrade requires options.gradeRole');
      const grade = p => { const g = p?.tags?.grades?.[gradeRole]; return typeof g === 'number' && Number.isFinite(g) ? g : null; };
      const eligible = cohort.filter(p => grade(p) != null);
      const source = missingAsZero ? cohort : eligible;
      const denominator = source.length;
      if (!denominator) return { value: null, count: 0, eligible: eligible.length, denominator: 0, refSource: source };
      const total = source.reduce((sum, p) => sum + (grade(p) ?? 0), 0);
      return { value: +(total / denominator).toFixed(2), count: total, eligible: eligible.length, denominator, refSource: source };
    },
  },
  positiveGradeRate: {
    polarity: MetricPolarity.HIGHER,
    compute(cohort, _deps, { gradeRole, missingAsZero = false } = {}) {
      if (!gradeRole) throw new Error('positiveGradeRate requires options.gradeRole');
      const grade = p => { const g = p?.tags?.grades?.[gradeRole]; return typeof g === 'number' && Number.isFinite(g) ? g : null; };
      return eligibleRate(cohort, p => grade(p) != null, p => grade(p) > 0, missingAsZero);
    },
  },
  negativeGradeRate: {
    polarity: MetricPolarity.LOWER,
    compute(cohort, _deps, { gradeRole, missingAsZero = false } = {}) {
      if (!gradeRole) throw new Error('negativeGradeRate requires options.gradeRole');
      const grade = p => { const g = p?.tags?.grades?.[gradeRole]; return typeof g === 'number' && Number.isFinite(g) ? g : null; };
      return eligibleRate(cohort, p => grade(p) != null, p => grade(p) < 0, missingAsZero);
    },
  },
  // Raw counts -- `countMetric: true` opts into `metric()`'s count-aware
  // state derivation (see `countResult`'s comment and `metric()` below): a
  // real, honest zero sub-count is never reported as "insufficient" or
  // "unavailable".
  touchdowns: {
    // Touchdowns for ball carrier, passer, receiver and returner: one
    // classification, four roles. `deps.isScoredTouchdown` reads a structured
    // return touchdown from its own event.
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.isScoredTouchdown(p)); },
  },
  completions: {
    // Reused for passer "Completions", receiver "Receptions", and kicker
    // "Field Goals Made" -- the raw-count sibling of `completionRate`.
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => isComplete(deps, p)); },
  },
  interceptionsThrown: {
    polarity: MetricPolarity.LOWER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.hasResult(p, 'Interception')); },
  },
  sacksTaken: {
    // Offense-framed: sacks a passer's own cohort absorbed. Same
    // classification as `sacksMade`; opposite polarity (see `sacksMade`).
    polarity: MetricPolarity.LOWER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.hasResult(p, 'Sack')); },
  },
  sacksMade: {
    // Defense-framed: sacks a tackler's own cohort produced. Identical
    // formula to `sacksTaken`; higher is better (a defender's own sack).
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.hasResult(p, 'Sack')); },
  },
  tackles: {
    // The cohort itself (every play in a tackler's cohort is a tackle by
    // construction), offered as a selectable metric for UI uniformity with
    // every other player measure rather than a special-cased "just read
    // sampleSize" row.
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort) { return countResult(cohort, () => true); },
  },
  soloTackles: {
    // Shared/solo credit uses the SAME rule `StatsEngine._individualStats`
    // already applies (tacklerIds.length on the play, not this specific
    // player's identity -- the play is only in this cohort because this
    // player IS one of the credited tacklers, so the total count on the play
    // alone determines solo vs. shared for them).
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.splitPlayers(p?.tags?.players?.tackler).length === 1); },
  },
  assistedTackles: {
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) { return countResult(cohort, p => deps.splitPlayers(p?.tags?.players?.tackler).length > 1); },
  },
  tfl: {
    // Excludes sacks, matching the team-level/box-score TFL definition
    // exactly (StatsEngine._individualStats' tacklers[id].tfl).
    polarity: MetricPolarity.HIGHER, countMetric: true,
    compute(cohort, deps) {
      return countResult(cohort, p => !deps.hasResult(p, 'Sack') && (parseInt(p?.tags?.yardage, 10) || 0) < 0);
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
   * @param {function} deps.splitPlayers - `StatsEngine.splitPlayers` (static).
   *   Study Phase 3: lets `soloTackles`/`assistedTackles` re-derive a play's
   *   own tackler list to classify solo vs. shared credit.
   * @param {function} deps.isMadeAttempt - `p => StatsEngine.isMadeAttempt(p,
   *   StatsEngine.hasResult)`. Study Phase 3: "this attempt succeeded",
   *   branching between a completed-pass check (`tags.result`) and a
   *   structured kick's `outcome.status === 'good'` -- see
   *   `StatsEngine.isMadeAttempt`'s own comment.
   */
  constructor(deps = {}) {
    const required = ['isRun', 'isPass', 'hasResult', 'isSuccessfulPlay', 'isEligiblePlay', 'splitPlayers', 'isMadeAttempt', 'isScoredTouchdown'];
    for (const key of required) {
      if (typeof deps[key] !== 'function') throw new TypeError(`AnalyticsMetrics requires deps.${key}`);
    }
    this._deps = deps;
  }

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
   *   - `gradeRole` -- required by the grade metrics (avgGrade/
   *     positiveGradeRate/negativeGradeRate): which `tags.grades` key to read.
   */
  metric(cohort, metricId, context = {}, options = {}) {
    const def = METRICS[metricId];
    if (!def) throw new Error(`Unknown analytics metric: ${metricId}`);
    const list = cohort || [];
    /* `options.deps` overrides ONE dependency for this call and nothing else.
       The defensive reports ask "did the OPPONENT succeed", which differs from
       the ball-carrier-framed success rule only on a touchdown our own defense
       scored, so they pass that predicate rather than keeping a second stop-rate
       formula of their own. The instance deps remain the shared owner. */
    const deps = options.deps ? { ...this._deps, ...options.deps } : this._deps;
    const { value, count, eligible, denominator, refSource } = def.compute(list, deps, options);
    // Refs MUST resolve from refSource -- the exact play list that produced
    // `denominator` -- never from `list` (the raw caller cohort), or an
    // ineligible play excluded from the denominator could still open film.
    const { refs, unlinkedCount } = resolveRefs(refSource, context, !!options.allowUnlinkedPlays);
    const minSample = options.minSample || 0;
    // Study Phase 3: a `countMetric` (a raw count like "Solo Tackles", not a
    // rate) has no meaningful "0 denominator = no data" reading -- its
    // `denominator` IS the matched sub-count, so a real, honest 0 (e.g. a
    // tackler with zero sacks) would otherwise report `state:'unavailable'`
    // and hide a legitimate zero exactly the way this project's honesty rule
    // forbids in the opposite direction (never show missing data as zero).
    // Count metrics instead gate on `eligible` -- the cohort's own size, i.e.
    // whether this player had ANY role-credited plays at all to count from.
    const gate = def.countMetric ? eligible : denominator;
    let state = 'ok';
    if (gate === 0) state = 'unavailable';
    else if (minSample > 0 && gate < minSample) state = 'insufficient';
    else if (unlinkedCount > 0) state = 'partial-film';
    return { id: metricId, value, count, eligible, denominator, polarity: def.polarity, state, unlinkedCount, refs };
  }
}
