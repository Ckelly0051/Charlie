/**
 * The run and motion details a play can carry beside its call, and the rules
 * that tie each detail to the field that opens it (docs/archive/plans/GRIDIRON-IQ-PLAN-V2-THROUGH-2026-10-04.md,
 * "Approved Break Down charting comp - build contract"). Pure and DOM-free:
 * Chart, Film Room, CSV import and the analytics registry all read it.
 *
 *   Gap            where the ball actually hit (not the called gap). One value,
 *                  independent of the coach's Play Direction.
 *   Motion path    where the motion starts and ends (offense left / middle /
 *                  right), opened by Motion.
 *   RPO            read defender, an optional jersey number and the decision
 *                  (Give / Keep / Throw), opened by the RPO Play Type.
 *   QB run         Designed / Scramble / RPO keeper, opened by the QB Run Play
 *                  Type.
 *
 * Nothing here infers a value: a blank stays uncharted. Motion, RPO and QB-run
 * details need their opening field; removing it clears them in the same write.
 * Gap has no opening-field requirement.
 */
export class ChartingDetails {
  static GAPS = Object.freeze(['L-A', 'L-B', 'L-C', 'L-D', 'R-A', 'R-B', 'R-C', 'R-D', 'Center', 'Other']);
  static PATH_POINTS = Object.freeze(['Left', 'Middle', 'Right']);
  static RPO_READS = Object.freeze(['End', 'Apex', 'Box', 'Other']);
  static RPO_DECISIONS = Object.freeze(['Give', 'Keep', 'Throw']);
  static QB_RUNS = Object.freeze(['Designed', 'Scramble', 'RPO Keeper']);
  /** First count is left, second is right; personnel describes the total. */
  static RECEIVER_SETS = Object.freeze(['0x1','0x2','0x3','0x4','0x5','1x0','1x1','1x2','1x3','1x4','2x0','2x1','2x2','2x3','3x0','3x1','3x2','4x0','4x1','5x0']);
  static LINE_STRENGTHS = Object.freeze(['Left','Right','Balanced','Unbalanced Left','Unbalanced Right']);
  static strengthSide(value) {
    const v = typeof value === 'string' ? value.trim() : '';
    if (v === 'Left' || v === 'Unbalanced Left') return 'Left';
    if (v === 'Right' || v === 'Unbalanced Right') return 'Right';
    return '';
  }

  /** Every field this module owns on a play's tags. */
  static KEYS = Object.freeze(['formationFamily', 'receiverSet', 'gap', 'motionStart', 'motionEnd',
    'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun']);

  /** Each opening field and the details it opens. */
  static TRIGGERS = Object.freeze([
    { id: 'motion', label: 'Motion path', children: ['motionStart', 'motionEnd'], opened: t => !!clean(t.motion) },
    { id: 'rpo', label: 'RPO details', children: ['rpoRead', 'rpoDefender', 'rpoDecision'], opened: t => hasType(t, 'RPO') },
    { id: 'qbRun', label: 'QB run', children: ['qbRun'], opened: t => hasType(t, 'QB Run') },
  ]);

  static CHILD_LABELS = Object.freeze({
    motionStart: 'Motion start', motionEnd: 'Motion end', rpoRead: 'RPO read', rpoDefender: 'RPO defender',
    rpoDecision: 'RPO decision', qbRun: 'QB run', gap: 'Gap',
  });

  /** Lateral gap classification for reports only; never writes Play Direction. */
  static gapDirection(gap) {
    const value = clean(gap);
    if (value === 'Center') return 'Middle';
    if (/^L-[A-D]$/.test(value)) return 'Left';
    if (/^R-[A-D]$/.test(value)) return 'Right';
    return null;
  }
  /**
   * What writing `next` to `tags[key]` would take away, before it is written:
   * `[{ key, label, value }]` for each populated triggered detail being removed.
   * Callers obtain coach confirmation before clearing these details.
   */
  static orphans(tags, key, next) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const out = [];
    const after = { ...t, [key]: next };
    for (const trigger of ChartingDetails.TRIGGERS) {
      if (!trigger.opened(t) || trigger.opened(after)) continue;
      for (const child of trigger.children) {
        if (clean(t[child])) out.push({ key: child, label: ChartingDetails.CHILD_LABELS[child], value: clean(t[child]) });
      }
    }
    return out;
  }

  /**
   * Clear details whose opening field is gone. Gap and Direction are independent.
   * Returns the keys cleared.
   * Idempotent. Callers confirm removals first (`orphans`).
   */
  static settle(tags, key) {
    const cleared = [];
    if (!tags || typeof tags !== 'object') return cleared;
    for (const trigger of ChartingDetails.TRIGGERS) {
      if (trigger.opened(tags)) continue;
      for (const child of trigger.children) {
        if (clean(tags[child])) { tags[child] = ''; cleared.push(child); }
      }
    }
    return cleared;
  }

  /** Why a set of tags cannot be stored as charted: a detail without the field
   *  that opens it. Gap never requires a Direction. Empty when the
   *  tags hold together. CSV import refuses a row that fails this. */
  static problems(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const out = [];
    for (const trigger of ChartingDetails.TRIGGERS) {
      if (trigger.opened(t)) continue;
      for (const child of trigger.children) {
        if (clean(t[child])) out.push(`${ChartingDetails.CHILD_LABELS[child]} needs ${trigger.id === 'motion' ? 'a Motion type' : trigger.id === 'rpo' ? 'the RPO Play Type' : 'the QB Run Play Type'}`);
      }
    }
    return out;
  }

  /** The fixed-vocabulary details whose stored value is not one the app offers,
   *  as plain sentences; empty when every value is valid. Blank is valid. */
  static vocabularyProblems(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const checks = [
      ['strength', 'Offensive Line Strength', ChartingDetails.LINE_STRENGTHS],
      ['receiverSet', 'Receiver Alignment', ChartingDetails.RECEIVER_SETS], ['gap', 'Gap', ChartingDetails.GAPS],
      ['motionStart', 'Motion Starts', ChartingDetails.PATH_POINTS], ['motionEnd', 'Motion Ends', ChartingDetails.PATH_POINTS],
      ['rpoRead', 'RPO Read', ChartingDetails.RPO_READS], ['rpoDecision', 'RPO Decision', ChartingDetails.RPO_DECISIONS],
      ['qbRun', 'QB Run Type', ChartingDetails.QB_RUNS],
    ];
    const out = [];
    for (const [key, label, allowed] of checks) {
      if (t[key] != null && typeof t[key] !== 'string') {
        out.push(`${label} must be text`);
        continue;
      }
      const value = clean(t[key]);
      if (value && !allowed.includes(value)) out.push(`${label} "${value}" is not one of ${allowed.join(', ')}`);
    }
    const defender = clean(t.rpoDefender);
    if (defender && !/^\d{1,3}$/.test(defender)) out.push(`RPO Defender "${defender}" is not a jersey number`);
    return out;
  }

  /** What a decision says about Run/Pass: Give and Keep are runs, Throw is a
   *  pass; '' for none. A disagreement with an explicit Run/Pass is shown to the
   *  coach and never overwritten. */
  static rpoDecisionRunPass(decision) {
    const value = clean(decision);
    return value === 'Give' || value === 'Keep' ? 'Run' : value === 'Throw' ? 'Pass' : '';
  }

  /** A coach-facing sentence for a confirmation that names what is cleared. */
  static clearMessage(orphans) {
    const names = orphans.map(item => `${item.label} ${item.value}`);
    return `This clears ${names.join(', ')}.`;
  }
}

function clean(value) { return typeof value === 'string' ? value.trim() : value == null ? '' : String(value).trim(); }
function hasType(tags, type) {
  return String(tags.playType || '').split(/\s*\+\s*/).map(part => part.trim()).includes(type);
}
