/**
 * CommandPalette - Cmd/Ctrl+K fuzzy-search launcher for every action in the
 * app. Patterned after Linear, Raycast, Vercel. Actions are declarative so
 * modules can register their own commands at boot.
 */
export class CommandPalette {
  constructor(app) {
    this.app = app;
    this.commands = [];
    this.selected = 0;
    this.filtered = [];
    this._inject();
    this._bindGlobal();
    this._seed();
  }

  register(cmd) {
    // { id, title, hint, section, keywords, run }
    this.commands.push(cmd);
  }

  _inject() {
    const el = document.createElement('div');
    el.className = 'cmdp hidden';
    el.id = 'cmdp';
    el.innerHTML = `
      <div class="cmdp-scrim"></div>
      <div class="cmdp-window" role="dialog" aria-label="Command palette">
        <div class="cmdp-input-wrap">
          <svg class="cmdp-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
          <input type="text" class="cmdp-input" placeholder="Type a command or search…" autocomplete="off" spellcheck="false"/>
          <span class="cmdp-kbd">esc</span>
        </div>
        <div class="cmdp-list" id="cmdpList"></div>
        <div class="cmdp-footer">
          <span><kbd>↑↓</kbd> navigate</span>
          <span><kbd>↵</kbd> run</span>
          <span><kbd>esc</kbd> close</span>
        </div>
      </div>`;
    document.body.appendChild(el);
    this.el = el;
    this.input = el.querySelector('.cmdp-input');
    this.list = el.querySelector('#cmdpList');

    el.querySelector('.cmdp-scrim').addEventListener('click', () => this.close());
    this.input.addEventListener('input', () => { this.selected = 0; this._render(); });
    this.input.addEventListener('keydown', (e) => this._onKey(e));
  }

  _bindGlobal() {
    document.addEventListener('keydown', (e) => {
      const metaK = (e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k';
      if (metaK) { e.preventDefault(); this.toggle(); }
    });
  }

  _seed() {
    const click = (id) => () => document.getElementById(id)?.click();
    const wiz = (n) => () => this.app.wizard.goTo(n);
    const register = (c) => this.register(c);

    // Workflow
    register({ id: 'wiz-1', title: 'Step 1 — Load Video',    section: 'Workflow', hint: '1', run: wiz(1) });
    register({ id: 'wiz-2', title: 'Step 2 — Detect Plays',  section: 'Workflow', hint: '2', run: wiz(2) });
    register({ id: 'wiz-3', title: 'Step 3 — Tag Plays',     section: 'Workflow', hint: '3', run: wiz(3) });
    register({ id: 'wiz-4', title: 'Step 4 — Analyze',       section: 'Workflow', hint: '4', run: wiz(4) });
    register({ id: 'wiz-5', title: 'Step 5 — Export',        section: 'Workflow', hint: '5', run: wiz(5) });

    // Video
    register({ id: 'load-video', title: 'Load Video', section: 'Video', keywords: 'open file upload', run: click('videoFileInput') });
    register({ id: 'play-pause', title: 'Play / Pause', hint: 'Space', section: 'Video', run: click('btnPlayPause') });
    register({ id: 'prev-clip',  title: 'Previous Play',  hint: '⇧←', section: 'Video', run: click('btnPrevClip') });
    register({ id: 'next-clip',  title: 'Next Play',      hint: '⇧→', section: 'Video', run: click('btnNextClip') });

    // Tagging
    register({ id: 'mark-start', title: 'Mark Play Start', hint: '[', section: 'Tag', run: click('btnMarkStart') });
    register({ id: 'mark-end',   title: 'Mark Play End',   hint: ']', section: 'Tag', run: click('btnMarkEnd') });
    register({ id: 'auto-detect', title: 'Auto-Detect Plays from Video', section: 'Tag', keywords: 'scan motion', run: click('btnAutoDetect') });
    register({ id: 'quick-chart', title: 'Quick Chart Mode',  section: 'Tag', hint: 'Q', run: click('btnQuickChart') });

    // Analyze
    register({ id: 'show-stats', title: 'Stats Dashboard', section: 'Analyze', hint: 'S', run: click('btnShowStats') });
    register({ id: 'season-stats', title: 'Season Stats', section: 'Analyze', run: click('btnSeason') });

    // Export
    register({ id: 'call-sheet', title: 'Call Sheet / Wristband Builder', section: 'Export', keywords: 'print pdf', run: click('btnCallSheet') });
    register({ id: 'cut-up',     title: 'Export Cut-Up Video', section: 'Export', keywords: 'stitch webm', run: click('btnExportCutup') });
    register({ id: 'export-csv', title: 'Export CSV of Plays', section: 'Export', run: click('btnExportCsv') });
    register({ id: 'export-report', title: 'Export HTML Report', section: 'Export', run: click('btnExportReport') });
    register({ id: 'screenshot', title: 'Save Frame Screenshot', section: 'Export', hint: 'PNG', run: click('btnExportPng') });

    // Project
    register({ id: 'save-proj', title: 'Save Project', hint: '⌘S', section: 'Project', run: click('btnSave') });
    register({ id: 'load-proj', title: 'Load Project', section: 'Project', run: click('btnLoad') });

    // Help
    register({ id: 'help', title: 'Keyboard Shortcuts', section: 'Help', hint: '?', run: () => document.dispatchEvent(new CustomEvent('ffa-help-open')) });
    register({ id: 'tour', title: 'Replay Onboarding Tour', section: 'Help', run: () => { localStorage.removeItem('ffa_tour_done'); document.dispatchEvent(new CustomEvent('ffa-tour-start')); } });
  }

  toggle() { this.el.classList.contains('hidden') ? this.open() : this.close(); }
  open() {
    this.el.classList.remove('hidden');
    this.input.value = '';
    this.selected = 0;
    this._render();
    setTimeout(() => this.input.focus(), 0);
  }
  close() { this.el.classList.add('hidden'); }

  _score(cmd, q) {
    if (!q) return 1;
    const hay = `${cmd.title} ${cmd.section || ''} ${cmd.keywords || ''}`.toLowerCase();
    q = q.toLowerCase();
    if (hay.includes(q)) return 10 - hay.indexOf(q) / 50;
    // loose char match
    let i = 0, score = 0;
    for (const c of hay) { if (c === q[i]) { score += 1; i++; if (i >= q.length) break; } }
    return i === q.length ? score / q.length : 0;
  }

  _render() {
    const q = this.input.value.trim();
    this.filtered = this.commands
      .map(c => ({ c, s: this._score(c, q) }))
      .filter(x => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .map(x => x.c);

    if (!this.filtered.length) {
      this.list.innerHTML = `<div class="cmdp-empty">No commands match “${this._esc(q)}”</div>`;
      return;
    }
    let lastSection = '';
    let html = '';
    this.filtered.forEach((c, i) => {
      if (c.section && c.section !== lastSection) {
        lastSection = c.section;
        html += `<div class="cmdp-section">${c.section}</div>`;
      }
      html += `<button class="cmdp-item ${i === this.selected ? 'sel' : ''}" data-idx="${i}">
        <span class="cmdp-title">${this._esc(c.title)}</span>
        ${c.hint ? `<span class="cmdp-hint">${this._esc(c.hint)}</span>` : ''}
      </button>`;
    });
    this.list.innerHTML = html;
    this.list.querySelectorAll('.cmdp-item').forEach(el => {
      el.addEventListener('click', () => {
        this.selected = parseInt(el.dataset.idx, 10);
        this._run();
      });
      el.addEventListener('mousemove', () => {
        const i = parseInt(el.dataset.idx, 10);
        if (i !== this.selected) { this.selected = i; this._render(); }
      });
    });
  }

  _onKey(e) {
    if (e.key === 'Escape') { this.close(); return; }
    if (e.key === 'ArrowDown') { e.preventDefault(); this.selected = Math.min(this.filtered.length - 1, this.selected + 1); this._render(); this._scrollSel(); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); this.selected = Math.max(0, this.selected - 1); this._render(); this._scrollSel(); }
    else if (e.key === 'Enter') { e.preventDefault(); this._run(); }
  }

  _scrollSel() {
    const sel = this.list.querySelector('.cmdp-item.sel');
    sel?.scrollIntoView({ block: 'nearest' });
  }

  _run() {
    const c = this.filtered[this.selected];
    if (!c) return;
    this.close();
    setTimeout(() => { try { c.run(); } catch (err) { console.error(err); } }, 60);
  }

  _esc(s) { return String(s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }
}
