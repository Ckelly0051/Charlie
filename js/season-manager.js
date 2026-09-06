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

  /** All games in chronological order with a read-only projection of live edits.
   *  EVERY game, including opponent-scout film: `StatsEngine._allSeasonGames`
   *  reads this to build the Opponent Scout report, whose whole subject is
   *  that film. Our Program aggregates take `_selfGames()` instead. */
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
    // `_serialize()` carries no roster, so without this the ACTIVE game's own
    // roster was missing from every season consumer -- `_mergeRoster` included,
    // which is how a jersey could end up labelled from some other game.
    if (!live.roster && active.roster) live.roster = active.roster;
    return games.map(game => String(game.id) === String(active.id) ? live : game);
  }

  /** The Our Program cohort: every game EXCEPT opponent-scout film.
   *
   *  A scout game's offensive tags describe the opponent's offense, not ours,
   *  so counting it left every Season total -- yards, success rate, turnover
   *  margin, the record itself -- an average of two different teams. Every
   *  other season-scoped Reports cohort (`ReportsScreen._selfPerspectiveCohort`)
   *  already applied this filter; the Season report was the one that did not. */
  _selfGames() {
    return this._effectiveGames().filter(game => game?.gameInfo?.perspective !== 'scout');
  }

  _allPlays() {
    // Stamp each play with its game's chronological index so order-sensitive
    // stats (drive reconstruction) can keep games separate — every game's
    // video clock starts at 0, so a plain timestamp sort would interleave
    // plays across games and merge drives over game boundaries.
    // Non-enumerable: JSON.stringify (persist/save/export) never sees it.
    return this._selfGames().flatMap((g, gi) =>
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

  /** Merge jersey#→name across every OUR PROGRAM game's roster (+ the live
   *  roster). Opponent-scout rosters are excluded: both teams field a 22, so a
   *  scout roster read here relabelled our own player on the Season Players
   *  board and in the export. A scout game's roster names their players. */
  _mergeRoster() {
    const map = {};
    const live = (window.app && window.app.roster) ? window.app.roster.players : [];
    [...this._selfGames().flatMap(g => g.roster || []), ...live].forEach(p => {
      if (p && p.num != null && p.name) map[String(p.num)] = p.name;
    });
    return map;
  }

  /** One structured owner for every season-report presentation. The native
   * Reports tab and retained standalone HTML export must consume this same
   * stamped cohort rather than independently rebuilding season scope. */
  reportModel() {
    const games = this._selfGames();
    const allPlays = games.length ? this._allPlays() : [];
    const stats = games.length ? this.statsEngine.compute(allPlays) : null;
    // A game's label comes from the store's own identity helper when the game
    // node carries no explicit name, so a Season row reads "Week 3 vs Trinity
    // Academy" rather than "Game 4". Nothing here parses a label back apart:
    // week, date and opponent are read from `gameInfo` directly wherever they
    // are displayed as their own columns.
    const store = this._store();
    const gameLabels = Object.fromEntries(games.map((game, index) =>
      [String(game.id), game.name || store?.gameName?.(game, index) || `Game ${index + 1}`]));
    if (!stats) return { games, allPlays, stats: null, rosterLabels: this._mergeRoster(), gameLabels };
    let wins = 0, losses = 0, ties = 0, pointsFor = 0, pointsAgainst = 0;
    games.forEach(game => {
      const us = parseInt(game.gameInfo?.scoreUs, 10), them = parseInt(game.gameInfo?.scoreThem, 10);
      if (!Number.isFinite(us) || !Number.isFinite(them)) return;
      pointsFor += us; pointsAgainst += them;
      if (us > them) wins++; else if (us < them) losses++; else ties++;
    });
    const played = games.filter(game => (game.plays || []).length);
    /* Per-game rows carry their own canonical metadata -- week, date,
       opponent and the scored result -- so no consumer has to scrape them
       back out of a display name. */
    /* Eligibility is per MEASURE, not per game. A game charted on defense only
       has plays, so it belongs in the log and in the record -- but it measured
       no offense, and reporting 0 rushing yards (or dividing Yards / Game by
       it) would state something nobody charted. An offensive measure is null
       unless that game has offensive snaps; a turnover margin is null unless
       BOTH sides are charted, because a giveaway can only be observed on a
       charted offensive snap and a takeaway on a charted defensive one. */
    const perGame = played.map((game, index) => {
      const gameStats = this.statsEngine.compute(game.plays || []);
      const margin = this._toMargin(gameStats);
      const scored = SeasonManager._scoredResult(game);
      const hasOffense = gameStats.offPlays.length > 0;
      const hasDefense = gameStats.defPlays.length > 0;
      const hasMargin = hasOffense && hasDefense;
      const rushYards = hasOffense ? gameStats.rushing.yards : null;
      const passYards = hasOffense ? gameStats.passing.yards : null;
      const totalYards = hasOffense ? gameStats.rushing.yards + gameStats.passing.yards : null;
      return { id:String(game.id), name:gameLabels[String(game.id)] || `Game ${index + 1}`,
        // `Plays` stands beside Rush, Pass and Total in the Game Log, so it is
        // the OFFENSIVE snap count and is absent on the same terms they are --
        // never a 0 on a game that was charted on defence.
        plays:hasOffense ? gameStats.totalPlays : null,
        chartedPlays:(game.plays || []).length,
        hasOffense, hasDefense, hasMargin,
        yards:totalYards ?? 0, rush:`${gameStats.rushing.attempts}/${gameStats.rushing.yards}`,
        pass:`${gameStats.passing.completions}/${gameStats.passing.attempts}/${gameStats.passing.yards}`,
        touchdowns:hasOffense ? gameStats.scoring.touchdowns : null,
        turnoverMargin:hasMargin ? margin.margin : null,
        pointsPerDrive:hasOffense ? gameStats.drives.pointsPerDrive : null,
        successRate:hasOffense ? Number(gameStats.efficiency.successRate) : null,
        thirdDown:hasOffense ? Number(gameStats.downs.thirdDownPct) : null, stats:gameStats,
        week:SeasonManager._weekLabel(game), date:game.gameInfo?.date || '',
        dateLabel:SeasonManager._dateLabel(game.gameInfo?.date),
        opponent:game.gameInfo?.opponent || game.gameInfo?.projectName || '',
        rushYards, passYards, totalYards,
        result:scored.result, score:scored.score, pointsFor:scored.us, pointsAgainst:scored.them };
    });
    const byId = Object.fromEntries(perGame.map(row => [row.id, row]));
    /* The Game Log lists every self-perspective game in the store's own
       chronological order -- a scheduled game with nothing charted keeps its
       row and reports its absence rather than disappearing from the season. */
    const gameLog = games.map((game, index) => {
      const row = byId[String(game.id)];
      const scored = SeasonManager._scoredResult(game);
      return { id:String(game.id), name:gameLabels[String(game.id)] || `Game ${index + 1}`,
        week:SeasonManager._weekLabel(game), dateLabel:SeasonManager._dateLabel(game.gameInfo?.date),
        opponent:game.gameInfo?.opponent || game.gameInfo?.projectName || '',
        result:scored.result, score:scored.score,
        plays:row ? row.plays : null, rushYards:row ? row.rushYards : null,
        passYards:row ? row.passYards : null, totalYards:row ? row.totalYards : null,
        successRate:row ? row.successRate : null, turnoverMargin:row ? row.turnoverMargin : null };
    });
    /* Early vs Recent windows. N = min(4, floor(charted games / 2)), taken as
       the FIRST N and the LAST N, so the two windows never overlap and eight
       or more games always compares First 4 with Last 4. */
    const windowSize = Math.min(4, Math.floor(perGame.length / 2));
    const early = perGame.slice(0, windowSize), late = perGame.slice(perGame.length - windowSize);
    const winRows=perGame.filter(row=>row.result==='W');
    const lossRows=perGame.filter(row=>row.result==='L');
    const cohort = rows => this._cohortSummary(rows, games);
    const earlySummary = cohort(early), lateSummary = cohort(late);
    const compare = SeasonManager.COMPARE_METRICS;
    /* Early vs Recent and Wins vs Losses are the SAME six measures in the same
       order, read from the same cohort summariser, so the two panels can be
       read across as one grid. */
    const progression = windowSize < 1 ? [] : compare.map(spec => {
      const from = earlySummary[spec.key], to = lateSummary[spec.key], delta = to - from;
      const status = Math.abs(delta) < spec.epsilon ? 'Steady' : delta > 0 ? 'Up' : 'Down';
      return { label:spec.label, from:spec.format(from), to:spec.format(to), delta,
        deltaText:SeasonManager._deltaText(delta, spec), status,
        direction:status === 'Steady' ? 'flat' : status === 'Up' ? 'up' : 'down',
        // Retained so the standalone HTML export prints the same literal word
        // the board shows rather than a second vocabulary.
        verdict:status };
    });
    const winSummary = cohort(winRows), lossSummary = cohort(lossRows);
    const aggregate = summary => ({ ypp:summary.yardsPerPlay.toFixed(1), success:`${summary.successRate.toFixed(1)}%`,
      third:`${Math.round(summary.thirdDown)}%`, ppd:summary.pointsPerDrive.toFixed(1), margin:summary.margin });
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
    /* Situational Offense on the Season board: the six measures in the
       approved order, label and value only. A rate over an empty denominator
       is null -- an unvisited red zone is not a 0% red zone. */
    const situationalTiles=(()=>{const d=stats.downs||{},sit=stats.situational||{},eff=stats.efficiency||{},dr=stats.drives||{};
      const rz=sit.redZone||{total:0,tds:0};
      return [
        {label:'3rd Down',value:d.byDown?.['3']?.total?`${Math.round(Number(d.thirdDownPct)||0)}%`:null},
        {label:'4th Down',value:d.byDown?.['4']?.total?`${Math.round(Number(d.fourthDownPct)||0)}%`:null},
        {label:'Red Zone TD',value:rz.total?`${pct(rz.tds,rz.total)}%`:null},
        {label:'Points / Drive',value:dr.total?String(dr.pointsPerDrive):null},
        {label:'3-and-Out',value:dr.total?`${pct(dr.threeAndOuts,dr.total)}%`:null},
        {label:'Explosive Rate',value:stats.totalPlays?`${Math.round(Number(eff.explosivePct)||0)}%`:null},
      ];
    })();
    const turnoverScoring=(()=>{const margin=this._toMargin(stats),byQuarter=stats.scoreboard?.byQuarter||{};
      const quarters=['Q1','Q2','Q3','Q4','OT'].filter(q=>byQuarter[q]&&((byQuarter[q].us||0)||(byQuarter[q].them||0))).map(q=>({quarter:q,us:byQuarter[q].us||0,them:byQuarter[q].them||0}));
      return {margin:margin.margin,takeaways:margin.takeaways,giveaways:margin.giveaways,unresolved:margin.unresolved,quarters};
    })();
    const identityGroup=(items,total)=>items.filter(item=>item.name!=='Unknown').slice(0,4).map(item=>({name:item.name,count:item.count,use:Math.round(item.count/(total||1)*100),success:item.successPct}));
    const personnel=stats.personnel||[],formations=stats.tendencies?.formationList||[];
    const offensiveIdentity={personnel:identityGroup(personnel,personnel.reduce((sum,item)=>sum+item.count,0)),formations:identityGroup(formations,formations.reduce((sum,item)=>sum+item.count,0))};
    const seasonYards = stats.rushing.yards + stats.passing.yards;
    const seasonMargin = this._toMargin(stats);
    const record = rows => { const w=rows.filter(r=>r.result==='W').length, l=rows.filter(r=>r.result==='L').length,
      t=rows.filter(r=>r.result==='T').length; return t?`${w}-${l}-${t}`:`${w}-${l}`; };
    const sum = (rows, get) => rows.reduce((total,row)=>total+(get(row)||0),0);
    /* Every per-game average divides by the games that could MEASURE it, never
       by the whole window. Yards / Game counts only games charted on offense;
       Points / Game counts only games carrying a final score -- an unscored
       game is not a shutout. */
    const offensiveGames = perGame.filter(row => row.hasOffense).length;
    const scoredLate = late.filter(row => row.pointsFor != null);
    const lateOffense = late.filter(row => row.hasOffense).length;
    return { games, allPlays, stats, rosterLabels:this._mergeRoster(), gameLabels, perGame, progression, gameLog,
      summary:{ games:games.length, charted:perGame.length, offensiveGames,
        record:ties?`${wins}-${losses}-${ties}`:`${wins}-${losses}`, played:wins+losses+ties, pointsFor, pointsAgainst,
        yards:seasonYards, yardsPerGame:offensiveGames?seasonYards/offensiveGames:null,
        successRate:Number(stats.efficiency.successRate), turnoverMargin:seasonMargin.margin },
      trends:{ windowSize, scoredGames:scoredLate.length, offensiveGamesInWindow:lateOffense,
        recentRecord:windowSize?record(late):null,
        recentPointsPerGame:scoredLate.length?sum(scoredLate,row=>row.pointsFor)/scoredLate.length:null,
        recentYardsPerGame:lateOffense?lateSummary.yards/lateOffense:null,
        recentSuccessRate:windowSize?lateSummary.successRate:null,
        recentTurnoverMargin:windowSize?lateSummary.margin:null },
      winLossCounts:{ wins:winRows.length, losses:lossRows.length },
      winLoss:winRows.length&&lossRows.length?{wins:aggregate(winSummary),losses:aggregate(lossSummary),
        winCount:winRows.length,lossCount:lossRows.length,
        rows:compare.map(spec=>({ key:spec.key, metric:spec.label,
          wins:spec.format(winSummary[spec.key]), losses:spec.format(lossSummary[spec.key]),
          winsValue:winSummary[spec.key], lossesValue:lossSummary[spec.key] })) }:null,
      defenseReport:this.statsEngine.defensivePerformance(allPlays,gameLabels), defScout:this.statsEngine.generateDefensiveSelfScout(allPlays),
      specialSummary:this.statsEngine._specialTeamsSummary(allPlays,stats), selfScout:this.statsEngine.generateSelfScout(allPlays),
      situational, situationalTiles, turnoverScoring, offensiveIdentity,
      callRows:this.statsEngine._selfScoutRows(this.statsEngine._selfScoutGroup(stats.offPlays, play=>play.tags.playCall||play.tags.playConcept||null)),
    };
  }

  /** The six shared comparison measures, in the ONE order both the Early vs
   *  Recent and the Wins vs Losses panels use. Higher is better for all six,
   *  so a positive delta is always `Up`.
   *
   *  `epsilon` is the Steady band. Success Rate (2 pp), Yards / Play (0.3) and
   *  3rd Down Rate (3 pp) keep the thresholds the previous season-progression
   *  card already applied. Points / Drive and TO Margin / Game are new here
   *  and take 0.3, the same band every other per-play and per-game measure on
   *  this list uses: a fifth of a point per drive, or a fifth of a turnover a
   *  game, is noise at a high-school sample size. */
  static get COMPARE_METRICS() {
    return [
      { key:'successRate', label:'Success Rate', unit:' pp', epsilon:2, digits:1, format:v => `${v.toFixed(1)}%` },
      { key:'yardsPerPlay', label:'Yards / Play', unit:' yds/play', epsilon:0.3, digits:1, format:v => v.toFixed(1) },
      { key:'thirdDown', label:'3rd Down Rate', unit:' pp', epsilon:3, digits:0, format:v => `${Math.round(v)}%` },
      { key:'pointsPerDrive', label:'Points / Drive', unit:' pts/drive', epsilon:0.3, digits:1, format:v => v.toFixed(1) },
      { key:'marginPerGame', label:'TO Margin / Game', unit:'/game', epsilon:0.3, digits:1, format:v => v.toFixed(1) },
      { key:'tdPerGame', label:'TD / Game', unit:'/game', epsilon:0.3, digits:1, format:v => v.toFixed(1) },
    ];
  }

  /** A delta always names its own unit. A rate change is percentage POINTS and
   *  a per-play change is yards per play; printed unitless they read as
   *  directly comparable numbers, which they are not. */
  static _deltaText(delta, spec) {
    const sign = delta > 0 ? '+' : delta < 0 ? '-' : '';
    return `${sign}${Math.abs(delta).toFixed(spec.digits)}${spec.unit}`;
  }

  /** The scored result from the game's own metadata. A game without both
   *  scores has no result -- never a 0-0 tie invented from missing data. */
  static _scoredResult(game) {
    const us = parseInt(game?.gameInfo?.scoreUs, 10), them = parseInt(game?.gameInfo?.scoreThem, 10);
    if (!Number.isFinite(us) || !Number.isFinite(them)) return { result:null, score:null, us:null, them:null };
    return { result: us > them ? 'W' : us < them ? 'L' : 'T', score:`${us}-${them}`, us, them };
  }

  /** The week label exactly as the coach charted it: a bare number stays a
   *  number, and `Scrimmage` or `Playoffs` stays its own word. Chronological
   *  order comes from the game date (SeasonStore.gamesChrono), never from
   *  parsing this text. */
  static _weekLabel(game) { return String(game?.gameInfo?.week || '').trim(); }

  /** `Aug 21` from a stored `YYYY-MM-DD`, parsed by field rather than by
   *  `Date.parse`, which shifts a date-only string across time zones. */
  static _dateLabel(date) {
    const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(date || ''));
    if (!match) return null;
    const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
    return `${months[Number(match[2]) - 1] || ''} ${Number(match[3])}`.trim() || null;
  }

  /** One summariser for every comparison cohort, so Early vs Recent and Wins
   *  vs Losses can never measure the same label two different ways. Rates are
   *  play-weighted over the cohort's merged plays; per-game measures divide by
   *  the cohort's own game count. The plays are the SAME objects `_allPlays()`
   *  already stamped with `__seasonGameIdx`, so drive reconstruction keeps the
   *  games separate and possessions never merge across a game boundary. */
  _cohortSummary(rows, games) {
    const plays = rows.flatMap(row => games.find(game => String(game.id) === row.id)?.plays || []);
    const merged = this.statsEngine.compute(plays);
    const margin = this._toMargin(merged);
    const count = rows.length;
    // Each per-game average divides by the games that could measure it: a
    // game charted on defense only scored no offensive touchdowns to average,
    // and its turnover margin was never observable on both sides.
    const offensiveGames = rows.filter(row => row.hasOffense).length;
    const marginGames = rows.filter(row => row.hasMargin).length;
    const yards = merged.rushing.yards + merged.passing.yards;
    return {
      games: count, offensiveGames, marginGames,
      plays: merged.totalPlays, yards, margin: margin.margin,
      successRate: Number(merged.efficiency.successRate) || 0,
      yardsPerPlay: merged.totalPlays ? yards / merged.totalPlays : 0,
      thirdDown: Number(merged.downs.thirdDownPct) || 0,
      pointsPerDrive: Number(merged.drives.pointsPerDrive) || 0,
      marginPerGame: marginGames ? margin.margin / marginGames : 0,
      tdPerGame: offensiveGames ? merged.scoring.touchdowns / offensiveGames : 0,
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
    const games = this._selfGames();
    if (!games.length) return false;
    const store = this._store();
    const name = store?.data?.seasonName || 'Season';
    const model = this.reportModel();
    const html = buildSeasonHtmlReport({ title: name + ' — Season Report', model, engine: this.statsEngine });
    window.ffaSaveBlob(new Blob([html], { type:'text/html' }), 'season_report_' + new Date().toISOString().slice(0, 10) + '.html');
    return true;
  }
}
