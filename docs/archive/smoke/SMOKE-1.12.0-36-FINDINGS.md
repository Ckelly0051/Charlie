# Coach smoke — `1.12.0-36`

Local unsigned build from `49c1e48`. Material pass (S6-7) is in; composition
pass is complete on every route except the two legacy stylesheets S7 deletes.

**Protocol: collect the full list first. No repair work starts until the coach
says the list is complete.**

Overall read from the coach on the material pass: *"it's a little better but
still needs more polish. We'll come back to it."* — so S6-7 is a partial answer
to the flatness, not a closed item.

---

## J1 — Scoreboard team names are not spaced or aligned to the table below

**Coach, verbatim:** "The team names and score is still not properly spaced. The
two team names should stay entirely within the width of the scoreboard cells
below and should be centered between them."

**Required behavior:**
* Each team name stays **entirely inside the width of its own column** in the
  quarter table beneath it — no overhang.
* The two names are **centered** within that width.

Observed on the Reports Overview scoreboard: `MAVERICKS` and
`HOLY FAMILY WILDCATS` are laid out independently of the quarter table, so the
long name runs wider than the cells below it and neither name lines up with the
column it belongs to. The score numerals sit under the names rather than
sharing their alignment.

Owner: `StatsEngine._renderScoreboard`; the surrounding layout rules live in
`css/native-reports.css`. Note when fixing that G13 already moved this block's
FINAL column once — check the existing rules before adding new ones.

**Status:** OPEN. Logged, not fixed.

---

## J2 — Full-screen judder: PRE-EXISTING, and appears FIXED in `1.12.0-36`

**Coach, first report:** "video playback gets very choppy - unwatchable - at
full screen. It's a nasty jutter that is probably a code issue."

**Coach, immediately after:** "no. this was an issue before the latest release.
Actually - oddly, it seems to be fixed in the latest release. It was an issue
before but isn't now. If video playback can be improved let's do it but the
stutter is gone now."

**Correction, recorded because the wrong version of this was written first.**
I logged this as new in `-36` and named my own `--gi-raise-film` box-shadow as
the leading suspect. Wrong on both counts: the judder predates the material
pass and is gone in the build that added it. The bisect I proposed was the right
instinct and the coach ran it before I did.

**What that means, and it is worth keeping rather than closing quietly:**
something in `-36` plausibly *helped*, and nobody knows what. The material pass
put a shadow on the video container, which forces that element onto its own
compositor layer — a known way to stop a video repainting with the page behind
it. That is a guess, not a finding. Do not write it down as the cause without
measuring it.

**Status:** NOT REPRODUCIBLE on `-36`. Downgraded from blocker to an
optimization item. If playback work happens anyway, the leads below are still
the right ones.

### Remaining leads for playback quality

1. **The one-pixel shortfall, already recorded.** CLAUDE.md's UX-1 block:
   full screen measures **1920 x 1079**, not 1080. A one-pixel shortfall forces
   a fractional resample of every frame, and it is already flagged there as
   "the highest-value remaining UX-1 fix". A per-frame rescale at 4K is a
   plausible mechanism for exactly this symptom.

2. **The drawing canvas.** `CanvasOverlay` resizes to device pixels and BETA-007
   already fixed one playback hitch caused by it repainting every tick. Confirm
   it is not repainting a full-DPR canvas per frame at full-screen dimensions.

3. **Restore-point throttling.** BETA-007 defers automatic snapshots during
   playback. Confirm that still holds in the native theater's full-screen path
   — it is throttled on `playing` state, not on route.

### What evidence to capture, if this is picked up

`video.getVideoPlaybackQuality()` (dropped/corrupted frame counts) windowed
before and during full screen, the decoded vs presented size, whether GPU decode
and compositing stay enabled, and a performance profile across the transition.
Measure it; do not reason about it.

---

## J3 — Full screen has NO controls. Only a crosshair, and Esc is the only way out.

**Coach, verbatim:** "There is an issue with full screen - video playback
buttons disappear and all I have is a cross pointer. There's no way to control
video or back out to windowed except by esc. There should be."

Full screen is where a coach actually reads film, and in it he currently cannot
play, pause, step, scrub, seek to the next play, or return to windowed by any
visible means. Esc is an undiscoverable escape hatch, not a control.

**Required:** transport controls and an explicit exit-full-screen control,
reachable while full screen.

**Likely mechanism, to CONFIRM before building anything.** The fullscreen
request targets `#videoContainer` (see the `:fullscreen` rules in
`css/native-breakdown-theater.css`), but the transport lives in
`.gi-theater-transport`, a SIBLING of that container inside
`.gi-breakdown-theater`. Only the fullscreened element and its descendants
render, so every control is excluded by construction. The crosshair the coach
sees fits: the drawing canvas IS a descendant, so it is the one thing that
survives, and it sets a crosshair cursor.

If that holds, the fix is a composition decision, not a CSS patch — either
fullscreen a wrapper that contains the video AND the transport, or mount a
control layer inside the fullscreened element. The first is likely simpler and
keeps one transport implementation; the second risks a second set of controls,
which is the duplicate-owner problem S5 spent a milestone removing.

Whichever way it goes: the drawing canvas must stay pixel-aligned to the video
(the CanvasOverlay contract), and the picture must not lose size to new chrome —
full screen is the only path that gets a 4K source near 1:1.

**Status:** OPEN. Logged, not fixed.

---

## J4 — Roster quick-pick number chips are far too large

**Coach, verbatim:** "These number chips are way too big. Shrink them down so
they're not much bigger than the number itself. Maybe a goal is to get an
additional row of numbers above the scroll, at least."

Seen on the Players & Grades block in the charting deck — the Kicker and
Returner quick-pick grids. Each chip is roughly a full control height for two
characters, so a jersey number carries the footprint of a button, and only
three rows clear the scroll.

**Required:** the chip is sized to its content, not to a control. Target is at
least one more row visible above the scroll boundary in the same space.

Context worth carrying into the fix, from S6-4g: these chips were deliberately
made a capped grid of jersey NUMBERS because they previously rendered as
`#2 Colt Mihailovich` — wider than their own 180px card, so a roster stacked one
per line and ate most of the screen. **Shrinking them must not reintroduce the
name**, and must keep one-click attribution: quick-pick is used on nearly every
defensive snap and must never sit behind a focus step.

Watch the touch-target rule. `--gi-hit` is 30px on desktop because Break Down is
a mouse and keyboard surface, but `@media(pointer:coarse)` raises quick-pick
chips to 44px. A denser desktop chip must not shrink the coarse-pointer case.

Owner: `.gi-player-quick` in `css/native-tagging.css`.

**Status:** OPEN. Logged, not fixed.

---

## J5 — Team home / season library is an unattractive presentation

**Coach, verbatim:** "This screen is really ugly. How does Hudl do this? I
understand it's going to eventually be a list but it's a very unattractive
presentation."

One season renders as a single wide row spanning the full viewport with five
loosely-spaced columns and a large empty area beneath it. It reads as an empty
table rather than as a library. The row treatment was designed for a list and
looks worst at N=1, which is the state a coach sees most often early in a year.

**This one needs a design answer, not a CSS tweak.** Before building: look up
how Hudl actually presents the team/season home, rather than inventing a
layout. The coach asked the question directly and it deserves a researched
answer — the standing rule from the opponent-scout work applies here too.

Points to resolve in that pass:
* What the primary object on this screen is. If games open from Home, a season
  may not deserve a full row at all — it may be a selector.
* How N=1 and N=8 both look right.
* Whether the large empty region below the list should carry something (recent
  film, season summary) or the container should not claim that height.

Owner: `js/native-team-hub.jsx`, `css/native-team-hub.css`.

**Status:** OPEN. Logged, not fixed. Research required before design.

---

## J6 — "Open to check film" is odd language

**Coach, verbatim:** "'open to check film' is odd language. What about 'open to
review season' or something similar."

The film-state column on a season row reads `Open to check film`, which
describes an app action rather than the season's state, and points at film
specifically when the season is the subject.

Coach's suggested direction: `Open to review season`, or similar.

Note this is a STATE label sitting beside a real `Open →` action, so it should
read as a state or a reason, not as a second command competing with the button.

Owner: `js/native-team-hub.jsx`.

**Status:** OPEN. Logged, not fixed.

---

## J7 — The `Open →` arrow points directly at the delete button

**Coach, verbatim:** "Open -> is pointing to the delete season button! That's
not good."

`Open →` sits immediately left of the `×` delete control, so the arrow
literally aims at destroy-the-season. The one affordance whose entire job is to
say "go this way" is aimed at the most destructive control on the screen.

This is a safety finding, not a layout nit: the visual cue and the outcome
disagree, and they disagree in the direction of data loss.

Fix direction is open — drop the arrow, move the delete out of the row's
trailing edge, or separate them — but the arrow must not aim at delete.
See J8: these two are the same problem and should be fixed together.

Owner: `js/native-team-hub.jsx`, `.gi-hub-open-label` / `.gi-hub-delete` in
`css/native-team-hub.css`.

**Status:** OPEN. Logged, not fixed.

---

## J8 — Deleting a season needs a type-to-confirm gate

**Coach, verbatim:** "delete season is a huge potential for data loss. We should
have a confirmation click that requires spelling delete in a text box, in order
to delete from here."

**Required:** deleting a season from Team Hub requires typing `delete` (or the
season name) into a text field before the destructive action is enabled. A
single click plus an OK is not sufficient for this object.

This is the right call and the severity is real: a season is six games and, in
the coach's live data, 440 charted plays. It is the largest destructible object
in the product and it currently sits behind one `×` at the end of a row, next
to an arrow pointing at it (J7).

Constraints to carry into the fix, from the existing overlay contract:
* Destructive overlays already require an explicit Cancel and force Cancel as
  the default and initial focus (the N2 rule, enforced in `_open`). The
  type-to-confirm gate is IN ADDITION to that, not a replacement.
* The existing delete already names game/play impact and distinguishes managed
  copies from linked originals. Keep that — it is the information that makes
  the typed confirmation a real decision rather than a speed bump.
* Whether the same gate belongs on delete-GAME is an open question for the
  coach. Logged here as a question, not assumed.

Owner: `js/team-hub-screen.js` delete flow, `SeasonStore.deleteSeason`.

**Coach follow-up:** "delete game should get the same gate, yes." So the
type-to-confirm applies to BOTH delete-season and delete-game. Note that
delete-game currently has a 30-second undo window with film retention
(`UNDO_FILM_WINDOW_MS`); decide whether the gate replaces that or sits in front
of it. Deleting a SEASON has no such undo — which is part of why it needs the
harder gate.

**Status:** OPEN. Logged, not fixed.

---

# Claude's screen-by-screen pass (`1.12.0-36`)

Coach: *"let's put your eyes to work. I'll post full screens for you to analyze
and look for issues."* Break Down, Study, Reports and Plan at full width, plus
Home from earlier. Findings below are mine unless a coach quote is attached.

Ordered by severity within each screen. **Anything that could make the app
misstate data is listed first** — those are not polish.

---

## J9 — [DATA] Study's PLAYS column and its rates use different denominators

Study, Formation breakdown, current game. Read off the screen:

| Group | PLAYS | Success | Run/Pass | Explosive |
|---|---|---|---|---|
| Ace | 9 | 66.7% | 100% / 0% | 44.4% |
| Power-I | **19** | 70.6% | 82.4% / 17.6% | 29.4% |
| Single Wing | 1 | 100% | 100% / 0% | 0% |

Ace works out against 9: 6/9 = 66.7%, 4/9 = 44.4%. **Power-I does not work out
against 19.** 70.6% is 12/17, 29.4% is 5/17, 82.4% is 14/17. Every Power-I rate
is computed over **17**, while the column beside it says **19**.

So two of the nineteen Power-I snaps have no run/pass classification and are
excluded from the rates but counted in PLAYS. That is defensible arithmetic and
undisclosed presentation: a coach reads 70.6% of 19.

The app already knows about the distinction — the KPI band above says
`27 CLASSIFIED PLAYS` against `29 matching`. It discloses it once at the top and
then not in the table where the numbers actually get read.

**Fix direction:** show the denominator the rate used, or show both counts, or
gate the row. Do not silently change either number.

**Status:** OPEN. Verify my arithmetic against the engine before acting.

---

## J10 — [DATA] "Highest success rate: Single Wing 100%" is a one-snap sample

Same screen. The KPI headline promotes **Single Wing 100%** as the best
formation. The table shows Single Wing has **1 play**.

Minimum sample was set to `Show all`, so the row is honest. The KPI is not: it
picks a winner from an unfiltered set and states it as a headline with no n.

This is the exact class the min-sample gate exists to prevent, appearing in the
one place on the screen that has no gate.

**Fix direction:** the headline respects the minimum sample, or it carries its n
and dims below the gate the way the table rows do.

**Status:** OPEN.

---

## J11 — [DATA] Reports says 67 plays and 27 plays on the same screen

Reports header: *"2025 St. Joseph Mavericks - JV · **67 plays** · every
highlighted row links to film"*.
Game at a Glance, first tile: *"**27** — charted this game"*.

Both are labeled plays, on the same screen, ~350px apart. One is the game's
whole charted set, the other is offensive snaps. Neither says which.

**Status:** OPEN.

---

## J12 — Big Plays lists raw source filenames as the play identity

Reports Overview, BIG PLAYS table. The PLAY column reads `IMG_6258`,
`IMG_6260`, `IMG_6271`… — camera filenames.

A coach does not know a play by its filename. Every other surface in the app
identifies a play by number and situation ("Play 17 · 1st & 10"). This is the
one table that leaks the storage layer into the football layer, and it is a
table of the most important snaps in the game.

**Status:** OPEN.

---

## J13 — Reports dead space moved rather than closed

**Coach:** "Reports still has that dead space we need to fill with content or
re-size to remove."

H14 rebuilt this row as two columns because three equal columns left ~400px
empty. The dead space is now BELOW the Drives panel instead of beside it: the
Efficiency / By Down / Big Plays stack runs taller than Drives, so the left
column has roughly 370px of empty floor under the drive list.

I moved the problem rather than solving it. The rule from G6 still applies —
fill the space or do not claim it — and this is the second time this row has
failed it.

Options: let the left column size to its content instead of matching the
stack's height; move one panel from the stack into the left column beneath
Drives; or make the row a single grid where panels flow rather than two fixed
columns.

**Status:** OPEN.

---

## J14 — Team Summary's TDS and TURNOVERS boxes are enormous for one number each

Reports Overview, TEAM SUMMARY. `TDS 6` and `TURNOVERS 0` each occupy a box
roughly 660 x 105px to display a single digit and a sub-line, side by side with
two donuts that carry far more information in less space.

Same G6 rule as J13, and the two blocks sit in the same screen.

**Status:** OPEN.

---

## J15 — Plan: "PLAN ITEMS0" — label and count are jammed together

Plan route, section heading renders as `PLAN ITEMS0` with no separator. The zero
is the item count appended directly to the label inside the lower-third plate.

**Status:** OPEN.

---

## J16 — Plan: Delete is the only enabled action on an empty plan

Plan route with a new empty plan: `Watch plan · 0`, `Present` and `Export` are
all correctly disabled, and `Delete` is the sole live control on the row.

The only thing a coach can do to a brand-new plan is destroy it. Combined with
J8, this is also the second delete in the product sitting unguarded next to
disabled siblings, where it becomes the only thing the eye lands on.

**Fix direction:** demote Delete on an empty plan, or make the empty state's
action ("Browse Study insights") the live control it points at.

**Status:** OPEN.

---

## J17 — Study's saved-view control is clipped

Study query row, second line: the SAVED VIEW select renders `Choose a sa` —
truncated mid-word. It sits alone on its own row with the rest of the line
empty, so the clipping is not a space constraint.

**Status:** OPEN.

---

## J18 — Break Down: a GRIDIRON IQ watermark is drawn over the film

Top-right of the video, inside the picture: a `GRIDIRON IQ` mark overlays the
film itself.

Flagging on principle rather than taste: the standing rule in this project is
that video is sacred and the app does not paint over source film — it is why we
declined to draw synthetic yard lines and hash marks at S5a. A watermark is the
same class of decision and should be a deliberate one, not a default.

**Status:** OPEN — coach decision, not a defect if intended.

---

## J19 — Break Down: play cards read "Loss: -3"

Play strip cards show `Loss: -3`, `Loss: -1`, `Loss: -4`. The result already
says the play lost yardage and the signed number says it again.

Related history: the separator was changed from `·` to `:` deliberately because
`·` read as a minus sign. Worth confirming this is not the same problem in a
different form — `Loss: -3` now carries two negatives.

**Status:** OPEN — low.

---

## J20 — Break Down: verify the default group expansion for the selected unit

On an OFFENSE play with Offense selected, `OUR OFFENSIVE LOOK` is collapsed to
its caption while `DEFENSE FACED` is fully expanded. The unit model says the
selected unit's group leads and the opposite side collapses to a header.

I cannot tell from a screenshot whether the coach collapsed it manually or
whether the default is inverted. **Verify before changing anything** — this is
persisted per-coach state and "fixing" a deliberate choice would be worse than
the bug.

**Status:** OPEN — verify first.

---

## J21 — Break Down uses a top nav; every other route uses the left rail

Break Down hides the left sidebar and puts Home / Break Down / Study / Reports /
Plan inline in the top bar. Study, Reports and Plan all use the left rail.

This was deliberate — R9 removed the sidebar on Break Down to grow the media
pane from ~756px to ~964px at 1440, and film width is the point of that route.
Recording it as an intentional inconsistency rather than a defect so it is not
"fixed" by someone who does not know why it exists.

Worth a look at whether the top bar can carry the same visual weight as the
rail so the switch feels like the same product.

**Status:** OPEN — by design; confirm it still reads as one app.

---

## J22 — Route headlines are marketing copy, not labels

`FIND THE ANSWER` (Study) and `GAME PLAN` over `TURN FINDINGS INTO ACTION`
(Plan). These are route titles rather than data subheads, so the copy standard
that governs section headings does not strictly apply — but given the standing
direction against flowery language, flagging them for the coach's call rather
than assuming they pass.

**Status:** OPEN — coach decision.

---

## J23 — The OS title bar is stock Windows chrome and looks amateurish

**Coach, verbatim:** "our default color/shading title bar looks very
amateurish. Let's improve it with some themed color/shading."

Visible at the top of every screenshot: the standard Windows caption bar — light
grey, stock minimize / maximize / close, a tiny generic icon and `GridIron IQ` in
system type — sitting directly above an app that is otherwise a dark broadcast
surface. It is the first thing on screen and the only part of the window that
does not belong to the product.

This is a Tauri window-decoration decision, not CSS. The options, and they differ
a lot in cost and risk:

1. **Themed native caption.** Tauri/WebView2 can tint the caption bar and switch
   it to dark mode without giving up native window behavior. Cheapest, lowest
   risk, and it removes the light strip. It does not get us a branded bar.
2. **`decorations: false` + a custom title bar drawn in the app.** Full control:
   the wordmark, the surface ladder, real broadcast chrome. Costs us the native
   caption, so we must reimplement drag, double-click-to-maximize, snap, and the
   minimize/maximize/close controls, and get them right on Windows 11 (including
   snap layouts on the maximize button, which users do miss).
3. **Overlay controls** — keep the system buttons, draw our own bar behind them.
   Middle ground.

Recommendation is to price 1 first, because it may be enough to remove the
"amateurish" read for very little risk, and only go to 2 if the coach wants the
bar to actually carry the brand.

Note for whoever builds this: the app already has a wordmark treatment
(`GRIDIRON IQ` with the blue `IQ`) in the shell and on Break Down, so a custom
bar has a design answer waiting rather than needing one invented.

**Status:** OPEN. Logged, not fixed.


---

# Coach decisions and fixes applied in `1.12.0-37`

| # | Coach decision | Outcome |
|---|---|---|
| J1 | Names inside the cell width, centered | FIXED - halves exactly symmetric (238/44/238), each name centres in its half, board width = table width |
| J4 | Shrink chips, aim for another row | FIXED - 31px/row to 24px/row, 3.1 rows to 4.1 above the scroll. Scoped to fine pointers so the 44px touch target is untouched |
| J9 | Coach: untagged play + an untagged penalty | NOT A DEFECT. Closed. Football question below |
| J10 | Minimum gate, 3-4 plays | FIXED - headline gates at 4 snaps and shows its n; rows and bars still show every group |
| J11 | 67 is accurate, where is 27 from | FIXED - and NO, it was not defense. 27 was OFFENSE only (`stats.totalPlays` = `offPlays.length`). Correctly scoped, mislabeled. Now `Offensive plays / of 67 charted` |
| J12 | Play number and situation | FIXED - `Play 4 . 2nd & 8`; filename moves to the title attribute |
| J13 | fine | FIXED - Big Plays leaves the two-column row for full width; both columns size to content |
| J15 | - | FIXED |
| J17 | - | FIXED - 130px to 319px |
| J18 | Leave it for now | DEFERRED by coach |
| J20 | I collapsed it | NOT A DEFECT. Closed |
| J23 | Tint with one of our colors | FIXED - dark caption plus `--gi-1` (#080c11) window background |
| J6 | - | FIXED - 'Not checked yet' states the season's film state instead of instructing |
| J8 | Delete game gets the same gate | FIXED - type-to-confirm on delete-season AND delete-game |

## Still open

J5 (research first), J7 (the arrow adjacency still needs a layout answer), J14, J16, J19, J21, J22.

## Open football question from J9, for the coach

Plays whose only outcome is a PRE-SNAP penalty have no football result - the
snap never happened. Today they count in PLAYS and are excluded from every
rate, which is the 19-vs-17 gap I first read as a bug.

1. Exclude them from the formation's denominator - the look was never run.
2. Count them as a failure - the call cost a down and field position.
3. Keep them counted but disclosed - what happens today, made visible.

My read is 1 for tendency and success reporting, with penalties counted
separately, because a pre-snap flag says nothing about whether the play works.
Coach's call.
