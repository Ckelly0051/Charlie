# GridIron IQ Plan V2

> **Status:** PARKED FUTURE ROADMAP - BLOCKED ON PC-5 AND FINAL ENGINE
> INDEPENDENCE
>
> Do not begin this work until the current beta repair plan is complete and the
> coach explicitly activates Plan V2. This document records product direction;
> it is not authorization to modify, migrate, or delete customer data.

## 1. Product Goal

GridIron IQ should feel like one coherent coaching workspace rather than a
collection of powerful screens assembled over time. Plan V2 prioritizes trust,
clarity, speed, and football depth. It does not reduce the available charting or
analytics simply to make the interface appear simpler.

The defining standard is **visible truth**: the app should always make its
current team, season, game, scout perspective, save state, film source, and
storage health understandable to the coach.

## 2. Principles To Preserve

- Local-first and fully useful without a cloud subscription.
- Video-first; controls, overlays, and navigation must not obscure film.
- Coach-job-first UX: organize the product around connecting film, charting,
  studying evidence, and building a plan rather than around code modules.
- Exact stat-to-film traceability for every analytical result.
- Deep, football-correct charting with no artificial requirement to complete
  optional fields.
- Coach-controlled vocabulary and workflows.
- Desktop-first full workflow, with mobile designed for focused companion use.
- Backward-compatible reads wherever the old data is trustworthy.
- Known-bad data is not migrated merely for parity. Any clearing or destructive
  migration requires an explicit explanation and coach confirmation.

## 3. Problems Plan V2 Must Solve

1. Classic and redesigned navigation currently provide multiple routes into
   overlapping experiences, which can create stale or inconsistent context.
2. Important state is often invisible: a coach cannot always tell what game is
   active, whether a save succeeded, or which physical file is playing.
3. Team, film, storage, backup, and repair controls are spread across surfaces
   instead of forming one understandable management workflow.
4. Charting must remain comprehensive while becoming faster and more
   configurable for each staff.
5. Study must grow beyond static reports into a visual, film-linked analysis
   workspace.
6. Plan must become a real coaching workflow rather than an empty destination.
7. Playback, loading, and large-game performance must feel dependable enough
   for daily use.

## 3A. Activation Gate: Final Engine Independence

**Coach/Codex decision, 2026-08-22:** finish and accept PC-5 first. Then freeze
structural feature development and remove the hidden legacy control
architecture in one contained milestone before V2-B or any mobile workflow
opens.

S7 removed the second visible shell, `#app`, and `#wsClassicOutlet`, but it
did not finish engine independence. Some production modules still use hidden
DOM controls under `#giLegacyEngineHost` as their state/API surface. Native
screens therefore still pay a synchronization and testing tax against a
desktop-era control model. Continuing to add structural features before
removing that dependency makes the eventual rewrite larger.

This is **one implementation pass**, not another sequence of small public
milestones:

- One accepted PC-5 commit is the rollback point.
- One implementation range replaces hidden-control dependencies with explicit
  JavaScript state, services, and commands.
- One independent review covers the complete range.
- One full canonical gate runs after implementation, not after every cosmetic
  edit.
- One installed candidate receives the coach smoke.
- Failure of film, data, charting, analytics, routing, or recovery reverts the
  whole pass to the accepted PC-5 baseline.

The pass must:

- Inventory every production read/write of `#giLegacyEngineHost` descendants.
- Give each surviving engine an explicit DOM-free state and command API.
- Point native desktop surfaces directly at those APIs.
- Delete hidden controls as their last production consumers disappear.
- Delete `#giLegacyEngineHost`, synchronization adapters, and obsolete restore
  code.
- Remove the retired `build.sh` / `football-film-analyzer.html` path and CSS
  that has no surviving native owner.
- Preserve all trustworthy season, game, play, roster, film-link, report,
  export, backup, and recovery behavior without a schema or data migration.

Acceptance is binary:

- Zero `#giLegacyEngineHost`.
- Zero production access to retired control ids.
- Zero native-to-hidden-control synchronization.
- One application state model and one coach-facing application.
- Full gate green, independent review accepted, and installed real-film smoke
  passed.

This makes later mobile work easier: desktop and mobile become separate
presentations over the same state and commands. It does not itself design the
mobile UI, but it prevents mobile from becoming a third interface synchronized
against obsolete desktop controls.

> **STATUS (2026-08-23): code complete; installer candidate built; coach smoke pending.** `#giLegacyEngineHost` is deleted; zero production code reaches retired control ids; the retired `build.sh` / `football-film-analyzer.html` path is gone. The canonical gate was **90/90 green** at the final implementation checkpoint, and the focused Auto Detect lifecycle journey is **67/67** after Codex's repair. Unsigned desktop candidate **1.12.0-62** is built and recorded in `CLAUDE.md`. The remaining acceptance item is the installed real-film Charlie Gate across Break Down and Film Room. Bulk dead-CSS reduction remains deferred maintenance and is not part of engine-independence acceptance unless a surviving native surface depends on it.

## 4. Upgrade Lanes

### V2-A: One Navigation And Context Owner

Replace the dual classic/workspace entry paths with one authoritative routing
and workspace-context system for Home, Break Down, Study, and Plan.

Required outcomes:

- One active team, season, and game across every screen.
- One game-opening lifecycle regardless of where the coach clicks.
- Home highlights the actual active or previewed game intentionally, never a
  stale previous selection.
- Settings and primary navigation render consistently on first entry.
- Back/forward, restore, and direct-open paths share the same tested contract.
- Classic compatibility code can be removed only after parity is proven.

### V2-B: Team, Film And Scouting Control Center

Create one pre-game Home and settings experience with two explicit football
workspaces:

- **Our Program** - team seasons, our games, self-scout, roster, film, and
  season reporting.
- **Opponent Scout** - opponents, their games against other teams, opponent
  film, opponent charting, and scout reporting.

The selector is a second front door to the existing charting, storage, Study,
Reports, and Plan systems, not a duplicate analytics backend. Games created
inside Opponent Scout default to the existing `perspective: 'scout'` contract.
They must remain visually and analytically separate from our schedule, record,
Home totals, season exports, and self-scout rollups.

The approved first-pass interaction and layout direction is recorded in:

- `design-comps/home-workspace-2026-08/home.html` (interactive)
- `design-comps/home-workspace-2026-08/home-program-1440x900.png`
- `design-comps/home-workspace-2026-08/home-scout-1440x900.png`

Binding terminology: use **opponent** or **opponents** in coach-facing copy.
Do not call opponents "targets."

Within those workspaces, create one Team & Film Settings destination that
owns:

- Team identity and roster.
- Film library root and storage mode.
- Per-game folder assignments.
- Linked, Managed, Missing, Saving, and Repairing states.
- Exact resolved source path for every game.
- Missing and extra clip counts.
- Backup, recovery, and last-successful-save status.
- Safe cleanup of obsolete managed copies.

The coach must not need to open a game to manage team or film storage.

Opponent Scout creation should ask for the opponent, season/year, and the
source game being charted (the teams involved, date, and film folder). The app
sets Opponent Scout perspective automatically; the coach should not have to
create a fake game on our schedule and then repair its context.

The persistent left navigation must look and behave like selectable
navigation, not background labels. Every available destination needs a clear
button-like hit area plus hover, keyboard-focus, and selected states. Disabled
destinations must remain visible only when useful and must look deliberately
unavailable rather than merely dim or ambiguous.

### V2-C: Intentional First-Run Storage Setup

On first desktop launch, explain and offer:

- **Copy into GridIron IQ** as the simple managed default.
- **Link existing library** as the no-duplication advanced option.
- Selection of a library root that contains per-game folders.
- A confirmation screen showing the exact chosen path and whether video will
  be copied.
- A game-folder assignment checklist with clear success and failure feedback.

The selected application install location and the coach's data/film locations
must be described honestly; installing the executable on another drive must not
imply that Windows app data moved with it.

### V2-D: Visible Source And Storage Diagnostics

Add coach-facing diagnostics rather than relying on developer inspection.

At minimum show:

- Current playback source, such as `LINKED - D:\Football\Film\Holy Family`.
- Expected, found, and missing clip counts per game.
- Whether old managed copies still consume space.
- Last canonical save and backup times.
- Catalog/JSON health in plain language.
- A copyable support summary that excludes tags, roster details, and personal
  information by default.

No cleanup button may delete film or season data without previewing exactly what
will be removed and receiving explicit confirmation.

### V2-E: Configurable Full-Depth Charting

Retain every meaningful production field while reducing everyday clutter.

- Coach-managed libraries for formations, backfields, fronts, coverages, play
  types, and other vocabularies.
- Add, remove, reorder, and restore standard options without deleting stored
  historical values.
- Compact primary controls and progressive disclosure for uncommon detail.
- Saved charting presets by unit, self-scout/opponent-scout mode, and staff role.
- Optional fields remain genuinely optional; partial charting must not corrupt
  classification or analytics.
- Formation structure, QB alignment, backfield, strength, coverage call, and
  coverage family remain distinct dimensions.
- Penalty and special-teams workflows remain structured and football-correct.

### V2-F: Study As The Analytical Center

Expand Study into a visual query and comparison workspace while preserving the
parity-locked analytics foundation.

- Charts, tables, distributions, trends, and situational cross-tabs.
- Flexible scopes, filters, cohorts, date ranges, and side-by-side comparisons.
- Self-scout and opponent-scout perspectives that are explicit and isolated.
- Player performance, personnel, formation, front, coverage, pressure,
  penalty, special-teams, and game-state analysis.
- Honest eligible denominators, samples, missing-data warnings, and metric
  polarity.
- Saved questions and repeatable reports.
- Every number, row, bar, and comparison launches exactly its contributing
  film set using composite game/play identity.
- Concise interpretation may supplement visuals, never replace them.

### V2-G: Plan As A Coaching Workflow

Plan should turn Study findings into something a staff can teach and use.

- Promote a Study cohort or finding directly into a plan.
- Attach exact representative plays and preserve their teaching order.
- Organize priorities, notes, assignments, practice periods, scout sections,
  and install points.
- Explain empty states and provide useful starting actions when no findings have
  been saved yet.
- Presentation and export consume the same canonical plan structure.
- On-screen and exported film references remain identical.

### V2-H: Playback And Large-Game Performance

- Avoid rebuilding playlists or re-resolving every clip unnecessarily.
- Preload only the next useful clip and release stale media resources.
- Keep game switching responsive under large clip counts.
- Show honest loading, buffering, missing-film, and recovery states.
- Preserve autoplay preference across sessions.
- Keep movable video controls, drawing tools, and touch behavior accessible
  without covering film or scroll controls.
- Virtualize or incrementally render large Film Room tables where measurement
  proves it is needed.

### V2-I: Mobile Companion Workflow

Mobile should not reproduce every desktop panel at reduced size.

- Fast single-column charting with large touch targets.
- Separate Review and Study views.
- Reliable swipe/scroll behavior without page-level horizontal overflow.
- Clear film-source and save status.
- Desktop-only storage operations are explained rather than shown as broken
  controls.

Cloud sync, multi-user permissions, and live staff collaboration remain separate
future products and are not implied by Plan V2.

## 5. Recommended Sequence

1. **Foundation:** V2-A navigation/context ownership.
2. **Trust:** V2-B control center plus V2-D diagnostics.
3. **Onboarding:** V2-C first-run storage workflow.
4. **Daily work:** V2-E configurable charting and V2-H playback performance.
5. **Coaching value:** V2-F Study and V2-G Plan.
6. **Companion experience:** V2-I mobile workflow.

Each lane should ship in independently reviewable increments. Do not mix a data
migration, navigation rewrite, and visual redesign in one checkpoint.

## 6. Release And Review Rules

- One builder and one independent reviewer per increment.
- A failing-first regression is required for every repaired defect.
- Analytics changes must pass parity and exact film-reference equality gates.
- Storage changes must be tested against real linked and managed film, including
  app restart and failed-save behavior.
- UI acceptance includes desktop and mobile screenshots, keyboard behavior,
  overflow checks, and a real installed-app smoke.
- A release is not certified by its builder alone.
- Documentation and the active handoff are updated before the baton passes.
- No release is cut from an incomplete or partially reviewed lane.

## 7. Evidence From The July 2026 Beta

The backend audit after linking the six-game season demonstrated why Plan V2
needs visible diagnostics:

- The saved root correctly resolved to `D:\Football\Film`.
- Four games were completely linked with exact clip coverage.
- One game appeared functional but was still playing its old managed `C:` copy
  because the new link had not persisted.
- One linked game had 17 charted clip references missing from its selected
  folder.
- Old managed copies remained on `C:` with no coach-facing explanation of
  whether they were active or safe to remove.

The app and filesystem contained enough information to diagnose all of this;
the product simply did not expose it. Plan V2 should make that truth available
without developer intervention.

## 8. Definition Of Done

Plan V2 is complete when a coach can:

1. Launch the app and understand where seasons, backups, and film live.
2. Open any game through any supported route and receive the same workspace and
   active context.
3. Confirm the exact source of the currently playing film.
4. Diagnose and repair missing clips without risking tags or creating duplicate
   video libraries.
5. Configure charting vocabulary without losing analytical depth.
6. Move from charting to visual analysis to an actionable plan, with every
   conclusion traceable to the correct film.
7. Trust that saves, failures, migrations, and cleanup actions are visible and
   recoverable.
