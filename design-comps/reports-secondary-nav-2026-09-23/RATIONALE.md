# Reports section navigation: decision record

Date: 2026-09-23

Status: **design comp for coach review.** Package 1 of the coach-aligned
sequence in `GRIDIRON-IQ-PLAN-V2.md`. Not approved, not implemented. No
production UI, report calculation or registry state changed. Both open
Reports findings (repeated game banner, inconsistent section navigation) stay
open in `docs/OPEN-DEFECTS.md` until a coach verdict and a verified build.

## What this comp is

`index.html` is the review page. Every image in `captures/` is the
**production build** loaded with a read-only, hash-checked copy of the
canonical `2025-st-joseph-mavericks-jv` season (six games; Week 1 vs St. Peter
Lutheran open, 70 plays). A presentation layer (`comp.css` + `comp.js`) is applied on top of
it. So the boards, modules, cohort counts and film actions in the captures are
production's own, not placeholder tables. `build.mjs` regenerates everything
and runs the comp's focused checks:

- The global strip's tab boxes are identical with and without the layer
  (Overview, Offense, Defense and Players at 1440).
- Every Offense block (15) and Defense block (9) appears on exactly one page,
  and no page is empty.
- There is no page-level horizontal overflow at 1280 or 768.
- There are no console errors.
- Result (Win/Loss/Tie) is derived only when both scores are present and
  valid. `Number('')` and `Number(null)` are 0, which once read a missing
  opponent score as a Win (corrected 2026-09-23); a missing score reads
  `No data`.
- The season file is byte-identical afterwards.

`current-1440-*.png` are unmodified production for comparison.

## Decisions

1. **The global strip is unchanged.** Same position, height, tab boxes, order,
   perspective control and full export menu as the approved 2026-09-22 comp.
2. **One secondary bar, one position.** Every multi-section report gets the
   same 46px bar directly under the global strip, on the same 32px inset.
   - **Left, secondary navigation:** this report's pages. It uses the Special
     Teams/Players interaction, where a tab switches the visible page. Counts
     show where the report already has them.
   - **Right, scope:** filters this report (Current game first; Players adds
     Selected games; Matchup's opponent picker belongs here because it
     filters).
   - **Right, report export:** where the report has its own export.
   The global strip's Export stays the full export menu. Single-page Overview
   gets no bar, and no report gets an empty tab.
3. **Offense becomes six pages:** Identity, Calls & tendencies, Structure,
   Situations, Field & production, Advanced. These are the approved zones; each
   page is exactly one zone's existing modules, including the zone-1 KPI band
   on Identity.
4. **Defense becomes four pages:** Performance, Opponent offense, Scheme &
   passing, Situations. These are the Revision 2 sections, each keeping its
   numbered heading and `N charted / M with Run/Pass charted` line. The sticky
   scope-and-jump bar is replaced by the shared bar.
5. **Detail tabs begin with their own report.** The game KPI rail (Total Plays,
   Plays Charted, Plays per Phase, Offense Success Rate, Turnovers) no longer
   renders on any tab.
6. **Overview gets a compact score.** The linescore sits beside three facts no
   Overview tile already states:
   - result with week and date
   - charted plays of total
   - turnover margin, with takeaways and turnovers spelled out
   Removed from the score band: the Yards-per-play story (the Overview KPI band
   owns Yards / play) and the right-side matchup name, which repeated the
   opponent the linescore already names. The Overview board below is unchanged.
7. **Down-and-distance chart location: the first module of the Situations
   page**, on Offense (our down and distance) and on Defense (opponent down
   and distance), above the existing Down & Distance tables.
   - **Layout:** a 4 × 3 grid, 1st-4th by `1-3` / `4-6` / `7+`, the same twelve
     buckets the existing tables use. Each cell shows plays, a run/pass split
     bar, success rate and yards per play. An unfaced bucket is a held dash,
     never a zero.
   - **Interaction:** selecting a cell opens a side panel with run/pass, yards
     per play, success, the top play types and `Watch N plays`, which uses the
     cell's exact composite film refs.
   - **Values in the comp** come from existing charted fields through
     StatsEngine's own `_ddKey` and success predicates, over the report's own
     cohort (27 offensive snaps; 15 defensive run/pass snaps).
   It is labelled a proposal. The analytics owner, export parity and tests are
   a separate checkpoint.

## Tradeoffs to decide

- **Short Offense pages — DECIDED 2026-09-23: keep six.** Identity,
  Structure and Advanced are short at 1440, and the Offense KPI band appears
  only on Identity. The coach kept the six pages to leave room for growth
  rather than merge them into fewer, longer pages.
- **Offense and Defense lose continuous scrolling.** A coach who read Defense
  top to bottom now switches pages. Page state is controller state (as
  Players, Self-Scout and Season already are), so an ordinary re-render will
  not reset it.
- **The Defense sticky bar goes away.** On a page layout the shared bar
  replaces it; there is no long page for it to pin over.
- **Special Teams keeps its KPI tiles and unit ledger above every section**,
  as today. They summarize all units, not one section.
- **Overview drops the Yards-per-play story from the score band.** The same
  number stays in the Overview KPI band.
- **Below 1100px** the section tabs scroll inside their own row and scope and
  export move to the row beneath. This follows the existing strip's
  narrow-width behavior.

## Production changes after approval

1. **Shared component.** Add one `ReportSectionBar` in
   `js/native-report-kit.jsx` taking `sections` (id, label, optional count),
   `active`, `onSelect`, optional `scope` and optional `exportAction`, styled
   once in `css/native-reports.css`. Render it once, directly under the strip,
   from the Reports route owner (`js/native-reports.jsx`, positioned by
   `js/reports-screen.js`), fed by the active board.
2. **Offense** (`js/native-report-tabs.jsx`): replace `ZoneNav` jump links with
   page state on `ReportsScreen` (`offenseSection`, like `selfScoutSection`) and
   render only the selected zone's existing modules. `OFFENSE_ROWS` /
   `OFFENSE_MODULES` counts are unchanged. `e2e-reports-offense` and
   `e2e-reports-offense-realdata` move from one-board to per-page inventory
   assertions.
3. **Defense** (`js/native-defense-board.jsx`): add `defenseSection` controller
   state, render one section, and retire the sticky jump bar and its
   Defense-only scrollport overrides. The module geometry contract and inventory
   stay unchanged per section. Update `e2e-reports-defense-realdata` (the
   sticky/jump assertions retire) and `e2e-reports-defense-board`.
4. **Special Teams, Players, Self-Scout, Season, Matchup:** move each board's
   existing section tabs, scope and report export into the shared bar. The
   boards keep their controller state (`playersSection`, `selfScoutSection`,
   `matchupTab`, the Season section) and their existing handlers.
5. **Game rail:** stop rendering `[data-reports-rail]` on every tab (in
   `ReportsScreen._syncKpiRail`), and move Plays charted and the turnover
   margin into the Overview scorebug.
6. **Overview scorebug** (`ReportsScreen._syncScorebug`): drop the
   Yards-per-play story and the right-side game name; add Result (with week and
   date), Charted and Turnover margin from `_kpiRailData`. Score sources and
   arithmetic are unchanged.
7. **Full-report export is unchanged.** The global menu and each report's
   export call the same `ReportsScreen` methods. A page selection does not
   narrow a full-report export.
8. **Tests:** extend `e2e-reports-global-strip` so that the secondary bar has
   one y and height on every multi-section report, and there is no game rail
   on any tab. Assert each Offense/Defense module appears on exactly one page,
   on the canonical season, at 1440 and 1280.
9. **Down-and-distance chart:** a separate checkpoint. It needs a
   StatsEngine owner over the existing twelve buckets, cohort statements,
   exact film refs, export parity, and synthetic plus canonical tests.
