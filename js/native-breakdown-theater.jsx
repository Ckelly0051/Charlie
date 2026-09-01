import { render } from 'preact';
import { useEffect, useLayoutEffect, useRef, useState } from 'preact/hooks';
import '../css/native-breakdown-theater.css';

function Icon({ name }) {
  return <svg aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;
}

/**
 * The below-film lower-third. Sits between the stage and the transport, never
 * over the video — the film column is `.gi-theater-stage` (flexes) followed
 * by this fixed-height row, so a chyron pixel can never sit on a video pixel.
 * Renders nothing when no play is selected, rather than an empty shell.
 */
// Native focus+scroll on a tabIndex-0 overflow container is real browser
// behavior, but it shouldn't be the ONLY path to the cells it hides at
// narrow widths — an explicit handler makes reaching Result deterministic
// rather than dependent on a platform default nobody guaranteed.
function scrollChyron(event) {
  const el = event.currentTarget;
  if (event.key === 'ArrowRight') { el.scrollBy({ left: 110, behavior: 'smooth' }); event.preventDefault(); }
  else if (event.key === 'ArrowLeft') { el.scrollBy({ left: -110, behavior: 'smooth' }); event.preventDefault(); }
  else if (event.key === 'Home') { el.scrollTo({ left: 0, behavior: 'smooth' }); event.preventDefault(); }
  else if (event.key === 'End') { el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' }); event.preventDefault(); }
}

function Chyron({ state }) {
  const c = state.chyron;
  if (!c) return null;
  // title exposes the full value when the cell ellipsizes — a coach can
  // still read a long custom Front/Coverage/Front+Blitz combination that
  // doesn't fit the fixed-width cell.
  return <div class="gi-theater-chyron" data-native-chyron role="group" aria-label="Current play, scrollable with arrow keys" tabIndex="0" onKeyDown={scrollChyron}>
    <div class="gi-chyron-id"><span class="gi-chyron-k">Play</span><span class="gi-chyron-v">{c.playId}</span></div>
    <div class="gi-chyron-cell"><span class="gi-chyron-k">Down &amp; Distance</span><span class="gi-chyron-v is-cond" title={c.situation}>{c.situation}</span></div>
    <div class="gi-chyron-cell is-secondary"><span class="gi-chyron-k">Ball On</span><span class="gi-chyron-v is-cond" title={c.ball}>{c.ball}</span></div>
    <div class="gi-chyron-cell is-secondary"><span class="gi-chyron-k">Hash</span><span class="gi-chyron-v" title={c.hash}>{c.hash}</span></div>
    <div class={`gi-chyron-cell is-call${c.ourTone ? ` is-${c.ourTone}` : ''}`}><span class="gi-chyron-k">{c.ourLabel}</span><span class="gi-chyron-v" title={c.ourValue}>{c.ourValue}</span></div>
    {c.lookLabel && <div class="gi-chyron-cell is-call"><span class="gi-chyron-k">{c.lookLabel}</span><span class="gi-chyron-v" title={c.lookValue}>{c.lookValue}</span></div>}
    <div class={`gi-chyron-cell is-wide${c.resultTone ? ` is-${c.resultTone}` : ''}`}><span class="gi-chyron-k">Result</span><span class="gi-chyron-v" title={c.result}>{c.result}</span></div>
  </div>;
}

function Transport({ screen, state }) {
  const [open, setOpen] = useState(false);
  const tools = useRef(null);
  const trigger = useRef(null);
  useEffect(() => setOpen(false), [state.gameKey, state.view]);
  useEffect(() => {
    if (!open) return;
    const dismiss = event => { if (!tools.current?.contains(event.target)) setOpen(false); };
    const escape = event => { if (event.key === 'Escape') { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener('pointerdown', dismiss);
    tools.current?.addEventListener('keydown', escape);
    const node = tools.current;
    return () => { document.removeEventListener('pointerdown', dismiss); node?.removeEventListener('keydown', escape); };
  }, [open]);
  return <div class={`gi-theater-transport${open ? ' is-tools-open' : ''}`} aria-label="Video controls">
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
    <div class="gi-theater-tools-wrap" ref={tools}>
    <button type="button" class="gi-icon-command gi-transport-more-trigger" ref={trigger} aria-label="More playback tools" title="More playback tools" aria-expanded={open} onClick={() => setOpen(!open)}>⋯</button>
    <div class="gi-theater-transport-tools">
      <button type="button" class={`gi-icon-command${state.loopMode === 'play' ? ' is-active' : ''}`} aria-pressed={state.loopMode === 'play'} aria-label="Loop current play" title="Loop current play" onClick={() => screen.toggleLoop()}><Icon name="loop" /></button>
      <select value={state.speed} aria-label="Playback speed" onChange={event => screen.setSpeed(event.currentTarget.value)}>
        {[0.25, 0.5, 1, 1.5, 2].map(rate => <option key={rate} value={rate}>{rate}x</option>)}
      </select>
      <button type="button" class="gi-icon-command" aria-label="Drawing tools" title="Drawing tools" onClick={() => screen.openDrawing()}><Icon name="pencil" /></button>
      {!state.multiAngle.enabled && <button type="button" class="gi-icon-command" aria-label="Add camera angle" title="Add camera angle" onClick={() => screen.addAngle()}><Icon name="film" /></button>}
      <button type="button" class="gi-icon-command" aria-label={state.fullscreen ? 'Exit full screen' : 'Full screen'} title={state.fullscreen ? 'Exit full screen' : 'Full screen'} onClick={() => screen.toggleFullscreen()}><span aria-hidden="true">{state.fullscreen ? '⤡' : '⤢'}</span></button>
    </div>
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
  const [open, setOpen] = useState(false);
  const [directions, setDirections] = useState('');
  const list = useRef(null), panel = useRef(null), trigger = useRef(null), close = useRef(null);
  const wasOpen = useRef(false);
  const dismiss = () => setOpen(false);
  useEffect(() => setOpen(false), [state.gameKey, state.view]);
  useEffect(() => {
    const media = matchMedia('(min-width: 1350px)');
    const change = () => setOpen(false);
    media.addEventListener('change', change);
    return () => media.removeEventListener('change', change);
  }, []);
  useEffect(() => {
    const node = list.current;
    if (!node) return;
    const update = () => {
      const above = node.scrollTop > 1;
      const below = node.scrollHeight - node.clientHeight - node.scrollTop > 1;
      setDirections(node.clientHeight && (above || below) ? (above ? (below ? '↕' : '↑') : '↓') : '');
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    node.addEventListener('scroll', update, { passive: true });
    update();
    return () => { observer.disconnect(); node.removeEventListener('scroll', update); };
  }, [open, state.groups, state.stripCollapsed]);
  useLayoutEffect(() => {
    if (open) close.current?.focus();
    const current = list.current?.querySelector('[aria-current="true"]');
    if (!open && wasOpen.current) {
      const target = trigger.current?.getClientRects().length ? trigger.current : current;
      target?.focus();
    }
    wasOpen.current = open;
    current?.scrollIntoView?.({ block: 'nearest', inline: 'nearest' });
  }, [open, state.currentPlayId, state.gameKey]);
  const keyDown = event => {
    if (!open) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismiss(); }
    if (event.key === 'Tab') {
      const buttons = [...panel.current.querySelectorAll('button')].filter(el => el.getClientRects().length);
      const first = buttons[0], last = buttons.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
    }
  };
  return <>
    {open && <div class="gi-rail-scrim" onClick={dismiss} />}
    <section ref={panel} onKeyDown={keyDown} class={`gi-drive-strip${open ? ' is-open' : ''}`} aria-label="Game plays" role={open ? 'dialog' : undefined} aria-modal={open ? 'true' : undefined}>
    <header><strong>Plays</strong><span>{state.playCount} plays · grouped by drive</span>
      {directions && <span class="gi-rail-scroll-hint" role="img" aria-label={directions === '↓' ? 'More plays below' : directions === '↑' ? 'More plays above' : 'More plays above and below'} title="Scroll for more plays">{directions}</span>}
      <button type="button" class="gi-rail-close" ref={close} aria-label="Close plays browser" onClick={dismiss}>×</button>
    </header>
    <div class="gi-drive-scroll" ref={list} data-drive-scroll>
      {state.groups.length ? state.groups.map(group => <section class="gi-drive-group" key={`${group.key}-${group.plays[0]?.id}`} aria-label={group.label}>
        <h3>{group.label}</h3>
        <div>{group.plays.map(play => <button
          type="button"
          key={play.id}
          class={`gi-play-card is-${play.kind}${play.id === state.currentPlayId ? ' is-current' : ''}`}
          aria-current={play.id === state.currentPlayId ? 'true' : undefined}
          aria-label={play.label}
          data-native-play-id={play.id}
          onClick={() => { screen.selectPlay(play.id); if (open) dismiss(); }}
          title={play.label}
        ><span>{play.id}</span><strong>{play.situation}</strong><small><span title={play.call}>{play.call}</span><span title={play.result}>{play.result}</span></small></button>)}</div>
      </section>) : <p class="gi-drive-empty">Load film or mark a play to begin.</p>}
    </div>
    <button type="button" class="gi-plays-toggle" ref={trigger} aria-label="Show play strip" aria-expanded={open} onClick={() => setOpen(true)}>▤ Plays · {state.playCount}<span>▴ Open</span></button>
  </section></>;
}

function SelectedPlay({ state }) {
  const c = state.chyron;
  if (!c || state.view !== 'film-room') return null;
  return <section class="gi-theater-selected-play" aria-label="Selected play">
    <header><strong>Play {c.playId}</strong><span>{[c.situation, c.ball, c.hash === '—' ? '' : `${c.hash} hash`].filter(Boolean).join(' · ')}</span></header>
    <strong class="gi-selected-call">{c.ourValue}</strong>
    <p>{c.result}</p>
    {c.lookLabel && <details><summary>More detail</summary><p>{c.lookLabel}: {c.lookValue}</p></details>}
    {state.currentNotes && <p class="gi-selected-notes">{state.currentNotes}</p>}
    {state.currentDrive && <p>Drive {state.currentDrive}</p>}
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

function NativePlayRail({ screen }) {
  const [state, setState] = useState(() => screen.snapshot());
  useLayoutEffect(() => screen.subscribe(setState), [screen]);
  return <PlayStrip screen={screen} state={state} />;
}

function NativeBreakdownTheater({ screen, hasRailHost }) {
  const [state, setState] = useState(() => screen.snapshot());
  useLayoutEffect(() => screen.subscribe(setState), [screen]);
  return <section class="gi-breakdown-theater" data-native-breakdown-theater data-unit={state.chyron?.ourTone === 'def' ? 'defense' : 'offense'} data-view={state.view} aria-label="Film theater">
    <div class="gi-theater-player" data-native-player-surface>
      <div class="gi-theater-stage">
        <div class="gi-theater-media-slot" data-native-media-slot />
        <SelectedPlay state={state} />
      </div>
      <Chyron state={state} />
      <Transport screen={screen} state={state} />
    </div>
    <AngleBar screen={screen} state={state} />
    <ChartActions screen={screen} state={state} />
    {!hasRailHost && <PlayStrip screen={screen} state={state} />}
  </section>;
}

export function mountNativeBreakdownTheater({ host, railHost, screen }) {
  if (!host) throw new Error('Native Break Down theater requires a host.');
  if (!screen) throw new Error('Native Break Down theater requires a screen controller.');
  render(<NativeBreakdownTheater screen={screen} hasRailHost={!!railHost} />, host);
  // Separate native roots share the same controller snapshot. Importing the
  // React compatibility portal would also change form event semantics app-wide.
  if (railHost) render(<NativePlayRail screen={screen} />, railHost);
  const mediaSlot = host.querySelector('[data-native-media-slot]');
  const fullscreenTarget = host.querySelector('[data-native-player-surface]');
  if (!mediaSlot) throw new Error('Native Break Down theater media slot did not mount.');
  if (!fullscreenTarget) throw new Error('Native Break Down theater fullscreen surface did not mount.');
  return {
    mediaSlot,
    fullscreenTarget,
    updatePlayback({ time, duration, progress }) {
      const times = fullscreenTarget.querySelectorAll('.gi-theater-time');
      if (times[0]) times[0].textContent = screen.formatTime(time);
      if (times[1]) times[1].textContent = screen.formatTime(duration);
      const scrub = fullscreenTarget.querySelector('.gi-theater-scrub');
      if (scrub) scrub.value = String(progress);
    },
    unmount() { render(null, host); if (railHost) render(null, railHost); },
  };
}
