import { isPlayTagged } from './football-rules.js';

/** Feature-flagged Phase 1 shell. Hosts the existing #app intact. */
export class WorkspaceShell {
  constructor(app) {
    this.app = app;
    this.root = null;
    this.classicApp = null;
    this._homeToken = 0;
    this._homeSelectedGameId = null;
    this._homeFilmHealth = new Map();
    this._chrome = {
      settings: this._remember(document.getElementById('btnSidebarToggle')),
      more: this._remember(document.getElementById('btnMoreMenu')?.closest('.more-menu')),
      drawer: this._remember(document.getElementById('settingsDrawer')),
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
    this.app.breakdownVideo?.mount();
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
    // BEFORE breakdownWorkspace moves that section back to the classic #app.
    this.app.breakdownVideo?.restore();
    this.app.breakdownWorkspace?.restore();
    this._restoreChrome();
    if (this.classicApp) document.body.insertBefore(this.classicApp, this.root);
    this.root.remove(); this.root = null;
    document.body.classList.remove('ws-shell-active', 'ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-plan');
  }
  _mount() {
    this.classicApp = document.getElementById('app');
    if (!this.classicApp) throw new Error('Workspace shell requires #app');
    const root = document.createElement('div');
    root.id = 'workspaceShell'; root.className = 'ws-shell';
    root.innerHTML = `<aside class="ws-sidebar"><div class="ws-brand">GRIDIRON <b>IQ</b></div>
      <button class="ws-team" data-ws-action="seasons"><strong id="wsTeamName">Team</strong><span id="wsTeamMeta">Season workspace</span></button>
      <nav class="ws-nav" aria-label="Workspace">${this._navButtons()}</nav>
      <div class="ws-side-foot"><div class="ws-save-state"><i></i>Season ready</div></div></aside>
      <main class="ws-main"><header class="ws-topbar"><button class="ws-top-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><button class="ws-top-team" data-ws-action="seasons"><strong id="wsTopTeamName">Team</strong><span id="wsTopTeamMeta">Season workspace</span></button><nav class="ws-top-nav" aria-label="Workspace">${this._navButtons()}</nav><div class="ws-context"><span id="wsContextTeam">Team</span><b>›</b><span id="wsContextSeason">No season open</span><b>›</b><strong id="wsContextGame">Team home</strong></div><div class="ws-top-actions"><span class="ws-film-chip" id="wsTopFilm">No film selected</span><div class="ws-global-tools"></div><button class="ws-icon-btn" data-ws-action="seasons" aria-label="Teams and seasons">⋯</button></div></header>
      <header class="ws-mobile-head"><button class="ws-mobile-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><strong id="wsMobileContext">Team home</strong><button class="ws-icon-btn" data-ws-action="settings" aria-label="Settings and more">⚙</button><button class="ws-icon-btn" data-ws-action="seasons" aria-label="Teams and seasons">⋯</button></header>
      <section class="ws-home" id="wsHome"><div class="ws-home-head"><div><div class="ws-eyebrow">Team workspace</div><h1 id="wsGreeting">HOME</h1><p id="wsHomeSummary">Choose a season to get started.</p></div><button class="ws-btn ws-primary" id="wsResume" data-ws-route="breakdown" disabled>Continue breakdown</button></div>
      <section class="ws-continue"><div class="ws-game-mark" id="wsGameMark">GI</div><div class="ws-game-overview"><div class="ws-eyebrow" id="wsGameEyebrow">Continue where you left off</div><h2 id="wsContinueTitle">No game open</h2><p id="wsContinueMeta">Open a season to continue.</p><div class="ws-game-facts" id="wsGameFacts" hidden><div><span>Score</span><strong id="wsScoreValue">—</strong></div><div><span>Plays</span><strong id="wsPlaysValue">0</strong></div><div><span>Charted</span><strong id="wsChartedValue">0</strong></div><div><span>Units</span><strong id="wsUnitsValue">—</strong></div></div></div><div class="ws-progress"><span>Breakdown progress</span><strong id="wsProgressText">0 plays</strong><div><i id="wsProgressBar"></i></div></div></section>
      <div class="ws-home-grid"><section class="ws-band"><div class="ws-section-head"><h2>FILM INBOX</h2><button class="ws-link ws-link-strong" data-ws-action="new-game">+ New game</button><button class="ws-link" data-ws-action="seasons">Seasons</button></div><div class="ws-list" id="wsFilmList"></div></section><section class="ws-band"><div class="ws-section-head"><h2>SEASONS</h2><button class="ws-link" data-ws-action="seasons">Manage</button></div><div class="ws-list" id="wsSeasonList"></div></section></div></section>
      <section class="ws-breakdown" id="wsBreakdown" hidden></section><section class="ws-study" id="wsStudy" hidden></section><section class="ws-reports" id="wsReports" hidden></section><section class="ws-plan-state" id="wsPlan" hidden></section><div class="ws-classic-outlet" id="wsClassicOutlet" hidden></div></main><nav class="ws-mobile-nav" aria-label="Workspace">${this._navButtons()}</nav>`;
    document.body.appendChild(root); root.querySelector('#wsClassicOutlet').appendChild(this.classicApp); this.root = root; this._mountChrome(); this.app.breakdownWorkspace?.mount(root.querySelector('#wsBreakdown')); this.app.studyScreen?.mount(root.querySelector('#wsStudy')); this.app.reportsScreen?.mount(root.querySelector('#wsReports')); this.app.planScreen?.mount(root.querySelector('#wsPlan')); this._bind();
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
      if (action === 'settings') this.app.uiPolish?._openDrawer?.();
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
    if (routeId !== 'breakdown') this.app.cutupPlayer?.stop();
    document.body.classList.remove('ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-reports', 'ws-route-plan');
    document.body.classList.add(`ws-route-${routeId}`);
    this.root.dataset.route = routeId;
    this.root.querySelectorAll('[data-ws-route]').forEach(b => b.classList.toggle('active', b.dataset.wsRoute === routeId));
    const home=this.root.querySelector('#wsHome'), breakdown=this.root.querySelector('#wsBreakdown'), study=this.root.querySelector('#wsStudy'), reports=this.root.querySelector('#wsReports'), plan=this.root.querySelector('#wsPlan'), outlet=this.root.querySelector('#wsClassicOutlet');
    home.hidden=routeId!=='home'; breakdown.hidden=routeId!=='breakdown'; study.hidden=routeId!=='study'; if(reports)reports.hidden=routeId!=='reports'; plan.hidden=routeId!=='plan'; outlet.hidden=true;
    if (routeId==='home') {
      // A preview belongs only to the current Home visit. Returning from a game
      // must highlight the canonical active game, not the prior Home preview.
      if (previousRoute !== 'home') this._homeSelectedGameId = null;
      await this.refreshHome();
    }
    if (routeId==='breakdown') { this.app.stats?.hideDashboard(); this.app.library?.hide(); }
    if (routeId==='study') { this.app.stats?.hideDashboard(); this.app.library?.hide(); this.app.studyScreen?.show(); }
    if (routeId==='reports') { this.app.library?.hide(); this.app.reportsScreen?.show(); }
    if (routeId==='plan') { this.app.stats?.hideDashboard(); this.app.library?.hide(); this.app.planScreen?.show(); }
    return result;
  }
  /** Re-apply the CURRENT route's visibility with NO navigation side effects.
   *
   * Why this exists (coach smoke, 2026-07-24): `_openLibrary()` and
   * `showAdvancedReports()` both reveal `#wsClassicOutlet` because the library
   * overlay and the stats dashboard live inside the relocated classic `#app` and
   * cannot render while it is hidden. But closing those overlays only removed
   * their own `hidden` class — nothing ever re-hid the outlet — so the ENTIRE
   * classic UI, including its legacy top bar and game dropdown, was left exposed
   * underneath. The coach found the retired flow this way by clicking `⋯`.
   * Only `show()` re-hid the outlet, so it self-corrected on the next route
   * click, which made it look intermittent rather than broken.
   *
   * Deliberately NOT `show()`: show() calls `library.hide()`, which now calls
   * this — routing through show() would recurse. This is visibility only. */
  restoreRouteVisibility() {
    if (!this.root) return;
    const routeId = this.app.workspace.currentRoute() || 'home';
    const q = id => this.root.querySelector(id);
    const home = q('#wsHome'), breakdown = q('#wsBreakdown'), study = q('#wsStudy'),
          plan = q('#wsPlan'), outlet = q('#wsClassicOutlet');
    if (!home || !breakdown || !study || !plan || !outlet) return;
    home.hidden = routeId !== 'home';
    breakdown.hidden = routeId !== 'breakdown';
    study.hidden = routeId !== 'study';
    plan.hidden = routeId !== 'plan';
    outlet.hidden = true;
  }
  _syncChrome() {
    if (!this.root) return; const c=this.app.workspace.snapshot();
    this._text('wsTeamName',c.team?.name||'Team'); this._text('wsTeamMeta',c.season?.name||'Season workspace'); this._text('wsTopTeamName',c.team?.name||'Team'); this._text('wsTopTeamMeta',c.season?.name||'Season workspace'); this._text('wsContextTeam',c.team?.name||'Team'); this._text('wsContextSeason',c.season?.name||'No season open'); this._text('wsContextGame',c.game?.name||'Team home'); this._text('wsMobileContext',c.game?.name||c.season?.name||'Team home');
    this.root.querySelectorAll('[data-ws-route="breakdown"]').forEach(b=>b.disabled=!c.capabilities.canBreakDown);
    this.root.querySelectorAll('[data-ws-route="study"],[data-ws-route="plan"]').forEach(b=>b.disabled=!c.capabilities.canStudy);
  }
  async refreshHome() {
    if (!this.root) return; const token=++this._homeToken; this._syncChrome(); const c=this.app.workspace.snapshot(); const store=this.app.storage.seasonStore; const game=store.data ? store.activeGame?.() : null;
    this._text('wsGreeting',c.team?.name?`${c.team.name.toUpperCase()} HOME`:'TEAM HOME'); this._text('wsHomeSummary',c.season?`${c.season.name} · ${c.season.gameCount} game${c.season.gameCount===1?'':'s'}`:'Choose a season to get started.');
    let seasons=[]; try{seasons=await this.app.storage.listSeasons();}catch{} try{if(this.app.library?._teams?.().length)seasons=this.app.library._teamSeasons(seasons,this.app.library._activeTeamId());}catch{}
    if(token!==this._homeToken||!this.root)return; this._renderSeasons(seasons,c.season?.id);
    const games=store.data?.games||[],list=this.root.querySelector('#wsFilmList');
    if(!games.length){this._homeSelectedGameId=null;this._renderGamePreview(null,c);list.innerHTML='<div class="ws-empty">No games in the active season.</div>';this._text('wsTopFilm','No film selected');return;}
    const selected=games.find(g=>String(g.id)===String(this._homeSelectedGameId))||game||games[0]; this._homeSelectedGameId=String(selected.id); this._homeFilmHealth.clear(); this._renderGamePreview(selected,c);
    list.innerHTML=games.map(g=>`<div class="ws-film-row ws-loading${String(g.id)===this._homeSelectedGameId?' selected':''}" data-film-id="${this._esc(g.id)}"><button type="button" class="ws-film-select" data-ws-preview="${this._esc(g.id)}" aria-pressed="${String(g.id)===this._homeSelectedGameId?'true':'false'}"><i></i><div><strong>${this._esc(this._gameName(g))}</strong><span data-film-health>${this._chartedLabel(g)} · Checking film…</span></div></button><button class="ws-btn ws-small" data-ws-game="${this._esc(g.id)}">Open</button></div>`).join('');
    const health=await Promise.all(games.map(g=>this.app.workspace.filmHealth(g).catch(()=>({state:'missing',label:'Film unavailable',action:'repair',expected:0,found:0}))));
    if(token!==this._homeToken||!this.root||c.season?.id!==this.app.workspace.snapshot().season?.id)return;
    games.forEach((g,i)=>{this._homeFilmHealth.set(String(g.id),health[i]);this._renderFilmRow(g,health[i]);}); const si=games.findIndex(g=>String(g.id)===this._homeSelectedGameId); this._text('wsTopFilm',si>=0?health[si].label:'No film selected');
  }
  _renderSeasons(seasons,currentId){const list=this.root.querySelector('#wsSeasonList');if(!seasons.length){list.innerHTML='<div class="ws-empty">No seasons for this team.</div>';return;}const live=this.app.storage.seasonStore.data;list.innerHTML=seasons.slice(0,6).map(s=>{const isCurrent=s.id===currentId;const games=isCurrent&&live?live.games.length:(s.games||0);const plays=isCurrent&&live?live.games.reduce((n,g)=>n+(g.plays?.length||0),0):(s.plays||0);return `<div class="ws-season-row${isCurrent?' current':''}"><div><strong>${this._esc(s.name||'Untitled Season')}</strong><span>${games} game${games===1?'':'s'} · ${plays} play${plays===1?'':'s'}</span></div><button class="ws-btn ws-small" data-ws-season="${this._esc(s.id)}">${isCurrent?'Current':'Open'}</button></div>`;}).join('');}
  _renderFilmRow(game,h){const row=this.root.querySelector(`[data-film-id="${CSS.escape(String(game.id))}"]`);if(!row)return;const selected=String(game.id)===this._homeSelectedGameId;row.className=`ws-film-row state-${h.state}${selected?' selected':''}`;row.querySelector('[data-ws-preview]')?.setAttribute('aria-pressed',String(selected));const detail=h.progress?`${h.progress.done} of ${h.progress.total||'?'} clips`:h.expected?`${h.found} of ${h.expected} clips`:'';const film=detail?`${h.label} · ${detail}`:h.label;const status=row.querySelector('[data-film-health]');if(status)status.textContent=`${this._chartedLabel(game)} · ${film}`;const open=row.querySelector('[data-ws-game]');if(open)open.textContent=h.action==='reconnect'?'Reconnect':h.action==='repair'?'Repair':'Open';}
  _selectHomeGame(gameId){const games=this.app.storage.seasonStore.data?.games||[];const game=games.find(g=>String(g.id)===String(gameId));if(!game)return false;this._homeSelectedGameId=String(game.id);this.root.querySelectorAll('.ws-film-row').forEach(row=>{const selected=row.dataset.filmId===this._homeSelectedGameId;row.classList.toggle('selected',selected);row.querySelector('[data-ws-preview]')?.setAttribute('aria-pressed',String(selected));});this._renderGamePreview(game,this.app.workspace.snapshot());const h=this._homeFilmHealth.get(this._homeSelectedGameId);if(h)this._text('wsTopFilm',h.label);return true;}
  _renderGamePreview(game,context){const resume=this.root.querySelector('#wsResume');const facts=this.root.querySelector('#wsGameFacts');if(!game){this._text('wsGameEyebrow','Season overview');this._text('wsContinueTitle','No game open');this._text('wsContinueMeta','Open a season to continue.');this._text('wsProgressText','0 plays');this.root.querySelector('#wsProgressBar').style.width='0%';this._text('wsGameMark',(context?.team?.name||'GI').trim().charAt(0).toUpperCase()||'GI');if(facts)facts.hidden=true;resume.disabled=false;resume.textContent=context?.team?'Choose a season':'Set up team';delete resume.dataset.wsRoute;delete resume.dataset.wsGame;resume.dataset.wsAction='seasons';return;}const summary=this._gameSummary(game);const active=String(this.app.storage.seasonStore.data?.activeGameId||'')===String(game.id);this._text('wsGameEyebrow',active?'Continue where you left off':'Selected game');this._text('wsContinueTitle',this._gameName(game));this._text('wsContinueMeta',[summary.date,summary.status].filter(Boolean).join(' · '));this._text('wsScoreValue',summary.score);this._text('wsPlaysValue',String(summary.total));this._text('wsChartedValue',`${summary.tagged} / ${summary.total}`);this._text('wsUnitsValue',`O ${summary.offense} · D ${summary.defense} · ST ${summary.special}`);this._text('wsProgressText',summary.total?`${summary.tagged} of ${summary.total} charted`:'0 plays');this.root.querySelector('#wsProgressBar').style.width=`${summary.pct}%`;this._text('wsGameMark',(game.gameInfo?.opponent||context?.team?.name||'GI').trim().charAt(0).toUpperCase()||'GI');if(facts)facts.hidden=false;resume.disabled=false;resume.textContent=active?'Continue breakdown':'Open selected game';delete resume.dataset.wsAction;delete resume.dataset.wsRoute;resume.dataset.wsGame=String(game.id);}
  _gameSummary(game){const plays=game?.plays||[];const tagged=plays.filter(isPlayTagged).length;const units={offense:0,defense:0,special:0};plays.forEach(play=>{const unit=play?.tags?.unit||'offense';if(Object.hasOwn(units,unit))units[unit]++;});const gi=game?.gameInfo||{};const hasUs=gi.scoreUs!==''&&gi.scoreUs!=null&&Number.isFinite(Number(gi.scoreUs));const hasThem=gi.scoreThem!==''&&gi.scoreThem!=null&&Number.isFinite(Number(gi.scoreThem));return{total:plays.length,tagged,pct:plays.length?Math.round(tagged/plays.length*100):0,offense:units.offense,defense:units.defense,special:units.special,score:hasUs&&hasThem?`${Number(gi.scoreUs)}–${Number(gi.scoreThem)}`:'Not entered',date:this._dateLabel(gi.date),status:String(game.status||'not_started').replace(/_/g,' ')};}
  _chartedLabel(game){const s=this._gameSummary(game);return s.total?`${s.tagged} of ${s.total} charted`:'0 plays';}
  _dateLabel(value){if(!value)return'';const d=new Date(`${value}T12:00:00`);return Number.isNaN(d.getTime())?String(value):d.toLocaleDateString(undefined,{month:'short',day:'numeric',year:'numeric'});}
  /** Reports now has a real shell route, so this navigates there instead of
   *  revealing the classic outlet (which is what used to expose the retired
   *  top bar underneath). Kept as the named entry point Study links to. */
  showAdvancedReports(){ if(!this.root) return; return this.show('reports'); }
  async _openLibrary(){const home=this.root.querySelector('#wsHome'),breakdown=this.root.querySelector('#wsBreakdown'),study=this.root.querySelector('#wsStudy'),plan=this.root.querySelector('#wsPlan'),outlet=this.root.querySelector('#wsClassicOutlet');home.hidden=true;breakdown.hidden=true;study.hidden=true;plan.hidden=true;outlet.hidden=false;await this.app.library.open();}
  /** Home's direct "New game" action (C1 finding 4): with Home the sole game
   * entry, creating a game belongs on Home, not buried under More. Creates the
   * game in the active season (reusing a still-empty active game rather than
   * stacking husks — storage.newGame owns that) and opens it into Break Down
   * through the one authoritative open command. No season open → send the coach
   * to the library to pick or create one first. */
  async _newGame(){const store=this.app.storage?.seasonStore;if(!store?.hasCurrent?.()){await this._openLibrary();return;}const g=this.app.storage.newGame();if(g?.id!=null)await this.app.openGame(g.id);}
  _remember(el){return el?{el,parent:el.parentNode,next:el.nextSibling}:null;}
  _restore(slot){if(!slot?.el||!slot.parent)return;const next=slot.next?.parentNode===slot.parent?slot.next:null;slot.parent.insertBefore(slot.el,next);}
  _mountChrome(){const tools=this.root?.querySelector('.ws-global-tools');if(tools){if(this._chrome.settings?.el)tools.append(this._chrome.settings.el);if(this._chrome.more?.el)tools.append(this._chrome.more.el);}if(this._chrome.drawer?.el)document.body.append(this._chrome.drawer.el);}
  _restoreChrome(){this.app.uiPolish?._closeDrawer?.();document.getElementById('moreDropdown')?.classList.add('hidden');this._restore(this._chrome.settings);this._restore(this._chrome.more);this._restore(this._chrome.drawer);}
  _gameName(g){return g.name||g.gameInfo?.projectName||g.gameInfo?.opponent||'Untitled Game';}
  _text(id,v){const el=this.root?.querySelector(`#${id}`);if(el)el.textContent=v;}
  _esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
}
