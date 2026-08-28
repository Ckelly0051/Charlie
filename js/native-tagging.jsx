import { render } from 'preact';
import { useLayoutEffect, useState } from 'preact/hooks';
import '../css/native-tagging.css';

// Final Engine Independence: PlayGrid's inline Film Room editor (play-grid.js)
// used to read its option lists straight off the legacy .tag-section chip
// DOM (`document.querySelectorAll('#tagFormation .pick')` etc.) -- now
// deleted. OPTIONS is exported so it stays the single source of a fixed
// vocabulary field's values, consumed by both the tag form and the grid
// editor, instead of two copies drifting apart.
export const OPTIONS = {
  down:['1','2','3','4'], qbAlignment:['Under Center','Pistol','Shotgun'],
  strength:['Right','Left','Balanced'], personnel:['00','01','02','10','11','12','13','20','21','22','23','30','31','32','Jumbo','Goal Line'],
  motion:['Jet','Orbit','Shift','Trade'], runPass:['Run','Pass'],
  playType:['Run Inside','Run Outside','Screen','Short Pass','Medium Pass','Deep Pass','Play Action','RPO','Trick Play'],
  playDir:['Left','Middle','Right'],
  coverage:['Cover 0','Cover 1','Cover 2','Cover 3','Cover 4','Cover 5','Cover 6'],
  coverageFamily:['Man','Zone','Match'], blitz:['A-Gap','B-Gap','C-Gap','Edge','DB Blitz','Zone Blitz'],
  hash:['Left','Middle','Right'], quarter:['Q1','Q2','Q3','Q4','OT'],
};
const MULTI = new Set(['formation','playType','result','defFront','blitz']);
const selected = (value, option) => String(value || '').split(' + ').includes(option);

function Chips({screen, field, label, options, value, hint, library}) {
  const choices = options.map(option => typeof option === 'string' ? { value: option, label: option } : option);
  return <div class={`gi-tag-field gi-tag-field-${field}`} data-native-field={field}>
    <div class="gi-tag-field-label">
      <span>{label}</span>{hint && <small>{hint}</small>}
      {library && <button type="button" onClick={() => screen.openLibrary(library)}>Edit library</button>}
    </div>
    <div class="gi-tag-chips">{choices.map(option =>
      <button type="button" key={option.value} class={selected(value, option.value) ? 'is-active' : ''}
        aria-pressed={selected(value, option.value)}
        onClick={() => MULTI.has(field) ? screen.toggleField(field, option.value) : screen.setField(field, selected(value, option.value) ? '' : option.value)}>
        {option.label}
      </button>)}
    </div>
  </div>;
}

function Field({screen, field, label, value, type='number', min, max, step, placeholder}) {
  return <label class={`gi-tag-input gi-tag-input-${field}`} data-native-field={field}>
    <span>{label}</span>
    <input type={type} value={value ?? ''} min={min} max={max} step={step} placeholder={placeholder}
      onChange={event => screen.setField(field, event.currentTarget.value)}
      onKeyDown={event => { if ((field === 'yardage' || field === 'distance') && event.key === 'Enter') { event.preventDefault(); screen.setField(field, event.currentTarget.value); screen.saveNext(); }}}/>
  </label>;
}

const CALL_DEFAULT_LABELS = {
  runPass:'Run / Pass', playType:'Play Type', playDir:'Direction', formation:'Formation',
  qbAlignment:'QB Alignment', backfield:'Backfield', strength:'Strength',
  personnel:'Personnel', motion:'Motion',
};

function PlayCallField({screen, state}) {
  const value = state.values.playCall || '';
  const [draft,setDraft] = useState(value);
  useLayoutEffect(() => setDraft(value), [state.currentPlayId, value]);
  const calls = state.playbookCalls || [];
  const match = calls.find(call => call.name.toLowerCase() === draft.trim().toLowerCase());
  const quick = [];
  const seen = new Set();
  for (const call of calls.filter(item => item.favorite)) {
    if (!seen.has(call.name.toLowerCase())) { seen.add(call.name.toLowerCase()); quick.push({name:call.name,favorite:true}); }
  }
  for (const name of state.recentCalls || []) {
    if (!seen.has(name.toLowerCase())) { seen.add(name.toLowerCase()); quick.push({name,favorite:false}); }
  }
  const applied = Object.entries(state.appliedCallDefaults || {});
  const commit = candidate => screen.selectPlayCall(candidate ?? draft);
  return <section class="gi-play-call" data-native-play-call>
    <div class="gi-tag-field-label">
      <span>{state.unit === 'offense' && state.perspective !== 'scout' ? 'Play Call' : 'Opponent Play'}</span>
      {state.values.playConcept && <small>Concept: {state.values.playConcept}</small>}
      <button type="button" class="gi-play-call-library" onClick={() => screen.editPlayCallLibrary()}>Edit Library</button>
    </div>
    <div class="gi-play-call-entry">
      <input type="text" list="giPlayCallChoices" value={draft} placeholder="e.g. 26 Blast"
        aria-label={state.unit === 'offense' && state.perspective !== 'scout' ? 'Play Call' : 'Opponent Play'}
        onInput={event => setDraft(event.currentTarget.value)}
        onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); commit(event.currentTarget.value); event.currentTarget.blur(); }}}/>
      <datalist id="giPlayCallChoices">{calls.map(call => <option key={call.id} value={call.name}>{call.concept || ''}</option>)}</datalist>
      {draft.trim() && <div class="gi-play-call-entry-actions">
        <button type="button" onClick={() => commit(draft)}>{match ? 'Use call' : 'Use once'}</button>
        {!match && <button type="button" onClick={() => screen.editPlayCallLibrary(draft)}>Add to Playbook</button>}
        {value && <button type="button" class="gi-play-call-clear" aria-label="Clear play call"
          onClick={() => { setDraft(''); screen.selectPlayCall(''); }}>Clear</button>}
      </div>}
    </div>
    {quick.length > 0 && <div class="gi-play-call-quick" aria-label="Favorite and recent play calls">
      {quick.slice(0,6).map(item => <button type="button" key={item.name} class={item.name === value ? 'is-active' : ''}
        onClick={() => { setDraft(item.name); screen.selectPlayCall(item.name); }}>{item.favorite ? '★ ' : ''}{item.name}</button>)}
    </div>}
    {applied.length > 0 && <div class="gi-play-call-defaults" aria-label="Defaults applied by this call">
      <span>Applied:</span>{applied.map(([key,fieldValue]) => <em key={key}>{CALL_DEFAULT_LABELS[key] || key}: {fieldValue}</em>)}
    </div>}
  </section>;
}

const RESULT_PRIMARY = [
  {value:'Gain',label:'Gain'}, {value:'Loss',label:'Loss'}, {value:'No Gain',label:'No Gain'},
  {value:'Incomplete',label:'Incomplete'}, {value:'Touchdown',label:'TD'}, {value:'Sack',label:'Sack'},
  {value:'Interception',label:'INT'}, {value:'Fumble',label:'Fumble'},
];
const RESULT_MORE = ['Punt','Penalty','Field Goal','Good','No Good','Kneel','Spike','Safety'];
// Flat vocabulary for consumers that need every Result value, not the
// primary/overflow split the chip UI renders (e.g. PlayGrid's inline editor).
export const RESULT_OPTIONS = [...RESULT_PRIMARY.map(o => o.value), ...RESULT_MORE];

function ResultField({screen, state}) {
  const value = state.values.result;
  const hiddenCount = RESULT_MORE.filter(option => selected(value, option)).length;
  return <div class="gi-tag-field gi-tag-result" data-native-field="result">
    <div class="gi-tag-field-label"><span>Result</span></div>
    <div class="gi-tag-result-row">
      <div class="gi-tag-chips">{RESULT_PRIMARY.map(option =>
        <button type="button" key={option.value} class={selected(value, option.value) ? 'is-active' : ''}
          aria-pressed={selected(value, option.value)} onClick={() => screen.toggleField('result', option.value)}>{option.label}</button>)}</div>
      <select class="gi-tag-more-select" aria-label="More results" value=""
        onChange={event => { const option=event.currentTarget.value; if (option) screen.toggleField('result', option); }}>
        <option value="">{hiddenCount ? `More (${hiddenCount})` : 'More'}</option>
        {RESULT_MORE.map(option => <option key={option} value={option}>{selected(value, option) ? `Selected: ${option}` : option}</option>)}
      </select>
    </div>
    {selected(value, 'Fumble') && <Choice label="Fumble recovery" value={state.values.fumbleRecovery || 'unknown'}
      options={[[ 'subject', state.perspective === 'scout' ? 'Scouted team' : 'Our team' ],[ 'opponent', state.perspective === 'scout' ? 'Other team' : 'Opponent' ],['unknown','Unknown']]}
      choose={value => screen.setFumbleRecovery(value)}/>}
  </div>;
}

function Group({title, open=false, children}) {
  const [expanded,setExpanded] = useState(open);
  return <details class="gi-tag-group" open={expanded} onToggle={event => setExpanded(event.currentTarget.open)}>
    <summary><strong>{title}</strong><i aria-hidden="true">▾</i></summary>
    <div class="gi-tag-group-body">{children}</div>
  </details>;
}

function Choice({label, options, value, choose}) {
  return <div class="gi-tag-field" data-native-choice={label}><div class="gi-tag-field-label"><span>{label}</span></div>
    <div class="gi-tag-chips">{options.map(([key, text]) =>
      <button type="button" key={key} class={value === key ? 'is-active' : ''} aria-pressed={value === key}
        onClick={() => choose(key)}>{text}</button>)}</div>
  </div>;
}

function Penalties({screen, state}) {
  const situation = state.resultingSituation || {down:'',distance:'',fieldSide:'',yardLine:'',confirmed:false};
  return <Group title="Penalties" detail={state.penalties.length ? `${state.penalties.length} charted` : 'foul, enforcement, resulting situation'}>
    <button type="button" class="gi-tag-add" onClick={() => screen.addPenalty()}>Add penalty</button>
    {state.penalties.map((penalty, index) =>
      <article class="gi-penalty-card" key={penalty.id || index}>
        <header><strong>{penalty.foul || 'New penalty'}</strong>
          <button type="button" class="gi-is-risk" aria-label="Remove penalty" onClick={() => screen.removePenalty(index)}>Remove</button>
        </header>
        <Choice label="Charged to" value={penalty.team}
          options={[[ 'subject', state.perspective === 'scout' ? 'Scouted team' : 'Our team' ],[ 'opponent', state.perspective === 'scout' ? 'Other team' : 'Opponent' ],['unknown','Unknown']]}
          choose={value => screen.penaltyAction(index,'team',value)}/>
        <label class="gi-tag-input"><span>Foul</span><input value={penalty.foul} list="giPenaltyFouls"
          onChange={event => screen.penaltyInput(index,'foul',event.currentTarget.value)}/></label>
        <Choice label="Ruling" value={penalty.disposition}
          options={[['accepted','Accepted'],['declined','Declined'],['offsetting','Offsetting'],['unknown','Unknown']]}
          choose={value => screen.penaltyAction(index,'disposition',value)}/>
        <div class="gi-tag-grid">
          <label class="gi-tag-input"><span>Actual yards</span><input type="number" min="0" max="99" value={penalty.yards ?? ''}
            onChange={event => screen.penaltyInput(index,'yards',event.currentTarget.value)}/></label>
          <label class="gi-tag-input"><span>Player #</span><input type="number" min="0" max="99" value={penalty.player}
            onChange={event => screen.penaltyInput(index,'player',event.currentTarget.value)}/></label>
          <label class="gi-tag-input"><span>Phase</span><select value={penalty.phase}
            onChange={event => screen.penaltyInput(index,'phase',event.currentTarget.value)}>
            {['offense','defense','special','deadBall','unknown'].map(value => <option key={value} value={value}>{value === 'deadBall' ? 'Dead ball' : value}</option>)}
          </select></label>
        </div>
        <Choice label="Play status" value={penalty.playCounts === true ? 'true' : penalty.playCounts === false ? 'false' : 'unknown'}
          options={[['true','Play counts'],['false','No play'],['unknown','Unknown']]}
          choose={value => screen.penaltyAction(index,'playCounts',value)}/>
        <label class="gi-tag-input"><span>Enforcement notes</span><input value={penalty.notes}
          onChange={event => screen.penaltyInput(index,'notes',event.currentTarget.value)}/></label>
      </article>)}
    {state.penalties.length > 0 && <section class="gi-penalty-situation">
      <header><strong>Resulting situation</strong><span>Next snap</span></header>
      <div class="gi-tag-grid">
        <label class="gi-tag-input"><span>Down</span><select value={situation.down} onChange={e => screen.penaltySituation('down',e.currentTarget.value)}>
          <option value=""></option>{OPTIONS.down.map(value => <option key={value}>{value}</option>)}</select></label>
        <label class="gi-tag-input"><span>Distance</span><input type="number" min="1" max="99" value={situation.distance} onChange={e => screen.penaltySituation('distance',e.currentTarget.value)}/></label>
        <label class="gi-tag-input"><span>Side</span><select value={situation.fieldSide} onChange={e => screen.penaltySituation('fieldSide',e.currentTarget.value)}>
          <option value=""></option><option value="own">Own</option><option value="opp">Opp</option></select></label>
        <label class="gi-tag-input"><span>Yard line</span><input type="number" min="1" max="50" value={situation.yardLine} onChange={e => screen.penaltySituation('yardLine',e.currentTarget.value)}/></label>
      </div>
      <label class="gi-tag-check"><input type="checkbox" checked={situation.confirmed}
        onChange={e => screen.penaltySituation('confirmed','',e.currentTarget.checked)}/> Confirm for Auto D&amp;D</label>
    </section>}
  </Group>;
}

// Exported so the theater chyron (breakdown-theater-screen.js) can compose the
// live lower-third from these SAME canonical coach-facing labels instead of a
// second, independently-drifting copy of the vocabulary.
export const ST_UNITS = [['kickoff','Kickoff'],['kickoffReturn','Kick Return'],['punt','Punt'],['puntReturn','Punt Return'],['fieldGoal','Field Goal / XP'],['fieldGoalBlock','Field Goal Block'],['try','Try'],['tryDefense','Defending a Try']];
export const ST_OUTCOMES = {
  kickoff:[['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['outOfBounds','Out of Bounds'],['recovered','Recovered']],
  kickoffReturn:[['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['muffed','Muffed'],['outOfBounds','Out of Bounds']],
  punt:[['returned','Returned'],['fairCatch','Fair Catch'],['downed','Downed'],['outOfBounds','Out of Bounds'],['touchback','Touchback'],['blocked','Blocked'],['muffed','Muffed']],
  puntReturn:[['returned','Returned'],['fairCatch','Fair Catch'],['downed','Let Bounce'],['muffed','Muffed'],['outOfBounds','Out of Bounds']],
  fieldGoal:[['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
  fieldGoalBlock:[['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
};

function StMetric({label, code, value, screen, min, max, step='1'}) {
  return <label class="gi-tag-input"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value ?? ''}
    onChange={event => screen.specialInput(code,event.currentTarget.value)}/></label>;
}
function Spot({label, code, spot, screen}) {
  return <div class="gi-tag-field" data-native-choice={label}><div class="gi-tag-field-label"><span>{label}</span></div><div class="gi-tag-spot">
    <div class="gi-tag-chips">{[['own','Own'],['opp','Opp']].map(([value,text]) =>
      <button type="button" key={value} class={spot.fieldSide === value ? 'is-active' : ''} onClick={() => screen.specialAction('spot',`${code}:${value}`)}>{text}</button>)}</div>
    <input type="number" min="1" max="50" placeholder="Yard line" value={spot.yardLine || ''} onChange={event => screen.specialInput(`${code}-yard`,event.currentTarget.value)}/>
  </div></div>;
}

export const TRY_RESULT_LABELS = { converted: 'Converted', failed: 'Failed', noPlay: 'No Play / Retry' };

function TryEditor({screen, state, st}) {
  const subject = state.perspective === 'scout' ? 'Scouted team' : 'Our team';
  const other = state.perspective === 'scout' ? 'Other team' : 'Opponent';
  const incomplete = !st.attemptType || !st.result;
  const returnUnresolved = st.events.defensiveReturn && st.outcome.returnAward == null;
  const penaltyUnresolved = state.penalties.some(p => p.playCounts == null || p.disposition === 'unknown');
  const noPlayMismatch = state.penalties.some(p => p.playCounts === false) && st.result !== 'noPlay';
  return <>
    <Choice label="Attempt" value={st.attemptType} options={[['extraPoint','Kick XP'],['twoPoint','Two-Point']]} choose={v => screen.specialAction('tryAttempt',v)}/>
    <Choice label="Official result" value={st.result} options={Object.entries(TRY_RESULT_LABELS)} choose={v => screen.specialAction('tryResult',v)}/>
    <div class="gi-tag-field"><div class="gi-tag-field-label"><span>What happened</span><small>optional</small></div><div class="gi-tag-chips">
      {[['badSnap','Bad Snap'],['blocked','Blocked'],['defensiveReturn','Defensive Return']].map(([v,l]) =>
        <button type="button" key={v} class={st.events[v] ? 'is-active' : ''} onClick={() => screen.specialAction('tryEvent',v)}>{l}</button>)}
      {[['interception','Interception'],['fumble','Fumble']].map(([v,l]) =>
        <button type="button" key={v} class={st.events.turnover === v ? 'is-active' : ''} onClick={() => screen.specialAction('tryTurnover',v)}>{l}</button>)}
    </div></div>
    {st.result === 'converted' && !st.events.defensiveReturn && <Choice label="Points awarded" value={st.outcome.score}
      options={st.attemptType === 'extraPoint' ? [['extraPoint','1 Point'],['twoPoint','2 Points']] : [['twoPoint','2 Points']]}
      choose={v => screen.specialAction('score',v)}/>}
    {st.events.defensiveReturn && <Choice label="Official return ruling" value={st.outcome.returnAward}
      options={[['none','No Score'],['subject',`2 Points - ${subject}`],['opponent',`2 Points - ${other}`]]}
      choose={v => screen.specialAction('returnAward',v)}/>}
    {(incomplete || returnUnresolved || penaltyUnresolved || noPlayMismatch) && <div class="gi-tag-warning" role="status">
      {incomplete && <p>Choose the attempt and official result.</p>}
      {returnUnresolved && <p>Choose the official return ruling.</p>}
      {(penaltyUnresolved || noPlayMismatch) && <p>Resolve the penalty and use No Play / Retry when the snap does not count.</p>}
    </div>}
  </>;
}

function SpecialTeams({screen, state}) {
  const st = state.special;
  const isTry = st && (st.unit === 'try' || st.unit === 'tryDefense');
  const kickFields = st && ['kickoff','punt','fieldGoal','fieldGoalBlock'].includes(st.unit);
  const landingFields = st && ['kickoff','kickoffReturn','punt','puntReturn'].includes(st.unit);
  const returnFields = st && ['kickoff','kickoffReturn','punt','puntReturn','fieldGoalBlock'].includes(st.unit);
  const isKickAttempt = st && ['fieldGoal','fieldGoalBlock'].includes(st.unit);
  const scoreChoices = st?.unit === 'fieldGoal' ? [] : [['touchdown','Touchdown'],['safety','Safety']];
  const needsOwner = st && (st.outcome.score === 'safety' || st.outcome.scoredBy === 'unknown');
  const needsRecovery = st && (['recovered','muffed','blocked'].includes(st.outcome.status) || (st.outcome.score === 'touchdown' && ['kickoff','fieldGoalBlock'].includes(st.unit)));
  const subject = state.perspective === 'scout' ? 'Scouted team' : 'Our team';
  const other = state.perspective === 'scout' ? 'Other team' : 'Opponent';
  return <Group title="Special Teams" detail="phase, result, field position" open>
    {state.legacySpecial && <p class="gi-tag-warning">Legacy Special Teams details are uncharted.</p>}
    <Choice label="Unit" value={st?.unit} options={ST_UNITS} choose={value => screen.setSpecialUnit(value)}/>
    {isTry ? <TryEditor screen={screen} state={state} st={st}/> : st && <>
      {isKickAttempt && <Choice label="Attempt" value={st.attemptType} options={[['fieldGoal','Field Goal'],['extraPoint','Extra Point']]} choose={v => screen.specialAction('attempt',v)}/>}
      <Choice label="Outcome" value={st.outcome.status} options={ST_OUTCOMES[st.unit] || []} choose={v => screen.specialAction('status',v)}/>
      <div class="gi-tag-grid">
        {st.unit === 'kickoff' && <Choice label="Type" value={st.isOnside ? 'isOnside' : ''} options={[['isOnside','Onside']]} choose={() => screen.specialAction('toggle','isOnside')}/>}
        {['punt','fieldGoal','fieldGoalBlock'].includes(st.unit) && <Choice label="Type" value={st.isFake ? 'isFake' : ''} options={[['isFake','Fake']]} choose={() => screen.specialAction('toggle','isFake')}/>}
        {scoreChoices.length > 0 && <Choice label="Score" value={st.outcome.score} options={scoreChoices} choose={v => screen.specialAction('score',v)}/>}
      </div>
      {needsOwner && <Choice label="Credited to" value={st.outcome.scoredBy} options={[['subject',subject],['opponent',other]]} choose={v => screen.specialAction('owner',v)}/>}
      {needsRecovery && <Choice label="Possession" value={st.outcome.recoveredBy} options={[['subject',subject],['opponent',other],['unknown','Unknown']]} choose={v => screen.specialAction('recovery',v)}/>}
      <div class="gi-tag-grid">
        {kickFields && <><StMetric label="Kick distance" code="kick-distance" value={st.kick.distance} screen={screen} min="0" max="99"/>
          <StMetric label="Hang time" code="hang-time" value={st.kick.hangTime} screen={screen} min="0" max="9.9" step=".1"/></>}
        {landingFields && <Spot label="Possession spot" code="landing" spot={st.kick.landing} screen={screen}/>}
        {returnFields && <><StMetric label="Return yards" code="return-yards" value={st.return.yards} screen={screen} min="-99" max="109"/>
          <Spot label="End spot" code="end" spot={st.return.end} screen={screen}/></>}
        <StMetric label="Blocker #" code="blocker" value={st.players.blocker} screen={screen} min="0" max="99"/>
        <StMetric label="Recoverer #" code="recoverer" value={st.players.recoverer} screen={screen} min="0" max="99"/>
      </div>
    </>}
  </Group>;
}

function Players({screen, state}) {
  const roles = state.unit === 'special' ? ['kicker','returner'] : state.unit === 'defense' ? ['tackler','takeaway'] : ['ballCarrier','passer','receiver'];
  const allowed = role => state.roster.filter(player => role === 'kicker' || role === 'returner' || role === 'tackler' || role === 'takeaway'
    ? player.side !== 'O' : player.side !== 'D');
  // Player attribution is charted on nearly every snap — tacklers on defense,
  // ball carrier / passer / receiver on offense — so this group opens with the
  // form. Collapsed by default, tackle charting was effectively missing.
  const LABELS = { tackler: 'Tackler(s)', takeaway: 'Takeaway', ballCarrier: 'Ball Carrier',
    passer: 'Passer', receiver: 'Receiver', kicker: 'Kicker', returner: 'Returner' };
  return <Group title="Players & Grades" detail={state.unit === 'defense' ? 'tacklers and takeaways — separate multiple with a comma' : 'individual performance'} open>
    <div class="gi-tag-players">{roles.map(role => <div class={state.activeRole === role ? 'is-active' : ''} key={role}>
      <strong>{LABELS[role] || role.replace(/([A-Z])/g,' $1')}</strong>
      <input aria-label={`${role} player number`} value={state.players[role] || ''} onFocus={() => screen.setActiveRole(role)} onClick={() => screen.setActiveRole(role)}
        onChange={event => screen.setPlayer(role,event.currentTarget.value)}/>
      <select aria-label={`${role} grade`} value={state.grades[role] ?? ''} onChange={event => screen.setGrade(role,event.currentTarget.value)}>
        <option value="">Grade</option>{[-2,-1,0,1,2].map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
      </select>
      {allowed(role).length > 0 && <div class="gi-player-quick">{allowed(role).map(player =>
        <button type="button" key={player.num} class={selected(state.players[role]?.replace(/,\s*/g,' + '),String(player.num)) ? 'is-active' : ''}
          title={player.name ? `#${player.num} ${player.name}` : `#${player.num}`}
          onClick={() => { screen.setActiveRole(role); screen.quickPickPlayer(player.num); }}>{player.num}</button>)}</div>}
    </div>)}</div>
  </Group>;
}

function NativeTagging({screen}) {
  const [state,setState] = useState(() => screen.snapshot());
  const [customTag,setCustomTag] = useState('');
  useLayoutEffect(() => screen.subscribe(setState), [screen]);
  const chips = (field,label,options,hint,library) => <Chips screen={screen} field={field} label={label} options={options} value={state.values[field]} hint={hint} library={library}/>;
  return <section class={`gi-native-tagging${state.enabled ? '' : ' is-disabled'}`} data-native-tagging>
    <header class="gi-tag-context">
      <div class="gi-tag-title">
        <div class="gi-tag-play-identity"><span class="gi-eyebrow">Charting</span><h2>{state.currentPlayId == null ? 'SELECT PLAY' : `PLAY ${state.currentPlayId}`}</h2><p>{state.progress}</p></div>
      </div>
      {/* F2c — one click, not two. Unit is the single most-used control on this
          screen and a dropdown made every change a two-step. F2a's perspective
          control is gone entirely (it is derived from unit + whose film this
          is), and F2b's direction control moved to the bottom of the form,
          because it only serves play recognition. */}
      <div class="gi-unit-switch" role="group" aria-label="Charting unit" data-native-context="unit">
        {[['offense', 'Offense'], ['defense', 'Defense'], ['special', 'Special Teams']].map(([value, label]) =>
          <button key={value} type="button" data-unit={value} class={state.unit === value ? 'is-active' : ''}
            aria-pressed={state.unit === value} onClick={() => screen.setUnit(value)}>{label}</button>)}
      </div>
      {state.perspective === 'scout'
        ? <p class="gi-tag-subject">Opponent film — the charted team is the subject</p>
        : null}
    </header>
    <div class="gi-tag-actions">
      <button type="button" disabled={!state.canCopyPrevious} onClick={() => screen.copyPrevious()}>Same as Last</button>
      <select aria-label="Charting preset" value="" onChange={e => screen.applyChartingPreset(e.currentTarget.value)}>
        <option value="">Charting preset</option>{state.chartingPresets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}</select>
      <select value={state.selectedTemplate} onChange={e => screen.applyTemplate(e.currentTarget.value)}>
        <option value="">Templates</option>{state.templates.map(name => <option key={name}>{name}</option>)}</select>
      <button type="button" onClick={() => screen.saveTemplate()}>Save Template</button>
      <button type="button" class="gi-is-risk" disabled={!state.selectedTemplate} onClick={() => screen.deleteTemplate(state.selectedTemplate)}>Delete</button>
    </div>
    {!state.enabled ? <div class="gi-tag-empty">Select or mark a play to begin charting.</div> : <main class="gi-native-form">
      <datalist id="giPenaltyFouls">{['False Start','Holding','Illegal Formation','Illegal Motion','Delay of Game','Offside','Encroachment','Defensive Pass Interference','Facemask','Personal Foul','Unsportsmanlike','Block in the Back','Roughing the Kicker'].map(v => <option key={v}>{v}</option>)}</datalist>
      <Group title="Situation" detail="quarter, down, distance, field position" open>
        <div class="gi-tag-situation-row is-primary" data-situation-row="primary">
          {chips('quarter','Quarter',OPTIONS.quarter)}{chips('down','Down',OPTIONS.down)}
          <Field screen={screen} field="distance" label="Distance" value={state.values.distance} min="1" max="99"/>
        </div>
        <div class="gi-tag-situation-row is-field" data-situation-row="field">
          {chips('hash','Hash',OPTIONS.hash)}
          {chips('fieldSide','Field position',[{value:'own',label:'Own'},{value:'opp',label:'Opp'}])}
          <Field screen={screen} field="yardLine" label="Yard line" value={state.values.yardLine} min="1" max="50"/>
        </div>
      </Group>
      {state.unit === 'special' ? <SpecialTeams screen={screen} state={state}/> : (() => {
        // Charting defense, OUR call comes first and the offense we faced
        // second. The group a coach is actually charting leads.
        const offense = <Group key="off" title={state.unit === 'defense' ? 'Offense Faced' : state.perspective === 'scout' ? 'Opponent Offensive Look' : 'Our Offensive Look'} detail="formation, alignment, personnel" open={state.unit !== 'defense'}>
          <PlayCallField screen={screen} state={state}/>
          {chips('formation','Formation',state.libraries.formation,'select all','formation')}
          {chips('qbAlignment','QB Alignment',OPTIONS.qbAlignment,'optional')}
          {chips('backfield','Backfield',state.libraries.backfield,'optional','backfield')}
          {chips('strength','Strength',OPTIONS.strength)}{chips('personnel','Personnel',OPTIONS.personnel)}{chips('motion','Motion',OPTIONS.motion)}
        </Group>;
        const defense = <Group key="def" title={state.unit === 'defense' ? (state.perspective === 'scout' ? 'Opponent Defensive Call' : 'Our Defensive Call') : 'Defense Faced'} detail="front, coverage, pressure" open={state.unit === 'defense'}>
          {chips('defFront','Front',state.libraries.defFront,'select all','front')}{chips('coverage','Coverage Call',state.libraries.coverage,'','coverage')}
          {chips('coverageFamily','Coverage Family',OPTIONS.coverageFamily,'optional')}{chips('blitz','Blitz',state.libraries.blitz,'','blitz')}
        </Group>;
        const playResult = <Group key="pr" title="Play &amp; Result" detail="call, direction, outcome" open>
          {chips('runPass','Run / Pass',OPTIONS.runPass)}{chips('playType','Play Type',state.libraries.playType,'','playType')}
          {chips('playDir','Direction',OPTIONS.playDir)}<ResultField screen={screen} state={state}/>
          <Field screen={screen} field="yardage" label="Yards" value={state.values.yardage} min="0" max="109"/>
        </Group>;
        return <>{state.unit === 'defense' ? [defense, offense, playResult] : [offense, defense, playResult]}</>;
      })()}
      <Penalties screen={screen} state={state}/>
      <Players screen={screen} state={state}/>
      <Group title="Notes & Details" detail="staff notes and situation">
        <label class="gi-tag-input"><span>Play notes</span><textarea value={state.notes} onInput={e => screen.setNotes(e.currentTarget.value)}/></label>
        <button type="button" onClick={() => screen.addNoteTimestamp()}>Add video time</button>
        <div class="gi-tag-grid gi-tag-drive-row">
          <Field screen={screen} field="driveNumber" label="Drive" value={state.values.driveNumber} min="1" max="30"/>
          <button type="button" onClick={() => screen.newDrive()}>New Drive</button>
        </div>
        {state.customFields.map(def => def.options?.length
          ? <Chips key={def.id} screen={{setField:(_,v) => screen.setCustomField(def.id,v)}} field={def.id} label={def.name} options={def.options} value={def.value}/>
          : <label key={def.id} class="gi-tag-input"><span>{def.name}</span><input value={def.value} onChange={e => screen.setCustomField(def.id,e.currentTarget.value)}/></label>)}
        <div class="gi-tag-custom">{state.customTags.map((value,index) => <button type="button" key={`${value}-${index}`} onClick={() => screen.removeCustomTag(index)}>{value} ×</button>)}
          <input value={customTag} placeholder="Custom tag" onInput={e => setCustomTag(e.currentTarget.value)} onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); screen.addCustomTag(customTag); setCustomTag(''); }}}/></div>
        <button type="button" onClick={() => screen.openCustomFields()}>Edit custom fields</button>
      </Group>
      <div class="gi-tag-toggles">
        <label class="gi-tag-check"><input type="checkbox" checked={state.autoDD} onChange={e => screen.setAutoDD(e.currentTarget.checked)}/> Auto down &amp; distance</label>
        <label class="gi-tag-check"><input type="checkbox" checked={state.carryScheme} onChange={e => screen.setCarryScheme(e.currentTarget.checked)}/> Carry formation to next play</label>
      </div>
      <Group title="Play Diagram" detail="saved with this play">
        <div class="gi-tag-actions"><button type="button" onClick={() => screen.clearDiagram()}>Clear</button><button type="button" onClick={() => screen.drawDiagram()}>Draw</button></div>
        {state.diagram && <img src={state.diagram} alt="Current play diagram"/>}
      </Group>
      <Group title="More Tools" detail="scoreboard OCR and play detection">
        <div class="gi-tag-actions"><button type="button" onClick={() => screen.setScoreboardRegion()}>Set OCR Region</button>
          <button type="button" onClick={() => screen.readScoreboard()}>Read Scoreboard</button>
          <label class="gi-tag-check"><input type="checkbox" checked={state.autoOcr} onChange={e => screen.setAutoOcr(e.currentTarget.checked)}/> Auto OCR</label>
          <button type="button" onClick={() => screen.runAutoDetect()}>Auto-detect plays</button>
        </div>
        {/* F2b — Offense direction lives HERE, with the only features that read
            it. Its three consumers are the heuristic auto-tagger, the optional
            CV server and the Vision prompt; no report, analytic, export or
            stored play field reads it, and unset is inert in all three. It is
            kept for when play recognition is worth using, and kept out of the
            charting path until then. */}
        <label class="gi-tag-input"><span>Offense direction</span>
          <select data-native-context="direction" value={state.direction} onChange={e => screen.setDirection(e.currentTarget.value)}>
            <option value="">Not set</option><option value="right">Left to right</option><option value="left">Right to left</option>
          </select></label>
        <p class="gi-tag-hint">Only used by play detection. Leave unset unless you are running auto-detect.</p>
      </Group>
      <footer class="gi-tag-nav"><button type="button" disabled={!state.canPrevious} onClick={() => screen.previous()}>Previous</button>
        <button type="button" class={`is-primary${state.saveConfirmed ? ' is-confirmed' : ''}`} aria-live="polite" onClick={() => screen.saveNext()}>{state.saveConfirmed ? 'Saved' : 'Save & Next'}</button>
        <button type="button" onClick={() => screen.skip()}>Skip</button></footer>
    </main>}
  </section>;
}

export function mountNativeTagging({host,screen}) {
  if (!host || !screen) throw new Error('Native tagging requires a host and controller.');
  render(<NativeTagging screen={screen}/>,host);
  return { unmount(){ render(null,host); } };
}
