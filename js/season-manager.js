/**
 * SeasonManager - season-wide analytics composition.
 *
 * The project IS the season (see season-store.js). Native Reports consumes this
 * renderer for aggregate stats and progression; Team Hub and Home own season and
 * game management. It owns no game data of its own.
 */
import { Charts } from './charts.js';
// H16 — the season Offense pane renders the same field-zone / spray / quarter
// visuals the game Offense tab does. They were computed for every play in the
// season already; nothing rendered them above game scope.
import { Visualizations } from './visualizations.js';
import { buildSeasonHtmlReport } from './html-report.js';

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
        // H16 — also stamp the OWNING GAME ID, same non-enumerable contract.
        // Season rows previously had no way to name their film: every cut row
        // resolved through StatsEngine._watchPlays, which rebuilds its pool from
        // the ACTIVE game's tagger. A season row therefore showed a season-wide
        // count and played only the active game's matching snaps. With the game
        // id present, a season row can carry real `gameId::playId` composite
        // refs and route through the proven cross-game player instead.
        Object.defineProperty(p, '__gid',
          { value: g.id, configurable: true, writable: true, enumerable: false });
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

  /** One structured owner for every season-report presentation. The native
   * Reports tab and retained standalone HTML export must consume this same
   * stamped cohort rather than independently rebuilding season scope. */
  reportModel() {
    const games = this._effectiveGames();
    const allPlays = games.length ? this._allPlays() : [];
    const stats = games.length ? this.statsEngine.compute(allPlays) : null;
    const gameLabels = Object.fromEntries(games.map((game, index) => [String(game.id), game.name || `Game ${index + 1}`]));
    if (!stats) return { games, allPlays, stats: null, rosterLabels: this._mergeRoster(), gameLabels };
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
    games.forEach(game => {
      const us = parseInt(game.gameInfo?.scoreUs, 10), them = parseInt(game.gameInfo?.scoreThem, 10);
      if (!Number.isFinite(us) || !Number.isFinite(them)) return;
      pointsFor += us; pointsAgainst += them;
      if (us > them) wins++; else if (us < them) losses++; else ties++;
    });
    const played = games.filter(game => (game.plays || []).length);
    const perGame = played.map((game, index) => {
      const gameStats = this.statsEngine.compute(game.plays || []);
      const margin = this._toMargin(gameStats);
      return { id:String(game.id), name:gameLabels[String(game.id)] || `Game ${index + 1}`, plays:gameStats.totalPlays,
        yards:gameStats.rushing.yards + gameStats.passing.yards, rush:`${gameStats.rushing.attempts}/${gameStats.rushing.yards}`,
        pass:`${gameStats.passing.completions}/${gameStats.passing.attempts}/${gameStats.passing.yards}`,
        touchdowns:gameStats.scoring.touchdowns, turnoverMargin:margin.margin, pointsPerDrive:gameStats.drives.pointsPerDrive,
        successRate:Number(gameStats.efficiency.successRate), thirdDown:Number(gameStats.downs.thirdDownPct), stats:gameStats };
    });
    const half = Math.floor(perGame.length / 2), early = perGame.slice(0, half), late = perGame.slice(half);
    const metricSpecs = [
      ['Success Rate','up',2,v=>v.successRate,v=>`${v.toFixed(0)}%`], ['Yards / Play','up',0.3,v=>v.plays?v.yards/v.plays:0,v=>v.toFixed(2)],
      ['3rd Down %','up',3,v=>v.thirdDown,v=>`${v.toFixed(0)}%`], ['TDs / Game','up',0.3,v=>v.touchdowns,v=>v.toFixed(1)],
      ['Turnovers / Game','down',0.3,v=>v.stats.turnovers.total,v=>v.toFixed(1)],
    ];
    const avg = (rows, get) => rows.length ? rows.reduce((sum,row)=>sum+get(row),0)/rows.length : 0;
    const progression = perGame.length < 2 ? [] : metricSpecs.map(([label,better,epsilon,get,format]) => {
      const from=avg(early,get), to=avg(late,get), delta=to-from;
      const direction=Math.abs(delta)<epsilon?'flat':delta>0?'up':'down';
      const good=direction==='flat'?null:(direction==='up')===(better==='up');
      return { label, from:format(from), to:format(to), direction, verdict:good===null?'Steady':good?'Improving':'Slipping' };
    });
    const aggregate = rows => {
      const merged = this.statsEngine.compute(rows.flatMap(row => games.find(game => String(game.id)===row.id)?.plays || []));
      const margin=this._toMargin(merged); return { ypp:merged.totalPlays?((merged.rushing.yards+merged.passing.yards)/merged.totalPlays).toFixed(1):'0.0', success:`${merged.efficiency.successRate}%`, third:`${merged.downs.thirdDownPct}%`, ppd:merged.drives.pointsPerDrive, margin:margin.margin };
    };
    const winRows=perGame.filter(row=>{const game=games.find(item=>String(item.id)===row.id);return Number(game?.gameInfo?.scoreUs)>Number(game?.gameInfo?.scoreThem);});
    const lossRows=perGame.filter(row=>{const game=games.find(item=>String(item.id)===row.id);return Number(game?.gameInfo?.scoreUs)<Number(game?.gameInfo?.scoreThem);});
    const pct=(n,total)=>total?Math.round(n/total*100):0;
    const tone=(value,good,ok)=>value>=good?'good':value>=ok?'warn':'bad';
    const situational=(()=>{const d=stats.downs||{},sit=stats.situational||{},eff=stats.efficiency||{},dr=stats.drives||{};
      const rz=sit.redZone||{total:0,tds:0},gl=sit.goalLine||{total:0,tds:0};
      const p3=Number(d.thirdDownPct)||0,exp=Number(eff.explosivePct)||0,ppd=Number(dr.pointsPerDrive)||0,toPct=pct(dr.threeAndOuts,dr.total);
      const rows=[
        {label:'3rd Down',value:`${Math.round(p3)}%`,sub:d.thirdDownConv||'0/0',tone:tone(p3,42,33)},
        {label:'4th Down',value:`${Math.round(Number(d.fourthDownPct)||0)}%`,sub:d.fourthDownConv||'0/0'},
        {label:'Red Zone TD',value:`${pct(rz.tds,rz.total)}%`,sub:`${rz.tds}/${rz.total} trips`,tone:rz.total?tone(pct(rz.tds,rz.total),60,45):''},
        {label:'Explosive',value:`${Math.round(exp)}%`,sub:`${eff.explosivePlays||0} plays`,tone:tone(exp,12,8)},
        {label:'Pts / Drive',value:dr.pointsPerDrive||'0.0',sub:`${dr.scoringDrives||0}/${dr.total||0} scored`,tone:tone(ppd,2.5,1.5)},
        {label:'3-and-Out',value:`${toPct}%`,sub:`${dr.threeAndOuts||0} of ${dr.total||0}`,tone:dr.total?(toPct<=20?'good':toPct<=30?'warn':'bad'):''},
      ];
      if(gl.total>0)rows.push({label:'Goal Line',value:`${pct(gl.tds,gl.total)}%`,sub:`${gl.tds}/${gl.total} TD`});
      return rows;
    })();
    const turnoverScoring=(()=>{const margin=this._toMargin(stats),byQuarter=stats.scoreboard?.byQuarter||{};
      const quarters=['Q1','Q2','Q3','Q4','OT'].filter(q=>byQuarter[q]&&((byQuarter[q].us||0)||(byQuarter[q].them||0))).map(q=>({quarter:q,us:byQuarter[q].us||0,them:byQuarter[q].them||0}));
      return {margin:margin.margin,takeaways:margin.takeaways,giveaways:margin.giveaways,unresolved:margin.unresolved,quarters};
    })();
    const identityGroup=(items,total)=>items.filter(item=>item.name!=='Unknown').slice(0,4).map(item=>({name:item.name,count:item.count,use:Math.round(item.count/(total||1)*100),success:item.successPct}));
    const personnel=stats.personnel||[],formations=stats.tendencies?.formationList||[];
    const offensiveIdentity={personnel:identityGroup(personnel,personnel.reduce((sum,item)=>sum+item.count,0)),formations:identityGroup(formations,formations.reduce((sum,item)=>sum+item.count,0))};
    return { games, allPlays, stats, rosterLabels:this._mergeRoster(), gameLabels, perGame, progression,
      summary:{ games:games.length, record:ties?`${wins}-${losses}-${ties}`:`${wins}-${losses}`, played:wins+losses+ties, pointsFor, pointsAgainst },
      winLoss:winRows.length&&lossRows.length?{wins:aggregate(winRows),losses:aggregate(lossRows),winCount:winRows.length,lossCount:lossRows.length}:null,
      defenseReport:this.statsEngine.defensivePerformance(allPlays,gameLabels), defScout:this.statsEngine.generateDefensiveSelfScout(allPlays),
      specialSummary:this.statsEngine._specialTeamsSummary(allPlays,stats), selfScout:this.statsEngine.generateSelfScout(allPlays),
      situational, turnoverScoring, offensiveIdentity,
      callRows:this.statsEngine._selfScoutRows(this.statsEngine._selfScoutGroup(stats.offPlays, play=>play.tags.playCall||play.tags.playConcept||null)),
    };
  }

  /** Season stats composed for the native Reports Season tab. */
  statsHtml() {
    const model = this.reportModel();
    const { games, allPlays, stats } = model;
    if (!games.length) {
      return '<div class="season-empty-stats">Load a game in the app, or add past games above, to see season-wide stats, trends, and a self-scout report.</div>';
    }

    // Provide merged player names for the season roll-up, then clear.
    this.statsEngine._seasonLabels = model.rosterLabels;
    const indTables = this.statsEngine._renderIndividualStats(stats);
    const individual = indTables ? `
      <div class="stats-section"><h3>Season Player Roll-Up</h3>
      <p class="self-scout-intro">Per-player totals across all ${games.length} loaded games.</p></div>
      ${indTables}` : '';

    // ── H16 — THE SEASON REPORT IS COMPOSED FROM THE GAME REPORT'S BLOCK SET ──
    //
    // What this replaces, and why it mattered. compute() has always aggregated
    // every play in the season correctly; the VIEW was a hand-maintained list of
    // 16 render calls that never grew as the game report did. So the Big 13, the
    // shape visuals, EPA, Drives, Negative Plays, the takeaway board, penalties
    // and the ENTIRE Defense and Special Teams reports were computed at season
    // scope and then not rendered. A coach could read his defensive front data
    // for one game and had no way to see it across six.
    //
    // The block set below is the same one reports-screen.js renders per game, in
    // the same order, with ONE explicit exception list. Anything a future tab
    // gains has to be added here too — that coupling is the point: a hardcoded
    // subset silently rots, an explicit exception list has to be argued with.
    //
    // EXCLUDED AT SEASON SCOPE, each for a stated reason:
    //   _renderGameHeader / scoreboard — game identity. A single scoreline
    //     cannot describe six games; _renderHeader is the season's own answer.
    //   _renderGameFlow / _renderDriveChart — both plot progress against a
    //     within-game play index. Concatenating six games onto one axis draws a
    //     line whose x-axis means nothing.
    //   _renderTeamProfile (radar) — its axes scale against the season's own
    //     best, so at season scope every axis pegs to itself. Excluded for free:
    //     _renderBigTwelve only draws it under { cut: true }.
    const s = this.statsEngine;
    const defScout = s.generateDefensiveSelfScout(allPlays);
    // S7-d1: gameInfo was already preferred here; the #gameTeamName fallback
    // was dead weight pointing at markup S7-d8 deletes.
    const teamName = window.app?.gameContext?.snapshot?.().teamName || 'Our Offense';

    const html = `
      ${this._renderHeader(stats)}
      <div class="gi-subnav" role="tablist">
        <button class="gi-subtab active" data-subtab="overview" role="tab">Overview</button>
        <button class="gi-subtab" data-subtab="offense" role="tab">Offense</button>
        <button class="gi-subtab" data-subtab="defense" role="tab">Defense</button>
        <button class="gi-subtab" data-subtab="special" role="tab">Special Teams</button>
        <button class="gi-subtab" data-subtab="players" role="tab">Players</button>
        <button class="gi-subtab" data-subtab="scout" role="tab">Self-Scout</button>
        <button class="gi-subtab" data-subtab="trends" role="tab">Trends</button>
      </div>
      <div class="gi-subpane active" data-subpane="overview">
        ${s._renderTeamStats(stats)}
        ${s._renderLensBoard(stats)}
        ${s._renderTakeaways(stats)}
        ${s._renderDownAnalysis(stats)}
        ${/* Mirrors the game-scope Overview composition in reports-screen.js
              (see its comment there for the full history): no fixed pairing
              of Drives against any other section survived real data without
              leaving a visible empty rectangle under the shorter one. Every
              section runs full width instead. */''}
        ${s._renderDrives(stats)}
        ${s._renderEfficiency(stats)}
        ${s._renderByDownPanel(stats)}
        ${s._renderBigPlays(stats)}
        ${this._renderSituationalScorecard(stats)}
        ${this._renderTurnoverScoring(stats)}
        ${s._renderPenalties(stats)}
      </div>
      <div class="gi-subpane" data-subpane="offense">
        ${this._renderOffensiveIdentity(stats)}
        ${s._renderOffenseHero(stats)}
        ${s._renderShape(stats, { profile: false })}
        ${s._renderPlayAction(stats)}
        ${s._renderTendencies(stats)}
        ${s._renderBigTwelve(stats.offPlays, teamName, { cut: false })}
        ${s._renderPersonnel(stats)}
        ${s._renderBackfieldStrength(stats)}
        ${s._renderDirectionMotion(stats)}
        ${s._renderHashStats(stats)}
        ${s._renderPersonnelSituation(stats)}
        ${s._renderTendencyMatrix(stats)}
        ${s._renderSituational(stats)}
        ${s.heatMaps.render(stats.offPlays)}
        ${Visualizations.render(stats.offPlays)}
        ${s._renderAdvanced(stats)}
      </div>
      <div class="gi-subpane" data-subpane="defense">
        ${s._renderDefenseTabBody(stats, defScout)}
      </div>
      <div class="gi-subpane" data-subpane="special">
        ${/* Empty is stated, not silent. The game tab already falls back to
             guidance when nothing is charted; a season pane that renders to an
             empty <div> reads as a broken tab rather than as "no ST data yet",
             and the demo season has exactly zero ST snaps. */''}
        ${[s._renderSpecialTeams(stats), s._renderConversions(stats),
           s._renderIndividualStats(stats, 'special')].filter(Boolean).join('')
          || '<div class="stats-section"><h3>No Special Teams snaps charted this season</h3><p>Chart kickoff, return, punt, field goal, and try units to populate this report.</p></div>'}
      </div>
      <div class="gi-subpane" data-subpane="players">
        ${this._renderWinLossSplits()}
        ${individual}
        ${this._renderPerGameTable()}
      </div>
      <div class="gi-subpane" data-subpane="scout">
        ${this._renderSelfScout()}
      </div>
      <div class="gi-subpane" data-subpane="trends">
        ${this._renderProgression()}
        ${this._renderTrends()}
      </div>
    `;
    this.statsEngine._seasonLabels = null;
    return html;
  }

  /**
   * Reports redesign — the season-scope persistent KPI rail. Every value is
   * read from `stats` (the season-scope `compute()` output the parity gate
   * already covers) or from `gameInfo` fields SeasonManager already reads
   * elsewhere (win/loss record); nothing here introduces a new formula.
   * Total Yards is deliberately NOT its own tile — Yards by Type (rush/pass
   * split) already answers that question with more information.
   */
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
    const diff = ptsFor - ptsAgainst;
    const diffStr = diff > 0 ? `+${diff}` : String(diff);
    const s = stats.scoring || {};
    // Single source of truth for the margin computation -- was a duplicate
    // inline copy that independently made the same over-inclusive-fumble
    // mistake _toMargin had. See _toMargin's docblock.
    const m = this._toMargin(stats);
    const marginStr = m.margin > 0 ? `+${m.margin}` : String(m.margin);
    const fumbleNote = m.unresolved ? ` · ${m.unresolved} unresolved fumble${m.unresolved === 1 ? '' : 's'}` : '';
    const tend = stats.tendencies || {};
    const rushYds = stats.rushing?.yards || 0, passYds = stats.passing?.yards || 0;
    const totalYds = rushYds + passYds;
    const rushPct = totalYds ? Math.round(rushYds / totalYds * 100) : 0;
    // Reuses the exact .gi-hero/.gi-kpi markup the game-scope rail uses (see
    // ReportsScreen._syncKpiRail in reports-screen.js) so the two rails read
    // as one system rather than two hand-styled tables.
    const tile = (num, label, sub) => `<div class="gi-kpi"><div class="gi-kpi-label">${label}</div><div class="gi-kpi-value">${num}</div>${sub ? `<div class="gi-kpi-sub">${sub}</div>` : ''}</div>`;
    return `
      <div class="gi-hero season-summary">
        ${tile(games.length, 'Games')}
        ${(wins + losses + ties) ? tile(recordStr, 'Record') : ''}
        ${(ptsFor || ptsAgainst) ? tile(`${ptsFor}-${ptsAgainst}`, 'Points For / Against') : ''}
        ${(ptsFor || ptsAgainst) ? tile(diffStr, 'Point Differential') : ''}
        ${stats.efficiency?.successRate != null ? tile(`${stats.efficiency.successRate}%`, 'Success Rate') : ''}
        ${s.touchdowns != null ? tile(s.touchdowns, 'Touchdowns', `${s.rushingTDs || 0}R / ${s.passingTDs || 0}P`) : ''}
        ${(m.takeaways || m.giveaways || m.defensiveFumbles || m.offensiveFumbles) ? tile(marginStr, 'Turnover Margin', `${m.takeaways} takeaways / ${m.giveaways} giveaways${fumbleNote}`) : ''}
        ${tend.runPct != null ? tile(`${Math.round(parseFloat(tend.runPct))}%`, 'Run Rate', `${tend.runs || 0}R / ${tend.passes || 0}P`) : ''}
        ${totalYds ? tile(totalYds, 'Yards by Type', `${rushPct}% rush · ${100 - rushPct}% pass`) : ''}
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
        <p class="self-scout-intro">Success rate, yards per play, third down, touchdowns per game and turnovers per game, first half of the season against the second.</p>
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
            <thead><tr><th>Game</th><th>Plays</th><th>Yds</th><th>Rush A/Y</th><th>Pass C/A/Y</th><th>TD</th><th title="Takeaways minus giveaways; fumbles count only when recovery is confirmed.">TO±</th><th title="Points per drive">PPD</th><th>Succ%</th><th>3rd%</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>
      </div>
    `;
  }

  // ---- Season analytics (v1.10.2) — aggregate the existing per-game
  //      compute() output into the season views a coach game-plans from.

  /** Confirmed turnover margin. Interceptions always count; a fumble counts
   *  only when the charted recovery owner proves possession changed. Raw and
   *  unresolved fumble events remain visible for ball-security QA. */
  _toMargin(s) {
    const offensiveFumbles = s.turnovers?.fumbles || 0;
    const defensiveFumbles = s.defensive?.fumbles || 0;
    const fumblesLost = s.turnovers?.fumblesLost || 0;
    const fumblesRecovered = s.defensive?.fumblesRecovered || 0;
    const giveaways = (s.turnovers?.interceptions || 0) + fumblesLost;
    const takeaways = (s.defensive?.interceptions || 0) + fumblesRecovered;
    return { margin: takeaways - giveaways, takeaways, giveaways, offensiveFumbles, defensiveFumbles,
      fumblesLost, fumblesRecovered, unresolved: (s.turnovers?.fumblesUnknown || 0) + (s.defensive?.fumblesUnknown || 0) };
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
      <p class="self-scout-intro">Third down, red zone, goal line, backed up and third-and-long conversion rates across the season.</p>
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
    const fumbleNote = m.unresolved ? ` · ${m.unresolved} unresolved fumble${m.unresolved === 1 ? '' : 's'}` : '';
    return `<div class="stats-section"><h3>Turnovers &amp; Scoring</h3>
      <div class="gi-ts-grid">
        <div class="gi-ts-margin tone-${tone}">
          <div class="gi-sc-label">Turnover Margin</div>
          <div class="gi-ts-margin-val">${marginStr}</div>
          <div class="gi-sc-sub">${m.takeaways} takeaways · ${m.giveaways} giveaways${fumbleNote}</div>
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
      <p class="self-scout-intro">Snap share, success rate and yards per play for each formation, personnel group and play type across the season.</p>
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
      <p class="self-scout-intro">Offensive success rate, yards per play and run/pass split across ${wins.length} win${wins.length > 1 ? 's' : ''} against ${losses.length} loss${losses.length > 1 ? 'es' : ''}.</p>
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
    const displayLabel = label => this._escape(String(label).replace(/&amp;/g, '&'));
    let flags = report.tells.map(t => {
      const ctx = t.verdict === 'dominant'
        ? `working at ${t.leanAvg} yds/${t.leanSuccRate}% success — keep riding it`
        : t.verdict === 'effective'
          ? `productive (${t.leanAvg} yds/${t.leanSuccRate}% succ) but a DC will see it`
          : `underperforming at ${t.leanAvg} yds/${t.leanSuccRate}% success — mix it up`;
      return `<li class="ss-v-${t.verdict}"><b>${displayLabel(t.label)}</b>: ${t.lean.toLowerCase()} ${t.leanPct}% (${t.n} plays) — <span class="ss-verdict-tag ${t.verdict}">${vIcon(t.verdict)} ${vLabel(t.verdict)}</span> ${ctx}</li>`;
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
        return `<li class="ss-v-${t.verdict}"><b>${displayLabel(t.label)}</b>: ${this._escape(t.tellVal)} ${t.tellPct}% of the time (${t.n} plays) — <span class="ss-verdict-tag ${t.verdict}">${vIcon(t.verdict)} ${vLabel(t.verdict)}</span> ${ctx}</li>`;
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

  /** Standalone season-wide HTML report owned by native Reports. */
  exportHtml() {
    const games = this._effectiveGames();
    if (!games.length) return false;
    const store = this._store();
    const name = store?.data?.seasonName || 'Season';
    const model = this.reportModel();
    const html = buildSeasonHtmlReport({ title: name + ' — Season Report', model, engine: this.statsEngine });
    window.ffaSaveBlob(new Blob([html], { type:'text/html' }), 'season_report_' + new Date().toISOString().slice(0, 10) + '.html');
    return true;
  }
  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}
