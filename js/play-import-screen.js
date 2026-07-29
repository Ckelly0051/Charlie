import { h } from 'preact';
import { NativePlayImport } from './native-play-import.jsx';

export class PlayImportScreen {
  constructor(app, overlays) {
    this.app = app;
    this.overlays = overlays;
    this.handle = null;
  }

  open({ returnFocus = null } = {}) {
    if (this.handle) return this.handle.result;
    const handle = this.overlays.sheet({
      id: 'play-import',
      title: 'Import Plays',
      modal: false,
      returnFocus,
      content: h(NativePlayImport, { screen: this }),
      actions: [],
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

  parse(text) { return this.app.storage.importPlaysFromText(text); }

  apply(parsed) {
    const count = this.app.storage.applyPlayImport(parsed);
    if (count > 0) {
      this.overlays.toast({ message: `Imported ${count} play${count === 1 ? '' : 's'}.`, tone: 'success' });
      this.close('imported');
    }
    return count;
  }
}