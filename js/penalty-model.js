/** Pure structured-penalty contract. No DOM or storage dependencies. */
export class PenaltyModel {
  static TEAMS = new Set(['subject', 'opponent', 'unknown']);
  static PHASES = new Set(['offense', 'defense', 'special', 'deadBall', 'unknown']);
  static DISPOSITIONS = new Set(['accepted', 'declined', 'offsetting', 'unknown']);

  static _id() { return `pen_${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`; }
  static _choice(value, set, fallback = 'unknown') { return set.has(value) ? value : fallback; }
  static _text(value) { return typeof value === 'string' ? value : ''; }
  static _tri(value) { return value === true || value === false ? value : null; }
  static _yards(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }

  static normalizePenalty(value, used = new Set()) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    let id = this._text(value.id);
    if (!id || used.has(id)) id = this._id();
    used.add(id);
    return {
      ...value,
      id,
      team: this._choice(value.team, this.TEAMS),
      phase: this._choice(value.phase, this.PHASES),
      foul: this._text(value.foul),
      disposition: this._choice(value.disposition, this.DISPOSITIONS),
      yards: this._yards(value.yards),
      playCounts: this._tri(value.playCounts),
      player: this._text(value.player),
      automaticFirstDown: this._tri(value.automaticFirstDown),
      lossOfDown: this._tri(value.lossOfDown),
      notes: this._text(value.notes),
      legacy: value.legacy === true,
    };
  }

  static normalizeList(value) {
    if (!Array.isArray(value)) return [];
    const used = new Set();
    return value.map(item => this.normalizePenalty(item, used)).filter(Boolean);
  }

  static normalizeSituation(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const down = ['1','2','3','4'].includes(String(value.down)) ? String(value.down) : '';
    const distance = this._text(value.distance);
    const fieldSide = value.fieldSide === 'own' || value.fieldSide === 'opp' ? value.fieldSide : '';
    const yardLine = this._text(value.yardLine);
    return { ...value, down, distance, fieldSide, yardLine, confirmed: value.confirmed === true };
  }

  static normalizePlay(play) {
    if (!play || typeof play !== 'object') return [];
    if (Object.prototype.hasOwnProperty.call(play, 'penalties')) play.penalties = this.normalizeList(play.penalties);
    if (Object.prototype.hasOwnProperty.call(play, 'resultingSituation')) {
      const situation = this.normalizeSituation(play.resultingSituation);
      if (situation) play.resultingSituation = situation;
    }
    return Array.isArray(play.penalties) ? play.penalties : [];
  }

  static confirmedSituation(play) {
    const situation = this.normalizeSituation(play?.resultingSituation);
    if (!situation?.confirmed || !situation.down || !situation.distance || !situation.fieldSide || !situation.yardLine) return null;
    return situation;
  }

  static summarize(plays) {
    const records = [];
    let flaggedPlays = 0;
    for (const play of plays || []) {
      const penalties = this.normalizeList(play?.penalties);
      if (penalties.length) flaggedPlays++;
      penalties.forEach(penalty => records.push({ play, penalty }));
    }
    const accepted = records.filter(row => row.penalty.disposition === 'accepted');
    const yards = team => accepted.filter(row => row.penalty.team === team).reduce((sum, row) => sum + (row.penalty.yards || 0), 0);
    return {
      flaggedPlays,
      fouls: records.length,
      accepted: accepted.length,
      declined: records.filter(row => row.penalty.disposition === 'declined').length,
      offsetting: records.filter(row => row.penalty.disposition === 'offsetting').length,
      incomplete: records.filter(row => row.penalty.disposition === 'unknown' || row.penalty.team === 'unknown' || !row.penalty.foul).length,
      subjectYards: yards('subject'),
      opponentYards: yards('opponent'),
      records,
      hasData: records.length > 0,
    };
  }
}
