/**
 * VersionManager - Snapshot project state to localStorage and restore later.
 *
 * Snapshots are taken:
 *   - manually (Save Version button, with optional label)
 *   - automatically every N play edits (default 10)
 *   - automatically every M minutes if any changes occurred (default 5)
 *
 * Stored under ffa_versions_<videoFileName>. Capped at maxVersions; auto-saves
 * are evicted before manual saves.
 */
export class VersionManager {
  constructor(storage, tagger) {
    this.storage = storage;
    this.tagger = tagger;
    this.changeCount = 0;
    this.changesPerSnap = 10;
    this.intervalMin = 5;
    this.maxVersions = 20;

    this.listEl = document.getElementById('versionList');
    this.btnSaveVersion = document.getElementById('btnSaveVersion');
    this.versionLabelInput = document.getElementById('versionLabelInput');
    this.versionCountBadge = document.getElementById('versionCount');

    this._bindEvents();
    this._startTimer();
  }

  _bindEvents() {
    if (this.btnSaveVersion) {
      this.btnSaveVersion.addEventListener('click', () => {
        const label = (this.versionLabelInput?.value || '').trim() || 'Manual save';
        this.snapshot(label, true);
        if (this.versionLabelInput) this.versionLabelInput.value = '';
      });
    }
    this.tagger.on('play-created', () => this._maybeAutoSnap());
    this.tagger.on('play-updated', () => this._maybeAutoSnap());
    this.tagger.on('play-deleted', () => this._maybeAutoSnap());
  }

  _key() {
    return 'ffa_versions_' + (this.storage.videoFileName || 'default');
  }

  _list() {
    try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); }
    catch { return []; }
  }

  _save(versions) {
    try { localStorage.setItem(this._key(), JSON.stringify(versions)); }
    catch (e) { /* quota — silently drop */ }
  }

  snapshot(label, manual = false) {
    const data = this.storage._serialize();
    const versions = this._list();
    versions.push({
      id: Date.now(),
      label: label || (manual ? 'Manual save' : 'Auto-save'),
      time: new Date().toISOString(),
      manual,
      playCount: data.plays.length,
      data
    });

    // Evict — auto-saves go first
    while (versions.length > this.maxVersions) {
      const idx = versions.findIndex(v => !v.manual);
      if (idx >= 0) versions.splice(idx, 1);
      else versions.shift();
    }

    this._save(versions);
    this.renderList();
  }

  restore(id) {
    const v = this._list().find(x => x.id === id);
    if (!v) return;
    if (!confirm(`Restore version "${v.label}" (${v.playCount} plays)?\n\nA backup of your current state will be saved first.`)) return;
    this.snapshot('Backup before restore', false);
    this.storage._deserialize(v.data);
    if (window.app && window.app.history) {
      window.app.history.lastSnap = window.app.history._snapshot();
      window.app.history.stack = [];
      window.app.history.index = -1;
      window.app.history._updateUI();
    }
  }

  delete(id) {
    if (!confirm('Delete this version?')) return;
    const versions = this._list().filter(x => x.id !== id);
    this._save(versions);
    this.renderList();
  }

  renderList() {
    if (!this.listEl) return;
    const versions = this._list().slice().reverse();
    if (this.versionCountBadge) {
      this.versionCountBadge.textContent = `${versions.length}`;
    }
    if (!versions.length) {
      this.listEl.innerHTML = '<div class="version-empty">No saved versions yet.</div>';
      return;
    }
    this.listEl.innerHTML = '';
    for (const v of versions) {
      const row = document.createElement('div');
      row.className = 'version-row' + (v.manual ? ' manual' : '');
      const dt = new Date(v.time);
      const timeStr = dt.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      const dateStr = dt.toLocaleDateString();
      row.innerHTML = `
        <div class="version-info">
          <div class="version-label">${this._escape(v.label)}</div>
          <div class="version-meta">${dateStr} ${timeStr} · ${v.playCount} plays${v.manual ? ' · ★' : ''}</div>
        </div>
        <div class="version-actions">
          <button class="btn btn-sm" data-action="restore">Restore</button>
          <button class="btn btn-sm btn-danger" data-action="delete">×</button>
        </div>
      `;
      row.querySelector('[data-action="restore"]').addEventListener('click', () => this.restore(v.id));
      row.querySelector('[data-action="delete"]').addEventListener('click', () => this.delete(v.id));
      this.listEl.appendChild(row);
    }
  }

  _escape(s) {
    return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  _maybeAutoSnap() {
    this.changeCount++;
    if (this.changeCount >= this.changesPerSnap) {
      this.changeCount = 0;
      this.snapshot(`Auto-save (${this.tagger.plays.length} plays)`, false);
    }
  }

  _startTimer() {
    setInterval(() => {
      if (this.changeCount > 0) {
        this.changeCount = 0;
        this.snapshot(`Timed auto-save (${this.tagger.plays.length} plays)`, false);
      }
    }, this.intervalMin * 60 * 1000);
  }

  refresh() {
    this.renderList();
  }
}
