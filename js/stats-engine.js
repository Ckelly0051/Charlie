/**
 * StatsEngine - Computes team and individual stats from charted play data.
 *
 * All stats are derived live from the play entries in PlayTagger.
 * Nothing is cached — call compute() whenever you need fresh numbers.
 */
import { HeatMaps } from './heat-maps.js';
import { AdvancedMetrics } from './advanced-metrics.js';

export class StatsEngine {
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
      advanced: this.advanced.summarize(plays)
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
      const isRun = p.tags.playType?.toLowerCase().includes('run');
      return isRun ? y >= 12 : y >= 16;
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
      if (p.tags.playType?.toLowerCase().includes('run')) groups[k].runs++;
      else groups[k].passes++;
      if (this._isSuccessfulPlay(p)) groups[k].successes++;
    });
    return Object.values(groups).map(g => ({
      ...g,
      avg: g.count ? (g.yards / g.count).toFixed(1) : '0.0',
      successPct: g.count ? ((g.successes / g.count) * 100).toFixed(0) : '0'
    })).sort((a, b) => b.count - a.count);
  }

  _rushingStats(plays) {
    const rushPlays = plays.filter(p =>
      p.tags.playType?.toLowerCase().includes('run')
    );
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
    const passPlays = plays.filter(p => {
      const t = p.tags.playType?.toLowerCase() || '';
      return t.includes('pass') || t.includes('screen') || t === 'play action' || t === 'rpo';
    });
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
      rushingTDs: tds.filter(p => p.tags.playType?.toLowerCase().includes('run')).length,
      passingTDs: tds.filter(p => {
        const t = p.tags.playType?.toLowerCase() || '';
        return t.includes('pass') || t.includes('screen') || t === 'play action';
      }).length
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
      const runs = downPlays.filter(p => p.tags.playType?.toLowerCase().includes('run')).length;
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
    // Formation frequency
    const formations = {};
    plays.forEach(p => {
      const f = p.tags.formation || 'Unknown';
      formations[f] = (formations[f] || 0) + 1;
    });

    // Play type distribution
    const playTypes = {};
    plays.forEach(p => {
      const t = p.tags.playType || 'Unknown';
      playTypes[t] = (playTypes[t] || 0) + 1;
    });

    // Run/pass ratio
    const runs = plays.filter(p => p.tags.playType?.toLowerCase().includes('run')).length;
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

    plays.forEach(p => {
      const players = p.tags.players || {};
      const yds = parseInt(p.tags.yardage) || 0;
      const isRun = p.tags.playType?.toLowerCase().includes('run');
      const isPass = !isRun;
      const isTD = p.tags.result === 'Touchdown';
      const isComplete = p.tags.result === 'Gain' || p.tags.result === 'Touchdown' || p.tags.result === 'No Gain';

      // Ball carrier (rushing)
      if (players.ballCarrier && isRun) {
        const id = players.ballCarrier;
        if (!rushers[id]) rushers[id] = { num: id, attempts: 0, yards: 0, tds: 0, long: 0, fumbles: 0 };
        rushers[id].attempts++;
        rushers[id].yards += yds;
        if (isTD) rushers[id].tds++;
        if (yds > rushers[id].long) rushers[id].long = yds;
        if (p.tags.result === 'Fumble') rushers[id].fumbles++;
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
      }

      // Receiver
      if (players.receiver && isPass && isComplete) {
        const id = players.receiver;
        if (!receivers[id]) receivers[id] = { num: id, receptions: 0, yards: 0, tds: 0, long: 0 };
        receivers[id].receptions++;
        receivers[id].yards += yds;
        if (isTD) receivers[id].tds++;
        if (yds > receivers[id].long) receivers[id].long = yds;
      }

      // Tackler
      if (players.tackler) {
        const id = players.tackler;
        if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, sacks: 0, tfl: 0 };
        tacklers[id].tackles++;
        if (p.tags.result === 'Sack') tacklers[id].sacks++;
        if (yds < 0) tacklers[id].tfl++;
      }
    });

    return {
      rushers: Object.values(rushers).sort((a, b) => b.yards - a.yards),
      passers: Object.values(passers).sort((a, b) => b.yards - a.yards),
      receivers: Object.values(receivers).sort((a, b) => b.yards - a.yards),
      tacklers: Object.values(tacklers).sort((a, b) => b.tackles - a.tackles)
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
            ${this._renderTendencies(stats)}
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

    // Click overlay to close
    el.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
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

  _renderIndividualStats(stats) {
    const ind = stats.individuals;
    let html = '';

    if (ind.rushers.length > 0) {
      let rows = '';
      for (const r of ind.rushers) {
        const avg = r.attempts ? (r.yards / r.attempts).toFixed(1) : '0.0';
        rows += `<tr><td>#${r.num}</td><td>${r.attempts}</td><td>${r.yards}</td><td>${avg}</td><td>${r.long}</td><td>${r.tds}</td><td>${r.fumbles}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Rushing</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Att</th><th>Yds</th><th>Avg</th><th>Long</th><th>TD</th><th>Fum</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (ind.passers.length > 0) {
      let rows = '';
      for (const p of ind.passers) {
        const pct = p.attempts ? ((p.completions / p.attempts) * 100).toFixed(1) : '0.0';
        rows += `<tr><td>#${p.num}</td><td>${p.completions}/${p.attempts}</td><td>${pct}%</td><td>${p.yards}</td><td>${p.tds}</td><td>${p.ints}</td><td>${p.sacks}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Passing</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>C/A</th><th>Pct</th><th>Yds</th><th>TD</th><th>INT</th><th>Sck</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (ind.receivers.length > 0) {
      let rows = '';
      for (const r of ind.receivers) {
        rows += `<tr><td>#${r.num}</td><td>${r.receptions}</td><td>${r.yards}</td><td>${r.long}</td><td>${r.tds}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Receiving</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Rec</th><th>Yds</th><th>Long</th><th>TD</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (ind.tacklers.length > 0) {
      let rows = '';
      for (const t of ind.tacklers) {
        rows += `<tr><td>#${t.num}</td><td>${t.tackles}</td><td>${t.sacks}</td><td>${t.tfl}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Tackles</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Tkl</th><th>Sack</th><th>TFL</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    return html;
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
