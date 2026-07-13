/**
 * Shared football rules — the single source of truth for concepts the stats
 * engine and the live tagger must agree on (so analytics never disagree with
 * what Auto Down & Distance does while charting).
 */
import { SpecialTeamsModel } from './special-teams.js';

/**
 * Did this play earn a first down? True when the play is explicitly tagged
 * "1st Down", or when the yardage gained met the distance-to-go. A
 * non-positive or unknown distance can't be a measured conversion, so it
 * returns false (this keeps a 0/0 or untagged play from looking like a
 * first down).
 */
export function gainedFirstDown(tags) {
  if (!tags) return false;
  if (Array.isArray(tags.custom) && tags.custom.includes('1st Down')) return true;
  const dist = parseInt(tags.distance, 10);
  const yds = parseInt(tags.yardage, 10);
  return !isNaN(dist) && dist > 0 && !isNaN(yds) && yds >= dist;
}

/**
 * Results that end a possession (the offense gives the ball back). Used to
 * split a play list into drives without relying on the manual driveNumber tag.
 * A penalty is deliberately NOT here — it can reset the down within a drive.
 */
export const DRIVE_ENDERS = new Set([
  'Touchdown', 'Field Goal', 'Punt', 'Interception', 'Fumble',
  'Good', 'No Good', 'Safety', 'Kneel', 'Spike',
]);

/**
 * Has the coach put any meaningful tag on this play? The single source of truth
 * for "tagged" across the progress counter, the play selector, and the Film Room
 * grid (they used to disagree — some checked playType ONLY, so a Kick Return or a
 * defensive snap that the coach fully tagged still read as "Untagged"). A play
 * counts as tagged if it carries an offensive play type, a result, a
 * special-teams type, a run/pass call, a formation, or any defensive scheme tag.
 */
export function isPlayTagged(play) {
  const t = (play && play.tags) || {};
  return !!(play && SpecialTeamsModel.normalize(play.specialTeams)) || !!(t.playType || t.result || t.stType || t.runPass
    || t.formation || t.defFront || t.coverage || t.blitz);
}
