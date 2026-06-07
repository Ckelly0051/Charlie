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

  // ---- canonical season (scoped to currentId) ----
  async loadSeason() { return null; }
  async saveSeason(_data) {}

  // ---- backup ring (scoped to currentId) ----
  async listBackups() { return []; }            // [{id,t,label,seasonName,games,plays}]
  async getBackup(_id) { return null; }          // full season data
  async createBackup(_data, _label) { return null; }
  async deleteBackup(_id) {}

  // ---- durable disk (optional) ----
  supportsDisk() { return false; }
  diskStatus() { return { supported: false, bound: false, name: '', lastWrite: 0 }; }
  async bindDisk() { return false; }
  async restoreDiskBinding() { return false; }
  async forgetDisk() {}
  /** Write the live file (+ a snapshot file when snapshot:true). */
  async writeDisk(_data, _opts) { return false; }

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
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
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
      level: meta.level || '', games: 0, plays: 0, created: now, updated: now, lastOpened: now,
    };
    lib.push(entry);
    this._writeLib(lib);
    return entry;
  }

  async deleteSeason(id) {
    try { localStorage.removeItem(this._seasonKey(id)); } catch (e) {}
    this._writeLib(this._readLib().filter(s => s.id !== id));
    // Drop this season's backups.
    try {
      const all = await this._tx('backups', 'readonly', os => os.getAll());
      for (const r of (all || [])) if (r && r.seasonId === id) await this.deleteBackup(r.id);
    } catch (e) {}
    if (this.currentId === id) this.currentId = null;
  }

  async touchOpened(id) {
    const lib = this._readLib();
    const e = lib.find(s => s.id === id);
    if (e) { e.lastOpened = new Date().toISOString(); this._writeLib(lib); }
  }

  // ---- canonical (scoped to currentId) ----
  async loadSeason() {
    if (!this.currentId) return null;
    try { return JSON.parse(localStorage.getItem(this._seasonKey(this.currentId)) || 'null'); }
    catch (e) { return null; }
  }
  async saveSeason(data) {
    if (!this.currentId) return false;
    try { localStorage.setItem(this._seasonKey(this.currentId), JSON.stringify(data)); }
    catch (e) { return false; }   // quota — the disk/backup ring is the durable copy
    this._touchMeta(data);
    return true;
  }
  /** Refresh the index entry (counts, name, updated) after a save. */
  _touchMeta(data) {
    const lib = this._readLib();
    const i = lib.findIndex(s => s.id === this.currentId);
    if (i < 0) return;
    const m = this._seasonMeta(this.currentId, data);
    lib[i] = { ...lib[i], ...m, created: lib[i].created, lastOpened: lib[i].lastOpened };
    this._writeLib(lib);
  }

  // ---- IndexedDB (handles + backups) ----
  _idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ffa_fs', 2);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('handles')) db.createObjectStore('handles');
        if (!db.objectStoreNames.contains('backups')) db.createObjectStore('backups');
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
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

  // ---- backup ring (scoped to currentId via seasonId field) ----
  async createBackup(data, label) {
    if (!this.currentId) return null;
    const json = JSON.stringify(data);
    const recent = await this.listBackups();
    if (recent.length) {
      const last = await this.getBackup(recent[0].id);
      if (last && JSON.stringify(last) === json) return null;
    }
    const id = Date.now();
    const rec = { id, seasonId: this.currentId, ...this._meta(data, label), data: JSON.parse(json) };
    await this._tx('backups', 'readwrite', os => os.put(rec, id));
    await this._prune();
    const { data: _omit, ...meta } = rec;
    return meta;
  }
  async listBackups() {
    const all = await this._tx('backups', 'readonly', os => os.getAll());
    return (all || [])
      .filter(r => r && r.seasonId === this.currentId)
      .map(({ data, ...meta }) => meta)
      .sort((a, b) => b.id - a.id);
  }
  async getBackup(id) {
    const rec = await this._tx('backups', 'readonly', os => os.get(id));
    return rec ? rec.data : null;
  }
  async deleteBackup(id) { await this._tx('backups', 'readwrite', os => os.delete(id)); }
  async _prune() {
    const metas = await this.listBackups();              // newest first, this season
    const extra = metas.slice(this.RETENTION);
    for (const m of extra) await this.deleteBackup(m.id);
  }

  // ---- disk (File System Access API) ----
  supportsDisk() { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }
  diskStatus() {
    return {
      supported: this.supportsDisk(),
      bound: !!this.dirHandle,
      name: this.dirHandle ? this.dirHandle.name : '',
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

  async writeDisk(data, opts = {}) {
    if (!this.dirHandle || this._writing) return false;
    if (!(await this._dirPermitted(!!opts.prompt))) return false;
    this._writing = true;
    try {
      const json = JSON.stringify(data, null, 2);
      // Per-season filename so multiple seasons don't overwrite one file.
      const base = this.slugify(data.seasonName || this.currentId || 'season');
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
    const lib = await this._readLib();
    return lib.slice().sort((a, b) =>
      String(b.lastOpened || b.updated || '').localeCompare(String(a.lastOpened || a.updated || '')));
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
      level: meta.level || '', games: 0, plays: 0, created: now, updated: now, lastOpened: now,
    };
    lib.push(entry);
    await this._writeLib(lib);
    return entry;
  }

  async deleteSeason(id) {
    if (!this._ok()) return;
    try { if (await this._exists(this._seasonDir(id))) await this.fs.remove(this._seasonDir(id), { baseDir: this.baseDir, recursive: true }); } catch (e) {}
    await this._writeLib((await this._readLib()).filter(s => s.id !== id));
    delete this._dirReady[id];
    if (this.currentId === id) this.currentId = null;
  }

  async touchOpened(id) {
    const lib = await this._readLib();
    const e = lib.find(s => s.id === id);
    if (e) { e.lastOpened = new Date().toISOString(); await this._writeLib(lib); }
  }

  // ---- canonical (scoped to currentId) ----
  async loadSeason() {
    if (!this._ok() || !this.currentId) return null;
    if (await this._exists(this._seasonFile(this.currentId))) return this._readJson(this._seasonFile(this.currentId));
    return null;
  }
  async saveSeason(data) {
    if (!this._ok() || !this.currentId) return false;
    try {
      await this._ensureSeasonDir(this.currentId);
      await this._writeJson(this._seasonFile(this.currentId), data);
      await this._touchMeta(data);
      return true;
    } catch (e) { return false; }
  }
  async _touchMeta(data) {
    const lib = await this._readLib();
    const i = lib.findIndex(s => s.id === this.currentId);
    if (i < 0) return;
    const m = this._seasonMeta(this.currentId, data);
    lib[i] = { ...lib[i], ...m, created: lib[i].created, lastOpened: lib[i].lastOpened };
    await this._writeLib(lib);
  }

  // ---- backup ring (scoped to currentId) ----
  async createBackup(data, label) {
    if (!this._ok() || !this.currentId) return null;
    const json = JSON.stringify(data);
    if (this._lastBackupJson && this._lastBackupJson === json) return null;
    await this._ensureSeasonDir(this.currentId);
    const id = `season_${this._tsSlug()}.json`;
    const meta = this._meta(data, label);
    meta.id = id;
    const payload = JSON.stringify({ ...meta, data }, null, 2);
    try { await this.fs.writeTextFile(`${this._backupsDir(this.currentId)}/${id}`, payload, { baseDir: this.baseDir }); }
    catch (e) { return null; }
    this._lastBackupJson = json;
    await this._prune();
    return meta;
  }
  async listBackups() {
    if (!this._ok() || !this.currentId) return [];
    await this._ensureSeasonDir(this.currentId);
    let entries = [];
    try { entries = await this.fs.readDir(this._backupsDir(this.currentId), { baseDir: this.baseDir }); } catch (e) { return []; }
    const out = [];
    const reads = [];
    for (const e of entries) {
      if (e.isDirectory || !/^season_.*\.json$/.test(e.name || '')) continue;
      reads.push(
        this.fs.readTextFile(`${this._backupsDir(this.currentId)}/${e.name}`, { baseDir: this.baseDir })
          .then(text => {
            const rec = JSON.parse(text);
            out.push({ id: e.name, t: rec.t, label: rec.label, seasonName: rec.seasonName, games: rec.games, plays: rec.plays });
          })
          .catch(() => {})
      );
    }
    await Promise.all(reads);
    return out.sort((a, b) => (a.id < b.id ? 1 : -1));
  }
  async getBackup(id) {
    if (!this._ok() || !this.currentId) return null;
    try { return JSON.parse(await this.fs.readTextFile(`${this._backupsDir(this.currentId)}/${id}`, { baseDir: this.baseDir })).data; }
    catch (e) { return null; }
  }
  async deleteBackup(id) {
    if (!this._ok() || !this.currentId) return;
    try { await this.fs.remove(`${this._backupsDir(this.currentId)}/${id}`, { baseDir: this.baseDir }); } catch (e) {}
  }
  async _prune() {
    if (!this.currentId) return;
    let entries = [];
    try { entries = await this.fs.readDir(this._backupsDir(this.currentId), { baseDir: this.baseDir }); } catch (e) { return; }
    const names = entries
      .filter(e => !e.isDirectory && /^season_.*\.json$/.test(e.name || ''))
      .map(e => e.name)
      .sort();
    const extra = names.slice(0, Math.max(0, names.length - this.RETENTION));
    for (const n of extra) {
      try { await this.fs.remove(`${this._backupsDir(this.currentId)}/${n}`, { baseDir: this.baseDir }); } catch (e) {}
    }
  }

  supportsDisk() { return this._ok(); }
  diskStatus() {
    return { supported: this._ok(), bound: this._ok(), name: this._ok() ? 'App data folder' : '', lastWrite: this._lastWrite };
  }

  /** Absolute path of the app-data folder (where seasons live); '' if N/A. */
  async dataDirPath() {
    try {
      const p = window.__TAURI__ && window.__TAURI__.path;
      if (p && p.appDataDir) return await p.appDataDir();
    } catch (e) {}
    return '';
  }

  /**
   * Open the app-data folder in the OS file manager. Returns the folder path so
   * the caller can show it as a fallback when no opener API is available.
   */
  async openDataDir() {
    if (!this._ok()) return '';
    const dir = await this.dataDirPath();
    const op = window.__TAURI__ && window.__TAURI__.opener;
    try {
      if (op && op.openPath && dir) { await op.openPath(dir); }
      else if (op && op.revealItemInDir && dir) { await op.revealItemInDir(dir + this.LIB); }
    } catch (e) { /* fall through — caller shows the path */ }
    return dir;
  }

  async writeDisk(data, opts = {}) {
    const ok = await this.saveSeason(data);
    if (opts.snapshot) await this.createBackup(data, opts.label);
    if (ok) this._lastWrite = Date.now();
    return ok;
  }
}

export function detectBackend() {
  if (typeof window !== 'undefined' && window.__TAURI__) return new TauriBackend();
  return new BrowserBackend();
}
