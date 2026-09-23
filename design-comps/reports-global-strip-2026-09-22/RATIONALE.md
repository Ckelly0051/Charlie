# Reports global strip - decision record

Date: 2026-09-22

Status: **navigation comp approved by the coach**. Implemented in source by
`160533c`; not packaged, installed-smoke approved, or production accepted.

The approved interactive artifact is the byte-identical sibling file
`../reports-global-strip-2026-09-22.html`. It stays at its committed path so
the approved comp and existing references are not moved merely to add this
record. This directory holds the comp's rationale and scope boundary.

## Coaching problem

Reports is one workspace within the selected season, but its surrounding
chrome varied by tab. Moving from Overview to Season could require vertical
mouse movement because conditional score and report controls changed the
position of the top-level tabs. Special Teams, Players, Self-Scout, Season,
and Matchup felt like different navigation systems even though their tabs
serve the same global role.

## Approved navigation

- Keep the shared Program, Season, and Game selectors above Reports.
- Use one fixed-height report header and one shared top-level strip on all
  eight Our Program report tabs. The strip carries perspective, tab navigation,
  and Export; its y coordinate, height, and each tab's x position stay fixed
  as the coach changes reports or a report's scope.
- Order the tabs Overview, Offense, Defense, Special Teams, Players,
  Self-Scout, Matchup, Season. Season is last and remains the full-season
  parent. A coach should reach it from Overview with horizontal pointer
  movement only.
- Put report-specific scope, filters, jump links, and section tabs below the
  global strip. Where a report offers game/season scope, its initial selection
  is Current game. A deliberate Full season choice is not reset by an ordinary
  re-render. Do not add an Offense season selector; that suggestion was
  explicitly withdrawn.
- Show the game linescore on Overview only, below the strip. No detail report
  needs a top-level game score or Final Score tile. Conditional score content
  must never alter the global strip's geometry.
- At desktop release widths, labels remain whole, tabs stay in one row, and
  perspective or opponent availability cannot shift later tabs. A disabled
  tab may hold its slot in opponent perspective; silently removing it cannot.

## Production mapping

`js/native-reports.jsx` owns the single strip and tab order;
`css/native-reports.css` owns its stable geometry. `js/reports-screen.js`
owns score visibility, scope defaults, and active/available tab state.
`js/native-defense-board.jsx` and `js/native-report-tabs.jsx` present their
existing scope controls below that strip. This is a presentation decision:
StatsEngine formulas, canonical cohorts, film references, and export contents
must not be rewritten to implement it.

## Approval boundary

The comp's short tables, sample metrics, and generic font are illustrative
fill beneath the navigation. They do **not** approve truncated reports, new
football numbers, new row caps, or replacement of any existing full board.
The black outer frame on recent boards and the Players jersey/name alignment
were separate `1.12.0-94` installed-smoke findings, repaired in the same source
batch, not implied by approval of the strip itself.

This approval does not change any `design-approvals/APPROVALS.json` production
status. The `1.12.0-94` installer predates `160533c` and cannot smoke-accept
this work. A later installed build and coach verdict are still required.

## Evidence and verification

`tools/e2e-reports-global-strip.mjs` measures tab bounding boxes, order,
score placement, scope state, and frame/name geometry against a read-only copy
of the canonical 2025 St. Joseph Mavericks - JV season at 1440 and 1280,
with wide-frame checks at 1920. The harness writes populated source captures
to `artifacts/reports-global-strip/` locally; they are untracked and must be
regenerated on a clean checkout. These are implementation evidence, not an
installed WebView2 verdict or approval of the report data beneath the strip.
