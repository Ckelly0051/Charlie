# Coach findings — installed smoke `1.12.0-24`

Logged as reported. **No fixes started** until the coach says the list is
complete. Each entry records what was seen, not a diagnosis. Numbered G1, G2 …
to avoid colliding with the F-series from `1.12.0-19`.

**Carried forward, still open:** F12c — the team profile radar, deferred pending
the coach's decision on what the axes are measured against (own season, or the
opponent in a head-to-head). Nothing else from the F-series is outstanding.

---

## G1 — Double rule under the section heading

**Route:** Reports → Opponent scout → Offense
**Severity:** cosmetic, formatting
**Reported:** 2026-08-04, with screenshot

`THEIR OFFENSE · 34 SNAPS` carries a short underline directly beneath the text,
and a second full-width rule sits just below it. Two horizontal lines stacked
where there should be one.

Same shape under `FORMATION TENDENCIES`.

*Likely two owners drawing a rule for the same boundary — the heading's own
underline plus the section's bottom border. To confirm at fix time; the fix is
to pick one owner, not to hide one line.*

---

## G2 — Down & distance needs an aggregate roll-up, and 4 distance buckets

**Route:** Reports → Opponent scout → Offense (Down & Distance)
**Severity:** feature, high value
**Reported:** 2026-08-04

The granularity is right and should stay — the coach likes seeing what they did
at every down and distance. What is missing is the level ABOVE it:

1. **By down, in aggregate** — what they do on 1st, 2nd, 3rd and 4th overall,
   not split by distance.
2. **By distance to the sticks**, in four buckets:
   **1–3 · 4–6 · 7–9 · 10+**

So the tab reads top-down: down → distance bucket → the exact situations.

### Hazard to respect at fix time

The engine already has a distance bucketer, `_distBucket`, and it uses a
**different, three-way** split: Short 1–3 / Medium 4–6 / Long 7+. It feeds the
self-scout tells, the Predictability Map keys and the `dd` / `comboFD` /
`comboFS` cut filters — all of which are parity-locked.

**Do not widen `_distBucket` to four buckets.** Splitting 7+ into 7–9 and 10+
there would re-key every existing tell and cut, move the parity goldens, and
change what the Predictability Map means, none of which the coach asked for.
Add the four-bucket grouping as its own reporting dimension and leave the
existing bucketer alone.

### What the screenshot showed — the Down & Distance table audit

Coach asked what is missing. Seven items, first one a defect:

1. **The table silently drops plays.** `downTendency` ends in `.slice(0, 15)`.
   The 15 rendered rows total **30 snaps of the header's 34** — four are absent
   with no "and N more". A report that looks complete and is not.
2. **No aggregate by down** anywhere on the page.
3. **No distance grouping.** The bucketer exists and drives the self-scout
   tells; this table never calls it, which is why the coach has never seen the
   groupings.
4. **Run/pass only — never whether it worked.** No yards per play, no success
   rate.
5. **No conversion rate on 3rd/4th** — the single most valuable number on a
   defensive scout.
6. **Sorted by frequency, not by down.** A scout is read like a call sheet:
   1st, 2nd, 3rd, 4th.
7. **Rows are not film-linked**, unlike every other row in the redesign.

### Decided (coach, 2026-08-04)

**Bucketing leads; raw detail stays.** In the moment a coach acts on the
grouped read, not on `2&13`. So the tab reads:

1. **By down** — 1st / 2nd / 3rd / 4th in aggregate.
2. **By distance bucket** — the actionable grouping.
3. **Every situation, raw** — kept, because the detail is worth having, but it
   is the reference layer rather than the headline. And it stops being
   truncated: no silent `.slice(0, 15)`.

---

## G3 — The F12 visuals exist only on the self-scout Offense tab

**Route:** Reports → Opponent scout → Offense
**Severity:** gap
**Reported:** 2026-08-04, from two screenshots of the same tab name

Both perspectives have a tab called **Offense**, but they are different
renderers. F12 wired the five visuals into `_offenseHtml` (Our game) and not
into the opponent branch, so the opponent Offense tab still shows only the old
formation / Big-13 / down-and-distance tables.

This is also the whole explanation for the coach's "did you stealth update
this" — the first screenshot was Opponent scout, the second was Our game. No
build changed underneath him.

**Their offense should get the same shape view**: how often and how well,
where the gains sit, and the situational read. The scatter and field-zone
strip need judgement — those read from OUR charting of down/distance and field
position on defensive snaps, which is thinner — so include them only where the
data supports it, per the omit-don't-zero rule.

---

## G4 — A no-gain is colored as a loss in the distribution

**Route:** Reports → Our game → Offense → "Where the gains sit"
**Severity:** defect, mine
**Source:** Claude's own observation from the coach's screenshot

The histogram colors a bin as negative when its upper edge is `<= 0`. The `0`
bin runs from `-1` to `0`, so it satisfies that test and renders in the turnover
color. **A zero-yard gain is not a loss.** Only the `Loss` bin should carry the
negative color.

---

---

## G5 — A definitions legend, behind a menu

**Route:** Reports (all), and anywhere the derived measures appear
**Severity:** feature
**Reported:** 2026-08-04

Several headline numbers are **derived on a rule the coach cannot see**, and
the report states them with total confidence. There should be a legend that
defines them — **behind a menu or disclosure, not living on screen full time.**

Measures that need a definition because the rule is invisible:

* **Success rate** — down-adjusted, not a flat percentage: 1st needs 50% of the
  distance, 2nd 70%, 3rd/4th must convert.
* **Explosive** — 12+ yards on a run, 16+ on a pass. Two different thresholds,
  stated nowhere.
* **Negative play**, **havoc**, **stop %** — each has a specific exclusion set
  (a penalty or kneel is not a tackle for loss).
* **Predictability index** and its exploitable / working / balanced states.
* **Low sample** — what the fade and the "low" label actually mean.
* **EPA / play**, **points per drive**, **pts/drive** thresholds behind the
  good / warn / bad tones.

### The hazard that matters

A glossary written from memory **will drift from the engine**, and a confidently
wrong definition is worse than none — it invites a coach to check a number
against a rule the code does not use. The definitions must be sourced from the
same constants the engine computes with, and a test should pin that the stated
threshold matches the one in use.

`SUCCESS_RATE_TIP` already exists as a `title` tooltip on one KPI, so a partial,
unreachable version of this is in the product today.

### Decided (coach, 2026-08-04): menu OR tooltip, by volume

If the list is long enough to be worth its own destination, give it a menu
spot. If it is short, **per-term tooltips are the better answer** — the
definition arrives where the number is, which is where the question occurs.
Count the terms first, then choose.

**If tooltips: a bare `title` attribute is not sufficient.** It does not appear
on touch, it is not keyboard reachable, and screen readers treat it
inconsistently — so the definition would be invisible to exactly the coach
using a tablet on the sideline. It needs a real affordance: a small focusable
info control that opens on hover AND focus AND tap, dismissible on Escape.
The existing `title` on the success-rate KPI is the precedent for the content,
not for the mechanism.

---

---

## G6 — Fill the space or kill the space (recurring)

**Route:** Reports → Season (KPI band). **Recurs elsewhere.**
**Severity:** design, but logged now because it keeps happening
**Reported:** 2026-08-04, with screenshot. Coach: *"a UI sin of the highest
severity."*

Six KPI tiles sit at fixed width, left-aligned in a full-width bordered band,
leaving roughly **45% of the bar empty**. The container claims the whole width
and then does not use it.

**The rule, stated as a rule because this is the third time it has come up:**
a container that spans the full width must either **distribute its children
across that width**, or **not span the full width**. Half-empty chrome reads as
broken layout, not as breathing room.

Same shape as the scoreboard dead space AX-4 fixed by moving Game at a Glance
beside it — that was one instance being patched. This is the pattern.

Apply the rule everywhere it occurs, not only on this band. Candidate surfaces
to sweep at fix time: the Season KPI band, any `stats-grid` row with fewer
children than columns, and the lens board's ragged 4/4/3/3/3 tile counts noted
in F11.

*Second observation from the same screenshot, mine: the Season tab renders a
SECOND tab row (Overview / Breakdown / Players / Self-Scout) directly beneath
the main report tabs, and three of those four names duplicate main tabs. Two
stacked tab bars with overlapping vocabulary is a navigation problem, not just
a spacing one. Flagging rather than acting.*

---

## G7 — Clipping in the Predictability Map header row

**Route:** Reports → Self-scout → Predictability Map
**Severity:** cosmetic, clipping
**Reported:** 2026-08-04, with screenshot

Each down column carries a small summary line above the formation rows
(e.g. `50% · 2.8y`, `100% · 20.0y`) sitting right under the `1 2 3 4` header.
That summary text is clipped — it overlaps the boundary between the header row
and the first formation row rather than having its own row height.

*Not yet diagnosed — likely the summary line has no reserved height of its own
and is drawing into the header's line-box. Confirm at fix time.*

---

## G8 — Situational / By Quarter: misaligned, and asymmetric composition

**Route:** Reports (Situational + By Quarter side-by-side block)
**Severity:** cosmetic, layout
**Reported:** 2026-08-04, with screenshot

Two tables sit side by side — Situation (left) and By Quarter (right) — and
their rows/headers don't line up with each other. Left carries a standalone
"Red Zone TD" gauge above it; right has nothing above it, so the two columns
start at different heights and read as mismatched rather than paired.

Coach's own words: *"it's odd to have a standalone chart on left but not
right"* — flagging the asymmetry itself as the thing to fix, not just the
misalignment.

---

## G9 — Heat Map (Formation × Play): header clipping and a stray label

**Route:** Reports → Heat Maps → Formation × Play
**Severity:** cosmetic, clipping/alignment
**Reported:** 2026-08-04, with screenshot

The rotated column headers (RUN INST-, RUN OUTS-, etc.) are clipped at the top
— each label is cut off rather than fully readable. A short green underline
stub sits partway under the first header ("RUN INST-") with no visible
counterpart under the others.

There's also a **"POWER-I" label** sitting in the header area above the row
axis, in the empty corner cell region — it doesn't read as a row label (the
actual row labels are ACE / SPREAD / SINGLE WING below it) and its purpose
isn't clear from the screenshot. Possibly a stray/orphaned label.

---

## G10 — Yardage Spray is too big

**Route:** Reports → Our game → Offense → Visualizations → Yardage Spray
**Severity:** cosmetic, sizing
**Reported:** 2026-08-04, with screenshot

Coach's words: *"cool chart but it's too big."* Approves of the chart itself —
this is a sizing complaint, not a request to change or remove it.

---

## G11 — Backfield & Strength: no spacing between the two sub-sections

**Route:** Reports → Our game → Offense → Backfield & Strength
**Severity:** cosmetic, spacing
**Reported:** 2026-08-04, with screenshot

The `STRENGTH` sub-heading sits immediately against the last `BACKFIELD` row
("Single") with no gap — it reads as crowding into the row above rather than
starting a new group. Every other two-part section in the reports gets a
visible break between its parts; this one doesn't.

---

## G12b — "More" chip is also truncated ("Mo"), same class as G12

**Route:** Break Down → Result chip row
**Severity:** cosmetic, truncation
**Reported:** 2026-08-04, with screenshot. Coach: *"it's also an issue with
the MORE dropdown above it."*

The `More` chip at the end of the Result row (after Gain/Loss/No Gain/
Incomplete/TD/Sack/INT/Fumble) renders as **"Mo"** — same truncation class as
the "Grade" → "Grad" cutoff in G12, on a different control. Two independent
sightings of the same bug shape; worth checking whether other short-label
chips/dropdowns across the form share it before calling either one fixed.

---

## G12 — Grade dropdown text is cut off, and a request to collapse the quick-pick grid

**Route:** Break Down → Players & Grades
**Severity:** cosmetic (truncation) + feature request
**Reported:** 2026-08-04, with screenshot

1. **The "Grade" label is truncated to "Grad"** in the dropdown control for
   each role (Ball Carrier, Passer, etc.) — the box is too narrow for the word.

2. **Feature request:** the coach doesn't love the roster quick-pick button
   grid (2/3/5/6/7/15/16/18/25/27/40/42…) as the primary entry method and
   wants the **whole button picker to be collapsible** — his stated reason is
   that typing the jersey number directly is faster than tapping through a
   button grid. The number input field above the grid already exists; this
   asks for the grid itself to be optional/foldable, not removed.

---

## G13 — Big 13 rows: wrong field order, unstructured text, not sortable

**Route:** Reports → Opponent scout → Offense (and Our game → Offense)
**Severity:** feature / presentation
**Reported:** 2026-08-04

**Corrects the earlier open question.** The Big 13 does NOT key on QB alignment
— verified in `_bigTwelveData`, the key is the full composite
`[qbAlignment, formation, backfield, strength, motion, playType]`, with a
comment stating why. Three real problems, none of them the key:

1. **The display line leads with QB alignment, the tag form leads with
   Formation.** `_renderBigTwelve` builds the name from `[c.qb, c.form]`, but
   the charting flow (`native-tagging.jsx:294-297`) is **Formation → QB
   Alignment → Backfield → Strength → Personnel → Motion**. The report should
   read in the order the coach charts.

2. **The row is run-together prose** — alignment, formation, backfield tag,
   strength tag, motion tag, arrow, play type all in one flowing line, so the
   whole string must be read to extract any one field. Coach wants it
   **structured into cells/columns**, so a single dimension can be tracked down
   a column and the block can be presented to a room.

3. **Not sortable** — hard-sorted by frequency only (`sort((a,b) => b.n - a.n)`),
   no column sort anywhere.

**Also:** a call with no structural tag currently renders as a bare alignment
("Shotgun"), which reads as a complete call and is not one. It should say the
structure is missing.

### Resolves the former open question

Formation Tendencies 7 snaps vs Big 13 32 is a **data-completeness gap, not a
defect** — those defensive snaps were charted with QB alignment but not
structure. Coach's standing instruction going forward: *"Nothing should key
exclusively on QB alignment — it's meaningless in isolation. They should be
structurally tagged and ideally sortable."*

---

## G14 — The "Risk" lens is renamed, and sacks stop being double-counted

**Route:** Reports → Overview (five-lens board), and everywhere "negative plays"
appears
**Severity:** naming + data correctness
**Decided by coach:** 2026-08-04

### What was wrong

`Risk` named a lens whose four tiles had all already happened — they are damage,
not exposure. And two of the four overlapped: `negative` is defined as
`(parseInt(p.tags.yardage) || 0) < 0` (`stats-engine.js:654`), so **every sack
was counted in Negative plays AND again in Sacks taken**, in the same lens, with
no indication.

### Decided

1. **The lens is renamed `Negative Plays`.** The coach's reasoning: the term is
   broader than plays that lose yards, and its breadth actually fits the four
   things listed. Question stays *"What is costing us snaps?"*
2. **The old `Negative plays` tile is renamed** — it can no longer share the
   lens's name. It measures `yardage < 0` and nothing else.
3. **Sacks are called out uniquely and are NEVER double-counted** — not in the
   raw count and not in the percentage. A sack is a uniquely identifiable play
   that loses yards, so it belongs to its own row alone.
4. **Sacks go FIRST** under any mention of lost yards or negative plays. This is
   a global rule, not one lens's ordering — see scope below.
5. **`< 0` stays.** Lost yardage is literal; no `<= -2` threshold.
6. **No extra explanation on screen.** A tooltip may follow if the coach changes
   his mind; do not add one pre-emptively.

### Final structure (settled with the coach through five rounds)

```
NEGATIVE PLAYS        12 · 41% of plays

  TURNOVERS            4
  PLAYS FOR LOSS       8
      Sacks            4
      Runs             3
      Passes           1
  PENALTIES            4
```

**The headline is literal: distinct negative PLAYS**, with one percentage, taken
against total plays. **The rows carry raw counts only — no percentages.**

Why the two levels disagree, and why that is correct: a strip-sack is one play
but two events. The headline counts snaps that went wrong (12); the rows count
what happened (16). Removing the row percentages is what makes this readable —
there is no invitation to add them up against a percentage that would not match.

**Turnovers stands alone at number one**, its own treatment, never folded into
anything. **Everything that could double-count is bracketed under Plays for
Loss**, where the indent shows the children are part of the 8 rather than
additional to it. Sacks stay visible on their own line — the coach's case: if
all four turnovers are strip-sacks, calling out the sack is exactly what
matters.

The three children are mutually exclusive and derivable from existing charting
(sack result, run/pass classifier, `yardage < 0`), so they sum exactly to their
header. Penalties stay separate: a penalty is not a play for loss, and can
negate a play entirely.

**Coach's own framing, recorded because it settles the tradeoff:** *"There is no
perfect answer here."* A strip-sack is both a sack and a turnover and either can
happen without the other, so both totals must survive.

### Scope — this is not one lens

"Negative plays" is computed once in `_efficiencyStats` and consumed in at
least three places, all of which inherit the sack overlap:

* the five-lens board (`_renderLensBoard`)
* the Efficiency block's `Negative` stat card (`stats-engine.js:2327`)
* the self-scout "too many losses behind the line" insight (`:1634`)

All three must move together, or the same number will read differently on
different tabs.

### Hazard — the cut filter must match the number

The tile is film-linked through `{ type:'situation', val:'negative' }`. If the
displayed count excludes sacks but the cut filter does not, **the tile will
show 4 and play 6.** That is exactly the AX-7 defect where a tile said
"3 attempts" and played 4 clips. The filter and the count have one definition
or the tile lies.

---

## F12c — RESOLVED. Radar axes scale to the coach's own achieved maximum

**Measured 2026-08-04** against the real season
(`%APPDATA%\com.gridironiq.app\seasons\2026-varsity-demo\season.json`,
read-only) using `_isSuccessfulPlay` and the explosive/negative rules **copied
verbatim from `stats-engine.js`**, not reimplemented.

`2025 St. Joseph Mavericks - JV` — 6 games, 167 offensive snaps:

| Opponent | Snaps | Success | Explosive | Negative | YPP |
|---|---|---|---|---|---|
| St. Peter Lutheran | 27 | **70.4%** | **33.3%** | 7.4% | **10.7** |
| Holy Family Wildcats | 33 | 57.6% | 18.2% | **3.0%** | 7.67 |
| OL Refuge Ravens | 28 | 42.9% | 3.6% | **28.6%** | 2.93 |
| OL Sorrows Lancers | 24 | 33.3% | 12.5% | 12.5% | 6.58 |
| OL Lakes Lakers | 25 | 28.0% | 12.0% | 12.0% | 6.60 |
| ND Prep Fighting Irish | 30 | **20.0%** | 3.3% | 20.0% | 1.90 |

**Season aggregate: 42.5% success, 13.8% explosive.**

### The decision the numbers make

Best game 70.4%, worst 20.0%. **On a 0–100 axis every game sits in the bottom
two-thirds and the radar is a pinprick** — the shapes would be visually
indistinguishable and the chart would say nothing. Scaled to his own achieved
best, the same six games spread across the full axis and the shape becomes the
question a coach actually asks: *how did this game compare to us at our best?*

**Axes scale to the season maximum per spoke.** Full scale is a real number the
team has actually reached, so nothing is invented and no benchmark is implied.
A game that sets a new best redefines the axis — which is correct, and should be
labelled so the coach knows the scale moved.

**Also settles the season aggregate:** 42.5% success rate. The 41% negative-play
figure discussed for G14 is in the same range, which is worth stating in the
tooltip so the two are not confused.

---

## G5 — RESOLVED. Tooltips, not a menu. Ten terms, counted.

Coach's rule was *count the terms first, then choose*. Counted against source:

| Term | Rule in code | Where |
|---|---|---|
| Success rate | down-adjusted: 1st 50%, 2nd 70%, 3rd/4th convert | `:431` |
| Explosive | run ≥ 12y, pass ≥ 16y | `:650` |
| Plays for Loss | `yardage < 0` | `:654` |
| Havoc | havoc plays ÷ plays | `:771` |
| Stop % | inverse of offensive success | `:1425` |
| Predictability index | `(avgMaxPct − 50) × 2`, sample-weighted, 4 states | self-scout |
| Tell | n ≥ 4 **and** lean ≥ 70% | `:1536` |
| Low sample | *see defect below* | several |
| EPA | expected points added | `advanced-metrics.js` |
| Points per drive | drive scoring rate | drive stats |

**Ten terms — too thin for its own destination, and scattered across five tabs.
Tooltips win**, on the coach's own rule: the definition should arrive where the
number is, because that is where the question occurs.

Mechanism per the coach's earlier spec: a real focusable info control opening on
hover **and** focus **and** tap, dismissible on Escape — **not** a bare `title`
attribute. `SUCCESS_RATE_TIP` (`stats-engine.js:23`) is the precedent for the
*content* and already reads correctly; it is not the precedent for the mechanism.

**Definitions live in one exported map beside the code that computes them**, and
a test pins each stated threshold against the constant in use. A glossary written
from memory drifts, and a confidently wrong definition is worse than none.

### Defect found while counting: "low sample" means three different things

The minimum-sample gate is **not one number**. `MIN_N = 4` for self-scout tells
(`:1536`), `count >= 5` for formation tendencies (`:1543`), `count >= 2` for the
coverage list (`:1427`). So a row faded as "low sample" on one tab would not be
faded on another, and a single tooltip cannot honestly describe all three.

Either unify the threshold or make the tooltip name the gate for its own surface.
Not a blocker for G5, but it must be decided before a definition is written —
otherwise the glossary states something untrue on two tabs out of three.

---

---
