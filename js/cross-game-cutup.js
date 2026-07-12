/**
 * CrossGameCutup — the data contract for TRUE cross-game sequential playback.
 *
 * A Study/season query returns composite `gameId::playId` refs that SPAN games,
 * but the film player (CutupPlayer) is game-scoped: it plays plays out of the one
 * currently-loaded game's film. Today Study's Watch therefore picks a single game
 * and drops the rest ("kept N matches across M games"). This module closes that
 * gap WITHOUT faking it: it turns the cross-game refs + the season's games into an
 * ORDERED plan the player walks game-by-game.
 *
 * DELIBERATELY PURE: no film URLs, no backend, no DOM. Ordering + clip identity is
 * data; loading each game's film is the player's job (reuse the proven per-game
 * path — switchToGame → auto-load film → CutupPlayer.start(thatGame's playIds)).
 * That keeps this Node-testable and lets the UI reuse the film layer the A3 smoke
 * validated, instead of a parallel cross-game film resolver.
 *
 * CONSUMPTION (player UI, e.g. a cross-game CutupPlayer):
 *   const plan = app.crossGameCutup.plan(refs, seasonGames);
 *   for (const g of plan.games) {              // games in play order
 *     await app.storage.switchToGame(g.gameId);   // loads that game's film
 *     const ids = plan.segments.filter(s => s.gameId === g.gameId).map(s => s.playId);
 *     await playCutup(ids);                        // CutupPlayer.start(ids), await its end
 *   }
 * plan.segments is the flat, fully-ordered reel; plan.games is the per-game order
 * + counts; plan.skipped lists refs that couldn't be resolved (missing play/clip/
 * timestamp) so the UI can report an honest count.
 */
export class CrossGameCutup {
  /**
   * plan(refs, games, opts?) -> {
   *   segments: [{ gameId, gameName, playId, clipId, clipName, start, end, order }],
   *   games:    [{ gameId, gameName, count }],   // in play order
   *   total:    <playable segment count>,
   *   skipped:  [ ref, ... ]                      // unresolved refs (honest count)
   * }
   * Order: games chronologically by `gameInfo.date` (undated games last, stable by
   * the season's array order), then plays by `timestamp.start` within each game —
   * a coherent season reel (game 1 → game N). opts.order === 'as-listed' keeps the
   * games[] array order instead of sorting by date.
   */
  plan(refs, games, opts = {}) {
    const meta = new Map();
    (games || []).forEach((g, idx) => { if (g && g.id != null) meta.set(String(g.id), { game: g, idx }); });

    const uniq = [...new Set((refs || []).map(r => String(r)))];
    const byGame = new Map();
    const skipped = [];
    for (const ref of uniq) {
      const sep = ref.indexOf('::');
      if (sep < 0) { skipped.push(ref); continue; }
      const gid = ref.slice(0, sep), pid = ref.slice(sep + 2);
      const m = meta.get(gid);
      if (!m) { skipped.push(ref); continue; }
      const play = (m.game.plays || []).find(p => p && String(p.id) === pid);
      const ts = play && play.timestamp;
      if (!ts || !(Number(ts.end) > Number(ts.start))) { skipped.push(ref); continue; }
      if (!byGame.has(gid)) byGame.set(gid, []);
      byGame.get(gid).push({
        gameId: gid,
        gameName: m.game.name || (m.game.gameInfo && m.game.gameInfo.opponent) || gid,
        playId: pid,
        clipId: play.clipId != null ? play.clipId : null,
        clipName: play.clipName || '',
        start: Number(ts.start),
        end: Number(ts.end),
      });
    }

    const asListed = opts.order === 'as-listed';
    const dateOf = gid => (meta.get(gid).game.gameInfo && meta.get(gid).game.gameInfo.date) || '9999-99-99';
    const gameOrder = [...byGame.keys()].sort((a, b) => {
      if (!asListed) { const da = dateOf(a), db = dateOf(b); if (da !== db) return da < db ? -1 : 1; }
      return meta.get(a).idx - meta.get(b).idx;   // stable fallback = season array order
    });

    const segments = [];
    const gamesOut = [];
    for (const gid of gameOrder) {
      const segs = byGame.get(gid).sort((a, b) => a.start - b.start);
      gamesOut.push({ gameId: gid, gameName: segs[0].gameName, count: segs.length });
      for (const s of segs) segments.push({ ...s, order: segments.length });
    }
    return { segments, games: gamesOut, total: segments.length, skipped };
  }
}
