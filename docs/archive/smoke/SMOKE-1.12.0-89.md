# SMOKE 1.12.0-89 — Windows x64 Beta (unsigned)

**Packaged from:** `95310d6` (`fix: preserve matchup scoring ownership`), bumped
in `b09f7de`.
**Canonical gate:** 120 harnesses, 120 green, 0 skipped, 0 failed, run at
`95310d6` before the bump. `e2e-p0-exit` re-run after the bump (19/19), which is
the check that pins all four version declarations to `1.12.0-89`.
**Status:** unsigned, not tagged, not pushed, not published. Reports > Defense
Revision 2 has had no Charlie Gate, and Home production remains formally
`REJECTED`. This package exists so the installed WebView2 smoke can run.

## What it carries over 1.12.0-88

Every Defense Revision 2 repair made after the `1.12.0-88` package, in commit
order:

- `3b00b07` / `5041fd8` — the five review findings: high-leverage field position
  read the offense's end of the field (canonical red zone 4 / 0, now 8 / 6); our
  return touchdowns scored opponent possessions and drive outcomes; defensive
  touchdowns counted as 1st downs allowed and as 3rd/4th downs allowed; Run TFL
  admitted negative-yardage passes; an unmeasured structure row printed `0`
  explosives. Plus the mobile `GRIDIRON IQ` wordmark wrapping to a second line.
- `e347632` / `32c7000` — one owner for defensive field position
  (`fieldPerspective`, `_defensiveFieldZone`, `fieldZoneOf`) applied to the Field
  zone module, the export, `defensivePerformance`, Matchup and the Opponent Scout
  join; and one owner for opponent drive attribution (`opponentDriveList`) that
  the board and the export both read.
- `460a51d` / `42239ea` — defensive success and touchdowns allowed read the
  scoring side (`isOpponentSuccess`, `isTouchdownAllowed`), swept across the
  shared cohort metric, `_defensiveStats`, `_defenseCallRows` and Self-Scout.
- `95310d6` — matchup cross-read scoring ownership: a relabeled offensive rep
  expects `us`, native defense expects `them`.

## What to look at on the installed build

1. **Reports > Defense, Field zone** — the five rows should describe the
   opponent's progress toward our goal: `Goal Line` and `Red Zone` populated on
   games where touchdowns were allowed (full season 4 and 26), `Backed Up` rare
   (2).
2. **High-leverage field position** — 8 red-zone possessions, 6 touchdowns, and
   the same goal-line (4) and backed-up (2) snap counts as Field zone.
3. **Export Report** — the printed Field zone table and opponent drive outcomes
   must match the board exactly.
4. **Mobile header** — `GRIDIRON IQ` on one line at phone width beside a long
   game name.
5. **Module scrollbars** — Chromium cannot render or measure classic WebView2
   scrollbar chrome, so the Defense modules' internal scrollers are unverified
   until this installed run. Look for floating arrow controls or a horizontal
   track inside a module.

## Result

_Pending — installed smoke not yet run._
