/**
 * SeasonManager - Aggregate stats across multiple game project files.
 *
 * Workflow:
 *   1. User clicks "Season" → modal opens
 *   2. Loads multiple .json project files (or restores from localStorage)
 *   3. Renders aggregated stats reusing StatsEngine + per-game trends + a
 *      self-scout report flagging tendencies opponents would key on
 *
 * Persists the loaded game list to localStorage so the season survives
 * page reloads.
 */
export class SeasonManager {
  constructor(statsEngine) {
    this.statsEngine = statsEngine;
    this.games = [];

    this.btn = document.getElementById('btnSeason');
    this.overlayEl = document.getElementById('seasonOverlay');
    this.fileInput = document.getElementById('seasonFileInput');

    this._bindEvents();
    this._loadFromStorage();
  }

  _bindEvents() {
    if (this.btn) this.btn.addEventListener('click', () => this.show());

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files?.length) this.addFiles(e.target.files);
        e.target.value = '';
      });
    }

    document.addEventListener('click', (e) => {
      if (e.target?.id === 'btnCloseSeason') this.hide();
      if (e.target?.id === 'btnAddSeasonGames') this.fileInput?.click();
      if (e.target?.id === 'btnClearSeason') this.clearAll();
      if (e.target?.id === 'btnExportSeason') this.exportSeasonReport();
      // click outside modal closes
      if (e.target?.id === 'seasonOverlay') this.hide();
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlayEl && !this.overlayEl.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  _key() { return 'ffa_season_games'; }

  _loadFromStorage() {
    try {
      const saved = localStorage.getItem(this._key());
      if (saved) this.games = JSON.parse(saved);
    } catch (e) { this.games = []; }
  }

  _saveToStorage() {
    try {
      localStorage.setItem(this._key(), JSON.stringify(this.games));
    } catch (e) {
      console.warn('Season cache too large; not persisted.');
    }
  }

  async addFiles(files) {
    let added = 0;
    for (const f of files) {
      try {
        const text = await f.text();
        const data = JSON.parse(text);
        if (!data.plays || !Array.isArray(data.plays)) {
          throw new Error('Not a valid project file');
        }
        const opp = data.gameInfo?.opponent;
        const name = opp ? `vs ${opp}` : f.name.replace(/\.json$/i, '');
        this.games.push({
          name,
          file: f.name,
          gameInfo: data.gameInfo || {},
          plays: data.plays,
          loadedAt: new Date().toISOString()
        });
        added++;
      } catch (e) {
        alert(`Failed to load ${f.name}: ${e.message}`);
      }
    }
    if (added) {
      this._saveToStorage();
      this._renderAll();
    }
  }

  removeGame(idx) {
    this.games.splice(idx, 1);
    this._saveToStorage();
    this._renderAll();
  }

  clearAll() {
    if (!this.games.length) return;
    if (!confirm(`Remove all ${this.games.length} games from the season?`)) return;
    this.games = [];
    this._saveToStorage();
    this._renderAll();
  }

  show() {
    if (!this.overlayEl) return;
    this.overlayEl.classList.remove('hidden');
    this._renderAll();
  }

  hide() {
    if (this.overlayEl) this.overlayEl.classList.add('hidden');
  }

  _allPlays() {
    return this.games.flatMap(g => g.plays || []);
  }

  _renderAll() {
    this._renderGameList();
    this._renderStats();
  }

  _renderGameList() {
    const list = document.getElementById('seasonGameList');
    if (!list) return;

    if (!this.games.length) {
      list.innerHTML = '<div class="season-empty">No games loaded. Click "Add Games" to load project .json files from past games.</div>';
      return;
    }

    list.innerHTML = '';
    this.games.forEach((g, i) => {
      const row = document.createElement('div');
      row.className = 'season-game-row';
      const u = g.gameInfo?.scoreUs;
      const t = g.gameInfo?.scoreThem;
      let scoreLabel = '';
      if (u !== undefined && u !== '' && t !== undefined && t !== '') {
        const win = parseInt(u) > parseInt(t);
        const loss = parseInt(u) < parseInt(t);
        const cls = win ? 'win' : (loss ? 'loss' : '');
        scoreLabel = `<span class="score-pill ${cls}">${u}-${t}</span>`;
      }
      const date = g.gameInfo?.date || '';
      row.innerHTML = `
        <div class="season-game-info">
          <div class="season-game-name">${this._escape(g.name)} ${scoreLabel}</div>
          <div class="season-game-meta">${g.plays.length} plays${date ? ' · ' + this._escape(date) : ''}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-action="remove" title="Remove from season">×</button>
      `;
      row.querySelector('[data-action=remove]').addEventListener('click', () => this.removeGame(i));
      list.appendChild(row);
    });
  }

  _renderStats() {
    const body = document.getElementById('seasonStatsBody');
    if (!body) return;

    if (!this.games.length) {
      body.innerHTML = '<div class="season-empty-stats">Load games above to see season-wide stats, trends, and a self-scout report.</div>';
      return;
    }

    const allPlays = this._allPlays();
    const stats = this.statsEngine.compute(allPlays);

    body.innerHTML = `
      ${this._renderHeader(stats)}
      ${this._renderTrends()}
      ${this.statsEngine._renderTeamStats(stats)}
      ${this.statsEngine._renderEfficiency(stats)}
      ${this.statsEngine.heatMaps.render(allPlays)}
      ${this.statsEngine._renderDownAnalysis(stats)}
      ${this.statsEngine._renderSituational(stats)}
      ${this.statsEngine._renderTendencies(stats)}
      ${this.statsEngine._renderPersonnel(stats)}
      ${this._renderPerGameTable()}
      ${this._renderSelfScout()}
    `;

    this.statsEngine.heatMaps.bind(body);
  }

  _renderHeader(stats) {
    let wins = 0, losses = 0, ties = 0, ptsFor = 0, ptsAgainst = 0;
    for (const g of this.games) {
      const u = parseInt(g.gameInfo?.scoreUs);
      const t = parseInt(g.gameInfo?.scoreThem);
      if (!isNaN(u) && !isNaN(t)) {
        ptsFor += u;
        ptsAgainst += t;
        if (u > t) wins++;
        else if (u < t) losses++;
        else ties++;
      }
    }
    const recordStr = ties ? `${wins}-${losses}-${ties}` : `${wins}-${losses}`;
    return `
      <div class="season-summary">
        <div class="ss-stat"><div class="ss-num">${this.games.length}</div><div class="ss-lbl">Games</div></div>
        ${(wins + losses + ties) ? `<div class="ss-stat"><div class="ss-num">${recordStr}</div><div class="ss-lbl">Record</div></div>` : ''}
        <div class="ss-stat"><div class="ss-num">${stats.totalPlays}</div><div class="ss-lbl">Plays</div></div>
        <div class="ss-stat"><div class="ss-num">${stats.rushing.yards + stats.passing.yards}</div><div class="ss-lbl">Total Yds</div></div>
        ${(ptsFor || ptsAgainst) ? `<div class="ss-stat"><div class="ss-num">${ptsFor}-${ptsAgainst}</div><div class="ss-lbl">Pts For-Against</div></div>` : ''}
        <div class="ss-stat"><div class="ss-num">${stats.efficiency.successRate}%</div><div class="ss-lbl">Success</div></div>
      </div>
    `;
  }

  _renderTrends() {
    if (this.games.length < 2) return '';

    const perGame = this.games.map(g => {
      const stats = this.statsEngine.compute(g.plays);
      return {
        name: g.name,
        yards: stats.rushing.yards + stats.passing.yards,
        successPct: parseFloat(stats.efficiency.successRate),
        tos: stats.turnovers.total,
        tds: stats.scoring.touchdowns
      };
    });

    const maxY = Math.max(1, ...perGame.map(g => g.yards));
    const maxS = Math.max(60, ...perGame.map(g => g.successPct));

    const yardsBars = perGame.map(g => `
      <div class="trend-row">
        <span class="trend-label">${this._escape(g.name)}</span>
        <div class="trend-bar"><div style="width:${(g.yards / maxY) * 100}%;background:#ffaa00"></div></div>
        <span class="trend-val">${g.yards}</span>
      </div>`).join('');

    const successBars = perGame.map(g => `
      <div class="trend-row">
        <span class="trend-label">${this._escape(g.name)}</span>
        <div class="trend-bar"><div style="width:${(g.successPct / maxS) * 100}%;background:#44aa44"></div></div>
        <span class="trend-val">${g.successPct.toFixed(0)}%</span>
      </div>`).join('');

    const tdToBars = perGame.map(g => `
      <div class="trend-row">
        <span class="trend-label">${this._escape(g.name)}</span>
        <div class="trend-bar">
          <div style="width:${g.tds * 12}%;background:#44ff44;display:inline-block;height:100%"></div><div style="width:${g.tos * 12}%;background:#ff4444;display:inline-block;height:100%"></div>
        </div>
        <span class="trend-val">${g.tds}TD / ${g.tos}TO</span>
      </div>`).join('');

    return `
      <div class="stats-section">
        <h3>Game-by-Game Trends</h3>
        <div class="trend-grid">
          <div><h4>Total Yards</h4>${yardsBars}</div>
          <div><h4>Success Rate</h4>${successBars}</div>
          <div><h4>TDs vs Turnovers</h4>${tdToBars}</div>
        </div>
      </div>
    `;
  }

  _renderPerGameTable() {
    let rows = '';
    for (const g of this.games) {
      const s = this.statsEngine.compute(g.plays);
      rows += `<tr>
        <td>${this._escape(g.name)}</td>
        <td>${s.totalPlays}</td>
        <td>${s.rushing.yards + s.passing.yards}</td>
        <td>${s.rushing.attempts}/${s.rushing.yards}</td>
        <td>${s.passing.completions}/${s.passing.attempts}/${s.passing.yards}</td>
        <td>${s.scoring.touchdowns}</td>
        <td>${s.turnovers.total}</td>
        <td>${s.efficiency.successRate}%</td>
        <td>${s.downs.thirdDownPct}%</td>
      </tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Per-Game Box Score</h3>
        <div class="hm-scroll">
          <table class="stats-table stats-table-full">
            <thead><tr><th>Game</th><th>Plays</th><th>Yds</th><th>Rush A/Y</th><th>Pass C/A/Y</th><th>TD</th><th>TO</th><th>Succ%</th><th>3rd%</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  _renderSelfScout() {
    const allPlays = this._allPlays().filter(p => p.tags && p.tags.playType);

    // Formation tendencies
    const formMap = {};
    allPlays.forEach(p => {
      const f = p.tags.formation;
      if (!f) return;
      if (!formMap[f]) formMap[f] = { total: 0, runs: 0 };
      formMap[f].total++;
      if (p.tags.playType?.toLowerCase().includes('run')) formMap[f].runs++;
    });

    let formationFlags = '';
    for (const [f, d] of Object.entries(formMap)) {
      if (d.total < 5) continue;
      const runPct = (d.runs / d.total) * 100;
      if (runPct >= 75) {
        formationFlags += `<li><b>${this._escape(f)}</b>: ${runPct.toFixed(0)}% run (${d.runs}/${d.total}) — opponents will key the run when they see this look</li>`;
      } else if (runPct <= 25) {
        formationFlags += `<li><b>${this._escape(f)}</b>: ${(100 - runPct).toFixed(0)}% pass (${d.total - d.runs}/${d.total}) — opponents will drop into coverage</li>`;
      }
    }

    // Down & distance: 3rd & long pass tell?
    const thirdLong = allPlays.filter(p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7);
    const thirdLongPass = thirdLong.filter(p => !p.tags.playType?.toLowerCase().includes('run')).length;
    let ddFlags = '';
    if (thirdLong.length >= 5) {
      const passPct = (thirdLongPass / thirdLong.length) * 100;
      if (passPct >= 90) ddFlags += `<li><b>3rd &amp; Long</b>: ${passPct.toFixed(0)}% pass (${thirdLongPass}/${thirdLong.length}) — predictable; consider a draw or screen</li>`;
    }

    // Hash tendencies
    const hashMap = { Left: { runs: 0, total: 0 }, Right: { runs: 0, total: 0 }, Middle: { runs: 0, total: 0 } };
    allPlays.forEach(p => {
      const h = p.tags.hash;
      if (!hashMap[h]) return;
      hashMap[h].total++;
      if (p.tags.playType?.toLowerCase().includes('run')) hashMap[h].runs++;
    });
    let hashFlags = '';
    for (const [h, d] of Object.entries(hashMap)) {
      if (d.total < 5) continue;
      const runPct = (d.runs / d.total) * 100;
      if (runPct >= 75 || runPct <= 25) {
        const tendency = runPct >= 75 ? 'run' : 'pass';
        hashFlags += `<li><b>${h} hash</b>: ${tendency === 'run' ? runPct : 100 - runPct}% ${tendency} (${d.total} plays) — strong hash tendency</li>`;
      }
    }

    let allFlags = formationFlags + ddFlags + hashFlags;
    if (!allFlags) allFlags = '<li class="ok">No major tendencies detected (need 5+ plays per category to flag).</li>';

    return `
      <div class="stats-section">
        <h3>Self-Scout Report</h3>
        <p class="self-scout-intro">What an opponent watching your film would notice:</p>
        <ul class="self-scout">${allFlags}</ul>
      </div>
    `;
  }

  exportSeasonReport() {
    if (!this.games.length) return;
    const allPlays = this._allPlays();
    const stats = this.statsEngine.compute(allPlays);
    const title = `Season Report — ${this.games.length} games`;

    const body = [
      this._renderHeader(stats),
      this._renderTrends(),
      this.statsEngine._renderTeamStats(stats),
      this.statsEngine._renderEfficiency(stats),
      this.statsEngine._renderDownAnalysis(stats),
      this.statsEngine._renderSituational(stats),
      this.statsEngine._renderTendencies(stats),
      this.statsEngine._renderPersonnel(stats),
      this._renderPerGameTable(),
      this._renderSelfScout()
    ].join('\n');

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
<style>
body{font-family:-apple-system,sans-serif;background:#fff;color:#222;max-width:1200px;margin:24px auto;padding:0 20px}
h1{border-bottom:3px solid #06b6d4;padding-bottom:8px}
h3{color:#06b6d4;border-bottom:1px solid #ddd;padding-bottom:4px;margin-top:24px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{padding:6px 10px;border:1px solid #ddd;text-align:left;font-size:13px}
th{background:#06b6d4;color:#fff}
tr:nth-child(even){background:#f4f4f8}
.stats-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:12px;margin:12px 0}
.stat-card{border:1px solid #ddd;padding:12px;border-radius:6px;background:#f9f9fb}
.stat-card-title{font-size:11px;text-transform:uppercase;color:#666}
.stat-card-value{font-size:22px;font-weight:bold;color:#06b6d4}
.season-summary{display:flex;flex-wrap:wrap;gap:18px;background:#06b6d4;color:#fff;padding:14px;border-radius:6px;justify-content:space-around}
.ss-num{font-size:24px;font-weight:bold}
.ss-lbl{font-size:11px;opacity:.8;text-transform:uppercase}
.trend-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:20px}
.trend-row{display:flex;align-items:center;gap:8px;font-size:12px;margin:3px 0}
.trend-label{width:120px;text-overflow:ellipsis;overflow:hidden;white-space:nowrap}
.trend-bar{flex:1;height:14px;background:#eee;border-radius:3px;overflow:hidden}
.trend-bar div{height:100%}
.trend-val{width:80px;text-align:right;color:#666}
.self-scout li{margin:6px 0;line-height:1.4}
.self-scout li b{color:#06b6d4}
</style></head><body>
<h1>${title}</h1>
<p style="color:#666">Generated ${new Date().toLocaleString()}</p>
${body}
</body></html>`;

    const blob = new Blob([html], { type: 'text/html' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `season_report_${new Date().toISOString().slice(0, 10)}.html`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}
