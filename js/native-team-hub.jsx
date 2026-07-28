import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../css/native-team-hub.css';

const COLORS = ['', 'white', 'black', 'red', 'blue', 'navy', 'green', 'yellow', 'orange', 'purple', 'maroon', 'gray', 'teal'];

function useScreen(screen) {
  const [state, setState] = useState(() => screen.snapshot());
  useEffect(() => screen.subscribe(setState), [screen]);
  return state;
}

function formatDate(value) {
  if (!value) return '';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '' : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function arrowFocus(event, selector) {
  if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key)) return;
  const items = [...event.currentTarget.querySelectorAll(selector)].filter(item => !item.disabled && item.getClientRects().length);
  const index = items.indexOf(document.activeElement);
  if (index < 0 || !items.length) return;
  event.preventDefault();
  const delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : 1;
  items[(index + delta + items.length) % items.length].focus();
}

function TeamFormFields({ name, setName, color, setColor }) {
  return <>
    <label class="gi-hub-field"><span>Team name</span><input value={name} onInput={event => setName(event.currentTarget.value)} autoFocus required placeholder="St. Joseph Mavericks" /></label>
    <label class="gi-hub-field"><span>Jersey color</span><select value={color} onChange={event => setColor(event.currentTarget.value)}>{COLORS.map(value => <option value={value}>{value ? value[0].toUpperCase() + value.slice(1) : 'Not set'}</option>)}</select></label>
  </>;
}

export function AddTeamForm({ onSubmit, onCancel }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const result = await onSubmit({ name, jerseyColor: color });
    if (!result?.ok) { setError(result?.message || 'The team could not be added.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form" onSubmit={submit}>
    <p>Teams keep seasons, roster, and custom football vocabulary separate.</p>
    <TeamFormFields name={name} setName={setName} color={color} setColor={setColor} />
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Adding…' : 'Add team'}</button></div>
  </form>;
}

export function CreateSeasonForm({ teamName, onSubmit, onCancel }) {
  const yearNow = String(new Date().getFullYear());
  const [name, setName] = useState('');
  const [year, setYear] = useState(yearNow);
  const [level, setLevel] = useState('Varsity');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const result = await onSubmit({ name, year, level });
    if (!result?.ok) { setError(result?.message || 'The season could not be created.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form" onSubmit={submit}>
    <p>For <strong>{teamName || 'this team'}</strong>. Games are added from Home after the season opens.</p>
    <label class="gi-hub-field"><span>Season name</span><input value={name} onInput={event => setName(event.currentTarget.value)} autoFocus required placeholder={`${yearNow} ${teamName || 'Season'}`} /></label>
    <div class="gi-hub-field-row">
      <label class="gi-hub-field"><span>Year</span><input value={year} onInput={event => setYear(event.currentTarget.value)} inputMode="numeric" /></label>
      <label class="gi-hub-field"><span>Level</span><input value={level} onInput={event => setLevel(event.currentTarget.value)} placeholder="Varsity" /></label>
    </div>
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Creating…' : 'Create season'}</button></div>
  </form>;
}

function FirstTeam({ screen }) {
  const [name, setName] = useState('');
  const [color, setColor] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault(); setBusy(true); setError('');
    const result = await screen.addTeam({ name, jerseyColor: color });
    if (!result?.ok) { setError(result?.message || 'The team could not be saved.'); setBusy(false); }
  };
  return <section class="gi-hub-first" aria-labelledby="giHubFirstTitle">
    <span class="gi-hub-kicker">First setup</span><h2 id="giHubFirstTitle">Set up your team</h2>
    <p>Your team owns its seasons, roster, and custom charting library. Film storage can be chosen before any game is opened.</p>
    <form onSubmit={submit}><TeamFormFields name={name} setName={setName} color={color} setColor={setColor} />
      {error && <p class="gi-hub-error" role="alert">{error}</p>}
      <button class="gi-hub-primary" disabled={busy}>{busy ? 'Saving…' : 'Create team'}</button>
    </form>
  </section>;
}

function FilmBadge({ film }) {
  return <span class={`gi-hub-film is-${film?.state || 'checking'}`}><i />{film?.label || 'Checking film'}</span>;
}

function SeasonRow({ season, screen }) {
  const meta = [season.year, season.level, formatDate(season.lastOpened) && `opened ${formatDate(season.lastOpened)}`].filter(Boolean).join(' · ');
  return <article class={`gi-hub-season${season.current ? ' is-current' : ''}`} data-season-id={season.id}>
    <button class="gi-hub-season-open" data-hub-open-season={season.id} onClick={() => screen.openSeason(season.id)}>
      <span class="gi-hub-season-state">{season.current ? 'Current' : season.isDemo ? 'Sample' : 'Season'}</span>
      <span class="gi-hub-season-main"><strong>{season.name}</strong><small>{meta || 'Season workspace'}</small></span>
      <span class="gi-hub-count"><b>{season.gameCount}</b> games</span>
      <span class="gi-hub-count"><b>{season.playCount}</b> plays</span>
      <FilmBadge film={season.film} />
      <span class="gi-hub-open-label">{season.current ? 'Return to Home' : 'Open'} →</span>
    </button>
    <button class="gi-hub-delete" aria-label={`${season.isDemo ? 'Remove sample season' : 'Delete season'} ${season.name}`} onClick={event => screen.deleteSeason(season.id, event.currentTarget)}>×</button>
  </article>;
}

function NativeTeamHub({ screen }) {
  const state = useScreen(screen);
  const active = state.teams.find(team => team.id === state.activeTeamId);
  const demoExists = state.seasons.some(season => season.isDemo);
  if (state.status === 'loading' || state.status === 'idle') return <section class="gi-team-hub" data-native-team-hub><div class="gi-hub-loading" aria-live="polite"><span /><span /><span />Loading teams and seasons…</div></section>;
  if (state.status === 'error') return <section class="gi-team-hub" data-native-team-hub><div class="gi-hub-load-error" role="alert"><span class="gi-hub-kicker">Storage error</span><h1>Teams and seasons did not load</h1><p>{state.error}</p><button onClick={() => screen.load()}>Try again</button></div></section>;
  if (!state.teams.length) return <section class="gi-team-hub" data-native-team-hub><header class="gi-hub-brand">GRIDIRON <b>IQ</b></header><FirstTeam screen={screen} /></section>;

  return <section class="gi-team-hub" data-native-team-hub aria-labelledby="giHubTitle">
    <header class="gi-hub-head">
      <div><span class="gi-hub-kicker">Team / Season workspace</span><h1 id="giHubTitle">{active?.teamName || state.profile.teamName || 'Team Hub'}</h1><p>Choose the program and season. Games open from Home.</p></div>
      <div class="gi-hub-head-actions">
        {state.currentSeasonId && <button onClick={() => screen.close()}>Back</button>}
        <button id="btnNativeTeamFilmSettings" onClick={event => screen.openSettings(event.currentTarget)}>Team &amp; Film Settings</button>
      </div>
    </header>

    <div class="gi-hub-teambar">
      <div class="gi-hub-team-switch" role="group" aria-label="Teams" onKeyDown={event => arrowFocus(event, '[data-hub-team]')}>
        {state.teams.map(team => <button data-hub-team={team.id} class={team.id === state.activeTeamId ? 'is-active' : ''} aria-pressed={team.id === state.activeTeamId} onClick={() => screen.switchTeam(team.id)}><i data-color={team.jerseyColor || 'none'} />{team.teamName}</button>)}
        <button class="gi-hub-add-team" onClick={event => screen.openAddTeam(event.currentTarget)}>+ Add team</button>
      </div>
      <div class="gi-hub-team-actions"><button onClick={() => screen.openRoster()}>Roster</button><button class="is-danger" onClick={event => screen.removeActiveTeam(event.currentTarget)}>Remove team</button></div>
    </div>

    <main class="gi-hub-body">
      <div class="gi-hub-section-head"><div><span class="gi-hub-kicker">Season library</span><h2>Seasons</h2></div><div><button onClick={() => screen.exploreSample()}>{demoExists ? 'Open sample season' : 'Explore sample season'}</button><button class="gi-hub-primary" onClick={event => screen.openCreateSeason(event.currentTarget)}>+ New season</button></div></div>
      {state.seasons.length ? <div class="gi-hub-seasons" role="list" onKeyDown={event => arrowFocus(event, '[data-hub-open-season]')}>{state.seasons.map(season => <SeasonRow key={season.id} season={season} screen={screen} />)}</div> : <div class="gi-hub-empty"><span class="gi-hub-kicker">No seasons yet</span><h3>Start the football year here</h3><p>Create a season for {active?.teamName || 'this team'}, then add games from Home. The sample season is available without touching your roster.</p><button class="gi-hub-primary" onClick={event => screen.openCreateSeason(event.currentTarget)}>Create first season</button></div>}
    </main>
  </section>;
}

export function mountNativeTeamHub({ host, screen }) {
  if (!host) throw new Error('Native Team Hub requires a route host.');
  if (!screen) throw new Error('Native Team Hub requires an injected screen controller.');
  render(<NativeTeamHub screen={screen} />, host);
  return { unmount() { render(null, host); } };
}