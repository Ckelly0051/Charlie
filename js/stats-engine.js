/**
 * StatsEngine - Computes team and individual stats from charted play data.
 *
 * All stats are derived live from the play entries in PlayTagger.
 * Nothing is cached — call compute() whenever you need fresh numbers.
 */
export class StatsEngine {
  constructor(playTagger) {
    this.tagger = playTagger;
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
  compute() {
    const plays = this.tagger.plays.filter(p => p.tags.playType);

    const stats = {
      totalPlays: plays.length,
      rushing: this._rushingStats(plays),
      passing: this._passingStats(plays),
      scoring: this._scoringStats(plays),
      downs: this._downStats(plays),
      turnovers: this._turnoverStats(plays),
      tendencies: this._tendencyStats(plays),
      bigPlays: this._bigPlays(plays),
      individuals: this._individualStats(plays)
    };

    return stats;
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
            <h2>Game Stats</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportStats">Export Stats</button>
              <button class="btn btn-sm btn-danger" id="btnCloseStatsInner">Close</button>
            </div>
          </div>
          <div class="stats-body">
            ${this._renderTeamStats(stats)}
            ${this._renderDownAnalysis(stats)}
            ${this._renderTendencies(stats)}
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

    // Click overlay to close
    el.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
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
