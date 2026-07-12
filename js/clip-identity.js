/**
 * clip-identity.js — PURE clip↔play matching, the foundation for the ghost-plays
 * fix (GRIDIRON-IQ-REDESIGN-PLAN requirements R2/R3).
 *
 * WHY: today relink/repair guess a play's clip from its filename across scattered
 * code (playlist-manager `_relinkSavedPlays`/`rehydrateFromDisk`, storage
 * `_planClipRepair`). A clip that fails to match auto-creates a ghost whole-clip
 * play (the "139-for-69" duplicate). Two things defeat the filename match and are
 * defended nowhere: (a) Windows/browser dup-copy RENAME — `foo.mp4` copied into a
 * folder that has it becomes `foo (1).mp4`, `foo (2).mp4`; (b) genuinely
 * duplicate basenames in the saved data.
 *
 * SCOPE: this module is PURE and NOT yet wired into the app (additive, like the
 * SqlCatalog A1 groundwork) — it can't change any running behavior. It exists to
 * prove the tiered matcher + `(n)`-normalization in Node (tools/e2e-clip-match.mjs)
 * so the eventual rewire of relink/repair adopts a single, tested identity policy.
 * The real cure (R1/R2) is a durable catalog `clip_id`; until every play carries
 * one, this filename matcher is the safety net that must not spawn ghosts.
 */

/** Normalize separators and strip the file extension. */
export function pathNoExt(p) {
  return String(p || '').replace(/\\/g, '/').replace(/\.[^/.]+$/, '');
}

/** Last path segment (basename), extension already stripped. */
export function baseName(p) {
  return pathNoExt(p).split('/').pop() || '';
}

/**
 * Strip ONE trailing Windows/browser dup-copy suffix: " (1)", " (2)", …
 * `"Play 12 (1)"` → `"Play 12"`. Only a pure ` (\d+)` at the very end is removed,
 * so a legitimate name that ends in "(2024)" style non-dup parens is untouched
 * only if it's non-numeric — a numeric-paren tail is treated as a dup marker
 * (that is exactly what the OS appends). Matching-only: never mutate stored names.
 */
export function stripDupSuffix(name) {
  return String(name || '').replace(/\s*\(\d+\)\s*$/, '');
}

/** Fallback match key: basename, dup-suffix stripped, lowercased (Windows FS is
 *  case-insensitive, so two clips differing only in case are the same file). */
export function normKey(p) {
  return stripDupSuffix(baseName(p)).toLowerCase();
}

/** A play's durable-ish identity source (clipPath preferred, clipName legacy). */
export function playIdentity(play) {
  return (play && (play.clipPath || play.clipName)) || '';
}

/** An incoming clip/file's identity source (path preferred, name fallback). */
export function clipIdentity(clip) {
  return (clip && (clip.clipPath || clip.path || clip.name)) || '';
}

/**
 * Plan how a set of incoming clips maps to saved plays WITHOUT ever creating a
 * ghost. Tiers, each consume-once, most-specific first:
 *   1. `path`  — exact ext-stripped full path (keeps endzone/0001 vs sideline/0001 distinct)
 *   2. `base`  — exact basename (relinks a game saved with bare names 1:1;
 *                genuine duplicate basenames pair up by order within the bucket)
 *   3. `norm`  — dup-suffix-stripped + lowercased basename (the Windows `(n)` /
 *                case-rename rescue: re-added `Play 12 (1).mp4` ↔ saved `Play 12`)
 *   4. `order` — if the SAME number of plays and clips remain, pair by sorted order
 *                (the repair planner already does this; add it to re-add too)
 *
 * @param {Array} plays  saved plays (objects with clipPath/clipName)
 * @param {Array} clips  incoming clips/files (objects with clipPath/path/name)
 * @returns {{matches:Array<{playIndex:number,clipIndex:number,tier:string}>,
 *            unmatchedPlays:number[], unmatchedClips:number[]}}
 *   `unmatchedClips` are exactly the clips that would spawn ghost plays under the
 *   current addFiles path — a correct matcher drives this to 0 for the cases above.
 */
export function planClipMatch(plays, clips) {
  const P = (plays || []).map((p, i) => {
    const id = playIdentity(p);
    return { i, path: pathNoExt(id), base: baseName(id), norm: normKey(id) };
  });
  const C = (clips || []).map((c, i) => {
    const id = clipIdentity(c);
    return { i, path: pathNoExt(id), base: baseName(id), norm: normKey(id) };
  });
  const usedP = new Set(), usedC = new Set(), matches = [];

  const tier = (keyOf, name) => {
    // Buckets of still-free plays by this tier's key, preserving array order so
    // duplicate keys pair 1:1 with duplicate clips deterministically.
    const buckets = new Map();
    for (const p of P) {
      if (usedP.has(p.i)) continue;
      const k = keyOf(p); if (!k) continue;
      if (!buckets.has(k)) buckets.set(k, []);
      buckets.get(k).push(p);
    }
    for (const c of C) {
      if (usedC.has(c.i)) continue;
      const k = keyOf(c); if (!k) continue;
      const bucket = buckets.get(k); if (!bucket || !bucket.length) continue;
      const p = bucket.shift();           // consume-once, in order
      usedP.add(p.i); usedC.add(c.i);
      matches.push({ playIndex: p.i, clipIndex: c.i, tier: name });
    }
  };

  tier(x => x.path, 'path');
  tier(x => x.base, 'base');
  tier(x => x.norm, 'norm');

  const remP = P.filter(p => !usedP.has(p.i));
  const remC = C.filter(c => !usedC.has(c.i));
  if (remP.length && remP.length === remC.length) {
    // Both sides sorted by their path key so the order-pairing is stable.
    remP.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    remC.sort((a, b) => a.path.localeCompare(b.path, undefined, { numeric: true, sensitivity: 'base' }));
    remP.forEach((p, k) => {
      usedP.add(p.i); usedC.add(remC[k].i);
      matches.push({ playIndex: p.i, clipIndex: remC[k].i, tier: 'order' });
    });
  }

  return {
    matches,
    unmatchedPlays: P.filter(p => !usedP.has(p.i)).map(p => p.i),
    unmatchedClips: C.filter(c => !usedC.has(c.i)).map(c => c.i),
  };
}
