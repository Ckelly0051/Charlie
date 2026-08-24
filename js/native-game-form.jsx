import { useState } from 'preact/hooks';
import '../css/native-game-form.css';

const clean = value => String(value ?? '').trim();

export function NativeGameForm({ mode, initial, trackedScore, onSubmit, onCancel, onDelete, scout = false, scoutTarget = '' }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = event => setValues(current => ({ ...current, [event.currentTarget.name]: event.currentTarget.value }));
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    const result = await onSubmit({
      week: clean(values.week), opponent: clean(values.opponent), sourceTeamA: clean(values.sourceTeamA), sourceTeamB: clean(values.sourceTeamB), date: clean(values.date),
      homeAway: clean(values.homeAway), gameType: clean(values.gameType) || 'game',
      perspective: clean(values.perspective) || 'offense', scoreUs: clean(values.scoreUs), scoreThem: clean(values.scoreThem),
    });
    if (!result?.ok) { setError(result?.message || 'The game could not be saved. Nothing changed.'); setBusy(false); }
  };
  const applyTracked = () => setValues(current => ({ ...current, scoreUs: String(trackedScore.us), scoreThem: String(trackedScore.them) }));
  return <form class="gi-game-form" data-native-game-form data-mode={mode} onSubmit={submit}>
    <p class="gi-game-intro">{scout ? `Add a game from ${scoutTarget || 'the opponent'}'s film history. It stays outside our schedule and record.` : mode === 'create' ? 'Set the game context before film is added.' : 'Update the context coaches see across film, reports, and Study.'}</p>
    <div class="gi-game-grid is-identity">
      {scout ? <><label><span>Team A</span><input name="sourceTeamA" value={values.sourceTeamA} onInput={update} placeholder={scoutTarget || 'Opponent'} autoComplete="off" required /></label><label><span>Team B</span><input name="sourceTeamB" value={values.sourceTeamB} onInput={update} placeholder="Film opponent" autoComplete="off" required /></label></> : <><label><span>Week <small>optional</small></span><input name="week" value={values.week} onInput={update} placeholder="1" autoComplete="off" /></label><label><span>Opponent</span><input name="opponent" value={values.opponent} onInput={update} placeholder="Central Tigers" autoComplete="off" /></label></>}
    </div>
    <div class="gi-game-grid">
      <label><span>Game date</span><input name="date" type="date" value={values.date} onInput={update} /></label>
      <label><span>Location</span><select name="homeAway" value={values.homeAway} onInput={update}><option value="">Not set</option><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral</option></select></label>
      {scout ? <label><span>Film purpose</span><input value="Opponent scout" disabled /></label> : <label><span>Game type</span><select name="gameType" value={values.gameType} onInput={update}><option value="game">Game</option><option value="scrimmage">Scrimmage</option><option value="playoff">Playoff</option></select></label>}
    </div>
    {scout ? <label class="gi-game-field"><span>Film source</span><input value="Opponent Scout · chart their offense and defense" disabled /><small>Study and Reports describe the opponent. This game never counts in our program record.</small></label> : <label class="gi-game-field"><span>Film source</span><select name="perspective" value={values.perspective} onInput={update}><option value="offense">Our game · start charting Offense</option><option value="defense">Our game · start charting Defense</option><option value="special">Our game · start charting Special Teams</option><option value="scout">Opponent film · Scout</option></select><small>This controls who the analytics describe and which unit a new play starts on.</small></label>}
    <fieldset class="gi-game-score"><legend>Final score <small>optional</small></legend><div><label><span>{scout ? (values.sourceTeamA || 'Team A') : 'Us'}</span><input name="scoreUs" type="number" min="0" inputMode="numeric" value={values.scoreUs} onInput={update} /></label><b aria-hidden="true">–</b><label><span>{scout ? (values.sourceTeamB || 'Team B') : 'Them'}</span><input name="scoreThem" type="number" min="0" inputMode="numeric" value={values.scoreThem} onInput={update} /></label></div>
      <div class="gi-game-tracked"><span>Tagged score <strong>{trackedScore.us}–{trackedScore.them}</strong></span><button type="button" onClick={applyTracked} disabled={!trackedScore.hasData}>Use tagged score</button></div>
    </fieldset>
    {error && <p class="gi-game-error" role="alert">{error}</p>}
    <div class="gi-game-actions">{onDelete && <button type="button" class="is-danger" onClick={onDelete} disabled={busy}>Delete game</button>}<button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Saving…' : mode === 'create' ? (scout ? 'Create source game' : 'Create game') : 'Save game'}</button></div>
  </form>;
}