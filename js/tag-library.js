/** Per-team charting vocabulary. Visibility changes controls, never stored tags. */
export class TagLibrary {
  static VERSION = 1;
  static DEFINITIONS = {
    // E4: Under Center/Pistol/Shotgun removed — they are QB Alignment, not
    // Formation structure (E1 decision; #tagQbAlignment is their new home, not a
    // TagLibrary-customizable group since the three values are fixed, not team
    // vocabulary).
    // E4-2: 'Empty' removed from Formation — it's a backfield concept (no
    // running back), and Backfield already has its own 'Empty' chip as the
    // correct home; TagProjection.PROJECTED_PAIRS now registers Formation ->
    // Backfield so this move is read-time-safe (legacy plays project it out
    // correctly, nothing is migrated). 'Pistol' removed from Backfield — it's
    // QB alignment, not a back alignment; QB Alignment already has its own
    // 'Pistol' chip, and PROJECTED_PAIRS now also registers Backfield ->
    // QB Alignment for the same reason.
    formation: ['Single Wing','Double Wing','Wing-T','Flexbone','Wishbone','Spread','Wildcat','Unbalanced','Goal Line','Power-I','Ace','Victory','Trips','Twins','Doubles','Bunch'],
    backfield: ['Single','Split','I','Power','Offset','Strong','Weak','Diamond','Empty'],
    front: ['Maverick','Eagle','Falcon','Jumbo Shift','4-3','3-4','4-4','5-2','5-3','6-2','3-3-5','4-2-5','Nickel','Dime','Quarter','4-6'],
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
    for (const [key, defaults] of Object.entries(TagLibrary.DEFINITIONS)) groups[key] = { custom: [], enabled: defaults.slice() };
    return { version: TagLibrary.VERSION, groups };
  }
  _read(key) { try { return JSON.parse(this.storage?.getItem(key) || 'null'); } catch { return null; } }
  _write(state) { try { this.storage?.setItem(this.key(), JSON.stringify(state)); } catch {} return state; }
  _remove(key) { try { this.storage?.removeItem(key); } catch {} }
  _normalize(raw) {
    const next = this._blank();
    for (const [key, defaults] of Object.entries(TagLibrary.DEFINITIONS)) {
      const source = raw?.groups?.[key] || {};
      const custom = [...new Set((Array.isArray(source.custom) ? source.custom : []).map(value => String(value).trim()).filter(value => value && !defaults.includes(value)))];
      const values = [...defaults, ...custom];
      const enabledSource = Array.isArray(source.enabled) ? source.enabled : values;
      next.groups[key] = { custom, enabled: [...new Set(enabledSource.map(String).filter(value => values.includes(value)))] };
    }
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
    }
    const state = this._write(this._normalize(migrated));
    this._remove(this.legacyKey());
    return state;
  }
  group(key) { const defaults = TagLibrary.DEFINITIONS[key], state = this.load(), group = state.groups[key]; return defaults && group ? { values: [...defaults, ...group.custom], custom: group.custom.slice(), enabled: group.enabled.slice() } : { values: [], custom: [], enabled: [] }; }
  add(key, value) {
    const state = this.load(), group = state.groups[key], defaults = TagLibrary.DEFINITIONS[key], v = String(value || '').trim();
    if (!group || !defaults || !v || defaults.includes(v) || group.custom.includes(v)) return false;
    group.custom.push(v); group.enabled.push(v); this._write(state); return true;
  }
  remove(key, value) {
    const state = this.load(), group = state.groups[key];
    if (!group || !group.custom.includes(value)) return false;
    group.custom = group.custom.filter(item => item !== value);
    group.enabled = group.enabled.filter(item => item !== value);
    this._write(state); return true;
  }
  setEnabled(key, value, enabled) {
    const state = this.load(), group = state.groups[key];
    if (!group || !this.group(key).values.includes(value)) return false;
    const has = group.enabled.includes(value);
    if (!!enabled === has) return false;
    group.enabled = enabled ? [...group.enabled, value] : group.enabled.filter(item => item !== value);
    this._write(state); return true;
  }
  replaceCustom(data = {}) {
    const state = this.load();
    for (const key of Object.keys(TagLibrary.DEFINITIONS)) {
      const defaults = TagLibrary.DEFINITIONS[key], prior = state.groups[key];
      const custom = [...new Set((data[key] || []).map(value => String(value).trim()).filter(value => value && !defaults.includes(value)))];
      prior.custom = custom;
      prior.enabled = [...new Set([...prior.enabled.filter(value => defaults.includes(value)), ...custom])];
    }
    return this._write(state);
  }
  restore() { return this._write(this._blank()); }
}
