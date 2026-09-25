import { mountNativeFilmRoom, unmountNativeFilmRoom } from './native-film-room.jsx';

export class NativeFilmRoomScreen {
  constructor(app) {
    this.app = app;
    this.grid = app.playGrid;
    this.overlays = app.overlays;
    // Elements the table and controls views are attached to, most recent
    // last: the Break Down route's cells, and any standalone hosts.
    this._attached = { table: [], controls: [] };
    this._ownRoots = [];
    // ONE grid subscription for every view (rebuild step 3): the table and its
    // controls used to subscribe separately, so each grid update built the
    // shown-plays summary once per view. It is built once and fanned out.
    this._listeners = new Set();
    this._gridOff = null;
    this._last = null;
  }

  get host() { return this._attached.table[this._attached.table.length - 1] || null; }
  get controlsHost() { return this._attached.controls[this._attached.controls.length - 1] || null; }

  /** A standalone mount takes the view over from the Break Down route: one
   *  presentation at a time, as before the route owned its children. The
   *  route draws this screen's view only while this is false. */
  get standalone() { return this._ownRoots.length > 0; }
  _rerenderRoute() { this.app.breakdownWorkspace?._renderRoute?.(); }

  /** Standalone: `host` receives the table; `controlsHost` its title,
   *  actions and filters. The Break Down route renders the same two
   *  components in its own tree, placed beside the film or over the table. */
  mount(host, controlsHost) {
    if (!host || !controlsHost || !this.grid) return false;
    if (this._attached.table.includes(host) && this._attached.controls.includes(controlsHost)) return true;
    const roots = { host, controlsHost };
    this._ownRoots.push(roots);
    try {
      this._rerenderRoute();
      mountNativeFilmRoom({ ...roots, screen: this });
      return true;
    } catch (error) {
      unmountNativeFilmRoom(roots);
      this._ownRoots.splice(this._ownRoots.indexOf(roots), 1);
      this._rerenderRoute();
      throw error;
    }
  }

  restore() {
    if (!this._ownRoots.length) return false;
    for (const roots of this._ownRoots.splice(0)) unmountNativeFilmRoom(roots);
    this._rerenderRoute();
    return true;
  }

  /** A view's layout effect (`kind` is 'table' or 'controls') and cleanup. A
   *  detaching view closes the overlays it opened. */
  attachHost(kind, host) { this._attached[kind].push(host); }
  detachHost(kind, host) {
    for (const overlay of this.overlays.snapshot().overlays) {
      if (host.contains(overlay.anchor) || host.contains(overlay.returnFocus)) this.overlays.close(overlay.id, 'route-unmounted');
    }
    const list = this._attached[kind], index = list.indexOf(host);
    if (index >= 0) list.splice(index, 1);
  }

  // Every published snapshot carries the shown-plays summary, measured by the
  // stats engine this controller can reach; the grid model stays engine-free.
  _withSummary(snap) {
    const stats = this.app.stats;
    snap.summary = stats?.playSetSummary ? stats.playSetSummary(this.grid._visiblePlays(), { side: snap.summarySide }) : null;
    // One unit: the Yds header reads the summary's yards per play (the boards'
    // cohort). A mix of units has no honest average, so it shows none.
    const s = snap.summary;
    const ypp = s && (s.side === 'offense' || s.side === 'defense') && s.ypp != null && s.n >= 5 ? Number(s.ypp).toFixed(1) : null;
    for (const col of snap.columns || []) if (col.type === 'yds') col.tendency = ypp == null ? '' : `${ypp} / play`;
    return snap;
  }
  snapshot() { return this._withSummary(this.grid.nativeSnapshot()); }
  subscribe(listener) {
    this._listeners.add(listener);
    if (this._gridOff) listener(this._last);
    else this._gridOff = this.grid.subscribeNative(snap => {
      this._last = this._withSummary(snap);
      for (const fn of this._listeners) fn(this._last);
    });
    return () => {
      this._listeners.delete(listener);
      if (this._listeners.size || !this._gridOff) return;
      this._gridOff();
      this._gridOff = null;
      this._last = null;
    };
  }
  toggleFilter(group, value) { this.grid.nativeToggleFilter(group, value); }
  clearFilters() { this.grid.nativeClearFilters(); }
  setSelected(id, checked) { this.grid.nativeSetSelected(id, checked); }
  setAllVisible(checked) { this.grid.nativeSetAllVisible(checked); }
  selectPlay(id) { this.grid.nativeSelectPlay(id); }
  watch() { this.grid.nativeWatch(); }
  applyPreset(name, scope) { return this.grid.nativeApplyPreset(name, scope); }
  setColumn(key, enabled, scope) { return this.grid.nativeSetColumn(key, enabled, scope); }
  applySavedFilter(index) { return this.grid.nativeApplySavedFilter(index); }
  deleteSavedFilter(index) { return this.grid.nativeDeleteSavedFilter(index); }
  saveFilter(name) { return this.grid.nativeSaveFilter(name); }
  editor(playId, colKey) { return this.grid.nativeEditor(playId, colKey); }
  commitEdit(playId, colKey, value) { return this.grid.nativeCommitEdit(playId, colKey, value); }
}
