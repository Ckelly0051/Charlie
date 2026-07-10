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
 *   3. Durable disk backup = the backend's disk layer. In the browser that's a
 *      bound folder (File System Access API) receiving `season.json` + a ring of
 *      timestamped snapshots; on desktop (Tauri) it's plain app-data files.
 *
 * Where bytes actually live is owned by a StorageBackend (storage-backend.js),
 * so the same SeasonStore runs in the browser or in a native shell unchanged.
 *
 * Video is never stored (too large). Each game references its video filename;
 * the coach re-links the file when they open that game.
 */
import { detectBackend } from './storage-backend.js';

export class SeasonStore {
  constructor(backend) {
    this.SCHEMA = 5;
    this.data = null;
    this.currentSeasonId = null;
    this.backend = backend || detectBackend();
    this._diskTimer = null;
  }

  // ---- lifecycle -----------------------------------------------------------

  /** Reload the current season's data from storage (after one is selected). */
  async load() {
    if (!this.currentSeasonId) return null;
    let parsed = null;
    try { parsed = await this.backend.loadSeason(); } catch (e) {}
    this.data = (parsed && Array.isArray(parsed.games)) ? this._normalize(parsed) : this._empty();
    return this.data;
  }

  _empty() {
    const g = this.blankGame();
    return {
      version: this.SCHEMA, type: 'season',
      id: '', seasonName: '', team: '', year: '', level: '',
      teamProfile: {}, roster: [],
      games: [g], activeGameId: g.id,
    };
  }

  blankGame() {
    return {
      id: this._newId(), name: 'New Game', status: 'active',
      gameInfo: {}, plays: [], annotations: [],
      nextId: 1, currentPlayId: null,
      videoFileName: null, clipNames: [], isMultiClip: false,
    };
  }

  _newId() { return 'g' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }

  // Hudl-model migration (v1.9.15): backfield alignment used to be mixed into the
  // multi-select Formation field. Split it into the new single `backfield` tag so
  // Formation holds STRUCTURE only. Idempotent (after the move there's no backfield
  // type left in formation) and non-destructive (formation + backfield reconstruct
  // the original); never clobbers a backfield the coach set deliberately.
  static BACKFIELD_FROM_FORMATION = { 'I-Form': 'I', 'Singleback': 'Single', 'Split Back': 'Split', 'Power-I': 'Power' };
  static migratePlayFormation(p) {
    if (!p || !p.tags) return;
    const t = p.tags;
    if (typeof t.backfield !== 'string') t.backfield = '';
    if (typeof t.strength !== 'string') t.strength = '';
    if (!t.formation || typeof t.formation !== 'string') return;
    const map = SeasonStore.BACKFIELD_FROM_FORMATION;
    const parts = t.formation.split(' + ').map(s => s.trim()).filter(Boolean);
    let bf = '';
    const kept = parts.filter(part => { if (map[part]) { bf = map[part]; return false; } return true; });
    if (bf) {
      if (!t.backfield) t.backfield = bf;   // don't overwrite a deliberate pick
      t.formation = kept.join(' + ');
    }
  }

  // Special-teams plays can't carry offensive/defensive alignment — the ST tag
  // form hides the Formation/Personnel and Front/Coverage/Blitz groups entirely,
  // so there is no way to set them on an ST snap. Any such value on a
  // unit:'special' play is therefore a leak (classically: an offensive formation
  // that propagated play-to-play through the Save-&-Next carry, coding every ST
  // play as "Under Center"). Strip it. Idempotent and safe — nothing intentional
  // can ever live in these fields on an ST play.
  static ST_ALIGNMENT_KEYS = ['formation', 'personnel', 'defFront', 'coverage', 'blitz'];
  static stripStAlignment(p) {
    if (!p || !p.tags || (p.tags.unit || 'offense') !== 'special') return;
    SeasonStore.ST_ALIGNMENT_KEYS.forEach(k => { if (p.tags[k]) p.tags[k] = ''; });
  }

  // Our custom defensive fronts (the .our-def-only chips in index.html) can never
  // be a "defense faced" on an OFFENSE snap — the opponent doesn't run our team's
  // named fronts. So an our-own front on a non-defense play is carry leak (the
  // Save-&-Next carry copied our defensive front onto an offense snap before the
  // v1.9.20 same-unit fix). Strip just those components, keeping any real faced
  // front: "Maverick + 5-2" → "5-2", "Maverick" → "". Mirrors the chip list.
  static OUR_DEF_ONLY_FRONTS = ['Maverick', 'Eagle', 'Falcon', 'Jumbo Shift'];
  static stripLeakedFronts(p) {
    if (!p || !p.tags || (p.tags.unit || 'offense') === 'defense') return;
    if (!p.tags.defFront) return;
    p.tags.defFront = String(p.tags.defFront).split('+').map(s => s.trim())
      .filter(x => x && !SeasonStore.OUR_DEF_ONLY_FRONTS.includes(x)).join(' + ');
  }

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
      if (!g.status) g.status = 'active';
      g.plays.forEach(p => { SeasonStore.migratePlayFormation(p); SeasonStore.stripStAlignment(p); SeasonStore.stripLeakedFronts(p); });
    });
    if (!d.activeGameId || !d.games.some(g => g.id === d.activeGameId)) {
      d.activeGameId = d.games[0].id;
    }
    d.teamProfile = d.teamProfile || {};
    d.roster = Array.isArray(d.roster) ? d.roster : [];
    d.seasonName = d.seasonName || '';
    d.team = d.team || (d.teamProfile && d.teamProfile.teamName) || '';
    d.year = d.year || '';
    d.level = d.level || '';
    return d;
  }

  // ---- season library (multi-season front door) ----------------------------

  /** True once a season is open and its data is loaded. */
  hasCurrent() { return !!this.currentSeasonId && !!this.data; }

  /** List all seasons in the library (metas only — does not load any). */
  async listSeasons() { return this.backend.listSeasons(); }

  /**
   * Create a brand-new season from {name, team, year, level}, make it current,
   * and seed it with one empty game. Returns the library meta.
   */
  async createSeason(meta) {
    this.cancelPendingDiskWrite();   // see openSeason — same stale-debounce hazard
    const rec = await this.backend.createSeason(meta || {});
    if (!rec) return null;
    this.currentSeasonId = rec.id;
    this.backend.setCurrentSeason(rec.id);
    this.data = this._empty();
    this.data.id = rec.id;
    this.data.seasonName = rec.name;
    this.data.team = rec.team; this.data.year = rec.year; this.data.level = rec.level;
    if (rec.team) this.data.teamProfile = { ...(this.data.teamProfile || {}), teamName: rec.team };
    this.persist();
    return rec;
  }

  /** Open an existing season by id and load its data as the current season. */
  async openSeason(id) {
    this.cancelPendingDiskWrite();   // a stale debounce must not target the new season
    this.backend.setCurrentSeason(id);
    this.currentSeasonId = id;
    let parsed = null;
    try { parsed = await this.backend.loadSeason(); } catch (e) {}
    this.data = (parsed && Array.isArray(parsed.games)) ? this._normalize(parsed) : this._empty();
    this.data.id = id;
    try { await this.backend.touchOpened(id); } catch (e) {}
    return this.data;
  }

  /** Delete a season from the library (and clear it if it was current). */
  async deleteSeason(id) {
    if (this.currentSeasonId === id) this.cancelPendingDiskWrite();
    await this.backend.deleteSeason(id);
    if (this.currentSeasonId === id) { this.currentSeasonId = null; this.data = null; }
  }

  /** Close the current season (back to the library, nothing loaded). */
  closeSeason() { this.cancelPendingDiskWrite(); this.currentSeasonId = null; this.data = null; }

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
    // Optional week label leads the name when present: a bare number becomes
    // "Week 3", anything else is used verbatim ("Playoffs", "Scrimmage").
    const wk = String(gi.week || '').trim();
    const wkLabel = wk ? (/^\d+$/.test(wk) ? `Week ${wk}` : wk) : '';
    if (gi.opponent) return wkLabel ? `${wkLabel} vs ${gi.opponent}` : `vs ${gi.opponent}`;
    if (wkLabel) return wkLabel;
    if (gi.projectName) return gi.projectName;
    if (g && g.videoFileName) return String(g.videoFileName).replace(/\.[^.]+$/, '');
    return 'Game ' + ((fallbackIdx != null ? fallbackIdx : 0) + 1);
  }

  /** Replace the active game's stored state with a freshly serialized game. */
  updateActiveGame(gameObj) {
    const i = this.activeIndex();
    if (i < 0) return;
    const prev = this.data.games[i];
    gameObj.id = prev.id;
    gameObj.name = this.gameName(gameObj, i);
    gameObj.status = gameObj.status || prev.status || 'active';
    // Film source mode (`managed` default | `linked`) + the linked folder live on
    // the game node, NOT in _serialize() output — so carry them forward, or the
    // commitActive() right after linking a game would drop them and linked film
    // wouldn't survive a reopen. (Same reason status is carried above.)
    if (prev.filmMode && !gameObj.filmMode) { gameObj.filmMode = prev.filmMode; gameObj.filmDir = prev.filmDir; }
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

  setGameStatus(id, status) {
    const g = this.data.games.find(g => g.id === id);
    if (g) g.status = status;
  }

  gameStatus(g) { return (g && g.status) || 'active'; }

  /** True when the active game has no plays, no film, and no identifying
   *  game info — i.e. safe to reuse instead of stacking another blank. */
  isEmptyActive() {
    const g = this.activeGame();
    if (!g) return false;
    const gi = g.gameInfo || {};
    return (g.plays || []).length === 0 && !g.videoFileName
      && !gi.opponent && !gi.projectName && !gi.date;
  }

  /**
   * Chronological order, by gameInfo.date when present.
   *
   * Coaches commonly leave Game 1 undated, then date later games. The old code
   * treated a missing date as +Infinity, which shoved that first game to the
   * END — so a season like [Patriots(no date), Irish(Aug), Ravens(Sep)] rendered
   * as [Irish, Ravens, Patriots] and every trend line drew Week 1 on the far
   * right ("the graphs are backwards"). Instead, fill a missing date from the
   * nearest dated game: carry the previous game's date forward, and for a
   * leading undated game borrow the first later date. Creation (array) order is
   * the final tiebreaker, so a run of undated games — or same-day games — stays
   * in the order it was added. When NO game has a date, it's pure creation order.
   */
  gamesChrono() {
    const raw = (this.data.games || []).map((g, i) => ({
      g, i, t: Date.parse((g.gameInfo && g.gameInfo.date) || ''), fill: null,
    }));
    let carry = null;                         // previous dated game, going forward
    raw.forEach(x => { if (!isNaN(x.t)) carry = x.t; else x.fill = carry; });
    let future = null;                        // first dated game, going backward
    for (let k = raw.length - 1; k >= 0; k--) {
      const x = raw[k];
      if (!isNaN(x.t)) future = x.t;
      else if (x.fill == null) x.fill = future;
    }
    const key = (x) => (!isNaN(x.t) ? x.t : x.fill);   // null only if no dates exist at all
    return raw.sort((a, b) => {
      const ak = key(a), bk = key(b);
      if (ak == null || bk == null) return a.i - b.i;  // no date signal → creation order
      return ak === bk ? a.i - b.i : ak - bk;
    }).map(x => x.g);
  }

  json() { return JSON.stringify(this.data, null, 2); }

  fileBase() {
    const raw = this.data.seasonName || (this.data.teamProfile && this.data.teamProfile.teamName) || 'season';
    return String(raw).trim().replace(/[^\w.-]+/g, '_').replace(/^_+|_+$/g, '') || 'season';
  }

  // ---- persistence (delegated to the backend) ------------------------------

  /**
   * Fast canonical save, then a debounced silent write of the live file to the
   * durable disk target (if one is bound). No new snapshot here — snapshots are
   * created on explicit saves / throttled auto-snapshots via snapshot().
   */
  persist() {
    // saveSeason returns false (or rejects) when the canonical write fails —
    // classically a localStorage quota error on a big season. Surfacing it ONCE
    // per failure streak lets the coach export a file before losing work; the
    // old fire-and-forget swallowed it, so a full quota meant silent data loss.
    Promise.resolve(this.backend.saveSeason(this.data))
      .then(ok => { if (ok === false) this._persistFailed(); else this._persistWarned = false; })
      .catch(() => this._persistFailed());
    this._scheduleDiskWrite();
  }

  _persistFailed() {
    if (this._persistWarned) return;            // warn once until the next success
    this._persistWarned = true;
    if (typeof this.onPersistError === 'function') { try { this.onPersistError(); } catch (e) {} }
  }

  _scheduleDiskWrite() {
    if (!this.backend.diskStatus().bound) return;
    clearTimeout(this._diskTimer);
    const snap = JSON.parse(JSON.stringify(this.data));   // freeze the payload
    // Pin the owning season: writeDisk resolves the TARGET at fire time (via
    // backend.currentId), so a debounce surviving a season switch would write
    // this frozen payload into the NEXT season's file. Transitions also cancel
    // the timer (cancelPendingDiskWrite); the pin covers any path that forgets.
    const sid = this.currentSeasonId;
    this._diskTimer = setTimeout(() => {
      if (this.currentSeasonId !== sid) return;
      this.backend.writeDisk(snap, { snapshot: false }).catch(() => {});
    }, 2500);
  }

  /** Cancel the debounced disk write (must be called before leaving a season). */
  cancelPendingDiskWrite() {
    clearTimeout(this._diskTimer);
    this._diskTimer = null;
  }

  // ---- backups / restore ---------------------------------------------------

  /** Take a restore point: a disk snapshot (if bound) + an in-app ring entry. */
  async snapshot(label) {
    const data = JSON.parse(JSON.stringify(this.data));
    if (this.backend.diskStatus().bound) {
      await this.backend.writeDisk(data, { snapshot: true, label });
    }
    return this.backend.createBackup(data, label);
  }

  listBackups() { return this.backend.listBackups(); }

  /**
   * Restore a previous save. The current state is snapshotted first, so a
   * restore is itself undoable — you can never strand yourself on bad data.
   */
  async restoreBackup(id) {
    const data = await this.backend.getBackup(id);
    if (!data || !Array.isArray(data.games)) return null;
    await this.snapshot('Before restore');
    this.data = this._normalize(data);
    this.persist();
    return this.data;
  }

  // ---- durable disk target -------------------------------------------------

  supportsDisk() { return this.backend.supportsDisk(); }
  diskStatus() { return this.backend.diskStatus(); }
  async restoreDiskBinding() { return this.backend.restoreDiskBinding(); }

  /** Desktop only: open (or resolve) the app-data folder where the season is saved. */
  canOpenDataDir() { return typeof this.backend.openDataDir === 'function'; }
  async openDataDir() { return this.backend.openDataDir ? this.backend.openDataDir() : ''; }

  /** Bind a backup folder/target and immediately write the live file + a snapshot. */
  async bindDisk() {
    const ok = await this.backend.bindDisk();
    if (ok) await this.backend.writeDisk(JSON.parse(JSON.stringify(this.data)), { snapshot: true, label: 'Backup folder linked', prompt: true });
    return ok;
  }
  async forgetDisk() { return this.backend.forgetDisk(); }

  /** Explicit "Save Season": canonical + live disk write + a labelled snapshot. */
  async saveNow(label) {
    await this.backend.saveSeason(this.data);
    const data = JSON.parse(JSON.stringify(this.data));
    let wroteDisk = false;
    if (this.diskStatus().bound) {
      wroteDisk = await this.backend.writeDisk(data, { snapshot: true, label: label || 'Manual save', prompt: true });
    }
    await this.backend.createBackup(data, label || 'Manual save');
    return wroteDisk;
  }

  /** Download a one-off season file (portability / browsers without disk binding). */
  downloadFile() {
    const blob = new Blob([this.json()], { type: 'application/json' });
    const name = this.fileBase() + '_season.json';
    window.ffaSaveBlob(blob, name);
  }

  /** Adopt a parsed object (season or legacy single game) as the season. */
  adopt(parsed) {
    if (parsed && Array.isArray(parsed.games)) this.data = this._normalize(parsed);
    else if (parsed && Array.isArray(parsed.plays)) this.data = this._normalize({ games: [this.gameFromLegacy(parsed)] });
    else return null;
    this.persist();
    return this.data;
  }
}
