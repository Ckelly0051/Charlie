# Receiver Charting: Research and Proposal

**2026-10-13, clarified and comp approved 2026-10-14. Checkpoint 1 is built
in source, awaiting release verification; checkpoint 2 is not built.** See
`design-comps/receiver-charting-2026-10-13/RATIONALE.md`.
Current route/release storage and behavior live in `GRIDIRON-IQ-TAG-MODEL.md`
section "Receiver Route and Release". The historical proposal below is not a
production schema.

## Decisions (coach, 2026-10-13; clarified 2026-10-14)

These override anything below that differs. The research and the rest of the
contract stand.

1. **Scope:** the identified target only (the offensive Receiver role, one
   jersey number). All-receiver charting is not planned. Multiple numbers
   defer receiver details only; Save & Next still saves the rest of the play.
2. **Release:** `Inside` or `Outside` only, judged against the hash:
   Inside is a release toward the hashes (the middle of the field), Outside
   toward the sideline. No `Vertical` value and no release technique. Leave
   blank when the release cannot be judged.
3. **Route names:** the proposed list as written: Flat, Slant, Hitch, Out,
   In, Cross, Comeback, Corner, Post, Go, Wheel, Angle, Screen, Option,
   Double Move; coach-editable through `TagLibrary.DEFINITIONS`.
4. **Route paths:** tabled. No path drawing, no `path`/`pathComplete`
   members in this work.
5. **Target and catch location:** nine zones, Left / Middle / Right by
   Short / Medium / Deep, from the offense's view. No exact-point mode and no
   other depth bands. The yard boundaries for Short / Medium / Deep (proposed:
   Short behind the line through 9 yards, Medium 10-19, Deep 20+) are
   confirmed with the coach in the comp. Target is where the ball actually
   arrived; Catch is recorded only on a completion; neither changes total
   gain. Middle is between the hashes; Left and Right are outside the
   corresponding hash, from the offense's view. Pass Left/Right stays
   independent and never supplies Target or Catch automatically.
6. **Placement:** inline in the deck under the Receiver row, never over the
   film. No Release explanation button. Label each location depth row once
   on the side, not again in every selectable zone.

**Order:** a rendered comp of the deck editor at desktop and narrow widths
for the coach's approval, then build checkpoint 1 (route and release, with
their Study dimensions), then checkpoint 2 (target and catch zones on the
same field graphic, with their Study dimensions). Reports wait for plan
step 5.

For `GRIDIRON-IQ-PLAN-V2.md` step 2. Route and release first; design pass
target and catch location alongside them. Chart and film-linked Study ship
together. Reports belong to step 5, not this job.

## Recommendation

Start with **the identified target**, using the existing offensive Receiver
role. Offer a visual route picker and release chips beside that receiver, with
an expandable field **inside the deck**, never over the film. Drawing an
observed path is additional detail, not the price of charting a route name.

Use the same field later for independent Target and Catch marks. Support
coarse zones without pretending they are exact coordinates. Do not infer any
of these fields from Play Direction, Formation, Receiver Alignment or gain.

This is a recommendation for approval, not a claim that competitors share
this exact design. Public evidence supports customizable breakdown, spatial
charts and all-receiver professional datasets; it does not establish a
universal receiver-charting interface or a universal numbered route tree.

## Research Findings

Public primary sources checked 2026-10-13. Older articles establish documented
capabilities at publication, not an inspection of today's installed product.
No paid account or private analyst interface was inspected. Absence from a
public field list is **not proof a product cannot support a custom field**.

### Hudl and Assist

- Hudl's formation-report guide documents a manually charted **Pass Zone**:
  nine zones grouped into short, medium and long throws, with zone percentages
  and video-linked report values. It lists formation, backfield and strength
  separately. It does not establish separate target/catch coordinates, a
  release taxonomy or all-receiver routes. This guide is from 2017, so its
  specific current input UI is unverified.
  [Hudl formation report](https://www.hudl.com/blog/how-to-get-more-from-your-formation-report).
- Assist's published football breakdown columns include formation/backfield/
  strength, motion, play direction and results. Route, release and separate
  target/catch location are not listed there. Assist+ adds offensive skill
  player data for players touching the ball; that is not evidence of charting
  every eligible receiver's route.
  [Assist football](https://hudl-www.hudl.com/products/assist/football),
  [Assist FAQ](https://www.hudl.com/products/assist/faq).
- **Entry and speed:** column tagging is documented for Pass Zone; the exact
  modern picker, field-tap workflow and seconds per play are unverified.
  Assist is analyst delivery, not a measured coach-entry workflow.
- **Reporting:** verified zone tendencies and film links, not a verified
  Assist receiver-release or route-tree report. Keep that distinction.

### Hudl IQ: A Separate Professional Data Product

Hudl describes hybrid computer/human tracking of all 22 players, initial
alignment and movement paths, event collection and model-derived receiver
routes. Its passing chart can filter by passer/receiver and show heatmaps.
Its named **pass location** is ball position relative to a receiver's center
mass at the catch attempt: that is throw placement, not our proposed
field-side/depth field. Collector UI, release vocabulary and per-play entry
time are not disclosed. The article estimates about 60 work-hours per game,
parallelized into 16 elapsed hours; this is not a solo-coach timing benchmark.
[Hudl IQ data creation, 2024](https://www.hudl.com/blog/how-hudl-iq-creates-football-data).

### Hudl Sportscode

Sportscode supports customizable code/label buttons, labeling timeline
instances and output reports. Therefore a staff can define receiver/route/
release labels, but that is a customizable workflow, not a verified built-in
American-football route ontology. A **labels tree** organizes labels; it is
not itself a football route tree.
[Code window modes](https://support.hudl.com/s/article/code-window-modes-sportscode?language=en_US),
[Sportscode comparison](https://www.hudl.com/products/sportscode/tiers),
[historical labels-tree manual](https://static.hudl.com/craft/SportsCodeManual-2.pdf).

Hudl documents manual location tagging, field/court heatmaps, multi-game
density views and chart values linked to video. This supports borrowing the
spatial-analysis idea. It does not verify a default football release picker,
target-only versus all-receiver policy, exact route drawing input or separate
catch-location entry. Per-play timing is unverified; custom button design
determines the number of actions.
[Sportscode heatmaps, 2022](https://www.hudl.com/blog/heatmaps-enhance-reporting-in-hudl-sportscode).

### QwikCut

QwikCut documents cell-by-cell entry with dropdown options after entering
edit mode. Its published advanced 44-column preset includes Receiver Jersey,
pass thrown/completion/dropped and play direction, but no route, release,
route depth or separate target/catch coordinates. Custom columns are
supported. Exact route terminology, all-receiver attribution and receiver
spray/route reports could not be verified.
[Advanced entry](https://support.qwikcut.com/portal/en/kb/articles/football-stat-entry-advanced-22-7-2023),
[Advanced breakdown](https://www.qwikcut.com/lp/footballstats/).

Preset routes exist in its **Playbook Manager**, and custom reports and
exports are advertised. Playbook drawing is not evidence that drawing a
route on film creates a charted receiver event. No public measured entry
time was found; outsourced turnaround is not seconds per play.
[QwikCut football](https://qwikcut.com/football/).

### XOS / Catapult Thunder

Thunder's field administration supports free text, open lists and fixed
lists. PlayTools diagrams share field values with breakdown data and
GameAnalysis reports. These are verified customizable data/diagram paths,
not proof that a drawn route is automatically captured as receiver charting.
No public default route/release list, break-depth schema, target/catch input
or all-receiver policy was verified.
[Thunder fields](https://thunder.catapultsports.com/hc/en-us/articles/7397882951823-How-To-Create-Fields-Within-Thunder),
[PlayTools metadata](https://thunder.catapultsports.com/hc/en-us/articles/4406815181839-Assigning-Data-to-PlayTools-Diagrams).

Catapult's Hub Pro documentation verifies double-click cell editing,
Tab/Shift+Tab column navigation, Enter row navigation, filters and CSV export.
That is adjacent current workflow evidence, not an inspected Thunder
receiver-charting screen. Route trees, spray charts, release reports and
seconds per play remain unverified. Thunder's 2026 x64 release excludes editor
workflows, so edition matters when comparing it with its data-entry product.
[Hub Pro](https://thunder.catapultsports.com/hc/en-us/articles/15974632049167-Hub-Pro-Overview),
[Thunder x64 release](https://thunder.catapultsports.com/hc/en-us/articles/17313436502799-Thunder-25-64-0-26-Release-Notes).

### PFF

PFF documents **every eligible receiver's route**, not only the target:
route type/depth, horizontal pre-snap alignment, motion, chips and play-action
involvement. Its route breakdown distinguishes inside/outside releases and
route variants. Reports include route families, targets and production;
route heatmaps examine depth and alignment.
[Route detail and release, 2015](https://www.pff.com/news/route-breakdown-post-routes),
[Route heatmaps, 2019](https://www.pff.com/news/pro-pff-data-study-examining-the-passing-game-with-route-heat-maps).

PFF's published data dictionary includes vertical/horizontal target location,
targeted receiver/alignment and air/YAC data; its NFL detail includes all
routes, double moves and chip/check routes. This is a useful schema reference,
not proof of a coach-facing tap interface or a distinct catch-coordinate
field. Internal input controls and seconds per play are unverified.
[PFF data fields, historical PDF](https://media.profootballfocus.com/2018/08/PFF-Play-Data-Fields.pdf).

### NFL Next Gen Stats and Public Charts

NGS uses tracking, not coach taps: player location is sampled ten times per
second, with route detection among derived classifications.
[NFL tracking](https://operations.nfl.com/gameday/technology/nfl-next-gen-stats).
Its model covers every eligible receiver; route families differ by alignment.
[Route recognition](https://www.nfl.com/news/next-gen-stats-intro-to-new-route-recognition-model).
Public examples show pass and receiver route charts.
[NFL chart gallery](https://www.nfl.com/photos/next-gen-stats-week-16-qb-and-receiver-charts-0ap3000000764587).

The underlying all-player dataset must not be confused with the sample in a
public chart. The gallery does not establish that every non-targeted route
is shown. Release-technique categories, manual entry workflow and per-play
human timing were not verified. Tracking provides shape and coordinates;
GridIron IQ manual marks must not claim equivalent precision or automation.

### What To Borrow, and What Not To Claim

Borrow configurable vocabulary, local fast entry, a spatial view and exact
film links. Borrow PFF's separation of route, release and alignment, not its
all-receiver collection workload. Borrow NGS's readable field presentation,
not its automated tracking claims. No vendor supplies a verified comparable
manual seconds-per-play benchmark in the sources above.

## Proposed Data Contract

### Scope and Ownership

One detail record per play for **one identified target**, including a running
back or tight end: Receiver is a role, not a roster position. Unsuccessful
passes can have an identified target. Throwaways/unclear targets stay blank.
All-receiver charting would require a separate participation model, repeated
identity selection and visibility of receivers often outside the camera;
defer it. Target-only data cannot produce routes-run share, target rate per
route run or yards per route run. It can produce **targets by charted route**.

Proposed `play.receiverDetail` object, absent when empty. A small receiver
detail model owns normalization, visibility, identity binding and registry
reads; PlayTagger owns draft writes. Do not duplicate these values in tags,
diagram annotations or result fields.

| Member | Meaning / initial vocabulary | Delivery |
|---|---|---|
| `receiverNumber` | Binding to the one jersey number in `tags.players.receiver`; no second player picker or name copy | Route/release |
| `route` | Flat, Slant, Hitch, Out, In, Cross, Comeback, Corner, Post, Go, Wheel, Angle, Screen, Option, Double Move; custom coach names allowed | Route/release |
| `releaseDirection` | Inside, Outside, Vertical; initial committed release relative to field center, not first foot movement | Route/release |
| `releaseTechnique` | Speed, Footwork, Hand Combat, Chip, Delayed; one coach-named dominant technique; leave blank if unclear | Approval question; default collapsed |
| `path` | Coach-marked ordered points from alignment through the observed route, stopping at catch/arrival or last visible pre-arrival point; never includes YAC | Route/release, detail mode |
| `pathComplete` | Explicit boolean: complete observed pre-arrival path or partial; missing is uncharted, not false | With path |
| `target` | Independently marked target arrival/attempt location, including an incomplete/intercepted attempt if visible | Later location checkpoint |
| `catch` | Independently marked possession secured by this receiver; absent on an incomplete or interception | Later location checkpoint |

`TagLibrary.DEFINITIONS` owns the defaults for `receiverRoute`,
`receiverReleaseDirection` and `receiverReleaseTechnique`; field IDs map to
the object members above. Every picker and consumer reads that owner. These
are single-value fields, not `MULTI_TAGS`. No universal 0-9 numbering: custom
names survive in data and Study even when hidden from the library. A custom
route has no invented shape. Inside/outside is ambiguous for a receiver
starting at field center; use Vertical only when observed, otherwise blank.

Technique and direction answer separate questions; neither sets the other.
The proposed technique vocabulary is not a verified PFF/Hudl standard and
needs the coach's decision before implementation.

### Shared Spatial Format

- View from the offense, always attacking up. Left/right never follows camera
  orientation and is never borrowed from Play Direction or receiver counts.
- Detailed points: `{ x, depth }`, x from left sideline 0 to right sideline 1,
  depth signed yards relative to LOS. Zero is a real LOS coordinate; missing
  is absent. No decimal precision implied: initial controls snap to one yard.
- `target`/`catch` use a discriminated shape: either
  `{ precision: 'zone', side, depthBand }` or
  `{ precision: 'point', x, depth }`, never both. Coarse mode stores no fake
  center point. Detailed geometry stores no redundant manually editable zone.
- Initial zone choices: equal-width Left/Middle/Right thirds; Behind LOS,
  At LOS, 1-5, 6-10, 11-20, 21+ yards. Point bucketing uses the same explicit
  boundaries. These are proposed analytical bands, not Hudl zone numbers.
- Zones cover the full field width. Detailed mode supports negative depth and
  deep routes through a view-range control; viewport edges never clamp stored
  coordinates. Do not use a 21+ zone's center to calculate average depth.
- No hashes or boundary/field labels until a field ruleset and ball position
  can establish them. A neutral LOS-relative visual needs neither migration
  nor guessed high-school/college hash geometry.
- A target means observed ball arrival/attempt position, not inferred intended
  play design. Uncatchable/out-of-bounds balls may have no usable field mark;
  do not force an in-bounds position. An interception has no receiver Catch.
- Catch location is not the tackle spot. Total gain remains unchanged.
  Route depth, target depth and catch depth are different quantities. No YAC
  calculation in this checkpoint; penalty/spot/measurement rules need their
  own reviewed metric before subtracting catch depth from total gain.

### Blank, Save and Changes of Identity

All detail is optional. No record is created by opening the editor, choosing
a receiver, replaying film or rendering a route icon. Blank yields no Study
value, never zero or an invented Unknown route. An empty path is absent.

Bind only when the existing Receiver role resolves to one jersey number.
The current role setter accepts a string and the registry can split multiple
numbers; do not assume the existing role is enforced single-player. If it
contains multiple/invalid numbers, leave that attribution untouched and ask
for one target before creating detail. Manual numbers need not be on a roster.

Changing/removing the receiver with filled detail asks before clearing that
detail; Cancel keeps both. Changing a parent to a shape that cannot show it
uses the same confirmed removal contract. No automatic reassignment to a new
receiver. Apply this at the owner for Chart, Film Room and other writes, not
only in the view. Import with mismatched binding is refused plainly, never
silently attributed to another player.

Chart edits only the current draft. Save & Next commits the record with the
play in one undoable save; navigation uses Stay / Discard / Save. Collapsing
the editor keeps its summary visible and never clears data. Copy Previous,
templates and Carry Scheme never copy receiver detail.

Eligibility for Chart: a shape that holds the offensive Receiver role and
charted Run/Pass = Pass. Run/pass and Fake tries may chart it like their other
details, but remain excluded from analytics. Ordinary kicking units and the
current defense-side model do not gain a new opponent receiver role in this
job. Selecting Run with filled detail must confirm removal, not silently hide
and delete it. A saved unusable/malformed record is surfaced as a validation
problem, never repaired on open. Historical missing records are valid.

Implementation must explicitly extend `PlayShape.hidden/settle` for this
structured object: the current generic tag loop skips objects and cannot
enforce this contract by itself. Draft cloning, recovery, Undo, season export,
save/reopen and format validation must preserve and validate the new record.
No compatibility reader or coach-data migration is proposed.

## Chart Interaction and Low-Fidelity Mock

Place the disclosure directly **under the Receiver row in Players & Grades**.
The selected receiver's roster remains there; selecting details never sends
the mouse to the page top. Closed summary: receiver, route and release values.
Open surface stays in the deck's normal flow, with one 12px inset. It does not
float, move video, or alter the mounted video element. On narrow layouts use
the deck's existing below-film reflow; never a sheet covering live film.

```text
FILM (unchanged) | PLAY STRIP | CHART DECK
                              Players & Grades
                              Receiver  [22]  [Grade]
                              > Route & Release   Slant / Inside
                              [route picker: small diagrams + names]
                              Release [Inside] [Outside] [Vertical]
                              > Technique
                              [Route] [Target*] [Catch*]  [mark-path icon]
                              +-----------------------------+
                              |            attacking up     |
                              |  left     middle     right  |
                              |           route line        |
                              |------------------------- LOS|
                              |       receiver start o      |
                              +-----------------------------+
                              [undo mark] [clear marks]
                              ... existing Save & Next ...
```

`*` denotes later delivery in this document only; do not ship disabled future
tabs. No explainer prose, "optional" sublabels or keyboard hints in ordinary
deck copy. Tooltips name icon commands. Route picker diagrams are **schematic
choices**, never saved evidence; only an explicitly marked path enters data.
Selecting Slant does not manufacture a start, break point or target.

Action budget (design estimates, not measured timings; excludes film replay
and existing player selection):

| Task | Actions |
|---|---|
| Open, pick route, pick release | 3 clicks/taps; 2 when already open |
| Add technique | 2 more: disclose and select |
| Add observed one-break path | Mark tool + start/break/end + finish: 5 more |
| Later coarse Target then Catch | Target tab + cell, Catch tab + cell: 4 more |

Don't auto-open Catch, reuse Target as Catch or infer release from the path.
Reuse the field's view range as UI preference only, not football data. Draw
with discrete points rather than requiring accurate dragging; each point
can be adjusted by numeric x/depth controls. Paths allow multiple breaks and
partial visibility. Finish accepts a partial path only after explicit choice.

Keyboard: Tab reaches disclosure; Enter/Space opens it. Arrow keys navigate
the route/zone choices, Enter selects; Tab moves to release. Numeric
coordinate controls provide an equivalent to pointer drawing, with an Add
point command. Escape cancels a pending point operation, not the entire
play draft. Scope these keys to the editor; do not steal film transport or
global shortcuts. Save remains the existing command. No new global hotkeys
until checked against the current shortcut map.

Fine pointer: existing 27px Chart chips with unchanged 12px type; reflow,
no shrunk font. Coarse pointer: controls and zone cells at least 44px in both
dimensions; selectable point handles also have 44px hit regions. Field width
fits the deck, its height follows a stable aspect ratio/range, never content.
Keyboard path and numeric controls avoid reliance on color or tiny dots.
Confirmations use the shared overlay service, Cancel focused; no second
overlay owner or separate editor Save that bypasses the play draft.

## Study Now; Reports Later

Register single-value dimensions: Receiver Route, Release Direction and
Release Technique. They read only saved, identity-matched detail on eligible
pass attempts with the identified receiver. Exclude sacks, runs, throwaways
without a target, all tries and penalty-nullified/unresolved plays using the
existing canonical attempt/penalty owners. Kick Fakes follow the existing
eligible offensive-role rule, not a newly invented cohort.

Each field has its own sample. A route does not require a release or path.
Show total eligible targets, charted for the selected axis, and omitted;
cross-tabs require both axes. Film rows use exact `gameId::playId`, not bare
play numbers. Example: Receiver x Route, targets and completions with the
existing registry measures. No zero completion rate when result sample is
missing. No route-run measures from this target-only sample. Coach-hidden
library values remain selectable as historical Study values.

At the location checkpoint, register Target Side/Depth and Catch Side/Depth
dimensions from the same canonical point/zone reader, plus composite zone
dimensions if needed for the visual. Do not average coarse zones. Catch
samples require both a charted catch and a canonical completion; Target
samples include identified incomplete/intercepted attempts. Custom Study
filters and saved queries need the same IDs, not a parallel raw-tag path.

Step 5 report sketches (not implementation or layout approval):

- **Receiver route summary:** schematic route silhouettes with counts of
  charted targets, completions and approved existing production measures;
  route/release cross-tab beside it. Label sample as targets, not all routes.
- **Observed paths:** LOS-normalized marked paths, faceted by receiver/route;
  dashed partial paths, no mirrored left/right data. No fabricated lines from
  route-name-only records; show their separate unlocated count.
- **Target/Catch:** paired field views, same scale and filters; zone heatmap
  for coarse marks, scatter for explicit points. Distinct outcome symbols,
  sample per layer, never plot zone centers as observed dots.
- Selecting a route, zone or point opens exactly its qualifying film; small
  samples remain visible. No new EPA, catch probability, separation or YAC
  engine is hidden in this work.

## Approval Questions

Answered; see Decisions at the top.

## Build Acceptance After Approval

Before implementation, the coach approves a rendered comp
at desktop/narrow widths. Then make Chart + registry one bounded checkpoint;
location charting follows on the shared visual. No Reports work until step 5.

Focused regression obligations: draft versus saved data; receiver change
Cancel/confirm; parent changes and settle; one Undo; blank versus real zero;
custom/hidden vocabulary; multiple receiver attribution; try/penalty/sack
exclusions; exact film membership; partial paths; independent Target/Catch/
Direction/gain; point versus zone samples; season round-trip and recovery.
Visual checks must establish unchanged film rectangle/node, 27px fine chips,
44px coarse targets, keyboard equivalence and deck reflow. No full-gate or
installer authority is granted by this proposal.

## Local Contracts Consulted

`CLAUDE.md` (binding data and Break Down rules), `GRIDIRON-IQ-PLAN-V2.md`
step 2, `GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-SAVE-CONTRACT.md`,
`GRIDIRON-IQ-OVERLAY-SPEC.md`, `docs/VISUAL-SYSTEM-RULES.md`;
source owners `js/play-shape.js`, `js/play-tagger.js`, `js/tag-library.js`,
`js/analytics-registry.js`, `js/native-tagging.jsx` and `js/study-query.js`.
The field names above are proposed names, not existing APIs.
