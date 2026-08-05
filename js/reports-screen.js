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
          `<option value="${Charts._esc(item.name)}"${item.name === current ? ' selected' : ''}>${Charts._esc(item.name)} · ${item.games} game${item.games === 1 ? '' : 's'}</option>`).join('');
      }
    }
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
      html = this._opponentOverviewHtml(data, opponentName);
    } else if (tab === 'offense') {
      const report = data.offReport;
      if (!report) html = '<div class="stats-section"><h3>No opponent offensive snaps</h3><p>On head-to-head film, chart our unit as Defense. On opponent film, choose Opponent scout and chart their Offense.</p></div>';
      else html = `
        <div class="stats-section gi-reports-unit-head"><h3>Their offense · ${report.totalPlays} snaps</h3>${this._opponentWatchButton('offense', data.offCount, 'Watch opponent offense')}</div>
        <div class="stats-section"><h3>Formation tendencies</h3><table class="stats-table stats-table-full"><thead><tr><th>Formation</th><th>#</th><th>Run%</th><th>Pass%</th><th>Yds</th><th>TD</th></tr></thead><tbody>${report.formationDetail.map(row => `<tr><td>${Charts._esc(row.name)}</td><td>${row.total}</td><td>${row.runPct}%</td><td>${100 - row.runPct}%</td><td>${row.yards}</td><td>${row.tds}</td></tr>`).join('')}</tbody></table></div>
        ${this.app.stats._renderBigTwelve(data.offPlays, data.opponent, { cut: false })}
        <div class="stats-section"><h3>Down &amp; distance</h3><table class="stats-table stats-table-full"><thead><tr><th>Situation</th><th>#</th><th>Run%</th><th>Pass%</th></tr></thead><tbody>${report.downTendency.map(row => `<tr><td>${Charts._esc(row.key)}</td><td>${row.total}</td><td>${row.runPct}%</td><td>${100 - row.runPct}%</td></tr>`).join('')}</tbody></table></div>`;
    } else if (tab === 'defense') {
      html = this._opponentDefenseHtml(data, opponentName);
    } else if (tab === 'special') {
      if (!data.stStats) html = '<div class="stats-section"><h3>No opponent Special Teams scout film</h3><p>Chart a future opponent game in Opponent scout mode to build kick, return, field-goal, and try tendencies. Head-to-head film is not auto-flipped because the stored subject is our team.</p></div>';
      else html = `<div class="stats-section gi-reports-unit-head"><h3>Their Special Teams · ${data.stCount} snaps</h3>${this._opponentWatchButton('special', data.stCount, 'Watch opponent Special Teams')}</div>${this.app.stats._renderSpecialTeams(data.stStats)}${this.app.stats._renderConversions(data.stStats)}${this.app.stats._renderIndividualStats(data.stStats, 'special')}`;
    }
    this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="${tab}" data-report-perspective-pane="opponent">${html}</section>`;
    this._bindContent(this.content, data?.stStats || this.app.stats.compute([]));
  }

  /**
   * F4 — the opponent Overview as an ANSWER SHEET.
   *
   * It used to be five sample-count tiles, which told a coach how much film
   * existed and nothing about the opponent. This leads with who they are,
   * then what to expect, attack and avoid — every line drawn from the same
   * charted plays and film-linked where a cohort exists.
   */
  _opponentOverviewHtml(data, opponentName) {
    const join = data.defenseJoin;
    const off = data.offReport;
    const runPct = off?.stats?.tendencies?.runPct;
    const topCall = off?.formationDetail?.[0];
    const thin = (data.offCount + data.defCount) < 40;
    const identity = [
      join?.baseFront ? `${join.baseFront.name} front` : '',
      join?.baseCoverage ? `${join.baseCoverage.name}` : '',
      runPct != null ? `${Math.round(parseFloat(runPct))}% run` : '',
    ].filter(Boolean).join(' · ');

    const line = (label, value, sub, refs) => {
      const attrs = refs?.length
        ? ` class="gi-answer-row cut-row" data-opponent-refs="${Charts._esc(refs.join(','))}" tabindex="0" role="button"`
        : ' class="gi-answer-row"';
      return `<li${attrs}><span>${Charts._esc(label)}</span><strong>${Charts._esc(value)}</strong>${sub ? `<small>${Charts._esc(sub)}</small>` : ''}</li>`;
    };
    const block = (title, note, rows) => rows.length
      ? `<section class="gi-answer"><h4>${Charts._esc(title)}</h4><p>${Charts._esc(note)}</p><ul>${rows.join('')}</ul></section>` : '';

    const expect = (off?.formationDetail || []).slice(0, 3).map(row =>
      line(row.name, `${row.total} snaps`, `${row.runPct}% run`));
    const attack = join ? [join.best].filter(Boolean).map(row =>
      line(row.name, `${row.succPct}% success`, `${row.n} snaps · ${row.avg} avg`, row.refs)) : [];
    const avoid = join ? [join.worst].filter(Boolean).filter(row => row !== join.best).map(row =>
      line(row.name, `${row.succPct}% success`, `${row.n} snaps · ${row.avg} avg`, row.refs)) : [];
    const risk = join ? [
      line('They bring pressure', `${join.pressure.ratePct}% of snaps`,
        `${join.pressure.blitzed.succPct}% success against it`, join.pressure.blitzed.refs),
      join.pressure.blitzed.sacks ? line('Sacks allowed', String(join.pressure.blitzed.sacks + join.pressure.noBlitz.sacks), 'across this cohort') : '',
    ].filter(Boolean) : [];

    return `
      <div class="stats-cut-hint">Every line reads the same charted plays. Highlighted rows play their exact snaps.</div>
      <div class="stats-section gi-answer-head">
        <h3>${Charts._esc(opponentName)}</h3>
        ${identity ? `<p class="gi-answer-identity">${Charts._esc(identity)}</p>` : ''}
        <p class="viz-caption">${data.games} charted game${data.games === 1 ? '' : 's'} · ${data.offCount} of their offensive snaps · ${data.defCount} of their defensive snaps${thin ? ' — a thin sample; read these as leads, not law.' : ''}</p>
      </div>
      <div class="stats-section gi-answer-grid">
        ${block('Expect', 'Their most frequent looks.', expect)}
        ${block('Attack', 'Where our offense had the most success against them.', attack)}
        ${block('Avoid', 'Where it did not.', avoid)}
        ${block('Risk', 'What their pressure costs us.', risk)}
      </div>
      <div class="stats-section"><h3>Film</h3><div class="gi-reports-watch-row">
        ${this._opponentWatchButton('all', data.offCount + data.defCount + data.stCount, `Watch all ${opponentName} film`)}
        ${this._opponentWatchButton('offense', data.offCount, `Their offense`)}
        ${this._opponentWatchButton('defense', data.defCount, `Their defense`)}
        ${this._opponentWatchButton('special', data.stCount, `Their Special Teams`)}
      </div><p class="viz-caption">Special Teams includes opponent-film scout games only. Head-to-head self-scout film is not silently perspective-flipped, because a stored ST play does not record whose unit the event was.</p></div>`;
  }

  /**
   * F4 — their defense, from the joint observation on our offensive snaps.
   * Was two one-row tables of front and coverage frequency. Frequency alone
   * says nothing a coach can call a play from.
   */
  _opponentDefenseHtml(data, opponentName) {
    const join = data.defenseJoin;
    if (!join) return '<div class="stats-section"><h3>No opponent defensive snaps</h3><p>Chart our unit as Offense on head-to-head film. Every offensive snap records the front, coverage and pressure they showed.</p></div>';
    const rows = (list, label) => list.slice(0, 8).map(row => `
      <tr class="cut-row" data-opponent-refs="${Charts._esc(row.refs.join(','))}" tabindex="0" role="button">
        <td>${Charts._esc(row.name)}</td><td>${row.n}</td><td>${row.avg}</td><td>${row.succPct}%</td><td>${row.explPct}%</td><td>${row.sacks}</td>
      </tr>`).join('') || `<tr><td colspan="6">No ${label} charted.</td></tr>`;
    const table = (title, note, list, first) => `
      <div class="stats-section"><h3>${Charts._esc(title)}</h3><p class="viz-caption">${Charts._esc(note)}</p>
        <table class="stats-table stats-table-full"><thead><tr>
          <th>${Charts._esc(first)}</th><th>Snaps</th><th>Yds/play</th><th>Our success</th><th>Explosive</th><th>Sacks</th>
        </tr></thead><tbody>${rows(list, first.toLowerCase())}</tbody></table></div>`;

    const changeup = join.changeups.length
      ? `<div class="stats-section"><h3>When they change up</h3><p class="viz-caption">They are a ${Charts._esc(join.baseFront?.name || 'base')} team. These are the exceptions — the rarer a look, the more it is telling you something.</p>
          <table class="stats-table stats-table-full"><thead><tr><th>Front</th><th>Snaps</th><th>Yds/play</th><th>Our success</th></tr></thead>
          <tbody>${join.changeups.map(row => `<tr class="cut-row" data-opponent-refs="${Charts._esc(row.refs.join(','))}" tabindex="0" role="button"><td>${Charts._esc(row.name)}</td><td>${row.n}</td><td>${row.avg}</td><td>${row.succPct}%</td></tr>`).join('')}</tbody></table></div>` : '';

    const p = join.pressure;
    return `
      <div class="stats-section gi-reports-unit-head"><h3>Their defense · ${join.total} snaps</h3>${this._opponentWatchButton('defense', join.total, 'Watch opponent defense')}</div>
      <div class="stats-section"><h3>Pressure</h3>
        <p class="viz-caption">How often they bring it, and whether our answer is better or worse when they do.</p>
        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Pressure rate</div><div class="stat-card-value">${p.ratePct}%</div><div class="stat-card-sub">${p.blitzed.n} of ${join.total} snaps</div></div>
          <div class="stat-card"><div class="stat-card-title">Our success vs pressure</div><div class="stat-card-value">${p.blitzed.succPct}%</div><div class="stat-card-sub">${p.blitzed.avg} yds/play</div></div>
          <div class="stat-card"><div class="stat-card-title">Our success without</div><div class="stat-card-value">${p.noBlitz.succPct}%</div><div class="stat-card-sub">${p.noBlitz.avg} yds/play</div></div>
          <div class="stat-card"><div class="stat-card-title">Sacks allowed</div><div class="stat-card-value">${p.blitzed.sacks + p.noBlitz.sacks}</div></div>
        </div></div>
      ${table('Fronts — and what they cost us', 'Frequency alone is not actionable. This is what happened against each front.', join.fronts, 'Front')}
      ${table('Coverages — and what they cost us', 'Same read, on the back end.', join.coverages, 'Coverage')}
      ${table('What they play against our looks', 'Our formation, their answer, our result. The core scouting question.', join.byOurLook, 'Our formation')}
      ${table('By situation', 'Money downs, red zone and backed up — where the call changes.', join.bySituation, 'Situation')}
      ${changeup}`;
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
      ${/* H14 — three equal columns left ~400px empty under Efficiency and Big
            Plays, because Drives runs ~700px and the other two do not. The
            earlier `align-items:start` fix was a no-op: it was already set, and
            the space was never a stretch — it was genuinely empty.

            Two columns instead. Drives keeps its own column; the short panels
            stack beside it and the remaining room carries the by-down read,
            which was computed already and only rendered far below the fold. */''}
      <div class="gi-card-grid gi-overview-row">
        ${s._renderDrives(stats)}
        <div class="gi-stack">
          ${s._renderEfficiency(stats)}
          ${s._renderByDownPanel(stats)}
          ${s._renderBigPlays(stats)}
        </div>
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
      ${s._renderShape(stats)}
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
      // F4: rows that carry their OWN composite refs stay live. The tag-filter
      // rows are stripped as before, because those resolve against the active
      // game's tagger and would be wrong for a cross-game opponent cohort.
      root.querySelectorAll('.cut-row:not([data-opponent-refs]),.player-row').forEach(row => {
        row.removeAttribute('tabindex');
        row.removeAttribute('role');
        row.classList.remove('cut-row', 'player-row');
      });
      root.querySelectorAll('[data-opponent-refs]').forEach(row => {
        const refs = (row.dataset.opponentRefs || '').split(',').filter(Boolean);
        if (!refs.length) { row.classList.remove('cut-row'); row.removeAttribute('tabindex'); row.removeAttribute('role'); return; }
        const label = row.querySelector('span')?.textContent?.trim() || row.querySelector('td')?.textContent?.trim() || 'Opponent film';
        this._makeFilmControl(row, () => this.app.filmNavigation?.watch?.(refs, { label }));
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
