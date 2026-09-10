# Reports OLL Live Audit - 2026-09-10

## Status

**REPAIRED IN CODE 2026-09-10, awaiting Codex re-review and a Charlie Gate.**
All ten items are closed below, plus one found while verifying item 1 (the
Success rate sub read a field `_efficiencyStats` never returns and printed a
constant `0 successful snaps` on every game and every season). Each commit
carries failing-first and mutation evidence in its message. The production
decision record is `design-comps/reports-oll-repairs-2026-09-10/RATIONALE.md`.

**Codex review round 1, 2026-09-10 — three defects the first pass left
standing, all repaired and mutation-verified:**

1. **Special Teams was still two cohorts on the Players board.** The first pass
   fixed the FIELD (dedicated `returnYards`, not generic `tags.yardage`) but
   left `Ret` counting every return EVENT, so Players printed 11 returns beside
   5 measured yards and a 5.0 measured average, against a team report stating
   one return. `Ret` is now `measured`. The claim in the first handback that
   the two surfaces "agree exactly" was wrong: they agreed on yardage only, and
   the cross-surface assertion checked only yardage, which is why the suite was
   green. `e2e-reports-players` now pins the count and the rendered column.
2. **The defensive `Yds / play` denominator was wrong, not merely undecided.**
   Excluding unclassified penalty rows from the numerator while dividing by
   every charted defensive row charged each excluded row as a zero-yard play
   and flattered the defense. 497/174 = 2.9 against the honest 497/154 = 3.2.
   The approved 2.9 was a value printed in a comp fixture, not an approved
   formula; carrying it as an open question preserved a broken rate. Repaired.
   `Snaps` deliberately remains the charted count — see `docs/OPEN-DEFECTS.md`.
3. **The Self-Scout HTML export violated the repaired fixed schema.** Held
   down-and-distance rows exported the raw bucket key `1|Short` with fabricated
   `0`, `0%` and `0% / 0%` values, and the defensive KPI band still led with
   Stop Rate. The export now carries the held-row dash, calls
   `StatsEngine.ddPretty`, and prints the board's KPI order.
   `e2e-reports-self-scout` section 14 asserts against the produced HTML
   string — the export is a second renderer and had no direct coverage at all.

**No surface advanced past `REJECTED` and no installed WebView2 smoke was run
against these repairs.** Nothing here is accepted state. Two questions are
carried to the coach in `docs/OPEN-DEFECTS.md` rather than decided here:
whether Stop Rate should be deleted from two approved compositions rather than
repositioned, and two charting-workflow gaps in the coach's own data.

The original findings, verbatim, follow with their disposition.

These findings came from
a read-only production capture of the canonical `2025-st-joseph-mavericks-jv`
season, Week 5 vs OL Lakes Lakers (`gmqpt95xh58z0a`, 83 charted plays). The
capture covered all 29 Our Program Reports views and produced no page or console
errors. No item below is authorization to change code or coach data. Root-cause
analysis must precede repair, and proposed fixes require coach approval.

Evidence is in `artifacts/oll-live-reports-2026-09-10/`; `manifest.json` records
the complete screen inventory. The canonical season remains read-only data
authority. The registered comp for each surface remains composition authority,
including the fixed-dashboard rule: data fills fixed slots, uses the approved
absence treatment when short, and is ranked and capped when long. Data must not
resize a dashboard.

## Investigation Ledger

1. **Overview play cohorts do not reconcile. REPAIRED.** The page reported
   `83/83` charted and the shared phase rail `30 offense / 40 defense / 13
   special teams`, while Overview reported `64 Total Plays` and `26 / 37 / 1`
   by phase. Every number was arithmetically correct and three labels were
   false. `stats.allPlays` is the CLASSIFIED cohort (`playType || runPass`) and
   was printed as `64 charted · 100%`; Snaps by phase derived Special Teams by
   subtracting offense and defense from that same classified cohort, which is
   why 13 special-teams snaps read as 1.

   Overview now reports `Total plays 83` with the sub `64 of 83 classified ·
   77%`, and Snaps by phase counts each phase from the charted cohort:
   `Offense 30 (36%) / Defense 40 (48%) / Special Teams 13 (16%)`, `83 total`.
   The charted count and phase counts ride on `stats` as non-enumerable
   `chartedPlays` / `phaseCounts` so `e2e-parity` goldens do not drift; parity
   stayed 2/2. The HTML exports carry the same correction.

   Found while verifying it: the Success rate sub read
   `stats.efficiency.successfulPlays`, a field `_efficiencyStats` never
   returns, so it printed a constant `0 successful snaps` beneath a nonzero
   rate on every game and every season. It reads `efficiency.successes` and
   OLL now shows `7 successful snaps` beneath `26.9%`.

   Four OLL plays (ids 63, 67, 76, 90 — two sacks, a pass, a run) carry no
   `unit` tag. They render correctly through the documented offense default and
   are **not** repaired here; they are raised for the coach, not inferred.
2. **Self-Scout Offensive Summary reports a zero tab count while populated.
   REPAIRED.** `ssSectionCount`'s `summary` case returned `callRows.length` —
   the ranked play-call list built from `playCall || playConcept`, neither of
   which the canonical season charts in any of its six games. The badge was
   therefore structurally `0` in both scopes, and the zero also dimmed the tab
   through `is-none`, above a section rendering populated KPIs, positive and
   negative plays, top and worst calls and the run/pass split. It counts
   `report.totalPlays`, the classified sample the summary is computed over —
   the same number the sample line beside it already stated.
3. **Approved terminology and situation labels have drifted. REPAIRED.**

   `Giveaways` is gone from every Reports surface and export:
   `ssOutcomeColumns` (Self-Scout, shared by four tables),
   `buildSelfScoutHtmlReport`'s outcome columns, Overview's Turnovers KPI sub
   (which said the same word twice) and the Season quarter table's turnover
   row (now `N gained` / `N lost`). The engine's own `isGiveaway` /
   `turnovers.giveaways` field names are unchanged, which is correct domain
   vocabulary and explicitly permitted.

   `StatsEngine._ddPretty` now owns the approved wording through
   `StatsEngine.DIST_LABELS` — `Short → 1-3`, `Medium → 4-6`, `Long → 7+`.
   Reports > Defense already showed those labels, but by patching the string at
   **three call sites**, which is why every other surface printed `1st & Long`
   while Defense printed `1st & 7+`. Those `.replace` chains are deleted. Film
   cut resolution is unaffected: cuts carry the raw `1|Long` key, never the
   display label, and every Study harness stayed green.

   `generateSelfScout().downDistRows` returned only the buckets a cohort
   happened to observe, volume-sorted and sliced to fifteen — Week 5 rendered
   eight rows in frequency order and the four situations the offense never
   faced vanished. `_selfScoutDownDistanceRows` renders the fixed twelve in
   football order. An unfaced bucket is HELD (`held: true`) and every measured
   cell shows `-`, never a fabricated `0`, `0.0` or `0%`, and a held row offers
   no film affordance.

   The `e2e-parity` golden correction was audited row by row: every
   pre-existing `downDistRows` row survives with **identical values**, every
   added row is `held`, `numbers` and all drilldowns are byte-identical, and
   the rest of `reports` differs only by the bucket relabel.
4. **Self-Scout defensive tendencies admit invalid situations. REPAIRED.** Not
   a tag-category collision: `_defTellsFrom` is dimension-agnostic and emitted
   a Front tell AND a Coverage tell for every grouping it was handed.
   `generateDefensiveSelfScout` hands it three groupings — down & distance,
   front, coverage — so within the `Maverick` front group every play carries
   the front `Maverick` and `topFrontPct` is 100 by construction. A guaranteed
   100% also scores `(100 - 50) * n`, higher than any observed tendency, so the
   tautologies crowded real tells out of the ten-slot ranked list and the
   recommendations built from it.

   The front and coverage groupings now pass a `skip` set, so each may report
   only tells from a different dimension. Blitz lean from a front or coverage
   is the cross-dimensional tendency those groupings exist for and is
   unchanged. The `e2e-parity` golden correction is **60 deletions and zero
   additions**, every deleted block a `Cover 3 -> Cover 3` tell or its
   recommendation echo; no metric, ref cohort or other value moved.
5. **Defensive yardage does not reconcile by game. REPAIRED.** The reported
   OLL gap was the small case. `summarize`'s `yards` summed EVERY defensive
   snap while `runYards` and `passYards` summed the classified run and pass
   subsets, so the three columns were never one cohort:

   | Game | Total (was) | Rush | Pass | R+P | Delta | Total (now) |
   |---|---|---|---|---|---|---|
   | Wk 1 St. Peter | -5 | 0 | 0 | 0 | **-5** | 0 |
   | Wk 2 ND Prep | 126 | 85 | 41 | 126 | 0 | 126 |
   | Wk 3 OL Refuge | 130 | 58 | 62 | 120 | **+10** | 120 |
   | Wk 4 OL Sorrows | 86 | 28 | 53 | 81 | **+5** | 81 |
   | **Wk 5 OLL** | **132** | **72** | **55** | **127** | **+5** | **127** |
   | Wk 6 Holy Family | 28 | 28 | 15 | 43 | **-15** | 43 |
   | Season | 497 | 271 | 226 | 497 | 0 | 497 |

   Week 6's components EXCEEDED its total, because five unclassified
   `Penalty + Loss` snaps (ids 29, 62, 64, 70, 71) carried -15 yards between
   them. The season reconciled only by coincidence — `-5 + 0 + 10 + 5 + 5 - 15
   = 0` — which is exactly why a green suite never caught it.

   Sacks are not involved: OLL's one sack (-5) is `isPass` and already sat in
   Pass yards. All three columns now come from the same classified run/pass
   cohort, taken as a union so a snap tagged both could never count twice. The
   approved season KPI values are unchanged.

   **OPEN FOR THE COACH.** `ypp` still divides by every defensive snap
   (`rows.length`), which is what the approved `2.9` is measured over. Moving
   that denominator to the classified count makes it `3.2`. That changes an
   approved value and was not decided here.
6. **Matchup season cohorts disagree with other Reports surfaces. REPAIRED
   (labeling).** All four numbers reconcile exactly against the canonical
   season, and **neither cohort is wrong**:

   | Reported | Predicate | Count |
   |---|---|---|
   | **201** | `(tags.unit \|\| 'offense') === 'offense'` — 183 tagged + 18 untagged | 201 |
   | **173** | the same, then `playType \|\| runPass` | 173 |
   | **174** | `tags.unit === 'defense'` | 174 |
   | **154** | the same, then `playType \|\| runPass` | 154 |

   Matchup measures what a unit LINED UP in: a formation and personnel exist on
   snaps with no play type, so excluding them would discard real opponent
   looks. Every production measure uses the classified subset, because a
   yards-per-play over an unclassified snap states nothing. The defect was that
   no surface said which one it was showing, so `201` beside `173` read as a
   contradiction.

   Every Matchup unit header now says `charted snaps`; Self-Scout's sample line
   says `classified` on both halves — it previously qualified only the
   offensive one. The four counts are pinned in
   `e2e-reports-defense-realdata` so a future change cannot quietly merge them.
7. **Matchup presents personnel as a play call. REPAIRED.** The field
   selection was never wrong. `_matchupOffenseLook` builds a COMPOSITE
   identity — `[personnel, formation, call].filter(Boolean).join(' | ')` — and
   `playCall` and `playConcept` are empty on all 449 plays of the canonical
   season, so on 32 of its 174 defensive snaps the label collapses to
   personnel alone. The column header named one component of a three-component
   composite.

   Observed labels on the season's defensive snaps: `22` (32), `Flexbone`
   (23), `11 | Flexbone` (14), `12` (13), `10 | Spread` (9).

   **Both directions carried the same error** — the offence-facing lane put
   `Front | Coverage | Pressure` under the same header. The columns are now
   `Their Top Look` and `Our Best Answer`, and the accessible film labels
   follow. No cohort, ranking or value changed.
8. **Special Teams values conflict across surfaces. REPAIRED.** Not unit scope
   and not attribution: **two surfaces read two different fields for the same
   plays.** The team report reads the dedicated ST fields; `_individualStats`
   read the generic `tags.yardage`, which CLAUDE.md already states is
   deliberately unread on an ST play.

   *Punt distance.* No play in the season carries `kickDistance`, and no play
   carries a structured `specialTeams` event (0 of 74). The team report is
   right to report none. `kickers[id].puntYds += yds` summed generic yardage
   instead: kicker 82's four punts carried `11, "", "", ""` → 11 / 4 =
   **2.8**; kicker 27's one punt carried `""` → **0.0**. Both now read
   `kickDistance` and both report `No data`, matching the team report.

   *Returns.* The team's Return Production gates on `returnYards`, and exactly
   **one** play in the season carries it (Week 6 id 24, 5 yards) — hence "1
   return for 5 yards". The player rollup fell back to generic `yardage` and
   totalled **11 returns for 43 yards**. It reads `returnYards` now. Verified
   on the canonical season: 11 returns, **1 measured for 5 yards**, agreeing
   with the team report exactly.

   A return or punt with no charted measurement still COUNTS as a return or a
   punt — it simply contributes no yards and no average. `measured` /
   `puntsMeasured` are the honest denominators; the display is `No data`, not
   a zero. A measured zero is untouched and still renders at full strength.

   **No coach tag was inferred.** Punt distance, hang time and return yardage
   are essentially uncharted on this season. That is a charting-workflow gap
   for the coach, not a data repair.

   The `e2e-parity` `numbers` correction is four added and two removed lines in
   two scopes: the synthetic fixture's punt carries a charted `kickDistance`
   of 42 that the old code ignored entirely, so `puntYds` moves `0 → 42` and
   gains `puntsMeasured: 1`. Nothing else in `numbers` moved.
9. **Stop Rate remains prominent outside the approved Defense composition.
   REPAIRED.** Complete inventory of Reports presentations:

   | Location | Position | Disposition |
   |---|---|---|
   | `native-report-tabs.jsx` Self-Scout Defense KPI band | was tile 1 | **Moved to tile 6.** `Yards Allowed / Play` leads |
   | `reports-view.js` `defenseDisciplineRows` | was row 2 | **Moved to row 6.** `Yards / play allowed` leads |
   | Self-Scout run/pass split rows | supporting | unchanged |
   | Self-Scout defensive call tables (`Stop` column) | the ranking key | unchanged |
   | Matchup defensive lanes | approved lane polarity | unchanged |
   | `html-report.js` export mirrors | follow their board | unchanged |
   | Study / `analytics-metrics` `stopRate` | underlying metric | unchanged |
   | Reports > Defense dashboard | already absent per the approved comp | unchanged |

   **Neither composition was resized** — six tiles and six rows, reordered.
   Deleting either slot outright would change an approved row count, which is
   a composition decision and was not made here.
10. **Layout integrity. VERIFIED CLEAN except one defect, now REPAIRED.**
    Every Reports view was measured live at **1440x900 and 1280x800** for page
    overflow, real internal scrollers (`overflow: auto|scroll` with actual
    overflow), band escapes, module-content escapes and cell clipping.

    Clean everywhere except one: **Season > Offense, `Tendency matrix`**. Its
    `.tm-wrap` engaged as an internal scroller (`scrollHeight 387` vs
    `clientHeight 316`) and the last row escaped the module by **60px** at both
    widths. Game-scope Offense was clean, which is exactly why a game-scoped
    harness never saw it: the rows reach 70px only on the season cohort.

    The panel does not grow. The row pitch is fixed at 54px — type unchanged,
    only the leading and surplus box height tightened — so the five approved
    rows always fit the reserved 378px panel. The module is retitled
    **`Top 5 Tendencies`**, because it renders the five most frequent row
    values and deterministically drops the rest; the cap is now named the way
    `Top 10 Plays` is. Measured after: `scrollHeight === clientHeight`, escape
    `0`, panel `378px`, at both widths.

    **The previously reported Reports-header vertical scrollbar does NOT
    reproduce** at either width: `scrollHeight === clientHeight` (52/52 at
    1440, 100/100 at 1280) and `overflow-y: visible`. No truncated names, no
    missing tabs, no clipped cells, no page-level horizontal overflow, zero
    page or console errors.

## Required Investigation Output

For each item report status (`CONFIRMED`, `PARTIAL`, `SOURCE DATA`,
`INTENTIONAL`, or `NOT REPRODUCED`), exact file/function/line ownership, source
cohort and exclusions, numerical reconciliation, root cause, proposed fix,
blast radius, required failing-first regression, coach-data implications and
confidence. Group shared causes and recommend a repair order. Stop for coach
approval before editing anything.
