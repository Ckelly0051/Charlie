# Reports > Self-Scout — desktop design comp, 2026-09-05

**Status: NOT APPROVED. Design comp only.** No production file was changed. The
Self-Scout tab, `generateSelfScout`, `generateDefensiveSelfScout`, the report
kit and the Reports CSS are all untouched. This file is the decision record and
the production-to-comp mapping; reviewing the comp means reading it.

Comp: `design-comps/reports-self-scout-2026-09-05/self-scout.html`
Fixtures: `fixtures.js` — **generated**, see section 3.
Captures: `captures/` — 147 files, see section 16.

---

## 1 · Production inventory, with exact source locations

Everything below was read from source **and** confirmed by driving the real
route against a synthetic season (`scratchpad/selfscout-probe.mjs`, read-only).
The strings in the copy table are the ones production actually rendered.

| # | Capability | Source |
|---|---|---|
| 1 | Shared export | `reports-screen.js:211 exportSelfScout` → `buildSelfScoutHtmlReport` → `window.ffaSaveBlob` |
| 2 | Offensive performance KPIs (6) | `native-report-tabs.jsx SelfScoutTab` `KpiBand`, values from `StatsEngine.compute()` |
| 3 | Top Tells | `SelfScoutTells`, data from `generateSelfScout().tells` (`_tellsFrom`, 8 dimensions, top 12) |
| 4 | Recommendations | `generateSelfScout().recommendations` (HTML strings) |
| 5 | Situational Performance | `SelfScoutSplitTable` over `report.downDistRows` (top 15 by n) |
| 6 | Call and Concept Performance | `SelfScoutSplitTable` over `callRows`, assembled in `reports-screen.js:575` |
| 7 | Negative and Explosive Plays | `SelfScoutTab` `.gi-selfscout-event-grid`, values from `performance.efficiency` / `.negativePlays` |
| 8 | By Formation | `SelfScoutSplitTable` over `report.formationRows` |
| 9 | By Personnel | `SelfScoutSplitTable` over `report.personnelRows` |
| 10 | Personnel to Formation | `SelfScoutPersonnel`, `report.personnelDiversity` filtered at `topPct >= 75` |
| 11 | Predictability score + classification | `_predictabilityIndex`, `predLabel` thresholds 70/50/30 |
| 12 | Predictability Map | `SelfScoutMatrix` over `_selfScoutMatrixView(report.matrix)` |
| 13 | Film Room Insights | `report.insights` (`_findInsights`, themed by `_themeInsights`) |
| 14 | Defensive performance KPIs (6) | `SelfScoutDefense` `KpiBand` — stop rate and yards allowed computed inline there |
| 15 | Defensive predictability | `generateDefensiveSelfScout().predictability` / `.predLabel` |
| 16 | Defensive recommendations | `.recommendations` (STRUCTURED items) formatted by `DefRecommendation` |
| 17 | Defensive Tendency Tells | `DefensiveSelfScout` table over `.tells` (`_defTellsFrom`, top 10) |
| 18 | Defensive Scheme by Situation | `DefensiveSelfScout` table over `.ddRows` (top 15 by n) |
| 19 | Film actions | `screen.watchCut(cutType, cutVal, label)` and `screen.watchRefs(refs, label)` |
| 20 | Insufficient-sample and no-data states | `SelfScoutTab` null-report branch; `SelfScoutDefense` three-way diagnostic; `_SELF_SCOUT_MIN_N = 4`; defensive gate `< 6` |

**Model vocabulary used, and not extended:** `Run` / `Pass`; `Balanced`,
`Moderate`, `Predictable`, `Very Predictable`; `Dominant`, `Effective`,
`Exploitable`; `Locked`, `Leaning`; `Front`, `Coverage`, `Blitz`; the eight tell
dimensions (`Formation × Down`, `Formation`, `Down & Dist`, `Personnel`, `Hash`,
`Backfield`, `Strength`, `Formation × Strength`); the defensive dimensions
(`Down & Dist`, `vs Front`, `vs Coverage`); the insight tags (`Hidden Weapon`,
`Motion Tell`, `Direction Tell`, `Outperformer`, `Underperformer`,
`Half-to-Half Shift`, `Struggle Spot`, `Personnel Tell`). Nothing new was coined.

---

## 2 · Source-to-comp capability mapping

| # | Capability | Comp section | Where |
|---|---|---|---|
| 1 | Export | control row | `Export report`, right of the section tabs — no second toolbar |
| 2 | Offensive KPIs | 1 Performance | six-tile band |
| 3 | Top Tells | 2 Offensive Tells | `Top tells` table |
| 4 | Recommendations | 1 Performance | `Recommendations` module |
| 5 | Situational Performance | 3 Situational | `Situational performance` |
| 6 | Call and Concept | 3 Situational | `Call and concept performance` |
| 7 | Negative and Explosive | 1 Performance | `Negative and explosive plays` — see the duplicate audit, section 6 |
| 8 | By Formation | 4 Structure | `By formation` |
| 9 | By Personnel | 4 Structure | `By personnel` |
| 10 | Personnel to Formation | 4 Structure | `Personnel to formation` |
| 11 | Predictability + classification | 5 Predictability | score, meter, classification |
| 12 | Predictability Map | 5 Predictability | `Predictability map` with a legend |
| 13 | Film Room Insights | 2 Offensive Tells | `Film room insights` |
| 14 | Defensive KPIs | 6 Defensive Self-Scout | six-tile band |
| 15 | Defensive predictability | 6 | `Predictability` module |
| 16 | Defensive recommendations | 6 | `Recommendations` module |
| 17 | Defensive Tendency Tells | 6 | `Defensive tendency tells` |
| 18 | Scheme by Situation | 6 | `Scheme by situation` |
| 19 | Film actions | every section that has one | section 9 |
| 20 | Insufficient / no-data | wherever production has one | section 8 |

**Regroupings, and why.**

1. **Recommendations moved out of the tells band into Performance.** Production
   pairs Top Tells with Recommendations. The comp puts the recommendations in
   the first section so the opening viewport carries an *answer*, not only six
   numbers, and puts the tells table with the insights, which are the same kind
   of finding at row granularity. Open decision 1.
2. **Film Room Insights moved next to Top Tells.** Production puts it at the end
   of a 4,257px page. Both are ranked findings over the same offensive cohort.
3. **Negative and Explosive kept in Performance**, where its five counts sit
   beside the rate KPIs that describe the same plays.
4. **The two tier strips are gone** (`Tendencies and predictability`,
   `Defensive self-scout`). Section tabs do that job; a strip repeating the
   active tab is the redundant heading strip the brief forbids.
5. **Nothing was dropped.** Every one of the twenty capabilities renders.

---

## 3 · Metric and denominator reconciliation

**The fixtures are not typed.** `scratchpad/selfscout-fixtures.mjs` builds ten
synthetic play sets, loads each into the running app, and captures the REAL
`generateSelfScout()`, `generateDefensiveSelfScout()` and `compute()` output.
`fixtures.js` is that output, trimmed of unrendered fields. Every share, sample
and rate therefore reconciles because the engine derived it, not because it was
made to add up.

The capture pass re-checks it anyway, over all ten states:

| Check | Result |
|---|---|
| `runPct + passPct === 100` on every split row | pass |
| `runs + passes <= n` on every split row | pass |
| `leanPct === max(runPct, passPct)` | pass |
| every tell clears the 4-play gate | pass |
| every tell clears the 70% lean gate | pass |
| matrix cell samples never exceed their row's own `n` | pass |
| defensive stop / havoc / blitz shares never exceed 100 | pass |
| every defensive tell clears the 4-play gate | pass |

Worked example, `full`: 100 charted plays = 62 offensive + 38 defensive. All 62
offensive plays classify as run or pass, so `62 classified offensive plays`.
Formation rows sum to 62 (Power-I 17, Trips 16, Empty 12, Ace 10, Bunch 7).
Power-I is 14 runs and 3 passes → 82% / 18%, lean `Run 82%`. The 38 defensive
snaps are all scheme-tagged, so the defensive scout runs; `3rd & Long` holds 17
of them with `3-3-5 65%` and `Cover 2 65%`.

---

## 4 · Football-plausibility review

The `full` fixture is an offense with a real identity rather than an arithmetic
exercise: a Power-I / 21-personnel run game that works (11.6 yds a carry,
`Dominant`), an Empty / 10-personnel third-down quick game that does not (2.7
yds, 0% success, `Exploitable`), a balanced Trips base, an Ace short-yardage
package, and a Bunch screen game. The defense is a 4-2-5 Cover 3 base with a
3-3-5 Cover 2 passing-down package and a Mike-pressure run front — a plausible
high-school 4-2-5 shell.

Every label is a value the tag libraries already produce (`Trips`, `Ace`,
`Bunch`, `Empty`, `Power-I`; `10`/`11`/`12`/`21`/`22`; `4-2-5`, `3-3-5`;
`Cover 1`, `Cover 2`, `Cover 3`; `Mike`, `Edge`). The long-label state uses
Hudl-shaped strings a coach can genuinely type (`Trips Right Wing Nasty`,
`Boot Right Y-Cross Deep Over`, `Over Front 4-2-5 Nickel`), not nonsense.

The engine's own classification is preserved end to end: a 100% run lean at 11.6
yds reads `Dominant` in green; a 100% pass lean at 2.7 yds reads `Exploitable`
in red; a 100% pass lean at 5.9 yds reads `Effective` in gold. **Predictable is
not the same as bad**, and the board never says it is.

---

## 5 · Copy-change table

Production strings are the ones the route actually rendered. Nothing here is
approved until Charlie approves the comp.

| Production | Proposed | Reason | Approval |
|---|---|---|---|
| `select a row to watch film` (Top Tells meta) | *removed* | interface narration | needed |
| `what to keep and what to break` (Recommendations meta) | `{n} findings` | conversational; scope instead | needed |
| `run/pass mix and production by down` | `{n} situations` | narration → denominator | needed |
| `charted calls and concepts` | `{n} calls and concepts` | keeps the count, drops the adjective | needed |
| `where possessions are won or lost` | `{n} classified plays` | conversational | needed |
| `what the huddle gives away` | `{n} groupings at 75% or higher` | conversational; states the eligibility gate | needed |
| `0 is balanced; 100 is one-dimensional. Weighted by the largest run/pass share in each qualified situation.` | `Weighted by the largest run/pass share in each situation of 3 or more plays.` | drops the how-to-read sentence, keeps the method and names the gate | needed |
| `Red is predictable and below your normal success; gold is predictable but working; low samples stay neutral. Select any populated cell to watch it.` | a four-key legend: `Predictable, below baseline` / `Predictable, at or above baseline` / `Balanced` / `Under 3 plays` | narration + second person + a control instruction; a legend states the encoding without explaining the control | needed |
| `formation by situation, {b}% success baseline` | `{b}% success baseline, {t}+ predictability qualifies` | adds the gate the map applies | needed |
| `{predLabel}, {n} plays` (Predictability meta) | `{n} classified plays` | the classification is already beside the score | needed |
| `Predictability: 68/100 (Predictable)` (defensive) | score, meter and classification in the shared Predictability module | one treatment for both | needed |
| `N/A` (Red Zone TD) | `No data`, at copy weight, with `no red zone snaps charted` | the board's one absence literal | needed |
| `—` (Top Front / Top Coverage) | `No data` | same | needed |
| `Negative Plays` (KPI, a **rate**) | `Negative Play Rate` | production names a rate and a count identically | needed |
| `No strong tells at the current sample size.` | `No tells at 4 or more plays.` | states the gate literally | needed |
| `No defensive scheme tells at the current sample size.` | `No defensive tells at 4 or more plays.` | same | needed |
| `No offensive self-scout yet` | `No offensive attribution` | drops `yet` | needed |
| `Tag Run/Pass or Play Type on offensive snaps to reveal your tendencies.` | `No offensive plays are classified as run or pass.` | second person + instruction + promise | needed |
| `No defensive plays are tagged yet. Chart defensive snaps to see what your fronts, coverages, and pressures reveal.` | `No defensive plays are charted.` | instruction + promise | needed |
| `{dp} defensive plays are charted, but none include Front, Coverage, or Blitz.` | `{dp} defensive plays are charted. None carries a Front, Coverage or Blitz.` | one sentence per fact | needed |
| `{sp} scheme-tagged defensive plays are available; six are needed to identify reliable tendencies.` | `{sp} of 6 scheme-tagged defensive plays required.` | literal | needed |
| `Tendencies and predictability` / `Defensive self-scout` tier strips | *removed* | section tabs replace them | needed |
| `Self-Scout` + `62 classified offensive plays` toolbar | `62 classified offensive plays · 38 defensive plays` on the control row | the tab strip already names the report; the defensive denominator was never shown | needed |
| `#` (split tables) | `Plays` | literal | needed |
| `Forms` (Personnel to Formation) | `Formations` | the abbreviation is not needed at this width | needed |
| `Read`, `Succ%`, `R Avg`, `P Avg`, `Tendency`, `Assessment`, `Lean`, `Tell`, `Stop%`, `Havoc%`, `Blitz%`, `Avg Yds`, `Top Front`, `Top Coverage`, `Distribution` | unchanged | model vocabulary or family convention | — |
| Recommendation and insight bodies | unchanged, verbatim | model output | — |

**Not changed, and why it needs a separate decision:** the recommendation and
insight bodies are second-person (`you pass 100%…`, `A DC keys pass…`). They are
produced by `StatsEngine`, not by presentation, so rewriting them is a
production change to the engine's own strings, outside a comp's scope. Open
decision 5.

---

## 6 · Duplicate-data audit

| Value | Where production shows it | Comp |
|---|---|---|
| **Explosive Rate `17.7%`** | KPI band **and** the Negative & Explosive grid — the same number twice on the same screen | **KPI band only.** The grid keeps its five counts. |
| **Classified play total `62`** | toolbar (`62 classified offensive plays`) **and** the Predictability meta (`Predictable, 62 plays`) | **Control row only.** Predictability's meta states the sample without repeating the classification. |
| **`predLabel`** | Predictability meta **and** the meter's own strong | **Once**, beside the score. |
| **Defensive predictability** | its own sentence in the defensive section header | **Once**, in the shared Predictability module treatment. |
| `Negative Plays` | KPI band as a **rate** (`1.6%`), event grid as a **count** (`2`) | **Both kept** — different measures. Renamed the KPI to `Negative Play Rate` so two different numbers no longer share one name. |
| Stop% / Havoc% | defensive KPI band (whole cohort) and per row in the tells and situation tables | **Both kept** — an aggregate and a per-situation measurement. |
| Tell rows vs recommendations | the recommendations restate the top tells in prose | **Both kept** — the engine ranks and themes them differently, and the recommendation carries the counter that the tell row does not. Open decision 2. |

---

## 7 · Section-navigation rationale

Six sections, one visible at a time:

| # | Section | Contents |
|---|---|---|
| 1 | Performance | six KPIs, Negative and explosive counts, Recommendations |
| 2 | Offensive Tells | Top tells, Film room insights |
| 3 | Situational | Situational performance, Call and concept performance |
| 4 | Structure | By formation, By personnel, Personnel to formation |
| 5 | Predictability | score and classification, Predictability map |
| 6 | Defensive Self-Scout | six KPIs, Predictability, Recommendations, Defensive tendency tells, Scheme by situation |

The proposed names were kept. They are literal, and each names the football
question its section answers rather than the widget inside it.

**Why tabs and not a scroll.** The production page measures **4,257px** at 1440
— nearly five viewports of undifferentiated modules, with the defensive report
below all of it. Defense and Special Teams already navigate by section tabs;
this is the same treatment, and it is what lets the first viewport carry KPIs
*and* the model's own recommendations.

**The control row.** Scope, six section tabs and `Export report` share one row
(`max-content | 1fr | max-content`), so the board opens on report data rather
than on two full-width bands of chrome. Below 1421 the scope line drops to its
counts to give the six tabs their width back. Tabs carry rest, hover, active
(cyan underline plus a raised control surface) and `:focus-visible`; a section
with nothing in it dims but stays reachable, because it is the one surface that
says why.

**Section counts.** Each tab carries the number of rows or findings its section
holds, so a coach can see where the report has something without opening it.

---

## 8 · Empty and insufficient-sample behavior

| Condition | Gate | Comp |
|---|---|---|
| No classifiable offensive play | `generateSelfScout()` returns `null` | every offensive section shows the ruled band `No offensive attribution` / `No offensive plays are classified as run or pass.` The defensive section still renders. |
| Offensive sample thin | tells need `n >= 4` and `leanPct >= 70` | tables render; the tells module states `4+ plays and a 70% lean required` and shows `No tells at 4 or more plays.` |
| Matrix below two rows or two columns | `_selfScoutMatrixView` returns `null` | the map is omitted; the score still renders |
| No defensive play | `defPlays === 0` | `No defensive plays are charted.` |
| Defensive plays, none attributed | `schemePlays === 0` | `{dp} defensive plays are charted. None carries a Front, Coverage or Blitz.` |
| Under six scheme-tagged plays | `plays.length < 6` | `{sp} of 6 scheme-tagged defensive plays required.` |
| A cell under three plays | `MINC = 3` | `n=2, low sample`, neutral, still clickable |
| A cell with no play | no cell | `No data`, not clickable, never `0` |
| Red Zone TD with no red-zone snap | `rz.total === 0` | `No data` at copy weight with `no red zone snaps charted` |

**A measured zero keeps its number.** `Run 0%` and `Pass 0%` render as 0 at copy
weight with no bar fill; `Penalties 0` renders as `0`. Missing data is never
converted to zero, and an absence never sorts above a real value — every sortable
column holds absences last in both directions.

---

## 9 · Film-action mapping

| Surface | Production call | Comp |
|---|---|---|
| Top tells row | `watchCut(t.cutType, t.cutVal, label)` when `cutType` exists | clickable, 12 of 12 rows |
| Situational row | `watchCut('dd', key, label)` | clickable, 8 of 8 |
| Call / concept row | `watchCut('playCallOrConcept', key, label)` | clickable, 8 of 8 |
| By formation row | `watchCut('formation', key, label)` | clickable |
| By personnel row | `watchCut('personnel', key, label)` | clickable |
| Personnel to formation row | `watchCut('personnel', personnel, label)` | clickable |
| Predictability map cell | `watchCut('comboFS', formation__situation, label)` | clickable per populated cell, 11 of 24 |
| **Defensive tendency tells row** | `watchRefs(t.refs, label)` **only when `t.refs.length`** | **not clickable** — see below |
| Scheme by situation row | no film action in production | not clickable |
| KPIs, recommendations, insights, predictability | no film action | not clickable |

**The defensive tells never carry refs on this route.** `_defScoutGroup` builds
composite `gameId::playId` refs from `play.__gid`, and `generateSelfScout()` is
called with no play override, so it reads the live tagger's plays — which are
never stamped with `__gid`. The production probe measured this directly: ten
defensive tell rows, **zero** with a film action. The comp reproduces that
honestly rather than drawing an affordance the route cannot deliver.
**Production dependency 1**, section 15.

---

## 10 · Responsive-width derivation

The board carries **no padding of its own** — the route already insets it, and
paying both costs each band half 16px (the correction the Players board needed).
The report canvas is capped at 1648px and centred.

Every table on this board is a tendency table: a label a coach reads, then small
measurements. The label column is the anchor and absorbs the slack; each
measurement column takes a fixed step under `table-layout:fixed`, so the same
measurement is the same width in every table and no sort or scope change moves a
column edge.

**Measured minimums** (the widest header or value each column actually holds,
across all ten states, plus its own cell padding):

| Step | Columns | Minimum | Driven by |
|---|---|---|---|
| `--s-n` | Plays, n | 60 | header `Plays` |
| `--s-forms` | Formations | 104 | header `Formations` |
| `--s-pct` | Succ%, Stop%, Havoc%, Blitz%, Top % | 78 | header `Havoc%` |
| `--s-avg` | Avg, R Avg, P Avg, Avg Yds | 78 | header `Avg Yds` |
| `--s-split` | Run, Pass | 104 | `Pass 100%` inside its bar |
| `--s-dim` | Type | 150 | `Formation × Strength` |
| `--s-lean` | Tendency, Lean, Read | 158 | a value with its own bar |
| `--s-verdict` | Assessment | 112 | `▼ Exploitable` |
| `--s-tell` | Tell | 84 | `Coverage` |
| `--s-scheme` | Top front, Top coverage, Top formation, Distribution | 152 | a scheme name with its share |

Because every table here is full width, the **default** steps are set roughly
1.4× the minimum so the measurement columns take the room rather than letting
the label column absorb all of it — an 880px label beside a 60px number is the
identity-to-value travel this composition exists to remove. Below 1421 the steps
fall back to the measured minimum.

At the three release widths, over all ten states and all six sections
(180 combinations), the capture pass asserts: no page-level horizontal scroll,
no clipped header, value or control label, no overlapping cell boxes, no
internal scroller engaged, no text below 9.5px, six usable section tabs, and
`Export report` visible.

**Bounded truncation.** Three cell kinds ellipsis when an imported label exceeds
what any panel can give it — the row label, the lean bar, and a scheme name —
and each carries the full value on its own `title`. The audit allows a
truncation **only** when the element ellipsises *and* the full value is
available; everything else is a clip. Ordinary football labels
(`3rd & Long`, `Trips`, `26 Blast`, `Cover 3 100%`) fit at all three widths.

---

## 11 · Typography measurements

Measured on the rendered board, not read off the declaration:

| Element | Family | Size | Transform | Tracking |
|---|---|---|---|---|
| Section navigation | IBM Plex Sans | 12px | none | 0 |
| Module heading | IBM Plex Sans | 12.5px | none | 0 |
| Table header | IBM Plex Sans | 12px | uppercase (table convention, family-wide) | 0 |
| Data cell | IBM Plex Sans | 13px | none | 0 |
| Data row height | — | 38px | — | — |
| KPI value | IBM Plex Sans Condensed | 30px | — | — |
| Recommendation / insight body | IBM Plex Sans | 13px | none | 0 |

Faces that actually load: `IBM Plex Sans 400`, `IBM Plex Sans 600`,
`IBM Plex Sans Condensed 700`, through `../../design-system/plex.css`. Asserted
every run — a comp reviewed in the host's default sans is not a review of this
design. Condensed is used only for the KPI value and the shell's own chrome,
never for navigation or a module heading. Nothing on the board renders below
9.5px.

---

## 12 · Differences from each approved Reports comp

| Comp | Shared | Different, and why |
|---|---|---|
| **Overview / Offense** (`reports-offense-2026-09-03`) | shell chrome, context bar, report head and tab strip, `.btn` | Offense scrolls one page over a 12-column rhythm; Self-Scout has no column rhythm to inherit — it is a sequence of full-width tendency tables, so it uses section tabs. Offense is still on the older `--bd-*` token set; this comp uses the current `--gi-bd-*` set, like Defense, Special Teams and Players. |
| **Defense** (`reports-defense-2026-09-03`) | the section-tab model itself, module geometry, table rhythm | Defense's five sections split one unit's report; Self-Scout's six split two (offense and defense), so section 6 carries its own KPI band. |
| **Special Teams** (`reports-special-teams-2026-09-04`) | `align-items:stretch` bands with transparent background and box-shadow rules; the single `No data` absence literal; the empty-state band | Special Teams runs a six-column rhythm from its six units; Self-Scout has no such number. Special Teams has a scope control; Self-Scout **must not** — it is season-level by construction. |
| **Players** (`reports-players-2026-09-04`) | the whole table treatment — `table-layout:fixed` with a colgroup, derived column steps, 38px rows at 13px, 12px headers, the absolute sort marker and row marker, the one-control-row layout, the capped centred canvas, plain-text counts | Players anchors on an identity and has six fixed roles; Self-Scout anchors on a situation and has a variable number of rows per dimension. Players pairs role tables two to a band; a Self-Scout split table asks for ~880px, which no band half offers at any desktop width, so its tables stack. |

Shared chrome is reproduced, not improved. Concerns recorded separately in
section 15.

---

## 13 · Rejected alternatives

1. **Keep the single scrolling page.** Rejected: 4,257px at 1440, and the
   defensive report is four viewports below the offensive one.
2. **Pair By formation with By personnel.** Rejected: each split table asks for
   ~880px; a 1440 band half offers ~686, which starves the label column.
3. **Pair Recommendations with the Negative and explosive counts.** Kept, but it
   leaves ~180px of empty panel under the shorter module at 1440. Open
   decision 3.
4. **Let each table size itself to its content (`width:auto`).** Rejected for the
   same reason the Players comp rejected it: ragged right edges that read as a
   defect.
5. **Keep production's pill treatments** for tendency and assessment. Rejected:
   no accepted Reports board uses pills. The tendency is a bar behind its own
   figure; the assessment is text plus its glyph in the family's three tones.
6. **Invent a scope control** so the report could be read per game. Rejected
   outright: Self-Scout is a season-level tendency report and the brief forbids
   it.
7. **Rewrite the recommendation and insight bodies** into third person.
   Rejected here: those strings belong to `StatsEngine`. Open decision 5.
8. **A `Formation × Situation` heat map with colour fills.** Rejected: the
   accepted boards encode state with a rule, not a wash, and a filled cell
   fights the row rhythm. The map uses a 3px underline per state plus a legend.

---

## 14 · Open decisions requiring Charlie's approval

1. **Recommendations sit in Performance, not beside Top Tells.** Production
   pairs them with the tells. The comp puts them in the opening section so the
   first viewport carries an answer. Approve, or move them to section 2.
2. **The recommendations restate the top tells.** Both are kept. Approve
   carrying both, or drop one.
3. **~180px of empty panel** under `Negative and explosive plays` at 1440, and
   ~280px under the defensive `Predictability`, because each is paired with a
   much taller Recommendations module. Approve, or approve stacking them full
   width instead.
4. **The six section names.** `Performance`, `Offensive Tells`, `Situational`,
   `Structure`, `Predictability`, `Defensive Self-Scout`.
5. **Second-person recommendation and insight bodies.** They are engine strings
   (`you pass 100%…`, `A DC keys pass…`). Leave them, or open a separate
   production copy pass on `StatsEngine`.
6. **The defensive tells render with no film action**, honestly reproducing
   production. Approve, or require production dependency 1 before this section
   ships.
7. **`Negative Plays` KPI renamed to `Negative Play Rate`** so a rate and a count
   no longer share one name.
8. **Every copy change in section 5.**
9. **Self-Scout's place in `SCOREBUG_TABS`.** It is outside the set today and
   renders the generic rail. The comp reproduces that. Approve leaving it out
   until the shared report header rolls across Reports.
10. **The `Read` column keeps `Balanced`** as plain muted text rather than a bar,
    because it is a classification, not a share.

---

## 15 · Production dependencies discovered during the comp

1. **Defensive tendency tells carry no film references on this route.**
   `generateSelfScout()` is called with no play override, so
   `generateDefensiveSelfScout` reads the live tagger's plays, which are never
   stamped with `__gid`; `StatsEngine._compositeRef` therefore returns `null`
   for every one. Measured on the real route: 10 tell rows, 0 clickable.
   Building the Self-Scout cohort the way `_selfPerspectiveCohort` already does
   for Defense, Special Teams and Players would fix it.
2. **`Scheme by situation` has no film action at all**, in any code path, even
   though every one of its rows is a real play cohort.
3. **Red Zone TD renders `N/A`**, which is not the board's absence literal.
4. **`Top Front` / `Top Coverage` render an em dash** for a missing value, same
   issue.
5. **The KPI band's `Negative Plays` is a rate and the event grid's is a count**,
   under one name.
6. **`Explosive Rate` is rendered twice** on the same screen.
7. **Self-Scout's defensive stop rate and yards allowed are computed inline in
   `SelfScoutDefense`**, not in `StatsEngine`, so the presentation layer owns a
   formula. Not touched by this comp; recorded.

None of these were repaired here. This is a comp.

---

## 16 · Validation results and capture index

Run: `node scratchpad/ss-audit.mjs` (read-only; drives the comp in Chromium).

- **0 failures, 0 console or page errors.**
- Bundled faces load: `IBM Plex Sans 400`, `IBM Plex Sans 600`,
  `IBM Plex Sans Condensed 700`.
- Typography measured on the rendered board (section 11) — all within the floor.
- 180 combinations audited (3 widths × 10 states × 6 sections): no page-level
  horizontal scroll, no clipped header/value/control label, no overlapping cell
  boxes, no internal scroller engaged, no text below 9.5px, six usable section
  tabs, `Export report` visible in every one.
- Reconciliation (section 3): every share, sample and rate reconciles.
- Sort: descending → ascending → off across 16 rows, exactly one marked header,
  identical column widths before and after, and the third click returns the
  engine's own order.
- Hover and focus change colour only — a row measured identically before and
  after. Rows, sortable headers, section tabs and buttons all report
  `cursor:pointer`; the row marker is absolutely positioned so it costs the
  label column no width.
- Film actions per section, measured on the rendered board:
  `tells 12/12`, `situational 16/16`, `structure 10/10`,
  `predictability 11 cells`, `defense 0/14` (section 9), `performance 0`.
- Approved copy asserted against the rendered markup for the three empty and
  insufficient states; six banned production strings asserted absent from the
  whole board in every state and section.
- **Mutation check on the capture comparison:** changing `--gi-row` from 38px to
  52px changed the `1440-populated-3-situational` capture's hash; restoring it
  returned the original hash exactly. The comparison can detect a real visual
  change.
- Every capture verified against its stated viewport by reading its PNG header;
  a board taller than the viewport also has a `-full` companion.

**Captures — 147 files in `captures/`.** Naming:
`{width}-{state}-{n}-{section}[-full].png`.

- **1920 × 1080, 1440 × 900, 1280 × 720** — every section of the four states
  that are meaningfully populated: `populated`, `long-labels`,
  `pred-successful`, `pred-exploitable`.
- **1440 × 900 only** — every section of the six sparse, insufficient and empty
  states: `def-insufficient`, `off-insufficient`, `sparse`, `no-offense`,
  `def-no-attribution`, `balanced`.
- Plus `1440-populated-3-situational-sorted.png`, the sorted state.

---

## 17 · Revision 2 — outcome-first self-scout

The first board made predictability the organizing idea of the entire report.
That repeated the same run/pass tendency through recommendations, tells,
situations, formations, personnel, the matrix, and defense. At the youth level,
that emphasis is backwards: execution and results are the primary coaching
read; tendency is a secondary audit.

Revision 2 gives each section one job:

1. **Summary** — six offense KPIs, the three strongest qualified call results,
   negative-play counts, and the three qualified calls to review first.
2. **Calls & Situations** — outcome tables by call/concept and down-and-distance.
3. **Structure** — outcome tables by formation and personnel, followed by the
   personnel-to-formation relationship.
4. **Defense** — defensive KPIs and results by situation. It does not repeat
   defensive predictability, recommendations, or tendency rows.
5. **Tendencies** — the only section that shows offensive tells, the
   predictability score and matrix, or defensive tells.

The shared offensive result shape is now `Plays`, `Yds / Play`, `Success`,
`Explosive`, `TD`, `Giveaways`, then `Run / Pass`. Run/pass share remains
available, but it is the last supporting column rather than the visual subject
of every table.

Generated recommendation and Film Room insight prose is intentionally absent.
Those strings restate the data, introduce speculative coaching language, and
conflict with the Reports rule that copy must be literal and concise. Existing
film actions remain on the underlying result and tendency rows.

The prior 147 captures describe revision 1 and are retained as its audit trail.
They are not approval evidence for revision 2. Revision 2 requires a fresh
visual capture pass after the information architecture is approved.

---

## 18 · Revision 3 — approved comp contract

Revision 3 applies the review batch without changing the `Calls & Situations`,
`Structure`, or `Tendencies` information architecture.

### Shared presentation rule

- Module headers contain the title only. Counts, thresholds, sample language,
  and explanatory subheads do not render beside or beneath a module title.
- KPI tiles contain the label and value only. `No data` is sufficient; there is
  no sentence explaining the absence.
- The scope line and section-navigation counts remain because they identify the
  active sample and available content rather than explaining a module.

### Offensive Summary

The section label is `Offensive Summary`. Beneath the six KPI tiles, the board
is three two-column rows at 1280px and wider:

1. `Positive Plays` | `Negative Plays`
2. `Top Calls` | `Worst Calls`
3. `Run Offense` | `Pass Offense`

Positive plays show successful plays, explosives, touchdowns, third-down
conversions, and red-zone touchdowns. Negative plays show negative plays,
turnovers, sacks, plays for loss, and penalties.

Offensive calls qualify at three plays. Ranking is success rate first, yards
per play second, then sample size. Both tables show the call/concept, plays,
yards per play, and success rate. Run and pass modules show attempts, total
rushing or passing yards, yards per attempt, success rate, explosives, and the
pass module also shows sacks.

### Defense

Beneath the six KPI tiles, Defense uses the same three-row composition:

1. `Positive Plays` | `Negative Plays`
2. `Top Calls` | `Worst Calls`
3. `Run Defense` | `Pass Defense`

A defensive call is the composite of the charted front, coverage, and pressure
on the play. Blank pressure is omitted from the displayed identity; it is not
silently relabeled `No blitz`. Calls qualify at three plays and rank by stop
rate, then lower yards allowed per play, then sample size. The displayed table
is call, plays, stop rate, and yards allowed per play.

Defensive positive plays show stops, sacks, tackles for loss, and takeaways.
Negative plays show successful plays allowed, explosives allowed, and
touchdowns allowed. Run and pass defense show attempts, yards allowed per play,
stop rate, explosives allowed, and the phase-specific impact result (TFL or
sack).

### Deferred

No fixed situational dashboard is added. The current dynamic situation and
tendency discovery views remain until the product decision between targeted
situation checks and automatic discovery is revisited.

### Revision 3 verification

Fresh populated captures were inspected at 1440x900 and 1280x720 for all five
sections. All ten fixture states and all five sections were exercised at 1280:
zero page or console errors, zero page-level horizontal overflow, zero rendered
module metadata, and no red-zone explanatory sentence. Review captures are in
the gitignored `artifacts/self-scout-codex-review/` directory.

### Revision 4 typography correction

Module titles increase from 12.5px to 14px and table-column headers use an
explicit 12px semibold Plex Sans face. Body rows, KPI values, padding, and row
height do not change. The correction improves hierarchy and scanability without
reducing report density.

### Revision 5 defensive yardage totals

`Run Defense` adds `Rushing yards allowed` and `Pass Defense` adds `Passing
yards allowed`, immediately after Attempts. The existing yards-per-play rows
remain. Rate without volume is incomplete performance reporting.
