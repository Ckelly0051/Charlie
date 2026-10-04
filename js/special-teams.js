/**
 * Pure Phase 4E special-teams contract. No DOM, storage, or app dependencies.
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
    try: 'attempting',
    tryDefense: 'defending',
  });
  /**
   * THE COACH-FACING UNIT NAMES, in the model's own order. One owner, because
   * the deck, the theater chyron, the Film Room grid, the Study dimension and
   * the Reports ledger each carried their own copy — which is how a renamed unit
   * reaches the deck and nothing else.
   *
   * `puntReturn` reads `Punt Return / Block`: the unit that fields a punt is the
   * unit that blocks one, and the stored value stays `puntReturn` (§4b's rule
   * against another field-goal-shaped workaround). There is no `puntBlock` unit.
   */
  static UNIT_LABELS = Object.freeze({
    kickoff: 'Kickoff',
    kickoffReturn: 'Kick Return',
    punt: 'Punt',
    puntReturn: 'Punt Return / Block',
    fieldGoal: 'Field Goal',
    fieldGoalBlock: 'Field Goal Block',
    try: 'Try',
    tryDefense: 'Defending a Try',
  });

  /** The ordered [value, label] pairs a unit selector renders. */
  static unitOptions() {
    return Object.keys(this.ROLES).map(unit => [unit, this.UNIT_LABELS[unit] || unit]);
  }

  /** Charting rows in the approved display order, independent of active role. */
  static playerRoles(value) {
    const event = this.normalize(value);
    if (this.isRunPassTry({ specialTeams: event })) {
      return event.unit === 'tryDefense' ? ['tackler', 'takeaway'] : ['ballCarrier', 'passer', 'receiver'];
    }
    if (event?.unit === 'try') return ['kicker'];
    if (event?.unit === 'tryDefense') return ['blocker'];
    return ['kicker', 'returner'];
  }

  static isOpposingPlayerRole(value, role) {
    const event = this.normalize(value);
    if (!event || this.isRunPassTry({ specialTeams: event })) return false;
    const ownership = this.ROLES[event.unit];
    return (role === 'kicker' && ['receiving', 'defending'].includes(ownership))
      || (role === 'returner' && ['kicking', 'attempting'].includes(ownership));
  }

  static defaultPlayerRole(value) {
    const roles = this.playerRoles(value);
    return roles.find(role => !this.isOpposingPlayerRole(value, role)) || roles[0];
  }

  static STATUSES = new Set([
    'returned', 'touchback', 'fairCatch', 'downed', 'outOfBounds',
    'blocked', 'muffed', 'recovered', 'good', 'noGood', 'badSnap',
  ]);
  static SCORES = new Set(['touchdown', 'fieldGoal', 'extraPoint', 'twoPoint', 'safety']);
  static TEAMS = new Set(['subject', 'opponent', 'unknown']);
  static TRY_ATTEMPTS = new Set(['extraPoint', 'twoPoint']);
  static TRY_RESULTS = new Set(['converted', 'failed', 'noPlay']);
  static TURNOVERS = new Set(['interception', 'fumble']);
  static RETURN_AWARDS = new Set(['none', 'subject', 'opponent']);

  /**
   * The attempt type a NEW event of this unit carries. The field-goal units
   * attempt exactly one thing — a field goal — so nothing has to be chosen,
   * and nothing can author an extra point through them. Extra points and
   * two-point tries are authored only under `try` / `tryDefense`, which encode
   * the attempting side; `unit:'fieldGoal'` is always "the subject attempting",
   * so an opponent XP charted there scored for us.
   */
  static defaultAttemptType(unit) {
    return unit === 'fieldGoal' || unit === 'fieldGoalBlock' ? 'fieldGoal' : null;
  }

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
    const events = this._object(value.events);
    const isTry = value.unit === 'try' || value.unit === 'tryDefense';
    const attemptType = isTry
      ? this._choice(value.attemptType, this.TRY_ATTEMPTS)
      : (value.attemptType === 'fieldGoal' ? 'fieldGoal' : null);
    const result = isTry ? this._choice(value.result, this.TRY_RESULTS) : null;
    const defensiveReturn = isTry && events.defensiveReturn === true;
    const returnAward = defensiveReturn ? this._choice(outcome.returnAward, this.RETURN_AWARDS) : null;
    let score = this._choice(outcome.score, this.SCORES);
    let scoredBy = this._choice(outcome.scoredBy, this.TEAMS);
    // Only Try and Defending a Try score an extra point or a two-point try.
    if (!isTry && (score === 'extraPoint' || score === 'twoPoint')) { score = null; scoredBy = null; }
    if (isTry) {
      if (defensiveReturn && (returnAward === 'subject' || returnAward === 'opponent')) {
        score = 'twoPoint';
        scoredBy = returnAward;
      } else if (defensiveReturn) {
        score = null;
        scoredBy = null;
      } else if (result !== 'converted') {
        score = null;
        scoredBy = null;
      } else if (!attemptType) {
        score = null;
        scoredBy = null;
      } else if (attemptType === 'twoPoint') {
        // A run/pass try scores 2 by default; 1 where the league scores it so
        // (youth rules, coach 2026-09-27). The charted points are the record.
        score = score === 'extraPoint' ? 'extraPoint' : 'twoPoint';
      } else if (score !== 'extraPoint' && score !== 'twoPoint') {
        score = attemptType;
      }
    }
    return {
      ...value,
      version: this.VERSION,
      unit: value.unit,
      subjectRole: role,
      attemptType,
      result,
      events: {
        badSnap: isTry && events.badSnap === true,
        blocked: isTry && events.blocked === true,
        turnover: isTry ? this._choice(events.turnover, this.TURNOVERS) : null,
        defensiveReturn,
      },
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
        score,
        scoredBy,
        returnAward,
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

  /**
   * A try charted as Run/Pass or Fake (`attemptType:'twoPoint'`, a Fake adds
   * `isFake`). Its look and result are charted like an offensive or defensive
   * snap, so it is exempt from the Special Teams alignment strip, and it is kept
   * out of every analytics cohort: kick versus go-for-it is reported by the
   * Special Teams try module (coach, 2026-09-27). The unit stays Special Teams.
   */
  static isRunPassTry(play) {
    const event = this.normalize(play?.specialTeams);
    return !!event && (event.unit === 'try' || event.unit === 'tryDefense') && event.attemptType === 'twoPoint';
  }

  static points(value) {
    const event = this.normalize(value && value.specialTeams ? value.specialTeams : value);
    if (!event || !event.outcome.score) return 0;
    if (event.unit === 'try' || event.unit === 'tryDefense') {
      if (event.events.defensiveReturn) {
        return event.outcome.returnAward === 'subject' || event.outcome.returnAward === 'opponent' ? 2 : 0;
      }
      if (event.result !== 'converted') return 0;
    }
    return { touchdown: 6, fieldGoal: 3, extraPoint: 1, twoPoint: 2, safety: 2 }[event.outcome.score] || 0;
  }

  /** Return subject/opponent/unknown. Never guesses an ambiguous safety. */
  static scoringTeam(value) {
    const event = this.normalize(value && value.specialTeams ? value.specialTeams : value);
    if (!event || !event.outcome.score) return 'unknown';
    const explicit = event.outcome.scoredBy;
    if (explicit === 'subject' || explicit === 'opponent') return explicit;
    if (explicit === 'unknown') return 'unknown';
    if (event.outcome.score === 'safety') return 'unknown';
    if (event.outcome.score === 'fieldGoal' || event.outcome.score === 'extraPoint' || event.outcome.score === 'twoPoint') {
      if (event.subjectRole === 'attempting') return 'subject';
      if (event.subjectRole === 'defending') return 'opponent';
      return 'unknown';
    }
    if (event.outcome.recoveredBy === 'subject' || event.outcome.recoveredBy === 'opponent') {
      return event.outcome.recoveredBy;
    }
    if (event.outcome.recoveredBy === 'unknown') return 'unknown';
    /* A LOOSE BALL HAS NO DEFAULT OWNER. On a block, a muff or a recovery the
       ball changed hands or might have, and which team came up with it is the
       whole question — the unit alone cannot answer it. Falling through to the
       receiving/kicking default turned an ordinarily incomplete charting state
       (Possession left blank) into six points for the subject, which is exactly
       the invention §4 forbids: "a safety without enough ownership evidence
       fails closed as unknown". The points still exist and reach the
       scoreboard's `unattributed` total, so nothing is silently dropped either.
       A returned, downed or fair-caught kick keeps its default: the unit that
       fielded it is the unit that had it. */
    if (['blocked', 'muffed', 'recovered'].includes(event.outcome.status)) return 'unknown';
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
