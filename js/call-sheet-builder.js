/**
 * CallSheetBuilder - Generates a printable wristband-style call sheet and
 * practice script from tagged plays.
 *
 * Output is a styled HTML document opened in a new window that the user prints
 * to PDF (or paper). Formatted to fit a standard wristband insert when the
 * "Wristband" layout is chosen.
 *
 * Buckets pull plays from PlayTagger using situational filters. The user picks
 * how many of each to include; we rank by EPA (if available) then by yards.
 */
import { AdvancedMetrics } from './advanced-metrics.js';
import { PlayDiagram } from './play-diagram.js';
import { StatsEngine } from './stats-engine.js';
import { TagProjection } from './tag-projection.js';
import { h } from 'preact';
import { NativeCallSheet } from './native-call-sheet.jsx';

const BUCKETS = [
  { id: 'openers',   label: 'Openers',        count: 8,  filter: (p, i) => i < 15 },
  { id: 'first10',   label: '1st & 10',       count: 8,  filter: p => p.tags.down === '1' && (parseInt(p.tags.distance) || 10) >= 8 },
  { id: 'second_l',  label: '2nd & Long (7+)', count: 6, filter: p => p.tags.down === '2' && (parseInt(p.tags.distance) || 0) >= 7 },
  { id: 'second_s',  label: '2nd & Short (≤6)',count: 6, filter: p => p.tags.down === '2' && (parseInt(p.tags.distance) || 0) > 0 && (parseInt(p.tags.distance) || 0) <= 6 },
  { id: 'third_l',   label: '3rd & Long (7+)', count: 6, filter: p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 7 },
  { id: 'third_m',   label: '3rd & Med (4-6)', count: 6, filter: p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) >= 4 && (parseInt(p.tags.distance) || 0) <= 6 },
  { id: 'third_s',   label: '3rd & Short (≤3)',count: 6, filter: p => p.tags.down === '3' && (parseInt(p.tags.distance) || 0) > 0 && (parseInt(p.tags.distance) || 0) <= 3 },
  { id: 'fourth',    label: '4th Down Go',     count: 4, filter: p => p.tags.down === '4' },
  { id: 'redzone',   label: 'Red Zone',        count: 8, filter: (p, i, abs) => abs != null && abs >= 80 && abs < 95 },
  { id: 'goalline',  label: 'Goal Line',       count: 6, filter: (p, i, abs) => abs != null && abs >= 95 },
  { id: 'backedup',  label: 'Backed Up',       count: 4, filter: (p, i, abs) => abs != null && abs <= 10 },
  { id: 'twomin',    label: '2 Minute',        count: 6, filter: p => /2\s*min|two\s*min|hurry/i.test((p.tags.custom || []).join(' ')) },
  { id: 'fourmin',   label: '4 Minute',        count: 4, filter: p => /4\s*min|four\s*min|kill/i.test((p.tags.custom || []).join(' ')) },
];

export class CallSheetBuilder {
  constructor(playTagger, overlays) {
    this.tagger = playTagger;
    this.overlays = overlays;
    this.advanced = new AdvancedMetrics();
    this._overlay = null;
  }

  defaultConfig() {
    return {
      title: '',
      layout: 'wristband',
      rank: 'epa',
      numberStyle: 'seq',
      buckets: Object.fromEntries(BUCKETS.map(bucket => [bucket.id, { enabled: true, count: bucket.count }])),
    };
  }

  _eligiblePlays() {
    return this.tagger.plays.filter(play => play.tags && play.tags.playType);
  }

  _matches(bucket, plays) {
    return plays.filter((play, index) => {
      try { return bucket.filter(play, index, this._absYL(play.tags || {})); }
      catch { return false; }
    });
  }

  bucketOptions() {
    const plays = this._eligiblePlays();
    return BUCKETS.map(bucket => ({
      id: bucket.id,
      label: bucket.label,
      count: bucket.count,
      available: this._matches(bucket, plays).length,
    }));
  }

  show({ returnFocus } = {}) {
    this.hide('replaced');
    const handle = this.overlays.sheet({
      id: 'call-sheet-builder',
      title: 'Call Sheet Builder',
      modal: true,
      dismissOnScrim: false,
      returnFocus,
      initialFocus: '.gi-call-sheet-field input',
      content: h(NativeCallSheet, { builder: this }),
    });
    this._overlay = handle;
    handle.result.finally(() => {
      if (this._overlay === handle) this._overlay = null;
    });
    return handle;
  }

  hide(reason = 'cancel') {
    if (!this._overlay) return false;
    const handle = this._overlay;
    this._overlay = null;
    return handle.close(reason);
  }
  _absYL(t) {
    const yl = parseInt(t.yardLine);
    if (!yl) return null;
    return (t.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  _gather(rankMode, bucketSettings = this.defaultConfig().buckets) {
    const all = this._eligiblePlays();
    // Compute EPA once
    const epaMap = new Map();
    all.forEach(p => epaMap.set(p.id, this.advanced.computeEPA(p)));

    const score = (p) => {
      if (rankMode === 'yards') return parseInt(p.tags.yardage, 10) || 0;
      // "Recent" ranks by creation order. p.timestamp is a {start,end} OBJECT,
      // so the old `p.timestamp || p.id` fed the sort NaN and never reordered;
      // p.id is monotonic with tagging order and always numeric.
      if (rankMode === 'recent') return p.id || 0;
      const e = epaMap.get(p.id);
      return e == null ? -999 : e;
    };

    const buckets = [];
    for (const b of BUCKETS) {
      const setting = bucketSettings[b.id] || { enabled: true, count: b.count };
      if (!setting.enabled) continue;
      const n = Math.max(0, Math.min(20, parseInt(setting.count, 10) || 0));
      if (!n) continue;
      const matches = this._matches(b, all);
      const ranked = matches.slice().sort((a, b2) => score(b2) - score(a)).slice(0, n);
      buckets.push({ id: b.id, label: b.label, plays: ranked });
    }
    return buckets;
  }

  _playLabel(p) {
    const t = p.tags || {};
    const parts = [];
    const exactCall = String(t.playCall || '').trim();
    if (exactCall) {
      parts.push(exactCall);
      if (t.playConcept && t.playConcept !== exactCall) parts.push(`(${t.playConcept})`);
    } else {
      // Legacy fallback: preserve the prior structural label and optional
      // notes-as-call behavior without converting or rewriting old data.
      const look = TagProjection.lookLabel(t);
      if (look) parts.push(look);
      if (t.personnel) parts.push(t.personnel);
      if (t.playType) parts.push(t.playType);
    }
    const note = (p.notes || '').trim().replace(/\s+/g, ' ');
    if (note) parts.push(`"${note.length > 40 ? note.slice(0, 39) + '…' : note}"`);
    return parts.join(' ') || `Play #${p.id}`;
  }

  /** Diagram thumbnail (data-URL <img>) for a play, or '' if none. */
  _diagramImg(p, w = 132, h = 82) {
    if (!p.diagram || !p.diagram.length) return '';
    try { return `<img class="cs-diagram" src="${PlayDiagram.toDataURL(p.diagram, w * 2, h * 2)}" width="${w}" height="${h}">`; }
    catch { return ''; }
  }

  /** Compact performance tag so an EPA-ranked call shows why it's ranked. */
  _playResult(p) {
    const t = p.tags || {};
    const yds = parseInt(t.yardage, 10);
    // result is a " + "-joined multi-select ("Interception + Touchdown" for a
    // pick-six, "Fumble + Touchdown" for a scoop-score). The old exact switch
    // matched none of those and fell through to the raw string. Split and rank
    // the most salient outcome.
    const res = StatsEngine.splitResults(t.result);
    const has = v => res.includes(v);
    if (has('Touchdown')) return `TD${isNaN(yds) ? '' : ' ' + yds}`;
    if (has('Interception')) return 'INT';
    if (has('Fumble')) return 'Fum';
    if (has('Sack')) return `Sack${isNaN(yds) ? '' : ' ' + yds}`;
    if (has('Field Goal')) return 'FG';
    if (has('Punt')) return 'Punt';
    if (has('Incomplete')) return 'Inc';
    if (isNaN(yds)) return t.result || '';
    return (yds > 0 ? '+' : '') + yds;
  }

  createDocument(options = {}) {
    const defaults = this.defaultConfig();
    const config = { ...defaults, ...options, buckets: options.buckets || defaults.buckets };
    const title = config.title || 'Call Sheet';
    const buckets = this._gather(config.rank, config.buckets);
    if (!buckets.length || buckets.every(bucket => !bucket.plays.length)) return { ok: false, html: '', buckets };

    let seq = 1;
    const numFor = (bIdx, pIdx) => {
      if (config.numberStyle === 'none') return '';
      if (config.numberStyle === 'bucket') return `${bIdx + 1}-${pIdx + 1}`;
      return String(seq++);
    };

    const html = config.layout === 'script'
      ? this._renderScript(title, buckets, numFor)
      : this._renderCallSheet(title, buckets, numFor, config.layout === 'wristband');
    return { ok: true, html, buckets };
  }

  printDocument(html) {
    if (!html) return false;
    const w = window.open('', '_blank');
    if (!w) {
      this.overlays?.toast({ message: 'Popup blocked. Allow popups and try again.', tone: 'warning' });
      return false;
    }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch {} }, 400);
    return true;
  }

  build(options = {}) {
    const result = this.createDocument(options);
    if (!result.ok) {
      this.overlays?.toast({ message: 'No plays match those situations. Tag more plays or enable another situation.', tone: 'warning' });
      return result;
    }
    this.printDocument(result.html);
    return result;
  }
  _baseStyles(wristband) {
    return `
      * { box-sizing: border-box; }
      body { font-family: -apple-system, Helvetica, Arial, sans-serif; margin: 0; padding: 12px; color: #000; background: #fff; }
      h1 { font-size: 18px; margin: 0 0 8px; }
      h2 { font-size: 12px; margin: 0; padding: 4px 6px; background: #222; color: #fff; text-transform: uppercase; letter-spacing: 0.5px; }
      .grid { display: grid; gap: 8px; }
      .grid.wristband { grid-template-columns: repeat(3, 1fr); }
      .grid.full { grid-template-columns: repeat(2, 1fr); }
      .bucket { border: 1px solid #000; break-inside: avoid; }
      .bucket table { width: 100%; border-collapse: collapse; font-size: ${wristband ? '8px' : '10px'}; }
      .bucket td { border-top: 1px solid #ccc; padding: 2px 4px; vertical-align: top; }
      .bucket td.num { font-weight: bold; width: 18px; text-align: right; background: #f4f4f4; }
      .bucket td.res { text-align: right; white-space: nowrap; color: #444; font-variant-numeric: tabular-nums; width: 34px; }
      .cs-diag-wrap { margin-top: 3px; }
      .cs-diagram { display: block; border: 1px solid #999; border-radius: 3px; max-width: 100%; height: auto; }
      @media print {
        body { padding: 0.3in; }
        .bucket { page-break-inside: avoid; }
        @page { size: ${wristband ? '4in 6in' : 'letter'}; margin: 0.25in; }
      }
    `;
  }

  _renderCallSheet(title, buckets, numFor, wristband) {
    const cls = wristband ? 'wristband' : 'full';
    const sections = buckets.map((b, bIdx) => {
      if (!b.plays.length) return '';
      const rows = b.plays.map((p, pIdx) => {
        const res = this._esc(this._playResult(p));
        // Diagrams print on the full sheet (wristband is too compact).
        const diag = wristband ? '' : this._diagramImg(p);
        const label = this._esc(this._playLabel(p)) + (diag ? `<div class="cs-diag-wrap">${diag}</div>` : '');
        return `<tr><td class="num">${numFor(bIdx, pIdx)}</td><td>${label}</td><td class="res">${res}</td></tr>`;
      }).join('');
      return `<div class="bucket"><h2>${this._esc(b.label)}</h2><table>${rows}</table></div>`;
    }).join('');
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._esc(title)}</title>
      <style>${this._baseStyles(wristband)}</style></head><body>
      <h1>${this._esc(title)}</h1>
      <div class="grid ${cls}">${sections}</div>
      </body></html>`;
  }

  _renderScript(title, buckets, numFor) {
    const rows = [];
    let n = 1;
    buckets.forEach((b, bIdx) => {
      b.plays.forEach((p, pIdx) => {
        const t = p.tags || {};
        rows.push(`<tr>
          <td>${n++}</td>
          <td>${this._esc(b.label)}</td>
          <td>${this._esc(t.down || '')}&amp;${this._esc(t.distance || '')}</td>
          <td>${this._esc(t.hash || '')}</td>
          <td>${this._esc(this._playLabel(p))}</td>
          <td></td>
        </tr>`);
      });
    });
    return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>${this._esc(title)}</title>
      <style>
        body { font-family: -apple-system, Helvetica, Arial, sans-serif; padding: 16px; color: #000; }
        h1 { font-size: 20px; margin: 0 0 12px; }
        table { width: 100%; border-collapse: collapse; font-size: 11px; }
        th, td { border: 1px solid #888; padding: 4px 6px; text-align: left; }
        th { background: #222; color: #fff; }
        tr:nth-child(even) { background: #f5f5f5; }
        @media print { @page { size: letter; margin: 0.5in; } }
      </style></head><body>
      <h1>${this._esc(title)} — Practice Script</h1>
      <table>
        <thead><tr><th>#</th><th>Period</th><th>Dn&amp;Dist</th><th>Hash</th><th>Play</th><th>Result</th></tr></thead>
        <tbody>${rows.join('')}</tbody>
      </table>
      </body></html>`;
  }

  _esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }
}
