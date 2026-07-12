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
    await this._ensureLoaded();
    data.id = data.id || id;
    this.catalog.setCurrentSeason(id);
    if (!this.catalog.saveSeason(data)) return false;
    let okDb = false;
    try { await this.fs.writeDb(this.catalog.toBytes()); okDb = true; } catch (e) { okDb = false; }
    // Fallback + mirror are the safety net; never let them mask the canonical result.
    try { await this.fs.writeJson(id, data); } catch (e) {}
    if (this.fs.writeMirror) { try { await this.fs.writeMirror(id, data); } catch (e) {} }
    return okDb;
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

  /** Remove a season from the db + persist; the caller removes the json/mirror files. */
  async deleteSeason(id) {
    await this._ensureLoaded();
    try { this.catalog.deleteSeason(id); await this.fs.writeDb(this.catalog.toBytes()); } catch (e) {}
  }
}
