const DEFAULT_TOAST_MS = 4500;
let nextOverlayId = 1;

const connectedElement = value => value && typeof value.focus === 'function' && value.isConnected;

export class NativeOverlayService {
  constructor({ now = () => Date.now(), setTimer = (fn, ms) => globalThis.setTimeout(fn, ms), clearTimer = id => globalThis.clearTimeout(id) } = {}) {
    this._now = now;
    this._setTimer = setTimer;
    this._clearTimer = clearTimer;
    this._listeners = new Set();
    this._overlays = [];
    this._toasts = [];
    this._toastTimers = new Map();
  }

  snapshot() {
    return { overlays: [...this._overlays], toasts: [...this._toasts] };
  }

  subscribe(listener) {
    this._listeners.add(listener);
    listener(this.snapshot());
    return () => this._listeners.delete(listener);
  }

  get subscriberCount() { return this._listeners.size; }

  dialog(options = {}) { return this._open('dialog', options); }
  sheet(options = {}) { return this._open('sheet', options); }

  _open(type, options) {
    const top = this._overlays.at(-1);
    if (type === 'dialog' && top?.type === 'dialog') {
      const allowed = options.destructive === true && options.parentId === top.id;
      if (!allowed) throw new Error('A dialog may only stack for a destructive confirmation of the active dialog.');
    }

    const id = options.id || `gi-overlay-${nextOverlayId++}`;
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    const requestedActions = options.actions?.length
      ? options.actions
      : type === 'dialog' ? [{ key: 'ok', label: 'OK', default: true }] : [];
    const actions = requestedActions.map((action, index) => ({
      key: action.key || `action-${index + 1}`,
      label: action.label || action.key || `Action ${index + 1}`,
      tone: action.tone || 'neutral',
      default: action.default === true,
      onSelect: action.onSelect,
    }));
    const invoker = options.returnFocus || globalThis.document?.activeElement || null;
    const fallback = connectedElement(invoker)
      ? invoker.closest?.('[data-focus-return-root], main, section, nav, header')
      : null;
    const overlay = {
      id,
      type,
      title: String(options.title || (type === 'dialog' ? 'Decision required' : 'Panel')),
      message: options.message == null ? '' : String(options.message),
      content: options.content || null,
      actions,
      destructive: options.destructive === true,
      modal: type === 'dialog' || options.modal === true,
      dismissOnEscape: options.dismissOnEscape !== false,
      dismissOnScrim: options.dismissOnScrim ?? (options.destructive !== true && options.unsaved !== true),
      initialAction: options.initialAction || (type === 'dialog' ? actions.find(action => action.default)?.key || actions[0]?.key || '' : ''),
      returnFocus: invoker,
      focusFallback: fallback,
      resolveResult,
    };
    this._overlays = [...this._overlays, overlay];
    this._emit();
    return { id, result, close: value => this.close(id, value) };
  }

  close(id, value = 'cancel') {
    const overlay = this._overlays.find(item => item.id === id);
    if (!overlay || this._overlays.at(-1)?.id !== id) return false;
    this._overlays = this._overlays.filter(item => item.id !== id);
    overlay.resolveResult(value);
    this._emit();
    this._restoreFocus(overlay);
    return true;
  }

  dismissTop(reason = 'cancel') {
    const overlay = this._overlays.at(-1);
    if (!overlay || !overlay.dismissOnEscape) return false;
    return this.close(overlay.id, reason);
  }

  toast(options = {}) {
    const config = typeof options === 'string' ? { message: options } : options;
    const id = config.id || `gi-toast-${nextOverlayId++}`;
    const createdAt = this._now();
    const duration = Math.max(DEFAULT_TOAST_MS, Number(config.duration) || DEFAULT_TOAST_MS);
    const toast = {
      id,
      message: String(config.message || ''),
      tone: config.tone || 'info',
      action: config.action || null,
      createdAt,
      expiresAt: createdAt + duration,
    };
    this._toasts = [...this._toasts.filter(item => item.id !== id), toast];
    this._emit();
    this._clearToastTimer(id);
    this._toastTimers.set(id, this._setTimer(() => this.dismissToast(id), duration));
    return id;
  }

  dismissToast(id) {
    if (!this._toasts.some(item => item.id === id)) return false;
    this._toasts = this._toasts.filter(item => item.id !== id);
    this._clearToastTimer(id);
    this._emit();
    return true;
  }

  destroy() {
    for (const overlay of this._overlays) overlay.resolveResult('destroyed');
    for (const id of this._toastTimers.keys()) this._clearToastTimer(id);
    this._overlays = [];
    this._toasts = [];
    this._emit();
    this._listeners.clear();
  }

  _clearToastTimer(id) {
    const timer = this._toastTimers.get(id);
    if (timer != null) this._clearTimer(timer);
    this._toastTimers.delete(id);
  }

  _emit() {
    const snapshot = this.snapshot();
    for (const listener of this._listeners) listener(snapshot);
  }

  _restoreFocus(overlay) {
    // Preact restores route inertness in an effect cleanup after the close render.
    // A second frame prevents focus from targeting a control while its route is
    // still inert, which browsers correctly reject.
    globalThis.requestAnimationFrame?.(() => globalThis.requestAnimationFrame?.(() => {
      const stable = [...(globalThis.document?.querySelectorAll('[data-focus-return-root], main, nav, header, #workspaceShell') || [])]
        .find(element => connectedElement(element) && !element.closest('[inert]') && element.getClientRects().length);
      const target = connectedElement(overlay.returnFocus)
        ? overlay.returnFocus
        : connectedElement(overlay.focusFallback) ? overlay.focusFallback : stable;
      if (!target) return;
      if (!target.matches?.('button, a, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
      target.focus({ preventScroll: true });
    }));
  }
}

export { DEFAULT_TOAST_MS };
