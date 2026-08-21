/**
 * CatalogPersistence — the A3 dual-write orchestrator that makes the SQLite
 * catalog the CANONICAL season store while keeping JSON as a self-healing
 * fallback. It owns ONLY the orchestration (which store wins, when to migrate,
 * best-effort mirror); ALL filesystem access is INJECTED, so the whole risky
 * canonical-write path is unit-tested in Node (tools/e2e-catalog-persistence.mjs)
 * with a fake fs + real sql.js — the Tauri desktop glue that supplies the real
 * `fs` adapter + lazy-loads the wasm is the only piece left for a manual smoke.
 *
 * MODEL: one library-wide catalog db (all seasons; the plan's `seasons/library.db`)
 * held open in memory; every save re-exports its bytes to disk AND dual-writes the
 * per-season `season.json` (app-data) + best-effort Documents mirror. This is the
 * committed migration OFF the JSON-blob-per-season model (structurally kills the
 * v1.10.7 film-index wipe) — the flag + dual-write gate only the TIMING of the
 * safe cutover (drop the JSON dual-write after a stable release), never whether.
 *
 * LOAD PREFERENCE (self-healing): db → json. A missing/corrupt db falls back to
 * the season.json and RE-MIGRATES it into the db, so the next load is canonical
 * again (lesson #19/#21: reversible + self-healing). A load never throws — a bad
 * db degrades to json; a bad json returns null, never a half-state.
 *
 *   const cp = new CatalogPersistence({ catalog, fs });   // catalog = opened SqlCatalog
 *   await cp.saveSeason(id, seasonObject);
 *   const { data, source } = (await cp.loadSeason(id)) || {};
 *
 * Injected `fs` adapter (all async, all best-effort-safe for the caller):
 *   readDb()            -> Uint8Array | null   (the shared library db bytes)
 *   writeDb(bytes)      -> void                (canonical write)
 *   readJson(id)        -> object | null       (per-season fallback)
 *   writeJson(id, data) -> void                (per-season fallback write)
 *   writeMirror(id,data)-> void  (optional)    (Documents mirror; may throw — swallowed)
 */
export class CatalogPersistence {
  constructor({ catalog, fs }) {
    if (!catalog || typeof catalog.saveSeason !== 'function') throw new TypeError('CatalogPersistence requires a SqlCatalog');
    if (!fs || typeof fs.readDb !== 'function' || typeof fs.writeDb !== 'function') throw new TypeError('CatalogPersistence requires an fs adapter (readDb/writeDb/readJson/writeJson)');
    this.catalog = catalog;
    this.fs = fs;
    this._loaded = false;   // has the shared db been opened from disk this session?
  }

  /** Open the shared library db from disk once (or a fresh db if none/corrupt). */
  async _ensureLoaded() {
    if (this._loaded && this.catalog.db) return;
    let bytes = null;
    try { bytes = await this.fs.readDb(); } catch (e) { bytes = null; }
    try {
      await this.catalog.open(bytes && bytes.length ? bytes : undefined);
    } catch (e) {
      // Corrupt db bytes — start clean; the per-season json fallback re-migrates.
      await this.catalog.open();
    }
    this._loaded = true;
  }

  /**
   * Canonical save: upsert the season into the shared db, export the db bytes to
   * disk, then dual-write season.json (fallback) + best-effort Documents mirror.
   * Returns true on a successful canonical (db) write.
   */
  async saveSeason(id, data) {
    if (!id || !data || !Array.isArray(data.games)) return false;
    // A save has exactly one owner. Allowing the scoped backend id and the
    // payload id to disagree can split one logical save across two seasons:
    // SqlCatalog keys by data.id while the JSON fallback keys by `id`.
    // Fail before opening or writing either store.
    if (data.id && String(data.id) !== String(id)) return false;
    await this._ensureLoaded();
    data.id = id;
    this.catalog.setCurrentSeason(id);
    if (!this.catalog.saveSeason(data)) return false;
    let okDb = false;
    try { await this.fs.writeDb(this.catalog.toBytes()); okDb = true; } catch (e) { okDb = false; }
    // Fallback + mirror are the safety net; never let them mask the canonical result.
    try { await this.fs.writeJson(id, data); } catch (e) {}
    if (this.fs.writeMirror) { try { await this.fs.writeMirror(id, data); } catch (e) {} }
    return okDb;
  }

  /** Canonical library metadata. The catalog, not library.json, owns truth. */
  async listSeasons() {
    await this._ensureLoaded();
    return this.catalog.listSeasons();
  }

  /** Rebuild JSON safety copies from the canonical catalog once per session. */
  async reconcileFallbacks() {
    if (this._fallbacksReconciled) return this.listSeasons();
    await this._ensureLoaded();
    const metas = this.catalog.listSeasons();
    for (const meta of metas) {
      let data = null;
      try { data = this.catalog.loadSeason(meta.id); } catch (e) { data = null; }
      if (!data || String(data.id || '') !== String(meta.id)) continue;
      try { await this.fs.writeJson(meta.id, data); } catch (e) {}
      if (this.fs.writeMirror) { try { await this.fs.writeMirror(meta.id, data); } catch (e) {} }
    }
    this._fallbacksReconciled = true;
    return metas;
  }

  /**
   * Load preferring the canonical db; fall back to season.json and re-migrate it
   * into the db so the next load is canonical. Returns { data, source } or null.
   */
  async loadSeason(id) {
    if (!id) return null;
    await this._ensureLoaded();
    try {
      const fromDb = this.catalog.loadSeason(id);
      if (fromDb && Array.isArray(fromDb.games)) return { data: fromDb, source: 'db' };
    } catch (e) { /* fall through to json */ }
    let json = null;
    try { json = await this.fs.readJson(id); } catch (e) { json = null; }
    if (json && Array.isArray(json.games)) {
      // Self-heal: migrate the json back into the canonical db for next time.
      try {
        json.id = json.id || id;
        this.catalog.setCurrentSeason(id);
        this.catalog.importSeasonJson(json);
        await this.fs.writeDb(this.catalog.toBytes());
      } catch (e) {}
      return { data: json, source: 'json' };
    }
    return null;
  }

  async touchOpened(id) {
    if (!id) return false;
    await this._ensureLoaded();
    try {
      this.catalog.touchOpened(id);
      await this.fs.writeDb(this.catalog.toBytes());
      return true;
    } catch (e) { return false; }
  }

  /**
   * Remove a season from the db + persist. Returns TRUE only when the canonical
   * db delete is durable on disk. On a writeDb failure the season has been
   * dropped from the in-memory catalog but NOT from disk — we re-sync memory to
   * disk (reopen from the unchanged bytes) so there is no split-brain, and return
   * FALSE so the caller keeps the season.json / Documents mirror safety copies
   * (deleting them against a stale on-disk db would let the season resurrect).
   */
  async deleteSeason(id) {
    await this._ensureLoaded();
    // Snapshot the PRE-DELETE db bytes so rollback restores memory from RAM, not
    // from disk — a writeDb failure can be accompanied by a transient readDb
    // failure, and re-reading a failing disk would blank the whole catalog.
    let snapshot = null;
    try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
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
  }

  // ---- backup ring (canonical, in the shared db) ---------------------------
  // The restore-ring migration: instead of a `backups/season_<ts>.json` file per
  // snapshot (the old per-season file structure), restore points live as rows in
  // the shared library db (SqlCatalog.backups, pruned to RETENTION). Every mutation
  // re-exports the db bytes so the ring is durable; a write failure is swallowed
  // (best-effort, like the mirror) — a lost restore point never blocks a save, and
  // the canonical season data is unaffected. Each op pins the season scope first.
  // PC-1: pass id straight through to the catalog's own explicit-seasonId
  // methods -- no setCurrentSeason() call needed. Closes the "below the
  // seam" half of the explicit-identity finding (js/sql-catalog.js now
  // never consults this.currentId for any of these four ops).
  async createBackup(id, data, label) {
    if (!id || !data) return null;
    await this._ensureLoaded();
    let bid = null;
    try { bid = this.catalog.createBackup(id, data, label || 'Save'); }
    catch (e) { return null; }
    try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
    return bid;
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
    if (!id || !backupId) return;
    await this._ensureLoaded();
    try { this.catalog.deleteBackup(id, backupId); } catch (e) { return; }
    try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
  }

  // ---- version history (named save points, in the shared db) ---------------
  // The version-history migration off localStorage: named/auto save-points become
  // rows keyed by (seasonId, gameId) in the shared library db. Same best-effort
  // durability as the backup ring — a lost version never blocks tagging. NOT yet
  // wired into VersionManager (dormant groundwork); the UI rewire lands later.
  async saveVersion(seasonId, gameId, v) {
    if (!seasonId || !gameId || !v) return null;
    await this._ensureLoaded();
    let id = null;
    try { id = this.catalog.saveVersion(seasonId, gameId, v); }
    catch (e) { return null; }
    try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
    return id;
  }
  async listVersions(seasonId, gameId) {
    if (!seasonId || !gameId) return [];
    await this._ensureLoaded();
    try { return this.catalog.listVersions(seasonId, gameId); } catch (e) { return []; }
  }
  async getVersion(id) {
    if (id == null) return null;
    await this._ensureLoaded();
    try { return this.catalog.getVersion(id); } catch (e) { return null; }
  }
  async deleteVersion(id) {
    if (id == null) return;
    await this._ensureLoaded();
    try { this.catalog.deleteVersion(id); } catch (e) { return; }
    try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
  }

  // PC-1: explicit-identity contract for version ownership (documented in
  // GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.3). Threads seasonId/gameId
  // straight through to SqlCatalog -- no ambient currentId, no scope call.
  async getVersionScoped(seasonId, gameId, id) {
    if (!seasonId || !gameId || id == null) return null;
    await this._ensureLoaded();
    try { return this.catalog.getVersionScoped(seasonId, gameId, id); } catch (e) { return null; }
  }
  async deleteVersionScoped(seasonId, gameId, id) {
    if (!seasonId || !gameId || id == null) return false;
    await this._ensureLoaded();
    let owned = false;
    try { owned = this.catalog.deleteVersionScoped(seasonId, gameId, id); } catch (e) { return false; }
    if (owned) { try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {} }
    return owned;
  }

  /**
   * One-time migration (A3 increment 3): import the coach's existing per-season
   * `season.json` files into the shared library db on first flag-on. Idempotent —
   * a season already present in the db is skipped, so re-running never duplicates
   * or clobbers. Returns the count migrated. Never throws (a bad json is skipped).
   */
  async migrateJsonSeasons(ids) {
    if (!Array.isArray(ids) || !ids.length) return 0;
    await this._ensureLoaded();
    let migrated = 0;
    for (const id of ids) {
      let inDb = false;
      try { inDb = !!this.catalog.loadSeason(id); } catch (e) { inDb = false; }
      if (inDb) continue;
      let json = null;
      try { json = await this.fs.readJson(id); } catch (e) { json = null; }
      if (json && Array.isArray(json.games)) {
        json.id = json.id || id;
        this.catalog.setCurrentSeason(id);
        try { this.catalog.importSeasonJson(json); migrated++; } catch (e) {}
      }
    }
    if (migrated) { try { await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {} }
    return migrated;
  }
}
