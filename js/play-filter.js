/**
 * PlayFilter - Filters plays by any combination of criteria.
 */
import { StatsEngine } from './stats-engine.js';

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
      // E3b: this filter FEEDS the cut-up exporter, so it must select the SAME
      // plays analytics does — read the PROJECTED structural formation. A raw read
      // would match a legacy alignment token ("Shotgun") that is no longer a
      // formation, diverging the coach's film set from every report.
      const playForms = StatsEngine.splitFormations(StatsEngine.proj(p).formation);
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

  clearAll() { this.setCriteria({}); }

  /** DOM-independent state seam used by native Cut-up settings. */
  snapshot() {
    return {
      ...this.criteria,
      quarters: [...this.criteria.quarters],
      downs: [...this.criteria.downs],
      playTypes: [...this.criteria.playTypes],
      formations: [...this.criteria.formations],
      personnel: [...this.criteria.personnel],
      results: [...this.criteria.results],
    };
  }

  setCriteria(next = {}) {
    const list = key => Array.isArray(next[key]) ? [...new Set(next[key].map(String).filter(Boolean))] : [];
    this.criteria = {
      quarters: list('quarters'),
      downs: list('downs'),
      playTypes: list('playTypes'),
      formations: list('formations'),
      personnel: list('personnel'),
      results: list('results'),
      situation: String(next.situation || ''),
    };
    this.active = this.criteria.situation !== '' ||
      [this.criteria.quarters, this.criteria.downs, this.criteria.playTypes,
       this.criteria.formations, this.criteria.personnel, this.criteria.results]
        .some(values => values.length > 0);
    this._emit('filter-changed');
    return this.snapshot();
  }


  on(event, callback) {
    if (!this.listeners[event]) this.listeners[event] = [];
    this.listeners[event].push(callback);
  }

  _emit(event, data) {
    (this.listeners[event] || []).forEach(cb => cb(data));
  }
}
