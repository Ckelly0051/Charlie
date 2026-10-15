# Gate Runtime Audit

## Evidence Boundary

Last completed full-gate receipt:
`artifacts/gate-logs/2026-10-14T19-46-40-309Z-96k7d5/receipt.json`,
source `a5238591`, 166/166 passing. This predates the cleanup and runtime
enforcement. Its historical pass is unchanged; it is not a current performance
measurement. No new full gate was run for this audit.

| Measurement | Value | Evidence |
|---|---:|---|
| Receipt interval | 990.002 s (16 min 30.002 s) | Derived: finishedAt minus startedAt |
| Sum of harness durations | 983.468 s | Derived from the 166 recorded durationMs values |
| Unattributed remainder | 6.534 s | Derived difference, not a measured setup phase |
| True runner-entry-to-finish wall time | Unavailable | The old receipt starts after initial source/fixture fingerprinting |
| Build, browser launch, fixtures, final fingerprints | Unavailable separately | No phase timing fields in that receipt |

Old harness durations include their post-child context cleanup. The remainder
mixes build, browser launches, evidence handling and other runner overhead;
it cannot be assigned to those costs individually. New receipts separate
harness execution from cleanup and record non-overlapping phases.

## Slowest Harnesses

Times are recorded historical durations, not estimates of today's runtime.
Coverage below was checked against current assertions. "Distinct" identifies
the responsibility to preserve, not a claim that every assertion is unique.

| Harness | Seconds | Distinct coverage to preserve | Overlap to audit |
|---|---:|---|---|
| `e2e-reports-offense-realdata` | 72.126 | Canonical six-game Offense composition, row capacities and clipping at both desktop widths; source integrity | Synthetic Offense schema/geometry; shared strip and typography census |
| `e2e-reports-global-strip` | 64.155 | Cross-report strip/secondary-bar stability, scope retention, Overview-only score, narrow navigation and player identity alignment | Every board's route/layout traversal; board-specific geometry |
| `e2e-reports-defense-realdata` | 62.620 | Canonical Defense modules, KPI values, per-game composition, scopes and exports | General Reports journey, analytics parity, shared navigation and typography checks |
| `e2e-reports-offense` | 61.503 | Synthetic football edge cases, exact film cohorts, empty/sparse/over-cap states and export contracts | Canonical Offense composition; pure engine calculations and the strip |
| `e2e-reports-players` | 49.291 | Role schemas, zero versus absent attribution, grades, exact cross-game film, filtering and player exports | Roster ownership, Special Teams player accounting, parity and navigation geometry |
| `e2e-reports-season` | 31.577 | Season cohort excludes scouts, record/game-log arithmetic, scrimmages, navigation and season exports | Engine parity, general Reports rendering and embedded Self-Scout |
| `e2e-integrity` | 30.378 | Twelve seeded 80-operation sequences; cross-game isolation and round-trip invariants after each operation | Deterministic ownership, save/restore and catalog tests; randomized sequence coverage remains distinct |
| `e2e-reports-self-scout` | 28.523 | Small-sample suppression, all down/distance cohorts, tendency rules, season embedding and export | Engine calculations, Season embedding, global navigation and type checks |
| `e2e-copy-standard` | 23.927 | Route-wide visible label/caption census with non-vacuity coverage | Board suites' copy assertions and repeated traversal; not just Reports |
| `e2e-reports-typefloor-realdata` | 23.063 | Canonical exact font census, both widths, with explicit Offense narrow-cell exceptions | Board clipping/geometry and navigation traversal; this is the designated typography owner |

## Audit Order

1. Preserve these responsibilities before moving or deleting a check. Assign
   each guarantee one owner; retain rendered integration checks where they
   prove something a pure engine test cannot.
2. Reports suites dominate this historical list. Their consolidation belongs
   to the Reports rebuild, per the coach; none was changed here. Reuse a
   populated traversal for shared assertions where practical, not independent
   full-board walks for every shared concern.
3. Outside Reports, inspect repeated route setup in copy checks and overlap
   between randomized and deterministic persistence scenarios. Do not drop
   isolation or failure-path checks merely because a fuzzer sometimes visits
   the same operation.
4. Measure the current full run only with coach authorization. Use its phase
   timings to distinguish setup costs, a slow harness and runner overhead
   before another structural reduction. The six-minute budget is a target to
   enforce, not evidence that the current suite meets it.

## Current Enforcement

`tools/run-gate.mjs` retains existing individual deadlines and records setup
separately from harness execution. `tools/gate-receipt.mjs` owns the six-minute
full-run verdict. A budget excess does not stop the loop. The existing runner
tests use scratch-only child processes to prove deadline termination, complete
post-expiry collection, an eligible under-budget control and focused exemption.
No production-app code, coach data, harness inventory, installer or installed
approval changed.
