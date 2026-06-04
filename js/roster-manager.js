/**
 * RosterManager — team roster + player attribution helper.
 *
 * Owns the roster (jersey #, name, position, side) and the "quick-pick"
 * jersey chip bar in the tag form. Clicking a chip stamps the currently
 * focused player-role input (Ball Carrier / Passer / Receiver / Tackler),
 * so a coach can attribute players to a play in a couple of taps.
 *
 * Roster persists to localStorage and is included in project saves via
 * StorageManager (which reads window.app.roster). Per-play attribution
 * lives on play.tags.players and is handled by PlayTagger.
 */
export class RosterManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.players = [];           // [{ num, name, pos, side }] side: 'O'|'D'|'B'
    this.activeRole = 'ballCarrier';

    // Roster panel elements
    this.listEl = document.getElementById('rosterList');
    this.numInput = document.getElementById('rosterNum');
    this.nameInput = document.getElementById('rosterName');
    this.posInput = document.getElementById('rosterPos');
    this.sideInput = document.getElementById('rosterSide');
    this.addBtn = document.getElementById('btnAddPlayer');

    // Quick-pick bar in the tag form + the role inputs it stamps
    this.quickPickEl = document.getElementById('rosterQuickPick');
    this.roleInputs = {
      ballCarrier: document.getElementById('tagPlayerBC'),
      passer: document.getElementById('tagPlayerPasser'),
      receiver: document.getElementById('tagPlayerReceiver'),
      tackler: document.getElementById('tagPlayerTackler'),
      kicker: document.getElementById('tagPlayerKicker'),
      returner: document.getElementById('tagPlayerReturner'),
    };
    // Roles that accept multiple jersey #s (e.g. shared/assisted tackles).
    // Stamping toggles membership in a comma-separated list instead of
    // replacing the single value.
    this.multiRoles = new Set(['tackler']);

    this._load();
    this._bind();
    this._bindImport();
    this.renderList();
    this.renderQuickPick();
  }

  _bind() {
    if (this.addBtn) {
      this.addBtn.addEventListener('click', () => this._addFromForm());
    }
    // Enter in any add-field commits the player
    [this.numInput, this.nameInput, this.posInput].forEach(el => {
      if (el) el.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); this._addFromForm(); }
      });
    });

    // Track which role the roster chips will stamp (last focused input).
    for (const [role, el] of Object.entries(this.roleInputs)) {
      if (!el) continue;
      el.addEventListener('focus', () => { this.activeRole = role; this._markActiveRole(); });
    }

    // Refresh chip highlights when a different play is selected.
    if (this.tagger) {
      this.tagger.on('play-selected', () => this.refreshActiveChips());
    }
  }

  // --- Roster CRUD ---

  _addFromForm() {
    const num = (this.numInput?.value || '').trim();
    if (!num) { this.numInput?.focus(); return; }
    const name = (this.nameInput?.value || '').trim();
    const pos = (this.posInput?.value || '').trim();
    const side = this.sideInput?.value || 'B';
    this.addPlayer(num, name, pos, side);
    // Reset for fast entry
    if (this.numInput) this.numInput.value = '';
    if (this.nameInput) this.nameInput.value = '';
    if (this.posInput) this.posInput.value = '';
    this.numInput?.focus();
  }

  addPlayer(num, name = '', pos = '', side = 'B') {
    num = String(num).trim();
    if (!num) return;
    const existing = this.players.find(p => p.num === num);
    if (existing) {
      existing.name = name || existing.name;
      existing.pos = pos || existing.pos;
      existing.side = side || existing.side;
    } else {
      this.players.push({ num, name, pos, side });
    }
    this.players.sort((a, b) => (parseInt(a.num) || 0) - (parseInt(b.num) || 0));
    this._save();
    this.renderList();
    this.renderQuickPick();
  }

  removePlayer(num) {
    this.players = this.players.filter(p => p.num !== String(num));
    this._save();
    this.renderList();
    this.renderQuickPick();
  }

  /** "#22 Smith" when named, else "#22" — used by the stats tables. */
  getLabel(num) {
    const p = this.players.find(pl => pl.num === String(num));
    return p && p.name ? `#${p.num} ${p.name}` : `#${num}`;
  }

  // --- Persistence (project save/load goes through StorageManager) ---

  toJSON() { return this.players; }

  loadFrom(arr) {
    this.players = Array.isArray(arr) ? arr.filter(p => p && p.num != null) : [];
    this._save();
    this.renderList();
    this.renderQuickPick();
  }

  _save() {
    try { localStorage.setItem('ffa_roster', JSON.stringify(this.players)); } catch (e) {}
  }

  _load() {
    try {
      const raw = localStorage.getItem('ffa_roster');
      if (raw) this.players = JSON.parse(raw) || [];
    } catch (e) { this.players = []; }
  }

  // --- Rendering ---

  renderList() {
    if (!this.listEl) return;
    if (this.players.length === 0) {
      this.listEl.innerHTML = '<div class="roster-empty">No players yet. Add jersey numbers to chart per-player stats.</div>';
      return;
    }
    this.listEl.innerHTML = '';
    this.players.forEach(p => {
      const row = document.createElement('div');
      row.className = 'roster-row';
      const meta = [p.pos, p.side && p.side !== 'B' ? p.side : ''].filter(Boolean).join(' · ');
      row.innerHTML = `
        <span class="roster-num">#${p.num}</span>
        <span class="roster-name">${p.name || '<em>unnamed</em>'}</span>
        <span class="roster-meta">${meta}</span>
        <button class="roster-del" title="Remove" data-num="${p.num}">&times;</button>`;
      row.querySelector('.roster-del').addEventListener('click', () => this.removePlayer(p.num));
      this.listEl.appendChild(row);
    });
  }

  /** Players relevant to the active role: offense roles show O/B, tackler shows D/B. */
  _playersForRole(role) {
    const wantSide = role === 'tackler' ? 'D' : 'O';
    const filtered = this.players.filter(p => p.side === wantSide || p.side === 'B' || !p.side);
    return filtered.length ? filtered : this.players;
  }

  renderQuickPick() {
    if (!this.quickPickEl) return;
    if (this.players.length === 0) {
      this.quickPickEl.innerHTML = '<span class="quickpick-hint">Add players in the Roster panel for one-tap entry.</span>';
      return;
    }
    this.quickPickEl.innerHTML = '';
    this._playersForRole(this.activeRole).forEach(p => {
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = 'pick pick-sm quickpick-chip';
      chip.dataset.num = p.num;
      chip.textContent = p.name ? `${p.num} ${p.name.split(' ')[0]}` : p.num;
      chip.title = this.getLabel(p.num);
      chip.addEventListener('click', () => this._stamp(p.num));
      this.quickPickEl.appendChild(chip);
    });
    this.refreshActiveChips();
  }

  _stamp(num) {
    const input = this.roleInputs[this.activeRole];
    if (!input) return;
    num = String(num);
    if (this.multiRoles.has(this.activeRole)) {
      // Toggle membership in the jersey list (shared tackles).
      const list = input.value.match(/\d+/g) || [];
      const i = list.indexOf(num);
      if (i >= 0) list.splice(i, 1); else list.push(num);
      input.value = list.join(', ');
    } else {
      // Single-value role: toggle off if re-tapping the same number.
      input.value = (input.value.trim() === num) ? '' : num;
    }
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this.refreshActiveChips();
  }

  _markActiveRole() {
    document.querySelectorAll('.player-role').forEach(el => {
      el.classList.toggle('active', el.dataset.role === this.activeRole);
    });
    this.renderQuickPick();
  }

  /** Highlight chips that match the current value(s) of the active role input. */
  refreshActiveChips() {
    if (!this.quickPickEl) return;
    const set = new Set((this.roleInputs[this.activeRole]?.value || '').match(/\d+/g) || []);
    this.quickPickEl.querySelectorAll('.quickpick-chip').forEach(chip => {
      chip.classList.toggle('active', set.has(String(chip.dataset.num)));
    });
  }

  // --- Import from CSV / paste ---

  _bindImport() {
    const toggleBtn = document.getElementById('btnRosterImport');
    const area = document.getElementById('rosterImportArea');
    const applyBtn = document.getElementById('btnRosterImportApply');
    const textarea = document.getElementById('rosterImportText');
    const fileInput = document.getElementById('rosterImportFile');
    const msgEl = document.getElementById('rosterImportMsg');

    if (toggleBtn && area) {
      toggleBtn.addEventListener('click', () => {
        area.classList.toggle('hidden');
      });
    }

    if (applyBtn && textarea && msgEl) {
      applyBtn.addEventListener('click', () => {
        const text = textarea.value;
        const count = this.importFromText(text);
        msgEl.textContent = count > 0
          ? `Imported ${count} player${count !== 1 ? 's' : ''}.`
          : 'No players found. Check format.';
        msgEl.classList.remove('hidden');
        textarea.value = '';
        setTimeout(() => msgEl.classList.add('hidden'), 3000);
      });
    }

    if (fileInput && textarea) {
      fileInput.addEventListener('change', () => {
        const file = fileInput.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => { textarea.value = reader.result; };
        reader.readAsText(file);
        fileInput.value = '';
      });
    }
  }

  /**
   * Parse pasted/CSV text and add players to the roster.
   * Returns the number of players added or updated.
   */
  importFromText(text) {
    if (!text || !text.trim()) return 0;

    const lines = text.split(/\r?\n/).filter(l => l.trim());
    if (lines.length === 0) return 0;

    // Detect delimiter: tab > semicolon > comma
    const firstLines = lines.slice(0, Math.min(3, lines.length)).join('\n');
    let delim = ',';
    if (firstLines.includes('\t')) delim = '\t';
    else if (firstLines.includes(';')) delim = ';';

    // Parse all lines into arrays of trimmed cells
    const rows = lines.map(line => line.split(delim).map(c => c.trim()));

    // Try to detect a header row
    const headerAliases = {
      num: ['#', 'num', 'number', 'jersey'],
      name: ['name', 'player'],
      pos: ['pos', 'position'],
      side: ['side', 'unit'],
    };

    let colMap = null; // { num: idx, name: idx, pos: idx, side: idx }
    let dataStart = 0;

    if (rows.length > 0) {
      const firstRow = rows[0].map(c => c.toLowerCase().replace(/[^a-z#]/g, ''));
      const detected = {};
      for (const [field, aliases] of Object.entries(headerAliases)) {
        const idx = firstRow.findIndex(cell => aliases.includes(cell));
        if (idx !== -1) detected[field] = idx;
      }
      // Consider it a header if at least "num" or "name" was found
      if (detected.num !== undefined || detected.name !== undefined) {
        colMap = detected;
        dataStart = 1;
      }
    }

    let count = 0;
    for (let i = dataStart; i < rows.length; i++) {
      const cells = rows[i];
      if (cells.length === 0 || (cells.length === 1 && !cells[0])) continue;

      let num, name, pos, side;

      if (colMap) {
        num = colMap.num !== undefined ? cells[colMap.num] : '';
        name = colMap.name !== undefined ? cells[colMap.name] : '';
        pos = colMap.pos !== undefined ? cells[colMap.pos] : '';
        side = colMap.side !== undefined ? cells[colMap.side] : '';
      } else {
        // Assume columns in order: num, name, pos, side
        num = cells[0] || '';
        name = cells[1] || '';
        pos = cells[2] || '';
        side = cells[3] || '';
      }

      num = num.replace(/^#/, '').trim();
      // Skip rows where num is empty or non-numeric
      if (!num || !/^\d+$/.test(num)) continue;

      // Normalize side
      side = (side || '').trim().toUpperCase();
      if (side === 'OFF' || side === 'OFFENSE') side = 'O';
      else if (side === 'DEF' || side === 'DEFENSE') side = 'D';
      else if (side !== 'O' && side !== 'D' && side !== 'B') side = 'B';

      this.addPlayer(num, name.trim(), pos.trim(), side);
      count++;
    }

    return count;
  }
}
