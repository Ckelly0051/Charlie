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
- Opponent Offense combines tendency and defensive result: play type, calls by
  offensive formation/look, personnel, backfield, and attack direction.
- `Calls by formation` replaces the descriptive `Formation faced` table. Each
  of its six fixed rows preserves the complete projected offensive look across
  QB alignment, backfield and receiver structure, then shows the two most
  frequent exact play calls and their shares. For example, an under-center I
  backfield plus Twins displays as `I-Form + Twins`, with `Run Inside 70%`
  rather than dissolving the snap into unrelated formation totals.
- Calls by formation ranks looks by charted play-call snaps, then uses a
  deterministic name tie-break. Play-call share divides by the charted calls
  in that exact look. Sparse cohorts hold dashes; only the six most frequent
  looks render when more qualify. The table and HTML export use the same rows.
- A defensive call is the complete charted combination of front, coverage, and pressure.
- Top Calls and Worst Calls use the same qualified cohort and fixed four-row modules.
- A defensive call qualifies for Top/Worst Calls at four classified snaps. Four
  is the minimum because these are performance rankings, not the three-snap
  tendency-alert threshold used by Self-Scout. When four calls qualify, all
  four allocated rows render; a dash means there is genuinely no fourth call.
- Scheme compares Blitz directly with No Blitz, then breaks pressure results out by situation.
- Situational Results combines opponent tendency, our top call, call frequency, pressure frequency, and production allowed.
- Down-and-distance renders all 12 down-by-distance combinations in fixed football order. Labels expose the engine's exact buckets: 1-3, 4-6, and 7+ yards. A cohort without data holds its row with dashes.
- Module and section explainer prose is omitted. Data-bearing baselines remain where they are required to interpret a comparison.
- Current Game scope uses current-game labels and comparisons only. It never
  calls one game `Last 3` or labels that game's own average as a season average.
- Field zone keeps five static visual rows. Its boundaries come from the
  canonical `_fieldZone()` bucketer: `Backed up`; combined `Own 11–39` and
  `Midfield` displayed as `Open Field`; `Opp 40–20`; `Red zone`; and `Goal line`.
- Call share divides by snaps carrying a charted defensive call. Blitz share
  divides by charted Blitz plus charted No Blitz snaps. Missing defensive
  structure is absent data and cannot dilute either percentage.

## Review Repairs

The 2026-09-09 implementation review found that the first production pass had
copied the comp's band heights without its border-box row geometry. The repair
restores the 31px module header, compact table pitches, and the 23px
down-and-distance pitch; constrains each module to its band; and independently
tests both module content and band containment. Situational Results now fits the
900px release viewport rather than painting below it.

The 1280 layout has its own fixed responsive allocation: the same modules and
rows, a compact toolbar, and reduced row pitch. It is static across all six
games and exists only to keep every approved row visible inside the 900px
release viewport; data never selects or changes that geometry.

Three approved data baselines are preserved: By quarter, Production by play
type, and By hash. Field zone is the approved proportional bar module rather
than a replacement table. Attack direction preserves separate run/pass colors
and includes both snap denominators in its key.

The static composition, not the erroneous captured values, governs behavior in
three places: Top/Worst Calls use all four allocated rows when data exists; the
order-insensitive composite front displays the team's base front before its
shift package; and measured zero rush/pass yards remain `0`, never `-`.

Performance values remain neutral ink. The comp's red/green examples did not
define a football threshold that could classify every scope honestly, so
production does not invent one. This is a deliberate recorded divergence, not
an omitted style.

The Defense export now consumes `defenseDashboard()` and carries the same four
sections and scope as the board. The superseded defensive-performance and
predictability export is retired.

The coach-directed 2026-09-10 usefulness amendment changes one module without
changing board geometry: `Formation faced` becomes `Calls by formation`. The
six-row allocation, containing band and four-screen schema remain fixed.

## Review Evidence

- Release widths: 1440 and 1280.
- Viewport height: 900 at both widths.
- Required: no page-level horizontal overflow, no clipped module content, and four distinct section captures.
- Required: every module stays inside its fixed band and every module's content
  stays inside that module. Neither assertion may substitute for the other.
- Capture script: `capture.mjs`.
- Captures: `captures/1440-section-1.png` through `captures/1440-section-4.png`, with matching 1280 captures.

## Production Mapping

- Data owner: `StatsEngine.defenseDashboard()`.
- Presentation owner: `DefenseTab` in `js/native-report-tabs.jsx`.
- Fixed allocation owner: `DEFENSE_DASH_ROWS` in `js/native-report-tabs.jsx`.
- Production evidence: `tools/e2e-reports-defense-realdata.mjs`.
- The canonical season is copied into browser memory for verification and remains byte-identical on disk.

The composition is approved. The implementation remains `productionStatus: REJECTED` until Charlie reviews and accepts the production build.
