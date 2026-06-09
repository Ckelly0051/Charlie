/**
 * PlayGrid — the Film Room play grid (Phase 2 of the Hudl-style redesign).
 *
 * A compact, always-visible table of every play in the open game, co-equal
 * with the video: click a row to load that play (seek / clip-switch via the
 * existing selectPlay path), filter with a visible chip bar, and bulk-select
 * rows to watch them back-to-back as a cut-up (CutupPlayer).
 *
 * Layout: lives in `#playGridSection` between the video section and the tag
 * section. On widescreen it fills the dead space under the video in the left
 * column (grid-template-areas); on narrow screens it stacks between video and
 * tag form and starts collapsed so the tag form stays one scroll away.
 *
 * The chip filters here are intentionally independent of the drawer's
 * "Filter Plays" panel (PlayFilter) — that one keeps driving the cut-up
 * exporter; this one is the quick film-review slice.
 */
import { StatsEngine } from './stats-engine.js';

export class PlayGrid {
  constructor(tagger, videoController, cutupPlayer) {
    this.tagger = tagger;
    this.vc = videoController;
    this.cutup = cutupPlayer;

    this.section = document.getElementById('playGridSection');
    if (!this.section) return;

    // Filter state: AND across groups, OR within a group.
    this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
    this.selected = new Set();   // play ids checked for bulk actions
    this._raf = null;

    const saved = localStorage.getItem('ffa_film_room_collapsed');
    this.collapsed = saved === null ? window.innerWidth < 1100 : saved === '1';

    this._inject();
    this._wire();
    this.refresh();
  }

  // ---------- DOM ----------

  _inject() {
    this.section.innerHTML = `
      <div class="pg-head" id="pgHead">
        <button class="pg-collapse" id="pgCollapse" type="button" title="Show / hide the play grid">▾</button>
        <span class="pg-title">Plays <span class="pg-count" id="pgCount"></span></span>
        <div class="pg-filters" id="pgFilters">
          <span class="pg-fgroup" data-group="unit">
            <button class="pg-chip" data-val="offense" type="button" title="Offense plays">Off</button>
            <button class="pg-chip" data-val="defense" type="button" title="Defense plays">Def</button>
            <button class="pg-chip" data-val="special" type="button" title="Special-teams plays">ST</button>
          </span>
          <span class="pg-fgroup" data-group="downs">
            <button class="pg-chip" data-val="1" type="button">1st</button>
            <button class="pg-chip" data-val="2" type="button">2nd</button>
            <button class="pg-chip" data-val="3" type="button">3rd</button>
            <button class="pg-chip" data-val="4" type="button">4th</button>
          </span>
          <span class="pg-fgroup" data-group="rp">
            <button class="pg-chip" data-val="Run" type="button">Run</button>
            <button class="pg-chip" data-val="Pass" type="button">Pass</button>
          </span>
          <span class="pg-fgroup" data-group="flags">
            <button class="pg-chip" data-val="td" type="button" title="Touchdowns">TD</button>
            <button class="pg-chip" data-val="to" type="button" title="Turnovers (INT + fumble)">TO</button>
            <button class="pg-chip" data-val="pen" type="button" title="Penalties">Pen</button>
            <button class="pg-chip" data-val="untagged" type="button" title="Plays with no tags yet">Untagged</button>
          </span>
          <button class="pg-clear hidden" id="pgClear" type="button">Clear</button>
        </div>
        <span class="pg-showing" id="pgShowing"></span>
        <button class="btn btn-sm pg-watch" id="pgWatch" type="button" title="Play these back-to-back as a cut-up">▶ Watch</button>
      </div>
      <div class="pg-body" id="pgBody">
        <table class="pg-table">
          <thead>
            <tr>
              <th class="pg-c-check"><input type="checkbox" id="pgCheckAll" title="Select all shown plays"></th>
              <th class="pg-c-num">#</th>
              <th class="pg-c-sit">Dn &amp; Dist</th>
              <th class="pg-c-look">Look</th>
              <th class="pg-c-type">Type</th>
              <th class="pg-c-result">Result</th>
              <th class="pg-c-yds">Yds</th>
            </tr>
          </thead>
          <tbody id="pgRows"></tbody>
        </table>
        <div class="pg-empty hidden" id="pgEmpty"></div>
      </div>`;
    this.rowsEl = this.section.querySelector('#pgRows');
    this.section.classList.toggle('collapsed', this.collapsed);
  }

  _wire() {
    this.section.querySelector('#pgCollapse').addEventListener('click', () => this._toggleCollapsed());
    this.section.querySelector('#pgHead').addEventListener('click', (e) => {
      // Clicking the head's dead space toggles too — but never the controls.
      if (e.target.closest('.pg-chip, .pg-clear, .pg-watch, #pgCollapse')) return;
      this._toggleCollapsed();
    });

    this.section.querySelector('#pgFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('.pg-chip');
      if (!chip) return;
      e.stopPropagation();
      this._toggleFilter(chip.closest('.pg-fgroup').dataset.group, chip.dataset.val);
    });
    this.section.querySelector('#pgClear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
      this.refresh();
    });

    this.section.querySelector('#pgWatch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._watch();
    });
    this.section.querySelector('#pgCheckAll').addEventListener('change', (e) => {
      const visible = this._visiblePlays();
      if (e.target.checked) visible.forEach(p => this.selected.add(p.id));
      else visible.forEach(p => this.selected.delete(p.id));
      this.refresh();
    });

    // Row click = open the play (seeks / switches clip); checkbox = select.
    this.rowsEl.addEventListener('click', (e) => {
      const row = e.target.closest('.pg-row');
      if (!row) return;
      const id = parseInt(row.dataset.id, 10);
      if (e.target.classList.contains('pg-check')) {
        if (e.target.checked) this.selected.add(id);
        else this.selected.delete(id);
        this._updateBar();
        return;
      }
      this.tagger.selectPlay(id);
    });

    // Data changes → re-render; selection changes → just move the highlight.
    this.tagger.on('play-created', () => this.refresh());
    this.tagger.on('play-updated', () => this.refresh());
    this.tagger.on('play-deleted', () => this.refresh());
    // Wholesale plays replacement (game switch, undo/redo, project load):
    // checked ids from the old play set are meaningless (ids restart at 1 per
    // game, so they'd silently transfer to unrelated plays) — drop them.
    this.tagger.on('plays-loaded', () => { this.selected.clear(); this.refresh(); });
    // Only an explicit selection auto-scrolls; re-renders must never yank the
    // grid (or, on narrow layouts, the page) while the coach is tagging.
    this.tagger.on('play-selected', (play) => this._highlight(play && play.id, true));
  }

  _toggleCollapsed() {
    this.collapsed = !this.collapsed;
    localStorage.setItem('ffa_film_room_collapsed', this.collapsed ? '1' : '0');
    this.section.classList.toggle('collapsed', this.collapsed);
  }

  _toggleFilter(group, val) {
    if (group === 'unit' || group === 'rp') {
      this.f[group] = this.f[group] === val ? '' : val;
    } else {
      const set = this.f[group];
      if (set.has(val)) set.delete(val); else set.add(val);
    }
    this.refresh();
  }

  // ---------- Filtering ----------
  // Run/pass and result splitting go through StatsEngine (the canonical
  // classifiers) so the grid never disagrees with the stats dashboard —
  // e.g. legacy 'Play Action'/'RPO' plays without an explicit runPass.

  static isUntagged(p) {
    const t = p.tags || {};
    return !t.playType && !t.result && !t.stType;
  }

  _matches(p) {
    const t = p.tags || {};
    const f = this.f;
    if (f.unit && (t.unit || 'offense') !== f.unit) return false;
    if (f.downs.size && !f.downs.has(String(t.down))) return false;
    if (f.rp === 'Run' && !StatsEngine.isRun(p)) return false;
    if (f.rp === 'Pass' && !StatsEngine.isPass(p)) return false;
    if (f.flags.size) {
      const res = StatsEngine.splitResults(t.result);
      const hit = (f.flags.has('td') && res.includes('Touchdown'))
        || (f.flags.has('to') && (res.includes('Interception') || res.includes('Fumble')))
        || (f.flags.has('pen') && res.includes('Penalty'))
        || (f.flags.has('untagged') && PlayGrid.isUntagged(p));
      if (!hit) return false;
    }
    return true;
  }

  _filterActive() {
    return !!(this.f.unit || this.f.rp || this.f.downs.size || this.f.flags.size);
  }

  _visiblePlays() {
    return this.tagger.plays.filter(p => this._matches(p));
  }

  // ---------- Rendering ----------

  /** Re-render on the next frame (coalesces bursts of play-updated events). */
  refresh() {
    if (this._raf) return;
    this._raf = requestAnimationFrame(() => { this._raf = null; this._render(); });
  }

  _render() {
    if (!this.section) return;
    const plays = this.tagger.plays;
    this.section.hidden = plays.length === 0;
    if (plays.length === 0) { this.selected.clear(); return; }

    // Prune selections for plays that no longer exist.
    const ids = new Set(plays.map(p => p.id));
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);

    const visible = this._visiblePlays();
    this.rowsEl.innerHTML = visible.map(p => this._rowHtml(p)).join('');

    const empty = this.section.querySelector('#pgEmpty');
    empty.classList.toggle('hidden', visible.length > 0);
    if (!visible.length) empty.textContent = 'No plays match these filters.';

    // Chip active states.
    this.section.querySelectorAll('.pg-fgroup').forEach(g => {
      const group = g.dataset.group;
      g.querySelectorAll('.pg-chip').forEach(c => {
        const on = (group === 'unit' || group === 'rp')
          ? this.f[group] === c.dataset.val
          : this.f[group].has(c.dataset.val);
        c.classList.toggle('active', on);
      });
    });

    const all = this.section.querySelector('#pgCheckAll');
    all.checked = visible.length > 0 && visible.every(p => this.selected.has(p.id));

    this._updateBar(visible, plays);
    this._highlight(this.tagger.currentPlayId);
  }

  /** The plays Watch actually operates on: checked-AND-visible rows, or every
   *  visible row when nothing is checked. The button label/disabled state and
   *  _watch() must use the same pool, or the count lies (e.g. 3 plays checked,
   *  then a filter hides them — Watch must show 0 and disable, not "(3)"). */
  _watchPool(visible) {
    return this.selected.size ? visible.filter(p => this.selected.has(p.id)) : visible;
  }

  _updateBar(visible, plays) {
    visible = visible || this._visiblePlays();
    plays = plays || this.tagger.plays;
    this.section.querySelector('#pgCount').textContent = `(${plays.length})`;
    const showing = this.section.querySelector('#pgShowing');
    showing.textContent = this._filterActive() ? `${visible.length} of ${plays.length}` : '';
    this.section.querySelector('#pgClear').classList.toggle('hidden', !this._filterActive());

    const pool = this._watchPool(visible);
    const watch = this.section.querySelector('#pgWatch');
    watch.textContent = `▶ Watch (${pool.length})`;
    watch.disabled = pool.length === 0;
  }

  _rowHtml(p) {
    const t = p.tags || {};
    // `unit` lands in a class name / chip letter UNescaped — pin it to the
    // three known values (imported CSVs / foreign season files can hold
    // arbitrary strings in any tag, and innerHTML would execute them).
    const unit = t.unit === 'defense' || t.unit === 'special' ? t.unit : 'offense';
    const u = unit === 'defense' ? 'D' : unit === 'special' ? 'S' : 'O';
    const n = parseInt(t.yardage, 10);
    const yds = Number.isFinite(n) ? n : '';   // CSV imports can carry junk like '—'
    const ydCls = yds === '' ? '' : (yds > 0 ? 'pos' : (yds < 0 ? 'neg' : ''));
    const checked = this.selected.has(p.id) ? ' checked' : '';
    const cur = p.id === this.tagger.currentPlayId ? ' is-current' : '';
    const dim = PlayGrid.isUntagged(p) ? ' is-untagged' : '';
    const time = p.clipName ? p.clipName : `${this._fmt(p.timestamp.start)}–${this._fmt(p.timestamp.end)}`;
    return `
      <tr class="pg-row${cur}${dim}" data-id="${p.id}" title="Play ${p.id} · ${this._esc(time)}">
        <td class="pg-c-check"><input type="checkbox" class="pg-check"${checked}></td>
        <td class="pg-c-num"><span class="pg-unit pg-unit-${unit}">${u}</span>${p.id}</td>
        <td class="pg-c-sit">${this._sit(t)}</td>
        <td class="pg-c-look">${this._esc(this._look(t))}</td>
        <td class="pg-c-type">${this._esc(t.playType || '')}</td>
        <td class="pg-c-result">${this._esc(t.result || '')}</td>
        <td class="pg-c-yds ${ydCls}">${yds === '' ? '' : (yds > 0 ? '+' + yds : yds)}</td>
      </tr>`;
  }

  _sit(t) {
    if (!t.down) return '<span class="pg-dim">—</span>';
    // The fallback is raw tag data (CSV imports) — escape it.
    const ord = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }[t.down] || this._esc(t.down);
    return t.distance ? `${ord} & ${this._esc(t.distance)}` : ord;
  }

  /** Side-of-ball "look": formation (O), front · coverage (D), ST type. */
  _look(t) {
    const unit = t.unit || 'offense';
    if (unit === 'special') return t.stType || '';
    if (unit === 'defense') return [t.defFront, t.coverage].filter(Boolean).join(' · ');
    return t.formation || '';
  }

  /** Move the current-row highlight without a full re-render. `scroll` is only
   *  true on an explicit play selection — never on data re-renders, where
   *  scrolling would yank the grid (or the whole page, on narrow layouts
   *  where the document scrolls) on every tag edit. */
  _highlight(id, scroll = false) {
    if (!this.rowsEl) return;
    this.rowsEl.querySelectorAll('.pg-row.is-current').forEach(r => r.classList.remove('is-current'));
    if (!id) return;
    const row = this.rowsEl.querySelector(`.pg-row[data-id="${id}"]`);
    if (!row) return;
    row.classList.add('is-current');
    if (scroll) this._scrollRowIntoView(row);
  }

  /** Scroll ONLY the grid's own body — scrollIntoView would also scroll every
   *  scrollable ancestor, including the page itself below 1100px. */
  _scrollRowIntoView(row) {
    const body = this.section.querySelector('#pgBody');
    if (!body) return;
    const headH = 26;   // keep the sticky column headers clear of the row
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top - headH < body.scrollTop) body.scrollTop = top - headH;
    else if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight;
  }

  // ---------- Bulk watch ----------

  _watch() {
    const pool = this._watchPool(this._visiblePlays());
    if (!pool.length) return;
    // Mirror StatsEngine._watchPlays: only plays with a real video region are
    // playable, and with no video loaded a cut-up can't run — fall back to
    // selecting the first play so the click is never a silent no-op.
    const playable = pool.filter(p => p.timestamp && p.timestamp.end > p.timestamp.start);
    const hasVideo = !!(this.vc && this.vc.video && this.vc.video.src);
    if (playable.length && hasVideo && this.cutup) {
      const label = this.selected.size ? `${playable.length} selected plays` : `${playable.length} plays`;
      this.cutup.start(playable.map(p => p.id), label);
    } else {
      this.tagger.selectPlay(pool[0].id);
    }
  }

  // ---------- Utils ----------

  _fmt(sec) { return this.tagger._fmt(sec || 0); }

  _esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
