import { useLayoutEffect, useRef, useState } from 'preact/hooks';

export function DiagramEditor({ shapes, draw, drawShape, prompt, save, cancel }) {
  const canvas = useRef(null), live = useRef(true);
  const model = useRef({ shapes: structuredClone(shapes), tool: 'O', drawing: null });
  const [, update] = useState(0);
  const redraw = () => {
    const node = canvas.current, state = model.current;
    if (!node) return;
    draw(node, state.shapes);
    if (state.drawing) drawShape(node.getContext('2d'), node.width, node.height, state.drawing);
  };
  useLayoutEffect(() => { live.current = true; redraw(); return () => { live.current = false; }; }, []);
  const position = event => {
    const rect = canvas.current.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (event.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, (event.clientY - rect.top) / rect.height)) };
  };
  const down = async event => {
    event.preventDefault();
    const point = position(event), state = model.current;
    if (state.tool === 'O' || state.tool === 'X') state.shapes.push({ t: state.tool, ...point });
    else if (state.tool === 'text') {
      const label = ((await prompt('Label text:', 'Add label')) || '').trim();
      if (!live.current) return;
      if (label) state.shapes.push({ t: 'text', ...point, s: label });
    } else if (state.tool === 'erase') {
      let nearest = -1, distance = 0.05;
      state.shapes.forEach((shape, index) => {
        const x = shape.x ?? shape.pts?.[0]?.x, y = shape.y ?? shape.pts?.[0]?.y;
        if (x == null) return;
        const delta = Math.hypot(x - point.x, y - point.y);
        if (delta < distance) { distance = delta; nearest = index; }
      });
      if (nearest >= 0) state.shapes.splice(nearest, 1);
    } else if (state.tool === 'route') {
      state.drawing = { t: 'route', pts: [point], a: true };
      canvas.current.setPointerCapture(event.pointerId);
    }
    redraw();
  };
  const move = event => {
    const drawing = model.current.drawing;
    if (!drawing) return;
    event.preventDefault();
    const point = position(event), last = drawing.pts.at(-1);
    if (Math.hypot(last.x - point.x, last.y - point.y) > 0.01) { drawing.pts.push(point); redraw(); }
  };
  const up = () => {
    const state = model.current;
    if (state.drawing?.pts.length > 1) state.shapes.push(state.drawing);
    state.drawing = null; redraw();
  };
  return <div id="diagramEditorModal" class="pd-editor">
    <div class="pd-tools">{Object.entries({ O: 'O (Off)', X: 'X (Def)', route: 'Route \u2197', text: 'Text', erase: 'Erase' }).map(([tool, label]) => <button type="button" class={model.current.tool === tool ? 'btn btn-sm pd-tool active' : 'btn btn-sm pd-tool'} data-tool={tool} onClick={() => { model.current.tool = tool; update(value => value + 1); }}>{label}</button>)}<button type="button" class="btn btn-sm pd-undo" title="Undo last" onClick={() => { model.current.shapes.pop(); redraw(); }}>Undo</button><button type="button" class="btn btn-sm btn-danger pd-clear" onClick={() => { model.current.shapes = []; redraw(); }}>Clear</button></div>
    <canvas ref={canvas} class="pd-canvas" width="640" height="380" onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={() => { model.current.drawing = null; redraw(); }}/>
    <p class="pd-help">{'Tap to place O/X or text \u00b7 drag for a route \u00b7 Erase taps a mark to remove it.'}</p>
    <div class="gi-overlay-actions"><button type="button" class="btn btn-sm" data-act="cancel" onClick={cancel}>Cancel</button><button type="button" class="btn btn-sm btn-accent" data-act="save" onClick={() => save(model.current.shapes)}>Save</button></div>
  </div>;
}
