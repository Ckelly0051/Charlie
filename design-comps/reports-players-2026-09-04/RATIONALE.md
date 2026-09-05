# Reports > Players — desktop design comp, 2026-09-04

**Status: NOT APPROVED. Design comp only.** No production file was changed. The
Players tab, `individualStats`, `_individualStats`, the report kit and the
Reports CSS are all untouched. **Revision 3, 2026-09-05** — presentation
alignment against the approved Offense / Defense / Special Teams comps; see
§15. This file is the decision record and the production-to-comp mapping;
reviewing the comp means reading it.

Comp: `design-comps/reports-players-2026-09-04/players.html`
Captures: `design-comps/reports-players-2026-09-04/captures/` — 93 files

The comp is interactive. The four fixture states, both scopes, the four role
sections, and column sorting all work, so the composition can be judged in its
real states rather than described.

**Revision 2, 2026-09-04.** Charlie reviewed revision 1 REVISE and ruled on all
seven open decisions. Five findings and six rulings are applied; §13 records
exactly what changed and what each ruling settled.

**Revision 3, 2026-09-04.** One finding: the approved empty-state body was
recorded in §3 and never applied to the markup. Applied, and the capture pass
now asserts approved copy against the rendered board (§11).

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
| Per-column sort, three positions (desc → asc → off) | `DataTable`, `native-report-kit.jsx:78-95` | Every header is a sortable control; `1440-populated-game-2-offense-sorted.png` |
| Sort headers keyboard-operable (`role=button`, `tabIndex=0`, Enter/Space) | same | Same, with a `:focus-visible` ring |
| Sort is local UI state only | same | Same — sorting changes no denominator, no row identity, no film cohort |
| Row activation → film | `PlayersTab:548` | Every row is `role=button`, `tabIndex=0`, `title="Watch: #N Name — <Role>"` (ruling 4, §1c) |
| Row hover / focus affordance | `.cut-row` CSS, `native-reports.css:81-82` | `tr.cut` hover + focus-visible, plus a ▸ marker that appears on the identity cell |
| Player label with roster name | `engine._playerLabel` → `_fixedLabels` → `_seasonLabels` → `roster.getLabel` → `#N` | One identity cell, jersey picked out; `#34` shows the bare-number fallback |
| Season roster-label override | `SeasonPlayers` passes `model.rosterLabels` | Same cell; the label is whatever the chain resolves |
| A role with no players renders no module | `individualStats` pushes nothing | **Diverges — see §4.1.** The module renders and states the absence |
| Empty state | `EmptyState`, `PlayersTab:544` | `1440-no-attribution-game.png`, with copy changes (§3) |
| Generic Reports rail above the board | `SCOREBUG_TABS` excludes `players` | Not drawn; unchanged and not part of this proposal (§4.4) |
| Shared Reports export | `reports-screen.js:158 export(kind)` | The one `Export report` control in the report head — the existing shared action. **No Players-specific export is invented.** |
| Scope control | none exists | **Added by ruling 5** — Current game / Full season, defaulting to Current game (§13.6) |
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

**Ruled 2026-09-04: a row plays its OWN role cohort.** Clicking a rushing row
opens the carries that produced that rushing line, not every snap the jersey
appears in. That matches analytical provenance and matches Season > Players.
The comp's rows read `Watch: #22 Terrance Whitfield-Boateng — Rushing`, so a
coach can tell a rushing cut-up from a receiving one before it plays.

**This is an implementation dependency, not a presentation change.** The refs
path already exists and is already correct; what is missing is that the Players
tab's cohort is never stamped with `__gid`, so `_compositeRef` returns null and
every row falls back to `_watchPlayer`. Production must produce valid
game-scoped composite references for the Players cohort rather than fall back.
The fallback must not survive: with the ruling applied, a row that cannot build
its refs would silently play a different, larger cohort than the one it
displays.

---

## 2 · Composition

### The problem the layout has to solve

Six tables, between four and nine columns each, all sharing one anchor column
that must hold a jersey number and a real name. Production stacks all six full
width, which puts a 5-column Return Game table's numbers 1,100px from its
names at 1440 — the long label-to-number eye traverse the approved Offense
composition exists to remove.

### The answer

**Bands of two role tables, and tables that fill their own panel.**

- A band is an **even split**. An uneven one would put the two panels' identity
  columns at different distances from their own panel edge, and the left edge
  of the name is what a coach scans down.
- A table is `width:100%` with `table-layout:fixed` — the treatment every
  accepted Defense and Special Teams table uses. It ends where its **panel**
  ends, so a row's hover highlight spans the panel and two stacked bands share
  one right edge. *(Revision 3 reversed revision 1's `width:auto` — see §15.)*
- The identity column has a **208px floor** and absorbs any slack above it, so a
  wide band gives a long name more room rather than spreading the numbers.
- Every measurement column has a **fixed width taken from the widest thing it
  must hold** — its own header or a full-season figure — in six steps
  (44 / 54 / 60 / 72 / 74 / 86px). A single width for all of them clipped
  `Solo`, `Sack`, `Fum` and `Punt Avg`; a four-step set sized against the
  current-game fixture alone then let a season `122/201`, a four-digit season
  yardage and `Punt Avg` overrun their columns.
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

The section rule carries the section name and its attributed-role count, and
nothing else. Revision 1 gave each section a sentence of explanation ("a role
with no attribution says so rather than showing a zero"); that describes how
the interface behaves rather than reporting football, which the copy standard
excludes. The behavior is visible on the board.

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
| Empty-state body | `Add ball carrier, passer, receiver, tackler, returner, or kicker to chart individual performance.` | `No players are attributed to charted plays.` | Second-person instructional prose. Charlie's wording, ruling 6. |
| Grade cell, no grade charted | `—` | `No data` | One absence label across Reports, decided 2026-09-04 on Special Teams. An em dash is a second vocabulary for the same idea. |
| `FG (M/A)`, no attempts | `—` | `0/0` | **Ruling 3.** It is a pair of counts. His snaps were charted and none was a field goal, so it is a measured zero, not an absence. |
| `Punts`, none | `—` | `0` | **Ruling 3.** Same — a count. |
| `Punt Avg`, no punts | `—` | `No data` | **Ruling 3.** A quotient with no denominator. Genuinely unavailable, unlike the two counts above. |
| Section rule descriptions (new in revision 1) | — | **removed** | They explained interface behavior rather than reporting football. Ruling 6. |
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
`No data` in copy weight and **no number of any kind**, with the header meta
(the player count) suppressed so the module does not print the absence twice.
Visible in every `sparse` capture. *Diverges from production. Open decision 1.*

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
| ~~A scope control~~ | **Now added by ruling 5** — Current game / Full season, defaulting to Current game. Kept in this table so the record shows it was a deliberate ruling, not a quiet addition. |
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
| `#45 Harrison Blyth`, `FG (M/A) 0/0` | `0/0`, full strength | A pair of counts. His snaps were charted and none was a field goal. | `*-populated-*-4-special-teams.png` |
| `#19 Sam Oyelaran`, `Punts 0` | `0`, full strength | Same — a count. | same |
| `#19 Sam Oyelaran`, `Punt Avg` | `No data`, copy weight | A quotient with no denominator. He never punted, so there is no average to state. | same |
| A role with no attributed player | module renders, body reads `No data`, **no number** | Unattributed is not zero production. | `*-sparse-*.png` |
| No attributed player anywhere | the empty state, no tables | | `*-no-attribution.png` |

An absence never sorts as if it were the smallest measured value: absences are
held at the bottom in **both** sort directions. Asserted mechanically in the
capture pass (`grade ascending: -1.0 | +0.4 | +1.8 | No data`), because an
absence floating above a real negative grade would read as the worst grade on
the team.

---

## 7 · Fixtures

Synthetic and football-plausible. **No coach data is used or copied.** Each of
the four states exists in **both scopes**, so eight cohorts are drawn. Every
figure reconciles against its own denominator.

**Current game (Week 3 vs Northgate, 70 plays):**

- Rushing `Avg` is `Yds / Att` to one decimal on all four rows.
- Passing `Pct` is completions over attempts: `18/29 → 62.1%`, `1/3 → 33.3%`.
- Receiving totals **19 receptions for 223 yards**, which is exactly the
  passing line's `18/29 + 1/3 = 19` completions and `214 + 9 = 223` yards.
  Receiving TDs total 2, matching passing TDs.
- Tackles: `Solo + Ast = Tkl` on every row, including `0 + 0 = 0`.
- Return `Avg` is `Yds / Ret`: `118/5 = 23.6`, `21/3 = 7.0`, `0/2 = 0.0`.

**Full season (9 games, 631 plays):**

- Rushing `Avg`: `604/96 = 6.3`, `311/71 = 4.4`, `188/44 = 4.3`, `41/19 = 2.2`.
- Passing `Pct`: `122/201 → 60.7%`, `9/17 → 52.9%`.
- Receiving totals **131 receptions for 1,631 yards and 15 touchdowns**, which
  is exactly `122 + 9` completions, `1,543 + 88` yards and `14 + 1` TDs.
- Tackles: `51+37 = 88`, `33+43 = 76`, `39+15 = 54`, `8+4 = 12`.
- Return `Avg`: `704/31 = 22.7`, `168/14 = 12.0`, `41/9 = 4.6`.

In both scopes each table's default order is the engine's own sort for that
role, checked row by row, and section counts are **distinct jerseys**: All
roles 16, Offense 8, Defense 4, Special Teams 6 — the 16 is the union, not a
sum of the three.

States covered: populated multi-role roster in both scopes · long names and
two-digit jerseys (`Terrance Whitfield-Boateng`, `Christopher Vanderhoeven`,
`Dominic Ferraro-Nwosu`, `Rafael Ostrowski-Vance`) · a jersey with no roster
name (`#34`) · one player in three roles (`#22`) and two in two (`#12`, `#7`) ·
shared-credit tackles (`Ast 5`, `Ast 6`) · a takeaway with no tackle (`#27`) ·
a punter who never kicked a field goal (`#45`, `FG 0/0`) · a placekicker who
never punted (`#19`, `Punts 0`, `Punt Avg No data`) · grades present · grades
absent everywhere · sparse attribution · measured zeros · missing measurements
· no attribution at all · sort active on a column and on a Grade column
carrying an absence.

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

**8.2 · P2 — FIVE columns sort wrongly, and `numeric: true` repairs only two
of them.** `C/A`, `Pct`, `Punts`, `Punt Avg` and `FG (M/A)` are declared
without the `numeric` flag, so `DataTable` compares them with `localeCompare`:
`Punt Avg` sorts `34.5` below `9.5`, and `Pct` will sort `100.0%` below `62.1%`
the first time a passer completes every attempt.

The obvious repair is incomplete. `DataTable`'s numeric branch is
`(Number(av) || 0) - (Number(bv) || 0)` (`native-report-kit.jsx:87`), and
`Number('62.1%')`, `Number('18/29')` and `Number('2/4')` are all `NaN`, which
that expression turns into **0**. So flagging them numeric would make three of
the five columns sort every row as zero — a different wrong answer, and a
quieter one.

| Column | Value shape | Repair |
|---|---|---|
| `Punts` | a plain integer | `numeric: true` is sufficient |
| `Punt Avg` | a decimal string | `numeric: true` is sufficient |
| `Pct` | `62.1%` | needs a real sort accessor |
| `C/A` | `18/29` | needs a real sort accessor |
| `FG (M/A)` | `2/4` | needs a real sort accessor |

The three accessors also have to decide *what* they sort on: the comp sorts
`C/A` and `FG (M/A)` on completions and makes respectively, and `Pct` on its
number. Whether `FG (M/A)` should instead sort on attempts, or on percentage,
is a football choice production has to make explicitly — it cannot fall out of
a flag.

**8.3 · Recorded, unrelated, not repaired.** The Return Game row reads a
returner's yards from the generic `tags.yardage`, while the Special Teams unit
reads `tags.returnYards` — so the two boards can disagree about the same
return. Already listed after the Special Teams batch; repeated here because it
is visible on this tab.

---

## 9 · Responsive behavior

The stacking rule is applied **per band**, not to the board, and it is derived
rather than picked. A band half is `(VW − 32 board padding − 1 gap) / 2 − 24
module padding`: **679px at 1440**, **599px at 1280**. A band stacks only when
its own widest table can no longer be honoured inside that half.

Since revision 3 the tables are `table-layout: fixed`, so a role's required
width is the exact sum its colgroup asks for — not a measurement that can drift
away from the declared number. The capture pass asserts the two agree.

| Role table | Required | Fits 679 (1440)? | Fits 599 (1280)? |
|---|---|---|---|
| Tackles | 662px | yes | no |
| Rushing | 632px | yes | no |
| Passing | 632px | yes | no |
| Receiving | 506px | yes | yes |
| Return Game | 486px | yes | yes |
| Kicking / Punting | 452px | yes | yes |

The breakpoint is therefore the width at which the widest of them stops
fitting: `(662 + 24) × 2 + 33 = 1405`, so the media query is `max-width:1404px`.

| Width | Behavior |
|---|---|
| 1920 × 1080 | Every band pairs. The identity column takes the slack above its 208px floor. |
| 1440 × 900 | Every band pairs. Tackles, the widest table, needs 662px inside a 679px half. |
| 1280 × 720 | **Return Game + Kicking / Punting stay paired.** The two bands carrying Rushing, Passing or Tackles stack, because pairing them could only come out of the identity column, which may not shrink. Revision 1 stacked the whole board because Tackles is wide, which left half of it empty for no reason. |

**A stacked band widens its measurement columns.** A stacked module is roughly
twice as wide; left at the paired widths the identity column absorbs all ~830px
of the extra room, and a row reads as a name at the far left with its first
number at the far right of a 36px line. The stacked band therefore roughly
doubles `--p-s / --p-m / --p-l2 / --p-l / --p-g / --p-xl`, so the line stays
readable end to end and the table still ends where its panel ends.

The rule is derived in the comp from the width recorded on each role, so the
behavior and the numbers in this table cannot drift apart. Asserted in the
capture pass: at 1280 All roles renders exactly **1 of 3** bands paired, and
the Special Teams section's band is that one.

At all three widths, mechanically asserted over all 26 state × scope × section
combinations: **no page-level horizontal scroll, no clipped text node, no text
below 9.5px, no table scroller engaged, and both panels of a paired band start
their identity column at the same offset inside their own panel.** A separate
pass measures every rendered `th` and `td` against its own content box across
96 width × state × scope × section combinations — the check `table-layout:
fixed` requires, because a fixed cell overflows silently rather than growing.
The `.twrap` bounded scroller exists so a narrower host cannot clip a column;
it does not engage at any release width.

Hover and focus change colour and background only — a focused row measured
identically before and after (`{w:1384,h:36}` → `{w:1384,h:36}`), and the
hover chevron reserves its own width at rest, so the identity text does not
move (measured: `[61,61,61,61]` before and after hover). Sorting moves no
column edge (measured: identical `th` widths before and after a sort click).

---

## 10 · Screenshot matrix

93 captures. Each was taken with the intended scope and section activated and
the pointer parked off-canvas at (4000, 4000).

**Every capture is EXACTLY its stated release viewport.** A board taller than
the viewport also gets a `-full.png` companion at the same width. Revision 1
grew the viewport instead of adding a second image, so seven captures were
taller than the size their filename claimed — `1280×1471` presented as 1280×720
evidence. The first-viewport image is now the primary one and is what the
composition should be judged on; `-full` is supplementary.

| | 1920 | 1440 | 1280 |
|---|---|---|---|
| Exact-viewport captures | 26 | 27 | 26 |
| `-full` companions | 0 | 4 | 10 |

Per width, both scopes: Populated × 4 sections, No grades × 4, Sparse × 4, No
attribution × 1 = 26; 1440 adds the sorted Offense capture. Verified after the
run by reading each PNG's IHDR: 93 files checked, 0 wrong dimensions.

---


## 11 · What was visually inspected, and what was not

**Opened and inspected image by image, revision 2:**
`1280-populated-game-1-all-roles-full`, `1440-populated-season-1-all-roles`,
plus the revision-1 set (`1440-populated-1-all-roles`,
`1280-populated-1-all-roles`, `1920-populated-1-all-roles`,
`1440-sparse-1-all-roles`, `1440-no-grades-3-defense`,
`1440-populated-4-special-teams`, `1440-populated-2-offense-sorted`,
`1440-no-attribution`). Checked in each: identity column start and stability,
numeric right-alignment down the column, header-to-row alignment, absence
versus zero treatment, grade colour, section nav and scope state, table edges,
vertical rhythm, and the content below the first fold.

**Defects found by looking at the images and fixed before this report.**
Revision 1: the empty state rendered on top of a fully populated board
(`.empty{display:flex}` outranks the `[hidden]` attribute); a duplicate
`Export report` control, which would also have implied a Players-specific
export that does not exist; a nav count of 15 contradicting a sample line of
13; and a stretched table at 1280 that reopened the label-to-number eye
traverse. Revision 2: a sample line still reading 15 after a third specialist
took the roster to 16.

**Found by the capture pass's own audit before any image was opened.**
Revision 1: clipped `Solo` / `Sack` / `Fum` / `Punt Avg` headers, a 9px sort
caret below the type floor, a scroller engaging at 1280, and a missing space in
the identity cell's text. Revision 2: none — 0 failures across 26 state x
scope x section combinations at three widths.

**Revision 3 — one finding, and the check that now prevents its class.**
Revision 2 recorded the approved empty-state body in the copy table at §3 and
never changed the markup, so every no-attribution capture kept showing the
sentence Charlie had rejected. A copy decision written into this file is not
applied until the board says it, and 93 captures did not catch it because
nothing compared them. The capture pass now asserts every approved string
against the RENDERED markup; mutation-verified by putting the rejected sentence
back, which reds naming both the rendered and the approved text.

**Not inspected, and not claimed:**

- The remaining captures were produced by the same pass and passed the same
  mechanical audit, but were not opened one by one.
- **Mobile and tablet** (768x1024, 390x844) were not designed or captured. The
  assignment scoped this to desktop.
- **The opponent-scout perspective.** `_renderOpponentTab` has no `players`
  branch, so no opponent Players view exists to design.
- **No production code was run against this comp, no harness was written or
  run, and no gate was run** — all excluded by the assignment.
- **Real coach data was not used**, so the comp is not evidence about how the
  coach's own roster renders. Long names were made long on purpose; his may be
  longer or shorter.
- **The Full season scope is drawn, not proven.** Its fixture is a plausible
  nine-game aggregate, internally reconciled. Whether the multi-game model
  returns exactly this shape for Players is an implementation question (§13.6).
- **No Charlie Gate.** This is a comp awaiting approval, not accepted state.

---

## 12 · Open decisions — all seven ruled 2026-09-04

| # | Decision | Ruling | Applied |
|---|---|---|---|
| 1 | Empty-role modules | **Approve** — the role set is fixed, so a literal empty module is clearer than silently removing the category | yes |
| 2 | Section tabs | **Approve** — they reduce traversal and reuse the Defense / Special Teams interaction; Offense's scroll is corrected later, not used to hold Players back | yes |
| 3 | Kicker with no field-goal attempt | **Revised** — `FG (M/A)` is `0/0` and `Punts` is `0` (counts), `Punt Avg` is `No data` (a quotient with no denominator) | yes |
| 4 | Film cohort | **Row's own role cohort.** Production must build valid game-scoped composite refs rather than fall back to `_watchPlayer` | yes, and recorded as an implementation dependency |
| 5 | Scope control | **Approve** Current game / Full season, defaulting to Current game. Full season must use the multi-game model and composite refs — not a second scope implementation | yes |
| 6 | Copy | **Partially approved** — see §3 for the exact wording of each | yes |
| 7 | 1280 layout | **Revised** — mixed, per measured band width; do not shrink the identity column, do not stack narrow tables because Tackles is wide | yes |

Nothing is left open. What remains before this comp can be built is the
approval of revision 2 itself, plus the three implementation dependencies in
§13.

---

## 13 · Revision 2 — what changed

| # | Finding | Change |
|---|---|---|
| 1 | P1 — the comp dropped the **Season** tab from the shared Reports nav | Restored, in production's own order: Overview, Offense, Defense, Special Teams, Players, Self-Scout, Season, Matchup. The comp may not remove an existing destination even when it does not redesign shared chrome. |
| 2 | P2 — the sorting diagnosis would produce an incomplete repair | §8.2 rewritten: five columns, not four; and `numeric: true` fixes only `Punts` and `Punt Avg`, because `DataTable`'s `(Number(av) \|\| 0)` turns `NaN` into 0 and would sort `Pct`, `C/A` and `FG (M/A)` as all-zero. The three needing accessors are named, with what each should sort on. |
| 3 | P2 — the section descriptions narrated the interface | All four removed. The section rule carries its name and role count only. Recorded in the §3 copy table, where revision 1 had omitted them. |
| 4 | P2 — the blanket 1280 stack wasted horizontal space | The rule is now per band and derived from each role's measured table width. Return Game + Kicking / Punting stay paired at 1280; only bands carrying Rushing, Passing or Tackles stack. Asserted: 1 of 3 bands paired at 1280 in All roles. |
| 5 | P3 — seven captures were taller than their stated viewport | Every capture is now exactly its release viewport; a taller board gets a `-full` companion. All 93 files verified by reading their PNG headers. |

**Three implementation dependencies**, none of them presentation work:

1. **Composite refs for the Players cohort** (ruling 4). The tab's plays are
   never stamped with `__gid`, so every row falls back to the jersey cut-up.
   The fallback must be removed, not merely bypassed.
2. **Full season through the multi-game model** (ruling 5). It must reuse the
   existing season assembly and its composite refs, not a second scope
   implementation local to Players.
3. **The Grade column and its two missing CSS classes** (§8.1).

---

## 14 · Presentation alignment — 2026-09-05

Players remains in the established Reports presentation system. It does not
introduce a typography, navigation, spacing, or module redesign ahead of the
planned cross-report polish pass.

The visible role descriptions were removed because they explain standard
football roles rather than report data. Role headers now contain only the role
name and attributed-player count. The toolbar summary is reduced to literal
counts: players, populated roles, and charted plays. No data, interaction, or
layout behavior changed.

---

## 15 · Revision 3 — presentation alignment against the approved comps, 2026-09-05

Players was compared side by side against `reports-offense-2026-09-03`,
`reports-defense-2026-09-03` and `reports-special-teams-2026-09-04`, rendered
at 1920 × 1080, 1440 × 900 and 1280 × 720.

**Which comps define the family.** Offense uses the older `--bd-*` token set
and its own type scale; Defense and Special Teams share the current `--gi-bd-*`
set and are byte-identical to each other on shell chrome, report head and tabs,
scope toolbar, section rule, section navigation, band, module and table. Where
Offense and the other two disagree, **Defense and Special Teams are the
baseline** — they are the two most recent, and Offense's reconciliation is the
scheduled cross-report polish pass, not this assignment.

### 15a · What was genuinely shared, and already matched

Shell chrome, context bar, report head and tab strip with the cyan active
underline, the `.btn`, the scope segment, `.dtoolbar`, `.srule` with its 3px
cyan left rule, `.snav` with its count badge and `--gi-raise-tab` active
treatment, `.band` / `.mod` geometry, and the box-shadow column rule painted
into the 1px gap were already copied verbatim and needed no change. Accent
usage — cyan for the active state and the section rule, gold for offense role
headers, `--gi-bd-copy` for special teams, `--gi-bd-win` / `--gi-bd-loss` for
signed values — was already the family's, with no invented colour.

### 15b · Differences found, and what was changed

| # | Difference from Defense / Special Teams | Change |
|---|---|---|
| 1 | **Tables did not fill their panel.** `width:auto` left 72px of dead panel beside Receiving at 1440 and ~600px beside Rushing at 1280, with the two columns of a band ending at different x. Hover highlights stopped mid-panel. | `table{width:100%;table-layout:fixed}` with `col.ident{width:100%}` — the accepted family treatment. |
| 2 | **Cell padding was tighter than the family.** `0 8px` with an 8px first-column inset against the family's `0 12px` with a 16px first and last inset — the "compressed spreadsheet" read the brief names. | Adopted `0 var(--gi-3x)`, `padding-left:var(--gi-4x)` on the first cell, `padding-right:var(--gi-4x)` on the last. |
| 3 | **The row-activation chevron trailed the name.** Defense and Special Teams both lead the first cell with it. | Moved to `td.ident::before` with the family's 6px margin. Verified it reserves its width at rest: identity text left is `[61,61,61,61]` before and after hover. |
| 4 | **The empty state was a different component.** No cyan left rule, `24px` padding, a 15px title and a 62ch measure, against the family's ruled band with `16px` padding and a 13px title. | Rebuilt as the family component. **The approved sentence is unchanged**, verbatim, and asserted against the rendered markup. |
| 5 | **An unattributed role module left a void.** Bands are `align-items:stretch`, so a role with no attribution sat as two words at the top of a panel as tall as its populated partner — the defect Special Teams already fixed. | Adopted `.mod.is-none{display:flex;flex-direction:column}` with the label centred in the leftover height. |
| 6 | **An unattributed role stated its absence twice** — `No data` in the header meta and `No player attribution` in the body. Special Teams suppresses the meta and lets the body carry the single literal. | Header meta suppressed; body is the board's one absence literal, `No data`. |
| 7 | **The sort affordance was invisible at rest.** Each role declares a default sort (`yds desc`, `tkl desc`) that nothing read, so no header was ever marked until a click. | The default sort is seeded per role. Kicking / Punting stays unmarked, because its default order is `made + punts` and is not a single column — claiming a sorted column it does not have would be a false statement about the data. |
| 8 | **The direction caret collided with its label.** Absolutely positioned in the header's left gutter, it rendered as `▼YDS` — a measurement column's content box is only ~28px wide. | Moved beneath the right end of the label, riding on the sorted column's cyan underline. Still costs no layout width and still moves nothing. |
| 9 | **No report-head compression.** Special Teams compresses the tab strip and unwraps the context bar below 1360; Players has eight tabs and fit 1280 with no margin at all. | Adopted the Special Teams `@media(max-width:1360px)` block verbatim. |
| 10 | **Defense and Special Teams did not load the bundled faces.** `document.fonts` reported **zero loaded faces** on both — they were being reviewed in the host's system sans while declaring IBM Plex. | Added `../../design-system/plex.css` to both. **No other change to either approved comp.** |

### 15c · What the table change exposed

`table-layout:fixed` honours the colgroup exactly. Auto layout had been
discarding every declared measurement width the moment the identity column
asked for 100%, and silently content-sizing instead — so the four-step widths
were fiction and nothing could ever clip. With the widths actually honoured,
three cells overran their column:

| Cell | Needed | Had |
|---|---|---|
| `Punt Avg` header | 86px | 80px |
| Season `C/A` `122/201` | 72px | 64px |
| Season `Yds` `1543` | 54px | 52px |

Re-sizing those pushed Tackles past the 1440 band half, so the four steps
became **six** — `Solo` / `Sack` split off at 60px and `Grade` at 74px, both
sized from what they actually hold rather than sharing a step with `Long` and
`Punt Avg`. Required widths are now 632 / 632 / 506 / 662 / 486 / 452, every
band pairs at 1440, and the stacking breakpoint is derived from those numbers
(§9). A new capture-pass assertion compares each role's declared `w` against
the width its colgroup asks for, so the two cannot drift; a second pass
measures every rendered cell's text against its own content box across 96
width × state × scope × section combinations, because a fixed cell overflows
silently rather than growing.

### 15d · What was deliberately NOT copied

- **A KPI band.** Overview, Offense, Defense and Special Teams all open with
  one. Players cannot: a headline tile about players is a ranking, a composite
  or a top-performer claim, all three of which are out of scope by ruling. Role
  counts alone would be a band of trivial numbers restating the toolbar. The
  board opens on the toolbar and the role navigation instead.
- **Special Teams' unit ledger.** It exists because the unit set is fixed and
  small and every unit must be visible including the empty ones. Players' role
  set is fixed too, but the role modules already render for every role,
  attributed or not, which is the same guarantee without a second summary
  surface.
- **Offense's `th` treatment** (9.5px condensed uppercase, gold sorted state).
  Defense and Special Teams use the 12px `--gi-text-label` body face, which is
  the treatment `CLAUDE.md` records as the accepted correction — a column label
  is operational copy, and 9.5px condensed in `--gi-bd-muted` measured 3.63:1.
- **Offense's `th.is-sorted::after{content:" ▼"}`.** It participates in layout,
  so the sorted column's label shifts on every sort.

### 15e · Verified after the change

- Fonts: `IBM Plex Sans 400`, `IBM Plex Sans 600`, `IBM Plex Sans Condensed 700`
  load and are the computed family on body, headings, `th`, `td`, module
  headers and section navigation — asserted, not read off the declaration.
  Special Teams and Defense now report the same three.
- No page-level horizontal scrollbar at any of the three widths, in any state.
- No clipped header, name or value, and no cell text exceeding its content box,
  across 96 combinations.
- No text below 9.5px. No table scroller engaged at a release width.
- Hover, `:focus-visible` and active states present on report tabs, scope
  buttons, section navigation, sortable headers, rows and buttons; none of them
  changes a layout dimension.
- Sorting moves no column edge; the hover chevron moves no text.
- Zero console or page errors.
- 93 captures regenerated, every one verified against its stated viewport by
  reading its PNG header.

### 15f · Reserved for the cross-report polish pass

1. **Offense is still on the older token set** and its own type scale. Nothing
   in Players was bent toward it.
2. **`--gi-cond` has only a 700 weight bundled**, so every `600 … var(--gi-cond)`
   declaration in Players, Defense and Special Teams resolves to 700. Shared by
   all three comps; not a Players decision to make alone.
3. **The identity column is airy at 1920** in the three-column and five-column
   roles — Kicking / Punting leaves ~650px between a name and its first figure.
   Every accepted Defense and Special Teams table behaves the same way at that
   width. A wide-viewport tier that widens measurements the way the stacked
   band does would close it; not introduced here, because it is a cross-report
   decision and the current read is airy rather than wrong.
4. **Special Teams joining the shared report header** and the context bar
   wrapping long game names remain shared-chrome items already recorded against
   Special Teams; Players carries the same context-bar treatment and does not
   propose its own.

---

## 16 · Codex visual revision — 2026-09-05

The aligned board was structurally correct but still read as stacked interface
bands followed by six separate panels. This revision keeps the approved data,
sorting, scope, role set, and responsive table behavior while improving the
presentation:

- Scope, sample size, and role navigation share one control row at release
  widths. This removes one full-width layer before the report data.
- The section rule was removed because it repeated the active role tab and the
  counts already visible in the toolbar and navigation.
- Role counts are plain text rather than boxed badges.
- Role headings use readable IBM Plex Sans at 12.5px with no artificial
  tracking or forced uppercase.
- Data rows move from 36px/12px to 38px/13px. Table headers retain the accepted
  12px label role.
- Role bands meet on thin rules instead of four-pixel black gutters, so the six
  tables read as one report surface.
- The report canvas is capped at 1680px on wide displays to reduce the distance
  between player identity and measurements.
- Sort direction uses an 11px up/down arrow instead of an 8px triangle.
- Sparse-state roles without attribution are consolidated into one literal
  `No data` row that names each absent role. Populated tables pair naturally
  above it, avoiding large synchronized grid gaps while keeping the fixed role
  set visible.
- The full empty-state title uses the same readable Sans heading treatment as
  the report rather than a small condensed uppercase label.

Representative review captures are generated under
`artifacts/players-codex-review/`. The committed 93-state capture set remains
unchanged until this visual revision is approved.
