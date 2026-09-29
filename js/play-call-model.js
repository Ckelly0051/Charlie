import { StatsEngine } from './stats-engine.js';
import { ChartingDetails } from './charting-details.js';

/** DOM-free play-call application rules shared by Chart and Film Room. */
export class PlayCallModel {
  static protectOverride(play, key) {
    if (!play?.tags?.playCallDefaults || typeof play.tags.playCallDefaults !== 'object') return;
    delete play.tags.playCallDefaults[key];
  }

  static resolve(value, playbook) {
    const text = String(value || '').trim();
    const call = (playbook?.list?.() || []).find(item =>
      item.id === text || item.name.toLowerCase() === text.toLowerCase());
    return call || (text
      ? { id: '', name: text, concept: '', defaults: {} }
      : { id: '', name: '', concept: '', defaults: {} });
  }

  /**
   * What applying `value` would take away: `[{ key, label, value }]` for each
   * charted detail (Gap, motion path, RPO, QB run) the call's own defaults would
   * clear, because the call replaces the Direction, Motion or Play Type that
   * opened it. Asks by applying to a copy; `play` is not touched.
   */
  static losses(play, value, playbook, inferRunPass) {
    if (!play?.tags) return [];
    const probe = { ...play, tags: JSON.parse(JSON.stringify(play.tags)) };
    this.apply(probe, value, playbook, inferRunPass);
    return Object.keys(ChartingDetails.CHILD_LABELS)
      .filter(key => String(play.tags[key] ?? '').trim() && !String(probe.tags[key] ?? '').trim())
      .map(key => ({ key, label: ChartingDetails.CHILD_LABELS[key], value: String(play.tags[key]).trim() }));
  }

  static apply(play, value, playbook, inferRunPass) {
    if (!play?.tags) return false;
    const next = this.resolve(value, playbook);
    const previous = play.tags.playCallDefaults && typeof play.tags.playCallDefaults === 'object'
      ? play.tags.playCallDefaults : {};
    const projected = StatsEngine.proj(play);
    const applied = {};
    for (const key of (playbook?.constructor?.DEFAULT_KEYS || [])) {
      const current = String(projected?.[key] ?? play.tags[key] ?? '').trim();
      const priorOwned = Object.hasOwn(previous, key) && current === String(previous[key] ?? '').trim();
      const incoming = String(next.defaults?.[key] || '').trim();
      if (priorOwned) {
        play.tags[key] = incoming;
        if (incoming) applied[key] = incoming;
      } else if (!current && incoming) {
        play.tags[key] = incoming;
        applied[key] = incoming;
      }
    }
    if (!String(play.tags.runPass || '').trim() && applied.playType) {
      const inferred = inferRunPass?.(play.tags.playType);
      if (inferred) {
        play.tags.runPass = inferred;
        applied.runPass = inferred;
      }
    }
    // A call's default direction or motion may leave a charted Gap or path
    // disagreeing with it; the same settling every chart write makes. Callers
    // that write for a coach ask first (`losses`).
    ChartingDetails.settle(play.tags, 'playDir');
    play.tags.playCall = next.name;
    play.tags.playCallId = next.id;
    play.tags.playConcept = next.concept;
    play.tags.playCallDefaults = applied;
    return true;
  }
}