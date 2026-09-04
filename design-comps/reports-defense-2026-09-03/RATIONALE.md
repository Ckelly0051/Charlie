# Reports > Defense — desktop design comp, 2026-09-03

**Status: comp for coach review. Not approved, not implemented.**
Design only. No production file was changed to produce this.

Comp: `design-comps/reports-defense-2026-09-03/defense.html`
Captures: `design-comps/reports-defense-2026-09-03/captures/`

The comp is interactive. The scope control, the section navigation, and the
populated / sparse / empty / long-name states all work, so the composition can
be judged in its real states rather than described.

---

## 1 · Why Defense is not Offense

Offense runs six zones on a **12-column** rhythm because its KPI band is six
tiles. Defense's performance band is **eight** values, and eight tiles cannot
sit on a 12-column grid without a ragged last row.

Defense therefore runs its own rhythm: the KPI band is **eight tiles across in
one row**, and every band below divides at 50%, which lands on that band's own
centre rule. An earlier pass used two rows of four; it stretched each tile to
~350px of mostly empty panel.

Five sections, not six, and named for what a defensive coach is looking for:

| # | Section | Supporting label |
|---|---|---|
| 1 | Defensive performance | Snaps, efficiency, and the games in the sample |
| 2 | Opponent Offense | Opponent play type, frequency, and production |
| 3 | Scheme | Fronts, coverage, and pressure |
| 4 | Situational results | Down, distance, field position, and disruption |
| 5 | Self-scout | Predictability and tendency tells |

The five sections are a **TAB STRIP**: one section on screen at a time.
Production Defense is a single 4,575px page at 1440, and as scroll anchors the
five read as one undifferentiated report. This is a deliberate departure from
Offense, which scrolls one continuous page — see decision 8.

---

## 2 · Production → comp mapping

Every section, control, scope, export and film action in `DefenseTab` is
accounted for. **Nothing was dropped to make the composition fit.**

| Production (`native-report-tabs.jsx`) | Comp location | Change |
|---|---|---|
| Generic KPI rail (shell) | **Removed on this tab** | Replaced by the scorebug, as on Overview and Offense. See §3. |
| `gi-def-scope` — Full season / Current game | §1 toolbar | Retained. Relabelled visually with a `Scope` eyebrow; same two options, same behavior. |
| `Export Report` button | §1 toolbar | Retained, right-aligned, given real hover/focus/active states. |
| **Defensive Performance** — 8 `gi-def-kpi` tiles | §1 KPI band | All eight retained. Reordered so the three a coach reads first (Stop rate, Yards/play allowed, Havoc) lead. Each gains a sub-line stating its own denominator. |
| **Opponent Offense by Play Type** — `All Runs` / `All Passes` summary buttons | §1 "Run / pass faced" | Retained as film buttons. Moved into §1 because it is sample context: what this defense actually faced. |
| **Opponent Offense by Play Type** — detail table | §2 "Opponent play type" | Retained with all seven columns. Half width instead of full, which removes the long horizontal eye travel. |
| **Best Calls by Opponent Play Type** — answer table | §2 "Best call by play type" | Retained, including the three answer cells per row and the `Not enough snaps` cell. |
| Best Calls — `emptyAnswers` disclosure line | §2 note under the table | Retained verbatim in intent; wording tightened (see §5). |
| **Game Trend** — `defGameColumns` table | §1 "Sample by game" | Retained. Moved to §1: the games charted *are* the sample, and the prompt asks the report to open with performance and sample context. |
| **Situational Defense** — `defSitColumns` table | §4 "Situational defense" | Retained with all six columns. |
| **Scheme Detail → Defensive Analytics** — havoc gauge + 7 stat cards | §1 "Disruption" | All values retained as film-clickable tiles. The gauge is dropped as a *drawing*; its number (havoc rate) is already a §1 KPI and appears again as a tile. See §4 decisions. |
| Scheme Detail — **Defensive Front Breakdown** | §3 "Front" | Retained, all seven columns. |
| Scheme Detail — **Coverage Breakdown** | §3 "Coverage" | Retained, all nine columns including total Yds. |
| Scheme Detail — **Blitz Analysis** | §3 "Pressure" | Retained. Gains an `All blitzes` aggregate row — a real total over the blitz-tagged snaps, not a new metric. |
| Scheme Detail — **Early Downs / Passing Downs** front tables | §3 "Front by situation" | Retained. The two side-by-side tables become one table with an early-downs and a passing-downs column pair, which is the comparison the coach is actually making. |
| **Defensive Self-Scout** — predictability meter | §5 "Predictability" | Retained. |
| Defensive Self-Scout — `recommendations` | §5 "Predictability" | Retained, all four `DefRecommendation` kinds represented (exploitable-summary, exploitable-item, exploitable-more, dominant). |
| Defensive Self-Scout — **Defensive Tendency Tells** table | §5 "Tendency tells" | Retained, all eight columns, including the lean bar and the verdict. Full width — it is the widest table in the report and the only one that earns it. |
| Defensive Self-Scout — **Scheme by Situation** (`ddRows`) | §4 "Scheme by situation" | Retained, with its Avg yds column. Moved beside Situational defense — see decision 10. |
| Film activation on every row / tile / answer | Throughout | Retained. Every row that carries refs in production is a `cut` row here with hover, keyboard focus and a hand pointer. |
| Top-level empty state | Empty state | Redesigned — see §6. |

**Out of scope and untouched:** Opponent Defense, Self-Scout tab, Special
Teams, Players, Matchup, Season, Overview, Offense.

---

## 3 · The scorebug replaces the generic rail

Production Defense shows the generic `gi-reports-rail`, which on a defensive
report reads:

> Final Score · Total Plays · Plays Charted · **Plays per Phase** · **Success
> Rate 0% (offense)** · Turnovers — *"no offensive snaps charted"*

Two of those six are offense metrics, and on a defense-only game the rail
reports **Success Rate 0%** with the explanation that no offensive snaps exist.
That is an offense KPI answering a question the tab did not ask.

The comp uses the Overview/Offense scorebug instead, which is already the
established treatment on the two tabs that have had their design pass, and
`SCOREBUG_TABS` in `js/reports-screen.js` is the single owner of that rule —
adding `defense` to that set is the whole production change, and it makes the
rail and the bug mutually exclusive by construction.

Defense-specific in the bug:
- The story metric is **yards per play allowed**, in Defense's cyan.
- The right-hand cell states the scope and its sample, so the scope control and
  the header never disagree.

**The scorebug is a linescore, and that is a change from Overview/Offense.**
The implemented bug pairs each team's name with its own score cell. On this
comp that read badly: a team's score sat above and to the right of its own
name, the name track was too narrow to hold "St. Joseph Mavericks", and the
quarter figures stacked with nothing saying which row belonged to which team.

Each team is now a row — name, four quarters, total — which is the box-score
convention and answers all three at once. Score position is still structural:
the four quarter columns and the total column are fixed and equal, so a score
cannot move for a name length or for a 1-, 2- or 3-digit value. The name
column is sized to the longest name and **never truncates or wraps** — the
scorebug's regions flow, so if they cannot share one row the bug becomes two
rows rather than cutting a word.

Measured across populated and long-name / three-digit states:

| Width | Both totals (populated) | Both totals (long names, 3-digit) |
|---|---|---|
| 1440 | 364 | 548 |
| 1280 | 364 | 548 |

 The pair moves together with the name column and stays in ONE track, which is
 the property that matters: neither score can move independently of the other.

**Both team rows carry the same weight and ink.** An earlier pass bolded our
team and dimmed the opponent; that spends legibility restating what the score
already says. Coach's call, and the right one.

---
## 4 · Composition decisions

**Modules are paired by realistic content height.** Production pairs nothing —
every section is a full-width stack, which is why Situational Defense spreads
six columns across 1,400px. In the comp:

- Sample by game (3 rows) ‖ Run / pass faced (2 stacked film buttons)
- Opponent play type (6 rows) ‖ Best call by play type (5 rows)
- Front (5 rows) ‖ Coverage (5 rows)
- Pressure (5 rows) ‖ Front by situation (5 rows)
- Disruption — full width, 8 tiles in four columns (section 1)
- Situational defense (7 rows) ‖ Scheme by situation (6 rows)
- Predictability (meter + 5 recommendations) ‖ Tendency tells (5 rows, 8 columns)

Measured result: **zero modules fall more than 40px short of their band** at
1920, 1440 and 1280, in every state.

**The havoc gauge is dropped as a drawing, not as data.** It is an SVG arc
whose only value is the havoc rate, which is already the third KPI in §1 and a
tile in §4. Production draws the number three times and the arc adds no
comparison. The tile keeps the number and gains a film action the gauge did not
have.

**Bands are `align-items:start`** and draw their column rules with a box-shadow
into the 1px gap — the same technique the implemented Offense board uses,
because a band that paints rules through its own background shows that colour
as a slab under a short module.

**Two production defects the comp does not reproduce:**
- `SchemeDetail` renders `Blitz Havoc` in a raw `#44ff88` and the gauge in raw
  `#22c55e` / `#f59e0b` / `#ef4444` — a second, brighter palette inside a
  broadcast-dark report. The comp uses board tokens only.
- `SchemeDetail` and `DefensiveSelfScout` carry inline `style` attributes on
  their `<h4>`s and stat cards. The comp uses classes.

Both are recorded here as observations; neither was fixed in production, which
is out of scope for a design task.

---

## 5 · Copy

All labels are literal and operational. Column labels use the body-family
`--gi-text-label` token at 12px with the updated `--gi-bd-copy` ink, matching
the readability treatment now shipped on Overview and Offense. The 9.5px floor
is used only for eyebrow labels, never for operational text.

Two production strings are tightened:

| Production | Comp | Why |
|---|---|---|
| "No defensive data tagged yet" / "Tag plays as Defense and add the opponent's play type, result and yardage to build this report." | "No defensive snaps charted" / "Chart defensive plays to populate this report." | The production copy instructs at length and names three fields. The replacement states the condition and the next action, matching the accepted Offense empty state. |
| "…didn't have enough snaps for a best-answer call yet." | "…has not reached the sample a best-answer call requires." | Removes the conversational contraction and "yet". |

Section headings are nouns, not sentences. No coaching narration anywhere.

---

## 6 · States

**Populated** — 174 defensive snaps over 3 games, internally consistent: fronts
(62/48/34/18/12), coverages (58/41/33/27/15) and pressure (102/34/22/16) each
total 174, run 60 + pass 114 = 174, and the six opponent play types total 174.
No metric, formula or football term was invented; every value is one production
already computes.

**Sparse** — one lightly-charted game, 12 snaps. The KPI band reports what it
has and says `—  none charted` for 3rd down and red zone rather than printing a
0% rate on a zero denominator. Scheme, situational and self-scout analytics
collapse to one module stating `Insufficient charted data`, because those
sections need a sample to mean anything. The scorebug and the report head both
follow the sparse sample, so nothing on screen disagrees.

**Empty** — compact, grid-aligned, left-ruled in Defense cyan, with the
`Open Break Down` route command. It does not reserve vertical space, does not
draw a large bordered container, and suppresses the scorebug entirely rather
than leaving a blank bug.

**Long names / 3-digit scores** — `Immaculate Heart of Mary Catholic Academy`
vs `Our Lady of Perpetual Help Prep` at 118–107. Names truncate inside their
own tracks with full values in tooltips; no score, the quarter line, the story
metric or the game-context column moves.

---

## 7 · Verification performed

Rendered and inspected at 1920×1080, 1440×900 and 1280×720, in all four states.
Measured on every capture:

- Page-level horizontal overflow: **0** everywhere.
- Internal horizontal scrollers: **0**.
- Text below the 9.5px floor: **0**.
- Clipped text without a tooltip: **0**.
- Modules more than 40px short of their band: **0**.
- Console/page errors: **0**.

Screens were inspected visually, not accepted from those numbers. Four defects
were found by looking and fixed before delivery: a rule-coloured slab above the
scorebug's bottom-aligned name cell; a 149px shortfall on Disruption; a report
head that wrapped onto two lines at 1280; and a sparse state whose first band
still showed full-season rows beside a 12-snap KPI band.

Captures:

| File | What |
|---|---|
| `captures/1920x1080-top.png` | 1920 top |
| `captures/1440x900-top.png` `-middle` `-bottom` | 1440, three positions |
| `captures/1280x720-top.png` `-middle` `-bottom` | 1280, three positions |
| `captures/1280x720-sparse.png` | sparse at 1280 |
| `captures/1280x720-empty.png` | empty at 1280 |
| `captures/1280x720-longnames.png` `1440x900-longnames.png` | long names, 3-digit scores |

---

## 8 · Decisions needed to approve

1. **Five sections, not six**, with Defense's own 4-column rhythm rather than
   Offense's 12. Right call, or should Defense mirror Offense's structure?
2. **Sample by game and Run / pass faced live in §1**, treating the games and
   the run/pass split as sample context rather than as their own sections.
3. **The havoc gauge is dropped as a drawing** — its number survives in two
   places and gains a film action. Confirm the arc is not wanted.
4. **`Early Downs` and `Passing Downs` merge** into one `Front by situation`
   table with paired columns instead of two side-by-side tables.
5. **`Pressure` gains an `All blitzes` total row.** It is a real aggregate over
   blitz-tagged snaps, counted as distinct plays,
   but it is a row production does not currently render.
6. **The two empty-state and disclosure strings** are rewritten per §5.
8. **The section nav is a TAB STRIP, not Offense's scroll-spy.** Five sections
   shown one at a time. This is a real divergence: Offense scrolls one
   continuous page with a sticky-style nav. If tabs are approved here, Offense
   should follow, or the two tabs behave differently for no reason a coach can
   explain. Approving Defense alone is a decision to live with that gap.
9. **The scorebug is a LINESCORE, not the implemented name/score pair.** Team
   rows with quarter columns and a total column. Same divergence question: if
   approved, Overview and Offense should adopt it, since the pair layout has
   the same formatting weaknesses on those tabs today.
10. **Disruption sits in Defensive performance, not Situational results**, and
    **Scheme by situation moved from Self-scout to Situational results.** Both
    were rebalancing calls, not content changes -- nothing was added or lost.
7. **Scorebug replaces the rail on Defense**, which means adding `defense` to
   `SCOREBUG_TABS` when this is implemented.

---

## 9 · Noted, not acted on

Recorded because they were seen while inventorying Defense. All are out of
scope for this task and none was changed.

- `SchemeDetail` uses raw hex colors (`#44ff88`, `#22c55e`, `#f59e0b`,
  `#ef4444`) and inline `style` attributes; `DefensiveSelfScout` does the same
  on its `<h4>`s. Neither file is covered by `e2e-design-system`, which scans
  `native-*.css` rather than JSX.
- `Scheme Detail` and `Defensive Analytics` are two nested section headings for
  one body of content.
- The production Defense empty state offers no route action, unlike the
  accepted Offense empty state.
