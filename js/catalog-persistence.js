/**
 * CatalogPersistence makes the SQLite catalog the one canonical season store on
 * desktop. It owns only orchestration (the canonical write and the recovery
 * mirror); all filesystem access is injected, so the
 * canonical write path is tested in Node (tools/e2e-catalog-persistence.mjs)
 * with a fake fs and real sql.js.
 *
 * Model: one library-wide db (`seasons/library.db`) held open in memory; every
 * save re-exports its bytes to disk.
 *
 * Per-season `season.json` is not data: nothing here reads or writes it, and
 * a leftover file is never imported. The Documents mirror is a recovery snapshot written after a
 * successful commit, never read by a normal load; recovering from it is the
 * explicit, previewed, confirmed recovery flow. A load with no db row returns
 * null; there is no weaker fallback source.
 *
 *   const cp = new CatalogPersistence({ catalog, fs });   // catalog = opened SqlCatalog
 *   await cp.saveSeason(id, seasonObject);
 *   const { data, source } = (await cp.loadSeason(id)) || {};
 *
 * Injected `fs` adapter (all async):
 *   readDb()            -> Uint8Array | null   (null only for a confirmed-absent file;
 *                                                any other failure throws)
 *   writeDb(bytes)      -> void                (canonical write; a failure propagates)
 *   writeMirror(id,data)-> void  (optional)    (Documents recovery snapshot; failures swallowed)
 */
export class CatalogPersistence {
  constructor({ catalog, fs }) {
    if (!catalog || typeof catalog.saveSeason !== 'function') throw new TypeError('CatalogPersistence requires a SqlCatalog');
    if (!fs || typeof fs.readDb !== 'function' || typeof fs.writeDb !== 'function') throw new TypeError('CatalogPersistence requires an fs adapter (readDb/writeDb)');
    this.catalog = catalog;
    this.fs = fs;
    this._loaded = false;   // has the shared db been opened from disk this session?
    this._tail = Promise.resolve();
  }

  /**
   * One writer at a time. Every mutation changes the shared in-memory db and
   * exports all of it; unserialized, a slower earlier write could land last and
   * lose a later one, and a rollback could undo someone else's change. Each
   * mutation's snapshot, change, disk write and rollback run inside this queue.
   * Reads are not queued; no queued method calls another.
   */
  _exclusive(fn) {
    const run = this._tail.then(fn, fn);
    this._tail = run.then(() => {}, () => {});
    return run;
  }

  /**
   * Open the shared db from disk once. No bytes on disk opens a clean db; bytes
   * that exist but fail to read or open throw. Treating an unreadable db as
   * empty would show "no seasons" and invite overwriting the library, so the
   * failure stays visible and recovery can be offered.
   */
  async _ensureLoaded() {
    if (this._loaded && this.catalog.db) return;
    const bytes = await this.fs.readDb();   // null = confirmed fresh install; anything else it throws propagates
    if (bytes && bytes.length) {
      await this.catalog.open(bytes);   // real bytes that fail to open MUST throw
    } else {
      await this.catalog.open();        // nothing has ever existed to be corrupted
    }
    this._loaded = true;
  }

  /**
   * Canonical save: upsert the season, export the db bytes to disk, then write
   * the best-effort Documents mirror. Returns true only when the db write is
   * durable. The mirror is written only after that, so a rejected payload never
   * reaches it. A failed disk write reopens the catalog from the pre-mutation
   * bytes, so memory never keeps data that is not on disk.
   */
  async saveSeason(id, data) {
    return this._exclusive(async () => {
      if (!id || !data || !Array.isArray(data.games)) return false;
      // A save has exactly one owner. Allowing the scoped backend id and the
      // payload id to disagree can split one logical save across two seasons:
      // SqlCatalog keys by data.id while the JSON fallback keys by `id`.
      // Fail before opening or writing either store.
      if (data.id && String(data.id) !== String(id)) return false;
      await this._ensureLoaded();
      let snapshot = null;
      try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
      // A mutation without rollback bytes can turn a later write failure into an
      // empty in-memory catalog (`open(undefined)`). Refuse before touching state.
      if (!snapshot || !snapshot.length) return false;
      data.id = id;
      this.catalog.setCurrentSeason(id);
      if (!this.catalog.saveSeason(data)) return false;
      let okDb = false;
      try { await this.fs.writeDb(this.catalog.toBytes()); okDb = true; } catch (e) { okDb = false; }
      if (!okDb) {
        // The on-disk db is unchanged (write failed); re-sync memory to it so
        // the in-memory catalog cannot diverge from disk, mirroring
        // deleteSeason()'s own rollback shape. A failed canonical commit must
        // produce zero writes anywhere -- json, mirror, or the in-memory
        // catalog itself.
        try {
          this.catalog.close();
          await this.catalog.open(snapshot && snapshot.length ? snapshot : undefined);
          this._loaded = true;
        } catch (e2) {
          this._loaded = false;
          try { await this._ensureLoaded(); } catch (e3) {}   // last-ditch: re-read disk
        }
        return false;
      }
      // The Documents mirror is the only sidecar, written after the db write
      // is durable; a normal load never reads it.
      if (this.fs.writeMirror) { try { await this.fs.writeMirror(id, data); } catch (e) {} }
      return true;
    });
  }

  /** Canonical library metadata. The catalog, not library.json, owns truth. */
  async listSeasons() {
    await this._ensureLoaded();
    return this.catalog.listSeasons();
  }

  /**
   * Rebuild the Documents recovery snapshots from the catalog once per
   * session.
   */
  async reconcileFallbacks() {
    if (this._fallbacksReconciled) return this.listSeasons();
    await this._ensureLoaded();
    const metas = this.catalog.listSeasons();
    if (this.fs.writeMirror) {
      for (const meta of metas) {
        let data = null;
        try { data = this.catalog.loadSeason(meta.id); } catch (e) { data = null; }
        if (!data || String(data.id || '') !== String(meta.id)) continue;
        try { await this.fs.writeMirror(meta.id, data); } catch (e) {}
      }
    }
    this._fallbacksReconciled = true;
    return metas;
  }

  /**
   * Load from the canonical db only. Returns { data, source: 'db' }, or null
   * when the season has no row. A row that fails to read throws, so a caller
   * never mistakes it for an absent season. No sidecar is ever spliced back in.
   */
  async loadSeason(id) {
    if (!id) return null;
    await this._ensureLoaded();
    // No row is null (absent). A row that fails to read THROWS: reporting it
    // absent opened the season empty, and the next save replaced its plays.
    const fromDb = this.catalog.loadSeason(id);
    if (fromDb && Array.isArray(fromDb.games)) return { data: fromDb, source: 'db' };
    return null;
  }

  async touchOpened(id) {
    return this._exclusive(async () => {
      if (!id) return false;
      await this._ensureLoaded();
      try {
        this.catalog.touchOpened(id);
        await this.fs.writeDb(this.catalog.toBytes());
        return true;
      } catch (e) { return false; }
    });
  }

  /**
   * Remove a season from the db + persist. Returns TRUE only when the canonical
   * db delete is durable on disk. On a writeDb failure the season has been
   * dropped from the in-memory catalog but NOT from disk — we re-sync memory to
   * disk (reopen from the unchanged bytes) so there is no split-brain, and return
   * FALSE so the caller keeps the Documents-mirror safety copy in place
   * (deleting it against a stale on-disk db would let the season resurrect).
   */
  async deleteSeason(id) {
    return this._exclusive(async () => {
      await this._ensureLoaded();
      // Snapshot the PRE-DELETE db bytes so rollback restores memory from RAM, not
      // from disk — a writeDb failure can be accompanied by a transient readDb
      // failure, and re-reading a failing disk would blank the whole catalog.
      let snapshot = null;
      try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
      if (!snapshot || !snapshot.length) return false;
      try {
        this.catalog.deleteSeason(id);
        await this.fs.writeDb(this.catalog.toBytes());
        return true;
      } catch (e) {
        // The on-disk db is unchanged (write failed); re-sync memory to it from the
        // snapshot so there is no split-brain, independent of readDb succeeding.
        try {
          this.catalog.close();
          await this.catalog.open(snapshot && snapshot.length ? snapshot : undefined);
          this._loaded = true;
        } catch (e2) {
          this._loaded = false;
          try { await this._ensureLoaded(); } catch (e3) {}   // last-ditch: re-read disk
        }
        return false;
      }
    });
  }

  // ---- backup ring (canonical, in the shared db) ---------------------------
  // Restore points are rows in the shared db (SqlCatalog.backups, pruned to
  // RETENTION); every mutation re-exports the db bytes. Ids pass straight to
  // the catalog's explicit-seasonId methods. deleteBackup() swallows a write
  // failure (a leftover row is harmless). createBackup() does not: a backup
  // that never reached disk is not a backup, so on a failed write it reopens
  // from the pre-mutation bytes and returns null. Callers that only accompany
  // a canonical save ignore the result, so a failed backup never blocks a save.
  async createBackup(id, data, label) {
    return this._exclusive(async () => {
      if (!id || !data) return null;
      await this._ensureLoaded();
      let snapshot = null;
      try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
      if (!snapshot || !snapshot.length) return null;
      let bid = null;
      try { bid = this.catalog.createBackup(id, data, label || 'Save'); }
      catch (e) { return null; }
      try {
        await this.fs.writeDb(this.catalog.toBytes());
        return bid;
      } catch (e) {
        try {
          this.catalog.close();
          await this.catalog.open(snapshot && snapshot.length ? snapshot : undefined);
          this._loaded = true;
        } catch (e2) {
          this._loaded = false;
          try { await this._ensureLoaded(); } catch (e3) {}   // last-ditch: re-read disk
        }
        return null;
      }
    });
  }
  async listBackups(id) {
    if (!id) return [];
    await this._ensureLoaded();
    try { return this.catalog.listBackups(id); } catch (e) { return []; }
  }
  async getBackup(id, backupId) {
    if (!id || !backupId) return null;
    await this._ensureLoaded();
    try { return this.catalog.getBackup(id, backupId); } catch (e) { return null; }
  }
  async deleteBackup(id, backupId) {
    return this._exclusive(async () => {
      if (!id || !backupId) return;
      await this._ensureLoaded();
      try { this.catalog.deleteBackup(id, backupId); } catch (e) { return; }
      try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
    });
  }

  // ---- version history (named save points, in the shared db) ---------------
  // Rows keyed by (seasonId, gameId). A save point that never reaches disk is
  // not one, so writes follow createBackup()'s rollback shape.
  async _durably(mutate) {
    return this._exclusive(async () => {
      await this._ensureLoaded();
      let snapshot = null;
      try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
      if (!snapshot || !snapshot.length) return { ok: false };
      const rollback = async () => {
        try { this.catalog.close(); await this.catalog.open(snapshot); this._loaded = true; }
        catch (e) { this._loaded = false; try { await this._ensureLoaded(); } catch (err) {} }
      };
      let value;
      try { value = mutate(); }
      catch (e) {
        console.error('Catalog version write failed', e);
        await rollback();
        return { ok: false };
      }
      try {
        await this.fs.writeDb(this.catalog.toBytes());
        return { ok: true, value };
      } catch (e) {
        console.error('Catalog version write did not reach disk', e);
        await rollback();
        return { ok: false };
      }
    });
  }
  async saveVersion(seasonId, gameId, v) {
    if (!seasonId || !gameId || !v) return null;
    const r = await this._durably(() => this.catalog.saveVersion(seasonId, gameId, v));
    return r.ok ? r.value : null;
  }
  async listVersions(seasonId, gameId) {
    if (!seasonId || !gameId) return [];
    await this._ensureLoaded();
    try { return this.catalog.listVersions(seasonId, gameId); } catch (e) { return []; }
  }
  // Explicit identity: seasonId/gameId go straight to SqlCatalog.
  async getVersionScoped(seasonId, gameId, id) {
    if (!seasonId || !gameId || id == null) return null;
    await this._ensureLoaded();
    try { return this.catalog.getVersionScoped(seasonId, gameId, id); } catch (e) { return null; }
  }
  async deleteVersionScoped(seasonId, gameId, id) {
    if (!seasonId || !gameId || id == null) return false;
    const r = await this._durably(() => this.catalog.deleteVersionScoped(seasonId, gameId, id));
    return r.ok && r.value === true;
  }

}
