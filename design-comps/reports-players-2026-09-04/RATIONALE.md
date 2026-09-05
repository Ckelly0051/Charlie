# Reports > Players — desktop design comp, 2026-09-04

**Status: NOT APPROVED. Design comp only.** No production file was changed. The
Players tab, `individualStats`, `_individualStats`, the report kit and the
Reports CSS are all untouched at `068093a`. This file is the decision record
and the production-to-comp mapping; reviewing the comp means reading it.

Comp: `design-comps/reports-players-2026-09-04/players.html`
Captures: `design-comps/reports-players-2026-09-04/captures/` — 40 files

The comp is interactive. The four fixture states, the four role sections, and
column sorting all work, so the composition can be judged in its real states
rather than described.

---

## 0 · What the production tab is today

Read from source before drawing anything, and then verified by driving the real
route against a synthetic season (`scratchpad/players-src-probe.mjs`, not
committed — a read-only probe, no writes to the app or to disk).

`PlayersTab` (`js/native-report-tabs.jsx:540`) is eleven lines. It calls
`view.individualStats(stats, 'all', playerLabel)` and renders one `Module` per
returned table, each holding one `DataTable`. That is the whole tab.

`reports-screen.js:522` computes it as `statsEngine.compute()` — **no
arguments**. So Players is unscoped: it reports the currently loaded game (plus
any active StatsEngine filter), and it has no scope control of its own, unlike
Defense and Special Teams.

The probe's findings on the live board, at 1440 with a 14-play fixture:

| | Observed |
|---|---|
| Board | `.gi-overview-board`, six `Module`s, no toolbar, no scope, no filter |
| Buttons inside the report pane | **0** |
| Generic Reports rail | visible (Players is not in `SCOREBUG_TABS`) |
| Row activation | `title="Watch: #22's plays"`, `role="button"`, `tabindex=0` |
| `refs` on every row | **empty** |
| Grade cells | **empty on every row, including rows whose model carries `gradeSum`/`gradeCount`** |

The last two are production defects found during this inventory. Both are
recorded in §8; neither is repaired here.

---

## 1 · Capability inventory — every production capability, and where it lands

### 1a · The six role tables

Columns, labels and order are `reports-view.js`'s `individualStats()`, verbatim.
Nothing is removed, merged, renamed or reordered.

| Production table | Columns (verbatim) | Engine row order | Comp location |
|---|---|---|---|
| `Individual Rushing` | Player, Att, Yds, Avg, Long, TD, Fum, Grade | `yards` desc | All roles band 1 left; Offense band 1 left |
| `Individual Passing` | Player, C/A, Pct, Yds, TD, INT, Sck, Grade | `yards` desc | All roles band 1 right; Offense band 1 right |
| `Individual Receiving` | Player, Rec, Yds, Long, TD, Grade | `yards` desc | All roles band 2 left; Offense band 2 |
| `Individual Tackles` | Player, Tkl, Solo, Ast, Sack, TFL, INT, FR, Grade | `tackles` desc | All roles band 2 right; Defense |
| `Return Game` | Player, Ret, Yds, Avg, Long, TD | `yards` desc | All roles band 3 left; Special Teams left |
| `Kicking / Punting` | Player, FG (M/A), Punts, Punt Avg | `fgMade + punts` desc | All roles band 3 right; Special Teams right |

Every table keeps its own denominator and its own vocabulary. Nothing is summed
across roles: a player credited in three roles has three rows in three tables,
and the comp never adds them into a squad line, a rating, a ranking or a "top
performer" claim.

### 1b · Everything else the tab does

| Production capability | Source | Where it lands in the comp |
|---|---|---|
| Per-column sort, three positions (desc → asc → off) | `DataTable`, `native-report-kit.jsx:78-95` | Every header is a sortable control; `1440-populated-2-offense-sorted.png` |
| Sort headers keyboard-operable (`role=button`, `tabIndex=0`, Enter/Space) | same | Same, with a `:focus-visible` ring |
| Sort is local UI state only | same | Same — sorting changes no denominator, no row identity, no film cohort |
| Row activation → film | `PlayersTab:548` | Every row is `role=button`, `tabIndex=0`, `title="Watch: #N Name's plays"` |
| Row hover / focus affordance | `.cut-row` CSS, `native-reports.css:81-82` | `tr.cut` hover + focus-visible, plus a ▸ marker that appears on the identity cell |
| Player label with roster name | `engine._playerLabel` → `_fixedLabels` → `_seasonLabels` → `roster.getLabel` → `#N` | One identity cell, jersey picked out; `#34` shows the bare-number fallback |
| Season roster-label override | `SeasonPlayers` passes `model.rosterLabels` | Same cell; the label is whatever the chain resolves |
| A role with no players renders no module | `individualStats` pushes nothing | **Diverges — see §4.1.** The module renders and states the absence |
| Empty state | `EmptyState`, `PlayersTab:544` | `1440-no-attribution.png`, with copy changes (§3) |
| Generic Reports rail above the board | `SCOREBUG_TABS` excludes `players` | Not drawn; unchanged and not part of this proposal (§4.4) |
| Shared Reports export | `reports-screen.js:158 export(kind)` | The one `Export report` control in the report head — the existing shared action. **No Players-specific export is invented.** |
| Scope control | none exists | none drawn |
| Filter / selected-player state | none exists | none drawn |

### 1c · Film cohorts and shared credit

`_individualStats` credits **every** jersey listed on a play, so a `" + "`-joined
tackler value gives each listed player a tackle and marks it an assist
(`stats-engine.js:2559-2583`). A takeaway credited to the dedicated `takeaway`
role does **not** imply a tackle, so a player can hold `Tkl 0` beside `INT 1`.
The comp carries that exact shape as `#27 Trey Alderson`.

Two different film cohorts exist, and which one runs depends on where the tab
is rendered:

| Path | Cohort | When |
|---|---|---|
| `screen.watchRefs(row.refs, …)` | the row's OWN contributing plays | only when `row.refs` is non-empty |
| `engine._watchPlayer(row.num)` | **every** play the jersey appears in, in any role | otherwise |

`refs` are composite `gameId::playId` values built by `StatsEngine._compositeRef`,
which needs `play.__gid`. `__gid` is stamped only in the multi-game assembly
(`stats-engine.js:491`), never on the live tagger's plays. So in the **Reports >
Players tab the refs array is always empty** and the jersey cut-up is what runs;
in **Season > Players** (`SeasonPlayers`) the refs path runs. Verified by probe,
not inferred.

The comp preserves what the Players tab actually does today: every row's title
is `Watch: #N Name's plays`, the jersey cut-up. Whether it should instead play
the row's own role cohort is **open decision 4** — it is a football question,
not a layout one.

---

## 2 · Composition

### The problem the layout has to solve

Six tables, between four and nine columns each, all sharing one anchor column
that must hold a jersey number and a real name. Production stacks all six full
width, which puts a 5-column Return Game table's numbers 1,100px from its
names at 1440 — the long label-to-number eye traverse the approved Offense
composition exists to remove.

### The answer

**Bands of two role tables, and tables sized to their own content.**

- A band is an **even split**. An uneven one would put the two panels' identity
  columns at different distances from their own panel edge, and the left edge
  of the name is what a coach scans down.
- A table is `width:auto`, not `width:100%`. It ends where its content ends;
  leftover panel is whitespace beside the table, never a gap inside a row.
- The identity column has a **208px floor** and absorbs any slack above it, so a
  wide band gives a long name more room rather than spreading the numbers.
- Every measurement column has a **fixed width taken from its own header** in
  four steps (44 / 52 / 64 / 80px). A single width for all of them clipped
  `Solo`, `Sack`, `Fum` and `Punt Avg` — caught in the first capture pass, not
  in review.
- Because the widths are fixed, **a sort reorders rows and moves no column
  edge.** Asserted in the capture pass, not eyeballed.

### Sections

Four surfaces, using the same `.snav` + `.srule` pair Defense and Special Teams
already carry. **No new navigation system is introduced.**

| Section | Contents | Why |
|---|---|---|
| All roles | all six tables, three bands | the production view, composed |
| Offense | Rushing, Passing, Receiving | the three roles that share a scrimmage snap |
| Defense | Tackles | the one defensive role |
| Special Teams | Return Game, Kicking / Punting | the two specialist roles |

Justification for using section navigation at all: with a real roster the six
tables run past 1,500px at 900px of viewport, and a coach reviewing his defense
has to scroll past three offensive tables to reach the only one he wants. The
sections are the phase split the data already has — they invent no grouping.
Each nav button carries the count of **distinct players** in that section's
roles, never a sum of role rows, because the same jersey appears in several.

A section whose roles hold no attribution is **dimmed but never disabled** —
it is the one surface that says the role is unattributed. Same rule Special
Teams established for empty units.

### Colour

Module headers take the phase colour Overview and Offense already use for the
same idea: gold for our offense, cyan for our defense. Special Teams roles take
the neutral copy colour the Special Teams board gives its own modules. No new
colour is introduced.

---

## 3 · Copy changes

Every change below is a proposal for Charlie, not a decision.

| Where | Current | Proposed | The exact clarity problem |
|---|---|---|---|
| Empty-state title | `No player attribution yet` | `No player attribution` | `yet` is a promise about the future; the copy standard bans conversational and promissory framing in an empty state. The state is a fact about now. |
| Empty-state body | `Add ball carrier, passer, receiver, tackler, returner, or kicker to chart individual performance.` | `Charted plays carry no ball carrier, passer, receiver, tackler, returner, or kicker.` | Second-person instructional prose. The replacement states the same six roles as the current condition rather than as a task. |
| Grade cell, no grade charted | `—` | `No data` | One absence label across Reports, decided 2026-09-04 on Special Teams. An em dash is a second vocabulary for the same idea. |
| Kicking cells, no attempts (`FG (M/A)`, `Punts`, `Punt Avg`) | `—` | `No data` | Same. See open decision 3 — whether these are an absence at all is a football question. |
| Module titles | `Individual Rushing`, `Individual Passing`, `Individual Receiving`, `Individual Tackles` | `Rushing`, `Passing`, `Receiving`, `Tackles` | Every module on a tab called Players is individual, so the word distinguishes nothing — and two of the six tables (`Return Game`, `Kicking / Punting`) already omit it, so it is not even applied consistently. The board carries no team table it could be confused with. |

**Considered and NOT proposed:**

- `Sck` (Passing) versus `Sack` (Tackles) — the same event abbreviated two ways
  from the two sides of the ball. Both are current production vocabulary and
  both are unambiguous in place. Changing one to match the other is a football
  vocabulary decision, not a layout one; recorded here rather than made.
- Every column abbreviation (`Att`, `Tkl`, `TFL`, `FR`, `C/A`, `FG (M/A)`) is
  kept exactly as production writes it. No abbreviation was invented.

---

## 4 · Intentional divergences from production and from the other tabs

**4.1 · A role with no attribution renders its module and says so.** Production
omits the module entirely, which is a silent absence: a coach cannot tell "we
charted no returner" from "returns are not in this report". This is the exact
problem the Special Teams six-card unit ledger was approved to fix on
2026-09-04, and the role set is likewise fixed and enumerable. The module shows
`No player attribution` in copy weight and **no number of any kind**. Visible in
every `sparse` capture. *Diverges from production. Open decision 1.*

**4.2 · Section navigation.** Offense scrolls one page; Defense and Special
Teams use section tabs. Players joins the tabbed group. This deepens the known
temporary inconsistency already recorded in `CLAUDE.md` open item 8, and is
listed as **open decision 2** rather than assumed.

**4.3 · Bands of two rather than a single stacked column.** Production stacks;
this pairs. Reason in §2.

**4.4 · The generic Reports rail is not drawn.** Players is not in
`SCOREBUG_TABS` and keeps the generic rail. The comp does not reproduce or
restyle it, matching how the approved Special Teams comp handled the same
chrome. Nothing here proposes a change to it.

**4.5 · No KPI band.** Offense has six tiles, Defense eight, Special Teams six.
Players has none, deliberately: every honest board-level number here would
either be a count already visible in a table header, or a cross-role aggregate
that the assignment and the football both forbid. The `Sample` line carries the
denominators instead.

---

## 5 · Considered and not added

| Feature | Why not |
|---|---|
| A per-player cross-role summary (one row per player, all roles) | It requires a squad-level denominator that does not exist and reads as a rating. Production has no such view. |
| Any ranking, composite score, star, badge, or "leader" marker | Explicitly excluded by the assignment, and by the football: a rushing yard and a tackle do not share a scale. |
| Sorting the roster alphabetically by default | Would replace the engine's own row order, which is a real editorial choice (`yards` desc, `tackles` desc). Sorting by name is available on the Player column; it is not the default. |
| A player filter or search box | No such capability exists in production. Inventing it here would put an unbuildable control in an approved comp. |
| A Players-specific export | Production has only the shared Reports export. Ruling 1 on Special Teams — reuse the existing mechanism, never a second subsystem — applies unchanged. |
| A scope control (Full season / Current game) | Players computes unscoped today. Adding scope is an engine and controller change, not a composition; recorded as open decision 5. |
| A grade distribution chart or trend | Grades are a per-role average of charted plays. A chart implies a denominator the model does not publish. |
| Wide profile cards per player | Explicitly excluded; they cost the table width that identity needs. |

---

## 6 · Zero versus absence — the exact handling

| Case | Treatment | Why | Seen in |
|---|---|---|---|
| A charted count of zero (`TD 0`, `Fum 0`, `INT 0`) | `0`, full strength | It was counted. A measured zero is an observation. | every populated capture |
| `#27 Trey Alderson`, `Tkl 0 / Solo 0 / Ast 0` beside `INT 1` | zeros at full strength | He is in the table because a takeaway was credited to him; he made no tackle. That is a fact, not a gap. | `*-populated-3-defense.png` |
| `#16 Cody Fairbanks`, `Ret 2 / Yds 0 / Avg 0.0 / Long 0` | zeros at full strength | Two returns were fielded for no yards. | `*-populated-4-special-teams.png` |
| `#34`, `Yds -3 / Avg -0.8` | rendered and coloured as a loss, never floored at zero | Same rule the Special Teams board uses for a returner at negative yards. | `*-populated-1-all-roles.png` |
| No grade charted in that role | `No data`, copy weight | An ungraded rep is not a grade of zero. `gradeCount === 0` is a different fact from an average of 0.0. | `*-no-grades-*.png` |
| A kicker with no field-goal attempt | `No data`, copy weight | Follows production's non-numeric treatment, converted to the approved literal. **Whether this is an absence at all is open decision 3.** | `#45 Harrison Blyth` |
| A role with no attributed player | module renders, body reads `No player attribution`, **no number** | Unattributed is not zero production. | `*-sparse-*.png` |
| No attributed player anywhere | the empty state, no tables | | `*-no-attribution.png` |

An absence never sorts as if it were the smallest measured value: absences are
held at the bottom in **both** sort directions. Asserted mechanically in the
capture pass (`grade ascending: -1.0 | +0.4 | +1.8 | No data`), because an
absence floating above a real negative grade would read as the worst grade on
the team.

---

## 7 · Fixtures

Synthetic and football-plausible. **No coach data is used or copied.** Every
figure reconciles against its own denominator:

- Rushing `Avg` is `Yds / Att` to one decimal on all four rows.
- Passing `Pct` is completions over attempts: `18/29 → 62.1%`, `1/3 → 33.3%`.
- Receiving totals **19 receptions for 223 yards**, which is exactly the
  passing line's `18/29 + 1/3 = 19` completions and `214 + 9 = 223` yards.
  Receiving TDs total 2, matching passing TDs.
- Tackles: `Solo + Ast = Tkl` on every row, including `0 + 0 = 0`.
- Return `Avg` is `Yds / Ret`: `118/5 = 23.6`, `21/3 = 7.0`, `0/2 = 0.0`.
- Each table's default order is the engine's own sort for that role, checked
  row by row.
- Section counts are **distinct jerseys**: All roles 15, Offense 8, Defense 4,
  Special Teams 5 — and the 15 is the union, not a sum of the three.

States covered: populated multi-role roster · long names and two-digit jerseys
(`Terrance Whitfield-Boateng`, `Christopher Vanderhoeven`, `Dominic
Ferraro-Nwosu`, `Rafael Ostrowski-Vance`) · a jersey with no roster name
(`#34`) · one player in three roles (`#22`) and two players in two (`#12`,
`#7`) · shared-credit tackles (`Ast 5`, `Ast 6`) · a takeaway with no tackle
(`#27`) · grades present · grades absent everywhere · sparse attribution ·
measured zeros · missing measurements · no attribution at all · sort active.

---

## 8 · Production defects found during the inventory — RECORDED, NOT REPAIRED

Neither is fixed here; both are implementation dependencies for whoever builds
this tab.

**8.1 · P1 — the Grade column renders empty on every row, always.**
`individualStats` builds each row with `...grade(r)`, and `grade()` returns
`{ text, cls }`. Spreading that gives the row a `text` key and a `cls` key —
but the column's key is `grade`, so `row['grade']` is `undefined` and the cell
is blank. `row.cls` is dead too: `DataTable` reads `row.class`, not `row.cls`.
Reproduced on the live route: `#22` carries `gradeSum: 5, gradeCount: 2` in the
model and renders an empty Grade cell.

Two further pieces are missing behind it: the `grade-pos` / `grade-neg` classes
`grade()` produces have **no CSS rule anywhere in the repo**, so even a
corrected cell would render uncoloured. The comp shows the intended behavior —
a signed one-decimal average, coloured by sign, `No data` when ungraded.

**8.2 · P2 — four columns sort lexically because they are not marked
`numeric`.** `C/A`, `Pct`, `Punts`, `Punt Avg` and `FG (M/A)` are declared
without the `numeric` flag, so `DataTable` compares them with
`localeCompare`. `Punt Avg` sorts `34.5` below `9.5`; `Pct` will sort `100.0%`
below `62.1%` the first time a passer completes every attempt. The comp sorts
every column by what it measures (a compound value on its first number, a
percentage on its number), which is what the columns look like they do.

**8.3 · Recorded, unrelated, not repaired.** The Return Game row reads a
returner's yards from the generic `tags.yardage`, while the Special Teams unit
reads `tags.returnYards` — so the two boards can disagree about the same
return. Already listed after the Special Teams batch; repeated here because it
is visible on this tab.

---

## 9 · Responsive behavior

| Width | Behavior |
|---|---|
| 1920 × 1080 | Bands pair. Identity column takes the slack above its 208px floor. |
| 1440 × 900 | Bands pair. Tackles, the widest table, measures 668px inside a 680px half. |
| 1280 × 720 | **Bands stack.** Measured, not chosen: a band half gives 599px of usable width and Tackles measures 668px. The only way to pair at 1280 is to take it out of the identity column, which is the one column that may not shrink. |

At all three widths, mechanically asserted over all 13 state × section
combinations: **no page-level horizontal scroll, no clipped text node, no text
below 9.5px, and no table scroller engaged.** The `.twrap` bounded scroller
exists so a narrower host cannot clip a column; it does not engage at any
release width.

Hover and focus change colour and background only — a focused row measured
identically before and after (`{w:668,h:36}` → `{w:668,h:36}`).

---

## 10 · Screenshot matrix

40 captures. Each was taken with the intended section activated, the pointer
parked off-canvas at (4000, 4000), and the viewport grown to the full board so
nothing below the fold is lost.

| | 1920 | 1440 | 1280 |
|---|---|---|---|
| Populated — All roles / Offense / Defense / Special Teams | 4 | 4 | 4 |
| Populated — Offense, sorted by `Long` | — | 1 | — |
| No grades — 4 sections | 4 | 4 | 4 |
| Sparse — 4 sections | 4 | 4 | 4 |
| No attribution | 1 | 1 | 1 |

---

## 11 · What was visually inspected, and what was not

**Opened and inspected image by image:** `1440-populated-1-all-roles`,
`1280-populated-1-all-roles`, `1920-populated-1-all-roles`,
`1440-sparse-1-all-roles`, `1440-no-grades-3-defense`,
`1440-populated-4-special-teams`, `1440-populated-2-offense-sorted`,
`1440-no-attribution`. Checked in each: identity column start and stability,
numeric right-alignment down the column, header-to-row alignment, absence
versus zero treatment, grade colour, section nav state, table edges, vertical
rhythm, and the content below the first fold.

**Four defects were found by looking at the images and fixed before this
report:** the empty state rendered on top of a fully populated board
(`.empty{display:flex}` outranks the `[hidden]` attribute); a duplicate
`Export report` control, which would also have implied a Players-specific
export that does not exist; a `15`-player nav count contradicting a `13`-player
sample line; and a stretched table at 1280 that reopened the label-to-number
eye traverse. A further four — clipped `Solo`/`Sack`/`Fum`/`Punt Avg` headers,
a 9px sort caret below the type floor, a scroller engaging at 1280, and a
missing space in the identity cell's text — were caught by the capture pass's
own audit before any image was opened.

**Not inspected, and not claimed:**

- The remaining 32 captures were produced by the same pass and passed the same
  mechanical audit, but were not opened one by one.
- **Mobile and tablet** (768×1024, 390×844) were not designed or captured. The
  assignment scoped this to desktop.
- **The opponent-scout perspective.** `_renderOpponentTab` has no `players`
  branch, so no opponent Players view exists to design.
- **No production code was run against this comp, no harness was written or
  run, and no gate was run** — all excluded by the assignment.
- **Real coach data was not used**, so the comp is not evidence about how the
  coach's own roster renders. Long names were made long on purpose; his may be
  longer or shorter.
- **No Charlie Gate.** This is a comp awaiting approval, not accepted state.

---

## 12 · Open decisions for Charlie

1. **Should a role with no attributed player render an empty module?** The comp
   says yes, following the Special Teams unit-ledger ruling. Production omits
   it. This is the one structural divergence.
2. **Should Players use section tabs?** Defense and Special Teams do; Offense
   still scrolls. Approving this deepens a known temporary inconsistency until
   Offense converts.
3. **Is a kicker with no field-goal attempt an absence or a measured zero?**
   The comp prints `No data`, following production's non-numeric treatment. The
   other reading is `0/0` — we charted his snaps and none was a field goal.
   Football question, not a layout one.
4. **Which film cohort should a row play?** Today the Players tab plays the
   **jersey cut-up** (every snap that jersey appears in, in any role), because
   `refs` is always empty there. Season > Players plays the **row's own
   contributing plays**. Two boards, two answers, from one line of code. The
   comp preserves current Players-tab behavior and does not choose.
5. **Should Players gain a scope control?** It reports the loaded game only.
   Adding Full season / Current game is an engine and controller change, not a
   composition one, so it is not drawn.
6. **The four module renames** (`Individual Rushing` → `Rushing`, and the three
   like it), and the two `—` → `No data` conversions.
7. **The 1280 stack.** Pairing at 1280 is possible only by shrinking the
   identity column below 208px. The comp refuses; if a narrower identity column
   is acceptable to him, the pairing can hold at 1280 too.
