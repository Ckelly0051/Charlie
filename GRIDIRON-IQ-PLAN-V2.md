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

> **STATUS (2026-08-23): ACCEPTED.** The coach installed **1.12.0-62** and passed the real-film Charlie Gate. Commit `01a3108` and installer `1.12.0-62` are the accepted rollback point. `#giLegacyEngineHost`, retired-control synchronization, `build.sh`, and `football-film-analyzer.html` are gone; Plan V2 may now open from one application state model and one coach-facing shell. Bulk dead-CSS reduction remains deferred maintenance, not a milestone blocker.

## 3A. Dependency Retirement Rule

Beginning with V2-A, new work must not deepen dependence on obsolete presentation infrastructure.

- Age and implementation language are not deletion criteria. Proven football rules, analytics, video, and persistence services remain unless replacement has a concrete product or correctness benefit.
- Hidden DOM owners, click proxies, adopted/relocated controls, duplicate route implementations, compatibility globals used by production, and competing context pointers are obsolete dependencies.
- When a feature touches an obsolete dependency, the default is to replace it with an explicit service/state API and remove the superseded path in the same reviewed checkpoint. Do not add another bridge merely to preserve the old path.
- Production UI may consume retained engines through documented APIs. It must not reach through hidden markup or reconstruct authoritative state from presentation elements.
- Every implementation handoff must disclose: retained dependencies, dependencies removed, any new compatibility seam, and why each retained older component is still the correct owner.
- A milestone must not increase the count of obsolete production dependencies. If safe removal would require changing football meaning, persistence identity, or coach data, stop and obtain coach approval before proceeding.
- Temporary parallel implementations require an explicit removal checkpoint in the same milestone. “We will clean it up later” is not an accepted default.

The goal is not a ceremonial all-Preact rewrite. The goal is one authoritative owner per behavior, clean boundaries around retained engines, and progressively less obsolete infrastructure as coach-facing work advances.
## 4. Upgrade Lanes

### V2-A: Home And Context UX

Final Engine Independence established one state model and one coach-facing shell. V2-A now turns that foundation into an obvious daily workflow rather than repeating structural work.

Required outcomes:

- A prominent Program / Season / Game context switcher is available throughout Home, Break Down, Study, Reports, and Plan.
- The tiny, out-of-place Seasons affordance is retired. A coach can switch seasons from inside any season without hunting for Home or opening a game first.
- A season change safely lands on that season's Home instead of leaving stale game-specific context on screen.
- One active team, season, and game remains authoritative across every route; Home highlights the intentional active or previewed game.
- Home becomes a useful season command center showing record, games, charting progress, film-link health, a recent or selected game summary, and clear actions to open a game, add a game, continue charting, or open Reports.
- Season and game rows are selectable across their useful area. Open/continue actions are visually distinct from destructive controls.
- Persistent navigation has clear button-like hit areas, hover, keyboard-focus, and selected states. Disabled destinations look intentionally unavailable rather than like background copy.
- Settings and primary navigation render consistently on first entry; restore and direct-open paths preserve the same context contract.
- The approved treatment must improve hierarchy, spacing, typography, density, and scanability rather than merely restyle the current layout.

Scope boundary: detailed film-root management, repair diagnostics, opponent-scout creation, and storage onboarding remain V2-B/V2-D/V2-C. V2-A may establish the visual/context entry points they will later use, but must not absorb those workflows.

> **APPROVED CANON (2026-08-23):** The coach approved the rendered V2-A treatment in `design-comps/home-context-v2a-2026-08/`. `home-1440x900.png` and the interactive `home.html` govern the default Home state; `season-switcher-1440x900.png` governs the open season selector. Production must implement this composition and interaction model, not reinterpret it as a cosmetic restyle of the existing Home screen. The six-game real season must fit at 1440x900 without page scrolling.

Implementation contract:

- Program, Season, and Game selectors consume the existing canonical workspace state and commands; V2-A must not introduce another current-season or current-game pointer.
- Selecting a season from any route lands on that season's Home with stale game-specific context cleared.
- Selecting a game row previews it and populates the summary without opening a route. Continue Charting, Study, and Reports are explicit commands; destructive actions remain separate from row selection.
- `Our Program` / `Opponent Scout` is the approved future workspace entry. V2-A renders the affordance but does not build opponent creation, migration, or a duplicate analytics backend.
- Existing Team & Film Settings, seasons, games, film links, and coach data remain untouched. No schema or persistence migration belongs in this milestone.
- V2-A must replace the superseded Home/context presentation it touches rather than layering the approved treatment over it. No parallel Home renderer, hidden selector, click proxy, or new context cache may survive the checkpoint.
- Desktop acceptance covers the approved 1440x900 composition and a narrower desktop viewport, including obvious left-navigation hover, focus, selected, and disabled states.
Execution and ownership:

1. Codex and the coach produce real-data Home and global-context comps.
2. **Complete:** the coach approved the actual rendered treatment on 2026-08-23.
3. **Complete:** Claude implemented the approved V2-A treatment and behavior.
4. **Complete:** Codex independently accepted the implementation at `137ed02`.
5. **Complete:** desktop candidate `1.12.0-63` was built for the coach.
6. **Assistant Coach candidate:** `1.12.0-64` packages the accepted optional,
   resumable season setup for a no-verbal-help test. It is a local candidate,
   not a published release.
7. **Complete:** Codex and the coach reassessed the remaining roadmap. The result is the consolidated V2-B contract below.

### V2-B: Guided Setup, Team, Film And Scouting Control Center

> **FUNCTIONALLY COMPLETE (2026-08-24).** Codex built the
> V2-B coach journey on top of the accepted V2-A shell. The Home front door now
> makes **Our Program** and **Opponent Scout** explicit, selectable football
> workflows; first run explains the choice and film-storage consequence before
> asking the coach to create anything. Program seasons and opponent scouts carry
> explicit canonical `kind` identity, source games record the two teams actually
> on film, and scout seasons are excluded from program schedules, records, totals,
> and rollups. Home now includes a visible Team, Film, Roster, Backup and Recovery
> control center before any game is opened. No duplicate analytics backend or
> second current-season pointer was introduced.
>
> Focused proof on the committed candidate: `e2e-v2b-control-center.mjs` 14/14,
> `e2e-native-team-hub.mjs` 27/27, and `e2e-workspace-shell.mjs` 88/88. Final
> real-screen captures are in `design-comps/v2b-verification/`. A full canonical
> gate was deliberately not repeated for this coach-facing checkpoint. Claude's
> independent adversarial review accepted the implementation and its repairs.
> The final closeout adds an explicit **Season Library** action to the universal
> Season selector, so a coach can return to the full season-management surface
> from any route without knowing that the workspace label is also navigation.
> The clean-profile Assistant Coach Test is consolidated into Functional Beta
> Acceptance rather than blocking further functional work with another interim
> installer cycle.

This is one coach journey, not three disconnected settings projects. It absorbs
the former V2-C first-run storage lane and V2-D diagnostics lane. A new user
must be able to install the app, establish the correct football context, connect
film, and reach a trustworthy first chart without verbal instruction.

The current five-item checklist is progress tracking, not sufficient
onboarding. Automated clicks proving that controls work do not prove that a
coach understands terms, consequences, or the next action.

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

First-run guidance is part of this same control center:

- Start with the football decision: **Our Program** or **Opponent Scout**.
- Our Program guides team identity, season, game, film connection, optional
  roster, first chart, and first report in that order.
- Opponent Scout guides opponent, season/year, source game teams/date, film
  connection, and scout-perspective charting without creating a fake game on
  our schedule.
- Ask where film should live only after the user has enough context to
  understand the choice. Use plain language for **Keep originals where they
  are** and **Copy into GridIron IQ**; explain the exact path and duplication
  consequence before confirmation.
- End with an explicit **Ready to chart** state and a primary next action.
- Explain the minimum charting needed for useful reports, while keeping deeper
  fields optional.
- Keep recovery, backup health, source paths, missing clip counts, and safe
  cleanup in this same destination rather than scattering them across routes.

**Binding season-creation behavior (V2-B closeout, 2026-08-23):**

- With no existing seasons, **Guided setup** is selected by default and
  **Set up manually** is available as a complete bypass. The guided path itself
  also permits every individual step to be skipped.
- With existing seasons, **Quick create** is selected by default and
  **Use guided setup** remains an explicit option.
- Successful creation always uses the existing canonical Team Hub
  createSeason() path. The setup choice controls only the post-create
  destination; it does not create a second persistence path or mutate an
  existing season.
- The guide covers Season details, Roster, Film storage, First game, and Ready
  to chart. Completed work is read from canonical season state and remains
  untouched.
- **Review season setup** remains available from Team & Film Control Center for
  the currently open program season, so the guide is resumable rather than a
  one-time first-run trap.

Opponent Scout creation should ask for the opponent, season/year, and the
source game being charted (the teams involved, date, and film folder). The app
sets Opponent Scout perspective automatically; the coach should not have to
create a fake game on our schedule and then repair its context.

The persistent left navigation must look and behave like selectable
navigation, not background labels. Every available destination needs a clear
button-like hit area plus hover, keyboard-focus, and selected states. Disabled
destinations must remain visible only when useful and must look deliberately
unavailable rather than merely dim or ambiguous.

### V2-C: Absorbed Into V2-B

The former Intentional First-Run Storage Setup scope is now binding inside
V2-B.

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

### V2-D: Absorbed Into V2-B

The former Visible Source And Storage Diagnostics scope is now binding inside
V2-B.

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

> **REPAIR IMPLEMENTED — AWAITING CLAUDE RE-REVIEW (2026-08-24).** One team-scoped
> `TagLibrary` now owns six coach-managed vocabularies: Formation, Backfield,
> Front, Coverage Call, Play Type, and Blitz. Settings can add custom choices,
> hide/show any choice, reorder the charting controls, and restore defaults.
> Film Room and the native charting deck read the same ordered source. Hiding or
> removing an affordance never rewrites historical play tags.
>
> Charting presets save the visible vocabulary plus Unit, workspace mode
> (Our Program/Opponent Scout), and staff role. Matching presets are available
> directly in the charting deck and apply without changing stored plays. Fixed
> semantic fields remain fixed: Down, Result, Run/Pass, QB Alignment, Coverage
> Family, Strength, and Direction. A custom Play Type does not guess Run/Pass;
> the coach must classify that field explicitly so analytics cannot be silently
> corrupted. Penalty and Special Teams models are untouched.
>
> Focused verification: tag-library 18/18, tag-library-settings 17/17, native
> tagging 68/68 (including custom Play Type inference), Film Room 175/175, and a clean Vite production build. No full
> canonical gate or installer was run for this checkpoint; Claude owns the
> independent combined V2-B/V2-E review.

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

1. **Complete foundation:** V2-A navigation/context ownership.
2. **Guided trust:** V2-B onboarding plus team, film, scouting, recovery, and diagnostics.
3. **Daily work:** V2-E configurable charting and V2-H playback performance.
4. **Coaching value:** V2-F Study and V2-G Plan.
5. **Companion experience:** V2-I mobile workflow.

Functional Beta Acceptance requires a cold-start Assistant Coach Test on a clean Windows
profile with no fixture data and no verbal help. In one continuous journey the
tester must install, choose the correct workspace, create its football context,
connect film with the intended storage behavior, chart one useful play, find it
in Reports or Study, close and reopen the app, and confirm both data and film.
Any question that requires the builder to explain terminology or reveal a
hidden settings route is a UX finding, even when the automated harness is green.

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
