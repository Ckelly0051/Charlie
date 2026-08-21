import { isPlayTagged } from './football-rules.js';

/**
 * The one native application shell.
 *
 * S7 demolition: `#app` and `#wsClassicOutlet` are gone. The tagging domain,
 * Film Room grid, Reports' legacy render target, and the remaining top-bar
 * controls now live permanently in `#giLegacyEngineHost` (a sibling of
 * `#giMediaHost`), outside this shell's own root — real backing stores the
 * domain engines still read/write directly, not a second visible surface.
 */
export class WorkspaceShell {
  constructor(app) {
    this.app = app;
    this.root = null;
    this._homeToken = 0;
    this._homeSelectedGameId = null;
    this._homeFilmHealth = new Map();
    // Controls the legacy top bar owned that this shell has no replacement
    // for. Their permanent authored home is #giLegacyEngineHost now, not a
    // container this shell adopts/returns — relocation moves the live
    // element, so every listener and disabled-state binding rides along
    // untouched — history-manager binds undo/redo by id at init() and keeps
    // driving them.
    this._chrome = {
      undo: this._remember(document.getElementById('btnUndoAction')),
      redo: this._remember(document.getElementById('btnRedoAction')),
      shortcuts: this._remember(document.getElementById('btnShortcuts')),
      settings: this._remember(document.getElementById('btnSidebarToggle')),
      // Status for the OPTIONAL local CV server. Not prime chrome — it belongs
      // with the low-frequency setup tools, per the redesign plan's rule that
      // setup/history/filter tools live in Settings.
      backend: this._remember(document.getElementById('backendStatusBadge')),
    };
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
    this._restoreChrome();
    this.root.remove(); this.root = null;
    document.body.classList.remove('ws-shell-active', 'ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-reports', 'ws-route-plan', 'ws-route-team-hub');
  }
  _mount() {
    const root = document.createElement('div');
    root.id = 'workspaceShell'; root.className = 'ws-shell';
    root.innerHTML = `<aside class="ws-sidebar"><div class="ws-brand">GRIDIRON <b>IQ</b></div>
      <button class="ws-team" data-ws-action="seasons"><strong id="wsTeamName">Team</strong><span id="wsTeamMeta">Season workspace</span></button>
      <nav class="ws-nav" aria-label="Workspace">${this._navButtons()}</nav>
      <div class="ws-side-foot"><div class="ws-save-state"><i></i>Season ready</div></div></aside>
      <main class="ws-main"><header class="ws-topbar"><button class="ws-top-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><button class="ws-top-team" data-ws-action="seasons"><strong id="wsTopTeamName">Team</strong><span id="wsTopTeamMeta">Season workspace</span></button><nav class="ws-top-nav" aria-label="Workspace">${this._navButtons()}</nav><button class="ws-context" id="wsContextSwitch" data-ws-action="game-switch" aria-haspopup="menu" aria-expanded="false" aria-label="Switch game"><span id="wsContextTeam">Team</span><b>›</b><span id="wsContextSeason">No season open</span><b>›</b><strong id="wsContextGame">Team home</strong><b class="ws-context-caret" aria-hidden="true">▾</b></button><div class="ws-top-actions"><span class="ws-film-chip" id="wsTopFilm">No film selected</span><div class="ws-global-tools"></div><button class="ws-icon-btn ws-more-btn" id="btnNativeMore" data-ws-action="more" aria-haspopup="menu" aria-expanded="false">More <span aria-hidden="true">▾</span></button><button class="ws-icon-btn" data-ws-action="seasons" aria-label="Teams and seasons">⋯</button></div></header>
      <header class="ws-mobile-head"><button class="ws-mobile-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><strong id="wsMobileContext">Team home</strong><button class="ws-icon-btn" id="btnNativeMoreMobile" data-ws-action="more" aria-label="Settings and more" aria-haspopup="menu" aria-expanded="false">⋯</button></header>
      <section class="ws-home" id="wsHome"><div class="ws-home-head"><div><div class="ws-eyebrow">Team workspace</div><h1 id="wsGreeting">HOME</h1><p id="wsHomeSummary">Choose a season to get started.</p></div><button class="ws-btn ws-primary" id="wsResume" data-ws-route="breakdown" disabled>Continue breakdown</button></div>
      <section class="ws-continue"><div class="ws-game-mark" id="wsGameMark">GI</div><div class="ws-game-overview"><div class="ws-eyebrow" id="wsGameEyebrow">Continue where you left off</div><h2 id="wsContinueTitle">No game open</h2><p id="wsContinueMeta">Open a season to continue.</p><div class="ws-game-facts" id="wsGameFacts" hidden><div><span>Score</span><strong id="wsScoreValue">—</strong></div><div><span>Plays</span><strong id="wsPlaysValue">0</strong></div><div><span>Charted</span><strong id="wsChartedValue">0</strong></div><div><span>Units</span><strong id="wsUnitsValue">—</strong></div></div></div><div class="ws-progress"><span>Breakdown progress</span><strong id="wsProgressText">0 plays</strong><div><i id="wsProgressBar"></i></div><ul class="ws-unit-progress" id="wsUnitProgress" aria-label="Charting progress by unit"></ul></div></section>
      <div class="ws-home-grid"><section class="ws-band"><div class="ws-section-head"><h2>FILM INBOX</h2><button class="ws-link ws-link-strong" data-ws-action="new-game">+ New game</button><button class="ws-link" data-ws-action="seasons">Seasons</button></div><div class="ws-list" id="wsFilmList"></div></section><section class="ws-band"><div class="ws-section-head"><h2>SEASONS</h2><button class="ws-link" data-ws-action="seasons">Manage</button></div><div class="ws-list" id="wsSeasonList"></div></section></div></section>
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
      const action = e.target.closest('[data-ws-action]')?.dataset.wsAction;
      if (action === 'seasons') await this._openLibrary();
      if (action === 'new-game') { await this._newGame(); return; }
      if (action === 'settings') this.app.settingsScreen?.open?.({ returnFocus: e.target.closest('[data-ws-action]') });
      if (action === 'more') { this._openMore(e.target.closest('[data-ws-action]')); return; }
      if (action === 'game-switch') { await this._openGameSwitch(e.target.closest('[data-ws-action]')); return; }
      const sid = e.target.closest('[data-ws-season]')?.dataset.wsSeason;
      if (sid) { await this.app.storage.openSeasonById(sid); await this.show('home'); }
      const previewId = e.target.closest('[data-ws-preview]')?.dataset.wsPreview;
      if (previewId) { this._selectHomeGame(previewId); return; }
      const gid = e.target.closest('[data-ws-game]')?.dataset.wsGame;
      if (gid) { await this.app.openGame(gid); return; }   // one authoritative open path (C1)
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
    if (routeId==='reports') { this.app.reportsScreen?.show(); }
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
  _syncChrome() {
    if (!this.root) return; const c=this.app.workspace.snapshot();
    this._text('wsTeamName',c.team?.name||'Team'); this._text('wsTeamMeta',c.season?.name||'Season workspace'); this._text('wsTopTeamName',c.team?.name||'Team'); this._text('wsTopTeamMeta',c.season?.name||'Season workspace'); this._text('wsContextTeam',c.team?.name||'Team'); this._text('wsContextSeason',c.season?.name||'No season open'); this._text('wsContextGame',c.game?.name||'Team home'); this._text('wsMobileContext',c.game?.name||c.season?.name||'Team home');
    this.root.querySelectorAll('[data-ws-route="breakdown"]').forEach(b=>b.disabled=!c.capabilities.canBreakDown);
    this.root.querySelectorAll('[data-ws-route="study"],[data-ws-route="reports"],[data-ws-route="plan"]').forEach(b=>b.disabled=!c.capabilities.canStudy);
  }
  async refreshHome() {
    if (!this.root) return; const token=++this._homeToken; this._syncChrome(); const c=this.app.workspace.snapshot(); const store=this.app.storage.seasonStore; const game=store.data ? store.activeGame?.() : null;
    this._text('wsGreeting',c.team?.name?`${c.team.name.toUpperCase()} HOME`:'TEAM HOME'); this._text('wsHomeSummary',c.season?`${c.season.name} · ${c.season.gameCount} game${c.season.gameCount===1?'':'s'}`:'Choose a season to get started.');
    // PC-2 (Invariant #4): a genuinely failed catalog must never render as
    // "you have no seasons" -- that reads as an invitation to recreate data
    // that may still exist, just currently unreadable. seasonsFailed is
    // threaded to _renderSeasons() so it can show a distinct, honest state.
    let seasons=[], seasonsFailed=false; try{seasons=await this.app.storage.listSeasons();}catch(e){seasonsFailed=true;console.error('listSeasons failed',e);} try{const r=this.app.teamRegistry;if(!seasonsFailed&&r?.teams().length)seasons=r.seasonsForTeam(seasons,r.activeTeamId());}catch{}
    if(token!==this._homeToken||!this.root)return; this._renderSeasons(seasons,c.season?.id,seasonsFailed);
    const games=store.data?.games||[],list=this.root.querySelector('#wsFilmList');
    if(!games.length){this._homeSelectedGameId=null;this._renderGamePreview(null,c);list.innerHTML='<div class="ws-empty">No games in the active season.</div>';this._setTopFilm(null);return;}
    const selected=games.find(g=>String(g.id)===String(this._homeSelectedGameId))||game||games[0]; this._homeSelectedGameId=String(selected.id); this._homeFilmHealth.clear(); this._renderGamePreview(selected,c);
    list.innerHTML=games.map(g=>`<div class="ws-film-row ws-loading${String(g.id)===this._homeSelectedGameId?' selected':''}" data-film-id="${this._esc(g.id)}"><button type="button" class="ws-film-select" data-ws-preview="${this._esc(g.id)}" aria-pressed="${String(g.id)===this._homeSelectedGameId?'true':'false'}"><i></i><div><strong>${this._esc(this._gameName(g))}</strong><span data-film-health>${this._chartedLabel(g)} · Checking film…</span><span class="ws-film-source" data-film-source hidden></span></div></button><button class="ws-btn ws-small" data-ws-game="${this._esc(g.id)}">Open</button></div>`).join('');
    const health=await Promise.all(games.map(g=>this.app.workspace.filmHealth(g).catch(()=>({state:'missing',label:'Film unavailable',action:'repair',expected:0,found:0}))));
    if(token!==this._homeToken||!this.root||c.season?.id!==this.app.workspace.snapshot().season?.id)return;
    games.forEach((g,i)=>{this._homeFilmHealth.set(String(g.id),health[i]);this._renderFilmRow(g,health[i]);}); const si=games.findIndex(g=>String(g.id)===this._homeSelectedGameId); this._setTopFilm(si>=0?health[si]:null);
  }
  _renderSeasons(seasons,currentId,failed){const list=this.root.querySelector('#wsSeasonList');if(failed){list.innerHTML='<div class="ws-empty ws-error">Seasons could not be loaded. Your data is not gone — this is a read failure, not an empty library. Restart the app or check Settings; do not create a new season yet.</div>';return;}if(!seasons.length){list.innerHTML='<div class="ws-empty">No seasons for this team.</div>';return;}const live=this.app.storage.seasonStore.data;list.innerHTML=seasons.slice(0,6).map(s=>{const isCurrent=s.id===currentId;const games=isCurrent&&live?live.games.length:(s.games||0);const plays=isCurrent&&live?live.games.reduce((n,g)=>n+(g.plays?.length||0),0):(s.plays||0);return `<div class="ws-season-row${isCurrent?' current':''}"><div><strong>${this._esc(s.name||'Untitled Season')}</strong><span>${games} game${games===1?'':'s'} · ${plays} play${plays===1?'':'s'}</span></div><button class="ws-btn ws-small" data-ws-season="${this._esc(s.id)}">${isCurrent?'Current':'Open'}</button></div>`;}).join('');}
  _renderFilmRow(game,h){const row=this.root.querySelector(`[data-film-id="${CSS.escape(String(game.id))}"]`);if(!row)return;const selected=String(game.id)===this._homeSelectedGameId;row.className=`ws-film-row state-${h.state}${selected?' selected':''}`;row.querySelector('[data-ws-preview]')?.setAttribute('aria-pressed',String(selected));const detail=h.progress?`${h.progress.done} of ${h.progress.total||'?'} clips`:h.expected?`${h.found} of ${h.expected} clips`:'';const film=detail?`${h.label} · ${detail}`:h.label;const status=row.querySelector('[data-film-health]');if(status)status.textContent=`${this._chartedLabel(game)} · ${film}`;
    // Where the film actually lives. Linked games show the resolved directory
    // filmHealth already had; managed games say so plainly instead of implying a
    // path the coach could open. Silence here is what let a managed-copy
    // fallback look identical to real linked film during the 1.12.0-8 smoke.
    const src=row.querySelector('[data-film-source]');
    if(src){const path=h.path||'';const text=path?path:h.mode==='managed'?'Managed copy in app storage':h.mode==='browser'?'Browser session only — re-add film to play':'';src.textContent=text;src.hidden=!text;src.title=text;}const open=row.querySelector('[data-ws-game]');if(open)open.textContent=h.action==='reconnect'?'Reconnect':h.action==='repair'?'Repair':'Open';}
  _selectHomeGame(gameId){const games=this.app.storage.seasonStore.data?.games||[];const game=games.find(g=>String(g.id)===String(gameId));if(!game)return false;this._homeSelectedGameId=String(game.id);this.root.querySelectorAll('.ws-film-row').forEach(row=>{const selected=row.dataset.filmId===this._homeSelectedGameId;row.classList.toggle('selected',selected);row.querySelector('[data-ws-preview]')?.setAttribute('aria-pressed',String(selected));});this._renderGamePreview(game,this.app.workspace.snapshot());const h=this._homeFilmHealth.get(this._homeSelectedGameId);if(h)this._setTopFilm(h);return true;}
  _renderGamePreview(game,context){const resume=this.root.querySelector('#wsResume');const facts=this.root.querySelector('#wsGameFacts');if(!game){this._text('wsGameEyebrow','Season overview');this._text('wsContinueTitle','No game open');this._text('wsContinueMeta','Open a season to continue.');this._text('wsProgressText','0 plays');this.root.querySelector('#wsProgressBar').style.width='0%';this._renderUnitProgress(null);this._text('wsGameMark',(context?.team?.name||'GI').trim().charAt(0).toUpperCase()||'GI');if(facts)facts.hidden=true;resume.disabled=false;resume.textContent=context?.team?'Choose a season':'Set up team';delete resume.dataset.wsRoute;delete resume.dataset.wsGame;resume.dataset.wsAction='seasons';return;}const summary=this._gameSummary(game);const active=String(this.app.storage.seasonStore.data?.activeGameId||'')===String(game.id);this._text('wsGameEyebrow',active?'Continue where you left off':'Selected game');this._text('wsContinueTitle',this._gameName(game));this._text('wsContinueMeta',[summary.date,summary.status].filter(Boolean).join(' · '));this._text('wsScoreValue',summary.score);this._text('wsPlaysValue',String(summary.total));this._text('wsChartedValue',`${summary.tagged} / ${summary.total}`);this._text('wsUnitsValue',`O ${summary.offense} · D ${summary.defense} · ST ${summary.special}`);this._text('wsProgressText',summary.total?`${summary.tagged} of ${summary.total} charted`:'0 plays');this.root.querySelector('#wsProgressBar').style.width=`${summary.pct}%`;this._renderUnitProgress(summary);this._text('wsGameMark',(game.gameInfo?.opponent||context?.team?.name||'GI').trim().charAt(0).toUpperCase()||'GI');if(facts)facts.hidden=false;resume.disabled=false;resume.textContent=active?'Continue breakdown':'Open selected game';delete resume.dataset.wsAction;delete resume.dataset.wsRoute;resume.dataset.wsGame=String(game.id);}
  /** Progress is per unit, not just a play count per unit: a coach needs to see
   *  WHICH side is behind, and "O 24 · D 18 · ST 6" never said that. Charted
   *  uses the same isPlayTagged predicate as the overall figure, so the unit
   *  rows always sum to the headline. */
  _gameSummary(game){const plays=game?.plays||[];const tagged=plays.filter(isPlayTagged).length;const units={offense:0,defense:0,special:0};const unitTagged={offense:0,defense:0,special:0};plays.forEach(play=>{const unit=play?.tags?.unit||'offense';if(Object.hasOwn(units,unit)){units[unit]++;if(isPlayTagged(play))unitTagged[unit]++;}});const unitProgress=['offense','defense','special'].map(key=>({key,label:key==='offense'?'Offense':key==='defense'?'Defense':'Special Teams',short:key==='offense'?'O':key==='defense'?'D':'ST',total:units[key],tagged:unitTagged[key],pct:units[key]?Math.round(unitTagged[key]/units[key]*100):0}));const gi=game?.gameInfo||{};const hasUs=gi.scoreUs!==''&&gi.scoreUs!=null&&Number.isFinite(Number(gi.scoreUs));const hasThem=gi.scoreThem!==''&&gi.scoreThem!=null&&Number.isFinite(Number(gi.scoreThem));return{total:plays.length,tagged,pct:plays.length?Math.round(tagged/plays.length*100):0,offense:units.offense,defense:units.defense,special:units.special,unitProgress,score:hasUs&&hasThem?`${Number(gi.scoreUs)}–${Number(gi.scoreThem)}`:'Not entered',date:this._dateLabel(gi.date),status:String(game.status||'not_started').replace(/_/g,' ')};}
  /** A unit with no plays is shown as "none charted" rather than 0% — a zero bar
   *  and an absent unit read identically otherwise, and they mean different
   *  things to a coach deciding what to work on next. */
  _renderUnitProgress(summary){const host=this.root?.querySelector('#wsUnitProgress');if(!host)return;if(!summary||!summary.total){host.innerHTML='';return;}
    host.innerHTML=summary.unitProgress.map(u=>`<li class="ws-unit-row${u.total?'':' is-empty'}"><span class="ws-unit-key">${u.short}</span><span class="ws-unit-label">${u.label}</span><span class="ws-unit-bar"><i style="width:${u.total?u.pct:0}%"></i></span><strong>${u.total?`${u.tagged}/${u.total}`:'none'}</strong></li>`).join('');}
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
  _remember(el){return el?{el,parent:el.parentNode,next:el.nextSibling}:null;}
  _restore(slot){if(!slot?.el||!slot.parent)return;const next=slot.next?.parentNode===slot.parent?slot.next:null;slot.parent.insertBefore(slot.el,next);}
  /** Adopt the classic bar's still-needed controls into shell chrome. Append
   *  order IS the visual order: history first, then help, then settings/more. */
  _mountChrome(){
    const tools=this.root?.querySelector('.ws-global-tools');
    if(!tools)return;
    for(const key of ['undo','redo','shortcuts','settings']) {
      if(this._chrome[key]?.el)tools.append(this._chrome[key].el);
    }
  }
  _restoreChrome(){
    for(const key of ['undo','redo','shortcuts','settings','backend'])this._restore(this._chrome[key]);
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
    const seasons=store?.listSeasons ? await store.listSeasons().catch(()=>[]) : [];
    const others=(Array.isArray(seasons)?seasons:[]).filter(season=>String(season.id)!==String(store.currentSeasonId));
    if(others.length){
      items.push({key:'other-head',heading:true,separator:true,label:'Other seasons'});
      others.forEach(season=>items.push({key:`season-${season.id}`,label:season.name||'Season',
        detail:`${season.games||0} game${season.games===1?'':'s'} · open to see them`,
        onSelect:async()=>{await this.app.storage.openSeasonById(season.id);await this.show('home');}}));
    }
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
      {key:'teams',label:'Teams & seasons',onSelect:()=>this._openLibrary()},
      {key:'new-game',label:'New game',onSelect:()=>this._newGame()},
      {key:'undo',label:'Undo',disabled:!!this._chrome.undo?.el?.disabled,onSelect:()=>this._chrome.undo?.el?.click()},
      {key:'redo',label:'Redo',disabled:!!this._chrome.redo?.el?.disabled,onSelect:()=>this._chrome.redo?.el?.click()},
      {key:'shortcuts',label:'Keyboard shortcuts',onSelect:()=>this.app.shortcutsScreen?.open?.(anchor)},
    ]:[];
    items.push(
      {key:'open',label:'Open season file',separator:compact,onSelect:()=>storage.projectFileInput?.click()},
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
  _gameName(g){return g.name||g.gameInfo?.projectName||g.gameInfo?.opponent||'Untitled Game';}
  _setTopFilm(health){const el=this.root?.querySelector('#wsTopFilm');if(!el)return;el.className='ws-film-chip';if(!health){el.textContent='No film selected';return;}const ready=health.state==='linked'||health.state==='managed';el.textContent=ready?'Film Linked':health.label||'Film unavailable';el.classList.add(ready?'is-ready':'is-missing');}
  _text(id,v){const el=this.root?.querySelector(`#${id}`);if(el)el.textContent=v;}
  _esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
}
