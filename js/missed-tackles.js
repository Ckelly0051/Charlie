import { countedUnit } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';

/**
 * Missed tackles (GRIDIRON-IQ-TAG-MODEL.md §3a). On our snaps (defense, kick
 * coverage, Defending a Try) `tags.players.missedTackler` names our players who
 * missed, comma-separated like Tackler(s); each name is one missed tackle, the
 * way Tkl credits a tackle, and there is no count box. On the opponent's snaps
 * (offense, returns, our run/pass try) `tags.missedTackles` is the count of
 * their misses on our ball carrier, '0'-'9'; blank is not charted.
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

  /** The play's misses as a number, or null when it has none to chart: the
   *  players named on our snaps (0 when no one is named), the Count on the
   *  opponent's (null while blank). */
  static count(play) {
    const mode = MissedTackles.modeOf(play);
    if (mode === 'ours') return MissedTackles.players(play).length;
    if (mode !== 'theirs') return null;
    const value = String(play?.tags?.missedTackles ?? '').trim();
    return MissedTackles.COUNTS.includes(value) ? Number(value) : null;
  }
  /** Jersey numbers named as missing a tackle on this play, once each. */
  static players(play) {
    return [...new Set(String(play?.tags?.players?.[MissedTackles.ROLE] ?? '').match(/\d+/g) || [])];
  }
}
