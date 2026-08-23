import { TagLibrary } from './tag-library.js';
/**
 * CustomChips — thin owner of the active team's Formation, Backfield, and
 * Front vocabulary (TagLibrary), plus notifying the surfaces that cache or
 * present that vocabulary (Film Room's grid, the native tag form) when it
 * changes.
 *
 * Final Engine Independence: this class no longer injects/removes chip
 * BUTTONS into any DOM chip group. native-tagging.jsx already reads its
 * Formation/Backfield/Front option lists straight from `TagLibrary` on every
 * publish (native-tagging-screen.js's snapshot() `library()` helper), and
 * the native "Edit library" action opens the dedicated Team & Film Settings
 * library editor (`SettingsScreen`, which calls `library.add`/`.remove`
 * directly) rather than an inline "+" button inside the tag form.
 *
 * What survives is two things that were previously side effects of DOM
 * mutation (a MutationObserver watching the legacy chip group for injected/
 * removed/re-classed buttons): PlayGrid's Film Room needs its column-option
 * cache invalidated, and an ALREADY-MOUNTED native tag form needs to know a
 * value it's currently showing was hidden/added/removed/restored — neither
 * of those is triggered by a play-data event, so both get an explicit
 * subscriber notification here instead.
 *
 * Removing a custom value only drops the affordance; plays already tagged
 * with that value keep it (same as any tag value the coach later stops
 * using).
 */
export class CustomChips {
  static GROUPS = [
    { key: 'formation', field: 'formation', label: 'formation' },
    { key: 'backfield', field: 'backfield', label: 'backfield' },
    { key: 'front', field: 'defFront', label: 'front' },
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
    this._clearGridCache();
    this._listeners.forEach(fn => { try { fn(); } catch (e) {} });
  }

  _clearGridCache() {
    try { if (window.app && window.app.playGrid) window.app.playGrid._optionCache = {}; } catch (e) {}
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
