# Reports Defense Comp

Status: APPROVED by Charlie 2026-09-09; implemented for code review, not production accepted

## Source

- Canonical season only: `2025-st-joseph-mavericks-jv`.
- Every displayed value is derived from that season. No dummy rows or invented football results are used.
- A dash is a held static slot with insufficient qualifying data.

## Composition

The Defense report is a fixed four-screen dashboard:

1. Defensive Performance
2. Opponent Offense
3. Scheme
4. Situational Results

The approved comp is the production schema. Module placement, row counts, and board height do not change with the selected game. Sparse cohorts hold their assigned slots with dashes. Larger cohorts are ranked and capped to the visible row count.

## Decisions

- Stop Rate is not used as a down-to-down comparison. The prior metric was the inverse of offensive play success, so its down-specific thresholds made the comparison misleading at a glance.
- Down and quarter tables use Total Yards and Yards/Play as the primary production measures.
- Season totals are paired with Last 3 comparisons where the comparison is meaningful.
- Opponent Offense combines tendency and defensive result: play type, formation, personnel, backfield, and attack direction.
- A defensive call is the complete charted combination of front, coverage, and pressure.
- Top Calls and Worst Calls use the same qualified cohort and fixed four-row modules.
- Scheme compares Blitz directly with No Blitz, then breaks pressure results out by situation.
- Situational Results combines opponent tendency, our top call, call frequency, pressure frequency, and production allowed.
- Down-and-distance renders all 12 down-by-distance combinations in fixed football order. Labels expose the engine's exact buckets: 1-3, 4-6, and 7+ yards. A cohort without data holds its row with dashes.
- Module and section explainer prose is omitted. Data-bearing baselines remain where they are required to interpret a comparison.

## Review Evidence

- Release widths: 1440 and 1280.
- Viewport height: 900.
- Required: no page-level horizontal overflow, no clipped module content, and four distinct section captures.
- Capture script: `capture.mjs`.
- Captures: `captures/1440-section-1.png` through `captures/1440-section-4.png`, with matching 1280 captures.

## Production Mapping

- Data owner: `StatsEngine.defenseDashboard()`.
- Presentation owner: `DefenseTab` in `js/native-report-tabs.jsx`.
- Fixed allocation owner: `DEFENSE_DASH_ROWS` in `js/native-report-tabs.jsx`.
- Production evidence: `tools/e2e-reports-defense-realdata.mjs`.
- The canonical season is copied into browser memory for verification and remains byte-identical on disk.

The composition is approved. The implementation remains `productionStatus: REJECTED` until Charlie reviews and accepts the production build.
