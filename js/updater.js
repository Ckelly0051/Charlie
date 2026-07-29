/**
 * updater.js — In-app auto-update for the Tauri desktop build.
 *
 * Web build: this is a no-op. There's nothing to update — the GitHub Pages
 * URL always serves the latest, so `init()` returns early when not running
 * under Tauri (`window.__TAURI__` absent).
 *
 * Desktop build: on launch (and on demand via `check(true)`) it asks the
 * GitHub Releases `latest.json` endpoint whether a newer signed build exists.
 * If so, it shows a non-blocking banner — "What's new / Update & Restart /
 * Later". "Update & Restart" downloads + installs the signed update and
 * relaunches. Signature verification (pubkey in tauri.conf.json) is enforced
 * by the plugin, so a tampered update is refused.
 *
 * APIs are reached through `window.__TAURI__` because the app runs with
 * `withGlobalTauri: true` (no ES-module imports in the single-file bundle):
 *   - window.__TAURI__.updater.check()  -> Update | null
 *   - update.downloadAndInstall(onEvent)
 *   - window.__TAURI__.process.relaunch()
 */
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
    wrap.innerHTML = `
      <div class="gi-update-card">
        <div class="gi-update-head">
          <span class="gi-update-dot"></span>
          <strong>Update available</strong>
          <span class="gi-update-ver">v${ver}</span>
        </div>
        ${notes ? `<div class="gi-update-notes"></div>` : ''}
        <div class="gi-update-progress" hidden><div class="gi-update-bar"></div></div>
        <div class="gi-update-actions">
          <button class="gi-update-later" type="button">Later</button>
          <button class="gi-update-go" type="button">Update &amp; Restart</button>
        </div>
      </div>`;
    if (notes) wrap.querySelector('.gi-update-notes').textContent = notes;

    this._injectStyle();
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
    if (this._banner && this._banner.parentNode) this._banner.parentNode.removeChild(this._banner);
    this._banner = null;
  }

  _toast(msg) {
    return this.overlays?.toast({ message: String(msg || '').toUpperCase() });
  }

  // Styles live in css/styles.css (.gi-update-*). They must NOT be injected
  // at runtime: Tauri nonces the page's <style>, which disables
  // 'unsafe-inline', so a JS-inserted <style> is CSP-blocked and the banner
  // / toast would render unstyled (invisible). No-op kept for call sites.
  _injectStyle() {}
}
