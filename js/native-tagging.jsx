import { render } from 'preact';
import { useLayoutEffect, useRef, useState } from 'preact/hooks';
import { TagLibrary } from './tag-library.js';
import { SpecialTeamsModel } from './special-teams.js';
import { ChartingDetails } from './charting-details.js';
import '../css/native-tagging.css';

// Final Engine Independence: PlayGrid's inline Film Room editor (play-grid.js)
// used to read its option lists straight off the legacy .tag-section chip
// DOM (`document.querySelectorAll('#tagFormation .pick')` etc.) -- now
// deleted. OPTIONS is exported so it stays the single source of a fixed
// vocabulary field's values, consumed by both the tag form and the grid
// editor, instead of two copies drifting apart.
/** The three charting units and their labels: Chart's switch and the Film Room
 *  play card's selector render this one list. */
export const UNIT_CHOICES = [['offense', 'Offense'], ['defense', 'Defense'], ['special', 'Special Teams']];

export const OPTIONS = {
  down:['1','2','3','4'], qbAlignment:['Under Center','Pistol','Shotgun'],
  strength:ChartingDetails.LINE_STRENGTHS.slice(), personnel:['00','01','02','10','11','12','13','20','21','22','23','30','31','32','Jumbo','Goal Line'],
  motion:['Jet','Orbit','Shift','Trade'], runPass:['Run','Pass'],
  // Play type is LIBRARY-managed, so its vocabulary has one owner
  // (TagLibrary.DEFINITIONS). This entry is the fallback PlayGrid's inline Film
  // Room editor uses when no library is wired; carrying its own copy is how a
  // new built-in could reach the deck and never reach the grid.
  playType:TagLibrary.DEFINITIONS.playType.slice(),
  playDir:['Left','Middle','Right'],
  coverage:['Cover 0','Cover 1','Cover 2','Cover 3','Cover 4','Cover 5','Cover 6'],
  coverageFamily:['Man','Zone','Match'], blitz:['A-Gap','B-Gap','C-Gap','Edge','DB Blitz','Zone Blitz'],
  hash:['Left','Middle','Right'], quarter:['Q1','Q2','Q3','Q4','OT'],
  // Owned by ChartingDetails, the one home of the run and motion detail vocabularies.
  receiverSet:ChartingDetails.RECEIVER_SETS.slice(), gap:ChartingDetails.GAPS.slice(),
  motionStart:ChartingDetails.PATH_POINTS.slice(), motionEnd:ChartingDetails.PATH_POINTS.slice(),
  rpoRead:ChartingDetails.RPO_READS.slice(), rpoDecision:ChartingDetails.RPO_DECISIONS.slice(), qbRun:ChartingDetails.QB_RUNS.slice(),
};
const MULTI = new Set(['playType','result','defFront','blitz']);
const typeSelected = (value, type) => String(value || '').split(' + ').includes(type);
const selected = (value, option) => String(value || '').split(' + ').includes(option);

/* A collapsible field's label is its disclosure control. Folded, the field
   keeps its header and states what is selected, so a coach never has to open a
   long list to read the current call. */
function FieldLabel({screen, field, label, hint, collapsible, collapsed, summary, children}) {
  if (!collapsible) return <div class="gi-tag-field-label"><span>{label}</span>{hint && <small>{hint}</small>}{children}</div>;
  return <div class="gi-tag-field-label">
    <button type="button" class="gi-tag-field-toggle" aria-expanded={!collapsed} aria-controls={`giTagField-${field}`}
      onClick={() => screen.toggleFieldCollapsed(field)}><i aria-hidden="true">▾</i><span>{label}</span></button>
    {collapsed ? <small class="gi-tag-field-summary" data-field-summary={field}>{summary || 'None'}</small> : hint && <small>{hint}</small>}
    {children}
  </div>;
}

function Chips({screen, field, label, options, value, hint, library, collapsible = false, collapsed = false}) {
  const choices = options.map(option => typeof option === 'string' ? { value: option, label: option } : option);
  // A stored value the library does not offer (a hidden or removed custom choice)
  // is still shown, selected, at the end of the list.
  if (library) for (const item of String(value || '').split(' + ').filter(Boolean)) {
    if (!choices.some(option => option.value === item)) choices.push({ value: item, label: item, offLibrary: true });
  }
  const summary = String(value || '').split(' + ').filter(Boolean).map(item => choices.find(option => option.value === item)?.label || item).join(' + ');
  return <div class={`gi-tag-field gi-tag-field-${field}${collapsed ? ' is-collapsed' : ''}`} data-native-field={field} data-library-align={library ? '' : undefined}>
    <FieldLabel screen={screen} field={field} label={label} hint={hint} collapsible={collapsible} collapsed={collapsed} summary={summary}>
      {library && <button type="button" class="gi-tag-library" onClick={() => screen.openLibrary(library)}>Edit library</button>}
    </FieldLabel>
    {!collapsed && <div class={`gi-tag-chips${library ? ' is-library' : ''}`} id={collapsible ? `giTagField-${field}` : undefined}>{choices.map(option =>
      <button type="button" key={option.value} class={`${selected(value, option.value) ? 'is-active' : ''}${option.offLibrary ? ' is-off-library' : ''}`.trim()}
        aria-pressed={selected(value, option.value)} title={option.label}
        onClick={() => MULTI.has(field) ? screen.toggleField(field, option.value) : screen.setField(field, selected(value, option.value) ? '' : option.value)}>
        {option.label}
      </button>)}
    </div>}
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
  runPass:'Run / Pass', playType:'Play Type', playDir:'Direction', formationFamily:'Formation', receiverSet:'Receiver Alignment',
  qbAlignment:'QB Alignment', backfield:'Backfield', strength:'Offensive Line Strength',
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
  // A call that would clear charted details asks first; declining puts the field back.
  const pick = (name, shown = name) => {
    setDraft(shown);
    const outcome = screen.selectPlayCall(name);
    if (outcome && typeof outcome.then === 'function') outcome.then(ok => { if (!ok) setDraft(value); });
    return outcome;
  };
  const commit = candidate => pick(candidate ?? draft);
  const collapsed = !!state.collapsed?.playCall;
  const label = state.unit === 'offense' && state.perspective !== 'scout' ? 'Play Call' : 'Opponent Play';
  return <section class={`gi-play-call${collapsed ? ' is-collapsed' : ''}`} data-native-play-call data-library-align="">
    <FieldLabel screen={screen} field="playCall" label={label} collapsible collapsed={collapsed} summary={value}
      hint={state.values.playConcept ? `Concept: ${state.values.playConcept}` : ''}>
      <button type="button" class="gi-tag-library gi-play-call-library" onClick={() => screen.editPlayCallLibrary()}>Edit library</button>
    </FieldLabel>
    {!collapsed && <div class="gi-play-call-body" id="giTagField-playCall">
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
          onClick={() => pick('')}>Clear</button>}
      </div>}
    </div>
    {quick.length > 0 && <div class="gi-play-call-quick" aria-label="Favorite and recent play calls">
      {quick.slice(0,6).map(item => <button type="button" key={item.name} class={item.name === value ? 'is-active' : ''}
        onClick={() => pick(item.name)}>{item.favorite ? '★ ' : ''}{item.name}</button>)}
    </div>}
    {applied.length > 0 && <div class="gi-play-call-defaults" aria-label="Defaults applied by this call">
      <span>Applied:</span>{applied.map(([key,fieldValue]) => <em key={key}>{CALL_DEFAULT_LABELS[key] || key}: {fieldValue}</em>)}
    </div>}
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

/** Gap sits directly under Play Direction and is independent of it (S107-4):
 *  the ten choices always show in one row (ChartingDetails.GAPS). */
function GapField({screen, state}) {
  const gap = state.values.gap || '';
  return <div class="gi-tag-field" data-native-field="gap">
    <div class="gi-tag-field-label"><span>Gap</span></div>
    <div class="gi-tag-chips gi-tag-gap-row">{ChartingDetails.GAPS.map(option =>
      <button type="button" key={option} class={gap === option ? 'is-active' : ''} aria-pressed={gap === option}
        onClick={() => screen.setField('gap', gap === option ? '' : option)}>{option}</button>)}</div>
  </div>;
}

/** The RPO decision read against Run/Pass: Give and Keep are runs, Throw a pass.
 *  A disagreement is shown with the one-tap correction; nothing is overwritten. */
function RpoConflict({screen, state}) {
  const expected = ChartingDetails.rpoDecisionRunPass(state.values.rpoDecision);
  const current = state.values.runPass;
  if (!expected || !current || current === expected) return null;
  return <div class="gi-tag-warning" role="status" data-rpo-conflict>
    <p>{state.values.rpoDecision} is a {expected === 'Run' ? 'run' : 'pass'}; Run / Pass is {current}.</p>
    <button type="button" onClick={() => screen.setField('runPass', expected)}>Set {expected}</button>
  </div>;
}

function Group({title, open=false, syncOpen=false, children}) {
  const [expanded,setExpanded] = useState(open);
  // Offense/Defense/Special Teams groups pass syncOpen: their `open` prop is
  // a function of the active unit, not a one-time default. useState only
  // reads its argument on mount, so a coach who mounted the form on Defense
  // then clicked back to Offense saw the Offense group stay collapsed --
  // the primary group for the unit they were actually charting. Re-syncing
  // whenever `open` itself changes (i.e. the unit changed) fixes that while
  // still letting a manual toggle stick within one unit's session.
  useLayoutEffect(() => { if (syncOpen) setExpanded(open); }, [open, syncOpen]);
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
  return <Group title="Penalties">
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
  </Group>;
}

// Exported so the theater chyron (breakdown-theater-screen.js) can compose the
// live lower-third from these SAME canonical coach-facing labels instead of a
// second, independently-drifting copy of the vocabulary.
/* The unit selector reads `SpecialTeamsModel`, the one owner of the coach-facing
   unit names, so the deck, the chyron, the grid, Study and Reports cannot drift
   apart on a rename. */
export const ST_UNITS = SpecialTeamsModel.unitOptions();
export const ST_OUTCOMES = {
  kickoff:[['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['outOfBounds','Out of Bounds'],['recovered','Recovered']],
  kickoffReturn:[['returned','Returned'],['touchback','Touchback'],['fairCatch','Fair Catch'],['muffed','Muffed'],['outOfBounds','Out of Bounds']],
  punt:[['returned','Returned'],['fairCatch','Fair Catch'],['downed','Downed'],['outOfBounds','Out of Bounds'],['touchback','Touchback'],['blocked','Blocked'],['muffed','Muffed']],
  /* `blocked` belongs to the RETURN unit as well as the kicking unit: the team
     fielding a punt is the team that blocks one, and a block it recovers is its
     own possession and possibly its own touchdown. The stored unit stays
     `puntReturn`; `Possession` and `Score` then carry ownership, which is why no
     `puntBlock` unit and no schema migration are needed. */
  puntReturn:[['returned','Returned'],['fairCatch','Fair Catch'],['downed','Let Bounce'],['muffed','Muffed'],['outOfBounds','Out of Bounds'],['blocked','Blocked']],
  fieldGoal:[['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
  fieldGoalBlock:[['good','Good'],['noGood','No Good'],['blocked','Blocked'],['badSnap','Bad Snap']],
};

function StMetric({label, code, value, screen, min, max, step='1'}) {
  return <label class="gi-tag-input"><span>{label}</span><input type="number" min={min} max={max} step={step} value={value ?? ''}
    onChange={event => screen.specialInput(code,event.currentTarget.value)}/></label>;
}
function Spot({label, code, spot, screen}) {
  return <div class="gi-tag-field gi-tag-spot-field" data-native-choice={label}><div class="gi-tag-field-label"><span>{label}</span><span>Yard line</span></div><div class="gi-tag-spot">
    <div class="gi-tag-chips">{[['own','Own'],['opp','Opp']].map(([value,text]) =>
      <button type="button" key={value} class={spot.fieldSide === value ? 'is-active' : ''} onClick={() => screen.specialAction('spot',`${code}:${value}`)}>{text}</button>)}</div>
    <input type="number" min="1" max="50" aria-label={`${label} yard line`} value={spot.yardLine || ''} onChange={event => screen.specialInput(`${code}-yard`,event.currentTarget.value)}/>
  </div></div>;
}

export const TRY_RESULT_LABELS = { converted: 'Converted', failed: 'Failed', noPlay: 'No Play / Retry' };

/** A try charted as Run/Pass or Fake charts its look and result like a scrimmage
 *  snap (SpecialTeamsModel.isRunPassTry); Kick XP does not. */
const runPassTry = st => !!st && (st.unit === 'try' || st.unit === 'tryDefense') && st.attemptType === 'twoPoint';
/** The side whose look groups a play shows: its unit, or for a run/pass try the
 *  attempting (Try) or defending (Defending a Try) side. */
const lookSide = state => state.unit !== 'special' ? state.unit
  : runPassTry(state.special) ? (state.special.unit === 'tryDefense' ? 'defense' : 'offense') : null;

function TryEditor({screen, state, st}) {
  const subject = state.perspective === 'scout' ? 'Scouted team' : 'Our team';
  const other = state.perspective === 'scout' ? 'Other team' : 'Opponent';
  const incomplete = !st.attemptType || !st.result;
  const returnUnresolved = st.events.defensiveReturn && st.outcome.returnAward == null;
  const penaltyUnresolved = state.penalties.some(p => p.playCounts == null || p.disposition === 'unknown');
  const noPlayMismatch = state.penalties.some(p => p.playCounts === false) && st.result !== 'noPlay';
  return <>
    <Choice label="Attempt" value={st.attemptType === 'twoPoint' && st.isFake ? 'fake' : st.attemptType}
      options={[['extraPoint','Kick XP'],['twoPoint','Run/Pass'],['fake','Fake']]} choose={v => screen.specialAction('tryAttempt',v)}/>
    <Choice label="Official result" value={st.result} options={Object.entries(TRY_RESULT_LABELS)} choose={v => screen.specialAction('tryResult',v)}/>
    <div class="gi-tag-field"><div class="gi-tag-field-label"><span>What happened</span></div><div class="gi-tag-chips">
      {[['badSnap','Bad Snap'],['blocked','Blocked'],['defensiveReturn','Defensive Return']].map(([v,l]) =>
        <button type="button" key={v} class={st.events[v] ? 'is-active' : ''} onClick={() => screen.specialAction('tryEvent',v)}>{l}</button>)}
      {[['interception','Interception'],['fumble','Fumble']].map(([v,l]) =>
        <button type="button" key={v} class={st.events.turnover === v ? 'is-active' : ''} onClick={() => screen.specialAction('tryTurnover',v)}>{l}</button>)}
    </div></div>
    {st.result === 'converted' && !st.events.defensiveReturn && <Choice label="Points awarded" value={st.outcome.score}
      options={[['extraPoint','1 Point'],['twoPoint','2 Points']]}
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
  const scoreChoices = st?.unit === 'fieldGoal' ? [] : [['touchdown','Touchdown'],['safety','Safety']];
  const needsOwner = st && (st.outcome.score === 'safety' || st.outcome.scoredBy === 'unknown');
  const needsRecovery = st && (['recovered','muffed','blocked'].includes(st.outcome.status) || (st.outcome.score === 'touchdown' && ['kickoff','fieldGoalBlock'].includes(st.unit)));
  const subject = state.perspective === 'scout' ? 'Scouted team' : 'Our team';
  const other = state.perspective === 'scout' ? 'Other team' : 'Opponent';
  return <Group title="Special Teams" open>
    <Choice label="Unit" value={st?.unit} options={ST_UNITS} choose={value => screen.setSpecialUnit(value)}/>
    {isTry ? <TryEditor screen={screen} state={state} st={st}/> : st && <>
      {/* No Attempt selector. The field-goal units attempt a field goal, and
          nothing here can author an extra point: `unit:'fieldGoal'` is always
          the subject attempting, so an opponent XP charted through it scored
          for us. XP and two-point tries are charted under Try / Defending a
          Try, which encode the attempting side. */}
      <Choice label="Outcome" value={st.outcome.status} options={ST_OUTCOMES[st.unit] || []} choose={v => screen.specialAction('status',v)}/>
      <div class="gi-tag-grid">
        {st.unit === 'kickoff' && <Choice label="Type" value={st.isOnside ? 'isOnside' : ''} options={[['isOnside','Onside']]} choose={() => screen.specialAction('toggle','isOnside')}/>}
        {['punt','fieldGoal','fieldGoalBlock'].includes(st.unit) && <Choice label="Type" value={st.isFake ? 'isFake' : ''} options={[['isFake','Fake']]} choose={() => screen.specialAction('toggle','isFake')}/>}
        {scoreChoices.length > 0 && <Choice label="Score" value={st.outcome.score} options={scoreChoices} choose={v => screen.specialAction('score',v)}/>}
      </div>
      {needsOwner && <Choice label="Credited to" value={st.outcome.scoredBy} options={[['subject',subject],['opponent',other]]} choose={v => screen.specialAction('owner',v)}/>}
      {needsRecovery && <Choice label="Possession" value={st.outcome.recoveredBy} options={[['subject',subject],['opponent',other],['unknown','Unknown']]} choose={v => screen.specialAction('recovery',v)}/>}
      <div class="gi-tag-grid gi-tag-special-metrics">
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
  // A kicked try has no returner: Try (Kick) is the kicker; Defending a Try (Kick)
  // is the blocker. A run/pass or Fake try takes its side's roles.
  const st = state.special, side = lookSide(state);
  const roles = side === 'defense' ? ['tackler','takeaway'] : side === 'offense' ? ['ballCarrier','passer','receiver']
    : st?.unit === 'try' ? ['kicker'] : st?.unit === 'tryDefense' ? ['blocker'] : ['kicker','returner'];
  const opposingSpecialist = role => !side && st && (
    (role === 'kicker' && ['receiving','defending'].includes(SpecialTeamsModel.ROLES[st.unit]))
    || (role === 'returner' && ['kicking','attempting'].includes(SpecialTeamsModel.ROLES[st.unit])));
  const defaultRole = roles.find(role => !opposingSpecialist(role)) || roles[0];
  const [openRoles,setOpenRoles] = useState(() => new Set([roles.includes(state.activeRole) && !opposingSpecialist(state.activeRole) ? state.activeRole : defaultRole]));
  const openRole = role => setOpenRoles(current => new Set([...current, role]));
  useLayoutEffect(() => {
    setOpenRoles(new Set([defaultRole]));
    if (!roles.includes(state.activeRole) || opposingSpecialist(state.activeRole)) screen.setActiveRole(defaultRole);
  }, [roles.join(','), st?.unit]);
  const allowed = role => opposingSpecialist(role) ? [] : state.roster.filter(player => role === 'kicker' || role === 'returner' || role === 'blocker' || role === 'tackler' || role === 'takeaway'
    ? player.side !== 'O' : player.side !== 'D');
  // Player attribution is charted on nearly every snap — tacklers on defense,
  // ball carrier / passer / receiver on offense — so this group opens with the
  // form. The focused role owns the only open roster picker, matching the comp
  // without hiding one-click jersey-number attribution.
  const LABELS = { tackler: 'Tackler(s)', takeaway: 'Takeaway', ballCarrier: 'Ball Carrier',
    passer: 'Passer', receiver: 'Receiver', kicker: 'Kicker', returner: 'Returner', blocker: 'Blocker' };
  return <Group title="Players & Grades" open>
    <div class="gi-tag-players">{roles.map(role => {
      const rosterOpen = openRoles.has(role) && allowed(role).length > 0;
      return <div class={state.activeRole === role ? 'is-active' : ''} key={role}>
        <strong>{opposingSpecialist(role) ? 'Opponent ' : ''}{LABELS[role] || role.replace(/([A-Z])/g,' $1')}</strong>
        <input aria-label={`${role} player number`} value={state.players[role] || ''} onFocus={() => { screen.setActiveRole(role); openRole(role); }} onClick={() => { screen.setActiveRole(role); openRole(role); }}
          onChange={event => screen.setPlayer(role,event.currentTarget.value)}/>
        <select aria-label={`${role} grade`} value={state.grades[role] ?? ''} onFocus={() => { screen.setActiveRole(role); openRole(role); }} onChange={event => screen.setGrade(role,event.currentTarget.value)}>
          <option value="">Grade</option>{[-2,-1,0,1,2].map(value => <option key={value} value={value}>{value > 0 ? `+${value}` : value}</option>)}
        </select>
        {allowed(role).length > 0 && <button type="button" class="gi-player-roster-toggle" aria-expanded={rosterOpen}
          onClick={() => { screen.setActiveRole(role); setOpenRoles(current => { const next = new Set(current); if (rosterOpen) next.delete(role); else next.add(role); return next; }); }}>
          <span aria-hidden="true">{rosterOpen ? '▾' : '▸'}</span>{rosterOpen ? 'Hide roster' : 'Show roster'}
        </button>}
        {rosterOpen && <div class="gi-player-quick">{allowed(role).map(player =>
          <button type="button" key={player.num} class={selected(state.players[role]?.replace(/,\s*/g,' + '),String(player.num)) ? 'is-active' : ''}
            title={player.name ? `#${player.num} ${player.name}` : `#${player.num}`}
            onClick={() => { screen.setActiveRole(role); screen.quickPickPlayer(player.num); }}>{player.num}</button>)}</div>}
      </div>})}</div>
  </Group>;
}

export function NativeTagging({screen}) {
  const [state,setState] = useState(() => screen.snapshot());
  const [customTag,setCustomTag] = useState('');
  const root = useRef(null);
  useLayoutEffect(() => screen.subscribe(setState), [screen]);
  useLayoutEffect(() => {
    const host = root.current.parentElement;
    screen.attachHost(host);
    return () => screen.detachHost(host);
  }, [screen]);
  const chips = (field,label,options,hint,library) => <Chips screen={screen} field={field} label={label} options={options} value={state.values[field]} hint={hint} library={library}/>;
  const playTypeValue = state.values.playType;
  return <section class={`gi-native-tagging${state.enabled ? '' : ' is-disabled'}`} data-native-tagging ref={root}>
    <header class="gi-tag-context">
      <div class="gi-tag-title">
        <div class="gi-tag-play-identity"><h2>{state.currentPlayId == null ? 'Select play' : `Play ${state.currentPlayId}`}</h2><p>{state.progress}</p></div>
      </div>
      {/* F2c — one click, not two. Unit is the single most-used control on this
          screen and a dropdown made every change a two-step. F2a's perspective
          control is gone entirely (it is derived from unit + whose film this
          is), and F2b's direction control moved to the bottom of the form,
          because it only serves play recognition. */}
      <div class="gi-unit-switch" role="group" aria-label="Charting unit" data-native-context="unit">
        {UNIT_CHOICES.map(([value, label]) =>
          <button key={value} type="button" data-unit={value} class={state.unit === value ? 'is-active' : ''}
            aria-pressed={state.unit === value} onClick={() => screen.setUnit(value)}>{label}</button>)}
      </div>
      {state.perspective === 'scout'
        ? <p class="gi-tag-subject">Opponent film — the charted team is the subject</p>
        : null}
    </header>
    <div class="gi-tag-actions">
      <button type="button" disabled={!state.canCopyPrevious} onClick={() => screen.copyPrevious()}>Same as Last</button>

      <select value={state.selectedTemplate} onChange={e => screen.applyTemplate(e.currentTarget.value)}>
        <option value="">Templates</option>{state.templates.map(name => <option key={name}>{name}</option>)}</select>
      <button type="button" onClick={() => screen.saveTemplate()}>Save Template</button>
      <button type="button" class="gi-is-risk" disabled={!state.selectedTemplate} onClick={() => screen.deleteTemplate(state.selectedTemplate)}>Delete</button>
    </div>
    {!state.enabled ? <div class="gi-tag-empty">Select or mark a play to begin charting.</div> : <main class="gi-native-form">
      <datalist id="giPenaltyFouls">{['False Start','Holding','Illegal Formation','Illegal Motion','Delay of Game','Offside','Encroachment','Defensive Pass Interference','Facemask','Personal Foul','Unsportsmanlike','Block in the Back','Roughing the Kicker'].map(v => <option key={v}>{v}</option>)}</datalist>
      <Group title="Situation" open>
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
      {state.unit === 'special' && <SpecialTeams screen={screen} state={state}/>}
      {lookSide(state) && (() => {
        // Charting defense, OUR call comes first and the offense we faced
        // second. The group a coach is actually charting leads. A run/pass or
        // Fake try shows the attempting or defending side's groups.
        const side = lookSide(state);
        const offense = <Group key="off" title={side === 'defense' ? 'Offense Faced' : state.perspective === 'scout' ? 'Opponent Formation & Call' : 'Formation & Call'} open={side !== 'defense'} syncOpen>
          <PlayCallField screen={screen} state={{ ...state, unit: side }}/>
          {chips('formationFamily','Formation',state.libraries.formationFamily,'','formationFamily')}
          {chips('personnel','Personnel',OPTIONS.personnel)}
          {chips('qbAlignment','QB Alignment',OPTIONS.qbAlignment)}
          {chips('backfield','Backfield',state.libraries.backfield,'','backfield')}
          {chips('strength','Offensive Line Strength',OPTIONS.strength)}
          {chips('receiverSet','Receiver Alignment',OPTIONS.receiverSet)}
          {chips('motion','Motion',OPTIONS.motion)}
          {state.values.motion && <div class="gi-tag-detail gi-tag-pair" data-native-detail="motion">
            {chips('motionStart','Starts',OPTIONS.motionStart)}{chips('motionEnd','Ends',OPTIONS.motionEnd)}
          </div>}
        </Group>;
        const defense = <Group key="def" title={side === 'defense' ? (state.perspective === 'scout' ? 'Opponent Defensive Call' : 'Our Defensive Call') : 'Defense Faced'} open={side === 'defense'} syncOpen>
          {chips('defFront','Front',state.libraries.defFront,'','front')}{chips('coverage','Coverage Call',state.libraries.coverage,'','coverage')}
          {chips('coverageFamily','Coverage Family',OPTIONS.coverageFamily)}{chips('blitz','Blitz',state.libraries.blitz,'','blitz')}
        </Group>;
        const playResult = <Group key="pr" title="Play &amp; Result" open>
          {chips('runPass','Run / Pass',OPTIONS.runPass)}<Chips screen={screen} field="playType" label="Play Type" options={state.libraries.playType} value={playTypeValue} library="playType" collapsible collapsed={!!state.collapsed?.playType}/>
          {typeSelected(playTypeValue,'RPO') && <div class="gi-tag-detail" data-native-detail="rpo">
            {chips('rpoRead','Read defender',OPTIONS.rpoRead)}
            <Field screen={screen} field="rpoDefender" label="Defender #" value={state.values.rpoDefender} min="0" max="99" placeholder="Jersey number"/>
            {chips('rpoDecision','Decision',OPTIONS.rpoDecision)}
            <RpoConflict screen={screen} state={state}/>
          </div>}
          {typeSelected(playTypeValue,'QB Run') && <div class="gi-tag-detail" data-native-detail="qbRun">
            {chips('qbRun','QB run type',OPTIONS.qbRun)}
          </div>}
          {chips('playDir','Play Direction',OPTIONS.playDir)}<GapField screen={screen} state={state}/><ResultField screen={screen} state={state}/>
          <Field screen={screen} field="yardage" label="Yards" value={state.values.yardage} min="0" max="109"/>
        </Group>;
        return <>{side === 'defense' ? [defense, offense, playResult] : [offense, defense, playResult]}</>;
      })()}
      <Players screen={screen} state={state}/>
      <Penalties screen={screen} state={state}/>
      <Group title="Notes & Details">
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
      <Group title="Play Diagram">
        <div class="gi-tag-actions"><button type="button" onClick={() => screen.clearDiagram()}>Clear</button><button type="button" onClick={() => screen.drawDiagram()}>Draw</button></div>
        {state.diagram && <img src={state.diagram} alt="Current play diagram"/>}
      </Group>
      <Group title="More Tools">
        <div class="gi-tag-toggles">
          <label class="gi-tag-check"><input type="checkbox" checked={state.autoDD} onChange={e => screen.setAutoDD(e.currentTarget.checked)}/> Auto down &amp; distance</label>
          <label class="gi-tag-check"><input type="checkbox" checked={state.carryScheme} onChange={e => screen.setCarryScheme(e.currentTarget.checked)}/> Carry formation to next play</label>
        </div>
        <label class="gi-tag-input"><span>Charting setup</span>
          <select aria-label="Charting preset" value="" onChange={e => screen.applyChartingPreset(e.currentTarget.value)}>
            <option value="">Choose preset</option>{state.chartingPresets.map(item => <option key={item.id} value={item.id}>{item.name} · {item.role}</option>)}
          </select></label>
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
      <footer class="gi-tag-nav"><button type="button" disabled={!state.canPrevious} onClick={() => screen.previous()}>← Previous</button>
        <button type="button" onClick={() => screen.skip()}>Skip</button>
        <button type="button" class={`is-primary${state.saveConfirmed ? ' is-confirmed' : ''}`} aria-live="polite" onClick={() => screen.saveNext()}>{state.saveConfirmed ? 'Saved' : <><span>Save & Next</span><kbd>Enter</kbd></>}</button></footer>
    </main>}
  </section>;
}

/** Standalone root, for a tagging form outside the Break Down route. */
export function mountNativeTagging({host,screen}) {
  if (!host || !screen) throw new Error('Native tagging requires a host and controller.');
  render(<NativeTagging screen={screen}/>,host);
}
export function unmountNativeTagging(host) { if (host) render(null,host); }
