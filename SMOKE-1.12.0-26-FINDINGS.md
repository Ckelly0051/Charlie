# Coach findings — installed smoke `1.12.0-26` (design pass)

Logged as reported. **No fixes started** until the coach says the list is
complete. H-series to avoid colliding with F (1.12.0-19) and G (1.12.0-24).

---

## H1 — Save & Next is clipped

**Route:** Break Down → charting deck, commit bar
**Severity:** layout, blocking-ish (it is the primary action)
**Reported:** 2026-08-05, with screenshot

The Save & Next button overruns its column: **Skip is cut off at the right
edge** and the bar extends past the deck. Previous / Save & Next / Skip do not
fit the row.

*Same class as G12b — a control sized without room for its neighbours. The
commit bar is now three items where the middle one is greedy.*

---

## H2 — Chart and Film Room are dead inside Film Focus

**Route:** Break Down → Film Focus
**Severity:** defect, workflow
**Reported:** 2026-08-05

Film Focus itself works correctly. But once in it, the **Chart** and **Film
Room** buttons do nothing — the only way back is **Show Charting**.

Coach's requirement: **Chart and Film Room should work from inside Film Focus**,
switching directly rather than forcing a return trip through Show Charting.

*Likely the focus mode suppresses the deck and those two commands only act on a
mounted deck. They should exit focus and land on the requested surface.*

---

## H4 — Export Game Report to PDF does nothing

**Route:** Reports → Export → Game Report (PDF)
**Severity:** defect, silent failure
**Reported:** 2026-08-05

Clicking produces no visible result — no PDF, no error, no toast.

**Possible regression, and it should be checked before anything else on this
list.** `1.12.0-25` rewrote `_renderBigTwelve` into cells and added
`_renderScoutDownDistance` / `_renderShape` to render paths the PDF export also
walks. If any of those throws, an export wrapped in a `try/catch` would swallow
it and produce exactly this symptom — nothing happens.

The gate ran green on `-25`, but `e2e-native-reports` asserts the export ROUTES
to its canonical owner; it does not render the PDF. So a throw inside the
document build is a real blind spot rather than something the gate would have
caught.

**First step when fixing: open the console on this build and click it.** A
silent no-op almost always has a logged error behind it, and guessing before
looking is how the last two sessions lost time.

---

## H5 — Every subhead becomes a precise definition

**Route:** Reports, all tabs
**Severity:** copy, applies everywhere
**Reported:** 2026-08-05. Coach: *"I don't need flowery language but a precise
definition of the stat I'm looking at. Change all of them."*

The captions currently explain the chart's *idea* rather than defining the
*measure*. Examples in the build:

* "Bar length is how often we call it. Fill is how well it works. A long pale
  bar is a call we lean on that is not paying."
* "Every offensive snap by yards gained. Mean 2.9 yards, marked."
* "The same read repeated, so the comparison is spatial rather than four rows of
  numbers."
* "Distance to go against yards gained. Everything above the dashed line
  converted."

**Rewrite rule:** state what the number IS and how it is computed. The rule the
coach cannot see is the thing worth printing — the same standard set for G5.
Success rate says the down thresholds; explosive says 12+ run / 16+ pass. Drop
the framing sentence about why the chart is shaped that way.

**This overlaps G5 and they should be written together.** G5 put those
definitions in tooltips; H5 says the subhead itself should carry the definition.
Where a subhead states it, the tooltip is redundant — decide per term rather
than shipping both.

---

## H6 — Radar axis labels are clipped

**Route:** Reports → Offense → This game against our best
**Severity:** defect, mine
**Reported:** 2026-08-05, with screenshot

Three of five spoke labels are cut off by the SVG viewBox: `:ity`
(Ball security), `Exp:` (Explosiveness), `ards / play` (Yards / play). The
labels are placed at `r + 11` inside a 100-unit box with no margin reserved for
them.

**My defect, introduced with F12c in `1.12.0-25`.** Fix is the viewBox, not the
label text.

---

## H7 — Predictability Map header still clipped

**Route:** Reports → Self-Scout → Predictability Map
**Severity:** defect, regression of G7
**Reported:** 2026-08-05, with screenshot

The per-column summary line (`43% · 2.4y`, `60% · 5.2y`) still overlaps the
boundary between the header row and the first formation row. **The G7 fix in
`1.12.0-25` did not work** — I targeted `.ss-matrix .ss-matrix-sum`, which is
evidently not the real class.

Do not guess a second selector. Read the rendered markup first.

---

## H8 — Chart sizing: Cumulative EPA and the field heat map

**Route:** Reports → Offense (EPA), Reports → Heat Maps → Field Position
**Severity:** sizing
**Reported:** 2026-08-05, coach asked directly whether these are sized right

**No.** The Cumulative EPA line takes an entire viewport for what is a
trend-shape read — the same G10 complaint that shrank the yardage spray, on a
chart I did not touch. The Field Position heat map has the same problem.

Both are shapes, not workspaces. Cap them like the F12 visuals were capped.

---

## H9 — The lower-third is applied inconsistently (Claude's observation)

Only `h3` section headings got the plate. Sub-section headings render as plain
uppercase text, so one page carries two heading treatments:

* **Plated:** VISUALIZATIONS, BY QUARTER, EXPECTED POINTS, HEAT MAPS,
  SITUATIONAL, PERSONNEL GROUPINGS, BY DOWN, FORMATION TENDENCIES, THE BIG 11…
* **Not plated:** PLAY DIRECTION, MOTION, PLAY TYPE, FORMATION, PERSONNEL,
  BACKFIELD, STRENGTH, SUCCESS BY FIELD ZONE, YARDAGE SPRAY, TOP 5 EPA PLAYS,
  Cumulative EPA

Either the plate marks a section and sub-heads use a quieter treatment
deliberately, or the sweep is incomplete. Right now it reads as incomplete
rather than as a hierarchy.

---

## H10 — The radar renders full-viewport

**Route:** Reports → Offense → This game against our best
**Severity:** defect, mine, introduced in `1.12.0-27`
**Reported:** 2026-08-05, with screenshot

The team profile radar fills the entire viewport with 38px labels.

**Cause, and it is the same failure I had just claimed to fix structurally.**
The H8 batch added a generic `.gi-reports .stats-section svg{max-width:100%}` at
the END of the stylesheet. That is **equal specificity** to
`.gi-reports .gi-radar svg{max-width:340px}` and comes later, so it overrode the
cap. I fixed source-order-loss as a class and then reintroduced it with the very
rule I added to fix it.

**The lesson is not "move rules to the end."** It is that a generic rule placed
last silently defeats every specific one before it. A catch-all belongs BEFORE
the specific rules, not after.

*A one-line cap is already in the working tree and will ride with the next
batch — not shipped or verified as its own build.*

---

## H11 — The subhead rewrite covered four captions, not all of them

**Route:** Reports, all tabs
**Severity:** incomplete work
**Reported:** 2026-08-05

H5 said **change all of them**. `1.12.0-27` changed **four** — the captions
inside `_renderShape`. Everything else still carries the old framing voice:

* the legend row under the frequency bars — "Bar length = how often · Fill =
  success rate · Faded = under 3 snaps"
* the Big 13 intro — "Find these and you've found the offense."
* the tendency-matrix disclosure line
* "Top 8 of 9 by EPA/play"
* the scatter footnote — "Each dot is a play — field position vs yards gained"
* the field-zone, by-quarter, EPA, heat-map and self-scout captions
* every caption on Defense, Special Teams, Players, Season and Matchup

**Do this as one sweep over every caption string in the Reports render paths,
not per section.** Doing a section at a time is what produced this.

### The standard, sharpened (coach, 2026-08-05)

**"We need to be literal in our definition of the data."**

My `-27` rewrites are still prose — closer, but they narrate. Literal means
naming the quantity and the rule, nothing else:

| Instead of | Write |
|---|---|
| "Offensive snaps grouped by yards gained. Loss is any play under 0 yards; the gold line marks the mean of 2.9 yards." | "Yards gained per offensive snap. Loss = yardage below 0. Gold line = mean, 2.9 yards." |
| "Bar length is how often we call it. Fill is how well it works." | "Bar length = share of snaps. Fill = success rate." |
| "Each dot is one snap: distance to go on the horizontal, yards gained on the vertical." | "X = distance to go. Y = yards gained. Dashed line = yards gained equals distance to go." |

Define the axis, the unit, and the threshold. Drop every clause explaining why
the chart is shaped that way.

---

## H12 — Caption text is clipped at the container edge

**Route:** Reports → Offense → Where the gains sit (and likely every caption)
**Severity:** layout
**Reported:** 2026-08-05, with screenshot

The caption runs past its container and is cut mid-sentence rather than
wrapping. Longer definition text (H5/H11) makes this worse, so the wrap fix has
to land WITH the copy rewrite, not after it.

*Probably `white-space:nowrap` inherited from the table rules, or a caption
sitting inside an `overflow-x:auto` container. Read the computed style before
picking a fix — three guesses have already cost a build each.*

---

## H13 — Scoreboard final-score column reads badly right-justified

**Route:** Reports → any tab → Scoreboard
**Severity:** design
**Reported:** 2026-08-05, with screenshot. Coach: *"Even centered would be
better."*

The quarter table's FINAL column is right-justified like the quarter columns, so
the total does not read as a total — it sits flush with Q4 and the spacing looks
odd.

Coach's floor is centered; that is a floor, not the target. A final score is a
different KIND of number from a quarter score, and the design system already has
the vocabulary to say so — condensed at a larger size, its own column rule, or
the surface treatment the big score above it uses. Make it read as the sum of
the row rather than as one more cell in it.

*Note for fix time: `.gi-reports th,.gi-reports td{text-align:right}` sets this
globally with `:first-child` left-aligned. Any change is a scoped rule, not an
edit to that base — it governs every table in Reports.*

---

## H14 — Dead space beside Efficiency and Big Plays

**Route:** Reports → Offense (Efficiency / Drives / Big Plays row)
**Severity:** design, structural
**Reported:** 2026-08-05. Coach: *"Do we really not have anything we can put
here?"*

Three columns are locked to the height of the tallest. Drives runs ~700px;
Efficiency ends at ~290px and Big Plays at ~200px with one row, so roughly
**400px of empty column** sits under each. Same sin as G6 on a bigger scale —
this is a whole panel of nothing, not a half-filled bar.

**The answer to his question is yes, there is plenty.** The engine already
computes, and this tab does not show near the top:

* **success rate by down** — computed (`_downMultiples`), currently far below
* **the yardage distribution** — computed, currently far below
* **field-zone success** — computed, currently far below
* **the negative-plays breakdown** — computed at G14, currently only on Overview
* **third-down conversion detail** — computed
* **run/pass by direction and by hash** — computed, currently far below

So the fix is composition, not new analytics: the strongest reads are buried
under the fold while the top of the page is half empty.

**Two ways, and they are different decisions.** Either let the columns flow so
each is sized by its own content instead of the tallest sibling, or deliberately
fill the two short columns with the reads above. The second is better football —
it puts the shape of the offense at the top of the offense tab — but it is a
composition pass on the tab, not a CSS change.

*Also on this screenshot: BIG PLAYS with a single row does not justify a third
of the width. If a panel is that thin, it belongs inline, not as a column.*

---

## H15 — Dead space below the commit bar

**Route:** Break Down → charting deck, below Save & Next
**Severity:** design
**Reported:** 2026-08-05. Coach: *"Can it be removed entirely? If not, maybe the
logo can fill it."*

A flat empty band sits under the commit bar after the form's last group.

**Likely cause:** `.gi-native-form` carries `padding-bottom:78px` to clear the
sticky nav, and the deck column stretches to the route height. So the reserved
gap is paid twice — once by the padding, once by the column — and shows as a
band with nothing in it.

**Removal is the right answer, and it should be tried first.** The sticky nav
already occupies that space; the padding only needs to equal the nav's height,
and the deck column should size to its content rather than stretch.

**On the logo:** it would work, but it is decoration in a space that has no job,
and it argues against the rule this project just wrote down — *fill the space or
kill the space*. Killing is the cleaner half here, because nothing belongs at the
bottom of a charting form. Keep the logo as the fallback if the space proves
structural rather than incidental.

---

## H3 — Design implementation status (Claude's read, not a coach finding)

The coach asked whether the full design is implemented, since it is hard to
judge from inside the app. Read from his 1.12.0-26 screenshot:

**Landed and visible:**
* **The lower-third is real.** `SITUATION`, `OUR OFFENSIVE LOOK` and
  `DEFENSE FACED` all render as angled plates. Open groups take the accent, the
  collapsed one stays grey — that is the intended state model.
* **Hairline joins.** The groups butt together on seams rather than floating as
  separate cards.

**NOT landed:**
* **Save & Next is still blue, not first-down yellow.** The selector
  (`.gi-tag-nav button[data-tag-save], .gi-tag-nav .is-primary`) does not match
  the real markup, so that rule is inert. The "one action means done" move is
  not in the build he is looking at.

**Cannot tell from a screenshot, needs checking in the DOM:**
* whether the film stage actually resolves to `--gi-film` rather than
  inheriting the app floor.

**Not attempted yet — still owed before design is "done":**
* the play strip cards, the transport, and the context bar are unchanged from
  the pre-design-pass composition;
* Reports tabs were changed blind and have not been seen at all.

---
