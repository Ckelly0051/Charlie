/**
 * PlayDiagram — schematic X's & O's drawing per play.
 *
 * Distinct from the telestrator (`canvas-overlay.js`, which draws over the
 * video frame): this is a blank-field play diagram a coach draws up and that
 * travels with the play (`play.diagram` = array of shapes in normalized 0..1
 * coords) and prints on the call sheet.
 *
 * Shapes:
 *   { t:'O'|'X', x, y }              offensive / defensive marker
 *   { t:'text', x, y, s }            text label
 *   { t:'route', pts:[{x,y}...], a } polyline; a=true draws an arrowhead
 */
export class PlayDiagram {
  constructor(tagger) {
    this.tagger = tagger;
    this.section = document.getElementById('playDiagramSection');
    this.preview = document.getElementById('playDiagramPreview');
    this.btnDraw = document.getElementById('btnDrawDiagram');
    this.btnClearDiagram = document.getElementById('btnClearDiagram');

    if (this.btnDraw) this.btnDraw.addEventListener('click', () => this.openEditor());
    if (this.btnClearDiagram) this.btnClearDiagram.addEventListener('click', () => this.clearCurrent());

    this.tagger.on && this.tagger.on('play-selected', () => this.renderPreview());
    this.renderPreview();
  }

  _play() { return this.tagger.getCurrentPlay && this.tagger.getCurrentPlay(); }

  clearCurrent() {
    const play = this._play();
    if (!play) return;
    play.diagram = [];
    this.tagger._emit && this.tagger._emit('play-updated', play);
    this.renderPreview();
  }

  renderPreview() {
    if (!this.preview) return;
    const play = this._play();
    const shapes = (play && play.diagram) || [];
    const has = shapes.length > 0;
    if (this.section) this.section.classList.toggle('has-diagram', has);
    PlayDiagram.draw(this.preview, shapes);
  }

  // ---- Static rendering (reused by the editor, preview, and call sheet) ----

  /** Draw the field background + shapes onto a <canvas> element. */
  static draw(canvas, shapes) {
    const ctx = canvas.getContext('2d');
    const w = canvas.width, h = canvas.height;
    PlayDiagram._field(ctx, w, h);
    (shapes || []).forEach(s => PlayDiagram._shape(ctx, w, h, s));
  }

  /** Render shapes to a PNG data URL at a given pixel size (for call sheet). */
  static toDataURL(shapes, w = 320, h = 200) {
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    PlayDiagram.draw(c, shapes);
    return c.toDataURL('image/png');
  }

  static _field(ctx, w, h) {
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#13351c';            // turf green
    ctx.fillRect(0, 0, w, h);
    ctx.strokeStyle = 'rgba(255,255,255,0.35)';
    ctx.lineWidth = 1;
    // yard lines (horizontal)
    for (let i = 1; i < 6; i++) {
      const y = (h / 6) * i;
      ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(w, y); ctx.stroke();
    }
    // line of scrimmage (emphasized, middle)
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    const los = h * 0.5;
    ctx.beginPath(); ctx.moveTo(0, los); ctx.lineTo(w, los); ctx.stroke();
    // hash marks
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.lineWidth = 1;
    [w * 0.36, w * 0.64].forEach(x => {
      for (let y = 6; y < h; y += 12) { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x, y + 5); ctx.stroke(); }
    });
  }

  static _shape(ctx, w, h, s) {
    const px = (n) => n * w, py = (n) => n * h;
    const r = Math.max(7, Math.min(w, h) * 0.045);
    ctx.lineWidth = 2;
    if (s.t === 'O') {
      ctx.strokeStyle = '#ffd23f';
      ctx.beginPath(); ctx.arc(px(s.x), py(s.y), r, 0, Math.PI * 2); ctx.stroke();
    } else if (s.t === 'X') {
      ctx.strokeStyle = '#ff5a5a';
      const x = px(s.x), y = py(s.y);
      ctx.beginPath();
      ctx.moveTo(x - r, y - r); ctx.lineTo(x + r, y + r);
      ctx.moveTo(x + r, y - r); ctx.lineTo(x - r, y + r);
      ctx.stroke();
    } else if (s.t === 'text') {
      ctx.fillStyle = '#ffffff';
      ctx.font = `${Math.max(11, r * 1.6)}px sans-serif`;
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText(s.s || '', px(s.x), py(s.y));
    } else if (s.t === 'route' && s.pts && s.pts.length > 1) {
      ctx.strokeStyle = '#6cc4ff';
      ctx.beginPath();
      ctx.moveTo(px(s.pts[0].x), py(s.pts[0].y));
      for (let i = 1; i < s.pts.length; i++) ctx.lineTo(px(s.pts[i].x), py(s.pts[i].y));
      ctx.stroke();
      if (s.a) {
        const a = s.pts[s.pts.length - 2], b = s.pts[s.pts.length - 1];
        const ang = Math.atan2(py(b.y) - py(a.y), px(b.x) - px(a.x));
        const ah = r * 1.1;
        ctx.beginPath();
        ctx.moveTo(px(b.x), py(b.y));
        ctx.lineTo(px(b.x) - ah * Math.cos(ang - 0.4), py(b.y) - ah * Math.sin(ang - 0.4));
        ctx.moveTo(px(b.x), py(b.y));
        ctx.lineTo(px(b.x) - ah * Math.cos(ang + 0.4), py(b.y) - ah * Math.sin(ang + 0.4));
        ctx.stroke();
      }
    }
  }

  // ---- Editor modal ----------------------------------------------------
  openEditor() {
    const play = this._play();
    if (!play) { alert('Select a play first, then draw its diagram.'); return; }
    const prev = document.getElementById('diagramEditorModal');
    if (prev) prev.remove();

    let shapes = JSON.parse(JSON.stringify(play.diagram || []));
    let tool = 'O';
    let drawing = null; // in-progress route

    const overlay = document.createElement('div');
    overlay.className = 'ffa-confirm-modal';
    overlay.id = 'diagramEditorModal';
    overlay.innerHTML = `
      <div class="ffa-confirm-backdrop"></div>
      <div class="ffa-confirm-card pd-editor" role="dialog" aria-modal="true">
        <h3 class="pd-title">Play Diagram</h3>
        <div class="pd-tools">
          ${['O','X','route','text','erase'].map(t =>
            `<button type="button" class="btn btn-sm pd-tool${t==='O'?' active':''}" data-tool="${t}">${
              {O:'O (Off)',X:'X (Def)',route:'Route ↗',text:'Text',erase:'Erase'}[t]}</button>`).join('')}
          <button type="button" class="btn btn-sm pd-undo" title="Undo last">Undo</button>
          <button type="button" class="btn btn-sm btn-danger pd-clear">Clear</button>
        </div>
        <canvas class="pd-canvas" width="640" height="380"></canvas>
        <p class="pd-help">Tap to place O/X or text · drag for a route · Erase taps a mark to remove it.</p>
        <div class="ffa-confirm-actions">
          <button type="button" class="btn btn-sm" data-act="cancel">Cancel</button>
          <button type="button" class="btn btn-sm btn-accent" data-act="save">Save</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    const canvas = overlay.querySelector('.pd-canvas');
    const redraw = () => {
      PlayDiagram.draw(canvas, shapes);
      if (drawing) PlayDiagram._shape(canvas.getContext('2d'), canvas.width, canvas.height, drawing);
    };
    redraw();

    const pos = (e) => {
      const rect = canvas.getBoundingClientRect();
      const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
      const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
      return { x: Math.max(0, Math.min(1, cx / rect.width)), y: Math.max(0, Math.min(1, cy / rect.height)) };
    };
    const nearestIdx = (p) => {
      let best = -1, bd = 0.05; // threshold in normalized space
      shapes.forEach((s, i) => {
        const sx = s.x ?? (s.pts ? s.pts[0].x : null);
        const sy = s.y ?? (s.pts ? s.pts[0].y : null);
        if (sx == null) return;
        const d = Math.hypot(sx - p.x, sy - p.y);
        if (d < bd) { bd = d; best = i; }
      });
      return best;
    };

    const onDown = (e) => {
      e.preventDefault();
      const p = pos(e);
      if (tool === 'O' || tool === 'X') { shapes.push({ t: tool, x: p.x, y: p.y }); redraw(); }
      else if (tool === 'text') {
        const s = (prompt('Label text:') || '').trim();
        if (s) { shapes.push({ t: 'text', x: p.x, y: p.y, s }); redraw(); }
      } else if (tool === 'erase') {
        const i = nearestIdx(p); if (i >= 0) { shapes.splice(i, 1); redraw(); }
      } else if (tool === 'route') {
        drawing = { t: 'route', pts: [p], a: true };
      }
    };
    const onMove = (e) => {
      if (!drawing) return;
      e.preventDefault();
      const p = pos(e);
      const last = drawing.pts[drawing.pts.length - 1];
      if (Math.hypot(last.x - p.x, last.y - p.y) > 0.01) { drawing.pts.push(p); redraw(); }
    };
    const onUp = () => {
      if (drawing) {
        if (drawing.pts.length > 1) shapes.push(drawing);
        drawing = null; redraw();
      }
    };
    canvas.addEventListener('mousedown', onDown);
    canvas.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    canvas.addEventListener('touchstart', onDown, { passive: false });
    canvas.addEventListener('touchmove', onMove, { passive: false });
    canvas.addEventListener('touchend', onUp);

    overlay.querySelectorAll('.pd-tool').forEach(b => b.addEventListener('click', () => {
      tool = b.dataset.tool;
      overlay.querySelectorAll('.pd-tool').forEach(x => x.classList.toggle('active', x === b));
    }));
    overlay.querySelector('.pd-undo').addEventListener('click', () => { shapes.pop(); redraw(); });
    overlay.querySelector('.pd-clear').addEventListener('click', () => { shapes = []; redraw(); });

    const close = () => { window.removeEventListener('mouseup', onUp); overlay.remove(); };
    overlay.addEventListener('click', (e) => {
      const act = e.target.dataset ? e.target.dataset.act : null;
      if (act === 'cancel' || e.target.classList.contains('ffa-confirm-backdrop')) close();
      else if (act === 'save') {
        play.diagram = shapes;
        this.tagger._emit && this.tagger._emit('play-updated', play);
        this.renderPreview();
        close();
      }
    });
  }
}
