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
 */
export class CustomFieldsManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.defs = this._load();

    this.container = document.getElementById('tagCustomFields');   // per-play inputs
    this.section = document.getElementById('customFieldsSection');
    this.btnEdit = document.getElementById('btnEditCustomFields');

    if (this.btnEdit) this.btnEdit.addEventListener('click', () => this.openManager());

    // Re-render per-play inputs whenever the form loads a play.
    this.tagger.on && this.tagger.on('play-selected', () => this.loadValues(this.tagger.getCurrentPlay()));

    this.renderInputs();
  }

  static KEY = 'ffa_custom_fields';

  _load() {
    try { return JSON.parse(localStorage.getItem(CustomFieldsManager.KEY) || '[]') || []; }
    catch { return []; }
  }
  _save() {
    try { localStorage.setItem(CustomFieldsManager.KEY, JSON.stringify(this.defs)); } catch {}
  }
  _uid() { return 'cf_' + Math.random().toString(36).slice(2, 8); }

  /** Render the per-play inputs (chips / text) into the tag form. */
  renderInputs() {
    if (!this.container) return;
    if (!this.defs.length) {
      if (this.section) this.section.classList.add('cf-empty');
      this.container.innerHTML = '';
      return;
    }
    if (this.section) this.section.classList.remove('cf-empty');

    this.container.innerHTML = this.defs.map(d => {
      if (d.options && d.options.length) {
        const chips = d.options.map(o =>
          `<button class="pick" type="button" data-cf="${d.id}" data-value="${this._attr(o)}">${this._esc(o)}</button>`
        ).join('');
        return `<div class="cf-field"><label class="chip-label">${this._esc(d.name)}</label>
          <div class="pick-group cf-picks" data-cf-group="${d.id}">${chips}</div></div>`;
      }
      return `<div class="cf-field"><label class="chip-label">${this._esc(d.name)}</label>
        <input type="text" class="cf-text" data-cf="${d.id}" placeholder="${this._attr(d.name)}…"></div>`;
    }).join('');

    // Wire chip toggles
    this.container.querySelectorAll('.cf-picks .pick').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.dataset.cf;
        const group = btn.parentElement;
        const wasActive = btn.classList.contains('active');
        group.querySelectorAll('.pick').forEach(b => b.classList.remove('active'));
        if (!wasActive) btn.classList.add('active');
        this._write(id, wasActive ? '' : btn.dataset.value);
      });
    });
    // Wire text inputs
    this.container.querySelectorAll('.cf-text').forEach(inp => {
      inp.addEventListener('change', () => this._write(inp.dataset.cf, inp.value.trim()));
    });

    this.loadValues(this.tagger.getCurrentPlay && this.tagger.getCurrentPlay());
  }

  /** Reflect a play's stored custom values into the inputs. */
  loadValues(play) {
    if (!this.container) return;
    const vals = (play && play.tags && play.tags.customFields) || {};
    this.container.querySelectorAll('.cf-picks').forEach(group => {
      const id = group.dataset.cfGroup;
      const v = vals[id] || '';
      group.querySelectorAll('.pick').forEach(b => b.classList.toggle('active', b.dataset.value === v));
    });
    this.container.querySelectorAll('.cf-text').forEach(inp => {
      inp.value = vals[inp.dataset.cf] || '';
    });
  }

  _write(id, value) {
    const play = this.tagger.getCurrentPlay && this.tagger.getCurrentPlay();
    if (!play) return;
    if (!play.tags.customFields) play.tags.customFields = {};
    if (value) play.tags.customFields[id] = value;
    else delete play.tags.customFields[id];
    this.tagger._emit && this.tagger._emit('play-updated', play);
  }

  // --- Field definition manager (modal) ---------------------------------
  openManager() {
    const prev = document.getElementById('cfManagerModal');
    if (prev) prev.remove();
    const overlay = document.createElement('div');
    overlay.className = 'ffa-confirm-modal';
    overlay.id = 'cfManagerModal';
    overlay.innerHTML = `
      <div class="ffa-confirm-backdrop"></div>
      <div class="ffa-confirm-card cf-manager" role="dialog" aria-modal="true">
        <h3 class="cf-mgr-title">Custom Tag Fields</h3>
        <p class="cf-mgr-help">Add your own categories. Leave options blank for a free-text field, or
          comma-separate options for tap-to-pick chips (e.g. <em>MOFO, MOFC</em>).</p>
        <div class="cf-mgr-list"></div>
        <button type="button" class="btn btn-sm cf-add">+ Add field</button>
        <div class="ffa-confirm-actions">
          <button type="button" class="btn btn-sm" data-act="cancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-accent" data-act="save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const listEl = overlay.querySelector('.cf-mgr-list');
    const draft = this.defs.map(d => ({ id: d.id, name: d.name, options: (d.options || []).join(', ') }));

    const renderList = () => {
      listEl.innerHTML = draft.map((d, i) => `
        <div class="cf-mgr-row" data-i="${i}">
          <input type="text" class="cf-mgr-name" placeholder="Field name" value="${this._attr(d.name)}">
          <input type="text" class="cf-mgr-opts" placeholder="Options (comma-separated) or blank for text" value="${this._attr(d.options)}">
          <button type="button" class="btn btn-sm btn-danger cf-mgr-del" title="Remove">×</button>
        </div>`).join('') || '<p class="cf-mgr-empty">No custom fields yet.</p>';
      listEl.querySelectorAll('.cf-mgr-row').forEach(row => {
        const i = +row.dataset.i;
        row.querySelector('.cf-mgr-name').addEventListener('input', e => draft[i].name = e.target.value);
        row.querySelector('.cf-mgr-opts').addEventListener('input', e => draft[i].options = e.target.value);
        row.querySelector('.cf-mgr-del').addEventListener('click', () => { draft.splice(i, 1); renderList(); });
      });
    };
    renderList();

    overlay.querySelector('.cf-add').addEventListener('click', () => {
      draft.push({ id: this._uid(), name: '', options: '' });
      renderList();
    });

    const close = () => overlay.remove();
    overlay.addEventListener('click', (e) => {
      const act = e.target.dataset ? e.target.dataset.act : null;
      if (act === 'cancel' || e.target.classList.contains('ffa-confirm-backdrop')) close();
      else if (act === 'save') {
        this.defs = draft
          .map(d => ({
            id: d.id || this._uid(),
            name: (d.name || '').trim(),
            options: (d.options || '').split(',').map(s => s.trim()).filter(Boolean)
          }))
          .filter(d => d.name);
        this._save();
        this.renderInputs();
        close();
      }
    });
  }

  _esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
  _attr(s) { return String(s == null ? '' : s).replace(/"/g, '&quot;'); }
}
