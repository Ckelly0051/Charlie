import { TagProjection } from './tag-projection.js';

/**
 * THE CURRENT SEASON FORMAT, and the one place that knows the retired shapes
 * (legacy excision Pass 2, step 6).
 *
 * The live catalog was converted once on 2026-09-26 (tools/convert-legacy-once.mjs, deleted after use; commit 71761f5).
 * Nothing in the app reads an old shape any more; instead every path that brings
 * data IN from somewhere else -- a season file import, a season restore point, a
 * game version, the Documents mirror, a first-run JSON import -- asks this owner
 * first and refuses an old file before anything is written. The file on disk
 * stays exactly as it is.
 *
 * It detects; it never converts. The checks are the conversion's own:
 *   - a charted play with no unit
 *   - a combined look (an alignment inside Formation, Empty inside Formation, a
 *     family inside Coverage): the look commit would still change it
 *   - a retired Special Teams tag (stType, kickOutcome, scoreFor, kickDistance,
 *     returnYards, hangTime, kickedTo)
 *   - an extra point stored on a Field Goal unit
 *   - custom tags stored as anything but a list
 *   - a game node carrying its own roster
 *   - a single-game save (plays with no games array)
 */
export class SeasonFormat {
  static RETIRED_TAG_KEYS = Object.freeze(['stType', 'kickOutcome', 'scoreFor', 'kickDistance', 'returnYards', 'hangTime', 'kickedTo']);

  static MESSAGE = 'This file uses an old GridIron IQ format and was not opened. Export it again from the current app.';
  static RESTORE_MESSAGE = 'This restore point was saved in an old format and cannot be restored. Nothing was changed.';

  static UNITS = Object.freeze(['offense', 'defense', 'special']);

  static _isObject(v) { return !!v && typeof v === 'object' && !Array.isArray(v); }

  /**
   * The reasons one play is not current; empty when it is. Every current play
   * carries a tags object with one of the three units (PlayTagger.blankTags is
   * the only way a play is born); anything else is refused, not waved through.
   */
  static playProblems(play) {
    if (!this._isObject(play)) return ['malformed play'];
    const out = [];
    const tags = play.tags;
    if (!this._isObject(tags)) out.push('missing tags');
    else {
      if (!this.UNITS.includes(tags.unit)) out.push('no unit');
      if (TagProjection.isCombined(tags)) out.push('combined look');
      if (this.RETIRED_TAG_KEYS.some(k => Object.prototype.hasOwnProperty.call(tags, k))) out.push('retired Special Teams tag');
      if (tags.custom != null && !Array.isArray(tags.custom)) out.push('custom tags not a list');
    }
    // Checked whether or not the tags are usable.
    const st = play.specialTeams;
    if (this._isObject(st) && (st.unit === 'fieldGoal' || st.unit === 'fieldGoalBlock') && st.attemptType === 'extraPoint') out.push('extra point on a Field Goal unit');
    return out;
  }

  static _playsProblems(list, label, out) {
    if (!Array.isArray(list)) { out.push({ where: label, problem: 'no plays list' }); return; }
    list.forEach((p, i) => this.playProblems(p).forEach(problem => out.push({ where: `${label} play ${p && p.id != null ? p.id : `#${i + 1}`}`, problem })));
  }

  /**
   * A SEASON body: a games array whose every game is an object carrying a plays
   * array (an empty one is fine). A single-game save is the retired format.
   * Returns [{ where, problem }]; empty means current.
   */
  static seasonProblems(data) {
    if (!this._isObject(data)) return [{ where: '', problem: 'not a GridIron IQ file' }];
    if (!Array.isArray(data.games)) {
      return [{ where: '', problem: Array.isArray(data.plays) ? 'single-game save' : 'not a GridIron IQ season' }];
    }
    const out = [];
    data.games.forEach((g, gi) => {
      const label = (this._isObject(g) && g.name) || `game ${gi + 1}`;
      if (!this._isObject(g)) { out.push({ where: label, problem: 'malformed game' }); return; }
      if (Object.prototype.hasOwnProperty.call(g, 'roster')) out.push({ where: label, problem: 'game roster' });
      this._playsProblems(g.plays, label, out);
    });
    return out;
  }

  /**
   * A GAME snapshot (a game version, StorageManager._serialize): an object
   * carrying a plays array. `{}` is not a game and is refused: restoring it
   * would replace the open game's plays with nothing.
   */
  static gameProblems(data) {
    if (!this._isObject(data)) return [{ where: '', problem: 'not a GridIron IQ game' }];
    const out = [];
    if (Object.prototype.hasOwnProperty.call(data, 'roster')) out.push({ where: 'game', problem: 'game roster' });
    this._playsProblems(data.plays, data.name || 'game', out);
    return out;
  }

  static isCurrentSeason(data) { return this.seasonProblems(data).length === 0; }
  static isCurrentGame(data) { return this.gameProblems(data).length === 0; }

  /** Template values minus anything retired or combined, so applying one
   *  writes no old shape. */
  static currentTagValues(values) {
    const out = {};
    for (const [k, v] of Object.entries(values || {})) {
      if (this.RETIRED_TAG_KEYS.includes(k)) continue;
      if (['formation', 'backfield', 'coverage'].includes(k) && TagProjection.isCombined({ [k]: v })) continue;
      out[k] = v;
    }
    return out;
  }
}
