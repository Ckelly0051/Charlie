/**
 * SeasonStore — the canonical "project = season" data container.
 *
 * One season holds many games; each game is the same per-game object the rest
 * of the app already serializes (plays, gameInfo, annotations, roster, …). The
 * season is the unit of work, so the app stops spawning a file artifact per
 * game / per save.
 *
 * Storage is hybrid (see CLAUDE.md "Season-as-Project"):
 *   1. Canonical store = the browser. The whole season lives under one
 *      localStorage key (`ffa_season`) and is autosaved continuously in place,
 *      so nothing proliferates.
 *   2. Backup / portability = a single Export/Import season file.
 *   3. Living file = File System Access API. When supported (Chromium), the
 *      season binds to one real file on disk and every save writes back to it.
 *      The handle is persisted in IndexedDB so it reconnects across sessions.
 *      Browsers without the API fall back to download/upload.
 *
 * Video is never stored (too large). Each game references its video filename;
 * the coach re-links the file when they open that game.
 */
export class SeasonStore {
  constructor() {
    this.KEY = 'ffa_season';
    this.SCHEMA = 5;
    this.data = null;
    this.fileHandle = null;       // FileSystemFileHandle when bound
    this._fileWriteTimer = null;
    this._writing = false;
  }

  // ---- lifecycle -----------------------------------------------------------

  load() {
    let parsed = null;
    try { parsed = JSON.parse(localStorage.getItem(this.KEY) || 'null'); } catch (e) {}
    this.data = (parsed && Array.isArray(parsed.games)) ? this._normalize(parsed) : this._empty();
    return this.data;
  }

  _empty() {
    const g = this.blankGame();
    return {
      version: this.SCHEMA, type: 'season',
      seasonName: '', teamProfile: {}, roster: [],
      games: [g], activeGameId: g.id,
    };
  }

  blankGame() {
    return {
      id: this._newId(), name: 'New Game',
      gameInfo: {}, plays: [], annotations: [],
      nextId: 1, currentPlayId: null,
      videoFileName: null, clipNames: [], isMultiClip: false,
    };
  }

  _newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  /** Coerce any loaded object into a well-formed season (back-compat safe). */
  _normalize(d) {
    d.version = this.SCHEMA; d.type = 'season';
    if (!Array.isArray(d.games) || !d.games.length) d.games = [this.blankGame()];
    d.games.forEach(g => {
      if (!g.id) g.id = this._newId();
      g.plays = g.plays || [];
      g.annotations = g.annotations || [];
      g.gameInfo = g.gameInfo || {};
      if (g.nextId == null) g.nextId = (g.plays.length + 1);
    });
    if (!d.activeGameId || !d.games.some(g => g.id === d.activeGameId)) {
      d.activeGameId = d.games[0].id;
    }
    d.teamProfile = d.teamProfile || {};
    d.roster = Array.isArray(d.roster) ? d.roster : [];
    d.seasonName = d.seasonName || '';
    return d;
  }

  /** Wrap a legacy single-game project object as a season game node. */
  gameFromLegacy(obj) {
    const g = this.blankGame();
    return {
      ...g,
      gameInfo: obj.gameInfo || {},
      plays: obj.plays || [],
      annotations: obj.annotations || [],
      nextId: obj.nextId || ((obj.plays || []).length + 1),
      currentPlayId: obj.currentPlayId || null,
      videoFileName: obj.videoFileName || null,
      clipNames: obj.clipNames || [],
      isMultiClip: !!obj.isMultiClip,
      name: this.gameName({ gameInfo: obj.gameInfo || {}, videoFileName: obj.videoFileName }),
    };
  }

  // ---- game accessors ------------------------------------------------------

  activeIndex() { return this.data.games.findIndex(g => g.id === this.data.activeGameId); }
  activeGame() { return this.data.games[this.activeIndex()] || null; }

  /** Friendly label derived from the game's own info. */
  gameName(g, fallbackIdx) {
    const gi = (g && g.gameInfo) || {};
    if (gi.opponent) return `vs ${gi.opponent}`;
    if (gi.projectName) return gi.projectName;
    if (g && g.videoFileName) return String(g.videoFileName).replace(/\.[^.]+$/, '');
    return 'Game ' + ((fallbackIdx != null ? fallbackIdx : 0) + 1);
  }

  /** Replace the active game's stored state with a freshly serialized game. */
  updateActiveGame(gameObj) {
    const i = this.activeIndex();
    if (i < 0) return;
    const id = this.data.games[i].id;
    gameObj.id = id;
    gameObj.name = this.gameName(gameObj, i);
    this.data.games[i] = gameObj;
  }

  addGame(gameObj) {
    const g = gameObj || this.blankGame();
    if (!g.id) g.id = this._newId();
    if (!g.name) g.name = this.gameName(g, this.data.games.length);
    this.data.games.push(g);
    this.data.activeGameId = g.id;
    return g;
  }

  removeGame(id) {
    const i = this.data.games.findIndex(g => g.id === id);
    if (i < 0) return null;
    this.data.games.splice(i, 1);
    if (!this.data.games.length) this.data.games.push(this.blankGame());
    if (this.data.activeGameId === id) {
      const next = this.data.games[Math.min(i, this.data.games.length - 1)];
      this.data.activeGameId = next.id;
    }
    return this.activeGame();
  }

  setActive(id) {
    if (this.data.games.some(g => g.id === id)) { this.data.activeGameId = id; return true; }
    return false;
  }

  /** True when the active game has no plays and no identifying game info. */
  isEmptyActive() {
    const g = this.activeGame();
    if (!g) return false;
    const gi = g.gameInfo || {};
    return (g.plays || []).length === 0 && !gi.opponent && !gi.projectName && !gi.date;
  }

  /** Chronological order (by gameInfo.date when present, else insertion). */
  gamesChrono() {
    return this.data.games
      .map((g, i) => ({ g, i, t: Date.parse((g.gameInfo && g.gameInfo.date) || '') }))
      .sort((a, b) => {
        const at = isNaN(a.t) ? Infinity : a.t, bt = isNaN(b.t) ? Infinity : b.t;
        return at === bt ? a.i - b.i : at - bt;
      })
      .map(x => x.g);
  }

  // ---- persistence ---------------------------------------------------------

  /** Fast canonical save to localStorage; schedules a background file write. */
  persist() {
    try { localStorage.setItem(this.KEY, JSON.stringify(this.data)); }
    catch (e) { /* quota — the file/export is the durable backup */ }
    if (this.fileHandle) this._scheduleFileWrite();
  }

  json() { return JSON.stringify(this.data, null, 2); }

  fileBase() {
    const raw = this.data.seasonName || (this.data.teamProfile && this.data.teamProfile.teamName) || 'season';
    return String(raw).trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'season';
  }

  // ---- File System Access API (progressive enhancement) --------------------

  static supportsFS() {
    return typeof window !== 'undefined' && 'showSaveFilePicker' in window;
  }

  _scheduleFileWrite() {
    clearTimeout(this._fileWriteTimer);
    this._fileWriteTimer = setTimeout(() => this._writeFile().catch(() => {}), 2500);
  }

  async _writeFile() {
    if (!this.fileHandle || this._writing) return;
    if (!(await this._ensurePermission(true))) return;
    this._writing = true;
    try {
      const w = await this.fileHandle.createWritable();
      await w.write(this.json());
      await w.close();
    } finally { this._writing = false; }
  }

  async _ensurePermission(write) {
    if (!this.fileHandle || !this.fileHandle.queryPermission) return true;
    const opts = { mode: write ? 'readwrite' : 'read' };
    if ((await this.fileHandle.queryPermission(opts)) === 'granted') return true;
    return (await this.fileHandle.requestPermission(opts)) === 'granted';
  }

  /** Bind to a real on-disk file and write the season to it. Returns true on success. */
  async saveToFile() {
    if (!SeasonStore.supportsFS()) { this._downloadFallback(); return true; }
    try {
      if (!this.fileHandle) {
        this.fileHandle = await window.showSaveFilePicker({
          suggestedName: this.fileBase() + '_season.json',
          types: [{ description: 'GridIron IQ Season', accept: { 'application/json': ['.json'] } }],
        });
        await this._persistHandle();
      }
      await this._writeFileNow();
      return true;
    } catch (e) {
      if (e && e.name === 'AbortError') return false;   // user cancelled the picker
      this._downloadFallback();
      return true;
    }
  }

  async _writeFileNow() {
    clearTimeout(this._fileWriteTimer);
    await this._writeFile();
  }

  /** Open a season file and bind future saves to it. Returns the loaded data or null. */
  async openFromFile() {
    if (!SeasonStore.supportsFS()) return null;   // caller falls back to <input type=file>
    try {
      const [handle] = await window.showOpenFilePicker({
        types: [{ description: 'GridIron IQ Season', accept: { 'application/json': ['.json'] } }],
      });
      const file = await handle.getFile();
      const parsed = JSON.parse(await file.text());
      this.fileHandle = handle;
      await this._persistHandle();
      return this.adopt(parsed);
    } catch (e) {
      return null;
    }
  }

  /** Adopt a parsed object (season or legacy single game) as the season. */
  adopt(parsed) {
    if (parsed && Array.isArray(parsed.games)) this.data = this._normalize(parsed);
    else if (parsed && Array.isArray(parsed.plays)) this.data = this._normalize({ games: [this.gameFromLegacy(parsed)] });
    else return null;
    this.persist();
    return this.data;
  }

  _downloadFallback() {
    const blob = new Blob([this.json()], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = this.fileBase() + '_season.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---- IndexedDB handle persistence (so the file reconnects next session) --

  _idb() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open('ffa_fs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('handles');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async _persistHandle() {
    try {
      const db = await this._idb();
      await new Promise((res, rej) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').put(this.fileHandle, 'season');
        tx.oncomplete = res; tx.onerror = () => rej(tx.error);
      });
    } catch (e) { /* handle just won't survive reload */ }
  }

  async restoreHandle() {
    try {
      const db = await this._idb();
      const handle = await new Promise((res, rej) => {
        const tx = db.transaction('handles', 'readonly');
        const r = tx.objectStore('handles').get('season');
        r.onsuccess = () => res(r.result || null); r.onerror = () => rej(r.error);
      });
      if (handle) this.fileHandle = handle;
      return !!handle;
    } catch (e) { return false; }
  }

  async forgetHandle() {
    this.fileHandle = null;
    try {
      const db = await this._idb();
      await new Promise((res) => {
        const tx = db.transaction('handles', 'readwrite');
        tx.objectStore('handles').delete('season');
        tx.oncomplete = res; tx.onerror = res;
      });
    } catch (e) {}
  }
}
