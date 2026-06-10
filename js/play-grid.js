/**
 * PlayGrid — the Film Room breakdown grid (Phase 2/v2 of the Hudl-style
 * redesign).
 *
 * v1 made the play list co-equal with the video (click-to-seek rows, chip
 * filter bar, bulk Watch). v2 turns it into the BREAKDOWN TABLE — the
 * spreadsheet surface Hudl coaches live in:
 *
 *  - INLINE EDITING: click a cell once to select the play (video follows),
 *    click again / Enter / double-click to edit it in place. Enum fields get
 *    a chip popover (options read live from the tag form, so the grid can
 *    never drift from it); yardage/distance/notes get inputs. Enter commits
 *    and moves DOWN (same column, next play); Tab commits and moves RIGHT —
 *    a full game can be charted without touching the form.
 *  - CUSTOM COLUMNS: a Columns popover picks which tag fields show, with
 *    one-tap Offense / Defense / Special Teams presets. Persisted in
 *    `ffa_film_room_cols`.
 *  - SAVED FILTERS: name the current chip-filter combination and recall it
 *    from the Filters menu in any game (persisted in
 *    `ffa_film_room_filters`).
 *  - COLUMN TENDENCIES: a summary line under each header — top value + share
 *    for enum columns ("Shotgun 48%"), run/pass lean, avg yards — computed
 *    over the VISIBLE (filtered) plays, so filtering IS the tendency query.
 *
 * Editing semantics mirror the tag form exactly: picking an unambiguous play
 * type auto-fills Run/Pass; yardage is a magnitude whose sign comes from the
 * Result (Loss/Sack ⇒ negative). Edits to the selected play reload the form.
 *
 * The chip filters here stay independent of the drawer's "Filter Plays"
 * panel (PlayFilter keeps driving the cut-up exporter).
 */
import { StatsEngine } from './stats-engine.js';
import { PlayTagger } from './play-tagger.js';

export class PlayGrid {
  /**
   * Column registry. `src` is the tag-form chip group whose options the
   * editor lists (single source of truth); `unit` marks side-specific
   * columns for the presets. `sit` is the composite Down & Distance column;
   * `notes` edits play.notes (the call), not a tag.
   */
  static COLUMNS = [
    { key: 'sit',       label: 'Dn & Dist', type: 'sit' },
    { key: 'quarter',   label: 'Qtr',       type: 'enum', src: 'tagQuarter' },
    { key: 'hash',      label: 'Hash',      type: 'enum', src: 'tagHash' },
    { key: 'formation', label: 'Formation', type: 'enum', src: 'tagFormation', multi: true,  unit: 'offense' },
    { key: 'personnel', label: 'Pers',      type: 'enum', src: 'tagPersonnel',                unit: 'offense' },
    { key: 'runPass',   label: 'R/P',       type: 'enum', src: 'tagRunPass' },
    { key: 'playType',  label: 'Type',      type: 'enum', src: 'tagPlayType',  multi: true },
    { key: 'result',    label: 'Result',    type: 'enum', src: 'tagResult',    multi: true },
    { key: 'yardage',   label: 'Yds',       type: 'yds' },
    { key: 'defFront',  label: 'Front',     type: 'enum', src: 'tagDefFront',                 unit: 'defense' },
    { key: 'coverage',  label: 'Cover',     type: 'enum', src: 'tagCoverage',                 unit: 'defense' },
    { key: 'blitz',     label: 'Blitz',     type: 'enum', src: 'tagBlitz',     multi: true,   unit: 'defense' },
    { key: 'stType',    label: 'ST Type',   type: 'enum', src: 'tagStType',                   unit: 'special' },
    { key: 'notes',     label: 'Call / Notes', type: 'text' },
  ];

  static PRESETS = {
    default: ['sit', 'formation', 'playType', 'result', 'yardage'],
    offense: ['sit', 'formation', 'personnel', 'runPass', 'playType', 'result', 'yardage'],
    defense: ['sit', 'defFront', 'coverage', 'blitz', 'result', 'yardage'],
    special: ['sit', 'stType', 'result', 'yardage', 'notes'],
  };

  constructor(tagger, videoController, cutupPlayer) {
    this.tagger = tagger;
    this.vc = videoController;
    this.cutup = cutupPlayer;

    this.section = document.getElementById('playGridSection');
    if (!this.section) return;

    // Filter state: AND across groups, OR within a group.
    this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
    this.selected = new Set();    // play ids checked for bulk actions
    this._raf = null;
    this._focus = null;           // { playId, colKey } — roving cell focus
    this._editor = null;          // open editor popover { close() }
    this._optionCache = {};

    const saved = localStorage.getItem('ffa_film_room_collapsed');
    this.collapsed = saved === null ? window.innerWidth < 1100 : saved === '1';
    this.cols = this._loadCols();
    this.savedFilters = this._loadSavedFilters();

    this._inject();
    this._wire();
    this.refresh();
  }

  // ---------- Persistence ----------

  _loadCols() {
    try {
      const v = JSON.parse(localStorage.getItem('ffa_film_room_cols') || 'null');
      if (Array.isArray(v) && v.length) {
        const known = new Set(PlayGrid.COLUMNS.map(c => c.key));
        const cols = v.filter(k => known.has(k));
        if (cols.length) return cols;
      }
    } catch (e) {}
    return PlayGrid.PRESETS.default.slice();
  }
  _saveCols() {
    try { localStorage.setItem('ffa_film_room_cols', JSON.stringify(this.cols)); } catch (e) {}
  }
  _loadSavedFilters() {
    try { return JSON.parse(localStorage.getItem('ffa_film_room_filters') || '[]') || []; } catch (e) { return []; }
  }
  _saveSavedFilters() {
    try { localStorage.setItem('ffa_film_room_filters', JSON.stringify(this.savedFilters)); } catch (e) {}
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
          <button class="pg-clear hidden" id="pgSaveFilter" type="button" title="Save this filter to reuse in any game">☆ Save</button>
          <button class="pg-chip pg-menu-btn hidden" id="pgFiltersMenu" type="button" title="Apply a saved filter">Filters ▾</button>
        </div>
        <span class="pg-showing" id="pgShowing"></span>
        <button class="pg-chip pg-menu-btn" id="pgColsBtn" type="button" title="Choose columns">▦ Columns</button>
        <button class="btn btn-sm pg-watch" id="pgWatch" type="button" title="Play these back-to-back as a cut-up">▶ Watch</button>
      </div>
      <div class="pg-body" id="pgBody">
        <table class="pg-table">
          <thead id="pgThead"></thead>
          <tbody id="pgRows"></tbody>
        </table>
        <div class="pg-empty hidden" id="pgEmpty"></div>
      </div>`;
    this.rowsEl = this.section.querySelector('#pgRows');
    this.theadEl = this.section.querySelector('#pgThead');
    this.section.classList.toggle('collapsed', this.collapsed);
  }

  _wire() {
    this.section.querySelector('#pgCollapse').addEventListener('click', () => this._toggleCollapsed());
    this.section.querySelector('#pgHead').addEventListener('click', (e) => {
      if (e.target.closest('.pg-chip, .pg-clear, .pg-watch, #pgCollapse, .pg-menu-btn')) return;
      this._toggleCollapsed();
    });

    this.section.querySelector('#pgFilters').addEventListener('click', (e) => {
      const chip = e.target.closest('.pg-chip');
      if (!chip || chip.id === 'pgFiltersMenu') return;
      e.stopPropagation();
      this._toggleFilter(chip.closest('.pg-fgroup').dataset.group, chip.dataset.val);
    });
    this.section.querySelector('#pgClear').addEventListener('click', (e) => {
      e.stopPropagation();
      this.f = { unit: '', downs: new Set(), rp: '', flags: new Set() };
      this.refresh();
    });
    this.section.querySelector('#pgSaveFilter').addEventListener('click', (e) => {
      e.stopPropagation(); this._openSaveFilter(e.currentTarget);
    });
    this.section.querySelector('#pgFiltersMenu').addEventListener('click', (e) => {
      e.stopPropagation(); this._openFiltersMenu(e.currentTarget);
    });
    this.section.querySelector('#pgColsBtn').addEventListener('click', (e) => {
      e.stopPropagation(); this._openColumnsMenu(e.currentTarget);
    });

    this.section.querySelector('#pgWatch').addEventListener('click', (e) => {
      e.stopPropagation();
      this._watch();
    });

    // Header select-all (thead is re-rendered, so delegate).
    this.theadEl.addEventListener('change', (e) => {
      if (e.target.id !== 'pgCheckAll') return;
      const visible = this._visiblePlays();
      if (e.target.checked) visible.forEach(p => this.selected.add(p.id));
      else visible.forEach(p => this.selected.delete(p.id));
      this.refresh();
    });

    // Cell interaction: first click selects the play (video follows); a click
    // on the already-focused cell — or dblclick / Enter — opens the editor.
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
      const cell = e.target.closest('td[data-k]');
      const colKey = cell ? cell.dataset.k : null;
      const wasFocused = this._focus && this._focus.playId === id && this._focus.colKey === colKey;
      if (id !== this.tagger.currentPlayId) this.tagger.selectPlay(id);
      if (colKey) {
        this._setFocus(id, colKey);
        if (wasFocused) this._openEditor(id, colKey);
      }
    });
    this.rowsEl.addEventListener('dblclick', (e) => {
      const row = e.target.closest('.pg-row');
      const cell = e.target.closest('td[data-k]');
      if (!row || !cell) return;
      this._openEditor(parseInt(row.dataset.id, 10), cell.dataset.k);
    });

    // Grid-level keys (cell focus). stopPropagation keeps the app's global
    // single-letter tagging shortcuts from double-firing underneath.
    this.section.addEventListener('keydown', (e) => {
      if (!this._focus || this._editor) return;
      const nav = { ArrowUp: [0, -1], ArrowDown: [0, 1], ArrowLeft: [-1, 0], ArrowRight: [1, 0] }[e.key];
      if (nav) {
        e.preventDefault(); e.stopPropagation();
        this._moveFocus(nav[0], nav[1]);
      } else if (e.key === 'Enter') {
        e.preventDefault(); e.stopPropagation();
        this._openEditor(this._focus.playId, this._focus.colKey);
      } else if (e.key === 'Escape') {
        e.stopPropagation();
        this._setFocus(null);
      }
    });

    // Data changes → re-render; selection changes → just move the highlight.
    this.tagger.on('play-created', () => this.refresh());
    this.tagger.on('play-updated', () => this.refresh());
    this.tagger.on('play-deleted', () => this.refresh());
    // Wholesale plays replacement (game switch, undo/redo, project load):
    // checked ids from the old play set are meaningless (ids restart at 1 per
    // game, so they'd silently transfer to unrelated plays) — drop them.
    this.tagger.on('plays-loaded', () => {
      this.selected.clear();
      this._setFocus(null);
      this._closeEditor();
      this.refresh();
    });
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

  // ---------- Saved filters ----------

  _serializeFilter() {
    return { unit: this.f.unit, downs: [...this.f.downs], rp: this.f.rp, flags: [...this.f.flags] };
  }
  _applySavedFilter(s) {
    this.f = {
      unit: s.unit || '',
      downs: new Set(Array.isArray(s.downs) ? s.downs : []),
      rp: s.rp || '',
      flags: new Set(Array.isArray(s.flags) ? s.flags : []),
    };
    this.refresh();
  }

  _openSaveFilter(anchor) {
    if (!this._filterActive()) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="pg-pop-title">Save this filter</div>
      <input type="text" class="pg-pop-input" id="pgFilterName" placeholder="e.g. 3rd &amp; long passes" maxlength="40">
      <div class="pg-pop-actions"><button class="btn btn-sm btn-accent" id="pgFilterSaveOk" type="button">Save</button></div>`;
    const pop = this._popover(anchor, wrap);
    const input = wrap.querySelector('#pgFilterName');
    const save = () => {
      const name = input.value.trim();
      if (!name) { input.focus(); return; }
      this.savedFilters = this.savedFilters.filter(x => x.name !== name);   // overwrite same name
      this.savedFilters.push({ name, f: this._serializeFilter() });
      this._saveSavedFilters();
      pop.close();
      this.refresh();
    };
    wrap.querySelector('#pgFilterSaveOk').addEventListener('click', save);
    input.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    setTimeout(() => input.focus(), 30);
  }

  _openFiltersMenu(anchor) {
    if (!this.savedFilters.length) return;
    const wrap = document.createElement('div');
    wrap.innerHTML = `<div class="pg-pop-title">Saved filters</div>` +
      this.savedFilters.map((x, i) => `
        <div class="pg-pop-row" data-i="${i}">
          <button class="pg-pop-item" data-apply="${i}" type="button">${this._esc(x.name)}</button>
          <button class="pg-pop-del" data-del="${i}" type="button" title="Delete this saved filter">✕</button>
        </div>`).join('');
    const pop = this._popover(anchor, wrap);
    wrap.addEventListener('click', (e) => {
      const apply = e.target.closest('[data-apply]');
      const del = e.target.closest('[data-del]');
      if (apply) { this._applySavedFilter(this.savedFilters[+apply.dataset.apply].f); pop.close(); }
      else if (del) {
        this.savedFilters.splice(+del.dataset.del, 1);
        this._saveSavedFilters();
        pop.close();
        this.refresh();
      }
    });
  }

  // ---------- Columns ----------

  _visibleCols() {
    return this.cols.map(k => PlayGrid.COLUMNS.find(c => c.key === k)).filter(Boolean);
  }

  _openColumnsMenu(anchor) {
    const wrap = document.createElement('div');
    wrap.innerHTML = `
      <div class="pg-pop-title">Columns</div>
      <div class="pg-pop-presets">
        <button class="pg-chip" data-preset="offense" type="button">Offense</button>
        <button class="pg-chip" data-preset="defense" type="button">Defense</button>
        <button class="pg-chip" data-preset="special" type="button">Special</button>
        <button class="pg-chip" data-preset="default" type="button">Default</button>
      </div>` +
      PlayGrid.COLUMNS.map(c => `
        <label class="pg-pop-check"><input type="checkbox" data-col="${c.key}"${this.cols.includes(c.key) ? ' checked' : ''}> ${this._esc(c.label)}</label>`).join('');
    this._popover(anchor, wrap);
    wrap.addEventListener('click', (e) => {
      const preset = e.target.closest('[data-preset]');
      if (preset) {
        this.cols = PlayGrid.PRESETS[preset.dataset.preset].slice();
        this._saveCols();
        wrap.querySelectorAll('input[data-col]').forEach(cb => { cb.checked = this.cols.includes(cb.dataset.col); });
        this.refresh();
      }
    });
    wrap.addEventListener('change', (e) => {
      const cb = e.target.closest('input[data-col]');
      if (!cb) return;
      const key = cb.dataset.col;
      if (cb.checked) {
        // Insert in registry order so the table reads consistently.
        const order = PlayGrid.COLUMNS.map(c => c.key);
        this.cols = order.filter(k => k === key || this.cols.includes(k));
      } else {
        if (this.cols.length === 1) { cb.checked = true; return; }   // never zero columns
        this.cols = this.cols.filter(k => k !== key);
      }
      this._saveCols();
      this.refresh();
    });
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
    if (plays.length === 0) {
      this.selected.clear();
      this._focus = null;
      this.rowsEl.innerHTML = '';        // don't keep stale rows in hidden DOM
      this.theadEl.innerHTML = '';
      return;
    }

    // Prune selections for plays that no longer exist.
    const ids = new Set(plays.map(p => p.id));
    for (const id of [...this.selected]) if (!ids.has(id)) this.selected.delete(id);
    if (this._focus && !ids.has(this._focus.playId)) this._focus = null;

    const visible = this._visiblePlays();
    const cols = this._visibleCols();

    this.theadEl.innerHTML = this._headHtml(cols, visible);
    this.rowsEl.innerHTML = visible.map(p => this._rowHtml(p, cols)).join('');

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
    if (all) all.checked = visible.length > 0 && visible.every(p => this.selected.has(p.id));

    this._updateBar(visible, plays);
    this._highlight(this.tagger.currentPlayId);
    this._restoreFocusClass();
  }

  _headHtml(cols, visible) {
    const tend = visible.length >= 5 ? `
      <tr class="pg-tend">
        <td></td><td></td>
        ${cols.map(c => `<td class="pg-c-${c.key}">${this._tendency(c, visible)}</td>`).join('')}
      </tr>` : '';
    return `
      <tr>
        <th class="pg-c-check"><input type="checkbox" id="pgCheckAll" title="Select all shown plays"></th>
        <th class="pg-c-num">#</th>
        ${cols.map(c => `<th class="pg-c-${c.key}">${this._esc(c.label)}</th>`).join('')}
      </tr>${tend}`;
  }

  /** One-line tendency under a column header, over the VISIBLE plays. */
  _tendency(col, visible) {
    if (col.type === 'yds') {
      const ys = visible.map(p => parseInt(p.tags.yardage, 10)).filter(Number.isFinite);
      if (ys.length < 3) return '';
      const avg = ys.reduce((s, y) => s + y, 0) / ys.length;
      return `avg ${avg.toFixed(1)}`;
    }
    if (col.key === 'runPass') {
      const rp = visible.filter(p => StatsEngine.isRun(p) || StatsEngine.isPass(p));
      if (rp.length < 3) return '';
      const runs = rp.filter(p => StatsEngine.isRun(p)).length;
      const pct = Math.round((runs / rp.length) * 100);
      return pct >= 50 ? `Run ${pct}%` : `Pass ${100 - pct}%`;
    }
    if (col.type === 'enum') {
      const counts = {};
      let total = 0;
      visible.forEach(p => {
        String(p.tags[col.key] || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean).forEach(v => {
          counts[v] = (counts[v] || 0) + 1; total++;
        });
      });
      const top = Object.entries(counts).sort((a, b) => b[1] - a[1])[0];
      if (!top || total < 3) return '';
      return `${this._esc(top[0])} ${Math.round((top[1] / total) * 100)}%`;
    }
    return '';
  }

  _updateBar(visible, plays) {
    visible = visible || this._visiblePlays();
    plays = plays || this.tagger.plays;
    this.section.querySelector('#pgCount').textContent = `(${plays.length})`;
    const showing = this.section.querySelector('#pgShowing');
    showing.textContent = this._filterActive() ? `${visible.length} of ${plays.length}` : '';
    this.section.querySelector('#pgClear').classList.toggle('hidden', !this._filterActive());
    this.section.querySelector('#pgSaveFilter').classList.toggle('hidden', !this._filterActive());
    this.section.querySelector('#pgFiltersMenu').classList.toggle('hidden', !this.savedFilters.length);

    const pool = this._watchPool(visible);
    const watch = this.section.querySelector('#pgWatch');
    watch.textContent = `▶ Watch (${pool.length})`;
    watch.disabled = pool.length === 0;
  }

  _rowHtml(p, cols) {
    const t = p.tags || {};
    // `unit` lands in a class name / chip letter UNescaped — pin it to the
    // three known values (imported CSVs / foreign season files can hold
    // arbitrary strings in any tag, and innerHTML would execute them).
    const unit = t.unit === 'defense' || t.unit === 'special' ? t.unit : 'offense';
    const u = unit === 'defense' ? 'D' : unit === 'special' ? 'S' : 'O';
    const checked = this.selected.has(p.id) ? ' checked' : '';
    const cur = p.id === this.tagger.currentPlayId ? ' is-current' : '';
    const dim = PlayGrid.isUntagged(p) ? ' is-untagged' : '';
    const time = p.clipName ? p.clipName : `${this._fmt(p.timestamp.start)}–${this._fmt(p.timestamp.end)}`;
    return `
      <tr class="pg-row${cur}${dim}" data-id="${p.id}" title="Play ${p.id} · ${this._esc(time)}">
        <td class="pg-c-check"><input type="checkbox" class="pg-check"${checked}></td>
        <td class="pg-c-num"><span class="pg-unit pg-unit-${unit}">${u}</span>${p.id}</td>
        ${cols.map(c => `<td class="pg-c-${c.key} pg-edit" data-k="${c.key}">${this._cellHtml(p, c)}</td>`).join('')}
      </tr>`;
  }

  _cellHtml(p, col) {
    const t = p.tags || {};
    if (col.type === 'sit') return this._sit(t);
    if (col.type === 'yds') {
      const n = parseInt(t.yardage, 10);
      if (!Number.isFinite(n)) return '';   // CSV imports can carry junk like '—'
      const cls = n > 0 ? 'pos' : (n < 0 ? 'neg' : '');
      return `<span class="${cls}">${n > 0 ? '+' + n : n}</span>`;
    }
    if (col.key === 'notes') return this._esc(p.notes || '');
    return this._esc(t[col.key] || '');
  }

  _sit(t) {
    if (!t.down) return '<span class="pg-dim">—</span>';
    // The fallback is raw tag data (CSV imports) — escape it.
    const ord = { 1: '1st', 2: '2nd', 3: '3rd', 4: '4th' }[t.down] || this._esc(t.down);
    return t.distance ? `${ord} & ${this._esc(t.distance)}` : ord;
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
    const headH = 44;   // keep the sticky column headers + tendency row clear
    const top = row.offsetTop;
    const bottom = top + row.offsetHeight;
    if (top - headH < body.scrollTop) body.scrollTop = top - headH;
    else if (bottom > body.scrollTop + body.clientHeight) body.scrollTop = bottom - body.clientHeight;
  }

  // ---------- Cell focus (spreadsheet navigation) ----------

  _setFocus(playId, colKey) {
    this._focus = playId == null ? null : { playId, colKey };
    this._restoreFocusClass();
  }

  _restoreFocusClass() {
    this.rowsEl.querySelectorAll('td.pg-cell-focus').forEach(td => td.classList.remove('pg-cell-focus'));
    if (!this._focus) return;
    const td = this._cellEl(this._focus.playId, this._focus.colKey);
    if (td) {
      td.classList.add('pg-cell-focus');
      // Make the section focusable so grid keys work after a click.
      if (!this.section.hasAttribute('tabindex')) this.section.setAttribute('tabindex', '-1');
      if (!this.section.contains(document.activeElement) || document.activeElement === document.body) {
        this.section.focus({ preventScroll: true });
      }
    }
  }

  _cellEl(playId, colKey) {
    return this.rowsEl.querySelector(`.pg-row[data-id="${playId}"] td[data-k="${colKey}"]`);
  }

  _moveFocus(dx, dy) {
    if (!this._focus) return;
    const visible = this._visiblePlays();
    const cols = this._visibleCols();
    let r = visible.findIndex(p => p.id === this._focus.playId);
    let c = cols.findIndex(col => col.key === this._focus.colKey);
    if (r < 0 || c < 0) return;
    r = Math.max(0, Math.min(visible.length - 1, r + dy));
    c = Math.max(0, Math.min(cols.length - 1, c + dx));
    const play = visible[r];
    this._setFocus(play.id, cols[c].key);
    if (dy !== 0 && play.id !== this.tagger.currentPlayId) this.tagger.selectPlay(play.id);
    const td = this._cellEl(play.id, cols[c].key);
    if (td) this._scrollRowIntoView(td.parentElement);
  }

  // ---------- Inline editing ----------

  /** Options for an enum column, read live from the tag form's chip group so
   *  the grid can never offer values the form wouldn't. */
  _options(col) {
    if (this._optionCache[col.key]) return this._optionCache[col.key];
    const opts = [...document.querySelectorAll(`#${col.src} .pick`)]
      .map(b => b.dataset.value).filter(Boolean);
    if (opts.length) this._optionCache[col.key] = opts;
    return opts;
  }

  _openEditor(playId, colKey) {
    const play = this.tagger.getPlay(playId);
    const col = PlayGrid.COLUMNS.find(c => c.key === colKey);
    const cell = this._cellEl(playId, colKey);
    if (!play || !col || !cell) return;
    this._closeEditor();

    const wrap = document.createElement('div');
    let commit;   // (value) => void, set per editor type

    // Commit direction: keyboard Enter advances DOWN (spreadsheet charting
    // flow), Tab hops sideways, mouse commits stay on the play — advancing
    // the selection (and seeking the video) on a mouse pick is disorienting.
    if (col.type === 'enum' && !col.multi) {
      const cur = String(play.tags[col.key] || '');
      wrap.innerHTML = `<div class="pg-pop-chips">${this._options(col).map(o =>
        `<button class="pg-chip${o === cur ? ' active' : ''}" data-v="${this._esc(o)}" type="button">${this._esc(o)}</button>`).join('')}
        <button class="pg-chip pg-chip-clear" data-v="" type="button">✕ none</button></div>`;
      wrap.addEventListener('click', (e) => {
        const b = e.target.closest('[data-v]');
        if (b) commit(b.dataset.v);
      });
    } else if (col.type === 'enum' && col.multi) {
      const cur = new Set(String(play.tags[col.key] || '').split(/\s*\+\s*/).map(s => s.trim()).filter(Boolean));
      wrap.innerHTML = `<div class="pg-pop-chips">${this._options(col).map(o =>
        `<button class="pg-chip${cur.has(o) ? ' active' : ''}" data-v="${this._esc(o)}" type="button">${this._esc(o)}</button>`).join('')}</div>
        <div class="pg-pop-actions">
          <button class="btn btn-sm" data-act="clear" type="button">Clear</button>
          <button class="btn btn-sm btn-accent" data-act="done" type="button">Done</button>
        </div>`;
      wrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.pg-chip[data-v]');
        if (chip) { chip.classList.toggle('active'); return; }
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'clear') commit('');
        else commit([...wrap.querySelectorAll('.pg-chip.active')].map(c => c.dataset.v).join(' + '));
      });
    } else if (col.type === 'sit') {
      const t = play.tags;
      wrap.innerHTML = `
        <div class="pg-pop-chips">${['1', '2', '3', '4'].map(d =>
          `<button class="pg-chip${String(t.down) === d ? ' active' : ''}" data-v="${d}" type="button">${({1:'1st',2:'2nd',3:'3rd',4:'4th'})[d]}</button>`).join('')}
          <button class="pg-chip pg-chip-clear" data-v="" type="button">✕</button></div>
        <input type="number" class="pg-pop-input" id="pgSitDist" placeholder="Distance" min="1" max="99" value="${this._esc(t.distance || '')}">
        <div class="pg-pop-actions"><button class="btn btn-sm btn-accent" data-act="done" type="button">Done</button></div>`;
      let down = String(t.down || '');
      wrap.addEventListener('click', (e) => {
        const chip = e.target.closest('.pg-chip[data-v]');
        if (chip) {
          down = chip.dataset.v;
          wrap.querySelectorAll('.pg-chip').forEach(c => c.classList.toggle('active', c === chip && !!down));
          return;
        }
        if (e.target.closest('[data-act="done"]')) commit({ down, distance: wrap.querySelector('#pgSitDist').value.trim() });
      });
      const dist = wrap.querySelector('#pgSitDist');
      dist.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit({ down, distance: dist.value.trim() }, 'down'); }
      });
    } else {   // yds / text
      const isYds = col.type === 'yds';
      const cur = isYds ? String(play.tags.yardage ?? '') : String(play.notes || '');
      wrap.innerHTML = `<input type="${isYds ? 'number' : 'text'}" class="pg-pop-input pg-pop-wide" id="pgCellInput"
        value="${this._esc(cur)}"${isYds ? '' : ' maxlength="200" placeholder="e.g. Power R 34 Lead"'}>`;
      const input = wrap.querySelector('#pgCellInput');
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); commit(input.value.trim(), 'down'); }
      });
      setTimeout(() => { input.focus(); input.select(); }, 30);
    }

    const pop = this._popover(cell, wrap, () => { this._editor = null; });
    this._editor = pop;

    // Tab / Shift+Tab inside any editor: commit the current state where it's
    // unambiguous (inputs), then hop horizontally. Enter-driven commits hop
    // DOWN via _afterCommit.
    wrap.addEventListener('keydown', (e) => {
      e.stopPropagation();   // never leak keys to the app's global shortcuts
      if (e.key === 'Escape') { e.preventDefault(); pop.close(); this.section.focus({ preventScroll: true }); }
      if (e.key === 'Tab') {
        e.preventDefault();
        const input = wrap.querySelector('#pgCellInput, #pgSitDist');
        if (input && input.id === 'pgCellInput') commit(input.value.trim(), e.shiftKey ? 'left' : 'right');
        else { pop.close(); this._moveFocus(e.shiftKey ? -1 : 1, 0); }
      }
    });

    commit = (value, dir) => {
      pop.close();
      this._applyEdit(play, col, value);
      this._afterCommit(playId, colKey, dir || null);   // mouse commits stay put
    };
  }

  _closeEditor() {
    if (this._editor) { this._editor.close(); this._editor = null; }
  }

  /** Apply an inline edit with the SAME semantics as the tag form. */
  _applyEdit(play, col, value) {
    if (col.key === 'notes') {
      play.notes = value;
    } else if (col.type === 'sit') {
      play.tags.down = value.down;
      play.tags.distance = value.distance;
    } else {
      play.tags[col.key] = value;
      // Unambiguous play type auto-fills Run/Pass (mirror of _saveField).
      if (col.key === 'playType') {
        const auto = PlayTagger.runPassForPlayType(value);
        if (auto && play.tags.runPass !== auto) play.tags.runPass = auto;
      }
    }
    // Yardage is a magnitude; Loss/Sack supply the sign (mirror of
    // _applyYardageSign — keep stored values consistent with form entry).
    if (col.key === 'yardage' || col.key === 'result') {
      const raw = String(play.tags.yardage ?? '').trim();
      if (raw !== '') {
        const mag = Math.abs(parseInt(raw, 10) || 0);
        const res = StatsEngine.splitResults(play.tags.result);
        play.tags.yardage = String(res.includes('Loss') || res.includes('Sack') ? -mag : mag);
      }
    }
    // Keep the tag form in lockstep when the edited play is loaded in it.
    if (play.id === this.tagger.currentPlayId) this.tagger._loadTagForm(play);
    this.tagger._emit('play-updated', play);
  }

  /** After a commit: restore focus, and for keyboard commits move it (down =
   *  next play same column, spreadsheet style) once the rAF re-render has
   *  rebuilt the rows. Mouse commits (dir null) stay on the edited cell. */
  _afterCommit(playId, colKey, dir) {
    this._setFocus(playId, colKey);
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (dir === 'down') this._moveFocus(0, 1);
      else if (dir === 'right') this._moveFocus(1, 0);
      else if (dir === 'left') this._moveFocus(-1, 0);
      else this._restoreFocusClass();
      this.section.focus({ preventScroll: true });
    }));
  }

  // ---------- Popover infrastructure ----------

  /** Small fixed-position popover anchored under `anchor`. Closes on outside
   *  mousedown or Esc; swallows its own keydowns so the app's global
   *  single-letter shortcuts can't fire underneath. */
  _popover(anchor, contentEl, onClose) {
    const pop = document.createElement('div');
    pop.className = 'pg-pop';
    pop.appendChild(contentEl);
    document.body.appendChild(pop);

    const r = anchor.getBoundingClientRect();
    pop.style.left = Math.max(8, Math.min(r.left, window.innerWidth - pop.offsetWidth - 8)) + 'px';
    const below = r.bottom + 4;
    const h = pop.offsetHeight;
    pop.style.top = (below + h > window.innerHeight - 8 && r.top - h - 4 > 8 ? r.top - h - 4 : below) + 'px';

    let closed = false;
    const close = () => {
      if (closed) return;
      closed = true;
      document.removeEventListener('mousedown', onDown, true);
      document.removeEventListener('keydown', onKey, true);
      pop.remove();
      if (onClose) onClose();
    };
    const onDown = (e) => { if (!pop.contains(e.target) && e.target !== anchor) close(); };
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); close(); }
    };
    document.addEventListener('mousedown', onDown, true);
    document.addEventListener('keydown', onKey, true);
    return { el: pop, close };
  }

  // ---------- Bulk watch ----------

  /** The plays Watch actually operates on: checked-AND-visible rows, or every
   *  visible row when nothing is checked. The button label/disabled state and
   *  _watch() must use the same pool, or the count lies (e.g. 3 plays checked,
   *  then a filter hides them — Watch must show 0 and disable, not "(3)"). */
  _watchPool(visible) {
    return this.selected.size ? visible.filter(p => this.selected.has(p.id)) : visible;
  }

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
