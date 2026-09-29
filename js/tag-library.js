import { TagProjection } from './tag-projection.js';

/** Per-team charting vocabulary. Visibility and ordering change controls, never stored tags. */
export class TagLibrary {
  // Values that belong to ANOTHER field and so may never be a choice in this
  // group: an alignment is never a formation or backfield, 'Empty' is never a
  // formation, a family is never a coverage call. Charting one would store the
  // old combined shape (TagProjection.isCombined). Matched case-insensitively.
  static RESERVED = Object.freeze({
    formationFamily: { values: TagProjection.PICKER_EXCLUDE.formationFamily, owner: v => TagProjection.QB_ALIGNMENTS.includes(v) ? 'QB Alignment' : 'Backfield',
      // A receiver distribution ("3x1") is the Receiver Set, never a Family.
      pattern: /^\d+\s*x\s*\d+$/i, patternOwner: 'Receiver Set' },
    backfield: { values: TagProjection.PICKER_EXCLUDE.backfield, owner: () => 'QB Alignment' },
    coverage: { values: TagProjection.PICKER_EXCLUDE.coverage, owner: () => 'Coverage Family' },
  });
  /** The field a reserved value belongs to, or null when `value` is allowed in
   *  `key`. Checked per "+"-joined token, because a compound label ("Shotgun +
   *  Trips") charts exactly the combined shape a lone "Shotgun" would; a label
   *  that only contains the word ("Shotgun Special") is its own value. */
  static reservedOwner(key, value) {
    const rule = TagLibrary.RESERVED[key];
    if (!rule) return null;
    for (const token of String(value || '').split('+').map(part => part.trim().toLowerCase()).filter(Boolean)) {
      const match = rule.values.find(item => item.toLowerCase() === token);
      if (match) return rule.owner(match);
      if (rule.pattern && rule.pattern.test(token)) return rule.patternOwner;
    }
    return null;
  }
  static VERSION = 5;
  static DEFINITIONS = {
    // Classification-critical fields (down, result, run/pass, QB alignment,
    // coverage family, strength and direction) intentionally remain fixed, and so
    // does the Receiver Set (a numeric distribution, ChartingDetails.RECEIVER_SETS).
    // The Formation Family is the offense's structure, one value per play; the
    // package and receiver words the old Formation field mixed in (Trips, Twins,
    // Bunch, Goal Line...) are not built in here.
    formationFamily: ['Spread','Power-I','I-Form','Split Back','Singleback','Wing-T','Flexbone','Wishbone','Wildcat','Double Wing','Single Wing'],
    backfield: ['Single','Split','I','Power','Offset','Strong','Weak','Diamond','Empty'],
    front: ['Maverick','Eagle','Falcon','Jumbo Shift','4-3','3-4','4-4','5-2','5-3','6-2','3-3-5','4-2-5','Nickel','Dime','Quarter','4-6'],
    coverage: ['Cover 0','Cover 1','Cover 2','Cover 3','Cover 4','Cover 5','Cover 6'],
    // `Option` is a built-in offensive play, distinct from `RPO`: an option is a
    // ball-carrier decision after the snap, an RPO a pass-or-run read. Both are
    // AMBIGUOUS for run/pass classification (PlayTagger.runPassForPlayType) and
    // neither joins the run/pass-depth exclusive group, so `Option + Run Outside`
    // is chartable. `QB Run` and `Reverse` are ambiguous the same way (a scramble
    // can begin as a pass, a reverse can throw), so the coach sets Run/Pass. A
    // default a saved library has never listed is shown (see _normalize).
    playType: ['Run Inside','Run Outside','Screen','Short Pass','Medium Pass','Deep Pass','Play Action','RPO','Option','QB Run','Reverse','Trick Play'],
    blitz: ['A-Gap','B-Gap','C-Gap','Edge','DB Blitz','Zone Blitz'],
  };

  constructor({ storage, teamId } = {}) {
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    this.teamId = teamId || (() => {
      try { return this.storage?.getItem('ffa_active_team_id') || 'default'; } catch { return 'default'; }
    });
  }
  _teamId() { return typeof this.teamId === 'function' ? this.teamId() : this.teamId; }
  key() { return `ffa_tag_libraries_${this._teamId()}`; }
  _blank() {
    const groups = {};
    for (const [key, defaults] of Object.entries(TagLibrary.DEFINITIONS)) {
      groups[key] = { custom: [], enabled: defaults.slice(), order: defaults.slice() };
    }
    return { version: TagLibrary.VERSION, groups, presets: [] };
  }
  _read(key) { try { return JSON.parse(this.storage?.getItem(key) || 'null'); } catch { return null; } }
  /** Writes and records why a write failed. It used to swallow every error, so
   *  a full localStorage (QuotaExceededError) surfaced only as a failed readback
   *  and a generic message (installed finding, 2026-09-24). lastError names the
   *  real cause for the caller and the console. */
  _write(state) {
    this.lastError = null;
    if (!this.storage) { this.lastError = { name: 'NoStorage', message: 'No settings storage is available.' }; return false; }
    try { this.storage.setItem(this.key(), JSON.stringify(state)); return true; }
    catch (e) {
      this.lastError = { name: e?.name || 'Error', message: e?.message || String(e), key: this.key() };
      console.error('Charting library write failed', this.lastError);
      return false;
    }
  }
  _normalize(raw) {
    const next = this._blank();
    for (const [key, defaults] of Object.entries(TagLibrary.DEFINITIONS)) {
      const source = raw?.groups?.[key] || {};
      const custom = [...new Set((Array.isArray(source.custom) ? source.custom : []).map(value => String(value).trim()).filter(value => value && !defaults.includes(value)))];
      const values = [...defaults, ...custom];
      const enabledSource = Array.isArray(source.enabled) ? source.enabled : values;
      const savedOrder = Array.isArray(source.order) ? source.order.map(String) : [];
      // `order` lists every value the library has ever offered, hidden or not, so
      // a default it has never listed is new to this coach's library and is shown
      // (a value the coach hid stays listed, and stays hidden). Read only; nothing
      // is written until the next library edit.
      const neverListed = Array.isArray(source.order) ? values.filter(value => !savedOrder.includes(value)) : [];
      const enabled = [...new Set([...enabledSource.map(String), ...neverListed].filter(value => values.includes(value)))];
      const order = [...new Set([...savedOrder.filter(value => values.includes(value)), ...values])];
      next.groups[key] = { custom, enabled, order };
    }
    // A group this version no longer manages is kept exactly as stored and never
    // offered, so an unrelated library edit does not destroy the coach's entries.
    // (A saved library carries them under `retired` after its first edit, and
    // under `groups` before it.)
    const kept = raw?.retired && typeof raw.retired === 'object' && !Array.isArray(raw.retired) ? { ...raw.retired } : {};
    for (const [key, group] of Object.entries(raw?.groups || {})) if (!TagLibrary.DEFINITIONS[key]) kept[key] = group;
    if (Object.keys(kept).length) next.retired = kept;
    const presets = Array.isArray(raw?.presets) ? raw.presets : [];
    next.presets = presets.map((preset, index) => {
      const enabled = {};
      for (const key of Object.keys(TagLibrary.DEFINITIONS)) {
        const values = next.groups[key].order;
        enabled[key] = [...new Set((Array.isArray(preset?.enabled?.[key]) ? preset.enabled[key] : next.groups[key].enabled).map(String).filter(value => values.includes(value)))];
      }
      return {
        id: String(preset?.id || `preset-${index + 1}`),
        name: String(preset?.name || '').trim(),
        unit: ['offense','defense','special'].includes(preset?.unit) ? preset.unit : 'offense',
        mode: preset?.mode === 'scout' ? 'scout' : 'program',
        role: String(preset?.role || 'All staff').trim() || 'All staff',
        enabled,
      };
    }).filter(preset => preset.name);
    return next;
  }
  load() {
    const current = this._read(this.key());
    if (current) return this._normalize(current);
    // Nothing is written on read.
    return this._normalize(this._blank());
  }
  /** A saved custom value reserved for another field (added before the rule
   *  existed) is left in storage untouched and simply never offered. */
  group(key) {
    const state = this.load(), group = state.groups[key];
    if (!group) return { values: [], custom: [], enabled: [] };
    const allowed = value => !TagLibrary.reservedOwner(key, value);
    return { values: group.order.filter(allowed), custom: group.custom.filter(allowed), enabled: group.enabled.filter(allowed) };
  }
  /** The custom entries of the coach's retired one-field Formation list that a
   *  Family can hold and the Family library does not already list: what the
   *  coach may choose to add back, by name. Read only; nothing is added, mapped
   *  or rewritten, and the retired list stays exactly as stored. */
  previousFormations() {
    const retired = this.load().retired?.formation;
    const have = new Set(this.group('formationFamily').values.map(value => value.toLowerCase()));
    const out = [];
    for (const raw of Array.isArray(retired?.custom) ? retired.custom : []) {
      const value = String(raw).trim();
      if (!value || value.includes('+') || TagLibrary.reservedOwner('formationFamily', value)) continue;
      if (have.has(value.toLowerCase()) || out.some(item => item.toLowerCase() === value.toLowerCase())) continue;
      out.push(value);
    }
    return out;
  }
  add(key, value) {
    const state = this.load(), group = state.groups[key], defaults = TagLibrary.DEFINITIONS[key], v = String(value || '').trim();
    this.lastError = null;
    const owner = TagLibrary.reservedOwner(key, v);
    if (owner) { this.lastError = { name: 'ReservedValue', message: `${v} is a ${owner} value.`, owner }; return false; }
    // A Formation Family is one value: "+" joins the values of a multi-select field.
    if (key === 'formationFamily' && v.includes('+')) { this.lastError = { name: 'MultiValue', message: 'A Formation Family is one value; "+" combines values.' }; return false; }
    if (!group || !defaults || !v || defaults.includes(v) || group.custom.includes(v)) return false;
    group.custom.push(v); group.enabled.push(v); group.order.push(v);
    if (!this._write(state)) return false;
    const stored = this._read(this.key())?.groups?.[key]?.custom?.includes(v) === true;
    if (!stored) this.lastError = { name: 'ReadbackMismatch', message: `The saved library does not contain "${v}".`, key: this.key() };
    return stored;
  }
  remove(key, value) {
    const state = this.load(), group = state.groups[key];
    if (!group || !group.custom.includes(value)) return false;
    group.custom = group.custom.filter(item => item !== value);
    group.enabled = group.enabled.filter(item => item !== value);
    group.order = group.order.filter(item => item !== value);
    return this._write(state);
  }
  setEnabled(key, value, enabled) {
    const state = this.load(), group = state.groups[key];
    if (!group || !group.order.includes(value)) return false;
    const has = group.enabled.includes(value);
    if (!!enabled === has) return false;
    group.enabled = enabled ? [...group.enabled, value] : group.enabled.filter(item => item !== value);
    return this._write(state);
  }
  move(key, value, delta) {
    const state = this.load(), group = state.groups[key], step = Number(delta) < 0 ? -1 : 1;
    if (!group) return false;
    const from = group.order.indexOf(value), to = from + step;
    if (from < 0 || to < 0 || to >= group.order.length) return false;
    [group.order[from], group.order[to]] = [group.order[to], group.order[from]];
    return this._write(state);
  }
  presets() { return this.load().presets.map(preset => JSON.parse(JSON.stringify(preset))); }
  savePreset({ name, unit = 'offense', mode = 'program', role = 'All staff' } = {}) {
    const clean = String(name || '').trim();
    if (!clean || !['offense','defense','special'].includes(unit)) return null;
    const state = this.load();
    const preset = {
      id: `preset-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean,
      unit,
      mode: mode === 'scout' ? 'scout' : 'program',
      role: String(role || 'All staff').trim() || 'All staff',
      enabled: Object.fromEntries(Object.entries(state.groups).map(([key, group]) => [key, group.enabled.slice()])),
    };
    state.presets.push(preset);
    return this._write(state) ? JSON.parse(JSON.stringify(preset)) : null;
  }
  applyPreset(id) {
    const state = this.load(), preset = state.presets.find(item => item.id === id);
    if (!preset) return null;
    for (const [key, group] of Object.entries(state.groups)) {
      group.enabled = [...new Set((preset.enabled[key] || []).filter(value => group.order.includes(value)))];
    }
    return this._write(state) ? JSON.parse(JSON.stringify(preset)) : null;
  }
  deletePreset(id) {
    const state = this.load(), before = state.presets.length;
    state.presets = state.presets.filter(item => item.id !== id);
    if (state.presets.length === before) return false;
    return this._write(state);
  }
  restore() {
    const state = this._blank();
    state.presets = this.presets();
    this._write(state);
    return state;
  }
}
