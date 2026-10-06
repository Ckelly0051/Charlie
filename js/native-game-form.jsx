import { useState } from 'preact/hooks';
import '../css/native-game-form.css';

const clean = value => String(value ?? '').trim();

export function NativeGameForm({ mode, initial, trackedScore, onSubmit, onCancel, onDelete, scout = false, scoutTarget = '' }) {
  const [values, setValues] = useState(initial);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const update = event => setValues(current => ({ ...current, [event.currentTarget.name]: event.currentTarget.value }));
  const toggle = event => setValues(current => ({ ...current, [event.currentTarget.name]: event.currentTarget.checked }));
  const submit = async event => {
    event.preventDefault();
    setBusy(true); setError('');
    const result = await onSubmit({
      week: clean(values.week), opponent: clean(values.opponent), opponentNickname: clean(values.opponentNickname),
      sourceTeamA: clean(values.sourceTeamA), sourceTeamANickname: clean(values.sourceTeamANickname),
      sourceTeamB: clean(values.sourceTeamB), sourceTeamBNickname: clean(values.sourceTeamBNickname), date: clean(values.date),
      // No `perspective`: Program versus Opponent Scout comes from the owning
      // season in `GameScreen.save()`, and the charting unit is chosen in Break
      // Down. A per-game choice could mark a program game as scout, which
      // silently drops it from our record and totals.
      homeAway: clean(values.homeAway), gameType: clean(values.gameType) || 'game',
      scoreUs: clean(values.scoreUs), scoreThem: clean(values.scoreThem),
      final: !scout && values.final === true,
    });
    if (!result?.ok) { setError(result?.message || 'The game could not be saved. Nothing changed.'); setBusy(false); }
  };
  const applyTracked = () => setValues(current => ({ ...current, scoreUs: String(trackedScore.us), scoreThem: String(trackedScore.them) }));
  return <form class="gi-game-form" data-native-game-form data-mode={mode} onSubmit={submit}>
    {/* Supporting copy only where it carries information the coach needs for
        the next decision. A scout game's exclusion from our record is that;
        "Set the game context before film is added" was narration. */}
    {scout && <p class="gi-game-intro">Source film from {scoutTarget || 'the opponent'}. It stays outside our schedule and record.</p>}
    {/* School/nickname are separate fields (2026-08-31 Home naming contract).
        Editing an existing game prefills the school input with the intact
        stored `opponent`/`sourceTeamA`/`sourceTeamB` value and leaves nickname
        blank — never a heuristic split — so an unmodified resave composes
        back to the exact same identity. */}
    <div class="gi-game-group">
      <h3>{scout ? 'Teams on this film' : 'Opponent'}</h3>
      <div class="gi-game-grid is-identity">
        {scout ? <>
          <label><span>Team A: school / organization</span><input name="sourceTeamA" value={values.sourceTeamA} onInput={update} placeholder={scoutTarget || 'Opponent'} autoComplete="off" required /></label>
          <label><span>Nickname <small>optional</small></span><input name="sourceTeamANickname" value={values.sourceTeamANickname} onInput={update} placeholder="e.g. Wildcats" autoComplete="off" /></label>
          <label><span>Team B: school / organization</span><input name="sourceTeamB" value={values.sourceTeamB} onInput={update} placeholder="Film opponent" autoComplete="off" required /></label>
          <label><span>Nickname <small>optional</small></span><input name="sourceTeamBNickname" value={values.sourceTeamBNickname} onInput={update} placeholder="e.g. Tigers" autoComplete="off" /></label>
        </> : <>
          <label><span>Opponent: school / organization</span><input name="opponent" value={values.opponent} onInput={update} placeholder="Central" autoComplete="off" /></label>
          <label><span>Nickname <small>optional</small></span><input name="opponentNickname" value={values.opponentNickname} onInput={update} placeholder="e.g. Tigers" autoComplete="off" /></label>
        </>}
      </div>
    </div>
    <div class="gi-game-group">
      <h3>Schedule</h3>
      <div class="gi-game-grid">
      {!scout && <label><span>Week <small>optional</small></span><input name="week" value={values.week} onInput={update} placeholder="1" autoComplete="off" /></label>}
      <label><span>Game date</span><input name="date" type="date" value={values.date} onInput={update} /></label>
      <label><span>Location</span><select name="homeAway" value={values.homeAway} onInput={update}><option value="">Not set</option><option value="home">Home</option><option value="away">Away</option><option value="neutral">Neutral</option></select></label>
      {scout ? <label><span>Film purpose</span><input value="Opponent scout" disabled /></label> : <label><span>Game type</span><select name="gameType" value={values.gameType} onInput={update}><option value="game">Game</option><option value="scrimmage">Scrimmage</option><option value="playoff">Playoff</option></select></label>}
      </div>
    </div>
    {/* A group, not a fieldset: the bordered legend box read as a second card
        inside an already-bordered dialog, and its score inputs rendered as
        unbordered filled bars unlike every other input on the form. */}
    <div class="gi-game-group">
      <h3>Final score <small>optional</small></h3>
      <div class="gi-game-score">
        <label><span>{scout ? (values.sourceTeamA || 'Team A') : 'Us'}</span><input name="scoreUs" type="number" min="0" inputMode="numeric" value={values.scoreUs} onInput={update} /></label>
        <b aria-hidden="true">–</b>
        <label><span>{scout ? (values.sourceTeamB || 'Team B') : 'Them'}</span><input name="scoreThem" type="number" min="0" inputMode="numeric" value={values.scoreThem} onInput={update} /></label>
      </div>
      <div class="gi-game-tracked"><span>Tagged score <strong>{trackedScore.us}–{trackedScore.them}</strong></span><button type="button" onClick={applyTracked} disabled={!trackedScore.hasData}>Use tagged score</button></div>
      {!scout && mode !== 'create' && <label class="gi-game-final"><input type="checkbox" name="final" checked={values.final === true} onChange={toggle} /><span>Mark as Final</span></label>}
    </div>
    {error && <p class="gi-game-error" role="alert">{error}</p>}
    <div class="gi-game-actions">{onDelete && <button type="button" class="is-danger" onClick={onDelete} disabled={busy}>Delete game</button>}<button type="button" onClick={onCancel} disabled={busy}>Cancel</button><button class="is-primary" disabled={busy}>{busy ? 'Saving…' : mode === 'create' ? (scout ? 'Create source game' : 'Create game') : 'Save game'}</button></div>
  </form>;
}