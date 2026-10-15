import { TagLibrary } from './tag-library.js';
/* Managed vocabulary owner and change notifications for the deck and grid.
 * Removing a library option never rewrites plays already carrying that value. */
export class CustomChips {
  static GROUPS = [
    { key: 'formationFamily', field: 'formationFamily', label: 'formation' },
    { key: 'backfield', field: 'backfield', label: 'backfield' },
    { key: 'front', field: 'defFront', label: 'front' },
    { key: 'coverage', field: 'coverage', label: 'coverage call' },
    { key: 'playType', field: 'playType', label: 'play type' },
    { key: 'blitz', field: 'blitz', label: 'blitz' },
    { key: 'receiverRoute', field: 'receiverRoute', label: 'receiver route' },
  ];

  constructor(tagger) {
    this.tagger = tagger;
    this.library = new TagLibrary();
    this._listeners = new Set();
  }

  /** Subscribe to "the active team's vocabulary changed" (a value was
   *  hidden/shown/added/removed/restored, or the active team switched).
   *  Returns an unsubscribe function. */
  onChange(fn) {
    this._listeners.add(fn);
    return () => this._listeners.delete(fn);
  }

  _notify() {
    this._listeners.forEach(fn => { try { fn(); } catch (e) {} });
  }

  /** Re-derive whatever depends on the CURRENT active team's vocabulary —
   *  call after a team switch, or after a direct `library.add`/`.remove`
   *  call (SettingsScreen calls those two directly, then this). */
  reload() {
    this._notify();
  }

  setEnabled(key, value, enabled) {
    const changed = this.library.setEnabled(key, value, enabled);
    if (changed) this._notify();
    return changed;
  }

  restoreDefaults() {
    this.library.restore();
    this._notify();
  }
}
