import { SpecialTeamsModel } from './special-teams.js';
/**
 * RosterManager — the team roster and the charting deck's active player role.
 *
 * Owns the roster (jersey #, name, position, side), CSV/paste import and the
 * depth-chart print, all driven from Settings > Roster, and the role the deck's
 * player chips stamp (`activeRole`, defaulted from the selected play's unit).
 * The deck itself renders the chips (native-tagging.jsx). The old imperative
 * roster list, quick-pick bar and add/import forms wrote into elements that no
 * longer exist and were deleted 2026-09-27.
 *
 * The active season owns the roster. StorageManager hydrates this service when
 * a season opens and writes edits back to that season. Per-play attribution
 * lives on play.tags.players and is handled by PlayTagger.
 */
export class RosterManager {
  constructor(tagger) {
    this.tagger = tagger;
    this.players = [];           // [{ num, name, pos, side }] side: 'O'|'D'|'B'
    this.activeRole = 'ballCarrier';

    // Roles that accept multiple jersey #s (e.g. shared/assisted tackles).
    // Stamping toggles membership in a comma-separated list instead of
    // replacing the single value.
    this.multiRoles = new Set(['tackler']);

    this._bind();
  }

  /**
   * Open a printable depth chart: the roster grouped by side (Offense / Defense /
   * Other) and position, players ordered by jersey #. Read-only — the order is
   * the roster order; explicit per-position reordering is a future nicety.
   */
  exportDepthChart() {
    if (!this.players.length) { alert('Add players to the roster first.'); return; }
    let team = 'Team';
    try { team = (JSON.parse(localStorage.getItem('ffa_team_profile') || '{}') || {}).teamName || 'Team'; } catch (e) {}
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const ORDER = { O: ['QB', 'RB', 'FB', 'HB', 'WR', 'TE', 'OL', 'C', 'G', 'T', 'OT', 'OG'], D: ['DL', 'DE', 'DT', 'NT', 'EDGE', 'LB', 'OLB', 'ILB', 'MLB', 'CB', 'S', 'FS', 'SS', 'DB'] };
    const sideName = { O: 'Offense', D: 'Defense', X: 'Other / Special' };
    const col = (sideKey) => {
      const byPos = {};
      this.players.filter(p => (sideKey === 'X' ? !['O', 'D'].includes(p.side) : p.side === sideKey))
        .forEach(p => { const pos = (p.pos || '—').toUpperCase(); (byPos[pos] = byPos[pos] || []).push(p); });
      const positions = Object.keys(byPos).sort((a, b) => {
        const o = ORDER[sideKey] || []; const ia = o.indexOf(a), ib = o.indexOf(b);
        return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib) || a.localeCompare(b);
      });
      if (!positions.length) return '';
      const blocks = positions.map(pos => {
        const players = byPos[pos].slice().sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0))
          .map(p => `<div class="pl">#${esc(p.num)} ${esc(p.name) || ''}</div>`).join('');
        return `<div class="pos"><div class="pos-name">${esc(pos)}</div>${players}</div>`;
      }).join('');
      return `<div class="col"><h2>${sideName[sideKey]}</h2>${blocks}</div>`;
    };
    const cols = ['O', 'D', 'X'].map(col).filter(Boolean).join('');
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Depth Chart — ${esc(team)}</title>
      <style>*{box-sizing:border-box}body{font-family:-apple-system,Helvetica,Arial,sans-serif;margin:0;padding:16px;color:#000;background:#fff}
      h1{font-size:18px;margin:0 0 12px}.cols{display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:14px}
      .col h2{font-size:12px;margin:0 0 6px;padding:4px 8px;background:#1e293b;color:#fff;text-transform:uppercase;letter-spacing:.5px}
      .pos{border:1px solid #cbd5e1;border-radius:6px;padding:6px 8px;margin-bottom:8px;break-inside:avoid}
      .pos-name{font-size:11px;font-weight:700;color:#3b82f6;text-transform:uppercase;letter-spacing:.4px;margin-bottom:3px}
      .pl{font-size:13px;padding:1px 0}@media print{body{padding:0}}</style></head>
      <body><h1>Depth Chart — ${esc(team)}</h1><div class="cols">${cols}</div></body></html>`;
    const w = window.open('', '_blank');
    if (!w) { alert('Popup blocked — allow popups and try again.'); return; }
    w.document.open(); w.document.write(html); w.document.close();
    setTimeout(() => { try { w.focus(); w.print(); } catch (e) {} }, 400);
  }

  _bind() {
    // Default the stamped role to the play's unit (defense → tackler, ST →
    // kicker/returner) — otherwise every defensive series silently stamps Ball
    // Carrier until the coach remembers to pick the Tackler role first.
    if (this.tagger) {
      this.tagger.on('play-selected', (play) => {
        this._defaultRoleForUnit(play?.tags?.unit);
      });
      this.tagger.on('play-updated', (play) => {
        // Unit toggle changes arrive as play-updated; follow them too.
        if (play && play.id === this.tagger.currentPlayId) {
          this._defaultRoleForUnit(play.tags?.unit);
        }
      });
    }
  }

  /** Pick the natural stamping role for the play's unit. */
  _defaultRoleForUnit(unit) {
    // Defense with an INT/Fumble result → the next # the coach taps is almost
    // always the defender who made the takeaway, not a tackler.
    const cur = this.tagger?.getCurrentPlay();
    const turnover = unit === 'defense' && /Interception|Fumble/.test(String(cur?.tags?.result || ''));
    const wanted = unit === 'defense' ? (turnover ? 'takeaway' : 'tackler')
      : unit === 'special' ? SpecialTeamsModel.playerRoles(cur?.specialTeams)[0]
      : 'ballCarrier';
    this.activeRole = wanted;
  }

  // --- Roster CRUD ---

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
    this.players.sort((a, b) => (parseInt(a.num, 10) || 0) - (parseInt(b.num, 10) || 0));
    this._save();
  }

  removePlayer(num) {
    this.players = this.players.filter(p => p.num !== String(num));
    this._save();
  }

  /** "#22 Smith" when named, else "#22" — used by the stats tables. */
  getLabel(num) {
    const p = this.players.find(pl => pl.num === String(num));
    return p && p.name ? `#${p.num} ${p.name}` : `#${num}`;
  }

  // --- Persistence (project save/load goes through StorageManager) ---

  toJSON() { return this.players; }

  loadFrom(arr, { persist = true } = {}) {
    this.players = Array.isArray(arr) ? arr.filter(p => p && p.num != null) : [];
    if (persist) this._save();
  }

  _save() {
    window.app?.storage?.updateSeasonRoster?.(this.players);
  }

  // --- Import from CSV / paste ---

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
