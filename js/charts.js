/**
 * Charts — Pure-SVG chart primitives for the stats dashboard.
 * No external dependencies. All methods are static, return HTML/SVG strings.
 */
export class Charts {

  static _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /**
   * Donut (ring) chart.
   * @param {Array<{value:number, color:string, label:string}>} segments
   * @param {number} size - SVG viewport size
   * @param {string} centerText - large center number
   * @param {string} centerSub  - small subtitle
   */
  static donut(segments, size = 120, centerText = '', centerSub = '') {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (!total) return '';
    const r = size / 2;
    const stroke = size * 0.17;
    const cr = r - stroke / 2 - 2;
    const circ = 2 * Math.PI * cr;
    let offset = 0;

    const arcs = segments.filter(s => s.value > 0).map(seg => {
      const pct = seg.value / total;
      const dashLen = circ * pct;
      const dash = `${dashLen.toFixed(2)} ${(circ - dashLen).toFixed(2)}`;
      const arc = `<circle cx="${r}" cy="${r}" r="${cr.toFixed(1)}" fill="none" stroke="${seg.color}" stroke-width="${stroke.toFixed(1)}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${r} ${r})" opacity="0.88"><title>${Charts._esc(seg.label)}: ${seg.value} (${Math.round(pct * 100)}%)</title></circle>`;
      offset += dashLen;
      return arc;
    }).join('');

    const center = centerText ? `<text x="${r}" y="${r - 2}" text-anchor="middle" fill="var(--text,#e6edf3)" font-size="${(size * 0.19).toFixed(0)}" font-weight="700">${Charts._esc(centerText)}</text><text x="${r}" y="${r + size * 0.12}" text-anchor="middle" fill="var(--text-dim,#8b949e)" font-size="${(size * 0.09).toFixed(0)}">${Charts._esc(centerSub)}</text>` : '';

    return `<svg class="chart-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}">${arcs}${center}</svg>`;
  }

  static donutWithLegend(segments, size = 120, centerText = '', centerSub = '') {
    const total = segments.reduce((s, seg) => s + seg.value, 0);
    if (!total) return '';
    const legend = segments.filter(s => s.value > 0).map(seg =>
      `<span class="chart-leg-item"><i style="background:${seg.color}"></i>${Charts._esc(seg.label)} <b>${seg.value}</b></span>`
    ).join('');
    return `<div class="chart-donut-wrap">${this.donut(segments, size, centerText, centerSub)}<div class="chart-legend">${legend}</div></div>`;
  }

  /**
   * Horizontal bar chart — leaderboard style with split + metrics.
   * @param {Array<{label:string, value:number, color?:string, sub?:string, extra?:string}>} data
   */
  static hbars(data, opts = {}) {
    if (!data.length) return '';
    const maxVal = opts.max || Math.max(...data.map(d => d.value));
    if (!maxVal) return '';
    const rows = data.map(d => {
      const pct = Math.max(2, (d.value / maxVal) * 100);
      const color = d.color || 'var(--accent,#c9a227)';
      return `<div class="chart-hbar-row"><span class="chart-hbar-label">${Charts._esc(d.label)}</span><div class="chart-hbar-track"><div class="chart-hbar-fill" style="width:${pct.toFixed(1)}%;background:${color}"></div>${d.sub ? `<span class="chart-hbar-sub">${d.sub}</span>` : ''}</div><span class="chart-hbar-val">${d.extra || d.value}</span></div>`;
    }).join('');
    return `<div class="chart-hbars">${rows}</div>`;
  }

  /**
   * Stacked horizontal bar (e.g. run/pass split per formation).
   * @param {Array<{value:number, color:string, label:string}>} parts
   */
  static stackBar(parts, height = 22) {
    const total = parts.reduce((s, p) => s + p.value, 0);
    if (!total) return '<div class="chart-stack" style="height:22px"></div>';
    const segs = parts.filter(p => p.value > 0).map(p => {
      const pct = (p.value / total) * 100;
      return `<div class="chart-stack-seg" style="width:${pct.toFixed(1)}%;background:${p.color}" title="${Charts._esc(p.label)}: ${p.value} (${Math.round(pct)}%)">${pct >= 18 ? Math.round(pct) + '%' : ''}</div>`;
    }).join('');
    return `<div class="chart-stack" style="height:${height}px">${segs}</div>`;
  }

  /**
   * Semicircular gauge for a percentage metric.
   */
  static gauge(pct, label = '', color = 'var(--accent)', size = 100, tip = '') {
    const clamped = Math.min(100, Math.max(0, pct));
    const frac = clamped / 100;
    const r = size * 0.38;
    const cx = size / 2, cy = size * 0.52;
    const sw = size * 0.09;
    const halfCirc = Math.PI * r;
    const dash = `${(halfCirc * frac).toFixed(2)} ${(halfCirc * (1 - frac)).toFixed(2)}`;

    return `<div class="chart-gauge"${tip ? ` title="${Charts._esc(tip)}"` : ''}><svg viewBox="0 0 ${size} ${(size * 0.62).toFixed(0)}" width="${size}" height="${(size * 0.62).toFixed(0)}"><path d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="var(--gauge-track, #1c2128)" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/><path d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" stroke-dasharray="${dash}" opacity="0.9"/><text x="${cx}" y="${(cy - 1).toFixed(1)}" text-anchor="middle" fill="var(--text,#e6edf3)" font-size="${(size * 0.2).toFixed(0)}" font-weight="700">${Math.round(pct)}%</text></svg>${label ? `<div class="chart-gauge-label">${Charts._esc(label)}</div>` : ''}</div>`;
  }

  /**
   * Sparkline — compact line chart with optional area fill.
   */
  static sparkline(values, opts = {}) {
    if (values.length < 2) return '';
    const W = opts.width || 240, H = opts.height || 48;
    const pad = 3;
    const lo = Math.min(0, ...values), hi = Math.max(0, ...values);
    const range = hi - lo || 1;
    const x = (i) => pad + (i / (values.length - 1)) * (W - 2 * pad);
    const y = (v) => H - pad - ((v - lo) / range) * (H - 2 * pad);
    const color = opts.color || 'var(--accent,#c9a227)';

    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const path = `M${pts.join(' L')}`;
    const zeroY = y(0).toFixed(1);
    const fill = opts.fill !== false
      ? `<path d="${path} L${(W - pad).toFixed(1)},${zeroY} L${pad},${zeroY} Z" fill="${color}" fill-opacity="0.08"/>`
      : '';
    const zeroLine = lo < 0 ? `<line x1="${pad}" y1="${zeroY}" x2="${W - pad}" y2="${zeroY}" stroke="#3a4a6d" stroke-width="0.5" stroke-dasharray="3 3"/>` : '';

    return `<svg class="chart-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${zeroLine}${fill}<path d="${path}" fill="none" stroke="${color}" stroke-width="1.5"/><circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="2.5" fill="${color}"/></svg>`;
  }

  /**
   * Mini inline bar for table cells.
   */
  static miniBar(value, max, color = 'var(--accent)') {
    if (!max) return '';
    const pct = Math.min(100, Math.max(0, (value / max) * 100));
    return `<div class="chart-minibar"><div style="width:${pct.toFixed(1)}%;background:${color}"></div></div>`;
  }

  /**
   * Game-by-game trend line — one metric across the season's games, as a clean
   * line chart with a dot + value at each game. points: [{ label, value }].
   * Used by the Season tab's trend grid.
   */
  static trendLine(points, opts = {}) {
    if (!points || points.length < 2) return '';
    const W = 400, H = 150;
    const color = opts.color || '#3b82f6';
    const fmt = opts.fmt || ((v) => String(Math.round(v)));
    const padL = 12, padR = 12, padT = 22, padB = 26;
    const vals = points.map(p => p.value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = (hi - lo) || 1;
    const x = (i) => padL + (i / (points.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - lo) / range) * (H - padT - padB);
    const path = 'M' + points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' L');
    const base = (H - padB).toFixed(1);
    const area = `${path} L${x(points.length - 1).toFixed(1)},${base} L${padL.toFixed(1)},${base} Z`;
    const marks = points.map((p, i) => {
      const cx = x(i).toFixed(1), cy = y(p.value);
      const short = Charts._esc((p.label || '').replace(/^vs\s+/i, '').slice(0, 9));
      return `<circle cx="${cx}" cy="${cy.toFixed(1)}" r="3.5" fill="${color}"><title>${Charts._esc(p.label || '')}: ${fmt(p.value)}</title></circle>`
        + `<text x="${cx}" y="${(cy - 7).toFixed(1)}" fill="#e2e8f0" font-size="12" font-weight="700" text-anchor="middle" style="font-variant-numeric:tabular-nums">${fmt(p.value)}</text>`
        + `<text x="${cx}" y="${H - 8}" fill="#7b8794" font-size="9" text-anchor="middle">${short}</text>`;
    }).join('');
    return `<div class="gi-trend"><div class="gi-trend-title">${Charts._esc(opts.title || '')}</div>`
      + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="gi-trend-svg" role="img" aria-label="${Charts._esc(opts.title || 'trend')}">`
      + `<path d="${area}" fill="${color}" fill-opacity="0.10"/>`
      + `<path d="${path}" fill="none" stroke="${color}" stroke-width="2.5" stroke-linejoin="round" stroke-linecap="round"/>`
      + `${marks}</svg></div>`;
  }

  /**
   * Effectiveness chart — visual row per item with count bar, run/pass split, metrics.
   * items: [{label, count, runs, passes, yards, successPct, avg}]
   */
  static effectivenessRows(items) {
    if (!items.length) return '';
    const maxCount = Math.max(...items.map(i => i.count));
    const rows = items.map(item => {
      const countPct = maxCount ? (item.count / maxCount) * 100 : 0;
      const runPct = item.count ? Math.round((item.runs / item.count) * 100) : 0;
      const succColor = parseFloat(item.successPct) >= 50 ? '#22c55e' : parseFloat(item.successPct) >= 35 ? '#f59e0b' : '#ef4444';
      // Optional click-to-film: when an item carries cut filter data, emit
      // data attributes the stats dashboard wires to a film cut-up.
      const cut = item.cutType
        ? ` data-cut-type="${Charts._esc(item.cutType)}" data-cut-val="${Charts._esc(item.cutVal ?? item.label)}" data-cut-label="${Charts._esc(item.cutLabel || item.label)}"`
        : '';
      const cls = item.cutType ? 'chart-eff-row cut-row' : 'chart-eff-row';
      return `<div class="${cls}"${cut}><div class="chart-eff-label">${Charts._esc(item.label)}</div><div class="chart-eff-bar-wrap"><div class="chart-eff-track"><div class="chart-eff-fill" style="width:${countPct.toFixed(1)}%"><div class="chart-eff-run" style="width:${runPct}%"></div></div></div></div><div class="chart-eff-meta"><span class="chart-eff-n">${item.count}</span><span class="chart-eff-succ" style="color:${succColor}">${item.successPct}%</span><span class="chart-eff-avg">${item.avg}y</span></div></div>`;
    }).join('');
    return `<div class="chart-eff"><div class="chart-eff-head"><span></span><span class="chart-eff-bar-head"><i class="dot run"></i>Run <i class="dot pass"></i>Pass</span><span class="chart-eff-meta-head"><span>n</span><span>Succ</span><span>Avg</span></span></div>${rows}</div>`;
  }

  /**
   * Game flow line chart — shows cumulative yards over the course of the game.
   * plays: [{playNum, cumYards, isRun, label}]
   */
  static gameFlow(plays, W = 700, H = 200) {
    if (plays.length < 2) return '';
    const padL = 40, padR = 16, padT = 16, padB = 28;
    const vals = plays.map(p => p.cumYards);
    const lo = Math.min(0, ...vals), hi = Math.max(0, ...vals);
    const range = hi - lo || 1;
    const x = (i) => padL + (i / (plays.length - 1)) * (W - padL - padR);
    const y = (v) => padT + (1 - (v - lo) / range) * (H - padT - padB);

    const zeroY = y(0).toFixed(1);
    let grid = `<line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="#4a5a7d" stroke-width="1" stroke-dasharray="4 3"/>`;
    const gridSteps = [hi, Math.round(hi / 2), 0, Math.round(lo / 2), lo].filter((v, i, a) => a.indexOf(v) === i && v !== 0);
    gridSteps.forEach(v => {
      const gy = y(v).toFixed(1);
      grid += `<text x="${padL - 4}" y="${(parseFloat(gy) + 3).toFixed(1)}" fill="#8b949e" font-size="9" text-anchor="end">${v}</text>`;
    });

    const pts = plays.map((p, i) => `${x(i).toFixed(1)},${y(p.cumYards).toFixed(1)}`);
    const path = `M${pts.join(' L')}`;
    const areaPath = `${path} L${x(plays.length - 1).toFixed(1)},${zeroY} L${padL},${zeroY} Z`;

    const dots = plays.map((p, i) => {
      const color = p.isRun ? '#f97316' : '#38bdf8';
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cumYards).toFixed(1)}" r="3" fill="${color}" opacity="0.7"><title>Play ${p.playNum}: ${p.label} (${p.cumYards} total yds)</title></circle>`;
    }).join('');

    return `<div class="viz-block"><h4>Game Flow <span class="viz-legend"><i class="dot run"></i>Run <i class="dot pass"></i>Pass · cumulative yards</span></h4><svg class="viz-svg chart-gameflow" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}<path d="${areaPath}" fill="var(--accent,#c9a227)" fill-opacity="0.06"/><path d="${path}" fill="none" stroke="var(--accent,#c9a227)" stroke-width="2"/>${dots}<text x="${padL}" y="${H - 6}" fill="#8b949e" font-size="9">Play 1</text><text x="${W - padR}" y="${H - 6}" fill="#8b949e" font-size="9" text-anchor="end">Play ${plays.length}</text><text x="${W - padR}" y="12" fill="#8b949e" font-size="9" text-anchor="end">${vals[vals.length - 1]} total yds</text></svg></div>`;
  }
}
