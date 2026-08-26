import { h, render } from 'preact';
import { mountNativeReports } from './native-reports.jsx';
import { OverviewTab, OffenseTab, PlayersTab, DefenseTab, SpecialTeamsTab, SelfScoutTab, SeasonTab, MatchupTab, ReportPane } from './native-report-tabs.jsx';
import { Visualizations } from './visualizations.js';
import { Charts } from './charts.js';

const REPORT_TABS = new Set(['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']);

/**
 * Native Reports route controller.
 *
 * StatsEngine remains the only formula owner. This controller owns route markup,
 * report composition, actions, tabs, accessibility, and film bindings. There is
 * no legacy #statsDashboard node anywhere in the document, and no detached
 * fallback stand-in either — StatsEngine.dashboardEl is EXPLICITLY `null`
 * whenever this controller does not own a connected native target, and every
 * report-render entry point in StatsEngine refuses to run (fails loudly, not
 * silently) rather than compute a report into an absent/detached element. See
 * StatsEngine.setDashboardTarget()/_requireRenderTarget().
 */
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
    this.defenseScope = 'season';
    this.specialTeamsScope = 'season';
    this.matchupOpponent = '';
  }

  mount(host) {
    if (!host || !this.app.stats) return false;
    this._unmountNative();
    this.host = host;
    this._native = mountNativeReports({ host, screen: this });
    this.content = this._native.content;
    if (!this.content) return false;
    this.app.stats.setDashboardTarget(this.content);
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
    // No fallback to hand back -- the target is explicitly absent the moment
    // this controller no longer owns a connected one. StatsEngine's render
    // entry points fail closed (loudly) rather than rendering into nowhere.
    this.app.stats?.setDashboardTarget?.(null);
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
    const html = `<section class="gi-report-pane stats-section gi-reports-empty gi-reports-failure" role="alert"><h3>Reports unavailable</h3><p>${Charts._esc(message)}</p></section>`;
    if (this.content) { render(h(ReportPane, { tab: 'failure', html }), this.content); return; }
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
    const stats = this.app.stats;
    const data = stats?._kpiRailData?.(stats.compute());
    this._syncScorebug(data);
    if (this._mode !== 'main' || this.perspective !== 'self'
      || this.activeTab === 'season' || this.activeTab === 'overview') { rail.hidden = true; return; }
    if (!data || !data.totalPlays) { rail.hidden = true; return; }
    const esc = Charts._esc;
    const tile = (label, value, sub, tone) => `<div class="gi-kpi${tone ? ` is-${tone}` : ''}"><div class="gi-kpi-label">${esc(label)}</div><div class="gi-kpi-value">${esc(String(value))}</div>${sub ? `<div class="gi-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
    // A raw-HTML variant for the one tile whose value needs real markup
    // (the phase segments below), not another escaped string.
    const tileHtml = (label, valueHtml, sub, tone) => `<div class="gi-kpi${tone ? ` is-${tone}` : ''}"><div class="gi-kpi-label">${esc(label)}</div><div class="gi-kpi-value">${valueHtml}</div>${sub ? `<div class="gi-kpi-sub">${esc(sub)}</div>` : ''}</div>`;
    const score = data.finalScore ? `${data.finalScore.us}–${data.finalScore.them}` : '—';
    // Codex review of `d567f5c` (2026-08-17): "50O / 13D / 3ST" reads as
    // "500 / 13D / 3ST" at a glance, worse on mobile. Unambiguous literal
    // labels instead -- no digit run is ever adjacent to another digit.
    //
    // Coach (2026-08-17): the "O 29 · D 20 · ST 18" middot spacing read
    // uneven. Root cause: `font-variant-numeric:tabular-nums` fixes DIGIT
    // width but not the surrounding letters/dot/spaces, so a literal
    // "O 29 · D 20" string has no consistent rhythm -- each segment's own
    // proportional width differs from the tabular numbers inside it. Real
    // markup with flex `gap` and a CSS-drawn separator replaces the manual
    // spaces so the rhythm is even by construction, not by eyeballed spacing.
    //
    // Coach (2026-08-17, Charlie Gate): the pipe-joined single line clipped
    // to "O:29 | D:20 | ST:1..." -- text-based nowrap layout can always run
    // out of horizontal room at some tile width. Three fixed mini-columns
    // instead: label stacked above its number, using vertical space rather
    // than horizontal, so it cannot clip regardless of tile width -- there
    // is no overflow/ellipsis in this layout for a value to be lost to.
    const phaseCol = (label, n) => `<div class="gi-kpi-phase-col"><span class="gi-kpi-phase-l">${esc(label)}</span><span class="gi-kpi-phase-n">${esc(String(n))}</span></div>`;
    const phase = `<div class="gi-kpi-phase">${phaseCol('OFF', data.units.offense)}${phaseCol('DEF', data.units.defense)}${phaseCol('ST', data.units.special)}</div>`;
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
      tileHtml('Plays per Phase', phase),
      // Coach: "on-schedule" is commentary, not a definitional label.
      tile('Success Rate', success, 'offense'),
      turnoverTile,
    ].join('');
    rail.hidden = false;
  }

  _syncScorebug(data) {
    const bug = this.host?.querySelector('[data-reports-scorebug]');
    if (!bug) return;
    const visible = this._mode === 'main' && this.perspective === 'self'
      && this.activeTab === 'overview' && data?.totalPlays;
    if (!visible) { bug.hidden = true; return; }
    const esc = Charts._esc;
    const game = this.app.storage?.gameInfo || {};
    const context = this.app.workspace?.snapshot?.() || {};
    const computed = this.app.stats.compute();
    const tagged = computed.scoreboard || {};
    const scoreUs = game.scoreUs !== '' && game.scoreUs != null ? game.scoreUs : (tagged.us || 0);
    const scoreThem = game.scoreThem !== '' && game.scoreThem != null ? game.scoreThem : (tagged.them || 0);
    const team = context.team?.name || game.teamName || 'Our Team';
    const opponent = game.opponent || 'Opponent';

    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'].map(q => `<div class="gi-scorebug-quarter"><span>${q}</span><b>${tagged.byQuarter?.[q]?.us || 0}</b><i>${tagged.byQuarter?.[q]?.them || 0}</i></div>`).join('');
    const offense = computed.offPlays?.length || 0;
    const yards = (computed.rushing?.yards || 0) + (computed.passing?.yards || 0);
    const ypp = offense ? (yards / offense).toFixed(1) : '—';
    bug.innerHTML = `<div class="gi-scorebug-team"><span>${esc(team)}</span><strong>${esc(String(scoreUs))}</strong></div>

      <div class="gi-scorebug-team is-opponent"><span>${esc(opponent)}</span><strong>${esc(String(scoreThem))}</strong></div>
      <div class="gi-scorebug-line">${quarters}</div>
      <div class="gi-scorebug-story"><strong>${ypp}</strong><span><b>Yards per play.</b> ${yards} yards on ${offense} offensive snaps.</span></div>
      <div class="gi-scorebug-meta"><strong>${esc(context.game?.name || 'Current game')}</strong><span>${data.playsCharted} of ${data.totalPlays} plays charted</span></div>`;
    bug.hidden = false;
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
    const stats = ['overview', 'offense', 'players'].includes(tab) ? statsEngine.compute() : null;

    // Force a full unmount before mounting the next tab's tree. A LegacyHtml
    // pane mutates its own subtree directly (outside Preact's diff) so the
    // vdom's own record of "what's really there" can go stale relative to the
    // DOM the instant a legacy tab (Defense/Season/Matchup/Self-Scout) has
    // rendered; the very next migrated-component tab (Overview/Offense/
    // Players) is then diffed against that stale record instead of the real
    // DOM, and Preact can silently no-op the swap. Discarding the old tree
    // outright removes the ambiguity — every tab switch mounts fresh.
    render(null, this.content);

    // Overview, Offense, Players, and Defense are fully migrated real
    // components — every film action is a direct onClick, so these are the
    // branches that must NOT also run the legacy `_bindContent`
    // selector-rebind pass over them. `_offenseHtml`/`_playersHtml`/
    // `_defenseHtml` remain below, un-deleted: they are still the input the
    // parity harness diffs the new components against, and Season/exports/
    // the opponent tab still call their own StatsEngine render methods
    // directly (untouched by this migration).
    if (tab === 'overview') {
      render(h(ReportPane, { tab: 'overview' }, h(OverviewTab, { stats, screen: this })), this.content);
      return;
    }
    if (tab === 'offense') {
      render(h(ReportPane, { tab: 'offense' }, h(OffenseTab, { stats, screen: this })), this.content);
      return;
    }
    if (tab === 'players') {
      render(h(ReportPane, { tab: 'players' }, h(PlayersTab, { stats, screen: this })), this.content);
      return;
    }
    if (tab === 'defense') {
      const { scoped, labels } = this._defenseCohort();
      this._defenseScopedPlays = scoped;
      const report = statsEngine.defensivePerformance(scoped, labels);
      render(h(ReportPane, { tab: 'defense' }, h(DefenseTab, { report, scoped, screen: this })), this.content);
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

    let html = '';
    if (tab === 'season') {
      const model = this.app.season?.reportModel?.();
      render(h(ReportPane, { tab: 'season' }, h(SeasonTab, { model, screen: this })), this.content);
      return;
    }
    else if (tab === 'matchup') {
      const model = statsEngine.matchupReport(this.matchupOpponent);
      if (model.opponent) this.matchupOpponent = model.opponent.name;
      render(h(ReportPane, { tab: 'matchup' }, h(MatchupTab, { model, screen: this })), this.content);
      return;
    }
    else if (tab === 'selfscout') {
      const report = statsEngine.generateSelfScout();
      const defScout = report?.defScout || statsEngine.generateDefensiveSelfScout();
      const performance = statsEngine.compute();
      const callRows = statsEngine._selfScoutRows(statsEngine._selfScoutGroup(
        statsEngine._offensePlays(), play => play.tags.playCall || play.tags.playConcept || null
      ));
      render(h(ReportPane, { tab: 'selfscout' },
        h(SelfScoutTab, { report, defScout, performance, callRows, screen: this })), this.content);
      return;
    }
    render(h(ReportPane, { tab, html }), this.content);
    this._bindContent(this.content);
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
    render(h(ReportPane, { tab, html, opponent: true }), this.content);
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
    if (!stats.allPlays) return this._emptyHtml();
    return `<div class="gi-overview-board">
      ${this._overviewKpisHtml(stats)}
      <div class="gi-overview-band gi-overview-band-3 gi-overview-phase">
        ${this._overviewPhaseHtml(stats)}
        ${this._overviewSituationalHtml(stats)}
        ${this._overviewKeyMetricsHtml(stats)}
      </div>
      <div class="gi-overview-band gi-overview-band-3 gi-overview-production">
        ${this._overviewRushingHtml(stats)}
        ${this._overviewPassingHtml(stats)}
        ${this._overviewYardsHtml(stats)}
      </div>
      <div class="gi-overview-band gi-overview-band-2 gi-overview-decisions">
        ${this._overviewDownDistanceHtml(stats)}
        ${this._overviewGamePlanHtml(stats)}
      </div>
      <div class="gi-overview-band gi-overview-support">
        ${this._overviewBigPlaysHtml(stats)}
        <div class="gi-overview-support-stack">
          ${this._overviewDrivesHtml(stats)}
          ${this._overviewDefenseHtml(stats)}
        </div>
      </div>
    </div>`;
  }

  _overviewKpisHtml(stats) {
    const totalYards = stats.rushing.yards + stats.passing.yards;
    const yardsPerPlay = stats.offPlays.length ? (totalYards / stats.offPlays.length).toFixed(1) : '—';
    const penalty = stats.penalties || {};
    const giveaways = stats.turnovers?.giveaways ?? stats.offenseTurnovers ?? 0;
    const kpi = (label, value, sub, cls = '') => `<div class="gi-overview-kpi ${cls}"><span>${Charts._esc(label)}</span><strong>${Charts._esc(String(value))}</strong><small>${Charts._esc(sub)}</small></div>`;
    return `<div class="gi-overview-kpis">
      ${kpi('Total plays', stats.allPlays, `${stats.allPlays} charted · 100%`)}
      ${kpi('Success rate', `${stats.efficiency.successRate}%`, `${stats.efficiency.successfulPlays || 0} successful snaps`, 'is-good')}
      ${kpi('Yards / play', yardsPerPlay, `${totalYards} total yards`, 'is-gold')}
      ${kpi('Explosives', stats.efficiency.explosivePlays, `${stats.efficiency.explosivePct}% of snaps`)}
      ${kpi('Turnovers', giveaways, 'giveaways')}
      ${kpi('Plays for loss', stats.efficiency.negativePlays, `${stats.efficiency.negativePct}% of snaps`)}
      ${kpi('Penalties', penalty.hasData ? penalty.accepted : 0, penalty.hasData ? `${penalty.subjectYards} yards accepted` : 'none charted')}
    </div>`;
  }

  _overviewModule(title, meta, body, cls = '') {
    return `<section class="gi-overview-module ${cls}"><header><strong>${Charts._esc(title)}</strong>${meta ? `<span>${Charts._esc(meta)}</span>` : ''}</header>${body}</section>`;
  }

  _overviewRows(rows) {
    return `<div class="gi-overview-rows">${rows.map(([label, value, cls = '']) => `<div><span>${Charts._esc(label)}</span><strong class="${cls}">${Charts._esc(String(value))}</strong></div>`).join('')}</div>`;
  }

  _overviewPhaseHtml(stats) {
    const off = stats.offPlays.length;
    const def = stats.defPlays.length;
    const special = Math.max(0, stats.allPlays - off - def);
    const total = Math.max(1, off + def + special);
    const offYards = stats.rushing.yards + stats.passing.yards;
    const defYards = stats.defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage, 10) || 0), 0);
    const row = (label, count, ypp, cls) => `<tr class="${cls}"><td>${label}</td><td>${count}</td><td>${Math.round(count / total * 100)}%</td><td>${count ? ypp : '—'}</td></tr>`;
    return this._overviewModule('Snaps by phase', `${off + def + special} total`, `
      <div class="gi-phase-ramp"><i style="--n:${off}"></i><i style="--n:${def}"></i><i style="--n:${special}"></i></div>
      <table><thead><tr><th>Phase</th><th>Snaps</th><th>Share</th><th>Yds/play</th></tr></thead><tbody>
        ${row('Offense', off, off ? (offYards / off).toFixed(1) : '—', 'is-offense')}
        ${row('Defense', def, def ? `${(defYards / def).toFixed(1)} allowed` : '—', 'is-defense')}
        ${row('Special Teams', special, '—', 'is-special')}
      </tbody></table>`);
  }

  _overviewSituationalHtml(stats) {
    const tile = (label, item, type, value, sub) => {
      const attrs = item.total ? ` class="cut-row" data-cut-type="${type}" data-cut-val="${value}" data-cut-label="${label} — ${item.total} plays"` : '';
      return `<div${attrs}><span>${label}</span><strong>${item.total ? `${item.successPct}%` : '—'}</strong><small>${item.total ? sub(item) : 'No data'}</small></div>`;
    };
    const s = stats.situational;
    const third = stats.downs.byDown?.['3'] || { total: 0, conversionPct: 0 };
    return this._overviewModule('Situational', 'each tile opens film', `<div class="gi-overview-tiles">
      ${tile('Red zone', s.redZone, 'situation', 'redZone', item => `${item.tds} TD · ${item.total} snaps`)}
      ${tile('Goal line', s.goalLine, 'situation', 'goalLine', item => `${item.tds} TD · ${item.total} snaps`)}
      <div${third.total ? ` class="cut-row" data-cut-type="down" data-cut-val="3" data-cut-label="Third down — ${third.total} plays"` : ''}><span>Third down</span><strong>${third.total ? `${third.conversionPct}%` : '—'}</strong><small>${third.total ? stats.downs.thirdDownConv : 'No data'}</small></div>
      ${tile('3rd & long', s.thirdLong, 'situation', 'thirdLong', item => `${item.successes} of ${item.total}`)}
      ${tile('3rd & short', s.thirdShort, 'situation', 'thirdShort', item => `${item.successes} of ${item.total}`)}
      ${tile('Backed up', s.backedUp, 'situation', 'backedUp', item => `${item.successes} of ${item.total}`)}
    </div>`);
  }

  _overviewKeyMetricsHtml(stats) {
    const topFormation = stats.tendencies.formationList?.[0];
    const redZone = stats.situational.redZone;
    const metrics = [
      ['Efficiency', `${stats.efficiency.successRate}%`, 'Success rate'],
      ['Explosive', stats.efficiency.explosivePlays, `${stats.efficiency.explosivePct}% of snaps`],
      ['Situational', redZone.total ? `${redZone.successPct}%` : '—', redZone.total ? 'Red-zone success' : 'No red-zone snaps'],
      ['Tendencies', topFormation ? `${Math.round(topFormation.runs / topFormation.count * 100)}%` : '—', topFormation ? `${topFormation.name} run rate` : 'No formation sample'],
      ['Negative', stats.efficiency.negativePlays, `${stats.efficiency.negativePct}% of snaps`],
      ['Points / drive', stats.drives.pointsPerDrive, `${stats.drives.scoringDrives} of ${stats.drives.total} scored`],
    ];
    return this._overviewModule('Key metrics', 'five coaching lenses', `<div class="gi-overview-lenses">${metrics.map(([label, value, sub]) => `<div><span>${label}</span><strong>${value}</strong><small>${sub}</small></div>`).join('')}</div>`, 'is-lenses');
  }

  _overviewRushingHtml(stats) {
    const r = stats.rushing;
    return this._overviewModule('Rushing', `${r.attempts} attempts`, this._overviewRows([
      ['Attempts', r.attempts], ['Yards', r.yards], ['Average', r.average], ['Touchdowns', r.touchdowns, 'is-good'], ['Longest', r.longest], ['First downs', r.firstDowns], ['Fumbles', r.fumbles],
    ]), 'is-offense');
  }

  _overviewPassingHtml(stats) {
    const p = stats.passing;
    return this._overviewModule('Passing', `${p.attempts} attempts`, this._overviewRows([
      ['Completions / attempts', `${p.completions} / ${p.attempts}`], ['Completion rate', `${p.completionPct}%`], ['Yards', p.yards], ['Yards / attempt', p.average], ['Touchdowns', p.touchdowns, 'is-good'], ['Interceptions', p.interceptions], ['Longest', p.longest], ['Sacks taken', p.sacks],
    ]), 'is-offense');
  }

  _overviewYardsHtml(stats) {
    const total = stats.rushing.yards + stats.passing.yards;
    const playTypes = (stats.tendencies.playTypeList || []).slice(0, 5);
    const rows = playTypes.map(row => `<tr class="cut-row" data-cut-type="playType" data-cut-val="${Charts._esc(row.name)}" data-cut-label="${Charts._esc(row.name)} — ${row.count} plays"><td>${Charts._esc(row.name)}</td><td>${row.count}</td><td>${row.avg}</td><td>${row.successPct}%</td></tr>`).join('');
    return this._overviewModule('Yards by type', `${total} total`, `
      <div class="gi-yards-split"><i style="--n:${Math.max(0, stats.rushing.yards)}"></i><i style="--n:${Math.max(0, stats.passing.yards)}"></i></div>
      <div class="gi-yards-legend"><span>Rush ${stats.rushing.yards}</span><span>Pass ${stats.passing.yards}</span></div>
      <table><thead><tr><th>Play type</th><th>Snaps</th><th>Yds/play</th><th>Success</th></tr></thead><tbody>${rows}</tbody></table>`, 'is-offense');
  }

  _overviewDownDistanceHtml(stats) {
    // Overview follows the approved broadcast-density composition. Keep the
    // five highest-priority situations here; the full table remains in the
    // detailed offense report.
    const buckets = (stats.downs.ddBuckets || []).slice(0, 5);
    const labels = { '1': '1st', '2': '2nd', '3': '3rd', '4': '4th' };
    const rows = buckets.map(row => `<tr class="cut-row" data-cut-type="dd" data-cut-val="${row.down}|${row.bucket}" data-cut-label="${labels[row.down]} & ${row.bucket} — ${row.count} plays"><td>${labels[row.down]} &amp; ${row.bucket}</td><td>${row.count}</td><td><span class="gi-mini-mix"><i style="--n:${row.runPct}"></i><i style="--n:${row.passPct}"></i></span>${row.runPct} / ${row.passPct}</td><td>${row.avgYards}</td><td>${row.succPct}%</td><td>${row.convPct}%</td></tr>`).join('');
    return this._overviewModule('Down & distance', 'run/pass mix and production', `<table><thead><tr><th>Situation</th><th>Snaps</th><th>Run / pass</th><th>Yds/play</th><th>Success</th><th>Conv</th></tr></thead><tbody>${rows}</tbody></table>`);
  }

  _overviewGamePlanHtml(stats) {
    const t = stats.takeaways || {};
    const plainText = value => String(value || '').replace(/<[^>]+>/g, '');
    const list = (items, cls) => `<div class="gi-overview-plan ${cls}">${(items || []).slice(0, 3).map(item => `<p${item.cut ? ` class="cut-row" data-cut-type="${item.cut[0]}" data-cut-val="${Charts._esc(item.cut[1])}" data-cut-label="Game plan"` : ''}>${Charts._esc(plainText(item.text))}</p>`).join('')}</div>`;
    return this._overviewModule('Game plan', 'what the tags say', `${list(t.working, 'is-good')}${list(t.fix, 'is-fix')}`, 'is-plan');
  }

  _overviewBigPlaysHtml(stats) {
    const playsById = new Map((stats.offPlays || []).map(play => [String(play.id), play]));
    const rows = (stats.bigPlays || []).slice(0, 8).map(play => {
      const source = playsById.get(String(play.id));
      return `<tr class="gi-overview-play" data-overview-play-id="${play.id}"><td>${play.id}</td><td>${Charts._esc(this.app.stats.constructor.situationLabel(source) || '—')}</td><td>${Charts._esc(play.type || '—')}</td><td>${play.yards}</td></tr>`;
    }).join('');
    return this._overviewModule('Big plays', `${stats.bigPlays.length} total`, `<table><thead><tr><th>Play</th><th>Situation</th><th>Call</th><th>Yds</th></tr></thead><tbody>${rows}</tbody></table>`, 'is-offense');
  }

  _overviewDrivesHtml(stats) {
    const drives = stats.drives?.list || [];
    const max = Math.max(1, ...drives.map(drive => Math.abs(drive.yards)));
    const rows = drives.slice(0, 8).map(drive => `<div class="drive-row gi-overview-drive" data-drive-ids="${(drive.playIds || []).join(',')}"><span>D${drive.number}</span><i><b style="--w:${Math.max(6, Math.round(Math.abs(drive.yards) / max * 100))}%"></b></i><small>${drive.outcome}</small></div>`).join('');
    return this._overviewModule('Drives', `${drives.length} drives · ${stats.drives.scoringDrives} scored`, `<div class="gi-overview-drives">${rows}</div>`);
  }

  _overviewDefenseHtml(stats) {
    const def = stats.defPlays.length;
    const yards = stats.defPlays.reduce((sum, play) => sum + (parseInt(play.tags.yardage, 10) || 0), 0);
    const stops = stats.defPlays.filter(play => !this.app.stats._isSuccessfulPlay(play)).length;
    const explosives = stats.defPlays.filter(play => { const y = parseInt(play.tags.yardage, 10) || 0; return this.app.stats.constructor.isRun(play) ? y >= 12 : y >= 16; }).length;
    const penalties = stats.penalties || {};
    return this._overviewModule('Defense & discipline', `${def} defensive snaps`, this._overviewRows([
      ['Yards / play allowed', def ? (yards / def).toFixed(1) : '—'], ['Stop rate', def ? `${Math.round(stops / def * 100)}%` : '—', 'is-good'], ['Explosives allowed', explosives, explosives ? '' : 'is-good'], ['Takeaways', stats.defensive.turnovers], ['Penalties accepted', penalties.hasData ? `${penalties.accepted} · ${penalties.subjectYards} yds` : '0'], ['Penalties declined', penalties.hasData ? penalties.declined : '0'],
    ]), 'is-defense');
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

  /** Report-level cohort logic (game/opponent-scout scoping), not a football
   *  formula -- StatsEngine consumes the resulting play list, it doesn't
   *  compute which plays belong in it. Extracted so Defense and Special
   *  Teams (each with their own independent season/game scope toggle) share
   *  ONE cohort-building implementation and can never scope differently by
   *  accident -- only the caller-supplied `scope` differs. */
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
   *  by both the migrated DefenseTab component and the legacy `_defenseHtml()`
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

  _defenseHtml() {
    const engine = this.app.stats;
    const { scoped, labels } = this._defenseCohort();
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
    // Charlie Gate finding #5: a Best Calls table dominated by "Not enough
    // snaps" rows is a large decision table mostly reporting the absence of
    // a decision. Qualified rows (at least one real front/coverage/pressure
    // answer) lead the table; opponent play types with NO qualified answer
    // at all collapse behind one disclosure line instead of one dead row
    // each. No row is hidden that has anything to show -- a row with even a
    // single real answer still renders normally.
    const qualifiedAnswers = report.answers.filter(row => row.front || row.coverage || row.pressure);
    const emptyAnswers = report.answers.filter(row => !row.front && !row.coverage && !row.pressure);
    const answerRows = qualifiedAnswers.map(row => `<tr><td><strong>${esc(row.playType)}</strong><small>${row.n} snaps</small></td><td>${answerCell(row.front)}</td><td>${answerCell(row.coverage)}</td><td>${answerCell(row.pressure)}</td></tr>`).join('');
    const answerEmptyNote = emptyAnswers.length
      ? `<p class="viz-caption">${emptyAnswers.length} more opponent play type${emptyAnswers.length === 1 ? '' : 's'} (${emptyAnswers.map(row => esc(row.playType)).join(', ')}) didn't have enough snaps for a best-answer call yet.</p>`
      : '';
    const gameRows = report.byGame.map(row => `<tr ${filmAttrs(row, `${row.name} defense`)}><td><strong>${esc(row.name)}</strong></td><td>${row.n}</td><td>${row.yardsPerPlay.toFixed(1)}</td><td>${row.stopRate}%</td><td>${row.explosives}</td><td>${row.havoc}</td><td>${row.touchdowns}</td></tr>`).join('');
    const sitRows = report.situations.map(row => `<tr ${filmAttrs(row, `${row.name} defense`)}><td><strong>${esc(row.name)}</strong></td><td>${row.n}</td><td>${row.yardsPerPlay.toFixed(1)}</td><td>${row.stopRate}%</td><td>${row.explosiveRate}%</td><td>${row.havocRate}%</td></tr>`).join('');
    const scopedStats = engine.compute(scoped);
    const defScout = engine.generateDefensiveSelfScout(scoped);
    return `<div class="gi-defense-report">
      <div class="gi-def-toolbar"><div class="gi-def-scope" role="group" aria-label="Defense report scope"><button type="button" data-defense-scope="season" class="${this.defenseScope === 'season' ? 'active' : ''}">Full season</button><button type="button" data-defense-scope="game" class="${this.defenseScope === 'game' ? 'active' : ''}">Current game</button></div><button class="btn btn-sm" id="btnExportDef">Export Report</button></div>
      <section class="stats-section"><h3>Defensive Performance</h3><div class="gi-def-kpis">${metric('Defensive Snaps', report.total)}${metric('Yards / Play Allowed', report.summary.yardsPerPlay.toFixed(1))}${metric('Stop Rate', pct(report.summary.stopRate))}${metric('Explosives Allowed', report.summary.explosives, `${report.summary.explosiveRate}%`)}${metric('3rd Down Stop Rate', pct(report.thirdDownStopRate))}${metric('Red Zone TD Rate', pct(report.redZoneTdRate))}${metric('Takeaways', report.takeaways)}${metric('Havoc Rate', pct(report.summary.havocRate))}</div></section>
      <section class="stats-section"><h3>Opponent Offense by Play Type</h3><div class="gi-def-type-totals">${typeSummaryHtml}</div><div class="gi-def-table-wrap"><table class="stats-table stats-table-full gi-def-type"><thead><tr><th>Play Run Against Us</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive Rate</th><th>Havoc Rate</th><th>TD Allowed</th></tr></thead><tbody>${typeRows}</tbody></table></div></section>
      ${qualifiedAnswers.length ? `<section class="stats-section"><h3>Best Calls by Opponent Play Type</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full gi-def-answers"><thead><tr><th>Opponent Play Type</th><th>Best Front</th><th>Best Coverage</th><th>Blitz Decision</th></tr></thead><tbody>${answerRows}</tbody></table></div>${answerEmptyNote}</section>` : (answerEmptyNote ? `<section class="stats-section"><h3>Best Calls by Opponent Play Type</h3>${answerEmptyNote}</section>` : '')}
      <!-- Charlie Gate finding #4: pairing Game Trend with the taller
           Situational Defense table in a fixed two-column row left the
           shorter side (usually Game Trend -- one row per game, often just
           1-6 rows) with a large empty half-panel below it. Stacked full
           width instead; each table is exactly as tall as its own content. -->
      <section class="stats-section"><h3>Game Trend</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full"><thead><tr><th>Game</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive</th><th>Havoc</th><th>TD</th></tr></thead><tbody>${gameRows}</tbody></table></div></section>
      <section class="stats-section"><h3>Situational Defense</h3><div class="gi-def-table-wrap"><table class="stats-table stats-table-full"><thead><tr><th>Situation</th><th>Snaps</th><th>Yds/Play</th><th>Stop Rate</th><th>Explosive</th><th>Havoc</th></tr></thead><tbody>${sitRows}</tbody></table></div></section>
      <section class="stats-section"><h3>Scheme Detail</h3>${engine._renderDefensive(scopedStats)}</section>
      ${engine._defScoutBlock(defScout, false, true)}
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
      // `data-defense-scope`/`data-defense-refs` had no other producer than
      // `_defenseHtml()`'s own markup; now that Defense is a migrated
      // component (DefenseTab, wired with real onClick via Watchable/
      // WatchableRefs) that markup never reaches `_bindContent`, so the two
      // forEach passes that used to bind those attributes here are deleted
      // rather than left as dead wiring nothing can trigger.
      // ── H16 — SEASON ROWS FILM THE SEASON, NOT THE ACTIVE GAME ─────────────
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
      root.querySelectorAll('[data-overview-play-id]').forEach(row => {
        const id = String(row.dataset.overviewPlayId || '');
        if (id) this._makeFilmControl(row, () => stats._watchPlays(
          play => String(play.id) === id, `Play ${id}`));
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
