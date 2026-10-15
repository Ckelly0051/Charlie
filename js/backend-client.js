/* Client for the optional loopback CV server; failed availability falls back
 * to the caller's browser analyzer. The configured URL is stored in ffa_backend_url. */
export class BackendClient {
  constructor(opts = {}) {
    this.baseUrl = opts.baseUrl
      || (typeof localStorage !== 'undefined' && localStorage.getItem('ffa_backend_url'))
      || 'http://127.0.0.1:8765';
    this.available = false;
    this.info = null;
    this.lastProbeTime = 0;
    this.probeTimeoutMs = opts.probeTimeoutMs || 1500;
    this._listeners = new Map();
    // The optional local CV server is off by default; Settings owns opt-in.

    this.enabled = (typeof localStorage !== 'undefined'
      && localStorage.getItem('ffa_backend_enabled') === '1');
  }

  /** Turn the local-server integration on/off and remember the choice. */
  setEnabled(on) {
    this.enabled = !!on;
    try {
      if (typeof localStorage !== 'undefined') {
        localStorage.setItem('ffa_backend_enabled', on ? '1' : '0');
      }
    } catch {}
  }

  on(event, fn) {
    if (!this._listeners.has(event)) this._listeners.set(event, new Set());
    this._listeners.get(event).add(fn);
  }
  _emit(event, payload) {
    const set = this._listeners.get(event);
    if (set) for (const fn of set) { try { fn(payload); } catch {} }
  }

  /**
   * Probe /health with a short timeout. Returns true if reachable and
   * updates this.available + this.info. Safe to call repeatedly.
   */
  async probe() {
    // Skip the network call entirely when the integration is disabled, so a
    // default session never hits an unreachable port (no console errors).
    if (!this.enabled) {
      const wasAvailable = this.available;
      this.available = false;
      this.info = null;
      if (wasAvailable) this._emit('availability-changed', false);
      return false;
    }
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.probeTimeoutMs);
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        signal: controller.signal,
        cache: 'no-store',
      });
      clearTimeout(timer);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const info = await res.json();
      const wasAvailable = this.available;
      this.available = info?.status === 'ok';
      this.info = info;
      this.lastProbeTime = Date.now();
      if (this.available !== wasAvailable) this._emit('availability-changed', this.available);
      return this.available;
    } catch (e) {
      clearTimeout(timer);
      const wasAvailable = this.available;
      this.available = false;
      this.info = null;
      if (wasAvailable) this._emit('availability-changed', false);
      return false;
    }
  }

  /* Bound POST requests with a timeout and retain the controller so cancel() can abort them. */
  async _post(url, form, ms) {
    const controller = new AbortController();
    this._activeController = controller;
    const timer = setTimeout(() => controller.abort(), ms || this.requestTimeoutMs || 300000);
    try { return await fetch(url, { method: 'POST', body: form, signal: controller.signal }); }
    finally { clearTimeout(timer); this._activeController = null; }
  }

  /** Abort the in-flight analyze/detect request, if any. */
  cancel() { try { if (this._activeController) this._activeController.abort(); } catch (e) {} }

  /**
   * Analyze a single play window. `file` is a File/Blob (the video), and
   * start/end are seconds. Returns { tags, confidence, reasons, extras }
   * or throws if the server errored out.
   */
  async analyzeClip(file, start, end) {
    if (!file) throw new Error('BackendClient.analyzeClip: no file');
    const form = new FormData();
    form.append('video', file, file.name || 'clip.mp4');
    form.append('start', String(start ?? 0));
    form.append('end', String(end ?? 0));
    const res = await this._post(`${this.baseUrl}/analyze`, form);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`analyze failed: HTTP ${res.status} ${text}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  /**
   * Scan a whole video and return detected play boundaries. Shape:
   *   { plays: [{start, end, confidence, peak}, ...] }
   */
  async detectPlays(file) {
    if (!file) throw new Error('BackendClient.detectPlays: no file');
    const form = new FormData();
    form.append('video', file, file.name || 'video.mp4');
    const res = await this._post(`${this.baseUrl}/detect`, form);
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(`detect failed: HTTP ${res.status} ${text}`);
    }
    const json = await res.json();
    if (json.error) throw new Error(json.error);
    return json;
  }

  /**
   * Analyze many windows in a single video upload. `windows` is an array
   * of {start, end}. Returns an array of per-window analysis results in
   * the same order. Preferred when analyzing a batch of plays from one
   * source file — we only pay the upload cost once.
   *
   * Emits progress events so the UI can show what's happening during the
   * long-running request:
   *   'request-start'  { endpoint, bytes, windowCount }
   *   'upload-progress' { loaded, total }   (when supported)
   *   'request-done'   { endpoint, ms, ok }
   */
  async analyzeBatch(file, windows, teamCtx = {}) {
    if (!file) throw new Error('BackendClient.analyzeBatch: no file');
    if (!Array.isArray(windows)) throw new Error('windows must be an array');
    const form = new FormData();
    form.append('video', file, file.name || 'clip.mp4');
    form.append('windows', JSON.stringify(windows));
    if (teamCtx.jerseyColor) form.append('jersey_color', teamCtx.jerseyColor);
    if (teamCtx.direction) form.append('direction', teamCtx.direction);
    if (teamCtx.perspective) form.append('perspective', teamCtx.perspective);

    const meta = { endpoint: '/analyze_batch', bytes: file.size || 0, windowCount: windows.length };
    this._emit('request-start', meta);
    const t0 = performance.now();

    let res;
    try {
      res = await this._post(`${this.baseUrl}/analyze_batch`, form);
    } catch (e) {
      const ms = Math.round(performance.now() - t0);
      this._emit('request-done', { ...meta, ms, ok: false });
      console.error(`[FFA backend] analyze_batch network error after ${ms}ms:`, e);
      throw e;
    }

    if (!res.ok) {
      const text = await res.text().catch(() => '');
      const ms = Math.round(performance.now() - t0);
      this._emit('request-done', { ...meta, ms, ok: false });
      console.error(`[FFA backend] analyze_batch HTTP ${res.status} after ${ms}ms: ${text}`);
      throw new Error(`analyze_batch failed: HTTP ${res.status} ${text}`);
    }
    const json = await res.json();
    const ms = Math.round(performance.now() - t0);
    this._emit('request-done', { ...meta, ms, ok: true });
    if (json.error) throw new Error(json.error);
    return json.results || [];
  }

  /**
   * True if the last probe succeeded recently. Callers use this to
   * decide whether to try the backend at all before doing real work.
   */
  isAvailable() {
    return this.available;
  }

  /**
   * Human-readable capability list from the last /health response.
   */
  getCapabilities() {
    return this.info?.capabilities || [];
  }
}
