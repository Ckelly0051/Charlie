import { SqlCatalog } from './sql-catalog.js';
import { CatalogPersistence } from './catalog-persistence.js';

/**
 * StorageBackend — the seam between the app and *where bytes live*.
 *
 * The app (SeasonStore) never talks to localStorage / the filesystem directly;
 * it goes through a backend. This is what lets the same UI run as:
 *   - a pure browser app  → BrowserBackend (localStorage + IndexedDB + the
 *                           File System Access API for real disk backups)
 *   - an installed desktop app → TauriBackend (unrestricted local files)
 *   - (future) a cloud-synced app → a network backend, same interface.
 *
 * SEASON LIBRARY (multi-season)
 * -----------------------------
 * The app is library-first, like Hudl: many seasons, each its own file/folder,
 * browsed from a Library screen. The backend therefore manages:
 *   - a library index (list of season metas), and
 *   - per-season storage, scoped to a "current season" set via
 *     `setCurrentSeason(id)`. The classic season ops (loadSeason / saveSeason /
 *     the backup ring) all operate on whatever season is current, so SeasonStore
 *     keeps calling them unchanged.
 *
 * On-disk / storage layout:
 *   Browser:  ffa_library            (index, localStorage)
 *             ffa_season_<id>        (one season per key)
 *             IndexedDB backups      (records tagged with seasonId)
 *   Tauri:    library.json           (index, app-data root)
 *             seasons/<id>/season.json
 *             seasons/<id>/backups/season_<ts>.json
 *
 * `detectBackend()` picks the right implementation for the environment.
 */
export class StorageBackend {
  constructor() { this.RETENTION = 25; this.currentId = null; }
  name() { return 'base'; }

  async init() {}

  // ---- season library ------------------------------------------------------
  setCurrentSeason(id) { this.currentId = id; }
  currentSeason() { return this.currentId; }
  async listSeasons() { return []; }              // [{id,name,team,year,level,games,plays,created,updated,lastOpened}]
  async createSeason(_meta) { return null; }       // allocate id + index entry; returns meta
  async deleteSeason(_id) {}
  async touchOpened(_id) {}                         // bump lastOpened in the index

  // ---- canonical season (PC-1: explicit seasonId, never ambient currentId) --
  // Every identity-sensitive method below takes seasonId as an EXPLICIT first
  // parameter. Callers (SeasonStore) always pass this.currentSeasonId; the
  // ambient this.currentId/setCurrentSeason() pointer is never consulted by
  // these methods and can no longer choose a write destination on its own
  // (GRIDIRON-IQ-PERSISTENCE-INVENTORY.md Sec 3.3). currentId/setCurrentSeason
  // remain for the out-of-scope film/linked-film surfaces (invariant #8).
  async loadSeason(_seasonId) { return null; }
  async saveSeason(_seasonId, _data) { return false; }
  // Read-only peek at an ARBITRARY season's data by id, never touching
  // currentId/setCurrentSeason. Exists so a caller (e.g. Team Hub's season
  // list) can compute something like film health for a season that is not
  // the one currently open, without disturbing navigation state or risking a
  // race with a concurrent openSeasonById(). Never call saveSeason/persist
  // against the result — it is a snapshot, not a live-editable copy.
  async peekSeason(_id) { return null; }

  // ---- backup ring (explicit seasonId) ----
  async listBackups(_seasonId) { return []; }            // [{id,t,label,seasonName,games,plays}]
  async getBackup(_seasonId, _backupId) { return null; }  // full season data
  async createBackup(_seasonId, _data, _label) { return null; }
  async deleteBackup(_seasonId, _backupId) {}

  // ---- durable disk (optional) ----
  supportsDisk() { return false; }
  diskStatus() { return { supported: false, bound: false, name: '', lastWrite: 0 }; }
  async bindDisk() { return false; }
  async restoreDiskBinding() { return false; }
  async forgetDisk() {}
  /** Write the live file (+ a snapshot file when snapshot:true). */
  async writeDisk(_seasonId, _data, _opts) { return false; }

  // ---- persistent film library (desktop only) ----
  supportsFilm() { return false; }
  async importFilm(_gameId, _files, _onProgress) { return null; }
  async filmUrl(_gameId, _filename) { return null; }
  async deleteFilm(_gameId) {}
  async listFilmFiles(_gameId) { return []; }
  async managedGameDir(_gameId) { return ''; }

  // ---- linked film library (desktop only): coach-owned folder, referenced
  //      in place (no copy). Managed film (importFilm) is untouched by these. ----
  supportsLinkedFilm() { return false; }
  getFilmStorageMode() { return 'managed'; }
  setFilmStorageMode(_mode) { return false; }
  getLibraryRoot() { return ''; }
  async setLibraryRoot(_path) { return false; }
  async allowLibraryDir(_path) { return false; }
  async initLibraryRoot() { return ''; }
  async pickFolder(_defaultPath) { return ''; }
  async listLinkedFilm(_absDir) { return []; }
  async linkedFilmUrl(_absPath) { return null; }
  async linkedGameDir(_filmDir) { return ''; }
  gameDirFromRoot(_absPath) { return null; }
  async openLinkedDir(_filmDir) { return ''; }
  async linkedAbs(_absDir, _relPath) { return ''; }
  relToRoot(_absPath) { return ''; }
  rememberLinkedDir(_absPath) {}
  isLinkedDirAllowed(_absPath) { return true; }   // no linked film off-desktop; never blocks

  // ---- helpers shared by implementations ----
  _meta(data, label) {
    return {
      t: new Date().toISOString(),
      label: label || 'Save',
      seasonName: (data && data.seasonName) || '',
      games: (data && data.games) ? data.games.length : 0,
      plays: (data && data.games) ? data.games.reduce((s, g) => s + ((g.plays || []).length), 0) : 0,
    };
  }
  /** Derive a library-index entry from a season's data. */
  _seasonMeta(id, data) {
    const games = (data && data.games) ? data.games.length : 0;
    const plays = (data && data.games) ? data.games.reduce((s, g) => s + ((g.plays || []).length), 0) : 0;
    const team = (data && (data.team || (data.teamProfile && data.teamProfile.teamName))) || '';
    return {
      id,
      name: (data && data.seasonName) || team || 'Untitled Season',
      team, year: (data && data.year) || '', level: (data && data.level) || '',
      isDemo: !!(data && (data.isDemo || data.kind === 'demo')),
      kind: (data && (data.isDemo || data.kind === 'demo')) ? 'demo' : (data && data.kind) || '',
      games, plays, updated: new Date().toISOString(),
    };
  }
  slugify(s) {
    return String(s || '').trim().toLowerCase()
      .replace(/[^\w]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48) || 'season';
  }
  _uniqueId(base, taken) {
    let id = base, n = 2;
    while (taken.includes(id)) { id = `${base}-${n++}`; }
    return id;
  }
  _tsSlug(d = new Date()) {
    const p = (n, w = 2) => String(n).padStart(w, '0');
    // Millisecond suffix: backup/snapshot filenames are keyed on this slug, and
    // two snapshots in the same SECOND (forced restore-point + autosave) used to
    // produce an identical filename and overwrite each other. Zero-padded ms
    // preserves chronological sort.
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}-${p(d.getMilliseconds(), 3)}`;
  }
}

/**
 * BrowserBackend — canonical seasons in localStorage (one key per season under a
 * `ffa_library` index), the backup ring in IndexedDB (records tagged with the
 * season id), and (Chromium) real disk backups via the File System Access API.
 */
export class BrowserBackend extends StorageBackend {
  constructor() {
    super();
    this.LIB = 'ffa_library';
    this.LEGACY = 'ffa_season';
    this.dirHandle = null;
    this._lastWrite = 0;
    this._writing = false;
  }
  name() { return 'browser'; }

  _seasonKey(id) { return 'ffa_season_' + id; }

  // ---- library index ----
  _readLib() {
    try { return JSON.parse(localStorage.getItem(this.LIB) || 'null') || []; }
    catch (e) { return []; }
  }
  _writeLib(arr) {
    try { localStorage.setItem(this.LIB, JSON.stringify(arr)); } catch (e) {}
  }
  /** One-time migration: an old single `ffa_season` becomes the first season. */
  _migrateLegacy() {
    if (localStorage.getItem(this.LIB) != null) return;     // library already exists
    let legacy = null;
    try { legacy = JSON.parse(localStorage.getItem(this.LEGACY) || 'null'); } catch (e) {}
    if (legacy && Array.isArray(legacy.games)) {
      const id = this._uniqueId(this.slugify(legacy.seasonName || 'my-season'), []);
      legacy.id = id;
      try { localStorage.setItem(this._seasonKey(id), JSON.stringify(legacy)); } catch (e) {}
      const meta = this._seasonMeta(id, legacy);
      meta.created = new Date().toISOString();
      meta.lastOpened = meta.created;
      this._writeLib([meta]);
    } else {
      this._writeLib([]);                                   // fresh install
    }
  }

  async listSeasons() {
    this._migrateLegacy();
    return this._readLib().slice().sort((a, b) =>
      String(b.lastOpened || b.updated || '').localeCompare(String(a.lastOpened || a.updated || '')));
  }

  async createSeason(meta) {
    const lib = this._readLib();
    const base = this.slugify(meta.name || [meta.year, meta.level, meta.team].filter(Boolean).join('-'));
    const id = this._uniqueId(base, lib.map(s => s.id));
    const now = new Date().toISOString();
    const entry = {
      id, name: meta.name || base, team: meta.team || '', year: meta.year || '',
      level: meta.level || '', teamId: meta.teamId || '',
      isDemo: !!meta.isDemo, kind: meta.isDemo ? 'demo' : (meta.kind || ''),
      games: 0, plays: 0, created: now, updated: now, lastOpened: now,
    };
    lib.push(entry);
    this._writeLib(lib);
    return entry;
  }

  async deleteSeason(id) {
    try { localStorage.removeItem(this._seasonKey(id)); } catch (e) {}
    this._writeLib(this._readLib().filter(s => s.id !== id));
    // Drop this season's backups. Deletes directly via _tx rather than the
    // public deleteBackup(id) below: this sweep legitimately removes EVERY
    // backup owned by `id`, which is very often NOT this.currentId (deleting
    // a non-active season from the library while a different one is open) --
    // the public method's own-scope check would wrongly refuse most of these.
    try {
      const all = await this._tx('backups', 'readonly', os => os.getAll());
      for (const r of (all || [])) if (r && r.seasonId === id) await this._tx('backups', 'readwrite', os => os.delete(r.id));
    } catch (e) {}
    if (this.currentId === id) this.currentId = null;
    return true;
  }

  async touchOpened(id) {
    const lib = this._readLib();
    const e = lib.find(s => s.id === id);
    if (e) { e.lastOpened = new Date().toISOString(); this._writeLib(lib); }
  }

  // ---- canonical (PC-1: explicit seasonId) ----
  async loadSeason(seasonId) {
    if (!seasonId) return null;
    try { return JSON.parse(localStorage.getItem(this._seasonKey(seasonId)) || 'null'); }
    catch (e) { return null; }
  }
  async peekSeason(id) {
    if (!id) return null;
    try { return JSON.parse(localStorage.getItem(this._seasonKey(id)) || 'null'); }
    catch (e) { return null; }
  }
  async saveSeason(seasonId, data) {
    if (!seasonId) return false;
    try { localStorage.setItem(this._seasonKey(seasonId), JSON.stringify(data)); }
    catch (e) { return false; }   // quota — the disk/backup ring is the durable copy
    this._touchMeta(seasonId, data);
    return true;
  }
  /** Refresh the index entry (counts, name, updated) after a save. */
  _touchMeta(seasonId, data) {
    const lib = this._readLib();
    const i = lib.findIndex(s => s.id === seasonId);
    if (i < 0) return;
    const m = this._seasonMeta(seasonId, data);
    // Don't let a blank data.seasonName overwrite a name the user set on the
    // library entry (createSeason meta) with the derived 'Untitled'/team fallback.
    if (!(data && data.seasonName) && lib[i].name) m.name = lib[i].name;
    lib[i] = { ...lib[i], ...m, created: lib[i].created, lastOpened: lib[i].lastOpened };
    this._writeLib(lib);
  }

  // ---- IndexedDB (handles + backups) ----
  _idb() {
    // Cache the open connection — every backup op went through a fresh
    // indexedDB.open, and deleteSeason/_prune loops multiplied that. Reopen only
    // if the cached connection errored or was closed.
    if (this._idbPromise) return this._idbPromise;
    this._idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('ffa_fs', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      };
      req.onsuccess = () => {
        const db = req.result;
        // If the connection drops (tab suspend, version change), drop the cache
        // so the next op reopens instead of using a dead handle.
        db.onclose = () => { if (this._idbPromise) this._idbPromise = null; };
        db.onversionchange = () => { try { db.close(); } catch (e) {} this._idbPromise = null; };
        resolve(db);
      };
      req.onerror = () => { this._idbPromise = null; reject(req.error); };
    });
    return this._idbPromise;
  }
  _tx(store, mode, fn) {
    return this._idb().then(db => new Promise((res, rej) => {
      const tx = db.transaction(store, mode);
      const os = tx.objectStore(store);
      const out = fn(os);
      tx.oncomplete = () => res(out && out.result !== undefined ? out.result : out);
      tx.onerror = () => rej(tx.error);
    }));
  }

  // ---- backup ring (PC-1: explicit seasonId, no ambient this.currentId) ----
  async createBackup(seasonId, data, label) {
    if (!seasonId) return null;
    const json = JSON.stringify(data);
    const recent = await this.listBackups(seasonId);
    if (recent.length) {
      const last = await this.getBackup(seasonId, recent[0].id);
      if (last && JSON.stringify(last) === json) return null;
    }
    // Monotonic id: two backups in the same millisecond (a forced "Before X"
    // snapshot immediately followed by an autosave) would otherwise share
    // Date.now() and the second os.put would OVERWRITE the first — silently
    // eating exactly the restore point the coach might need.
    const id = Math.max(Date.now(), (this._lastBackupId || 0) + 1);
    this._lastBackupId = id;
    const rec = { id, seasonId, ...this._meta(data, label), data: JSON.parse(json) };
    await this._tx('backups', 'readwrite', os => os.put(rec, id));
    await this._prune(seasonId);
    const { data: _omit, ...meta } = rec;
    return meta;
  }
  async listBackups(seasonId) {
    const all = await this._tx('backups', 'readonly', os => os.getAll());
    return (all || [])
      .filter(r => r && r.seasonId === seasonId)
      .map(({ data, ...meta }) => meta)
      .sort((a, b) => b.id - a.id);
  }
  // A backup id listed under a DIFFERENT season can no longer be read or
  // deleted just by knowing its id -- the caller's own explicit seasonId is
  // the only source of scope. Use `== null` rather than `!==`: a real miss
  // can surface as `undefined` (see _tx's out.result handling), and both
  // mean "not found" here.
  async getBackup(seasonId, id) {
    const rec = await this._tx('backups', 'readonly', os => os.get(id));
    if (rec == null || rec.seasonId !== seasonId) return null;
    return rec.data;
  }
  async deleteBackup(seasonId, id) {
    const rec = await this._tx('backups', 'readonly', os => os.get(id));
    if (rec == null || rec.seasonId !== seasonId) return false;
    await this._tx('backups', 'readwrite', os => os.delete(id));
    return true;
  }
  async _prune(seasonId) {
    const metas = await this.listBackups(seasonId);       // newest first, this season
    const extra = metas.slice(this.RETENTION);
    for (const m of extra) await this.deleteBackup(seasonId, m.id);
  }

  // ---- disk (File System Access API) ----
  supportsDisk() { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
  diskStatus() {
    // "bound" requires a REAL, named directory handle. A restored handle can
    // deserialize without a usable .name (seen in the browser), which made the
    // Season modal claim "Backing up to undefined" and attempt futile writes.
    // Gate on the name so status + write-gating reflect an actual folder.
    const name = (this.dirHandle && this.dirHandle.name) ? this.dirHandle.name : '';
    return {
      supported: this.supportsDisk(),
      bound: !!name,
      name,
      lastWrite: this._lastWrite,
    };
  }

  async bindDisk() {
    if (!this.supportsDisk()) return false;
    try {
      this.dirHandle = await window.showDirectoryPicker({ id: 'ffa-season-backup', mode: 'readwrite' });
      await this._persistDir();
      return true;
    } catch (e) { return false; }   // AbortError = user cancelled
  }
  async forgetDisk() {
    this.dirHandle = null;
    try { await this._tx('handles', 'readwrite', os => os.delete('backupDir')); } catch (e) {}
  }
  async _persistDir() {
    try { await this._tx('handles', 'readwrite', os => os.put(this.dirHandle, 'backupDir')); } catch (e) {}
  }
  async restoreDiskBinding() {
    try {
      const h = await this._tx('handles', 'readonly', os => os.get('backupDir'));
      if (h) { this.dirHandle = h; return true; }
    } catch (e) {}
    return false;
  }
  async _dirPermitted(prompt) {
    if (!this.dirHandle || !this.dirHandle.queryPermission) return !!this.dirHandle;
    const opts = { mode: 'readwrite' };
    if ((await this.dirHandle.queryPermission(opts)) === 'granted') return true;
    if (!prompt) return false;
    return (await this.dirHandle.requestPermission(opts)) === 'granted';
  }

  async writeDisk(seasonId, data, opts = {}) {
    if (!this.dirHandle || this._writing) return false;
    if (!(await this._dirPermitted(!!opts.prompt))) return false;
    this._writing = true;
    try {
      const json = JSON.stringify(data, null, 2);
      // Per-season filename so multiple seasons don't overwrite one file.
      const base = this.slugify(data.seasonName || seasonId || 'season');
      await this._writeInto(this.dirHandle, `${base}.json`, json);
      if (opts.snapshot) {
        const backups = await this.dirHandle.getDirectoryHandle('backups', { create: true });
        await this._writeInto(backups, `${base}_${this._tsSlug()}.json`, json);
        await this._pruneDisk(backups, base);
      }
      this._lastWrite = Date.now();
      return true;
    } catch (e) { return false; }
    finally { this._writing = false; }
  }
  async _writeInto(dir, filename, text) {
    const fh = await dir.getFileHandle(filename, { create: true });
    const w = await fh.createWritable();
    await w.write(text);
    await w.close();
  }
  async _pruneDisk(backups, base) {
    const names = [];
    for await (const [name, handle] of backups.entries()) {
      if (handle.kind === 'file' && new RegExp(`^${base}_.*\\.json$`).test(name)) names.push(name);
    }
    names.sort();                                   // timestamp slug sorts chronologically
    const extra = names.slice(0, Math.max(0, names.length - this.RETENTION));
    for (const n of extra) { try { await backups.removeEntry(n); } catch (e) {} }
  }
}

/**
 * TauriBackend — the installed-desktop path (Tauri v2). Same interface, but
 * every read and write hits real files via the Tauri fs plugin (no sandbox, no
 * eviction, no permission dance). Dormant in the browser; activated only when
 * running inside Tauri. See TAURI.md for packaging.
 *
 * Tauri v2 API notes (withGlobalTauri: true):
 *   - fs plugin is at window.__TAURI__.fs
 *   - BaseDirectory enum is on fs (fs.BaseDirectory.AppData = 14)
 *   - Options use { baseDir } not { dir }
 *   - createDir → mkdir, removeFile → remove
 *   - readDir returns { name, isDirectory, isFile }
 */
export class TauriBackend extends StorageBackend {
  constructor() {
    super();
    this.fs = window.__TAURI__ && window.__TAURI__.fs;
    this.baseDir = (this.fs && this.fs.BaseDirectory) ? this.fs.BaseDirectory.AppData : undefined;
    // Durable mirror OUTSIDE app data, so "Delete application data" / uninstall
    // can't take the season + restore ring with it. Lives in the user's
    // Documents folder under MIRROR_ROOT.
    this.mirrorDir = (this.fs && this.fs.BaseDirectory) ? this.fs.BaseDirectory.Document : undefined;
    this.MIRROR_ROOT = 'GridIron IQ';
    this.LIB = 'library.json';
    this.LEGACY = 'season.json';
    this._lastWrite = 0;
    this._dirReady = {};        // per-season "backups dir ensured" cache
    this._lastBackupJson = null;
  }
  name() { return 'tauri'; }

  _ok() { return !!this.fs; }
  _seasonDir(id) { return `seasons/${id}`; }
  _seasonFile(id) { return `seasons/${id}/season.json`; }
  _backupsDir(id) { return `seasons/${id}/backups`; }
  // Durable mirror paths (relative to the Documents base dir).
  _mirrorSeasonDir(id) { return `${this.MIRROR_ROOT}/seasons/${id}`; }
  _mirrorSeasonFile(id) { return `${this.MIRROR_ROOT}/seasons/${id}/season.json`; }
  _mirrorBackupsDir(id) { return `${this.MIRROR_ROOT}/seasons/${id}/backups`; }

  setCurrentSeason(id) { this.currentId = id; }

  async _exists(p) { try { return await this.fs.exists(p, { baseDir: this.baseDir }); } catch (e) { return false; } }
  async _readJson(p) {
    try { return JSON.parse(await this.fs.readTextFile(p, { baseDir: this.baseDir })); } catch (e) { return null; }
  }
  async _writeJson(p, obj) {
    await this.fs.writeTextFile(p, JSON.stringify(obj, null, 2), { baseDir: this.baseDir });
  }

  /** Create a season's folder (+ backups/) if missing. Idempotent per season. */
  async _ensureSeasonDir(id) {
    if (this._dirReady[id]) return;
    try {
      if (!(await this._exists(this._backupsDir(id))))
        await this.fs.mkdir(this._backupsDir(id), { baseDir: this.baseDir, recursive: true });
      this._dirReady[id] = true;
    } catch (e) {}
  }

  // ---- library index ----
  async _readLib() { return (await this._readJson(this.LIB)) || []; }
  async _writeLib(arr) { try { await this._writeJson(this.LIB, arr); } catch (e) {} }

  /** One-time migration: an old top-level season.json becomes the first season. */
  async _migrateLegacy() {
    if (!this._ok()) return;
    if (await this._exists(this.LIB)) return;
    const legacy = (await this._exists(this.LEGACY)) ? await this._readJson(this.LEGACY) : null;
    if (legacy && Array.isArray(legacy.games)) {
      const id = this._uniqueId(this.slugify(legacy.seasonName || 'my-season'), []);
      legacy.id = id;
      await this._ensureSeasonDir(id);
      try { await this._writeJson(this._seasonFile(id), legacy); } catch (e) {}
      const meta = this._seasonMeta(id, legacy);
      meta.created = new Date().toISOString();
      meta.lastOpened = meta.created;
      await this._writeLib([meta]);
    } else {
      await this._writeLib([]);
    }
  }

  async listSeasons() {
    if (!this._ok()) return [];
    await this._migrateLegacy();
    let lib = await this._readLib();
    // If the library is empty (fresh install, or app data was deleted), try to
    // rebuild it from the durable Documents mirror so a coach's seasons come
    // back automatically instead of looking permanently lost.
    if (lib.length === 0) {
      const recovered = await this._recoverFromMirror();
      if (recovered.length) lib = recovered;
    }
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) throw new Error('The canonical season catalog could not be opened. No fallback writes are allowed.');
    if (cp) {
      try {
        // SQLite is canonical. Rebuild the legacy index and JSON safety copies
        // from it so stale sidecars can never hide or rename a surviving season.
        lib = await cp.reconcileFallbacks();
        await this._writeLib(lib);
      } catch (e) {
        console.error('catalog library reconciliation failed', e);
        throw e;
      }
    }
    return lib.slice().sort((a, b) =>
      String(b.lastOpened || b.updated || '').localeCompare(String(a.lastOpened || a.updated || '')));
  }

  /**
   * Rebuild the library + per-season files from the Documents mirror. Called
   * when the app-data library is empty (e.g. after "Delete application data").
   * Copies each mirrored season.json back into app data and returns the lib.
   */
  async _recoverFromMirror() {
    if (this.mirrorDir === undefined) return [];
    const root = `${this.MIRROR_ROOT}/seasons`;
    let dirs = [];
    try {
      if (!(await this.fs.exists(root, { baseDir: this.mirrorDir }))) return [];
      dirs = (await this.fs.readDir(root, { baseDir: this.mirrorDir })).filter(e => e.isDirectory);
    } catch (e) { return []; }
    const lib = [];
    for (const d of dirs) {
      const id = d.name;
      const file = `${root}/${id}/season.json`;
      let data = null;
      try {
        if (await this.fs.exists(file, { baseDir: this.mirrorDir }))
          data = JSON.parse(await this.fs.readTextFile(file, { baseDir: this.mirrorDir }));
      } catch (e) {}
      if (!data || !Array.isArray(data.games)) continue;
      // Restore the canonical app-data copy so normal load/save works.
      try {
        await this._ensureSeasonDir(id);
        await this._writeJson(this._seasonFile(id), data);
      } catch (e) {}
      const meta = this._seasonMeta(id, data);
      meta.created = new Date().toISOString();
      meta.lastOpened = meta.created;
      lib.push(meta);
    }
    if (lib.length) { try { await this._writeLib(lib); } catch (e) {} }
    return lib;
  }

  async createSeason(meta) {
    if (!this._ok()) return null;
    const lib = await this._readLib();
    const base = this.slugify(meta.name || [meta.year, meta.level, meta.team].filter(Boolean).join('-'));
    const id = this._uniqueId(base, lib.map(s => s.id));
    await this._ensureSeasonDir(id);
    const now = new Date().toISOString();
    const entry = {
      id, name: meta.name || base, team: meta.team || '', year: meta.year || '',
      level: meta.level || '', teamId: meta.teamId || '',
      isDemo: !!meta.isDemo, kind: meta.isDemo ? 'demo' : (meta.kind || ''),
      games: 0, plays: 0, created: now, updated: now, lastOpened: now,
    };
    lib.push(entry);
    await this._writeLib(lib);
    return entry;
  }

  async deleteSeason(id) {
    if (!this._ok()) return;
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) return false;
    if (cp) {
      let ok = false;
      try { ok = await cp.deleteSeason(id); } catch (e) { ok = false; }
      // Retain the season.json + Documents mirror + library entry until the
      // canonical db delete is DURABLE — otherwise a stale on-disk db could
      // resurrect the season with its safety copies already gone.
      if (!ok) { console.warn('catalog delete failed; retaining season + JSON/mirror', id); return false; }
    }
    try { if (await this._exists(this._seasonDir(id))) await this.fs.remove(this._seasonDir(id), { baseDir: this.baseDir, recursive: true }); } catch (e) {}
    try {
      if (this.mirrorDir !== undefined) {
        const mirrorSeason = this._mirrorSeasonDir(id);
        if (await this.fs.exists(mirrorSeason, { baseDir: this.mirrorDir })) {
          await this.fs.remove(mirrorSeason, { baseDir: this.mirrorDir, recursive: true });
        }
      }
    } catch (e) {}
    await this._writeLib((await this._readLib()).filter(s => s.id !== id));
    delete this._dirReady[id];
    if (this.currentId === id) this.currentId = null;
    return true;
  }

  async touchOpened(id) {
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) return false;
    if (cp && !(await cp.touchOpened(id))) return false;
    const lib = await this._readLib();
    const e = lib.find(s => s.id === id);
    if (e) { e.lastOpened = new Date().toISOString(); await this._writeLib(lib); }
    return true;
  }

  // ---- canonical (PC-1: explicit seasonId, mirrors peekSeason's shape) ----
  async loadSeason(seasonId) {
    if (!this._ok() || !seasonId) return null;
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) throw new Error('The canonical season catalog could not be opened. No fallback writes are allowed.');
    if (cp) {
      try { const r = await cp.loadSeason(seasonId); if (r && r.data) return r.data; }
      catch (e) {
        console.error('catalog load failed; stale JSON fallback blocked', e);
        throw e;
      }
    }
    if (await this._exists(this._seasonFile(seasonId))) return this._readJson(this._seasonFile(seasonId));
    return null;
  }
  // Same read as loadSeason(), parameterized by id instead of this.currentId,
  // and never mutates this.currentId — a real navigation could be resolving
  // setCurrentSeason(id) concurrently, and stomping it here would silently
  // redirect the coach's Open click. Read-only; no write path exists for it.
  async peekSeason(id) {
    if (!this._ok() || !id) return null;
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) throw new Error('The canonical season catalog could not be opened. No fallback writes are allowed.');
    if (cp) {
      try { const r = await cp.loadSeason(id); if (r && r.data) return r.data; }
      catch (e) {
        console.error('catalog peek failed; stale JSON fallback blocked', e);
        throw e;
      }
    }
    if (await this._exists(this._seasonFile(id))) return this._readJson(this._seasonFile(id));
    return null;
  }
  async saveSeason(seasonId, data) {
    if (!this._ok() || !seasonId) return false;
    if (!data || (data.id && String(data.id) !== String(seasonId))) {
      console.error('Blocked cross-season save', { destinationId: seasonId, payloadId: data && data.id });
      return false;
    }
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) {
      console.error('Blocked JSON fallback write because the canonical catalog exists but is unavailable');
      return false;
    }
    if (cp) {
      // CatalogPersistence writes db (canonical) + season.json + Documents mirror,
      // and returns TRUE only when the canonical db write is durable. The json
      // safety copy is written either way, so the library metadata may advance to
      // match it — but PROPAGATE the canonical result so SeasonStore's persist
      // warning fires on a real db failure instead of a false success.
      try {
        const okDb = await cp.saveSeason(seasonId, data);
        await this._touchMeta(seasonId, data);
        return okDb;
      }
      catch (e) {
        console.error('catalog save threw; fallback write blocked', e);
        return false;
      }
    }
    try {
      await this._ensureSeasonDir(seasonId);
      await this._writeJson(this._seasonFile(seasonId), data);
      await this._touchMeta(seasonId, data);
      return true;
    } catch (e) { return false; }
  }

  // ---- SQLite catalog (A3 desktop canonical) — flag-gated + FAIL-SAFE --------
  // Behind localStorage `ffa_sql_catalog` (default OFF). When enabled, season
  // load/save/delete delegate to CatalogPersistence: the SQLite catalog becomes
  // canonical, dual-writing season.json + the Documents mirror, with a self-
  // healing JSON fallback. ANY failure — the wasm won't load, a runtime error —
  // silently keeps the EXISTING JSON path, so the feature can never lose a save.
  // The browser bundle stays sql.js-free: the wasm is a desktop-only Tauri
  // resource, lazy-loaded here on first use.
  _sqlFlag() {
    // Tauri's catalog is the shipped canonical store. A localStorage flag must
    // never demote durable SQLite data to stale JSON sidecars.
    return true;
  }

  async _loadSqlEngine() {
    if (this._SQL) return this._SQL;
    if (this._sqlEngineFailed) return null;   // don't retry a broken load every op
    try {
      const T = window.__TAURI__;
      const resolve = T && T.path && T.path.resolveResource;
      const convert = T && T.core && T.core.convertFileSrc;
      if (!resolve || !convert) throw new Error('Tauri resource API unavailable');
      if (typeof window.initSqlJs !== 'function') {
        const glueUrl = convert(await resolve('resources/sql-wasm.js'));
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = glueUrl; s.onload = res; s.onerror = () => rej(new Error('sql-wasm.js failed to load'));
          document.head.appendChild(s);
        });
      }
      const wasmUrl = convert(await resolve('resources/sql-wasm.wasm'));
      this._SQL = await window.initSqlJs({ locateFile: () => wasmUrl });
      return this._SQL;
    } catch (e) {
      this._sqlEngineFailed = true;
      console.warn('SQL engine load failed; staying on JSON', e);
      return null;
    }
  }

  _catalogFs() {
    const dbPath = 'seasons/library.db';
    return {
      readDb: async () => { try { if (await this._exists(dbPath)) return await this.fs.readFile(dbPath, { baseDir: this.baseDir }); } catch (e) {} return null; },
      writeDb: async (bytes) => { try { await this.fs.mkdir('seasons', { baseDir: this.baseDir, recursive: true }); } catch (e) {} await this.fs.writeFile(dbPath, bytes, { baseDir: this.baseDir }); },
      readJson: async (id) => this._readJson(this._seasonFile(id)),
      writeJson: async (id, data) => { await this._ensureSeasonDir(id); await this._writeJson(this._seasonFile(id), data); },
      writeMirror: async (id, data) => { await this._mirrorToDocuments(id, data); },
    };
  }

  async _ensureCatalog() {
    if (!this._sqlFlag() || !this._ok()) return null;
    if (this._catalog) return this._catalog;
    if (this._catalogInit) return this._catalogInit;
    this._catalogInit = (async () => {
      try {
        const SQL = await this._loadSqlEngine();
        if (!SQL) return null;
        const cp = new CatalogPersistence({ catalog: new SqlCatalog(SQL), fs: this._catalogFs() });
        // First flag-on: import existing per-season season.json into the shared db.
        try { const lib = await this._readLib(); await cp.migrateJsonSeasons(lib.map(s => s.id)); } catch (e) {}
        this._catalog = cp;
        return cp;
      } catch (e) { console.warn('Catalog init failed; staying on JSON', e); return null; }
    })();
    return this._catalogInit;
  }
  async _touchMeta(seasonId, data) {
    if (!data || (data.id && String(data.id) !== String(seasonId))) return false;
    const lib = await this._readLib();
    const i = lib.findIndex(s => s.id === seasonId);
    if (i < 0) return;
    const m = this._seasonMeta(seasonId, data);
    lib[i] = { ...lib[i], ...m, created: lib[i].created, lastOpened: lib[i].lastOpened };
    await this._writeLib(lib);
    return true;
  }

  // ---- backup ring (PC-1: explicit seasonId, no ambient this.currentId) ----
  async createBackup(seasonId, data, label) {
    if (!this._ok() || !seasonId) return null;
    if (!data || (data.id && String(data.id) !== String(seasonId))) {
      console.error('Blocked cross-season backup', { destinationId: seasonId, payloadId: data && data.id });
      return null;
    }
    const json = JSON.stringify(data);
    if (this._lastBackupJson && this._lastBackupJson === json) return null;
    // Restore points are rows in the shared library db. Legacy JSON backups
    // remain readable, but new writes never bypass an existing catalog.
    const catalogOnDisk = await this._exists('seasons/library.db');
    const cp = await this._ensureCatalog();
    if (catalogOnDisk && !cp) throw new Error('The canonical season catalog could not be opened. No fallback writes are allowed.');
    if (cp) {
      try {
        const bid = await cp.createBackup(seasonId, data, label || 'Save');
        if (bid) { const meta = this._meta(data, label); meta.id = bid; this._lastBackupJson = json; return meta; }
      } catch (e) {
        console.error('catalog backup failed; JSON ring write blocked', e);
        return null;
      }
    }
    await this._ensureSeasonDir(seasonId);
    const id = `season_${this._tsSlug()}.json`;
    const meta = this._meta(data, label);
    meta.id = id;
    const payload = JSON.stringify({ ...meta, data }, null, 2);
    try { await this.fs.writeTextFile(`${this._backupsDir(seasonId)}/${id}`, payload, { baseDir: this.baseDir }); }
    catch (e) { return null; }
    this._lastBackupJson = json;
    await this._prune(seasonId);
    return meta;
  }
  async listBackups(seasonId) {
    if (!this._ok() || !seasonId) return [];
    // Merge the canonical db ring with any legacy backup JSON files, so flipping
    // the catalog flag on never hides restore points created under the file ring.
    const cp = await this._ensureCatalog();
    let fromDb = [];
    if (cp) { try { fromDb = await cp.listBackups(seasonId); } catch (e) {} }
    await this._ensureSeasonDir(seasonId);
    const out = [];
    let entries = [];
    try { entries = await this.fs.readDir(this._backupsDir(seasonId), { baseDir: this.baseDir }); } catch (e) { entries = []; }
    const reads = [];
    for (const e of entries) {
      if (e.isDirectory || !/^season_.*\.json$/.test(e.name || '')) continue;
      reads.push(
        this.fs.readTextFile(`${this._backupsDir(seasonId)}/${e.name}`, { baseDir: this.baseDir })
          .then(text => {
            const rec = JSON.parse(text);
            out.push({ id: e.name, t: rec.t, label: rec.label, seasonName: rec.seasonName, games: rec.games, plays: rec.plays });
          })
          .catch(() => {})
      );
    }
    await Promise.all(reads);
    // db rows carry ISO `t`; file entries too. Sort newest-first by timestamp
    // (ids no longer sort chronologically once db + file ids are mixed).
    return [...fromDb, ...out].sort((a, b) => String(b.t || '').localeCompare(String(a.t || '')));
  }
  // Restore points from the db ring carry catalog ids; legacy file backups are
  // `season_<ts>.json`. Route each read/delete by that id shape.
  async getBackup(seasonId, id) {
    if (!this._ok() || !seasonId) return null;
    if (!/^season_.*\.json$/.test(id)) {
      const cp = await this._ensureCatalog();
      if (cp) { try { return await cp.getBackup(seasonId, id); } catch (e) {} }
      return null;
    }
    try { return JSON.parse(await this.fs.readTextFile(`${this._backupsDir(seasonId)}/${id}`, { baseDir: this.baseDir })).data; }
    catch (e) { return null; }
  }
  async deleteBackup(seasonId, id) {
    if (!this._ok() || !seasonId) return;
    if (!/^season_.*\.json$/.test(id)) {
      const cp = await this._ensureCatalog();
      if (cp) { try { await cp.deleteBackup(seasonId, id); } catch (e) {} }
      return;
    }
    try { await this.fs.remove(`${this._backupsDir(seasonId)}/${id}`, { baseDir: this.baseDir }); } catch (e) {}
  }
  async _prune(seasonId) {
    if (!seasonId) return;
    let entries = [];
    try { entries = await this.fs.readDir(this._backupsDir(seasonId), { baseDir: this.baseDir }); } catch (e) { return; }
    const names = entries
      .filter(e => !e.isDirectory && /^season_.*\.json$/.test(e.name || ''))
      .map(e => e.name)
      .sort();
    const extra = names.slice(0, Math.max(0, names.length - this.RETENTION));
    for (const n of extra) {
      try { await this.fs.remove(`${this._backupsDir(seasonId)}/${n}`, { baseDir: this.baseDir }); } catch (e) {}
    }
  }

  // ---- persistent film library ----

  supportsFilm() { return this._ok(); }

  _filmsDir(gameId) { return `seasons/${this.currentId}/films/${gameId}`; }

  async importFilm(gameId, files, onProgress) {
    if (!this._ok() || !this.currentId) return null;
    const dir = this._filmsDir(gameId);
    await this.fs.mkdir(dir, { baseDir: this.baseDir, recursive: true });
    const result = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const relPath = this._filmRelativePath(file);
      const dest = `${dir}/${relPath}`;
      const parent = dest.split('/').slice(0, -1).join('/');
      if (parent && parent !== dir) await this.fs.mkdir(parent, { baseDir: this.baseDir, recursive: true });
      if (await this._exists(dest)) {
        result.push(relPath);
        if (onProgress) onProgress(i + 1, files.length, file.name);
        continue;
      }
      // STREAM in chunks. file.arrayBuffer() on a whole-game film (often
      // 1-4+ GB) exceeds the WebView's single-buffer limit and threw, the
      // import silently died, and the game reopened to a dead player
      // (field-reported). Chunked appends use the same write-file
      // permission and keep memory flat regardless of film size.
      await this._writeFileStreamed(dest, file);
      result.push(relPath);
      if (onProgress) onProgress(i + 1, files.length, file.name);
    }
    return result;
  }

  _filmRelativePath(file) {
    const raw = String((file && (file.webkitRelativePath || file.relativePath || file.path || file.name)) || '').replace(/\\/g, '/');
    const parts = raw.split('/').filter(part => part && part !== '.' && part !== '..' && !/^[A-Za-z]:$/.test(part));
    return parts.join('/') || String((file && file.name) || 'film.mp4').replace(/[\\/]/g, '_');
  }

  /** Write a Blob/File to disk in ~32 MB appends (no whole-file buffering). */
  async _writeFileStreamed(dest, file) {
    const CHUNK = 32 * 1024 * 1024;
    const reader = file.stream().getReader();
    let parts = [], partBytes = 0, first = true;
    const flush = async () => {
      if (!partBytes && !first) return;
      const merged = new Uint8Array(partBytes);
      let off = 0;
      for (const p of parts) { merged.set(p, off); off += p.byteLength; }
      await this.fs.writeFile(dest, merged,
        first ? { baseDir: this.baseDir } : { baseDir: this.baseDir, append: true });
      first = false; parts = []; partBytes = 0;
    };
    try {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        parts.push(value);
        partBytes += value.byteLength;
        if (partBytes >= CHUNK) await flush();
      }
      await flush();   // tail (or creates an empty file for 0-byte input)
    } catch (e) {
      // Don't leave a truncated video behind — it would "exist" and block
      // re-import while being unplayable.
      try { await this.fs.remove(dest, { baseDir: this.baseDir }); } catch (e2) {}
      throw e;
    }
  }

  async filmUrl(gameId, filename) {
    if (!this._ok() || !this.currentId) return null;
    const filePath = typeof filename === 'string' ? filename : (filename && (filename.path || filename.name)) || '';
    const rel = `${this._filmsDir(gameId)}/${filePath}`;
    if (!(await this._exists(rel))) return null;
    const tauri = window.__TAURI__;
    const convert = tauri?.core?.convertFileSrc;
    const join = tauri?.path?.join;
    const base = await this.dataDirPath();
    if (!convert || !join || !base) return null;
    const abs = await join(base, 'seasons', String(this.currentId), 'films', String(gameId), ...String(filePath).split('/'));
    return convert(abs);
  }

  async deleteFilm(gameId) {
    if (!this._ok() || !this.currentId) return;
    const dir = this._filmsDir(gameId);
    try {
      if (await this._exists(dir))
        await this.fs.remove(dir, { baseDir: this.baseDir, recursive: true });
    } catch (e) {}
  }

  async managedGameDir(gameId) {
    if (!this._ok() || !this.currentId || !gameId) return '';
    const pathApi = window.__TAURI__?.path;
    if (!pathApi?.appDataDir || !pathApi?.join) return this._filmsDir(gameId);
    try { return await pathApi.join(await pathApi.appDataDir(), 'seasons', String(this.currentId), 'films', String(gameId)); }
    catch { return this._filmsDir(gameId); }
  }
  async listFilmFiles(gameId) {
    if (!this._ok() || !this.currentId) return [];
    const dir = this._filmsDir(gameId);
    try {
      if (!(await this._exists(dir))) return [];
      const out = [];
      const walk = async (relDir, prefix = '') => {
        const entries = await this.fs.readDir(relDir, { baseDir: this.baseDir });
        for (const e of entries) {
          if (e.isDirectory) {
            await walk(`${relDir}/${e.name}`, `${prefix}${e.name}/`);
          } else {
            out.push({ name: e.name, path: `${prefix}${e.name}` });
          }
        }
      };
      await walk(dir);
      return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    } catch (e) { return []; }
  }

  // ---- linked film library (coach-owned folder, referenced not copied) ----
  // Film lives where the coach keeps it (e.g. D:\Football\Film\<game>); a linked
  // game stores `filmDir` (a path under the library root) and its plays reference
  // clips within it. Nothing is copied into app data. The static $APPDATA scope
  // (managed film) is untouched, so linked + managed games coexist.
  supportsLinkedFilm() { return this._ok(); }
  getFilmStorageMode() {
    try {
      const saved = localStorage.getItem('ffa_film_storage_mode') || '';
      if (saved === 'linked' || saved === 'managed') return saved;
      // Coaches who linked film before the setup screen existed already made
      // an intentional choice. Infer it instead of interrupting them again.
      return this.getLibraryRoot() ? 'linked' : '';
    } catch (e) { return ''; }
  }

  setFilmStorageMode(mode) {
    if (mode !== 'linked' && mode !== 'managed') return false;
    try { localStorage.setItem('ffa_film_storage_mode', mode); return true; }
    catch (e) { return false; }
  }
  getLibraryRoot() { try { return localStorage.getItem('ffa_film_library_root') || ''; } catch (e) { return ''; } }

  async setLibraryRoot(path) {
    if (path && !await this.allowLibraryDir(path)) return false;
    try {
      localStorage.setItem('ffa_film_library_root', path || '');
      return true;
    } catch (e) {
      return false;
    }
  }

  /** Grant the WebView + fs plugin runtime access to a folder (Rust command). */
  async allowLibraryDir(path) {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (!core || !core.invoke || !path) return false;
    try { await core.invoke('allow_library_dir', { path }); return true; }
    catch (e) { console.warn('allow_library_dir failed:', e && (e.message || e)); return false; }
  }

  /** On startup, re-grant scope to the saved library root so linked film plays. */
  async initLibraryRoot() {
    const root = this.getLibraryRoot();
    if (root) await this.allowLibraryDir(root);
    return root;
  }

  /** Coach picks a folder via the native dialog. Returns the absolute path or ''. */
  async pickFolder(defaultPath) {
    const dlg = window.__TAURI__ && window.__TAURI__.dialog;
    if (!dlg || !dlg.open) return '';
    try {
      const sel = await dlg.open({ directory: true, multiple: false, defaultPath: defaultPath || this.getLibraryRoot() || undefined });
      return typeof sel === 'string' ? sel : '';
    } catch (e) { return ''; }
  }

  /** Absolute base dir of a linked game = root + filmDir (or filmDir if absolute). */
  async linkedGameDir(filmDir) {
    if (!filmDir) return '';
    if (/^([A-Za-z]:[\\/]|\/)/.test(filmDir)) return filmDir;   // already absolute
    const root = this.getLibraryRoot();
    if (!root) return '';
    if (filmDir === '.') return root;
    const join = window.__TAURI__ && window.__TAURI__.path && window.__TAURI__.path.join;
    try { return join ? await join(root, ...String(filmDir).split('/')) : `${root}/${filmDir}`; }
    catch (e) { return `${root}/${filmDir}`; }
  }

  async linkedAbs(absDir, relPath) {
    const join = window.__TAURI__ && window.__TAURI__.path && window.__TAURI__.path.join;
    try { return join ? await join(absDir, ...String(relPath).split('/')) : `${absDir}/${relPath}`; }
    catch (e) { return `${absDir}/${relPath}`; }
  }

  /** Path of an absolute folder RELATIVE to the library root ('' if not under it). */
  relToRoot(absPath) { return TauriBackend.relToRoot(this.getLibraryRoot(), absPath); }
  /** Distinguish the root itself (`.`) from an outside-root folder (`null`). */
  gameDirFromRoot(absPath) { return TauriBackend.gameDirFromRoot(this.getLibraryRoot(), absPath); }
  static gameDirFromRoot(root, absPath) {
    if (!root || !absPath) return null;
    const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '');
    const r = norm(root), p = norm(absPath);
    if (p.toLowerCase() === r.toLowerCase()) return '.';
    const prefix = r + '/';
    return p.toLowerCase().startsWith(prefix.toLowerCase()) ? p.slice(prefix.length) : null;
  }
  async openLinkedDir(filmDir) {
    const absDir = await this.linkedGameDir(filmDir);
    if (!absDir || !this.isLinkedDirAllowed(absDir)) return '';
    if (!await this.allowLibraryDir(absDir)) return '';
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (!core?.invoke) return '';
    try { await core.invoke('open_library_dir', { path: absDir }); return absDir; }
    catch (e) { return ''; }
  }
  // Pure, testable: strip the root prefix; '' when absPath isn't under root.
  static relToRoot(root, absPath) {
    if (!root || !absPath) return '';
    const norm = s => String(s).replace(/\\/g, '/').replace(/\/+$/, '');
    const r = norm(root), p = norm(absPath);
    if (p.toLowerCase() === r.toLowerCase()) return '';
    const prefix = r + '/';
    if (p.toLowerCase().startsWith(prefix.toLowerCase())) return p.slice(prefix.length);
    return '';   // outside the root — caller stores the absolute path instead
  }

  // ---- P1-7: consent-scoped linked-film access ----------------------------
  // Tauri asset/fs scope isn't persisted across app restarts, so _autoLoadLinkedFilm
  // must re-grant a linked game's folder on every open. Granting whatever absolute
  // path a game's filmDir names would let an IMPORTED season silently widen the
  // WebView's filesystem scope to an attacker-chosen directory. So we only re-grant
  // folders the coach actually consented to: those under the library root, or ones
  // explicitly picked via the native dialog (remembered per-machine in localStorage).
  static _normPath(s) { return String(s || '').replace(/\\/g, '/').replace(/\/+$/, ''); }
  /** Pure/testable: is absPath under the root, or under a coach-linked dir? */
  static isDirAllowed(root, linkedDirs, absPath) {
    const p = TauriBackend._normPath(absPath);
    if (!p) return false;
    const under = (base) => { const b = TauriBackend._normPath(base); return !!b && (p.toLowerCase() === b.toLowerCase() || p.toLowerCase().startsWith(b.toLowerCase() + '/')); };
    if (under(root)) return true;
    return (linkedDirs || []).some(under);
  }
  _linkedDirs() { try { return JSON.parse(localStorage.getItem('ffa_linked_dirs') || '[]') || []; } catch { return []; } }
  /** Record a folder the coach explicitly linked (native-dialog pick = consent). */
  rememberLinkedDir(absPath) {
    const norm = TauriBackend._normPath(absPath);
    if (!norm) return;
    const list = this._linkedDirs();
    if (!list.some(d => TauriBackend._normPath(d).toLowerCase() === norm.toLowerCase())) {
      list.push(norm);
      try { localStorage.setItem('ffa_linked_dirs', JSON.stringify(list)); } catch (e) {}
    }
  }
  isLinkedDirAllowed(absPath) { return TauriBackend.isDirAllowed(this.getLibraryRoot(), this._linkedDirs(), absPath); }

  /** Walk an absolute directory for video files → [{name, path}] (path rel to dir). */
  async listLinkedFilm(absDir) {
    if (!this._ok() || !absDir) return [];
    const exts = /\.(mp4|mov|m4v|webm|avi|mkv)$/i;
    const join = window.__TAURI__ && window.__TAURI__.path && window.__TAURI__.path.join;
    const out = [];
    const walk = async (dir, prefix = '') => {
      let entries; try { entries = await this.fs.readDir(dir); } catch (e) { return; }
      for (const e of entries) {
        const child = join ? await join(dir, e.name) : `${dir}/${e.name}`;
        if (e.isDirectory) await walk(child, `${prefix}${e.name}/`);
        else if (exts.test(e.name || '')) out.push({ name: e.name, path: `${prefix}${e.name}` });
      }
    };
    await walk(absDir);
    return out.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
  }

  /** Asset URL for an absolute film path (linked). Scope must already allow it. */
  async linkedFilmUrl(absPath) {
    const core = window.__TAURI__ && window.__TAURI__.core;
    if (!core || !core.convertFileSrc || !absPath) return null;
    try { if (!(await this.fs.exists(absPath))) return null; } catch (e) {}
    return core.convertFileSrc(absPath);
  }

  // ---- durable disk ----

  supportsDisk() { return this._ok(); }
  diskStatus() {
    // The durable target is the Documents mirror — it survives app-data wipes.
    return { supported: this._ok(), bound: this._ok(), name: this._ok() ? 'Documents › GridIron IQ' : '', lastWrite: this._lastWrite };
  }

  /** Absolute path of the app-data folder (where seasons live); '' if N/A. */
  async dataDirPath() {
    try {
      const p = window.__TAURI__ && window.__TAURI__.path;
      if (p && p.appDataDir) return await p.appDataDir();
    } catch (e) {}
    return '';
  }

  /** Absolute path of the durable Documents mirror folder; '' if N/A. */
  async mirrorDirPath() {
    try {
      const p = window.__TAURI__ && window.__TAURI__.path;
      if (p && p.documentDir && p.join) return await p.join(await p.documentDir(), this.MIRROR_ROOT);
    } catch (e) {}
    return '';
  }

  /**
   * Mirror the season (and, on snapshots, a backup) to the Documents folder.
   * Best-effort: a failure here must never block the canonical app-data save.
   * PC-1: explicit seasonId, no ambient this.currentId.
   */
  async _mirrorToDocuments(seasonId, data, opts = {}) {
    if (!this._ok() || !seasonId || this.mirrorDir === undefined) return;
    try {
      await this.fs.mkdir(this._mirrorSeasonDir(seasonId), { baseDir: this.mirrorDir, recursive: true });
      await this.fs.writeTextFile(this._mirrorSeasonFile(seasonId), JSON.stringify(data, null, 2), { baseDir: this.mirrorDir });
      if (opts.snapshot) {
        const bdir = this._mirrorBackupsDir(seasonId);
        await this.fs.mkdir(bdir, { baseDir: this.mirrorDir, recursive: true });
        const id = `season_${this._tsSlug()}.json`;
        const meta = this._meta(data, opts.label); meta.id = id;
        await this.fs.writeTextFile(`${bdir}/${id}`, JSON.stringify({ ...meta, data }, null, 2), { baseDir: this.mirrorDir });
        await this._pruneMirror(seasonId);
      }
    } catch (e) { /* mirror is best-effort */ }
  }

  async _pruneMirror(seasonId) {
    if (!seasonId) return;
    try {
      const entries = await this.fs.readDir(this._mirrorBackupsDir(seasonId), { baseDir: this.mirrorDir });
      const names = entries
        .filter(e => !e.isDirectory && /^season_.*\.json$/.test(e.name || ''))
        .map(e => e.name).sort();
      const extra = names.slice(0, Math.max(0, names.length - this.RETENTION));
      for (const n of extra) {
        try { await this.fs.remove(`${this._mirrorBackupsDir(seasonId)}/${n}`, { baseDir: this.mirrorDir }); } catch (e) {}
      }
    } catch (e) {}
  }

  /**
   * Open the durable Documents mirror folder in the OS file manager (this is the
   * copy that survives uninstall / "delete app data", so it's the one a coach
   * wants to find). Falls back to the app-data folder if the mirror path is
   * unavailable. Returns the folder path for callers that can't open it.
   */
  async openDataDir() {
    if (!this._ok()) return '';
    const dir = (await this.mirrorDirPath()) || (await this.dataDirPath());
    const op = window.__TAURI__ && window.__TAURI__.opener;
    try {
      if (op && op.openPath && dir) { await op.openPath(dir); }
      else if (op && op.revealItemInDir && dir) { await op.revealItemInDir(dir); }
    } catch (e) { /* fall through — caller shows the path */ }
    return dir;
  }

  // PC-1: the canonical write is the gate for BOTH the snapshot backup and
  // the Documents mirror. Previously the mirror wrote unconditionally, so a
  // rejected canonical save (wrong destination/payload id, disk full,
  // catalog unavailable) still landed the rejected data in the recovery
  // mirror -- reproduced directly before this fix: a rejected import
  // returned ok:false yet still produced one Documents-mirror write
  // containing the rejected season name.
  async writeDisk(seasonId, data, opts = {}) {
    const ok = await this.saveSeason(seasonId, data);
    if (!ok) return false;
    if (opts.snapshot) await this.createBackup(seasonId, data, opts.label);
    await this._mirrorToDocuments(seasonId, data, opts);
    this._lastWrite = Date.now();
    return ok;
  }
}

export function detectBackend() {
  if (typeof window !== 'undefined' && window.__TAURI__) return new TauriBackend();
  return new BrowserBackend();
}

/**
 * Save a generated file (CSV / HTML report / PNG / season JSON / cut-up).
 * Browser: classic anchor download. Desktop (Tauri): anchor downloads are
 * SILENTLY IGNORED by the WebView (field-reported: "export buttons do
 * nothing"), so route through the native save dialog + fs plugin instead.
 * Exposed on window so every module reaches it without import surgery
 * (the bundle shares one scope; the modular build gets it at load time).
 */
export async function ffaSaveBlob(blob, filename) {
  const t = typeof window !== 'undefined' && window.__TAURI__;
  if (t && t.dialog && t.fs) {
    try {
      const path = await t.dialog.save({ defaultPath: filename });
      if (!path) return false;                       // user cancelled
      // Stream the blob in ~32 MB chunks to avoid buffering multi-GB files
      // in memory all at once (same pattern as TauriBackend._writeFileStreamed).
      const CHUNK = 32 * 1024 * 1024;
      const reader = blob.stream().getReader();
      let parts = [], partBytes = 0, first = true;
      const flush = async () => {
        if (!partBytes && !first) return;
        const merged = new Uint8Array(partBytes);
        let off = 0;
        for (const p of parts) { merged.set(p, off); off += p.byteLength; }
        await t.fs.writeFile(path, merged, first ? undefined : { append: true });
        first = false; parts = []; partBytes = 0;
      };
      try {
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          parts.push(value);
          partBytes += value.byteLength;
          if (partBytes >= CHUNK) await flush();
        }
        await flush();   // tail (or creates an empty file for 0-byte input)
      } catch (streamErr) {
        // Don't leave a partial file behind.
        try { await t.fs.remove(path); } catch (_) {}
        throw streamErr;
      }
      try { window.app?.history?._toast?.(`Saved: ${path}`); } catch (e) { /* toast is best-effort */ }
      return true;
    } catch (e) {
      console.warn('Native save failed; falling back to anchor download', e);
      try { window.app?.history?._toast?.('Save failed — try saving into Documents or Downloads.'); } catch (e2) {}
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return true;
}
if (typeof window !== 'undefined') window.ffaSaveBlob = ffaSaveBlob;
