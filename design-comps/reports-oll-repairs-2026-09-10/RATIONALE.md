# Reports OLL live-data repairs - production decision record, 2026-09-10

**Status: NOT APPROVED.** These are implementation decisions taken against the
already-approved comps, recorded here because a canonical comp directory is
hash-verified and cannot carry a new file. Every affected surface stays
`productionStatus: REJECTED`. Adding this file to
`design-comps/reports-self-scout-2026-09-05/` was attempted first and correctly
failed `audit-design-approvals.mjs` at 151 files against an approved 150; the
canonical artifacts are unedited and the audit is green at 9 surfaces / 462
files / 0 violations.

Source findings: `docs/REPORTS-OLL-LIVE-AUDIT-2026-09-10.md`. Canonical data:
`2025-st-joseph-mavericks-jv`, Week 5 vs OL Lakes Lakers (`gmqpt95xh58z0a`, 83
charted plays), read-only.

## Composition effects, stated exactly

No board, module, tile count or row count changed. Two ORDERS changed, both on
explicit coach direction, and both recorded here because a divergence stated
only in a commit body is not recorded.

### Reports > Self-Scout, defensive KPI band

Six tiles, unchanged in count and membership. Order was
`Stop Rate | Yards Allowed / Play | Havoc Rate | Sacks | TFL | Takeaways`;
it is now
`Yards Allowed / Play | Havoc Rate | Sacks | TFL | Takeaways | Stop Rate`.

Stop Rate is the inverse of offensive play success, so its down-specific
thresholds make the comparison misleading at a glance - the ruling already
recorded in `design-comps/reports-defense-2026-09-09/RATIONALE.md`, where the
Defense dashboard drops it entirely. Here it moves out of the headline slot
rather than being deleted, because deleting a tile would resize an approved
band. It remains the ranking key in this board's own Top Calls / Worst Calls
tables, which is its valid supporting use.

### Reports > Overview, Defense & discipline

Six rows, unchanged in count and membership. `Stop rate` moved from row 2,
directly beneath `Yards / play allowed`, to row 6.

### Not done, and why

Deleting Stop Rate outright from either surface would change an approved row
count. That is a composition decision and was not taken here. **For the coach
at the Gate.**

## Cohort vocabulary

Overview's `Total plays` is the CHARTED cohort (83 on OLL) with the CLASSIFIED
cohort as its qualifier (`64 of 83 classified - 77%`). Snaps by phase counts
each phase from the charted cohort and its three rows sum to it: Offense 30,
Defense 40, Special Teams 13. Yards per play stays on the classified production
cohort. `stats.allPlays` keeps its existing meaning; `chartedPlays` and
`phaseCounts` are non-enumerable so `e2e-parity` goldens do not drift.

## Parity golden correction

`tools/parity-golden/synthetic-edge.json`: **60 deletions, 0 additions.** Every
deleted block is a `Cover 3 -> Cover 3` defensive tell or its recommendation
echo - the tautology the repair removes. No metric, denominator, ref cohort or
other value moved. Reviewed and called out per the standing rule; the golden
was not regenerated to make a test pass.

## Down-and-distance labels and the twelve fixed rows

`StatsEngine._ddPretty` is the one owner of the approved wording, through
`StatsEngine.DIST_LABELS`: `Short -> 1-3`, `Medium -> 4-6`, `Long -> 7+`.

Reports > Defense already displayed exactly these labels, and its comp records
them ("Labels expose the engine's exact buckets: 1-3, 4-6, and 7+ yards"). It
achieved them by patching the string at three call sites inside
`defenseDashboard`, so `_ddPretty` still returned the engine's internal bucket
names and every OTHER surface printed `1st & Long`. Moving the wording to the
owner and deleting the three `.replace` chains changes no approved Defense
label; it makes every other surface match the one already approved.

Self-Scout's `By down and distance` module now renders the fixed twelve rather
than the buckets a cohort happened to observe. This is a row-count change to a
module that previously had no fixed count at all - it was volume-sorted and
sliced to fifteen - so it does not resize a fixed allocation; it gives one.
An unfaced bucket is HELD: `-` in every measured cell, and no film affordance.

## Turnovers, not Giveaways

`Giveaways` is removed from every Reports surface and export. Engine field
names (`isGiveaway`, `turnovers.giveaways`) are unchanged.

## Second parity golden correction

The `downDistRows` and label changes drift `tools/parity-golden/*.json`. The
diff was audited row by row before regenerating: every pre-existing row
survives with identical values, every added row carries `held: true`, `numbers`
and all drilldowns are byte-identical, and the remainder of `reports` differs
only by the bucket relabel. Per scope the row count goes 5/4/3 -> 12.

## Defensive yardage cohort

`Total Yds = Rush Yds + Pass Yds` on every Defense row. All three come from the
same classified run/pass cohort, taken as a union so a snap tagged both could
never count twice. Penalty-only yardage is not offensive yards allowed.

OLL is now 127 = 72 + 55, the coach's stated expected result. The approved
season KPI values are unchanged (497 / 271 / 226 / 2.9), because the season
delta was already zero - by coincidence, not by construction.

**Open for the coach:** `ypp` still divides by every defensive snap
(`rows.length`), which is what the approved `2.9` is measured over. Moving that
denominator to the classified count makes it `3.2`. That changes an approved
value and was deliberately NOT decided here.

## Special Teams field authority

The dedicated ST fields are authoritative on every surface. `_individualStats`
read the generic `tags.yardage` for punt distance and return yardage - the very
field the team report deliberately does not read on an ST play - so the two
surfaces reported different numbers for the same plays.

Canonical season, verified: 0 of 74 ST plays carry a structured `specialTeams`
event and none carries `kickDistance`. Players now reports `No data` for punt
average, matching the team report, instead of 2.8 and 0.0 derived from blank
generic yardage. Returns: 11 returns with exactly 1 measured for 5 yards, which
is what the team's Return Production reports.

A return or punt with no charted measurement still COUNTS as one; it
contributes no yards and no average. A measured zero is untouched.

No coach tag was inferred. Punt distance, hang time and return yardage are
essentially uncharted on this season - a charting-workflow gap for the coach.

### Third parity golden correction

`numbers` drifted, which is the analytics core, so the diff was inspected in
full: four added and two removed lines across two scopes. The synthetic
fixture's punt carries a charted `kickDistance` of 42 that the old code ignored
entirely, so `puntYds` moves 0 -> 42 and gains `puntsMeasured: 1`. Nothing else
in `numbers` moved.

## Matchup terminology and cohort qualification

`Their Primary Call` -> `Their Top Look`; `Our Top Call vs Same Look` ->
`Our Best Answer`. The value under those headers is a composite identity with
blank components dropped, and the canonical season charts no play call at all,
so on 32 defensive snaps it collapsed to personnel and read as `22`. Both
matchup directions carried the same error. No cohort, ranking, film reference
or value changed - headers only.

Matchup unit headers now say `charted snaps`. Self-Scout's sample line says
`classified` on both halves; it previously qualified only the offensive one.
201 / 173 / 174 / 154 are pinned in `e2e-reports-defense-realdata` so a future
change cannot quietly merge the two cohorts.

## Season > Offense tendency containment

`Tendency matrix` -> `Top 5 Tendencies`. It renders the five most frequent row
values and deterministically drops the rest, so the title names the cap the way
`Top 10 Plays` does.

At full-season scope its rows reached 70px: five of them plus a 30px header
need 380px inside a 316px wrap in a 378px fixed panel, so `.tm-wrap`'s
`overflow:auto` engaged and the last row escaped the module by 60px at BOTH
release widths. Game scope was clean, which is exactly why the game-scoped
Offense harness never saw it.

The panel does not grow. The row pitch is fixed at 54px - type sizes unchanged,
only the leading and surplus box height tightened, per the standing rule that
density comes from geometry and never from shrinking type. Measured after:
`scrollHeight === clientHeight`, escape 0, panel 378px, at 1440 and 1280.

`e2e-reports-offense-realdata` now exercises Season scope, which is the gap
that let this ship.

## Remaining legacy situation labels

Found by inspecting the repaired captures rather than by a grep: three more
label producers survived the `_ddPretty` change.

- `_selfScoutMatrix`'s `SITS` uses `_ddKey`'s own bucket keys and carried the
  engine's internal names. It takes `DIST_LABELS`.
- `defensivePerformance`'s `3rd & Short` / `3rd & Long` situation specs and
  Overview's matching Situational tiles and Key-metrics rows use EXACTLY
  `_distBucket`'s thresholds (1-3 and 7+), so they take exactly its wording.
- `_situationBucket` does NOT: second down splits at 3 with no middle band. Its
  labels are made explicit against its OWN thresholds - `2nd & 1-3`,
  `2nd & 4+`, `3rd & 1-3`, `3rd & 4-6`, `3rd & 7+` - rather than borrowing
  1-3 / 4-6 / 7+ wording that would misdescribe the cohort. The thresholds
  themselves are unchanged; harmonising them is a football decision and was not
  taken here.

The parity golden correction for this pass is six label-only lines, three
`2nd & Long -> 2nd & 4+` and three `3rd & Long -> 3rd & 7+`, with no numeric
drift.
