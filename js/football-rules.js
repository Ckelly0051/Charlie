/**
 * Shared football rules — the single source of truth for concepts the stats
 * engine and the live tagger must agree on (so analytics never disagree with
 * what Auto Down & Distance does while charting).
 */
import { SpecialTeamsModel } from './special-teams.js';
import { PenaltyModel } from './penalty-model.js';

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
 * Which team had the ball on this snap, from the CHARTED unit only.
 *
 * `offense` means the charting subject had possession, `defense` means the
 * other team did. Special Teams and untagged snaps return '' — legacy
 * `stType` carries no perspective (SPECIAL-TEAMS-MODEL §3) and field position
 * carries no proven owner, so possession is never inferred there.
 */
/**
 * The unit a play COUNTS as: its stored unit, and offense when none is stored,
 * which is how every report already counts a legacy play. Chart, the play card
 * and Film Room all read this one rule, so a play can never show one unit in
 * one view and another elsewhere (1.12.0-99 smoke, S99-2). Reading never
 * writes; a unit is stored only when the coach chooses one.
 */
export function countedUnit(play) {
  const unit = play?.tags?.unit;
  return unit === 'defense' || unit === 'special' ? unit : 'offense';
}

export function drivePossessionSide(tags) {
  const unit = String(tags?.unit || '').toLowerCase();
  if (unit === 'offense') return 'subject';
  if (unit === 'defense') return 'opponent';
  // Blank unit is NOT read as offense here. Analytics defaults a blank to
  // offense for cohort membership, but an all-legacy game would then have
  // every drive relabeled "Our Drive N" on no charted evidence; an unknown
  // side keeps the plain "Drive N" the coach already sees.
  return '';
}

/** The charted drive number as trimmed text ('' when untagged). */
export function driveNumberOf(tags) {
  return String(tags?.driveNumber ?? '').trim();
}

/**
 * Coach-facing drive label. Two modes, one owner:
 *  - `perspective` (default) — `Our Drive 1` / `Opponent Drive 1`. Valid only
 *    where the charting subject IS our team.
 *  - `unit` — `Offense Drive 1` / `Defense Drive 1`. Used on a scout season
 *    (neither side is ours) and by Study, which aggregates across seasons and
 *    so cannot claim a perspective.
 */
export function driveLabel(side, number, mode = 'perspective') {
  if (!number) return 'No drive';
  if (!side) return `Drive ${number}`;
  if (mode === 'unit') return `${side === 'subject' ? 'Offense' : 'Defense'} Drive ${number}`;
  return `${side === 'subject' ? 'Our' : 'Opponent'} Drive ${number}`;
}

/**
 * Group an ordered play list into drives on composite side+number identity,
 * because the two teams each run their own drive sequence: grouping on the raw
 * `driveNumber` tag alone put our Drive 1 and the opponent's Drive 1 in one
 * group. A snap whose side is unknown (special teams, untagged unit) is
 * transparent — it joins the surrounding drive of the same number and can never
 * merge two known sides.
 *
 * Returns `[{ key, side, number, label, plays }]` in charted order. `project`
 * maps a play to whatever the caller renders; `mode` selects the labels.
 */
export function groupPlaysByDrive(plays, { project = play => play, mode = 'perspective' } = {}) {
  const groups = [];
  let current = null;
  (plays || []).forEach(play => {
    const tags = play?.tags || {};
    const number = driveNumberOf(tags);
    const side = drivePossessionSide(tags);
    // An unknown side continues the open drive of the same number, and a known
    // side ADOPTS an open drive that has not resolved one yet (a kickoff ahead
    // of our own snaps is one drive, not two).
    const continues = !!current && current.number === number
      && (!side || !current.side || current.side === side);
    if (!continues) {
      current = { key: `${side || 'unknown'}|${number || 'none'}#${groups.length}`, side, number, label: '', plays: [] };
      groups.push(current);
    } else if (side && !current.side) {
      current.side = side;
    }
    current.plays.push(project(play));
  });
  groups.forEach(group => { group.label = driveLabel(group.side, group.number, mode); });
  return groups;
}

/**
 * Has the coach put any meaningful tag on this play? The single source of truth
 * for "tagged" across the progress counter, the play selector, and the Film Room
 * grid (they used to disagree — some checked playType ONLY, so a Kick Return or a
 * defensive snap that the coach fully tagged still read as "Untagged"). A play
 * counts as tagged if it carries an offensive play type, a result, a
 * special-teams type, a run/pass call, a formation family or receiver set, or any defensive scheme tag.
 */
export function isPlayTagged(play) {
  const t = (play && play.tags) || {};
  const special = SpecialTeamsModel.normalize(play?.specialTeams);
  if (special?.unit === 'try' || special?.unit === 'tryDefense') {
    const penalties = PenaltyModel.normalizeList(play?.penalties);
    const unresolvedPenalty = penalties.some(penalty => penalty.playCounts == null || penalty.disposition === 'unknown');
    const noPlayMismatch = penalties.some(penalty => penalty.playCounts === false) && special.result !== 'noPlay';
    return !!(special.attemptType && special.result && !unresolvedPenalty && !noPlayMismatch
      && (!special.events.defensiveReturn || special.outcome.returnAward != null));
  }
  return !!special || !!(t.playType || t.result || t.runPass
    || t.formationFamily || t.receiverSet || t.defFront || t.coverage || t.blitz);
}
