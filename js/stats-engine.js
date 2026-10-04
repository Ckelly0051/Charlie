/**
 * StatsEngine - Computes team and individual stats from charted play data.
 *
 * All stats are derived live from the play entries in PlayTagger.
 * Nothing is cached — call compute() whenever you need fresh numbers.
 */
import { AdvancedMetrics } from './advanced-metrics.js';
import { Charts } from './charts.js';
import { AnalyticsMetrics } from './analytics-metrics.js';
import { countedUnit, gainedFirstDown, DRIVE_ENDERS, isPlayTagged, playbackOrder } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { TagProjection } from './tag-projection.js';
import { ChartingDetails } from './charting-details.js';
import { SeasonStore } from './season-store.js';

// Shown as a hover tooltip wherever Success Rate appears, so the metric is
// self-explanatory in-app. Matches _isSuccessfulPlay().
const SUCCESS_RATE_TIP = 'Share of plays that stay on schedule for the down/distance: 1st down needs 50% of the yards to go, 2nd down 70%, 3rd/4th must convert (plus any TD or made kick). Situation-aware: a 4-yard gain is a success on 1st-and-10 but not on 3rd-and-10.';

export class StatsEngine {
  /**
   * Split a (possibly multi-select) formation string into its component
   * formations. "Trips + Bunch" -> ["Trips", "Bunch"]; blank -> [] (OMITTED per
   * §6.4 — an alignment-only play falls out of formation analytics, not "Unknown").
   */
  static splitFormations(formation) {
    // Blank → [] (OMITTED, not imputed): §6.4/§6.5. Formation is optional and
    // structure-only now; an alignment-only play (projected formation '') must fall
    // out of formation tendencies/cuts/cross-tabs, never bucket as 'Unknown'.
    return String(formation || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  // The one seam every analytics consumer reads a play's look fields through
  // (GRIDIRON-IQ-TAG-MODEL.md §6): every look field present, blank when
  // uncharted, without mutating the play. Every reader of the look fields in
  // this engine and the analytics registry goes through it, never raw p.tags
  // (enforced by tools/e2e-raw-read-audit.mjs), so Study and the reports agree.
  static proj(p) {
    return TagProjection.project(p && p.tags ? p.tags : {});
  }

  /** The by-key twin of `proj`, for display surfaces keyed by a runtime
   *  column or dimension id (Film Room's `col.key`, EPA's `groupBy(key)`):
   *  the look read for PROJECTED_FIELDS and the raw tag for everything else. */
  static PROJECTED_FIELDS = ['formationFamily', 'receiverSet', 'backfield', 'strength', 'coverage', 'qbAlignment', 'coverageFamily'];
  static projField(p, key) {
    // `?? ''` not `|| ''`: a raw passthrough must preserve a legitimate falsy value
    // (a numeric 0 yard line, a boolean false flag) instead of blanking it. Only
    // null/undefined become ''.
    if (StatsEngine.PROJECTED_FIELDS.includes(key)) return StatsEngine.proj(p)[key] ?? '';
    return (p && p.tags ? p.tags[key] : undefined) ?? '';
  }

  /**
   * Split a (possibly multi-select) play-type string into components.
   * "RPO + Short Pass" -> ["RPO", "Short Pass"]; blank -> ["Unknown"].
   */
  static splitPlayTypes(playType) {
    const parts = String(playType || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : ['Unknown'];
  }

  /**
   * Split a (possibly multi-select) result string into components.
   * "Fumble + Touchdown" -> ["Fumble", "Touchdown"]; blank -> [].
   */
  static splitResults(result) {
    return String(result || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  static splitBlitzes(blitz) {
    return String(blitz || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Split a (possibly multi-select) defensive front into its components.
   * "Maverick + Jumbo Shift" -> ["Maverick", "Jumbo Shift"] — the play is
   * attributed to both the base front and the shift package in analytics.
   */
  static splitFronts(front) {
    return String(front || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Check if a play's result includes a specific value. Handles both
   * single-select ("Touchdown") and multi-select ("Fumble + Touchdown").
   */
  static hasResult(p, val) {
    if (!p || !p.tags || !p.tags.result) return false;
    return StatsEngine.splitResults(p.tags.result).includes(val);
  }

  static isFumbleLost(p) {
    return StatsEngine.hasResult(p, 'Fumble') && p?.tags?.fumbleRecovery === 'opponent';
  }

  static isFumbleRecovered(p) {
    return StatsEngine.hasResult(p, 'Fumble') && p?.tags?.fumbleRecovery === 'subject';
  }

  static isGiveaway(p) {
    return StatsEngine.hasResult(p, 'Interception') || StatsEngine.isFumbleLost(p);
  }

  /** Statistical rushing includes sacks; called Run/Pass remains unchanged. */
  /** A caught pass by its charted result: Gain, No Gain, Loss (a screen
   *  stopped behind the line) or Touchdown. Callers decide whether the play is
   *  a pass and whether an Interception or Sack rules it out. */
  static isCompletionResult(p) {
    return StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'No Gain')
      || StatsEngine.hasResult(p, 'Loss') || StatsEngine.hasResult(p, 'Touchdown');
  }

  /** A pass attempt's result: a completion, an Incomplete or an Interception. */
  static isPassAttemptResult(p) {
    return StatsEngine.isCompletionResult(p) || StatsEngine.hasResult(p, 'Incomplete')
      || StatsEngine.hasResult(p, 'Interception');
  }

  static isRushingAttempt(p) {
    return StatsEngine.isRun(p) || StatsEngine.hasResult(p, 'Sack');
  }

  static rushingPlayer(p) {
    const players = StatsEngine.effectivePlayers(p);
    return StatsEngine.hasResult(p, 'Sack') ? players.passer : players.ballCarrier;
  }

  /** Team turnovers across charted phases, not net margin or routine kicks. */
  static isTeamTurnover(p) {
    if (p?.penalties?.some(penalty => penalty.playCounts === false)) return false;
    const unit = countedUnit(p);
    if (unit !== 'offense' && unit !== 'special') return false;
    const special = SpecialTeamsModel.normalize(p?.specialTeams);
    if (special?.unit === 'try' || special?.unit === 'tryDefense') return false;
    if (StatsEngine.isGiveaway(p)) return true;
    return unit === 'special' && special?.subjectRole === 'receiving'
      && special.outcome.status === 'muffed' && special.outcome.recoveredBy === 'opponent';
  }

  static isTakeaway(p) {
    return StatsEngine.hasResult(p, 'Interception') || StatsEngine.isFumbleRecovered(p);
  }

  /**
   * Split a player attribution value into individual jersey #s. Most roles hold
   * a single number, but Tackler can hold several (shared tackles), stored as a
   * "55, 22"-style string. Returns an array of jersey-# strings (may be empty).
   */
  static splitPlayers(val) {
    return String(val == null ? '' : val).match(/\d+/g) || [];
  }

  /**
   * Run/pass classification. The explicit `runPass` tag is authoritative
   * (set via the Run/Pass selector); for older plays without it we fall back
   * to inferring from the play-type string.
   */
  static isRun(p) {
    const rp = p && p.tags && p.tags.runPass;
    if (rp === 'Run') return true;
    if (rp === 'Pass') return false;
    return StatsEngine._inferredType(p).includes('run');
  }
  static isPass(p) {
    const rp = p && p.tags && p.tags.runPass;
    if (rp === 'Pass') return true;
    if (rp === 'Run') return false;
    const t = StatsEngine._inferredType(p);
    return t.includes('pass') || t.includes('screen') || t === 'play action' || t === 'rpo';
  }
  /** The play type text Run/Pass may be inferred from when the coach set none.
   *  QB Run and Reverse are left out: a scramble can start as a pass and a reverse
   *  can throw, so neither says run or pass by its name and the coach sets Run/Pass. */
  static _inferredType(p) {
    const type = p && p.tags && p.tags.playType ? String(p.tags.playType) : '';
    return type.split(/\s*\+\s*/).filter(part => part && part !== 'QB Run' && part !== 'Reverse').join(' + ').toLowerCase();
  }

  /** Canonical explosive play: a run of 12+ yards or a pass of 16+ yards. Two
   *  thresholds, because a 13-yard run and a 13-yard pass are not the same
   *  play. Extracted so `_efficiencyStats`, `_selfScoutGroup`, the `explosive`
   *  cut filter and the Self-Scout summary all read ONE definition. */
  static isExplosive(p) {
    const yards = parseInt(p && p.tags ? p.tags.yardage : null) || 0;
    return StatsEngine.isRun(p) ? yards >= 12 : yards >= 16;
  }

  /** Canonical conversion: the play gained the line to gain, or scored. The
   *  same test `_downStats` applies for third- and fourth-down conversion
   *  rates, so a Self-Scout conversion count can never disagree with the
   *  conversion percentage printed beside it. */
  static isConversion(p) {
    return gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown');
  }

  /** OFFENSIVE SUCCESS AGAINST THE DEFENSE BEING MEASURED. `isSuccessfulPlay`
   *  counts every touchdown as success, so this supplies the defensive side of
   *  the contract. A native defensive snap measures their offense against our
   *  defense; a Matchup cross-read relabels our offensive snap as their defense
   *  and carries `__chartedUnit:'offense'`, so it measures our offense instead.
   *  Every non-touchdown keeps the canonical rule. */
  static isOpponentSuccess(p) {
    if (StatsEngine.hasResult(p, 'Touchdown')) return StatsEngine.isTouchdownAllowed(p);
    return StatsEngine.isSuccessfulPlay(p);
  }

  /** A touchdown scored by the offense facing the defense this row measures.
   *  Native defense expects `them`; an offense-origin Matchup cross-read expects
   *  `us`. `scoringSide` reads the original charted unit, not the projection. */
  static isTouchdownAllowed(p) {
    const offense = StatsEngine.fieldPerspective(p) === 'defense' ? 'them' : 'us';
    return StatsEngine.hasResult(p, 'Touchdown') && StatsEngine.scoringSide(p) === offense;
  }

  /** A conversion the OPPONENT made on a defensive snap: it gained the line to
   *  gain, or the opponent scored. `isConversion` accepts any touchdown, so a
   *  pick-six on third down read as a third down allowed. Our own return
   *  touchdown is not their conversion, and a touchdown whose scoring side is
   *  unknown is not inferred to be one. */
  static isConversionAllowed(p) {
    if (StatsEngine.hasResult(p, 'Touchdown')) return StatsEngine.isTouchdownAllowed(p);
    return gainedFirstDown(p.tags);
  }

  /** Canonical tackle for loss: a defensive stop behind the line on a run or
   *  pass. Negative yardage from a Sack, Penalty, Kneel or Spike is NOT a
   *  tackle for loss (see `_defensiveStats`, which owns the same rule). */
  /**
   * The no-blitz convention: a snap counts as a charted "No Blitz" call only
   * when the blitz field is empty AND the play carries enough defensive
   * structure — a front or a coverage — for the absence to be a decision the
   * coach recorded. An entirely untagged defensive snap is missing data, not
   * a confirmed no-blitz call, and must never be labelled one.
   *
   * Extracted from `_defensiveStats`'s own `noBlitzTotal` cohort so the
   * report's blitz-rate denominator and Matchup's displayed `No Blitz` call
   * are the same rule rather than two copies of it.
   */
  static isNoBlitz(p) {
    return !p?.tags?.blitz && !!(p?.tags?.defFront || StatsEngine.proj(p).coverage);
  }

  static isTackleForLoss(p) {
    return (parseInt(p.tags.yardage) || 0) < 0
      && !StatsEngine.hasResult(p, 'Sack') && !StatsEngine.hasResult(p, 'Penalty')
      && !StatsEngine.hasResult(p, 'Kneel') && !StatsEngine.hasResult(p, 'Spike');
  }

  /**
   * Points a single play put on the board. Touchdown = 6, made Field Goal = 3,
   * made XP = 1, made 2-Point = 2. Conversion/kick success is the explicit
   * 'Good' result (paired with the ST type); a 'Field Goal' result also counts
   * as 3 for offense plays that mark the drive's FG outcome directly.
   */
  static _tryPenaltyResolved(p) {
    const penalties = PenaltyModel.normalizeList(p?.penalties);
    return !penalties.some(penalty => penalty.playCounts !== true || penalty.disposition === 'unknown');
  }

  static playPoints(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured) {
      if ((structured.unit === 'try' || structured.unit === 'tryDefense') && !StatsEngine._tryPenaltyResolved(p)) return 0;
      const points = SpecialTeamsModel.points(structured);
      if (points) return points;
      if (!structured.isFake) return 0;
      const fakeResults = StatsEngine.splitResults(p && p.tags && p.tags.result);
      if (fakeResults.includes('Touchdown')) return 6;
      if (fakeResults.includes('Safety')) return 2;
      return 0;
    }
    if (!p || !p.tags) return 0;
    const res = StatsEngine.splitResults(p.tags.result);
    if (res.includes('Touchdown')) return 6;
    if (res.includes('Safety')) return 2;
    if (res.includes('Field Goal')) return 3;
    return 0;
  }

  /**
   * Which side a scoring play counts for.
   * - Offense / Special Teams → 'us' (unless Safety → 'them')
   * - Defense unit → 'them' by default (opponent's offense scored), BUT
   *   if the result includes a turnover + TD (pick-six, scoop-and-score)
   *   or a Safety, our defense scored → 'us'.
   */
  static scoringSide(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured && SpecialTeamsModel.points(structured)) {
      const team = SpecialTeamsModel.scoringTeam(p);
      if (team === 'subject') return 'us';
      if (team === 'opponent') return 'them';
      return 'unknown';
    }
    if (structured && structured.isFake && StatsEngine.playPoints(p)) {
      if (StatsEngine.hasResult(p, 'Safety')) return 'unknown';
      return structured.subjectRole === 'kicking' || structured.subjectRole === 'attempting' ? 'us' : 'them';
    }
    if (!p || !p.tags) return 'us';
    const res = StatsEngine.splitResults(p.tags.result);
    // Matchup projections can relabel an offensive rep as the opponent's
    // defense. Scoring ownership remains anchored to the unit the coach
    // charted, just like field position does.
    const unit = p.__chartedUnit || p.tags.unit;
    if (unit === 'defense') {
      if (res.includes('Safety')) return 'us';
      if (res.includes('Touchdown') &&
          (res.includes('Fumble') || res.includes('Interception'))) return 'us';
      return 'them';
    }
    if (res.includes('Safety')) return 'them';
    return 'us';
  }

  /**
   * Walk the plays in charting order and build a running scoreboard:
   * final us/them totals, a per-quarter split, and the list of scoring plays
   * with the running score after each. Includes every tagged play (offense,
   * defense, and special teams) so kicks/conversions count even without a
   * play type.
   */
  computeScoreboard(playsOverride = null) {
    const plays = (playsOverride || (this.tagger ? this.tagger.plays : []) || [])
      .filter(p => p && p.tags);
    let us = 0, them = 0, unattributed = 0;
    const events = [];
    const byQuarter = {};
    plays.forEach(p => {
      const pts = StatsEngine.playPoints(p);
      if (!pts) return;
      // scoringSide honors the play's explicit "Scored by" (us/them) for kicks.
      const side = StatsEngine.scoringSide(p);
      if (side === 'them') them += pts;
      else if (side === 'us') us += pts;
      else unattributed += pts;
      const q = p.tags.quarter || '';
      if (q) {
        if (!byQuarter[q]) byQuarter[q] = { us: 0, them: 0 };
        if (side === 'us' || side === 'them') byQuarter[q][side] += pts;
        else byQuarter[q].unattributed = (byQuarter[q].unattributed || 0) + pts;
      }
      events.push({
        playId: p.id, quarter: q, points: pts, side,
        type: this._scoreType(p), us, them
      });
    });
    return { us, them, ...(unattributed ? { unattributed } : {}), events, byQuarter, hasData: events.length > 0 };
  }

  _scoreType(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured && structured.outcome.score) {
      return { touchdown: 'TD', safety: 'Safety', extraPoint: 'XP', twoPoint: '2-Pt', fieldGoal: 'FG' }[structured.outcome.score] || 'Score';
    }
    const res = StatsEngine.splitResults(p.tags.result);
    if (res.includes('Touchdown')) return 'TD';
    if (res.includes('Safety')) return 'Safety';
    if (res.includes('Field Goal')) return 'FG';
    return 'Score';
  }

  constructor(playTagger, playFilter) {
    this.tagger = playTagger;
    this.filter = playFilter || null;
    this.advanced = new AdvancedMetrics();
  }

  /**
   * Compute all stats from current play data.
   */
  compute(playsOverride = null) {
    let plays;
    let filterActive = false;
    // Broader source for ST/conversion plays, which often have no offensive
    // playType and would otherwise be filtered out below.
    let convSource = (playsOverride || (this.tagger ? this.tagger.plays : [])).filter(p => p && p.tags);
    if (playsOverride) {
      plays = playsOverride.filter(p => p.tags && (p.tags.playType || p.tags.runPass) && !SpecialTeamsModel.isRunPassTry(p));
    } else {
      plays = this.tagger.plays.filter(p => (p.tags.playType || p.tags.runPass) && !SpecialTeamsModel.isRunPassTry(p));
      filterActive = this.filter && this.filter.active;
      if (filterActive) {
        plays = this.filter.filter(plays);
        convSource = this.filter.filter(convSource);
      }
    }

    // Partition by unit perspective: offense-unit plays are OUR offense
    // (formations, play types, yards gained are ours). Defense-unit plays
    // are OUR defense (fronts, coverages, blitzes are ours; the offensive
    // tags on them are the opponent's). Legacy plays without a unit tag
    // default to offense.
    const offPlays = plays.filter(p => countedUnit(p) === 'offense');
    const defPlays = plays.filter(p => p.tags.unit === 'defense');
    const individualSource = [...plays];
    const individualSeen = new Set(individualSource);
    for (const p of convSource) {
      if (individualSeen.has(p) || p.tags.unit !== 'special') continue;
      const structured = SpecialTeamsModel.normalize(p.specialTeams);
      const tagPlayers = p.tags.players || {};
      const eventPlayers = structured?.players || {};
      const hasStructuredSpecialist = structured
        && ['kickoffReturn', 'puntReturn', 'fieldGoal', 'punt'].includes(structured.unit)
        && [eventPlayers.kicker, eventPlayers.punter, eventPlayers.returner,
          tagPlayers.kicker, tagPlayers.returner].some(value => String(value || '').trim());
      if (hasStructuredSpecialist) {
        individualSource.push(p);
        individualSeen.add(p);
      }
    }

    const stats = {
      totalPlays: offPlays.length,
      allPlays: plays.length,
      offPlays,
      defPlays,
      filterActive,
      rushing: this._rushingStats(offPlays),
      passing: this._passingStats(offPlays),
      scoring: this._scoringStats(offPlays),
      downs: this._downStats(offPlays),
      turnovers: this._turnoverStats(offPlays),
      negativePlays: this._negativePlayStats(offPlays),
      tendencies: this._tendencyStats(offPlays),
      bigPlays: this._bigPlays(offPlays),
      individuals: this._individualStats(individualSource),
      drives: this._driveStats(offPlays, { all: convSource }),
      // Non-enumerable ON PURPOSE (defined after the literal, below): the
      // ordered game list lets a caller measure the OPPONENT's drives with the
      // same adjacency rule, but it is an input echoed back, not a result.
      // Enumerable, it would enter every serialization of compute()'s output —
      // the parity goldens, the analytics audit, the exports — as thousands of
      // object paths that assert nothing.
      situational: this._situationalStats(offPlays),
      efficiency: this._efficiencyStats(offPlays),
      personnel: this._personnelStats(offPlays),
      advanced: this.advanced.summarize(offPlays),
      defensive: this._defensiveStats(defPlays),
      gameFlow: this._gameFlowStats(offPlays),
      conversions: this._conversionStats(convSource),
      specialTeams: this._specialTeamsStats(convSource),
      scoreboard: this.computeScoreboard(convSource),
      hash: this._hashStats(offPlays),
      personnelSituation: this._personnelSituationStats(offPlays),
      frontCoverageCombos: this._frontCoverageCombos(defPlays),
      playAction: this._playActionStats(offPlays),
      dirMotion: this._directionMotionStats(offPlays),
    };
    const penalties = PenaltyModel.summarize(convSource);
    if (penalties.hasData) stats.penalties = penalties;
    stats.takeaways = this._generateTakeaways(stats);
    /* `convSource`, NOT `plays`. `plays` keeps only snaps carrying a playType
       or runPass, which is exactly what a punt does not carry — so the drive
       model would look one play past its last snap and find the next
       SCRIMMAGE play, never the kick that actually ended the possession.
       `convSource` is the broader list this method already builds for ST and
       conversion plays, for precisely this reason. */
    Object.defineProperty(stats, 'orderedPlays', { value: convSource, enumerable: false });
    Object.defineProperty(stats, 'totalTurnovers', {
      value: convSource.filter(StatsEngine.isTeamTurnover).length, enumerable: false,
    });

    /* THE CHARTED COHORT, kept beside the CLASSIFIED one.
     *
     * `stats.allPlays` is the classified cohort — snaps carrying a playType or
     * runPass — and every analytics measure above is computed over it. It is
     * NOT the number of plays the coach charted, and Overview presented it as
     * "N charted · 100%", which on the canonical Week 5 game claimed 64 of 64
     * when 83 were charted and only 77% were classifiable.
     *
     * The phase counts have the same problem in a worse form: Overview derived
     * Special Teams by SUBTRACTION (allPlays - offense - defense), so a game
     * with 13 special-teams snaps reported 1 — the single XP that happens to
     * carry a play type. A phase is a property of the snap, so it is counted
     * from the snap, over the complete charted source.
     *
     * Non-enumerable ON PURPOSE, exactly like `orderedPlays`: `e2e-parity`
     * JSON-serializes compute()'s output, so an enumerable addition here would
     * drift every golden. The classified cohort keeps its meaning and its
     * name; the charted cohort gets its own. */
    const phaseOf = play => {
      const unit = countedUnit(play);
      return unit === 'defense' || unit === 'special' ? unit : 'offense';
    };
    const phaseCounts = { offense: 0, defense: 0, special: 0 };
    convSource.forEach(play => { phaseCounts[phaseOf(play)] += 1; });
    Object.defineProperty(stats, 'chartedPlays', { value: convSource.length, enumerable: false });
    Object.defineProperty(stats, 'phaseCounts', { value: phaseCounts, enumerable: false });

    return stats;
  }

  _currentPlays() {
    // A run/pass or Fake try carries a look and result but is reported only by
    // the Special Teams try module (SpecialTeamsModel.isRunPassTry).
    let plays = this.tagger.plays.filter(p => (p.tags.playType || p.tags.runPass) && !SpecialTeamsModel.isRunPassTry(p));
    if (this.filter && this.filter.active) plays = this.filter.filter(plays);
    return plays;
  }

  _offensePlays() {
    return this._currentPlays().filter(p => countedUnit(p) === 'offense');
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  /** The six-band field-zone bucketer, the one source for every consumer.
   *  Reads only the play's own field position, so it applies equally to an
   *  offensive or a defensive snap; the caller picks the unit. */
  _fieldZone(tags) {
    const yard = this._absYardLine(tags);
    if (yard === null) return '';
    if (yard <= 10) return 'Backed up';
    if (yard <= 39) return 'Own 11–39';
    if (yard <= 59) return 'Midfield';
    if (yard <= 79) return 'Opp 40–20';
    if (yard <= 94) return 'Red zone';
    return 'Goal line';
  }

  /** WHICH END OF THE FIELD THE CHARTED UNIT WAS ATTACKING. `_absYardLine`
   *  measures from the charting season's own goal line, so on an OFFENSIVE snap
   *  the ball moves toward 100 and on a DEFENSIVE snap the opponent's offense
   *  moves toward 0. The unit the coach charted is the only source: Matchup
   *  relabels a rep to read it from the other side and carries the original as
   *  `__chartedUnit`, so the relabel changes which cohort a snap joins and never
   *  which goal line its yardage was measured from. Nothing is inferred from
   *  field position itself, and a Special Teams snap keeps the offense-oriented
   *  reading it has always had, because its unit encodes no possession. */
  static fieldPerspective(p) {
    const unit = (p && (p.__chartedUnit || (p.tags && p.tags.unit))) || 'offense';
    return unit === 'defense' ? 'defense' : 'offense';
  }

  /** `_fieldZone` for a DEFENSIVE snap: the same six coach-facing bands, at the
   *  mirrored yard lines, because the offense on the field is the opponent and
   *  it is attacking OUR goal line. Our 1-5 is the goal line, our 6-20 the red
   *  zone, and the opponent is backed up at 90-100. The offense-oriented
   *  `_fieldZone` is unchanged: its consumers measure the offense that owns the
   *  ball, and re-pointing it would move every offensive report. Missing field
   *  position stays absent (`''`) and is never placed in a band. */
  _defensiveFieldZone(tags) {
    const yard = this._absYardLine(tags);
    if (yard === null) return '';
    if (yard <= 5) return 'Goal line';
    if (yard <= 20) return 'Red zone';
    if (yard <= 40) return 'Opp 40–20';
    if (yard <= 60) return 'Midfield';
    if (yard <= 89) return 'Own 11–39';
    return 'Backed up';
  }

  /** The one zone owner every consumer should call when a cohort can hold both
   *  perspectives: it reads the charted unit and picks the matching bucketer. */
  fieldZoneOf(play) {
    return StatsEngine.fieldPerspective(play) === 'defense'
      ? this._defensiveFieldZone(play.tags)
      : this._fieldZone(play.tags);
  }

  /** Red zone and goal line as PREDICATES over either perspective, derived from
   *  the same two bucketers so a threshold can never drift from a band. The red
   *  zone includes the goal line, which is what the offense-oriented `>= 80`
   *  has always meant. */
  _inRedZone(play) {
    return ['Red zone', 'Goal line'].includes(this.fieldZoneOf(play));
  }

  _onGoalLine(play) {
    return this.fieldZoneOf(play) === 'Goal line';
  }

  static isSuccessfulPlay(p) {
    const yds = parseInt(p.tags.yardage) || 0;
    const dist = parseInt(p.tags.distance) || 10;
    if (StatsEngine.hasResult(p, 'Touchdown')) return true;
    if (StatsEngine.hasResult(p, 'Good')) return true;
    if (StatsEngine.hasResult(p, 'No Good')) return false;
    if (p.tags.custom?.includes('1st Down')) return true;
    switch (p.tags.down) {
      case '1': return yds >= dist * 0.5;
      case '2': return yds >= dist * 0.7;
      case '3':
      case '4': return yds >= dist;
      default: return yds >= 4;
    }
  }

  _isSuccessfulPlay(p) {
    return StatsEngine.isSuccessfulPlay(p);
  }

  /** Whether `_isSuccessfulPlay` classifies this play from real tagged data
   *  rather than its own missing-data defaults (yardage 0, distance 10, an
   *  untagged down). Mirrors `_isSuccessfulPlay`'s branches, kept in sync by
   *  hand, but never fills a gap; it reports whether one exists. */
  _isSuccessfulPlayEligible(p) {
    if (StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'No Good')) return true;
    if (p.tags.custom?.includes('1st Down')) return true;
    const yardage = parseInt(p.tags.yardage, 10);
    const distance = parseInt(p.tags.distance, 10);
    const hasYardage = p.tags.yardage !== '' && p.tags.yardage != null && Number.isFinite(yardage);
    const hasDistance = p.tags.distance !== '' && p.tags.distance != null && Number.isFinite(distance);
    const hasDown = ['1', '2', '3', '4'].includes(p.tags.down);
    return hasYardage && hasDown && hasDistance;
  }

  /** How a drive ENDED, read off the play the game charted next.
   *
   *  A drive is reconstructed from one unit's snaps, so its last play is the
   *  last SCRIMMAGE snap — never the punt or the field goal that ended the
   *  possession, because those are charted as Special Teams. That is why a
   *  punted drive used to end on "3rd & 8, No Gain" and report `Other`: the
   *  evidence was in the game, one play later, and this function never looked.
   *
   *  Adjacency is the only signal used. Every branch reads the next play's own
   *  charted kind; possession is never inferred from which side's kick unit was
   *  charted. A punt on either side of
   *  the ball still ends this possession in a punt, so the label holds without
   *  deciding whose punt team was on the field.
   *
   *  Anything the next play cannot settle stays `Other`, deliberately. */
  /** The other unit took the field with no kick between them, so possession
   *  changed on the snap itself. Two charted facts settle how.
   *
   *  A FUMBLE on that snap plus the ball in the other team's hands is a
   *  turnover. This does NOT guess who recovered, and it does not touch
   *  `isFumbleLost`/`isFumbleRecovered`, which stay strict because they answer
   *  a different question and are read by the turnover counts. It reads the
   *  next play: whoever is on the field now has the ball. That distinction
   *  matters here, because `tags.fumbleRecovery` is blank on all eleven fumbles
   *  the coach charted this season — the control exists in the charting deck
   *  and defaults to `unknown`, so the engine has always, correctly, refused to
   *  call those fumbles turnovers. Possession changing is separate evidence.
   *
   *  Otherwise, fourth down that changes hands is a failed conversion. On any
   *  earlier down the charting does not say what happened, and it stays
   *  unlabelled rather than guessed. */
  static _changeOfPossession(last, next) {
    const changed = countedUnit(next) !== countedUnit(last);
    if (!changed) return null;
    if (StatsEngine.hasResult(last, 'Fumble') || StatsEngine.hasResult(last, 'Interception')) return 'Turnover';
    return String(last.tags.down) === '4' ? 'Downs' : null;
  }

  /** The plays that FOLLOW `last`, within its own game, in charted order.
   *
   *  Two containments, both of which `_reconstructDrives` already applies and
   *  this method previously did not:
   *
   *  GAME BOUNDARY. A season roll-up concatenates several games, so a raw
   *  `indexOf + 1` could read the next GAME's opening kickoff and call the
   *  previous game's last possession a score. `_reconstructDrives`' own
   *  three-and-out guard states the rule outright — "the next game's first
   *  drive must not vouch for the previous game's last one" — and it is the
   *  same rule here.
   *
   *  ORDER. A season list is not in play order either; `_reconstructDrives`
   *  sorts by game then timestamp before it does anything. Reading a raw array
   *  position would ask an arbitrary neighbour what happened next. */
  static _followingPlays(last, all) {
    const gameOf = p => p.__seasonGameIdx ?? 0;
    const timeOf = p => ((p.timestamp && p.timestamp.start) ?? p.id ?? 0);
    const game = gameOf(last);
    const ordered = all
      .filter(p => p && p.tags && gameOf(p) === game)
      .sort((a, b) => timeOf(a) - timeOf(b));
    const idx = ordered.indexOf(last);
    return idx < 0 ? [] : ordered.slice(idx + 1);
  }

  static _driveEndFromNextPlay(last, context) {
    const all = context?.all;
    if (!last || !Array.isArray(all)) return null;
    const [next, after] = StatsEngine._followingPlays(last, all);
    /* Nothing follows IN THIS GAME. That is not evidence the clock expired —
       film is routinely truncated, and a partially charted game ends the same
       way. The rule this board runs on is that an outcome the charting cannot
       settle stays `Other`, and that applies to the last possession too. */
    if (!next) return null;
    const tags = next.tags || {};
    if (tags.unit !== 'special') return StatsEngine._changeOfPossession(last, next);
    const structured = SpecialTeamsModel.normalize(next.specialTeams);
    const kind = structured?.unit || '';
    const results = StatsEngine.splitResults(tags.result);
    if (/punt/i.test(kind)) return 'Punt';
    if (/field ?goal|^FG$/i.test(kind)) {
      return results.includes('Good') || StatsEngine.isFieldGoalMade(next) ? 'FG' : 'Missed FG';
    }
    // A try can only follow a possession that put points on the board.
    if (/^XP$|extra ?point|2-?Pt|two ?point/i.test(kind)) return 'TD';
    /* A KICKOFF deliberately resolves nothing. It follows a score, but it also
       opens a half — so the possession before the halftime whistle is followed
       by a kickoff it had no part in. The scoring branches above already claim
       the drives that genuinely scored; anything still here is a possession the
       charting does not explain, and inventing `Score` for it would be exactly
       the guess this method exists to avoid. */
    return null;
  }

  /** `context.all` is the game's plays in charted order. It is OPTIONAL: with
   *  no context every drive resolves exactly as it did before, so no existing
   *  caller changes behavior by not passing it. */
  _driveStats(plays, context = null) {
    const list = this._reconstructDrives(plays).map((dp, idx) => {
      const yards = dp.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const last = dp[dp.length - 1];
      const first = dp[0];
      const res = StatsEngine.splitResults(last?.tags.result);
      let outcome = 'Other';
      if (res.includes('Touchdown')) outcome = 'TD';
      else if (res.includes('Field Goal')) outcome = 'FG';
      else if (res.includes('Safety')) outcome = 'Safety';
      else if (res.includes('Punt')) outcome = 'Punt';
      else if (StatsEngine.isGiveaway(last)) outcome = 'Turnover';
      else if (res.includes('Kneel')) outcome = 'Kneel';
      else outcome = StatsEngine._driveEndFromNextPlay(last, context) || 'Other';
      const startYL = this._absYardLine(first.tags);
      const points = outcome === 'TD' ? 6 : outcome === 'FG' ? 3 : outcome === 'Safety' ? 2 : 0;
      let driveType = 'Other';
      if (dp.length <= 3 && outcome !== 'TD' && outcome !== 'FG') driveType = '3-and-out';
      else if (dp.length >= 8 || yards >= 60) driveType = 'Sustained';
      else if (yards >= 30 && dp.length <= 4) driveType = 'Explosive';
      else if (outcome === 'TD' || outcome === 'FG') driveType = 'Scoring';
      return { number: idx + 1, plays: dp.length, yards, outcome, startYL, points, driveType,
        playIds: dp.map(p => p.id), refs: StatsEngine._refsOf(dp) };
    });
    const scoringDrives = list.filter(d => d.outcome === 'TD' || d.outcome === 'FG');
    const threeAndOuts = list.filter(d => d.driveType === '3-and-out').length;
    const totalPoints = list.reduce((s, d) => s + d.points, 0);
    return {
      total: list.length,
      list,
      scoringDrives: scoringDrives.length,
      threeAndOuts,
      totalPoints,
      pointsPerDrive: list.length ? (totalPoints / list.length).toFixed(1) : '0.0',
      avgPlaysPerDrive: list.length ? (list.reduce((s, d) => s + d.plays, 0) / list.length).toFixed(1) : '0',
      avgYardsPerDrive: list.length ? (list.reduce((s, d) => s + d.yards, 0) / list.length).toFixed(1) : '0'
    };
  }

  /** OPPONENT POSSESSIONS from our defensive snaps, with each drive's outcome
   *  and points attributed by SCORING SIDE. `_driveStats` is side-agnostic — it
   *  reads the last snap's result — so a pick-six ended an opponent drive as a
   *  touchdown worth 6 of THEIR points. Contracts, and the board and the export
   *  both consume this one helper so they cannot disagree:
   *    - their touchdown stays `TD` at 6, their field goal `FG` at 3;
   *    - our return touchdown is a `Turnover` at 0, because the takeaway or
   *      giveaway that produced it is charted;
   *    - our safety keeps `Safety` and scores them 0;
   *    - a score credited to us with no charted turnover stays `Other`
   *      (rendered `Unresolved` / `Other / unresolved`) at 0 — how the ball
   *      changed hands is not inferred;
   *    - ownership comes from `scoringSide`, never from the unit alone.
   *  Drive reconstruction and every offense-drive path are untouched: drives zip
   *  with `_reconstructDrives` by index, the order `_driveStats` builds them in,
   *  because bare play ids collide across games. */
  opponentDriveList(plays, context = null) {
    const drives = this._reconstructDrives(plays);
    return this._driveStats(plays, context).list.map((drive, idx) => {
      const last = drives[idx]?.at(-1);
      if (!last || !['TD', 'FG', 'Safety'].includes(drive.outcome)) return drive;
      if (StatsEngine.scoringSide(last) === 'them') return drive;
      if (drive.outcome === 'Safety') return { ...drive, points: 0 };
      return { ...drive, points: 0,
        outcome: StatsEngine.isTakeaway(last) || StatsEngine.isGiveaway(last) ? 'Turnover' : 'Other' };
    });
  }

  // Drive-by-drive visual for the Game tab. Reuses the already-computed
  // stats.drives.list; each row carries its play ids so it's click-to-film.
    // Backfield + Strength tendency tables (the new Hudl-model dimensions). Each
  // row is click-to-film via the shared cut wiring (backfield / strength cuts).
    // Matchup data: your offense (from your games) + each scouted opponent's
  // defense (from games whose "Film shows" is Opponent Scout, defensive snaps).
  _matchupData() {
    const app = window.app;
    const store = app && app.storage && app.storage.seasonStore;
    const games = app?.season?._effectiveGames?.() || ((store && store.gamesChrono) ? store.gamesChrono() : []);
    const yourOff = [];
    const yourDef = [];
    const oppMap = {};
    const oppOffMap = {};
    const oppGameMap = {};
    games.forEach(g => {
      const stamp = p => ({ ...p, __gid: g.id });
      const scout = ((g.gameInfo && g.gameInfo.perspective) || '') === 'scout';
      const rawOpp = String((g.gameInfo && g.gameInfo.opponent) || '').trim();
      const key = rawOpp || 'Opponent';
      if (rawOpp) (oppGameMap[key] = oppGameMap[key] || new Set()).add(String(g.id || g.name || games.indexOf(g)));
      (g.plays || []).forEach(p => {
        const t = p.tags || {};
        const u = countedUnit(p);
        if (scout) {
          // Opponent film tagged directly: their defense = their defensive snaps,
          // their offense = their offensive snaps. No relabelling needed.
          if (u === 'defense') (oppMap[key] = oppMap[key] || []).push(stamp(p));
          else if (u === 'offense') (oppOffMap[key] = oppOffMap[key] || []).push(stamp(p));
        } else if (u === 'offense') {
          yourOff.push(stamp(p));
          // A game we PLAYED: their defense = the front/coverage we FACED on this
          // offensive snap. Relabel the rep as defensive so _renderDefensive reads
          // it — the yards we gained are the yards their defense allowed. (This is
          // why "I played them" games now populate the matchup, not just scout
          // games — same model as the Opponent Scout.)
          if (rawOpp && (t.defFront || StatsEngine.proj(p).coverage || StatsEngine.proj(p).coverageFamily)) {
            // `__chartedUnit` keeps the unit the field position was measured
            // from; the relabel only changes which cohort reads the rep.
            (oppMap[rawOpp] = oppMap[rawOpp] || []).push({ ...p, __gid: g.id, __chartedUnit: u, tags: { ...t, unit: 'defense' } });
          }
        } else if (u === 'defense') {
          // THE MIRROR, and it is the same shortcut read the other way. On OUR
          // defensive snap the front/coverage/blitz recorded is ours, but the
          // formation, play type, direction and result recorded are THEIRS —
          // that is the offense we faced. So the one rep feeds both columns:
          // kept as-is it is our defense, relabelled offense it is their offense.
          //
          // Gated on carrying an actual offensive tag. A defensive rep charted
          // with only a front is real defensive data and no information at all
          // about their offense; admitting it would pad their play count with
          // rows that say nothing.
          yourDef.push(stamp(p));
          const proj = StatsEngine.proj(p);
          if (rawOpp && (proj.formationFamily || t.playType || t.runPass || proj.backfield || t.personnel)) {
            (oppOffMap[rawOpp] = oppOffMap[rawOpp] || []).push({ ...p, __gid: g.id, __chartedUnit: u, tags: { ...t, unit: 'offense' } });
          }
        }
      });
    });
    const names = [...new Set([...Object.keys(oppMap), ...Object.keys(oppOffMap)])];
    const opponents = names.map(name => ({
      name,
      defPlays: oppMap[name] || [],
      offPlays: oppOffMap[name] || [],
      games: oppGameMap[name]?.size || 0,
    })).sort((a, b) => (b.defPlays.length + b.offPlays.length) - (a.defPlays.length + a.offPlays.length));
    return { opponents, yourOff, yourDef };
  }

  /* ══ Reports > Matchup: the situational join ════════════════════════════
     Decision record: design-comps/reports-matchup-2026-09-06/RATIONALE.md.

     Every football value is measured by an existing owner (compute(),
     defensiveCohortMetrics(), isRun / isExplosive / _isSuccessfulPlay,
     _absYardLine, the splitters). This block owns only the join: which
     opponent snaps form a situation, which call identity they carry, and
     which season snaps match that look.

     Polarity is preserved: an offensive cohort reports Yards / Play and
     Success Rate, a defensive cohort Yards / Play Allowed and Stop Rate. No
     matchup score, prediction or advantage is derived from the two unequal
     samples.
     ───────────────────────────────────────────────────────────────────── */
  static get MATCHUP_NO_BLITZ() { return 'No Blitz'; }
  static get MATCHUP_NO_MATCH() { return 'No matching snaps'; }

  /** The five fixed situations, in render order. Every predicate is one the
   *  established reports already apply — `defensivePerformance`'s own
   *  situation specs for 1st Down, 3rd & Short, 3rd & Long and Red Zone, and
   *  `_defensiveStats`' passing-down rule for 2nd & 7+ — so no competing
   *  distance or yard-line formula enters here. Rows overlap by design: a
   *  red-zone third down belongs to both its down-and-distance cohort and
   *  the Red Zone cohort. */
  _matchupSituations() {
    const dist = p => parseInt(p.tags.distance, 10) || 0;
    return [
      { key: 'first', label: '1st Down', match: p => p.tags.down === '1' },
      { key: 'second-long', label: '2nd & 7+', match: p => p.tags.down === '2' && dist(p) >= 7 },
      { key: 'third-short', label: '3rd & 1-3', match: p => p.tags.down === '3' && dist(p) >= 1 && dist(p) <= 3 },
      { key: 'third-long', label: '3rd & 7+', match: p => p.tags.down === '3' && dist(p) >= 7 },
      /* Both cohorts in a lane pass through these predicates, and one of them is
         always a defensive cohort, so the red zone is read from the perspective
         the snap was CHARTED in rather than from a single fixed threshold. */
      { key: 'red-zone', label: 'Red Zone', match: p => this._inRedZone(p) },
    ];
  }

  /** A defensive call as ONE identity: Front | Coverage | Blitz, joining only
   *  the components the snap actually carries. A blank pressure becomes the
   *  charted `No Blitz` call ONLY when `isNoBlitz` admits it — a snap with a
   *  front or a coverage, where the absence is a decision the coach recorded.
   *  A snap with no defensive structure at all produces no call. */
  static _matchupDefenseLook(play) {
    const front = StatsEngine._matchupSet(StatsEngine.splitFronts(play.tags.defFront));
    const coverage = StatsEngine.proj(play).coverage || '';
    const pressure = StatsEngine._matchupSet(StatsEngine.splitBlitzes(play.tags.blitz))
      || (StatsEngine.isNoBlitz(play) ? StatsEngine.MATCHUP_NO_BLITZ : '');
    const parts = [front, coverage, pressure].filter(Boolean);
    return parts.length ? { label: parts.join(' | '), front, coverage, pressure } : null;
  }

  /** An offensive call as ONE identity: Personnel | Formation | Call. The
   *  call is the coach's own `playCall`, falling back to `playConcept` the
   *  way every other call consumer in this file does. A generic play TYPE is
   *  never relabelled as a named play call. */
  static _matchupOffenseLook(play) {
    const personnel = String(play.tags.personnel || '').trim();
    const formation = StatsEngine._matchupSet(StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily));
    const { call, callField } = StatsEngine._matchupCall(play);
    const parts = [personnel, formation, call].filter(Boolean);
    return parts.length ? { label: parts.join(' | '), personnel, formation, call, callField } : null;
  }

  /** Our own offensive answer: Formation | Call — the two components the comp
   *  displays for `Our Top Call vs Same Look` on the offense-facing tab. */
  static _matchupAnswerLook(play) {
    const formation = StatsEngine._matchupSet(StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily));
    const { call, callField } = StatsEngine._matchupCall(play);
    const parts = [formation, call].filter(Boolean);
    return parts.length ? { label: parts.join(' | '), formation, call, callField } : null;
  }

  /** A multi-value tag as ONE order-independent identity. The stored string is
   *  a `" + "`-joined SELECTION order that carries no football meaning, so two
   *  charts of the same set must not split one call into two — or, worse, fail
   *  to match each other and report a false `No matching snaps`. Components
   *  are deduplicated and joined in canonical order, and that canonical order
   *  is what the board displays. */
  static _matchupSet(parts) {
    return [...new Set((parts || []).filter(Boolean))].sort().join(' + ');
  }

  /** The coach's own call for this play, and WHICH field carried it. Matching
   *  has to compare the same field the display came from: an opponent row
   *  showing a charted CONCEPT must be answered by season snaps carrying that
   *  concept, not silently missed because those snaps also carry a more
   *  specific play call. `playCall` first, `playConcept` as the fallback —
   *  the same precedence every other call consumer in this file uses. */
  static _matchupCall(play) {
    const call = String(play?.tags?.playCall || '').trim();
    if (call) return { call, callField: 'playCall' };
    const concept = String(play?.tags?.playConcept || '').trim();
    return concept ? { call: concept, callField: 'playConcept' } : { call: '', callField: '' };
  }

  /** Distinct games contributing to one cohort. Each of the four cohorts on
   *  the board is counted on its own terms: a game charted on offense only
   *  must never inflate the defensive sample beside it. */
  static _matchupGameCount(plays) {
    return new Set((plays || []).map(play => play.__gid).filter(gid => gid != null).map(String)).size;
  }

  /** Group a cohort by call identity, keeping every contributing play so the
   *  row's film cohort is accumulated in the same pass as its count. */
  static _matchupGroup(plays, lookOf) {
    const groups = new Map();
    (plays || []).forEach(play => {
      const look = lookOf(play);
      if (!look) return;
      if (!groups.has(look.label)) groups.set(look.label, { ...look, plays: [] });
      groups.get(look.label).plays.push(play);
    });
    return groups;
  }

  /** Frequency ranking with a deterministic tie-break: count descending, then
   *  the DISPLAYED name ascending. `Top` means most frequently charted
   *  everywhere on this board — never highest-performing. */
  static _matchupRank(groups) {
    return [...groups.values()].sort((a, b) => b.plays.length - a.plays.length
      || a.label.localeCompare(b.label));
  }

  /** Does this season snap carry the EXACT defensive look displayed on the
   *  opponent row? Only the nonblank displayed components are compared, each
   *  against the same canonical projection that produced it. A displayed
   *  `No Blitz` matches only a snap the no-blitz convention itself admits,
   *  never an untagged one. A filter is never widened to fill a row. */
  static _matchupMatchesDefenseLook(play, look) {
    if (look.front && StatsEngine._matchupSet(StatsEngine.splitFronts(play.tags.defFront)) !== look.front) return false;
    if (look.coverage && (StatsEngine.proj(play).coverage || '') !== look.coverage) return false;
    if (look.pressure === StatsEngine.MATCHUP_NO_BLITZ) return StatsEngine.isNoBlitz(play);
    if (look.pressure && StatsEngine._matchupSet(StatsEngine.splitBlitzes(play.tags.blitz)) !== look.pressure) return false;
    return true;
  }

  /** The same exact-match rule for a displayed offensive look. The call is
   *  compared against the FIELD that produced the displayed value, never
   *  against a re-derived `playCall || playConcept`. */
  static _matchupMatchesOffenseLook(play, look) {
    if (look.personnel && String(play.tags.personnel || '').trim() !== look.personnel) return false;
    if (look.formation && StatsEngine._matchupSet(StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily)) !== look.formation) return false;
    if (look.call && String(StatsEngine.projField(play, look.callField) || '').trim() !== look.call) return false;
    return true;
  }

  /** Offensive production over an EXACT cohort, entirely through compute():
   *  Plays, Yards / Play, Success Rate and Explosive Rate keep the same
   *  definitions every other Reports surface uses. `refs` are the composite
   *  refs of the plays compute() actually measured, so the film a row opens
   *  is exactly the cohort behind its number. */
  _matchupOffenseMetrics(cohort) {
    const computed = this.compute(cohort);
    const measured = computed.offPlays;
    return {
      n: computed.totalPlays,
      yardsPerPlay: Number(StatsEngine.yardsPerPlay(computed)),
      successRate: Number(computed.efficiency.successRate),
      explosiveRate: Number(computed.efficiency.explosivePct),
      runRate: measured.length ? +(measured.filter(StatsEngine.isRun).length / measured.length * 100).toFixed(1) : 0,
      refs: StatsEngine._refsOf(measured),
    };
  }

  /** Defensive production over an EXACT cohort, through the shared
   *  `defensiveCohortMetrics` owner `defensivePerformance` itself uses. */
  _matchupDefenseMetrics(cohort) {
    const measured = this.defensiveCohortMetrics(cohort);
    return {
      n: measured.n, yardsPerPlay: measured.yardsPerPlay, stopRate: measured.stopRate,
      explosiveRate: measured.explosiveRate, refs: StatsEngine._refsOf(cohort),
    };
  }

  /** One situational row per fixed situation: the opponent's most frequent
   *  call inside it, and our own season answer against that exact displayed
   *  look. One builder serves both directions — `oppLook`/`seasonLook` name
   *  which identity each side carries and `seasonMetrics` supplies that
   *  side's own polarity, so neither direction can measure the other's. */
  _matchupSituationRows({ oppPlays, seasonPlays, oppLook, seasonLook, oppMatches, seasonMetrics }) {
    return this._matchupSituations().map(spec => {
      const groups = StatsEngine._matchupGroup((oppPlays || []).filter(spec.match), oppLook);
      /* Eligible = the snaps in this situation that carry a resolvable call
         identity. A snap with nothing charted can never reach the numerator,
         so counting it in the denominator would deflate every rate against a
         cohort no call could ever appear in. */
      const eligible = [...groups.values()].reduce((sum, group) => sum + group.plays.length, 0);
      const top = StatsEngine._matchupRank(groups)[0] || null;
      if (!top) return { key: spec.key, label: spec.label, opponent: null, season: null };
      const sameLook = (seasonPlays || []).filter(spec.match).filter(play => oppMatches(play, top));
      const answer = StatsEngine._matchupRank(StatsEngine._matchupGroup(sameLook, seasonLook))[0] || null;
      return {
        key: spec.key, label: spec.label,
        opponent: {
          label: top.label, n: top.plays.length, eligible,
          rate: eligible ? +(top.plays.length / eligible * 100).toFixed(1) : 0,
          refs: StatsEngine._refsOf(top.plays),
        },
        season: answer ? { label: answer.label, ...seasonMetrics(answer.plays) } : null,
      };
    });
  }

  /** Play-type production for ONE cohort. Each side keeps its own
   *  denominator: the two paired tables are never divided by a shared total.
   *  An untyped snap is omitted rather than bucketed as `Unknown`. */
  _matchupPlayTypeRows(plays, measure) {
    /* A multi-select play type attributes the snap to EACH component, the way
       every other play-type consumer in this file does, so one grouping pass
       cannot use the shared single-identity grouper. */
    const groups = new Map();
    (plays || []).forEach(play => {
      StatsEngine.splitPlayTypes(play.tags.playType).forEach(name => {
        if (!name || name === 'Unknown') return;
        if (!groups.has(name)) groups.set(name, { label: name, plays: [] });
        groups.get(name).plays.push(play);
      });
    });
    return StatsEngine._matchupRank(groups).map(group => ({ label: group.label, ...measure(group.plays) }));
  }

  /** Coverages — driven by the coverages the opponent defense actually
   *  charted. For each, our season offense against that coverage, our most
   *  frequently charted call inside it, and that exact call-and-coverage
   *  cohort's own result. An uncharted coverage is omitted, never rendered
   *  as `Unknown`. */
  _matchupCoverageRows(seasonPlays, oppPlays) {
    const coverages = StatsEngine._matchupGroup(oppPlays, play => {
      const name = StatsEngine.proj(play).coverage || '';
      return name ? { label: name } : null;
    });
    return StatsEngine._matchupRank(coverages).map(group => {
      const faced = (seasonPlays || []).filter(play => (StatsEngine.proj(play).coverage || '') === group.label);
      const calls = StatsEngine._matchupGroup(faced, play => {
        const { call } = StatsEngine._matchupCall(play);
        return call ? { label: call } : null;
      });
      const top = StatsEngine._matchupRank(calls)[0] || null;
      return {
        coverage: group.label, oppSnaps: group.plays.length,
        season: top ? { label: top.label, ...this._matchupOffenseMetrics(top.plays) } : null,
      };
    });
  }

  /** Personnel and Formation — driven by the opponent offense's own charted
   *  personnel + formation combinations, with our defense's result against
   *  that exact same combination beside it. Two cohorts, two reference sets,
   *  and an honest `No matching snaps` when our season holds no exact match. */
  _matchupPersonnelRows(seasonPlays, oppPlays) {
    const same = play => {
      const personnel = String(play.tags.personnel || '').trim();
      const formation = StatsEngine._matchupSet(StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily));
      return (personnel && formation) ? { label: `${personnel} | ${formation}`, personnel, formation } : null;
    };
    return StatsEngine._matchupRank(StatsEngine._matchupGroup(oppPlays, same)).map(group => {
      const ours = (seasonPlays || []).filter(play => {
        const look = same(play);
        return look && look.personnel === group.personnel && look.formation === group.formation;
      });
      return {
        personnel: group.personnel, formation: group.formation,
        opponent: this._matchupOffenseMetrics(group.plays),
        season: ours.length ? this._matchupDefenseMetrics(ours) : null,
      };
    });
  }

  /** Our Offense vs Their Defense. */
  _matchupOffenseLane(seasonPlays, oppPlays) {
    return {
      situations: this._matchupSituationRows({
        oppPlays, seasonPlays,
        oppLook: StatsEngine._matchupDefenseLook,
        seasonLook: StatsEngine._matchupAnswerLook,
        oppMatches: (play, look) => StatsEngine._matchupMatchesDefenseLook(play, look),
        seasonMetrics: cohort => this._matchupOffenseMetrics(cohort),
      }),
      playTypes: {
        season: this._matchupPlayTypeRows(seasonPlays, cohort => this._matchupOffenseMetrics(cohort)),
        opponent: this._matchupPlayTypeRows(oppPlays, cohort => this._matchupDefenseMetrics(cohort)),
      },
      coverages: this._matchupCoverageRows(seasonPlays, oppPlays),
    };
  }

  /** Our Defense vs Their Offense. */
  _matchupDefenseLane(seasonPlays, oppPlays) {
    return {
      situations: this._matchupSituationRows({
        oppPlays, seasonPlays,
        oppLook: StatsEngine._matchupOffenseLook,
        seasonLook: StatsEngine._matchupDefenseLook,
        oppMatches: (play, look) => StatsEngine._matchupMatchesOffenseLook(play, look),
        seasonMetrics: cohort => this._matchupDefenseMetrics(cohort),
      }),
      playTypes: {
        opponent: this._matchupPlayTypeRows(oppPlays, cohort => this._matchupOffenseMetrics(cohort)),
        season: this._matchupPlayTypeRows(seasonPlays, cohort => this._matchupDefenseMetrics(cohort)),
      },
      personnel: this._matchupPersonnelRows(seasonPlays, oppPlays),
    };
  }

  /** Structured Matchup seam for the native Reports tab: the opponent
   *  selection, the two independent sample counts, and one lane per coaching
   *  question. A lane is null when the opponent unit behind it is not charted
   *  — the board must never render a selectable dead tab as though data
   *  exists — and both null is the empty state. */
  matchupReport(oppName) {
    const data = this._matchupData();
    const want = oppName || this._activeOpponent();
    const opponent = data.opponents.find(item => item.name === want) || data.opponents[0] || null;
    if (!opponent) return { opponents: [], opponent: null, season: null, offense: null, defense: null };
    /* A nullified or unresolved penalty snap is not a defensive rep. The
       canonical Defense report drops it before it measures anything, and
       Matchup has to drop it before it RANKS anything too -- otherwise the
       snap still sets a call's frequency, its Rate, and its film cohort even
       where it no longer moves the average. Offensive cohorts go through
       compute(), which is the canonical Offense report's own cohort rule. */
    const ourDefense = (data.yourDef || []).filter(StatsEngine._tryPenaltyResolved);
    const theirDefense = (opponent.defPlays || []).filter(StatsEngine._tryPenaltyResolved);
    /* Four cohorts, four independent game counts. A game charted on offense
       only must never inflate the defensive sample stated beside it. */
    const count = StatsEngine._matchupGameCount;
    return {
      opponents: data.opponents.map(item => ({ name: item.name,
        offense: item.offPlays.length, defense: item.defPlays.length })),
      opponent: {
        name: opponent.name, games: opponent.games,
        offense: opponent.offPlays.length, offenseGames: count(opponent.offPlays),
        defense: theirDefense.length, defenseGames: count(theirDefense),
      },
      season: {
        offense: data.yourOff.length, offenseGames: count(data.yourOff),
        defense: ourDefense.length, defenseGames: count(ourDefense),
      },
      offense: theirDefense.length ? this._matchupOffenseLane(data.yourOff, theirDefense) : null,
      defense: opponent.offPlays.length ? this._matchupDefenseLane(ourDefense, opponent.offPlays) : null,
    };
  }

  _situationalStats(plays) {
    const buckets = {
      redZone: plays.filter(p => { const y = this._absYardLine(p.tags); return y !== null && y >= 80; }),
      goalLine: plays.filter(p => { const y = this._absYardLine(p.tags); return y !== null && y >= 95; }),
      backedUp: plays.filter(p => { const y = this._absYardLine(p.tags); return y !== null && y <= 10; }),
      thirdLong: plays.filter(p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7),
      thirdShort: plays.filter(p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 1 && (parseInt(p.tags.distance) || 0) <= 3)
    };
    const summarize = (arr) => {
      const total = arr.length;
      const tds = arr.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length;
      const successes = arr.filter(p => this._isSuccessfulPlay(p)).length;
      const yds = arr.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      return {
        total, tds, successes,
        yards: yds,
        avg: total ? (yds / total).toFixed(1) : '0.0',
        successPct: total ? ((successes / total) * 100).toFixed(0) : '0'
      };
    };
    return {
      redZone: summarize(buckets.redZone),
      goalLine: summarize(buckets.goalLine),
      backedUp: summarize(buckets.backedUp),
      thirdLong: summarize(buckets.thirdLong),
      thirdShort: summarize(buckets.thirdShort),
      byQuarter: this._statsByQuarter(plays)
    };
  }

  _statsByQuarter(plays) {
    const result = {};
    ['Q1', 'Q2', 'Q3', 'Q4', 'OT'].forEach(q => {
      const qp = plays.filter(p => p.tags.quarter === q);
      result[q] = {
        plays: qp.length,
        yards: qp.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0),
        tds: qp.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length
      };
    });
    return result;
  }

  _efficiencyStats(plays) {
    const successes = plays.filter(p => this._isSuccessfulPlay(p)).length;
    const explosive = plays.filter(p => StatsEngine.isExplosive(p)).length;
    const negative = plays.filter(p => (parseInt(p.tags.yardage) || 0) < 0).length;
    return {
      successRate: plays.length ? ((successes / plays.length) * 100).toFixed(1) : '0.0',
      successes,
      explosivePct: plays.length ? ((explosive / plays.length) * 100).toFixed(1) : '0.0',
      explosivePlays: explosive,
      negativePct: plays.length ? ((negative / plays.length) * 100).toFixed(1) : '0.0',
      negativePlays: negative
    };
  }

  /**
   * Exact offensive play-call analysis. The source is already the canonical
   * offensive report cohort; blank calls are omitted rather than invented.
   * Every rate is derived by compute(), so Reports cannot drift from the
   * established Success Rate, explosive, negative-play, or YPP definitions.
   */
  _playCallAnalysis(plays) {
    const source = (plays || []).filter(play => countedUnit(play) === 'offense'
      && String(play.tags.playCall || '').trim());
    if (!source.length) return { eligible: 0, calls: [], concepts: [], situations: [] };

    const summarize = (name, cohort, denominator = source.length) => {
      const computed = this.compute(cohort);
      return {
        name,
        n: cohort.length,
        sharePct: denominator ? Number((cohort.length / denominator * 100).toFixed(1)) : 0,
        successRate: Number(computed.efficiency.successRate),
        yardsPerPlay: Number(StatsEngine.yardsPerPlay(computed)),
        explosiveRate: Number(computed.efficiency.explosivePct),
        negativeRate: Number(computed.efficiency.negativePct),
        playIds: cohort.map(play => play.id),
        refs: StatsEngine._refsOf(cohort),
      };
    };
    const group = (items, values) => {
      const groups = new Map();
      items.forEach(play => {
        const raw = values(play);
        const keys = Array.isArray(raw) ? raw : [raw];
        [...new Set(keys.map(value => String(value || '').trim()).filter(Boolean))].forEach(key => {
          if (!groups.has(key)) groups.set(key, []);
          groups.get(key).push(play);
        });
      });
      return groups;
    };
    const callGroups = group(source, play => play.tags.playCall);
    const calls = [...callGroups.entries()]
      .map(([name, cohort]) => ({ ...summarize(name, cohort), concept: String(cohort[0]?.tags?.playConcept || '').trim() }))
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

    const conceptGroups = group(source, play => play.tags.playConcept);
    const concepts = [...conceptGroups.entries()].map(([name, cohort]) => ({
      ...summarize(name, cohort),
      calls: [...group(cohort, play => play.tags.playCall).entries()]
        .map(([call, callPlays]) => summarize(call, callPlays, source.length))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
    })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));

    const dirVsStrength = StatsEngine._matrixDimensions().find(item => item.id === 'dirVsStrength')?.extract;
    // The shared six-band bucketer.
    const fieldZone = play => this._fieldZone(play.tags);
    const dimensions = [
      { id: 'downDistance', label: 'Down & Distance', values: play => { const key = this._ddKey(play.tags); return key ? this._ddPretty(key) : ''; } },
      { id: 'formationFamily', label: 'Formation', values: play => StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily) },
      { id: 'personnel', label: 'Personnel', values: play => play.tags.personnel || '' },
      { id: 'fieldPosition', label: 'Field Position', values: fieldZone },
      { id: 'directionStrength', label: 'Direction vs Strength', values: play => dirVsStrength ? dirVsStrength(play) : [] },
    ];
    const situations = [];
    dimensions.forEach(dimension => {
      for (const [value, cohort] of group(source, dimension.values).entries()) {
        const ranked = [...group(cohort, play => play.tags.playCall).entries()]
          .sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
        if (!ranked.length) continue;
        const [call, callPlays] = ranked[0];
        situations.push({
          dimension: dimension.id,
          lens: dimension.label,
          value,
          contextN: cohort.length,
          call,
          ...summarize(call, callPlays, cohort.length),
        });
      }
    });
    return { eligible: source.length, calls, concepts, situations };
  }
  /** Rushing direction relative to declared strength.
   *
   *  Reads `playDir` and `strength` through `_matrixDimensions()`'s
   *  `dirVsStrength` extractor, the one owner of the toward/away rule, so the
   *  module measures what its title says even when no play calls are charted.
   *  Each bucket reports run/pass counts and rates with production and success.
   *
   *  `DIR_STRENGTH_BUCKETS` is a fixed set in a fixed order. A bucket no snap
   *  reached is `held: true`, keeping its label with no measurement, never a
   *  zero and never a missing row. */
  _dirStrengthStats(plays) {
    const extract = StatsEngine._matrixDimensions().find(item => item.id === 'dirVsStrength')?.extract;
    const groups = new Map(StatsEngine.DIR_STRENGTH_BUCKETS.map(name => [name, []]));
    if (extract) {
      (plays || []).filter(p => countedUnit(p) === 'offense'
        && (StatsEngine.isRun(p) || StatsEngine.isPass(p))).forEach(p => {
        (extract(p) || []).forEach(key => { if (groups.has(key)) groups.get(key).push(p); });
      });
    }
    const measuredPlays = [...groups.values()].reduce((sum, cohort) => sum + cohort.length, 0);
    const list = [...groups.entries()].map(([name, cohort]) => {
      if (!cohort.length) return { name, held: true };
      const yards = cohort.reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0);
      const runs = cohort.filter(p => StatsEngine.isRun(p)).length;
      const passes = cohort.filter(p => StatsEngine.isPass(p)).length;
      const successes = cohort.filter(p => this._isSuccessfulPlay(p)).length;
      return {
        name,
        count: cohort.length,
        runs,
        passes,
        runPct: Math.round((runs / cohort.length) * 100),
        passPct: Math.round((passes / cohort.length) * 100),
        yards,
        avg: (yards / cohort.length).toFixed(1),
        successPct: ((successes / cohort.length) * 100).toFixed(0),
        refs: StatsEngine._refsOf(cohort),
      };
    });
    return { hasData: measuredPlays > 0, measuredPlays, list };
  }

  _personnelStats(plays) {
    const groups = {};
    plays.forEach(p => {
      const k = p.tags.personnel || 'Unknown';
      if (!groups[k]) groups[k] = { name: k, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      groups[k].count++;
      groups[k].yards += parseInt(p.tags.yardage) || 0;
      if (StatsEngine.isRun(p)) groups[k].runs++;
      else groups[k].passes++;
      if (this._isSuccessfulPlay(p)) groups[k].successes++;
    });
    return Object.values(groups).map(g => ({
      ...g,
      avg: g.count ? (g.yards / g.count).toFixed(1) : '0.0',
      successPct: g.count ? ((g.successes / g.count) * 100).toFixed(0) : '0'
    })).sort((a, b) => b.count - a.count);
  }

  _defensiveStats(plays) {
    const sacks = plays.filter(p => StatsEngine.hasResult(p, 'Sack'));
    // TFL = a defensive stop behind the line on a run/pass. Negative yardage
    // from a Penalty, Kneel or Spike is NOT a tackle for loss and must not
    // inflate havoc rate (or the defense's TFL count).
    const tfl = plays.filter(p => StatsEngine.isTackleForLoss(p));
    const ints = plays.filter(p => StatsEngine.hasResult(p, 'Interception'));
    const fumbles = plays.filter(p => StatsEngine.hasResult(p, 'Fumble'));
    const fumblesRecovered = fumbles.filter(p => StatsEngine.isFumbleRecovered(p));
    const fumblesUnknown = fumbles.filter(p => !['subject', 'opponent'].includes(p.tags?.fumbleRecovery));
    const incompletions = plays.filter(p => StatsEngine.hasResult(p, 'Incomplete'));
    const havocPlays = sacks.length + tfl.length + ints.length + fumbles.length;
    const threeAndOuts = this._countThreeAndOuts(plays);

    const fronts = {};
    const coverages = {};
    const blitzes = {};

    plays.forEach(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      // Defense-framed: our own return touchdown is a stop, not opponent success.
      const defSuccess = !StatsEngine.isOpponentSuccess(p);
      const isHavoc = StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
        StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack'));
      // Additive film identity: pushed in the SAME pass that increments count,
      // so refs.length can never drift from what the row's own count says it
      // covers (Reports Presentation Independence, Scheme Detail migration).
      // No count/yards/successes/havoc/runs/passes value is touched here.
      const ref = StatsEngine._compositeRef(p);

      StatsEngine.splitFronts(p.tags.defFront).forEach(f => {
        if (!fronts[f]) fronts[f] = { name: f, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0, refs: [] };
        fronts[f].count++;
        fronts[f].yards += yds;
        if (defSuccess) fronts[f].successes++;
        if (isHavoc) fronts[f].havoc++;
        if (StatsEngine.isRun(p)) fronts[f].runs++;
        else fronts[f].passes++;
        if (ref) fronts[f].refs.push(ref);
      });

      if (StatsEngine.proj(p).coverage) {
        const c = StatsEngine.proj(p).coverage;
        if (!coverages[c]) coverages[c] = { name: c, count: 0, yards: 0, successes: 0, comps: 0, incs: 0, ints: 0, sacks: 0, refs: [] };
        coverages[c].count++;
        coverages[c].yards += yds;
        if (defSuccess) coverages[c].successes++;
        // A pick-six is charted `Interception + Touchdown`: it is an
        // interception against this coverage, never a completion allowed.
        if (StatsEngine.hasResult(p, 'Gain') || StatsEngine.isTouchdownAllowed(p) || StatsEngine.hasResult(p, 'No Gain')
          || (StatsEngine.hasResult(p, 'Loss') && StatsEngine.isPass(p))) coverages[c].comps++;
        if (StatsEngine.hasResult(p, 'Incomplete')) coverages[c].incs++;
        if (StatsEngine.hasResult(p, 'Interception')) coverages[c].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) coverages[c].sacks++;
        if (ref) coverages[c].refs.push(ref);
      }

      if (p.tags.blitz) {
        StatsEngine.splitBlitzes(p.tags.blitz).forEach(b => {
          if (!blitzes[b]) blitzes[b] = { name: b, count: 0, yards: 0, sacks: 0, havoc: 0, successes: 0, refs: [] };
          blitzes[b].count++;
          blitzes[b].yards += yds;
          if (StatsEngine.hasResult(p, 'Sack')) blitzes[b].sacks++;
          if (isHavoc) blitzes[b].havoc++;
          if (defSuccess) blitzes[b].successes++;
          if (ref) blitzes[b].refs.push(ref);
        });
      }
    });

    const blitzPlays = plays.filter(p => p.tags.blitz);
    const noBlitzPlays = plays.filter(StatsEngine.isNoBlitz);
    const blitzHavoc = blitzPlays.filter(p =>
      StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
      StatsEngine.hasResult(p, 'Fumble') || ((parseInt(p.tags.yardage) || 0) < 0 && !StatsEngine.hasResult(p, 'Sack'))
    ).length;

    const passingDowns = plays.filter(p =>
      (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) >= 7) ||
      (p.tags.down === '3') || (p.tags.down === '4')
    );
    const earlyDowns = plays.filter(p => p.tags.down === '1' || (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) < 7));

    const frontBySituation = (subset, label) => {
      const map = {};
      subset.forEach(p => {
        StatsEngine.splitFronts(p.tags.defFront).forEach(f => {
          map[f] = (map[f] || 0) + 1;
        });
      });
      return { label, total: subset.length, fronts: Object.entries(map).sort((a, b) => b[1] - a[1]) };
    };

    return {
      sacks: sacks.length,
      sackYards: sacks.reduce((s, p) => s + Math.abs(parseInt(p.tags.yardage) || 0), 0),
      tfl: tfl.length,
      interceptions: ints.length,
      fumbles: fumbles.length,
      fumblesRecovered: fumblesRecovered.length,
      fumblesUnknown: fumblesUnknown.length,
      turnovers: ints.length + fumblesRecovered.length,
      havocPlays,
      havocRate: plays.length ? ((havocPlays / plays.length) * 100).toFixed(1) : '0.0',
      incompletions: incompletions.length,
      threeAndOuts,
      fronts: Object.values(fronts).map(row => ({ ...row, refs: [...new Set(row.refs)].sort() })).sort((a, b) => b.count - a.count),
      coverages: Object.values(coverages).map(row => ({ ...row, refs: [...new Set(row.refs)].sort() })).sort((a, b) => b.count - a.count),
      blitzes: Object.values(blitzes).map(row => ({ ...row, refs: [...new Set(row.refs)].sort() })).sort((a, b) => b.count - a.count),
      blitzRate: plays.length ? ((blitzPlays.length / plays.length) * 100).toFixed(1) : '0.0',
      blitzTotal: blitzPlays.length,
      blitzHavocRate: blitzPlays.length ? ((blitzHavoc / blitzPlays.length) * 100).toFixed(1) : '0.0',
      noBlitzTotal: noBlitzPlays.length,
      earlyDownFronts: frontBySituation(earlyDowns, 'Early Downs'),
      passingDownFronts: frontBySituation(passingDowns, 'Passing Downs'),
      hasData: !!(Object.keys(fronts).length || Object.keys(coverages).length || Object.keys(blitzes).length ||
        sacks.length || tfl.length || ints.length || fumbles.length)
    };
  }

  /**
   * Performance-first defensive analysis over an explicitly supplied cohort.
   * Defensive plays describe the opponent's offense, so offensive playType,
   * run/pass, down, distance and yardage are the dimensions being defended.
   */
  /**
   * The one AnalyticsMetrics instance bound to this StatsEngine, built once and
   * reused. Reports (`defensivePerformance()`) and Study
   * (`AnalyticsRegistry.metricsEngine()`) both use it, so their metric
   * bindings cannot drift apart.
   */
  metricsEngine() {
    if (!this._metricsEngine) {
      this._metricsEngine = new AnalyticsMetrics({
        isRun: StatsEngine.isRun, isPass: StatsEngine.isPass, hasResult: StatsEngine.hasResult,
        isSuccessfulPlay: p => this._isSuccessfulPlay(p),
        isEligiblePlay: p => this._isSuccessfulPlayEligible(p),
        buildCutFilter: (type, val) => this._buildCutFilter(type, val),
        // Study Phase 3: player performance metrics (soloTackles/
        // assistedTackles) need to re-derive a play's own tackler list to
        // classify solo vs. shared credit -- reusing the same static every
        // other player-attribution consumer uses, never a second parser.
        splitPlayers: StatsEngine.splitPlayers,
        // "This attempt succeeded" reused across completionRate/completions
        // for passer/receiver/kicker (see StatsEngine.isMadeAttempt's own
        // comment for why one function safely covers both a completed pass
        // and a made structured kick).
        isMadeAttempt: p => StatsEngine.isMadeAttempt(p, StatsEngine.hasResult),
        // "Did this play score a touchdown", structured or legacy; see
        // StatsEngine.isScoredTouchdown.
        isScoredTouchdown: p => StatsEngine.isScoredTouchdown(p, StatsEngine.hasResult),
      });
    }
    return this._metricsEngine;
  }

  /**
   * Stop rate, yards allowed per play, explosive rate, havoc and the exact
   * composite film cohort for ONE defensive cohort, measured through the
   * shared `AnalyticsMetrics` seam with this report's historical legacy
   * options. Extracted from `defensivePerformance()`'s own `summarize` so
   * Matchup's season-side join measures a defensive cohort through the same
   * owner rather than a second hand-written copy: two surfaces cannot then
   * report the same label two ways.
   *
   * `legacyOptions` reproduces the exact historical formulas — a missing
   * yardage tag counted as 0 rather than excluded (`missingAsZero`), and a
   * play with no resolvable film ref dropped from `refs` rather than failing
   * the whole report (`allowUnlinkedPlays`).
   */
  defensiveCohortMetrics(rawCohort) {
    /* The penalty filter is part of the contract, not of the caller.
       `defensivePerformance` applies `_tryPenaltyResolved` to its own source
       before it ever gets here, so this is a no-op for that report; it is what
       stops a second consumer measuring a nullified or unresolved snap as a
       real defensive rep. */
    const cohort = (rawCohort || []).filter(StatsEngine._tryPenaltyResolved);
    const metrics = this.metricsEngine();
    const legacyOptions = { missingAsZero: true, allowUnlinkedPlays: true };
    /* A stop is measured against OPPONENT success, so our own return touchdown
       counts as a stop instead of as their conversion. */
    const stopRate = metrics.metric(cohort, 'stopRate', {},
      { ...legacyOptions, deps: { isSuccessfulPlay: StatsEngine.isOpponentSuccess } });
    const explosive = metrics.metric(cohort, 'explosivesAllowedRate', {}, legacyOptions);
    const havoc = metrics.metric(cohort, 'havocRate', {}, legacyOptions);
    const ypp = metrics.metric(cohort, 'yardsAllowedPerPlay', {}, legacyOptions);
    return {
      n: cohort.length, stops: stopRate.count, explosives: explosive.count, havoc: havoc.count,
      touchdowns: cohort.filter(StatsEngine.isTouchdownAllowed).length,
      stopRate: stopRate.value ?? 0,
      yardsPerPlay: ypp.value ?? 0,
      explosiveRate: explosive.value ?? 0,
      havocRate: havoc.value ?? 0,
      refs: stopRate.refs,
    };
  }

  defensivePerformance(plays, gameLabels = {}) {
    const source = (plays || []).filter(p => p?.tags?.unit === 'defense' && StatsEngine._tryPenaltyResolved(p));
    const yards = p => parseInt(p.tags.yardage, 10) || 0;
    // Cohort filtering + rate calculation for stopRate/explosivesAllowedRate/
    // havocRate/yardsAllowedPerPlay now go through the shared AnalyticsMetrics
    // seam (the pure module Study's expansion will also build on) instead of
    // being hand-rolled here a second time. This cohort is our DEFENSE's
    // snaps, so the "Allowed" metric ids are the correct defense-framed half
    // of each offense/defense metric pair -- stopRate and havocRate need no
    // "Allowed" sibling, since both are already unambiguously defense-framed
    // by name (see analytics-metrics.js's "POLARITY IS PER UNIT" docblock
    // section). `legacyOptions` reproduces this report's exact historical
    // formulas: a missing yardage tag counted as 0 rather than excluded
    // (`missingAsZero`), and a play with no resolvable film ref was silently
    // dropped from `refs` rather than failing the whole report
    // (`allowUnlinkedPlays`) -- both opt-ins, never the new module's honest
    // default; see analytics-metrics.js's docblock for why.
    const summarize = (name, cohort) => {
      const measured = this.defensiveCohortMetrics(cohort);
      return { name, ...measured,
        sharePct: source.length ? +(measured.n / source.length * 100).toFixed(1) : 0 };
    };

    const run = source.filter(StatsEngine.isRun);
    const pass = source.filter(StatsEngine.isPass);
    // Candidate order for the Offense play-type table. `fitRows` caps the board
    // to its approved allocation, so a new candidate cannot resize the module —
    // `Option` becomes rankable here without changing any fixed row count.
    const detailOrder = ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass',
      'Deep Pass', 'RPO', 'Option', 'Play Action', 'Trick Play'];
    // Build each play-type cohort exactly once. `playTypes` and `answers`
    // both need "the plays for this play type" -- previously `answers`
    // re-derived it with a second full pass over `source` per type instead
    // of reusing the cohort already filtered here.
    const playTypeCohorts = [['All Runs', run], ['All Passes', pass],
      ...detailOrder.map(name => [name, source.filter(p => StatsEngine.splitPlayTypes(p.tags.playType).includes(name))])];
    const playTypes = playTypeCohorts.map(([name, cohort]) => summarize(name, cohort))
      .filter(row => row.n > 0);

    const grouped = (cohort, keyFn) => {
      const map = new Map();
      cohort.forEach(play => {
        let keys = keyFn(play);
        if (!Array.isArray(keys)) keys = [keys];
        keys.filter(Boolean).forEach(key => {
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(play);
        });
      });
      return [...map.entries()];
    };
    const bestAnswer = (cohort, values) => {
      const candidates = [];
      values(cohort).forEach(([name, answerPlays]) => {
        if (!name || answerPlays.length < 3) return;
        candidates.push(summarize(name, answerPlays));
      });
      return candidates.sort((a, b) => b.stopRate - a.stopRate
        || a.yardsPerPlay - b.yardsPerPlay || b.n - a.n)[0] || null;
    };
    const answers = playTypeCohorts.filter(([, cohort]) => cohort.length > 0).map(([name, cohort]) => ({
      playType: name, n: cohort.length,
      front: bestAnswer(cohort, ps => grouped(ps, p => StatsEngine.splitFronts(p.tags.defFront))),
      coverage: bestAnswer(cohort, ps => grouped(ps, p => StatsEngine.proj(p).coverage || '')),
      pressure: bestAnswer(cohort, ps => grouped(ps, p => p.tags.blitz ? 'Blitz' : 'No Blitz')),
    })).filter(row => row.front || row.coverage || row.pressure);

    const byGame = grouped(source, p => String(p.__gid ?? 'current')).map(([gid, cohort]) => ({
      ...summarize(gameLabels[gid] || gid, cohort), gameId: gid,
    })).sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));
    const situationSpecs = [
      ['1st Down', p => p.tags.down === '1'],
      ['2nd Down', p => p.tags.down === '2'],
      ['3rd Down', p => p.tags.down === '3'],
      ['4th Down', p => p.tags.down === '4'],
      // Exactly `_distBucket`'s Short and Long thresholds, so exactly its wording.
      [`3rd & ${StatsEngine.DIST_LABELS.Short}`, p => p.tags.down === '3' && (parseInt(p.tags.distance, 10) || 0) >= 1 && (parseInt(p.tags.distance, 10) || 0) <= 3],
      [`3rd & ${StatsEngine.DIST_LABELS.Long}`, p => p.tags.down === '3' && (parseInt(p.tags.distance, 10) || 0) >= 7],
      // Defensive snaps: the opponent offense attacks OUR goal, so these read
      // the defensive bands, not the offense-oriented `>= 80` / `>= 95`.
      ['Red Zone', p => this._inRedZone(p)],
      ['Goal Line', p => this._onGoalLine(p)],
    ];
    const situations = situationSpecs.map(([name, predicate]) => summarize(name, source.filter(predicate)))
      .filter(row => row.n > 0);
    const defensive = this._defensiveStats(source);
    const thirdDown = source.filter(p => p.tags.down === '3');
    const redZoneDrives = this._reconstructDrives(source).filter(drive =>
      drive.some(p => this._inRedZone(p)));
    const redZoneTouchdowns = redZoneDrives.filter(drive =>
      drive.some(StatsEngine.isTouchdownAllowed)).length;
    return {
      total: source.length,
      summary: summarize('All Defensive Snaps', source),
      takeaways: defensive.turnovers,
      thirdDownStopRate: thirdDown.length
        ? +(thirdDown.filter(p => !StatsEngine.isOpponentSuccess(p)).length / thirdDown.length * 100).toFixed(1) : null,
      redZoneTdRate: redZoneDrives.length
        ? +(redZoneTouchdowns / redZoneDrives.length * 100).toFixed(1) : null,
      playTypes, answers, byGame, situations,
    };
  }

  /**
   * Fixed-schema Reports > Defense model. Defensive snaps describe the
   * opponent offense, so every production figure below is yards/results the
   * opponent produced against us. Presentation receives finished rows and
   * exact film refs; it does not derive football values.
   */
  defenseDashboard(plays, gameLabels = {}) {
    const all = plays || [];
    const source = all.filter(p => p?.tags?.unit === 'defense' && StatsEngine._tryPenaltyResolved(p));
    const yard = p => parseInt(p?.tags?.yardage, 10) || 0;
    const compareText = (a, b) => a < b ? -1 : a > b ? 1 : 0;
    const refsOf = cohort => [...new Set((cohort || []).map(StatsEngine._compositeRef).filter(Boolean))].sort();
    const summarize = (name, cohort) => {
      const rows = cohort || [];
      if (!rows.length) return { name, n: null, charted: null, measured: null, held: true,
        runs: 0, passes: 0,
        yards: null, runYards: null, passYards: null, ypp: null,
        explosives: null, touchdowns: null, turnovers: null, refs: [], plays: [] };
      const runs = rows.filter(StatsEngine.isRun);
      const passes = rows.filter(StatsEngine.isPass);
      /* Total yards is the sum of the two columns beside it. All three come
       * from the same classified run/pass cohort; penalty-only yardage is not
       * yards allowed. Runs and passes are unioned, not added, so a snap
       * tagged both counts once. `ypp` divides by that same cohort.
       *
       * Two cohorts, both named, neither standing in for the other:
       *   `charted`  every defensive snap here. Frequency: the displayed Snaps
       *              count, every ranking, every call or blitz percentage.
       *              `n` is its alias.
       *   `measured` the run/pass-classified subset. Production: total, rush
       *              and pass yards, yards per play, explosives.
       *
       * With `measured === 0` every production field is null and renders a
       * dash; a charted look with nothing measured is not a zero. Coach
       * rulings 2026-09-10 and 2026-09-11. */
      const scrimmage = [...new Set([...runs, ...passes])];
      const measured = scrimmage.length;
      const yards = measured ? scrimmage.reduce((sum, p) => sum + yard(p), 0) : null;
      const turnovers = rows.reduce((sum, p) => sum
        + (StatsEngine.hasResult(p, 'Interception') ? 1 : 0)
        + (StatsEngine.isFumbleRecovered(p) ? 1 : 0), 0);
      return {
        name, n: rows.length, charted: rows.length, measured,
        runs: runs.length, passes: passes.length, yards,
        runYards: measured ? scrimmage.filter(StatsEngine.isRushingAttempt).reduce((sum, p) => sum + yard(p), 0) : null,
        passYards: measured ? passes.filter(p => !StatsEngine.hasResult(p, 'Sack')).reduce((sum, p) => sum + yard(p), 0) : null,
        ypp: measured ? +(yards / measured).toFixed(1) : null,
        explosives: measured ? rows.filter(StatsEngine.isExplosive).length : null,
        touchdowns: rows.filter(p => StatsEngine.hasResult(p, 'Touchdown') && StatsEngine.scoringSide(p) !== 'us').length,
        turnovers, refs: refsOf(rows), plays: rows,
      };
    };
    const grouped = (cohort, keyFn) => {
      const map = new Map();
      (cohort || []).forEach(play => {
        let keys = keyFn(play);
        if (!Array.isArray(keys)) keys = [keys];
        keys.filter(Boolean).forEach(key => {
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(play);
        });
      });
      return [...map.entries()].map(([name, rows]) => summarize(name, rows));
    };
    const ranked = rows => rows.sort((a, b) => b.n - a.n || compareText(a.name, b.name));
    const byGame = ranked(grouped(source, p => String(p.__gid ?? 'current')))
      .map(row => ({ ...row, gameId: row.name, name: gameLabels[row.name] || row.name }))
      .sort((a, b) => {
        const ai = a.plays[0]?.__seasonGameIdx ?? 0;
        const bi = b.plays[0]?.__seasonGameIdx ?? 0;
        return ai - bi || a.name.localeCompare(b.name, undefined, { numeric: true });
      });
    const recentIds = new Set(byGame.slice(-3).map(row => row.gameId));
    const recent = summarize('Last 3', source.filter(p => recentIds.has(String(p.__gid ?? 'current'))));
    const summary = summarize('Season', source);
    const rateAllowed = (cohort, down) => {
      const rows = cohort.filter(p => p.tags.down === down);
      const allowed = rows.filter(StatsEngine.isConversionAllowed).length;
      return { made: allowed, attempts: rows.length, rate: rows.length ? +(allowed / rows.length * 100).toFixed(1) : null };
    };
    const downRows = ['1', '2', '3', '4'].map(down => summarize(
      `${down}${down === '1' ? 'st' : down === '2' ? 'nd' : down === '3' ? 'rd' : 'th'} Down`,
      source.filter(p => p.tags.down === down)));
    const quarterRows = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => {
      const row = summarize(q, source.filter(p => p.tags.quarter === q));
      return { ...row, vsAverage: row.ypp == null || summary.ypp == null ? null : +(row.ypp - summary.ypp).toFixed(1) };
    });
    const detailOrder = ['Run Outside', 'Run Inside', 'RPO', 'Short Pass', 'Medium Pass', 'Deep Pass', 'Screen'];
    const playTypes = detailOrder.map(name => summarize(name,
      source.filter(p => StatsEngine.splitPlayTypes(p.tags.playType).includes(name))));
    // A coach reads the offensive look as one structure, even though the tag
    // model stores QB alignment, backfield, formation and receiver set
    // separately. Preserve that combination so a receiver set does not dissolve
    // into an unhelpful standalone row.
    const offensiveLook = play => {
      const projected = StatsEngine.proj(play);
      const qb = String(projected.qbAlignment || '').trim();
      const backfield = String(projected.backfield || '').trim();
      const formations = [String(projected.formationFamily || '').trim(), String(projected.receiverSet || '').trim()].filter(Boolean);
      const underCenterBackfield = qb === 'Under Center' ? {
        I: 'I-Form', Power: 'Power-I', Single: 'Singleback', Split: 'Split Back',
      }[backfield] : null;
      const base = underCenterBackfield
        ? [underCenterBackfield]
        : [qb, backfield].filter(Boolean);
      return [...new Set([...base, ...formations])].join(' + ');
    };
    const exactPlayCall = play => {
      const raw = String(play?.tags?.playType || '').trim();
      if (!raw) return '';
      return [...new Set(StatsEngine.splitPlayTypes(raw))].sort(compareText).join(' + ');
    };
    const formationCalls = ranked(grouped(source.filter(p => exactPlayCall(p)), offensiveLook))
      .map(row => {
        const calls = ranked(grouped(row.plays, exactPlayCall));
        return {
          ...row,
          playTypes: detailOrder.map(name => {
            const cohort = row.plays.filter(play => StatsEngine.splitPlayTypes(play.tags.playType).includes(name));
            return { name, n: cohort.length, pct: row.n ? Math.round(cohort.length / row.n * 100) : null,
              refs: refsOf(cohort) };
          }),
        };
      });
    const personnel = ranked(grouped(source, p => String(p.tags.personnel || '').trim()));
    const backfields = ranked(grouped(source, p => StatsEngine.proj(p).backfield || ''));
    const directions = ['Left', 'Middle', 'Right'].map(name => ({ ...summarize(name,
      source.filter(p => p.tags.playDir === name)), isRelative: false }));
    const relativeDirection = play => {
      const direction = String(play.tags.playDir || '').trim();
      const strength = ChartingDetails.strengthSide(StatsEngine.proj(play).strength);
      if (!['Left', 'Right'].includes(direction) || !['Left', 'Right'].includes(strength)) return '';
      return direction === strength ? 'Toward Strength' : 'Away from Strength';
    };
    directions.push(...['Toward Strength', 'Away from Strength'].map(name => ({ ...summarize(name,
      source.filter(play => relativeDirection(play) === name)), isRelative: true })));

    // Opponent possessions: outcomes attributed by scoring side through the one
    // shared owner, so the export and the Revision 2 board agree exactly.
    const driveList = this.opponentDriveList(source, { all });
    const driveStats = { list: driveList, total: driveList.length };
    const driveGroups = [
      ['Touchdown', ['TD']], ['Field Goal', ['FG']], ['Missed FG', ['Missed FG']],
      ['Punt', ['Punt']], ['Turnover', ['Turnover']], ['Downs', ['Downs']],
      ['Other / unresolved', ['Other', 'Safety', 'Kneel']],
    ];
    const driveOutcomes = driveGroups.map(([name, outcomes]) => {
      const rows = driveStats.list.filter(drive => outcomes.includes(drive.outcome));
      const refs = [...new Set(rows.flatMap(drive => drive.refs || []))].sort();
      return { name, n: rows.length, pct: driveStats.total ? Math.round(rows.length / driveStats.total * 100) : null,
        avgPlays: rows.length ? +(rows.reduce((sum, drive) => sum + drive.plays, 0) / rows.length).toFixed(1) : null,
        avgYards: rows.length ? +(rows.reduce((sum, drive) => sum + drive.yards, 0) / rows.length).toFixed(1) : null,
        refs };
    });

    // A call result needs a classified offensive snap. Front/coverage tags on
    // an administrative or otherwise unclassified row do not describe what
    // the call defended and cannot enter a performance ranking.
    const classified = source.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    const callRows = this._defenseCallRows(classified).map(row => ({
      name: row.key.replaceAll(' · ', ' | '), n: row.n, yards: row.yards,
      ypp: row.avgYds, explosives: row.explosives, touchdowns: row.tds,
      refs: row.refs, vsAverage: summary.ypp == null ? null : +(row.avgYds - summary.ypp).toFixed(1),
    }));
    const qualifiedCalls = callRows.filter(row => row.n >= 4);
    const topCalls = qualifiedCalls.slice().sort((a, b) => a.ypp - b.ypp || b.n - a.n || compareText(a.name, b.name));
    const worstCalls = qualifiedCalls.slice().sort((a, b) => b.ypp - a.ypp || a.n - b.n || compareText(a.name, b.name));
    const pressure = (name, cohort) => summarize(name, cohort);
    const blitz = pressure('Blitz', source.filter(p => String(p.tags.blitz || '').trim()));
    const noBlitz = pressure('No Blitz', source.filter(StatsEngine.isNoBlitz));
    const pressureKeys = ['1|Long', '2|Long', '3|Long', '2|Medium', '4|Long', '4|Short'];
    const pressureSituations = pressureKeys.map(key => {
      const rows = source.filter(p => this._ddKey(p.tags) === key);
      const blitzRows = rows.filter(p => String(p.tags.blitz || '').trim());
      const baseRows = rows.filter(StatsEngine.isNoBlitz);
      const pressureRows = [...blitzRows, ...baseRows];
      return { key, name: this._ddPretty(key),
        n: rows.length, blitzPct: pressureRows.length ? Math.round(blitzRows.length / pressureRows.length * 100) : null,
        blitzYpp: summarize('', blitzRows).ypp, baseYpp: summarize('', baseRows).ypp, refs: refsOf(rows) };
    });

    const distanceOrder = ['Short', 'Medium', 'Long'];
    const ddRows = ['1', '2', '3', '4'].flatMap(down => distanceOrder.map(bucket => {
      const key = `${down}|${bucket}`;
      const rows = source.filter(p => this._ddKey(p.tags) === key);
      const row = summarize(this._ddPretty(key), rows);
      // Frequency answers "what did we call here?" and therefore includes a
      // charted call even when play type is absent. Performance rankings above
      // require classification; situational call share does not.
      const calls = this._defenseCallRows(rows).sort((a, b) => b.n - a.n || compareText(a.key, b.key));
      const top = calls[0] || null;
      const chartedCallN = calls.reduce((sum, call) => sum + call.n, 0);
      const blitzN = rows.filter(p => String(p.tags.blitz || '').trim()).length;
      const noBlitzN = rows.filter(StatsEngine.isNoBlitz).length;
      return { ...row, topCall: top ? top.key.replaceAll(' · ', ' | ') : null,
        callPct: top && chartedCallN ? Math.round(top.n / chartedCallN * 100) : null,
        blitzPct: blitzN + noBlitzN ? Math.round(blitzN / (blitzN + noBlitzN) * 100) : null };
    }));
    // The board has five fixed slots. Preserve them by combining the two
    // neutral-territory canonical buckets; every boundary still comes from the
    // canonical bucketers, here the DEFENSIVE one, because these are defensive
    // snaps and the opponent offense attacks our goal line.
    const zoneSpecs = [
      ['Backed Up', ['Backed up']],
      ['Open Field', ['Own 11–39', 'Midfield']],
      ['Opp 40–20', ['Opp 40–20']],
      ['Red Zone', ['Red zone']],
      ['Goal Line', ['Goal line']],
    ];
    const zones = zoneSpecs.map(([name, buckets]) => summarize(name,
      source.filter(p => buckets.includes(this._defensiveFieldZone(p.tags)))));
    const hashes = ['Left', 'Middle', 'Right'].map(name => summarize(name, source.filter(p => p.tags.hash === name)));
    const motionNames = ranked(grouped(source, p => p.tags.motion || 'No Motion'));

    return {
      /* `total` is the charted defensive sample; `measured` is the run/pass
       * subset every production value on this board is computed over. The board
       * states both, because a coach reading 3.2 yards allowed per play is
       * entitled to know the denominator is 37 of 40 charted snaps. */
      total: source.length, measured: summary.measured ?? 0, summary, recent,
      thirdDownAllowed: rateAllowed(source, '3'), fourthDownAllowed: rateAllowed(source, '4'),
      recentThirdDownAllowed: rateAllowed(recent.plays, '3'), recentFourthDownAllowed: rateAllowed(recent.plays, '4'),
      byGame, downs: downRows, quarters: quarterRows, playTypes,
      formationCalls, formationPlayTypes: detailOrder, personnel, backfields, directions,
      driveOutcomes,
      topCalls: topCalls.slice(0, 4), worstCalls: worstCalls.slice(0, 4),
      pressure: { blitz, noBlitz }, pressureSituations,
      downDistance: ddRows, zones, hashes, motions: motionNames,
    };
  }

  /**
   * REPORTS > DEFENSE, REVISION 2. The one owner of every value the Revision 2
   * board prints. It is built on `defenseDashboard()` and never changes a value
   * that method returns: the export and every existing Defense contract still
   * read the dashboard directly.
   *
   * `plays` is the scoped cohort (the current game, or the full season).
   * `seasonPlays` is the full season cohort, which the Current game scope
   * compares against; at Full season scope the comparison is the last three
   * games. `labels` maps a game id to its OPPONENT name, and `roster` maps a
   * jersey number to a player name.
   *
   * Every rate is returned unrounded as a 0-100 number, or null when its
   * denominator is empty. Presentation formats; it never derives.
   *
   * TOUCHDOWNS HAVE TWO SIDES. `Touchdowns Allowed` counts a defensive-snap
   * touchdown whose scoring side is `them`; `Defensive Touchdowns` counts one
   * whose scoring side is `us`. Neither is inferred from the other, from a
   * takeaway, or from the snap's unit alone. The dashboard's own `touchdowns`
   * field counts every side that is not `us`, so this board does not read it.
   */
  defenseBoard(plays, { labels = {}, seasonPlays = null, roster = {}, scope = 'season' } = {}) {
    const S = StatsEngine;
    const all = plays || [];
    const seasonAll = seasonPlays || all;
    const isDefense = p => p?.tags?.unit === 'defense' && S._tryPenaltyResolved(p);
    const d = this.defenseDashboard(all, labels);
    const ps = all.filter(isDefense);
    const yard = p => parseInt(p?.tags?.yardage, 10) || 0;
    const rate = (n, den) => den ? n / den * 100 : null;
    const classified = rows => [...new Set([...rows.filter(S.isRun), ...rows.filter(S.isPass)])];
    // The dashboard's own yards-per-play rule: classified yardage over the
    // classified cohort, one decimal, null with nothing classified.
    const ypp = rows => {
      const measured = classified((rows || []).filter(isDefense));
      return measured.length ? +(measured.reduce((sum, p) => sum + yard(p), 0) / measured.length).toFixed(1) : null;
    };
    const touchdownsFor = side => rows => rows.filter(p => S.hasResult(p, 'Touchdown') && S.scoringSide(p) === side).length;
    const touchdownsAllowed = touchdownsFor('them');
    const defensiveTouchdowns = touchdownsFor('us');
    const summarize = rows => {
      const measured = rows.filter(p => S.isRun(p) || S.isPass(p));
      const runs = rows.filter(S.isRun);
      const passes = rows.filter(S.isPass);
      return {
        n: rows.length, measured: measured.length, runs: runs.length, passes: passes.length,
        ypp: ypp(measured), rushYpp: ypp(runs), passYpp: ypp(passes),
        success: rate(measured.filter(p => this._isSuccessfulPlay(p)).length, measured.length),
        // Nothing classified means nothing measured: no explosive count at all.
        explosives: measured.length ? measured.filter(S.isExplosive).length : null,
        touchdownsAllowed: touchdownsAllowed(rows), refs: S._refsOf(rows),
      };
    };
    const grouped = (rows, keyFn) => {
      const map = new Map();
      rows.forEach(play => {
        const keys = keyFn(play);
        for (const key of Array.isArray(keys) ? keys : [keys]) {
          if (!key) continue;
          if (!map.has(key)) map.set(key, []);
          map.get(key).push(play);
        }
      });
      return [...map].map(([name, cohort]) => ({ name, plays: cohort, ...summarize(cohort) }))
        .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    };
    const disruption = rows => {
      const sacks = rows.filter(p => S.hasResult(p, 'Sack'));
      // RUN TFL: a negative-yardage pass is not a run stopped behind the line.
      const tfl = rows.filter(p => S.isRun(p) && S.isTackleForLoss(p));
      const interceptions = rows.filter(p => S.hasResult(p, 'Interception'));
      const recoveries = rows.filter(S.isFumbleRecovered);
      // A play carrying two events is ONE disruptive play.
      return { sacks, tfl, interceptions, recoveries,
        distinct: [...new Set([...sacks, ...tfl, ...interceptions, ...recoveries])] };
    };
    /* PASSING. An attempt needs a charted pass result; a sack is never an
       attempt and never enters yards per attempt. */
    const passing = rows => {
      const dropbacks = rows.filter(S.isPass);
      const has = (p, value) => S.hasResult(p, value);
      const attempts = dropbacks.filter(p => !has(p, 'Sack') && S.isPassAttemptResult(p));
      const completions = attempts.filter(p => !has(p, 'Interception') && !has(p, 'Incomplete')
        && S.isCompletionResult(p));
      const passYards = attempts.filter(p => !has(p, 'Incomplete') && !has(p, 'Interception'))
        .reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0);
      return { dropbacks: dropbacks.length, attempts: attempts.length, completions: completions.length,
        completionRate: rate(completions.length, attempts.length),
        yardsPerAttempt: attempts.length ? passYards / attempts.length : null,
        sacks: dropbacks.filter(p => has(p, 'Sack')).length,
        interceptions: attempts.filter(p => has(p, 'Interception')).length, refs: S._refsOf(dropbacks) };
    };
    const stop = allowed => allowed == null ? null : +(100 - allowed).toFixed(1);

    /* COMPARISON COHORT. Full season compares with the last three games; the
       current game compares with the whole season. */
    const seasonDefense = seasonAll.filter(isDefense);
    let compare;
    if (scope === 'season') {
      const recentIds = new Set(this.defenseDashboard(seasonAll, labels).byGame.slice(-3).map(row => row.gameId));
      compare = seasonDefense.filter(p => recentIds.has(String(p.__gid ?? 'current')));
    } else compare = seasonDefense;
    const cd = this.defenseDashboard(compare);
    const dis = disruption(ps);
    const cdis = disruption(compare);
    const passOverview = passing(ps);

    const kpis = {
      yards: d.summary.yards, runYards: d.summary.runYards, passYards: d.summary.passYards,
      ypp: d.summary.ypp, takeaways: d.summary.turnovers, explosives: d.summary.explosives,
      touchdownsAllowed: touchdownsAllowed(ps), defensiveTouchdowns: defensiveTouchdowns(ps),
      thirdDownStop: stop(d.thirdDownAllowed.rate), fourthDownStop: stop(d.fourthDownAllowed.rate),
    };

    const byGame = d.byGame.map(row => ({ name: row.name, yards: row.yards, runYards: row.runYards,
      passYards: row.passYards, ypp: row.ypp, explosives: row.explosives, takeaways: row.turnovers,
      touchdownsAllowed: touchdownsAllowed(row.plays), refs: row.refs }));

    const passSnaps = ps.filter(S.isPass), runSnaps = ps.filter(S.isRun);
    const disruptionRows = [
      ['Sacks', dis.sacks, passSnaps.length],
      ['Run TFL', dis.tfl, runSnaps.length],
      ['Interceptions', dis.interceptions, passSnaps.length],
      ['Fumbles recovered', dis.recoveries, ps.length],
      ['Distinct disruptive plays', dis.distinct, ps.length],
    ].map(([name, events, eligible]) => ({ name, plays: events.length, rate: rate(events.length, eligible),
      eligible, refs: S._refsOf(events) }));

    const comparison = [
      { name: 'Yards / play', kind: 'number', current: d.summary.ypp, comparison: cd.summary.ypp },
      { name: 'Explosive Plays Rate', kind: 'percent', current: rate(d.summary.explosives, d.summary.measured),
        comparison: rate(cd.summary.explosives, cd.summary.measured) },
      { name: 'Disruption rate', kind: 'percent', current: rate(dis.distinct.length, ps.length),
        comparison: rate(cdis.distinct.length, compare.length) },
      { name: '3rd Down Stop %', kind: 'percent', current: stop(d.thirdDownAllowed.rate), comparison: stop(cd.thirdDownAllowed.rate) },
      { name: '4th Down Stop %', kind: 'percent', current: stop(d.fourthDownAllowed.rate), comparison: stop(cd.fourthDownAllowed.rate) },
      { name: 'Pass completion rate', kind: 'percent', current: passOverview.completionRate, comparison: passing(compare).completionRate },
    ];

    const downs = d.downs.map(row => ({ name: row.name, yards: row.yards, ypp: row.ypp, explosives: row.explosives, refs: row.refs }));
    const quarters = d.quarters.map(row => ({ name: row.name, yards: row.yards, ypp: row.ypp, vsAverage: row.vsAverage,
      touchdownsAllowed: row.n ? touchdownsAllowed(row.plays) : null, refs: row.refs }));

    /* DRIVE OUTCOMES ARE DATA-DRIVEN. Every outcome the reconstruction produced
       gets its own row in football order; an outcome it could not settle stays
       `Other / unresolved`, and an outcome with no drives is not rendered. */
    const DRIVE_OUTCOMES = [['TD', 'Touchdown'], ['FG', 'Field Goal'], ['Missed FG', 'Missed Field Goal'],
      ['Punt', 'Punt'], ['Turnover', 'Turnover'], ['Downs', 'Downs'], ['Safety', 'Safety'],
      ['Kneel', 'Kneel'], ['Other', 'Other / unresolved']];
    const outcomeName = outcome => DRIVE_OUTCOMES.find(([key]) => key === outcome)?.[1] || outcome;
    // Scoring-side attribution belongs to `opponentDriveList`, the one owner the
    // export reads too, so the board and the printed report cannot disagree.
    const driveList = this.opponentDriveList(ps, { all });
    const driveStats = { list: driveList, total: driveList.length };
    const outcomeKeys = [...DRIVE_OUTCOMES.map(([key]) => key),
      ...[...new Set(driveStats.list.map(drive => drive.outcome))].filter(key => !DRIVE_OUTCOMES.some(([k]) => k === key))];
    const driveOutcomes = outcomeKeys.map(key => {
      const drives = driveStats.list.filter(drive => drive.outcome === key);
      return { name: outcomeName(key), n: drives.length,
        share: driveStats.total ? Math.round(drives.length / driveStats.total * 100) : null,
        avgPlays: drives.length ? +(drives.reduce((sum, drive) => sum + drive.plays, 0) / drives.length).toFixed(1) : null,
        avgYards: drives.length ? +(drives.reduce((sum, drive) => sum + drive.yards, 0) / drives.length).toFixed(1) : null,
        refs: [...new Set(drives.flatMap(drive => drive.refs || []))].sort() };
    }).filter(row => row.n);

    /* EVERY RECONSTRUCTED POSSESSION, per game so no drive spans two games.
       `yards` is the drive's tagged yardage, penalties included, which is not
       the classified production total; `lastSnap` is where the last charted
       snap began, not the final ball spot; points exclude tries. */
    const spot = value => value == null ? null : value <= 50 ? `Own ${value}` : `Opp ${100 - value}`;
    const gameOrder = [...new Map(all.map(p => [String(p.__gid ?? 'current'), p.__seasonGameIdx ?? 0])).entries()]
      .sort((a, b) => a[1] - b[1]);
    const possessions = gameOrder.flatMap(([gid]) => {
      const gameAll = all.filter(p => String(p.__gid ?? 'current') === gid);
      const gameDefense = gameAll.filter(isDefense);
      const gameDrives = this._reconstructDrives(gameDefense);
      return this.opponentDriveList(gameDefense, { all: gameAll }).map((drive, idx) => {
        const last = gameDrives[idx]?.at(-1);
        return { opponent: labels[gid] || gid, name: `Drive ${drive.number}`, start: spot(drive.startYL),
          lastSnap: spot(last ? this._absYardLine(last.tags) : null), plays: drive.plays, yards: drive.yards,
          outcome: drive.outcome === 'Other' ? 'Unresolved' : outcomeName(drive.outcome),
          points: drive.points, refs: drive.refs || [] };
      });
    });

    const players = this._individualStats(ps).tacklers.map(row => ({
      name: `#${row.num} ${roster[String(row.num)] || ''}`.trim(), num: row.num,
      tackles: row.tackles, solo: row.solo, assists: row.assists, sacks: row.sacks, tfl: row.tfl,
      interceptions: row.ints, fumblesRecovered: row.fumblesRec,
      grade: row.gradeCount ? row.gradeSum / row.gradeCount : null, refs: row.refs }));

    const playTypes = d.playTypes.filter(row => row.n).map(row => ({ name: row.name, n: row.n, yards: row.yards,
      ypp: row.ypp, explosives: row.explosives, touchdownsAllowed: touchdownsAllowed(row.plays), refs: row.refs }));

    const absolute = d.directions.filter(row => !row.isRelative && row.n);
    const absoluteTotal = absolute.reduce((sum, row) => sum + row.n, 0);
    const directions = absolute.map(row => ({ name: row.name, n: row.n, share: rate(row.n, absoluteTotal),
      runs: row.runs, passes: row.passes, yards: row.yards, ypp: row.ypp,
      success: summarize(row.plays).success, explosives: row.explosives, refs: row.refs }));

    const formationTotal = d.formationCalls.reduce((sum, row) => sum + row.n, 0);
    const formations = d.formationCalls.slice(0, 10).map(row => {
      const measured = summarize(row.plays);
      return { name: row.name, n: row.n, share: rate(row.n, formationTotal), runs: row.runs, passes: row.passes,
        rushYpp: measured.rushYpp, passYpp: measured.passYpp, success: measured.success,
        explosives: row.explosives, refs: row.refs };
    });
    const tendency = row => ({ name: row.name, n: row.n, runs: row.runs, passes: row.passes,
      ypp: row.ypp, explosives: row.explosives, refs: row.refs });

    /* STRENGTH. A relationship needs a charted direction AND a charted
       strength; missing either is excluded, never inferred. */
    const sided = ps.filter(p => ['Left', 'Right'].includes(p.tags.playDir) && !!ChartingDetails.strengthSide(S.proj(p).strength));
    const balanced = ps.filter(p => S.proj(p).strength === 'Balanced' && String(p.tags.playDir || '').trim());
    const strengthEligible = [...sided, ...balanced];
    const eligibleRuns = strengthEligible.filter(S.isRun).length;
    const eligiblePasses = strengthEligible.filter(S.isPass).length;
    const strength = [
      ['Toward strength', sided.filter(p => p.tags.playDir === ChartingDetails.strengthSide(S.proj(p).strength))],
      ['Away from strength', sided.filter(p => p.tags.playDir !== ChartingDetails.strengthSide(S.proj(p).strength))],
      ['Balanced strength', balanced],
    ].map(([name, cohort]) => {
      const row = summarize(cohort);
      return { name, n: row.n, share: rate(row.n, strengthEligible.length), runs: row.runs,
        runRate: rate(row.runs, eligibleRuns), rushYpp: row.rushYpp, passes: row.passes,
        passRate: rate(row.passes, eligiblePasses), passYpp: row.passYpp, success: row.success,
        explosives: row.explosives, refs: row.refs };
    });

    const answers = [];
    for (const look of d.formationCalls) {
      const charted = look.plays.filter(p => S._defenseCallKey(p)).length;
      for (const call of grouped(look.plays, p => S._defenseCallKey(p))) {
        answers.push({ look: look.name, call: call.name, n: call.n, share: rate(call.n, charted),
          rushYpp: call.rushYpp, passYpp: call.passYpp, explosives: call.explosives, success: call.success, refs: call.refs });
      }
    }
    answers.sort((a, b) => b.n - a.n);

    const callKeys = rows => rows.map(row => row.name).sort().join('|');
    const callRow = row => ({ name: row.name, n: row.n, yards: row.yards, ypp: row.ypp,
      vsAverage: row.vsAverage, explosives: row.explosives, refs: row.refs });
    const calls = { combined: callKeys(d.topCalls) === callKeys(d.worstCalls),
      top: d.topCalls.map(callRow), worst: d.worstCalls.map(callRow) };

    const blitzed = p => !!String(p.tags.blitz || '').trim();
    const blitzCohorts = [
      ['Blitz vs Run', ps.filter(p => blitzed(p) && S.isRun(p))],
      ['No Blitz vs Run', ps.filter(p => S.isNoBlitz(p) && S.isRun(p))],
      ['Blitz vs Pass', ps.filter(p => blitzed(p) && S.isPass(p))],
      ['No Blitz vs Pass', ps.filter(p => S.isNoBlitz(p) && S.isPass(p))],
    ];
    const blitzTotal = blitzCohorts.reduce((sum, [, rows]) => sum + rows.length, 0);
    const blitz = blitzCohorts.map(([name, rows]) => {
      const row = summarize(rows), pass = passing(rows);
      return { name, n: row.n, share: rate(row.n, blitzTotal), ypp: row.ypp, success: row.success,
        explosives: row.explosives, completions: name.endsWith('Pass') && pass.attempts ? pass.completions : null,
        attempts: name.endsWith('Pass') && pass.attempts ? pass.attempts : null,
        sacks: pass.sacks, interceptions: pass.interceptions, refs: row.refs };
    });

    const pressure = d.pressureSituations.filter(row => row.n).map(row => ({ name: row.name, n: row.n,
      blitzPct: row.blitzPct, blitzYpp: row.blitzYpp, baseYpp: row.baseYpp, refs: row.refs }));

    const structure = row => ({ name: row.name, n: row.n, rushYpp: row.rushYpp, passYpp: row.passYpp,
      success: row.success, explosives: row.explosives, refs: row.refs });
    const fronts = grouped(ps, p => S.splitFormations(S.proj(p).defFront)).map(structure);
    const coverages = grouped(ps, p => S.proj(p).coverage).map(structure);
    const blitzTypeRows = grouped(ps, p => S.splitFormations(p.tags.blitz));
    const blitzTypes = ['A-Gap', 'B-Gap', 'C-Gap', 'D-Gap'].map(name => {
      const row = blitzTypeRows.find(item => item.name === name);
      return row ? structure(row) : { name, n: null, rushYpp: null, passYpp: null, success: null, explosives: null, refs: [] };
    });
    const passingByCoverage = grouped(ps, p => S.proj(p).coverage).map(row => ({ name: row.name, ...passing(row.plays) }));

    const scopedCalls = grouped(ps, p => S._defenseCallKey(p));
    const comparisonCalls = grouped(compare, p => S._defenseCallKey(p));
    const scopedCallTotal = scopedCalls.reduce((sum, row) => sum + row.n, 0);
    const comparisonCallTotal = comparisonCalls.reduce((sum, row) => sum + row.n, 0);
    const callTrends = scopedCalls.map(row => {
      const other = comparisonCalls.find(item => item.name === row.name);
      return { name: row.name, share: rate(row.n, scopedCallTotal), comparisonShare: rate(other?.n || 0, comparisonCallTotal),
        ypp: row.ypp, comparisonYpp: other?.ypp ?? null, refs: row.refs };
    });

    const ddKeys = ['1', '2', '3', '4'].flatMap(down => ['Short', 'Medium', 'Long'].map(bucket => `${down}|${bucket}`));
    const downDistance = d.downDistance.map((row, index) => ({ row, key: ddKeys[index] })).filter(({ row }) => row.n)
      .map(({ row, key }) => {
        const cohort = ps.filter(p => this._ddKey(p.tags) === key);
        const firstDowns = cohort.filter(S.isConversionAllowed).length;
        return { name: row.name, n: row.n, runs: row.runs, passes: row.passes, yards: row.yards, ypp: row.ypp,
          firstDowns, allowedPct: rate(firstDowns, cohort.length), topCall: row.topCall, blitzPct: row.blitzPct, refs: row.refs };
      });

    /* HIGH-LEVERAGE FIELD POSITION, FROM OUR GOAL, through the defensive band
       owner: inside our 20 is the red-zone and goal-line bands (1-20), the goal
       line 1-5, and the opponent is backed up at 90-100. Red-zone possessions
       depend on reconstructed drives and charted field position. */
    const inside20 = p => this._inRedZone(p);
    const redZoneDrives = this._reconstructDrives(ps).filter(drive => drive.some(inside20));
    const redZoneTouchdowns = redZoneDrives.filter(drive => touchdownsAllowed(drive) > 0).length;
    const inside = ps.filter(inside20);
    const goalLine = ps.filter(p => this._onGoalLine(p));
    const backedUp = ps.filter(p => this._defensiveFieldZone(p.tags) === 'Backed up');
    const highLeverage = [
      { name: 'Red-zone possessions', sample: redZoneDrives.length, ypp: null, touchdownsAllowed: redZoneTouchdowns,
        refs: S._refsOf(redZoneDrives.flat()) },
      { name: 'Red-zone Touchdown Rate', sample: null, sampleRate: rate(redZoneTouchdowns, redZoneDrives.length),
        ypp: null, touchdownsAllowed: null, refs: [] },
      { name: 'Inside our 20 / snaps', sample: inside.length, ypp: ypp(inside), touchdownsAllowed: touchdownsAllowed(inside), refs: S._refsOf(inside) },
      { name: 'Goal line / snaps', sample: goalLine.length, ypp: ypp(goalLine), touchdownsAllowed: touchdownsAllowed(goalLine), refs: S._refsOf(goalLine) },
      { name: 'Opponent backed up / snaps', sample: backedUp.length, ypp: ypp(backedUp), touchdownsAllowed: touchdownsAllowed(backedUp), refs: S._refsOf(backedUp) },
    ];

    const zones = d.zones.filter(row => row.n).map(row => ({ name: row.name, n: row.n, yards: row.yards, ypp: row.ypp, explosives: row.explosives, refs: row.refs }));
    const hashes = d.hashes.filter(row => row.n).map(row => ({ name: row.name, n: row.n, yards: row.yards, ypp: row.ypp, refs: row.refs }));

    return {
      // The dashboard rides along unchanged because the Defense export reads it.
      dashboard: d,
      scope, total: d.total, measured: d.measured, kpis, byGame, disruption: disruptionRows, comparison,
      downs, quarters, driveOutcomes, players, possessions, playTypes, directions, formations,
      personnel: d.personnel.map(tendency), backfields: d.backfields.map(tendency), strength, answers,
      passingSummary: passOverview, calls, blitz, pressure, fronts, coverages, blitzTypes, passingByCoverage,
      callTrends, downDistance, highLeverage, zones, hashes, motions: d.motions.map(tendency),
      // The opponent's down-and-distance chart over this same scoped cohort.
      downDistanceChart: this.downDistanceChart(all, { side: 'defense' }),
    };
  }

  _countThreeAndOuts(plays) {
    // A three-and-out = the defense forced the offense to give the ball back in
    // three plays without a first down. We must NOT rely on the driveNumber
    // tag: it's only set when the coach clicks "New Drive", so a normally-tagged
    // game leaves every play on drive "1" — which made this always report 0.
    // Instead, reconstruct drives from the play sequence.
    const drives = this._reconstructDrives(plays);
    // Results that mean the possession ended some other way than a forced punt.
    const NON_PUNT = new Set(['Touchdown', 'Field Goal', 'Good', 'Interception',
      'Fumble', 'Kneel', 'Spike', 'Safety']);
    return drives.filter((dp, idx) => {
      if (dp.length > 3) return false;
      if (dp.some(p => StatsEngine.splitResults(p.tags.result).some(r => NON_PUNT.has(r)))) return false;
      if (dp.some(p => gainedFirstDown(p.tags))) return false;
      // The offense must actually have surrendered the ball: an explicit punt,
      // or another possession follows IN THE SAME GAME (so this one ended in
      // an untagged punt). Without this, a short drive cut off by the end of a
      // half/game — or a partially-tagged final drive — would be miscounted as
      // a three-and-out (in season roll-ups, the next game's first drive must
      // not vouch for the previous game's last one).
      const punted = StatsEngine.hasResult(dp[dp.length - 1], 'Punt');
      const next = drives[idx + 1];
      const possessionFollowed = !!next &&
        (next[0].__seasonGameIdx ?? 0) === (dp[0].__seasonGameIdx ?? 0);
      return punted || possessionFollowed;
    }).length;
  }

  /**
   * Split a list of plays into possessions (drives) without depending on the
   * manual driveNumber tag. A new drive begins after a possession-ending
   * result (punt/score/turnover), and at any 1st-down play that the previous
   * play did NOT earn (down reset to 1 ⇒ the ball changed hands off-camera).
   */
  _reconstructDrives(plays) {
    // Season roll-ups concatenate plays from several games whose video clocks
    // all start at 0 — sort by game first (SeasonManager._allPlays stamps
    // __seasonGameIdx) so a timestamp sort can't interleave games, and break
    // every drive at a game boundary. Single-game lists are unstamped (all 0).
    const gameOf = p => p.__seasonGameIdx ?? 0;
    const ordered = [...plays].sort((a, b) =>
      (gameOf(a) - gameOf(b)) ||
      (((a.timestamp && a.timestamp.start) ?? a.id ?? 0) -
        ((b.timestamp && b.timestamp.start) ?? b.id ?? 0)));
    const drives = [];
    let cur = [];
    ordered.forEach((p, i) => {
      const prev = i > 0 ? ordered[i - 1] : null;
      // A drive ends on a possession-ending result...
      const possessionEnded = prev && StatsEngine.splitResults(prev.tags.result).some(r => DRIVE_ENDERS.has(r));
      // ...or when the down resets to 1st without a first down being earned (the
      // ball changed hands off-camera). A penalty can legally reset the down
      // within the same drive, so it never starts a new possession on its own.
      const downReset = prev && p.tags.down === '1' &&
        !StatsEngine.hasResult(prev, 'Penalty') && !gainedFirstDown(prev.tags);
      const newGame = prev && gameOf(prev) !== gameOf(p);
      if ((possessionEnded || downReset || newGame) && cur.length) { drives.push(cur); cur = []; }
      cur.push(p);
    });
    if (cur.length) drives.push(cur);
    return drives;
  }

  _rushingStats(plays) {
    const rushPlays = plays.filter(StatsEngine.isRushingAttempt);
    const yards = rushPlays.reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0);
    const attempts = rushPlays.length;

    return {
      attempts,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      touchdowns: rushPlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length,
      fumbles: rushPlays.filter(p => StatsEngine.hasResult(p, 'Fumble')).length,
      longest: rushPlays.reduce((max, p) => Math.max(max, parseInt(p.tags.yardage) || 0), 0),
      firstDowns: rushPlays.filter(p => gainedFirstDown(p.tags)).length
    };
  }

  _passingStats(plays) {
    const dropbacks = plays.filter(p => StatsEngine.isPass(p));
    const passPlays = dropbacks.filter(p => !StatsEngine.hasResult(p, 'Sack'));
    const completions = passPlays.filter(p => StatsEngine.isCompletionResult(p));
    const yards = passPlays.reduce((sum, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return sum;
      return sum + (parseInt(p.tags.yardage) || 0);
    }, 0);
    // One qualifying play is one attempt, even with multiple outcomes.
    // Play IDs are game-local and must not deduplicate a season's attempts.
    const attempts = passPlays.filter(p => StatsEngine.isPassAttemptResult(p)).length;

    return {
      attempts,
      completions: completions.length,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      yardsPerCompletion: completions.length ? (yards / completions.length).toFixed(1) : '0.0',
      completionPct: attempts ? ((completions.length / attempts) * 100).toFixed(1) : '0.0',
      touchdowns: passPlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length,
      interceptions: passPlays.filter(p => StatsEngine.hasResult(p, 'Interception')).length,
      sacks: dropbacks.filter(p => StatsEngine.hasResult(p, 'Sack')).length,
      sackYards: dropbacks.filter(p => StatsEngine.hasResult(p, 'Sack'))
        .reduce((sum, p) => sum + Math.abs(parseInt(p.tags.yardage) || 0), 0),
      longest: passPlays.reduce((max, p) => {
        if (StatsEngine.hasResult(p, 'Incomplete')) return max;
        return Math.max(max, parseInt(p.tags.yardage) || 0);
      }, 0),
      firstDowns: passPlays.filter(p => gainedFirstDown(p.tags)).length
    };
  }

  _scoringStats(plays) {
    const tds = plays.filter(p => StatsEngine.hasResult(p, 'Touchdown'));
    return {
      touchdowns: tds.length,
      rushingTDs: tds.filter(p => StatsEngine.isRun(p)).length,
      passingTDs: tds.filter(p => StatsEngine.isPass(p)).length
    };
  }

  /** `${gameId}::${playId}` for a Study-stamped play, or null when the play
   *  cannot produce a composite ref (matches the fail-open convention every
   *  other composite-ref site in this file already uses). Shared by
   *  `_conversionStats`/`_specialTeamsStats`'s Phase-2 refs additions below. */
  static _compositeRef(play) {
    const gid = play?.__gid;
    return (gid != null && play?.id != null) ? `${gid}::${play.id}` : null;
  }
  /** Composite refs for an array of rows, deduped + sorted. `getPlay`
   *  extracts the play from a row shaped differently than a bare play
   *  (e.g. `_specialTeamsStats`'s structured `{p, st}` rows). */
  static _refsOf(rows, getPlay = row => row) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const ref = StatsEngine._compositeRef(getPlay(row));
      if (ref && !seen.has(ref)) { seen.add(ref); out.push(ref); }
    }
    return out.sort();
  }

  /**
   * PAT / 2-point conversion success, over the structured tries (Try and
   * Defending a Try) -- the only way a try is charted.
   */
  _conversionStats(source) {
    const structured = p => SpecialTeamsModel.normalize(p && p.specialTeams);
    const official = p => StatsEngine._tryPenaltyResolved(p);
    const made = (p, wanted) => {
      const event = structured(p);
      return !!event && official(p) && event.result === 'converted' && event.outcome.score === wanted;
    };
    const tally = (type) => {
      const wanted = type === 'XP' ? 'extraPoint' : 'twoPoint';
      const att = source.filter(p => {
        const event = structured(p);
        if (event?.unit === 'try' || event?.unit === 'tryDefense') {
          if (!official(p) || event.result === 'noPlay' || event.subjectRole !== 'attempting') return false;
          const officialType = event.result === 'converted' ? event.outcome.score : event.attemptType;
          return officialType === wanted;
        }
        return false;
      });
      const madePlays = att.filter(p => made(p, wanted));
      // `refs` are the exact plays behind `att` and `made`; `missed` is the
      // complement of `made` within `att`, so Watch on a missed row shows only
      // attempts that failed.
      return { att: att.length, made: madePlays.length, pct: att.length ? Math.round(madePlays.length / att.length * 100) : 0,
        refs: { att: StatsEngine._refsOf(att), made: StatsEngine._refsOf(madePlays), missed: StatsEngine._refsOf(att.filter(p => !made(p, wanted))) } };
    };
    const two = tally('2-Pt');
    const xp = tally('XP');
    return { two, xp, hasData: two.att > 0 || xp.att > 0 };
  }

  /**
   * The one Field Goal cohort and made test, used by both the team report
   * and the kicker rollup. An extra point is not a field goal; tries are
   * counted by `_conversionStats`. Coach, 2026-09-04: "A player cannot
   * receive an FG attempt that the unit does not recognize."
   */
  static isFieldGoalAttempt(play, structuredEvent) {
    const event = structuredEvent !== undefined
      ? structuredEvent : SpecialTeamsModel.normalize(play && play.specialTeams);
    return !!event && event.unit === 'fieldGoal' && event.attemptType === 'fieldGoal';
  }

  /** Made, over the cohort above. Same test both surfaces use. */
  static isFieldGoalMade(play, structuredEvent) {
    const event = structuredEvent !== undefined
      ? structuredEvent : SpecialTeamsModel.normalize(play && play.specialTeams);
    return !!event && event.outcome.status === 'good' && event.outcome.score === 'fieldGoal';
  }

  // Phase-aware special teams over the structured events: punts
  // (gross/net/hang/TB%), kickoffs (avg/TB%/return allowed), field goals
  // (made-att + by distance), tries, blocks and the return game.
  _specialTeamsStats(plays) {
    const structured = (plays || []).map(p => ({ p, st: SpecialTeamsModel.normalize(p?.specialTeams) })).filter(x => x.st);
    // Every leaf carries the refs of the rows that produced it. A rate or
    // mean's refs are its denominator set; a count's refs are the matching
    // plays. Fields sharing one denominator share one `refs.all` array.
    const getPlay = x => x.p;
    /**
     * The outcome distribution for a unit -- how its snaps actually ended,
     * counted over the SAME field the rates use (`outcome.status`). No new
     * classification: every label below is a value the model or the tag
     * vocabulary already defines, and a snap whose outcome was never charted
     * is its own honest row rather than being dropped or folded into another.
     * Counts are mutually exclusive and sum to the unit's snap count, which is
     * what makes the shares on the report add to 100%.
     */
    const OUTCOME_LABEL = {
      returned: 'Returned', touchback: 'Touchback', fairCatch: 'Fair catch',
      downed: 'Downed', outOfBounds: 'Out of bounds', blocked: 'Blocked',
      muffed: 'Muffed', recovered: 'Recovered', good: 'Good', noGood: 'No good',
      badSnap: 'Bad snap', touchdown: 'Touchdown', safety: 'Safety',
    };
    const OUTCOME_TONE = { blocked: 'bad', muffed: 'bad', noGood: 'bad', badSnap: 'bad',
      outOfBounds: 'bad', touchback: 'warn', recovered: 'warn' };
    const distribution = (arr, statusOf, playOf = row => row) => {
      const seen = new Map();
      arr.forEach(row => {
        const raw = statusOf(row);
        const key = raw || '__uncharted';
        if (!seen.has(key)) seen.set(key, []);
        seen.get(key).push(row);
      });
      return [...seen.entries()].map(([key, group]) => ({
        key,
        label: key === '__uncharted' ? 'No data' : (OUTCOME_LABEL[key] || key),
        n: group.length,
        tone: key === '__uncharted' ? 'blank' : (OUTCOME_TONE[key] || ''),
        refs: StatsEngine._refsOf(group, playOf),
      })).sort((a, b) => (a.key === '__uncharted') - (b.key === '__uncharted') || b.n - a.n);
    };
    {
      const rows = unit => structured.filter(x => x.st.unit === unit);
      // `avgStat` returns the mean and the exact rows it used: a row missing
      // its measurement (e.g. a punt with no hang time) is excluded from both,
      // so refs never claim more plays than the number was computed from.
      const avgStat = (arr, get) => {
        const eligible = arr.filter(x => Number.isFinite(get(x)));
        const value = eligible.length ? +(eligible.reduce((s, x) => s + get(x), 0) / eligible.length).toFixed(1) : null;
        return { value, refs: StatsEngine._refsOf(eligible, getPlay) };
      };
      const puntRows = rows('punt');
      const koRows = rows('kickoff');
      // A coverage unit's worst outcome: the return went the distance. Mirrors
      // the return units' own `td` (score touchdown credited to the SUBJECT);
      // here the subject is kicking, so the touchdown belongs to the opponent.
      const tdAllowedRows = arr => arr.filter(x => x.st.outcome.score === 'touchdown'
        && SpecialTeamsModel.scoringTeam(x.st) === 'opponent');
      // The canonical cohort and made test -- shared with _individualStats so
      // the two can never disagree about what a field goal is.
      const fgRows = rows('fieldGoal').filter(x => StatsEngine.isFieldGoalAttempt(x.p, x.st));
      const made = x => StatsEngine.isFieldGoalMade(x.p, x.st);
      const puntReturnedRows = puntRows.filter(x => x.st.outcome.status === 'returned');
      const puntGross = avgStat(puntRows, x => x.st.kick.distance);
      const puntNet = avgStat(puntRows, x => SpecialTeamsModel.netYards(x.st));
      const puntHang = avgStat(puntRows, x => x.st.kick.hangTime);
      const puntRetAllowed = avgStat(puntReturnedRows, x => x.st.return.yards);
      const punts = {
        n: puntRows.length,
        grossAvg: puntGross.value,
        netAvg: puntNet.value,
        hangAvg: puntHang.value,
        tbPct: puntRows.length ? Math.round(puntRows.filter(x => x.st.outcome.status === 'touchback').length / puntRows.length * 100) : 0,
        // Study expansion Phase 2: fair-catch rate and coverage (return-allowed)
        // for punts, mirroring what kickoffs already computed -- punt coverage
        // was previously invisible outside the netAvg composite.
        fairCatchPct: puntRows.length ? Math.round(puntRows.filter(x => x.st.outcome.status === 'fairCatch').length / puntRows.length * 100) : 0,
        blocked: puntRows.filter(x => x.st.outcome.status === 'blocked').length,
        retAllowedAvg: puntRetAllowed.value,
        // Special Teams Presentation Independence: the raw SUM alongside the
        // existing average -- a coach-facing coverage KPI needs an honest
        // total (summed across punts AND kickoffs), which an average alone
        // cannot provide without re-deriving avg*n and losing precision.
        retAllowedYards: puntReturnedRows.reduce((s, x) => s + (Number.isFinite(x.st.return.yards) ? x.st.return.yards : 0), 0),
        tdAllowed: tdAllowedRows(puntRows).length,
        refs: {
          all: StatsEngine._refsOf(puntRows, getPlay),
          blocked: StatsEngine._refsOf(puntRows.filter(x => x.st.outcome.status === 'blocked'), getPlay),
          returned: StatsEngine._refsOf(puntReturnedRows, getPlay),
          // Each average's OWN eligible cohort -- may be narrower than `all`
          // when a row is missing that specific measurement.
          grossAvg: puntGross.refs, netAvg: puntNet.refs, hangAvg: puntHang.refs,
          retAllowedAvg: puntRetAllowed.refs,
          tdAllowed: StatsEngine._refsOf(tdAllowedRows(puntRows), getPlay),
        },
        outcomes: distribution(puntRows, x => x.st.outcome.status, getPlay),
      };
      const onsideRows = koRows.filter(x => x.st.isOnside);
      const onsideRecoveredRows = onsideRows.filter(x => x.st.outcome.recoveredBy === 'subject');
      const koReturnedRows = koRows.filter(x => x.st.outcome.status === 'returned');
      const koAvg = avgStat(koRows, x => x.st.kick.distance);
      const koRetAllowed = avgStat(koReturnedRows, x => x.st.return.yards);
      const kickoffs = {
        n: koRows.length,
        avg: koAvg.value,
        tbPct: koRows.length ? Math.round(koRows.filter(x => x.st.outcome.status === 'touchback').length / koRows.length * 100) : 0,
        fairCatchPct: koRows.length ? Math.round(koRows.filter(x => x.st.outcome.status === 'fairCatch').length / koRows.length * 100) : 0,
        retAllowedAvg: koRetAllowed.value,
        retAllowedYards: koReturnedRows.reduce((s, x) => s + (Number.isFinite(x.st.return.yards) ? x.st.return.yards : 0), 0),
        tdAllowed: tdAllowedRows(koRows).length,
        // isOnside is a structured modifier (not a separate unit) -- 'recovered'
        // counts only a SUBJECT recovery (the point of an onside attempt).
        onside: { n: onsideRows.length, recovered: onsideRecoveredRows.length },
        refs: {
          all: StatsEngine._refsOf(koRows, getPlay),
          returned: StatsEngine._refsOf(koReturnedRows, getPlay),
          onside: StatsEngine._refsOf(onsideRows, getPlay),
          // Recovered onside kicks are a subset of attempts, with their own refs.
          onsideRecovered: StatsEngine._refsOf(onsideRecoveredRows, getPlay),
          avg: koAvg.refs, retAllowedAvg: koRetAllowed.refs,
          tdAllowed: StatsEngine._refsOf(tdAllowedRows(koRows), getPlay),
        },
        outcomes: distribution(koRows, x => x.st.outcome.status, getPlay),
      };
      const fgMadeRows = fgRows.filter(made);
      const fg = {
        att: fgRows.length,
        made: fgMadeRows.length,
        pct: fgRows.length ? Math.round(fgMadeRows.length / fgRows.length * 100) : 0,
        long: fgMadeRows.reduce((m, x) => Math.max(m, x.st.kick.distance || 0), 0),
        byDist: [['<30',0,29],['30-39',30,39],['40-49',40,49],['50+',50,99]].map(([label,lo,hi]) => {
          const attempts = fgRows.filter(x => x.st.kick.distance != null && x.st.kick.distance >= lo && x.st.kick.distance <= hi);
          return { label, att: attempts.length, made: attempts.filter(made).length, refs: StatsEngine._refsOf(attempts, getPlay) };
        }).filter(bucket => bucket.att),
        refs: { all: StatsEngine._refsOf(fgRows, getPlay), made: StatsEngine._refsOf(fgMadeRows, getPlay), missed: StatsEngine._refsOf(fgRows.filter(x => !made(x)), getPlay) },
        outcomes: distribution(fgRows, x => x.st.outcome.status, getPlay),
      };
      const ret = unit => {
        const arr = rows(unit);
        const attempts = arr.filter(x => x.st.return.attempted === true && Number.isFinite(x.st.return.yards));
        const tdRows = arr.filter(x => x.st.outcome.score === 'touchdown' && SpecialTeamsModel.scoringTeam(x.st) === 'subject');
        const muffedRows = arr.filter(x => x.st.outcome.status === 'muffed');
        const blockedRows = arr.filter(x => x.st.outcome.status === 'blocked');
        return {
          n: arr.length,
          // `attempts` is already the exact eligible (finite-yardage) set, so
          // avgStat's internal filter is a no-op here -- reused for the mean,
          // its own `.refs` discarded since `refs.attempts` below already
          // covers the identical cohort.
          avg: avgStat(attempts, x => x.st.return.yards).value,
          // The raw SUM behind `avg` -- Special Teams Presentation
          // Independence's Return Production KPI needs an honest total across
          // BOTH kick and punt returns, which two averages can't combine.
          yards: attempts.reduce((s, x) => s + x.st.return.yards, 0),
          long: attempts.length ? Math.max(...attempts.map(x => x.st.return.yards)) : 0,
          // Exact denominator for `long`/`avg` -- distinct from `n` (every ST
          // play of this unit, including fair catches/touchbacks/muffs with no
          // usable return yardage).
          attempts: attempts.length,
          td: tdRows.length,
          muffed: muffedRows.length,
          blocked: blockedRows.length,
          refs: {
            all: StatsEngine._refsOf(arr, getPlay), attempts: StatsEngine._refsOf(attempts, getPlay),
            td: StatsEngine._refsOf(tdRows, getPlay), muffed: StatsEngine._refsOf(muffedRows, getPlay),
            blocked: StatsEngine._refsOf(blockedRows, getPlay),
          },
          outcomes: distribution(arr, x => x.st.outcome.status, getPlay),
        };
      };
      const returns = { kick: ret('kickoffReturn'), punt: ret('puntReturn') };
      const blocks = rows('fieldGoalBlock');
      const blockedRows = blocks.filter(x => x.st.outcome.status === 'blocked');
      // Tries are charted only under Try and Defending a Try.
      const tryRows = [...rows('try'), ...rows('tryDefense')];
      const tries = {
        n: tryRows.length,
        tryUnits: tryRows.length,
        // The OPPONENT's tries — `Defending a Try`. `_conversionStats` counts
        // only attempts whose subject role is `attempting`, so these are charted
        // tries that are correctly not ours, which is a different statement from
        // a try with no scoring team tagged.
        defending: rows('tryDefense').length,
        refs: {
          all: StatsEngine._refsOf(tryRows, getPlay),
          tryUnits: StatsEngine._refsOf(tryRows, getPlay),
        },
      };
      return {
        punts, kickoffs, fg, returns, tries,
        blocks: { n: blocks.length, blocked: blockedRows.length, refs: { all: StatsEngine._refsOf(blocks, getPlay), blocked: StatsEngine._refsOf(blockedRows, getPlay) } },
        structured: true, hasData: structured.length > 0,
      };
    }
  }

  /**
   * Special Teams Presentation Independence -- the performance-band
   * composition StatsEngine owns so the native component never invents a
   * classification. Two genuinely new aggregates:
   *
   *   snaps  -- the count of unit:'special' plays in the cohort, using the
   *             SAME unit-partition convention compute() already applies to
   *             offPlays/defPlays. Not a new rule, just applied here too.
   *   points -- playPoints()/scoringSide() summed over exactly those plays,
   *             reusing the canonical scoring functions every scoreboard
   *             surface in this file already calls -- never a second
   *             scoring formula.
   *
   * `impact` composes ALREADY-COMPUTED fields off `stats.specialTeams`/
   * `stats.conversions` (blocked/missed/muffed) into one honest list; the
   * classification of what counts as blocked/missed/muffed lives entirely in
   * those existing fields, not here. Refs are accumulated in the same pass
   * that increments each count -- never resolved separately afterward.
   */
  _specialTeamsSummary(plays, stats) {
    const stPlays = (plays || []).filter(p => p?.tags?.unit === 'special');
    let us = 0, them = 0;
    const usRefs = [], themRefs = [];
    stPlays.forEach(p => {
      const pts = StatsEngine.playPoints(p);
      if (!pts) return;
      const side = StatsEngine.scoringSide(p);
      const ref = StatsEngine._compositeRef(p);
      if (side === 'us') { us += pts; if (ref) usRefs.push(ref); }
      else if (side === 'them') { them += pts; if (ref) themRefs.push(ref); }
    });
    const st = stats.specialTeams || {};
    const conv = stats.conversions || {};
    const impact = [];
    if (st.punts?.blocked) impact.push({ label: 'Punts blocked against us', n: st.punts.blocked, refs: st.punts.refs?.blocked || [] });
    if (st.returns?.punt?.blocked) impact.push({ label: 'Punts blocked', n: st.returns.punt.blocked,
      refs: st.returns.punt.refs?.blocked || [] });
    if (st.blocks?.blocked) impact.push({ label: 'Field goals blocked', n: st.blocks.blocked, refs: st.blocks.refs?.blocked || [] });
    const fgMissed = (st.fg?.att || 0) - (st.fg?.made || 0);
    if (fgMissed > 0) impact.push({ label: 'Field goals missed', n: fgMissed, refs: st.fg.refs?.missed || [] });
    const tryMissed = ((conv.xp?.att || 0) - (conv.xp?.made || 0)) + ((conv.two?.att || 0) - (conv.two?.made || 0));
    if (tryMissed > 0) impact.push({ label: 'Tries missed', n: tryMissed, refs: [...(conv.xp?.refs?.missed || []), ...(conv.two?.refs?.missed || [])] });
    const muffed = (st.returns?.kick?.muffed || 0) + (st.returns?.punt?.muffed || 0);
    if (muffed > 0) impact.push({ label: 'Muffed returns', n: muffed, refs: [...(st.returns.kick.refs?.muffed || []), ...(st.returns.punt.refs?.muffed || [])] });
    return {
      // The size of the cohort these snaps were drawn from. `stats.allPlays`
      // and `stats.totalPlays` are both narrower than the cohort compute() was
      // handed (328 and 173 against a 449-play season), so neither can serve
      // as the "of N charted" denominator. The summary already holds the
      // cohort, so it states it.
      cohort: (plays || []).length,
      snaps: { n: stPlays.length, refs: StatsEngine._refsOf(stPlays) },
      points: { us, them, refsUs: [...new Set(usRefs)].sort(), refsThem: [...new Set(themRefs)].sort() },
      impact,
    };
  }

      _downStats(plays) {
    const byDown = { '1': [], '2': [], '3': [], '4': [] };
    plays.forEach(p => {
      if (p.tags.down && byDown[p.tags.down]) {
        byDown[p.tags.down].push(p);
      }
    });

    const downStats = {};
    for (const [down, downPlays] of Object.entries(byDown)) {
      const total = downPlays.length;
      if (total === 0) {
        downStats[down] = { total: 0, runPct: '0', passPct: '0', avgYards: '0.0', conversionPct: '0.0' };
        continue;
      }
      const runs = downPlays.filter(p => StatsEngine.isRun(p)).length;
      const passes = total - runs;
      const yards = downPlays.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const conversions = downPlays.filter(p => StatsEngine.isConversion(p)).length;

      downStats[down] = {
        total,
        runs,
        passes,
        runPct: ((runs / total) * 100).toFixed(0),
        passPct: ((passes / total) * 100).toFixed(0),
        avgYards: (yards / total).toFixed(1),
        conversionPct: ((conversions / total) * 100).toFixed(1)
      };
    }

    const firstDowns = plays.filter(p => gainedFirstDown(p.tags)).length;
    const thirdDown = byDown['3'];
    const thirdDownConv = thirdDown.filter(p => StatsEngine.isConversion(p)).length;
    const fourthDown = byDown['4'];
    const fourthDownConv = fourthDown.filter(p => StatsEngine.isConversion(p)).length;

    const ddBuckets = this._downDistanceBuckets(plays);

    return {
      byDown: downStats,
      totalFirstDowns: firstDowns,
      thirdDownConv: `${thirdDownConv}/${thirdDown.length}`,
      thirdDownPct: thirdDown.length ? ((thirdDownConv / thirdDown.length) * 100).toFixed(1) : '0.0',
      fourthDownConv: `${fourthDownConv}/${fourthDown.length}`,
      fourthDownPct: fourthDown.length ? ((fourthDownConv / fourthDown.length) * 100).toFixed(1) : '0.0',
      ddBuckets,
    };
  }

  _downDistanceBuckets(plays) {
    const buckets = [];
    const distBucket = d => d <= 3 ? 'Short' : d <= 6 ? 'Medium' : 'Long';
    const groups = {};
    plays.forEach(p => {
      const down = p.tags.down;
      const dist = parseInt(p.tags.distance, 10);
      if (!down || !dist) return;
      const bk = distBucket(dist);
      const key = `${down}-${bk}`;
      if (!groups[key]) groups[key] = { down, bucket: bk, plays: [] };
      groups[key].plays.push(p);
    });
    const order = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const bOrder = { Short: 0, Medium: 1, Long: 2 };
    for (const g of Object.values(groups)) {
      const pl = g.plays;
      const n = pl.length;
      const runs = pl.filter(p => StatsEngine.isRun(p)).length;
      const passes = n - runs;
      const yards = pl.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const conv = pl.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;
      const succ = pl.filter(p => this._isSuccessfulPlay(p)).length;
      buckets.push({
        down: g.down, bucket: g.bucket, count: n,
        runs, passes,
        runPct: ((runs / n) * 100).toFixed(0),
        passPct: ((passes / n) * 100).toFixed(0),
        avgYards: (yards / n).toFixed(1),
        convPct: ((conv / n) * 100).toFixed(1),
        succPct: ((succ / n) * 100).toFixed(1),
        sortKey: order[g.down] * 10 + bOrder[g.bucket],
      });
    }
    buckets.sort((a, b) => a.sortKey - b.sortKey);
    return buckets;
  }

  _turnoverStats(plays) {
    const ints = plays.filter(p => StatsEngine.hasResult(p, 'Interception')).length;
    const fumblePlays = plays.filter(p => StatsEngine.hasResult(p, 'Fumble'));
    const fumblesLost = fumblePlays.filter(p => StatsEngine.isFumbleLost(p)).length;
    const fumblesUnknown = fumblePlays.filter(p => !['subject', 'opponent'].includes(p.tags?.fumbleRecovery)).length;
    return {
      total: ints + fumblesLost,
      interceptions: ints,
      fumbles: fumblePlays.length,
      fumblesLost,
      fumblesUnknown,
    };
  }

  /**
   * G14 — the Negative Plays breakdown.
   *
   * The lens this replaces was called "Risk", which named four things that had
   * ALREADY HAPPENED — that is damage, not exposure. Worse, two of its tiles
   * overlapped: `negative` is `yardage < 0`, so every sack was counted there AND
   * again under "Sacks taken", in the same lens, with nothing saying so.
   *
   * The coach's resolution, over five rounds:
   *
   *   HEADLINE is literal — DISTINCT plays that went wrong, with one percentage
   *   taken against total plays. ROWS are raw counts with no percentages.
   *
   * The two levels deliberately disagree, and that is correct: a strip-sack is
   * ONE play but TWO events, so 12 snaps can carry 16 events. Dropping the row
   * percentages is what makes that readable — there is no invitation to add
   * them up against a total they would not match.
   *
   * TURNOVERS STAND ALONE and go first; a turnover is never folded into
   * anything. Everything that could double-count is BRACKETED under Plays for
   * Loss, where the indent shows the children are part of the total rather than
   * additional to it. The coach's case for keeping sacks visible: if all four
   * turnovers are strip-sacks, calling out the sack is exactly what matters.
   *
   * The children are mutually exclusive by precedence (sack > run > pass), so
   * they sum EXACTLY to their header. `_isLoss` is the same `yardage < 0` rule
   * `_efficiencyStats` uses, so the row and the `negative` cut filter cannot
   * drift apart and show one number while playing another.
   */
  /**
   * Definitions for derived measures, shown where the number appears.
   * Written from the constants the engine computes with, because a definition
   * that drifts from the code invites checking a number against the wrong
   * rule; `e2e-native-reports` asserts each stated threshold against the value
   * in use. "Low sample" names its surface rather than one number: the gate is
   * 4 for self-scout tells, 5 for formation tendencies and 2 for the coverage
   * list (coach, 2026-08-04: keep the thresholds; variance differs).
   */
  static DEFINITIONS = {
    successRate: SUCCESS_RATE_TIP,
    explosive: 'A run of 12+ yards or a pass of 16+ yards. Two different thresholds, because a 13-yard run and a 13-yard pass are not the same play.',
    playsForLoss: 'Any play that finished behind where it started — yardage below zero. Sacks are counted on their own line and are not repeated here.',
    negativePlays: 'Distinct plays that went wrong: a turnover, a play for loss, or a penalty. One play counts once here even when it was several of those at once.',
    turnovers: 'Interceptions and fumbles lost.',
    havoc: 'Share of snaps where the defense made a sack, a tackle for loss, or forced a turnover.',
    stopPct: 'Share of snaps where the defense held the offense short of success for that down and distance — the inverse of their success rate.',
    predictability: 'How lopsided the run/pass mix is across formations and situations, sample-weighted. Higher means easier to call.',
    tell: 'A situation with at least 4 snaps that leans 70% or more one way.',
    lowSample: 'Too few snaps for the number to mean much. The gate differs by report: 4 snaps for tells, 5 for formation tendencies, 2 for the coverage list.',
  };

  /* G5 — surface a definition next to the term it defines.
     The definitions have existed since the last range and nothing rendered
     them, so the app knew what "havoc rate" meant and never said so.
     A BUTTON, not a title attribute: `title` is invisible to touch, is not
     focusable, and cannot be dismissed. This opens on hover, on keyboard focus
     and on tap, and Escape closes it — the same contract every other overlay in

  /* One delegated binding for the whole report. Hover and focus are CSS; this
     owns tap (which has no hover) and Escape. */
    _negativePlayStats(plays) {
    const list = plays || [];
    const isLoss = p => (parseInt(p.tags?.yardage, 10) || 0) < 0;
    const isTurnover = p => StatsEngine.isGiveaway(p);
    const isSack = p => StatsEngine.hasResult(p, 'Sack');
    const isFlagged = p => StatsEngine.hasResult(p, 'Penalty')
      || (Array.isArray(p.penalties) && p.penalties.length > 0);

    const losses = list.filter(isLoss);
    const sacks = losses.filter(isSack);
    const runs = losses.filter(p => !isSack(p) && StatsEngine.isRun(p));
    const passes = losses.filter(p => !isSack(p) && !StatsEngine.isRun(p) && StatsEngine.isPass(p));
    const other = losses.filter(p => !isSack(p) && !StatsEngine.isRun(p) && !StatsEngine.isPass(p));

    // The headline counts PLAYS, so a strip-sack lands here exactly once even
    // though it appears on two rows below.
    const distinct = list.filter(p => isLoss(p) || isTurnover(p) || isFlagged(p)).length;

    return {
      totalPlays: list.length,
      distinct,
      distinctPct: list.length ? Math.round((distinct / list.length) * 100) : 0,
      turnovers: list.filter(isTurnover).length,
      lossTotal: losses.length,
      lossSacks: sacks.length,
      playsForLoss: losses.length - sacks.length,
      lossRuns: runs.length,
      lossPasses: passes.length,
      lossOther: other.length,
      penalties: list.filter(isFlagged).length,
    };
  }

  _tendencyStats(plays) {
    const formations = {};
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
        formations[f] = (formations[f] || 0) + 1;
        if (!formationDetail[f]) formationDetail[f] = { name: f, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
        formationDetail[f].count++;
        if (isRun) formationDetail[f].runs++; else formationDetail[f].passes++;
        formationDetail[f].yards += yds;
        if (succ) formationDetail[f].successes++;
      });
    });
    const formationList = Object.values(formationDetail)
      .map(f => ({ ...f, avg: f.count ? (f.yards / f.count).toFixed(1) : '0.0', successPct: f.count ? ((f.successes / f.count) * 100).toFixed(0) : '0' }))
      .sort((a, b) => b.count - a.count);

    const playTypes = {};
    const playTypeDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      // Play Type is multi-select ("RPO + Short Pass"); attribute to each.
      StatsEngine.splitPlayTypes(p.tags.playType).forEach(t => {
        playTypes[t] = (playTypes[t] || 0) + 1;
        if (!playTypeDetail[t]) playTypeDetail[t] = { name: t, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
        playTypeDetail[t].count++;
        if (isRun) playTypeDetail[t].runs++; else playTypeDetail[t].passes++;
        playTypeDetail[t].yards += yds;
        if (succ) playTypeDetail[t].successes++;
      });
    });
    const playTypeList = Object.values(playTypeDetail)
      .map(pt => ({ ...pt, avg: pt.count ? (pt.yards / pt.count).toFixed(1) : '0.0', successPct: pt.count ? ((pt.successes / pt.count) * 100).toFixed(0) : '0' }))
      .sort((a, b) => b.count - a.count);

    const runs = plays.filter(p => StatsEngine.isRun(p)).length;
    const passes = plays.length - runs;
    const runYds = this._rushingStats(plays).yards;
    const passYds = this._passingStats(plays).yards;
    const runSucc = plays.filter(p => StatsEngine.isRun(p) && this._isSuccessfulPlay(p)).length;
    const passSucc = plays.filter(p => StatsEngine.isPass(p) && this._isSuccessfulPlay(p)).length;

    return {
      formations, formationList, playTypes, playTypeList,
      runs, passes, runYds, passYds,
      runSuccRate: runs ? ((runSucc / runs) * 100).toFixed(1) : '0.0',
      passSuccRate: passes ? ((passSucc / passes) * 100).toFixed(1) : '0.0',
      runPassRatio: `${runs}/${passes}`,
      runPct: plays.length ? ((runs / plays.length) * 100).toFixed(1) : '0.0',
      passPct: plays.length ? ((passes / plays.length) * 100).toFixed(1) : '0.0'
    };
  }

  _bigPlays(plays) {
    return plays.filter(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      return yds >= 20 || StatsEngine.hasResult(p, 'Touchdown');
    }).map(p => ({
      id: p.id,
      type: p.tags.playType,
      result: p.tags.result,
      yards: p.tags.yardage,
      clipName: p.clipName || `Play ${p.id}`,
      ref: StatsEngine._compositeRef(p)
    }));
  }

  /**
   * F12 — shapes for the new visuals.
   *
   * These live in the ENGINE, not in charts.js, deliberately: they are derived
   * values, and a derived value in a renderer is invisible to the parity gate
   * and to the raw-read audit. charts.js stays purely geometric — it is handed
   * numbers and draws them.
   *
   * Nothing here introduces a formula. Bins are raw signed yardage; success and
   * run/pass reuse `_isSuccessfulPlay` and `isRun`; the explosive threshold is
   * the same 12/16 the efficiency block uses.
   */
  _yardageBins(plays) {
    const EDGES = [-99, -1, 0, 3, 6, 10, 15, 20, 999];
    const LABELS = ['Loss', '0', '1–3', '4–6', '7–10', '11–15', '16–20', '20+'];
    // G14/G4 — the bin owns its own tone. `charts.js` previously decided this
    // with `bin.to <= 0`, which caught the `0` bin (from -1 to 0) and painted a
    // NO GAIN in the turnover color. A zero-yard play is not a loss. Deriving
    // it here also keeps the judgement inside the engine, where the parity gate
    // and the raw-read audit can both see it.
    const bins = LABELS.map((label, index) => ({
      label,
      from: EDGES[index],
      to: EDGES[index + 1],
      count: 0,
      tone: EDGES[index + 1] < 0 ? 'loss' : (EDGES[index] < 0 ? 'none' : 'gain'),
    }));
    let total = 0, sum = 0;
    plays.forEach(play => {
      const yards = parseInt(play.tags.yardage) || 0;
      total += 1; sum += yards;
      const index = EDGES.findIndex((edge, i) => i > 0 && yards <= EDGES[i]) - 1;
      const bin = bins[Math.max(0, Math.min(bins.length - 1, index))];
      if (bin) bin.count += 1;
    });
    if (!total) return null;
    const mean = sum / total;
    const meanIndex = bins.findIndex(bin => mean > bin.from && mean <= bin.to);
    return { bins, mean: mean.toFixed(1), meanIndex: meanIndex < 0 ? null : meanIndex, total };
  }

  _scatterPoints(plays) {
    return plays
      .filter(play => play.tags.distance && play.tags.yardage !== '' && play.tags.yardage != null)
      .map(play => ({
        x: parseInt(play.tags.distance) || 0,
        y: parseInt(play.tags.yardage) || 0,
        run: StatsEngine.isRun(play),
        label: `${play.tags.down ? `${play.tags.down} & ${play.tags.distance}` : play.tags.distance + ' to go'} · ${play.tags.playType || (StatsEngine.isRun(play) ? 'Run' : 'Pass')} · ${parseInt(play.tags.yardage) || 0} yd`,
      }))
      .filter(point => point.x > 0);
  }

  _fieldZoneStats(plays) {
    const ZONES = [
      { label: 'Backed up', min: 0, max: 10, cut: { type: 'situation', val: 'backedUp' } },
      { label: 'Own 11–39', min: 11, max: 39, cut: null },
      { label: 'Midfield', min: 40, max: 59, cut: null },
      { label: 'Opp 40–20', min: 60, max: 79, cut: null },
      { label: 'Red zone', min: 80, max: 94, cut: { type: 'situation', val: 'redZone' } },
      { label: 'Goal line', min: 95, max: 100, cut: { type: 'situation', val: 'goalLine' } },
    ];
    const out = ZONES.map(zone => ({ ...zone, count: 0, succ: 0 }));
    plays.forEach(play => {
      const yard = this._absYardLine(play.tags);
      if (yard === null) return;
      const zone = out.find(item => yard >= item.min && yard <= item.max);
      if (!zone) return;
      zone.count += 1;
      if (this._isSuccessfulPlay(play)) zone.succ += 1;
    });
    return out.map(zone => ({ ...zone, successPct: zone.count ? Math.round(zone.succ / zone.count * 100) : 0 }));
  }

  _downMultiples(plays) {
    return ['1', '2', '3', '4'].map(down => {
      const subset = plays.filter(play => play.tags.down === down);
      const run = subset.filter(play => StatsEngine.isRun(play)).length;
      const succ = subset.filter(play => this._isSuccessfulPlay(play)).length;
      return { label: `${down}${down === '1' ? 'st' : down === '2' ? 'nd' : down === '3' ? 'rd' : 'th'} down`,
        n: subset.length, run, pass: subset.length - run,
        successPct: subset.length ? Math.round(succ / subset.length * 100) : 0 };
    }).filter(item => item.n > 0);
  }

  _gameFlowStats(plays) {
    let cum = 0;
    return plays.map((p, i) => {
      const yds = parseInt(p.tags.yardage) || 0;
      cum += yds;
      const isRun = StatsEngine.isRun(p);
      return { playNum: i + 1, yards: yds, cumYards: cum, isRun, label: `${p.tags.playType || '?'} ${yds >= 0 ? '+' : ''}${yds}` };
    });
  }

  // ===== Feature 2: Hash tendencies ====================================
  _hashStats(plays) {
    const hashes = {};
    plays.forEach(p => {
      const h = p.tags.hash;
      if (!h) return;
      if (!hashes[h]) hashes[h] = { name: h, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      hashes[h].count++;
      hashes[h].yards += parseInt(p.tags.yardage) || 0;
      if (StatsEngine.isRun(p)) hashes[h].runs++; else hashes[h].passes++;
      if (this._isSuccessfulPlay(p)) hashes[h].successes++;
    });
    const list = Object.values(hashes).map(h => ({
      ...h,
      runPct: h.count ? ((h.runs / h.count) * 100).toFixed(0) : '0',
      avg: h.count ? (h.yards / h.count).toFixed(1) : '0.0',
      successPct: h.count ? ((h.successes / h.count) * 100).toFixed(0) : '0',
    })).sort((a, b) => b.count - a.count);
    const formations = {};
    plays.forEach(p => {
      if (!p.tags.hash) return;
      StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
        const k = `${p.tags.hash}|${f}`;
        formations[k] = (formations[k] || 0) + 1;
      });
    });
    return { list, formations, hasData: list.length > 0 };
  }

  // ===== Feature 3: Personnel × Situation cross-tab =====================
  _personnelSituationStats(plays) {
    const combos = {};
    plays.forEach(p => {
      const pers = p.tags.personnel || '';
      if (!pers) return;
      const sit = this._situationBucket(p);
      const k = `${pers}|${sit}`;
      if (!combos[k]) combos[k] = { personnel: pers, situation: sit, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      combos[k].count++;
      combos[k].yards += parseInt(p.tags.yardage) || 0;
      if (StatsEngine.isRun(p)) combos[k].runs++; else combos[k].passes++;
      if (this._isSuccessfulPlay(p)) combos[k].successes++;
    });
    const list = Object.values(combos).map(c => ({
      ...c,
      runPct: c.count ? ((c.runs / c.count) * 100).toFixed(0) : '0',
      avg: c.count ? (c.yards / c.count).toFixed(1) : '0.0',
      successPct: c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0',
    })).filter(c => c.count >= 2).sort((a, b) => b.count - a.count);
    return { list, hasData: list.length > 0 };
  }

  /* Explicit yardage, like every other situation label in Reports. These
   * thresholds are this bucket's OWN and are NOT `_distBucket`'s — second down
   * splits at 3 with no middle band — so the labels state what each one
   * actually matches rather than borrowing 1-3 / 4-6 / 7+ wording that would
   * misdescribe the cohort. */
  _situationBucket(p) {
    const d = p.tags.down;
    const dist = parseInt(p.tags.distance) || 0;
    if (d === '1') return '1st Down';
    if (d === '2' && dist <= 3) return '2nd & 1-3';
    if (d === '2') return '2nd & 4+';
    if (d === '3' && dist <= 3) return '3rd & 1-3';
    if (d === '3' && dist <= 6) return '3rd & 4-6';
    if (d === '3') return '3rd & 7+';
    if (d === '4') return '4th Down';
    return 'Other';
  }

  // ===== Feature 4: Defensive front + coverage combos ====================
  _frontCoverageCombos(plays) {
    const combos = {};
    plays.forEach(p => {
      const cov = StatsEngine.proj(p).coverage;
      if (!cov) return;
      StatsEngine.splitFronts(p.tags.defFront).forEach(front => {
        const k = `${front} + ${cov}`;
        if (!combos[k]) combos[k] = { name: k, front, coverage: cov, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0 };
        const yds = parseInt(p.tags.yardage) || 0;
        combos[k].count++;
        combos[k].yards += yds;
        if (!this._isSuccessfulPlay(p)) combos[k].successes++;
        if (StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
            StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack')))
          combos[k].havoc++;
        if (StatsEngine.isRun(p)) combos[k].runs++; else combos[k].passes++;
      });
    });
    const list = Object.values(combos).map(c => ({
      ...c,
      avg: c.count ? (c.yards / c.count).toFixed(1) : '0.0',
      stopPct: c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0',
      havocPct: c.count ? ((c.havoc / c.count) * 100).toFixed(0) : '0',
    })).filter(c => c.count >= 2).sort((a, b) => b.count - a.count);
    return { list, hasData: list.length > 0 };
  }

  // ===== Feature 6: Play-action as first-class metric ====================
  _playActionStats(plays) {
    const paPlays = plays.filter(p => {
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      return types.includes('Play Action');
    });
    const dropbacks = plays.filter(p => StatsEngine.isPass(p));
    const straightDrops = dropbacks.filter(p => {
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      return !types.includes('Play Action');
    });

    const paRate = dropbacks.length ? ((paPlays.length / dropbacks.length) * 100).toFixed(1) : '0.0';
    const paComps = paPlays.filter(p => !StatsEngine.hasResult(p, 'Sack') && StatsEngine.isCompletionResult(p));
    const paAttempts = paPlays.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const paYards = paPlays.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);
    const straightComps = straightDrops.filter(p => !StatsEngine.hasResult(p, 'Sack') && StatsEngine.isCompletionResult(p));
    const straightAttempts = straightDrops.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const straightYards = straightDrops.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);

    const byFormation = {};
    paPlays.forEach(p => {
      StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
        if (!byFormation[f]) byFormation[f] = { name: f, count: 0, yards: 0, successes: 0 };
        byFormation[f].count++;
        byFormation[f].yards += parseInt(p.tags.yardage) || 0;
        if (this._isSuccessfulPlay(p)) byFormation[f].successes++;
      });
    });
    const formationList = Object.values(byFormation).map(f => ({
      ...f,
      avg: f.count ? (f.yards / f.count).toFixed(1) : '0.0',
      successPct: f.count ? ((f.successes / f.count) * 100).toFixed(0) : '0',
    })).sort((a, b) => b.count - a.count);

    return {
      paPlays: paPlays.length,
      paRate,
      paCompPct: paAttempts ? ((paComps.length / paAttempts) * 100).toFixed(1) : '0.0',
      paYPA: paAttempts ? (paYards / paAttempts).toFixed(1) : '0.0',
      straightCompPct: straightAttempts ? ((straightComps.length / straightAttempts) * 100).toFixed(1) : '0.0',
      straightYPA: straightAttempts ? (straightYards / straightAttempts).toFixed(1) : '0.0',
      formationList,
      hasData: paPlays.length > 0,
    };
  }

  // ===== Play direction + pre-snap motion tendencies =====================
  _directionMotionStats(plays) {
    const mk = name => ({ name, count: 0, runs: 0, passes: 0, yards: 0, succ: 0 });
    const finish = o => ({
      ...o,
      runPct: o.count ? ((o.runs / o.count) * 100).toFixed(0) : '0',
      passPct: o.count ? ((o.passes / o.count) * 100).toFixed(0) : '0',
      avg: o.count ? (o.yards / o.count).toFixed(1) : '0.0',
      succPct: o.count ? ((o.succ / o.count) * 100).toFixed(0) : '0',
    });
    const dirs = {};
    const motions = {};
    let motionTagged = 0;
    const noMotion = mk('No Motion');

    plays.forEach(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      const isRun = StatsEngine.isRun(p);
      const succ = this._isSuccessfulPlay(p);
      const add = o => {
        o.count++; o.yards += yds;
        if (isRun) o.runs++; else o.passes++;
        if (succ) o.succ++;
      };
      if (p.tags.playDir) add(dirs[p.tags.playDir] || (dirs[p.tags.playDir] = mk(p.tags.playDir)));
      if (p.tags.motion) {
        motionTagged++;
        add(motions[p.tags.motion] || (motions[p.tags.motion] = mk(p.tags.motion)));
      } else {
        add(noMotion);
      }
    });

    const dirOrder = { Left: 0, Middle: 1, Right: 2 };
    const dirList = Object.values(dirs).map(finish)
      .sort((a, b) => (dirOrder[a.name] ?? 9) - (dirOrder[b.name] ?? 9));
    const motionList = Object.values(motions).map(finish).sort((a, b) => b.count - a.count);

    return {
      dirList,
      motionList,
      noMotion: finish(noMotion),
      hasDirData: dirList.length > 0,
      // Motion table only makes sense once the coach is actually tagging motion.
      hasMotionData: motionTagged > 0,
    };
  }

  // ===== Game Plan — categorized coaching insights =======================
  _generateTakeaways(stats) {
    const working = [];
    const fix = [];
    const MIN_N = 4;

    // --- Formation tendencies ---
    (stats.tendencies.formationList || []).forEach(f => {
      if (f.count < MIN_N) return;
      const runPct = f.count ? (f.runs / f.count) * 100 : 50;
      const succPct = parseFloat(f.successPct);
      if (succPct >= 55 && f.count >= 5)
        working.push({ s: succPct * Math.min(f.count, 15), cut: ['formationFamily', f.name], text: `<strong>${Charts._esc(f.name)}</strong>: ${succPct}% success (${f.count} plays, ${f.avg} avg)` });
      if (runPct >= 75)
        fix.push({ s: (runPct - 50) * Math.min(f.count, 15), cut: ['formationFamily', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${runPct.toFixed(0)}% run — add a pass concept to keep the defense honest` });
      else if (runPct <= 25)
        fix.push({ s: (50 - runPct) * Math.min(f.count, 15), cut: ['formationFamily', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${(100 - runPct).toFixed(0)}% pass — mix in a draw or screen` });
    });

    // --- Down & distance buckets ---
    if (stats.downs?.ddBuckets) {
      stats.downs.ddBuckets.forEach(b => {
        if (b.count < MIN_N) return;
        const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
        const tag = `${labels[b.down]} & ${b.bucket}`;
        const conv = parseFloat(b.convPct);
        if (b.down === '3' || b.down === '4') {
          if (conv >= 55)
            working.push({ s: conv * Math.min(b.count, 12), cut: ['dd', `${b.down}|${b.bucket}`], text: `<strong>${tag}</strong>: converting ${conv}% (${b.count} plays, ${b.avgYards} avg)` });
          else if (conv <= 30)
            fix.push({ s: (50 - conv) * Math.min(b.count, 12), cut: ['dd', `${b.down}|${b.bucket}`], text: `<strong>${tag}</strong>: only ${conv}% conversion (${b.count} plays) — need a better call here` });
        }
      });
    }

    // --- Defensive coverage gaps ---
    if (stats.defensive?.coverages) {
      stats.defensive.coverages.forEach(c => {
        if (c.count < MIN_N) return;
        const avg = c.count ? c.yards / c.count : 0;
        const stopPct = c.count ? (c.successes / c.count) * 100 : 0;
        if (stopPct >= 65 && avg <= 4)
          working.push({ s: stopPct * Math.min(c.count, 10), cut: ['coverage', c.name], text: `<strong>${Charts._esc(c.name)}</strong>: ${stopPct.toFixed(0)}% stop rate, ${avg.toFixed(1)} avg allowed (${c.count} snaps)` });
        else if (avg >= 7)
          fix.push({ s: avg * Math.min(c.count, 10), cut: ['coverage', c.name], text: `<strong>${Charts._esc(c.name)}</strong> allowing ${avg.toFixed(1)} YPA (${c.count} snaps) — consider switching` });
      });
    }

    // --- Front+coverage combos ---
    if (stats.frontCoverageCombos?.list) {
      stats.frontCoverageCombos.list.forEach(c => {
        if (c.count < MIN_N) return;
        const stopPct = parseInt(c.stopPct);
        const avg = parseFloat(c.avg);
        if (stopPct >= 65 && avg <= 3.5)
          working.push({ s: stopPct * Math.min(c.count, 10), text: `<strong>${Charts._esc(c.name)}</strong>: ${stopPct}% stop rate, ${avg} avg (${c.count} snaps) — keep calling it` });
      });
    }

    // --- Play-action ---
    if (stats.playAction?.hasData && stats.tendencies.runs >= MIN_N) {
      const runPct = parseFloat(stats.tendencies.runPct);
      const paRate = parseFloat(stats.playAction.paRate);
      const paYPA = parseFloat(stats.playAction.paYPA);
      const straightYPA = parseFloat(stats.playAction.straightYPA);
      if (stats.playAction.paPlays >= 3 && paYPA > straightYPA + 2)
        working.push({ s: (paYPA - straightYPA) * 100, cut: ['playType', 'Play Action'], text: `Play-action: <strong>${paYPA} YPA</strong> vs ${straightYPA} straight — it's working, lean into it` });
      if (runPct >= 45 && paRate < 15)
        fix.push({ s: 600, text: `Running ${runPct}% of the time but only ${paRate}% play-action — opponents aren't being held by fakes` });
    }

    // --- Drive quality ---
    if (stats.drives?.total >= 3) {
      const d = stats.drives;
      if (d.threeAndOuts >= 3)
        fix.push({ s: d.threeAndOuts * 100, text: `<strong>${d.threeAndOuts} three-and-outs</strong> in ${d.total} drives — too many stalled possessions` });
      const ppd = parseFloat(d.pointsPerDrive);
      if (ppd >= 2.5)
        working.push({ s: ppd * 100, text: `Scoring <strong>${ppd} pts/drive</strong> — efficient possessions` });
      else if (ppd <= 1.0 && d.total >= 4)
        fix.push({ s: (2.5 - ppd) * 100, text: `Only <strong>${ppd} pts/drive</strong> — drives are stalling before the end zone` });
    }

    // --- Red zone ---
    if (stats.situational) {
      const rz = stats.situational.redZone;
      if (rz && rz.total >= MIN_N) {
        const tdPct = rz.total ? ((rz.tds / rz.total) * 100) : 0;
        if (tdPct >= 60)
          working.push({ s: tdPct * 5, cut: ['situation', 'redZone'], text: `Red zone TD rate <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — finishing drives` });
        else if (tdPct <= 25)
          fix.push({ s: (50 - tdPct) * 10, cut: ['situation', 'redZone'], text: `Red zone TD rate only <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — settling for FGs or stalling` });
      }
    }

    // --- Explosive / negative rates ---
    if (stats.efficiency && stats.totalPlays >= 10) {
      const expPct = parseFloat(stats.efficiency.explosivePct);
      if (expPct >= 15)
        working.push({ s: expPct * 20, cut: ['situation', 'explosive'], text: `<strong>${expPct}%</strong> explosive plays rate (${stats.efficiency.explosivePlays} plays) — hitting big shots` });
      const negPct = parseFloat(stats.efficiency.negativePct);
      if (negPct >= 15)
        fix.push({ s: negPct * 20, cut: ['situation', 'negative'], text: `<strong>${negPct}%</strong> plays for loss (${stats.efficiency.negativePlays} plays) — too many losses behind the line` });
    }

    // --- Hash predictability ---
    if (stats.hash?.hasData) {
      stats.hash.list.forEach(h => {
        if (h.count < MIN_N) return;
        const runPct = parseInt(h.runPct);
        if (runPct >= 70) fix.push({ s: (runPct - 50) * Math.min(h.count, 12), cut: ['hash', h.name], text: `<strong>${Charts._esc(h.name)} hash</strong>: ${runPct}% run (${h.count} snaps) — predictable` });
        else if (runPct <= 30) fix.push({ s: (50 - runPct) * Math.min(h.count, 12), cut: ['hash', h.name], text: `<strong>${Charts._esc(h.name)} hash</strong>: ${100 - runPct}% pass (${h.count} snaps) — predictable` });
      });
    }

    // --- Run direction lean ---
    if (stats.dirMotion?.hasDirData) {
      const dirRuns = stats.dirMotion.dirList.map(d => ({ name: d.name, runs: d.runs }));
      const totalDirRuns = dirRuns.reduce((s, d) => s + d.runs, 0);
      if (totalDirRuns >= 6) {
        dirRuns.forEach(d => {
          const pct = (d.runs / totalDirRuns) * 100;
          if (pct >= 60) fix.push({ s: (pct - 50) * Math.min(totalDirRuns, 12), cut: ['playDir', d.name], text: `<strong>${pct.toFixed(0)}%</strong> of runs go <strong>${Charts._esc(d.name)}</strong> (${d.runs}/${totalDirRuns}) — defenses will overload that side` });
        });
      }
    }

    // --- Motion tell ---
    if (stats.dirMotion?.hasMotionData) {
      const m = stats.dirMotion.motionList.reduce((acc, x) => ({ count: acc.count + x.count, runs: acc.runs + x.runs }), { count: 0, runs: 0 });
      if (m.count >= MIN_N) {
        const runPct = (m.runs / m.count) * 100;
        if (runPct >= 75) fix.push({ s: (runPct - 50) * Math.min(m.count, 12), cut: ['motion', 'Any'], text: `When you motion, you run <strong>${runPct.toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
        else if (runPct <= 25) fix.push({ s: (50 - runPct) * Math.min(m.count, 12), cut: ['motion', 'Any'], text: `When you motion, you pass <strong>${(100 - runPct).toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
      }
    }

    working.sort((a, b) => b.s - a.s);
    fix.sort((a, b) => b.s - a.s);
    return { working: working.slice(0, 5), fix: fix.slice(0, 5) };
  }

  /** Study Phase 3: `tags.players` merged with any structured Special Teams
   *  role attribution (kicker/punter/returner/blocker/recoverer), exactly the
   *  merge `_individualStats` already performed inline. Extracted so a
   *  second consumer (AnalyticsRegistry's player dimensions) reads player
   *  attribution through the SAME merge rather than re-deriving it -- the
   *  two can never drift apart on a future Special Teams change. */
  static effectivePlayers(play) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    const structuredPlayers = Object.fromEntries(Object.entries(structured?.players || {})
      .filter(([, value]) => String(value || '').trim()));
    return { ...(play?.tags?.players || {}), ...structuredPlayers };
  }

  /** Study Phase 3: whether a play's football-role attribution (ball
   *  carrier/passer/receiver) should count at all -- extracted from
   *  `_individualStats`'s inline gate so AnalyticsRegistry's player
   *  dimensions apply the EXACT same rule, not a hand-copied one. A fake
   *  Special Teams play (a run/pass dressed as a kick) counts; an ordinary
   *  kick/punt/return does not, since those plays' "ball carrier" is the
   *  kicker/returner, tracked separately. A try never counts, Fake included:
   *  tries stay out of every player line (GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md
   *  §6), and Players reads credits without compute()'s try exclusion. */
  static countsFootballRoles(play) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    if (structured && (structured.unit === 'try' || structured.unit === 'tryDefense')) return false;
    return structured
      ? structured.isFake
      : countedUnit(play) !== 'special' || StatsEngine.isRun(play) || StatsEngine.isPass(play);
  }

  /** "This attempt succeeded", reused by AnalyticsMetrics' completions and
   *  completion rate across passes, made field goals and legacy kicks:
   *  - a genuine structured kick: its own `outcome.status === 'good'`;
   *  - a fake: a real snap dressed as a kick, judged by `tags.result` like any
   *    pass or run, since its kick status describes a kick that never
   *    happened;
   *  - no structured data: `tags.result` (Gain, No Gain, Loss or Touchdown for
   *    a pass; Good for a legacy kick). */
  static isMadeAttempt(play, hasResult) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    if (structured && !structured.isFake) return structured.outcome?.status === 'good';
    return hasResult(play, 'Gain') || hasResult(play, 'Touchdown') || hasResult(play, 'No Gain')
      || hasResult(play, 'Loss') || hasResult(play, 'Good');
  }

  /** "Did we score a touchdown on this play", structured or legacy, used by
   *  AnalyticsMetrics' `touchdowns` across ball carrier, passer, receiver and
   *  returner. A genuine structured event counts only when
   *  `SpecialTeamsModel.scoringTeam(play)` says we scored: a muffed return run
   *  back by the coverage team is a touchdown, but not ours. That resolver
   *  falls back from `scoredBy` to `recoveredBy` and `subjectRole`, and fails
   *  closed to 'unknown'. A fake and every ordinary play use `tags.result`. */
  static isScoredTouchdown(play, hasResult) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    if (structured && !structured.isFake) {
      return structured.outcome?.score === 'touchdown' && SpecialTeamsModel.scoringTeam(play) === 'subject';
    }
    return hasResult(play, 'Touchdown');
  }

  /**
   * THE PLAYER CREDIT INDEX — Reports > Players Revision 2's one owner.
   *
   * Every number the Players board shows and every clip it opens is a bucket in
   * here: a list of `{ play, value }` entries. A count is that list's length, a
   * total is the sum of its values, a long is the max, and the film cohort is
   * the composite refs of those exact plays. That is the whole point — a
   * displayed figure and the playlist behind it cannot disagree, because they
   * are the same list read two ways, and a game-by-game or situational split is
   * the same list grouped rather than a second computation.
   *
   * `_individualStats` derives its long-standing output from this index rather
   * than counting a second time, so `e2e-parity`'s golden is the proof that the
   * buckets reproduce the established definitions exactly. No definition moved:
   * the gates below (`countsFootballRoles`, the dedicated ST fields, the
   * canonical field-goal cohort, takeaway-vs-tackler credit) are the rules this
   * method was already applying.
   *
   * ROLE ATTRIBUTION IS NOT PARTICIPATION. A player is credited for the plays a
   * coach attributed to them, never for snaps played; nothing here counts a
   * player onto a play they were not charted on.
   */
  _playerCredits(plays) {
    const index = new Map();
    const ROLE_COHORT = StatsEngine.PLAYER_ROLE_COHORT;
    const bucket = (num, roleKey, roleLabel, stat, play, value = null) => {
      const id = String(num || '').trim();
      if (!id) return;
      if (!index.has(id)) index.set(id, { num: id, roles: new Map() });
      const player = index.get(id);
      if (!player.roles.has(roleKey)) {
        player.roles.set(roleKey, { key: roleKey, label: roleLabel, stats: new Map(), gradeSum: 0, gradeCount: 0 });
      }
      const role = player.roles.get(roleKey);
      if (!role.stats.has(stat)) role.stats.set(stat, []);
      role.stats.get(stat).push({ play, value });
    };
    const grade = (num, roleKey, roleLabel, play, field) => {
      const id = String(num || '').trim();
      const value = play.tags.grades?.[field];
      if (!id || value == null || !index.get(id)?.roles.has(roleKey)) return;
      const role = index.get(id).roles.get(roleKey);
      role.gradeSum += value;
      role.gradeCount++;
    };

    (plays || []).forEach(p => {
      const structured = SpecialTeamsModel.normalize(p.specialTeams);
      const players = StatsEngine.effectivePlayers(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const isPass = StatsEngine.isPass(p);
      const isTD = StatsEngine.hasResult(p, 'Touchdown');
      const isComplete = StatsEngine.isCompletionResult(p);
      // --- Return game. The structured return is authoritative; a return with
      // no charted yardage is a return that contributed no measured yards.
      const structuredReturn = structured && ['kickoffReturn', 'puntReturn'].includes(structured.unit);
      if (players.returner && structuredReturn) {
        const returnYards = Number.isFinite(structured.return.yards) ? structured.return.yards : null;
        const returnTd = structured.outcome.score === 'touchdown' && SpecialTeamsModel.scoringTeam(structured) === 'subject';
        bucket(players.returner, 'returns', 'Return Game', ROLE_COHORT, p);
        bucket(players.returner, 'returns', 'Return Game', 'ret', p);
        if (returnYards != null) bucket(players.returner, 'returns', 'Return Game', 'yds', p, returnYards);
        if (returnTd) bucket(players.returner, 'returns', 'Return Game', 'td', p);
      }

      // --- Kicking / punting. The canonical field-goal cohort, so a kicker can
      // never hold an attempt the Special Teams unit does not recognize.
      const isFg = StatsEngine.isFieldGoalAttempt(p, structured || null);
      const specialist = structured ? (players.punter || players.kicker) : players.kicker;
      if (specialist && structured && !structured.isFake && (isFg || structured.unit === 'punt')) {
        bucket(specialist, 'kicking', 'Kicking / Punting', ROLE_COHORT, p);
        if (isFg) {
          bucket(specialist, 'kicking', 'Kicking / Punting', 'fgAtt', p);
          if (StatsEngine.isFieldGoalMade(p, structured)) bucket(specialist, 'kicking', 'Kicking / Punting', 'fgMade', p);
        } else {
          bucket(specialist, 'kicking', 'Kicking / Punting', 'punts', p);
          if (Number.isFinite(structured.kick.distance)) {
            bucket(specialist, 'kicking', 'Kicking / Punting', 'puntYds', p, structured.kick.distance);
          }
        }
      }

      if (!StatsEngine.countsFootballRoles(p)) return;

      const isSack = StatsEngine.hasResult(p, 'Sack');
      const rusher = StatsEngine.rushingPlayer(p);
      if (rusher && StatsEngine.isRushingAttempt(p)) {
        bucket(rusher, 'rushing', 'Rushing', ROLE_COHORT, p);
        bucket(rusher, 'rushing', 'Rushing', 'att', p);
        bucket(rusher, 'rushing', 'Rushing', 'yds', p, yds);
        if (isTD) bucket(rusher, 'rushing', 'Rushing', 'td', p);
        if (StatsEngine.hasResult(p, 'Fumble')) bucket(rusher, 'rushing', 'Rushing', 'fum', p);
        if (!isSack) grade(rusher, 'rushing', 'Rushing', p, 'ballCarrier');
      }

      if (players.passer && isPass) {
        bucket(players.passer, 'passing', 'Passing', ROLE_COHORT, p);
        // Attempts = completions + incompletions + interceptions, the same
        // cohort the team C/A uses. A sack is not an attempt.
        if (!isSack && (isComplete || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception'))) {
          bucket(players.passer, 'passing', 'Passing', 'att', p);
        }
        if (isComplete && !isSack) {
          bucket(players.passer, 'passing', 'Passing', 'cmp', p);
          bucket(players.passer, 'passing', 'Passing', 'yds', p, yds);
        }
        if (isTD) bucket(players.passer, 'passing', 'Passing', 'td', p);
        if (StatsEngine.hasResult(p, 'Interception')) bucket(players.passer, 'passing', 'Passing', 'int', p);
        if (StatsEngine.hasResult(p, 'Sack')) bucket(players.passer, 'passing', 'Passing', 'sck', p);
        grade(players.passer, 'passing', 'Passing', p, 'passer');
      }

      if (players.receiver && isPass && isComplete && !isSack) {
        bucket(players.receiver, 'receiving', 'Receiving', ROLE_COHORT, p);
        bucket(players.receiver, 'receiving', 'Receiving', 'rec', p);
        bucket(players.receiver, 'receiving', 'Receiving', 'yds', p, yds);
        if (isTD) bucket(players.receiver, 'receiving', 'Receiving', 'td', p);
        grade(players.receiver, 'receiving', 'Receiving', p, 'receiver');
      }

      // Tacklers may be several on one play: each credited jersey gets the
      // tackle, and a shared tackle is an assist for every one of them.
      const tacklerIds = StatsEngine.splitPlayers(players.tackler);
      const shared = tacklerIds.length > 1;
      const isDefPlay = p.tags.unit === 'defense';
      const takeawayIds = StatsEngine.splitPlayers(players.takeaway);
      // A takeaway belongs to its own role when charted; plays tagged before
      // that role existed fall back to crediting the listed tackler(s).
      const creditTakeawayViaTackler = isDefPlay && takeawayIds.length === 0;
      tacklerIds.forEach(id => {
        bucket(id, 'tackles', 'Tackles', ROLE_COHORT, p);
        bucket(id, 'tackles', 'Tackles', 'tkl', p);
        bucket(id, 'tackles', 'Tackles', shared ? 'ast' : 'solo', p);
        if (StatsEngine.hasResult(p, 'Sack')) bucket(id, 'tackles', 'Tackles', 'sack', p);
        else if (yds < 0) bucket(id, 'tackles', 'Tackles', 'tfl', p); // TFL excludes sacks
        if (creditTakeawayViaTackler && StatsEngine.hasResult(p, 'Interception')) bucket(id, 'tackles', 'Tackles', 'int', p);
        if (creditTakeawayViaTackler && StatsEngine.isFumbleRecovered(p)) bucket(id, 'tackles', 'Tackles', 'fr', p);
        grade(id, 'tackles', 'Tackles', p, 'tackler');
      });
      if (isDefPlay) {
        takeawayIds.forEach(id => {
          bucket(id, 'tackles', 'Tackles', ROLE_COHORT, p);
          if (StatsEngine.hasResult(p, 'Interception')) bucket(id, 'tackles', 'Tackles', 'int', p);
          if (StatsEngine.isFumbleRecovered(p)) bucket(id, 'tackles', 'Tackles', 'fr', p);
          grade(id, 'tackles', 'Tackles', p, 'takeaway');
        });
      }
    });
    return index;
  }

  /** The reserved bucket holding EVERY play attributed to a role, including one
   *  that contributed to no displayed statistic — a pass wiped out by a penalty,
   *  a takeaway role on a play that produced neither an interception nor a
   *  recovery. It is the role's own film cohort (what the row's Watch action has
   *  always opened) and the play set every game and situational split groups. */
  static PLAYER_ROLE_COHORT = '__role';

  /** One bucket, read four ways. `entries` are `{ play, value }`. */
  static _statFacts(entries) {
    const list = entries || [];
    const measured = list.filter(item => Number.isFinite(item.value));
    const long = measured.length ? Math.max(...measured.map(item => item.value)) : 0;
    return {
      n: list.length,
      total: measured.reduce((sum, item) => sum + item.value, 0),
      measured: measured.length,
      long,
      /* THE LONG IS ONE PLAY (or the few that tie it), not the whole measured
         set. Pointing `Long` at every measured play meant a coach clicking a
         12-yard long also got the 4-yard carry beside it — the displayed value
         and its film disagreed, which is the one thing this index exists to
         prevent. */
      longRefs: measured.length
        ? StatsEngine._refsOf(measured.filter(item => item.value === long).map(item => item.play))
        : [],
      refs: StatsEngine._refsOf(list.map(item => item.play)),
    };
  }

  _individualStats(plays) {
    const rushers = {};
    const passers = {};
    const receivers = {};
    const tacklers = {};
    const returners = {};
    const kickers = {};
    const credits = this._playerCredits(plays);
    const fact = (player, roleKey, stat) => StatsEngine._statFacts(player.roles.get(roleKey)?.stats.get(stat));
    const gradeOf = (player, roleKey) => {
      const role = player.roles.get(roleKey);
      return role && role.gradeCount ? { gradeSum: role.gradeSum, gradeCount: role.gradeCount } : {};
    };
    const allRefs = (player, roleKey) =>
      fact(player, roleKey, StatsEngine.PLAYER_ROLE_COHORT).refs;

    credits.forEach(player => {
      const num = player.num;
      /* LONG IS THE LONGEST RESULT, INCLUDING A NEGATIVE ONE. It was clamped at
         zero, so a back whose only carry lost three yards showed `Long 0` while
         the film link opened the -3 play: the number and its clip described
         different things. With no measured play at all the field stays 0, which
         is the established "nothing to state" value every consumer already
         renders as an absence. `longRefs` is unchanged, so ties stay linked. */
      if (player.roles.has('rushing')) {
        const att = fact(player, 'rushing', 'att'), yards = fact(player, 'rushing', 'yds');
        rushers[num] = { num, attempts: att.n, yards: yards.total, tds: fact(player, 'rushing', 'td').n,
          long: yards.n ? yards.long : 0, fumbles: fact(player, 'rushing', 'fum').n,
          refs: allRefs(player, 'rushing'), ...gradeOf(player, 'rushing') };
      }
      if (player.roles.has('passing')) {
        passers[num] = { num, attempts: fact(player, 'passing', 'att').n, completions: fact(player, 'passing', 'cmp').n,
          yards: fact(player, 'passing', 'yds').total, tds: fact(player, 'passing', 'td').n,
          ints: fact(player, 'passing', 'int').n, sacks: fact(player, 'passing', 'sck').n,
          refs: allRefs(player, 'passing'), ...gradeOf(player, 'passing') };
      }
      if (player.roles.has('receiving')) {
        const yards = fact(player, 'receiving', 'yds');
        receivers[num] = { num, receptions: fact(player, 'receiving', 'rec').n, yards: yards.total,
          tds: fact(player, 'receiving', 'td').n, long: yards.n ? yards.long : 0,
          refs: allRefs(player, 'receiving'), ...gradeOf(player, 'receiving') };
      }
      if (player.roles.has('tackles')) {
        tacklers[num] = { num, tackles: fact(player, 'tackles', 'tkl').n, solo: fact(player, 'tackles', 'solo').n,
          assists: fact(player, 'tackles', 'ast').n, sacks: fact(player, 'tackles', 'sack').n,
          tfl: fact(player, 'tackles', 'tfl').n, ints: fact(player, 'tackles', 'int').n,
          fumblesRec: fact(player, 'tackles', 'fr').n, refs: allRefs(player, 'tackles'), ...gradeOf(player, 'tackles') };
      }
      if (player.roles.has('returns')) {
        const yards = fact(player, 'returns', 'yds');
        returners[num] = { num, returns: fact(player, 'returns', 'ret').n, yards: yards.total,
          measured: yards.n, tds: fact(player, 'returns', 'td').n, long: yards.n ? yards.long : 0,
          refs: allRefs(player, 'returns') };
      }
      if (player.roles.has('kicking')) {
        const puntYds = fact(player, 'kicking', 'puntYds');
        kickers[num] = { num, fgAtt: fact(player, 'kicking', 'fgAtt').n, fgMade: fact(player, 'kicking', 'fgMade').n,
          punts: fact(player, 'kicking', 'punts').n, puntYds: puntYds.total, puntsMeasured: puntYds.n,
          refs: allRefs(player, 'kicking') };
      }
    });

    return {
      rushers: Object.values(rushers).sort((a, b) => b.yards - a.yards),
      passers: Object.values(passers).sort((a, b) => b.yards - a.yards),
      receivers: Object.values(receivers).sort((a, b) => b.yards - a.yards),
      tacklers: Object.values(tacklers).sort((a, b) => b.tackles - a.tackles),
      returners: Object.values(returners).sort((a, b) => b.yards - a.yards),
      kickers: Object.values(kickers).sort((a, b) => (b.fgMade + b.punts) - (a.fgMade + a.punts)),
    };
  }

  /* ══ Reports > Players Revision 2 ═══════════════════════════════════════
     The leaderboard, the player detail view, the game-by-game split and the
     situational split are four readings of ONE credit index, so a figure and
     the clips behind it are the same play list. Nothing here invents a metric:
     every stat is a bucket `_playerCredits` already fills, every dimension
     value comes from an existing canonical splitter, and a role a player was
     never credited in simply does not appear.
     ───────────────────────────────────────────────────────────────────────── */

  /** The six approved roles, their order, and the stats each one displays.
   *  `measure` marks the stats whose value is summed rather than counted; a
   *  `clickable` stat opens exactly its own bucket. */
/* `measures` are the columns a split renders for this role, each naming its own
   bucket and how it is read: `count` (bucket length) or `total` (sum of values).
   A role whose credits are HETEROGENEOUS needs more than one — a kicker's group
   may hold punts and no field goal, a defender's may hold a takeaway and no
   tackle. Reducing either to a single "volume" stat printed `0 FG` beside 40
   punt yards and dropped the group from the split entirely, because the filter
   asked the wrong bucket whether anything happened. A GROUP IS RENDERED WHEN THE
   ROLE WAS CREDITED IN IT, which is the role cohort's own length. */
  static PLAYER_ROLES = Object.freeze([
    { key: 'rushing', label: 'Rushing', gradeField: 'ballCarrier',
      stats: ['att', 'yds', 'td', 'long', 'fum'],
      measures: [{ key: 'att', label: 'Att', read: 'count' }, { key: 'yds', label: 'Yds', read: 'total' }] },
    { key: 'passing', label: 'Passing', gradeField: 'passer',
      stats: ['att', 'cmp', 'yds', 'td', 'int', 'sck'],
      measures: [{ key: 'att', label: 'Att', read: 'count' }, { key: 'yds', label: 'Yds', read: 'total' }] },
    { key: 'receiving', label: 'Receiving', gradeField: 'receiver',
      stats: ['rec', 'yds', 'td', 'long'],
      measures: [{ key: 'rec', label: 'Rec', read: 'count' }, { key: 'yds', label: 'Yds', read: 'total' }] },
    { key: 'tackles', label: 'Tackles', gradeField: 'tackler',
      stats: ['tkl', 'solo', 'ast', 'sack', 'tfl', 'int', 'fr'],
      // Interceptions and fumble recoveries are the canonical takeaway pair, so a
      // takeaway-only credit states itself instead of reading as zero tackles.
      measures: [{ key: 'tkl', label: 'Tkl', read: 'count' },
        { key: 'int', label: 'INT', read: 'count' }, { key: 'fr', label: 'FR', read: 'count' }] },
    { key: 'returns', label: 'Return Game', gradeField: null,
      stats: ['ret', 'yds', 'td', 'long'],
      measures: [{ key: 'ret', label: 'Ret', read: 'count' }, { key: 'yds', label: 'Yds', read: 'total' }] },
    { key: 'kicking', label: 'Kicking / Punting', gradeField: null,
      stats: ['fgAtt', 'fgMade', 'punts', 'puntYds'],
      measures: [{ key: 'fgAtt', label: 'FG att', read: 'count' },
        { key: 'punts', label: 'Punts', read: 'count' },
        { key: 'puntYds', label: 'Punt yds', read: 'total' }] },
  ]);

  /** A role's stats as `{ n, total, measured, long, refs }`, plus its grade and
   *  its own full attributed cohort. One player, one role, read once. */
  _playerRoleFacts(role) {
    const stats = {};
    role.stats.forEach((entries, key) => { stats[key] = StatsEngine._statFacts(entries); });
    const cohort = role.stats.get(StatsEngine.PLAYER_ROLE_COHORT) || [];
    const plays = cohort.map(item => item.play);
    const facts = {
      key: role.key, label: role.label, stats, plays,
      refs: StatsEngine._refsOf(plays),
      // A grade average exists only where grades were actually charted.
      grade: role.gradeCount ? +(role.gradeSum / role.gradeCount).toFixed(1) : null,
      gradeCount: role.gradeCount,
    };
    facts.measures = StatsEngine.playerRoleMeasures(facts);
    facts.summary = StatsEngine.playerRoleSummary(facts);
    return facts;
  }

  /** The role's declared measures, each read from its OWN bucket. A bucket that
   *  does not exist is unmeasured (`measured: false`), which is a different
   *  statement from a bucket that exists and is empty — a measured zero. */
  static playerRoleMeasures(facts) {
    const schema = StatsEngine.PLAYER_ROLES.find(item => item.key === facts?.key);
    if (!schema) return [];
    return schema.measures.map(measure => {
      const fact = facts.stats[measure.key];
      return {
        key: measure.key, label: measure.label,
        value: fact ? (measure.read === 'total' ? fact.total : fact.n) : 0,
        measured: !!fact,
        refs: fact?.refs || [],
      };
    });
  }

  /**
   * A role's one-line summary: the measures that ACTUALLY happened, or the
   * credited play count when none of them did. THE SCREEN AND THE PRINTED
   * REPORT READ THIS ONE OWNER, because they drifted: the export summarised a
   * game from the first two stats of a fixed list, which printed "0 field goal
   * attempts, 0 field goals made" for a punt-only kicker and "0 tackles, 0
   * solo" for a takeaway-only defender — zeros that hide the production
   * establishing the player's role. `null` means the role was not credited at
   * all, which each surface renders in its own absence treatment.
   */
  static playerRoleSummary(facts) {
    const happened = StatsEngine.playerRoleMeasures(facts)
      .filter(measure => measure.measured && measure.value);
    if (happened.length) return happened.map(m => `${m.value} ${m.label.toLowerCase()}`).join(', ');
    const plays = facts?.plays?.length || 0;
    return plays ? `${plays} play${plays === 1 ? '' : 's'}` : null;
  }

  /** Every player credited in the cohort, with each populated role's facts.
   *  `labels` maps a game id to its opponent name; `roster` maps a jersey
   *  number to a name. Neither is inferred. */
  playersBoard(plays, { roster = {}, labels = {} } = {}) {
    const credits = this._playerCredits(plays);
    const order = new Map(StatsEngine.PLAYER_ROLES.map((role, index) => [role.key, index]));
    const players = [...credits.values()].map(player => {
      const roles = [...player.roles.values()]
        .sort((a, b) => (order.get(a.key) ?? 99) - (order.get(b.key) ?? 99))
        .map(role => this._playerRoleFacts(role));
      const name = String(roster[player.num] || '').trim();
      return { num: player.num, name, label: `#${player.num}${name ? ` ${name}` : ''}`, roles };
    }).sort((a, b) => (Number(a.num) || 0) - (Number(b.num) || 0));
    return { players, labels, roleSchema: StatsEngine.PLAYER_ROLES };
  }

  /** One player's detail: the same role facts, split by game and by a charted
   *  dimension. `gameOrder` fixes chronology; a game with no credited play for
   *  this player is not rendered as a zero. */
  playerDetail(plays, num, { roster = {}, labels = {}, gameOrder = [] } = {}) {
    const id = String(num || '').trim();
    const cohort = (plays || []).filter(play => play && play.tags);
    const player = this.playersBoard(cohort, { roster, labels }).players.find(item => item.num === id);
    if (!player) return null;
    /* GAME ROWS ARE THE SAME BUCKETS, NARROWED. Each row runs the one credit
       owner over that game's plays, so the rows partition the cohort and sum
       back to the totals above them by construction rather than by a second
       calculation agreeing by luck. A game the player was credited in no role
       on is not a row: an uncredited game is an absence, not a zero. */
    const order = new Map(gameOrder.map((gid, position) => [String(gid), position]));
    const ids = [...new Set(player.roles.flatMap(role =>
      role.plays.map(play => String(play.__gid ?? 'current'))))];
    const games = ids.map(gid => {
      const gamePlays = cohort.filter(play => String(play.__gid ?? 'current') === gid);
      const inGame = this.playersBoard(gamePlays, { roster, labels }).players.find(item => item.num === id);
      return {
        gid, opponent: labels[gid] || gid,
        position: order.has(gid) ? order.get(gid) : Number.MAX_SAFE_INTEGER,
        roles: Object.fromEntries((inGame?.roles || []).map(role => [role.key, role])),
      };
    }).sort((a, b) => a.position - b.position || String(a.opponent).localeCompare(String(b.opponent)));
    return { ...player, games };
  }

  /** The dimensions a player's populated roles can actually be split by, in
   *  render order. Offensive structure describes our own call and so belongs to
   *  a player credited on offense; front/coverage/blitz describe the defense a
   *  DEFENDER played; the Special Teams pair belongs to the kicking units. No
   *  dimension is offered to a role whose plays cannot carry it. */
  static PLAYER_DIMENSIONS = Object.freeze([
    { key: 'downDistance', label: 'Down & distance', roles: ['rushing', 'passing', 'receiving', 'tackles'] },
    { key: 'quarter', label: 'Quarter', roles: ['rushing', 'passing', 'receiving', 'tackles', 'returns', 'kicking'] },
    { key: 'fieldZone', label: 'Field zone', roles: ['rushing', 'passing', 'receiving', 'tackles', 'returns', 'kicking'] },
    { key: 'hash', label: 'Hash', roles: ['rushing', 'passing', 'receiving', 'tackles'] },
    { key: 'runPass', label: 'Run / Pass', roles: ['rushing', 'passing', 'receiving', 'tackles'] },
    { key: 'playType', label: 'Play type', roles: ['rushing', 'passing', 'receiving', 'tackles'] },
    { key: 'playDir', label: 'Play direction', roles: ['rushing', 'passing', 'receiving', 'tackles'] },
    { key: 'formationFamily', label: 'Formation', roles: ['rushing', 'passing', 'receiving'] },
    { key: 'personnel', label: 'Personnel', roles: ['rushing', 'passing', 'receiving'] },
    { key: 'defFront', label: 'Defensive front', roles: ['tackles'] },
    { key: 'coverage', label: 'Coverage', roles: ['tackles'] },
    { key: 'blitz', label: 'Blitz', roles: ['tackles'] },
    { key: 'stUnit', label: 'Special Teams unit', roles: ['returns', 'kicking'] },
    { key: 'stOutcome', label: 'Special Teams outcome', roles: ['returns', 'kicking'] },
  ]);

  /** One play's values for a dimension, through the CANONICAL splitter each
   *  dimension already has. A multi-value tag credits every component, the rule
   *  every other multi-select consumer applies. An uncharted value yields no
   *  row rather than an invented "Unknown" bucket. */
  _playerDimensionValues(play, key) {
    const tags = play.tags || {};
    const projection = StatsEngine.proj(play);
    const text = value => String(value == null ? '' : value).trim();
    const one = value => (text(value) ? [text(value)] : []);
    switch (key) {
      // `_ddKey` + `_ddPretty` are the one owner of this wording; nothing here
      // re-buckets a distance or re-words a label.
      case 'downDistance': { const key = this._ddKey(tags); return key ? [this._ddPretty(key)] : []; }
      case 'quarter': return one(tags.quarter);
      case 'fieldZone': return one(this.fieldZoneOf(play));
      case 'hash': return one(tags.hash);
      case 'runPass': return StatsEngine.isRun(play) ? ['Run'] : StatsEngine.isPass(play) ? ['Pass'] : [];
      case 'playType': return StatsEngine.splitPlayTypes(tags.playType).filter(Boolean);
      case 'playDir': return one(tags.playDir);
      case 'formationFamily': return StatsEngine.splitFormations(projection.formationFamily).filter(Boolean);
      case 'personnel': return one(tags.personnel);
      case 'defFront': return StatsEngine.splitFronts(tags.defFront).filter(Boolean);
      case 'coverage': return one(projection.coverage);
      case 'blitz': return StatsEngine.splitBlitzes(tags.blitz).filter(Boolean);
      case 'stUnit': {
        const event = SpecialTeamsModel.normalize(play.specialTeams);
        return event ? one(SpecialTeamsModel.UNIT_LABELS[event.unit] || event.unit) : [];
      }
      case 'stOutcome': {
        const event = SpecialTeamsModel.normalize(play.specialTeams);
        return event ? one(event.outcome.status ? StatsEngine.PLAYER_ST_OUTCOME_LABELS[event.outcome.status] : '') : [];
      }
      default: return [];
    }
  }

  static PLAYER_ST_OUTCOME_LABELS = Object.freeze({
    returned: 'Returned', touchback: 'Touchback', fairCatch: 'Fair catch', downed: 'Downed',
    outOfBounds: 'Out of bounds', blocked: 'Blocked', muffed: 'Muffed', recovered: 'Recovered',
    good: 'Good', noGood: 'No good', badSnap: 'Bad snap',
  });

  /** A player-role cohort split by one dimension. Volume and production are the
   *  role's OWN measures, recomputed from the credit index over each group, so
   *  a row reconciles with the role summary above it and opens exactly the
   *  plays behind its own numbers. */
  playerSituational(plays, num, roleKey, dimension, { roster = {} } = {}) {
    const id = String(num || '').trim();
    const schema = StatsEngine.PLAYER_ROLES.find(role => role.key === roleKey);
    const spec = StatsEngine.PLAYER_DIMENSIONS.find(item => item.key === dimension);
    if (!schema || !spec || !spec.roles.includes(roleKey)) return [];
    const credits = this._playerCredits(plays);
    const role = credits.get(id)?.roles.get(roleKey);
    if (!role) return [];
    const cohort = (role.stats.get(StatsEngine.PLAYER_ROLE_COHORT) || []).map(item => item.play);
    const groups = new Map();
    cohort.forEach(play => {
      this._playerDimensionValues(play, dimension).forEach(value => {
        if (!groups.has(value)) groups.set(value, []);
        groups.get(value).push(play);
      });
    });
    return [...groups.entries()].map(([value, group]) => {
      const inGroup = this._playerCredits(group).get(id)?.roles.get(roleKey);
      const facts = inGroup ? this._playerRoleFacts(inGroup) : null;
      /* Every measure the role declares, each read from its OWN bucket. A value
         with no bucket at all is absent, not zero; a bucket that exists and is
         empty is a measured zero. */
      const measures = schema.measures.map(measure => {
        const fact = facts?.stats[measure.key];
        return {
          key: measure.key, label: measure.label,
          value: fact ? (measure.read === 'total' ? fact.total : fact.n) : 0,
          measured: !!fact,
          refs: fact?.refs || [],
        };
      });
      return {
        value,
        // The role's own credited plays in this group: the honest "did anything
        // happen here" test, and the count every measure sits beside.
        n: facts?.plays.length ?? group.length,
        measures,
        grade: facts?.grade ?? null,
        refs: facts?.refs || StatsEngine._refsOf(group),
      };
    }).filter(row => row.n > 0)
      .sort((a, b) => b.n - a.n || String(a.value).localeCompare(String(b.value), undefined, { numeric: true }));
  }

  /**
   * Play every snap matching `filter` back-to-back (cut-up). Shared by player
   * rows and every clickable stat row. Only plays with a real video region are
   * playable; if none match (e.g. stats-only imported plays), fall back to
   * selecting the first match so the click is never a silent no-op.
   */
  _watchPlays(filter, label) {
    if (typeof filter !== 'function') return;
    // Stats were computed over the filtered pool — the cut-up must match it,
    // or the row's count and what actually plays disagree.
    let pool = this.tagger.plays.filter(p => p && p.tags);
    if (this.filter && this.filter.active) pool = this.filter.filter(pool);
    const matches = playbackOrder(pool.filter(p => filter(p)));
    if (matches.length === 0) return;
    if (!this.filmNavigation) {
      throw new Error('StatsEngine requires FilmNavigationService for report film');
    }
    const playable = matches.filter(p => p.timestamp && p.timestamp.end > p.timestamp.start);
    const refs = this.filmNavigation.refsForGame(playable.length ? playable : matches);
    this.filmNavigation.watch(refs, {
      label: label || `${refs.length} plays`,
      fallback: playable.length ? undefined : 'select-first',
    });
  }

  /**
   * Build a play-filter predicate for a clickable stat row. Offense-tagged
   * dimensions (formation, play type, down, situation) match our offensive
   * plays; defensive dimensions (front/coverage/blitz) match our defensive
   * plays — mirroring how the dashboard partitions stats by unit.
   */
  // The "Big 12": the handful of formation·strength·motion → play combinations that make
  // up the bulk of an offense's snaps. Hudl's scouting axiom — most teams live in
  // ~8-14 calls (≈90% of snaps); find them and you've found the offense. Pure
  // rollup over data already tagged. The call signature is the EXACT tagged look,
  // so the cut-up plays precisely those snaps.
  _bigTwelveData(plays) {
    const off = (plays || []).filter(p => p && p.tags && countedUnit(p) === 'offense'
      && (StatsEngine.isRun(p) || StatsEngine.isPass(p)));
    const total = off.length;
    const map = {};
    off.forEach(p => {
      const t = p.tags;
      const pr = StatsEngine.proj(p);
      // The exact call is the full projected pre-snap look (§8a): a DC keys on QB
      // alignment and backfield too — "Under Center + Ace + I" and "…+ Offset" are
      // different calls and must not collapse.
      const qb = (pr.qbAlignment || '').trim(), form = (pr.formationFamily || '').trim();
      const bf = (pr.backfield || '').trim(), str = (pr.strength || '').trim();
      const mot = (t.motion || '').trim(), pt = (t.playType || '').trim();
      const key = [qb, form, bf, str, mot, pt].join('|||');
      const e = map[key] || (map[key] = { key, qb, form, bf, str, mot, pt, n: 0, runs: 0, yards: 0, succ: 0 });
      e.n++;
      if (StatsEngine.isRun(p)) e.runs++;
      e.yards += parseInt(t.yardage, 10) || 0;
      if (this._isSuccessfulPlay(p)) e.succ++;
    });
    const calls = Object.values(map).sort((a, b) => b.n - a.n);
    let cum = 0;
    calls.forEach(c => { c.pct = total ? Math.round(c.n / total * 100) : 0; cum += c.n; c.cumPct = total ? Math.round(cum / total * 100) : 0; });
    const callsTo = (target) => { let s = 0; for (let i = 0; i < calls.length; i++) { s += calls[i].n; if (total && s / total * 100 >= target) return i + 1; } return calls.length; };
    return { calls, total, unique: calls.length, to75: callsTo(75), to90: callsTo(90) };
  }

  /**
   * The subject team's name for report labels. S7-d1: these all read
   * #gameTeamName, a hidden input inside #app. gameInfo is the canonical owner
   * and GameContext is the seam over it, so the labels survive its deletion.
   */
  _subjectName(fallback = '') {
    return window.app?.gameContext?.snapshot?.().teamName || fallback;
  }

    _buildCutFilter(type, val) {
    const isOff = p => countedUnit(p) === 'offense';
    const isDef = p => p.tags.unit === 'defense';
    const absYL = p => this._absYardLine(p.tags);
    switch (type) {
      case 'qbAlignment': return p => isOff(p) && (StatsEngine.proj(p).qbAlignment || '') === val;
      case 'formationFamily': return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).includes(val);
      case 'receiverSet': return p => isOff(p) && (StatsEngine.proj(p).receiverSet || '') === val;
      // The run and motion details (ChartingDetails): one stored value each, a
      // blank is uncharted and never matches.
      case 'gap': return p => isOff(p) && (p.tags.gap || '') === val;
      case 'motionStart': return p => isOff(p) && (p.tags.motionStart || '') === val;
      case 'motionEnd': return p => isOff(p) && (p.tags.motionEnd || '') === val;
      case 'rpoRead': return p => isOff(p) && (p.tags.rpoRead || '') === val;
      case 'rpoDecision': return p => isOff(p) && (p.tags.rpoDecision || '') === val;
      case 'qbRun': return p => isOff(p) && (p.tags.qbRun || '') === val;
      case 'playCall':  return p => isOff(p) && (p.tags.playCall || '') === val;
      case 'playCallOrConcept': return p => isOff(p)
        && (p.tags.playCall || p.tags.playConcept || '') === val;
      case 'playConcept': return p => isOff(p) && (p.tags.playConcept || '') === val;
      case 'playType':  return p => isOff(p) && StatsEngine.splitPlayTypes(p.tags.playType).includes(val);
      case 'personnel': return p => isOff(p) && (p.tags.personnel || '') === val;
      case 'backfield': return p => isOff(p) && (StatsEngine.proj(p).backfield || '') === val;
      case 'strength':  return p => isOff(p) && (StatsEngine.proj(p).strength || '') === val;
      case 'comboFStr': { const [form, str] = val.split('__'); return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).includes(form) && (StatsEngine.proj(p).strength || '') === str; }
      case 'bigCall': {  // exact call: qbAlignment|||formation|||backfield|||strength|||motion|||playType (§8a)
        const [qb, form, bf, str, mot, pt] = val.split('|||');
        return p => isOff(p) && (StatsEngine.proj(p).qbAlignment || '').trim() === (qb || '')
          && (StatsEngine.proj(p).formationFamily || '').trim() === (form || '')
          && (StatsEngine.proj(p).backfield || '').trim() === (bf || '')
          && (StatsEngine.proj(p).strength || '').trim() === (str || '')
          && (p.tags.motion || '').trim() === (mot || '')
          && (p.tags.playType || '').trim() === (pt || '');
      }
      case 'down':      return p => isOff(p) && (p.tags.down || '') === val;
      case 'runpass':   return p => isOff(p) && (val === 'Run' ? StatsEngine.isRun(p) : StatsEngine.isPass(p));
      case 'playDir':   return p => isOff(p) && (p.tags.playDir || '') === val;
      case 'directionStrength': {
        const extract = StatsEngine._matrixDimensions().find(item => item.id === 'dirVsStrength')?.extract;
        return p => isOff(p) && (StatsEngine.isRun(p) || StatsEngine.isPass(p))
          && (extract?.(p) || []).includes(val);
      }
      case 'motion':    return p => isOff(p) && (val === 'No Motion' ? !p.tags.motion
                                  : val === 'Any' ? !!p.tags.motion
                                  : (p.tags.motion || '') === val);
      case 'hash':      return p => isOff(p) && (p.tags.hash || '') === val;
      case 'dd': {      // down + distance bucket, e.g. "3|Long"
        const [down, bucket] = val.split('|');
        return p => isOff(p) && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'ddDef': {   // same situation bucket, but our defensive snaps
        const [down, bucket] = val.split('|');
        return p => isDef(p) && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'comboFD': { // formation on a down+distance bucket, e.g. "Shotgun__3|Long"
        const [form, dd] = val.split('__');
        const [down, bucket] = (dd || '').split('|');
        return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).includes(form)
          && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'comboFS': { // formation on a heat-map situation, e.g. "Shotgun__3|Long" or "I-Form__1"
        const [form, sit] = val.split('__');
        const sp = this._situationPred(sit || '');
        return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).includes(form) && sp(p);
      }
      case 'defFront':  return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(val);
      case 'coverage':  return p => isDef(p) && (StatsEngine.proj(p).coverage || '') === val;
      case 'coverageFamily': return p => isDef(p) && (StatsEngine.proj(p).coverageFamily || '') === val;
      case 'blitz':     return p => isDef(p) && StatsEngine.splitBlitzes(p.tags.blitz).includes(val);
      case 'frontCoverage': {
        const [front, cov] = val.split('|');
        return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(front) && (StatsEngine.proj(p).coverage || '') === cov;
      }
      case 'penaltyFoul': return p => PenaltyModel.normalizeList(p.penalties).some(item => (item.foul || 'unknown') === val);
      case 'penaltyTeam': return p => PenaltyModel.normalizeList(p.penalties).some(item => item.team === val);
      case 'penaltyDisposition': return p => PenaltyModel.normalizeList(p.penalties).some(item => item.disposition === val);
      case 'situation': {
        switch (val) {
          case 'redZone':    return p => isOff(p) && absYL(p) !== null && absYL(p) >= 80;
          case 'goalLine':   return p => isOff(p) && absYL(p) !== null && absYL(p) >= 95;
          case 'backedUp':   return p => isOff(p) && absYL(p) !== null && absYL(p) <= 10;
          case 'thirdLong':  return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7;
          case 'thirdShort': return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 1 && (parseInt(p.tags.distance) || 0) <= 3;
          case 'explosive':  return p => isOff(p) && StatsEngine.isExplosive(p);
          case 'negative':   return p => isOff(p) && (parseInt(p.tags.yardage) || 0) < 0;
          default: return null;
        }
      }
      default: return null;
    }
  }

  _gameTitle() {
    const esc = Charts._esc;
    // projectName is derived (week + opponent) and lives on gameInfo now — there
    // is no #gameProjectName input.
    const gi = window.app?.storage?.gameInfo || {};
    const name = esc(gi.projectName || '');
    const t = esc(gi.teamName || this._subjectName(''));
    const o = esc(gi.opponent || '');
    const u = gi.scoreUs;
    const th = gi.scoreThem;
    const d = esc(gi.date || '');
    let title = 'Game Stats';
    if (name) title = name;
    else if (t || o) title = `${t || 'Us'} vs ${o || 'Opponent'}`;
    if (u !== '' && th !== '' && u != null && th != null) title += ` &mdash; ${esc(u)}-${esc(th)}`;
    if (d) title += ` (${d})`;
    return title;
  }

      /**
   * AX-4: the Overview header. Scoreboard on the left, Game at a Glance filling
   * the widescreen space on the right.
   *
   * The two are composed here rather than nested, because they answer different
   * questions from different data: the scoreboard needs tagged SCORING plays,
   * the glance needs tagged plays. Nesting the glance inside the scoreboard —
   * which is where it first went — meant a game charted without any scoring
   * tagged silently lost its glance panel too. When only one is available it
   * takes the full width.
   */
  /**
   * Reports redesign — the persistent KPI rail's raw numbers. Read-only counts
   * over the canonical play list, using the SAME `isPlayTagged` predicate
   * WorkspaceShell's Home progress-by-unit card already uses (js/workspace-
   * shell.js `_gameSummary`) — this is not a new formula, it is the identical
   * "count by tag-completeness x unit" read applied to the Reports header.
   * No value here feeds `compute()`, so nothing here touches parity.
   */
  _kpiRailData(stats) {
    const plays = this.tagger?.plays || [];
    const totalPlays = plays.length;
    const playsCharted = plays.filter(isPlayTagged).length;
    const units = { offense: 0, defense: 0, special: 0 };
    plays.forEach(p => {
      const u = countedUnit(p);
      if (Object.hasOwn(units, u)) units[u]++;
    });
    const sb = stats?.scoreboard;
    // The official score in Game Settings wins when present; stats.scoreboard
    // is only a reconstruction from tagged scoring plays. Same presence check
    // as _gameTitle().
    const gi = window.app?.storage?.gameInfo || {};
    const hasOfficialScore = gi.scoreUs !== '' && gi.scoreUs != null && gi.scoreThem !== '' && gi.scoreThem != null;
    const finalScore = hasOfficialScore ? { us: gi.scoreUs, them: gi.scoreThem }
      : ((sb && sb.hasData) ? { us: sb.us, them: sb.them } : null);
    // Turnover facts compose existing values: giveaways from the offense
    // turnover count, takeaways from the defensive one. Each is `null`, not 0,
    // when its unit has no plays, so a defense-only game never claims
    // "0 giveaways" (compute() produces `turnovers` even from no plays).
    const giveaways = (units.offense > 0 && stats?.turnovers) ? stats.turnovers.total : null;
    const takeaways = (units.defense > 0 && stats?.defensive) ? stats.defensive.turnovers : null;
    return {
      totalPlays, playsCharted, units,
      finalScore,
      successRate: stats?.efficiency?.successRate,
      turnovers: (giveaways != null || takeaways != null) ? { giveaways, takeaways } : null,
    };
  }

      /**
   * AX-4 "Game at a Glance" — factual, not advisory. Recommendations stay in
   * Study by design; this panel answers "what happened" in six numbers.
   *
   * Film linking is HONEST rather than uniform: a fact gets a `.cut-row` only
   * when an EXISTING cut filter already defines its exact cohort. Explosives,
   * negative plays, third downs and red-zone snaps have one; total plays and
   * yards-per-play are aggregates over everything and are shown as context
   * without pretending to a cohort. Inventing a cut type to make every tile
   * clickable would be the opposite of the film-link discipline this report is
   * built on. No value here is computed locally — every one is read from the
   * stats object the parity gate already covers.
   */
  /**
   * AX-7: one arithmetic owner for total yards and yards-per-play. The KPI
   * hero, Game at a Glance and the lens board all report this number, and
   * three private copies of the same expression is exactly how two surfaces
   * end up disagreeing about one game.
   */
  /* "1st & 10" from a play's own down and distance, or '' when either is
     missing. One owner, so a situation never renders two ways. */
  static situationLabel(play) {
    const tags = play?.tags || play || {};
    const down = String(tags.down || '').trim();
    const dist = String(tags.distance || '').trim();
    if (!down || !dist) return '';
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' }[down] || down;
    return `${ord} & ${dist}`;
  }

  static totalYards(stats) {
    return (stats?.rushing?.yards || 0) + (stats?.passing?.yards || 0);
  }

  static yardsPerPlay(stats) {
    const plays = stats?.totalPlays || 0;
    return plays ? (StatsEngine.totalYards(stats) / plays).toFixed(1) : '0.0';
  }
  /** Structured offense-shape data. Charts owns SVG generation; the native
   * Reports component owns every wrapper, label, table, and interaction. */
  _dataShape(stats, opts = {}) {
    const plays = opts.plays || stats.offPlays || [];
    if (!plays.length) return null;
    const dist = this._yardageBins(plays);
    const histHtml = dist ? Charts.histogram(dist.bins, { meanIndex: dist.meanIndex, label: 'Yards gained per play' }) : '';
    const scatterHtml = Charts.scatter(this._scatterPoints(plays), { label: 'Yards gained by distance to go' });
    const zoneHtml = Charts.zoneStrip(this._fieldZoneStats(plays));
    const downsHtml = Charts.smallMultiples(this._downMultiples(plays));
    let teamProfile = null;
    if (opts.cut !== false && opts.profile !== false) {
      try {
        const seasonStats = this._allSeasonGames()
          .filter(game => Array.isArray(game.plays) && game.plays.length)
          .map(game => this.compute(game.plays));
        if (seasonStats.length >= 2) teamProfile = this._teamProfile(stats, seasonStats, { compare: 'average' });
      } catch { teamProfile = null; }
    }
    return {
      histogram: histHtml ? { note: `X = yards gained, binned. Y = number of snaps. Loss = yardage below 0. Gold line = mean, ${dist?.mean ?? '0.0'} yards.`, html: histHtml } : null,
      scatter: scatterHtml ? { note: 'X = distance to go. Y = yards gained. One dot per snap. Dashed line = yards gained equals distance to go; above it converted.', html: scatterHtml } : null,
      zones: zoneHtml ? { note: 'Success rate by field position; empty zones have no charted snaps.', html: zoneHtml } : null,
      downs: downsHtml ? { note: 'Run/pass split and success rate by down.', html: downsHtml } : null,
      teamProfile,
    };
  }
  static _matrixDimensions() {
    return [
      { id: 'formationFamily',  label: 'Formation',  extract: p => StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily) },
      { id: 'receiverSet', label: 'Receiver Alignment', extract: p => [StatsEngine.proj(p).receiverSet || ''].filter(Boolean) },
      { id: 'qbAlignment', label: 'QB Alignment', extract: p => [StatsEngine.proj(p).qbAlignment || ''].filter(Boolean) },
      { id: 'backfield',  label: 'Backfield',  extract: p => [StatsEngine.proj(p).backfield || ''].filter(Boolean) },
      { id: 'strength',   label: 'Offensive Line Strength',   extract: p => [StatsEngine.proj(p).strength || ''].filter(Boolean) },
      { id: 'playType',   label: 'Play Type',  extract: p => StatsEngine.splitPlayTypes(p.tags.playType) },
      { id: 'down',       label: 'Down',        extract: p => [p.tags.down ? `${p.tags.down}` : '?'] },
      { id: 'distBucket', label: 'Distance',    extract: p => { const d = parseInt(p.tags.distance) || 0; return [d <= 3 ? 'Short (1-3)' : d <= 6 ? 'Med (4-6)' : 'Long (7+)']; } },
      { id: 'personnel',  label: 'Personnel',   extract: p => [p.tags.personnel || 'Unknown'] },
      { id: 'defFront',   label: 'Def Front',   extract: p => StatsEngine.splitFronts(p.tags.defFront) },
      { id: 'coverage',   label: 'Coverage',    extract: p => [StatsEngine.proj(p).coverage || ''].filter(Boolean) },
      { id: 'coverageFamily', label: 'Coverage Family', extract: p => [StatsEngine.proj(p).coverageFamily || ''].filter(Boolean) },
      { id: 'hash',       label: 'Hash',        extract: p => [p.tags.hash || 'Unknown'] },
      { id: 'playDir',    label: 'Direction',   extract: p => [p.tags.playDir || ''].filter(Boolean) },
      { id: 'gap',        label: 'Gap',         extract: p => [p.tags.gap || ''].filter(Boolean) },
      { id: 'qbRun',      label: 'QB Run Type', extract: p => [p.tags.qbRun || ''].filter(Boolean) },
      { id: 'rpoRead',    label: 'RPO Read',    extract: p => [p.tags.rpoRead || ''].filter(Boolean) },
      { id: 'rpoDecision', label: 'RPO Decision', extract: p => [p.tags.rpoDecision || ''].filter(Boolean) },
      { id: 'motion',     label: 'Motion',      extract: p => [p.tags.motion || 'No Motion'] },
      { id: 'quarter',    label: 'Quarter',     extract: p => [p.tags.quarter || '?'] },
      { id: 'runPass',    label: 'Run / Pass',  extract: p => [StatsEngine.isRun(p) ? 'Run' : 'Pass'] },
      /* H19 — the two reads a defensive coordinator asks for, as DIMENSIONS
         rather than two hardcoded tables. Registering them here means they
         pivot against formation, down, distance, personnel and each other, and
         they inherit the matrix's film-linking and min-sample gating. The
         static tables answered exactly two questions; these answer any
         combination.

         SIDE CONVENTION (CLAUDE.md v1.9.18): hash, strength and playDir are all
         recorded from the OFFENSE's perspective on every play regardless of
         unit. Both derivations depend on it.

         Balanced strength and middle hash have no side, so they remain
         distinct buckets rather than being counted as Toward or Away. */
      { id: 'dirVsStrength', label: 'Direction vs Strength', extract: p => {
        const dir = String(p.tags.playDir || '').trim();
        const rawStrength = String(StatsEngine.proj(p).strength || '').trim();
        const str = ChartingDetails.strengthSide(rawStrength);
        if (!dir || !rawStrength) return [];
        if (str !== 'Left' && str !== 'Right') return ['Balanced strength'];
        if (dir === 'Middle') return ['Middle'];
        return [dir === str ? 'Toward strength' : 'Away from strength'];
      } },
      { id: 'dirVsHash', label: 'Direction vs Hash', extract: p => {
        const dir = String(p.tags.playDir || '').trim();
        const hash = String(p.tags.hash || '').trim();
        if (!dir || !hash) return [];
        // Left hash => the field is to the RIGHT; right hash => field is LEFT.
        if (hash !== 'Left' && hash !== 'Right') return ['n-a (middle hash)'];
        const field = hash === 'Left' ? 'Right' : 'Left';
        if (dir === 'Middle') return ['Middle'];
        return [dir === field ? 'To the field' : 'To the boundary'];
      } },
    ];
  }

  _computeMatrix(plays, rowId, colId) {
    const dims = StatsEngine._matrixDimensions();
    const rowDim = dims.find(d => d.id === rowId) || dims[0];
    const colDim = dims.find(d => d.id === colId) || dims[1];
    const cells = {};
    const rowSet = new Set();
    const colSet = new Set();
    const rowCounts = {};
    const colCounts = {};

    let eligible = 0;   // §6.5: plays carrying a value on EVERY axis of the cross-tab
    plays.forEach(p => {
      const rows = rowDim.extract(p);
      const cols = colDim.extract(p);
      // A play blank on any axis is OMITTED from the cross-tab — never forced into
      // a cell (§6.5 / §6.4). It still counts in `total`; the gap is `omitted`.
      if (!rows.length || !cols.length) return;
      eligible++;
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);

      rows.forEach(r => {
        cols.forEach(c => {
          rowSet.add(r);
          colSet.add(c);
          const key = `${r}\0${c}`;
          if (!cells[key]) cells[key] = { count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
          cells[key].count++;
          if (isRun) cells[key].runs++; else cells[key].passes++;
          cells[key].yards += yds;
          if (succ) cells[key].successes++;
          rowCounts[r] = (rowCounts[r] || 0) + 1;
          colCounts[c] = (colCounts[c] || 0) + 1;
        });
      });
    });

    const rowKeys = [...rowSet].sort((a, b) => (rowCounts[b] || 0) - (rowCounts[a] || 0));
    const colKeys = [...colSet].sort((a, b) => (colCounts[b] || 0) - (colCounts[a] || 0));
    // §6.5 eligible-denominator disclosure: total (in scope), eligible (a value on
    // every axis), omitted (total − eligible). For two single-value axes each
    // eligible play lands in exactly one cell, so Σ cell.count === eligible; a
    // multi-value axis (e.g. formation) may repeat a play across rows, so the sum
    // can exceed eligible along that axis, but eligible still gates the cross-tab.
    const total = plays.length;
    return { rowDim, colDim, rowKeys, colKeys, cells, total, eligible, omitted: total - eligible };
  }

    /* H19 — one matrix, parameterized, rather than a second hardcoded report.
     `opts.plays` lets the opponent scout pivot THEIR snaps; `opts.row`/`opts.col`
     set the opening question. The coach asked for a pivot and I shipped two
     static tables; this is the thing he actually asked for. */
          _playerLabel(num) {
    // Fixed name overlay (e.g. the demo season) — owned by StorageManager and
    // independent of _seasonLabels, which the Season Stats view nulls after it
    // renders. Checked first so the demo's names survive opening that view.
    if (this._fixedLabels && this._fixedLabels[num]) return `#${num} ${this._fixedLabels[num]}`;
    // Season view supplies a merged name map across loaded games.
    if (this._seasonLabels && this._seasonLabels[num]) return `#${num} ${this._seasonLabels[num]}`;
    const roster = (typeof window !== 'undefined') && window.app && window.app.roster;
    return roster ? roster.getLabel(num) : `#${num}`;
  }

  /** HTML-safe player label for innerHTML sinks. _playerLabel stays RAW because
   *  it also feeds text contexts (the cut-up banner's textContent) where escaping
   *  would double-encode; escape here, at the HTML boundary. Player names come
   *  from the roster, which travels in importable/shareable season + CSV files. */
  _playerLabelHtml(num) { return Charts._esc(this._playerLabel(num)); }

  generateScoutReport(playsOverride = null) {
    const source = playsOverride || this._currentPlays();
    const plays = source.filter(p => countedUnit(p) !== 'special');
    if (plays.length === 0) return null;
    const stats = this.compute(plays);
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yards = parseInt(p.tags.yardage) || 0;
      const isTd = StatsEngine.hasResult(p, 'Touchdown');
      // Multi-select formation: attribute the play to each component look.
      StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
        if (!formationDetail[f]) formationDetail[f] = { total: 0, runs: 0, passes: 0, yards: 0, tds: 0, refs: [] };
        formationDetail[f].total++;
        if (isRun) formationDetail[f].runs++;
        else formationDetail[f].passes++;
        formationDetail[f].yards += yards;
        if (isTd) formationDetail[f].tds++;
        if (p.__gid != null && p.id != null) formationDetail[f].refs.push(`${p.__gid}::${p.id}`);
      });
    });
    const downTendency = {};
    plays.forEach(p => {
      const key = `${p.tags.down || '?'}&${p.tags.distance || '?'}`;
      if (!downTendency[key]) downTendency[key] = { runs: 0, passes: 0, total: 0, refs: [] };
      downTendency[key].total++;
      if (StatsEngine.isRun(p)) downTendency[key].runs++;
      else downTendency[key].passes++;
      if (p.__gid != null && p.id != null) downTendency[key].refs.push(`${p.__gid}::${p.id}`);
    });
    const fronts = {}, coverages = {};
    plays.forEach(p => {
      StatsEngine.splitFronts(p.tags.defFront).forEach(f => { fronts[f] = (fronts[f] || 0) + 1; });
      if (StatsEngine.proj(p).coverage) coverages[StatsEngine.proj(p).coverage] = (coverages[StatsEngine.proj(p).coverage] || 0) + 1;
    });
    const redZonePlays = plays.filter(p => {
      const yl = parseInt(p.tags.yardLine);
      return yl && (p.tags.fieldSide === 'opp' ? yl <= 20 : yl >= 80);
    });
    const thirdDownPlays = plays.filter(p => p.tags.down === '3');
    return {
      totalPlays: plays.length, stats,
      formationDetail: Object.entries(formationDetail).sort((a, b) => b[1].total - a[1].total)
        .map(([name, d]) => ({ name, ...d, refs: [...new Set(d.refs)], runPct: d.total ? Math.round(d.runs / d.total * 100) : 0 })),
      // G2 — no `.slice(0, 15)`. It silently dropped situations while the header
      // still counted them: 15 rows totalling 30 of 34 snaps, with no "and N
      // more". A report that looks complete and is not.
      downTendency: Object.entries(downTendency).sort((a, b) => b[1].total - a[1].total)
        .map(([key, d]) => ({ key, ...d, refs: [...new Set(d.refs)], runPct: d.total ? Math.round(d.runs / d.total * 100) : 0 })),
      byDown: this._scoutByDown(plays),
      byDistance: this._scoutByDistance(plays),
      fronts: Object.entries(fronts).sort((a, b) => b[1] - a[1]),
      coverages: Object.entries(coverages).sort((a, b) => b[1] - a[1]),
      redZone: { total: redZonePlays.length, tds: redZonePlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length },
      thirdDown: { total: thirdDownPlays.length, converted: thirdDownPlays.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length },
    };
  }

  /**
   * G2 — the two levels ABOVE the exact-situation table.
   *
   * The coach reads a scout top-down: what do they do on each down, then what
   * do they do by distance to the sticks, then — as reference — the exact
   * situations. Only the third existed, sorted by frequency, so the actionable
   * read had to be assembled in his head from rows like `2&13`.
   *
   * The four distance buckets are the coach's: 1-3 / 4-6 / 7-9 / 10+.
   *
   * DELIBERATELY NOT `_distBucket`. That bucketer is a THREE-way split
   * (Short 1-3 / Medium 4-6 / Long 7+) and it is parity-locked: it keys the
   * self-scout tells, the Predictability Map, and the `dd` / `comboFD` /
   * `comboFS` cut filters. Splitting its 7+ into 7-9 and 10+ would re-key every
   * existing tell and cut and move the goldens. This is a separate reporting
   * dimension that leaves that bucketer untouched.
   */
  /* G2 — down and distance, read top-down: by down, then by distance to the
     sticks, then every exact situation as reference. The coach's call: the
     bucketing leads because that is what he acts on in the moment, and the raw
     detail stays because it is worth having — it just stops being the headline,
     and stops being silently truncated. */
    /**
   * F12c — the team profile radar, and the decision that unblocked it.
   *
   * The blocker was never the drawing. Putting success rate on a 0-1 axis means
   * deciding what FULL SCALE means, and picking a number invents a benchmark.
   *
   * Measured against the coach's real season: best game 70.4% success, worst
   * 20.0%, season 42.5%. On a 0-100 axis all six games bunch in the bottom two
   * thirds and the shapes are visually indistinguishable — a chart that says
   * nothing. Scaled to his OWN achieved best they spread across the full axis
   * and the shape answers a real question: how did this game compare to us at
   * our best?
   *
   * So full scale is the season maximum per spoke — a number the team has
   * actually reached. Nothing is invented and no benchmark is implied. A game
   * that sets a new best redefines the axis, which is correct, and the caption
   * says so rather than letting the scale move silently.
   *
   * Lower-is-better spokes are inverted so that OUTWARD always means BETTER;
   * a radar where one spoke means the opposite of its neighbours is a trap.
   */
  /**
   * Reports redesign (item D) — the default comparison is now CURRENT GAME
   * vs SEASON AVERAGE, not per-axis Season Best. Every axis keeps a fixed
   * [0, best-of-season] scale (so "further out" always means "closer to the
   * best game we've played", the same honest anchor the old best-only view
   * used) but now plots TWO points on it: this game, and the season mean —
   * both reported as real values, not only the normalized geometry. Season
   * Best remains available as a secondary series via `opts.compare`.
   */
  _teamProfile(gameStats, seasonGames, opts = {}) {
    const measure = (stats) => {
      const e = stats?.efficiency || {};
      const d = stats?.downs || {};
      const drives = stats?.drives || {};
      return {
        success: parseFloat(e.successRate) || 0,
        explosive: parseFloat(e.explosivePct) || 0,
        negative: parseFloat(e.negativePct) || 0,
        thirdDown: parseFloat(d.thirdDownPct) || 0,
        ypp: parseFloat(StatsEngine.yardsPerPlay(stats)) || 0,
        pointsPerDrive: parseFloat(drives.pointsPerDrive) || 0,
      };
    };
    const SPOKES = [
      { key: 'ypp', label: 'Yards / play', lower: false, fmt: v => v.toFixed(1) },
      { key: 'success', label: 'Success rate', lower: false, fmt: v => `${v.toFixed(1)}%` },
      { key: 'explosive', label: 'Explosive Plays Rate', lower: false, fmt: v => `${v.toFixed(1)}%` },
      { key: 'negative', label: 'Negative rate', lower: true, fmt: v => `${v.toFixed(1)}%` },
      { key: 'thirdDown', label: '3rd down', lower: false, fmt: v => `${v.toFixed(1)}%` },
      { key: 'pointsPerDrive', label: 'Points / drive', lower: false, fmt: v => v.toFixed(1) },
    ];
    const now = measure(gameStats);
    const history = (seasonGames || []).map(measure);
    if (!history.length) return null;
    const compare = opts.compare === 'best' ? 'best' : 'average';

    const axes = SPOKES.map(spoke => {
      const values = history.map(h => h[spoke.key]).filter(v => Number.isFinite(v));
      const best = spoke.lower ? Math.min(...values) : Math.max(...values);
      const worst = spoke.lower ? Math.max(...values) : Math.min(...values);
      const mean = values.length ? values.reduce((s, v) => s + v, 0) / values.length : 0;
      const value = now[spoke.key];
      const compareValue = compare === 'best' ? best : mean;
      // Outward is always better; the scale is fixed to [worst, best] across
      // the season so a moved axis on ONE series doesn't silently rescale
      // the other. For a lower-is-better spoke the direction inverts.
      const span = Math.abs(best - worst);
      const ratioOf = v => Math.max(0, Math.min(1, span ? Math.abs(v - worst) / span : (values.length ? 1 : 0)));
      return {
        label: spoke.label, value, valueLabel: spoke.fmt(value),
        compareValue, compareLabel: spoke.fmt(compareValue),
        best, lower: spoke.lower,
        ratio: ratioOf(value),
        compareRatio: ratioOf(compareValue),
        isBest: spoke.lower ? value <= best : value >= best,
      };
    });
    return { axes, games: history.length, newBest: axes.some(a => a.isBest), compare };
  }

  _scoutByDown(plays) {
    const rows = ['1', '2', '3', '4'].map(down => {
      const set = (plays || []).filter(p => String(p.tags?.down || '') === down);
      const runs = set.filter(p => StatsEngine.isRun(p)).length;
      const yards = set.reduce((sum, p) => sum + (parseInt(p.tags?.yardage, 10) || 0), 0);
      const refs = [...new Set(set.filter(p => p.__gid != null && p.id != null).map(p => `${p.__gid}::${p.id}`))];
      return {
        key: down, label: `${down}${down === '1' ? 'st' : down === '2' ? 'nd' : down === '3' ? 'rd' : 'th'}`,
        total: set.length, runs, passes: set.length - runs,
        runPct: set.length ? Math.round(runs / set.length * 100) : 0,
        avg: set.length ? (yards / set.length).toFixed(1) : '0.0', refs,
      };
    });
    return rows.filter(r => r.total);   // empty is omitted, not zeroed
  }

  _scoutByDistance(plays) {
    const BUCKETS = [
      { key: '1-3', label: '1–3', min: 1, max: 3 },
      { key: '4-6', label: '4–6', min: 4, max: 6 },
      { key: '7-9', label: '7–9', min: 7, max: 9 },
      { key: '10+', label: '10+', min: 10, max: Infinity },
    ];
    const rows = BUCKETS.map(bucket => {
      const set = (plays || []).filter(p => {
        const dist = parseInt(p.tags?.distance, 10);
        return Number.isFinite(dist) && dist >= bucket.min && dist <= bucket.max;
      });
      const runs = set.filter(p => StatsEngine.isRun(p)).length;
      const yards = set.reduce((sum, p) => sum + (parseInt(p.tags?.yardage, 10) || 0), 0);
      const refs = [...new Set(set.filter(p => p.__gid != null && p.id != null).map(p => `${p.__gid}::${p.id}`))];
      return {
        key: bucket.key, label: bucket.label, total: set.length, runs, passes: set.length - runs,
        runPct: set.length ? Math.round(runs / set.length * 100) : 0,
        avg: set.length ? (yards / set.length).toFixed(1) : '0.0', refs,
      };
    });
    return rows.filter(r => r.total);
  }

  // ---- Opponent Scout: aggregate from games you've ALREADY tagged ----
  // No re-tagging. In a game you played them, their tendencies are already on
  // the other side of the ball: your DEFENSIVE snaps carry their offense
  // (formation / play type / result you faced), your OFFENSIVE snaps carry the
  // fronts & coverages they showed you. A perspective:'scout' game (you tagged
  // their film directly) is taken as-tagged. Aggregates EVERY game vs them
  // across ALL seasons — current season in-memory (freshest), others read
  // straight from localStorage (browser: ffa_season_<id>).
  _allSeasonGames() {
    const games = [];
    const store = window.app && window.app.storage && window.app.storage.seasonStore;
    let curId = null;
    if (store) {
      curId = store.currentSeasonId;
      const currentGames = window.app?.season?._effectiveGames?.() || (store.data && Array.isArray(store.data.games) ? store.data.games : []);
      currentGames.forEach(g => games.push(g));
    }
    let lib = [];
    try { lib = JSON.parse(localStorage.getItem('ffa_library') || '[]') || []; } catch (e) {}
    lib.forEach(meta => {
      if (!meta || !meta.id || meta.id === curId) return;
      try {
        const sd = JSON.parse(localStorage.getItem('ffa_season_' + meta.id) || 'null');
        if (sd && Array.isArray(sd.games)) sd.games.forEach(g => games.push(g));
      } catch (e) {}
    });
    return games;
  }

  _activeOpponent() {
    try {
      const d = window.app.storage.seasonStore.data;
      if (d && Array.isArray(d.games)) {
        const g = d.games.find(x => x.id === d.activeGameId) || d.games[0];
        const o = g && g.gameInfo && g.gameInfo.opponent;
        if (o && String(o).trim()) return String(o).trim();
      }
    } catch (e) {}
    return String(window.app?.storage?.gameInfo?.opponent || '').trim();
  }

  /**
   * F3 — every charted game is a scouting source.
   *
   * The aggregation has always worked; it was only ever REACHABLE for the
   * active game's opponent, through one button, so a coach with six charted
   * games saw one scout report and concluded the rest generated nothing.
   * This lists every opponent with charted film across every season, so the
   * report exists for all of them and the coach can move between them.
   *
   * A head-to-head game counts exactly like scout film: our defensive snaps
   * carry their offense, our offensive snaps carry the fronts and coverages
   * they showed. Charting a game IS scouting the team we played.
   */
  listScoutableOpponents() {
    const byName = new Map();
    this._allSeasonGames().forEach(game => {
      const name = String(game?.gameInfo?.opponent || '').trim();
      if (!name) return;
      const plays = Array.isArray(game.plays) ? game.plays : [];
      // Coverage is a PROJECTED field — it must be read through `proj` so a
      // legacy value embedded in another tag is seen the same way everywhere.
      const charted = plays.filter(play => play?.tags && (play.tags.playType || play.tags.runPass
        || play.tags.defFront || StatsEngine.proj(play).coverage || play.tags.unit === 'special')).length;
      if (!charted) return;
      const key = name.toLowerCase();
      const entry = byName.get(key) || { name, games: 0, plays: 0, scoutFilm: 0 };
      entry.games += 1;
      entry.plays += charted;
      if (String(game?.gameInfo?.perspective || '') === 'scout') entry.scoutFilm += 1;
      byName.set(key, entry);
    });
    return [...byName.values()].sort((a, b) => b.plays - a.plays || a.name.localeCompare(b.name));
  }

  /**
   * F4 — the opponent's defense, read off OUR offensive snaps.
   *
   * Each of those plays is a joint observation: their front / coverage /
   * pressure, our formation / personnel / down and distance, and what
   * happened. Four questions a coordinator actually asks:
   *
   *   effectiveness — where did they hurt us, where did we hurt them
   *   byOurLook     — what do they call against what we show
   *   bySituation   — money downs, red zone, and how the call changes
   *   pressure      — how often they bring it, and what it costs
   *
   * Every number here is counted from plays, using the same isRun/isPass,
   * success and explosive rules the rest of the engine uses. No new formula.
   * Rows carry their own play ids so each one stays film-linked.
   */
  _opponentDefenseJoin(defPlays, ourOnly = new Set()) {
    const plays = (defPlays || []).filter(play => play?.tags);
    if (!plays.length) return null;
    const EXPLOSIVE = play => (StatsEngine.isRun(play) ? 12 : 16);
    const blank = name => ({ name, n: 0, yards: 0, succ: 0, expl: 0, neg: 0, sacks: 0, tos: 0, refs: [] });
    const add = (bucket, play) => {
      const yards = parseInt(play.tags.yardage) || 0;
      bucket.n += 1;
      bucket.yards += yards;
      if (this._isSuccessfulPlay(play)) bucket.succ += 1;
      if (yards >= EXPLOSIVE(play)) bucket.expl += 1;
      if (yards < 0) bucket.neg += 1;
      if (StatsEngine.hasResult(play, 'Sack')) bucket.sacks += 1;
      if (StatsEngine.isGiveaway(play)) bucket.tos += 1;
      if (play.__gid != null && play.id != null) bucket.refs.push(`${play.__gid}::${play.id}`);
    };
    const finish = bucket => ({
      ...bucket,
      avg: bucket.n ? (bucket.yards / bucket.n).toFixed(1) : '0.0',
      succPct: bucket.n ? Math.round(bucket.succ / bucket.n * 100) : 0,
      explPct: bucket.n ? Math.round(bucket.expl / bucket.n * 100) : 0,
      refs: [...new Set(bucket.refs)],
    });
    const group = (keyOf) => {
      const map = new Map();
      plays.forEach(play => {
        keyOf(play).forEach(key => {
          if (!key) return;
          if (!map.has(key)) map.set(key, blank(key));
          add(map.get(key), play);
        });
      });
      return [...map.values()].map(finish).sort((a, b) => b.n - a.n);
    };

    const fronts = group(play => StatsEngine.splitFronts(play.tags.defFront).filter(front => front && !ourOnly.has(front)));
    const coverages = group(play => [StatsEngine.proj(play).coverage]);
    const byOurLook = group(play => StatsEngine.splitFormations(StatsEngine.proj(play).formationFamily));
    const bySituation = group(play => {
      const down = play.tags.down, distance = parseInt(play.tags.distance) || 0;
      const keys = [];
      if (down === '3' || down === '4') keys.push(distance >= 7 ? 'Money down, long' : 'Money down, short');
      else if (down) keys.push('Early down');
      const zone = this.fieldZoneOf(play);
      if (zone === 'Red zone' || zone === 'Goal line') keys.push('Red zone');
      if (zone === 'Backed up') keys.push('Backed up');
      return keys;
    });

    // Pressure is a rate question, not a ranking: how often do they bring it,
    // and is our answer better or worse when they do?
    const blitzed = blank('Pressure'), noBlitz = blank('No pressure');
    plays.forEach(play => add(StatsEngine.splitBlitzes(play.tags.blitz).length ? blitzed : noBlitz, play));

    const total = plays.length;
    const topOf = list => list.find(row => row.n >= 3) || list[0] || null;
    return {
      total,
      fronts, coverages, byOurLook, bySituation,
      pressure: { blitzed: finish(blitzed), noBlitz: finish(noBlitz),
        ratePct: total ? Math.round(blitzed.n / total * 100) : 0 },
      // "The exceptions are the tell": at 97% one front, the interesting rows
      // are the other 3%. Surface when they deviate, not just that they rarely do.
      baseFront: topOf(fronts),
      baseCoverage: topOf(coverages),
      changeups: fronts.filter(row => row.n < Math.max(2, total * 0.15)),
      best: [...byOurLook].filter(row => row.n >= 3).sort((a, b) => b.succPct - a.succPct)[0] || null,
      worst: [...byOurLook].filter(row => row.n >= 3).sort((a, b) => a.succPct - b.succPct)[0] || null,
    };
  }

  generateOpponentScout(opponentName) {
    const target = String(opponentName || '').trim().toLowerCase();
    if (!target) return null;
    const matched = this._allSeasonGames().filter(g =>
      String((g.gameInfo && g.gameInfo.opponent) || '').trim().toLowerCase() === target);
    const offPlays = [], defPlays = [], stPlays = [];
    matched.forEach(g => {
      const scout = String((g.gameInfo && g.gameInfo.perspective) || '') === 'scout';
      (g.plays || []).forEach(p => {
        const play = { ...p, __gid: g.id };
        const unit = countedUnit(p);
        // In opponent-film scout games the charted subject IS the opponent, so
        // their Special Teams is unambiguous. A head-to-head self-scout game
        // stores our subject perspective; do not silently flip its ST events.
        if (unit === 'special') {
          if (scout) stPlays.push(play);
          return;
        }
        if (scout ? unit === 'offense' : unit === 'defense') offPlays.push(play);
        else if (scout ? unit === 'defense' : unit === 'offense') defPlays.push(play);
      });
    });
    // Their offense is read from snaps we tagged as DEFENSE, but compute()
    // partitions run/pass BY UNIT — so present those snaps AS offense or the
    // overview KPIs (run/pass, run%, avg yards) read 0/0 even though the plays
    // carry runPass. (formationDetail/downTendency use isRun directly, which is
    // why the tables were right while the overview was empty.)
    const asOffense = offPlays.map(p => ({ ...p, tags: { ...p.tags, unit: 'offense' } }));
    // Their defense = the fronts/coverages we faced on our OFFENSE snaps. Exclude
    // our OWN custom fronts — they can never be the opponent's call, so any
    // occurrence here is carry leak from our defensive snaps (the "Maverick
    // shows up in their fronts" bug). SeasonStore.OUR_DEF_ONLY_FRONTS is
    // already the canonical source for this exact list (used by
    // stripStAlignment's sibling cleanup) — reuse it instead of reading the
    // DOM (S7 demolition; the chip markup is not a required runtime
    // dependency) or duplicating the list a third place.
    const ourOnly = new Set(SeasonStore.OUR_DEF_ONLY_FRONTS);
    const frontCounts = {}, covCounts = {};
    defPlays.forEach(p => {
      StatsEngine.splitFronts(p.tags.defFront).forEach(f => { if (f && !ourOnly.has(f)) frontCounts[f] = (frontCounts[f] || 0) + 1; });
      if (StatsEngine.proj(p).coverage) covCounts[StatsEngine.proj(p).coverage] = (covCounts[StatsEngine.proj(p).coverage] || 0) + 1;
    });
    const sortDesc = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return {
      opponent: opponentName,
      games: matched.length,
      // F4 — the JOIN. Every offensive snap we charted stores their front,
      // coverage and pressure TOGETHER with our look and the outcome, so the
      // defensive scout is not "what fronts do they own" (one row, no action)
      // but "what did they call against what we showed, and what did it cost".
      defenseJoin: this._opponentDefenseJoin(defPlays, ourOnly),
      offReport: asOffense.length ? this.generateScoutReport(asOffense) : null,
      offPlays: asOffense,
      offCount: offPlays.length,
      defPlays,
      defFronts: sortDesc(frontCounts),
      defCoverages: sortDesc(covCounts),
      defCount: defPlays.length,
      stPlays,
      stStats: stPlays.length ? this.compute(stPlays) : null,
      stCount: stPlays.length,
    };
  }

    // ================================================================
  // SELF-SCOUT — flip the scouting lens on your own offense to reveal
  // what tendencies you're tipping. Distinct from the opponent scout
  // report: it flags predictability, ranks your "tells", and suggests
  // counters. Run/pass-classifiable offensive plays only.
  // ================================================================

  /** Minimum sample for a grouping to be considered a tell / counted. */
  static get _SELF_SCOUT_MIN_N() { return 4; }
  /** Minimum scheme-tagged defensive snaps before the defensive self-scout
   *  will identify a tendency. Named so the diagnostic empty state can state
   *  the same number the gate applies. */
  static get _DEF_SELF_SCOUT_MIN_N() { return 6; }

  /** Coordinator distance buckets — coaches game-plan by Short/Medium/Long,
   *  not by exact yards. Bucketing also keeps per-situation samples large
   *  enough for a tendency to mean something (15 of 20 on "3rd & Long" is a
   *  pattern; 3 of 4 on "3rd & 7" is noise). */
  static _distBucket(dist) { return dist <= 3 ? 'Short' : dist <= 6 ? 'Medium' : 'Long'; }

  /** The distance bands in football order, so a down/distance ranking can
   *  break a tie on the situation itself rather than on object order. */
  static DIST_BUCKETS = ['Short', 'Medium', 'Long'];

  /** The N down-and-distance situations a game leaned on hardest: most snaps
   *  first, then earliest down, then shortest distance. The approved Overview
   *  composition renders a FIXED number of these rows, so the ranking is the
   *  contract that decides which situations occupy them — never a slice of
   *  whatever order the buckets happened to accumulate in. */
  static rankDownDistance(buckets, limit) {
    return [...(buckets || [])]
      .sort((a, b) => b.count - a.count
        || Number(a.down) - Number(b.down)
        || StatsEngine.DIST_BUCKETS.indexOf(a.bucket) - StatsEngine.DIST_BUCKETS.indexOf(b.bucket))
      .slice(0, limit);
  }

  /** What the OPPONENT produced on our defensive snaps — the same rushing,
   *  passing and drive formulas, over the defensive cohort. A defensive play
   *  records what their offense did, and every alignment field is already
   *  stored from the offense's perspective, so no second formula exists and
   *  none is introduced: `_rushingStats`, `_passingStats` and `_driveStats`
   *  are cohort-generic and are called here unchanged. Read as ALLOWED. */
  opponentProduction(defPlays, allPlays = null) {
    const plays = defPlays || [];
    /* A defensive snap records the opponent's offense — EXCEPT when we scored
       on it. A pick-six is charted on a defensive snap as `Interception +
       Touchdown`, and handing that to the offense-oriented passing formula
       credits the opponent with a completion and a passing touchdown for a play
       they lost the ball on. `scoringSide` is the canonical owner of that
       question and already answers it correctly; the production formulas simply
       never asked. A fumble-return touchdown has the same shape on the rushing
       side. The snap stays in the drive cohort — it still ended their
       possession — and is excluded only from their PRODUCTION. */
    const theirs = plays.filter(p => !(StatsEngine.hasResult(p, 'Touchdown')
      && StatsEngine.scoringSide(p) === 'us'));
    return {
      rushing: this._rushingStats(theirs),
      passing: this._passingStats(theirs),
      // The full game in charted order, so a drive we forced to a punt reads
      // as a punt rather than as the last snap before it.
      drives: this._driveStats(plays, { all: allPlays || plays }),
    };
  }

  /** The canonical Overview play-type set. The comp's Yards by type module is a
   *  FIXED list, so the types are enumerated rather than taken from whatever a
   *  game happened to chart — a type with no snaps reads 0, which is a real
   *  fact about the call sheet, not an absence. Order is run, pass by depth,
   *  then RPO, which is how a coach reads a call sheet. */
  static OVERVIEW_PLAY_TYPES = ['Run Inside', 'Run Outside', 'Short Pass', 'Medium Pass', 'Deep Pass', 'RPO'];

  /** The N longest gains across BOTH cohorts, ranked, each tagged with the side
   *  that produced it. Our offensive snaps are ours; our defensive snaps are
   *  the opponent's offense. Ties break on play order, then ours first, so the
   *  list is deterministic when the same yardage appears on both sides. */
  static topPlaysBothSides(offPlays, defPlays, limit) {
    /* MEASURED yardage only. `parseInt(blank) || 0` would admit an unmeasured
       snap as a 0-yard play, which then renders with an empty Yds cell — a
       ranked row that states nothing. 55 of the canonical season's 328
       classified plays carry no yardage, so this is the difference between a
       leaderboard and a list with holes in it. A play with no yardage is not a
       small gain; it is an unanswered question, and it does not rank. */
    const measured = (plays, side) => (plays || [])
      .filter(p => String(p?.tags?.yardage ?? '').trim() !== '' && Number.isFinite(parseInt(p.tags.yardage, 10)))
      .map(p => ({ p, side, yds: parseInt(p.tags.yardage, 10) }));
    /* ONE order index across both cohorts. Numbering each side from zero made a
       cross-side tie compare two unrelated cohort positions, so "ties break on
       play order" was not true of the only case where a tie-break matters.
       Charted order is game order: the same game/timestamp key
       `_reconstructDrives` sorts by. */
    const gameOf = p => p.__seasonGameIdx ?? 0;
    const timeOf = p => ((p.timestamp && p.timestamp.start) ?? p.id ?? 0);
    return [...measured(offPlays, 'us'), ...measured(defPlays, 'them')]
      .sort((a, b) => b.yds - a.yds
        || (gameOf(a.p) - gameOf(b.p))
        || (timeOf(a.p) - timeOf(b.p))
        || (a.side === 'us' ? -1 : 1))
      .slice(0, limit)
      .map(({ p, side }) => ({
        id: p.id, side,
        type: p.tags.playType,
        result: p.tags.result,
        yards: p.tags.yardage,
        clipName: p.clipName || `Play ${p.id}`,
        ref: StatsEngine._compositeRef(p),
      }));
  }

  /** Down + distance-bucket key like "3|Long"; null when down/distance are
   *  missing so the bucket can be skipped rather than charted as "?". */
  _ddKey(tags) {
    const d = tags.down;
    const dist = parseInt(tags.distance);
    if (!d || !dist) return null;
    return `${d}|${StatsEngine._distBucket(dist)}`;
  }

  /** The approved wording for each distance bucket. `Short`/`Medium`/`Long`
   *  are the ENGINE's internal bucket names (`_distBucket`); a coach reads the
   *  yardage. The Reports > Defense board already showed these, but by
   *  patching the string at three call sites — so every other surface printed
   *  "1st & Long" while Defense printed "1st & 7+". This is the one owner. */
  static DIST_LABELS = { Short: '1-3', Medium: '4-6', Long: '7+' };

  /** The fixed Direction vs Strength set, in football order, matching exactly
   *  the values `_matrixDimensions()`'s `dirVsStrength` extractor emits. The
   *  Offense board allocates four rows to this module; these are those four,
   *  so data can never add, drop or reorder one. */
  static DIR_STRENGTH_BUCKETS = ['Toward strength', 'Away from strength', 'Middle', 'Balanced strength'];

  /** Pretty-print a down&distance key. Handles the bucket form ("3|Long" →
   *  "3rd & 7+"), the legacy exact form ("3&7" → "3rd & 7"), and a bare
   *  down ("3" → "3rd"). */
  _ddPretty(key) { return StatsEngine.ddPretty(key); }

  /** The static form the HTML exports call. Reports and their exports must
   *  print one down-and-distance vocabulary, and the export has no engine
   *  instance to reach the method through. */
  static ddPretty(key) {
    const s = String(key);
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
    if (s.includes('|')) {
      const [d, bucket] = s.split('|');
      return `${ord[d] || d} & ${StatsEngine.DIST_LABELS[bucket] || bucket}`;
    }
    const [d, dist] = s.split('&');
    const o = ord[d] || `${d}`;
    return dist != null && dist !== '?' && dist !== '' ? `${o} & ${dist}` : o;
  }

  /**
   * Bucket plays by a key function, counting only run/pass-classifiable
   * plays. keyFn may return a single key or an array (multi-formation).
   * Tracks per-bucket effectiveness: run/pass yards, successes, explosive
   * plays, and turnovers for context-aware self-scout analysis.
   */
  _selfScoutGroup(plays, keyFn) {
    const g = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return;
      let keys = keyFn(p);
      if (!Array.isArray(keys)) keys = [keys];
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      const explosive = StatsEngine.isExplosive(p);
      const td = StatsEngine.hasResult(p, 'Touchdown');
      const to = StatsEngine.isGiveaway(p);
      // Additive film identity, pushed in the SAME pass that increments `n`,
      // so a group's refs can never drift from its own count -- the rule the
      // defensive `_defScoutGroup` already follows. No numeric field changes.
      const ref = StatsEngine._compositeRef(p);
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, runs: 0, passes: 0, yards: 0,
          runYards: 0, passYards: 0, runSucc: 0, passSucc: 0,
          explosives: 0, tds: 0, turnovers: 0, refs: [] };
        g[k].n++;
        if (ref) g[k].refs.push(ref);
        g[k].yards += yds;
        if (td) g[k].tds++;
        if (to) g[k].turnovers++;
        if (explosive) g[k].explosives++;
        if (isRun) {
          g[k].runs++;
          g[k].runYards += yds;
          if (succ) g[k].runSucc++;
        } else {
          g[k].passes++;
          g[k].passYards += yds;
          if (succ) g[k].passSucc++;
        }
      });
    });
    return g;
  }

  /** Turn a group map into rows with runPct / lean / tell flag + effectiveness. */
  _selfScoutRows(groups) {
    return Object.values(groups)
      .map(grp => {
        const runPct = grp.n ? Math.round(grp.runs / grp.n * 100) : 0;
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPct = Math.max(runPct, 100 - runPct);
        const succRate = grp.n ? Math.round((grp.runSucc + grp.passSucc) / grp.n * 100) : 0;
        const runAvg = grp.runs ? +(grp.runYards / grp.runs).toFixed(1) : 0;
        const passAvg = grp.passes ? +(grp.passYards / grp.passes).toFixed(1) : 0;
        return {
          ...grp, refs: [...new Set(grp.refs || [])].sort(),
          runPct, passPct: 100 - runPct, lean, leanPct,
          avg: grp.n ? +(grp.yards / grp.n).toFixed(1) : 0,
          succRate, runAvg, passAvg,
          tell: grp.n >= StatsEngine._SELF_SCOUT_MIN_N && leanPct >= 70,
        };
      })
      .sort((a, b) => b.n - a.n);
  }

  /**
   * The TWELVE down-and-distance situations, always all twelve, in football
   * order: first through fourth down crossed with 1-3, 4-6 and 7+ yards.
   *
   * `_selfScoutRows(byDownDist)` returned only the buckets the cohort happened
   * to observe, sorted by volume and sliced to fifteen — so Week 5 rendered
   * eight rows in frequency order and the four situations the offense never
   * faced simply vanished. A fixed football set renders every category,
   * including the empty ones, which is what makes the board comparable between
   * games. An unobserved bucket is HELD, not zero: `held` is set so the view
   * can render the approved absence treatment rather than a fabricated 0.0.
   */
  _selfScoutDownDistanceRows(byDownDist) {
    const rows = this._selfScoutRows(byDownDist);
    const found = new Map(rows.map(row => [row.key, row]));
    return ['1', '2', '3', '4'].flatMap(down => StatsEngine.DIST_BUCKETS.map(bucket => {
      const key = `${down}|${bucket}`;
      return found.get(key) || { key, n: 0, held: true, runs: 0, passes: 0, yards: 0,
        runPct: 0, passPct: 0, lean: '', leanPct: 0, avg: 0, succRate: 0,
        runAvg: 0, passAvg: 0, explosives: 0, tds: 0, turnovers: 0, tell: false, refs: [] };
    }));
  }

  /**
   * THE DOWN-AND-DISTANCE CHART (Reports > Offense and Defense > Situations,
   * comp design-comps/reports-secondary-nav-2026-09-23). The one owner of every
   * value the chart and its HTML exports print; the views only lay it out.
   *
   * `side` is `offense` (our offense; `plays` is the Offense board's own
   * cohort) or `defense` (the opponent's offense on our defensive snaps; only
   * charted defensive snaps whose accepted penalties let the play count enter,
   * the board's own rule).
   *
   * COHORTS, EACH NAMED IN THE RESULT:
   *   `measured`  run/pass snaps (`isRun` / `isPass`, the canonical rule), the
   *               cohort the chart measures;
   *   `placed`    those that also carry a charted down (1-4) and a positive
   *               charted distance. Nothing is inferred: a snap missing either
   *               is counted in `missingDownDistance` and placed nowhere.
   * Per cell: `n` snaps; `runs` / `passes` (a snap that reads as both is a run,
   * `_selfScoutGroup`'s precedent, so the split always sums to `n`); success
   * over `successEligible` snaps only (`_isSuccessfulPlayEligible`, so a missing
   * yardage is never read as zero) using `isSuccessfulPlay` for our offense and
   * `isOpponentSuccess` for theirs; yards/play over `yardsMeasured` snaps that
   * carry charted yardage. Play types count SNAPS per type: a multi-select tag
   * credits each component once, so `typeTags` can exceed `n` and the snap count
   * never grows; `untyped` snaps carry no play type. `refs` are the cell's exact
   * composite `gameId::playId` refs; a live current-game play without a stamped
   * game takes `fallbackGameId`. An empty cell is `held`: no value is a zero.
   */
  /**
   * FILM ROOM: THE PLAYS ON SCREEN, MEASURED (coach direction, 2026-09-24).
   * A readout under the table's filters for whatever the coach filtered to,
   * measured by the SAME owners the Reports boards use, so a filter that
   * selects a whole game reads exactly what its board reads:
   *   offense  compute() -- the Offense report's cohort (classified snaps),
   *            its Success Rate, explosive count and yards per play;
   *   defense  defenseDashboard() -- the Defense board's run/pass cohort, yards
   *            and yards per play allowed -- and defensiveCohortMetrics()'s
   *            stop rate (the Self-Scout / Matchup measure).
   * Touchdowns and turnovers are the canonical predicates (isTouchdownAllowed,
   * isGiveaway, isTakeaway). A mix of units states its counts and measures
   * nothing, because an offensive and a defensive yard do not add. A missing
   * denominator is `null`, never 0.
   */
  playSetSummary(plays, { side = 'mixed' } = {}) {
    const S = StatsEngine;
    const rows = (plays || []).filter(p => p?.tags);
    const unitOf = p => (p.tags.unit === 'defense' || p.tags.unit === 'special' ? p.tags.unit : 'offense');
    const counts = { offense: 0, defense: 0, special: 0 };
    for (const p of rows) counts[unitOf(p)]++;
    const out = { side, n: rows.length, counts, measured: null, runs: null, passes: null, ypp: null,
      rateLabel: null, rate: null, explosives: null, touchdowns: null, turnovers: null };
    if (side === 'special') {
      /* A Special Teams touchdown lives in the structured event
         (`specialTeams.outcome.score`), which may be saved without a Touchdown
         result tag. Its side is `SpecialTeamsModel.scoringTeam`, the
         scoreboard's own rule, so a loose ball nobody recovered stays
         unattributed. A legacy snap has no structured event: its Touchdown
         result counts as side not charted. */
      out.tdFor = 0; out.tdAgainst = 0; out.tdUnattributed = 0;
      for (const p of rows) {
        const event = SpecialTeamsModel.normalize(p.specialTeams);
        const scored = event ? event.outcome.score === 'touchdown' : S.hasResult(p, 'Touchdown');
        if (!scored) continue;
        const team = event ? SpecialTeamsModel.scoringTeam(event) : 'unknown';
        if (team === 'subject') out.tdFor++; else if (team === 'opponent') out.tdAgainst++; else out.tdUnattributed++;
      }
      out.touchdowns = out.tdFor + out.tdAgainst + out.tdUnattributed;
      return out;
    }
    const own = rows.filter(p => unitOf(p) === side);
    if (side === 'offense') {
      const classified = own.filter(p => p.tags.playType || p.tags.runPass);
      out.measured = classified.length;
      out.runs = classified.filter(S.isRun).length;
      out.passes = classified.filter(S.isPass).length;
      if (classified.length) {
        const st = this.compute(own);
        out.ypp = Number(S.yardsPerPlay(st));
        out.rateLabel = 'success';
        out.rate = Number(st.efficiency.successRate);
        out.explosives = st.efficiency.explosivePlays;
      }
      out.touchdowns = own.filter(p => S.hasResult(p, 'Touchdown')).length;
      out.turnovers = own.filter(S.isGiveaway).length;
      return out;
    }
    if (side === 'defense') {
      const counted = own.filter(S._tryPenaltyResolved);
      const dash = this.defenseDashboard(counted).summary;
      out.measured = dash?.measured ?? 0;
      out.runs = counted.filter(S.isRun).length;
      out.passes = counted.filter(S.isPass).length;
      out.ypp = dash?.ypp ?? null;
      out.explosives = dash?.explosives ?? null;
      if (counted.length) { out.rateLabel = 'stop'; out.rate = this.defensiveCohortMetrics(counted).stopRate; }
      out.touchdowns = counted.filter(S.isTouchdownAllowed).length;
      out.turnovers = counted.filter(S.isTakeaway).length;
      return out;
    }
    return out;
  }

  downDistanceChart(plays, { side = 'offense', fallbackGameId = null } = {}) {
    const S = StatsEngine;
    const source = (plays || []).filter(p => p?.tags && (side !== 'defense'
      || (p.tags.unit === 'defense' && S._tryPenaltyResolved(p))));
    const measured = source.filter(p => S.isRun(p) || S.isPass(p));
    const placeOf = p => {
      const down = String(p.tags.down ?? '').trim();
      const distance = parseInt(p.tags.distance, 10);
      if (!['1', '2', '3', '4'].includes(down) || !Number.isFinite(distance) || distance <= 0) return null;
      return `${down}|${S._distBucket(distance)}`;
    };
    const success = side === 'defense' ? S.isOpponentSuccess : S.isSuccessfulPlay;
    const hasYardage = p => String(p.tags.yardage ?? '').trim() !== '' && Number.isFinite(parseInt(p.tags.yardage, 10));
    const refOf = p => {
      const gid = p.__gid ?? fallbackGameId;
      return gid != null && p.id != null ? `${gid}::${p.id}` : null;
    };
    const byKey = new Map();
    let placed = 0;
    for (const p of measured) {
      const key = placeOf(p);
      if (!key) continue;
      placed++;
      if (!byKey.has(key)) byKey.set(key, []);
      byKey.get(key).push(p);
    }
    const cells = ['1', '2', '3', '4'].flatMap(down => S.DIST_BUCKETS.map(bucket => {
      const key = `${down}|${bucket}`;
      const rows = byKey.get(key) || [];
      const runs = rows.filter(S.isRun).length;
      const eligible = rows.filter(p => this._isSuccessfulPlayEligible(p));
      const yardRows = rows.filter(hasYardage);
      const types = new Map();
      let untyped = 0, typeTags = 0;
      for (const p of rows) {
        const parts = [...new Set(String(p.tags.playType || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean))];
        if (!parts.length) { untyped++; continue; }
        for (const name of parts) { types.set(name, (types.get(name) || 0) + 1); typeTags++; }
      }
      const refs = [...new Set(rows.map(refOf).filter(Boolean))].sort();
      return {
        key, down, bucket, label: S.ddPretty(key), n: rows.length, held: rows.length === 0,
        runs, passes: rows.length - runs,
        successEligible: eligible.length, successes: eligible.filter(success).length,
        successRate: eligible.length ? eligible.filter(success).length / eligible.length * 100 : null,
        yardsMeasured: yardRows.length,
        yards: yardRows.length ? yardRows.reduce((sum, p) => sum + parseInt(p.tags.yardage, 10), 0) : null,
        ypp: yardRows.length ? yardRows.reduce((sum, p) => sum + parseInt(p.tags.yardage, 10), 0) / yardRows.length : null,
        playTypes: [...types].map(([name, n]) => ({ name, n }))
          .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
        typeTags, untyped, refs,
      };
    }));
    return {
      side, charted: source.length, measured: measured.length, placed,
      missingDownDistance: measured.length - placed, cells,
    };
  }

  /** The chart's printed strings: the board and every HTML export read these,
   *  so the screen and the paper cannot disagree. A held cell prints `-`. */
  static formatDownDistanceCell(cell) {
    if (!cell || cell.held) return { plays: '-', split: '-', success: '-', ypp: '-', top: '-' };
    return {
      plays: String(cell.n),
      split: `${cell.runs}R / ${cell.passes}P`,
      success: cell.successRate == null ? '-' : `${Math.round(cell.successRate)}%`,
      ypp: cell.ypp == null ? '-' : cell.ypp.toFixed(1),
      top: cell.playTypes.length ? cell.playTypes.slice(0, 3).map(t => `${t.name} ${t.n}`).join(', ') : '-',
    };
  }

  /** The chart's cohort sentence, one owner for screen and export. */
  static downDistanceCohortLine(chart) {
    if (!chart) return '';
    const noun = chart.side === 'defense' ? 'opponent run/pass snaps' : 'run/pass snaps';
    return `${chart.placed} of ${chart.measured} ${noun} carry down and distance`;
  }

  /**
   * The run-gap hit chart: where the ball actually hit (ChartingDetails.GAPS), for
   * the run snaps of one cohort. Frequency and performance come from the same
   * cells. The ELIGIBLE sample is the cohort's run snaps by the Reports' one run rule
   * (`isRun`: the explicit Run/Pass, else the plain run play types; QB Run and
   * Reverse are never inferred; a gap never makes a run); a run with no Gap charted is counted as
   * missing, never as a hit, a zero or an "Other". A snap tagged with two play
   * types is attributed to each when the cohort is narrowed to one type. Strength
   * is read where charted: a sided gap against a Left/Right strength is toward or
   * away from it; Center, Other, a Balanced strength and a blank strength are
   * counted apart. Every cell carries its exact composite film refs.
   *
   * `side` 'offense' measures our runs (success is the offense's); 'defense'
   * measures the runs our defense faced (the opponent's success).
   */
  runGapChart(plays, { side = 'offense', playType = '', fallbackGameId = null } = {}) {
    const S = StatsEngine;
    const wantUnit = side === 'defense' ? 'defense' : 'offense';
    const cohort = (plays || []).filter(p => p?.tags && countedUnit(p) === wantUnit && S.isRun(p)
      && (side !== 'defense' || S._tryPenaltyResolved(p)));
    const gapOf = p => { const g = String(p.tags.gap ?? '').trim(); return ChartingDetails.GAPS.includes(g) ? g : ''; };
    const typesOf = p => [...new Set(S.splitPlayTypes(p.tags.playType))];
    const inScope = playType
      ? cohort.filter(p => typesOf(p).includes(playType === 'No play type' ? 'Unknown' : playType))
      : cohort;
    const charted = inScope.filter(gapOf);
    const success = side === 'defense' ? S.isOpponentSuccess : S.isSuccessfulPlay;
    const hasYardage = p => String(p.tags.yardage ?? '').trim() !== '' && Number.isFinite(parseInt(p.tags.yardage, 10));
    const refOf = p => {
      const gid = p.__gid ?? fallbackGameId;
      return gid != null && p.id != null ? `${gid}::${p.id}` : null;
    };
    const measure = rows => {
      const eligible = rows.filter(p => this._isSuccessfulPlayEligible(p));
      const yardRows = rows.filter(hasYardage);
      const yards = yardRows.reduce((sum, p) => sum + parseInt(p.tags.yardage, 10), 0);
      return {
        n: rows.length,
        successEligible: eligible.length, successes: eligible.filter(success).length,
        successRate: eligible.length ? eligible.filter(success).length / eligible.length * 100 : null,
        yardsMeasured: yardRows.length, yards: yardRows.length ? yards : null,
        ypp: yardRows.length ? yards / yardRows.length : null,
        explosives: rows.filter(S.isExplosive).length,
        refs: [...new Set(rows.map(refOf).filter(Boolean))].sort(),
      };
    };
    const cells = ChartingDetails.GAPS.map(gap => {
      const rows = charted.filter(p => gapOf(p) === gap);
      return { key: gap, gap, held: rows.length === 0, share: charted.length ? rows.length / charted.length * 100 : null, ...measure(rows) };
    });
    const sided = charted.filter(p => ChartingDetails.gapDirection(gapOf(p)) === 'Left' || ChartingDetails.gapDirection(gapOf(p)) === 'Right');
    const withStrength = sided.filter(p => !!ChartingDetails.strengthSide(S.proj(p).strength));
    const toward = withStrength.filter(p => ChartingDetails.gapDirection(gapOf(p)) === ChartingDetails.strengthSide(S.proj(p).strength));
    const away = withStrength.filter(p => ChartingDetails.gapDirection(gapOf(p)) !== ChartingDetails.strengthSide(S.proj(p).strength));
    const typeCounts = new Map();
    for (const p of cohort.filter(gapOf)) for (const name of typesOf(p)) {
      const label = name === 'Unknown' ? 'No play type' : name;
      typeCounts.set(label, (typeCounts.get(label) || 0) + 1);
    }
    return {
      side, playType, runs: inScope.length, charted: charted.length, missing: inScope.length - charted.length,
      cohortRuns: cohort.length,
      cells,
      strength: {
        sided: sided.length, charted: withStrength.length, noStrength: sided.length - withStrength.length,
        unsided: charted.length - sided.length,
        toward: measure(toward), away: measure(away),
      },
      playTypes: [...typeCounts].map(([name, n]) => ({ name, n })).sort((a, b) => b.n - a.n || a.name.localeCompare(b.name)),
      refs: [...new Set(charted.map(refOf).filter(Boolean))].sort(),
    };
  }

  /** The chart's printed strings, one owner for the board and every export. */
  static formatRunGapCell(cell) {
    if (!cell || cell.held) return { plays: '-', share: '-', ypp: '-', success: '-', explosives: '-' };
    return {
      plays: String(cell.n),
      share: cell.share == null ? '-' : `${Math.round(cell.share)}%`,
      ypp: cell.ypp == null ? '-' : cell.ypp.toFixed(1),
      success: cell.successRate == null ? '-' : `${Math.round(cell.successRate)}%`,
      explosives: String(cell.explosives),
    };
  }

  /** The chart's eligible-sample sentence: how many of the cohort's runs carry a Gap. */
  static runGapCohortLine(chart) {
    if (!chart) return '';
    const noun = chart.side === 'defense' ? 'runs faced' : 'runs';
    const scope = chart.playType ? ` (${chart.playType})` : '';
    return `${chart.charted} of ${chart.runs} ${noun}${scope} charted with a gap`;
  }

  /** What a defense does about a one-sided offensive tendency (the "so what")
   *  plus the constraint that breaks it (the "now what"). */
  static _offenseTellCounter(lean) {
    return lean === 'Run'
      ? { threat: 'a DC keys run — loads the box and cheats a safety down', fix: 'play-action, a quick throw, or a screen off the same look' }
      : { threat: 'a DC keys pass — drops into coverage and sits on the sticks', fix: 'a draw, QB run, or screen off the same formation' };
  }

  /** Extract ranked tells from a group map, tagged with a dimension label.
   *  Each tell carries effectiveness context so recommendations can
   *  distinguish "dominant strength" from "exploitable tendency", plus a
   *  cut spec ({type,val}) so the tell is clickable to its film. `cutFn`
   *  maps a group key → {type, val} understood by `_buildCutFilter`. */
  _tellsFrom(groups, dim, fmt, cutFn) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    return Object.values(groups)
      .filter(grp => grp.n >= min)
      .map(grp => {
        const runPct = Math.round(grp.runs / grp.n * 100);
        const leanPct = Math.max(runPct, 100 - runPct);
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPlays = lean === 'Run' ? grp.runs : grp.passes;
        const leanYards = lean === 'Run' ? grp.runYards : grp.passYards;
        const leanSucc = lean === 'Run' ? grp.runSucc : grp.passSucc;
        const leanAvg = leanPlays ? +(leanYards / leanPlays).toFixed(1) : 0;
        const leanSuccRate = leanPlays ? Math.round(leanSucc / leanPlays * 100) : 0;
        const overallAvg = grp.n ? +(grp.yards / grp.n).toFixed(1) : 0;
        const overallSucc = grp.n ? Math.round((grp.runSucc + grp.passSucc) / grp.n * 100) : 0;
        // Classify: a lopsided split that's highly effective is a "dominant"
        // strength, not a vulnerability. Only truly exploitable tells (low
        // effectiveness on the leaned side) warrant a "fix this" recommendation.
        // dominant: lean side avg >= 6 ypc/ypa AND success >= 50%
        // effective: lean side avg >= 4 AND success >= 40%
        // exploitable: everything else
        const dominant = leanAvg >= 6 && leanSuccRate >= 50;
        const effective = !dominant && leanAvg >= 4 && leanSuccRate >= 40;
        const verdict = dominant ? 'dominant' : effective ? 'effective' : 'exploitable';
        const cut = cutFn ? cutFn(grp.key) : null;
        return {
          dim, label: fmt(grp.key), n: grp.n, lean, leanPct,
          leanAvg, leanSuccRate, overallAvg, overallSucc,
          tds: grp.tds, turnovers: grp.turnovers, explosives: grp.explosives,
          verdict,
          counter: StatsEngine._offenseTellCounter(lean),
          cutType: cut ? cut.type : null, cutVal: cut ? cut.val : null,
          // Score: exploitable tells rank higher (they're actionable).
          // Dominant tells rank lower — they're information, not problems.
          score: (leanPct - 50) * Math.min(grp.n, 12) * (dominant ? 0.3 : effective ? 0.6 : 1),
        };
      })
      .filter(t => t.leanPct >= 70);
  }

  /** Sample-weighted predictability index (0 balanced → 100 predictable). */
  _predictabilityIndex(...groupMaps) {
    let wsum = 0, w = 0;
    groupMaps.forEach(groups => Object.values(groups).forEach(grp => {
      if (grp.n < 3) return;
      const maxPct = Math.max(grp.runs, grp.passes) / grp.n * 100;
      wsum += maxPct * grp.n; w += grp.n;
    }));
    const avgMax = w ? wsum / w : 50;
    return Math.round(Math.max(0, Math.min(100, (avgMax - 50) * 2)));
  }

  // --- Predictability Map (Formation × Situation heat-map) ---------------
  // The coordinator's mental grid: formations down the side, the down &
  // distance situations a DC keys on across the top. Cells are colored by how
  // lopsided your run/pass lean is (red = predictable tell, green = balanced),
  // NOT by volume like the offense-tab Tendency Matrix — so your leaks pop.

  /** Heat-map situation column for a play: 1st and 4th collapse to the down
   *  (distance is ~always 10 / a different beast); 2nd & 3rd bucket by
   *  distance. Null when the down (or 2nd/3rd distance) isn't tagged. */
  _matrixSit(tags) {
    const d = tags.down;
    if (!d) return null;
    if (d === '1') return '1';
    if (d === '4') return '4';
    const dist = parseInt(tags.distance);
    if (!dist) return null;
    return `${d}|${StatsEngine._distBucket(dist)}`;
  }

  /** Predicate for a heat-map situation key ('1', '4', or 'down|bucket'). */
  _situationPred(sit) {
    if (sit.includes('|')) {
      const [d, b] = sit.split('|');
      return p => p.tags.down === d && (parseInt(p.tags.distance) || 0) > 0
        && StatsEngine._distBucket(parseInt(p.tags.distance)) === b;
    }
    return p => p.tags.down === sit;
  }

  /** Build the Formation × Situation matrix from classifiable offensive plays. */
  _selfScoutMatrix(plays) {
    /* These keys ARE `_ddKey`'s buckets, so the labels are `_ddPretty`'s
       wording — they carried the engine's internal bucket names instead. */
    const L = StatsEngine.DIST_LABELS;
    const SITS = [
      { key: '1', label: '1st' },
      { key: '2|Short', label: `2nd & ${L.Short}` },
      { key: '2|Medium', label: `2nd & ${L.Medium}` },
      { key: '2|Long', label: `2nd & ${L.Long}` },
      { key: '3|Short', label: `3rd & ${L.Short}` },
      { key: '3|Medium', label: `3rd & ${L.Medium}` },
      { key: '3|Long', label: `3rd & ${L.Long}` },
      { key: '4', label: '4th' },
    ];
    const cells = {}, rowN = {}, colHas = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p), isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return;
      const sit = this._matrixSit(p.tags);
      if (!sit) return;
      const forms = StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).filter(Boolean);
      if (!forms.length) return;
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      forms.forEach(f => {
        const k = `${f}\u0001${sit}`;   // U+0001 separator: "Trip"+"s1" must not collide with "Trips"+"1"
        if (!cells[k]) cells[k] = { n: 0, runs: 0, passes: 0, succ: 0, yards: 0 };
        const c = cells[k];
        c.n++; if (isRun) c.runs++; else c.passes++;
        if (succ) c.succ++; c.yards += yds;
        rowN[f] = (rowN[f] || 0) + 1;
        colHas[sit] = (colHas[sit] || 0) + 1;
      });
    });
    const cols = SITS.filter(s => colHas[s.key]);
    const rows = Object.keys(rowN).sort((a, b) => rowN[b] - rowN[a]).slice(0, 10);
    return { cols, rows, cells, rowN };
  }

  _selfScoutMatrixView(m) {
    if (!m || m.rows.length < 2 || m.cols.length < 2) return null;
    const MINC = 3;
    const PRED = 40;
    let baseN = 0, baseSucc = 0;
    Object.values(m.cells).forEach(cell => {
      if (cell && cell.n) { baseN += cell.n; baseSucc += cell.succ || 0; }
    });
    const baseline = baseN ? Math.round(baseSucc / baseN * 100) : 0;
    const rows = m.rows.map(formation => ({
      formation,
      n: m.rowN[formation],
      cells: m.cols.map(situation => {
        const cell = m.cells[`${formation}\u0001${situation.key}`];
        if (!cell || !cell.n) return { situation, empty: true };
        const runPct = Math.round(cell.runs / cell.n * 100);
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPct = Math.max(runPct, 100 - runPct);
        const pred = Math.round((leanPct - 50) * 2);
        const strong = cell.n >= MINC;
        const succ = Math.round(cell.succ / cell.n * 100);
        const avg = (cell.yards / cell.n).toFixed(1);
        let state = 'balanced', label = 'Balanced';
        if (!strong) { state = 'low'; label = 'Low sample'; }
        else if (pred >= PRED && succ < baseline) { state = 'exploit'; label = 'Predictable, not working'; }
        else if (pred >= PRED) { state = 'working'; label = 'Predictable, but working'; }
        return { situation, cell, runPct, lean, leanPct, pred, strong, succ, avg, state, label };
      })
    }));
    return { baseline, minCount: MINC, predictabilityThreshold: PRED, cols: m.cols, rows };
  }

  // ================================================================
  // SELF-SCOUT SUMMARY MODELS — the Offensive Summary and Defense
  // sections of Reports > Self-Scout. Every value here is either read
  // straight off compute()'s existing owners (efficiency, scoring,
  // downs, negative plays, situational, defensive) or derived from a
  // canonical static predicate. No formula is reproduced, and no
  // ranking or qualification decision is left to the view.
  // ================================================================

  /** Minimum sample for a CALL to be ranked. Distinct from
   *  `_SELF_SCOUT_MIN_N`, which gates a tendency tell: a play call is a
   *  concrete thing a coach ran, so three reps is enough to report the
   *  result, while a tendency needs a larger sample to be a pattern. */
  static get _SELF_SCOUT_CALL_MIN() { return 3; }

  /** Rank qualified offensive calls: success rate, then yards per play, then
   *  sample size. Worst Calls is that same ranking reversed, so the two
   *  tables are one ordering read from both ends rather than two rules. */
  selfScoutCallRanking(callRows, min = StatsEngine._SELF_SCOUT_CALL_MIN, limit = 3) {
    const ranked = (callRows || []).filter(row => row.n >= min).slice()
      .sort((a, b) => b.succRate - a.succRate || b.avg - a.avg || b.n - a.n);
    const topCount = Math.min(limit, Math.ceil(ranked.length / 2));
    const worstCount = Math.min(limit, ranked.length - topCount);
    return { qualified: ranked, top: ranked.slice(0, topCount),
      worst: ranked.slice().reverse().slice(0, worstCount) };
  }

  /** The Offensive Summary section's model. `performance` is a compute()
   *  result over the same cohort the report is scoped to, so every count
   *  reconciles with the KPI band printed above it. */
  selfScoutSummary(performance, callRows = []) {
    const offPlays = performance?.offPlays || [];
    const eff = performance?.efficiency || {};
    const scoring = performance?.scoring || {};
    const neg = performance?.negativePlays || {};
    const redZone = performance?.situational?.redZone || {};
    const rushing = performance?.rushing || {};
    const passing = performance?.passing || {};
    const downs = performance?.downs || {};
    // Run and pass units are the SAME grouping every other Self-Scout table
    // uses, keyed on the canonical run/pass classification.
    const unit = this._selfScoutRows(this._selfScoutGroup(offPlays,
      play => (StatsEngine.isRun(play) ? 'Run' : 'Pass')));
    const blank = { n: 0, yards: 0, avg: 0, succRate: 0, explosives: 0, refs: [] };
    const run = unit.find(row => row.key === 'Run') || blank;
    const pass = unit.find(row => row.key === 'Pass') || blank;
    const ranking = this.selfScoutCallRanking(callRows);
    return {
      minCall: StatsEngine._SELF_SCOUT_CALL_MIN,
      kpis: {
        successRate: eff.successRate || '0.0',
        yardsPerPlay: StatsEngine.yardsPerPlay(performance),
        explosiveRate: eff.explosivePct || '0.0',
        negativePlayRate: eff.negativePct || '0.0',
        thirdDownRate: downs.thirdDownPct || '0.0',
        redZoneTdRate: redZone.total
          ? Math.round((redZone.tds || 0) / redZone.total * 100) : null,
      },
      positive: {
        successful: eff.successes || 0,
        explosive: eff.explosivePlays || 0,
        touchdowns: scoring.touchdowns || 0,
        thirdDownConversions: offPlays.filter(play => play.tags.down === '3'
          && StatsEngine.isConversion(play)).length,
        redZoneTouchdowns: redZone.tds || 0,
      },
      negative: {
        negative: neg.distinct || 0,
        turnovers: neg.turnovers || 0,
        sacks: passing.sacks || 0,
        playsForLoss: neg.playsForLoss || 0,
        penalties: neg.penalties || 0,
      },
      run: { attempts: rushing.attempts || 0, yards: rushing.yards || 0,
        avg: Number(rushing.average || 0), succRate: run.succRate,
        explosives: run.explosives, refs: run.refs || [] },
      pass: { attempts: passing.attempts || 0, yards: passing.yards || 0,
        avg: Number(passing.average || 0), succRate: pass.succRate,
        explosives: pass.explosives, sacks: passing.sacks || 0, refs: pass.refs || [] },
      topCalls: ranking.top, worstCalls: ranking.worst,
    };
  }

  /** One defensive call is ONE composite identity: Front + Coverage +
   *  Blitz/pressure, in that order, joining only the components the play
   *  actually carries. A blank pressure is OMITTED, never relabelled
   *  "No blitz" -- an untagged field is missing data, not a charted call. */
  static _defenseCallKey(play) {
    const frontOrder = new Map(SeasonStore.OUR_DEF_ONLY_FRONTS.map((name, index) => [name, index]));
    const front = [...new Set(StatsEngine.splitFronts(play.tags.defFront).filter(Boolean))]
      .sort((a, b) => (frontOrder.get(a) ?? Number.MAX_SAFE_INTEGER) - (frontOrder.get(b) ?? Number.MAX_SAFE_INTEGER)
        || (a < b ? -1 : a > b ? 1 : 0))
      .join(' + ');
    const coverage = StatsEngine.proj(play).coverage || '';
    const pressure = StatsEngine._matchupSet(StatsEngine.splitBlitzes(play.tags.blitz));
    return [front, coverage, pressure].filter(Boolean).join(' · ') || null;
  }

  /** Result rows for each composite defensive call, with the exact composite
   *  film cohort behind every row accumulated in the same pass as its count. */
  _defenseCallRows(defPlays) {
    const groups = {};
    (defPlays || []).forEach(play => {
      const key = StatsEngine._defenseCallKey(play);
      if (!key) return;
      if (!groups[key]) groups[key] = { key, n: 0, yards: 0, stops: 0, explosives: 0, tds: 0, refs: [] };
      const row = groups[key];
      const ref = StatsEngine._compositeRef(play);
      row.n++;
      row.yards += parseInt(play.tags.yardage) || 0;
      // Defensive rows: a stop is the absence of OPPONENT success and a
      // touchdown counts only when the opponent scored it, so a call that
      // produced our pick-six is not credited with allowing a touchdown.
      if (!StatsEngine.isOpponentSuccess(play)) row.stops++;
      if (StatsEngine.isExplosive(play)) row.explosives++;
      if (StatsEngine.isTouchdownAllowed(play)) row.tds++;
      if (ref) row.refs.push(ref);
    });
    return Object.values(groups).map(row => ({
      ...row,
      refs: [...new Set(row.refs)].sort(),
      avgYds: row.n ? +(row.yards / row.n).toFixed(1) : 0,
      stopRate: row.n ? Math.round(row.stops / row.n * 100) : 0,
    })).sort((a, b) => b.n - a.n || a.key.localeCompare(b.key));
  }

  /** Rank qualified defensive calls: stop rate, then LOWER yards allowed per
   *  play, then sample size. Worst Calls is that ranking reversed. */
  selfScoutDefenseCallRanking(rows, min = StatsEngine._SELF_SCOUT_CALL_MIN, limit = 3) {
    const ranked = (rows || []).filter(row => row.n >= min).slice()
      .sort((a, b) => b.stopRate - a.stopRate || a.avgYds - b.avgYds || b.n - a.n);
    const topCount = Math.min(limit, Math.ceil(ranked.length / 2));
    const worstCount = Math.min(limit, ranked.length - topCount);
    return { qualified: ranked, top: ranked.slice(0, topCount),
      worst: ranked.slice().reverse().slice(0, worstCount) };
  }

  /** The Defense section's model, over the SAME defensive cohort the KPI band
   *  has always used (`compute()`'s `defPlays`), so no displayed defensive
   *  figure changes meaning. An unmeasured rate stays null -- printing 0%
   *  would read as a defense that stopped nothing. */
  selfScoutDefenseSummary(performance) {
    const defPlays = performance?.defPlays || [];
    const defensive = performance?.defensive || {};
    const total = defPlays.length;
    // Stops and touchdowns allowed read the defense-framed rules: our own
    // return touchdown is a stop, and it is not a touchdown we allowed.
    const stops = defPlays.filter(play => !StatsEngine.isOpponentSuccess(play)).length;
    const yards = defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage) || 0), 0);
    const phase = isRunPhase => {
      const rows = defPlays.filter(play => (isRunPhase ? StatsEngine.isRun(play) : StatsEngine.isPass(play)));
      const phaseYards = rows.reduce((sum, play) => sum + (parseInt(play.tags.yardage) || 0), 0);
      return {
        attempts: rows.length,
        yardsAllowed: phaseYards,
        yardsPerPlay: rows.length ? +(phaseYards / rows.length).toFixed(1) : 0,
        stopRate: rows.length
          ? Math.round(rows.filter(play => !StatsEngine.isOpponentSuccess(play)).length / rows.length * 100) : 0,
        explosivesAllowed: rows.filter(play => StatsEngine.isExplosive(play)).length,
        // The phase-specific impact result: a TFL is the run answer, a sack
        // the pass answer. Counted over THIS phase, not the whole defense.
        tfl: rows.filter(play => StatsEngine.isTackleForLoss(play)).length,
        sacks: rows.filter(play => StatsEngine.hasResult(play, 'Sack')).length,
        refs: StatsEngine._refsOf(rows),
      };
    };
    const calls = this._defenseCallRows(defPlays);
    const ranking = this.selfScoutDefenseCallRanking(calls);
    return {
      minCall: StatsEngine._SELF_SCOUT_CALL_MIN,
      totalPlays: total,
      kpis: {
        stopRate: total ? Math.round(stops / total * 100) : null,
        yardsAllowedPerPlay: total ? (yards / total).toFixed(1) : null,
        havocRate: defensive.havocRate ?? null,
        sacks: defensive.sacks || 0, tfl: defensive.tfl || 0, takeaways: defensive.turnovers || 0,
      },
      positive: { stops, sacks: defensive.sacks || 0, tfl: defensive.tfl || 0,
        takeaways: defensive.turnovers || 0 },
      negative: {
        successfulAllowed: total - stops,
        explosiveAllowed: defPlays.filter(play => StatsEngine.isExplosive(play)).length,
        touchdownsAllowed: defPlays.filter(StatsEngine.isTouchdownAllowed).length,
      },
      run: phase(true), pass: phase(false),
      calls, topCalls: ranking.top, worstCalls: ranking.worst,
    };
  }

    // ================================================================
  // DEFENSIVE SELF-SCOUT — what tendencies is YOUR defense tipping?
  // Mirrors the offensive self-scout: front/coverage/blitz leans by
  // down & distance, so you can see if you're predictable too.
  // ================================================================

  /** Group defensive plays by a key, counting front/coverage/blitz distribution.
   *  Each group also accumulates its own deduped composite film refs -- pushed
   *  in the same pass that increments `n`, so a group's refs can never drift
   *  from its own count (Reports Presentation Independence, Defensive
   *  Self-Scout migration). No existing numeric field is touched. */
  _defScoutGroup(plays, keyFn) {
    const g = {};
    plays.forEach(p => {
      let keys = keyFn(p);
      if (!Array.isArray(keys)) keys = [keys];
      const yds = parseInt(p.tags.yardage) || 0;
      const stop = !this._isSuccessfulPlay(p);
      const isHavoc = StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
        StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack'));
      const fronts = StatsEngine.splitFronts(p.tags.defFront);
      const cov = StatsEngine.proj(p).coverage || '';
      const blitz = !!p.tags.blitz;
      const ref = StatsEngine._compositeRef(p);
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, yards: 0, stops: 0, havoc: 0,
          frontMap: {}, covMap: {}, blitzN: 0, refs: [] };
        g[k].n++;
        g[k].yards += yds;
        if (stop) g[k].stops++;
        if (isHavoc) g[k].havoc++;
        if (blitz) g[k].blitzN++;
        if (ref) g[k].refs.push(ref);
        fronts.forEach(f => { if (f) g[k].frontMap[f] = (g[k].frontMap[f] || 0) + 1; });
        if (cov) g[k].covMap[cov] = (g[k].covMap[cov] || 0) + 1;
      });
    });
    return g;
  }

  /** Extract defensive tells from structured groups. cutFn maps each group to
   *  its canonical film filter, while refs carries the exact pre-resolved
   *  composite cohort behind the displayed count. Labels remain raw data;
   *  native Reports and HTML export escape them at their own boundaries. */
  /**
   * `skip` names the tell types this DIMENSION cannot honestly emit, because
   * the grouping key IS that dimension. Grouped by front, every play in the
   * `Maverick` group carries the front `Maverick`, so `topFrontPct` is 100 by
   * construction and the tell reads `Maverick -> Maverick 100%`. Coverage has
   * the same shape. Worse, a guaranteed 100% scores `(100 - 50) * n`, higher
   * than any real tendency, so the tautologies crowded out genuine tells in
   * the ranked slice and the recommendations built from it.
   *
   * Cross-dimensional tells remain valid and are the reason these groupings
   * exist: "when we line up in Maverick, do we blitz?" is a real tendency.
   */
  _defTellsFrom(groups, dim, fmt, cutFn, skip = null) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const skipped = skip instanceof Set ? skip : new Set(skip ? [skip] : []);
    const out = [];
    Object.values(groups).filter(grp => grp.n >= min).forEach(grp => {
      const label = fmt(grp.key);
      const cut = cutFn ? cutFn(grp.key) : null;
      const cutType = cut ? cut.type : null;
      const cutVal = cut ? cut.val : null;
      const refs = [...new Set(grp.refs || [])].sort();
      const stopRate = Math.round(grp.stops / grp.n * 100);
      const havocRate = Math.round(grp.havoc / grp.n * 100);
      const avgYds = +(grp.yards / grp.n).toFixed(1);
      const blitzPct = Math.round(grp.blitzN / grp.n * 100);
      // Top front
      const topFront = Object.entries(grp.frontMap).sort((a, b) => b[1] - a[1])[0];
      const topFrontPct = topFront ? Math.round(topFront[1] / grp.n * 100) : 0;
      // Top coverage
      const topCov = Object.entries(grp.covMap).sort((a, b) => b[1] - a[1])[0];
      const topCovPct = topCov ? Math.round(topCov[1] / grp.n * 100) : 0;
      // A tell exists when any one scheme element is dominant (>=70%)
      if (topFrontPct >= 70 && topFront && !skipped.has('Front')) {
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Front',
          tellVal: topFront[0], tellPct: topFrontPct,
          stopRate, havocRate, avgYds, cutType, cutVal, refs,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (topFrontPct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
      if (topCovPct >= 70 && topCov && !skipped.has('Coverage')) {
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Coverage',
          tellVal: topCov[0], tellPct: topCovPct,
          stopRate, havocRate, avgYds, cutType, cutVal, refs,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (topCovPct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
      if (blitzPct >= 70 || (blitzPct === 0 && grp.n >= min)) {
        const blitzLean = blitzPct >= 70 ? 'Blitz' : 'No blitz';
        const pct = blitzPct >= 70 ? blitzPct : 100 - blitzPct;
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Blitz',
          tellVal: blitzLean, tellPct: pct,
          stopRate, havocRate, avgYds, cutType, cutVal, refs,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (pct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
    });
    return out;
  }

  generateDefensiveSelfScout(playsOverride = null) {
    // Source defensive plays directly, NOT via _currentPlays() — that gates on
    // an offensive playType, which silently dropped defensive snaps tagged with
    // only Front/Coverage/Blitz (no offensive play type), leaving the section
    // thin even when the defense was fully tagged. Apply the active filter so
    // filtered views still narrow correctly.
    let all = playsOverride;
    if (!all) {
      all = (this.tagger ? this.tagger.plays : []).filter(p => p && p.tags);
      if (this.filter && this.filter.active) all = this.filter.filter(all);
    }
    const defAll = all.filter(p => (p.tags.unit) === 'defense');
    const plays = defAll.filter(p => p.tags.defFront || StatsEngine.proj(p).coverage || p.tags.blitz);
    // Below the sample gate: return a DIAGNOSTIC, not null — the section
    // must explain exactly what's missing instead of silently vanishing
    // (field-reported: "not a single defensive stat in self-scout").
    if (plays.length < StatsEngine._DEF_SELF_SCOUT_MIN_N) {
      return { insufficient: true, defPlays: defAll.length, schemePlays: plays.length,
        required: StatsEngine._DEF_SELF_SCOUT_MIN_N };
    }

    const byDD = this._defScoutGroup(plays, p => this._ddKey(p.tags));
    const byFront = this._defScoutGroup(plays, p => StatsEngine.splitFronts(p.tags.defFront));
    const byCov = this._defScoutGroup(plays, p => StatsEngine.proj(p).coverage);

    let tells = [
      ...this._defTellsFrom(byDD, 'Down & Dist', k => this._ddPretty(k), k => ({ type: 'ddDef', val: k })),
      // A front grouping may not report its own front, and a coverage grouping
      // may not report its own coverage. Both are true by construction, not
      // observed tendencies. Blitz lean from either remains a real tell.
      ...this._defTellsFrom(byFront, 'vs Front', k => k, k => ({ type: 'defFront', val: k }), 'Front'),
      ...this._defTellsFrom(byCov, 'vs Coverage', k => k, k => ({ type: 'coverage', val: k }), 'Coverage'),
    ];
    // "No blitz" is only a tell when the coach tags blitzes at all —
    // otherwise it's an artifact of untagged data, not a tendency.
    if (!plays.some(p => p.tags.blitz)) tells = tells.filter(t => t.tellType !== 'Blitz');
    tells = tells.sort((a, b) => b.score - a.score).slice(0, 10);

    // Predictability: how often does the DC lean heavily on one scheme element?
    let wsum = 0, w = 0;
    Object.values(byDD).forEach(grp => {
      if (grp.n < 3) return;
      const topF = Object.values(grp.frontMap).sort((a, b) => b - a)[0] || 0;
      const topC = Object.values(grp.covMap).sort((a, b) => b - a)[0] || 0;
      const maxPct = Math.max(topF, topC, grp.blitzN) / grp.n * 100;
      wsum += maxPct * grp.n; w += grp.n;
    });
    const predictability = w ? Math.round(Math.max(0, Math.min(100, ((wsum / w) - 50) * 2))) : 0;
    const predLabel = predictability >= 70 ? 'Very Predictable'
      : predictability >= 50 ? 'Predictable'
        : predictability >= 30 ? 'Moderate' : 'Balanced';

    // Build rows for tables. Front/coverage names returned RAW (see
    // _defTellsFrom's comment) -- each renderer escapes/formats "name pct%"
    // at its own sink instead of one pre-baked, pre-escaped string.
    const ddRows = Object.values(byDD).map(grp => {
      const topF = Object.entries(grp.frontMap).sort((a, b) => b[1] - a[1])[0];
      const topC = Object.entries(grp.covMap).sort((a, b) => b[1] - a[1])[0];
      return { key: grp.key, n: grp.n, avgYds: +(grp.yards / grp.n).toFixed(1),
        stopRate: Math.round(grp.stops / grp.n * 100),
        havocRate: Math.round(grp.havoc / grp.n * 100),
        blitzPct: Math.round(grp.blitzN / grp.n * 100),
        topFrontName: topF ? topF[0] : null, topFrontPct: topF ? Math.round(topF[1] / grp.n * 100) : null,
        topCovName: topC ? topC[0] : null, topCovPct: topC ? Math.round(topC[1] / grp.n * 100) : null,
      };
    }).sort((a, b) => b.n - a.n).slice(0, 15);

    // Structured recommendations remain raw data here. Native Reports and the
    // shared HTML export each format and escape them at their own boundary;
    // the selection and ranking logic lives here exactly once.
    const recommendations = [];
    const exploitable = tells.filter(t => t.verdict === 'exploitable');
    const dominant = tells.filter(t => t.verdict === 'dominant');
    if (exploitable.length > 0) {
      recommendations.push({ kind: 'exploitable-summary', count: exploitable.length });
    }
    StatsEngine._themedRecommendations(exploitable,
      t => ({ kind: 'exploitable-item', label: t.label, tellType: t.tellType, tellVal: t.tellVal, tellPct: t.tellPct, n: t.n, stopRate: t.stopRate }),
      rest => ({ kind: 'exploitable-more', count: rest.length, names: [...new Set(rest.map(item => item.label))] })
    ).forEach(item => recommendations.push(item));
    dominant.slice(0, 3).forEach(t => {
      recommendations.push({ kind: 'dominant', label: t.label, tellVal: t.tellVal, tellPct: t.tellPct, stopRate: t.stopRate, havocRate: t.havocRate });
    });
    if (tells.length === 0) {
      recommendations.push({ kind: 'balanced' });
    }

    return { totalPlays: plays.length, predictability, predLabel, tells, ddRows, recommendations };
  }

  // ================================================================
  // INSIGHTS ENGINE — non-obvious patterns a coordinator might miss
  // in raw splits. Counter-tendency success, motion tells, direction
  // tells, under-utilized plays, formation-type outliers, half shifts.
  // ================================================================

  _findInsights(plays) {
    const insights = [];
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length < 10) return insights;

    const overallRunPct = classifiable.filter(p => StatsEngine.isRun(p)).length / classifiable.length * 100;
    const overallAvg = classifiable.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / classifiable.length;
    const overallSucc = classifiable.filter(p => this._isSuccessfulPlay(p)).length / classifiable.length * 100;

    // 1. Counter-tendency success: when you DO the rare thing, how well does it work?
    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily));
    Object.values(byFormation).forEach(grp => {
      if (grp.n < min + 2) return;
      const runPct = grp.runs / grp.n * 100;
      if (runPct >= 70 && grp.passes >= 2) {
        const passAvg = grp.passYards / grp.passes;
        const passSucc = grp.passSucc / grp.passes * 100;
        if (passAvg >= overallAvg * 1.3 || passSucc >= 60) {
          insights.push({ type: 'counter', priority: passAvg * 2,
            text: `When you <strong>pass</strong> from <strong>${Charts._esc(grp.key)}</strong> (only ${100 - Math.round(runPct)}% of the time), you average ${passAvg.toFixed(1)} yds at ${Math.round(passSucc)}% success. The run tendency may be setting up the big play — protect this wrinkle.`,
            tag: 'Hidden Weapon' });
        }
      }
      if (runPct <= 30 && grp.runs >= 2) {
        const runAvg = grp.runYards / grp.runs;
        const runSucc = grp.runSucc / grp.runs * 100;
        if (runAvg >= overallAvg * 1.3 || runSucc >= 60) {
          insights.push({ type: 'counter', priority: runAvg * 2,
            text: `When you <strong>run</strong> from <strong>${Charts._esc(grp.key)}</strong> (only ${Math.round(runPct)}% of the time), you average ${runAvg.toFixed(1)} yds at ${Math.round(runSucc)}% success. The pass tendency may be setting up the ground game — protect this wrinkle.`,
            tag: 'Hidden Weapon' });
        }
      }
    });

    // 2. Motion as a tell
    const motionPlays = classifiable.filter(p => p.tags.motion && p.tags.motion !== '');
    const noMotionPlays = classifiable.filter(p => !p.tags.motion || p.tags.motion === '');
    if (motionPlays.length >= min && noMotionPlays.length >= min) {
      const motionRunPct = Math.round(motionPlays.filter(p => StatsEngine.isRun(p)).length / motionPlays.length * 100);
      const noMotionRunPct = Math.round(noMotionPlays.filter(p => StatsEngine.isRun(p)).length / noMotionPlays.length * 100);
      const diff = Math.abs(motionRunPct - noMotionRunPct);
      if (diff >= 25) {
        const motionLean = motionRunPct > noMotionRunPct ? 'run' : 'pass';
        const motionAvg = motionPlays.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / motionPlays.length;
        insights.push({ type: 'motion', priority: diff * 1.5,
          text: `Pre-snap <strong>motion</strong> shifts your run/pass mix by ${diff} points (${motionRunPct}% run w/ motion vs ${noMotionRunPct}% without). Motion ${motionLean === 'run' ? 'telegraphs the run' : 'tips the pass'} — averaging ${motionAvg.toFixed(1)} yds with motion.`,
          tag: 'Motion Tell' });
      }
    }

    // 3. Play direction tells from formation
    const playDirPlays = classifiable.filter(p => p.tags.playDir);
    if (playDirPlays.length >= min * 2) {
      const formDirGroup = {};
      playDirPlays.forEach(p => {
        StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
          if (!f) return;
          if (!formDirGroup[f]) formDirGroup[f] = {};
          const dir = p.tags.playDir;
          formDirGroup[f][dir] = (formDirGroup[f][dir] || 0) + 1;
        });
      });
      Object.entries(formDirGroup).forEach(([form, dirs]) => {
        const total = Object.values(dirs).reduce((s, v) => s + v, 0);
        if (total < min) return;
        Object.entries(dirs).forEach(([dir, count]) => {
          const pct = Math.round(count / total * 100);
          if (pct >= 75) {
            insights.push({ type: 'direction', subject: form, priority: (pct - 50) * 1.2 * Math.min(count, 10),
              text: `From <strong>${Charts._esc(form)}</strong>, you go <strong>${Charts._esc(dir.toLowerCase())}</strong> ${pct}% of the time (${count}/${total} plays). A DC with film will shade that direction.`,
              tag: 'Direction Tell' });
          }
        });
      });
    }

    // 4. Formation-PlayType outliers: a specific combo that dramatically out/under-performs
    const formTypeGroup = {};
    classifiable.forEach(p => {
      const forms = StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily);
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      forms.forEach(f => { types.forEach(t => {
        if (!f || !t) return;
        const k = `${f}|${t}`;
        if (!formTypeGroup[k]) formTypeGroup[k] = { f, t, n: 0, yds: 0, succ: 0 };
        formTypeGroup[k].n++;
        formTypeGroup[k].yds += parseInt(p.tags.yardage) || 0;
        if (this._isSuccessfulPlay(p)) formTypeGroup[k].succ++;
      });});
    });
    Object.values(formTypeGroup).forEach(g => {
      if (g.n < 3) return;
      const avg = g.yds / g.n;
      const succR = g.succ / g.n * 100;
      if (avg >= overallAvg * 2 && succR >= 55) {
        insights.push({ type: 'outlier', priority: avg * 1.5,
          text: `<strong>${Charts._esc(g.f)} + ${Charts._esc(g.t)}</strong> averages ${avg.toFixed(1)} yds at ${Math.round(succR)}% success (${g.n} plays) — well above your ${overallAvg.toFixed(1)} baseline. Consider featuring this combo.`,
          tag: 'Outperformer' });
      }
      if (avg <= 1 && g.n >= min && succR < 30) {
        insights.push({ type: 'outlier', priority: (overallAvg - avg) * 1.5,
          text: `<strong>${Charts._esc(g.f)} + ${Charts._esc(g.t)}</strong> averages only ${avg.toFixed(1)} yds at ${Math.round(succR)}% success (${g.n} plays). Well below your ${overallAvg.toFixed(1)} baseline — this combo isn't working.`,
          tag: 'Underperformer' });
      }
    });

    // 5. Half-to-half shift: does your offense change in the 2nd half?
    const tagged = classifiable.filter(p => p.tags.quarter);
    const firstHalf = tagged.filter(p => p.tags.quarter === 'Q1' || p.tags.quarter === 'Q2');
    const secondHalf = tagged.filter(p => p.tags.quarter === 'Q3' || p.tags.quarter === 'Q4');
    if (firstHalf.length >= min * 2 && secondHalf.length >= min * 2) {
      const h1Run = Math.round(firstHalf.filter(p => StatsEngine.isRun(p)).length / firstHalf.length * 100);
      const h2Run = Math.round(secondHalf.filter(p => StatsEngine.isRun(p)).length / secondHalf.length * 100);
      const shift = Math.abs(h1Run - h2Run);
      if (shift >= 20) {
        const dir = h2Run > h1Run ? 'run-heavy' : 'pass-heavy';
        const h2Avg = secondHalf.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / secondHalf.length;
        insights.push({ type: 'tempo', priority: shift * 1.3,
          text: `Your offense gets <strong>${dir}</strong> in the 2nd half (${h1Run}% run in H1 → ${h2Run}% in H2, a ${shift}-point swing). 2nd-half yds/play: ${h2Avg.toFixed(1)}. A DC who notices will adjust at the half.`,
          tag: 'Half-to-Half Shift' });
      }
    }

    // 6. Down-and-distance success anomalies vs baseline
    const byDD = this._selfScoutGroup(plays, p => this._ddKey(p.tags));
    Object.values(byDD).forEach(grp => {
      if (grp.n < min) return;
      const succRate = (grp.runSucc + grp.passSucc) / grp.n * 100;
      const diff = succRate - overallSucc;
      if (Math.abs(diff) >= 20 && succRate < 30) {
        insights.push({ type: 'situation', priority: Math.abs(diff) * 1.1,
          text: `On <strong>${this._ddPretty(grp.key)}</strong> your success rate is only ${Math.round(succRate)}% (vs ${Math.round(overallSucc)}% overall, n=${grp.n}). Something about this situation isn't working — the play call, protection, or a tendency the defense has keyed.`,
          tag: 'Struggle Spot' });
      }
    });

    // 7. Personnel→formation diversity: a personnel group that maps to only 1-2 formations
    // is readable from the huddle — the DC knows the look before the offense lines up.
    const persFormDiv = this._personnelFormationDiversity(plays);
    persFormDiv.forEach(pf => {
      if (pf.topPct < 80) return;
      insights.push({ type: 'personnel', subject: pf.personnel, priority: (pf.topPct - 50) * Math.min(pf.n, 12) * 0.9,
        text: `<strong>${Charts._esc(pf.personnel)} personnel</strong> lines up in <strong>${Charts._esc(pf.topFormation)}</strong> ${pf.topPct}% of the time (${pf.topCount}/${pf.n} plays). A DC can read the grouping from the huddle and anticipate the formation before you break it.`,
        tag: 'Personnel Tell' });
    });

    return StatsEngine._themeInsights(insights);
  }

  /**
   * Show a small number of findings without letting one class take every
   * slot: each class contributes its two strongest rows, and any remainder
   * becomes one themed line naming the rest. Ranking, priority and the
   * insight text are unchanged; this only decides how many are shown.
   */
  static _themeInsights(insights, perType = 2, total = 6) {
    const ranked = [...insights].sort((a, b) => b.priority - a.priority);
    const shown = [], counts = new Map(), overflow = new Map();
    for (const insight of ranked) {
      const type = insight.type || 'other';
      const used = counts.get(type) || 0;
      if (used < perType && shown.length < total) {
        counts.set(type, used + 1);
        shown.push(insight);
      } else {
        overflow.set(type, [...(overflow.get(type) || []), insight]);
      }
    }
    for (const [type, rest] of overflow) {
      if (shown.length >= total + 1 || rest.length < 2) continue;
      const sample = rest[0];
      const subjects = [...new Set(rest.map(item => item.subject).filter(Boolean))];
      const named = subjects.length
        ? ` (${subjects.slice(0, 4).join(', ')}${subjects.length > 4 ? `, +${subjects.length - 4} more` : ''})`
        : '';
      shown.push({
        type: `${type}-theme`, priority: sample.priority, tag: sample.tag || 'Theme',
        text: `<strong>${rest.length} more ${type} tendencies</strong> read the same way${named}. Break the pattern once and every one of them loses value.`,
      });
    }
    return shown.slice(0, total + 1);
  }

  /**
   * AX-3: the recommendation-list version of the same rule. Both self-scouts
   * listed the first four exploitable tells verbatim, each ending in the
   * identical countermeasure sentence — four lines that said one thing. Show the
   * two strongest in full, then name the rest in a single themed line.
   */
  static _themedRecommendations(tells, detail, theme, show = 2) {
    const out = tells.slice(0, show).map(detail);
    const rest = tells.slice(show);
    if (rest.length === 1) out.push(detail(rest[0]));
    else if (rest.length > 1) out.push(theme(rest));
    return out;
  }

  _personnelFormationDiversity(plays) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    const groups = {};
    classifiable.forEach(p => {
      const pers = p.tags.personnel;
      if (!pers) return;
      if (!groups[pers]) groups[pers] = { formations: {}, n: 0 };
      groups[pers].n++;
      StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).forEach(f => {
        if (!f) return;
        groups[pers].formations[f] = (groups[pers].formations[f] || 0) + 1;
      });
    });
    const results = [];
    Object.entries(groups).forEach(([pers, g]) => {
      if (g.n < min) return;
      const sorted = Object.entries(g.formations).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return;
      const unique = sorted.length;
      const topFormation = sorted[0][0];
      const topCount = sorted[0][1];
      const topPct = Math.round(topCount / g.n * 100);
      results.push({
        personnel: pers, n: g.n, uniqueFormations: unique,
        topFormation, topCount, topPct,
        formations: sorted.map(([f, count]) => ({ formation: f, count, pct: Math.round(count / g.n * 100) })),
      });
    });
    return results.sort((a, b) => b.topPct - a.topPct);
  }

  generateSelfScout(playsOverride = null) {
    const all = playsOverride || this._currentPlays();
    // Self-scout is about your own offense's tendencies.
    const plays = all.filter(p => countedUnit(p) === 'offense');
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length === 0) return null;

    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily));
    const byDownDist = this._selfScoutGroup(plays, p => this._ddKey(p.tags));
    const byPersonnel = this._selfScoutGroup(plays, p => p.tags.personnel);
    const byHash = this._selfScoutGroup(plays, p => p.tags.hash);
    // Combined formation-on-down — what a DC actually keys on.
    const byCombo = this._selfScoutGroup(plays, p => {
      const dd = this._ddKey(p.tags);
      if (!dd) return [];
      return StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).map(f => `${f}__${dd}`);
    });
    // Hudl-model dimensions: backfield, strength, and the high-value Formation ×
    // Strength grid (e.g. "Trips Right is 90% run" — what a DC keys on).
    const byBackfield = this._selfScoutGroup(plays, p => StatsEngine.proj(p).backfield);
    const byStrength = this._selfScoutGroup(plays, p => StatsEngine.proj(p).strength);
    const byFormStr = this._selfScoutGroup(plays, p => {
      const s = StatsEngine.proj(p).strength;
      if (!s) return [];
      return StatsEngine.splitFormations(StatsEngine.proj(p).formationFamily).map(f => `${f}__${s}`);
    });

    let tells = [
      ...this._tellsFrom(byCombo, 'Formation × Down', k => {
        const [f, dd] = k.split('__'); return `${f} on ${this._ddPretty(dd)}`;
      }, k => ({ type: 'comboFD', val: k })),
      ...this._tellsFrom(byFormation, 'Formation', k => `From ${k}`, k => ({ type: 'formationFamily', val: k })),
      ...this._tellsFrom(byDownDist, 'Down & Dist', k => this._ddPretty(k), k => ({ type: 'dd', val: k })),
      ...this._tellsFrom(byPersonnel, 'Personnel', k => `${k} personnel`, k => ({ type: 'personnel', val: k })),
      ...this._tellsFrom(byHash, 'Hash', k => `${k} hash`, k => ({ type: 'hash', val: k })),
      ...this._tellsFrom(byBackfield, 'Backfield', k => `From ${k} backfield`, k => ({ type: 'backfield', val: k })),
      ...this._tellsFrom(byStrength, 'Strength', k => `Strong ${k}`, k => ({ type: 'strength', val: k })),
      ...this._tellsFrom(byFormStr, 'Formation × Strength', k => { const [f, s] = k.split('__'); return `${f} ${s}`; }, k => ({ type: 'comboFStr', val: k })),
    ].sort((a, b) => b.score - a.score).slice(0, 12);

    const predictability = this._predictabilityIndex(byFormation, byDownDist);
    const predLabel = predictability >= 70 ? 'Very Predictable'
      : predictability >= 50 ? 'Predictable'
        : predictability >= 30 ? 'Moderate' : 'Balanced';

    // Context-aware coaching recommendations: factor in effectiveness
    // so a dominant tendency ("we run 88% from Power-I at 16 YPC") is
    // praised as a strength, not flagged as a problem.
    const recommendations = [];
    const exploitable = tells.filter(t => t.verdict === 'exploitable');
    const effective = tells.filter(t => t.verdict === 'effective');
    const dominant = tells.filter(t => t.verdict === 'dominant');

    if (exploitable.length > 0) {
      recommendations.push(`<strong>${exploitable.length} exploitable tendenc${exploitable.length > 1 ? 'ies' : 'y'}</strong> — these situations are both predictable and underperforming. A prepared DC will take away your lean.`);
    }
    StatsEngine._themedRecommendations(exploitable,
      t => {
        const c = t.counter || StatsEngine._offenseTellCounter(t.lean);
        return `<span class="ss-rec-label">${Charts._esc(t.label)}</span>: you ${t.lean.toLowerCase()} ${t.leanPct}% (n=${t.n}) at ${t.leanAvg} yds/${t.leanSuccRate}% success — the lean isn't paying off, and ${c.threat}. Add ${c.fix}.`;
      },
      rest => {
        const names = [...new Set(rest.map(item => Charts._esc(item.label)))];
        return `<strong>${rest.length} more situations</strong> lean the same way (${names.slice(0, 4).join(', ')}${names.length > 4 ? `, +${names.length - 4} more` : ''}). One constraint call answers all of them.`;
      }
    ).forEach(line => recommendations.push(line));
    effective.slice(0, 3).forEach(t => {
      const c = t.counter || StatsEngine._offenseTellCounter(t.lean);
      const prod = t.leanAvg >= 5 ? 'productive' : 'adequate';
      recommendations.push(`<span class="ss-rec-label">${Charts._esc(t.label)}</span>: your ${t.lean.toLowerCase()} lean (${t.leanPct}%) is ${prod} at ${t.leanAvg} yds/${t.leanSuccRate}% success, but ${c.threat}. Carry one constraint (${c.fix}) per game to hold them honest.`);
    });
    dominant.slice(0, 3).forEach(t => {
      recommendations.push(`<span class="ss-rec-label ss-rec-strength">${Charts._esc(t.label)}</span>: you ${t.lean.toLowerCase()} ${t.leanPct}% and it's <strong>working</strong> — ${t.leanAvg} yds, ${t.leanSuccRate}% success${t.tds ? `, ${t.tds} TD${t.tds > 1 ? 's' : ''}` : ''}. Keep riding it. The tendency is a feature, not a bug.`);
    });
    if (tells.length === 0) {
      recommendations.push('No strong tells at the current sample size — your run/pass mix is well balanced across situations. Keep tagging for finer-grained insight.');
    } else if (exploitable.length === 0 && tells.length > 0) {
      recommendations.push('Your tendencies are all backed by strong production. No urgent fixes — just be aware that a DC who does the film work will see the leans.');
    }

    const insights = this._findInsights(plays);
    const personnelDiversity = this._personnelFormationDiversity(plays);

    const defScout = this.generateDefensiveSelfScout(playsOverride);

    return {
      totalPlays: classifiable.length,
      predictability, predLabel,
      tells,
      matrix: this._selfScoutMatrix(plays),
      formationRows: this._selfScoutRows(byFormation),
      downDistRows: this._selfScoutDownDistanceRows(byDownDist),
      personnelRows: this._selfScoutRows(byPersonnel),
      personnelDiversity,
      recommendations,
      insights,
      defScout,
    };
  }

          /** Diagnostic empty state: say exactly why the defensive analysis can't
   *  run yet — never hide the section silently. */
      /** Format one structured defensive-self-scout recommendation (see
   *  `generateDefensiveSelfScout`'s own comment) into the exact HTML this
   *  section has always rendered -- the sink where coach-facing tell text
   *  gets escaped, since the data seam itself now returns it raw for the
   *  native Preact consumer. */
          _exportStats(stats) {
    const title = this._gameTitle() || 'Game Stats';
    const r = stats.rushing, p = stats.passing, s = stats.scoring, t = stats.turnovers;
    const totalYards = r.yards + p.yards;
    const dn = stats.downs;
    const tend = stats.tendencies;

    // --- Game Plan (coaching insights) ---
    let gamePlanHtml = '';
    const tk = stats.takeaways;
    if (tk?.working?.length || tk?.fix?.length) {
      gamePlanHtml = '<div class="gp-print">';
      if (tk.working?.length)
        gamePlanHtml += `<div class="gp-print-col"><h4 class="gp-h good">Strengths</h4><ul>${tk.working.map(i => `<li>${i.text}</li>`).join('')}</ul></div>`;
      if (tk.fix?.length)
        gamePlanHtml += `<div class="gp-print-col"><h4 class="gp-h fix">Needs Work</h4><ul>${tk.fix.map(i => `<li>${i.text}</li>`).join('')}</ul></div>`;
      gamePlanHtml += '</div>';
    }

    let body = `
<h1>${title}</h1><p class="sub">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
${gamePlanHtml}
<h3>Team Summary</h3>
<div class="cards">
<div class="card"><div class="cv">${stats.totalPlays}</div><div class="cl">Total Plays</div></div>
<div class="card"><div class="cv">${totalYards}</div><div class="cl">Total Yards</div></div>
<div class="card"><div class="cv">${stats.totalPlays ? (totalYards / stats.totalPlays).toFixed(1) : '0.0'}</div><div class="cl">Yds/Play</div></div>
<div class="card"><div class="cv">${s.touchdowns}</div><div class="cl">Touchdowns</div></div>
<div class="card"><div class="cv">${t.total}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${Math.round(parseFloat(tend.runPct))}%/${Math.round(parseFloat(tend.passPct))}%</div><div class="cl">Run/Pass</div></div>
</div>
<div class="two-col">
<div><h3>Rushing</h3><table>
<tr><td>Attempts</td><td>${r.attempts}</td></tr><tr><td>Yards</td><td>${r.yards}</td></tr>
<tr><td>Average</td><td>${r.average}</td></tr><tr><td>Longest</td><td>${r.longest}</td></tr>
<tr><td>Touchdowns</td><td>${r.touchdowns}</td></tr><tr><td>First Downs</td><td>${r.firstDowns}</td></tr>
<tr><td>Fumbles</td><td>${r.fumbles}</td></tr></table></div>
<div><h3>Passing</h3><table>
<tr><td>Comp/Att</td><td>${p.completions}/${p.attempts}</td></tr><tr><td>Comp %</td><td>${p.completionPct}%</td></tr>
<tr><td>Yards</td><td>${p.yards}</td></tr><tr><td>YPA</td><td>${p.average}</td></tr>
<tr><td>Touchdowns</td><td>${p.touchdowns}</td></tr><tr><td>Interceptions</td><td>${p.interceptions}</td></tr>
<tr><td>Sacks / Yds</td><td>${p.sacks} / ${p.sackYards}</td></tr><tr><td>Longest</td><td>${p.longest}</td></tr>
<tr><td>First Downs</td><td>${p.firstDowns}</td></tr></table></div>
</div>
<h3>Down &amp; Distance</h3>
<div class="cards">
<div class="card"><div class="cv">${dn.totalFirstDowns}</div><div class="cl">First Downs</div></div>
<div class="card"><div class="cv">${dn.thirdDownConv}</div><div class="cl">3rd Down (${dn.thirdDownPct}%)</div></div>
<div class="card"><div class="cv">${dn.fourthDownConv}</div><div class="cl">4th Down (${dn.fourthDownPct}%)</div></div>
</div>`;

    // --- D&D buckets ---
    if (dn.ddBuckets?.length) {
      const dlabels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
      const bRows = dn.ddBuckets.map(b =>
        `<tr><td>${dlabels[b.down]} &amp; ${b.bucket}</td><td>${b.count}</td><td>${b.runPct}%R / ${b.passPct}%P</td><td>${b.avgYards}</td><td>${b.succPct}%</td><td>${b.convPct}%</td></tr>`
      ).join('');
      body += `<table><thead><tr><th>Situation</th><th>#</th><th>Run/Pass</th><th>Avg</th><th>Succ%</th><th>Conv%</th></tr></thead><tbody>${bRows}</tbody></table>`;
    }

    // --- Drives ---
    if (stats.drives?.total) {
      const dr = stats.drives;
      body += `<h3>Drives</h3><div class="cards">
<div class="card"><div class="cv">${dr.scoringDrives}/${dr.total}</div><div class="cl">Scoring</div></div>
<div class="card"><div class="cv">${dr.pointsPerDrive}</div><div class="cl">Pts/Drive</div></div>
<div class="card"><div class="cv">${dr.threeAndOuts}</div><div class="cl">3 &amp; Out</div></div>
<div class="card"><div class="cv">${dr.avgPlaysPerDrive}</div><div class="cl">Avg Plays</div></div>
<div class="card"><div class="cv">${dr.avgYardsPerDrive}</div><div class="cl">Avg Yards</div></div>
</div>`;
    }

    if (stats.defensive.hasData) {
      const d = stats.defensive;
      const frontRows = d.fronts.map(f =>
        `<tr><td>${Charts._esc(f.name)}</td><td>${f.count}</td><td>${f.yards}</td><td>${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}</td><td>${f.count ? Math.round(f.successes / f.count * 100) : 0}%</td><td>${f.count ? Math.round(f.havoc / f.count * 100) : 0}%</td></tr>`
      ).join('');
      const covRows = d.coverages.map(c =>
        `<tr><td>${Charts._esc(c.name)}</td><td>${c.count}</td><td>${c.yards}</td><td>${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}</td><td>${c.count ? Math.round(c.successes / c.count * 100) : 0}%</td></tr>`
      ).join('');
      body += `
<h3>Defensive Summary</h3>
<div class="cards">
<div class="card"><div class="cv">${d.havocRate}%</div><div class="cl">Havoc Rate</div></div>
<div class="card"><div class="cv">${d.sacks}</div><div class="cl">Sacks</div></div>
<div class="card"><div class="cv">${d.tfl}</div><div class="cl">TFL</div></div>
<div class="card"><div class="cv">${d.turnovers}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${d.threeAndOuts}</div><div class="cl">3-and-Outs</div></div>
</div>
${frontRows ? `<table><thead><tr><th>Front</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th><th>Havoc%</th></tr></thead><tbody>${frontRows}</tbody></table>` : ''}
${covRows ? `<table><thead><tr><th>Coverage</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${covRows}</tbody></table>` : ''}`;
    }

    const ind = stats.individuals;
    if (ind.rushers.length) {
      body += '<h3>Individual Rushing</h3><table><thead><tr><th>Player</th><th>Att</th><th>Yds</th><th>Avg</th><th>TD</th></tr></thead><tbody>';
      ind.rushers.forEach(rv => { body += `<tr><td>${this._playerLabelHtml(rv.num)}</td><td>${rv.attempts}</td><td>${rv.yards}</td><td>${rv.attempts ? (rv.yards / rv.attempts).toFixed(1) : '0.0'}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.passers.length) {
      body += '<h3>Individual Passing</h3><table><thead><tr><th>Player</th><th>C/A</th><th>Yds</th><th>TD</th><th>INT</th></tr></thead><tbody>';
      ind.passers.forEach(pv => { body += `<tr><td>${this._playerLabelHtml(pv.num)}</td><td>${pv.completions}/${pv.attempts}</td><td>${pv.yards}</td><td>${pv.tds}</td><td>${pv.ints}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.receivers.length) {
      body += '<h3>Individual Receiving</h3><table><thead><tr><th>Player</th><th>Rec</th><th>Yds</th><th>TD</th></tr></thead><tbody>';
      ind.receivers.forEach(rv => { body += `<tr><td>${this._playerLabelHtml(rv.num)}</td><td>${rv.receptions}</td><td>${rv.yards}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.tacklers.length) {
      body += '<h3>Individual Tackles</h3><table><thead><tr><th>Player</th><th>Tkl</th><th>Solo</th><th>Ast</th><th>Sack</th><th>TFL</th><th>INT</th><th>FR</th></tr></thead><tbody>';
      ind.tacklers.forEach(tv => { body += `<tr><td>${this._playerLabelHtml(tv.num)}</td><td>${tv.tackles}</td><td>${tv.solo}</td><td>${tv.assists}</td><td>${tv.sacks}</td><td>${tv.tfl}</td><td>${tv.ints || 0}</td><td>${tv.fumblesRec || 0}</td></tr>`; });
      body += '</tbody></table>';
    }

    this._openPrintWindow(title, body);
  }

  // Pull the bundled Barlow Condensed @font-face (base64) out of the loaded
  // document so a standalone export/print window embeds the real display face
  // offline, instead of falling back to a system condensed font. Returns a
  // ready-to-inline <style> block (or '' if the font isn't present).
  _exportFontFace() {
    let css = '';
    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.type === 5 && /Barlow Condensed/i.test(rule.cssText || '')) css += rule.cssText + '\n';
        }
      }
    } catch (e) {}
    return css ? `<style>${css}</style>` : '';
  }

  // Desktop (Tauri/WebView2) cannot give us a writable popup. Detect it rather
  // than trying and failing quietly.
  _canOpenPrintWindow() {
    try { return !window.__TAURI__; } catch { return true; }
  }

  /* Fallback delivery: a standalone HTML file that prints itself on open. The
     coach gets a PDF through the system print dialog, which is what the popup
     was trying to do — it just uses a real file instead of a blocked window. */
  _downloadPrintable(title, bodyHtml, extraClass) {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Charts._esc(title)}</title>
${this._exportFontFace()}
${this._printStyles ? this._printStyles() : ''}
</head><body class="${Charts._esc(extraClass || '')}">${bodyHtml}
<script>window.addEventListener('load',function(){setTimeout(function(){window.print();},250);});<\/script>
</body></html>`;
    const name = `${(this._gameTitle() || 'game-report').replace(/[^a-z0-9]+/gi, '-').toLowerCase()}.html`;
    try {
      // `_download` is the same seam exportHtmlReport uses — the one delivery
      // path that already works on desktop.
      window.app?.storage?._download?.(new Blob([html], { type: 'text/html' }), name);
      window.app?.overlays?.toast?.({ message: `Report saved as ${name} — open it and print to PDF.` });
    } catch (error) {
      console.warn('[reports] printable export failed', error);
    }
  }

  _openPrintWindow(title, bodyHtml, extraClass) {
    /* H4 — "Export Game Report to PDF does nothing."
     *
     * This opened a popup and printed from it. WebView2 in the installed app
     * does not hand back a usable window, and the `alert` written as the
     * fallback is suppressed there too — so the whole path failed in complete
     * silence. Nothing threw, which is why the gate stayed green and why my
     * first guess (a regression in the new render code) was wrong.
     *
     * On desktop the report is written to a real file and opened with the
     * system handler, which is the same delivery the HTML export already uses
     * and the coach has never reported broken. The browser keeps the popup.
     */
    const w = this._canOpenPrintWindow() ? window.open('', '_blank') : null;
    if (!w) { this._downloadPrintable(title, bodyHtml, extraClass); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Charts._esc(title)}</title>
${this._exportFontFace()}
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--surface:#f8fafc;--blue:#2563eb;--green:#16a34a;--red:#dc2626;--display:'Barlow Condensed','Arial Narrow',system-ui,sans-serif}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:var(--ink);max-width:960px;margin:24px auto;padding:0 24px}
h1{font-family:var(--display);border-bottom:3px solid var(--blue);padding-bottom:8px;color:var(--ink);font-size:30px;font-weight:700;letter-spacing:.01em;margin-bottom:2px}
h3{font-family:var(--display);color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:5px;margin-top:26px;font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
h4{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:13px;color:var(--ink)}
.sub{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:12px}
td:first-child{color:var(--ink);font-weight:500}
th{font-family:var(--display);background:none;color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--line)}tr:nth-child(even) td{background:var(--surface)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:12px 0}
.card{border:1px solid var(--line);padding:12px;border-radius:10px;text-align:center;background:var(--surface)}
.cv{font-family:var(--display);font-size:32px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}.cl{font-size:9px;text-transform:uppercase;color:var(--muted);margin-top:5px;letter-spacing:.06em;font-weight:700}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.gp-print{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.gp-print-col ul{margin:6px 0 0;padding-left:20px;line-height:1.7;font-size:12px}.gp-print-col li{margin-bottom:4px}
.gp-h{font-family:var(--display);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:0;padding-bottom:4px;border-bottom:2px solid}
.gp-h.good{color:var(--green);border-color:var(--green)}.gp-h.fix{color:var(--red);border-color:var(--red)}
.meter{height:18px;border-radius:9px;background:var(--line);overflow:hidden;margin:10px 0 4px}.meter>div{height:100%;border-radius:9px}
.mval{font-family:var(--display);font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}.mlbl{color:var(--muted);font-size:13px;font-weight:600}
ul{line-height:1.7;font-size:13px}
/* Self-Scout print styles */
.print-hero{text-align:center;margin-bottom:8px}.print-hero h1{border:none;padding:0;margin:0 0 4px}
.print-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.print-card-label{font-size:10px;text-transform:uppercase;color:var(--muted);letter-spacing:.06em;font-weight:700;margin-bottom:6px}
.print-assessment{font-family:var(--display);font-size:18px;font-weight:700;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.02em}
.print-recs{margin:12px 0}.print-rec{padding:8px 12px;margin:6px 0;border-left:3px solid var(--blue);background:var(--surface);font-size:12px;line-height:1.6}
.print-rec strong{color:var(--ink)}.ss-rec-label{font-weight:700;color:var(--ink)}.ss-rec-strength{color:var(--green)}
@media print{
  body{margin:0;padding:10px}
  h1{font-size:18px}h3{font-size:12px}
  .cards{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
  .card{padding:6px}.cv{font-size:16px}
  table{font-size:11px}th,td{padding:4px 6px}
  .no-print{display:none}
  .print-summary{border:1px solid #ccc}
}
</style></head><body${extraClass ? ` class="${extraClass}"` : ''}>
${bodyHtml}
<div class="no-print" style="text-align:center;margin:32px 0">
<p style="color:#999;font-size:12px">Use your browser's <b>Save as PDF</b> option in the print dialog, or press Ctrl/Cmd+P.</p>
</div>
</body></html>`);
    w.document.close();
    // Print once layout has settled (a fixed timeout fires early on slow
    // machines); the timeout stays as a fallback for browsers that don't
    // fire load on document.write content.
    let printed = false;
    const doPrint = () => { if (!printed) { printed = true; w.print(); } };
    w.addEventListener('load', () => requestAnimationFrame(doPrint));
    setTimeout(doPrint, 900);
  }
}
