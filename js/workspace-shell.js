/** Feature-flagged Phase 1 shell. Hosts the existing #app intact. */
export class WorkspaceShell {
  constructor(app) { this.app = app; this.root = null; this.classicApp = null; this._homeToken = 0; }
  flagEnabled() { try { return localStorage.getItem('ffa_workspace_shell_v2') === '1'; } catch { return false; } }
  async init() { if (this.flagEnabled()) await this.enable(); }
  async enable() {
    try { localStorage.setItem('ffa_workspace_shell_v2', '1'); } catch {}
    if (!this.root) this._mount();
    document.body.classList.add('ws-shell-active');
    await this.show(this.app.workspace.currentRoute() || 'home');
  }
  useClassic(reload = true) { try { localStorage.removeItem('ffa_workspace_shell_v2'); } catch {} if (reload) location.reload(); else this.disable(); }
  disable() {
    if (!this.root) return;
    this._homeToken++;
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
      <div class="ws-side-foot"><button class="ws-classic" data-ws-action="classic">Use classic layout</button><div class="ws-save-state"><i></i>Season ready</div></div></aside>
      <main class="ws-main"><header class="ws-topbar"><div class="ws-context"><span id="wsContextTeam">Team</span><b>›</b><span id="wsContextSeason">No season open</span><b>›</b><strong id="wsContextGame">Team home</strong></div><div class="ws-top-actions"><span class="ws-film-chip" id="wsTopFilm">No film selected</span><button class="ws-icon-btn" data-ws-action="seasons" aria-label="Teams and seasons">⋯</button></div></header>
      <header class="ws-mobile-head"><button class="ws-mobile-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><select id="wsMobileRoute" aria-label="Workspace view"><option value="home">Home</option><option value="breakdown">Break Down</option><option value="study">Study</option><option value="plan">Plan</option></select><button class="ws-icon-btn" data-ws-action="seasons" aria-label="Teams and seasons">⋯</button></header>
      <section class="ws-home" id="wsHome"><div class="ws-home-head"><div><div class="ws-eyebrow">Team workspace</div><h1 id="wsGreeting">HOME</h1><p id="wsHomeSummary">Choose a season to get started.</p></div><button class="ws-btn ws-primary" id="wsResume" data-ws-route="breakdown" disabled>Continue breakdown</button></div>
      <section class="ws-continue"><div class="ws-game-mark" id="wsGameMark">GI</div><div><div class="ws-eyebrow">Continue where you left off</div><h2 id="wsContinueTitle">No game open</h2><p id="wsContinueMeta">Open a season to continue.</p></div><div class="ws-progress"><span>Breakdown progress</span><strong id="wsProgressText">0 plays</strong><div><i id="wsProgressBar"></i></div></div></section>
      <div class="ws-home-grid"><section class="ws-band"><div class="ws-section-head"><h2>FILM INBOX</h2><button class="ws-link" data-ws-action="seasons">Seasons</button></div><div class="ws-list" id="wsFilmList"></div></section><section class="ws-band"><div class="ws-section-head"><h2>SEASONS</h2><button class="ws-link" data-ws-action="seasons">Manage</button></div><div class="ws-list" id="wsSeasonList"></div></section></div></section>
      <section class="ws-study" id="wsStudy" hidden></section><section class="ws-plan-state" id="wsPlan" hidden><div><span>PLAN</span><h1>No game plan yet</h1><button class="ws-btn" data-ws-route="study">Open Study</button></div></section><div class="ws-classic-outlet" id="wsClassicOutlet" hidden></div></main>`;
    document.body.appendChild(root); root.querySelector('#wsClassicOutlet').appendChild(this.classicApp); this.root = root; this.app.studyScreen?.mount(root.querySelector('#wsStudy')); this._bind();
  }
  _navButtons() { const icons = { home:'⌂', breakdown:'▶', study:'▦', plan:'▤' }; return this.app.workspace.listRoutes().map(r => `<button data-ws-route="${r.id}"><span>${icons[r.id]}</span>${r.name}</button>`).join(''); }
  _bind() {
    this.root.addEventListener('click', async e => {
      const route = e.target.closest('[data-ws-route]')?.dataset.wsRoute;
      if (route) { e.preventDefault(); await this.show(route); return; }
      const action = e.target.closest('[data-ws-action]')?.dataset.wsAction;
      if (action === 'classic') this.useClassic();
      if (action === 'seasons') await this._openLibrary();
      const sid = e.target.closest('[data-ws-season]')?.dataset.wsSeason;
      if (sid) { await this.app.storage.openSeasonById(sid); await this.show('home'); }
      const gid = e.target.closest('[data-ws-game]')?.dataset.wsGame;
      if (gid) { if (this.app.storage.seasonStore.data?.activeGameId !== gid) this.app.storage.switchToGame(gid); await this.show('breakdown'); }
    });
    this.root.querySelector('#wsMobileRoute').addEventListener('change', e => this.show(e.target.value));
  }
  async show(routeId) {
    if (!this.root) return { ok:false, reason:'shell-disabled' };
    const result = this.app.workspace.navigate(routeId); this._syncChrome(); if (!result.ok) return result;
    if (routeId !== 'breakdown') this.app.cutupPlayer?.stop();
    document.body.classList.remove('ws-route-home', 'ws-route-breakdown', 'ws-route-study', 'ws-route-plan');
    document.body.classList.add(`ws-route-${routeId}`);
    this.root.dataset.route = routeId;
    this.root.querySelectorAll('[data-ws-route]').forEach(b => b.classList.toggle('active', b.dataset.wsRoute === routeId));
    this.root.querySelector('#wsMobileRoute').value = routeId;
    const home=this.root.querySelector('#wsHome'), study=this.root.querySelector('#wsStudy'), plan=this.root.querySelector('#wsPlan'), outlet=this.root.querySelector('#wsClassicOutlet');
    home.hidden=routeId!=='home'; study.hidden=routeId!=='study'; plan.hidden=routeId!=='plan'; outlet.hidden=routeId!=='breakdown';
    if (routeId==='home') await this.refreshHome();
    if (routeId==='breakdown') { this.app.stats?.hideDashboard(); this.app.library?.hide(); }
    if (routeId==='study') { this.app.stats?.hideDashboard(); this.app.library?.hide(); this.app.studyScreen?.show(); }
    return result;
  }
  _syncChrome() {
    if (!this.root) return; const c=this.app.workspace.snapshot();
    this._text('wsTeamName',c.team?.name||'Team'); this._text('wsTeamMeta',c.season?.name||'Season workspace'); this._text('wsContextTeam',c.team?.name||'Team'); this._text('wsContextSeason',c.season?.name||'No season open'); this._text('wsContextGame',c.game?.name||'Team home');
    this.root.querySelectorAll('[data-ws-route="breakdown"]').forEach(b=>b.disabled=!c.capabilities.canBreakDown);
    this.root.querySelectorAll('[data-ws-route="study"],[data-ws-route="plan"]').forEach(b=>b.disabled=!c.capabilities.canStudy);
  }
  async refreshHome() {
    if (!this.root) return; const token=++this._homeToken; this._syncChrome(); const c=this.app.workspace.snapshot(); const store=this.app.storage.seasonStore; const game=store.data ? store.activeGame?.() : null;
    this._text('wsGreeting',c.team?.name?`${c.team.name.toUpperCase()} HOME`:'TEAM HOME'); this._text('wsContinueTitle',c.game?.name||'No game open'); this._text('wsContinueMeta',c.game?`${c.game.playCount} plays · ${c.game.status.replace(/_/g,' ')}`:'Open a season to continue.'); this.root.querySelector('#wsResume').disabled=!c.capabilities.canBreakDown;
    const tagged=(game?.plays||[]).filter(p=>p?.tags&&(p.tags.playType||p.tags.runPass||p.tags.stType||p.tags.defFront||p.tags.coverage)).length,total=(game?.plays||[]).length,pct=total?Math.round(tagged/total*100):0;
    this._text('wsProgressText',total?`${tagged} of ${total} charted`:'0 plays'); this.root.querySelector('#wsProgressBar').style.width=`${pct}%`; this._text('wsHomeSummary',c.season?`${c.season.name} · ${c.season.gameCount} game${c.season.gameCount===1?'':'s'}`:'Choose a season to get started.'); this._text('wsGameMark',(c.game?.opponent||c.team?.name||'GI').trim().charAt(0).toUpperCase()||'GI');
    let seasons=[]; try{seasons=await this.app.storage.listSeasons();}catch{} try{if(this.app.library?._teams?.().length)seasons=this.app.library._teamSeasons(seasons,this.app.library._activeTeamId());}catch{}
    if(token!==this._homeToken||!this.root)return; this._renderSeasons(seasons,c.season?.id);
    const games=store.data?.games||[],list=this.root.querySelector('#wsFilmList');
    if(!games.length){list.innerHTML='<div class="ws-empty">No games in the active season.</div>';this._text('wsTopFilm','No film selected');return;}
    list.innerHTML=games.map(g=>`<div class="ws-film-row ws-loading" data-film-id="${this._esc(g.id)}"><i></i><div><strong>${this._esc(this._gameName(g))}</strong><span>Checking film…</span></div><button class="ws-btn ws-small" data-ws-game="${this._esc(g.id)}">Open</button></div>`).join('');
    const health=await Promise.all(games.map(g=>this.app.workspace.filmHealth(g).catch(()=>({state:'missing',label:'Film unavailable',action:'repair',expected:0,found:0}))));
    if(token!==this._homeToken||!this.root||c.season?.id!==this.app.workspace.snapshot().season?.id)return;
    games.forEach((g,i)=>this._renderFilmRow(g,health[i])); const ai=games.findIndex(g=>g.id===c.game?.id); this._text('wsTopFilm',ai>=0?health[ai].label:'No film selected');
  }
  _renderSeasons(seasons,currentId){const list=this.root.querySelector('#wsSeasonList');if(!seasons.length){list.innerHTML='<div class="ws-empty">No seasons for this team.</div>';return;}const live=this.app.storage.seasonStore.data;list.innerHTML=seasons.slice(0,6).map(s=>{const isCurrent=s.id===currentId;const games=isCurrent&&live?live.games.length:(s.games||0);const plays=isCurrent&&live?live.games.reduce((n,g)=>n+(g.plays?.length||0),0):(s.plays||0);return `<div class="ws-season-row${isCurrent?' current':''}"><div><strong>${this._esc(s.name||'Untitled Season')}</strong><span>${games} game${games===1?'':'s'} · ${plays} play${plays===1?'':'s'}</span></div><button class="ws-btn ws-small" data-ws-season="${this._esc(s.id)}">${isCurrent?'Current':'Open'}</button></div>`;}).join('');}
  _renderFilmRow(game,h){const row=this.root.querySelector(`[data-film-id="${CSS.escape(String(game.id))}"]`);if(!row)return;row.className=`ws-film-row state-${h.state}`;const detail=h.progress?`${h.progress.done} of ${h.progress.total||'?'} clips`:h.expected?`${h.found} of ${h.expected} clips`:'';row.querySelector('span').textContent=detail?`${h.label} · ${detail}`:h.label;row.querySelector('button').textContent=h.action==='reconnect'?'Reconnect':h.action==='repair'?'Repair':'Open';}
  showAdvancedReports(){if(!this.root)return;this.root.querySelector('#wsStudy').hidden=true;this.root.querySelector('#wsClassicOutlet').hidden=false;this.app.stats?.showDashboard();}
  async _openLibrary(){const home=this.root.querySelector('#wsHome'),study=this.root.querySelector('#wsStudy'),plan=this.root.querySelector('#wsPlan'),outlet=this.root.querySelector('#wsClassicOutlet');home.hidden=true;study.hidden=true;plan.hidden=true;outlet.hidden=false;await this.app.library.open();}
  _gameName(g){return g.name||g.gameInfo?.projectName||g.gameInfo?.opponent||'Untitled Game';}
  _text(id,v){const el=this.root?.querySelector(`#${id}`);if(el)el.textContent=v;}
  _esc(v){return String(v??'').replace(/[&<>"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));}
}
