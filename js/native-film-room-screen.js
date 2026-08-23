import { mountNativeFilmRoom } from './native-film-room.jsx';

export class NativeFilmRoomScreen {
  constructor(app) {
    this.app = app;
    this.grid = app.playGrid;
    this.overlays = app.overlays;
    this.host = null;
    this._view = null;
    this._legacyHidden = null;
  }

  mount(host) {
    // Final Engine Independence: #playGridSection is a legacy authored
    // element PlayGrid's classic renderer used; the native route never reads
    // or writes it directly, only toggled it hidden as a belt-and-braces
    // precaution while it still existed. this.grid?.section may now be
    // genuinely absent (deleted from index.html) -- that is the expected,
    // fully-supported state, not a missing dependency.
    if (!host || !this.grid) return false;
    if (this.host === host && this._view) return true;
    if (this.host) this.restore();
    this.host = host;
    this._legacyHidden = this.grid.section?.hidden ?? null;
    if (this.grid.section) this.grid.section.hidden = true;
    this.grid.nativePresentation(true);
    try {
      this._view = mountNativeFilmRoom({ host, screen: this });
      return true;
    } catch (error) {
      this.grid.nativePresentation(false);
      if (this.grid.section) this.grid.section.hidden = this._legacyHidden;
      this.host = null;
      this._view = null;
      throw error;
    }
  }

  restore() {
    if (!this.host) return false;
    for (const overlay of this.overlays.snapshot().overlays) {
      const owned = this.host.contains(overlay.anchor) || this.host.contains(overlay.returnFocus);
      if (owned) this.overlays.close(overlay.id, 'route-unmounted');
    }
    this._view?.unmount?.();
    this._view = null;
    this.grid.nativePresentation(false);
    if (this.grid.section) this.grid.section.hidden = this._legacyHidden;
    this._legacyHidden = null;
    this.host = null;
    return true;
  }

  snapshot() { return this.grid.nativeSnapshot(); }
  subscribe(listener) { return this.grid.subscribeNative(listener); }
  toggleFilter(group, value) { this.grid.nativeToggleFilter(group, value); }
  clearFilters() { this.grid.nativeClearFilters(); }
  setSelected(id, checked) { this.grid.nativeSetSelected(id, checked); }
  setAllVisible(checked) { this.grid.nativeSetAllVisible(checked); }
  selectPlay(id) { this.grid.nativeSelectPlay(id); }
  watch() { this.grid.nativeWatch(); }
  applyPreset(name) { return this.grid.nativeApplyPreset(name); }
  setColumn(key, enabled) { return this.grid.nativeSetColumn(key, enabled); }
  applySavedFilter(index) { return this.grid.nativeApplySavedFilter(index); }
  deleteSavedFilter(index) { return this.grid.nativeDeleteSavedFilter(index); }
  saveFilter(name) { return this.grid.nativeSaveFilter(name); }
  editor(playId, colKey) { return this.grid.nativeEditor(playId, colKey); }
  commitEdit(playId, colKey, value) { return this.grid.nativeCommitEdit(playId, colKey, value); }
}
