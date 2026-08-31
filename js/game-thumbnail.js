/**
 * GameThumbnailService — a small, bounded, lazy thumbnail owner for Home's
 * film cards.
 *
 * Real frames from a game's already-resolved film, through the existing
 * StorageBackend film primitives (`filmUrl`/`listFilmFiles` for managed,
 * `listLinkedFilm`/`linkedFilmUrl` for linked) — the SAME primitives
 * `WorkspaceContext.filmHealth()` already uses. No new film-resolution path,
 * no decode of every video on Home open, no interference with the charting
 * player (a fully separate, detached `<video>` element, never attached to
 * the DOM, never touching `VideoController`/`PlaylistManager`).
 *
 * Bounded: at most `maxConcurrent` decodes run at once, queued in request
 * order. Lazy: `HomeScreen` only calls `request()` for the games actually
 * rendered on screen, never the whole season.
 *
 * Cached by a stable identity built from the SEASON (via the backend's
 * `currentId` at request time), the game's id, and its resolved film
 * mode/dir/first-file name — relinking or changing a game's film changes
 * that identity, so a stale thumbnail is never served for new film, and two
 * seasons that happen to reuse the same game id can never share a cache
 * entry. This is a session-scoped IN-MEMORY cache only (not persisted to
 * disk); a fresh app launch regenerates thumbnails once, which is a
 * disclosed, deliberate simplicity trade for this first pass.
 *
 * The backend's `currentId` is mutable ambient state, and `filmUrl()`/
 * `listFilmFiles()`/`linkedGameDir()`/`linkedFilmUrl()` all read it live at
 * call time (`js/storage-backend.js`) rather than taking a season parameter
 * -- so a request queued while season A is open and not yet EXECUTED by the
 * time the coach switches to season B would otherwise resolve its URL under
 * B's identity. Every async step below re-checks the season captured at
 * request time and ABORTS (resolves null, caches nothing) the instant it no
 * longer matches, rather than trying to force-complete under a season that
 * is no longer the one that asked. The caller (HomeScreen) naturally
 * re-requests thumbnails for whatever season is now open, so an aborted
 * stale request is never a lost thumbnail -- it is superseded by a correct one.
 */
export class GameThumbnailService {
  constructor(app, { maxConcurrent = 2, width = 320, height = 180 } = {}) {
    this.app = app;
    this._cache = new Map();   // identity -> dataURL | null (null = tried, no frame available)
    this._pending = new Map(); // identity -> Promise
    this._queue = [];
    this._active = 0;
    this._maxConcurrent = maxConcurrent;
    this._width = width;
    this._height = height;
  }

  _backend() { return this.app.storage?.seasonStore?.backend; }
  /** The season identity a request is bound to. `null`/`undefined` (no
   *  backend, no season open) is a valid, distinct identity -- it still
   *  fences correctly, it just never matches a LATER real season. */
  _seasonToken() { return this._backend()?.currentId ?? null; }

  /** The one file a thumbnail is drawn from, plus enough to invalidate on
   *  relink: mode, resolved directory/root, and the first matched file's own
   *  name (a repair that swaps file 1 for a differently-named file changes
   *  this even if the clip count stays the same). */
  async _firstFile(game) {
    const backend = this._backend();
    if (!backend?.supportsFilm?.()) return null;
    if (game.filmMode === 'linked') {
      if (!backend.supportsLinkedFilm?.()) return null;
      const absDir = await backend.linkedGameDir(game.filmDir).catch(() => '');
      if (!absDir) return null;
      const files = await backend.listLinkedFilm(absDir).catch(() => []);
      if (!files.length) return null;
      const join = window.__TAURI__?.path?.join;
      const absPath = join ? await join(absDir, files[0].path) : `${absDir}/${files[0].path}`;
      return { key: `linked:${absDir}:${files[0].path}`, url: () => backend.linkedFilmUrl(absPath) };
    }
    const files = await backend.listFilmFiles(game.id).catch(() => []);
    if (!files.length) return null;
    return { key: `managed:${game.id}:${files[0].path}`, url: () => backend.filmUrl(game.id, files[0]) };
  }

  /** Resolve a thumbnail for `game` (a data URL, or null if none is
   *  available — browser build, no film, unreadable link, or the request was
   *  superseded by a season change before it could complete). Safe to call
   *  repeatedly; a resolved or in-flight identity is never regenerated. */
  async request(game) {
    const seasonId = this._seasonToken();
    const first = await this._firstFile(game).catch(() => null);
    // _firstFile() itself awaits listFilmFiles/linkedGameDir/listLinkedFilm --
    // a season switch during that lookup means `first` (if any) describes the
    // WRONG season's film; do not even key a cache entry from it.
    if (this._seasonToken() !== seasonId) return null;
    if (!first) return null;
    const key = `${seasonId}::${game.id}:${first.key}`;
    if (this._cache.has(key)) return this._cache.get(key);
    if (this._pending.has(key)) return this._pending.get(key);
    const promise = new Promise(resolve => {
      const abort = () => { this._pending.delete(key); resolve(null); };
      this._queue.push(async () => {
        if (this._seasonToken() !== seasonId) { abort(); return; }
        const url = await first.url().catch(() => null);
        // first.url() calls backend.filmUrl()/linkedFilmUrl(), which read
        // the backend's mutable currentId LIVE at call time -- re-check
        // immediately after, before trusting the resolved URL belongs to
        // the season this request was made for.
        if (this._seasonToken() !== seasonId) { abort(); return; }
        const dataUrl = url ? await this._capture(url).catch(() => null) : null;
        if (this._seasonToken() !== seasonId) { abort(); return; }
        this._cache.set(key, dataUrl);
        this._pending.delete(key);
        resolve(dataUrl);
      });
      this._drain();
    });
    this._pending.set(key, promise);
    return promise;
  }

  _drain() {
    while (this._active < this._maxConcurrent && this._queue.length) {
      const job = this._queue.shift();
      this._active++;
      Promise.resolve(job()).finally(() => { this._active--; this._drain(); });
    }
  }

  /** One detached, muted, never-DOM-attached `<video>` per capture — cannot
   *  collide with the real charting player, which owns its own element. */
  _capture(url) {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.muted = true; video.playsInline = true; video.preload = 'metadata';
      video.crossOrigin = 'anonymous';
      let settled = false;
      const cleanup = () => {
        video.removeAttribute('src'); video.load();
        video.onloadeddata = video.onseeked = video.onerror = null;
      };
      const fail = () => { if (settled) return; settled = true; cleanup(); reject(new Error('thumbnail capture failed')); };
      const timeout = setTimeout(fail, 8000);
      video.onerror = fail;
      video.onloadeddata = () => {
        // A brief offset avoids a solid-black or letterboxed opening frame
        // without decoding meaningfully further into the clip.
        const target = Math.min(2, (video.duration || 2) * 0.1);
        try { video.currentTime = target; } catch { fail(); }
      };
      video.onseeked = () => {
        if (settled) return;
        try {
          const canvas = document.createElement('canvas');
          canvas.width = this._width; canvas.height = this._height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(video, 0, 0, this._width, this._height);
          const dataUrl = canvas.toDataURL('image/jpeg', 0.72);
          settled = true; clearTimeout(timeout); cleanup();
          resolve(dataUrl);
        } catch (e) { fail(); }
      };
      video.src = url;
    });
  }

  /** Drop every cached/queued entry — called on season/program switch so a
   *  slow in-flight capture from the PRIOR season can never paint a card in
   *  the new one; the caller's own token guard is the other half of this. */
  reset() {
    this._cache.clear();
    this._pending.clear();
    this._queue.length = 0;
  }
}
