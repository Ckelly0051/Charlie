import { h } from 'preact';
import { NativeCustomFields } from './native-custom-fields.jsx';

/**
 * CustomFieldsManager — user-defined tag fields.
 *
 * Coaches can add their own categories (e.g. "Coverage Beater", "MOFO/MOFC",
 * "Blitz Pickup") without a code change. Each field is either a set of chip
 * options or a free-text input. Definitions live in localStorage (global,
 * like the roster); per-play values are stored on `play.tags.customFields`
 * so they travel with the project save and appear in CSV export.
 *
 * Field def shape: { id, name, options: string[] }  (options empty => text)
 *
 * The charting deck renders the per-play inputs (native-tagging.jsx) and writes
 * through `_write`; its "Edit custom fields" button opens `openManager`, a sheet
 * on the overlay service (native-custom-fields.jsx; rebuilt 2026-09-27 from a
 * hand-built dialog).
 */
export class CustomFieldsManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.defs = this._load();
  }

  static KEY = 'ffa_custom_fields';

  _load() {
    try { return JSON.parse(localStorage.getItem(CustomFieldsManager.KEY) || '[]') || []; }
    catch { return []; }
  }
  /** Write `defs` and read it back. True only when storage holds exactly it. */
  _persist(defs) {
    const text = JSON.stringify(defs);
    try { localStorage.setItem(CustomFieldsManager.KEY, text); return localStorage.getItem(CustomFieldsManager.KEY) === text; }
    catch { return false; }
  }
  newId() { return 'cf_' + Math.random().toString(36).slice(2, 8); }

  /** Replace the definitions from editor rows ({ id, name, options: string }).
   *  A row with no name is dropped; options are comma-separated, blank = text.
   *  Nothing changes in memory unless storage verifiably holds the new set, so
   *  a charted value can never reference a field that vanishes on restart.
   *  Returns true on a verified save, false on a failed write. */
  saveDefs(rows) {
    const next = (rows || []).map(row => ({
      id: row.id || this.newId(),
      name: String(row.name || '').trim(),
      options: String(row.options || '').split(',').map(v => v.trim()).filter(Boolean),
    })).filter(def => def.name);
    if (!this._persist(next)) return false;
    this.defs = next;
    return true;
  }

  _write(id, value) {
    const play = this.tagger.getCurrentPlay && this.tagger.getCurrentPlay();
    if (!play) return;
    if (!play.tags.customFields) play.tags.customFields = {};
    if (value) play.tags.customFields[id] = value;
    else delete play.tags.customFields[id];
    this.tagger._emit && this.tagger._emit('play-updated', play);
  }

  /** Open the editor sheet. Resolves 'saved' or a dismissal reason. */
  openManager({ overlays, returnFocus = null, onSaved = null } = {}) {
    if (!overlays) return Promise.resolve('unavailable');
    if (this._handle) return this._handle.result;
    let handle = null;
    const close = value => handle?.close(value);
    handle = overlays.sheet({
      id: 'custom-fields', title: 'Custom tag fields', modal: true, returnFocus,
      content: h(NativeCustomFields, { manager: this, onClose: close }), actions: [],
    });
    this._handle = handle;
    return handle.result.then(value => {
      if (this._handle === handle) this._handle = null;
      if (value === 'saved') onSaved?.(this.defs);
      return value;
    });
  }

}
