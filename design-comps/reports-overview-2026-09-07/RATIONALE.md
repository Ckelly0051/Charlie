# Reports > Overview — the static-schema rebuild, 2026-09-07

**Status: NOT APPROVED.** Built into production and gate-verified; no Charlie
Gate, no installed smoke. `productionStatus` in
`design-approvals/reports/overview/manifest.json` stays `REJECTED` until the
coach reviews the real board.

This is a **decision record, not a comp.** The approved comp is unchanged and
remains canonical:

- Canonical artifact:
  `design-comps/visual-reset-2026-08/part2-verification/charlie-gate-density4`
- Primary reference: `1440x900-overview.png`
- Approved text: that directory's `metrics.json`, under `metrics.overview`
- Approved 2026-08-20 — the OLDEST of the nine surfaces

Nothing in that directory was edited, and its recorded hash is unchanged
(`node tools/audit-design-approvals.mjs` → 9 surfaces, 481 files, 0
violations). Where production and the capture differ, this file names the
divergence and who directed it. A divergence recorded only in a commit body is
not recorded.

Landed across `c5dd044`, `83a8251`, `eddd15b`, `cdeea44`, and the Codex
review repairs in §10.

---

## 1. The governing rule: the comp is the SCHEMA

The coach's words, and the reason this record exists:

> "Just make the comp the rule. If there are X rows in the comp, prod version
> gets X rows, full stop."
>
> "Just give me a static dash that won't break with every variation."
>
> "Think of the comp as the schema. Match it."

**The rule.** Each module renders the row count the approved capture renders,
on every game, in every season. The board is one fixed height by construction.
Row counts are read off the canonical capture's own `metrics.overview` text and
stated in exactly one place — `OVERVIEW_ROWS` in `js/native-report-tabs.jsx` —
never inferred from what a game happened to chart.

This supersedes the previous behaviour, where Down & distance rendered however
many buckets a game produced and Big plays rendered whatever cleared a 20-yard
threshold. Week 2 showed **one** Big plays row under a 303px hole. Every game
was a different shape, and the coach's standard was stated plainly: **"Any
blank = fail."**

### 1a. Why a fixed row count is honest, and where it stops being honest

There are two kinds of module, and the distinction decides what may fill a
fixed row:

| Kind | Rule | Modules |
|---|---|---|
| **Enumerable dimension** — the full set is known before any film is charted | Render the complete set every time, zeros included | Snaps by phase (3 phases), Situational (6), Key metrics (6), Rushing (7), Passing (8), Defense & discipline (6), Yards by type (6 play types) |
| **Event list** — no known-in-advance set exists | Render the top N by RANK; a slot the data cannot fill states the absence | Top 10 Plays (10), Offensive/Defensive Drives (8 each), Down & distance (5) |

A zero in an enumerable module is a **real fact about the call sheet**:
`Deep Pass — 0 snaps` says the coach never called it, which is information, not
padding. It keeps its number and never drops to `No data`.

A blank row in an event list would **fabricate an event that did not happen**.
So those modules rank instead, and a slot that still cannot be filled reads
`No data` at copy weight and is never interactive — there is no film behind a
row that names nothing. This follows the Special Teams absence contract
exactly: **one absence label, `No data`, everywhere**, and **a measured zero is
not an absence.**

### 1b. The ranked modules need their ranking stated

Because the row count is fixed, the ranking is what decides which entries
occupy the rows. Both rankings live in `StatsEngine`, never in the view:

- `rankDownDistance` — most snaps first, then earliest down, then shortest
  distance. The fixed rows hold the situations a game actually leaned on, not
  a slice of whatever order the buckets accumulated in.
- `topPlaysBothSides` — longest gain first, ties broken by play order, then
  ours first.

### 1c. Down & distance is 5, not 12

`_distBucket` is Short (≤3) / Medium (≤6) / Long (7+) across four downs, so
**twelve** down-and-distance situations are enumerable. Rendering all twelve
would be defensible on the enumerable rule above, and the coach initially
proposed 10 and then said "make it twelve, I don't care."

He then settled it: **the comp is canon, and the comp shows 5.** Five ranked
rows it is. Recorded here because the enumerable rule would otherwise imply
twelve, and a future reader should know the tension was seen and decided rather
than missed.

---

## 2. Composition changes from the approved capture

The capture governs row counts and copy. The coach directed these structural
changes on 2026-09-07, after reviewing the rebuilt board on real film.

### 2a. Four production modules, not two

> "Turn this into 4 modules, Passing and Rushing, Offense and Defense. I want
> to see our stats as well as the other team's stats."

`Rushing | Passing | Rushing allowed | Passing allowed`, four equal columns.
Equal tracks are the point: the two Rushing modules must be the same width for
the row-for-row comparison to read.

**No second formula exists.** A defensive snap records the opponent's offense,
and every alignment field is already stored from the offense's perspective, so
`opponentProduction()` calls the SAME `_rushingStats` / `_passingStats` /
`_driveStats` over the defensive cohort. Read as ALLOWED.

### 2b. Game plan is gone; Drives is two modules

> "Scrap this module's data and replace with Drives for Offense and Defense —
> our offense on top. The other team's offensive stats show defensive
> performance."

`Offensive Drives` over `Defensive Drives`, the opponent's bars in the
defensive colour. Their possessions ARE our defensive performance,
reconstructed from the same snaps by the same rule.

**Consequence for the copy standard:** Game plan was the one module the
approved artifact let speak in advisory prose ("mix in a draw or screen"). With
it gone, `e2e-reports-overview`'s forbidden-prose scan is now **board-wide with
no exemption left to scope** — a strictly stronger check than the comp
required.

Yards by type took the freed slot; Defense & discipline joined the Down &
distance band.

### 2c. Top 10 Plays — both sides of the ball

> "Stretch this to top 10 big plays, include the other team's big plays and
> note them by color, green = us, red = the other team."
>
> "Big plays = 10 every time. There may only be 5 big plays in a game. That's
> OK."

Ten rows, always. Our offensive snaps are ours; our defensive snaps are the
opponent's offense. `side` drives the colour, carried on **both** the row
marker and the yardage number — the number is what a coach actually scans, and
a 4px rule at the module edge reads as chrome at a glance.

**Big plays was always a ranking, and the comp proves it.** The capture lists
five 18-yard gains — *below* the 20-yard explosive threshold, which the
threshold cohort could never produce. `StatsEngine._bigPlays` is therefore
left untouched: it remains the canonical explosive cohort (20+ yards or a
touchdown, in play order) that the Explosive Plays KPI counts and that parity
pins. `topPlaysBothSides` is a separate, additive owner.

### 2d. Yards by type is a fixed six

> "List all play types - Run Inside, Run Outside, Short, Med, Long Pass, RPO.
> Then list totals for each. 0 is fine."

`StatsEngine.OVERVIEW_PLAY_TYPES` enumerates the six. A type the game never
called reads `0`.

**Open question for the Gate.** A type charted OUTSIDE the six (this season
charts `Play Action` and `Unknown`) does not get a row — that would break the
fixed height. Those snaps are counted in the module header instead
(`58 total · 2 other`). Offense remains the report for the full type
vocabulary. The coach was told; confirm at the Gate whether the header is
enough or the six should become seven.

### 2e. `Explosives` → `Explosive Plays`

Global on the KPI, the Key metrics lens, Defense & discipline and the printed
report. **Deliberately NOT changed** in two places: narrow table column headers
in Players / Defense / Self-Scout, whose widths are measured and would overflow;
and three KPIs whose value is a *percentage*, where "Explosive Plays 33%" would
be wrong.

---

## 3. Recorded divergences from the canonical capture

Both coach-directed on 2026-09-07, both stated in the harness assertions rather
than quietly absorbed. **Neither is a test weakened to match what the
implementation achieved** — each states a new instruction and still reds if the
value drifts again.

| Measure | Capture | Production | Directive |
|---|---|---|---|
| Module row pitch | 25.7px | 29px | "Widen the vertical spacing between each data point, especially between the header and the first line below it" |
| Tile row height | 69px | ~77px | "This doesn't match the comp font/styling. Comp was centered and more bolded" |

The tile-row exemption in `e2e-reports-overview` is **named and
one-directional**: only that unit may differ, it must actually be taller, and
any other rhythm unit going missing still fails. Module horizontal padding also
went 12px → 18px ("horizontal padding — left and right — needs to be widened
slightly; this is an issue in almost every module").

Both are carried into the Charlie Gate, where the coach sees the density he
asked for beside the capture he approved.

---

## 4. Zero dead space, and what actually caused it

Measured across all six games of `2025-st-joseph-mavericks-jv` at four
viewports, read-only: **0 holes, 0px, at 1440 and 1280** — from 284–308px per
game before. Three causes, none of them data:

1. A stale `align-items:start` on the support band held Big plays 14px short of
   the stack beside it.
2. The route-wide `th{position:sticky;top:42px}` pinned every column header
   over its own first data row — **the same trap the Players and Special Teams
   boards already had to correct.** It is why `Run Inside` was invisible in
   Yards by type.
3. Label/value lists sat at the top of a panel they did not fill.

**The panel fills; the rows do not stretch.** Stretching table rows was tried
on the Defense board and rejected, because it distorts row pitch so one
module's rows read at a different density from its neighbour's in the same
band. A short module painting its own panel is the module; a short module
letting the band's rule colour show through is the hole. Label/value lists DO
distribute their spare height, because they are a plain list of measurements
with nothing to align to across the band.

**A screenshot trap worth recording:** `fullPage: true` returns only the
viewport, because the route scrolls inside its own container. Every capture
taken that way showed the top ~900px and hid the holes below. Grow the viewport
to the board's real height instead.

---

## 5. Drive outcomes are named, and one finding the coach should see

The board reported `Other` for most drives. Three causes, found by tracing
every `Other` drive across the six games rather than reasoning about them.

**The punts were filtered out before the drive model ever saw them.**
`compute()` builds `plays` from snaps carrying a `playType` or `runPass` —
which is exactly what a punt does not carry — so looking one play past a
drive's last snap found the next SCRIMMAGE play and never the kick.
`convSource` is the broader list the method already builds "for ST/conversion
plays, which often have no offensive playType and would otherwise be filtered
out", and is the correct source. Mutation-verified.

**A fumble plus a change of possession is a turnover.**
`_changeOfPossession` reads two charted facts: the snap says Fumble, and the
next play shows the other unit has the ball.

> **FINDING FOR THE COACH — `fumbleRecovery` is blank on ALL ELEVEN fumbles
> charted this season.** The "Fumble recovery" control exists in the charting
> deck (`native-tagging.jsx`) and defaults to `unknown`, so
> `isFumbleLost`/`isFumbleRecovered` return false for every one of them and the
> engine has always, correctly, refused to call those fumbles turnovers. **They
> therefore do not count in the Turnovers KPI or turnover margin.** This is a
> charting gap, not a defect — the app is right to refuse to guess. Nothing was
> changed to paper over it: the new rule reads possession changing, which is
> separate evidence, and the strict predicates are untouched.

**A fake is a fourth-down snap wearing a Special Teams label.**
`stType: 'Fake'` matches no kick pattern; the down to read is the fake's own.

Adjacency is the ONLY signal used. Nothing infers possession from `stType`
perspective, which `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md` §3 names as its central
flaw and which produced the legacy punt-block defect. **Anything the next play
cannot settle stays `Other`, deliberately.**

Vocabulary: `TD`, `FG`, `Missed FG`, `Safety`, `Punt`, `Turnover`, `Downs`,
`Kneel`, `Clock`, `Score`, `Other`. Defensive drives reading `Other` went 9 → 4;
Week 1 now reads `Punt, Punt, Turnover, Downs, Punt` where it read all `Other`.

---

## 6. OPEN — `_reconstructDrives` splits one possession into several drives

**The most important open item on this board.** The dominant remaining cause of
`Other` is not an unnamed outcome: a single possession is being cut into
multiple "drives". Week 2 offense — play `id22` is a **4th down**, and the next
play `id24` is an **offensive 1st down**; same possession, two drives. The same
shape repeats at `id77`→`id78` and `id79`→`id80`. Week 2's board reports 9
offensive drives; the game had far fewer.

A fragment has no ending, so no outcome label is correct for it.

**A withdrawn assertion, recorded so the reasoning is not repeated.** A
pass/fail ratio over unresolved drives was written into
`e2e-reports-overview-realdata` and then deleted rather than have its threshold
moved: it would have been measuring drive RECONSTRUCTION while claiming to
measure outcome NAMING. Meeting a threshold by redefining what it measures is
the failure this project has an explicit rule against.

Fixing reconstruction reaches Points / Drive, three-and-outs, the Season
board's drive totals and the parity goldens. It is a separate, reviewed change.

---

## 7. Analytics safety

- **No formula was duplicated.** Four cohort-generic methods are reused;
  `opponentProduction` adds no arithmetic.
- **`_bigPlays` is untouched** — still the parity-pinned explosive cohort.
- **`isFumbleLost` / `isFumbleRecovered` are untouched** — still strict.
- **`orderedPlays` is attached to `compute()`'s result NON-ENUMERABLE on
  purpose.** It lets a caller measure the opponent's drives with the same
  adjacency rule, but it is an input echoed back, not a result. Enumerable, it
  would enter every serialization — the parity goldens, the analytics audit,
  the exports — as thousands of object paths that assert nothing.
- **Parity goldens regenerated twice, each as an audited correction with the
  diff enumerated:** 16 paths then 13, every one `drives.list.N.outcome`,
  overwhelmingly `"Other"` → a real label. No metric, denominator, film
  reference or other field moved.

---

## 8. Verification

Real-season evidence per the canonical-data rule: `2025-st-joseph-mavericks-jv`
("2025 St. Joseph Mavericks - JV"), 6 games, read-only copy, SHA-256 asserted
unchanged after the run. Synthetic fixtures are supplemental only.

`e2e-reports-overview` 106, `e2e-reports-overview-realdata` 35,
`e2e-native-reports` 108, `e2e-parity` 2/2, `e2e-realdata` 10/10,
`e2e-reports-season` 98, `e2e-reports-offense` 46, `e2e-reports-self-scout` 90,
`e2e-reports-matchup` 72, `e2e-reports-players` 169,
`e2e-reports-special-teams` 50, `e2e-raw-read-audit` 11,
`e2e-css-ownership` 6, `e2e-p0-exit` 19.

---

## 9. Carried into the Charlie Gate

1. The two recorded divergences in §3 — density the coach directed, beside the
   capture he approved.
2. Yards by type's `· N other` header (§2d): enough, or does the fixed set need
   a seventh row?
3. Down & distance at 5 rather than the enumerable 12 (§1c).
4. `_reconstructDrives` splitting possessions (§6) — the largest open item.
5. Fumbles absent from turnover counts until `fumbleRecovery` is charted (§5).
6. **CLOSED — the Reports tab strip clipped `MATCHUP` to `MA` at 1440.**
   Fixed in `4996efd`; kept here because the cause explains the comp/production
   divergence a reader will otherwise trip over.

   The nav needed 638px and got 590: the season's longest game name,
   `Week 1 vs St. Peter Lutheran Patriots`, pushed its left edge to 602 while
   the command buttons pinned its right at 1192. No other game and no other
   width hit it. The strip's `overflow-x:auto` left the tab scrollable but
   invisible — worse than either, because a coach cannot navigate to a tab he
   cannot see, and nothing overflowed the PAGE so no containment check noticed.

   **Root cause was not the tab strip.** The title, the navigation and the
   command buttons share one row. The title was `flex:0 0 auto`, unable to
   shrink, and the nav `flex:1 1 0%`, so the nav absorbed every pixel of
   squeeze. Navigation now holds its content width and the title yields.

   **THE ROW WAS PROPORTIONED FOR A SHELL THAT HAD A LEFT RAIL.** The
   2026-08-31 Home approval removed it and this row was never re-fitted to the
   wider canvas. That is also why the canonical Overview capture — 2026-08-20,
   the OLDEST of the nine surfaces — still shows a left sidebar that production
   correctly does not have. **The comp is canon for the BOARD's composition,
   not for the app shell, which a newer surface governs.** "Make the comp the
   schema" never meant restoring that rail.

   Fixed at the OWNING rules inside the `.gi-reports-reporthead` block. Three
   earlier attempts were made in the general block, all lost the cascade to
   those rules, and all were reverted.

7. **The shell context bar and scorebug were reported as not matching the comp
   and are deliberately untouched.** They are shared chrome owned by
   `js/workspace-shell.js` and governed by NEWER approvals than Overview's
   2026-08-20 — Home is 2026-08-31 — so changing them changes Home, Break Down,
   Study and Plan. Needs its own scoped decision.

---

## 10. Codex review, 2026-09-07 — nine findings, all closed

Reviewed at `c312a1f..cdeea44`. Every finding was verified against source and
the canonical season before being accepted; two were checked and found LATENT
(real defects, not yet producing a wrong number on this season) and are recorded
as such rather than overstated.

**P1 — drive outcomes read across a game boundary.** `_driveEndFromNextPlay`
indexed `all[idx + 1]` with no game guard, so in season scope the last
possession of one game could be explained by the next game's opening kickoff.
Worse than reported: `convSource` is not in play order either, so the neighbour
could be an arbitrary array slot. `_followingPlays` now filters to the play's
own `__seasonGameIdx` and sorts by game then timestamp — the same containment
`_reconstructDrives` already applied, and whose own comment states the rule.
Regression added and mutation-verified.

**P1 — drive outcomes guessed two facts adjacency does not establish.**
`Clock` was returned for ANY final charted possession, including truncated film,
and `Score` for ANY following kickoff, though kickoffs open halves. Both
contradicted this record's own rule that an unresolved outcome stays `Other`.
Both branches are gone; the vocabulary lost `Clock` and `Score`.

**P1 — defensive return touchdowns credited to the opponent's offense.**
`opponentProduction` passed defensive snaps straight into the offense-oriented
formulas, so a pick-six would have produced an opponent completion and passing
touchdown. `scoringSide()` already answers this correctly and was simply never
asked. Verified LATENT: the canonical season contains zero defensive
`Interception + Touchdown` or `Fumble + Touchdown`, and all seven defensive
touchdowns are the opponent scoring on us, which the old path handled correctly.
Fixed anyway — the snap stays in the drive cohort, since it did end their
possession, and is excluded only from their production.

**P2 — the Fake branch could call a turnover a failed conversion.** It never
read the Fake's own result, contradicting this record's own fumble rule.

**P2 — Top 10 Plays admitted unmeasured plays.** `parseInt(blank) || 0` ranked
a snap with no yardage as a 0-yard play, which rendered an empty Yds cell.
**55 of the canonical season's 328 classified plays carry no yardage**, so the
mechanism is real; verified LATENT only because every game has at least ten
measured plays. Now filtered to measured yardage, with the check written against
the RENDERED cell.

**P2 — the module is renamed `Top 10 Plays`.** Coach-directed on review: it is a
static ten, so it should say so. This is a **deliberate divergence from the
capture, which titles it `BIG PLAYS`** — flagged before changing, and approved.

**P2 — the displayed count was fabricated by padding.** The meta read
`bigPlays.length` after padding, so five real plays plus five absence slots
would have said `10 total`. It now counts unpadded rows.

**P2 — equal-yardage ties compared unrelated cohort positions.** Each side was
numbered from zero, so "ties break on play order" was false in the only case
where a tie-break matters. One ordering key across both cohorts now, game then
timestamp. **The sharper half of this finding was the harness:** its expectation
replicated the same two-cohort scheme, so the assertion could not fail for the
reason it claimed. The expectation is now derived from the fixture's own
emission order, which the harness itself controls.

**P2 — the visual parity check was an exemption, not a check.** Stated as "the
tile row is merely taller", it would have absorbed any future drift in that
unit. The coach-directed height is now pinned exactly, so the exemption can
excuse only 77px and reds if the tile row moves again.

**P2 — the approval registry pointed at the wrong decision record.** The
manifest's `decisionRecord` now names this file; the archive is retained as
`priorDecisionRecord` rather than dropped.

### Accepted from the reviewer, against my own note

**§6's `id78` example is withdrawn.** A fourth-down failure followed by a new
first down supports a possession change and is not evidence of a reconstruction
defect. `id22 → id24` — a fourth down followed by an OFFENSIVE first down, the
same unit keeping the ball — still looks like a split, and that single case is
what §6 now rests on. **Reconstruction is not to be "repaired" without
film-backed evidence.**

---

## 11. Shared-header repair review, 2026-09-08

The Reports title now yields horizontal space to the fixed-width report tab
strip, truncates when necessary, and preserves its complete value in a native
tooltip. The first tooltip repair covered Our Game only; Opponent Scout returned
from `_syncHeader()` before synchronizing the attribute and could retain a stale
game-name tooltip. Closed in the commit following `95aae04`, with a real-route
regression that switches perspective and asserts the rendered heading and
tooltip agree.

The visibility regression selects the canonical season's longest game name and
runs at both desktop release widths, 1440 and 1280. Shorter game names cannot
create a tighter title constraint. The board remains **NOT APPROVED**: these are
implementation repairs, not a Charlie Gate or installed smoke.

The static-schema rule remains unchanged. A report board's module count, row
count, and geometry come from its approved composition, not from the amount of
data in the selected game. Missing ranked entries hold their approved slots
with the board's absence treatment; excess candidates are deterministically
ranked and capped. Data variability changes values, never board geometry.
