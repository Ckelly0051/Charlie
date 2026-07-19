/**
 * HeatMaps - Visual analytics overlays rendered into the stats dashboard.
 *
 * Four views, switchable via tabs:
 *   1. Field Position — SVG football field with each play plotted by yard line
 *      and hash, color-coded by outcome
 *   2. Down & Distance Grid — 4×4 matrix (down × distance bucket) showing
 *      play count, run %, and success rate, intensity-shaded
 *   3. Formation × Play Type — frequency matrix (rows = formations,
 *      cols = play types), green-shaded
 *   4. Hash Tendency — what kind of plays you call from each hash
 */
// stats-engine imports THIS module, so this is a cycle — safe because StatsEngine
// is only referenced at render() call time, never during module evaluation (and the
// built bundle shares one scope). Keeps ONE canonical splitter/projection.
import { StatsEngine } from './stats-engine.js';

export class HeatMaps {
  render(plays) {
    return `
      <div class="stats-section">
        <h3>Heat Maps</h3>
        <div class="heatmap-tabs">
          <button class="hm-tab active" data-tab="field">Field Position</button>
          <button class="hm-tab" data-tab="dd">Down &amp; Distance</button>
          <button class="hm-tab" data-tab="fxp">Formation × Play</button>
          <button class="hm-tab" data-tab="hash">Hash Tendency</button>
        </div>
        <div class="heatmap-panels">
          <div class="hm-panel active" data-panel="field">${this._renderField(plays)}</div>
          <div class="hm-panel" data-panel="dd">${this._renderDownDistance(plays)}</div>
          <div class="hm-panel" data-panel="fxp">${this._renderFormationByPlay(plays)}</div>
          <div class="hm-panel" data-panel="hash">${this._renderHash(plays)}</div>
        </div>
      </div>
    `;
  }

  bind(container) {
    const tabs = container.querySelectorAll('.hm-tab');
    const panels = container.querySelectorAll('.hm-panel');
    tabs.forEach(tab => {
      tab.addEventListener('click', () => {
        tabs.forEach(t => t.classList.remove('active'));
        panels.forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        const target = container.querySelector(`.hm-panel[data-panel="${tab.dataset.tab}"]`);
        if (target) target.classList.add('active');
      });
    });
  }

  _absYardLine(tags) {
    const yl = parseInt(tags.yardLine);
    if (!yl) return null;
    return (tags.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  _renderField(plays) {
    const W = 1000, H = 440;
    const fStart = 60, fEnd = 940;
    const fW = fEnd - fStart;
    const fTop = 60, fBot = 380;
    const fH = fBot - fTop;

    const plotted = plays.filter(p => this._absYardLine(p.tags) !== null);
    if (!plotted.length) {
      return '<p class="hm-caption">No plays have field position tagged. Tag yard line + side in the Play Tagger to populate this view.</p>';
    }

    let lines = '';
    for (let i = 0; i <= 100; i += 10) {
      const x = fStart + (i / 100) * fW;
      const isMajor = i % 50 === 0;
      lines += `<line x1="${x}" y1="${fTop}" x2="${x}" y2="${fBot}" stroke="#fff" stroke-width="${isMajor ? 2 : 1}" opacity="${isMajor ? 0.6 : 0.3}"/>`;
      if (i > 0 && i < 100) {
        const label = i === 50 ? '50' : (i < 50 ? i : 100 - i);
        lines += `<text x="${x}" y="${fTop + 22}" fill="#fff" text-anchor="middle" font-size="14" opacity="0.7">${label}</text>`;
        lines += `<text x="${x}" y="${fBot - 8}" fill="#fff" text-anchor="middle" font-size="14" opacity="0.7">${label}</text>`;
      }
    }

    // Hash mark guides
    const hashTop = fTop + fH * 0.35;
    const hashBot = fTop + fH * 0.65;
    lines += `<line x1="${fStart}" y1="${hashTop}" x2="${fEnd}" y2="${hashTop}" stroke="#fff" stroke-width="1" stroke-dasharray="4 8" opacity="0.25"/>`;
    lines += `<line x1="${fStart}" y1="${hashBot}" x2="${fEnd}" y2="${hashBot}" stroke="#fff" stroke-width="1" stroke-dasharray="4 8" opacity="0.25"/>`;

    let dots = '';
    for (const p of plotted) {
      const yl = this._absYardLine(p.tags);
      const x = fStart + (yl / 100) * fW;
      const hash = p.tags.hash || 'Middle';
      let yFrac = 0.5;
      if (hash === 'Left') yFrac = 0.25;
      else if (hash === 'Right') yFrac = 0.75;
      // Tiny jitter so overlapping plays don't fully hide
      const jitter = ((p.id * 37) % 11 - 5) * 1.5;
      const y = fTop + yFrac * fH + jitter;

      const yds = parseInt(p.tags.yardage) || 0;
      let color = '#888', radius = 5;
      const rParts = String(p.tags.result || '').split(/\s*\+\s*/);
      if (rParts.includes('Touchdown')) { color = '#22c55e'; radius = 7; }
      else if (yds >= 20) { color = '#38bdf8'; radius = 6; }
      else if (yds >= 4) { color = '#f97316'; }
      else if (yds <= 0 || rParts.includes('Loss') || rParts.includes('Sack')) { color = '#ef4444'; }
      else if (rParts.includes('Interception') || rParts.includes('Fumble')) { color = '#a855f7'; radius = 6; }

      const desc = `Play ${p.id}: ${p.tags.playType || ''} ${yds}yd ${p.tags.result || ''}`.trim();
      dots += `<circle cx="${x}" cy="${y}" r="${radius}" fill="${color}" stroke="#000" stroke-width="0.5" opacity="0.8"><title>${this._escape(desc)}</title></circle>`;
    }

    return `
      <div class="hm-field-wrap">
        <svg viewBox="0 0 ${W} ${H}" class="heatmap-field">
          <rect x="0" y="${fTop}" width="${fStart}" height="${fH}" fill="#0a3a0a"/>
          <rect x="${fEnd}" y="${fTop}" width="${fStart}" height="${fH}" fill="#0a3a0a"/>
          <rect x="${fStart}" y="${fTop}" width="${fW}" height="${fH}" fill="#1f5e1f"/>
          ${lines}
          <text x="30" y="${(fTop + fBot) / 2}" fill="#fff" text-anchor="middle" font-size="22" font-weight="bold" transform="rotate(-90 30 ${(fTop + fBot) / 2})">OWN</text>
          <text x="970" y="${(fTop + fBot) / 2}" fill="#fff" text-anchor="middle" font-size="22" font-weight="bold" transform="rotate(90 970 ${(fTop + fBot) / 2})">OPP</text>
          ${dots}
        </svg>
        <div class="hm-legend">
          <span><i style="background:#22c55e"></i> TD</span>
          <span><i style="background:#38bdf8"></i> 20+ yds</span>
          <span><i style="background:#f97316"></i> 4-19 yds</span>
          <span><i style="background:#6b7280"></i> 1-3 yds</span>
          <span><i style="background:#ef4444"></i> Loss/Sack</span>
          <span><i style="background:#a855f7"></i> Turnover</span>
        </div>
        <p class="hm-caption">${plotted.length} of ${plays.length} plays plotted (need yard line + side tagged). Hover a dot for details.</p>
      </div>
    `;
  }

  _renderDownDistance(plays) {
    const downs = ['1', '2', '3', '4'];
    const buckets = [
      { label: '1-3', test: d => d >= 1 && d <= 3 },
      { label: '4-6', test: d => d >= 4 && d <= 6 },
      { label: '7-10', test: d => d >= 7 && d <= 10 },
      { label: '11+', test: d => d >= 11 }
    ];

    const cells = downs.map(down =>
      buckets.map(b => {
        const matched = plays.filter(p => p.tags.down === down && b.test(parseInt(p.tags.distance) || 0));
        const runs = matched.filter(p => this._isRun(p)).length;
        const successes = matched.filter(p => this._isSuccess(p)).length;
        return { count: matched.length, runs, successes };
      })
    );

    const maxCount = Math.max(1, ...cells.flat().map(c => c.count));

    let html = '<table class="dd-grid"><thead><tr><th></th>';
    buckets.forEach(b => html += `<th>${b.label}</th>`);
    html += '</tr></thead><tbody>';

    downs.forEach((d, i) => {
      html += `<tr><th>${d}${this._suffix(d)}</th>`;
      cells[i].forEach(c => {
        const intensity = c.count / maxCount;
        const bg = c.count ? `rgba(233, 69, 96, ${intensity * 0.75 + 0.05})` : 'transparent';
        const runPct = c.count ? Math.round((c.runs / c.count) * 100) : 0;
        const successPct = c.count ? Math.round((c.successes / c.count) * 100) : 0;
        html += `<td style="background:${bg}">
          <div class="dd-count">${c.count || ''}</div>
          ${c.count ? `<div class="dd-meta">${runPct}%R · ${successPct}%S</div>` : ''}
        </td>`;
      });
      html += '</tr>';
    });
    html += '</tbody></table>';
    return html + '<p class="hm-caption">Cell intensity = play count. R = run share, S = success rate.</p>';
  }

  _renderFormationByPlay(plays) {
    // Formation is multi-select ("Pistol + Spread"); split each play into its
    // component looks so every formation gets its own matrix row.
    // E3b: read the PROJECTED structural formation — a play charted only as
    // "Shotgun" is QB alignment, not a formation, and must not appear as a
    // formation row (§6.4: blank is omitted, never imputed).
    const formsOf = (p) => StatsEngine.splitFormations(StatsEngine.proj(p).formation);
    const formations = [...new Set(plays.flatMap(formsOf))];
    const playTypes = [...new Set(plays.map(p => p.tags.playType).filter(Boolean))];

    if (!formations.length || !playTypes.length) {
      return '<p class="hm-caption">Need both formation and play type tagged on at least a few plays.</p>';
    }

    const matrix = formations.map(f =>
      playTypes.map(pt => plays.filter(p => formsOf(p).includes(f) && p.tags.playType === pt).length)
    );
    const max = Math.max(1, ...matrix.flat());
    const rowTotals = matrix.map(row => row.reduce((s, n) => s + n, 0));

    let html = '<div class="hm-scroll"><table class="fxp-grid"><thead><tr><th></th>';
    playTypes.forEach(pt => html += `<th class="rotated"><div>${this._escape(pt)}</div></th>`);
    html += '<th>Total</th></tr></thead><tbody>';

    formations.forEach((f, i) => {
      html += `<tr><th>${this._escape(f)}</th>`;
      matrix[i].forEach((count, j) => {
        const intensity = count / max;
        const bg = count ? `rgba(68, 170, 68, ${intensity * 0.85 + 0.1})` : 'transparent';
        const pct = rowTotals[i] ? Math.round((count / rowTotals[i]) * 100) : 0;
        html += `<td style="background:${bg}" title="${f} → ${playTypes[j]}: ${count} (${pct}%)">${count || ''}</td>`;
      });
      html += `<td><b>${rowTotals[i]}</b></td></tr>`;
    });

    html += '</tbody></table></div>';
    return html + '<p class="hm-caption">Darker = called more often. Hover a cell for percentage of that formation.</p>';
  }

  _renderHash(plays) {
    const hashes = ['Left', 'Middle', 'Right'];
    const types = [
      ['Run Inside', p => /run inside/i.test(p.tags.playType || '')],
      ['Run Outside', p => /run outside/i.test(p.tags.playType || '')],
      ['Short Pass', p => /short pass|screen/i.test(p.tags.playType || '')],
      ['Med/Deep Pass', p => /(medium|deep) pass|play action/i.test(p.tags.playType || '')],
      ['RPO/Trick', p => /rpo|trick/i.test(p.tags.playType || '')]
    ];

    const hashTotals = hashes.map(h => plays.filter(p => p.tags.hash === h).length);

    if (hashTotals.every(t => t === 0)) {
      return '<p class="hm-caption">No hash data tagged on any plays.</p>';
    }

    let html = '<table class="hash-grid"><thead><tr><th></th>';
    hashes.forEach(h => html += `<th>${h}</th>`);
    html += '<th>Total</th></tr></thead><tbody>';

    types.forEach(([name, test]) => {
      let rowTotal = 0;
      let row = `<tr><th>${name}</th>`;
      hashes.forEach((h, i) => {
        const count = plays.filter(p => p.tags.hash === h && test(p)).length;
        rowTotal += count;
        const intensity = hashTotals[i] ? count / hashTotals[i] : 0;
        const bg = count ? `rgba(136, 221, 255, ${intensity * 0.8 + 0.05})` : 'transparent';
        const pct = hashTotals[i] ? Math.round((count / hashTotals[i]) * 100) : 0;
        row += `<td style="background:${bg}" title="${pct}% of ${h} hash">${count || ''}</td>`;
      });
      row += `<td><b>${rowTotal}</b></td></tr>`;
      html += row;
    });

    html += '<tr><th>Total</th>';
    hashTotals.forEach(t => html += `<td><b>${t}</b></td>`);
    html += `<td><b>${hashTotals.reduce((s, t) => s + t, 0)}</b></td></tr>`;
    html += '</tbody></table>';
    return html + '<p class="hm-caption">Cell intensity = share of plays from that hash.</p>';
  }

  _isRun(p) {
    const rp = p.tags && p.tags.runPass;
    if (rp === 'Run') return true;
    if (rp === 'Pass') return false;
    return !!(p.tags && p.tags.playType && p.tags.playType.toLowerCase().includes('run'));
  }

  _isSuccess(p) {
    const yds = parseInt(p.tags.yardage) || 0;
    const dist = parseInt(p.tags.distance) || 10;
    if (String(p.tags.result || '').split(/\s*\+\s*/).includes('Touchdown')) return true;
    if (p.tags.custom?.includes('1st Down')) return true;
    switch (p.tags.down) {
      case '1': return yds >= dist * 0.5;
      case '2': return yds >= dist * 0.7;
      case '3':
      case '4': return yds >= dist;
      default: return yds >= 4;
    }
  }

  _suffix(d) { return ({ '1': 'st', '2': 'nd', '3': 'rd', '4': 'th' })[d] || ''; }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
}
