# Break Down populated layout - review comp

Status: **PROPOSED, not coach-approved.** This supplements, but does not
replace, the approved `design-comps/breakdown-charting-2026-09-27/` field comp.
The original comp settled new field meanings and inline placement; this one
tests the full library at the real desktop deck width (BD-UX-1) and the closed
and open context selectors (BD-UX-2). No production behavior, data migration,
manifest status, or installed acceptance is changed.

## Review states

- `#library`: a historical play with its exact recorded `Trips` Formation.
  The current 18-choice Formation library is fully available, and Saved Calls,
  Backfield, Personnel, and Play Type collapse independently. A selected value
  remains visible while its library is collapsed. Motion and its path remain
  reachable farther down the deck.
- `#formation`, `#gap`, `#motion`, `#rpo`, `#qb`: the previously approved field
  proposal in the same workspace, with its direct chip-to-detail interaction.
- `#gap` and `#qb` now place the Gap control immediately below Play Direction.
  Clicking a direction reveals eight explicit Left/Right A-D gap choices in
  one desktop row, plus Center and Other lane below. There is no separate Gap
  side control. Selecting a sided gap keeps Play Direction on that side;
  choosing another direction clears a conflicting gap instead of guessing.
  Center selects Middle direction.
- `#reverse` proposes Reverse as a Play Type. Its example travels Left and
  hits Left C. Reverse stays a run and retains the normal result, yardage,
  and ball-carrier controls.
- Click Program, Season, or Game in the top row to see one shared menu pattern.
  Season retains the three example seasons, counts, Season Library and New
  season. The labels and counts are illustrative, not live-catalog evidence.

## Decisions to review

The desktop deck remains 468px wide at 1920 and 1440. Chips retain 12px text
and the approved 27px desktop height. Field labels and their independent
actions share a consistent header rhythm. The full Formation catalog uses
four stable columns; collapsed libraries keep their selected values visible
and reduce the scroll before Motion without deleting or silently hiding any
choice. Historical Formation is shown as recorded; the comp does not infer a
new Family or Receiver Set from `Trips`. The separate new-field review state
still governs explicit retagging.

The three closed context controls show a label, full-value area, and disclosure
arrow. Their menus share typography, item spacing, selected-state treatment,
focus, and Escape behavior. Production must continue using TeamRegistry,
SeasonStore, and game switch actions; this static comp only proposes their
presentation. It must not be interpreted as permission to change a program,
season, game, or coach data while reviewing the design.

No explanatory prose or `optional` subtext is added to the on-screen deck.
The nested Gap interaction and Reverse Play Type are new review proposals,
not changes to the approved production build contract in the plan. The coach
must approve them before that contract or data schema is revised.

## Review evidence

Captured `#library` at 1920x1080, 1440x900, 1280x800 and 390x844;
`#formation` at 1440x900; collapsed library at 1440x900 and 390x844; and
the three desktop context menus plus the narrow Season menu. At 1920, 1440
and 1280 the deck measures 468px. The full Formation library has 18 choices,
Backfield 9, Personnel 16, and Saved Calls 4. The document has no horizontal
overflow and the film asset loads at each width. Script errors: zero. Each
library opens independently, and collapsing Formation leaves its recorded
`Trips` value visible. The mobile sticky bar remains reachable without
intercepting a scrolled-into-view library action.
