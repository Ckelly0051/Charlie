/**
 * AnalyticsRegistry - pure contracts for the redesign's shared analytics layer.
 *
 * Ready measures select values already produced by StatsEngine.compute().
 * Required concepts without one canonical production meaning stay explicitly
 * `requires-context`; consumers cannot accidentally invent a denominator.
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';

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
      ready('drive', 'Drive', tag('driveNumber'), 'play.tags.driveNumber'),
      ready('unit', 'Unit', p => [p?.tags?.unit || 'offense'], 'legacy blank => offense'),
      ready('down', 'Down', tag('down'), 'play.tags.down'),
      ready('distance', 'Distance', tag('distance'), 'play.tags.distance'),
      // Study expansion (2026-08-15): the "no shared bucketing function"
      // reason is now stale -- StatsEngine._fieldZone() (extracted from the
      // Play Call report's own Field Position dimension, so this is the SAME
      // six-band convention a coach already sees there: Backed up / Own
      // 11-39 / Midfield / Opp 40-20 / Red zone / Goal line) is that shared
      // function. Deliberately unit-agnostic -- it reads only the play's own
      // tagged field position, so it is equally meaningful grouping our
      // offense's production or our defense's field-position situation
      // (e.g. "how did our defense perform with the opponent in OUR red
      // zone"). The caller's `unit` filter decides which snaps it applies to.
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
      ready('formation', 'Formation', p => SE.splitFormations(SE.proj(p).formation), 'StatsEngine.splitFormations(proj.formation)', { multi: true }),
      ready('backfield', 'Backfield', p => this._one(SE.proj(p).backfield), 'TagProjection.project.backfield'),
      ready('strength', 'Strength', p => this._one(SE.proj(p).strength), 'TagProjection.project.strength'),
      ready('personnel', 'Personnel', tag('personnel'), 'play.tags.personnel'),
      ready('motion', 'Motion', p => [p?.tags?.motion || 'No Motion'], 'play.tags.motion | No Motion'),
      ready('playCall', 'Play Call', tag('playCall'), 'play.tags.playCall'),
      ready('playConcept', 'Play Concept', tag('playConcept'), 'play.tags.playConcept'),
      ready('playType', 'Play Type', p => SE.splitPlayTypes(p?.tags?.playType), 'StatsEngine.splitPlayTypes', { multi: true }),
      ready('playDir', 'Play Direction', tag('playDir'), 'play.tags.playDir'),
      ready('defFront', 'Defensive Front', p => SE.splitFronts(p?.tags?.defFront), 'StatsEngine.splitFronts', { multi: true }),
      ready('coverage', 'Coverage Call', p => this._one(SE.proj(p).coverage), 'TagProjection.project.coverage'),
      ready('coverageFamily', 'Coverage Family', p => this._one(SE.proj(p).coverageFamily), 'TagProjection.project.coverageFamily'),
      ready('blitz', 'Blitz / Pressure', p => SE.splitBlitzes(p?.tags?.blitz), 'StatsEngine.splitBlitzes', { multi: true }),
      ready('playerRole', 'Player Role', p => pairs(p?.tags?.players, true), 'StatsEngine.splitPlayers', { multi: true }),
      ready('grade', 'Grade', p => pairs(p?.tags?.grades), 'play.tags.grades', { multi: true }),
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
        const label = {
          kickoff: 'Kickoff', kickoffReturn: 'Kick Return', punt: 'Punt', puntReturn: 'Punt Return',
          fieldGoal: 'Field Goal', fieldGoalBlock: 'Field Goal Block',
        }[event.unit];
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
      // Study expansion Phase 2: "pre-snap vs live-ball" is only as granular as
      // the STORED model supports -- PenaltyModel.PHASES has no separate
      // pre-snap concept, but 'deadBall' already means exactly that (the ball
      // was not live: false start, delay of game, illegal formation, etc.),
      // while offense/defense/special phases are all fouls committed DURING a
      // live snap. This relabels the existing enum; it never guesses a timing
      // the coach didn't chart. 'unknown' phase intentionally emits no value
      // here (penaltyPhase already offers an explicit 'unknown' bucket).
      ready('penaltyTiming', 'Penalty Timing', p => penalties(p).map(item =>
        item.phase === 'deadBall' ? 'Dead ball' : ['offense', 'defense', 'special'].includes(item.phase) ? 'Live ball' : null
      ).filter(Boolean), "PenaltyModel.normalizeList.phase ('deadBall' vs offense|defense|special)", { multi: true }),
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
      // yardsPerPlay/stopRate stay 'requires-context' for THIS path-based
      // readMeasures() interface specifically -- it reads a pre-aggregated
      // field off a compute()-for-one-cohort snapshot, and neither metric has
      // a single such field (StatsEngine.compute() computes offense- and
      // defense-side aggregates on the SAME object; there's no one path that
      // means "yards/play" or "stop rate" without knowing which side you
      // want). That is still true and this deferral is correct for
      // readMeasures(). It does NOT mean the metric is uncomputable: as of
      // the bounded analytics-architecture cleanup (2026-08-14),
      // `AnalyticsRegistry.metricsEngine()` below is the canonical,
      // ready-today way to compute both from an ad-hoc cohort, complete with
      // eligible/denominator/polarity/state and exact film refs -- the two
      // registries are not competing sources of truth, they answer different
      // questions (a compute()-snapshot field vs. an arbitrary-cohort metric).
      deferred('yardsPerPlay', 'Yards / Play', 'No single compute()-output field for either offense- or defense-framed yards/play; use AnalyticsRegistry.metricsEngine().metric(cohort, "yardsPerPlay"|"yardsAllowedPerPlay") for an ad-hoc cohort'),
      ready('successRate', 'Success Rate', ['efficiency', 'successRate'], 'StatsEngine._efficiencyStats'),
      deferred('conversionRate', 'Conversion Rate', 'Requires conversion type/down context'),
      ready('explosiveRate', 'Explosive Rate', ['efficiency', 'explosivePct'], 'StatsEngine._efficiencyStats'),
      ready('negativeRate', 'Negative Play Rate', ['efficiency', 'negativePct'], 'StatsEngine._efficiencyStats'),
      ready('turnovers', 'Turnovers', ['turnovers', 'total'], 'StatsEngine._turnoverStats', { unit: 'offense' }),
      deferred('scoring', 'Scoring', 'Requires an explicit points vs touchdowns contract'),
      ready('touchdowns', 'Touchdowns', ['scoring', 'touchdowns'], 'StatsEngine._scoringStats', { unit: 'offense' }),
      ready('havocRate', 'Havoc Rate', ['defensive', 'havocRate'], 'StatsEngine._defensiveStats', { unit: 'defense' }),
      deferred('stopRate', 'Stop Rate', 'No single compute()-output field outside a selected defensive cohort; use AnalyticsRegistry.metricsEngine().metric(cohort, "stopRate") for an ad-hoc cohort'),
      ready('epaPerPlay', 'EPA / Play', ['advanced', 'perPlay'], 'AdvancedMetrics.summarize'),
      ready('sampleSize', 'Sample Size', ['allPlays'], 'StatsEngine.compute().allPlays'),
      deferred('dataCompleteness', 'Data Completeness', 'No canonical production completeness measure'),

      // ---- Study expansion Phase 2: Penalties -----------------------------
      // All read PenaltyModel.summarize()'s output off StatsEngine.compute()
      // -- no formula is reimplemented here. `stats.penalties` is only
      // present when the cohort has real records (PenaltyModel's own
      // `hasData` gate), so an empty cohort resolves every one of these to
      // `undefined` -- rendered as "Not charted", never a fabricated zero.
      // Counts are genuine denominators on their own (0 declined penalties is
      // real information); only the YARDS totals carry the accepted-only
      // rule, enforced inside PenaltyModel itself, never re-derived here.
      ready('penaltyFlaggedPlays', 'Flagged Plays', ['penalties', 'flaggedPlays'], 'PenaltyModel.summarize().flaggedPlays'),
      ready('penaltyFouls', 'Penalty Fouls (All)', ['penalties', 'fouls'], 'PenaltyModel.summarize().fouls'),
      ready('penaltyAccepted', 'Penalties Accepted (All)', ['penalties', 'accepted'], 'PenaltyModel.summarize().accepted'),
      ready('penaltyDeclined', 'Penalties Declined', ['penalties', 'declined'], 'PenaltyModel.summarize().declined'),
      ready('penaltyOffsetting', 'Penalties Offsetting', ['penalties', 'offsetting'], 'PenaltyModel.summarize().offsetting'),
      ready('penaltyUnresolved', 'Penalties Unresolved', ['penalties', 'incomplete'], 'PenaltyModel.summarize().incomplete -- missing team, ruling, or foul'),
      ready('penaltyNoPlay', 'No-Play / Retry Penalties', ['penalties', 'noPlay'], 'PenaltyModel.summarize().noPlay -- playCounts:false, any disposition'),
      ready('penaltyAutomaticFirstDowns', 'Penalty First Downs', ['penalties', 'automaticFirstDowns'], 'PenaltyModel.summarize().automaticFirstDowns -- accepted only'),
      ready('penaltyYardsSubject', 'Penalty Yards — Us', ['penalties', 'subjectYards'], 'PenaltyModel.summarize().subjectYards -- accepted enforcement only'),
      ready('penaltyYardsOpponent', 'Penalty Yards — Opponent', ['penalties', 'opponentYards'], 'PenaltyModel.summarize().opponentYards -- accepted enforcement only'),
      // Team/unit-scoped variants read PenaltyModel's own byTeam/byPhase
      // buckets -- each is classified from ONLY that team's/phase's own
      // records, so grouping the cohort by an unrelated dimension (e.g.
      // Formation) can never let a play's OTHER penalty (a different team or
      // phase on the same play, as in an offsetting foul) inflate these.
      ready('penaltyAcceptedSubject', 'Penalties Accepted — Us', ['penalties', 'byTeam', 'subject', 'accepted'], 'PenaltyModel.summarize().byTeam.subject.accepted'),
      ready('penaltyAcceptedOpponent', 'Penalties Accepted — Opponent', ['penalties', 'byTeam', 'opponent', 'accepted'], 'PenaltyModel.summarize().byTeam.opponent.accepted'),
      ready('penaltyAcceptedOffense', 'Offensive Penalties Accepted', ['penalties', 'byPhase', 'offense', 'accepted'], 'PenaltyModel.summarize().byPhase.offense.accepted'),
      ready('penaltyAcceptedDefense', 'Defensive Penalties Accepted', ['penalties', 'byPhase', 'defense', 'accepted'], 'PenaltyModel.summarize().byPhase.defense.accepted'),
      ready('penaltyAcceptedSpecialTeams', 'Special Teams Penalties Accepted', ['penalties', 'byPhase', 'special', 'accepted'], 'PenaltyModel.summarize().byPhase.special.accepted'),
      ready('penaltyYardsOffense', 'Offensive Penalty Yards', ['penalties', 'byPhase', 'offense', 'yards'], 'PenaltyModel.summarize().byPhase.offense.yards -- accepted only'),
      ready('penaltyYardsDefense', 'Defensive Penalty Yards', ['penalties', 'byPhase', 'defense', 'yards'], 'PenaltyModel.summarize().byPhase.defense.yards -- accepted only'),

      // ---- Study expansion Phase 2: Special Teams --------------------------
      // Every measure below reads StatsEngine._specialTeamsStats()'s existing
      // output (`stats.specialTeams`, always present) or `stats.conversions`
      // (the accepted try contract, unchanged) -- no formula duplicated.
      // `zeroDenominatorPath`/`denominatorMeasure` mark the handful of RATE
      // fields whose underlying StatsEngine computation intentionally stays
      // `0` (not `null`) on an empty cohort, to preserve every EXISTING
      // Reports consumer's byte-identical output; `readMeasures()` below
      // coerces those specific measures to `null` here instead, so Study
      // never shows "0%" when the true answer is "never charted".
      ready('stPuntCount', 'Punts', ['specialTeams', 'punts', 'n'], 'StatsEngine._specialTeamsStats().punts.n'),
      ready('stPuntGrossAvg', 'Punt Gross Avg (yds)', ['specialTeams', 'punts', 'grossAvg'], 'StatsEngine._specialTeamsStats().punts.grossAvg'),
      ready('stPuntNetAvg', 'Punt Net Avg (yds)', ['specialTeams', 'punts', 'netAvg'], 'StatsEngine._specialTeamsStats().punts.netAvg'),
      ready('stPuntHangAvg', 'Punt Hang Time (sec)', ['specialTeams', 'punts', 'hangAvg'], 'StatsEngine._specialTeamsStats().punts.hangAvg'),
      ready('stPuntTouchbackPct', 'Punt Touchback Rate', ['specialTeams', 'punts', 'tbPct'], 'StatsEngine._specialTeamsStats().punts.tbPct', { zeroDenominatorPath: ['specialTeams', 'punts', 'n'], denominatorMeasure: 'stPuntCount' }),
      ready('stPuntFairCatchPct', 'Punt Fair Catch Rate', ['specialTeams', 'punts', 'fairCatchPct'], 'StatsEngine._specialTeamsStats().punts.fairCatchPct', { zeroDenominatorPath: ['specialTeams', 'punts', 'n'], denominatorMeasure: 'stPuntCount' }),
      ready('stPuntBlocked', 'Punts Blocked', ['specialTeams', 'punts', 'blocked'], 'StatsEngine._specialTeamsStats().punts.blocked'),
      ready('stPuntReturnAllowedAvg', 'Punt Return Allowed (yds)', ['specialTeams', 'punts', 'retAllowedAvg'], 'StatsEngine._specialTeamsStats().punts.retAllowedAvg'),
      ready('stKickoffCount', 'Kickoffs', ['specialTeams', 'kickoffs', 'n'], 'StatsEngine._specialTeamsStats().kickoffs.n'),
      ready('stKickoffAvg', 'Kickoff Avg (yds)', ['specialTeams', 'kickoffs', 'avg'], 'StatsEngine._specialTeamsStats().kickoffs.avg'),
      ready('stKickoffTouchbackPct', 'Kickoff Touchback Rate', ['specialTeams', 'kickoffs', 'tbPct'], 'StatsEngine._specialTeamsStats().kickoffs.tbPct', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'n'], denominatorMeasure: 'stKickoffCount' }),
      ready('stKickoffFairCatchPct', 'Kickoff Fair Catch Rate', ['specialTeams', 'kickoffs', 'fairCatchPct'], 'StatsEngine._specialTeamsStats().kickoffs.fairCatchPct', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'n'], denominatorMeasure: 'stKickoffCount' }),
      ready('stKickoffReturnAllowedAvg', 'Kickoff Return Allowed (yds)', ['specialTeams', 'kickoffs', 'retAllowedAvg'], 'StatsEngine._specialTeamsStats().kickoffs.retAllowedAvg'),
      ready('stKickoffOnsideAtt', 'Onside Kicks Attempted', ['specialTeams', 'kickoffs', 'onside', 'n'], 'StatsEngine._specialTeamsStats().kickoffs.onside.n -- structured data only'),
      ready('stKickoffOnsideRecovered', 'Onside Kicks Recovered', ['specialTeams', 'kickoffs', 'onside', 'recovered'], 'StatsEngine._specialTeamsStats().kickoffs.onside.recovered', { zeroDenominatorPath: ['specialTeams', 'kickoffs', 'onside', 'n'], denominatorMeasure: 'stKickoffOnsideAtt' }),
      ready('stFieldGoalAtt', 'Field Goals Attempted', ['specialTeams', 'fg', 'att'], 'StatsEngine._specialTeamsStats().fg.att'),
      ready('stFieldGoalMade', 'Field Goals Made', ['specialTeams', 'fg', 'made'], 'StatsEngine._specialTeamsStats().fg.made'),
      ready('stFieldGoalPct', 'Field Goal Rate', ['specialTeams', 'fg', 'pct'], 'StatsEngine._specialTeamsStats().fg.pct', { zeroDenominatorPath: ['specialTeams', 'fg', 'att'], denominatorMeasure: 'stFieldGoalAtt' }),
      ready('stFieldGoalLong', 'Longest Field Goal (yds)', ['specialTeams', 'fg', 'long'], 'StatsEngine._specialTeamsStats().fg.long', { zeroDenominatorPath: ['specialTeams', 'fg', 'made'], denominatorMeasure: 'stFieldGoalMade' }),
      ready('stFieldGoalBlockSnaps', 'FG Block Unit Snaps', ['specialTeams', 'blocks', 'n'], 'StatsEngine._specialTeamsStats().blocks.n -- structured data only'),
      ready('stFieldGoalBlocked', 'Field Goals Blocked (Our Block Unit)', ['specialTeams', 'blocks', 'blocked'], 'StatsEngine._specialTeamsStats().blocks.blocked -- structured data only'),
      ready('stTryDownsCount', 'Try Downs Charted', ['specialTeams', 'tries', 'n'], 'StatsEngine._specialTeamsStats().tries.n -- structured data only'),
      // Tries stay isolated from FG/offensive efficiency: these read the
      // accepted `conversions.xp`/`conversions.two` contract directly
      // (StatsEngine._conversionStats), never the FG measures above.
      ready('stExtraPointAtt', 'Extra Points Attempted', ['conversions', 'xp', 'att'], 'StatsEngine._conversionStats().xp.att'),
      ready('stExtraPointMade', 'Extra Points Made', ['conversions', 'xp', 'made'], 'StatsEngine._conversionStats().xp.made'),
      ready('stExtraPointPct', 'Extra Point Rate', ['conversions', 'xp', 'pct'], 'StatsEngine._conversionStats().xp.pct', { zeroDenominatorPath: ['conversions', 'xp', 'att'], denominatorMeasure: 'stExtraPointAtt' }),
      ready('stTwoPointAtt', 'Two-Point Tries Attempted', ['conversions', 'two', 'att'], 'StatsEngine._conversionStats().two.att'),
      ready('stTwoPointMade', 'Two-Point Tries Made', ['conversions', 'two', 'made'], 'StatsEngine._conversionStats().two.made'),
      ready('stTwoPointPct', 'Two-Point Conversion Rate', ['conversions', 'two', 'pct'], 'StatsEngine._conversionStats().two.pct', { zeroDenominatorPath: ['conversions', 'two', 'att'], denominatorMeasure: 'stTwoPointAtt' }),
      ready('stKickReturnCount', 'Kick Returns', ['specialTeams', 'returns', 'kick', 'n'], 'StatsEngine._specialTeamsStats().returns.kick.n'),
      ready('stKickReturnAvg', 'Kick Return Avg (yds)', ['specialTeams', 'returns', 'kick', 'avg'], 'StatsEngine._specialTeamsStats().returns.kick.avg'),
      ready('stKickReturnLong', 'Longest Kick Return (yds)', ['specialTeams', 'returns', 'kick', 'long'], 'StatsEngine._specialTeamsStats().returns.kick.long', { zeroDenominatorPath: ['specialTeams', 'returns', 'kick', 'attempts'] }),
      ready('stKickReturnTD', 'Kick Return TDs', ['specialTeams', 'returns', 'kick', 'td'], 'StatsEngine._specialTeamsStats().returns.kick.td'),
      ready('stKickReturnMuffed', 'Kickoffs Muffed', ['specialTeams', 'returns', 'kick', 'muffed'], 'StatsEngine._specialTeamsStats().returns.kick.muffed'),
      ready('stPuntReturnCount', 'Punt Returns', ['specialTeams', 'returns', 'punt', 'n'], 'StatsEngine._specialTeamsStats().returns.punt.n'),
      ready('stPuntReturnAvg', 'Punt Return Avg (yds)', ['specialTeams', 'returns', 'punt', 'avg'], 'StatsEngine._specialTeamsStats().returns.punt.avg'),
      ready('stPuntReturnLong', 'Longest Punt Return (yds)', ['specialTeams', 'returns', 'punt', 'long'], 'StatsEngine._specialTeamsStats().returns.punt.long', { zeroDenominatorPath: ['specialTeams', 'returns', 'punt', 'attempts'] }),
      ready('stPuntReturnTD', 'Punt Return TDs', ['specialTeams', 'returns', 'punt', 'td'], 'StatsEngine._specialTeamsStats().returns.punt.td'),
      ready('stPuntReturnMuffed', 'Punts Muffed', ['specialTeams', 'returns', 'punt', 'muffed'], 'StatsEngine._specialTeamsStats().returns.punt.muffed'),
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

  _readPath(source, path) {
    return path.reduce((value, key) => value == null ? undefined : value[key], source);
  }

  /**
   * `readMeasures()`/`values()` remain the canonical path for measures/
   * dimensions that already have a field inside `StatsEngine.compute()`'s
   * output for a given cohort; `metricsEngine()` is the canonical path for
   * ad-hoc-cohort metrics (yardsPerPlay/stopRate and their offense/
   * defense-framed siblings) that `compute()` has no single field for -- see
   * the `deferred(...)` reasons above, both of which point here.
   *
   * Delegates to `StatsEngine.metricsEngine()` rather than constructing its
   * own `AnalyticsMetrics` binding. Repair, 2026-08-14 (Codex re-review,
   * finding #2): the FIRST fix for "two competing metric registries" gave
   * `AnalyticsRegistry` its own construction site, cached here, while
   * `StatsEngine.defensivePerformance()` still built a structurally-identical
   * SECOND copy independently -- so Study and Reports could still drift onto
   * two different engines with nothing to catch it. `StatsEngine` is now the
   * sole owner (it already has to hold every instance method the binding
   * needs); this method is a thin pass-through so existing callers
   * (`StudyQuery._metricsEngine()`) don't have to change.
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
