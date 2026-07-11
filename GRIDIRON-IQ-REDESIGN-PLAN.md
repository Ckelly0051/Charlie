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
  `GRIDIRON-IQ-ANALYTICS-INVENTORY.md`. **Owner: Codex · ready for review.**
- **P0-c — Metric + dimension registry interfaces.** The pure registry SHAPE
  (dimension: name + value-extractor + canonical-fn binding; measure: name +
  canonical-fn binding) covering the min dimensions/measures, each bound to the
  EXISTING `StatsEngine` canonical fns + `advanced-metrics` EPA. No formula
  reimplementation. **HIGHEST-RISK SHARED SURFACE** — a silent analytics
  regression would hide here; the reviewer runs parity against it adversarially.
  **Owner: Claude (builds), Codex (parity review).**
- **P0-d — Shell + workspace-context interfaces.** Shell routes, workspace
  context, and the film-health view model — the interfaces the Home/Study
  screens are built against. **Owner: Codex.**

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
Owner: Codex | Phase: P0-b Report/filter/export inventory | Status: READY FOR REVIEW
Commit: the commit containing this handoff block

Completed:
- Added `GRIDIRON-IQ-ANALYTICS-INVENTORY.md` as the canonical P0-b contract.
- Inventoried all computed output/measure blocks plus scope, filter, unit,
  denominator, and multi-value semantics that P0-c must preserve.
- Mapped six dashboard tabs, four season subtabs, dedicated reports, Big calls,
  Call Sheet, Film Room, all drilldowns, and all export/print artifacts.
- Derived the P0-c contract: stable IDs, canonical bindings, scope, perspective,
  eligibility, formatting, composite matches, filtering, and export semantics.

Files changed:
- `GRIDIRON-IQ-ANALYTICS-INVENTORY.md`
- `GRIDIRON-IQ-REDESIGN-PLAN.md`
- `CLAUDE.md`

Validation:
- Reconciled directly against stats, season, filter, grid, storage, call-sheet,
  cutup-exporter, and roster production modules.
- Documentation-only milestone; no production modules or bundle changed.

Known follow-ups:
- Semantic export snapshots remain to be added after independent review.
- Season cross-game rows are currently inert; future Study cutups require
  composite `gameId::playId` references.

Next requested action: independently review P0-b for missing surfaces and source
accuracy. Once accepted, begin P0-c with failing-first interface tests and bind
all formulas to canonical StatsEngine/AdvancedMetrics functions.
```
