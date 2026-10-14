# Receiver Charting Comp

2026-10-13, revised 2026-10-14. **PROPOSED: awaiting coach design approval.** Production is not
built. This folder is a standalone interactive comp, not an application route.

Authority: `docs/RECEIVER-CHARTING-RESEARCH-PROPOSAL.md` > Decisions
(coach, 2026-10-13), which overrides that document's earlier alternatives.
No drawing, Vertical release, technique or exact-point location is included.

## Review States

Open `index.html` locally; these fragments select repeatable states:

| Fragment | Review |
|---|---|
| `#closed` | Receiver-adjacent collapsed summary: Slant / Inside |
| `#route` | Checkpoint 1, all 15 route choices and Inside / Outside |
| `#target` | Checkpoint 2, Target selected on the nine-zone field |
| `#catch` | Checkpoint 2, Catch selected independently, in another zone |
| `#multiple` | Receiver has 22 and 7; choose one before detail is offered |
| `#incomplete` | Actual target arrival charted; Catch disabled, no completion |
| `#stress` | Long receiver name with checkpoint 2 open |

The route and release chips toggle to blank on a second selection. Target
and Catch have independent selections and a clear command. Edit library
demonstrates show/hide and adding a coach-named route, entirely in memory.
The field changes no gain, result, direction or receiver alignment. Selecting
one target in the multiple-number state starts with no receiver detail.
Save & Next stays available for the rest of the play while receiver detail
waits for one target. The Release explanation button is removed. Each depth
row is labeled once on the left; individual zone cells have accessible names
but do not repeat the visible depth or yard range.

## Composition

- Under the existing Receiver row in Players & Grades, not a new top-level
  section or an action at the top of the screen. The disclosure stays local.
- Closed: route/release summary. With checkpoint 2 present, closing also shows
  charted location summaries. Open: location values live in their own tabs;
  they do not repeat in the disclosure's heading.
- Checkpoint 1 has no empty future location tabs. Checkpoint 2 is labeled as
  such in the comp; that annotation is not a proposed permanent product label.
- Desktop keeps a 400px deck and the existing two-column/filmstrip budget
  at 1440. Only the deck scrolls for the receiver editor; the theater does
  not resize between states. Context chrome is representative, not a new
  shell proposal. Existing unrelated Chart groups are shown collapsed so the
  review focuses on the new editor; their production defaults do not change.
- Narrow: existing stacked film/rail/deck composition. The film is a fixed
  460px theater area, before the deck. Scrolling to the editor does not move
  it into an overlay, hide it conditionally or resize it.
- One 12px deck inset. No nested left padding in the receiver editor. Desktop
  standard chips are 27px with 12px IBM Plex Sans. Coarse targets are at least
  44px wide and tall; routes wrap, never shrink their type. Unusually long
  custom route labels may grow vertically rather than clip.
- Neutral selected route/release chips; existing gold is reserved for the
  Offense switch, route underline and Save & Next. The field uses subdued
  turf and a cyan selection edge. A Target selection has a round marker;
  Catch has a square marker, so color is not the only distinction.
- Library preview also expands inside the deck. It never covers the film.
  There is no route path tool, drag handle or inferred route geometry.

## Zone Semantics To Approve

Columns are offense-view Left / Middle / Right. Rows run Deep at the top,
then Medium, then Short. These are categorical bands, not a yard-scaled
field or exact plotted points. Equal cell widths serve readable tap targets;
they do not represent measured field proportions. The coach settled lateral
semantics: Middle is between the hashes, Left is outside the left hash and
Right is outside the right hash, from the offense's view. Existing Pass
Left/Right remains independent and does not fill Target or Catch.

Proposed depth bands, awaiting confirmation:

| Zone | Depth relative to LOS |
|---|---|
| Short | Every point behind LOS, at LOS and through 9 yards |
| Medium | 10-19 yards |
| Deep | 20+ yards |

Target means where the ball actually arrived, not an inferred intended route
endpoint. Catch is where this identified receiver secured a completed pass,
not the end of the run. Neither changes total gain. Unknown stays blank.
Release remains the coach's Inside/Outside judgment against the hashes;
choosing a location never supplies it.

## Data and Interaction Limits

Player names, jersey assignments, counts, play situation and route/location
values are **representative preview data**, not validated charting of the
pictured play. The film still is media pixels cropped from the already
committed `breakdown-cleanup-2026-10-05/proposed-1440x900.png`; its source is
not this fictional pass. No live film or season file was opened to make it.

The comp has no storage calls, app imports or production event handlers.
Save & Next / Skip / Previous do not navigate or persist. No installed app
profile, catalog, Documents mirror or coach data is read or written.

Production receiver changes must follow the Save contract's confirmed removal
and cancellation rules. The comp's editable number box is a state preview,
not a proposed replacement for that owner logic. Multiple identities block
new receiver detail only, never the play's Save. Unrelated existing charting must not
be rewritten just to select the target in the production implementation.

Tab and Enter/Space operate the buttons; browser focus remains visible.
There are no new global shortcuts. The eventual shared library owner and
any destructive confirmation remain production owners, not comp handlers.

## Render Verification

Run `node design-comps/receiver-charting-2026-10-13/capture.mjs` from the repo.
It launches an isolated Puppeteer browser and writes only this folder's
film still, screenshots and `CHECKS.json`. It is not a gate harness.

Captures at 1440x900 and 390x844 cover closed, route, Target, Catch, multiple,
incomplete and long-name states. Mobile has full-page context and separate
844px-tall editor views. A custom long route is also captured at both sizes.
Desktop checkpoint 2 captures scroll only the deck so all nine zones are in
view; they do not move the film. Screenshots were visually inspected.

Checks cover all 15 routes selected individually, painted route text bounds,
27px fine / 44px coarse controls, page overflow, loaded media, independent
Target/Catch, unchanged gain, unresolved identity, disabled incomplete Catch,
long custom labels, inline library containment and unchanged film bounds in
every state. `CHECKS.json` contains the comp-only result. None of these checks
constitutes coach approval or an installed WebView2 smoke.

## Coach Questions

1. Confirm **Short through 9 / Medium 10-19 / Deep 20+**, including behind LOS
   in Short, or give different boundaries.
2. Approve this receiver-adjacent disclosure, route ordering, and separate
   Target/Catch tabs? The mobile size is an ergonomics check, not mobile
   product authorization.

All other scope decisions are already settled and are not reopened here.

## Build Order After Approval

1. Route and Inside/Outside release, bound to one existing offensive Receiver,
   coach-managed route vocabulary through `TagLibrary.DEFINITIONS`, correct
   draft/Save/settle behavior, and sampled film-linked Study dimensions.
2. Nine-zone Target and Catch on the same visual, independent data with their
   own sampled film-linked Study dimensions. Catch only on a completion.
3. Receiver Reports wait for roadmap step 5. No Reports work here.

Production files, approval registry, coach data, gate, installer, push and
tag were not changed by this design checkpoint.
