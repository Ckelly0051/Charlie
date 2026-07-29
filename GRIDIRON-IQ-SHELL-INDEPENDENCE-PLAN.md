# GridIron IQ — Shell Independence & Redesign Plan

## ⚠ REVISION LOG — read this before acting on anything below

*This plan is edited between checkpoints. You read its current state, not a diff,
so every change that alters what the plan **requires** is logged here with a date,
a commit, and a reason. If the newest entry is unfamiliar, re-read the sections it
names before building.*

**`9ddddf7` · 2026-07-28 · Codex · S4-a BUILT — awaiting independent review**

- The coach explicitly opened S4 after accepting the S3 repair. This supersedes
  the stale active **S4 BLOCKED** warning below; the older `f86c7e6` entry remains
  as history explaining why milestone smoke builds matter.
- S4-a adds the native popover primitive and replaces the legacy More menu,
  Import Plays modal, and Keyboard Shortcuts modal with native-owned surfaces.
  The retired import/shortcuts nodes and binding code are deleted, not hidden.
- Full canonical gate: **70/70 green, 0 skipped, 0 failed**; `cargo check` clean.
  No season schema, analytics formula, film path, film file, migration, package,
  tag, or release changed.
- S4 remains open pending Claude's independent review and migration of the
  remaining legacy overlays. A published build is still prohibited until the
  milestone release protocol says otherwise.

**`f86c7e6` · 2026-07-28 · Claude · CHANGES WHAT IS REQUIRED — affects S4 and S5d**

- **S4 is BLOCKED.** It may not start until a local installer is built from HEAD
  and the coach has smoked it. See the ⛔ block in **Status** below.
- **§8's milestone installers were upgraded from a bullet to an ACCEPTANCE
  CONDITION.** A milestone that §8 names is not accepted until its installer
  exists and has been smoked. This is now part of the review checklist, next to
  the gate.
- **§8 gained a second required installer BEFORE S5d**, not only after. S5a–c
  back out cheaply; the ownership flip does not.
- **The Status line's release rule was corrected.** It read *"No package, tag, or
  release is permitted during the S-milestones,"* which scans as a blanket ban.
  Published releases are still barred; **local unpublished milestone installers
  are REQUIRED.**

**Why:** §8 has required milestone installers since the original revision — it was
Codex's own finding #12, *"one installer at the very end is too late."* Claude
wrote it in, then reviewed **S2 — the exact milestone §8 names — and accepted it
without enforcing it. Then did the same at S3.** Meanwhile HEAD reached **37
commits past `deeb8ba`**, the source of `1.12.0-12` and the newest installer that
exists. The build system was replaced and Reports, Team & Film Settings and Team
Hub were rebuilt as native routes — **none of which has ever run on the coach's
machine.** `v1.12.0-8` passed a green gate, looked plausible, and failed in ten
minutes of real use; that is why C1/C2 exist. Nothing about the S-milestone code
is in doubt — the gate is 70/70 — but the one defect class that has actually hurt
this project is the class the gate cannot see.

**Nothing else changed.** No milestone scope, sequence, exit gate, frozen
contract, or technology decision was altered by this revision.

---

**Plan roles:** Claude authored · Codex reviewed (3 rounds) — *these are not the
implementation roles.*
**Implementation roles:** **Codex builds · Claude independently reviews** each
committed checkpoint.

**Application baseline: `deeb8ba`** — the exact 1.12.0-12 source that passed
60/60 and produced the smoke installer. All runtime measurements are taken
against this commit.
**Planning baseline:** the atomic commit containing this revised plan, the Team
Hub specification, the overlay specification, and the revised Plan design card.

**Status: P0, S1, S2, and S3 are COMPLETE AND ACCEPTED. S3 — native Team
Hub / Season Library — was accepted at repair `f502be6`
(Claude, 2026-07-28), after a CHANGES REQUESTED first pass at `9d3b929`.
Canonical gate re-run independently: **70/70 green, 0 skipped, 0 failed**.
R1 was root-caused in production (`Array.isArray` on an explicitly empty
overlay action list) and mutation-verified; the mutation showed the real
defect was **input truncation in every form-owned native dialog**, not a
flaky test. §1.3 is closed: the classic outlet is never revealed, so **S7 can
delete it**. **S4 — remaining legacy overlays — is OPEN. S4-a is built at
`9ddddf7` and awaits Claude's independent review.** N6 (popover) is now
implemented; the native More menu, Import Plays sheet, and Keyboard Shortcuts
dialog have replaced their legacy owners.

**Release rule (unchanged in substance):** no **published** package, tag, or
release during the S-milestones. **Local, unpublished milestone installers are
REQUIRED, not merely permitted** — see §8. A milestone that §8 names is not
accepted until its installer exists.

**D1–D4 are CLOSED** at `38ef2c9`, independently accepted 2026-07-28: the
inventory is 68 capabilities with 14 named critical ids, multi-angle has a real
6-assertion journey, the arbitrary length floor is gone, and the exit audit now
declares itself a composition audit. Gate **67/67, 0 skipped**; the capability
floor, multi-angle drift correction and destroy-time focus cancellation were each
mutation-verified.

**Carried into the S-milestones — not optional:**
- **N1–N3 CLOSED** at `8fd15db`; N2 and N3 mutation-verified independently.
  **N6 (popover) remains open and S5b needs it.**
- **R1–R2 CLOSED** at `8fd15db`: 40 byte-distinct captures across 4 viewports,
  and Film Room now genuinely renders Film Room.
- **S2-1 CLOSED at `f78d9e4`:** pre-game Settings proof again clicks and asserts
  the native sheet opened; the capability audit now rejects bare DOM-existence
  evidence for behavior/a11y claims.
**Design system:** claude.ai/design → *GridIron IQ — Design System*; source in `design-system/`.

**Goal:** the finished application no longer depends on hidden legacy `#app`
markup, `#wsClassicOutlet`, DOM reparenting, or restore/remount lifecycle — and
each route lands in its intended product-quality form rather than being migrated
now and redesigned later.

---

## 0. Scope corrections this plan makes to its brief

1. **The six-route list is incomplete**, and the omissions are what pin
   `#wsClassicOutlet` in place (§1.3).
2. **Look-and-feel is bundled with the migration, not deferred** (§10).
3. **The single-file, zero-build production constraint is retired — but a
   browser-testable build is preserved.** Windows is the distributed product;
   that does not mean the app may stop running in Chromium. The 60-harness gate,
   `BrowserBackend`, and emergency season inspection all depend on it.

---

## 1. Dependency inventory (MEASURED against `deeb8ba`)

**Reproducibility:** `tools/audit-shell-deps.mjs` ships in the *planning-baseline*
commit and did not exist at `deeb8ba`. It is therefore executed by checking out a
**temporary `deeb8ba` worktree** and running the audit tool from the planning
commit against it. Re-run this way after every milestone; do not trust the table.

### 1.1 Route hosts — native vs. relocating

| Route | Host | Native? | Relocated legacy nodes |
|---|---|---|---|
| Home | `#wsHome` | **Yes** | none |
| Study | `#wsStudy` | **Yes** | none |
| Plan | `#wsPlan` | **Yes** | none |
| **Reports** | `#wsReports` | No | `#statsDashboard` |
| **Break Down** | `#wsBreakdown` | No | `.video-section`, `.tag-section`, `#playGridSection` |

Reports and Break Down only *appear* native — they are hosts wrapped around
relocated legacy elements.

### 1.2 Legacy residue: 99 element ids still inside `#app`

`.top-bar` (film-input cluster LIVE) · `.main-content` (**empty husk**) ·
`.wizard-bar` · **`#libraryOverlay` (LIVE, load-bearing)** · **`#seasonOverlay`** ·
`#shortcutsModal` · `#playImportModal` · `#quickChartPanel` · `#undoToast` ·
`#drawerScrim` · `#btnCloseStats`. Already on `body`: `#settingsDrawer`, `#gameModal`.

### 1.3 The omission that blocks the goal

`WorkspaceShell._openLibrary()` **must** reveal `#wsClassicOutlet` because Team
Hub / Season Library renders inside the relocated `#app`. This produced the
coach-facing defect found twice via `⋯`. **The outlet cannot be deleted until
Team Hub is native** — and neither Team Hub nor the modal layer was in the brief.

### 1.4 Cross-route coupling

Study and Plan call `StudyScreen._watch()` → `switchToGame` + `CutupPlayer`, i.e.
**the Break Down video stack**. Break Down is therefore not isolatable, and the
film service must be extracted before any route migrates (§3 P0).

---

## 2. Target architecture

### 2.1 Technology — decided, fixed

**Vite + Preact. No Shadow DOM. Route views only.** Engines remain plain ES
modules. This decision is locked and does **not** get reopened by component-library
preference: P0 may evaluate Carbon Charts via its framework-neutral core API or
`preact/compat`, and **if Carbon fails film-link equality, accessibility, bundle
or compatibility requirements, Carbon is rejected** — the app does not migrate to
React for an optional chart library. **Native tables stay GridIron IQ components.**
Carbon is inspiration, not application architecture.

### 2.2 Build and test cutover (P0)

- Vite produces **`dist/index.html`**; Tauri keeps `frontendDist: "../dist"` (unchanged).
- **Measured coupling (corrected at P0-a): 42 executable references across 41 of 60 harnesses** hardcode the
  single-file bundle — 36× `new globalThis.URL('../football-film-analyzer.html',
  import.meta.url).href`, 2× `path.join(...)`, 1× `path.resolve(...)`, and the parity guard. All are replaced by a
  **shared test-entry resolver** so the entrypoint moves in exactly one place.
- **The canonical gate targets the Vite build by P0 exit.**
- `build.sh` and the single-file bundle survive **temporarily as baseline/reference
  artifacts only** — never release targets — and are deleted in S7.
- **`package-lock.json` committed; Vite/Preact toolchain pinned.**

### 2.3 Ownership

- **Each route owns** its markup, lifecycle, event binding/teardown, responsive
  layout, and stylesheet.
- **Shared controllers receive explicit elements/state.** `VideoController`,
  `PlayTagger`, `HistoryManager` currently locate DOM by global id in their
  constructors — reparenting exists *precisely because* of that.
- **One authoritative route and one owner per visible control**, enforced by a
  journey-based capability gate (§7).

### 2.4 What is frozen — contracts, not filenames

**Freeze data semantics, analytics outputs, parity goldens and persistence
fingerprints. Do not freeze filenames.** Native Reports must separate computation
from render behavior currently inside `stats-engine.js`; storage and video
controllers contain global DOM lookups that must become injected. **Reviewed,
additive dependency-injection seams are permitted** in any file, provided the
frozen contracts above are unchanged and proven so.

---

## 3. Migration sequence

### P0 — foundations. Exit gate in §3.1.

- Vite + Preact scaffold; test-entry resolver; gate on the Vite build; lockfile.
- **Native overlay host + dialog/sheet/toast primitives** (so Settings lands once).
- **Shared film-navigation / cut-up service**, composite-ref equality pinned.
- Capability inventory, exercised as journeys.
- Design primitives (`design-system/tokens.css`) + embedded Plex
  (`tools/bundle-plex.mjs`) + a check that route stylesheets consume tokens.
- Operation-scoped data-diff harness (§6.2).
- Team Hub + overlay interaction specs (already written; see companion docs).

### P0 checkpoint status

- **P0-a — COMPLETE. Foundation and repair both ACCEPTED (Claude, independent,
  2026-07-27).** F1–F7 are genuinely closed: F1 confirmed by re-reproducing the
  original CORS failure (0 errors after), F4 mutation-proved on both newly
  covered inputs, full canonical gate re-run **60/60, 0 skipped**. A pre-repair
  baseline run proved the **Vite build renders pixel-identically to the legacy
  bundle across all ten visual surfaces**. Two pre-existing follow-ups recorded,
  neither blocking: `tools/shots.mjs` navigation is stale (5 of 10 captures
  duplicate an earlier surface; Break Down and Film Room both capture Home) and
  it shoots one viewport where release-gate row 4 requires four. **P0-b is
  unblocked.** Detail below and in `CLAUDE.md`.
  - Scope delivered: pinned Vite/Preact build (`8.1.5` / `10.29.7` /
    `2.10.6`), runtime asset preservation, the shared loopback test entry, all
    41 affected harnesses migrated to it, the canonical gate targeting the Vite
    build, and a committed lockfile. Repair `63b75f1` then closed a
    self-contained legacy reference build, the canonical visual-harness entry,
    the Tauri pre-build hook, complete freshness inputs, removal of the
    duplicated SQL resources, corrected package ignores, and documented runtime
    icon ownership.
  - **Correction to the repair note:** it records a "10-surface visual run."
    Ten files are written, but only **7 are distinct renders** — see R1 in
    `CLAUDE.md`. Do not treat `shots.mjs` output as surface coverage until R1
    is fixed.
- **P0-b — ACCEPTED (Claude, independent, 2026-07-27).** Journey 31/31, full gate
  **61/61, 0 skipped**; inertness mutation-verified; cross-system Escape ownership
  proved against the real legacy settings drawer; no layout side effect (all ten
  captures byte-identical to P0-a). **Seven findings — N1 buried-overlay promise
  never resolves, N2 destructive Cancel default is convention not code, N3
  body-appended nodes escape inertness — all three must close before S2/S4.
  None block P0-c.** Detail in `CLAUDE.md`. Build summary follows.
- **P0-b build summary (Codex, 2026-07-27):** one body-level
  Preact host; injected overlay service; dialog/sheet/toast primitives; and a
  test-only real journey proving focus, keyboard, stacking, responsive behavior,
  data no-op, service replacement and clean unmount. Focused journey 31/31; full
  canonical gate 61/61; normal product pixel-identical to P0-a captures. No
  legacy overlay migrated and no coach-facing workflow changed.
- **P0-c — ACCEPTED (Claude, independent, 2026-07-27).** Exact composite-ref
  equality mutation-verified; `StatsEngine._watchPlays` proved structurally
  game-local so it cannot mis-stamp a cross-game play; N4 confirmed closed. Full
  gate **62/62, 0 skipped**. Three findings, none blocking: divergent
  select-first session restore, silent no-op when `filmNavigation` is unset, and
  `_restoreFocus` giving up to `body`. Detail in `CLAUDE.md`. Build summary:
  `FilmNavigationService` is now the one playback owner for Study, Reports and
  Plan. Callers submit exact `gameId::playId` refs; translation to bare ids
  happens only after the owning game loads. The service owns film-health
  preflight, one launch save, transient game hops, cancellation/replacement,
  honest unavailable accounting, and launch-game restoration. Reports retains
  its explicit no-video select-first fallback. Focused contract **21/21**;
  Study/Plan **56/56**; three critical mutations red independently (neighbor
  leak, transient-origin overwrite, false completed load failure). The full
  canonical gate is **62/62 green, 0 skipped**, including synthetic + real-data
  parity and integrity. The first full run exposed P0-b N4 as deterministic:
  Escape focus raced Preact inert cleanup. Fixed with one close-focus owner and
  readiness-based restoration; overlay journey is **31/31 three consecutive
  runs**. N1–N3 remain required before S2/S4; N5–N7 stay scheduled.
- **P0-d — ACCEPTED (Claude, independent, 2026-07-27). P0 COMPLETE; S1 OPENS.**
  Capability-audit drift and both design-token rules mutation-verified; Plex
  bundled as 6 base64 WOFF2 faces; tokens namespaced `--gi-*` only, and all ten
  visual captures byte-identical to P0-b so nothing shifted. Gate **66/66, 0
  skipped**. Four findings; **D1 (the inventory omits Undo/Redo/Shortcuts —
  three of the four capabilities previously found entombed — plus drawing tools,
  Quick Chart, CSV/import, Call Sheet, version history and roster) and D2
  (multi-angle has zero harness coverage) must close before S5.** Neither blocks
  S1. Detail in `CLAUDE.md`. Build summary:
- **P0-d post-acceptance D1-D4 repair (Codex, 2026-07-28; independent review
  requested).** The executable inventory now owns 68 capabilities, including
  Undo, Redo, Shortcuts, drawing, Quick Chart, projected CSV import/export,
  Call Sheet, restore points, roster, and four multi-angle outcomes. A new real
  browser journey proves second-angle load, transport/drift sync, side-by-side,
  PiP, V-key/click swapping, and teardown. Count-based completeness claims were
  replaced by named critical capability ids. The final P0 audit is explicitly a
  **composition audit** and now checks required Team Hub/overlay contract clauses
  rather than file existence. Drift, missing-id, and missing-spec mutations each
  turned their owning guard red before restoration. **D1-D4 are closed; none
  remain carried into S1-S7.** The first full gate also exposed and closed an
  existing timer-based Game Settings focus race; keyboard focus now lands
  synchronously and is mutation-proven. A second gate run exposed stale focus
  restoration surviving overlay-service destruction; service-owned cancellation
  tokens and a ten-frame regression now close that race too. Final canonical gate
  on exact final bytes: **67/67 green, 0 skipped, 0 failed**.
- **P0-d build summary (Codex, 2026-07-27).** A 54-item executable
  capability inventory covers ten migration surfaces and binds every coach outcome to an exact
  live journey assertion. A canonical operation-diff harness proves route navigation is a season
  no-op, game selection changes only `activeGameId`, and tag/Game Info edits change only their
  declared target paths while non-target plays/games remain byte-identical. Bundled Plex and
  semantic tokens are now imported by the native root; enforcement rejects raw route colors,
  legacy `--ws-*` fallbacks, undefined tokens, and local font stacks. The final P0 audit is 13/13.
  P0-c advisories are closed, and self-review also fixed unresolved Watch requests failing to
  replace an active cross-game reel. Full canonical gate **66/66 green, 0 skipped**; Tauri
  `cargo check` clean. Four new permanent harnesses: `e2e-p0-capabilities`,
  `e2e-operation-diff`, `e2e-design-system`, `e2e-p0-exit`. No schema, durable season data,
  analytics formula, film file, package, or release changed. N1-N3 remain required before S2/S4.
- **Historical P0-d scope:** journey capability inventory, operation-scoped data-diff harness,
  design-token enforcement, and final P0 exit audit.

### S1 checkpoint — BUILT by Codex; awaiting Claude review (2026-07-28)

Reports is now a Preact-owned route instead of a relocated legacy dashboard. `StatsEngine.setDashboardTarget()` is the explicit presentation seam; StatsEngine remains the sole formula owner. The native route owns eight coach-facing views, perspective-first navigation, keyboard-accessible film actions, responsive containment, and canonical export commands. The old dashboard stays inert under `#app` as `#legacyStatsDashboard` only for compatibility and is restored exactly when the shell is disabled.

Football semantics are explicit: self scout provides Overview, Offense, Defense, Special Teams, Players, Self-Scout, Season, and Matchup. Opponent offense and defense combine head-to-head and opponent-film scout games while preserving `gameId::playId` identity. Opponent Special Teams uses only games explicitly marked `gameInfo.perspective === 'scout'`; head-to-head ST is disclosed and excluded because the stored record cannot honestly identify whose ST event it was. No data is inferred or rewritten.

Permanent proof includes `tools/e2e-native-reports.mjs` (15/15), all eight views, exact self/opponent film refs including duplicate bare play ids, scout-only ST, four exports, 44px mobile controls, internal tab scrolling, and zero page overflow. The capability inventory is 73 entries with 18 named critical ids. Import Plays is now a named critical journey, and specification checks require real Markdown section headings rather than loose substrings.

Three critical mutations were run and restored: removing opponent `__gid` stamping reds exact film identity, admitting head-to-head ST reds the ST cohort and Watch cuts, and retaining the old dashboard id reds native single ownership. The first full gate exposed two stale test contracts rather than production defects: timer-based overlay waits and onboarding assumptions about the removed modal/player-on-Overview layout. Both were replaced with state-based assertions. Final canonical gate on the completed checkpoint: **68/68 green, 0 skipped, 0 failed**; desktop `cargo check` is clean. No analytics formula, season/play/tag data, persistence schema, film metadata, film file, package, tag, or release changed. S2 was subsequently accepted at `8fd15db`.

### S2 checkpoint — native Team & Film Settings (accepted)

One Preact-owned sheet now owns first-use film-storage choice, library-root
selection, per-game source/path/clip-health truth, Team identity, and the bridge
to not-yet-migrated advanced settings. Desktop remains a non-modal workspace;
narrow screens become modal and inert the route. Root changes and per-game links
remain separate transactions. Linked means play in place/no copy; Managed is an
import default and cannot rewrite an existing linked game. No film is moved or
deleted by Settings.

N1-N3 are closed and mutation-proven. S1's visual nits R1/R2 are closed by a
failing 40-capture harness covering ten distinct surfaces at all four release
viewports. That harness found a real hidden-Quick-Chart ownership defect; the
live panel is now adopted into Break Down and restored on internal teardown.
Permanent S2 proof is `e2e-native-settings.mjs` (13/13), with storage setup
30/30, shell 58/58, overlay 34/34, Breakdown video 50/50, and full gate 69/69.
No analytics/schema/data migration, film deletion, package, tag, or release is
part of S2. Independently accepted by Claude at `8fd15db`; S3 opened.

### S3 checkpoint — native Team Hub / Season Library (repair `3f40216` awaiting independent re-review)

Checkpoint `f78d9e4` replaces the legacy Season Library overlay with a native
Preact Team Hub route. Team Hub owns team and season selection while Home remains
the sole game-entry route. Startup and every Seasons action enter the native
route without revealing `#wsClassicOutlet`; closing returns to the exact guarded
invoking route.

The route implements first-team setup, multi-team switching, scoped rosters and
season lists, season create/open/delete, sample season, pre-game Settings, and
honest current-season film health. Team switches persist the outgoing season
before identity changes and fail closed. Delete messaging names game/play impact
and distinguishes managed copies from linked originals.

S3 also fixes two ownership defects exposed by the route: created seasons and
sample seasons now persist their registry `teamId`, and workspace context prefers
that registry owner over sample/display metadata. This is additive create-flow
ownership, not a bulk data migration. No existing coach tags, analytics,
film paths, or film files are rewritten or deleted.

Claude returned the first S3 checkpoint with R1-R4. Repair `3f40216` fixes
the form-dialog focus race, restores native five-step Setup Progress, adds it to
the critical capability floor, and restores the literal pre-game Settings click
proof. Permanent proof: Team Hub 18/18, onboarding 32/32, native overlay 35/35,
film-storage setup 30/30, workspace shell 57/57, Film Room 179/179, and full
canonical gate **70/70 green, 0 skipped, 0 failed**. The overlay, onboarding,
and pre-game Settings guarantees each red under their exact mutation. Visual
proof is 44 byte-distinct captures across four release viewports in
`_shots-s3-repair/`, with no page overflow or page errors. Independent aesthetic
inspection remains required because Codex's image helper was blocked by the
Windows ACL sandbox. S4 opens only after Claude accepts `3f40216`.

### S1 — native Reports · S2 — native Team & Film Settings · S3 — native Team Hub / Season Library · S4 — remaining legacy overlays · S5 — native Break Down (a video/strip · b Film Room · c tag form · **d single ownership flip**) · S6 — audit Home/Study/Plan · S7 — delete `#wsClassicOutlet`, `#app`, restore paths, `build.sh`, dead CSS.

### 3.1 P0 exit gate — all required before S1 opens

1. Vite + Preact **browser build and Tauri build both work**.
2. **All 42 executable references (41 files) migrated** to the shared test-entry resolver.
3. Canonical gate **targets the Vite build**; lockfile committed, toolchain pinned.
4. One test route proves **explicit service injection and clean unmounting**.
5. **Native overlay host** + dialog/sheet/toast primitives exist.
6. Shared **film-navigation service preserves exact composite refs** for Study,
   Reports and Plan.
7. **Capability inventory exercised through real user journeys**, not geometry.
8. **Team Hub and overlay interaction specifications complete.**
9. **No intentional user-visible workflow, analytics result, persistence
   semantics, schema, or durable season data changes.** (P0 *does* change
   production architecture — DI, overlay host, film navigation — by design.)

---

## 4. Atomic route replacement

No user-facing classic/new toggle. A route flips to native ownership only when
its full capability checklist passes, in one commit. **No silent legacy fallback
after a route is declared migrated** — it must fail loudly. Internal
build-alongside is permitted; a *user-reachable* half-migrated route is not.

---

## 5. Capability parity, not visual parity

Preserve every useful football workflow and data field. Do not preserve weak
layouts because they exist. Any intentionally removed or materially changed
capability goes on an explicit list for coach approval **before** the milestone commits.

---

## 6. Non-negotiable integrity contracts

1. **No season / play / tag / film / catalog / backup / analytics-schema migration**
   without an impact report and explicit coach confirmation.

2. **Operation-scoped data diffs — not a global exclusion list.** A global
   "volatile fields" list would hide real corruption in `activeGameId`,
   `currentPlayId`, timestamps or plan metadata. Instead:
   - Normalise both fixture copies **once** before comparison.
   - **Every tested journey declares the exact paths it may modify.**
     - Route navigation → **no** season-data changes.
     - Selecting a game → only the expected active-game / session pointers.
     - Editing a tag or Plan item → only that declared object plus its
       legitimate timestamp.
     - **Every other path, and every non-target game, must be identical.**
   - Backend index fields (`lastOpened` etc.) tested **separately** from the
     canonical season payload.

3. **Analytics-to-film reference equality stays exact** (composite `gameId::playId`).
4. **Linked film never silently falls back to managed copies.**
5. **Undo, save/reopen, cross-game isolation, failure rollback stay pinned.**
6. Managed C: film copies remain protected throughout.

---

## 7. Definition of done

- No production dependency on `#app` or `#wsClassicOutlet`; both deleted.
- No production DOM reparent/restore lifecycle.
- **Capability gate is journey-based:** the permanent test **drives the real
  route/menu/dialog path, focuses or activates the control, and verifies the
  outcome.** Geometry is supporting evidence only — an affordance can sit inside
  the viewport and still be unreachable through navigation.
- No hidden duplicate navigation or controls.
- No legacy CSS governing native screens; no raw hex in route stylesheets.
- All capability, integrity, responsive, a11y and real-data gates pass.
- Four-viewport review (1440×900 / 1280×800 / 768×1024 / 390×844) + installed
  real-film smoke.

---

## 8. Delivery protocol

- **Codex builds; Claude independently reviews each committed milestone.**
- One coherent commit boundary per milestone; `CLAUDE.md` + this plan updated at
  every baton pass; full gate output captured to a file.
- **Local (unpublished) milestone installers after:** native Team & Film Settings ·
  Break Down ownership flip · final legacy deletion. Browser tests cannot prove
  Windows folder dialogs, linked-film paths, playback or Tauri lifecycle.
  **This is an ACCEPTANCE CONDITION, not a suggestion: the reviewer does not
  accept a milestone named here until its installer is built and the coach has
  smoked it.** Add it to the review checklist alongside the gate — it was missed
  at S2 and again at S3 precisely because it lived only in this section.
  **Also build one BEFORE S5d,** not just after: S5a–c are cheaply reversible and
  the ownership flip is not, so the coach should have used the native Break Down
  pieces while backing them out is still cheap.
- One clean versioned smoke build after the complete migration is accepted.

---

## 9. Design system (decided)

**Thesis — broadcast control room, not dashboard.** Two worlds: **THEATER** (film
below the app floor, chrome recedes) and **DECK** (data surfaces, denser and
brighter). The contrast between them is the design.

**Type — IBM Plex.** Sans interface · **Condensed for every football number** ·
Mono for data/labels. Embedded via `tools/bundle-plex.mjs` exactly as Barlow is
today — production has never fetched a font and will not start. *Football numbers
are atomic: condensed, tabular, `nowrap`, sized for the worst real case (`4 & 26`).*

**Color — Radix-style 12-step role scale, tuned cool.** 1–2 surfaces · 3–5
interactive · 6–8 borders · 9–10 solid · 11–12 text · `--gi-film` below step 1.
**Broadcast semantics:** LOS blue = CURRENT · first-down yellow = TARGET ACHIEVED ·
red = turnover/destructive · green = system health only.

**Density — pointer-dependent.** 28–30px desktop, 44px under `pointer:coarse`.

**The tagging form is the density problem.** Measured: **53 fields, 151 chips.**
Fixes: pointer-dependent density; **resolved fields collapse**; keyboard hints.
**Multi-select fields (Formation, Play Type, Result, Front, Blitz) stay open until
Done / Enter / navigation** — only single-select may collapse on selection.
Keyboard hints appear **only where a shortcut genuinely exists** (custom library
values have none). Validate on a realistic 20-play charting session before S5c.

**Geometry, motion — defaults, not acceptance gates.** Square, one diagonal
(the lower-third), motion tokens with `prefers-reduced-motion`. These never
outrank legibility, focus states or charting speed; breaking them requires a
**recorded justification**, since unenforced conventions measurably decay.

**Carbon and others — take the structure, refuse the brand.** Carbon's layer
model, table anatomy and 8px rhythm; Radix's color architecture; Spectrum's
content-is-hero. **Refuse** Carbon's neutral greys, IBM Blue as primary, and its
32/40px controls. **Carbon governs data surfaces; never the theater.**

---

## 10. Look and feel: bundled, not deferred

A native route is new markup by definition, and "no legacy CSS governing native
screens" leaves only two options if the legacy look is kept — copy the old CSS
forward under a new name, or keep referencing it. Visual change is entailed.

**BUNDLE:** the approved direction applied to markup being rewritten anyway, with
a per-route visual target approved **before** the milestone starts.
**DEFER:** open-ended exploration, which has no exit criteria.

**Resolving the signal loss bundling creates:** capability parity is verified
**behaviourally** (data, film-ref equality, persisted bytes), never visually;
**pixel baselines are captured AFTER a route migrates**; a milestone holds
constant data, film references and the capability set — not pixels.

**Consistency is a per-route exit criterion, not a closing phase.** Measured token
drift (`reports-screen.css`: 0 tokens / 23 raw hex, the newest file being the
worst) happened precisely because consistency was not gated per route. Only
cross-route motion and the final viewport review belong at the end.

---

## 11. Per-route direction

| Route | Direction |
|---|---|
| **Reports** (S1) | **Football-context model: self/opponent perspective × offense/defense/Special Teams**, with capability parity against the *full* analytics inventory — defensive analytics, Special Teams, penalties, tries, player box scores, self-scout, opponent scout, Big-12 calls, and every existing export. Film-linked throughout: every mark is a cut-up. |
| **Settings** (S2) | Storage truth: library root and per-game folder as visibly separate scopes; Linked vs Managed copy per game with resolved path and clip count; copy states that linking never copies, root changes never re-link, repair never creates/deletes plays. |
| **Team Hub** (S3) | See `GRIDIRON-IQ-TEAM-HUB-SPEC.md`. |
| **Overlays** (P0/S4) | See `GRIDIRON-IQ-OVERLAY-SPEC.md`. |
| **Break Down** (S5) | Theater + deck. Drive-grouped play strip, yard grid inside the film, collapsed-field form, pinned commit bar. **Ease of use, speed and accuracy are paramount — nothing may compete with charting.** No suggestion/"tell" surface here (moved out; Study is the candidate home). Open: drive strip may need scroll/zoom at 14 drives. |
| **Study** (S6) | Pivot: any dimension × any dimension, measure switcher, min-sample control, totals, every cell a cut-up. Under-sample cells dimmed and labelled, never hidden. Candidate home for the tell surface. |
| **Plan** (S6) | Findings grouped into a real game plan with linked play counts and watch actions. **Presentation preview moves to a bottom horizontal strip** (decided): follows Plan order, scrolls horizontally **without page overflow**, preserves selection and Watch actions, works by **keyboard and touch**. |
| **Home** | Continue-where-you-left-off hero with progress by unit; film inbox as honest health surface (ready/partial/missing) with resolved path and clip counts. |

---

## 12. Review history

Codex returned CHANGES REQUESTED three times before approving this revision for
application. Corrections incorporated: stale baseline (`2362bfb` proved to be an
*ancestor* of the repair batch); over-broad retirement of browser compatibility;
undecided framework; "off-limits files" contradicting required DI work; Settings
sequenced before its overlay owner existed; a byte-identical season check that
contradicts known-correct normalisation; offense-centric Reports; cross-route
playback audited too late; unvalidated multi-select tagging collapse; visual rules
treated as gates; two undesigned foundational surfaces; a single end-of-project
installer; rectangle-based capability checks; the build/test cutover left
unspecified; and P0's inaccurate "no production behavior changes" wording.
