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
    this.defenseScope = 'season';
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
    this._syncKpiRail();
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
    if (kind === 'pdf') stats._exportStats(stats.compute());
    else if (kind === 'html') this.app.storage?.exportHtmlReport?.(stats);
    else if (kind === 'season-html') return this.app.season?.exportHtml?.() === true;
    else if (kind === 'csv') this.app.storage?.exportCsv?.();
    else if (kind === 'call-sheet') this.app.callSheet?.show?.();
    else return false;
    return true;
  }

  /**
   * Reports redesign — the persistent KPI rail (item A). Literal labels: Final
   * Score, Total Plays, Plays Charted, Plays per Phase, Success Rate. Reads
   * StatsEngine._kpiRailData(), which is a read-only count over the canonical
   * play list — no value is computed here. Hidden on Season (own rail) and in
   * opponent perspective (its own answer-sheet header already states the
   * sample), so it never duplicates a header the tab already carries.
   */
  _syncKpiRail() {
    const rail = this.host?.querySelector('[data-reports-rail]');
    if (!rail) return;
    if (this._mode !== 'main' || this.perspective !== 'self' || this.activeTab === 'season') { rail.hidden = true; return; }
    const stats = this.app.stats;
    const data = stats?._kpiRailData?.(stats.compute());
    if (!data || !data.totalPlays) { rail.hidden = true; return; }
    const esc = Charts._esc;
    const tile = (label, value, sub, tone) => `<div class="gi-kpi${tone ? ` is-${tone}` : ''}"><div class="gi-kpi-label">${esc(label)}</div><div class="gi-kpi-value">${esc(String(value))}</div>${sub ? `<div class="gi-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
    const score = data.finalScore ? `${data.finalScore.us}–${data.finalScore.them}` : '—';
    const phase = `${data.units.offense}O / ${data.units.defense}D / ${data.units.special}ST`;
    const success = data.successRate != null ? `${Math.round(parseFloat(data.successRate))}%` : '—';
    // Turnovers must say both directions -- giving the ball away and taking
    // it away are opposite outcomes and neither is honest alone on a rail
    // that also carries defensive plays-per-phase. Tone (green/red) is only
    // ever the genuine net margin; a side with nothing charted is disclosed
    // rather than guessed as zero, and never colored either way.
    let turnoverTile = '';
    if (data.turnovers) {
      const { giveaways, takeaways } = data.turnovers;
      if (giveaways != null && takeaways != null) {
        const margin = takeaways - giveaways;
        turnoverTile = tile('Turnovers', `${giveaways} GA · ${takeaways} TA`,
          margin > 0 ? `+${margin} margin` : margin < 0 ? `${margin} margin` : 'even margin',
          margin > 0 ? 'pos' : margin < 0 ? 'neg' : '');
      } else if (giveaways != null) {
        turnoverTile = tile('Turnovers', `${giveaways} GA`, 'no defensive snaps charted');
      } else {
        turnoverTile = tile('Turnovers', `${takeaways} TA`, 'no offensive snaps charted');
      }
    }
    rail.innerHTML = [
      tile('Final Score', score),
      tile('Total Plays', data.totalPlays),
      tile('Plays Charted', data.playsCharted, `of ${data.totalPlays}`),
      tile('Plays per Phase', phase),
      // Coach: "on-schedule" is commentary, not a definitional label.
      tile('Success Rate', success, 'offense'),
      turnoverTile,
    ].join('');
    rail.hidden = false;
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
    const stats = ['overview', 'offense', 'special', 'players'].includes(tab) ? statsEngine.compute() : null;
    if (tab === 'season') {
      this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="season">${this.app.season?.statsHtml?.() || '<div class="stats-section"><p>Season stats unavailable — open a season first.</p></div>'}</section>`;
      this._bindContent(this.content);
      return;
    }
    if (tab === 'matchup') {
      this.content.innerHTML = '<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="matchup"></section>';
      const pane = this.content.querySelector('[data-pane="matchup"]');
      try { statsEngine._renderMatchupInto(pane); }
      catch { pane.innerHTML = '<div class="stats-section"><p>Matchup unavailable for this game.</p></div>'; }
      this._bindContent(this.content);
      return;
    }

    let html = '';
    if (tab === 'overview') html = this._overviewHtml(stats);
    else if (tab === 'offense') html = this._offenseHtml(stats);
    else if (tab === 'defense') {
      html = this._defenseHtml();
    } else if (tab === 'special') html = this._specialTeamsHtml(stats);
    else if (tab === 'players') html = this._playersHtml(stats);
    else if (tab === 'selfscout') {
      const report = statsEngine.generateSelfScout();
      const defScout = report?.defScout || statsEngine.generateDefensiveSelfScout();
      html = statsEngine._renderSelfScoutBody(report, defScout);
    }
    this.content.innerHTML = `<section class="gi-report-pane stats-tab-pane active" data-native-main-report data-pane="${tab}">${html}</section>`;
    this._bindContent(this.content);
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
        ${/* H18 / G2 — THIS is the path the native screen renders. Both were
              built into stats-engine's `renderOpponentScout`, which this screen
              never calls, so two builds of work went into a dead path and the
              coach saw none of it. Composed here, where the tab is actually
              assembled. */''}
        ${/* H19 — a PIVOT, which is what was asked for. Two static tables
              answered exactly the two questions I coded; this answers any pair
              the coach picks, and `dirVsStrength` / `dirVsHash` are registered
              dimensions so they cross with formation, down, distance and
              personnel. Opens on the read he named. */''}
        ${this.app.stats._renderTendencyMatrix(null, {
          plays: data.offPlays, row: 'formation', col: 'dirVsStrength',
          title: 'Tendencies — pivot any two dimensions',
        })}
        ${this.app.stats._renderBigTwelve(data.offPlays, data.opponent, { cut: false })}
        ${this.app.stats._renderScoutDownDistance(report)}`;
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
    const block = (title, rows) => rows.length
      ? `<section class="gi-answer"><h4>${Charts._esc(title)}</h4><ul>${rows.join('')}</ul></section>` : '';

    const expect = (off?.formationDetail || []).slice(0, 3).map(row =>
      line(row.name, `${row.total} snaps`, `${row.runPct}% run`));
    const attack = join ? [join.best].filter(Boolean).map(row =>
      line(row.name, `${row.succPct}% success`, `${row.n} snaps · ${row.avg} avg`, row.refs)) : [];
    const avoid = join ? [join.worst].filter(Boolean).filter(row => row !== join.best).map(row =>
      line(row.name, `${row.succPct}% success`, `${row.n} snaps · ${row.avg} avg`, row.refs)) : [];
    const risk = join ? [
      line('Blitz Rate', `${join.pressure.ratePct}% of snaps`,
        `Success Rate: ${join.pressure.blitzed.n ? `${join.pressure.blitzed.succPct}%` : 'N/A'}`, join.pressure.blitzed.refs),
      join.pressure.blitzed.sacks ? line('Sacks allowed', String(join.pressure.blitzed.sacks + join.pressure.noBlitz.sacks), 'across this cohort') : '',
    ].filter(Boolean) : [];

    return `

      <div class="stats-section gi-answer-head">
        <h3>${Charts._esc(opponentName)}</h3>
        ${identity ? `<p class="gi-answer-identity">${Charts._esc(identity)}</p>` : ''}
        <p class="viz-caption gi-answer-sample">Games Charted: ${data.games} · Offensive Snaps: ${data.offCount} · Defensive Snaps: ${data.defCount}${thin ? ' · Small Sample' : ''}</p>
      </div>
      <div class="stats-section gi-answer-grid">
        ${block('Expect', expect)}
        ${block('Attack', attack)}
        ${block('Avoid', avoid)}
        ${block('Risk', risk)}
      </div>
      <div class="stats-section"><h3>Film</h3><div class="gi-reports-watch-row">
        ${this._opponentWatchButton('all', data.offCount + data.defCount + data.stCount, `Watch all ${opponentName} film`)}
        ${this._opponentWatchButton('offense', data.offCount, `Their offense`)}
        ${this._opponentWatchButton('defense', data.defCount, `Their defense`)}
        ${this._opponentWatchButton('special', data.stCount, `Their Special Teams`)}
      </div></div>`;
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
      ? `<div class="stats-section"><h3>Fronts and coverages outside their base</h3><p class="viz-caption">Fronts and coverages outside their base of ${Charts._esc(join.baseFront?.name || 'base')}, ordered by how rarely they appear.</p>
          <table class="stats-table stats-table-full"><thead><tr><th>Front</th><th>Snaps</th><th>Yds/play</th><th>Our success</th></tr></thead>
          <tbody>${join.changeups.map(row => `<tr class="cut-row" data-opponent-refs="${Charts._esc(row.refs.join(','))}" tabindex="0" role="button"><td>${Charts._esc(row.name)}</td><td>${row.n}</td><td>${row.avg}</td><td>${row.succPct}%</td></tr>`).join('')}</tbody></table></div>` : '';

    const p = join.pressure;
    return `
      <div class="stats-section gi-reports-unit-head"><h3>Their defense · ${join.total} snaps</h3>${this._opponentWatchButton('defense', join.total, 'Watch opponent defense')}</div>
      <div class="stats-section"><h3>Blitz</h3>

        <div class="stats-grid">
          <div class="stat-card"><div class="stat-card-title">Blitz Rate</div><div class="stat-card-value">${p.ratePct}%</div><div class="stat-card-sub">${p.blitzed.n} of ${join.total} snaps</div></div>
          <div class="stat-card"><div class="stat-card-title">Success Rate vs. Blitz</div><div class="stat-card-value">${p.blitzed.n ? `${p.blitzed.succPct}%` : 'N/A'}</div><div class="stat-card-sub">${p.blitzed.avg} yds/play</div></div>
          <div class="stat-card"><div class="stat-card-title">No Blitz</div><div class="stat-card-value">${p.noBlitz.succPct}%</div><div class="stat-card-sub">${p.noBlitz.avg} yds/play</div></div>
          <div class="stat-card"><div class="stat-card-title">Sacks allowed</div><div class="stat-card-value">${p.blitzed.sacks + p.noBlitz.sacks}</div></div>
        </div></div>
      ${table('Fronts — and what they cost us', 'Snaps we faced from each front, with yards per play, our success rate, our explosive rate and sacks allowed against it.', join.fronts, 'Front')}
      ${table('Coverages — and what they cost us', 'Snaps we faced from each coverage, with yards per play, our success rate, our explosive rate and sacks allowed against it.', join.coverages, 'Coverage')}
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

      ${s._renderGameHeader(stats)}
      ${s._renderTeamStats(stats)}
      ${s._renderLensBoard(stats)}
      ${s._renderTakeaways(stats)}
      ${s._renderDownAnalysis(stats)}
      ${/* H14/C — this pairing was wrong FOUR times, always the same
            mechanism: CSS Grid makes a ROW as tall as its tallest column, and
            `align-items:start` only stops the SHORT column from being
            STRETCHED to fill that height — it cannot stop the row itself from
            CLAIMING the space, so the leftover always lands as a visible
            empty rectangle. Every reshuffle of which two sections share a row
            (Drives+[Efficiency,ByDown,BigPlays] stack, then
            Drives+[Efficiency,ByDown] stack, then Drives+Efficiency alone)
            closed part of the gap and left a smaller one — coach's word was
            "has to be fixed", not "smaller", and real game data will always
            vary the exact height of every section, so no fixed pairing is
            safe against reopening this on a different season. Every section
            here now runs full width, one after another. A shorter section is
            simply shorter — there is no partner row for it to leave empty
            space in. */''}
      ${s._renderDrives(stats)}
      ${s._renderEfficiency(stats)}
      ${s._renderByDownPanel(stats)}
      ${s._renderBigPlays(stats)}
      ${s._renderGameTimeline(stats)}
      ${s._renderPenalties(stats)}`;
  }

  _offenseHtml(stats) {
    const s = this.app.stats;
    if (!stats.offPlays.length) return '<div class="stats-section"><h3>No offensive snaps charted</h3><p>Set Unit to Offense to populate this report.</p></div>';
    return `
      ${s._renderOffenseHero(stats)}
      ${this._playCallHtml(stats)}
      ${s._renderShape(stats)}
      ${s._renderPlayAction(stats)}
      ${s._renderTendencies(stats)}
      ${s._renderBigTwelve(stats.offPlays, this.app.gameContext.snapshot().teamName || 'Our Offense')}
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

  _playCallHtml(stats) {
    const analysis = this.app.stats._playCallAnalysis(stats.offPlays);
    if (!analysis.eligible) return '';
    const esc = Charts._esc;
    const gameId = this.app.storage?.seasonStore?.activeGame?.()?.id || '';
    const pct = value => `${Number(value || 0).toFixed(1).replace(/\.0$/, '')}%`;
    const refs = row => row.playIds.map(id => `${gameId}::${id}`).join(',');
    const attrs = (row, label, classes = '') => `class="cut-row gi-call-film ${classes}" data-play-call-refs="${esc(refs(row))}" data-cut-label="${esc(label)}"`;
    const metricCells = row => `<td>${row.n}</td><td>${pct(row.sharePct)}</td><td>${pct(row.successRate)}</td><td>${row.yardsPerPlay.toFixed(1)}</td><td>${pct(row.explosiveRate)}</td><td>${pct(row.negativeRate)}</td>`;
    const callRows = analysis.calls.map(row => `<tr ${attrs(row, `Play Call: ${row.name}`)}><td><strong>${esc(row.name)}</strong></td><td>${esc(row.concept || '—')}</td>${metricCells(row)}</tr>`).join('');
    const conceptRows = analysis.concepts.map(concept => {
      const head = `<tr ${attrs(concept, `Concept: ${concept.name}`, 'gi-call-concept')}><td><strong>${esc(concept.name)}</strong></td><td>${concept.n}</td><td>${pct(concept.successRate)}</td><td>${concept.yardsPerPlay.toFixed(1)}</td></tr>`;
      const children = concept.calls.map(call => `<tr ${attrs(call, `Play Call: ${call.name}`, 'gi-call-child')}><td>${esc(call.name)}</td><td>${call.n}</td><td>${pct(call.successRate)}</td><td>${call.yardsPerPlay.toFixed(1)}</td></tr>`).join('');
      return head + children;
    }).join('');
    const lenses = [...new Set(analysis.situations.map(row => row.lens))];
    const situationHtml = lenses.map(lens => {
      const rows = analysis.situations.filter(row => row.lens === lens)
        .sort((a, b) => b.contextN - a.contextN || a.value.localeCompare(b.value))
        .map(row => `<tr ${attrs(row, `${lens}: ${row.value} — ${row.call}`)}><td>${esc(row.value)}</td><td><strong>${esc(row.call)}</strong></td><td>${row.n}/${row.contextN}</td><td>${pct(row.successRate)}</td><td>${row.yardsPerPlay.toFixed(1)}</td></tr>`).join('');
      return `<div class="gi-call-context"><h4>${esc(lens)}</h4><table class="stats-table stats-table-full"><thead><tr><th>Situation</th><th>Top Call</th><th>Use</th><th>Success Rate</th><th>Yds/Play</th></tr></thead><tbody>${rows}</tbody></table></div>`;
    }).join('');
    return `<div class="stats-section gi-play-calls"><h3>Play Calls</h3><p class="gi-call-note">${analysis.eligible} offensive snaps have an exact call. Frequency uses those call-charted snaps; every row opens its exact film.</p><div class="gi-call-grid"><div><h4>Call performance</h4><table class="stats-table stats-table-full gi-call-table"><thead><tr><th>Play Call</th><th>Concept</th><th>Plays</th><th>Frequency</th><th>Success Rate</th><th>Yds/Play</th><th>Explosive</th><th>Negative</th></tr></thead><tbody>${callRows}</tbody></table></div><div><h4>Concept roll-up</h4>${conceptRows ? `<table class="stats-table stats-table-full gi-call-concepts"><thead><tr><th>Concept / Call</th><th>Plays</th><th>Success Rate</th><th>Yds/Play</th></tr></thead><tbody>${conceptRows}</tbody></table>` : '<p>No concepts assigned yet.</p>'}</div></div><h4>What we call by situation</h4><div class="gi-call-context-grid">${situationHtml}</div></div>`;
  }

  _specialTeamsHtml(stats) {
    const s = this.app.stats;
    const body = `${s._renderSpecialTeams(stats)}${s._renderConversions(stats)}${s._renderIndividualStats(stats, 'special')}`;
    return body || '<div class="stats-section"><h3>No Special Teams snaps charted</h3><p>Chart kickoff, return, punt, field goal, and try units to populate this report.</p></div>';
  }

  _defenseHtml() {
    const engine = this.app.stats;
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
    const scoped = this.defenseScope === 'game'
      ? plays.filter(play => String(play.__gid) === activeId) : plays;
    this._defenseScopedPlays = scoped;
    const report = engine.defensivePerformance(scoped, labels);
    if (!report.total) return `<div class="stats-section def-empty"><h3>No defensive data tagged yet</h3><p>Tag plays as Defense and add the opponent's play type, result and yardage to build this report.</p></div>`;
    const esc = Charts._esc;
    const pct = value => value == null ? 'N/A' : `${value}%`;
    const filmAttrs = (row, label) => row.refs?.length
      ? `class="cut-row" data-defense-refs="${esc(row.refs.join(','))}" data-cut-label="${esc(label)}"`
      : '';
    const metric = (label, value, sub = '') => `<div class="gi-def-kpi"><span>${esc(label)}</span><strong>${esc(String(value))}</strong>${sub ? `<small>${esc(sub)}</small>` : ''}</div>`;
    const typeSummary = report.playTypes.filter(row => row.name === 'All Runs' || row.name === 'All Passes');
    const typeDetail = report.playTypes.filter(row => row.name !== 'All Runs' && row.name !== 'All Passes')
      .sort((a, b) => b.n - a.n || a.name.localeCompare(b.name));
    const typeSummaryHtml = typeSummary.map(row => `<button type="button" class="gi-def-type-summary" data-defense-refs="${esc(row.refs.join(','))}" data-cut-label="${esc(`${row.name} — ${row.n} defensive snaps`)}"><span>${esc(row.name)}</span><strong>${row.n} snaps</strong><small>${row.yardsPerPlay.toFixed(1)} yds/play · ${row.stopRate}% stop · ${row.explosiveRate}% explosive</small></button>`).join('');
    const typeRows = typeDetail.map(row => `<tr class="cut-row gi-def-type-row" data-defense-refs="${esc(row.refs.join(','))}" data-cut-label="${esc(`${row.name} — ${row.n} defensive snaps`)}"><td data-sort="${esc(row.name)}"><strong>${esc(row.name)}</strong></td><td data-sort="${row.n}">${row.n}</td><td data-sort="${row.yardsPerPlay}">${row.yardsPerPlay.toFixed(1)}</td><td data-sort="${row.stopRate}">${row.stopRate}%</td><td data-sort="${row.explosiveRate}">${row.explosiveRate}%</td><td data-sort="${row.havocRate}">${row.havocRate}%</td><td data-sort="${row.touchdowns}">${row.touchdowns}</td></tr>`).join('');
    const answerCell = answer => answer
      ? `<button type="button" class="gi-def-answer" data-defense-refs="${esc(answer.refs.join(','))}" data-cut-label="${esc(answer.name)} answer"><strong>${esc(answer.name)}</strong><span>${answer.stopRate}% stop · ${answer.yardsPerPlay.toFixed(1)} yds/play · ${answer.n} snaps</span></button>`
      : '<span class="gi-def-no-sample">Not enough snaps</span>';
    const answerRows = report.answers.map(row => `<tr><td><strong>${esc(row.playType)}</strong><small>${row.n} snaps</small></td><td>${answerCell(row.front)}</td><td>${answerCell(row.coverage)}</td><td>${answerCell(row.pressure)}</td></tr>`).join('');
    const gameRows = report.byGame.map(row => `<tr ${filmAttrs(row, `${row.name} defense`)}><td><strong>${esc(row.name)}</strong></td><td>${row.n}</td><td>${row.yardsPerPlay.toFixed(1)}</td><td>${row.stopRate}%</td><td>${row.explosives}</td><td>${row.havoc}</td><td>${row.touchdowns}</td></tr>`).join('');
    const sitRows = report.situations.map(row => `<tr ${filmAttrs(row, `${row.name} defense`)}><td><strong>${esc(row.name)}</strong></td><td>${row.n}</td><td>${row.yardsPerPlay.toFixed(1)}</td><td>${row.stopRate}%</td><td>${row.explosiveRate}%</td><td>${row.havocRate}%</td></tr>`).join('');
    const scopedStats = engine.compute(scoped);
    const defScout = engine.generateDefensiveSelfScout(scoped);
    return `<div class="gi-defense-report">
      <div class="gi-def-toolbar"><div class="gi-def-scope" role="group" aria-label="Defense report scope"><button type="button" data-defense-scope="season" class="${this.defenseScope === 'season' ? 'active' : ''}">Full season</button><button type="button" data-defense-scope="game" class="${this.defenseScope === 'game' ? 'active' : ''}">Current game</button></div><button class="btn btn-sm" id="btnExportDef">Export Report</button></div>
      <section class="stats-section"><h3>Defensive Performance</h3><div class="gi-def-kpis">${metric('Defensive Snaps', report.total)}${metric('Yards / Play Allowed', report.summary.yardsPerPlay.toFixed(1))}${metric('Stop Rate', pct(report.summary.stopRate))}${metric('Explosives Allowed', report.summary.explosives, `${report.summary.explosiveRate}%`)}${metric('3rd Down Stop Rate', pct(report.thirdDownStopRate))}${metric('Red Zone TD Rate', pct(report.redZoneTdRate))}${metric('Takeaways', report.takeaways)}${metric('Havoc Rate', pct(report.summary.havocRate))}</div></section>
      <section class="stats-section"><h3>Opponent Offense by Play Type</h3><div class="gi-def-type-totals">${typeSummaryHtml}</div><div class="gi-def-table-wrap"><table class="stats-table stats-table-full gi-def-type"><thead><tr><th>Play Run Against Us</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive Rate</th><th>Havoc Rate</th><th>TD Allowed</th></tr></thead><tbody>${typeRows}</tbody></table></div></section>
      ${answerRows ? `<section class="stats-section"><h3>Best Calls by Opponent Play Type</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full gi-def-answers"><thead><tr><th>Opponent Play Type</th><th>Best Front</th><th>Best Coverage</th><th>Blitz Decision</th></tr></thead><tbody>${answerRows}</tbody></table></div></section>` : ''}
      <div class="gi-def-split"><section class="stats-section"><h3>Game Trend</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full"><thead><tr><th>Game</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive</th><th>Havoc</th><th>TD</th></tr></thead><tbody>${gameRows}</tbody></table></div></section><section class="stats-section"><h3>Situational Defense</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full"><thead><tr><th>Situation</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive</th><th>Havoc</th></tr></thead><tbody>${sitRows}</tbody></table></div></section></div>
      <section class="stats-section"><h3>Scheme Detail</h3>${engine._renderDefensive(scopedStats)}</section>
      ${engine._defScoutBlock(defScout, false)}
    </div>`;
  }
  _playersHtml(stats) {
    const body = this.app.stats._renderIndividualStats(stats, 'all');
    return body || '<div class="stats-section"><h3>No player attribution yet</h3><p>Add ball carrier, passer, receiver, tackler, returner, or kicker to chart individual performance.</p></div>';
  }

  _bindContent(root) {
    const stats = this.app.stats;
    try { stats.constructor.bindDefs(root); } catch {}
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
      root.querySelectorAll('[data-defense-scope]').forEach(button => {
        button.addEventListener('click', () => {
          this.defenseScope = button.dataset.defenseScope === 'game' ? 'game' : 'season';
          this._renderActiveTab();
        });
      });
      root.querySelectorAll('[data-defense-refs]').forEach(row => {
        const refs = (row.dataset.defenseRefs || '').split(',').filter(Boolean);
        if (refs.length) this._makeFilmControl(row, () => this.app.filmNavigation?.watch?.(refs, {
          label: row.dataset.cutLabel || 'Defensive film',
        }));
      });      // ── H16 — SEASON ROWS FILM THE SEASON, NOT THE ACTIVE GAME ─────────────
      //
      // Every binding below resolves through StatsEngine._watchPlays, which
      // rebuilds its pool from `this.tagger.plays` — the ACTIVE GAME only. That
      // is correct for a game tab and a lie in the Season pane: the row showed a
      // season-wide count and played whichever of those snaps happened to live
      // in the game currently open. Expanding the season block set (the rest of
      // H16) would have multiplied that lie across every new table.
      //
      // Season rows now carry real `gameId::playId` composite refs, resolved by
      // running the SAME _buildCutFilter predicate over _allPlays(), and route
      // through FilmNavigationService — the cross-game path Study and Plan
      // already use. A row that resolves to no playable ref loses its film
      // affordance outright rather than offering a dead click.
      //
      // Bound BEFORE the generic handlers and flagged, so the game-scope
      // selectors below skip these rows instead of double-binding them.
      const seasonPane = root.querySelector('[data-pane="season"]');
      if (seasonPane) {
        const seasonPlays = this.app.season?._allPlays?.() || [];
        const refsFor = predicate => [...new Set(seasonPlays
          .filter(play => { try { return predicate(play); } catch { return false; } })
          .filter(play => play?.__gid != null && play?.id != null)
          .map(play => `${play.__gid}::${play.id}`))];
        const wire = (row, predicate, label) => {
          row.setAttribute('data-season-film', '');
          const refs = refsFor(predicate);
          if (!refs.length) {
            row.classList.remove('cut-row', 'player-row');
            row.removeAttribute('tabindex'); row.removeAttribute('role');
            return;
          }
          row.title = `Watch ${refs.length} play${refs.length === 1 ? '' : 's'} across the season`;
          this._makeFilmControl(row, () => this.app.filmNavigation?.watch?.(refs, { label }));
        };
        seasonPane.querySelectorAll('.cut-row[data-cut-type]').forEach(row => {
          wire(row, stats._buildCutFilter(row.dataset.cutType, row.dataset.cutVal),
            row.dataset.cutLabel || 'Season');
        });
        seasonPane.querySelectorAll('.player-row[data-player]').forEach(row => {
          const num = String(row.dataset.player);
          // Mirrors StatsEngine._watchPlayer's predicate exactly — a player
          // value may hold several jersey numbers (shared tackles).
          const split = stats.constructor.splitPlayers;
          wire(row, play => Object.values(play?.tags?.players || {})
            .some(v => split(v).includes(num)), `${stats._playerLabel(num)} — season cut-up`);
        });
        // Drive rows reconstruct drives per game and key on bare play ids, which
        // collide across games. Season scope has no unambiguous cohort for them.
        seasonPane.querySelectorAll('.drive-row[data-drive-ids]').forEach(row => {
          row.setAttribute('data-season-film', '');
          row.removeAttribute('data-drive-ids');
        });
      }

      root.querySelectorAll('.player-row[data-player]:not([data-season-film])').forEach(row => {
        row.title = "Watch this player's plays";
        this._makeFilmControl(row, () => stats._watchPlayer(row.dataset.player));
      });
      root.querySelectorAll('[data-play-call-refs]').forEach(row => {
        row.setAttribute('data-direct-film', '');
        const refs = (row.dataset.playCallRefs || '').split(',').filter(Boolean);
        if (!refs.length) { row.classList.remove('cut-row'); return; }
        this._makeFilmControl(row, () => this.app.filmNavigation?.watch?.(refs, {
          label: row.dataset.cutLabel || 'Play call film',
        }));
      });
      root.querySelectorAll('.cut-row[data-cut-type]:not([data-season-film]):not([data-direct-film])').forEach(row => {
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
      if (report) stats._exportSelfScout(report, this.app.gameContext.snapshot().teamName || 'Our Offense');
    });
    root.querySelector('#btnExportDef')?.addEventListener('click', () => stats._exportDefensiveReport(stats.compute(this._defenseScopedPlays || undefined), this.app.gameContext.snapshot().teamName || 'Our Defense'));
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
