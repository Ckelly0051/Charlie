# GridIron IQ Plan V2

> **Status:** ACTIVE. Plan V2 has been explicitly activated and is in progress.
> V2-A through V2-H are complete and accepted (see each milestone's own section
> below and `CLAUDE.md` for the full acceptance record). This document records
> product direction; it is not authorization to modify, migrate, or delete
> customer data.

## Current Home - APPROVED ENTRY IMPLEMENTED LOCALLY (2026-08-31)

The approved comp now governs production Home for all three meaningful states: first launch, season library/no open season, and a populated open season. First launch is part of Home, not a centered Team Hub onboarding panel. It offers the approved Program/Opponent choice, structured program and season identity, guided/manual setup, recovery, and sample-season actions. The rejected `FirstTeam` presentation is deleted. Team Hub remains the canonical season-library management destination after setup, while creation continues through its existing service boundaries.

The first-launch implementation has dedicated behavioral and responsive proof at 1440, 1280, 768, and 390 pixels, including manual, guided/skippable, and opponent-first creation. Focused results are recorded in the newest `CLAUDE.md` entry. This is local source work: no installer, release, push, or customer-data rewrite is implied.

### Prior Local Home Repairs

Codex directly repaired the remaining e3930fb findings: serialized duplicate checks/creation and canonical Scout identity lookup; visible-thumbnail refresh on root/first-file changes; and the approved edge-aligned rail/header/game-workspace composition without the old outer width cap. The repair was built in an isolated e3930fb archive with only its own files, excluding unrelated dirty Breakdown/token/packaging changes. Focused checks: Home 25/25, Team Hub 33/33, Settings 23/23, shell 90/90. Populated desktop screenshots were inspected; the source and docs are updated locally, not committed, installed, or released. Exact scope, evidence, and limitations are in the latest CLAUDE.md entry.

### Historical Home Implementation And Review

**Independent review supersedes the completion claims below.** The comp remains approved, but production is not accepted: the required rail/entry-flow composition is omitted; naming/setup dependencies are missing from the commit; thumbnail ownership fails across season/source changes; thumbnail work is eager rather than visibility-lazy; and obsolete row CSS constrains new cards. Exact evidence and repair instructions are recorded at the top of `CLAUDE.md`. Finish the approved implementation and repair these defects before packaging. The implementation account below is the builder's historical report, not the current review verdict.

The approved comp is now the real production Home route (`js/home-screen.js`, `js/native-home.jsx`, `css/native-home.css`, plus `js/identity-labels.js` and `js/game-thumbnail.js`). This closes the "APPROVED FOR IMPLEMENTATION" step below; the implementation record is at the bottom of this section, and the full test-fix accounting is in `CLAUDE.md`'s matching dated changelog entry. No installer, push, or release — Codex review is the next step per the handoff.

Charlie approved the revised comp ("looks great"). Claude implemented it under `design-comps/home-workspace-2026-08-31/BUILD-HANDOFF.md`. The current local comp remains the visual reference. This does not authorize rewriting existing identities, changing film paths, an installer, or a release.

Latest comp revision applies the coach's collected spacing, containment, action-label, preview-control and raised-navigation feedback. School/organization and nickname are now explicitly separate for both our program and opponent/source-game teams, supporting compact nickname matchups without guessing from existing names. Full identities remain available and disambiguate matching nicknames. This is a proposed creation/edit contract, and is now implemented in production (see below); it did not rewrite any existing coach data.

Charlie selected Home as the next target. This is navigation and data organization as well as presentation: a useful film library, visible season switching, direct scoped access to charting/Study/Reports/season plans/roster/film controls, and structured Program/year/level creation. The interactive comp is `design-comps/home-workspace-2026-08-31/home.html`; its `RATIONALE.md` distinguishes competitor precedent from our proposed naming and duplicate rules and maps existing production owners. Generated names must not replace stable IDs; existing seasons must not be guessed, merged, renamed or moved automatically. Guided setup remains optional and completely skippable.

**Implementation record.** `HomeScreen`/`native-home.jsx` is the sole Home route, following the established native route-controller pattern (`TeamHubScreen`/`native-team-hub.jsx`). It reuses `App.openGame(id, {route})` for every real navigation (Continue charting, Open Study, Open Reports, Season report), so a Home selection is a PREVIEW only until an action activates it — the canonical `activeGameId` never changes from a row click alone, matching the existing Study/Reports/Plan contract. `identity-labels.js` composes school+nickname additively into the existing compatibility fields (`opponent`/`sourceTeamA`/`sourceTeamB`/`teamName`); `game-thumbnail.js` is a small, season-token-guarded, lazy thumbnail service that never blocks the charting player and clears stale work on season/game change. Deliberate deviation from the comp, disclosed rather than silently dropped: Home does **not** duplicate the comp's vertical year-grouped season rail. `WorkspaceShell`'s existing persistent Program/Season/Game context bar — already the coach-approved, heavily-tested app-wide switcher since V2-A/V2-B — covers the identical functional need; adding a second rail would itself become the "duplicate global nav" the comp's own rationale warns against. Everything else in the binding visual/data contract (search/sort/filter/view toggle, structured year+level creation with duplicate detection, guided/manual/skip/reopen setup, roster access on an empty season, honest film-health states, real bounded thumbnails, keyboard/focus) is implemented and covered by focused tests. Full file list, verification results, and the disclosed rail deviation are in `CLAUDE.md`'s matching dated changelog entry.

Approved design-only checkpoint: 87 focused checks, 23 captures, representative visual inspection. Production Home and customer data are unchanged. Legacy metadata handling, boundary validation and thumbnail caching are implementation scope, not cosmetic work already completed. The handoff defines conservative duplicate/squad behavior and identifies remaining product decisions that must not be guessed into destructive migrations.

## Current Breakdown Presentation — APPROVED (2026-08-31)

The reviewed `design-comps/breakdown-workspace-2026-08/breakdown.html` has now been implemented in the live route. Chart has the responsive vertical rail / horizontal strip / on-demand Plays browser; Film Room has a wider desktop table and top-aligned film/detail column; the charting deck follows the compact header, neutral label color, aligned Situation/spot controls and independent Players & Grades disclosures. Existing domain controllers, full tag vocabulary, virtualization and persistence remain in place.

Build and focused behavioral checks passed; populated production screenshots and open/empty states are recorded in `artifacts/breakdown-comp-live/`. Charlie approved the installed **1.12.0-68 Beta** presentation on 2026-08-31, including the wide-screen vertical play rail. Slightly tighter vertical tagging padding is a deferred next-pass nit, not a blocker or authorization to reopen this layout now. This is presentation acceptance, not a claim that every installed workflow has been tested or that the whole app's design is finished. See the current `CLAUDE.md` handoff for test changes, discovered defects, and exact scope.

**Deferred Breakdown width repair (coach screenshot, 2026-08-31):** Edit Library sits beyond the rightmost option chip, leaving unused horizontal space in the tagging deck. In the next Breakdown pass, align the action with the option group's right edge and evaluate narrowing the deck to return space to the left-side workspace, especially video. Coach estimates roughly 0.25-0.5 inches; this is an unmeasured opportunity, not a promised gain. Moving the button alone will not resize the layout: check the column constraints and other widest controls, preserve readable sizing and all options, and inspect populated Offense/Defense/Special Teams before accepting the reclaimed width. Reference: `codex-clipboard-53e3411d-c4aa-4da0-b4ab-492c6bb3406b.png`. Explicit instruction: note only, do not fix yet. Home remains the current work.

## Prior Breakdown Checkpoint — ACCEPTED (2026-08-28)

**Data-isolation repair completed 2026-08-29:** roster ownership is season-scoped, not global or per-team. A season's games share one roster; JV and Varsity seasons under the same program remain independent. Ambient roster caches no longer participate in opening, switching, or saving a season. This repair is accepted and closed a live Settings-boundary bypass and a silent no-season mutation no-op (see `CLAUDE.md`'s "CODEX ROSTER SETTINGS-BOUNDARY REPAIR" and "CLAUDE V2-H REPAIR" entries); it did not redistribute existing roster data.

The pre-redesign ownership blockers are closed. The comp-governed presentation phase completed with a binding rule that was honored throughout: density comes from layout and progressive disclosure, never from reducing ordinary coach-facing text and controls below the shared design-system sizes. Breakdown (Chart, Film Room, and the shared Theater) received a complete, coherent visual/composition pass — canonical typography, 30px desktop controls, wrapping utilities, aligned field-position controls, an automated computed-style/containment gate, shared type rhythm across the Theater and Film Room, and a native-owned template/utility row with no detached legacy selector.
Accepted implementation range: `a3cc8b4`, `574493a`, `e5481e5`, `4c8c1c5`, the Chart form body checkpoint, the Film Room composition checkpoint (including its keyboard-accessibility repair), and the Chart header/scheme-group synchronization fix at `9b73789`.

1. **Complete and accepted.** The populated Chart form body and commit bar as one comp-governed consumer workflow — scan order, group hierarchy, spacing, chip geometry, progressive disclosure, Players & Grades, all three units, scout mode, and responsive containment. Two real defects were found by rendering the live app against the comp rather than reading tokens: the desktop play-identity block was an oversized solid-gold panel with no functional purpose, and the Offense/Defense scheme groups' expand state could stick on the wrong side after a unit switch because `Group`'s collapse state only read its `open` prop once at mount. Both are fixed (`css/native-tagging.css`, `js/native-tagging.jsx`); see `CLAUDE.md`'s "CODEX BREAKDOWN CHART FORM BODY COMPLETE" entry for the full account and verification. Film Room composition (the chyron/mark-actions narrow-width fix) is also complete and accepted, including a keyboard-accessibility repair.
2. **Complete and accepted.** The final route-wide adversarial review across the complete Breakdown route (Chart, Film Room, and the shared Theater) ran and found no bugs — see `CLAUDE.md`'s "FINAL ROUTE-WIDE ADVERSARIAL REVIEW — BREAKDOWN ACCEPTED, NO BUGS FOUND" entry. Breakdown is accepted as a coherent, bug-free workflow at that baseline.

**V2-H (Playback And Large-Game Performance) is complete and closed**, including the repaired Film Room virtualizer (see §V2-H's own section below and `CLAUDE.md`'s "CLAUDE V2-H REPAIR" and "CLAUDE V2-H: PLAYBACK OWNERSHIP AND LARGE-GAME PERFORMANCE" entries). Save & Next now preserves the coach's selected charting unit across untouched placeholder plays while respecting genuinely charted plays (`CODEX SAVE & NEXT UNIT-STICKINESS REPAIR`).

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
- Consumer-product presentation: every coach-facing screen must be attractive,
  coherent, legible, dense without clutter, and understandable without builder
  narration. Functional-but-ugly is not an accepted intermediate end state.
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

> **STATUS (amended 2026-08-28): ACCEPTED FOR SHELL INDEPENDENCE ONLY.** The coach installed **1.12.0-62** and passed the real-film Charlie Gate. Commit `01a3108` and installer `1.12.0-62` remain the rollback point for removing the hidden shell. The earlier conclusion that bulk dead CSS and remaining screen-level presentation owners were harmless deferred maintenance was wrong. Repeated comp-to-installer drift proved that they remain blockers to reliable visual redesign; the binding retirement work is recorded below.

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


## 3B. Blockers Before Further Visual Redesign

**Coach/Codex decision, 2026-08-28:** do not begin another broad visual redesign until the presentation constraints below are removed or explicitly contained. Three redesign attempts demonstrated that a native-looking surface over competing renderers and an uncontrolled global cascade does not reliably produce the approved composition in the installed app.

The blocking work is:

- Remove duplicate Breakdown presentation owners. `BreakdownVideo` is obsolete; the DOM-composing portion of `BreakdownForm` is obsolete and its still-live football mutations must move to an explicit DOM-free service before the old renderer is deleted.
- Separate Film Room state, editing, and football behavior from its hand-built document renderer. Retained behavior may remain, but presentation must have one owner before the next Breakdown redesign.
- Inventory the live CSS cascade by selector and owner. Broad historical rules for typography, buttons, panels, tables, tags, video, and reports must be deleted, scoped, or consolidated so screen-local styles cannot be unpredictably overridden thousands of lines later.
- Establish one canonical consumer-facing base for typography, controls, tables, spacing, and density. The approved comp and the installed app must run through the same cascade, fonts, and viewport assumptions.
- Retire obsolete CSS alongside each affected screen rather than carrying it as indefinite maintenance. A screen is not redesign-ready while superseded rules can still influence its geometry or appearance.

This is not authorization to remove legacy season normalization, import compatibility, schema migration, football formulas, film identity, or persistence recovery. Those are retained data/domain compatibility paths, not competing presentation owners.

Acceptance for opening the next broad redesign:

- Breakdown has one presentation owner per visible surface.
- No obsolete Breakdown renderer mounts, restores, reparents, or synchronizes DOM.
- Film Room behavior is consumable without its retired document renderer.
- The live global CSS affecting the redesigned surface is known and controlled.
- Real-data captures at the agreed desktop viewports match the same composition used for approval.

> **PROGRESS (2026-08-28):** The first two blockers are closed. BreakdownVideo, BreakdownForm, their mount/restore hooks, feature flags, bridge exports, and dedicated CSS are deleted. Structured penalty and Special Teams behavior now lives in the DOM-free BreakdownChartingService. PlayGrid is now a DOM-free state/command model, while NativeFilmRoom is the only presentation owner; the classic renderer, event wiring, collapse preference, and HTML-to-text bridge are deleted. The first cascade pass removed 151 selectors owned solely by the deleted tag and grid renderers. The second pass prevents 196 historical generic button/form selector branches from matching any native `.ws-shell` route. The hidden media-control checkpoint then deleted the parked legacy transport, scrub/timeline, play selector/actions, autoplay, angle-control, and clip-indicator markup plus all controller synchronization and no-op compatibility calls. `#giMediaHost` now parks only canonical media. `tools/audit-breakdown-css.mjs` measures only 37 potentially matching rules from global `styles.css`, down from 94; all 37 are the permanent video/media foundation or universal visibility/box-sizing utilities. That media foundation now lives in explicit `css/media-foundation.css`; `styles.css` reaches Breakdown only through five universal box-sizing/visibility utilities, and the audit fails if a historical global selector returns. All pre-redesign ownership and cascade-control blockers are closed. The next step is the canonical consumer-facing typography/control/table/spacing base, followed by comp-governed Breakdown composition.


## 3C. Binding Consumer Presentation Standard

Product presentation is part of functionality, not optional polish. GridIron IQ
must look like a finished consumer coaching product, not a developer console.

- Approved comps govern composition, geometry, hierarchy, density, and visual
  treatment. Token changes or recoloring alone do not satisfy them.
- Every visual checkpoint receives a low-cost Charlie Gate using the real app,
  representative real data, and agreed viewports before expensive automated
  review, packaging, or release.
- Acceptance covers useful information per viewport, alignment, whitespace,
  typography, contrast, responsive containment, interaction states, and
  consistency with the shared shell and neighboring routes.
- **Interaction-state rule:** every enabled interactive element must visibly
  distinguish rest, pointer hover, active/pressed or selected state when
  applicable, and keyboard `:focus-visible`; disabled controls must also read
  as intentionally unavailable. This applies to navigation, tabs, filters,
  links, dropdown triggers, icon buttons, card actions, and ordinary command
  buttons, including compact controls that show only a symbol. Hover must be
  obvious during a quick scan through a surface, border, color, or restrained
  elevation change; keyboard focus must remain independently visible and meet
  contrast requirements. State styling must preserve stable dimensions and
  cannot move surrounding layout. A missing hover or focus state is a product
  defect, not optional polish.
- Empty space must be intentional, not compensation for unfinished composition
  or stretched low-information modules.
- Operational copy uses one readable UI/body family. Condensed/display faces
  are reserved for true headings and major numbers. Only supplied font weights
  may be used; synthetic weights and tiny low-contrast metadata fail review.
- Home, Reports, and Break Down are the reference screens for typography and
  cross-route visual coherence.
- Pretty and functional are one acceptance requirement. Automated tests prove
  behavior; they do not certify visual quality.
- Builders and reviewers must challenge weak product planning before coding.
  When the direction is sound but the result misses the approved visual
  standard, describe it honestly as an execution miss and revise it.

This standard survives task resets, context compaction, and builder handoffs.
Every handoff must identify its real-app screenshots and the coach's PASS,
REVISE, or REJECT decision.

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
> Coach-smoke correction (2026-08-24): the duplicate left route rail is deleted. The compact top navigation is now the only desktop route owner on Home, Break Down, Study, Reports, and Plan; mobile keeps one bottom navigation. This is an absence contract, not a CSS hide.
>
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

> **CODE ACCEPTED — ASSISTANT COACH TEST CANDIDATE `1.12.0-65` (2026-08-24).** One team-scoped
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

> **REPORTS PRESENTATION FOUNDATION AND RETIREMENT (completed 2026-08-26):**
> The live Reports route is native for both perspectives. Our Program owns
> Overview, Offense, Defense, Special Teams, Players, Self-Scout, Season, and
> Matchup; Opponent Scout owns native Overview, Offense, Defense, and Special
> Teams views over the same structured football models and exact composite film
> references. Current-game and full-season HTML downloads share one structured
> print renderer. The obsolete StatsEngine dashboard/render/binder family,
> ReportsScreen HTML compatibility methods, and SeasonManager.statsHtml() are
> deleted. No old Reports presentation consumer remains to constrain Study,
> future visual composition, or mobile work. Retained StatsEngine code is football
> analytics, film resolution, or the active PDF export path, not a second UI.
>
> **Final island correction (2026-08-27):** The prior completion note was
> premature: Offense Heat Maps and Visualizations still entered the native route
> through LegacyWidget, and ReportPane retained a generic raw-HTML fallback.
> Those islands and their obsolete source modules are now deleted. Both sections
> are native Preact over structured data with direct, exact-film actions; the
> migrated desktop composition was visually inspected.
>

> **STUDY PRESENTATION INDEPENDENCE (completed 2026-08-26):**
> The live Study route is now one Preact-owned analytical workspace. Query
> controls, saved views, player questions, filters, comparisons, pivots,
> visuals, film-linked result rows, and the Save-to-Plan chooser render from
> structured view models in `study-view.js`; the former imperative HTML
> renderer and delegated event-binding family are deleted. `StudyQuery`,
> registry projections, metric formulas, composite film identity, and plan
> persistence remain canonical rather than being duplicated in the UI.
>
> The checkpoint also fails visibly when any part of a pivot query fails,
> resets query state when the coach switches seasons, refreshes player choices
> from the current cohort, and keeps the plan chooser in the actual modal layer.
> Focused verification: production build; Study 114/114; Study Players 38/38;
> Penalties/Special Teams 33/33; Study Query 48/48; Study-to-Plan 14/14; hostile
> names 6/6; desktop and mobile screenshots visually inspected.
>
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

> **PLAN PRESENTATION INDEPENDENCE (completed 2026-08-26):**
> The live Plan route and full-screen teaching presentation are now Preact-owned.
> The former `PlanScreen.innerHTML` renderer, delegated click/change/drag
> listeners, post-render strip synchronization, and HTML escaping adapter are
> deleted. `StudyPlan`, SeasonStore plan persistence, `PlanExport`, ordering
> rules, and exact composite film references remain canonical.
>
> The native route preserves synchronous refresh for existing store callers,
> accessible button and desktop-drag ordering, grouped film sets, audience and
> staff notes, export parity, keyboard presentation controls, mobile containment,
> and one-click film playback. Focused verification: Study-to-Plan 114/114; Plan
> contract 32/32; Plan export 22/22; workspace shell 87/87; hostile names 6/6;
> desktop and mobile route/presentation screenshots visually inspected.
>
> **CALL SHEET PRESENTATION INDEPENDENCE (completed 2026-08-27):** The separate
> builder is now a native Preact sheet over the existing football-selection and
> print engine. The injected `#callSheetModal`, document-query configuration,
> alert path, and retired `.cs-*` CSS are deleted. Situational availability,
> live escaped preview, paper-sized layout, and Print now share one structured
> document path through the native overlay service.
>
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

> **MANAGED-FILM MANIFEST REUSE (first slice, 2026-08-27):** Reopening an
> unchanged managed-film game now reuses a bounded, exact-signature cache of
> deterministic clip asset URLs instead of repeating one desktop resolution per
> clip. File listing remains authoritative, changed/partial manifests retry,
> current catalog identity is reattached on every use, linked folders remain
> uncached, and the latest-load-wins race fence remains intact.
>
> **BOUNDED NEXT-CLIP PRELOAD (second slice, 2026-08-28):** Playlist playback
> now keeps resources for only the active clip and its next sequential successor.
> The successor is preloaded through one detached media element, its object URL
> is reused when the coach advances, and jumps, relinks, removals, game switches,
> and reset release stale media immediately. Missing clip sources fail without
> changing the active clip.
>
> **HONEST PLAYBACK STATES (third slice, 2026-08-28):** The player now labels
> initial loading, buffering, and stalled loading in a compact live status pill
> instead of only dimming the film. A terminal media failure replaces the generic
> empty prompt with the failed film name and a direct re-link/format recovery
> instruction; unload restores the normal empty state. This does not complete
> V2-H; measured large-grid work and broader playback responsiveness remain.
>
> **PLAYBACK OWNERSHIP AND LARGE-GAME PERFORMANCE (fourth slice, closes V2-H,
> 2026-08-29):** Mapped the complete live playback path (VideoController,
> PlaylistManager, MultiAngle, the shared Breakdown Theater, Film Room, and
> every game/season-switch entry point) before editing. `VideoController` and
> `PlaylistManager` are confirmed clean single owners of the canonical media
> element and preload/relink state — no competing implementation, no
> DOM-as-hidden-state pattern remained to remove there.
>
> **Two measured, demonstrated bottlenecks fixed, both on the shared theater:**
> (1) `BreakdownTheaterScreen`'s `time-update` handler ran a full snapshot
> rebuild — including a duplicate `_playView` map over every play, computed a
> second time for a value the play strip only ever reads the `.length` of — on
> every media tick outside fullscreen. Now a single direct write to the two
> transport time nodes and the scrub value; nothing else in the snapshot
> depends on playback time. Measured on a representative game: ~0.6ms per tick
> down to ~0.006ms, continuous for as long as the route is mounted, in or out
> of fullscreen. (2) The Film Room table rendered one `<tr>` per play
> unconditionally, so every Chart&#8596;Film Room switch paid a full,
> un-windowed layout pass scaling with total play count. Film Room now
> **windows its rendered rows** to the scroll position plus a fixed overscan
> band (spacer `<tr>`s preserve true scroll height; the active/focused cell is
> always force-included regardless of scroll position, so keyboard navigation
> can never race a scroll-driven window update). Measured switch cost on a
> 700-play game: ~230-250ms down to ~55-110ms per switch (a real
> `content-visibility:auto` attempt was tried first, measured to provide zero
> benefit on this specific table, and fully reverted before the windowing
> approach was built). A defensive scroll-reset-on-game-switch guard is also
> included, disclosed as unproven by reproduction (see Residual risks) rather
> than measured necessary.
>
> **Confirmed-dead code removed in the same change, per the explicit
> instruction:** `BreakdownWorkspace`'s `unitControl`/`unitParent`/
> `unitNext`/`_unit()` (targeted a `#tagForm .unit-toggle-section` selector
> retired by earlier work; zero remaining references anywhere in the repo
> after deletion). One further dead mechanism found and removed in the same
> pass: `App._flashSaved()` targeted a legacy `#btnTagSaveNext` button that no
> longer exists — Save & Next's "Saved" acknowledgment lives entirely on the
> native button now (`NativeTaggingScreen.saveNext`'s own `saveConfirmed`
> flag), so the dead method and both call sites are gone.
>
> **One real coach-facing correctness defect found and fixed, surfaced
> directly by this checkpoint's own required visual verification of the
> "missing/failed film with recovery action" state:** `VideoController`
> cached `this.placeholderText = this.placeholder?.querySelector('p')` once
> in its constructor, but `UIPolish._initEmptyStateCTA()` — which runs moments
> later in the same boot sequence — replaces the placeholder's entire
> `innerHTML` with the empty-state dropzone card, detaching that cached `<p>`
> from the document. Every terminal media failure since has been silently
> writing "Couldn't play X.mp4 — re-link the film or use MP4, MOV, or WebM"
> into a node no coach could ever see; the placeholder box still appeared, but
> always showing the generic "Add game film" card with no explanation of what
> actually failed. Fixed by giving the coach-facing status a stable, live-
> queried element (`#videoPlaceholderStatus`) inside the dropzone card instead
> of a cached reference, and swapping the dropzone title to "Film unavailable"
> only while a real failure message is showing (never for the ordinary empty
> state). Mutation-verified: reverting the fix reproduces the exact original
> defect (an empty, hidden status line) in a new permanent regression.
>
> Verified against the coach workflow, not just dimensions/overflow: focused
> suites green (`e2e-film-room` 175/175, `e2e-native-film-room` 25/25,
> `e2e-native-breakdown-theater` 56/56, `e2e-breakdown-video` 19/19 — new
> section 4 pins the placeholder fix — `e2e-video-cors` 25/25, `e2e-breakdown-
> lifecycle` 39/39, `e2e-breakdown-geometry` 13/13, `e2e-breakdown-a11y`
> 10/10, `e2e-multi-angle` 6/6, `e2e-native-tagging` 69/69, `e2e-mark-flow`
> 13/13, plus a new permanent `e2e-film-room-virtualization` 8/8 covering a
> 300-play game's windowed rendering, scroll-to-bottom reaching the final row,
> 60 consecutive keyboard steps reaching and correctly editing a row far
> outside the initial window, true-total select-all beyond the windowed DOM,
> and a wholesale game switch mid-scroll rendering the new game's full row
> set). Full canonical gate re-run clean at 80/93 green, 13 pre-existing/
> unrelated failures independently reproduced on the untouched baseline via
> `git stash` comparison (version-sync, undefined CSS tokens in unrelated
> files, Study/Reports/Plan delegation, play-call/Reports rendering, Special
> Teams try contracts, a copy-standard sweep, the P0 capabilities inventory, a
> pre-existing workspace-shell teardown assertion, and the documented
> intermittent Puppeteer/CDP crash class) — zero new failures from this
> checkpoint's complete change set. Screenshots captured and actually opened
> at 1440x900/1280x720/768x1024/390x844 for all six required states in
> `design-comps/visual-reset-2026-08/part1-verification/
> v2h-playback-performance/`; composition holds up across viewports with no
> new clipping or overflow. One disclosed capture-environment limitation: this
> headless sandbox cannot decode ANY video (neither a hand-built MP4 data URI
> nor a browser-recorded MediaRecorder WebM played), so "normal loaded film"
> is represented via the theater's real post-`video-loaded` state (placeholder
> hidden, transport/chyron/strip populated) rather than an actual decoded
> frame — a capture-environment constraint, not a product gap; real decode
> paths remain covered by `e2e-video-cors`/`e2e-breakdown-video`.
>
> **Residual risks, disclosed rather than silently carried:** the scroll-
> reset-on-game-switch defensive guard in `native-film-room.jsx` could not be
> proven necessary by adversarial reproduction (deep-scroll then switch/filter
> attempts, with the guard disabled, never produced the empty-table failure it
> guards against — Chromium's own scroll-position re-clamping on content
> shrink appears to already prevent it in practice); kept anyway since it is
> zero-cost for the working case. The pre-existing narrow-viewport (390px)
> horizontal chyron truncation and quick-filter-row truncation were observed
> during visual verification but are unchanged, already-reviewed, already-
> accepted behavior from an earlier checkpoint (documented scroll-cue fix)
> and were not touched, per the instruction to preserve the accepted
> composition rather than perform a broader redesign.
>
> **This closes V2-H.** Every remaining bullet below is satisfied: playlists
> are not rebuilt/re-resolved unnecessarily (prior slices); only the next
> useful clip is preloaded and stale media is released (prior slices);
> unchanged managed-film games stay fast to reopen (prior slice); game
> switching is responsive under large clip/play counts (this slice); loading,
> buffering, missing-film, and recovery states are honest (prior slice + this
> slice's placeholder-text fix); autoplay preference persists across sessions
> (unchanged, verified still correct); movable controls/drawing tools/touch
> remain accessible without covering film (verified, unchanged); and Film Room
> now virtualizes — added only after measurement showed the un-windowed table
> was the actual switch-cost bottleneck on a large game, not speculatively.
>
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

## 9. Implemented Visual Contract: Home-Adjacent Workspace Panel

The Home rebuild includes the shared Team & Film Settings surface that Home,
Break Down, Team Hub, and the shell all open. Its implemented contract is:

- Desktop sheet: min(920px, 100vw - 48px), exterior spacing, fixed
  64px/44px/body/56px rows, and body-only vertical scrolling.
- Narrow sheet: full screen at 700px, horizontally scrollable tabs, one-column
  forms, and 44px minimum controls.
- Narrow Film prioritizes the current season and uses stacked, fully labeled
  game rows; it never asks a coach to infer that data exists below an orphaned
  desktop table header.
- IBM Plex Sans for coach-facing titles, tabs, headings, labels, and body copy;
  monospace is reserved for real file paths and technical values.
- Flat section bands with hairline dividers; no card-inside-card composition.
- Dense content uses two columns only when each can retain 320px; sparse
  content remains left aligned within about 720px.
- Visual acceptance requires opened screenshots at 1440, 1280, 768, and 390,
  populated state where applicable, plus explicit clipping and overflow checks.

Home season identity is also canonicalized for display as year / full program
identity / level. The display composer does not flatten the stored
school/nickname fields or alter stable season ids.
