import { useEffect, useLayoutEffect, useRef } from 'preact/hooks';

export function NativePopover({ overlay, service, top }) {
  const panelRef = useRef(null);

  useLayoutEffect(() => {
    if (!top) return undefined;
    const panel = panelRef.current;
    const anchor = overlay.anchor;
    if (!panel || !anchor?.isConnected) {
      service.close(overlay.id, 'anchor-lost');
      return undefined;
    }
    const place = () => {
      if (!anchor.isConnected) { service.close(overlay.id, 'anchor-lost'); return; }
      const gap = 6;
      const margin = 8;
      const anchorRect = anchor.getBoundingClientRect();
      const panelRect = panel.getBoundingClientRect();
      const preferAbove = overlay.placement.startsWith('top');
      let topPx = preferAbove ? anchorRect.top - panelRect.height - gap : anchorRect.bottom + gap;
      if (!preferAbove && topPx + panelRect.height > window.innerHeight - margin && anchorRect.top - panelRect.height - gap >= margin) {
        topPx = anchorRect.top - panelRect.height - gap;
      }
      if (preferAbove && topPx < margin && anchorRect.bottom + gap + panelRect.height <= window.innerHeight - margin) {
        topPx = anchorRect.bottom + gap;
      }
      let leftPx = overlay.placement.endsWith('start') ? anchorRect.left : anchorRect.right - panelRect.width;
      leftPx = Math.max(margin, Math.min(leftPx, window.innerWidth - panelRect.width - margin));
      topPx = Math.max(margin, Math.min(topPx, window.innerHeight - panelRect.height - margin));
      panel.style.left = `${Math.round(leftPx)}px`;
      panel.style.top = `${Math.round(topPx)}px`;
      panel.style.visibility = 'visible';
    };
    place();
    const observer = new ResizeObserver(place);
    observer.observe(panel);
    observer.observe(anchor);
    window.addEventListener('resize', place);
    window.addEventListener('scroll', place, true);
    const frame = requestAnimationFrame(() => panel.querySelector('[role="menuitem"]:not([disabled]), button:not([disabled]), input:not([disabled]), select:not([disabled])')?.focus({ preventScroll: true }));
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('resize', place);
      window.removeEventListener('scroll', place, true);
    };
  }, [overlay.id, overlay.anchor, overlay.placement, service, top]);

  useEffect(() => {
    if (!top) return undefined;
    const onPointerDown = event => {
      const panel = panelRef.current;
      if (!panel?.contains(event.target) && !overlay.anchor?.contains(event.target)) service.close(overlay.id, 'outside');
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    return () => document.removeEventListener('pointerdown', onPointerDown, true);
  }, [overlay.id, overlay.anchor, service, top]);

  const choose = item => {
    if (item.disabled) return;
    service.close(overlay.id, item.key);
    try {
      Promise.resolve(item.onSelect?.()).catch(error => {
        console.error(`Popover action failed: ${item.key}`, error);
        service.toast({ message: `${item.label} failed. Try again.`, tone: 'error' });
      });
    } catch (error) {
      console.error(`Popover action failed: ${item.key}`, error);
      service.toast({ message: `${item.label} failed. Try again.`, tone: 'error' });
    }
  };
  const move = (event, delta) => {
    const items = [...panelRef.current.querySelectorAll('[role="menuitem"]:not([disabled])')];
    if (!items.length) return;
    const current = items.indexOf(document.activeElement);
    const next = delta === 'first' ? 0 : delta === 'last' ? items.length - 1 : (current + delta + items.length) % items.length;
    event.preventDefault();
    items[next].focus();
  };

  return <div
    class="gi-overlay-layer gi-overlay-popover is-top"
    data-overlay-id={overlay.id}
    inert={!top || undefined}
    aria-hidden={!top || undefined}
  >
    <section
      ref={panelRef}
      class="gi-popover-panel"
      role={overlay.content ? 'dialog' : 'menu'}
      aria-label={overlay.title}
      onKeyDown={event => {
        if (event.key === 'ArrowDown') move(event, 1);
        else if (event.key === 'ArrowUp') move(event, -1);
        else if (event.key === 'Home') move(event, 'first');
        else if (event.key === 'End') move(event, 'last');
      }}
    >
      {overlay.content}
      {overlay.items.map(item => item.heading
        ? <p
            key={item.key}
            class={`gi-popover-heading${item.separator ? ' has-separator' : ''}`}
            role="presentation"
            data-popover-heading={item.key}
          >{item.label}</p>
        : <button
        key={item.key}
        type="button"
        role="menuitem"
        disabled={item.disabled}
        aria-current={item.selected ? 'true' : undefined}
        class={`gi-popover-item is-${item.tone}${item.separator ? ' has-separator' : ''}${item.selected ? ' is-selected' : ''}`}
        data-popover-item={item.key}
        onClick={() => choose(item)}
      ><span>{item.label}</span>{item.detail && <small>{item.detail}</small>}</button>)}
    </section>
  </div>;
}