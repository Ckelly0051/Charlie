import { h } from 'preact';
import { DiagramEditor } from './native-play-diagram.jsx';

/* Per-play normalized field diagrams, distinct from video telestration.
 * Shapes are O/X markers, text labels and routes with optional arrowheads. */
export class PlayDiagram {
  constructor(tagger, overlays) {
    this.tagger = tagger;
    this.overlays = overlays;
  }

  _play() { return this.tagger.getCurrentPlay && this.tagger.getCurrentPlay(); }

  clearCurrent() {
    const play = this._play();
    if (!play) return;
    play.diagram = [];
    this.tagger._emit && this.tagger._emit('play-updated', play);
  }

  // ---- Static rendering (reused by the editor, the deck's thumbnail and the call sheet) ----

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

  openEditor() {
    const play = this._play();
    if (!play) { this.tagger.toast('Select a play first, then draw its diagram.'); return; }
    this.handle?.close('replaced');
    this._editorRevision = (this._editorRevision || 0) + 1;
    let handle;
    handle = this.overlays.sheet({
      id: 'play-diagram', title: 'Play Diagram', modal: true, unsaved: true, actions: [],
      content: h(DiagramEditor, {
        key: this._editorRevision,
        shapes: play.diagram || [], draw: PlayDiagram.draw, drawShape: PlayDiagram._shape,
        prompt: (...args) => this.tagger._promptDialog(...args),
        cancel: () => handle.close(),
        save: shapes => {
          if (this._play() !== play) { handle.close('context-changed'); return; }
          play.diagram = shapes;
          this.tagger._emit('play-updated', play);
          handle.close('save');
        },
      }),
    });
    this.handle = handle;
    handle.result.finally(() => { if (this.handle === handle) this.handle = null; });
  }
}
