# SMOKE 1.12.0-97 - Windows x64 Beta (unsigned)

**Source:** `2799be5` (the four-owner version bump on top of `1faa1df`), built
from the clean main checkout. **Gate:** full gate at `87371cd` (the last code
commit) 125/125, zero skipped, zero failed; `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-97_x64-setup.exe`
(4,023,692 bytes). SHA-256:
`CE5A17DB1D576EA0BA896767FFD710F75647908BDE38E910311DCB31D82BE401`.
The built executable reports file and product version `1.12.0-97`. Built with
`cargo tauri build --bundles nsis` and a local `createUpdaterArtifacts:false`
config file (no signing key); exit 0.

**This is the combined Reports smoke candidate.** It supersedes `1.12.0-96`,
which was never smoked and carries a global input regression (below). Nothing
from `1.12.0-96` or `1.12.0-95` has an installed verdict, so their checks are
carried here.

**New since `1.12.0-96`:**
- The down-and-distance chart (`80941c7`, `cd0fb40`), item 7 of
  `design-comps/reports-secondary-nav-2026-09-23`.
- The input regression repair (`87371cd`). `1.12.0-96`'s secondary bar loaded
  `preact/compat`, which made every text and date field in the app commit per
  keystroke instead of on change (charting yardage, the Special Teams and
  penalty editors, Study date ranges and Plan fields).

## Coach smoke checklist

**Down-and-distance chart**
1. Offense > Situations and Defense > Situations open on the chart: 1st-4th
   down by 1-3 / 4-6 / 7+, each cell with plays, run/pass split, success and
   yards/play; unfaced cells are dashes and cannot be selected.
2. The header states the cohort (`N of M run/pass snaps carry down and
   distance`; Defense says `opponent`).
3. Selecting a cell shows its run/pass, success and yards/play with their
   denominators, its top play types, and `Watch N plays`, which plays exactly
   that cell's snaps.
4. Defense's chart follows Current game / Full season, and Season > Offense and
   Season > Defense show the season charts.
5. The game, season and Defense exports carry the same chart values and cohort
   sentence.

**Input repair (outside Reports)**
6. In Break Down, type a yardage (including three digits) and other text
   fields; the value saves once and the field does not fight your typing.
7. In Study, set a date range and save a view or a plan; the values stick.

**Secondary bar (carried from `1.12.0-96`)**
8. One secondary bar sits directly under the Reports strip, in the same place,
   on Offense, Defense, Special Teams, Players, Self-Scout, Matchup and Season;
   Overview has none.
9. Offense has six pages and Defense four; switching pages or scope never
   moves the strip or the bar.
10. Export from any Offense or Defense page gives the full report.
11. No detail tab shows the game KPI banner. Overview's score shows the box
    score with Result, Charted and Turnover margin, and no repeated opponent.
12. The Defense board reads `Explosive Plays` / `Explosive Plays Rate` with no
    wrapped KPI tile or header; the Defense export still says `Allowed`.
13. Special Teams' five sections fit the bar at your window size.

**Carried from `1.12.0-95`, not yet verdicted**
14. Strip geometry, Current game defaults, outer frame, Players names, and the
    earlier carried items in `SMOKE-1.12.0-95.md`.

Installed smoke pending. Not tagged, pushed or published.
