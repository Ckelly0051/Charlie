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

function kickoffGroups(plays) {
  const assignments = new Map();
  const event = p => SpecialTeamsModel.normalize(p?.specialTeams);
  const isKick = e => e && ['kickoff', 'kickoffReturn'].includes(e.unit);
  const noPlay = p => p?.penalties?.some(penalty => penalty.playCounts === false);
  const quarter = p => String(p?.tags?.quarter || '').replace(/^Q/i, '');
  const halfChanged = (a, b) => a && b && ((['1', '2'].includes(a) && !['1', '2'].includes(b))
    || (['3', '4'].includes(a) && !['3', '4'].includes(b)));
  for (let i = 0; i < plays.length; i++) {
    const first = event(plays[i]);
    if (!isKick(first) || assignments.has(plays[i]) || driveNumberOf(plays[i].tags)) continue;
    const members = [plays[i]];
    let lastKick = plays[i], lastEvent = first, next = null, boundary = '';
    let score = !noPlay(lastKick) && lastEvent.outcome.score === 'touchdown';
    const startQuarter = quarter(plays[i]);
    for (let j = i + 1; j < plays.length; j++) {
      const p = plays[j], e = event(p);
      if (halfChanged(startQuarter, quarter(p))) {
        boundary = ['1', '2'].includes(startQuarter) ? 'End of half' : 'End of regulation';
        break;
      }
      if (score) {
        if (e && ['try', 'tryDefense'].includes(e.unit) && !driveNumberOf(p.tags)) { members.push(p); continue; }
        break;
      }
      if (isKick(e)) {
        if (noPlay(lastKick) && e.unit === lastEvent.unit && !driveNumberOf(p.tags)) {
          members.push(p); lastKick = p; lastEvent = e;
          score = !noPlay(p) && e.outcome.score === 'touchdown';
          continue;
        }
        break;
      }
      if (drivePossessionSide(p.tags)) { next = p; break; }
      // An unrelated or uncharted ST snap is not proof of continuation.
      break;
    }
    // Explicit numbers remain coach-owned. Only a blank kickoff borrows the
    // next snap's number, and only inside this bounded possession sequence.
    const number = next ? driveNumberOf(next.tags) : '';
    const terminal = !next || score || !!boundary;
    const label = score ? 'Kick return touchdown' : boundary || 'Kickoff';
    const side = next ? drivePossessionSide(next.tags) : '';
    const neighbor = plays.slice(i + 1).find(p => driveNumberOf(p.tags))
      || plays.slice(0, i).reverse().find(p => driveNumberOf(p.tags));
    const group = { number, side, terminal, label,
      key: `kickoff:${i}`, order: i, anchor: number || driveNumberOf(neighbor?.tags) };
    for (const p of members) assignments.set(p, group);
  }
  return assignments;
}

/**
 * Group an ordered play list into drives on composite side+number identity,
 * because the two teams each run their own drive sequence: grouping on the raw
 * `driveNumber` tag alone put our Drive 1 and the opponent's Drive 1 in one
 * group. A snap whose side is unknown (special teams, untagged unit) is
 * transparent — it joins the surrounding drive of the same number and can never
 * merge two known sides.
 *
 * Collects nonadjacent assigned drives, orders groups by drive number, and
 * plays by play number within each group. Blank kickoff numbers may join the
 * next drive only inside a bounded kickoff sequence. Terminal kicks/return
 * scores stay separate unless explicitly numbered by the coach; other
 * unassigned plays stay in No drive. No tag writes.
 * Returns `[{ key, side, number, label, plays }]`. `project`
 * maps a play to whatever the caller renders; `mode` selects the labels.
 */
export function groupPlaysByDrive(plays, { project = play => play, mode = 'perspective' } = {}) {
  const kickoff = kickoffGroups(plays || []);
  const groups = [];
  let current = null;
  (plays || []).forEach((play, order) => {
    const tags = play?.tags || {};
    const kick = kickoff.get(play);
    const number = kick ? kick.number : driveNumberOf(tags);
    const side = kick ? kick.side : drivePossessionSide(tags);
    if (kick?.terminal) {
      if (current?.key !== kick.key) { current = { ...kick, plays: [] }; groups.push(current); }
      current.plays.push(play);
      return;
    }
    // An unknown side continues the open drive of the same number, and a known
    // side ADOPTS an open drive that has not resolved one yet (a kickoff ahead
    // of our own snaps is one drive, not two).
    const continues = !!current && !current.terminal && current.number === number
      && (!side || !current.side || current.side === side);
    if (!continues) {
      current = { key: `${side || 'unknown'}|${number || 'none'}#${groups.length}`, side, number, label: '', order, plays: [] };
      groups.push(current);
    } else if (side && !current.side) {
      current.side = side;
    }
    current.plays.push(play);
  });
  const collected = new Map();
  for (const group of groups) {
    const key = group.terminal ? group.key : group.number ? `${group.side || 'unknown'}|${group.number}` : 'none';
    const existing = collected.get(key);
    if (existing) existing.plays.push(...group.plays);
    else collected.set(key, { ...group, key, plays: [...group.plays] });
  }
  return [...collected.values()].sort((a, b) => {
    const an = a.number || a.anchor, bn = b.number || b.anchor;
    if (!an) return bn ? 1 : a.order - b.order;
    if (!bn) return -1;
    return an.localeCompare(bn, undefined, { numeric: true }) || a.order - b.order;
  }).map(group => ({ ...group, label: group.terminal ? group.label : driveLabel(group.side, group.number, mode),
    plays: group.plays.sort((a, b) => Number(a.id) - Number(b.id)).map(project) }));
}

/**
 * Has the coach put any meaningful tag on this play? The single source of truth
 * for "tagged" across the progress counter, the play selector, and the Film Room
 * grid (they used to disagree — some checked playType ONLY, so a Kick Return or a
 * defensive snap that the coach fully tagged still read as "Untagged"). A play
 * counts as tagged if it carries an offensive play type, a result, a
 * special-teams type, a run/pass call, a formation or receiver set, or any defensive scheme tag.
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
