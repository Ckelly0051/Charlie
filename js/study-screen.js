import { mountNativeStudy } from './native-study.jsx';
/** Interactive Study workspace over the parity-locked StudyQuery engine. */
export class StudyScreen {
  static get DIMENSIONS() {
    // E3b review finding: qbAlignment/coverageFamily were 'ready' in the
    // AnalyticsRegistry and fully proven at the query-engine level (registry-set
    // equality, completeness), but this hardcoded list never listed them — so a
    // coach could not select either dimension in Study at all. Positioned next to
    // their structural counterpart (qbAlignment after formation, coverageFamily
    // after coverage), mirroring the Film Room column placement.
    // Study expansion (2026-08-15): fieldZone joins the list now that it is a
    // real 'ready' registry dimension (was deferred -- see analytics-registry.js).
    // scoreSituation is NOT added: it remains deliberately deferred (no
    // per-play score-at-snap reconstruction exists), so it is honestly absent
    // rather than offered and silently unusable.
    return ['playCall', 'playConcept', 'formation', 'qbAlignment', 'playType', 'runPass', 'down', 'distance', 'fieldZone', 'quarter',
      'drive', 'unit', 'hash', 'personnel', 'backfield', 'strength', 'motion',
      'playDir', 'defFront', 'coverage', 'coverageFamily', 'blitz', 'result', 'playerRole', 'grade',
      'specialTeamsPhase', 'specialTeamsUnit', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore', 'specialTeamsModifier',
      'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts',
      'customTag', 'customField'];
  }

  /** The dimension Study opens on. Stated, not inferred from list order. */
  static get DEFAULT_DIMENSION() { return 'formation'; }

  static get MEASURES() {
    return ['sampleSize', 'successRate', 'runShare', 'passShare',
      'explosiveRate', 'negativeRate', 'turnovers', 'touchdowns', 'havocRate',
      'epaPerPlay',
      ...StudyScreen.PENALTY_MEASURE_IDS, ...StudyScreen.SPECIAL_TEAMS_MEASURE_IDS];
  }

  /**
   * Study expansion Phase 2 (penalties + Special Teams). Both lists ride the
   * SAME `run()`/`compare()`/`readMeasures()` path every existing flat
   * measure already uses (never AnalyticsMetrics' offense/defense-polarity
   * `runMetrics()`/`compareMetrics()` -- that machinery exists specifically
   * for the five RICH_METRIC_PAIRS concepts, and penalties/Special Teams
   * aren't that shape). Comparisons, saved views, pivot, and Save-to-Plan all
   * work for these automatically because they're the same measures, not a
   * parallel system.
   */
  static get PENALTY_MEASURE_IDS() {
    return [
      'penaltyFlaggedPlays', 'penaltyFouls', 'penaltyAccepted', 'penaltyDeclined',
      'penaltyOffsetting', 'penaltyUnresolved', 'penaltyNoPlay', 'penaltyAutomaticFirstDowns',
      'penaltyYardsSubject', 'penaltyYardsOpponent',
      'penaltyAcceptedSubject', 'penaltyAcceptedOpponent',
      'penaltyAcceptedOffense', 'penaltyAcceptedDefense', 'penaltyAcceptedSpecialTeams',
      'penaltyYardsOffense', 'penaltyYardsDefense',
    ];
  }
  static get SPECIAL_TEAMS_MEASURE_IDS() {
    return [
      'stPuntCount', 'stPuntGrossAvg', 'stPuntNetAvg', 'stPuntHangAvg', 'stPuntTouchbackPct',
      'stPuntFairCatchPct', 'stPuntBlocked', 'stPuntReturnAllowedAvg',
      'stKickoffCount', 'stKickoffAvg', 'stKickoffTouchbackPct', 'stKickoffFairCatchPct',
      'stKickoffReturnAllowedAvg', 'stKickoffOnsideAtt', 'stKickoffOnsideRecovered',
      'stFieldGoalAtt', 'stFieldGoalMade', 'stFieldGoalPct', 'stFieldGoalLong',
      'stFieldGoalBlockSnaps', 'stFieldGoalBlocked', 'stTryDownsCount',
      'stExtraPointAtt', 'stExtraPointMade', 'stExtraPointPct',
      'stTwoPointAtt', 'stTwoPointMade', 'stTwoPointPct',
      'stKickReturnCount', 'stKickReturnAvg', 'stKickReturnLong', 'stKickReturnTD', 'stKickReturnMuffed',
      'stPuntReturnCount', 'stPuntReturnAvg', 'stPuntReturnLong', 'stPuntReturnTD', 'stPuntReturnMuffed',
    ];
  }

  /**
   * Study expansion (2026-08-15) -- core coaching analysis. Five football
   * concepts, each an offense-produced/defense-allowed pair sharing one
   * AnalyticsMetrics formula (see analytics-metrics.js's "POLARITY IS PER
   * UNIT" docblock). A coach never picks "successRate" and gets a universal
   * higher-is-better number regardless of who's on the field -- picking a
   * CONCEPT plus a Unit resolves the ONE correct, unambiguous metric id, via
   * `_richMetricId()`. This deliberately REPLACES the old unit-blind
   * `successRate`/`explosiveRate`/`negativeRate`/`havocRate` selector entries
   * (still present in `MEASURES` above for `run()`/`compare()`'s own
   * backward-compatible flat contract, which stays byte-unchanged) --
   * offense/defense framing was exactly the bug this pairing fixes.
   */
  static get RICH_METRIC_PAIRS() {
    return {
      success: { offense: 'successRate', defense: 'stopRate', name: 'Success Rate' },
      yards: { offense: 'yardsPerPlay', defense: 'yardsAllowedPerPlay', name: 'Yards / Play' },
      explosive: { offense: 'explosiveRate', defense: 'explosivesAllowedRate', name: 'Explosive Rate' },
      negative: { offense: 'negativeRate', defense: 'negativeRateForced', name: 'Negative Play Rate' },
      havoc: { offense: 'havocRateAllowed', defense: 'havocRate', name: 'Havoc' },
    };
  }
  static get RICH_METRIC_IDS() { return Object.keys(StudyScreen.RICH_METRIC_PAIRS); }
  /** The flat, registry-backed measures still selectable alongside the rich
   *  concepts -- no AnalyticsMetrics equivalent exists for these, so they
   *  stay on the original `run()`/`compare()` path untouched.
   *  Review fix (b8a0ab4): `runShare`/`passShare` are real, working measures
   *  on that legacy path -- there is no reason to retire them, and doing so
   *  silently changed a coach's saved play-mix question into a different one
   *  (Success Rate) on reopen. They belong here, restorable exactly, same as
   *  `epaPerPlay`/`touchdowns`/`turnovers`. */
  static get LEGACY_SELECTABLE_MEASURES() { return ['runShare', 'passShare', 'epaPerPlay', 'touchdowns', 'turnovers']; }
  // Study expansion Phase 2: penalty/Special Teams measures are selectable
  // primary metrics too -- they ride the same picker + lens grouping as the
  // legacy flat measures above, not a separate control.
  static get SELECTABLE_METRICS() {
    return [...StudyScreen.RICH_METRIC_IDS, ...StudyScreen.LEGACY_SELECTABLE_MEASURES,
      ...StudyScreen.PENALTY_MEASURE_IDS, ...StudyScreen.SPECIAL_TEAMS_MEASURE_IDS];
  }
  static get DEFAULT_METRIC() { return 'success'; }
  /**
   * Review fix (bc0f677 finding #3, narrowed by b8a0ab4): a saved view
   * created before this checkpoint may store one of the four retired
   * unit-blind OUTCOME ids (`successRate`/`explosiveRate`/`negativeRate`/
   * `havocRate`) -- none of those are `<option>` values in `#wsStudyMeasure`
   * any more, so assigning one directly leaves the select blank. This is an
   * explicit, disclosed UPGRADE to the equivalent coaching-metric CONCEPT,
   * never a guess of offense vs defense: the coach's already-saved Unit
   * value (part of the same view, untouched by this map) still resolves the
   * exact framing via `_richMetricId`, and an ambiguous/blank saved Unit
   * still fails closed with the unit prompt exactly as it does for a newly
   * built query. `runShare`/`passShare` are deliberately NOT in this map --
   * they measure play-type mix, not success/failure, so "upgrading" one to
   * Success Rate would answer a different coaching question, not the same
   * one better. They are real `LEGACY_SELECTABLE_MEASURES` entries instead
   * (see above) and a saved view referencing either restores EXACTLY.
   * Applying this map only changes the LIVE control value; it never rewrites
   * the saved view in storage, so opening an old view is never itself a
   * mutation.
   */
  static get LEGACY_MEASURE_UPGRADE() {
    return {
      successRate: 'success', explosiveRate: 'explosive', negativeRate: 'negative', havocRate: 'havoc',
    };
  }
  /** Study opens already answering the coach's own offense -- a concrete,
   *  useful default, not a guess made during computation. The coach can
   *  clear it to "All units" at any time; this only affects the INITIAL
   *  control value, never overrides an explicit selection. */
  static get DEFAULT_UNIT() { return 'offense'; }

  /**
   * AX-7 — the lenses applied to the primary-metric picker.
   *
   * Study expansion (2026-08-15): the picker's option SET changed from the
   * old unit-blind flat measures to `SELECTABLE_METRICS` (the five rich
   * offense/defense concept pairs plus the three legacy flat measures with
   * no AnalyticsMetrics equivalent). Grouping does NOT preserve overall
   * option order, so anything that depended on "the first option" has to be
   * pinned explicitly -- `_bind()` restores the historical default for
   * exactly that reason (now `DEFAULT_METRIC`, 'success'). Option VALUES for
   * the legacy three are untouched, so a saved view referencing them is
   * still byte-identical.
   */
  static get MEASURE_LENSES() {
    return [
      { name: 'Coaching metrics', ids: StudyScreen.RICH_METRIC_IDS },
      { name: 'Advanced', ids: StudyScreen.LEGACY_SELECTABLE_MEASURES },
      { name: 'Penalties', ids: StudyScreen.PENALTY_MEASURE_IDS },
      { name: 'Special Teams', ids: StudyScreen.SPECIAL_TEAMS_MEASURE_IDS },
    ];
  }

  /**
   * Study Phase 3: Player Performance. A dedicated two-step picker (Role,
   * then a role-scoped Metric) rather than one more entry in the primary
   * metric dropdown -- the metric VOCABULARY genuinely differs per role
   * (Completion Rate means nothing for a Tackler; Solo Tackles means nothing
   * for a Passer), so a flat combined list would either mix unrelated
   * questions or need per-role filtering logic duplicated at render time.
   * Each role names: its AnalyticsRegistry player dimension (built on
   * StatsEngine.effectivePlayers/splitPlayers/countsFootballRoles -- see
   * analytics-registry.js), the AnalyticsMetrics metric ids it may select
   * (every one already defined in analytics-metrics.js -- five of them,
   * successRate/yardsPerPlay/explosiveRate/negativeRate/stopRate/
   * yardsAllowedPerPlay, are the EXACT SAME formulas team-level Study
   * concepts already use, reused as-is over a player-scoped cohort), and
   * whether that role has a `tags.grades` key at all (kicker/returner do
   * not -- the tag form never exposed a grade control for them, matching
   * `StatsEngine._individualStats`, so their metric lists omit the three
   * grade metrics rather than offering a control that can never resolve).
   */
  static get PLAYER_ROLES() {
    return {
      ballCarrier: {
        name: 'Ball Carrier', dimension: 'playerBallCarrier', gradeRole: 'ballCarrier',
        metrics: ['successRate', 'yardsPerPlay', 'explosiveRate', 'negativeRate', 'avgGrade', 'positiveGradeRate', 'negativeGradeRate'],
      },
      passer: {
        name: 'Passer', dimension: 'playerPasser', gradeRole: 'passer',
        // yardsPerAttempt (not yardsPerPlay) -- the passer's cohort includes
        // sacks (see playerPasser's dimension comment), and Y/A must exclude
        // them from both numerator and denominator; see yardsPerAttempt's
        // own comment in analytics-metrics.js.
        metrics: ['completionRate', 'yardsPerAttempt', 'completions', 'touchdowns', 'interceptionsThrown', 'sacksTaken', 'successRate', 'avgGrade', 'positiveGradeRate', 'negativeGradeRate'],
      },
      receiver: {
        name: 'Receiver', dimension: 'playerReceiver', gradeRole: 'receiver',
        metrics: ['completionRate', 'yardsPerPlay', 'yardsPerReception', 'completions', 'touchdowns', 'explosiveRate', 'avgGrade', 'positiveGradeRate', 'negativeGradeRate'],
      },
      tackler: {
        name: 'Tackler', dimension: 'playerTackler', gradeRole: 'tackler',
        metrics: ['tackles', 'soloTackles', 'assistedTackles', 'tfl', 'sacksMade', 'stopRate', 'yardsAllowedPerPlay', 'avgGrade', 'positiveGradeRate', 'negativeGradeRate'],
      },
      // Special Teams stays deliberately minimal -- see analytics-registry.js's
      // playerKicker/playerReturner comment for the disclosed scope limit
      // (Field Goal only, no punting or return-yardage averages this
      // checkpoint). No grade metrics: kicker/returner have no `tags.grades`
      // key in the tag model.
      kicker: { name: 'Kicker (FG)', dimension: 'playerKicker', gradeRole: null, metrics: ['completions', 'completionRate'] },
      returner: { name: 'Returner', dimension: 'playerReturner', gradeRole: null, metrics: ['touchdowns'] },
    };
  }

  /** Coach-facing metric names, per role -- the SAME underlying metric id
   *  (e.g. `yardsPerPlay`, `completionRate`, `completions`) is deliberately
   *  reused across roles (one formula, several coaching questions), so the
   *  DISPLAY name is resolved here rather than baked into the metric id.
   *  Tackler's stopRate/yardsAllowedPerPlay are named "...(plays involving)"
   *  -- a Study Phase 3 requirement: never imply one player solely caused a
   *  team-level defensive result. */
  static get PLAYER_METRIC_LABELS() {
    return {
      ballCarrier: {
        successRate: 'Success Rate', yardsPerPlay: 'Yards / Carry', explosiveRate: 'Explosive Rate',
        negativeRate: 'Negative Play Rate', avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      passer: {
        completionRate: 'Completion Rate', yardsPerAttempt: 'Yards / Attempt', completions: 'Completions',
        touchdowns: 'Touchdowns', interceptionsThrown: 'Interceptions', sacksTaken: 'Sacks Taken',
        successRate: 'Success Rate', avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      receiver: {
        completionRate: 'Catch Rate', yardsPerPlay: 'Yards / Target', yardsPerReception: 'Yards / Reception',
        completions: 'Receptions', touchdowns: 'Touchdowns', explosiveRate: 'Explosive Rate',
        avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      tackler: {
        tackles: 'Tackles', soloTackles: 'Solo Tackles', assistedTackles: 'Assisted Tackles', tfl: 'TFL',
        sacksMade: 'Sacks', stopRate: 'Stop Rate (plays involving)', yardsAllowedPerPlay: 'Yards Allowed (plays involving)',
        avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      kicker: { completions: 'Field Goals Made', completionRate: 'Field Goal %' },
      returner: { touchdowns: 'Return Touchdowns' },
    };
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
      { name: 'Situation', ids: ['down', 'distance', 'fieldZone', 'quarter', 'drive', 'hash'] },
      { name: 'Offensive look', ids: ['playCall', 'playConcept', 'formation', 'qbAlignment', 'backfield', 'strength', 'personnel', 'motion', 'playDir', 'playType', 'runPass'] },
      { name: 'Defensive call', ids: ['defFront', 'coverage', 'coverageFamily', 'blitz'] },
      { name: 'Outcome & risk', ids: ['result', 'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts'] },
      { name: 'Special Teams', ids: ['specialTeamsPhase', 'specialTeamsUnit', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore', 'specialTeamsModifier'] },
      { name: 'Players', ids: ['unit', 'playerRole', 'grade'] },
      { name: 'Custom', ids: ['customTag', 'customField'] },
    ];
  }

  /**
   * S8-2: dimensions whose values exist ONLY on `unit:'special'` plays.
   * Selecting one while Unit reads Offense/Defense/blank always empties the
   * result -- the exact silent dead-end reported for "Break Down By: Special
   * Teams Unit" + "Unit: Offense". Every OTHER dimension (Formation, Play
   * Type, Front, Coverage, Blitz, ...) is genuinely chartable from more than
   * one unit's snap -- the redesign's own dual-charting model, where an
   * offensive snap can carry "Defense Faced" and a defensive snap can carry
   * "Offense Faced" (see the DIMENSION_GROUPS comment and CLAUDE.md's
   * already-played opponent-scout shortcut) -- so none of those are ever
   * forced, per the product rule that a dimension must never be locked
   * merely because it is MOSTLY tagged from one side of the ball.
   */
  static get UNIT_FORCED_DIMENSIONS() {
    return {
      specialTeamsPhase: 'special', specialTeamsUnit: 'special', specialTeamsOutcome: 'special',
      specialTeamsRole: 'special', specialTeamsScore: 'special', specialTeamsModifier: 'special',
    };
  }

  /** The unit a dimension currently in play (Break down by, or the pivot's
   *  Then by column) requires, or '' when neither axis is unit-specific. */
  _requiredUnit(state) {
    return StudyScreen.UNIT_FORCED_DIMENSIONS[state.dimension] || StudyScreen.UNIT_FORCED_DIMENSIONS[state.column] || '';
  }

  constructor(app) {
    this.app = app;
    this.host = null;
    this.rows = [];
    this.filters = [];
    this._bound = false;
    this._pendingPlanItems = [];
    this._saveCohorts = [];
    // Review fix (2026-08-15, bc0f677 finding #2): the exact cohort/label the
    // "Watch results" button represents, set only by `_setWatchAll`. The click
    // handler consumes THESE fields -- never `this.rows` -- so the button can
    // never open a wider cohort than what it displays (see `_setWatchAll`).
    this._watchAllRefs = [];
    this._watchAllLabel = 'Watch results';
    this._nativeSeasonId = null;
  }

  initialState() {
    const dates = (this.app.storage.seasonStore.data?.games || [])
      .map(game => game?.gameInfo?.date || '').filter(date => /^\d{4}-\d{2}-\d{2}$/.test(date)).sort();
    return { dimension: StudyScreen.DEFAULT_DIMENSION, column: '', scope: 'game', unit: StudyScreen.DEFAULT_UNIT,
      measure: StudyScreen.DEFAULT_METRIC, minSample: 0, compare: '', periodGames: 3,
      dateFrom: dates[0] || '', dateTo: dates[dates.length - 1] || '', filters: [],
      playerRole: '', player: '', playerMetric: '', savedView: '' };
  }

  playerOptions(role, state = this._state()) {
    const config = StudyScreen.PLAYER_ROLES[role];
    if (!config) return [];
    const seen = new Set();
    for (const play of this._playSets(state).season) for (const num of this.app.analyticsRegistry.values(config.dimension, play)) seen.add(String(num));
    return [...seen].sort((a, b) => (Number(a) - Number(b)) || a.localeCompare(b)).map(value => ({ value, label: this.app.roster.getLabel(value) }));
  }

  watch(refs, label) { return this.app.filmNavigation.watch(refs, { label }); }

  mount(host) {
    if (!host || this.host === host) return;
    this._nativeMount?.unmount?.();
    this._native = null;
    this.host = host;
    this._nativeMount = mountNativeStudy(this, host);
  }

  restore() {
    this._planPicker = null;
    this._pendingPlanItems = [];
    this._nativeMount?.unmount?.();
    this._nativeMount = null;
    this._native = null;
    this._nativeSeasonId = null;
    this.host = null;
  }

  show() {
    if (!this.host) return;
    try { this.app.storage.commitActive(); } catch {}
    const seasonId = this.app.storage.seasonStore.data?.id || null;
    if (seasonId !== this._nativeSeasonId) {
      this._nativeSeasonId = seasonId;
      this._native?.setState(this.initialState());
      return;
    }
    this._nativeMount?.refresh();
  }

  _state() { return this._native?.getState?.() || this.initialState(); }

  _playSets(state = this._state()) {
    const store = this.app.storage.seasonStore;
    const games = store.data?.games || [];
    const activeId = String(store.data?.activeGameId || '');
    const stamp = game => (game?.plays || []).map(play => ({ ...play, __gid: String(game.id) }));
    const active = games.find(game => String(game.id) === activeId);
    const dated = games.filter(game => /^\d{4}-\d{2}-\d{2}$/.test(game?.gameInfo?.date || ''));
    const rangeGames = dated.filter(game => (!state.dateFrom || game.gameInfo.date >= state.dateFrom) && (!state.dateTo || game.gameInfo.date <= state.dateTo));
    const beforeRange = state.dateFrom ? dated.filter(game => game.gameInfo.date < state.dateFrom) : [];
    // Recent N vs prior N: a pure season-chronology window (sorted by the
    // SAME date field `dated`/`rangeGames` already sort on), deliberately
    // independent of which game happens to be "active" in the UI -- more
    // useful for a coach reviewing trends regardless of what they have open.
    const chronological = dated.slice().sort((a, b) => a.gameInfo.date.localeCompare(b.gameInfo.date));
    const periodN = Math.max(1, Number(state.periodGames) || 3);
    const recentGames = chronological.slice(-periodN);
    const priorPeriodGames = chronological.slice(Math.max(0, chronological.length - 2 * periodN), chronological.length - periodN);
    return {
      game: stamp(active), season: games.flatMap(stamp),
      prior: games.filter(game => String(game.id) !== activeId).flatMap(stamp),
      range: rangeGames.flatMap(stamp), beforeRange: beforeRange.flatMap(stamp),
      recent: recentGames.flatMap(stamp), priorPeriod: priorPeriodGames.flatMap(stamp),
      activeName: active ? this._gameName(active) : 'Current game',
      rangeName: this._rangeLabel(state.dateFrom, state.dateTo),
      recentName: `Last ${recentGames.length} game${recentGames.length === 1 ? '' : 's'}`,
      priorPeriodName: `Prior ${priorPeriodGames.length} game${priorPeriodGames.length === 1 ? '' : 's'}`,
    };
  }

  /**
   * Codex review finding #1: the exact metric-eligible refs for `measure`
   * within `group`, when the measure declares `refsPath` (Study expansion
   * Phase 2's penalty/Special Teams measures); falls back to the group's
   * raw `matchingPlayIds` for every measure that predates this checkpoint
   * (`group.measureRefs[measure]` is `null` for those -- a documented,
   * additive no-op). This is the SINGLE seam every row/bar/Watch-Results/
   * compare/pivot use so none of them can independently drift back to the
   * broader cohort.
   */
  _groupRefs(group, measure) {
    const scoped = group.measureRefs?.[measure];
    return scoped != null ? scoped : group.matchingPlayIds;
  }

  /**
   * Codex re-review finding: the displayed Plays count must derive from the
   * measure's own exact refs (the same `_groupRefs` every Watch action
   * already consumes) whenever they exist -- never the raw group sample, and
   * never an unrelated `denominatorMeasure` that answers a different
   * question than "how many clips does Watch open." The prior mechanism
   * (`_measureDenominatorText`, still used as the fallback below) predates
   * `measureRefs` and reads `denominatorMeasure` off the SAME group's
   * `measures` map -- correct for a RATE whose eligible cohort equals its
   * own attempted count, but wrong for a plain COUNT like "Onside Kicks
   * Recovered", whose `denominatorMeasure` (attempted onsides) is a larger,
   * different set than what Watch actually opens (recovered onsides only).
   * Falls back to `_measureDenominatorText` for any measure with no
   * `refsPath` -- unchanged behavior for every pre-existing measure.
   */
  _playsText(scope, measure) {
    const refs = scope?.measureRefs?.[measure];
    if (refs != null) {
      const raw = scope.sampleSize;
      return refs.length === raw ? String(refs.length) : `${refs.length} of ${raw}`;
    }
    return this._measureDenominatorText(measure, scope?.measures, scope?.sampleSize);
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
    } catch { return { values: [], total: 0, omitted: 0 }; }
    const ranked = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], undefined, { numeric: true }));
    const values = ranked.slice(0, 12).map(entry => entry[0])
      .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    return { values, total: ranked.length, omitted: Math.max(0, ranked.length - values.length) };
  }

  // ---- Study Phase 3: player performance -------------------------------
  /** How each player metric's raw number should be displayed. Unlike the
   *  five RICH_METRIC_PAIRS concepts (always a rate or always yards, decided
   *  by one binary), player metrics span four genuinely different shapes:
   *  rates (Success/Completion/Catch/Explosive/Negative/Stop/Grade rates),
   *  yards-per-X means, a -2..+2 grade average, and raw counts (Tackles,
   *  Touchdowns, Interceptions, ...) that must never carry a decimal or a
   *  percent sign. */
  static get PLAYER_METRIC_FORMAT() {
    return {
      successRate: 'pct', completionRate: 'pct', explosiveRate: 'pct', negativeRate: 'pct',
      stopRate: 'pct', positiveGradeRate: 'pct', negativeGradeRate: 'pct',
      yardsPerPlay: 'yards', yardsAllowedPerPlay: 'yards', yardsPerReception: 'yards', yardsPerAttempt: 'yards',
      avgGrade: 'grade',
      completions: 'count', touchdowns: 'count', interceptionsThrown: 'count', sacksTaken: 'count',
      sacksMade: 'count', tackles: 'count', soloTackles: 'count', assistedTackles: 'count', tfl: 'count',
    };
  }
  _playerNumber(metric, n) {
    const format = StudyScreen.PLAYER_METRIC_FORMAT[metric] || 'count';
    if (format === 'pct') return `${this._number(n)}%`;
    if (format === 'grade') return (Math.round(Number(n) * 100) / 100).toFixed(2);
    if (format === 'count') return String(Math.round(Number(n)));
    return this._number(n);
  }
  _playerDisplay(metric, m) {
    if (!m || m.value == null) return '—';
    const n = Number(m.value);
    return Number.isFinite(n) ? this._playerNumber(metric, n) : '—';
  }

  /** Review fix (bc0f677 finding #1): the Plays column must report the SAME
   *  cohort the metric was actually computed over, never the group's wider
   *  raw sample -- disclosed explicitly ("7 of 10") whenever eligibility
   *  excluded a play, rather than silently swapping in a smaller number with
   *  no explanation (the per-metric state badge already names why). */
  _metricPlaysText(m, rawSampleSize) {
    const denom = m?.denominator ?? 0;
    return denom === rawSampleSize ? String(denom) : `${denom} of ${rawSampleSize}`;
  }

  /** yards/play is a mean, not a rate -- no percent suffix. Every other
   *  coaching concept is a rate. */
  _richNumber(conceptKey, n) { return conceptKey === 'yards' ? this._number(n) : `${this._number(n)}%`; }
  _richDisplay(conceptKey, m) {
    if (!m || m.value == null) return '—';
    const n = Number(m.value);
    return Number.isFinite(n) ? this._richNumber(conceptKey, n) : '—';
  }
  /** Polarity comes directly off the metric's OWN contract (fixed per
   *  AnalyticsMetrics id), never a hardcoded universal list -- the exact
   *  correctness gap the offense/defense metric pairing exists to close. */
  _richFavorable(m, delta) {
    if (!m || delta == null || delta === 0) return false;
    return m.polarity === 'higher' ? delta > 0 : delta < 0;
  }

  _filterDimensions() {
    const excluded = new Set(['team', 'season', 'game', 'opponent', 'date']);
    return this.app.analyticsRegistry.listDimensions()
      .filter(item => item.availability === 'ready' && !excluded.has(item.id))
      .sort((a, b) => a.name.localeCompare(b.name));
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

  /**
   * Codex review finding #4 (this checkpoint): `_lowerIsBetter` was boolean,
   * so every measure NOT on that list silently defaulted to higher-is-better
   * -- including genuinely neutral/context-dependent ones (a phase-scoped
   * penalty count that could belong to either team; a punt touchback rate,
   * where forcing a touchback vs. allowing a return is a strategic tradeoff,
   * not a scored outcome). Explicit three-state polarity: a measure is
   * 'higher' or 'lower' ONLY when it is on one of these two lists; anything
   * else, including every measure this checkpoint could not classify with
   * confidence, is 'neutral' and renders with NO favorable/unfavorable
   * color at all. The RICH_METRIC_PAIRS path is unaffected -- it already
   * carries real per-metric polarity from AnalyticsMetrics and never reaches
   * this fallback.
   */
  static get HIGHER_IS_BETTER_MEASURES() {
    return new Set([
      'successRate', 'explosiveRate', 'havocRate', 'touchdowns', 'epaPerPlay',
      // Charged to the OPPONENT -- unambiguously good for us.
      'penaltyYardsOpponent', 'penaltyAcceptedOpponent',
      'stPuntGrossAvg', 'stPuntNetAvg', 'stPuntHangAvg',
      'stKickoffAvg', 'stKickoffOnsideRecovered',
      'stFieldGoalMade', 'stFieldGoalPct', 'stFieldGoalLong', 'stFieldGoalBlocked',
      'stExtraPointMade', 'stExtraPointPct', 'stTwoPointMade', 'stTwoPointPct',
      'stKickReturnAvg', 'stKickReturnLong', 'stKickReturnTD',
      'stPuntReturnAvg', 'stPuntReturnLong', 'stPuntReturnTD',
    ]);
  }
  static get LOWER_IS_BETTER_MEASURES() {
    return new Set([
      'negativeRate', 'turnovers',
      // Charged to US -- unambiguously costly.
      'penaltyYardsSubject', 'penaltyAcceptedSubject',
      'stPuntBlocked', 'stKickReturnMuffed', 'stPuntReturnMuffed',
      'stKickoffReturnAllowedAvg', 'stPuntReturnAllowedAvg',
    ]);
  }
  /** Everything else -- including 'runShare'/'passShare' (a mix, not a
   *  performance score), phase-scoped penalty counts/yards (the foul's own
   *  side-of-ball, not who was charged), raw foul/no-play/offsetting/
   *  declined/unresolved counts, punt/kickoff/FG-attempt/return COUNTS, and
   *  touchback/fair-catch rates (a strategic tradeoff, not a scored result)
   *  -- is deliberately 'neutral', never colored. */
  _measurePolarity(measure) {
    if (StudyScreen.HIGHER_IS_BETTER_MEASURES.has(measure)) return 'higher';
    if (StudyScreen.LOWER_IS_BETTER_MEASURES.has(measure)) return 'lower';
    return 'neutral';
  }
  _isFavorableDelta(measure, delta) {
    if (delta == null || delta === 0) return false;
    const polarity = this._measurePolarity(measure);
    if (polarity === 'neutral') return false;
    return polarity === 'higher' ? delta > 0 : delta < 0;
  }

  _rangeLabel(from, to) {
    if (from && to && from === to) return from;
    if (from && to) return `${from} through ${to}`;
    if (from) return `From ${from}`;
    if (to) return `Through ${to}`;
    return 'Selected date range';
  }

  _filterValues(dimension, state = this._state()) {
    const sets = this._playSets(state);
    const plays = state.scope === 'game' ? sets.game : sets.season;
    const values = new Set();
    try {
      for (const play of plays) {
        for (const value of this.app.analyticsRegistry.values(dimension, play)) if (value) values.add(String(value));
      }
    } catch { return []; }
    return [...values].sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }

  _views() { try { const views = JSON.parse(localStorage.getItem('ffa_study_views_v1') || '[]'); return Array.isArray(views) ? views : []; } catch { return []; } }
  _saveView() {
    const state = this._state();
    const dimension = this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension;
    // Review fix (bc0f677 finding #4): 'recent' had no comparison-label case
    // and fell through to the (irrelevant, disabled-during-compare) scope
    // branch; a 2-game and a 5-game recent comparison must read as distinct
    // questions, both in the visible name and in the dedup identity below.
    const comparison = state.compare === 'rangePrior' ? 'Range vs prior'
      : state.compare === 'recent' ? `Recent ${state.periodGames} vs prior ${state.periodGames}`
      : state.compare === 'prior' ? 'Game vs prior' : state.compare === 'season' ? 'Game vs season'
      : state.scope === 'game' ? 'Current game' : state.scope === 'range' ? 'Date range' : 'Season';
    // Codex review finding #3: a player question's saved NAME must describe
    // what it actually asks (role + player metric, optionally the specific
    // player), never the "Break down by"/Unit/Measure controls -- those are
    // either disabled placeholders (Measure) or repurposed for a different
    // purpose (Dimension, only meaningful in single-player breakdown mode).
    const roleConfig = state.playerRole ? StudyScreen.PLAYER_ROLES[state.playerRole] : null;
    const playerMetric = roleConfig ? (state.playerMetric && roleConfig.metrics.includes(state.playerMetric) ? state.playerMetric : roleConfig.metrics[0]) : null;
    const playerMetricLabel = roleConfig ? (StudyScreen.PLAYER_METRIC_LABELS[state.playerRole]?.[playerMetric] || playerMetric) : null;
    const name = roleConfig
      ? `${roleConfig.name} — ${playerMetricLabel}${state.player ? ` (#${state.player})` : ''} · ${comparison}`
      : `${dimension} · ${comparison}${state.unit ? ` · ${state.unit}` : ''}${state.filters.length ? ` · ${state.filters.length} filter${state.filters.length === 1 ? '' : 's'}` : ''}`;
    const views = this._views();
    // periodGames included so a 2-game and a 5-game recent-comparison view
    // (otherwise identical) never collide and silently overwrite each other.
    // playerRole/player/playerMetric included so a player question and an
    // ordinary query (or two distinct player questions) never collide on
    // identity -- Codex review finding #3.
    const id = `${state.dimension}|${state.scope}|${state.unit}|${state.measure}|${state.minSample}|${state.compare}|${state.periodGames}|${state.dateFrom}|${state.dateTo}|${JSON.stringify(state.filters)}|${state.playerRole}|${state.player}|${state.playerMetric}`;
    const next = [...views.filter(view => view.id !== id), { id, name, state }].slice(-12);
    try { localStorage.setItem('ffa_study_views_v1', JSON.stringify(next)); }
    catch { this.app.tagger.toast?.('Could not save this Study view'); return; }
    this._native?.setState(old => ({ ...old, savedView: id }));
    this.app.tagger.toast?.(`Saved Study view: ${name}`);
  }
  _saveToPlan() {
    const state = this._state();
    // Codex review finding #4: a player question actually queries a
    // role-specific dimension (or, in single-player breakdown, the "Break
    // down by" dimension filtered to that player) with the player metric --
    // NOT `state.dimension`/`state.measure`, which for a player question are
    // either a stale carryover from before the role was picked (measure is
    // disabled but its value isn't cleared) or repurposed for a different
    // job (dimension, only meaningful once a specific player is chosen).
    // Saving a Tackler/Sacks leaderboard finding with the raw fields would
    // have recorded "Formation - Success Rate" -- refs were correct, but the
    // label and the stored query metadata described a different question
    // entirely. Mirrors the native view model's dimension/metric resolution so
    // the saved finding always matches what was actually queried.
    const roleConfig = state.playerRole ? StudyScreen.PLAYER_ROLES[state.playerRole] : null;
    let dimensionName, measureName, dimensionId, measureId;
    if (roleConfig) {
      const usingPlayer = !!state.player;
      const metric = state.playerMetric && roleConfig.metrics.includes(state.playerMetric) ? state.playerMetric : roleConfig.metrics[0];
      dimensionId = usingPlayer ? state.dimension : roleConfig.dimension;
      measureId = metric;
      measureName = StudyScreen.PLAYER_METRIC_LABELS[state.playerRole]?.[metric] || metric;
      dimensionName = usingPlayer
        ? `${roleConfig.name} #${state.player} by ${this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension}`
        : roleConfig.name;
    } else {
      dimensionId = state.dimension;
      measureId = state.measure;
      dimensionName = this.app.analyticsRegistry.getDimension(state.dimension)?.name || state.dimension;
      // Rich concept ids ('success'/'yards'/...) are not registry measure ids
      // -- they resolve to a different registry measure per unit at query
      // time (see `_richMetricId`) -- so the lookup must check
      // RICH_METRIC_PAIRS first, matching `mount()`'s metricName resolver.
      measureName = StudyScreen.RICH_METRIC_PAIRS[state.measure]?.name || this.app.analyticsRegistry.getMeasure(state.measure)?.name || state.measure;
    }
    const cohorts = this._saveCohorts.filter(cohort => cohort.refs.length).map(cohort => ({
      ...cohort,
      item: this.app.studyPlan.finding({
        dimensionName, measureName, scopeLabel: cohort.label,
        dimension: dimensionId, measure: measureId, scope: state.scope,
        compare: state.compare || null, cohort: cohort.id, refs: cohort.refs,
      }),
    }));
    if (!cohorts.length) { this.app.tagger.toast?.('No Study results to save'); return; }
    this._openPlanPicker(cohorts);
  }
  _openPlanPicker(items) {
    this._closePlanPicker();
    const plans = this.app.storage.seasonStore.plans();
    const activeId = plans.some(plan => plan.id === this.app.planScreen.activeId)
      ? this.app.planScreen.activeId
      : plans[0]?.id;
    this._pendingPlanItems = items;
    this._planPicker = {
      key: `${Date.now()}-${Math.random()}`,
      items,
      plans: plans.map(({ id, name }) => ({ id, name })),
      target: activeId || '__new__',
    };
    this._native?.refresh();
  }
  _confirmPlanPicker({ target, cohort, name } = {}) {
    const choice = this._pendingPlanItems.find(item => item.id === cohort)
      || this._pendingPlanItems[0]
      || null;
    if (!choice) return;
    const store = this.app.storage.seasonStore;
    let plan = target === '__new__'
      ? store.createPlan(String(name || '').trim() || 'Game Plan')
      : store.getPlan(target);
    if (plan) plan = this.app.planScreen.addFindingTo(plan.id, choice.item);
    if (!plan) {
      this.app.tagger.toast?.('Could not save this plan finding');
      return;
    }
    this._closePlanPicker();
    this.app.tagger.toast?.(`Saved to ${plan.name}`);
  }
  _closePlanPicker() {
    this._planPicker = null;
    this._pendingPlanItems = [];
    this._native?.refresh();
  }
  _applyView(id) {
    const view = this._views().find(item => item.id === id);
    if (!view || !this._native) return;
    const savedMeasure = view.state.measure;
    const measure = StudyScreen.SELECTABLE_METRICS.includes(savedMeasure) ? savedMeasure : (StudyScreen.LEGACY_MEASURE_UPGRADE[savedMeasure] || StudyScreen.DEFAULT_METRIC);
    if (savedMeasure && measure !== savedMeasure) this.app.tagger.toast?.('Upgraded this saved view metric to ' + (StudyScreen.RICH_METRIC_PAIRS[measure]?.name || measure));
    const role = view.state.playerRole || '';
    const roleConfig = StudyScreen.PLAYER_ROLES[role];
    this._native.setState(old => ({ ...old, ...view.state, measure, savedView: id,
      compare: view.state.compare === true ? 'season' : (view.state.compare || ''), periodGames: Number(view.state.periodGames) || 3,
      filters: Array.isArray(view.state.filters) ? view.state.filters.filter(filter => this.app.analyticsRegistry.getDimension(filter.dimension)?.availability === 'ready').map(filter => ({ dimension: filter.dimension, values: (filter.values || []).map(String) })) : [],
      playerRole: role, player: view.state.player || '', playerMetric: roleConfig?.metrics.includes(view.state.playerMetric) ? view.state.playerMetric : (roleConfig?.metrics[0] || '')
    }));
  }

  _deleteView() {
    const id = this._state().savedView;
    if (!id) return;
    try { localStorage.setItem('ffa_study_views_v1', JSON.stringify(this._views().filter(view => view.id !== id))); } catch { return; }
    this._native?.setState(old => ({ ...old, savedView: '' }));
    this.app.tagger.toast?.('Study view deleted');
  }
  _gameName(game) { return game.name || game.gameInfo?.projectName || game.gameInfo?.opponent || 'Current game'; }
  // `value == null` MUST be checked before `Number()` -- `Number(null) === 0`,
  // a genuinely finite number, so a bare `Number.isFinite` guard alone treats
  // an honest "not charted" `null` (Study expansion Phase 2's
  // `zeroDenominatorPath` coercion in analytics-registry.js) as a real zero
  // and renders "0%" instead of "-". `undefined` was already caught
  // (`Number(undefined)` is `NaN`); `null` needed the same explicit catch.
  _pct(value) { if (value == null) return '—'; const n = Number(value); return Number.isFinite(n) ? `${this._number(n)}%` : '—'; }
  _measure(id, value, suffix = true) {
    if (value == null) return '—';
    const n = Number(value);
    if (!Number.isFinite(n)) return '—';
    const pctMeasures = ['successRate', 'runShare', 'passShare', 'explosiveRate', 'negativeRate', 'havocRate',
      'stPuntTouchbackPct', 'stPuntFairCatchPct', 'stKickoffTouchbackPct', 'stKickoffFairCatchPct',
      'stFieldGoalPct', 'stExtraPointPct', 'stTwoPointPct'];
    if (pctMeasures.includes(id)) return `${this._number(n)}${suffix ? '%' : ' pts'}`;
    if (id === 'epaPerPlay') return this._number(n);
    return this._number(n);
  }

  /**
   * Study expansion Phase 2 -- denominator honesty for the "Plays" column.
   * Most measures (touchdowns, EPA, run/pass share...) are meaningfully
   * described by the group's raw play count, unchanged, so this is a no-op
   * for every measure that predates this checkpoint. A measure that declares
   * `denominatorMeasure` (a FG%/XP%/touchback% etc. whose real eligible count
   * is smaller than the group's raw plays -- e.g. 3 FG attempts inside a
   * 45-play "3rd Down" group) instead shows that exact count, disclosing the
   * gap ("3 of 45") rather than implying the rate was computed over every
   * play in the row.
   */
  _measureDenominatorText(measure, m, rawSampleSize) {
    const entry = this.app.analyticsRegistry.getMeasure(measure);
    const denomId = entry?.denominatorMeasure;
    if (!denomId) return String(rawSampleSize);
    const denomValue = m?.[denomId];
    if (denomValue == null) return 'Not charted';
    return Number(denomValue) === Number(rawSampleSize) ? String(denomValue) : `${denomValue} of ${rawSampleSize}`;
  }
  _number(value) { return Number(value).toFixed(1).replace(/\.0$/, ''); }
}
