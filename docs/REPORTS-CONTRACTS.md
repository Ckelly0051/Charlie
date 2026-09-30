# Reports contracts

Current binding rules for Reports. Read this when touching `js/reports-screen.js`,
`js/native-report*.jsx`, `js/native-defense-board.jsx`, `js/stats-engine.js`
report models, `js/season-manager.js` or the HTML exports. Design authority is
`design-approvals/APPROVALS.json` and each surface's comp RATIONALE; shared
visual rules are `docs/VISUAL-SYSTEM-RULES.md`; defects are `docs/OPEN-DEFECTS.md`.
The reasoning and incident history behind each rule is in
`docs/archive/CLAUDE-2026-09-27.md` (search the rule's own words).

Installed status: Defense Revision 2, Players Revision 2 and Special Teams were
approved in the `1.12.0-91` smoke; the global strip, secondary bar,
down-and-distance chart and module system passed the `1.12.0-98` smoke. Every
Reports manifest still reads `productionStatus: REJECTED`; moving the registry is
a separate, evidenced step.

## Cross-cutting

- Overview **Turnovers** means total team turnovers conceded across charted
  offense and Special Teams, never net margin. Read `StatsEngine.totalTurnovers`;
  do not derive the count in presentation. No offense-only subtext. A lost muff
  requires explicit opponent recovery; ordinary kick possession changes and
  unknown recovery are not turnovers. No-play rulings and tries remain excluded.

- **Never import `preact/compat`.** It rewrites `onChange` to `onInput` app-wide,
  so change-committed fields commit per keystroke. Portals use core Preact.
- **Canonical data.** Evidence uses a read-only copy of the registered
  `2025-st-joseph-mavericks-jv` season (`tools/canonical-season.mjs`). Never
  write back to the coach's source. A handoff states season, game and play
  counts, scope and that the copy was read-only.
- **Static compositions.** The approved comp fixes modules, order, row/tile
  counts and geometry. Data fills slots; it never adds rows, removes modules or
  resizes a board. Short cohorts use the approved absence treatment; long ones
  are ranked and capped deterministically with the cap named (`Top 10 Plays`).
  Counts live in one named owner per surface and are pinned in sparse, overflow
  and canonical tests.
- **Name the cohort.** *Charted* is every snap; *classified* carries `playType`
  or `runPass` and is what `compute()` measures. Every count says which.
  `stats.allPlays` stays the classified count (parity serializes it);
  `stats.chartedPlays` and `stats.phaseCounts` are non-enumerable.
- **Absence.** A measured zero prints `0`; no denominator or no charting prints
  `—` / `No data` per the surface's comp; a `-` row is unused capacity. Never a
  fabricated zero.
- **Wording.** `_ddPretty` owns down-and-distance wording (`1-3` / `4-6` / `7+`
  via `StatsEngine.DIST_LABELS`); film cuts carry the raw key. Reports say
  `Turnovers`, never `Giveaways`. Explosive-play labels follow
  `e2e-explosive-labels`.
- **A phase is counted from the snap**, from `tags.unit` over the charted cohort,
  never by subtraction.
- **Film references are composite `gameId::playId`**, one film-navigation owner.
  Every clickable number opens exactly the plays behind it.
- **Typography floor 12.5px.** The census is `e2e-reports-typefloor-realdata`;
  remaining exceptions are recorded in `docs/VISUAL-SYSTEM-RULES.md`.
- **Exports print their board's own schema** through the shared white
  `documentShell` (landscape, exact colours, chapters on new pages). An export
  never recomputes a different cohort. Held rows print dashes.

## Route chrome

- **Global strip** (`native-reports.jsx`): a fixed 50px head then one 44px strip
  — `Our game` / `Opponent scout`, eight equal tabs (Overview, Offense, Defense,
  Special Teams, Players, Self-Scout, Matchup, Season), Export. Identical tab
  boxes on every report at 1440 and 1280; nothing conditional above it; the
  opponent perspective disables, never hides, the four self-only tabs.
- **Secondary bar** (`SectionBar` in `native-report-kit.jsx`, portaled into
  `[data-reports-secbar]`): one 46px bar on the seven multi-section reports —
  pages left, scope and export right; inline when embedded in Season. Overview
  has none. Page, scope and section choices are `ReportsScreen` controller state
  so re-renders keep them. A page never narrows an export.
- **Scope.** `_usesCurrentGameContext()` is the one scope decision. Defense,
  Special Teams and Players open on Current game; Full season, Season and Matchup
  name their real scope in the header. The game KPI rail is deleted.
- **Overview score** is the only game-summary chrome: official linescore
  (`gameResult()`), Charted, Turnover margin. Quarters come from charted scoring,
  totals prefer the official score. One full team name per row; fixed quarter and
  total columns.
- **Module system.** Every board except Overview uses the Defense module system:
  numbered page heading with its cohort, outlined modules on 20px gutters, a
  50px title bar (2px accent rule, 17px sentence-case title), 12.5px
  sentence-case column labels. Accent: Offense gold, Defense cyan, Special Teams,
  Matchup and Season the neutral bone line; Players and Self-Scout use each
  module's phase.
- **Down-and-distance chart.** First on Offense > Situations and Defense >
  Situations. One owner, `StatsEngine.downDistanceChart`; one set of printed
  strings shared with the exports. Cohort is run/pass snaps with a charted down
  1-4 and positive distance; success uses `isSuccessfulPlay` (ours) or
  `isOpponentSuccess` (theirs); multi-select types credit each component and add
  no snap; an unfaced cell is a held dash.

## Overview

Fixed schema per its comp and `e2e-reports-overview`. Total plays is the charted
count with the classified qualifier; Snaps by phase counts `tags.unit`; Stop
Rate sits last in Defense & discipline, `Yards / play allowed` first.

## Offense

- Six pages: Identity, Calls & tendencies, Structure (`Structure and
  execution`), Situations, Field & production, Advanced. Every module renders on
  exactly one page; one board height per page on every game.
- `OFFENSE_ROWS`, `OFFENSE_EPA_ROWS`, `OFFENSE_MODULES` in
  `native-report-tabs.jsx` own every count. `fitRows` returns exactly the
  allocation, padding with held rows. Every module holds its slot.
- 12-column rhythm: two-column bands 8fr/4fr or 6fr/6fr, three-column 4fr each.
- Zone 2 table bands cap at five rows; a fixed seven-cell Drive outcomes strip;
  Direction vs Strength four rows (the fourth is `Balanced strength`); Formation
  five rows plus a fixed 3 × 5 Formation × Play Type matrix.
- `Top 5 Tendencies` is a 410px panel with a fixed 54px row pitch.
- Team Profile: Yards / play, Success rate, Explosive rate, Negative rate, 3rd
  down, Points / drive. Field heat map is the compact two-strip version. No
  `Visualizations` module.

## Defense (Revision 2)

- Owners: `StatsEngine.defenseBoard()` (built on `defenseDashboard()`, carried as
  `board.dashboard`) owns every value; `native-defense-board.jsx` lays out;
  `css/native-defense-board.css` owns geometry.
- Four pages: Performance, Opponent offense, Scheme & passing, Situations, each
  headed `N charted / M with Run/Pass charted`. Ten KPIs in order: Total yards
  allowed, Rush yards allowed, Pass yards allowed, Yards / play, Takeaways,
  Explosive Plays, Touchdowns Allowed, Defensive Touchdowns, 3rd Down Stop %, 4th
  Down Stop %. Game-by-game only at Full season.
- **Module geometry is a contract:** 96px chrome plus rows at the module pitch;
  fixed-schema modules are exactly their rows; others take the smallest of
  220/300/380/460 and scroll internally past capacity; half-width modules pair
  with an equal-height partner.
- **Touchdowns have two sides, never inferred:** Allowed counts
  `scoringSide === 'them'`; Defensive counts `'us'`.
- **A defensive measure asks whether the opponent succeeded:**
  `isOpponentSuccess()` and `isTouchdownAllowed()` are the rules, relative to the
  defense being measured (Matchup cross-reads keep `__chartedUnit`).
- **Field position is owned by the charted unit** (`fieldPerspective()`,
  `_defensiveFieldZone()`); high-leverage rows measure from our goal line.
- **One cohort per column:** total, rush and pass yards and yards/play all come
  from the classified run/pass cohort; `charted` is the displayed Snaps and
  percentages, `measured` the production denominator; `n` aliases `charted`.
- Opponent drive outcomes are data-driven in football order; whose points a
  drive ended with is decided once, in `opponentDriveList()`, shared with the
  export.
- Every module states its cohort in counts (`15 run/pass snaps`,
  `15 snaps · 18 tags`, `14 direction-tagged snaps`,
  `20 snaps · penalties included`).

## Special Teams

- Six-column rhythm: six KPIs, a six-card unit ledger (every unit, empty ones
  included), five sections. Kickoff and kick return, punt and punt return stay
  distinct.
- A Special Teams snap is read from its structured event only; one with no event
  is in no unit, and the disclosure is counted from film references.
- `SpecialTeamsModel.UNIT_LABELS` is the one owner of unit names; `puntReturn`
  displays as `Punt Return / Block` and includes `Blocked`.
- **A loose ball has no default owner:** a touchdown on `blocked`, `muffed` or
  `recovered` with no recovering side scores for neither team.
- One absence label, `No data`. Dedicated fields (`kickDistance`,
  `returnYards`) are authoritative on every surface, player rollups included;
  `Ret` is the measured count. Outcome bars are absolute percentages.
- `StatsEngine.isFieldGoalAttempt` / `isFieldGoalMade` are the one Field Goal
  cohort; an extra point is not a field goal.

## Players (Revision 2)

- Six roles grouped by phase (Offense: Rushing, Passing, Receiving; Defense:
  Tackles; Special Teams: Return Game, Kicking / Punting); two phase columns at
  desktop, one below 1420px.
- A module is its row capacity (`cap` 3, 6 or 9); held rows fill unused slots;
  the module body is the only scrollport and its column header is sticky at 0.
- `StatsEngine._playerCredits` is the one credit index: every number and every
  clip is a bucket read two ways. A statistic opens its own events; identity
  opens the in-tab detail view. `playerRoleSummary` is the one game-row summary
  for board and export. `Long` is the true longest, negative included.
- Unmeasured values stay `null` in sort data and sort last. Situational
  dimensions come from existing owners and are offered per role. Selected games
  narrows every table and reference; column visibility is presentation only;
  Export follows the open player.
- Tables own their column geometry (`colgroup`, `table-layout:fixed`,
  `.gi-player-module table.gi-player-table`).
- No participation counts, targets, pressures, missed tackles, per-player
  blocking/coverage grades or combined rating.

## Self-Scout

- Five sections as pages: Offensive Summary, Calls & Situations, Structure,
  Defense, Tendencies. Summary and Defense: six KPIs then Positive | Negative,
  Top | Worst Calls, Run | Pass. Module headers carry the title only.
- A defensive call is Front + Coverage + Blitz, joining only charted components.
  Calls qualify at three plays; rankings live in `StatsEngine`.
- Twelve fixed down-and-distance rows in football order; an unfaced bucket is
  held.
- `isExplosive`, `isConversion`, `isTackleForLoss` have one owner each. No
  tendency reports its own dimension as a tell. Stop Rate is never the headline.

## Season

- A container: season KPIs, Game Log, Situational Offense, Scoring &
  Possessions, Trends (Early vs Recent, Wins vs Losses); Offense, Defense,
  Special Teams, Players and Self-Scout are their own boards at full-season
  scope.
- Our Program totals use `_selfGames()`; opponent-scout games never enter them.
  The Game Log is `gamesChrono()` order with an uncharted game as `No data`.
- `SeasonManager.COMPARE_METRICS` is one metric list for both comparisons;
  deltas name their unit; the window is min(4, floor(games / 2)); eligibility is
  per measure; drive reconstruction never crosses a game boundary.

## Matchup

- Two directions, one at a time, each led by Situational Calls over five fixed
  situations (1st Down, 2nd & 7+, 3rd & 1-3, 3rd & 7+, Red Zone), then paired
  Production by Play Type, then `Coverages` or `Personnel and Formation`.
- `Rate` is a share of eligible opponent snaps; ranking is frequency then
  displayed name. `No Blitz` is `StatsEngine.isNoBlitz`; an untagged field is
  not a call. Filters are never widened; no match reads `No matching snaps`.
- A call remembers its field; multi-select identities are order-independent;
  nullified penalty snaps are removed before ranking; four cohorts, four game
  counts; polarity is per cohort. Columns are `Their Top Look` / `Our Best
  Answer`.
- Film is two controls, `Opponent` and `Season`. No score, prediction or
  inferred good/bad colour.
