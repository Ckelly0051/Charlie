import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '../css/native-breakdown-theater.css';

function Icon({ name }) {
  return <svg aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;
}

function Transport({ screen, state }) {
  return <div class="gi-theater-transport" aria-label="Video controls">
    <div class="gi-theater-transport-main">
      <button type="button" class="gi-icon-command" aria-label="Previous clip" title="Previous clip (Shift+Left)" onClick={() => screen.previousClip()}><Icon name="prev-clip" /></button>
      <button type="button" class="gi-icon-command" aria-label="Step back one frame" title="Step back (Left Arrow)" onClick={() => screen.stepBack()}><Icon name="step-back" /></button>
      <button type="button" class="gi-play-command" aria-label={state.playing ? 'Pause film' : 'Play film'} onClick={() => screen.togglePlay()}><Icon name={state.playing ? 'pause' : 'play'} /></button>
      <button type="button" class="gi-icon-command" aria-label="Step forward one frame" title="Step forward (Right Arrow)" onClick={() => screen.stepForward()}><Icon name="step-forward" /></button>
      <button type="button" class="gi-icon-command" aria-label="Next clip" title="Next clip (Shift+Right)" onClick={() => screen.nextClip()}><Icon name="next-clip" /></button>
      <span class="gi-theater-time">{screen.formatTime(state.time)}</span>
      <input class="gi-theater-scrub" type="range" min="0" max="1" step="0.0001" value={state.progress} aria-label="Film position" onInput={event => screen.seekFraction(event.currentTarget.value)} />
      <span class="gi-theater-time">{screen.formatTime(state.duration)}</span>
    </div>
    <div class="gi-theater-transport-tools">
      <button type="button" class={`gi-icon-command${state.loopMode === 'play' ? ' is-active' : ''}`} aria-pressed={state.loopMode === 'play'} aria-label="Loop current play" title="Loop current play" onClick={() => screen.toggleLoop()}><Icon name="loop" /></button>
      <select value={state.speed} aria-label="Playback speed" onChange={event => screen.setSpeed(event.currentTarget.value)}>
        {[0.25, 0.5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}x</option>)}
      </select>
      <button type="button" class="gi-icon-command" aria-label="Drawing tools" title="Drawing tools" onClick={() => screen.openDrawing()}><Icon name="pencil" /></button>
      {!state.multiAngle.enabled && <button type="button" class="gi-icon-command" aria-label="Add camera angle" title="Add camera angle" onClick={() => screen.addAngle()}><Icon name="film" /></button>}
      <button type="button" class="gi-icon-command" aria-label={state.fullscreen ? 'Exit full screen' : 'Full screen'} title={state.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => screen.toggleFullscreen()}><span aria-hidden="true">{state.fullscreen ? '⤡' : '⤢'}</span></button>
    </div>
  </div>;
}

function AngleBar({ screen, state }) {
  const angle = state.multiAngle;
  if (!angle.enabled) return null;
  return <div class="gi-theater-anglebar" aria-label="Camera angles">
    <button type="button" class="gi-theater-command" onClick={() => screen.addAngle()}>{angle.enabled ? 'Change angle' : 'Add angle'}</button>
    {angle.enabled && <>
      <strong title={angle.name}>{angle.name || 'Angle 2'}</strong>
      <select value={angle.mode} aria-label="Camera layout" onChange={event => screen.setAngleMode(event.currentTarget.value)}>
        <option value="single">Toggle</option><option value="sideBySide">Side by side</option><option value="pip">Picture in picture</option>
      </select>
      <button type="button" class="gi-theater-command" onClick={() => screen.swapAngle()}>Swap</button>
      <label>Sync <input type="number" step="0.1" value={angle.offset} aria-label="Angle two time offset" onChange={event => screen.setAngleOffset(event.currentTarget.value)} /> s</label>
      <button type="button" class="gi-theater-command is-danger" onClick={() => screen.removeAngle()}>Remove</button>
    </>}
  </div>;
}

function PlayStrip({ screen, state }) {
  return <section class="gi-drive-strip" aria-label="Game plays">
    <header><strong>Plays</strong><span>{state.plays.length} play{state.plays.length === 1 ? '' : 's'} · grouped by drive</span></header>
    <div class="gi-drive-scroll" data-drive-scroll>
      {state.groups.length ? state.groups.map(group => <section class="gi-drive-group" key={`${group.key}-${group.plays[0]?.id}`} aria-label={group.label}>
        <h3>{group.label}</h3>
        <div>{group.plays.map(play => <button
          type="button"
          key={play.id}
          class={`gi-play-card is-${play.kind}${play.id === state.currentPlayId ? ' is-current' : ''}`}
          aria-current={play.id === state.currentPlayId ? 'true' : undefined}
          aria-label={play.label}
          data-native-play-id={play.id}
          onClick={() => screen.selectPlay(play.id)}
        ><span>Play {play.id}</span><strong>{play.situation}</strong><small><span>{play.call}</span><span>{play.result}</span></small></button>)}</div>
      </section>) : <p class="gi-drive-empty">Load film or mark a play to begin.</p>}
    </div>
  </section>;
}

function ChartActions({ screen, state }) {
  return <div class="gi-theater-actions" aria-label="Play actions">
    <div class="gi-theater-actions-primary">
      <button type="button" class={state.pendingStart != null ? 'is-active' : ''} onClick={() => screen.markStart()}>{state.pendingStart != null ? `Start ${screen.formatTime(state.pendingStart)}` : '[ Mark start'}</button>
      <button type="button" onClick={() => screen.markEnd()}>] Mark end</button>
      <button type="button" onClick={() => screen.copyLast()}>Copy last</button>
    </div>
    <label class="gi-autoplay-toggle"><input type="checkbox" checked={state.autoplay} onChange={event => screen.setAutoplay(event.currentTarget.checked)} /><span>Autoplay next</span></label>
    <div class="gi-theater-actions-risk">
      <button type="button" onClick={() => screen.clearTags()}>Clear tags</button>
      <button type="button" class="is-danger" onClick={() => screen.deletePlay()}>Delete play</button>
    </div>
  </div>;
}

function NativeBreakdownTheater({ screen }) {
  const [state, setState] = useState(() => screen.snapshot());
  useEffect(() => screen.subscribe(setState), [screen]);
  useEffect(() => {
    const current = document.querySelector(`[data-native-play-id="${state.currentPlayId}"]`);
    current?.scrollIntoView?.({ block: 'nearest', inline: 'center' });
  }, [state.currentPlayId]);
  return <section class="gi-breakdown-theater" data-native-breakdown-theater aria-label="Film theater">
    <div class="gi-theater-stage">
      <div class="gi-theater-media-slot" data-native-media-slot />
    </div>
    <Transport screen={screen} state={state} />
    <AngleBar screen={screen} state={state} />
    <PlayStrip screen={screen} state={state} />
    <ChartActions screen={screen} state={state} />
  </section>;
}

export function mountNativeBreakdownTheater({ host, screen }) {
  if (!host) throw new Error('Native Break Down theater requires a host.');
  if (!screen) throw new Error('Native Break Down theater requires a screen controller.');
  render(<NativeBreakdownTheater screen={screen} />, host);
  const mediaSlot = host.querySelector('[data-native-media-slot]');
  if (!mediaSlot) throw new Error('Native Break Down theater media slot did not mount.');
  return { mediaSlot, unmount() { render(null, host); } };
}
