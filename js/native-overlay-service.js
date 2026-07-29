const DEFAULT_TOAST_MS = 4500;

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
    this._focusRestoreToken = 0;
    this._nextOverlayId = 1;
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
  popover(options = {}) {
    if (!connectedElement(options.anchor)) throw new Error('A popover requires a connected anchor element.');
    return this._open('popover', options);
  }

  _open(type, options) {
    // A newly opened decision owns focus; cancel any stale close restoration.
    this._focusRestoreToken++;
    const top = this._overlays.at(-1);
    if (type === 'popover' && top?.type === 'popover') {
      // Replace in one emission. Calling close() here would schedule focus return
      // from the old menu and race the new menu's initial focus.
      this._overlays = this._overlays.slice(0, -1);
      top.resolveResult('replaced');
    }
    if (type === 'dialog' && top?.type === 'dialog') {
      const allowed = options.destructive === true && options.parentId === top.id;
      if (!allowed) throw new Error('A dialog may only stack for a destructive confirmation of the active dialog.');
    }

    const id = options.id || `gi-overlay-${this._nextOverlayId++}`;
    let resolveResult;
    const result = new Promise(resolve => { resolveResult = resolve; });
    const requestedActions = Array.isArray(options.actions)
      ? options.actions
      : type === 'dialog' ? [{ key: 'ok', label: 'OK', default: true }] : [];
    const actions = requestedActions.map((action, index) => ({
      key: action.key || `action-${index + 1}`,
      label: action.label || action.key || `Action ${index + 1}`,
      tone: action.tone || 'neutral',
      default: action.default === true,
      onSelect: action.onSelect,
    }));
    const items = (Array.isArray(options.items) ? options.items : []).map((item, index) => ({
      key: item.key || `item-${index + 1}`,
      label: String(item.label || item.key || `Item ${index + 1}`),
      detail: item.detail == null ? '' : String(item.detail),
      tone: item.tone || 'neutral',
      disabled: item.disabled === true,
      separator: item.separator === true,
      onSelect: item.onSelect,
    }));
    if (type === 'popover' && !items.length) throw new Error('A popover requires at least one menu item.');
    if (options.destructive === true) {
      const cancel = actions.find(action => action.key === 'cancel');
      if (!cancel) throw new Error('A destructive overlay requires an explicit Cancel action.');
      for (const action of actions) action.default = action === cancel;
    }
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
      items,
      anchor: type === 'popover' ? options.anchor : null,
      placement: options.placement || 'bottom-end',
      destructive: options.destructive === true,
      modal: type === 'dialog' || options.modal === true,
      dismissOnEscape: options.dismissOnEscape !== false,
      dismissOnScrim: options.dismissOnScrim ?? (options.destructive !== true && options.unsaved !== true),
      initialAction: options.destructive === true
        ? 'cancel'
        : options.initialAction || (type === 'dialog' ? actions.find(action => action.default)?.key || actions[0]?.key || '' : ''),
      initialFocus: typeof options.initialFocus === 'string' ? options.initialFocus : '',
      returnFocus: invoker,
      focusFallback: fallback,
      resolveResult,
    };
    this._overlays = [...this._overlays, overlay];
    this._emit();
    return { id, result, close: value => this.close(id, value) };
  }

  close(id, value = 'cancel') {
    const index = this._overlays.findIndex(item => item.id === id);
    if (index < 0) return false;
    const closing = this._overlays.slice(index);
    const overlay = closing[0];
    this._overlays = this._overlays.slice(0, index);
    // A route may close its parent sheet while a confirmation is stacked over it.
    // Settle the entire suffix so no buried handle can leave an await pending.
    for (let i = closing.length - 1; i >= 0; i--) {
      closing[i].resolveResult(i === 0 ? value : 'parent-closed');
    }
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
    const id = config.id || `gi-toast-${this._nextOverlayId++}`;
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
    // Scheduled requestAnimationFrame retries must not outlive this service.
    this._focusRestoreToken++;
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
    const token = ++this._focusRestoreToken;
    // Native key listeners and Preact event handlers commit on different
    // schedules. Restore only after the chosen target is connected, visible,
    // and no longer inert; a fixed frame count races Preact's cleanup.
    let attempts = 0;
    const restore = () => {
      if (token !== this._focusRestoreToken) return;
      const active = globalThis.document?.activeElement;
      const activeOverlay = connectedElement(active) ? active.closest?.('[data-overlay-id]') : null;
      // Closing is asynchronous relative to Preact. If focus has already landed
      // on a live control outside the closing overlay, that is a newer user or
      // workflow decision and must win. Otherwise a delayed restore can steal
      // focus back after the coach has already moved on.
      if (connectedElement(active) && active !== globalThis.document?.body
          && active !== overlay.returnFocus && activeOverlay?.dataset?.overlayId !== overlay.id) return;
      const stable = [...(globalThis.document?.querySelectorAll('[data-focus-return-root], main, nav, header') || [])]
        .find(element => connectedElement(element) && !element.closest('[inert]') && element.getClientRects().length);
      const preferred = connectedElement(overlay.returnFocus)
        ? overlay.returnFocus
        : connectedElement(overlay.focusFallback) ? overlay.focusFallback : null;
      // Prefer the exact invoker while Preact settles. On the final attempt,
      // use a stable route landmark instead of silently abandoning focus.
      const preferredReady = preferred
        && !preferred.closest?.('[inert]')
        && preferred.getClientRects().length;
      const target = preferredReady ? preferred : (attempts >= 8 ? stable : null);
      if (target && !target.closest?.('[inert]') && target.getClientRects().length) {
        if (!target.matches?.('button, a, input, select, textarea, [tabindex]')) target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
        return;
      }
      if (attempts++ < 8) globalThis.requestAnimationFrame?.(restore);
    };
    globalThis.requestAnimationFrame?.(restore);
  }
}

export { DEFAULT_TOAST_MS };
