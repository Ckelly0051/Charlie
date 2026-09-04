# Reports > Special Teams — desktop design comp, 2026-09-04

**Status: COMP ONLY. Not implemented. Awaiting Charlie's approval.**
No production file was touched.

Comp: `design-comps/reports-special-teams-2026-09-04/special-teams.html`
Captures: `design-comps/reports-special-teams-2026-09-04/captures/` (78 files)

The comp is interactive. The scope control, the unit navigation, and the
populated / real-data / one-unit / empty / long-label states all work, so the
composition can be judged in its real states rather than described.

---

## 0 · The finding that shaped the whole design

Before drawing anything I read the coach's real seasons through the running
app (`StatsEngine.compute()` + `_specialTeamsSummary()` over
`_specialTeamsCohort()`), rather than replicating the formulas by hand.

**The 2025 JV season has 74 Special Teams snaps and every one of them is
legacy-charted. Zero structured events exist in any season.** Kick distance was
entered on 0 of 74 plays, hang time on 0, return yardage on 1.

The engine's real output for that season:

| | Value |
|---|---|
| Kickoffs | 21 · distance **null** · TB 0% · fair catch 29% · return allowed **null** · onside **null** |
| Kick returns | 12 snaps, **0** returns attempted, avg **null**, 1 muffed |
| Punts | 10 · gross **null** · net **null** · hang **null** · 1 blocked |
| Punt returns | 9 snaps, 1 attempted, 5 yds, avg 5.0 |
| Field goals | **0 attempts** |
| FG block | **null** — legacy has no block unit at all |
| Tries | 18 attributable of **21 charted**, 10 made |
| Points | 10 us / 3 them |
| Impact | 8 tries missed, 1 punt blocked, 1 muffed return |
| Specialists | 7 returners (one at **−2 yards**), 3 kickers |

**Eight of the fourteen measurement fields come back null.** A layout built
around distance, hang time, and net averages renders a wall of em-dashes
against the coach's actual film. So the composition leads with what *is*
charted — snap counts by unit, outcomes, scoring, and personnel — and treats
measurement as a second, explicitly-labeled layer.

This is also why the assignment's "empty units must not look like zero
performance" is the load-bearing requirement here rather than a side note.

---

## 1 · Three absences that must look different

The single most important design decision. The report has to distinguish:

| State | Treatment | Real example |
|---|---|---|
| **No snaps charted** | Unit card dimmed, reads `Not charted / No snaps in this scope`. **No number is drawn.** | Field Goal in 2025 JV |
| **Structurally underivable** | Unit card dimmed, reads `Not derivable / Legacy charting has no block unit` | FG Block in any legacy season |
| **Snaps charted, measurement missing** | Count shown at **full strength**; the measurement line drops to copy weight and reads `not charted` | 10 punts with no gross distance |
| **Genuinely observed zero** | A real `0`, in full strength, with its denominator | 0% touchback on 21 kickoffs; 0 muffed punt returns |

An absent measurement is never a large em-dash. `.kpi.is-blank strong` drops
from 30px condensed to 17px in muted ink, so a coach cannot read absence as a
bad number. Same rule inside the modules (`.srow > strong.blank`).

The current production tab **omits a phase card entirely** when its count is
zero. That is honest but invisible: the coach cannot tell "we never charted
punt returns" from "punt returns aren't in this report". The unit ledger shows
all six units, always.

---

## 2 · Composition — a six-column rhythm, ST's own number

Offense runs twelve columns because its KPI band is six tiles. Defense runs
four because its band is eight. **Special Teams runs six, because the model
defines six units and the ledger is six cards.**

Every band divides on a line the KPI band already uses: two-column bands are
3fr/3fr, three-column bands are three 2fr tracks, the specialists split is
4fr/2fr. Nothing lands between two rules — the mistake Offense had to correct
when a generic 65.9% split missed its band's 66.7% by under a percent.

Top to bottom:

1. **Scope toolbar** — Full season / Current game, sample line, Export
2. **KPI band, six across**
3. **Unit ledger, six across** — every unit, always
4. **Reconciliation line** — every snap accounted for
5. **Legacy banner** — only when the season is legacy-charted
6. **Unit navigation, five surfaces**
7. **The selected surface**

### 2a · Why the KPI band is six, not seven

Production has seven KPI tiles. The seventh is **Impact Plays**, whose tile
shows a count plus the labels joined into one string. That same measure already
has its own module in the report, with a row per impact type **and a film link
per row**. The tile was the weaker of two presentations of one measure.

**Nothing is removed.** Impact Plays keeps its module in Specialists. The
demotion is from a duplicate summary tile to the richer surface, and it lets
the band sit on the board's own six-column rhythm instead of leaving a ragged
seventh.

The six that lead: ST Snaps · Points · Field Goals · Conversions · Return
Production · Coverage Allowed.

---

## 3 · Unit navigation — five surfaces (decision recorded, as asked)

The assignment asked for a compact unit navigation **only if needed**, with the
decision recorded explicitly. It is needed, and here is the reasoning.

Six units × (stat rows + outcome distribution) + distance buckets +
three specialist tables is roughly 2,400px of board on one scroll. Defense
proved that a report carrying several distinct bodies of analysis reads as one
undifferentiated page when they are only scroll anchors.

**But the navigation is five surfaces, not six or seven**, and it is not one
unit per tab:

| # | Surface | Contains |
|---|---|---|
| 1 | All units | All six units side by side, kicking beside receiving |
| 2 | Kickoff & Kick Return | Both units in full, each with its own outcome distribution |
| 3 | Punt & Punt Return | Same |
| 4 | Kicking game | Field Goal, FG Block, Tries, plus distance buckets |
| 5 | Specialists | Return game, kicking/punting, impact plays |

**Kickoff stays distinct from Kick Return, and punt from punt return.** They
are separate modules with separate denominators that never merge. They are
*co-located* because a coordinator studies the coverage unit against the return
unit — which is exactly Hudl IQ's framing and §6 of the Special Teams model.
Co-located is not combined.

Section 1 exists so the whole picture is reachable in one view, which is what
the ledger is for and what the current tab does today.

**Each badge is a snap count, not an ordinal.** A first pass numbered the
first tab `1` and gave the other four counts; it read as an ordinal beside four
totals. Caught by looking at the capture.

A surface whose units hold no snaps is **dimmed but never disabled** — it is
the one place that explains the absence.

---

## 4 · Production-to-comp capability mapping

Every capability in `SpecialTeamsTab`, `SpecialTeamsPhase`,
`SpecialTeamsPlayerTable`, `specialTeamsKpis`, `specialTeamsPhases`, and
`individualStats(stats,'special')`. **Nothing is dropped.**

### Controls, scopes, and actions

| Production | Comp | Note |
|---|---|---|
| `screen.specialTeamsScope` Full season / Current game | Scope toolbar, unchanged | Default season, as today |
| `_specialTeamsCohort()` → `_selfPerspectiveCohort` | Unchanged | Self-perspective only |
| `fixedScope` (Season tab, opponent tab) | Toolbar renders without the scope group | Unchanged contract |
| `toolbarAction` slot (`OpponentWatch`) | Preserved in the toolbar | Used by `OpponentSpecialTeamsTab` |
| `title` prop ("Their Special Teams") | Report head sub | Unchanged |
| `EmptyState` "No Special Teams snaps charted" | Same copy, same state | Unchanged |
| Per-phase `WatchableRefs` (whole card = one film action) | Ledger card is the phase film action | Same refs, `refs.all` |
| Row `onActivate` → `screen.watchRefs(refs,label)` | Every table row, bucket, outcome bar, impact row | Composite `gameId::playId`, unchanged |
| — | **Export** | **NEW — see §7 open decisions** |

### Measures

| Production field | Comp location |
|---|---|
| `summary.snaps.n` | KPI · ledger reconciliation |
| `summary.points.us/them` | KPI Points |
| `summary.impact[]` | Impact plays module (Specialists) |
| `st.kickoffs.n / avg / tbPct / fairCatchPct / retAllowedAvg / retAllowedYards / onside` | Kickoff module — all seven, `retAllowedYards` now shown as the honest total beside the average |
| `st.returns.kick.n / attempts / avg / yards / long / td / muffed` | Kick Return module — all seven; `n` and `attempts` are separate rows because they are separate denominators |
| `st.punts.n / grossAvg / netAvg / hangAvg / tbPct / fairCatchPct / blocked / retAllowedAvg / retAllowedYards` | Punt module — all nine |
| `st.returns.punt.*` | Punt Return module |
| `st.fg.att / made / pct / long` | Field Goal module |
| `st.fg.byDist[]` | Field goals by distance band |
| `st.blocks.n / blocked` | **FG Block module — NEW SURFACE.** Computed today, never rendered |
| `st.tries.n` | Tries module + reconciliation |
| `conv.xp.att/made`, `conv.two.att/made` | Tries module + Conversions KPI |
| `individuals.returners[]` | Return game table |
| `individuals.kickers[]` | Kicking and punting table |

### Fields the engine computes today and the current tab never renders

All six are now surfaced. None is a new formula.

1. `punts.fairCatchPct`
2. `kickoffs.fairCatchPct`
3. `kickoffs.retAllowedYards` (the total behind the average)
4. `punts.retAllowedYards`
5. `blocks.n` / `blocks.blocked` — **the entire FG Block unit**
6. `returns.*.muffed` as its own row (previously reachable only via Impact)

---

## 5 · Football correctness

**No invented success rate.** The assignment forbade combining unlike
opportunities into one rate, and none exists. A kickoff, a punt, a field goal,
and a two-point try are not attempts at the same thing. Every rate in the comp
divides by its own unit's own denominator, and every denominator is named.

**Kick distance, return yards, and net stay three different things**, per §4
and §7 of the model. The §2 footnote states it on the surface:

> Kick distance is gross, measured from the kicking spot, and is never
> negative. Return yards allowed run from the returner's possession to the ball
> being dead and may be negative. The two are separate measurements and are
> never added together.

They are never summed and never share a column. Negative return yards are
rendered and colored, never floored at zero — the real season has a returner at
**−2 yards on three returns**.

**Scoring kicks are separate from their defensive counterparts.** Field Goal
(attempting) and FG Block (defending) are separate modules with separate
denominators, labeled by `subjectRole`. Tries are separate from field goals
entirely, per §4b.3 — `fieldGoal` is exclusively for field goals.

**Snaps reconcile.** A line under the ledger accounts for every snap:

> 74 snaps = 21 kickoff + 12 kick return + 10 punt + 9 punt return + 21 tries
> + **1 not assigned to a unit** — charted under a label the current model has
> no unit for.

That last term is real: the 2025 JV season holds one play tagged
`stType: 'Fake'`, which matches no `by()` bucket in the legacy branch and is
therefore **invisible in every phase card today while still counting in the ST
Snaps KPI**. The reconciliation line is what makes that visible instead of
silently absorbing it.

---

## 6 · Fixtures

| State | Source |
|---|---|
| **Populated (season)** | Invented, structured, all six units charted — the design at full capability |
| **Populated (game)** | A one-game subset of the same |
| **Real data** | **Not invented.** The exact engine output for `2025-st-joseph-mavericks-jv`, read out of the running app |
| **One unit** | Only the punt team charted; the other five units hold zero snaps |
| **No ST snaps** | Empty |
| **Long labels** | Longest realistic program, opponent, and roster names |

Denominators reconcile in every fixture: the ledger sum plus the unassigned
term equals the ST Snaps KPI, and the Conversions KPI equals the Tries module's
attributable count.

**Fixture reconciliation is mechanical, not asserted in prose.** Codex found
two fixture defects by reading the numbers, and neither was visible to a layout
audit. Forty checks now run before any capture is taken:

- every unit's outcomes are mutually exclusive and sum to no more than its
  snap count;
- a returns-allowed denominator equals that unit's own `Returned` count, never
  its snap count;
- `points.us` equals what `StatsEngine.playPoints()` would actually score over
  the charted events — field goal 3, kick XP 1, two-point try 2, touchdown 6.

The season fixture's points are enumerated in a comment beside the value, so
the number can be audited without re-deriving it.

---

## 7 · Open product decisions — for Charlie

None of these is implemented. Each needs a call.

1. **Export.** The comp shows an Export control in the toolbar. Overview and
   Offense have export paths; the Special Teams tab has none today. Ship it,
   drop it, or defer?

2. **Tries: 21 charted, 18 attributable.** `_conversionStats` counts a legacy
   try only when `scoringSide(p) === 'us'`; three of the coach's 21 XP plays
   carry no scoring side, so the report says 18. The comp shows a
   `Charted, not attributable` row. Is that the right disclosure, or should the
   denominator be the charted 21?

3. **A kicker shows an FG attempt the FG unit does not.** In the real season,
   `individuals.kickers` credits #99 with 1 field-goal attempt while
   `st.fg.att` is 0 — `_individualStats` and `by('Field Goal')` classify
   differently. The comp renders both honestly. Which is right?

4. **The legacy punt-net formula.** The legacy branch subtracts a fixed 20
   yards on a touchback. §5 of the model calls touchback placement
   ruleset-dependent and says the app must not invent an adjustment when no
   ruleset is configured — and none is. Flagged on the §3 surface as an open
   decision. Fix the formula, configure a ruleset, or leave it?

5. **`yardage` and `result` are charted on ST plays and never read.** The real
   season carries Gain / No Gain / Loss / Fumble and a yardage on most ST
   snaps. No Special Teams measure consumes them. Is there a coaching question
   they should answer?

6. **The `Fake` label has no unit.** One real play. The model says a fake is a
   modifier on a kick unit, not its own unit, but the legacy `stType: 'Fake'`
   has no home. Leave it in the unassigned line, or map it?

7. **SHARED CHROME, not this tab.** At 1280 the context bar's Game value clips
   by 48px against a long opponent name. The comp wraps it to a second line
   instead. That is a change to shared chrome and belongs to the shell owner —
   the alternative is keeping today's ellipsis-plus-tooltip and accepting the
   clip. Needs your call, and it is the only thing in this comp outside the
   Special Teams tab.

8. **Scorebug.** Special Teams is **not** in `SCOREBUG_TABS` and still renders
   the generic rail. The linescore was approved for Defense only, with rollout
   deferred to you, so this comp proposes no scorebug and leaves the decision
   open.

---

## 8 · Verification — what was and was not checked

### Checked

- **78 captures**: 3 widths (1920×1080, 1440×900, 1280×800) × 5 sections ×
  {populated-season, populated-game, real, one-unit, long-labels} + empty.
- Every capture **activates its section control first** and asserts that
  exactly one section rule is visible and that it is the intended one, and that
  every body block under it rendered content. The pointer is parked off-canvas
  so no hover state contaminates a capture.
- **Zero page-level horizontal scroll** at all three widths, all states.
- **Zero truncated text** anywhere on screen — any leaf whose `scrollWidth`
  exceeds its `clientWidth` by more than 1px fails, excluding only the two
  declared bounded scrollers (`.twrap`, the tab strip).
- **Zero console or page errors.**
- Real-season figures verified against the running engine, not recomputed.
- **40 fixture-reconciliation checks** (§6) run before any capture.
- **Type floor**: no text anywhere on the board renders below 9.5px, the floor
  the Offense board already holds.
- All four of those checks are **mutation-verified** — each was run against a
  copy carrying its own defect and reds naming that defect.
- Every interactive element has rest / hover / `:focus-visible` states that do
  not change layout dimensions.

### Codex review, 2026-09-04 — three findings, all correct, all fixed

1. **The season fixture's Points KPI reconciled to nothing.** It read 43 while
   the same fixture charted 8 made field goals, 31 extra points, 2 two-point
   tries, and a kick-return touchdown. Verified against `playPoints()`: that is
   **65**. Corrected, and the composition of both sides is now enumerated in a
   comment beside the value. `points.them` (8) was already coherent — a blocked
   punt the opponent recovered and returned, plus a safety — and both
   attributions are ones `scoringSide()` actually produces.
2. **The one-unit fixture's punt outcomes exceeded its snap count** — 14 punts
   against 16 dispositions. Outcomes are mutually exclusive, so this was
   impossible. Corrected to 5 fair catch + 6 returned + 2 touchback + 1 downed,
   and the returns-allowed denominator moved from 8 to the 6 returns that
   actually occurred.
3. **One label sat below the type floor.** The unit ledger's role label
   (`Kicking` / `Receiving` / `Attempting` / `Defending`) shipped at 9px,
   reproducing the undersized text already on the polish backlog. Raised to
   9.5px in place; it sits on its own line above the unit name, so nothing else
   tightened.

Findings 1 and 2 were errors in my fixtures, not in the composition — but a
fixture is part of the evidence, and a comp reviewed against numbers that do
not add up is not reviewable. Both classes are now caught mechanically rather
than by a careful reader.

### Defects found by looking at the captures, and fixed

Four, none of which the automated audit could see:

1. The scope control read **Current game** while showing full-season figures,
   because the fixed-dataset fixtures ignore scope. Scope is now forced to
   season and the game button disabled for those states.
2. The section badges mixed an **ordinal `1`** with four counts.
3. **Dead space under the short module** in every paired band. Bands are now
   `align-items:stretch` — which is *not* the treatment Offense and Defense
   rejected: those bands paint their rule color as a background, so a stretched
   short module showed a slab; this band's background is transparent and its
   rules are box-shadows, so stretching paints only the module's own panel.
   Rows keep their rhythm; the rejected fix was stretching table *rows*.
   Kickoff also gained its onside line in section 1, pairing it against Kick
   Return's seven rows instead of leaving it two short.
4. The **kicking-game band** left ~116px of empty panel under FG Block and
   Tries. The field-goal outcome bars moved out from under the Field Goal stat
   rows to sit beside the distance buckets, and the band now runs 4/3/3 rows.
5. The empty state carried the **previous fixture's identity** in the context
   bar.

### Not checked

- **No production code was run, changed, or reviewed against this comp.** It is
  a comp; the tab is untouched.
- **No harness, and no gate run** — the assignment excluded both. The capture
  script lives in `scratchpad/`, is not part of the gate, and is not committed.
- **Mobile and tablet** (768×1024, 390×844) were not designed or captured. The
  assignment scoped this to desktop.
- **The Opponent Scout variant** (`OpponentSpecialTeamsTab`) is mapped in §4
  but has no capture — no opponent-scout ST film exists in the coach's seasons
  to render it against.
- **Structured-charting states were not validated against real data**, because
  none exists: all 74 real ST snaps are legacy. The populated fixture is
  plausible and internally reconciled, but it is invented.
- **No Charlie Gate.** This is a comp awaiting approval, not accepted state.
