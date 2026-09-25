/** Per-team charting vocabulary. Visibility and ordering change controls, never stored tags. */
export class TagLibrary {
  static VERSION = 4;
  static DEFINITIONS = {
    // Classification-critical fields (down, result, run/pass, QB alignment,
    // coverage family, strength and direction) intentionally remain fixed.
    formation: ['Single Wing','Double Wing','Wing-T','Flexbone','Wishbone','Spread','Wildcat','Unbalanced','Goal Line','I-Form','Split Back','Power-I','Ace','Victory','Trips','Twins','Doubles','Bunch'],
    backfield: ['Single','Split','I','Power','Offset','Strong','Weak','Diamond','Empty'],
    front: ['Maverick','Eagle','Falcon','Jumbo Shift','4-3','3-4','4-4','5-2','5-3','6-2','3-3-5','4-2-5','Nickel','Dime','Quarter','4-6'],
    coverage: ['Cover 0','Cover 1','Cover 2','Cover 3','Cover 4','Cover 5','Cover 6'],
    // `Option` is a built-in offensive play, distinct from `RPO`: an option is a
    // ball-carrier decision after the snap, an RPO a pass-or-run read. Both are
    // AMBIGUOUS for run/pass classification (PlayTagger.runPassForPlayType) and
    // neither joins the run/pass-depth exclusive group, so `Option + Run Outside`
    // is chartable. Added as a default at VERSION 4 — see load()'s migration,
    // which pushes it into every existing team's enabled list.
    playType: ['Run Inside','Run Outside','Screen','Short Pass','Medium Pass','Deep Pass','Play Action','RPO','Option','Trick Play'],
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
  legacyKey() { return `ffa_custom_chips_${this._teamId()}`; }
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
  _remove(key) { try { this.storage?.removeItem(key); } catch {} }
  _normalize(raw) {
    const next = this._blank();
    for (const [key, defaults] of Object.entries(TagLibrary.DEFINITIONS)) {
      const source = raw?.groups?.[key] || {};
      const custom = [...new Set((Array.isArray(source.custom) ? source.custom : []).map(value => String(value).trim()).filter(value => value && !defaults.includes(value)))];
      const values = [...defaults, ...custom];
      const enabledSource = Array.isArray(source.enabled) ? source.enabled : values;
      const enabled = [...new Set(enabledSource.map(String).filter(value => values.includes(value)))];
      const storedVersion = Number(raw?.version) || 1;
      if (storedVersion < 2 && key === 'formation') {
        for (const added of ['I-Form','Split Back']) if (!enabled.includes(added)) enabled.push(added);
      }
      // A new DEFAULT is filtered out of a saved `enabled` array (it was not a
      // value when that array was written), so without this every existing team
      // would get the choice hidden. Same shape as the version-2 formation
      // migration above; visibility only, never a stored tag.
      if (storedVersion < 4 && key === 'playType') {
        for (const added of ['Option']) if (!enabled.includes(added)) enabled.push(added);
      }
      const savedOrder = Array.isArray(source.order) ? source.order.map(String).filter(value => values.includes(value)) : [];
      const order = [...new Set([...savedOrder, ...values])];
      next.groups[key] = { custom, enabled, order };
    }
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
    const legacy = this._read(this.legacyKey()) || {};
    const migrated = this._blank();
    for (const key of ['formation','backfield']) {
      const defaults = TagLibrary.DEFINITIONS[key];
      migrated.groups[key].custom = [...new Set((legacy[key] || []).map(value => String(value).trim()).filter(value => value && !defaults.includes(value)))];
      migrated.groups[key].enabled.push(...migrated.groups[key].custom);
      migrated.groups[key].order.push(...migrated.groups[key].custom);
    }
    const state = this._normalize(migrated);
    // Only drop the legacy key once the migrated library is actually stored.
    if (this._write(state)) this._remove(this.legacyKey());
    return state;
  }
  group(key) {
    const state = this.load(), group = state.groups[key];
    return group ? { values: group.order.slice(), custom: group.custom.slice(), enabled: group.enabled.slice() } : { values: [], custom: [], enabled: [] };
  }
  add(key, value) {
    const state = this.load(), group = state.groups[key], defaults = TagLibrary.DEFINITIONS[key], v = String(value || '').trim();
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
