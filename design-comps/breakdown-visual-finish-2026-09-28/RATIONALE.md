# Break Down populated layout - review comp

## Receiver look, 2026-09-29

The coach requested distinct Twins, Trips, Bunch and Tight Bunch selections
with Left/Right immediately underneath, replacing the proposed modifier chain.
That initial proposal is superseded: Receiver Alignment records left x right,
and the redundant Receiver Strength and Line Balance fields are removed. The comp
shows Tight Bunch, 3x1, and Unbalanced Left as an illustrative selection.
The existing 27px chips, text size and local field flow remain the composition
reference. Cyan around the formation block is the comp's review highlight,
not a production surface requirement. App and comp captures were inspected at
1920, 1440, 1280 and 390; the canonical fixture stayed byte-identical. New
receiver selections in the captures are examples, not coach data or mapping
approval. Source status is IMPLEMENTED_UNVERIFIED pending installed smoke;
this supplemental comp does not change the approval registry.

Status: **supplemental review comp, not blanket `COMP_APPROVED`.** The coach
reviewed the nested, single-row Gap control and asked for Reverse as a Play
Type on 2026-09-28. The full-library (BD-UX-1) and context-selector (BD-UX-2)
states remain proposals until production is verified. This supplements, but
does not replace, the registered
`design-comps/breakdown-charting-2026-09-27/` field comp. No production
behavior, coach data, manifest status, or installed acceptance is changed.

## Review states

- `#library`: a historical play with its exact recorded `Trips` Formation.
  The current 18-choice Formation library is fully available, and Saved Calls,
  Backfield, Personnel, and Play Type collapse independently. A selected value
  remains visible while its library is collapsed. Motion and its path remain
  reachable farther down the deck.
- `#formation`, `#gap`, `#motion`, `#rpo`, `#qb`: the previously approved field
  proposal in the same workspace, with its direct chip-to-detail interaction.
- `#gap` and `#qb` now place the Gap control immediately below Play Direction.
  Clicking a direction reveals ten choices in one desktop row: L-A through
  L-D, R-A through R-D, Center, and Other. There is no separate Gap
  side control. Selecting a sided gap keeps Play Direction on that side;
  choosing another direction clears a conflicting gap instead of guessing.
  Center selects Middle direction. The four L chips use less horizontal space
  so Center has comfortable padding without reducing text size or wrapping.
- `#reverse` proposes Reverse as a Play Type. Its example travels Left and
  hits L-C. Reverse stays a run and retains the normal result, yardage,
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
choice. Historical Formation is shown as recorded in this pre-cutover review
state; the comp does not infer a new Family or Receiver Set from `Trips`.
Before a production cutover, every stored value must be explicitly mapped or
retagged under the one-time migration contract. This screen is not permission
to ship a permanent old-Formation editor or reader.

The three closed context controls show a label, full-value area, and disclosure
arrow. Their menus share typography, item spacing, selected-state treatment,
focus, and Escape behavior. Production must continue using TeamRegistry,
SeasonStore, and game switch actions; this static comp only proposes their
presentation. It must not be interpreted as permission to change a program,
season, game, or coach data while reviewing the design.

No explanatory prose or `optional` subtext is added to the on-screen deck.
The coach's later Gap and Reverse decisions are recorded in the current build
contract in `GRIDIRON-IQ-PLAN-V2.md`; the registered canonical artifact remains
the earlier comp. Formation uses the existing coach-managed library
workflow, extended to its own field: add, show/hide, reorder, and remove a
custom choice without shrinking this deck or silently changing stored plays.
Power-I and Split Back must be available. Historical mixed Formation values
are not inferred into Family or Receiver Set. The coach requires a one-time,
verified cutover with no old-format reader or dual-write path left in the app;
that migration needs a separate impact report and live-write confirmation.

## Review evidence

2026-09-29 coach correction: follow the Hudl Formation / Backfield / separate
strength model. Formation accepts coach-named Trips, Twins, Bunch and Tight
Bunch; the earlier Family/Receiver Look split is superseded. QB Alignment stays
separate. Personnel follows Formation before QB Alignment. Offensive Line
Strength offers Left, Right, Balanced, Unbalanced Left and Unbalanced Right.
Receiver Alignment records left x right, totals 1-5 in numeric order, without
0x0. Receiver Strength and Line Balance are removed.
Changing Formation clears no strength. The supplemental comp and source now
show this model using the existing 27px chips and readable type. No registry
approval, live conversion or installed acceptance is implied. Hudl reference:
https://www.hudl.com/blog/tips-from-an-assist-expert-formation-backfield

2026-09-29 full-screen review: the coach prefers Formation & Call across the
deck, film strip and play sheet. Production disclosure arrows occupy the group
gutter so collapsible and plain labels align. Canonical-data source captures
at 1920 and 1280 were inspected; chip height and typography are unchanged.

The capture record below is historical, from before the Formation correction.

Captured `#library` at 1920x1080, 1440x900, 1280x800 and 390x844;
`#formation` at 1440x900; collapsed library at 1440x900 and 390x844; and
the three desktop context menus plus the narrow Season menu. At 1920, 1440
and 1280 the deck measures 468px. The full Formation library has 18 choices,
Backfield 9, Personnel 16, and Saved Calls 4. The document has no horizontal
overflow and the film asset loads at each width. Script errors: zero. Each
library opens independently, and collapsing Formation leaves its recorded
`Trips` value visible. The mobile sticky bar remains reachable without
intercepting a scrolled-into-view library action.
