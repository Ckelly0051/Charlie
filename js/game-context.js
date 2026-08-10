/**
 * GameContext — the per-game charting context, without the hidden form.
 *
 * WHY THIS EXISTS (S7-d1)
 *
 * Perspective, direction and team identity were passed around through six
 * hidden inputs inside `#legacyGameContextState`, which lives in `#app` and
 * which S7-d8 deletes. Reads went straight to `document.getElementById(...)`
 * and writes went through a SYNTHETIC `change` event on `#gamePerspective`
 * that three separate subscribers listened for. That is an event bus made of
 * markup: delete the markup and every read silently returns `''`.
 *
 * `direction` was the sharp edge. `_saveGameInfo()` read it as
 * `getElementById('gameDirection')?.value || ''`, so once the input is gone it
 * writes an empty string over the coach's stored value — a silent data loss,
 * not a visible break.
 *
 * OWNERSHIP, unchanged by this file
 *   durable  SeasonStore.activeGame().gameInfo
 *   working  StorageManager.gameInfo
 * GameContext owns neither. It is the read/write/notify seam over the working
 * owner, so the DOM stops being the transport.
 *
 * CONTRACT
 *   snapshot()          the current context, as a plain frozen object
 *   update(patch)       merge + persist through the canonical draft path
 *   subscribe(fn)       fn(snapshot) on every change; returns an unsubscribe
 *   notify()            re-publish after something else changed gameInfo
 *
 * No DOM. Not one getElementById.
 */

/** The fields this service owns. Everything else on gameInfo belongs to GameScreen. */
export const CONTEXT_FIELDS = ['perspective', 'direction', 'teamName', 'jerseyColor'];

export const PERSPECTIVES = ['offense', 'defense', 'special', 'scout'];
export const DIRECTIONS = ['', 'left', 'right'];

export class GameContext {
  /**
   * @param {object}   deps
   * @param {object}   deps.storage    StorageManager — the working owner.
   * @param {function} deps.applyDraft (patch) => gameInfo — the canonical write
   *                                   path (App._applyGameInfoDraft), so derived
   *                                   fields and persistence stay in one place.
   */
  constructor({ storage, applyDraft } = {}) {
    this.storage = storage || null;
    this._applyDraft = typeof applyDraft === 'function' ? applyDraft : null;
    this._subscribers = new Set();
    this._last = null;
  }

  _info() { return this.storage?.gameInfo || {}; }

  /**
   * The current context. Frozen, so a subscriber cannot mutate shared state and
   * make the next snapshot disagree with the store.
   */
  snapshot() {
    const info = this._info();
    return Object.freeze({
      perspective: info.perspective || 'offense',
      direction: info.direction || '',
      teamName: info.teamName || '',
      jerseyColor: info.jerseyColor || '',
      // Convenience for report labels, which want a subject name and used to
      // read it from #gameTeamName.
      subjectLabel: info.teamName || '',
    });
  }

  /** True when this game is opponent film rather than one of ours. */
  isScout() { return this.snapshot().perspective === 'scout'; }

  /**
   * Merge a patch into the game context.
   *
   * `scout` is STICKY by design: it is a property of the FILM, decided at game
   * setup, so a per-play unit change must never silently turn opponent film
   * into one of our own games. Callers that derive perspective from the
   * charting unit pass `{ fromUnit: true }` and are refused while scouting.
   *
   * Returns true when something actually changed.
   */
  update(patch = {}, { fromUnit = false, silent = false } = {}) {
    const before = this.snapshot();
    const next = {};

    if ('perspective' in patch) {
      const value = String(patch.perspective || '');
      if (!PERSPECTIVES.includes(value)) return false;
      if (fromUnit && before.perspective === 'scout') return false;
      if (value !== before.perspective) next.perspective = value;
    }
    if ('direction' in patch) {
      const value = String(patch.direction || '');
      if (!DIRECTIONS.includes(value)) return false;
      if (value !== before.direction) next.direction = value;
    }
    if ('teamName' in patch) {
      const value = String(patch.teamName ?? '');
      if (value !== before.teamName) next.teamName = value;
    }
    if ('jerseyColor' in patch) {
      const value = String(patch.jerseyColor ?? '');
      if (value !== before.jerseyColor) next.jerseyColor = value;
    }

    if (!Object.keys(next).length) return false;
    if (this._applyDraft) this._applyDraft(next);
    else if (this.storage) this.storage.gameInfo = { ...this._info(), ...next };
    if (!silent) this.notify();
    return true;
  }

  /**
   * Publish the current snapshot. Called by whoever changed gameInfo through
   * another path — opening a game, a canonical reload, clearing for a new game.
   * Publishing an unchanged snapshot is a no-op so a reload does not churn
   * every subscriber.
   */
  notify({ force = false } = {}) {
    const snap = this.snapshot();
    if (!force && this._last && CONTEXT_FIELDS.every(k => this._last[k] === snap[k])) return snap;
    this._last = snap;
    for (const fn of [...this._subscribers]) {
      try { fn(snap); } catch (e) { console.warn('GameContext subscriber failed:', e); }
    }
    return snap;
  }

  /** Subscribe to context changes. Returns an unsubscribe function. */
  subscribe(fn) {
    if (typeof fn !== 'function') return () => {};
    this._subscribers.add(fn);
    return () => this._subscribers.delete(fn);
  }

  /** Test/diagnostic surface: how many listeners are attached. */
  get subscriberCount() { return this._subscribers.size; }
}
