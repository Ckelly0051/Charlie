/* Pure ordering and identity resolution for composite gameId::playId refs.
 * Returns a flat reel, per-game order/counts and unresolved refs; playback and
 * film loading remain with the existing game-scoped film owners. */
import { playbackOrder } from './football-rules.js';

export class CrossGameCutup {
  /**
   * plan(refs, games, opts?) -> {
   *   segments: [{ gameId, gameName, playId, clipId, clipName, start, end, order }],
   *   games:    [{ gameId, gameName, count }],   // in play order
   *   total:    <playable segment count>,
   *   skipped:  [ ref, ... ]                      // unresolved refs (honest count)
   * }
   * Order: games chronologically by `gameInfo.date` (undated games last, stable by
   * the season's array order), then plays in game order within each game (playbackOrder) —
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
        play,
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
      const entries = byGame.get(gid);
      const segs = playbackOrder(entries.map(s => s.play)).map(p => entries.find(s => s.play === p));
      gamesOut.push({ gameId: gid, gameName: segs[0].gameName, count: segs.length });
      for (const { play, ...s } of segs) segments.push({ ...s, order: segments.length });
    }
    return { segments, games: gamesOut, total: segments.length, skipped };
  }
}
