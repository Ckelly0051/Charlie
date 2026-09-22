# Reports > Players — Revision 2 decision record

**Date:** 2026-09-20 · **Status:** code review complete; Players composition
approved in the `1.12.0-91` installed smoke on 2026-09-21. Formal production
acceptance remains separate. The Revision 1 comp in
`design-comps/reports-players-2026-09-04` remains the composition authority for
the leaderboard; this file records what Revision 2 adds on top of it and why.

## What did not change

The six role tables — Rushing, Passing, Receiving, Tackles, Return Game,
Kicking / Punting — keep their stat definitions, their column schemas and widths,
their sorting, their Current game / Full season scopes, their role navigation,
the measured-zero versus `No data` distinction and the rule that these are
ATTRIBUTED ROLES, not participation or snap counts. The leaderboard is still the
entry point.

## The one owner

`StatsEngine._playerCredits(plays)` makes a single pass and files each attributed
play into a bucket keyed by player, role and statistic. Each bucket is a list of
`{ play, value }`:

| Reading | Meaning |
|---|---|
| `length` | a count (attempts, receptions, tackles) |
| `Σ value` | a total (yards, punt yards) |
| `max value` | a long |
| refs of its plays | the film cohort |

`_individualStats` now derives its long-standing output from that index instead
of counting a second time. The proof that nothing moved is `e2e-parity`: its
goldens are byte-identical, and the rewrite was additionally diffed against the
previous implementation over every canonical and demo cohort before the old code
was deleted.

`PLAYER_ROLE_COHORT` (`__role`) holds every play attributed to a role, including
one that contributed to no displayed statistic — a pass nullified by a penalty, a
takeaway role on a play that produced neither turnover. It is the role's own film
cohort (what the row action always opened) and the play set every split groups.
Discovering that this bucket was needed is why the first rewrite differed from
the legacy refs on two canonical cohorts.

## Decisions

1. **A statistic opens its own events; identity opens the player.** The old
   whole-row action meant every cell did the same thing. Cohort ownership is in
   the model and view model (`PLAYER_STAT_BUCKETS`), never reconstructed from a
   rendered string. A derived cell opens what it is derived from: `Avg` opens the
   attempts, `Long` opens the measured plays.
2. **A clipless value is not a button.** `No data` and a measured zero remain
   visible and are not clickable — there is no playlist to fabricate.
3. **Roles stay separate.** A player credited in several roles appears once with
   one labelled section per role. No combined rating exists, because a tackle and
   a reception do not add up to one number.
4. **Game rows are the same buckets narrowed**, so they reconcile to the totals
   above them by construction. A game with no credit for that player is `No
   data`, not a zero.
5. **Situational analysis reuses canonical owners only.** `PLAYER_DIMENSIONS`
   declares which roles each dimension can answer; a rusher is never offered
   coverage, a tackler never our own formation. A multi-value tag credits every
   component; an uncharted value produces no row.
6. **Selected games defaults safely.** An empty selection keeps the full season
   rather than blanking the board. Opponent-scout games are never offered.
   Nothing is written to stored data.
7. **Column visibility is presentation state.** Identity can never be hidden;
   defaults are the approved schemas; no calculation or cohort changes.
8. **Export follows the selection.** With a player open, Export produces that
   player's report, never the leaderboard.
9. **Type floor.** Players migrated to 12.5px (46 sub-floor elements → 0 on the
   canonical season). Role bands are content-height, so a short table no longer
   pads dead space beneath itself.

## Deliberately not built, and why

The current charting model records none of these, and inventing them would be the
fabrication this board exists to avoid:

- participation, snaps played or usage rate
- targets (a target is only charted when the pass is completed to a receiver)
- pressures, hurries, missed tackles
- blocking performance and coverage responsibility
- route or assignment data
- any combined or positional rating

Each needs expanded charting first; none is a reporting change.

## Known limitations

- **Grades are sparse.** An average grade renders only where grades were charted;
  `No grade charted` is stated rather than implied. On the canonical season most
  plays carry no grade.
- **A player can legitimately appear in several roles on one play** (a fake punt
  passer, a returner who is also the ball carrier on a reverse). Buckets are per
  role, so that play counts once in each role it was charted for and never twice
  within one.
- **Chromium cannot certify installed WebView2 rendering.** Layout, containment
  and browser-backed behavior were verified before the coach approved the
  `1.12.0-91` installed composition smoke.
