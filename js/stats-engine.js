/**
 * StatsEngine - Computes team and individual stats from charted play data.
 *
 * All stats are derived live from the play entries in PlayTagger.
 * Nothing is cached — call compute() whenever you need fresh numbers.
 */
import { HeatMaps } from './heat-maps.js';
import { AdvancedMetrics } from './advanced-metrics.js';
import { Visualizations } from './visualizations.js';

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
    if (playsOverride) {
      plays = playsOverride.filter(p => p.tags && p.tags.playType);
    } else {
      plays = this.tagger.plays.filter(p => p.tags.playType);
      filterActive = this.filter && this.filter.active;
      if (filterActive) plays = this.filter.filter(plays);
    }

    const stats = {
      totalPlays: plays.length,
      filterActive,
      rushing: this._rushingStats(plays),
      passing: this._passingStats(plays),
      scoring: this._scoringStats(plays),
      downs: this._downStats(plays),
      turnovers: this._turnoverStats(plays),
      tendencies: this._tendencyStats(plays),
      bigPlays: this._bigPlays(plays),
      individuals: this._individualStats(plays),
      drives: this._driveStats(plays),
      situational: this._situationalStats(plays),
      efficiency: this._efficiencyStats(plays),
      personnel: this._personnelStats(plays),
      advanced: this.advanced.summarize(plays),
      defensive: this._defensiveStats(plays)
    };

    return stats;
  }

  _currentPlays() {
    let plays = this.tagger.plays.filter(p => p.tags.playType);
    if (this.filter && this.filter.active) plays = this.filter.filter(plays);
    return plays;
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  _isSuccessfulPlay(p) {
    const yds = parseInt(p.tags.yardage) || 0;
    const dist = parseInt(p.tags.distance) || 10;
    if (p.tags.result === 'Touchdown') return true;
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
    const drives = {};
    plays.forEach(p => {
      const d = p.tags.driveNumber || '?';
      if (!drives[d]) drives[d] = { number: d, plays: [], yards: 0, result: '' };
      drives[d].plays.push(p);
      drives[d].yards += parseInt(p.tags.yardage) || 0;
    });
    const list = Object.values(drives).map(dr => {
      const last = dr.plays[dr.plays.length - 1];
      const r = last?.tags.result || '';
      let outcome = 'Other';
      if (r === 'Touchdown') outcome = 'TD';
      else if (r === 'Field Goal') outcome = 'FG';
      else if (r === 'Punt') outcome = 'Punt';
      else if (r === 'Interception' || r === 'Fumble') outcome = 'Turnover';
      else if (r === 'Kneel') outcome = 'Kneel';
      return { ...dr, plays: dr.plays.length, outcome };
    });
    return {
      total: list.length,
      list,
      scoringDrives: list.filter(d => d.outcome === 'TD' || d.outcome === 'FG').length,
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
      const tds = arr.filter(p => p.tags.result === 'Touchdown').length;
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
        tds: qp.filter(p => p.tags.result === 'Touchdown').length
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
    const sacks = plays.filter(p => p.tags.result === 'Sack');
    const tfl = plays.filter(p => (parseInt(p.tags.yardage) || 0) < 0 && p.tags.result !== 'Sack');
    const ints = plays.filter(p => p.tags.result === 'Interception');
    const fumbles = plays.filter(p => p.tags.result === 'Fumble');
    const incompletions = plays.filter(p => p.tags.result === 'Incomplete');
    const havocPlays = sacks.length + tfl.length + ints.length + fumbles.length;
    const threeAndOuts = this._countThreeAndOuts(plays);

    const fronts = {};
    const coverages = {};
    const blitzes = {};

    plays.forEach(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      const defSuccess = !this._isSuccessfulPlay(p);
      const isHavoc = p.tags.result === 'Sack' || p.tags.result === 'Interception' ||
        p.tags.result === 'Fumble' || (yds < 0 && p.tags.result !== 'Sack');

      if (p.tags.defFront) {
        const f = p.tags.defFront;
        if (!fronts[f]) fronts[f] = { name: f, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0 };
        fronts[f].count++;
        fronts[f].yards += yds;
        if (defSuccess) fronts[f].successes++;
        if (isHavoc) fronts[f].havoc++;
        if (StatsEngine.isRun(p)) fronts[f].runs++;
        else fronts[f].passes++;
      }

      if (p.tags.coverage) {
        const c = p.tags.coverage;
        if (!coverages[c]) coverages[c] = { name: c, count: 0, yards: 0, successes: 0, comps: 0, incs: 0, ints: 0, sacks: 0 };
        coverages[c].count++;
        coverages[c].yards += yds;
        if (defSuccess) coverages[c].successes++;
        if (p.tags.result === 'Gain' || p.tags.result === 'Touchdown' || p.tags.result === 'No Gain') coverages[c].comps++;
        if (p.tags.result === 'Incomplete') coverages[c].incs++;
        if (p.tags.result === 'Interception') coverages[c].ints++;
        if (p.tags.result === 'Sack') coverages[c].sacks++;
      }

      if (p.tags.blitz) {
        const b = p.tags.blitz;
        if (!blitzes[b]) blitzes[b] = { name: b, count: 0, yards: 0, sacks: 0, havoc: 0, successes: 0 };
        blitzes[b].count++;
        blitzes[b].yards += yds;
        if (p.tags.result === 'Sack') blitzes[b].sacks++;
        if (isHavoc) blitzes[b].havoc++;
        if (defSuccess) blitzes[b].successes++;
      }
    });

    const blitzPlays = plays.filter(p => p.tags.blitz);
    const noBlitzPlays = plays.filter(p => !p.tags.blitz && (p.tags.defFront || p.tags.coverage));
    const blitzHavoc = blitzPlays.filter(p =>
      p.tags.result === 'Sack' || p.tags.result === 'Interception' ||
      p.tags.result === 'Fumble' || ((parseInt(p.tags.yardage) || 0) < 0 && p.tags.result !== 'Sack')
    ).length;

    const passingDowns = plays.filter(p =>
      (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) >= 7) ||
      (p.tags.down === '3') || (p.tags.down === '4')
    );
    const earlyDowns = plays.filter(p => p.tags.down === '1' || (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) < 7));

    const frontBySituation = (subset, label) => {
      const map = {};
      subset.forEach(p => {
        if (!p.tags.defFront) return;
        map[p.tags.defFront] = (map[p.tags.defFront] || 0) + 1;
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
    const drives = {};
    plays.forEach(p => {
      const d = p.tags.driveNumber;
      if (!d) return;
      if (!drives[d]) drives[d] = [];
      drives[d].push(p);
    });
    return Object.values(drives).filter(dp =>
      dp.length <= 3 && !dp.some(p => p.tags.result === 'Touchdown' || p.tags.result === 'Field Goal' || p.tags.custom?.includes('1st Down'))
    ).length;
  }

  _rushingStats(plays) {
    const rushPlays = plays.filter(p => StatsEngine.isRun(p));
    const yards = rushPlays.reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0);
    const attempts = rushPlays.length;

    return {
      attempts,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      touchdowns: rushPlays.filter(p => p.tags.result === 'Touchdown').length,
      fumbles: rushPlays.filter(p => p.tags.result === 'Fumble').length,
      longest: rushPlays.reduce((max, p) => Math.max(max, parseInt(p.tags.yardage) || 0), 0),
      firstDowns: rushPlays.filter(p => p.tags.custom?.includes('1st Down')).length
    };
  }

  _passingStats(plays) {
    const passPlays = plays.filter(p => StatsEngine.isPass(p));
    const completions = passPlays.filter(p =>
      p.tags.result === 'Gain' || p.tags.result === 'Touchdown' || p.tags.result === 'No Gain'
    );
    const incompletions = passPlays.filter(p => p.tags.result === 'Incomplete');
    const yards = passPlays.reduce((sum, p) => {
      if (p.tags.result === 'Incomplete' || p.tags.result === 'Interception') return sum;
      return sum + (parseInt(p.tags.yardage) || 0);
    }, 0);
    const attempts = completions.length + incompletions.length +
      passPlays.filter(p => p.tags.result === 'Interception').length;

    return {
      attempts,
      completions: completions.length,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      yardsPerCompletion: completions.length ? (yards / completions.length).toFixed(1) : '0.0',
      completionPct: attempts ? ((completions.length / attempts) * 100).toFixed(1) : '0.0',
      touchdowns: passPlays.filter(p => p.tags.result === 'Touchdown').length,
      interceptions: passPlays.filter(p => p.tags.result === 'Interception').length,
      sacks: passPlays.filter(p => p.tags.result === 'Sack').length,
      sackYards: passPlays.filter(p => p.tags.result === 'Sack')
        .reduce((sum, p) => sum + Math.abs(parseInt(p.tags.yardage) || 0), 0),
      longest: passPlays.reduce((max, p) => {
        if (p.tags.result === 'Incomplete') return max;
        return Math.max(max, parseInt(p.tags.yardage) || 0);
      }, 0),
      firstDowns: passPlays.filter(p => p.tags.custom?.includes('1st Down')).length
    };
  }

  _scoringStats(plays) {
    const tds = plays.filter(p => p.tags.result === 'Touchdown');
    return {
      touchdowns: tds.length,
      rushingTDs: tds.filter(p => StatsEngine.isRun(p)).length,
      passingTDs: tds.filter(p => StatsEngine.isPass(p)).length
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
      const conversions = downPlays.filter(p => p.tags.custom?.includes('1st Down') || p.tags.result === 'Touchdown').length;

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

    const firstDowns = plays.filter(p => p.tags.custom?.includes('1st Down')).length;
    const thirdDown = byDown['3'];
    const thirdDownConv = thirdDown.filter(p => p.tags.custom?.includes('1st Down') || p.tags.result === 'Touchdown').length;
    const fourthDown = byDown['4'];
    const fourthDownConv = fourthDown.filter(p => p.tags.custom?.includes('1st Down') || p.tags.result === 'Touchdown').length;

    return {
      byDown: downStats,
      totalFirstDowns: firstDowns,
      thirdDownConv: `${thirdDownConv}/${thirdDown.length}`,
      thirdDownPct: thirdDown.length ? ((thirdDownConv / thirdDown.length) * 100).toFixed(1) : '0.0',
      fourthDownConv: `${fourthDownConv}/${fourthDown.length}`,
      fourthDownPct: fourthDown.length ? ((fourthDownConv / fourthDown.length) * 100).toFixed(1) : '0.0'
    };
  }

  _turnoverStats(plays) {
    const ints = plays.filter(p => p.tags.result === 'Interception').length;
    const fumbles = plays.filter(p => p.tags.result === 'Fumble').length;
    return {
      total: ints + fumbles,
      interceptions: ints,
      fumbles
    };
  }

  _tendencyStats(plays) {
    // Formation frequency. Formation is multi-select (e.g. "Pistol + Spread"),
    // so a play is counted under EACH of its formations — percentages may sum
    // above 100% because looks overlap.
    const formations = {};
    plays.forEach(p => {
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
        formations[f] = (formations[f] || 0) + 1;
      });
    });

    // Play type distribution
    const playTypes = {};
    plays.forEach(p => {
      const t = p.tags.playType || 'Unknown';
      playTypes[t] = (playTypes[t] || 0) + 1;
    });

    // Run/pass ratio
    const runs = plays.filter(p => StatsEngine.isRun(p)).length;
    const passes = plays.length - runs;

    return {
      formations,
      playTypes,
      runPassRatio: `${runs}/${passes}`,
      runPct: plays.length ? ((runs / plays.length) * 100).toFixed(1) : '0.0',
      passPct: plays.length ? ((passes / plays.length) * 100).toFixed(1) : '0.0'
    };
  }

  _bigPlays(plays) {
    return plays.filter(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      return yds >= 20 || p.tags.result === 'Touchdown';
    }).map(p => ({
      id: p.id,
      type: p.tags.playType,
      result: p.tags.result,
      yards: p.tags.yardage,
      clipName: p.clipName || `Play ${p.id}`
    }));
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
      const isPass = !isRun;
      const isTD = p.tags.result === 'Touchdown';
      const isComplete = p.tags.result === 'Gain' || p.tags.result === 'Touchdown' || p.tags.result === 'No Gain';
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
          // result 'Field Goal' (made) or a scoring result counts as made
          if (p.tags.result === 'Field Goal' || p.tags.result === 'Touchdown') kickers[id].fgMade++;
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
        if (p.tags.result === 'Fumble') rushers[id].fumbles++;
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
        if (p.tags.result !== 'Sack') passers[id].attempts++;
        if (isComplete) {
          passers[id].completions++;
          passers[id].yards += yds;
        }
        if (isTD) passers[id].tds++;
        if (p.tags.result === 'Interception') passers[id].ints++;
        if (p.tags.result === 'Sack') passers[id].sacks++;
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

      // Tackler
      if (players.tackler) {
        const id = players.tackler;
        if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, sacks: 0, tfl: 0 };
        tacklers[id].tackles++;
        if (p.tags.result === 'Sack') tacklers[id].sacks++;
        if (yds < 0) tacklers[id].tfl++;
        if (p.tags.grades?.tackler != null) {
          if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
          if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
          tacklers[id].gradeSum += p.tags.grades.tackler;
          tacklers[id].gradeCount++;
        }
      }
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
    el.innerHTML = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>${this._gameTitle()}${stats.filterActive ? ' <span style="color:var(--highlight);font-size:14px">(Filtered)</span>' : ''}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportStats">Export Stats</button>
              <button class="btn btn-sm btn-danger" id="btnCloseStatsInner">Close</button>
            </div>
          </div>
          <div class="stats-body">
            ${this._renderTeamStats(stats)}
            ${this._renderEfficiency(stats)}
            ${this._renderAdvanced(stats)}
            ${this.heatMaps.render(this._currentPlays())}
            ${this._renderDownAnalysis(stats)}
            ${this._renderSituational(stats)}
            ${this._renderDrives(stats)}
            ${Visualizations.render(this._currentPlays())}
            ${this._renderTendencies(stats)}
            ${this._renderDefensive(stats)}
            ${this._renderPersonnel(stats)}
            ${this._renderBigPlays(stats)}
            ${this._renderIndividualStats(stats)}
          </div>
        </div>
      </div>
    `;

    // Rebind close button
    el.querySelector('#btnCloseStatsInner').addEventListener('click', () => this.hideDashboard());

    // Export button
    el.querySelector('#btnExportStats').addEventListener('click', () => this._exportStats(stats));

    // Heat map tab switching
    this.heatMaps.bind(el);

    // Click a player's stat row to jump to their first play on film.
    el.querySelectorAll('.player-row').forEach(row => {
      row.title = "Jump to this player's plays";
      row.addEventListener('click', () => this._watchPlayer(row.dataset.player));
    });

    // Click overlay to close
    el.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  /** Play every snap this jersey # is involved in, back-to-back (cut-up). */
  _watchPlayer(num) {
    if (!num) return;
    const matches = this.tagger.plays
      .filter(p => {
        const pl = p.tags.players || {};
        return Object.values(pl).includes(String(num));
      })
      .sort((a, b) => a.timestamp.start - b.timestamp.start);
    if (matches.length === 0) return;
    this.hideDashboard();
    const ids = matches.map(p => p.id);
    const label = `${this._playerLabel(num)} — cut-up`;
    if (window.app && window.app.cutupPlayer) {
      window.app.cutupPlayer.start(ids, label);
    } else {
      this.tagger.selectPlay(ids[0]);
    }
  }

  _gameTitle() {
    const t = document.getElementById('gameTeamName')?.value || '';
    const o = document.getElementById('gameOpponent')?.value || '';
    const u = document.getElementById('gameScoreUs')?.value;
    const th = document.getElementById('gameScoreThem')?.value;
    const d = document.getElementById('gameDate')?.value || '';
    let title = 'Game Stats';
    if (t || o) title = `${t || 'Us'} vs ${o || 'Opponent'}`;
    if (u !== '' && th !== '' && u != null && th != null) title += ` &mdash; ${u}-${th}`;
    if (d) title += ` (${d})`;
    return title;
  }

  _renderEfficiency(stats) {
    const e = stats.efficiency;
    return `
      <div class="stats-section">
        <h3>Efficiency</h3>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Success Rate</div><div class="stat-card-value">${e.successRate}%</div></div>
          <div class="stat-card"><div class="stat-card-title">Explosive Plays</div><div class="stat-card-value">${e.explosivePlays} (${e.explosivePct}%)</div></div>
          <div class="stat-card"><div class="stat-card-title">Negative Plays</div><div class="stat-card-value">${e.negativePlays} (${e.negativePct}%)</div></div>
        </div>
        <div class="success-rate-bar"><div style="width:${e.successRate}%;background:var(--accent);height:100%"></div></div>
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

  _renderSituational(stats) {
    const s = stats.situational;
    const row = (label, b) => b.total === 0 ? '' :
      `<tr><td>${label}</td><td>${b.total}</td><td>${b.yards}</td><td>${b.avg}</td><td>${b.successPct}%</td><td>${b.tds}</td></tr>`;
    const rows = [
      row('Red Zone', s.redZone),
      row('Goal Line', s.goalLine),
      row('Backed Up', s.backedUp),
      row('3rd & Long', s.thirdLong),
      row('3rd & Short', s.thirdShort)
    ].filter(Boolean).join('');
    if (!rows) return '';
    let qRows = '';
    for (const [q, qs] of Object.entries(s.byQuarter)) {
      if (qs.plays === 0) continue;
      qRows += `<tr><td>${q}</td><td>${qs.plays}</td><td>${qs.yards}</td><td>${qs.tds}</td></tr>`;
    }
    return `
      <div class="stats-section stats-two-col">
        <div>
          <h3>Situational</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Situation</th><th>#</th><th>Yds</th><th>Avg</th><th>Succ%</th><th>TD</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
        <div>
          <h3>By Quarter</h3>
          ${qRows ? `<table class="stats-table stats-table-full">
            <thead><tr><th>Q</th><th>Plays</th><th>Yds</th><th>TD</th></tr></thead>
            <tbody>${qRows}</tbody>
          </table>` : '<p style="opacity:.6">No quarter data tagged.</p>'}
        </div>
      </div>`;
  }

  _renderDrives(stats) {
    const d = stats.drives;
    if (d.total === 0) return '';
    const colorMap = { TD: '#44ff44', FG: '#88ddff', Punt: '#888', Turnover: '#ff4444', Kneel: '#666', Other: '#ffaa00' };
    let rows = '';
    for (const dr of d.list) {
      const color = colorMap[dr.outcome] || '#aaa';
      rows += `<div class="drive-row">
        <span style="width:50px">Drive ${dr.number}</span>
        <div class="drive-bar" style="flex:1;background:#222;height:18px;position:relative">
          <div style="background:${color};height:100%;width:${Math.min(100, dr.plays * 8)}%"></div>
        </div>
        <span style="width:60px;text-align:right">${dr.plays} pl</span>
        <span style="width:60px;text-align:right">${dr.yards} yd</span>
        <span style="width:80px;text-align:right;color:${color}">${dr.outcome}</span>
      </div>`;
    }
    return `
      <div class="stats-section">
        <h3>Drives</h3>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Total Drives</div><div class="stat-card-value">${d.total}</div></div>
          <div class="stat-card"><div class="stat-card-title">Scoring Drives</div><div class="stat-card-value">${d.scoringDrives}</div></div>
          <div class="stat-card"><div class="stat-card-title">Avg Plays</div><div class="stat-card-value">${d.avgPlaysPerDrive}</div></div>
          <div class="stat-card"><div class="stat-card-title">Avg Yards</div><div class="stat-card-value">${d.avgYardsPerDrive}</div></div>
        </div>
        <div class="drive-chart">${rows}</div>
      </div>`;
  }

  _renderPersonnel(stats) {
    if (!stats.personnel.length) return '';
    let rows = '';
    for (const g of stats.personnel) {
      if (g.name === 'Unknown' && stats.personnel.length > 1) continue;
      rows += `<tr><td>${g.name}</td><td>${g.count}</td><td>${g.runs}/${g.passes}</td><td>${g.yards}</td><td>${g.avg}</td><td>${g.successPct}%</td></tr>`;
    }
    if (!rows) return '';
    return `
      <div class="stats-section">
        <h3>Personnel Groupings</h3>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Group</th><th>#</th><th>Run/Pass</th><th>Yds</th><th>Avg</th><th>Succ%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>
      </div>`;
  }

  _renderTeamStats(stats) {
    const r = stats.rushing;
    const p = stats.passing;
    const s = stats.scoring;
    const t = stats.turnovers;

    return `
      <div class="stats-section">
        <h3>Team Summary</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-title">Total Plays</div>
            <div class="stat-card-value">${stats.totalPlays}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Total Yards</div>
            <div class="stat-card-value">${r.yards + p.yards}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Touchdowns</div>
            <div class="stat-card-value">${s.touchdowns}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">Turnovers</div>
            <div class="stat-card-value">${t.total}</div>
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

    let rows = '';
    for (const [down, s] of Object.entries(d.byDown)) {
      if (s.total === 0) continue;
      rows += `<tr>
        <td>${labels[down]}</td>
        <td>${s.total}</td>
        <td>${s.runPct}% / ${s.passPct}%</td>
        <td>${s.avgYards}</td>
        <td>${s.conversionPct}%</td>
      </tr>`;
    }

    return `
      <div class="stats-section">
        <h3>Down &amp; Distance</h3>
        <div class="stats-grid">
          <div class="stat-card">
            <div class="stat-card-title">First Downs</div>
            <div class="stat-card-value">${d.totalFirstDowns}</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">3rd Down</div>
            <div class="stat-card-value">${d.thirdDownConv} (${d.thirdDownPct}%)</div>
          </div>
          <div class="stat-card">
            <div class="stat-card-title">4th Down</div>
            <div class="stat-card-value">${d.fourthDownConv} (${d.fourthDownPct}%)</div>
          </div>
        </div>
        ${rows ? `<table class="stats-table stats-table-full">
          <thead><tr><th>Down</th><th>Plays</th><th>Run/Pass</th><th>Avg Yds</th><th>Conv %</th></tr></thead>
          <tbody>${rows}</tbody>
        </table>` : ''}
      </div>
    `;
  }

  _renderTendencies(stats) {
    const t = stats.tendencies;

    let formationRows = '';
    const sortedFormations = Object.entries(t.formations).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sortedFormations) {
      const pct = ((count / stats.totalPlays) * 100).toFixed(1);
      formationRows += `<tr><td>${name}</td><td>${count}</td><td>${pct}%</td></tr>`;
    }

    let typeRows = '';
    const sortedTypes = Object.entries(t.playTypes).sort((a, b) => b[1] - a[1]);
    for (const [name, count] of sortedTypes) {
      const pct = ((count / stats.totalPlays) * 100).toFixed(1);
      typeRows += `<tr><td>${name}</td><td>${count}</td><td>${pct}%</td></tr>`;
    }

    return `
      <div class="stats-section stats-two-col">
        <div>
          <h3>Formation Tendencies</h3>
          <div class="tendency-bar">
            <div class="tendency-run" style="width:${t.runPct}%">${t.runPct}% Run</div>
            <div class="tendency-pass" style="width:${t.passPct}%">${t.passPct}% Pass</div>
          </div>
          ${formationRows ? `<table class="stats-table stats-table-full">
            <thead><tr><th>Formation</th><th>#</th><th>%</th></tr></thead>
            <tbody>${formationRows}</tbody>
          </table>` : ''}
        </div>
        <div>
          <h3>Play Type Breakdown</h3>
          ${typeRows ? `<table class="stats-table stats-table-full">
            <thead><tr><th>Type</th><th>#</th><th>%</th></tr></thead>
            <tbody>${typeRows}</tbody>
          </table>` : ''}
        </div>
      </div>
    `;
  }

  _renderDefensive(stats) {
    const d = stats.defensive;
    if (!d.hasData) return '';

    let frontRows = '';
    for (const f of d.fronts) {
      const avg = f.count ? (f.yards / f.count).toFixed(1) : '0.0';
      const defSucc = f.count ? ((f.successes / f.count) * 100).toFixed(0) : '0';
      const havocPct = f.count ? ((f.havoc / f.count) * 100).toFixed(0) : '0';
      frontRows += `<tr><td>${f.name}</td><td>${f.count}</td><td>${f.runs}/${f.passes}</td><td>${f.yards}</td><td>${avg}</td><td>${defSucc}%</td><td>${havocPct}%</td></tr>`;
    }

    let covRows = '';
    for (const c of d.coverages) {
      const avg = c.count ? (c.yards / c.count).toFixed(1) : '0.0';
      const defSucc = c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0';
      covRows += `<tr><td>${c.name}</td><td>${c.count}</td><td>${c.comps}</td><td>${c.incs}</td><td>${c.ints}</td><td>${c.sacks}</td><td>${c.yards}</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
    }

    let blitzRows = '';
    for (const b of d.blitzes) {
      const avg = b.count ? (b.yards / b.count).toFixed(1) : '0.0';
      const havocPct = b.count ? ((b.havoc / b.count) * 100).toFixed(0) : '0';
      const defSucc = b.count ? ((b.successes / b.count) * 100).toFixed(0) : '0';
      blitzRows += `<tr><td>${b.name}</td><td>${b.count}</td><td>${b.sacks}</td><td>${havocPct}%</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
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

    return `
      <div class="stats-section">
        <h3>Defensive Analytics</h3>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Havoc Rate</div><div class="stat-card-value" style="color:#ff6666">${d.havocRate}%</div><div style="font-size:11px;opacity:.6">${d.havocPlays} plays</div></div>
          <div class="stat-card"><div class="stat-card-title">Sacks</div><div class="stat-card-value">${d.sacks}</div><div style="font-size:11px;opacity:.6">${d.sackYards} yds</div></div>
          <div class="stat-card"><div class="stat-card-title">TFL</div><div class="stat-card-value">${d.tfl}</div></div>
          <div class="stat-card"><div class="stat-card-title">Turnovers</div><div class="stat-card-value">${d.interceptions + d.fumbles}</div><div style="font-size:11px;opacity:.6">${d.interceptions} INT / ${d.fumbles} Fum</div></div>
        </div>
        <div class="stats-grid" style="margin-top:8px">
          <div class="stat-card"><div class="stat-card-title">Blitz Rate</div><div class="stat-card-value">${d.blitzRate}%</div><div style="font-size:11px;opacity:.6">${d.blitzTotal} plays</div></div>
          <div class="stat-card"><div class="stat-card-title">Blitz Havoc</div><div class="stat-card-value" style="color:${parseFloat(d.blitzHavocRate) >= 20 ? '#44ff88' : '#fff'}">${d.blitzHavocRate}%</div></div>
          <div class="stat-card"><div class="stat-card-title">Incompletions</div><div class="stat-card-value">${d.incompletions}</div></div>
          <div class="stat-card"><div class="stat-card-title">3-and-Outs</div><div class="stat-card-value">${d.threeAndOuts}</div></div>
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
    // Season view supplies a merged name map across loaded games.
    if (this._seasonLabels && this._seasonLabels[num]) return `#${num} ${this._seasonLabels[num]}`;
    const roster = (typeof window !== 'undefined') && window.app && window.app.roster;
    return roster ? roster.getLabel(num) : `#${num}`;
  }

  _renderIndividualStats(stats) {
    const ind = stats.individuals;
    let html = '';

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

    if (ind.rushers.length > 0) {
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

    if (ind.passers.length > 0) {
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

    if (ind.receivers.length > 0) {
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

    if (ind.tacklers.length > 0) {
      let rows = '';
      for (const t of ind.tacklers) {
        rows += `<tr class="player-row" data-player="${t.num}"><td>${this._playerLabel(t.num)}</td><td>${t.tackles}</td><td>${t.sacks}</td><td>${t.tfl}</td><td class="${gradeClass(t)}">${fmtGrade(t)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Tackles</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Tkl</th><th>Sack</th><th>TFL</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (ind.returners && ind.returners.length > 0) {
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

    if (ind.kickers && ind.kickers.length > 0) {
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
      const isTd = p.tags.result === 'Touchdown';
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
      if (p.tags.defFront) fronts[p.tags.defFront] = (fronts[p.tags.defFront] || 0) + 1;
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
      redZone: { total: redZonePlays.length, tds: redZonePlays.filter(p => p.tags.result === 'Touchdown').length },
      thirdDown: { total: thirdDownPlays.length, converted: thirdDownPlays.filter(p => p.tags.custom?.includes('1st Down') || p.tags.result === 'Touchdown').length },
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
<style>body{font-family:-apple-system,sans-serif;background:#fff;color:#222;max-width:900px;margin:24px auto;padding:0 20px}
h1{border-bottom:3px solid #4169e1;padding-bottom:8px}h3{color:#4169e1;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:13px}
th{background:#4169e1;color:#fff}tr:nth-child(even){background:#f4f4f8}
.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}
.ov-card{border:1px solid #ddd;padding:12px;border-radius:6px;text-align:center}
.ov-val{font-size:24px;font-weight:bold;color:#4169e1}.ov-lbl{font-size:11px;text-transform:uppercase;color:#666}
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

  _exportStats(stats) {
    const lines = [];
    lines.push('=== GAME STATS REPORT ===\n');

    lines.push(`Total Plays: ${stats.totalPlays}`);
    lines.push(`Total Yards: ${stats.rushing.yards + stats.passing.yards}`);
    lines.push(`Touchdowns: ${stats.scoring.touchdowns}`);
    lines.push(`Turnovers: ${stats.turnovers.total}\n`);

    lines.push('--- RUSHING ---');
    lines.push(`Att: ${stats.rushing.attempts}  Yds: ${stats.rushing.yards}  Avg: ${stats.rushing.average}  TD: ${stats.rushing.touchdowns}  Long: ${stats.rushing.longest}\n`);

    lines.push('--- PASSING ---');
    lines.push(`${stats.passing.completions}/${stats.passing.attempts} (${stats.passing.completionPct}%)  Yds: ${stats.passing.yards}  TD: ${stats.passing.touchdowns}  INT: ${stats.passing.interceptions}  Sacks: ${stats.passing.sacks}\n`);

    lines.push('--- DOWNS ---');
    lines.push(`First Downs: ${stats.downs.totalFirstDowns}`);
    lines.push(`3rd Down: ${stats.downs.thirdDownConv} (${stats.downs.thirdDownPct}%)`);
    lines.push(`4th Down: ${stats.downs.fourthDownConv} (${stats.downs.fourthDownPct}%)\n`);

    lines.push('--- TENDENCIES ---');
    lines.push(`Run/Pass: ${stats.tendencies.runPassRatio} (${stats.tendencies.runPct}%/${stats.tendencies.passPct}%)\n`);

    if (stats.defensive.hasData) {
      const d = stats.defensive;
      lines.push('--- DEFENSIVE ANALYTICS ---');
      lines.push(`Havoc Rate: ${d.havocRate}% (${d.havocPlays} plays)`);
      lines.push(`Sacks: ${d.sacks} (${d.sackYards} yds)  TFL: ${d.tfl}  INT: ${d.interceptions}  Fum: ${d.fumbles}`);
      lines.push(`Blitz Rate: ${d.blitzRate}% (${d.blitzTotal} plays)  Blitz Havoc: ${d.blitzHavocRate}%`);
      lines.push(`3-and-Outs Forced: ${d.threeAndOuts}`);
      if (d.fronts.length) {
        lines.push('\nFront\tPlays\tYds\tAvg\tStop%\tHavoc%');
        d.fronts.forEach(f => {
          lines.push(`${f.name}\t${f.count}\t${f.yards}\t${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}\t${f.count ? Math.round(f.successes / f.count * 100) : 0}%\t${f.count ? Math.round(f.havoc / f.count * 100) : 0}%`);
        });
      }
      if (d.coverages.length) {
        lines.push('\nCoverage\tPlays\tComp\tInc\tINT\tYds\tAvg\tStop%');
        d.coverages.forEach(c => {
          lines.push(`${c.name}\t${c.count}\t${c.comps}\t${c.incs}\t${c.ints}\t${c.yards}\t${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}\t${c.count ? Math.round(c.successes / c.count * 100) : 0}%`);
        });
      }
      lines.push('');
    }

    const ind = stats.individuals;
    if (ind.rushers.length) {
      lines.push('--- INDIVIDUAL RUSHING ---');
      lines.push('Player\tAtt\tYds\tAvg\tTD');
      ind.rushers.forEach(r => {
        lines.push(`#${r.num}\t${r.attempts}\t${r.yards}\t${(r.yards / r.attempts).toFixed(1)}\t${r.tds}`);
      });
      lines.push('');
    }

    if (ind.passers.length) {
      lines.push('--- INDIVIDUAL PASSING ---');
      lines.push('Player\tC/A\tYds\tTD\tINT');
      ind.passers.forEach(p => {
        lines.push(`#${p.num}\t${p.completions}/${p.attempts}\t${p.yards}\t${p.tds}\t${p.ints}`);
      });
      lines.push('');
    }

    if (ind.receivers.length) {
      lines.push('--- INDIVIDUAL RECEIVING ---');
      lines.push('Player\tRec\tYds\tTD');
      ind.receivers.forEach(r => {
        lines.push(`#${r.num}\t${r.receptions}\t${r.yards}\t${r.tds}`);
      });
      lines.push('');
    }

    const text = lines.join('\n');
    const blob = new Blob([text], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'game_stats.txt';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }
}
