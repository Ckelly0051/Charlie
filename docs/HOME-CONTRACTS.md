# Home contracts

Current binding rules for Home (`js/home-screen.js`, `js/native-home.jsx`,
`css/native-home.css`), the season library and opponent-scout ownership. Home
production is formally `REJECTED` in the approval registry; the `1.12.0-92`
smoke approved its visual composition only. History and reasoning:
`docs/archive/CLAUDE-2026-09-27.md`.

## Program season and opponent scouts

- A program season is the parent Home context; every scout belongs to exactly
  one through a durable `programSeasonId` on its body and library row.
  `Our Program` and `Opponent Scout` are two views of that one parent.
- `WorkspaceContext` solely owns the parent id and mode (`giq_home_parent`). A
  passive re-render may adopt the parent but never restates the mode of an open
  program season.
- The toggle is one state change and one render: entering Opponent Scout keeps
  the parent open and shows its scoped library; it never calls `closeSeason()`
  or `_openLibrary()` and never auto-opens a scout. Returning opens a season only
  when a scout is open, and then by its exact `programSeasonId`.
  `_workspaceTarget()` and the "restore most recent season of its kind" redirect
  are retired; `lastOpened` only orders within a correct parent.
- Legacy inference is read-only and unique-match only (one program season with
  the same `teamId + year + level`); zero or several leaves the scout unassigned.
- Unassigned and dangling scouts appear under `Needs a program season` with an
  explicit selector; assignment writes only after confirmation through
  `SeasonStore.assignScoutParent()` (per-season queue, revision fence, live
  object updated). Rows are keyed with id-scoped selection and an in-flight lock.
- A valid parent is a real program season (`isProgramSeasonRecord()`): not a
  scout, not the sample, not blank. The sample establishes no parent and cannot
  own a scout.
- The active team bounds both sides; a program season that owns scouts cannot
  be deleted.
- Workspace selection fails closed: if the current season cannot save or the
  destination cannot load, restore the prior mode, season and pressed state.

## Composition

- The approved comp governs first launch, the library/no-open-season state and a
  populated season. The rail has two permanent panes, Program Seasons and
  Opponent Scouts, each its own bounded scroller inside the route frame.
- Program Seasons owns the rail's flexible height (120px floor); Opponent Scouts
  is content-sized under a 34% cap (46% on short viewports). Sections carry
  `min-width:0` and `min-height:0`; containment is checked on both axes.
- The active year is a heading with no caret; inactive years are focusable
  disclosures with `aria-expanded` and `aria-controls`, and a collapsed year
  renders no body. `yearGroupKey()` is the one grouping key (`Undated` included).
  Collapse state is controller state keyed by team, section and year; the
  current row scrolls into view on render and resize.
- Games are ordered oldest first by date, week as a same-date tiebreaker.
  `data-season-id` is the rail row hook. The game grid uses 230-280px tracks.
- Empty Opponent Scout keeps the summary band, a real table structure and
  exactly one visible create action.
- Every Home control meets the 30px desktop target through padding pulled back
  out of its row; no type or control shrinks.
- One opponent identity per component: `matchupSchoolLine` returns a line only
  when the title does not already contain the name.
- Space and Enter belong to a focused control: the global shortcut handler
  yields them to buttons, links, `role="button"` and editable content. Test with
  real key presses.

## Film health

- Season-scoped: `WorkspaceContext.filmHealth(game, seasonId)` →
  `StorageBackend.listFilmFiles(gameId, seasonId)`; every result names its
  season; `TeamHubScreen._aggregateFilm(games, seasonId)` is the one aggregate.
- The aggregate is always an explicit count (`6 of 6 games linked`,
  `No film linked`, `No games yet`); only a genuinely in-flight check is
  `checking`, keyed by season and game (`WorkspaceContext.operationKey`).
- `Film needs attention` is reserved for film that cannot be counted.
