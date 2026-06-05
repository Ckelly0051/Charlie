/**
 * Shared football rules — the single source of truth for concepts the stats
 * engine and the live tagger must agree on (so analytics never disagree with
 * what Auto Down & Distance does while charting).
 */

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
