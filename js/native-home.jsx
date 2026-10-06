import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { WorkspaceChoice } from './native-team-hub.jsx';
import { fullIdentity, seasonIdentity } from './identity-labels.js';
import '../css/native-home.css';

const icon = name => <svg class="icon" aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;

function useScreen(screen) {
  const [state, setState] = useState(() => screen.snapshot());
  useEffect(() => screen.subscribe(setState), [screen]);
  return state;
}

const LEVELS = ['JV', 'Varsity', 'Freshman', 'Other'];

function IdentityFields({ prefix = '', label = 'Program' }) {
  return <div class="first-identity-row">
    <label><span>{label}: school / organization</span><input name={`${prefix}School`} required placeholder="e.g. St. Joseph" /></label>
    <label><span>Nickname <small>Optional</small></span><input name={`${prefix}Nickname`} placeholder="e.g. Mavericks" /></label>
  </div>;
}

function FirstLaunch({ screen, hub, mode }) {
  const [school, setSchool] = useState('');
  const [nickname, setNickname] = useState('');
  const [year, setYear] = useState(String(new Date().getFullYear()));
  const [level, setLevel] = useState('JV');
  const [customLevel, setCustomLevel] = useState('');
  const [setupMode, setSetupMode] = useState('guided');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const scout = mode === 'scout';
  const resolvedLevel = level === 'Other' ? customLevel.trim() : level;
  const programName = fullIdentity(school, nickname);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const values = new FormData(event.currentTarget);
    const team = await hub.addTeam({ school: values.get('school'), nickname: values.get('nickname'), jerseyColor: values.get('jerseyColor') });
    if (!team?.ok) { setError(team?.message || 'Could not create the program.'); setBusy(false); return; }
    const result = scout
      ? await hub.createScout({ opponent: values.get('opponentSchool'), opponentNickname: values.get('opponentNickname'), year, level: resolvedLevel, sourceTeamA: values.get('sourceASchool'), sourceTeamANickname: values.get('sourceANickname'), sourceTeamB: values.get('sourceBSchool'), sourceTeamBNickname: values.get('sourceBNickname'), date: values.get('date') })
      : await hub.createSeason({ year, level: resolvedLevel, setupMode });
    if (!result?.ok) { setError(result?.message || 'Could not create the workspace.'); setBusy(false); return; }
    if (!scout && setupMode === 'guided') setTimeout(() => hub.openSeasonSetup(null), 0);
  };
  return <main class="first-launch" data-first-launch aria-labelledby="firstLaunchTitle">
    <header><h1 id="firstLaunchTitle">Football workspace</h1><p>Program seasons and opponent scouting.</p></header>
    <WorkspaceChoice mode={mode} screen={hub} />
    <form onSubmit={submit}>
      <h2>{scout ? 'Create your first opponent scout' : 'Create your first season'}</h2>
      <div class="first-identity-row">
        <label><span>Program: school / organization</span><input name="school" required value={school} onInput={event => setSchool(event.currentTarget.value)} placeholder="e.g. St. Joseph" /></label>
        <label><span>Nickname <small>Optional</small></span><input name="nickname" value={nickname} onInput={event => setNickname(event.currentTarget.value)} placeholder="e.g. Mavericks" /></label>
      </div>
      <select name="jerseyColor" class="first-compat-color" aria-hidden="true" tabIndex="-1"><option value="" /><option value="blue" /><option value="navy" /></select>
      <div class="first-season-row">
        <label><span>Year</span><input name="year" inputMode="numeric" required value={year} onInput={event => setYear(event.currentTarget.value)} /></label>
        <label><span>Level</span><select name="level" value={level} onChange={event => setLevel(event.currentTarget.value)}>{LEVELS.map(value => <option value={value}>{value === 'Other' ? 'Other…' : value}</option>)}</select></label>
      </div>
      {level === 'Other' && <label class="first-full-field"><span>Level name</span><input required value={customLevel} onInput={event => setCustomLevel(event.currentTarget.value)} placeholder="e.g. 8th grade" /></label>}
      {scout ? <div class="first-scout-fields">
        <IdentityFields prefix="opponent" label="Opponent being scouted" />
        <IdentityFields prefix="sourceA" label="Source game: Team A" />
        <IdentityFields prefix="sourceB" label="Source game: Team B" />
        <label class="first-full-field"><span>Game date</span><input name="date" type="date" /></label>
      </div> : <>
        <div class="first-name-preview"><span>Season name</span><strong>{seasonIdentity(year, programName, resolvedLevel)}</strong></div>
        <div class="first-setup-choice" role="radiogroup" aria-label="Season setup method">
          <button type="button" role="radio" aria-checked={setupMode === 'guided'} class={setupMode === 'guided' ? 'is-selected' : ''} onClick={() => setSetupMode('guided')}><i /><span><strong>Use guided setup</strong><small>Roster, film storage, and first-game setup</small></span></button>
          <button type="button" role="radio" aria-checked={setupMode === 'quick'} class={setupMode === 'quick' ? 'is-selected' : ''} onClick={() => setSetupMode('quick')}><i /><span><strong>Set up manually</strong><small>Create without the setup guide</small></span></button>
        </div>
      </>}
      {error && <p class="first-error" role="alert">{error}</p>}
      <div class="first-actions"><button class="ws-btn ws-primary" disabled={busy}>{busy ? 'Creating…' : scout ? 'Create opponent scout' : 'Create season'}</button></div>
    </form>
    <div class="first-secondary"><button type="button" onClick={event => hub.recoverSeasons(event.currentTarget)}>Recover existing seasons</button><button type="button" onClick={() => hub.exploreSample()}>Explore a sample season</button></div>
  </main>;
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
  const url = screen.thumbnailSourceMatches(game) ? screen.thumbnailFor(game.id) : null;
  const film = screen.rowFilmView(game.id);
  const nodeRef = useRef(null);
  useEffect(() => {
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
  }, [game.id, game.filmMode, game.filmDir, detail, screen.thumbnailRevision]);
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
      ? `${games.length} source game${games.length === 1 ? '' : 's'}`
      : [screen.teamName(), record.text, `${games.length} game${games.length === 1 ? '' : 's'}`].filter(Boolean).join(' · '))
    : (c.team ? 'Choose or create a season to get started.' : 'Set up your team to get started.');
  const season = screen.app.storage?.seasonStore?.data;
  const greeting = hasSeason ? (scout ? (c.season?.name || 'Opponent scout') : [season?.year, season?.level].filter(Boolean).join(' · '))
    : (c.team ? `${c.team.name} home` : 'Team home');
  const logo = scout ? '' : screen.teamLogo();
  return <div class="ws-home-head">
    <div>
      <button type="button" class="home-library-back" onClick={() => screen.openSeasonLibrary()}>{icon('folder')}Season library</button>
      <div class="ws-home-title-lockup">{logo && <img class="ws-home-logo" src={logo} alt="" />}<div>
        <div class="ws-eyebrow" id="wsHomeEyebrow">{screen.eyebrow()}</div>
        <h1 id="wsGreeting">{greeting}</h1>
        <p id="wsHomeSummary">{summary}</p>
      </div></div>
    </div>
    <div class="ws-home-actions">
      {!hasSeason && <button type="button" class="ws-btn" data-ws-action="settings" onClick={event => screen.app.settingsScreen?.open?.({ returnFocus: event.currentTarget })}>Team &amp; Film Settings</button>}
      {hasSeason && games.length ? <button type="button" class="ws-btn" data-ws-action="season-report" onClick={() => screen.openSeasonReport()}>{scout ? 'Scout report' : 'Season report'}</button> : null}
      {hasSeason && <button type="button" class="ws-btn ws-primary" data-ws-action="new-game" onClick={() => screen.addGame()}>+ {scout ? 'Add source game' : 'Add game'}</button>}
    </div>
  </div>;
}

function EmptySeasonPanel({ screen, scout }) {
  return <div class="ws-empty-panel">
    <h3>{scout ? 'No source games yet' : 'No games in this season yet'}</h3>
    <p>{scout ? 'Add a source game and link film.' : 'Add the opponent and date. Film can be linked now or later.'}</p>
    <button type="button" class="ws-btn ws-primary" onClick={() => screen.addGame()}>+ {scout ? 'Add source game' : 'Add game'}</button>
  </div>;
}

function GameCard({ screen, game, selected }) {
  const summary = screen.gameSummary(game);
  const film = screen.rowFilmView(game.id);
  return <article class={`ws-game-row${selected ? ' selected' : ''}`} data-game-id={game.id}>
    <button type="button" class="game-card-select" data-ws-preview={game.id} aria-pressed={selected ? 'true' : 'false'}
      aria-label={`Select ${screen.matchupTitle(game)}`} onClick={() => screen.selectGame(game.id)}>
      <Thumbnail screen={screen} game={game} />
      <div class="game-card-copy">
        <h3>{screen.matchupTitle(game)}</h3>
        {screen.matchupSchoolLine(game) ? <p class="matchup-schools">{screen.matchupSchoolLine(game)}</p> : null}
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
    </button>
    {selected && <button type="button" class="game-card-open" onClick={() => screen.continueCharting(game.id)}>Open game</button>}
  </article>;
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
          <h2 id="wsDetailName">{matchup}</h2>
          {screen.matchupSchoolLine(game) ? <p class="matchup-schools">{screen.matchupSchoolLine(game)}</p> : null}
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
        <button type="button" class="ws-btn" data-ws-action="game-plan" onClick={() => screen.openPlan()}>Game Plan</button>
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
          <option value="oldest">Oldest first</option>
          <option value="newest">Newest first</option>
        </select>
        <div class="view-switch" role="group" aria-label="Game view">
          <button type="button" aria-label="Grid view" title="Grid view" aria-pressed={state.view === 'grid'} onClick={() => screen.setView('grid')}>&#9638;</button>
          <button type="button" aria-label="List view" title="List view" aria-pressed={state.view === 'list'} onClick={() => screen.setView('list')}>&#9776;</button>
        </div>
      </div>
      <div class="filters" role="group" aria-label="Filter games">
        {[['all', 'All games', counts.all], ['chart', 'Not charted', counts.chart], ['film', 'Film needed', counts.film]].map(([value, label, count]) =>
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
/** THE ONE YEAR-GROUP KEY. Grouping and the active-year test must agree or a
 *  season falls between them: grouping normalized a missing year to `Undated`
 *  while the active-year test normalized it to an empty string, so a legacy
 *  season with no year was grouped under `Undated`, matched no active year, and
 *  its group was collapsible with the OPEN season inside it. Nothing here reads
 *  or writes stored metadata — it only decides which heading a row appears
 *  under. */
function yearGroupKey(season) {
  const year = String(season?.year ?? '').trim();
  return year || 'Undated';
}

function groupByYear(seasons) {
  const groups = new Map();
  orderedSeasons(seasons).forEach(season => {
    const key = yearGroupKey(season);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(season);
  });
  return [...groups.entries()];
}

/** Persistent season rail. This is a LIVE view onto `TeamHubScreen` -- the
 *  same TeamHubScreen controller used by the focused dialogs -- not a second season-
 *  management implementation. Every action (create/open/delete a season,
 *  the season-scoped tools) is the existing `TeamHubScreen`/`HomeScreen`
 *  method, called directly; the rail owns only the year-grouped presentation
 *  the approved comp specifies. "Season library" opens Home's full library
 *  state; focused settings and recovery remain owned by their dialogs. */
/** A season's row inside the compact context rail. Deliberately NOT the
 *  full library `SeasonRow` -- that card carries a 4-column grid, a state
 *  pill, a film badge, and Open/Delete action buttons sized for a full-width
 *  list, and squeezing it into a 236px column is exactly what left the
 *  season name a 75px sliver (the reviewed regression). The rail's job is
 *  identity + a count, at a glance, in a year-grouped list a coach scans
 *  in half a second -- so this is a purpose-built compact row: one label,
 *  one count, one click. Delete/rename stay in Team Hub and the full season
 *  library grid (SeasonLibraryPanel below still renders the real
 *  `SeasonRow`), which is the only place this app offers that destructive
 *  action -- not duplicated here. */
/** The row's label inside a tree that is ALREADY grouped by year, so the
 *  year never repeats in the row itself. A program season is identified by
 *  its level; a scout season's name composes as
 *  `year · level · opponent · Scout`, so the year and the `Scout` suffix are
 *  dropped and the row reads `opponent · level`. LEVEL IS AN IDENTITY
 *  BREAKPOINT, not decoration: two same-year scouts of the same opponent at
 *  different levels are otherwise indistinguishable, so it is kept and the
 *  opponent leads because that is what a coach scans for. Falls back to the
 *  full stored name whenever the name does not match that composition. */
function railLabel(season) {
  if (!season.isScout) return season.level || season.name || 'Season';
  const year = String(season.year || '');
  const level = String(season.level || '');
  const parts = String(season.name || '').split(' · ').filter(Boolean);
  const opponent = parts.filter((part, index) => {
    if (index === 0 && year && part === year) return false;
    if (index === 1 && level && part === level) return false;
    return part !== 'Scout';
  }).join(' · ');
  if (!opponent) return season.name || 'Opponent';
  return level ? `${opponent} · ${level}` : opponent;
}

function RailSeasonRow({ season, hub }) {
  const ref = useRef(null);
  /* THE OPEN SEASON IS ALWAYS ON SCREEN. The tree scrolls, so after a render
     that changes which season is current — first paint, a program switch, a
     season switch, a reload — the current row is brought into its scroller.
     `nearest` so an already-visible row never jumps under the coach. */
  /* A RESIZE RE-LAYS OUT THE RAIL WITHOUT RE-RENDERING IT, so keeping the open
     season visible needs the listener as well as the render pass: measured at
     1440 and 1280, the current row had scrolled out of a now-shorter tree.
     `nearest` is idempotent — a row already inside its scroller does not move. */
  useEffect(() => {
    if (!season.current) return undefined;
    const keep = () => ref.current?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    keep();
    window.addEventListener('resize', keep);
    return () => window.removeEventListener('resize', keep);
  });
  const label = railLabel(season);
  const count = season.gameCount === 1 ? '1 game' : `${season.gameCount || 0} games`;
  return <button type="button" ref={ref} class={`rail-row${season.current ? ' is-current' : ''}`} data-season-id={season.id}
    aria-current={season.current ? 'true' : undefined} title={season.name || label} onClick={() => hub.openSeason(season.id)}>
    {icon('folder')}<span><strong>{label}</strong><small>{count}</small></span>
  </button>;
}
/** One of the rail's two permanent trees. Both render unconditionally
 *  whenever a team exists -- neither is hidden, replaced, or collapsed
 *  because a workspace, season, scout, or route was selected. That was the
 *  recorded defect: entering Opponent Scout swapped the whole rail to
 *  Opponents and reported "No opponents yet" while the coach's program
 *  seasons still existed and were still the open season scope. */
/** One of the rail's two permanent trees, grouped by year.
 *
 *  THE ACTIVE YEAR IS EXPANDED AND HAS NO COLLAPSE CONTROL. The year holding
 *  the open season shows every one of its seasons and offers no disclosure at
 *  all — an action that cannot honestly complete is worse than no action, and
 *  a folded year that still rendered its current row left `aria-expanded=false`
 *  over visibly rendered content, so the DOM and the accessibility state
 *  disagreed. Older years are ordinary disclosures and fold completely.
 *
 *  Opening a season in another year therefore expands that year by definition,
 *  reveals every season in it, and leaves the year the coach came from at
 *  whatever disclosure state they had chosen.
 *
 *  Collapse state is CONTROLLER state keyed by TEAM, section and year, so it
 *  survives an ordinary re-render but can never leak from one program into
 *  another — two programs' 2024s are different years. */
function RailSection({ title, seasons, hub, onCreate, createLabel, emptyText, screen, cls = '' }) {
  const groups = groupByYear(seasons);
  const [, force] = useState(0);
  const collapsed = screen.railCollapsedYears || (screen.railCollapsedYears = new Set());
  const teamId = String(screen.app.teamRegistry?.activeTeamId?.() ?? '');
  const keyOf = year => `${teamId}:${title}:${year}`;
  // Through the SAME key the grouping used, so `Undated` can be the active year.
  const openSeason = seasons.find(season => season.current);
  const activeYear = openSeason ? yearGroupKey(openSeason) : '';
  const isActive = year => !!activeYear && String(year) === activeYear;
  const isFolded = year => !isActive(year) && collapsed.has(keyOf(year));
  const toggle = year => {
    const key = keyOf(year);
    if (collapsed.has(key)) collapsed.delete(key); else collapsed.add(key);
    force(n => n + 1);
  };
  return <section class={`rail-section${cls ? ` ${cls}` : ''}`} data-rail-section={title} aria-label={title}>
    <div class="rail-head">
      <span class="gi-hub-kicker">{title}</span>
      <button type="button" class="icon-btn" aria-label={createLabel} title={createLabel} onClick={onCreate}>+</button>
    </div>
    <div class="rail-groups">
      {groups.length
        ? groups.map(([year, rows]) => {
          const active = isActive(year);
          const folded = isFolded(year);
          const bodyId = `rail-${title.replace(/\W+/g, '-').toLowerCase()}-${year}`;
          return <div class={`rail-group${folded ? ' is-folded' : ''}${active ? ' is-active-year' : ''}`} key={year}>
            <h3 class="rail-year-label">
              {active
                // The open season's year: a heading, not a control. It keeps the
                // count and the year, and it is always fully expanded.
                /* NO DISCLOSURE GLYPH. A caret on a heading that cannot be
                   pressed states an affordance that does not exist; the row
                   keeps its alignment with the disclosure rows through an empty
                   non-semantic spacer of the caret's own width. */
                ? <span class="rail-year-toggle is-static" data-rail-year={year} data-rail-active-year="true">
                  <span class="rail-year-spacer" aria-hidden="true" />
                  <span class="rail-year-name">{year}</span>
                  <span class="rail-year-count">{rows.length}</span>
                </span>
                : <button type="button" class="rail-year-toggle" data-rail-year={year}
                  aria-expanded={folded ? 'false' : 'true'} aria-controls={bodyId}
                  onClick={() => toggle(year)}>
                  <span class="rail-year-caret" aria-hidden="true">{folded ? '▸' : '▾'}</span>
                  <span class="rail-year-name">{year}</span>
                  <span class="rail-year-count">{rows.length}</span>
                </button>}
            </h3>
            {/* A folded year renders NOTHING, so `aria-expanded` and the DOM
                always agree. The open season can never be in one. */}
            {folded ? null : <div class="rail-group-body" id={bodyId}>
              {rows.map(season => <RailSeasonRow key={season.id} season={season} hub={hub} />)}
            </div>}
          </div>;
        })
        : <p class="rail-empty">{emptyText}</p>}
    </div>
  </section>;
}

function SeasonRail({ screen, hub, hubState }) {
  const store = screen.app.storage?.seasonStore;
  const hasSeason = !!store?.hasCurrent?.();
  // Season-scoped tools follow the OPEN SEASON's kind, never the main-panel
  // workspace filter -- Roster and Edit season details belong to a program
  // season and must stay available while it is the open season, whatever
  // the coach is currently browsing in the main panel.
  const openScout = hasSeason && store?.data?.kind === 'scout';
  const all = hubState.railSeasons || [];
  const programs = all.filter(season => !season.isScout);
  const scouts = all.filter(season => season.isScout);
  const logo = openScout ? '' : screen.teamLogo();
  // Until the hub's first load the team list is unknown, not empty: offering
  // Get started then sent a program with seasons to first-run setup.
  const hasTeam = !!hubState.teams?.length;
  const noTeam = hubState.loaded === true && !hasTeam;
  return <nav class="rail-year" aria-label="Program seasons and opponent scouts">
    <button type="button" class="rail-library-link" onClick={() => hasTeam && screen.openSeasonLibrary()}>{icon('folder')}Season library</button>
    {noTeam && <button type="button" class="rail-library-link is-current">{icon('tag')}Get started</button>}
    {/* PROGRAM SEASONS TAKES THE RAIL'S FLEXIBLE HEIGHT. Both trees previously
        held an equal 1fr with a 112px floor, so the season tree was pinned to
        about one row while the fixed tool block held half the rail — the
        installed screenshot showed 2026 while 2025 JV was the open season.
        Scouts are content-sized under a cap; seasons take the rest. */}
    {hasTeam && <div class="rail-trees">
      <RailSection title="Program Seasons" seasons={programs} hub={hub} screen={screen} cls="is-seasons"
        createLabel="New season" onCreate={event => hub.openCreateSeason(event.currentTarget)}
        emptyText="No program seasons yet." />
      <RailSection title="Opponent Scouts" seasons={scouts} hub={hub} screen={screen} cls="is-scouts"
        createLabel="New opponent scout" onCreate={event => hub.openCreateScout(event.currentTarget)}
        emptyText="None yet" />
    </div>}
    <div class="rail-tools">
      {hasSeason && <span class="rail-scope">{seasonIdentity(store?.data?.year, screen.teamName(), store?.data?.level)}</span>}
      {hasSeason && !openScout && <button type="button" onClick={event => screen.openRoster(event.currentTarget)}>{icon('notes')}Roster</button>}
      <button type="button" onClick={event => screen.openFilmSettings(event.currentTarget)}>{icon('film')}Film &amp; storage</button>
      {hasSeason && hubState.control?.canReviewSetup ? <button type="button" onClick={event => screen.openSeasonSetup(event.currentTarget)}>{icon('tag')}Season setup</button> : null}
      {hasSeason && !openScout && <button type="button" onClick={event => screen.openEditSeason(event.currentTarget)}>{icon('pencil')}Edit season details</button>}
      <button type="button" onClick={event => screen.manageProgram(event.currentTarget)}>{icon('folder')}Manage program</button>
    </div>
    <div class="rail-foot">{logo && <img class="rail-logo" src={logo} alt="" />}<span><span class="gi-hub-kicker">Local library</span><span>{hubState.profile?.teamName || screen.teamName() || 'Your coaching workspace'}</span></span></div>
  </nav>;
}

function libraryDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function LibraryFilmStatus({ film }) {
  return <span class={`library-film is-${film?.state || 'checking'}`}><i />{film?.label || 'Checking film…'}</span>;
}

function LibrarySeasonRow({ season, hub }) {
  const opened = libraryDate(season.lastOpened);
  const state = season.current ? 'Current season' : season.isDemo ? 'Sample season' : 'Season';
  const meta = [season.year, season.level, opened && `opened ${opened}`].filter(Boolean).join(' · ');
  return <article class={`library-season${season.current ? ' is-current' : ''}`} data-library-season data-season-id={season.id}>
    <div class="library-season-identity">
      <span class="library-season-state">{state}</span>
      <h3>{season.name}</h3>
      <p>{meta || 'Season workspace'}</p>
    </div>
    <div class="library-season-metrics" aria-label={`${season.gameCount} games and ${season.playCount} plays`}>
      <span><b>{season.gameCount}</b><small>games</small></span>
      <span><b>{season.playCount}</b><small>plays</small></span>
    </div>
    <LibraryFilmStatus film={season.film} />
    <div class="library-season-actions">
      <button type="button" class="library-open" data-hub-open-season={season.id} onClick={() => hub.openSeason(season.id)}>{season.current ? 'Return to Home' : 'Open season'}</button>
      <button type="button" class="library-delete" aria-label={`${season.isDemo ? 'Remove sample season' : 'Delete season'} ${season.name}`} onClick={event => hub.deleteSeason(season.id, event.currentTarget)}>{season.isDemo ? 'Remove sample' : 'Delete'}</button>
    </div>
  </article>;
}

function libraryTotals(seasons) {
  return {
    games: seasons.reduce((sum, season) => sum + (Number(season.gameCount) || 0), 0),
    plays: seasons.reduce((sum, season) => sum + (Number(season.playCount) || 0), 0),
    linked: seasons.filter(season => season.film?.state === 'ready').length,
    attention: seasons.filter(season => ['missing', 'partial'].includes(season.film?.state)).length,
    clips: seasons.reduce((sum, season) => sum + (Number(season.film?.found) || 0), 0),
    checking: seasons.some(season => !season.film || season.film.state === 'checking'),
  };
}

function LibraryOverview({ screen, hub, hubState, seasons, scout }) {
  const totals = libraryTotals(seasons);
  const latest = seasons.slice().sort((a, b) => new Date(b.lastOpened || 0) - new Date(a.lastOpened || 0))[0];
  const hasSample = seasons.some(season => season.isDemo);
  const canRecover = hub.canRecoverSeasons();
  const hasQuickActions = (!scout && !hasSample) || canRecover;
  return <aside class={`library-overview${scout ? ' is-scout' : ''}`} aria-label={scout ? 'Scout library summary' : 'Program library summary'}>
    <div class="library-overview-head">
      <span class="gi-hub-kicker">{scout ? 'Latest opponent' : 'Latest season'}</span>
      <h3>{latest?.name || (hubState.profile?.teamName || screen.teamName() || 'Your program')}</h3>
      {latest && <p>{latest.gameCount} {latest.gameCount === 1 ? 'game' : 'games'} &middot; {latest.playCount} plays</p>}
      {latest && <button type="button" class="library-continue" onClick={() => hub.openSeason(latest.id)}>{scout ? 'Open scout' : 'Continue season'}</button>}
    </div>
    <div class="library-health">
      <span class="gi-hub-kicker">Film health</span>
      <span><small>Workspaces ready</small><b class={totals.linked === seasons.length ? 'is-good' : totals.linked ? 'is-warn' : ''}>{totals.linked} / {seasons.length}</b></span>
      <span><small>Clips available</small><b>{totals.clips}</b></span>
      <span><small>Needs attention</small><b class={totals.attention ? 'is-warn' : 'is-good'}>{totals.attention}</b></span>
    </div>
    {hasQuickActions && <div class="library-overview-actions">
      <span class="gi-hub-kicker">Quick actions</span>
      {!scout && !hasSample ? <button type="button" onClick={() => hub.exploreSample()}>Explore sample season</button> : null}
      {canRecover ? <button type="button" onClick={event => hub.recoverSeasons(event.currentTarget)}>Recover seasons</button> : null}
    </div>}
  </aside>;
}

function EmptyScoutLibrary({ create }) {
  return <div class="library-layout library-scout-empty">
    <section class="library-list-wrap" aria-labelledby="libraryListTitle">
      <div class="library-list-head"><h3 id="libraryListTitle">Opponent scouts</h3></div>
      <div class="scout-empty-table" role="table" aria-label="Opponent scout workspaces">
        <div class="scout-table-head" role="row">
          <span role="columnheader">Opponent</span><span role="columnheader">Season</span><span role="columnheader">Source games</span><span role="columnheader">Plays</span><span role="columnheader">Film</span>
        </div>
        <div class="scout-table-empty">
          <span class="gi-hub-kicker">Scouting queue</span>
          <h3>No opponents yet</h3>
        </div>
      </div>
    </section>
    <aside class="library-overview is-scout scout-start" aria-label="Create opponent scout">
      <div class="library-overview-head">
        <span class="gi-hub-kicker">First scout</span>
        <h3>Create opponent scout</h3>
        <p>Opponent &middot; season &middot; source game</p>
        <button type="button" class="library-continue" onClick={create}>Create opponent scout</button>
      </div>
      <div class="library-health">
        <span class="gi-hub-kicker">Workspace status</span>
        <span><small>Opponent</small><b>Not selected</b></span>
        <span><small>Source games</small><b>0</b></span>
        <span><small>Film</small><b>No film linked</b></span>
      </div>
    </aside>
  </div>;
}

/**
 * Opponent scouts this team owns that belong to no program season: a scout
 * created at first launch before any season existed, a legacy record with no
 * unique compatible parent, and one whose stored parent no longer resolves
 * (deleted, or imported from another machine).
 *
 * They are never hidden and never auto-attached. Each row names the scout and
 * carries one explicit control: choose a program season, then Assign. Only the
 * ACTIVE TEAM's real program seasons are offered, each labelled with its year
 * and level so two similarly named seasons are distinguishable. With no program
 * season to choose, the row offers the one action that unblocks it -- create a
 * season -- and the scout stays exactly where it is.
 */
function UnassignedScouts({ hub, hubState }) {
  const scouts = hubState.unassignedScouts || [];
  /* Selection is held per SCOUT ID, never in the DOM. The rows were unkeyed with
     uncontrolled selects: when one row disappeared after being assigned, Preact
     reused its DOM node for the next scout, so the season the coach had chosen
     for the assigned scout stayed selected and could be submitted through the
     NEXT scout's handler -- assigning the wrong scout to a season nobody picked
     for it. Keyed rows plus id-scoped state means a newly exposed row always
     starts blank, and `busy` blocks a second submit while one is in flight. */
  const [choice, setChoice] = useState({});
  const [busy, setBusy] = useState('');
  if (!scouts.length) return null;
  const parents = (hubState.railSeasons || []).filter(season => !season.isScout && !season.isDemo);
  const label = season => [season.name, [season.year, season.level].filter(Boolean).join(' · ')]
    .filter(Boolean).join(' — ');
  return <section class="library-unassigned" aria-labelledby="unassignedScoutsTitle">
    <div class="library-list-head">
      <h3 id="unassignedScoutsTitle">Needs a program season</h3>
      <p>{scouts.length === 1 ? 'This scout is not attached to a season yet.' : `${scouts.length} scouts are not attached to a season yet.`}</p>
    </div>
    <div class="library-unassigned-list" role="list">
      {scouts.map(scout => <div class="library-unassigned-row" role="listitem" key={scout.id} data-unassigned-scout={scout.id}>
        <div class="library-unassigned-identity">
          <strong>{scout.name}</strong>
          <small>{[scout.year, scout.level].filter(Boolean).join(' · ') || 'No season details'} · {scout.gameCount === 1 ? '1 source game' : `${scout.gameCount || 0} source games`}</small>
        </div>
        {parents.length
          ? <form class="library-assign" onSubmit={async event => {
              event.preventDefault();
              // State is the authority for what this row DISPLAYS; the row's own
              // select is read as a fallback for a change that has not flushed
              // yet. Safe because the rows are keyed: this form's select belongs
              // to this scout and cannot be a node reused from a departed row.
              const picked = choice[scout.id] || event.currentTarget.querySelector('select')?.value || '';
              // One assignment at a time, and never a stale one: the value comes
              // from this scout's own state, not from whatever the DOM holds.
              if (busy || !picked) { if (!picked) hub.assignScoutFromHome(scout.id, ''); return; }
              setBusy(scout.id);
              try { await hub.assignScoutFromHome(scout.id, picked); }
              finally {
                setBusy('');
                setChoice(prev => { const next = { ...prev }; delete next[scout.id]; return next; });
              }
            }}>
            <label>
              <span class="gi-hub-kicker">Program season</span>
              <select name={`assign-${scout.id}`} aria-label={`Program season for ${scout.name}`}
                value={choice[scout.id] || ''} disabled={busy === scout.id}
                onChange={event => { const value = event.currentTarget.value; setChoice(prev => ({ ...prev, [scout.id]: value })); }}>
                <option value="">Choose a season</option>
                {parents.map(season => <option key={season.id} value={season.id}>{label(season)}</option>)}
              </select>
            </label>
            <button type="submit" class="ws-btn ws-primary" disabled={busy === scout.id}>Assign</button>
          </form>
          : <button type="button" class="ws-btn ws-primary"
              onClick={event => hub.openCreateSeason(event.currentTarget)}>Create a program season</button>}
      </div>)}
    </div>
  </section>;
}

/** The library state -- no season is currently open. Home owns this
 *  presentation while TeamHubScreen remains the sole data/action service.
 *  A coach landing here gets a readable operational season list and useful
 *  program context instead of generic Team Hub rows repacked as small cards.
 *  When no team exists anywhere yet, this
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
      <p>Create a program before adding seasons.</p>
      <button type="button" class="ws-btn ws-primary" onClick={() => screen.openSeasonLibrary()}>Open Season Library</button>
    </div>;
  }
  const scout = hubState.workspaceMode === 'scout';
  const seasons = (hubState.seasons || []).filter(s => !!s.isScout === scout);
  const ordered = orderedSeasons(seasons);
  const teamName = hubState.profile?.teamName || screen.teamName() || 'Program';
  const totals = libraryTotals(ordered);
  const storageLabel = totals.checking ? 'Checking film…' : totals.attention ? `${totals.attention} need attention` : totals.linked ? 'Film ready' : 'No film linked';
  const create = event => scout ? hub.openCreateScout(event.currentTarget) : hub.openCreateSeason(event.currentTarget);
  return <div class="library-panel">
    <div class="library-panel-head">
      <div><span class="gi-hub-kicker">Football workspace</span><h2>{scout ? 'Opponent scouting' : `${teamName} home`}</h2></div>
      {ordered.length || !scout ? <button type="button" class="ws-btn ws-primary" onClick={create}>+ {scout ? 'New opponent scout' : 'New season'}</button> : null}
      {!ordered.length && scout ? <button type="button" class="ws-btn ws-primary library-mobile-create" onClick={create}>+ New opponent scout</button> : null}
    </div>
    {ordered.length || scout ? <div class={`library-summary${scout ? ' is-scout' : ''}`}>
      {/* In Opponent Scout the first cell names the PARENT SEASON, because that
          is the context these scouts belong to and the thing the coach returns
          to. Without it the view could not be told apart from another season's
          scout library. */}
      <span><small>{scout ? 'Program season' : 'Current program'}</small><b>{scout ? (hubState.parentSeasonName || teamName) : teamName}</b></span>
      <span><small>{scout ? 'Opponents' : 'Seasons'}</small><b>{ordered.length}</b></span>
      <span><small>{scout ? 'Source games' : 'Games'}</small><b>{totals.games}</b></span>
      <span><small>Plays</small><b>{totals.plays}</b></span>
      <span><small>{scout ? 'Scout film' : 'Storage'}</small><b class={`library-storage${!totals.checking && !totals.attention && totals.linked ? ' is-good' : totals.attention ? ' is-warn' : ''}`}><i />{storageLabel}</b></span>
    </div> : null}
    {!hubState.loaded
      ? <div class="ws-empty-panel" data-library-loading><h3>Loading seasons…</h3></div>
      : ordered.length
      ? <>
        <div class="library-layout">
          <section class="library-list-wrap" aria-labelledby="libraryListTitle">
            <div class="library-list-head"><h3 id="libraryListTitle">{scout ? 'Opponents' : 'Team seasons'}</h3></div>
            <div class="library-list" role="list">{ordered.map(season => <LibrarySeasonRow key={season.id} season={season} hub={hub} />)}</div>
          </section>
          <LibraryOverview screen={screen} hub={hub} hubState={hubState} seasons={ordered} scout={scout} />
        </div>
        {scout && <UnassignedScouts hub={hub} hubState={hubState} />}
        </>
      : scout ? <><EmptyScoutLibrary create={create} /><UnassignedScouts hub={hub} hubState={hubState} /></> : <div class="ws-empty-panel">
          <h3>{scout ? 'No opponent scouts' : 'Start the football year here'}</h3>
          <p>{scout ? 'Add an opponent and source game, then link film.' : 'Create your first season, then add games from Home.'}</p>
          <button type="button" class="ws-btn ws-primary" onClick={create}>{scout ? 'Create first opponent scout' : 'Create first season'}</button>
        </div>}
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
  // while a focused Team Hub dialog was open, which durably changes
  // canonical data without ever re-running TeamHubScreen's own load() a
  // second time. Without this, the rail/library can render a stale,
  // pre-change season list (including "no seasons" right after one was
  // just created) until something UNRELATED happens to trigger a reload.
  useEffect(() => { if (hub && state.active) hub.load(); }, [hub, state.active, state.seasonId]);
  const store = app.storage?.seasonStore;
  const hasSeason = !!store?.hasCurrent?.();
  const games = hasSeason ? (store.data.games || []) : [];
  const scout = hasSeason && screen.isScout();
  const c = app.workspace.snapshot();
  // TeamHubScreen's own cache, not app.workspace's -- both settle to the
  // same answer, but TeamHubScreen is the one that also drives the rail/
  // library components below, so a single source keeps them from disagreeing
  // during the brief window before hub.load() first resolves.
  const hubReady = hub && hubState.loaded === true;
  const hasTeam = hubReady ? !!hubState.teams?.length : !!c.team;
  // Opponent Scout with the PARENT program season open is the scout LIBRARY --
  // the parent's own scoped list of opponents, or its empty state. It renders
  // without closing the parent, which is what makes the switch one transition.
  // Before this, `hasSeason` was true (the parent stays open by design) so the
  // program game workspace won and the approved scout composition was reachable
  // only through `_openLibrary()`, i.e. by closing the season -- the bounce.
  // An open SCOUT keeps the ordinary game workspace below.
  const browsingScoutLibrary = hasTeam && hasSeason && !scout && hubState.workspaceMode === 'scout';

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
    <div class="home-with-rail">
      {state.active && <SeasonRail screen={screen} hub={hub} hubState={hubState} />}
      <div class="home-content">
        {hasTeam && hasSeason && <HomeHead screen={screen} state={state} hasSeason={hasSeason} scout={scout} c={c} games={games} />}
        {state.status !== 'ready' || !state.active ? null : browsingScoutLibrary
          ? <SeasonLibraryPanel screen={screen} hub={hub} hubState={hubState} hasTeam={hasTeam} />
          : hasSeason
          ? (!games.length ? <EmptySeasonPanel screen={screen} scout={scout} /> : <GameWorkspace screen={screen} state={state} games={games} scout={scout} c={c} />)
          : hasTeam ? <SeasonLibraryPanel screen={screen} hub={hub} hubState={hubState} hasTeam={hasTeam} /> : <FirstLaunch screen={screen} hub={hub} mode={hubState.workspaceMode} />}
      </div>
    </div>
  </div>;
}

export function mountNativeHome({ host, screen }) {
  if (!host) throw new Error('Native Home requires a route host.');
  if (!screen) throw new Error('Native Home requires an injected screen controller.');
  render(<NativeHome screen={screen} />, host);
  return { unmount() { render(null, host); } };
}
