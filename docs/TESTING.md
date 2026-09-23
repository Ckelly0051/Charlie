# Testing

Harnesses are discovered from `tools/e2e-*.mjs`; enumerate them from the
filesystem rather than maintaining a count in prose. Each is a standalone Node
script. Most drive the built app in headless Chromium via Puppeteer; a handful
that test DOM-free logic import the owning module directly and need no browser
at all (`e2e-core`, `e2e-catalog-backend`, `e2e-analytics-metrics`,
`e2e-catalog-versions`, `e2e-raw-read-audit`, `e2e-css-ownership`). Booting the
app merely to reach a pure class is not a supported pattern — there is no global
bridge to reach it through.

```bash
node tools/<harness>.mjs
```

There is **no `npm test` script**. `package.json` defines only `build`, `dev`,
and `preview`. Harnesses are invoked by path, individually or through the gate
runner.

Every harness prints a result line and exits non-zero on failure. Enumerate them
from the filesystem rather than from memory:

```powershell
Get-ChildItem tools\e2e-*.mjs | Select-Object -ExpandProperty Name
```

Design evidence has a separate mandatory integrity audit:

```bash
node tools/audit-design-approvals.mjs
```

It verifies that every canonical artifact registered under
`design-approvals/` exists, is tracked, is unique to one surface, and remains
hash-identical to the approved evidence. It does not prove production visual
parity or coach acceptance; those require populated real-app captures and the
Charlie Gate.

### Canonical Reports data

All Reports production comparison, screenshot, and acceptance work uses a
read-only copy of the data source registered in `design-approvals/APPROVALS.json`:

`2025-st-joseph-mavericks-jv` (`2025 St. Joseph Mavericks - JV`)

The registered per-surface artifact governs composition. The registered real
season governs production data. Existing approved captures made with QA data
remain valid composition evidence, but new production captures must use the
real season. Do not write to its Documents-mirror `season.json`; deep-copy it
into isolated test/app state.

Reports boards are fixed schemas, not data-sized dashboards. For each surface,
tests must pin the approved module order and the row/tile count of every module
in populated, sparse, empty, and over-cap states. Sparse data uses the approved
absence treatment without collapsing the board; excess data is ranked and
capped deterministically without growing it. Responsive tests may change the
layout at registered breakpoints, but a data variation may not change the
composition or its dimensions. Canonical-season captures prove the production
binding; synthetic fixtures supplement them with sparse and overflow cases.

Synthetic fixtures are allowed for formula, sparse-state, empty-state, and
adversarial regression coverage. Label them as synthetic. Their results cannot
prove Reports visual parity or football correctness and cannot advance a
surface to `IMPLEMENTED_UNVERIFIED`, `PRODUCTION_ACCEPTED`, or `RELEASED`.

### Reports global-strip acceptance

The coach approved the navigation concept at
`design-comps/reports-global-strip-2026-09-22.html` on 2026-09-22. It is
implemented in source (`160533c`) and pinned by
`tools/e2e-reports-global-strip.mjs`, which covers the checks below on a
read-only canonical copy (264 assertions; it honors `GIQ_REALDATA_OPTIONAL`).
It is not installed-smoke accepted. Verify with the canonical
season at 1440 and 1280 that all eight top-level tabs share one y coordinate,
height and stable x positions while navigating Overview through Season; the
score appears only on Overview and never shifts the strip. Check Season last,
Current game defaults where scope is offered, full production-board content
below the strip, no black empty outer frame, and aligned Players names after
one- and two-digit jersey numbers. Keep report-specific section tabs and
scope controls below the global strip. Compare real bounding rectangles and
populated screenshots, not just DOM presence or zero overflow. Existing
Reports behavior, export, film and data harnesses remain in scope; the comp's
short placeholder tables cannot establish data or visual parity.
The harness generates untracked screenshots in `artifacts/reports-global-strip/`;
run it to produce captures on a clean checkout.

### Reports secondary bar (source 2026-09-23, installed smoke pending)

`design-comps/reports-secondary-nav-2026-09-23` is implemented in `0e84464`.
`e2e-reports-global-strip` (now 360) also pins: one secondary bar directly
under the strip with the same 46px box on all seven multi-section reports,
unmoved by Offense/Defense page changes and every scope change; no bar and no
empty host on Overview, whose compact score starts at the strip; no second
control row inside any board; no game KPI rail anywhere; no clipped or
scrolling bar control at 1440/1280; and at 768/390 a stacked bar inside the
viewport, the Overview linescore's four quarters and total on screen, its three
facts on their own row, and no page overflow. It captures every tab at 1440,
1280, 768 and 390.

**Every multi-page board is measured page by page.** A harness that reads only
the page a report opens on passes vacuously for the others, so the Offense,
Defense, copy-standard, explosive-label, typefloor and rhetorical-copy checks
walk every page of the bar and merge what they saw. `e2e-reports-offense` (62)
and `e2e-reports-offense-realdata` (47) pin each Offense page's exact module
list, every module on exactly one page, one height per page on all six
canonical games, controller-state page selection, and a game export identical
from Identity and Advanced. `e2e-reports-defense-realdata` (95) and
`e2e-reports-defense-board` (60) pin one section per Defense page, the KPI
strip on Performance only, every module on one page, the bar's labels, scope
and export, and a Defense export identical from Performance and Situations
(generated-at stamp excluded). `e2e-explosive-labels` (43) requires the Defense
board's `Explosive Plays` / `Explosive Plays Rate` (Allowed implied), its KPI
label on one line, 44px table headers and no clipping at 768, while exports
keep Allowed.

Mutation-verified on 2026-09-23: rendering Players' bar inline reds the bar
box and placement checks; appending the selected page to the Defense export
reds the export-identity check; restoring `Explosive Plays Allowed` reds the
Defense wording and one-line KPI checks; removing the narrow score CSS reds
the 768/390 score checks.

### Reports down-and-distance chart (source `80941c7`, 2026-09-23)

`e2e-reports-down-distance` (46) is the chart's harness. Synthetic engine
cases: the fixed twelve cells; the run/pass cohort; blank or invalid down and
distance placed nowhere; missing yardage out of yards/play; a touchdown with no
yardage still measurable; untyped snaps; multi-select play types credited per
component without adding snaps; held cells; `isOpponentSuccess` on defense;
nullified-penalty, offensive and special-teams snaps kept out of the defensive
chart; composite refs across two games reusing bare ids and the live-game
fallback. Rendered: first on both Situations pages, busiest cell selected,
selection kept across a re-render, held cells not selectable, `Watch N plays`
opening exactly the cell's refs, Defense Current game vs Full season, Season >
Offense and Season > Defense, and on-screen vs game, season and Defense export
parity. Canonical 2025 JV (read-only, hash-checked): the same parity, each
chart's cohort equal to its board's run/pass count, every ref resolving to a
real play in its cell's situation, and no clipped or sub-12.5px text or page
overflow at 1440/1280/768. Captures: `artifacts/reports-down-distance/`.
Mutation-verified: reading missing yardage as zero, inventing an `Unknown`
play type, using offense success on defense, printing an unformatted export
value and dropping the down check each red their assertions.

On the designated review machine, missing canonical Reports data is a failure,
not a green skip. CI may use `GIQ_REALDATA_OPTIONAL=1`, but an optional CI skip
cannot certify Reports acceptance. Every Reports evidence handoff must include
the loaded season id/name, actual game count, actual play count, selected
game/scope, and confirmation that the source was copied read-only.

---

## Choosing a tier

Pick the **smallest tier that can actually observe your change**. The question
is not how important the change feels; it is which surfaces can now behave
differently.

| Your change | Tier |
|---|---|
| Copy, a comment, one route's CSS | Focused |
| A route's behavior or markup | Affected route |
| A shared owner (`season-store.js`, `storage.js`, `storage-backend.js`, `stats-engine.js`, `workspace-shell.js`, `native-overlay-service.js`) | Affected route for every consumer, then Release |
| Persistence, migration, film identity, analytics formulas | Release |
| Anything shipping to the coach | Release |

If you cannot name the harness that would catch your defect, you have not
finished choosing a tier — you have skipped one.

---

## Tier 1 — Focused

The smallest existing harness for the route or domain you touched.

| Domain | Harnesses |
|---|---|
| Home | `e2e-home-rail`, `e2e-home-deferred-repair`, `e2e-home-review-repair`, `e2e-home-first-launch` |
| Team Hub / registry | `e2e-native-team-hub`, `e2e-team-registry`, `e2e-v2b-control-center` |
| Break Down — theater/film | `e2e-native-breakdown-theater`, `e2e-breakdown-video`, `e2e-breakdown-geometry`, `e2e-breakdown-lifecycle` |
| Break Down — charting | `e2e-native-tagging`, `e2e-tagging`, `e2e-tag-fields`, `e2e-tag-model`, `e2e-tag-projform`, `e2e-mark-flow` |
| Film Room | `e2e-native-film-room`, `e2e-film-room`, `e2e-film-room-virtualization` |
| Study | `e2e-study-screen`, `e2e-study-query`, `e2e-study-players`, `e2e-study-penalties-st`, `e2e-crosstab` |
| Reports | `e2e-reports-global-strip`, `e2e-explosive-labels`, `e2e-copy-standard`, `e2e-native-reports`, `e2e-reports-export-realdata`, `e2e-reports-overview`, `e2e-reports-overview-realdata`, `e2e-reports-offense`, `e2e-reports-offense-realdata`, `e2e-reports-defense-realdata`, `e2e-reports-defense-board`, `e2e-reports-special-teams`, `e2e-reports-players`, `e2e-reports-self-scout`, `e2e-reports-season`, `e2e-reports-matchup`, `e2e-reports-typefloor-realdata`, `e2e-reports-view-parity`, `e2e-season-tab`, `e2e-self-scout` |

**Players Revision 2, 2026-09-20.** `e2e-reports-players` (239) keeps every
Revision 1 contract and adds the Revision 2 ones on a two-game fixture where one
player is credited in three roles: every clickable statistic opens exactly its own
credited events (asserted against `playersBoard`'s buckets, so the board and the
owner cannot drift), touchdowns / interceptions / sacks / tackles for loss carry
distinct cohorts, a `No data` cell and a clipless measured zero are visible and
unclickable, identity opens the detail view rather than a playlist, the detail
view shows one labelled section per role with no merged score, every game row sums
back to the role totals, situational rows reconcile to the player-role cohort and
open only its plays, no dimension outside a role's list can produce rows for it,
Selected games narrows every table and reference together, column visibility
changes no calculation and cannot hide identity, and Export produces the player
report while a player is open. `e2e-parity` (2) is the proof that deriving
`_individualStats` from the credit index reproduced every established definition
exactly. `e2e-reports-typefloor-realdata` (33) pins Players at zero sub-floor
elements with a 12.5px minimum. Six mutations — a statistic opening the role
cohort, the role cohort losing its uncounted plays (which reds the parity golden),
game rows not narrowed, a dimension offered to a role that cannot answer it,
identity performing a film action, and export ignoring the open player — each red
at their own assertion.

**A test that reuses the mapping it is checking validates the implementation
against itself.** The first Players Revision 2 suite built its per-statistic
expectations from the same bucket map the view model uses, so a wrong mapping —
`Long` pointing at every measured play — passed. The expectations are now derived
from the plays themselves (the football meaning of each column, written out
independently), and the four Codex findings each gained coverage: a punt-only
kicking group and a takeaway-only defender surviving the situational split and
stating their real measures, the game cell stating what happened rather than a
leading zero, the export printing the ACTIVE dimension and only that one, `Long`
opening the play that produced it, and the situational table being sortable by
mouse and keyboard. Five further mutations — volume-stat filtering, a single-
measure game cell, an export choosing its own dimension, `Long` pointing at the
whole bucket, and an unsortable table — each red at their own assertion.

**A sortable header is not a sort order, and a fixture must be able to expose the
defect.** The Revision 2 suite proved the situational headers were clickable and
marked, which says nothing about where a measured zero, a negative value or an
unmeasured one lands. It now asserts the ACTUAL row order, ascending and
descending, on a production column and on Grade, over a passer whose four
quarters are a positive completion, a measured zero, a completion behind the line
and a sack — a sack is not an attempt, so its Att and Yds are genuinely
unmeasured, which a rushing fixture (where every carry buckets both) could never
produce. Long is asserted on four cohorts — one negative carry, all-negative with
one longest, tied negative longest, ordinary positive longest — against the
displayed value, the rendered cell AND `longRefs`, so the number and its film
cannot describe different plays. The export's game-by-game summaries are compared
string-for-string with the screen's for a punt-only kicker and a takeaway-only
defender. Three mutations — restoring the `Math.max(0, …)` clamp (4 red),
flattening unmeasured measures and dropping `gradeSort` (4 red), and rebuilding
the export summary from the fixed stat list (3 red) — each red naming the exact
reported wording.

**Home rail, 2026-09-21 — SUPERSEDED by the entry below; kept for the reasoning,
not the contract.** The suite is **55**, not 30, and the active year can no
longer fold at all. `e2e-home-rail` asserts what a coach can see and
reach, measured from laid-out geometry — never that a selector or a declaration
exists. Three seasons with no internal season-tree scrollbar at 1920×1080 and
1440×900; eight seasons with every year disclosed and the open season visible;
ten seasons scrolling inside the tree only; a fold that removes exactly its own
rows; keyboard focus and activation of the disclosure; the open season still
visible after folding its own year and after a viewport change; both trees
distinct, headed and holding their own create actions; every utility action
reachable, clear of the tree and at full target height at every tested viewport;
and long labels that neither widen the rail nor clip without a title.

**Home rail, CURRENT CONTRACT (2026-09-21).** `e2e-home-rail` is **57**. The
active year is a heading that cannot fold and draws no caret; an inactive folded
year renders no body. One `yearGroupKey()` owner means a blank-year legacy season
groups under `Undated` and can BE the active year — covered by a legacy fixture
in its own browser context (an open blank-year season, a second season in the
same group, and a dated inactive year). Keyboard operation is real: Puppeteer
focuses the disclosure and presses Enter and Space, and nothing in that block
clicks. The same focused control must match `:focus-visible` and paint a
non-`none` box shadow, so focus ownership alone cannot satisfy the test.
Containment is checked on both axes. Everything in the earlier entries
below still holds except where they say a folded active year keeps its current
row — that behaviour is gone.

**A shared owner can make a whole interaction untestable.** Driving real keys
exposed that the app's global shortcut handler swallowed Space from every
focused button; the synthetic-event test could never have caught it, because it
called `.click()` itself. When a keyboard test needs a synthetic event to pass,
the thing it is testing is probably broken.

**Not every fix earns a mutation.** The scout-pane starvation — an `auto` track
collapsing to 5px against 92px of content — was found in a capture and fixed,
but the harness's own rail does not starve in that configuration, so no mutation
reds that assertion. It is recorded as guarded-but-unproven rather than counted
as covered.

**The Codex repairs, 2026-09-21.** `e2e-home-rail` was **43** at that point. It adds the active
year as a heading with no `aria-expanded`, every season of that year rendered,
no year anywhere reporting `aria-expanded="false"` while rendering rows, a
folded year whose controlled body is absent entirely, opening a season in a
folded year making it the expanded active year with the open season scrolled in,
collapse state not leaking across a program change, the 30px target on every
Home control, and one opponent identity per component. Mutations: forcing
`isActive` false reds 6 assertions; returning the school line unconditionally
reds the duplication assertion with 2 duplicated cards.

**A claim over an empty collection is not a claim.** The duplication assertion
first passed with the mutation in place, because the program under test had no
games and the card list was empty — and then passed again over real cards,
because the subline was a SUBSTRING of the title rather than equal to it. The
harness now seeds real game cards, asserts there are some, and tests
containment; the production rule was strengthened the same way.

**Seed from the model, measure from the DOM.** The harness creates seasons
through `storage.createSeason` and waits for the rail to report them, because a
fixed sleep is a flake — but it counts them from `teamHubScreen.snapshot()`, not
from rendered rows: a folded year removes its rows from the DOM, which is the
whole point of folding, so a DOM count silently under-reports and the seeding
loop hangs. Two existing assertions were repointed for the new composition: the
equal 112px pane floor became "the season tree is never the starved pane", and
the year label reads its own element now that the disclosure carries a caret and
a count. Mutation: restoring the equal `1fr` rows reds the three-season
assertions at both viewports with 2 and 1 rows visible.

**The 1.12.0-90 REVISE repairs, 2026-09-20.** `e2e-reports-players` is **239**
and `e2e-reports-defense-board` **60**, `e2e-reports-defense-realdata` **89**.
The Players additions assert the composition, not its affordances: the phase
order and contiguity, that no column interleaves two phases, Passing's three row
slots and its exact body height (`3 × 38 + 38`), dash-filled unused capacity,
held rows carrying no film or player action, internal scroll only past capacity
with neither the module header nor the column header moving, and identical
module heights across a sort and a phase filter. The Defense additions assert
each module's cohort label against counts **re-derived from the rendered rows**,
on a synthetic season whose numbers are nothing like the canonical one's and on
all six canonical games. Three existing assertions whose subject the REVISE
deliberately replaced are repointed rather than weakened — band pairing becomes
phase columns at 1440 and a single stacked column at 1280, and the Players
sticky opt-out becomes a sticky header bound to the module body at `top:0`.
Mutations: reversing the column split (5 red), Passing capacity 3 → 5 (3 red),
and hardcoding `14 direction-tagged snaps`, which reds the synthetic board at
once and the canonical season on its second game (25 direction-tagged snaps).

**A second scroll container silently steals a sticky header.** The Players
column header had to stay put while a module body scrolls, and setting
`max-height` plus `position:sticky` was not enough: `.gi-table-wrap` still
carried `overflow-x:auto`, so it was itself a scrollport, and `sticky` resolves
against the NEAREST one — a box that never scrolls. The header rode up with the
rows while every computed-style check said `sticky`. Assert the header's
measured position after scrolling the body, never just its `position`.

**Players Revision 2 checkpoint, 2026-09-20.** Codex reviewed
`5471cb9..790e192` with no findings. Totals at that checkpoint:
`e2e-reports-players` 223/223, `e2e-native-reports` 99/99, `e2e-parity` 2/2 with
BOTH cohorts green — `synthetic-edge` (3 scopes, 189 drilldowns) and the local
`mavericks-6game` (7 scopes, 625 drilldowns), which Codex could not run because
that golden holds the coach's own season and is gitignored. `e2e-parity` is the
check that mattered here: it is the only one that would show the credit-index
rewrite or the `Long` change touching a value nobody intended, and the only
difference in it is the audited negative-`Long` correction. Also green:
`e2e-reports-special-teams` 57/57, `e2e-reports-self-scout` 113/113,
`e2e-reports-season` 100/100, `e2e-reports-defense-board` 55/55,
`e2e-reports-overview` 109/109. At that checkpoint,
`node tools/audit-design-approvals.mjs` was RED because Home's manifest carried
a status outside the registry's allowed set. That historical failure was
repaired on 2026-09-22: Home now records its documented `REJECTED` state, and
the later Players Revision 2 note was moved out of the hash-protected comp.
The audit now checks all nine manifests and 434 canonical files with zero
violations.

**An assertion whose subject was deliberately replaced is repointed, not
weakened.** Revision 2 moved the film affordance off the row, so the row-level
assertions in `e2e-reports-players`, `e2e-native-reports` and `e2e-reports-season`
now assert the per-statistic cohort and the identity behavior, which is a stricter
claim than the row-level one they replaced.

**Special Teams acceptance pass, 2026-09-19 (Codex findings repaired 2026-09-20).**
`e2e-special-teams-contract` (28)
pins the blocked punt-return workflow at the model: the `Punt Return / Block`
label, `Blocked` on that unit, six points to the subject on a subject recovery,
the opponent's six on theirs, no award at all when the recovery is unknown OR
left blank — on every loose-ball outcome, with the points kept as `unattributed`
and an ordinary return still following its unit — the
scoreboard owner's own totals, the report's one punt blocked / one punt-return
touchdown / exact composite reference, a save-reopen-normalize round trip of the
whole authored state, and the try cohort owning the legacy-compatible
`fieldGoal + extraPoint` shape. `e2e-native-tagging` (75) authors that state
through the real deck and asserts the stored shape, the report and the
scoreboard. `e2e-reports-special-teams` (57) adds the mixed-cohort
reconciliation — only snaps NO module claims are unassigned — the named try
remainder, the badge nouns, the compact empty module measured by where its text
paints, and the board's migration from a deferred 9.5px floor to the shared
12.5px one. `e2e-reports-typefloor-realdata` (33) pins the canonical census at
zero sub-floor elements with a 12.5px minimum, in both directions. Nine
mutations — the outcome vocabulary, the unit label, recovery ownership, the try
cohort, the ref-based disclosure, the try remainder label, the badge noun, the
empty-module treatment and a sub-floor KPI label — each reds its own assertion,
as do three more for the Codex findings: removing the loose-ball guard, widening
it onto an ordinary return (which reds an EXISTING unit-default assertion, so the
guard is provably narrow), and dropping the `await` that keeps the persistence
proof inside the printed total.

**An unawaited `testAsync` silently leaves the total.** `e2e-special-teams-contract`
prints its result line synchronously, so a `testAsync` call without `await` ran
after the summary and its PASS was excluded from the count — a failure would
still have set the exit code, but the documented number would not have covered
it. Both async tests in that harness are awaited; check for this whenever a
harness mixes sync and async cases.

**Cohort and label contracts added 2026-09-10.** `e2e-reports-overview-realdata`
pins that Total plays is the CHARTED count with the classified count as its
qualifier, that Snaps by phase counts each phase from the charted cohort and its
three rows sum to it, and that the Success rate sub counts real successful
snaps. `e2e-reports-defense-realdata` additionally pins the season's four
cohorts (201/173 offensive, 174/154 defensive) and that every Game-by-game row
satisfies `Total yds = Rush yds + Pass yds`, that displayed `Snaps` is the
CHARTED cohort while `measured` is the classified denominator, that every
measured row satisfies `Yards / play = Total yards / measured`, that a
charted-but-unmeasured row keeps its charted count and reports every production
value as absent, that no rendered tendency row prints `0` snaps for a charted
look, that the Blitz/No Blitz counts and every situational blitz rate share one
charted cohort, that the `N charted / M with Run/Pass charted` disclosure renders
on every section at both widths, and that every text element on the board meets
the 12.5px floor. The reconciliation walk has
no truthiness guard: the first version skipped `n === 0` rows, which is exactly
where the two cohorts diverge. `e2e-reports-self-scout` pins all
twelve down-and-distance rows in football order with explicit yardage, held
rows carrying the absence treatment rather than a zero, `Turnovers` never
`Giveaways`, a populated section never badging zero, and that no defensive tell
reports its own grouping dimension — and section 14 asserts against the
produced Self-Scout **HTML export string**, because the export is a second
renderer over the same models and drifted from the board silently.
The native Reports harness also renders the shared HTML exporter in a fresh
browser page and asserts the white canvas, square ruled modules, KPI and table
header treatment, zero viewport overflow, print-media table-header contract,
and the data-supported Offense visual panels in its compact fixture.
Set `GIQ_REPORTS_EXPORT_SCREENSHOTS` to capture the rendered game and season
exports for visual review.
`e2e-reports-export-realdata` is the canonical export authority. It loads only
`2025-st-joseph-mavericks-jv` (six games, 449 plays), captures game, season and
Special Teams HTML exports in memory, and requires all five Offense visual
panels in both omnibus reports. It verifies that the Units ledger is inside the
Special Teams chapter, renders each document to a bounded landscape PDF,
checks white-canvas containment and browser errors, and hash-checks the season
file before and after. Set `GIQ_REPORTS_EXPORT_REALDATA_SCREENSHOTS` to capture
all three canonical exports.
`e2e-reports-players` pins that punt
distance and return yardage come from the dedicated ST fields and that Players
and the team Special Teams report agree on the measured return COUNT as well as
its yardage. `e2e-reports-matchup` pins that no
composite-identity column is labelled a play call. `e2e-reports-offense-realdata`
now exercises **Season scope** at both release widths, which is the gap that let
a season-only containment defect ship.

`e2e-reports-defense-realdata` is the Defense Revision 2 composition authority
(84). It loads only `2025-st-joseph-mavericks-jv`, in memory and hash-checked.
Across all six games at 1440 and 1280 in Current game scope it asserts the ten
literal KPIs in order, the four sections, no Game-by-game, the module geometry
rules (fixed-schema modules exactly their rows; variable modules a standard
height with `-` rows for unused capacity; overflow scrolling internally under a
sticky header), paired edges, 20px gutters, no page or in-module horizontal
overflow, no clipped cell, the shared title/linescore/identity edges, the
12.5px floor on every text element, the sans module-title face and no `0`-snap
row. On the canonical season it pins the full module inventory, order, width
and height and the KPI values for both scopes at both widths (Touchdowns Allowed
7 / Defensive Touchdowns 0 for the season, 0 / 0 for St. Peter Lutheran), 8
red-zone possessions with 6 touchdowns allowed measured from our goal line, the
stop inversion, the unchanged `defenseDashboard` output, every existing Defense
data contract and the unchanged four-section export. It sweeps nine desktop
widths forcing `100.0%` into every KPI tile, proves the bar sticks on the real
route scroller and each jump link lands its heading under it, and captures the
whole surface at 1920, 1440, 1280 and 390 in both scopes into a per-process
directory. `e2e-reports-defense-board` (55) covers what the canonical season
lacks on a synthetic season: touchdowns by both scoring sides (our return
touchdowns never score an opponent possession or count as a conversion
allowed), run TFL excluding negative passes, no explosive count on an
unmeasured structure row, high-leverage field direction, a takeaway
without a touchdown, Safety and Field Goal possessions as their own outcome rows,
possessions overflowing their module, a game with no front, coverage or play
type, sorting every player column by mouse, Enter and Space, pairing, scope
switching and jump targets, plus the defensive field-zone bands against the
offense-oriented ones, the charted perspective of a relabeled Matchup rep, and
the board and the export agreeing on every opponent-drive outcome, and a
red-zone pick-six reading as a stop with no touchdown allowed across
`defensivePerformance`, the shared cohort metric, the call rows and Self-Scout,
checked against the same snap scored by the opponent. Both were
mutation-verified: all 33 reintroduced
defects red in the synthetic harness, and clipping, pairing, KPI fit and floor
mutations red in the canonical one.

| Plan | `e2e-plan-contract`, `e2e-plan-export`, `e2e-study-plan` |
| Settings | `e2e-native-settings`, `e2e-tag-library-settings`, `e2e-playbook-library` |
| Overlays | `e2e-native-overlay` |
| Quick Chart | `e2e-native-quick-chart` |
| Football models | `e2e-penalty-contract`, `e2e-special-teams-contract`, `e2e-b2-tries`, `e2e-play-call-charting`, `e2e-core` |
| Analytics | `e2e-analytics-registry`, `e2e-analytics-metrics`, `e2e-analytics-projection`, `e2e-parity` |
| Film identity / relink | `e2e-clip-identity`, `e2e-clip-match`, `e2e-relink-legacy`, `e2e-relink-linked`, `e2e-film-index`, `e2e-film-persist`, `e2e-linked-film` |
| Persistence / catalog | `e2e-sql-catalog`, `e2e-catalog-persistence`, `e2e-catalog-backend`, `e2e-catalog-versions`, `e2e-revision-fence`, `e2e-snapshot-envelope` |
| Recovery | `e2e-native-recovery`, `e2e-native-mirror-recovery`, `e2e-wipe-recovery`, `e2e-restore-point-throttling` |
| Import / export | `e2e-csv-roundtrip`, `e2e-csv-projection`, `e2e-legacy-film-fields` |
| Cross-cutting guards | `audit-design-approvals`, `e2e-design-system`, `e2e-css-ownership`, `e2e-copy-standard`, `e2e-xss-names`, `e2e-raw-read-audit` |

`e2e-reports-matchup` also pins scoring ownership through the cross-read: an
offense-origin touchdown relabelled as the opponent's defense retains `us` as
its scoring side and reports a 0% stop rate plus one touchdown allowed for that
opponent defense. The charted unit, not the projected unit, owns both field and
score perspective.

## Tier 2 — Affected route

Tier 1 for the route you touched, **plus** the surfaces it shares state with:

- **Cross-route:** `e2e-workspace-shell`, `e2e-workspace-context`,
  `e2e-game-context`
- **Persistence:** `e2e-projform-durability`, `e2e-season-roster-scope`,
  `e2e-roster-ownership`, `e2e-operation-diff`
- **Opponent-scout ownership and Home navigation:** `e2e-scout-ownership` (91)
  is the contract harness — the pure parent-resolution rules, the atomic toggle
  (instrumented for the ABSENCE of `_openLibrary`, `closeSeason` and any
  auto-open), parent-scoped lists, create-time persistence, the exact-parent
  return, rendered rail clicks in both directions with every row's `current` flag
  deliberately staled, cross-team isolation with reused year and level, the
  unassigned row driven through its real select and Assign button, a foreign-team
  scout refused at the command boundary, dangling-parent repair versus no silent
  reassignment, the canonical write boundary (open-scout assignment surviving a
  later ordinary save and a reload in body, catalog row and live object) and an
  overlapping persist/assignment ordered by the per-season queue.
  `e2e-home-deferred-repair` (105) and `e2e-home-review-repair` (37) own the
  rendered Home states, including the approved empty Opponent Scout composition.
  `tools/capture-scout-workspace.mjs` captures eight states at 1920/1440/1280/768/390.
  It also pins the two 2026-09-14 Codex findings: two unassigned rows where the
  first is assigned through its own rendered control and the survivor's selector
  must be blank and unsubmittable; and the sample season rejected as a parent by
  `isValidParent`, excluded from legacy inference, establishing no parent when
  opened, refusing scout creation without writing, surfacing an existing
  demo-parented scout as unassigned with its data intact, and staying removable.
  The row defect needs BOTH guards removed to reproduce — keying alone and
  controlled state alone each prevent it — so its mutation removes both.

  **A workspace toggle must never be proven by a season change.** Five
  assertions across the two Home harnesses asserted that each side "restores its
  most recently opened season of its own kind"; that redirect is retired, and any
  replacement asserts the parent stays open, nothing is auto-opened, and the list
  is parent-scoped. Their retirement reasoning is recorded beside each one.

- **Repair Batch 1 data correctness:** `e2e-data-correctness-batch1` (76) is the
  contract harness for three defects, each mutation-verified. **Season film
  health** — a two-season fixture reusing game id `g1` with different film on
  disk, proving `WorkspaceContext.filmHealth(game, seasonId)` and
  `StorageBackend.listFilmFiles(gameId, seasonId)` carry the owning season to
  the lookup, that every result states the season it is about, and that the
  Home/library aggregate always prints an explicit `N of M games linked`. The
  Tauri directory resolution itself is pinned in SOURCE, because Chromium cannot
  exercise the desktop filesystem — that half still needs an installed check.
  **Drive grouping** — alternating possessions where both teams hold Drives 1
  and 2 must produce four groups with distinct identities in the shared owner,
  in Breakdown's play strip, and in Study's `drive` dimension; a special-teams
  snap joins its surrounding drive and a blank unit keeps the plain label.
  **Field Goal / XP** — no authoring route can store `attemptType:'extraPoint'`
  on a field-goal unit, both try directions credit the right team, and a
  historical `unit:'fieldGoal', attemptType:'extraPoint'` record still reads and
  still scores one point. The UI half is asserted against the owning source, not
  the minified bundle: `Extra Point` legitimately survives there as a Study
  dimension label, so a bundle-text search cannot discriminate.
  **In-flight film operations** are keyed by season AND game: a save running in
  one season must not make another season that reuses the game id report
  "Checking film…" over its own settled count. Covered on a two-season reused-id
  fixture, with the explicit-season clear, the no-season fail-safe sweep, and the
  create-time season default; the producers are pinned in source, because a
  caller that stops threading the season reopens the hole where no in-page
  assertion can see it. **A linked season missing one clip prints its count**,
  not `Film needs attention` — that label is reserved for film that cannot be
  COUNTED (an unreachable folder, a failed listing, or a rejected health
  lookup). Managed-list failure, total lookup rejection, and one rejected game
  in a mixed season are pinned so none can print a trustworthy-looking count.

- **Play-library vocabulary (PL-1, PL-2):** `e2e-play-library` (50) drives the
  RENDERED Add controls, not the services behind them. It reproduces the dead
  route - a live settings sheet swallowing an `Edit library` / `Add to Playbook`
  request - then proves the retarget carries the tab, the chart group and the
  typed play-call name. Adding a custom play type is asserted through the real
  input and button: added exactly once, one rendered row, an IMMEDIATE charting
  choice with no reload, the field cleared, blank refused in words, exact and
  case-only duplicates refused, a built-in unaddable as a custom, one canonical
  store per team with no parallel cache, and survival of a real page reload. The
  playbook side covers add, duplicate and a blank that cannot be submitted.
  `Option` is asserted in the owner (distinct from RPO, ambiguous for run/pass,
  outside the exclusive group), in the deck, in the Film Room grid editor through
  `PlayGrid._options`, in the cut-up filter, in Study's dimension, in the Reports
  breakdown, and across an export/import round trip - plus the version-4
  visibility migration for a team saved before the bump. Mutation-verified five
  ways. **EVERY charting workflow is asserted, not just the deck** - Codex's
  2026-09-15 review found the vision analyzer keeping its own play-type enum AND
  its own validator, so a valid `Option` response was silently discarded, and
  neither keyboard map offered the new built-in. The harness now pins that the
  vision validator accepts every built-in, that its PROMPT offers exactly what
  the validator accepts, that Quick Chart and the global charting shortcuts each
  carry a key for every built-in with no key assigned twice, and that the
  coach-facing legend lists it - so the next built-in cannot be dropped from one
  workflow the same way. Every fixture is a synthetic season on an isolated team
  id.

- **Breakdown installed viewport and the shared context selector (BD-VP, BD-CTX):**
  `e2e-breakdown-viewport` (167) measures 1920x1080, ~1420x1000, 1440x900 and
  1280x720 in populated Offense, Defense and Special Teams charting. **BD-VP is
  CLOSED FOR BETA USE after the coach-approved `1.12.0-88` installed smoke on
  2026-09-16: the `1.12.0-87` installed smoke disproved the first repair while this
  harness was green throughout.** Headless Chromium renders overlay scrollbars
  unconditionally - a `::-webkit-scrollbar{width:40px}` probe measures a 0px
  gutter - so it can never render, measure or fail on a scrollbar arrow or a
  horizontal track. The BD-VP assertions are therefore deliberately environment-
  INDEPENDENT: they pin the CONDITIONS that produce the chrome, not the chrome. No
  Breakdown stylesheet may set `scrollbar-width`/`scrollbar-color` (they suppress
  every `::-webkit-scrollbar-*` rule, which is what killed the arrow suppression)
  or `scrollbar-gutter` (it reserves a per-runtime width, which is the overflow
  mechanism); the arrow suppression must survive on both axes; no chip row may be
  pinned `flex-wrap:nowrap`; the charting deck scrolls vertically only with
  nothing reaching past its content box; and every full-width deck row starts at
  ONE inset that nothing crosses on either side. It also asserts no page-level
  horizontal scrolling, that the play filmstrip is the ONLY thing scrolling
  sideways (exempt BY NAME, reported separately so the exemption cannot widen),
  nothing clipped past a viewport edge, no anonymous arrow-only control anywhere,
  global navigation wholly inside the viewport, and the approved picture budget at
  each width. The selector half measures CONTRAST rather than asserting a hex:
  each selector visibly distinct from the bar, a 3:1 border boundary, no blue-gray,
  one shared token across all three, preserved caret and typography, and rest /
  hover / focus / open / disabled - plus the same surface on another route, because
  the owner is shared. Screenshots land in `artifacts/breakdown-viewport/` as
  IMPLEMENTATION EVIDENCE ONLY; they confer no design approval. Mutation-verified
  by restoring the original padding, the `nowrap` chip row and `scrollbar-width`
  (4 red). **Chromium cannot certify** the rendered scrollbar chrome this repair
  is about - that stays an installed check, and a green run here is not a repair.

- **Linked clip-set reconciliation (FILM-01):** `e2e-film-clip-set` (45) owns
  the two-direction rule and the durable clip-identity lifecycle. Equal sets
  are no error; a clip the game records and the folder lacks stays `missing`;
  a folder video with no record is `mismatch`, as is both at once, each with
  its own `detail`. Managed film keeps its one-way rule. The deletion half
  covers loaded and unloaded in-app deletion, an uncharted folder clip removed
  through the playlist, a clip two plays share, Undo, commit/reopen, per-game
  reset of the removal set, season isolation on a reused game id, and a
  cross-game serialize inheriting no film index. Home's row, the selected-game
  fact and the library aggregate are asserted to agree on one result, and the
  Settings status mapper is pinned in source because an unnamed state there
  silently reads "No film" - a different claim. Mutation-verified three ways:
  the one-way comparison, stale durable-deletion behaviour, and the prior
  prune, removing the save the removal signal schedules, destroying the removed
  clip instead of stashing it, and restoring the adjacent-clip switch that
  overwrote the restored selection. Three of those exist because a green pass
  missed them, each found by a later review: an uncharted removal reached no
  autosave; Undo restored a play without its live clip; and Undo then landed on
  the adjacent play. The first two were invisible because the original Undo case
  ran with an EMPTY playlist; the third because the loaded case asserted the
  clip and play ARRAYS and never the selection. **Assert the selection, not just
  the collections** — a reconcile that calls `switchToClip` moves
  `currentPlayId` as a side effect. The Undo section runs a loaded three-clip
  playlist with `clipId` set, which is what makes `deleteCurrentPlay` take its
  playlist branch at all, and pins the restored selection, the active clip and
  the tag form together. Every fixture is synthetic and every substitution
  restored; no coach
  season, catalog row or film file is read or written. **Chromium cannot
  certify** Tauri's own `fs.readDir`/`exists`, the asset protocol, or a folder
  edited outside the app while it runs - those stay installed checks. The
  `1.12.0-86` installed smoke passed those focused checks on 2026-09-15. The
  separate rapid-scrubbing defect was not reproduced and is deferred; a future
  repair still requires native event-sequence evidence and WebView2 stress smoke.

- **Live film-source binding:** `e2e-film-health-realdata` (14) audits the
  registered `2026-varsity-demo` season ("2025 St. Joseph Mavericks - JV")
  against the coach's real film library at `D:\Football\Film`
  (`GIQ_FILM_LIBRARY_ROOT` overrides) and asserts the repaired owner prints the
  count those sources actually support. It is READ-ONLY: it reads the installed
  season body and walks the film directories, never writes, renames, relinks or
  deletes, and never touches the backend the running app uses. Per-game truth is
  computed in Node from the app's own `_expected` / `_identity` /
  `listLinkedFilm` rules, then fed to the real in-page `filmHealth` and
  `_aggregateFilm` through a stub returning those real listings. **It cannot
  certify Tauri's own `fs.readDir`/`exists` inside the installed WebView2
  build** — that stays an installed check. Skips honestly when the season body
  or the library root is absent, and a skipped run certifies nothing.

- **Roster ownership:** `e2e-roster-ownership` (71) is the contract harness —
  cross-team and cross-season isolation, empty-stays-empty across switching and
  reload, same-season sharing with no game-level copies, game creation neither
  copying nor clearing, `_normalize` never adopting a game roster and never
  marking a season whose games still carry one (`roster: []` included), VALIDATED
  promotion, removal of `roster` from every game node once settled, the first
  legacy open's durable write asserted against DISK, a second open dispatching no
  migration write, emptying not resurrecting players, import/adopt/restore landing
  the same structure, backup/restore scoped to one season, and attribution reading
  the selected season's own roster with no "missing owner" escape hatch.
  `tools/audit-roster-ownership.mjs` is the read-only cross-store auditor; it
  prints counts and a roster hash, never player data.

  **A conflict or a failed migration write must be proven across a save and a
  reopen, not at the open.** A conflicted season refuses to open, and the first
  attempt at containment — exposing `_normalize(original)` — was destructive two
  saves later: the synthetic `season.roster: []` it created was persisted by the
  next ordinary save and read as an explicit roster by the open after that, which
  deleted every conflicting copy. Sections 7c/7e/7f/7g therefore hold a real
  season open, refuse the conflicted one, save, switch, refuse again, and assert
  byte-identical source bytes throughout — plus the same containment for a failed
  write (failing the backend for one season id only, then retrying), a conflicting
  import, and a conflicting restore.

  `e2e-delete-undo-film` also pins the navigation boundary: a migration-refused
  season open does not count as leaving the current season, so its pending game
  deletion, managed film, purge timer and working Undo action all remain intact.
  Its successful-switch case reuses one game ID across two seasons and asserts
  both the explicit outgoing season passed to `deleteFilm` and the desktop
  filesystem path, so a browser-only game-id spy cannot hide pointer drift.

  A harness fixture may not give a game node a roster except to plant a hostile
  legacy or scout copy the model must ignore — and then it must assert the copy
  is actually present. `e2e-reports-season` gave every game an empty
  `roster: []`, which reproduced the dual ownership the model no longer has.
- **Game context and form:** `e2e-game-form-context` (20) proves Add Game asks
  for no analytics perspective and that Program/Scout is derived from the
  owning season; `e2e-game-form-visual` (242) is its visual contract across
  four variants and five release widths.
- **Responsive/visual:** `e2e-responsive-containment`, `e2e-breakdown-a11y`
- **Populated screenshots** at 1440×900, 1280×800, 768×1024, 390×844 — captured
  with real multi-season data and **inspected**, not merely produced. Reports
  use the registered canonical season and the viewport set named by the
  surface's approved captures (currently 1440×900, 1280×720, 768×1024,
  390×844).

Touching a shared owner means running Tier 2 for every route that consumes it,
not just the one you were working in.

## Tier 3 — Release

In CI and any environment where Bash is on the PATH:

```bash
bash tools/run-gate.sh              # build + full gate
bash tools/run-gate.sh --no-build   # gate only, when dist/ is already fresh
```

**On this Windows host those bare commands do not run** — `bash` is not on the
PowerShell PATH. Use Git Bash through its explicit path, as a login shell, with
an absolute `cd` (verified working):

```powershell
# build + full gate
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh'

# gate only, when dist/ is already fresh
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --no-build'

# detector self-test
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'
```

Plus:
- **Windows CI** (`.github/workflows/gate.yml`, `windows-latest`, Node 22).
  Windows is the only platform the coach runs; a Linux-only pass can hide a
  Windows-only defect.
- **Real-data checks** — `e2e-realdata`, `e2e-integrity`, `e2e-parity` against
  the real season fixture. CI runs real-data in a degraded mode
  (`GIQ_REALDATA_OPTIONAL=1`) because a runner has no season mirror, so a local
  run is the only one that certifies it.
- **Installer** built from the reviewed commit, with all four version owners
  matching (`js/app.js`, `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`,
  `src-tauri/tauri.conf.json` — `e2e-p0-exit` asserts this).
- **Installed WebView2 smoke** — see below. Mandatory; nothing above replaces it.

---

## The detector self-test

```bash
bash tools/run-gate.sh --self-test
```
```powershell
& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh --self-test'
```

Run this whenever you doubt a gate result, and after touching the runner.

It proves the runner's **own pass/fail detection** against known-green and
known-red fixtures. That check exists because the detector has been wrong in
both directions:

- An earlier ad-hoc runner grepped case-insensitively for "fail" and matched
  test *names* describing fail-closed behavior ("unknown groups fail closed"),
  reporting 4 false failures out of 49. A gate that cries wolf trains people to
  skim past the real one.
- Reading only the result line was also wrong:
  `e2e-special-teams-contract.mjs` prints `RESULT: N passed` with no failure
  count and signals failure only through `process.exitCode`, so a failing run
  reported green.

A harness is green only when **both** its exit code is 0 **and** its result line
is clean. The self-test also confirms failure evidence survives a long harness
tail, and that a skipped optional fixture is not counted as green.

---

## Rules that are not optional

**Build and gate in one command.** The environment bumps source mtimes between a
separate build and test, which false-fails `e2e-parity`'s stale-bundle guard.
`run-gate.sh` builds and gates together on purpose; use `--no-build` only when
`dist/` is genuinely fresh.

**Never run two full gates concurrently, and never touch processes while one is
running.** Each harness launches its own Chromium. Killing a browser mid-run —
including a well-meant cleanup of leaked processes — corrupts the result of
whatever was running. That has produced a phantom failure and a wasted
investigation. Wait, or run the gate uninterrupted and clean up afterward.

**A failing-first regression for every repaired defect.** Watch it fail for the
right reason before you trust it. Then mutation-verify: reintroduce the defect,
confirm the assertion reds *naming* it, restore, confirm green. An assertion
that cannot fail for the reason its name claims is not coverage.

**Never redefine a threshold to match what the implementation achieved.** Meet
the stated requirement, or stop and report the exact conflict. Disclosure in
prose is not a substitute for a test that holds the line.

**Baseline "pre-existing" against a committed commit, never against the current
dirty working tree.** A failure you assume is pre-existing is often yours. The
method — and it must not involve stashing, because the working tree may carry
another agent's uncommitted work (see the working-tree rule in `CLAUDE.md`):

1. Check the committed baseline out into a **throwaway worktree** or a
   `git archive` export:
   `git worktree add "$env:TEMP\gi-baseline" <commit>`
2. Build there and run the **same command against the same fixture** you ran on
   the candidate.
3. Compare the two results, then remove the worktree
   (`git worktree remove --force …`).

Never stash, reset, clean, or overwrite work you did not create. This is exactly
how the standing `e2e-design-system` 15/2 was shown to predate the documentation
milestone: the identical two failures reproduced at the prior commit in a
throwaway worktree, with the repository's own working tree untouched.

**Regenerate an analytics golden only as a reviewed, audited correction** called
out in the diff, never to make a test pass.

---

## What automation cannot certify

**Puppeteer cannot certify installed WebView2 behavior.** The harnesses run in
headless Chromium against a loopback HTTP server (`tools/app-entry.mjs`).
Codecs, the Tauri asset protocol and its CSP origins, native file dialogs,
filesystem scope grants, the updater, and app lifecycle are only real in the
installed desktop build. Every one of those has produced a defect that a fully
green gate could not see — most notably an asset-protocol CSP origin that
blocked every video load on Windows while every harness passed.

Required installed smoke, on the built installer:
1. Linked film on its real drive plays, with no managed-copy fallback.
2. Managed film auto-loads after an app restart.
3. Chart a play, close, reopen — data and film both survive.
4. Switch seasons — counts, tags, and film identity survive.

**A screenshot comparison must be shown capable of failing, and the pointer must
be parked.** Two traps, both hit during the CSS-ownership cleanup. First, a
capture harness proves nothing until a deliberate visible change is shown to
alter the image — a mutation that turns out to be invisible (a `body` background
the shell paints over) reads as a passing comparison. Second, fixture setup
clicks real controls, which leaves the mouse inside the layout; whatever sits
under it renders its `:hover` state, and the capture stops being deterministic.
That produced a stable, reproducible, entirely false "regression" in Study and
Film Room. Move the pointer to a neutral corner before every shot, and establish
the noise floor by capturing the same build twice before trusting any diff.

**Automated geometry is not visual approval.** Overflow and hit-target checks
prove containment, not legibility. Visual acceptance requires *inspecting*
populated screenshots at the release widths with real multi-season data: zero
overflow with unreadable content, dead space, or a collapsed panel still fails.
An empty fixture understates string lengths and vocabulary size, so a screenshot
of synthetic data proves less than it appears to.

Both are why the Charlie Gate — show the real app with real data and get
PASS / REVISE / REJECT — happens before packaging, not after.

### The typography floor is measured on the canonical season

`tools/e2e-reports-typefloor-realdata.mjs` is the only place the shared type
floor is established. Every board's own composition harness runs a SYNTHETIC
fixture, and the canonical-data rule in `CLAUDE.md` is explicit that synthetic
data cannot establish Reports visual parity: a QA fixture has different labels,
name lengths and row counts, so it renders different type. The first attempt at
this pinned five boards' floors from their own synthetic fixtures and recorded
Special Teams as 11px when the real figure is 9.5px.

The census reads every Reports board at both release widths off a read-only copy
of the canonical season and hashes the source before and after. It pins the
complete sub-floor map by size, tag and count plus each board's minimum, in both
directions. The Offense narrow-width exception additionally pins its eight named
module owners and proves every affected table cell belongs to one of them. Down
is a regression. Up means work was completed and reds until
`docs/VISUAL-SYSTEM-RULES.md` is updated in the same commit -- a silent
improvement leaves the documentation lying about where the floor is enforced.

The board harnesses mirror their own number as a same-fixture regression guard
and say so in the comment rather than claiming canonical provenance.

### Containment is not composition

The full gate must include both `e2e-breakdown-geometry` and
`e2e-home-breakdown-visual-repair` after shared shell or typography changes.
The former protects the film picture budget as well as deck containment; the
latter must derive selector bounds from canonical names and test the rendered
text for clipping, not preserve compact prototype dimensions.

A band that clips nothing, overflows nothing and engages no scroller can still be
badly composed, and every geometry check in this repository was written to catch
the first three. On 2026-09-11 the coach rejected a Defense screen that had just
passed 58 assertions: the linescore band had wrapped into two rows, its identity
strip was spread across the whole viewport on no grid, its name track held a
300px void, and six different right edges ran down the column.

When a change touches shared chrome, assert the composition explicitly:

- Content edges — not border boxes — of every band that carries route content,
  against the route frame's own inset, left and right.
- That a shared band stays on ONE row at every release width.
- That no flexible track absorbs slack into a void beside fixed content.
- That two surfaces reporting the same measurement report the same number. The
  KPI rail and the board beneath it disagreed for a full release cycle.

`e2e-reports-defense-realdata` carries these for the Reports column. None of it
replaces looking at the populated screen.

### A global token change is not a focused change

The 2026-09-11 shared visual range ran six focused suites, all green, and
shipped four red Reports harnesses behind them — two failing against
hash-protected approved evidence. The rule below was already written when that
happened; it was not followed. A `:root` palette or type edit repaints and
re-measures **every** surface, so "materially affected reference surface" means
every board that renders text, not the routes you edited.

The concrete list for a shared token change: `e2e-reports-overview`,
`e2e-reports-offense`, `e2e-reports-offense-realdata`,
`e2e-reports-defense-realdata`, `e2e-reports-self-scout`, `e2e-reports-season`,
`e2e-reports-players`, `e2e-reports-matchup`, `e2e-reports-special-teams`,
`e2e-native-reports`, `e2e-design-system`, `e2e-workspace-shell`,
`e2e-native-breakdown-theater`, `e2e-native-tagging`, `e2e-p0-exit`,
`e2e-parity`, `e2e-css-ownership`, and `audit-design-approvals`.

Two things the harnesses now enforce that they did not before: the typography
floor by class, with a named exception list rather than hundreds of unexplained
ones (`e2e-reports-defense-realdata`), and the no-truncation rule for the longest
canonical Program, Season and Game values on all five routes at both release
widths (`e2e-workspace-shell`).

### Shared visual-system changes

`docs/VISUAL-SYSTEM-RULES.md` is the acceptance contract for shared palette,
typography, route navigation, and context selectors. Any change to a shared
token or shell rule requires:

1. The production Vite build and focused design-system and shell harnesses.
2. The focused harnesses for every materially affected reference surface.
3. Populated screenshots at the release widths with the pointer parked.
4. Installed WebView2 inspection of shared chrome, Breakdown, and Reports.
5. A smoke record naming exactly what the coach accepted; do not infer whole-
   surface or release acceptance from approval of one shared visual correction.
