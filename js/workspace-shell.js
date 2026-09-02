import { isPlayTagged } from './football-rules.js';

/**
 * The one native application shell.
 *
 * It owns navigation and application chrome. Domain controllers expose state
 * and commands directly; no hidden or alternate presentation is mounted.
 */
export class WorkspaceShell {
  constructor(app) {
    this.app = app;
    this.root = null;
    this._btnUndo = null;
    this._btnRedo = null;
    this._historyUnsub = null;
  }
  /** Read-only compatibility pointer: HomeScreen owns the actual preview
   *  selection now (2026-08-31 Home rebuild); kept so anything still reading
   *  the shell for the previewed-but-not-active game id has one stable
   *  place to look. */
  get _homeSelectedGameId() { return this.app.homeScreen?.selectedGameId || null; }
  // The redesigned workspace is THE product — there is no classic-layout escape
  // hatch and no second game-entry route (C1, binding amendment 2026-07-23). The
  // shell mounts unconditionally on every build.
  async init() { await this.enable(); }
  async enable() {
    if (!this.root) this._mount();
    document.body.classList.add('ws-shell-active');
    await this.show(this.app.workspace.currentRoute() || 'home');
  }
  // Internal lifecycle only — the tested mount/restore teardown contract (proves
  // the shell rebuilds cleanly with no leaked listeners/subscriptions). NOT a
  // product path: there is no user affordance that reaches it.
  disable() {
    if (!this.root) return;
    this.app.homeScreen?.restore();
    this.app.studyScreen?.restore();
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
      <section class="ws-home" id="wsHome" hidden></section>
      <section class="ws-team-hub" id="wsTeamHub" hidden></section><section class="ws-breakdown" id="wsBreakdown" hidden></section><section class="ws-study" id="wsStudy" hidden></section><section class="ws-reports" id="wsReports" hidden></section><section class="ws-plan-state" id="wsPlan" hidden></section></main><nav class="ws-mobile-nav" aria-label="Workspace">${this._navButtons()}</nav>`;
    document.body.appendChild(root);
    this.root = root;
    this._mountChrome();
    this.app.homeScreen?.mount(root.querySelector('#wsHome'));
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
      // Home's own actions (Add game, Continue Charting, preview selection,
      // Open Study/Reports for the previewed game, Season report) are owned
      // by the native HomeScreen/native-home.jsx component now (2026-08-31
      // Home rebuild) -- wired directly as onClick handlers there, not
      // through this delegated shell handler.
      if (action === 'settings') this.app.settingsScreen?.open?.({ returnFocus: e.target.closest('[data-ws-action]') });
      if (action === 'more') { this._openMore(e.target.closest('[data-ws-action]')); return; }
      if (action === 'game-switch') { await this._openGameSwitch(e.target.closest('[data-ws-action]')); return; }
      if (action === 'program-switch') { await this._openProgramSwitch(e.target.closest('[data-ws-action]')); return; }
      if (action === 'season-switch') { await this._openSeasonSwitch(e.target.closest('[data-ws-action]')); return; }
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
    // HomeScreen owns preview-reset itself: a preview belongs only to the
    // current Home visit, so it resets on a genuine season change AND on any
    // route round trip back to Home (2026-08-31 Home rebuild).
    if (routeId==='home') { await this.app.homeScreen?.show(previousRoute); }
    // Every route's Preact tree stays mounted (hidden), never torn down, for
    // the app's whole life -- this is what lets Home's season rail flag
    // itself inactive rather than rendering a second hidden copy of Team
    // Hub's own season-row markup once the coach navigates elsewhere.
    else { this.app.homeScreen?.leave(); }
    if (routeId==='breakdown') {}
    if (routeId==='study') { this.app.studyScreen?.show(); }
    if (routeId==='reports') { this.app.reportsScreen?.show(); this.app._markSeenStats?.(); }
    if (routeId==='plan') { this.app.planScreen?.show(); }
    return result;
  }
  /** Re-apply the CURRENT route's visibility with NO navigation side effects.
   *  Callers need a non-navigating re-apply: `show()` calls `library.hide()`,
   *  which calls this, so routing back through `show()` would recurse. */
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
  /** Season/game presentation formatting still shared with `_switchDetail`
   *  (the Game context-switcher popover, still shell-owned) -- Home's own
   *  rendering moved entirely to `HomeScreen`/`native-home.jsx` in the
   *  2026-08-31 rebuild, which carries its own copies of these formulas
   *  rather than reaching back into the shell. */
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
    if(!this.app.teamRegistry?.teams?.().length){
      await this.show('home');
      requestAnimationFrame(()=>document.querySelector('[data-first-launch] input[name="school"]')?.focus());
      return false;
    }
    if(this.root.dataset.route!=='team-hub')this._teamHubReturnRoute=this.app.workspace.currentRoute()||'home';
    this.app.cutupPlayer?.stop();
    document.body.classList.remove('ws-route-home','ws-route-breakdown','ws-route-study','ws-route-reports','ws-route-plan');
    document.body.classList.add('ws-route-team-hub');
    this.root.dataset.route='team-hub';
    this.root.querySelectorAll('[data-ws-route]').forEach(button=>button.classList.remove('active'));
    this._setRouteVisibility('hub');
    this._syncChrome();
    this.app.homeScreen?.leave();
    await this.app.teamHubScreen?.show?.();
    return true;
  }
  async closeTeamHub(){
    const target=this._teamHubReturnRoute||'home';
    this._teamHubReturnRoute='home';
    const guarded=this.app.workspace.guard?.(target);
    return this.show(guarded?.ok?target:'home');
  }
  /** Home's direct "New game" action (C1 finding 4), reused by the mobile More
   *  menu -- HomeScreen.addGame() owns the one transaction (GameScreen create
   *  + the authoritative App.openGame() open, or a trip to the library with no
   *  season open) so there is exactly one implementation. */
  async _newGame(){ await this.app.homeScreen?.addGame?.(); }
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
      onSelect:async()=>{ if(await this.app.teamHubScreen?.switchTeam?.(team.id)) { await this.show('home'); } }}));
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
          onSelect:async()=>{ if(String(season.id)===String(currentId)) return; await this.app.storage.openSeasonById(season.id); await this.show('home'); }}));
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
      {key:'call-sheet',label:'Build call sheet',onSelect:()=>this.app.callSheet.show({ returnFocus: anchor })},
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
