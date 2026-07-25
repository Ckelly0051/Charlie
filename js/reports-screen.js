/**
 * ReportsScreen — the "show me everything" destination.
 *
 * WHY THIS EXISTS. The redesign gave Home, Break Down, Study, and Plan new
 * homes, but the full team report had none: Study answers a *question*, while a
 * coach opening the app wants the whole picture. So reports fell through to the
 * original dashboard, and the strongest analytics in the product ended up
 * wearing the oldest UI — which is what made the redesign read as unfinished.
 *
 * WHAT IT DOES NOT DO. It does not compute or reimplement a single metric.
 * `StatsEngine` remains the only analytics owner (redesign plan §4: "Do not
 * reimplement formulas inside Study UI components"). This screen RE-PARENTS the
 * canonical `#statsDashboard` element into a shell route — the same proven
 * pattern `BreakdownWorkspace` uses to host `.video-section` / `.tag-section` —
 * and lets CSS present it as an in-route page instead of a full-screen modal.
 *
 * That means every number, every tab, and critically every `.cut-row`
 * click-to-film binding keeps working untouched: it is literally the same DOM
 * and the same listeners, in a different parent.
 */
export class ReportsScreen {
  constructor(app) {
    this.app = app;
    this.host = null;
    this.dash = document.getElementById('statsDashboard');
    // Captured BEFORE any move so restore() can put it back exactly (mirrors
    // WorkspaceShell._remember; recording it after mounting would record the
    // already-moved position).
    this._home = this.dash
      ? { parent: this.dash.parentNode, next: this.dash.nextSibling }
      : null;
  }

  /** Re-parent the canonical dashboard into the shell's Reports route. */
  mount(host) {
    if (!host || !this.dash) return false;
    this.host = host;
    host.innerHTML = `
      <div class="rp-route">
        <header class="rp-head">
          <div>
            <div class="rp-eyebrow">Team reports</div>
            <h1 class="rp-title" id="rpTitle">Reports</h1>
            <p class="rp-sub" id="rpSub">Every number links to its film.</p>
          </div>
          <div class="rp-actions">
            <button type="button" class="rp-btn" data-rp-action="scout">Scout opponent</button>
            <button type="button" class="rp-btn" data-rp-action="export">Export</button>
          </div>
        </header>
        <div class="rp-body"></div>
      </div>`;
    host.querySelector('.rp-body').append(this.dash);
    this._bind();
    return true;
  }

  restore() {
    if (!this.dash || !this._home?.parent) return;
    const next = this._home.next?.parentNode === this._home.parent ? this._home.next : null;
    this._home.parent.insertBefore(this.dash, next);
    this.host = null;
  }

  _bind() {
    if (!this.host || this._bound) return;
    this._bound = true;
    this.host.addEventListener('click', e => {
      const action = e.target.closest('[data-rp-action]')?.dataset.rpAction;
      if (!action) return;
      // Delegate to the canonical buttons the dashboard already owns, so these
      // shell-level actions can never drift from the real implementations.
      if (action === 'scout') document.getElementById('btnScoutOpp')?.click();
      if (action === 'export') document.getElementById('btnExportStats')?.click();
    });
  }

  /** Render the canonical dashboard for the current context. */
  show() {
    if (!this.dash) return;
    const stats = this.app.stats;
    if (!stats) return;
    this._syncHeader();
    // The engine owns compute + render; we only ensure it is visible in-route.
    stats.showDashboard();
    this.dash.classList.remove('hidden');
  }

  _syncHeader() {
    const c = this.app.workspace?.snapshot?.();
    const title = this.host?.querySelector('#rpTitle');
    const sub = this.host?.querySelector('#rpSub');
    if (title) title.textContent = c?.game?.name || c?.season?.name || 'Reports';
    if (sub) {
      const season = c?.season?.name ? `${c.season.name} · ` : '';
      sub.textContent = `${season}every number links to its film`;
    }
  }
}
