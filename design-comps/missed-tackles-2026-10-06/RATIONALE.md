# Missed tackles - review comp, 2026-10-06

Status: proposal, not approved. Still screens of the real built app
(`b10bf0fe` source) with the canonical 2025 JV season, Week 6 vs Holy Family,
and the proposed controls added in the page (`capture.mjs`). Isolated browser
data; no coach file or film was written. The comp's counts and jersey numbers
are illustrative, not charted data.

## Coach decisions this comp follows (2026-10-06)

- Charted on offense and defense, not Special Teams.
- The play-level event is a count: `0`, `1`, `2`, `3+`. Blank means not charted;
  `0` means checked, none. Uncharted is never counted as zero.

## What the screens show

1. **Defense** (`defense-*`, play 3). Players & Grades opens with a
   **Missed Tackles** count row, then the existing Tackler(s), then a new
   **Missed Tackle(s)** roster row for our defenders who missed (more than one
   allowed, `2 + 3` here), then Takeaway. The row has no grade: a grade
   belongs to the play's assignment, which Tackler(s) already carries.
2. **Offense** (`offense-*`, play 8). The same count row, labeled
   **Opponent Missed Tackles**: tackles the defense missed on our ball
   carrier. Count only, because opponents are not on our roster; the carrier
   is already charted in Ball Carrier.

Both use the deck's existing chip row and player row; nothing new is styled.
The count stays independent of the players picked: a count without names is
allowed, and a player may miss more than once.

## Not shown, built with it

- Study: a **Missed Tackles** dimension (the count, unit-split, film-linked,
  with its sample) and a **Missed Tackler** player dimension, through
  `AnalyticsRegistry`.
- Film Room: a Missed Tackles column, locked on Special Teams rows.
- Reports come in roadmap step 4, after the reporting rebuild.
