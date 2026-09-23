# Break Down Workspace — Redesign Comp (2026-08-30, final rail repairs)

## Production implementation (2026-08-30)

Charlie authorized Codex to implement this comp. The production Breakdown route now owns the responsive three-column Chart composition, compact strip/on-demand browser fallbacks, wider Film Room table, top-aligned width-sized film and selected-play detail, compact charting header, aligned Situation/spot fields, neutral copy, and independent roster disclosures. The prototype below remains the visual reference; production uses real controllers and all real tag options, not the shortened fixture vocabulary.

Production evidence: `artifacts/breakdown-comp-live/` (21 captures and geometry) and `tools/verify-breakdown-comp.mjs`. Source-season integrity is verified with a before/after hash; live app data was not changed. Screens use a real clip as a visual fixture, not a claim that every seeded play has been relinked. Expanded controls and populated screens were directly inspected. Implementation defects caught and repaired, focused test results, and superseded test expectations are recorded at the top of `CLAUDE.md`. No packaging or release in this checkpoint; coach visual acceptance is still pending.

## Comp closeout (2026-08-30)

The two remaining review findings are repaired in the comp. The close icon
only appears in the narrow on-demand Plays browser, never in the permanently
docked rail. Crossing into the strip/docked layout also dismisses an open
panel and its scrim.

A small neutral direction indicator in the pinned Plays header now signals
offscreen rows independently of OS scrollbar visibility: down at the top,
both directions in the middle, up at the bottom, and hidden when all rows
fit or the list is empty. Its tooltip and accessible label describe the
direction. Native scrolling and the existing scrollbar styling remain intact.

`verify-rail.mjs` passed the focused docked/open, top/middle/bottom,
Escape/focus-return, resize, and empty-state checks with zero page errors.
Codex opened and visually inspected the refreshed 1920px docked screenshot
and the 1280px open-browser top/bottom screenshots. This closes the previous
scrollbar-evidence limitation without assuming a particular Windows setting.
Other captures remain from Claude's preceding pass; no full production gate
was run for these localized comp changes. No production route or data changed.

Normal file reads and direct image viewing worked. Chromium launch timed out
inside the sandbox; the same focused check passed outside it. This does not
revoke the earlier verified file/image access fix.

**Status: design-only checkpoint. Nothing here touched the live route, production
CSS/JSX, or any customer data — with one deliberate, explicitly-authorized
exception in round 4: the shared `design-system/tokens.css` value of
`--gi-bd-copy` itself, per that round's direct instruction (round 3 had
declined to touch it on its own judgment and disclosed the residual instead).
Round 1 REVISE (six findings) is closed. Round 2 REVISE (eight findings) is
closed, with one residual disclosed rather than claimed fixed. Round 3 REVISE
(seven findings) is closed, with the same residual measurably improved but
still disclosed rather than overstated — see "Round 3 findings, closed" and
its "Honest residual, updated" note; that residual is explicitly NOT chased
further per round 4's own verdict ("I would not chase the requested 32px
target further... wasted effort"). Round 4 REVISE (one color correction, two
state captures) is closed, including a second defect found and fixed while
proving the two new captures, and one further finding (a redundant label and
uneven header spacing) surfaced by the same pass and fixed in the same batch.
Round 5 REVISE (six required repairs) is closed below — the Plays browser
close/scroll/focus contract, the Special Teams field-position row, Film
Room's 1280px playback/action composition, cross-region sample-state
consistency via one shared fixture, the Players & Grades recomposition, and
prototype-tooling removal from captures — plus one live mid-review request
(equal Chart/Film Room mode-switch widths) and one further inconsistency
(the Special Teams possession-spot/yard-line pair) caught while visually
verifying finding 2 and closed in the same pass. Awaiting APPROVE / REVISE /
REJECT.**

Interactive comp: `breakdown.html` (open directly, or via the dev server at
`/design-comps/breakdown-workspace-2026-08/breakdown.html`). A floating
reviewer-only panel (bottom right, ⚙ to toggle, moved off the top-right corner
in round 5 finding 6) switches between the required states — it is not part
of the design and is hidden in every capture.

Captures: `captures/*.png` — **16** required images (unchanged set from round
1 — offense/defense/special-teams chart at 1920/1440/1280, Film Room at all
three, missing-film and sparse at 1920/1440), plus one disclosed diagnostic
(`diagnostic-1440x900-offense-scrolled-bottom.png`), the round-4 open-panel
pair (`1280x720-transport-more-open.png`, `1280x720-plays-browser-open.png`),
the round-4 token cross-check (`reports-consistency-check-1440x900.png`), and
five new round-5 focused captures: `1280x720-film-room-transport-more-open.png`,
`special-teams-possession-row-1280x720.png`, and the three Players & Grades
states (`players-both-collapsed-1440x900.png`, `players-one-expanded-
1440x900.png`, `players-both-expanded-1440x900.png`). The later rail closeout
also added `1280x720-plays-browser-bottom.png`, bringing the retained folder
to 26 captures. The preceding 25 were regenerated in round 5, and every one
of the 16 required states plus every new
focused capture was opened and inspected directly — not sampled — against the
round-2 checklist, because round 2 finding 1 established that the capture
pipeline itself had been silently wrong once already.

## Round 1 findings, closed

### 1 — P1: the layout failed at 1280×720 and 1440×900

**What was wrong.** The three-column grid (Film · Rail · Deck) was fixed at
every width. It reserved rail+deck width unconditionally, so at 1280 the film
got too small and the theater's own action row clipped, and at 1440 roughly
200px of vertical theater space sat empty — the rail had *relocated* the dead
space, not removed it.

**The fix.** The rail is now genuinely wide-screen-only. Below **1700px**
(covering both 1440 and 1280), Chart mode is two columns — Film (flex) and
Deck (fixed) — and the SAME play list renders as a compact horizontal band
directly under the theater, using exactly the vertical space a shorter
theater leaves unused instead of taking width from film or the deck. At
**≥1700px** (1920 is the only required capture at that width) there is
genuine spare width, and the rail becomes a full-height sidebar as before.
One CSS `grid-template-areas` swap under a single media query — same
markup, same list, same play-card semantics, at every width.

```css
.gi-breakdown-composition[data-mode="chart"]{
  grid-template-columns:minmax(0,1fr) clamp(400px,26vw,460px);
  grid-template-rows:minmax(0,1fr) auto;
  grid-template-areas:"theater deck" "rail deck";
}
@media (min-width:1700px){
  .gi-breakdown-composition[data-mode="chart"]{
    grid-template-columns:minmax(0,1fr) clamp(230px,15vw,300px) clamp(430px,24vw,480px);
    grid-template-rows:minmax(0,1fr);
    grid-template-areas:"theater rail deck";
  }
}
```

**Verified, not asserted.** Re-captured all three offense viewports and both
new jobs (defense@1280, special@1440): the video is now width-bound and
edge-to-edge in its column at every width, the under-video play band reads as
a deliberate, useful strip rather than an afterthought, and the wide-screen
sidebar rail still holds at 1920. Opened and visually confirmed all of it.

### 2 — P1: zero page overflow was masking clipped functionality

**What was wrong.** `overflow:hidden` on the composition hosts prevented
page-level scrolling, but it also silently hid controls that didn't fit —
Clear Tags, Delete Play, and the transport's right edge clipped at 1280
(and the same class of problem in Film Room at 1440). The round-1 acceptance
check only measured `document.scrollWidth`, which cannot see this.

**The fix.** `.gi-theater-transport` and `.gi-theater-actions` now
`flex-wrap:wrap`. Their grid row is already `auto`-sized, so a too-narrow
column drops the tools cluster to a second line — costing a few pixels of
theater height — instead of losing a control off the edge. Combined with
finding 1's fix (which gives the theater column far more width at 1280/1440
in the first place), no wrapping was actually needed in any required
capture; the wrap exists as a structural guarantee against the next narrow
case, not a cosmetic patch for this one.

**The acceptance check now asserts containment directly**, per the review's
explicit instruction. `capture.mjs` walks every command button
(`.gi-icon-command`, `.gi-theater-command`, `.gi-play-command`, toolbar/nav/
segment/shell-tool buttons), computes its rendered box, then accumulates the
visible (post-clip) rect through every `overflow:hidden` ancestor, and fails
if the two disagree by more than 0.5px. Result across all 16 jobs: **CLEAN —
zero commands clipped**.

### 3 — P1: the sticky commit bar could cover charting content

**What was wrong.** Round 1 disclosed, rather than fixed, that Save & Next
could sit over the last group's header on a tall form. That is not
acceptable in a proposed final design.

**The fix.** `.gi-native-form` now reserves 68px of buffer
(`padding-bottom:68px`) — more than the commit bar's own rendered height —
so the last group's real content always clears it, plus a matching
`scroll-padding-bottom` on the deck. This was verified, not assumed:
`capture.mjs` scrolls the deck to its absolute bottom on every chart-mode job
and compares the last **open** group's real content against the bar's top
edge (a closed `<details>` collapses to a zero-height marker and is
deliberately excluded from the check — it isn't visible content).

**Both the normal case and the worst case are clean.** At default open-group
state: **146px** of clearance in every chart-mode job. At the deliberate
worst case — every single group forced open on a 1440×900 offense play,
scrolled to the true bottom — there is still **68px** of daylight between
the Notes & Details textarea and the bar. See
`diagnostic-1440x900-offense-scrolled-bottom.png`: opened directly, the last
field is fully legible with clear space above the bar.

### 4 — P1: the sparse state gave an impossible instruction

**What was wrong.** With no film added, the play rail and the charting deck
both told the coach to "Mark Start on the video" — instructions aimed at a
video that does not exist — while the video panel repeated a third version
of the same message.

**The fix — one primary instruction, everything else subdued.**
- **Primary** (video panel, unchanged in kind, reworded): "Add game film" +
  Add video / Add folder, now explicitly stating "Charting and the play list
  open automatically once film is available" — the secondary explanation the
  review asked for, in the one place a coach is actually being asked to act.
- **Secondary states, made genuinely subdued, not just re-worded.** The
  charting deck's empty panel lost its icon, its heading, and its background
  fill — it is now two lines of plain, muted text: "Charting is unavailable
  until film is added for Week 7 vs. Cedar Ridge Timberwolves" / "Add video
  or a folder from the panel on the left." The play rail lost its dashed
  border (a dashed box itself reads as an invitation to act) and now reads
  "Plays will appear here once film is added." The charting header itself
  changed from "Select Play" (implies something exists to select) to "No
  film yet." Film Room's own empty-table message was corrected the same way
  for consistency, even though it isn't reachable from any required capture.

**Verified.** Opened `1920x1080-sparse-new-game.png`: one clear call to
action, two visually quiet "why this is inert" notes, no contradiction
anywhere on the screen.

### 5 — P2: still looks substantially like the existing developer-console UI

**What was wrong.** The toolbar's four utility buttons (Quick Chart,
Customize Fields, Game Settings, Film Focus) had a transparent border and
background at rest — they only looked like buttons on hover, reading as
background text the rest of the time. Two remaining controls (the play-call
library link, the roster show/hide toggle) were bare accent-colored text
links using the shared blue `--gi-los` token — a stray third color against
a surface that otherwise keeps strictly to gold (active/current) and cyan
(defensive context).

**The fix.** All four toolbar buttons now carry real button chrome at rest —
border, background, edge shadow, matching every other command button in the
app — plus a small stroke icon each (lightning bolt / sliders / gear /
expand), so they read as commands before the coach ever touches them. A
vertical divider now separates them from the perspective/mode segments. The
two accent-text links became small bordered chips in the neutral palette —
no color introduced that isn't already load-bearing elsewhere on the
surface.

**Verified.** Opened the 1920×1080 offense/defense/special captures: all
four toolbar commands are legible as buttons at rest, "Edit Library" and the
roster toggle read as small secondary controls rather than stray blue links.

### 6 — P2: Film Room still wasted its theater column

**What was wrong.** The table view was clean, but the film sat centered in a
tall black column with large empty areas above and below it — the video's
own sizing formula bound it to the narrow column's *width*, which produced a
much shorter height than the column had room for.

**The fix.** In Film Room mode specifically, the video now sizes off the
column's width with an ordinary `aspect-ratio:16/9` (rather than the
contain-formula Chart mode needs, which was solving a different problem —
picking whichever dimension binds, in a column that can be either shape).
The vertical space that frees up is spent on a real "what am I looking at"
panel directly under the video: the selected play's down & distance, ball
spot, hash, its call, the result, a notes excerpt, and its drive position —
using the exact same fixture data the chyron and rail already show, so
nothing on screen can disagree with anything else. This is useful content, not
filler: a coach glancing at Film Room's film pane can read the play without
looking away to the table.

**Verified.** Opened `1440x900-film-room.png` and `1920x1080-film-room.png`:
the black void is gone; what remains below the detail card is a modest,
ordinary margin, not a defect.

## Binding-rule compliance (unchanged from round 1, re-confirmed)

- **Tokens**: still only `design-system/tokens.css` / `plex.css` /
  `material.css`, no second token system. No new token was introduced by this
  revision — the fixes reuse `--gi-*` values already load-bearing elsewhere.
- **Fonts**: still only the embedded Plex 400/600/700 weights.
- **Shell**: still one top navigation, one compact context row.
- **Film stays unobstructed**: the Film Room detail panel sits below the
  stage, never over it; confirmed by direct inspection of both captures.
- **Complete vocabulary stays visible**: unchanged — nothing in this
  revision hides a chip or a field.
- **Realistic content, no lorem ipsum**: unchanged; the new Film Room detail
  panel and the reworded empty states reuse the same fixture facts already
  established (Play 47, Trips Right Stick Draw, Drive 8, etc.), not new
  invented data.

## New/changed evidence this round

- `capture.mjs` grew two real checks, both requested directly by the review:
  command containment (walks every interactive control, accounts for
  clipping ancestors) and sticky-bar overlap (scrolls the deck to bottom and
  compares real content against the bar). Both ran clean across all 16 jobs
  plus the forced-worst-case diagnostic.
- Two capture jobs were added (`1280x720-defense-chart.png`,
  `1440x900-special-teams-chart.png`) so every charting unit is proven at
  every width the review flagged as broken, not just offense.
- One diagnostic-only capture
  (`diagnostic-1440x900-offense-scrolled-bottom.png`) exists purely as visual
  proof for finding 3; it is not one of the required states and is not being
  presented as one.

## Candidate shared components (updated)

| Comp class | What it is |
|---|---|
| `.gi-icon-command` / `.gi-theater-command` / `.gi-play-command` | icon and text command buttons — one shape, every toolbar/transport action |
| `.gi-segment` | segmented control (Self/Opponent Scout, Chart/Film Room, unit switch reuses the same visual language) |
| `.gi-tag-group` (`<details>`) | section/group header with the lower-third diagonal tag, gold/cyan aware |
| `.gi-tag-field` / `.gi-tag-chips` / `.gi-tag-input` | field label + chip row + text/number input, the charting primitive used everywhere |
| `.gi-play-call` | play-call entry + quick-pick row, shared by every unit |
| `.gi-tag-nav` | sticky commit bar (Previous / Skip / Save & Next), now with a guaranteed content-clearance buffer |
| `.gi-play-rail` / `.gi-play-row` / `.gi-rail-group` | the vertical/horizontal play browser — now explicitly two responsive placements of one component, not two components |
| `.gi-theater-chyron` | below-film situation strip, mode-aware (full vs. simplified) |
| `.gi-filmroom-detail` | **new this round** — Film Room's selected-play context card (situation, call, result, notes, drive position) |
| `.gi-film-table-wrap` | data-table treatment (sticky header, sticky play column, row states) |
| `.gi-stage-empty` / `.gi-tag-empty-panel` | empty/error state panel — the tag-empty-panel variant is now deliberately subdued (no icon, no fill) for the "unavailable, not a second CTA" states |
| `.gi-film-pill` | film status indicator (linked / needs re-link / no film added) |

## Mapping to production surfaces (unchanged, plus one addition)

All round-1 mappings hold. New: `.gi-filmroom-detail` has no current
production equivalent — it is genuinely new, replacing empty stage space in
`native-breakdown-theater.jsx`'s Film Room presentation.

## Round 2 findings, closed

Round 2 was more specific than round 1 on every point, and one of its eight
findings was about round 1's own evidence being wrong. Each is addressed
below with what was actually broken, what changed, and what was verified —
by opening the resulting image, not by trusting the measurement that produced
it.

### 1 — P1: the round-1 screenshot evidence was contaminated

**What was wrong.** `capture.mjs`'s sticky-bar check scrolled the deck to
`scrollHeight` (the true bottom) to measure worst-case clearance, and the
**required** screenshot for that same job was taken after that scroll, not
before it. Every round-1 chart-mode capture was silently taken scrolled to
the bottom of the form — Situation, the unit's scheme group, and most of the
charting vocabulary were off-screen above the fold in every single delivered
image, even though the round-1 write-up described a form scrolled to the top.

**The fix.** `capture.mjs` was rewritten so the order can't produce this
again: render the state, explicitly set `deck.scrollTop = 0`, let it settle,
**take the required screenshot**, and only then run the destructive
bottom-scroll check for the sticky-bar overlap diagnostic — restoring
`scrollTop = 0` afterward regardless. A new automated assertion
(`scroll-top-at-capture`) records the actual `scrollTop` at the moment of
every required screenshot and fails loudly if any of them is nonzero; it is
printed as its own table, separate from the destructive-check table, so the
two can never be conflated again. Current run: **CLEAN — every required
screenshot was taken at scroll-top** (all 16 report `scrollTopAtCapture: 0`).

**Verified.** Opened `1440x900-offense-chart.png`: Situation and Our
Offensive Look are both visible above the fold, exactly as they should be.

### 2 — P1: film was too small at 1440 and especially 1280×720

**What was wrong.** Measured directly (not eyeballed): at 1440×900 the
rendered film was 1159×652 in a 940px-wide theater column with a
~128–192px play rail eating real height above/below it; at 1280×720 the
film was smaller still relative to the column. Round 1's claim that film was
"width-bound and edge-to-edge" was true of the *column*, not of the actual
budget the coach experienced — the rail was the thing quietly spending the
height that should have gone to the picture.

**The fix, in the order it was actually found and applied:**
1. **The play rail's footprint was cut dramatically at every width below
   1700px.** Below 1350px it collapses to a single 34px toggle strip
   ("▤ Plays · 67 ▴ open") that expands into an overlay on demand instead of
   permanently reserving height; between 1350–1699px it is an ~80–90px
   horizontal strip. Neither permanently spends anywhere near the 128–192px
   round 1 was carrying.
2. **Remaining theater chrome (chyron / transport / actions) was trimmed**
   — stage padding, transport and action-row min-heights, and chyron cell
   padding were each reduced to their smallest legible size, recovering a
   further ~15–20px of stage height per row at every width.
3. **The chyron's cell count is now width-aware in Chart mode, not just in
   Film Room.** At ≤1300px the Ball On and Hash cells hide (`.is-secondary`),
   matching the precedent Film Room's chyron already set for exactly this
   reason — they repeat information the Situation fields already show a few
   inches below, so dropping them costs nothing a coach can't get elsewhere
   on the same screen, and it recovers width for the cells that matter (Play,
   Down & Distance, both calls, Result).

**A real mistake made and reversed in this same round, disclosed rather than
hidden:** an intermediate attempt collapsed the chyron's stacked
label-above-value layout into one inline line at narrow widths, hoping to
trade a little height for meeting the 32px margin target. It measured well
(margin improved from 62px to 57px) but **broke legibility on real content**:
opened the resulting 1280×720 capture and found every chyron value truncated
by its own ellipsis — "Ri..." for "Right," "Gai..." for "Gain: +6," even the
play number itself clipped to "4." This is exactly the class of defect
finding 8 exists to catch, and it was caught by looking at the image, not by
the geometry check (which had reported the row height as compliant). It was
reverted in full — the chyron is back to its legible two-line stacked layout
at every width — and the cell-count reduction above was built instead, which
gets less of the raw margin number but costs zero legibility, verified by
opening the corrected capture and confirming every value reads in full.

**Measured film rectangle, all three required Offense viewports, current
build (also re-verified for Defense and Special Teams — see the Honest
residual note below for what did not fully close):**

| Viewport | Film (W×H) | Theater column (W×H) | Margin L / R |
|---|---|---|---|
| 1920×1080 | 1162×654 | 1171×956 | 4px / 5px |
| 1440×900 | 988×556 | 1040×692 | 25px / 26px |
| 1280×720 | 756×425 | 880×561 | 62px / 63px |

**Verified.** Opened all nine chart-mode captures (three units × three
widths). At 1920 the picture is essentially edge-to-edge. At 1440 the margin
is inside the ~32px target this finding names. At 1280 it is not — see the
honest residual disclosure below rather than a false claim of compliance.

### 3 — P1: the charting-unit selector was oversized

**What was wrong.** Offense/Defense/Special Teams rendered as large tiles
stretched across the header, competing with the play number for primary
visual weight.

**The fix.** `.gi-unit-switch` is now a compact segmented control —
content-sized (`margin-left:auto`, no `justify-content:space-between`
stretching it), a shared `min-height:var(--gi-hit)` (30px) button row, gold
fill on the active offense/special state and cyan fill on the active defense
state (`[data-unit="defense"] .is-active`), joined by 1px interior dividers
rather than gapped as separate buttons. Special Teams is visibly a touch
wider than the other two only because its label is longer — it never becomes
a large block of its own.

**Verified.** Opened all nine chart-mode captures: the play id/progress
line remains the header's largest, most prominent text in every one; the
selector reads as a compact control beside it at every width including 1280,
with no wrapping.

### 4 — P1: hazy-blue typography throughout

**What was wrong.** `--gi-9` / `--gi-10` (the design system's literal
solid-accent interactive blue, `#2b6fff` / `#5a92ff` hover) had been used
throughout the comp as if they were quiet neutral gray steps for field
labels, group descriptions, metadata, play-list text, table content, empty
states, and chyron labels — they are not neutrals; they are the same blue
`--gi-los` derives from, and using them everywhere is exactly what produced
the reported hazy, unfinished-console read.

**The fix — a full, targeted token sweep**, done as brace/semicolon-scoped
substring replacements so `border-color:` declarations couldn't be
accidentally corrupted by a shared trailing substring, and verified after
each pass with a direct search that no unintended site changed:
- `color:var(--gi-9)` and `color:var(--gi-8)` (both blue-adjacent —
  `--gi-8` is "border strong / disabled," also blue-tinted) → `color:var(
  --gi-bd-muted)` (the Broadcast Density quiet-metadata token, `#66727e`).
- `color:var(--gi-10)` → `color:var(--gi-11)` (the design system's actual
  text-secondary neutral, `#93a9c1`).
- `border-color:var(--gi-9)` → `border-color:var(--gi-8)` (a border can
  legitimately use the neutral "strong border" step; it was the *text* uses
  of these tokens that were the defect, not every border reference).
- The two remaining genuine uses of accent blue — `--gi-los` on the brand
  wordmark's "IQ" and the active top-nav underline — were kept exactly as
  they were, confirmed by direct search to be the only two occurrences left
  anywhere in the file.

**The required color-role table (updated in round 3 — `--gi-11` is no longer
used anywhere in this file; see finding 2 above for why `--gi-bd-copy` is the
secondary-text token now — and updated again in round 4, where the token's
own shared-source hex changed from `#9daab7` to a true neutral `#a6a6a6`; see
"Round 4 findings, closed" below):**

| Role | Token | Hex | Where it's used |
|---|---|---|---|
| Primary operational text | `--gi-12` | `#f2f6fa` | field values, play data, active chip labels, table cell content |
| Secondary text | `--gi-bd-copy` | `#a6a6a6` (round 4; was `#9daab7`) | field labels, section eyebrows, chyron key labels, inactive chip text, table headers, nav labels, play-list rows |
| Quiet metadata | `--gi-bd-muted` | `#66727e` | group description subtext, empty-state captions, disabled-state text, "of N tagged" progress lines |
| True links / focus | `--gi-los` (`--gi-9`) | `#2b6fff` | the brand wordmark accent and the active top-nav underline only — never body/field/table text |
| Gold — active/current, primary action | `--gi-bd-gold` | `#d9a21a` | Offense/Special Teams active state, Save & Next, the play-id chyron chip, "our call" values, active Film Room filters |
| Cyan — defensive context | `--gi-bd-cyan` | `#12a9cb` | Defense active state, defensive scheme group headers/chips, defensive chyron/play-id chip |

**Verified.** Opened every one of the 17 captures and read every visible text
role against this table: field labels and descriptions are neutral gray,
values and active states are bone-white or gold/cyan as appropriate, and the
only blue anywhere on any screen is the "IQ" wordmark and the active Break
Down tab underline in the top nav — both intentional, both load-bearing
identity/navigation signals, neither part of the charting surface itself.

### 5 — P1: the no-film state left active-looking controls beside "unavailable" copy

**What was wrong.** Round 1 quieted the *copy*; it never disabled the
*controls*. Playback transport, Mark Start/Mark End, Clear Tags, Delete Play,
and the utility row (Same as Last / Templates / Save Template / Delete) all
still rendered as normal, clickable-looking buttons in both the sparse and
missing-film states, next to text saying charting isn't possible.

**The fix.** `render()` now computes `noPlayableFilm = stageKind !== 'video'`
and applies a genuine `disabled` attribute — not just a visual dim — to every
transport, mark, clear, and delete control whenever the stage has no
playable video (`stageKind` is `'missing'` or `'empty'`, covering both the
missing-film and sparse states). The dedicated sparse-state deck markup
additionally ships its unit switch and its Same as Last / Templates / Save
Template / Delete row as `disabled` from the start, since there is no film
and no game context for those controls to act on at all. Disabled controls
get a real, consistent visual treatment (`opacity:.38; cursor:not-allowed;
pointer-events:none`) rather than looking pressable.

**A deliberate distinction, stated explicitly rather than left ambiguous.**
The **sparse** state (no game context at all — no plays, no prior tags) fully
disables the tag-editing surface, matching the copy's own claim that
"charting is unavailable." The **missing-film** state is different in kind:
it is an *already-tagged* play whose specific clip failed to resolve — the
play's Formation/QB Alignment/Play Call selections are real, saved data. This
comp leaves that tag-editing surface **active** (a coach can still correct a
formation tag without a working video preview) while still disabling every
control that genuinely requires a frame of video to act on (transport,
mark-start/end, clear tags on the loaded clip, delete-play). This is a
product decision, made and disclosed here rather than defaulted into
silently — the alternative (disabling the whole deck) would block a coach
from fixing a typo in an existing play merely because its clip needs
re-linking, which is a worse outcome than leaving those specific controls
live.

**Verified.** Opened both missing-film captures and both sparse captures at
every required width: transport, mark, clear, and delete all read visibly
disabled in every one; the sparse state's unit switch and utility row are
disabled too; the missing-film state's Formation/Play Call editing controls
remain active, matching the distinction above.

### 6 — P2: Film Room's detail card was clipped at 1280×720

**What was wrong.** The card's notes excerpt and drive metadata partially
overflowed their available height at the narrow breakpoint.

**The fix.** The notes and drive-position lines are now wrapped in a native
`<details class="fr-more"><summary>More detail…</summary>` disclosure. JS
sets `.open` based on `window.innerWidth` at render time (`> 1350` opens it
by default; narrower closes it), so the situation/call/result line — the
information a coach needs at a glance — is always visible, and the secondary
detail is one click away exactly where there isn't vertical room for it
unprompted. This is the same chrome-trimming pass (finding 2) that also
freed up the extra height the card needed.

**A dedicated containment check, per the review's explicit request** — not
just "does the card's own button fit," but the whole card: `capture.mjs`
measures the card's full un-clipped scroll height against its actually
visible height through every clipping ancestor.

| Viewport | Full height | Visible height | Clipped | More detail open |
|---|---|---|---|---|
| 1920×1080 | 165px | 165px | false | true |
| 1440×900 | 165px | 165px | false | true |
| 1280×720 | 113px | 113px | false | false |

**Verified.** Opened all three Film Room captures: at 1280 the card shows
Play/situation/call/result only, with "▸ More detail" as a real, reachable
affordance beneath it — nothing is cut off, nothing sits partially visible.

### 7 — P2: too much console-like chrome

**What was wrong.** Overlapping with finding 4 in effect, though distinct in
cause: field labels used the same heavy uppercase-eyebrow treatment as true
section headers, and passive content (the player-role card) carried a full
visible border identical in weight to active controls — everything read as
equally instrumented, with no visual distinction between "this is a control"
and "this is information."

**The fix.** Field labels (`.gi-tag-field-label`, `.gi-tag-input`) dropped
`text-transform:uppercase` and moved to `--gi-11` at 12.5px/600 weight,
sentence case — closer to how a finished product labels a form field than to
a technical instrumentation readout. The player-role card
(`.gi-tag-players > div`) now sits on a plain `--gi-2` panel with a
transparent border at rest, so a coach's eye isn't drawn to a boxed border
around informational content the way it is to an actual control.

**Verified.** Opened the offense/defense/special-teams captures: field
labels now read as ordinary form labels rather than uppercase system
instrumentation; true section headers (Situation, Our Offensive Look, etc.)
retain their uppercase/eyebrow treatment specifically because they *are*
structural navigation within the form, which is the one place that treatment
still earns its keep.

### 8 — P2: automated checks alone could not certify visual quality

Addressed by process rather than by a single code change: every claim of
"fixed" in this document above is backed by a specific capture that was
opened and read, not by a passing geometry assertion alone — most visibly in
finding 2, where the geometry check reported the inline-chyron attempt as an
improvement while the actual image showed it had broken legibility. All 17
captures for this round were regenerated fresh and opened individually
before this document was written; none of the eight findings above rest on a
measurement that was not also visually confirmed.

## Honest residual — not closed, disclosed rather than overstated

**The 1280×720 film margin does not meet the ~32px target.** Measured at
62–63px on both sides (offense and defense identically; Special Teams
measures 46–47px, slightly better, because its default play happens to carry
a shorter chyron value in the one variable-width cell). This is the one place
this round's own instruction not to overstate compliance actually applies.

**Why, mechanically:** at 1280×720 the theater column is 561px tall. A
16:9 picture spending all of it would be 998px wide — far more than the
880px-wide column actually has — so at this specific viewport the picture is
genuinely **height-bound**, not width-bound, and every pixel of required
theater chrome above and below the video (the 2px accent border, the chyron
row, the two-row transport, the actions row) is pixels the video does not
get. Chrome was already trimmed to its legible floor this round (finding 2);
the remaining ~118px it occupies is a full broadcast chyron plus a complete
VCR-style transport plus the charting-shortcut row, all genuinely required by
the binding brief (film stays primary, but the transport and chyron are not
optional either).

**What would close it, and why it wasn't done unilaterally:** the only
further lever with real height payoff is collapsing part of the transport
(loop / speed / draw / angle / fullscreen) behind an overflow menu at this
one breakpoint, matching the pattern already used for Film Room's own
detail-card disclosure. This was deliberately not built into this round: it
is a capability-visibility decision (which controls are always-on-screen
versus one click away) rather than a pure layout fix, and the brief's own
instruction is to bring exactly this kind of trade back for review rather
than make it silently. Recommended as the next concrete step if 1280×720
compliance is required rather than accepted as a disclosed limit at this one
narrow desktop width.

## Round 3 findings, closed

Round 3 confirmed six of round 2's eight fixes landed correctly and named
five new, more specific problems plus a re-statement of the residual — every
one addressed below, each verified by opening the regenerated capture.

### 1 — P1: Situation wasted vertical space (Quarter/Down wrapping)

**What was wrong, measured directly rather than guessed.** Quarter (5 chips)
and Down (4 chips) were wrapping onto a second internal line each — every
regular chip's own padding (9px each side) needed more room than the grid
column had actually been given once the row's total available width was
accounted for (`minmax(0,190px)`/`minmax(0,116px)` reads generous on paper,
but the row's real content width at both 1440 and 1280 is only ~358px, and
190+116+66+gaps already exceeds that before a single chip renders). Verified
by querying every chip's real rendered `top` position: Quarter's chips
occupied two distinct `top` values (Q1–Q4 on one line, OT alone on a second);
Down's did too (1–3 on one, 4 alone).

**The fix.** Situation-row chips (`.gi-tag-situation-row .gi-tag-chips
button`) get their own, smaller horizontal padding (6px vs the 9px vocabulary
chips use elsewhere) — these are single glyphs a coach reads at a glance, not
vocabulary being scanned for meaning, so they can carry tighter padding while
keeping the identical 30px control-floor height every other chip in the app
uses. The two grid columns were also retuned slightly (190→178px, 116→108px)
to match what the tighter chips now actually need.

**Verified — re-queried every chip's rendered position after the fix**: every
field in both Situation rows (Quarter, Down, Hash, Field position) now
reports exactly one distinct `top` value across all its chips. Opened all
nine chart-mode captures: Quarter reads "Q1 Q2 Q3 Q4 OT" on one line and Down
reads "1 2 3 4" on one line in every one, at every width including 1280.

### 2 — P1: the hazy blue was still present

**What was wrong.** Round 2 removed the saturated interactive-blue tokens
(`--gi-9`/`--gi-10`) but replaced most of their usage with `--gi-11`
(`#93a9c1`) — which is not a neutral either. It is the design system's own
"text secondary" token, and it is a genuine blue-gray (R147/G169/B193, a
real ~27%-saturation cool cast), used across labels, inactive chips, table
headers, nav text, play-list rows, and chyron labels. Swapping one blue token
for a slightly-less-saturated second blue token was not the fix — it just
moved the cast, which is exactly why it was still visible.

**The fix.** Every one of the 40+ `var(--gi-11)` uses in this file — field
labels, inactive chip text, table headers, nav labels, play-row text, chyron
key labels, toolbar copy, empty-state text, everything the review named — was
swept to `var(--gi-bd-copy)` (`#9daab7`), the design system's own genuinely
lower-saturation neutral-copy token (~15% cast vs. `--gi-11`'s ~27%). Verified
by direct search: zero remaining `--gi-9`/`--gi-10`/`--gi-11` references
anywhere in the file; computed color on a real rendered label confirmed
`rgb(157, 170, 183)` — exactly `--gi-bd-copy`.

**A judgment call, made and disclosed rather than acted on silently: the
shared `tokens.css` value of `--gi-bd-copy` was NOT edited.** The review's
instruction was conditional — "if `--gi-bd-copy` still looks blue, adjust
that token in the actual design system." It does still carry a small residual
cool cast (measured ~15% saturation against a true neutral at the same
lightness), genuinely less than half of what `--gi-11` had, but not
mathematically zero. `--gi-bd-copy` is not a comp-local value — it is a
production Broadcast Density token, already shipped and already load-bearing
in the accepted, Charlie-Gate-approved Reports screen (`native-reports.jsx`
and siblings, per this project's own history). Recoloring it here would
silently change that already-approved surface's appearance too, which is a
bigger and different decision than revising this one comp. Rather than make
that call unilaterally inside a design-comp revision, the token usage sweep
was completed in full and the residual is surfaced here for an explicit
yes/no: if the still-mild cast in the delivered captures reads as
insufficient, the next step is a deliberate, separately-scoped token edit —
not something to fold into a comp iteration.

**The color-role table is unchanged from round 2** (Primary = `--gi-12`,
Secondary = now genuinely `--gi-bd-copy` throughout rather than partially,
Quiet metadata = `--gi-bd-muted`, Links/focus = `--gi-los` in exactly two
places, Gold/Cyan = active states) — see the table further down.

**Verified.** Opened every capture: labels, table headers, inactive chips,
nav text, and play-list rows all read as warm-neutral gray, not blue-gray.
The only two remaining blue elements on any screen are the "IQ" wordmark and
the active Break Down tab underline — unchanged from round 2, both
intentional brand/navigation signals.

### 3 — P1: the 1280 film problem — the named lever, built and made to pay off

**What was wrong.** Round 2 disclosed rather than closed this; round 3
required the specific fix: collapse Loop/Speed/Drawing/Angle/Fullscreen
behind a compact menu at ≤1300px, keep playback/timeline/time/marking
visible, and spend the recovered height on film.

**The fix, and a real complication found while building it.** The five
secondary transport tools now collapse into one "⋯" trigger
(`.gi-transport-more`) opening a small anchored panel with all five as
labeled rows; `.gi-theater-transport-main` (prev/step/play/step/next, both
time readouts, the scrub bar) and the Mark Start/Mark End/Copy Last row are
never touched by this and stay fully visible at every width, exactly as
specified. **Building it exposed that the literal ask alone doesn't pay off**:
`.gi-theater-transport`'s row height was pinned by a fixed `min-height:42px`
regardless of how many controls it held, so hiding the five tools initially
recovered zero pixels of stage height — only less-used row width. Closing
that gap required going one step further than the literal instruction: the
row's `min-height` now drops to 36px specifically at ≤1300px, now that its
tallest remaining control is the plain 30px icon-command floor rather than a
`<select>` plus five icon buttons; the chyron's Play-number cell (the tallest
child in a `display:flex;align-items:stretch` row, which was silently
forcing every OTHER chyron cell to match its 21px value line) drops to 16px
at the same width, still visibly the largest number in the row; and the
stage's own padding tightens from 4px to 2px. None of these were named
explicitly in the finding, but all three were necessary to make "collapse the
menu" actually mean "recover height for film" rather than "recover width
nobody needed."

**Measured result, all three required Offense viewports, before and after
this round:**

| Viewport | Film W×H (round 2) | Film W×H (round 3) | Margin (round 2 → round 3) |
|---|---|---|---|
| 1920×1080 | 1162×654 | 1162×654 | 4px/5px → 4px/5px (unchanged, already excellent) |
| 1440×900 | 988×556 | 988×556 | 25px/26px → 25px/26px (unchanged, already under target) |
| 1280×720 | 756×425 | **777×437** | 62px/63px → **51px/52px** |

**Verified.** Opened the 1280 offense, defense, and special-teams captures:
the "⋯" trigger is present and visibly distinct from the always-visible
transport controls; the picture itself is measurably and visibly larger than
the prior round's capture at the same width. See "Honest residual, updated"
below for the exact remaining gap and why it wasn't fully closed by this
lever alone.

### 4 — P1: no-film disabling was incomplete

**What was wrong.** The theater transport was already correctly disabled in
the sparse/missing-film states, but `Quick Chart` and `Film Focus` — both of
which need a real, playable clip to do anything at all — still rendered as
ordinary, clickable-looking toolbar buttons in both states.

**The fix.** Both buttons now carry `data-tool="quick-chart"` /
`data-tool="film-focus"` and are included in the exact same `noPlayableFilm`
disabling pass the theater transport already used, with a matching
`:disabled` visual treatment. `Customize Fields` and `Game Settings` were
deliberately left out of that selector — per the review's own instruction,
and because they configure the library/game itself rather than acting on a
clip, so they remain genuinely useful even with no film loaded.

**Verified.** Opened both missing-film captures and the sparse capture: Quick
Chart and Film Focus are visibly dimmed/disabled in both, while Customize
Fields and Game Settings remain in full, enabled contrast in the same row.

### 5 — P2: perspective terminology mismatch

**What was wrong.** This comp said "Self Scout / Opponent Scout"; the
established app-wide workspace switch says "Our Program / Opponent Scout" —
two names for the same choice.

**The fix.** Changed to "Our Program / Opponent Scout" at the one live site
plus both explanatory code comments referencing the pattern.

**Verified.** Opened every capture: the toggle now reads "Our Program" /
"Opponent Scout" throughout.

### 6 — P2: Film Room's filter strip still read as spreadsheet instrumentation

**What was wrong.** Every filter — Offense, Defense, Special Teams, 1st,
2nd, 3rd, 4th, Run, Pass, TD, TO, Penalty, Untagged — carried an identical
1px border, so the row read as one continuous strip of equally-weighted
boxes with the selected filter distinguished only by a thin gold underline
easy to miss among twelve near-identical neighbors.

**The fix.** Inactive filters now carry no border and no fill at all — they
are plain, spaced text labels a coach scans and clicks. The active filter
gets a real, solid gold fill (`background:var(--gi-bd-gold)`,
`color:var(--gi-bd-gold-ink)`) matching every other active-state treatment on
this surface, so it visibly pops rather than blending into a row of
identical boxes.

**Verified.** Opened the Film Room captures: "Offense" (the active filter) is
a solid gold pill; every other filter is unbordered text, clearly readable as
a filter row rather than a table of controls.

### 7 — P2: the 1440 play strip was overbuilt

**What was wrong.** Nine framed, bordered, filled cards side by side created
a second dense visual band beneath the theater — every play got the same
visual weight regardless of whether it was the selected play, an ordinary
play, a score, or a turnover.

**The fix.** An ordinary play now has no card at all — no border, no fill —
relying on its existing color-coded left accent bar and a thin separator
hairline between chips instead of a full box. Three things still get real
visual weight, on purpose: the currently selected play keeps its filled
background; a scoring or turnover play now gets a real outlined card in its
own semantic color (gold for a score, red for a turnover) even at rest, since
those are the two situations worth spotting while scanning the strip. The
same emphasis was added to the wide-screen sidebar's play rows for
consistency, since both are explicitly documented as two responsive
placements of the same component.

**Verified.** Opened the 1440 captures: ordinary plays (44, 45, 46, 48, 50,
51) show only their accent bar and a hairline separator; the interception
(49) and the sack (52) both carry visible outlined emphasis; the selected
play (47) keeps its distinct filled background. The band reads as much
quieter and more scannable than the prior round's nine identical cards.

## Honest residual, updated — not closed, improved and re-disclosed

**The 1280×720 film margin is smaller than last round but still above the
~32px target: 51–52px, down from 62–63px.** The mechanism named by the review
(collapsing five transport tools) was built, extended to actually spend the
recovered space on stage height (not just width, which is what it would have
done if implemented literally), and the result is a real, measured
improvement — but not full closure.

**Why the remaining gap is structural, not neglect.** At 561px of available
theater-column height, a full 16:9 picture would need 998px of width — far
more than the 880px-wide column has — so film at this specific viewport is
genuinely height-bound, and every pixel spent on the 2px accent border, the
chyron, the (now-shrunk) transport row, and the actions row is a pixel the
video does not get. This round already tightened every one of those rows to
what appears to be their legible floor: the transport row to the bare
30px-control-plus-4px-padding minimum, the chyron by removing its
tallest-cell-forces-every-cell-taller effect, the stage padding to 2px.

**What would close the remaining gap, and why it isn't done here.** The
actions row (Mark Start / Mark End / Copy Last / Autoplay / Clear Tags /
Delete Play, 37px) is the one row this pass did not touch, because every
control in it was explicitly named as required to stay visible at all times.
Merging it with the transport-main row was considered and rejected: measured
against the row's real content width at 1280, combining the two clusters
would very likely force a two-line wrap most of the time at exactly this
width, which risks costing as much height as it would save — a genuine
regression risk this pass chose not to take without being asked to. If
1280×720 needs to hit the literal 32px target rather than the now-substantially-narrower
gap, the next lever is a deliberate decision about that row specifically, not
a further pixel-shaving pass on rows already at their floor.

## Visual inspection

Every one of the 16 required captures, plus the diagnostic, was opened and
inspected directly against the review's own checklist and against all
twenty-one findings across three rounds, by name. All twenty are closed and
re-verified by direct visual inspection, not by measurement alone, with one
honestly disclosed and now-measurably-improved residual (the 1280×720 film
margin, above) rather than a false claim of full compliance. The automated
checks (zero page overflow, zero command clipping, zero sticky-bar overlap,
scroll-top-at-capture, the film-room detail-card containment measurement,
and the measured film rectangle) are supporting evidence, per the standing
instruction that measurements passing does not by itself make a weak or
dishonest result acceptable.

## Round 4 findings, closed

Round 4's verdict was explicitly narrow: one color correction and two
interaction-state captures, not another broad redesign round, with the 1280
film margin from round 3 explicitly closed off from further pixel-chasing.
That scope is respected below. One further item (finding 3) was surfaced by
directly inspecting the new captures rather than only checking the two named
asks, and closed in the same pass since it sits in the exact region round 4
was already reviewing.

**Process note.** From this pass forward, every region gets checked against
six criteria, not just "does it satisfy the literal finding": redundant
labels or explanatory text; unnecessary vertical stacking; excessive padding
and dead space; clipped baselines, descenders, borders, and focus states;
whether the same information fits in fewer lines; and whether a control
reads as *intentionally composed*, not merely *contained*. Finding 3 below,
and the disclosed Plays-browser scroll affordance in finding 2, were both
surfaced by applying this standard directly to the new evidence rather than
only checking the two things the verdict named.

### 1 — P1: the hazy blue text was still present

**What was wrong.** `--gi-bd-copy` (`#9daab7`, round 3's "genuinely
lower-saturation" choice) still carried a real ~15% cool cast. Round 3 had
disclosed this as a residual rather than claiming it closed, precisely
because the token is a shared production value, not comp-local; round 4's
verdict removed that ambiguity directly: "Replace it with a genuinely
neutral operational gray in the shared design system."

**The fix.** `design-system/tokens.css`'s `--gi-bd-copy` is changed at the
source from `#9daab7` to `#a6a6a6` — a true neutral (R=G=B=166, zero cast at
any lightness), with an inline comment recording why (flagged across two
review rounds, fixed at the token rather than worked around locally). This is
the one production file this checkpoint touches outside the comp itself, and
it is touched only because round 4 explicitly authorized it after round 3
explicitly declined to on its own judgment.

**Cross-checked on a real, already-shipped production screen — not just this
comp.** `capture-reports-check.mjs` (new, standalone, not part of the comp's
own capture pipeline) drives the actual running GridIron IQ app at its real
dev-server origin: creates a throwaway team through the app's own onboarding
form, opens its built-in synthetic sample season, and opens the real Reports
Overview screen — the exact screen `--gi-bd-copy` already ships on, via
`.gi-scorebug-team span`, `.gi-scorebug-story>span`, and the `--bd-ink-2`
alias in `css/native-reports.css`. Result:
`{"staleBlueGrayPresent":false,"resolvedBdCopy":"#a6a6a6"}` — the exact old
blue-gray RGB triplet is confirmed absent anywhere on the rendered page, and
the resolved token is exactly the new neutral, with zero changes to that
screen's own code. Screenshot: `reports-consistency-check-1440x900.png`.

**Disclosed, not touched.** `--gi-11` (`#93a9c1`, "text secondary") remains a
genuine blue-gray elsewhere in the app's own shell chrome, outside this
route. Round 3 already swept every use of it OUT of this comp specifically;
recoloring `--gi-11` itself at the source is a separate, broader token
decision this checkpoint's scope does not cover.

### 2 — P2: two new interaction states, captured open — and a second defect self-caught while proving it

**What was asked.** Capture the round-3 transport-overflow menu ("⋯" at
1280) and the compact Plays browser both genuinely OPEN, since "a closed
trigger proves very little" and "both can obscure important content if
composed poorly." Both are now captured:
`1280x720-transport-more-open.png`, `1280x720-plays-browser-open.png`. The
automated check asserts neither open panel's bounding box overlaps the video
stage; both pass.

**A second defect, found only by actually opening the panel, not by the
video-overlap check.** Round 3's fix moved the transport-overflow panel from
opening UPWARD (into the video) to opening LEFTWARD via `position:absolute;
right:100%` — which cleared the video-overlap check, but the panel was still
out of normal document flow, so it painted its own opaque background
directly on top of whatever content already occupied that space: the clip's
total-duration readout (`0:19`) and the tail of the scrub track, both real,
useful controls in the same row. The video-overlap check could not see
this — it only ever asked "does the panel's box touch the element with
`id="stage"`", with no concept of "does it cover a sibling control instead."

**Root-caused and fixed at the source, not patched around.** The panel is
now a genuine in-flow flex sibling of its trigger (`order:-1` keeps it
reading to the trigger's visual left, matching the original decision)
instead of an absolutely-positioned overlay. Opening it now makes
`.gi-theater-transport-main` — itself `flex:1 1 auto`, with the scrub
track's own `flex:1;min-width:80px` — genuinely shrink to make room, the
same graceful-reflow contract this row's own `flex-wrap:wrap` already
promises everywhere else in this comp (the same principle round 3's own
comment on this row already stated in general — "wrapping costs a few pixels
of theater height, never a clipped or invisible control" — just not yet
applied to this one sub-component). Nothing is hidden now: the duration
readout and the full scrub track both stay visible and usable while the menu
is open.

**The check itself was strengthened, not just the CSS.** `capture.mjs` now
also asserts that neither open panel overlaps its own row's sibling controls
(`.gi-theater-time`, `.gi-theater-scrub`) — not just the video stage — and
this new check is mutation-verified: deliberately reintroducing the old
`position:absolute;right:100%` rule reproduces `overlapsSibling:true` on
`.gi-theater-scrub` exactly, confirming the check is load-bearing rather
than decorative before trusting it.

**Disclosed, not fixed.** Opening the Plays browser at 1280 shows a
genuinely scrollable list (67 plays, ~13 visible at once) whose last visible
row is cut off mid-row at the panel's own bottom edge, with no scrollbar,
fade, or "N more" affordance signaling more content sits below. This is a
real, if minor, composition gap under the same "intentionally composed, not
merely contained" standard — flagged here rather than silently fixed, since
it belongs to a different control than anything named by this round's ask,
and touching it would broaden this checkpoint past the "one color
correction, two state captures" scope the verdict explicitly set.

### 3 — the play-identity header: a redundant label and uneven spacing

**What was wrong.** The charting deck's header read "Charting / Play 47 /
47 of 67 tagged." "Charting" restated a fact already obvious from context —
the coach is looking at the charting deck, and the row's own gold/cyan
border already signals unit context — and carried no information of its
own. The three-line stack also produced two visually UNEVEN gaps (label→
title, title→subtitle), because an eyebrow label, a display-weight title,
and a plain caption have different line-heights, so numerically equal CSS
margins do not read as equal visual spacing between them. The row's fixed
50px height had also been sized for three lines; removing the label alone
would have left the remaining two lines floating in newly loose, unintended
padding rather than actually tightening the header.

**The fix.** "Charting" is removed from all four states that carried it
(offense, defense, and special-teams chart, plus the no-film state). The
remaining two lines (`Play N` / `N of M tagged`) now carry one deliberate,
minimal gap instead of two uneven ones. The row itself drops from 50px to
44px — the same compact-header height this comp already uses everywhere
else (`.gi-film-room-head`, the top toolbar), so this isn't a new number
invented for one row, it's this comp's own existing convention finally
applied to the one place that had drifted from it.

**Verified.** Cropped the live header at 2× scale after the fix: the row now
reads as a tight, intentional two-line identity block beside the properly-
proportioned unit switch, with no dead vertical space above or below it. All
16 required captures were regenerated against the fixed CSS and re-passed
every existing automated check (zero overflow, zero clipped commands, zero
sticky-bar overlap, zero non-zero scroll-top) with no regression.

**Disclosed, not touched.** The "PLAYS" eyebrow above the Plays-browser
list, and the identical "Plays" eyebrow on the always-visible wide-desktop
play rail (`.gi-rail-head`), sit in the same rhetorical family as the
removed "Charting" — a category label next to a count sentence that already
names the category ("67 plays · grouped by drive"). This is NOT changed
here: unlike "Charting," it is an already-reviewed, twice-used component
pattern (the same markup shape appears in both the docked rail and its
popover form), and unilaterally rewriting an already-accepted, consistently-
applied pattern is exactly the kind of scope growth round 4's verdict warned
against. Flagged for the reviewer's own call, not silently changed.

## Round 5 findings, closed

Round 5's verdict named six required repairs, none of them a broad redesign:
finish the Plays browser's close/scroll/focus contract that round 4 finding 2
had explicitly disclosed as out of scope; compact the Special Teams
possession-spot/yard-line row; fix Film Room's 1280px playback/action
composition specifically (not Chart mode's, which round 3 already fixed);
make the three sample states (offense/defense/special-teams) internally
consistent instead of independently hardcoded; recompose Players & Grades so
Passer/Receiver share a baseline and an expanded roster never distorts its
neighbor; and stop the prototype settings gear from sitting on top of the
app's real "More" button in review captures. A live mid-review request
arrived alongside these six — equal Chart/Film Room mode-switch widths — and
is closed in the same batch since it touches the same header region finding
4 was already reviewing. Every fix below was verified by rendering the
affected state and opening the resulting screenshot, per the round's own
instruction that passing geometry checks does not by itself establish visual
quality; several exact numbers (control widths, alignment booleans, crop
coordinates) come from small purpose-built Puppeteer probes run against the
live comp, not from reading the CSS.

### 1 — the Plays browser's close/scroll/focus contract

**What was wrong.** Round 4 finding 2 had explicitly disclosed this as
out of scope: the panel had no visible close control, no Escape handling, no
focus-return contract, and no signal that its 67-play list was scrollable
beyond whatever happened to fit. Relying on the trigger button (now hidden
under the open panel) or an undisclosed scrim click is not a real close
affordance.

**The fix.** `.gi-rail-close` is a real, always-visible ✕ icon button
(`aria-label="Close plays browser"`) inside `.gi-rail-head`, which is now
`justify-content:space-between` so the label and the close control sit at
opposite ends of one pinned row — pinned because the header is its own `auto`
grid row, with only `.gi-rail-scroll` beneath it scrolling, so the close
control stays reachable no matter how far the list is scrolled. `setPlaysOpen
(open, opts)` is now the single owner of the whole open/close lifecycle:
opening moves focus to the close button; every dismissal path — the close
button, Escape (a document-level `keydown` listener gated on the panel
actually being open), and the existing scrim click — returns focus to the
trigger that opened it, except the render-time reset (`setPlaysOpen(false, {
silent: true })`), which passes `{ silent: true }` specifically so a fresh
`render()` call cannot steal focus the coach never gave it in the first
place. A genuine `::-webkit-scrollbar` rule set (track, thumb, hover state,
matching the comp's own token palette) was added to `.gi-rail-scroll`.

**Verified.** `1280x720-plays-browser-open.png`: the ✕ sits at the header's
right edge with a visible keyboard-focus ring around it (confirming focus
landed there, not just that the button exists), the header stays visible
while later rows (up to 51) run off the bottom of the panel, and the panel
overlays the charting deck's own column — not the film, which remains fully
visible and undimmed at all times. `1920x1080-offense-chart.png`'s taller
viewport fits the full 12-row fixture without needing to scroll at all, which
is the correct behavior at that height, not a sign the scroll wiring is
unused.

**Disclosed limitation, not a defect left unfixed.** The `::-webkit-scrollbar`
rules do not render a visible thumb in this specific headless Chromium
capture environment — confirmed with an isolated minimal test page
(`<div style="overflow-y:auto">` with the identical scrollbar CSS still
measured `offsetWidth === clientWidth`, i.e. no reserved scrollbar gutter at
all, in this harness). The CSS is standard, ordinary Chromium behavior, and
matches this comp's own established pattern elsewhere; there is no reason to
expect it will fail to render in the coach's actual Windows/Chrome
environment. This is a capture-environment constraint being disclosed
honestly, not a claim of visual proof the evidence doesn't support.

### 2 — Special Teams' compact possession-spot/yard-line row

**What was wrong.** "Possession spot" (an Own/Opp chip pair) and "Yard line"
(a two-digit number) were two full-width stacked rows — the chips on their
own row, then a full-width `.gi-tag-input` spanning the entire group body (a
single-column grid) to hold one two-digit number in a control the width of
the whole charting deck.

**The fix.** Reuses the exact compact pairing Situation's own field-position
row already established (`.gi-tag-situation-row.is-field`'s second half) —
one row, a flexible chip field beside a fixed-width numeric input matching
`.gi-tag-input-yardLine`'s existing 66px floor — instead of inventing a new
size: `.gi-tag-situation-row.is-special{grid-template-columns:minmax(0,1fr)
66px}`. The freed row height required no repositioning elsewhere: removing
one full row moves every field below it up by exactly that row's height
automatically, since the group body is an ordinary flow layout.

**A second, real defect found only by reading the rendered result, not by
reading the CSS.** The compacted row initially kept its original hardcoded
state — "Own" active, Yard line "12" — while the result text immediately
above it in the deck read "Downed at Opp 12." A possession spot of "Own"
beside a yard line of 12 contradicts a result of "Downed at **Opp** 12" — the
same class of fixture-inconsistency defect finding 4 was built to close,
just inside the one control finding 2 had just touched. Per the round's own
instruction ("if inspection exposes a small defect in the same affected
control, fix it rather than calling it out of scope"), this was fixed in the
same pass rather than disclosed as a separate item: the active chip is now
"Opp," matching "Downed at Opp 12."

**Verified.** `special-teams-possession-row-1280x720.png` (a targeted crop,
`{"x":887,"y":354,"width":389,"height":68}`, scrolled into view first since
the row sits below the fold at 1280×720 and `position:sticky` elements paint
at their current screen coordinates regardless of scroll position — a
crop taken before scrolling captured the sticky commit bar instead, caught
and fixed while building this exact capture) shows "Opp" active beside "Yard
line 12" on one row, both controls at the compact size Situation already
established.

### 3 — Film Room's 1280px playback/action composition

**What was wrong.** The generic overflow-collapse rule that fixed Chart
mode's transport row (round 3) is scoped by viewport width alone
(`@media (max-width:1300px)`), but Film Room's theater column is a FIXED
fraction of the viewport (`minmax(440px,36%)`), not the flexible column
Chart mode uses — so at the same viewport width Film Room's column is much
narrower. Measured directly, not assumed: Film Room's own column is 461px at
1280px viewport width and 518px at 1440px, against roughly 880px and 940px
for Chart's column at those same widths. Two real defects followed from
sharing the unscoped rule with a column that narrow: at exactly 1280px,
Chart's own 1300px collapse threshold already applies, but the collapsed row
still didn't fit — the primary transport controls plus both time readouts
plus the scrub track alone consumed the column's full width, so the "..."
overflow trigger wrapped onto its own second line with nothing else on it, an
entire row spent on one 36px button; at 1440px, Chart's threshold hadn't
engaged yet, so Film Room showed the full five-tool cluster inline, which
also didn't fit and wrapped onto its own mostly-empty second line.

**Root cause of the fit failure, confirmed by measurement, not inferred from
the CSS.** An unconstrained `<input type="range">` (the scrub track) renders
at its own ~129px intrinsic preferred width for flex hypothetical-sizing
purposes regardless of any `min-width` set on it — confirmed with a forced,
shrink-disabled measurement before writing the fix, the same CSS
min-content-floor quirk that separately affected the Chart/Film Room
mode-switch buttons (see the mid-review fix below). That intrinsic width is
what pushed the row past the space the "..." trigger needed to share it.

**The fix.** One new rule, scoped to `[data-mode="film-room"]` so Chart
mode's already-accepted 1280/1440 layouts are untouched: the compact overflow
trigger now engages up to 1500px for Film Room specifically (covering both
1280 and 1440 while leaving 1920 alone), and the scrub track gets a genuine
fixed floor (`flex:0 1 104px;min-width:60px`) instead of an ambient browser
default. `.gi-theater-transport-main` is prevented from consuming the
column's outer flex-grow share, so any leftover width settles as ordinary
trailing space after the trigger rather than as dead space swallowed in the
middle of the row. A second, related defect in the same region: the actions
row's Clear Tags/Delete Play group used `margin-left:auto` to sit flush right
— correct when all three action groups fit on one line (Film Room at 1920
still has room and is left untouched), but below 1500px the group wraps onto
its own line, where the stale auto-margin pushed it flush against the row's
right edge, leaving a large, meaningless blank gap on an otherwise
near-empty second line. Removing the auto-margin at this width lets it wrap
in normal left-to-right flow: two clean, left-aligned rows instead of one
deliberate row and one orphaned, right-shoved one.

**Verified.** `1280x720-film-room.png` (overflow closed) and
`1280x720-film-room-transport-more-open.png` (overflow open) were both
opened directly, at the required states. Closed: the primary transport
controls, both time readouts, and the scrub track all fit on one line with
the "..." trigger beside them, no orphaned second line. Open: a horizontal
icon row (loop, speed, draw, columns, expand) appears cleanly below the
primary controls, matching the same in-flow panel behavior finding 2 of
round 4 established for Chart mode, with the automated sibling-overlap check
(added in round 4) confirming it. The automated report table (film-room
detail-card containment, command containment, sticky-bar overlap) shows zero
clipping and zero overlap at all three required Film Room viewports.

### 4 — cross-region sample-state consistency, via one shared fixture

**What was wrong.** The offense, defense, and special-teams sample states
each hardcoded their own play identity, situation, call, and result
independently across the chyron (below the film), the deck (the charting
form), and the play-strip/rail (the play list). They disagreed: Defense's
editor showed Play 52, 3rd & 7, while the strip beneath the film showed Play
47, 2nd & 12, Gain +6 — an offense play's identity under a defense deck.
Special Teams showed Middle hash in the form but Right beneath the film.

**The fix.** One `PLAY_FIXTURES` object is now the single source of truth for
per-unit sample-play identity (`offense`/`defense`/`special`, each carrying
id, down & distance, ball spot, hash, the call/look labels and values, and
the result text/tone), consumed by a single `chyronHtml(unit)` function that
every chart-mode render call reads from — there is no second, independently
maintained copy of this information anywhere in the render path. A companion
`CURRENT_ID_BY_UNIT` map (`{offense:47, defense:52, special:61}`) drives which
play the rail/strip highlights as "current" for each unit, computed per
render rather than baked into a static `p.current` flag on one fixture play —
closing a second bug in the same mechanism: the highlighted play previously
never updated when the coach switched units, so switching to Defense or
Special Teams kept Play 47 (offense) highlighted underneath a completely
different selected play. A new fixture entry (`n:61`, "Drive 10 — 4th Qtr ·
Special Teams", 4th & 8, Punt, Downed) was added to the rail's play list so
the Special Teams state has a real play to highlight at all — it previously
had none, since the rail's list only ran up to play 52.

**Verified.** All three chart-mode states were opened and cross-checked
field-by-field against `PLAY_FIXTURES`: `1920x1080-offense-chart.png` and
`1440x900-offense-chart.png` show Play 47, 2nd & 12, Own 38, Right hash,
"Trips Right Stick Draw" vs. "4-2-5 Nickel · Cover 3 Zone," Gain +6 —
identical between the deck's Situation/Play Call fields and the chyron/strip
below the film. `1280x720-defense-chart.png` shows Play 52, 3rd & 7, Opp 46,
Right hash, "Zone Blitz Fire X · Cover 1" against "Empty · Shotgun · 00
Personnel," Sack: -8 — matching the deck's active Front/Coverage/Family/
Blitz chips and Formation/QB Alignment/Personnel chips exactly.
`1440x900-special-teams-chart.png` shows Play 61, 4th & 8, Own 41, Middle
hash, "Punt · Downed," matching the deck's Unit=Punt/Outcome=Downed
selection and the corrected (finding 2) "Downed at Opp 12" result.

### 5 — Players & Grades recomposition

**What was wrong.** Passer and Receiver's labels did not share a baseline,
jersey inputs and grade selectors were inconsistently sized between roles,
and an expanded roster on one role visibly distorted its neighbor's controls
rather than growing downward in isolation. Only whichever role happened to
start expanded had a quick-pick grid in the markup at all — a role that
started collapsed had nothing to reveal even if a toggle existed.

**Root cause of the distortion, confirmed by direct measurement before
fixing.** `.gi-tag-players` (the two-role grid) left `align-items` at its
CSS Grid default of `stretch`, so a role card without an open roster (shorter
natural content) was force-stretched to match its taller, roster-expanded
sibling's height. That alone would have been invisible, since the card's own
border/background is already transparent at rest — except each card's own
inner grid also defaults its block-axis content alignment to `normal`, which
computes to `stretch` for grid content: with extra height to fill and no
explicit row sizing, the shorter card's label/input/select/toggle rows were
each stretched taller too, inflating a plain jersey-number input into a
visibly distorted box. Measured directly before the fix: "Receiver" rendered
at 33px tall next to "Passer"'s correctly-sized 15px label, purely from this
coupling — not from any difference in the two roles' own content.

**The fix.** `align-items:start` on the outer `.gi-tag-players` grid removes
the coupling entirely: each role card sizes to its own natural content, an
expanded roster grows only that card downward, and its neighbor never
stretches. Every role now carries its own `.gi-player-quick` grid in the
markup with a genuine `data-roster="open"|"closed"` state and a working
delegated click handler (`.gi-player-roster-toggle`, delegated on `document`
since the deck's innerHTML is replaced wholesale on every render), so a
"both expanded" state is genuinely reachable rather than merely implied by
two independent screenshots. Passer/Receiver, Tackler(s)/Takeaway, and
Kicker/Returner all share the identical card shape, control heights, and
gaps; multi-player entry is preserved for Tackler(s) (a text input holding
`"52, 8"` plus multi-toggle quick-pick chips, matching the existing
multi-tackler contract). Unnecessary enclosing chrome was already removed in
round 4 finding 7 (a passive role card carries no visible border); this pass
did not reopen that decision.

**Verified.** A dedicated `capturePlayers()` probe drove all three required
states — both roster grids collapsed, one expanded, both expanded — and
measured each role card's label `top` and input `top` directly:

| capture | labelsAligned | inputsAligned |
|---|---|---|
| `players-both-collapsed-1440x900.png` | true | true |
| `players-one-expanded-1440x900.png` | true | true |
| `players-both-expanded-1440x900.png` | true | true |

All three states were also opened and inspected directly: in every one, both
roles' labels, jersey inputs, and grade selectors land at identical heights
regardless of which role (if either) has its roster open, and an expanded
roster grows only its own card, visibly unrelated to its neighbor's height.

### 6 — prototype tooling removed from review captures

**What was wrong.** The prototype's own settings gear (`.qa-toggle`) and its
panel (`.qa-bar`) were two separate fixed-position elements. Every capture
hid the panel but never the standalone toggle button, which sat at the exact
top-right corner the real app's own "More ▾" shell button occupies — so every
delivered screenshot showed the prototype gear sitting on top of, or
immediately beside, a real, load-bearing app control.

**The fix.** Both elements are now one wrapper, `.qa-harness`, so a single
`is-hidden` class removes the entire prototype surface at once — there is no
longer a code path that can hide one half and leave the other visible. The
corner itself also moved to bottom-right, so even an un-hidden reviewer
session (someone actually using the switcher, not capturing a screenshot)
never overlaps real shell chrome.

**Verified.** Every one of the 25 regenerated captures was produced with
`.qa-harness.is-hidden` applied before the screenshot, confirmed by the
absence of the gear/panel in every opened image, including the ones that
specifically exercise the top-right region (the More menu, Undo/Redo, the
film-status pill) where the old toggle used to collide.

### Live mid-review request — equal Chart/Film Room mode-switch widths

**What was wrong.** "Chart" and "Film Room" rendered at different widths
(measured before the fix: 71px and 105px respectively) because
`#modeSwitch button` had no explicit sizing and simply auto-sized to its own
text content.

**First attempt, and why it failed.** `flex:1 1 0` (equal flex-grow) was
tried first, on the reasoning that equal grow factors should produce equal
final widths. It did not: this is the identical CSS min-content-floor quirk
diagnosed in finding 3 above (an unconstrained `<input type="range">`'s
intrinsic width overriding its flex-basis) — a flex item's default
`min-width:auto` substitutes its own content-based minimum size as a floor
during flex resolution, and "Film Room" is simply wider text than "Chart," so
equal grow factors still resolved to unequal final widths.

**The actual fix.** `flex:0 0 auto;min-width:90px;text-align:center` —
disabling grow/shrink entirely and setting an explicit shared floor, rather
than relying on flex distribution to equalize two children with different
intrinsic content widths.

**Verified.** A dedicated probe measured both buttons' rendered
`getBoundingClientRect()` at all three required viewports:

```
1280x720:  Chart 90×34, Film Room 90×34
1440x900:  Chart 90×34, Film Room 90×34
1920x1080: Chart 90×34, Film Room 90×34
```

Identical width and height at every required viewport.

## Visual inspection, round 5

Every one of the 16 required captures, the round-4 open-panel pair, the
round-4 token cross-check, and all five new round-5 focused captures — 25
files in total — was opened and inspected directly against this round's six
named repairs, the live mid-review request, and the additional
possession-spot inconsistency caught while verifying finding 2. The automated
pipeline (`capture.mjs`) was re-run in full after every fix and reports, on
the final pass: zero page-level horizontal overflow at any of the 16
required states; zero scroll-top drift at capture time (every required
screenshot taken at `scrollTop:0`); zero clipped commands; zero sticky
commit-bar overlap; the Film Room detail card fully contained at all three
viewports; and both alignment checks (Players & Grades label/input rows) true
in every one of the three required states. These automated results are
supporting evidence for what was independently confirmed by opening each
image, not a substitute for it, per the round's own instruction that a
passing check does not by itself establish visual quality.

**Honest residual, carried forward unchanged.** The round 3/round 4 disclosed
1280×720 film-margin residual (51–52px, structurally bound by the theater
column's height rather than neglect — see "Honest residual, updated" above)
was not touched by this round's six repairs and is not claimed closed here;
round 4's verdict already closed it off from further pixel-chasing.
