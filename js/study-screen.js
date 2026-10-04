import { mountNativeStudy } from './native-study.jsx';
/** Interactive Study workspace over the parity-locked StudyQuery engine. */
export class StudyScreen {
  static get DIMENSIONS() {
    // Every 'ready' registry dimension a coach can pick, ordered like the Film
    // Room columns. scoreSituation is absent on purpose: there is no per-play
    // score-at-snap reconstruction, so it would be unusable.
    return ['playCall', 'playConcept', 'formationFamily', 'receiverSet', 'qbAlignment', 'playType', 'runPass', 'down', 'distance', 'fieldZone', 'quarter',
      'drive', 'unit', 'hash', 'personnel', 'backfield', 'strength', 'motion', 'motionStart', 'motionEnd',
      'playDir', 'gap', 'rpoRead', 'rpoDecision', 'qbRun', 'defFront', 'coverage', 'coverageFamily', 'blitz', 'result', 'playerRole', 'grade',
      'specialTeamsPhase', 'specialTeamsUnit', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore', 'specialTeamsModifier',
      'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts',
      'customTag', 'customField'];
  }

  /** The dimension Study opens on. Stated, not inferred from list order. */
  static get DEFAULT_DIMENSION() { return 'formationFamily'; }

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
   * Core coaching concepts, each an offense-produced / defense-allowed pair
   * sharing one AnalyticsMetrics formula (see "POLARITY IS PER UNIT" in
   * analytics-metrics.js). A concept plus a Unit resolves one unambiguous
   * metric id through `_richMetricId()`, so no measure is a unit-blind
   * higher-is-better number. The flat measures in `MEASURES` remain for
   * `run()`/`compare()`.
   */
  static get RICH_METRIC_PAIRS() {
    return {
      success: { offense: 'successRate', defense: 'stopRate', name: 'Success Rate' },
      yards: { offense: 'yardsPerPlay', defense: 'yardsAllowedPerPlay', name: 'Yards / Play' },
      explosive: { offense: 'explosiveRate', defense: 'explosivesAllowedRate', name: 'Explosive Plays Rate' },
      negative: { offense: 'negativeRate', defense: 'negativeRateForced', name: 'Negative Play Rate' },
      havoc: { offense: 'havocRateAllowed', defense: 'havocRate', name: 'Havoc' },
    };
  }
  static get RICH_METRIC_IDS() { return Object.keys(StudyScreen.RICH_METRIC_PAIRS); }
  /** Flat registry measures still selectable beside the rich concepts; they
   *  have no AnalyticsMetrics equivalent and stay on the `run()`/`compare()`
   *  path. A saved view naming one reopens exactly. */
  static get ADVANCED_MEASURES() { return ['runShare', 'passShare', 'epaPerPlay', 'touchdowns', 'turnovers']; }
  // Study expansion Phase 2: penalty/Special Teams measures are selectable
  // primary metrics too -- they ride the same picker + lens grouping as the
  // flat measures above, not a separate control.
  static get SELECTABLE_METRICS() {
    return [...StudyScreen.RICH_METRIC_IDS, ...StudyScreen.ADVANCED_MEASURES,
      ...StudyScreen.PENALTY_MEASURE_IDS, ...StudyScreen.SPECIAL_TEAMS_MEASURE_IDS];
  }
  static get DEFAULT_METRIC() { return 'success'; }
  /** Study opens already answering the coach's own offense -- a concrete,
   *  useful default, not a guess made during computation. The coach can
   *  clear it to "All units" at any time; this only affects the INITIAL
   *  control value, never overrides an explicit selection. */
  static get DEFAULT_UNIT() { return 'offense'; }

  /**
   * The lenses applied to the primary-metric picker over `SELECTABLE_METRICS`.
   * Grouping does not preserve option order, so the default is pinned
   * explicitly (`DEFAULT_METRIC`), never "the first option".
   */
  static get MEASURE_LENSES() {
    return [
      { name: 'Coaching metrics', ids: StudyScreen.RICH_METRIC_IDS },
      { name: 'Advanced', ids: StudyScreen.ADVANCED_MEASURES },
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
        successRate: 'Success Rate', yardsPerPlay: 'Yards / Carry', explosiveRate: 'Explosive Plays Rate',
        negativeRate: 'Negative Play Rate', avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      passer: {
        completionRate: 'Completion Rate', yardsPerAttempt: 'Yards / Attempt', completions: 'Completions',
        touchdowns: 'Touchdowns', interceptionsThrown: 'Interceptions', sacksTaken: 'Sacks Taken',
        successRate: 'Success Rate', avgGrade: 'Avg Grade', positiveGradeRate: 'Positive Grade Rate', negativeGradeRate: 'Negative Grade Rate',
      },
      receiver: {
        completionRate: 'Catch Rate', yardsPerPlay: 'Yards / Target', yardsPerReception: 'Yards / Reception',
        completions: 'Receptions', touchdowns: 'Touchdowns', explosiveRate: 'Explosive Plays Rate',
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
      { name: 'Offensive look', ids: ['playCall', 'playConcept', 'formationFamily', 'receiverSet', 'qbAlignment', 'backfield', 'strength', 'personnel', 'motion', 'motionStart', 'motionEnd', 'playDir', 'gap', 'playType', 'runPass', 'rpoRead', 'rpoDecision', 'qbRun'] },
      { name: 'Defensive call', ids: ['defFront', 'coverage', 'coverageFamily', 'blitz'] },
      { name: 'Outcome & risk', ids: ['result', 'penaltyTeam', 'penaltyFoul', 'penaltyRuling', 'penaltyPhase', 'penaltyPlayCounts'] },
      { name: 'Special Teams', ids: ['specialTeamsPhase', 'specialTeamsUnit', 'specialTeamsOutcome', 'specialTeamsRole', 'specialTeamsScore', 'specialTeamsModifier'] },
      { name: 'Players', ids: ['unit', 'playerRole', 'grade'] },
      { name: 'Custom', ids: ['customTag', 'customField'] },
    ];
  }

  /**
   * Dimensions whose values exist only on Special Teams plays: picking one
   * with Unit Offense, Defense or blank would always be empty, so Unit is
   * forced. Every other dimension can be charted from more than one unit's
   * snap (an offensive snap can carry Defense Faced and vice versa), so none of
   * those is ever locked to a unit.
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
    // The exact cohort and label "Watch results" represents, set only by
    // `_setWatchAll`; the click handler reads these, never `this.rows`, so it
    // cannot open a wider cohort than it displays.
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
   * The metric-eligible refs for `measure` in `group` when the measure
   * declares `refsPath`; otherwise the group's `matchingPlayIds`. The one seam
   * every row, bar, Watch Results, compare and pivot uses.
   */
  _groupRefs(group, measure) {
    const scoped = group.measureRefs?.[measure];
    return scoped != null ? scoped : group.matchingPlayIds;
  }

  /**
   * The displayed Plays count comes from the measure's own refs (the same
   * `_groupRefs` Watch opens) whenever they exist, never the raw group sample
   * or a `denominatorMeasure` answering a different question: for a count like
   * Onside Kicks Recovered, attempted onsides is a larger set than what Watch
   * opens. Measures without `refsPath` use `_measureDenominatorText`.
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

  /** The Plays column reports the cohort the metric was computed over, and
   *  says "7 of 10" when eligibility excluded plays rather than silently
   *  showing a smaller number. */
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
   * Three-state polarity for flat measures: 'higher' or 'lower' only when
   * listed below; anything else is 'neutral' and gets no favorable or
   * unfavorable color (a phase-scoped penalty count can belong to either team;
   * a punt touchback rate is a strategic tradeoff). Rich metric pairs carry
   * their own polarity and never reach this.
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
    // A 2-game and a 5-game recent comparison are distinct questions, in the
    // visible name and in the identity below.
    const comparison = state.compare === 'rangePrior' ? 'Range vs prior'
      : state.compare === 'recent' ? `Recent ${state.periodGames} vs prior ${state.periodGames}`
      : state.compare === 'prior' ? 'Game vs prior' : state.compare === 'season' ? 'Game vs season'
      : state.scope === 'game' ? 'Current game' : state.scope === 'range' ? 'Date range' : 'Season';
    // A player question's saved name describes what it asks (role and player
    // metric, optionally the player), not the Break down by / Unit / Measure
    // controls, which it disables or repurposes.
    const roleConfig = state.playerRole ? StudyScreen.PLAYER_ROLES[state.playerRole] : null;
    const playerMetric = roleConfig ? (state.playerMetric && roleConfig.metrics.includes(state.playerMetric) ? state.playerMetric : roleConfig.metrics[0]) : null;
    const playerMetricLabel = roleConfig ? (StudyScreen.PLAYER_METRIC_LABELS[state.playerRole]?.[playerMetric] || playerMetric) : null;
    const name = roleConfig
      ? `${roleConfig.name} — ${playerMetricLabel}${state.player ? ` (#${state.player})` : ''} · ${comparison}`
      : `${dimension} · ${comparison}${state.unit ? ` · ${state.unit}` : ''}${state.filters.length ? ` · ${state.filters.length} filter${state.filters.length === 1 ? '' : 's'}` : ''}`;
    const views = this._views();
    // periodGames, playerRole, player and playerMetric are part of the
    // identity, so otherwise-identical views never overwrite each other.
    const id = `${state.dimension}|${state.scope}|${state.unit}|${state.measure}|${state.minSample}|${state.compare}|${state.periodGames}|${state.dateFrom}|${state.dateTo}|${JSON.stringify(state.filters)}|${state.playerRole}|${state.player}|${state.playerMetric}`;
    const next = [...views.filter(view => view.id !== id), { id, name, state }].slice(-12);
    try { localStorage.setItem('ffa_study_views_v1', JSON.stringify(next)); }
    catch { this.app.tagger.toast?.('Could not save this Study view'); return; }
    this._native?.setState(old => ({ ...old, savedView: id }));
    this.app.tagger.toast?.(`Saved Study view: ${name}`);
  }
  _saveToPlan() {
    const state = this._state();
    // A player question queries a role dimension (or, for one player, the
    // Break down by dimension filtered to that player) with the player
    // metric, not `state.dimension`/`state.measure`, which may be stale or
    // repurposed. Mirrors the native view model, so a saved finding records
    // what was actually queried.
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
    // An unknown saved measure falls back to the default metric.
    const measure = StudyScreen.SELECTABLE_METRICS.includes(savedMeasure) ? savedMeasure : StudyScreen.DEFAULT_METRIC;
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
