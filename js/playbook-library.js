/**
 * Team-scoped offensive play-call vocabulary.
 *
 * This service owns definitions only. Selecting a call and applying its
 * defaults to a play belongs to the charting workflow, where explicit
 * per-play overrides can be preserved deliberately.
 */
export class PlaybookLibrary {
  static VERSION = 1;
  static DEFAULT_KEYS = ['runPass', 'playType', 'playDir', 'formation',
    'qbAlignment', 'backfield', 'strength', 'personnel', 'motion'];

  constructor({ storage, teamId } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.teamId = teamId || (() => {
      try { return this.storage?.getItem('ffa_active_team_id') || 'default'; }
      catch { return 'default'; }
    });
  }

  _teamId() { return typeof this.teamId === 'function' ? this.teamId() : this.teamId; }
  key() { return `ffa_playbook_${this._teamId() || 'default'}`; }
  _blank() { return { version: PlaybookLibrary.VERSION, calls: [] }; }
  _read() { try { return JSON.parse(this.storage?.getItem(this.key()) || 'null'); } catch { return null; } }
  _write(state) { try { this.storage?.setItem(this.key(), JSON.stringify(state)); } catch {} return state; }

  _cleanDefaults(raw) {
    const defaults = {};
    for (const key of PlaybookLibrary.DEFAULT_KEYS) {
      const value = typeof raw?.[key] === 'string' ? raw[key].trim() : '';
      if (value) defaults[key] = value;
    }
    return defaults;
  }

  _normalizeCall(raw, fallbackId = '') {
    if (!raw || typeof raw !== 'object') return null;
    const name = String(raw.name || raw.playCall || '').trim();
    if (!name) return null;
    return {
      id: String(raw.id || fallbackId || ('call_' + this._slug(name))),
      name,
      concept: String(raw.concept || raw.playConcept || '').trim(),
      favorite: raw.favorite === true,
      defaults: this._cleanDefaults(raw.defaults),
    };
  }

  _normalize(raw) {
    const calls = [], ids = new Set();
    for (const item of Array.isArray(raw?.calls) ? raw.calls : []) {
      const call = this._normalizeCall(item);
      if (!call || ids.has(call.id)) continue;
      ids.add(call.id); calls.push(call);
    }
    return { version: PlaybookLibrary.VERSION, calls };
  }

  load() { return this._normalize(this._read() || this._blank()); }
  list() { return this.load().calls.map(call => ({ ...call, defaults: { ...call.defaults } })); }
  get(id) { return this.list().find(call => call.id === id) || null; }
  _slug(name) { return String(name || '').toLowerCase().trim().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '') || 'play'; }
  _availableId(name, calls = this.load().calls) {
    const base = `call_${this._slug(name)}`, used = new Set(calls.map(call => call.id));
    if (!used.has(base)) return base;
    let suffix = 2;
    while (used.has(`${base}_${suffix}`)) suffix++;
    return `${base}_${suffix}`;
  }

  add(input) {
    const state = this.load();
    const call = this._normalizeCall(input, this._availableId(input?.name || input?.playCall, state.calls));
    if (!call) return null;
    state.calls.push(call); this._write(state);
    return { ...call, defaults: { ...call.defaults } };
  }

  update(id, patch = {}) {
    const state = this.load(), index = state.calls.findIndex(call => call.id === id);
    if (index < 0) return null;
    const current = state.calls[index];
    const next = this._normalizeCall({ ...current, ...patch, id: current.id,
      defaults: patch.defaults ? { ...current.defaults, ...patch.defaults } : current.defaults }, current.id);
    if (!next) return null;
    state.calls[index] = next; this._write(state);
    return { ...next, defaults: { ...next.defaults } };
  }

  remove(id) {
    const state = this.load(), calls = state.calls.filter(call => call.id !== id);
    if (calls.length === state.calls.length) return false;
    state.calls = calls; this._write(state); return true;
  }
}
