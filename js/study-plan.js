/**
 * StudyPlan — the DATA half of Phase 3 step 2: save a Study finding into a
 * game-plan workspace, and resolve a plan back into a watchable cross-game reel.
 *
 * PURE + UNWIRED (like clip-identity.js): no DOM, no store, no film. Persistence is
 * SeasonStore's (`createPlan` / `addPlanItem` — the plans:[] contract, `64c284f`);
 * ordering + film is CrossGameCutup's; the Plan UI is Codex's. This module gives
 * all three ONE canonical label + payload shape so a saved finding is consistent
 * and re-watchable, and a plan flattens to the exact composite `gameId::playId`
 * refs the cross-game player already consumes. Node-tested; the Study/Plan screens
 * wire it up (e.g. `app.studyPlan`) when the UI lands.
 *
 *   const item = StudyPlan.finding({ dimensionName:'Formation', measureName:'Success Rate',
 *       scopeLabel:'full season', groupValue:'Wing-T', sampleSize:18,
 *       dimension:'formation', measure:'successRate', scope:'season', refs:['g1::3','g2::9'] });
 *   seasonStore.addPlanItem(planId, item);              // normalized + persisted
 *   const refs = StudyPlan.planRefs(plan);              // -> CrossGameCutup.plan(refs, games)
 */
export class StudyPlan {
  /**
   * A stable, human label for a saved finding. A group-scoped finding reads
   * "Wing-T — Success Rate (n=18)"; a whole-query finding reads
   * "Formation — Success Rate · full season". Value formatting stays in the UI
   * (units live in the Study screen's _measure), so the label is names + sample.
   */
  static label({ dimensionName, measureName, scopeLabel, groupValue, sampleSize } = {}) {
    const measure = String(measureName || 'metric');
    const n = (sampleSize != null && Number.isFinite(Number(sampleSize))) ? ` (n=${Number(sampleSize)})` : '';
    if (groupValue != null && String(groupValue) !== '') return `${String(groupValue)} — ${measure}${n}`;
    const dim = String(dimensionName || 'Study');
    const scope = scopeLabel ? ` · ${String(scopeLabel)}` : '';
    return `${dim} — ${measure}${scope}`;
  }

  /**
   * Build the planItem payload for SeasonStore.addPlanItem from a Study finding.
   * The store's _normalizePlanItem fills id/createdAt and re-coerces refs, so this
   * only shapes the meaningful fields (and preserves the query context so the Plan
   * screen can show / re-run what produced the finding).
   */
  static finding(opts = {}) {
    return {
      kind: 'finding',
      label: opts.label || StudyPlan.label(opts),
      refs: Array.isArray(opts.refs) ? opts.refs.map(String) : [],
      query: {
        dimension: opts.dimension != null ? opts.dimension : null,
        measure: opts.measure != null ? opts.measure : null,
        scope: opts.scope != null ? opts.scope : null,
        group: opts.groupValue != null ? String(opts.groupValue) : null,
      },
      note: typeof opts.note === 'string' ? opts.note : '',
    };
  }

  /** A bare film-reference item (a coach saving specific clips, no query context). */
  static film(refs, label = '', note = '') {
    return { kind: 'film', label: String(label || ''), refs: Array.isArray(refs) ? refs.map(String) : [], query: null, note: typeof note === 'string' ? note : '' };
  }

  /**
   * Flatten a plan's items into a de-duped, order-preserving composite-ref list —
   * exactly what CrossGameCutup.plan(refs, games) consumes to build the ordered
   * reel. First occurrence wins; only 'finding'/'film' items contribute refs.
   */
  static planRefs(plan) {
    if (!plan || !Array.isArray(plan.items)) return [];
    const out = [], seen = new Set();
    for (const it of plan.items) {
      if (!it || !Array.isArray(it.refs)) continue;
      for (const r of it.refs) {
        const s = String(r);
        if (s && !seen.has(s)) { seen.add(s); out.push(s); }
      }
    }
    return out;
  }
}
