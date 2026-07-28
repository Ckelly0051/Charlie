import { render } from 'preact';
import { useEffect, useRef, useState } from 'preact/hooks';
import { NativeOverlayService } from './native-overlay-service.js';
import '../design-system/plex.css';
import '../design-system/tokens.css';
import '../css/native-overlay.css';

const focusableSelector = 'button:not([disabled]), a[href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function useOverlayState(service) {
  const [state, setState] = useState(() => service.snapshot());
  useEffect(() => service.subscribe(setState), [service]);
  return state;
}

function useNarrow() {
  const [narrow, setNarrow] = useState(() => matchMedia('(max-width: 700px)').matches);
  useEffect(() => {
    const query = matchMedia('(max-width: 700px)');
    const update = () => setNarrow(query.matches);
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);
  return narrow;
}

function OverlayPanel({ overlay, service, top, effectiveModal }) {
  const panelRef = useRef(null);
  useEffect(() => {
    if (!top) return;
    const frame = requestAnimationFrame(() => {
      const panel = panelRef.current;
      const requested = overlay.initialAction
        ? panel?.querySelector(`[data-overlay-action="${CSS.escape(overlay.initialAction)}"]`)
        : null;
      const first = overlay.type === 'sheet'
        ? panel?.querySelector(`.gi-overlay-body ${focusableSelector}, .gi-overlay-actions ${focusableSelector}`)
        : panel?.querySelector(focusableSelector);
      (requested || first || panel)?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  // A buried panel is restored by NativeOverlayService to the exact child
  // invoker. Re-running initial focus when top flips creates a second owner.
  }, [overlay.id, overlay.initialAction]);

  const choose = async action => {
    if (action.onSelect) {
      const shouldClose = await action.onSelect();
      if (shouldClose === false) return;
    }
    service.close(overlay.id, action.key);
  };

  const scrim = effectiveModal
    ? <div class="gi-overlay-scrim" data-overlay-scrim onMouseDown={event => {
        if (event.target === event.currentTarget && overlay.dismissOnScrim) service.close(overlay.id, 'cancel');
      }} />
    : null;
  const classes = `gi-overlay-layer gi-overlay-${overlay.type}${effectiveModal ? ' is-modal' : ''}${top ? ' is-top' : ''}`;
  return <div class={classes} data-overlay-id={overlay.id} inert={!top || undefined} aria-hidden={!top || undefined}>
    {scrim}
    <section
      ref={panelRef}
      class={`gi-overlay-panel${overlay.destructive ? ' is-destructive' : ''}`}
      role="dialog"
      aria-modal={effectiveModal ? 'true' : undefined}
      aria-labelledby={`${overlay.id}-title`}
    >
      <header class="gi-overlay-head">
        <div><span>{overlay.type === 'sheet' ? 'Workspace panel' : 'GridIron IQ'}</span><h2 id={`${overlay.id}-title`}>{overlay.title}</h2></div>
        {overlay.type === 'sheet' && <button class="gi-overlay-close" aria-label={`Close ${overlay.title}`} onClick={() => service.close(overlay.id, 'cancel')}>×</button>}
      </header>
      <div class="gi-overlay-body">
        {overlay.message && <p>{overlay.message}</p>}
        {overlay.content}
      </div>
      {overlay.actions.length > 0 && <footer class="gi-overlay-actions">
        {overlay.actions.map(action => <button
          key={action.key}
          type="button"
          class={`gi-overlay-action is-${action.tone}`}
          data-overlay-action={action.key}
          onClick={() => choose(action)}
        >{action.label}</button>)}
      </footer>}
    </section>
  </div>;
}

function ToastStack({ service, toasts }) {
  const [, tick] = useState(0);
  useEffect(() => {
    if (!toasts.some(toast => toast.action)) return undefined;
    const timer = setInterval(() => tick(value => value + 1), 1000);
    return () => clearInterval(timer);
  }, [toasts]);
  return <div class="gi-toast-stack" aria-label="Notifications">
    {toasts.map(toast => {
      const seconds = Math.max(0, Math.ceil((toast.expiresAt - Date.now()) / 1000));
      const failure = toast.tone === 'error';
      return <div
        key={toast.id}
        class={`gi-native-toast is-${toast.tone}`}
        role={failure ? 'alert' : 'status'}
        aria-live={failure ? 'assertive' : 'polite'}
        data-toast-id={toast.id}
        data-created-at={toast.createdAt}
        data-expires-at={toast.expiresAt}
        onClick={event => { if (!event.target.closest('button')) service.dismissToast(toast.id); }}
      >
        <span>{toast.message}</span>
        {toast.action && <button type="button" onClick={() => { toast.action.fn?.(); service.dismissToast(toast.id); }}>{String(toast.action.label)} · {seconds}s</button>}
      </div>;
    })}
  </div>;
}

function NativeOverlayHost({ service }) {
  const state = useOverlayState(service);
  const narrow = useNarrow();
  const top = state.overlays.at(-1);
  const isModal = overlay => overlay.type === 'dialog' || overlay.modal || (overlay.type === 'sheet' && narrow);

  useEffect(() => {
    if (!state.overlays.some(isModal)) return undefined;
    const root = document.getElementById('giNativeRoot');
    const routes = root?.querySelector('.gi-native-routes');
    const prior = new Map();
    const makeInert = element => {
      if (!element || element === root || prior.has(element)) return;
      prior.set(element, { inert: element.inert, ariaHidden: element.getAttribute('aria-hidden') });
      element.inert = true;
      element.setAttribute('aria-hidden', 'true');
    };
    [...document.body.children].forEach(makeInert);
    makeInert(routes);
    // Legacy code can append dialogs and menus directly to body after a native
    // modal opens. Observe the host boundary so late siblings are inert too.
    const observer = new MutationObserver(records => {
      for (const record of records) {
        for (const node of record.addedNodes) if (node.nodeType === Node.ELEMENT_NODE) makeInert(node);
      }
    });
    observer.observe(document.body, { childList: true });
    return () => {
      observer.disconnect();
      for (const [element, item] of prior) {
        element.inert = item.inert;
        if (item.ariaHidden == null) element.removeAttribute('aria-hidden');
        else element.setAttribute('aria-hidden', item.ariaHidden);
      }
    };
  }, [state.overlays, narrow]);

  useEffect(() => {
    if (!state.overlays.length) return undefined;
    const onKeyDown = event => {
      const current = service.snapshot().overlays.at(-1);
      if (!current) return;
      if (event.key === 'Escape') {
        // The host owns Escape whenever an overlay is open, even when that
        // overlay refuses dismissal. Nothing underneath may also react.
        event.preventDefault(); event.stopImmediatePropagation();
        if (current.dismissOnEscape) service.close(current.id, 'cancel');
        return;
      }
      if (event.key !== 'Tab' || !isModal(current)) return;
      const panel = document.querySelector(`[data-overlay-id="${CSS.escape(current.id)}"] .gi-overlay-panel`);
      const controls = [...(panel?.querySelectorAll(focusableSelector) || [])].filter(element => element.getClientRects().length);
      if (!controls.length) return;
      const first = controls[0], last = controls.at(-1);
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener('keydown', onKeyDown, true);
    return () => document.removeEventListener('keydown', onKeyDown, true);
  }, [service, state.overlays.length, narrow]);

  return <>
    <div class="gi-overlay-stack" data-overlay-count={state.overlays.length}>
      {state.overlays.map(overlay => <OverlayPanel
        key={overlay.id}
        overlay={overlay}
        service={service}
        top={overlay === top}
        effectiveModal={isModal(overlay)}
      />)}
    </div>
    <ToastStack service={service} toasts={state.toasts} />
  </>;
}

function OverlayProbeRoute({ overlays }) {
  const [outcome, setOutcome] = useState('No action yet');
  const openDialog = () => overlays.dialog({
    title: 'Review this decision',
    message: 'This test decision never writes season data.',
    actions: [
      { key: 'cancel', label: 'Keep working', default: true },
      { key: 'continue', label: 'Continue', tone: 'primary' },
    ],
  }).result.then(setOutcome);
  const openSheet = () => overlays.sheet({
    title: 'Test settings',
    modal: false,
    content: <label class="gi-probe-field">Practice note<input aria-label="Practice note" defaultValue="Inside zone" /></label>,
    actions: [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
  }).result.then(setOutcome);
  const openStack = () => overlays.sheet({
    title: 'Film settings',
    modal: true,
    content: <button type="button" data-probe-open-confirm onClick={() => overlays.dialog({
      title: 'Discard folder change?',
      message: 'The parent sheet remains open.',
      destructive: true,
      parentId: overlays.snapshot().overlays.at(-1)?.id,
      actions: [
        { key: 'cancel', label: 'Keep editing', default: true },
        { key: 'discard', label: 'Discard', tone: 'destructive' },
      ],
    })}>Open confirmation</button>,
    actions: [{ key: 'done', label: 'Done', tone: 'primary' }],
  }).result.then(setOutcome);
  return <aside class="gi-overlay-probe" data-focus-return-root>
    <strong>P0 Overlay Journey</strong>
    <button type="button" data-probe-dialog onClick={openDialog}>Open dialog</button>
    <button type="button" data-probe-sheet onClick={openSheet}>Open sheet</button>
    <button type="button" data-probe-stack onClick={openStack}>Open stacked decision</button>
    <button type="button" data-probe-toast onClick={() => overlays.toast({ message: 'Test save complete', action: { label: 'Undo', fn: () => setOutcome('undo') } })}>Show toast</button>
    <output data-probe-outcome>{outcome}</output>
  </aside>;
}

function NativeRoot({ overlays, testRoute }) {
  return <div class="gi-native-root">
    <div class="gi-native-routes">{testRoute && <OverlayProbeRoute overlays={overlays} />}</div>
    <NativeOverlayHost service={overlays} />
  </div>;
}

export function mountNativeApp({ host, overlays, testRoute = false }) {
  if (!host) throw new Error('Native app mount requires a host element.');
  if (!overlays?.subscribe || !overlays?.snapshot) throw new Error('Native app mount requires an injected overlay service.');
  render(<NativeRoot overlays={overlays} testRoute={testRoute} />, host);
  let mounted = true;
  return {
    unmount() {
      if (!mounted) return;
      render(null, host);
      mounted = false;
    },
  };
}

let activeOverlayService = null;
export function getNativeOverlayService() { return activeOverlayService; }

const host = document.getElementById('giNativeRoot');
if (host) {
  const testRoute = new URLSearchParams(location.search).get('giq_test_route') === 'overlay';
  let service = new NativeOverlayService();
  activeOverlayService = service;
  let mounted = mountNativeApp({ host, overlays: service, testRoute });
  if (testRoute) {
    globalThis.__GIQ_NATIVE_TEST__ = {
      get service() { return service; },
      createService: () => new NativeOverlayService(),
      mount(nextService) {
        mounted.unmount();
        service = nextService;
        activeOverlayService = service;
        mounted = mountNativeApp({ host, overlays: service, testRoute: true });
      },
      unmount() { mounted.unmount(); },
    };
  }
}
