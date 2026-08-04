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

### Open question for the coach

Formation Tendencies shows **7 snaps of 34** (Spread 5, Trips 2) while the
Big 13 covers **32**. The Big 13 keys on QB alignment (Under Center, Shotgun)
where Formation Tendencies wants structural formations, which were mostly not
tagged on those defensive snaps. The Big 13 also reports 32 against the header's
34. Awaiting the coach's call: data-completeness note, or defect.

---
