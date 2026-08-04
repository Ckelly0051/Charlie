# Coach findings — installed smoke `1.12.0-19`

Logged as reported. **No fixes started** until the coach says the list is
complete. Each entry records what was seen, not a diagnosis.

---

## Order of work (coach, 2026-08-03)

> *"The design system we selected is actually pretty powerful, and we are not
> using it to its potential. We also need to build better visuals. Let's start
> with the text and colors, and get those right, because the visuals build on
> top of it."*

**Batch 1 — type and color foundation.** F8/F8b are the entry point, but the
scope is the tokens themselves, not one screen.

* **Type scale.** The 10–11px uppercase letterspaced label is the root of the
  legibility complaint. Establish a real scale — display, condensed numerals,
  body, label, caption — with sizes and weights chosen to be *read*, then set
  luminance to match. Bigger and dimmer, not smaller and brighter.
* **Use the family we already bundle.** IBM Plex Sans, Condensed and Mono ship
  with the app; the product uses a narrow slice of their weights and styles.
* **Color ladder.** The 12-step scale is barely half used — steps 4, 5, 8, 9 and
  10 are nearly absent, which is why surfaces read flat and the blues read
  alike. Re-tune separation in the blue range and put the middle steps to work.
* **Decide what blue MEANS.** It is the line-of-scrimmage "current" semantic;
  spending it on every static field label dilutes the one thing it should say.
* **Keep semantic and categorical separate** — already true in the tokens, must
  stay true as charts arrive.

**Batch 2 — visuals, built on top.** F12's list. Not started before Batch 1 is
accepted, on the coach's explicit sequencing.

---

## F1 — Duplicate legend under the donut charts

**Route:** Reports (donut pair — Run Rate / Total Yards)
**Severity:** cosmetic
**Reported:** 2026-08-03, with screenshot

Each donut renders **two** legends stacked:

1. a square-swatch legend carrying the real values — `Run 20` / `Pass 4`,
   `Rush Yards 135` / `Pass Yards 23`
2. below it, a second dot-swatch legend with labels only — `Run` · `Pass`,
   `Rush` · `Pass`

The second one is redundant. **Keep the square legend with the values; scrap the
dot legend.**

Applies to both donuts in the screenshot, so it is the shared donut component,
not one chart.

---

## F2 — Break Down charting header is a regression (three parts)

**Route:** Break Down — charting header above the tag form
**Severity:** P1, workflow. Coach's words: *"step in the wrong direction."*
**Reported:** 2026-08-03, with screenshot (Play 31, 67/68 tagged)

Header currently shows three dropdowns: **Charting Unit**, **Game Perspective**,
**Offense Direction**.

### F2a — Game Perspective is derivable and should not exist

It is not a decision the coach should make per play; it follows from what is
already known:

| Charting | Unit selected | Perspective |
|---|---|---|
| Our own game | Offense | our offense |
| Our own game | Defense | our defense |
| An opponent vs a third team | either | the team being charted |

**Remove the control entirely — it is just more to click.**

*Implementation note for when work starts (not a question now): the derivation
needs the game's own self-vs-opponent-scout declaration, which is set at game
setup rather than per play. Confirm that seam before removing the control.*

### F2b — Offense Direction is in the wrong place

It exists to serve the play-recognition feature, **which does not work and will
not until the technology improves**. It must not sit at the top of the charting
surface. Move it back into a rolled-up menu at the bottom of the page.

### F2c — Restore the single-click unit control

Offense / Defense / Special Teams **was one click and is now two**, because it
became a dropdown. Coach: *"I REALLY liked the single click."* Restore the
one-click segmented control.

**Net:** the charting header should carry the unit control **and nothing else** —
F2a's control is deleted, F2b's is relocated.

---

## F3 — Every charted game should produce an opponent scout report

**Route:** Reports
**Severity:** P1, logic/reporting
**Reported:** 2026-08-03

**The rule:** if a team plays us and the coach charts every play — ours and
theirs — that IS scouting data and must generate an opponent scout report for
that team. A head-to-head game is a scouting source, not just a self-scout
source.

**Observed:** not every charted game generates one.

**Coach's read of the cause:** scouting reports appear to be tied *exclusively*
to the Opponent Scout charting mode. That is not the intent — the mode should be
one way to feed a scout report, not the only way.

*Context for the fix pass, not a diagnosis:* the cross-game aggregation for an
already-played opponent does exist in the engine (their offense read from our
defensive snaps, their defense from the fronts/coverages we faced, across
seasons). So this is most likely about what the Reports route will *surface*
and when, rather than a missing computation. One known deliberate exception to
re-examine: opponent **Special Teams** is currently restricted to games charted
with `perspective === 'scout'`, because a stored head-to-head ST play does not
record whose unit the event belonged to. Whether that restriction is still the
right call is part of this finding.

---

## F4 — The opponent scout report is not useful enough to be worth its space

**Route:** Reports → Opponent scout (St. Peter Lutheran Patriots)
**Severity:** P1, product value
**Reported:** 2026-08-03, with screenshots

Not a data-logic problem — the data is there (1 game, 20 offensive snaps, 29
defensive snaps, 86.7% run, 5-2 front 97%, Cover 3 97%). It is a **usefulness**
problem, per tab:

* **Overview** — "does so little work that it's hardly worth the space." Needs
  to be a real summary of *actionable* data.
* **Offense** — "has some good stuff but could use more." Build on it.
* **Defense** — "not useful at all… currently says nothing useful." Two
  one-row tables. Coach wants: **what they run against our offensive looks**,
  **where they had success against us**, anything actionable.

### The structural insight this rests on

Every `unit:'offense'` play stores the **joint observation**: our formation,
personnel, down & distance and result, *together with* the front, coverage and
blitz we faced. So the opponent's defensive scout is not "what fronts do they
own" — it is **their call × our look × the outcome**. Nothing in the product
reads it as a join today, which is exactly why the Defense tab is one row.

### Proposed content — Defense tab (built from OUR offensive snaps)

1. **Their call vs our look** — front/coverage cross-tabbed by our formation,
   personnel and down & distance. The core scouting question.
2. **Where they hurt us / where we hurt them** — success rate, yards per play,
   explosive rate and negative rate *by* their front and coverage. This is what
   tells a coordinator what to attack and what to avoid.
3. **Pressure profile** — blitz rate by down & distance, and what it cost:
   sack/negative rate when they brought pressure versus when they did not.
4. **Money downs** — what they call on 3rd & long versus 3rd & short.
5. **Red zone / goal line** — how their call changes near the goal line.
6. **The exceptions ARE the tell** — at 97% one front, the interesting rows are
   the 3%. Surface when they deviate, not just that they rarely do.

### Proposed additions — Offense tab (their offense, from our defensive snaps)

1. **Situational splits** — money downs, red zone, backed up, two-minute.
2. **Explosive plays** — which looks produced them, film-linked. Denying the
   explosive is the single highest-value defensive question.
3. **Personnel → play tendency**, and direction/hash — where they attack.
4. **What stopped them** — which of *our* defensive calls held up, the inverse
   join of the Defense tab.

### Proposed content — Overview (the answer sheet)

Replace the five sample tiles with the handful of things a coach acts on:

1. **Who they are, in one line** — "5-2 / Cover 3 base · 87% run".
2. **Expect** — their top 3 calls with sample and success.
3. **Attack** — the 3 looks that worked best for us against them.
4. **Avoid** — the 3 that did not.
5. **Explosives, both directions** — theirs against us, ours against them.
6. **Money downs** — one line each way.
7. **Sample honesty** — 1 game / 49 snaps is thin, and the report should say so
   rather than presenting one game with the confidence of a season.

Every row film-linked, as elsewhere.

---

## F5 — Breadcrumb reads "SELF SCOUT" while showing the opponent scout

**Route:** Reports → Opponent scout
**Severity:** cosmetic, copy
**Source:** Claude's observation from the F4 screenshot, not coach-reported

Breadcrumb shows `REPORTS / SELF SCOUT` while the perspective toggle is on
**Opponent scout** and the title reads "St. Peter Lutheran Patriots scout".

Also on that screen: the **SCOUT-FILM ST** tile reads `0` and consumes a fifth
of the row. Connected to F3 — with the head-to-head ST exclusion in place it
will read 0 for most games, so it is dead width by default.

---

## F6 — Study query bar: truncated labels, and over-literal empty wording

**Route:** Study — the query bar
**Severity:** cosmetic / copy
**Reported:** 2026-08-03, with screenshot

### F6a — Option text is cut off

Visible in the screenshot: `Nothing — single lis`, `Choose a saved vie`,
`Curr…`. **Make it fit** — either widen the control or shorten the text.
Coach did not specify which; either is acceptable as long as nothing clips.

### F6b — "Nothing — single list" is too literal

The **Then by** control's empty state should read as *no selection*, not as a
sentence describing the consequence. Use a long dash or similar marker.

**Explicitly not `N/A`.**

Same treatment likely applies to the other empty-state labels in that row
(`Choose a saved view`, `No comparison`) — to confirm with the coach rather
than assume, since only **Then by** was named.

---

## F7 — Study results are not centered / not aligned

**Route:** Study — results area
**Severity:** cosmetic, layout
**Reported:** 2026-08-03, with screenshot. Coach's words: *"not centered."*

Measured off the screenshot, the blocks down the page do not share a left edge
or a width:

| Block | Left | Right |
|---|---|---|
| Query bar (top row of selects) | ~333 | ~1615 |
| `29 matching plays` + KPI cards | ~148 | ~1428 |
| `Success Rate by group` panel | ~148 | ~1428 |
| Results table (`GROUP / PLAYS / …`) | ~333 | ~1615 |

So the KPI and bar-chart panels sit in one column while the query bar and the
results table sit in another, shifted right and wider. Every block on the route
should share one content column.

*Reading recorded from the screenshot; confirm with the coach at fix time
whether this misalignment is what "not centered" refers to, or whether the whole
content column is off-center within the route.*

---

## F8 — Small label text is hard to read; the blues are too close

**Route:** Break Down — charting header (`PLAY 9`, `67 / 67 tagged`,
`CHARTING UNIT`). Applies wherever the small-caps label style is used.
**Severity:** P1, legibility
**Reported:** 2026-08-03, with screenshot

Coach's report:

* the medium and dark blues are **too similar**
* text **doesn't pop**; reading is harder than it needs to be
* the label text is **so small that it has to be bright to pass contrast**, and
  at that brightness it "almost seems to glow"

### This is a TOKEN problem, not a stray color

Answering the coach's question directly: yes, these are all design-system
colors. The charting header lives in `native-*.css`, which the design-system
guard holds to **zero raw color**, and as of `1.12.0-19` every legacy color
role derives from a `--gi-*` token as well. So nothing here is off-palette —
**the tokens and the type scale are what need to change.** Fixing this one
screen would be the wrong move; it belongs in `design-system/tokens.css`.

### Direction to evaluate (not decided)

The coach has identified a real trap: passing WCAG by **raising luminance on
tiny text** produces glow on a near-black surface. The usual escape is the
opposite move — make the text **bigger and heavier, and then less bright**.
Large text needs only 3:1 rather than 4.5:1, so size buys back the contrast
that brightness was being pushed to supply.

Candidates to look at together:

1. **Label type scale** — the 10–11px uppercase, letterspaced label style is at
   the root of it. Larger and/or heavier, with lower luminance.
2. **`--gi-11` (text secondary, `#8fa8c4`)** — the label blue. Its job is
   "secondary text", and it is currently doing "small glowing label".
3. **Blue separation** — `--gi-9` / `--gi-10` (solid accent) versus the
   surface steps `--gi-3`/`--gi-4`/`--gi-5` and the secondary text. The coach's
   "medium and dark blues too similar" points at the ladder being too tight in
   the blue range.
4. Whether labels should be **neutral rather than blue** at all — blue is the
   line-of-scrimmage/"current" semantic in this system, and spending it on
   every static field label dilutes the one thing it is supposed to mean.

### F8b — the greys have the same problem

Reported with a second screenshot (`STRENGTH` label above the chip row). The
issue is **not specific to the blue labels** — the grey label text reads the
same way: too small, not sharp, harder to read than it should be.

So the finding is the label style itself, in every color it appears in, not one
token. Both the blue and the grey label roles are in scope.

**The bar, in the coach's words: *"text really has to be sharp and easy to
read."*** That is the acceptance criterion for this finding — not a contrast
ratio that technically passes.

Any change here is product-wide by definition, so it needs a contrast re-run
(`e2e-breakdown-a11y`) and a look at every route, not just Break Down.

---

## F9 — Scoreboard: scores are not centered under the team names

**Route:** Reports → Overview, Scoreboard panel
**Severity:** cosmetic, layout
**Reported:** 2026-08-03, with screenshot

`41` and `0` each sit slightly right of the team name above them
(`MAVERICKS` / `ST. PETER LUTHERAN PATRIOTS`). **Scores should be centered under
their team name.**

*Mine — this is the AX-4 scoreboard composition. The existing assertion checks
that the separator is centered within the block and that the two team blocks are
equal width; it does **not** check that the name and the number share a center
line, which is why it passed. The fix should add that.*

---

## F10 — No space between the icon and the text

**Route:** Reports → Overview, Game Plan (`WHAT'S WORKING` / `NEEDS WORK`)
**Severity:** cosmetic, typography
**Reported:** 2026-08-03, with screenshot

Every row runs the leading icon straight into the first letter:
`✓Power-I`, `⚠Middle hash`. Needs a space (or proper gap) between the icon and
the text.

Applies to both columns, so it is the shared list-item style.

---

## F11 — Lens board: center-justify the tile contents

**Route:** Reports → Overview, the five-lens board
**Severity:** cosmetic, layout
**Reported:** 2026-08-03, with screenshot. Coach: *"center justified results would
probably look better here."*

Tile label, value and sub-line are currently left-aligned. Center them.

*Same treatment presumably wanted on the Game at a Glance tiles, which are the
same component — confirm rather than assume.*

*Second observation from the same screenshot, mine: the tile counts per lens are
uneven (4 / 4 / 3 / 3 / 3), so the cards end ragged with a gap where a fourth
tile would sit. Centering will soften it; worth deciding whether the empty cell
should be filled or the grid should reflow.*

*Third, to verify rather than assume: the RISK card appears clipped at the right
edge of the screenshot (`TURNOVER…`). That may simply be the screenshot crop
rather than the app overflowing — check at fix time before treating it as a
containment bug.*

---

## F12 — The product is text-and-donuts; the design system never delivered data visualization

**Route:** all analytics surfaces — Reports, Study, opponent scout
**Severity:** P1, and the largest finding in this list
**Reported:** 2026-08-03, with six Hudl IQ reference screenshots

Coach: *"It's all text based and at best a donut graph. The design system was
supposed to make this sleek but it just looks re-colored to me. Look at Hudl,
that's sleek — we are far behind, and downright clunky by comparison."*

### The criticism lands, and here is the precise reason

Our entire chart vocabulary is six primitives in `charts.js`: donut, gauge,
horizontal effectiveness rows, inline stacked bar, sparkline, and a cumulative
game-flow line. Everything else on every analytics screen is a **table**.

The S6 design pass delivered tokens, type, composition and palette ownership.
AX-5 was named "shared chart primitives" but was donut *hygiene* — fitting the
center label, moving the title out of the SVG, giving series a categorical
color. **It added no new way to see data.** So "it looks re-colored" is an
accurate description of what was actually done, and calling it a design pass
oversold it.

The design system also already ships a six-step categorical ramp
(`--gi-cat-1..6`) that almost nothing consumes, which is a symptom of the same
thing: the palette was built for charts that were never built.

### What is genuinely out of reach, and must not be promised

Several reference images are **player-tracking** products: the route/pursuit
map with every player's path, yards-after-contact scatter, tackle maps, line
pressure. Those need per-player positional data from computer vision on every
frame — the same technology the coach has already ruled unusable (see F2b).
**We cannot match those and should not imply we will.** Saying so plainly is
part of this finding.

### What IS reachable with the data we already store

Everything below is computable from tags already in the season file. No new
charting burden, no tracking data.

1. **Frequency × success bars with a sequential ramp** — the Hudl "Frequency
   and Success: Team Specific" panel. We have formation, play count, play %,
   and success rate today. Our `effectivenessRows` is the same information
   rendered plainly; this is mostly a visual-design upgrade of a chart we
   already have, and it is the single highest-value one.
2. **Team profile radar** — EPA/play, success %, explosive %, yards/play,
   negative %, third-down %, run/pass balance. Every axis exists. This is the
   striking visual in the reference set and we have all of its inputs.
3. **Yardage distribution curve / histogram** — a density of gains with the
   mean marked, and the opponent or league-average shape behind it. We store
   signed yardage on every play; this is one of the cheapest sophisticated
   charts available to us.
4. **Play-by-play scatter** — gain versus down & distance, or versus field
   position, colored by run/pass and sized by explosiveness. Reads as a
   "shape of the offense" at a glance.
5. **Field-zone heat map** — success by field position band × play type. The
   heat-map primitive already exists but is barely used.
6. **Small multiples** — the same small chart repeated per formation or per
   down, instead of one table with many rows.
7. **Dense dashboard composition** — the reference dashboards put eight to
   twelve visuals on ONE screen. Ours is a long vertical scroll of sections.
   This is a layout decision as much as a charting one.

### The rule this should establish

A number belongs in a table when a coach needs the exact value, and in a chart
when they need the **shape**. Right now everything is a table regardless of
which question is being asked. Film links must survive on every new visual, as
they do on the existing ones.

*When this work starts: load the `dataviz` skill before writing any chart code,
and use the categorical ramp the tokens already define rather than inventing
per-chart colors.*

---
