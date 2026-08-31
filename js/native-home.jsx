import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { WorkspaceChoice, SeasonRow } from './native-team-hub.jsx';
import '../css/native-home.css';

const icon = name => <svg class="icon" aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;

function useScreen(screen) {
  const [state, setState] = useState(() => screen.snapshot());
  useEffect(() => screen.subscribe(setState), [screen]);
  return state;
}

/** ONE detached, muted, never-DOM-attached capture per card -- the same
 *  `GameThumbnailService` the coach's real film already resolves through
 *  (managed copy or linked folder), never a second image-resolution path.
 *
 *  Demand is VISIBILITY-driven, not mount-driven: a season with dozens of
 *  games would otherwise fire one decode per row the instant Home renders,
 *  regardless of how many rows are actually on screen. An IntersectionObserver
 *  requests exactly once, the moment the card is about to enter the viewport
 *  (a 200px lookahead margin so scrolling feels instant), then disconnects --
 *  it never re-fires for a card that scrolls off and back on. The selected-
 *  game detail panel is exempt: it is, by construction, on screen the instant
 *  it renders, so it requests immediately rather than waiting on a callback. */
function Thumbnail({ screen, game, detail = false }) {
  const url = screen.thumbnailFor(game.id);
  const film = screen.rowFilmView(game.id);
  const nodeRef = useRef(null);
  useEffect(() => {
    if (url) return undefined; // already have a frame for this identity
    if (detail) { screen.requestThumbnail(game); return undefined; }
    const el = nodeRef.current;
    if (!el || typeof IntersectionObserver !== 'function') { screen.requestThumbnail(game); return undefined; }
    let fired = false;
    const observer = new IntersectionObserver(entries => {
      if (fired || !entries.some(entry => entry.isIntersecting)) return;
      fired = true;
      observer.disconnect();
      screen.requestThumbnail(game);
    }, { root: null, rootMargin: '200px 0px', threshold: 0.01 });
    observer.observe(el);
    return () => observer.disconnect();
  }, [game.id, game.filmMode, game.filmDir, detail]);
  return <div class="thumbnail" ref={nodeRef}>
    {url ? <img src={url} alt={`Game film: ${screen.matchupTitle(game)}`} loading="lazy" />
      : <span class="film-missing">{icon('film')}{film.cls === 'ws-fact-green' ? 'Film linked' : 'No film linked'}</span>}
    {game.gameInfo?.week ? <span class="week">Week {game.gameInfo.week}</span> : null}
    {detail && film.cls === 'ws-fact-green'
      ? <button type="button" data-ws-action="continue" aria-label={`Watch ${screen.matchupTitle(game)}`} title="Watch game film" onClick={() => screen.continueCharting(screen.selectedGameId)}>{icon('play')}</button>
      : null}
  </div>;
}

function HomeHead({ screen, state, hasSeason, scout, c, games }) {
  const record = scout ? { text: c.season?.name || 'Opponent' } : screen.seasonRecord();
  const summary = hasSeason
    ? (scout
      ? `${games.length} source game${games.length === 1 ? '' : 's'} · isolated from our schedule and team totals`
      : [screen.teamName(), record.text, `${games.length} game${games.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))
    : (c.team ? 'Choose or create a season to get started.' : 'Set up your team to get started.');
  const greeting = hasSeason ? (scout ? `${(c.season?.name || 'Opponent').toUpperCase()} SCOUT` : (c.season?.name || 'SEASON').toUpperCase())
    : (c.team ? `${c.team.name.toUpperCase()} HOME` : 'TEAM HOME');
  return <div class="ws-home-head">
    <div>
      <div class="ws-eyebrow" id="wsHomeEyebrow">{screen.eyebrow()}</div>
      <h1 id="wsGreeting">{greeting}</h1>
      <p id="wsHomeSummary">{summary}</p>
    </div>
    <div class="ws-home-actions">
      <button type="button" class="ws-btn" data-ws-action="settings" onClick={event => screen.app.settingsScreen?.open?.({ returnFocus: event.currentTarget })}>Team &amp; Film Settings</button>
      {hasSeason && games.length ? <button type="button" class="ws-btn" data-ws-action="season-report" onClick={() => screen.openSeasonReport()}>{scout ? 'Scout report' : 'Season report'}</button> : null}
      <button type="button" class="ws-btn ws-primary" data-ws-action="new-game" onClick={() => screen.addGame()}>+ {scout ? 'Add source game' : 'Add game'}</button>
    </div>
  </div>;
}

function EmptySeasonPanel({ screen, scout }) {
  return <div class="ws-empty-panel">
    <h3>{scout ? 'No source games yet' : 'No games in this season yet'}</h3>
    <p>{scout ? 'Add film the opponent played against another team, keeping both real team names.' : 'Add the opponent and date. Film can be linked now or later.'}</p>
    <button type="button" class="ws-btn ws-primary" onClick={() => screen.addGame()}>+ {scout ? 'Add source game' : 'Add game'}</button>
  </div>;
}

function GameCard({ screen, game, selected }) {
  const summary = screen.gameSummary(game);
  const film = screen.rowFilmView(game.id);
  return <button type="button" class={`ws-game-row${selected ? ' selected' : ''}`}
    data-ws-preview={game.id} data-game-id={game.id} aria-pressed={selected ? 'true' : 'false'}
    aria-label={`Select ${screen.matchupTitle(game)}`}
    onClick={() => screen.selectGame(game.id)}>
    <Thumbnail screen={screen} game={game} />
    <div class="game-card-copy">
      <h3>{screen.matchupTitle(game)}</h3>
      <p class="matchup-schools">{screen.matchupSchoolLine(game)}</p>
      <div class="game-meta">
        <span>{screen.dateLabel(game.gameInfo?.date) || 'Date not set'}</span>
        <span class="score">{summary.score !== 'Not entered' ? `${summary.score} · Final` : summary.total ? 'Score not set' : 'Scheduled'}</span>
      </div>
      <div class="card-status">
        <span>{summary.tagged} / {summary.total} charted</span>
        <span class={`health ${film.cls === 'ws-fact-green' ? '' : 'warning'}`} data-film-health><strong class={film.cls}>{film.text}</strong></span>
      </div>
      {summary.tagged < summary.total ? <div class="tiny-progress"><span style={{ width: `${summary.pct}%` }} /></div> : null}
    </div>
  </button>;
}

function GameDetail({ screen, game, c, scout }) {
  if (!game) return <aside class="detail-pane" id="wsGameDetail"><h3>Select a game</h3><p class="muted">Choose a game to open its film and analysis.</p></aside>;
  const summary = screen.gameSummary(game);
  const active = screen.isActive(game.id);
  const matchup = screen.matchupTitle(game);
  const filmFact = screen.filmFactView(game.id);
  const filmReady = filmFact.cls === 'ws-fact-green';
  const [homeIdentity, awayIdentity] = screen.identities(game);
  const usName = scout ? homeIdentity.name : (c.team?.name || 'Us');
  return <aside class="detail-pane" id="wsGameDetail" aria-label="Selected game">
    <div class="detail-top">
      <span id="wsContinueTitle">{matchup}{active ? ` · ${screen.activeRouteLabel()}` : ''}</span>
      <button type="button" class="icon-btn" data-ws-action="game-menu" title="Game settings and actions" aria-label="Game settings and actions" onClick={event => screen.openGameSettings(screen.selectedGameId, event.currentTarget)}>&hellip;</button>
    </div>
    <div class="detail-main">
      <div class="detail-identity">
        <Thumbnail screen={screen} game={game} detail />
        <div>
          <h2 id="wsDetailName">{(scout ? matchup : (game.gameInfo?.opponent || matchup)).toUpperCase()}</h2>
          <p class="matchup-schools">{screen.matchupSchoolLine(game)}</p>
          <p class="detail-date" id="wsDetailMeta">{[summary.date, summary.status].filter(Boolean).join(' · ')}</p>
        </div>
      </div>
      <div class="scoreboard">
        <div class="team"><small id="wsDetailUsLabel">{usName || 'Us'}</small><strong id="wsDetailUsScore">{summary.score !== 'Not entered' ? summary.score.split('–')[0] : '—'}</strong></div>
        <span>{summary.score !== 'Not entered' ? 'FINAL' : summary.total ? 'NO SCORE' : 'SCHEDULED'}</span>
        <div class="team"><small id="wsDetailThemLabel">{scout ? awayIdentity.name : (game.gameInfo?.opponent || 'Them')}</small><strong id="wsDetailThemScore">{summary.score !== 'Not entered' ? summary.score.split('–')[1] : '—'}</strong></div>
      </div>
    </div>
    <div class="detail-side">
      <div class="detail-status">
        <span class={`health ${filmReady ? '' : 'warning'}`} data-film-fact><strong id="wsFactFilm" class={filmFact.cls}>{filmFact.text}</strong></span>
        <button type="button" data-ws-action="link-film" onClick={event => screen.openLinkFilm(screen.selectedGameId, event.currentTarget)}>{filmReady ? 'Manage film' : 'Link film'}</button>
      </div>
      <div class="facts-grid">
        <div class="fact"><label>Total plays</label><strong id="wsFactPlays">{summary.total}</strong></div>
        <div class="fact"><label>Plays charted</label><strong id="wsFactCharted">{summary.tagged} / {summary.total}</strong></div>
        <div class="fact"><label>Plays per phase</label><strong id="wsFactPhase">{summary.unitProgress.map(u => `${u.short} ${u.total}`).join(' · ')}</strong></div>
      </div>
      <ul id="wsPhaseRows" class="ws-phase-rows">
        {summary.unitProgress.map(u => <li class="ws-phase-row"><b>{u.short}</b><span class={`ws-bar${u.key === 'defense' ? ' cyan' : u.key === 'special' ? ' gold' : ''}`}><i style={{ width: `${u.total ? u.pct : 0}%` }} /></span><span>{u.total}</span></li>)}
      </ul>
      <div class="detail-actions">
        <button type="button" class="ws-btn ws-gold" id="wsContinueCharting" disabled={!game}
          onClick={() => screen.continueCharting(screen.selectedGameId)}>
          {active ? 'Continue charting' : (scout ? 'Open source game' : 'Open selected game')}
        </button>
        <button type="button" class="ws-btn" data-ws-action="open-study" onClick={() => screen.openStudy(screen.selectedGameId)}>Open Study</button>
        <button type="button" class="ws-btn" data-ws-action="open-reports" onClick={() => screen.openReportsForGame(screen.selectedGameId)}>Open Reports</button>
        <button type="button" class="ws-btn plan-link" onClick={() => screen.openPlan()}><strong>Season plans</strong><span>Open &rarr;</span></button>
      </div>
    </div>
  </aside>;
}

function GameWorkspace({ screen, state, games, scout, c }) {
  const filtered = screen.filteredGames();
  const counts = screen.filterCounts();
  const selected = screen.selectedGame();
  return <div class="game-workspace">
    <section class="library-pane" aria-label="Games">
      <div class="library-tools">
        <label class="search"><input id="game-search" aria-label="Search games" placeholder={scout ? 'Search source games…' : 'Search games…'} value={state.query} onInput={event => screen.setQuery(event.currentTarget.value)} /></label>
        <select class="sort" aria-label="Sort games" value={state.sort} onChange={event => screen.setSort(event.currentTarget.value)}>
          <option value="newest">Newest first</option>
          <option value="schedule">Schedule order</option>
        </select>
        <div class="view-switch" role="group" aria-label="Game view">
          <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={state.view === 'grid'} onClick={() => screen.setView('grid')}>&#9638;</button>
          <button type="button" aria-label="List view" title="List view" aria-pressed={state.view === 'list'} onClick={() => screen.setView('list')}>&#9776;</button>
        </div>
      </div>
      <div class="filters" role="group" aria-label="Filter games">
        {[['all', 'All games', counts.all], ['chart', 'To chart', counts.chart], ['film', 'Film needed', counts.film]].map(([value, label, count]) =>
          <button type="button" class={state.filter === value ? 'active' : ''} aria-pressed={state.filter === value} onClick={() => screen.setFilter(value)}>{label}<span>{count}</span></button>)}
      </div>
      <div id="wsGameList" class={`game-grid${state.view === 'list' ? ' list' : ''}`}>
        {filtered.length ? filtered.map(game => <GameCard key={game.id} screen={screen} game={game} selected={String(game.id) === String(state.selectedGameId)} />)
          : <div class="empty-results"><h3>{state.query ? 'No matching games' : state.filter === 'film' ? 'All game film is linked' : state.filter === 'chart' ? 'All plays are charted' : 'No games yet'}</h3>
              <p>{state.query ? 'Try another opponent or week.' : state.filter === 'chart' ? 'Ready for Study and Reports.' : state.filter === 'film' ? 'No film links need attention.' : 'Add the opponent and date. Film can be linked now or later.'}</p>
              {state.filter === 'all' && !state.query ? <button type="button" class="ws-btn ws-primary" onClick={() => screen.addGame()}>Add game</button>
                : <button type="button" class="ws-btn" onClick={() => { screen.setQuery(''); screen.setFilter('all'); }}>Show all games</button>}
            </div>}
      </div>
      <div class="section-foot">
        <span>{filtered.length} of {games.length} games</span>
        <div class="roster-action">{!scout ? <button type="button" onClick={event => screen.openRoster(event.currentTarget)}>View roster &rarr;</button> : <button type="button" onClick={() => screen.openSeasonReport()}>Open opponent report &rarr;</button>}</div>
      </div>
    </section>
    <GameDetail screen={screen} game={selected} c={c} scout={scout} />
  </div>;
}

const LEVEL_RANK = { Varsity: 0, JV: 1, Freshman: 2 };

/** Same order the approved comp's sortedSeasons() uses: newest year first,
 *  then Varsity/JV/Freshman/Other, then name -- so the rail and the library
 *  grid below read as one consistent list wherever they appear. */
function orderedSeasons(seasons) {
  return seasons.slice().sort((a, b) =>
    (Number(b.year) - Number(a.year)) ||
    ((LEVEL_RANK[a.level] ?? 3) - (LEVEL_RANK[b.level] ?? 3)) ||
    String(a.name || '').localeCompare(String(b.name || '')));
}
function groupByYear(seasons) {
  const groups = new Map();
  orderedSeasons(seasons).forEach(season => {
    const key = season.year || 'Undated';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(season);
  });
  return [...groups.entries()];
}

/** Persistent season rail. This is a LIVE view onto `TeamHubScreen` -- the
 *  same controller Team Hub itself renders from -- not a second season-
 *  management implementation. Every action (create/open/delete a season,
 *  the season-scoped tools) is the existing `TeamHubScreen`/`HomeScreen`
 *  method, called directly; the rail owns only the year-grouped presentation
 *  the approved comp specifies. "Season library" opens the full Team Hub
 *  screen for anything the compact rail doesn't surface here (team
 *  switching, backup recovery, the control center). */
function SeasonRail({ screen, hub, hubState }) {
  const scout = hubState.workspaceMode === 'scout';
  const seasons = (hubState.seasons || []).filter(s => !!s.isScout === scout);
  const groups = groupByYear(seasons);
  const create = event => scout ? hub.openCreateScout(event.currentTarget) : hub.openCreateSeason(event.currentTarget);
  return <nav class="rail-year" aria-label={scout ? 'Opponents' : 'Seasons'}>
    <div class="rail-head">
      <span class="gi-hub-kicker">{scout ? 'Opponents' : 'Seasons'}</span>
      <button type="button" class="icon-btn" aria-label={scout ? 'New opponent scout' : 'New season'} title={scout ? 'New opponent scout' : 'New season'} onClick={create}>+</button>
    </div>
    <button type="button" class="rail-library-link" onClick={() => screen.openSeasonLibrary()}>Season library</button>
    <div class="rail-groups">
      {groups.length
        ? groups.map(([year, rows]) => <div class="rail-group" key={year}>
            <span class="rail-year-label">{year}</span>
            {rows.map(season => <SeasonRow key={season.id} season={season} screen={hub} />)}
          </div>)
        : <p class="rail-empty">{scout ? 'No opponents yet.' : 'No other seasons yet.'}</p>}
    </div>
    <div class="rail-tools">
      <span class="gi-hub-kicker">Season tools</span>
      <button type="button" onClick={event => screen.openRoster(event.currentTarget)}>Roster</button>
      <button type="button" onClick={event => screen.openFilmSettings(event.currentTarget)}>Film &amp; storage</button>
      {hubState.control?.canReviewSetup ? <button type="button" onClick={event => screen.openSeasonSetup(event.currentTarget)}>Season setup</button> : null}
      <button type="button" onClick={event => screen.manageProgram(event.currentTarget)}>Manage program</button>
    </div>
    <div class="rail-foot"><span class="gi-hub-kicker">Local library</span><span>{hubState.profile?.teamName || screen.teamName() || 'This team'}</span></div>
  </nav>;
}

/** The library state -- no season is currently open. Reuses the same
 *  `SeasonRow`/`WorkspaceChoice` Team Hub renders, so a coach landing here
 *  picks a season (or creates, or recovers one) with the identical cards
 *  they'd see in the full Team Hub. When no team exists anywhere yet, this
 *  does NOT duplicate Team Hub's own first-team form inline -- Team Hub
 *  already owns and enforces that step before Home is ever reachable at
 *  boot (this route stays mounted, hidden, behind it), and a second live
 *  copy of the same form would be indistinguishable from the real one to
 *  any selector or the coach's own eyes. It points at the one real form
 *  instead. */
function SeasonLibraryPanel({ screen, hub, hubState, hasTeam }) {
  if (!hasTeam) {
    return <div class="ws-empty-panel">
      <h3>Set up your team first</h3>
      <p>Team &amp; Film Settings and the Season selector both get you there.</p>
      <button type="button" class="ws-btn ws-primary" onClick={() => screen.openSeasonLibrary()}>Open Season Library</button>
    </div>;
  }
  const scout = hubState.workspaceMode === 'scout';
  const seasons = (hubState.seasons || []).filter(s => !!s.isScout === scout);
  const ordered = orderedSeasons(seasons);
  const create = event => scout ? hub.openCreateScout(event.currentTarget) : hub.openCreateSeason(event.currentTarget);
  return <div class="library-panel">
    <WorkspaceChoice mode={hubState.workspaceMode} screen={hub} compact />
    <div class="library-panel-head">
      <div><span class="gi-hub-kicker">{scout ? 'Scouting workspaces' : 'Season library'}</span><h2>{scout ? 'Opponents' : 'Seasons'}</h2></div>
      <button type="button" class="ws-btn ws-primary" onClick={create}>+ {scout ? 'New opponent scout' : 'New season'}</button>
    </div>
    {ordered.length
      ? <div class="library-grid" role="list">{ordered.map(season => <SeasonRow key={season.id} season={season} screen={hub} />)}</div>
      : <div class="ws-empty-panel">
          <h3>{scout ? 'Scout an opponent without touching our season' : 'Start the football year here'}</h3>
          <p>{scout ? 'Create an opponent, name the two teams in the source film, then link that game folder and chart it normally.' : 'Create your first season, then add games from Home.'}</p>
          <button type="button" class="ws-btn ws-primary" onClick={create}>{scout ? 'Create first opponent scout' : 'Create first season'}</button>
        </div>}
    {hub.canRecoverSeasons() ? <button type="button" class="library-recover-link" onClick={event => hub.recoverSeasons(event.currentTarget)}>Recover seasons</button> : null}
  </div>;
}

function NativeHome({ screen }) {
  const state = useScreen(screen);
  const app = screen.app;
  const hub = app.teamHubScreen;
  const hubState = useScreen(hub);
  // Refresh whenever Home BECOMES the active route (state.active flips
  // true), not just once on first idle load -- a season can be created,
  // deleted, or explored (the sample-season action) through TeamHubScreen
  // while Team Hub itself was the visible route, which durably changes
  // canonical data without ever re-running TeamHubScreen's own load() a
  // second time. Without this, the rail/library can render a stale,
  // pre-change season list (including "no seasons" right after one was
  // just created) until something UNRELATED happens to trigger a reload.
  useEffect(() => { if (hub && state.active) hub.load(); }, [hub, state.active]);
  const store = app.storage?.seasonStore;
  const hasSeason = !!store?.hasCurrent?.();
  const games = hasSeason ? (store.data.games || []) : [];
  const scout = hasSeason && screen.isScout();
  const c = app.workspace.snapshot();
  // TeamHubScreen's own cache, not app.workspace's -- both settle to the
  // same answer, but TeamHubScreen is the one that also drives the rail/
  // library components below, so a single source keeps them from disagreeing
  // during the brief window before hub.load() first resolves.
  const hubReady = hub && hubState.status !== 'loading' && hubState.status !== 'idle';
  const hasTeam = hubReady ? !!hubState.teams?.length : !!c.team;

  // HomeHead ALWAYS renders -- its Team & Film Settings / Season report /
  // + Add game actions are the coach's persistent way out of any state
  // (addGame() itself already redirects to the library when nothing is set
  // up yet), and this route stays mounted, hidden, behind Team Hub on a
  // genuine first boot. Below the head, an OPEN SEASON always wins first --
  // a season being open is on its own sufficient proof there is something to
  // show, whether or not TeamHubScreen's own team cache has ever resolved
  // (an import, a fixture, or a season opened before hub.load() settles must
  // never be hidden behind an onboarding wall just because the cache lags).
  // `state.active` (set by HomeScreen.show(), cleared by leave()) is the
  // gate for anything below that reuses TeamHubScreen's OWN components
  // (SeasonRail, SeasonLibraryPanel's season cards) -- this route's tree
  // never unmounts, so rendering that reused markup unconditionally would
  // leave a second, hidden copy of Team Hub's own DOM sitting behind it for
  // the rest of the session. GameWorkspace/EmptySeasonPanel render only
  // Home-scoped markup shared with nothing else, so they are unaffected.
  return <div class="ws-home-page" data-native-home>
    <HomeHead screen={screen} state={state} hasSeason={hasSeason} scout={scout} c={c} games={games} />
    {state.status !== 'ready' || !state.active ? null
      : hasSeason
        ? <div class="home-with-rail">
            <SeasonRail screen={screen} hub={hub} hubState={hubState} />
            {!games.length ? <EmptySeasonPanel screen={screen} scout={scout} /> : <GameWorkspace screen={screen} state={state} games={games} scout={scout} c={c} />}
          </div>
        : <SeasonLibraryPanel screen={screen} hub={hub} hubState={hubState} hasTeam={hasTeam} />}
  </div>;
}

export function mountNativeHome({ host, screen }) {
  if (!host) throw new Error('Native Home requires a route host.');
  if (!screen) throw new Error('Native Home requires an injected screen controller.');
  render(<NativeHome screen={screen} />, host);
  return { unmount() { render(null, host); } };
}
