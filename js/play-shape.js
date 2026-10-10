import { countedUnit } from './football-rules.js';
import { SpecialTeamsModel } from './special-teams.js';
import { MissedTackles } from './missed-tackles.js';
import { ChartingDetails } from './charting-details.js';

/**
 * What a play can hold, read from its own parents: the unit, the Special Teams
 * unit, a try's attempt type, a Fake, and a turnover result. Chart draws these
 * fields, Film Room locks the rest, saving a play drops the rest
 * (`settle`), and the analytics credit only roles a play can hold. A value the
 * play cannot show is never stored (GRIDIRON-IQ-SAVE-CONTRACT.md).
 */
export class PlayShape {
  /** Charted on every play: the Situation group and the play's own records. */
  static ALWAYS = Object.freeze(['unit', 'quarter', 'down', 'distance', 'hash', 'fieldSide', 'yardLine', 'driveNumber',
    'players', 'grades', 'custom', 'customFields']);
  /** The Formation & Call and Defense groups of a scrimmage look. */
  static LOOK = Object.freeze(['playCall', 'playCallId', 'playConcept', 'playCallDefaults', 'formationFamily', 'personnel',
    'qbAlignment', 'backfield', 'strength', 'receiverSet', 'motion', 'motionStart', 'motionEnd',
    'defFront', 'coverage', 'coverageFamily', 'blitz']);
  /** The Play & Result group. */
  static PLAY = Object.freeze(['runPass', 'playType', 'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun',
    'playDir', 'gap', 'result', 'fumbleRecovery', 'yardage']);

  /** The scrimmage side a play's look is charted from: its unit, the attempting
   *  or defending side of a run/pass try, or null for a kick. */
  static lookSide(play) {
    const unit = countedUnit(play);
    if (unit !== 'special') return unit;
    if (!SpecialTeamsModel.isRunPassTry(play)) return null;
    return SpecialTeamsModel.normalize(play.specialTeams).unit === 'tryDefense' ? 'defense' : 'offense';
  }

  /** A Fake punt or field goal: a run or pass from a kick formation, charted
   *  in Play & Result without a scrimmage look. */
  static isKickFake(play) {
    const st = countedUnit(play) === 'special' ? SpecialTeamsModel.normalize(play?.specialTeams) : null;
    return !!st && st.isFake && !SpecialTeamsModel.isRunPassTry(play);
  }

  /** The offense lost the ball: an interception, or a fumble the offense did
   *  not recover. */
  static isTurnover(play) {
    const parts = String(play?.tags?.result || '').split(/\s*\+\s*/);
    if (parts.includes('Interception')) return true;
    return parts.includes('Fumble') && play?.tags?.fumbleRecovery !== 'subject';
  }

  /** The player roles the play can hold, in Chart's order. A snap ending in a
   *  turnover adds Tackler(s) for the offense's tackle on the return. */
  static baseRoles(play) {
    const side = PlayShape.lookSide(play);
    const st = SpecialTeamsModel.normalize(play?.specialTeams);
    let roles;
    if (side === 'defense') roles = ['tackler', 'takeaway'];
    else if (side === 'offense') roles = ['ballCarrier', 'passer', 'receiver'];
    else roles = SpecialTeamsModel.playerRoles(st);
    if (PlayShape.isKickFake(play)) roles = [...roles, ...['ballCarrier', 'passer', 'receiver'].filter(role => !roles.includes(role))];
    if ((side === 'offense' || PlayShape.isKickFake(play)) && PlayShape.isTurnover(play) && !roles.includes('tackler')) roles = [...roles, 'tackler'];
    return roles;
  }
  /** `baseRoles` plus our missed tacklers on the snaps that name them. */
  static roles(play) {
    const roles = PlayShape.baseRoles(play);
    return MissedTackles.mode(countedUnit(play), play?.specialTeams) === 'ours' ? [...roles, MissedTackles.ROLE] : roles;
  }

  /** Whether the play can hold `tags[key]`. */
  static holdsTag(play, key) {
    if (PlayShape.ALWAYS.includes(key)) return true;
    if (key === 'missedTackles') return MissedTackles.mode(countedUnit(play), play?.specialTeams) === 'theirs';
    const tags = play?.tags || {};
    const opener = ChartingDetails.TRIGGERS.find(trigger => trigger.children.includes(key));
    if (opener && !opener.opened(tags)) return false;
    if (PlayShape.lookSide(play)) return PlayShape.LOOK.includes(key) || PlayShape.PLAY.includes(key);
    if (PlayShape.isKickFake(play)) return PlayShape.PLAY.includes(key);
    return false;
  }

  /** What the play holds that it cannot show: `[{ field, value }]`, with
   *  `players.<role>`, `grades.<role>` and `specialTeams` named as such. */
  static hidden(play) {
    const out = [];
    const tags = play?.tags || {};
    const filled = value => value != null && String(value).trim() !== '';
    for (const [key, value] of Object.entries(tags)) {
      if (['players', 'grades', 'custom', 'customFields'].includes(key)) continue;
      if (typeof value === 'object') continue;
      if (filled(value) && !PlayShape.holdsTag(play, key)) out.push({ field: key, value: String(value) });
    }
    const roles = PlayShape.roles(play);
    for (const [role, value] of Object.entries(tags.players || {})) {
      if (filled(value) && !roles.includes(role)) out.push({ field: `players.${role}`, value: String(value) });
    }
    for (const [role, value] of Object.entries(tags.grades || {})) {
      if (filled(value) && !roles.includes(role)) out.push({ field: `grades.${role}`, value: String(value) });
    }
    if (countedUnit(play) !== 'special' && play?.specialTeams) out.push({ field: 'specialTeams', value: SpecialTeamsModel.normalize(play.specialTeams)?.unit || 'set' });
    return out;
  }

  /** Remove everything the play cannot show, in place. Returns what it removed
   *  (the `hidden` list). Idempotent. */
  static settle(play) {
    const removed = PlayShape.hidden(play);
    const tags = play?.tags;
    for (const { field } of removed) {
      if (field === 'specialTeams') delete play.specialTeams;
      else if (field.startsWith('players.')) delete tags.players[field.slice(8)];
      else if (field.startsWith('grades.')) delete tags.grades[field.slice(7)];
      else tags[field] = '';
    }
    return removed;
  }
}
