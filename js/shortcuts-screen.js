import { h } from 'preact';
import { NativeShortcuts } from './native-shortcuts.jsx';

export class ShortcutsScreen {
  constructor(overlays) {
    this.overlays = overlays;
    this.handle = null;
  }
  isOpen() { return !!this.handle; }
  open(returnFocus = null) {
    if (this.handle) return this.handle.result;
    const handle = this.overlays.dialog({
      id: 'keyboard-shortcuts',
      title: 'Keyboard Shortcuts',
      returnFocus,
      content: h(NativeShortcuts),
      actions: [{ key: 'done', label: 'Done', tone: 'primary', default: true }],
    });
    this.handle = handle;
    return handle.result.finally(() => { if (this.handle === handle) this.handle = null; });
  }
  close(value = 'cancel') {
    const handle = this.handle;
    if (!handle) return false;
    this.handle = null;
    return handle.close(value);
  }
  toggle(returnFocus = null) { return this.handle ? this.close('toggle') : this.open(returnFocus); }
}