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
    };

    this._load();
    this._bind();
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
    // Toggle off if the same number is already set for this role.
    input.value = (input.value.trim() === String(num)) ? '' : String(num);
    input.dispatchEvent(new Event('change', { bubbles: true }));
    this.refreshActiveChips();
  }

  _markActiveRole() {
    document.querySelectorAll('.player-role').forEach(el => {
      el.classList.toggle('active', el.dataset.role === this.activeRole);
    });
    this.renderQuickPick();
  }

  /** Highlight chips that match the current value of the active role input. */
  refreshActiveChips() {
    if (!this.quickPickEl) return;
    const cur = this.roleInputs[this.activeRole]?.value.trim();
    this.quickPickEl.querySelectorAll('.quickpick-chip').forEach(chip => {
      chip.classList.toggle('active', chip.dataset.num === cur);
    });
  }
}
