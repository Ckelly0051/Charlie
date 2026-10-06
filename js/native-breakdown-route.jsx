import { useMemo, useRef, useState } from 'preact/hooks';
import { NativeBreakdownTheater, NativePlayRail } from './native-breakdown-theater.jsx';
import { NativeTagging } from './native-tagging.jsx';
import { NativeFilmRoom, FilmRoomControls } from './native-film-room.jsx';

/*
 * THE BREAK DOWN ROUTE (rebuild, 2026-09-24; docs/archive/plans/BREAKDOWN-REBUILD-PLAN.md).
 * One component owns the toolbar, the composition grid and the splitter, drawn
 * from BreakdownWorkspace's state. It replaced an HTML string whose state was
 * painted by hand (class toggles, aria writes, `hidden` flips), which is why
 * every layout move needed new wiring. The workspace re-renders this
 * synchronously on every change, so the DOM is current the moment a command
 * returns, as it was before.
 *
 * The grid cells keep their `*-host` classes and data hooks: they are the
 * layout's named areas, and the CSS and harnesses address them. The child
 * views render inside them as part of this one tree; each still reads its own
 * controller, and attaches to it for as long as it is mounted.
 */

const Icon = ({ name }) => <svg aria-hidden="true"><use href={`assets/icons.svg#icon-${name}`} /></svg>;

function Splitter({ workspace, layout }) {
  const [dragging, setDragging] = useState(false);
  const { dock } = layout;
  const video = layout[dock];
  const [lo, hi] = workspace.constructor.LAYOUT_LIMITS[dock];
  const pctAt = (event, el) => {
    const rect = el.closest('.gi-breakdown-composition').getBoundingClientRect();
    return workspace.filmLayout.dock === 'bottom'
      ? ((event.clientY - rect.top) / rect.height) * 100
      : ((event.clientX - rect.left) / rect.width) * 100;
  };
  const onPointerDown = event => {
    if (event.button !== 0) return;
    event.preventDefault();
    const el = event.currentTarget;
    el.setPointerCapture?.(event.pointerId);
    setDragging(true);
    const move = e => workspace.setFilmLayout({ video: pctAt(e, el) }, { persist: false });
    const up = e => {
      el.releasePointerCapture?.(e.pointerId);
      setDragging(false);
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
      el.removeEventListener('pointercancel', up);
      workspace._saveLayout();
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
    el.addEventListener('pointercancel', up);
  };
  const onKeyDown = event => {
    const bottom = workspace.filmLayout.dock === 'bottom';
    const now = workspace.filmLayout[workspace.filmLayout.dock];
    const step = { [bottom ? 'ArrowUp' : 'ArrowLeft']: -2, [bottom ? 'ArrowDown' : 'ArrowRight']: 2, PageUp: -10, PageDown: 10 }[event.key];
    let next = null;
    if (step != null) next = now + step;
    else if (event.key === 'Home') next = lo;
    else if (event.key === 'End') next = hi;
    if (next == null) return;
    event.preventDefault();
    workspace.setFilmLayout({ video: next });
  };
  // The separator runs across the split: a horizontal line between stacked
  // panes, a vertical one between side-by-side panes.
  return <div class={`gi-breakdown-splitter${dragging ? ' is-dragging' : ''}`} data-fr-splitter role="separator" tabindex="0" aria-label="Resize film and table"
    aria-orientation={dock === 'bottom' ? 'horizontal' : 'vertical'} aria-valuemin={String(lo)} aria-valuemax={String(hi)}
    aria-valuenow={String(video)} aria-valuetext={`Film ${Math.round(video)}%`}
    onPointerDown={onPointerDown} onKeyDown={onKeyDown}
    onDblClick={() => workspace.setFilmLayout({ video: workspace.constructor.LAYOUT_DEFAULT[workspace.filmLayout.dock] })} />;
}

export function BreakdownRoute({ workspace, state }) {
  const toolsToggle = useRef(null);
  const app = workspace.app;
  const { breakdownTheater: theater, nativeTagging: tagging, nativeFilmRoom: filmRoomScreen } = app;
  // Built once: a route re-render (a splitter drag, a view switch) hands the
  // same vnodes back, so Preact skips the children and they update only from
  // their own controllers.
  const views = useMemo(() => ({
    theater: <NativeBreakdownTheater screen={app.breakdownTheater} hasRailHost />,
    rail: <NativePlayRail screen={app.breakdownTheater} />,
    controls: <FilmRoomControls screen={app.nativeFilmRoom} />,
    tagging: <NativeTagging screen={app.nativeTagging} />,
    table: <NativeFilmRoom screen={app.nativeFilmRoom} />,
  }), [app]);
  const { view, context, layout, filmFocus, toolsOpen, saveState } = state;
  const filmRoom = view === 'film-room';
  const pressed = active => ({ class: active ? 'active' : undefined, 'aria-pressed': String(active) });
  return <div class={`gi-breakdown-route${filmFocus ? ' is-film-focus' : ''}`} data-native-breakdown-route data-fr-dock={layout.dock} style={{ '--fr-video': `${layout[layout.dock]}%` }}>
    <header class="gi-breakdown-toolbar" aria-label="Break Down tools">
      <div class="gi-breakdown-view" role="group" aria-label="Break Down view">
        <button type="button" data-bd-view="chart" {...pressed(!filmRoom)} onClick={() => workspace._setView('chart', { userInitiated: true })}>Chart</button>
        <button type="button" data-bd-view="film-room" {...pressed(filmRoom)} onClick={() => workspace._setView('film-room', { userInitiated: true })}>Film Room</button>
      </div>
      <div class="gi-breakdown-layout" role="group" aria-label="Film Room layout">
        <span class="gi-breakdown-layout-label" aria-hidden="true">Table</span>
        <button type="button" data-fr-dock="bottom" {...pressed(layout.dock === 'bottom')} aria-label="Table below film" onClick={() => workspace.setFilmLayout({ dock: 'bottom' })}>Below</button>
        <button type="button" data-fr-dock="side" {...pressed(layout.dock === 'side')} aria-label="Table beside film" onClick={() => workspace.setFilmLayout({ dock: 'side' })}>Beside</button>
        <button type="button" data-fr-reset aria-label="Reset Film Room layout" onClick={() => workspace.resetFilmLayout()}>Reset</button>
      </div>
      <div class={`gi-breakdown-tools${toolsOpen ? ' is-open' : ''}`} onKeyDown={event => {
        if (event.key !== 'Escape') return;
        event.preventDefault();
        workspace._closeTools();
        toolsToggle.current?.focus();
      }}>
        <button type="button" ref={toolsToggle} data-bd-tools-toggle aria-haspopup="menu" aria-controls="bdMoreTools" aria-expanded={String(toolsOpen)} onClick={() => workspace._toggleTools()}>More tools</button>
        <div class="gi-breakdown-commands" id="bdMoreTools" role="menu">
          <button type="button" role="menuitem" data-bd-context="quick" {...pressed(context === 'quick')} onClick={() => workspace._setContext('quick')}><Icon name="chart" />Quick chart</button>
          <button type="button" role="menuitem" data-bd-film-focus {...pressed(filmFocus)} onClick={() => { workspace._closeTools(); workspace._setFilmFocus(!workspace.filmFocus); }}><Icon name="scan" /><span>{filmFocus ? 'Show charting' : 'Film focus'}</span></button>
        </div>
      </div>
      <span class={`gi-breakdown-save is-${saveState === 'pending' ? 'pending' : saveState === 'failed' ? 'failed' : 'saved'}`} id="bdSaveState">{saveState === 'pending' ? 'Saving...' : saveState === 'failed' ? 'Not saved' : 'Saved'}</span>
    </header>
    <div class="gi-breakdown-composition">
      <section class="gi-breakdown-theater-host" data-breakdown-theater-host>{!theater.standalone && views.theater}</section>
      <aside class="gi-breakdown-rail-host" data-breakdown-rail-host aria-label="Game plays">{!theater.standalone && views.rail}</aside>
      <Splitter workspace={workspace} layout={layout} />
      <div class="gi-breakdown-film-controls-host" data-breakdown-film-controls-host>{!filmRoomScreen.standalone && views.controls}</div>
      <aside class="gi-breakdown-deck" aria-label="Charting deck">
        <div class="gi-breakdown-tagging-host" data-breakdown-tagging-host hidden={filmRoom}>{!tagging.standalone && views.tagging}</div>
        <div class="gi-breakdown-film-room-host" data-breakdown-film-room-host hidden={!filmRoom}>{!filmRoomScreen.standalone && views.table}</div>
      </aside>
    </div>
  </div>;
}
