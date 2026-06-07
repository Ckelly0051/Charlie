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
 * Responsibilities:
 *   1. Canonical season persistence (load/save the one current season).
 *   2. A backup ring — timestamped snapshots you can restore from, so a bad
 *      save is always recoverable ("undo a save").
 *   3. Optional durable disk backup to a real folder.
 *
 * `detectBackend()` picks the right implementation for the environment.
 */
export class StorageBackend {
  constructor() { this.RETENTION = 25; }
  name() { return 'base'; }

  async init() {}

  // ---- canonical season ----
  async loadSeason() { return null; }
  async saveSeason(_data) {}

  // ---- backup ring ----
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
  _tsSlug(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}_${p(d.getHours())}-${p(d.getMinutes())}-${p(d.getSeconds())}`;
  }
}

/**
 * BrowserBackend — canonical season in localStorage, backup ring in IndexedDB,
 * and (Chromium) real disk backups via the File System Access API: a chosen
 * folder receives `season.json` (live) plus `backups/season_<ts>.json`
 * snapshots, pruned to the retention window.
 */
export class BrowserBackend extends StorageBackend {
  constructor() {
    super();
    this.KEY = 'ffa_season';
    this.dirHandle = null;
    this._lastWrite = 0;
    this._writing = false;
  }
  name() { return 'browser'; }

  // ---- canonical ----
  async loadSeason() {
    try { return JSON.parse(localStorage.getItem(this.KEY) || 'null'); }
    catch (e) { return null; }
  }
  async saveSeason(data) {
    try { localStorage.setItem(this.KEY, JSON.stringify(data)); return true; }
    catch (e) { return false; }   // quota — the disk/backup ring is the durable copy
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

  // ---- backup ring ----
  async createBackup(data, label) {
    // Skip a snapshot identical to the most recent one (no churn on no-ops).
    const json = JSON.stringify(data);
    const recent = await this.listBackups();
    if (recent.length) {
      const last = await this.getBackup(recent[0].id);
      if (last && JSON.stringify(last) === json) return null;
    }
    const id = Date.now();
    const rec = { id, ...this._meta(data, label), data: JSON.parse(json) };
    await this._tx('backups', 'readwrite', os => os.put(rec, id));
    await this._prune();
    const { data: _omit, ...meta } = rec;
    return meta;
  }
  async listBackups() {
    const all = await this._tx('backups', 'readonly', os => {
      const r = os.getAll(); return r;
    });
    return (all || [])
      .map(({ data, ...meta }) => meta)
      .sort((a, b) => b.id - a.id);
  }
  async getBackup(id) {
    const rec = await this._tx('backups', 'readonly', os => os.get(id));
    return rec ? rec.data : null;
  }
  async deleteBackup(id) { await this._tx('backups', 'readwrite', os => os.delete(id)); }
  async _prune() {
    const metas = await this.listBackups();              // newest first
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
      await this._writeInto(this.dirHandle, 'season.json', json);
      if (opts.snapshot) {
        const backups = await this.dirHandle.getDirectoryHandle('backups', { create: true });
        await this._writeInto(backups, `season_${this._tsSlug()}.json`, json);
        await this._pruneDisk(backups);
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
  async _pruneDisk(backups) {
    const names = [];
    for await (const [name, handle] of backups.entries()) {
      if (handle.kind === 'file' && /^season_.*\.json$/.test(name)) names.push(name);
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
    this.SEASON = 'season.json';
    this.BACKUPS = 'backups';
    this._lastWrite = 0;
    this._backupsReady = false;
    this._lastBackupJson = null;
  }
  name() { return 'tauri'; }

  _ok() { return !!this.fs; }

  async loadSeason() {
    if (!this._ok()) return null;
    try {
      if (await this.fs.exists(this.SEASON, { baseDir: this.baseDir })) {
        return JSON.parse(await this.fs.readTextFile(this.SEASON, { baseDir: this.baseDir }));
      }
    } catch (e) {}
    return null;
  }
  async saveSeason(data) {
    if (!this._ok()) return false;
    try {
      // The app-data folder (e.g. %APPDATA%\com.gridironiq.app on Windows) does
      // not exist on a fresh install. writeTextFile does NOT create parent dirs,
      // so without this the very first save throws and is silently swallowed —
      // nothing persists and reopening the app shows an empty season. Ensuring
      // the dir (recursive mkdir creates the app-data root) is the fix.
      await this._ensureDataDir();
      await this.fs.writeTextFile(this.SEASON, JSON.stringify(data, null, 2), { baseDir: this.baseDir });
      return true;
    } catch (e) { return false; }
  }

  /** Create the app-data root (+ backups/) if missing. Idempotent. */
  async _ensureDataDir() {
    if (this._backupsReady) return;
    try {
      // recursive mkdir of the backups subfolder also creates the app-data root.
      if (!(await this.fs.exists(this.BACKUPS, { baseDir: this.baseDir })))
        await this.fs.mkdir(this.BACKUPS, { baseDir: this.baseDir, recursive: true });
      this._backupsReady = true;
    } catch (e) {}
  }

  async _ensureBackups() { return this._ensureDataDir(); }
  async createBackup(data, label) {
    if (!this._ok()) return null;
    const json = JSON.stringify(data);
    if (this._lastBackupJson && this._lastBackupJson === json) return null;
    await this._ensureBackups();
    const id = `season_${this._tsSlug()}.json`;
    const meta = this._meta(data, label);
    meta.id = id;
    const payload = JSON.stringify({ ...meta, data }, null, 2);
    try { await this.fs.writeTextFile(`${this.BACKUPS}/${id}`, payload, { baseDir: this.baseDir }); }
    catch (e) { return null; }
    this._lastBackupJson = json;
    await this._prune();
    return meta;
  }
  async listBackups() {
    if (!this._ok()) return [];
    await this._ensureBackups();
    let entries = [];
    try { entries = await this.fs.readDir(this.BACKUPS, { baseDir: this.baseDir }); } catch (e) { return []; }
    const out = [];
    const reads = [];
    for (const e of entries) {
      if (e.isDirectory || !/^season_.*\.json$/.test(e.name || '')) continue;
      reads.push(
        this.fs.readTextFile(`${this.BACKUPS}/${e.name}`, { baseDir: this.baseDir })
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
    if (!this._ok()) return null;
    try { return JSON.parse(await this.fs.readTextFile(`${this.BACKUPS}/${id}`, { baseDir: this.baseDir })).data; }
    catch (e) { return null; }
  }
  async deleteBackup(id) {
    if (!this._ok()) return;
    try { await this.fs.remove(`${this.BACKUPS}/${id}`, { baseDir: this.baseDir }); } catch (e) {}
  }
  async _prune() {
    let entries = [];
    try { entries = await this.fs.readDir(this.BACKUPS, { baseDir: this.baseDir }); } catch (e) { return; }
    const names = entries
      .filter(e => !e.isDirectory && /^season_.*\.json$/.test(e.name || ''))
      .map(e => e.name)
      .sort();
    const extra = names.slice(0, Math.max(0, names.length - this.RETENTION));
    for (const n of extra) {
      try { await this.fs.remove(`${this.BACKUPS}/${n}`, { baseDir: this.baseDir }); } catch (e) {}
    }
  }

  supportsDisk() { return this._ok(); }
  diskStatus() {
    return { supported: this._ok(), bound: this._ok(), name: this._ok() ? 'App data folder' : '', lastWrite: this._lastWrite };
  }

  /** Absolute path of the app-data folder (where season.json lives); '' if N/A. */
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
    await this._ensureDataDir();
    const dir = await this.dataDirPath();
    const op = window.__TAURI__ && window.__TAURI__.opener;
    try {
      if (op && op.openPath && dir) { await op.openPath(dir); }
      else if (op && op.revealItemInDir && dir) { await op.revealItemInDir(dir + this.SEASON); }
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
