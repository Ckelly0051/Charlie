import { h, render } from 'preact';
import { mountNativeReports } from './native-reports.jsx';
import { OverviewTab, OffenseTab, PlayersTab, DefenseTab, SpecialTeamsTab, SelfScoutTab, SeasonTab, MatchupTab, OpponentOverviewTab, OpponentOffenseTab, OpponentDefenseTab, OpponentSpecialTeamsTab, ReportPane } from './native-report-tabs.jsx';
import { Charts } from './charts.js';
import { buildDefenseHtmlReport, buildSelfScoutHtmlReport, buildSpecialTeamsHtmlReport, buildPlayerHtmlReport } from './html-report.js';

const REPORT_TABS = new Set(['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']);

/**
 * THE GAME SCORE IS AN OVERVIEW FACT (coach-approved global strip, 2026-09-22).
 * The linescore renders on Overview only, below the global strip; detail tabs
 * carry no score at the top. Its sources and arithmetic are unchanged.
 */
const SCOREBUG_TABS = new Set(['overview']);

/**
 * A game result needs BOTH official scores. `Number('')` and `Number(null)` are
 * 0, so a missing opponent score would otherwise read as a shutout Win. A score
 * counts only as a finite, non-negative number actually entered.
 */
function officialScore(value) {
  if (value == null || typeof value === 'boolean') return null;
  const raw = typeof value === 'string' ? value.trim() : value;
  if (raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) && n >= 0 ? n : null;
}
export function gameResult(scoreUs, scoreThem) {
  const us = officialScore(scoreUs), them = officialScore(scoreThem);
  if (us == null || them == null) return null;
  return us > them ? 'Win' : us < them ? 'Loss' : 'Tie';
}

/** Native Reports route controller. StatsEngine owns formulas; this class owns all live presentation. */
export class ReportsScreen {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.content = null;
    this.activeTab = 'overview';
    this._native = null;
    this._observer = null;
    this._mode = 'main';
    this.perspective = 'self';
    this._opponentData = null;
    // Every game/season scope control opens on Current game (coach decision,
    // 2026-09-22); Season is the full-season parent. A deliberate choice made
    // here survives ordinary re-renders because it is controller state.
    this.defenseScope = 'game';
    this.specialTeamsScope = 'game';
    this.playersScope = 'game';
    // Players' role section is controller state for the same reason its scope
    // is: a scope change re-renders the tab, and a selection held only in the
    // view is lost when that remount happens.
    this.playersSection = 'all';
    // Revision 2 controller state, for the same reason: an ordinary Reports
    // re-render remounts the tab, so a selection held in the component would be
    // discarded under the coach's hands.
    this.playersPlayer = null;
    this.playersSelectedGames = new Set();
    this.playersHiddenColumns = {};
    // The situational selection, so the export prints what is on screen.
    this.playersSituRole = '';
    this.playersSituDimension = '';
    // Self-Scout's active section is controller state for the same reason
    // Players' is: any ordinary Reports re-render unmounts and remounts the
    // tab, and a selection held only in the view is lost when that happens.
    this.selfScoutSection = 'summary';
    this.matchupOpponent = '';
    // Matchup's active direction is controller state for the same reason
    // `playersSection` and `selfScoutSection` are: changing the opponent
    // re-renders the tab, and a direction held only in the view would be
    // discarded and the board would snap back to Our Offense vs Their
    // Defense under the coach's hands.
    this.matchupTab = 'our-offense';
    // Offense's six zones and Defense's four sections are PAGES in the shared
    // secondary bar (coach-approved comp, 2026-09-23). The selected page is
    // controller state for the same reason every other report's section is: a
    // scope change or any ordinary re-render remounts the board.
    this.offenseSection = 'identity';
    this.defenseSection = 'performance';
  }

  /** The one secondary-bar host, directly under the global strip. A board with
   *  sections portals its SectionBar here; none, and the host stays empty. */
  sectionBarHost() {
    return this._mode === 'main' ? this.host?.querySelector('[data-reports-secbar]') || null : null;
  }

  mount(host) {
    if (!host || !this.app.stats) return false;
    this._unmountNative();
    this.host = host;
    this._native = mountNativeReports({ host, screen: this });
    this.content = this._native.content;
    if (!this.content) return false;
    this._observer = new MutationObserver(() => this._syncPresentation());
    this._observer.observe(this.content, { childList: true, subtree: false });
    this._syncHeader();
    return true;
  }

  restore() {
    this._observer?.disconnect();
    this._observer = null;
    // `this.content` is a second, independently-owned Preact root nested
    // inside the outer chrome tree (see _renderActiveTab). Unmounting the
    // outer tree below removes its DOM but does not know this inner root
    // exists; explicitly unmount it first so nothing here relies on a
    // component ever having cleanup effects to stay leak-free.
    if (this.content) { try { render(null, this.content); } catch {} }
    this._unmountNative();
    this.host = null;
    this.content = null;
  }

  _unmountNative() {
    this._native?.unmount?.();
    this._native = null;
  }

  show() {
    if (!this.host) return false;
    if (!this.content?.isConnected && !this.mount(this.host)) {
      this._renderFailure('Reports could not start. Return Home and try again.');
      return false;
    }
    try {
      this._mode = 'main';
      this.perspective = 'self';
      this._opponentData = null;
      this.activeTab = REPORT_TABS.has(this.app.stats._lastTab) ? this.app.stats._lastTab : this.activeTab;
      if (!REPORT_TABS.has(this.activeTab)) this.activeTab = 'overview';
      this._syncHeader();
      this._syncTabState();
      this._setChrome(true);
      this._renderActiveTab();
      this.host.scrollTop = 0;
      this.content.classList.remove('hidden');
      return true;
    } catch (error) {
      console.error('Reports failed to render', error);
      this._renderFailure('Reports could not be generated for this game. Your film and tags are safe.');
      return false;
    }
  }

  _renderFailure(message) {
    if (this.content) {
      const failure = h('div', { class: 'stats-section gi-reports-empty gi-reports-failure', role: 'alert' },
        h('h3', null, 'Reports unavailable'), h('p', null, String(message || '')));
      render(h(ReportPane, { tab: 'failure' }, failure), this.content);
      return;
    }
    const html = `<section class="gi-report-pane stats-section gi-reports-empty gi-reports-failure" role="alert"><h3>Reports unavailable</h3><p>${Charts._esc(message)}</p></section>`;
    // The one legitimate case for a raw write: `this.content` itself is
    // absent, so there is no Preact root left to render into and the outer
    // native chrome (host) is the only thing left to show anything at all.
    if (this.host) this.host.innerHTML = html;
  }

  selectTab(tab) {
    if (!REPORT_TABS.has(tab) || !this.content) return false;
    this.activeTab = tab;
    this.app.stats._lastTab = tab;
    this._mode = 'main';
    this._syncTabState();
    // Reports redesign (item A): the persistent KPI rail hides itself on the
    // Season tab (which carries its own equivalent header) — but only
    // _syncHeader() re-evaluated that, and selectTab() never called it, so
    // switching tabs left the game-scope rail showing on top of the Season
    // tab's own hero. Found by screenshot review, not by the harness: every
    // e2e assertion drives selectTab() once from a fresh route, which never
    // exercises a SECOND tab switch. A second, deeper cause: _setChrome()
    // used to force `hidden=false` on every `data-reports-main-chrome` node
    // unconditionally, which would have re-revealed the rail the instant it
    // (or the MutationObserver-driven _syncPresentation) ran again — the rail
    // markup no longer carries that attribute, so _syncKpiRail() is its only
    // owner.
    this._syncHeader();
    this._setChrome(true);
    this._renderActiveTab();
    this.host.scrollTop = 0;
    return true;
  }

  scoutOpponent(opponentName) {
    if (!this.content) return false;
    // F3: default to the active game's opponent, but any charted opponent can
    // be opened — a scout report exists for every team we have film on.
    const opponent = String(opponentName || '').trim()
      || this.app.stats._activeOpponent?.() || this.app.storage?.gameInfo?.opponent || 'Opponent';
    this._scoutable = this.app.stats.listScoutableOpponents?.() || [];
    this._opponentData = this.app.stats.generateOpponentScout(opponent);
    this.perspective = 'opponent';
    this.activeTab = 'overview';
    this._mode = 'main';
    this._syncHeader();
    this._syncTabState();
    this._setChrome(true);
    this._renderActiveTab();
    this.host.scrollTop = 0;
    return true;
  }

  export(kind) {
    const stats = this.app.stats;
    if (!stats) return false;
    /* WHEN A PLAYER IS OPEN, EXPORT IS THAT PLAYER. Printing the leaderboard
       while the screen says one player is selected would export something the
       coach is not looking at. */
    if (this.activeTab === 'players' && this.playersPlayer) return this.exportPlayer();
    if (kind === 'pdf') stats._exportStats(stats.compute());
    else if (kind === 'html') this.app.storage?.exportHtmlReport?.(stats);
    else if (kind === 'season-html') return this.app.season?.exportHtml?.() === true;
    else if (kind === 'csv') this.app.storage?.exportCsv?.();
    else if (kind === 'call-sheet') this.app.callSheet?.show?.();
    else return false;
    return true;
  }

  /** The export's own dashboard, built exactly as it was before Revision 2:
   *  the scoped cohort with game labels. The on-screen board names opponents
   *  instead, and must not change what the exported report prints. */
  _defenseExportDashboard() {
    const { scoped, labels } = this._defenseCohort();
    return this.app.stats.defenseDashboard(scoped, labels);
  }

  /** The player analysis currently on screen: identity, cohort, every populated
   *  role, the game split and the active situational breakdown, with the same
   *  composite references the board opens. */
  exportPlayer() {
    const num = this.playersPlayer;
    const { scoped } = this._playersCohort();
    const detail = this.app.stats.playerDetail(scoped, num, {
      roster: Object.fromEntries(this._playersRoster().map(item => [item.num, item.name])),
      labels: this._playersGameLabels(),
      gameOrder: this._playersGameOrder(),
    });
    if (!detail) return false;
    /* THE BREAKDOWN ON SCREEN, not a different one. The export used to pick the
       first permitted dimension of every role, so the printed report could not
       match the situational analysis the coach was looking at. Role and
       dimension are controller state for exactly this reason. */
    const dims = this.app.stats.constructor.PLAYER_DIMENSIONS;
    const roleKeys = detail.roles.map(role => role.key);
    const activeRole = roleKeys.includes(this.playersSituRole) ? this.playersSituRole : roleKeys[0];
    const permitted = dims.filter(item => item.roles.includes(activeRole));
    const activeDim = permitted.some(item => item.key === this.playersSituDimension)
      ? this.playersSituDimension : (permitted[0]?.key || '');
    const activeLabel = permitted.find(item => item.key === activeDim)?.label || activeDim;
    const schema = this.app.stats.constructor.PLAYER_ROLES.find(item => item.key === activeRole);
    const situational = activeDim ? [{
      role: detail.roles.find(role => role.key === activeRole)?.label || activeRole,
      dimension: activeLabel,
      measures: schema?.measures || [],
      rows: this.app.stats.playerSituational(scoped, num, activeRole, activeDim),
    }] : [];
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Team';
    const html = buildPlayerHtmlReport({
      title: `Player Report: ${detail.label}`, team, detail, situational,
      scopeLabel: this._playersScopeLabel(),
    });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }),
      `player_${num}_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

  exportDefense(dashboard, scoped) {
    if (!dashboard?.total) return false;
    const scopeLabel = this.defenseScope === 'season' ? 'Full season' : 'Current game';
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Defense';
    const html = buildDefenseHtmlReport({ title: `Defensive Report: ${team}`, dashboard, scopeLabel });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }), `defensive_report_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

  /**
   * Special Teams export. Coach decision, 2026-09-04: reuse the existing
   * Reports export mechanism, do NOT build a Special-Teams-only exporter. So
   * this is the same shape `exportDefense`/`exportSelfScout` already use --
   * compose the report's own model, render it through the shared HTML report
   * builder, and save through the one `window.ffaSaveBlob` seam. No new save
   * path, no second export subsystem.
   */
  exportSpecialTeams(stats, summary) {
    if (!stats) return false;
    const scopeLabel = this.specialTeamsScope === 'season' ? 'Full season' : 'Current game';
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Special Teams';
    const html = buildSpecialTeamsHtmlReport({ title: `Special Teams Report: ${team}`, stats, summary, scopeLabel });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }), `special_teams_report_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

  exportSelfScout(report, defScout, performance, callRows) {
    const summary = report ? this.app.stats.selfScoutSummary(performance, callRows) : null;
    const defSummary = this.app.stats.selfScoutDefenseSummary(performance);
    if (!report && !defSummary.totalPlays) return false;
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Offense';
    const html = buildSelfScoutHtmlReport({ title: `Self-Scout Report: ${team}`, report,
      defScout, performance, callRows, summary, defSummary });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }), `self_scout_report_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

  /** The Reports empty states' primary command. Uses the app's own route
   *  navigation — Reports never gets a second route mechanism of its own. */
  openBreakDown() {
    return this.app.workspaceShell?.show?.('breakdown');
  }

  /** The Overview score is the only game-summary chrome left. The generic game
   *  KPI rail that repeated on every detail tab is DELETED (coach-approved comp,
   *  2026-09-23): each detail report opens on its own content, and the rail's
   *  non-score facts - plays charted and turnover margin - live in the compact
   *  Overview score. The name is kept because every presentation sync calls it. */
  _syncKpiRail() {
    const stats = this.app.stats;
    this._syncScorebug(stats?._kpiRailData?.(stats.compute()));
  }

  _syncScorebug(data) {
    const bug = this.host?.querySelector('[data-reports-scorebug]');
    if (!bug) return;
    // Self perspective only: an opponent scout has no "our score", and the
    // Season tab is season-scope. Empty data leaves the container hidden rather
    // than rendering a blank scorebug shell.
    const visible = this._mode === 'main' && this.perspective === 'self'
      && SCOREBUG_TABS.has(this.activeTab) && this._usesCurrentGameContext() && data?.totalPlays;
    // The linescore class is cleared here as well as on the pair path: hiding
    // the bug returns before the pair branch, so leaving Defense for a
    // rail-bearing tab would otherwise leave `is-linescore` set on a hidden
    // node, and the next tab to reveal it would flash the wrong treatment.
    if (!visible) { bug.hidden = true; bug.innerHTML = ''; bug.classList.remove('is-linescore'); return; }
    const esc = Charts._esc;
    const game = this.app.storage?.gameInfo || {};
    const context = this.app.workspace?.snapshot?.() || {};
    const computed = this.app.stats.compute();
    const tagged = computed.scoreboard || {};
    const scoreUs = game.scoreUs !== '' && game.scoreUs != null ? game.scoreUs : (tagged.us || 0);
    const scoreThem = game.scoreThem !== '' && game.scoreThem != null ? game.scoreThem : (tagged.them || 0);
    const team = context.team?.name || game.teamName || 'Our Team';
    const opponent = game.opponent || 'Opponent';

    /* THE COMPACT SCORE (coach-approved comp, 2026-09-23): the linescore beside
       three facts no Overview tile states. The Yards-per-play story is gone
       (the Overview KPI band owns Yards / play), and so is the right-side game
       name, which repeated the opponent the linescore already names. Result
       uses the OFFICIAL scores only; the linescore's charted fallback is not a
       settled result. Turnover margin is the rail's own figure. */
    const result = gameResult(game.scoreUs, game.scoreThem);
    const when = [game.week ? `Week ${game.week}` : '',
      game.date ? new Date(`${game.date}T12:00:00`).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) : '']
      .filter(Boolean).join(' · ');
    const turnovers = data.turnovers || {};
    const margin = turnovers.giveaways != null && turnovers.takeaways != null ? turnovers.takeaways - turnovers.giveaways : null;
    const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;
    /* A side nobody charted is never a zero: a defense-only game states its
       takeaways and says turnovers were not charted, and has no margin. */
    const marginSub = margin != null ? `${plural(turnovers.takeaways, 'takeaway')}, ${plural(turnovers.giveaways, 'turnover')}`
      : turnovers.takeaways != null ? `${plural(turnovers.takeaways, 'takeaway')}, turnovers not charted`
        : turnovers.giveaways != null ? `${plural(turnovers.giveaways, 'turnover')}, takeaways not charted` : '';
    const fact = (label, value, sub, key) => `<div class="gi-scorebug-fact" data-scorebug-fact="${key}"><span>${esc(label)}</span><strong>${esc(String(value))}</strong><small>${esc(sub || '')}</small></div>`;

    bug.classList.add('is-linescore');
    bug.innerHTML = `${this._scorebugTable({ esc, team, opponent, scoreUs, scoreThem, tagged })}
      <div class="gi-scorebug-facts">
        ${fact('Result', result || 'No data', when, 'result')}
        ${fact('Charted', `${data.playsCharted} of ${data.totalPlays}`, 'plays', 'charted')}
        ${fact('Turnover margin', margin == null ? 'No data' : (margin > 0 ? `+${margin}` : String(margin)), marginSub, 'margin')}
      </div>`;
    bug.hidden = false;
  }

  /** Shared scoreboard: one complete team per row, aligned through one grid.
   * Full names may wrap; they are never shortened or ellipsized. */
  _scorebugTable({ esc, team, opponent, scoreUs, scoreThem, tagged }) {
    const q = (side, key) => tagged.byQuarter?.[key]?.[side] || 0;
    const row = (name, side, total) => `<div class="gi-scorebug-row">
        <div class="gi-scorebug-name">${esc(name)}</div>
        ${['Q1', 'Q2', 'Q3', 'Q4'].map(k => `<div class="gi-scorebug-q">${q(side, k)}</div>`).join('')}
        <div class="gi-scorebug-total">${esc(String(total))}</div>
      </div>`;
    return `<div class="gi-scorebug-score">
        <div class="gi-scorebug-row is-head">
          <div class="gi-scorebug-name"></div>
          ${['Q1', 'Q2', 'Q3', 'Q4'].map(k => `<div class="gi-scorebug-q is-head">${k}</div>`).join('')}
          <div class="gi-scorebug-total is-head">T</div>
        </div>
        ${row(team, 'us', scoreUs)}
        ${row(opponent, 'them', scoreThem)}
      </div>`;
  }


  _syncHeader() {
    if (!this.host) return;
    this._syncKpiRail();
    const context = this.app.workspace?.snapshot?.();
    const title = this.host.querySelector('[data-reports-title]');
    const sub = this.host.querySelector('[data-reports-context]');
    // F5: the eyebrow said "Self scout" on every screen, including the opponent
    // scout. It states the perspective actually being shown.
    const eyebrow = this.host.querySelector('[data-reports-eyebrow]');
    if (eyebrow) eyebrow.textContent = this.perspective === 'opponent' ? 'Reports / Opponent scout' : 'Reports / Our game';
    // F3: the opponent picker lists every team we have charted film on.
    const picker = this.host.querySelector('[data-reports-opponent]');
    const select = this.host.querySelector('[data-reports-opponent-select]');
    if (picker && select) {
      const list = this.perspective === 'opponent' ? (this._scoutable || []) : [];
      picker.hidden = list.length < 2;
      if (list.length >= 2) {
        const current = this._opponentData?.opponent || '';
        select.innerHTML = list.map(item =>
          `<option value="${Charts._esc(item.name)}"${item.name === current ? ' selected' : ''}>${Charts._esc(item.name)}, ${item.games} game${item.games === 1 ? '' : 's'}</option>`).join('');
      }
    }
    if (this.perspective === 'opponent') {
      const name = this._opponentData?.opponent || this.app.stats._activeOpponent?.() || 'Opponent';
      if (title) {
        title.textContent = `${name} scout`;
        title.title = title.textContent;
      }
      if (sub) {
        const games = this._opponentData?.games || 0;
        sub.textContent = `${games} tagged game${games === 1 ? '' : 's'}, opponent offense, defense, and scout-film Special Teams`;
      }
      return;
    }
    const seasonName = context?.season?.name || 'Season';
    const seasonScope = this.activeTab === 'season'
      || (this.activeTab === 'defense' && this.defenseScope === 'season')
      || (this.activeTab === 'special' && this.specialTeamsScope === 'season')
      || (this.activeTab === 'players' && this.playersScope === 'season');
    const matchupScope = this.activeTab === 'matchup';
    if (title) {
      if (matchupScope) title.textContent = `Matchup: ${this.matchupOpponent || 'Opponent'}`;
      else if (seasonScope) title.textContent = `${seasonName} ${this.activeTab === 'special' ? 'Special Teams' : this.activeTab === 'players' ? 'Players' : this.activeTab === 'defense' ? 'Defense' : 'Report'}`;
      else title.textContent = context?.game?.name || seasonName || 'Reports';
      /* The title yields the header row to the section navigation and truncates
         when a long game name would otherwise push a tab off the end, so the
         full value has to survive somewhere. Set on the same write as the text
         — a tooltip that is only promised by a stylesheet comment is not a
         tooltip, which is exactly what this was. */
      title.title = title.textContent;
    }
    if (sub) {
      if (matchupScope) { sub.textContent = 'Season film and opponent film'; return; }
      if (seasonScope) { sub.textContent = 'Full season'; return; }
      const plays = this.app.tagger?.plays?.length || 0;
      const season = context?.season?.name ? `${context.season.name}, ` : '';
      const filtered = this.app.filter?.active ? ', filtered view' : '';
      sub.textContent = `${season}${plays} play${plays === 1 ? '' : 's'}${filtered}`;
    }
  }

  /** Whether the active self-report is actually scoped to the current game.
   * Shared game score/KPI chrome may render only when this is true. */
  _usesCurrentGameContext() {
    if (this.activeTab === 'season' || this.activeTab === 'matchup') return false;
    if (this.activeTab === 'defense') return this.defenseScope === 'game';
    if (this.activeTab === 'special') return this.specialTeamsScope === 'game';
    if (this.activeTab === 'players') return this.playersScope === 'game';
    return true;
  }

  _syncTabState() {
    const opponentTabs = new Set(['overview', 'offense', 'defense', 'special']);
    this.host?.querySelectorAll('[data-report-tab]').forEach(button => {
      const available = this.perspective === 'self' || opponentTabs.has(button.dataset.reportTab);
      const active = available && button.dataset.reportTab === this.activeTab;
      // Disabled, never hidden: removing a tab would move every tab after it,
      // and the global strip's tab positions are fixed in both perspectives.
      button.hidden = false;
      button.disabled = !available;
      button.classList.toggle('active', active);
      if (active) button.setAttribute('aria-current', 'page');
      else button.removeAttribute('aria-current');
    });
    this.host?.querySelectorAll('[data-report-perspective]').forEach(button => {
      const active = button.dataset.reportPerspective === this.perspective;
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
  }

  _setChrome(main) {
    this.host?.querySelectorAll('[data-reports-main-chrome]').forEach(node => { node.hidden = !main; });
    const special = this.host?.querySelector('[data-reports-special-chrome]');
    if (special) special.hidden = main;
  }

  _syncPresentation() {
    if (!this.content) return;
    if (this.content.querySelector('[data-native-main-report]')) {
      this._mode = 'main';
      this._setChrome(true);
      this._syncKpiRail();
      return;
    }
    if (this.content.querySelector('.stats-overlay, .stats-header')) {
      this._mode = 'specialized';
      this._setChrome(false);
      this._syncKpiRail();
    }
  }

  _renderActiveTab() {
    if (this.perspective === 'opponent') {
      this._renderOpponentTab();
      return;
    }
    const statsEngine = this.app.stats;
    const tab = this.activeTab;
    // compute() is a full unscoped multi-pass season/game analysis (rushing/
    // passing/scoring/downs/turnovers/tendencies/bigPlays/individuals/drives/
    // situational/efficiency/personnel/EPA/defensive). Only the four tabs
    // below actually read its result -- season/matchup build their own
    // content with no args, and defense/selfscout build their own scoped
    // computations. `_bindContent(root)` takes one parameter (confirmed by
    // reading it: it locally shadows `stats` with `this.app.stats`), so the
    // second argument passed to it everywhere was always inert. Skipping the
    // compute() call for the tabs that don't need it avoids paying for the
    // whole engine on every Defense/Self-Scout/Season/Matchup render.
    const stats = ['overview', 'offense'].includes(tab) ? statsEngine.compute() : null;

    render(null, this.content);
    if (tab === 'overview') {
      render(h(ReportPane, { tab: 'overview' }, h(OverviewTab, { stats, screen: this })), this.content);
      return;
    }
    if (tab === 'offense') {
      render(h(ReportPane, { tab: 'offense' }, h(OffenseTab, { stats, screen: this })), this.content);
      return;
    }
    if (tab === 'players') {
      const { scoped } = this._playersCohort();
      this._playersScopedPlays = scoped;
      const playerStats = statsEngine.compute(scoped);
      render(h(ReportPane, { tab: 'players' }, h(PlayersTab, { stats: playerStats, scoped, screen: this })), this.content);
      return;
    }
    if (tab === 'defense') {
      const { scoped } = this._defenseCohort();
      this._defenseScopedPlays = scoped;
      // Revision 2: the Current game scope compares against the full season,
      // so the season cohort is always passed; rows name the opponent.
      const { scoped: seasonPlays } = this._selfPerspectiveCohort('season');
      const games = this.app.storage?.seasonStore?.data?.games || [];
      const opponents = Object.fromEntries(games.map(game =>
        [String(game.id), String(game.gameInfo?.opponent || '').trim() || game.name || `Game ${game.id}`]));
      const board = statsEngine.defenseBoard(scoped, { scope: this.defenseScope, seasonPlays,
        labels: opponents, roster: this.app.season?._mergeRoster?.() || {} });
      render(h(ReportPane, { tab: 'defense' }, h(DefenseTab, { board, scoped, screen: this })), this.content);
      return;
    }
    if (tab === 'special') {
      const { scoped, labels } = this._specialTeamsCohort();
      this._specialTeamsScopedPlays = scoped;
      const stStats = statsEngine.compute(scoped);
      const summary = statsEngine._specialTeamsSummary(scoped, stStats);
      render(h(ReportPane, { tab: 'special' }, h(SpecialTeamsTab, { stats: stStats, summary, scoped, labels, screen: this })), this.content);
      return;
    }

    if (tab === 'season') {
      const model = this.app.season?.reportModel?.();
      render(h(ReportPane, { tab: 'season' }, h(SeasonTab, { model, screen: this })), this.content);
      return;
    }
    else if (tab === 'matchup') {
      const model = statsEngine.matchupReport(this.matchupOpponent);
      if (model.opponent) this.matchupOpponent = model.opponent.name;
      this._syncHeader();
      render(h(ReportPane, { tab: 'matchup' }, h(MatchupTab, { model, screen: this })), this.content);
      return;
    }
    else if (tab === 'selfscout') {
      // The same self-perspective, composite-ref-safe cohort Defense, Special
      // Teams and Players already use, at the current game -- which is the
      // scope this report has always had. The cohort is what stamps `__gid`,
      // so every Self-Scout row can carry real `gameId::playId` refs; sourced
      // straight from the live tagger they had none at all.
      const { scoped } = this._selfScoutCohort();
      this._selfScoutScopedPlays = scoped;
      const report = statsEngine.generateSelfScout(scoped);
      const defScout = report?.defScout || statsEngine.generateDefensiveSelfScout(scoped);
      const performance = statsEngine.compute(scoped);
      const callRows = statsEngine._selfScoutRows(statsEngine._selfScoutGroup(
        performance.offPlays, play => play.tags.playCall || play.tags.playConcept || null
      ));
      render(h(ReportPane, { tab: 'selfscout' },
        h(SelfScoutTab, { report, defScout, performance, callRows, screen: this })), this.content);
      return;
    }
  }

  /** Direct film activations for a fully-migrated tab component — the exact
   *  same underlying mechanisms `_bindContent`'s selector-rebind pass used
   *  to invoke, just called straight from a real onClick instead of a
   *  post-render DOM query. */
  watchCut(cutType, cutVal, label) {
    const stats = this.app.stats;
    stats._watchPlays(stats._buildCutFilter(cutType, cutVal), label || '');
  }
  watchPredicate(predicate, label) {
    this.app.stats._watchPlays(predicate, label || '');
  }
  watchRefs(refs, label) {
    this.app.filmNavigation?.watch?.(refs, { label });
  }

  _renderOpponentTab() {
    const data = this._opponentData;
    const tab = this.activeTab;
    render(null, this.content);
    this.content.replaceChildren();
    let child;
    if (tab === 'overview') child = h(OpponentOverviewTab, { data, screen: this });
    else if (tab === 'offense') child = h(OpponentOffenseTab, { data, screen: this });
    else if (tab === 'defense') child = h(OpponentDefenseTab, { data, screen: this });
    else if (tab === 'special') child = h(OpponentSpecialTeamsTab, { data, screen: this });
    render(h(ReportPane, { tab, opponent: true }, child), this.content);
  }

  _opponentRefs(kind) {
    const data = this._opponentData;
    if (!data) return [];
    let plays = [];
    if (kind === 'offense') plays = data.offPlays || [];
    else if (kind === 'defense') plays = data.defPlays || [];
    else if (kind === 'special') plays = data.stPlays || [];
    else plays = [...(data.offPlays || []), ...(data.defPlays || []), ...(data.stPlays || [])];
    return [...new Set(plays.filter(play => play?.__gid != null && play?.id != null).map(play => `${play.__gid}::${play.id}`))];
  }
  _selfPerspectiveCohort(scope) {
    const store = this.app.storage?.seasonStore;
    const games = store?.gamesChrono?.() || store?.data?.games || [];
    const selfGames = games.filter(game => game?.gameInfo?.perspective !== 'scout');
    const allowed = new Set(selfGames.map(game => String(game.id)));
    const labels = Object.fromEntries(selfGames.map(game => [String(game.id), game.name || `Game ${game.id}`]));
    let plays = (this.app.season?._allPlays?.() || []).filter(play => allowed.has(String(play.__gid)));
    if (!plays.length) {
      // Only fall back to the live tagger when the ACTIVE game is itself
      // self-perspective. Without this check, a coach whose only charted
      // film so far is an opponent-scout game would see that opponent's
      // defensive tags rendered under "Current game" as if it were their
      // own defense -- the exact silent perspective flip this report
      // otherwise guards against via `selfGames`/`allowed` above.
      const gid = String(store?.data?.activeGameId || 'current');
      const activeGame = games.find(game => String(game.id) === gid);
      if (activeGame && activeGame.gameInfo?.perspective !== 'scout') {
        plays = (this.app.tagger?.plays || []).map(play => {
          const copy = { ...play, tags: play.tags };
          Object.defineProperty(copy, '__gid', { value: gid, enumerable: false });
          return copy;
        });
        labels[gid] = this.app.workspace?.snapshot?.()?.game?.name || 'Current game';
      }
    }
    const activeId = String(store?.data?.activeGameId || 'current');
    const scoped = scope === 'game'
      ? plays.filter(play => String(play.__gid) === activeId) : plays;
    return { scoped, labels };
  }

  /** Delegates to `_selfPerspectiveCohort` with Defense's own scope. Consumed
   *  by the native DefenseTab and opponent-report components
   *  (kept only as the parity harness's comparison input) so the two can
   *  never scope differently. */
  _defenseCohort() {
    return this._selfPerspectiveCohort(this.defenseScope);
  }

  /** Same cohort machinery as Defense (it is unit-agnostic -- every
   *  self-perspective play, filtered later by whatever StatsEngine.compute()
   *  needs), scoped by Special Teams' own independent Full-season/Current-
   *  game toggle so switching one tab's scope never moves the other's. */
  _specialTeamsCohort() {
    return this._selfPerspectiveCohort(this.specialTeamsScope);
  }

  /** Players uses the same self-perspective, composite-ref-safe cohort as
   * Defense and Special Teams, with its own independent scope control. */
  _playersCohort() {
    /* SELECTED GAMES is the season cohort narrowed by game id — the same
       assembly, the same composite refs, the same opponent-scout exclusion.
       An empty selection is not an empty board: it keeps the full season, so
       opening the control can never blank the report. Nothing is written. */
    if (this.playersScope === 'selected') {
      const season = this._selfPerspectiveCohort('season');
      const picked = this.playersSelectedGames;
      if (!picked || !picked.size) return season;
      return { ...season, scoped: season.scoped.filter(play => picked.has(String(play.__gid))) };
    }
    return this._selfPerspectiveCohort(this.playersScope);
  }

  /** The program season's own games, in the store's chronological order. An
   *  opponent-scout game is never offered: those are not our players. */
  _playersSelectableGames() {
    const store = this.app.storage?.seasonStore;
    const games = store?.gamesChrono ? store.gamesChrono() : (store?.data?.games || []);
    return games.filter(game => (game.gameInfo?.perspective || 'self') !== 'scout').map(game => {
      const opponent = String(game.gameInfo?.opponent || '').trim();
      const date = String(game.gameInfo?.date || '').trim();
      return { id: String(game.id), label: [opponent || game.name || game.id, date].filter(Boolean).join(' · ') };
    });
  }

  _playersGameLabels() {
    return Object.fromEntries(this._playersSelectableGames()
      .map(game => [game.id, game.label.split(' · ')[0]]));
  }

  _playersGameOrder() { return this._playersSelectableGames().map(game => game.id); }

  /** Names come from `StatsEngine._playerLabel`, the one owner the leaderboard
   *  already prints — the fixed overlay, then the season map, then the live
   *  roster service. Reading `season.roster` directly gave the detail view a
   *  different answer from the row the coach clicked. */
  _playersRoster() {
    const engine = this.app.stats;
    const numbers = new Set();
    const collect = rows => (rows || []).forEach(row => numbers.add(String(row.num)));
    const individuals = engine.compute(this._playersCohort().scoped).individuals || {};
    Object.values(individuals).forEach(collect);
    return [...numbers].map(num => ({
      num,
      name: String(engine._playerLabel(num) || '').replace(/^#\S+\s*/, ''),
    }));
  }

  _playersScopeLabel() {
    if (this.playersScope === 'game') return 'Current game';
    if (this.playersScope === 'season') return 'Full season';
    return this._playersSelectedLabel();
  }

  /** States the cohort literally, never a bare count. */
  _playersSelectedLabel() {
    const picked = this.playersSelectedGames;
    const all = this._playersSelectableGames();
    if (!picked || !picked.size) return `All ${all.length} games`;
    if (picked.size === 1) {
      const game = all.find(item => picked.has(item.id));
      return game ? game.label.split(' · ')[0] : '1 game';
    }
    return `${picked.size} of ${all.length} games`;
  }

  setPlayersScope(scope) {
    this.playersScope = scope;
    this.playersPlayer = null;
    this._syncHeader();
    this._renderActiveTab();
  }

  togglePlayersGame(id) {
    const picked = this.playersSelectedGames || (this.playersSelectedGames = new Set());
    const key = String(id);
    if (picked.has(key)) picked.delete(key); else picked.add(key);
    this._renderActiveTab();
  }

  /** Player detail opens IN the tab: Reports never navigates away from itself.
   *  It is controller state for the same reason the scope and section are —
   *  an ordinary re-render remounts the component. */
  openPlayerDetail(num) {
    this.playersPlayer = String(num);
    this._renderActiveTab();
  }

  closePlayerDetail() {
    this.playersPlayer = null;
    this._renderActiveTab();
  }

  /** Self-Scout has no scope control of its own -- it reports the current
   *  game, the scope it has always had -- but it takes that cohort through
   *  the shared self-perspective assembly so its rows carry composite refs. */
  _selfScoutCohort() {
    return this._selfPerspectiveCohort('game');
  }

}
