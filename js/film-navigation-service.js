/**
 * One playback owner for Study, Reports, and Plan.
 *
 * Callers submit exact composite refs (`gameId::playId`). This service may
 * translate them to game-local ids only after loading the owning game.
 */
export class FilmNavigationService {
  constructor(deps) {
    const required = [
      'games', 'activeGameId', 'commitActive', 'persist', 'switchToGame',
      'filmHealth', 'showBreakdown', 'syncChrome', 'cutupPlayer', 'tagger',
      'videoController', 'planner', 'toast',
    ];
    for (const key of required) {
      if (deps?.[key] == null) throw new Error(`FilmNavigationService requires ${key}`);
    }
    this.deps = deps;
    this._watchToken = 0;
    this._sessionLaunchGameId = null;
  }

  refsForGame(plays, gameId = this.deps.activeGameId()) {
    if (gameId == null || gameId === '') {
      throw new Error('Composite film references require an active game');
    }
    return (plays || []).map(play => {
      if (play?.id == null) throw new Error('Composite film references require play.id');
      return `${gameId}::${play.id}`;
    });
  }

  async cancel(reason = 'stopped') {
    const token = ++this._watchToken;
    this.deps.cutupPlayer.stop(reason);
    await this._restoreSession(token);
  }

  async watch(refs, options = {}) {
    const label = options.label || 'Film';
    const unique = [...new Set((refs || []).map(ref => String(ref)))];
    if (!unique.length) return { completed: false, reason: 'empty', played: 0, skipped: 0 };

    const games = this.deps.games() || [];
    const plan = this.deps.planner.plan(unique, games);
    if (!plan.total) {
      if (options.fallback === 'select-first') {
        const selected = await this._selectFirstResolved(unique, games);
        if (selected) return { completed: false, reason: 'selected', played: 0, skipped: plan.skipped.length };
      }
      this.deps.toast(`No playable film found${plan.skipped.length ? ` · ${plan.skipped.length} skipped` : ''}`);
      return { completed: false, reason: 'unavailable', played: 0, skipped: plan.skipped.length };
    }

    const token = ++this._watchToken;
    if (this._sessionLaunchGameId == null) this._sessionLaunchGameId = this.deps.activeGameId();
    this.deps.cutupPlayer.stop('replaced');
    const playable = [];
    const unresolved = plan.skipped.length;
    let unavailable = 0;
    const activeId = String(this.deps.activeGameId() ?? '');
    const hasActiveVideo = !!this.deps.videoController.video?.src;

    for (const game of plan.games) {
      const node = games.find(item => String(item.id) === String(game.gameId));
      let health = null;
      try { health = await this.deps.filmHealth(node); } catch {}
      if (token !== this._watchToken) return { completed: false, reason: 'replaced', played: 0, skipped: unresolved + unavailable };
      if (health?.ready || (String(game.gameId) === activeId && hasActiveVideo)) playable.push(game);
      else unavailable += game.count;
    }

    if (!playable.length) {
      const skipped = unresolved + unavailable;
      if (options.fallback === 'select-first') {
        const selected = await this._selectFirstResolved(unique, games);
        if (selected) {
          await this._restoreSession(token);
          return { completed: false, reason: 'selected', played: 0, skipped };
        }
      }
      this.deps.toast(`No matching film is available${skipped ? ` · ${skipped} play${skipped === 1 ? '' : 's'} skipped` : ''}`);
      await this._restoreSession(token);
      return { completed: false, reason: 'unavailable', played: 0, skipped };
    }

    let gamesPlayed = 0;
    try {
      this.deps.commitActive();
      await this.deps.persist();
      await this.deps.showBreakdown();
      for (let index = 0; index < playable.length; index++) {
        if (token !== this._watchToken) return { completed: false, reason: 'replaced', played: 0, skipped: unresolved + unavailable };
        const game = playable[index];
        const loaded = await this.deps.switchToGame(game.gameId, {
          commit: false, persist: false, reloadActiveFilm: true,
        });
        if (token !== this._watchToken) return { completed: false, reason: 'replaced', played: 0, skipped: unresolved + unavailable };
        if (!loaded) { unavailable += game.count; continue; }
        this.deps.syncChrome();

        const wanted = new Set(plan.segments
          .filter(segment => segment.gameId === game.gameId)
          .map(segment => String(segment.playId)));
        const ids = (this.deps.tagger.plays || [])
          .filter(play => wanted.has(String(play.id)))
          .map(play => play.id);
        unavailable += Math.max(0, wanted.size - ids.length);
        if (!ids.length) continue;

        const skipped = unresolved + unavailable;
        const context = `${label} · ${game.gameName} · Game ${index + 1} of ${playable.length}${skipped ? ` · ${skipped} skipped` : ''}`;
        const result = await this.deps.cutupPlayer.start(ids, context);
        if (!result?.completed) {
          return { completed: false, reason: result?.reason || 'stopped', played: plan.total - unavailable, skipped: unresolved + unavailable };
        }
        gamesPlayed++;
      }

      const played = plan.total - unavailable;
      const skipped = unresolved + unavailable;
      if (!gamesPlayed) {
        this.deps.toast(`No matching film is available${skipped ? ` · ${skipped} play${skipped === 1 ? '' : 's'} skipped` : ''}`);
        return { completed: false, reason: 'unavailable', played: 0, skipped };
      }
      if (token === this._watchToken) {
        this.deps.toast(`Finished ${played} play${played === 1 ? '' : 's'} across ${gamesPlayed} game${gamesPlayed === 1 ? '' : 's'}${skipped ? ` · ${skipped} skipped` : ''}`);
      }
      return { completed: true, reason: 'complete', played, skipped };
    } finally {
      await this._restoreSession(token);
    }
  }

  async _restoreSession(token) {
    if (token !== this._watchToken) return;
    const launchGameId = this._sessionLaunchGameId;
    try {
      if (launchGameId != null && this.deps.activeGameId() !== launchGameId) {
        await this.deps.switchToGame(launchGameId, {
          commit: false, persist: false, reloadActiveFilm: true,
        });
        this.deps.syncChrome();
      }
    } finally {
      if (token === this._watchToken) this._sessionLaunchGameId = null;
    }
  }

  async _selectFirstResolved(refs, games) {
    for (const ref of refs) {
      const sep = ref.indexOf('::');
      if (sep < 0) continue;
      const gameId = ref.slice(0, sep);
      const playId = ref.slice(sep + 2);
      const game = games.find(item => String(item.id) === gameId);
      if (!game?.plays?.some(play => String(play.id) === playId)) continue;
      if (String(this.deps.activeGameId()) !== gameId) {
        const loaded = await this.deps.switchToGame(gameId, {
          commit: true, persist: true, reloadActiveFilm: true,
        });
        if (!loaded) continue;
      }
      await this.deps.showBreakdown();
      this.deps.syncChrome();
      this.deps.tagger.selectPlay(playId);
      this.deps.toast('No video on these plays · selected the first one instead');
      return true;
    }
    return false;
  }
}