import { mountNativeFilmRoom } from './native-film-room.jsx';

export class NativeFilmRoomScreen {
  constructor(app) {
    this.app = app;
    this.grid = app.playGrid;
    this.overlays = app.overlays;
    this.host = null;
    this.controlsHost = null;
    this._view = null;
  }

  /** `host` receives the table; `controlsHost` its title, actions and filters,
   *  which the Break Down composition places beside the film or over the table. */
  mount(host, controlsHost) {
    if (!host || !controlsHost || !this.grid) return false;
    if (this.host === host && this.controlsHost === controlsHost && this._view) return true;
    if (this.host) this.restore();
    this.host = host;
    this.controlsHost = controlsHost;
    try {
      this._view = mountNativeFilmRoom({ host, controlsHost, screen: this });
      return true;
    } catch (error) {
      this.host = null;
      this.controlsHost = null;
      this._view = null;
      throw error;
    }
  }

  restore() {
    if (!this.host) return false;
    for (const overlay of this.overlays.snapshot().overlays) {
      const owned = [this.host, this.controlsHost].some(root => root?.contains(overlay.anchor) || root?.contains(overlay.returnFocus));
      if (owned) this.overlays.close(overlay.id, 'route-unmounted');
    }
    this._view?.unmount?.();
    this._view = null;
    this.host = null;
    this.controlsHost = null;
    return true;
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
  subscribe(listener) { return this.grid.subscribeNative(snap => listener(this._withSummary(snap))); }
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
