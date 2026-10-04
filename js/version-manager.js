import { SeasonFormat } from './season-format.js';
/**
 * VersionManager: per-game save points (named and automatic), stored by the
 * storage backend: the SQLite catalog on desktop, IndexedDB in a browser,
 * never localStorage (whole-game snapshots would exhaust its quota).
 *
 * Snapshots are taken:
 *   - manually (Settings > Recovery > Save game version, with a label)
 *   - automatically every N play edits (default 10)
 *   - automatically every M minutes if any changes occurred (default 5)
 *
 * Capped at 20 per game by the backend; automatic saves are evicted before
 * named ones. Settings > Recovery is the only presentation owner.
 */
export class VersionManager {
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

  /** True while `scope` is still the open season and game AND the live tagger
   *  holds that game. Every await in a restore can let the coach switch. */
  _inScope(scope) {
    const now = this._scope();
    return !!(scope && now && now.seasonId === scope.seasonId && now.gameId === scope.gameId
      && this.storage._loadedGameId === scope.gameId);
  }

  /** Resolves to the new version id, or null when nothing durable was written.
   *  `expected` pins the snapshot to a season and game; it refuses otherwise. */
  async snapshot(label, manual = false, expected = null) {
    const scope = this._scope(), backend = this._backend();
    if (!scope || !backend) return null;
    if (expected && !this._inScope(expected)) return null;
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
    // Each wait below can let the coach open another game. The restore belongs
    // to the game it started on; once that changes it stops before anything is
    // backed up or replaced.
    const moved = () => {
      if (this._inScope(scope)) return false;
      this.tagger.toast?.('Version restore stopped: the game changed. Nothing was replaced.');
      return true;
    };
    // Scoped read: a version belongs to exactly one season::game, so another
    // game's snapshot can never be deserialized over the open one.
    let versions = [];
    try { versions = await backend.listVersions(scope.seasonId, scope.gameId); } catch (e) {}
    const meta = (versions || []).find(v => String(v.id) === String(id));
    const data = meta ? await backend.getVersion(scope.seasonId, scope.gameId, String(id)) : null;
    if (moved()) return false;
    if (!meta || !data) {
      this.tagger.toast?.('That version is not available for this game.');
      return false;
    }
    // An old-format version is refused before the confirmation, so nothing
    // is backed up or replaced.
    if (!SeasonFormat.isCurrentGame(data)) {
      this.tagger.toast?.(SeasonFormat.RESTORE_MESSAGE);
      return false;
    }
    const ok = await this.tagger._confirmDialog(
      `Restore version "${meta.label}" (${meta.playCount} plays)? A backup of your current state is saved first.`,
      'Restore Version');
    if (!ok || moved()) return false;
    const prior = this.storage._serialize();
    // The dialog promised a backup. Without a durable one, nothing is replaced.
    const backup = await this.snapshot('Backup before restore', false, scope);
    if (moved()) return false;
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
      // The rollback, like the restore, belongs only to the game it started on.
      if (!this._inScope(scope)) {
        this.tagger.toast?.('Version restore was not saved. Reopen that game to check it.');
        return false;
      }
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
