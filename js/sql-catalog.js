/**
 * SqlCatalog — SQLite (sql.js/WASM) persistence for the season catalog.
 *
 * WHY: the app persisted a season as one JSON blob and *rebuilt* game-level film
 * metadata from transient in-memory state, which was silently lost (the v1.10.7
 * film-index wipe). A real catalog with clips as first-class rows and
 * transactional writes makes state impossible to half-write or derive away.
 *
 * SCOPE (persistence layer first): this is a drop-in for the SEASON persistence
 * the app already does through StorageBackend — it decomposes the season OBJECT
 * into rows on save and reassembles the SAME object on load. The app, SeasonStore
 * and the in-memory model are unchanged; JSON stays as export/backup. Live SQL
 * reads (play finder, cross-season queries) are a later phase on the same schema.
 *
 * ENGINE: sql.js runs the same schema + queries in Node (so this whole module is
 * unit-tested before ship) and in the Tauri webview (which lazy-loads the wasm).
 * The `SQL` module is INJECTED so loading is environment-specific:
 *     const cat = new SqlCatalog(await initSqlJs({ ... }));
 *     await cat.open(existingBytes);            // or open() for a fresh db
 *     ... cat.saveSeason(data) / cat.loadSeason(id) ...
 *     const bytes = cat.toBytes();              // persist to disk (desktop)
 *
 * LOSSLESSNESS: each parent stores its non-child fields verbatim in a `body_json`
 * column; children (games, plays) live in their own tables (also body_json), and
 * are re-attached on load. Schema v2 makes `clips.clip_id` authoritative and
 * writes that durable identity onto both clipRefs and plays as `catalogClipId`.
 * The transient PlaylistManager `clipId` remains a separate live-session handle.
 * Verified by tools/e2e-sql-catalog.mjs.
 */
export class SqlCatalog {
  constructor(SQL) {
    this.SQL = SQL;            // initialized sql.js module (injected)
    this.db = null;
    this.currentId = null;
    this.RETENTION = 25;
    this.VMAX = 20;            // named-save-point cap per season::game (mirrors VersionManager)
    this.SCHEMA = 2;
    this._seq = 0;
  }

  // ---- lifecycle -----------------------------------------------------------
  async open(bytes) {
    this.db = bytes && bytes.length ? new this.SQL.Database(bytes) : new this.SQL.Database();
    this.db.run('PRAGMA foreign_keys = ON;');
    this.runMigrations();
    return this;
  }

  toBytes() { return this.db.export(); }        // Uint8Array — write to the .db file
  close() { if (this.db) { this.db.close(); this.db = null; } }

  setCurrentSeason(id) { this.currentId = id; }
  currentSeason() { return this.currentId; }

  // ---- schema / migrations -------------------------------------------------
  runMigrations() {
    this.db.run(`
      CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT);
      CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at TEXT);
      CREATE TABLE IF NOT EXISTS seasons (
        id TEXT PRIMARY KEY, name TEXT, team TEXT, year TEXT, level TEXT,
        is_demo INTEGER DEFAULT 0, kind TEXT DEFAULT '', active_game_id TEXT,
        games_count INTEGER DEFAULT 0, plays_count INTEGER DEFAULT 0,
        created TEXT, updated TEXT, last_opened TEXT, body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS games (
        id TEXT PRIMARY KEY, season_id TEXT NOT NULL, ord INTEGER,
        name TEXT, status TEXT, next_id INTEGER, current_play_id INTEGER,
        video_file_name TEXT, is_multi_clip INTEGER DEFAULT 0, body_json TEXT NOT NULL,
        FOREIGN KEY (season_id) REFERENCES seasons(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS plays (
        rowid_key INTEGER PRIMARY KEY AUTOINCREMENT,
        play_id INTEGER, game_id TEXT NOT NULL, ord INTEGER,
        ts_start REAL, ts_end REAL, clip_id INTEGER, catalog_clip_id TEXT, clip_name TEXT, clip_path TEXT,
        unit TEXT, run_pass TEXT, result TEXT, down TEXT, distance TEXT,
        notes TEXT, body_json TEXT NOT NULL,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS clips (
        rowid_key INTEGER PRIMARY KEY AUTOINCREMENT,
        clip_id TEXT, game_id TEXT NOT NULL, ord INTEGER, clip_path TEXT, name TEXT,
        original_name TEXT, size INTEGER, partial_hash TEXT, duration REAL,
        import_status TEXT, body_json TEXT,
        FOREIGN KEY (game_id) REFERENCES games(id) ON DELETE CASCADE
      );
      CREATE TABLE IF NOT EXISTS backups (
        id TEXT PRIMARY KEY, season_id TEXT, t TEXT, label TEXT,
        games_count INTEGER, plays_count INTEGER, season_name TEXT, body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS versions (
        id TEXT PRIMARY KEY, season_id TEXT, game_id TEXT, t TEXT, label TEXT,
        manual INTEGER DEFAULT 0, play_count INTEGER DEFAULT 0, body_json TEXT NOT NULL
      );
      CREATE TABLE IF NOT EXISTS imports (
        id TEXT PRIMARY KEY, game_id TEXT, t TEXT, status TEXT, summary_json TEXT
      );
      CREATE TABLE IF NOT EXISTS audit_log (
        id INTEGER PRIMARY KEY AUTOINCREMENT, t TEXT, entity TEXT, entity_id TEXT, op TEXT, detail_json TEXT
      );
      CREATE INDEX IF NOT EXISTS ix_games_season ON games(season_id, ord);
      CREATE INDEX IF NOT EXISTS ix_plays_game ON plays(game_id, ord);
      CREATE INDEX IF NOT EXISTS ix_clips_game ON clips(game_id, ord);
      CREATE INDEX IF NOT EXISTS ix_backups_season ON backups(season_id, t);
      CREATE INDEX IF NOT EXISTS ix_versions_scope ON versions(season_id, game_id, t);
    `);
    this._ensureColumn('plays', 'catalog_clip_id', 'TEXT');
    this._ensureColumn('clips', 'clip_id', 'TEXT');
    this._ensureColumn('clips', 'body_json', 'TEXT');
    this.db.run('CREATE UNIQUE INDEX IF NOT EXISTS ux_clips_id ON clips(clip_id) WHERE clip_id IS NOT NULL;');
    const has = this._get('SELECT id FROM migrations WHERE id = ?', [this.SCHEMA]);
    if (!has) {
      this.db.run('INSERT INTO migrations (id, applied_at) VALUES (?, ?)', [this.SCHEMA, new Date().toISOString()]);
      this._setMeta('schema_version', String(this.SCHEMA));
    }
  }

  // ---- low-level helpers ---------------------------------------------------
  _run(sql, params = []) { this.db.run(sql, params); }
  _all(sql, params = []) {
    const stmt = this.db.prepare(sql); stmt.bind(params);
    const out = []; while (stmt.step()) out.push(stmt.getAsObject()); stmt.free(); return out;
  }
  _get(sql, params = []) { const rows = this._all(sql, params); return rows[0] || null; }
  _setMeta(k, v) { this.db.run('INSERT INTO meta (key,value) VALUES (?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value', [k, v]); }
  _ensureColumn(table, column, type) {
    const cols = this._all(`PRAGMA table_info(${table})`);
    if (!cols.some(c => c.name === column)) this.db.run(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`);
  }
  _newId(prefix) { this._seq = (this._seq + 1) & 0xffffff; return `${prefix}_${Date.now().toString(36)}_${this._seq.toString(36)}${Math.random().toString(36).slice(2, 6)}`; }
  static _countPlays(data) { return (data && data.games) ? data.games.reduce((s, g) => s + ((g.plays || []).length), 0) : 0; }

  static _clipKey(value) {
    return String(value || '').replace(/\\/g, '/').replace(/\.[^/.]+$/, '').toLowerCase();
  }

  static _stableClipId(gameId, identity, ordinal) {
    const input = `${gameId}\u0000${identity}\u0000${ordinal}`;
    let hash = 2166136261;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    return `clip_${(hash >>> 0).toString(36)}_${ordinal}`;
  }

  /** Upgrade legacy path-only film metadata in place before both db and JSON writes. */
  static ensureClipIdentities(data) {
    const globallyUsed = new Set();
    for (const game of ((data && data.games) || [])) {
      const refs = Array.isArray(game.clipRefs) ? game.clipRefs : (game.clipRefs = []);
      refs.forEach((ref, i) => {
        const identity = ref.originalRelativePath || ref.libraryRelativePath || ref.id || ref.displayName || ref.originalName || `clip-${i + 1}`;
        let id = ref.catalogClipId || SqlCatalog._stableClipId(game.id, identity, i);
        let suffix = 1;
        while (globallyUsed.has(id)) id = `${SqlCatalog._stableClipId(game.id, identity, i)}_${suffix++}`;
        ref.catalogClipId = id;
        globallyUsed.add(id);
      });

      const buckets = new Map();
      refs.forEach(ref => {
        const key = SqlCatalog._clipKey(ref.originalRelativePath || ref.libraryRelativePath || ref.id || ref.displayName || ref.originalName);
        if (!buckets.has(key)) buckets.set(key, []);
        buckets.get(key).push(ref);
      });
      const groupIds = new Map();
      const cursors = new Map();
      for (const play of (game.plays || [])) {
        const identity = play.clipPath || play.clipName || '';
        if (!identity) continue;
        const key = SqlCatalog._clipKey(identity);
        if (play.catalogClipId && refs.some(ref => ref.catalogClipId === play.catalogClipId
          && SqlCatalog._clipKey(ref.originalRelativePath || ref.libraryRelativePath || ref.id || ref.displayName || ref.originalName) === key)) continue;
        const group = play.clipId != null ? `live:${play.clipId}` : `path:${SqlCatalog._clipKey(identity)}`;
        if (groupIds.has(group)) { play.catalogClipId = groupIds.get(group); continue; }
        const bucket = buckets.get(key) || [];
        const cursor = cursors.get(key) || 0;
        let ref = bucket[Math.min(cursor, Math.max(0, bucket.length - 1))];
        if (bucket.length > 1) cursors.set(key, cursor + 1);
        if (!ref) {
          ref = {
            id: identity,
            catalogClipId: SqlCatalog._stableClipId(game.id, identity, refs.length),
            originalName: play.clipName || identity,
            originalRelativePath: play.clipPath || play.clipName || identity,
            displayName: play.clipName || identity,
            duration: play.timestamp && play.timestamp.end !== 999 ? play.timestamp.end : null,
            importStatus: 'missing',
          };
          refs.push(ref);
          buckets.set(key, [ref]);
        }
        play.catalogClipId = ref.catalogClipId;
        groupIds.set(group, ref.catalogClipId);
      }
    }
    return data;
  }

  // ---- canonical season save / load ---------------------------------------
  /** Decompose a season object into rows (one transaction). Full rewrite of that season. */
  saveSeason(data) {
    if (!data || !Array.isArray(data.games)) return false;
    SqlCatalog.ensureClipIdentities(data);
    const id = data.id || this.currentId;
    if (!id) return false;
    const now = new Date().toISOString();
    this.db.run('BEGIN');
    try {
      // Wipe this season's children EXPLICITLY. We cannot rely on FK ON DELETE
      // CASCADE: `db.export()` (the A3 dual-write calls it after every save) resets
      // the connection's `PRAGMA foreign_keys` to OFF, so a bare `DELETE FROM games`
      // would ORPHAN this season's plays/clips — and on the next save they'd be
      // re-attached, doubling play rows on every re-save (autosave). Delete children
      // first, deepest-first, so re-saving fully replaces the season.
      this._run('DELETE FROM plays WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)', [id]);
      this._run('DELETE FROM clips WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)', [id]);
      this._run('DELETE FROM games WHERE season_id = ?', [id]);
      const { games, ...seasonBody } = data;
      const created = (this._get('SELECT created FROM seasons WHERE id = ?', [id]) || {}).created || now;
      this._run(
        `INSERT INTO seasons (id,name,team,year,level,is_demo,kind,active_game_id,games_count,plays_count,created,updated,last_opened,body_json)
         VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)
         ON CONFLICT(id) DO UPDATE SET name=excluded.name,team=excluded.team,year=excluded.year,level=excluded.level,
           is_demo=excluded.is_demo,kind=excluded.kind,active_game_id=excluded.active_game_id,
           games_count=excluded.games_count,plays_count=excluded.plays_count,updated=excluded.updated,body_json=excluded.body_json`,
        [id, data.seasonName || '', data.team || '', data.year || '', data.level || '',
         data.isDemo ? 1 : 0, data.kind || '', data.activeGameId || '',
         games.length, SqlCatalog._countPlays(data), created, now,
         (this._get('SELECT last_opened FROM seasons WHERE id=?', [id]) || {}).last_opened || now,
         JSON.stringify(seasonBody)]);

      games.forEach((game, gi) => {
        const { plays, ...gameBody } = game;
        this._run(
          `INSERT INTO games (id,season_id,ord,name,status,next_id,current_play_id,video_file_name,is_multi_clip,body_json)
           VALUES (?,?,?,?,?,?,?,?,?,?)`,
          [game.id, id, gi, game.name || '', game.status || 'active', game.nextId != null ? game.nextId : null,
           game.currentPlayId != null ? game.currentPlayId : null, game.videoFileName || null,
           game.isMultiClip ? 1 : 0, JSON.stringify(gameBody)]);
        (plays || []).forEach((p, pi) => {
          const t = p.tags || {};
          this._run(
            `INSERT INTO plays (play_id,game_id,ord,ts_start,ts_end,clip_id,catalog_clip_id,clip_name,clip_path,unit,run_pass,result,down,distance,notes,body_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`,
            [p.id != null ? p.id : null, game.id, pi,
             p.timestamp ? p.timestamp.start : null, p.timestamp ? p.timestamp.end : null,
             p.clipId != null ? p.clipId : null, p.catalogClipId || null, p.clipName || null, p.clipPath || null,
             t.unit || '', t.runPass || '', t.result || '', t.down || '', t.distance || '',
             p.notes || '', JSON.stringify(p)]);
        });
        // clips projection (from the durable clipRefs the game carries)
        (game.clipRefs || []).forEach((c, ci) => {
          this._run(
            `INSERT INTO clips (clip_id,game_id,ord,clip_path,name,original_name,size,partial_hash,duration,import_status,body_json)
             VALUES (?,?,?,?,?,?,?,?,?,?,?)`,
            [c.catalogClipId || null, game.id, ci, c.originalRelativePath || c.id || c.displayName || '', c.displayName || c.name || '',
             c.originalName || '', c.size != null ? c.size : null, c.partialHash || null,
             c.duration != null ? c.duration : null, c.importStatus || 'ready', JSON.stringify(c)]);
        });
      });
      this.db.run('COMMIT');
      return true;
    } catch (e) { this.db.run('ROLLBACK'); throw e; }
  }

  /** Reassemble the exact season object from rows. */
  loadSeason(id) {
    const sid = id || this.currentId;
    if (!sid) return null;
    const srow = this._get('SELECT body_json FROM seasons WHERE id = ?', [sid]);
    if (!srow) return null;
    const season = JSON.parse(srow.body_json);
    season.games = this._all('SELECT id, body_json FROM games WHERE season_id = ? ORDER BY ord', [sid]).map(g => {
      const game = JSON.parse(g.body_json);
      game.plays = this._all('SELECT catalog_clip_id, body_json FROM plays WHERE game_id = ? ORDER BY ord', [g.id]).map(p => {
        const play = JSON.parse(p.body_json);
        if (p.catalog_clip_id) play.catalogClipId = p.catalog_clip_id;
        return play;
      });
      const clips = this._all('SELECT clip_id,clip_path,name,original_name,size,partial_hash,duration,import_status,body_json FROM clips WHERE game_id = ? ORDER BY ord', [g.id]);
      if (clips.length) game.clipRefs = clips.map(c => {
        let ref = null;
        try { ref = c.body_json ? JSON.parse(c.body_json) : null; } catch (e) {}
        if (ref) {
          if (c.clip_id) ref.catalogClipId = c.clip_id;
          return ref;
        }
        const legacy = {
          id: c.clip_path || c.name || '',
          originalName: c.original_name || '',
          originalRelativePath: c.clip_path || '',
          displayName: c.name || '',
          importStatus: c.import_status || 'ready',
        };
        if (c.clip_id) legacy.catalogClipId = c.clip_id;
        if (c.size != null) legacy.size = c.size;
        if (c.partial_hash) legacy.partialHash = c.partial_hash;
        if (c.duration != null) legacy.duration = c.duration;
        return legacy;
      });
      return game;
    });
    return season;
  }

  // ---- library (multi-season) ----------------------------------------------
  listSeasons() {
    return this._all(`SELECT id,name,team,year,level,is_demo,kind,games_count,plays_count,created,updated,last_opened
                      FROM seasons ORDER BY COALESCE(last_opened, updated, created) DESC`)
      .map(r => ({
        id: r.id, name: r.name || r.team || 'Untitled Season', team: r.team || '', year: r.year || '', level: r.level || '',
        games: r.games_count || 0, plays: r.plays_count || 0,
        created: r.created || '', updated: r.updated || '', lastOpened: r.last_opened || '',
        isDemo: !!r.is_demo, kind: r.kind || '',
      }));
  }

  createSeason(meta) {
    const m = meta || {};
    const id = m.id || this._newId('sea');
    const now = new Date().toISOString();
    const body = {
      version: 5, type: 'season', id, seasonName: m.name || '', team: m.team || '', year: m.year || '', level: m.level || '',
      teamProfile: m.team ? { teamName: m.team } : {}, roster: [], games: [], activeGameId: '',
    };
    // Persist the season body WITHOUT its games array — games live in their own
    // rows; keeping them here too would double-store and drift.
    const { games: _games, ...bodyMeta } = body;
    this._run(
      `INSERT INTO seasons (id,name,team,year,level,is_demo,kind,active_game_id,games_count,plays_count,created,updated,last_opened,body_json)
       VALUES (?,?,?,?,?,0,?,?,0,0,?,?,?,?)`,
      [id, body.seasonName, body.team, body.year, body.level, m.kind || '', '', now, now, now, JSON.stringify(bodyMeta)]);
    return { id, name: body.seasonName, team: body.team, year: body.year, level: body.level };
  }

  deleteSeason(id) {
    // Explicit deepest-first delete — FK cascade is unreliable here (export() resets
    // `PRAGMA foreign_keys`), so a bare `DELETE FROM seasons` would leave orphaned
    // games/plays/clips that resurrect when a game id is reused. See saveSeason.
    this._run('DELETE FROM plays WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)', [id]);
    this._run('DELETE FROM clips WHERE game_id IN (SELECT id FROM games WHERE season_id = ?)', [id]);
    this._run('DELETE FROM games WHERE season_id = ?', [id]);
    this._run('DELETE FROM seasons WHERE id = ?', [id]);
    if (this.currentId === id) this.currentId = null;
  }
  touchOpened(id) { this._run('UPDATE seasons SET last_opened = ? WHERE id = ?', [new Date().toISOString(), id]); }

  /** Import an existing season.json (post-_normalize) into the catalog. Idempotent per id. */
  importSeasonJson(seasonObj) { return this.saveSeason(seasonObj); }

  // ---- backup ring (scoped to currentId) -----------------------------------
  createBackup(data, label) {
    const id = this._newId('bk');
    this._run('INSERT INTO backups (id,season_id,t,label,games_count,plays_count,season_name,body_json) VALUES (?,?,?,?,?,?,?,?)',
      [id, this.currentId, new Date().toISOString(), label || 'Save',
       (data.games || []).length, SqlCatalog._countPlays(data), data.seasonName || '', JSON.stringify(data)]);
    this._pruneBackups();
    return id;
  }
  listBackups() {
    return this._all('SELECT id,t,label,games_count,plays_count,season_name FROM backups WHERE season_id = ? ORDER BY t DESC', [this.currentId])
      .map(r => ({ id: r.id, t: r.t, label: r.label, seasonName: r.season_name || '', games: r.games_count || 0, plays: r.plays_count || 0 }));
  }
  getBackup(id) { const r = this._get('SELECT body_json FROM backups WHERE id = ?', [id]); return r ? JSON.parse(r.body_json) : null; }
  deleteBackup(id) { this._run('DELETE FROM backups WHERE id = ?', [id]); }
  _pruneBackups() {
    const ids = this._all('SELECT id FROM backups WHERE season_id = ? ORDER BY t DESC', [this.currentId]).map(r => r.id);
    ids.slice(this.RETENTION).forEach(id => this._run('DELETE FROM backups WHERE id = ?', [id]));
  }

  // ---- version history (named save points, scoped season::game) -------------
  // The version-history migration off localStorage `ffa_versions_<season::game>`:
  // named/auto save-points become rows keyed by (season_id, game_id), capped at
  // VMAX per game. `v` is a VersionManager snapshot { id?, label, time, manual,
  // playCount, data } — its whole-tagger `data` goes to body_json; getVersion
  // returns exactly that snapshot payload. Prune evicts AUTO-saves before manual
  // ones (VersionManager's own eviction rule) so a coach's named points survive.
  saveVersion(seasonId, gameId, v) {
    const id = (v && v.id != null) ? String(v.id) : this._newId('ver');
    const body = (v && v.data !== undefined) ? v.data : v;
    this._run(
      `INSERT INTO versions (id,season_id,game_id,t,label,manual,play_count,body_json) VALUES (?,?,?,?,?,?,?,?)
       ON CONFLICT(id) DO UPDATE SET label=excluded.label,manual=excluded.manual,play_count=excluded.play_count,body_json=excluded.body_json`,
      [id, seasonId, gameId, (v && v.time) || new Date().toISOString(), (v && v.label) || '',
       (v && v.manual) ? 1 : 0, (v && v.playCount != null) ? v.playCount : 0, JSON.stringify(body)]);
    this._pruneVersions(seasonId, gameId);
    return id;
  }
  listVersions(seasonId, gameId) {
    return this._all('SELECT id,t,label,manual,play_count FROM versions WHERE season_id = ? AND game_id = ? ORDER BY t ASC', [seasonId, gameId])
      .map(r => ({ id: r.id, time: r.t, label: r.label || '', manual: !!r.manual, playCount: r.play_count || 0 }));
  }
  getVersion(id) { const r = this._get('SELECT body_json FROM versions WHERE id = ?', [String(id)]); return r ? JSON.parse(r.body_json) : null; }
  deleteVersion(id) { this._run('DELETE FROM versions WHERE id = ?', [String(id)]); }
  _pruneVersions(seasonId, gameId) {
    const rows = this._all('SELECT id, manual FROM versions WHERE season_id = ? AND game_id = ? ORDER BY t ASC', [seasonId, gameId]);
    let over = rows.length - this.VMAX;
    if (over <= 0) return;
    const del = [];
    for (const r of rows) { if (over <= 0) break; if (!r.manual) { del.push(r.id); over--; } }   // auto-saves first (oldest→newest)
    for (const r of rows) { if (over <= 0) break; if (r.manual && !del.includes(r.id)) { del.push(r.id); over--; } }  // then oldest manual
    del.forEach(id => this._run('DELETE FROM versions WHERE id = ?', [id]));
  }
}
