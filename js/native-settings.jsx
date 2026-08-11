import { useEffect, useMemo, useRef, useState } from 'preact/hooks';
import '../css/native-settings.css';

const JERSEY_COLORS = ['white','black','red','blue','navy','green','yellow','orange','purple','maroon','gray','teal'];
const CHART_GROUPS = [['formation','Formations'],['backfield','Backfields'],['front','Fronts']];
const DRAW_TOOLS = [['line','Line'],['arrow','Arrow'],['circle','Circle'],['rect','Rectangle'],['freehand','Draw'],['text','Text']];
const DRAW_COLORS = ['#ffffff','#ffff00','#ff4444','#4488ff','#44ff44','#ff8800'];
const FILTERS = {
  downs:['1','2','3','4'], quarters:['Q1','Q2','Q3','Q4','OT'],
  playTypes:['Run Inside','Run Outside','Screen','Short Pass','Medium Pass','Deep Pass','Play Action','RPO'],
  results:['Gain','Loss','No Gain','Incomplete','Touchdown','Interception','Fumble','Sack'],
  personnel:['00','01','02','10','11','12','13','20','21','22','23','30','31','32','Jumbo','Goal Line'],
};

const healthLabel = health => {
  if (!health) return 'Checking';
  if (health.state === 'linked' || health.state === 'managed') return 'Ready';
  if (health.state === 'saving') return 'Saving';
  if (health.state === 'repairing') return 'Repairing';
  if (health.state === 'unauthorized') return 'Reconnect';
  if (health.state === 'missing') return health.missing ? `${health.missing} missing` : 'Missing';
  if (health.state === 'browser-only') return 'Session only';
  return 'No film';
};
const sourceLabel = game => game.filmMode === 'linked' ? 'Linked' : game.filmMode === 'managed' ? 'Managed copy' : 'Not linked';
const dateLabel = value => { const date=new Date(value); return Number.isNaN(date.getTime()) ? String(value||'') : date.toLocaleString([], {month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); };

function FilmSettings({ screen, required, finish }) {
  const [model, setModel] = useState(null);
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState('');
  const [readyMode, setReadyMode] = useState('');
  const load = async () => setModel(await screen.snapshot());
  useEffect(() => { let live = true; screen.snapshot().then(value => { if (live) setModel(value); }); return () => { live = false; }; }, []);
  const run = async (key, action) => {
    if (busy) return;
    setBusy(key); setNotice('');
    try { const result=await action(); if(result?.message)setNotice(result.message); if(required&&result?.mode)setReadyMode(result.mode); await load(); }
    catch { setNotice('That action could not be completed. Nothing was changed.'); }
    finally { setBusy(''); }
  };
  if (!model) return <div class="gi-settings-loading" role="status">Checking film storage…</div>;
  if (!model.desktop) return <div class="gi-settings-empty"><h3>Desktop film storage</h3><p>The browser app can chart temporary video for this session. Install GridIron IQ desktop to link an existing library or use managed persistent film.</p></div>;
  return <div class="gi-settings-film" data-settings-panel="film">
    {required && <div class="gi-settings-callout is-required"><strong>Choose how film should work</strong><span>This choice affects video only. Tags, reports, seasons, and backups stay in protected app data.</span></div>}
    {notice && <div class="gi-settings-callout is-success" role="status"><span>{notice}</span>{required && readyMode && <button type="button" class="gi-settings-primary" onClick={() => finish(readyMode)}>Continue</button>}</div>}
    <section class="gi-settings-section">
      <header><div><span class="gi-settings-kicker">FILM LIBRARY</span><h3>Storage source</h3></div><span class={`gi-settings-status is-${model.mode || 'unset'}`}>{model.mode === 'linked' ? 'Linked · no copies' : model.mode === 'managed' ? 'Managed copies' : 'Not configured'}</span></header>
      <div class="gi-settings-section-body">
        <div class="gi-settings-path"><span>Library root</span><strong>{model.mode === 'linked' ? (model.root || 'Choose a folder') : model.mode === 'managed' ? 'GridIron IQ private app storage' : 'Not selected'}</strong><button type="button" onClick={() => run('root', () => screen.chooseLinkedRoot())} disabled={!!busy}>{busy === 'root' ? 'Choosing…' : model.root ? 'Change root' : 'Choose folder'}</button></div>
        <div class="gi-settings-mode-actions">
          <button type="button" class={model.mode === 'linked' ? 'is-selected' : ''} onClick={() => run('root', () => screen.chooseLinkedRoot())} disabled={!!busy}><strong>Use existing library</strong><span>Play coach-owned files in place. Nothing is copied.</span></button>
          <button type="button" class={model.mode === 'managed' ? 'is-selected' : ''} onClick={() => run('managed', () => screen.useManagedStorage())} disabled={!!busy}><strong>Use managed storage</strong><span>Imported video is copied into GridIron IQ app data.</span></button>
        </div>
        <p class="gi-settings-truth"><strong>Root and game folders are separate.</strong> Changing the root never rewrites a game's saved folder, creates plays, deletes tags, or moves video. A game that no longer resolves will say Reconnect.</p>
      </div>
    </section>
    <section class="gi-settings-section">
      <header><div><span class="gi-settings-kicker">CURRENT SEASON</span><h3>Per-game film</h3></div><div class="gi-settings-head-actions"><span class="gi-settings-status">{model.games.length} game{model.games.length === 1 ? '' : 's'}</span><button type="button" onClick={() => screen.addFilmClips()} disabled={!model.activeGameId}>Add clips</button></div></header>
      <div class="gi-settings-section-body is-table">
        {!model.games.length ? <div class="gi-settings-empty"><p>Open a season to see each game's actual film source and clip health.</p></div> : <div class="gi-settings-games" role="table" aria-label="Per-game film sources">
          <div class="gi-settings-game-head" role="row"><span>Game</span><span>Source</span><span>Folder</span><span>Clips</span><span>Actions</span></div>
          {model.games.map(row => <div class={`gi-settings-game${row.game.id === model.activeGameId ? ' is-active' : ''}`} role="row" key={row.game.id} data-settings-game={row.game.id}>
            <div><strong>{row.name}</strong>{row.game.id === model.activeGameId && <small>Current game</small>}</div>
            <div><span class={`gi-settings-badge is-${row.game.filmMode || 'none'}`}>{sourceLabel(row.game)}</span><small>{healthLabel(row.health)}</small></div>
            <div class="gi-settings-game-path" title={row.path}>{row.path || 'No folder selected'}</div>
            <div class={row.health?.missing ? 'is-warning' : ''}>{row.health?.expected ? `${row.health.found || 0} / ${row.health.expected}` : '—'}</div>
            <div class="gi-settings-row-actions">
              {row.game.filmMode === 'linked' && <button type="button" onClick={() => run(`open:${row.game.id}`, () => screen.openFolder(row.game))} disabled={!!busy}>Open</button>}
              <button type="button" onClick={() => run(`link:${row.game.id}`, () => screen.linkGame(row.game.id))} disabled={!!busy}>{row.game.filmMode === 'linked' ? 'Change' : 'Link'}</button>
              {row.health?.missing && <button type="button" onClick={() => screen.repairGame(row.game.id)} disabled={!!busy}>Repair</button>}
            </div>
          </div>)}
        </div>}
      </div>
    </section>
  </div>;
}

const PLAY_CALL_DEFAULTS = [
  ['runPass','Run / Pass'],['playType','Play type'],['playDir','Direction'],
  ['formation','Formation'],['qbAlignment','QB alignment'],['backfield','Backfield'],
  ['strength','Strength'],['personnel','Personnel'],['motion','Motion'],
];
const blankCall = () => ({ id:'', name:'', concept:'', favorite:false, defaults:{} });

function PlaybookSettings({ screen }) {
  const [calls,setCalls]=useState(()=>screen.playbookSnapshot());
  const [draft,setDraft]=useState(blankCall());
  const [error,setError]=useState('');
  const [busy,setBusy]=useState(false);
  const defaultOptions=useMemo(()=>screen.playbookDefaultOptions(),[screen]);
  const edit=call=>{setDraft({ ...call, defaults:{...call.defaults} });setError('');};
  const cancel=()=>{setDraft(blankCall());setError('');};
  const save=async event=>{
    event.preventDefault(); if(busy)return; setBusy(true);setError('');
    const result=draft.id ? await screen.updatePlayCall(draft.id,draft) : await screen.addPlayCall(draft);
    setBusy(false); if(!result.ok){setError(result.message||'That call could not be saved.');return;}
    setCalls(result.calls);cancel();
  };
  const remove=async id=>{if(busy)return;setBusy(true);const result=await screen.removePlayCall(id);setBusy(false);setCalls(result.calls);};
  const favorite=async call=>{const result=await screen.updatePlayCall(call.id,{favorite:!call.favorite});if(result.ok)setCalls(result.calls);};
  return <section class="gi-settings-section" data-playbook-manager><header><div><span class="gi-settings-kicker">PLAYBOOK & CALLS</span><h3>Exact calls available while charting</h3></div><span class="gi-settings-status">{calls.length} call{calls.length===1?'':'s'}</span></header><div class="gi-settings-section-body">
    <p class="gi-settings-truth"><strong>Your language stays yours.</strong> Optional defaults speed up charting but remain visible and overridable on every play. Editing this library never rewrites an already-tagged play.</p>
    <div class="gi-playbook-list">{calls.length?calls.map(call=><div class="gi-playbook-row" key={call.id} data-play-call={call.id}><button type="button" class="gi-playbook-favorite" aria-label={`${call.favorite?'Remove':'Add'} ${call.name} ${call.favorite?'from':'to'} favorites`} aria-pressed={call.favorite} onClick={()=>favorite(call)}>{call.favorite?'★':'☆'}</button><div><strong>{call.name}</strong><span>{call.concept||'No concept'}{Object.keys(call.defaults).length?` · ${Object.keys(call.defaults).length} defaults`:''}</span></div><button type="button" onClick={()=>edit(call)}>Edit</button><button type="button" class="gi-settings-danger" onClick={()=>remove(call.id)}>Remove</button></div>):<div class="gi-settings-empty"><p>No calls yet. Add the exact language your staff uses, such as 26 Blast.</p></div>}</div>
    <form class="gi-playbook-form" onSubmit={save}><div class="gi-playbook-form-head"><strong>{draft.id?'Edit play call':'Add play call'}</strong>{draft.id&&<button type="button" onClick={cancel}>Cancel edit</button>}</div><div class="gi-playbook-primary"><label>Play call<input name="playCallName" value={draft.name} onInput={e=>setDraft({...draft,name:e.currentTarget.value})} placeholder="26 Blast" maxLength="80" required/></label><label>Concept<input value={draft.concept} onInput={e=>setDraft({...draft,concept:e.currentTarget.value})} placeholder="Blast" maxLength="60"/></label></div><details><summary>Optional charting defaults</summary><div class="gi-playbook-defaults">{PLAY_CALL_DEFAULTS.map(([key,label])=><label key={key}>{label}<select value={draft.defaults[key]||''} onChange={e=>setDraft({...draft,defaults:{...draft.defaults,[key]:e.currentTarget.value}})}><option value="">No default</option>{defaultOptions[key].map(value=><option key={value} value={value}>{value}</option>)}</select></label>)}</div></details><label class="gi-playbook-favorite-check"><input type="checkbox" checked={draft.favorite} onChange={e=>setDraft({...draft,favorite:e.currentTarget.checked})}/> Show in favorites</label><button type="submit" class="gi-settings-primary" disabled={busy||!draft.name.trim()}>{busy?'Saving...':draft.id?'Save call':'Add call'}</button>{error&&<p class="gi-settings-error" role="alert">{error}</p>}</form>
  </div></section>;
}

function TeamSettings({ screen }) {
  const profile = screen.teamProfile();
  const [name, setName] = useState(profile.teamName || '');
  const [color, setColor] = useState(profile.jerseyColor || '');
  const [saved, setSaved] = useState(false);
  return <div class="gi-settings-team" data-settings-panel="team"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">TEAM IDENTITY</span><h3>Coach-facing name and jersey</h3></div></header><div class="gi-settings-section-body">
    <label class="gi-settings-field"><span>Team name</span><input value={name} onInput={event => { setName(event.currentTarget.value); setSaved(false); }} /></label>
    <fieldset class="gi-settings-swatches"><legend>Jersey color</legend>{JERSEY_COLORS.map(value => <button key={value} type="button" class={color === value ? 'is-selected' : ''} aria-label={`${value} jersey`} aria-pressed={color === value} data-color={value} onClick={() => { setColor(value); setSaved(false); }} />)}</fieldset>
    <button type="button" class="gi-settings-primary" disabled={!name.trim()} onClick={() => setSaved(screen.saveTeam(name, color))}>Save team identity</button>{saved && <span class="gi-settings-saved" role="status">Team identity saved</span>}
  </div></section><PlaybookSettings screen={screen}/></div>;
}

function RosterSettings({ screen }) {
  const [players,setPlayers]=useState(() => screen.rosterSnapshot());
  const [draft,setDraft]=useState({num:'',name:'',pos:'',side:'B'});
  const [paste,setPaste]=useState(''); const [notice,setNotice]=useState('');
  const add=()=>{if(!draft.num.trim())return;setPlayers(screen.addPlayer(draft));setDraft({num:'',name:'',pos:'',side:'B'});};
  const importText=()=>{const count=screen.importRoster(paste);setPlayers(screen.rosterSnapshot());setPaste('');setNotice(count?`Imported ${count} player${count===1?'':'s'}.`:'No players found. Check the columns.');};
  return <div data-settings-panel="roster"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">TEAM ROSTER</span><h3>Players available for charting</h3></div><button type="button" onClick={() => screen.exportDepthChart()} disabled={!players.length}>Print depth chart</button></header><div class="gi-settings-section-body">
    <div class="gi-roster-add"><input aria-label="Jersey number" inputMode="numeric" placeholder="#" value={draft.num} onInput={e=>setDraft({...draft,num:e.currentTarget.value})}/><input aria-label="Player name" placeholder="Player name" value={draft.name} onInput={e=>setDraft({...draft,name:e.currentTarget.value})}/><input aria-label="Position" placeholder="Pos" value={draft.pos} onInput={e=>setDraft({...draft,pos:e.currentTarget.value})}/><select aria-label="Side of ball" value={draft.side} onChange={e=>setDraft({...draft,side:e.currentTarget.value})}><option value="O">Offense</option><option value="D">Defense</option><option value="B">Both / Special</option></select><button type="button" class="gi-settings-primary" onClick={add}>Add player</button></div>
    <div class="gi-roster-list">{players.length ? players.map(player=><div class="gi-roster-row" key={player.num}><strong>#{player.num}</strong><span>{player.name||'Unnamed'}</span><small>{[player.pos,player.side].filter(Boolean).join(' · ')}</small><button type="button" aria-label={`Remove #${player.num}`} onClick={()=>setPlayers(screen.removePlayer(player.num))}>×</button></div>) : <div class="gi-settings-empty"><p>No players yet. Add jersey numbers for one-tap player charting.</p></div>}</div>
    <details class="gi-settings-details"><summary>Import CSV or paste from a spreadsheet</summary><textarea rows="5" value={paste} onInput={e=>setPaste(e.currentTarget.value)} placeholder={'#, Name, Position, Side\n12, Jordan Smith, QB, O'} /><div><label class="gi-settings-file">Choose CSV<input type="file" accept=".csv,.tsv,.txt" onChange={e=>{const file=e.currentTarget.files?.[0];if(!file)return;const reader=new FileReader();reader.onload=()=>setPaste(String(reader.result||''));reader.readAsText(file);e.currentTarget.value='';}} /></label><button type="button" class="gi-settings-primary" onClick={importText} disabled={!paste.trim()}>Import roster</button></div>{notice&&<p role="status" class="gi-settings-saved">{notice}</p>}</details>
  </div></section></div>;
}

function ChartingSettings({ screen, initialGroup }) {
  const [groupKey,setGroupKey]=useState(initialGroup||'formation');
  const [group,setGroup]=useState(()=>screen.chartingSnapshot(groupKey)); const [value,setValue]=useState(''); const [error,setError]=useState('');
  const choose=key=>{setGroupKey(key);setGroup(screen.chartingSnapshot(key));setError('');};
  const add=()=>{const result=screen.addTagChoice(groupKey,value);if(!result.ok){setError(result.message);return;}setGroup(result.group);setValue('');setError('');};
  return <div data-settings-panel="charting"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">CHARTING LIBRARIES</span><h3>Show only the looks your staff uses</h3></div><button type="button" onClick={async()=>{if(await screen.restoreTagDefaults())setGroup(screen.chartingSnapshot(groupKey));}}>Restore defaults</button></header><div class="gi-settings-section-body">
    <p class="gi-settings-truth"><strong>Hiding is not deleting.</strong> Existing plays and analytics stay unchanged. This only reduces charting clutter.</p>
    <div class="gi-settings-segment" role="tablist" aria-label="Charting library">{CHART_GROUPS.map(([key,label])=><button key={key} type="button" role="tab" data-chart-group={key} aria-selected={groupKey===key} class={groupKey===key?'is-selected':''} onClick={()=>choose(key)}>{label}</button>)}</div>
    <div class="gi-library-summary"><strong>{group.enabled.length} shown</strong><span>{group.values.length-group.enabled.length} hidden</span></div>
    <div class="gi-library-list">{group.values.map(item=><div class="gi-library-row" key={item} data-tag-value={item}><label><input type="checkbox" checked={group.enabled.includes(item)} onChange={e=>setGroup(screen.setTagEnabled(groupKey,item,e.currentTarget.checked))}/><span>{item}</span></label>{group.custom.includes(item)?<button type="button" aria-label={`Remove ${item}`} onClick={async()=>setGroup(await screen.removeTagChoice(groupKey,item))}>×</button>:<small>Default</small>}</div>)}</div>
    <div class="gi-library-add"><input data-tag-add value={value} onInput={e=>{setValue(e.currentTarget.value);setError('');}} placeholder={`Add custom ${group.singular}`} maxLength="40"/><button type="button" class="gi-settings-primary" onClick={add}>Add</button></div>{error&&<p class="gi-settings-error" role="alert">{error}</p>}
  </div></section></div>;
}

function ToggleGroup({ label, values, selected, onChange }) {
  return <fieldset class="gi-filter-group"><legend>{label}</legend><div>{values.map(value=><button key={value} type="button" aria-pressed={selected.includes(value)} class={selected.includes(value)?'is-selected':''} onClick={()=>onChange(selected.includes(value)?selected.filter(item=>item!==value):[...selected,value])}>{value}</button>)}</div></fieldset>;
}
function CutupSettings({ screen }) {
  const [criteria,setCriteria]=useState(()=>screen.filterSnapshot());
  const apply=next=>{setCriteria(next);screen.saveFilter(next);};
  const formations=screen.chartingSnapshot('formation').enabled;
  const count=useMemo(()=>[criteria.downs,criteria.quarters,criteria.playTypes,criteria.results,criteria.formations,criteria.personnel].reduce((n,v)=>n+(v?.length||0),0)+(criteria.situation?1:0),[criteria]);
  return <div data-settings-panel="cutup"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">CUT-UP EXPORT</span><h3>Choose the plays to include</h3></div><span class="gi-settings-status">{count ? `${count} active` : 'All plays'}</span></header><div class="gi-settings-section-body">
    <p class="gi-settings-truth">Filters combine across rows. Choices within one row are alternatives. The export uses exactly the resulting film set.</p>
    <ToggleGroup label="Down" values={FILTERS.downs} selected={criteria.downs||[]} onChange={values=>apply({...criteria,downs:values})}/><ToggleGroup label="Quarter" values={FILTERS.quarters} selected={criteria.quarters||[]} onChange={values=>apply({...criteria,quarters:values})}/><ToggleGroup label="Play type" values={FILTERS.playTypes} selected={criteria.playTypes||[]} onChange={values=>apply({...criteria,playTypes:values})}/><ToggleGroup label="Result" values={FILTERS.results} selected={criteria.results||[]} onChange={values=>apply({...criteria,results:values})}/>
    <div class="gi-filter-selects"><label>Formation<select value={criteria.formations?.[0]||''} onChange={e=>apply({...criteria,formations:e.currentTarget.value?[e.currentTarget.value]:[]})}><option value="">All</option>{formations.map(v=><option key={v}>{v}</option>)}</select></label><label>Personnel<select value={criteria.personnel?.[0]||''} onChange={e=>apply({...criteria,personnel:e.currentTarget.value?[e.currentTarget.value]:[]})}><option value="">All</option>{FILTERS.personnel.map(v=><option key={v}>{v}</option>)}</select></label><label>Situation<select value={criteria.situation||''} onChange={e=>apply({...criteria,situation:e.currentTarget.value})}><option value="">All</option><option value="redzone">Red zone</option><option value="goalline">Goal line</option><option value="backed-up">Backed up</option><option value="3rd-long">3rd & long</option><option value="3rd-short">3rd & short</option></select></label></div>
    <div class="gi-settings-command-row"><button type="button" onClick={()=>{const next={quarters:[],downs:[],playTypes:[],formations:[],personnel:[],results:[],situation:''};apply(next);}}>Clear filters</button><button type="button" class="gi-settings-primary" onClick={()=>screen.exportCutup(criteria)}>Export filtered cut-up</button></div>
  </div></section></div>;
}

function DrawingSettings({ screen }) {
  const [state,setState]=useState(()=>screen.drawingSnapshot());
  return <div data-settings-panel="drawing"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">VIDEO DRAWING</span><h3>Choose a tool, then draw on film</h3></div><span class="gi-settings-status">{state.count} drawing{state.count===1?'':'s'}</span></header><div class="gi-settings-section-body">
    <div class="gi-drawing-tools">{DRAW_TOOLS.map(([key,label])=><button key={key} type="button" data-drawing-tool={key} class={state.tool===key?'is-selected':''} onClick={()=>screen.chooseDrawingTool(key)}><strong>{label}</strong><span>{key==='text'?'Place a label':'Draw on video'}</span></button>)}</div>
    <div class="gi-drawing-options"><fieldset><legend>Color</legend>{DRAW_COLORS.map(color=><button key={color} type="button" data-drawing-color={color} class={state.color===color?'is-selected':''} style={{background:color}} aria-label={`Use ${color}`} onClick={()=>setState(screen.setDrawingColor(color))}/>)}</fieldset><label>Line width<input type="range" min="2" max="10" value={state.lineWidth} onInput={e=>setState(screen.setDrawingWidth(e.currentTarget.value))}/><output>{state.lineWidth}px</output></label></div>
    <p class="gi-settings-truth">Choosing a tool closes this panel so the film stays unobstructed. Press Escape or choose the active tool again to stop drawing.</p><button type="button" class="gi-settings-danger" disabled={!state.count} onClick={async()=>{if(await screen.clearDrawings())setState(screen.drawingSnapshot());}}>Clear current-play drawings</button>
  </div></section></div>;
}

function RecoverySettings({ screen }) {
  const [model,setModel]=useState(null);const [label,setLabel]=useState('');const [gameLabel,setGameLabel]=useState('');const [notice,setNotice]=useState('');const [busy,setBusy]=useState('');
  const load=async()=>setModel(await screen.recoverySnapshot());useEffect(()=>{let live=true;screen.recoverySnapshot().then(v=>live&&setModel(v));return()=>{live=false;};},[]);
  const run=async(key,fn)=>{if(busy)return;setBusy(key);setNotice('');try{const result=await fn();if(result?.message)setNotice(result.message);await load();}catch{setNotice('That action could not be completed. Nothing was changed.');}finally{setBusy('');}};
  if(!model)return <div class="gi-settings-loading" role="status">Loading restore points…</div>;
  return <div data-settings-panel="recovery">{notice&&<div class="gi-settings-callout" role="status">{notice}</div>}
    <section class="gi-settings-section"><header><div><span class="gi-settings-kicker">WHOLE SEASON · DURABLE</span><h3>Season restore points</h3></div><span class="gi-settings-status">{model.seasonPoints.length} saved</span></header><div class="gi-settings-section-body">
      <p class="gi-settings-truth"><strong>Restores every game in {model.seasonName||'the open season'}.</strong> Before restoring, GridIron IQ saves the current season so you can reverse the decision.</p>
      <div class="gi-recovery-create"><input aria-label="Restore point label" value={label} onInput={e=>setLabel(e.currentTarget.value)} placeholder="Label, e.g. Before playoff re-tag"/><button type="button" class="gi-settings-primary" disabled={!model.hasSeason||!!busy} onClick={()=>run('create',async()=>{const r=await screen.createRestorePoint(label);if(r.ok)setLabel('');return r;})}>Create restore point</button></div>
      <div class="gi-recovery-list">{model.seasonPoints.length?model.seasonPoints.map(point=><div class="gi-recovery-row" key={point.id} data-season-restore={point.id}><div><strong>{point.label||'Save'}</strong><span>{dateLabel(point.t)} · {point.games} game{point.games===1?'':'s'} · {point.plays} plays</span></div><button type="button" disabled={!!busy} onClick={()=>run(`season:${point.id}`,()=>screen.restoreSeasonPoint(point.id))}>Restore season</button></div>):<div class="gi-settings-empty"><p>No season restore points yet.</p></div>}</div>
      {model.disk?.name&&<div class="gi-settings-command-row"><span>Protected location: {model.disk.name}</span><button type="button" onClick={()=>screen.openDataFolder()}>Open data folder</button></div>}
    </div></section>
    <section class="gi-settings-section"><header><div><span class="gi-settings-kicker">CURRENT GAME · QUICK HISTORY</span><h3>Game versions</h3></div><span class="gi-settings-status">{model.versions.length} saved</span></header><div class="gi-settings-section-body">
      <p class="gi-settings-truth"><strong>Restores only the open game.</strong> These quick versions live on this device and do not replace season restore points.</p>
      <div class="gi-recovery-create"><input aria-label="Game version label" value={gameLabel} onInput={e=>setGameLabel(e.currentTarget.value)} placeholder="Version label"/><button type="button" onClick={()=>{screen.saveGameVersion(gameLabel);setGameLabel('');load();}}>Save game version</button></div>
      <div class="gi-recovery-list">{model.versions.length?model.versions.map(version=><div class="gi-recovery-row" key={version.id} data-game-version={version.id}><div><strong>{version.label}</strong><span>{dateLabel(version.time)} · {version.playCount} plays</span></div><div><button type="button" onClick={()=>run(`version:${version.id}`,()=>screen.restoreGameVersion(version.id))}>Restore game</button><button type="button" class="gi-settings-danger" onClick={()=>run(`delete:${version.id}`,()=>screen.deleteGameVersion(version.id))}>×</button></div></div>):<div class="gi-settings-empty"><p>No versions for the open game.</p></div>}</div>
    </div></section>
  </div>;
}

function AnalysisSettings({ screen }) {
  const profile=screen.analysisProfile();const [result,setResult]=useState('');
  const save=e=>{e.preventDefault();const data=new FormData(e.currentTarget);setResult(screen.saveAnalysis(data.get('apiKey'),data.get('model'))?'saved':'error');};
  return <div data-settings-panel="analysis"><section class="gi-settings-section"><header><div><span class="gi-settings-kicker">OPTIONAL ANALYSIS</span><h3>Vision and local auto-detect</h3></div><span class="gi-settings-status">{profile.status}</span></header><form class="gi-settings-section-body" onSubmit={save}><p class="gi-settings-truth">Core charting and reports never require AI. These preferences only enhance optional frame analysis and play detection.</p><label class="gi-settings-field"><span>Claude API key</span><input name="apiKey" type="password" defaultValue={profile.apiKey} onInput={()=>setResult('')} autocomplete="off" spellcheck="false" /></label><label class="gi-settings-field"><span>Vision model</span><select name="model" defaultValue={profile.model} onChange={()=>setResult('')}><option value="claude-opus-4-6">Opus · most accurate</option><option value="claude-sonnet-4-6">Sonnet · faster</option></select></label><button type="submit" class="gi-settings-primary">Save analysis preferences</button>{result==='saved'&&<span class="gi-settings-saved" role="status">Analysis preferences saved</span>}{result==='error'&&<span class="gi-settings-saved is-error" role="alert">Analysis preferences could not be saved</span>}</form></section></div>;
}

const TABS=[['film','Film'],['team','Team'],['roster','Roster'],['charting','Charting'],['cutup','Cut-ups'],['drawing','Drawing'],['recovery','Recovery'],['analysis','Analysis']];
export function NativeSettingsContent({ screen, required = false, finish, initialTab='film', chartGroup='formation' }) {
  const [tab,setTabState]=useState(required?'film':initialTab);
  const setTab=next=>{setTabState(next);screen.setActiveTab(next);};
  const tabsRef=useRef(null);
  useEffect(()=>{const nav=tabsRef.current,active=nav?.querySelector('[aria-current="page"]');if(!nav||!active)return;nav.scrollLeft=Math.max(0,active.offsetLeft-(nav.clientWidth-active.offsetWidth)/2);},[tab]);
  const content = tab==='film'?<FilmSettings screen={screen} required={required} finish={finish}/>:tab==='team'?<TeamSettings screen={screen}/>:tab==='roster'?<RosterSettings screen={screen}/>:tab==='charting'?<ChartingSettings screen={screen} initialGroup={chartGroup}/>:tab==='cutup'?<CutupSettings screen={screen}/>:tab==='drawing'?<DrawingSettings screen={screen}/>:tab==='recovery'?<RecoverySettings screen={screen}/>:<AnalysisSettings screen={screen}/>;
  return <div class="gi-settings" data-native-settings><nav ref={tabsRef} class="gi-settings-tabs" aria-label="Settings sections">{(required?TABS.slice(0,1):TABS).map(([key,label])=><button key={key} type="button" data-settings-tab={key} class={tab===key?'is-active':''} aria-current={tab===key?'page':undefined} onClick={()=>setTab(key)}>{label}</button>)}</nav>{content}</div>;
}