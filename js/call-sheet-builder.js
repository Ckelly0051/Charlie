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
  constructor(playTagger) {
    this.tagger = playTagger;
    this.advanced = new AdvancedMetrics();
    this._injectButton();
    this._injectModal();
    this._bind();
  }

  _injectButton() {
    const bar = document.querySelector('#btnSeason')?.parentElement;
    if (!bar || document.getElementById('btnCallSheet')) return;
    const btn = document.createElement('button');
    btn.className = 'btn';
    btn.id = 'btnCallSheet';
    btn.title = 'Generate printable call sheet / wristband';
    btn.innerHTML = '<svg class="icon"><use href="#icon-notes"/></svg> Call Sheet';
    bar.insertBefore(btn, document.getElementById('btnSeason'));
  }

  _injectModal() {
    if (document.getElementById('callSheetModal')) return;
    const m = document.createElement('div');
    m.id = 'callSheetModal';
    m.className = 'cs-modal hidden';
    m.innerHTML = `
      <div class="cs-overlay">
        <div class="cs-container">
          <div class="cs-header">
            <h2>Call Sheet Builder</h2>
            <div class="cs-header-actions">
              <button class="btn btn-sm btn-success" id="csBuild">Build &amp; Print</button>
              <button class="btn btn-sm btn-danger" id="csClose">Close</button>
            </div>
          </div>
          <div class="cs-body">
            <div class="cs-config">
              <div class="cs-row">
                <label>Title</label>
                <input type="text" id="csTitle" placeholder="Friday vs Opponent">
              </div>
              <div class="cs-row">
                <label>Layout</label>
                <select id="csLayout">
                  <option value="wristband">Wristband (3-up, compact)</option>
                  <option value="callsheet">Full Call Sheet (letter)</option>
                  <option value="script">Practice Script</option>
                </select>
              </div>
              <div class="cs-row">
                <label>Rank By</label>
                <select id="csRank">
                  <option value="epa">EPA (best first)</option>
                  <option value="yards">Yards</option>
                  <option value="recent">Most Recent</option>
                </select>
              </div>
              <div class="cs-row">
                <label>Number Plays</label>
                <select id="csNumber">
                  <option value="seq">Sequential (1, 2, 3…)</option>
                  <option value="bucket">Per Bucket (R1, R2…)</option>
                  <option value="none">No Numbers</option>
                </select>
              </div>
              <h4 style="margin:14px 0 4px">Buckets &amp; Counts</h4>
              <div class="cs-buckets" id="csBuckets"></div>
            </div>
            <div class="cs-preview" id="csPreview">
              <p style="opacity:.6">Click "Build &amp; Print" to generate your call sheet.</p>
            </div>
          </div>
        </div>
      </div>`;
    document.body.appendChild(m);

    const bWrap = m.querySelector('#csBuckets');
    BUCKETS.forEach(b => {
      const row = document.createElement('div');
      row.className = 'cs-bucket-row';
      row.innerHTML = `
        <label><input type="checkbox" class="cs-bk-on" data-id="${b.id}" checked> ${b.label}</label>
        <input type="number" class="cs-bk-n" data-id="${b.id}" value="${b.count}" min="0" max="20">`;
      bWrap.appendChild(row);
    });
  }

  _bind() {
    document.getElementById('btnCallSheet').addEventListener('click', () => this.show());
    const m = document.getElementById('callSheetModal');
    m.querySelector('#csClose').addEventListener('click', () => this.hide());
    m.querySelector('.cs-overlay').addEventListener('click', e => {
      if (e.target.classList.contains('cs-overlay')) this.hide();
    });
    m.querySelector('#csBuild').addEventListener('click', () => this.build());
  }

  show() { document.getElementById('callSheetModal').classList.remove('hidden'); }
  hide() { document.getElementById('callSheetModal').classList.add('hidden'); }

  _absYL(t) {
    const yl = parseInt(t.yardLine);
    if (!yl) return null;
    return (t.fieldSide || 'own') === 'opp' ? (100 - yl) : yl;
  }

  _gather(rankMode) {
    const all = this.tagger.plays.filter(p => p.tags && p.tags.playType);
    // Compute EPA once
    const epaMap = new Map();
    all.forEach(p => epaMap.set(p.id, this.advanced.computeEPA(p)));

    const score = (p) => {
      if (rankMode === 'yards') return parseInt(p.tags.yardage) || 0;
      if (rankMode === 'recent') return p.timestamp || p.id;
      const e = epaMap.get(p.id);
      return e == null ? -999 : e;
    };

    const buckets = [];
    const onState = id => document.querySelector(`.cs-bk-on[data-id="${id}"]`)?.checked;
    const nState  = id => parseInt(document.querySelector(`.cs-bk-n[data-id="${id}"]`)?.value) || 0;

    for (const b of BUCKETS) {
      if (!onState(b.id)) continue;
      const n = nState(b.id);
      if (!n) continue;
      const matches = all.filter((p, i) => {
        try { return b.filter(p, i, this._absYL(p.tags || {})); }
        catch { return false; }
      });
      const ranked = matches.slice().sort((a, b2) => score(b2) - score(a)).slice(0, n);
      buckets.push({ id: b.id, label: b.label, plays: ranked });
    }
    return buckets;
  }

  _playLabel(p) {
    const t = p.tags || {};
    const parts = [];
    if (t.formation) parts.push(t.formation);
    if (t.personnel) parts.push(t.personnel);
    if (t.playType) parts.push(t.playType);
    // Coaches often type the real play call ("Power R 34 Lead") in notes —
    // surface it in quotes so the sheet shows the actual call, not just type.
    const note = (p.notes || '').trim().replace(/\s+/g, ' ');
    if (note) parts.push(`"${note.length > 40 ? note.slice(0, 39) + '…' : note}"`);
    return parts.join(' ') || `Play #${p.id}`;
  }

  /** Compact performance tag so an EPA-ranked call shows why it's ranked. */
  _playResult(p) {
    const t = p.tags || {};
    const yds = parseInt(t.yardage);
    switch (t.result) {
      case 'Touchdown': return `TD${isNaN(yds) ? '' : ' ' + yds}`;
      case 'Incomplete': return 'Inc';
      case 'Interception': return 'INT';
      case 'Fumble': return 'Fum';
      case 'Sack': return `Sack${isNaN(yds) ? '' : ' ' + yds}`;
      case 'Field Goal': return 'FG';
      case 'Punt': return 'Punt';
      default:
        if (isNaN(yds)) return t.result || '';
        return (yds > 0 ? '+' : '') + yds;
    }
  }

  build() {
    const layout = document.getElementById('csLayout').value;
    const rank   = document.getElementById('csRank').value;
    const numStyle = document.getElementById('csNumber').value;
    const title  = document.getElementById('csTitle').value || 'Call Sheet';
    const buckets = this._gather(rank);

    if (!buckets.length || buckets.every(b => !b.plays.length)) {
      alert('No plays match the selected buckets. Tag more plays or enable more buckets.');
      return;
    }

    let seq = 1;
    const numFor = (bIdx, pIdx) => {
      if (numStyle === 'none') return '';
      if (numStyle === 'bucket') return `${bIdx + 1}-${pIdx + 1}`;
      return String(seq++);
    };

    const html = layout === 'script'
      ? this._renderScript(title, buckets, numFor)
      : this._renderCallSheet(title, buckets, numFor, layout === 'wristband');

    // Preview inline + open print window
    document.getElementById('csPreview').innerHTML = `<iframe class="cs-preview-frame" srcdoc="${html.replace(/"/g, '&quot;')}"></iframe>`;

    const w = window.open('', '_blank');
    if (!w) { alert('Popup blocked — allow popups and try again.'); return; }
    w.document.open();
    w.document.write(html);
    w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
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
        return `<tr><td class="num">${numFor(bIdx, pIdx)}</td><td>${this._esc(this._playLabel(p))}</td><td class="res">${res}</td></tr>`;
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
