import { SeasonFormat } from './season-format.js';
/**
 * VersionManager - per-game save points (named and automatic), stored by the
 * storage backend: the SQLite catalog on the desktop, IndexedDB in a browser.
 *
 * Snapshots are taken:
 *   - manually (Settings > Recovery > Save game version, with a label)
 *   - automatically every N play edits (default 10)
 *   - automatically every M minutes if any changes occurred (default 5)
 *
 * Capped at 20 per game by the backend; automatic saves are evicted before
 * named ones.
 *
 * HISTORY (2026-09-24). These snapshots used to live in localStorage under
 * `ffa_versions_<season>::<game>`. A whole-game snapshot is tens of KB and a
 * game keeps up to 20, so they filled the WebView's ~5 MB origin quota; after
 * that EVERY small settings write in the app failed (the installed `Could not
 * save that choice` finding) while this class dropped its own writes silently.
 * `migrateLegacy()` moves each scoped key into the backend and removes the
 * localStorage copy only after every version reads back identical. The
 * pre-2026 unscoped `ffa_versions_default` / `ffa_versions_<file>` keys carry no
 * game identity; they are deliberately left untouched (see `_key()`'s history in
 * git) and never read.
 *
 * The old list renderer (#versionList, #btnSaveVersion) is gone: no such DOM
 * exists, and Settings > Recovery is the only presentation owner.
 */
export class VersionManager {
  static LEGACY_PREFIX = 'ffa_versions_';

  constructor(storage, tagger) {
    this.storage = storage;
    this.tagger = tagger;
    this.changeCount = 0;
    this.changesPerSnap = 10;
    this.intervalMin = 5;
    this._bindEvents();
    this._startTimer();
  }

  _bindEvents() {
    this.tagger.on('play-created', () => this._maybeAutoSnap());
    this.tagger.on('play-updated', () => this._maybeAutoSnap());
    this.tagger.on('play-deleted', () => this._maybeAutoSnap());
    // Versions are per GAME: a different game restarts the edit counter so game
    // B doesn't inherit A's tally.
    this.tagger.on('plays-loaded', () => { this.changeCount = 0; });
  }

  _store() { return this.storage && this.storage.seasonStore; }
  _backend() { return this._store()?.backend || null; }
  /** The open season and game, or null when either is missing. */
  _scope() {
    const s = this._store();
    const seasonId = s && s.currentSeasonId;
    const gameId = s && s.data && s.data.activeGameId;
    return seasonId && gameId ? { seasonId, gameId } : null;
  }

  /** The open game's versions, newest last, without their snapshot data. */
  async list() {
    const scope = this._scope(), backend = this._backend();
    if (!scope || !backend) return [];
    try { return await backend.listVersions(scope.seasonId, scope.gameId); } catch (e) { return []; }
  }

  /** Resolves to the new version id, or null when nothing durable was written. */
  async snapshot(label, manual = false) {
    const scope = this._scope(), backend = this._backend();
    if (!scope || !backend) return null;
    const data = this.storage._serialize();
    // Monotonic id: two snapshots in the same millisecond (a restore and its
    // "Backup before restore") must not share an id and overwrite each other.
    const id = Math.max(Date.now(), (this._lastVersionId || 0) + 1);
    this._lastVersionId = id;
    const saved = await backend.saveVersion(scope.seasonId, scope.gameId, {
      id: String(id),
      label: label || (manual ? 'Manual save' : 'Auto-save'),
      time: new Date().toISOString(),
      manual,
      playCount: data.plays.length,
      data,
    });
    if (!saved) console.error('Version save failed', { ...scope, label });
    return saved || null;
  }

  async restore(id) {
    const scope = this._scope(), backend = this._backend();
    if (!scope || !backend) return false;
    // Scoped read: a version belongs to exactly one season::game, so another
    // game's snapshot can never be deserialized over the open one.
    const meta = (await this.list()).find(v => String(v.id) === String(id));
    const data = meta ? await backend.getVersion(scope.seasonId, scope.gameId, String(id)) : null;
    if (!meta || !data) {
      this.tagger.toast?.('That version is not available for this game.');
      return false;
    }
    // A version saved before the 2026-09-26 conversion is in the old format:
    // refused before the confirmation, so nothing is backed up or replaced (step 6).
    if (!SeasonFormat.isCurrentGame(data)) {
      this.tagger.toast?.(SeasonFormat.RESTORE_MESSAGE);
      return false;
    }
    const ok = await this.tagger._confirmDialog(
      `Restore version "${meta.label}" (${meta.playCount} plays)? A backup of your current state is saved first.`,
      'Restore Version');
    if (!ok) return false;
    const prior = this.storage._serialize();
    // The dialog promised a backup. Without a durable one, nothing is replaced.
    const backup = await this.snapshot('Backup before restore', false);
    if (!backup) {
      this.tagger.toast?.('Version restore stopped: the current game could not be backed up first.');
      return false;
    }
    this.storage._deserialize(data);
    // Undo history is per-game state; re-baseline it the same way a game load does.
    if (window.app && window.app.history && window.app.history.reset) window.app.history.reset();
    // Persist the restored state through the normal guarded path so the season
    // store and disk reflect what's on screen.
    this.storage.commitActive();
    const s = this._store();
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
    const scope = this._scope(), backend = this._backend();
    if (!scope || !backend) return false;
    const ok = await this.tagger._confirmDialog('Delete this version?', 'Delete Version');
    if (!ok) return null;
    return backend.deleteVersion(scope.seasonId, scope.gameId, String(id));
  }

  /**
   * One-time move of scoped localStorage versions into the backend. For each
   * `ffa_versions_<season>::<game>` key: import every version all-or-nothing,
   * and remove the key only when the import reports every version read back
   * identical. A key that fails stays exactly as it was and is retried on the
   * next launch. Unscoped legacy keys are never touched.
   * Resolves to { moved, versions, kept, failed } for diagnosis.
   */
  async migrateLegacy(storage = (typeof localStorage !== 'undefined' ? localStorage : null)) {
    const report = { moved: [], versions: 0, kept: [], failed: [] };
    const backend = this._backend();
    if (!storage || !backend) return report;
    const keys = [];
    try { for (let i = 0; i < storage.length; i++) keys.push(storage.key(i)); } catch (e) { return report; }
    for (const key of keys) {
      if (!key || !key.startsWith(VersionManager.LEGACY_PREFIX)) continue;
      const scope = key.slice(VersionManager.LEGACY_PREFIX.length).split('::');
      if (scope.length !== 2 || !scope[0] || !scope[1] || scope[0] === 'na' || scope[1] === 'na') { report.kept.push(key); continue; }
      const [seasonId, gameId] = scope;
      let list = null;
      try { list = JSON.parse(storage.getItem(key) || 'null'); } catch (e) { list = null; }
      if (!Array.isArray(list)) { report.failed.push(key); continue; }
      // A version stamped with another season/game is not this key's to move.
      const own = list.filter(v => v && v.id != null && v.data
        && (!v.seasonId || v.seasonId === seasonId) && (!v.gameId || v.gameId === gameId));
      if (own.length !== list.length) { report.failed.push(key); continue; }
      const ok = await backend.importVersions(seasonId, gameId, own.map(v => ({ ...v, id: String(v.id) })));
      if (!ok) { report.failed.push(key); continue; }
      try { storage.removeItem(key); } catch (e) { report.failed.push(key); continue; }
      report.moved.push(key);
      report.versions += own.length;
    }
    if (report.moved.length || report.failed.length) console.info('Version history migration', report);
    return report;
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
}
