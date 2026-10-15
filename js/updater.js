/* Signed Tauri update checks, download/install and relaunch; browser builds are no-op.
 * The updater plugin verifies signatures with the configured public key. */
import { h, render } from 'preact';

export class Updater {
  constructor(overlays = null) {
    this.overlays = overlays;
    this.tauri = (typeof window !== 'undefined') ? window.__TAURI__ : null;
    this.available = !!(this.tauri && this.tauri.updater);
    this._busy = false;
    this._banner = null;
  }

  /** Schedule a silent check shortly after launch (desktop only). */
  init() {
    if (!this.available) return;
    // Defer so it never competes with first paint / season load.
    setTimeout(() => { this.check(false); }, 4000);
  }

  /** Best-effort current app version (Tauri only); '' if unavailable. */
  async _currentVersion() {
    try {
      if (this.tauri && this.tauri.app && this.tauri.app.getVersion) {
        return await this.tauri.app.getVersion();
      }
    } catch (_) { /* ignore */ }
    return '';
  }

  /**
   * Check for an update.
   * @param {boolean} manual  true when the user explicitly asked — surfaces an
   *                          "checking" / "up to date" / error toast; false
   *                          stays silent.
   */
  async check(manual = false) {
    if (!this.available || this._busy) return;
    if (manual) this._toast('Checking for updates…');
    let update = null;
    try {
      update = await this.tauri.updater.check();
    } catch (e) {
      console.warn('[updater] check failed', e);
      if (manual) this._toast('Could not check for updates. Try again later.');
      return;
    }
    if (update && update.available) {
      this._showBanner(update);
    } else if (manual) {
      const v = await this._currentVersion();
      this._toast(v ? `You're on the latest version (v${v}).` : "You're on the latest version.");
    }
  }

  _showBanner(update) {
    this._dismiss();
    const ver = update.version || '';
    const notes = (update.body || '').trim();

    const wrap = document.createElement('div');
    wrap.className = 'gi-update-banner';
    render(h('div', { class: 'gi-update-card' },
      h('div', { class: 'gi-update-head' },
        h('span', { class: 'gi-update-dot' }), h('strong', null, 'Update available'),
        h('span', { class: 'gi-update-ver' }, `v${ver}`)),
      notes && h('div', { class: 'gi-update-notes' }, notes),
      h('div', { class: 'gi-update-progress', hidden: true }, h('div', { class: 'gi-update-bar' })),
      h('div', { class: 'gi-update-actions' },
        h('button', { class: 'gi-update-later', type: 'button' }, 'Later'),
        h('button', { class: 'gi-update-go', type: 'button' }, 'Update & Restart'))), wrap);
    document.body.appendChild(wrap);
    this._banner = wrap;

    wrap.querySelector('.gi-update-later').addEventListener('click', () => this._dismiss());
    wrap.querySelector('.gi-update-go').addEventListener('click', () => this._install(update, wrap));
  }

  async _install(update, wrap) {
    if (this._busy) return;
    this._busy = true;
    const goBtn = wrap.querySelector('.gi-update-go');
    const laterBtn = wrap.querySelector('.gi-update-later');
    const prog = wrap.querySelector('.gi-update-progress');
    const bar = wrap.querySelector('.gi-update-bar');
    goBtn.disabled = true; laterBtn.disabled = true;
    goBtn.textContent = 'Downloading…';
    prog.hidden = false;

    let total = 0, got = 0;
    try {
      await update.downloadAndInstall((ev) => {
        switch (ev.event) {
          case 'Started':
            total = (ev.data && ev.data.contentLength) || 0;
            break;
          case 'Progress':
            got += (ev.data && ev.data.chunkLength) || 0;
            if (total > 0) bar.style.width = Math.min(100, (got / total) * 100) + '%';
            break;
          case 'Finished':
            bar.style.width = '100%';
            goBtn.textContent = 'Restarting…';
            break;
        }
      });
      // Relaunch into the new version.
      if (this.tauri.process && this.tauri.process.relaunch) {
        await this.tauri.process.relaunch();
      }
    } catch (e) {
      console.error('[updater] install failed', e);
      this._busy = false;
      goBtn.disabled = false; laterBtn.disabled = false;
      goBtn.textContent = 'Update & Restart';
      prog.hidden = true;
      this._toast('Update failed to install. Please try again.');
    }
  }

  _dismiss() {
    if (this._banner) { render(null, this._banner); this._banner.remove(); }
    this._banner = null;
  }

  _toast(msg) {
    return this.overlays?.toast({ message: String(msg || '') });
  }

}
