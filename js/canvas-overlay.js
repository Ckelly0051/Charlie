/**
 * CanvasOverlay - Manages the HTML5 Canvas drawing surface overlaid on video.
 * Handles coordinate transforms, resize syncing, and rendering.
 */
export class CanvasOverlay {
  constructor(videoController) {
    this.vc = videoController;
    this.canvas = document.getElementById('drawingCanvas');
    this.ctx = this.canvas.getContext('2d');
    this.container = document.getElementById('angleWrapper1') || document.getElementById('videoContainer');

    this.currentTool = null;
    this.color = '#ffffff';
    this.lineWidth = 3;
    this.isDrawing = false;
    this.drawStart = null;
    this.drawPoints = [];
    this.annotations = []; // master list, shared with app state
    this.undoStack = [];
    this.redoStack = [];

    this._resizeObserver = new ResizeObserver(() => this._syncSize());
    this._resizeObserver.observe(this.container);

    this.vc.on('video-loaded', () => {
      requestAnimationFrame(() => this._syncSize());
    });

    this._bindDrawingEvents();
  }

  _syncSize() {
    const video = this.vc.videoElement;
    if (!video.videoWidth) {
      // No video loaded yet, fill container
      this.canvas.width = this.container.clientWidth * devicePixelRatio;
      this.canvas.height = this.container.clientHeight * devicePixelRatio;
      this.canvas.style.width = this.container.clientWidth + 'px';
      this.canvas.style.height = this.container.clientHeight + 'px';
      this.canvas.style.top = '0px';
      this.canvas.style.left = '0px';
      return;
    }

    // Calculate the actual rendered area of the video (object-fit: contain)
    const containerW = this.container.clientWidth;
    const containerH = this.container.clientHeight;
    const videoAspect = video.videoWidth / video.videoHeight;
    const containerAspect = containerW / containerH;

    let renderW, renderH, offsetX, offsetY;
    if (containerAspect > videoAspect) {
      // Pillarboxed
      renderH = containerH;
      renderW = containerH * videoAspect;
      offsetX = (containerW - renderW) / 2;
      offsetY = 0;
    } else {
      // Letterboxed
      renderW = containerW;
      renderH = containerW / videoAspect;
      offsetX = 0;
      offsetY = (containerH - renderH) / 2;
    }

    this.canvas.style.left = offsetX + 'px';
    this.canvas.style.top = offsetY + 'px';
    this.canvas.style.width = renderW + 'px';
    this.canvas.style.height = renderH + 'px';
    this.canvas.width = Math.round(renderW * devicePixelRatio);
    this.canvas.height = Math.round(renderH * devicePixelRatio);

    this.render();
  }

  _bindDrawingEvents() {
    this.canvas.addEventListener('mousedown', (e) => this._onStart(e));
    this.canvas.addEventListener('mousemove', (e) => this._onMove(e));
    this.canvas.addEventListener('mouseup', (e) => this._onEnd(e));
    this.canvas.addEventListener('mouseleave', (e) => {
      if (this.isDrawing) this._onEnd(e);
    });

    // Touch support
    this.canvas.addEventListener('touchstart', (e) => {
      e.preventDefault();
      this._onStart(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchmove', (e) => {
      e.preventDefault();
      this._onMove(e.touches[0]);
    }, { passive: false });
    this.canvas.addEventListener('touchend', (e) => {
      e.preventDefault();
      this._onEnd(e.changedTouches[0]);
    }, { passive: false });
  }

  _getCanvasPos(e) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  toNormalized(canvasX, canvasY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: canvasX / rect.width,
      y: canvasY / rect.height
    };
  }

  toCanvas(normX, normY) {
    const rect = this.canvas.getBoundingClientRect();
    return {
      x: normX * rect.width,
      y: normY * rect.height
    };
  }

  _toCtx(canvasX, canvasY) {
    return {
      x: canvasX * devicePixelRatio,
      y: canvasY * devicePixelRatio
    };
  }

  _onStart(e) {
    if (!this.currentTool) return;
    this.isDrawing = true;
    const pos = this._getCanvasPos(e);
    this.drawStart = pos;
    this.drawPoints = [pos];

    if (this.currentTool === 'text') {
      this.isDrawing = false;
      this._promptText(pos);
    }
  }

  _onMove(e) {
    if (!this.isDrawing || !this.currentTool) return;
    const pos = this._getCanvasPos(e);
    this.drawPoints.push(pos);
    this.render();
    this._renderPreview(pos);
  }

  _onEnd(e) {
    if (!this.isDrawing || !this.currentTool) return;
    this.isDrawing = false;
    const pos = this._getCanvasPos(e);
    this.drawPoints.push(pos);
    this._finalizeAnnotation(pos);
  }

  _promptText(pos) {
    const norm = this.toNormalized(pos.x, pos.y);
    const text = prompt('Enter text:');
    if (text) {
      const annotation = {
        tool: 'text',
        position: norm,
        text: text,
        color: this.color,
        lineWidth: this.lineWidth,
        timestamp: this.vc.currentTime
      };
      this._addAnnotation(annotation);
    }
  }

  _finalizeAnnotation(endPos) {
    const startNorm = this.toNormalized(this.drawStart.x, this.drawStart.y);
    const endNorm = this.toNormalized(endPos.x, endPos.y);
    let annotation = null;

    switch (this.currentTool) {
      case 'line':
        annotation = {
          tool: 'line',
          start: startNorm,
          end: endNorm,
          color: this.color,
          lineWidth: this.lineWidth,
          timestamp: this.vc.currentTime
        };
        break;
      case 'arrow':
        annotation = {
          tool: 'arrow',
          start: startNorm,
          end: endNorm,
          color: this.color,
          lineWidth: this.lineWidth,
          timestamp: this.vc.currentTime
        };
        break;
      case 'circle':
        const dx = endNorm.x - startNorm.x;
        const dy = endNorm.y - startNorm.y;
        const radius = Math.sqrt(dx * dx + dy * dy);
        annotation = {
          tool: 'circle',
          center: startNorm,
          radius: radius,
          color: this.color,
          lineWidth: this.lineWidth,
          timestamp: this.vc.currentTime
        };
        break;
      case 'rect':
        annotation = {
          tool: 'rect',
          origin: { x: Math.min(startNorm.x, endNorm.x), y: Math.min(startNorm.y, endNorm.y) },
          size: { w: Math.abs(endNorm.x - startNorm.x), h: Math.abs(endNorm.y - startNorm.y) },
          color: this.color,
          lineWidth: this.lineWidth,
          timestamp: this.vc.currentTime
        };
        break;
      case 'freehand':
        const points = this.drawPoints.map(p => this.toNormalized(p.x, p.y));
        annotation = {
          tool: 'freehand',
          points: this._simplifyPoints(points, 0.002),
          color: this.color,
          lineWidth: this.lineWidth,
          timestamp: this.vc.currentTime
        };
        break;
    }

    if (annotation) {
      this._addAnnotation(annotation);
    }
  }

  _addAnnotation(annotation) {
    this.annotations.push(annotation);
    this.undoStack.push({ action: 'add', index: this.annotations.length - 1 });
    this.redoStack = [];
    this.render();
    this._emit('annotation-added', annotation);
  }

  undo() {
    if (this.undoStack.length === 0) return;
    const op = this.undoStack.pop();
    if (op.action === 'add') {
      const removed = this.annotations.splice(op.index, 1)[0];
      this.redoStack.push({ action: 'add', annotation: removed, index: op.index });
    }
    this.render();
    this._emit('annotations-changed');
  }

  redo() {
    if (this.redoStack.length === 0) return;
    const op = this.redoStack.pop();
    if (op.action === 'add') {
      this.annotations.splice(op.index, 0, op.annotation);
      this.undoStack.push({ action: 'add', index: op.index });
    }
    this.render();
    this._emit('annotations-changed');
  }

  clearAnnotationsForTime(timestamp, tolerance) {
    const frameDur = 1 / (parseInt(this.vc.fpsInput?.value) || 30);
    const tol = tolerance || frameDur / 2;
    this.annotations = this.annotations.filter(
      a => Math.abs(a.timestamp - timestamp) > tol
    );
    this.undoStack = [];
    this.redoStack = [];
    this.render();
    this._emit('annotations-changed');
  }

  clearAllAnnotations() {
    this.annotations = [];
    this.undoStack = [];
    this.redoStack = [];
    this.render();
    this._emit('annotations-changed');
  }

  render() {
    const ctx = this.ctx;
    const dpr = devicePixelRatio;
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.save();
    ctx.scale(dpr, dpr);

    const rect = this.canvas.getBoundingClientRect();
    const currentTime = this.vc.currentTime;
    const frameDur = 1 / (parseInt(this.vc.fpsInput?.value) || 30);

    // Render finalized annotations near current time
    for (const a of this.annotations) {
      if (Math.abs(a.timestamp - currentTime) <= frameDur / 2) {
        this._renderAnnotation(ctx, a, rect.width, rect.height);
      }
    }

    ctx.restore();
  }

  _renderPreview(currentPos) {
    if (!this.drawStart || !this.currentTool) return;

    const ctx = this.ctx;
    const dpr = devicePixelRatio;
    ctx.save();
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = this.color;
    ctx.lineWidth = this.lineWidth;
    ctx.setLineDash([5, 5]);

    switch (this.currentTool) {
      case 'line':
        ctx.beginPath();
        ctx.moveTo(this.drawStart.x, this.drawStart.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();
        break;
      case 'arrow':
        ctx.beginPath();
        ctx.moveTo(this.drawStart.x, this.drawStart.y);
        ctx.lineTo(currentPos.x, currentPos.y);
        ctx.stroke();
        this._drawArrowHead(ctx, this.drawStart.x, this.drawStart.y, currentPos.x, currentPos.y);
        break;
      case 'circle': {
        const dx = currentPos.x - this.drawStart.x;
        const dy = currentPos.y - this.drawStart.y;
        const r = Math.sqrt(dx * dx + dy * dy);
        ctx.beginPath();
        ctx.arc(this.drawStart.x, this.drawStart.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'rect': {
        const x = Math.min(this.drawStart.x, currentPos.x);
        const y = Math.min(this.drawStart.y, currentPos.y);
        const w = Math.abs(currentPos.x - this.drawStart.x);
        const h = Math.abs(currentPos.y - this.drawStart.y);
        ctx.strokeRect(x, y, w, h);
        break;
      }
      case 'freehand':
        if (this.drawPoints.length > 1) {
          ctx.setLineDash([]);
          ctx.beginPath();
          ctx.moveTo(this.drawPoints[0].x, this.drawPoints[0].y);
          for (let i = 1; i < this.drawPoints.length; i++) {
            ctx.lineTo(this.drawPoints[i].x, this.drawPoints[i].y);
          }
          ctx.stroke();
        }
        break;
    }

    ctx.restore();
  }

  _renderAnnotation(ctx, a, w, h) {
    ctx.strokeStyle = a.color;
    ctx.fillStyle = a.color;
    ctx.lineWidth = a.lineWidth;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.setLineDash([]);

    switch (a.tool) {
      case 'line': {
        const s = { x: a.start.x * w, y: a.start.y * h };
        const e = { x: a.end.x * w, y: a.end.y * h };
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        break;
      }
      case 'arrow': {
        const s = { x: a.start.x * w, y: a.start.y * h };
        const e = { x: a.end.x * w, y: a.end.y * h };
        ctx.beginPath();
        ctx.moveTo(s.x, s.y);
        ctx.lineTo(e.x, e.y);
        ctx.stroke();
        this._drawArrowHead(ctx, s.x, s.y, e.x, e.y);
        break;
      }
      case 'circle': {
        const c = { x: a.center.x * w, y: a.center.y * h };
        const r = a.radius * Math.max(w, h);
        ctx.beginPath();
        ctx.arc(c.x, c.y, r, 0, Math.PI * 2);
        ctx.stroke();
        break;
      }
      case 'rect': {
        const ox = a.origin.x * w;
        const oy = a.origin.y * h;
        const rw = a.size.w * w;
        const rh = a.size.h * h;
        ctx.strokeRect(ox, oy, rw, rh);
        break;
      }
      case 'freehand': {
        if (a.points.length < 2) break;
        ctx.beginPath();
        ctx.moveTo(a.points[0].x * w, a.points[0].y * h);
        for (let i = 1; i < a.points.length; i++) {
          ctx.lineTo(a.points[i].x * w, a.points[i].y * h);
        }
        ctx.stroke();
        break;
      }
      case 'text': {
        const pos = { x: a.position.x * w, y: a.position.y * h };
        const fontSize = Math.max(14, a.lineWidth * 5);
        ctx.font = `bold ${fontSize}px Arial`;
        ctx.fillText(a.text, pos.x, pos.y);
        break;
      }
    }
  }

  _drawArrowHead(ctx, fromX, fromY, toX, toY) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const headLen = Math.max(10, ctx.lineWidth * 4);
    const headAngle = Math.PI / 7;

    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(toX, toY);
    ctx.lineTo(
      toX - headLen * Math.cos(angle - headAngle),
      toY - headLen * Math.sin(angle - headAngle)
    );
    ctx.lineTo(
      toX - headLen * Math.cos(angle + headAngle),
      toY - headLen * Math.sin(angle + headAngle)
    );
    ctx.closePath();
    ctx.fill();
  }

  // Ramer-Douglas-Peucker simplification
  _simplifyPoints(points, epsilon) {
    if (points.length <= 2) return points;

    let maxDist = 0;
    let maxIdx = 0;
    const start = points[0];
    const end = points[points.length - 1];

    for (let i = 1; i < points.length - 1; i++) {
      const d = this._perpendicularDist(points[i], start, end);
      if (d > maxDist) {
        maxDist = d;
        maxIdx = i;
      }
    }

    if (maxDist > epsilon) {
      const left = this._simplifyPoints(points.slice(0, maxIdx + 1), epsilon);
      const right = this._simplifyPoints(points.slice(maxIdx), epsilon);
      return left.slice(0, -1).concat(right);
    }
    return [start, end];
  }

  _perpendicularDist(point, lineStart, lineEnd) {
    const dx = lineEnd.x - lineStart.x;
    const dy = lineEnd.y - lineStart.y;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.sqrt((point.x - lineStart.x) ** 2 + (point.y - lineStart.y) ** 2);
    const t = Math.max(0, Math.min(1, ((point.x - lineStart.x) * dx + (point.y - lineStart.y) * dy) / lenSq));
    const projX = lineStart.x + t * dx;
    const projY = lineStart.y + t * dy;
    return Math.sqrt((point.x - projX) ** 2 + (point.y - projY) ** 2);
  }

  // Event system
  on(event, callback) {
    if (!this._listeners) this._listeners = {};
    if (!this._listeners[event]) this._listeners[event] = [];
    this._listeners[event].push(callback);
  }

  _emit(event, data) {
    if (!this._listeners) return;
    (this._listeners[event] || []).forEach(cb => cb(data));
  }
}
