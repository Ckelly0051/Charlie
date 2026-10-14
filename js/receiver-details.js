import { countedUnit } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';

/** One observed target's route and release; neither is inferred. */
export class ReceiverDetails {
  static RELEASES = Object.freeze(['Inside', 'Outside']);
  static targets(play) {
    const parts = String(play?.tags?.players?.receiver || '').split(/\s*[,;+]\s*/).filter(Boolean);
    return parts.length && parts.every(value => /^\d{1,2}$/.test(value)) ? [...new Set(parts)] : [];
  }
  static holds(play) {
    const unit = countedUnit(play), st = SpecialTeamsModel.normalize(play?.specialTeams);
    const offensive = unit === 'offense' || (unit === 'special' && st &&
      (SpecialTeamsModel.isRunPassTry(play) ? st.unit === 'try' : st.isFake));
    return !!offensive && play?.tags?.runPass === 'Pass';
  }
  static problems(play) {
    const detail = play?.receiverDetail;
    if (detail == null) return [];
    if (typeof detail !== 'object' || Array.isArray(detail)) return ['invalid receiver detail'];
    const keys = Object.keys(detail);
    if (keys.some(key => !['receiverNumber','route','releaseDirection'].includes(key)) ||
      typeof detail.receiverNumber !== 'string' || !/^\d{1,2}$/.test(detail.receiverNumber) ||
      (Object.hasOwn(detail, 'route') && (typeof detail.route !== 'string' || !detail.route.trim() || detail.route.length > 120)) ||
      (Object.hasOwn(detail, 'releaseDirection') && !this.RELEASES.includes(detail.releaseDirection)) ||
      (!detail.route && !detail.releaseDirection)) return ['invalid receiver detail'];
    return [];
  }
  static read(play) {
    return play?.receiverDetail && !this.problems(play).length && this.holds(play) &&
      this.targets(play).includes(play.receiverDetail.receiverNumber) ? { ...play.receiverDetail } : null;
  }
}
