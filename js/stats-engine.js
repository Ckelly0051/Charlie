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
      defensive: this._defensiveStats(plays),
      gameFlow: this._gameFlowStats(plays)
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
      const t = p.tags.playType || 'Unknown';
      playTypes[t] = (playTypes[t] || 0) + 1;
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      if (!playTypeDetail[t]) playTypeDetail[t] = { name: t, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      playTypeDetail[t].count++;
      if (isRun) playTypeDetail[t].runs++; else playTypeDetail[t].passes++;
      playTypeDetail[t].yards += yds;
      if (succ) playTypeDetail[t].successes++;
    });
    const playTypeList = Object.values(playTypeDetail)
      .map(pt => ({ ...pt, avg: pt.count ? (pt.yards / pt.count).toFixed(1) : '0.0', successPct: pt.count ? ((pt.successes / pt.count) * 100).toFixed(0) : '0' }))
      .sort((a, b) => b.count - a.count);

    const runs = plays.filter(p => StatsEngine.isRun(p)).length;
    const passes = plays.length - runs;
    const runYds = plays.filter(p => StatsEngine.isRun(p)).reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
    const passYds = plays.filter(p => StatsEngine.isPass(p)).reduce((s, p) => {
      if (p.tags.result === 'Incomplete' || p.tags.result === 'Interception') return s;
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
      return yds >= 20 || p.tags.result === 'Touchdown';
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
              <button class="btn btn-sm" id="btnSelfScout" title="Reveal what tendencies your offense is tipping">Self-Scout</button>
              <button class="btn btn-sm" id="btnDefReport" title="Defensive analytics: havoc, fronts, coverage, blitz">Defense</button>
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
            ${this._renderGameFlow(stats)}
            ${this._renderTendencies(stats)}
            ${this._renderTendencyMatrix(stats)}
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

    // Self-scout: flip the scouting lens on our own offense
    el.querySelector('#btnSelfScout')?.addEventListener('click', () => this.renderSelfScout());

    // Defensive report: focused defensive analytics view
    el.querySelector('#btnDefReport')?.addEventListener('click', () => this.renderDefensiveReport());

    // Heat map tab switching
    this.heatMaps.bind(el);

    // Click a player's stat row to jump to their first play on film.
    el.querySelectorAll('.player-row').forEach(row => {
      row.title = "Jump to this player's plays";
      row.addEventListener('click', () => this._watchPlayer(row.dataset.player));
    });

    // Tendency matrix dimension pickers
    this._bindTendencyMatrix(el);

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
    const colorMap = { TD: '#44ff44', FG: '#88ddff', Punt: '#888', Turnover: '#ff4444', Kneel: '#666', Other: '#ffaa00' };
    const outcomeCounts = {};
    d.list.forEach(dr => { outcomeCounts[dr.outcome] = (outcomeCounts[dr.outcome] || 0) + 1; });
    const outcomeDonut = Charts.donut(
      Object.entries(outcomeCounts).map(([k, v]) => ({ value: v, color: colorMap[k] || '#aaa', label: k })),
      100, String(d.total), 'drives'
    );

    let rows = '';
    const maxYds = Math.max(1, ...d.list.map(dr => Math.abs(dr.yards)));
    for (const dr of d.list) {
      const color = colorMap[dr.outcome] || '#aaa';
      const barPct = Math.max(3, (Math.abs(dr.yards) / maxYds) * 100);
      rows += `<div class="drive-row">
        <span class="drive-num">${dr.number}</span>
        <div class="drive-bar"><div style="background:${color};height:100%;width:${barPct.toFixed(1)}%;border-radius:3px"></div></div>
        <span class="drive-meta">${dr.plays}pl · ${dr.yards}yd</span>
        <span class="drive-outcome" style="color:${color}">${dr.outcome}</span>
      </div>`;
    }
    return `
      <div class="stats-section">
        <h3>Drives</h3>
        <div class="drives-top-row">
          <div class="stats-grid stats-grid-flex">
            <div class="stat-card"><div class="stat-card-title">Scoring</div><div class="stat-card-value">${d.scoringDrives}/${d.total}</div></div>
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
      { value: tend.runs, color: '#ffd23f', label: 'Run' },
      { value: tend.passes, color: '#6cc4ff', label: 'Pass' }
    ], 110, tend.runPct + '%', 'Run Rate');

    const ydsDonut = Charts.donut([
      { value: Math.max(0, r.yards), color: '#ffd23f', label: 'Rush Yards' },
      { value: Math.max(0, p.yards), color: '#6cc4ff', label: 'Pass Yards' }
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
    const maxDown = Math.max(...Object.values(d.byDown).map(s => s.total));
    for (const [down, s] of Object.entries(d.byDown)) {
      if (s.total === 0) continue;
      rows += `<tr>
        <td>${labels[down]}</td>
        <td>${s.total}</td>
        <td><div class="dd-split-bar">${Charts.stackBar([{ value: parseInt(s.runPct), color: '#ffd23f', label: 'Run' }, { value: parseInt(s.passPct), color: '#6cc4ff', label: 'Pass' }], 18)}</div></td>
        <td>${s.avgYards}</td>
        <td>${s.conversionPct}%</td>
      </tr>`;
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
      </div>
    `;
  }

  _renderTendencies(stats) {
    const t = stats.tendencies;

    const formChart = Charts.effectivenessRows(
      t.formationList.map(f => ({ label: f.name, count: f.count, runs: f.runs, passes: f.passes, yards: f.yards, successPct: f.successPct, avg: f.avg }))
    );

    const playTypeDonut = Charts.donutWithLegend(
      t.playTypeList.slice(0, 8).map((pt, i) => {
        const colors = ['#4a9eff', '#ffd23f', '#6cc4ff', '#ff6b6b', '#22c55e', '#a78bfa', '#f97316', '#ec4899'];
        return { value: pt.count, color: colors[i % colors.length], label: pt.name };
      }),
      120, String(stats.totalPlays), 'plays'
    );

    const typeChart = Charts.effectivenessRows(
      t.playTypeList.map(pt => ({ label: pt.name, count: pt.count, runs: pt.runs, passes: pt.passes, yards: pt.yards, successPct: pt.successPct, avg: pt.avg }))
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
      { id: 'playType',   label: 'Play Type',  extract: p => [p.tags.playType || 'Unknown'] },
      { id: 'down',       label: 'Down',        extract: p => [p.tags.down ? `${p.tags.down}` : '?'] },
      { id: 'distBucket', label: 'Distance',    extract: p => { const d = parseInt(p.tags.distance) || 0; return [d <= 3 ? 'Short (1-3)' : d <= 6 ? 'Med (4-6)' : 'Long (7+)']; } },
      { id: 'personnel',  label: 'Personnel',   extract: p => [p.tags.personnel || 'Unknown'] },
      { id: 'defFront',   label: 'Def Front',   extract: p => [p.tags.defFront || ''].filter(Boolean) },
      { id: 'coverage',   label: 'Coverage',    extract: p => [p.tags.coverage || ''].filter(Boolean) },
      { id: 'hash',       label: 'Hash',        extract: p => [p.tags.hash || 'Unknown'] },
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
    const defaultMatrix = this._computeMatrix(this._currentPlays(), 'formation', 'down');
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
      const matrix = this._computeMatrix(this._currentPlays(), rowSel.value, colSel.value);
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
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;background:#fff;color:#222;max-width:900px;margin:24px auto;padding:0 20px}
h1{border-bottom:3px solid #4169e1;padding-bottom:8px}h3{color:#4169e1;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:13px}
th{background:#4169e1;color:#fff}tr:nth-child(even){background:#f4f4f8}
.meter{height:20px;border-radius:10px;background:#eee;overflow:hidden;margin:10px 0 4px}
.meter>div{height:100%;width:${report.predictability}%;background:${meterColor}}
.mval{font-size:28px;font-weight:bold;color:${meterColor}}.mlbl{color:#666;font-size:13px}
ul{line-height:1.6}</style></head><body>
<h1>${title}</h1><p style="color:#666">Generated ${new Date().toLocaleString()} &middot; ${report.totalPlays} run/pass plays</p>
<h3>Predictability Index</h3>
<div class="meter"><div></div></div>
<div class="mval">${report.predictability}<span style="font-size:14px;color:#999">/100</span> &mdash; <span class="mlbl">${report.predLabel}</span></div>
<p style="color:#666">Higher = more predictable. A DC reads the same tendencies; keep key situations balanced.</p>
<h3>Top Tells</h3><table><thead><tr><th>Situation</th><th>Type</th><th>Tendency</th><th>Severity</th><th>n</th></tr></thead><tbody>${tellRows}</tbody></table>
${report.recommendations.length ? `<h3>Recommendations</h3><ul>${report.recommendations.map(r => `<li>${r.replace(/</g, '&lt;')}</li>`).join('')}</ul>` : ''}
<h3>By Formation</h3><table><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Avg</th><th>Tell</th></tr></thead><tbody>${formRows}</tbody></table>
<h3>By Down &amp; Distance</h3><table><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Avg</th><th>Tell</th></tr></thead><tbody>${ddRows}</tbody></table>
</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `self_scout_${team.replace(/\s+/g, '_')}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
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
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>body{font-family:-apple-system,sans-serif;background:#fff;color:#222;max-width:900px;margin:24px auto;padding:0 20px}
h1{border-bottom:3px solid #4169e1;padding-bottom:8px}h3{color:#4169e1;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:13px}
th{background:#4169e1;color:#fff}tr:nth-child(even){background:#f4f4f8}
.cards{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}
.card{border:1px solid #ddd;padding:12px;border-radius:6px;text-align:center}
.cv{font-size:24px;font-weight:bold;color:#4169e1}.cl{font-size:11px;text-transform:uppercase;color:#666}</style></head><body>
<h1>${title}</h1><p style="color:#666">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
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
${blitzRows ? `<h3>Blitz Analysis</h3><table><thead><tr><th>Blitz</th><th>#</th><th>Sacks</th><th>Havoc%</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${blitzRows}</tbody></table>` : ''}
</body></html>`;
    const blob = new Blob([htmlContent], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `defense_${team.replace(/\s+/g, '_')}.html`;
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
