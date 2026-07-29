/**
 * SeasonManager - season-wide analytics composition.
 *
 * The project IS the season (see season-store.js). Native Reports consumes this
 * renderer for aggregate stats and progression; Team Hub and Home own season and
 * game management. It owns no game data of its own.
 */
import { Charts } from './charts.js';

export class SeasonManager {
  constructor(statsEngine) {
    this.statsEngine = statsEngine;
  }

  /** The canonical season store (lives on StorageManager). */
  _store() { return window.app && window.app.storage && window.app.storage.seasonStore; }
  _storage() { return window.app && window.app.storage; }

  /** All games in chronological order with a read-only projection of live edits. */
  _effectiveGames() {
    const storage = this._storage();
    const st = this._store();
    if (!st) return [];
    const games = st.gamesChrono();
    const active = st.activeGame();
    if (!active || storage?._loadedGameId !== st.data.activeGameId || typeof storage?._serialize !== 'function') return games;

    // Reports must include edits still living in the active tagger without
    // calling commitActive(): opening a view is not permission to rewrite the
    // canonical game node. Mirror SeasonStore.updateActiveGame's presentation
    // fields on an ephemeral object only.
    const live = storage._serialize();
    live.id = active.id;
    live.name = st.gameName(live, st.activeIndex());
    live.status = live.status || active.status || 'active';
    if (active.filmMode && !live.filmMode) {
      live.filmMode = active.filmMode;
      live.filmDir = active.filmDir;
    }
    return games.map(game => String(game.id) === String(active.id) ? live : game);
  }

  _allPlays() {
    // Stamp each play with its game's chronological index so order-sensitive
    // stats (drive reconstruction) can keep games separate — every game's
    // video clock starts at 0, so a plain timestamp sort would interleave
    // plays across games and merge drives over game boundaries.
    // Non-enumerable: JSON.stringify (persist/save/export) never sees it.
    return this._effectiveGames().flatMap((g, gi) =>
      (g.plays || []).map(p => {
        Object.defineProperty(p, '__seasonGameIdx',
          { value: gi, configurable: true, writable: true, enumerable: false });
        return p;
      }));
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

  /** Season stats composed for the native Reports Season tab. */
  statsHtml() {
    const games = this._effectiveGames();
    if (!games.length) {
      return '<div class="season-empty-stats">Load a game in the app, or add past games above, to see season-wide stats, trends, and a self-scout report.</div>';
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

    // The season view is 13 sections deep — too long to scroll. Group them into
    // secondary sub-tabs (Overview / Breakdown / Players / Self-Scout) under the
    // always-visible KPI header. Panes stay in the DOM (CSS show/hide), so the
    // heat-map binding + leaderboard sort-wiring done once by the caller still
    // apply. StatsEngine._wireSubtabs() activates the nav; the dashboard tab and
    // the legacy modal both call it after injecting this HTML.
    const html = `
      ${this._renderHeader(stats)}
      <div class="gi-subnav" role="tablist">
        <button class="gi-subtab active" data-subtab="overview" role="tab">Overview</button>
        <button class="gi-subtab" data-subtab="breakdown" role="tab">Breakdown</button>
        <button class="gi-subtab" data-subtab="players" role="tab">Players</button>
        <button class="gi-subtab" data-subtab="scout" role="tab">Self-Scout</button>
      </div>
      <div class="gi-subpane active" data-subpane="overview">
        ${this.statsEngine._renderTeamStats(stats)}
        ${this.statsEngine._renderEfficiency(stats)}
        ${this._renderSituationalScorecard(stats)}
        ${this._renderTurnoverScoring(stats)}
        ${this._renderProgression()}
        ${this._renderTrends()}
      </div>
      <div class="gi-subpane" data-subpane="breakdown">
        ${this._renderOffensiveIdentity(stats)}
        ${this.statsEngine._renderDownAnalysis(stats)}
        ${this.statsEngine._renderSituational(stats)}
        ${this.statsEngine._renderTendencies(stats)}
        ${this.statsEngine._renderPersonnel(stats)}
        ${this.statsEngine.heatMaps.render(allPlays)}
      </div>
      <div class="gi-subpane" data-subpane="players">
        ${this._renderWinLossSplits()}
        ${individual}
        ${this._renderPerGameTable()}
      </div>
      <div class="gi-subpane" data-subpane="scout">
        ${this._renderSelfScout()}
      </div>
    `;
    this.statsEngine._seasonLabels = null;
    return html;
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
    // Skip games with no tagged plays (untagged/future games would otherwise
    // plot as a misleading dip to zero); matches _renderProgression's filter.
    const games = this._effectiveGames().filter(g => (g.plays || []).length);
    if (games.length < 2) return '';

    const store = window.app?.storage?.seasonStore;
    const perGame = games.map((g, i) => {
      const stats = this.statsEngine.compute(g.plays);
      return {
        name: g.name || (store ? store.gameName(g, i) : `Game ${i + 1}`),
        yards: stats.rushing.yards + stats.passing.yards,
        successPct: parseFloat(stats.efficiency.successRate),
        tos: stats.turnovers.total,
        tds: stats.scoring.touchdowns
      };
    });

    const series = (key) => perGame.map(g => ({ label: g.name, value: g[key] }));
    return `
      <div class="stats-section">
        <h3>Game-by-Game Trends</h3>
        <div class="gi-trend-grid">
          ${Charts.trendLine(series('yards'), { title: 'Total Yards', color: '#3D7BFD', goodUp: true })}
          ${Charts.trendLine(series('successPct'), { title: 'Success Rate', color: '#34D399', fmt: v => Math.round(v) + '%', goodUp: true })}
          ${Charts.trendLine(series('tds'), { title: 'Touchdowns', color: '#FBBF24', goodUp: true })}
          ${Charts.trendLine(series('tos'), { title: 'Turnovers', color: '#F87171', goodUp: false })}
        </div>
      </div>
    `;
  }

  _renderPerGameTable() {
    let rows = '';
    const store = window.app?.storage?.seasonStore;
    let gi = 0;
    for (const g of this._effectiveGames()) {
      const s = this.statsEngine.compute(g.plays);
      const label = g.name || (store ? store.gameName(g, gi) : `Game ${gi + 1}`);
      gi++;
      const m = this._toMargin(s);
      const toStr = m.margin > 0 ? `+${m.margin}` : `${m.margin}`;
      const toCls = m.margin > 0 ? 'gi-wl-w' : m.margin < 0 ? 'gi-wl-l' : '';
      rows += `<tr>
        <td>${this._escape(label)}</td>
        <td>${s.totalPlays}</td>
        <td>${s.rushing.yards + s.passing.yards}</td>
        <td>${s.rushing.attempts}/${s.rushing.yards}</td>
        <td>${s.passing.completions}/${s.passing.attempts}/${s.passing.yards}</td>
        <td>${s.scoring.touchdowns}</td>
        <td class="${toCls}">${toStr}</td>
        <td>${s.drives.pointsPerDrive}</td>
        <td>${s.efficiency.successRate}%</td>
        <td>${s.downs.thirdDownPct}%</td>
      </tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Per-Game Box Score</h3>
        <div class="hm-scroll">
          <table class="stats-table stats-table-full">
            <thead><tr><th>Game</th><th>Plays</th><th>Yds</th><th>Rush A/Y</th><th>Pass C/A/Y</th><th>TD</th><th title="Turnover margin (forced − lost)">TO±</th><th title="Points per drive">PPD</th><th>Succ%</th><th>3rd%</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ---- Season analytics (v1.10.2) — aggregate the existing per-game
  //      compute() output into the season views a coach game-plans from.

  /** Turnover margin for a compute() result: takeaways (our defense's INTs +
   *  fumble recoveries) − giveaways (our offense's turnovers). */
  _toMargin(s) {
    const giveaways = (s.turnovers && s.turnovers.total) || 0;
    const takeaways = s.defensive ? ((s.defensive.interceptions || 0) + (s.defensive.fumbles || 0)) : 0;
    return { margin: takeaways - giveaways, takeaways, giveaways };
  }

  _scTile(label, value, sub, tone) {
    return `<div class="gi-sc-tile${tone ? ' tone-' + tone : ''}">`
      + `<div class="gi-sc-label">${this._escape(label)}</div>`
      + `<div class="gi-sc-val">${value}</div>`
      + `<div class="gi-sc-sub">${sub ? this._escape(sub) : ''}</div></div>`;
  }

  _renderSituationalScorecard(stats) {
    const d = stats.downs || {}, sit = stats.situational || {}, eff = stats.efficiency || {}, dr = stats.drives || {};
    const rz = sit.redZone || { total: 0, tds: 0 }, gl = sit.goalLine || { total: 0, tds: 0 };
    const pct = (n, den) => den ? Math.round((n / den) * 100) : 0;
    const tone = (v, good, ok) => v >= good ? 'good' : v >= ok ? 'warn' : 'bad';
    const p3 = parseFloat(d.thirdDownPct) || 0, exp = parseFloat(eff.explosivePct) || 0, ppd = parseFloat(dr.pointsPerDrive) || 0;
    const rzPct = pct(rz.tds, rz.total), toPct = pct(dr.threeAndOuts, dr.total);
    const tiles = [
      this._scTile('3rd Down', `${Math.round(p3)}%`, d.thirdDownConv || '0/0', tone(p3, 42, 33)),
      this._scTile('4th Down', `${Math.round(parseFloat(d.fourthDownPct) || 0)}%`, d.fourthDownConv || '0/0'),
      this._scTile('Red Zone TD', `${rzPct}%`, `${rz.tds}/${rz.total} trips`, rz.total ? tone(rzPct, 60, 45) : ''),
      this._scTile('Explosive', `${Math.round(exp)}%`, `${eff.explosivePlays || 0} plays`, tone(exp, 12, 8)),
      this._scTile('Pts / Drive', dr.pointsPerDrive || '0.0', `${dr.scoringDrives || 0}/${dr.total || 0} scored`, tone(ppd, 2.5, 1.5)),
      this._scTile('3-and-Out', `${toPct}%`, `${dr.threeAndOuts || 0} of ${dr.total || 0}`, dr.total ? (toPct <= 20 ? 'good' : toPct <= 30 ? 'warn' : 'bad') : ''),
    ];
    if (gl.total > 0) tiles.push(this._scTile('Goal Line', `${pct(gl.tds, gl.total)}%`, `${gl.tds}/${gl.total} TD`));
    return `<div class="stats-section"><h3>Situational Scorecard</h3>
      <p class="self-scout-intro">Season efficiency in the moments that decide games.</p>
      <div class="gi-sc-grid">${tiles.join('')}</div></div>`;
  }

  _renderTurnoverScoring(stats) {
    const m = this._toMargin(stats);
    const bq = (stats.scoreboard && stats.scoreboard.byQuarter) || {};
    const qs = ['Q1', 'Q2', 'Q3', 'Q4', 'OT'].filter(q => bq[q] && ((bq[q].us || 0) || (bq[q].them || 0)));
    const maxQ = Math.max(1, ...qs.map(q => Math.max(bq[q].us || 0, bq[q].them || 0)));
    const qRows = qs.map(q => {
      const u = bq[q].us || 0, t = bq[q].them || 0;
      return `<div class="gi-q-row"><span class="gi-q-lbl">${q}</span><div class="gi-q-bars">`
        + `<div class="gi-q-bar us" style="width:${(u / maxQ * 100).toFixed(0)}%">${u || ''}</div>`
        + `<div class="gi-q-bar them" style="width:${(t / maxQ * 100).toFixed(0)}%">${t || ''}</div>`
        + `</div></div>`;
    }).join('');
    const tone = m.margin > 0 ? 'good' : m.margin < 0 ? 'bad' : 'even';
    const marginStr = m.margin > 0 ? `+${m.margin}` : `${m.margin}`;
    return `<div class="stats-section"><h3>Turnovers &amp; Scoring</h3>
      <div class="gi-ts-grid">
        <div class="gi-ts-margin tone-${tone}">
          <div class="gi-sc-label">Turnover Margin</div>
          <div class="gi-ts-margin-val">${marginStr}</div>
          <div class="gi-sc-sub">${m.takeaways} forced · ${m.giveaways} lost</div>
        </div>
        <div class="gi-ts-quarters">
          <div class="gi-sc-label">Scoring by Quarter <span class="gi-q-key"><i class="us"></i>Us <i class="them"></i>Opp</span></div>
          ${qRows || '<div class="gi-sc-sub">Tag Quarter on scoring plays to see this.</div>'}
        </div>
      </div></div>`;
  }

  _renderOffensiveIdentity(stats) {
    const pers = (stats.personnel || []).filter(g => g.name !== 'Unknown').slice(0, 4);
    const forms = ((stats.tendencies && stats.tendencies.formationList) || []).filter(f => f.name !== 'Unknown').slice(0, 4);
    if (!pers.length && !forms.length) return '';
    const totP = (stats.personnel || []).reduce((s, g) => s + g.count, 0) || 1;
    const totF = ((stats.tendencies && stats.tendencies.formationList) || []).reduce((s, f) => s + f.count, 0) || 1;
    const bar = (p) => `<div class="gi-id-bar"><div style="width:${p}%"></div></div>`;
    const rowsFor = (arr, tot) => arr.map(x => {
      const use = Math.round(x.count / tot * 100);
      return `<div class="gi-id-row"><span class="gi-id-name">${this._escape(x.name)}</span>${bar(use)}`
        + `<span class="gi-id-use">${use}%</span><span class="gi-id-succ">${x.successPct}%</span></div>`;
    }).join('');
    return `<div class="stats-section"><h3>Offensive Identity</h3>
      <p class="self-scout-intro">What your offense actually is, season-wide — usage and how it's working.</p>
      <div class="gi-id-grid">
        <div class="gi-id-col"><div class="gi-id-head">Personnel <span>use · succ</span></div>${rowsFor(pers, totP) || '<div class="gi-sc-sub">No personnel tagged.</div>'}</div>
        <div class="gi-id-col"><div class="gi-id-head">Formation <span>use · succ</span></div>${rowsFor(forms, totF) || '<div class="gi-sc-sub">No formations tagged.</div>'}</div>
      </div></div>`;
  }

  _renderWinLossSplits() {
    const games = this._effectiveGames().filter(g => (g.plays || []).length);
    const wins = [], losses = [];
    for (const g of games) {
      const gi = g.gameInfo || {};
      const u = parseInt(gi.scoreUs, 10), t = parseInt(gi.scoreThem, 10);
      if (!Number.isFinite(u) || !Number.isFinite(t)) continue;
      if (u > t) wins.push(g); else if (u < t) losses.push(g);
    }
    if (!wins.length || !losses.length) return '';   // need both sides to compare
    const agg = (gs) => {
      const s = this.statsEngine.compute(gs.flatMap(g => g.plays || []));
      const m = this._toMargin(s);
      return {
        ypp: s.totalPlays ? ((s.rushing.yards + s.passing.yards) / s.totalPlays).toFixed(1) : '0.0',
        succ: s.efficiency.successRate, third: s.downs.thirdDownPct, ppd: s.drives.pointsPerDrive, toM: m.margin,
      };
    };
    const w = agg(wins), l = agg(losses), sign = v => v > 0 ? `+${v}` : `${v}`;
    const row = (label, wv, lv) => `<tr><td>${label}</td><td>${wv}</td><td>${lv}</td></tr>`;
    return `<div class="stats-section"><h3>Wins vs Losses</h3>
      <p class="self-scout-intro">Where games are won and lost — the offense across ${wins.length} win${wins.length > 1 ? 's' : ''} vs ${losses.length} loss${losses.length > 1 ? 'es' : ''}.</p>
      <table class="stats-table gi-wl-table"><thead><tr><th></th><th>Wins</th><th>Losses</th></tr></thead><tbody>
        ${row('Yards / Play', w.ypp, l.ypp)}
        ${row('Success %', w.succ + '%', l.succ + '%')}
        ${row('3rd Down %', w.third + '%', l.third + '%')}
        ${row('Pts / Drive', w.ppd, l.ppd)}
        ${row('Turnover Margin', sign(w.toM), sign(l.toM))}
      </tbody></table></div>`;
  }

  _renderSelfScout() {
    // Thin view over StatsEngine's canonical self-scout — single source of
    // truth for run/pass classification, lean thresholds, and min-sample
    // gates (previously duplicated here with its own _isRun and cutoffs).
    const report = this.statsEngine.generateSelfScout(
      this._allPlays().filter(p => p.tags));
    if (!report) {
      return `
        <div class="stats-section">
          <h3>Self-Scout Report</h3>
          <p class="self-scout-intro">Tag Run/Pass on your offensive plays to see what an opponent watching your film would key on.</p>
        </div>
      `;
    }

    const vIcon = v => v === 'dominant' ? '▲' : v === 'effective' ? '▬' : '▼';
    const vLabel = v => v === 'dominant' ? 'Dominant' : v === 'effective' ? 'Effective' : 'Exploitable';
    let flags = report.tells.map(t => {
      const ctx = t.verdict === 'dominant'
        ? `working at ${t.leanAvg} yds/${t.leanSuccRate}% success — keep riding it`
        : t.verdict === 'effective'
          ? `productive (${t.leanAvg} yds/${t.leanSuccRate}% succ) but a DC will see it`
          : `underperforming at ${t.leanAvg} yds/${t.leanSuccRate}% success — mix it up`;
      return `<li class="ss-v-${t.verdict}"><b>${this._escape(t.label)}</b>: ${t.lean.toLowerCase()} ${t.leanPct}% (${t.n} plays) — <span class="ss-verdict-tag ${t.verdict}">${vIcon(t.verdict)} ${vLabel(t.verdict)}</span> ${ctx}</li>`;
    }).join('');
    if (!flags) flags = '<li class="ok">No strong tells detected at the current sample size — your run/pass mix is well balanced.</li>';

    // Defensive scheme tells (front/coverage/blitz leans by situation) —
    // same data as the Self-Scout overlay's defensive section.
    let defBlock = '';
    const ds = report.defScout;
    if (ds && !ds.insufficient && ds.tells.length) {
      const defFlags = ds.tells.map(t => {
        const ctx = t.verdict === 'dominant'
          ? `working (${t.stopRate}% stops) — fine to lean on`
          : `only ${t.stopRate}% stops — an OC will attack it`;
        return `<li class="ss-v-${t.verdict}"><b>${this._escape(t.label)}</b>: ${this._escape(t.tellVal)} ${t.tellPct}% of the time (${t.n} plays) — <span class="ss-verdict-tag ${t.verdict}">${vIcon(t.verdict)} ${vLabel(t.verdict)}</span> ${ctx}</li>`;
      }).join('');
      defBlock = `
        <p class="self-scout-intro" style="margin-top:14px"><b>Your defense</b> — scheme tells an opposing OC would key on (${ds.totalPlays} defensive plays, predictability ${ds.predictability}/100):</p>
        <ul class="self-scout">${defFlags}</ul>`;
    } else if (ds && ds.insufficient && ds.defPlays > 0) {
      defBlock = `
        <p class="self-scout-intro" style="margin-top:14px"><b>Your defense</b>: ${ds.defPlays} defensive play${ds.defPlays === 1 ? '' : 's'} tagged, but only ${ds.schemePlays} with Def Front / Coverage / Blitz — tag at least 6 with scheme fields to see what your calls are tipping.</p>`;
    }

    return `
      <div class="stats-section">
        <h3>Self-Scout Report</h3>
        <p class="self-scout-intro">Predictability <b>${report.predictability}/100</b> (${report.predLabel}) across ${report.totalPlays} run/pass plays. What an opponent watching your film would notice:</p>
        <ul class="self-scout">${flags}</ul>
        ${defBlock}
      </div>
    `;
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}
