import { PenaltyModel } from './penalty-model.js';
import { SpecialTeamsModel } from './special-teams.js';

/**
 * DOM-free commands for structured penalty and Special Teams charting.
 * NativeTaggingScreen owns presentation; PlayTagger remains the play store.
 */
export class BreakdownChartingService {
  constructor(tagger) {
    this.tagger = tagger;
  }

  _penaltyPhase(play) {
    const unit = play?.tags?.unit || 'offense';
    return unit === 'special' ? 'special' : unit === 'defense' ? 'defense' : 'offense';
  }

  _savePenaltyPlay(play, invalidateSituation = false) {
    if (invalidateSituation && play.resultingSituation?.confirmed) play.resultingSituation.confirmed = false;
    PenaltyModel.normalizePlay(play);
    this.tagger._emit('play-updated', play);
    return true;
  }

  addPenalty() {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    play.penalties = PenaltyModel.normalizeList([...(play.penalties || []), {
      team:'subject', phase:this._penaltyPhase(play), foul:'', disposition:'accepted',
      yards:null, playCounts:null, player:'', automaticFirstDown:null,
      lossOfDown:null, notes:'', legacy:false,
    }]);
    return this._savePenaltyPlay(play, true);
  }

  async removePenalty(index) {
    const play = this.tagger.getCurrentPlay();
    if (!play || !play.penalties?.[index]) return false;
    const ok = await this.tagger._confirmDialog('Remove this structured penalty?', 'Remove Penalty');
    if (!ok) return false;
    play.penalties.splice(index, 1);
    if (!play.penalties.length) delete play.resultingSituation;
    return this._savePenaltyPlay(play, true);
  }

  penaltyChip(index, field, raw) {
    const play = this.tagger.getCurrentPlay();
    const penalty = play?.penalties?.[index];
    if (!penalty) return false;
    penalty[field] = field === 'playCounts'
      ? (raw === 'true' ? true : raw === 'false' ? false : null)
      : raw;
    return this._savePenaltyPlay(play, true);
  }

  penaltyInput(index, field, value) {
    const play = this.tagger.getCurrentPlay();
    const penalty = play?.penalties?.[index];
    if (!penalty) return false;
    penalty[field] = field === 'yards' ? (value === '' ? null : Number(value)) : value;
    return this._savePenaltyPlay(play, true);
  }

  penaltySituation(field, value, checked = false) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    const situation = PenaltyModel.normalizeSituation(play.resultingSituation)
      || { down:'', distance:'', fieldSide:'', yardLine:'', confirmed:false };
    situation[field] = field === 'confirmed' ? checked : value;
    play.resultingSituation = PenaltyModel.normalizeSituation(situation);
    return this._savePenaltyPlay(play);
  }

  _newSpecial(unit) {
    return SpecialTeamsModel.normalize({
      version:1, unit, subjectRole:SpecialTeamsModel.ROLES[unit], attemptType:null,
      result:null, events:{}, kick:{}, return:{}, outcome:{}, isOnside:false,
      isFake:false, players:{}, notes:'', legacy:false,
    });
  }

  _saveSpecial(update) {
    const play = this.tagger.getCurrentPlay();
    const current = SpecialTeamsModel.normalize(play?.specialTeams);
    if (!play || !current) return false;
    update(current);
    play.specialTeams = SpecialTeamsModel.normalize(current);
    this.tagger._emit('play-updated', play);
    return true;
  }

  _hasSpecialDetails(st) {
    return !!(st.attemptType || st.result || Object.values(st.events || {}).some(Boolean)
      || st.outcome.returnAward || st.outcome.status || st.outcome.score
      || st.outcome.recoveredBy || st.outcome.scoredBy || st.isOnside || st.isFake
      || st.kick.distance != null || st.kick.hangTime != null
      || st.kick.landing.fieldSide || st.kick.landing.yardLine
      || st.return.yards != null || st.return.end.fieldSide || st.return.end.yardLine
      || Object.values(st.players).some(Boolean));
  }

  async setSpecialUnit(unit) {
    const play = this.tagger.getCurrentPlay();
    if (!play) return false;
    const current = SpecialTeamsModel.normalize(play.specialTeams);
    if (current && current.unit !== unit && this._hasSpecialDetails(current)) {
      const ok = await this.tagger._confirmDialog(
        'Changing the Special Teams unit will clear its charted details.',
        'Change Unit',
      );
      if (!ok) return false;
    }
    play.specialTeams = this._newSpecial(unit);
    this.tagger._emit('play-updated', play);
    return true;
  }

  specialAction(key, value) {
    if (!this.tagger.getCurrentPlay()) return false;
    if (key === 'stUnit') return this.setSpecialUnit(value);
    if (key === 'stTryAttempt') return this._saveSpecial(st => {
      st.attemptType = value;
      if (st.result === 'converted' && !st.events.defensiveReturn) st.outcome.score = st.attemptType;
    });
    if (key === 'stTryResult') return this._saveSpecial(st => {
      st.result = value;
      if (st.result === 'converted' && !st.events.defensiveReturn) st.outcome.score = st.outcome.score || st.attemptType;
      else if (!st.events.defensiveReturn || !['subject','opponent'].includes(st.outcome.returnAward)) {
        st.outcome.score = null;
        st.outcome.scoredBy = null;
      }
    });
    if (key === 'stTryScore') return this._saveSpecial(st => {
      st.result = 'converted'; st.outcome.score = value; st.outcome.scoredBy = null;
    });
    if (key === 'stTryTurnover') return this._saveSpecial(st => {
      st.events.turnover = st.events.turnover === value ? null : value;
    });
    if (key === 'stTryEvent') return this._saveSpecial(st => {
      st.events[value] = !st.events[value];
      if (value === 'defensiveReturn') {
        st.outcome.returnAward = null;
        st.outcome.score = st.events.defensiveReturn ? null : (st.result === 'converted' ? st.attemptType : null);
        st.outcome.scoredBy = null;
        if (st.events.defensiveReturn && st.result === 'converted') st.result = 'failed';
      }
    });
    if (key === 'stReturnAward') return this._saveSpecial(st => {
      st.outcome.returnAward = value;
      st.outcome.score = st.outcome.returnAward === 'none' ? null : 'twoPoint';
      st.outcome.scoredBy = st.outcome.returnAward === 'none' ? null : st.outcome.returnAward;
    });
    if (key === 'stOutcome') return this._saveSpecial(st => {
      st.outcome.status = st.outcome.status === value ? null : value;
      if (st.outcome.status === 'returned') st.return.attempted = true;
      else if (['touchback','fairCatch','downed','outOfBounds'].includes(st.outcome.status)) st.return.attempted = false;
      else if (!st.outcome.status) st.return.attempted = null;
      if (!['recovered','muffed','blocked'].includes(st.outcome.status)) st.outcome.recoveredBy = null;
      if (st.outcome.status === 'good') st.outcome.score = st.attemptType;
      else if (st.outcome.score === 'fieldGoal' || st.outcome.score === 'extraPoint') st.outcome.score = null;
    });
    if (key === 'stAttempt') return this._saveSpecial(st => {
      st.attemptType = value;
      st.outcome.score = st.outcome.status === 'good' ? st.attemptType : null;
    });
    if (key === 'stScore') return this._saveSpecial(st => {
      st.outcome.score = st.outcome.score === value ? null : value;
      st.outcome.scoredBy = null;
    });
    if (key === 'stOwner') return this._saveSpecial(st => { st.outcome.scoredBy = value; });
    if (key === 'stRecovery') return this._saveSpecial(st => { st.outcome.recoveredBy = value; });
    if (key === 'stToggle') return this._saveSpecial(st => { st[value] = !st[value]; });
    if (key === 'stSpotSide') {
      const [spotKey, side] = value.split(':');
      return this._saveSpecial(st => {
        (spotKey === 'landing' ? st.kick.landing : st.return.end).fieldSide = side;
      });
    }
    return false;
  }

  specialInput(key, value) {
    return this._saveSpecial(st => {
      const numeric = value === '' ? null : Number(value);
      if (key === 'kick-distance') st.kick.distance = numeric;
      if (key === 'hang-time') st.kick.hangTime = numeric;
      if (key === 'return-yards') {
        st.return.yards = numeric;
        st.return.attempted = numeric == null ? null : true;
      }
      if (key === 'landing-yard') st.kick.landing.yardLine = value;
      if (key === 'end-yard') st.return.end.yardLine = value;
      if (key === 'blocker') st.players.blocker = value;
      if (key === 'recoverer') st.players.recoverer = value;
    });
  }

  syncSpecialist(role) {
    const play = this.tagger.getCurrentPlay();
    const special = SpecialTeamsModel.normalize(play?.specialTeams);
    if (!play || !special || !['kicker', 'returner'].includes(role)) return false;
    special.players[role] = play.tags.players?.[role] || '';
    play.specialTeams = special;
    this.tagger._emit('play-updated', play);
    return true;
  }
}
