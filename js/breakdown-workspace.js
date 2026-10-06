import { h, render as preactRender } from 'preact';
import { BreakdownRoute } from './native-breakdown-route.jsx';
import '../css/native-breakdown-route.css';

/** Dedicated Break Down route using the canonical production DOM surfaces. */
export class BreakdownWorkspace {
  /* FILM ROOM LAYOUT (coach direction, 2026-09-23). Video first: the editable
     table docks below the film by default. The coach can move it beside the
     film, drag the split within usable limits, and reset. `video` is the film's
     share of the split axis (height below, width beside), kept per dock. A few
     bytes of preference, so it lives in localStorage like the other view
     settings; version history no longer shares that store. */
  static LAYOUT_KEY = 'ffa_film_room_layout';
  static LAYOUT_DEFAULT = Object.freeze({ dock: 'bottom', bottom: 62, side: 45 });
  static LAYOUT_LIMITS = Object.freeze({ bottom: [40, 75], side: [30, 65] });

  static readLayout(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const D = BreakdownWorkspace.LAYOUT_DEFAULT, L = BreakdownWorkspace.LAYOUT_LIMITS;
    let raw = null;
    try { raw = JSON.parse(storage?.getItem(BreakdownWorkspace.LAYOUT_KEY) || 'null'); } catch (e) { raw = null; }
    const clamp = (value, [lo, hi], fallback) => (value != null && value !== '' && Number.isFinite(Number(value)) ? Math.min(hi, Math.max(lo, Number(value))) : fallback);
    return {
      dock: raw?.dock === 'side' ? 'side' : 'bottom',
      bottom: clamp(raw?.bottom, L.bottom, D.bottom),
      side: clamp(raw?.side, L.side, D.side),
    };
  }

  constructor(app) {
    this.app = app;
    // S7-d1: game context comes from the service, not a hidden <select>.
    this.host = null;
    this.saveState = 'saved';
    this.view = 'chart';
    this.filmFocus = (() => { try { return localStorage.getItem('ffa_breakdown_film_focus') === '1'; } catch (e) { return false; } })();
    this.filmLayout = BreakdownWorkspace.readLayout();
    this._filmFocusOpenedStrip = false;
    this._bound = false;
    this.toolsOpen = false;
  }

  mount(host) {
    if (!host || !this.app.breakdownTheater || !this.app.nativeFilmRoom || !this.app.nativeTagging) return false;
    if (this.host === host && this.app.breakdownTheater._mounted) return true;
    if (this.host) this.restore();
    this.host = host;
    this._rendered = false;
    try {
      // One tree: the route renders the theater, rail, deck and Film Room as
      // components, and each attaches to its controller while mounted.
      this._renderRoute();
      if (!this.app.breakdownTheater._mounted) throw new Error('Break Down theater did not mount.');
      this._bind();
      this._setView(this.view);
      const savedFilmFocus = this.filmFocus;
      this.filmFocus = false;
      this._setFilmFocus(savedFilmFocus, { persist: false });
      this.render();
      return true;
    } catch (error) {
      preactRender(null, host);
      this.host = null;
      throw error;
    }
  }
  _bind() {
    if (this._bound) return;
    this._bound = true;
    ['play-selected', 'play-created', 'play-updated', 'play-deleted', 'plays-loaded']
      .forEach(event => this.app.tagger?.on(event, () => requestAnimationFrame(() => this.render())));
    this.app.quickChart?.on('mode-changed', () => requestAnimationFrame(() => this.render()));
    this.app.gameContext?.subscribe(() => this.render());
  }

  /** The route's state, which BreakdownRoute draws. */
  snapshot() {
    const quick = !!this.app.quickChart?.isActive;
    return {
      view: this.view,
      context: quick ? 'quick' : 'chart',
      layout: { ...this.filmLayout },
      filmFocus: this.filmFocus,
      toolsOpen: this.toolsOpen,
      saveState: this.saveState,
    };
  }
  /** Synchronous, so the DOM is current when a command returns. */
  _renderRoute() {
    if (!this.host) return;
    preactRender(h(BreakdownRoute, { workspace: this, state: this.snapshot() }), this.host);
  }

  /** Change the dock and/or the film's share of the current dock; persisted. */
  setFilmLayout({ dock, video } = {}, { persist = true } = {}) {
    const next = { ...this.filmLayout };
    if (dock === 'bottom' || dock === 'side') next.dock = dock;
    if (video != null) {
      const [lo, hi] = BreakdownWorkspace.LAYOUT_LIMITS[next.dock];
      next[next.dock] = Math.round(Math.min(hi, Math.max(lo, Number(video))) * 10) / 10;
    }
    this.filmLayout = next;
    this._renderRoute();
    if (persist) this._saveLayout();
    return this.filmLayout;
  }
  resetFilmLayout() {
    this.filmLayout = { ...BreakdownWorkspace.LAYOUT_DEFAULT };
    this._renderRoute();
    try { localStorage.removeItem(BreakdownWorkspace.LAYOUT_KEY); } catch (e) {}
    return this.filmLayout;
  }
  _saveLayout() {
    try { localStorage.setItem(BreakdownWorkspace.LAYOUT_KEY, JSON.stringify(this.filmLayout)); }
    catch (e) { console.error('Film Room layout could not be saved', e); }
  }

  _toggleTools() {
    this.toolsOpen = !this.toolsOpen;
    this._renderRoute();
  }

  _closeTools() {
    if (!this.toolsOpen) return;
    this.toolsOpen = false;
    this._renderRoute();
  }

  _setView(view, { userInitiated = false } = {}) {
    const filmRoom = view === 'film-room';
    // H2 — Chart and Film Room were dead inside Film Focus. Focus removes the
    // deck from layout, so swapping the hidden hosts underneath it did nothing
    // visible and the coach had to go back through Show Charting. Asking for a
    // surface IS asking to leave focus.
    //
    // But ONLY when the coach asked. Mount/restore also calls this to reapply
    // the stored view, and exiting focus there wiped the persisted Film Focus
    // on every remount — caught by e2e-breakdown-geometry, which is exactly the
    // regression that harness exists for.
    if (userInitiated && this.filmFocus) this._setFilmFocus(false);
    this.view = filmRoom ? 'film-room' : 'chart';
    this.app.breakdownTheater?.setView(this.view);
    // The route host is the shell's element, outside the rendered tree; the
    // shell CSS keys the Film Room bracket on it.
    this.host?.classList.toggle('is-film-room', filmRoom);
    this._renderRoute();
  }
  _setFilmFocus(enabled, { persist = true } = {}) {
    const next = !!enabled;
    if (next && !this.filmFocus) {
      this._filmFocusOpenedStrip = !this.app.breakdownTheater?.stripCollapsed;
      this.app.breakdownTheater?.setStripCollapsed?.(true);
    } else if (!next && this.filmFocus && this._filmFocusOpenedStrip) {
      this.app.breakdownTheater?.setStripCollapsed?.(false);
      this._filmFocusOpenedStrip = false;
    }
    this.filmFocus = next;
    this._renderRoute();
    if (persist) { try { localStorage.setItem('ffa_breakdown_film_focus', this.filmFocus ? '1' : '0'); } catch (e) {} }
  }
  _setContext(context) {
    this._closeTools();
    if (context === 'quick') {
      this.app.quickChart?.toggle();
      this.render();
      return;
    }
    if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    this.render();
  }

  setSaveState(state) {
    this.saveState = state === 'pending' ? 'pending' : 'saved';
    this.render();
  }

  render() {
    if (!this.host) return;
    this._renderRoute();
  }

  restore() {
    if (!this.host) return false;
    if (this.app.quickChart?.isActive) this.app.quickChart.toggle();
    // Unmounting the tree detaches every child view: the media goes home and
    // the Film Room closes the overlays it opened.
    preactRender(null, this.host);
    this.host = null;
    return true;
  }
}
