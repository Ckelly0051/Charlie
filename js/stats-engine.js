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
import { gainedFirstDown, DRIVE_ENDERS } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';

const RUN_COLOR = '#f97316';
const PASS_COLOR = '#38bdf8';
// Shown as a hover tooltip wherever Success Rate appears, so the metric is
// self-explanatory in-app. Matches _isSuccessfulPlay().
const SUCCESS_RATE_TIP = 'Share of plays that stay on schedule for the down/distance: 1st down needs 50% of the yards to go, 2nd down 70%, 3rd/4th must convert (plus any TD or made kick). Situation-aware: a 4-yard gain is a success on 1st-and-10 but not on 3rd-and-10.';

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
   * Split a (possibly multi-select) play-type string into components.
   * "RPO + Short Pass" -> ["RPO", "Short Pass"]; blank -> ["Unknown"].
   */
  static splitPlayTypes(playType) {
    const parts = String(playType || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
    return parts.length ? parts : ['Unknown'];
  }

  /**
   * Split a (possibly multi-select) result string into components.
   * "Fumble + Touchdown" -> ["Fumble", "Touchdown"]; blank -> [].
   */
  static splitResults(result) {
    return String(result || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  static splitBlitzes(blitz) {
    return String(blitz || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Split a (possibly multi-select) defensive front into its components.
   * "Maverick + Jumbo Shift" -> ["Maverick", "Jumbo Shift"] — the play is
   * attributed to both the base front and the shift package in analytics.
   */
  static splitFronts(front) {
    return String(front || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
  }

  /**
   * Check if a play's result includes a specific value. Handles both
   * single-select ("Touchdown") and multi-select ("Fumble + Touchdown").
   */
  static hasResult(p, val) {
    if (!p || !p.tags || !p.tags.result) return false;
    return StatsEngine.splitResults(p.tags.result).includes(val);
  }

  /**
   * Split a player attribution value into individual jersey #s. Most roles hold
   * a single number, but Tackler can hold several (shared tackles), stored as a
   * "55, 22"-style string. Returns an array of jersey-# strings (may be empty).
   */
  static splitPlayers(val) {
    return String(val == null ? '' : val).match(/\d+/g) || [];
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

  /**
   * Points a single play put on the board. Touchdown = 6, made Field Goal = 3,
   * made XP = 1, made 2-Point = 2. Conversion/kick success is the explicit
   * 'Good' result (paired with the ST type); a 'Field Goal' result also counts
   * as 3 for offense plays that mark the drive's FG outcome directly.
   */
  static playPoints(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured) {
      const points = SpecialTeamsModel.points(structured);
      if (points) return points;
      if (!structured.isFake) return 0;
      const fakeResults = StatsEngine.splitResults(p && p.tags && p.tags.result);
      if (fakeResults.includes('Touchdown')) return 6;
      if (fakeResults.includes('Safety')) return 2;
      return 0;
    }
    if (!p || !p.tags) return 0;
    const res = StatsEngine.splitResults(p.tags.result);
    const st = p.tags.stType || '';
    // "Made" via the explicit Kick Outcome (phase-aware ST) or a legacy Good result.
    const made = p.tags.kickOutcome === 'Good' || res.includes('Good');
    if (res.includes('Touchdown')) return 6;
    if (res.includes('Safety')) return 2;
    if (st === '2-Pt') return made ? 2 : 0;
    if (st === 'XP') return made ? 1 : 0;
    if (st === 'Field Goal') return made ? 3 : 0;
    if (res.includes('Field Goal')) return 3;
    return 0;
  }

  /**
   * Which side a scoring play counts for.
   * - Offense / Special Teams → 'us' (unless Safety → 'them')
   * - Defense unit → 'them' by default (opponent's offense scored), BUT
   *   if the result includes a turnover + TD (pick-six, scoop-and-score)
   *   or a Safety, our defense scored → 'us'.
   */
  static scoringSide(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured && SpecialTeamsModel.points(structured)) {
      const team = SpecialTeamsModel.scoringTeam(p);
      if (team === 'subject') return 'us';
      if (team === 'opponent') return 'them';
      return 'unknown';
    }
    if (structured && structured.isFake && StatsEngine.playPoints(p)) {
      if (StatsEngine.hasResult(p, 'Safety')) return 'unknown';
      return structured.subjectRole === 'kicking' || structured.subjectRole === 'attempting' ? 'us' : 'them';
    }
    if (!p || !p.tags) return 'us';
    // Explicit "Scored by" wins — the one consistent way to attribute any kick /
    // special-teams score (XP, FG, 2-Pt, return TD) to us or the opponent, since
    // there is no "their special teams" unit. Blank falls through to unit logic.
    if (p.tags.scoreFor === 'them') return 'them';
    if (p.tags.scoreFor === 'us') return 'us';
    const res = StatsEngine.splitResults(p.tags.result);
    if (p.tags.unit === 'defense') {
      if (res.includes('Safety')) return 'us';
      if (res.includes('Touchdown') &&
          (res.includes('Fumble') || res.includes('Interception'))) return 'us';
      return 'them';
    }
    if (res.includes('Safety')) return 'them';
    return 'us';
  }

  /**
   * Walk the plays in charting order and build a running scoreboard:
   * final us/them totals, a per-quarter split, and the list of scoring plays
   * with the running score after each. Includes every tagged play (offense,
   * defense, and special teams) so kicks/conversions count even without a
   * play type.
   */
  computeScoreboard(playsOverride = null) {
    const plays = (playsOverride || (this.tagger ? this.tagger.plays : []) || [])
      .filter(p => p && p.tags);
    let us = 0, them = 0, unattributed = 0;
    const events = [];
    const byQuarter = {};
    plays.forEach(p => {
      const pts = StatsEngine.playPoints(p);
      if (!pts) return;
      // scoringSide honors the play's explicit "Scored by" (us/them) for kicks.
      const side = StatsEngine.scoringSide(p);
      if (side === 'them') them += pts;
      else if (side === 'us') us += pts;
      else unattributed += pts;
      const q = p.tags.quarter || '';
      if (q) {
        if (!byQuarter[q]) byQuarter[q] = { us: 0, them: 0 };
        if (side === 'us' || side === 'them') byQuarter[q][side] += pts;
        else byQuarter[q].unattributed = (byQuarter[q].unattributed || 0) + pts;
      }
      events.push({
        playId: p.id, quarter: q, points: pts, side,
        type: this._scoreType(p), us, them
      });
    });
    return { us, them, ...(unattributed ? { unattributed } : {}), events, byQuarter, hasData: events.length > 0 };
  }

  _scoreType(p) {
    const structured = SpecialTeamsModel.normalize(p && p.specialTeams);
    if (structured && structured.outcome.score) {
      return { touchdown: 'TD', safety: 'Safety', extraPoint: 'XP', fieldGoal: 'FG' }[structured.outcome.score] || 'Score';
    }
    const res = StatsEngine.splitResults(p.tags.result);
    const st = p.tags.stType || '';
    if (res.includes('Touchdown')) return 'TD';
    if (res.includes('Safety')) return 'Safety';
    if (st === '2-Pt') return '2-Pt';
    if (st === 'XP') return 'XP';
    if (st === 'Field Goal' || res.includes('Field Goal')) return 'FG';
    return 'Score';
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
    // Esc dismisses the dashboard like every other overlay (UX audit A3).
    // Defer to anything layered above: an in-app dialog owns Esc in capture
    // phase already; the game dropdown stopImmediatePropagation()s its own.
    document.addEventListener('keydown', (e) => {
      if (e.key !== 'Escape') return;
      if (!this.dashboardEl || this.dashboardEl.classList.contains('hidden')) return;
      if (document.getElementById('ffaConfirmModal')) return;
      this.hideDashboard();
    });
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
    // Broader source for ST/conversion plays, which often have no offensive
    // playType and would otherwise be filtered out below.
    let convSource = (playsOverride || (this.tagger ? this.tagger.plays : [])).filter(p => p && p.tags);
    if (playsOverride) {
      plays = playsOverride.filter(p => p.tags && (p.tags.playType || p.tags.runPass));
    } else {
      plays = this.tagger.plays.filter(p => p.tags.playType || p.tags.runPass);
      filterActive = this.filter && this.filter.active;
      if (filterActive) {
        plays = this.filter.filter(plays);
        convSource = this.filter.filter(convSource);
      }
    }

    // Partition by unit perspective: offense-unit plays are OUR offense
    // (formations, play types, yards gained are ours). Defense-unit plays
    // are OUR defense (fronts, coverages, blitzes are ours; the offensive
    // tags on them are the opponent's). Legacy plays without a unit tag
    // default to offense.
    const offPlays = plays.filter(p => (p.tags.unit || 'offense') === 'offense');
    const defPlays = plays.filter(p => p.tags.unit === 'defense');

    const stats = {
      totalPlays: offPlays.length,
      allPlays: plays.length,
      offPlays,
      defPlays,
      filterActive,
      rushing: this._rushingStats(offPlays),
      passing: this._passingStats(offPlays),
      scoring: this._scoringStats(offPlays),
      downs: this._downStats(offPlays),
      turnovers: this._turnoverStats(offPlays),
      tendencies: this._tendencyStats(offPlays),
      bigPlays: this._bigPlays(offPlays),
      individuals: this._individualStats(plays),
      drives: this._driveStats(offPlays),
      situational: this._situationalStats(offPlays),
      efficiency: this._efficiencyStats(offPlays),
      personnel: this._personnelStats(offPlays),
      advanced: this.advanced.summarize(offPlays),
      defensive: this._defensiveStats(defPlays),
      gameFlow: this._gameFlowStats(offPlays),
      conversions: this._conversionStats(convSource),
      specialTeams: this._specialTeamsStats(plays),
      scoreboard: this.computeScoreboard(convSource),
      hash: this._hashStats(offPlays),
      personnelSituation: this._personnelSituationStats(offPlays),
      frontCoverageCombos: this._frontCoverageCombos(defPlays),
      playAction: this._playActionStats(offPlays),
      dirMotion: this._directionMotionStats(offPlays),
    };
    stats.takeaways = this._generateTakeaways(stats);

    return stats;
  }

  _currentPlays() {
    let plays = this.tagger.plays.filter(p => p.tags.playType);
    if (this.filter && this.filter.active) plays = this.filter.filter(plays);
    return plays;
  }

  _offensePlays() {
    return this._currentPlays().filter(p => (p.tags.unit || 'offense') === 'offense');
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  _isSuccessfulPlay(p) {
    const yds = parseInt(p.tags.yardage) || 0;
    const dist = parseInt(p.tags.distance) || 10;
    if (StatsEngine.hasResult(p, 'Touchdown')) return true;
    if (StatsEngine.hasResult(p, 'Good')) return true;
    if (StatsEngine.hasResult(p, 'No Good')) return false;
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
    const list = this._reconstructDrives(plays).map((dp, idx) => {
      const yards = dp.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const last = dp[dp.length - 1];
      const first = dp[0];
      const res = StatsEngine.splitResults(last?.tags.result);
      let outcome = 'Other';
      if (res.includes('Touchdown')) outcome = 'TD';
      else if (res.includes('Field Goal')) outcome = 'FG';
      else if (res.includes('Safety')) outcome = 'Safety';
      else if (res.includes('Punt')) outcome = 'Punt';
      else if (res.includes('Interception') || res.includes('Fumble')) outcome = 'Turnover';
      else if (res.includes('Kneel')) outcome = 'Kneel';
      const startYL = this._absYardLine(first.tags);
      const points = outcome === 'TD' ? 6 : outcome === 'FG' ? 3 : outcome === 'Safety' ? 2 : 0;
      let driveType = 'Other';
      if (dp.length <= 3 && outcome !== 'TD' && outcome !== 'FG') driveType = '3-and-out';
      else if (dp.length >= 8 || yards >= 60) driveType = 'Sustained';
      else if (yards >= 30 && dp.length <= 4) driveType = 'Explosive';
      else if (outcome === 'TD' || outcome === 'FG') driveType = 'Scoring';
      return { number: idx + 1, plays: dp.length, yards, outcome, startYL, points, driveType, playIds: dp.map(p => p.id) };
    });
    const scoringDrives = list.filter(d => d.outcome === 'TD' || d.outcome === 'FG');
    const threeAndOuts = list.filter(d => d.driveType === '3-and-out').length;
    const totalPoints = list.reduce((s, d) => s + d.points, 0);
    return {
      total: list.length,
      list,
      scoringDrives: scoringDrives.length,
      threeAndOuts,
      totalPoints,
      pointsPerDrive: list.length ? (totalPoints / list.length).toFixed(1) : '0.0',
      avgPlaysPerDrive: list.length ? (list.reduce((s, d) => s + d.plays, 0) / list.length).toFixed(1) : '0',
      avgYardsPerDrive: list.length ? (list.reduce((s, d) => s + d.yards, 0) / list.length).toFixed(1) : '0'
    };
  }

  // Drive-by-drive visual for the Game tab. Reuses the already-computed
  // stats.drives.list; each row carries its play ids so it's click-to-film.
  _renderDriveChart(stats) {
    const list = (stats.drives && stats.drives.list) || [];
    if (!list.length) return '';
    const color = { TD: '#22c55e', FG: '#3b82f6', Safety: '#a855f7', Turnover: '#ef4444', Punt: '#94a3b8', Kneel: '#64748b', Other: '#64748b' };
    const maxY = Math.max(10, ...list.map(d => Math.abs(d.yards)));
    const rows = list.map(d => {
      const c = color[d.outcome] || '#64748b';
      const w = Math.round(Math.min(100, Math.abs(d.yards) / maxY * 100));
      return `<div class="drive-row cut-row" data-drive-ids="${(d.playIds || []).join(',')}" title="Watch drive ${d.number}">
        <span class="drive-num">Dr ${d.number}</span>
        <span class="drive-bar-wrap"><span class="drive-bar" style="width:${w}%;background:${c}"></span></span>
        <span class="drive-yards">${d.yards >= 0 ? '+' : ''}${d.yards} yd · ${d.plays} pl</span>
        <span class="drive-out" style="color:${c}">${d.outcome}</span>
      </div>`;
    }).join('');
    return `<div class="stats-section"><h3>Drive Chart</h3>
      <p class="self-scout-intro">Every offensive possession — click a drive to watch it on film.</p>
      <div class="drive-chart">${rows}</div></div>`;
  }

  // Backfield + Strength tendency tables (the new Hudl-model dimensions). Each
  // row is click-to-film via the shared cut wiring (backfield / strength cuts).
  _renderBackfieldStrength(stats) {
    const plays = stats.offPlays || [];
    const build = (cutType, label, get) => {
      const groups = {};
      plays.forEach(p => { const v = get(p); if (v) (groups[v] = groups[v] || []).push(p); });
      return Object.entries(groups).map(([name, ps]) => {
        const runs = ps.filter(p => StatsEngine.isRun(p)).length;
        const passes = ps.filter(p => StatsEngine.isPass(p)).length;
        const yards = ps.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
        const succ = ps.filter(p => this._isSuccessfulPlay(p)).length;
        return { label: name, count: ps.length, runs, passes, yards,
          successPct: ps.length ? Math.round(succ / ps.length * 100) : 0,
          avg: ps.length ? (yards / ps.length).toFixed(1) : '0.0',
          cutType, cutVal: name, cutLabel: `${label}: ${name}` };
      }).sort((a, b) => b.count - a.count);
    };
    const bf = build('backfield', 'Backfield', p => p.tags.backfield);
    const str = build('strength', 'Strength', p => p.tags.strength);
    if (!bf.length && !str.length) return '';
    return `<div class="stats-section"><h3>Backfield &amp; Strength</h3>`
      + (bf.length ? `<h4 class="ss-subhead">Backfield</h4>${Charts.effectivenessRows(bf)}` : '')
      + (str.length ? `<h4 class="ss-subhead">Strength</h4>${Charts.effectivenessRows(str)}` : '')
      + `</div>`;
  }

  // Matchup data: your offense (from your games) + each scouted opponent's
  // defense (from games whose "Film shows" is Opponent Scout, defensive snaps).
  _matchupData() {
    const app = window.app;
    try { if (app && app.storage && app.storage.commitActive) app.storage.commitActive(); } catch (e) {}
    const store = app && app.storage && app.storage.seasonStore;
    const games = (store && store.gamesChrono) ? store.gamesChrono() : [];
    const yourOff = [];
    const oppMap = {};
    games.forEach(g => {
      const scout = ((g.gameInfo && g.gameInfo.perspective) || '') === 'scout';
      const rawOpp = String((g.gameInfo && g.gameInfo.opponent) || '').trim();
      (g.plays || []).forEach(p => {
        const t = p.tags || {};
        const u = t.unit || 'offense';
        if (scout) {
          // Opponent film tagged directly: their defense = their defensive snaps.
          if (u === 'defense') (oppMap[rawOpp || 'Opponent'] = oppMap[rawOpp || 'Opponent'] || []).push(p);
        } else if (u === 'offense') {
          yourOff.push(p);
          // A game we PLAYED: their defense = the front/coverage we FACED on this
          // offensive snap. Relabel the rep as defensive so _renderDefensive reads
          // it — the yards we gained are the yards their defense allowed. (This is
          // why "I played them" games now populate the matchup, not just scout
          // games — same model as the Opponent Scout.)
          if (rawOpp && (t.defFront || t.coverage)) {
            (oppMap[rawOpp] = oppMap[rawOpp] || []).push({ ...p, tags: { ...t, unit: 'defense' } });
          }
        }
      });
    });
    const opponents = Object.entries(oppMap).map(([name, defPlays]) => ({ name, defPlays }))
      .sort((a, b) => b.defPlays.length - a.defPlays.length);
    return { opponents, yourOff };
  }

  // Renders the Matchup tab: our offense beside a scouted opponent's defense,
  // reusing the proven efficiency/tendency/defensive renderers. Cut-rows are
  // left inert (cross-game film is deferred, same as the Season tab).
  _renderMatchupInto(pane, oppName) {
    if (!pane) return;
    const data = this._matchupData();
    if (!data.opponents.length) {
      pane.innerHTML = `<div class="stats-section" style="max-width:640px;margin:24px auto;text-align:center">
        <h3>Opponent Matchup</h3>
        <p class="self-scout-intro" style="line-height:1.6">Tag the <b>defense you face</b> on your offensive snaps (front / coverage) and your offense will line up against it here — that's all it takes for a game you played. (Or scout a fresh opponent directly: their game's settings → <b>Film shows → Opponent Scout</b>, then tag their defensive snaps.)</p></div>`;
      return;
    }
    const esc = Charts._esc;
    const want = oppName || this._activeOpponent();
    const opp = data.opponents.find(o => o.name === want) || data.opponents[0];
    const offStats = this.compute(data.yourOff);
    const defStats = this.compute(opp.defPlays);
    const picker = data.opponents.length > 1
      ? `<select id="matchupOpp" class="play-select" style="margin-left:8px">${data.opponents.map(o =>
          `<option value="${esc(o.name)}"${o.name === opp.name ? ' selected' : ''}>${esc(o.name)} (${o.defPlays.length} D)</option>`).join('')}</select>`
      : `<b>${esc(opp.name)}</b>`;
    pane.innerHTML = `
      <div class="stats-section"><h3>Matchup — Our Offense vs ${picker}</h3>
        <p class="self-scout-intro">What we run, lined up against what they do on defense. Read-only (cross-game cut-ups are deferred).</p></div>
      <div class="gi-matchup">
        <div class="gi-matchup-col"><div class="gi-matchup-head gi-mh-off">Our Offense</div>
          ${this._renderEfficiency(offStats)}
          ${this._renderTendencies(offStats)}
        </div>
        <div class="gi-matchup-col"><div class="gi-matchup-head gi-mh-def">${esc(opp.name)} Defense</div>
          ${this._renderDefensive(defStats)}
        </div>
      </div>`;
    const sel = pane.querySelector('#matchupOpp');
    if (sel) sel.addEventListener('change', (e) => this._renderMatchupInto(pane, e.target.value));
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
      const tds = arr.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length;
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
        tds: qp.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length
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
    const sacks = plays.filter(p => StatsEngine.hasResult(p, 'Sack'));
    // TFL = a defensive stop behind the line on a run/pass. Negative yardage
    // from a Penalty, Kneel or Spike is NOT a tackle for loss and must not
    // inflate havoc rate (or the defense's TFL count).
    const tfl = plays.filter(p => (parseInt(p.tags.yardage) || 0) < 0
      && !StatsEngine.hasResult(p, 'Sack') && !StatsEngine.hasResult(p, 'Penalty')
      && !StatsEngine.hasResult(p, 'Kneel') && !StatsEngine.hasResult(p, 'Spike'));
    const ints = plays.filter(p => StatsEngine.hasResult(p, 'Interception'));
    const fumbles = plays.filter(p => StatsEngine.hasResult(p, 'Fumble'));
    const incompletions = plays.filter(p => StatsEngine.hasResult(p, 'Incomplete'));
    const havocPlays = sacks.length + tfl.length + ints.length + fumbles.length;
    const threeAndOuts = this._countThreeAndOuts(plays);

    const fronts = {};
    const coverages = {};
    const blitzes = {};

    plays.forEach(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      const defSuccess = !this._isSuccessfulPlay(p);
      const isHavoc = StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
        StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack'));

      StatsEngine.splitFronts(p.tags.defFront).forEach(f => {
        if (!fronts[f]) fronts[f] = { name: f, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0 };
        fronts[f].count++;
        fronts[f].yards += yds;
        if (defSuccess) fronts[f].successes++;
        if (isHavoc) fronts[f].havoc++;
        if (StatsEngine.isRun(p)) fronts[f].runs++;
        else fronts[f].passes++;
      });

      if (p.tags.coverage) {
        const c = p.tags.coverage;
        if (!coverages[c]) coverages[c] = { name: c, count: 0, yards: 0, successes: 0, comps: 0, incs: 0, ints: 0, sacks: 0 };
        coverages[c].count++;
        coverages[c].yards += yds;
        if (defSuccess) coverages[c].successes++;
        if (StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain')) coverages[c].comps++;
        if (StatsEngine.hasResult(p, 'Incomplete')) coverages[c].incs++;
        if (StatsEngine.hasResult(p, 'Interception')) coverages[c].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) coverages[c].sacks++;
      }

      if (p.tags.blitz) {
        StatsEngine.splitBlitzes(p.tags.blitz).forEach(b => {
          if (!blitzes[b]) blitzes[b] = { name: b, count: 0, yards: 0, sacks: 0, havoc: 0, successes: 0 };
          blitzes[b].count++;
          blitzes[b].yards += yds;
          if (StatsEngine.hasResult(p, 'Sack')) blitzes[b].sacks++;
          if (isHavoc) blitzes[b].havoc++;
          if (defSuccess) blitzes[b].successes++;
        });
      }
    });

    const blitzPlays = plays.filter(p => p.tags.blitz);
    const noBlitzPlays = plays.filter(p => !p.tags.blitz && (p.tags.defFront || p.tags.coverage));
    const blitzHavoc = blitzPlays.filter(p =>
      StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
      StatsEngine.hasResult(p, 'Fumble') || ((parseInt(p.tags.yardage) || 0) < 0 && !StatsEngine.hasResult(p, 'Sack'))
    ).length;

    const passingDowns = plays.filter(p =>
      (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) >= 7) ||
      (p.tags.down === '3') || (p.tags.down === '4')
    );
    const earlyDowns = plays.filter(p => p.tags.down === '1' || (p.tags.down === '2' && (parseInt(p.tags.distance) || 0) < 7));

    const frontBySituation = (subset, label) => {
      const map = {};
      subset.forEach(p => {
        StatsEngine.splitFronts(p.tags.defFront).forEach(f => {
          map[f] = (map[f] || 0) + 1;
        });
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
    // A three-and-out = the defense forced the offense to give the ball back in
    // three plays without a first down. We must NOT rely on the driveNumber
    // tag: it's only set when the coach clicks "New Drive", so a normally-tagged
    // game leaves every play on drive "1" — which made this always report 0.
    // Instead, reconstruct drives from the play sequence.
    const drives = this._reconstructDrives(plays);
    // Results that mean the possession ended some other way than a forced punt.
    const NON_PUNT = new Set(['Touchdown', 'Field Goal', 'Good', 'Interception',
      'Fumble', 'Kneel', 'Spike', 'Safety']);
    return drives.filter((dp, idx) => {
      if (dp.length > 3) return false;
      if (dp.some(p => StatsEngine.splitResults(p.tags.result).some(r => NON_PUNT.has(r)))) return false;
      if (dp.some(p => gainedFirstDown(p.tags))) return false;
      // The offense must actually have surrendered the ball: an explicit punt,
      // or another possession follows IN THE SAME GAME (so this one ended in
      // an untagged punt). Without this, a short drive cut off by the end of a
      // half/game — or a partially-tagged final drive — would be miscounted as
      // a three-and-out (in season roll-ups, the next game's first drive must
      // not vouch for the previous game's last one).
      const punted = StatsEngine.hasResult(dp[dp.length - 1], 'Punt');
      const next = drives[idx + 1];
      const possessionFollowed = !!next &&
        (next[0].__seasonGameIdx ?? 0) === (dp[0].__seasonGameIdx ?? 0);
      return punted || possessionFollowed;
    }).length;
  }

  /**
   * Split a list of plays into possessions (drives) without depending on the
   * manual driveNumber tag. A new drive begins after a possession-ending
   * result (punt/score/turnover), and at any 1st-down play that the previous
   * play did NOT earn (down reset to 1 ⇒ the ball changed hands off-camera).
   */
  _reconstructDrives(plays) {
    // Season roll-ups concatenate plays from several games whose video clocks
    // all start at 0 — sort by game first (SeasonManager._allPlays stamps
    // __seasonGameIdx) so a timestamp sort can't interleave games, and break
    // every drive at a game boundary. Single-game lists are unstamped (all 0).
    const gameOf = p => p.__seasonGameIdx ?? 0;
    const ordered = [...plays].sort((a, b) =>
      (gameOf(a) - gameOf(b)) ||
      (((a.timestamp && a.timestamp.start) ?? a.id ?? 0) -
        ((b.timestamp && b.timestamp.start) ?? b.id ?? 0)));
    const drives = [];
    let cur = [];
    ordered.forEach((p, i) => {
      const prev = i > 0 ? ordered[i - 1] : null;
      // A drive ends on a possession-ending result...
      const possessionEnded = prev && StatsEngine.splitResults(prev.tags.result).some(r => DRIVE_ENDERS.has(r));
      // ...or when the down resets to 1st without a first down being earned (the
      // ball changed hands off-camera). A penalty can legally reset the down
      // within the same drive, so it never starts a new possession on its own.
      const downReset = prev && p.tags.down === '1' &&
        !StatsEngine.hasResult(prev, 'Penalty') && !gainedFirstDown(prev.tags);
      const newGame = prev && gameOf(prev) !== gameOf(p);
      if ((possessionEnded || downReset || newGame) && cur.length) { drives.push(cur); cur = []; }
      cur.push(p);
    });
    if (cur.length) drives.push(cur);
    return drives;
  }

  _rushingStats(plays) {
    const rushPlays = plays.filter(p => StatsEngine.isRun(p));
    const yards = rushPlays.reduce((sum, p) => sum + (parseInt(p.tags.yardage) || 0), 0);
    const attempts = rushPlays.length;

    return {
      attempts,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      touchdowns: rushPlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length,
      fumbles: rushPlays.filter(p => StatsEngine.hasResult(p, 'Fumble')).length,
      longest: rushPlays.reduce((max, p) => Math.max(max, parseInt(p.tags.yardage) || 0), 0),
      firstDowns: rushPlays.filter(p => gainedFirstDown(p.tags)).length
    };
  }

  _passingStats(plays) {
    const passPlays = plays.filter(p => StatsEngine.isPass(p));
    const completions = passPlays.filter(p =>
      StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain')
    );
    const incompletions = passPlays.filter(p => StatsEngine.hasResult(p, 'Incomplete'));
    const yards = passPlays.reduce((sum, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return sum;
      return sum + (parseInt(p.tags.yardage) || 0);
    }, 0);
    // Count each attempt PLAY once. Summing the three filters double-counted a
    // play carrying two of the results (e.g. "Incomplete + Interception"), so a
    // single pick could inflate attempts and deflate completion %.
    const ints = passPlays.filter(p => StatsEngine.hasResult(p, 'Interception'));
    const attempts = new Set([...completions, ...incompletions, ...ints].map(p => p.id)).size;

    return {
      attempts,
      completions: completions.length,
      yards,
      average: attempts ? (yards / attempts).toFixed(1) : '0.0',
      yardsPerCompletion: completions.length ? (yards / completions.length).toFixed(1) : '0.0',
      completionPct: attempts ? ((completions.length / attempts) * 100).toFixed(1) : '0.0',
      touchdowns: passPlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length,
      interceptions: passPlays.filter(p => StatsEngine.hasResult(p, 'Interception')).length,
      sacks: passPlays.filter(p => StatsEngine.hasResult(p, 'Sack')).length,
      sackYards: passPlays.filter(p => StatsEngine.hasResult(p, 'Sack'))
        .reduce((sum, p) => sum + Math.abs(parseInt(p.tags.yardage) || 0), 0),
      longest: passPlays.reduce((max, p) => {
        if (StatsEngine.hasResult(p, 'Incomplete')) return max;
        return Math.max(max, parseInt(p.tags.yardage) || 0);
      }, 0),
      firstDowns: passPlays.filter(p => gainedFirstDown(p.tags)).length
    };
  }

  _scoringStats(plays) {
    const tds = plays.filter(p => StatsEngine.hasResult(p, 'Touchdown'));
    return {
      touchdowns: tds.length,
      rushingTDs: tds.filter(p => StatsEngine.isRun(p)).length,
      passingTDs: tds.filter(p => StatsEngine.isPass(p)).length
    };
  }

  /**
   * PAT / 2-point conversion success. Keyed on stType ('XP' | '2-Pt') and the
   * explicit Good / No Good (or Touchdown / Field Goal) result, so it works
   * even on ST plays that carry no offensive playType.
   */
  _conversionStats(source) {
    const structured = p => SpecialTeamsModel.normalize(p && p.specialTeams);
    const made = (p) => {
      const event = structured(p);
      if (event) return event.outcome.status === 'good' || event.outcome.score === 'extraPoint' || event.outcome.score === 'twoPoint';
      return p.tags.kickOutcome === 'Good' || StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'Field Goal');
    };
    // Only OUR conversions count toward our PAT% — a kick marked 'Scored by:
    // Them' belongs to the opponent.
    const tally = (type) => {
      const wanted = type === 'XP' ? 'extraPoint' : 'twoPoint';
      const att = source.filter(p => {
        const event = structured(p);
        if (event) {
          const kind = event.attemptType || event.outcome.score;
          return kind === wanted && event.subjectRole === 'attempting';
        }
        return p.tags.stType === type && StatsEngine.scoringSide(p) === 'us';
      });
      const m = att.filter(p => made(p)).length;
      return { att: att.length, made: m, pct: att.length ? Math.round(m / att.length * 100) : 0 };
    };
    const two = tally('2-Pt');
    const xp = tally('XP');
    return { two, xp, hasData: two.att > 0 || xp.att > 0 };
  }

  // Phase-aware special teams: punts (gross/net/hang/TB%), kickoffs (avg/TB%/
  // return allowed), field goals (made-att + by distance), and the return game.
  // Reads the new ST detail fields (kickDistance/returnYards/hangTime/kickedTo/
  // kickOutcome); falls back gracefully when they're blank (legacy plays).
  _specialTeamsStats(plays) {
    const num = (v) => { const n = parseFloat(v); return isNaN(n) ? null : n; };
    const by = (type) => plays.filter(p => p.tags && p.tags.stType === type);
    const avg = (arr, get) => { const v = arr.map(get).filter(x => x != null); return v.length ? +(v.reduce((s, x) => s + x, 0) / v.length).toFixed(1) : null; };
    const made = (p) => p.tags.kickOutcome === 'Good' || StatsEngine.hasResult(p, 'Good');

    const pp = by('Punt');
    const punts = {
      n: pp.length,
      grossAvg: avg(pp, p => num(p.tags.kickDistance)),
      // Standard net punt: gross − return − 20 yards for a touchback (the ball
      // comes out to the 20), so a touchback no longer reads as a full-net punt.
      netAvg: avg(pp, p => { const d = num(p.tags.kickDistance); return d == null ? null : d - (num(p.tags.returnYards) || 0) - (p.tags.kickOutcome === 'Touchback' ? 20 : 0); }),
      hangAvg: avg(pp, p => num(p.tags.hangTime)),
      tbPct: pp.length ? Math.round(pp.filter(p => p.tags.kickOutcome === 'Touchback').length / pp.length * 100) : 0,
      blocked: pp.filter(p => p.tags.kickOutcome === 'Blocked').length,
    };
    const ko = by('Kickoff');
    const kickoffs = {
      n: ko.length,
      avg: avg(ko, p => num(p.tags.kickDistance)),
      tbPct: ko.length ? Math.round(ko.filter(p => p.tags.kickOutcome === 'Touchback').length / ko.length * 100) : 0,
      retAllowedAvg: avg(ko.filter(p => p.tags.kickOutcome === 'Returned'), p => num(p.tags.returnYards)),
    };
    const fgp = by('Field Goal');
    const fg = {
      att: fgp.length, made: fgp.filter(made).length,
      pct: fgp.length ? Math.round(fgp.filter(made).length / fgp.length * 100) : 0,
      long: fgp.filter(made).reduce((m, p) => Math.max(m, num(p.tags.kickDistance) || 0), 0),
      byDist: [['<30', 0, 29], ['30-39', 30, 39], ['40-49', 40, 49], ['50+', 50, 99]].map(([label, lo, hi]) => {
        const att = fgp.filter(p => { const d = num(p.tags.kickDistance); return d != null && d >= lo && d <= hi; });
        return { label, att: att.length, made: att.filter(made).length };
      }).filter(b => b.att > 0),
    };
    const ret = (type) => {
      const arr = by(type);
      const yds = arr.map(p => num(p.tags.returnYards)).filter(x => x != null);
      return { n: arr.length, avg: yds.length ? +(yds.reduce((s, x) => s + x, 0) / yds.length).toFixed(1) : null, long: yds.length ? Math.max(...yds) : 0, td: arr.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length };
    };
    const returns = { kick: ret('Kick Return'), punt: ret('Punt Return') };
    return { punts, kickoffs, fg, returns, hasData: !!(punts.n || kickoffs.n || fg.att || returns.kick.n || returns.punt.n) };
  }

  _renderSpecialTeams(stats) {
    const st = stats.specialTeams;
    if (!st || !st.hasData) return '';
    const v = (x, suf = '') => (x == null ? '—' : x + suf);
    const kpi = (label, value, sub) => `<div class="gi-kpi"><div class="gi-kpi-label">${label}</div><div class="gi-kpi-value">${value}</div><div class="gi-kpi-sub">${sub}</div></div>`;
    const cards = [];
    if (st.punts.n) cards.push(kpi('Punts', st.punts.n, `${v(st.punts.grossAvg)} gross · ${v(st.punts.netAvg)} net · ${v(st.punts.hangAvg)}s hang · ${st.punts.tbPct}% TB`));
    if (st.kickoffs.n) cards.push(kpi('Kickoffs', st.kickoffs.n, `${v(st.kickoffs.avg)} avg · ${st.kickoffs.tbPct}% TB · ${v(st.kickoffs.retAllowedAvg)} ret allowed`));
    if (st.fg.att) cards.push(kpi('Field Goals', `${st.fg.made}/${st.fg.att}`, `${st.fg.pct}% · long ${st.fg.long}${st.fg.byDist.length ? ' · ' + st.fg.byDist.map(b => `${b.label} ${b.made}/${b.att}`).join(' · ') : ''}`));
    if (st.returns.kick.n) cards.push(kpi('Kick Returns', st.returns.kick.n, `${v(st.returns.kick.avg)} avg · long ${st.returns.kick.long}${st.returns.kick.td ? ` · ${st.returns.kick.td} TD` : ''}`));
    if (st.returns.punt.n) cards.push(kpi('Punt Returns', st.returns.punt.n, `${v(st.returns.punt.avg)} avg · long ${st.returns.punt.long}${st.returns.punt.td ? ` · ${st.returns.punt.td} TD` : ''}`));
    return `<div class="stats-section"><h3>Special Teams</h3><div class="gi-hero">${cards.join('')}</div></div>`;
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
      const conversions = downPlays.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;

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

    const firstDowns = plays.filter(p => gainedFirstDown(p.tags)).length;
    const thirdDown = byDown['3'];
    const thirdDownConv = thirdDown.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;
    const fourthDown = byDown['4'];
    const fourthDownConv = fourthDown.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;

    const ddBuckets = this._downDistanceBuckets(plays);

    return {
      byDown: downStats,
      totalFirstDowns: firstDowns,
      thirdDownConv: `${thirdDownConv}/${thirdDown.length}`,
      thirdDownPct: thirdDown.length ? ((thirdDownConv / thirdDown.length) * 100).toFixed(1) : '0.0',
      fourthDownConv: `${fourthDownConv}/${fourthDown.length}`,
      fourthDownPct: fourthDown.length ? ((fourthDownConv / fourthDown.length) * 100).toFixed(1) : '0.0',
      ddBuckets,
    };
  }

  _downDistanceBuckets(plays) {
    const buckets = [];
    const distBucket = d => d <= 3 ? 'Short' : d <= 6 ? 'Medium' : 'Long';
    const groups = {};
    plays.forEach(p => {
      const down = p.tags.down;
      const dist = parseInt(p.tags.distance, 10);
      if (!down || !dist) return;
      const bk = distBucket(dist);
      const key = `${down}-${bk}`;
      if (!groups[key]) groups[key] = { down, bucket: bk, plays: [] };
      groups[key].plays.push(p);
    });
    const order = { '1': 0, '2': 1, '3': 2, '4': 3 };
    const bOrder = { Short: 0, Medium: 1, Long: 2 };
    for (const g of Object.values(groups)) {
      const pl = g.plays;
      const n = pl.length;
      const runs = pl.filter(p => StatsEngine.isRun(p)).length;
      const passes = n - runs;
      const yards = pl.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      const conv = pl.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length;
      const succ = pl.filter(p => this._isSuccessfulPlay(p)).length;
      buckets.push({
        down: g.down, bucket: g.bucket, count: n,
        runs, passes,
        runPct: ((runs / n) * 100).toFixed(0),
        passPct: ((passes / n) * 100).toFixed(0),
        avgYards: (yards / n).toFixed(1),
        convPct: ((conv / n) * 100).toFixed(1),
        succPct: ((succ / n) * 100).toFixed(1),
        sortKey: order[g.down] * 10 + bOrder[g.bucket],
      });
    }
    buckets.sort((a, b) => a.sortKey - b.sortKey);
    return buckets;
  }

  _turnoverStats(plays) {
    const ints = plays.filter(p => StatsEngine.hasResult(p, 'Interception')).length;
    const fumbles = plays.filter(p => StatsEngine.hasResult(p, 'Fumble')).length;
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
      const isRun = StatsEngine.isRun(p);
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      // Play Type is multi-select ("RPO + Short Pass"); attribute to each.
      StatsEngine.splitPlayTypes(p.tags.playType).forEach(t => {
        playTypes[t] = (playTypes[t] || 0) + 1;
        if (!playTypeDetail[t]) playTypeDetail[t] = { name: t, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
        playTypeDetail[t].count++;
        if (isRun) playTypeDetail[t].runs++; else playTypeDetail[t].passes++;
        playTypeDetail[t].yards += yds;
        if (succ) playTypeDetail[t].successes++;
      });
    });
    const playTypeList = Object.values(playTypeDetail)
      .map(pt => ({ ...pt, avg: pt.count ? (pt.yards / pt.count).toFixed(1) : '0.0', successPct: pt.count ? ((pt.successes / pt.count) * 100).toFixed(0) : '0' }))
      .sort((a, b) => b.count - a.count);

    const runs = plays.filter(p => StatsEngine.isRun(p)).length;
    const passes = plays.length - runs;
    const runYds = plays.filter(p => StatsEngine.isRun(p)).reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
    const passYds = plays.filter(p => StatsEngine.isPass(p)).reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
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
      return yds >= 20 || StatsEngine.hasResult(p, 'Touchdown');
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

  // ===== Feature 2: Hash tendencies ====================================
  _hashStats(plays) {
    const hashes = {};
    plays.forEach(p => {
      const h = p.tags.hash;
      if (!h) return;
      if (!hashes[h]) hashes[h] = { name: h, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      hashes[h].count++;
      hashes[h].yards += parseInt(p.tags.yardage) || 0;
      if (StatsEngine.isRun(p)) hashes[h].runs++; else hashes[h].passes++;
      if (this._isSuccessfulPlay(p)) hashes[h].successes++;
    });
    const list = Object.values(hashes).map(h => ({
      ...h,
      runPct: h.count ? ((h.runs / h.count) * 100).toFixed(0) : '0',
      avg: h.count ? (h.yards / h.count).toFixed(1) : '0.0',
      successPct: h.count ? ((h.successes / h.count) * 100).toFixed(0) : '0',
    })).sort((a, b) => b.count - a.count);
    const formations = {};
    plays.forEach(p => {
      if (!p.tags.hash) return;
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
        const k = `${p.tags.hash}|${f}`;
        formations[k] = (formations[k] || 0) + 1;
      });
    });
    return { list, formations, hasData: list.length > 0 };
  }

  // ===== Feature 3: Personnel × Situation cross-tab =====================
  _personnelSituationStats(plays) {
    const combos = {};
    plays.forEach(p => {
      const pers = p.tags.personnel || '';
      if (!pers) return;
      const sit = this._situationBucket(p);
      const k = `${pers}|${sit}`;
      if (!combos[k]) combos[k] = { personnel: pers, situation: sit, count: 0, runs: 0, passes: 0, yards: 0, successes: 0 };
      combos[k].count++;
      combos[k].yards += parseInt(p.tags.yardage) || 0;
      if (StatsEngine.isRun(p)) combos[k].runs++; else combos[k].passes++;
      if (this._isSuccessfulPlay(p)) combos[k].successes++;
    });
    const list = Object.values(combos).map(c => ({
      ...c,
      runPct: c.count ? ((c.runs / c.count) * 100).toFixed(0) : '0',
      avg: c.count ? (c.yards / c.count).toFixed(1) : '0.0',
      successPct: c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0',
    })).filter(c => c.count >= 2).sort((a, b) => b.count - a.count);
    return { list, hasData: list.length > 0 };
  }

  _situationBucket(p) {
    const d = p.tags.down;
    const dist = parseInt(p.tags.distance) || 0;
    if (d === '1') return '1st Down';
    if (d === '2' && dist <= 3) return '2nd & Short';
    if (d === '2') return '2nd & Long';
    if (d === '3' && dist <= 3) return '3rd & Short';
    if (d === '3' && dist <= 6) return '3rd & Med';
    if (d === '3') return '3rd & Long';
    if (d === '4') return '4th Down';
    return 'Other';
  }

  // ===== Feature 4: Defensive front + coverage combos ====================
  _frontCoverageCombos(plays) {
    const combos = {};
    plays.forEach(p => {
      const cov = p.tags.coverage;
      if (!cov) return;
      StatsEngine.splitFronts(p.tags.defFront).forEach(front => {
        const k = `${front} + ${cov}`;
        if (!combos[k]) combos[k] = { name: k, front, coverage: cov, count: 0, yards: 0, successes: 0, havoc: 0, runs: 0, passes: 0 };
        const yds = parseInt(p.tags.yardage) || 0;
        combos[k].count++;
        combos[k].yards += yds;
        if (!this._isSuccessfulPlay(p)) combos[k].successes++;
        if (StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
            StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack')))
          combos[k].havoc++;
        if (StatsEngine.isRun(p)) combos[k].runs++; else combos[k].passes++;
      });
    });
    const list = Object.values(combos).map(c => ({
      ...c,
      avg: c.count ? (c.yards / c.count).toFixed(1) : '0.0',
      stopPct: c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0',
      havocPct: c.count ? ((c.havoc / c.count) * 100).toFixed(0) : '0',
    })).filter(c => c.count >= 2).sort((a, b) => b.count - a.count);
    return { list, hasData: list.length > 0 };
  }

  // ===== Feature 6: Play-action as first-class metric ====================
  _playActionStats(plays) {
    const paPlays = plays.filter(p => {
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      return types.includes('Play Action');
    });
    const dropbacks = plays.filter(p => StatsEngine.isPass(p));
    const straightDrops = dropbacks.filter(p => {
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      return !types.includes('Play Action');
    });

    const paRate = dropbacks.length ? ((paPlays.length / dropbacks.length) * 100).toFixed(1) : '0.0';
    const paComps = paPlays.filter(p => StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain'));
    const paAttempts = paPlays.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const paYards = paPlays.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);
    const straightComps = straightDrops.filter(p => StatsEngine.hasResult(p, 'Gain') || StatsEngine.hasResult(p, 'Touchdown') || StatsEngine.hasResult(p, 'No Gain'));
    const straightAttempts = straightDrops.filter(p => !StatsEngine.hasResult(p, 'Sack')).length;
    const straightYards = straightDrops.reduce((s, p) => {
      if (StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) return s;
      return s + (parseInt(p.tags.yardage) || 0);
    }, 0);

    const byFormation = {};
    paPlays.forEach(p => {
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
        if (!byFormation[f]) byFormation[f] = { name: f, count: 0, yards: 0, successes: 0 };
        byFormation[f].count++;
        byFormation[f].yards += parseInt(p.tags.yardage) || 0;
        if (this._isSuccessfulPlay(p)) byFormation[f].successes++;
      });
    });
    const formationList = Object.values(byFormation).map(f => ({
      ...f,
      avg: f.count ? (f.yards / f.count).toFixed(1) : '0.0',
      successPct: f.count ? ((f.successes / f.count) * 100).toFixed(0) : '0',
    })).sort((a, b) => b.count - a.count);

    return {
      paPlays: paPlays.length,
      paRate,
      paCompPct: paAttempts ? ((paComps.length / paAttempts) * 100).toFixed(1) : '0.0',
      paYPA: paAttempts ? (paYards / paAttempts).toFixed(1) : '0.0',
      straightCompPct: straightAttempts ? ((straightComps.length / straightAttempts) * 100).toFixed(1) : '0.0',
      straightYPA: straightAttempts ? (straightYards / straightAttempts).toFixed(1) : '0.0',
      formationList,
      hasData: paPlays.length > 0,
    };
  }

  // ===== Play direction + pre-snap motion tendencies =====================
  _directionMotionStats(plays) {
    const mk = name => ({ name, count: 0, runs: 0, passes: 0, yards: 0, succ: 0 });
    const finish = o => ({
      ...o,
      runPct: o.count ? ((o.runs / o.count) * 100).toFixed(0) : '0',
      passPct: o.count ? ((o.passes / o.count) * 100).toFixed(0) : '0',
      avg: o.count ? (o.yards / o.count).toFixed(1) : '0.0',
      succPct: o.count ? ((o.succ / o.count) * 100).toFixed(0) : '0',
    });
    const dirs = {};
    const motions = {};
    let motionTagged = 0;
    const noMotion = mk('No Motion');

    plays.forEach(p => {
      const yds = parseInt(p.tags.yardage) || 0;
      const isRun = StatsEngine.isRun(p);
      const succ = this._isSuccessfulPlay(p);
      const add = o => {
        o.count++; o.yards += yds;
        if (isRun) o.runs++; else o.passes++;
        if (succ) o.succ++;
      };
      if (p.tags.playDir) add(dirs[p.tags.playDir] || (dirs[p.tags.playDir] = mk(p.tags.playDir)));
      if (p.tags.motion) {
        motionTagged++;
        add(motions[p.tags.motion] || (motions[p.tags.motion] = mk(p.tags.motion)));
      } else {
        add(noMotion);
      }
    });

    const dirOrder = { Left: 0, Middle: 1, Right: 2 };
    const dirList = Object.values(dirs).map(finish)
      .sort((a, b) => (dirOrder[a.name] ?? 9) - (dirOrder[b.name] ?? 9));
    const motionList = Object.values(motions).map(finish).sort((a, b) => b.count - a.count);

    return {
      dirList,
      motionList,
      noMotion: finish(noMotion),
      hasDirData: dirList.length > 0,
      // Motion table only makes sense once the coach is actually tagging motion.
      hasMotionData: motionTagged > 0,
    };
  }

  // ===== Game Plan — categorized coaching insights =======================
  _generateTakeaways(stats) {
    const working = [];
    const fix = [];
    const MIN_N = 4;

    // --- Formation tendencies ---
    (stats.tendencies.formationList || []).forEach(f => {
      if (f.count < MIN_N) return;
      const runPct = f.count ? (f.runs / f.count) * 100 : 50;
      const succPct = parseFloat(f.successPct);
      if (succPct >= 55 && f.count >= 5)
        working.push({ s: succPct * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong>: ${succPct}% success (${f.count} plays, ${f.avg} avg)` });
      if (runPct >= 75)
        fix.push({ s: (runPct - 50) * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${runPct.toFixed(0)}% run — add a pass concept to keep the defense honest` });
      else if (runPct <= 25)
        fix.push({ s: (50 - runPct) * Math.min(f.count, 15), cut: ['formation', f.name], text: `<strong>${Charts._esc(f.name)}</strong> is ${(100 - runPct).toFixed(0)}% pass — mix in a draw or screen` });
    });

    // --- Down & distance buckets ---
    if (stats.downs?.ddBuckets) {
      stats.downs.ddBuckets.forEach(b => {
        if (b.count < MIN_N) return;
        const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
        const tag = `${labels[b.down]} & ${b.bucket}`;
        const conv = parseFloat(b.convPct);
        if (b.down === '3' || b.down === '4') {
          if (conv >= 55)
            working.push({ s: conv * Math.min(b.count, 12), cut: ['dd', `${b.down}|${b.bucket}`], text: `<strong>${tag}</strong>: converting ${conv}% (${b.count} plays, ${b.avgYards} avg)` });
          else if (conv <= 30)
            fix.push({ s: (50 - conv) * Math.min(b.count, 12), cut: ['dd', `${b.down}|${b.bucket}`], text: `<strong>${tag}</strong>: only ${conv}% conversion (${b.count} plays) — need a better call here` });
        }
      });
    }

    // --- Defensive coverage gaps ---
    if (stats.defensive?.coverages) {
      stats.defensive.coverages.forEach(c => {
        if (c.count < MIN_N) return;
        const avg = c.count ? c.yards / c.count : 0;
        const stopPct = c.count ? (c.successes / c.count) * 100 : 0;
        if (stopPct >= 65 && avg <= 4)
          working.push({ s: stopPct * Math.min(c.count, 10), cut: ['coverage', c.name], text: `<strong>${Charts._esc(c.name)}</strong>: ${stopPct.toFixed(0)}% stop rate, ${avg.toFixed(1)} avg allowed (${c.count} snaps)` });
        else if (avg >= 7)
          fix.push({ s: avg * Math.min(c.count, 10), cut: ['coverage', c.name], text: `<strong>${Charts._esc(c.name)}</strong> allowing ${avg.toFixed(1)} YPA (${c.count} snaps) — consider switching` });
      });
    }

    // --- Front+coverage combos ---
    if (stats.frontCoverageCombos?.list) {
      stats.frontCoverageCombos.list.forEach(c => {
        if (c.count < MIN_N) return;
        const stopPct = parseInt(c.stopPct);
        const avg = parseFloat(c.avg);
        if (stopPct >= 65 && avg <= 3.5)
          working.push({ s: stopPct * Math.min(c.count, 10), text: `<strong>${Charts._esc(c.name)}</strong>: ${stopPct}% stop rate, ${avg} avg (${c.count} snaps) — keep calling it` });
      });
    }

    // --- Play-action ---
    if (stats.playAction?.hasData && stats.tendencies.runs >= MIN_N) {
      const runPct = parseFloat(stats.tendencies.runPct);
      const paRate = parseFloat(stats.playAction.paRate);
      const paYPA = parseFloat(stats.playAction.paYPA);
      const straightYPA = parseFloat(stats.playAction.straightYPA);
      if (stats.playAction.paPlays >= 3 && paYPA > straightYPA + 2)
        working.push({ s: (paYPA - straightYPA) * 100, cut: ['playType', 'Play Action'], text: `Play-action: <strong>${paYPA} YPA</strong> vs ${straightYPA} straight — it's working, lean into it` });
      if (runPct >= 45 && paRate < 15)
        fix.push({ s: 600, text: `Running ${runPct}% of the time but only ${paRate}% play-action — opponents aren't being held by fakes` });
    }

    // --- Drive quality ---
    if (stats.drives?.total >= 3) {
      const d = stats.drives;
      if (d.threeAndOuts >= 3)
        fix.push({ s: d.threeAndOuts * 100, text: `<strong>${d.threeAndOuts} three-and-outs</strong> in ${d.total} drives — too many stalled possessions` });
      const ppd = parseFloat(d.pointsPerDrive);
      if (ppd >= 2.5)
        working.push({ s: ppd * 100, text: `Scoring <strong>${ppd} pts/drive</strong> — efficient possessions` });
      else if (ppd <= 1.0 && d.total >= 4)
        fix.push({ s: (2.5 - ppd) * 100, text: `Only <strong>${ppd} pts/drive</strong> — drives are stalling before the end zone` });
    }

    // --- Red zone ---
    if (stats.situational) {
      const rz = stats.situational.redZone;
      if (rz && rz.total >= MIN_N) {
        const tdPct = rz.total ? ((rz.tds / rz.total) * 100) : 0;
        if (tdPct >= 60)
          working.push({ s: tdPct * 5, cut: ['situation', 'redZone'], text: `Red zone TD rate <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — finishing drives` });
        else if (tdPct <= 25)
          fix.push({ s: (50 - tdPct) * 10, cut: ['situation', 'redZone'], text: `Red zone TD rate only <strong>${tdPct.toFixed(0)}%</strong> (${rz.tds}/${rz.total}) — settling for FGs or stalling` });
      }
    }

    // --- Explosive / negative rates ---
    if (stats.efficiency && stats.totalPlays >= 10) {
      const expPct = parseFloat(stats.efficiency.explosivePct);
      if (expPct >= 15)
        working.push({ s: expPct * 20, cut: ['situation', 'explosive'], text: `<strong>${expPct}%</strong> explosive play rate (${stats.efficiency.explosivePlays} plays) — hitting big shots` });
      const negPct = parseFloat(stats.efficiency.negativePct);
      if (negPct >= 15)
        fix.push({ s: negPct * 20, cut: ['situation', 'negative'], text: `<strong>${negPct}%</strong> negative play rate (${stats.efficiency.negativePlays} plays) — too many losses behind the line` });
    }

    // --- Hash predictability ---
    if (stats.hash?.hasData) {
      stats.hash.list.forEach(h => {
        if (h.count < MIN_N) return;
        const runPct = parseInt(h.runPct);
        if (runPct >= 70) fix.push({ s: (runPct - 50) * Math.min(h.count, 12), cut: ['hash', h.name], text: `<strong>${Charts._esc(h.name)} hash</strong>: ${runPct}% run (${h.count} snaps) — predictable` });
        else if (runPct <= 30) fix.push({ s: (50 - runPct) * Math.min(h.count, 12), cut: ['hash', h.name], text: `<strong>${Charts._esc(h.name)} hash</strong>: ${100 - runPct}% pass (${h.count} snaps) — predictable` });
      });
    }

    // --- Run direction lean ---
    if (stats.dirMotion?.hasDirData) {
      const dirRuns = stats.dirMotion.dirList.map(d => ({ name: d.name, runs: d.runs }));
      const totalDirRuns = dirRuns.reduce((s, d) => s + d.runs, 0);
      if (totalDirRuns >= 6) {
        dirRuns.forEach(d => {
          const pct = (d.runs / totalDirRuns) * 100;
          if (pct >= 60) fix.push({ s: (pct - 50) * Math.min(totalDirRuns, 12), cut: ['playDir', d.name], text: `<strong>${pct.toFixed(0)}%</strong> of runs go <strong>${Charts._esc(d.name)}</strong> (${d.runs}/${totalDirRuns}) — defenses will overload that side` });
        });
      }
    }

    // --- Motion tell ---
    if (stats.dirMotion?.hasMotionData) {
      const m = stats.dirMotion.motionList.reduce((acc, x) => ({ count: acc.count + x.count, runs: acc.runs + x.runs }), { count: 0, runs: 0 });
      if (m.count >= MIN_N) {
        const runPct = (m.runs / m.count) * 100;
        if (runPct >= 75) fix.push({ s: (runPct - 50) * Math.min(m.count, 12), cut: ['motion', 'Any'], text: `When you motion, you run <strong>${runPct.toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
        else if (runPct <= 25) fix.push({ s: (50 - runPct) * Math.min(m.count, 12), cut: ['motion', 'Any'], text: `When you motion, you pass <strong>${(100 - runPct).toFixed(0)}%</strong> of the time (${m.count} plays) — motion is a tell` });
      }
    }

    working.sort((a, b) => b.s - a.s);
    fix.sort((a, b) => b.s - a.s);
    return { working: working.slice(0, 5), fix: fix.slice(0, 5) };
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
      const isPass = StatsEngine.isPass(p);
      const isTD = StatsEngine.hasResult(p, 'Touchdown');
      const isComplete = StatsEngine.hasResult(p, 'Gain') || isTD || StatsEngine.hasResult(p, 'No Gain');
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
          // 'Good'/'Field Goal' (made) or a scoring result counts as made
          if (StatsEngine.hasResult(p, 'Good') || StatsEngine.hasResult(p, 'Field Goal') || StatsEngine.hasResult(p, 'Touchdown')) kickers[id].fgMade++;
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
        if (StatsEngine.hasResult(p, 'Fumble')) rushers[id].fumbles++;
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
        // Attempts = completions + incompletions + INTs (matches team C/A).
        if (isComplete || StatsEngine.hasResult(p, 'Incomplete') || StatsEngine.hasResult(p, 'Interception')) passers[id].attempts++;
        if (isComplete) {
          passers[id].completions++;
          passers[id].yards += yds;
        }
        if (isTD) passers[id].tds++;
        if (StatsEngine.hasResult(p, 'Interception')) passers[id].ints++;
        if (StatsEngine.hasResult(p, 'Sack')) passers[id].sacks++;
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

      // Tackler(s) — may be multiple for shared/assisted tackles. Credit each
      // listed jersey #. A play with 2+ tacklers marks each as an assist.
      const tacklerIds = StatsEngine.splitPlayers(players.tackler);
      const shared = tacklerIds.length > 1;
      const isDefPlay = p.tags.unit === 'defense';
      // Takeaway (INT / fumble recovery) goes to the dedicated role when set —
      // it doesn't imply a tackle. Plays tagged before the role existed fall
      // back to crediting the listed tackler(s), the old behavior.
      const takeawayIds = StatsEngine.splitPlayers(players.takeaway);
      const creditTakeawayViaTackler = isDefPlay && takeawayIds.length === 0;
      tacklerIds.forEach(id => {
        if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, solo: 0, assists: 0, sacks: 0, tfl: 0, ints: 0, fumblesRec: 0 };
        tacklers[id].tackles++;
        if (shared) tacklers[id].assists++; else tacklers[id].solo++;
        if (StatsEngine.hasResult(p, 'Sack')) tacklers[id].sacks++;
        // TFL excludes sacks — matches the team-level definition.
        else if (yds < 0) tacklers[id].tfl++;
        if (creditTakeawayViaTackler && StatsEngine.hasResult(p, 'Interception')) tacklers[id].ints++;
        if (creditTakeawayViaTackler && StatsEngine.hasResult(p, 'Fumble')) tacklers[id].fumblesRec++;
        if (p.tags.grades?.tackler != null) {
          if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
          if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
          tacklers[id].gradeSum += p.tags.grades.tackler;
          tacklers[id].gradeCount++;
        }
      });
      if (isDefPlay) {
        takeawayIds.forEach(id => {
          if (!tacklers[id]) tacklers[id] = { num: id, tackles: 0, solo: 0, assists: 0, sacks: 0, tfl: 0, ints: 0, fumblesRec: 0 };
          if (StatsEngine.hasResult(p, 'Interception')) tacklers[id].ints++;
          if (StatsEngine.hasResult(p, 'Fumble')) tacklers[id].fumblesRec++;
          if (p.tags.grades?.takeaway != null) {
            if (!tacklers[id].gradeSum) tacklers[id].gradeSum = 0;
            if (!tacklers[id].gradeCount) tacklers[id].gradeCount = 0;
            tacklers[id].gradeSum += p.tags.grades.takeaway;
            tacklers[id].gradeCount++;
          }
        });
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
    // Compute the self-scout once and reuse its defScout for both tabs —
    // generateSelfScout already produces defScout internally, so recomputing it
    // in _renderDefenseTabBody was duplicate work every dashboard open.
    const ssReport = this.generateSelfScout();
    const defScout = ssReport ? ssReport.defScout : this.generateDefensiveSelfScout();
    const selfScout = this._renderSelfScoutBody(ssReport, defScout);
    const defBody = this._renderDefenseTabBody(stats, defScout);
    const noData = stats.allPlays === 0;

    el.innerHTML = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>${this._gameTitle()}${stats.filterActive ? ' <span style="color:var(--highlight);font-size:14px">(Filtered)</span>' : ''}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnScoutOpp" title="Auto-scout this opponent from every game you've already tagged against them — no re-tagging">🔍 Scout Opponent</button>
              <button class="btn btn-sm" id="btnExportStats">Export PDF</button>
              <button class="btn btn-sm btn-danger" id="btnCloseStatsInner">Close</button>
            </div>
          </div>
          <div class="stats-tabs">
            <button class="stats-tab active" data-tab="game">Game</button>
            <button class="stats-tab" data-tab="offense">Offense</button>
            <button class="stats-tab" data-tab="defense">Defense</button>
            <button class="stats-tab" data-tab="selfscout">Self-Scout</button>
            <button class="stats-tab" data-tab="season">Season</button>
            <button class="stats-tab" data-tab="matchup">Matchup</button>
          </div>
          <div class="stats-body">
            <div class="stats-tab-pane active" data-pane="game">
              ${noData ? `<div style="text-align:center;padding:48px 24px;color:var(--text-dim)">
                <div style="font-size:36px;margin-bottom:12px">📊</div>
                <div style="font-size:16px;font-weight:600;margin-bottom:8px">No tagged plays yet</div>
                <div style="font-size:13px;line-height:1.5">Tag plays with Play Type + Result + Yardage to see stats.<br>
                Down & Distance adds conversion rates. Formation adds tendencies.</div>
              </div>` : ''}
              <div class="stats-cut-hint">▶ Tip: click any highlighted stat row to watch those exact plays as a film cut-up.</div>
              ${this._renderScoreboard(stats)}
              ${this._renderTeamStats(stats)}
              ${this._renderKpiHero(stats)}
              ${this._renderTakeaways(stats)}
              ${this._renderDownAnalysis(stats)}
              <div class="gi-card-grid">
                ${this._renderEfficiency(stats)}
                ${this._renderDrives(stats)}
                ${this._renderConversions(stats)}
                ${this._renderBigPlays(stats)}
              </div>
              ${this._renderGameFlow(stats)}
              ${this._renderDriveChart(stats)}
              ${this._renderSpecialTeams(stats)}
            </div>
            <div class="stats-tab-pane" data-pane="offense">
              ${this._renderOffenseHero(stats)}
              ${this._renderPlayAction(stats)}
              ${this._renderTendencies(stats)}
              ${this._renderBigTwelve(stats.offPlays, document.getElementById('gameTeamName')?.value || 'Our Offense')}
              ${this._renderPersonnel(stats)}
              ${this._renderBackfieldStrength(stats)}
              ${this._renderDirectionMotion(stats)}
              ${this._renderHashStats(stats)}
              ${this._renderPersonnelSituation(stats)}
              ${this._renderTendencyMatrix(stats)}
              ${this._renderSituational(stats)}
              ${this.heatMaps.render(stats.offPlays)}
              ${Visualizations.render(stats.offPlays)}
              ${this._renderAdvanced(stats)}
              ${this._renderIndividualStats(stats, 'offense')}
              ${this._renderIndividualStats(stats, 'special')}
            </div>
            <div class="stats-tab-pane" data-pane="defense">
              ${defBody}
              ${this._renderIndividualStats(stats, 'defense')}
            </div>
            <div class="stats-tab-pane" data-pane="selfscout">
              ${selfScout}
            </div>
            <div class="stats-tab-pane" data-pane="season" data-season-loaded="0">
              <div class="season-tab-placeholder" style="padding:40px 24px;text-align:center;color:var(--gi-dim,#93a1b2)">Loading season stats…</div>
            </div>
            <div class="stats-tab-pane" data-pane="matchup" data-matchup-loaded="0">
              <div style="padding:40px 24px;text-align:center;color:var(--gi-dim,#93a1b2)">Loading matchup…</div>
            </div>
          </div>
        </div>
      </div>
    `;

    // Tab switching (remember the last tab so re-opening lands where the
    // coach left off instead of resetting to Game every time)
    el.querySelectorAll('.stats-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        el.querySelectorAll('.stats-tab').forEach(t => t.classList.remove('active'));
        el.querySelectorAll('.stats-tab-pane').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const pane = el.querySelector(`.stats-tab-pane[data-pane="${tab.dataset.tab}"]`);
        pane.classList.add('active');
        // Season tab aggregates every game — render it lazily on first open and
        // reuse SeasonManager's single season render (inherits the .stats-overlay
        // broadcast-dark look). Cut-ups across games are deferred (rows inert).
        if (tab.dataset.tab === 'season' && pane.dataset.seasonLoaded !== '1') {
          pane.innerHTML = (window.app && window.app.season && window.app.season.statsHtml)
            ? window.app.season.statsHtml()
            : '<div style="padding:40px;text-align:center;color:var(--gi-dim,#93a1b2)">Season stats unavailable — open a season first.</div>';
          pane.dataset.seasonLoaded = '1';
          try { this.heatMaps.bind(pane); } catch (e) {}
          try { this._makeSortable(pane); } catch (e) {}
          try { this._wireSubtabs(pane); } catch (e) {}
        }
        // Matchup: your offense vs a scouted opponent's defense (cross-game).
        if (tab.dataset.tab === 'matchup' && pane.dataset.matchupLoaded !== '1') {
          try { this._renderMatchupInto(pane); } catch (e) { pane.innerHTML = '<div style="padding:40px;text-align:center;color:var(--gi-dim,#93a1b2)">Matchup unavailable.</div>'; }
          pane.dataset.matchupLoaded = '1';
        }
        this._lastTab = tab.dataset.tab;
      });
    });
    if (this._lastTab && this._lastTab !== 'game') {
      el.querySelector(`.stats-tab[data-tab="${this._lastTab}"]`)?.click();
    }

    // Rebind close button
    el.querySelector('#btnCloseStatsInner').addEventListener('click', () => this.hideDashboard());

    // Export button
    el.querySelector('#btnExportStats').addEventListener('click', () => this._exportStats(stats));
    const scoutOppBtn = el.querySelector('#btnScoutOpp');
    if (scoutOppBtn) scoutOppBtn.addEventListener('click', () => this.renderOpponentScout(this._activeOpponent()));

    // Self-scout export
    el.querySelector('#btnExportSelfScout')?.addEventListener('click', () => {
      const report = this.generateSelfScout();
      if (report) this._exportSelfScout(report, document.getElementById('gameTeamName')?.value || 'Our Offense');
    });

    // Defensive report export
    el.querySelector('#btnExportDef')?.addEventListener('click', () => {
      const team = document.getElementById('gameTeamName')?.value || 'Our Defense';
      this._exportDefensiveReport(stats, team);
    });

    // Heat map tab switching
    this.heatMaps.bind(el);

    // Click a player's stat row to jump to their first play on film.
    el.querySelectorAll('.player-row').forEach(row => {
      row.title = "Jump to this player's plays";
      row.addEventListener('click', () => this._watchPlayer(row.dataset.player));
    });

    // Click-to-sort leaderboard tables (Offense/Defense/ST individual stats).
    this._makeSortable(el);

    // "Every data point ties to video": click any tagged stat row to launch a
    // film cut-up of exactly those plays.
    el.querySelectorAll('.cut-row[data-cut-type]').forEach(row => {
      row.title = row.dataset.cutLabel ? `Watch: ${row.dataset.cutLabel}` : 'Watch these plays';
      row.addEventListener('click', () => {
        const filter = this._buildCutFilter(row.dataset.cutType, row.dataset.cutVal);
        this._watchPlays(filter, row.dataset.cutLabel || '');
      });
    });

    // Drive-chart rows carry their own play ids (drives are reconstructed, not a
    // single tag), so they film by id membership rather than _buildCutFilter.
    el.querySelectorAll('.drive-row[data-drive-ids]').forEach(row => {
      row.addEventListener('click', () => {
        const ids = new Set((row.dataset.driveIds || '').split(',').filter(Boolean));
        if (ids.size) this._watchPlays(p => ids.has(String(p.id)), row.querySelector('.drive-num')?.textContent || 'Drive');
      });
    });

    // Tendency matrix dimension pickers
    this._bindTendencyMatrix(el);

    // Click overlay to close
    el.querySelector('.stats-overlay').addEventListener('click', (e) => {
      if (e.target.classList.contains('stats-overlay')) this.hideDashboard();
    });
  }

  _renderSelfScoutBody(report, defScout) {
    // No classifiable OFFENSIVE plays must not blank the DEFENSIVE half —
    // a defense-heavy game still gets its scheme-tell analysis.
    if (!report) {
      return `<div class="stats-section"><p style="opacity:.6">No offensive run/pass plays tagged yet. Tag your offense to see tendency analysis.</p></div>
        ${this._defScoutBlock(defScout)}`;
    }
    const mc = StatsEngine._meterColor(report.predictability);
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="btnExportSelfScout">Export Report</button></div>
      <div class="stats-section">
        <h3>Predictability (${report.totalPlays} run/pass plays)</h3>
        <div class="ss-meter-wrap">
          <div class="ss-meter"><div class="ss-meter-fill" style="width:${report.predictability}%;background:${mc}"></div></div>
          <div class="ss-meter-val" style="color:${mc}">${report.predictability}<span>/100</span></div>
          <div class="ss-meter-label">${report.predLabel}</div>
        </div>
        <p class="viz-caption">Higher = more predictable. A defensive coordinator reads these same numbers — aim to keep key situations balanced.</p>
      </div>
      <div class="stats-section">
        <h3>Your Top Tells</h3>
        ${this._selfScoutTellsTable(report.tells)}
      </div>
      ${this._renderSelfScoutMatrix(report.matrix)}
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
      ${this._renderPersonnelDiversity(report.personnelDiversity)}
      ${report.insights.length ? `<div class="stats-section ss-insights-section">
        <h3>Film Room Insights</h3>
        <div class="ss-insights">${report.insights.map(ins => `<div class="ss-insight ss-insight-${ins.type}">
          <span class="ss-insight-tag ss-tag-${ins.type}">${ins.tag}</span>
          <span class="ss-insight-text">${ins.text}</span>
        </div>`).join('')}</div>
      </div>` : ''}
      ${this._defScoutBlock(defScout)}`;
  }

  /** Render the defensive self-scout section, or its diagnostic empty state.
   *  Single source for the "sufficient? section : empty" decision so the
   *  several call sites can't drift. showEmpty=false suppresses the empty
   *  state where another section already explains the gap (the Defense tab). */
  _defScoutBlock(ds, showEmpty = true) {
    if (ds && !ds.insufficient) return this._renderDefScoutSection(ds);
    return showEmpty ? this._defScoutEmptyState(ds) : '';
  }

  _renderDefenseTabBody(stats, defScout) {
    const hasData = stats.defensive.hasData;
    if (!hasData) return `
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
    return `
      <div style="display:flex;justify-content:flex-end;margin-bottom:8px"><button class="btn btn-sm" id="btnExportDef">Export Report</button></div>
      ${this._renderDefensive(stats)}
      ${this._renderFrontCoverageCombos(stats)}
      ${this._defScoutBlock(defScout, false)}`;
  }

  /** Play every snap this jersey # is involved in, back-to-back (cut-up). */
  _watchPlayer(num) {
    if (!num) return;
    this._watchPlays(p => {
      const pl = p.tags.players || {};
      // Player values may hold multiple jersey #s (e.g. shared tackles).
      return Object.values(pl).some(v => StatsEngine.splitPlayers(v).includes(String(num)));
    }, `${this._playerLabel(num)} — cut-up`);
  }

  /**
   * Play every snap matching `filter` back-to-back (cut-up). Shared by player
   * rows and every clickable stat row. Only plays with a real video region are
   * playable; if none match (e.g. stats-only imported plays), fall back to
   * selecting the first match so the click is never a silent no-op.
   */
  _watchPlays(filter, label) {
    if (typeof filter !== 'function') return;
    // Stats were computed over the filtered pool — the cut-up must match it,
    // or the row's count and what actually plays disagree.
    let pool = this.tagger.plays.filter(p => p && p.tags);
    if (this.filter && this.filter.active) pool = this.filter.filter(pool);
    const matches = pool
      .filter(p => filter(p))
      .sort((a, b) => (a.timestamp?.start || 0) - (b.timestamp?.start || 0));
    if (matches.length === 0) return;
    const playable = matches.filter(p => p.timestamp && p.timestamp.end > p.timestamp.start);
    this.hideDashboard();
    const ids = (playable.length ? playable : matches).map(p => p.id);
    if (playable.length && window.app && window.app.cutupPlayer) {
      window.app.cutupPlayer.start(ids, label || `${ids.length} plays`);
    } else {
      this.tagger.selectPlay(ids[0]);
      this.tagger.toast?.('No video on these plays — selected the first one instead');
    }
  }

  /**
   * Build a play-filter predicate for a clickable stat row. Offense-tagged
   * dimensions (formation, play type, down, situation) match our offensive
   * plays; defensive dimensions (front/coverage/blitz) match our defensive
   * plays — mirroring how the dashboard partitions stats by unit.
   */
  // The "Big 12": the handful of formation·strength·motion → play calls that make
  // up the bulk of an offense's snaps. Hudl's scouting axiom — most teams live in
  // ~8-14 calls (≈90% of snaps); find them and you've found the offense. Pure
  // rollup over data already tagged. The call signature is the EXACT tagged look,
  // so the cut-up plays precisely those snaps.
  _bigTwelveData(plays) {
    const off = (plays || []).filter(p => p && p.tags && (p.tags.unit || 'offense') === 'offense'
      && (StatsEngine.isRun(p) || StatsEngine.isPass(p)));
    const total = off.length;
    const map = {};
    off.forEach(p => {
      const t = p.tags;
      const form = (t.formation || '').trim(), str = (t.strength || '').trim();
      const mot = (t.motion || '').trim(), pt = (t.playType || '').trim();
      const key = [form, str, mot, pt].join('|||');
      const e = map[key] || (map[key] = { key, form, str, mot, pt, n: 0, runs: 0, yards: 0, succ: 0 });
      e.n++;
      if (StatsEngine.isRun(p)) e.runs++;
      e.yards += parseInt(t.yardage, 10) || 0;
      if (this._isSuccessfulPlay(p)) e.succ++;
    });
    const calls = Object.values(map).sort((a, b) => b.n - a.n);
    let cum = 0;
    calls.forEach(c => { c.pct = total ? Math.round(c.n / total * 100) : 0; cum += c.n; c.cumPct = total ? Math.round(cum / total * 100) : 0; });
    const callsTo = (target) => { let s = 0; for (let i = 0; i < calls.length; i++) { s += calls[i].n; if (total && s / total * 100 >= target) return i + 1; } return calls.length; };
    return { calls, total, unique: calls.length, to75: callsTo(75), to90: callsTo(90) };
  }

  _renderBigTwelve(plays, label, opts = {}) {
    const d = this._bigTwelveData(plays);
    if (d.total < 8) return '';   // too few snaps to call it a tendency
    const esc = Charts._esc;
    const cut = opts.cut !== false;
    const rows = d.calls.slice(0, 15).map((c, i) => {
      const name = `${esc(c.form || '—')}`
        + (c.str ? ` <span class="bt-tag">${esc(c.str)}</span>` : '')
        + (c.mot ? ` <span class="bt-tag bt-mot">${esc(c.mot)} mo</span>` : '')
        + ` <span class="bt-arrow">→</span> ${esc(c.pt || '—')}`;
      const runPct = c.n ? Math.round(c.runs / c.n * 100) : 0;
      const avg = c.n ? (c.yards / c.n).toFixed(1) : '0.0';
      const succ = c.n ? Math.round(c.succ / c.n * 100) : 0;
      const cls = `bt-row${i < d.to90 ? ' bt-in90' : ''}`;
      const cutAttr = cut
        ? ` cut-row" data-cut-type="bigCall" data-cut-val="${esc(c.key)}" data-cut-label="${esc((c.form || '—') + ' ' + (c.pt || ''))} — ${c.n} plays"`
        : '"';
      return `<tr class="${cls}${cutAttr}><td>${i + 1}</td><td class="bt-call">${Charts._esc(name)}</td><td>${c.n}</td><td>${c.pct}%</td><td>${c.cumPct}%</td><td>${runPct}% R</td><td>${avg}</td><td>${succ}%</td></tr>`;
    }).join('');
    const more = d.unique > 15 ? `<p class="self-scout-intro" style="margin-top:6px">…and ${d.unique - 15} more rare looks.</p>` : '';
    return `<div class="stats-section">
      <h3>The “Big ${d.to90}” — ${esc(label)}'s Core Calls</h3>
      <p class="self-scout-intro"><b>${d.to90} call${d.to90 !== 1 ? 's' : ''}</b> make up ~90% of ${esc(label)}'s offense (just <b>${d.to75}</b> = 75%), out of ${d.unique} unique looks across ${d.total} snaps. Find these and you've found the offense.${cut ? ' Click a row to watch it.' : ''}</p>
      <table class="stats-table stats-table-full bt-table">
        <thead><tr><th>#</th><th>Call — formation · strength · motion → play</th><th>Plays</th><th>%</th><th>Cum%</th><th>Run</th><th>Yds</th><th>Succ</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>${more}</div>`;
  }

  _buildCutFilter(type, val) {
    const isOff = p => (p.tags.unit || 'offense') === 'offense';
    const isDef = p => p.tags.unit === 'defense';
    const absYL = p => this._absYardLine(p.tags);
    switch (type) {
      case 'formation': return p => isOff(p) && StatsEngine.splitFormations(p.tags.formation).includes(val);
      case 'playType':  return p => isOff(p) && StatsEngine.splitPlayTypes(p.tags.playType).includes(val);
      case 'personnel': return p => isOff(p) && (p.tags.personnel || '') === val;
      case 'backfield': return p => isOff(p) && (p.tags.backfield || '') === val;
      case 'strength':  return p => isOff(p) && (p.tags.strength || '') === val;
      case 'comboFStr': { const [form, str] = val.split('__'); return p => isOff(p) && StatsEngine.splitFormations(p.tags.formation).includes(form) && (p.tags.strength || '') === str; }
      case 'bigCall': {  // an exact "Big 12" call: formation|||strength|||motion|||playType
        const [form, str, mot, pt] = val.split('|||');
        return p => isOff(p) && (p.tags.formation || '').trim() === (form || '')
          && (p.tags.strength || '').trim() === (str || '')
          && (p.tags.motion || '').trim() === (mot || '')
          && (p.tags.playType || '').trim() === (pt || '');
      }
      case 'down':      return p => isOff(p) && (p.tags.down || '') === val;
      case 'runpass':   return p => isOff(p) && (val === 'Run' ? StatsEngine.isRun(p) : StatsEngine.isPass(p));
      case 'playDir':   return p => isOff(p) && (p.tags.playDir || '') === val;
      case 'motion':    return p => isOff(p) && (val === 'No Motion' ? !p.tags.motion
                                  : val === 'Any' ? !!p.tags.motion
                                  : (p.tags.motion || '') === val);
      case 'hash':      return p => isOff(p) && (p.tags.hash || '') === val;
      case 'dd': {      // down + distance bucket, e.g. "3|Long"
        const [down, bucket] = val.split('|');
        return p => isOff(p) && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'ddDef': {   // same situation bucket, but our defensive snaps
        const [down, bucket] = val.split('|');
        return p => isDef(p) && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'comboFD': { // formation on a down+distance bucket, e.g. "Shotgun__3|Long"
        const [form, dd] = val.split('__');
        const [down, bucket] = (dd || '').split('|');
        return p => isOff(p) && StatsEngine.splitFormations(p.tags.formation).includes(form)
          && p.tags.down === down && (parseInt(p.tags.distance) || 0) > 0
          && StatsEngine._distBucket(parseInt(p.tags.distance)) === bucket;
      }
      case 'comboFS': { // formation on a heat-map situation, e.g. "Shotgun__3|Long" or "I-Form__1"
        const [form, sit] = val.split('__');
        const sp = this._situationPred(sit || '');
        return p => isOff(p) && StatsEngine.splitFormations(p.tags.formation).includes(form) && sp(p);
      }
      case 'defFront':  return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(val);
      case 'coverage':  return p => isDef(p) && (p.tags.coverage || '') === val;
      case 'blitz':     return p => isDef(p) && StatsEngine.splitBlitzes(p.tags.blitz).includes(val);
      case 'frontCoverage': {
        const [front, cov] = val.split('|');
        return p => isDef(p) && StatsEngine.splitFronts(p.tags.defFront).includes(front) && (p.tags.coverage || '') === cov;
      }
      case 'situation': {
        switch (val) {
          case 'redZone':    return p => isOff(p) && absYL(p) !== null && absYL(p) >= 80;
          case 'goalLine':   return p => isOff(p) && absYL(p) !== null && absYL(p) >= 95;
          case 'backedUp':   return p => isOff(p) && absYL(p) !== null && absYL(p) <= 10;
          case 'thirdLong':  return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7;
          case 'thirdShort': return p => isOff(p) && p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 1 && (parseInt(p.tags.distance) || 0) <= 3;
          case 'explosive':  return p => isOff(p) && (StatsEngine.isRun(p) ? (parseInt(p.tags.yardage) || 0) >= 12 : (parseInt(p.tags.yardage) || 0) >= 16);
          case 'negative':   return p => isOff(p) && (parseInt(p.tags.yardage) || 0) < 0;
          default: return null;
        }
      }
      default: return null;
    }
  }

  _gameTitle() {
    const esc = Charts._esc;
    // projectName is derived (week + opponent) and lives on gameInfo now — there
    // is no #gameProjectName input.
    const name = esc((window.app && window.app.storage && window.app.storage.gameInfo && window.app.storage.gameInfo.projectName) || '');
    const t = esc(document.getElementById('gameTeamName')?.value || '');
    const o = esc(document.getElementById('gameOpponent')?.value || '');
    const u = document.getElementById('gameScoreUs')?.value;
    const th = document.getElementById('gameScoreThem')?.value;
    const d = esc(document.getElementById('gameDate')?.value || '');
    let title = 'Game Stats';
    if (name) title = name;
    else if (t || o) title = `${t || 'Us'} vs ${o || 'Opponent'}`;
    if (u !== '' && th !== '' && u != null && th != null) title += ` &mdash; ${esc(u)}-${esc(th)}`;
    if (d) title += ` (${d})`;
    return title;
  }

  _renderEfficiency(stats) {
    const e = stats.efficiency;
    const t = stats.tendencies;
    const succColor = parseFloat(e.successRate) >= 50 ? '#22c55e' : parseFloat(e.successRate) >= 35 ? '#f59e0b' : '#ef4444';
    const runSuccColor = parseFloat(t.runSuccRate) >= 50 ? '#22c55e' : parseFloat(t.runSuccRate) >= 35 ? '#f59e0b' : '#ef4444';
    const passSuccColor = parseFloat(t.passSuccRate) >= 50 ? '#22c55e' : parseFloat(t.passSuccRate) >= 35 ? '#f59e0b' : '#ef4444';
    return `
      <div class="stats-section">
        <h3>Efficiency</h3>
        <div class="eff-gauges-row">
          ${Charts.gauge(parseFloat(e.successRate), 'Success Rate', succColor, 110, SUCCESS_RATE_TIP)}
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
        `<tr><td>${Charts._esc(r.name)}</td><td>${r.count}</td><td class="${epaClass(r.total)}">${fmt(r.total)}</td><td class="${epaClass(r.perPlay)}">${fmt(r.perPlay)}</td></tr>`
      ).join('');
      const note = rows.length > 8
        ? `<div style="font-size:11px;opacity:.6;margin:2px 0 6px">Top 8 of ${rows.length} by EPA/play</div>` : '';
      return `<div><h4 style="margin:8px 0 4px">${title}</h4>
        <table class="stats-table stats-table-full epa-table">
          <thead><tr><th>${title}</th><th>#</th><th>EPA</th><th>EPA/Play</th></tr></thead>
          <tbody>${body}</tbody>
        </table>${note}</div>`;
    };

    const playRow = (x) => {
      const t = x.play.tags || {};
      const label = `${t.down || '?'}&${t.distance || '?'} ${t.formation || ''} ${t.playType || ''}`.trim();
      return `<tr><td>#${x.play.id}</td><td>${Charts._esc(label)}</td><td>${t.yardage || 0}</td><td class="${epaClass(x.epa)}">${fmt(x.epa)}</td></tr>`;
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

  _renderScoreboard(stats) {
    const sb = stats.scoreboard;
    if (!sb || !sb.hasData) return '';
    const team = Charts._esc(document.getElementById('gameTeamName')?.value || 'Us');
    const opp = Charts._esc(document.getElementById('gameOpponent')?.value || 'Opponent');
    const winColor = '#22c55e', loseColor = '#ef4444', tieColor = 'var(--text)';
    const usColor = sb.us > sb.them ? winColor : sb.us < sb.them ? loseColor : tieColor;
    const themColor = sb.them > sb.us ? winColor : sb.them < sb.us ? loseColor : tieColor;

    // Per-quarter table. Show all four quarters (zeros included) so the row
    // reads like a real scoreboard; points from plays with no quarter tag go
    // into an "N/Q" column so the quarters always sum to the Final.
    let qTable = '';
    if (Object.keys(sb.byQuarter).length) {
      const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
      if (sb.byQuarter['OT']) quarters.push('OT');
      const qUs = quarters.reduce((s, q) => s + (sb.byQuarter[q]?.us || 0), 0);
      const qThem = quarters.reduce((s, q) => s + (sb.byQuarter[q]?.them || 0), 0);
      const untrackedUs = sb.us - qUs;
      const untrackedThem = sb.them - qThem;
      const hasUntracked = untrackedUs > 0 || untrackedThem > 0;
      const head = quarters.map(q => `<th>${q}</th>`).join('') + (hasUntracked ? '<th title="Scoring plays with no quarter tag">N/Q</th>' : '');
      const usRow = quarters.map(q => `<td>${sb.byQuarter[q]?.us || 0}</td>`).join('') + (hasUntracked ? `<td>${untrackedUs}</td>` : '');
      const themRow = quarters.map(q => `<td>${sb.byQuarter[q]?.them || 0}</td>`).join('') + (hasUntracked ? `<td>${untrackedThem}</td>` : '');
      qTable = `
        <table class="stats-table scoreboard-quarters">
          <thead><tr><th></th>${head}<th>Final</th></tr></thead>
          <tbody>
            <tr><td>${team}</td>${usRow}<td><strong>${sb.us}</strong></td></tr>
            <tr><td>${opp}</td>${themRow}<td><strong>${sb.them}</strong></td></tr>
          </tbody>
        </table>${hasUntracked ? '<p class="viz-caption">N/Q = scoring plays missing a Quarter tag.</p>' : ''}`;
    }
    return `
      <div class="stats-section">
        <h3>Scoreboard</h3>
        <div class="scoreboard-final">
          <div class="scoreboard-team">
            <div class="scoreboard-name">${team}</div>
            <div class="scoreboard-pts" style="color:${usColor}">${sb.us}</div>
          </div>
          <div class="scoreboard-sep">–</div>
          <div class="scoreboard-team">
            <div class="scoreboard-name">${opp}</div>
            <div class="scoreboard-pts" style="color:${themColor}">${sb.them}</div>
          </div>
        </div>
        ${qTable}
        <p class="viz-caption">Tracked live from tagged scoring plays (TD = 6, FG = 3, XP = 1, 2-Pt = 2). Offense &amp; Special Teams plays score for ${team}; Defense plays score for ${opp}.</p>
      </div>`;
  }

  _renderConversions(stats) {
    const c = stats.conversions;
    if (!c || !c.hasData) return '';
    const card = (label, d) => {
      if (!d.att) return '';
      const color = d.pct >= 60 ? '#22c55e' : d.pct >= 40 ? '#f59e0b' : '#ef4444';
      return `${Charts.gauge(d.pct, `${label} ${d.made}/${d.att}`, color, 110)}`;
    };
    const cards = [card('2-Point', c.two), card('PAT (XP)', c.xp)].filter(Boolean).join('');
    return `
      <div class="stats-section">
        <h3>PAT &amp; 2-Point Conversions</h3>
        <div class="sit-gauges-row">${cards}</div>
        <p class="viz-caption">Tag the ST Play Type (2-Pt / XP) and pick <b>Good</b> or <b>No Good</b> in Result to chart conversion success.</p>
      </div>`;
  }

  _renderSituational(stats) {
    const s = stats.situational;
    const row = (label, b, key) => b.total === 0 ? '' :
      `<tr class="cut-row" data-cut-type="situation" data-cut-val="${key}" data-cut-label="${label} — ${b.total} plays"><td>${label}</td><td>${b.total}</td><td>${b.yards}</td><td>${b.avg}</td><td>${b.successPct}%</td><td>${b.tds}</td></tr>`;
    const rows = [
      row('Red Zone', s.redZone, 'redZone'),
      row('Goal Line', s.goalLine, 'goalLine'),
      row('Backed Up', s.backedUp, 'backedUp'),
      row('3rd & Long', s.thirdLong, 'thirdLong'),
      row('3rd & Short', s.thirdShort, 'thirdShort')
    ].filter(Boolean).join('');
    if (!rows) return '';

    const rzPct = s.redZone.total ? Math.round(s.redZone.tds / s.redZone.total * 100) : 0;
    const rzColor = rzPct >= 60 ? '#22c55e' : rzPct >= 40 ? '#f59e0b' : '#ef4444';
    const buPct = parseFloat(s.backedUp.successPct) || 0;
    const buColor = buPct >= 45 ? '#22c55e' : buPct >= 30 ? '#f59e0b' : '#ef4444';

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
    const colorMap = { TD: '#22c55e', FG: '#3b82f6', Safety: '#a78bfa', Punt: '#6b7280', Turnover: '#ef4444', Kneel: '#4b5563', Other: '#f59e0b' };
    const outcomeCounts = {};
    d.list.forEach(dr => { outcomeCounts[dr.outcome] = (outcomeCounts[dr.outcome] || 0) + 1; });
    const outcomeDonut = Charts.donutWithLegend(
      Object.entries(outcomeCounts).map(([k, v]) => ({ value: v, color: colorMap[k] || '#aaa', label: k })),
      100, String(d.total), 'drives'
    );

    let rows = '';
    const maxYds = Math.max(1, ...d.list.map(dr => Math.abs(dr.yards)));
    for (const dr of d.list) {
      const color = colorMap[dr.outcome] || '#aaa';
      const barPct = Math.max(3, (Math.abs(dr.yards) / maxYds) * 100);
      const startLabel = dr.startYL != null ? (dr.startYL > 50 ? `Opp ${100 - dr.startYL}` : `Own ${dr.startYL}`) : '';
      rows += `<div class="drive-row">
        <span class="drive-num">${dr.number}</span>
        <div class="drive-bar"><div style="background:${color};height:100%;width:${barPct.toFixed(1)}%;border-radius:3px"></div></div>
        <span class="drive-meta">${startLabel ? startLabel + ' · ' : ''}${dr.plays}pl · ${dr.yards}yd</span>
        <span class="drive-outcome" style="color:${color}">${dr.outcome}</span>
      </div>`;
    }
    return `
      <div class="stats-section">
        <h3>Drives</h3>
        <div class="drives-top-row">
          <div class="stats-grid stats-grid-flex">
            <div class="stat-card"><div class="stat-card-title">Scoring</div><div class="stat-card-value">${d.scoringDrives}/${d.total}</div></div>
            <div class="stat-card"><div class="stat-card-title">Pts/Drive</div><div class="stat-card-value">${d.pointsPerDrive}</div></div>
            <div class="stat-card"><div class="stat-card-title">3 &amp; Out</div><div class="stat-card-value">${d.threeAndOuts}</div></div>
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

  // ===== Game Plan render ================================================
  _renderTakeaways(stats) {
    const t = stats.takeaways;
    if (!t || (!t.working?.length && !t.fix?.length)) return '';
    // Items that map to a play set are clickable straight into a cut-up —
    // the headline insight shouldn't be the one thing you can't watch.
    const renderList = (items, cls) => items.map(i => {
      const cutAttrs = i.cut ? ` data-cut-type="${i.cut[0]}" data-cut-val="${Charts._esc(i.cut[1])}" data-cut-label="Game Plan" role="button" tabindex="0"` : '';
      return `<li class="gp-item gp-${cls}${i.cut ? ' cut-row' : ''}"${cutAttrs}>${i.text}</li>`;
    }).join('');
    const workingHtml = t.working?.length
      ? `<div class="gp-col"><h4 class="gp-head gp-head-good">What's Working</h4><ul class="gp-list">${renderList(t.working, 'good')}</ul></div>` : '';
    const fixHtml = t.fix?.length
      ? `<div class="gp-col"><h4 class="gp-head gp-head-fix">Needs Work</h4><ul class="gp-list">${renderList(t.fix, 'fix')}</ul></div>` : '';
    return `
      <div class="stats-section game-plan-section">
        <h3>Game Plan</h3>
        <div class="gp-grid">${workingHtml}${fixHtml}</div>
      </div>`;
  }

  // ===== Feature 2 render: Hash Tendencies ==============================
  _renderHashStats(stats) {
    if (!stats.hash || !stats.hash.hasData) return '';
    let rows = '';
    for (const h of stats.hash.list) {
      const runPct = parseInt(h.runPct);
      const bar = Charts.stackBar([{ value: h.runs, color: RUN_COLOR, label: 'Run' }, { value: h.passes, color: PASS_COLOR, label: 'Pass' }]);
      rows += `<tr><td>${Charts._esc(h.name)}</td><td>${h.count}</td><td>${bar}</td><td>${h.runPct}%</td><td>${h.avg}</td><td>${h.successPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Hash Tendencies</h3>
        <table class="stats-table"><thead><tr><th>Hash</th><th>Plays</th><th>Run / Pass</th><th>Run%</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Play Direction + Motion render =================================
  _renderDirectionMotion(stats) {
    const dm = stats.dirMotion;
    if (!dm || (!dm.hasDirData && !dm.hasMotionData)) return '';

    let dirHtml = '';
    if (dm.hasDirData) {
      let rows = '';
      for (const d of dm.dirList) {
        const bar = Charts.stackBar([{ value: d.runs, color: RUN_COLOR, label: 'Run' }, { value: d.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="playDir" data-cut-val="${Charts._esc(d.name)}" data-cut-label="${Charts._esc(d.name)} — ${d.count} plays"><td>${Charts._esc(d.name)}</td><td>${d.count}</td><td>${bar}</td><td>${d.avg}</td><td>${d.succPct}%</td></tr>`;
      }
      dirHtml = `<div><h3>Play Direction</h3>
        <table class="stats-table"><thead><tr><th>Direction</th><th>Plays</th><th>Run / Pass</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    let motionHtml = '';
    if (dm.hasMotionData) {
      let rows = '';
      for (const m of dm.motionList) {
        const bar = Charts.stackBar([{ value: m.runs, color: RUN_COLOR, label: 'Run' }, { value: m.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="motion" data-cut-val="${Charts._esc(m.name)}" data-cut-label="${Charts._esc(m.name)} motion — ${m.count} plays"><td>${Charts._esc(m.name)}</td><td>${m.count}</td><td>${bar}</td><td>${m.avg}</td><td>${m.succPct}%</td></tr>`;
      }
      const nm = dm.noMotion;
      if (nm.count) {
        const bar = Charts.stackBar([{ value: nm.runs, color: RUN_COLOR, label: 'Run' }, { value: nm.passes, color: PASS_COLOR, label: 'Pass' }]);
        rows += `<tr class="cut-row" data-cut-type="motion" data-cut-val="No Motion" data-cut-label="No motion — ${nm.count} plays"><td style="opacity:.65">No Motion</td><td>${nm.count}</td><td>${bar}</td><td>${nm.avg}</td><td>${nm.succPct}%</td></tr>`;
      }
      motionHtml = `<div><h3>Motion</h3>
        <table class="stats-table"><thead><tr><th>Motion</th><th>Plays</th><th>Run / Pass</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table></div>`;
    }

    return `<div class="stats-section stats-two-col">${dirHtml}${motionHtml}</div>`;
  }

  // ===== Feature 3 render: Personnel × Situation ========================
  _renderPersonnelSituation(stats) {
    if (!stats.personnelSituation || !stats.personnelSituation.hasData) return '';
    let rows = '';
    for (const c of stats.personnelSituation.list) {
      const bar = Charts.stackBar([{ value: c.runs, color: RUN_COLOR, label: 'Run' }, { value: c.passes, color: PASS_COLOR, label: 'Pass' }]);
      rows += `<tr><td>${c.personnel}</td><td>${c.situation}</td><td>${c.count}</td><td>${bar}</td><td>${c.runPct}%</td><td>${c.avg}</td><td>${c.successPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Personnel × Situation</h3>
        <table class="stats-table"><thead><tr><th>Personnel</th><th>Situation</th><th>Plays</th><th>Run / Pass</th><th>Run%</th><th>Avg</th><th>Success%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Feature 4 render: Front + Coverage Combos ======================
  _renderFrontCoverageCombos(stats) {
    if (!stats.frontCoverageCombos || !stats.frontCoverageCombos.hasData) return '';
    let rows = '';
    for (const c of stats.frontCoverageCombos.list) {
      rows += `<tr class="cut-row" data-cut-type="frontCoverage" data-cut-val="${Charts._esc(c.front)}|${Charts._esc(c.coverage)}" data-cut-label="${Charts._esc(c.name)}"><td>${Charts._esc(c.name)}</td><td>${c.count}</td><td>${c.avg}</td><td>${c.stopPct}%</td><td>${c.havocPct}%</td></tr>`;
    }
    return `
      <div class="stats-section">
        <h3>Front + Coverage Combos</h3>
        <table class="stats-table"><thead><tr><th>Combo</th><th>Plays</th><th>Avg Yds</th><th>Stop%</th><th>Havoc%</th></tr></thead>
        <tbody>${rows}</tbody></table>
      </div>`;
  }

  // ===== Feature 6 render: Play-Action Breakdown ========================
  _renderPlayAction(stats) {
    if (!stats.playAction || !stats.playAction.hasData) return '';
    const pa = stats.playAction;
    let formRows = '';
    for (const f of pa.formationList) {
      formRows += `<tr><td>${Charts._esc(f.name)}</td><td>${f.count}</td><td>${f.avg}</td><td>${f.successPct}%</td></tr>`;
    }
    const formTable = formRows ? `
      <table class="stats-table" style="margin-top:12px"><thead><tr><th>Formation</th><th>PA Plays</th><th>Avg</th><th>Success%</th></tr></thead>
      <tbody>${formRows}</tbody></table>` : '';
    return `
      <div class="stats-section">
        <h3>Play-Action</h3>
        <div class="stats-grid stats-grid-flex">
          <div class="stat-card"><div class="stat-card-title">PA Rate</div><div class="stat-card-value">${pa.paRate}%</div><div class="stat-card-sub">${pa.paPlays} of dropbacks</div></div>
          <div class="stat-card"><div class="stat-card-title">PA Comp%</div><div class="stat-card-value">${pa.paCompPct}%</div></div>
          <div class="stat-card"><div class="stat-card-title">PA YPA</div><div class="stat-card-value">${pa.paYPA}</div></div>
          <div class="stat-card"><div class="stat-card-title">Straight YPA</div><div class="stat-card-value">${pa.straightYPA}</div></div>
        </div>
        ${formTable}
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

  // Broadcast-style KPI hero row — the handful of numbers a coach scans first,
  // big and tabular at the top of the Game tab (instead of buried mid-scroll in
  // Team Summary). All values are real, pulled from the same stats object the
  // sections below use. Tone classes color success/3rd-down/pts-per-drive.
  _renderKpiHero(stats) {
    if (!stats || !stats.totalPlays) return '';
    const totalYards = (stats.rushing?.yards || 0) + (stats.passing?.yards || 0);
    const ypp = stats.totalPlays ? (totalYards / stats.totalPlays).toFixed(1) : '0.0';
    const e = stats.efficiency || {};
    const d = stats.downs || {};
    const tend = stats.tendencies || {};
    const dr = stats.drives || {};
    const succ = e.successRate != null ? parseFloat(e.successRate) : null;
    const third = d.thirdDownPct != null ? parseFloat(d.thirdDownPct) : null;
    const tone = (v, good, ok) => (v == null || isNaN(v)) ? '' : (v >= good ? 'is-good' : v >= ok ? 'is-warn' : 'is-bad');
    const kpis = [{ label: 'Yds / play', value: ypp, sub: `${stats.totalPlays} plays` }];
    if (succ != null) kpis.push({ label: 'Success rate', value: Math.round(succ) + '%', sub: 'on-schedule', tone: tone(succ, 45, 33), tip: SUCCESS_RATE_TIP });
    if (third != null) kpis.push({ label: '3rd down', value: Math.round(third) + '%', sub: d.thirdDownConv || '', tone: tone(third, 40, 28) });
    kpis.push({ label: 'Run rate', value: Math.round(parseFloat(tend.runPct) || 0) + '%', sub: `${tend.runs || 0}R / ${tend.passes || 0}P` });
    if (dr.total >= 3) kpis.push({ label: 'Pts / drive', value: dr.pointsPerDrive, sub: `${dr.total} drives`, tone: tone(parseFloat(dr.pointsPerDrive), 2.5, 1.5) });
    else kpis.push({ label: 'Total yards', value: String(totalYards), sub: `${stats.scoring?.touchdowns || 0} TD` });
    return `<div class="gi-hero">${kpis.map(k => `
      <div class="gi-kpi"${k.tip ? ` title="${k.tip}"` : ''}>
        <div class="gi-kpi-label">${k.label}</div>
        <div class="gi-kpi-value ${k.tone || ''}">${k.value}</div>
        ${k.sub ? `<div class="gi-kpi-sub">${k.sub}</div>` : ''}
      </div>`).join('')}</div>`;
  }

  // Offense-tab hero — efficiency/explosiveness/balance, the lens the Offense
  // tab is about. Differentiated from the Game hero (explosive/negative/PA vs
  // 3rd-down/pts-drive) so the two heroes aren't redundant.
  _renderOffenseHero(stats) {
    if (!stats || !stats.totalPlays) return '';
    const totalYards = (stats.rushing?.yards || 0) + (stats.passing?.yards || 0);
    const ypp = stats.totalPlays ? (totalYards / stats.totalPlays).toFixed(1) : '0.0';
    const e = stats.efficiency || {};
    const tend = stats.tendencies || {};
    const num = (v) => (v == null ? null : parseFloat(v));
    // higher-is-better tone, unless invert (negative-play rate: lower is better)
    const tone = (v, good, ok, invert) => {
      if (v == null || isNaN(v)) return '';
      return invert ? (v <= good ? 'is-good' : v <= ok ? 'is-warn' : 'is-bad')
                    : (v >= good ? 'is-good' : v >= ok ? 'is-warn' : 'is-bad');
    };
    const succ = num(e.successRate), expl = num(e.explosivePct), neg = num(e.negativePct);
    const kpis = [];
    if (succ != null) kpis.push({ label: 'Success rate', value: Math.round(succ) + '%', sub: 'on-schedule', tone: tone(succ, 45, 33), tip: SUCCESS_RATE_TIP });
    if (expl != null) kpis.push({ label: 'Explosive', value: Math.round(expl) + '%', sub: `${e.explosivePlays || 0} plays`, tone: tone(expl, 12, 7) });
    if (neg != null) kpis.push({ label: 'Negative', value: Math.round(neg) + '%', sub: `${e.negativePlays || 0} plays`, tone: tone(neg, 8, 15, true) });
    kpis.push({ label: 'Yds / play', value: ypp, sub: `${stats.totalPlays} plays` });
    kpis.push({ label: 'Run rate', value: Math.round(parseFloat(tend.runPct) || 0) + '%', sub: `${tend.runs || 0}R / ${tend.passes || 0}P` });
    return `<div class="gi-hero">${kpis.map(k => `
      <div class="gi-kpi"${k.tip ? ` title="${k.tip}"` : ''}>
        <div class="gi-kpi-label">${k.label}</div>
        <div class="gi-kpi-value ${k.tone || ''}">${k.value}</div>
        ${k.sub ? `<div class="gi-kpi-sub">${k.sub}</div>` : ''}
      </div>`).join('')}</div>`;
  }

  _renderTeamStats(stats) {
    const r = stats.rushing;
    const p = stats.passing;
    const s = stats.scoring;
    const t = stats.turnovers;
    const tend = stats.tendencies;
    const totalYards = r.yards + p.yards;

    const rpDonut = Charts.donut([
      { value: tend.runs, color: RUN_COLOR, label: 'Run' },
      { value: tend.passes, color: PASS_COLOR, label: 'Pass' }
    ], 110, tend.runPct + '%', 'Run Rate');

    const ydsDonut = Charts.donut([
      { value: Math.max(0, r.yards), color: RUN_COLOR, label: 'Rush Yards' },
      { value: Math.max(0, p.yards), color: PASS_COLOR, label: 'Pass Yards' }
    ], 110, String(totalYards), 'Total Yds');

    return `
      <div class="stats-section">
        <h3>Team Summary</h3>
        <div class="team-summary-row">
          <div class="stats-grid stats-grid-flex">
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
    const thirdColor = thirdPct >= 45 ? '#22c55e' : thirdPct >= 30 ? '#f59e0b' : '#ef4444';
    const fourthColor = fourthPct >= 50 ? '#22c55e' : fourthPct >= 30 ? '#f59e0b' : '#ef4444';

    let rows = '';
    for (const [down, s] of Object.entries(d.byDown)) {
      if (s.total === 0) continue;
      rows += `<tr class="cut-row" data-cut-type="down" data-cut-val="${down}" data-cut-label="${labels[down]} down — ${s.total} plays">
        <td>${labels[down]}</td>
        <td>${s.total}</td>
        <td><div class="dd-split-bar">${Charts.stackBar([{ value: parseInt(s.runPct), color: 'var(--run-color)', label: 'Run' }, { value: parseInt(s.passPct), color: 'var(--pass-color)', label: 'Pass' }], 18)}</div></td>
        <td>${s.avgYards}</td>
        <td>${s.conversionPct}%</td>
      </tr>`;
    }

    let bucketRows = '';
    if (d.ddBuckets?.length) {
      for (const b of d.ddBuckets) {
        const convPct = parseFloat(b.convPct);
        const convColor = (b.down === '3' || b.down === '4')
          ? (convPct >= 50 ? '#22c55e' : convPct >= 30 ? '#f59e0b' : '#ef4444')
          : '';
        bucketRows += `<tr>
          <td>${labels[b.down]} &amp; ${b.bucket}</td>
          <td>${b.count}</td>
          <td><div class="dd-split-bar">${Charts.stackBar([{ value: parseInt(b.runPct), color: 'var(--run-color)', label: 'Run' }, { value: parseInt(b.passPct), color: 'var(--pass-color)', label: 'Pass' }], 18)}</div></td>
          <td>${b.avgYards}</td>
          <td>${b.succPct}%</td>
          <td${convColor ? ` style="color:${convColor};font-weight:700"` : ''}>${b.convPct}%</td>
        </tr>`;
      }
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
        ${bucketRows ? `<h4 style="margin:16px 0 6px;font-size:13px;opacity:.8">By Distance</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Situation</th><th>#</th><th>Run / Pass</th><th>Avg</th><th>Succ %</th><th>Conv %</th></tr></thead>
          <tbody>${bucketRows}</tbody>
        </table>` : ''}
      </div>
    `;
  }

  _renderTendencies(stats) {
    const t = stats.tendencies;

    const formChart = Charts.effectivenessRows(
      t.formationList.map(f => ({ label: f.name, count: f.count, runs: f.runs, passes: f.passes, yards: f.yards, successPct: f.successPct, avg: f.avg, cutType: 'formation', cutVal: f.name, cutLabel: `${f.name} — ${f.count} plays` }))
    );

    const typeChart = Charts.effectivenessRows(
      t.playTypeList.map(pt => ({ label: pt.name, count: pt.count, runs: pt.runs, passes: pt.passes, yards: pt.yards, successPct: pt.successPct, avg: pt.avg, cutType: 'playType', cutVal: pt.name, cutLabel: `${pt.name} — ${pt.count} plays` }))
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
        ${typeChart}
      </div>
    `;
  }

  // --- Tendency Matrix ---

  static _matrixDimensions() {
    return [
      { id: 'formation',  label: 'Formation',  extract: p => StatsEngine.splitFormations(p.tags.formation) },
      { id: 'backfield',  label: 'Backfield',  extract: p => [p.tags.backfield || ''].filter(Boolean) },
      { id: 'strength',   label: 'Strength',   extract: p => [p.tags.strength || ''].filter(Boolean) },
      { id: 'playType',   label: 'Play Type',  extract: p => StatsEngine.splitPlayTypes(p.tags.playType) },
      { id: 'down',       label: 'Down',        extract: p => [p.tags.down ? `${p.tags.down}` : '?'] },
      { id: 'distBucket', label: 'Distance',    extract: p => { const d = parseInt(p.tags.distance) || 0; return [d <= 3 ? 'Short (1-3)' : d <= 6 ? 'Med (4-6)' : 'Long (7+)']; } },
      { id: 'personnel',  label: 'Personnel',   extract: p => [p.tags.personnel || 'Unknown'] },
      { id: 'defFront',   label: 'Def Front',   extract: p => StatsEngine.splitFronts(p.tags.defFront) },
      { id: 'coverage',   label: 'Coverage',    extract: p => [p.tags.coverage || ''].filter(Boolean) },
      { id: 'hash',       label: 'Hash',        extract: p => [p.tags.hash || 'Unknown'] },
      { id: 'playDir',    label: 'Direction',   extract: p => [p.tags.playDir || ''].filter(Boolean) },
      { id: 'motion',     label: 'Motion',      extract: p => [p.tags.motion || 'No Motion'] },
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
    const defaultMatrix = this._computeMatrix(stats.offPlays, 'formation', 'down');
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
      const matrix = this._computeMatrix(this._offensePlays(), rowSel.value, colSel.value);
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
      frontRows += `<tr class="cut-row" data-cut-type="defFront" data-cut-val="${Charts._esc(f.name)}" data-cut-label="${Charts._esc(f.name)} front — ${f.count} plays"><td>${Charts._esc(f.name)}</td><td>${f.count}</td><td>${f.runs}/${f.passes}</td><td>${f.yards}</td><td>${avg}</td><td>${defSucc}%</td><td>${havocPct}%</td></tr>`;
    }

    let covRows = '';
    for (const c of d.coverages) {
      const avg = c.count ? (c.yards / c.count).toFixed(1) : '0.0';
      const defSucc = c.count ? ((c.successes / c.count) * 100).toFixed(0) : '0';
      covRows += `<tr class="cut-row" data-cut-type="coverage" data-cut-val="${Charts._esc(c.name)}" data-cut-label="${Charts._esc(c.name)} — ${c.count} plays"><td>${Charts._esc(c.name)}</td><td>${c.count}</td><td>${c.comps}</td><td>${c.incs}</td><td>${c.ints}</td><td>${c.sacks}</td><td>${c.yards}</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
    }

    let blitzRows = '';
    for (const b of d.blitzes) {
      const avg = b.count ? (b.yards / b.count).toFixed(1) : '0.0';
      const havocPct = b.count ? ((b.havoc / b.count) * 100).toFixed(0) : '0';
      const defSucc = b.count ? ((b.successes / b.count) * 100).toFixed(0) : '0';
      blitzRows += `<tr class="cut-row" data-cut-type="blitz" data-cut-val="${Charts._esc(b.name)}" data-cut-label="${Charts._esc(b.name)} blitz — ${b.count} plays"><td>${Charts._esc(b.name)}</td><td>${b.count}</td><td>${b.sacks}</td><td>${havocPct}%</td><td>${avg}</td><td>${defSucc}%</td></tr>`;
    }

    let sitFrontHtml = '';
    [d.earlyDownFronts, d.passingDownFronts].forEach(sit => {
      if (!sit.fronts.length) return;
      const rows = sit.fronts.map(([name, count]) =>
        `<tr><td>${Charts._esc(name)}</td><td>${count}</td><td>${sit.total ? ((count / sit.total) * 100).toFixed(0) : 0}%</td></tr>`
      ).join('');
      sitFrontHtml += `<div><h4 style="margin:8px 0 4px">${sit.label} (${sit.total})</h4>
        <table class="stats-table stats-table-full">
          <thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead>
          <tbody>${rows}</tbody>
        </table></div>`;
    });

    const havocPctVal = parseFloat(d.havocRate);
    const havocColor = havocPctVal >= 20 ? '#22c55e' : havocPctVal >= 12 ? '#f59e0b' : '#ef4444';
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
        <td>${Charts._esc(bp.clipName)}</td>
        <td>${Charts._esc(bp.type)}</td>
        <td>${Charts._esc(bp.result)}</td>
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
    // Fixed name overlay (e.g. the demo season) — owned by StorageManager and
    // independent of _seasonLabels, which the Season Stats view nulls after it
    // renders. Checked first so the demo's names survive opening that view.
    if (this._fixedLabels && this._fixedLabels[num]) return `#${num} ${this._fixedLabels[num]}`;
    // Season view supplies a merged name map across loaded games.
    if (this._seasonLabels && this._seasonLabels[num]) return `#${num} ${this._seasonLabels[num]}`;
    const roster = (typeof window !== 'undefined') && window.app && window.app.roster;
    return roster ? roster.getLabel(num) : `#${num}`;
  }

  /** HTML-safe player label for innerHTML sinks. _playerLabel stays RAW because
   *  it also feeds text contexts (the cut-up banner's textContent) where escaping
   *  would double-encode; escape here, at the HTML boundary. Player names come
   *  from the roster, which travels in importable/shareable season + CSV files. */
  _playerLabelHtml(num) { return Charts._esc(this._playerLabel(num)); }

  /**
   * Render the box-score individual tables. `group` scopes which tables show so
   * they can live under the relevant dashboard tab:
   *   'offense' → rushing / passing / receiving
   *   'defense' → tackles (incl. INTs + fumbles recovered)
   *   'special' → return game / kicking-punting
   *   'all'     → everything (used by exports)
   */
  _renderIndividualStats(stats, group = 'all') {
    const ind = stats.individuals;
    let html = '';
    const showOff = group === 'all' || group === 'offense';
    const showDef = group === 'all' || group === 'defense';
    const showST = group === 'all' || group === 'special';

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

    if (showOff && ind.rushers.length > 0) {
      let rows = '';
      for (const r of ind.rushers) {
        const avg = r.attempts ? (r.yards / r.attempts).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabelHtml(r.num)}</td><td>${r.attempts}</td><td>${r.yards}</td><td>${avg}</td><td>${r.long}</td><td>${r.tds}</td><td>${r.fumbles}</td><td class="${gradeClass(r)}">${fmtGrade(r)}</td></tr>`;
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

    if (showOff && ind.passers.length > 0) {
      let rows = '';
      for (const p of ind.passers) {
        const pct = p.attempts ? ((p.completions / p.attempts) * 100).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${p.num}"><td>${this._playerLabelHtml(p.num)}</td><td>${p.completions}/${p.attempts}</td><td>${pct}%</td><td>${p.yards}</td><td>${p.tds}</td><td>${p.ints}</td><td>${p.sacks}</td><td class="${gradeClass(p)}">${fmtGrade(p)}</td></tr>`;
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

    if (showOff && ind.receivers.length > 0) {
      let rows = '';
      for (const r of ind.receivers) {
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabelHtml(r.num)}</td><td>${r.receptions}</td><td>${r.yards}</td><td>${r.long}</td><td>${r.tds}</td><td class="${gradeClass(r)}">${fmtGrade(r)}</td></tr>`;
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

    if (showDef && ind.tacklers.length > 0) {
      let rows = '';
      for (const t of ind.tacklers) {
        rows += `<tr class="player-row" data-player="${t.num}"><td>${this._playerLabelHtml(t.num)}</td><td>${t.tackles}</td><td>${t.solo || 0}</td><td>${t.assists || 0}</td><td>${t.sacks}</td><td>${t.tfl}</td><td>${t.ints || 0}</td><td>${t.fumblesRec || 0}</td><td class="${gradeClass(t)}">${fmtGrade(t)}</td></tr>`;
      }
      html += `
        <div class="stats-section">
          <h3>Individual Tackles</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Player</th><th>Tkl</th><th>Solo</th><th>Ast</th><th>Sack</th><th>TFL</th><th>INT</th><th>FR</th><th>Grade</th></tr></thead>
            <tbody>${rows}</tbody>
          </table>
        </div>`;
    }

    if (showST && ind.returners && ind.returners.length > 0) {
      let rows = '';
      for (const r of ind.returners) {
        const avg = r.returns ? (r.yards / r.returns).toFixed(1) : '0.0';
        rows += `<tr class="player-row" data-player="${r.num}"><td>${this._playerLabelHtml(r.num)}</td><td>${r.returns}</td><td>${r.yards}</td><td>${avg}</td><td>${r.long}</td><td>${r.tds}</td></tr>`;
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

    if (showST && ind.kickers && ind.kickers.length > 0) {
      let rows = '';
      for (const k of ind.kickers) {
        const fg = k.fgAtt ? `${k.fgMade}/${k.fgAtt}` : '—';
        const puntAvg = k.punts ? (k.puntYds / k.punts).toFixed(1) : '—';
        rows += `<tr class="player-row" data-player="${k.num}"><td>${this._playerLabelHtml(k.num)}</td><td>${fg}</td><td>${k.punts || '—'}</td><td>${puntAvg}</td></tr>`;
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

  // Make the individual-stat leaderboard tables click-to-sort. A header click
  // sorts by that column — numeric columns (Yds, TD, Grade…) sort by value with
  // blanks ("—") sinking to the bottom; the Player column sorts as text.
  // Re-clicking a header flips direction. Non-destructive: existing <tr>s are
  // re-appended, so the .player-row "jump to film" handlers stay live. Targets
  // leaderboard tables by their .player-row rows, so EPA/situational tables
  // (also .stats-table-full) are left alone.
  _makeSortable(root) {
    if (!root || !root.querySelectorAll) return;
    const num = (s) => {
      const m = String(s).replace(/,/g, '').match(/-?\d+(?:\.\d+)?/);
      return m ? parseFloat(m[0]) : null;
    };
    root.querySelectorAll('table.stats-table-full').forEach(table => {
      const tbody = table.querySelector('tbody');
      if (!tbody || !tbody.querySelector('tr.player-row')) return;
      const heads = Array.from(table.querySelectorAll('thead th'));
      if (heads.length < 2) return;
      heads.forEach((th, idx) => {
        th.classList.add('gi-sort-th');
        th.title = 'Click to sort';
        th.addEventListener('click', (e) => {
          e.stopPropagation();
          const asc = th.dataset.sortDir !== 'asc';
          const rows = Array.from(tbody.querySelectorAll('tr'));
          rows.sort((a, b) => {
            const av = (a.children[idx]?.textContent || '').trim();
            const bv = (b.children[idx]?.textContent || '').trim();
            const an = num(av), bn = num(bv);
            if (an !== null && bn !== null) return asc ? an - bn : bn - an;
            if (an !== null) return -1;     // real numbers ahead of blanks (—)
            if (bn !== null) return 1;
            return asc ? av.localeCompare(bv) : bv.localeCompare(av);
          });
          heads.forEach(h => h.classList.remove('gi-sort-asc', 'gi-sort-desc'));
          th.dataset.sortDir = asc ? 'asc' : 'desc';
          th.classList.add(asc ? 'gi-sort-asc' : 'gi-sort-desc');
          rows.forEach(r => tbody.appendChild(r));
        });
      });
    });
  }

  // Wire the Season view's secondary sub-nav (Overview / Breakdown / Players /
  // Self-Scout): clicking a .gi-subtab shows its .gi-subpane and hides the
  // rest. Panes stay in the DOM, so heat-map binding + sortable wiring done once
  // by the caller still hold. Used by the dashboard's lazy Season render and the
  // legacy Season modal.
  _wireSubtabs(root) {
    if (!root || !root.querySelectorAll) return;
    const tabs = Array.from(root.querySelectorAll('.gi-subtab'));
    if (!tabs.length) return;
    const panes = Array.from(root.querySelectorAll('.gi-subpane'));
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        const key = tab.dataset.subtab;
        tabs.forEach(t => t.classList.toggle('active', t === tab));
        panes.forEach(p => p.classList.toggle('active', p.dataset.subpane === key));
      });
    });
  }

  generateScoutReport(playsOverride = null) {
    const plays = playsOverride || this._currentPlays();
    if (plays.length === 0) return null;
    const stats = this.compute(playsOverride || undefined);
    const formationDetail = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const yards = parseInt(p.tags.yardage) || 0;
      const isTd = StatsEngine.hasResult(p, 'Touchdown');
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
      StatsEngine.splitFronts(p.tags.defFront).forEach(f => { fronts[f] = (fronts[f] || 0) + 1; });
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
      redZone: { total: redZonePlays.length, tds: redZonePlays.filter(p => StatsEngine.hasResult(p, 'Touchdown')).length },
      thirdDown: { total: thirdDownPlays.length, converted: thirdDownPlays.filter(p => gainedFirstDown(p.tags) || StatsEngine.hasResult(p, 'Touchdown')).length },
    };
  }

  // ---- Opponent Scout: aggregate from games you've ALREADY tagged ----
  // No re-tagging. In a game you played them, their tendencies are already on
  // the other side of the ball: your DEFENSIVE snaps carry their offense
  // (formation / play type / result you faced), your OFFENSIVE snaps carry the
  // fronts & coverages they showed you. A perspective:'scout' game (you tagged
  // their film directly) is taken as-tagged. Aggregates EVERY game vs them
  // across ALL seasons — current season in-memory (freshest), others read
  // straight from localStorage (browser: ffa_season_<id>).
  _allSeasonGames() {
    const games = [];
    const store = window.app && window.app.storage && window.app.storage.seasonStore;
    let curId = null;
    if (store) {
      try { window.app.storage.commitActive(); } catch (e) {}
      curId = store.currentSeasonId;
      if (store.data && Array.isArray(store.data.games)) store.data.games.forEach(g => games.push(g));
    }
    let lib = [];
    try { lib = JSON.parse(localStorage.getItem('ffa_library') || '[]') || []; } catch (e) {}
    lib.forEach(meta => {
      if (!meta || !meta.id || meta.id === curId) return;
      try {
        const sd = JSON.parse(localStorage.getItem('ffa_season_' + meta.id) || 'null');
        if (sd && Array.isArray(sd.games)) sd.games.forEach(g => games.push(g));
      } catch (e) {}
    });
    return games;
  }

  _activeOpponent() {
    try {
      const d = window.app.storage.seasonStore.data;
      if (d && Array.isArray(d.games)) {
        const g = d.games.find(x => x.id === d.activeGameId) || d.games[0];
        const o = g && g.gameInfo && g.gameInfo.opponent;
        if (o && String(o).trim()) return String(o).trim();
      }
    } catch (e) {}
    const dom = document.getElementById('gameOpponent');
    return dom && dom.value ? dom.value.trim() : '';
  }

  generateOpponentScout(opponentName) {
    const target = String(opponentName || '').trim().toLowerCase();
    if (!target) return null;
    const matched = this._allSeasonGames().filter(g =>
      String((g.gameInfo && g.gameInfo.opponent) || '').trim().toLowerCase() === target);
    const offPlays = [], defPlays = [];
    matched.forEach(g => {
      const scout = String((g.gameInfo && g.gameInfo.perspective) || '') === 'scout';
      (g.plays || []).forEach(p => {
        const unit = (p.tags && p.tags.unit) || 'offense';
        if (scout ? unit === 'offense' : unit === 'defense') offPlays.push(p);
        else if (scout ? unit === 'defense' : unit === 'offense') defPlays.push(p);
      });
    });
    // Their offense is read from snaps we tagged as DEFENSE, but compute()
    // partitions run/pass BY UNIT — so present those snaps AS offense or the
    // overview KPIs (run/pass, run%, avg yards) read 0/0 even though the plays
    // carry runPass. (formationDetail/downTendency use isRun directly, which is
    // why the tables were right while the overview was empty.)
    const asOffense = offPlays.map(p => ({ ...p, tags: { ...p.tags, unit: 'offense' } }));
    // Their defense = the fronts/coverages we faced on our OFFENSE snaps. Exclude
    // our OWN custom fronts (the .our-def-only chips, read live from the form) —
    // they can never be the opponent's call, so any occurrence here is carry leak
    // from our defensive snaps (the "Maverick shows up in their fronts" bug).
    let ourOnly = new Set();
    try { ourOnly = new Set([...document.querySelectorAll('#tagDefFront .our-def-only')].map(c => c.dataset.value)); } catch (e) {}
    const frontCounts = {}, covCounts = {};
    defPlays.forEach(p => {
      StatsEngine.splitFronts(p.tags.defFront).forEach(f => { if (f && !ourOnly.has(f)) frontCounts[f] = (frontCounts[f] || 0) + 1; });
      if (p.tags.coverage) covCounts[p.tags.coverage] = (covCounts[p.tags.coverage] || 0) + 1;
    });
    const sortDesc = obj => Object.entries(obj).sort((a, b) => b[1] - a[1]);
    return {
      opponent: opponentName,
      games: matched.length,
      offReport: asOffense.length ? this.generateScoutReport(asOffense) : null,
      offPlays: asOffense,
      offCount: offPlays.length,
      defFronts: sortDesc(frontCounts),
      defCoverages: sortDesc(covCounts),
      defCount: defPlays.length
    };
  }

  renderOpponentScout(opponentName) {
    const esc = Charts._esc;
    const data = this.generateOpponentScout(opponentName);
    const name = esc(opponentName || 'Opponent');
    let body;
    if (!data || data.games === 0) {
      body = `<div class="stats-section"><p style="color:var(--text-dim);line-height:1.7">
        No games found against <strong>${Charts._esc(name)}</strong>. Set the opponent in the Game menu and tag a game
        against them — your <strong>defensive</strong> snaps capture their offense (the formation &amp; play type
        you faced), your <strong>offensive</strong> snaps capture their defense (the fronts &amp; coverages they
        showed). Re-open this report and it builds automatically — no separate scout film needed.</p></div>`;
    } else {
      const r = data.offReport;
      const off = r ? `
        <div class="stats-section">
          <h3>Their Offense — Overview (${r.totalPlays} plays)</h3>
          <div class="stats-grid">
            <div class="stat-card"><div class="stat-card-title">Run/Pass</div><div class="stat-card-value">${r.stats.tendencies.runPassRatio}</div></div>
            <div class="stat-card"><div class="stat-card-title">Run %</div><div class="stat-card-value">${r.stats.tendencies.runPct}%</div></div>
            <div class="stat-card"><div class="stat-card-title">Avg Yards</div><div class="stat-card-value">${r.totalPlays ? ((r.stats.rushing.yards + r.stats.passing.yards) / r.totalPlays).toFixed(1) : '0.0'}</div></div>
            <div class="stat-card"><div class="stat-card-title">3rd Down</div><div class="stat-card-value">${r.thirdDown.total ? `${r.thirdDown.converted}/${r.thirdDown.total}` : 'N/A'}</div></div>
          </div>
        </div>
        <div class="stats-section">
          <h3>Their Formation Tendencies</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Yds</th><th>TD</th></tr></thead>
            <tbody>${r.formationDetail.map(f => `<tr><td>${esc(f.name)}</td><td>${f.total}</td><td>${f.runPct}%</td><td>${100 - f.runPct}%</td><td>${f.yards}</td><td>${f.tds}</td></tr>`).join('')}</tbody>
          </table>
        </div>
        ${this._renderBigTwelve(data.offPlays, opponentName, { cut: false })}
        <div class="stats-section">
          <h3>Their Down &amp; Distance Tendencies</h3>
          <table class="stats-table stats-table-full">
            <thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th></tr></thead>
            <tbody>${r.downTendency.map(d => `<tr><td>${esc(d.key)}</td><td>${d.total}</td><td>${d.runPct}%</td><td>${100 - d.runPct}%</td></tr>`).join('')}</tbody>
          </table>
        </div>` : `<div class="stats-section"><p style="color:var(--text-dim)">No offensive snaps tagged against them yet. Tag your <strong>defensive</strong> plays (the formation &amp; play type you faced) to build their offensive tendencies.</p></div>`;
      const td = data.defCount || 0;
      const defSection = (data.defFronts.length || data.defCoverages.length) ? `
        <div class="stats-section stats-two-col">
          ${data.defFronts.length ? `<div>
            <h3>Their Defensive Fronts</h3>
            <table class="stats-table stats-table-full">
              <thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead>
              <tbody>${data.defFronts.map(([f, c]) => `<tr><td>${esc(f)}</td><td>${c}</td><td>${td ? Math.round(c / td * 100) : 0}%</td></tr>`).join('')}</tbody>
            </table>
          </div>` : ''}
          ${data.defCoverages.length ? `<div>
            <h3>Their Coverages</h3>
            <table class="stats-table stats-table-full">
              <thead><tr><th>Coverage</th><th>#</th><th>%</th></tr></thead>
              <tbody>${data.defCoverages.map(([c, n]) => `<tr><td>${esc(c)}</td><td>${n}</td><td>${td ? Math.round(n / td * 100) : 0}%</td></tr>`).join('')}</tbody>
            </table>
          </div>` : ''}
        </div>` : '';
      body = `
        <div class="stats-section">
          <p style="color:var(--text-dim);margin:0;line-height:1.6">Auto-aggregated from <strong>${data.games}</strong> game${data.games === 1 ? '' : 's'} you've tagged against ${Charts._esc(name)}
          — ${data.offCount} of their offensive snaps, ${data.defCount} defensive. Pulled straight from your film; nothing re-tagged.</p>
        </div>
        ${off}
        ${defSection}`;
    }
    const html = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Opponent Report: ${Charts._esc(name)}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm btn-danger" id="btnCloseOppScout">Close</button>
            </div>
          </div>
          <div class="stats-body">${body}</div>
        </div>
      </div>`;
    this.dashboardEl.innerHTML = html;
    this.dashboardEl.classList.remove('hidden');
    const closeBtn = this.dashboardEl.querySelector('#btnCloseOppScout');
    if (closeBtn) closeBtn.addEventListener('click', () => this.hideDashboard());
    const overlay = this.dashboardEl.querySelector('.stats-overlay');
    if (overlay) overlay.addEventListener('click', (e) => { if (e.target.classList.contains('stats-overlay')) this.hideDashboard(); });
  }

  renderScoutReport() {
    const report = this.generateScoutReport();
    if (!report) { this._emptyOverlay('Scout Report', 'No opponent plays tagged yet. Tag the opponent’s formations, play types, and results, then generate the report.'); return; }
    const notes = document.getElementById('scoutNotes')?.value || '';
    const opponent = document.getElementById('gameOpponent')?.value || 'Opponent';
    const t = report.stats.tendencies;

    let html = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Scout Report: ${Charts._esc(opponent)}</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportScoutReport">Export Report</button>
              <button class="btn btn-sm btn-danger" id="btnCloseScoutReport">Close</button>
            </div>
          </div>
          <div class="stats-body">
            ${notes ? `<div class="stats-section"><h3>Scouting Notes</h3><p style="white-space:pre-wrap">${Charts._esc(notes)}</p></div>` : ''}
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
                  `<tr><td>${Charts._esc(f.name)}</td><td>${f.total}</td><td>${f.runPct}%</td><td>${100 - f.runPct}%</td><td>${f.yards}</td><td>${f.tds}</td></tr>`
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
                  <tbody>${report.fronts.map(([f, c]) => `<tr><td>${Charts._esc(f)}</td><td>${c}</td><td>${Math.round(c / report.totalPlays * 100)}%</td></tr>`).join('')}</tbody>
                </table>
              </div>
              ${report.coverages.length ? `<div>
                <h3>Coverages</h3>
                <table class="stats-table stats-table-full">
                  <thead><tr><th>Coverage</th><th>#</th><th>%</th></tr></thead>
                  <tbody>${report.coverages.map(([c, n]) => `<tr><td>${Charts._esc(c)}</td><td>${n}</td><td>${Math.round(n / report.totalPlays * 100)}%</td></tr>`).join('')}</tbody>
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
    const title = `Scout Report: ${Charts._esc(opponent)}`;   // feeds <title> + <h1> (HTML); filename below uses the raw value
    const formRows = report.formationDetail.map(f =>
      `<tr><td>${Charts._esc(f.name)}</td><td>${f.total}</td><td>${f.runPct}%</td><td>${100 - f.runPct}%</td><td>${f.yards}</td><td>${f.tds}</td></tr>`
    ).join('');
    const ddRows = report.downTendency.map(d =>
      `<tr><td>${d.key}</td><td>${d.total}</td><td>${d.runPct}%</td><td>${100 - d.runPct}%</td></tr>`
    ).join('');
    const htmlContent = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${title}</title>
${this._exportFontFace()}
<style>:root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--surface:#f8fafc;--blue:#2563eb;--display:'Barlow Condensed','Arial Narrow',system-ui,sans-serif}
body{font-family:'Inter',-apple-system,sans-serif;background:#fff;color:var(--ink);max-width:960px;margin:24px auto;padding:0 24px}
h1{font-family:var(--display);border-bottom:3px solid var(--blue);padding-bottom:8px;font-size:30px;font-weight:700;letter-spacing:.01em}h3{font-family:var(--display);color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:5px;margin-top:26px;font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
table{width:100%;border-collapse:collapse;margin:8px 0}th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:13px}td:first-child{color:var(--ink);font-weight:500}
th{font-family:var(--display);background:none;color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--line)}tr:nth-child(even) td{background:var(--surface)}
.overview{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin:12px 0}
.ov-card{border:1px solid var(--line);padding:12px;border-radius:10px;text-align:center;background:var(--surface)}
.ov-val{font-family:var(--display);font-size:32px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}.ov-lbl{font-size:9px;text-transform:uppercase;color:var(--muted);font-weight:700;letter-spacing:.06em}
</style></head><body>
<h1>${title}</h1><p style="color:#666">Generated ${new Date().toLocaleString()} &middot; ${report.totalPlays} plays</p>
${notes ? `<h3>Notes</h3><p style="white-space:pre-wrap">${Charts._esc(notes)}</p>` : ''}
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
    const fname = `scout_${opponent.replace(/\s+/g, '_')}.html`;
    window.ffaSaveBlob(blob, fname);
  }

  // ================================================================
  // SELF-SCOUT — flip the scouting lens on your own offense to reveal
  // what tendencies you're tipping. Distinct from the opponent scout
  // report: it flags predictability, ranks your "tells", and suggests
  // counters. Run/pass-classifiable offensive plays only.
  // ================================================================

  /** Minimum sample for a grouping to be considered a tell / counted. */
  static get _SELF_SCOUT_MIN_N() { return 4; }
  static _meterColor(p) { return p >= 70 ? '#ef4444' : p >= 50 ? '#f59e0b' : p >= 30 ? '#f59e0b' : '#22c55e'; }
  static _verdictIcon(v) { return v === 'dominant' ? '&#9650;' : v === 'effective' ? '&#9644;' : '&#9660;'; }
  static _verdictLabel(v) { return v === 'dominant' ? 'Dominant' : v === 'effective' ? 'Effective' : 'Exploitable'; }

  /** Coordinator distance buckets — coaches game-plan by Short/Medium/Long,
   *  not by exact yards. Bucketing also keeps per-situation samples large
   *  enough for a tendency to mean something (15 of 20 on "3rd & Long" is a
   *  pattern; 3 of 4 on "3rd & 7" is noise). */
  static _distBucket(dist) { return dist <= 3 ? 'Short' : dist <= 6 ? 'Medium' : 'Long'; }

  /** Down + distance-bucket key like "3|Long"; null when down/distance are
   *  missing so the bucket can be skipped rather than charted as "?". */
  _ddKey(tags) {
    const d = tags.down;
    const dist = parseInt(tags.distance);
    if (!d || !dist) return null;
    return `${d}|${StatsEngine._distBucket(dist)}`;
  }

  /** Pretty-print a down&distance key. Handles the bucket form ("3|Long" →
   *  "3rd & Long"), the legacy exact form ("3&7" → "3rd & 7"), and a bare
   *  down ("3" → "3rd"). */
  _ddPretty(key) {
    const s = String(key);
    const ord = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
    if (s.includes('|')) {
      const [d, bucket] = s.split('|');
      return `${ord[d] || d} & ${bucket}`;
    }
    const [d, dist] = s.split('&');
    const o = ord[d] || `${d}`;
    return dist != null && dist !== '?' && dist !== '' ? `${o} & ${dist}` : o;
  }

  /**
   * Bucket plays by a key function, counting only run/pass-classifiable
   * plays. keyFn may return a single key or an array (multi-formation).
   * Tracks per-bucket effectiveness: run/pass yards, successes, explosive
   * plays, and turnovers for context-aware self-scout analysis.
   */
  _selfScoutGroup(plays, keyFn) {
    const g = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p);
      const isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return;
      let keys = keyFn(p);
      if (!Array.isArray(keys)) keys = [keys];
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      const explosive = yds >= (isRun ? 12 : 16);
      const td = StatsEngine.hasResult(p, 'Touchdown');
      const to = StatsEngine.hasResult(p, 'Interception') || StatsEngine.hasResult(p, 'Fumble');
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, runs: 0, passes: 0, yards: 0,
          runYards: 0, passYards: 0, runSucc: 0, passSucc: 0,
          explosives: 0, tds: 0, turnovers: 0 };
        g[k].n++;
        g[k].yards += yds;
        if (td) g[k].tds++;
        if (to) g[k].turnovers++;
        if (explosive) g[k].explosives++;
        if (isRun) {
          g[k].runs++;
          g[k].runYards += yds;
          if (succ) g[k].runSucc++;
        } else {
          g[k].passes++;
          g[k].passYards += yds;
          if (succ) g[k].passSucc++;
        }
      });
    });
    return g;
  }

  /** Turn a group map into rows with runPct / lean / tell flag + effectiveness. */
  _selfScoutRows(groups) {
    return Object.values(groups)
      .map(grp => {
        const runPct = grp.n ? Math.round(grp.runs / grp.n * 100) : 0;
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPct = Math.max(runPct, 100 - runPct);
        const succRate = grp.n ? Math.round((grp.runSucc + grp.passSucc) / grp.n * 100) : 0;
        const runAvg = grp.runs ? +(grp.runYards / grp.runs).toFixed(1) : 0;
        const passAvg = grp.passes ? +(grp.passYards / grp.passes).toFixed(1) : 0;
        return {
          ...grp, runPct, passPct: 100 - runPct, lean, leanPct,
          avg: grp.n ? +(grp.yards / grp.n).toFixed(1) : 0,
          succRate, runAvg, passAvg,
          tell: grp.n >= StatsEngine._SELF_SCOUT_MIN_N && leanPct >= 70,
        };
      })
      .sort((a, b) => b.n - a.n);
  }

  /** What a defense does about a one-sided offensive tendency (the "so what")
   *  plus the constraint that breaks it (the "now what"). */
  static _offenseTellCounter(lean) {
    return lean === 'Run'
      ? { threat: 'a DC keys run — loads the box and cheats a safety down', fix: 'play-action, a quick throw, or a screen off the same look' }
      : { threat: 'a DC keys pass — drops into coverage and sits on the sticks', fix: 'a draw, QB run, or screen off the same formation' };
  }

  /** Extract ranked tells from a group map, tagged with a dimension label.
   *  Each tell carries effectiveness context so recommendations can
   *  distinguish "dominant strength" from "exploitable tendency", plus a
   *  cut spec ({type,val}) so the tell is clickable to its film. `cutFn`
   *  maps a group key → {type, val} understood by `_buildCutFilter`. */
  _tellsFrom(groups, dim, fmt, cutFn) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    return Object.values(groups)
      .filter(grp => grp.n >= min)
      .map(grp => {
        const runPct = Math.round(grp.runs / grp.n * 100);
        const leanPct = Math.max(runPct, 100 - runPct);
        const lean = runPct >= 50 ? 'Run' : 'Pass';
        const leanPlays = lean === 'Run' ? grp.runs : grp.passes;
        const leanYards = lean === 'Run' ? grp.runYards : grp.passYards;
        const leanSucc = lean === 'Run' ? grp.runSucc : grp.passSucc;
        const leanAvg = leanPlays ? +(leanYards / leanPlays).toFixed(1) : 0;
        const leanSuccRate = leanPlays ? Math.round(leanSucc / leanPlays * 100) : 0;
        const overallAvg = grp.n ? +(grp.yards / grp.n).toFixed(1) : 0;
        const overallSucc = grp.n ? Math.round((grp.runSucc + grp.passSucc) / grp.n * 100) : 0;
        // Classify: a lopsided split that's highly effective is a "dominant"
        // strength, not a vulnerability. Only truly exploitable tells (low
        // effectiveness on the leaned side) warrant a "fix this" recommendation.
        // dominant: lean side avg >= 6 ypc/ypa AND success >= 50%
        // effective: lean side avg >= 4 AND success >= 40%
        // exploitable: everything else
        const dominant = leanAvg >= 6 && leanSuccRate >= 50;
        const effective = !dominant && leanAvg >= 4 && leanSuccRate >= 40;
        const verdict = dominant ? 'dominant' : effective ? 'effective' : 'exploitable';
        const cut = cutFn ? cutFn(grp.key) : null;
        return {
          dim, label: Charts._esc(fmt(grp.key)), n: grp.n, lean, leanPct,
          leanAvg, leanSuccRate, overallAvg, overallSucc,
          tds: grp.tds, turnovers: grp.turnovers, explosives: grp.explosives,
          verdict,
          counter: StatsEngine._offenseTellCounter(lean),
          cutType: cut ? cut.type : null, cutVal: cut ? cut.val : null,
          // Score: exploitable tells rank higher (they're actionable).
          // Dominant tells rank lower — they're information, not problems.
          score: (leanPct - 50) * Math.min(grp.n, 12) * (dominant ? 0.3 : effective ? 0.6 : 1),
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

  // --- Predictability Map (Formation × Situation heat-map) ---------------
  // The coordinator's mental grid: formations down the side, the down &
  // distance situations a DC keys on across the top. Cells are colored by how
  // lopsided your run/pass lean is (red = predictable tell, green = balanced),
  // NOT by volume like the offense-tab Tendency Matrix — so your leaks pop.

  /** Heat-map situation column for a play: 1st and 4th collapse to the down
   *  (distance is ~always 10 / a different beast); 2nd & 3rd bucket by
   *  distance. Null when the down (or 2nd/3rd distance) isn't tagged. */
  _matrixSit(tags) {
    const d = tags.down;
    if (!d) return null;
    if (d === '1') return '1';
    if (d === '4') return '4';
    const dist = parseInt(tags.distance);
    if (!dist) return null;
    return `${d}|${StatsEngine._distBucket(dist)}`;
  }

  /** Predicate for a heat-map situation key ('1', '4', or 'down|bucket'). */
  _situationPred(sit) {
    if (sit.includes('|')) {
      const [d, b] = sit.split('|');
      return p => p.tags.down === d && (parseInt(p.tags.distance) || 0) > 0
        && StatsEngine._distBucket(parseInt(p.tags.distance)) === b;
    }
    return p => p.tags.down === sit;
  }

  /** Build the Formation × Situation matrix from classifiable offensive plays. */
  _selfScoutMatrix(plays) {
    const SITS = [
      { key: '1', label: '1st' },
      { key: '2|Short', label: '2nd & Short' },
      { key: '2|Medium', label: '2nd & Med' },
      { key: '2|Long', label: '2nd & Long' },
      { key: '3|Short', label: '3rd & Short' },
      { key: '3|Medium', label: '3rd & Med' },
      { key: '3|Long', label: '3rd & Long' },
      { key: '4', label: '4th' },
    ];
    const cells = {}, rowN = {}, colHas = {};
    plays.forEach(p => {
      const isRun = StatsEngine.isRun(p), isPass = StatsEngine.isPass(p);
      if (!isRun && !isPass) return;
      const sit = this._matrixSit(p.tags);
      if (!sit) return;
      const forms = StatsEngine.splitFormations(p.tags.formation).filter(Boolean);
      if (!forms.length) return;
      const yds = parseInt(p.tags.yardage) || 0;
      const succ = this._isSuccessfulPlay(p);
      forms.forEach(f => {
        const k = `${f}${sit}`;
        if (!cells[k]) cells[k] = { n: 0, runs: 0, passes: 0, succ: 0, yards: 0 };
        const c = cells[k];
        c.n++; if (isRun) c.runs++; else c.passes++;
        if (succ) c.succ++; c.yards += yds;
        rowN[f] = (rowN[f] || 0) + 1;
        colHas[sit] = (colHas[sit] || 0) + 1;
      });
    });
    const cols = SITS.filter(s => colHas[s.key]);
    const rows = Object.keys(rowN).sort((a, b) => rowN[b] - rowN[a]).slice(0, 10);
    return { cols, rows, cells, rowN };
  }

  _renderSelfScoutMatrix(m) {
    if (!m || m.rows.length < 2 || m.cols.length < 2) return '';
    const MINC = 3;   // below this, a cell's lean is noise — render it faint
    let header = '<th class="sm-corner">Formation \\ Situation</th>';
    m.cols.forEach(c => { header += `<th>${c.label}</th>`; });
    let body = '';
    m.rows.forEach(f => {
      let row = `<td class="sm-row-label">${Charts._esc(f)} <span class="sm-rown">${m.rowN[f]}</span></td>`;
      m.cols.forEach(c => {
        const cell = m.cells[`${f}${c.key}`];
        if (!cell || !cell.n) { row += '<td class="sm-cell sm-empty">·</td>'; return; }
        const runPct = Math.round(cell.runs / cell.n * 100);
        const lean = runPct >= 50 ? 'R' : 'P';
        const leanPct = Math.max(runPct, 100 - runPct);
        const pred = Math.round((leanPct - 50) * 2);          // 50%→0, 100%→100
        const strong = cell.n >= MINC;
        const color = strong ? StatsEngine._meterColor(pred) : '#94a3b8';
        const bg = strong ? `${color}26` : 'transparent';
        const succ = Math.round(cell.succ / cell.n * 100);
        const avg = (cell.yards / cell.n).toFixed(1);
        const cut = ` cut-row" data-cut-type="comboFS" data-cut-val="${Charts._esc(f)}__${c.key}" data-cut-label="${Charts._esc(f)} on ${c.label} — ${cell.n} plays`;
        row += `<td class="sm-cell${cut}" style="background:${bg};border-color:${strong ? color + '66' : 'transparent'}" title="${Charts._esc(f)} · ${c.label}: ${cell.n} plays, ${runPct}% run, ${succ}% success, ${avg} avg">
          <span class="sm-lean" style="color:${color}">${lean} ${leanPct}%</span>
          <span class="sm-n">${cell.n}</span>
        </td>`;
      });
      body += `<tr>${row}</tr>`;
    });
    return `<div class="stats-section">
      <h3>Predictability Map — Formation × Situation</h3>
      <p class="viz-caption">Your run/pass lean in each spot. <span style="color:#ef4444;font-weight:600">Red = predictable</span> (a DC keys it), <span style="color:#22c55e;font-weight:600">green = balanced</span>; faint cells are small samples. Click any cell to watch those plays.</p>
      <div class="sm-wrap"><table class="stats-table stats-table-full sm-table">
        <thead><tr>${header}</tr></thead><tbody>${body}</tbody>
      </table></div>
    </div>`;
  }

  // ================================================================
  // DEFENSIVE SELF-SCOUT — what tendencies is YOUR defense tipping?
  // Mirrors the offensive self-scout: front/coverage/blitz leans by
  // down & distance, so you can see if you're predictable too.
  // ================================================================

  /** Group defensive plays by a key, counting front/coverage/blitz distribution. */
  _defScoutGroup(plays, keyFn) {
    const g = {};
    plays.forEach(p => {
      let keys = keyFn(p);
      if (!Array.isArray(keys)) keys = [keys];
      const yds = parseInt(p.tags.yardage) || 0;
      const stop = !this._isSuccessfulPlay(p);
      const isHavoc = StatsEngine.hasResult(p, 'Sack') || StatsEngine.hasResult(p, 'Interception') ||
        StatsEngine.hasResult(p, 'Fumble') || (yds < 0 && !StatsEngine.hasResult(p, 'Sack'));
      const fronts = StatsEngine.splitFronts(p.tags.defFront);
      const cov = p.tags.coverage || '';
      const blitz = !!p.tags.blitz;
      keys.forEach(k => {
        if (k == null || k === '' || k === '?' || /(^|&)\?($|&)/.test(String(k))) return;
        if (!g[k]) g[k] = { key: k, n: 0, yards: 0, stops: 0, havoc: 0,
          frontMap: {}, covMap: {}, blitzN: 0 };
        g[k].n++;
        g[k].yards += yds;
        if (stop) g[k].stops++;
        if (isHavoc) g[k].havoc++;
        if (blitz) g[k].blitzN++;
        fronts.forEach(f => { if (f) g[k].frontMap[f] = (g[k].frontMap[f] || 0) + 1; });
        if (cov) g[k].covMap[cov] = (g[k].covMap[cov] || 0) + 1;
      });
    });
    return g;
  }

  /** Extract defensive tells: situations where front/coverage/blitz is
   *  lopsided. `cutFn` maps a group key → {type,val} so each tell links to
   *  its film (the situation's defensive snaps, or all snaps with that
   *  front/coverage). */
  _defTellsFrom(groups, dim, fmt, cutFn) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const out = [];
    Object.values(groups).filter(grp => grp.n >= min).forEach(grp => {
      const label = Charts._esc(fmt(grp.key));
      const cut = cutFn ? cutFn(grp.key) : null;
      const cutType = cut ? cut.type : null;
      const cutVal = cut ? cut.val : null;
      const stopRate = Math.round(grp.stops / grp.n * 100);
      const havocRate = Math.round(grp.havoc / grp.n * 100);
      const avgYds = +(grp.yards / grp.n).toFixed(1);
      const blitzPct = Math.round(grp.blitzN / grp.n * 100);
      // Top front
      const topFront = Object.entries(grp.frontMap).sort((a, b) => b[1] - a[1])[0];
      const topFrontPct = topFront ? Math.round(topFront[1] / grp.n * 100) : 0;
      // Top coverage
      const topCov = Object.entries(grp.covMap).sort((a, b) => b[1] - a[1])[0];
      const topCovPct = topCov ? Math.round(topCov[1] / grp.n * 100) : 0;
      // A tell exists when any one scheme element is dominant (>=70%)
      if (topFrontPct >= 70 && topFront) {
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Front',
          tellVal: Charts._esc(topFront[0]), tellPct: topFrontPct,
          stopRate, havocRate, avgYds, cutType, cutVal,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (topFrontPct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
      if (topCovPct >= 70 && topCov) {
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Coverage',
          tellVal: Charts._esc(topCov[0]), tellPct: topCovPct,
          stopRate, havocRate, avgYds, cutType, cutVal,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (topCovPct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
      if (blitzPct >= 70 || (blitzPct === 0 && grp.n >= min)) {
        const blitzLean = blitzPct >= 70 ? 'Blitz' : 'No blitz';
        const pct = blitzPct >= 70 ? blitzPct : 100 - blitzPct;
        const effective = stopRate >= 50;
        out.push({ dim, label, n: grp.n, tellType: 'Blitz',
          tellVal: blitzLean, tellPct: pct,
          stopRate, havocRate, avgYds, cutType, cutVal,
          verdict: effective ? 'dominant' : 'exploitable',
          score: (pct - 50) * Math.min(grp.n, 12) * (effective ? 0.4 : 1) });
      }
    });
    return out;
  }

  generateDefensiveSelfScout(playsOverride = null) {
    // Source defensive plays directly, NOT via _currentPlays() — that gates on
    // an offensive playType, which silently dropped defensive snaps tagged with
    // only Front/Coverage/Blitz (no offensive play type), leaving the section
    // thin even when the defense was fully tagged. Apply the active filter so
    // filtered views still narrow correctly.
    let all = playsOverride;
    if (!all) {
      all = (this.tagger ? this.tagger.plays : []).filter(p => p && p.tags);
      if (this.filter && this.filter.active) all = this.filter.filter(all);
    }
    const defAll = all.filter(p => (p.tags.unit) === 'defense');
    const plays = defAll.filter(p => p.tags.defFront || p.tags.coverage || p.tags.blitz);
    // Below the sample gate: return a DIAGNOSTIC, not null — the section
    // must explain exactly what's missing instead of silently vanishing
    // (field-reported: "not a single defensive stat in self-scout").
    if (plays.length < 6) {
      return { insufficient: true, defPlays: defAll.length, schemePlays: plays.length };
    }

    const byDD = this._defScoutGroup(plays, p => this._ddKey(p.tags));
    const byFront = this._defScoutGroup(plays, p => StatsEngine.splitFronts(p.tags.defFront));
    const byCov = this._defScoutGroup(plays, p => p.tags.coverage);

    let tells = [
      ...this._defTellsFrom(byDD, 'Down & Dist', k => this._ddPretty(k), k => ({ type: 'ddDef', val: k })),
      ...this._defTellsFrom(byFront, 'vs Front', k => k, k => ({ type: 'defFront', val: k })),
      ...this._defTellsFrom(byCov, 'vs Coverage', k => k, k => ({ type: 'coverage', val: k })),
    ];
    // "No blitz" is only a tell when the coach tags blitzes at all —
    // otherwise it's an artifact of untagged data, not a tendency.
    if (!plays.some(p => p.tags.blitz)) tells = tells.filter(t => t.tellType !== 'Blitz');
    tells = tells.sort((a, b) => b.score - a.score).slice(0, 10);

    // Predictability: how often does the DC lean heavily on one scheme element?
    let wsum = 0, w = 0;
    Object.values(byDD).forEach(grp => {
      if (grp.n < 3) return;
      const topF = Object.values(grp.frontMap).sort((a, b) => b - a)[0] || 0;
      const topC = Object.values(grp.covMap).sort((a, b) => b - a)[0] || 0;
      const maxPct = Math.max(topF, topC, grp.blitzN) / grp.n * 100;
      wsum += maxPct * grp.n; w += grp.n;
    });
    const predictability = w ? Math.round(Math.max(0, Math.min(100, ((wsum / w) - 50) * 2))) : 0;
    const predLabel = predictability >= 70 ? 'Very Predictable'
      : predictability >= 50 ? 'Predictable'
        : predictability >= 30 ? 'Moderate' : 'Balanced';

    // Build rows for tables
    const ddRows = Object.values(byDD).map(grp => {
      const topF = Object.entries(grp.frontMap).sort((a, b) => b[1] - a[1])[0];
      const topC = Object.entries(grp.covMap).sort((a, b) => b[1] - a[1])[0];
      return { key: grp.key, n: grp.n, avgYds: +(grp.yards / grp.n).toFixed(1),
        stopRate: Math.round(grp.stops / grp.n * 100),
        havocRate: Math.round(grp.havoc / grp.n * 100),
        blitzPct: Math.round(grp.blitzN / grp.n * 100),
        topFront: topF ? `${Charts._esc(topF[0])} ${Math.round(topF[1] / grp.n * 100)}%` : '—',
        topCov: topC ? `${Charts._esc(topC[0])} ${Math.round(topC[1] / grp.n * 100)}%` : '—',
      };
    }).sort((a, b) => b.n - a.n).slice(0, 15);

    const recommendations = [];
    const exploitable = tells.filter(t => t.verdict === 'exploitable');
    const dominant = tells.filter(t => t.verdict === 'dominant');
    if (exploitable.length > 0) {
      recommendations.push(`<strong>${exploitable.length} exploitable defensive tendency${exploitable.length > 1 ? 'ies' : 'y'}</strong> — a prepared OC will identify and attack these alignments.`);
    }
    exploitable.slice(0, 4).forEach(t => {
      recommendations.push(`<span class="ss-rec-label">${t.label}</span>: ${t.tellType} tell — ${t.tellVal} ${t.tellPct}% of the time (n=${t.n}), but only ${t.stopRate}% stop rate. Mix in alternative looks.`);
    });
    dominant.slice(0, 3).forEach(t => {
      recommendations.push(`<span class="ss-rec-label ss-rec-strength">${t.label}</span>: ${t.tellVal} ${t.tellPct}% is predictable but <strong>working</strong> — ${t.stopRate}% stop rate${t.havocRate >= 15 ? `, ${t.havocRate}% havoc` : ''}. The alignment is earning its keep.`);
    });
    if (tells.length === 0) {
      recommendations.push('No strong defensive tells at the current sample size — your scheme mix looks balanced across situations.');
    }

    return { totalPlays: plays.length, predictability, predLabel, tells, ddRows, recommendations };
  }

  // ================================================================
  // INSIGHTS ENGINE — non-obvious patterns a coordinator might miss
  // in raw splits. Counter-tendency success, motion tells, direction
  // tells, under-utilized plays, formation-type outliers, half shifts.
  // ================================================================

  _findInsights(plays) {
    const insights = [];
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length < 10) return insights;

    const overallRunPct = classifiable.filter(p => StatsEngine.isRun(p)).length / classifiable.length * 100;
    const overallAvg = classifiable.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / classifiable.length;
    const overallSucc = classifiable.filter(p => this._isSuccessfulPlay(p)).length / classifiable.length * 100;

    // 1. Counter-tendency success: when you DO the rare thing, how well does it work?
    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(p.tags.formation));
    Object.values(byFormation).forEach(grp => {
      if (grp.n < min + 2) return;
      const runPct = grp.runs / grp.n * 100;
      if (runPct >= 70 && grp.passes >= 2) {
        const passAvg = grp.passYards / grp.passes;
        const passSucc = grp.passSucc / grp.passes * 100;
        if (passAvg >= overallAvg * 1.3 || passSucc >= 60) {
          insights.push({ type: 'counter', priority: passAvg * 2,
            text: `When you <strong>pass</strong> from <strong>${Charts._esc(grp.key)}</strong> (only ${100 - Math.round(runPct)}% of the time), you average ${passAvg.toFixed(1)} yds at ${Math.round(passSucc)}% success. The run tendency may be setting up the big play — protect this wrinkle.`,
            tag: 'Hidden Weapon' });
        }
      }
      if (runPct <= 30 && grp.runs >= 2) {
        const runAvg = grp.runYards / grp.runs;
        const runSucc = grp.runSucc / grp.runs * 100;
        if (runAvg >= overallAvg * 1.3 || runSucc >= 60) {
          insights.push({ type: 'counter', priority: runAvg * 2,
            text: `When you <strong>run</strong> from <strong>${Charts._esc(grp.key)}</strong> (only ${Math.round(runPct)}% of the time), you average ${runAvg.toFixed(1)} yds at ${Math.round(runSucc)}% success. The pass tendency may be setting up the ground game — protect this wrinkle.`,
            tag: 'Hidden Weapon' });
        }
      }
    });

    // 2. Motion as a tell
    const motionPlays = classifiable.filter(p => p.tags.motion && p.tags.motion !== '');
    const noMotionPlays = classifiable.filter(p => !p.tags.motion || p.tags.motion === '');
    if (motionPlays.length >= min && noMotionPlays.length >= min) {
      const motionRunPct = Math.round(motionPlays.filter(p => StatsEngine.isRun(p)).length / motionPlays.length * 100);
      const noMotionRunPct = Math.round(noMotionPlays.filter(p => StatsEngine.isRun(p)).length / noMotionPlays.length * 100);
      const diff = Math.abs(motionRunPct - noMotionRunPct);
      if (diff >= 25) {
        const motionLean = motionRunPct > noMotionRunPct ? 'run' : 'pass';
        const motionAvg = motionPlays.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / motionPlays.length;
        insights.push({ type: 'motion', priority: diff * 1.5,
          text: `Pre-snap <strong>motion</strong> shifts your run/pass mix by ${diff} points (${motionRunPct}% run w/ motion vs ${noMotionRunPct}% without). Motion ${motionLean === 'run' ? 'telegraphs the run' : 'tips the pass'} — averaging ${motionAvg.toFixed(1)} yds with motion.`,
          tag: 'Motion Tell' });
      }
    }

    // 3. Play direction tells from formation
    const playDirPlays = classifiable.filter(p => p.tags.playDir);
    if (playDirPlays.length >= min * 2) {
      const formDirGroup = {};
      playDirPlays.forEach(p => {
        StatsEngine.splitFormations(p.tags.formation).forEach(f => {
          if (!f) return;
          if (!formDirGroup[f]) formDirGroup[f] = {};
          const dir = p.tags.playDir;
          formDirGroup[f][dir] = (formDirGroup[f][dir] || 0) + 1;
        });
      });
      Object.entries(formDirGroup).forEach(([form, dirs]) => {
        const total = Object.values(dirs).reduce((s, v) => s + v, 0);
        if (total < min) return;
        Object.entries(dirs).forEach(([dir, count]) => {
          const pct = Math.round(count / total * 100);
          if (pct >= 75) {
            insights.push({ type: 'direction', priority: (pct - 50) * 1.2 * Math.min(count, 10),
              text: `From <strong>${Charts._esc(form)}</strong>, you go <strong>${Charts._esc(dir.toLowerCase())}</strong> ${pct}% of the time (${count}/${total} plays). A DC with film will shade that direction.`,
              tag: 'Direction Tell' });
          }
        });
      });
    }

    // 4. Formation-PlayType outliers: a specific combo that dramatically out/under-performs
    const formTypeGroup = {};
    classifiable.forEach(p => {
      const forms = StatsEngine.splitFormations(p.tags.formation);
      const types = StatsEngine.splitPlayTypes(p.tags.playType);
      forms.forEach(f => { types.forEach(t => {
        if (!f || !t) return;
        const k = `${f}|${t}`;
        if (!formTypeGroup[k]) formTypeGroup[k] = { f, t, n: 0, yds: 0, succ: 0 };
        formTypeGroup[k].n++;
        formTypeGroup[k].yds += parseInt(p.tags.yardage) || 0;
        if (this._isSuccessfulPlay(p)) formTypeGroup[k].succ++;
      });});
    });
    Object.values(formTypeGroup).forEach(g => {
      if (g.n < 3) return;
      const avg = g.yds / g.n;
      const succR = g.succ / g.n * 100;
      if (avg >= overallAvg * 2 && succR >= 55) {
        insights.push({ type: 'outlier', priority: avg * 1.5,
          text: `<strong>${Charts._esc(g.f)} + ${Charts._esc(g.t)}</strong> averages ${avg.toFixed(1)} yds at ${Math.round(succR)}% success (${g.n} plays) — well above your ${overallAvg.toFixed(1)} baseline. Consider featuring this combo.`,
          tag: 'Outperformer' });
      }
      if (avg <= 1 && g.n >= min && succR < 30) {
        insights.push({ type: 'outlier', priority: (overallAvg - avg) * 1.5,
          text: `<strong>${Charts._esc(g.f)} + ${Charts._esc(g.t)}</strong> averages only ${avg.toFixed(1)} yds at ${Math.round(succR)}% success (${g.n} plays). Well below your ${overallAvg.toFixed(1)} baseline — this combo isn't working.`,
          tag: 'Underperformer' });
      }
    });

    // 5. Half-to-half shift: does your offense change in the 2nd half?
    const tagged = classifiable.filter(p => p.tags.quarter);
    const firstHalf = tagged.filter(p => p.tags.quarter === 'Q1' || p.tags.quarter === 'Q2');
    const secondHalf = tagged.filter(p => p.tags.quarter === 'Q3' || p.tags.quarter === 'Q4');
    if (firstHalf.length >= min * 2 && secondHalf.length >= min * 2) {
      const h1Run = Math.round(firstHalf.filter(p => StatsEngine.isRun(p)).length / firstHalf.length * 100);
      const h2Run = Math.round(secondHalf.filter(p => StatsEngine.isRun(p)).length / secondHalf.length * 100);
      const shift = Math.abs(h1Run - h2Run);
      if (shift >= 20) {
        const dir = h2Run > h1Run ? 'run-heavy' : 'pass-heavy';
        const h2Avg = secondHalf.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0) / secondHalf.length;
        insights.push({ type: 'tempo', priority: shift * 1.3,
          text: `Your offense gets <strong>${dir}</strong> in the 2nd half (${h1Run}% run in H1 → ${h2Run}% in H2, a ${shift}-point swing). 2nd-half yds/play: ${h2Avg.toFixed(1)}. A DC who notices will adjust at the half.`,
          tag: 'Half-to-Half Shift' });
      }
    }

    // 6. Down-and-distance success anomalies vs baseline
    const byDD = this._selfScoutGroup(plays, p => this._ddKey(p.tags));
    Object.values(byDD).forEach(grp => {
      if (grp.n < min) return;
      const succRate = (grp.runSucc + grp.passSucc) / grp.n * 100;
      const diff = succRate - overallSucc;
      if (Math.abs(diff) >= 20 && succRate < 30) {
        insights.push({ type: 'situation', priority: Math.abs(diff) * 1.1,
          text: `On <strong>${this._ddPretty(grp.key)}</strong> your success rate is only ${Math.round(succRate)}% (vs ${Math.round(overallSucc)}% overall, n=${grp.n}). Something about this situation isn't working — the play call, protection, or a tendency the defense has keyed.`,
          tag: 'Struggle Spot' });
      }
    });

    // 7. Personnel→formation diversity: a personnel group that maps to only 1-2 formations
    // is readable from the huddle — the DC knows the look before the offense lines up.
    const persFormDiv = this._personnelFormationDiversity(plays);
    persFormDiv.forEach(pf => {
      if (pf.topPct < 80) return;
      insights.push({ type: 'personnel', priority: (pf.topPct - 50) * Math.min(pf.n, 12) * 0.9,
        text: `<strong>${Charts._esc(pf.personnel)} personnel</strong> lines up in <strong>${Charts._esc(pf.topFormation)}</strong> ${pf.topPct}% of the time (${pf.topCount}/${pf.n} plays). A DC can read the grouping from the huddle and anticipate the formation before you break it.`,
        tag: 'Personnel Tell' });
    });

    return insights.sort((a, b) => b.priority - a.priority).slice(0, 6);
  }

  _personnelFormationDiversity(plays) {
    const min = StatsEngine._SELF_SCOUT_MIN_N;
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    const groups = {};
    classifiable.forEach(p => {
      const pers = p.tags.personnel;
      if (!pers) return;
      if (!groups[pers]) groups[pers] = { formations: {}, n: 0 };
      groups[pers].n++;
      StatsEngine.splitFormations(p.tags.formation).forEach(f => {
        if (!f) return;
        groups[pers].formations[f] = (groups[pers].formations[f] || 0) + 1;
      });
    });
    const results = [];
    Object.entries(groups).forEach(([pers, g]) => {
      if (g.n < min) return;
      const sorted = Object.entries(g.formations).sort((a, b) => b[1] - a[1]);
      if (sorted.length === 0) return;
      const unique = sorted.length;
      const topFormation = sorted[0][0];
      const topCount = sorted[0][1];
      const topPct = Math.round(topCount / g.n * 100);
      results.push({
        personnel: pers, n: g.n, uniqueFormations: unique,
        topFormation, topCount, topPct,
        formations: sorted.map(([f, count]) => ({ formation: f, count, pct: Math.round(count / g.n * 100) })),
      });
    });
    return results.sort((a, b) => b.topPct - a.topPct);
  }

  generateSelfScout(playsOverride = null) {
    const all = playsOverride || this._currentPlays();
    // Self-scout is about your own offense's tendencies.
    const plays = all.filter(p => (p.tags.unit || 'offense') === 'offense');
    const classifiable = plays.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
    if (classifiable.length === 0) return null;

    const byFormation = this._selfScoutGroup(plays, p => StatsEngine.splitFormations(p.tags.formation));
    const byDownDist = this._selfScoutGroup(plays, p => this._ddKey(p.tags));
    const byPersonnel = this._selfScoutGroup(plays, p => p.tags.personnel);
    const byHash = this._selfScoutGroup(plays, p => p.tags.hash);
    // Combined formation-on-down — what a DC actually keys on.
    const byCombo = this._selfScoutGroup(plays, p => {
      const dd = this._ddKey(p.tags);
      if (!dd) return [];
      return StatsEngine.splitFormations(p.tags.formation).map(f => `${f}__${dd}`);
    });
    // Hudl-model dimensions: backfield, strength, and the high-value Formation ×
    // Strength grid (e.g. "Trips Right is 90% run" — what a DC keys on).
    const byBackfield = this._selfScoutGroup(plays, p => p.tags.backfield);
    const byStrength = this._selfScoutGroup(plays, p => p.tags.strength);
    const byFormStr = this._selfScoutGroup(plays, p => {
      const s = p.tags.strength;
      if (!s) return [];
      return StatsEngine.splitFormations(p.tags.formation).map(f => `${f}__${s}`);
    });

    let tells = [
      ...this._tellsFrom(byCombo, 'Formation × Down', k => {
        const [f, dd] = k.split('__'); return `${f} on ${this._ddPretty(dd)}`;
      }, k => ({ type: 'comboFD', val: k })),
      ...this._tellsFrom(byFormation, 'Formation', k => `From ${k}`, k => ({ type: 'formation', val: k })),
      ...this._tellsFrom(byDownDist, 'Down & Dist', k => this._ddPretty(k), k => ({ type: 'dd', val: k })),
      ...this._tellsFrom(byPersonnel, 'Personnel', k => `${k} personnel`, k => ({ type: 'personnel', val: k })),
      ...this._tellsFrom(byHash, 'Hash', k => `${k} hash`, k => ({ type: 'hash', val: k })),
      ...this._tellsFrom(byBackfield, 'Backfield', k => `From ${k} backfield`, k => ({ type: 'backfield', val: k })),
      ...this._tellsFrom(byStrength, 'Strength', k => `Strong ${k}`, k => ({ type: 'strength', val: k })),
      ...this._tellsFrom(byFormStr, 'Formation × Strength', k => { const [f, s] = k.split('__'); return `${f} ${s}`; }, k => ({ type: 'comboFStr', val: k })),
    ].sort((a, b) => b.score - a.score).slice(0, 12);

    const predictability = this._predictabilityIndex(byFormation, byDownDist);
    const predLabel = predictability >= 70 ? 'Very Predictable'
      : predictability >= 50 ? 'Predictable'
        : predictability >= 30 ? 'Moderate' : 'Balanced';

    // Context-aware coaching recommendations: factor in effectiveness
    // so a dominant tendency ("we run 88% from Power-I at 16 YPC") is
    // praised as a strength, not flagged as a problem.
    const recommendations = [];
    const exploitable = tells.filter(t => t.verdict === 'exploitable');
    const effective = tells.filter(t => t.verdict === 'effective');
    const dominant = tells.filter(t => t.verdict === 'dominant');

    if (exploitable.length > 0) {
      recommendations.push(`<strong>${exploitable.length} exploitable tendency${exploitable.length > 1 ? 'ies' : 'y'}</strong> — these situations are both predictable and underperforming. A prepared DC will take away your lean.`);
    }
    exploitable.slice(0, 4).forEach(t => {
      const c = t.counter || StatsEngine._offenseTellCounter(t.lean);
      recommendations.push(`<span class="ss-rec-label">${t.label}</span>: you ${t.lean.toLowerCase()} ${t.leanPct}% (n=${t.n}) at ${t.leanAvg} yds/${t.leanSuccRate}% success — the lean isn't paying off, and ${c.threat}. Add ${c.fix}.`);
    });
    effective.slice(0, 3).forEach(t => {
      const c = t.counter || StatsEngine._offenseTellCounter(t.lean);
      const prod = t.leanAvg >= 5 ? 'productive' : 'adequate';
      recommendations.push(`<span class="ss-rec-label">${t.label}</span>: your ${t.lean.toLowerCase()} lean (${t.leanPct}%) is ${prod} at ${t.leanAvg} yds/${t.leanSuccRate}% success, but ${c.threat}. Carry one constraint (${c.fix}) per game to hold them honest.`);
    });
    dominant.slice(0, 3).forEach(t => {
      recommendations.push(`<span class="ss-rec-label ss-rec-strength">${t.label}</span>: you ${t.lean.toLowerCase()} ${t.leanPct}% and it's <strong>working</strong> — ${t.leanAvg} yds, ${t.leanSuccRate}% success${t.tds ? `, ${t.tds} TD${t.tds > 1 ? 's' : ''}` : ''}. Keep riding it. The tendency is a feature, not a bug.`);
    });
    if (tells.length === 0) {
      recommendations.push('No strong tells at the current sample size — your run/pass mix is well balanced across situations. Keep tagging for finer-grained insight.');
    } else if (exploitable.length === 0 && tells.length > 0) {
      recommendations.push('Your tendencies are all backed by strong production. No urgent fixes — just be aware that a DC who does the film work will see the leans.');
    }

    const insights = this._findInsights(plays);
    const personnelDiversity = this._personnelFormationDiversity(plays);

    const defScout = this.generateDefensiveSelfScout(playsOverride);

    return {
      totalPlays: classifiable.length,
      predictability, predLabel,
      tells,
      matrix: this._selfScoutMatrix(plays),
      formationRows: this._selfScoutRows(byFormation),
      downDistRows: this._selfScoutRows(byDownDist).sort((a, b) => b.n - a.n).slice(0, 15),
      personnelRows: this._selfScoutRows(byPersonnel),
      personnelDiversity,
      recommendations,
      insights,
      defScout,
    };
  }

  _selfScoutTellsTable(tells) {
    if (!tells.length) return '<p style="color:var(--text-dim)">No strong tells at the current sample size.</p>';
    return `<table class="stats-table stats-table-full ss-tells">
      <thead><tr><th>Situation</th><th>Type</th><th>Tendency</th><th>Avg</th><th>Succ%</th><th>Assessment</th><th>n</th></tr></thead>
      <tbody>${tells.map(t => {
        const cut = t.cutType ? ` cut-row" data-cut-type="${t.cutType}" data-cut-val="${Charts._esc(t.cutVal)}" data-cut-label="${t.label} — ${t.n} plays` : '';
        return `<tr class="ss-verdict-${t.verdict}${cut}">
        <td>${t.label}</td>
        <td><span class="ss-dim">${t.dim}</span></td>
        <td><span class="ss-bar ss-bar-${t.lean === 'Run' ? 'run' : 'pass'}" style="--p:${t.leanPct}%">${t.lean} ${t.leanPct}%</span></td>
        <td>${t.leanAvg}</td>
        <td>${t.leanSuccRate}%</td>
        <td><span class="ss-verdict ss-verdict-${t.verdict}">${StatsEngine._verdictIcon(t.verdict)} ${StatsEngine._verdictLabel(t.verdict)}</span></td>
        <td>${t.n}</td>
      </tr>`;
      }).join('')}</tbody>
    </table>`;
  }

  _selfScoutSplitTable(rows, label) {
    return `<table class="stats-table stats-table-full ss-split">
      <thead><tr><th>${label}</th><th>#</th><th>Run</th><th>Pass</th><th>R Avg</th><th>P Avg</th><th>Succ%</th><th>Tell</th></tr></thead>
      <tbody>${rows.map(r => `<tr${r.tell ? ' class="ss-split-tell"' : ''}>
        <td>${r.dim ? this._ddPretty(r.key) : (label === 'Down & Dist' ? this._ddPretty(r.key) : Charts._esc(r.key))}</td>
        <td>${r.n}</td>
        <td><span class="ss-split-bar ss-bar-run" style="--p:${r.runPct}%">${r.runPct}%</span></td>
        <td><span class="ss-split-bar ss-bar-pass" style="--p:${r.passPct}%">${r.passPct}%</span></td>
        <td>${r.runAvg}</td><td>${r.passAvg}</td>
        <td>${r.succRate}%</td>
        <td>${r.tell ? `<span class="ss-flag">${r.lean} ${r.leanPct}%</span>` : '<span class="ss-ok">balanced</span>'}</td>
      </tr>`).join('')}</tbody>
    </table>`;
  }

  _renderPersonnelDiversity(items) {
    if (!items || !items.length) return '';
    const locked = items.filter(pf => pf.topPct >= 75);
    if (!locked.length) return '';
    const rows = locked.map(pf => {
      const bars = pf.formations.map(f =>
        `<span class="pd-bar" style="flex:${f.pct}" title="${Charts._esc(f.formation)} ${f.pct}%">${f.pct >= 15 ? Charts._esc(f.formation) : ''}</span>`
      ).join('');
      const flag = pf.topPct >= 90 ? 'locked' : pf.topPct >= 75 ? 'leaning' : '';
      const label = pf.topPct >= 90 ? 'Locked' : 'Leaning';
      return `<tr class="cut-row" data-cut-type="personnel" data-cut-val="${Charts._esc(pf.personnel)}" data-cut-label="${pf.personnel} personnel — ${pf.n} plays">
        <td>${Charts._esc(pf.personnel)}</td>
        <td>${pf.n}</td>
        <td>${pf.uniqueFormations}</td>
        <td>${Charts._esc(pf.topFormation)}</td>
        <td>${pf.topPct}%</td>
        <td><div class="pd-bars">${bars}</div></td>
        <td><span class="pd-flag pd-flag-${flag}">${label}</span></td>
      </tr>`;
    }).join('');
    return `<div class="stats-section ss-personnel-diversity">
      <h3>Personnel → Formation Diversity</h3>
      <p class="viz-caption">When a personnel group maps to one or two formations, the defense reads the grouping from the huddle and knows the look before you line up.</p>
      <table class="stats-table stats-table-full ss-pd-table">
        <thead><tr><th>Personnel</th><th>#</th><th>Forms</th><th>Top Formation</th><th>Top %</th><th>Distribution</th><th>Read</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>`;
  }

  _exportPersonnelDiversity(items) {
    if (!items || !items.length) return '';
    const locked = items.filter(pf => pf.topPct >= 75);
    if (!locked.length) return '';
    const rows = locked.map(pf => {
      const flag = pf.topPct >= 90 ? 'Locked' : 'Leaning';
      const color = pf.topPct >= 90 ? '#ef4444' : '#f59e0b';
      const formList = pf.formations.map(f => `${f.formation} (${f.pct}%)`).join(', ');
      return `<tr><td>${Charts._esc(pf.personnel)}</td><td>${pf.n}</td><td>${pf.uniqueFormations}</td><td>${Charts._esc(pf.topFormation)}</td><td>${pf.topPct}%</td><td style="font-size:11px">${formList}</td><td style="color:${color};font-weight:600">${flag}</td></tr>`;
    }).join('');
    return `<h3>Personnel → Formation Diversity</h3><p style="font-size:12px;color:#666;margin-bottom:8px">Groups that map to 1-2 formations are readable from the huddle.</p><table><thead><tr><th>Personnel</th><th>#</th><th>Forms</th><th>Top Formation</th><th>Top %</th><th>Distribution</th><th>Read</th></tr></thead><tbody>${rows}</tbody></table>`;
  }

  /** Diagnostic empty state: say exactly why the defensive analysis can't
   *  run yet — never hide the section silently. */
  _defScoutEmptyState(ds) {
    const defPlays = (ds && ds.defPlays) || 0;
    const schemePlays = (ds && ds.schemePlays) || 0;
    let why;
    if (defPlays === 0) {
      why = `No plays are tagged as <b>Defense</b> yet. Set the unit toggle at
        the top of the tag form to <b>Defense</b> (or press <kbd>C</kbd>) on
        your defensive snaps.`;
    } else if (schemePlays === 0) {
      why = `You have <b>${defPlays} defensive play${defPlays === 1 ? '' : 's'}</b> tagged,
        but none include the scheme fields this analysis reads —
        <b>Def Front</b>, <b>Coverage</b>, or <b>Blitz</b>. Results and yardage
        power the Defensive Report (the Defense button); the self-scout needs
        the alignment tags to see what your <i>calls</i> are tipping.`;
    } else {
      why = `You have <b>${defPlays} defensive play${defPlays === 1 ? '' : 's'}</b> tagged,
        but only <b>${schemePlays}</b> include Def Front / Coverage / Blitz —
        it takes at least <b>6</b> to find scheme tendencies. Tag a few more
        and this section fills in.`;
    }
    return `
      <div class="stats-section ss-def-section">
        <div class="ss-def-header"><h3>Defensive Self-Scout</h3></div>
        <p style="color:var(--text-dim);line-height:1.65;font-size:13px">
          This section analyzes what <b>your defense</b> is tipping — front,
          coverage, and blitz leans by down &amp; distance, scored by whether
          the lean is working (stop rate / havoc).</p>
        <p style="color:var(--text-dim);line-height:1.65;font-size:13px">${why}</p>
      </div>`;
  }

  _renderDefScoutSection(ds) {
    const mc = StatsEngine._meterColor(ds.predictability);
    const tellsHtml = ds.tells.length ? `<table class="stats-table stats-table-full ss-tells">
      <thead><tr><th>Situation</th><th>Type</th><th>Tell</th><th>Lean</th><th>Stop%</th><th>Havoc%</th><th>Assessment</th><th>n</th></tr></thead>
      <tbody>${ds.tells.map(t => {
        const cut = t.cutType ? ` cut-row" data-cut-type="${t.cutType}" data-cut-val="${Charts._esc(t.cutVal)}" data-cut-label="${t.label} — ${t.n} plays` : '';
        return `<tr class="ss-verdict-${t.verdict}${cut}">
        <td>${t.label}</td>
        <td><span class="ss-dim">${t.dim}</span></td>
        <td>${t.tellType}</td>
        <td><span class="ss-bar ss-bar-${t.tellType === 'Blitz' ? 'pass' : 'run'}" style="--p:${t.tellPct}%">${t.tellVal} ${t.tellPct}%</span></td>
        <td>${t.stopRate}%</td>
        <td>${t.havocRate}%</td>
        <td><span class="ss-verdict ss-verdict-${t.verdict}">${StatsEngine._verdictIcon(t.verdict)} ${StatsEngine._verdictLabel(t.verdict)}</span></td>
        <td>${t.n}</td>
      </tr>`;
      }).join('')}</tbody>
    </table>` : '<p style="color:var(--text-dim)">No defensive scheme tells at the current sample size.</p>';

    const ddTableHtml = ds.ddRows.length ? `<table class="stats-table stats-table-full ss-split">
      <thead><tr><th>Situation</th><th>#</th><th>Top Front</th><th>Top Coverage</th><th>Blitz%</th><th>Stop%</th><th>Havoc%</th><th>Avg Yds</th></tr></thead>
      <tbody>${ds.ddRows.map(r => `<tr>
        <td>${this._ddPretty(r.key)}</td><td>${r.n}</td>
        <td>${r.topFront}</td><td>${r.topCov}</td>
        <td>${r.blitzPct}%</td><td>${r.stopRate}%</td>
        <td>${r.havocRate}%</td><td>${r.avgYds}</td>
      </tr>`).join('')}</tbody>
    </table>` : '';

    return `
      <div class="stats-section ss-def-section">
        <div class="ss-def-header">
          <h3>Defensive Self-Scout</h3>
          <div class="ss-def-summary">
            ${ds.totalPlays} defensive plays &middot; Predictability: <span style="color:${mc};font-weight:700">${ds.predictability}/100 (${ds.predLabel})</span>
          </div>
        </div>
        ${ds.recommendations.length ? `<div class="ss-recs" style="margin-bottom:12px">${ds.recommendations.map(r => `<div class="ss-rec">${r}</div>`).join('')}</div>` : ''}
        <h4 style="margin:12px 0 6px;font-size:13px;color:var(--text-dim)">Defensive Tendency Tells</h4>
        ${tellsHtml}
        ${ddTableHtml ? `<h4 style="margin:16px 0 6px;font-size:13px;color:var(--text-dim)">Scheme by Situation</h4>${ddTableHtml}` : ''}
      </div>`;
  }

  /** Graceful in-overlay empty state — use instead of a blocking alert() when a
   *  report has nothing to show (no plays tagged for it yet). */
  _emptyOverlay(title, msg) {
    this.dashboardEl.innerHTML = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>${Charts._esc(title)}</h2>
            <div class="stats-header-actions"><button class="btn btn-sm btn-danger" id="btnCloseEmptyOv">Close</button></div>
          </div>
          <div class="stats-body"><div class="stats-section" style="text-align:center;padding:40px 24px">
            <div style="font-size:34px;margin-bottom:10px">📋</div>
            <p style="color:var(--text-dim);line-height:1.7;max-width:520px;margin:0 auto">${Charts._esc(msg)}</p>
          </div></div>
        </div>
      </div>`;
    this.dashboardEl.classList.remove('hidden');
    const b = this.dashboardEl.querySelector('#btnCloseEmptyOv');
    if (b) b.addEventListener('click', () => this.hideDashboard());
    const ov = this.dashboardEl.querySelector('.stats-overlay');
    if (ov) ov.addEventListener('click', e => { if (e.target.classList.contains('stats-overlay')) this.hideDashboard(); });
  }

  renderSelfScout() {
    const report = this.generateSelfScout();
    if (!report) { this._emptyOverlay('Self-Scout', 'No run/pass-tagged offensive plays yet. Tag your offense’s Run/Pass (and Play Type) on a few snaps, then re-open Self-Scout to see your tendencies and the tells you’re giving away.'); return; }
    const team = Charts._esc(document.getElementById('gameTeamName')?.value || 'Our Offense');
    const mc = StatsEngine._meterColor(report.predictability);
    const exploitable = report.tells.filter(t => t.verdict === 'exploitable').length;
    const dominant = report.tells.filter(t => t.verdict === 'dominant').length;
    const headlineClass = exploitable > 0 ? 'ss-headline-warn' : dominant > 0 ? 'ss-headline-good' : 'ss-headline-neutral';
    const headline = exploitable > 0
      ? `${exploitable} exploitable tell${exploitable > 1 ? 's' : ''} found`
      : dominant > 0 ? `Tendencies backed by production` : 'Well balanced';

    const html = `
      <div class="stats-overlay">
        <div class="stats-container">
          <div class="stats-header">
            <h2>Self-Scout Report</h2>
            <div class="stats-header-actions">
              <button class="btn btn-sm" id="btnExportSelfScout">Export</button>
              <button class="btn btn-sm btn-danger" id="btnCloseSelfScout">Close</button>
            </div>
          </div>
          <div class="stats-body ss-report">
            <div class="ss-hero">
              <div class="ss-hero-title">${team}</div>
              <div class="ss-hero-sub">${report.totalPlays} classifiable plays analyzed</div>
            </div>
            <div class="ss-summary-row">
              <div class="ss-summary-card ss-card-meter">
                <div class="ss-card-label">Predictability Index</div>
                <div class="ss-meter-wrap">
                  ${Charts.gauge(report.predictability, '', mc, 130)}
                </div>
                <div class="ss-meter-label" style="color:${mc}">${report.predLabel}</div>
                <div class="ss-card-hint">Run/pass lean across formations &amp; situations</div>
              </div>
              <div class="ss-summary-card ss-card-headline ${headlineClass}">
                <div class="ss-card-label">Assessment</div>
                <div class="ss-headline-text">${headline}</div>
                <div class="ss-headline-detail">
                  ${report.tells.length} total tell${report.tells.length !== 1 ? 's' : ''}${exploitable ? ` &middot; <span class="ss-ct-bad">${exploitable} exploitable</span>` : ''}${dominant ? ` &middot; <span class="ss-ct-good">${dominant} dominant</span>` : ''}
                </div>
              </div>
            </div>
            ${report.recommendations.length ? `<div class="stats-section ss-recs-section">
              <h3>Coaching Notes</h3>
              <div class="ss-recs">${report.recommendations.map(r => `<div class="ss-rec">${r}</div>`).join('')}</div>
            </div>` : ''}
            <div class="stats-section">
              <h3>Tendency Breakdown</h3>
              ${this._selfScoutTellsTable(report.tells)}
            </div>
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
            ${report.insights.length ? `<div class="stats-section ss-insights-section">
              <h3>Film Room Insights</h3>
              <div class="ss-insights">${report.insights.map(ins => `<div class="ss-insight ss-insight-${ins.type}">
                <span class="ss-insight-tag ss-tag-${ins.type}">${ins.tag}</span>
                <span class="ss-insight-text">${ins.text}</span>
              </div>`).join('')}</div>
            </div>` : ''}
            ${this._defScoutBlock(report.defScout)}
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
    const title = `Self-Scout Report: ${team}`;
    const vc = v => v === 'dominant' ? '#22c55e' : v === 'effective' ? '#f59e0b' : '#ef4444';
    const tellRows = report.tells.map(t =>
      `<tr><td>${t.label}</td><td>${t.dim}</td><td>${t.lean} ${t.leanPct}%</td><td>${t.leanAvg} yds</td><td>${t.leanSuccRate}%</td><td style="color:${vc(t.verdict)};font-weight:600">${StatsEngine._verdictLabel(t.verdict)}</td><td>${t.n}</td></tr>`
    ).join('') || '<tr><td colspan="7">No strong tells at current sample size.</td></tr>';
    const formRows = report.formationRows.map(r =>
      `<tr${r.tell ? ' style="font-weight:600"' : ''}><td>${Charts._esc(r.key)}</td><td>${r.n}</td><td>${r.runPct}%</td><td>${r.passPct}%</td><td>${r.runAvg}</td><td>${r.passAvg}</td><td>${r.succRate}%</td><td>${r.tell ? r.lean + ' ' + r.leanPct + '%' : '—'}</td></tr>`
    ).join('');
    const ddRows = report.downDistRows.map(r =>
      `<tr${r.tell ? ' style="font-weight:600"' : ''}><td>${this._ddPretty(r.key)}</td><td>${r.n}</td><td>${r.runPct}%</td><td>${r.passPct}%</td><td>${r.runAvg}</td><td>${r.passAvg}</td><td>${r.succRate}%</td><td>${r.tell ? r.lean + ' ' + r.leanPct + '%' : '—'}</td></tr>`
    ).join('');
    const mc = StatsEngine._meterColor(report.predictability);
    const exploitable = report.tells.filter(t => t.verdict === 'exploitable').length;
    const dominant = report.tells.filter(t => t.verdict === 'dominant').length;
    const body = `
<div class="print-hero">
  <h1>${title}</h1>
  <p class="sub">Generated ${new Date().toLocaleString()} &middot; ${report.totalPlays} run/pass plays</p>
</div>
<div class="print-summary">
  <div class="print-card">
    <div class="print-card-label">Predictability</div>
    <div class="meter"><div style="width:${report.predictability}%;background:${mc}"></div></div>
    <div class="mval" style="color:${mc}">${report.predictability}<span style="font-size:14px;color:#999">/100</span> &mdash; ${report.predLabel}</div>
  </div>
  <div class="print-card">
    <div class="print-card-label">Assessment</div>
    <div class="print-assessment">${report.tells.length} tell${report.tells.length !== 1 ? 's' : ''}${exploitable ? ` &middot; <span style="color:#ef4444">${exploitable} exploitable</span>` : ''}${dominant ? ` &middot; <span style="color:#22c55e">${dominant} dominant</span>` : ''}</div>
  </div>
</div>
${report.recommendations.length ? `<h3>Coaching Notes</h3><div class="print-recs">${report.recommendations.map(r => `<div class="print-rec">${r}</div>`).join('')}</div>` : ''}
<h3>Tendency Breakdown</h3><table><thead><tr><th>Situation</th><th>Type</th><th>Tendency</th><th>Avg Yds</th><th>Succ%</th><th>Assessment</th><th>n</th></tr></thead><tbody>${tellRows}</tbody></table>
<h3>By Formation</h3><table><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>R Avg</th><th>P Avg</th><th>Succ%</th><th>Tell</th></tr></thead><tbody>${formRows}</tbody></table>
<h3>By Down &amp; Distance</h3><table><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th><th>R Avg</th><th>P Avg</th><th>Succ%</th><th>Tell</th></tr></thead><tbody>${ddRows}</tbody></table>
${this._exportPersonnelDiversity(report.personnelDiversity)}
${report.insights.length ? `<h3>Film Room Insights</h3><div class="print-recs">${report.insights.map(ins => `<div class="print-rec"><strong style="color:#1a1a2e">[${ins.tag}]</strong> ${ins.text}</div>`).join('')}</div>` : ''}
${report.defScout && !report.defScout.insufficient ? this._exportDefScoutSection(report.defScout) : ''}`;
    this._openPrintWindow(title, body, 'ss-print');
  }

  _exportDefScoutSection(ds) {
    const vc = v => v === 'dominant' ? '#22c55e' : '#ef4444';
    const mc = StatsEngine._meterColor(ds.predictability);
    const tellRows = ds.tells.map(t =>
      `<tr><td>${t.label}</td><td>${t.dim}</td><td>${t.tellType}</td><td>${t.tellVal} ${t.tellPct}%</td><td>${t.stopRate}%</td><td>${t.havocRate}%</td><td style="color:${vc(t.verdict)};font-weight:600">${StatsEngine._verdictLabel(t.verdict)}</td><td>${t.n}</td></tr>`
    ).join('') || '<tr><td colspan="8">No defensive scheme tells at current sample size.</td></tr>';
    const ddRows = ds.ddRows.map(r =>
      `<tr><td>${this._ddPretty(r.key)}</td><td>${r.n}</td><td>${r.topFront}</td><td>${r.topCov}</td><td>${r.blitzPct}%</td><td>${r.stopRate}%</td><td>${r.havocRate}%</td><td>${r.avgYds}</td></tr>`
    ).join('');
    return `
<h3 style="border-bottom-color:#3b82f6">Defensive Self-Scout</h3>
<p class="sub">${ds.totalPlays} defensive plays &middot; Predictability: <span style="color:${mc};font-weight:700">${ds.predictability}/100 (${ds.predLabel})</span></p>
${ds.recommendations.length ? `<div class="print-recs">${ds.recommendations.map(r => `<div class="print-rec">${r}</div>`).join('')}</div>` : ''}
<table><thead><tr><th>Situation</th><th>Type</th><th>Tell</th><th>Lean</th><th>Stop%</th><th>Havoc%</th><th>Assessment</th><th>n</th></tr></thead><tbody>${tellRows}</tbody></table>
${ddRows ? `<h4 style="margin-top:16px;font-size:12px;color:#666">Scheme by Situation</h4><table><thead><tr><th>Situation</th><th>#</th><th>Top Front</th><th>Top Coverage</th><th>Blitz%</th><th>Stop%</th><th>Havoc%</th><th>Avg Yds</th></tr></thead><tbody>${ddRows}</tbody></table>` : ''}`;
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
            <h2>Defensive Report: ${Charts._esc(team)}</h2>
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
    const title = `Defensive Report: ${Charts._esc(team)}`;
    const frontRows = d.fronts.map(f =>
      `<tr><td>${Charts._esc(f.name)}</td><td>${f.count}</td><td>${f.runs}/${f.passes}</td><td>${f.yards}</td><td>${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}</td><td>${f.count ? Math.round(f.successes / f.count * 100) : 0}%</td><td>${f.count ? Math.round(f.havoc / f.count * 100) : 0}%</td></tr>`
    ).join('');
    const covRows = d.coverages.map(c =>
      `<tr><td>${Charts._esc(c.name)}</td><td>${c.count}</td><td>${c.comps}</td><td>${c.incs}</td><td>${c.ints}</td><td>${c.sacks}</td><td>${c.yards}</td><td>${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}</td><td>${c.count ? Math.round(c.successes / c.count * 100) : 0}%</td></tr>`
    ).join('');
    const blitzRows = d.blitzes.map(b =>
      `<tr><td>${Charts._esc(b.name)}</td><td>${b.count}</td><td>${b.sacks}</td><td>${b.count ? Math.round(b.havoc / b.count * 100) : 0}%</td><td>${b.count ? (b.yards / b.count).toFixed(1) : '0.0'}</td><td>${b.count ? Math.round(b.successes / b.count * 100) : 0}%</td></tr>`
    ).join('');
    const body = `
<h1>${title}</h1><p class="sub">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
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
${blitzRows ? `<h3>Blitz Analysis</h3><table><thead><tr><th>Blitz</th><th>#</th><th>Sacks</th><th>Havoc%</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${blitzRows}</tbody></table>` : ''}`;
    this._openPrintWindow(title, body);
  }

  _exportStats(stats) {
    const title = this._gameTitle() || 'Game Stats';
    const r = stats.rushing, p = stats.passing, s = stats.scoring, t = stats.turnovers;
    const totalYards = r.yards + p.yards;
    const dn = stats.downs;
    const tend = stats.tendencies;

    // --- Game Plan (coaching insights) ---
    let gamePlanHtml = '';
    const tk = stats.takeaways;
    if (tk?.working?.length || tk?.fix?.length) {
      gamePlanHtml = '<div class="gp-print">';
      if (tk.working?.length)
        gamePlanHtml += `<div class="gp-print-col"><h4 class="gp-h good">What's Working</h4><ul>${tk.working.map(i => `<li>${i.text}</li>`).join('')}</ul></div>`;
      if (tk.fix?.length)
        gamePlanHtml += `<div class="gp-print-col"><h4 class="gp-h fix">Needs Work</h4><ul>${tk.fix.map(i => `<li>${i.text}</li>`).join('')}</ul></div>`;
      gamePlanHtml += '</div>';
    }

    let body = `
<h1>${title}</h1><p class="sub">Generated ${new Date().toLocaleString()} &middot; ${stats.totalPlays} plays</p>
${gamePlanHtml}
<h3>Team Summary</h3>
<div class="cards">
<div class="card"><div class="cv">${stats.totalPlays}</div><div class="cl">Total Plays</div></div>
<div class="card"><div class="cv">${totalYards}</div><div class="cl">Total Yards</div></div>
<div class="card"><div class="cv">${stats.totalPlays ? (totalYards / stats.totalPlays).toFixed(1) : '0.0'}</div><div class="cl">Yds/Play</div></div>
<div class="card"><div class="cv">${s.touchdowns}</div><div class="cl">Touchdowns</div></div>
<div class="card"><div class="cv">${t.total}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${Math.round(parseFloat(tend.runPct))}%/${Math.round(parseFloat(tend.passPct))}%</div><div class="cl">Run/Pass</div></div>
</div>
<div class="two-col">
<div><h3>Rushing</h3><table>
<tr><td>Attempts</td><td>${r.attempts}</td></tr><tr><td>Yards</td><td>${r.yards}</td></tr>
<tr><td>Average</td><td>${r.average}</td></tr><tr><td>Longest</td><td>${r.longest}</td></tr>
<tr><td>Touchdowns</td><td>${r.touchdowns}</td></tr><tr><td>First Downs</td><td>${r.firstDowns}</td></tr>
<tr><td>Fumbles</td><td>${r.fumbles}</td></tr></table></div>
<div><h3>Passing</h3><table>
<tr><td>Comp/Att</td><td>${p.completions}/${p.attempts}</td></tr><tr><td>Comp %</td><td>${p.completionPct}%</td></tr>
<tr><td>Yards</td><td>${p.yards}</td></tr><tr><td>YPA</td><td>${p.average}</td></tr>
<tr><td>Touchdowns</td><td>${p.touchdowns}</td></tr><tr><td>Interceptions</td><td>${p.interceptions}</td></tr>
<tr><td>Sacks / Yds</td><td>${p.sacks} / ${p.sackYards}</td></tr><tr><td>Longest</td><td>${p.longest}</td></tr>
<tr><td>First Downs</td><td>${p.firstDowns}</td></tr></table></div>
</div>
<h3>Down &amp; Distance</h3>
<div class="cards">
<div class="card"><div class="cv">${dn.totalFirstDowns}</div><div class="cl">First Downs</div></div>
<div class="card"><div class="cv">${dn.thirdDownConv}</div><div class="cl">3rd Down (${dn.thirdDownPct}%)</div></div>
<div class="card"><div class="cv">${dn.fourthDownConv}</div><div class="cl">4th Down (${dn.fourthDownPct}%)</div></div>
</div>`;

    // --- D&D buckets ---
    if (dn.ddBuckets?.length) {
      const dlabels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
      const bRows = dn.ddBuckets.map(b =>
        `<tr><td>${dlabels[b.down]} &amp; ${b.bucket}</td><td>${b.count}</td><td>${b.runPct}%R / ${b.passPct}%P</td><td>${b.avgYards}</td><td>${b.succPct}%</td><td>${b.convPct}%</td></tr>`
      ).join('');
      body += `<table><thead><tr><th>Situation</th><th>#</th><th>Run/Pass</th><th>Avg</th><th>Succ%</th><th>Conv%</th></tr></thead><tbody>${bRows}</tbody></table>`;
    }

    // --- Drives ---
    if (stats.drives?.total) {
      const dr = stats.drives;
      body += `<h3>Drives</h3><div class="cards">
<div class="card"><div class="cv">${dr.scoringDrives}/${dr.total}</div><div class="cl">Scoring</div></div>
<div class="card"><div class="cv">${dr.pointsPerDrive}</div><div class="cl">Pts/Drive</div></div>
<div class="card"><div class="cv">${dr.threeAndOuts}</div><div class="cl">3 &amp; Out</div></div>
<div class="card"><div class="cv">${dr.avgPlaysPerDrive}</div><div class="cl">Avg Plays</div></div>
<div class="card"><div class="cv">${dr.avgYardsPerDrive}</div><div class="cl">Avg Yards</div></div>
</div>`;
    }

    if (stats.defensive.hasData) {
      const d = stats.defensive;
      const frontRows = d.fronts.map(f =>
        `<tr><td>${Charts._esc(f.name)}</td><td>${f.count}</td><td>${f.yards}</td><td>${f.count ? (f.yards / f.count).toFixed(1) : '0.0'}</td><td>${f.count ? Math.round(f.successes / f.count * 100) : 0}%</td><td>${f.count ? Math.round(f.havoc / f.count * 100) : 0}%</td></tr>`
      ).join('');
      const covRows = d.coverages.map(c =>
        `<tr><td>${Charts._esc(c.name)}</td><td>${c.count}</td><td>${c.yards}</td><td>${c.count ? (c.yards / c.count).toFixed(1) : '0.0'}</td><td>${c.count ? Math.round(c.successes / c.count * 100) : 0}%</td></tr>`
      ).join('');
      body += `
<h3>Defensive Summary</h3>
<div class="cards">
<div class="card"><div class="cv">${d.havocRate}%</div><div class="cl">Havoc Rate</div></div>
<div class="card"><div class="cv">${d.sacks}</div><div class="cl">Sacks</div></div>
<div class="card"><div class="cv">${d.tfl}</div><div class="cl">TFL</div></div>
<div class="card"><div class="cv">${d.interceptions + d.fumbles}</div><div class="cl">Turnovers</div></div>
<div class="card"><div class="cv">${d.threeAndOuts}</div><div class="cl">3-and-Outs</div></div>
</div>
${frontRows ? `<table><thead><tr><th>Front</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th><th>Havoc%</th></tr></thead><tbody>${frontRows}</tbody></table>` : ''}
${covRows ? `<table><thead><tr><th>Coverage</th><th>#</th><th>Yds</th><th>Avg</th><th>Stop%</th></tr></thead><tbody>${covRows}</tbody></table>` : ''}`;
    }

    const ind = stats.individuals;
    if (ind.rushers.length) {
      body += '<h3>Individual Rushing</h3><table><thead><tr><th>Player</th><th>Att</th><th>Yds</th><th>Avg</th><th>TD</th></tr></thead><tbody>';
      ind.rushers.forEach(rv => { body += `<tr><td>${this._playerLabelHtml(rv.num)}</td><td>${rv.attempts}</td><td>${rv.yards}</td><td>${rv.attempts ? (rv.yards / rv.attempts).toFixed(1) : '0.0'}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.passers.length) {
      body += '<h3>Individual Passing</h3><table><thead><tr><th>Player</th><th>C/A</th><th>Yds</th><th>TD</th><th>INT</th></tr></thead><tbody>';
      ind.passers.forEach(pv => { body += `<tr><td>${this._playerLabelHtml(pv.num)}</td><td>${pv.completions}/${pv.attempts}</td><td>${pv.yards}</td><td>${pv.tds}</td><td>${pv.ints}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.receivers.length) {
      body += '<h3>Individual Receiving</h3><table><thead><tr><th>Player</th><th>Rec</th><th>Yds</th><th>TD</th></tr></thead><tbody>';
      ind.receivers.forEach(rv => { body += `<tr><td>${this._playerLabelHtml(rv.num)}</td><td>${rv.receptions}</td><td>${rv.yards}</td><td>${rv.tds}</td></tr>`; });
      body += '</tbody></table>';
    }
    if (ind.tacklers.length) {
      body += '<h3>Individual Tackles</h3><table><thead><tr><th>Player</th><th>Tkl</th><th>Solo</th><th>Ast</th><th>Sack</th><th>TFL</th><th>INT</th><th>FR</th></tr></thead><tbody>';
      ind.tacklers.forEach(tv => { body += `<tr><td>${this._playerLabelHtml(tv.num)}</td><td>${tv.tackles}</td><td>${tv.solo}</td><td>${tv.assists}</td><td>${tv.sacks}</td><td>${tv.tfl}</td><td>${tv.ints || 0}</td><td>${tv.fumblesRec || 0}</td></tr>`; });
      body += '</tbody></table>';
    }

    this._openPrintWindow(title, body);
  }

  // Pull the bundled Barlow Condensed @font-face (base64) out of the loaded
  // document so a standalone export/print window embeds the real display face
  // offline, instead of falling back to a system condensed font. Returns a
  // ready-to-inline <style> block (or '' if the font isn't present).
  _exportFontFace() {
    let css = '';
    try {
      for (const sheet of document.styleSheets) {
        let rules;
        try { rules = sheet.cssRules; } catch (e) { continue; }
        if (!rules) continue;
        for (const rule of rules) {
          if (rule.type === 5 && /Barlow Condensed/i.test(rule.cssText || '')) css += rule.cssText + '\n';
        }
      }
    } catch (e) {}
    return css ? `<style>${css}</style>` : '';
  }

  _openPrintWindow(title, bodyHtml, extraClass) {
    const w = window.open('', '_blank');
    if (!w) { alert('Pop-up blocked — allow pop-ups for this site to export PDF.'); return; }
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${Charts._esc(title)}</title>
${this._exportFontFace()}
<style>
:root{--ink:#0f172a;--muted:#64748b;--line:#e2e8f0;--surface:#f8fafc;--blue:#2563eb;--green:#16a34a;--red:#dc2626;--display:'Barlow Condensed','Arial Narrow',system-ui,sans-serif}
body{font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fff;color:var(--ink);max-width:960px;margin:24px auto;padding:0 24px}
h1{font-family:var(--display);border-bottom:3px solid var(--blue);padding-bottom:8px;color:var(--ink);font-size:30px;font-weight:700;letter-spacing:.01em;margin-bottom:2px}
h3{font-family:var(--display);color:var(--ink);border-bottom:1px solid var(--line);padding-bottom:5px;margin-top:26px;font-size:17px;font-weight:700;text-transform:uppercase;letter-spacing:.03em}
h4{font-family:var(--display);font-weight:700;text-transform:uppercase;letter-spacing:.03em;font-size:13px;color:var(--ink)}
.sub{color:var(--muted);font-size:12px}
table{width:100%;border-collapse:collapse;margin:8px 0}
th,td{padding:6px 10px;border-bottom:1px solid var(--line);text-align:left;font-size:12px}
td:first-child{color:var(--ink);font-weight:500}
th{font-family:var(--display);background:none;color:var(--muted);font-weight:700;font-size:11px;text-transform:uppercase;letter-spacing:.04em;border-bottom:2px solid var(--line)}tr:nth-child(even) td{background:var(--surface)}
.cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:10px;margin:12px 0}
.card{border:1px solid var(--line);padding:12px;border-radius:10px;text-align:center;background:var(--surface)}
.cv{font-family:var(--display);font-size:32px;font-weight:700;color:var(--ink);font-variant-numeric:tabular-nums;line-height:1}.cl{font-size:9px;text-transform:uppercase;color:var(--muted);margin-top:5px;letter-spacing:.06em;font-weight:700}
.two-col{display:grid;grid-template-columns:1fr 1fr;gap:20px}
.gp-print{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.gp-print-col ul{margin:6px 0 0;padding-left:20px;line-height:1.7;font-size:12px}.gp-print-col li{margin-bottom:4px}
.gp-h{font-family:var(--display);font-size:13px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;margin:0;padding-bottom:4px;border-bottom:2px solid}
.gp-h.good{color:var(--green);border-color:var(--green)}.gp-h.fix{color:var(--red);border-color:var(--red)}
.meter{height:18px;border-radius:9px;background:var(--line);overflow:hidden;margin:10px 0 4px}.meter>div{height:100%;border-radius:9px}
.mval{font-family:var(--display);font-size:34px;font-weight:700;font-variant-numeric:tabular-nums;line-height:1}.mlbl{color:var(--muted);font-size:13px;font-weight:600}
ul{line-height:1.7;font-size:13px}
/* Self-Scout print styles */
.print-hero{text-align:center;margin-bottom:8px}.print-hero h1{border:none;padding:0;margin:0 0 4px}
.print-summary{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0;padding:16px;border:1px solid var(--line);border-radius:10px;background:var(--surface)}
.print-card-label{font-size:10px;text-transform:uppercase;color:var(--muted);letter-spacing:.06em;font-weight:700;margin-bottom:6px}
.print-assessment{font-family:var(--display);font-size:18px;font-weight:700;margin:8px 0 4px;text-transform:uppercase;letter-spacing:.02em}
.print-recs{margin:12px 0}.print-rec{padding:8px 12px;margin:6px 0;border-left:3px solid var(--blue);background:var(--surface);font-size:12px;line-height:1.6}
.print-rec strong{color:var(--ink)}.ss-rec-label{font-weight:700;color:var(--ink)}.ss-rec-strength{color:var(--green)}
@media print{
  body{margin:0;padding:10px}
  h1{font-size:18px}h3{font-size:12px}
  .cards{grid-template-columns:repeat(auto-fill,minmax(100px,1fr));gap:6px}
  .card{padding:6px}.cv{font-size:16px}
  table{font-size:11px}th,td{padding:4px 6px}
  .no-print{display:none}
  .print-summary{border:1px solid #ccc}
}
</style></head><body${extraClass ? ` class="${extraClass}"` : ''}>
${bodyHtml}
<div class="no-print" style="text-align:center;margin:32px 0">
<p style="color:#999;font-size:12px">Use your browser's <b>Save as PDF</b> option in the print dialog, or press Ctrl/Cmd+P.</p>
</div>
</body></html>`);
    w.document.close();
    // Print once layout has settled (a fixed timeout fires early on slow
    // machines); the timeout stays as a fallback for browsers that don't
    // fire load on document.write content.
    let printed = false;
    const doPrint = () => { if (!printed) { printed = true; w.print(); } };
    w.addEventListener('load', () => requestAnimationFrame(doPrint));
    setTimeout(doPrint, 900);
  }
}
