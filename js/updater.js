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
  constructor() {
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
    const t = document.createElement('div');
    t.className = 'gi-update-toast';
    t.textContent = msg;
    this._injectStyle();
    document.body.appendChild(t);
    setTimeout(() => { t.classList.add('gi-show'); }, 10);
    setTimeout(() => { t.classList.remove('gi-show'); setTimeout(() => t.remove(), 300); }, 3200);
  }

  _injectStyle() {
    if (document.getElementById('gi-update-style')) return;
    const s = document.createElement('style');
    s.id = 'gi-update-style';
    s.textContent = `
      .gi-update-banner { position: fixed; right: 18px; bottom: 18px; z-index: 99999;
        max-width: 360px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .gi-update-card { background: #fff; color: #0f172a; border: 1px solid #cbd5e1;
        border-radius: 12px; box-shadow: 0 16px 40px rgba(15,23,42,0.22); padding: 14px 16px; }
      .gi-update-head { display: flex; align-items: center; gap: 8px; font-size: 14px; }
      .gi-update-dot { width: 8px; height: 8px; border-radius: 50%; background: #4169e1;
        box-shadow: 0 0 0 3px rgba(65,105,225,0.18); }
      .gi-update-ver { margin-left: auto; color: #64748b; font-size: 12px; font-weight: 600; }
      .gi-update-notes { margin: 10px 0 4px; font-size: 12.5px; line-height: 1.45; color: #475569;
        max-height: 120px; overflow: auto; white-space: pre-wrap; }
      .gi-update-progress { height: 6px; background: #e2e8f0; border-radius: 4px; margin: 10px 0 4px; overflow: hidden; }
      .gi-update-bar { height: 100%; width: 0%; background: linear-gradient(90deg,#5278f0,#4169e1); transition: width .15s ease; }
      .gi-update-actions { display: flex; gap: 8px; justify-content: flex-end; margin-top: 12px; }
      .gi-update-actions button { border-radius: 8px; padding: 7px 14px; font-size: 13px; font-weight: 600;
        cursor: pointer; border: 1px solid #cbd5e1; background: #f1f5f9; color: #0f172a; }
      .gi-update-actions button:disabled { opacity: .6; cursor: default; }
      .gi-update-go { background: linear-gradient(180deg,#5278f0,#4169e1) !important; border-color: #2f4fc4 !important; color: #fff !important; }
      .gi-update-toast { position: fixed; left: 50%; bottom: 26px; transform: translateX(-50%) translateY(8px);
        background: #0f172a; color: #fff; padding: 10px 16px; border-radius: 10px; font-size: 13px; z-index: 99999;
        opacity: 0; transition: opacity .3s ease, transform .3s ease;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; }
      .gi-update-toast.gi-show { opacity: 1; transform: translateX(-50%) translateY(0); }
    `;
    document.head.appendChild(s);
  }
}
