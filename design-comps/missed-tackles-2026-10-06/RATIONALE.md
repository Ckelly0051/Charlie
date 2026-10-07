# Missed tackles - review comp, 2026-10-06

Status: **COMP_APPROVED** by the coach, 2026-10-07 ("Approved"), revision 2
with collapsed spacing and comma-separated players. Production is not built. Still screens of the real built
app (`b10bf0fe` source) with the canonical 2025 JV season, Week 6 vs Holy
Family, and the proposed controls added in the page (`capture.mjs`).
Isolated browser data; no coach file or film was written. Counts and jersey
numbers are illustrative. The fixture's Special Teams snaps carry no unit
event, so the comp sets Kickoff on play 20 and Punt Return on play 24 in the
page only.

## Coach decisions (2026-10-06)

- Charted on offense, defense and Special Teams.
- The play-level event is an exact count, `0` to `9` (revised 2026-10-07 from
  `0`, `1`, `2`, `3+`: Reports need true totals, and `3+` has none). Blank
  means not charted; `0` means checked, none. Uncharted is never counted as zero.
- Revision 1 put the count in its own chip row above Tackler(s). The coach
  rejected it: Missed Tackles goes below Tackler(s), with the same formatting
  and spacing as the player rows.

## What the screens show

Missed Tackles is one more player row in Players & Grades, built exactly like
the others: uppercase label, jersey-number box, roster picker, and a **Count**
select where the other rows have Grade. The row has no grade.

1. **Defense** (`defense-*`): after Tackler(s). Our defenders who missed, more
   than one allowed (`2, 3`, comma-separated like Tackler(s)), plus the count.
2. **Offense** (`offense-*`): after Receiver, count only: the defense missed
   on our ball carrier, and opponents are not on our roster.
3. **Kickoff / Punt coverage** (`kickoff-*`): after Opponent Returner. Our
   coverage players who missed, plus the count.
4. **Kick / Punt return** (`punt-return-*`): after Returner, count only.

The label is "Missed Tackles" on every unit; the unit says whose miss it is.
The count stays independent of the players picked: a count without names is
allowed, and one player may miss more than once.

## Collapsed spacing (coach, 2026-10-07)

`defense-collapsed-1440x900.png`: with every roster picker collapsed the rows sit
tight. On a fine pointer each player row has 6px vertical padding (was 8px),
the Show roster link is 20px tall (was 28px) and rows are 2px apart (was 8px),
so a collapsed row is 88px instead of 102px. Coarse pointers keep 44px targets.
This applies to every player row in the deck, not only Missed Tackles.

## Separator (coach, 2026-10-07)

Player numbers are comma-separated ("2, 3"), the format Tackler(s) already
stores. Multi-value tags elsewhere (Front, Result, Play Type) keep " + ".

## Not shown, built with it

- Study: a Missed Tackles dimension (the count, unit-split, film-linked, with
  its sample) and a Missed Tackler player dimension, through `AnalyticsRegistry`.
- Film Room: a Missed Tackles column.
- Field goal and try snaps (no return to tackle) do not show the row; a
  run/pass or Fake try uses its scrimmage side's row.
- Reports: an exception to the plan (coach, 2026-10-07). Defensive missed
  tackles go into the Defense, Players and Season tabs now, from their own
  comps; offense and Special Teams reports wait for roadmap step 4.
