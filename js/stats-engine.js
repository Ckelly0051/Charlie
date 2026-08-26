/**
 * StatsEngine - Computes team and individual stats from charted play data.
 *
 * All stats are derived live from the play entries in PlayTagger.
 * Nothing is cached — call compute() whenever you need fresh numbers.
 */
import { HeatMaps } from './heat-maps.js';
import { AdvancedMetrics } from './advanced-metrics.js';
import { Visualizations } from './visualizations.js';
import { Charts } from './charts.js';
import { AnalyticsMetrics } from './analytics-metrics.js';
import { gainedFirstDown, DRIVE_ENDERS, isPlayTagged } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';
import { TagProjection } from './tag-projection.js';
import { SeasonStore } from './season-store.js';

// AX-5 (S6-4c): run/pass data ink comes from the design system's CATEGORICAL
// palette, not from two hand-picked hexes that happened to sit next to the
// semantic amber and info blue. Chart series are categories, not judgements.
const RUN_COLOR = 'var(--gi-run)';
const PASS_COLOR = 'var(--gi-pass)';
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

  // E3: the ONE seam every analytics consumer reads a play's pre-snap look
  // through, so legacy mixed-field tags project into the four-dimension model
  // (GRIDIRON-IQ-TAG-MODEL.md §5) consistently. Returns the projected READ-VIEW of
  // a play's tags — qbAlignment/coverageFamily lifted out, wrong-field tokens
  // stripped — WITHOUT mutating the stored play. Every reader of formation/
  // backfield/strength/coverage/qbAlignment/coverageFamily in this engine and the
  // analytics registry MUST go through this, never raw p.tags (enforced by
  // tools/e2e-raw-read-audit.mjs), or Study and the dashboard will disagree.
  static proj(p) {
    return TagProjection.project(p && p.tags ? p.tags : {});
  }

  /** E3b: the by-KEY read-side twin of `proj`, for DISPLAY surfaces keyed by a
   *  runtime column/dimension id (Film Room's `col.key`, EPA's `groupBy(key)`).
   *  Returns the PROJECTED value for the six projected fields and the raw tag for
   *  everything else, so one dynamic-key display projects the six and passes the
   *  rest through unchanged. EDITORS must never call this — they read and write the
   *  coach's stored value (§20). */
  static PROJECTED_FIELDS = ['formation', 'backfield', 'strength', 'coverage', 'qbAlignment', 'coverageFamily'];
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
    return !!(p && p.tags && p.tags.playType && p.tags.playType.toLowerCase().includes('run'));
  }
  static isPass(p) {
    const rp = p && p.tags && p.tags.runPass;
    if (rp === 'Pass') return true;
    if (rp === 'Run') return false;
    const t = (p && p.tags && p.tags.playType ? p.tags.playType.toLowerCase() : '');
    return t.includes('pass') || t.includes('screen') || t === 'play action' || t === 'rpo';
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
    const st = p.tags.stType || '';
    // "Made" via the explicit Kick Outcome (phase-aware ST) or a legacy Good result.
    const made = p.tags.kickOutcome === 'Good' || res.includes('Good');
    if (res.includes('Touchdown')) return 6;
    if (res.includes('Safety')) return 2;
    if (st === '2-Pt') return made ? 2 : 0;
    if (st === 'XP') return made ? 1 : 0;
    if (st === 'Field Goal') return made ? 3 : 0;
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
    // Explicit "Scored by" wins — the one consistent way to attribute any kick /
    // special-teams score (XP, FG, 2-Pt, return TD) to us or the opponent, since
    // there is no "their special teams" unit. Blank falls through to unit logic.
    if (p.tags.scoreFor === 'them') return 'them';
    if (p.tags.scoreFor === 'us') return 'us';
    const res = StatsEngine.splitResults(p.tags.result);
    if (p.tags.unit === 'defense') {
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
    const st = p.tags.stType || '';
    if (res.includes('Touchdown')) return 'TD';
    if (res.includes('Safety')) return 'Safety';
    if (st === '2-Pt') return '2-Pt';
    if (st === 'XP') return 'XP';
    if (st === 'Field Goal' || res.includes('Field Goal')) return 'FG';
    return 'Score';
  }

  constructor(playTagger, playFilter) {
    this.tagger = playTagger;
    this.filter = playFilter || null;
    this.heatMaps = new HeatMaps();
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
      plays = playsOverride.filter(p => p.tags && (p.tags.playType || p.tags.runPass));
    } else {
      plays = this.tagger.plays.filter(p => p.tags.playType || p.tags.runPass);
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
    const offPlays = plays.filter(p => (p.tags.unit || 'offense') === 'offense');
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
      const hasLegacySpecialist = !structured
        && ['Kick Return', 'Punt Return', 'Field Goal', 'XP', 'Punt'].includes(p.tags.stType)
        && [tagPlayers.kicker, tagPlayers.returner].some(value => String(value || '').trim());
      if (hasStructuredSpecialist || hasLegacySpecialist) {
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
      drives: this._driveStats(offPlays),
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

    return stats;
  }

  _currentPlays() {
    let plays = this.tagger.plays.filter(p => p.tags.playType || p.tags.runPass);
    if (this.filter && this.filter.active) plays = this.filter.filter(plays);
    return plays;
  }

  _offensePlays() {
    return this._currentPlays().filter(p => (p.tags.unit || 'offense') === 'offense');
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  /** Canonical six-band field-zone bucketer, extracted from the closure that
   *  had lived only inside `_playCallAnalysis()` -- the SAME bucketing this
   *  app already used for the Play Call report's Field Position dimension,
   *  now the single source of truth for any consumer that needs it
   *  (Study expansion, 2026-08-15). Unit-agnostic: it reads only the play's
   *  own tagged field position, so it is equally meaningful on an offensive
   *  or a defensive snap -- the caller decides which unit's plays to bucket. */
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

  _isSuccessfulPlay(p) {
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

  /** Whether `_isSuccessfulPlay` classifies this play from REAL tagged data
   *  rather than one of its own missing-data defaults (yardage -> 0,
   *  distance -> 10, an untagged down falling into the flat 4-yard
   *  heuristic). Added for AnalyticsMetrics (Codex review, 2026-08-14,
   *  finding #3): stopRate/successRate previously reported every play as
   *  "eligible" even when `_isSuccessfulPlay` had silently invented the
   *  down/distance/yardage it classified on. Mirrors `_isSuccessfulPlay`'s
   *  branch structure -- kept in sync by hand, since the two must agree on
   *  which branch a play falls into -- but never fills a gap with a
   *  fallback; it reports whether one exists. */
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

  _driveStats(plays) {
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
        const u = t.unit || 'offense';
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
            (oppMap[rawOpp] = oppMap[rawOpp] || []).push({ ...p, __gid: g.id, tags: { ...t, unit: 'defense' } });
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
          if (rawOpp && (proj.formation || t.playType || t.runPass || proj.backfield || t.personnel)) {
            (oppOffMap[rawOpp] = oppOffMap[rawOpp] || []).push({ ...p, __gid: g.id, tags: { ...t, unit: 'offense' } });
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

  /** Structured Matchup seam for the native Reports tab. All football values
   *  come from the same compute()/defensivePerformance() owners used elsewhere;
   *  this method only selects the opponent and names the four cohorts. */
  matchupReport(oppName) {
    const data = this._matchupData();
    const want = oppName || this._activeOpponent();
    const opponent = data.opponents.find(item => item.name === want) || data.opponents[0] || null;
    if (!opponent) return { opponents: [], opponent: null };
    const lanes = {
      ourOffense: { plays: data.yourOff, stats: this.compute(data.yourOff) },
      theirDefense: { plays: opponent.defPlays, stats: this.compute(opponent.defPlays), report: this.defensivePerformance(opponent.defPlays) },
      ourDefense: { plays: data.yourDef, stats: this.compute(data.yourDef), report: this.defensivePerformance(data.yourDef) },
      theirOffense: { plays: opponent.offPlays, stats: this.compute(opponent.offPlays) },
    };
    return { opponents: data.opponents, opponent, lanes };
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
    const explosive = plays.filter(p => {
      const y = parseInt(p.tags.yardage) || 0;
      return StatsEngine.isRun(p) ? y >= 12 : y >= 16;
    }).length;
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
    const source = (plays || []).filter(play => (play.tags.unit || 'offense') === 'offense'
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
    // Delegates to the extracted `_fieldZone()` (Study expansion, 2026-08-15)
    // -- was a private copy of the same six-band logic; now the one source.
    const fieldZone = play => this._fieldZone(play.tags);
    const dimensions = [
      { id: 'downDistance', label: 'Down & Distance', values: play => { const key = this._ddKey(play.tags); return key ? this._ddPretty(key) : ''; } },
      { id: 'formation', label: 'Formation', values: play => StatsEngine.splitFormations(StatsEngine.proj(play).formation) },
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
    const tfl = plays.filter(p => (parseInt(p.tags.yardage) || 0) < 0
      && !StatsEngine.hasResult(p, 'Sack') && !StatsEngine.hasResult(p, 'Penalty')
      && !StatsEngine.hasResult(p, 'Kneel') && !StatsEngine.hasResult(p, 'Spike'));
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
      const defSuccess = !this._isSuccessfulPlay(p);
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
        if (StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain')) coverages[c].comps++;
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
    const noBlitzPlays = plays.filter(p => !p.tags.blitz && (p.tags.defFront || StatsEngine.proj(p).coverage));
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
   * The ONE shared `AnalyticsMetrics` instance bound to THIS StatsEngine,
   * constructed once and lazily reused by every caller. Before this,
   * `defensivePerformance()` (Reports) and `AnalyticsRegistry.metricsEngine()`
   * (Study) each built their OWN `deps` binding independently -- structurally
   * identical today, but two separate hand-written copies that could drift
   * apart on the next edit with nothing to catch it (Codex review, 2026-08-14,
   * finding #2: two competing metric-engine owners). `AnalyticsRegistry.
   * metricsEngine()` now delegates here rather than constructing its own.
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
        // "Did this play score a touchdown", structured or legacy -- see
        // StatsEngine.isScoredTouchdown's own comment (Codex review,
        // 2026-08-15, finding #2).
        isScoredTouchdown: p => StatsEngine.isScoredTouchdown(p, StatsEngine.hasResult),
      });
    }
    return this._metricsEngine;
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
    const metrics = this.metricsEngine();
    const legacyOptions = { missingAsZero: true, allowUnlinkedPlays: true };
    const summarize = (name, cohort) => {
      const n = cohort.length;
      const stopRate = metrics.metric(cohort, 'stopRate', {}, legacyOptions);
      const explosive = metrics.metric(cohort, 'explosivesAllowedRate', {}, legacyOptions);
      const havoc = metrics.metric(cohort, 'havocRate', {}, legacyOptions);
      const ypp = metrics.metric(cohort, 'yardsAllowedPerPlay', {}, legacyOptions);
      const touchdowns = cohort.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length;
      return {
        name, n, stops: stopRate.count, explosives: explosive.count, havoc: havoc.count, touchdowns,
        sharePct: source.length ? +(n / source.length * 100).toFixed(1) : 0,
        stopRate: stopRate.value ?? 0,
        yardsPerPlay: ypp.value ?? 0,
        explosiveRate: explosive.value ?? 0,
        havocRate: havoc.value ?? 0,
        refs: stopRate.refs,
      };
    };

    const run = source.filter(StatsEngine.isRun);
    const pass = source.filter(StatsEngine.isPass);
    const detailOrder = ['Run Inside', 'Run Outside', 'Screen', 'Short Pass', 'Medium Pass',
      'Deep Pass', 'RPO', 'Play Action', 'Trick Play'];
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
      ['3rd & Short', p => p.tags.down === '3' && (parseInt(p.tags.distance, 10) || 0) >= 1 && (parseInt(p.tags.distance, 10) || 0) <= 3],
      ['3rd & Long', p => p.tags.down === '3' && (parseInt(p.tags.distance, 10) || 0) >= 7],
      ['Red Zone', p => { const spot = this._absYardLine(p.tags); return spot != null && spot >= 80; }],
      ['Goal Line', p => { const spot = this._absYardLine(p.tags); return spot != null && spot >= 95; }],
    ];
    const situations = situationSpecs.map(([name, predicate]) => summarize(name, source.filter(predicate)))
      .filter(row => row.n > 0);
    const defensive = this._defensiveStats(source);
    const thirdDown = source.filter(p => p.tags.down === '3');
    const redZoneDrives = this._reconstructDrives(source).filter(drive =>
      drive.some(p => { const spot = this._absYardLine(p.tags); return spot != null && spot >= 80; }));
    const redZoneTouchdowns = redZoneDrives.filter(drive =>
      drive.some(p => StatsEngine.hasResult(p, 'Touchdown'))).length;
    return {
      total: source.length,
      summary: summarize('All Defensive Snaps', source),
      takeaways: defensive.turnovers,
      thirdDownStopRate: thirdDown.length
        ? +(thirdDown.filter(p => !this._isSuccessfulPlay(p)).length / thirdDown.length * 100).toFixed(1) : null,
      redZoneTdRate: redZoneDrives.length
        ? +(redZoneTouchdowns / redZoneDrives.length * 100).toFixed(1) : null,
      playTypes, answers, byGame, situations,
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
    const rushPlays = plays.filter(p => StatsEngine.isRun(p));
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
    const passPlays = plays.filter(p => StatsEngine.isPass(p));
    const completions = passPlays.filter(p =>
      StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain')
    );
    const incompletions = passPlays.filter(p => StatsEngine.hasResult(p, 'Incomplete'));
    const yards = passPlays.reduce((sum, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return sum;
      return sum + (parseInt(p.tags.yardage) || 0);
    }, 0);
    // Count each attempt PLAY once. Summing the three filters double-counted a
    // play carrying two of the results (e.g. "Incomplete + Interception"), so a
    // single pick could inflate attempts and deflate completion %.
    const ints = passPlays.filter(p => StatsEngine.hasResult(p, 'Interception'));
    const attempts = new Set([...completions, ...incompletions, ...ints].map(p => p.id)).size;

    return {
      attempts,
      completions: completions.length,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      yardsPerCompletion: completions.length ? (yards / completions.length).toFixed(1) : '0.0',
      completionPct: attempts ? ((completions.length / attempts) * 100).toFixed(1) : '0.0',
      touchdowns: passPlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length,
      interceptions: passPlays.filter(p => StatsEngine.hasResult(p, 'Interception')).length,
      sacks: passPlays.filter(p => StatsEngine.hasResult(p, 'Sack')).length,
      sackYards: passPlays.filter(p => StatsEngine.hasResult(p, 'Sack'))
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
   * PAT / 2-point conversion success. Keyed on stType ('XP' | '2-Pt') and the
   * explicit Good / No Good (or Touchdown / Field Goal) result, so it works
   * even on ST plays that carry no offensive playType.
   */
  _conversionStats(source) {
    const structured = p => SpecialTeamsModel.normalize(p && p.specialTeams);
    const official = p => StatsEngine._tryPenaltyResolved(p);
    const made = (p, wanted) => {
      const event = structured(p);
      if (event?.unit === 'try' || event?.unit === 'tryDefense') {
        return official(p) && event.result === 'converted' && event.outcome.score === wanted;
      }
      if (event) return event.outcome.status === 'good' || event.outcome.score === wanted;
      return p.tags.kickOutcome === 'Good' || StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'Field Goal');
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
        if (event) {
          const kind = event.attemptType || event.outcome.score;
          return kind === wanted && event.subjectRole === 'attempting';
        }
        return p.tags.stType === type && StatsEngine.scoringSide(p) === 'us';
      });
      const madePlays = att.filter(p => made(p, wanted));
      // Codex review finding #1 (Study expansion Phase 2): refs for the exact
      // plays behind `att`/`made`, so a Study row for "Extra Points Attempted"
      // can never Watch anything beyond the actual XP attempts.
      // Special Teams Presentation Independence: `missed` is the exact
      // complement of `made` within `att` -- the film a coach reaches when
      // clicking "Field Goals Missed"/"Tries Missed" must be attempts that
      // did NOT succeed, never the full attempted set.
      return { att: att.length, made: madePlays.length, pct: att.length ? Math.round(madePlays.length / att.length * 100) : 0,
        refs: { att: StatsEngine._refsOf(att), made: StatsEngine._refsOf(madePlays), missed: StatsEngine._refsOf(att.filter(p => !made(p, wanted))) } };
    };
    const two = tally('2-Pt');
    const xp = tally('XP');
    return { two, xp, hasData: two.att > 0 || xp.att > 0 };
  }

  // Phase-aware special teams: punts (gross/net/hang/TB%), kickoffs (avg/TB%/
  // return allowed), field goals (made-att + by distance), and the return game.
  // Reads the new ST detail fields (kickDistance/returnYards/hangTime/kickedTo/
  // kickOutcome); falls back gracefully when they're blank (legacy plays).
  _specialTeamsStats(plays) {
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const structured = (plays || []).map(p => ({ p, st: SpecialTeamsModel.normalize(p?.specialTeams) })).filter(x => x.st);
    // Codex review finding #1: every leaf below carries its own `refs` --
    // the exact composite refs of the ROWS that produced that number, not
    // the whole cohort. A rate/mean's refs are its DENOMINATOR set (matches
    // AnalyticsMetrics' established "refs = refSource, the exact plays that
    // produced `denominator`" contract); a raw count's refs are simply the
    // matching plays. Sibling fields sharing one denominator (n/grossAvg/
    // hangAvg/tbPct/fairCatchPct all divide by the same row-group) share one
    // `refs.all` array rather than each computing an identical set anew.
    const getPlay = x => x.p;
    if (structured.length) {
      const rows = unit => structured.filter(x => x.st.unit === unit);
      // Codex re-review finding #2: `avg()` silently excludes a row missing
      // its own measurement (e.g. a punt with no charted hang time) from the
      // CALCULATION, but every caller kept pointing that measure's `refs` at
      // the full row group -- so the displayed count/refs included plays the
      // average itself never touched. `avgStat` returns the mean AND the
      // exact eligible rows that produced it, so refs can never claim more
      // (or fewer) plays than the number was actually computed from.
      const avgStat = (arr, get) => {
        const eligible = arr.filter(x => Number.isFinite(get(x)));
        const value = eligible.length ? +(eligible.reduce((s, x) => s + get(x), 0) / eligible.length).toFixed(1) : null;
        return { value, refs: StatsEngine._refsOf(eligible, getPlay) };
      };
      const puntRows = rows('punt');
      const koRows = rows('kickoff');
      const fgRows = rows('fieldGoal').filter(x => x.st.attemptType === 'fieldGoal');
      const made = x => x.st.outcome.status === 'good' && x.st.outcome.score === 'fieldGoal';
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
        refs: {
          all: StatsEngine._refsOf(puntRows, getPlay),
          blocked: StatsEngine._refsOf(puntRows.filter(x => x.st.outcome.status === 'blocked'), getPlay),
          returned: StatsEngine._refsOf(puntReturnedRows, getPlay),
          // Each average's OWN eligible cohort -- may be narrower than `all`
          // when a row is missing that specific measurement.
          grossAvg: puntGross.refs, netAvg: puntNet.refs, hangAvg: puntHang.refs,
          retAllowedAvg: puntRetAllowed.refs,
        },
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
        // isOnside is a structured modifier (not a separate unit) -- 'recovered'
        // counts only a SUBJECT recovery (the point of an onside attempt).
        onside: { n: onsideRows.length, recovered: onsideRecoveredRows.length },
        refs: {
          all: StatsEngine._refsOf(koRows, getPlay),
          returned: StatsEngine._refsOf(koReturnedRows, getPlay),
          onside: StatsEngine._refsOf(onsideRows, getPlay),
          // Codex re-review finding #3: "Onside Kicks Recovered" is a strict
          // SUBSET of `onside` (attempted) -- its own refs, not the full
          // attempt list, so Watch can't surface a failed-recovery clip under
          // a "Recovered" row.
          onsideRecovered: StatsEngine._refsOf(onsideRecoveredRows, getPlay),
          avg: koAvg.refs, retAllowedAvg: koRetAllowed.refs,
        },
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
      };
      const ret = unit => {
        const arr = rows(unit);
        const attempts = arr.filter(x => x.st.return.attempted === true && Number.isFinite(x.st.return.yards));
        const tdRows = arr.filter(x => x.st.outcome.score === 'touchdown' && SpecialTeamsModel.scoringTeam(x.st) === 'subject');
        const muffedRows = arr.filter(x => x.st.outcome.status === 'muffed');
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
          refs: {
            all: StatsEngine._refsOf(arr, getPlay), attempts: StatsEngine._refsOf(attempts, getPlay),
            td: StatsEngine._refsOf(tdRows, getPlay), muffed: StatsEngine._refsOf(muffedRows, getPlay),
          },
        };
      };
      const returns = { kick: ret('kickoffReturn'), punt: ret('puntReturn') };
      const blocks = rows('fieldGoalBlock');
      const blockedRows = blocks.filter(x => x.st.outcome.status === 'blocked');
      const tries = { n: rows('try').length + rows('tryDefense').length, refs: { all: StatsEngine._refsOf([...rows('try'), ...rows('tryDefense')], getPlay) } };
      return {
        punts, kickoffs, fg, returns, tries,
        blocks: { n: blocks.length, blocked: blockedRows.length, refs: { all: StatsEngine._refsOf(blocks, getPlay), blocked: StatsEngine._refsOf(blockedRows, getPlay) } },
        structured: true, hasData: true,
      };
    }
    const by = (type) => plays.filter(p => p.tags && p.tags.stType === type);
    const avg = (arr, get) => { const v = arr.map(get).filter(x => x != null); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null; };
    const made = (p) => p.tags.kickOutcome === 'Good' || StatsEngine.hasResult(p, 'Good');
    const refsOf = rows => StatsEngine._refsOf(rows);
    // Codex re-review finding #2, legacy branch: same fix as the structured
    // branch above -- `avg()` drops a row with no charted measurement from
    // the calculation, so its refs must drop that row too rather than
    // pointing at the full, coarser row set.
    const avgStat = (arr, get) => {
      const eligible = arr.filter(p => get(p) != null);
      const value = eligible.length ? +(eligible.reduce((s, p) => s + get(p), 0) / eligible.length).toFixed(1) : null;
      return { value, refs: refsOf(eligible) };
    };

    const pp = by('Punt');
    const puntReturnedRows = pp.filter(p => p.tags.kickOutcome === 'Returned');
    const puntGross = avgStat(pp, p => num(p.tags.kickDistance));
    // Standard net punt: gross − return − 20 yards for a touchback (the ball
    // comes out to the 20), so a touchback no longer reads as a full-net punt.
    const puntNet = avgStat(pp, p => { const d = num(p.tags.kickDistance); return d == null ? null : d - (num(p.tags.returnYards) || 0) - (p.tags.kickOutcome === 'Touchback' ? 20 : 0); });
    const puntHang = avgStat(pp, p => num(p.tags.hangTime));
    const puntRetAllowed = avgStat(puntReturnedRows, p => num(p.tags.returnYards));
    const punts = {
      n: pp.length,
      grossAvg: puntGross.value,
      netAvg: puntNet.value,
      hangAvg: puntHang.value,
      tbPct: pp.length ? Math.round(pp.filter(p => p.tags.kickOutcome === 'Touchback').length / pp.length * 100) : 0,
      // Study expansion Phase 2: legacy `kickOutcome` already carries 'Fair
      // Catch'/'Returned' -- reused, never reinterpreted, matching the same
      // fields the structured branch now computes.
      fairCatchPct: pp.length ? Math.round(pp.filter(p => p.tags.kickOutcome === 'Fair Catch').length / pp.length * 100) : 0,
      blocked: pp.filter(p => p.tags.kickOutcome === 'Blocked').length,
      retAllowedAvg: puntRetAllowed.value,
      retAllowedYards: puntReturnedRows.reduce((s, p) => s + (num(p.tags.returnYards) || 0), 0),
      refs: {
        all: refsOf(pp),
        blocked: refsOf(pp.filter(p => p.tags.kickOutcome === 'Blocked')),
        returned: refsOf(puntReturnedRows),
        grossAvg: puntGross.refs, netAvg: puntNet.refs, hangAvg: puntHang.refs,
        retAllowedAvg: puntRetAllowed.refs,
      },
    };
    const ko = by('Kickoff');
    const koReturnedRows = ko.filter(p => p.tags.kickOutcome === 'Returned');
    const koAvg = avgStat(ko, p => num(p.tags.kickDistance));
    const koRetAllowed = avgStat(koReturnedRows, p => num(p.tags.returnYards));
    const kickoffs = {
      n: ko.length,
      avg: koAvg.value,
      tbPct: ko.length ? Math.round(ko.filter(p => p.tags.kickOutcome === 'Touchback').length / ko.length * 100) : 0,
      fairCatchPct: ko.length ? Math.round(ko.filter(p => p.tags.kickOutcome === 'Fair Catch').length / ko.length * 100) : 0,
      retAllowedAvg: koRetAllowed.value,
      retAllowedYards: koReturnedRows.reduce((s, p) => s + (num(p.tags.returnYards) || 0), 0),
      // Legacy charted an onside kick as its OWN stType ('Onside'), never as a
      // Kickoff modifier -- a structurally different shape than the new model's
      // isOnside flag, so it is not derivable from `by('Kickoff')` here. Stays
      // an honest null rather than a guessed zero (see the fair-catch/muffed
      // reuse above for the contrast: those DO reuse real legacy vocabulary).
      onside: { n: null, recovered: null },
      refs: { all: refsOf(ko), returned: refsOf(koReturnedRows), onside: [], onsideRecovered: [],
        avg: koAvg.refs, retAllowedAvg: koRetAllowed.refs },
    };
    const fgp = by('Field Goal');
    const fgMade = fgp.filter(made);
    const fg = {
      att: fgp.length, made: fgMade.length,
      pct: fgp.length ? Math.round(fgMade.length / fgp.length * 100) : 0,
      long: fgMade.reduce((m, p) => Math.max(m, num(p.tags.kickDistance) || 0), 0),
      byDist: [['<30', 0, 29], ['30-39', 30, 39], ['40-49', 40, 49], ['50+', 50, 99]].map(([label, lo, hi]) => {
        const att = fgp.filter(p => { const d = num(p.tags.kickDistance); return d != null && d >= lo && d <= hi; });
        return { label, att: att.length, made: att.filter(made).length, refs: refsOf(att) };
      }).filter(b => b.att > 0),
      refs: { all: refsOf(fgp), made: refsOf(fgMade), missed: refsOf(fgp.filter(p => !made(p))) },
    };
    const ret = (type) => {
      const arr = by(type);
      const attemptRows = arr.filter(p => num(p.tags.returnYards) != null);
      const yds = attemptRows.map(p => num(p.tags.returnYards));
      const tdRows = arr.filter(p => StatsEngine.hasResult(p, 'Touchdown'));
      const muffedRows = arr.filter(p => p.tags.kickOutcome === 'Muffed');
      return {
        n: arr.length,
        avg: yds.length ? +(yds.reduce((s, x) => s + x, 0) / yds.length).toFixed(1) : null,
        yards: yds.reduce((s, x) => s + x, 0),
        long: yds.length ? Math.max(...yds) : 0,
        attempts: yds.length,
        td: tdRows.length,
        muffed: muffedRows.length,
        refs: { all: refsOf(arr), attempts: refsOf(attemptRows), td: refsOf(tdRows), muffed: refsOf(muffedRows) },
      };
    };
    const returns = { kick: ret('Kick Return'), punt: ret('Punt Return') };
    // Legacy has no dedicated "field goal block unit" or "try" charting
    // concept (a blocked FG is just kickOutcome:'Blocked' on the kicking
    // team's own attempt; a legacy 2-Pt/XP play never distinguished a block
    // unit). Present as explicit nulls, not omitted keys and not fabricated
    // zeros, so every registered measure resolves to a real value (a
    // structural "not derivable here", not a silent "zero of these happened").
    return {
      punts, kickoffs, fg, returns,
      blocks: { n: null, blocked: null, refs: { all: [], blocked: [] } },
      tries: { n: null, refs: { all: [] } },
      hasData: !!(punts.n || kickoffs.n || fg.att || returns.kick.n || returns.punt.n),
    };
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
    if (st.punts?.blocked) impact.push({ label: 'Punts blocked', n: st.punts.blocked, refs: st.punts.refs?.blocked || [] });
    if (st.blocks?.blocked) impact.push({ label: 'Field goals blocked', n: st.blocks.blocked, refs: st.blocks.refs?.blocked || [] });
    const fgMissed = (st.fg?.att || 0) - (st.fg?.made || 0);
    if (fgMissed > 0) impact.push({ label: 'Field goals missed', n: fgMissed, refs: st.fg.refs?.missed || [] });
    const tryMissed = ((conv.xp?.att || 0) - (conv.xp?.made || 0)) + ((conv.two?.att || 0) - (conv.two?.made || 0));
    if (tryMissed > 0) impact.push({ label: 'Tries missed', n: tryMissed, refs: [...(conv.xp?.refs?.missed || []), ...(conv.two?.refs?.missed || [])] });
    const muffed = (st.returns?.kick?.muffed || 0) + (st.returns?.punt?.muffed || 0);
    if (muffed > 0) impact.push({ label: 'Muffed returns', n: muffed, refs: [...(st.returns.kick.refs?.muffed || []), ...(st.returns.punt.refs?.muffed || [])] });
    return {
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
      const conversions = downPlays.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;

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
    const thirdDownConv = thirdDown.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;
    const fourthDown = byDown['4'];
    const fourthDownConv = fourthDown.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;

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
   * G5 — what the derived measures actually mean.
   *
   * Several headline numbers are computed on a rule the coach cannot see, and
   * the report states them with total confidence. Counted against source there
   * are ten such terms — too thin for a glossary destination and scattered
   * across five tabs, so the definition arrives where the number is.
   *
   * THE RULE THAT MATTERS: these are written from the constants the engine
   * computes with. A glossary written from memory drifts, and a confidently
   * wrong definition is worse than none — it invites checking a number against
   * a rule the code does not use. `e2e-native-reports` asserts each stated
   * threshold against the value in use.
   *
   * "Low sample" deliberately names its own surface rather than one number:
   * the gate is 4 for self-scout tells, 5 for formation tendencies and 2 for
   * the coverage list. One sentence covering all three would be untrue on two
   * of them. (Coach, 2026-08-04: keep the thresholds, variance genuinely
   * differs between those things.)
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
     the product honors. */
  static defMark(key) {
    const text = StatsEngine.DEFINITIONS[key];
    if (!text) return '';
    return `<button type="button" class="gi-def" data-def="${Charts._esc(key)}"
      aria-label="What this measures: ${Charts._esc(text)}">i<span class="gi-def-pop" role="tooltip" aria-hidden="true">${Charts._esc(text)}</span></button>`;
  }

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
      StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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
    const runYds = plays.filter(p => StatsEngine.isRun(p)).reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
    const passYds = plays.filter(p => StatsEngine.isPass(p)).reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);
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
      StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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

  _situationBucket(p) {
    const d = p.tags.down;
    const dist = parseInt(p.tags.distance) || 0;
    if (d === '1') return '1st Down';
    if (d === '2' && dist <= 3) return '2nd & Short';
    if (d === '2') return '2nd & Long';
    if (d === '3' && dist <= 3) return '3rd & Short';
    if (d === '3' && dist <= 6) return '3rd & Med';
    if (d === '3') return '3rd & Long';
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
    const paComps = paPlays.filter(p => StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain'));
    const paAttempts = paPlays.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const paYards = paPlays.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);
    const straightComps = straightDrops.filter(p => StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain'));
    const straightAttempts = straightDrops.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const straightYards = straightDrops.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);

    const byFormation = {};
    paPlays.forEach(p => {
      StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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
        working.push({ s: succPct * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong>: ${succPct}% success (${f.count} plays, ${f.avg} avg)` });
      if (runPct >= 75)
        fix.push({ s: (runPct - 50) * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${runPct.toFixed(0)}% run — add a pass concept to keep the defense honest` });
      else if (runPct <= 25)
        fix.push({ s: (50 - runPct) * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${(100 - runPct).toFixed(0)}% pass — mix in a draw or screen` });
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
        working.push({ s: expPct * 20, cut: ['situation', 'explosive'], text: `<strong>${expPct}%</strong> explosive play rate (${stats.efficiency.explosivePlays} plays) — hitting big shots` });
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
   *  kicker/returner, tracked separately. */
  static countsFootballRoles(play) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    return structured
      ? structured.isFake
      : (play?.tags?.unit || 'offense') !== 'special' || StatsEngine.isRun(play) || StatsEngine.isPass(play);
  }

  /** Study Phase 3: "this attempt succeeded" -- the concept AnalyticsMetrics'
   *  `completionRate`/`completions` reuse across three genuinely different
   *  attempt shapes (a completed pass, a made field goal, a legacy-tagged
   *  field goal). Mirrors the branch structure `_conversionStats`' own
   *  `made()` closure already established (stats-engine.js's
   *  `_conversionStats`, ~line 1296) rather than inventing a new one:
   *  - A genuine (non-fake) structured kick event's success signal is its
   *    own `outcome.status === 'good'`, the SAME field `_specialTeamsStats`'
   *    `fgRows`/`made()` already reads.
   *  - A FAKE special-teams play (Codex review, 2026-08-15, finding #2) is a
   *    real snap dressed as a kick -- `outcome.status` describes the kick
   *    that never happened, not the play that did. It is judged by the SAME
   *    tags.result signal as any ordinary pass/run
   *    (`countsFootballRoles`already admits a fake into the passer/receiver
   *    cohort on this same reasoning; this closes the matching classifier
   *    gap for whether that credited attempt was MADE).
   *  - No structured data at all is a legacy play -- its signal is
   *    `tags.result` (Gain/Touchdown/No Gain for a pass, OR the legacy
   *    Good/kickOutcome convention `_conversionStats` already reads for a
   *    pre-Special-Teams-model field goal/XP/2-Pt). Codex review finding
   *    #2 caught this branch missing 'Good' entirely, which made every
   *    legacy-tagged field goal silently report 0% Field Goal Rate. */
  static isMadeAttempt(play, hasResult) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    if (structured && !structured.isFake) return structured.outcome?.status === 'good';
    return hasResult(play, 'Gain') || hasResult(play, 'Touchdown') || hasResult(play, 'No Gain')
      || hasResult(play, 'Good') || play?.tags?.kickOutcome === 'Good';
  }

  /** Study Phase 3 (Codex review, 2026-08-15, finding #2): "did WE score a
   *  touchdown on this play", structured or legacy -- the raw-count sibling
   *  of `isMadeAttempt`, reused by AnalyticsMetrics' `touchdowns` metric
   *  across ballCarrier/passer/receiver/returner. A genuine (non-fake)
   *  structured event's own `outcome.score === 'touchdown'` is the SAME
   *  field `_conversionStats`' `made()` reads for a scored-by-type check;
   *  without it, a structured kick/punt return touchdown was invisible
   *  unless the coach redundantly copied 'Touchdown' into the legacy
   *  multi-select `tags.result` too. A fake ST play (no real kick to grade)
   *  and every ordinary offensive play fall through to the same
   *  `tags.result` check `touchdowns` already used before this fix -- no
   *  regression for ballCarrier/passer/receiver, whose plays never carry
   *  structured data.
   *
   *  Codex re-review, 2026-08-15, one remaining P1: `score === 'touchdown'`
   *  alone says a touchdown happened on the play, not WHO scored it -- a
   *  muffed return recovered and run back by the coverage team is a
   *  structured event with `score:'touchdown', scoredBy:'opponent'`, and the
   *  original check credited it to OUR returner anyway (direct probe:
   *  `{classifier:true, owner:'opponent'}`). Ownership must be resolved the
   *  SAME way every other structured-score consumer already does --
   *  `SpecialTeamsModel.scoringTeam(play)`, which does not just trust a
   *  blank `outcome.scoredBy`: it falls back to `outcome.recoveredBy` and
   *  then `subjectRole` for exactly this return-touchdown case (see
   *  `scoringTeam`'s own comment, special-teams.js ~line 160), and fails
   *  closed to `'unknown'` rather than guessing. Reusing it here (instead of
   *  a bare `scoredBy === 'subject'` check) means a touchdown whose
   *  ownership `scoringTeam` can already infer from `recoveredBy`/
   *  `subjectRole` alone still counts, while a genuinely ambiguous one
   *  correctly counts for nobody. */
  static isScoredTouchdown(play, hasResult) {
    const structured = SpecialTeamsModel.normalize(play?.specialTeams);
    if (structured && !structured.isFake) {
      return structured.outcome?.score === 'touchdown' && SpecialTeamsModel.scoringTeam(play) === 'subject';
    }
    return hasResult(play, 'Touchdown');
  }

  _individualStats(plays) {
    const rushers = {};
    const passers = {};
    const receivers = {};
    const tacklers = {};
    const returners = {};
    const kickers = {};

    plays.forEach(p => {
      // Special Teams Presentation Independence: composite ref for THIS play,
      // computed once and pushed into every bucket it credits in the same
      // pass that increments that bucket's own count -- refs can never drift
      // from what a row displays. Deduped + sorted at the return statement.
      const ref = StatsEngine._compositeRef(p);
      const structured = SpecialTeamsModel.normalize(p.specialTeams);
      const players = StatsEngine.effectivePlayers(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const isRun = StatsEngine.isRun(p);
      const isPass = StatsEngine.isPass(p);
      const isTD = StatsEngine.hasResult(p, 'Touchdown');
      const isComplete = StatsEngine.hasResult(p, 'Gain') || isTD || StatsEngine.hasResult(p, 'No Gain');
      const st = p.tags.stType || '';
      const countsFootballRoles = StatsEngine.countsFootballRoles(p);

      // --- Special teams ---
      const structuredReturn = structured && ['kickoffReturn','puntReturn'].includes(structured.unit);
      if (players.returner && (structuredReturn || (!structured && st.includes('Return')))) {
        const id = players.returner;
        const returnYards = structuredReturn && Number.isFinite(structured.return.yards) ? structured.return.yards : yds;
        const returnTd = structuredReturn
          ? structured.outcome.score === 'touchdown' && SpecialTeamsModel.scoringTeam(structured) === 'subject'
          : isTD;
        if (!returners[id]) returners[id] = { num: id, returns: 0, yards: 0, tds: 0, long: 0, refs: [] };
        returners[id].returns++;
        returners[id].yards += returnYards;
        if (returnTd) returners[id].tds++;
        if (returnYards > returners[id].long) returners[id].long = returnYards;
        if (ref) returners[id].refs.push(ref);
      }
      const specialist = structured ? (players.punter || players.kicker) : players.kicker;
      if (specialist && structured && !structured.isFake && ['fieldGoal','punt'].includes(structured.unit)) {
        const id = specialist;
        if (!kickers[id]) kickers[id] = { num: id, fgAtt: 0, fgMade: 0, punts: 0, puntYds: 0, refs: [] };
        if (structured.unit === 'fieldGoal') {
          kickers[id].fgAtt++;
          if (structured.outcome.status === 'good') kickers[id].fgMade++;
        } else {
          kickers[id].punts++;
          kickers[id].puntYds += structured.kick.distance || 0;
        }
        if (ref) kickers[id].refs.push(ref);
      } else if (players.kicker && !structured && st) {
        const id = players.kicker;
        if (!kickers[id]) kickers[id] = { num: id, fgAtt: 0, fgMade: 0, punts: 0, puntYds: 0, refs: [] };
        if (st === 'Field Goal' || st === 'XP') {
          kickers[id].fgAtt++;
          if (StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Field Goal') || StatsEngine.hasResult(p, 'Touchdown')) kickers[id].fgMade++;
        } else if (st === 'Punt') {
          kickers[id].punts++;
          kickers[id].puntYds += yds;
        }
        if (ref) kickers[id].refs.push(ref);
      }

      if (countsFootballRoles) {
      // Ball carrier (rushing)
      if (players.ballCarrier && isRun) {
        const id = players.ballCarrier;
        if (!rushers[id]) rushers[id] = { num: id, attempts: 0, yards: 0, tds: 0, long: 0, fumbles: 0, refs: [] };
        rushers[id].attempts++;
        rushers[id].yards += yds;
        if (isTD) rushers[id].tds++;
        if (yds > rushers[id].long) rushers[id].long = yds;
        if (StatsEngine.hasResult(p, 'Fumble')) rushers[id].fumbles++;
        if (ref) rushers[id].refs.push(ref);
        if (p.tags.grades?.ballCarrier != null) {
          if (!rushers[id].gradeSum) rushers[id].gradeSum = 0;
          if (!rushers[id].gradeCount) rushers[id].gradeCount = 0;
          rushers[id].gradeSum += p.tags.grades.ballCarrier;
          rushers[id].gradeCount++;
        }
      }

      // Passer
      if (players.passer && isPass) {
        const id = players.passer;
        if (!passers[id]) passers[id] = { num: id, attempts: 0, completions: 0, yards: 0, tds: 0, ints: 0, sacks: 0, refs: [] };
        // Attempts = completions + incompletions + INTs (matches team C/A).
        if (isComplete || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) passers[id].attempts++;
        if (isComplete) {
          passers[id].completions++;
          passers[id].yards += yds;
        }
        if (isTD) passers[id].tds++;
        if (StatsEngine.hasResult(p, 'Interception')) passers[id].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) passers[id].sacks++;
        if (ref) passers[id].refs.push(ref);
        if (p.tags.grades?.passer != null) {
          if (!passers[id].gradeSum) passers[id].gradeSum = 0;
          if (!passers[id].gradeCount) passers[id].gradeCount = 0;
          passers[id].gradeSum += p.tags.grades.passer;
          passers[id].gradeCount++;
        }
      }

      // Receiver
      if (players.receiver && isPass && isComplete) {
        const id = players.receiver;
        if (!receivers[id]) receivers[id] = { num: id, receptions: 0, yards: 0, tds: 0, long: 0, refs: [] };
        receivers[id].receptions++;
        receivers[id].yards += yds;
        if (isTD) receivers[id].tds++;
        if (yds > receivers[id].long) receivers[id].long = yds;
        if (ref) receivers[id].refs.push(ref);
        if (p.tags.grades?.receiver != null) {
          if (!receivers[id].gradeSum) receivers[id].gradeSum = 0;
          if (!receivers[id].gradeCount) receivers[id].gradeCount = 0;
          receivers[id].gradeSum += p.tags.grades.receiver;
          receivers[id].gradeCount++;
        }
      }

      // Tackler(s) — may be multiple for shared/assisted tackles. Credit each
      // listed jersey #. A play with 2+ tacklers marks each as an assist.
      const tacklerIds = StatsEngine.splitPlayers(players.tackler);
      const shared = tacklerIds.length > 1;
      const isDefPlay = p.tags.unit === 'defense';
      // Takeaway (INT / fumble recovery) goes to the dedicated role when set —
      // it doesn't imply a tackle. Plays tagged before the role existed fall
      // back to crediting the listed tackler(s), the old behavior.
      const takeawayIds = StatsEngine.splitPlayers(players.takeaway);
      const creditTakeawayViaTackler = isDefPlay && takeawayIds.length === 0;
      tacklerIds.forEach(id => {
        if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, solo: 0, assists: 0, sacks: 0, tfl: 0, ints: 0, fumblesRec: 0, refs: [] };
        tacklers[id].tackles++;
        if (shared) tacklers[id].assists++; else tacklers[id].solo++;
        if (StatsEngine.hasResult(p, 'Sack')) tacklers[id].sacks++;
        // TFL excludes sacks — matches the team-level definition.
        else if (yds < 0) tacklers[id].tfl++;
        if (creditTakeawayViaTackler && StatsEngine.hasResult(p, 'Interception')) tacklers[id].ints++;
        if (creditTakeawayViaTackler && StatsEngine.isFumbleRecovered(p)) tacklers[id].fumblesRec++;
        if (ref) tacklers[id].refs.push(ref);
        if (p.tags.grades?.tackler != null) {
          if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
          if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
          tacklers[id].gradeSum += p.tags.grades.tackler;
          tacklers[id].gradeCount++;
        }
      });
      if (isDefPlay) {
        takeawayIds.forEach(id => {
          if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, solo: 0, assists: 0, sacks: 0, tfl: 0, ints: 0, fumblesRec: 0, refs: [] };
          if (StatsEngine.hasResult(p, 'Interception')) tacklers[id].ints++;
          if (StatsEngine.isFumbleRecovered(p)) tacklers[id].fumblesRec++;
          if (ref) tacklers[id].refs.push(ref);
          if (p.tags.grades?.takeaway != null) {
            if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
            if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
            tacklers[id].gradeSum += p.tags.grades.takeaway;
            tacklers[id].gradeCount++;
          }
        });
      }
      }
    });

    // Dedupe + sort every row's own refs once here, at the single return
    // point every consumer reads -- never at a call site, so a row's film
    // cohort can never disagree with what's displayed no matter who reads it.
    const withRefs = rows => rows.map(row => ({ ...row, refs: [...new Set(row.refs)].sort() }));
    return {
      rushers: withRefs(Object.values(rushers)).sort((a, b) => b.yards - a.yards),
      passers: withRefs(Object.values(passers)).sort((a, b) => b.yards - a.yards),
      receivers: withRefs(Object.values(receivers)).sort((a, b) => b.yards - a.yards),
      tacklers: withRefs(Object.values(tacklers)).sort((a, b) => b.tackles - a.tackles),
      returners: withRefs(Object.values(returners)).sort((a, b) => b.yards - a.yards),
      kickers: withRefs(Object.values(kickers)).sort((a, b) => (b.fgMade + b.punts) - (a.fgMade + a.punts))
    };
  }

    /** Render the defensive self-scout section, or its diagnostic empty state.
   *  Single source for the "sufficient? section : empty" decision so the
   *  several call sites can't drift. showEmpty=false suppresses the empty
   *  state where another section already explains the gap (the Defense tab).
   *  hideKpis=true drops the internal Stop Rate/Yards Allowed/Havoc/Sacks/
   *  TFL/Takeaways strip -- Charlie Gate finding #6: the Defense tab already
   *  shows that exact set two sections above (Defensive Performance), so
   *  repeating it inside Defensive Self-Scout was pure duplication there.
   *  The Self-Scout tab has no other defensive summary on the page, so it
   *  keeps the strip (the default). */
      /** Play every snap this jersey # is involved in, back-to-back (cut-up). */
  _watchPlayer(num) {
    if (!num) return;
    this._watchPlays(p => {
      const pl = p.tags.players || {};
      // Player values may hold multiple jersey #s (e.g. shared tackles).
      return Object.values(pl).some(v => StatsEngine.splitPlayers(v).includes(String(num)));
    }, `${this._playerLabel(num)} — cut-up`);
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
    const matches = pool
      .filter(p => filter(p))
      .sort((a, b) => (a.timestamp?.start || 0) - (b.timestamp?.start || 0));
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
    const off = (plays || []).filter(p => p && p.tags && (p.tags.unit || 'offense') === 'offense'
      && (StatsEngine.isRun(p) || StatsEngine.isPass(p)));
    const total = off.length;
    const map = {};
    off.forEach(p => {
      const t = p.tags;
      const pr = StatsEngine.proj(p);
      // The exact call is the full projected pre-snap look (§8a): a DC keys on QB
      // alignment and backfield too — "Under Center + Ace + I" and "…+ Offset" are
      // different calls and must not collapse.
      const qb = (pr.qbAlignment || '').trim(), form = (pr.formation || '').trim();
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
    const isOff = p => (p.tags.unit || 'offense') === 'offense';
    const isDef = p => p.tags.unit === 'defense';
    const absYL = p => this._absYardLine(p.tags);
    switch (type) {
      case 'qbAlignment': return p => isOff(p) && (StatsEngine.proj(p).qbAlignment || '') === val;
      case 'formation': return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formation).includes(val);
      case 'playCall':  return p => isOff(p) && (p.tags.playCall || '') === val;
      case 'playCallOrConcept': return p => isOff(p)
        && (p.tags.playCall || p.tags.playConcept || '') === val;
      case 'playConcept': return p => isOff(p) && (p.tags.playConcept || '') === val;
      case 'playType':  return p => isOff(p) && StatsEngine.splitPlayTypes(p.tags.playType).includes(val);
      case 'personnel': return p => isOff(p) && (p.tags.personnel || '') === val;
      case 'backfield': return p => isOff(p) && (StatsEngine.proj(p).backfield || '') === val;
      case 'strength':  return p => isOff(p) && (StatsEngine.proj(p).strength || '') === val;
      case 'comboFStr': { const [form, str] = val.split('__'); return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formation).includes(form) && (StatsEngine.proj(p).strength || '') === str; }
      case 'bigCall': {  // exact call: qbAlignment|||formation|||backfield|||strength|||motion|||playType (§8a)
        const [qb, form, bf, str, mot, pt] = val.split('|||');
        return p => isOff(p) && (StatsEngine.proj(p).qbAlignment || '').trim() === (qb || '')
          && (StatsEngine.proj(p).formation || '').trim() === (form || '')
          && (StatsEngine.proj(p).backfield || '').trim() === (bf || '')
          && (StatsEngine.proj(p).strength || '').trim() === (str || '')
          && (p.tags.motion || '').trim() === (mot || '')
          && (p.tags.playType || '').trim() === (pt || '');
      }
      case 'down':      return p => isOff(p) && (p.tags.down || '') === val;
      case 'runpass':   return p => isOff(p) && (val === 'Run' ? StatsEngine.isRun(p) : StatsEngine.isPass(p));
      case 'playDir':   return p => isOff(p) && (p.tags.playDir || '') === val;
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
        return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formation).includes(form)
          && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'comboFS': { // formation on a heat-map situation, e.g. "Shotgun__3|Long" or "I-Form__1"
        const [form, sit] = val.split('__');
        const sp = this._situationPred(sit || '');
        return p => isOff(p) && StatsEngine.splitFormations(StatsEngine.proj(p).formation).includes(form) && sp(p);
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
          case 'explosive':  return p => isOff(p) && (StatsEngine.isRun(p) ? (parseInt(p.tags.yardage) || 0) >= 12 : (parseInt(p.tags.yardage) || 0) >= 16);
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
      const u = p?.tags?.unit || 'offense';
      if (Object.hasOwn(units, u)) units[u]++;
    });
    const sb = stats?.scoreboard;
    // The official score entered in Game Settings (gameInfo.scoreUs/scoreThem)
    // wins when present -- it is the coach's confirmed final, unlike
    // stats.scoreboard, which is only ever a reconstruction from tagged
    // scoring plays and reads as blank/wrong on an incompletely charted game.
    // Same presence check _gameTitle() already uses. Codex review of
    // `7532b2e` (2026-08-11) caught this rail ignoring the official score.
    const gi = window.app?.storage?.gameInfo || {};
    const hasOfficialScore = gi.scoreUs !== '' && gi.scoreUs != null && gi.scoreThem !== '' && gi.scoreThem != null;
    const finalScore = hasOfficialScore ? { us: gi.scoreUs, them: gi.scoreThem }
      : ((sb && sb.hasData) ? { us: sb.us, them: sb.them } : null);
    // Broadcast Density Part 2: the rail is silent on turnovers entirely.
    // Both directions already exist as computed values elsewhere in this same
    // `stats` object -- giveaways from the offense turnover count, takeaways
    // from the defensive turnover count -- so this composes them rather than
    // deriving anything new. `null` (not 0) when the relevant unit has no
    // plays at all, so a defense-only game doesn't claim "0 giveaways" for an
    // offense that was never charted, and an offense-only game doesn't claim
    // "0 takeaways" for a defense that was never charted.
    //
    // Codex review of `d567f5c` (2026-08-17) caught the first half of this
    // missing: `stats.turnovers` is unconditionally produced by compute() from
    // `offPlays` even when that array is empty, so a defense-only game's
    // `{total:0}` was being read as an observed zero rather than absence.
    // Gated the same way takeaways already were, on the unit actually having
    // plays.
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
      { id: 'formation',  label: 'Formation',  extract: p => StatsEngine.splitFormations(StatsEngine.proj(p).formation) },
      { id: 'qbAlignment', label: 'QB Alignment', extract: p => [StatsEngine.proj(p).qbAlignment || ''].filter(Boolean) },
      { id: 'backfield',  label: 'Backfield',  extract: p => [StatsEngine.proj(p).backfield || ''].filter(Boolean) },
      { id: 'strength',   label: 'Strength',   extract: p => [StatsEngine.proj(p).strength || ''].filter(Boolean) },
      { id: 'playType',   label: 'Play Type',  extract: p => StatsEngine.splitPlayTypes(p.tags.playType) },
      { id: 'down',       label: 'Down',        extract: p => [p.tags.down ? `${p.tags.down}` : '?'] },
      { id: 'distBucket', label: 'Distance',    extract: p => { const d = parseInt(p.tags.distance) || 0; return [d <= 3 ? 'Short (1-3)' : d <= 6 ? 'Med (4-6)' : 'Long (7+)']; } },
      { id: 'personnel',  label: 'Personnel',   extract: p => [p.tags.personnel || 'Unknown'] },
      { id: 'defFront',   label: 'Def Front',   extract: p => StatsEngine.splitFronts(p.tags.defFront) },
      { id: 'coverage',   label: 'Coverage',    extract: p => [StatsEngine.proj(p).coverage || ''].filter(Boolean) },
      { id: 'coverageFamily', label: 'Coverage Family', extract: p => [StatsEngine.proj(p).coverageFamily || ''].filter(Boolean) },
      { id: 'hash',       label: 'Hash',        extract: p => [p.tags.hash || 'Unknown'] },
      { id: 'playDir',    label: 'Direction',   extract: p => [p.tags.playDir || ''].filter(Boolean) },
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

         Balanced strength and middle hash have no side, so they extract to
         'n-a' — a real value that groups honestly, never silently dropped and
         never miscounted as Toward or Away. */
      { id: 'dirVsStrength', label: 'Direction vs Strength', extract: p => {
        const dir = String(p.tags.playDir || '').trim();
        const str = String(StatsEngine.proj(p).strength || '').trim();
        if (!dir || !str) return [];
        if (str !== 'Left' && str !== 'Right') return ['n-a (balanced)'];
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
    const plays = source.filter(p => (p.tags?.unit || 'offense') !== 'special');
    if (plays.length === 0) return null;
    const stats = this.compute(plays);
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yards = parseInt(p.tags.yardage) || 0;
      const isTd = StatsEngine.hasResult(p, 'Touchdown');
      // Multi-select formation: attribute the play to each component look.
      StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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
      const np = stats?.negativePlays || {};
      return {
        success: parseFloat(e.successRate) || 0,
        explosive: parseFloat(e.explosivePct) || 0,
        thirdDown: parseFloat(d.thirdDownPct) || 0,
        ypp: parseFloat(StatsEngine.yardsPerPlay(stats)) || 0,
        ballSecurity: np.totalPlays ? (np.distinct / np.totalPlays) * 100 : 0,
      };
    };
    const SPOKES = [
      { key: 'success', label: 'Efficiency', lower: false, fmt: v => `${Math.round(v)}%` },
      { key: 'explosive', label: 'Explosiveness', lower: false, fmt: v => `${Math.round(v)}%` },
      { key: 'thirdDown', label: 'Third down', lower: false, fmt: v => `${Math.round(v)}%` },
      { key: 'ypp', label: 'Yards / play', lower: false, fmt: v => v.toFixed(1) },
      { key: 'ballSecurity', label: 'Ball security', lower: true, fmt: v => `${Math.round(v)}%` },
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
    const byOurLook = group(play => StatsEngine.splitFormations(StatsEngine.proj(play).formation));
    const bySituation = group(play => {
      const down = play.tags.down, distance = parseInt(play.tags.distance) || 0;
      const yard = this._absYardLine(play.tags);
      const keys = [];
      if (down === '3' || down === '4') keys.push(distance >= 7 ? 'Money down, long' : 'Money down, short');
      else if (down) keys.push('Early down');
      if (yard !== null && yard >= 80) keys.push('Red zone');
      if (yard !== null && yard <= 10) keys.push('Backed up');
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
        const unit = (p.tags && p.tags.unit) || 'offense';
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
  static _meterColor(p) { return p >= 70 ? '#ef4444' : p >= 50 ? '#f59e0b' : p >= 30 ? '#f59e0b' : '#22c55e'; }
  static _verdictIcon(v) { return v === 'dominant' ? '&#9650;' : v === 'effective' ? '&#9644;' : '&#9660;'; }
  static _verdictLabel(v) { return v === 'dominant' ? 'Dominant' : v === 'effective' ? 'Effective' : 'Exploitable'; }

  /** Coordinator distance buckets — coaches game-plan by Short/Medium/Long,
   *  not by exact yards. Bucketing also keeps per-situation samples large
   *  enough for a tendency to mean something (15 of 20 on "3rd & Long" is a
   *  pattern; 3 of 4 on "3rd & 7" is noise). */
  static _distBucket(dist) { return dist <= 3 ? 'Short' : dist <= 6 ? 'Medium' : 'Long'; }

  /** Down + distance-bucket key like "3|Long"; null when down/distance are
   *  missing so the bucket can be skipped rather than charted as "?". */
  _ddKey(tags) {
    const d = tags.down;
    const dist = parseInt(tags.distance);
    if (!d || !dist) return null;
    return `${d}|${StatsEngine._distBucket(dist)}`;
  }

  /** Pretty-print a down&distance key. Handles the bucket form ("3|Long" →
   *  "3rd & Long"), the legacy exact form ("3&7" → "3rd & 7"), and a bare
   *  down ("3" → "3rd"). */
  _ddPretty(key) {
    const s = String(key);
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
    if (s.includes('|')) {
      const [d, bucket] = s.split('|');
      return `${ord[d] || d} & ${bucket}`;
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
      const explosive = yds >= (isRun ? 12 : 16);
      const td = StatsEngine.hasResult(p, 'Touchdown');
      const to = StatsEngine.isGiveaway(p);
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, runs: 0, passes: 0, yards: 0,
          runYards: 0, passYards: 0, runSucc: 0, passSucc: 0,
          explosives: 0, tds: 0, turnovers: 0 };
        g[k].n++;
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
          ...grp, runPct, passPct: 100 - runPct, lean, leanPct,
          avg: grp.n ? +(grp.yards / grp.n).toFixed(1) : 0,
          succRate, runAvg, passAvg,
          tell: grp.n >= StatsEngine._SELF_SCOUT_MIN_N && leanPct >= 70,
        };
      })
      .sort((a, b) => b.n - a.n);
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
    const SITS = [
      { key: '1', label: '1st' },
      { key: '2|Short', label: '2nd & Short' },
      { key: '2|Medium', label: '2nd & Med' },
      { key: '2|Long', label: '2nd & Long' },
      { key: '3|Short', label: '3rd & Short' },
      { key: '3|Medium', label: '3rd & Med' },
      { key: '3|Long', label: '3rd & Long' },
      { key: '4', label: '4th' },
    ];
    const cells = {}, rowN = {}, colHas = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p), isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return;
      const sit = this._matrixSit(p.tags);
      if (!sit) return;
      const forms = StatsEngine.splitFormations(StatsEngine.proj(p).formation).filter(Boolean);
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
  _defTellsFrom(groups, dim, fmt, cutFn) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
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
      if (topFrontPct >= 70 && topFront) {
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Front',
          tellVal: topFront[0], tellPct: topFrontPct,
          stopRate, havocRate, avgYds, cutType, cutVal, refs,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (topFrontPct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
      if (topCovPct >= 70 && topCov) {
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
    if (plays.length < 6) {
      return { insufficient: true, defPlays: defAll.length, schemePlays: plays.length };
    }

    const byDD = this._defScoutGroup(plays, p => this._ddKey(p.tags));
    const byFront = this._defScoutGroup(plays, p => StatsEngine.splitFronts(p.tags.defFront));
    const byCov = this._defScoutGroup(plays, p => StatsEngine.proj(p).coverage);

    let tells = [
      ...this._defTellsFrom(byDD, 'Down & Dist', k => this._ddPretty(k), k => ({ type: 'ddDef', val: k })),
      ...this._defTellsFrom(byFront, 'vs Front', k => k, k => ({ type: 'defFront', val: k })),
      ...this._defTellsFrom(byCov, 'vs Coverage', k => k, k => ({ type: 'coverage', val: k })),
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
    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(StatsEngine.proj(p).formation));
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
        StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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
      const forms = StatsEngine.splitFormations(StatsEngine.proj(p).formation);
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
   * AX-3 (S6-4c): rank a SMALL number of findings, and collapse a repeated
   * countermeasure into one theme.
   *
   * The cap was a flat top-6, so one class could take every slot: a season with
   * five directional tendencies produced five near-identical rows ending in the
   * same sentence, which reads as noise and buries every other kind of finding.
   * Now each class contributes its two strongest rows, and any remainder becomes
   * ONE themed line naming the rest — the coach still learns that six formations
   * tip direction, in one line instead of six.
   *
   * Ranking, priority and the insight text itself are untouched; this only
   * decides how many of each are shown. No cohort, count or metric changes.
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
      StatsEngine.splitFormations(StatsEngine.proj(p).formation).forEach(f => {
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
    const plays = all.filter(p => (p.tags.unit || 'offense') === 'offense');
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length === 0) return null;

    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(StatsEngine.proj(p).formation));
    const byDownDist = this._selfScoutGroup(plays, p => this._ddKey(p.tags));
    const byPersonnel = this._selfScoutGroup(plays, p => p.tags.personnel);
    const byHash = this._selfScoutGroup(plays, p => p.tags.hash);
    // Combined formation-on-down — what a DC actually keys on.
    const byCombo = this._selfScoutGroup(plays, p => {
      const dd = this._ddKey(p.tags);
      if (!dd) return [];
      return StatsEngine.splitFormations(StatsEngine.proj(p).formation).map(f => `${f}__${dd}`);
    });
    // Hudl-model dimensions: backfield, strength, and the high-value Formation ×
    // Strength grid (e.g. "Trips Right is 90% run" — what a DC keys on).
    const byBackfield = this._selfScoutGroup(plays, p => StatsEngine.proj(p).backfield);
    const byStrength = this._selfScoutGroup(plays, p => StatsEngine.proj(p).strength);
    const byFormStr = this._selfScoutGroup(plays, p => {
      const s = StatsEngine.proj(p).strength;
      if (!s) return [];
      return StatsEngine.splitFormations(StatsEngine.proj(p).formation).map(f => `${f}__${s}`);
    });

    let tells = [
      ...this._tellsFrom(byCombo, 'Formation × Down', k => {
        const [f, dd] = k.split('__'); return `${f} on ${this._ddPretty(dd)}`;
      }, k => ({ type: 'comboFD', val: k })),
      ...this._tellsFrom(byFormation, 'Formation', k => `From ${k}`, k => ({ type: 'formation', val: k })),
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
      downDistRows: this._selfScoutRows(byDownDist).sort((a, b) => b.n - a.n).slice(0, 15),
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
