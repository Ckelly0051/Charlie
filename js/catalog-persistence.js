/**
 * CatalogPersistence — the orchestrator that makes the SQLite catalog the
 * ONE canonical season store on desktop (PC-2). It owns ONLY the
 * orchestration (which store wins, one-time legacy migration, the
 * recovery-snapshot mirror); ALL filesystem access is INJECTED, so the
 * whole canonical-write path is unit-tested in Node
 * (tools/e2e-catalog-persistence.mjs) with a fake fs + real sql.js — the
 * Tauri desktop glue that supplies the real `fs` adapter + lazy-loads the
 * wasm is the only piece left for a manual smoke.
 *
 * MODEL: one library-wide catalog db (all seasons; the plan's
 * `seasons/library.db`) held open in memory; every save re-exports its
 * bytes to disk. This is the completed migration OFF the JSON-blob-per-
 * season model (structurally kills the v1.10.7 film-index wipe class).
 *
 * PC-2 (Invariant #5): per-season app-data `season.json` is RETIRED as a
 * live authority entirely -- no method here reads or writes it as part of
 * normal operation any more. The one exception is `migrateJsonSeasons()`,
 * a one-time bootstrap read of PRE-EXISTING legacy files on first catalog
 * init, which exists specifically to consume them once and then never
 * need them again. The Documents mirror survives, but only in a
 * downgraded role: a recovery SNAPSHOT written after a successful
 * canonical commit, never read back by a normal load. Recovering a season
 * that exists only in a mirror snapshot is the explicit, previewed,
 * confirmed PC-3 recovery flow -- never an automatic fallback here.
 *
 * A load with no matching db row returns null. It is not a "degrade to a
 * weaker source" -- the season is genuinely unavailable through normal
 * operation, exactly as Invariant #4 requires ("if it cannot initialize,
 * the desktop app fails closed; it must not silently fall back").
 *
 *   const cp = new CatalogPersistence({ catalog, fs });   // catalog = opened SqlCatalog
 *   await cp.saveSeason(id, seasonObject);
 *   const { data, source } = (await cp.loadSeason(id)) || {};
 *
 * Injected `fs` adapter (all async):
 *   readDb()            -> Uint8Array | null   (shared library db bytes; null ONLY for a
 *                                                confirmed-absent file -- any other failure,
 *                                                including "exists but unreadable", MUST throw
 *                                                and propagate; never swallowed into null)
 *   writeDb(bytes)      -> void                (canonical write; a failure propagates)
 *   readJson(id)        -> object | null       (legacy one-time migration read only; best-effort)
 *   writeMirror(id,data)-> void  (optional)    (Documents recovery snapshot; may throw — swallowed)
 */
export class CatalogPersistence {
  constructor({ catalog, fs }) {
    if (!catalog || typeof catalog.saveSeason !== 'function') throw new TypeError('CatalogPersistence requires a SqlCatalog');
    if (!fs || typeof fs.readDb !== 'function' || typeof fs.writeDb !== 'function') throw new TypeError('CatalogPersistence requires an fs adapter (readDb/writeDb, plus readJson for legacy migration)');
    this.catalog = catalog;
    this.fs = fs;
    this._loaded = false;   // has the shared db been opened from disk this session?
  }

  /**
   * Open the shared library db from disk once. A genuinely fresh install (no
   * bytes on disk at all) opens a clean db. Bytes that exist but fail to open
   * MUST throw -- never be silently swapped for an empty db.
   *
   * PC-2 fix (Inventory Sec 3.0, the most severe finding on record): this
   * used to catch ANY open() failure -- including real on-disk corruption --
   * and silently substitute a fresh empty db. reconcileFallbacks() then
   * reported zero seasons with no exception, and TauriBackend.listSeasons()
   * would overwrite library.json with that wrongly-empty result, even in the
   * same call where _recoverFromMirror() had just correctly repopulated it
   * from the Documents mirror moments earlier -- the real season's own
   * season.json fallback sat fully intact, unconsulted, the entire time.
   * That contradicts Invariant #4 ("SQLite is the desktop live store; if it
   * cannot initialize, the desktop app fails closed; it must not silently
   * fall back"). A season whose db cannot be read must surface as a VISIBLE
   * failure so recovery can be offered, never as "there are no seasons."
   *
   * PC-2 repair (Codex review 89e34c6, finding 1): the first pass at this
   * still wrapped `this.fs.readDb()` in its own try/catch here, swallowing a
   * genuine read failure (a locked file, a permission error, a transient
   * disk fault on a db that DOES exist) into `bytes = null` -- the same
   * value a legitimate fresh install produces -- so the code below still
   * took the clean-open branch and reported "no seasons" with no exception.
   * `readDb()` itself now only returns null for a CONFIRMED-absent file; any
   * other failure it raises must propagate here uncaught, exactly like a
   * corrupt-bytes `catalog.open()` failure already does.
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
   * Canonical save: upsert the season into the shared db, export the db bytes
   * to disk, then write the best-effort Documents-mirror recovery snapshot.
   * Returns true on a successful canonical (db) write.
   *
   * PC-1 repair (Codex review of c51a12c, finding 2): a REJECTED canonical
   * write ("okDb" false because the disk writeDb() call failed) previously
   * still wrote the rejected payload to a sidecar unconditionally -- so a
   * rejected import could reappear later from a readable fallback. The
   * mirror write now happens ONLY after the canonical db write is confirmed
   * durable. (PC-2 additionally retires the `season.json` half of that old
   * dual-write entirely -- see the class doc comment above.)
   *
   * A writeDb failure also left `this.catalog`'s IN-MEMORY sql.js state
   * committed to the rejected data while on-disk bytes stayed unchanged --
   * a split-brain, and a faster/same-session variant of the exact defect
   * being fixed here: a later `loadSeason(id)` on this same catalog
   * instance would read the rejected data straight back out of memory, with
   * no disk resurrection required at all. `deleteSeason()` below already
   * defends against this identical hazard by snapshotting pre-mutation
   * bytes and reopening the catalog from them on a writeDb failure; this
   * save path now does the same.
   */
  async saveSeason(id, data) {
    if (!id || !data || !Array.isArray(data.games)) return false;
    // A save has exactly one owner. Allowing the scoped backend id and the
    // payload id to disagree can split one logical save across two seasons:
    // SqlCatalog keys by data.id while the JSON fallback keys by `id`.
    // Fail before opening or writing either store.
    if (data.id && String(data.id) !== String(id)) return false;
    await this._ensureLoaded();
    let snapshot = null;
    try { snapshot = this.catalog.toBytes(); } catch (e) { snapshot = null; }
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
    // PC-2: season.json under app-data is retired as a live authority
    // (Invariant #5) -- it sat beside library.db on the same disk and
    // supplied zero recovery benefit that the db itself didn't already
    // have, while giving a rejected/stale write a second readable place to
    // resurrect from. The Documents mirror survives as the ONLY sidecar,
    // and only in its role as a PC-3 recovery SNAPSHOT (never consulted by
    // a normal load) -- written only once the canonical db write is
    // confirmed durable, same as before.
    if (this.fs.writeMirror) { try { await this.fs.writeMirror(id, data); } catch (e) {} }
    return true;
  }

  /** Canonical library metadata. The catalog, not library.json, owns truth. */
  async listSeasons() {
    await this._ensureLoaded();
    return this.catalog.listSeasons();
  }

  /**
   * Rebuild the Documents recovery-mirror snapshots from the canonical
   * catalog once per session. PC-2: no longer writes app-data season.json
   * (Invariant #5 -- see saveSeason's comment); the mirror is the only
   * sidecar this produces, and only as a PC-3 recovery snapshot.
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
   * Load from the canonical db only. Returns { data, source: 'db' } or null.
   *
   * PC-2: season.json is no longer read here as a live fallback authority
   * (Invariant #5). A normal load reading json and silently splicing it
   * back into the db is exactly the "JSON competing with the catalog for
   * write authority" pattern this checkpoint removes -- it means a stale
   * or rejected sidecar file could resurrect a season into the canonical
   * store with no coach visibility or confirmation. A season absent from
   * the db is genuinely not loadable during normal operation; recovering
   * one from a legacy season.json or a Documents-mirror snapshot is now
   * the explicit, previewed, confirmed PC-3 recovery flow, never an
   * automatic side effect of opening a season.
   */
  async loadSeason(id) {
    if (!id) return null;
    await this._ensureLoaded();
    try {
      const fromDb = this.catalog.loadSeason(id);
      if (fromDb && Array.isArray(fromDb.games)) return { data: fromDb, source: 'db' };
    } catch (e) { /* not found / unreadable -- genuinely absent */ }
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
   * FALSE so the caller keeps the Documents-mirror safety copy in place
   * (deleting it against a stale on-disk db would let the season resurrect).
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
