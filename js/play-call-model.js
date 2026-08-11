import { StatsEngine } from './stats-engine.js';

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
    play.tags.playCall = next.name;
    play.tags.playCallId = next.id;
    play.tags.playConcept = next.concept;
    play.tags.playCallDefaults = applied;
    return true;
  }
}