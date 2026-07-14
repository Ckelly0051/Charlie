# GridIron IQ Product Redesign — Shared Claude/Codex Plan

> **Status:** Approved product direction; incremental production implementation
> is underway behind opt-in boundaries. Keep this document current whenever Claude or Codex changes
> the redesign scope, implementation status, or compatibility assumptions.
>
> **Current production baseline:** `v1.11.4` on
> `claude/football-film-analyzer-GRiCW`.

## 1. Product Direction

GridIron IQ should become a coach-owned football decision workspace built around
four jobs:

1. **Home** — know what needs attention and continue immediately.
2. **Break Down** — turn film into complete, trustworthy football data.
3. **Study** — ask questions of that data and watch the matching film.
4. **Plan** — turn findings into cutups, staff notes, teaching material, and a
   game plan.

This is an evolutionary implementation, not a destructive rewrite. The current
tagging, Film Room, storage, reports, exports, cutups, and statistics remain the
capability engine until each has a tested equal-or-better destination.

### Non-negotiable rules

- **No analytics regression.** Existing reports and metrics remain reachable
  until parity tests prove their replacement is equal or better.
- **No data migration for the visual shell.** Existing seasons and the coach's
  tagged film open unchanged.
- **No big-bang rewrite.** Land the shell first, then integrate one workspace at
  a time behind narrow adapters.
- **No feature deletion disguised as simplification.** Full charting retains
  every field; profiles control order and visibility.
- **Every analytical result stays linked to video.** A number without its plays
  is incomplete.
- **Local-first remains a product advantage.** Managed and linked film both stay
  first-class.

## 2. Visual Source Of Truth

The clean-sheet prototype is the approved design reference:

```text
ux-prototype-v2/
  index.html
  styles.css
  app.js
  assets/all22-frame.png
```

The coach-approved baseline is tagged **`design-v1`**; the final edge-polish
checkpoint is **`design-v1.1`**. Their design history and restorable milestone
commits are indexed in `ux-prototype-v2/ITERATIONS.md`. These tags are design
references only, not web or desktop release triggers.

Run it from the repository root:

```powershell
python -m http.server 4174 --directory ux-prototype-v2
```

Then open `http://127.0.0.1:4174/`.

Prototype navigation:

- Home: operational inbox, continue state, weekly work, and backup confidence.
- Break Down: full profile-driven coding panel and video-linked play strip.
- Study: composable football query plus matching film and insights.
- Plan: tendencies, teaching cutups, and staff notes.
- Keyboard: `1` Break Down, `2` Study, `3` Plan; arrows move plays.

Prototype revision 2 (Codex, 2026-07-12) incorporates coach review:

- Break Down uses a denser play strip, smaller charting chips, and tighter
  section spacing to reduce scrolling without sacrificing touch usability.
- Team Settings includes interactive Formation and Backfield libraries. Coaches
  can enable only the looks they chart, add custom values, and restore defaults.
  Hiding a value affects future charting controls only; existing play data and
  analytics must retain historical values.
- Study defaults to visual analysis rather than prose: linked KPI tiles,
  run/pass stacks, formation-effectiveness bars, game trends, and tendency
  alerts. A Matching Plays tab keeps the underlying film rows one click away.
- Production implementation must preserve all existing reports and visuals,
  then exceed them with reusable visual Study result types. Text insights may
  explain a chart but must not replace charts, comparisons, or film drilldowns.
- Browser QA is clean at 1440x900 and 390x844 with no page-level horizontal
  overflow. This remains prototype-only; no production storage or schema changed.

Prototype revision 2.2 adds unit-aware full charting:

- The production selector vocabulary is the minimum contract. Redesign may
  reorganize, progressively disclose, rename for perspective, or improve input
  controls, but must not discard chartable information.
- **No charting chip is required.** Blank tags are valid and Save & Next must
  never be blocked by a coach's chosen level of detail. A custom Formation value
  such as `Power-I` may stand alone without Under Center or Backfield. It remains
  available in formation analytics; analyses requiring blank companion fields
  honestly omit that play. Missing detail reduces analytical depth, never data
  validity. Do not silently decompose or remap staff terminology.
  **Known production blocker:** `SeasonStore.migratePlayFormation()` currently
  treats exact `Power-I` as a legacy backfield token, removes it from Formation,
  and writes `backfield:'Power'` on normalize. Before production tag libraries
  ship, scope that migration to genuinely legacy data (or persist an explicit
  migration version) so a newly created custom value is never rewritten.
- Offense / Defense / Special Teams is a prominent segmented control; Self-scout
  / Opponent scout / Quick chart remains a secondary view choice.
- Defense shows **Our Defensive Call** (front, coverage, pressure) before
  **Offense Faced** (formation, backfield, strength, personnel, motion). Offense
  retains **Defense Faced**. Fronts join formations/backfields in the editable
  tag-library settings, including custom staff terminology.
- Players & Grades is unit-aware: offensive skill/blocking roles, defensive
  tackle/TFL/takeaway/coverage roles, and special-teams specialists. Production
  parity must retain all existing player attribution and grading fields.
- Penalties are separate structured records on the play: charged team, foul,
  accepted/declined/offsetting/no-play status, yards, whether the snap counts,
  and notes. They do not replace the underlying football result.
- Special Teams begins with phase (kickoff, return, punt, field goal, XP, 2-Pt,
  onside, fake), then reveals only phase-relevant outcome, distance, hang time,
  landing spot, return, field-position, player, and penalty fields.
- Typography now uses Segoe UI Variable Text for long-session readability and
  Bahnschrift Condensed only for brand/display emphasis; both have system-safe
  fallbacks and require no prototype network dependency.
- Play-strip hierarchy treats the play number as secondary metadata; Down &
  Distance and Play Type / Result / Yardage are larger recognition targets.
  Former dead space below the strip now holds frequent film controls (Mark
  Start, Mark End, Copy Last, Clear, Delete) instead of another information
  panel. The rail preserves the strip's compact footprint and mobile overflow.
- Desktop uses a horizontal top workspace navigation instead of a permanent
  sidebar for four destinations. This returns the empty rail width to video and
  charting; mobile retains the four-item bottom navigation. Playback speed,
  loop, and camera angle live in the existing player bar, while low-frequency
  roster/history/filter/drawing/library tools remain in Settings.

### Scout perspective contract

- **Self-scout is the default and dominant workflow.** It analyzes our own
  games: Offense means our offense, Defense means our defense, and Special
  Teams means our units. Home, Break Down, and Study should return to the last
  self-scout context unless the coach intentionally opens opponent film.
- **Opponent scout means future-opponent film against a third team.** The
  selected opponent is the analysis subject: Offense means that opponent's
  offense and Defense means that opponent's defense. Their game opponent is
  context, never the analytics subject.
- Preserve the existing useful shortcut for teams already played: our defensive
  snaps describe their offense; our offensive snaps describe their defense.
  Normalize this at the query boundary without mutating stored play units.
- Every query/cohort must carry an explicit subject-team identity and scout mode;
  never infer ownership solely from `tags.unit`. Unit is subject-relative only
  after the perspective adapter resolves the game source.
- All left/right fields remain offense-perspective as documented. Scout mode
  changes ownership, not the stored directional convention.
- The UI says **Our games · Self-scout** or **Opponent film · Scout** and names
  the subject in charting headings. This prevents a silent perspective mistake.

The earlier `ux-prototype/` is retained only as design exploration. It represents
the rejected "simplified Chart + Review" direction; it is useful as the future
**Quick Chart profile**, not as the full product shell.

The prototypes are self-contained and must not be imported into production.
Recreate approved behavior with production components, data, and accessibility.

## 3. Target Product Architecture

### Application shell

Add a persistent workspace router with four top-level destinations:

```text
home | breakdown | study | plan
```

The shell owns team/season/game context and navigation. It must not own play
data, film URLs, persistence, or statistics. Those continue through
`StorageManager`, `SeasonStore`, the playlist/video stack, and `StatsEngine`.

Route state may begin in memory plus `localStorage` for last destination. Do not
change season schema merely to remember navigation.

### Home

Replace the current Season Library launch overlay with an operational home:

- Resume exact team, season, game, play, and charting profile.
- Film Inbox: ready, saving, linked, missing, repairing, or unauthorized.
- Current-week work: incomplete charting, self-scout alerts, saved plans.
- Season Library remains available from team context; it is no longer the whole
  opening experience.
- Backup target and last successful save are visible in coach language.

Home consumes read-only view models from existing storage APIs. It must not
duplicate season or film-health logic in DOM code.

### Break Down

Phase one routes Break Down to the existing production workspace unchanged.
Later phases reorganize it into:

- Persistent video and playback controls.
- A compact play strip that expands into the full Film Room table.
- A coding panel grouped into Situation, Offensive Look, Play & Result, Defense
  Faced, Players & Grades, and Details.
- Charting profiles: Offensive self-scout, Defensive self-scout, Opponent
  offense, Opponent defense, Special teams, Quick chart, and Custom.
- Profiles define field order, expansion, and shortcuts only. They never delete
  or transform stored tags.
- Unit invariants and phase-aware special-teams fields remain enforced by the
  existing tagger/store normalization rules.

Film Room remains the same underlying play editor. The compact strip and
expanded grid must share selection, filters, edits, and video-follow behavior.

### Study

Study is a new query interface over a shared analytics model, not a reduced
dashboard. It composes:

```text
dataset + dimensions + measures + filters + comparison + matching play ids
```

Minimum dimensions:

- Team, season, game, opponent, date, quarter, drive, unit.
- Down, distance, field zone, hash, score situation.
- Formation, backfield, strength, personnel, motion, play type/direction.
- Front, coverage, blitz/pressure.
- Player role, grade, special-teams phase, and custom fields.

Minimum measures:

- Plays, frequency, run/pass share, yards/play, success rate, conversion rate.
- Explosive rate, negative-play rate, turnovers, scoring, havoc/stop rate.
- EPA and every advanced metric already supported by production.
- Data completeness and sample size for the active query.

Required capabilities:

- Game/season/multi-game scopes and date ranges.
- AND across dimensions; OR within multi-selected values.
- Compare two cohorts, including game vs season and recent vs prior.
- Saved queries and reusable report views.
- Minimum-sample controls and small-sample warnings.
- Matching play IDs for Watch, Film Room, cutups, exports, and Plan.
- Custom fields become queryable dimensions without report-specific code.

### Reports compatibility

The existing dashboard remains available as **Advanced Reports** throughout the
transition. Study and Advanced Reports must use the same canonical splitters,
classifiers, scoring rules, and metric functions.

Do not reimplement formulas inside Study UI components. Introduce a metric and
dimension registry that both surfaces can call. The current `sql-catalog.js`
work is the likely persistence/query foundation, but it stays behind a feature
flag until round-trip and parity gates pass against real seasons.

### Plan

Plan stores references, not copied analytical data. A plan item contains:

```javascript
{
  id,
  type: 'tendency' | 'cutup' | 'note' | 'diagram',
  title,
  body,
  queryRef: null | savedQueryId,
  playIds: [],
  gameIds: [],
  audience: 'staff' | 'offense' | 'defense' | 'position',
  order,
  createdAt,
  updatedAt
}
```

Persist plans inside the season only after the shell and Study contracts are
stable. Until then, prototype Plan with ephemeral data. Adding the schema must
be backward compatible: missing `plans` normalizes to `[]`; old builds ignore it.

## 4. Analytics Parity Contract

Before any existing report is hidden or retired:

1. Load copies of the real six-game season and synthetic edge fixtures.
2. Run every existing production report and export.
3. Run equivalent registry/Study queries.
4. Compare totals and per-bucket values exactly, allowing only documented
   presentation rounding.
5. Confirm every Study result returns the correct matching play IDs.
6. Confirm those play IDs launch the same cutup as the old report row.
7. Exercise offense, defense, special teams, multi-value tags, custom fields,
   legacy saves, empty data, and minimum-sample behavior.

Parity fixtures must cover at least:

- Run/pass classification and multi-select play types/results.
- Formation/backfield/strength/personnel/motion splits.
- Defensive fronts, coverage, blitz, havoc, and stop percentage.
- Player attribution, shared tackles, grades, and roster labels.
- EPA, conversions, explosive plays, turnovers, scoring, and special teams.
- Season aggregation without cross-game leakage.

The release gate is **no lost metric, no changed denominator, no lost film
link**, not visual similarity.

## 5. Incremental Delivery Plan

### Phase 0 — Contracts and baselines

Split into small, independently-reviewable milestones (one coherent idea from
contract → tests each; never hand over "Phase 0" as one change):

- **P0-a — Golden analytics parity harness.** `tools/e2e-parity.mjs` captures a
  golden snapshot of the current production analytics (every `StatsEngine.
  compute()` measure block with play-arrays reduced to sorted play-ID sets, +
  the matching play IDs for every `_buildCutFilter` drilldown dimension, + the
  scout/self-scout/def-scout report objects) for the real 6-game season +
  synthetic edge fixtures. `--update` writes goldens; default diffs vs golden.
  This is the release gate: *no lost metric, no changed denominator, no lost film
  link.* When the registry/Study query lands, its output is asserted equal to
  these same snapshots. **Owner: Claude · in progress.**
- **P0-b — Report / filter / export inventory.** A written inventory of every
  production report, measure, filter, export, and video drilldown (StatsEngine
  dashboard tabs, opponent-scout, self-scout, defensive report, Big-12, call
  sheet, CSV/HTML exports, every `data-cut-*` row) — the surface the registry
  must cover and the harness must snapshot. Canonical inventory:
  `GRIDIRON-IQ-ANALYTICS-INVENTORY.md`. **Owner: Codex · reviewed/complete.**
- **P0-c — Metric + dimension registry interfaces.** The pure registry SHAPE
  (dimension: name + value-extractor + canonical-fn binding; measure: name +
  canonical-fn binding) covering the min dimensions/measures, each bound to the
  EXISTING `StatsEngine` canonical fns + `advanced-metrics` EPA. No formula
  reimplementation. **HIGHEST-RISK SHARED SURFACE** — a silent analytics
  regression would hide here; the reviewer runs parity against it adversarially.
  **Owner: Codex · reviewed/accepted/complete.**
- **P0-d — Shell + workspace-context interfaces.** Shell routes, workspace
  context, and the film-health view model — the interfaces the Home/Study
  screens are built against. Canonical contract:
  `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`. **Owner: Codex · ready for review.**

- Freeze prototype v2 as the visual reference; add analytics snapshot fixtures
  from copies of real data. Do NOT change production UI until P0-a…P0-d land.

### Phase 1 — Shell and Home

- Add the persistent shell behind `ffa_workspace_shell_v2`.
- Implement Home from existing season/library/film status APIs.
- Break Down opens the unchanged current workspace.
- Study opens existing Stats/Reports; Plan shows a controlled coming-soon state.
- Preserve an immediate **Use classic layout** escape hatch.

### Phase 2 — Study foundation

- Extract canonical dimensions and measures into a pure registry.
- Add query execution returning summary values plus matching play IDs.
- Build filters, saved views, comparisons, and Watch Results.
- Keep Advanced Reports one click away.
- Add parity harnesses before enabling by default.
- **Next increment:** add visual-first Study results over the accepted query
  output: KPI summary, ranked effectiveness bars, run/pass composition, and
  comparison deltas. Keep the exact film-linked result table and Advanced
  Reports; visuals explain the canonical numbers rather than replacing them.

### Phase 3 — Plan

- Add backward-compatible `plans: []` season data.
- Send Study insight/query results and cutups into Plan.
- Add ordering, staff notes, audience, presentation, and export.
- Preserve play references across game switches and reloads.

### Phase 4 — Break Down redesign

- Add charting-profile configuration without changing tag semantics.
  **4A foundation ready for review (`f09517d`):** per-team Formation,
  Backfield, and Front libraries support defaults, custom values, enabled/hidden
  choices, legacy custom-chip migration, and historical-value preservation.
  Modern custom `Power-I` is protected from the legacy Formation-to-Backfield
  migration. The customer-facing settings UI follows after contract acceptance.
- Recompose the existing tag form into football sections.
- Add compact play strip backed by Film Room's existing model.
- Preserve and surface video annotation tools over the film: freehand draw,
  erase, clear, undo/redo, and a compact accessible color palette. Reuse the
  existing `CanvasOverlay`/history model where possible; support mouse, pen, and
  touch. The annotation layer must align exactly with the rendered video, remain
  non-destructive, and consume or cover zero video pixels when tools are inactive.
- Add Quick Chart as a profile, not a replacement workflow.
- Migrate one unit at a time: offense, defense, then special teams.
- Copy QA DONE: `Special Teams` is capitalized consistently in the redesign
  prototype and opt-in production Study unit selector; the Study harness pins it.

### Phase 5 — Default and cleanup

- Enable the shell by default only after real-coach acceptance and full gates.
- Retain classic layout for at least one patch cycle.
- Remove duplicate navigation and obsolete presentation code only after usage and
  parity confirm there is no lost capability.

## 6. Testing And Release Gates

Every phase must run the existing full suite plus focused tests for:

- Existing season opens at the same active game/play with all tags intact.
- Shell/team/season/game switches never trigger cross-scope autosaves.
- Film Inbox accurately reflects managed, linked, missing, saving, repairing,
  and unauthorized states on browser and desktop.
- Break Down/classic transitions preserve unsaved live edits.
- Drawing strokes, erase/clear, undo/redo, resizing, fullscreen, and play/video
  changes preserve correct overlay alignment without blocking playback controls.
- Study query values and matching play sets pass parity fixtures.
- Plan references survive save/load, export/import, delete/undo, and game reorder.
- Keyboard and focus navigation remain usable.
- No horizontal page overflow at 1440×900, 1280×720, 768×1024, and 390×844.
- Tauri build, CSP, asset film playback, updater, and Documents mirror remain
  unchanged unless the phase explicitly touches them.

Use feature flags for all production redesign work. Deploy web and desktop only
after the standard build, headless suite, integrity fuzzer, Rust check, and
viewport screenshots pass.

## 7. Collaboration Protocol (agreed Claude ⇄ Codex workflow)

Before starting redesign work:

1. Read `CLAUDE.md` and this document; the clean-sheet prototype is the visual
   intent.
2. Inspect `git status`; never include `.claude/`, untracked `AGENTS.md`, or
   unrelated user work.
3. State the active phase + the exact contracts being changed.
4. Keep production edits separate from `ux-prototype*` exploration (the prototype
   is Codex's lane; the reviewer does not silently redesign the implementation).
5. **Failing-first regression coverage is a HARD gate** for any data, analytics,
   storage, or cross-game change — not optional.
6. Update this plan's `### Active Handoff` + `CLAUDE.md` after every milestone.

**One owner per milestone; builder and reviewer alternate.** Neither agent
validates its own assumptions alone. Example: Claude implements P0-a → Codex
independently reviews (runs the harness adversarially, inspects coverage gaps,
verifies the real-season baseline) → Claude addresses accepted findings → Codex
runs the final gate. Roles reverse on the next milestone. (Claude is the primary
implementer for Phase 0 since it began the harness; implementation ownership
alternates once the registry contracts are stable.)

**Commit at every baton pass.** Never pass large uncommitted work between agents —
a commit is the review boundary, rollback point, and authorship record. The
prototype, redesign plan, parity harness, and golden files are committed before
formal review. Genuinely-parallel work uses separate branches/worktrees
(`claude/redesign-phase-0`, `codex/redesign-review-phase-0`) touching separate
ownership areas — never both editing `stats-engine.js` at once.

**Review order (reviewer starts from the committed milestone, reports before
changing anything):** 1 correctness & data integrity · 2 analytics parity ·
3 backward compatibility · 4 missing tests · 5 UX behavior · 6 efficiency/cleanup.

### Handoff block template (paste into `### Active Handoff` on every baton pass)
```
Owner: <agent> | Phase: <milestone> | Status: <in progress | ready for review | changes requested>
Commit: <sha>
Completed / Files changed / Decisions made / Tests run / Known gaps / Next requested action
```

### Active Handoff
```
=== HANDOFF SNAPSHOT (keep this the first thing a fresh session reads) ===
Branch: claude/football-film-analyzer-GRiCW
Latest implementation: e6573b1 + packaging correction  v1.12.0-2 functional desktop beta (Codex)
Gate: fresh build + every tools/e2e-*.mjs harness green ATOMICALLY in one
  command — the env bumps js mtimes between build and test, so a separate build
  then gate makes e2e-parity's stale-bundle guard false-fail); parity golden
  unchanged (synthetic + real 6-game); 0 page errors.
  Historical 4A boundary f09517d was also rebuilt in isolation on 2026-07-13
  and passed all 42 harnesses present at that commit. Current tree is 45/45;
  its hardened focused review harness is 14/14.

Recent redesign commits (newest first):
  e6573b1  functional beta packaging + penalty self-review fixes
  461d0b1  P4D structured multi-foul charting, Auto D&D, Film Room, Study, reports, CSV
  994e30d  P4E-c structured Film Room, Study, and Advanced Reports integration
  42e5a00  P4E-b phase-first structured Special Teams charting UI
  ae5afc9  P4E-a adversarial review fixes; accepted after 45/45 gate
  0308486  Phase 4E-a pure Special Teams normalization, scoring, and ruleset seam
  3e9f87c  Phase 4D unit-specific player roles over existing stored keys
  e8f0abe  Phase 4C opt-in Break Down form hierarchy + perspective labels
  de62d70  Phase 4B customer-facing Team Settings tag-library editor
  f09517d  Phase 4A Formation/Backfield/Front library contract + migration guard
  6a68064  Independent review — 583ca2f comparison-cohort save ACCEPTED
  a0ece49  Remove dead addFinding/ensurePlan after picker review acceptance
  eb491bd  Independent review — fa14dc0 destination picker ACCEPTED
  583ca2f  Choose primary, comparison, or both film cohorts for Plan
  fa14dc0  Save Study findings to an explicit existing or newly named plan
  905231e  Phase 3 ordering UI + audience + teaching mode + HTML export
  2ec15fa  Pure ordered PlanExport serializer (Claude)
  70ad55c  Defensive plan-item reorder seam (Claude)
  337984d  Independent review — Phase 3 Plan foundation ACCEPTED
  bb37a1d  Plan destructive-delete confirmation + regression
  affd78f  Phase 3 Plan workspace, Study save, and cross-game Watch
  0064c1a  Resolve visual Study metric, polarity, and accessibility review
  64c284f  Phase 3 additive season-level plans:[] contract (Claude)
  a115d73  Study KPI, effectiveness, run/pass, and comparison visuals
  47cecc0  Resolve all 6 cross-game review follow-ups + prototype colon separator
  84608a9  Claude independent review — accepted with 6 non-blocking follow-ups
  1fce6b3  Study cross-game playback UI + awaitable CutupPlayer contract
  3956e14  docs — A3 re-save corruption P0 recorded
  acc130c  A3 P0 FIX — SqlCatalog re-save duplicated plays (FK cascade off) + catalog fuzzer
  42fedf7  docs — hand Codex the cross-game playback contract
  94d3ef0  cross-game cut-up PLANNER contract (js/cross-game-cutup.js, Node 13/13)
  13f3411  A3 DESKTOP SMOKE PASSED on real film (wasm loads, migration lossless)
  f7cc373  Study increment 3 — inclusive date ranges + range-vs-prior
  3056b6b  Sequencing — freeze persistence lane until desktop smoke
  fbafc29  Codex final A3 hardening acceptance
  7096b1b  A3 snapshot rollback + delete-failure toast
  be9395e  A3 fixes handoff (superseded by Codex acceptance below)
  c76972a  A3 failure-path fixes (save propagate + delete no-resurrect) + 2 regressions
  470b713  Codex A3 review — bundled Study verification
  b62405d  Codex A3 review — two failure-path changes requested
  ee6f829  A3 code-complete handoff + desktop smoke checklist (now superseded by review)
  218d490  A3 increment 2 — SqlCatalog -> TauriBackend, flag-gated + fail-safe
  d76e699  Study increment 2 — composable filters/metrics/comparisons/views
  1916fa8  docs handoff — Study UI increment one
  7f755c6  Phase 2 Study workspace (query/compare/views/Watch/Advanced Reports)
  23f8aa1  A3 increment 3 — JSON->catalog migration (Node 21/21)
  546ec9b  docs handoff — Phase 1 shell accepted
  d1121d6  Phase 1 shell design acceptance + polish (focused 14/14)
  8c5d7a6  Handoff pin for A3 increment 1
  76db0c9  A3 increment 1 — CatalogPersistence dual-write orchestrator (Node 16/16)
  012c8e1  StudyQuery.compare() — two-cohort (game-vs-season / recent-vs-prior)
  cfa959b  Phase 2 spine — Study query executor (js/study-query.js) over P0-c
  f68de8a  Phase 1 feature-flagged shell + Home (Codex impl, Claude finished)
  4a81138  review(P0-d): accept workspace-context contract
  2d6d4bb  P0-d workspace-context contract (Codex)

Lane status:
  Claude (data/analytics/persistence spine): P0-a/b/c/d DONE + accepted; Phase 1
    finished + shipped; Phase 2 Study executor + two-cohort compare DONE (the
    spine the Study UI consumes); A3 increments 1+2+3 implemented behind the flag;
    Codex's two failure-path defects and both hardening follow-ups FIXED + ACCEPTED
    (7096b1b); A3 DESKTOP SMOKE PASSED on real film (13f3411); a post-smoke catalog
    FUZZER caught + fixed a P0 re-save duplication bug (acc130c). Cross-game playback
    DATA CONTRACT done + handed to Codex (94d3ef0).
  Codex (visual shell / workspace UX): Phase 1 ACCEPTED; Phase 2 Study UI
    increments 1+2+3 DONE at 7f755c6 + d76e699 + f7cc373; true cross-game
    Study playback DONE at 1fce6b3, independently accepted at 84608a9, and all
    six review follow-ups resolved at 47cecc0. Phase 3 Plan foundation accepted;
    ordering, audience, presentation, and export accepted. Save-to-Plan now uses
    an intentional destination picker at fa14dc0, accepted at eb491bd with its
    sole dead-code nit cleaned at a0ece49. Comparison saves choose primary/
    comparison/both film explicitly at 583ca2f, accepted at 6a68064. The full
    Study-to-Plan save milestone is closed; exact composite film refs remain
    unchanged.
  Phase 4 Break Down: 4A per-team tag-library foundation implemented at
    f09517d; its previously missing exact-commit full gate is now 42/42. 4B customer-facing Team Settings
    editor implemented at de62d70. At the coach's direction, 4C continued before
    that review and landed at e8f0abe: opt-in composition over the existing live
    form, with football hierarchy and subject-aware labels but no schema or tag
    semantics change. Codex's adversarial 4C self-review found no defect and
    hardened the focused gate from 11 to 14 assertions; independent Claude
    review of the stack remains requested. 4D increment 1 landed at 3e9f87c:
    unit-relevant player controls only, with all hidden assignments preserved.
  Phase 4E Special Teams: researched contract reviewed and P4E-a implemented at
    0308486. `SpecialTeamsModel` is pure/DOM-independent, preserves future keys,
    derives subject role from six canonical units, supports signed return yards,
    keeps scoring disposition separate from scoring type, and fails closed on
    ambiguous ownership. StatsEngine reads structured scoring first and retains
    the legacy `scoreFor` fallback only when no structured score exists. Season
    normalization never auto-migrates legacy fields. Net-yard calculation
    requires an explicit touchback rule rather than inheriting the old hard-coded
    20-yard assumption. Adversarial review found and fixed seven contract bugs at
    ae5afc9: stale legacy scores overriding a structured miss, recovery fields
    overriding made-kick ownership, negative measurements becoming zero,
    malformed events counting as tagged, missing XP attempt identity, ambiguous
    points disappearing, and fake-play results being suppressed. `attemptType`
    now distinguishes FG/XP misses; unattributed points are sparse so legacy
    parity output stays byte-identical. Focused contract 19/19; fresh atomic full
    gate 45/45; both parity goldens clean. P4E-a is ACCEPTED.
  P4E-b landed at 42e5a00 behind `ffa_breakdown_form_v2`. Six coach-facing
    units write only `play.specialTeams`; the redesigned surface never writes
    `stType`, `kickOutcome`, or `scoreFor`. Unit-specific outcomes, FG/XP attempt
    identity, onside/fake modifiers, kick/return/spot values, recovery/scoring
    ownership, and specialist roles are reachable. Rare ownership uses subject-
    team labels, not Us/Them. Unit changes that would clear structured detail
    require the in-app confirmation. Legacy details are quarantined, hidden, and
    not migrated; no cleanup occurs. Break Down 29/29, contract 19/19, tagging
    27/27, season 152/152, and fresh atomic full gate 45/45.
  P4E-c landed at 994e30d. Film Room Special preset now shows structured Unit,
    Outcome, Kick, and Return summaries; editing remains in the validated phase
    form. Study adds validated unit/outcome/role/score dimensions. Advanced
    Reports compute structured punt, kickoff, return, FG, and FG-block metrics;
    mixed seasons ignore quarantined legacy details. Touchback net remains blank
    without a configured rule. Legacy-only seasons retain byte-identical compute
    output and both parity goldens remain clean. Contract 20/20, Break Down 31/31,
    analytics registry 23/23, full atomic gate 45/45. Phase 4E is code-complete.
  Phase 4D penalties landed at 461d0b1. The pure model supports multiple foul
    records, stable ids, subject/opponent/unknown ownership, accepted/declined/
    offsetting rulings, actual enforcement, play-count status, phase, player,
    notes, and an independently confirmed resulting situation. The opt-in Break
    Down form is the single editor; Auto D&D consumes only a complete confirmed
    situation and otherwise fails honestly. Film Room provides compact read-only
    summaries, Study exposes five structured dimensions with composite film
    refs, the Game/HTML report reconciles flagged plays vs foul records and
    accepted yards, and CSV round-trips both structured objects. Legacy Penalty
    Result is never inferred, promoted, removed, or cleared. Any known-bad-data
    cleanup requires coach permission plus explicit immediate confirmation.
    Focused contract 6/6, Break Down 39/39, registry 24/24, CSV 8/8, parity 2/2;
    fresh atomic full gate 46/46. Superseded by the self-review and beta gate below.
  Codex self-reviewed Phase 4D and packaged the functional beta at e6573b1. Fixed
    stale resulting-situation confirmation after enforcement edits, the missing
    foul suggestion datalist, and penalty-only CSV row loss. The beta enables
    shell + redesigned Break Down + SQL catalog once on first desktop launch;
    this is canonical persistent charting, not a disposable test store. SQL
    close/reopen pins penalties and resultingSituation over synthetic and real
    6-game data. Rust check and fresh atomic full gate 47/47. The release is a
    GitHub prerelease; stable updater clients remain on v1.11.4. Coach is the
    sole remaining reviewer/smoke tester.

NEXT ACTIONS
  R5: COMPLETE after the 2026-07-13 real-desktop managed + linked smoke.
  R1/R2 durable clip identity: ACCEPTED at 668ebda.
  Save-to-Plan destination picker fa14dc0: ACCEPTED at eb491bd; dead implicit
    path removed at a0ece49.
  Comparison-cohort selection 583ca2f: ACCEPTED at 6a68064. Study-to-Plan save
    milestone COMPLETE.
  Claude: independently review f09517d + de62d70 + e8f0abe as the Phase 4A/4B/4C stack,
    focusing on legacy migration, team isolation/switch freshness, hidden and
    historical values across tag form + Film Room, custom Front semantics,
    Power-I preservation, editor focus/keyboard behavior, flag-off purity,
    perspective synchronization, complete field reachability, and mobile overflow.
  Coach next: install v1.12.0-2 and run the real-film smoke. Re-tagged data
    is intended to be permanent. Verify reopen, game switching, backup creation,
    one restore on a copy/checkpoint, managed and linked playback, penalty and
    Special Teams charting, Study film links, and Plan export. Report product
    findings directly; no additional agent review is required.
  Special Teams redesign is now specified in GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md
    as Phase 4E. The current `scoreFor` Us/Them workflow is rejected for new
    charting. Use a phase-first, subject-role contract, derive scoring from the
    event, and make ruleset-sensitive calculations fail honestly.
    Phase 4E stack 0308486..994e30d is ready for Claude's comprehensive review.
    Beta critical path: package complete; coach smoke is the remaining gate.
    No legacy Special Teams or penalty cleanup without explicit confirmation.
  Claude in-lane options, none started:
    (a) GHOST PLAYS — investigated 2026-07-12 (code read, not yet fixed). The coach
        thinks it was his own dup-named clips; partly true, but the code read found
        a REAL defended-nowhere gap, so this is NOT purely user error. Findings:
        - TWO folder paths with very different safety:
          * Repair Film (storage.js repairFilm -> _planClipRepair ->
            repairWithMatches) is SAFE: never creates/deletes plays, matches in 3
            tiers (exact path -> name -> FOLDER ORDER), and if it can't match EVERY
            play it makes ZERO changes and bails. Its order tier even rescues
            renamed files when counts match.
          * Add Clips / re-add a folder (playlist-manager.js addFiles ->
            _relinkSavedPlays -> _autoCreatePlays) is the GHOST FACTORY: exact-path
            + basename passes but NO order fallback, and any fresh clip that fails
            to relink gets a brand-new whole-clip play auto-created -> orphans the
            original tagged play + leaves a 2nd untagged play on the same video
            (the v1.10.7 "139-for-69" class).
        - WINDOWS `(n)` RENAME POLICY IS DEFENDED NOWHERE. Every identity fn
          (_fileIdentity/_playIdentity/_clipIdentity/_displayName/_planClipRepair/
          _relinkSavedPlays/rehydrateFromDisk) keys on path/name ext-stripped only;
          nothing strips a trailing ` (1)`/` (2)`. So (i) a re-added `Play 12 (1).mp4`
          misses BOTH passes vs saved `Play 12` -> ghost; (ii) genuinely dup-named
          SAVED plays are unrelinkable past the first (Pass-1 keeps first per key)
          -> ghost. Both the coach's dup-name theory AND Windows rename funnel here.
        - FIX DIRECTION (fold into the rebuild, don't band-aid): add a
          `(n)`-NORMALIZED fallback tier (strip trailing ` (\d+)` for MATCHING only),
          BELOW exact path/basename, consume-once so real distinct (1)/(2) files
          don't collapse; give addFiles the same count-based ORDER fallback the
          repair planner has (or route re-adds through the safe planner); and the
          real cure — with SQLite's authoritative `clip_id`, relink keys off a
          durable id, not a filename guess.

  FILE-SYSTEM REBUILD REQUIREMENTS (make the coach's "the fix is in the build"
  assumption actually hold — these are REQUIRED, not optional, for the A3/catalog
  file-system work and anything that builds on it):
    R1. CLIP IDENTITY IS AUTHORITATIVE. Every clip gets a stable `clip_id` owned by
        the catalog (the `clips` table already has it). A play references its clip
        by that id, not by a filename.
        CODE COMPLETE — AWAITING INDEPENDENT REVIEW (2026-07-13, Codex): schema
        v2 adds `clips.clip_id` + `plays.catalog_clip_id`; JS carries the durable
        value as `catalogClipId` while numeric `clipId` remains the transient live
        playlist handle. Legacy refs receive deterministic IDs, clip-less games
        synthesize rows from plays, duplicate imported IDs repair without orphans,
        and normalized rows reattach identity on load. Catalog flag stays OFF.
    R2. RELINK CONSUMES THE DURABLE IDENTITY. Rewire relink/repair/rehydrate to
        match on `clip_id` from the store first, falling back to filename heuristics
        only for legacy rows with no id. This is what folds the ghost-plays fix into
        the build instead of leaving it a follow-up patch.
        CODE COMPLETE — AWAITING INDEPENDENT REVIEW (2026-07-13, Codex): managed
        and linked disk enumeration annotates files from saved clipRefs;
        `planClipMatch` consumes `catalogClipId` first, then falls through unchanged
        to path/base/Windows/order matching. New add, rehydrate, and repair paths
        create or propagate durable IDs without changing tags or play IDs. Full
        e2e suite green; focused gates: SQL 16/16, catalog 44/44 + 640-op fuzzer,
        matcher 15/15, linked rehydrate 8/8, real 451-play fixture clean.
        FALLBACK LIVE + INDEPENDENTLY ACCEPTED (`713324e`, review `135c43e`):
        `js/clip-identity.js` now drives PlaylistManager add/re-add — tiered match
        (exact path → basename → `(n)`-normalized → wholesale-rename order,
        consume-once) returning `unmatchedClips` (= what would ghost). Order is
        deliberately allowed only when NO stronger match exists; after a partial
        exact match, unrelated leftovers stay unmatched for coach confirmation.
        `tools/e2e-clip-match.mjs` 15/15 pins this policy, including catalog-first
        precedence. The R1/R2 cutover above now consumes it.
    R3. WINDOWS `(n)` NORMALIZATION. The filename-fallback tiers must strip a
        trailing ` (\d+)` for MATCHING only (never mutate stored names), consume-once,
        below exact path/basename — so a re-added `Play 12 (1).mp4` relinks to saved
        `Play 12`, while genuinely distinct `(1)`/`(2)` clips stay distinct.
        (Implemented + tested in `js/clip-identity.js` per R2 groundwork above.)
    R4. ADD/RE-ADD IS AS SAFE AS REPAIR. Give addFiles the count-based order fallback
        the repair planner has (or route re-adds through it), and never silently
        auto-create a ghost play for an unmatched clip when orphaned tagged plays
        exist — hold/confirm instead.
        IMPLEMENTED + INDEPENDENTLY ACCEPTED (`713324e`, review `135c43e`):
        addFiles plans before mutating any clip/play/file. Ambiguous selections
        offer `Use matched only`, explicit `Add unmatched as new plays`, or
        `Cancel`. Matched-only copies only matched files; Cancel leaves serialized
        plays and persistence untouched. Multiple marked plays sharing one stale
        clip id follow the relinked primary. Failing-first
        `tools/e2e-relink-legacy.mjs` now passes 7/7.
    R5. ★ RE-CHECK FILE REPAIR BEFORE BUILDING ON IT. Before committing any work that
        depends on the new file system, RE-VERIFY repair + re-add end to end for BOTH
        single files AND folders, explicitly covering: Windows `(n)`-renamed copies,
        duplicate basenames across subfolders, genuinely dup-named clips, managed vs
        linked, and reopen-after-repair. Reproduce-first, assert NO ghost/orphan
        plays and tags preserved. Do not build on repair until this passes.
        COMPLETE (2026-07-13): the automated portion covers `(n)` copies,
        wholesale rename/order, partial-match confirmation, cancellation,
        duplicate basenames across subfolders, managed persistence, linked-folder
        rehydrate (including linked `(n)` rename + every marked region sharing a
        stale clip id + managed-to-linked playlist replacement), reopen relink,
        and the cross-game add race. Codex then led the real Tauri smoke with a
        disposable seven-play season: managed single file, managed three-clip
        folder, and linked three-clip folder all created the expected plays,
        played, retained sentinel tags, and survived close/relaunch. Duplicate
        basenames in distinct subfolders remained distinct; repeated linked-game
        loads stayed at three clips. The real six-game season remained read-only.
        A stale immediate `0 clips` label on linked creation was found and fixed by
        refreshing playlist indicator/count in `_autoCreatePlays`, regression-
        pinned in `e2e-clip-identity`. Focused film gates plus real-season integrity,
        onboarding, and Film Room are green with zero page errors. Independent
        review had already accepted `713324e` + `e08ea6a` (`135c43e`).
    (b) after a RELEASE CYCLE of flag-on real use: drop the JSON dual-write to
        single-write `.db`, then the dedicated library-root move + catalog
        backup-ring / version-history migrations. The A3 smoke only exercised a
        SINGLE save per season, so the release-cycle validation MUST edit/re-save
        a season (the class the catalog fuzzer now guards), not just open it.
  Coach: whenever ready, run flag-on real use for a cycle (edit/re-save seasons,
    not just open) to validate the catalog in daily use before the dual-write drop.

A3 — SqlCatalog canonical cutover (task #54): IMPLEMENTED + CODE-REVIEW ACCEPTED
+ DESKTOP SMOKE PASSED on real film (2026-07-12). Flag OFF by default.

POST-SMOKE P0 FIX (acc130c): a new CatalogPersistence FUZZER
(`tools/e2e-catalog-fuzzer.mjs`, random save/load/delete/migrate + disk faults)
caught a data-corruption bug the single-save smoke MISSED — EVERY re-save of a
season duplicated its play rows (2→4→6…; a coach's autosaves would multiply their
plays on disk). Root cause: `db.export()` (the dual-write) resets sql.js's
`PRAGMA foreign_keys` OFF, so saveSeason/deleteSeason's cascade-reliant DELETEs
orphaned plays/clips, which re-attached on the next save. Fix: explicit deepest-
first child deletes (plays→clips→games→season), pragma-independent. Fuzzer 640 ops
clean, e2e-catalog-persistence 36/36 (re-save no-dup regression), full gate 36/36.
LESSON: the smoke only exercised a single save per season — MUST re-save/edit a
season during the release-cycle validation, not just open it.

DESKTOP SMOKE — PASSED (Claude drove a from-source `cargo tauri dev` build via
computer use, F12 console, on the coach's real machine + real season):
- Baseline flag-OFF: real seasons load normally.
- Flag-ON, `_ensureCatalog()` reported
  `{backend:"tauri", flag:true, engineFailed:false, catalogLoaded:true, hasSQL:true}`
  — the sql.js WASM LOADED in WebView2 (the CSP `'wasm-unsafe-eval'` + `$RESOURCE`
  asset scope + resource resolution all work). NO "SQL engine load failed" /
  "Catalog init failed" warnings; console otherwise clean.
- `%APPDATA%\com.gridironiq.app\seasons\library.db` created (532 KB).
- Migration LOSSLESS on real film: the real season loads from the canonical db —
  `{name:"2025 St. Joseph Mavericks - JV", source:"db", games:6, plays:451}`
  (matches the JSON exactly).
- Write path (throwaway season, real data untouched):
  `{saved:true, loadSource:"db", loadPlays:1, deleted:true, goneAfterDelete:true}`
  — save→load-from-db→durable delete→no resurrection.
- Flag-OFF restore: removed the flag, reloaded, the real 6-game/451-play season
  still loads (dual-write JSON intact). App left in the default flag-OFF state.

UNBLOCKED by the pass: the frozen persistence lane may thaw. Remaining before
dropping the JSON dual-write to single-write `.db`: run flag-ON on real film for a
release cycle (the smoke proves the path; a cycle proves durability in daily use).

#### A3 Codex Review — FINAL ACCEPTANCE (`7096b1b`)

Both defects and both hardening follow-ups were fixed reproduce-first with
failing-first regressions. Codex independently inspected `7096b1b` and reran
catalog persistence 29/29, flag-ON backend delegation 5/5, and both parity
goldens; Claude's complete gate remains 34/34 with zero failures.
1. FIXED — `TauriBackend.saveSeason()` now propagates `CatalogPersistence
   .saveSeason()`'s boolean (metadata still advances to match the json safety copy,
   but the canonical db result surfaces so SeasonStore's persist warning fires).
   Regression: `tools/e2e-catalog-backend.mjs` (puppeteer, fake `__TAURI__` + injected
   catalog) asserts a `false` is not reported as success.
2. FIXED — `CatalogPersistence.deleteSeason()` returns durable true/false and, on a
   writeDb failure, closes + reopens the catalog from the unchanged on-disk bytes
   (memory re-synced, no split-brain); `TauriBackend.deleteSeason()` RETAINS the
   season.json / mirror / library entry unless the canonical delete is durable.
   Regressions: `e2e-catalog-persistence.mjs` (26/26: failure returns false, memory
   restored, json retained, retry deletes durably) + `e2e-catalog-backend.mjs`
   (failed delete retains files + library entry; durable delete removes them).
Verdict: FINAL ACCEPT. No A3 code or test work remains before desktop smoke.

Nonblocking hardening follow-ups — BOTH DONE (`7096b1b`):
- DONE — Snapshot rollback. `CatalogPersistence.deleteSeason` snapshots the
  pre-delete db bytes and restores memory from that RAM snapshot on a writeDb
  failure (no longer re-reads a possibly-failing disk, which used to blank the
  whole in-memory catalog). Regression `e2e-catalog-persistence` 29/29: writeDb
  AND readDb both fail → returns false, both seasons remain in memory, disk intact.
- DONE — Delete-failure toast. `deleteSeason` returns a durable boolean through
  StorageBackend/Browser/Tauri → SeasonStore (tears down the editor only on
  success) → StorageManager (toasts "kept safe, try again" + returns false on a
  retained failed delete). Regression `e2e-catalog-backend` 5/5 pins the
  false/true return with the file-retention behavior.

<details><summary>Original CHANGES REQUESTED (for the record)</summary>

1. **Canonical save failure is reported as success.**
   `CatalogPersistence.saveSeason()` (`js/catalog-persistence.js`, method at
   line ~61) deliberately returns `false` when `writeDb()` fails, even though it
   still writes `season.json`; its documented contract says the canonical
   failure must surface. `TauriBackend.saveSeason()` (`js/storage-backend.js`,
   line ~591) currently awaits that boolean but discards it, calls `_touchMeta`,
   and returns `true`. This suppresses SeasonStore's persist warning and falsely
   tells callers the canonical catalog save succeeded. Preserve/return the
   boolean (and decide explicitly whether metadata should advance on `false`).
   Required failing-first regression: mock a catalog whose `saveSeason()`
   returns `false`; assert TauriBackend does not report canonical success while
   the JSON safety copy remains intact.
2. **A failed catalog delete can resurrect a deleted season.**
   `CatalogPersistence.deleteSeason()` (`js/catalog-persistence.js`, line ~102)
   mutates the in-memory catalog, swallows a `writeDb()` failure, and returns no
   status. `TauriBackend.deleteSeason()` (`js/storage-backend.js`, line ~551)
   then deletes the season JSON + Documents mirror regardless. If the DB write
   failed, the on-disk canonical `library.db` still contains the season while
   its safety copies are gone; reopening can make the deleted season reappear.
   Make delete return a durable success/failure result, restore/reopen the
   in-memory catalog on DB-write failure, and do not remove JSON/mirror until the
   canonical delete is durable. Required failing-first regression: force
   `writeDb()` to fail during delete; assert the operation reports failure, the
   JSON copy remains, and reopening the catalog does not produce a split-brain
   deleted-in-memory/present-on-disk state.

Both are flag-ON failure paths, so the existing flag-OFF 33/33 gate cannot catch
them. The desktop smoke checklist remains valid only after these tests pass.
</details>

- Increment 1 (76db0c9): `CatalogPersistence` dual-write orchestrator — db
  canonical + season.json/mirror dual-write + self-healing json fallback (Node 16).
- Increment 3 (23f8aa1): `migrateJsonSeasons(ids)` imports existing per-season
  season.json into the shared db on first flag-on — idempotent, never throws (21).
- Increment 2 (218d490): TauriBackend.load/save/deleteSeason delegate to
  CatalogPersistence behind `ffa_sql_catalog` (default OFF). FAIL-SAFE: any wasm/
  runtime failure silently keeps the existing JSON path (flag OFF = byte-identical
  to today). Vendored `src-tauri/resources/sql-wasm.{js,wasm}`; tauri.conf
  resources + `$RESOURCE/**` asset scope + CSP `'wasm-unsafe-eval'`; capabilities
  `$RESOURCE/**`; build.sh adds sql-catalog + catalog-persistence (browser bundle
  stays sql.js-FREE — wasm is a desktop-only lazy-loaded resource; bundle 1.5M
  unchanged). Full gate 33/33 with the flag OFF; real six-game parity unchanged.

COACH DESKTOP SMOKE (on a Tauri build, F12 devtools open):
1. Default (flag OFF): existing seasons + film load normally.
2. Enable: console `localStorage.setItem('ffa_sql_catalog','1')`, reload. Watch
   for NO "SQL engine load failed" / "Catalog init failed" warning (a warning =
   it fell back to JSON; report the exact text).
3. Open each season once (triggers json->library.db migration). Confirm
   `%APPDATA%\com.gridironiq.app\seasons\library.db` now exists.
4. Tag a play, let it autosave, quit + reopen: the tag persisted and film resolves
   (db canonical, json is the mirror).
5. New game/season, finish, reopen — round-trips. Delete a season — stays deleted
   after reopen (dropped from the db too).
6. Turn OFF (`removeItem('ffa_sql_catalog')`, reload): the dual-written season.json
   is still authoritative — nothing lost either direction.
If clean on real film for a release cycle, drop the JSON dual-write (single-write .db).

- `js/catalog-persistence.js` (`CatalogPersistence`) is the pure dual-write
  orchestrator that makes the SQLite catalog CANONICAL with JSON as a self-healing
  fallback. ALL fs access is INJECTED, so the whole risky canonical-write path is
  Node-tested (`tools/e2e-catalog-persistence.mjs`, 16/16) with a fake fs + real
  sql.js — the desktop glue (real fs adapter + wasm load) is the only untested
  seam left, per the reproduce/verify discipline (don't ship an unverifiable
  canonical path).
- Model: one library-wide catalog db (the plan's `seasons/library.db`) held open;
  every save upserts the season + re-exports the db bytes AND dual-writes the
  per-season `season.json` + best-effort Documents mirror. Load prefers db → json;
  a missing/corrupt db falls back to json and RE-MIGRATES it into the db so the
  next load is canonical (self-healing, reversible). A load never throws; a
  db-write failure surfaces false yet still leaves the json safety net.
- Proven: lossless db round-trip across a reopen (== a plain SqlCatalog
  round-trip); two seasons isolated in one db (no cross-season bleed); missing-db
  fallback + self-heal; corrupt-db degrade-without-throw; best-effort mirror;
  db-write-failure keeps the json; delete removes the season. Full gate 32/32;
  browser bundle unchanged (module is Node-only, excluded from build.sh like
  sql-catalog.js).

Tag pushes still pending for the coach (agent can't push tags): none new this
  phase — Phase 1 + Study are flag-gated, no release/version bump, no tag needed.
========================================================================

Owner: Codex | Phase: 1 shell+Home | Status: ACCEPTED / COMPLETE

Phase 1 final design acceptance (d1121d6):
- Responsive QA at 1440x900, 1280x800, 768x1024, and 390x844 found a clear,
  work-focused hierarchy with no clipping, overlap, or page-level horizontal
  overflow. The classic workspace remains intact under Break Down and Study.
- Fixed all three logged nits: empty film no longer repeats its label; the
  current season uses live game/play totals with correct singular/plural copy;
  classic mobile tabs are hidden on shell-owned Home/Plan but remain available
  in Break Down/Study.
- Fixed one additional visual-trust defect found during screenshot review:
  "No film added" now uses a neutral health dot instead of ready-green.
- `tools/e2e-workspace-shell.mjs` is 14/14 and can optionally capture the four
  review viewports with `FFA_SHELL_SCREENSHOTS=<dir>`.
- Fresh bundle built; focused workspace/parity/analytics/Study/catalog gates
  green; complete current suite 32/32 green, including the real six-game fixture
  and zero page errors. No release/tag: shell remains opt-in and customer-facing
  classic behavior is unchanged.

Phase 1 (commit adds shell; classic remains the default):
- Codex implemented the feature-flagged shell (`ffa_workspace_shell_v2`, opt-in;
  classic is the default) + Home, hit the usage limit during visual QA, and left
  it uncommitted locally. Codex had already fixed a first-run null-season bug and
  the Study-overlay containment inside the shell.
- Claude picked up the uncommitted work (per coach), VERIFIED it, and completed
  the pending mechanical steps: fresh `build.sh`, focused shell gate 10/10, full
  regression 30/30, five viewport screenshots (Home/Break Down/Study/Plan desktop
  + Home mobile) with ZERO page errors, then committed + pushed. No code changes
  to Codex's shell — the deliverable was already correct.
- `js/workspace-shell.js` mounts a `#workspaceShell` that RELOCATES the intact
  `#app` into `#wsClassicOutlet` (never rebuilds it); routes are pure adapters:
  Break Down shows the classic workspace; Phase 1 originally routed Study to
  Advanced Reports; Plan is a
  controlled coming-soon, Home renders live season/game context + a film inbox
  driven by `workspace.filmHealth`. "Use classic layout" clears the flag.
- XSS: game/season names + ids escaped at every `innerHTML` sink; film-row detail
  uses `textContent`. Stale-async guarded by `_homeToken`.

Claude verification (finish-and-ship, NOT a design review — that's Codex's):
- Build wiring VERIFIED: `workspace-shell.js` in build.sh JS list + app.js import
  + ctor + `init()`; `workspace-shell.css` in build.sh + index.html; bundle
  contains the class + selectors.
- Focused shell 10/10; full gate 30/30 (incl. P0-a parity, integrity fuzzer,
  registry, workspace-context); 0 page errors on every route + mobile.
- Screenshots (scratchpad shell-*.png): Home on-brand; Break Down hosts the
  unchanged tag form/film-room/video; Study dashboard inset correctly (no sidebar
  overlap — the containment fix holds); mobile compact header, sidebar hidden, no
  horizontal overflow.

Phase 1 design review and logged polish are complete at `d1121d6`; see the
acceptance block above. The first Phase 2 Study increment is recorded next.

Phase 2 Study UI — increment 1 (`7f755c6`, complete):
- Added `js/study-screen.js` + `css/study-screen.css`, the first production
  consumer of the accepted AnalyticsRegistry → StudyQuery → compare spine.
- Supports current-game/full-season scope, unit filtering, minimum-sample
  warnings, 15 high-use football dimensions, canonical measures, game-vs-season
  comparison, local reusable saved views, and film-linked Watch actions.
- Advanced Reports remains one click away. The route contract now truthfully
  targets `study-workspace`, with Advanced Reports documented as the fallback.
- Season Watch intentionally opens one owning game at a time and explains when
  results span games; today's CutupPlayer cannot play through game boundaries.
- The UI suppresses zero-play canonical-cut rows and counts unique composite
  matching refs; the parity-locked query engine itself is unchanged.
- Responsive desktop/mobile QA is clean. Study UI 10/10, shell 15/15, query
  24/24, registry 23/23, synthetic + real six-game parity clean, and the full
  suite 33/33 with zero page errors.
- Remaining after increment 1: addressed by `d76e699` below except date-range
  cohorts and true cross-game playback. Shell stays opt-in; no release/tag.

Phase 2 Study UI — increment 2 (`d76e699`, complete):
- Added composable filter rows sourced directly from ready registry dimensions:
  OR across selected values inside a row, AND across rows, removable value chips,
  and intentional clear/remove controls.
- Expanded the breakdown selector to 23 ready dimensions, including player role,
  grade, special-teams phase, custom tags, and custom fields. Added selectable
  canonical measures plus game-vs-prior-games comparison.
- Saved views now preserve filters, metric, scope, unit, sample threshold, and
  comparison; old boolean comparison saves remain backward-compatible; selected
  views can be deleted.
- Comparison mode disables the irrelevant scope control and labels Watch as the
  current-game cohort. Cross-game playback remains intentionally one game at a
  time.
- Modular-source and committed-bundle browser gates both 17/17, zero errors;
  responsive desktop filter UI and 390x844 mobile QA clean. `218d490` rebuilt
  the bundle after `d76e699`. No release/tag; shell stays opt-in.

Phase 2 Study UI — increment 3 (`f7cc373`, complete):
- Added inclusive custom date-range scope over game metadata. Only games with an
  explicit `YYYY-MM-DD` date enter a range; undated games remain available in
  full-season scope and are never silently assigned a date.
- Added `Date range vs prior`: selected dated games form cohort A; every dated
  game before the range start forms cohort B. Both sides continue through the
  accepted StudyQuery comparison contract and retain composite film refs.
- Date controls seed from the season's earliest/latest dated games, constrain
  invalid boundaries, refresh filter values as the range changes, and collapse
  cleanly on mobile. Watch copy correctly says `Watch date range`.
- Saved views persist and restore both boundaries along with filters, metrics,
  scope, and comparison. Old saved views remain compatible.
- Rebuilt bundle; Study screen 19/19, StudyQuery 24/24, synthetic + real six-game
  parity clean, and complete suite 34/34. No persistence changes, release, or tag.

Parallel (Claude's data lane, landed while awaiting Codex): Phase 2 spine — the
Study QUERY EXECUTOR. `js/study-query.js` (`window.app.study`, `StudyQuery`) is a
pure engine over the accepted P0-c registry: `run({plays, dimension, measures,
filters, minSample, context}) -> { groups:[{value, sampleSize, belowMinSample,
matchingPlayIds, measures}], total, warnings }`. AND-across / OR-within filter
cohorts; min-sample flags (kept + warned, never dropped); measures via
`registry.readMeasures(compute(group))` (no formula reimplementation); guards
throw on unknown / requires-context dimensions. FILM-LINK PARITY is the gate: for
a report-backed dimension it sources each group's `matchingPlayIds` through the
SAME `_buildCutFilter` predicate the reports use, so a Study query returns the
EXACT play set as the old report drilldown. `tools/e2e-study-query.mjs` (18/18)
asserts every group == the committed parity golden (28 groups across formation/
coverage/defFront/runPass/down/personnel/blitz), + filter semantics + guards.
The synthetic-edge fixture is now shared (`tools/fixtures/synthetic-edge.mjs`,
imported by both parity + Study tests); the parity golden is unchanged (both
synthetic + real 6-game still green). `js/study-screen.js` now consumes this
contract behind the opt-in shell flag. Full gate is now 33/33.

Two-cohort COMPARISON is now wired: `study.compare({ base, against, dimension,
measures, filters, minSample, context, labels })` runs the same query over two
play sets (game-vs-season, recent-vs-prior — the caller slices; the engine stays
pure) and aligns groups by value, returning per-row `{ a, b, deltas, sampleDelta
}`. BOTH sides keep their own `matchingPlayIds`, each film-linked to its own
scope's golden (test asserts base==game-scope golden, against==season-scope
golden). `deltas[measure] = base − against` (numeric; null when a side lacks the
group or the measure isn't numeric). Values present in only one cohort align with
an empty side. `tools/e2e-study-query.mjs` now 24/24 (6 comparison assertions).

Prior milestone (P0-d): REVIEWED — ACCEPTED (Claude independent review; no changes required)
Commit: the commit containing this handoff block (impl 2d6d4bb; review adds this block)

Claude P0-d review (ACCEPT — no code changes):
- Verdict: clean contract. No correctness, DOM-coupling, or backward-compat defect
  found; the current production workspace is untouched (no consumer wired).
- DOM-independence VERIFIED: `js/workspace-context.js` has zero document/window/
  getElementById/querySelector references — snapshot reads SeasonStore + the
  team registry via the injected `app`, exactly as the contract claims.
- Backend surface VERIFIED against `storage-backend.js`: every method filmHealth
  calls (supportsFilm/supportsLinkedFilm/listFilmFiles/listLinkedFilm/
  linkedGameDir/isLinkedDirAllowed) exists on BOTH the base StorageBackend and
  TauriBackend, so a browser session degrades to `browser-only` without throwing.
- Challenge points (Codex-requested), all hold up: (1) single-video legacy
  identity — `_expected` falls back clipRefs→clipPaths→clipNames→videoFileName,
  so a legacy single-file game yields one identity, not empty; (2) browser-only
  wording — persistent:false + "Film must be re-added", never described as
  durable (matches the invariant); (3) authorization — linked film gates on
  `isLinkedDirAllowed` and reports `unauthorized`/reconnect, never silently
  loads; (4) operation cleanup — the workspace op clears on BOTH completion
  (app.js `done>=total`) and failure (storage.js import/repair catch blocks).
- Cross-game progress race (Codex's self-review fix) VERIFIED durable: all three
  `importFilm` callers capture `game.id` SYNCHRONOUSLY before the await and pass
  it explicitly to `_showFilmImportProgress(..., game.id)`, which keys the
  workspace op by that id — so a mid-copy game switch cannot mis-attribute
  "saving" to the now-active game. Structural (capture + explicit pass), not a
  guard. Pinned by the harness's "Async progress remains scoped" assertion.
- "Extra files never inflate found" VERIFIED: found = max(0, expected − missing),
  computed only over expected identities; a disk with extra clips can't overcount.
- Gate re-run locally: focused contract 20/20, zero page errors.
- Advisories (non-blocking, for Phase 1): the film-health op-override branch
  returns before the `!expected` check, so a save that begins before the clip
  index is built shows `saving` with expected:0 (correct, but Home's loading row
  should tolerate it); and Home must discard stale async filmHealth results on
  team/season/game change (already noted in Known follow-ups).

Completed:
- Added pure `WorkspaceContext`, exposed as `window.app.workspace`; no current UI
  consumes its routes or view models.
- Defined stable Home / Break Down / Study / Plan descriptors and fail-closed
  season/game guards. Targets preserve current team home, classic workspace,
  Advanced Reports, and controlled Plan coming-soon behavior.
- Added DOM-independent team/season/game snapshots and capability flags.
- Added async film-health normalization for empty, browser-only, managed,
  linked, missing, unauthorized, saving, and repairing states.
- Film status delegates to existing backend APIs and durable clip identities;
  it never loads, copies, links, repairs, moves, or authorizes files.
- Found and fixed a view-model cross-game race during self-review: async copy
  progress now carries its originating game ID instead of reading the currently
  active game. Failure paths clear transient state.
- Added failing-first `tools/e2e-workspace-context.mjs` and the canonical
  `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`.

Files changed:
- `js/workspace-context.js`
- `js/app.js`
- `js/storage.js`
- `build.sh`
- `football-film-analyzer.html`
- `tools/e2e-workspace-context.mjs`
- `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`
- `GRIDIRON-IQ-REDESIGN-PLAN.md`
- `CLAUDE.md`

Validation:
- Failing-first: workspace interface absent, 1 expected failure.
- Focused contract: 20/20; no page errors.
- P0-a synthetic + real six-game parity: clean.
- Core: 25/25; integrity: 12 seeds × 80 ops, clean.
- Managed and linked film regression harnesses: clean.
- Fresh build + all 29 `tools/e2e-*.mjs` files: passed.

Known follow-ups:
- Phase 1 must adapt route targets to existing UI behind the shell feature flag;
  P0-d deliberately performs no UI navigation.
- Film health is queried asynchronously; Home should render a stable loading row
  and discard stale results after team/season/game changes.
- Independent review should challenge single-video legacy identity, browser-only
  wording, authorization boundaries, and operation cleanup.

Next requested action: independently review P0-d before Phase 1 shell/Home work.
```
