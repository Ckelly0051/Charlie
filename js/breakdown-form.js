/**
 * Opt-in composition layer for the production tag form. It moves no controls
 * and owns no tag state; existing PlayTagger fields remain the only data path.
 */
export class BreakdownForm {
  static FLAG = 'ffa_breakdown_form_v2';
  static SECTIONS = [
    { before: '.tag-side-groups', key: 'look', title: 'Pre-snap look', detail: 'formation, personnel, structure' },
    { before: '.core-hide-st', key: 'play', title: 'Play & result', detail: 'call, direction, outcome' },
    { before: '#tagPlayersSection', key: 'people', title: 'Players & grades', detail: 'individual performance' },
    { before: '.tag-notes', key: 'notes', title: 'Notes & details', detail: 'staff context and field position' },
  ];

  constructor(tagger, { storage } = {}) {
    this.tagger = tagger;
    this.form = tagger.tagForm;
    this.storage = storage || (typeof localStorage !== 'undefined' ? localStorage : null);
    if (!this.form || !this.enabled()) return;
    this.mount();
  }

  enabled() { try { return this.storage?.getItem(BreakdownForm.FLAG) === '1'; } catch { return false; } }

  mount() {
    if (this.form.classList.contains('breakdown-form-v2')) return;
    this.form.classList.add('breakdown-form-v2');
    this._addHeader();
    this._addSectionLabels();
    this._syncPerspective();
    this.observer = new MutationObserver(records => {
      if (records.some(record => record.attributeName === 'class')) this._syncPerspective();
    });
    this.observer.observe(this.form, { attributes: true, attributeFilter: ['class'] });
  }

  _addHeader() {
    const unit = this.form.querySelector('.unit-toggle-section');
    if (!unit) return;
    const header = document.createElement('div');
    header.className = 'bdv-head';
    header.innerHTML = '<div><span>Charting view</span><strong id="bdvPerspective">Offensive self-scout</strong><small>No tag is required</small></div>';
    unit.insertAdjacentElement('afterend', header);
  }

  _addSectionLabels() {
    for (const section of BreakdownForm.SECTIONS) {
      const target = this.form.querySelector(section.before);
      if (!target || this.form.querySelector(`[data-bdv-section="${section.key}"]`)) continue;
      const label = document.createElement('div');
      label.className = 'bdv-section-label';
      label.dataset.bdvSection = section.key;
      label.innerHTML = `<strong>${section.title}</strong><span>${section.detail}</span>`;
      target.insertAdjacentElement('beforebegin', label);
    }
  }

  _syncPerspective() {
    const unit = this.form.classList.contains('mode-defense') ? 'defense' : this.form.classList.contains('mode-special') ? 'special' : 'offense';
    const scout = this.form.classList.contains('is-scout');
    const subject = scout ? 'Opponent' : 'Our';
    const offense = this.form.querySelector('.group-offense .tag-group-head');
    const defense = this.form.querySelector('.group-defense .tag-group-head');
    const special = this.form.querySelector('.group-special .tag-group-head');
    this._label(offense, unit === 'defense' ? 'Offense Faced' : `${subject} Offensive Look`);
    this._label(defense, unit === 'offense' ? 'Defense Faced' : `${subject} Defensive Call`);
    this._label(special, `${subject} Special Teams`);
    const perspective = this.form.querySelector('#bdvPerspective');
    if (perspective) perspective.textContent = `${scout ? 'Opponent scout' : 'Self-scout'} · ${unit === 'special' ? 'Special Teams' : unit[0].toUpperCase() + unit.slice(1)}`;
    const look = this.form.querySelector('[data-bdv-section="look"] strong');
    if (look) look.textContent = unit === 'special' ? `${subject} Special Teams` : unit === 'defense' ? `${subject} Defensive Call` : `${subject} Offensive Look`;
  }

  _label(button, text) {
    if (!button) return;
    const caret = button.querySelector('.tag-group-caret');
    for (const node of [...button.childNodes]) if (node !== caret) node.remove();
    button.insertBefore(document.createTextNode(text), caret || null);
  }
}
