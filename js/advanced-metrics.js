/**
 * AdvancedMetrics - Expected Points (EP) and EPA calculations.
 *
 * EP is approximated by a piecewise-linear curve over yard line (1..99 from
 * own goal), with adjustments for down and distance. Coefficients are
 * hand-tuned to match the rough shape of nflfastR-derived EP for high school
 * / college football. Not as precise as a full ML model, but useful for
 * relative comparison: which plays / formations / play types are gaining
 * the most expected points.
 *
 * EPA per play = EP_after_play - EP_before_play.
 *
 * Required tags: yardLine + fieldSide, down, distance, yardage, result.
 * Plays missing any required field are skipped (returns null).
 */
export class AdvancedMetrics {
  /** Expected Points at a given (yardLineFromOwnGoal 1..99, down, distance) */
  ep(yl, down, distance) {
    if (yl == null || isNaN(yl)) return null;
    yl = Math.max(1, Math.min(99, yl));

    // Piecewise base curve anchored on rough public EP values
    let base;
    if (yl <= 25)      base = -1.5 + (yl - 1)  * (2.5 / 24);
    else if (yl <= 50) base =  1.0 + (yl - 25) * (1.5 / 25);
    else if (yl <= 75) base =  2.5 + (yl - 50) * (1.5 / 25);
    else               base =  4.0 + (yl - 75) * (2.0 / 24);

    const downAdj = ({ 1: 0, 2: -0.5, 3: -1.4, 4: -2.4 })[parseInt(down)] || 0;

    const d = parseInt(distance) || 10;
    let distAdj = 0;
    if (d <= 3)        distAdj = 0.25;
    else if (d <= 6)   distAdj = 0;
    else if (d <= 10)  distAdj = -0.2;
    else               distAdj = -0.7;

    return +(base + downAdj + distAdj).toFixed(2);
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  /** Compute EPA for a single play. Returns null if data is insufficient. */
  computeEPA(play) {
    const t = play.tags || {};
    const ylBefore = this._absYardLine(t);
    if (ylBefore == null || !t.down) return null;

    const epBefore = this.ep(ylBefore, t.down, t.distance);
    if (epBefore == null) return null;

    const yds = parseInt(t.yardage) || 0;
    const ylAfter = Math.max(0, Math.min(100, ylBefore + yds));
    const result = t.result || '';
    let epAfter = null;

    // Scoring & special outcomes
    if (result === 'Touchdown') {
      epAfter = 7;
    } else if (result === 'Field Goal') {
      epAfter = 3;
    } else if (result === 'Interception' || result === 'Fumble') {
      const oppEp = this.ep(100 - ylAfter, 1, 10);
      if (oppEp == null) return null;
      epAfter = -oppEp;
    } else if (result === 'Punt') {
      // Average net punt of ~40 yards
      const oppStart = Math.max(20, 100 - (ylAfter + 40));
      const oppEp = this.ep(oppStart, 1, 10);
      if (oppEp == null) return null;
      epAfter = -oppEp;
    } else if (result === 'Safety') {
      epAfter = -2;
    } else {
      // Compute next down/distance
      const dist = parseInt(t.distance) || 10;
      const gotFirst = yds >= dist || t.custom?.includes('1st Down');
      if (gotFirst) {
        epAfter = this.ep(ylAfter, 1, 10);
      } else {
        const nextDown = parseInt(t.down) + 1;
        if (nextDown > 4) {
          // Turnover on downs
          const oppEp = this.ep(100 - ylAfter, 1, 10);
          if (oppEp == null) return null;
          epAfter = -oppEp;
        } else {
          epAfter = this.ep(ylAfter, nextDown, Math.max(1, dist - yds));
        }
      }
    }

    if (epAfter == null) return null;
    return +(epAfter - epBefore).toFixed(3);
  }

  /** Returns [{play, epa}] for all plays, with epa=null where data is missing. */
  computeAll(plays) {
    return plays.map(p => ({ play: p, epa: this.computeEPA(p) }));
  }

  /** Build a summary object suitable for rendering in the stats dashboard. */
  summarize(plays) {
    const all = this.computeAll(plays);
    const withEpa = all.filter(x => x.epa !== null);

    if (!withEpa.length) {
      return {
        total: 0, count: 0, perPlay: 0,
        byType: [], byFormation: [], byPersonnel: [], byDown: {},
        top: [], worst: [], curve: []
      };
    }

    const total = withEpa.reduce((s, x) => s + x.epa, 0);

    // By play type
    const groupBy = (key) => {
      const m = {};
      for (const x of withEpa) {
        const k = x.play.tags[key] || 'Unknown';
        if (!m[k]) m[k] = { name: k, total: 0, count: 0 };
        m[k].total += x.epa;
        m[k].count++;
      }
      return Object.values(m)
        .map(g => ({ ...g, total: +g.total.toFixed(2), perPlay: +(g.total / g.count).toFixed(3) }))
        .sort((a, b) => b.perPlay - a.perPlay);
    };

    const byType = groupBy('playType');
    const byFormation = groupBy('formation');
    const byPersonnel = groupBy('personnel');

    // By down
    const byDown = {};
    for (const d of ['1', '2', '3', '4']) {
      const dPlays = withEpa.filter(x => x.play.tags.down === d);
      const dTotal = dPlays.reduce((s, x) => s + x.epa, 0);
      byDown[d] = {
        count: dPlays.length,
        total: +dTotal.toFixed(2),
        perPlay: dPlays.length ? +(dTotal / dPlays.length).toFixed(3) : 0
      };
    }

    // Top / worst plays
    const sorted = withEpa.slice().sort((a, b) => b.epa - a.epa);
    const top = sorted.slice(0, 5);
    const worst = sorted.slice(-5).reverse();

    // Cumulative EPA curve in chronological order
    let cum = 0;
    const curve = withEpa.map((x, i) => {
      cum += x.epa;
      return { i, cum: +cum.toFixed(2), epa: x.epa, playId: x.play.id };
    });

    return {
      total: +total.toFixed(2),
      count: withEpa.length,
      perPlay: +(total / withEpa.length).toFixed(3),
      byType, byFormation, byPersonnel, byDown,
      top, worst, curve
    };
  }
}
