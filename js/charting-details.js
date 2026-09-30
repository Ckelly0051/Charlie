/**
 * The run and motion details a play can carry beside its call, and the rules
 * that tie each detail to the field that opens it (GRIDIRON-IQ-PLAN-V2.md,
 * "Approved Break Down charting comp - build contract"). Pure and DOM-free:
 * Chart, Film Room, CSV import and the analytics registry all read it.
 *
 *   Gap            where the ball actually hit (not the called gap). One value,
 *                  opened by Play Direction. A sided gap names its direction;
 *                  Center is Middle; Other names none.
 *   Motion path    where the motion starts and ends (offense left / middle /
 *                  right), opened by Motion.
 *   RPO            read defender, an optional jersey number and the decision
 *                  (Give / Keep / Throw), opened by the RPO Play Type.
 *   QB run         Designed / Scramble / RPO keeper, opened by the QB Run Play
 *                  Type.
 *
 * Nothing here infers a value: a blank stays uncharted. A detail is never
 * stored without the field that opens it, so removing that field clears its
 * details in the same write.
 */
export class ChartingDetails {
  static GAPS = Object.freeze(['L-A', 'L-B', 'L-C', 'L-D', 'R-A', 'R-B', 'R-C', 'R-D', 'Center', 'Other']);
  static PATH_POINTS = Object.freeze(['Left', 'Middle', 'Right']);
  static RPO_READS = Object.freeze(['End', 'Apex', 'Box', 'Other']);
  static RPO_DECISIONS = Object.freeze(['Give', 'Keep', 'Throw']);
  static QB_RUNS = Object.freeze(['Designed', 'Scramble', 'RPO Keeper']);
  /** Receiver counts; side is charted separately and never inferred here. */
  static RECEIVER_SETS = Object.freeze(['2x2', '3x1', '2x1', '3x2', '1x1', '4x1', '2x0', '3x0']);
  static RECEIVER_STRENGTHS = Object.freeze(['Left', 'Right', 'Balanced']);
  static LINE_BALANCES = Object.freeze(['Balanced', 'Unbalanced']);

  /** Every field this module owns on a play's tags. */
  static KEYS = Object.freeze(['formationFamily', 'receiverSet', 'receiverStrength', 'lineBalance', 'gap', 'motionStart', 'motionEnd',
    'rpoRead', 'rpoDefender', 'rpoDecision', 'qbRun']);

  /** Each opening field and the details it opens. */
  static TRIGGERS = Object.freeze([
    { id: 'motion', label: 'Motion path', children: ['motionStart', 'motionEnd'], opened: t => !!clean(t.motion) },
    { id: 'rpo', label: 'RPO details', children: ['rpoRead', 'rpoDefender', 'rpoDecision'], opened: t => hasType(t, 'RPO') },
    { id: 'qbRun', label: 'QB run', children: ['qbRun'], opened: t => hasType(t, 'QB Run') },
  ]);

  static CHILD_LABELS = Object.freeze({
    receiverStrength: 'Receiver strength',
    motionStart: 'Motion start', motionEnd: 'Motion end', rpoRead: 'RPO read', rpoDefender: 'RPO defender',
    rpoDecision: 'RPO decision', qbRun: 'QB run', gap: 'Gap',
  });

  /** The Play Direction a gap implies, or null when it implies none. */
  static gapDirection(gap) {
    const value = clean(gap);
    if (value === 'Center') return 'Middle';
    if (/^L-[A-D]$/.test(value)) return 'Left';
    if (/^R-[A-D]$/.test(value)) return 'Right';
    return null;
  }

  /** A gap agrees with a direction when it implies none (blank, Other) or the
   *  direction is the one it implies. A sided gap under a blank direction is not
   *  consistent: a sided gap sets its direction when it is charted. */
  static gapAgrees(gap, direction) {
    const implied = ChartingDetails.gapDirection(gap);
    return implied === null || clean(direction) === implied;
  }

  /**
   * What writing `next` to `tags[key]` would take away, before it is written:
   * `[{ key, label, value, coupled }]` for every populated detail the write
   * orphans. `coupled` is true for a Gap that a direction change contradicts
   * (the approved interaction clears it on the spot); everything else is a
   * detail whose opening field is being removed, which the coach confirms.
   */
  static orphans(tags, key, next) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const out = [];
    const after = { ...t, [key]: next };
    for (const trigger of ChartingDetails.TRIGGERS) {
      if (!trigger.opened(t) || trigger.opened(after)) continue;
      for (const child of trigger.children) {
        if (clean(t[child])) out.push({ key: child, label: ChartingDetails.CHILD_LABELS[child], value: clean(t[child]), coupled: false });
      }
    }
    if (key === 'playDir' && clean(t.gap) && !ChartingDetails.gapAgrees(t.gap, next)) {
      // Choosing another direction is the approved clear; removing the
      // direction is a removal the coach confirms.
      out.push({ key: 'gap', label: ChartingDetails.CHILD_LABELS.gap, value: clean(t.gap), coupled: !!clean(next) });
    }
    return out;
  }

  /**
   * The consequences of a write that has just been applied to `tags`: a gap
   * sets its direction, a direction that contradicts the gap clears it, and a
   * detail whose opening field is gone is cleared. Returns the keys cleared.
   * Idempotent. Callers confirm removals first (`orphans`).
   */
  static settle(tags, key) {
    const cleared = [];
    if (!tags || typeof tags !== 'object') return cleared;
    if (key === 'gap') {
      const implied = ChartingDetails.gapDirection(tags.gap);
      if (implied) tags.playDir = implied;
    }
    if (!ChartingDetails.gapAgrees(tags.gap, tags.playDir)) { tags.gap = ''; cleared.push('gap'); }
    for (const trigger of ChartingDetails.TRIGGERS) {
      if (trigger.opened(tags)) continue;
      for (const child of trigger.children) {
        if (clean(tags[child])) { tags[child] = ''; cleared.push(child); }
      }
    }
    return cleared;
  }

  /** Why a set of tags cannot be stored as charted: a detail without the field
   *  that opens it, or a gap that disagrees with the direction. Empty when the
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
    if (clean(t.gap) && !ChartingDetails.gapAgrees(t.gap, t.playDir)) out.push(`Gap ${clean(t.gap)} disagrees with Play Direction ${clean(t.playDir) || '(blank)'}`);
    return out;
  }

  /** The fixed-vocabulary details whose stored value is not one the app offers,
   *  as plain sentences; empty when every value is valid. Blank is valid. */
  static vocabularyProblems(tags) {
    const t = tags && typeof tags === 'object' ? tags : {};
    const checks = [
      ['receiverStrength', 'Receiver Strength', ChartingDetails.RECEIVER_STRENGTHS],
      ['lineBalance', 'Line Balance', ChartingDetails.LINE_BALANCES],
      ['receiverSet', 'Receiver Distribution', ChartingDetails.RECEIVER_SETS], ['gap', 'Gap', ChartingDetails.GAPS],
      ['motionStart', 'Motion Starts', ChartingDetails.PATH_POINTS], ['motionEnd', 'Motion Ends', ChartingDetails.PATH_POINTS],
      ['rpoRead', 'RPO Read', ChartingDetails.RPO_READS], ['rpoDecision', 'RPO Decision', ChartingDetails.RPO_DECISIONS],
      ['qbRun', 'QB Run Type', ChartingDetails.QB_RUNS],
    ];
    const out = [];
    for (const [key, label, allowed] of checks) {
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
