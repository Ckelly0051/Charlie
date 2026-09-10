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
