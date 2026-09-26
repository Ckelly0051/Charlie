import { TagProjection } from './tag-projection.js';

/**
 * THE CURRENT SEASON FORMAT, and the one place that knows the retired shapes
 * (legacy excision Pass 2, step 6).
 *
 * The live catalog was converted once on 2026-09-26 (tools/convert-legacy-once.mjs).
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
 *   - a game node carrying its own roster
 *   - a single-game save (plays with no games array)
 */
export class SeasonFormat {
  static RETIRED_TAG_KEYS = Object.freeze(['stType', 'kickOutcome', 'scoreFor', 'kickDistance', 'returnYards', 'hangTime', 'kickedTo']);

  static MESSAGE = 'This file uses an old GridIron IQ format and was not opened. Export it again from the current app.';
  static RESTORE_MESSAGE = 'This restore point was saved in an old format and cannot be restored. Nothing was changed.';

  /** The reasons one play is in the old format; empty when it is current. */
  static playProblems(play) {
    const out = [];
    const tags = play && play.tags;
    if (!tags || typeof tags !== 'object') return out;
    if (Object.keys(tags).length && (tags.unit === undefined || tags.unit === '')) out.push('no unit');
    const probe = { tags: JSON.parse(JSON.stringify(tags)) };
    if (TagProjection.commitLook(probe)) out.push('combined look');
    if (this.RETIRED_TAG_KEYS.some(k => Object.prototype.hasOwnProperty.call(tags, k))) out.push('retired Special Teams tag');
    const st = play.specialTeams;
    if (st && (st.unit === 'fieldGoal' || st.unit === 'fieldGoalBlock') && st.attemptType === 'extraPoint') out.push('extra point on a Field Goal unit');
    return out;
  }

  /**
   * Every problem in a season body, a game, or a game snapshot ({ plays }).
   * Returns [{ where, problem }]; empty means current.
   */
  static problems(data) {
    const out = [];
    if (!data || typeof data !== 'object') return [{ where: '', problem: 'not a GridIron IQ file' }];
    const plays = (list, label) => (list || []).forEach(p =>
      this.playProblems(p).forEach(problem => out.push({ where: `${label} play ${p.id}`, problem })));
    if (Array.isArray(data.games)) {
      data.games.forEach((g, gi) => {
        const label = g.name || `game ${gi + 1}`;
        if (Object.prototype.hasOwnProperty.call(g, 'roster')) out.push({ where: label, problem: 'game roster' });
        plays(g.plays, label);
      });
    } else if (Array.isArray(data.plays)) {
      // A game snapshot (a game version) is its plays.
      plays(data.plays, data.name || 'game');
    }
    return out;
  }

  /** A season body must carry a games array; a single-game save is retired. */
  static seasonProblems(data) {
    if (data && !Array.isArray(data.games) && Array.isArray(data.plays)) return [{ where: '', problem: 'single-game save' }];
    return this.problems(data);
  }

  static isCurrent(data) { return this.problems(data).length === 0; }
  static isCurrentSeason(data) { return this.seasonProblems(data).length === 0; }

  /** Template values minus anything retired, so applying one writes no old shape. */
  static currentTagValues(values) {
    const out = {};
    for (const [k, v] of Object.entries(values || {})) if (!this.RETIRED_TAG_KEYS.includes(k)) out[k] = v;
    return out;
  }
}
