/**
 * CustomChips — lets a coach add their own Formation & Backfield chips.
 *
 * Scoped to the ACTIVE TEAM (localStorage `ffa_custom_chips_<teamId>`), the way
 * the roster is — a team's formation vocabulary is part of its identity, and a
 * JV vs Varsity staff keep their own. Custom chips are injected as first-class
 * `.pick` buttons and registered with the group's ChipField, so:
 *   - keyboard tagging + click behave exactly like built-in chips,
 *   - the Film Room grid editor picks them up (it reads options live from the
 *     DOM: `#tagFormation .pick`), and
 *   - every analytic works unchanged (formation splits on " + ", backfield is a
 *     plain string) — a custom value is just another value.
 *
 * Removing a custom chip only drops the affordance; plays already tagged with
 * that value keep it (same as any tag value the coach later stops using).
 */
export class CustomChips {
  static GROUPS = [
    { key: 'formation', groupId: 'tagFormation', field: 'formation', label: 'formation' },
    { key: 'backfield', groupId: 'tagBackfield', field: 'backfield', label: 'backfield' },
  ];

  constructor(tagger) {
    this.tagger = tagger;
    this.groups = [];
    for (const g of CustomChips.GROUPS) this._initGroup({ ...g });
  }

  // ---- storage (per active team) ----
  _teamId() {
    try { return localStorage.getItem('ffa_active_team_id') || 'default'; } catch (e) { return 'default'; }
  }
  _key() { return 'ffa_custom_chips_' + this._teamId(); }
  _load() {
    try { return JSON.parse(localStorage.getItem(this._key()) || '{}') || {}; } catch (e) { return {}; }
  }
  _save(data) { try { localStorage.setItem(this._key(), JSON.stringify(data)); } catch (e) {} }

  // ---- setup ----
  _initGroup(g) {
    g.groupEl = document.getElementById(g.groupId);
    g.fieldObj = this.tagger.tagFields && this.tagger.tagFields[g.field];
    if (!g.groupEl || !g.fieldObj || !g.fieldObj.registerChip) return;
    // "+ Add" affordance. Not a [data-value] chip, so ChipField ignores it.
    const add = document.createElement('button');
    add.type = 'button';
    add.className = 'pick pick-add';
    add.title = `Add a custom ${g.label} chip`;
    add.setAttribute('aria-label', `Add a custom ${g.label} chip`);
    add.textContent = '+';
    add.addEventListener('click', (e) => { e.preventDefault(); this._promptAdd(g); });
    g.groupEl.appendChild(add);
    g.addBtn = add;
    g.customBtns = [];
    this.groups.push(g);
    this._injectSaved(g);
  }

  _injectSaved(g) {
    for (const v of (this._load()[g.key] || [])) this._injectChip(g, v);
  }

  /** True if a chip with this value already exists in the group (built-in or custom). */
  _exists(g, v) {
    return [...g.groupEl.querySelectorAll('.pick[data-value]')].some(c => c.dataset.value === v);
  }

  _injectChip(g, value) {
    const v = String(value || '').trim();
    if (!v || this._exists(g, v)) return null;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'pick pick-custom';
    btn.dataset.value = v;
    btn.dataset.custom = '1';
    btn.appendChild(document.createTextNode(v));   // safe text (no innerHTML)
    // × remove — only on custom chips. stopPropagation so it doesn't toggle.
    const x = document.createElement('span');
    x.className = 'pick-x';
    x.textContent = '×';
    x.title = 'Remove this custom chip';
    x.addEventListener('click', (e) => { e.preventDefault(); e.stopPropagation(); this._remove(g, v, btn); });
    btn.appendChild(x);
    g.groupEl.insertBefore(btn, g.addBtn);      // keep the +Add button last
    g.fieldObj.registerChip(btn);
    g.customBtns.push(btn);
    return btn;
  }

  async _promptAdd(g) {
    let name = '';
    try {
      name = ((await this.tagger._promptDialog(`Add a custom ${g.label} chip`, 'Add', `e.g. ${g.key === 'formation' ? 'Trey' : 'Ace'}`)) || '').trim();
    } catch (e) { return; }
    if (!name) return;
    if (this._exists(g, name)) { this.tagger.toast && this.tagger.toast(`"${name}" already exists`); return; }
    this._injectChip(g, name);
    const data = this._load();
    data[g.key] = [...(data[g.key] || []), name];
    this._save(data);
    this._clearGridCache();
    this.tagger.toast && this.tagger.toast(`Added ${g.label}: ${name}`);
  }

  _remove(g, value, btn) {
    const data = this._load();
    data[g.key] = (data[g.key] || []).filter(x => x !== value);
    this._save(data);
    g.fieldObj.unregisterChip(btn);
    btn.remove();
    g.customBtns = g.customBtns.filter(b => b !== btn);
    this._clearGridCache();
  }

  /** Re-render all custom chips for the CURRENT active team — call after a team
   *  switch so the tag form shows that team's vocabulary, not the last one's. */
  reload() {
    for (const g of this.groups) {
      for (const b of g.customBtns) { g.fieldObj.unregisterChip(b); b.remove(); }
      g.customBtns = [];
      this._injectSaved(g);
    }
    this._clearGridCache();
  }

  _clearGridCache() {
    try { if (window.app && window.app.playGrid) window.app.playGrid._optionCache = {}; } catch (e) {}
  }
}
