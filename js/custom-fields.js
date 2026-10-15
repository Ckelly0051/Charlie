import { h } from 'preact';
import { NativeCustomFields } from './native-custom-fields.jsx';

/* Coach-defined chip/text fields: definitions in settings, values on play.tags.customFields.
 * The deck writes the draft; the shared overlay renders the definition editor. */
export class CustomFieldsManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.defs = this._load();
  }

  static KEY = 'ffa_custom_fields';

  /** The stored text; the one read of this key (load and write verification). */
  _readStored() { return localStorage.getItem(CustomFieldsManager.KEY); }
  _load() {
    try { return JSON.parse(this._readStored() || '[]') || []; }
    catch { return []; }
  }
  /** Write `defs` and read it back. True only when storage holds exactly it. */
  _persist(defs) {
    const text = JSON.stringify(defs);
    try { localStorage.setItem(CustomFieldsManager.KEY, text); return this._readStored() === text; }
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
