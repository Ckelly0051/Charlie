# Reports > Defense production rebuild - 2026-09-09 (superseded)

**Status: SUPERSEDED.** This earlier implementation record describes the
rejected pre-approval board. The current approved composition, production
mapping and evidence are recorded in
`design-comps/reports-defense-2026-09-09/RATIONALE.md`.

The approved Defense comp remains the information-architecture source. This
production pass applies the later static-dashboard and copy decisions that now
govern every Reports surface. Acceptance evidence uses only the registered
canonical season, `2025-st-joseph-mavericks-jv`; fixture data cannot establish
visual or football correctness.

## Fixed schema

Defense has four section tabs and eleven modules. The old fifth Defense >
Self-Scout section is removed, including its dead presentation code. It was a
predictability-only duplicate of the canonical top-level Reports > Self-Scout
board and was explicitly rejected during the `1.12.0-74` smoke.

| Section | Modules and fixed allocation |
|---|---|
| Defensive performance | Sample by game 6; Run / pass faced 2 fixed summaries; By down 4; Disruption 8 fixed tiles |
| Opponent Offense | Opponent play type 7; Best call by play type 7 |
| Scheme | Front 5; Coverage 5; Pressure 5; Front by situation 5 |
| Situational results | Situational defense 8; Scheme by situation 8 |

`DEFENSE_ROWS` in `js/native-report-tabs.jsx` is the single production owner.
A short cohort holds its allocation with dash rows. A long cohort is ranked in
the existing engine order and capped. Data cannot add a module, remove a
module, or alter a section's height.

## Composition corrections

- `By down` uses the four already-computed down rows beneath Run / pass faced.
  It fills the opening band with useful data instead of preserving its 78px
  empty panel.
- Opponent play type and Best call use the same seven play-type rows. A call
  that has not reached the three-snap qualification threshold shows a dash in
  that answer cell; there is no prose disclosure row.
- Best-call rows have a fixed two-line decision shape and the whole band has a
  fixed 430px footprint. Imported call names cannot move the section.
- The former 86px and 72px paired-band gaps close through fixed allocations,
  not stretched table rows.
- Module and section-header explainers are absent. Titles, table labels and
  data-bearing KPI sublines remain.

## Verification

`tools/e2e-reports-defense-realdata.mjs` deep-copies the canonical season into
an in-memory browser store, exercises all six games in current-game scope at
1440x900 and 1280x800, and captures the richer full-season board for review.
It requires exact module inventories, exact row counts, one section height per
viewport across all games, no rendered explainer prose, no clipping, no page
overflow, no panel overflow, no console errors, and a byte-identical source
season after the run.

- Production build: pass
- Defense real-data gate: 20/0
- Shared native Reports: 100/0

Review captures: `artifacts/defense-production-realdata/`.
