import { isPlayTagged } from './football-rules.js';

/**
 * The one native application shell.
 *
 * S7 demolition: `#app` and `#wsClassicOutlet` are gone. The tagging domain,
 * Film Room grid, and Reports' legacy render target live permanently in
 * `#giLegacyEngineHost` (a sibling of `#giMediaHost`), outside this shell's
 * own root — real backing stores the domain engines still read/write
 * directly, not a second visible surface.
 *
 * Final Engine Independence: the top-bar chrome that used to live in
 * `#giLegacyEngineHost` (Undo/Redo/Shortcuts/Settings) is gone too. This
 * shell's own `.ws-global-tools` buttons are real Preact-free but genuinely
 * native DOM this class owns and renders itself, calling the underlying
 * services (`app.history`, `app.shortcutsScreen`, `app.settingsScreen`)
 * directly — no legacy element is adopted, relocated, or `.click()`-proxied.
 */
export class WorkspaceShell {
  constructor(app) {
    this.app = app;
    this.root = null;
    this._homeToken = 0;
    this._homeSelectedGameId = null;
    this._homeFilmHealth = new Map();
    this._btnUndo = null;
    this._btnRedo = null;
    this._historyUnsub = null;
  }
  // The redesigned workspace is THE product — there is no classic-layout escape
  // hatch and no second game-entry route (C1, binding amendment 2026-07-23). The
  // shell mounts unconditionally on every build.
  async init() { await this.enable(); }
  async enable() {
    // Kept as a compatibility signal: breakdown-form/breakdown-video read this
    // key to know the redesigned workspace is active. The shell itself no longer
    // gates on it — it is always on — but writing it keeps those modules enabled
    // with zero change to their own logic (and joins the browser build to the
    // one product). Nothing clears it; there is no flag-off state.
    try { localStorage.setItem('ffa_workspace_shell_v2', '1'); } catch {}
    if (!this.root) this._mount();
    // Idempotent: no-ops when already mounted. Required because disable() now
    // genuinely tears the presentation down, so re-enabling must rebuild it.
    // BOTH must be re-mounted here: each module's own constructor-time
    // enabled() check runs BEFORE the key written just above exists (app.js
    // constructs them at :73/:118 but calls shell.init() at :207), so on a
    // fresh profile the first session would otherwise get the shell wrapped
    // around the CLASSIC tag form — visible on the browser build and on any
    // desktop version string that beta-config does not pre-seed.
    if (!this.app.breakdownTheater?._mounted) this.app.breakdownVideo?.mount();
    this.app.breakdownForm?.mount();
    document.body.classList.add('ws-shell-active');
    await this.show(this.app.workspace.currentRoute() || 'home');
  }
  // Internal lifecycle only — the tested mount/restore teardown contract (proves
  // the shell rebuilds cleanly with no leaked listeners/subscriptions). NOT a
  // product path: there is no user affordance that reaches it.
  disable() {
    if (!this.root) return;
    this._homeToken++;
    // Order matters: breakdownVideo un-mounts its chrome from .video-section
    // BEFORE breakdownWorkspace tears down — both park their media in the
    // permanent #giMediaHost, not a container this shell owns.
    this.app.breakdownVideo?.restore();
    this.app.reportsScreen?.restore();
    this.app.teamHubScreen?.restore();
    this.app.breakdownWorkspace?.restore();
    this._historyUnsub?.(); this._historyUnsub = null;
    this._btnUndo = null; this._btnRedo = null;
    this.root.remove(); this.root = null;
    document.body.classList.remove('ws-shell-active', 'ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-reports', 'ws-route-plan', 'ws-route-team-hub');
  }
  _mount() {
    const root = document.createElement('div');
    root.id = 'workspaceShell'; root.className = 'ws-shell';
    root.innerHTML = `<main class="ws-main"><header class="ws-topbar"><button class="ws-top-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><nav class="ws-top-nav" aria-label="Workspace">${this._navButtons()}</nav><div class="ws-top-actions"><span class="ws-film-chip" id="wsTopFilm">No film selected</span><div class="ws-global-tools"></div><button class="ws-icon-btn ws-more-btn" id="btnNativeMore" data-ws-action="more" aria-haspopup="menu" aria-expanded="false">More <span aria-hidden="true">▾</span></button></div></header>
      <section class="ws-contextbar" id="wsContextBar" aria-label="Football context">
        <button class="ws-ctx" id="wsCtxProgram" data-ws-action="program-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Program</span><span class="ws-ctx-value" id="wsCtxProgramValue">Team</span><b class="ws-ctx-chev" aria-hidden="true">▾</b></button>
        <button class="ws-ctx" id="wsCtxSeason" data-ws-action="season-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Season</span><span class="ws-ctx-value" id="wsCtxSeasonValue">No season open</span><b class="ws-ctx-chev" aria-hidden="true">▾</b></button>
        <button class="ws-ctx" id="wsCtxGame" data-ws-action="game-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Game</span><span class="ws-ctx-value" id="wsCtxGameValue">Team home</span><b class="ws-ctx-chev" aria-hidden="true">▾</b></button>
        <div class="ws-workspace-switch" role="group" aria-label="Workspace"><button type="button" data-ws-action="workspace-program" aria-pressed="true">Our Program</button><button type="button" class="is-scout" data-ws-action="workspace-scout" aria-pressed="false">Opponent Scout</button></div>
      </section>
      <header class="ws-mobile-head"><button class="ws-mobile-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><strong id="wsMobileContext">Team home</strong><button class="ws-icon-btn" id="btnNativeMoreMobile" data-ws-action="more" aria-label="Settings and more" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
      <section class="ws-home" id="wsHome">
        <div class="ws-home-head"><div><div class="ws-eyebrow" id="wsHomeEyebrow">Our Program / Season Home</div><h1 id="wsGreeting">HOME</h1><p id="wsHomeSummary">Choose a season to get started.</p></div><div class="ws-home-actions"><button class="ws-btn" data-ws-action="settings">Team &amp; Film Settings</button><button class="ws-btn ws-primary" data-ws-action="new-game">+ Add game</button></div></div>
        <div class="ws-season-rail" id="wsSeasonRail" hidden><div class="ws-metric"><label id="wsRailPrimaryLabel">Season record</label><strong id="wsRailRecord">—</strong></div><div class="ws-metric"><label>Games</label><strong id="wsRailGames">0</strong></div><div class="ws-metric"><label>Plays charted</label><strong id="wsRailPlays">0</strong></div><div class="ws-metric"><label>Charting</label><strong id="wsRailPct">0%</strong></div><div class="ws-metric"><label>Film health</label><strong class="ws-metric-small" id="wsRailFilm">—</strong></div><div class="ws-metric"><label>Last opened</label><strong class="ws-metric-small" id="wsRailOpened">—</strong></div></div>
        <div class="ws-workspace-grid">
          <section class="ws-games-col"><div class="ws-section-head"><h2 id="wsGamesHeading">Games</h2><button class="ws-link" data-ws-action="season-report">Season report →</button></div><div class="ws-game-list" id="wsGameList"></div>
            <div class="ws-continue-row"><div class="ws-continue-block"><span class="ws-mini-label">Continue where you left off</span><strong id="wsContinueTitle">No game open</strong><small id="wsContinueMeta">Open a season to continue.</small><div class="ws-mini-progress"><i id="wsProgressBar"></i></div></div><div class="ws-continue-block"><span class="ws-mini-label" id="wsSeasonProgressLabel">Season progress</span><strong id="wsSeasonProgressTitle">No plays charted</strong><small id="wsSeasonProgressMeta">Add a game to get started.</small><div class="ws-mini-progress"><i id="wsSeasonProgressBar" class="is-season"></i></div></div></div>
          </section>
          <aside class="ws-detail" id="wsGameDetail"><div class="ws-section-head"><h2 id="wsDetailHeading">Selected game</h2><button class="ws-link" data-ws-action="settings">Game settings</button></div>
            <div class="ws-detail-empty" id="wsDetailEmpty">No games in the active season.</div>
            <div class="ws-detail-body" id="wsDetailBody" hidden>
              <div class="ws-opponent"><div class="ws-badge" id="wsDetailBadge">GI</div><div><h3 id="wsDetailName">Opponent</h3><p id="wsDetailMeta">Week · Date</p></div></div>
              <div class="ws-score"><div><label id="wsDetailUsLabel">Us</label><strong id="wsDetailUsScore">—</strong></div><span class="ws-dash">-</span><div class="ws-score-them"><label id="wsDetailThemLabel">Them</label><strong id="wsDetailThemScore">—</strong></div></div>
              <div class="ws-facts"><div class="ws-fact"><label>Total plays</label><strong id="wsFactPlays">0</strong></div><div class="ws-fact"><label>Plays charted</label><strong id="wsFactCharted">0 / 0</strong></div><div class="ws-fact"><label>Plays per phase</label><strong id="wsFactPhase">O 0 · D 0 · ST 0</strong></div><div class="ws-fact"><label>Film</label><strong id="wsFactFilm" class="ws-fact-green">—</strong></div></div>
              <div class="ws-phase"><div class="ws-phase-head"><span>Charting by phase</span><span>Complete</span></div><ul id="wsPhaseRows" class="ws-phase-rows"></ul></div>
              <div class="ws-detail-actions"><button class="ws-btn ws-gold" id="wsContinueCharting" disabled>Continue charting</button><button class="ws-btn" data-ws-action="open-study">Open Study</button><button class="ws-btn" data-ws-action="open-reports">Open Reports</button></div>
            </div>
          </aside>
        </div>
      </section>
      <section class="ws-team-hub" id="wsTeamHub" hidden></section><section class="ws-breakdown" id="wsBreakdown" hidden></section><section class="ws-study" id="wsStudy" hidden></section><section class="ws-reports" id="wsReports" hidden></section><section class="ws-plan-state" id="wsPlan" hidden></section></main><nav class="ws-mobile-nav" aria-label="Workspace">${this._navButtons()}</nav>`;
    document.body.appendChild(root);
    this.root = root;
    this._mountChrome();
    this.app.breakdownWorkspace?.mount(root.querySelector('#wsBreakdown'));
    this.app.studyScreen?.mount(root.querySelector('#wsStudy'));
    this.app.reportsScreen?.mount(root.querySelector('#wsReports'));
    this.app.planScreen?.mount(root.querySelector('#wsPlan'));
    this.app.teamHubScreen?.mount(root.querySelector('#wsTeamHub'));
    this._bind();
  }
  // The `|| '•'` is load-bearing, not defensive noise: adding the Reports route
  // without adding its icon rendered the literal string "undefined" in all three
  // navs (coach smoke, 2026-07-25). A missing icon must degrade to a neutral
  // glyph, never leak a JS value into the UI.
  _navButtons() { const icons = { home:'⌂', breakdown:'▶', study:'▦', reports:'▥', plan:'▤' }; return this.app.workspace.listRoutes().map(r => `<button data-ws-route="${r.id}"><span>${icons[r.id] || '•'}</span>${r.name}</button>`).join(''); }
  _bind() {
    this.root.addEventListener('click', async e => {
      const route = e.target.closest('[data-ws-route]')?.dataset.wsRoute;
      if (route) { e.preventDefault(); await this.show(route); return; }
      const tool = e.target.closest('[data-ws-tool]');
      if (tool) {
        const key = tool.dataset.wsTool;
        if (key === 'undo') { this.app.history?.undoAll(); return; }
        if (key === 'redo') { this.app.history?.redoAll(); return; }
        if (key === 'shortcuts') { this.app.shortcutsScreen?.open?.(tool); return; }
        if (key === 'settings') { this.app.settingsScreen?.open?.({ returnFocus: tool }); return; }
        return;
      }
      const action = e.target.closest('[data-ws-action]')?.dataset.wsAction;
      if (action === 'workspace-program' || action === 'workspace-scout') {
        const mode = action === 'workspace-scout' ? 'scout' : 'program';
        await this.app.teamHubScreen?.selectWorkspace?.(mode);
        await this._openLibrary();
        return;
      }
      if (action === 'seasons') await this._openLibrary();
      if (action === 'new-game') { await this._newGame(); return; }
      if (action === 'settings') this.app.settingsScreen?.open?.({ returnFocus: e.target.closest('[data-ws-action]') });
      if (action === 'more') { this._openMore(e.target.closest('[data-ws-action]')); return; }
      if (action === 'game-switch') { await this._openGameSwitch(e.target.closest('[data-ws-action]')); return; }
      if (action === 'program-switch') { await this._openProgramSwitch(e.target.closest('[data-ws-action]')); return; }
      if (action === 'season-switch') { await this._openSeasonSwitch(e.target.closest('[data-ws-action]')); return; }
      if (action === 'season-report') { await this.show('reports'); return; }
      // Open Study / Open Reports act on the PREVIEWED game, not whichever
      // game happens to already be active -- routed through the one
      // authoritative App.openGame() seam (same as Continue Charting), so
      // the coach lands on their own preview's analysis, never a stale
      // active game's. No preview selected (defensive only -- these buttons
      // live inside the hidden-until-selected detail body) falls back to a
      // plain route switch rather than silently doing nothing.
      if (action === 'open-study') { if (this._homeSelectedGameId) await this.app.openGame(this._homeSelectedGameId, { route: 'study' }); else await this.show('study'); return; }
      if (action === 'open-reports') { if (this._homeSelectedGameId) await this.app.openGame(this._homeSelectedGameId, { route: 'reports' }); else await this.show('reports'); return; }
      const previewId = e.target.closest('[data-ws-preview]')?.dataset.wsPreview;
      if (previewId) { this._selectHomeGame(previewId); return; }
      const continueBtn = e.target.closest('#wsContinueCharting');
      if (continueBtn && !continueBtn.disabled && this._homeSelectedGameId) { await this.app.openGame(this._homeSelectedGameId); return; }
    });
  }
  async show(routeId) {
    if (!this.root) return { ok:false, reason:'shell-disabled' };
    const previousRoute = this.app.workspace.currentRoute();
    const result = this.app.workspace.navigate(routeId); this._syncChrome(); if (!result.ok) return result;
    if (routeId !== 'breakdown') {
      this.app.cutupPlayer?.stop();
      if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    }
    this.app.teamHubScreen?.hide();
    document.body.classList.remove('ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-reports', 'ws-route-plan', 'ws-route-team-hub');
    document.body.classList.add(`ws-route-${routeId}`);
    this.root.dataset.route = routeId;
    this.root.querySelectorAll('[data-ws-route]').forEach(b => b.classList.toggle('active', b.dataset.wsRoute === routeId));
    this._setRouteVisibility(routeId);
    if (routeId==='home') {
      // A preview belongs only to the current Home visit. Returning from a game
      // must highlight the canonical active game, not the prior Home preview.
      if (previousRoute !== 'home') this._homeSelectedGameId = null;
      await this.refreshHome();
    }
    if (routeId==='breakdown') { this.app.stats?.hideDashboard(); }
    if (routeId==='study') { this.app.stats?.hideDashboard(); this.app.studyScreen?.show(); }
    if (routeId==='reports') { this.app.reportsScreen?.show(); this.app._markSeenStats?.(); }
    if (routeId==='plan') { this.app.stats?.hideDashboard(); this.app.planScreen?.show(); }
    return result;
  }
  /** Re-apply the CURRENT route's visibility with NO navigation side effects.
   *
   * Historical note (coach smoke, 2026-07-24): this used to also manage a
   * `#wsClassicOutlet` that could be left visible underneath the shell —
   * S7 deleted that outlet and `#app` with it, so there is nothing left to
   * leak. Kept as route-visibility-only, since callers still need a
   * non-navigating re-apply (`show()` calls `library.hide()`, which calls
   * this — routing through `show()` would recurse). */
  restoreRouteVisibility() {
    if (!this.root) return;
    this._setRouteVisibility(this.app.workspace.currentRoute() || 'home');
  }
  _routeHosts() {
    if (!this.root) return {};
    return {
      hub: this.root.querySelector('#wsTeamHub'),
      home: this.root.querySelector('#wsHome'),
      breakdown: this.root.querySelector('#wsBreakdown'),
      study: this.root.querySelector('#wsStudy'),
      reports: this.root.querySelector('#wsReports'),
      plan: this.root.querySelector('#wsPlan'),
    };
  }
  _setRouteVisibility(routeId) {
    Object.entries(this._routeHosts()).forEach(([id, host]) => {
      if (host) host.hidden = id !== routeId;
    });
  }
  /** UX-2/V2-A: three persistent context selectors, not one breadcrumb button.
   *  All three read the SAME canonical `WorkspaceContext.snapshot()` this class
   *  already used for the old single breadcrumb — no new context pointer. */
  _isScoutWorkspace() {
    const store = this.app.storage?.seasonStore;
    if (store?.hasCurrent?.()) return store.data?.kind === 'scout';
    try { return localStorage.getItem('giq_home_workspace') === 'scout'; } catch { return false; }
  }
  _syncChrome() {
    if (!this.root) return;
    const c = this.app.workspace.snapshot();
    const scout = this._isScoutWorkspace();
    const scoutTarget = String(this.app.storage?.seasonStore?.data?.scout?.opponent || '').trim();
    this._text('wsCtxProgramValue', c.team?.name || 'Set up team');
    this._text('wsCtxSeasonValue', c.season?.name || 'No season open');
    this._text('wsCtxGameValue', c.game?.name || (scout ? `${scoutTarget || 'Opponent'} scout` : 'Team home'));
    this._text('wsMobileContext', c.game?.name || c.season?.name || (scout ? 'Opponent scout' : 'Team home'));
    const seasonBtn = this.root.querySelector('#wsCtxSeason'); if (seasonBtn) seasonBtn.disabled = !c.team;
    const gameBtn = this.root.querySelector('#wsCtxGame'); if (gameBtn) gameBtn.disabled = !c.season;
    this.root.querySelectorAll('[data-ws-action="workspace-program"],[data-ws-action="workspace-scout"]').forEach(button => {
      const active = scout ? button.dataset.wsAction === 'workspace-scout' : button.dataset.wsAction === 'workspace-program';
      button.classList.toggle('is-active', active);
      button.setAttribute('aria-pressed', String(active));
    });
    this.root.querySelectorAll('[data-ws-route="breakdown"]').forEach(b => b.disabled = !c.capabilities.canBreakDown);
    this.root.querySelectorAll('[data-ws-route="study"],[data-ws-route="reports"],[data-ws-route="plan"]').forEach(b => b.disabled = !c.capabilities.canStudy);
  }
  /** V2-A season command center. Rewrites the whole Home surface to the
   *  approved canon (design-comps/home-context-v2a-2026-08/home.html): a
   *  page-head, a season-record rail, a whole-row-clickable games list, and a
   *  selected-game detail panel — replacing the old two-band (Film Inbox /
   *  Seasons) layout, whose season-switching role now belongs to the Season
   *  context selector (_openSeasonSwitch). Same canonical sources as before
   *  (`WorkspaceContext.snapshot()`, `SeasonStore.data`, `WorkspaceContext.
   *  filmHealth()`) — no new context pointer. */
  async refreshHome() {
    if (!this.root) return;
    const token = ++this._homeToken;
    this._syncChrome();
    const c = this.app.workspace.snapshot();
    const store = this.app.storage.seasonStore;
    const data = store.data;
    const games = data?.games || [];
    const game = data ? store.activeGame?.() : null;
    const scout = this._isScoutWorkspace();
    const scoutTarget = String(data?.scout?.opponent || '').trim();
    const workspaceName = scoutTarget || c.season?.name || 'Opponent';
    const record = scout ? { text: workspaceName } : this._seasonRecord(games, store);

    this._text('wsHomeEyebrow', scout ? 'Opponent Scout / Film Library' : (c.team ? 'Our Program / Season Home' : 'Team workspace'));
    this._text('wsGreeting', c.season ? (scout ? `${workspaceName.toUpperCase()} SCOUT` : c.season.name.toUpperCase()) : (c.team ? `${c.team.name.toUpperCase()} HOME` : 'TEAM HOME'));
    this._text('wsHomeSummary', c.season
      ? (scout ? `${games.length} source game${games.length === 1 ? '' : 's'} · isolated from our schedule and team totals` : [c.team?.name, record.text, `${games.length} game${games.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))
      : (c.team ? 'Choose or create a season to get started.' : 'Set up your team to get started.'));
    this._text('wsRailPrimaryLabel', scout ? 'Opponent' : 'Season record');
    this._text('wsGamesHeading', scout ? 'Source games' : 'Games');
    this._text('wsDetailHeading', scout ? 'Selected source game' : 'Selected game');
    this._text('wsSeasonProgressLabel', scout ? 'Scout progress' : 'Season progress');
    const addButton = this.root.querySelector('[data-ws-action="new-game"]');
    if (addButton) addButton.textContent = scout ? '+ Add source game' : '+ Add game';

    const rail = this.root.querySelector('#wsSeasonRail');
    if (rail) rail.hidden = !c.season;
    const list = this.root.querySelector('#wsGameList');
    if (!c.season || !games.length) {
      this._homeSelectedGameId = null;
      this._renderGameDetail(null, c);
      if (list) list.innerHTML = `<div class="ws-empty">${c.season ? (scout ? 'No source games yet. Add film the opponent played against another team.' : 'No games in the active season yet.') : (c.team ? 'Open or create a season to see games here.' : 'Set up your team, then start a season.')}</div>`;
      this._setTopFilm(null);
      if (rail) {
        this._text('wsRailRecord', scout ? workspaceName : '—');
        this._text('wsRailGames', '0'); this._text('wsRailPlays', '0'); this._text('wsRailPct', '0%');
        this._text('wsRailFilm', '—'); this._text('wsRailOpened', '—');
      }
      return;
    }

    this._text('wsRailRecord', record.text);
    this._text('wsRailGames', String(games.length));
    const totalPlays = games.reduce((n, g) => n + (g.plays?.length || 0), 0);
    const totalCharted = games.reduce((n, g) => n + (g.plays || []).filter(isPlayTagged).length, 0);
    this._text('wsRailPlays', String(totalCharted));
    this._text('wsRailPct', `${totalPlays ? Math.round(totalCharted / totalPlays * 100) : 0}%`);
    this._text('wsRailOpened', game ? this._gameName(game) : 'No source game opened yet');
    const selected = games.find(g => String(g.id) === String(this._homeSelectedGameId)) || game || games[0];
    this._homeSelectedGameId = String(selected.id);
    this._homeFilmHealth.clear();
    this._renderGameDetail(selected, c);
    list.innerHTML = games.map(g => this._gameRowHtml(g, c)).join('');
    const health = await Promise.all(games.map(g => this.app.workspace.filmHealth(g).catch(() => ({ state: 'missing', label: 'Film unavailable', action: 'repair', expected: 0, found: 0 }))));
    if (token !== this._homeToken || !this.root || c.season?.id !== this.app.workspace.snapshot().season?.id) return;
    games.forEach((g, i) => { this._homeFilmHealth.set(String(g.id), health[i]); this._renderGameRowHealth(g, health[i]); });
    const linked = health.filter(h => h.state === 'linked' || h.state === 'managed').length;
    this._text('wsRailFilm', health.length ? `${linked} of ${health.length} linked` : '—');
    const selectedIndex = games.findIndex(g => String(g.id) === this._homeSelectedGameId);
    this._setTopFilm(selectedIndex >= 0 ? health[selectedIndex] : null);
    if (selectedIndex >= 0) this._patchDetailFilmFact(health[selectedIndex]);
  }
  /** W-L-T computed from every FINAL game with an entered score — the same
   *  score fields `_gameRowInfo`/the score pill already read, so this can
   *  never disagree with what a game row itself shows. */
  _seasonRecord(games,store){let w=0,l=0,t=0;games.forEach((g,i)=>{const r=this.app._gameRowInfo(g,i,store,store.data.activeGameId);if(!r.isFinal||!r.hasScore)return;const u=Number(r.u),th=Number(r.t);if(u>th)w++;else if(u<th)l++;else t++;});const text=t?`${w}-${l}-${t}`:(w||l?`${w}-${l}`:'');return{w,l,t,text:text||'—'};}
  /** The whole row is the preview control (canon: no per-row Open button —
   *  Continue Charting in the detail panel is the one way to open a game). */
  _gameRowHtml(g,c){const info=this.app._gameRowInfo(g,g.__idx??0,this.app.storage.seasonStore,this.app.storage.seasonStore.data.activeGameId);const idx=this.app.storage.seasonStore.data.games.indexOf(g);const selected=String(g.id)===this._homeSelectedGameId;const result=info.hasScore?`${Number(info.u)>Number(info.t)?'Final ':Number(info.u)<Number(info.t)?'Final ':'Final '}${info.u}-${info.t}`:(info.isFinal?'Final':'Not played');const tagged=(g.plays||[]).filter(isPlayTagged).length;
    return `<button type="button" class="ws-game-row${selected?' selected':''}" data-ws-preview="${this._esc(g.id)}" data-game-id="${this._esc(g.id)}" aria-pressed="${selected?'true':'false'}">
      <span class="ws-game-name"><strong>${this._esc(this._gameName(g,idx))}</strong><small>${this._esc([this._dateLabel(g.gameInfo?.date),result].filter(Boolean).join(' · '))}</small></span>
      <span class="ws-game-cell"><strong>${(g.plays||[]).length}</strong><small>plays</small></span>
      <span class="ws-game-cell"><strong>${tagged}</strong><small>charted</small></span>
      <span class="ws-game-cell" data-film-health><strong class="ws-loading">Checking…</strong><small>&nbsp;</small></span>
      <span class="ws-game-arrow" aria-hidden="true">›</span>
    </button>`;}
  _renderGameRowHealth(game,h){const row=this.root.querySelector(`[data-game-id="${CSS.escape(String(game.id))}"]`);if(!row)return;const cell=row.querySelector('[data-film-health]');if(!cell)return;const ready=h.state==='linked'||h.state==='managed';const detail=h.progress?`${h.progress.done} of ${h.progress.total||'?'} clips`:h.expected?`${h.found} of ${h.expected} clips`:'';cell.innerHTML=`<strong class="${ready?'ws-fact-green':'ws-fact-warn'}">${ready?'● Film linked':this._esc(h.label||'Film needed')}</strong><small>${this._esc(detail)}</small>`;}
  _selectHomeGame(gameId){const games=this.app.storage.seasonStore.data?.games||[];const game=games.find(g=>String(g.id)===String(gameId));if(!game)return false;this._homeSelectedGameId=String(game.id);this.root.querySelectorAll('.ws-game-row').forEach(row=>{const selected=row.dataset.gameId===this._homeSelectedGameId;row.classList.toggle('selected',selected);row.setAttribute('aria-pressed',String(selected));});this._renderGameDetail(game,this.app.workspace.snapshot());const h=this._homeFilmHealth.get(this._homeSelectedGameId);if(h)this._setTopFilm(h);return true;}
  /** The selected-game detail panel + the "Continue where you left off" row.
   *  `game` is the coach's current PREVIEW selection, which is not necessarily
   *  the canonically active/open game — Continue Charting always opens
   *  whichever game is previewed, via the one authoritative `App.openGame()`. */
  _renderGameDetail(game, context) {
    const empty = this.root.querySelector('#wsDetailEmpty');
    const body = this.root.querySelector('#wsDetailBody');
    const continueBtn = this.root.querySelector('#wsContinueCharting');
    const data = this.app.storage.seasonStore.data;
    const scout = data?.kind === 'scout';
    const scoutTarget = String(data?.scout?.opponent || '').trim();
    if (!game) {
      if (empty) {
        empty.hidden = false;
        empty.textContent = context?.season ? (scout ? 'No source games in this opponent scout.' : 'No games in the active season.') : 'Open a season to see games here.';
      }
      if (body) body.hidden = true;
      if (continueBtn) continueBtn.disabled = true;
      this._text('wsContinueTitle', 'No game open');
      this._text('wsContinueMeta', scout ? 'Add a source game to begin the scout.' : 'Open a season to continue.');
      const bar = this.root.querySelector('#wsProgressBar'); if (bar) bar.style.width = '0%';
      this._text('wsSeasonProgressTitle', 'No plays charted');
      this._text('wsSeasonProgressMeta', scout ? 'Add opponent film to begin.' : 'Add a game to get started.');
      const sbar = this.root.querySelector('#wsSeasonProgressBar'); if (sbar) sbar.style.width = '0%';
      return;
    }
    if (empty) empty.hidden = true;
    if (body) body.hidden = false;
    if (continueBtn) continueBtn.disabled = false;
    const summary = this._gameSummary(game);
    const active = String(data?.activeGameId || '') === String(game.id);
    const sourceA = String(game.gameInfo?.sourceTeamA || scoutTarget || 'Team A').trim();
    const sourceB = String(game.gameInfo?.sourceTeamB || game.gameInfo?.opponent || 'Team B').trim();
    const matchup = scout ? [sourceA, sourceB].filter(Boolean).join(' vs ') : this._gameName(game);
    this._text('wsContinueTitle', active ? `${matchup} · ${this._activeRouteLabel()}` : matchup);
    this._text('wsContinueMeta', active ? 'Continue where you left off' : [summary.date, summary.status].filter(Boolean).join(' · '));
    const bar = this.root.querySelector('#wsProgressBar'); if (bar) bar.style.width = `${summary.pct}%`;
    const games = data?.games || [];
    const seasonTotal = games.reduce((n, g) => n + (g.plays?.length || 0), 0);
    const seasonTagged = games.reduce((n, g) => n + (g.plays || []).filter(isPlayTagged).length, 0);
    this._text('wsSeasonProgressTitle', seasonTotal ? (seasonTagged === seasonTotal ? `All ${seasonTotal} plays charted` : `${seasonTagged} of ${seasonTotal} plays charted`) : 'No plays charted');
    this._text('wsSeasonProgressMeta', scout ? `${games.length} source game${games.length === 1 ? '' : 's'} ready for Study and Reports` : `${games.length} game${games.length === 1 ? '' : 's'} ready for Study and Reports`);
    const sbar = this.root.querySelector('#wsSeasonProgressBar'); if (sbar) sbar.style.width = `${seasonTotal ? Math.round(seasonTagged / seasonTotal * 100) : 0}%`;
    this._text('wsDetailBadge', (scout ? sourceA : (game.gameInfo?.opponent || context?.team?.name || 'GI')).trim().slice(0, 2).toUpperCase() || 'GI');
    this._text('wsDetailName', (scout ? matchup : (game.gameInfo?.opponent || this._gameName(game))).toUpperCase());
    this._text('wsDetailMeta', scout ? [scoutTarget && `Scouting ${scoutTarget}`, summary.date, summary.status].filter(Boolean).join(' · ') : [this._gameName(game), summary.date, summary.status].filter(Boolean).join(' · '));
    const hasScore = summary.score !== 'Not entered';
    this._text('wsDetailUsLabel', scout ? sourceA : (context?.team?.name || 'Us'));
    this._text('wsDetailUsScore', hasScore ? summary.score.split('–')[0] : '—');
    this._text('wsDetailThemLabel', scout ? sourceB : (game.gameInfo?.opponent || 'Them'));
    this._text('wsDetailThemScore', hasScore ? summary.score.split('–')[1] : '—');
    this._text('wsFactPlays', String(summary.total));
    this._text('wsFactCharted', `${summary.tagged} / ${summary.total}`);
    this._text('wsFactPhase', `O ${summary.offense} · D ${summary.defense} · ST ${summary.special}`);
    this._patchDetailFilmFact(this._homeFilmHealth.get(String(game.id)));
    const rows = this.root.querySelector('#wsPhaseRows');
    if (rows) rows.innerHTML = summary.unitProgress.map(u => `<li class="ws-phase-row"><b>${u.short}</b><span class="ws-bar ${u.key === 'defense' ? 'cyan' : u.key === 'special' ? 'gold' : ''}"><i style="width:${u.total ? u.pct : 0}%"></i></span><span>${u.total}</span></li>`).join('');
    if (continueBtn) continueBtn.textContent = active ? 'Continue charting' : (scout ? 'Open source game' : 'Open selected game');
  }
  _activeRouteLabel(){const labels={home:'Home',breakdown:'Break Down',study:'Study',reports:'Reports',plan:'Plan'};return labels[this.app.workspace.currentRoute()]||'Reports';}
  /** Shared by _renderGameDetail's own initial paint AND refreshHome's later
   *  async health resolution, so the detail panel's Film fact never gets
   *  stuck on "Checking film…" once the real answer is known. */
  /** A managed copy and a linked external folder must never read identically
   *  here -- that ambiguity is exactly what made the 1.12.0-8 smoke
   *  unprovable (see CLAUDE.md). Ready film discloses which one it is. */
  _patchDetailFilmFact(h){const filmEl=this.root?.querySelector('#wsFactFilm');if(!filmEl)return;const ready=h&&(h.state==='linked'||h.state==='managed');const source=h?.state==='linked'?'linked':h?.state==='managed'?'managed copy':'';filmEl.textContent=h?(ready?`${h.expected||h.found||0} clips · ${source}`:(h.label||'Checking film…')):'Checking film…';filmEl.className=`ws-fact-${ready?'green':h?'warn':'muted'}`;}
  /** Progress is per unit, not just a play count per unit: a coach needs to see
   *  WHICH side is behind, and "O 24 · D 18 · ST 6" never said that. Charted
   *  uses the same isPlayTagged predicate as the overall figure, so the unit
   *  rows always sum to the headline. */
  _gameSummary(game){const plays=game?.plays||[];const tagged=plays.filter(isPlayTagged).length;const units={offense:0,defense:0,special:0};const unitTagged={offense:0,defense:0,special:0};plays.forEach(play=>{const unit=play?.tags?.unit||'offense';if(Object.hasOwn(units,unit)){units[unit]++;if(isPlayTagged(play))unitTagged[unit]++;}});const unitProgress=['offense','defense','special'].map(key=>({key,label:key==='offense'?'Offense':key==='defense'?'Defense':'Special Teams',short:key==='offense'?'O':key==='defense'?'D':'ST',total:units[key],tagged:unitTagged[key],pct:units[key]?Math.round(unitTagged[key]/units[key]*100):0}));const gi=game?.gameInfo||{};const hasUs=gi.scoreUs!==''&&gi.scoreUs!=null&&Number.isFinite(Number(gi.scoreUs));const hasThem=gi.scoreThem!==''&&gi.scoreThem!=null&&Number.isFinite(Number(gi.scoreThem));return{total:plays.length,tagged,pct:plays.length?Math.round(tagged/plays.length*100):0,offense:units.offense,defense:units.defense,special:units.special,unitProgress,score:hasUs&&hasThem?`${Number(gi.scoreUs)}–${Number(gi.scoreThem)}`:'Not entered',date:this._dateLabel(gi.date),status:String(game.status||'not_started').replace(/_/g,' ')};}
  _chartedLabel(game){const s=this._gameSummary(game);return s.total?`${s.tagged} of ${s.total} charted`:'0 plays';}
  _dateLabel(value){if(!value)return'';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
  /** Reports now has a real shell route, so this navigates there instead of
   *  revealing the classic outlet (which is what used to expose the retired
   *  top bar underneath). Kept as the named entry point Study links to. */
  showAdvancedReports(){ if(!this.root) return; return this.show('reports'); }
  async _openLibrary(){
    if(!this.root)return false;
    if(this.root.dataset.route!=='team-hub')this._teamHubReturnRoute=this.app.workspace.currentRoute()||'home';
    this.app.cutupPlayer?.stop();
    document.body.classList.remove('ws-route-home','ws-route-breakdown','ws-route-study','ws-route-reports','ws-route-plan');
    document.body.classList.add('ws-route-team-hub');
    this.root.dataset.route='team-hub';
    this.root.querySelectorAll('[data-ws-route]').forEach(button=>button.classList.remove('active'));
    this._setRouteVisibility('hub');
    this._syncChrome();
    await this.app.teamHubScreen?.show?.();
    return true;
  }
  async closeTeamHub(){
    const target=this._teamHubReturnRoute||'home';
    this._teamHubReturnRoute='home';
    const guarded=this.app.workspace.guard?.(target);
    return this.show(guarded?.ok?target:'home');
  }
  /** Home's direct "New game" action (C1 finding 4): with Home the sole game
   * entry, creating a game belongs on Home, not buried under More. Creates the
   * game in the active season (reusing a still-empty active game rather than
   * stacking husks — GameScreen owns that transaction) and opens it into Break Down
   * through the one authoritative open command. No season open → send the coach
   * to the library to pick or create one first. */
  async _newGame(){const store=this.app.storage?.seasonStore;if(!store?.hasCurrent?.()){await this._openLibrary();return;}const id=await this.app.gameScreen.open({mode:'create'});if(id&&id!=='cancel')await this.app.openGame(id);}
  /** Own global chrome directly: real buttons rendered by this class, wired
   *  to the underlying services in _bind()'s data-ws-tool branch. Append
   *  order IS the visual order: history first, then help, then settings.
   *  history-manager's own `change` event drives Undo/Redo's disabled state
   *  and title reactively -- no DOM node is adopted from anywhere. */
  _mountChrome(){
    const tools=this.root?.querySelector('.ws-global-tools');
    if(!tools)return;
    tools.innerHTML=`
      <button class="ws-icon-btn" type="button" data-ws-tool="undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><svg class="icon"><use href="assets/icons.svg#icon-undo"/></svg></button>
      <button class="ws-icon-btn" type="button" data-ws-tool="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled><svg class="icon"><use href="assets/icons.svg#icon-redo"/></svg></button>
      <button class="ws-icon-btn" type="button" data-ws-tool="shortcuts" title="Keyboard shortcuts (press ?)" aria-label="Keyboard shortcuts"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg></button>
      <button class="ws-icon-btn" type="button" data-ws-tool="settings" title="Team & Film Settings" aria-label="Team and Film Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>`;
    this._btnUndo=tools.querySelector('[data-ws-tool="undo"]');
    this._btnRedo=tools.querySelector('[data-ws-tool="redo"]');
    this._historyUnsub?.();
    const hist=this.app.history;
    this._syncHistoryButtons(hist?.canUndo?.()||false,hist?.canRedo?.()||false,'');
    this._historyUnsub=hist?.on?.('change',state=>this._syncHistoryButtons(state.canUndo,state.canRedo,state.undoLabel))||null;
  }
  _syncHistoryButtons(canUndo,canRedo,undoLabel){
    if(this._btnUndo){this._btnUndo.disabled=!canUndo;this._btnUndo.title=canUndo?`Undo: ${undoLabel} (Ctrl+Z)`:'Undo (Ctrl+Z)';}
    if(this._btnRedo)this._btnRedo.disabled=!canRedo;
  }
  /**
   * UX-2 (S6-4a). Game context is switchable from every route instead of
   * requiring a Home round trip. Shared SHELL ownership — one control the five
   * routes inherit, not five route-specific selectors — and selection goes
   * through the canonical `App.openGame()` with the CURRENT route as its
   * destination, so a coach comparing two games in Reports stays in Reports.
   *
   * Deliberate limit, stated rather than faked: the popover lists the games of
   * the OPEN season, because those are the only games in memory. Other seasons
   * are listed as seasons and say so — reading their game rows would mean
   * loading every season on every popover open. The switcher never claims to
   * know a game it has not read.
   */
  /** V2-A Program selector. Reads the SAME TeamRegistry every other program
   *  surface (Team Hub) already uses; switching reuses TeamHubScreen.switchTeam
   *  (commits+persists the outgoing season, closes it, swaps identity+roster) —
   *  no second program pointer. Lands on Home per the V2-A contract: a program
   *  switch leaves no season open, so Home's own empty state guides the coach
   *  to the Season selector next. */
  async _openProgramSwitch(anchor){
    if(!anchor||!this.app.overlays||!this.app.teamRegistry)return;
    const registry=this.app.teamRegistry; const activeId=registry.activeTeamId();
    const teams=registry.teams();
    const items=teams.map(team=>({key:`team-${team.id}`,label:team.teamName,selected:team.id===activeId,
      onSelect:async()=>{ if(await this.app.teamHubScreen?.switchTeam?.(team.id)) { this._homeSelectedGameId=null; await this.show('home'); } }}));
    items.push({key:'new-program',label:'+ New program',separator:!!teams.length,
      onSelect:()=>this.app.teamHubScreen?.openAddTeam?.(anchor)});
    anchor.setAttribute('aria-expanded','true');
    const handle=this.app.overlays.popover({title:'Switch program',anchor,returnFocus:anchor,items});
    handle.result.finally(()=>{if(anchor.isConnected)anchor.setAttribute('aria-expanded','false');});
  }
  /** V2-A Season selector — the approved canon (season-switcher-1440x900.png):
   *  every other season for the ACTIVE program, the current season marked, then
   *  "+ New season". Reuses the exact canonical open path
   *  (`StorageManager.openSeasonById` + `show('home')`) the old Home season
   *  band already used, so switching from any route safely lands on that
   *  season's Home with no stale game context (V2-A requirement 3) — Home's own
   *  refresh reads the freshly-opened season fresh, it never carries forward a
   *  previous season's selected/active game id. */
  async _openSeasonSwitch(anchor){
    if(!anchor||!this.app.overlays)return;
    const store=this.app.storage.seasonStore, currentId=store?.currentSeasonId||'';
    // PC-2 (Invariant #4): a genuine read failure must never render as an empty
    // list — that reads as "you have no other seasons" when the truth is "this
    // could not be checked." failed is surfaced as one disabled honest item
    // rather than a silently-shrunk menu.
    let seasons=[], failed=false; try{seasons=await this.app.storage.listSeasons();}catch(e){failed=true;console.error('listSeasons failed',e);}
    try{const r=this.app.teamRegistry;if(!failed&&r?.teams().length)seasons=r.seasonsForTeam(seasons,r.activeTeamId());}catch{}
    const scoutMode=this._isScoutWorkspace();
    if(!failed)seasons=seasons.filter(season=>scoutMode?season.kind==='scout':season.kind!=='scout');
    const items=failed
      ? [{key:'load-failed',label:'Seasons could not be loaded',detail:'This is a read failure, not an empty library.',disabled:true}]
      : seasons.map(season=>({key:`season-${season.id}`,label:season.name||'Untitled Season',
          detail:`${season.games||0} game${season.games===1?'':'s'} · ${season.plays||0} play${season.plays===1?'':'s'}`,
          selected:String(season.id)===String(currentId),
          onSelect:async()=>{ if(String(season.id)===String(currentId)) return; await this.app.storage.openSeasonById(season.id); this._homeSelectedGameId=null; await this.show('home'); }}));
    items.push({key:'season-library',label:'Season Library',detail:scoutMode?'Manage opponent scout seasons':'View and manage all program seasons',separator:!!items.length,
      onSelect:()=>this._openLibrary()});
    items.push({key:scoutMode?'new-scout':'new-season',label:scoutMode?'+ New opponent scout':'+ New season',separator:false,
      onSelect:()=>scoutMode?this.app.teamHubScreen?.openCreateScout?.(anchor):this.app.teamHubScreen?.openCreateSeason?.(anchor)});
    anchor.setAttribute('aria-expanded','true');
    const handle=this.app.overlays.popover({title:'Switch season',anchor,returnFocus:anchor,items});
    handle.result.finally(()=>{if(anchor.isConnected)anchor.setAttribute('aria-expanded','false');});
  }
  async _openGameSwitch(anchor){
    if(!anchor||!this.app.overlays)return;
    const store=this.app.storage.seasonStore, games=store?.data?.games||[];
    const context=this.app.workspace.snapshot(), route=this.app.workspace.currentRoute();
    const activeId=String(store?.data?.activeGameId??'');
    const health=await Promise.all(games.map(g=>this.app.workspace.filmHealth(g).catch(()=>null)));
    const items=[];
    if(games.length){
      items.push({key:'season-head',heading:true,label:context.season?.name||'This season'});
      games.forEach((game,index)=>{
        const info=this.app._gameRowInfo(game,index,store,store.data.activeGameId);
        items.push({key:`game-${game.id}`,label:info.name||`Game ${index+1}`,detail:this._switchDetail(game,info,health[index]),
          selected:String(game.id)===activeId,onSelect:()=>this.app.openGame(game.id,{route})});
      });
    }
    // V2-A: cross-season browsing moved to the dedicated Season context selector
    // (_openSeasonSwitch, matching the approved season-switcher canon). This
    // popover stays scoped to the current season's own games, which is what
    // "Game" means as a context selector.
    if(!items.length)items.push({key:'none',label:'No games yet',detail:'Create one from Home',disabled:true});
    anchor.setAttribute('aria-expanded','true');
    const handle=this.app.overlays.popover({title:'Switch game',anchor,returnFocus:anchor,items});
    handle.result.finally(()=>{if(anchor.isConnected)anchor.setAttribute('aria-expanded','false');});
  }
  /** Week/opponent is the label; this is the rest of UX-2's row: result, charting, film. */
  _switchDetail(game,info,health){
    const parts=[];
    if(info.date)parts.push(info.date);
    if(info.hasScore)parts.push(`${Number(info.u)>Number(info.t)?'W':Number(info.u)<Number(info.t)?'L':'T'} ${info.u}-${info.t}`);
    else parts.push(info.isFinal?'Final':'Not played');
    parts.push(this._chartedLabel(game));
    if(health?.label)parts.push(health.label);
    return parts.join(' · ');
  }
  _openMore(anchor){
    if(!anchor||!this.app.overlays)return;
    anchor.setAttribute('aria-expanded','true');
    const handle=this.app.overlays.popover({title:'More actions',anchor,returnFocus:anchor,items:this._moreItems(anchor.id==='btnNativeMoreMobile',anchor)});
    handle.result.finally(()=>{if(anchor.isConnected)anchor.setAttribute('aria-expanded','false');});
  }
  _moreItems(compact=false,anchor=null){
    const storage=this.app.storage;
    const items=compact?[
      {key:'settings',label:'Team & Film Settings',onSelect:()=>this.app.settingsScreen?.open?.({returnFocus:anchor})},
      {key:'new-game',label:'New game',onSelect:()=>this._newGame()},
      {key:'undo',label:'Undo',disabled:!this.app.history?.canUndo?.(),onSelect:()=>this.app.history?.undoAll()},
      {key:'redo',label:'Redo',disabled:!this.app.history?.canRedo?.(),onSelect:()=>this.app.history?.redoAll()},
      {key:'shortcuts',label:'Keyboard shortcuts',onSelect:()=>this.app.shortcutsScreen?.open?.(anchor)},
    ]:[];
    items.push(
      {key:'teams',label:'Teams & seasons',separator:!compact,onSelect:()=>this._openLibrary()},
      {key:'open',label:'Open season file',onSelect:()=>storage.projectFileInput?.click()},
      {key:'import',label:'Import plays',detail:'CSV or pasted breakdown',onSelect:()=>this.app.playImport.open({returnFocus:anchor})},
      {key:'save',label:'Save season',detail:'Create a restore point',onSelect:()=>storage.saveProject()},
      {key:'recovery',label:'Restore points & versions',onSelect:()=>this.app.settingsScreen?.open?.({initialTab:'recovery',returnFocus:anchor})},
      {key:'charting',label:'Charting libraries',onSelect:()=>this.app.settingsScreen?.open?.({initialTab:'charting',returnFocus:anchor})},
      {key:'drawing',label:'Drawing tools',onSelect:()=>this.app.settingsScreen?.open?.({initialTab:'drawing',returnFocus:anchor})},
      {key:'cutup-filter',label:'Cut-up filters',onSelect:()=>this.app.settingsScreen?.open?.({initialTab:'cutup',returnFocus:anchor})},
      {key:'season',label:'Season report',separator:true,onSelect:()=>this.show('reports')},
      {key:'html',label:'Current game HTML report',onSelect:()=>storage.exportHtmlReport(this.app.stats)},
      {key:'csv',label:'Export plays CSV',onSelect:()=>storage.exportCsv()},
      {key:'cutup',label:'Export cut-up video',onSelect:()=>this.app.cutup.export()},
      {key:'frame',label:'Export current frame',onSelect:()=>storage.exportPng()},
      {key:'call-sheet',label:'Build call sheet',onSelect:()=>this.app.callSheet.show()},
    );
    const seasonStore=storage.seasonStore;
    if(seasonStore?.canOpenDataDir?.())items.push({key:'data-folder',label:'Open data folder',separator:true,onSelect:()=>this._openDataFolder()});
    if(this.app.updater?.available)items.push({key:'updates',label:'Check for updates',onSelect:()=>this.app.updater.check(true)});
    items.push({key:'version',label:this.app.versionLabel?.()||'GridIron IQ',separator:!seasonStore?.canOpenDataDir?.()&&!this.app.updater?.available,disabled:true});
    return items;
  }
  async _openDataFolder(){
    let dir='';
    try{dir=await this.app.storage.seasonStore.openDataDir();}catch{}
    if(dir)this.app.updater?._toast(`Your seasons are saved in:\n${dir}`);
  }
  _gameName(g){const gi=g?.gameInfo||{};if(gi.gameType==='scout'||gi.perspective==='scout'){const a=String(gi.sourceTeamA||'').trim(),b=String(gi.sourceTeamB||'').trim();if(a&&b)return a+' vs '+b;}return g.name||gi.projectName||gi.opponent||'Untitled Game';}
  _setTopFilm(health){const el=this.root?.querySelector('#wsTopFilm');if(!el)return;el.className='ws-film-chip';if(!health){el.textContent='No film selected';return;}const ready=health.state==='linked'||health.state==='managed';el.textContent=ready?'Film Linked':health.label||'Film unavailable';el.classList.add(ready?'is-ready':'is-missing');}
  _text(id,v){const el=this.root?.querySelector(`#${id}`);if(el)el.textContent=v;}
  _esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
}
