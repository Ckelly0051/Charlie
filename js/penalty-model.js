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

  /** `${gameId}::${playId}` -- deduped, sorted. Only emitted for plays that
   *  actually carry the identity (matches the composite-ref convention used
   *  throughout the app); a play missing `__gid` is silently excluded from
   *  `refs` rather than producing an ambiguous bare-id ref (the SAME
   *  fail-open choice `defensivePerformance`'s legacy closures make, not a
   *  new one invented here). */
  static _refs(rows) {
    const seen = new Set();
    const out = [];
    for (const row of rows) {
      const gid = row.play?.__gid;
      const id = row.play?.id;
      if (gid == null || id == null) continue;
      const ref = `${gid}::${id}`;
      if (!seen.has(ref)) { seen.add(ref); out.push(ref); }
    }
    return out.sort();
  }

  /**
   * `bucket()` is the one classification formula, applied to the full record
   * set for the top-level fields and to team and phase subsets for
   * `byTeam`/`byPhase`, so "penalties we committed on defense" never comes
   * from re-summing every record on a filtered set of plays (which would
   * double-count offsetting fouls). `byTeam`/`byPhase` include 'unknown', so an
   * unresolved team or phase is its own visible bucket.
   *
   * Every count carries its own `refs`: the plays whose records produced it. A
   * play with an accepted and a declined foul appears in both `refs.accepted`
   * and `refs.declined`; `refs.yards` mirrors `refs.accepted` (yards are
   * accepted-only).
   */
  static summarize(plays) {
    const records = [];
    let flaggedPlays = 0;
    for (const play of plays || []) {
      const penalties = this.normalizeList(play?.penalties);
      if (penalties.length) flaggedPlays++;
      penalties.forEach(penalty => records.push({ play, penalty }));
    }
    const bucket = rows => {
      const accepted = rows.filter(row => row.penalty.disposition === 'accepted');
      const declined = rows.filter(row => row.penalty.disposition === 'declined');
      const offsetting = rows.filter(row => row.penalty.disposition === 'offsetting');
      const incomplete = rows.filter(row => row.penalty.disposition === 'unknown' || row.penalty.team === 'unknown' || !row.penalty.foul);
      // A "no play" foul (playCounts:false) is disposition-independent --
      // it's a fact about the down, not about who was charged or whether
      // the penalty was accepted/declined.
      const noPlay = rows.filter(row => row.penalty.playCounts === false);
      // Only an ACCEPTED foul can actually gift a first down.
      const automaticFirstDowns = accepted.filter(row => row.penalty.automaticFirstDown === true);
      return {
        fouls: rows.length, accepted: accepted.length, declined: declined.length,
        offsetting: offsetting.length, incomplete: incomplete.length, noPlay: noPlay.length,
        automaticFirstDowns: automaticFirstDowns.length,
        yards: accepted.reduce((sum, row) => sum + (row.penalty.yards || 0), 0),
        refs: {
          fouls: this._refs(rows), accepted: this._refs(accepted), declined: this._refs(declined),
          offsetting: this._refs(offsetting), incomplete: this._refs(incomplete), noPlay: this._refs(noPlay),
          automaticFirstDowns: this._refs(automaticFirstDowns), yards: this._refs(accepted),
        },
      };
    };
    const all = bucket(records);
    const byTeam = Object.fromEntries([...this.TEAMS].map(team => [team, bucket(records.filter(row => row.penalty.team === team))]));
    const byPhase = Object.fromEntries([...this.PHASES].map(phase => [phase, bucket(records.filter(row => row.penalty.phase === phase))]));
    return {
      flaggedPlays,
      fouls: all.fouls,
      accepted: all.accepted,
      declined: all.declined,
      offsetting: all.offsetting,
      incomplete: all.incomplete,
      noPlay: all.noPlay,
      automaticFirstDowns: all.automaticFirstDowns,
      subjectYards: byTeam.subject.yards,
      opponentYards: byTeam.opponent.yards,
      byTeam, byPhase,
      refs: all.refs,
      records,
      hasData: records.length > 0,
    };
  }
}
