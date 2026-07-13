/**
 * Pure Phase 4E special-teams contract. No DOM, storage, or app dependencies.
 * Legacy fields are intentionally outside this model and are never migrated.
 */
export class SpecialTeamsModel {
  static VERSION = 1;
  static ROLES = Object.freeze({
    kickoff: 'kicking',
    kickoffReturn: 'receiving',
    punt: 'kicking',
    puntReturn: 'receiving',
    fieldGoal: 'attempting',
    fieldGoalBlock: 'defending',
  });
  static STATUSES = new Set([
    'returned', 'touchback', 'fairCatch', 'downed', 'outOfBounds',
    'blocked', 'muffed', 'recovered', 'good', 'noGood', 'badSnap',
  ]);
  static SCORES = new Set(['touchdown', 'fieldGoal', 'extraPoint', 'safety']);
  static TEAMS = new Set(['subject', 'opponent', 'unknown']);

  static _object(value) { return value && typeof value === 'object' && !Array.isArray(value) ? value : {}; }
  static _text(value) { return typeof value === 'string' ? value : ''; }
  static _choice(value, choices) { return choices.has(value) ? value : null; }
  static _tri(value) { return value === true || value === false ? value : null; }
  static _number(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) && n >= 0 ? n : null;
  }
  static _signedNumber(value) {
    if (value === '' || value == null) return null;
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  }
  static _spot(value) {
    const v = this._object(value);
    return {
      ...v,
      fieldSide: v.fieldSide === 'own' || v.fieldSide === 'opp' ? v.fieldSide : '',
      yardLine: this._text(v.yardLine),
    };
  }

  /** Return a normalized copy, or null when this is not a valid structured event. */
  static normalize(value) {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
    const role = this.ROLES[value.unit];
    if (!role) return null;
    const kick = this._object(value.kick);
    const ret = this._object(value.return);
    const outcome = this._object(value.outcome);
    const players = this._object(value.players);
    return {
      ...value,
      version: this.VERSION,
      unit: value.unit,
      subjectRole: role,
      attemptType: value.attemptType === 'fieldGoal' || value.attemptType === 'extraPoint' ? value.attemptType : null,
      kick: {
        ...kick,
        kind: this._text(kick.kind),
        direction: ['Left', 'Middle', 'Right'].includes(kick.direction) ? kick.direction : '',
        distance: this._number(kick.distance),
        hangTime: this._number(kick.hangTime),
        landing: this._spot(kick.landing),
        operationTime: this._number(kick.operationTime),
      },
      return: {
        ...ret,
        attempted: this._tri(ret.attempted),
        yards: this._signedNumber(ret.yards),
        end: this._spot(ret.end),
      },
      outcome: {
        ...outcome,
        status: this._choice(outcome.status, this.STATUSES),
        recoveredBy: this._choice(outcome.recoveredBy, this.TEAMS),
        score: this._choice(outcome.score, this.SCORES),
        scoredBy: this._choice(outcome.scoredBy, this.TEAMS),
      },
      isOnside: value.isOnside === true,
      isFake: value.isFake === true,
      players: {
        ...players,
        kicker: this._text(players.kicker),
        punter: this._text(players.punter),
        returner: this._text(players.returner),
        blocker: this._text(players.blocker),
        recoverer: this._text(players.recoverer),
      },
      notes: this._text(value.notes),
      legacy: value.legacy === true,
    };
  }

  /** Normalize an existing structured event in place; never creates one from legacy tags. */
  static normalizePlay(play) {
    if (!play || !Object.prototype.hasOwnProperty.call(play, 'specialTeams')) return null;
    const normalized = this.normalize(play.specialTeams);
    if (normalized) play.specialTeams = normalized;
    return normalized;
  }

  static points(value) {
    const event = this.normalize(value && value.specialTeams ? value.specialTeams : value);
    if (!event || !event.outcome.score) return 0;
    return { touchdown: 6, fieldGoal: 3, extraPoint: 1, safety: 2 }[event.outcome.score] || 0;
  }

  /** Return subject/opponent/unknown. Never guesses an ambiguous safety. */
  static scoringTeam(value) {
    const event = this.normalize(value && value.specialTeams ? value.specialTeams : value);
    if (!event || !event.outcome.score) return 'unknown';
    const explicit = event.outcome.scoredBy;
    if (explicit === 'subject' || explicit === 'opponent') return explicit;
    if (explicit === 'unknown') return 'unknown';
    if (event.outcome.score === 'safety') return 'unknown';
    if (event.outcome.score === 'fieldGoal' || event.outcome.score === 'extraPoint') {
      if (event.subjectRole === 'attempting') return 'subject';
      if (event.subjectRole === 'defending') return 'opponent';
      return 'unknown';
    }
    if (event.outcome.recoveredBy === 'subject' || event.outcome.recoveredBy === 'opponent') {
      return event.outcome.recoveredBy;
    }
    if (event.outcome.recoveredBy === 'unknown') return 'unknown';
    if (event.subjectRole === 'attempting' || event.subjectRole === 'receiving') return 'subject';
    if (event.subjectRole === 'defending' || event.subjectRole === 'kicking') return 'opponent';
    return 'unknown';
  }

  /**
   * Observed punt/kick net. Touchbacks require an explicit ruleset-derived
   * penalty supplied by the caller; no federation value is hard-coded here.
   */
  static netYards(value, rules = {}) {
    const event = this.normalize(value && value.specialTeams ? value.specialTeams : value);
    if (!event || event.kick.distance == null) return null;
    const status = event.outcome.status;
    if (status === 'returned') {
      return event.return.yards == null ? null : event.kick.distance - event.return.yards;
    }
    if (status === 'touchback') {
      const penalty = this._number(rules.touchbackPenalty);
      return penalty == null ? null : event.kick.distance - penalty;
    }
    if (status === 'fairCatch' || status === 'downed' || status === 'outOfBounds') return event.kick.distance;
    return null;
  }
}
