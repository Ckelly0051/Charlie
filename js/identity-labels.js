/**
 * Pure school/nickname identity helpers — no DOM, no storage.
 *
 * Every identity in the app (our program, an opponent, a scout source-game
 * team) is stored as ONE compatibility field (`teamName` / `opponent` /
 * `sourceTeamA` / `sourceTeamB`) so every existing reader keeps working
 * unchanged. `school` and `nickname` are additive companion fields; the
 * compatibility field is always the composed full identity, never a second
 * source of truth.
 *
 * Never split an existing intact name into school/nickname — that would be
 * exactly the heuristic guessing the data contract forbids. When editing an
 * identity that predates these fields, the caller passes the existing full
 * name as the `school` default (see callers) and leaves `nickname` blank;
 * composing school-only reproduces the original name byte-for-byte.
 */

/** Compose the full/compatibility identity from its parts. Order matters:
 *  "St. Joseph" + "Mavericks" -> "St. Joseph Mavericks". A blank nickname
 *  composes to the school alone, so re-saving an unmodified form is a no-op. */
export function fullIdentity(school, nickname = '') {
  const s = String(school ?? '').trim();
  const n = String(nickname ?? '').trim();
  return [s, n].filter(Boolean).join(' ');
}

/** Canonical coach-facing season identity. Stable ids and structured fields
 * remain separate; this only composes the label shown in Home, selectors,
 * creation previews, and newly written season metadata. */
export function seasonIdentity(year, program, level) {
  const y = String(year ?? '').trim();
  const p = String(program ?? '').trim();
  const l = String(level ?? '').trim();
  return [y || 'Year', p || 'Program name', l || 'Level'].join(' · ');
}

/** The label a coach reads for one side of a matchup: the nickname if it
 *  exists, else the intact full name. Never invents a nickname. */
export function compactLabel(name, nickname = '') {
  const nick = String(nickname ?? '').trim();
  if (nick) return nick;
  return String(name ?? '').trim();
}

/** Two compact labels for a matchup, with the identical-nickname collision
 *  rule: if both sides would show the SAME compact label (two "Wildcats"),
 *  both sides fall back to their full names instead, so the matchup stays
 *  distinguishable. Case-insensitive compare, exact-case labels returned. */
export function matchupLabels(nameA, nicknameA, nameB, nicknameB) {
  const a = compactLabel(nameA, nicknameA);
  const b = compactLabel(nameB, nicknameB);
  if (a && b && a.toLowerCase() === b.toLowerCase()) {
    return [String(nameA ?? '').trim() || a, String(nameB ?? '').trim() || b];
  }
  return [a, b];
}
