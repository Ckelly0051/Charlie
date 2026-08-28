import { h, render } from 'preact';
import { mountNativeReports } from './native-reports.jsx';
import { OverviewTab, OffenseTab, PlayersTab, DefenseTab, SpecialTeamsTab, SelfScoutTab, SeasonTab, MatchupTab, OpponentOverviewTab, OpponentOffenseTab, OpponentDefenseTab, OpponentSpecialTeamsTab, ReportPane } from './native-report-tabs.jsx';
import { Charts } from './charts.js';
import { buildDefenseHtmlReport, buildSelfScoutHtmlReport } from './html-report.js';

const REPORT_TABS = new Set(['overview', 'offense', 'defense', 'special', 'players', 'selfscout', 'season', 'matchup']);

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
  exportDefense(report, scoped) {
    if (!report?.total) return false;
    const stats = this.app.stats.compute(scoped);
    const defScout = this.app.stats.generateDefensiveSelfScout(scoped);
    const scopeLabel = this.defenseScope === 'season' ? 'Full season' : 'Current game';
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Defense';
    const html = buildDefenseHtmlReport({ title: `Defensive Report: ${team}`, report, stats, defScout, scopeLabel });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }), `defensive_report_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

  exportSelfScout(report, defScout, performance, callRows) {
    if (!report) return false;
    const team = this.app.gameContext?.snapshot?.()?.teamName || 'Our Offense';
    const html = buildSelfScoutHtmlReport({ title: `Self-Scout Report: ${team}`, report, defScout, performance, callRows });
    window.ffaSaveBlob(new Blob([html], { type: 'text/html' }), `self_scout_report_${new Date().toISOString().slice(0, 10)}.html`);
    return true;
  }

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

}
