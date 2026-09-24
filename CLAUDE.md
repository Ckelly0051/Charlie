# GridIron IQ — Operating Document

Browser + Windows-desktop football film analysis for coaches. Load game film,
mark plays, tag them, get stats, tendencies, cut-ups, call sheets, and game
plans. Formerly "Football Film Analyzer". The current working branch is
`claude/football-film-analyzer-GRiCW`; nothing depends on that name — CI runs on
`branches: ['**']` and no workflow or source path references it.

**Live URL:** https://ckelly0051.github.io/Charlie/
**Reports global strip — IMPLEMENTED (`160533c`), PACKAGED IN `1.12.0-95` AND
`1.12.0-97`, NOT SMOKE-APPROVED:** `design-comps/reports-global-strip-2026-09-22.html`
defines one fixed top-level strip on all eight Our Program Reports tabs,
Season last, with Current game as the default where a scope choice exists and
the game linescore only on Overview. Its scope and production mapping are in
`design-comps/reports-global-strip-2026-09-22/RATIONALE.md`. The comp's
abbreviated tables are
placeholders; the full production boards are unchanged below the strip. The
same commit repairs the `1.12.0-94` outer-frame and Players jersey/name
findings. Browser evidence on the canonical season is green
(`e2e-reports-global-strip`). The `1.12.0-95`, `1.12.0-97` and `1.12.0-98` installers
contain it; neither an installed smoke nor the registry has accepted it. See `docs/OPEN-DEFECTS.md`.
**Reports secondary bar — IMPLEMENTED (`0e84464`, 2026-09-23), PACKAGED IN
`1.12.0-97` AND `1.12.0-98`, NOT SMOKE-APPROVED:** `design-comps/reports-secondary-nav-2026-09-23`
(implementation record in its RATIONALE). One shared bar under the strip on
the seven multi-section reports; Offense six pages, Defense four; the game KPI
rail deleted; a compact Overview score; the Defense board says `Explosive
Plays`. Coach Reports smoke Findings 1 and 2 are repaired; see
`docs/OPEN-DEFECTS.md`.
**Reports down-and-distance chart — IMPLEMENTED (`80941c7`, `cd0fb40`,
2026-09-23), PACKAGED IN `1.12.0-97` AND `1.12.0-98`, NOT SMOKE-APPROVED:** item 7
of the same comp, first on Offense > Situations and Defense > Situations.
**Reports module system — IMPLEMENTED (2026-09-24), PACKAGED IN `1.12.0-98`, NOT
SMOKE-APPROVED:** the `1.12.0-97` installed smoke stopped at finding S97-1 (the
Offense pages carried unrelated treatments); at the coach's direction every
Reports board except Overview now uses the Defense module system (see the
Offense section and `docs/OPEN-DEFECTS.md`). Full gate at `5f208e1` 126/126.
**Never import `preact/compat`.** The secondary bar's first `createPortal`
came from it, and importing compat rewrites `onChange` to `onInput` on every
text and date input in the app, so change-committed fields (charting yardage,
the Special Teams and penalty editors, Study date ranges and Plan fields)
committed per keystroke. Repaired in `87371cd` with a core-Preact portal. The
never-smoked `1.12.0-96` installer carries the defect and is superseded.
**Breakdown update — IMPLEMENTED IN SOURCE (2026-09-24), NOT PACKAGED, NOT
SMOKE-APPROVED:** the installed `Could not save that choice` was a full WebView2
localStorage (version history filled Chromium's 5 MB quota); version history now
lives in the catalog `versions` table on disk (IndexedDB in a browser) with a
verified once-only migration, and `TagLibrary` reports its write errors. Film
Room is video first (table below by default, `Beside`, resizable, `Reset`,
persisted); the chart deck is tighter with independent Play Call / Play Type
folds. The installed library fix is NOT approved. Record and installed checks:
`docs/OPEN-DEFECTS.md` > Breakdown. The later Film Room work (per-unit
column sets, the play sheet, the shown-plays summary) ran the full gate at
`28fb35a`: 129/130, the one red being the `e2e-tag-library-storage` fixture,
not the product; fixed test-only in `8c2ea1a`. **The full gate then ran at
`c1f6cc1` (source identical to `8c2ea1a`): 130/130, 0 skipped, 0 failed** —
the green base the Break Down rebuild starts from. **Coach decision 2026-09-24: no `1.12.0-99` installer and
no smoke of this batch** — Break Down is about to be rebuilt, so smoking the
current structure is wasted. The installed checks (settings save on a full
profile, the once-only version-history move) carry into the rebuild's
installer.
**BREAK DOWN REBUILD — NEXT (coach direction 2026-09-24).** The approved
layout stays; the structure changes. Today the route is five Preact roots (the
theater, play rail, Film Room controls, charting deck and Film Room grid)
mounted into boxes that `breakdown-workspace.js` writes as HTML, arranged by
CSS grid and kept in step through `PlayTagger` events — which is why every
layout move this week needed a new host and new wiring. The rebuild makes the
route one owner of its layout and view state, with the existing domain APIs
unchanged.
**Version history never goes back into localStorage** — it is what starved
every settings write; `VersionManager` stores only through the storage backend.
**`CatalogPersistence` has ONE writer at a time.** Every mutation exports the
whole shared db, so two unserialized writers let an earlier, slower write land
last and erase a later one that had already reported success (Codex repro: two
concurrent `saveVersion` calls with the first write held; the reopened catalog
held only the first). `_exclusive()` queues each mutation's snapshot, change,
disk write and rollback, so a rollback undoes only its own change. **A version
restore replaces nothing unless its `Backup before restore` save point is
durable.**
**Main-checkout version:** `1.12.0-98` (`js/app.js` `APP_VERSION`,
`src-tauri/Cargo.toml`, `src-tauri/Cargo.lock`, `src-tauri/tauri.conf.json` —
all four must match; `e2e-p0-exit` asserts it). **The latest installer is
`1.12.0-98`**, the Reports smoke candidate, built from the clean main checkout
at `6821f07` (the committed four-owner bump on top of `b963e66`; the full gate
at `5f208e1` was 126/126, and the only later code is the test-only
`b30a9c2`). Its installed coach smoke is **pending**; see `SMOKE-1.12.0-98.md`.
It is not an installed approval, tag, push or published release.
**Earlier Reports installers:** `1.12.0-97` (`2799be5`) was smoked until
finding S97-1 and is superseded; its remaining checks carry into
`SMOKE-1.12.0-98.md`. `1.12.0-96` (`21f5688`; secondary bar only, with the
`preact/compat` input regression) and `1.12.0-95` (`8b926a6`; global strip)
were never smoked.

**Preceding installer:** `1.12.0-94`, built from `81fe261` in a clean detached
worktree with a local, uncommitted version bump. Its installed coach smoke was
in progress and produced the findings recorded in `SMOKE-1.12.0-94.md` and
`docs/OPEN-DEFECTS.md`; it received no complete installed verdict.

**Prior packaging status:** `1.12.0-93` is an unsigned Home and Breakdown repair
candidate; installed acceptance is pending. The scoped repair is `a93b38e`, the four-owner
version bump is `3c6f34d`, and the NSIS installer was built from a clean
worktree at that exact revision. See `SMOKE-1.12.0-93.md` for the package hash,
focused checks and installed smoke still required. It carries the season setup,
typography, team-identity, defensive-front library and penalty Auto D&D repairs;
none was in the installed `1.12.0-92` build. A later coach screenshot exposed
that its Defense Edit library buttons are still stranded at the far edge. The
post-package source correction places them beside their labels and is not in
`1.12.0-93`. Penalty Auto D&D uses the charted
ending spot for counted dead-ball fouls and the previous spot for no-play fouls;
counted live-ball fouls and unresolved fourth-down possession changes stay blank
for coach correction. Charlie approved the `1.12.0-92` Home visual composition,
but that install's smoke was partial; see `SMOKE-1.12.0-92.md`. Home production
remains formally `REJECTED`. Not tagged, pushed or published.

`1.12.0-91` was the preceding unsigned, **smoke-approved** beta build, packaged from `df9d5f7` (the bump is `894576d`) with the canonical
gate at 120/120, zero skipped, zero failed, and `e2e-p0-exit` re-run after the
bump. See `SMOKE-1.12.0-91.md`. It exists to re-smoke the two `1.12.0-90` REVISE
verdicts — Players phase composition with deliberate row capacities, and the
Defense cohort labels, whose arithmetic was reconciled as correct and is
unchanged — and Codex reviewed `fb85610..43b8c99` with no findings.
**The coach approved the installed smoke on 2026-09-21**, which CLOSES both
REVISE verdicts and confirms the Special Teams provisional pass.

**That approval is bounded, and the bounds matter.** It covers the Players
composition, the Defense cohort presentation and Special Teams on the installed
build. It does NOT move `design-approvals/APPROVALS.json`, where every Reports
manifest still reads `productionStatus: REJECTED` — a registry change is a
separate step with its own hash-verified evidence. The Home manifest now uses
the documented `REJECTED` state so the audit can check all surfaces.
**Home production remains formally
`REJECTED`** and was not in scope. Overview, Offense, Self-Scout, Season and
Matchup keep their existing status. Not tagged, pushed or published.
`cargo tauri build` exits 1 after producing both bundles, on the updater signing
step, because `TAURI_SIGNING_PRIVATE_KEY` is unset — the standing condition of
every unsigned beta package here.

`1.12.0-90` was the preceding unsigned smoke candidate, packaged from `1a42282`
(bumped in `aff2dd4`) with the canonical gate at 120/120. See
`SMOKE-1.12.0-90.md`. It carried the **Reports > Special Teams acceptance pass**
and **Reports > Players Revision 2**. **Its installed smoke ran on 2026-09-20 and
is NOT approved:** Players REVISE for composition, Defense REVISE for cohort
presentation with its arithmetic passing, Special Teams a provisional pass that
remains valid. Those repairs are in `1.12.0-91`, not in that installer.

`1.12.0-89` was the preceding unsigned smoke candidate, packaged from `95310d6`
(bumped in `b09f7de`) with the canonical gate at 120/120. See
`SMOKE-1.12.0-89.md`. It carries every Defense Revision 2 repair made after
`1.12.0-88` — defensive field position read from the charted unit, opponent drive
attribution, and defensive success and touchdowns allowed read from the scoring
side. Its installed smoke has not been run either. It is a separate checkpoint
and `1.12.0-90` does not supersede its smoke: that candidate's own installed
checks are still outstanding, and `1.12.0-90` contains the same code plus the two
later passes.

`1.12.0-88` was the preceding unsigned, smoke-approved beta build,
packaged from `3438fc9` (the bump on top of `1b684da`) with the canonical gate
at 119/119, zero skipped, zero failed. See `SMOKE-1.12.0-88.md`. **It exists for
one reason: the `1.12.0-87` installed smoke DISPROVED BD-VP**, and it carries
exactly one change over that package — the second BD-VP repair (`dd5202e`) and
its documentation (`1b684da`). The first attempt set `scrollbar-width:thin`
beside `::-webkit-scrollbar-button{display:none}`, which Chromium discards along
with every other `::-webkit-scrollbar-*` rule on that element, so the arrow
suppression was dead on arrival; and it reserved a `scrollbar-gutter`, which
sizes to the ENVIRONMENT and so built a different content box per runtime rather
than preventing the overflow. Both are gone, the deck now reflows instead of
reserving width, and its spacing is corrected to one 12px inset.
**No Chromium harness can confirm the rendered half** — this build is the only
way to know. **The coach approved the installed smoke on 2026-09-16; BD-VP is
CLOSED for beta use.** No additional viewport/DPI matrix is claimed. Not tagged, pushed or
published; Home production remains formally `REJECTED`.

`1.12.0-87` was the preceding unsigned smoke candidate,
packaged from `398e1d6` (the bump on top of `6651195`) with the canonical gate
at 119/119, zero skipped, zero failed. See `SMOKE-1.12.0-87.md`. It carries the
PL/BD batch, reviewed by Codex over `56e75f1..6651195` with no findings
outstanding: PL-1 the dead play-library Add controls, PL-2 `Option` as a
built-in offensive play, BD-VP Breakdown scrollbar-layout parity, and BD-CTX the
context-selector surface. **That installed smoke DISPROVED BD-VP** - Breakdown
still showed floating scrollbar arrow controls and a horizontal track in the
charting deck, and the deck spacing had regressed. BD-VP is REOPENED in
`docs/OPEN-DEFECTS.md` and repaired again on top of this package, with its
rendered half subsequently approved in the `1.12.0-88` installed smoke on
2026-09-16; PL-1, PL-2 and BD-CTX stand.
Not tagged, pushed or published; Home production remains
formally `REJECTED`. Two items from the batch are deliberately absent and
recorded in `docs/OPEN-DEFECTS.md`: `Option` is not added to Overview's approved
fixed six play types or the Defense board's approved seven production rows,
because resizing an approved board is a coach decision; and Home season-rail
scaling stays a separate layout pass.

`1.12.0-86` was the preceding unsigned smoke candidate, packaged from `b08d89c`
with the gate at 117/117. It carried Repair Batch 1 and FILM-01, and its
installed smoke PASSED on 2026-09-15 and is accepted for continued beta use -
linked-folder equality, durable uncharted clip removal across close/reopen, and
loaded delete/Undo with the restored play, clip and selection aligned. The
intermittent rapid-scrubbing `Film missing` report could not be reproduced there
and is tabled rather than closed. See `SMOKE-1.12.0-86.md`.

`1.12.0-85` was the preceding unsigned installed beta build, packaged from
`130962a` — the opponent-scout ownership model and atomic Home navigation,
reviewed and approved over `2c90b66..c2e088a` with the canonical gate at 114/114,
zero skipped, zero failed. See `SMOKE-1.12.0-85.md`. The coach approved that
installed checkpoint for continued beta use on 2026-09-14, with three deferred
visual findings — Breakdown viewport overflow and anonymous scrollbar arrows,
context-selector contrast, and Home rail truncation. `1.12.0-86` addressed none
of them; `1.12.0-87` addresses the first two (BD-VP, BD-CTX) and leaves Home rail
truncation open as a separate layout pass. It is not tagged, pushed or published.

`1.12.0-84` was the preceding unsigned local smoke candidate,
packaged from the version bump on top of `501e263`. It is the FIRST package
carrying the roster-ownership work: one roster owner per season with a single
validated compatibility boundary, conflicts and failed migration writes aborting
the open/import/restore instead of exposing half-migrated state, Add Game with no
film-source/perspective selector, a refused open preserving the outgoing season's
pending game-delete Undo, and managed-film deletion scoped to the deleted game's
own season id. Its full canonical gate is green (113 harnesses, 113 green, zero
skipped, zero failed) and `e2e-p0-exit` was re-run after the bump. The coach's
installed smoke was not run against that version; its historical package alone
established no acceptance. The later installed `1.12.0-85` checkpoint was
approved for continued beta use. Neither was tagged, pushed or published, and
Home's formal production status remains `REJECTED`.
See `SMOKE-1.12.0-84.md`, `SMOKE-1.12.0-83.md` and `docs/OPEN-DEFECTS.md`.

`1.12.0-83` was the preceding unsigned visual-smoke candidate, packaged from
`9ab20d5` to replace the rejected `1.12.0-82` Season Library composition with the
approved-comp structure: aggregate program band, operational season rows, and
latest-season/film-health context.

**A PROGRAM SEASON IS THE PARENT HOME CONTEXT, and every opponent scout belongs
to exactly one of them** through a durable `programSeasonId` on the scout's
season body and library row. `Our Program` and `Opponent Scout` are two VIEWS of
that one parent, so the switch changes a view, never a season.

- **`WorkspaceContext` is the sole owner** of the parent id and the workspace
  mode, persisted together under `giq_home_parent`. Nothing else caches either.
  The mode is derived where it can be — a scout can only be open in Opponent
  Scout — and a passive re-render may adopt the parent but never restate the
  mode of an open program season, or it would undo the switch that caused it.
- **The toggle is ONE state change and ONE render.** Entering Opponent Scout
  keeps the parent program season OPEN and renders its own scoped opponent
  library (Home's `browsingScoutLibrary` body state). It does not call
  `closeSeason()` or `_openLibrary()`, and it never auto-opens a scout — the
  coach selects one. Returning to Our Program opens a season only when the open
  document is a scout, and then by that scout's exact `programSeasonId`.
- **Scout lists are parent-scoped.** `lastOpened` may ORDER scouts inside an
  already-correct parent and can never determine ownership.
- **Legacy inference is read-only and unique-match only:** exactly one program
  season sharing `teamId + year + level`. Zero or several leaves the scout
  UNASSIGNED, intact and visible.
- **Unassigned and dangling scouts are surfaced, never attached.** A scout with
  no parent (first launch, or an ambiguous legacy record) and one whose stored
  parent no longer resolves both appear in Home's `Needs a program season`
  section with an explicit season selector. Assignment writes only after the
  coach confirms, through `SeasonStore.assignScoutParent()` — the canonical
  boundary, inside the per-season write queue and the PC-4 revision fence, which
  also updates the live object when that scout is open so a later ordinary save
  cannot restore the stale parent. A failed write leaves the scout unassigned
  and says so. Reassigning an already-valid parent is deliberately out of scope.
- **A valid parent is a REAL PROGRAM SEASON**, defined once in
  `WorkspaceContext.isProgramSeasonRecord()`: not a scout, not the sample season
  (by `kind` or `isDemo`), not blank, not missing. The sample is disposable and
  regenerable while reassignment is deferred and a parent owning scouts cannot be
  deleted, so adopting it would trap opponent film under a throwaway season. The
  rule applies to `isValidParent()`, both adopt paths, legacy inference,
  persisted-parent validation, assignment, scout creation and parent-scoped
  listing. Opening the sample establishes no parent; creating a scout from sample
  context fails closed and writes nothing; an existing scout naming a demo
  surfaces as unassigned with its stored id and data untouched. An open SCOUT
  does not block creating another scout — only the sample does.
- **The active team bounds both sides.** A team switch clears the parent
  atomically, persisted context is validated against the active team on every
  load, and assignment resolves the SCOUT as well as the parent from that team.
- **Unassigned rows are keyed and their selection is scoped per scout.** Unkeyed
  rows with uncontrolled selects let Preact reuse a departed row's DOM node, so a
  season chosen for an assigned scout could be submitted through the next
  scout's handler. Keyed rows, id-scoped selection and an in-flight lock keep a
  newly exposed row blank and a stale value unsubmittable.
- **A program season that owns scouts cannot be deleted.** The command blocks
  with the owned scouts named; nothing cascades and no scouting data is lost.

**Retired 2026-09-14:** the claim that each workspace "restores the most recently
opened season of its own kind" using `lastOpened`. That redirect — set mode,
search the team by kind and recency, open the winner, re-render — is the
Scout / library / unrelated-season bounce the coach reported, and `lastOpened` is
not ownership. Do not reintroduce `_workspaceTarget()` or an `_openLibrary()`
call inside a workspace toggle.

Empty Opponent Scout is also an operational Home library state. It renders the
shared summary band, the opponent/season/source-game/play/film table structure,
and one create/status panel. Exactly one create action must be visible and
reachable in the initial viewport at every release width. The desktop table
must retain real row and column-header semantics; rail and main-body empty copy
must remain distinct. Do not replace this state with a generic centered empty
card, duplicate the create action, use magic offsets to fake column alignment,
or populate it with invented opponent data. Workspace selection is fail-closed:
if the current season cannot save or the destination cannot load, restore the
prior mode, season, and shell pressed state rather than navigating on stale data.

This file is current state only. The complete dated history through 2026-09-02
— every milestone, review, repair, smoke, and incident — is preserved verbatim
in **`docs/archive/CLAUDE-HISTORY-THROUGH-2026-09-02.md`**. Read the archive
when you need the *why* behind a rule below, or the record of how a defect was
found. Do not re-litigate a closed finding from it.

**Product direction** lives in `GRIDIRON-IQ-PLAN-V2.md`, not here.
**Testing tiers** live in `docs/TESTING.md`.
**Documentation authority and open defects** live in
`docs/DOCUMENTATION-INDEX.md` and `docs/OPEN-DEFECTS.md`.

---

## Build

`index.html` → **Vite** → `dist/` → **Tauri**. That is the only build.

```bash
npm run build          # vite build -> dist/
npm run dev            # vite dev server
```

- `tauri.conf.json` sets `frontendDist: "../dist"` and
  `beforeBuildCommand: "npm run build"`, so `cargo tauri build` builds the
  frontend itself.
- **`build.sh` and `football-film-analyzer.html` are deleted.** There is no
  single-file bundle and no second build path. Any doc, comment, or memory
  describing one is stale.
- `#giLegacyEngineHost` and `#wsClassicOutlet` are **deleted**. Native Preact
  routes are the only coach-facing presentation owners. Some comments still
  name those ids to explain why a current fallback or single-owner writer
  exists; that is history, not live structure.
- Tests never load a bundle path. They resolve the app through
  `tools/app-entry.mjs`, which serves `dist/` over loopback HTTP (Chromium
  blocks Vite's split module/CSS assets over `file://`).
- **Build and test in one command.** The environment bumps source mtimes
  between steps, so a separate build then test can false-fail the parity
  stale-bundle guard.

Web deploy is the `gh-pages` branch, which receives a verbatim copy of `dist/`
(clear the branch first — Vite asset names are content-hashed, so orphaned
`dist/assets/*` must not linger). Desktop releases are cut by pushing a `v*`
tag; keep the `-N` suffix, because `configureBetaDefaults` gates on `/-\d+$/`
to seed `ffa_sql_catalog` on a fresh profile.

---

## Current owners

Change behavior at its owner, not at a consumer.

| Area | Owner |
|---|---|
| Shell, routes, chrome, context bar | `js/workspace-shell.js` |
| Home route | `js/home-screen.js` + `js/native-home.jsx` + `css/native-home.css` |
| Season operations and dialogs | `js/team-hub-screen.js` + reusable forms in `js/native-team-hub.jsx` |
| Team + season registry | `js/team-registry.js` |
| Break Down route | `js/breakdown-workspace.js` |
| Film theater / transport / play strip | `js/breakdown-theater-screen.js` + `js/native-breakdown-theater.jsx` |
| Charting deck | `js/native-tagging-screen.js` + `js/native-tagging.jsx` |
| Film Room grid | `js/native-film-room-screen.js` (model + edit semantics in `js/play-grid.js`) |
| Study | `js/study-screen.js` + `js/native-study.jsx` |
| Reports | `js/reports-screen.js` + `js/native-report-tabs.jsx` |
| Plan | `js/plan-screen.js` + `js/native-plan.jsx` |
| Settings | `js/settings-screen.js` + `js/native-settings.jsx` |
| Game create/edit | `js/game-screen.js` — derives `perspective`/`gameType` from the owning season; the form asks for neither |
| Overlays (dialog/sheet/toast/popover) | `js/native-overlay-service.js` — see `GRIDIRON-IQ-OVERLAY-SPEC.md` |
| Season model + persistence | `js/season-store.js` |
| Live ↔ store bridge, film load | `js/storage.js` |
| Storage seam (browser vs Tauri) | `js/storage-backend.js` |
| Canonical desktop catalog | `js/sql-catalog.js` + `js/catalog-persistence.js` |
| Playback across routes | `js/film-navigation-service.js` |
| Analytics formulas | `js/stats-engine.js` |
| Metric/dimension registry | `js/analytics-registry.js`, `js/analytics-metrics.js`, `js/study-query.js` |
| Tag projection (read-time) | `js/tag-projection.js` |
| Penalties / Special Teams models | `js/penalty-model.js`, `js/special-teams.js` |

Football contracts, each canonical for its area:
`GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
`GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PLAY-CALL-MODEL.md`,
`GRIDIRON-IQ-WORKSPACE-CONTRACT.md`, `GRIDIRON-IQ-OVERLAY-SPEC.md`.

---

## Binding data rules

These are invariants, not preferences. Every one is enforced in current source.

**Coach data**
- Never migrate, clear, or rewrite known-bad data. Cleanup requires an impact
  report naming the exact affected count and explicit confirmation immediately
  before the write.
- Never delete managed film on the coach's behalf without that same explicit
  confirmation.
- Legacy data is read through compatibility projection, not rewritten.
  `tag-projection.js` is read-time only and never mutates.

**Roster ownership**
- A roster belongs to ONE season. That season's games share it. Different teams,
  years, levels and seasons are independent. Modern game records store no roster
  of their own, and nothing in the app writes one.
- **`_normalize` never infers ownership.** It only coerces `season.roster`.
  Promotion from a legacy `games[].roster` happens at ONE compatibility
  boundary — `SeasonStore.adoptLegacyRoster()` — called by the durable read
  (`_hydrate()`, behind `load()` and `openSeason()`), `adopt()` and
  `restoreBackup()`. It reads only the season's own game nodes, so no comparison
  or move can cross a season boundary. Before this, recovery ran inside
  `_normalize` on every load, restore and import, so a deliberately emptied
  season re-acquired its old players. The fallback was MOVED, not deleted: old
  single-game saves and pre-season-model backups still convert.
- **Opening a legacy season DOES run the boundary, on purpose.** Such a season
  is opened rather than imported, so without it the roster would simply vanish.
  What is forbidden is repeated *inference*, not conversion. State it that way;
  do not write "ordinary loading never infers ownership" as though an open were
  exempt.
- **Promotion is VALIDATED, never guessed.** Every non-empty legacy copy in the
  season is compared through `SeasonStore.rosterIdentity()` — key order,
  whitespace and row order normalized, no player value rewritten — and a roster
  is promoted only when all copies agree. Taking the first non-empty copy is the
  defect this replaced.
- **A disagreement ABORTS THE OPERATION — the season does not open.** No copy is
  chosen, no copy is removed, nothing is written, and the season is never exposed
  as the editable current season. `openSeason()` returns null and restores the
  prior `currentSeasonId`, the prior `data` and the backend current-season
  pointer; `openSeasonById()` returns false without running
  `_afterSeasonLoaded()`, so the season the coach already had open keeps its live
  roster, active game and undo history. The outgoing season's pending deleted
  film is purged only after a successful open; a refused open leaves its purge
  timer and working Undo action intact. `adopt()` returns
  `{ok:false, data:null, conflict}` before staging or persisting. `restoreBackup()`
  runs the boundary BEFORE its safety snapshot and returns null, so a refused
  restore writes nothing and the backup keeps its own bytes. `TeamHubScreen.
  openSeason()` and the shell's season picker fail closed on the false return
  rather than navigating. A later open reconsiders the season, so a resolved one
  still converts.
- **Exposing a conflicted season was itself destructive**, on a path no single
  open could show: `_hydrate` returned `_normalize(original)`, which coerced a
  synthetic `season.roster: []` beside the surviving conflicting copies; the next
  ordinary save persisted that synthetic roster; and the open after that read it
  as an EXPLICIT season roster and deleted every conflicting copy. Never make
  conflict state editable, and never let `_normalize` see a conflicted payload.
- **The coach-facing message names the season and its games and stops there.**
  It offers no remediation step, because no current screen can reconcile per-game
  rosters — an instruction the app cannot honor is worse than none. The import
  path reports that message rather than "could not be saved", which would
  misreport disagreeing rosters as a storage failure.
- **One owner, enforced.** A settled conversion deletes `roster` from EVERY game
  node — including a season whose own roster already won over stale copies.
  Modern game records never write the field. `updateActiveGame()` carries a
  surviving legacy copy forward the way it carries `filmMode`, because
  `_serialize()` produces none and the first ordinary save after a conflicted
  open otherwise destroyed the active game's only copy.
- **The migration is DURABLE and once-only.** `_hydrate()` detects and converts
  before hydration, writes a `Before roster migration` restore point, persists
  `season.roster`, `rosterOwnership: 'season'` and the removal through the normal
  revision-fenced per-season write queue, and only then exposes the season. **A
  failed write blocks the open exactly like a conflict** — the target's durable
  bytes are untouched, the prior season stays active, and the failure is reported
  through the shared persist-failure seam, so the next open retries the whole
  migration. A season nothing changed on dispatches no write at all, so a settled
  season neither converts twice nor mints a revision the PC-4 fence reads as a
  commit.
- **The marker asserts BOTH halves** — the season owns the roster AND **no game
  object has its own `roster` property at all**, `roster: []` included. Gating on
  `roster.length` degraded that to "no non-empty one", and a later writer filling
  the surviving array would recreate dual ownership under a marker asserting it
  could not exist. `_normalize` refuses to stamp a season any of whose games still
  carries the property.
- **Attribution reads the selected season's roster.** `SeasonManager.
  _mergeRoster()` takes `season.roster` (plus the live roster, which is that
  same season's as the coach edits it) instead of merging `games[].roster` across
  the Our Program cohort — which makes the opponent-scout exclusion structural
  rather than a hand-written filter.
- The 2026-09-13 coach-authorized data normalization, its identity proof, the
  catalog/mirror divergence and its backup hashes are in
  `docs/ROSTER-NORMALIZATION-2026-09-13.md`. `tools/audit-roster-ownership.mjs`
  is read-only; `tools/normalize-roster-ownership.mjs` writes only behind
  `--apply`, only after verifying identity from stable game ids.

**A drive belongs to a possession, not to a number.** Each team runs its own
drive sequence, so a drive identity is possession SIDE plus drive number.
`football-rules.js` owns it once — `drivePossessionSide()`,
`groupPlaysByDrive()`, `driveLabel()` — and Breakdown's play strip, the theater
chyron and Study's `drive` dimension all consume that owner, so the surfaces
cannot disagree. Grouping on the raw `driveNumber` tag put our Drive 1 and the
opponent's Drive 1 in one group. Labels are `Our Drive 1` / `Opponent Drive 1`
on a program season and `Offense Drive 1` / `Defense Drive 1` on a scout season
and in Study, which aggregates across seasons and so cannot claim a perspective.
**Possession is read from the charted unit ONLY.** Legacy `stType` carries no
perspective and field position carries no proven owner, so a special-teams snap
has no side: it joins the surrounding drive of the same number rather than
splitting it, and it can never merge two known sides. A blank legacy unit keeps
the plain `Drive N` — analytics default a blank to offense for cohort
membership, but relabeling an all-legacy game `Our Drive N` would assert
possession nobody charted. `StatsEngine._reconstructDrives` is separate logic
for reports and is unchanged.

**Extra points are authored ONLY under `Try` and `Defending a Try`.** The unit
formerly labeled `Field Goal / XP` is `Field Goal`, and no route can store
`attemptType:'extraPoint'` on it: the `Attempt` selector, the screen's
`attempt` action key and the charting service's `stAttempt` writer are all
DELETED, not narrowed. `unit:'fieldGoal'` is always "the subject attempting"
(`SpecialTeamsModel.ROLES`), so an opponent extra point charted there scored for
us — the try units encode the attempting side and credit subject and opponent
correctly. A new field-goal event is seeded `fieldGoal` from the one owner,
`SpecialTeamsModel.defaultAttemptType(unit)`, so nothing has to be chosen and
the seed is not treated as charted detail by the change-unit warning. **Read
compatibility is a contract:** `normalize` still accepts
`unit:'fieldGoal', attemptType:'extraPoint'`, such a record still scores its one
point through every report, and no historical data is rewritten. The retired
`Scored by Us/Them` control stays retired.

**ONE owner for the charting vocabulary, and `Option` is a built-in.**
`TagLibrary.DEFINITIONS` owns every library-managed field's defaults; a screen
that carries its own copy is how a new built-in reaches the deck and never
reaches the grid or the cut-up filter. Two had drifted and now read the owner:
`native-tagging`'s OPTIONS fallback, and `native-settings`' cut-up FILTERS, which
was already missing `Trick Play`. **The optional workflows count too**: the
vision analyzer kept its own enum AND its own validator, so a valid response
naming a new built-in was SILENTLY DISCARDED — its `ALLOWED.playType` now derives
from the owner and its prompt enum is generated from that same list, so the two
cannot disagree. Quick Chart and the global charting shortcuts each need a key
for every built-in (`Option` is `B`), and the coach-facing legend must list it;
`e2e-play-library` pins all of that, because "one owner" is only true if every
consumer actually reads it. `Option` is a default offensive play type,
distinct from `RPO` by football meaning — an option is a post-snap ball-carrier
decision, an RPO a pass-or-run read — and consistent with it in behaviour:
AMBIGUOUS for run/pass (`PlayTagger.runPassForPlayType`) and NOT in
`EXCLUSIVE_GROUPS.playType`, so `Option + Run Outside` charts the call and the
realized look together. **A new default needs a version migration**: a stored
`enabled` array was written before the value existed, so `_normalize` filters it
out and the choice would be hidden for every existing team. `TagLibrary.VERSION`
is 4 and pushes it into `enabled`, visibility only, never a stored tag — the same
shape the version-2 formation additions used. It is deliberately NOT added to
`OVERVIEW_PLAY_TYPES` or the Defense board's seven production rows: those are
approved fixed schemas, and resizing one is the coach's decision.

**A non-modal sheet must retarget, never swallow.** `SettingsScreen.open()`
returned the live sheet's promise when one was already open, discarding the
requested tab, chart group and typed play-call name — which made the charting
deck's `Edit library` and the play-call field's `Add to Playbook` do nothing at
all, and say nothing. It retargets instead. Child panels consume
`chartGroup`/`initialPlayCall` in `useState` INITIALIZERS, so a retarget nonce is
part of the child key and remounts that panel with the new initial target.

**CHROMIUM CANNOT VERIFY SCROLLBAR CHROME AT ALL. BD-VP passed installed smoke
in `1.12.0-88` on 2026-09-16.** The first
BD-VP repair was disproved by the `1.12.0-87` installed smoke while every
Chromium check stayed green. Headless Chromium renders overlay scrollbars
unconditionally - a probe with `::-webkit-scrollbar{width:40px}` measures a 0px
gutter, and `--disable-features=OverlayScrollbar,FluentOverlayScrollbar,
FluentScrollbar` does not change it - so no harness here can render, measure or
fail on a scrollbar arrow or a horizontal track. Never claim a scrollbar repair
on Chromium evidence; pin the CONDITIONS instead and say the rendered half is
unverified until an installed smoke runs.

**`scrollbar-width` and `scrollbar-color` SUPPRESS every `::-webkit-scrollbar-*`
rule on that element.** Setting `scrollbar-width:thin` beside
`::-webkit-scrollbar-button{display:none}` is exactly what made the arrow
suppression dead on arrival. No Breakdown pane sets either property - the webkit
rules are the sole authority and `e2e-breakdown-viewport` pins their absence.

**`scrollbar-gutter:stable` is banned in Breakdown.** It reserves the
ENVIRONMENT's scrollbar width - 0 under overlay, ~17px under classic - so it
builds a different content box per runtime, which is the "fits in the harness,
overflows on the installed build" mechanism rather than a defense against it.
Every deck row must REFLOW instead: no chip row may be pinned `flex-wrap:nowrap`
and no deck control may carry a hard `min-width` floor. **The play filmstrip is
the one exempt horizontal scroller**, by name, because wide content scrolling
inside its own container is the contract; its cards are scrolled, not clipped.

**The charting deck has ONE 12px inset.** Section headers, labels, chip rows,
inputs and the Edit Library actions all start there and nothing crosses it on
either side; the collapse caret is right-aligned. The group's 3px accent border
is absorbed by the padding rather than pushing content right, and a nested
action row adds no inset of its own.

**Add Game asks for no analytics perspective.** The selector labeled `Film
source` is deleted, not renamed. It wrote `perspective`, and its
`Opponent film · Scout` option made a PROGRAM season produce a scout game —
which `SeasonManager._selfGames()` excludes, so the game silently left our
record, yardage, success rate and turnover margin. Program versus Opponent
Scout derives from the owning season in `GameScreen.save()`, which also drops
any `perspective` arriving with the form values; a create seeds the existing
`offense` default and an edit omits the field so `_applyGameInfoDraft`
preserves what the game already stores. The charting unit stays Break Down's,
and it already derives the play perspective from that unit. Film linking stays
in the per-game film workflow; this form carries no file, folder, storage-mode,
perspective or initial-unit control.

**Season isolation**
- A season is the unit of work; each is its own file/row. `SeasonStore.data` is
  null until a season is opened.
- `commitActive()` refuses to write when the live tagger does not match
  `_loadedGameId` — a stale commit must never stamp one game onto another.
- Undo/redo history resets on every game load, not only on season load.
- Season transitions cancel pending saves (`_cancelPendingSaves`) and pin the
  season id inside every debounced callback.
- Durable writes are queued per season (`drainWrites`) and fenced by a
  monotonic `data.revision`; a stale write must never land after a newer one.

**Per-unit field invariants**
- `SeasonStore.ST_ALIGNMENT_KEYS` is the single source of truth for fields a
  Special Teams play may not hold. It is enforced at **two** barriers: the live
  object (`PlayTagger._emit`) and every serialization path
  (`_stripStAlignmentBeforeSave`). Adding a field to a carry list without adding
  it to the strip list reproduces the bug that once coded every ST play "Under
  Center".
- `migratePlayFormation` runs only when a play genuinely lacks the `backfield`
  property. That guard protects a real custom formation value (`Power-I`) from
  being rewritten.
- Left/Right on `strength`, `playDir`, and `hash` are always read from the
  **offense's** perspective, on every play regardless of unit, so they aggregate
  correctly across units. There is no stored perspective flag and no auto-flip.

**Film identity**
- Durable identity is `clipPath` / `clipRefs` / `catalogClipId` — never a bare
  basename. `planClipMatch` is the one matcher (catalog id → exact path →
  basename → Windows `(n)` → order) shared by every relink path.
- **A LINKED game's clip set must EQUAL its folder's videos.** Both directions
  are reported, with different states so the coach is told which way they
  differ: a clip the game records and the folder lacks is `missing`
  (`clip-set-app-only`); a folder video the game has no record of, alone or
  beside a missing one, is `mismatch` / `Film does not match folder`
  (`clip-set-folder-only`, `clip-set-both`) and carries an `extra` count. Only
  the app-only direction was ever checked, so a video sitting in the folder
  with no record was invisible. **Managed film keeps its one-way rule** — that
  directory is app-owned storage, not a folder the coach maintains. Every
  surface consumes the one result: Home's row, the selected-game fact, the
  Settings film table (which must NAME the state, or it silently reads
  "No film") and the library aggregate, where a mismatched game is not linked.
- **The durable clip index never shrinks, and only a deliberate deletion
  removes an identity.** It seeds from the game's own `clipRefs`, then the
  plays, then the live playlist. Seeding from plays + playlist alone meant
  opening a game WITHOUT its film left the playlist empty and the next save
  pruned every clip that had no play — a silent record loss on ordinary
  navigation. An intentional in-app deletion signals
  `StorageManager.forgetClipIdentity`, recorded by the two deletion paths
  (`PlaylistManager.removeClip`, and `PlayTagger.deleteCurrentPlay`'s
  no-playlist branch, which is the one that covers deleting with film
  unloaded). A recorded removal applies ONLY when no surviving play references
  the clip, so a shared clip survives one of its plays and Undo restores both.
  The set is per game, reset in `_loadActiveGame` like undo history, so a
  removal never follows a reused clip id into another season. Nothing here
  touches a coach-owned file: an externally deleted video stays a visible
  mismatch until the coach removes the app record.
- **The removal signal schedules its own save, and a removed clip is stashed
  rather than destroyed.** Two halves that a green first pass missed. A clip
  with no play emits no `play-deleted`, so it rode no autosave and closing the
  app resurrected the record — `forgetClipIdentity` now calls `_autoSave()`
  itself (`rememberClipIdentity` is its symmetric undo), which is what makes
  the orphaned-record case this repair exists for actually durable. And
  `HistoryManager` snapshots plays only — a `File` and an object URL cannot
  round-trip through JSON — so a play-backed removal keeps its clip in
  `PlaylistManager._undoClips` and `_reconcileUndoClips` re-inserts it on
  `plays-loaded`, the event Undo and Redo already emit. That reconcile is
  scoped to clips this manager removed, because a game load emits the same
  event; `reset()` clears the stash first. An uncharted removal is permanent
  by design and offers no Undo. `objectUrl` is a recreatable cache, not
  playability: `_releaseObjectUrlsExcept` revokes it for non-adjacent clips
  and `_sourceForClip` rebuilds it from `clip.file`.
- **The selection after an Undo is History's, not the playlist's.**
  `switchToClip` selects whatever clip it loads, so a reconcile that switched
  to the clip left active by the deletion overwrote the `currentPlayId`
  History had just restored — Undo returned the clip and then landed the coach
  on the next play. The reconcile prefers the restored play's own clip as its
  switch target so film and selection agree, and restores History's selection
  afterwards when the target has to be another clip. `_selectPlayNoSeek` is the
  one selection owner both paths call. Redo is different and correct: it
  restores the snapshot the deletion produced, whose selection is cleared, so
  the neighbouring clip's own play is the honest selection.
- The game film index is derived from the plays' own clip identities **unioned**
  with the live playlist (`_buildClipIndex`). It must never be rebuilt from the
  playlist alone, which is what once silently emptied it.
- Film loads are latest-wins (`_filmLoadSeq`): a superseded load aborts before
  any player mutation and emits no messaging about the outgoing game.
- Linked film is referenced in place and never copied. Library root and a game's
  own folder are separate scopes; changing one must never rewrite the other.
- Missing or moved film shows an actionable re-link state and never falls
  silently into copy mode.

**Recovery**
- Restore is reversible: a "Before restore" safety point is written first, and a
  failed canonical save rolls the live editor back.
- Recovery from the Documents mirror is explicit and confirmed
  (`scanRecoverableSeasons` previews, `recoverSeasonFromMirror` imports). It is
  never automatic just because app data looks empty.
- A failed durable write reports failure. Never report success for a write that
  did not land.

**Output safety**
- Escape coach-entered text at the **HTML sink**, not the producer — the same
  string also reaches `textContent` and `.title`, where pre-escaping
  double-encodes. `Charts._esc` is the escaper. Names and notes travel in
  importable seasons, so this is stored-XSS, not self-XSS.
- Analytics changes must pass parity (`e2e-parity`) and exact composite
  `gameId::playId` film-reference equality. Regenerate a golden only as a
  reviewed, audited correction called out in the diff — never to make a test
  pass.

---

## Binding presentation rules

**Product quality standard.** GridIron IQ is a consumer coaching product.
Functional correctness does not by itself make a screen acceptable — it must
also be legible, coherent, dense, and understandable without narration.
Typography, hierarchy, alignment, whitespace, contrast, responsive containment,
and first-viewport usefulness are acceptance criteria, not later polish.
Approved comps are binding composition contracts: a recolor, token swap, or
approximate layout does not satisfy one. Pretty and functional are one standard.

**The Charlie Gate.** Before expensive review, packaging, or release, show the
real app with representative real data at the agreed viewport and get
PASS / REVISE / REJECT. A green automated gate never substitutes for it.

**Design approval authority.** `design-approvals/APPROVALS.json` is the only
current index of approved design evidence. Follow its per-surface manifests to
the canonical comp, rationale and captures; never infer authority from a
filename, a nearby artifact, a commit message, or an older narrative section
of this file. `COMP_APPROVED`, `IMPLEMENTED_UNVERIFIED`,
`PRODUCTION_ACCEPTED`, `REJECTED` and `RELEASED` are different states. Never
write or accept the unqualified word "approved" for a presentation milestone.
Standalone HTML can reach `COMP_APPROVED`; only a populated real-app screen can
reach `PRODUCTION_ACCEPTED`. Run `node tools/audit-design-approvals.mjs` after
changing the registry or any canonical artifact. Canonical evidence must be
tracked, unique, present, and hash-identical to the approval record.

**Canonical Reports data authority.** Every Reports production comparison,
visual capture, Charlie Gate, and release decision uses a read-only copy of the
registered `2025-st-joseph-mavericks-jv` season (`2025 St. Joseph Mavericks -
JV`) from the Documents mirror. The per-surface manifest remains composition
authority; this real season is data authority. Existing approved comps captured
with QA data remain valid for composition, but new production evidence must use
the real season. Synthetic fixtures may test deterministic formulas, sparse and
empty states, and adversarial edges, but they are supplemental only: they cannot
establish Reports visual parity, football correctness,
`IMPLEMENTED_UNVERIFIED`, `PRODUCTION_ACCEPTED`, or `RELEASED`. Never disguise a
synthetic fixture with the canonical season's name. A Reports evidence handoff
must state the season id/name, actual game and play counts, selected game/scope,
and whether the source was copied read-only. Missing canonical data fails closed
on the designated review machine. CI may explicitly skip it, but that run cannot
certify Reports acceptance. Never write normalization or test changes back to
the coach's source file.

**Reports dashboards are static compositions.** For every Reports surface, the
registered approved comp is the schema: it fixes the modules, their order, each
module's row or tile count, and the board geometry at each supported layout.
Real data fills those slots but never adds rows, removes modules, or resizes the
board. A short cohort renders the surface's approved absence treatment (`-`,
`No data`, or blank only where that comp explicitly chooses it); a long cohort
is deterministically ranked and capped. When a variable list is valuable, name
the cap honestly, such as `Top 10 Plays`. Keep these constants in one named
surface owner and pin every module count in both synthetic sparse/overflow tests
and canonical-season captures. Do not solve a data mismatch by stretching rows,
shrinking type, or inventing explanatory prose.

**Reports name the cohort they measure.** Two cohorts run through every Reports
surface and they are not interchangeable. The **charted** cohort is every snap
the coach charted. The **classified** cohort is the subset carrying a
`playType` or `runPass`, which is what `StatsEngine.compute()` narrows to and
what every production measure is computed over. On the canonical Week 5 game
those are 83 and 64. A count must state which one it is: Overview's Total plays
is the charted count with the classified count as its qualifier, and the HTML
exports say `N of M plays classified`. `stats.allPlays` keeps its existing
meaning — the classified count — because `e2e-parity` serializes compute()'s
output; the charted count and the phase counts ride beside it as
**non-enumerable** `stats.chartedPlays` and `stats.phaseCounts`, the same
pattern `orderedPlays` already uses.

**`_ddPretty` owns down-and-distance wording, and Reports say `Turnovers`.**
`Short` / `Medium` / `Long` are `_distBucket`'s internal bucket names; a coach
reads the yardage, so `StatsEngine.DIST_LABELS` maps them to `1-3` / `4-6` /
`7+` inside `_ddPretty`. Reports > Defense already showed those labels but
patched the string at three call sites, which is exactly why every other
surface printed `1st & Long`. Those `.replace` chains are deleted. A film cut
carries the raw `1|Long` key, never the display label, so resolution is
unaffected. `Giveaways` is gone from every Reports surface and export; the
engine's `isGiveaway` / `turnovers.giveaways` field names are correct domain
vocabulary and stay.

**Twelve fixed down-and-distance rows.** Self-Scout's `downDistRows` returned
only the buckets a cohort observed, volume-sorted and sliced to fifteen, so
Week 5 rendered eight rows in frequency order and the situations the offense
never faced vanished. `_selfScoutDownDistanceRows` renders all twelve in
football order. An unfaced bucket is HELD — `held: true`, `-` in every measured
cell, and no film affordance — never a fabricated `0`.

**A phase is counted from the snap, never by subtraction.** Overview derived
Snaps by phase's Special Teams row as `allPlays - offense - defense` over the
classified cohort, so a game with 13 special-teams snaps reported 1 — the lone
XP that happens to carry a play type — and Week 2 reported 0 against 8. The
three rows are counted from `tags.unit` over the complete charted cohort and
sum to it. Yards per play stays on the classified production cohort, because a
yards-per-play over an unclassified snap states nothing.

**Current visual release truth (2026-09-11).** `1.12.0-70` is the last accepted
installed smoke candidate. `1.12.0-80` is a focused local visual-smoke handoff
and is not accepted release state. `1.12.0-74` remains `REJECTED`: its Reports production
does not faithfully preserve the individually approved report compositions,
and its installed Home presentation was reported visually off. Any older
section below describing a Reports implementation as complete, approved, or
gate-verified is implementation history, not current production acceptance.
The approved design evidence remains protected; production must be repaired to
match it rather than asking the coach to repeat the design process.

**Copy.** Literal, concise, operational. State the object, current state, or
available action. No conversational reassurance, rationale, promises,
second-person narration, or implementation/data-safety language in routine
headings, labels, helper text, or empty states. Prefer the product noun over
`our`/`your`. Supporting copy only when it supplies information needed for the
next decision. US English throughout, including comments and commits.

**Interaction states.** Every enabled interactive element provides distinct
rest, hover, applicable active/selected, and keyboard `:focus-visible` states,
without changing layout dimensions. Covers navigation, tabs, filters, links,
dropdown triggers, icon-only buttons, card actions, and command buttons.
Missing hover/focus feedback is a defect. The full standard is
`GRIDIRON-IQ-PLAN-V2.md` §3C.

**Density and layout.** Density comes from geometry and padding, never from
shrinking type below the floor. Chips are ≥30px tall on desktop and ≥44px on
coarse pointers. No page-level horizontal overflow at any release width
(1440×900, 1280×800, 768×1024, 390×844). Wide content scrolls inside its own
container.

**Typography.** One readable UI/body family for operational copy; reserve
condensed and display faces for true headings and major KPI values. Faces are
bundled (IBM Plex Sans / Sans Condensed / Mono) so rendering never depends on
the host OS. `:root` is dark (`--bg-primary: #1b1f27`, `--text: #e2e8f0`), and
`--display` derives from `--gi-cond`.

**Theme variables are global.** A `:root` palette edit is an app-wide edit.
Anything surface-specific belongs on that surface's selector. Re-scoping a
variable does **not** repaint descendants that already inherited a computed
`color` — set the property explicitly.

**Neutral UI chrome is TRUE GREY, across the whole ladder.** Every near-neutral
surface and ink step is neutral: `--gi-film`, `--gi-1` through `--gi-8`,
`--gi-11`, `--gi-12`, `--gi-on-solid`, and the broadcast family the Reports
boards actually paint with — `--gi-bd-stage`, `--gi-bd-panel`,
`--gi-bd-control`, `--gi-bd-control-active`, `--gi-bd-line`, `--gi-bd-bone`,
`--gi-bd-draw`, `--gi-bd-muted`, `--gi-bd-strong`. The first neutralisation pass
moved only `--gi-2`..`--gi-8` and `--gi-11`, leaving the app background at +9
blue and the broadcast family as high as +27, which is why the app still read
blue after the pass meant to fix it: neutralise the whole ladder or none of it.
Each value holds its predecessor's relative luminance, so no contrast ratio
moved — only the hue. Blue, cyan and gold stay reserved for their named accent
and football semantics; do not reintroduce a blue cast into neutral panels,
controls, structural borders, metadata, status copy or subdued labels.

The complete coach-approved contract, including exact desktop navigation
dimensions, selector behavior, typography floors and dashboard composition,
lives in `docs/VISUAL-SYSTEM-RULES.md`. Do not replace it with a partial
surface-local interpretation.

**Primary route navigation.** Desktop route targets are long, readable
navigation labels on transparent shell chrome, not small filled tabs. They use
the shell's dominant operational type so route names are among the largest copy
on the working screen, never caption-sized utilities. The
current route is communicated by primary copy plus the gold route underline;
mobile uses the same unfilled selection treatment at its top edge. Select
controls should spend available horizontal room rather than clipping their
current value into compact prototype widths.

**The Program / Season / Game selectors are controls, not labels.** One neutral
graphite surface, declared in the shell's own `:root` token block
(`--ws-ctx-surface` / `-hover` / `-open` / `--ws-ctx-edge`) and applied at the
shared context-bar owner, so every route that renders the bar gets it — never a
per-route patch. Measured: the bar and the selectors differed by 1.25:1, which
reads as a label. **The border draws the boundary**, and it must clear 3:1
against the bar; the chosen step measures 4.1:1, and the step below it measured
2.86 and was rejected. The open state never uses the blue-tinted selected-surface
role and keeps the gold underline as its marker. Widths, typography, caret
treatment and route hierarchy are fixed by the approved composition and do not
move to solve contrast.

**Film is never obstructed.** No control, overlay, border, or transform may
cover or resample the media surface.

**Automated geometry checks are not visual approval.** Inspect populated
screenshots with real data. Zero overflow with unreadable content still fails.

---

## Accepted baseline and current status

Home was accepted and packaged in the `1.12.0-70` Windows x64 Beta smoke
candidate (`SMOKE-1.12.0-70.md`). That release snapshot remains accepted, but
current Home production is `REJECTED` after the `1.12.0-74` installed visual
smoke and has not regained production acceptance. Plan V2 lanes V2-A through
V2-H remain functionally complete; current presentation and defect status is
governed separately by the approval registry and `docs/OPEN-DEFECTS.md`.

Home's accepted composition: the approved comp governs first launch, the
season-library/no-open-season state, and a populated open season. The rail is
**two permanent panes** — Program Seasons and Opponent Scouts, always both
visible, neither collapsing, each owning its own bounded scroller — bounded by
the route frame so every fixed tool stays reachable without scrolling the game
grid. Games are ordered chronologically oldest-first by date, with a valid
numeric week only as a same-date tiebreaker. `data-season-id` is the stable
rendered interaction hook on rail rows.

**HOME CONSOLIDATION IMPLEMENTED - PENDING COACH SMOKE (2026-09-12).** First
use, no season, empty season, populated season, Season Library, and Opponent
Scout now render through `HomeScreen` / `native-home.jsx`. `WorkspaceShell` no
longer creates or mounts a Team Hub route host. `TeamHubScreen` remains the
service and focused-dialog owner, while the shell-level `Our Program / Opponent
Scout` selector is the only rendered workspace switch. The game grid uses
230-280px tracks so additional desktop width adds scannable columns instead of
inflating video previews. Production remains `REJECTED` until coach review.

**SEASON LIBRARY COMPOSITION REPAIRED - PENDING COACH SMOKE (2026-09-13).**
The no-open-season state now uses a full-width program summary, Home-owned season
rows, and latest-season/film-health context rather than repacking `SeasonRow` into
a sparse card grid.
TeamHubScreen still owns create/open/delete/recovery and film-health behavior.
Focused Home proof asserts Home-owned rows, no borrowed Team Hub row markup, the
summary panel, usable desktop row width, and no overflow at 1920/1440/1280.

**Home's film-health contract is season-scoped, and that is now implemented.**
`WorkspaceContext.filmHealth(game, seasonId)` carries the owning season to
`StorageBackend.listFilmFiles(gameId, seasonId)`, which builds
`seasons/{seasonId}/films/{gameId}` from that id; every result states the
`season` it is about, and `TeamHubScreen._aggregateFilm(games, seasonId)` is the
one season-scoped result Home and the library both consume. A peeked non-active
season may not inherit `backend.currentId`. The aggregate label is always an
explicit count (`6 of 6 games linked`, `5 of 6 games linked`, `No film linked`,
`No games yet`) — a settled season may never rest on the transient
`Checking film…`, which one linked game beside one game with no film added used
to produce. Only a genuinely in-flight check is `checking`, and **an in-flight
operation is itself identified by season AND game** — keyed by game id alone, a
save in the open season made every other season reusing that id report
`Checking film…` over its own settled count. `WorkspaceContext.operationKey`
owns that key, the season is captured when the operation STARTS (film writes
land under the season open at that moment), every producer threads it, and
clearing without a season deliberately sweeps every season's entry for that
game: a stale operation would pin a season on a transient label forever.
**`Film needs attention` is reserved for film that cannot be COUNTED** — an
unavailable linked folder, failed listing, or rejected health lookup. A linked game missing one clip
sets `action: 'reconnect'` too, so gating on that action swallowed the count on
the coach's own season; a partial season prints `N of M games linked`.

**The 2025 JV mismatch is explained: the current recorded-set result is `5 of 6
games linked` (2026-09-15).** All six games are LINKED under `D:\Football\Film`.
OL Lakes (`OLL 13-13`) records 89 clip identities against 88 files; `IMG_6690`
exists nowhere under `D:\Football`, and no surviving play references its filename
or stable catalog id. It is an orphaned durable playlist entry, not missing film
for a surviving charted play. No coach data was changed.
`e2e-film-health-realdata` binds the presentation to those real sources,
read-only, and cannot certify Tauri's own filesystem calls — that stays an
installed check. The current OL Lakes body has 82 surviving plays and 89 durable
playlist entries; `IMG_6690` has no surviving play. The repaired **FILM-01**
contract is: linked film is healthy only when the app's durable clip set and the
folder's video set are exactly equal. Either app-only or folder-only identities
produce a mismatch; equal sets produce no error. In-app deletion must durably
remove unreferenced clip identities without deleting coach-owned source files,
including when film is unloaded, and preserve Undo. Load must not silently prune
either side. The `1.12.0-86` installed smoke passed this contract on 2026-09-15.
The separate intermittent rapid-scrubbing failure is recorded but deprioritized.
Every Home/library renderer must consume one resolver and print an explicit
season result. Regression coverage must use two seasons with reused game IDs.
Managed-film deletion follows the same identity rule: `deleteFilm(gameId,
seasonId)` must receive the deleted game's stored season ID and may not resolve
its path from whichever season the backend currently points at.
The full decision and defect detail is in `GRIDIRON-IQ-PLAN-V2.md` and
`docs/OPEN-DEFECTS.md`. Home remains `REJECTED`; this record is not approval to
change the manifest or canonical evidence before coach review.

**No test-only production API.** The legacy global bridge, which published 30
engine classes onto `globalThis` so harnesses could reach them, is deleted. A
test now imports the owning module directly when the logic is DOM-free, or goes
through a live controller/service (`window.app.<service>.constructor`) when the
page is genuinely required. Nothing may reintroduce it under another name:
`e2e-p0-exit` pins the absence in source and `tools/audit-shell-deps.mjs` proves
at runtime that no engine class resolves as a global — by class identity, not by
name, since `StorageManager` collides with a real DOM interface.

**CSS ownership is enforced, not merely asserted.** Every stylesheet is
reachable from the Vite graph (7 linked from `index.html`, 15 imported through
the module graph), and `e2e-css-ownership` proves on every run that no selector
branch in `css/styles.css` or `css/redesign-stats.css` requires an identifier
production cannot produce, and that no positive `:is()` / `:where()` / `:has()`
list carries an alternative that can never match. `:not()` remains an exclusion,
not a producer requirement. The model is `tools/css-ownership.mjs`.

**A producer is not a mention.** The distinction is the whole point, and getting
it wrong is what let a first attempt at this cleanup declare completion while
785 dead branches remained. Producers are `class`/`className` attributes,
producing `classList` operations, `className` assignment,
`setAttribute('class', …)`, and the static parts of template literals in those
positions — including class
attributes inside emitted HTML strings, which is how the print/export paths
count. Readers are not producers: `querySelector('.stats-overlay')` reads a
class and never creates one. Comments are not producers either, and in this repo
they are often documentation that the thing is *gone* — `.top-bar` survived a
sweep on sixteen occurrences, every one a comment recording its deletion.
Ownership is never decided from runtime coverage, which cannot see empty, error,
or responsive states.

Only two things are retained without a literal producer: a class reached through
a template fragment ending in `-` before an interpolation (`` `tone-${row.tone}` ``),
whose suffix is unknowable, and ids. A brace-balanced reader is required for
`class={…}`, because a JSX class expression contains its own `}` via `${…}` and
a non-greedy match silently loses every class after the first interpolation.

`e2e-design-system` is 17/0: the Settings active-tab elevation is the shared
`--gi-raise-tab` token, and `--gi-library-inset` is a declared instance-scoped
property backed by a real `style.setProperty` setter.

---

**Reports > Offense is implemented as a static composition and gate-verified,
but NOT coach accepted.** Built to the approved comp
(`design-comps/reports-offense-2026-09-03`) across `dc93429`, then rebuilt to
the static-dashboard rule on 2026-09-08. The implementation decision record is
`design-comps/reports-offense-production-2026-09-08/RATIONALE.md`; the comp's
own RATIONALE sits inside the hash-verified canonical artifact and is unedited.
No Charlie Gate, so it is not accepted state.

**Its modules were CONDITIONAL, which is the defect that rebuild closed.** A
sparse game rendered a different board from a charted one: `Play calls`,
`Concepts`, `Calls by situation`, `Core tendencies`, `Tendency matrix`,
`Team profile`, `Expected points added`, both Zone 5 shape bands and
`Visualizations` could each vanish. Every module now holds its slot and states
`Insufficient charted data`, and every ranked list holds its approved
allocation — nothing was capped before, so `Core tendencies` rendered 11 rows
on Week 1 and `Calls by situation` 40 on an over-cap cohort. `OFFENSE_ROWS`,
`OFFENSE_EPA_ROWS` and `OFFENSE_MODULES` in `js/native-report-tabs.jsx` are the
one named owner for every count. `Core tendencies · Big N` prints N from the
rows it RENDERS, not from `to90`. The coach-approved density revision caps the
three Zone 2 table bands at five meaningful rows and spends the recovered height
on a fixed seven-cell **Drive outcomes** strip. **Direction vs Strength** is a
four-row module directly below Core tendencies; **Down & Distance** and **Field
Position** each hold four rows in Calls by situation. Zone 2 and Zone 4 were re-paired to the comp's
bands, and `gi-off-b2` (8fr/4fr) / `gi-off-b2e` (6fr/6fr) put them on the
documented 12-column rhythm.

The fourth Direction vs Strength row reads **Balanced strength** in Offense and
the Study tendency pivot. The shared extractor, fixed row set, and exact-film
cut use that one label; only the coach-facing wording changed. The canonical
2025 JV Offense test confirms its five Week 5 snaps and film cut at 1440 and
1280 before the next installed smoke.

Zone 2's Formation and Play Type tables now use their fixed band completely:
Formation holds five rows, and a fixed **Formation × Play Type** matrix occupies
the lower two-column span with the top three formations by the top five play
types. Cells show play count and success rate; volume controls fill intensity.
Play-action spans the same two rows in the right column. Sparse axes hold dashes;
data never changes the 3 x 5 footprint.

**Presence alone is not a static board.** The first pass capped but never
padded, so module presence was fixed while every module stayed content-sized
and the same 1440 board measured 5102..5478px across six games. `fitRows`
returns EXACTLY the allocation — truncating a long cohort and PADDING a short
one with held rows that carry the dash in every column; `mapFit` formats real
rows before padding so a held slot never reaches a `.toFixed`. **The board is
now one fixed 4413px height at both desktop release widths, identical on all
six canonical games, with 29 of 29 modules one height.** The first fixed-height
repair standardized an oversized 5617px board; the density repair restored the
comp's compact Field heat map, removed only surplus row box height while
retaining 12px table labels, and capped the EPA trend chart. The advanced visual
row is now split evenly between **Cumulative EPA** and a zero-centered **EPA
contribution by play type** chart; the detailed tables remain below it.
Offense module-header and zone-header explanatory glosses are suppressed; the
headers, measurements, column labels, and data-bearing KPI sublines remain.

A held row and `Insufficient charted data` are different statements and cannot
both hold: the comp's own sparse capture is 415px shorter than its populated
one. Stable geometry wins, so tabular modules hold their rows and the
module-level line survives only where there is no row structure — `SparseModule`
is no longer used by this tab. **`Top 5 Tendencies`** — retitled from
`Tendency matrix`, because it renders the five most frequent row values and
deterministically drops the rest, so the cap is named the way `Top 10 Plays`
is — reserves a fixed panel (378px, 410px since the 2026-09-24 module-system
title bar) instead, because its column dimension is chosen at
runtime and cannot be enumerated. Its ROW pitch is fixed at 54px so the five
approved rows always fit that panel: left to size themselves the rows reached
70px at full-season scope, five of them plus a 30px header needed 380px inside
a 316px wrap, `.tm-wrap`'s `overflow:auto` engaged, and the last row escaped
the module by 60px. Game scope was clean, which is exactly why a game-scoped
harness never saw it; `e2e-reports-offense-realdata` now exercises Season scope
at both release widths. The Offense bands are `align-items:stretch`, which required the
same sticky-`th` opt-out Overview, Players and Special Teams each needed.

**The `Visualizations` module is gone.** The comp's Zone 5 carries five modules
and no `Visualizations`, and it restated two approved modules in a second
format — its `Success by Field Zone` strip against `Success by field position`,
its `By Quarter` bars against Zone 4's `By quarter` — while its spray is the
field-position view `Field heat map` already owns. Two `e2e-native-reports`
assertions pinned its `.viz-*` selectors and are RETIRED, not weakened: an
assertion whose subject the design deliberately removed cannot be repointed
without changing what it claims. Production renders the comp's modules plus the
coach-approved Drive outcomes strip: 27 modules total.

**Zone 5 uses the approved compact Field heat map:** two fixed five-cell strips,
not the retired tabbed field explorer. Team Profile uses the comp's exact six
metrics in order: Yards / play, Success rate, Explosive rate, Negative rate,
3rd down, and Points / drive. The canonical 2025 JV season has no `playCall`
or `playConcept` values in any of its six games, so Play calls, Concepts and
Calls by situation honestly hold their static slots with dashes.

Its composition is six zones — Offensive identity, Calls and tendencies,
Structure and execution (renamed from `Structure and deployment`, smoke S98-2), Situational analysis, Field and production, Advanced
metrics — which since 2026-09-23 (`0e84464`, in `1.12.0-97`, installed smoke pending) are six
PAGES in the shared secondary bar (`Identity`, `Calls & tendencies`,
`Structure`, `Situations`, `Field & production`, `Advanced`), one on screen at a
time; the zone nav and zone rules are retired, every module renders on exactly
one page, and "one board height" is now one height per page on every game. The
layout runs over a **12-column rhythm**. Every band divides on a gridline the
six-column KPI band also uses (two-column bands run 8fr/4fr or 6fr/6fr,
three-column bands three 4fr tracks), because the generic band's 65.9% split
missed the KPI band's 66.7% by under a percent and read as a defect rather
than a design.

**THE OFFENSE PAGES USE THE DEFENSE MODULE SYSTEM (`77aea58`, 2026-09-24;
coach direction in the `1.12.0-97` smoke, finding S97-1; not packaged).** Cut
into pages, the long board's treatment — modules packed into bands on shared
1px rules, a left accent rail, 9.5px uppercase condensed micro-headers — read
as pasted pages with a different style each. Defense Revision 2's hierarchy
is the one system, in gold: a numbered page heading (`01 Offensive identity`
with the classified cohort), every module an outlined box on 20px gutters
with a 50px title bar (2px gold rule, 17px sentence-case title), Defense's KPI
strip, sentence-case tile, lens and sub-heading labels in the body face, and
12.5px sentence-case column labels on a header band. The Offense pane draws
no rail or ground; the down-and-distance chart takes the same title bar (gold
on Offense, cyan on Defense). The block is declared last in
`css/native-reports.css` and supersedes the band box-shadow rules; the 12-column
tracks are unchanged. Chart internals keep their own styles. Pinned by
`e2e-reports-offense` §14b. **Special Teams uses the same shared block**
(`272a62c`, coach direction 2026-09-24): numbered section headings, outlined
modules on 20px gutters, the 50px title bar, the KPI strip and unit ledger as
hairline-divided panels. Its accent is the neutral bone line, because Special
Teams has no assigned colour and gold or cyan would read as Offense or Defense;
pinned by `e2e-reports-special-teams` §9c. **Players, Self-Scout, Matchup and
Season followed** (`cba2f4c`, `cc3db88`, `b70b758`, `75673a2`, 2026-09-24): every
Reports board except Overview now uses the one system. Players and Self-Scout
modules keep their phase as the accent (Offense gold, Defense cyan); Matchup
and Season take the neutral line; each board's sample line is its heading's
cohort statement; Season adds a heading only to its own Overview and Trends,
because the boards it embeds bring theirs. Self-Scout's and Season's approved
14px module titles are now 17px. Pinned by `e2e-reports-module-system`. The Top 5 Tendencies reserved panel is 410px (it
was 378 before the taller title bar).

**Reports > Defense is REVISION 2 (2026-09-17), and its installed smoke PASSED
on 2026-09-21 (`1.12.0-91`).** Built from the coach-approved Revision 2 comp —
`defense.html` and its generator `build.mjs` in the coach's
`Football App/defense-revision-2` folder, whose rendered layout is the authority
where its RATIONALE prose describes an earlier iteration. The `1.12.0-90` smoke
passed its arithmetic and returned a REVISE on cohort presentation only; the
labels were added and the coach approved them in the `1.12.0-91` smoke, which
CLOSES that verdict. **The approval is the installed smoke, not a registry
state:** `design-approvals/reports/defense/manifest.json` still reads
`productionStatus: REJECTED` and the approval registry is unchanged. It replaces the 2026-09-09 four-tab board, which is gone:
no section tabs, no `DEFENSE_DASH_ROWS`, no `Top 6 formations`, no
`Attack direction`, no `Blitz vs No Blitz` cards.

**Owners.** `StatsEngine.defenseBoard(plays, { labels, seasonPlays, roster,
scope })` owns every value on the board and is built on `defenseDashboard()`,
whose output it carries unchanged as `board.dashboard`. `js/native-defense-board.jsx`
formats and lays out; it derives no football value. `css/native-defense-board.css`
owns the geometry. `ReportsScreen` passes the scoped cohort, the full-season
cohort, opponent labels (`gameInfo.opponent`) and the roster; Season > Defense
gets the same board from `SeasonManager.reportModel().defenseBoard`.

**Composition (pages since 2026-09-23, `0e84464`, in `1.12.0-97`; installed smoke pending).**
Four ordered sections — Defensive performance, Opponent offense, Scheme and
passing defense, Situational results — are four PAGES in the shared secondary
bar (`Performance`, `Opponent offense`, `Scheme & passing`, `Situations`), one
on screen at a time, each headed by its number, its title and
`N charted / M with Run/Pass charted`. The bar also holds the `Current game` /
`Full season` scope and Export report. The retired sticky scope/`JUMP TO` bar
and its Defense-only scrollport overrides are gone. Defensive performance opens
with ten KPIs in this order: Total yards allowed, Rush yards allowed, Pass
yards allowed, Yards / play, Takeaways, Explosive Plays, Touchdowns Allowed,
Defensive Touchdowns, 3rd Down Stop %, 4th Down Stop %. **On this board
"Allowed" is implied for explosive plays** (`Explosive Plays`, `Explosive Plays
Rate`; coach correction 2026-09-23, because it wrapped KPI tiles and headers);
the Defense export keeps `Allowed`. Game-by-game renders only at Full season.
The comp's standalone navigation, report-title block and footer line are not
reproduced. Export report prints the unchanged four-section dashboard export
from whichever page is open.

**MODULE GEOMETRY IS A CONTRACT.** A module is 96px of chrome (a 50px header, a
44px table header, two borders) plus rows at its pitch (38px; 48, 60 or 64 for
the long-label tables). Fixed-schema modules — Disruption, the comparison, By
down, By quarter, Performance by Play Direction, Run / Pass vs Strength, Blitz
Performance, Blitz Type Performance, High-leverage field position, By hash,
Passing Defense Summary — are exactly their rows tall, with no dash row and no
dead space. Every other module takes the smallest standard height (220 / 300 /
380 / 460) that holds its allocation; unused visible capacity renders as `-`
rows, and data beyond capacity scrolls inside the module under a sticky header
at its fixed external height. Half-width modules pair with the next unpaired
half-width module of EQUAL HEIGHT so both edges align; one with no partner
spans the row. Gutters are 20px. The canonical season's full inventory, order,
width and height for both scopes is pinned in `e2e-reports-defense-realdata`.

**TOUCHDOWNS HAVE TWO SIDES, and neither is inferred.** `Touchdowns Allowed`
counts defensive-snap touchdowns whose `StatsEngine.scoringSide` is `them`;
`Defensive Touchdowns` counts those whose side is `us`. Neither is derived from
takeaways, and a touchdown on a defensive snap is never assumed to be the
opponent's. Every `Touchdowns Allowed` column on the board — Game-by-game, By
quarter, Production by play type, High-leverage field position — uses the same
strict `them` rule. The dashboard's own `touchdowns` field counts every side that
is not `us`; it is unchanged because the export reads it, and this board does
not. Canonical: 2025 JV full season 7 allowed / 0 defensive; St. Peter Lutheran
0 / 0.

**A DEFENSIVE MEASURE ASKS WHETHER THE OPPONENT SUCCEEDED, NOT WHETHER SOMEONE
SCORED.** `isSuccessfulPlay` is framed for the team carrying the ball and counts
every touchdown as success, so a pick-six read as opponent production on every
surface built from `defensivePerformance()`: a red-zone pick-six from our own 10
reported `Red Zone TD Rate 100%`, one touchdown allowed and a 0% stop rate — the
same numbers an opponent touchdown produces. `StatsEngine.isOpponentSuccess()`
wraps the canonical rule and defers to `scoringSide` on a touchdown; a touchdown
whose side nobody charted is not assumed to be ours. `StatsEngine.
isTouchdownAllowed()` is the one touchdowns-allowed rule. Both are read by
`defensiveCohortMetrics` (whose stop rate passes the predicate into the shared
`AnalyticsMetrics` seam through `options.deps`, so no second stop-rate formula
exists), `defensivePerformance`'s third-down stop rate and red-zone touchdown
rate, `_defensiveStats`' front/coverage/blitz stop counts and its coverage
completions — a pick-six is an interception against that coverage, never a
completion allowed — `_defenseCallRows`' stops and touchdowns, and Self-Scout's
defensive stops, phase stop rates and touchdowns allowed. The offense-framed
predicate is unchanged, `compute()` output is unchanged, and the canonical season
moves nowhere because it has no defensive score.

That rule is relative to the DEFENSE BEING MEASURED, not permanently to `them`.
A native defensive snap measures their offense against our defense, while a
Matchup cross-read relabels our offensive snap as their defense and preserves
`__chartedUnit:'offense'`; our touchdown must therefore remain their touchdown
allowed. `scoringSide` and the defensive success/touchdown helpers read the
charted unit so relabeling a rep never reverses scoring ownership.

**Metric definitions.** `3rd Down Stop %` and `4th Down Stop %` are `100 -` the
existing allowed rates, one decimal, a dash with no attempts. `Takeaways` is the
dashboard's interceptions plus fumble recoveries. A pass ATTEMPT needs a charted
Gain, Touchdown, No Gain, Incomplete or Interception; a sack is never an attempt
and never enters Yds/att. Disruption counts sacks and interceptions over pass
snaps, run TFL (a negative-yardage RUN only) over run snaps, and fumble
recoveries and distinct disruptive plays over charted defensive snaps; a play
with two events is one distinct play. `1st Downs Allowed` and the dashboard's
3rd/4th allowed rates use `StatsEngine.isConversionAllowed`: a touchdown counts
only when the opponent scored it. **High-leverage field position is measured
from OUR goal line**, toward which the opponent attacks: inside our 20 is
`_absYardLine` 0-20, goal line 0-5, opponent backed up 90-100 (canonical season:
8 red-zone possessions, 6 touchdowns allowed). A structure row with nothing
Run/Pass-classified reports no explosive count (`—`), never `0`.

**FIELD POSITION HAS AN OWNER, AND IT IS THE UNIT THE COACH CHARTED.**
`_absYardLine` measures from the charting season's own goal line, so the offense
on the field approaches 100 on an offensive snap and 0 on a defensive one.
`StatsEngine.fieldPerspective()` decides which from `__chartedUnit` — the unit a
rep carried before Matchup relabeled it for its cross-read — falling back to
`tags.unit`; nothing is inferred from the yard line itself, and a Special Teams
snap keeps the offense-oriented reading because its unit encodes no possession.
`_defensiveFieldZone()` mirrors `_fieldZone`'s six bands for a defensive snap:
our 1-5 `Goal line`, 6-20 `Red zone`, 21-40 `Opp 40–20`, 41-60 `Midfield`, 61-89
`Own 11–39`, 90-100 `Backed up` — the same coach-facing band names, which on a
defensive report describe the opponent offense the report is about.
`fieldZoneOf()`, `_inRedZone()` and `_onGoalLine()` are the shared consumers, and
the offense-oriented `_fieldZone` is unchanged because its own consumers measure
the offense that owns the ball. Every defensive consumer reads the defensive
owner: the dashboard `zones` behind both the Field zone module and the export,
`defensivePerformance`'s Red Zone / Goal Line situations and red-zone touchdown
rate, Matchup's Red Zone situation, the Opponent Scout situational join, and the
board's high-leverage rows. Read from the offense's end the canonical season
reported Field zone `Backed Up` 11 / `Open Field` 110 / `Red Zone` 5 and no
`Goal Line` row; it is 2 / 94 / 26 / 4, and it reconciles with High-leverage
field position exactly. A fixture that charts a defensive red-zone rep at
`opp 8` is charting the opponent backed up on its own 8; three did, and they were
corrected.
Blitz Performance holds exactly Blitz vs Run, No Blitz vs Run, Blitz vs Pass and
No Blitz vs Pass (`isNoBlitz`, the same rule the blitz rate uses). Blitz Type
Performance holds exactly A-Gap through D-Gap. Run / Pass vs Strength holds
exactly Toward, Away from and Balanced strength, and a snap needs a charted
direction AND a charted strength to enter it. `Off succ` is the canonical
situation-aware success rule. Multi-select fronts, formations and blitzes can
count in more than one row and are never summed as a team total. Player tackles
are attributed contributions, not participation snaps; the table sorts by every
column by mouse, Enter or Space, and dash rows stay last.

**Drive outcomes are data-driven.** Opponent drive outcomes renders one row per
outcome the reconstruction produced, in football order — Touchdown, Field Goal,
Missed Field Goal, Punt, Turnover, Downs, Safety, Kneel, Other / unresolved —
and no row for an outcome that did not occur. A possession the charting cannot
settle stays `Other / unresolved` (`Unresolved` in Opponent possessions); nothing
is folded into another outcome. **Whose points a drive ended with is decided by
`scoringSide`, in ONE owner — `StatsEngine.opponentDriveList()` — which the board
and the EXPORT both consume**, because `_driveStats` is side-agnostic: our
pick-six or fumble return ends the opponent's drive as `Turnover` for 0 points
(unresolved when no takeaway is charted), and a safety keeps its outcome but
scores the opponent nothing. Drive reconstruction boundaries and every
offense-drive path are unchanged. Opponent possessions lists every reconstructed
drive, per game, in one fixed-height scrolling module. Its `Yards*` is the
drive's tagged yardage, penalties included, not classified production; `Last
snap` is where the last charted snap began, not the final spot; `Pts*` excludes
tries.

**Absence.** A measured zero prints `0`. A value with no denominator or no
required charting prints `—`. A `-` row is unused capacity, never data. A
zero-sample categorical row (play type, direction, pressure situation, zone,
hash, down and distance) is not rendered, and Front and Coverage performance are
not rendered when nothing was charted.

**EVERY MODULE NAMES THE COHORT IT MEASURES, IN COUNTS — approved in the
`1.12.0-91` installed smoke, 2026-09-21.** Four
valid cohorts run through this board and presenting them unlabelled is what made
correct arithmetic read as a contradiction in the `1.12.0-90` installed smoke:
the KPI strip measures the classified run/pass subset, Production by play type
measures that subset through MULTI-SELECT rows that overlap and cannot be summed,
Performance by Play Direction drops any snap with no charted direction, and
Opponent possessions take every charted snap with penalty movement included. Each
states its own cohort inside the existing header at the 12.5px floor:
`15 run/pass snaps`, `15 snaps · 18 tags`, `14 direction-tagged snaps`,
`20 snaps · penalties included`. **The tag count IS the overlap statement** — no
sentence says rows may overlap. Every count is computed from the rows it
describes; a hardcoded canonical value reds both the synthetic board and the
canonical season's second game. **No total, cohort or calculation changed.**

**RETIRED 2026-09-23 — the Defense-only sticky scrollport.** `.ws-reports`
scrolls while the report pane and `.gi-reports` are scroll containers that
never move, so a sticky element bound to them scrolls away; the Defense pane
used to opt out of both for its sticky jump bar. The jump bar is gone (pages in
the secondary bar replace it) and so are the overrides; the fact about the
scrollport still holds for any future sticky control.

**Widths.** The report body caps at 1680px and centers. KPI values must fit their tile: the production condensed face is wider
than the comp's Barlow, so tiles give back side padding below 1500px, the value
steps from 34px to 30px below 1420px, and the strip reflows to five a row below
1240px (the comp reflows at 1100px, which the wider face cannot hold). Below
1100px every module is full width; below 700px the KPIs are two a row and
tables scroll horizontally inside their own module. A half-width module's
metric headers give up 4px of side padding so `Touchdowns Allowed` never clips
at 1280. The explosive column reserves the word `Explosive` (80px, 72px in a
half module) so eleven-column tables do not clip it at 768. Every coach-facing
text element on the board is at or above the 12.5px floor; the sort glyph is
12.5px here.

Evidence: `tools/e2e-reports-defense-realdata.mjs` (canonical season, read-only
and hash-checked: all six games at 1440 and 1280, the pinned inventory and KPIs
for both scopes, chrome edges, the floor, the dashboard's existing data
contracts, the four pages in the secondary bar, a page-independent export, KPI
fit, captures of every page at 1920/1440/1280/390)
and `tools/e2e-reports-defense-board.mjs` (a synthetic season for what the
canonical one lacks: both touchdown sides, a takeaway without a touchdown, Safety
and Field Goal possessions, overflowing possessions, no front/coverage/play type,
sorting every player column). Current counts are in `docs/TESTING.md`.

**Defensive Total Yds is the sum of the two columns beside it.**
`defenseDashboard`'s `summarize` summed `yards` over EVERY defensive snap while
`runYards` and `passYards` summed the classified run and pass subsets, so the
three columns were never one cohort and the residual was invisible: OLL printed
132 above 72 + 55, Week 3 printed 130 above 120, and Week 6 printed 28 above 43
- components EXCEEDING the total, because five unclassified `Penalty + Loss`
snaps carried -15 yards between them. The season reconciled only by
coincidence (-5 + 0 + 10 + 5 + 5 - 15 = 0), which is why a green suite never
caught it. Penalty-only yardage is not offensive yards allowed; all three
columns come from the same classified run/pass cohort, taken as a union so a
snap tagged both could never count twice. **`ypp` divides by that same
cohort.** Left on every defensive snap it charged the reduced yardage against
the excluded penalty rows as though each were a zero-yard play, flattering the
defense: 497/174 = 2.9 against the honest 497/154 = 3.2. The approved 2.9 was a
value printed in a comp fixture, not an approved formula, and a rate whose two
halves describe different cohorts is not a measurement.

**TWO COHORTS, BOTH NAMED, NEITHER STANDING IN FOR THE OTHER.** `charted` is
every defensive snap in the cohort: the displayed `Snaps`, the frequency ranking
key, and every call and blitz percentage. `measured` is the run/pass-classified
subset: the denominator for total, rush and pass yards, yards per play and
explosives. `n` aliases `charted`, because `n` is what every consumer already
reads for a displayed count. With `measured === 0` every production field is
`null` and renders the dash — a charted look with nothing measured shows its real
charted count and no production, never `0`. Making the displayed count classified
was the mistake in between: a `Trade` motion charted once with no play type
printed `0 snaps`, a look the coach charted reported as one nobody ran. The export
states `40 charted · 37 with play type`; the Revision 2 board states the same two
numbers as `40 charted / 37 with Run/Pass charted` on every section.

**Reports > Special Teams is implemented, gate-verified, and its provisional
`1.12.0-90` smoke pass was CONFIRMED by the approved `1.12.0-91` installed smoke
on 2026-09-21** — the surface was unchanged between the two packages. Built to
the approved comp (`design-comps/reports-special-teams-2026-09-04`, whose
RATIONALE is the decision record and carries all eight coach rulings). **The
approval is the installed smoke, not a registry state:** its manifest still
reads `productionStatus: REJECTED`.

**SPECIAL TEAMS ACCEPTANCE PASS COMPLETE (2026-09-19); installed smoke
CONFIRMED 2026-09-21 (`1.12.0-91`).** The code checkpoint, coach review and
installed presentation smoke are complete. Formal registry acceptance remains
separate and the manifest still reads `productionStatus: REJECTED`. The board,
its navigation, units, modules, scopes, exports and film actions are unchanged.
What changed:

**A blocked punt is charted on the unit that fields one.** `puntReturn` is
displayed as `Punt Return / Block` and its outcome vocabulary gained `Blocked`;
the existing Possession and Score controls then carry ownership. There is NO
`puntBlock` unit, no schema value added, and no migration: the model, the report,
the scoring and the film refs already supported the state, and only the charting
vocabulary omitted it. `SpecialTeamsModel.UNIT_LABELS` is now the ONE owner of the
coach-facing unit names — the deck, the theater chyron, the Film Room grid, the
Study dimension and the Reports ledger each carried their own copy, which is how a
renamed unit reaches the deck and nothing else. A block recovered by the subject
and returned scores six for us, nothing for the opponent, and reports one punt
blocked, one punt-return touchdown and the exact `gameId::playId` reference
through the scoreboard, the report and the export; recovered by the opponent it
scores for them. **A LOOSE BALL HAS NO DEFAULT OWNER:** on `blocked`, `muffed`
or `recovered`, a touchdown with `recoveredBy` blank or `unknown` is attributed
to NEITHER team and its points land in the scoreboard's `unattributed` total.
The deck offers Possession on those outcomes without requiring it, so a blank is
an ordinary incomplete state, and it previously fell through to the
receiving-unit default and awarded us six points (Codex, 2026-09-20). A
`returned`, `downed` or `fairCatch` kick keeps its unit default.

**The unassigned disclosure is counted from film references, not arithmetic.**
`specialTeamsUnassigned` summed each module's count and subtracted, which
mis-stated a MIXED cohort — structured events beside legacy-only snaps, the shape
the coach's own screen showed. Two snaps the board reports under Tries were also
declared unit-less: an extra point stored on the field-goal unit
(`unit:'fieldGoal' + attemptType:'extraPoint'`, §4b.3, which `_conversionStats`
owns and `isFieldGoalAttempt` excludes) and a legacy `stType:'XP'` snap the
structured branch skips. Every module publishes its exact ref set, so the question
is now asked per snap. `specialTeams.tries` also counts the field-goal-shaped
extra points (`tryUnits` / `xpOnKickUnit` / `defending` state the parts), and the
try remainder is NAMED: a charted `Defending a Try` is the opponent's attempt, not
a try with "no scoring team tagged".

**Legacy snaps in a mixed cohort are still not inferred into units.** The
structured branch wins, a legacy-only snap joins no unit module, and the
disclosure states it. That is §8, not a defect.

**The board is at the 12.5px floor** — the second migrated board after Defense —
with literal labels (`Points for`/`against` became `For`/`Against`, matching the
Touchdowns tile; `FG Block` became `Field Goal Block`), section badges that name
what they count, and an absence anchored under its own header instead of floating
in a stretched panel. No module, metric, mobile work or global style changed.

**Scope decision this pass was bounded by (2026-09-19): limited acceptance pass,
not a rebuild.** Preserve the current navigation, unit separation, report
modules and analytics. The only new football capability is blocked-punt return
charting: keep the stored `puntReturn` unit, expose it as `Punt Return / Block`,
add `blocked` to that unit's outcome vocabulary, and reuse the existing recovery
and score fields. `Blocked` plus subject possession plus `Touchdown` must survive
save/reopen and agree across scoreboard, Reports, Players and exact film refs.
Do not introduce a `puntBlock` schema value. Audit the existing Special Teams
owners for scoring side, points, attempts, measured return cohorts, blocks,
touchdowns and null/zero handling, including the canonical 8 snaps / 4 assigned /
4 unassigned disclosure. The visual pass is constrained to literal labels, the
12.5px floor, compact fixed empty modules, a small set of standard module
heights, aligned paired edges and containment at 1440 and 1280. No new metric,
module, mobile redesign or global restyle is authorized.

Special Teams runs a **six-column rhythm** — its own number, because the model
defines six units. Six KPI tiles, a six-card **unit ledger** showing every unit
including the empty ones, and **five section surfaces** (All units / Kickoff &
Kick Return / Punt & Punt Return / Kicking game / Specialists). Kickoff stays
distinct from kick return and punt from punt return: each pair is co-located
for comparison, never merged. Its bands are `align-items:stretch`, which is
*not* the treatment Offense and Defense rejected — those bands paint their rule
colour as a background so a stretched short module showed a slab; this band's
background is transparent and its rules are box-shadows, so stretching paints
only the module's own panel and the rows keep their rhythm. **Since `272a62c`
(2026-09-24) the box-shadow rules are gone:** modules are outlined boxes on
20px gutters in the shared Defense module system (see the Offense section);
bands still stretch, so paired edges still align.

**One absence label: `No data`.** Everywhere, in every position. An earlier
pass drew three ("not charted", "not derivable — legacy charting", "not
derivable — no ruleset") plus a sentence per module; the coach removed all of
it, along with the legacy disclaimer band, the section definition footnotes,
and every descriptive meta. **A measured zero is not an absence** and keeps its
number with its denominator — 0% touchbacks on 21 kickoffs, 0 returns
attempted, a scoreless unit. An absent value drops to copy weight so it cannot
read as a headline figure, and a blank KPI drops its sub rather than printing
the same two words twice.

**Two engine corrections, both coach-approved 2026-09-04.**
`StatsEngine.isFieldGoalAttempt`/`isFieldGoalMade` are now the single canonical
Field Goal cohort that the team report and the kicker rollup both call:
`_individualStats` counted `stType:'XP'` as a field-goal attempt, which is why
the coach's season showed a kicker at 0/1 FG beside a unit reporting 0
attempts. An extra point is not a field goal. And the legacy punt net no longer
subtracts a flat 20 yards on a touchback — placement is ruleset-dependent, no
season configures one, and the structured branch never did it. Both are
mutation-verified in `e2e-reports-special-teams`.

**Coverage touchdowns are parity-pinned.** Commit `1931fff` added
`tdAllowed` and its exact film-reference cohort to both kickoff and punt
coverage. The analytics golden audit found only those additive fields: 24
primitive paths in the synthetic fixture and 56 in the local six-game fixture,
all `0` values paired with empty reference arrays because neither fixture
contains a coverage touchdown. No existing metric, drilldown, report value, or
film cohort changed.

**`tries.n` is a real count for legacy seasons.** Legacy charts tries as
`stType` `XP`/`2-Pt` (SPECIAL-TEAMS-MODEL §4b.1), so the old structural `null`
contradicted `conversions.xp.att` on the same cohort and swallowed
charted-but-unattributed tries. It is counted over the **same population** as
the snap count (`unit:'special'`); gating on `stType` alone picked up a try
charted outside the unit, made the units sum to exactly the snap count, and
masked the one play that genuinely belongs to no unit.

**The report shows only the exception, never the arithmetic.** A full
"74 snaps = 21 kickoff + …" line restated the ledger above it and is gone. What
survives is the one fact no ledger card can show: a snap belonging to no unit —
the coach's single legacy `Fake` play — rendered only when it exists.

**The dedicated Special Teams fields are authoritative on EVERY surface,
including the player rollups.** `_individualStats` read the generic
`tags.yardage` for punt distance and return yardage, which is the field the
team report deliberately does not read on an ST play - so the two surfaces
reported different numbers for the same plays. The canonical season charts no
`kickDistance` and no structured ST event at all, so Players derived punt
averages of 2.8 and 0.0 from blank generic yardage beside a team report
correctly reporting none; and it totalled 11 returns for 43 yards while the
team's Return Production, gated on `returnYards`, reported the single return
that carries it. Both read `kickDistance` and `returnYards` now. **The measured cohort is one
cohort, count included.** Players kept counting every return EVENT beside
measured yards and a measured average, so the board read 11 returns for 5 yards
at 5.0 above a team report stating one return - three numbers from two cohorts.
`Ret` is `measured`, the same count the team report shows; an unmeasured return
is still a special-teams snap and stays in the unit's snap count, but it is not
production. `measured` / `puntsMeasured` are the denominators. A measured zero
is unchanged and still renders at full strength.

**A Reports export prints its board's own schema.** The Self-Scout export ran
the twelve fixed down-and-distance rows through a plain column list, so a HELD
row printed a fabricated `0`, `0%` and `0% / 0%` under the engine's raw bucket
key `1|Short` - an unfaced situation reported as a measured failure in a
vocabulary no coach uses - and its defensive KPI band led with Stop Rate. The
export carries the held-row dash, calls `StatsEngine.ddPretty` (the static form
of `_ddPretty`, the one owner of this wording), and prints the board's KPI
order. `e2e-reports-self-scout` asserts against the produced HTML string.
**The shared HTML export is the Reports design system on paper, not a text
dump.** Every existing game, season, Defense, Special Teams, Self-Scout and
player export uses one white standalone document shell: square ruled modules,
gold KPI bands, cyan section rules, alternating table rows, aligned tabular
numbers and repeating table headers. Print media is landscape, preserves exact
colours and starts each report chapter on a new page. The export changes no
cohort or calculation. Game and season exports also carry the Offense board's
five visual reads from the engine's existing geometry: yardage distribution,
yards versus distance, field-position success, run/pass by down, and cumulative
EPA with play-type contribution. The Special Teams Units ledger lives inside
the Special Teams chapter so print pagination cannot orphan it from the
performance section. `e2e-native-reports` renders a generated fixture in a
fresh page and pins the browser and print contracts. The read-only
`e2e-reports-export-realdata` harness separately loads the canonical six-game,
449-play 2025 JV season, requires all five visual panels in game and season
exports, checks Special Teams chapter ownership, renders bounded PDF output,
and proves the source season bytes are unchanged. Set
`GIQ_REPORTS_EXPORT_SCREENSHOTS` for fixture captures or
`GIQ_REPORTS_EXPORT_REALDATA_SCREENSHOTS` for canonical game, season, and
Special Teams captures.
**PLAYERS COMPOSITION IS PHASE GROUPS — rejected as pairs in the `1.12.0-90`
installed smoke (2026-09-20), rebuilt, and APPROVED in the `1.12.0-91` installed
smoke on 2026-09-21.** Populated roles paired two at a time in
board order, which put Receiving beside Tackles — offense and defense in one
band — and let a one-row module sit as dead space beside a six-row one. Roles
group by PHASE: Offense (Rushing, Passing, Receiving), Defense (Tackles),
Special Teams (Return Game, Kicking / Punting), each contiguous and in that
order, two phase columns at desktop width and one below 1420px — the same
measured breakpoint the role tables already used, because a narrower column
cannot hold Passing's or Tackles' fixed table. Phase identity comes from the
composition and the existing per-phase module colour; **no explanatory copy is
added to say what a phase is.**

**A MODULE IS ITS ROW CAPACITY.** Each role declares `cap` — 3, 6 or 9, three
sizes only, each sized from the real canonical range (Passing 1-2, Kicking 0-2,
Receiving 0-6, Return Game 0-7, Rushing 3-9, Tackles 7-12). Passing is 3.
Unused slots render the shared HELD row — a dash in every column, never
interactive, never sorted above real data — so a sparse role is a correctly
sized module rather than dead space, and a module is never stretched to a
neighbour's natural height. A cohort past capacity keeps every row and scrolls
inside the module body while the module header and the column header stay put.
Sorting and scope changes move no module height, because capacity owns the
geometry and the cohort does not.

**The module body is the ONLY scrollport on this board.** `.gi-table-wrap` kept
its own `overflow-x:auto`, so it was a scroll container too and a sticky `th`
resolved against the box that never scrolls — the column header rode up with the
rows instead of staying. Both axes belong to `.gi-player-body`, and the column
header is deliberately sticky at ITS `top:0`, which is the correction of the
route-wide `th{top:42px}` rather than the opt-out Revision 1 carried.

**Reports > Players is REVISION 2, and its installed smoke PASSED on 2026-09-21
(`1.12.0-91`).** Its code checkpoint was reviewed by Codex over
`5471cb9..790e192` and again over `fb85610..43b8c99`, both with no findings; its
composition took a REVISE in the `1.12.0-90` installed smoke and was rebuilt as
phase groups, which the coach approved. **The approval is the installed smoke,
not a registry state:** `design-approvals/reports/players/manifest.json` still
reads `productionStatus: REJECTED`, and moving it is a separate, evidenced
step. The approved six-role leaderboard is intact — same roles, stat
definitions, scopes, sorting, absence semantics and column geometry. The
Revision 2 decision record is `docs/REPORTS-PLAYERS-REVISION-2.md`, outside
the hash-protected Revision 1 comp directory. Revision 2 adds analysis on top
of it, using only fields already
charted. Checkpoint evidence: `e2e-reports-players` 223/223,
`e2e-native-reports` 99/99, and `e2e-parity` 2/2 with both cohorts green,
including the local `mavericks-6game` golden Codex's isolated checkout could not
run. The export game summaries, missing-value sorting and the negative `Long`
with its film alignment are settled; do not re-litigate them. The coach approved
the rebuilt composition in the installed `1.12.0-91` smoke. That closes the
presentation checkpoint but does not change the separate formal registry state,
which remains `REJECTED`.

**ONE CREDIT INDEX OWNS EVERY NUMBER AND EVERY CLIP.** `StatsEngine._playerCredits`
makes one pass and files each attributed play into a bucket per player, per role,
per statistic. A count is that bucket's length, a total is the sum of its values,
a long is its maximum, and the film cohort is those exact plays — so a figure and
the playlist behind it are the same list read two ways, and a game or situational
split is that list GROUPED rather than a second computation. `_individualStats`
now derives its long-standing output from the index instead of counting again;
`e2e-parity`'s golden is the proof that the rewrite reproduced every established
definition, byte for byte, on the canonical and demo seasons.
`PLAYER_ROLE_COHORT` is the reserved bucket holding every play attributed to a
role, including one that contributed to no displayed statistic — a pass wiped out
by a penalty, a takeaway role on a play that produced neither turnover. It is the
role's own film cohort and the set every split groups.

**A STATISTIC OPENS ITS OWN EVENTS; IDENTITY OPENS THE PLAYER.** The old
whole-row action made every cell in a row do the same thing. Each measured value
with clips of its own is now a button carrying exactly that bucket's composite
`gameId::playId` refs — `Rushing TD` opens rushing touchdowns, `INT` opens
interceptions, `Long` opens the measured plays behind it — and the identity cell
opens the player detail view instead. A `No data` cell and a measured zero with no
clips stay visible and are not buttons: there is no playlist to open. Cohort
ownership lives in the model and the view model (`PLAYER_STAT_BUCKETS`); nothing
is reconstructed from a displayed string in JSX.

**The detail view opens IN the tab.** Literal number and roster name, the active
scope, one labelled section per populated role, an average grade only where grades
were charted, a chronological game-by-game table and a situational breakdown. A
player credited in several roles appears once with separate sections: a tackle and
a reception do not add up, so there is no combined rating. Game rows are the same
buckets narrowed to a game, so they sum back to the totals above them by
construction; a game the player was not credited in is `No data`, never a zero.

**A ROLE'S CREDITS ARE HETEROGENEOUS, AND ONE "VOLUME" STAT CANNOT SPEAK FOR
THEM.** Each role declares `measures` — the columns a split renders, each naming
its own bucket and how it is read (count or total) — and a group is rendered when
the ROLE was credited in it, which is its own cohort length. Filtering on a single
stat dropped a punt-only kicking group (no field-goal attempt) and a
takeaway-only defender (no tackle) out of the situational split entirely, and
printed `0 FG, 40 punt yds` and `0 tkl` in their game rows. A game row now states
the measures that actually happened, or its play count when every measure is
empty (Codex, 2026-09-20). `Long` opens the play that PRODUCED it — the plays
tying the maximum — not every measured play in the bucket.

**ONE OWNER FOR THAT SUMMARY, because the export had the same defect.** The
printed report built each game-by-game cell from the first two entries of its own
fixed stat list, so a punt-only kicker exported `0 field goal attempts, 0 field
goals made` and a takeaway-only defender `0 tackles, 0 solo` — the screen's
repair had not reached it. `StatsEngine.playerRoleSummary`, over
`playerRoleMeasures`, is the one owner the board and `buildPlayerHtmlReport` both
read: the measures that happened, or the credited play count. A measured zero and
an uncredited role (`No data`) remain different statements.

**`Long` IS THE LONGEST RESULT, NEGATIVE INCLUDED.** `_individualStats` clamped
it with `Math.max(0, …)`, so a back whose only carry lost three yards displayed
`Long 0` while the film link opened the -3 play — the number and its clip
described different things. Rushing, receiving and returns report the true
longest; with nothing measured the field stays `0`, the established "nothing to
state" value every consumer already renders as an absence; and `longRefs` is
untouched, so tied longest plays stay linked together. The audited `e2e-parity`
correction is three all-negative rushing cohorts in the coach's own season now
reporting -6, -1 and -3 instead of 0. No other value moved.

**The situational selection is controller state and the export prints it.** Role
and dimension live on `ReportsScreen`, so an ordinary re-render cannot discard
them and `exportPlayer` prints the breakdown on screen instead of independently
choosing the first permitted dimension of every role. The results table is one
sortable `DataTable`, sortable on every column by mouse, Enter or Space.

**AN UNMEASURED VALUE IS NOT A ZERO IN THE SORT DATA EITHER.** Every situational
measure was flattened to its displayed value, so an unmeasured cell entered the
sort as `0` and sorted ahead of a real negative value in both directions; Grade
displayed `No data` and sorted that string as `0` for the same reason. Unmeasured
measures stay `null` and Grade sorts through `gradeSort` — `DataTable` already
groups missing values last in both directions, which is the whole point of that
rule. The rule covers every numeric measure on the table, not only Grade.

**Situational analysis uses existing owners only.** `PLAYER_DIMENSIONS` lists down
and distance, quarter, field zone, hash, run/pass, play type, direction,
formation, personnel, front, coverage, blitz and the Special Teams unit/outcome,
each declaring the roles it can answer — a rusher is never offered coverage, a
tackler is never offered our own formation. Values come from the canonical
splitters (`_ddKey`/`_ddPretty`, `fieldZoneOf`, `splitPlayTypes`,
`splitFormations`, `splitFronts`, `splitBlitzes`, `SpecialTeamsModel.UNIT_LABELS`),
a multi-value tag credits every component, and an uncharted value yields no row
rather than an invented `Unknown`.

**Scope gained Selected games.** A compact checklist of the program season's own
games; an empty selection keeps the full season rather than blanking the board,
opponent-scout games are never offered, and every table, count, detail view, sort
source and film cohort recomputes from that one narrowed cohort. Nothing is
written to stored data. The sample line states the resulting cohort literally.

**Column visibility is presentation only**, per role, defaulting to the approved
schemas; the player identity can never be hidden and no calculation, sort source
or cohort changes. **Export follows the selection:** with a player open, Export
produces that player's report — identity, cohort, role summaries, game splits,
situational rows, literal `No data` and composite references — never the
leaderboard.

**Players is at the 12.5px floor**, the third migrated board (46 sub-floor
elements → 0 on the canonical season). Role bands are content-height, so a short
table no longer pads dead space under itself.

**What Revision 2 deliberately does NOT add**, because the charting model cannot
support it honestly: participation or snap counts, targets, pressures, missed
tackles, blocking or coverage grades per player, route or assignment data, and any
combined player rating. Role attribution is what a coach charted, never
participation.

**Reports > Players Revision 1 is the SUPERSEDED baseline, kept here because
Revision 2 preserved its role schemas, stat definitions, scopes, sorting,
absence semantics and column geometry unchanged.** Built to the approved comp
(`design-comps/reports-players-2026-09-04`, whose RATIONALE is the decision
record and whose section 16 is the final composition). Its band pairing is the
one part Revision 2 replaced, and the `1.12.0-90` smoke is what rejected it; the
phase composition that replaced it passed the `1.12.0-91` smoke. Read the rules
below as the schema contract, not as the current layout.

Players is **six fixed football roles** — Rushing, Passing, Receiving, Tackles,
Return Game, Kicking / Punting — paired two to a band. Scope (Current game /
Full season, defaulting to Current game), the sample line and the role
navigation (All roles / Offense / Defense / Special Teams) share **one control
row**, so the board opens on report data rather than on two full-width bands of
chrome. There is no section-title strip: it repeated the active role tab and
counts already on screen. Role counts are plain text, not boxed badges. Role
headings are readable IBM Plex Sans at 12.5px with no tracking or forced
uppercase; data rows are 38px at 13px; bands meet on thin rules so the six
tables read as one report surface. The report canvas was capped at 1648px
and centred; that cap left an empty near-black frame at 1920 (installed
`1.12.0-94` finding) and was removed on 2026-09-22, so the report now fills
its board.

**The tables own their column geometry.** Each role emits a `colgroup` and
renders `table-layout:fixed`, so the same measurement is the same width in
every role table and no sort or scope change moves a column edge. Nine steps,
each sized from the widest thing that column must hold — its own header or a
full-season figure. A single width clipped `Solo`, `Sack`, `Fum` and
`Punt Avg`; sizing against one game then let a season `1054` and `174/261`
overrun. Identity keeps a 208px floor and absorbs whatever the panel has spare.

Three things this cost, each of which renders plausibly while being wrong:

- **A bare class loses the colgroup.** `.gi-reports .gi-overview-module table`
  carries an element selector, so `.gi-player-table` alone is outranked and the
  table silently content-sizes — every stated width becomes fiction. The rule
  is qualified as `.gi-player-module table.gi-player-table`.
- **The route-wide `th{position:sticky;top:42px}`** is measured against the
  table wrap once the wrap is a scroll container, which pinned every header
  42px down over its own first data row. The Players tables opt out, the same
  correction the Special Teams board needed.
- **`table-layout:fixed` overflows silently** rather than growing, so a clipped
  cell is invisible to any content check. Every cell is measured against its
  own content box across width × scope × section.

**A band stacks only when its own widest table needs more than a band half.**
The board carries no padding of its own — the route already insets it, and
paying both cost each half 16px, which is what squeezed the nine-column
Tackles identity column below a real roster name at 1440. Measured halves are
663px at 1440 and 583px at 1280; the tables need 620 / 632 / 498 / 638 / 482 /
448. Pairing Tackles also has to leave its identity column room for a name, so
the breakpoint is where that stops being true: **1420px**, measured, not the
width at which the table alone fits. Every band pairs at 1440 and only the
bands carrying Rushing, Passing or Tackles stack at 1280 — Return Game and
Kicking / Punting stay paired. A stacked band roughly doubles its measurement
columns, because left at the paired widths the identity column absorbs ~830px
of the extra room and a row reads as a name at the far left with its first
number at the far right.

**The row marker costs the identity column no width.** Reserved inline it took
~13px off every identity cell in every table, which the Tackles table cannot
spare; absolutely positioned in the cell's own left inset it still moves no
text, because it never occupied any. `Terrance Whitfield-Boateng` fits at 1440
with 10px to spare in Tackles, the tightest column on the board. The identity
cell keeps `text-overflow:ellipsis` as a last-resort safeguard for an imported
name longer than any panel can ever give it.

**The selected role section is controller state, not view state.** A scope
change re-renders the tab, so a selection held only in `PlayersTab` was
discarded and the board snapped back to All roles under the coach's hands.
`ReportsScreen.playersSection` survives that remount the way `playersScope`
already does; switching section still re-renders in place, so it does not
disturb sort. A scope change DOES reset the sort, deliberately — the cohort
under it changed.

**The role count keeps its denominator whenever a role is unattributed.**
`5 roles` reads as the whole set; `5/6 roles` says one is missing. A full six
drops the denominator, because there is nothing absent for it to name.

**Two absence surfaces, one literal.** Roles with no attribution consolidate
into a single `No data` row naming them, so the fixed role set stays visible
without six mostly-empty panels; with no attribution anywhere the board is
replaced by the ruled empty band — `No player attribution` / `No players are
attributed to charted plays.` / `Open Break Down`. Neither ever shows a zero:
unattributed is not zero production. A **measured** zero keeps full strength —
a return fielded for no yards is `0`, and a takeaway credited with no tackle
keeps its `0` tackles.

**Every row opens its own role cohort.** `_playersCohort` reuses the same
self-perspective assembly Defense and Special Teams use, so `refs` are real
composite `gameId::playId` values in both scopes and a full-season row plays
across games through the one film-navigation service. There is no jersey
cut-up fallback: clicking a rushing row opens the carries that produced that
rushing line, labelled with the role so a rushing cut-up is distinguishable
from a receiving one. Full season is that same multi-game cohort, not a
Players-local aggregation.

**The Grade column renders.** `individualStats` returned `{text, cls}` and
spread it into the row, so `DataTable` looked up a `grade` key that did not
exist and every Grade cell was empty. It now returns `grade` / `gradeClass` /
`gradeSort`, and five columns that sorted as zero (`Pct`, `C/A`, `FG (M/A)`,
`Punts`, `Punt Avg`) carry real sort accessors — `Number('62.1%')`,
`Number('18/29')` and `Number('2/4')` are all `NaN`, which `DataTable`'s
`(Number(av) || 0)` turns into 0. An absent grade sorts last in both
directions.

**`DataTable` gained two optional inputs, both used only here:** a `size` on a
column emits the colgroup, and `defaultSort` marks the column the view model
already orders by so the sort affordance is visible at rest. Kicking / Punting
opens unmarked because the engine orders it by made plus punts, which is not a
single column.

Verified on the coach's real 2025 JV season at all three release widths in both
scopes: 13 players, six roles, 449 charted plays, no page overflow, no clipped
cell, no scroller engaged, zero console errors.

---

**Reports > Self-Scout is implemented and canonical-data verified; installed
smoke is pending, so it is not yet coach accepted.** Built to the approved comp (`design-comps/reports-self-scout-2026-09-05`,
whose RATIONALE is the decision record; sections 17-18 and the revision 4
typography correction are the composition contract, at checkpoint `dd9812a`).
Canonical-season captures at 1440 and 1280 are in `artifacts/reports-canonical-review`.

Self-Scout is **five sections presented as a TAB STRIP**, one on screen at a
time: Offensive Summary, Calls & Situations, Structure, Defense, Tendencies.
The production page it replaces measured 4,257px at 1440 — nearly five
viewports of undifferentiated modules with the whole defensive report below the
offensive one. Scope, the section navigation and Export share **one control
row**; the report fills a board that carries no padding of its own, the same
geometry the Players board uses (the former 1648px cap was removed with the
2026-09-22 outer-frame repair).

**Offensive Summary and Defense share one composition:** six KPI tiles, then
three two-column rows — Positive Plays | Negative Plays, Top Calls | Worst
Calls, Run | Pass. Those rows hold through 1280 and stack only below 1000. The
six KPI tiles also stay on ONE row at 1280, the same ruling the Special Teams
ledger carries: wrapping to 3×2 spends a whole extra row on six short cards.

**Module headers carry the title only.** No counts, thresholds, sample
language, captions or explanatory subheads render beside or beneath a module
title, and an unavailable KPI reads `No data` with no sentence explaining the
absence. Generated Recommendations and Film Room Insights are not rendered:
they restated the data in speculative coaching prose. Tendencies is the only
section carrying predictability, the tells, the predictability map or the
defensive tells.

**A defensive call is ONE composite identity: Front + Coverage +
Blitz/pressure, in that order**, joining only the components the play actually
carries. A blank pressure is omitted, never relabelled `No blitz` — an
untagged field is missing data, not a charted call. Calls qualify at three
plays and rank by stop rate, then LOWER yards allowed per play, then sample;
Worst Calls is that same ranking read from the other end. Offensive calls
qualify at three plays and rank by success rate, then yards per play, then
sample. Both rankings live in `StatsEngine`, never in the view. **With fewer
than six qualified calls the two tables overlap** — with one qualified call it
is both the best and the worst. That is the approved comp's own behaviour and
is carried into the Charlie Gate.

**Three canonical predicates were extracted, not duplicated.**
`StatsEngine.isExplosive` (a 12-yard run or a 16-yard pass), `isConversion`
(gained the line to gain, or scored) and `isTackleForLoss` now have one owner
each; `_efficiencyStats`, `_downStats`, `_defensiveStats`, `_selfScoutGroup`
and the `explosive` cut filter all call them. No compute() output changed. The
summary models (`selfScoutSummary`, `selfScoutDefenseSummary`) read
compute()'s own efficiency, scoring, downs, negative-play, situational and
defensive results rather than recomputing any of them, so every count on the
board reconciles with the KPI band above it by construction.

**Self-Scout now takes the shared self-perspective cohort.** It has no scope
control — it reports the current game, the scope it has always had — but it
sources that cohort through `_selfScoutCohort()` (`_selfPerspectiveCohort('game')`),
the same assembly Defense, Special Teams and Players use. That is what stamps
`__gid`: sourced straight from the live tagger, as it was, every Self-Scout row
carried NO composite refs at all, which is the production dependency the comp
record raised. Every ranked call now retains the exact `gameId::playId` cohort
behind its own count, accumulated in the same pass that increments it.

**The selected section is controller state.** `ReportsScreen.selfScoutSection`
survives the remount an ordinary Reports re-render causes, the same correction
`playersSection` needed.

**A section badge counts what its section renders.** Offensive Summary's badge
counted `callRows` — the ranked play-call list built from `playCall ||
playConcept`. The canonical season charts neither in any of its six games, so
the badge read `0` in both scopes above a section rendering populated KPIs,
positive and negative plays, top and worst calls and the run/pass split, and
the zero dimmed the tab through `is-none`. It counts `report.totalPlays`, the
classified sample the summary is computed over and the same number the sample
line states.

**No tendency reports its own dimension back as a tell.** `_defTellsFrom` is
dimension-agnostic and emitted a Front tell and a Coverage tell for every
grouping it was given, so grouping by front made `topFrontPct` 100 by
construction and Tendencies read `Maverick → Maverick 100%` and `Cover 3 →
Cover 3 100%`. A guaranteed 100% also scores `(100 − 50) × n`, higher than any
real tendency, so the tautologies crowded genuine tells out of the ten-slot
ranked slice and the recommendations built from it. The front and coverage
groupings now pass `skip`, so each may report only tells from a DIFFERENT
dimension — blitz lean from a front is the cross-dimensional tendency those
groupings exist for and is unchanged. The `e2e-parity` golden correction is 60
deletions and zero additions, every one a `Cover 3 → Cover 3` row.

**Stop Rate holds no headline or primary-comparison position.** The coach
rejected it as the primary defensive comparison: it is the inverse of offensive
play success, so its down-specific thresholds make the comparison misleading at
a glance. `Yards Allowed / Play` leads the Self-Scout defensive KPI band and
`Yards / play allowed` leads Overview's Defense & discipline module; Stop Rate
keeps a supporting position at the foot of each. **Neither composition was
resized** — six tiles and six rows, reordered. It remains the ranking key in
the defensive call tables, the approved Matchup defensive-lane metric, and a
Study metric; none of those changed.

**Self-Scout is current-game scope.** It therefore keeps the shared current-game
header (the game KPI rail it once carried is deleted, 2026-09-23). The chrome
follows the report's real scope; it is not a
reward for completing a design pass and must never imply a game scope for
season or matchup data.

---

**Reports > Season is implemented and canonical-data verified; installed smoke
is pending, so it is not yet coach accepted.**
Built to the approved comp (`design-comps/reports-season-2026-09-05`, whose
RATIONALE is the decision record, including its Revision 2), at comps `4762557`
and `2f92ab9`. Game Log rows open the selected game's Reports Overview.

**Season is a CONTAINER, not a second set of reports.** It owns season identity
and its seven-section navigation, the six aggregate KPIs, the chronological
Game Log, Situational Offense, Scoring & Possessions, Early vs Recent, Wins vs
Losses, Game-by-Game and the existing season export. Offense, Defense, Special
Teams, Players and Self-Scout render their OWN approved production boards at
full-season scope — no fork, no Season-specific variant. The Season-only
`Offensive Identity` band, the `Wins vs Losses` table and the `Per-Game Box
Score` that had been bolted onto Players are gone from those tabs; the two
comparisons now live in Trends, where they belong, and Players is the approved
Players board alone. Overview no longer renders the generic `OverviewTab`
beneath its own modules.

**Opponent-scout games are excluded from Our Program season totals.** They were
not. `SeasonManager._effectiveGames()` returned every game, so a charted scout
game put the opponent's offense into our yardage, success rate, turnover margin
and record — and into the exported report. `_selfGames()` is the new Our
Program cohort and `reportModel()`/`_allPlays()`/`exportHtml()` take it;
`_effectiveGames()` stays unfiltered because `StatsEngine._allSeasonGames`
reads it to build the Opponent Scout report, whose whole subject is that film.

**Early vs Recent and Wins vs Losses are ONE metric list.**
`SeasonManager.COMPARE_METRICS` holds the six — Success Rate, Yards / Play,
3rd Down Rate, Points / Drive, TO Margin / Game, TD / Game — in the one order
both panels use, and one cohort summariser (`_cohortSummary`) measures both, so
the same label can never be measured two ways. Higher is better for all six, so
a positive delta is always `Up`. Every delta names its own unit: percentage
points (` pp`) for a rate, ` yds/play`, ` pts/drive`, `/game`. Printed
unitless, a rate change and a raw change read as directly comparable numbers,
which they are not. The Steady band is per metric: Success Rate 2pp, Yards /
Play 0.3 and 3rd Down Rate 3pp are the thresholds the previous progression card
already applied; Points / Drive and TO Margin / Game are new here and take 0.3,
the band every other per-play and per-game measure on the list uses.

**`TO Margin / Game` is per game.** It is the cohort's aggregate margin divided
by that cohort's own game count, not the raw aggregate under a per-game label —
and it reconciles with the `TO ±` column the Game Log shows, which itself sums
to the aggregate Turnover Margin KPI. Points / Drive is computed with the game
boundaries intact: the cohort's plays are the same objects `_allPlays()` already
stamped with `__seasonGameIdx`, so drive reconstruction never merges possessions
across a game boundary. Asserted, not assumed: season drives equal the sum of
each game's own drives.

**The window is dynamic.** N = min(4, floor(charted games / 2)), taken as the
first N and the last N so the two windows never overlap; eight or more charted
games always compares First 4 with Last 4, and the KPI labels say which. Fewer
than two charted games keeps the concise Trends empty state.

**Eligibility is per MEASURE, not per game.** A game charted on defence only
has plays, so it belongs in the Game Log, the record and the win/loss cohorts —
but it measured no offense, and reporting `0` snaps or `0` rushing yards for it
states something nobody charted. Every offensive measure on such a row is
absent; so is its turnover margin, because a giveaway is only observable on a
charted offensive snap and a takeaway on a charted defensive one. The
denominators follow: `Yards / Game` divides by the games charted on offense,
`Last N Points / Game` by the SCORED games in the window (an unscored game is
not a shutout), `Last N Yards / Game` by the window's offensive games, and the
two comparison panels' `TD / Game` and `TO Margin / Game` by the games in that
cohort which could measure them. The turnover numerator follows the same rule:
season and cohort margins sum only games where both sides were observable;
with no eligible game, the measure is `No data`, never zero.

**Opponent-scout rosters never rename our players.** `_mergeRoster()` read
`_effectiveGames()`, so a scout game's roster — both teams field a 22 — could
relabel our own player across the Season Players board and the export. Filtering
to `_selfGames()` fixed that, and carrying the active game's own roster onto the
live projection fixed the hole it exposed. **Both are superseded (2026-09-13):**
the SEASON is the sole roster owner, so `_mergeRoster()` reads
`season.roster` plus the live roster, no game node carries a roster to merge, and
`_effectiveGames()` deliberately puts none on its live projection. The exclusion
is now structural rather than a hand-written filter — a season's roster is its own
team's, and no other season's is reachable from there.

**The export reports the same scope and structure as the board.** It need not
look like it, but it prints the same six aggregate KPIs, the same Game Log over
`gameLog` — the previous `perGame` source dropped scheduled rows, so the report
could say "3 games" above two rows — the same `Success Rate` column label, both
Trends comparisons, and deltas that still carry their units.

**The Game Log is the season's own chronology.** Oldest first through
`SeasonStore.gamesChrono()`, so a preseason scrimmage dated before Week 1 sorts
first on its date and never on its week text — the Week column prints
`Scrimmage` verbatim. Week, date, opponent, result and score come from
`gameInfo` directly; nothing scrapes them back out of a display name, and a
game label falls back to the store's own `gameName()` helper. Rush, Pass and
Total are yardage, not attempt strings, and the visible rows reconcile with the
season total. A scheduled game with nothing charted keeps its row and reports
`No data` at copy weight in every measured cell — an uncharted game is an
absence, not a zero.

**Season is NOT in `SCOREBUG_TABS`**, and `_syncKpiRail` already hid the
game-scope rail on this tab: the board's own KPI band is its scope owner.

---

**Reports > Matchup is implemented and canonical-data verified; installed smoke
is pending, so it is not yet coach accepted.**
Built to the approved comp (`design-comps/reports-matchup-2026-09-06`, whose
RATIONALE is the decision record). Canonical-season captures cover both directions.

**Matchup is a situational JOIN, not two unit profiles side by side.** The
previous board placed our profile beside theirs and left the coach to do the
matchup analysis. Each of the two directions — `Our Offense vs Their Defense`
and `Our Defense vs Their Offense`, one on screen at a time — now leads with
`Situational Calls`: what the opponent most often calls in each of five fixed
situations, and what our own season produced against that exact charted look.
Beneath it sit paired `Production by Play Type` tables, and then the
direction's own support section — `Coverages` (formerly `Coverage Answers`, smoke S98-1) on the offense-facing
tab, `Personnel and Formation` on the defense-facing one. The broad KPI strip
is gone; every performance value now sits beside the cohort and situation that
produced it.

**Five fixed situations, all from existing predicates:** 1st Down, 2nd & 7+,
3rd & 1-3, 3rd & 7+, Red Zone. `defensivePerformance`'s own situation specs
supply four of them and `_defensiveStats`' passing-down rule the fifth, so no
competing distance or yard-line formula exists. Rows overlap by design — a
red-zone third down belongs to both cohorts.

**`Rate` is a share of ELIGIBLE opponent snaps, never a success rate.**
Eligible means the snaps in that situation that carry a resolvable call
identity. A snap with nothing charted can never reach the numerator, so
counting it in the denominator would deflate every rate against a cohort no
call could appear in. Ranking is frequency descending, then the DISPLAYED call
name ascending — deterministic, and `Top` means most frequently charted
everywhere on this board, never highest-performing.

**`No Blitz` is a charted call; an untagged field is not.**
`StatsEngine.isNoBlitz` — extracted from `_defensiveStats`' own `noBlitzTotal`
cohort so the report's blitz denominator and Matchup's displayed call are one
rule — admits a snap only when the blitz field is empty AND a front or a
coverage was charted. A snap with no defensive structure produces no call at
all. A displayed `No Blitz` matches only season snaps the same rule admits, so
a blitzed rep against the same front and coverage never satisfies it.

**A filter is never widened to fill a row.** The season side matches every
nonblank displayed component exactly, through the same canonical projection
that produced it. With no exact match the row reads `No matching snaps` at
copy weight and prints no measurement — never a fabricated zero.

**A displayed call remembers which FIELD produced it.** `_matchupCall` returns
the call and its `callField` — `playCall`, or `playConcept` as the fallback
every other call consumer here uses — and the matcher compares that same
field. Re-deriving `playCall || playConcept` on the season side silently
missed every snap that carried both: an opponent row showing a charted concept
`Zone` never matched our own `Inside Zone` snaps that were also tagged `Zone`,
and reported `No matching snaps` against a cohort that existed.

**A multi-select identity is order-independent.** A `" + "`-joined tag stores
SELECTION order, which carries no football meaning, so `_matchupSet`
deduplicates and joins components in canonical order for both the key and the
label. Without it `4-2-5 + Nickel` and `Nickel + 4-2-5` split one opponent
call into two — halving each one's frequency and Rate — and a season snap
charted in the other order produced a false `No matching snaps`.

**A nullified penalty snap is not a defensive rep.** `defensiveCohortMetrics`
applies `_tryPenaltyResolved` itself, so the contract belongs to the owner
rather than to each caller, and `matchupReport` applies it to both defensive
cohorts before anything RANKS them — a snap wiped out by an accepted penalty
must set no call frequency, no Rate and no film reference either, not merely
stay out of the average. A 2-yard snap beside a nullified 99-yard snap
reported 2 snaps at 50.5 yards allowed with both plays in the cut-up.
Offensive cohorts go through `compute()`, which is the canonical Offense
report's own cohort rule.

**Four cohorts, four independent game counts.** Each unit header states the
games that contributed to THAT cohort — a game charted on offense only must
never inflate the defensive sample stated beside it, and the same holds for
the opponent's two units. Only the summary line above them carries a combined
count, because the opponent's film as a whole is the one thing it describes.

**Polarity is per COHORT, not per lane.** A lane holds both cohorts: our
offensive production reports Yards / Play and Success Rate, their defense
Yards / Play Allowed and Stop Rate, and the two are never interchanged.
`defensiveCohortMetrics` was extracted from `defensivePerformance`'s own
`summarize` so a defensive cohort is measured by one owner on both surfaces;
offensive cohorts go through `compute()` unchanged.

**Film is TWO explicit controls, `Opponent` and `Season`.** Never one
ambiguous whole-row action, never an unlabelled icon, and never the two
cohorts combined into one cut-up. Each opens exactly the deduplicated, sorted
composite `gameId::playId` set behind its own side of the row, and a side with
no references renders no enabled control at all. The two sets are separate
cohorts; they are disjoint whenever the opponent's film is a scout game, and
they legitimately share a rep when the opponent film is a game we PLAYED —
`_matchupData`'s established shortcut reads one charted snap as both our
offensive rep and their defensive one.

**No matchup score, prediction, recommendation, inferred advantage or
confidence claim is calculated.** Nor is there gap-level analysis: stored
`playDir` is Left, Middle or Right and cannot honestly support A/B/C/D.

**The active direction is controller state.** `ReportsScreen.matchupTab`
survives the remount an ordinary Reports re-render causes, the same correction
`playersSection` and `selfScoutSection` needed. A direction the opponent film
cannot answer is not offered at all — the partial state names the missing
opponent unit literally rather than rendering a selectable dead tab.

**A look is never labelled a play call, and every count names its cohort.**
`Their Primary Call` sat over a COMPOSITE identity - `Personnel | Formation |
Call` on the defence-facing lane, `Front | Coverage | Pressure` on the
offence-facing one - with blank components dropped. The canonical season charts
no `playCall` and no `playConcept` on any of its 449 plays, so on 32 of its
defensive snaps the label collapsed to personnel alone and the column read
`Their Primary Call: 22`. Both lanes carried the error. The columns are
`Their Top Look` and `Our Best Answer`.

Matchup keeps every CHARTED snap because a formation and personnel exist on
snaps with no play type and excluding them would discard real looks; every
production measure uses the CLASSIFIED subset. On the canonical season that is
201 against 173 offensive and 174 against 154 defensive. Neither cohort is
wrong and they are never forced together - but each surface states which it is
showing: Matchup unit headers say `charted snaps`, and Self-Scout's sample line
says `classified` on both halves. The four counts are pinned in
`e2e-reports-defense-realdata`.
**Matchup has matchup-scope shared chrome.** It suppresses the current-game
scorebug and KPI rail, names the selected opponent in the Reports header, and
states `Season film and opponent film`. The board and its frame therefore
describe the same two cohorts.

**One deliberate difference from the comp: no green/red performance tone.**
The comp's fixture hand-colours some Yds / Play and Success values good or
bad. Production has no canonical good/bad threshold for either measure, and
inventing one would be exactly the inferred advantage this board refuses to
calculate. The cohort colours the comp does specify — gold for opponent film,
cyan for season film, repeated in the key above the situational table — are
implemented. Carried into the Charlie Gate.

---

**Special Teams chrome follows its scope.** At Current game it uses the shared
current-game header (no KPI rail since 2026-09-23). At Full season it suppresses all game-only
chrome and names `<season> Special Teams` / `Full season`. No
Special-Teams-only scorebug variant exists. Export reuses the existing
mechanism (`exportSpecialTeams` → `buildSpecialTeamsHtmlReport` → the shared
`documentShell` and `window.ffaSaveBlob`), never a second export subsystem.

**The printed report has its own KPI band renderer, and needs one.** The board's
tiles carry NAMED values (`stats`), not the `value`/`sub` pair the generic
`metrics()` band reads, so three tiles — Special Teams Snaps, Points and
Touchdowns — exported as empty headlines. `stMetrics` gives each named value its
own label/value row; flattening them into the band's 25px display `<strong>`
wrapped one tile over three lines and printed a stat's label at headline size
beside its own number. Covered by section 11 of `e2e-reports-special-teams`,
which compares the rendered board's figures against the exported HTML and is
mutation-verified against the generic band.

**The outcome bars are absolute, not relative.** Scaling each bar to the
largest bucket made a 29% outcome fill the whole track; the width is the
bucket's own percentage of its unit.

**One approved production change is still pending, carried by no file:** the
context bar wrapping long game names at 1280 instead of clipping (shared shell
owner — and the shell's response to a taller bar still needs verifying).
Generic `yardage`/`result` on ST plays stay unread by design:
dedicated ST fields remain authoritative, and that data is recorded as an input
to a later projection decision.

**THE GLOBAL STRIP (`160533c`, 2026-09-22; in `1.12.0-97`, installed smoke pending).** One
route owner, `native-reports.jsx`, renders a fixed 50px report head (title,
context, opponent picker, Scout opponent) and then ONE 44px strip —
`Our game` / `Opponent scout`, the eight tabs on equal tracks in the order
Overview, Offense, Defense, Special Teams, Players, Self-Scout, Matchup,
Season, and Export. Every tab has the same bounding box on all eight reports
at 1440 and 1280, so Overview to Season is a horizontal move. Nothing
conditional sits above the strip: the title truncates rather than wraps, and
the secondary bar, the Overview score and every board's own controls render
below it. The opponent perspective DISABLES the four
self-only tabs instead of hiding them, because hiding one moves every tab
after it. Defense and Special Teams scope open on Current game, listed first,
like Players; the choice is controller state and survives re-renders.

**THE SECONDARY BAR (`0e84464`, 2026-09-23; in `1.12.0-97`, installed smoke pending).**
Built to `design-comps/reports-secondary-nav-2026-09-23` (its RATIONALE records
the implementation). Directly under the strip sits ONE bar, `SectionBar` in
`native-report-kit.jsx`, with the same 46px box on all seven multi-section
reports: the report's pages on the left, its scope and its own export on the
right. Each board renders `ReportSectionBar`, which portals into the route's
`[data-reports-secbar]` host (`ReportsScreen.sectionBarHost()`); a board
embedded in Season has no host and renders the same bar inline. Overview has
no bar and its host takes no height. Offense is six pages and Defense four
(`offenseSection` / `defenseSection` controller state); Special Teams,
Players, Self-Scout, Season and Matchup moved their existing controls into the
bar unchanged. A page never narrows an export. Below 1440 the bar's spacing
tightens (Special Teams' five counted sections otherwise lost 59px at 1280);
below 1100 it stacks pages over scope and export. The proposed
down-and-distance chart is built separately (below).

**THE DOWN-AND-DISTANCE CHART (`80941c7`, 2026-09-23; in `1.12.0-97`, installed smoke pending).**
First on Offense > Situations (our offense) and Defense > Situations (the
opponent's offense): 1st-4th by 1-3 / 4-6 / 7+, each cell with snaps, a
run/pass split, success and yards/play; selecting a cell shows its top play
types and `Watch N plays` with the cell's exact composite refs. ONE owner,
`StatsEngine.downDistanceChart(plays, { side, fallbackGameId })`, and one set
of printed strings, `formatDownDistanceCell` / `downDistanceCohortLine`, read
by the board and the game, season and Defense HTML exports. **The cohort is
the run/pass snaps** (`isRun` / `isPass`; on defense only charted
defensive snaps whose penalties let the play count), stated as `N of M
run/pass snaps carry down and distance`. **Nothing is inferred:** a snap
without a charted down 1-4 and a positive charted distance is placed nowhere;
success counts only `_isSuccessfulPlayEligible` snaps (`isSuccessfulPlay`
ours, `isOpponentSuccess` theirs, so our pick-six is not their success);
yards/play only snaps with charted yardage; a snap without a play type is
untyped; a multi-select play type credits each component once and never adds
a snap (the detail says `N tags on M snaps`). An unfaced cell is a held dash
and cannot be selected. Defense reads `defenseBoard().downDistanceChart`, so
Current game, Full season and Season > Defense follow the board; Season >
Offense reads the season stats. It is deliberately NOT a `data-def2-module`
or an Offense schema module, so the pinned inventories are unchanged; its rows
are a fixed 100px so every page stays one height on every game. A cell whose
one snap has no yardage and is not measurable prints `- · -`.

**THE GAME KPI RAIL IS DELETED (2026-09-23).** Overview's compact score is the
only game-summary chrome: the linescore beside Result (from the OFFICIAL
scores only, `gameResult()`), Charted and Turnover margin, with no Yards-per-play
story and no duplicate matchup name. A side nobody charted is never a zero: a
defense-only game reads `No data` for the margin with `1 takeaway, turnovers
not charted`. `ReportsScreen._usesCurrentGameContext()` is still the single
scope decision: the score renders only for Overview on the current game, and
full-season Defense, Special Teams and Players, Season and Matchup name their
real scope in the shared header. Below 1100 the facts take their own row; on a
phone the linescore narrows its quarter columns so all four and the total stay
on screen.

**The LINESCORE scorebug is Overview-only (source, 2026-09-22).** Offense's
linescore and Defense's linescore with its identity strip are retired, not
moved; the score's sources and arithmetic are unchanged. One complete
team occupies each row: full team name, Q1-Q4 and total. Quarter and total
columns are fixed and shared by both rows, so every score has an unambiguous
team. Full names are never abbreviated, ellipsized or replaced by nicknames;
the flexible name track wraps when necessary. A name or a 1-, 2- or 3-digit
score cannot move the shared quarter and total columns.

**The linescore's two numbers have different sources, by design.** The total
prefers the official Game Settings score and falls back to charted scoring; the
quarters are always derived from charted scoring plays. They agree on every one
of the coach's ten live games. They would disagree only if a final score were
entered without every scoring play being charted, which the coach has ruled not
worth designing for. Verified exact on a fully charted game including a missed
XP, a pick-six credited to us rather than the offense on the field, and a
safety on a defensive play: quarters sum to totals on both rows.

**Reports typography has one shared target and explicitly recorded debt.**
The coach-facing floor is 12.5px. Defense Revision 2 is the one fully migrated
board: nothing on it renders below the floor. Overview retains only its approved
broadcast micro-labels; Offense retains sub-floor text only inside charts
(49 elements at 1440 since the 2026-09-24 module-system pass) and, at 1280, a
temporary 12px body exception on the eight named `gi-off-narrow-fit` modules. Self-Scout, Season and Matchup migrated to the
shared floor on 2026-09-22. None of those exceptions creates a second standard;
the exact canonical-season census and the work required to remove them live in
`docs/VISUAL-SYSTEM-RULES.md` and `docs/OPEN-DEFECTS.md`.

**A fixture is part of the evidence.** Three "defects" reported during this
work were unrepresentative fixtures, each caught only in review: quarters
tagged `'1'` when production writes `'Q1'` (`native-tagging.jsx` OPTIONS), so
By quarter rendered empty and the linescore showed all zeros; play-action
tagged as a *concept* when `_playActionStats` keys on the play **type**; and a
type-floor assertion that protected a spray chart the fixture gave no field
position to render. Chart the real tag vocabulary before concluding the
product is wrong.

---

## Open and deferred

`docs/OPEN-DEFECTS.md` is the canonical current defect index. Update it in the
same commit that opens, reclassifies, repairs, or closes an issue; this section
may summarize active work but must not become a competing ledger.

**Containment is not composition, and the coach found that at the board
(2026-09-11).** A Defense screen that had just passed 58 assertions shipped a
linescore band wrapped into two rows, an identity strip spread across the whole
viewport on no grid, a 300px void inside the score's own name track, six
different right edges down one column, and a KPI rail printing `3.3 · 132 yds,
40 snaps` above a board reading 3.4 over 127 yards. The rail's yardage was never
measured — it was `Math.round(ypp * total)`. Every geometry check in this
repository was written to catch clipping, overflow and scrollers; none of them
looks at alignment, balance or rhythm. `e2e-reports-defense-realdata` now asserts
content edges against the route frame's inset, that a shared band stays on one
row, and that the rail and the board report the same number — and none of that
replaces looking at the populated screen.

**The shared visual range failed its pre-gate review and was repaired
(2026-09-11).** An independent non-builder review of `7afa94d..44adcc6` found
four Reports harnesses red, two against hash-protected approved evidence, behind
a verification list that named six green suites and omitted every surface the
range had changed. The repairs, the charted-versus-measured Defense contract, the
new Overview evidence path and the remaining measured work are all in
`docs/OPEN-DEFECTS.md`; the enforceable typography contract is
`docs/VISUAL-SYSTEM-RULES.md`. `1.12.0-80` remains a historical installed
visual-scope pass; this repair is un-packaged source work made after that
installer. This is the history of that repair; later beta packages contain its
descendants. **A global token change is an
app-wide change, including to the rasters a comp was approved against** — repair
the geometry first, then regenerate the affected canonical evidence under a new
tracked path and name the old one as superseded.

**The full gate after `2073e2e` exposed two inherited geometry contracts; both
were repaired, not waived (2026-09-12).** Home's production Program selector
already used its required 340px / 320px widths while an older harness still
pinned the clipping prototype. That harness now uses the canonical program name
and checks actual clipping. Breakdown's 1920 utility columns were recomposed to
restore the existing 1150x645 film budget, and its fixed 400px deck now lays out
the top command row without internal overflow. Exact measurements and ownership
are recorded in `docs/OPEN-DEFECTS.md`.

**Reports OLL live-data audit (REPAIRED 2026-09-10, awaiting Codex re-review
and a Charlie Gate).** The ten investigation items from the complete 29-view
capture, plus one found in passing, are closed in code; three further repairs
came out of Codex's 2026-09-10 review. The ledger, reconciliation and mutation
evidence are in `docs/REPORTS-OLL-LIVE-AUDIT-2026-09-10.md`, the production
decision record is `design-comps/reports-oll-repairs-2026-09-10/RATIONALE.md`,
and `docs/OPEN-DEFECTS.md` carries the open questions. No surface advanced past
`REJECTED`. Installed `1.12.0-94` smoke is now in progress, but no full verdict
has accepted these repairs as production state.

1. **V2-I mobile companion workflow** — the one Plan V2 lane not started.
2. **Functional Beta Acceptance** — a cold-start Assistant Coach Test on a clean
   Windows profile, no fixture data, no verbal help.
3. **Current Reports smoke: `1.12.0-97`** (`SMOKE-1.12.0-97.md`) — the global
   strip and the outer-frame / jersey-slot repairs (`160533c`), the secondary
   bar (`0e84464`), the down-and-distance chart (`80941c7`) and the
   `preact/compat` input repair (`87371cd`) in one package. Offense,
   Self-Scout, Season, Matchup and the revised white-background HTML/PDF
   exports still need the coach's complete installed verdict; the incomplete
   `1.12.0-94` smoke gave none, and `1.12.0-95` / `1.12.0-96` were never
   smoked. The Offense board
   has canonical-data verification at 1440 and 1280;
   the three call modules remain held because the season has no charted calls.
   Self-Scout, Season and Matchup have canonical-data browser verification but
   no installed verdict. Season Game Log rows open the selected game's Reports
   Overview. Matchup deliberately has no inferred good/bad color threshold,
   and a game we played can appear in both its Opponent and Season cuts.
4. **Installed Reports decisions already made** — the `1.12.0-91` coach smoke
   approved Players composition and Defense cohort presentation and confirmed
   Special Teams. Do not request those Charlie Gates again. The `1.12.0-92`
   coach verdict approved Home's visual composition; its follow-up setup,
   typography and identity repairs still need installed verification in a
   newer package. The Reports context bar's proposed 1280px long-name wrapping
   is a separate unbuilt shell change. Formal registry production acceptance
   remains separate from these bounded installed decisions.
5. **CLOSED 2026-09-06 — Reports scope/frame mismatch.** Full-season Special
   Teams, Defense and Players now suppress the current-game scorebug and KPI
   rail and identify the season scope in the shared header. Matchup names the
   selected opponent and its two film cohorts. Current-game scope restores the
   game frame. The behavior is centralized in `_usesCurrentGameContext()` and
   pinned in the Reports, Special Teams and Matchup harnesses.

6. **CLOSED 2026-09-06 — legacy punt-block ownership.**
   Found by the coach at the board, 2026-09-04; repaired after the whole-Reports
   smoke candidate exposed that the known defect was still in its installer.

   The Punt unit reports `Blocked 1` on `2025-st-joseph-mavericks-jv`. The
   coach charted the opposite: **we blocked their punt.** Holy Family, Q2,
   play id 16 — 4th & 6, `result: Loss`, `yardage: -5`,
   `kickOutcome: Blocked`, and the only player charted is
   `players.tackler: '82'`.

   The evidence for whose punt it was is the coach's own account plus the
   player role: a `tackler` and no `kicker`. The play's field position (the 8)
   does **not** settle it — ST field position carries no proven owner
   perspective in the stored model, so it cannot distinguish our own 8 from
   theirs. Do not cite it as proof.

   Root cause: the legacy branch of `_specialTeamsStats` treats **every**
   `stType:'Punt'` as our own punt team — `const pp = by('Punt')`, then
   `blocked: pp.filter(kickOutcome === 'Blocked')`. Legacy `stType` carries no
   perspective, which `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md` §3 already names as
   its central flaw; the structured model solves it with `subjectRole`.

   The coach's charting DOES carry the signal, in the player role, and the
   engine reads none of it: 5 punts charted with a `kicker` (ours) versus this
   one charted with a `tackler` and no kicker (theirs). Two kickoffs match the
   same shape — id 28 (`returner` only) and id 57 (`takeaway` only, muffed),
   neither with a `kicker`.

   Blast radius beyond the wrong label: the Punt unit's denominator is 10 when
   only 9 punts were ours, so every punt rate is computed over a cohort that
   includes an opponent's punt, and the play also feeds the `Punts blocked`
   impact row and the Touchdowns/coverage refs.

   Coach decision, 2026-09-06: for a legacy `stType:'Punt'` with outcome
   `Blocked`, a charted defensive role and no kicker/punter is our punt-return/
   block unit. It is removed from our punt-team denominator, rates, outcomes,
   impact row and film; it is counted as a punt-return/block snap with exact
   film and the positive `Punts blocked` impact label. A blocked punt carrying
   a kicker/punter remains `Punts blocked against us`. Ambiguous legacy punts
   keep their historical classification; field position is never used to infer
   ownership. `e2e-reports-special-teams` pins all three directions.

7. **CLOSED 2026-09-21 — Reports > Defense Revision 2 installed verdict.** The
   `1.12.0-91` coach smoke approved its cohort presentation and accepted the
   reconciled St. Peter arithmetic. The Reports shell still carries the title
   and footer identity, Export Report remains, and the approved module scroll
   and sub-row gap behavior are unchanged. Formal registry status remains
   `REJECTED` pending a separate production-acceptance decision.
8. **SUPERSEDED 2026-09-17 — Defense section tabs.** Defense Revision 2 is one
   scrolling report with jump links, as the approved comp specifies. Offense
   still scrolls with its own zone navigation. **Itself superseded
   2026-09-23:** both are now pages in the shared secondary bar.
9. **CLOSED 2026-09-09 — Defense band gaps.** By down completes the opening
   band; fixed aligned rows complete Opponent Offense and Situational results.
10. **CLOSED 2026-09-09 — duplicate Defense > Self-Scout.** The fifth section
   and its dead presentation owner are deleted. Top-level Reports > Self-Scout
   remains the only self-scout presentation.

**SUPERSEDED 2026-09-21 — the equal 112px pane floors were the defect, not an
accepted limitation.** The record read: "At 1280×800 the Home rail's two panes
sit at their 112px floor and a scout row falls just below the fold inside its
own pane (measured: rail 682px = padding 40 + link 36 + gaps 66 + trees 194 +
tools 291 + foot 55) … freeing enough space would have to come out of the tools
or the foot, which the approved composition reserves." The `1.12.0-91` installed
smoke disproved that reasoning: the tool block was spending 291px of a 682px
rail on five actions, and the season tree — the rail's actual purpose — held
about one visible row, so the screen showed 2026 while 2025 JV was the open
season. The space came out of the rail's own paddings and gaps, not out of the
tools' targets or labels, and out of reserving a scout pane the same size as the
season tree whatever each held.

**PROGRAM SEASONS OWNS THE RAIL'S FLEXIBLE HEIGHT.** It takes the free space and
keeps a 120px floor; Opponent Scouts is content-sized under a 34% cap. Both caps
exist because either alone starves the other: equal `1fr` rows starved the season
tree, and a purely content-sized scout pane collapsed it to nothing. The tool
block keeps every 40px target and every label — **density comes from composition,
never from shrinking a control, a row or the type** — and a tighter spacing step
applies below 960px of viewport height. The two trees stay separate, headed and
independently reachable; they are never merged into one tree.

**THE ACTIVE YEAR IS A HEADING, NOT A CONTROL, AND CARRIES NO CARET.** The year
holding the open season is always fully expanded, shows every one of its
seasons, and offers no collapse at all — it keeps the year and the count and
nothing else. **No disclosure glyph either:** a caret on a heading that cannot
be pressed states an affordance that does not exist, so alignment with the
disclosure rows comes from an empty spacer of the caret's own width.

**ONE YEAR-GROUP KEY, `yearGroupKey()`.** Grouping normalised a missing year to
`Undated` while the active-year test normalised it to an empty string, so an
OPEN legacy season with no year fell between them: grouped under `Undated`,
matching no active year, and sitting inside a collapsible group. Both read the
one owner now, so `Undated` is the active, permanently expanded heading whenever
it holds the open season. Nothing here reads or rewrites stored season metadata
— it only decides which heading a row appears under. An earlier
pass let it fold and pinned its current row visible; that left
`aria-expanded="false"` over rendered content, so **the DOM and the
accessibility state disagreed**, and it offered an action that could not
honestly complete. Every INACTIVE year is a focusable button with
`aria-expanded`, `aria-controls`, a focus ring and a count, and folding one
removes its body entirely — a collapsed year renders nothing, so it can never
contradict its own state. Opening a season in a folded year therefore expands
that year by definition, reveals every season in it, and scrolls the open one
into view with `block:'nearest'`; the year the coach came from keeps whatever
disclosure state they chose.

**Collapse state is keyed by TEAM, section and year.** Two programs' 2024s are
different years, so nothing a coach folds in one program can leak into another,
and a program change opens the new program's tree fully expanded with its own
active year as the heading. It is controller state
(`screen.railCollapsedYears`), so an ordinary re-render or a season change
cannot silently reset it. The current row is scrolled into view on render AND on
resize — a viewport change re-lays out the rail without re-rendering it, which
is how the open season scrolled out of a shorter tree. Measured: three seasons
render with no internal scrollbar at 1920×1080 and 1440×900; eight and ten
seasons scroll inside the season tree only, never the rail and never the page.

**SPACE AND ENTER BELONG TO A FOCUSED CONTROL.** `App._bindKeyboard`'s global
shortcut handler guarded only `INPUT`, `TEXTAREA` and `SELECT`, so Space was
swallowed from every focused button in the app — the rail's year disclosures
included — while the same press toggled film playback behind the coach's back.
The guard also yields Space and Enter to `BUTTON`, `A`, `role="button"` and
editable content. Every other key and every other target is unchanged. A
keyboard test that dispatches a synthetic `KeyboardEvent` and then calls
`.click()` cannot catch this: it proves the click handler works and would pass
on a `div` no keyboard can reach. Drive the real keys.

**Both trees stay inside the rail, on BOTH axes.** The scout pane's track is its
own content height capped at 34% of the rail (46% on a short one): sized `auto`
beside the flexible seasons row it collapsed to 5px against 92px of content and
hid its only row. And a section must carry `min-width:0` as well as
`min-height:0` — a grid item's automatic minimum is its content, so the section
refused to shrink below its head's natural width and pushed the create button
26px past the rail's right edge at 1280, clipped and unreachable. A containment
check that measures only top and bottom passes that defect.

**Every Home control meets the 30px desktop target, and the target is the
control, not the ink.** `View roster →` (16px), the selected-game overflow
button (28px), `Link film` (24px), both rail create buttons (26px) and the
library back link (26px) all reached it by taking padding that is pulled back
out of their rows, so no panel grew and no type shrank. The overflow action
stays an icon button with its accessible label and its tooltip; every control
keeps hover, active, disabled and `:focus-visible`.

**ONE OPPONENT IDENTITY PER COMPONENT.** `matchupSchoolLine` exists to add the
name the title abbreviated, but it returned the opponent again, so every game
card and the detail panel printed it twice a line apart. It returns a line only
when the title does not already CONTAIN it — equality is too weak a test,
because the title is a matchup and the opponent's full name is usually a
substring of it. Nothing is invented to fill the space it leaves: date, score,
status, charting and film are unchanged, and a long name still truncates with
its full value in a `title`.

---

## Testing and release

Full tiers, commands, and what each tier can and cannot certify:
**`docs/TESTING.md`**. Summary:

- **Focused** — the smallest existing harness for the route or domain touched.
- **Affected route** — that route plus cross-route, context, and persistence
  harnesses, plus populated screenshots at the release widths.
- **Release** — `bash tools/run-gate.sh`, Windows CI, real-data checks, and an
  **installed WebView2 smoke**.

Reports harnesses: `tools/e2e-native-reports.mjs` (the route as a whole, 101),
`tools/e2e-reports-defense-realdata.mjs` (Defense Revision 2 on the canonical
season, 95), `tools/e2e-reports-defense-board.mjs` (Defense Revision 2 contracts
on a synthetic season, 60),
`tools/e2e-reports-overview.mjs` (the fixed Overview schema, deterministic
ranking/caps, sparse and overflow states, drive boundaries, film actions and
responsive geometry, 106), `tools/e2e-reports-overview-realdata.mjs` (the
canonical six-game season binding, longest-title navigation at both desktop
release widths, perspective-safe title tooltips and read-only captures, 35),
`tools/e2e-reports-offense.mjs` (the Offense composition, its football
contracts, the shared scorebug rule, and the static schema — module inventory
and order, EXACT row allocations, and identical schema under populated, sparse,
empty and over-cap data with deterministic ranking, truncation and padding, the six pages, and the Defense module system on every page, 66),
`tools/e2e-reports-offense-realdata.mjs` (the canonical six-game season,
read-only and hash-checked, every game at 1440 and 1280: approved module
inventory and order, exact row allocations, held slots, one board height,
approved Team Profile metrics, a module-height ceiling, no page overflow and
no clipped cell, walked page by page, 47), `tools/e2e-reports-special-teams.mjs`
(the Special Teams composition, its absence contract, the two engine
corrections, legacy punt ownership, scope chrome, the printed export and the Defense module system on every section, 61), `tools/e2e-reports-players.mjs`
(the Players composition, its role schemas, its measured column geometry, the
absence contract, the role-specific composite film cohorts, the Grade repair, the
one-owner game summary shared with the export, situational sort ORDER over
positive, measured-zero, negative and unmeasured values, and the true negative
`Long` with its film, the phase composition and its row capacities, 239) and `tools/e2e-reports-self-scout.mjs` (the Self-Scout
composition, its title-only module headers, the composite defensive-call
contract, both ranking rules, canonical metric reuse, exact film cohorts, the
HTML export's own schema and 1440/1280 containment, 113) and `tools/e2e-reports-season.mjs` (the Season
composition, the opponent-scout exclusion, chronological ordering, Game Log
reconciliation, the shared comparison metrics with their units and thresholds,
the dynamic First N / Last N windows, per-game turnover margin, drive-boundary
safety, the Game Log report action, and the child boards reused unchanged at season scope, 100) and
`tools/e2e-reports-matchup.mjs` (the Matchup composition, opponent selection,
both directions, the five situations, opponent-call ranking and its
tie-break, the Rate denominator, the exact season-side joins and
`No matching snaps`, the no-blitz versus uncharted-defense distinction,
per-cohort metric polarity, the supporting sections, the partial and empty
states, the separate `Opponent` / `Season` film cohorts, the nullified-penalty
exclusion, order-independent multi-select identities, field-faithful call
matching, per-cohort game counts, the charted-perspective red zone, our pick-six as a stop, scope chrome and 1440/1280 containment, 80) and
`tools/e2e-reports-global-strip.mjs` (the global strip on the canonical season:
identical tab boxes across all eight reports, both directions, scope changes
and the opponent perspective; order, fit and no scrolling; the Overview-only
linescore and its arithmetic; Current-game defaults and persistence; the
outer frame at 1920/1440/1280; the Players name column; the secondary bar and the 768/390 layouts, 360) and
`tools/e2e-reports-module-system.mjs` (the Defense module system on Players,
Self-Scout, Matchup and Season's own sections, canonical season with its roster, Players name fit and alignment, 1440/1280, 40) and
`tools/e2e-reports-down-distance.mjs` (the down-and-distance chart: synthetic
missing/sparse tags, zero denominators, overlapping play types, both success
rules, exact refs, selection and film, scope and Season embeds, screen/export
parity, the canonical season's cohort and refs, 1440/1280/768 fit, 47) and
`tools/e2e-explosive-labels.mjs` (explosive-play terminology: no bare or
abbreviated label in source, the approved wording on every rendered tab and export, the Defense board's
implied Allowed and the export's explicit one, fit without clipping or shrunk type at
1440/1280/768, sparse and empty games, 43).

Non-negotiable:
- A failing-first regression for every repaired defect. Watch it fail for the
  right reason before you trust it.
- **Give the fixture the same scrutiny as the assertion.** Three assertions in
  the Offense work passed while measuring something other than their subject:
  one clicked the main Reports tab strip instead of Season's own sub-nav and
  left the tab it was testing; one measured a route that a prior block had
  navigated away from, so page overflow was trivially zero on an unrendered
  board; one checked a type floor on a chart the fixture never let render.
  Each was green, and each was found by review. Assert that the subject is on
  screen before asserting anything about it.
- **Never redefine a test's threshold to match what the implementation
  achieved.** Meet the requirement or stop and report the exact conflict.
  Disclosure in prose does not substitute for a test that holds the line.
- Mutation-verify: reintroduce the defect, confirm the assertion reds naming
  it, restore, confirm green.
- Baseline "pre-existing" against committed HEAD, never against your own
  uncommitted work.
- Never run two full gates concurrently, and never touch processes while one
  runs — killing a browser mid-run corrupts the result.
- Puppeteer cannot certify installed WebView2 behavior: film codecs, the asset
  protocol, native dialogs, filesystem scope, and app lifecycle are only real
  on the installed desktop build.
- A release is not certified by its builder alone.

---

## Working agreement

- **Reproduce before fixing.** Verify a reported finding against source before
  accepting it; several have been wrong.
- **Fix at the root, one change at a time.** Do not stack patches.
- **Sweep the container, not just the file you are editing.** One stranded
  reference usually means the whole container is stranded.
- **A check must be as strong as its name.** An assertion that cannot fail for
  the reason it claims is not coverage.
- **Commit the first working pass before revising it.** A coherent deliverable
  gets a local commit as soon as it exists, so revisions have a restore point
  and a reviewer has something fixed to read. Local is enough -- a reviewer
  works this branch on this machine; a push is a separate decision.
- **A design comp's decisions live in its RATIONALE.md, and every commit
  touching a comp must name that file.** The comp directory is the deliverable;
  the RATIONALE is where the production-to-comp mapping and the open approval
  decisions are recorded, including any deliberate divergence from an already
  accepted screen. **Reviewing a comp means reading its RATIONALE** -- a
  divergence stated only in chat or only in a commit body is not recorded.
- Commit at every baton pass. One builder and one independent reviewer per
  increment; documentation and the handoff are updated before the baton passes.
- **Working tree:** never `git add -A` or `git add .`. Stage named paths. Never
  reset, clean, stash, or absorb another agent's uncommitted work — this repo
  carries untracked installers, artifacts, design comps, and scratch files that
  must survive. A `git add -A` once swept 267 local-only files, including real
  team film, into history.
- **Shell on this host:** bare `bash` is not on the PowerShell PATH, and the
  agent Bash tool fails with `ENAMETOOLONG` on `uv_spawn`. Git Bash itself works
  through its explicit path. Use PowerShell for ordinary work, and for the gate
  use the invocation documented in `docs/TESTING.md`:
  `& 'C:\Program Files\Git\bin\bash.exe' -lc 'cd /c/Users/charl/Charlie && bash tools/run-gate.sh'`.
  `--self-test` only proves the failure detector and runs no harness.
- Do not commit `dist/`, `node_modules/`, or `src-tauri/target/`.

---

## Durable lessons

Full accounts are in the archive; these are the ones that still change how you
should work.

- **A green gate is not a correct app.** Whole-app review has repeatedly found
  real defects behind a fully green suite. The gate tests what it was written
  to test.
- **Cross-game and cross-season state must be scoped and stress-tested.** Two
  data-corruption bugs shipped past 250+ green assertions because nothing fuzzed
  real operation sequences. `e2e-integrity` exists for exactly this.
- **A display bug is not a data bug.** "Tagged plays show as untagged" was twice
  a renderer defect with correct data on disk. Reproduce against the shipped
  artifact before concluding data is wrong — and inspect each renderer
  separately, since they read the same data through different code.
- **Explicit beats inferred.** Prefer a real field over parsing another field
  (`runPass` over play-type string matching).
- **Filter gates must match the data's unit.** Gating a defensive query on an
  offensive field silently drops rows.
- **Never trust `window.confirm()` for in-form actions** — browsers suppress
  repeat dialogs, which silently returns `false`. Use the in-app confirm.
- **Tauri's asset protocol is `http://asset.localhost` on Windows**, not
  `https://`. Both origins must stay in the CSP.
- **Inherited `color` is a computed value, not a live `var()`.**
- **Multi-value tags are `" + "`-joined strings** so every string consumer keeps
  working; analytics split and attribute to each component.
