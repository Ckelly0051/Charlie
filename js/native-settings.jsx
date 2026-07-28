import { useEffect, useState } from 'preact/hooks';
import '../css/native-settings.css';

const JERSEY_COLORS = ['white','black','red','blue','navy','green','yellow','orange','purple','maroon','gray','teal'];

const healthLabel = health => {
  if (!health) return 'Checking';
  if (health.state === 'linked') return 'Ready';
  if (health.state === 'managed') return 'Ready';
  if (health.state === 'saving') return 'Saving';
  if (health.state === 'repairing') return 'Repairing';
  if (health.state === 'unauthorized') return 'Reconnect';
  if (health.state === 'missing') return health.missing ? `${health.missing} missing` : 'Missing';
  if (health.state === 'browser-only') return 'Session only';
  return 'No film';
};

const sourceLabel = game => game.filmMode === 'linked' ? 'Linked' : game.filmMode === 'managed' ? 'Managed copy' : 'Not linked';

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
    try {
      const result = await action();
      if (result?.message) setNotice(result.message);
      if (required && result?.mode) setReadyMode(result.mode);
      await load();
    } finally { setBusy(''); }
  };

  if (!model) return <div class="gi-settings-loading" role="status">Checking film storage…</div>;
  if (!model.desktop) return <div class="gi-settings-empty"><h3>Desktop film storage</h3><p>The browser app can chart temporary video for this session. Install GridIron IQ desktop to link an existing library or use managed persistent film.</p></div>;

  return <div class="gi-settings-film" data-settings-panel="film">
    {required && <div class="gi-settings-callout is-required"><strong>Choose how film should work</strong><span>This choice affects video only. Tags, reports, seasons, and backups stay in protected app data.</span></div>}
    {notice && <div class="gi-settings-callout is-success" role="status"><span>{notice}</span>{required && readyMode && <button type="button" class="gi-settings-primary" onClick={() => finish(readyMode)}>Continue</button>}</div>}
    <section class="gi-settings-section">
      <header><div><span class="gi-settings-kicker">FILM LIBRARY</span><h3>Storage source</h3></div><span class={`gi-settings-status is-${model.mode || 'unset'}`}>{model.mode === 'linked' ? 'Linked · no copies' : model.mode === 'managed' ? 'Managed copies' : 'Not configured'}</span></header>
      <div class="gi-settings-section-body">
        <div class="gi-settings-path">
          <span>Library root</span>
          <strong>{model.mode === 'linked' ? (model.root || 'Choose a folder') : model.mode === 'managed' ? 'GridIron IQ private app storage' : 'Not selected'}</strong>
          <button type="button" onClick={() => run('root', () => screen.chooseLinkedRoot())} disabled={!!busy}>{busy === 'root' ? 'Choosing…' : model.root ? 'Change root' : 'Choose folder'}</button>
        </div>
        <div class="gi-settings-mode-actions">
          <button type="button" class={model.mode === 'linked' ? 'is-selected' : ''} onClick={() => run('root', () => screen.chooseLinkedRoot())} disabled={!!busy}>
            <strong>Use existing library</strong><span>Play the coach-owned files in place. Nothing is copied.</span>
          </button>
          <button type="button" class={model.mode === 'managed' ? 'is-selected' : ''} onClick={() => run('managed', () => screen.useManagedStorage())} disabled={!!busy}>
            <strong>Use managed storage</strong><span>Imported video is copied into GridIron IQ app data.</span>
          </button>
        </div>
        <p class="gi-settings-truth"><strong>Root and game folders are separate.</strong> Changing the root never rewrites a game's saved folder, creates plays, deletes tags, or moves video. A game that no longer resolves will say Reconnect.</p>
      </div>
    </section>

    <section class="gi-settings-section">
      <header><div><span class="gi-settings-kicker">CURRENT SEASON</span><h3>Per-game film</h3></div><span class="gi-settings-status">{model.games.length} game{model.games.length === 1 ? '' : 's'}</span></header>
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
              {row.health?.missing && row.game.filmMode !== 'linked' && <button type="button" onClick={() => screen.repairGame(row.game.id)} disabled={!!busy}>Repair</button>}
            </div>
          </div>)}
        </div>}
      </div>
    </section>
  </div>;
}

function TeamSettings({ screen }) {
  const profile = screen.teamProfile();
  const [name, setName] = useState(profile.teamName || '');
  const [color, setColor] = useState(profile.jerseyColor || '');
  const [saved, setSaved] = useState(false);
  return <div class="gi-settings-team" data-settings-panel="team">
    <section class="gi-settings-section">
      <header><div><span class="gi-settings-kicker">TEAM IDENTITY</span><h3>Coach-facing name and jersey</h3></div></header>
      <div class="gi-settings-section-body">
        <label class="gi-settings-field"><span>Team name</span><input value={name} onInput={event => { setName(event.currentTarget.value); setSaved(false); }} /></label>
        <fieldset class="gi-settings-swatches"><legend>Jersey color</legend>{JERSEY_COLORS.map(value => <button key={value} type="button" class={color === value ? 'is-selected' : ''} aria-label={`${value} jersey`} aria-pressed={color === value} data-color={value} onClick={() => { setColor(value); setSaved(false); }} />)}</fieldset>
        <button type="button" class="gi-settings-primary" disabled={!name.trim()} onClick={() => { const ok = screen.saveTeam(name, color); setSaved(ok); }}>Save team identity</button>
        {saved && <span class="gi-settings-saved" role="status">Team identity saved</span>}
      </div>
    </section>
  </div>;
}

export function NativeSettingsContent({ screen, required = false, finish }) {
  const [tab, setTab] = useState('film');
  return <div class="gi-settings" data-native-settings>
    <nav class="gi-settings-tabs" aria-label="Team and film settings sections">
      <button type="button" class={tab === 'film' ? 'is-active' : ''} aria-current={tab === 'film' ? 'page' : undefined} onClick={() => setTab('film')}>Film storage</button>
      <button type="button" class={tab === 'team' ? 'is-active' : ''} aria-current={tab === 'team' ? 'page' : undefined} onClick={() => setTab('team')}>Team identity</button>
      <button type="button" onClick={() => screen.openAdvanced()}>More settings</button>
    </nav>
    {tab === 'film' ? <FilmSettings screen={screen} required={required} finish={finish} /> : <TeamSettings screen={screen} />}
  </div>;
}