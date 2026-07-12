# GridIron IQ Product Redesign — Shared Claude/Codex Plan

> **Status:** Approved product direction; prototype only. No production redesign
> work has started. Keep this document current whenever Claude or Codex changes
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

### Phase 3 — Plan

- Add backward-compatible `plans: []` season data.
- Send Study insight/query results and cutups into Plan.
- Add ordering, staff notes, audience, presentation, and export.
- Preserve play references across game switches and reloads.

### Phase 4 — Break Down redesign

- Add charting-profile configuration without changing tag semantics.
- Recompose the existing tag form into football sections.
- Add compact play strip backed by Film Room's existing model.
- Add Quick Chart as a profile, not a replacement workflow.
- Migrate one unit at a time: offense, defense, then special teams.

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
Branch: claude/football-film-analyzer-GRiCW  (all tracked work committed)
HEAD: d1121d6  Phase 1 shell design acceptance + polish
Gate at HEAD: full 32/32 green (bash build.sh && node tools/e2e-*.mjs); parity
  golden unchanged (synthetic + real 6-game); zero page errors.

Recent redesign commits (newest first):
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
    finished + shipped; Phase 2 Study executor + two-cohort compare DONE. The
    Study analytics spine (registry → query → compare) is complete + parity-locked
    + film-linked; NO UI consumes it yet (it is the contract the Study screen calls).
  Codex (visual shell / workspace UX): Phase 1 shell+Home ACCEPTED and complete.
    Responsive design review + the logged polish pass are committed at d1121d6.

NEXT ACTIONS
  Codex: begin the Phase 2 Study screen on the accepted registry → query →
    compare spine. Keep Advanced Reports one click away and keep the shell flag
    opt-in until real-coach acceptance.
  Claude: A3 in progress — INCREMENTS 1 + 3 DONE (Node-tested): the dual-write
    orchestrator core (76db0c9) AND the one-time JSON->catalog migration
    (23f8aa1, CatalogPersistence.migrateJsonSeasons, idempotent). REMAINING = the
    increment-2 DESKTOP WIRING, which is HELD (not blocked on a coach smoke —
    blocked on the in-progress Study screen): it edits build.sh + app.js + the
    bundle, which Codex is actively editing for the Study screen, so wiring it now
    would entangle two uncommitted work-streams on the same files. Resume once the
    Study screen is committed. Increment-2 scope (was drafted + reverted to keep
    Codex's tree clean; cheap to redo): vendor sql-wasm.wasm as a Tauri resource +
    CSP `'wasm-unsafe-eval'` + `$RESOURCE/**` asset scope; a fail-safe
    `_loadSqlEngine()` + `_ensureCatalog()` on TauriBackend; delegate
    load/save/deleteSeason to CatalogPersistence behind `ffa_sql_catalog`
    (default OFF; any load error silently falls back to today's JSON path);
    call migrateJsonSeasons on first flag-on. Add sql-catalog.js +
    catalog-persistence.js to build.sh (browser bundle stays sql.js-free — the
    wasm is desktop-only, lazy-loaded). Then: full gate green (flag-off path
    unchanged) + a coach desktop smoke.

A3 — SqlCatalog canonical cutover (task #54), INCREMENTS 1 + 3 COMPLETE (2 HELD):
- Increment 3 (23f8aa1): `CatalogPersistence.migrateJsonSeasons(ids)` imports the
  coach's existing per-season `season.json` into the shared library db on first
  flag-on — idempotent (skips a season already in the db), never throws.
  `tools/e2e-catalog-persistence.mjs` 21/21 (migrates all, skips missing, loads
  canonically after, lossless, idempotent on re-run).
- Increment 2 (desktop wiring) HELD — see NEXT ACTIONS (entangles with the
  in-progress Study screen on build.sh/app.js/bundle).

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
  Break Down shows the classic workspace, Study opens Advanced Reports, Plan is a
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
acceptance block above. Next Codex action is the Phase 2 Study screen.

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
synthetic + real 6-game still green). No UI consumes StudyQuery yet — it is the
contract the Study SCREEN (Codex) will call. Full gate 31/31.

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
