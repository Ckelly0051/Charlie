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

function TeamFormFields() {
  return <>
    <label class="gi-hub-field"><span>Team name</span><input name="teamName" autoFocus required placeholder="St. Joseph Mavericks" /></label>
    <label class="gi-hub-field"><span>Jersey color</span><select name="jerseyColor" defaultValue="">{COLORS.map(value => <option value={value}>{value ? value[0].toUpperCase() + value.slice(1) : 'Not set'}</option>)}</select></label>
  </>;
}

export function AddTeamForm({ onSubmit, onCancel }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    const result = await onSubmit({ name: values.get('teamName'), jerseyColor: values.get('jerseyColor') });
    if (!result?.ok) { setError(result?.message || 'The team could not be added.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form" onSubmit={submit}>
    <p>Teams keep seasons, roster, and custom football vocabulary separate.</p>
    <TeamFormFields />
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Adding…' : 'Add team'}</button></div>
  </form>;
}

/* J8 — TYPE-TO-CONFIRM FOR DESTRUCTIVE DELETES.
   Coach: "delete season is a huge potential for data loss. We should have a
   confirmation click that requires spelling delete in a text box." Confirmed
   for delete-GAME as well.

   A season is the largest destructible object in the product — six games and
   440 charted plays in the coach's live data — and it sat behind one `×` at the
   end of a row, beside an arrow pointing at it (J7). A click plus an OK is not
   a decision at that size.

   This is IN ADDITION to the existing destructive-overlay rules, not instead of
   them: the service still forces an explicit Cancel as the default action, and
   the impact summary above the field still names the games, plays and film
   affected. The summary is what makes typing the word a real decision rather
   than a speed bump, so it stays. */
export function ConfirmDeleteForm({ impact, phrase = 'delete', confirmLabel, onSubmit }) {
  const [typed, setTyped] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const armed = typed.trim().toLowerCase() === phrase.toLowerCase();
  const submit = async event => {
    event.preventDefault();
    if (!armed) return;
    setBusy(true); setError('');
    const result = await onSubmit();
    if (!result?.ok) { setError(result?.message || 'That could not be deleted.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form gi-confirm-delete" onSubmit={submit}>
    <p>{impact}</p>
    <label class="gi-confirm-field">
      <span>Type <b>{phrase}</b> to confirm</span>
      <input
        name="confirm" type="text" autoComplete="off" autoCorrect="off" spellcheck={false}
        value={typed} onInput={event => setTyped(event.currentTarget.value)}
        aria-describedby="giConfirmHint" />
    </label>
    <p id="giConfirmHint" class="gi-confirm-hint">This cannot be undone.</p>
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions">
      <button class="is-danger" disabled={!armed || busy}>{busy ? 'Deleting…' : (confirmLabel || 'Delete')}</button>
    </div>
  </form>;
}

export function CreateSeasonForm({ teamName, onSubmit, onCancel }) {
  const yearNow = String(new Date().getFullYear());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    const result = await onSubmit({ name: values.get('seasonName'), year: values.get('year'), level: values.get('level') });
    if (!result?.ok) { setError(result?.message || 'The season could not be created.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form" onSubmit={submit}>
    <p>For <strong>{teamName || 'this team'}</strong>. Games are added from Home after the season opens.</p>
    <label class="gi-hub-field"><span>Season name</span><input name="seasonName" autoFocus required placeholder={`${yearNow} ${teamName || 'Season'}`} /></label>
    <div class="gi-hub-field-row">
      <label class="gi-hub-field"><span>Year</span><input name="year" defaultValue={yearNow} inputMode="numeric" /></label>
      <label class="gi-hub-field"><span>Level</span><input name="level" defaultValue="Varsity" placeholder="Varsity" /></label>
    </div>
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Creating…' : 'Create season'}</button></div>
  </form>;
}

export function CreateScoutForm({ onSubmit, onCancel }) {
  const yearNow = String(new Date().getFullYear());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    const result = await onSubmit({ opponent: values.get('opponent'), year: values.get('year'), sourceTeamA: values.get('sourceTeamA'), sourceTeamB: values.get('sourceTeamB'), date: values.get('date') });
    if (!result?.ok) { setError(result?.message || 'The opponent scout could not be created.'); setBusy(false); }
  };
  return <form class="gi-hub-dialog-form" onSubmit={submit}>
    <p>Create a separate scouting workspace. Its games use the same charting and analytics engine, but never count in your program record or season totals.</p>
    <label class="gi-hub-field"><span>Opponent</span><input name="opponent" autoFocus required placeholder="Holy Family Wildcats" /></label>
    <label class="gi-hub-field"><span>Season</span><input name="year" defaultValue={yearNow} inputMode="numeric" /></label>
    <div class="gi-hub-field-row gi-hub-scout-matchup">
      <label class="gi-hub-field"><span>Team A</span><input name="sourceTeamA" required placeholder="Opponent" /></label>
      <label class="gi-hub-field"><span>Team B</span><input name="sourceTeamB" required placeholder="Film opponent" /></label>
    </div>
    <label class="gi-hub-field"><span>Game date</span><input name="date" type="date" /></label>
    <p class="gi-hub-form-note">After creation, link the source game's folder in Team &amp; Film Settings. Film stays in its existing location.</p>
    {error && <p class="gi-hub-error" role="alert">{error}</p>}
    <div class="gi-hub-form-actions"><button type="button" onClick={onCancel}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Creating…' : 'Create scout'}</button></div>
  </form>;
}
/* PC-3 explicit recovery (Convergence Plan Invariant #6): the coach-triggered
   preview-and-confirm replacement for the removed automatic mirror import.
   `candidates` is the already-fetched scanRecoverableSeasons() result --
   fetched once by the screen before this opens, never re-fetched here, so
   the list a coach reviews cannot silently change mid-decision. Every row's
   own Recover click re-validates and re-confirms at the point of action
   (onRecover), never trusting this snapshot as authorization by itself. */
function RecoverCandidate({ candidate, onRecover }) {
  const [state, setState] = useState('idle'); // idle | confirming | busy | error
  const [error, setError] = useState('');
  const label = candidate.valid ? 'Recoverable'
    : candidate.reason === 'legacy-unenveloped' ? 'Legacy backup (unverified)'
    : `Not recoverable (${candidate.reason || 'unreadable'})`;
  // PC-2 repair (Codex review 89e34c6, finding 4): a legacy-unenveloped
  // snapshot has NO checksum, NO validated identity, and NO count check at
  // all -- unwrap() reports it as `valid:false` for exactly that reason. It
  // previously stayed one-click actionable anyway (only the label read
  // "unverified"), and the backend imported its raw contents unconditionally.
  // Every genuinely-invalid candidate is disabled now, legacy included: still
  // VISIBLE so the coach knows the file exists rather than it silently
  // disappearing, but not importable until a permissioned migration path can
  // give it a real integrity check.
  const disabled = !candidate.valid;
  const disabledHint = disabled && candidate.reason === 'legacy-unenveloped'
    ? 'This backup predates checksum verification and cannot be recovered automatically yet.'
    : undefined;
  const run = async (confirmOverwrite) => {
    setState('busy'); setError('');
    const result = await onRecover(candidate, confirmOverwrite);
    if (!result?.ok) { setState('error'); setError(result?.reason === 'exists' ? 'Already in your library.' : (result?.message || 'Could not recover this season.')); return; }
    setState('recovered');
  };
  const click = () => { if (candidate.existsInCatalog) setState('confirming'); else run(false); };
  return <article class={`gi-hub-recover-row is-${candidate.valid ? 'valid' : 'invalid'}`}>
    <div class="gi-hub-recover-main">
      <strong>{candidate.name}</strong>
      <small>{[candidate.team, `${candidate.gameCount} game${candidate.gameCount === 1 ? '' : 's'}`, `${candidate.playCount} play${candidate.playCount === 1 ? '' : 's'}`, formatDate(candidate.timestamp)].filter(Boolean).join(' · ')}</small>
      <span class={`gi-hub-recover-state is-${candidate.valid ? 'ok' : 'warn'}`}>{label}</span>
    </div>
    {state === 'confirming'
      ? <div class="gi-hub-recover-confirm">
          <p>A season with this id is already in your library. Recovering will overwrite it.</p>
          <button onClick={() => setState('idle')}>Cancel</button>
          <button class="is-danger" onClick={() => run(true)}>Overwrite and recover</button>
        </div>
      : <div class="gi-hub-recover-actions">
          {state === 'recovered' ? <span class="gi-hub-recover-done">Recovered</span>
            : <button disabled={disabled || state === 'busy'} title={disabledHint} onClick={click}>{state === 'busy' ? 'Recovering…' : candidate.existsInCatalog ? 'Recover (overwrite)' : 'Recover'}</button>}
          {error && <p class="gi-hub-error" role="alert">{error}</p>}
        </div>}
  </article>;
}

export function RecoverSeasonsForm({ candidates, onRecover }) {
  return <div class="gi-hub-dialog-form gi-hub-recover-list">
    <p>These are Documents-mirror recovery snapshots found on this machine. Recovering imports one into your live season catalog. This never happens automatically.</p>
    {candidates.map(candidate => <RecoverCandidate key={candidate.id} candidate={candidate} onRecover={onRecover} />)}
  </div>;
}

function WorkspaceChoice({ mode = 'program', screen, compact = false }) {
  return <div class={`gi-hub-workspace-choice${compact ? ' is-compact' : ''}`} role="group" aria-label="Football workspace">
    <button class={mode === 'program' ? 'is-active' : ''} aria-pressed={mode === 'program'} onClick={() => screen.selectWorkspace('program')}>
      <span class="gi-hub-workspace-icon">O</span><span><strong>Our Program</strong><small>Chart our games, manage the season, and measure our team.</small></span>
    </button>
    <button class={mode === 'scout' ? 'is-active' : ''} aria-pressed={mode === 'scout'} onClick={() => screen.selectWorkspace('scout')}>
      <span class="gi-hub-workspace-icon is-scout">S</span><span><strong>Opponent Scout</strong><small>Chart outside film without changing our record or season totals.</small></span>
    </button>
  </div>;
}

function FirstTeam({ screen, mode }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const submit = async event => {
    event.preventDefault();
    const values = new FormData(event.currentTarget);
    setBusy(true); setError('');
    const result = await screen.addTeam({ name: values.get('teamName'), jerseyColor: values.get('jerseyColor') });
    if (!result?.ok) { setError(result?.message || 'The team could not be saved.'); setBusy(false); }
  };
  return <section class="gi-hub-onboarding gi-hub-first" aria-labelledby="giHubFirstTitle">
    <header><span class="gi-hub-kicker">Welcome to GridIron IQ</span><h1 id="giHubFirstTitle">What are you working on?</h1><p>Start with your program or an opponent. Both use the same film room and football analysis, while their schedules and results stay separate.</p></header>
    <WorkspaceChoice mode={mode} screen={screen} />
    <div class="gi-hub-onboarding-step"><span class="gi-hub-step-number">1</span><div><h2>Set up your program</h2><p>This becomes the home for seasons, roster, play library, and scouting work.</p></div></div>
    <form onSubmit={submit}><TeamFormFields />
      {error && <p class="gi-hub-error" role="alert">{error}</p>}
      <button class="gi-hub-primary" disabled={busy}>{busy ? 'Saving…' : 'Create team'}</button>
    </form>
    <p class="gi-hub-storage-promise"><strong>Film stays where you keep it.</strong><span>Choose or change the linked library from Team &amp; Film Settings.</span></p>
  </section>;
}

function FilmBadge({ film }) {
  return <span class={`gi-hub-film is-${film?.state || 'checking'}`}><i />{film?.label || 'Checking film'}</span>;
}

function SeasonRow({ season, screen }) {
  const meta = [season.year, season.level, formatDate(season.lastOpened) && `opened ${formatDate(season.lastOpened)}`].filter(Boolean).join(' · ');
  return <article class={`gi-hub-season${season.current ? ' is-current' : ''}`} data-season-id={season.id}>
    <div class="gi-hub-season-summary">
      <span class="gi-hub-season-state">{season.current ? 'Current' : season.isDemo ? 'Sample' : 'Season'}</span>
      <span class="gi-hub-season-main"><strong>{season.name}</strong><small>{meta || 'Season workspace'}</small></span>
      <span class="gi-hub-season-counts">
        <span class="gi-hub-count"><b>{season.gameCount}</b> games</span>
        <span class="gi-hub-count"><b>{season.playCount}</b> plays</span>
      </span>
      <FilmBadge film={season.film} />
    </div>
    <div class="gi-hub-season-actions">
      <button class="gi-hub-season-open" data-hub-open-season={season.id} onClick={() => screen.openSeason(season.id)}>{season.current ? 'Return to Home' : 'Open'}</button>
      <button class="gi-hub-delete" aria-label={`${season.isDemo ? 'Remove sample season' : 'Delete season'} ${season.name}`} onClick={event => screen.deleteSeason(season.id, event.currentTarget)}>{season.isDemo ? 'Remove' : 'Delete'}</button>
    </div>
  </article>;
}
function SetupProgress({ checklist, screen }) {
  if (!checklist?.visible) return null;
  return <section class="gi-hub-setup" aria-labelledby="giHubSetupTitle">
    <div class="gi-hub-setup-head">
      <div><span class="gi-hub-kicker">Setup progress</span><h2 id="giHubSetupTitle">Get started</h2></div>
      <div><strong>{checklist.doneCount} of {checklist.items.length}</strong><button class="gi-hub-setup-dismiss" aria-label="Hide setup progress" title="Hide setup progress" onClick={() => screen.dismissChecklist()}>×</button></div>
    </div>
    <div class="gi-hub-setup-bar" aria-hidden="true"><i style={{ width: `${Math.round(checklist.doneCount / checklist.items.length * 100)}%` }} /></div>
    <ol class="gi-hub-setup-steps">
      {checklist.items.map(item => <li class={item.done ? 'is-done' : ''}>
        <button disabled={item.done} onClick={event => screen.runChecklistAction(item.step, event.currentTarget)}>
          <span>{item.done ? '✓' : '→'}</span>{item.label}
        </button>
      </li>)}
    </ol>
  </section>;
}

function ControlCenter({ control, screen }) {
  if (!control) return null;
  const storageReady = control.desktop ? !!control.root || control.mode === 'managed' : true;
  return <aside class="gi-hub-control" aria-labelledby="giHubControlTitle">
    <header><span class="gi-hub-kicker">Team &amp; Film</span><h2 id="giHubControlTitle">Control Center</h2></header>
    <button class="gi-hub-control-row" onClick={event => screen.openSettings(event.currentTarget, 'film')}><i class={`gi-hub-control-state ${storageReady ? 'is-ok' : 'is-warn'}`} /><span><strong>Film storage</strong><small>{control.root || control.storageLabel}</small></span><b>Manage</b></button>
    <button class="gi-hub-control-row" onClick={event => screen.openRoster(event.currentTarget)}><i class={`gi-hub-control-state ${control.rosterCount ? 'is-ok' : ''}`} /><span><strong>Roster</strong><small>{control.rosterCount ? `${control.rosterCount} players ready for attribution` : 'Add players or import a roster'}</small></span><b>Open</b></button>
    {screen.canRecoverSeasons() && <button class="gi-hub-control-row" data-native-hub-recover onClick={event => screen.recoverSeasons(event.currentTarget)}><i class="gi-hub-control-state is-ok" /><span><strong>Backups &amp; recovery</strong><small>{control.recovery}</small></span><b>Review</b></button>}
    <div class="gi-hub-control-facts"><span><b>{control.games}</b>games</span><span><b>{control.plays}</b>plays</span><span><b>{control.rosterCount}</b>players</span></div>
  </aside>;
}

function NativeTeamHub({ screen }) {
  const state = useScreen(screen);
  const active = state.teams.find(team => team.id === state.activeTeamId);
  const demoExists = state.seasons.some(season => season.isDemo);
  if (state.status === 'loading' || state.status === 'idle') return <section class="gi-team-hub" data-native-team-hub><div class="gi-hub-loading" aria-live="polite"><span /><span /><span />Loading teams and seasons…</div></section>;
  if (state.status === 'error') return <section class="gi-team-hub" data-native-team-hub><div class="gi-hub-load-error" role="alert"><span class="gi-hub-kicker">Storage error</span><h1>Teams and seasons did not load</h1><p>{state.error}</p><button onClick={() => screen.load()}>Try again</button></div></section>;
  if (!state.teams.length) return <section class="gi-team-hub" data-native-team-hub><header class="gi-hub-brand">GRIDIRON <b>IQ</b></header><FirstTeam screen={screen} mode={state.workspaceMode} /></section>;

  const scout = state.workspaceMode === 'scout';
  const create = event => scout ? screen.openCreateScout(event.currentTarget) : screen.openCreateSeason(event.currentTarget);
  return <section class="gi-team-hub" data-native-team-hub aria-labelledby="giHubTitle">
    <header class="gi-hub-head gi-hub-command-head">
      <div><span class="gi-hub-kicker">Football workspace</span><h1 id="giHubTitle">{active?.teamName || state.profile.teamName || 'Team Hub'}</h1><p>Choose what you are preparing for, then open the right film workspace.</p></div>
      <div class="gi-hub-head-actions">{state.currentSeasonId && <button onClick={() => screen.close()}>Back</button>}<button id="btnNativeTeamFilmSettings" onClick={event => screen.openSettings(event.currentTarget, 'film')}>Team &amp; Film Settings</button></div>
    </header>
    <div class="gi-hub-teambar">
      <div class="gi-hub-team-switch" role="group" aria-label="Teams" onKeyDown={event => arrowFocus(event, '[data-hub-team]')}>
        {state.teams.map(team => <button data-hub-team={team.id} class={team.id === state.activeTeamId ? 'is-active' : ''} aria-pressed={team.id === state.activeTeamId} onClick={() => screen.switchTeam(team.id)}><i data-color={team.jerseyColor || 'none'} />{team.teamName}</button>)}
        <button class="gi-hub-add-team" onClick={event => screen.openAddTeam(event.currentTarget)}>+ Add team</button>
      </div>
      <div class="gi-hub-team-actions"><button onClick={event => screen.openRoster(event.currentTarget)}>Roster</button><button class="is-danger" onClick={event => screen.removeActiveTeam(event.currentTarget)}>Remove team</button></div>
    </div>
    <main class="gi-hub-body gi-hub-command-body">
      <WorkspaceChoice mode={state.workspaceMode} screen={screen} compact />
      <section class={`gi-hub-workspace-hero${scout ? ' is-scout' : ''}`}><div><span class="gi-hub-kicker">{scout ? 'Opponent preparation' : 'Program operations'}</span><h2>{scout ? 'Opponent Scouting Library' : `${active?.teamName || 'Our Program'} Seasons`}</h2><p>{scout ? 'Chart games the opponent played against other teams. Their film stays isolated from our schedule, record, and team totals.' : 'Manage our seasons, chart our games, and carry the same roster and football language through the year.'}</p></div><button class="gi-hub-primary gi-hub-hero-action" onClick={create}>+ {scout ? 'New opponent scout' : 'New season'}</button></section>
      {!scout && <SetupProgress checklist={state.checklist} screen={screen} />}
      <div class="gi-hub-command-grid">
        <section class="gi-hub-library"><div class="gi-hub-section-head"><div><span class="gi-hub-kicker">{scout ? 'Scouting workspaces' : 'Season library'}</span><h2>{scout ? 'Opponents' : 'Seasons'}</h2></div>{!scout && <div><button onClick={() => screen.exploreSample()}>{demoExists ? 'Open sample season' : 'Explore sample season'}</button></div>}</div>
          {state.seasons.length ? <div class="gi-hub-seasons" role="list" onKeyDown={event => arrowFocus(event, '[data-hub-open-season]')}>{state.seasons.map(season => <SeasonRow key={season.id} season={season} screen={screen} />)}</div> : <div class="gi-hub-empty-inline"><span class="gi-hub-kicker">Nothing here yet</span><h3>{scout ? 'Scout an opponent without touching our season' : 'Start the football year here'}</h3><p>{scout ? 'Create an opponent, name the two teams in the source film, then link that game folder and chart it normally.' : `Create a season for ${active?.teamName || 'this team'}, then add games from Home.`}</p><button class="gi-hub-primary" onClick={create}>{scout ? 'Create first opponent scout' : 'Create first season'}</button></div>}
        </section>
        <ControlCenter control={state.control} screen={screen} />
      </div>
    </main>
  </section>;
}

export function mountNativeTeamHub({ host, screen }) {
  if (!host) throw new Error('Native Team Hub requires a route host.');
  if (!screen) throw new Error('Native Team Hub requires an injected screen controller.');
  render(<NativeTeamHub screen={screen} />, host);
  return { unmount() { render(null, host); } };
}