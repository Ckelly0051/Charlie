# Charting Cutover Rehearsal - 2026-09-30

Copy-only checkpoint 1. No live data, settings, mirror, film or restore point
was changed. No write approval requested or granted. Source SHA-256 before and
after: `67780703e0e2bff34c0f5672af5f6e13887d980bdf2c3ee93584849ca2b6c696`.
Source code: `11782485` (conversion code unchanged from the green gate).

Scratch directory:
`C:\Users\charl\AppData\Local\Temp\giq-cutover-2026-09-30-BaLH8y`.
It contains original `source.db`, `rehearsal/converted.db`, report, impact and
exact takeaway differences. These are not a live restore point. JSON review
evidence is committed beside this record; no catalog copy is committed.

## Current Counts

No discretionary mappings supplied. Exact current Formation names carry over;
no Receiver Alignment or Offensive Line Strength is inferred.

| Season | Plays | Nonblank old Formation | Resolved | Unresolved |
|---|---:|---:|---:|---:|
| SJM Varsity 2026 | 293 | 87 | 79 | 8 |
| SJM JV 2026 | 186 | 64 | 58 | 6 |
| 2025 St. Joseph Mavericks - JV | 440 | 345 | 271 | 74 |
| Total | 919 | 496 | 408 | 88 |

The earlier 198 unresolved count is superseded. Identity, timestamps, exact
film references, unrelated tags, other play fields, game fields and scratch
catalog read-back pass for all three seasons. Current-format checks still fail
on the 88 unresolved records. This scratch catalog is NOT ready for live use.

## Coach Decisions

Coach supplied the explicit table on 2026-09-30. Recorded in
`tools/charting-coach-mapping-2026-09-30.json`: Trips + Unbalanced,
Bunch + Trips + Unbalanced, Bunch + Spread + Trips, Bunch + Trips and
Bunch + Single Wing + Trips + Unbalanced become Trips. I-Form + Twins,
Ace + Twins, Split Back + Twins, Twins + Unbalanced and Spread + Twins
become Twins. Doubles + Spread becomes Doubles. Unbalanced alone is blanked
and retained on the re-chart list (four live plays). No strength or Receiver
Alignment is inferred. These decisions approve the mapping only, not a live
write or historical-snapshot removal. The table below is the original inventory.

One explicit rule can cover an exact combination regardless of token order;
per-play overrides handle exceptions. These counts are live plays only.

| Stored combination | Plays |
|---|---:|
| Trips + Unbalanced | 22 |
| I-Form + Twins | 19 |
| Bunch + Trips + Unbalanced | 16 |
| Doubles + Spread | 13 |
| Ace + Twins | 7 |
| Unbalanced | 4 |
| Bunch + Spread + Trips | 2 |
| Split Back + Twins | 1 |
| Twins + Unbalanced | 1 |
| Bunch + Trips | 1 |
| Bunch + Single Wing + Trips + Unbalanced | 1 |
| Spread + Twins | 1 |

Choose a single coach-named Formation for each combination, or explicitly
approve blanking its formation and retain the old value on the re-chart list.
Do not infer left/right from Twins, Trips, Bunch or Unbalanced. Existing charted
strength survives; missing strength and Receiver Alignment can remain blank.
Any chosen strength conflicting with a stored value needs an explicit exception.

## Restore Points And Versions

| Kind | Total | Resolves under current rules | Unresolved mapping | Other format problems |
|---|---:|---:|---:|---:|
| Catalog restore points | 76 | 11 | 31 | 34 |
| Catalog game versions | 146 | 32 | 20 | 94 |

Restore points contain 21,405 play records; versions contain 10,877. These are
repeated historical records, not additional live plays. Counts are not removal
approval. Rehearsal leaves unresolved/otherwise invalid snapshots intact in the
copy; they would remain refused by the app. Decide whether to retain them
untouched or handle them through a separately confirmed archive process.

## Analytics Differences

The proof flags `takeaways.fix` in all three seasons and `takeaways.working`
in SJM JV and 2025 JV. Ten games have changed takeaway lists. Exact before/after
evidence is in `charting-takeaway-differences-2026-09-30.json`.

Source inspection: `StatsEngine` creates formation-based recommendations with
`cut: ['formationFamily', name]`, sorts by recommendation score and keeps the
top five (`js/stats-engine.js`, formation recommendations and final takeaway
return). Converting exact names makes those recommendations available. All
new entries in this rehearsal are formation-based; displaced entries are
lower-ranked existing recommendations, not deleted charted data. For example,
2025 JV Week 6 gains Power-I and Single Wing recommendations, displacing
explosive-play and points-per-drive text from the top-five working list.

This explains the difference but does NOT make the write proof pass. The guard
still refuses nonempty `analyticsUnexpected`. Before live approval, establish
a narrowly tested proof for formation-driven recommendation/ranking changes;
do not blanket-ignore all takeaway differences. Rerun after coach mappings.

## Next

### Coach-Mapped Rerun

The explicit mapping resolves all 496 nonblank old Formation records across
the 919 live plays: 87 Varsity, 64 SJM JV and 345 2025 JV. Four 2025 JV plays
with Unbalanced alone are deliberately blanked and listed for re-charting.
All three seasons have zero unresolved values and zero current-format problems.
Identity, film, unrelated tags, other play/game fields and round-trip proofs
pass. Source hash remains unchanged. Exact evidence:
`charting-coach-mapped-rehearsal-2026-09-30.json`.

42 of 76 restore points and 52 of 146 versions resolve. The remaining 34
restore points and 94 versions have other format problems; no mapping is
guessed for those and no record is removed. Historical handling remains a
separate coach decision. Generated takeaway proof still blocks the live write
(`takeaways.fix`, and in two seasons `takeaways.working`). No gate, installer
or live write was run.

The 12 combination decisions are settled. Settle historical-snapshot policy, verify browser
settings disposition, address the narrowly explained takeaway proof, then rerun
the complete copy rehearsal. Only its exact final impact can be approved for
the separate live-write checkpoint. No installer or gate was run in this step.
