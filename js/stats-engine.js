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
import { gainedFirstDown, DRIVE_ENDERS } from './football-rules.js';

const RUN_COLOR = '#f0b429';
const PASS_COLOR = '#38bdf8';

export class StatsEngine {
  /**
   * Split a (possibly multi-select) formation string into its component
   * formations. "Pistol + Spread" -> ["Pistol", "Spread"]; blank -> ["Unknown"].
   */
  static splitFormations(formation) {
    const parts = String(formation || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : ['Unknown'];
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
  static playPoints(p) {
    if (!p || !p.tags) return 0;
    const res = StatsEngine.splitResults(p.tags.result);
    const st = p.tags.stType || '';
    if (res.includes('Touchdown')) return 6;
    if (res.includes('Safety')) return 2;
    if (st === '2-Pt') return res.includes('Good') ? 2 : 0;
    if (st === 'XP') return res.includes('Good') ? 1 : 0;
    if (st === 'Field Goal') return res.includes('Good') ? 3 : 0;
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
    if (!p || !p.tags) return 'us';
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
    let us = 0, them = 0;
    const events = [];
    const byQuarter = {};
    plays.forEach(p => {
      const pts = StatsEngine.playPoints(p);
      if (!pts) return;
      const side = StatsEngine.scoringSide(p);
      if (side === 'them') them += pts; else us += pts;
      const q = p.tags.quarter || '';
      if (q) {
        if (!byQuarter[q]) byQuarter[q] = { us: 0, them: 0 };
        byQuarter[q][side] += pts;
      }
      events.push({
        playId: p.id, quarter: q, points: pts, side,
        type: this._scoreType(p), us, them
      });
    });
    return { us, them, events, byQuarter, hasData: events.length > 0 };
  }

  _scoreType(p) {
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
    this.dashboardEl = document.getElementById('statsDashboard');
    this.btnShowStats = document.getElementById('btnShowStats');
    this.btnCloseStats = document.getElementById('btnCloseStats');

    this._bindEvents();
  }

  _bindEvents() {
    this.btnShowStats.addEventListener('click', () => this.showDashboard());
    if (this.btnCloseStats) {
      this.btnCloseStats.addEventListener('click', () => this.hideDashboard());
    }
  }

  showDashboard() {
    const stats = this.compute();
    this._renderDashboard(stats);
    this.dashboardEl.classList.remove('hidden');
  }

  hideDashboard() {
    this.dashboardEl.classList.add('hidden');
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
      tendencies: this._tendencyStats(offPlays),
      bigPlays: this._bigPlays(offPlays),
      individuals: this._individualStats(plays),
      drives: this._driveStats(offPlays),
      situational: this._situationalStats(offPlays),
      efficiency: this._efficiencyStats(offPlays),
      personnel: this._personnelStats(offPlays),
      advanced: this.advanced.summarize(offPlays),
      defensive: this._defensiveStats(defPlays),
      gameFlow: this._gameFlowStats(offPlays),
      conversions: this._conversionStats(convSource),
      scoreboard: this.computeScoreboard(convSource),
      hash: this._hashStats(offPlays),
      personnelSituation: this._personnelSituationStats(offPlays),
      frontCoverageCombos: this._frontCoverageCombos(defPlays),
      playAction: this._playActionStats(offPlays),
      dirMotion: this._directionMotionStats(offPlays),
    };
    stats.takeaways = this._generateTakeaways(stats);

    return stats;
  }

  _currentPlays() {
    let plays = this.tagger.plays.filter(p => p.tags.playType);
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
      else if (res.includes('Interception') || res.includes('Fumble')) outcome = 'Turnover';
      else if (res.includes('Kneel')) outcome = 'Kneel';
      const startYL = this._absYardLine(first.tags);
      const points = outcome === 'TD' ? 6 : outcome === 'FG' ? 3 : outcome === 'Safety' ? 2 : 0;
      let driveType = 'Other';
      if (dp.length <= 3 && outcome !== 'TD' && outcome !== 'FG') driveType = '3-and-out';
      else if (dp.length >= 8 || yards >= 60) driveType = 'Sustained';
      else if (yards >= 30 && dp.length <= 4) driveType = 'Explosive';
      else if (outcome === 'TD' || outcome === 'FG') driveType = 'Scoring';
      return { number: idx + 1, plays: dp.length, yards, outcome, startYL, points, driveType };
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
    const tfl = plays.filter(p => (parseInt(p.tags.yardage) || 0) < 0 && !StatsEngine.hasResult(p, 'Sack'));
    const ints = plays.filter(p => StatsEngine.hasResult(p, 'Interception'));
    const fumbles = plays.filter(p => StatsEngine.hasResult(p, 'Fumble'));
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

      StatsEngine.splitFronts(p.tags.defFront).forEach(f => {
        if (!fronts[f]) fronts[f] = { name: f, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0 };
        fronts[f].count++;
        fronts[f].yards += yds;
        if (defSuccess) fronts[f].successes++;
        if (isHavoc) fronts[f].havoc++;
        if (StatsEngine.isRun(p)) fronts[f].runs++;
        else fronts[f].passes++;
      });

      if (p.tags.coverage) {
        const c = p.tags.coverage;
        if (!coverages[c]) coverages[c] = { name: c, count: 0, yards: 0, successes: 0, comps: 0, incs: 0, ints: 0, sacks: 0 };
        coverages[c].count++;
        coverages[c].yards += yds;
        if (defSuccess) coverages[c].successes++;
        if (StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain')) coverages[c].comps++;
        if (StatsEngine.hasResult(p, 'Incomplete')) coverages[c].incs++;
        if (StatsEngine.hasResult(p, 'Interception')) coverages[c].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) coverages[c].sacks++;
      }

      if (p.tags.blitz) {
        StatsEngine.splitBlitzes(p.tags.blitz).forEach(b => {
          if (!blitzes[b]) blitzes[b] = { name: b, count: 0, yards: 0, sacks: 0, havoc: 0, successes: 0 };
          blitzes[b].count++;
          blitzes[b].yards += yds;
          if (StatsEngine.hasResult(p, 'Sack')) blitzes[b].sacks++;
          if (isHavoc) blitzes[b].havoc++;
          if (defSuccess) blitzes[b].successes++;
        });
      }
    });

    const blitzPlays = plays.filter(p => p.tags.blitz);
    const noBlitzPlays = plays.filter(p => !p.tags.blitz && (p.tags.defFront || p.tags.coverage));
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
      havocPlays,
      havocRate: plays.length ? ((havocPlays / plays.length) * 100).toFixed(1) : '0.0',
      incompletions: incompletions.length,
      threeAndOuts,
      fronts: Object.values(fronts).sort((a, b) => b.count - a.count),
      coverages: Object.values(coverages).sort((a, b) => b.count - a.count),
      blitzes: Object.values(blitzes).sort((a, b) => b.count - a.count),
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
      // or another possession follows (so this one ended in an untagged punt).
      // Without this, a short drive cut off by the end of a half/game — or a
      // partially-tagged final drive — would be miscounted as a three-and-out.
      const punted = StatsEngine.hasResult(dp[dp.length - 1], 'Punt');
      const possessionFollowed = idx < drives.length - 1;
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
    const ordered = [...plays].sort((a, b) =>
      ((a.timestamp && a.timestamp.start) ?? a.id ?? 0) -
      ((b.timestamp && b.timestamp.start) ?? b.id ?? 0));
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
      if ((possessionEnded || downReset) && cur.length) { drives.push(cur); cur = []; }
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
    const attempts = completions.length + incompletions.length +
      passPlays.filter(p => StatsEngine.hasResult(p, 'Interception')).length;

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

  /**
   * PAT / 2-point conversion success. Keyed on stType ('XP' | '2-Pt') and the
   * explicit Good / No Good (or Touchdown / Field Goal) result, so it works
   * even on ST plays that carry no offensive playType.
   */
  _conversionStats(source) {
    const made = (p) => StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'Field Goal');
    const tally = (type) => {
      const att = source.filter(p => p.tags.stType === type);
      const m = att.filter(p => made(p)).length;
      return { att: att.length, made: m, pct: att.length ? Math.round(m / att.length * 100) : 0 };
    };
    const two = tally('2-Pt');
    const xp = tally('XP');
    return { two, xp, hasData: two.att > 0 || xp.att > 0 };
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
    const fumbles = plays.filter(p => StatsEngine.hasResult(p, 'Fumble')).length;
    return {
      total: ints + fumbles,
      interceptions: ints,
      fumbles
    };
  }

  _tendencyStats(plays) {
    const formations = {};
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
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
      clipName: p.clipName || `Play ${p.id}`
    }));
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
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
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
      const cov = p.tags.coverage;
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
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
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
        working.push({ s: succPct * Math.min(f.count, 15), text: `<strong>${f.name}</strong>: ${succPct}% success (${f.count} plays, ${f.avg} avg)` });
      if (runPct >= 75)
        fix.push({ s: (runPct - 50) * Math.min(f.count, 15), text: `<strong>${f.name}</strong> is ${runPct.toFixed(0)}% run — add a pass concept to keep the defense honest` });
      else if (runPct <= 25)
        fix.push({ s: (50 - runPct) * Math.min(f.count, 15), text: `<strong>${f.name}</strong> is ${(100 - runPct).toFixed(0)}% pass — mix in a draw or screen` });
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
            working.push({ s: conv * Math.min(b.count, 12), text: `<strong>${tag}</strong>: converting ${conv}% (${b.count} plays, ${b.avgYards} avg)` });
          else if (conv <= 30)
            fix.push({ s: (50 - conv) * Math.min(b.count, 12), text: `<strong>${tag}</strong>: only ${conv}% conversion (${b.count} plays) — need a better call here` });
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
          working.push({ s: stopPct * Math.min(c.count, 10), text: `<strong>${c.name}</strong>: ${stopPct.toFixed(0)}% stop rate, ${avg.toFixed(1)} avg allowed (${c.count} snaps)` });
        else if (avg >= 7)
          fix.push({ s: avg * Math.min(c.count, 10), text: `<strong>${c.name}</strong> allowing ${avg.toFixed(1)} YPA (${c.count} snaps) — consider switching` });
      });
    }

    // --- Front+coverage combos ---
    if (stats.frontCoverageCombos?.list) {
      stats.frontCoverageCombos.list.forEach(c => {
        if (c.count < MIN_N) return;
        const stopPct = parseInt(c.stopPct);
        const avg = parseFloat(c.avg);
        if (stopPct >= 65 && avg <= 3.5)
          working.push({ s: stopPct * Math.min(c.count, 10), text: `<strong>${c.name}</strong>: ${stopPct}% stop rate, ${avg} avg (${c.count} snaps) — keep calling it` });
      });
    }

    // --- Play-action ---
    if (stats.playAction?.hasData && stats.tendencies.runs >= MIN_N) {
      const runPct = parseFloat(stats.tendencies.runPct);
      const paRate = parseFloat(stats.playAction.paRate);
      const paYPA = parseFloat(stats.playAction.paYPA);
      const straightYPA = parseFloat(stats.playAction.straightYPA);
      if (stats.playAction.paPlays >= 3 && paYPA > straightYPA + 2)
        working.push({ s: (paYPA - straightYPA) * 100, text: `Play-action: <strong>${paYPA} YPA</strong> vs ${straightYPA} straight — it's working, lean into it` });
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
          working.push({ s: tdPct * 5, text: `Red zone TD rate <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — finishing drives` });
        else if (tdPct <= 25)
          fix.push({ s: (50 - tdPct) * 10, text: `Red zone TD rate only <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — settling for FGs or stalling` });
      }
    }

    // --- Explosive / negative rates ---
    if (stats.efficiency && stats.totalPlays >= 10) {
      const expPct = parseFloat(stats.efficiency.explosivePct);
      if (expPct >= 15)
        working.push({ s: expPct * 20, text: `<strong>${expPct}%</strong> explosive play rate (${stats.efficiency.explosivePlays} plays) — hitting big shots` });
      const negPct = parseFloat(stats.efficiency.negativePct);
      if (negPct >= 15)
        fix.push({ s: negPct * 20, text: `<strong>${negPct}%</strong> negative play rate (${stats.efficiency.negativePlays} plays) — too many losses behind the line` });
    }

    // --- Hash predictability ---
    if (stats.hash?.hasData) {
      stats.hash.list.forEach(h => {
        if (h.count < MIN_N) return;
        const runPct = parseInt(h.runPct);
        if (runPct >= 70) fix.push({ s: (runPct - 50) * Math.min(h.count, 12), text: `<strong>${h.name} hash</strong>: ${runPct}% run (${h.count} snaps) — predictable` });
        else if (runPct <= 30) fix.push({ s: (50 - runPct) * Math.min(h.count, 12), text: `<strong>${h.name} hash</strong>: ${100 - runPct}% pass (${h.count} snaps) — predictable` });
      });
    }

    // --- Run direction lean ---
    if (stats.dirMotion?.hasDirData) {
      const dirRuns = stats.dirMotion.dirList.map(d => ({ name: d.name, runs: d.runs }));
      const totalDirRuns = dirRuns.reduce((s, d) => s + d.runs, 0);
      if (totalDirRuns >= 6) {
        dirRuns.forEach(d => {
          const pct = (d.runs / totalDirRuns) * 100;
          if (pct >= 60) fix.push({ s: (pct - 50) * Math.min(totalDirRuns, 12), text: `<strong>${pct.toFixed(0)}%</strong> of runs go <strong>${d.name}</strong> (${d.runs}/${totalDirRuns}) — defenses will overload that side` });
        });
      }
    }

    // --- Motion tell ---
    if (stats.dirMotion?.hasMotionData) {
      const m = stats.dirMotion.motionList.reduce((acc, x) => ({ count: acc.count + x.count, runs: acc.runs + x.runs }), { count: 0, runs: 0 });
      if (m.count >= MIN_N) {
        const runPct = (m.runs / m.count) * 100;
        if (runPct >= 75) fix.push({ s: (runPct - 50) * Math.min(m.count, 12), text: `When you motion, you run <strong>${runPct.toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
        else if (runPct <= 25) fix.push({ s: (50 - runPct) * Math.min(m.count, 12), text: `When you motion, you pass <strong>${(100 - runPct).toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
      }
    }

    working.sort((a, b) => b.s - a.s);
    fix.sort((a, b) => b.s - a.s);
    return { working: working.slice(0, 5), fix: fix.slice(0, 5) };
  }

  _individualStats(plays) {
    const rushers = {};
    const passers = {};
    const receivers = {};
    const tacklers = {};
    const returners = {};
    const kickers = {};

    plays.forEach(p => {
      const players = p.tags.players || {};
      const yds = parseInt(p.tags.yardage) || 0;
      const isRun = StatsEngine.isRun(p);
      const isPass = StatsEngine.isPass(p);
      const isTD = StatsEngine.hasResult(p, 'Touchdown');
      const isComplete = StatsEngine.hasResult(p, 'Gain') || isTD || StatsEngine.hasResult(p, 'No Gain');
      const st = p.tags.stType || '';

      // --- Special teams ---
      if (players.returner && st.includes('Return')) {
        const id = players.returner;
        if (!returners[id]) returners[id] = { num: id, returns: 0, yards: 0, tds: 0, long: 0 };
        returners[id].returns++;
        returners[id].yards += yds;
        if (isTD) returners[id].tds++;
        if (yds > returners[id].long) returners[id].long = yds;
      }
      if (players.kicker && st) {
        const id = players.kicker;
        if (!kickers[id]) kickers[id] = { num: id, fgAtt: 0, fgMade: 0, punts: 0, puntYds: 0 };
        if (st === 'Field Goal' || st === 'XP') {
          kickers[id].fgAtt++;
          // 'Good'/'Field Goal' (made) or a scoring result counts as made
          if (StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Field Goal') || StatsEngine.hasResult(p, 'Touchdown')) kickers[id].fgMade++;
        } else if (st === 'Punt') {
          kickers[id].punts++;
          kickers[id].puntYds += yds;
        }
      }

      // Ball carrier (rushing)
      if (players.ballCarrier && isRun) {
        const id = players.ballCarrier;
        if (!rushers[id]) rushers[id] = { num: id, attempts: 0, yards: 0, tds: 0, long: 0, fumbles: 0 };
        rushers[id].attempts++;
        rushers[id].yards += yds;
        if (isTD) rushers[id].tds++;
        if (yds > rushers[id].long) rushers[id].long = yds;
        if (StatsEngine.hasResult(p, 'Fumble')) rushers[id].fumbles++;
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
        if (!passers[id]) passers[id] = { num: id, attempts: 0, completions: 0, yards: 0, tds: 0, ints: 0, sacks: 0 };
        // Attempts = completions + incompletions + INTs (matches team C/A).
        if (isComplete || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) passers[id].attempts++;
        if (isComplete) {
          passers[id].completions++;
          passers[id].yards += yds;
        }
        if (isTD) passers[id].tds++;
        if (StatsEngine.hasResult(p, 'Interception')) passers[id].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) passers[id].sacks++;
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
        if (!receivers[id]) receivers[id] = { num: id, receptions: 0, yards: 0, tds: 0, long: 0 };
        receivers[id].receptions++;
        receivers[id].yards += yds;
        if (isTD) receivers[id].tds++;
        if (yds > receivers[id].long) receivers[id].long = yds;
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
      tacklerIds.forEach(id => {
        if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, solo: 0, assists: 0, sacks: 0, tfl: 0, ints: 0, fumblesRec: 0 };
        tacklers[id].tackles++;
        if (shared) tacklers[id].assists++; else tacklers[id].solo++;
        if (StatsEngine.hasResult(p, 'Sack')) tacklers[id].sacks++;
        // TFL excludes sacks — matches the team-level definition.
        else if (yds < 0) tacklers[id].tfl++;
        // Defensive takeaways credited to the defender(s) on the play.
        if (isDefPlay && StatsEngine.hasResult(p, 'Interception')) tacklers[id].ints++;
        if (isDefPlay && StatsEngine.hasResult(p, 'Fumble')) tacklers[id].fumblesRec++;
        if (p.tags.grades?.tackler != null) {
          if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
          if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
          tacklers[id].gradeSum += p.tags.grades.tackler;
          tacklers[id].gradeCount++;
        }
      });
    });

    return {
      rushers: Object.values(rushers).sort((a, b) => b.yards - a.yards),
      passers: Object.values(passers).sort((a, b) => b.yards - a.yards),
      receivers: Object.values(receivers).sort((a, b) => b.yards - a.yards),
      tacklers: Object.values(tacklers).sort((a, b) => b.tackles - a.tackles),
      returners: Object.values(returners).sort((a, b) => b.yards - a.yards),
      kickers: Object.values(kickers).sort((a, b) => (b.fgMade + b.punts) - (a.fgMade + a.punts))
    };
  }

  // --- Dashboard Rendering ---

  _renderDashboard(stats) {
    const el = this.dashboardEl;
    const selfScout = this._renderSelfScoutBody(stats);
    const defBody = this._renderDefenseTabBody(stats);
    const noData = stats.allPlays === 0;

    el.innerHTML = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>${this._gameTitle()}${stats.filterActive ? ' <span style="color:var(--highlight);font-size:14px">(Filtered)</span>' : ''}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportStats">Export PDF</button>
              <button class="btn btn-sm btn-danger" id="btnCloseStatsInner">Close</button>
            </div>
          </div>
          <div class="stats-tabs">
            <button class="stats-tab active" data-tab="game">Game</button>
            <button class="stats-tab" data-tab="offense">Offense</button>
            <button class="stats-tab" data-tab="defense">Defense</button>
            <button class="stats-tab" data-tab="selfscout">Self-Scout</button>
          </div>
          <div class="stats-body">
            <div class="stats-tab-pane active" data-pane="game">
              ${noData ? `<div style="text-align:center;padding:48px 24px;color:var(--text-dim)">
                <div style="font-size:36px;margin-bottom:12px">📊</div>
                <div style="font-size:16px;font-weight:600;margin-bottom:8px">No tagged plays yet</div>
                <div style="font-size:13px;line-height:1.5">Tag plays with Play Type + Result + Yardage to see stats.<br>
                Down & Distance adds conversion rates. Formation adds tendencies.</div>
              </div>` : ''}
              <div class="stats-cut-hint">▶ Tip: click any highlighted stat row to watch those exact plays as a film cut-up.</div>
              ${this._renderTakeaways(stats)}
              ${this._renderScoreboard(stats)}
              ${this._renderTeamStats(stats)}
              ${this._renderDownAnalysis(stats)}
              ${this._renderEfficiency(stats)}
              ${this._renderDrives(stats)}
              ${this._renderConversions(stats)}
              ${this._renderBigPlays(stats)}
              ${this._renderGameFlow(stats)}
            </div>
            <div class="stats-tab-pane" data-pane="offense">
              ${this._renderPlayAction(stats)}
              ${this._renderTendencies(stats)}
              ${this._renderPersonnel(stats)}
              ${this._renderDirectionMotion(stats)}
              ${this._renderHashStats(stats)}
              ${this._renderPersonnelSituation(stats)}
              ${this._renderTendencyMatrix(stats)}
              ${this._renderSituational(stats)}
              ${this.heatMaps.render(stats.offPlays)}
              ${Visualizations.render(stats.offPlays)}
              ${this._renderAdvanced(stats)}
              ${this._renderIndividualStats(stats, 'offense')}
              ${this._renderIndividualStats(stats, 'special')}
            </div>
            <div class="stats-tab-pane" data-pane="defense">
              ${defBody}
              ${this._renderIndividualStats(stats, 'defense')}
            </div>
            <div class="stats-tab-pane" data-pane="selfscout">
              ${selfScout}
            </div>
          </div>
        </div>
      </div>
    `;

    // Tab switching (remember the last tab so re-opening lands where the
    // coach left off instead of resetting to Game every time)
    el.querySelectorAll('.stats-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
        el.querySelectorAll('.stats-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        el.querySelector(`.stats-tab-pane[data-pane="${tab.dataset.tab}"]`).classList.add('active');
        this._lastTab = tab.dataset.tab;
      });
    });
    if (this._lastTab && this._lastTab !== 'game') {
      el.querySelector(`.stats-tab[data-tab="${this._lastTab}"]`)?.click();
    }

    // Rebind close button
    el.querySelector('#btnCloseStatsInner').addEventListener('click', () => this.hideDashboard());

    // Export button
    el.querySelector('#btnExportStats').addEventListener('click', () => this._exportStats(stats));

    // Self-scout export
    el.querySelector('#btnExportSelfScout')?.addEventListener('click', () => {
      const report = this.generateSelfScout();
      if (report) this._exportSelfScout(report, document.getElementById('gameTeamName')?.value || 'Our Offense');
    });

    // Defensive report export
    el.querySelector('#btnExportDef')?.addEventListener('click', () => {
      const team = document.getElementById('gameTeamName')?.value || 'Our Defense';
      this._exportDefensiveReport(stats, team);
    });

    // Heat map tab switching
    this.heatMaps.bind(el);

    // Click a player's stat row to jump to their first play on film.
    el.querySelectorAll('.player-row').forEach(row => {
      row.title = "Jump to this player's plays";
      row.addEventListener('click', () => this._watchPlayer(row.dataset.player));
    });

    // "Every data point ties to video": click any tagged stat row to launch a
    // film cut-up of exactly those plays.
    el.querySelectorAll('.cut-row[data-cut-type]').forEach(row => {
      row.title = row.dataset.cutLabel ? `Watch: ${row.dataset.cutLabel}` : 'Watch these plays';
      row.addEventListener('click', () => {
        const filter = this._buildCutFilter(row.dataset.cutType, row.dataset.cutVal);
        this._watchPlays(filter, row.dataset.cutLabel || '');
      });
    });

    // Tendency matrix dimension pickers
    this._bindTendencyMatrix(el);

    // Click overlay to close
    el.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  _renderSelfScoutBody(stats) {
    const report = this.generateSelfScout();
    if (!report) return '<div class="stats-section"><p style="opacity:.6">No run/pass plays tagged yet. Tag your offense to see tendency analysis.</p></div>';
    const meterColor = report.predictability >= 70 ? '#ef4444'
      : report.predictability >= 50 ? '#f59e0b'
        : report.predictability >= 30 ? '#eab308' : '#22c55e';
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="btnExportSelfScout">Export Report</button></div>
      <div class="stats-section">
        <h3>Predictability (${report.totalPlays} run/pass plays)</h3>
        <div class="ss-meter-wrap">
          <div class="ss-meter"><div class="ss-meter-fill" style="width:${report.predictability}%;background:${meterColor}"></div></div>
          <div class="ss-meter-val" style="color:${meterColor}">${report.predictability}<span>/100</span></div>
          <div class="ss-meter-label">${report.predLabel}</div>
        </div>
        <p class="viz-caption">Higher = more predictable. A defensive coordinator reads these same numbers — aim to keep key situations balanced.</p>
      </div>
      <div class="stats-section">
        <h3>Your Top Tells</h3>
        ${this._selfScoutTellsTable(report.tells)}
      </div>
      ${report.recommendations.length ? `<div class="stats-section">
        <h3>Recommendations</h3>
        <ul class="ss-recs">${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
      </div>` : ''}
      <div class="stats-section stats-two-col">
        <div>
          <h3>By Formation</h3>
          ${this._selfScoutSplitTable(report.formationRows, 'Formation')}
        </div>
        <div>
          <h3>By Down &amp; Distance</h3>
          ${this._selfScoutSplitTable(report.downDistRows, 'Down & Dist')}
        </div>
      </div>
      ${report.personnelRows.length ? `<div class="stats-section">
        <h3>By Personnel</h3>
        ${this._selfScoutSplitTable(report.personnelRows, 'Personnel')}
      </div>` : ''}`;
  }

  _renderDefenseTabBody(stats) {
    const hasData = stats.defensive.hasData;
    if (!hasData) return `
      <div class="stats-section def-empty">
        <h3>No defensive data tagged yet</h3>
        <p>Defensive analytics build from your <b>defensive</b> plays. To populate this report:</p>
        <ol class="def-empty-steps">
          <li>Set a play's unit toggle to <b>Defense</b> (or press <kbd>C</kbd> to cycle to it).</li>
          <li>Tag the <b>Front</b> (4-3, Nickel, 3-4…), <b>Coverage</b>, and <b>Blitz</b>.</li>
          <li>Or just tag defensive <b>results</b> — Sack, TFL (negative yardage), Interception, Fumble.</li>
        </ol>
        <p style="color:var(--text-dim)">Once any defensive data exists, this report shows havoc rate, front &amp; coverage breakdowns with stop%, blitz analysis, and front-by-situation.</p>
      </div>`;
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="btnExportDef">Export Report</button></div>
      ${this._renderDefensive(stats)}
      ${this._renderFrontCoverageCombos(stats)}`;
  }

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
    const playable = matches.filter(p => p.timestamp && p.timestamp.end > p.timestamp.start);
    this.hideDashboard();
    const ids = (playable.length ? playable : matches).map(p => p.id);
    if (playable.length && window.app && window.app.cutupPlayer) {
      window.app.cutupPlayer.start(ids, label || `${ids.length} plays`);
    } else {
      this.tagger.selectPlay(ids[0]);
      this.tagger.toast?.('No video on these plays — selected the first one instead');
    }
  }

  /**
   * Build a play-filter predicate for a clickable stat row. Offense-tagged
   * dimensions (formation, play type, down, situation) match our offensive
   * plays; defensive dimensions (front/coverage/blitz) match our defensive
   * plays — mirroring how the dashboard partitions stats by unit.
   */
  _buildCutFilter(type, val) {
    const isOff = p => (p.tags.unit || 'offense') === 'offense';
    const isDef = p => p.tags.unit === 'defense';
    const absYL = p => this._absYardLine(p.tags);
    switch (type) {
      case 'formation': return p => isOff(p) && StatsEngine.splitFormations(p.tags.formation).includes(val);
      case 'playType':  return p => isOff(p) && StatsEngine.splitPlayTypes(p.tags.playType).includes(val);
      case 'personnel': return p => isOff(p) && (p.tags.personnel || '') === val;
      case 'down':      return p => isOff(p) && (p.tags.down || '') === val;
      case 'runpass':   return p => isOff(p) && (val === 'Run' ? StatsEngine.isRun(p) : StatsEngine.isPass(p));
      case 'playDir':   return p => isOff(p) && (p.tags.playDir || '') === val;
      case 'motion':    return p => isOff(p) && (val === 'No Motion' ? !p.tags.motion : (p.tags.motion || '') === val);
      case 'defFront':  return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(val);
      case 'coverage':  return p => isDef(p) && (p.tags.coverage || '') === val;
      case 'blitz':     return p => isDef(p) && StatsEngine.splitBlitzes(p.tags.blitz).includes(val);
      case 'frontCoverage': {
        const [front, cov] = val.split('|');
        return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(front) && (p.tags.coverage || '') === cov;
      }
      case 'situation': {
        switch (val) {
          case 'redZone':    return p => isOff(p) && absYL(p) !== null && absYL(p) >= 80;
          case 'goalLine':   return p => isOff(p) && absYL(p) !== null && absYL(p) >= 95;
          case 'backedUp':   return p => isOff(p) && absYL(p) !== null && absYL(p) <= 10;
          case 'thirdLong':  return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7;
          case 'thirdShort': return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 1 && (parseInt(p.tags.distance) || 0) <= 3;
          default: return null;
        }
      }
      default: return null;
    }
  }

  _gameTitle() {
    const name = document.getElementById('gameProjectName')?.value || '';
    const t = document.getElementById('gameTeamName')?.value || '';
    const o = document.getElementById('gameOpponent')?.value || '';
    const u = document.getElementById('gameScoreUs')?.value;
    const th = document.getElementById('gameScoreThem')?.value;
    const d = document.getElementById('gameDate')?.value || '';
    let title = 'Game Stats';
    if (name) title = name;
    else if (t || o) title = `${t || 'Us'} vs ${o || 'Opponent'}`;
    if (u !== '' && th !== '' && u != null && th != null) title += ` &mdash; ${u}-${th}`;
    if (d) title += ` (${d})`;
    return title;
  }

  _renderEfficiency(stats) {
    const e = stats.efficiency;
    const t = stats.tendencies;
    const succColor = parseFloat(e.successRate) >= 50 ? '#22c55e' : parseFloat(e.successRate) >= 35 ? '#eab308' : '#ef4444';
    const runSuccColor = parseFloat(t.runSuccRate) >= 50 ? '#22c55e' : parseFloat(t.runSuccRate) >= 35 ? '#eab308' : '#ef4444';
    const passSuccColor = parseFloat(t.passSuccRate) >= 50 ? '#22c55e' : parseFloat(t.passSuccRate) >= 35 ? '#eab308' : '#ef4444';
    return `
      <div class="stats-section">
        <h3>Efficiency</h3>
        <div class="eff-gauges-row">
          ${Charts.gauge(parseFloat(e.successRate), 'Success Rate', succColor, 110)}
          ${Charts.gauge(parseFloat(t.runSuccRate), 'Run Success', runSuccColor, 110)}
          ${Charts.gauge(parseFloat(t.passSuccRate), 'Pass Success', passSuccColor, 110)}
          <div class="eff-side-cards">
            <div class="stat-card stat-card-sm"><div class="stat-card-title">Explosive</div><div class="stat-card-value" style="color:#22c55e">${e.explosivePlays}</div><div style="font-size:11px;opacity:.6">${e.explosivePct}% (run 12+/pass 16+)</div></div>
            <div class="stat-card stat-card-sm"><div class="stat-card-title">Negative</div><div class="stat-card-value" style="color:#ef4444">${e.negativePlays}</div><div style="font-size:11px;opacity:.6">${e.negativePct}% of plays</div></div>
          </div>
        </div>
      </div>`;
  }

  _renderAdvanced(stats) {
    const a = stats.advanced;
    if (!a || !a.count) {
      return `<div class="stats-section"><h3>Expected Points (EPA)</h3><p style="opacity:.6">Tag down, distance, yard line and result on plays to see EPA.</p></div>`;
    }
    const W = 600, H = 160, P = 30;
    const n = a.curve.length;
    const vals = a.curve.map(c => c.cum);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const xs = i => P + (n <= 1 ? 0 : (i * (W - 2 * P)) / (n - 1));
    const ys = v => H - P - ((v - lo) / (hi - lo || 1)) * (H - 2 * P);
    const path = a.curve.map((c, i) => `${i === 0 ? 'M' : 'L'}${xs(i).toFixed(1)},${ys(c.cum).toFixed(1)}`).join(' ');
    const zeroY = ys(0).toFixed(1);
    const epaClass = v => v > 0 ? 'epa-pos' : v < 0 ? 'epa-neg' : '';
    const fmt = v => (v > 0 ? '+' : '') + v.toFixed(2);

    const groupTable = (title, rows) => {
      if (!rows.length) return '';
      const body = rows.slice(0, 8).map(r =>
        `<tr><td>${r.name}</td><td>${r.count}</td><td class="${epaClass(r.total)}">${fmt(r.total)}</td><td class="${epaClass(r.perPlay)}">${fmt(r.perPlay)}</td></tr>`
      ).join('');
      return `<div><h4 style="margin:8px 0 4px">${title}</h4>
        <table class="stats-table stats-table-full epa-table">
          <thead><tr><th>${title}</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
          <tbody>${body}</tbody>
        </table></div>`;
    };

    const playRow = (x) => {
      const t = x.play.tags || {};
      const label = `${t.down || '?'}&${t.distance || '?'} ${t.formation || ''} ${t.playType || ''}`.trim();
      return `<tr><td>#${x.play.id}</td><td>${label}</td><td>${t.yardage || 0}</td><td class="${epaClass(x.epa)}">${fmt(x.epa)}</td></tr>`;
    };

    const downRows = ['1', '2', '3', '4'].map(d => {
      const dd = a.byDown[d];
      if (!dd || !dd.count) return '';
      return `<tr><td>${d}</td><td>${dd.count}</td><td class="${epaClass(dd.total)}">${fmt(dd.total)}</td><td class="${epaClass(dd.perPlay)}">${fmt(dd.perPlay)}</td></tr>`;
    }).join('');

    return `
      <div class="stats-section">
        <h3>Expected Points (EPA)</h3>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Total EPA</div><div class="stat-card-value ${epaClass(a.total)}">${fmt(a.total)}</div></div>
          <div class="stat-card"><div class="stat-card-title">EPA / Play</div><div class="stat-card-value ${epaClass(a.perPlay)}">${fmt(a.perPlay)}</div></div>
          <div class="stat-card"><div class="stat-card-title">Plays Scored</div><div class="stat-card-value">${a.count}</div></div>
        </div>
        <div class="epa-curve-wrap">
          <svg viewBox="0 0 ${W} ${H}" class="epa-curve" preserveAspectRatio="xMidYMid meet">
            <line x1="${P}" y1="${zeroY}" x2="${W - P}" y2="${zeroY}" stroke="#555" stroke-dasharray="3,3"/>
            <path d="${path}" fill="none" stroke="var(--accent)" stroke-width="2"/>
            <text x="${P}" y="14" fill="#aaa" font-size="11">Cumulative EPA</text>
            <text x="${P}" y="${H - 8}" fill="#aaa" font-size="10">Play 1</text>
            <text x="${W - P}" y="${H - 8}" fill="#aaa" font-size="10" text-anchor="end">Play ${n}</text>
            <text x="${W - P}" y="14" fill="#aaa" font-size="11" text-anchor="end">High ${hi.toFixed(1)} / Low ${lo.toFixed(1)}</text>
          </svg>
        </div>
        <div class="stats-two-col">
          ${groupTable('Play Type', a.byType)}
          ${groupTable('Formation', a.byFormation)}
        </div>
        <div class="stats-two-col">
          ${groupTable('Personnel', a.byPersonnel)}
          <div><h4 style="margin:8px 0 4px">By Down</h4>
            <table class="stats-table stats-table-full epa-table">
              <thead><tr><th>Down</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
              <tbody>${downRows || '<tr><td colspan="4" style="opacity:.6">No data</td></tr>'}</tbody>
            </table>
          </div>
        </div>
        <div class="stats-two-col">
          <div><h4 style="margin:8px 0 4px;color:#44ff88">Top 5 EPA Plays</h4>
            <table class="stats-table stats-table-full epa-table">
              <thead><tr><th>#</th><th>Situation</th><th>Yds</th><th>EPA</th></tr></thead>
              <tbody>${a.top.map(playRow).join('')}</tbody>
            </table>
          </div>
          <div><h4 style="margin:8px 0 4px;color:#ff6666">Worst 5 EPA Plays</h4>
            <table class="stats-table stats-table-full epa-table">
              <thead><tr><th>#</th><th>Situation</th><th>Yds</th><th>EPA</th></tr></thead>
              <tbody>${a.worst.map(playRow).join('')}</tbody>
            </table>
          </div>
        </div>
      </div>`;
  }

  _renderScoreboard(stats) {
    const sb = stats.scoreboard;
    if (!sb || !sb.hasData) return '';
    const team = document.getElementById('gameTeamName')?.value || 'Us';
    const opp = document.getElementById('gameOpponent')?.value || 'Opponent';
    const winColor = '#22c55e', loseColor = '#ef4444', tieColor = 'var(--text)';
    const usColor = sb.us > sb.them ? winColor : sb.us < sb.them ? loseColor : tieColor;
    const themColor = sb.them > sb.us ? winColor : sb.them < sb.us ? loseColor : tieColor;

    // Per-quarter table. Show all four quarters (zeros included) so the row
    // reads like a real scoreboard; points from plays with no quarter tag go
    // into an "N/Q" column so the quarters always sum to the Final.
    let qTable = '';
    if (Object.keys(sb.byQuarter).length) {
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      if (sb.byQuarter['OT']) quarters.push('OT');
      const qUs = quarters.reduce((s, q) => s + (sb.byQuarter[q]?.us || 0), 0);
      const qThem = quarters.reduce((s, q) => s + (sb.byQuarter[q]?.them || 0), 0);
      const untrackedUs = sb.us - qUs;
      const untrackedThem = sb.them - qThem;
      const hasUntracked = untrackedUs > 0 || untrackedThem > 0;
      const head = quarters.map(q => `<th>${q}</th>`).join('') + (hasUntracked ? '<th title="Scoring plays with no quarter tag">N/Q</th>' : '');
      const usRow = quarters.map(q => `<td>${sb.byQuarter[q]?.us || 0}</td>`).join('') + (hasUntracked ? `<td>${untrackedUs}</td>` : '');
      const themRow = quarters.map(q => `<td>${sb.byQuarter[q]?.them || 0}</td>`).join('') + (hasUntracked ? `<td>${untrackedThem}</td>` : '');
      qTable = `
        <table class="stats-table scoreboard-quarters">
          <thead><tr><th></th>${head}<th>Final</th></tr></thead>
          <tbody>
            <tr><td>${team}</td>${usRow}<td><strong>${sb.us}</strong></td></tr>
            <tr><td>${opp}</td>${themRow}<td><strong>${sb.them}</strong></td></tr>
          </tbody>
        </table>${hasUntracked ? '<p class="viz-caption">N/Q = scoring plays missing a Quarter tag.</p>' : ''}`;
    }
    return `
      <div class="stats-section">
        <h3>Scoreboard</h3>
        <div class="scoreboard-final">
          <div class="scoreboard-team">
            <div class="scoreboard-name">${team}</div>
            <div class="scoreboard-pts" style="color:${usColor}">${sb.us}</div>
          </div>
          <div class="scoreboard-sep">–</div>
          <div class="scoreboard-team">
            <div class="scoreboard-name">${opp}</div>
            <div class="scoreboard-pts" style="color:${themColor}">${sb.them}</div>
          </div>
        </div>
        ${qTable}
        <p class="viz-caption">Tracked live from tagged scoring plays (TD = 6, FG = 3, XP = 1, 2-Pt = 2). Offense &amp; Special Teams plays score for ${team}; Defense plays score for ${opp}.</p>
      </div>`;
  }

  _renderConversions(stats) {
    const c = stats.conversions;
    if (!c || !c.hasData) return '';
    const card = (label, d) => {
      if (!d.att) return '';
      const color = d.pct >= 60 ? '#22c55e' : d.pct >= 40 ? '#eab308' : '#ef4444';
      return `${Charts.gauge(d.pct, `${label} ${d.made}/${d.att}`, color, 110)}`;
    };
    const cards = [card('2-Point', c.two), card('PAT (XP)', c.xp)].filter(Boolean).join('');
    return `
      <div class="stats-section">
        <h3>PAT &amp; 2-Point Conversions</h3>
        <div class="sit-gauges-row">${cards}</div>
        <p class="viz-caption">Tag the ST Play Type (2-Pt / XP) and pick <b>Good</b> or <b>No Good</b> in Result to chart conversion success.</p>
      </div>`;
  }

  _renderSituational(stats) {
    const s = stats.situational;
    const row = (label, b, key) => b.total === 0 ? '' :
      `<tr class="cut-row" data-cut-type="situation" data-cut-val="${key}" data-cut-label="${label} — ${b.total} plays"><td>${label}</td><td>${b.total}</td><td>${b.yards}</td><td>${b.avg}</td><td>${b.successPct}%</td><td>${b.tds}</td></tr>`;
    const rows = [
      row('Red Zone', s.redZone, 'redZone'),
      row('Goal Line', s.goalLine, 'goalLine'),
      row('Backed Up', s.backedUp, 'backedUp'),
      row('3rd & Long', s.thirdLong, 'thirdLong'),
      row('3rd & Short', s.thirdShort, 'thirdShort')
    ].filter(Boolean).join('');
    if (!rows) return '';

    const rzPct = s.redZone.total ? Math.round(s.redZone.tds / s.redZone.total * 100) : 0;
    const rzColor = rzPct >= 60 ? '#22c55e' : rzPct >= 40 ? '#eab308' : '#ef4444';
    const buPct = parseFloat(s.backedUp.successPct) || 0;
    const buColor = buPct >= 45 ? '#22c55e' : buPct >= 30 ? '#eab308' : '#ef4444';

    let qRows = '';
    for (const [q, qs] of Object.entries(s.byQuarter)) {
      if (qs.plays === 0) continue;
      qRows += `<tr><td>${q}</td><td>${qs.plays}</td><td>${qs.yards}</td><td>${qs.tds}</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Situational</h3>
        <div class="sit-gauges-row">
          ${s.redZone.total ? Charts.gauge(rzPct, `Red Zone TD (${s.redZone.tds}/${s.redZone.total})`, rzColor, 100) : ''}
          ${s.backedUp.total ? Charts.gauge(buPct, `Backed Up Succ%`, buColor, 100) : ''}
        </div>
        <div class="stats-two-col">
          <div>
            <table class="stats-table stats-table-full">
              <thead><tr><th>Situation</th><th>#</th><th>Yds</th><th>Avg</th><th>Succ%</th><th>TD</th></tr></thead>
              <tbody>${rows}</tbody>
            </table>
          </div>
          <div>
            <h4 style="margin:0 0 6px">By Quarter</h4>
            ${qRows ? `<table class="stats-table stats-table-full">
              <thead><tr><th>Q</th><th>Plays</th><th>Yds</th><th>TD</th></tr></thead>
              <tbody>${qRows}</tbody>
            </table>` : '<p style="opacity:.6">No quarter data tagged.</p>'}
          </div>
        </div>
      </div>`;
  }

  _renderDrives(stats) {
    const d = stats.drives;
    if (d.total === 0) return '';
    const colorMap = { TD: '#22c55e', FG: '#06b6d4', Safety: '#a78bfa', Punt: '#6b7280', Turnover: '#ef4444', Kneel: '#4b5563', Other: '#f59e0b' };
    const outcomeCounts = {};
    d.list.forEach(dr => { outcomeCounts[dr.outcome] = (outcomeCounts[dr.outcome] || 0) + 1; });
    const outcomeDonut = Charts.donutWithLegend(
      Object.entries(outcomeCounts).map(([k, v]) => ({ value: v, color: colorMap[k] || '#aaa', label: k })),
      100, String(d.total), 'drives'
    );

    let rows = '';
    const maxYds = Math.max(1, ...d.list.map(dr => Math.abs(dr.yards)));
    for (const dr of d.list) {
      const color = colorMap[dr.outcome] || '#aaa';
      const barPct = Math.max(3, (Math.abs(dr.yards) / maxYds) * 100);
      const startLabel = dr.startYL != null ? (dr.startYL > 50 ? `Opp ${100 - dr.startYL}` : `Own ${dr.startYL}`) : '';
      rows += `<div class="drive-row">
        <span class="drive-num">${dr.number}</span>
        <div class="drive-bar"><div style="background:${color};height:100%;width:${barPct.toFixed(1)}%;border-radius:3px"></div></div>
        <span class="drive-meta">${startLabel ? startLabel + ' · ' : ''}${dr.plays}pl · ${dr.yards}yd</span>
        <span class="drive-outcome" style="color:${color}">${dr.outcome}</span>
      </div>`;
    }
    return `
      <div class="stats-section">
        <h3>Drives</h3>
        <div class="drives-top-row">
          <div class="stats-grid stats-grid-flex">
            <div class="stat-card"><div class="stat-card-title">Scoring</div><div class="stat-card-value">${d.scoringDrives}/${d.total}</div></div>
            <div class="stat-card"><div class="stat-card-title">Pts/Drive</div><div class="stat-card-value">${d.pointsPerDrive}</div></div>
            <div class="stat-card"><div class="stat-card-title">3 &amp; Out</div><div class="stat-card-value">${d.threeAndOuts}</div></div>
            <div class="stat-card"><div class="stat-card-title">Avg Plays</div><div class="stat-card-value">${d.avgPlaysPerDrive}</div></div>
            <div class="stat-card"><div class="stat-card-title">Avg Yards</div><div class="stat-card-value">${d.avgYardsPerDrive}</div></div>
          </div>
          <div class="drives-donut">${outcomeDonut}</div>
        </div>
        <div class="drive-chart">${rows}</div>
      </div>`;
  }

  _renderGameFlow(stats) {
    if (!stats.gameFlow || stats.gameFlow.length < 3) return '';
    return `
      <div class="stats-section viz-section">
        ${Charts.gameFlow(stats.gameFlow)}
      </div>`;
  }

  // ===== Game Plan render ================================================
  _renderTakeaways(stats) {
    const t = stats.takeaways;
    if (!t || (!t.working?.length && !t.fix?.length)) return '';
    const renderList = (items, cls) => items.map(i =>
      `<li class="gp-item gp-${cls}">${i.text}</li>`
    ).join('');
    const workingHtml = t.working?.length
      ? `<div class="gp-col"><h4 class="gp-head gp-head-good">What's Working</h4><ul class="gp-list">${renderList(t.working, 'good')}</ul></div>` : '';
    const fixHtml = t.fix?.length
      ? `<div class="gp-col"><h4 class="gp-head gp-head-fix">Needs Work</h4><ul class="gp-list">${renderList(t.fix, 'fix')}</ul></div>` : '';
    return `
      <div class="stats-section game-plan-section">
        <h3>Game Plan</h3>
        <div class="gp-grid">${workingHtml}${fixHtml}</div>
      </div>`;
  }

  // ===== Feature 2 render: Hash Tendencies ==============================
  _renderHashStats(stats) {
    if (!stats.hash || !stats.hash.hasData) return '';
    let rows = '';
    for (const h of stats.hash.list) {
      const runPct = parseInt(h.runPct);
      const bar = Charts.stackBar([{ value: h.runs, color: RUN_COLOR, label: 'Run' }, { value: h.passes, color: PASS_COLOR, label: 'Pass' }]);
      rows += `<tr><td>${h.name}</td><td>${h.count}</td><td>${bar}</td><td>${h.runPct}%</td><td>${h.avg}</td><td>${h.successPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Hash Tendencies</h3>
        <table class="stats-table"><thead><tr><th>Hash</th><th>Plays</th><th>Run / Pass</th><th>Run%</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Play Direction + Motion render =================================
  _renderDirectionMotion(stats) {
    const dm = stats.dirMotion;
    if (!dm || (!dm.hasDirData && !dm.hasMotionData)) return '';

    let dirHtml = '';
    if (dm.hasDirData) {
      let rows = '';
      for (const d of dm.dirList) {
        const bar = Charts.stackBar([{ value: d.runs, color: RUN_COLOR, label: 'Run' }, { value: d.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="playDir" data-cut-val="${d.name}" data-cut-label="${d.name} — ${d.count} plays"><td>${d.name}</td><td>${d.count}</td><td>${bar}</td><td>${d.avg}</td><td>${d.succPct}%</td></tr>`;
      }
      dirHtml = `<div><h3>Play Direction</h3>
        <table class="stats-table"><thead><tr><th>Direction</th><th>Plays</th><th>Run / Pass</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    let motionHtml = '';
    if (dm.hasMotionData) {
      let rows = '';
      for (const m of dm.motionList) {
        const bar = Charts.stackBar([{ value: m.runs, color: RUN_COLOR, label: 'Run' }, { value: m.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="motion" data-cut-val="${m.name}" data-cut-label="${m.name} motion — ${m.count} plays"><td>${m.name}</td><td>${m.count}</td><td>${bar}</td><td>${m.avg}</td><td>${m.succPct}%</td></tr>`;
      }
      const nm = dm.noMotion;
      if (nm.count) {
        const bar = Charts.stackBar([{ value: nm.runs, color: RUN_COLOR, label: 'Run' }, { value: nm.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="motion" data-cut-val="No Motion" data-cut-label="No motion — ${nm.count} plays"><td style="opacity:.65">No Motion</td><td>${nm.count}</td><td>${bar}</td><td>${nm.avg}</td><td>${nm.succPct}%</td></tr>`;
      }
      motionHtml = `<div><h3>Motion</h3>
        <table class="stats-table"><thead><tr><th>Motion</th><th>Plays</th><th>Run / Pass</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    return `<div class="stats-section stats-two-col">${dirHtml}${motionHtml}</div>`;
  }

  // ===== Feature 3 render: Personnel × Situation ========================
  _renderPersonnelSituation(stats) {
    if (!stats.personnelSituation || !stats.personnelSituation.hasData) return '';
    let rows = '';
    for (const c of stats.personnelSituation.list) {
      const bar = Charts.stackBar([{ value: c.runs, color: RUN_COLOR, label: 'Run' }, { value: c.passes, color: PASS_COLOR, label: 'Pass' }]);
      rows += `<tr><td>${c.personnel}</td><td>${c.situation}</td><td>${c.count}</td><td>${bar}</td><td>${c.runPct}%</td><td>${c.avg}</td><td>${c.successPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Personnel × Situation</h3>
        <table class="stats-table"><thead><tr><th>Personnel</th><th>Situation</th><th>Plays</th><th>Run / Pass</th><th>Run%</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Feature 4 render: Front + Coverage Combos ======================
  _renderFrontCoverageCombos(stats) {
    if (!stats.frontCoverageCombos || !stats.frontCoverageCombos.hasData) return '';
    let rows = '';
    for (const c of stats.frontCoverageCombos.list) {
      rows += `<tr class="cut-row" data-cut-type="frontCoverage" data-cut-val="${c.front}|${c.coverage}" data-cut-label="${c.name}"><td>${c.name}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.stopPct}%</td><td>${c.havocPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Front + Coverage Combos</h3>
        <table class="stats-table"><thead><tr><th>Combo</th><th>Plays</th><th>Avg Yds</th><th>Stop%</th><th>Havoc%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Feature 6 render: Play-Action Breakdown ========================
  _renderPlayAction(stats) {
    if (!stats.playAction || !stats.playAction.hasData) return '';
    const pa = stats.playAction;
    let formRows = '';
    for (const f of pa.formationList) {
      formRows += `<tr><td>${f.name}</td><td>${f.count}</td><td>${f.avg}</td><td>${f.successPct}%</td></tr>`;
    }
    const formTable = formRows ? `
      <table class="stats-table" style="margin-top:12px"><thead><tr><th>Formation</th><th>PA Plays</th><th>Avg</th><th>Success%</th></tr></thead>
      <tbody>${formRows}</tbody></table>` : '';
    return `
      <div class="stats-section">
        <h3>Play-Action</h3>
        <div class="stats-grid stats-grid-flex">
          <div class="stat-card"><div class="stat-card-title">PA Rate</div><div class="stat-card-value">${pa.paRate}%</div><div class="stat-card-sub">${pa.paPlays} of dropbacks</div></div>
          <div class="stat-card"><div class="stat-card-title">PA Comp%</div><div class="stat-card-value">${pa.paCompPct}%</div></div>
          <div class="stat-card"><div class="stat-card-title">PA YPA</div><div class="stat-card-value">${pa.paYPA}</div></div>
          <div class="stat-card"><div class="stat-card-title">Straight YPA</div><div class="stat-card-value">${pa.straightYPA}</div></div>
        </div>
        ${formTable}
      </div>`;
  }

  _renderPersonnel(stats) {
    const filtered = stats.personnel.filter(g => !(g.name === 'Unknown' && stats.personnel.length > 1));
    if (!filtered.length) return '';
    const chart = Charts.effectivenessRows(
      filtered.map(g => ({ label: g.name, count: g.count, runs: g.runs, passes: g.passes, yards: g.yards, successPct: g.successPct, avg: g.avg }))
    );
    return `
      <div class="stats-section">
        <h3>Personnel Groupings</h3>
        ${chart}
      </div>`;
  }

  _renderTeamStats(stats) {
    const r = stats.rushing;
    const p = stats.passing;
    const s = stats.scoring;
    const t = stats.turnovers;
    const tend = stats.tendencies;
    const totalYards = r.yards + p.yards;

    const rpDonut = Charts.donut([
      { value: tend.runs, color: RUN_COLOR, label: 'Run' },
      { value: tend.passes, color: PASS_COLOR, label: 'Pass' }
    ], 110, tend.runPct + '%', 'Run Rate');

    const ydsDonut = Charts.donut([
      { value: Math.max(0, r.yards), color: RUN_COLOR, label: 'Rush Yards' },
      { value: Math.max(0, p.yards), color: PASS_COLOR, label: 'Pass Yards' }
    ], 110, String(totalYards), 'Total Yds');

    return `
      <div class="stats-section">
        <h3>Team Summary</h3>
        <div class="team-summary-row">
          <div class="stats-grid stats-grid-flex">
            <div class="stat-card"><div class="stat-card-title">Total Plays</div><div class="stat-card-value">${stats.totalPlays}</div></div>
            <div class="stat-card"><div class="stat-card-title">Total Yards</div><div class="stat-card-value">${totalYards}</div></div>
            <div class="stat-card"><div class="stat-card-title">Yds/Play</div><div class="stat-card-value">${stats.totalPlays ? (totalYards / stats.totalPlays).toFixed(1) : '0.0'}</div></div>
            <div class="stat-card"><div class="stat-card-title">TDs</div><div class="stat-card-value">${s.touchdowns}</div><div style="font-size:11px;opacity:.6">${s.rushingTDs}R / ${s.passingTDs}P</div></div>
            <div class="stat-card"><div class="stat-card-title">Turnovers</div><div class="stat-card-value">${t.total}</div><div style="font-size:11px;opacity:.6">${t.interceptions} INT / ${t.fumbles} Fum</div></div>
          </div>
          <div class="team-summary-donuts">
            <div class="team-donut-cell">${rpDonut}<div class="chart-donut-label"><i class="dot run"></i>Run <i class="dot pass"></i>Pass</div></div>
            <div class="team-donut-cell">${ydsDonut}<div class="chart-donut-label"><i class="dot run"></i>Rush <i class="dot pass"></i>Pass</div></div>
          </div>
        </div>
      </div>

      <div class="stats-section stats-two-col">
        <div>
          <h3>Rushing</h3>
          <table class="stats-table">
            <tr><td>Attempts</td><td>${r.attempts}</td></tr>
            <tr><td>Yards</td><td>${r.yards}</td></tr>
            <tr><td>Average</td><td>${r.average}</td></tr>
            <tr><td>Longest</td><td>${r.longest}</td></tr>
            <tr><td>Touchdowns</td><td>${r.touchdowns}</td></tr>
            <tr><td>First Downs</td><td>${r.firstDowns}</td></tr>
            <tr><td>Fumbles</td><td>${r.fumbles}</td></tr>
          </table>
        </div>
        <div>
          <h3>Passing</h3>
          <table class="stats-table">
            <tr><td>Comp/Att</td><td>${p.completions}/${p.attempts}</td></tr>
            <tr><td>Comp %</td><td>${p.completionPct}%</td></tr>
            <tr><td>Yards</td><td>${p.yards}</td></tr>
            <tr><td>YPA</td><td>${p.average}</td></tr>
            <tr><td>Touchdowns</td><td>${p.touchdowns}</td></tr>
            <tr><td>Interceptions</td><td>${p.interceptions}</td></tr>
            <tr><td>Sacks / Yds</td><td>${p.sacks} / ${p.sackYards}</td></tr>
            <tr><td>Longest</td><td>${p.longest}</td></tr>
            <tr><td>First Downs</td><td>${p.firstDowns}</td></tr>
          </table>
        </div>
      </div>
    `;
  }

  _renderDownAnalysis(stats) {
    const d = stats.downs;
    const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
    const thirdPct = parseFloat(d.thirdDownPct);
    const fourthPct = parseFloat(d.fourthDownPct);
    const thirdColor = thirdPct >= 45 ? '#22c55e' : thirdPct >= 30 ? '#eab308' : '#ef4444';
    const fourthColor = fourthPct >= 50 ? '#22c55e' : fourthPct >= 30 ? '#eab308' : '#ef4444';

    let rows = '';
    for (const [down, s] of Object.entries(d.byDown)) {
      if (s.total === 0) continue;
      rows += `<tr class="cut-row" data-cut-type="down" data-cut-val="${down}" data-cut-label="${labels[down]} down — ${s.total} plays">
        <td>${labels[down]}</td>
        <td>${s.total}</td>
        <td><div class="dd-split-bar">${Charts.stackBar([{ value: parseInt(s.runPct), color: 'var(--run-color)', label: 'Run' }, { value: parseInt(s.passPct), color: 'var(--pass-color)', label: 'Pass' }], 18)}</div></td>
        <td>${s.avgYards}</td>
        <td>${s.conversionPct}%</td>
      </tr>`;
    }

    let bucketRows = '';
    if (d.ddBuckets?.length) {
      for (const b of d.ddBuckets) {
        const convPct = parseFloat(b.convPct);
        const convColor = (b.down === '3' || b.down === '4')
          ? (convPct >= 50 ? '#22c55e' : convPct >= 30 ? '#eab308' : '#ef4444')
          : '';
        bucketRows += `<tr>
          <td>${labels[b.down]} &amp; ${b.bucket}</td>
          <td>${b.count}</td>
          <td><div class="dd-split-bar">${Charts.stackBar([{ value: parseInt(b.runPct), color: 'var(--run-color)', label: 'Run' }, { value: parseInt(b.passPct), color: 'var(--pass-color)', label: 'Pass' }], 18)}</div></td>
          <td>${b.avgYards}</td>
          <td>${b.succPct}%</td>
          <td${convColor ? ` style="color:${convColor};font-weight:700"` : ''}>${b.convPct}%</td>
        </tr>`;
      }
    }

    return `
      <div class="stats-section">
        <h3>Down &amp; Distance</h3>
        <div class="dd-gauges-row">
          <div class="stat-card"><div class="stat-card-title">First Downs</div><div class="stat-card-value">${d.totalFirstDowns}</div></div>
          ${Charts.gauge(thirdPct, `3rd Down ${d.thirdDownConv}`, thirdColor, 110)}
          ${Charts.gauge(fourthPct, `4th Down ${d.fourthDownConv}`, fourthColor, 110)}
        </div>
        ${rows ? `<table class="stats-table stats-table-full">
          <thead><tr><th>Down</th><th>Plays</th><th>Run / Pass</th><th>Avg Yds</th><th>Conv %</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ''}
        ${bucketRows ? `<h4 style="margin:16px 0 6px;font-size:13px;opacity:.8">By Distance</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Situation</th><th>#</th><th>Run / Pass</th><th>Avg</th><th>Succ %</th><th>Conv %</th></tr></thead>
          <tbody>${bucketRows}</tbody>
        </table>` : ''}
      </div>
    `;
  }

  _renderTendencies(stats) {
    const t = stats.tendencies;

    const formChart = Charts.effectivenessRows(
      t.formationList.map(f => ({ label: f.name, count: f.count, runs: f.runs, passes: f.passes, yards: f.yards, successPct: f.successPct, avg: f.avg, cutType: 'formation', cutVal: f.name, cutLabel: `${f.name} — ${f.count} plays` }))
    );

    const playTypeDonut = Charts.donutWithLegend(
      t.playTypeList.slice(0, 8).map((pt, i) => {
        const colors = ['#22c55e', '#f97316', '#a78bfa', '#06b6d4', '#ec4899', '#ef4444', '#8b5cf6', '#14b8a6'];
        return { value: pt.count, color: colors[i % colors.length], label: pt.name };
      }),
      120, String(stats.totalPlays), 'plays'
    );

    const typeChart = Charts.effectivenessRows(
      t.playTypeList.map(pt => ({ label: pt.name, count: pt.count, runs: pt.runs, passes: pt.passes, yards: pt.yards, successPct: pt.successPct, avg: pt.avg, cutType: 'playType', cutVal: pt.name, cutLabel: `${pt.name} — ${pt.count} plays` }))
    );

    return `
      <div class="stats-section">
        <h3>Formation Tendencies</h3>
        <div class="tendency-bar">
          <div class="tendency-run" style="width:${t.runPct}%">${t.runPct}% Run</div>
          <div class="tendency-pass" style="width:${t.passPct}%">${t.passPct}% Pass</div>
        </div>
        ${formChart}
      </div>
      <div class="stats-section">
        <h3>Play Type Breakdown</h3>
        <div class="play-type-visual">
          <div class="play-type-donut-col">${playTypeDonut}</div>
          <div class="play-type-chart-col">${typeChart}</div>
        </div>
      </div>
    `;
  }

  // --- Tendency Matrix ---

  static _matrixDimensions() {
    return [
      { id: 'formation',  label: 'Formation',  extract: p => StatsEngine.splitFormations(p.tags.formation) },
      { id: 'playType',   label: 'Play Type',  extract: p => StatsEngine.splitPlayTypes(p.tags.playType) },
      { id: 'down',       label: 'Down',        extract: p => [p.tags.down ? `${p.tags.down}` : '?'] },
      { id: 'distBucket', label: 'Distance',    extract: p => { const d = parseInt(p.tags.distance) || 0; return [d <= 3 ? 'Short (1-3)' : d <= 6 ? 'Med (4-6)' : 'Long (7+)']; } },
      { id: 'personnel',  label: 'Personnel',   extract: p => [p.tags.personnel || 'Unknown'] },
      { id: 'defFront',   label: 'Def Front',   extract: p => StatsEngine.splitFronts(p.tags.defFront) },
      { id: 'coverage',   label: 'Coverage',    extract: p => [p.tags.coverage || ''].filter(Boolean) },
      { id: 'hash',       label: 'Hash',        extract: p => [p.tags.hash || 'Unknown'] },
      { id: 'playDir',    label: 'Direction',   extract: p => [p.tags.playDir || ''].filter(Boolean) },
      { id: 'motion',     label: 'Motion',      extract: p => [p.tags.motion || 'No Motion'] },
      { id: 'quarter',    label: 'Quarter',     extract: p => [p.tags.quarter || '?'] },
      { id: 'runPass',    label: 'Run / Pass',  extract: p => [StatsEngine.isRun(p) ? 'Run' : 'Pass'] },
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

    plays.forEach(p => {
      const rows = rowDim.extract(p);
      const cols = colDim.extract(p);
      if (!rows.length || !cols.length) return;
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
    return { rowDim, colDim, rowKeys, colKeys, cells, total: plays.length };
  }

  _renderMatrixGrid(matrix) {
    if (!matrix.rowKeys.length || !matrix.colKeys.length) return '<p style="opacity:.6">Not enough data for this combination.</p>';
    const maxCount = Math.max(1, ...Object.values(matrix.cells).map(c => c.count));

    let header = `<th>${matrix.rowDim.label} \\ ${matrix.colDim.label}</th>`;
    matrix.colKeys.forEach(c => { header += `<th>${c}</th>`; });

    let body = '';
    matrix.rowKeys.forEach(r => {
      let row = `<td style="font-weight:600;white-space:nowrap">${r}</td>`;
      matrix.colKeys.forEach(c => {
        const cell = matrix.cells[`${r}\0${c}`];
        if (!cell || !cell.count) {
          row += '<td class="tm-cell" style="opacity:.2">—</td>';
          return;
        }
        const intensity = cell.count / maxCount;
        const succPct = Math.round((cell.successes / cell.count) * 100);
        const avg = (cell.yards / cell.count).toFixed(1);
        const runPct = Math.round((cell.runs / cell.count) * 100);
        const bg = `rgba(74,158,255,${(intensity * 0.45 + 0.05).toFixed(2)})`;
        const border = succPct >= 50 ? '1px solid rgba(68,255,136,0.4)' : succPct <= 30 ? '1px solid rgba(255,102,102,0.25)' : '1px solid transparent';
        row += `<td class="tm-cell" style="background:${bg};border:${border}" title="${r} × ${c}: ${cell.count} plays, ${runPct}% run, ${succPct}% success, ${avg} avg">
          <div class="tm-count">${cell.count}</div>
          <div class="tm-split">${runPct}R/${100 - runPct}P</div>
          <div class="tm-succ">${succPct}% · ${avg}y</div>
        </td>`;
      });
      body += `<tr>${row}</tr>`;
    });

    return `<div class="tm-wrap"><table class="stats-table stats-table-full tm-table">
      <thead><tr>${header}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  }

  _renderTendencyMatrix(stats) {
    if (stats.totalPlays < 3) return '';
    const dims = StatsEngine._matrixDimensions();
    const opts = dims.map(d => `<option value="${d.id}">${d.label}</option>`).join('');
    const defaultMatrix = this._computeMatrix(stats.offPlays, 'formation', 'down');
    return `
      <div class="stats-section" id="tendencyMatrixSection">
        <h3>Tendency Matrix</h3>
        <div class="tm-controls">
          <label>Rows: <select id="tmRowDim">${opts}</select></label>
          <span style="opacity:.5;margin:0 4px">×</span>
          <label>Cols: <select id="tmColDim">${opts.replace('value="down"', 'value="down" selected')}</select></label>
        </div>
        <div class="tm-legend">
          <span>Cell: <strong>count</strong> · run/pass split · success% · avg yards</span>
          <span style="margin-left:12px"><span style="display:inline-block;width:10px;height:10px;border:1px solid rgba(68,255,136,0.5);border-radius:2px;vertical-align:middle"></span> ≥50% success</span>
          <span style="margin-left:8px"><span style="display:inline-block;width:10px;height:10px;border:1px solid rgba(255,102,102,0.4);border-radius:2px;vertical-align:middle"></span> ≤30% success</span>
        </div>
        <div id="tmGridContainer">${this._renderMatrixGrid(defaultMatrix)}</div>
      </div>`;
  }

  _bindTendencyMatrix(el) {
    const rowSel = el.querySelector('#tmRowDim');
    const colSel = el.querySelector('#tmColDim');
    const container = el.querySelector('#tmGridContainer');
    if (!rowSel || !colSel || !container) return;

    const refresh = () => {
      if (rowSel.value === colSel.value) {
        container.innerHTML = '<p style="opacity:.6">Pick two different dimensions.</p>';
        return;
      }
      const matrix = this._computeMatrix(this._offensePlays(), rowSel.value, colSel.value);
      container.innerHTML = this._renderMatrixGrid(matrix);
    };
    rowSel.addEventListener('change', refresh);
    colSel.addEventListener('change', refresh);
  }

  _renderDefensive(stats) {
    const d = stats.defensive;
    if (!d.hasData) return '';

    let frontRows = '';
    for (const f of d.fronts) {
      const avg = f.count ? (f.yards / f.count).toFixed(1) : '0.0';
      const defSucc = f.count ? ((f.successes / f.count) * 100).toFixed(0) : '0';
      const havocPct = f.count ? ((f.havoc / f.count) * 100).toFixed(0) : '0';
      frontRows += `<tr class="cut-row" data-cut-type="defFront" data-cut-val="${f.name}" data-cut-label="${f.name} front — ${f.count} plays"><td>${f.name}</td><td>${f.count}</td><td>${f.runs}/${f.passes}</td><td>${f.yards}</td><td>${avg}</td><td>${defSucc}%</td><td>${havocPct}%</td></tr>`;
    }

    let covRows = '';
    for (const c of d.coverages) {
      const avg = c.count ? (c.yards / c.count).toFixed(1) : '0.0';
      const defSucc = c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0';
      covRows += `<tr class="cut-row" data-cut-type="coverage" data-cut-val="${c.name}" data-cut-label="${c.name} — ${c.count} plays"><td>${c.name}</td><td>${c.count}</td><td>${c.comps}</td><td>${c.incs}</td><td>${c.ints}</td><td>${c.sacks}</td><td>${c.yards}</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
    }

    let blitzRows = '';
    for (const b of d.blitzes) {
      const avg = b.count ? (b.yards / b.count).toFixed(1) : '0.0';
      const havocPct = b.count ? ((b.havoc / b.count) * 100).toFixed(0) : '0';
      const defSucc = b.count ? ((b.successes / b.count) * 100).toFixed(0) : '0';
      blitzRows += `<tr class="cut-row" data-cut-type="blitz" data-cut-val="${b.name}" data-cut-label="${b.name} blitz — ${b.count} plays"><td>${b.name}</td><td>${b.count}</td><td>${b.sacks}</td><td>${havocPct}%</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
    }

    let sitFrontHtml = '';
    [d.earlyDownFronts, d.passingDownFronts].forEach(sit => {
      if (!sit.fronts.length) return;
      const rows = sit.fronts.map(([name, count]) =>
        `<tr><td>${name}</td><td>${count}</td><td>${sit.total ? ((count / sit.total) * 100).toFixed(0) : 0}%</td></tr>`
      ).join('');
      sitFrontHtml += `<div><h4 style="margin:8px 0 4px">${sit.label} (${sit.total})</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    });

    const havocPctVal = parseFloat(d.havocRate);
    const havocColor = havocPctVal >= 20 ? '#22c55e' : havocPctVal >= 12 ? '#eab308' : '#ef4444';
    const blitzPctVal = parseFloat(d.blitzRate);

    return `
      <div class="stats-section">
        <h3>Defensive Analytics</h3>
        <div class="def-top-row">
          ${Charts.gauge(havocPctVal, `Havoc Rate (${d.havocPlays})`, havocColor, 110)}
          <div class="stats-grid stats-grid-flex">
            <div class="stat-card"><div class="stat-card-title">Sacks</div><div class="stat-card-value">${d.sacks}</div><div style="font-size:11px;opacity:.6">${d.sackYards} yds</div></div>
            <div class="stat-card"><div class="stat-card-title">TFL</div><div class="stat-card-value">${d.tfl}</div></div>
            <div class="stat-card"><div class="stat-card-title">Turnovers</div><div class="stat-card-value">${d.interceptions + d.fumbles}</div><div style="font-size:11px;opacity:.6">${d.interceptions} INT / ${d.fumbles} Fum</div></div>
            <div class="stat-card"><div class="stat-card-title">Blitz Rate</div><div class="stat-card-value">${d.blitzRate}%</div><div style="font-size:11px;opacity:.6">${d.blitzTotal} plays</div></div>
            <div class="stat-card"><div class="stat-card-title">Blitz Havoc</div><div class="stat-card-value" style="color:${parseFloat(d.blitzHavocRate) >= 20 ? '#44ff88' : '#fff'}">${d.blitzHavocRate}%</div></div>
            <div class="stat-card"><div class="stat-card-title">Forced Inc</div><div class="stat-card-value">${d.incompletions}</div></div>
            <div class="stat-card"><div class="stat-card-title">3-and-Outs</div><div class="stat-card-value">${d.threeAndOuts}</div></div>
          </div>
        </div>
        ${frontRows ? `
        <h4 style="margin:16px 0 4px">Defensive Front Breakdown</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Front</th><th>#</th><th>Run/Pass</th><th>Yds</th><th>Avg</th><th>Stop%</th><th>Havoc%</th></tr></thead>
          <tbody>${frontRows}</tbody>
        </table>` : ''}
        ${covRows ? `
        <h4 style="margin:16px 0 4px">Coverage Breakdown</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Coverage</th><th>#</th><th>Comp</th><th>Inc</th><th>INT</th><th>Sack</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead>
          <tbody>${covRows}</tbody>
        </table>` : ''}
        ${blitzRows ? `
        <h4 style="margin:16px 0 4px">Blitz Analysis</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Blitz</th><th>#</th><th>Sacks</th><th>Havoc%</th><th>Avg Yds</th><th>Stop%</th></tr></thead>
          <tbody>${blitzRows}</tbody>
        </table>` : ''}
        ${sitFrontHtml ? `<div class="stats-two-col" style="margin-top:12px">${sitFrontHtml}</div>` : ''}
      </div>`;
  }

  _renderBigPlays(stats) {
    if (stats.bigPlays.length === 0) return '';

    let rows = '';
    for (const bp of stats.bigPlays) {
      rows += `<tr>
        <td>${bp.clipName}</td>
        <td>${bp.type}</td>
        <td>${bp.result}</td>
        <td>${bp.yards}</td>
      </tr>`;
    }

    return `
      <div class="stats-section">
        <h3>Big Plays (20+ yards &amp; TDs)</h3>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Play</th><th>Type</th><th>Result</th><th>Yards</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>
    `;
  }

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

  /**
   * Render the box-score individual tables. `group` scopes which tables show so
   * they can live under the relevant dashboard tab:
   *   'offense' → rushing / passing / receiving
   *   'defense' → tackles (incl. INTs + fumbles recovered)
   *   'special' → return game / kicking-punting
   *   'all'     → everything (used by exports)
   */
  _renderIndividualStats(stats, group = 'all') {
    const ind = stats.individuals;
    let html = '';
    const showOff = group === 'all' || group === 'offense';
    const showDef = group === 'all' || group === 'defense';
    const showST = group === 'all' || group === 'special';

    const fmtGrade = (r) => {
      if (!r.gradeCount) return '—';
      const avg = r.gradeSum / r.gradeCount;
      const sign = avg > 0 ? '+' : '';
      return `${sign}${avg.toFixed(1)}`;
    };
    const gradeClass = (r) => {
      if (!r.gradeCount) return '';
      const avg = r.gradeSum / r.gradeCount;
      return avg > 0 ? 'grade-pos' : avg < 0 ? 'grade-neg' : '';
    };

    if (showOff && ind.rushers.length > 0) {
      let rows = '';
      for (const r of ind.rushers) {
        const avg = r.attempts ? (r.yards / r.attempts).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabel(r.num)}</td><td>${r.attempts}</td><td>${r.yards}</td><td>${avg}</td><td>${r.long}</td><td>${r.tds}</td><td>${r.fumbles}</td><td class="${gradeClass(r)}">${fmtGrade(r)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Rushing</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Att</th><th>Yds</th><th>Avg</th><th>Long</th><th>TD</th><th>Fum</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showOff && ind.passers.length > 0) {
      let rows = '';
      for (const p of ind.passers) {
        const pct = p.attempts ? ((p.completions / p.attempts) * 100).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${p.num}"><td>${this._playerLabel(p.num)}</td><td>${p.completions}/${p.attempts}</td><td>${pct}%</td><td>${p.yards}</td><td>${p.tds}</td><td>${p.ints}</td><td>${p.sacks}</td><td class="${gradeClass(p)}">${fmtGrade(p)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Passing</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>C/A</th><th>Pct</th><th>Yds</th><th>TD</th><th>INT</th><th>Sck</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showOff && ind.receivers.length > 0) {
      let rows = '';
      for (const r of ind.receivers) {
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabel(r.num)}</td><td>${r.receptions}</td><td>${r.yards}</td><td>${r.long}</td><td>${r.tds}</td><td class="${gradeClass(r)}">${fmtGrade(r)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Receiving</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Rec</th><th>Yds</th><th>Long</th><th>TD</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showDef && ind.tacklers.length > 0) {
      let rows = '';
      for (const t of ind.tacklers) {
        rows += `<tr class="player-row" data-player="${t.num}"><td>${this._playerLabel(t.num)}</td><td>${t.tackles}</td><td>${t.solo || 0}</td><td>${t.assists || 0}</td><td>${t.sacks}</td><td>${t.tfl}</td><td>${t.ints || 0}</td><td>${t.fumblesRec || 0}</td><td class="${gradeClass(t)}">${fmtGrade(t)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Tackles</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Tkl</th><th>Solo</th><th>Ast</th><th>Sack</th><th>TFL</th><th>INT</th><th>FR</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showST && ind.returners && ind.returners.length > 0) {
      let rows = '';
      for (const r of ind.returners) {
        const avg = r.returns ? (r.yards / r.returns).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabel(r.num)}</td><td>${r.returns}</td><td>${r.yards}</td><td>${avg}</td><td>${r.long}</td><td>${r.tds}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Return Game</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Ret</th><th>Yds</th><th>Avg</th><th>Long</th><th>TD</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showST && ind.kickers && ind.kickers.length > 0) {
      let rows = '';
      for (const k of ind.kickers) {
        const fg = k.fgAtt ? `${k.fgMade}/${k.fgAtt}` : '—';
        const puntAvg = k.punts ? (k.puntYds / k.punts).toFixed(1) : '—';
        rows += `<tr class="player-row" data-player="${k.num}"><td>${this._playerLabel(k.num)}</td><td>${fg}</td><td>${k.punts || '—'}</td><td>${puntAvg}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Kicking / Punting</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>FG (M/A)</th><th>Punts</th><th>Punt Avg</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    return html;
  }

  generateScoutReport(playsOverride = null) {
    const plays = playsOverride || this._currentPlays();
    if (plays.length === 0) return null;
    const stats = this.compute(playsOverride || undefined);
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yards = parseInt(p.tags.yardage) || 0;
      const isTd = StatsEngine.hasResult(p, 'Touchdown');
      // Multi-select formation: attribute the play to each component look.
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
        if (!formationDetail[f]) formationDetail[f] = { total: 0, runs: 0, passes: 0, yards: 0, tds: 0 };
        formationDetail[f].total++;
        if (isRun) formationDetail[f].runs++;
        else formationDetail[f].passes++;
        formationDetail[f].yards += yards;
        if (isTd) formationDetail[f].tds++;
      });
    });
    const downTendency = {};
    plays.forEach(p => {
      const key = `${p.tags.down || '?'}&${p.tags.distance || '?'}`;
      if (!downTendency[key]) downTendency[key] = { runs: 0, passes: 0, total: 0 };
      downTendency[key].total++;
      if (StatsEngine.isRun(p)) downTendency[key].runs++;
      else downTendency[key].passes++;
    });
    const fronts = {}, coverages = {};
    plays.forEach(p => {
      StatsEngine.splitFronts(p.tags.defFront).forEach(f => { fronts[f] = (fronts[f] || 0) + 1; });
      if (p.tags.coverage) coverages[p.tags.coverage] = (coverages[p.tags.coverage] || 0) + 1;
    });
    const redZonePlays = plays.filter(p => {
      const yl = parseInt(p.tags.yardLine);
      return yl && (p.tags.fieldSide === 'opp' ? yl <= 20 : yl >= 80);
    });
    const thirdDownPlays = plays.filter(p => p.tags.down === '3');
    return {
      totalPlays: plays.length, stats,
      formationDetail: Object.entries(formationDetail).sort((a, b) => b[1].total - a[1].total)
        .map(([name, d]) => ({ name, ...d, runPct: d.total ? Math.round(d.runs / d.total * 100) : 0 })),
      downTendency: Object.entries(downTendency).sort((a, b) => b[1].total - a[1].total).slice(0, 15)
        .map(([key, d]) => ({ key, ...d, runPct: d.total ? Math.round(d.runs / d.total * 100) : 0 })),
      fronts: Object.entries(fronts).sort((a, b) => b[1] - a[1]),
      coverages: Object.entries(coverages).sort((a, b) => b[1] - a[1]),
      redZone: { total: redZonePlays.length, tds: redZonePlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length },
      thirdDown: { total: thirdDownPlays.length, converted: thirdDownPlays.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length },
    };
  }

  renderScoutReport() {
    const report = this.generateScoutReport();
    if (!report) { alert('No plays tagged. Tag opponent plays first.'); return; }
    const notes = document.getElementById('scoutNotes')?.value || '';
    const opponent = document.getElementById('gameOpponent')?.value || 'Opponent';
    const t = report.stats.tendencies;

    let html = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Scout Report: ${opponent}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportScoutReport">Export Report</button>
              <button class="btn btn-sm btn-danger" id="btnCloseScoutReport">Close</button>
            </div>
          </div>
          <div class="stats-body">
            ${notes ? `<div class="stats-section"><h3>Scouting Notes</h3><p style="white-space:pre-wrap">${notes.replace(/</g, '&lt;')}</p></div>` : ''}
            <div class="stats-section">
              <h3>Overview (${report.totalPlays} plays)</h3>
              <div class="stats-grid">
                <div class="stat-card"><div class="stat-card-title">Run/Pass</div><div class="stat-card-value">${t.runPassRatio}</div></div>
                <div class="stat-card"><div class="stat-card-title">Run %</div><div class="stat-card-value">${t.runPct}%</div></div>
                <div class="stat-card"><div class="stat-card-title">Avg Yards</div><div class="stat-card-value">${report.totalPlays ? ((report.stats.rushing.yards + report.stats.passing.yards) / report.totalPlays).toFixed(1) : '0.0'}</div></div>
                <div class="stat-card"><div class="stat-card-title">3rd Down</div><div class="stat-card-value">${report.thirdDown.total ? `${report.thirdDown.converted}/${report.thirdDown.total}` : 'N/A'}</div></div>
              </div>
            </div>
            <div class="stats-section">
              <h3>Formation Tendencies</h3>
              <table class="stats-table stats-table-full">
                <thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Yds</th><th>TD</th></tr></thead>
                <tbody>${report.formationDetail.map(f =>
                  `<tr><td>${f.name}</td><td>${f.total}</td><td>${f.runPct}%</td><td>${100 - f.runPct}%</td><td>${f.yards}</td><td>${f.tds}</td></tr>`
                ).join('')}</tbody>
              </table>
            </div>
            <div class="stats-section stats-two-col">
              <div>
                <h3>Down & Distance Tendencies</h3>
                <table class="stats-table stats-table-full">
                  <thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th></tr></thead>
                  <tbody>${report.downTendency.map(d =>
                    `<tr><td>${d.key}</td><td>${d.total}</td><td>${d.runPct}%</td><td>${100 - d.runPct}%</td></tr>`
                  ).join('')}</tbody>
                </table>
              </div>
              <div>
                <h3>Key Situations</h3>
                <table class="stats-table stats-table-full">
                  <thead><tr><th>Situation</th><th>Detail</th></tr></thead>
                  <tbody>
                    <tr><td>Red Zone</td><td>${report.redZone.total} plays, ${report.redZone.tds} TD${report.redZone.total ? ` (${Math.round(report.redZone.tds / report.redZone.total * 100)}%)` : ''}</td></tr>
                    <tr><td>3rd Down Conv</td><td>${report.thirdDown.converted}/${report.thirdDown.total} (${report.thirdDown.total ? Math.round(report.thirdDown.converted / report.thirdDown.total * 100) : 0}%)</td></tr>
                  </tbody>
                </table>
              </div>
            </div>
            ${report.fronts.length ? `
            <div class="stats-section stats-two-col">
              <div>
                <h3>Defensive Fronts</h3>
                <table class="stats-table stats-table-full">
                  <thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead>
                  <tbody>${report.fronts.map(([f, c]) => `<tr><td>${f}</td><td>${c}</td><td>${Math.round(c / report.totalPlays * 100)}%</td></tr>`).join('')}</tbody>
                </table>
              </div>
              ${report.coverages.length ? `<div>
                <h3>Coverages</h3>
                <table class="stats-table stats-table-full">
                  <thead><tr><th>Coverage</th><th>#</th><th>%</th></tr></thead>
                  <tbody>${report.coverages.map(([c, n]) => `<tr><td>${c}</td><td>${n}</td><td>${Math.round(n / report.totalPlays * 100)}%</td></tr>`).join('')}</tbody>
                </table>
              </div>` : ''}
            </div>` : ''}
            ${this._renderTendencies(report.stats)}
            ${this._renderBigPlays(report.stats)}
          </div>
        </div>
      </div>`;

    this.dashboardEl.innerHTML = html;
    this.dashboardEl.classList.remove('hidden');
    this.dashboardEl.querySelector('#btnCloseScoutReport').addEventListener('click', () => this.hideDashboard());
    this.dashboardEl.querySelector('#btnExportScoutReport').addEventListener('click', () => this._exportScoutReport(report, opponent, notes));
    this.dashboardEl.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  _exportScoutReport(report, opponent, notes) {
    const t = report.stats.tendencies;
    const title = `Scout Report: ${opponent}`;
    const formRows = report.formationDetail.map(f =>
      `<tr><td>${f.name}</td><td>${f.total}</td><td>${f.runPct}%</td><td>${100 - f.runPct}%</td><td>${f.yards}</td><td>${f.tds}</td></tr>`
    ).join('');
    const ddRows = report.downTendency.map(d =>
      `<tr><td>${d.key}</td><td>${d.total}</td><td>${d.runPct}%</td><td>${100 - d.runPct}%</td></tr>`
    ).join('');
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:'Inter',-apple-system,sans-serif;background:#fff;color:#1a1a2e;max-width:940px;margin:24px auto;padding:0 24px}
h1{border-bottom:3px solid #1a1a2e;padding-bottom:8px;font-weight:800;letter-spacing:0.5px}h3{color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:4px;margin-top:24px;font-weight:700}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 10px;border:1px solid #e5e7eb;text-align:left;font-size:13px}
th{background:#1a1a2e;color:#fff;font-weight:700}tr:nth-child(even){background:#f9fafb}
.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}
.ov-card{border:1px solid #e5e7eb;padding:12px;border-radius:8px;text-align:center}
.ov-val{font-size:24px;font-weight:800;color:#1a1a2e;font-variant-numeric:tabular-nums}.ov-lbl{font-size:9px;text-transform:uppercase;color:#6b7280;font-weight:700;letter-spacing:0.5px}
</style></head><body>
<h1>${title}</h1><p style="color:#666">Generated ${new Date().toLocaleString()} &middot; ${report.totalPlays} plays</p>
${notes ? `<h3>Notes</h3><p style="white-space:pre-wrap">${notes.replace(/</g, '&lt;')}</p>` : ''}
<h3>Overview</h3><div class="overview">
<div class="ov-card"><div class="ov-val">${t.runPassRatio}</div><div class="ov-lbl">Run/Pass</div></div>
<div class="ov-card"><div class="ov-val">${t.runPct}%</div><div class="ov-lbl">Run Rate</div></div>
<div class="ov-card"><div class="ov-val">${report.totalPlays ? ((report.stats.rushing.yards + report.stats.passing.yards) / report.totalPlays).toFixed(1) : '0'}</div><div class="ov-lbl">Avg Yards</div></div>
<div class="ov-card"><div class="ov-val">${report.thirdDown.total ? report.thirdDown.converted + '/' + report.thirdDown.total : 'N/A'}</div><div class="ov-lbl">3rd Down</div></div>
</div>
<h3>Formation Tendencies</h3><table><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Yds</th><th>TD</th></tr></thead><tbody>${formRows}</tbody></table>
<h3>Down &amp; Distance</h3><table><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th></tr></thead><tbody>${ddRows}</tbody></table>
</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `scout_${opponent.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // ================================================================
  // SELF-SCOUT — flip the scouting lens on your own offense to reveal
  // what tendencies you're tipping. Distinct from the opponent scout
  // report: it flags predictability, ranks your "tells", and suggests
  // counters. Run/pass-classifiable offensive plays only.
  // ================================================================

  /** Minimum sample for a grouping to be considered a tell / counted. */
  static get _SELF_SCOUT_MIN_N() { return 4; }

  /** Pretty-print a "down&distance" key like "1&10" → "1st & 10". */
  _ddPretty(key) {
    const [d, dist] = String(key).split('&');
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' }[d] || `${d}`;
    return dist != null && dist !== '?' && dist !== '' ? `${ord} & ${dist}` : ord;
  }

  /**
   * Bucket plays by a key function, counting only run/pass-classifiable
   * plays. keyFn may return a single key or an array (multi-formation).
   */
  _selfScoutGroup(plays, keyFn) {
    const g = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return; // skip unclassifiable (e.g. trick/blank)
      let keys = keyFn(p);
      if (!Array.isArray(keys)) keys = [keys];
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, runs: 0, passes: 0, yards: 0 };
        g[k].n++;
        if (isRun) g[k].runs++; else g[k].passes++;
        g[k].yards += parseInt(p.tags.yardage) || 0;
      });
    });
    return g;
  }

  /** Turn a group map into rows with runPct / lean / tell flag. */
  _selfScoutRows(groups) {
    return Object.values(groups)
      .map(grp => {
        const runPct = grp.n ? Math.round(grp.runs / grp.n * 100) : 0;
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPct = Math.max(runPct, 100 - runPct);
        return {
          ...grp, runPct, passPct: 100 - runPct, lean, leanPct,
          avg: grp.n ? +(grp.yards / grp.n).toFixed(1) : 0,
          tell: grp.n >= StatsEngine._SELF_SCOUT_MIN_N && leanPct >= 70,
        };
      })
      .sort((a, b) => b.n - a.n);
  }

  /** Extract ranked tells from a group map, tagged with a dimension label. */
  _tellsFrom(groups, dim, fmt) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    return Object.values(groups)
      .filter(grp => grp.n >= min)
      .map(grp => {
        const runPct = Math.round(grp.runs / grp.n * 100);
        const leanPct = Math.max(runPct, 100 - runPct);
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        return {
          dim, label: fmt(grp.key), n: grp.n, lean, leanPct,
          tier: leanPct >= 85 ? 'strong' : leanPct >= 75 ? 'notable' : 'slight',
          score: (leanPct - 50) * Math.min(grp.n, 12),
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

  generateSelfScout(playsOverride = null) {
    const all = playsOverride || this._currentPlays();
    // Self-scout is about your own offense's tendencies.
    const plays = all.filter(p => (p.tags.unit || 'offense') === 'offense');
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length === 0) return null;

    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(p.tags.formation));
    const byDownDist = this._selfScoutGroup(plays, p => `${p.tags.down || '?'}&${p.tags.distance || '?'}`);
    const byPersonnel = this._selfScoutGroup(plays, p => p.tags.personnel);
    const byHash = this._selfScoutGroup(plays, p => p.tags.hash);
    // Combined formation-on-down — what a DC actually keys on.
    const byCombo = this._selfScoutGroup(plays, p => {
      const dd = `${p.tags.down || '?'}&${p.tags.distance || '?'}`;
      return StatsEngine.splitFormations(p.tags.formation).map(f => `${f}__${dd}`);
    });

    let tells = [
      ...this._tellsFrom(byCombo, 'Formation × Down', k => {
        const [f, dd] = k.split('__'); return `${f} on ${this._ddPretty(dd)}`;
      }),
      ...this._tellsFrom(byFormation, 'Formation', k => `From ${k}`),
      ...this._tellsFrom(byDownDist, 'Down & Dist', k => this._ddPretty(k)),
      ...this._tellsFrom(byPersonnel, 'Personnel', k => `${k} personnel`),
      ...this._tellsFrom(byHash, 'Hash', k => `${k} hash`),
    ].sort((a, b) => b.score - a.score).slice(0, 12);

    const predictability = this._predictabilityIndex(byFormation, byDownDist);
    const predLabel = predictability >= 70 ? 'Very Predictable'
      : predictability >= 50 ? 'Predictable'
        : predictability >= 30 ? 'Moderate' : 'Balanced';

    // Auto coaching recommendations from the top tells.
    const recommendations = [];
    if (predictability >= 60) {
      recommendations.push('Your offense is reading as predictable — defenses can key these tells. Prioritize the situations below.');
    }
    tells.slice(0, 5).forEach(t => {
      const counter = t.lean === 'Run'
        ? 'play-action or a quick game pass off the same look'
        : 'a draw, screen, or run off the same look';
      recommendations.push(`${t.label}: you ${t.lean.toLowerCase()} ${t.leanPct}% (n=${t.n}) — add ${counter}.`);
    });
    if (tells.length === 0) {
      recommendations.push('No strong tells detected at the current sample size — your run/pass mix is well balanced. Keep tagging for finer detail.');
    }

    return {
      totalPlays: classifiable.length,
      predictability, predLabel,
      tells,
      formationRows: this._selfScoutRows(byFormation),
      downDistRows: this._selfScoutRows(byDownDist).sort((a, b) => b.n - a.n).slice(0, 15),
      personnelRows: this._selfScoutRows(byPersonnel),
      recommendations,
    };
  }

  _selfScoutTellsTable(tells) {
    if (!tells.length) return '<p style="color:var(--text-dim)">No strong tells at the current sample size.</p>';
    return `<table class="stats-table stats-table-full ss-tells">
      <thead><tr><th>Situation</th><th>Type</th><th>Tendency</th><th>Lean</th><th>n</th></tr></thead>
      <tbody>${tells.map(t => `<tr class="ss-tier-${t.tier}">
        <td>${t.label}</td>
        <td><span class="ss-dim">${t.dim}</span></td>
        <td><span class="ss-bar ss-bar-${t.lean === 'Run' ? 'run' : 'pass'}" style="--p:${t.leanPct}%">${t.lean} ${t.leanPct}%</span></td>
        <td><span class="ss-badge ss-badge-${t.tier}">${t.tier}</span></td>
        <td>${t.n}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  _selfScoutSplitTable(rows, label) {
    return `<table class="stats-table stats-table-full">
      <thead><tr><th>${label}</th><th>#</th><th>Run%</th><th>Pass%</th><th>Avg</th><th>Tell</th></tr></thead>
      <tbody>${rows.map(r => `<tr>
        <td>${r.dim ? this._ddPretty(r.key) : (label === 'Down & Dist' ? this._ddPretty(r.key) : r.key)}</td>
        <td>${r.n}</td><td>${r.runPct}%</td><td>${r.passPct}%</td><td>${r.avg}</td>
        <td>${r.tell ? `<span class="ss-flag">${r.lean} ${r.leanPct}%</span>` : '<span class="ss-ok">balanced</span>'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  renderSelfScout() {
    const report = this.generateSelfScout();
    if (!report) { alert('No run/pass plays tagged yet. Tag your offense first.'); return; }
    const team = document.getElementById('gameTeamName')?.value || 'Our Offense';
    const meterColor = report.predictability >= 70 ? '#ef4444'
      : report.predictability >= 50 ? '#f59e0b'
        : report.predictability >= 30 ? '#eab308' : '#22c55e';

    const html = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Self-Scout: ${team}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportSelfScout">Export Report</button>
              <button class="btn btn-sm btn-danger" id="btnCloseSelfScout">Close</button>
            </div>
          </div>
          <div class="stats-body">
            <div class="stats-section">
              <h3>Predictability (${report.totalPlays} run/pass plays)</h3>
              <div class="ss-meter-wrap">
                <div class="ss-meter"><div class="ss-meter-fill" style="width:${report.predictability}%;background:${meterColor}"></div></div>
                <div class="ss-meter-val" style="color:${meterColor}">${report.predictability}<span>/100</span></div>
                <div class="ss-meter-label">${report.predLabel}</div>
              </div>
              <p class="viz-caption">Higher = more predictable (run/pass leans heavily by formation &amp; down). A defensive coordinator reads the same numbers — aim to keep your key situations balanced.</p>
            </div>
            <div class="stats-section">
              <h3>Your Top Tells</h3>
              ${this._selfScoutTellsTable(report.tells)}
            </div>
            ${report.recommendations.length ? `<div class="stats-section">
              <h3>Recommendations</h3>
              <ul class="ss-recs">${report.recommendations.map(r => `<li>${r}</li>`).join('')}</ul>
            </div>` : ''}
            <div class="stats-section stats-two-col">
              <div>
                <h3>By Formation</h3>
                ${this._selfScoutSplitTable(report.formationRows, 'Formation')}
              </div>
              <div>
                <h3>By Down &amp; Distance</h3>
                ${this._selfScoutSplitTable(report.downDistRows, 'Down & Dist')}
              </div>
            </div>
            ${report.personnelRows.length ? `<div class="stats-section">
              <h3>By Personnel</h3>
              ${this._selfScoutSplitTable(report.personnelRows, 'Personnel')}
            </div>` : ''}
          </div>
        </div>
      </div>`;

    this.dashboardEl.innerHTML = html;
    this.dashboardEl.classList.remove('hidden');
    this.dashboardEl.querySelector('#btnCloseSelfScout').addEventListener('click', () => this.hideDashboard());
    this.dashboardEl.querySelector('#btnExportSelfScout').addEventListener('click', () => this._exportSelfScout(report, team));
    this.dashboardEl.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  _exportSelfScout(report, team) {
    const title = `Self-Scout: ${team}`;
    const tellRows = report.tells.map(t =>
      `<tr><td>${t.label}</td><td>${t.dim}</td><td>${t.lean} ${t.leanPct}%</td><td>${t.tier}</td><td>${t.n}</td></tr>`
    ).join('') || '<tr><td colspan="5">No strong tells at current sample size.</td></tr>';
    const formRows = report.formationRows.map(r =>
      `<tr><td>${r.key}</td><td>${r.n}</td><td>${r.runPct}%</td><td>${r.passPct}%</td><td>${r.avg}</td><td>${r.tell ? r.lean + ' ' + r.leanPct + '%' : '—'}</td></tr>`
    ).join('');
    const ddRows = report.downDistRows.map(r =>
      `<tr><td>${this._ddPretty(r.key)}</td><td>${r.n}</td><td>${r.runPct}%</td><td>${r.passPct}%</td><td>${r.avg}</td><td>${r.tell ? r.lean + ' ' + r.leanPct + '%' : '—'}</td></tr>`
    ).join('');
    const meterColor = report.predictability >= 70 ? '#ef4444'
      : report.predictability >= 50 ? '#f59e0b'
        : report.predictability >= 30 ? '#eab308' : '#22c55e';
    const body = `
<h1>${title}</h1><p class="sub">Generated ${new Date().toLocaleString()} &middot; ${report.totalPlays} run/pass plays</p>
<h3>Predictability Index</h3>
<div class="meter"><div style="width:${report.predictability}%;background:${meterColor}"></div></div>
<div class="mval" style="color:${meterColor}">${report.predictability}<span style="font-size:14px;color:#999">/100</span> &mdash; <span class="mlbl">${report.predLabel}</span></div>
<p class="sub">Higher = more predictable. A DC reads the same tendencies; keep key situations balanced.</p>
<h3>Top Tells</h3><table><thead><tr><th>Situation</th><th>Type</th><th>Tendency</th><th>Severity</th><th>n</th></tr></thead><tbody>${tellRows}</tbody></table>
${report.recommendations.length ? `<h3>Recommendations</h3><ul>${report.recommendations.map(r => `<li>${r.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''}
<h3>By Formation</h3><table><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Avg</th><th>Tell</th></tr></thead><tbody>${formRows}</tbody></table>
<h3>By Down &amp; Distance</h3><table><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Avg</th><th>Tell</th></tr></thead><tbody>${ddRows}</tbody></table>`;
    this._openPrintWindow(title, body);
  }

  // ================================================================
  // DEFENSIVE REPORT — a focused, first-class view of the defensive
  // analytics (also rendered inline in the main dashboard). Surfaced
  // via the "Defense" button so it's never buried or silently empty.
  // ================================================================
  renderDefensiveReport() {
    const stats = this.compute();
    const team = document.getElementById('gameTeamName')?.value || 'Our Defense';
    const hasData = stats.defensive.hasData;
    const body = hasData ? this._renderDefensive(stats) : `
      <div class="stats-section def-empty">
        <h3>No defensive data tagged yet</h3>
        <p>Defensive analytics build from your <b>defensive</b> plays. To populate this report:</p>
        <ol class="def-empty-steps">
          <li>Set a play's unit toggle to <b>Defense</b> (or press <kbd>C</kbd> to cycle to it).</li>
          <li>Tag the <b>Front</b> (4-3, Nickel, 3-4…), <b>Coverage</b>, and <b>Blitz</b>.</li>
          <li>Or just tag defensive <b>results</b> — Sack, TFL (negative yardage), Interception, Fumble.</li>
        </ol>
        <p style="color:var(--text-dim)">Once any defensive data exists, this report shows havoc rate, front &amp; coverage breakdowns with stop%, blitz analysis, and front-by-situation.</p>
      </div>`;

    this.dashboardEl.innerHTML = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Defensive Report: ${team}</h2>
            <div class="stats-header-actions">
              ${hasData ? '<button class="btn btn-sm" id="btnExportDef">Export Report</button>' : ''}
              <button class="btn btn-sm btn-danger" id="btnCloseDef">Close</button>
            </div>
          </div>
          <div class="stats-body">${body}</div>
        </div>
      </div>`;
    this.dashboardEl.classList.remove('hidden');
    this.dashboardEl.querySelector('#btnCloseDef').addEventListener('click', () => this.hideDashboard());
    this.dashboardEl.querySelector('#btnExportDef')?.addEventListener('click', () => this._exportDefensiveReport(stats, team));
    this.dashboardEl.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  _exportDefensiveReport(stats, team) {
    const d = stats.defensive;
    const title = `Defensive Report: ${team}`;
    const frontRows = d.fronts.map(f =>
      `<tr><td>${f.name}</td><td>${f.count}</td><td>${f.runs}/${f.passes}</td><td>${f.yards}</td><td>${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}</td><td>${f.count ? Math.round(f.successes / f.count * 100) : 0}%</td><td>${f.count ? Math.round(f.havoc / f.count * 100) : 0}%</td></tr>`
    ).join('');
    const covRows = d.coverages.map(c =>
      `<tr><td>${c.name}</td><td>${c.count}</td><td>${c.comps}</td><td>${c.incs}</td><td>${c.ints}</td><td>${c.sacks}</td><td>${c.yards}</td><td>${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}</td><td>${c.count ? Math.round(c.successes / c.count * 100) : 0}%</td></tr>`
    ).join('');
    const blitzRows = d.blitzes.map(b =>
      `<tr><td>${b.name}</td><td>${b.count}</td><td>${b.sacks}</td><td>${b.count ? Math.round(b.havoc / b.count * 100) : 0}%</td><td>${b.count ? (b.yards / b.count).toFixed(1) : '0.0'}</td><td>${b.count ? Math.round(b.successes / b.count * 100) : 0}%</td></tr>`
    ).join('');
    const body = `
<h1>${title}</h1><p class="sub">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
<h3>Summary</h3><div class="cards">
<div class="card"><div class="cv">${d.havocRate}%</div><div class="cl">Havoc Rate</div></div>
<div class="card"><div class="cv">${d.sacks}</div><div class="cl">Sacks (${d.sackYards} yds)</div></div>
<div class="card"><div class="cv">${d.tfl}</div><div class="cl">TFL</div></div>
<div class="card"><div class="cv">${d.interceptions + d.fumbles}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${d.blitzRate}%</div><div class="cl">Blitz Rate</div></div>
<div class="card"><div class="cv">${d.blitzHavocRate}%</div><div class="cl">Blitz Havoc</div></div>
<div class="card"><div class="cv">${d.incompletions}</div><div class="cl">Incompletions</div></div>
<div class="card"><div class="cv">${d.threeAndOuts}</div><div class="cl">3-and-Outs</div></div>
</div>
${frontRows ? `<h3>Defensive Front</h3><table><thead><tr><th>Front</th><th>#</th><th>Run/Pass</th><th>Yds</th><th>Avg</th><th>Stop%</th><th>Havoc%</th></tr></thead><tbody>${frontRows}</tbody></table>` : ''}
${covRows ? `<h3>Coverage</h3><table><thead><tr><th>Coverage</th><th>#</th><th>Comp</th><th>Inc</th><th>INT</th><th>Sack</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${covRows}</tbody></table>` : ''}
${blitzRows ? `<h3>Blitz Analysis</h3><table><thead><tr><th>Blitz</th><th>#</th><th>Sacks</th><th>Havoc%</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${blitzRows}</tbody></table>` : ''}`;
    this._openPrintWindow(title, body);
  }

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
        gamePlanHtml += `<div class="gp-print-col"><h4 class="gp-h good">What's Working</h4><ul>${tk.working.map(i => `<li>${i.text}</li>`).join('')}</ul></div>`;
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
<div class="card"><div class="cv">${tend.runPct}%/${tend.passPct}%</div><div class="cl">Run/Pass</div></div>
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
        `<tr><td>${f.name}</td><td>${f.count}</td><td>${f.yards}</td><td>${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}</td><td>${f.count ? Math.round(f.successes / f.count * 100) : 0}%</td><td>${f.count ? Math.round(f.havoc / f.count * 100) : 0}%</td></tr>`
      ).join('');
      const covRows = d.coverages.map(c =>
        `<tr><td>${c.name}</td><td>${c.count}</td><td>${c.yards}</td><td>${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}</td><td>${c.count ? Math.round(c.successes / c.count * 100) : 0}%</td></tr>`
      ).join('');
      body += `
<h3>Defensive Summary</h3>
<div class="cards">
<div class="card"><div class="cv">${d.havocRate}%</div><div class="cl">Havoc Rate</div></div>
<div class="card"><div class="cv">${d.sacks}</div><div class="cl">Sacks</div></div>
<div class="card"><div class="cv">${d.tfl}</div><div class="cl">TFL</div></div>
<div class="card"><div class="cv">${d.interceptions + d.fumbles}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${d.threeAndOuts}</div><div class="cl">3-and-Outs</div></div>
</div>
${frontRows ? `<table><thead><tr><th>Front</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th><th>Havoc%</th></tr></thead><tbody>${frontRows}</tbody></table>` : ''}
${covRows ? `<table><thead><tr><th>Coverage</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${covRows}</tbody></table>` : ''}`;
    }

    const ind = stats.individuals;
    if (ind.rushers.length) {
      body += '<h3>Individual Rushing</h3><table><thead><tr><th>Player</th><th>Att</th><th>Yds</th><th>Avg</th><th>TD</th></tr></thead><tbody>';
      ind.rushers.forEach(rv => { body += `<tr><td>${this._playerLabel(rv.num)}</td><td>${rv.attempts}</td><td>${rv.yards}</td><td>${rv.attempts ? (rv.yards / rv.attempts).toFixed(1) : '0.0'}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.passers.length) {
      body += '<h3>Individual Passing</h3><table><thead><tr><th>Player</th><th>C/A</th><th>Yds</th><th>TD</th><th>INT</th></tr></thead><tbody>';
      ind.passers.forEach(pv => { body += `<tr><td>${this._playerLabel(pv.num)}</td><td>${pv.completions}/${pv.attempts}</td><td>${pv.yards}</td><td>${pv.tds}</td><td>${pv.ints}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.receivers.length) {
      body += '<h3>Individual Receiving</h3><table><thead><tr><th>Player</th><th>Rec</th><th>Yds</th><th>TD</th></tr></thead><tbody>';
      ind.receivers.forEach(rv => { body += `<tr><td>${this._playerLabel(rv.num)}</td><td>${rv.receptions}</td><td>${rv.yards}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.tacklers.length) {
      body += '<h3>Individual Tackles</h3><table><thead><tr><th>Player</th><th>Tkl</th><th>Solo</th><th>Ast</th><th>Sack</th><th>TFL</th><th>INT</th><th>FR</th></tr></thead><tbody>';
      ind.tacklers.forEach(tv => { body += `<tr><td>${this._playerLabel(tv.num)}</td><td>${tv.tackles}</td><td>${tv.solo}</td><td>${tv.assists}</td><td>${tv.sacks}</td><td>${tv.tfl}</td><td>${tv.ints || 0}</td><td>${tv.fumblesRec || 0}</td></tr>`; });
      body += '</tbody></table>';
    }

    this._openPrintWindow(title, body);
  }

  _openPrintWindow(title, bodyHtml) {
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up blocked — allow pop-ups for this site to export PDF.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:#1a1a2e;max-width:940px;margin:24px auto;padding:0 24px}
h1{border-bottom:3px solid #1a1a2e;padding-bottom:8px;color:#1a1a2e;font-size:22px;font-weight:800;letter-spacing:0.5px}
h3{color:#1a1a2e;border-bottom:2px solid #c9a227;padding-bottom:4px;margin-top:24px;font-size:14px;font-weight:700}
.sub{color:#666;font-size:12px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{padding:6px 10px;border:1px solid #e5e7eb;text-align:left;font-size:12px}
th{background:#1a1a2e;color:#fff;font-weight:700;letter-spacing:0.3px}tr:nth-child(even){background:#f9fafb}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:12px 0}
.card{border:1px solid #e5e7eb;padding:10px;border-radius:8px;text-align:center}
.cv{font-size:24px;font-weight:800;color:#1a1a2e;font-variant-numeric:tabular-nums}.cl{font-size:9px;text-transform:uppercase;color:#6b7280;margin-top:3px;letter-spacing:0.5px;font-weight:700}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.gp-print{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;padding:16px;border:1px solid #e5e7eb;border-radius:8px;background:#fafbfc}
.gp-print-col ul{margin:6px 0 0;padding-left:20px;line-height:1.7;font-size:12px}.gp-print-col li{margin-bottom:4px}
.gp-h{font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;margin:0;padding-bottom:4px;border-bottom:2px solid}
.gp-h.good{color:#16a34a;border-color:#16a34a}.gp-h.fix{color:#dc2626;border-color:#dc2626}
.meter{height:18px;border-radius:9px;background:#e5e7eb;overflow:hidden;margin:10px 0 4px}.meter>div{height:100%;border-radius:9px}
.mval{font-size:28px;font-weight:800;font-variant-numeric:tabular-nums}.mlbl{color:#6b7280;font-size:13px;font-weight:600}
ul{line-height:1.7;font-size:13px}
@media print{
  body{margin:0;padding:10px}
  h1{font-size:18px}h3{font-size:12px}
  .cards{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
  .card{padding:6px}.cv{font-size:16px}
  table{font-size:11px}th,td{padding:4px 6px}
  .no-print{display:none}
}
</style></head><body>
${bodyHtml}
<div class="no-print" style="text-align:center;margin:32px 0">
<p style="color:#999;font-size:12px">Use your browser's <b>Save as PDF</b> option in the print dialog, or press Ctrl/Cmd+P.</p>
</div>
</body></html>`);
    w.document.close();
    setTimeout(() => w.print(), 400);
  }
}
