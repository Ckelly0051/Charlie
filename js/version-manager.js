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
    // Versions are per-GAME (see _key): when a different game loads, show ITS
    // list and restart the edit counter so game B doesn't inherit A's tally.
    this.tagger.on('plays-loaded', () => { this.changeCount = 0; this.renderList(); });
  }

  /**
   * Versions are scoped to the season + game they were taken in. The old key
   * ('ffa_versions_' + videoFileName) collided: videoFileName is null on the
   * web build after a reopen, so EVERY game shared 'ffa_versions_default' and
   * a restore could stamp another game's plays onto the current one — a third
   * cross-game corruption path (alongside the commitActive and undo ones).
   * Old shared-key entries are deliberately orphaned rather than migrated:
   * they carry no game identity, and guessing is the exact bug being fixed.
   */
  _key() {
    const s = this.storage && this.storage.seasonStore;
    const sid = (s && s.currentSeasonId) || 'na';
    const gid = (s && s.data && s.data.activeGameId) || 'na';
    return `ffa_versions_${sid}::${gid}`;
  }

  _list() {
    try { return JSON.parse(localStorage.getItem(this._key()) || '[]'); }
    catch { return []; }
  }

  /** DOM-independent list seam used by native Recovery settings. */
  list() { return this._list().map(version => ({ ...version, data: undefined })); }

  _save(versions) {
    try { localStorage.setItem(this._key(), JSON.stringify(versions)); }
    catch (e) { /* quota — silently drop */ }
  }

  snapshot(label, manual = false) {
    const data = this.storage._serialize();
    const versions = this._list();
    const s = this.storage && this.storage.seasonStore;
    // Monotonic id: two snapshots in the same millisecond (e.g. a restore
    // immediately followed by its "backup before restore") would share Date.now()
    // and the second _save would clobber the first in the list — losing a version.
    const id = Math.max(Date.now(), (this._lastVersionId || 0) + 1);
    this._lastVersionId = id;
    versions.push({
      id,
      label: label || (manual ? 'Manual save' : 'Auto-save'),
      time: new Date().toISOString(),
      manual,
      playCount: data.plays.length,
      // Provenance stamp — restore() refuses a version taken in another
      // season/game even if a future key change reintroduces sharing.
      seasonId: (s && s.currentSeasonId) || 'na',
      gameId: (s && s.data && s.data.activeGameId) || 'na',
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
    return id;
  }

  async restore(id) {
    const v = this._list().find(x => x.id === id);
    if (!v) return false;
    // Never restore across a season/game boundary: v.data is a whole-tagger
    // snapshot, and deserializing another game's snapshot here would hand the
    // next commit that game's plays as THIS game's content.
    const s = this.storage && this.storage.seasonStore;
    const sid = (s && s.currentSeasonId) || 'na';
    const gid = (s && s.data && s.data.activeGameId) || 'na';
    if ((v.seasonId && v.seasonId !== sid) || (v.gameId && v.gameId !== gid)) {
      this.tagger.toast?.('That version belongs to a different game — open that game to restore it.');
      return false;
    }
    const ok = await this.tagger._confirmDialog(
      `Restore version "${v.label}" (${v.playCount} plays)? A backup of your current state is saved first.`,
      'Restore Version');
    if (!ok) return false;
    const prior = this.storage._serialize();
    this.snapshot('Backup before restore', false);
    this.storage._deserialize(v.data);
    // Undo history is per-game state; re-baseline it the same way a game load does.
    if (window.app && window.app.history && window.app.history.reset) window.app.history.reset();
    // Persist the restored state through the normal guarded path so the season
    // store and disk reflect what's on screen (a crash before the next edit
    // would otherwise resurrect the pre-restore data).
    this.storage.commitActive();
    const persisted = s ? await s.persist() : true;
    if (persisted === false) {
      this.storage._deserialize(prior);
      this.storage.commitActive();
      if (window.app?.history?.reset) window.app.history.reset();
      this.tagger.toast?.('Version restore failed. Your current game was kept.');
      return false;
    }
    return true;
  }

  async delete(id) {
    const ok = await this.tagger._confirmDialog('Delete this version?', 'Delete Version');
    if (!ok) return;
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
