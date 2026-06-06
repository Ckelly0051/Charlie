/**
 * SeasonManager - the season-as-project view.
 *
 * The project IS the season (see season-store.js): one named container of many
 * games, autosaved in the browser. This modal is the season's home — name it up
 * front, add games one at a time, switch between them, and watch aggregate stats
 * + week-over-week progression build over the year.
 *
 * It is a *view* over `app.storage.seasonStore`; it owns no game data of its
 * own. Every read goes through `_store()` so the live active game (whatever the
 * coach is tagging right now) is always reflected.
 */
export class SeasonManager {
  constructor(statsEngine) {
    this.statsEngine = statsEngine;

    this.btn = document.getElementById('btnSeason');
    this.overlayEl = document.getElementById('seasonOverlay');
    this.fileInput = document.getElementById('seasonFileInput');
    this.nameInput = document.getElementById('seasonNameInput');

    this._bindEvents();
  }

  /** The canonical season store (lives on StorageManager). */
  _store() { return window.app && window.app.storage && window.app.storage.seasonStore; }
  _storage() { return window.app && window.app.storage; }

  _bindEvents() {
    if (this.btn) this.btn.addEventListener('click', () => this.show());

    if (this.fileInput) {
      this.fileInput.addEventListener('change', (e) => {
        if (e.target.files?.length) this.addFiles(e.target.files);
        e.target.value = '';
      });
    }

    if (this.nameInput) {
      this.nameInput.addEventListener('input', () => {
        const s = this._storage(); if (s) s.setSeasonName(this.nameInput.value);
      });
    }

    document.addEventListener('click', (e) => {
      const id = e.target?.id;
      if (id === 'btnCloseSeason') this.hide();
      if (id === 'btnAddSeasonGames') this.fileInput?.click();
      if (id === 'btnNewGame') this.newGame();
      if (id === 'btnSaveSeasonFile') this.saveSeasonFile();
      if (id === 'btnOpenSeasonFile') this.openSeasonFile();
      if (id === 'btnExportSeason') this.exportSeasonReport();
      if (id === 'seasonOverlay') this.hide();   // click outside modal closes
    });

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlayEl && !this.overlayEl.classList.contains('hidden')) {
        this.hide();
      }
    });
  }

  /** Import saved game file(s) into the current season as new games. */
  async addFiles(files) {
    const storage = this._storage();
    if (!storage) return;
    let added = 0;
    for (const f of files) {
      try {
        const data = JSON.parse(await f.text());
        if (Array.isArray(data.games)) {
          // A whole season file — merge its games in.
          data.games.forEach(g => storage.seasonStore.addGame(storage.seasonStore.gameFromLegacy(g)));
          storage.seasonStore.persist();
          added += data.games.length;
        } else if (Array.isArray(data.plays)) {
          if (storage.addGameFromData(data)) added++;
        } else {
          throw new Error('Not a valid project file');
        }
      } catch (e) {
        alert(`Failed to load ${f.name}: ${e.message}`);
      }
    }
    if (added) this._renderAll();
  }

  newGame() {
    const storage = this._storage();
    if (storage) storage.newGame();
    this._renderAll();
  }

  removeGame(id) {
    const storage = this._storage();
    if (!storage) return;
    storage.removeGame(id);
    this._renderAll();
  }

  switchGame(id) {
    const storage = this._storage();
    if (!storage) return;
    storage.switchToGame(id);
    this._renderAll();
  }

  async saveSeasonFile() {
    const storage = this._storage();
    if (storage) await storage.saveProject();
  }

  async openSeasonFile() {
    const storage = this._storage();
    if (!storage) return;
    if (storage.seasonStore.constructor.supportsFS && storage.seasonStore.constructor.supportsFS()) {
      const ok = await storage.openSeasonFile();
      if (ok) this._renderAll();
    } else {
      this.fileInput?.click();   // fallback to <input type=file>
    }
  }

  show() {
    if (!this.overlayEl) return;
    // Flush the live game into the season before we read it.
    const storage = this._storage();
    if (storage) storage.commitActive();
    if (this.nameInput) {
      const st = this._store();
      this.nameInput.value = (st && st.data && st.data.seasonName) || '';
    }
    this.overlayEl.classList.remove('hidden');
    this._renderAll();
  }

  hide() {
    if (this.overlayEl) this.overlayEl.classList.add('hidden');
  }

  /** All games in the season, chronological, with the live state committed. */
  _effectiveGames() {
    const storage = this._storage();
    if (storage) storage.commitActive();
    const st = this._store();
    return st ? st.gamesChrono() : [];
  }

  _activeId() {
    const st = this._store();
    return st && st.data ? st.data.activeGameId : null;
  }

  _allPlays() {
    return this._effectiveGames().flatMap(g => g.plays || []);
  }

  /** Merge jersey#→name across every game's roster (+ live roster). */
  _mergeRoster() {
    const map = {};
    const live = (window.app && window.app.roster) ? window.app.roster.players : [];
    [...this._effectiveGames().flatMap(g => g.roster || []), ...live].forEach(p => {
      if (p && p.num != null && p.name) map[String(p.num)] = p.name;
    });
    return map;
  }

  _renderAll() {
    this._renderGameList();
    this._renderStats();
  }

  _renderGameList() {
    const list = document.getElementById('seasonGameList');
    if (!list) return;

    const games = this._effectiveGames();
    const activeId = this._activeId();
    if (!games.length) {
      list.innerHTML = '<div class="season-empty">No games yet. Click "+ New Game" to start tagging, or "Import Game" to bring in a saved file.</div>';
      return;
    }

    list.innerHTML = '';
    games.forEach((g, idx) => {
      const isActive = g.id === activeId;
      const row = document.createElement('div');
      row.className = 'season-game-row' + (isActive ? ' season-game-current' : '');
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
      const label = g.name || this._store().gameName(g, idx);
      const activeTag = isActive ? '<span class="season-current-tag" title="The game you have open">active</span>' : '';
      row.innerHTML = `
        <div class="season-game-info" data-action="switch">
          <div class="season-game-name">Game ${idx + 1}: ${this._escape(label)} ${scoreLabel} ${activeTag}</div>
          <div class="season-game-meta">${(g.plays || []).length} plays${date ? ' · ' + this._escape(date) : ''}${isActive ? '' : ' · click to open'}</div>
        </div>
        <button class="btn btn-sm btn-danger" data-action="remove" title="Remove this game from the season">×</button>
      `;
      row.querySelector('[data-action=switch]')?.addEventListener('click', () => {
        if (!isActive) this.switchGame(g.id);
      });
      row.querySelector('[data-action=remove]')?.addEventListener('click', async (ev) => {
        ev.stopPropagation();
        const ok = await this._confirm(`Remove "Game ${idx + 1}: ${label}" from the season?`);
        if (ok) this.removeGame(g.id);
      });
      list.appendChild(row);
    });
  }

  /** Lightweight confirm that reuses the tagger's in-app modal when available. */
  async _confirm(msg) {
    const t = window.app && window.app.tagger;
    if (t && t._confirmDialog) return t._confirmDialog(msg, 'Remove');
    return confirm(msg);
  }

  _renderStats() {
    const body = document.getElementById('seasonStatsBody');
    if (!body) return;

    const games = this._effectiveGames();
    if (!games.length) {
      body.innerHTML = '<div class="season-empty-stats">Load a game in the app, or add past games above, to see season-wide stats, trends, and a self-scout report.</div>';
      return;
    }

    const allPlays = this._allPlays();
    const stats = this.statsEngine.compute(allPlays);

    // Provide merged player names for the season roll-up, then clear.
    this.statsEngine._seasonLabels = this._mergeRoster();
    const indTables = this.statsEngine._renderIndividualStats(stats);
    const individual = indTables ? `
      <div class="stats-section"><h3>Season Player Roll-Up</h3>
      <p class="self-scout-intro">Per-player totals across all ${games.length} loaded games.</p></div>
      ${indTables}` : '';

    body.innerHTML = `
      ${this._renderHeader(stats)}
      ${this._renderProgression()}
      ${this._renderTrends()}
      ${this.statsEngine._renderTeamStats(stats)}
      ${this.statsEngine._renderEfficiency(stats)}
      ${this.statsEngine.heatMaps.render(allPlays)}
      ${this.statsEngine._renderDownAnalysis(stats)}
      ${this.statsEngine._renderSituational(stats)}
      ${this.statsEngine._renderTendencies(stats)}
      ${this.statsEngine._renderPersonnel(stats)}
      ${individual}
      ${this._renderPerGameTable()}
      ${this._renderSelfScout()}
    `;
    this.statsEngine._seasonLabels = null;

    this.statsEngine.heatMaps.bind(body);
  }

  _renderHeader(stats) {
    const games = this._effectiveGames();
    let wins = 0, losses = 0, ties = 0, ptsFor = 0, ptsAgainst = 0;
    for (const g of games) {
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
        <div class="ss-stat"><div class="ss-num">${games.length}</div><div class="ss-lbl">Games</div></div>
        ${(wins + losses + ties) ? `<div class="ss-stat"><div class="ss-num">${recordStr}</div><div class="ss-lbl">Record</div></div>` : ''}
        <div class="ss-stat"><div class="ss-num">${stats.totalPlays}</div><div class="ss-lbl">Plays</div></div>
        <div class="ss-stat"><div class="ss-num">${stats.rushing.yards + stats.passing.yards}</div><div class="ss-lbl">Total Yds</div></div>
        ${(ptsFor || ptsAgainst) ? `<div class="ss-stat"><div class="ss-num">${ptsFor}-${ptsAgainst}</div><div class="ss-lbl">Pts For-Against</div></div>` : ''}
        <div class="ss-stat"><div class="ss-num">${stats.efficiency.successRate}%</div><div class="ss-lbl">Success</div></div>
      </div>
    `;
  }

  /**
   * Season progression — "what are we getting better/worse at?" Splits the
   * chronological games into the first vs. second half of the season and
   * compares key metrics, flagging each as improving / declining / steady.
   */
  _renderProgression() {
    const games = this._effectiveGames().filter(g => (g.plays || []).length);
    if (games.length < 2) return '';

    const per = games.map(g => this.statsEngine.compute(g.plays));
    const metrics = [
      { label: 'Success Rate', better: 'up', eps: 2, fmt: v => v.toFixed(0) + '%',
        get: s => parseFloat(s.efficiency?.successRate) || 0 },
      { label: 'Yards / Play', better: 'up', eps: 0.3, fmt: v => v.toFixed(2),
        get: s => { const p = s.totalPlays || 0; return p ? ((s.rushing.yards + s.passing.yards) / p) : 0; } },
      { label: '3rd Down %', better: 'up', eps: 3, fmt: v => v.toFixed(0) + '%',
        get: s => parseFloat(s.downs?.thirdDownPct) || 0 },
      { label: 'TDs / Game', better: 'up', eps: 0.3, fmt: v => v.toFixed(1),
        get: s => s.scoring?.touchdowns || 0 },
      { label: 'Turnovers / Game', better: 'down', eps: 0.3, fmt: v => v.toFixed(1),
        get: s => s.turnovers?.total || 0 },
    ];

    const mid = Math.floor(per.length / 2);
    const early = per.slice(0, mid);
    const late = per.slice(mid);
    const avg = (arr, get) => arr.length ? arr.reduce((s, x) => s + get(x), 0) / arr.length : 0;

    const cards = metrics.map(m => {
      const e = avg(early, m.get), l = avg(late, m.get);
      const delta = l - e;
      let dir = 'flat', good = null;
      if (Math.abs(delta) >= m.eps) { dir = delta > 0 ? 'up' : 'down'; good = (dir === 'up') === (m.better === 'up'); }
      const cls = good === null ? 'flat' : (good ? 'better' : 'worse');
      const arrow = dir === 'flat' ? '→' : (dir === 'up' ? '↑' : '↓');
      const word = good === null ? 'Steady' : (good ? 'Improving' : 'Slipping');
      return `
        <div class="prog-card prog-${cls}">
          <div class="prog-metric">${m.label}</div>
          <div class="prog-vals">${m.fmt(e)} <span class="prog-arrow">${arrow}</span> ${m.fmt(l)}</div>
          <div class="prog-tag">${word}</div>
        </div>`;
    }).join('');

    const ups = metrics.filter(m => { const d = avg(late, m.get) - avg(early, m.get); return Math.abs(d) >= m.eps && ((d > 0) === (m.better === 'up')); }).map(m => m.label);
    const downs = metrics.filter(m => { const d = avg(late, m.get) - avg(early, m.get); return Math.abs(d) >= m.eps && ((d > 0) !== (m.better === 'up')); }).map(m => m.label);
    let headline = '';
    if (ups.length || downs.length) {
      const parts = [];
      if (ups.length) parts.push(`<b class="prog-up">Getting better:</b> ${ups.join(', ')}`);
      if (downs.length) parts.push(`<b class="prog-down">Needs work:</b> ${downs.join(', ')}`);
      headline = `<p class="prog-headline">${parts.join(' &nbsp;·&nbsp; ')}</p>`;
    }

    return `
      <div class="stats-section">
        <h3>Season Progression</h3>
        <p class="self-scout-intro">First half of the season vs. the second half — where the team is trending.</p>
        ${headline}
        <div class="prog-grid">${cards}</div>
      </div>`;
  }

  _renderTrends() {
    const games = this._effectiveGames();
    if (games.length < 2) return '';

    const perGame = games.map(g => {
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
    for (const g of this._effectiveGames()) {
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

    // Formation tendencies. Formation is multi-select ("Pistol + Spread"),
    // so a play is attributed to each of its component looks.
    const formMap = {};
    allPlays.forEach(p => {
      const isRun = this._isRun(p);
      String(p.tags.formation || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean).forEach(f => {
        if (!formMap[f]) formMap[f] = { total: 0, runs: 0 };
        formMap[f].total++;
        if (isRun) formMap[f].runs++;
      });
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
    const thirdLongPass = thirdLong.filter(p => !this._isRun(p)).length;
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
      if (this._isRun(p)) hashMap[h].runs++;
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
    const games = this._effectiveGames();
    if (!games.length) return;
    const allPlays = this._allPlays();
    const stats = this.statsEngine.compute(allPlays);
    const st = this._store();
    const seasonName = (st && st.data && st.data.seasonName) || '';
    const title = seasonName ? `${seasonName} — Season Report` : `Season Report — ${games.length} games`;

    this.statsEngine._seasonLabels = this._mergeRoster();
    const indTables = this.statsEngine._renderIndividualStats(stats);
    const individual = indTables ? `<div class="stats-section"><h3>Season Player Roll-Up</h3></div>${indTables}` : '';
    const body = [
      this._renderHeader(stats),
      this._renderProgression(),
      this._renderTrends(),
      this.statsEngine._renderTeamStats(stats),
      this.statsEngine._renderEfficiency(stats),
      this.statsEngine._renderDownAnalysis(stats),
      this.statsEngine._renderSituational(stats),
      this.statsEngine._renderTendencies(stats),
      this.statsEngine._renderPersonnel(stats),
      individual,
      this._renderPerGameTable(),
      this._renderSelfScout()
    ].join('\n');
    this.statsEngine._seasonLabels = null;

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
.prog-headline{font-size:13px;margin:4px 0 10px}
.prog-headline .prog-up{color:#1f9d4d}.prog-headline .prog-down{color:#d23b3b}
.prog-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:10px}
.prog-card{border:1px solid #ddd;border-left:4px solid #999;border-radius:6px;padding:10px 12px;background:#f9f9fb}
.prog-card.prog-better{border-left-color:#1f9d4d}.prog-card.prog-worse{border-left-color:#d23b3b}.prog-card.prog-flat{border-left-color:#999}
.prog-metric{font-size:11px;text-transform:uppercase;color:#666}
.prog-vals{font-size:18px;font-weight:bold;margin:3px 0}
.prog-arrow{margin:0 2px}
.prog-tag{font-size:11px;font-weight:bold}
.prog-card.prog-better .prog-tag{color:#1f9d4d}.prog-card.prog-worse .prog-tag{color:#d23b3b}.prog-card.prog-flat .prog-tag{color:#888}
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

  // Run/pass classification: explicit runPass tag wins, else infer from playType.
  _isRun(p) {
    const rp = p.tags && p.tags.runPass;
    if (rp === 'Run') return true;
    if (rp === 'Pass') return false;
    return !!(p.tags && p.tags.playType && p.tags.playType.toLowerCase().includes('run'));
  }
}
