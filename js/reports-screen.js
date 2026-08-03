import { mountNativeReports } from './native-reports.jsx';
import { Visualizations } from './visualizations.js';
import { Charts } from './charts.js';

const REPORT_TABS = new Set(['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']);

/**
 * Native Reports route controller.
 *
 * StatsEngine remains the only formula owner. This controller owns route markup,
 * report composition, actions, tabs, accessibility, and film bindings. It never
 * moves #statsDashboard out of the legacy tree; the engine renders into an
 * explicitly injected native content target while the shell is mounted.
 */
export class ReportsScreen {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.content = null;
    this.activeTab = 'overview';
    this._native = null;
    this._observer = null;
    this._legacyTarget = app.stats?.dashboardEl || document.getElementById('statsDashboard');
    this._mode = 'main';
    this.perspective = 'self';
    this._opponentData = null;
  }

  mount(host) {
    if (!host || !this.app.stats) return false;
    this._unmountNative();
    // Preserve the public dashboard id for integrations while ensuring there is
    // exactly one owner: the hidden legacy node relinquishes it before Preact
    // creates the native content host.
    if (this._legacyTarget?.id === 'statsDashboard') this._legacyTarget.id = 'legacyStatsDashboard';
    this.host = host;
    this._native = mountNativeReports({ host, screen: this });
    this.content = this._native.content;
    if (!this.content) return false;
    this.app.stats.setDashboardTarget?.(this.content);
    if (this.app.stats.dashboardEl !== this.content) this.app.stats.dashboardEl = this.content;
    this._observer = new MutationObserver(() => this._syncPresentation());
    this._observer.observe(this.content, { childList: true, subtree: false });
    this._syncHeader();
    return true;
  }

  restore() {
    this._observer?.disconnect();
    this._observer = null;
    this._unmountNative();
    if (this._legacyTarget) {
      this._legacyTarget.id = 'statsDashboard';
      this.app.stats.setDashboardTarget?.(this._legacyTarget);
      if (this.app.stats.dashboardEl !== this._legacyTarget) this.app.stats.dashboardEl = this._legacyTarget;
    }
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
      this.content.classList.remove('hidden');
      return true;
    } catch (error) {
      console.error('Reports failed to render', error);
      this._renderFailure('Reports could not be generated for this game. Your film and tags are safe.');
      return false;
    }
  }

  _renderFailure(message) {
    const target = this.content || this.host;
    if (!target) return;
    target.innerHTML = `<section class="gi-report-pane stats-section gi-reports-empty gi-reports-failure" role="alert"><h3>Reports unavailable</h3><p>${Charts._esc(message)}</p></section>`;
  }

  selectTab(tab) {
    if (!REPORT_TABS.has(tab) || !this.content) return false;
    this.activeTab = tab;
    this.app.stats._lastTab = tab;
    this._mode = 'main';
    this._syncTabState();
    this._setChrome(true);
    this._renderActiveTab();
    return true;
  }

  scoutOpponent() {
    if (!this.content) return false;
    const opponent = this.app.stats._activeOpponent?.() || this.app.storage?.gameInfo?.opponent || 'Opponent';
    this._opponentData = this.app.stats.generateOpponentScout(opponent);
    this.perspective = 'opponent';
    this.activeTab = 'overview';
    this._mode = 'main';
    this._syncHeader();
    this._syncTabState();
    this._setChrome(true);
    this._renderActiveTab();
    return true;
  }

  export(kind) {
    const stats = this.app.stats;
    if (!stats) return false;
    if (kind === 'pdf') stats._exportStats(stats.compute());
    else if (kind === 'html') this.app.storage?.exportHtmlReport?.(stats);
    else if (kind === 'season-html') return this.app.season?.exportHtml?.() === true;
    else if (kind === 'csv') this.app.storage?.exportCsv?.();
    else if (kind === 'call-sheet') this.app.callSheet?.show?.();
    else return false;
    return true;
  }

  _syncHeader() {
    if (!this.host) return;
    const context = this.app.workspace?.snapshot?.();
    const title = this.host.querySelector('[data-reports-title]');
    const sub = this.host.querySelector('[data-reports-context]');
    if (this.perspective === 'opponent') {
      const name = this._opponentData?.opponent || this.app.stats._activeOpponent?.() || 'Opponent';
      if (title) title.textContent = `${name} scout`;
      if (sub) {
        const games = this._opponentData?.games || 0;
        sub.textContent = `${games} tagged game${games === 1 ? '' : 's'} · opponent offense, defense, and scout-film Special Teams`;
      }
      return;
    }
    if (title) title.textContent = context?.game?.name || context?.season?.name || 'Reports';
    if (sub) {
      const plays = this.app.tagger?.plays?.length || 0;
      const season = context?.season?.name ? `${context.season.name} · ` : '';
      const filtered = this.app.filter?.active ? ' · filtered view' : '';
      sub.textContent = `${season}${plays} play${plays === 1 ? '' : 's'}${filtered} · every highlighted row links to film`;
    }
  }

  _syncTabState() {
    const opponentTabs = new Set(['overview', 'offense', 'defense', 'special']);
    this.host?.querySelectorAll('[data-report-tab]').forEach(button => {
      const available = this.perspective === 'self' || opponentTabs.has(button.dataset.reportTab);
      const active = available && button.dataset.reportTab === this.activeTab;
      button.hidden = !available;
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
      return;
    }
    if (this.content.querySelector('.stats-overlay, .stats-header')) {
      this._mode = 'specialized';
      this._setChrome(false);
    }
  }

  _renderActiveTab() {
    if (this.perspective === 'opponent') {
      this._renderOpponentTab();
      return;
    }
    const statsEngine = this.app.stats;
    const stats = statsEngine.compute();
    const tab = this.activeTab;
    if (tab === 'season') {
      this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="season">${this.app.season?.statsHtml?.() || '<div class="stats-section"><p>Season stats unavailable — open a season first.</p></div>'}</section>`;
      this._bindContent(this.content, stats);
      return;
    }
    if (tab === 'matchup') {
      this.content.innerHTML = '<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="matchup"></section>';
      const pane = this.content.querySelector('[data-pane="matchup"]');
      try { statsEngine._renderMatchupInto(pane); }
      catch { pane.innerHTML = '<div class="stats-section"><p>Matchup unavailable for this game.</p></div>'; }
      this._bindContent(this.content, stats);
      return;
    }

    let html = '';
    if (tab === 'overview') html = this._overviewHtml(stats);
    else if (tab === 'offense') html = this._offenseHtml(stats);
    else if (tab === 'defense') {
      const defScout = statsEngine.generateDefensiveSelfScout();
      html = statsEngine._renderDefenseTabBody(stats, defScout);
    } else if (tab === 'special') html = this._specialTeamsHtml(stats);
    else if (tab === 'players') html = this._playersHtml(stats);
    else if (tab === 'selfscout') {
      const report = statsEngine.generateSelfScout();
      const defScout = report?.defScout || statsEngine.generateDefensiveSelfScout();
      html = statsEngine._renderSelfScoutBody(report, defScout);
    }
    this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="${tab}">${html}</section>`;
    this._bindContent(this.content, stats);
  }

  _renderOpponentTab() {
    const data = this._opponentData;
    const tab = this.activeTab;
    const opponentName = data?.opponent || 'Opponent';
    const name = Charts._esc(opponentName);
    let html = '';
    if (!data || !data.games) {
      html = `<div class="stats-section"><h3>No opponent sample yet</h3><p>Tag a game against ${name}, or chart opponent film with Opponent scout selected. Reports will separate their offense, defense, and Special Teams without re-tagging.</p></div>`;
    } else if (tab === 'overview') {
      const runPct = data.offReport?.stats?.tendencies?.runPct ?? '—';
      html = `
        <div class="stats-cut-hint">Opponent views preserve game identity. Watch actions queue only the exact tagged snaps in this cohort.</div>
        <div class="stats-section"><h3>Sample</h3><div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Tagged games</div><div class="stat-card-value">${data.games}</div></div>
          <div class="stat-card"><div class="stat-card-title">Offensive snaps</div><div class="stat-card-value">${data.offCount}</div></div>
          <div class="stat-card"><div class="stat-card-title">Run tendency</div><div class="stat-card-value">${runPct}${runPct === '—' ? '' : '%'}</div></div>
          <div class="stat-card"><div class="stat-card-title">Defensive snaps</div><div class="stat-card-value">${data.defCount}</div></div>
          <div class="stat-card"><div class="stat-card-title">Scout-film ST</div><div class="stat-card-value">${data.stCount}</div></div>
        </div></div>
        <div class="stats-section"><h3>Film cohorts</h3><div class="gi-reports-watch-row">
          ${this._opponentWatchButton('all', data.offCount + data.defCount + data.stCount, `Watch all ${opponentName} film`)}
          ${this._opponentWatchButton('offense', data.offCount, `Watch ${opponentName} offense`)}
          ${this._opponentWatchButton('defense', data.defCount, `Watch ${opponentName} defense`)}
          ${this._opponentWatchButton('special', data.stCount, `Watch ${opponentName} Special Teams`)}
        </div><p>Special Teams includes opponent-film scout games only. Head-to-head self-scout film is not silently perspective-flipped.</p></div>`;
    } else if (tab === 'offense') {
      const report = data.offReport;
      if (!report) html = '<div class="stats-section"><h3>No opponent offensive snaps</h3><p>On head-to-head film, chart our unit as Defense. On opponent film, choose Opponent scout and chart their Offense.</p></div>';
      else html = `
        <div class="stats-section gi-reports-unit-head"><h3>Their offense · ${report.totalPlays} snaps</h3>${this._opponentWatchButton('offense', data.offCount, 'Watch opponent offense')}</div>
        <div class="stats-section"><h3>Formation tendencies</h3><table class="stats-table stats-table-full"><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Yds</th><th>TD</th></tr></thead><tbody>${report.formationDetail.map(row => `<tr><td>${Charts._esc(row.name)}</td><td>${row.total}</td><td>${row.runPct}%</td><td>${100 - row.runPct}%</td><td>${row.yards}</td><td>${row.tds}</td></tr>`).join('')}</tbody></table></div>
        ${this.app.stats._renderBigTwelve(data.offPlays, data.opponent, { cut: false })}
        <div class="stats-section"><h3>Down &amp; distance</h3><table class="stats-table stats-table-full"><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th></tr></thead><tbody>${report.downTendency.map(row => `<tr><td>${Charts._esc(row.key)}</td><td>${row.total}</td><td>${row.runPct}%</td><td>${100 - row.runPct}%</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'defense') {
      const total = data.defCount || 0;
      const fronts = data.defFronts.map(([label, count]) => `<tr><td>${Charts._esc(label)}</td><td>${count}</td><td>${total ? Math.round(count / total * 100) : 0}%</td></tr>`).join('');
      const coverages = data.defCoverages.map(([label, count]) => `<tr><td>${Charts._esc(label)}</td><td>${count}</td><td>${total ? Math.round(count / total * 100) : 0}%</td></tr>`).join('');
      html = total ? `
        <div class="stats-section gi-reports-unit-head"><h3>Their defense · ${total} snaps</h3>${this._opponentWatchButton('defense', total, 'Watch opponent defense')}</div>
        <div class="stats-two-col">
          <div class="stats-section"><h3>Fronts</h3>${fronts ? `<table class="stats-table stats-table-full"><thead><tr><th>Front</th><th>#</th><th>%</th></tr></thead><tbody>${fronts}</tbody></table>` : '<p>No fronts charted.</p>'}</div>
          <div class="stats-section"><h3>Coverages</h3>${coverages ? `<table class="stats-table stats-table-full"><thead><tr><th>Coverage</th><th>#</th><th>%</th></tr></thead><tbody>${coverages}</tbody></table>` : '<p>No coverages charted.</p>'}</div>
        </div>` : '<div class="stats-section"><h3>No opponent defensive snaps</h3><p>On head-to-head film, chart our unit as Offense. On opponent film, choose Opponent scout and chart their Defense.</p></div>';
    } else if (tab === 'special') {
      if (!data.stStats) html = '<div class="stats-section"><h3>No opponent Special Teams scout film</h3><p>Chart a future opponent game in Opponent scout mode to build kick, return, field-goal, and try tendencies. Head-to-head film is not auto-flipped because the stored subject is our team.</p></div>';
      else html = `<div class="stats-section gi-reports-unit-head"><h3>Their Special Teams · ${data.stCount} snaps</h3>${this._opponentWatchButton('special', data.stCount, 'Watch opponent Special Teams')}</div>${this.app.stats._renderSpecialTeams(data.stStats)}${this.app.stats._renderConversions(data.stStats)}${this.app.stats._renderIndividualStats(data.stStats, 'special')}`;
    }
    this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="${tab}" data-report-perspective-pane="opponent">${html}</section>`;
    this._bindContent(this.content, data?.stStats || this.app.stats.compute([]));
  }

  _opponentWatchButton(kind, count, label) {
    if (!count) return '';
    return `<button type="button" class="gi-reports-watch" data-opponent-watch="${kind}">${Charts._esc(label)} <span>${count}</span></button>`;
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
  _emptyHtml() {
    return `<div class="stats-section gi-reports-empty"><h3>No charted data yet</h3><p>Tag Play Type, Result, and Yardage to build the report. Add Down &amp; Distance and Formation for situational tendencies.</p></div>`;
  }

  _overviewHtml(stats) {
    const s = this.app.stats;
    if (!stats.allPlays) return this._emptyHtml();
    return `
      <div class="stats-cut-hint">Select any highlighted row to watch those exact plays. Report totals never substitute for the film.</div>
      ${s._renderGameHeader(stats)}
      ${s._renderTeamStats(stats)}
      ${s._renderLensBoard(stats)}
      ${s._renderTakeaways(stats)}
      ${s._renderDownAnalysis(stats)}
      <div class="gi-card-grid">
        ${s._renderEfficiency(stats)}
        ${s._renderDrives(stats)}
        ${s._renderBigPlays(stats)}
      </div>
      ${s._renderGameFlow(stats)}
      ${s._renderDriveChart(stats)}
      ${s._renderPenalties(stats)}`;
  }

  _offenseHtml(stats) {
    const s = this.app.stats;
    if (!stats.offPlays.length) return '<div class="stats-section"><h3>No offensive snaps charted</h3><p>Set Unit to Offense to populate this report.</p></div>';
    return `
      ${s._renderOffenseHero(stats)}
      ${s._renderPlayAction(stats)}
      ${s._renderTendencies(stats)}
      ${s._renderBigTwelve(stats.offPlays, document.getElementById('gameTeamName')?.value || 'Our Offense')}
      ${s._renderPersonnel(stats)}
      ${s._renderBackfieldStrength(stats)}
      ${s._renderDirectionMotion(stats)}
      ${s._renderHashStats(stats)}
      ${s._renderPersonnelSituation(stats)}
      ${s._renderTendencyMatrix(stats)}
      ${s._renderSituational(stats)}
      ${s.heatMaps.render(stats.offPlays)}
      ${Visualizations.render(stats.offPlays)}
      ${s._renderAdvanced(stats)}`;
  }

  _specialTeamsHtml(stats) {
    const s = this.app.stats;
    const body = `${s._renderSpecialTeams(stats)}${s._renderConversions(stats)}${s._renderIndividualStats(stats, 'special')}`;
    return body || '<div class="stats-section"><h3>No Special Teams snaps charted</h3><p>Chart kickoff, return, punt, field goal, and try units to populate this report.</p></div>';
  }

  _playersHtml(stats) {
    const body = this.app.stats._renderIndividualStats(stats, 'all');
    return body || '<div class="stats-section"><h3>No player attribution yet</h3><p>Add ball carrier, passer, receiver, tackler, returner, or kicker to chart individual performance.</p></div>';
  }

  _bindContent(root) {
    const stats = this.app.stats;
    try { stats.heatMaps.bind(root); } catch {}
    try { stats._makeSortable(root); } catch {}
    try { stats._wireSubtabs(root); } catch {}
    try { stats._bindTendencyMatrix(root); } catch {}

    // AX-7: a lens is a route, not a dead summary — its "detail" action opens
    // the tab that owns that lens's full breakdown. Bound in both perspectives
    // because it navigates this report rather than resolving a play cohort.
    //
    // Deliberately NOT `data-report-tab`: that attribute belongs to the tab
    // bar, and `_syncTabState` walks the whole host, so a lens button wearing
    // it would be counted as a tab, toggled `.active`, and hidden by
    // perspective rules that have nothing to do with it.
    root.querySelectorAll('[data-lens-tab]').forEach(button => {
      button.addEventListener('click', () => this.selectTab(button.dataset.lensTab));
    });

    if (this.perspective === 'self') {
      root.querySelectorAll('.player-row[data-player]').forEach(row => {
        row.title = "Watch this player's plays";
        this._makeFilmControl(row, () => stats._watchPlayer(row.dataset.player));
      });
      root.querySelectorAll('.cut-row[data-cut-type]').forEach(row => {
        row.title = row.dataset.cutLabel ? `Watch: ${row.dataset.cutLabel}` : 'Watch these plays';
        this._makeFilmControl(row, () => {
          const filter = stats._buildCutFilter(row.dataset.cutType, row.dataset.cutVal);
          stats._watchPlays(filter, row.dataset.cutLabel || '');
        });
      });
      root.querySelectorAll('.drive-row[data-drive-ids]').forEach(row => {
        this._makeFilmControl(row, () => {
          const ids = new Set((row.dataset.driveIds || '').split(',').filter(Boolean));
          if (ids.size) stats._watchPlays(play => ids.has(String(play.id)), row.querySelector('.drive-num')?.textContent || 'Drive');
        });
      });
    } else {
      // Existing tag filters operate on the active game's tagger and would be
      // wrong for a cross-game opponent cohort. Only these composite-ref unit
      // controls are interactive in opponent perspective.
      root.querySelectorAll('.cut-row,.player-row').forEach(row => {
        row.removeAttribute('tabindex');
        row.removeAttribute('role');
        row.classList.remove('cut-row', 'player-row');
      });
      root.querySelectorAll('[data-opponent-watch]').forEach(button => {
        button.addEventListener('click', () => {
          const kind = button.dataset.opponentWatch;
          const refs = this._opponentRefs(kind);
          this.app.filmNavigation?.watch?.(refs, { label: button.textContent.trim() });
        });
      });
    }
    root.querySelector('#btnExportSelfScout')?.addEventListener('click', () => {
      const report = stats.generateSelfScout();
      if (report) stats._exportSelfScout(report, document.getElementById('gameTeamName')?.value || 'Our Offense');
    });
    root.querySelector('#btnExportDef')?.addEventListener('click', () => stats._exportDefensiveReport(stats.compute(), document.getElementById('gameTeamName')?.value || 'Our Defense'));
  }

  _makeFilmControl(element, activate) {
    element.tabIndex = 0;
    element.setAttribute('role', 'button');
    element.addEventListener('click', activate);
    element.addEventListener('keydown', event => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      activate();
    });
  }
}
