/** Team-scoped editor for the charting choices exposed by CustomChips. */
export class TagLibrarySettings {
  static GROUPS = [
    { key: 'formation', label: 'Formations', singular: 'formation', placeholder: 'e.g. Trey' },
    { key: 'backfield', label: 'Backfields', singular: 'backfield', placeholder: 'e.g. Ace' },
    { key: 'front', label: 'Fronts', singular: 'front', placeholder: 'e.g. Bear' },
  ];

  constructor(customChips, tagger) {
    this.customChips = customChips;
    this.tagger = tagger;
    this.activeKey = 'formation';
    this.dialog = this._build();
    document.getElementById('btnTagLibraries')?.addEventListener('click', () => this.open());
  }

  _build() {
    const dialog = document.createElement('dialog');
    dialog.className = 'tag-library-dialog';
    dialog.id = 'tagLibraryDialog';
    dialog.setAttribute('aria-labelledby', 'tagLibraryTitle');
    dialog.innerHTML = `
      <div class="tag-library-head">
        <div><span class="tag-library-eyebrow">Team settings</span><h2 id="tagLibraryTitle">Tag libraries</h2></div>
        <button class="tag-library-close" type="button" data-action="close" aria-label="Close tag libraries" title="Close">&times;</button>
      </div>
      <p class="tag-library-promise">Hidden choices disappear from charting. Existing plays and analytics stay unchanged.</p>
      <div class="tag-library-tabs" role="tablist" aria-label="Tag library">
        ${TagLibrarySettings.GROUPS.map((g, i) => `<button type="button" role="tab" data-group="${g.key}" aria-selected="${i === 0}">${g.label}</button>`).join('')}
      </div>
      <div class="tag-library-content"></div>
      <div class="tag-library-foot">
        <button class="btn btn-sm" type="button" data-action="restore">Restore defaults</button>
        <button class="btn btn-sm btn-accent" type="button" data-action="close">Done</button>
      </div>`;
    document.body.appendChild(dialog);
    dialog.addEventListener('click', event => this._click(event));
    dialog.addEventListener('change', event => this._change(event));
    dialog.addEventListener('submit', event => this._submit(event));
    dialog.addEventListener('click', event => { if (event.target === dialog) dialog.close(); });
    return dialog;
  }

  open() {
    this.render();
    this.dialog.showModal();
  }

  render() {
    const config = TagLibrarySettings.GROUPS.find(g => g.key === this.activeKey);
    const group = this.customChips.library.group(config.key);
    const custom = new Set(group.custom);
    const enabled = new Set(group.enabled);
    this.dialog.querySelectorAll('[role="tab"]').forEach(tab => tab.setAttribute('aria-selected', String(tab.dataset.group === config.key)));
    this.dialog.querySelector('.tag-library-content').innerHTML = `
      <div class="tag-library-summary"><strong>${enabled.size} shown</strong><span>${group.values.length - enabled.size} hidden</span></div>
      <div class="tag-library-list">
        ${group.values.map(value => `<div class="tag-library-row">
          <label><input type="checkbox" data-value="${this._esc(value)}" ${enabled.has(value) ? 'checked' : ''}><span>${this._esc(value)}</span></label>
          ${custom.has(value) ? `<button type="button" class="tag-library-remove" data-remove="${this._esc(value)}" aria-label="Remove ${this._esc(value)}" title="Remove custom choice">&times;</button>` : '<span class="tag-library-default">Default</span>'}
        </div>`).join('')}
      </div>
      <form class="tag-library-add">
        <label for="tagLibraryAdd">Add custom ${config.singular}</label>
        <div><input id="tagLibraryAdd" name="value" maxlength="40" autocomplete="off" placeholder="${config.placeholder}"><button class="btn btn-sm btn-accent" type="submit">Add</button></div>
      </form>`;
  }

  async _click(event) {
    const tab = event.target.closest('[data-group]');
    if (tab) { this.activeKey = tab.dataset.group; this.render(); return; }
    if (event.target.closest('[data-action="close"]')) { this.dialog.close(); return; }
    if (event.target.closest('[data-action="restore"]')) {
      const ok = await this.tagger._confirmDialog('Restore the default tag libraries? Custom choices will be removed, but existing plays stay unchanged.', 'Restore');
      if (ok) { this.customChips.restoreDefaults(); this.render(); this._toast('TAG LIBRARIES RESTORED'); }
      return;
    }
    const remove = event.target.closest('[data-remove]');
    if (!remove) return;
    const value = remove.dataset.remove;
    const ok = await this.tagger._confirmDialog(`Remove "${value}" from charting choices? Existing plays tagged with it stay unchanged.`, 'Remove');
    if (!ok) return;
    this.customChips.library.remove(this.activeKey, value);
    this.customChips.reload();
    this.render();
    this._toast(`${value.toUpperCase()} REMOVED`);
  }

  _change(event) {
    const input = event.target.closest('input[type="checkbox"][data-value]');
    if (!input) return;
    this.customChips.setEnabled(this.activeKey, input.dataset.value, input.checked);
    this.render();
  }

  _submit(event) {
    if (!event.target.matches('.tag-library-add')) return;
    event.preventDefault();
    const input = event.target.elements.value;
    const value = input.value.trim();
    if (!value) { input.focus(); return; }
    const group = this.customChips.library.group(this.activeKey);
    if (group.values.some(item => item.toLowerCase() === value.toLowerCase())) {
      this._toast(`${value.toUpperCase()} ALREADY EXISTS`);
      input.select();
      return;
    }
    if (!this.customChips.library.add(this.activeKey, value)) return;
    this.customChips.reload();
    this.render();
    this.dialog.querySelector('#tagLibraryAdd')?.focus();
    this._toast(`${value.toUpperCase()} ADDED`);
  }

  _toast(message) { if (this.tagger.toast) this.tagger.toast(message); }
  _esc(value) { const span = document.createElement('span'); span.textContent = String(value); return span.innerHTML; }
}
