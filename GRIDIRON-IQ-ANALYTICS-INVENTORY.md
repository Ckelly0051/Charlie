# GridIron IQ Analytics Surface Inventory

> P0-b redesign contract. Source baseline: v1.11.4 on
> `claude/football-film-analyzer-GRiCW`. This inventories current production
> behavior that Study and the metric registry must preserve. It does not propose
> new formulas or authorize production UI changes.

## 1. Canonical Scopes And Semantics

| Scope | Source | Filter behavior | Play identity |
|---|---|---|---|
| Active game | `PlayTagger.plays` | Drawer `PlayFilter` applies before compute | `gameId::playId` |
| Explicit play set | `compute(playsOverride)` | Caller owns selection; drawer filter is bypassed | `gameId::playId` |
| Season | `SeasonManager._allPlays()` | All effective games; no active-game leakage | `gameId::playId` |
| Opponent history | Games whose opponent matches | Recasts opponent offensive snaps for report calculations | `gameId::playId` |

`StatsEngine.compute()` partitions classifiable plays by `tags.unit`: blank
legacy unit defaults to offense; defense requires `unit === 'defense'`.
Conversions use a broader tagged-play source so special-teams plays without an
offensive play type are retained. Run/pass classification must always use
`StatsEngine.isRun()` / `isPass()`, including their legacy fallback.

## 2. Computed Measure Blocks

The P0-a golden harness snapshots every block below at season and game scope.
P0-c must bind these existing producers, not reimplement their formulas.

| Output key | Canonical producer | Lens / principal content |
|---|---|---|
| `totalPlays`, `allPlays` | `compute` | Offensive count; all classifiable count |
| `offPlays`, `defPlays` | `compute` | Unit-partitioned matching play arrays |
| `filterActive` | `compute` | Whether drawer filtering shaped active-game results |
| `rushing` | `_rushingStats` | Attempts, yards, average, long, TD, first downs, fumbles |
| `passing` | `_passingStats` | C/A, percentage, yards, YPA, TD, INT, sacks, long, first downs |
| `scoring` | `_scoringStats` | Offensive scoring summary |
| `downs` | `_downStats` | First downs and third/fourth conversion results |
| `turnovers` | `_turnoverStats` | Offensive giveaways |
| `tendencies` | `_tendencyStats` | Run/pass mix plus formation and play-type effectiveness |
| `bigPlays` | `_bigPlays` | Explosive/offensive big-play set |
| `individuals` | `_individualStats` | Rushing, passing, receiving, tackles, returns, kicking, grades |
| `drives` | `_driveStats` | Drives, points/drive, scoring drives, three-and-outs |
| `situational` | `_situationalStats` | Red zone, goal line, backed up, third long/short |
| `efficiency` | `_efficiencyStats` | Success and explosive rates |
| `personnel` | `_personnelStats` | Personnel usage, run/pass, yards, success |
| `advanced` | `AdvancedMetrics.summarize` | EPA and advanced efficiency summary |
| `defensive` | `_defensiveStats` | Stops, havoc, takeaways, front/coverage/blitz results |
| `gameFlow` | `_gameFlowStats` | Quarter/sequence performance |
| `conversions` | `_conversionStats` | XP, two-point, and kick conversions from broad source |
| `specialTeams` | `_specialTeamsStats` | Punt, kickoff, return, FG/XP/two-point measures |
| `scoreboard` | `computeScoreboard` | Score and points by quarter |
| `hash` | `_hashStats` | Offensive results by hash |
| `personnelSituation` | `_personnelSituationStats` | Personnel by down/distance situation |
| `frontCoverageCombos` | `_frontCoverageCombos` | Defensive front and coverage pairings |
| `playAction` | `_playActionStats` | Play-action versus non-play-action performance |
| `dirMotion` | `_directionMotionStats` | Direction and motion/no-motion splits |
| `takeaways` | `_generateTakeaways` | Generated coaching observations over computed blocks |

### Field-Level Measure Families

The table above names serialization blocks; the registry still needs stable IDs
for their leaf measures. At minimum, preserve these current families (the P0-a
golden is authoritative for exact keys, values, arrays, and denominators):

- Volume and production: plays, attempts, completions, yards, averages, longs,
  first downs, touchdowns, sacks/sack yards, interceptions, and fumbles.
- Efficiency: success/success rate, explosive and negative plays/rates,
  conversion attempts/makes/rates, yards per play/attempt, and EPA summaries.
- Possessions and scoring: drives, scoring drives, three-and-outs, points per
  drive, average drive plays/yards, score totals, and points by quarter.
- Tendencies: count/frequency, run/pass counts and shares, yards, average,
  success, and conversion results for each supported grouping and combination.
- Defense: stops/stop rate, havoc plays/rate, sacks, TFL, takeaways, forced
  incompletions, blitz usage/havoc, and three-and-outs.
- Special teams: punt gross/net/hang/touchback, kickoff distance/touchback/
  returns allowed, return production, and field-goal/conversion makes-attempts
  including distance bands.
- Players: rushing, passing, receiving, tackles/solo/assists, sacks/TFL,
  takeaways, returns, kicking/punting, longs, touchdowns, fumbles, and grades.
- Data-bearing outputs: matching play arrays, grouped rows, generated coaching
  takeaways, sample sizes, `hasData`/insufficient states, and roster labels.

Do not infer a denominator from a display label. P0-c must either expose a leaf
through its canonical producer or explicitly classify it as a derived display
measure and add parity coverage before use.

## 3. Report And View Inventory

### Game Dashboard

| Tab | Production sections |
|---|---|
| Game | Scoreboard; team stats; KPI hero; generated takeaways; down analysis; efficiency; drives; conversions; big plays; game flow; drive chart; special teams |
| Offense | Offense hero; play action; formation/play-type tendencies; Big calls; personnel; backfield/strength; direction/motion; hash; personnel by situation; tendency matrix; situations; heat maps; field visualizations; advanced metrics; offensive and special-teams player tables |
| Defense | Defensive KPI/report body; front, coverage, blitz and front-coverage results; defensive self-scout/tells; defensive player table |
| Self-Scout | Predictability; offensive tells and recommendations; formation/situation matrices; insights; personnel diversity; embedded defensive self-scout |
| Season | Lazy shared `SeasonManager.statsHtml()` render |
| Matchup | Cross-game comparison of own offense against a selected/scouted opponent defense |

All dashboard computations honor the active drawer filter except explicit
override reports. Player rows, drive rows, and `data-cut-*` rows are interactive
film entry points, not decoration.

### Season View

The season header pins games, record, plays, yards, points for/against, and
success. Four subtabs follow:

| Subtab | Production sections |
|---|---|
| Overview | Team totals; efficiency; situational scorecard; turnovers/scoring; first-half vs second-half season progression; game-by-game trends |
| Breakdown | Offensive identity; down analysis; situations; tendencies; personnel; heat maps |
| Players | Wins-vs-losses splits; season player roll-up; per-game box score |
| Self-Scout | Canonical offensive and defensive self-scout over all season plays |

Season rows currently do not launch cross-game cutups. Study must use composite
play references before adding that capability.

### Dedicated Reports

| Surface | Generator / renderer | Scope and content |
|---|---|---|
| Scout Report | `generateScoutReport` / `renderScoutReport` | Current filtered play set: overview, formation and down-distance tendencies, situations, fronts, coverages, tendencies, big plays, notes |
| Opponent Report | `generateOpponentScout` / `renderOpponentScout` | All games against named opponent: their offense from own defensive snaps; their fronts/coverages from own offensive snaps; Big calls |
| Offensive Self-Scout | `generateSelfScout` / `renderSelfScout` | Offensive classifiable plays; tells, effectiveness verdicts, recommendations, matrices, insights, personnel diversity |
| Defensive Self-Scout | `generateDefensiveSelfScout` / defensive report renderers | Defensive scheme-tagged plays; situation/front/coverage tells, stops, havoc, predictability, recommendations |
| Big calls | `_renderBigTwelve` | Exact formation + strength + motion + play-type calls comprising roughly 75/90 percent of snaps |
| Call Sheet | `CallSheetBuilder` | Ranked play calls bucketed into openers, 1st-and-10, second/third down bands, fourth down, red zone, goal line, backed up, two-minute, four-minute |
| Film Room | `PlayGrid` | Editable play-level breakdown, visible-set tendencies, saved filters, selected/visible Watch cutup |

## 4. Filter And Query Controls

### Drawer Play Filter

Quarter, down, play type, formation, personnel, result, and one situation
(red zone, goal line, backed up, third-and-long, third-and-short). Criteria are
ANDed across groups and ORed within a multi-value group. Multi-select formation,
play type, and result values match their split components. This filter shapes
dashboard compute, scout/self-scout, and Cutup Exporter output.

### Film Room Quick Filters

Unit (Off/Def/ST), downs (1-4), run/pass, and flags (TD/turnover/penalty/
untagged). Groups are ANDed; values inside down and flag groups are ORed. Saved
filters persist exactly this state. Row selection intersects the visible set for
Watch. Film Room filters are intentionally independent from `PlayFilter`.

### Analytical Controls

- Tendency Matrix dimension selectors recompute the same active-game play pool.
- Season subtabs change presentation, not scope.
- Matchup and Opponent Report select cross-game opponent scopes.
- Table sorting changes order only; it must never change values or matches.
- Custom Film Room columns and visible-set header tendencies are presentation
  queries, not canonical dashboard measures.

### Tendency Matrix Dimensions

`StatsEngine._matrixDimensions()` is a separate 14-dimension extraction surface;
it is not equivalent to `_buildCutFilter` and was missing from the first P0-b
draft.

| ID | Values / extraction | Notes |
|---|---|---|
| `formation` | split formation components | Multi-attributed |
| `backfield` | exact nonblank value | |
| `strength` | exact nonblank value | |
| `playType` | split play-type components | Multi-attributed |
| `down` | exact down or `?` | |
| `distBucket` | `Short (1-3)`, `Med (4-6)`, `Long (7+)` | Existing Matrix-local labels; differs from canonical drilldown `Medium` |
| `personnel` | exact value or `Unknown` | |
| `defFront` | split front components | Multi-attributed; Matrix still runs over offensive play pool |
| `coverage` | exact nonblank value | Matrix still runs over offensive play pool |
| `hash` | exact value or `Unknown` | |
| `playDir` | exact nonblank value | |
| `motion` | exact value or `No Motion` | |
| `quarter` | exact value or `?` | No `_buildCutFilter` equivalent today |
| `runPass` | canonical classifier result | Unclassifiable values currently fall into `Pass` in this extractor |

The Matrix computes count, runs, passes, yards, successes, run share, success
rate, and average yards for every row/column cross-product. Its `distBucket`
label and unclassifiable `runPass` behavior are production inconsistencies to
pin and resolve deliberately; they must not leak accidentally into the shared
registry.

### Future Study Dimensions Without A Production Registry

The redesign plan additionally requires team, season, game, opponent, date,
drive, field zone, score situation, blitz/pressure, player role, grade,
special-teams phase, and custom fields. These values exist in stored data or
individual reports, but they do not yet share one canonical dimension extractor.
P0-c must label them as new registry contracts and add failing-first fixtures;
they cannot be claimed as parity-covered merely because the fields exist.

## 5. Video Drilldown Registry

Every drilldown returns matching plays whose durable public identity is
`gameId::playId`. P0-a snapshots every type below.

| Cut type | Value encoding | Unit | Current emitter |
|---|---|---|---|
| `formation` | component name | Offense | Tendencies, takeaways, self-scout |
| `playType` | component name | Offense | Tendencies, takeaways |
| `personnel` | exact value | Offense | Self-scout/personnel diversity |
| `backfield` | exact value | Offense | Self-scout tells |
| `strength` | exact value | Offense | Self-scout tells |
| `comboFStr` | `formation__strength` | Offense | Self-scout tells |
| `bigCall` | `formation|||strength|||motion|||playType` | Offense | Big calls |
| `down` | `1`-`4` | Offense | Down analysis |
| `runpass` | `Run` or `Pass` | Offense | Predicate exists; no fixed row emitter |
| `playDir` | exact direction | Offense | Direction table, takeaways |
| `motion` | exact, `Any`, or `No Motion` | Offense | Motion table, takeaways |
| `hash` | exact hash | Offense | Generated takeaways/self-scout tells |
| `dd` | `down|Short|Medium|Long` | Offense | Takeaways, self-scout tells |
| `ddDef` | same bucket encoding | Defense | Defensive self-scout tells |
| `comboFD` | `formation__down|bucket` | Offense | Self-scout tells |
| `comboFS` | `formation__situation` | Offense | Self-scout matrix |
| `defFront` | front component | Defense | Defensive tables/tells |
| `coverage` | exact value | Defense | Defensive tables/tells, takeaways |
| `blitz` | blitz component | Defense | Defensive table |
| `frontCoverage` | `front|coverage` | Defense | Front-coverage table |
| `situation` | `redZone`, `goalLine`, `backedUp`, `thirdLong`, `thirdShort`, `explosive`, `negative` | Offense | Situational table and takeaways |

Drive rows use an explicit play-ID membership set. Player rows match any player
role through `_watchPlayer`. Film Room Watch uses selected-intersect-visible
plays. These three routes need the same composite reference contract even though
they do not call `_buildCutFilter`.

## 6. Export And Print Inventory

| Artifact | Entrypoint | Format / scope | Filter semantics |
|---|---|---|---|
| Play breakdown | `StorageManager.exportCsv` | CSV; all active-game plays, custom fields included | Does not honor drawer filter |
| Game report | `StorageManager.exportHtmlReport` | Standalone HTML; game summary sections | Uses `compute()`, therefore active drawer filter |
| Dashboard PDF | `StatsEngine._exportStats` | Printable report/new window | Receives current computed stats |
| Scout report | `_exportScoutReport` | Standalone HTML | Current scout report selection/filter |
| Self-scout report | `_exportSelfScout` | Standalone HTML | Current self-scout selection/filter |
| Defensive report | `_exportDefensiveReport` | Standalone HTML | Current defensive selection/filter |
| Season report | `SeasonManager.exportSeasonReport` | Standalone printable HTML; aggregate season | All effective season games |
| Call sheet / wristband | `CallSheetBuilder` print flow | Browser print/PDF | Call-sheet bucket selections |
| Cut-up video | `CutupExporter.export` | WebM media | Active drawer filter over playable active-game plays |
| Depth chart | `RosterManager.exportDepthChart` | Printable browser document | Roster, independent of play filter |
| Annotated frame | `StorageManager.exportPng` | PNG at current video time | Current frame/annotations only |
| Season project | `SeasonStore.downloadFile` / Save Season | JSON backup/import artifact | Full season data; not an analytics report |

For parity testing, HTML/print artifacts should be normalized to semantic
sections and values rather than byte snapshots (timestamps and markup vary).
CSV should pin headers, row values, quoting, formula protection, and round-trip.
Call sheets should pin bucket membership/order. Cut-up tests should pin ordered
composite play references, not encoded WebM bytes. Project JSON and PNG are
outside the metric registry but remain release contracts.

## 7. P0-c Registry Requirements

The inventory requires more than `name + function`. Each dimension/measure
entry needs:

1. Stable ID and coach-facing label.
2. Canonical existing function binding; no duplicate formula.
3. Valid scopes and unit/perspective.
4. Input eligibility and denominator rules, including minimum sample gates.
5. Output type, formatter, and empty/unknown behavior.
6. Matching-play extractor returning composite references.
7. Multi-value attribution semantics for formation/play type/front/blitz/result.
8. Filter compatibility and whether explicit overrides bypass active filters.
9. Export availability and semantic serialization rules.

P0-c is incomplete unless the registry can represent all computed blocks and
drilldowns above without changing P0-a goldens. Export snapshot expansion is a
separate failing-first task after registry shape review.

### P0-c Implementation Status

`js/analytics-registry.js` now provides the pure interface and is exposed as
`window.app.analyticsRegistry`; no production report consumes it yet.

- All 29 `compute()` outputs are registered as exact block selectors.
- All minimum Study dimensions have stable IDs. Existing canonical splitters and
  classifiers are bound directly; raw/context fields name their source.
- Ready leaf measures select existing `compute()` outputs without recalculation.
- Ambiguous contracts (`fieldZone`, `scoreSituation`, `frequency`,
  `yardsPerPlay`, `conversionRate`, `scoring`, `stopRate`, and
  `dataCompleteness`) are present as `requires-context` and throw if read.
- `touchdowns` is separately ready; generic `scoring` remains unresolved until
  points-versus-touchdowns semantics are explicit.
- Cut matching delegates to `_buildCutFilter`; returned references require and
  preserve composite `gameId::playId` identity.
- `tools/e2e-analytics-registry.mjs` pins the contract, every block binding, all
  14 legacy Matrix extractors, and a representative Matrix cross-product.

P0-c is independently reviewed and accepted (`f08692b` implementation,
`3c47efc` review). Final acceptance re-ran the 23-assertion registry gate,
synthetic and real-season parity, and all 28 E2E files. `yardsPerPlay` remains
deliberately `requires-context` until the Phase 2 Study query contract defines
its cohort denominator; P0-d does not expose analytics queries.

## 8. Parity Coverage Map And Open Gates

| Surface | P0-a status | Gate before replacement |
|---|---|---|
| `compute()` blocks and embedded play arrays | Golden at game + season scope | Keep unchanged |
| Scout, self-scout, defensive self-scout objects | Golden at game + season scope | Keep unchanged |
| All 21 `_buildCutFilter` predicates | Golden matching composite play sets | Keep unchanged |
| Tendency Matrix dimensions/cells | P0-c pins all 14 extractors and one representative multi-formation cross-product | Expand combinations before Matrix refactor |
| Season progression/trends/win-loss/per-game derived views | Inputs pinned; derived outputs not directly snapshotted | Add structured snapshots before refactor |
| Matchup opponent selection and unit recasting | Not snapshotted | Add multi-opponent fixture and structured output gate |
| Opponent-history report | Not directly snapshotted | Add matched/unmatched opponent and custom-front exclusion cases |
| HTML/print, CSV, call sheet, cut-up selection | Not snapshotted by P0-a | Add semantic artifact/selection snapshots described above |

The Matrix currently uses `Med (4-6)` while `_distBucket()` and drilldowns use
`Medium`. Preserve the baseline until a failing-first test documents the intended
normalization; do not create both as separate registry values.

## 9. Source Map And Validation

- `js/stats-engine.js`: compute blocks, dashboard, reports, drilldowns, exports
- `js/season-manager.js`: season tabs, derived comparisons, season export
- `js/play-filter.js`: drawer criteria and matching semantics
- `js/play-grid.js`: Film Room filters, saved views, visible tendencies, Watch
- `js/storage.js`: CSV, HTML, PNG and season data flows
- `js/call-sheet-builder.js`: situational buckets and print output
- `js/cutup-exporter.js`: filtered WebM cut-up
- `js/roster-manager.js`: depth-chart print
- `tools/e2e-parity.mjs`: golden measure/report/drilldown baseline

Validation for P0-b is static source reconciliation. No production code or
bundle changed, so runtime tests are not required for this documentation-only
milestone. P0-a remains the executable baseline.
