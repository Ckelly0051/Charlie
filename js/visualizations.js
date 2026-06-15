/**
 * Visualizations — SVG charts for the stats dashboard (no libraries).
 *
 * Adds the visual pieces tabular stats miss:
 *   1. Success-by-field-zone  — a field strip colored by success rate.
 *   2. Yardage spray          — scatter of every play (field position x gain),
 *                               colored run/pass; reveals where chunk plays hit.
 *   3. Quarter comparison     — run/pass mix + avg yards per quarter.
 *
 * Cross-game "week over week" comparison lives in the Season modal
 * (season-manager.js), which already renders per-game trends.
 */
export class Visualizations {
  static isRun(p) {
    const rp = p.tags && p.tags.runPass;
    if (rp === 'Run') return true;
    if (rp === 'Pass') return false;
    return !!(p.tags && p.tags.playType && p.tags.playType.toLowerCase().includes('run'));
  }

  static isSuccess(p) {
    const yds = parseInt(p.tags.yardage) || 0;
    const dist = parseInt(p.tags.distance) || 10;
    if (String(p.tags.result || '').split(/\s*\+\s*/).includes('Touchdown')) return true;
    if (p.tags.custom && p.tags.custom.includes('1st Down')) return true;
    switch (p.tags.down) {
      case '1': return yds >= dist * 0.5;
      case '2': return yds >= dist * 0.7;
      case '3': case '4': return yds >= dist;
      default: return yds >= 4;
    }
  }

  /** Absolute field position 0..100 (own goal -> opp goal), or null. */
  static fieldPos(p) {
    const yl = parseInt(p.tags.yardLine);
    if (isNaN(yl)) return null;
    return p.tags.fieldSide === 'opp' ? (100 - yl) : yl;
  }

  static _esc(s) { return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }

  static render(plays) {
    plays = (plays || []).filter(p => p.tags && (p.tags.playType || p.tags.runPass));
    if (plays.length < 3) return '';
    return `
      <div class="stats-section viz-section">
        <h3>Visualizations</h3>
        ${this._fieldZones(plays)}
        ${this._spray(plays)}
        ${this._quarters(plays)}
      </div>`;
  }

  // 1. Success by field zone --------------------------------------------
  static _fieldZones(plays) {
    const zones = [
      { lo: 0, hi: 20, label: 'Own 1–20' },
      { lo: 20, hi: 40, label: 'Own 20–40' },
      { lo: 40, hi: 60, label: 'Midfield' },
      { lo: 60, hi: 80, label: 'Opp 40–20' },
      { lo: 80, hi: 100, label: 'Red Zone' },
    ];
    const located = plays.filter(p => this.fieldPos(p) != null);
    if (located.length < 3) return '';
    const cells = zones.map(z => {
      const inZone = located.filter(p => { const f = this.fieldPos(p); return f >= z.lo && f < z.hi || (z.hi === 100 && f === 100); });
      const n = inZone.length;
      const succ = inZone.filter(p => this.isSuccess(p)).length;
      const pct = n ? Math.round((succ / n) * 100) : null;
      return { ...z, n, pct };
    });
    const color = (pct) => {
      if (pct == null) return '#1c2128';
      // red (low) -> yellow -> green (high)
      const h = Math.round((pct / 100) * 120);
      return `hsl(${h} 65% 42%)`;
    };
    const strip = cells.map(c => `
      <div class="viz-zone" style="background:${color(c.pct)}" title="${c.label}: ${c.pct == null ? 'n/a' : c.pct + '% success'} (${c.n} plays)">
        <span class="viz-zone-label">${c.label}</span>
        <span class="viz-zone-val">${c.pct == null ? '—' : c.pct + '%'}</span>
        <span class="viz-zone-n">${c.n} plays</span>
      </div>`).join('');
    return `<div class="viz-block">
      <h4>Success by Field Zone <span class="viz-sub">→ attacking</span></h4>
      <div class="viz-field-strip">${strip}</div>
    </div>`;
  }

  // 2. Yardage spray scatter --------------------------------------------
  static _spray(plays) {
    const pts = plays.map(p => ({
      x: this.fieldPos(p),
      y: parseInt(p.tags.yardage),
      run: this.isRun(p),
    })).filter(p => p.x != null && !isNaN(p.y));
    if (pts.length < 3) return '';

    const W = 600, H = 240, padL = 36, padB = 26, padT = 10, padR = 10;
    const ys = pts.map(p => p.y);
    const yMax = Math.max(10, ...ys), yMin = Math.min(-5, ...ys);
    const xOf = (x) => padL + (x / 100) * (W - padL - padR);
    const yOf = (y) => padT + (1 - (y - yMin) / (yMax - yMin)) * (H - padT - padB);

    const zeroY = yOf(0);
    let grid = '';
    for (let x = 0; x <= 100; x += 20) {
      const yl = x <= 50 ? x : 100 - x;   // standard field: counts up to 50, back down
      grid += `<line x1="${xOf(x)}" y1="${padT}" x2="${xOf(x)}" y2="${H - padB}" stroke="#243049" stroke-width="1"/>
               <text x="${xOf(x)}" y="${H - padB + 14}" fill="#8b949e" font-size="9" text-anchor="middle">${yl === 0 ? 'G' : yl}</text>`;
    }
    const dots = pts.map(p =>
      `<circle cx="${xOf(p.x).toFixed(1)}" cy="${yOf(p.y).toFixed(1)}" r="4" fill="${p.run ? '#f97316' : '#38bdf8'}" fill-opacity="0.8"/>`
    ).join('');
    return `<div class="viz-block">
      <h4>Yardage Spray <span class="viz-legend"><i class="dot run"></i>Run <i class="dot pass"></i>Pass</span></h4>
      <svg class="viz-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
        ${grid}
        <line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#4a5a7d" stroke-width="1.5" stroke-dasharray="4 3"/>
        <text x="${padL - 4}" y="${zeroY + 3}" fill="#8b949e" font-size="9" text-anchor="end">0</text>
        <text x="${padL - 4}" y="${yOf(yMax) + 3}" fill="#8b949e" font-size="9" text-anchor="end">${yMax}</text>
        ${dots}
      </svg>
      <p class="viz-caption">Each dot is a play — field position (own goal → opp goal) vs. yards gained.</p>
    </div>`;
  }

  // 3. Quarter comparison ------------------------------------------------
  static _quarters(plays) {
    const qs = ['Q1', 'Q2', 'Q3', 'Q4'];
    const data = qs.map(q => {
      const qp = plays.filter(p => p.tags.quarter === q);
      const runs = qp.filter(p => this.isRun(p)).length;
      const yards = qp.reduce((s, p) => s + (parseInt(p.tags.yardage) || 0), 0);
      return { q, n: qp.length, runPct: qp.length ? Math.round((runs / qp.length) * 100) : 0, avg: qp.length ? (yards / qp.length) : 0 };
    }).filter(d => d.n > 0);
    if (data.length < 2) return '';

    const maxAvg = Math.max(6, ...data.map(d => Math.abs(d.avg)));
    const rows = data.map(d => `
      <div class="viz-q-row">
        <span class="viz-q-name">${d.q}</span>
        <div class="viz-q-bars">
          <div class="viz-q-bar run" style="width:${d.runPct}%" title="${d.runPct}% run"></div>
          <div class="viz-q-bar pass" style="width:${100 - d.runPct}%" title="${100 - d.runPct}% pass"></div>
        </div>
        <span class="viz-q-avg" title="avg yards/play">${d.avg.toFixed(1)} yd</span>
        <span class="viz-q-n">${d.n}</span>
      </div>`).join('');
    return `<div class="viz-block">
      <h4>By Quarter <span class="viz-legend"><i class="dot run"></i>Run <i class="dot pass"></i>Pass · avg yds</span></h4>
      <div class="viz-q-chart">${rows}</div>
    </div>`;
  }
}
