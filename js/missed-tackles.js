import { countedUnit } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';

/**
 * Missed tackles (GRIDIRON-IQ-TAG-MODEL.md §3a). `tags.missedTackles` is the
 * play's exact count, '0'-'9'; blank is not charted and never counts as zero.
 * `tags.players.missedTackler` names our players who missed, comma-separated
 * like Tackler(s), and each name is one missed tackle for that player, the way
 * Tkl credits a tackle.
 */
export class MissedTackles {
  static COUNTS = Object.freeze(['0', '1', '2', '3', '4', '5', '6', '7', '8', '9']);
  static ROLE = 'missedTackler';

  /** Whose misses a snap charts: 'ours' (our players, from the roster),
   *  'theirs' (the opponent missed on our carrier; count only) or null (no
   *  row: Field Goal, FG Block and kicked tries have no return to tackle). A
   *  run/pass or Fake try charts like its scrimmage side. */
  static mode(unit, special) {
    const event = SpecialTeamsModel.normalize(special);
    if (event && (event.unit === 'try' || event.unit === 'tryDefense') && event.attemptType === 'twoPoint') {
      return event.unit === 'tryDefense' ? 'ours' : 'theirs';
    }
    if (unit === 'defense') return 'ours';
    if (unit === 'offense') return 'theirs';
    if (unit !== 'special') return null;
    if (event?.unit === 'kickoff' || event?.unit === 'punt') return 'ours';
    if (event?.unit === 'kickoffReturn' || event?.unit === 'puntReturn') return 'theirs';
    return null;
  }
  static modeOf(play) { return MissedTackles.mode(countedUnit(play), play?.specialTeams); }

  /** The play's count as a number, or null when not charted. */
  static count(play) {
    const value = String(play?.tags?.missedTackles ?? '').trim();
    return MissedTackles.COUNTS.includes(value) ? Number(value) : null;
  }
  /** Jersey numbers named as missing a tackle on this play, once each. */
  static players(play) {
    return [...new Set(String(play?.tags?.players?.[MissedTackles.ROLE] ?? '').match(/\d+/g) || [])];
  }
}
