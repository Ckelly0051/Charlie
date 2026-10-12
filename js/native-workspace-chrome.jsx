import { Fragment } from 'preact';

function RouteButtons({ routes }) {
  const icons = { home: '\u2302', breakdown: '\u25b6', study: '\u25a6', reports: '\u25a5', plan: '\u25a4' };
  return routes.map(route => <button data-ws-route={route.id}><span>{icons[route.id] || '\u2022'}</span>{route.name}</button>);
}

export function WorkspaceChrome({ routes }) {
  return <Fragment>
    <main class="ws-main">
      <header class="ws-topbar">
        <button class="ws-top-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button>
        <nav class="ws-top-nav" aria-label="Workspace"><RouteButtons routes={routes}/></nav>
        <div class="ws-top-actions">
          <span class="ws-film-chip" id="wsTopFilm">No film selected</span><div class="ws-global-tools"/>
          <button class="ws-icon-btn ws-more-btn" id="btnNativeMore" data-ws-action="more" aria-haspopup="menu" aria-expanded="false">More <span aria-hidden="true">{'\u25be'}</span></button>
        </div>
      </header>
      <section class="ws-contextbar" id="wsContextBar" aria-label="Football context">
        <button class="ws-ctx" id="wsCtxProgram" data-ws-action="program-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Program</span><span class="ws-ctx-value" id="wsCtxProgramValue">Team</span><b class="ws-ctx-chev" aria-hidden="true">{'\u25be'}</b></button>
        <button class="ws-ctx" id="wsCtxSeason" data-ws-action="season-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Season</span><span class="ws-ctx-value" id="wsCtxSeasonValue">No season open</span><b class="ws-ctx-chev" aria-hidden="true">{'\u25be'}</b></button>
        <button class="ws-ctx" id="wsCtxGame" data-ws-action="game-switch" aria-haspopup="menu" aria-expanded="false"><span class="ws-ctx-label">Game</span><span class="ws-ctx-value" id="wsCtxGameValue">Team home</span><b class="ws-ctx-chev" aria-hidden="true">{'\u25be'}</b></button>
        <div class="ws-workspace-switch" role="group" aria-label="Workspace"><button type="button" data-ws-action="workspace-program" aria-pressed="true">Our Program</button><button type="button" class="is-scout" data-ws-action="workspace-scout" aria-pressed="false">Opponent Scout</button></div>
      </section>
      <header class="ws-mobile-head"><button class="ws-mobile-brand" data-ws-route="home">GRIDIRON <b>IQ</b></button><strong id="wsMobileContext">Team home</strong><button class="ws-icon-btn" id="btnNativeMoreMobile" data-ws-action="more" aria-label="Settings and more" aria-haspopup="menu" aria-expanded="false">{'\u22ef'}</button></header>
      <section class="ws-home" id="wsHome" hidden/>
      <section class="ws-breakdown" id="wsBreakdown" hidden/><section class="ws-study" id="wsStudy" hidden/><section class="ws-reports" id="wsReports" hidden/><section class="ws-plan-state" id="wsPlan" hidden/>
    </main>
    <nav class="ws-mobile-nav" aria-label="Workspace"><RouteButtons routes={routes}/></nav>
  </Fragment>;
}

export function GlobalTools() {
  return <Fragment>
    <button class="ws-icon-btn" type="button" data-ws-tool="undo" title="Undo (Ctrl+Z)" aria-label="Undo" disabled><svg class="icon"><use href="assets/icons.svg#icon-undo"/></svg></button>
    <button class="ws-icon-btn" type="button" data-ws-tool="redo" title="Redo (Ctrl+Shift+Z)" aria-label="Redo" disabled><svg class="icon"><use href="assets/icons.svg#icon-redo"/></svg></button>
    <button class="ws-icon-btn" type="button" data-ws-tool="shortcuts" title="Keyboard shortcuts (press ?)" aria-label="Keyboard shortcuts"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="6" width="20" height="12" rx="2"/><line x1="6" y1="10" x2="6" y2="10"/><line x1="10" y1="10" x2="10" y2="10"/><line x1="14" y1="10" x2="14" y2="10"/><line x1="18" y1="10" x2="18" y2="10"/><line x1="7" y1="14" x2="17" y2="14"/></svg></button>
    <button class="ws-icon-btn" type="button" data-ws-tool="settings" title="Team & Film Settings" aria-label="Team and Film Settings"><svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="4" y1="7" x2="20" y2="7"/><line x1="4" y1="12" x2="20" y2="12"/><line x1="4" y1="17" x2="20" y2="17"/></svg></button>
  </Fragment>;
}
