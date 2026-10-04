/**
 * Charts — Pure-SVG chart primitives for the stats dashboard.
 * No external dependencies. All methods are static, return HTML/SVG strings.
 */
export class Charts {

  static _esc(s) { return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }

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
  /**
   * @param {Array<{label,value,ratio,isBest,compareValue,compareLabel,compareRatio}>} axes
   * @param {object} opts — `compareName` labels the second series when
   *   `compareRatio` is present on the axes (Reports redesign item D: Current
   *   Game vs Season Average, with Season Best available as the alternate).
   */
  static radar(axes, opts = {}) {
    const list = (axes || []).filter(a => a && Number.isFinite(a.ratio));
    if (list.length < 3) return '';
    const hasCompare = list.some(a => Number.isFinite(a.compareRatio));
    /* H6 — the viewBox reserves room for the labels. They sit at r + 11 and the
       box was 100 wide with no margin, so "Ball security", "Explosiveness" and
       "Yards / play" were clipped to ":ity", "Exp:" and "ards / play". The
       drawing is unchanged; the canvas around it grew.
       Reports redesign (item D, follow-up): the H6 margin was still 2-3 units
       short for the longest labels ("Ball security" / "Explosiveness", both
       13 characters) once the team-profile radar shipped with real season
       data — measured via a rendered screenshot, not assumed. Widened again
       with headroom rather than tuned to the exact character count, so the
       next longest label doesn't reopen this. */
    const cx = 50, cy = 50, r = 30;
    const at = (index, radius) => {
      const angle = (Math.PI * 2 * index) / list.length - Math.PI / 2;
      return [cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius];
    };
    const ring = (frac) => list.map((unused, i) => at(i, r * frac).map(n => n.toFixed(2)).join(',')).join(' ');
    const shapeOf = key => list.map((a, i) => at(i, r * Math.max(a[key], 0.04)).map(n => n.toFixed(2)).join(',')).join(' ');
    const shape = shapeOf('ratio');
    const compareShape = hasCompare ? shapeOf('compareRatio') : '';
    const spokes = list.map((unused, i) => {
      const [x, y] = at(i, r);
      return `<line x1="${cx}" y1="${cy}" x2="${x.toFixed(2)}" y2="${y.toFixed(2)}" style="stroke:var(--gi-6);stroke-width:.3"/>`;
    }).join('');
    const compareDots = hasCompare ? list.map((a, i) => {
      const [x, y] = at(i, r * Math.max(a.compareRatio, 0.04));
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.3"
        style="fill:var(--gi-9)"><title>${Charts._esc(a.label)} — ${Charts._esc(opts.compareName || 'comparison')}: ${Charts._esc(String(a.compareLabel ?? a.compareValue))}</title></circle>`;
    }).join('') : '';
    const dots = list.map((a, i) => {
      const [x, y] = at(i, r * Math.max(a.ratio, 0.04));
      return `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="1.5"
        style="fill:${a.isBest ? 'var(--gi-first-down)' : 'var(--gi-los)'}"><title>${Charts._esc(a.label)}: ${Charts._esc(String(a.valueLabel ?? a.value))}${a.isBest ? ' — season best' : ''}</title></circle>`;
    }).join('');
    /* A label longer than the margin wraps onto two lines at the space
       nearest its middle, at the same type size, rather than shrinking the
       type or growing the canvas. */
    const lines = label => {
      const text = String(label);
      if (text.length <= 14 || !text.includes(' ')) return [text];
      const spaces = [...text.matchAll(/ /g)].map(m => m.index);
      const cut = spaces.reduce((best, s) => Math.abs(s - text.length / 2) < Math.abs(best - text.length / 2) ? s : best);
      return [text.slice(0, cut), text.slice(cut + 1)];
    };
    const labels = list.map((a, i) => {
      const [x, y] = at(i, r + 11);
      const anchor = x > cx + 2 ? 'start' : x < cx - 2 ? 'end' : 'middle';
      const parts = lines(a.label);
      const top = y + 1.4 - (parts.length - 1) * 2.1;
      return `<text x="${x.toFixed(2)}" y="${top.toFixed(2)}" text-anchor="${anchor}"
        style="fill:var(--gi-11);font:600 3.6px var(--gi-mono)">${parts.map((part, k) =>
          `<tspan x="${x.toFixed(2)}" dy="${k ? '4.2' : '0'}">${Charts._esc(part)}</tspan>`).join('')}</text>`;
    }).join('');
    return `<figure class="gi-radar">
      <svg viewBox="-24 -6 148 112" role="img" aria-label="${Charts._esc(opts.label || 'Team profile')}">
        <polygon points="${ring(1)}" style="fill:none;stroke:var(--gi-6);stroke-width:.4"/>
        <polygon points="${ring(0.66)}" style="fill:none;stroke:var(--gi-6);stroke-width:.25;opacity:.6"/>
        <polygon points="${ring(0.33)}" style="fill:none;stroke:var(--gi-6);stroke-width:.25;opacity:.6"/>
        ${spokes}
        ${compareShape ? `<polygon points="${compareShape}" style="fill:none;stroke:var(--gi-9);stroke-width:.6;stroke-dasharray:1.6 1.2"/>` : ''}
        <polygon points="${shape}" style="fill:var(--gi-los);fill-opacity:.22;stroke:var(--gi-los);stroke-width:.7"/>
        ${compareDots}${dots}${labels}
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

}
