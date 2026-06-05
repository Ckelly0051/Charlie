/**
 * PlayFilter - Filters plays by any combination of criteria.
 */
export class PlayFilter {
  constructor(playTagger) {
    this.tagger = playTagger;
    this.listeners = {};
    this.active = false;

    this.criteria = {
      quarters: [],
      downs: [],
      playTypes: [],
      formations: [],
      personnel: [],
      results: [],
      situation: ''
    };

    this.filterCountEl = document.getElementById('filterCount');
    this.btnClear = document.getElementById('btnClearFilters');

    this._bindEvents();
  }

  _bindEvents() {
    // Quarter checkboxes
    document.querySelectorAll('#filterQuarter input').forEach(cb => {
      cb.addEventListener('change', () => this._updateFromUI());
    });
    // Down checkboxes
    document.querySelectorAll('#filterDown input').forEach(cb => {
      cb.addEventListener('change', () => this._updateFromUI());
    });
    // Multi-selects
    ['filterPlayType', 'filterResult'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this._updateFromUI());
    });
    // Single selects
    ['filterFormation', 'filterPersonnel', 'filterSituation'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.addEventListener('change', () => this._updateFromUI());
    });
    // Clear
    if (this.btnClear) {
      this.btnClear.addEventListener('click', () => this.clearAll());
    }
  }

  _updateFromUI() {
    this.criteria.quarters = this._getChecked('filterQuarter');
    this.criteria.downs = this._getChecked('filterDown');
    this.criteria.playTypes = this._getMultiSelect('filterPlayType');
    this.criteria.results = this._getMultiSelect('filterResult');
    this.criteria.formations = this._getSingleSelect('filterFormation');
    this.criteria.personnel = this._getSingleSelect('filterPersonnel');
    this.criteria.situation = document.getElementById('filterSituation')?.value || '';

    this.active = this.criteria.situation !== '' ||
      [this.criteria.quarters, this.criteria.downs, this.criteria.playTypes,
       this.criteria.formations, this.criteria.personnel, this.criteria.results]
        .some(arr => arr.length > 0);

    this._updateBadge();
    this._emit('filter-changed');
  }

  _getChecked(containerId) {
    const checks = document.querySelectorAll(`#${containerId} input:checked`);
    return Array.from(checks).map(cb => cb.value);
  }

  _getMultiSelect(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    return Array.from(el.selectedOptions).map(o => o.value);
  }

  _getSingleSelect(id) {
    const el = document.getElementById(id);
    if (!el) return [];
    const val = el.value;
    return val ? [val] : [];
  }

  filter(plays) {
    if (!this.active) return plays;
    return plays.filter(p => this._matchesPlay(p));
  }

  _matchesPlay(p) {
    const c = this.criteria;
    const tags = p.tags || {};

    if (c.quarters.length && !c.quarters.includes(tags.quarter)) return false;
    if (c.downs.length && !c.downs.includes(tags.down)) return false;
    if (c.playTypes.length) {
      const playParts = String(tags.playType || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
      if (!c.playTypes.some(t => playParts.includes(t))) return false;
    }
    if (c.formations.length) {
      const playForms = String(tags.formation || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
      if (!c.formations.some(f => playForms.includes(f))) return false;
    }
    if (c.personnel.length && !c.personnel.includes(tags.personnel)) return false;
    if (c.results.length) {
      const playResults = String(tags.result || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean);
      if (!c.results.some(r => playResults.includes(r))) return false;
    }

    if (c.situation) {
      if (!this._matchesSituation(p, c.situation)) return false;
    }

    return true;
  }

  _matchesSituation(p, situation) {
    const tags = p.tags || {};
    const yl = this._absYardLine(tags);

    switch (situation) {
      case 'redzone':
        return yl !== null && yl >= 80;
      case 'goalline':
        return yl !== null && yl >= 95;
      case 'backed-up':
        return yl !== null && yl <= 10;
      case '3rd-long': {
        const dist = parseInt(tags.distance) || 0;
        return tags.down === '3' && dist >= 7;
      }
      case '3rd-short': {
        const dist = parseInt(tags.distance) || 0;
        return tags.down === '3' && dist >= 1 && dist <= 3;
      }
      default:
        return true;
    }
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    const side = tags.fieldSide || 'own';
    return side === 'opp' ? (100 - yl) : yl;
  }

  clearAll() {
    document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(cb => cb.checked = false);
    document.querySelectorAll('#filterPanel select').forEach(sel => sel.value = '');
    this.criteria = { quarters: [], downs: [], playTypes: [], formations: [], personnel: [], results: [], situation: '' };
    this.active = false;
    this._updateBadge();
    this._emit('filter-changed');
  }

  _updateBadge() {
    if (!this.filterCountEl) return;
    const count = [this.criteria.quarters, this.criteria.downs, this.criteria.playTypes,
      this.criteria.formations, this.criteria.personnel, this.criteria.results]
        .reduce((s, a) => s + a.length, 0) + (this.criteria.situation ? 1 : 0);
    this.filterCountEl.textContent = count > 0 ? `${count} active` : 'Off';
    this.filterCountEl.style.color = count > 0 ? 'var(--highlight)' : '';
  }

  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
