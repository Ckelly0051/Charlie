/**
 * Charts — Pure-SVG chart primitives for the stats dashboard.
 * No external dependencies. All methods are static, return HTML/SVG strings.
 */
export class Charts {

  static _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

  /**
   * F12a — FREQUENCY × SUCCESS bars.
   *
   * Two variables in one mark: bar LENGTH is how often, bar FILL is how well.
   * A table gives you both numbers and neither shape; this makes "we run it a
   * lot and it does not work" visible in one glance, which is the whole reason
   * to draw a chart instead of printing a column.
   *
   * The ramp is intensity of ONE hue, not a red-amber-green scale: success rate
   * is a continuous quantity, and a semantic traffic light would both collide
   * with the status colours and imply thresholds we have not agreed. Sample size
   * rides along as opacity so a two-snap row cannot look like a certainty.
   *
   * @param {Array<{label:string, count:number, successPct:number, sub?:string,
   *   refs?:string[], cut?:{type:string,val:string}}>} rows
   */
  static rampBars(rows, opts = {}) {
    const list = (rows || []).filter(row => row && row.count > 0);
    if (!list.length) return '';
    const max = Math.max(...list.map(row => row.count));
    const minN = opts.minSample ?? 3;
    return `<div class="gi-ramp">${list.map(row => {
      const width = Math.max(2, Math.round(row.count / max * 100));
      const success = Math.max(0, Math.min(100, Number(row.successPct) || 0));
      // Intensity: 0.30 at 0% success, 1.0 at 100%. Low-sample rows dim further.
      const intensity = (0.30 + (success / 100) * 0.70) * (row.count < minN ? 0.5 : 1);
      const attrs = row.refs?.length
        ? ` class="gi-ramp-row cut-row" data-opponent-refs="${Charts._esc(row.refs.join(','))}" tabindex="0" role="button"`
        : row.cut
          ? ` class="gi-ramp-row cut-row" data-cut-type="${Charts._esc(row.cut.type)}" data-cut-val="${Charts._esc(row.cut.val)}" data-cut-label="${Charts._esc(row.label)}" tabindex="0" role="button"`
          : ' class="gi-ramp-row"';
      return `<div${attrs}>
        <span class="gi-ramp-label">${Charts._esc(row.label)}</span>
        <span class="gi-ramp-track"><i style="width:${width}%;background:var(--gi-los);opacity:${intensity.toFixed(2)}"></i></span>
        <span class="gi-ramp-n">${row.count}</span>
        <span class="gi-ramp-pct">${Math.round(success)}%${row.count < minN ? ' <em>low</em>' : ''}</span>
      </div>`;
    }).join('')}
      ${/* H17 — this legend restated the caption above it in looser words, so
            the same three terms were defined twice, once precisely and once
            not. The caption owns the definitions; the legend is deleted rather
            than rewritten. A legend earns its place only where it carries a key
            the caption cannot — a colour mapping, not a restatement. */''}
    </div>`;
  }

  /**
   * F12a — yardage DISTRIBUTION. The shape of an offense in one mark: where the
   * mass sits, how long the tail is, and where the line of scrimmage falls. A
   * table of averages hides all three.
   * @param {Array<{from:number,to:number,count:number,label:string}>} bins
   */
  static histogram(bins, opts = {}) {
    const list = bins || [];
    const total = list.reduce((sum, bin) => sum + bin.count, 0);
    if (!total) return '';
    const max = Math.max(...list.map(bin => bin.count));
    const w = 100 / list.length;
    const meanIndex = opts.meanIndex;
    return `<figure class="gi-hist">
      <svg viewBox="0 0 100 44" preserveAspectRatio="none" role="img" aria-label="${Charts._esc(opts.label || 'Yardage distribution')}">
        ${list.map((bin, index) => {
          const h = max ? (bin.count / max) * 34 : 0;
          // The bin carries its own tone (StatsEngine._yardageBins). This used
          // to be `bin.to <= 0` here, which painted the `0` bin — a NO GAIN —
          // in the turnover colour. Renderers do not decide football meaning.
          const fill = bin.tone === 'loss' ? 'var(--gi-turnover)'
            : bin.tone === 'none' ? 'var(--gi-7)' : 'var(--gi-cat-1)';
          return `<rect x="${(index * w + w * 0.12).toFixed(2)}" y="${(38 - h).toFixed(2)}" width="${(w * 0.76).toFixed(2)}" height="${h.toFixed(2)}"
            style="fill:${fill};opacity:.85"><title>${Charts._esc(bin.label)}: ${bin.count}</title></rect>`;
        }).join('')}
        ${meanIndex != null ? `<line x1="${(meanIndex * w + w / 2).toFixed(2)}" y1="2" x2="${(meanIndex * w + w / 2).toFixed(2)}" y2="38" style="stroke:var(--gi-first-down);stroke-width:.6"/>` : ''}
        <line x1="0" y1="38" x2="100" y2="38" style="stroke:var(--gi-7);stroke-width:.4"/>
      </svg>
      <figcaption>${list.map(bin => `<span>${Charts._esc(bin.label)}</span>`).join('')}</figcaption>
    </figure>`;
  }

  /**
   * F12b — play SCATTER: every snap as a point, distance to gain on one axis
   * and yards gained on the other, with the conversion line drawn. Points above
   * the line moved the chains. This is the one view where a coach sees the
   * whole game at once instead of a row at a time.
   * @param {Array<{x:number,y:number,run:boolean,label:string}>} points
   */
  static scatter(points, opts = {}) {
    const list = (points || []).filter(point => point && isFinite(point.x) && isFinite(point.y));
    if (!list.length) return '';
    const maxX = Math.max(1, ...list.map(point => point.x));
    const yMax = Math.max(10, ...list.map(point => point.y));
    const yMin = Math.min(-5, ...list.map(point => point.y));
    const sx = value => (value / maxX) * 92 + 5;
    const sy = value => 40 - ((value - yMin) / (yMax - yMin)) * 36;
    const zero = sy(0);
    return `<figure class="gi-scatter">
      <svg viewBox="0 0 100 46" role="img" aria-label="${Charts._esc(opts.label || 'Yards gained by distance to go')}">
        <line x1="0" y1="${zero.toFixed(2)}" x2="100" y2="${zero.toFixed(2)}" style="stroke:var(--gi-7);stroke-width:.35"/>
        <path d="${list.length ? `M ${sx(0).toFixed(2)} ${sy(0).toFixed(2)} L ${sx(maxX).toFixed(2)} ${sy(maxX).toFixed(2)}` : ''}"
          style="fill:none;stroke:var(--gi-first-down);stroke-width:.4;stroke-dasharray:1.5 1.5"/>
        ${list.map(point => `<circle cx="${sx(point.x).toFixed(2)}" cy="${sy(point.y).toFixed(2)}" r="${(1 + Math.min(1.6, Math.abs(point.y) / 22)).toFixed(2)}"
          style="fill:${point.run ? 'var(--gi-run)' : 'var(--gi-pass)'};opacity:.8"><title>${Charts._esc(point.label)}</title></circle>`).join('')}
      </svg>
      ${/* Kept: this one carries a COLOUR KEY the caption cannot. The prose
            restatements beside it ("Dashed line = the sticks") are gone — the
            caption already defines the line literally. */''}
      <figcaption><span>Distance to go &rarr;</span><span class="gi-scatter-key"><i style="background:var(--gi-run)"></i>Run<i style="background:var(--gi-pass)"></i>Pass</span></figcaption>
    </figure>`;
  }

  /**
   * F12b — FIELD ZONE strip. Success by where the ball is, laid out the way a
   * field is: own goal on the left, theirs on the right.
   * @param {Array<{label:string,count:number,successPct:number,cut?:object}>} zones
   */
  static zoneStrip(zones, opts = {}) {
    const list = (zones || []);
    if (!list.some(zone => zone.count > 0)) return '';
    const minN = opts.minSample ?? 3;
    return `<div class="gi-zones">${list.map(zone => {
      const has = zone.count > 0;
      const intensity = has ? (0.28 + (Math.max(0, Math.min(100, zone.successPct)) / 100) * 0.72) * (zone.count < minN ? 0.5 : 1) : 0;
      const attrs = has && zone.cut
        ? ` class="gi-zone cut-row" data-cut-type="${Charts._esc(zone.cut.type)}" data-cut-val="${Charts._esc(zone.cut.val)}" data-cut-label="${Charts._esc(zone.label)}" tabindex="0" role="button"`
        : ' class="gi-zone"';
      return `<div${attrs}>
        <i style="${has ? `background:var(--gi-los);opacity:${intensity.toFixed(2)}` : 'background:transparent'}"></i>
        <strong>${has ? `${Math.round(zone.successPct)}%` : '&mdash;'}</strong>
        <span>${Charts._esc(zone.label)}</span>
        <small>${has ? `${zone.count} snap${zone.count === 1 ? '' : 's'}` : 'no data'}${has && zone.count < minN ? ' · low' : ''}</small>
      </div>`;
    }).join('')}</div>`;
  }

  /**
   * F12b — SMALL MULTIPLES. The same little chart repeated per group, so the
   * comparison is spatial instead of a column of numbers to hold in your head.
   * @param {Array<{label:string,run:number,pass:number,successPct:number,n:number}>} series
   */
  /* F12c — the team profile radar. Pure geometry: it is handed ratios the
     engine already scaled (StatsEngine._teamProfile) and draws them. It does
     not know what full scale means, which is the whole point — that was a
     football decision, not a rendering one. Outward is always better. */
  static radar(axes, opts = {}) {
    const list = (axes || []).filter(a => a && Number.isFinite(a.ratio));
    if (list.length < 3) return '';
    /* H6 — the viewBox reserves room for the labels. They sit at r + 11 and the
       box was 100 wide with no margin, so "Ball security", "Explosiveness" and
       "Yards / play" were clipped to ":ity", "Exp:" and "ards / play". The
       drawing is unchanged; the canvas around it grew. */
    const cx = 50, cy = 50, r = 30;
    const at = (index, radius) => {
      const angle = (Math.PI * 2 * index) / list.length - Math.PI / 2;
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    };
    const ring = (frac) => list.map((unused, i) => at(i, r * frac).map(n => n.toFixed(2)).join(',')).join(' ');
    const shape = list.map((a, i) => at(i, r * Math.max(a.ratio, 0.04)).map(n => n.toFixed(2)).join(',')).join(' ');
    const spokes = list.map((unused, i) => {
      const [x, y] = at(i, r);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" style="stroke:var(--gi-6);stroke-width:.3"/>`;
    }).join('');
    const dots = list.map((a, i) => {
      const [x, y] = at(i, r * Math.max(a.ratio, 0.04));
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5"
        style="fill:${a.isBest ? 'var(--gi-first-down)' : 'var(--gi-los)'}"><title>${Charts._esc(a.label)}: ${Charts._esc(String(a.value))}${a.isBest ? ' — season best' : ''}</title></circle>`;
    }).join('');
    const labels = list.map((a, i) => {
      const [x, y] = at(i, r + 11);
      const anchor = x > cx + 2 ? 'start' : x < cx - 2 ? 'end' : 'middle';
      return `<text x="${x.toFixed(2)}" y="${(y + 1.4).toFixed(2)}" text-anchor="${anchor}"
        style="fill:var(--gi-11);font:600 3.6px var(--gi-mono)">${Charts._esc(a.label)}</text>`;
    }).join('');
    return `<figure class="gi-radar">
      <svg viewBox="-16 -6 132 112" role="img" aria-label="${Charts._esc(opts.label || 'Team profile')}">
        <polygon points="${ring(1)}" style="fill:none;stroke:var(--gi-6);stroke-width:.4"/>
        <polygon points="${ring(0.66)}" style="fill:none;stroke:var(--gi-6);stroke-width:.25;opacity:.6"/>
        <polygon points="${ring(0.33)}" style="fill:none;stroke:var(--gi-6);stroke-width:.25;opacity:.6"/>
        ${spokes}
        <polygon points="${shape}" style="fill:var(--gi-los);fill-opacity:.22;stroke:var(--gi-los);stroke-width:.7"/>
        ${dots}${labels}
      </svg>
    </figure>`;
  }

  static smallMultiples(series, opts = {}) {
    const list = (series || []).filter(item => item && item.n > 0);
    if (!list.length) return '';
    const minN = opts.minSample ?? 3;
    return `<div class="gi-multiples">${list.map(item => {
      const total = Math.max(1, item.run + item.pass);
      const runPct = Math.round(item.run / total * 100);
      return `<figure class="gi-multiple${item.n < minN ? ' is-low' : ''}">
        <figcaption>${Charts._esc(item.label)}</figcaption>
        <div class="gi-multiple-bar"><i style="width:${runPct}%;background:var(--gi-run)"></i><i style="width:${100 - runPct}%;background:var(--gi-pass)"></i></div>
        <strong>${Math.round(item.successPct)}%</strong>
        <small>${item.n} snap${item.n === 1 ? '' : 's'}${item.n < minN ? ' · low' : ''}</small>
      </figure>`;
    }).join('')}</div>`;
  }

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
      const arc = `<circle cx="${r}" cy="${r}" r="${cr.toFixed(1)}" fill="none" style="stroke:${seg.color}" stroke-width="${stroke.toFixed(1)}" stroke-dasharray="${dash}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${r} ${r})" opacity="0.88"><title>${Charts._esc(seg.label)}: ${seg.value} (${Math.round(pct * 100)}%)</title></circle>`;
      offset += dashLen;
      return arc;
    }).join('');

    // AX-5: the centre is for ONE primary number, sized to fill the hole, and
    // the label goes OUTSIDE. Previously both lived inside the ring at fixed
    // sizes, so "50.0%" rendered wider than the hole and overlapped the stroke,
    // and the label competed with the number for the same space. The hole is
    // measurable, so fit the number to it rather than hoping a fixed size fits:
    // a four-character value and a two-character value both stay inside.
    const hole = (cr - stroke / 2) * 2;
    const text = String(centerText ?? '');
    const fitted = Math.min(size * 0.30, (hole * 0.92) / Math.max(1, text.length * 0.58));
    const center = text ? `<text x="${r}" y="${r}" text-anchor="middle" dominant-baseline="central" style="fill:var(--gi-12,#E9EEF5)" font-size="${fitted.toFixed(1)}" font-weight="700" font-family="var(--gi-cond,inherit)">${Charts._esc(text)}</text>` : '';

    return `<svg class="chart-donut" viewBox="0 0 ${size} ${size}" width="${size}" height="${size}" role="img" aria-label="${Charts._esc(centerSub || 'chart')}${text ? `: ${Charts._esc(text)}` : ''}">${arcs}${center}</svg>`;
  }

  /**
   * A donut with its title above and its legend below — the AX-5 composition.
   * The caption is a real element with stable dimensions instead of SVG text
   * squeezed into the ring, so a long label wraps rather than clipping.
   */
  static donutBlock(segments, size = 120, centerText = '', title = '', legend = true) {
    const donut = Charts.donut(segments, size, centerText, title);
    if (!donut) return '';
    const items = legend ? segments.filter(seg => seg.value > 0).map(seg =>
      `<span class="chart-leg-item"><i style="background:${seg.color}"></i>${Charts._esc(seg.label)} <b>${seg.value}</b></span>`
    ).join('') : '';
    return `<figure class="chart-donut-block">${title ? `<figcaption>${Charts._esc(title)}</figcaption>` : ''}${donut}${items ? `<div class="chart-legend">${items}</div>` : ''}</figure>`;
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
      const color = d.color || 'var(--accent,#2F6BF0)';
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

    return `<div class="chart-gauge"${tip ? ` title="${Charts._esc(tip)}"` : ''}><svg viewBox="0 0 ${size} ${(size * 0.62).toFixed(0)}" width="${size}" height="${(size * 0.62).toFixed(0)}"><path d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}" fill="none" stroke="var(--gauge-track, #1c2128)" stroke-width="${sw.toFixed(1)}" stroke-linecap="round"/><path d="M ${(cx - r).toFixed(1)} ${cy.toFixed(1)} A ${r.toFixed(1)} ${r.toFixed(1)} 0 0 1 ${(cx + r).toFixed(1)} ${cy.toFixed(1)}" fill="none" style="stroke:${color}" stroke-width="${sw.toFixed(1)}" stroke-linecap="round" stroke-dasharray="${dash}" opacity="0.9"/><text x="${cx}" y="${(cy - 1).toFixed(1)}" text-anchor="middle" fill="var(--text,#E9EEF5)" font-size="${(size * 0.2).toFixed(0)}" font-weight="700">${Math.round(pct)}%</text></svg>${label ? `<div class="chart-gauge-label">${Charts._esc(label)}</div>` : ''}</div>`;
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
    const color = opts.color || 'var(--accent,#2F6BF0)';

    const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
    const path = `M${pts.join(' L')}`;
    const zeroY = y(0).toFixed(1);
    const fill = opts.fill !== false
      ? `<path d="${path} L${(W - pad).toFixed(1)},${zeroY} L${pad},${zeroY} Z" style="fill:${color}" fill-opacity="0.08"/>`
      : '';
    const zeroLine = lo < 0 ? `<line x1="${pad}" y1="${zeroY}" x2="${W - pad}" y2="${zeroY}" stroke="rgba(233,238,245,0.14)" stroke-width="0.5" stroke-dasharray="3 3"/>` : '';

    return `<svg class="chart-sparkline" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${zeroLine}${fill}<path d="${path}" fill="none" style="stroke:${color}" stroke-width="1.5"/><circle cx="${x(values.length - 1).toFixed(1)}" cy="${y(values[values.length - 1]).toFixed(1)}" r="2.5" style="fill:${color}"/></svg>`;
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
    // A dense KPI-with-sparkline card: the LATEST value big + a delta vs the
    // first game (colored by good/bad via opts.goodUp), a compact full-width
    // line, and the first/last game names. Replaces the old tall card that
    // wasted ~60% of its height on a thin diagonal line.
    const W = 300, H = 60;
    const color = opts.color || '#3D7BFD';
    const fmt = opts.fmt || ((v) => String(Math.round(v)));
    const padX = 8, padT = 10, padB = 8;
    const vals = points.map(p => p.value);
    const lo = Math.min(...vals), hi = Math.max(...vals);
    const range = (hi - lo) || 1;
    const x = (i) => padX + (i / (points.length - 1)) * (W - 2 * padX);
    const y = (v) => padT + (1 - (v - lo) / range) * (H - padT - padB);
    const path = 'M' + points.map((p, i) => `${x(i).toFixed(1)},${y(p.value).toFixed(1)}`).join(' L');
    const base = (H - padB).toFixed(1);
    const area = `${path} L${x(points.length - 1).toFixed(1)},${base} L${padX.toFixed(1)},${base} Z`;
    const dots = points.map((p, i) =>
      `<circle cx="${x(i).toFixed(1)}" cy="${y(p.value).toFixed(1)}" r="2.6" style="fill:${color}"><title>${Charts._esc(p.label || '')}: ${fmt(p.value)}</title></circle>`
    ).join('');
    // current value + delta vs first
    const first = points[0].value, lastV = points[points.length - 1].value;
    const delta = lastV - first;
    const goodUp = opts.goodUp !== false;
    const dClass = delta === 0 ? 'even' : ((delta > 0) === goodUp ? 'up' : 'down');
    const deltaStr = delta === 0 ? '—' : `${delta > 0 ? '▲' : '▼'} ${fmt(Math.abs(delta))}`;
    const nm = (s) => Charts._esc((s || '').replace(/^vs\s+/i, '').slice(0, 16));
    return `<div class="gi-trend">`
      + `<div class="gi-trend-title">${Charts._esc(opts.title || '')}</div>`
      + `<div class="gi-trend-now"><span class="gi-trend-val">${fmt(lastV)}</span>`
      + `<span class="gi-trend-delta ${dClass}">${deltaStr}</span></div>`
      + `<svg viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" class="gi-trend-svg" role="img" aria-label="${Charts._esc(opts.title || 'trend')}">`
      + `<path d="${area}" style="fill:${color}" fill-opacity="0.13"/>`
      + `<path d="${path}" fill="none" style="stroke:${color}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>${dots}`
      + `</svg>`
      + `<div class="gi-trend-legend"><span>${nm(points[0].label)}</span><span>${nm(points[points.length - 1].label)}</span></div>`
      + `</div>`;
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
    let grid = `<line x1="${padL}" y1="${zeroY}" x2="${W - padR}" y2="${zeroY}" stroke="rgba(233,238,245,0.14)" stroke-width="1" stroke-dasharray="4 3"/>`;
    const gridSteps = [hi, Math.round(hi / 2), 0, Math.round(lo / 2), lo].filter((v, i, a) => a.indexOf(v) === i && v !== 0);
    gridSteps.forEach(v => {
      const gy = y(v).toFixed(1);
      grid += `<text x="${padL - 4}" y="${(parseFloat(gy) + 3).toFixed(1)}" fill="#9AA6B5" font-size="9" text-anchor="end">${v}</text>`;
    });

    const pts = plays.map((p, i) => `${x(i).toFixed(1)},${y(p.cumYards).toFixed(1)}`);
    const path = `M${pts.join(' L')}`;
    const areaPath = `${path} L${x(plays.length - 1).toFixed(1)},${zeroY} L${padL},${zeroY} Z`;

    const dots = plays.map((p, i) => {
      const color = p.isRun ? '#f97316' : '#38bdf8';
      return `<circle cx="${x(i).toFixed(1)}" cy="${y(p.cumYards).toFixed(1)}" r="3" style="fill:${color}" opacity="0.7"><title>Play ${p.playNum}: ${p.label} (${p.cumYards} total yds)</title></circle>`;
    }).join('');

    return `<div class="viz-block"><h4>Game Flow <span class="viz-legend"><i class="dot run"></i>Run <i class="dot pass"></i>Pass · cumulative yards</span></h4><svg class="viz-svg chart-gameflow" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">${grid}<path d="${areaPath}" fill="var(--accent,#2F6BF0)" fill-opacity="0.06"/><path d="${path}" fill="none" stroke="var(--accent,#2F6BF0)" stroke-width="2"/>${dots}<text x="${padL}" y="${H - 6}" fill="#9AA6B5" font-size="9">Play 1</text><text x="${W - padR}" y="${H - 6}" fill="#9AA6B5" font-size="9" text-anchor="end">Play ${plays.length}</text><text x="${W - padR}" y="12" fill="#9AA6B5" font-size="9" text-anchor="end">${vals[vals.length - 1]} total yds</text></svg></div>`;
  }
}
