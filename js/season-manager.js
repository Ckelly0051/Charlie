/**
 * SeasonManager - season-wide analytics composition.
 *
 * The project IS the season (see season-store.js). Native Reports consumes this
 * model for aggregate stats and progression; Team Hub and Home own season and
 * game management. It owns no game data of its own.
 */
// H16 — the season Offense pane renders the same field-zone / spray / quarter
// visuals the game Offense tab does. They were computed for every play in the
// season already; nothing rendered them above game scope.
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
}
