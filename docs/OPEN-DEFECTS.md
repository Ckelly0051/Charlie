# GridIron IQ Open Defects

> **Status:** CURRENT DEFECT INDEX. Updated 2026-09-12 for the next protected
> Home workstream after the active Reports repair review.

## Coach smoke, 1.12.0-83 (2026-09-13)

Found at the board on the installed visual-smoke candidate.

**Additional CLOSED fixes — Breakdown utility alignment and watermark.** Every `Edit Library`
   action now aligns to the full charting-module edge rather than the final chip
   in its own row. The film watermark follows the actual contained video
   rectangle, including letterbox and pillarbox offsets, instead of the larger
   media container.

1. **CLOSED — Break Down bled off the left edge.** The first repair inferred
   route spacing from unrelated child padding and produced asymmetric outer
   padding that changed meaning by view. The composition now owns equal 6px
   outer gutters directly, with both values asserted at 1440 and 1920. The
   theater host keeps matching side borders so the gutter remains visible.

2. **CLOSED — `Direction vs Strength` did not answer the coaching question.** The
   module rendered one of `_playCallAnalysis`'s play-call lenses, and that
   analysis filters its source to plays carrying a `playCall`. The canonical
   season charts 0 of 449, so the module was structurally empty — while 19 of
   Week 5's offensive snaps carried both `playDir` and `strength`. It now reads
   those tags through the canonical `dirVsStrength` extractor already shared
   with the tendency pivot. Each fixed direction row now reports total snaps,
   run count and within-row run rate, pass count and within-row pass rate,
   yards per play and success. OLL's exact 10/2/2/5 cohorts and their run/pass
   splits are pinned, as is film activation for every measured row. `Calls by
   situation` keeps the two lenses the engine and the comp both have.

3. **NOT A DEFECT — five Offense modules are honestly empty.** `Play calls`,
   `Concepts`, both `Calls by situation` lenses and Identity's `Top call` all
   key on `playCall` / `playConcept`, which are filled on **0 of 449** plays
   season-wide; `Play-action` is empty on Week 5 because the season charts one
   play-action snap in total, in Week 2. These are charting-vocabulary gaps, not
   code defects: the Playbook & Calls library was never populated, so there is
   nothing for a play to snapshot. Reopen only if the coach begins charting
   calls and the modules stay empty.

4. **OPEN — `n-a (balanced)` is an engine token in coach-facing copy.** The
   fourth Direction vs Strength bucket prints the extractor's own label. The
   same label appears in the Study/tendency pivot, so renaming it in one place
   would split the two surfaces. Coach decision required.

## Home

Home is a high-priority navigation and data-accuracy surface. Current production
remains `REJECTED`; the approved 2026-08-31 Home comp remains the design
authority until a replacement composition is reviewed and approved.

1. **REPAIRED 2026-09-12 — Home has one renderer and one composition.** The
   shell no longer creates or mounts `#wsTeamHub`. Season Library now saves and
   closes the active season, then renders the no-open-season library inside the
   existing Home route. Team Hub remains only the controller/dialog owner for
   season operations, recovery, roster, film, and program settings.
2. **REPAIRED 2026-09-12 — one workspace switcher.** The shell-level `Our
   Program / Opponent Scout` control is the only rendered workspace-mode
   control. The duplicate card pair was removed from Home's library body, and
   the Home harness asserts one switch plus the absence of a Team Hub host.
3. **REPAIRED 2026-09-13 — the no-open-season library was an unacceptable
   first impression.** Home no longer repacks the generic Team Hub season row
   into small equal-width cards across the top of an otherwise empty canvas.
   It owns a readable full-width program summary and season list with identity,
   games, plays, explicit film health, restrained destructive actions, and a
   latest-season/film-health panel. The 1280px collision found during visual
   inspection is part of the containment contract. TeamHubScreen remains
   the sole service owner for open, create, delete, recovery, and film checks.
4. **Season film-health counts can be wrong outside the active season.** The
   coach observed 2025 JV as `5 of 6 games linked` in the season library while
   the opened season reports all six linked. `TeamHubScreen._verifyFilmHealth`
   peeks a non-active season's games, then calls `WorkspaceContext.filmHealth`,
   whose managed-film lookup ultimately builds
   `seasons/{backend.currentId}/films/{gameId}`. A closed season can therefore be
   checked against the active backend season, particularly when game IDs are
   reused. Repair the owner so film health is explicitly season-scoped (season
   ID plus game ID), read-only for closed seasons, and shared by every Home and
   library presentation. Always print an explicit result such as `6 of 6 games
   linked`, `5 of 6 games linked`, or `No film linked`. Add a regression fixture
   with reused game IDs in two seasons. Do not declare either observed count
   correct until the actual season-specific film sources are verified.
5. **REPAIRED 2026-09-13 — workspace switching preserves season context.**
   Switching from an open program season to Opponent Scout and back no longer
   closes the season and strands the coach in the season picker. Each side
   restores its most recently opened season using the canonical `lastOpened`
   metadata already maintained by season storage. A workspace with no seasons
   still opens its correctly filtered library. The rendered shell-button path
   is covered by the Home regression harness.

## Pre-gate review of the shared visual range — FAILED, then repaired

### Full-gate geometry failures on `2073e2e` — repaired 2026-09-12

The full gate exposed two contracts that the focused Reports review did not
exercise. Neither was waived:

- Home already rendered its repaired Program selector at 340px / 320px, but
  `e2e-home-breakdown-visual-repair` still required the compact prototype's
  180–280px / 170–220px widths. The harness now uses the canonical
  `St. Joseph Mavericks` name, asserts the production bounds, and fails on
  actual text clipping as well as overlap.
- Breakdown's 1920 three-column composition reserved up to 340px for the play
  rail and 500px for the deck, leaving a 1075.8×605.1 picture against the
  approved 1150×645 budget. The utility columns are now bounded at 280–300px
  and 440–460px so the primary film surface clears its existing budget. At
  1440, the 400px deck remains fixed; its top command row is a four-track grid
  instead of a 441px flex row, removing the 41px internal overflow without
  hiding controls or shrinking type.

An independent non-builder review of `7afa94d..44adcc6` **failed the pre-gate
checkpoint**. The range's own verification list named six green suites; it did
not run the surfaces it had changed. At `44adcc6` four Reports harnesses were
red, two of them against hash-protected approved design evidence:

| Harness | At `44adcc6` | Repaired |
|---|---|---|
| `e2e-reports-overview` | 101/7 | 109/0 |
| `e2e-reports-offense-realdata` | 28/3 | 31/0 |
| `e2e-reports-defense-realdata` | 46/4 | 58/0 |
| `e2e-reports-self-scout` | 109/1 | 110/0 |
| `e2e-reports-season` | 97/1 | 98/0 |

What was wrong, and what was done:

1. **The global palette invalidated Overview's approved rasters.** Production
   painted `20,24,28` where the approved capture has `16,24,34`, at all four
   registered viewports. New canonical evidence is
   `design-comps/reports-overview-2026-09-11/canonical`; the 2026-08 captures are
   retained untouched and named in the manifest as `supersededArtifact`.
   Palette and type only — the composition is unchanged.
2. **Two approved 14px module titles were shrunk to 12.5px** inside a
   readability pass, because `.gi-reports .gi-overview-module>header strong` tied
   with `.gi-ss-module` / `.gi-season-module` on specificity and won on source
   order. Both surface rules now carry their board class.
3. **Containment regressed.** `Top 5 Tendencies` engaged an internal scroller at
   both widths at season scope — the defect closed in `c4b1ada` — and eight
   Offense tables engaged horizontal scrollers at 1280. Row pitch re-derived to
   52px; the Offense band's cell padding pays for the type raise.
4. **Defense clipped and escaped.** `Away from Strength` was cut at 1440 and
   1280; the twelfth Down & distance row escaped its module; the full-season
   board overran the 1280 viewport by 5px. The label now wraps inside its own
   fixed 32px row, and `.gi-def-situations` carries its measured height (332px,
   322px at 1280) instead of a slack value.
5. **A charted look printed `0 snaps`.** See the Defense cohort contract below.
6. **Disabled route labels measured 2.2:1**; the Program selector clipped
   `St. Joseph Mavericks` on Home at both widths. Both repaired and both now
   asserted.

No installer, version bump, tag, push, publication, full gate, or coach-data
write occurred in this repair. `1.12.0-80` remains a historical installed
visual-scope pass and is not an accepted release; no installed build contains
these repairs.

## The Defense cohort contract — charted versus measured

`StatsEngine.defenseDashboard`'s `summarize` returns both cohorts, named:

- **`charted`** — every defensive snap in the cohort. This is the displayed
  `Snaps` count, the frequency ranking key, and every call and blitz percentage.
  `n` is its alias, because `n` is what every consumer already reads.
- **`measured`** — the run/pass-classified subset. This is the denominator for
  total, rush and pass yards, yards per play, and explosives.

With `measured === 0` every production field is `null` and renders the board's
dash. A charted look with nothing measured shows its real charted count and no
production values — never `0`. The first repair collapsed the displayed count
onto `measured`, which is how a `Trade` motion charted once with no play type
printed `0 snaps` on Week 3, and how the same artifact pushed it to the bottom of
a frequency ranking. The board and its HTML export both state the reconciliation
compactly: `40 charted · 37 with play type`. The byte-identical `classified`
alias is deleted.

## Coach direction, 2026-09-11 — finish the neutral palette

The app still read blue after the pass that was meant to neutralise it. The
reason is that the pass was half done: `--gi-2` through `--gi-8` and `--gi-11`
moved to graphite, while `--gi-1` (the app background, +9 blue), `--gi-film`
(+6) and the **entire broadcast surface family** kept their cool values —
`--gi-bd-panel` +11, `--gi-bd-control` +15, `--gi-bd-control-active` +19,
`--gi-bd-line` +22, `--gi-bd-muted` +24, `--gi-bd-bone` and `--gi-bd-draw` +27.
Every Reports board paints with that family, so the boards were the bluest
surfaces in the app.

All twenty-one near-neutral surface and ink steps are now true grey, each value
computed to hold its predecessor's relative luminance so no contrast ratio in
the app moved. Semantic hues are untouched: gold, cyan, line-of-scrimmage blue,
turnover red, health green, warning orange, the categorical chart set, and the
deliberately blue-tinted `--gi-info-*` / `--gi-accent-*` selection surfaces.

## Found by the coach at the board, 2026-09-11 — chart row registration

Two tables sharing one band did not share one grid. In Opponent Offense the
formation matrix needs two-line column labels, so its header measured 36px
against the play-type table's 28px and its body started 8px low; a wrapping look
(`Shotgun + Empty + Bunch + Trips + Unbalanced`) then grew its own row to 33px,
and the drift reached 13px by the last row. Both tables now share a 36px column
row and a 27px data row, and `e2e-reports-defense-realdata` asserts that
side-by-side modules in a band share one column-row height and one first data
row, on all six games at both widths. Containment saw none of this: nothing
clipped, nothing overflowed, nothing scrolled.

## Found by the coach at the board, 2026-09-11 — shared Reports chrome

The repair above passed 58 assertions on Defense and still shipped a band the
coach rejected on sight. Containment was measured; composition was not.

1. **The linescore band wrapped at 1280.** Score 680 + story + a 370px identity
   floor is ~1380px of demand in an 1154px bar, so the identity strip dropped to
   its own full-width row and `grid-auto-flow:column` spread Base front, Base
   coverage and Blitz rate across the entire screen, aligned to nothing above
   them. Blocks are sized to content now and the floor that forced the wrap is
   gone.
2. **The score's name track was `1fr`** and absorbed every spare pixel, leaving
   ~300px of dead space between the team name and its own Q1. Capped at 240px.
3. **Six right edges down one column** — 1262, 1280, 1266, 1248, 1247, 1235 —
   and four left edges. The Reports chrome shares the route frame's 32px inset
   now, measured on content edges rather than border boxes.
4. **The KPI rail contradicted the board underneath it.** The rail printed
   `3.3 Yards per play allowed · 132 yds, 40 snaps` above a board reading 3.4
   over 127 yards and `40 charted · 37 with play type`. `_defenseScorebug` ran
   its own `defensivePerformance` maths, and the yardage was never measured at
   all: `Math.round(ypp * total)` synthesized it from a rate times a count, under
   a comment claiming nothing there was computed. It reads
   `defenseDashboard` — the tab's only football-value owner — and blitz rate
   divides by charted Blitz plus charted No Blitz rather than every snap.

**Still not aligned, deliberately, and needing a decision.** The shell top bar
ends at 1262 and the context bar runs flush to 1280, against the Reports column's
1248. Unifying them is a shell-wide composition change affecting Home, Study and
Plan, which is beyond the scope of a review repair. The context bar's cells are
edge-to-edge by design; the top bar's 18px inset is not.

## Deferred, measured, not hidden

1. **Legacy sub-floor type on five Reports boards — DEFERRED, MEASURED, PINNED.**
   Self-Scout, Season, Players, Special Teams and Matchup carry labels below the
   12.5px floor inside their own approved fixed-height boards. Measured on the
   canonical season at 1440:

   | Board | Minimum | Below 12.5px |
   |---|---|---|
   | Self-Scout | 11px | 20 / 77 |
   | Season | 11px | 30 / 138 |
   | Players | 11px | 46 / 237 |
   | Special Teams | 9.5px | 98 / 160 |
   | Matchup | 10px | 58 / 156 |

   **Measured on the canonical season** by
   `tools/e2e-reports-typefloor-realdata.mjs`, which exists because the first
   attempt measured this in the wrong place: every board's composition harness
   runs a SYNTHETIC fixture, and `CLAUDE.md` is explicit that synthetic data
   cannot establish Reports visual parity. The first pass also recorded Special
   Teams as 11px from its own QA fixture; the canonical figure is 9.5px, the
   furthest of the five from the floor. Each board's harness now mirrors its
   canonical number as a same-fixture regression guard and says so in the
   comment rather than claiming canonical provenance it does not have.

   Before this, those harnesses asserted an obsolete 9.5px floor and stayed
   green while the binding rule said 12.5 — a green suite meaning "not worse",
   read as "meets the standard".

   Raising a board means re-deriving the row math its approved comp pins; doing
   five blind is how the last regression happened. Migrate one board at a time,
   update its pinned census entry, and delete its row from both tables.

2. **The Offense narrow-width exception — SCOPED 2026-09-12, band still open.**
   Eight five-column modules share a 379px band half at 1280 and measure
   387-418px of content at the floor, so at that width their cells keep 12px
   body and 11.5px column labels. The approved board forbids both an internal
   scroller and a resize.

   The exception was scoped to `.gi-offense-board .gi-overview-module th, td` —
   every module on the board — which put **876** of 997 elements below the floor
   at 1280 against 118 at 1440, while the documentation claimed eight tables.
   The eight modules now carry an explicit `gi-off-narrow-fit` class and the
   rule is scoped to it: 323 at 1280, and the census pins the exception's whole
   contribution as `11.5|TH: 40` and `12|TD: 165`. **Recomposing the band so
   the exception can be deleted is still open.**

3. **Down & distance still leaves 6px** at the foot of its module after the
   height was re-derived from the rendered board. Visible dead space is closed;
   the residual is within one row's rounding.
>
> This file indexes unresolved coach-observed defects and investigations. Detail
> may live in a linked audit, but an item is not closed until this index and the
> owning current-state document are updated together. Product roadmap work that
> is not a defect remains in `GRIDIRON-IQ-PLAN-V2.md`.

## Reports

1. **OLL live-data audit - REPAIRED, awaiting Codex re-review and a Charlie
   Gate.** All ten items plus one found in passing are closed in code across
   the commits beginning `d3c71e6`, with three further repairs from Codex's
   2026-09-10 review. Detail, reconciliation and mutation evidence are in
   `docs/REPORTS-OLL-LIVE-AUDIT-2026-09-10.md`; the production decision record
   is `design-comps/reports-oll-repairs-2026-09-10/RATIONALE.md`. No surface
   advanced past `REJECTED`, and no installed WebView2 smoke has been run
   against these repairs, so none of it is accepted state.

   **Codex review round 1, repaired 2026-09-10:**
   - Player return production now uses the team report's measured-return
     cohort for the COUNT as well as the yardage. `Ret` printed every return
     event beside measured yards and a measured average.
   - Defensive `Yds / play` divides by the classified run/pass cohort its own
     numerator comes from. The approved `2.9` was a value in a comp fixture,
     not an approved formula; the honest figure is `3.2`.
   - The Self-Scout HTML export prints the board's schema: `_ddPretty` labels,
     a dash in every measured cell of a held row, and a defensive KPI band
     that leads with Yards Allowed / Play and ends with Stop Rate.

   **Two questions still carried to the coach, deliberately not decided:**
   - Deleting Stop Rate outright from the Self-Scout KPI band or Overview's
     Defense & discipline module would change an approved row count. It was
     moved out of the headline position instead; both compositions keep six
     slots.
   - Four OLL plays (ids 63, 67, 76, 90 - two sacks, a pass, a run) carry no
     `unit` tag, and punt distance, hang time and return yardage are
     essentially uncharted across the season. Both are charting-workflow gaps
     raised for the coach; nothing was inferred or written back.

   **Codex review follow-up, repaired 2026-09-10:** Defensive production
   `Snaps`, Total Yds and Yds / play now use one CLASSIFIED cohort and reconcile
   arithmetically. The complete sample remains available as explicitly named
   `charted` data for call-frequency calculations and sample disclosure.
2. **Renamed HTML report does not open correctly after save.** Reproduced by the
   coach for both Defense Report and Game Report. Keeping the default filename
   works; changing it during the native save flow does not. Treat this as a
   shared export-delivery defect until investigation proves otherwise. Preserve
   the chosen path and extension; do not guess the cause from the symptom.
3. **HTML report presentation needs redesign.** The current exported report is
   not visually acceptable. This is lower-priority product work, separate from
   the renamed-file functional defect and not permission to change the approved
   in-app dashboard composition.
4. **Defense Situational Results has broken vertical rhythm.** The Down &
   Distance and Field Zone modules leave visible unused space instead of fitting
   their declared static rows cleanly. The board currently combines fixed module
   heights (`338px` and `225px`) with separately fixed header and row heights;
   their totals do not reconcile at the observed viewport. Preserve the static
   dashboard schema, but make its row, header, padding and module-height math
   explicit and exact rather than allowing data volume to resize the board.

## Breakdown

1. **Delete play - REPAIRED 2026-09-10.** `PlayTagger.deleteCurrentPlay()` read
   `id` before assigning it. It now captures `currentPlayId` before any delete
   logic. `e2e-native-breakdown-theater` exercises the rendered button through
   confirmation and proves that exactly the selected play is removed and the
   adjacent play becomes current.
2. **Reconnect notice obscures lower tagging controls.** Confirmed against a
   read-only OLL browser copy at both 1440 and 1280. The persistent notice sits
   over lower tagging content and actions. Open visual repair; do not alter its
   migration guidance until its lifecycle and owning component are identified.
3. **Breakdown reports contradictory film state.** On the same OLL render, the
   shell says `No film selected` while a persistent notice says 89 clips need
   reconnection. Open state-ownership investigation; the canonical OLL data has
   83 unique plays, 83 unique charted clip ids, and 89 playlist entries.
4. **Play-card result labels truncate.** The 1440 OLL play strip clips visible
   results including `Gain + Touchdown` and `Penalty + Loss`. Full text remains
   in accessible labels/tooltips, but the visible presentation is incomplete.
   Open visual repair against the accepted Breakdown composition.

## Closed Visual Baseline

The shared typography, wider Breakdown columns, global route navigation,
context-selector widths, graphite chrome, and neutral secondary-copy repair
passed installed visual inspection in `1.12.0-80` on 2026-09-11. The binding
contract is `docs/VISUAL-SYSTEM-RULES.md`. This closes the prior small-type and
wide-column findings only; it does not close the open Reports composition or
Breakdown film-state defects above.

## Deferred Beta Maintenance

1. **Visual regression coverage is weaker than its release language.** Current
   Chromium harnesses prove behavior, minimum font sizes and containment, but
   they do not compare populated production screens with the approved captures
   or certify installed WebView2 rendering. Add mutation-verified visual
   baselines for representative real-data screens when the beta workflow can
   absorb the maintenance cost.
2. **Shared typography-token changes need explicit cross-surface review.** A
   token edit can alter every route while a focused harness remains green.
   Until broader visual automation exists, keep presentation repairs scoped to
   the owning route where possible and inspect affected surfaces before calling
   an installer visually accepted.

## Release Impact

- `1.12.0-80` passed its named installed visual scope but is not an accepted
  release because the full gate and unrelated defect work remain open.
- Current Home and every Reports surface remain `REJECTED` in the design
  approval registry even though `1.12.0-70` remains the last accepted installed
  release snapshot.
- Do not package or promote until the active repair scope has been reviewed,
  gated at the required tier, and smoked in installed WebView2.
