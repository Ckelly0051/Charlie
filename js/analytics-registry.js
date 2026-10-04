/**
 * AnalyticsRegistry - pure contracts for the redesign's shared analytics layer.
 *
 * Ready measures select values already produced by StatsEngine.compute().
 * Required concepts without one canonical production meaning stay explicitly
 * `requires-context`; consumers cannot accidentally invent a denominator.
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { countedUnit, driveLabel, drivePossessionSide, driveNumberOf } from './football-rules.js';

export class AnalyticsRegistry {
  constructor(statsEngine) {
    if (!statsEngine || typeof statsEngine.compute !== 'function') {
      throw new TypeError('AnalyticsRegistry requires a StatsEngine instance');
    }
    this.stats = statsEngine;
    this._SE = statsEngine.constructor;
    this._dimensions = this._buildDimensions();
    this._measures = this._buildMeasures();
    this._blocks = this._buildBlocks();
    this._dimensionMap = this._index(this._dimensions, 'dimension');
    this._measureMap = this._index(this._measures, 'measure');
    this._blockMap = this._index(this._blocks, 'block');
  }

  _index(entries, kind) {
    const map = new Map();
    for (const entry of entries) {
      if (map.has(entry.id)) throw new Error(`Duplicate analytics ${kind}: ${entry.id}`);
      map.set(entry.id, Object.freeze(entry));
    }
    return map;
  }

  _buildDimensions() {
    const SE = this._SE;
    const tag = key => (p) => this._one(p?.tags?.[key]);
    const special = p => SpecialTeamsModel.normalize(p?.specialTeams);
    const penalties = p => PenaltyModel.normalizeList(p?.penalties);
    const context = key => (_p, ctx) => this._one(ctx?.[key]);
    const pairs = (obj, split = false) => Object.entries(obj || {}).flatMap(([role, value]) => {
      const values = split ? SE.splitPlayers(value) : this._one(value);
      return values.map(v => `${role}=${v}`);
    });
    const ready = (id, name, values, canonical, extra = {}) => ({ id, name, availability: 'ready', values, canonical, ...extra });
    const deferred = (id, name, reason) => ({ id, name, availability: 'requires-context', canonical: null, reason });

    return [
      ready('team', 'Team', context('team'), 'query context.team'),
      ready('season', 'Season', context('season'), 'query context.season'),
      ready('game', 'Game', (p, ctx) => this._one(p?.__gid || ctx?.gameId || ctx?.game), 'play.__gid | query context.gameId'),
      ready('opponent', 'Opponent', context('opponent'), 'query context.opponent'),
      ready('date', 'Date', context('date'), 'query context.date'),
      ready('quarter', 'Quarter', tag('quarter'), 'play.tags.quarter'),
      // Composite possession-side + drive-number identity, the same rule
      // Breakdown's play strip groups on (football-rules.driveLabel). Keying on
      // the raw tag put our Drive 1 and the opponent's Drive 1 in ONE bucket,
      // because each team runs its own drive sequence. Study aggregates across
      // seasons, so it uses the `unit` wording rather than claiming Our/Opponent.
      ready('drive', 'Drive', p => {
        const number = driveNumberOf(p?.tags);
        return number ? [driveLabel(drivePossessionSide(p?.tags), number, 'unit')] : [];
      }, 'football-rules.driveLabel(drivePossessionSide, play.tags.driveNumber)'),
      ready('unit', 'Unit', p => [countedUnit(p)], 'legacy blank => offense'),
      ready('down', 'Down', tag('down'), 'play.tags.down'),
      ready('distance', 'Distance', tag('distance'), 'play.tags.distance'),
      // The shared six-band bucketer (StatsEngine._fieldZone), the same bands
      // the Play Call report shows. Unit-agnostic: the caller's `unit` filter
      // decides whether it groups our offense or our defense's situations.
      ready('fieldZone', 'Field Zone', p => this._one(this.stats._fieldZone(p?.tags || {})), 'StatsEngine._fieldZone'),
      ready('hash', 'Hash', tag('hash'), 'play.tags.hash'),
      // scoreSituation stays deferred, deliberately: there is no per-play
      // score-at-snap reconstruction anywhere in this codebase today (the
      // scoreboard is a running total replayed from tagged scoring plays,
      // never attached to an individual play), and inventing score context
      // from incomplete charted data is exactly what this project's data
      // honesty rule forbids. Building a real per-play score-differential
      // deriver is its own reviewed unit, not a few lines here.
      deferred('scoreSituation', 'Score Situation', 'Requires a per-play score-at-snap reconstruction, which does not exist yet -- see the fieldZone comment above for why this is not silently approximated'),
      // E3: pre-snap look dimensions read the PROJECTED view (legacy alignment/
      // family lifted into their own dimensions), never raw tags — see
      // StatsEngine.proj / GRIDIRON-IQ-TAG-MODEL.md §5. qbAlignment/coverageFamily
      // are single-value (multi:false) so a cross-tab places each play in one cell.
      ready('qbAlignment', 'QB Alignment', p => this._one(SE.proj(p).qbAlignment), 'TagProjection.project.qbAlignment'),
      ready('formationFamily', 'Formation', p => this._one(SE.proj(p).formationFamily), 'TagProjection.project.formationFamily'),
      ready('receiverSet', 'Receiver Alignment', p => this._one(SE.proj(p).receiverSet), 'TagProjection.project.receiverSet'),
      ready('backfield', 'Backfield', p => this._one(SE.proj(p).backfield), 'TagProjection.project.backfield'),
      ready('strength', 'Offensive Line Strength', p => this._one(SE.proj(p).strength), 'TagProjection.project.strength'),
      ready('personnel', 'Personnel', tag('personnel'), 'play.tags.personnel'),
      ready('motion', 'Motion', p => [p?.tags?.motion || 'No Motion'], 'play.tags.motion | No Motion'),
      ready('playCall', 'Play Call', tag('playCall'), 'play.tags.playCall'),
      ready('playConcept', 'Play Concept', tag('playConcept'), 'play.tags.playConcept'),
      ready('playType', 'Play Type', p => SE.splitPlayTypes(p?.tags?.playType), 'StatsEngine.splitPlayTypes', { multi: true }),
      ready('playDir', 'Play Direction', tag('playDir'), 'play.tags.playDir'),
      // Run and motion details (ChartingDetails). A blank is uncharted and yields
      // no value, never a zero or an "Unknown" bucket.
      ready('gap', 'Gap', tag('gap'), 'play.tags.gap'),
      ready('motionStart', 'Motion Starts', tag('motionStart'), 'play.tags.motionStart'),
      ready('motionEnd', 'Motion Ends', tag('motionEnd'), 'play.tags.motionEnd'),
      ready('rpoRead', 'RPO Read', tag('rpoRead'), 'play.tags.rpoRead'),
      ready('rpoDecision', 'RPO Decision', tag('rpoDecision'), 'play.tags.rpoDecision'),
      ready('qbRun', 'QB Run Type', tag('qbRun'), 'play.tags.qbRun'),
      ready('defFront', 'Defensive Front', p => SE.splitFronts(p?.tags?.defFront), 'StatsEngine.splitFronts', { multi: true }),
      ready('coverage', 'Coverage Call', p => this._one(SE.proj(p).coverage), 'TagProjection.project.coverage'),
      ready('coverageFamily', 'Coverage Family', p => this._one(SE.proj(p).coverageFamily), 'TagProjection.project.coverageFamily'),
      ready('blitz', 'Blitz / Pressure', p => SE.splitBlitzes(p?.tags?.blitz), 'StatsEngine.splitBlitzes', { multi: true }),
      ready('playerRole', 'Player Role', p => pairs(p?.tags?.players, true), 'StatsEngine.splitPlayers', { multi: true }),
      ready('grade', 'Grade', p => pairs(p?.tags?.grades), 'play.tags.grades', { multi: true }),
      // ---- Study Phase 3: player performance -------------------------
      // Each dimension's VALUE is the bare jersey number -- a stable,
      // unambiguous grouping key -- never a coach-facing label; study-
      // screen.js resolves "#22 Smith" via the roster at render time (per
      // the checkpoint's requirement that internal values like
      // `ballCarrier=22` never reach the coach directly). `_playerRoleValues`
      // reads through `StatsEngine.effectivePlayers` (the same structured+
      // legacy merge `_individualStats` performs) and `SE.splitPlayers` (the
      // same multi-value split every tackler-crediting consumer already
      // uses), gated to exactly the plays each role's existing box-score
      // aggregation already counts -- `StatsEngine.countsFootballRoles` for
      // the offense roles (excludes an ordinary Special Teams play; admits a
      // fake), `unit === 'defense'` for tackler, per `_individualStats`.
      ready('playerBallCarrier', 'Ball Carrier',
        p => SE.countsFootballRoles(p) && SE.isRushingAttempt(p) ? SE.splitPlayers(SE.rushingPlayer(p)) : [],
        'StatsEngine.rushingPlayer (rushing attempts including sacks)', { multi: true }),
      // Passer's gate is EVERY dropback this passer is credited on --
      // official attempts (complete/incomplete/intercepted) PLUS sacks. A
      // sack is not a pass "attempt" by the official football definition
      // (see completionRate's/yardsPerAttempt's own sack-exclusion in
      // analytics-metrics.js, which keep completion rate and yards/attempt
      // honest over this broader cohort), but it belongs in the cohort for
      // three reasons that would otherwise be unreachable: "Sacks Taken" has
      // nowhere to count from if sacks are excluded from the passer's own
      // cohort entirely; Success Rate is conventionally computed over every
      // dropback INCLUDING sacks (a sack is a failed play, not an excluded
      // one); and a coach may grade a passer's decision-making on a sack
      // (holding the ball too long) -- excluding it would make that grade
      // invisible to Avg Grade.
      ready('playerPasser', 'Passer',
        this._playerRoleValues('passer', p => SE.countsFootballRoles(p) && SE.isPass(p)
          && (SE.isPassAttemptResult(p) || SE.hasResult(p, 'Sack'))),
        'StatsEngine.effectivePlayers.passer (dropbacks: attempts + sacks)', { multi: true }),
      // Receiver is gated on EVERY pass thrown their way, complete or not --
      // unlike _individualStats' box score (which only ever credited a
      // receiver on a completion, with no "target" concept at all), this is
      // the honest cohort "Targets" needs to answer as its own question.
      ready('playerReceiver', 'Receiver (Targets)',
        this._playerRoleValues('receiver', p => SE.countsFootballRoles(p) && SE.isPass(p)),
        'StatsEngine.effectivePlayers.receiver (pass targets, complete or not)', { multi: true }),
      ready('playerTackler', 'Tackler',
        this._playerRoleValues('tackler', p => countedUnit(p) === 'defense'),
        'StatsEngine.effectivePlayers.tackler (defensive snaps)', { multi: true }),
      // Special Teams player analysis stays deliberately minimal (Study
      // Phase 3 scope): Field Goal only for kicker (a clean make/miss
      // binary, already well-modeled), kick/punt return only for returner.
      // Punting and return-yardage averages are NOT exposed here -- their
      // yardage lives on `play.specialTeams.return.yards`, a different field
      // than the `tags.yardage` every AnalyticsMetrics yardage metric reads,
      // and bridging that is out of this checkpoint's scope (disclosed as a
      // known limitation in the Phase 3 handoff, not silently omitted).
      ready('playerKicker', 'Kicker (Field Goal)',
        this._playerRoleValues('kicker', p => {
          const event = special(p);
          return !!event && event.unit === 'fieldGoal' && event.attemptType === 'fieldGoal' && !event.isFake;
        }),
        'StatsEngine.effectivePlayers.kicker (field goal attempts)', { multi: true }),
      ready('playerReturner', 'Returner',
        this._playerRoleValues('returner', p => {
          const event = special(p);
          return !!event && ['kickoffReturn', 'puntReturn'].includes(event.unit);
        }),
        'StatsEngine.effectivePlayers.returner (kick/punt returns)', { multi: true }),
      ready('specialTeamsPhase', 'Special Teams Unit', p => this._one(special(p)?.unit), 'SpecialTeamsModel.normalize.unit'),
      ready('specialTeamsOutcome', 'Special Teams Outcome', p => { const event = special(p); return this._one(event?.result || event?.outcome.status); }, 'SpecialTeamsModel.normalize.result | outcome.status'),
      ready('specialTeamsRole', 'Special Teams Role', p => this._one(special(p)?.subjectRole), 'SpecialTeamsModel.normalize.subjectRole'),
      ready('specialTeamsScore', 'Special Teams Score', p => this._one(special(p)?.outcome.score), 'SpecialTeamsModel.normalize.outcome.score'),
      // Study expansion Phase 2: literal football phase labels for the coach
      // ("Extra Point" / "Two-Point Try"), not the internal `unit` id -- the
      // try contract keeps XP and 2-Pt on ONE structural unit
      // (try/tryDefense) distinguished only by `attemptType`, so a raw `unit`
      // dimension can never separate them. Additive alongside
      // `specialTeamsPhase` (unchanged) so no existing saved view/filter using
      // the raw unit id is affected.
      ready('specialTeamsUnit', 'Special Teams Phase', p => {
        const event = special(p);
        if (!event) return [];
        if (event.unit === 'try' || event.unit === 'tryDefense') {
          return [event.attemptType === 'twoPoint' ? 'Two-Point Try' : event.attemptType === 'extraPoint' ? 'Extra Point' : 'Try (Unspecified)'];
        }
        // The model owns the unit names; the try units are split above by
        // attempt type, so they never reach this lookup.
        const label = SpecialTeamsModel.UNIT_LABELS[event.unit];
        return label ? [label] : [];
      }, 'SpecialTeamsModel.normalize.unit (literal label, try split by attemptType)'),
      ready('specialTeamsModifier', 'Special Teams Modifier', p => {
        const event = special(p);
        if (!event) return [];
        const mods = [];
        if (event.isOnside) mods.push('Onside');
        if (event.isFake) mods.push('Fake');
        return mods;
      }, 'SpecialTeamsModel.normalize.isOnside|isFake', { multi: true }),
      ready('penaltyTeam', 'Penalty Charged To', p => penalties(p).map(item => item.team), 'PenaltyModel.normalizeList.team', { multi: true }),
      ready('penaltyFoul', 'Penalty Foul', p => penalties(p).map(item => item.foul).filter(Boolean), 'PenaltyModel.normalizeList.foul', { multi: true }),
      ready('penaltyRuling', 'Penalty Ruling', p => penalties(p).map(item => item.disposition), 'PenaltyModel.normalizeList.disposition', { multi: true }),
      ready('penaltyPhase', 'Penalty Phase', p => penalties(p).map(item => item.phase), 'PenaltyModel.normalizeList.phase', { multi: true }),
      ready('penaltyPlayCounts', 'Penalty Play Counts', p => penalties(p).map(item => item.playCounts === true ? 'Play counts' : item.playCounts === false ? 'No play' : 'Unknown'), 'PenaltyModel.normalizeList.playCounts', { multi: true }),
      // No pre-snap vs live-ball dimension: `phase` records which side of
      // the ball a foul happened on ('deadBall' is after-the-play
      // responsibility, GRIDIRON-IQ-PENALTY-MODEL.md §5), not timing. Timing
      // needs a real field, deferred in that model's §6; never infer it from
      // `phase`.
      ready('customTag', 'Custom Tag', p => (p?.tags?.custom || []).filter(Boolean).map(String), 'play.tags.custom', { multi: true }),
      ready('customField', 'Custom Field', p => pairs(p?.tags?.customFields), 'play.tags.customFields', { multi: true }),
      ready('result', 'Result', p => SE.splitResults(p?.tags?.result), 'StatsEngine.splitResults', { multi: true }),
      ready('runPass', 'Run / Pass', p => SE.isRun(p) ? ['Run'] : SE.isPass(p) ? ['Pass'] : [], 'StatsEngine.isRun/isPass'),
    ];
  }

  _buildMeasures() {
    const ready = (id, name, path, canonical, extra = {}) => ({ id, name, availability: 'ready', path, canonical, ...extra });
    const deferred = (id, name, reason) => ({ id, name, availability: 'requires-context', path: null, canonical: null, reason });
    return [
      ready('plays', 'Plays', ['allPlays'], 'StatsEngine.compute().allPlays'),
      deferred('frequency', 'Frequency', 'Requires an explicit parent-cohort denominator'),
      ready('runShare', 'Run Share', ['tendencies', 'runPct'], 'StatsEngine._tendencyStats'),
      ready('passShare', 'Pass Share', ['tendencies', 'passPct'], 'StatsEngine._tendencyStats'),
      // yardsPerPlay and stopRate are deferred for readMeasures() only:
      // compute() holds offense- and defense-side aggregates on one object, so
      // no single path means either one. metricsEngine() below computes both
      // for any cohort, with eligibility, polarity, state and exact refs.
      deferred('yardsPerPlay', 'Yards / Play', 'No single compute()-output field for either offense- or defense-framed yards/play; use AnalyticsRegistry.metricsEngine().metric(cohort, "yardsPerPlay"|"yardsAllowedPerPlay") for an ad-hoc cohort'),
      ready('successRate', 'Success Rate', ['efficiency', 'successRate'], 'StatsEngine._efficiencyStats'),
      deferred('conversionRate', 'Conversion Rate', 'Requires conversion type/down context'),
      ready('explosiveRate', 'Explosive Plays Rate', ['efficiency', 'explosivePct'], 'StatsEngine._efficiencyStats'),
      ready('negativeRate', 'Negative Play Rate', ['efficiency', 'negativePct'], 'StatsEngine._efficiencyStats'),
      ready('turnovers', 'Turnovers', ['turnovers', 'total'], 'StatsEngine._turnoverStats', { unit: 'offense' }),
      deferred('scoring', 'Scoring', 'Requires an explicit points vs touchdowns contract'),
      ready('touchdowns', 'Touchdowns', ['scoring', 'touchdowns'], 'StatsEngine._scoringStats', { unit: 'offense' }),
      ready('havocRate', 'Havoc Rate', ['defensive', 'havocRate'], 'StatsEngine._defensiveStats', { unit: 'defense' }),
      deferred('stopRate', 'Stop Rate', 'No single compute()-output field outside a selected defensive cohort; use AnalyticsRegistry.metricsEngine().metric(cohort, "stopRate") for an ad-hoc cohort'),
      ready('epaPerPlay', 'EPA / Play', ['advanced', 'perPlay'], 'AdvancedMetrics.summarize'),
      ready('sampleSize', 'Sample Size', ['allPlays'], 'StatsEngine.compute().allPlays'),
      deferred('dataCompleteness', 'Data Completeness', 'No canonical production completeness measure'),

      // ---- Penalties ----
      // All read PenaltyModel.summarize() off StatsEngine.compute(); no
      // formula here. `stats.penalties` exists only when the cohort has
      // records, so an empty cohort reads "Not charted", never zero. Counts
      // are real denominators (0 declined is information); only yard totals
      // follow the accepted-only rule, inside PenaltyModel. Each measure's
      // `refsPath` points at the exact plays behind its number; study-screen
      // uses it for Watch, bars, compare and pivot.
      ready('penaltyFlaggedPlays', 'Flagged Plays', ['penalties', 'flaggedPlays'], 'PenaltyModel.summarize().flaggedPlays', { refsPath: ['penalties', 'refs', 'fouls'] }),
      ready('penaltyFouls', 'Penalty Fouls (All)', ['penalties', 'fouls'], 'PenaltyModel.summarize().fouls', { refsPath: ['penalties', 'refs', 'fouls'] }),
      ready('penaltyAccepted', 'Penalties Accepted (All)', ['penalties', 'accepted'], 'PenaltyModel.summarize().accepted', { refsPath: ['penalties', 'refs', 'accepted'] }),
      ready('penaltyDeclined', 'Penalties Declined', ['penalties', 'declined'], 'PenaltyModel.summarize().declined', { refsPath: ['penalties', 'refs', 'declined'] }),
      ready('penaltyOffsetting', 'Penalties Offsetting', ['penalties', 'offsetting'], 'PenaltyModel.summarize().offsetting', { refsPath: ['penalties', 'refs', 'offsetting'] }),
      ready('penaltyUnresolved', 'Penalties Unresolved', ['penalties', 'incomplete'], 'PenaltyModel.summarize().incomplete -- missing team, ruling, or foul', { refsPath: ['penalties', 'refs', 'incomplete'] }),
      ready('penaltyNoPlay', 'No-Play / Retry Penalties', ['penalties', 'noPlay'], 'PenaltyModel.summarize().noPlay -- playCounts:false, any disposition', { refsPath: ['penalties', 'refs', 'noPlay'] }),
      ready('penaltyAutomaticFirstDowns', 'Penalty First Downs', ['penalties', 'automaticFirstDowns'], 'PenaltyModel.summarize().automaticFirstDowns -- accepted only', { refsPath: ['penalties', 'refs', 'automaticFirstDowns'] }),
      ready('penaltyYardsSubject', 'Penalty Yards — Us', ['penalties', 'subjectYards'], 'PenaltyModel.summarize().subjectYards -- accepted enforcement only', { refsPath: ['penalties', 'byTeam', 'subject', 'refs', 'yards'] }),
      ready('penaltyYardsOpponent', 'Penalty Yards — Opponent', ['penalties', 'opponentYards'], 'PenaltyModel.summarize().opponentYards -- accepted enforcement only', { refsPath: ['penalties', 'byTeam', 'opponent', 'refs', 'yards'] }),
      // Team/unit-scoped variants read PenaltyModel's own byTeam/byPhase
      // buckets -- each is classified from ONLY that team's/phase's own
      // records, so grouping the cohort by an unrelated dimension (e.g.
      // Formation) can never let a play's OTHER penalty (a different team or
      // phase on the same play, as in an offsetting foul) inflate these.
      ready('penaltyAcceptedSubject', 'Penalties Accepted — Us', ['penalties', 'byTeam', 'subject', 'accepted'], 'PenaltyModel.summarize().byTeam.subject.accepted', { refsPath: ['penalties', 'byTeam', 'subject', 'refs', 'accepted'] }),
      ready('penaltyAcceptedOpponent', 'Penalties Accepted — Opponent', ['penalties', 'byTeam', 'opponent', 'accepted'], 'PenaltyModel.summarize().byTeam.opponent.accepted', { refsPath: ['penalties', 'byTeam', 'opponent', 'refs', 'accepted'] }),
      ready('penaltyAcceptedOffense', 'Offensive Penalties Accepted', ['penalties', 'byPhase', 'offense', 'accepted'], 'PenaltyModel.summarize().byPhase.offense.accepted', { refsPath: ['penalties', 'byPhase', 'offense', 'refs', 'accepted'] }),
      ready('penaltyAcceptedDefense', 'Defensive Penalties Accepted', ['penalties', 'byPhase', 'defense', 'accepted'], 'PenaltyModel.summarize().byPhase.defense.accepted', { refsPath: ['penalties', 'byPhase', 'defense', 'refs', 'accepted'] }),
      ready('penaltyAcceptedSpecialTeams', 'Special Teams Penalties Accepted', ['penalties', 'byPhase', 'special', 'accepted'], 'PenaltyModel.summarize().byPhase.special.accepted', { refsPath: ['penalties', 'byPhase', 'special', 'refs', 'accepted'] }),
      ready('penaltyYardsOffense', 'Offensive Penalty Yards', ['penalties', 'byPhase', 'offense', 'yards'], 'PenaltyModel.summarize().byPhase.offense.yards -- accepted only', { refsPath: ['penalties', 'byPhase', 'offense', 'refs', 'yards'] }),
      ready('penaltyYardsDefense', 'Defensive Penalty Yards', ['penalties', 'byPhase', 'defense', 'yards'], 'PenaltyModel.summarize().byPhase.defense.yards -- accepted only', { refsPath: ['penalties', 'byPhase', 'defense', 'refs', 'yards'] }),

      // ---- Special Teams ----
      // Read StatsEngine._specialTeamsStats() (`stats.specialTeams`) or
      // `stats.conversions`; no formula duplicated. `zeroDenominatorPath` /
      // `denominatorMeasure` mark rate fields that stay 0 on an empty cohort
      // for the Reports boards; readMeasures() turns those into null so Study
      // never shows 0% for "never charted". `refsPath` points at the row
      // group the value came from; a rate's refs are its denominator set, so
      // siblings sharing a denominator share one refs array.
      ready('stPuntCount', 'Punts', ['specialTeams', 'punts', 'n'], 'StatsEngine._specialTeamsStats().punts.n', { refsPath: ['specialTeams', 'punts', 'refs', 'all'] }),
      // An average's eligible rows can be narrower than `refs.all` (a punt
      // with no hang time counts toward `n` but not `hangAvg`), so each
      // average points at its own `refs.<field>`.
      ready('stPuntGrossAvg', 'Punt Gross Avg (yds)', ['specialTeams', 'punts', 'grossAvg'], 'StatsEngine._specialTeamsStats().punts.grossAvg', { refsPath: ['specialTeams', 'punts', 'refs', 'grossAvg'] }),
      ready('stPuntNetAvg', 'Punt Net Avg (yds)', ['specialTeams', 'punts', 'netAvg'], 'StatsEngine._specialTeamsStats().punts.netAvg', { refsPath: ['specialTeams', 'punts', 'refs', 'netAvg'] }),
      ready('stPuntHangAvg', 'Punt Hang Time (sec)', ['specialTeams', 'punts', 'hangAvg'], 'StatsEngine._specialTeamsStats().punts.hangAvg', { refsPath: ['specialTeams', 'punts', 'refs', 'hangAvg'] }),
      ready('stPuntTouchbackPct', 'Punt Touchback Rate', ['specialTeams', 'punts', 'tbPct'], 'StatsEngine._specialTeamsStats().punts.tbPct', { zeroDenominatorPath: ['specialTeams', 'punts', 'n'], denominatorMeasure: 'stPuntCount', refsPath: ['specialTeams', 'punts', 'refs', 'all'] }),
      ready('stPuntFairCatchPct', 'Punt Fair Catch Rate', ['specialTeams', 'punts', 'fairCatchPct'], 'StatsEngine._specialTeamsStats().punts.fairCatchPct', { zeroDenominatorPath: ['specialTeams', 'punts', 'n'], denominatorMeasure: 'stPuntCount', refsPath: ['specialTeams', 'punts', 'refs', 'all'] }),
      ready('stPuntBlocked', 'Punts Blocked', ['specialTeams', 'punts', 'blocked'], 'StatsEngine._specialTeamsStats().punts.blocked', { refsPath: ['specialTeams', 'punts', 'refs', 'blocked'] }),
      ready('stPuntReturnAllowedAvg', 'Punt Return Allowed (yds)', ['specialTeams', 'punts', 'retAllowedAvg'], 'StatsEngine._specialTeamsStats().punts.retAllowedAvg', { refsPath: ['specialTeams', 'punts', 'refs', 'retAllowedAvg'] }),
      ready('stKickoffCount', 'Kickoffs', ['specialTeams', 'kickoffs', 'n'], 'StatsEngine._specialTeamsStats().kickoffs.n', { refsPath: ['specialTeams', 'kickoffs', 'refs', 'all'] }),
      ready('stKickoffAvg', 'Kickoff Avg (yds)', ['specialTeams', 'kickoffs', 'avg'], 'StatsEngine._specialTeamsStats().kickoffs.avg', { refsPath: ['specialTeams', 'kickoffs', 'refs', 'avg'] }),
      ready('stKickoffTouchbackPct', 'Kickoff Touchback Rate', ['specialTeams', 'kickoffs', 'tbPct'], 'StatsEngine._specialTeamsStats().kickoffs.tbPct', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'n'], denominatorMeasure: 'stKickoffCount', refsPath: ['specialTeams', 'kickoffs', 'refs', 'all'] }),
      ready('stKickoffFairCatchPct', 'Kickoff Fair Catch Rate', ['specialTeams', 'kickoffs', 'fairCatchPct'], 'StatsEngine._specialTeamsStats().kickoffs.fairCatchPct', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'n'], denominatorMeasure: 'stKickoffCount', refsPath: ['specialTeams', 'kickoffs', 'refs', 'all'] }),
      ready('stKickoffReturnAllowedAvg', 'Kickoff Return Allowed (yds)', ['specialTeams', 'kickoffs', 'retAllowedAvg'], 'StatsEngine._specialTeamsStats().kickoffs.retAllowedAvg', { refsPath: ['specialTeams', 'kickoffs', 'refs', 'retAllowedAvg'] }),
      ready('stKickoffOnsideAtt', 'Onside Kicks Attempted', ['specialTeams', 'kickoffs', 'onside', 'n'], 'StatsEngine._specialTeamsStats().kickoffs.onside.n -- structured data only', { refsPath: ['specialTeams', 'kickoffs', 'refs', 'onside'] }),
      // Recovered is a subset of attempted, with its own refs, so Watch on
      // Recovered never opens a failed recovery.
      ready('stKickoffOnsideRecovered', 'Onside Kicks Recovered', ['specialTeams', 'kickoffs', 'onside', 'recovered'], 'StatsEngine._specialTeamsStats().kickoffs.onside.recovered', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'onside', 'n'], denominatorMeasure: 'stKickoffOnsideAtt', refsPath: ['specialTeams', 'kickoffs', 'refs', 'onsideRecovered'] }),
      ready('stFieldGoalAtt', 'Field Goals Attempted', ['specialTeams', 'fg', 'att'], 'StatsEngine._specialTeamsStats().fg.att', { refsPath: ['specialTeams', 'fg', 'refs', 'all'] }),
      ready('stFieldGoalMade', 'Field Goals Made', ['specialTeams', 'fg', 'made'], 'StatsEngine._specialTeamsStats().fg.made', { refsPath: ['specialTeams', 'fg', 'refs', 'made'] }),
      ready('stFieldGoalPct', 'Field Goal Rate', ['specialTeams', 'fg', 'pct'], 'StatsEngine._specialTeamsStats().fg.pct', { zeroDenominatorPath: ['specialTeams', 'fg', 'att'], denominatorMeasure: 'stFieldGoalAtt', refsPath: ['specialTeams', 'fg', 'refs', 'all'] }),
      ready('stFieldGoalLong', 'Longest Field Goal (yds)', ['specialTeams', 'fg', 'long'], 'StatsEngine._specialTeamsStats().fg.long', { zeroDenominatorPath: ['specialTeams', 'fg', 'made'], denominatorMeasure: 'stFieldGoalMade', refsPath: ['specialTeams', 'fg', 'refs', 'made'] }),
      ready('stFieldGoalBlockSnaps', 'FG Block Unit Snaps', ['specialTeams', 'blocks', 'n'], 'StatsEngine._specialTeamsStats().blocks.n -- structured data only', { refsPath: ['specialTeams', 'blocks', 'refs', 'all'] }),
      ready('stFieldGoalBlocked', 'Field Goals Blocked (Our Block Unit)', ['specialTeams', 'blocks', 'blocked'], 'StatsEngine._specialTeamsStats().blocks.blocked -- structured data only', { refsPath: ['specialTeams', 'blocks', 'refs', 'blocked'] }),
      ready('stTryDownsCount', 'Try Downs Charted', ['specialTeams', 'tries', 'n'], 'StatsEngine._specialTeamsStats().tries.n -- structured data only', { refsPath: ['specialTeams', 'tries', 'refs', 'all'] }),
      // Tries stay isolated from FG/offensive efficiency: these read the
      // accepted `conversions.xp`/`conversions.two` contract directly
      // (StatsEngine._conversionStats), never the FG measures above.
      ready('stExtraPointAtt', 'Extra Points Attempted', ['conversions', 'xp', 'att'], 'StatsEngine._conversionStats().xp.att', { refsPath: ['conversions', 'xp', 'refs', 'att'] }),
      ready('stExtraPointMade', 'Extra Points Made', ['conversions', 'xp', 'made'], 'StatsEngine._conversionStats().xp.made', { refsPath: ['conversions', 'xp', 'refs', 'made'] }),
      ready('stExtraPointPct', 'Extra Point Rate', ['conversions', 'xp', 'pct'], 'StatsEngine._conversionStats().xp.pct', { zeroDenominatorPath: ['conversions', 'xp', 'att'], denominatorMeasure: 'stExtraPointAtt', refsPath: ['conversions', 'xp', 'refs', 'att'] }),
      ready('stTwoPointAtt', 'Two-Point Tries Attempted', ['conversions', 'two', 'att'], 'StatsEngine._conversionStats().two.att', { refsPath: ['conversions', 'two', 'refs', 'att'] }),
      ready('stTwoPointMade', 'Two-Point Tries Made', ['conversions', 'two', 'made'], 'StatsEngine._conversionStats().two.made', { refsPath: ['conversions', 'two', 'refs', 'made'] }),
      ready('stTwoPointPct', 'Two-Point Conversion Rate', ['conversions', 'two', 'pct'], 'StatsEngine._conversionStats().two.pct', { zeroDenominatorPath: ['conversions', 'two', 'att'], denominatorMeasure: 'stTwoPointAtt', refsPath: ['conversions', 'two', 'refs', 'att'] }),
      ready('stKickReturnCount', 'Kick Returns', ['specialTeams', 'returns', 'kick', 'n'], 'StatsEngine._specialTeamsStats().returns.kick.n', { refsPath: ['specialTeams', 'returns', 'kick', 'refs', 'all'] }),
      ready('stKickReturnAvg', 'Kick Return Avg (yds)', ['specialTeams', 'returns', 'kick', 'avg'], 'StatsEngine._specialTeamsStats().returns.kick.avg', { refsPath: ['specialTeams', 'returns', 'kick', 'refs', 'attempts'] }),
      ready('stKickReturnLong', 'Longest Kick Return (yds)', ['specialTeams', 'returns', 'kick', 'long'], 'StatsEngine._specialTeamsStats().returns.kick.long', { zeroDenominatorPath: ['specialTeams', 'returns', 'kick', 'attempts'], refsPath: ['specialTeams', 'returns', 'kick', 'refs', 'attempts'] }),
      ready('stKickReturnTD', 'Kick Return TDs', ['specialTeams', 'returns', 'kick', 'td'], 'StatsEngine._specialTeamsStats().returns.kick.td', { refsPath: ['specialTeams', 'returns', 'kick', 'refs', 'td'] }),
      ready('stKickReturnMuffed', 'Kickoffs Muffed', ['specialTeams', 'returns', 'kick', 'muffed'], 'StatsEngine._specialTeamsStats().returns.kick.muffed', { refsPath: ['specialTeams', 'returns', 'kick', 'refs', 'muffed'] }),
      ready('stPuntReturnCount', 'Punt Returns', ['specialTeams', 'returns', 'punt', 'n'], 'StatsEngine._specialTeamsStats().returns.punt.n', { refsPath: ['specialTeams', 'returns', 'punt', 'refs', 'all'] }),
      ready('stPuntReturnAvg', 'Punt Return Avg (yds)', ['specialTeams', 'returns', 'punt', 'avg'], 'StatsEngine._specialTeamsStats().returns.punt.avg', { refsPath: ['specialTeams', 'returns', 'punt', 'refs', 'attempts'] }),
      ready('stPuntReturnLong', 'Longest Punt Return (yds)', ['specialTeams', 'returns', 'punt', 'long'], 'StatsEngine._specialTeamsStats().returns.punt.long', { zeroDenominatorPath: ['specialTeams', 'returns', 'punt', 'attempts'], refsPath: ['specialTeams', 'returns', 'punt', 'refs', 'attempts'] }),
      ready('stPuntReturnTD', 'Punt Return TDs', ['specialTeams', 'returns', 'punt', 'td'], 'StatsEngine._specialTeamsStats().returns.punt.td', { refsPath: ['specialTeams', 'returns', 'punt', 'refs', 'td'] }),
      ready('stPuntReturnMuffed', 'Punts Muffed', ['specialTeams', 'returns', 'punt', 'muffed'], 'StatsEngine._specialTeamsStats().returns.punt.muffed', { refsPath: ['specialTeams', 'returns', 'punt', 'refs', 'muffed'] }),
    ];
  }

  _buildBlocks() {
    return [
      'totalPlays', 'allPlays', 'offPlays', 'defPlays', 'filterActive',
      'rushing', 'passing', 'scoring', 'downs', 'turnovers', 'tendencies',
      'bigPlays', 'individuals', 'drives', 'situational', 'efficiency',
      'personnel', 'advanced', 'defensive', 'gameFlow', 'conversions',
      'specialTeams', 'scoreboard', 'hash', 'personnelSituation',
      'frontCoverageCombos', 'playAction', 'dirMotion', 'takeaways',
      // Study expansion Phase 2: 'penalties' is CONDITIONALLY present on
      // compute()'s output (only when PenaltyModel.summarize() found real
      // records), so readBlocks()/readMeasures() on a clean cohort correctly
      // resolve undefined for it -- the same honest "not charted" signal
      // every other measure renders as '-', not a fabricated empty object.
      'penalties'
    ].map(id => ({ id, name: id, availability: 'ready', path: [id], canonical: `StatsEngine.compute().${id}` }));
  }

  _one(value) {
    return value == null || value === '' ? [] : [String(value)];
  }

  /** Study Phase 3: a dimension value-extractor for one player role --
   *  returns the credited jersey #(s) for `role` when `gate(play)` passes,
   *  else `[]`. `gate` decides whether this play even counts for the role
   *  (e.g. run plays only for ballCarrier); the split itself always reuses
   *  `StatsEngine.splitPlayers` over `StatsEngine.effectivePlayers(play)`
   *  [role] -- one merge, one split, six roles. */
  _playerRoleValues(role, gate) {
    const SE = this._SE;
    return p => (gate(p) ? SE.splitPlayers(SE.effectivePlayers(p)[role]) : []);
  }

  _readPath(source, path) {
    return path.reduce((value, key) => value == null ? undefined : value[key], source);
  }

  /**
   * `readMeasures()`/`values()` serve measures and dimensions that have a
   * field in `StatsEngine.compute()`'s output; `metricsEngine()` serves
   * ad-hoc-cohort metrics (yardsPerPlay, stopRate and their framed siblings)
   * that compute() has no single field for. A pass-through to
   * StatsEngine.metricsEngine(), the sole owner, so Study and Reports share one
   * engine.
   */
  metricsEngine() {
    return this.stats.metricsEngine();
  }

  listDimensions() { return [...this._dimensionMap.values()]; }
  listMeasures() { return [...this._measureMap.values()]; }
  listBlocks() { return [...this._blockMap.values()]; }
  getDimension(id) { return this._dimensionMap.get(id) || null; }
  getMeasure(id) { return this._measureMap.get(id) || null; }
  getBlock(id) { return this._blockMap.get(id) || null; }

  values(id, play, context = {}) {
    const entry = this.getDimension(id);
    if (!entry) throw new Error(`Unknown analytics dimension: ${id}`);
    if (entry.availability !== 'ready' || typeof entry.values !== 'function') {
      throw new Error(`Analytics dimension requires context: ${id}`);
    }
    return entry.values(play, context);
  }

  readMeasures(stats, ids) {
    const out = {};
    for (const id of ids) {
      const entry = this.getMeasure(id);
      if (!entry) throw new Error(`Unknown analytics measure: ${id}`);
      if (entry.availability !== 'ready') throw new Error(`Analytics measure requires context: ${id}`);
      let value = this._readPath(stats, entry.path);
      // Study expansion Phase 2 honesty coercion: a handful of pre-existing
      // StatsEngine rate fields (touchback%, fair-catch%, FG%, XP%, 2-Pt%)
      // intentionally return a literal `0` -- not `null` -- when their own
      // denominator is empty, because Reports has depended on that exact
      // shape since before this checkpoint and changing it there risks a
      // real regression on a surface this checkpoint does not touch. A
      // measure declares `zeroDenominatorPath` to opt THIS reader (Study,
      // via run()/compare()) into the honest reading instead: "never
      // charted" renders as null (-> '-' in the UI), not a misleading "0%".
      // This never mutates `stats` and never touches the StatsEngine field
      // Reports itself reads.
      if (entry.zeroDenominatorPath && !this._readPath(stats, entry.zeroDenominatorPath)) value = null;
      out[id] = id === 'sampleSize' && Array.isArray(value) ? value.length : value;
    }
    return out;
  }

  /**
   * The exact composite refs behind a measure's value, for measures that
   * declare `refsPath` (penalty and Special Teams measures, whose eligible
   * plays can differ from the group's sample). Null otherwise; callers then
   * use the group's `matchingPlayIds`.
   */
  readRefs(stats, measureId) {
    const entry = this.getMeasure(measureId);
    if (!entry || !entry.refsPath) return null;
    const refs = this._readPath(stats, entry.refsPath);
    return Array.isArray(refs) ? refs : [];
  }

  readBlocks(stats, ids) {
    const out = {};
    for (const id of ids) {
      const entry = this.getBlock(id);
      if (!entry) throw new Error(`Unknown analytics block: ${id}`);
      out[id] = this._readPath(stats, entry.path);
    }
    return out;
  }

  /**
   * Composite play reference `${gameId}::${id}` — play ids restart per game, so a
   * bare id can't identify a play across the season scope (the "no lost film link"
   * contract). PRODUCTION CONTRACT: live tagger plays do NOT carry `__gid`, so a
   * consumer (Study / Watch / cutups) must stamp `play.__gid` — recommended at
   * season/store load so every scope works uniformly — OR pass `context.gameId`.
   * Supplying neither is a hard error here, never a silently-ambiguous reference.
   */
  playRef(play, context = {}) {
    const gameId = play?.__gid || context.gameId || context.game;
    if (!gameId || play?.id == null) throw new Error('Composite play reference requires gameId and play.id');
    return `${gameId}::${play.id}`;
  }

  matchingRefs(plays, cutType, cutValue, context = {}) {
    const predicate = this.stats._buildCutFilter(cutType, cutValue);
    if (typeof predicate !== 'function') throw new Error(`Unknown analytics cut: ${cutType}`);
    return (plays || []).filter(predicate).map(play => this.playRef(play, context)).sort();
  }
}
