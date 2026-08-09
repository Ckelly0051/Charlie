# GridIron IQ — Shell Independence & Redesign Plan

## 🔒 REVIEWER'S CHECKLIST — MANDATORY, RUN BEFORE WRITING ANY VERDICT

**Coach's standing rule (2026-07-29): the reviewer re-reads this plan at every
milestone. Not from memory — open it.** No verdict is written until every line
below has been checked against the plan as it currently reads.

1. **§8 Delivery protocol — does this milestone owe an installer?** §8 names
   them: after **native Team & Film Settings**, after the **Break Down ownership
   flip**, after **final legacy deletion**. A milestone that §8 names is **not
   accepted** until its installer exists and the coach has smoked it.
2. **§3.1 / the milestone's own exit conditions** — read them, do not recall them.
3. **Carried findings** — anything in *Carried into the S-milestones* whose gate
   this milestone crosses.
4. **The REVISION LOG below** — has the plan's requirements changed since the last
   verdict?
5. **Drift counter** (in `CLAUDE.md`'s handoff header) — how far is HEAD from the
   last build a human actually ran? Update it at every baton pass.

**Why this exists.** §8 required a milestone installer after S2. Claude authored
that requirement, then accepted **S2, S3 and S4-a without ever opening §8** —
because the review checklist was assembled from the *code* conditions (§3.1, §5,
§6, §7) and §8 is a *process* condition. Drift reached **42 commits** before
anyone noticed. **Every check in this project fails loudly except this one: an
unbuilt installer emits no signal at all.** The checklist is the instrument for
non-events.

---

## ⚠ REVISION LOG — read this before acting on anything below

**S7 execution plan accepted · 2026-08-09 · Claude built, Codex reviewed (3 rounds), coach approved · ADDS §13**

S6 is accepted (coach smoked `1.12.0-43`) and **S7 is open**. Its execution plan
is **§13 at the end of this document** — read it before touching any deletion.
It supersedes the one-line S7 description in §3.1 and **corrects §3.2 item 7**.

Three things in it change what §3.1 implies, all measured rather than inherited:

1. **§3.2 item 7 is narrower than written — four stranded capability ids, not
   eight.** `e2e-breakdown-form.mjs` now claims zero.
2. **The "dead CSS" is not dead.** `styles.css` (253 KB) and
   `redesign-stats.css` (21 KB) are both linked in `index.html`. S7's CSS half is
   a migration, not a sweep.
3. **`season-library.js` is not dead either.** The native Team Hub reaches into
   **12 of its private members**, including post-wipe recovery and registry
   reconciliation. Deleting it because its overlay is unreachable would break
   team switching and recovery. A `TeamRegistry` service is extracted first.

**S6 build roles + required installer · 2026-08-02 · Coach · CHANGES §8 AND WHO BUILDS**

Two changes, both by coach decision:

1. **Claude builds S6; Codex independently reviews it.** This is a deliberate,
   temporary swap of the default roles (Codex builds / Claude reviews), the same
   documented exception used for the C1/C2 closeout pass. It reverts after S6.
   **Codex is the independent reviewer for every S6 checkpoint** — a builder does
   not accept their own work, and builder self-review has already been shown here
   to under-count (the C1/C2 pass shipped 5 of 7 findings and reported "four").
2. **§8 gains a required installer after S6, before S7 opens.** S7 is the one
   irreversible commit — it deletes `#app`, `#wsClassicOutlet`, the restore paths,
   `build.sh` and the dead CSS. The coach uses the finished analytics experience
   on real film **before** that safety net is removed.

**S6 build order (coach's sequence):** Home → Study → Plan → cross-screen
consistency audit → installed milestone smoke. Each route is its own reviewed
checkpoint; the consistency audit is a separate checkpoint, not a coat of paint
applied during the third route.

Nothing else changed: S5 remains complete and accepted, S7 stays closed, the
frozen contracts and the no-analytics-regression rule are untouched.
**`1.12.0-17` · 2026-08-02 · Coach/Codex · POST-S5d SMOKE PASSED; S5 COMPLETE; S6 OPEN**

- Accepted S5d source `a4806b5` was versioned and packaged at `2d9e532`.
- Coach passed linked film, fullscreen/drawing, chart persistence, all primary
  routes, and switch/restart durability in the installed WebView2 app.
- Full evidence and artifact hashes: `SMOKE-1.12.0-17.md`.
- S6 audits Home, Study, and Plan. S7 remains closed until S6 acceptance.
**`1.12.0-16` · 2026-08-02 · Coach/Codex · PRE-S5d SMOKE PASSED; S5d OPEN**

- S5c is accepted at `9f8f065`; four-owner version stamp is `06c3576`.
- One local unsigned NSIS/MSI candidate was built from the committed stamp.
  Hashes and the stop-first baseline checklist are in `SMOKE-1.12.0-16.md`.
- This candidate validates the installed S5c baseline and desktop-only services.
  It does not expose or accept the native Breakdown composition; S5d remains the
  isolated ownership flip and receives its own installed smoke after review.
- The coach confirmed real tagging passes with no functional change from the prior
  accepted build and approved moving forward. **S5d is open.** No publication,
  tag, release, data migration, or managed-film deletion is authorized.

**S5c capability floor · 2026-08-02 · Claude · adds §3.2 item 7 — a dated S5d/S7 obligation**

`557e956` re-pointed ten capability ids onto the new native tagging harness and
eight of them silently claimed less; `2a70df8` restored them. Nothing about
milestone scope, sequence or exit gates changed. **What is new: §3.2 gains item 7**,
recording that eight breakdown ids are now claimed by `e2e-breakdown-form.mjs` and
`e2e-s5c-preflight.mjs` — harnesses S5d/S7 retire. They must be re-proven natively
at equal-or-greater strength *before* either harness goes, or the guarantees
disappear behind a green audit.

**S5 readiness audit · 2026-07-30 · Claude · CHANGES REQUESTED — adds §3.2, amends §8 and §11**

S5 is open, but the audit found six items that S5 would otherwise discover
mid-build. None require code now; all are contract gaps. **New §3.2 "S5
structural preflight" is a blocking checklist**, §8 gains an explicit S5d
rollback rule, and §11's Break Down row names the ownership S5c inherits.
Nothing about milestone scope, sequence, exit gates, frozen contracts, the
technology decision, or the design audit's UX/AX split changed.

**S4 installed smoke PASS · 2026-07-30 · Coach/Codex · S5 open**

- The coach completed `SMOKE-1.12.0-15.md` with no functional blocker. Reports
  open/populate after linked-film game changes and the S4 checklist clears.
- S4 is accepted; S5 opens. No publication, migration, identifier rewrite, or
  managed-film deletion is authorized.
- Installed design/UX findings and reviewer ownership are now canonical in
  `GRIDIRON-IQ-DESIGN-AUDIT.md`. Structural UX-1-UX-4 feed S5; shared analytics
  presentation AX-1-AX-6 resolves in S6 rather than through one-off CSS patches.
- Every visual route review now includes one source-backed displayed-value check
  and, when applicable, exact composite film-ref equality. Screenshots cannot
  certify numerically wrong output.
**`1.12.0-15` · 2026-07-30 · Codex · replacement installer built; Reports-first smoke pending**

- Claude independently accepted the installed lifecycle repair at `524b00b`.
- Four version owners were stamped at `32e05a6`; P0 exit 17/17, beta config 3/3,
  native Reports 21/21, and `cargo check` are green.
- One unsigned NSIS/MSI candidate was built from `32e05a6`; hashes and the
  stop-first checklist are in `SMOKE-1.12.0-15.md`.
- S4 remains unaccepted and S5 closed until the coach passes Reports after linked
  film auto-load, then completes the wider milestone smoke.
- Accepted P2 `F1` remains carried: the dismissed Wizard receives events and runs
  a now-safe side effect. Fix it in the next reviewed code batch or delete the
  Wizard in S7; do not alter accepted installer bytes.
- No tag, publication, data migration, catalog rewrite, film move/copy/delete, or
  managed-film deletion occurred. `1.12.0-14` remains failed evidence only.
**S4h installed lifecycle repair · 2026-07-30 · Codex · awaiting independent review**

- `1.12.0-14` failed Reports Gate 1 and must not be reused. Linked film auto-load
  advanced the dismissed legacy Wizard, whose direct `#statsDashboard` hide
  targeted the new native Reports root and left complete report markup invisible.
- Wizard now hides reports only through the canonical StatsEngine seam. A focused
  regression reproduces Home -> linked-film `video-loaded` -> Reports and is
  mutation-proven against the direct legacy hide.
- Native Analysis preferences no longer persist through hidden legacy controls;
  the form owns its submitted values and the app exposes an explicit persistence
  seam. This closes a false-success/load-sensitive key-save defect found by the
  full gate.
- `S4h-1` is closed: neutral no-data and danger failure states are separate and
  asserted by computed presentation.
- Evidence: Reports 21/21; Settings 18/18 across five repeats; final canonical
  gate 74/74, zero skipped. No coach data, film, schema, analytics formula,
  catalog, package, tag, or release changed.
- S4 remains unaccepted and S5 closed. Independent review precedes one
  `1.12.0-15` installed smoke candidate.
**`1.12.0-14` · 2026-07-30 · Codex · replacement installer built; Reports-first smoke pending**

- Claude accepted the S4g findings closure at `ba33572`.
- One unsigned NSIS/MSI replacement was built from reviewed bytes; hashes and the
  stop-on-failure checklist are in `SMOKE-1.12.0-14.md`.
- Reports is Gate 1, followed by linked-film truth and S4 essentials. S4 remains
  unaccepted and S5 closed until the coach records PASS.
- No tag, publication, managed-film deletion, or data migration occurred.
- `S4h-1` is carried as a nonblocking next-batch presentation fix: split neutral
  no-data styling from danger failure styling and assert computed tone.

**S4g findings closure / `1.12.0-14` stamp · 2026-07-30 · Codex · awaiting independent review**

- Claude accepted `e911b97`; S4g-1 and S4g-2 are closed before packaging.
- Dead `reports-screen.css` is deleted. Both the measured shell audit and
  canonical P0 gate reject any CSS file unreachable from Vite; the failure is
  mutation-proven.
- All four version owners now match `1.12.0-14`; exact consistency is a
  mutation-proven canonical gate.
- Reports empty/failure presentation is explicitly styled. Full gate 74/74,
  cargo check clean. No installer exists yet.
- After independent acceptance, build one `1.12.0-14` replacement and smoke
  Reports first. S4 remains unaccepted and S5 remains closed until that passes.

**S4 smoke failure + Reports repair · 2026-07-29 · Codex · awaiting independent review**

- Installed candidate `1.12.0-13` failed: Reports was a blank WebView2 route.
  S4 remains unaccepted and S5 remains closed.
- The repair gives native routes explicit grid viewport ownership, makes Reports
  remount/fail visibly, and corrects the Tauri IPC/font CSP violations observed
  in DevTools.
- The real-data gate now enters the actual Reports destination rather than
  calling the stats engine directly. Repaired bytes: 74/74 gate, real mirror
  13/13, cargo check clean.
- A replacement installer is prohibited until independent review. Acceptance
  still requires a new installed coach smoke; no browser result substitutes for
  the milestone rule in §8.


*This plan is edited between checkpoints. You read its current state, not a diff,
so every change that alters what the plan **requires** is logged here with a date,
a commit, and a reason. If the newest entry is unfamiliar, re-read the sections it
names before building.*

**`1.12.0-13` · 2026-07-29 · Codex · S4 INSTALLER BUILT — coach smoke pending**

- Claude independently accepted final S4 application code at `acdcf2b`.
- Required local unsigned NSIS and MSI installers were built from reviewed source
  `ed551a8`; Tauri invoked the Vite production build successfully.
- Artifact hashes and the installed-app checklist are recorded in
  `SMOKE-1.12.0-13.md`.
- **S4 remains unaccepted and S5 remains closed until the coach records PASS.**
  No published package, tag, release, or managed-film deletion is authorized.

**`ed551a8` · 2026-07-29 · Codex · FINAL S4 CODE BUILT — awaiting independent review + required installer smoke**

- S4-e is accepted at `f9247c0`. The final coupled legacy owners,
  `#settingsDrawer` and `#drawerScrim`, are deleted with the old mobile bottom
  tabs, drawer CSS, and duplicate tag-library dialog/stylesheet.
- Native Settings & Tools now owns Film, Team, Roster, Charting libraries,
  Cut-up filters, Drawing, Recovery, and optional Analysis. Desktop is a
  nonmodal working sheet; mobile uses the shared modal contract and scrolls the
  active tab into view.
- Recovery distinguishes durable whole-season restore points from current-game
  quick versions. Both await canonical persistence and fail closed with the
  live editor restored when saving fails.
- S4e-1 is closed: native Reports exports full-season HTML. Matchup and opponent
  reports no longer call `commitActive()` while reading; ephemeral live-game
  projection preserves fresh edits without changing canonical season bytes.
- Final canonical gate **74/74 green, 0 skipped, 0 failed**; `cargo check` clean.
  Whole-season restore rollback, game-version rollback, and report read-only
  behavior are each mutation-proven.
- **S4 is not accepted yet.** Claude must independently review `ed551a8`; then
  the required local `1.12.0-13` installer is built immediately and the coach
  completes the installed smoke. S5 remains closed until that passes.

**`9aebbab` · 2026-07-29 · Codex · S4-e BUILT — awaiting independent review**

- S4-d is accepted at `7c87e2b`; its test-label observation is closed in this
  checkpoint.
- The unreachable `#seasonOverlay` is retired rather than rebuilt. Home/Team Hub
  retain game/season management, More retains file commands, and native Reports
  retains the complete season analytics composition. Modal markup, listeners,
  dead render lifecycle, stale Call Sheet injection, and modal-only CSS are
  deleted.
- Season analytics no longer call `commitActive()` while rendering. A read-only
  live-game projection includes uncommitted tagger edits without rewriting the
  canonical season node. The old path failed the new byte-identity regression.
- Native Season is **8/8**; full canonical gate **73/73 green, 0 skipped, 0
  failed**. No schema, analytics formula, film path/file, migration, backup
  payload, package, tag, or release changed.
- Final S4 scope is the coupled `#settingsDrawer` + `#drawerScrim` migration. It
  must expose the durable restore-point workflow; backend-only coverage does not
  prove coach-facing parity.
**`bbaedf3` · 2026-07-29 · Codex · S4-d BUILT — awaiting independent review**

- S4-c is accepted at `494d99d`; S4-d replaces the legacy
  `#quickChartPanel` with one Preact-owned native sheet and deletes its markup,
  dead CSS, and Break Down adoption/restore lifecycle.
- The existing keyboard/tagging engine remains the behavior owner. Desktop
  stays nonmodal so film remains usable; mobile uses the shared modal contract.
  Navigation and shell teardown close the sheet instead of leaking it across
  routes.
- The focused journey pins one update, cross-game isolation, football entry
  parity, visible status, focus return, responsive geometry, and legacy-owner
  absence. It exposed and closed a duplicate `play-updated` emission.
- Final canonical gate **72/72 green, 0 skipped, 0 failed**. No schema,
  analytics formula, film path/file, migration, package, tag, or release
  changed. S4-d is not accepted until Claude independently reviews `bbaedf3`.
- At this checkpoint, `K = Kick/Punt` was deferred to a then-unnamed S5
  football-semantics pass. **Superseded by section 3.2 item 5:** S5c now owns
  stopping that invalid future write; existing stored values remain untouched
  without the coach's explicit confirmation.
**`714c372` · 2026-07-29 · Codex · S4-c REPAIRED — awaiting re-review**

- Claude returned `fa06917`: modal focus could win the race before route
  inertness, and successful close/header behavior lost explicit test owners.
- Initial focus now occurs only after the host commits modal inertness. The
  harness records route state at the exact focus call, not after settling.
- Native Game now proves successful close and both live game-header surfaces.
- Final canonical gate **71/71 green, 0 skipped, 0 failed**; native overlay
  **42/42**, native Game **16/16**, Break Down a11y **10/10**, Season tab
  **157/157**. S4-c remains unaccepted until Claude re-reviews `714c372`.
**`fa06917` · 2026-07-29 · Codex · S4-c BUILT — awaiting independent review**

- S4-b was accepted at `5619b45`; its accessibility and undo-window findings
  are closed at `9f59d39`.
- S4-c deletes the legacy `#gameModal` and replaces New/Edit Game with a native
  Preact dialog. Every user-facing New/Edit entry routes through one owner.
- Game creation/reuse, metadata assignment, and canonical persistence are one
  transaction. Cancel writes nothing; game-switch races fail closed; failed
  saves restore exact season and live-game state.
- Analytics, reports, and OCR read canonical game metadata rather than hidden
  modal fields. No schema, analytics formula, film path/file, migration,
  package, tag, or release changed.
- Full canonical gate **71/71 green, 0 skipped, 0 failed**; `cargo check` clean.
  S4-c is not accepted until Claude independently reviews `fa06917`.

**`e26ee3d` · 2026-07-29 · Codex · S4-b BUILT — awaiting independent review**

- **S4a-1 is closed in code:** the entombed legacy More markup, listeners, CSS,
  and button-specific dead bindings are deleted. The canonical hidden project
  picker is body-owned so it survives final `#app` deletion.
- The legacy undo toast is deleted; History and Updater standard outcomes use
  the native toast owner. Undo timing/action behavior is preserved.
- The first full gate found a real toast hit-target regression in Study. Desktop
  toasts now use bottom-right placement and clear the Break Down commit bar; a
  physical hit-test pins the command beneath.
- Full canonical gate **70/70 green, 0 skipped, 0 failed**; `cargo check` clean.
  S4-b is not accepted until Claude independently reviews `e26ee3d`.

**`9ddddf7` · 2026-07-29 · Claude · S4-a ACCEPTED · smoke scheduled at S4 COMPLETE**

- **S4-a is accepted.** Gate 70/70; overlay assertions 35→41, shell 57→62; N6
  popover is spec-correct and Import Plays keeps the tested engine at the seam.
  One finding, **S4a-1**: the legacy More menu (`#moreDropdown`, `#btnMoreMenu`,
  `_initMoreMenu()`) was **not** deleted despite the handoff saying it was — it is
  entombed inside the hidden outlet with its binding still running. No capability
  loss; native carries parity. **Fold the deletion into the rest of S4.**
- **Smoke timing decided (Claude's call, coach deferred it):** build the installer
  **when S4 is complete**, not mid-milestone and not before. Rationale in §8.
  The coach's framing was right — prove the structural layer before more
  structure lands on it. S5 rebuilds Break Down on top of this overlay host.
- **The `f86c7e6` S4 BLOCK is withdrawn as a gate.** It was raised after S4-a was
  already in flight; blocking work already done buys nothing. The *requirement*
  stands, moved to the S4 boundary.

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

**Status: P0 through S4 are COMPLETE AND ACCEPTED.** Final S4 native code was
independently accepted at `acdcf2b`; the installed Reports lifecycle repair
`f8c5989` was independently accepted at `524b00b`. Local installer
`1.12.0-15`, built from versioned source `32e05a6`, passed the coach's installed
functional checklist on 2026-07-30. `1.12.0-13` and `1.12.0-14` remain failed
evidence and must not be reused. No legacy S4 overlay owner remains. **S5 is
OPEN.** The active installed design findings and screenshot-plus-truth review
protocol live in `GRIDIRON-IQ-DESIGN-AUDIT.md`; UX-1-UX-4 are structural inputs to
S5 and AX-1-AX-6 are the shared S6 analytics-experience pass.

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
  **N6 (popover) CLOSED at `9ddddf7`** — spec-correct, and S5b now has it.
- **S4a-1 CLOSED AND ACCEPTED at `5619b45`:** the entombed
  legacy More owner and bindings are deleted; native parity remains tested.
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

### 3.2 S5 structural preflight — blocking, resolve before the sub-milestone named

Added by Claude's S5 readiness audit (2026-07-30). S5 relocates **three whole
legacy subtrees** — `.video-section`, `.tag-section`, `#playGridSection` — which
is more legacy surface than S1–S4 combined (audit: 62 ids still inside `#app`).
Each item below is a contract or coverage gap, not an implementation task.

1. **[before S5c] Two coach capabilities on the S5 surface have zero harness
   coverage AND zero inventory entries.** Measured: `scoreboard-ocr` → **0**
   harness hits, **0** inventory ids; `play-diagram` → **0** and **0**. The
   diagram is the more dangerous of the two: it is a **persisted play field**
   (`play.diagram`, saved with the season) with a live downstream consumer
   (`call-sheet-builder.js:180`). If S5c rebuilds the tag form without it, the
   data orphans silently and Call Sheet thumbnails disappear with nothing red.
   `applyTemplate`/`saveTemplate` (1 hit) and `copyFromPrevious` (2) are
   exercised but unclaimed by the inventory. **This is D1/D2 recurring on the
   next surface** — D2 (multi-angle) was required to close before S5 and did;
   these were never measured. Add journeys + inventory ids first.

2. **[before S5c] `gamePerspective` and `gameDirection` have no named S5 owner.**
   They still live in `#legacyGameContextState` inside `#app`. S4-c's handoff
   deferred them "to S5"; **this plan never recorded that**, so S5 would meet
   them as a surprise. Both are football-semantic, not cosmetic:
   `gamePerspective` carries the documented scout-mode / charting-unit / game-
   metadata conflation (closeout P1-3), and `gameDirection` is the offense-
   perspective side convention every Left/Right analytic depends on
   (`strength`, `playDir`, `hash`). **Owners are now assigned in the table
   below**; what remains is contracting their *lifecycle* — initial value on
   game open, behavior on game switch and reload, per-game vs per-session, and
   the rule that a context control never writes game metadata as a side effect
   (closeout Lane C). Contract that before building, the way Team Hub and
   overlays were contracted.

3. **[before S5a] The retired wizard still fires on the S5a surface.**
   `wizard.js` remains live in `#app` (`.wizard-bar`) and `goTo()` runs
   `_runStepSideEffects()` unconditionally while `_render()` returns early when
   dismissed. Probed on a default profile: `dismissed:true`, and one
   `video-loaded` advanced it **1 → 3** and ran the side effect **twice**. S5a
   owns `video-loaded`. Guard (`if (this.dismissed) return;`) or delete it in
   S5a — not S7, because S5a is what re-emits the event.

4. **[before S5c] The multi-select collapse rule is still unvalidated.** §12
   finding 9 requires validating it "on a realistic 20-play charting session
   before S5c." Break Down's own direction says nothing may compete with
   charting speed; this is that check. **Now assigned (see table): Codex
   performs and records the session before the S5c handoff, Claude reviews the
   record, and the coach spot-checks it in the S5d installer** — the only one of
   the three who charts for real.

5. **[S5c owns this] `K = Kick/Punt` is a live data bug, not a pending semantics
   decision.** Verified in source: `quick-chart.js:235` maps `'K': 'Kick/Punt'`
   and writes it to `tags.playType`, and the string **`Kick/Punt` appears in no
   chip list, no `TagLibrary` definition, and no analytics-registry vocabulary**
   (`index.html`, `play-tagger.js`, `tag-library.js`, `analytics-registry.js`:
   0 occurrences each). It is a write-only orphan: neither a valid structured
   Special Teams type nor a usable offensive play type, and every Quick Chart
   `K` press has been minting it. **S5c must:**
   - **stop writing `Kick/Punt`**;
   - **not migrate or clear existing stored values without the coach's explicit
     confirmation immediately beforehand** (standing known-bad-data rule) —
     exposure is unmeasured on the review machine, which has no season mirror,
     so the affected-play count must come from the coach's real data first;
   - **either design structured Special Teams input for Quick Chart, or remove
     the `K` shortcut until that exists.** Leaving a shortcut that produces a
     value nothing consumes is the worse of the two.

6. **[before S5a implementation decisions] UX-1 needs a falsifiable output.**
   The design audit correctly requires measuring before restyling.
   The binding deliverable compares the same exact paused frame at three stages:
   1. decoded directly from the D: source file;
   2. captured from the installed app video at intrinsic dimensions;
   3. captured losslessly from the installed window at rendered size.
   Record codec, bitrate, asset path, intrinsic/CSS/device-pixel dimensions,
   device pixel ratio, WebView zoom, and GPU state. Name the degradation stage:
   source/decode, WebView rendering, or display scaling. Also rule in or out a
   managed-copy fallback or transcode, but those checks alone cannot pass UX-1.
   Headless Chromium cannot reproduce WebView2 softness; this belongs to the
   installed build. Existing `object-fit: contain` is not the presumed cause.

### S5a implementation checkpoint - ACCEPTED (2026-08-01, a0d3f2b; review 34f1fca)

- The internal native theater and drive-grouped play strip are complete alongside
  the accepted route. They do not become coach-facing until the isolated S5d flip.
- The native screen adopts the canonical media node and delegates to the existing
  playback, playlist, drawing, multi-angle, and tagging domain controllers. It
  creates no parallel video/decode/film identity state.
- Lifecycle is transactional: legacy presentation is removed before adoption,
  exact media home and accepted presentation are restored on exit, and a failed
  mount rolls back closed.
- Ordinary pixel budgets are now 1211x681 at 1440x900 and 1531x861 at
  1920x1080, versus the measured 1060x596 legacy working picture. Exact
  1920x1080 fullscreen and drawing-canvas pixel alignment are pinned.
- One-camera use does not reserve an empty multi-angle row; Add Angle stays in
  transport, and angle layout/sync controls expand only after angle two exists.
- The static reference's synthetic yard grid is not implemented over source
  film. Without calibrated screen-to-field coordinates it would obscure evidence
  and violate the coach's recorded 'video is sacred' rule. This is an intentional
  product correction, not deferred missing functionality.
- Focused journey: 21/21. Full canonical gate: 75/75, 0 skipped. S5a changes
  no season data, analytics, storage, source film, package, tag, or release.
- Claude independently accepted S5a. His route-integrated UX-1 measurements,
  rather than the component host's geometry, are canonical in the design audit.
- The boot-lifetime singleton's guarded domain subscriptions are deliberate; add
  scoped emitter teardown only if ownership changes make true destruction real.
- Temporary strip collapse is required before S5d so the coach can trade
  navigation for film pixels without shrinking high-frequency controls.
- F1 now prints assertion FAIL lines before the diagnostic tail; its buried-
  failure self-test and a complete 75/75 run are green. **S5b is open.**

### S5b implementation checkpoint - ACCEPTED (`d39dcdb`; review `726a55c`, 2026-08-01)

- The internal native Film Room deck is complete alongside the accepted route;
  it remains unreachable until S5d.
- `PlayGrid` is still the one behavior owner. The native adapter consumes its
  visible-play pool, filters, tendencies, selections, Watch pool, columns, saved
  filters and edit path rather than recreating football or persistence logic.
- Mount/restore is transactional: the legacy grid is hidden, hidden-row rerender
  work is suppressed, native subscriptions and route-owned overlays are removed,
  and the prior hidden state is restored. Season data is byte-identical across
  view-only mount/restore.
- The native deck preserves spreadsheet editing, projected tag semantics,
  HistoryManager behavior, click-to-follow film on read-only cells, custom/saved
  preferences, and exact selected-and-visible Watch cohorts.
- Keyboard ownership has one initial Tab stop, arrow navigation follows film,
  and filter/column changes cannot strand roving focus. A focus-before-click
  race found in self-review was removed so first click selects and second click
  edits.
- Visual QA at 1440 and 390 confirms the dense tokenized deck, internal table
  overflow and readable hierarchy. Isolated-host screenshots do not establish
  route geometry; S5d must capture that evidence after composition.
- Focused native Film Room 24/24; legacy Film Room 179/179; overlay 42/42;
  theater 21/21; design-system 7/7. Canonical gate 76/76, 0 skipped. The first
  run's undefined legacy CSS token was caught at 75/76 and fixed before handoff.
- An independent Settings journey focus race exposed by the final-byte gate is
  hardened at the test boundary: wait for reopened-sheet focus, then assert the
  complete input before save. Settings is 19/19 across 8 isolated repeats and the
  final gate; no Settings production behavior changed.
- No schema, season/play/tag data, analytics, storage, film, package, tag or
  release changed. Claude independently re-ran the 76/76 gate and accepted the
  checkpoint with no findings. **S5c is open.**
- **S5d visual audit:** inspect every native Film Room cell state for meaning
  carried only by markup; `_plainCell()` intentionally strips markup and no
  current signal is lost, but icon-only future states must not render blank.
- **S5d lifecycle decision:** theater and Film Room are boot-lifetime singletons
  with guarded subscriptions and no emitter `off()` API. Confirm that ownership
  remains boot-lifetime at the flip; add scoped teardown only if S5d introduces
  real construction/destruction rather than mount/restore.

### S5c preflight checkpoint - ACCEPTED (`1786afb`; review `1c88ce5`; repair awaiting review, 2026-08-01)

- Named behavioral coverage now owns per-game perspective/direction lifecycle,
  context isolation, Play Diagram + Call Sheet output, Scoreboard OCR, templates
  and Same-as-Last. Focused preflight: 10/10.
- Quick Chart no longer advertises or writes the invalid `Kick/Punt` play type.
  Existing stored values are untouched; no migration or cleanup was performed.
  Focused Quick Chart: 12/12, with the old mapping mutation-proven red.
- Canonical gate: 77/77 green, 0 skipped. No package, release, storage, film,
  analytics, schema or durable season data changed.
- The realistic 20-play multi-select session remains required after native form
  implementation and before the S5c handoff; it is not falsely claimed here.
- Review repair makes relaunch load-bearing for both context and diagram proofs,
  replaces the injected template option with a real save/apply round trip, and
  gives retired Quick Chart `K` users explicit Special Teams guidance without
  writing data. Removing reload reds both durability assertions. Gate 77/77.

### S5c implementation checkpoint - BUILT; INDEPENDENT REVIEW REQUIRED (2026-08-02)

- Preact owns all coach-visible tag-form markup. The legacy form remains off-screen only as a temporary behavior adapter and supplies no visible HTML; S7 may delete it after the ownership flip without a presentation rewrite.
- Every canonical football field and workflow is preserved, including structured penalties, all structured Special Teams phases, compound tries, resulting-snap confirmation, roster quick-picks, templates, diagram, OCR, detection, custom libraries/fields, notes, New Drive, context, and navigation.
- The required 20-play native multi-select session is complete: every play keeps two Formation and two Play Type selections through Save & Next, canonical persist, and relaunch; the other game is isolated.
- Capability ownership for all-fields, save, Special Teams, penalties, context, diagram, OCR, and templates now resolves to `e2e-native-tagging.mjs`. Legacy preflight and form suites remain in the gate as independent regression evidence.
- Focused journey 22/22, including a coach-controlled section-expansion regression. Three exact mutations (Formation collapse, dropped try turnover, undersized mobile targets) each turn the intended assertion red. Full canonical gate: **78/78 green, 0 skipped**.
- Isolated 1440/390 visual QA is clean. It proves component hierarchy, clipping, overflow and touch layout only; S5d owns route-level video/form geometry.
- No user-reachable route, schema, migration, durable data, analytics, film, storage, package, tag, or release changed. **S5c was accepted at `9f8f065`; the `1.12.0-16` coach smoke passed and S5d is open.**
### Pre-S5d UX-5 charting-density checkpoint - BUILT; INDEPENDENT REVIEW REQUIRED (2026-08-02)

- Standard Formation now includes `I-Form` and `Split Back`; canonical Backfield remains `I` and `Split`. Either or both may be charted and survive canonical save/reload as independent dimensions. TagLibrary v2 enables the new defaults once for existing team libraries without rewriting plays or resurrecting a value after the coach hides it.
- Situation is compacted to Quarter + Down/Distance and Hash + Field Position. Punt moved behind More so common Results fit the representative 560px charting column without horizontal scrolling. Yardage reserves 88px for signed three-digit values and spinner controls.
- Native tagging is 30/30, Charting Settings 15/15, tag library 14/14, tag fields 15/15, tag model 37/37, projection form 54/54, and design system 7/7. Controlled mutations prove missing vocabulary, wrong Situation order, missing Punt, and undersized yardage each red the intended assertion.
- The first gate's stale 16-row Settings expectation now checks the complete active Formation library and the two new standards. The intermittent overlay assertion now waits two pending frames and verifies the stable focus destination; five isolated repeats and the final gate are clean. No overlay production behavior changed.
- Final canonical gate: **78/78 green, 0 skipped, 0 failed**, including real data. No route flip, schema/data migration, analytics formula, film/storage behavior, package, tag, or release changed.
- **Next:** Claude independently reviews this checkpoint. S5d remains one separate candidate commit containing only the ownership flip; route-integrated four-viewport visual QA and an immediate installed smoke remain mandatory.

7. **[S5d and S7 — dated, measured] Eight breakdown capability ids are claimed by
   harnesses those milestones retire.** Added 2026-08-02 after the S5c capability-
   floor regression (`557e956`) and its fix (`2a70df8`). The fix correctly kept
   these ids pointed at the assertions that genuinely prove them, rather than at
   weaker native strings — but four now resolve into `e2e-breakdown-form.mjs` and
   four into `e2e-s5c-preflight.mjs`:

   | id | claimed by |
   |---|---|
   | `breakdown.all-fields` · `special-teams` · `penalties` · `save-next` | `e2e-breakdown-form.mjs` |
   | `breakdown.game-context` · `play-diagram` · `scoreboard-ocr` · `templates` | `e2e-s5c-preflight.mjs` |

   **Deleting or retiring either harness without first re-proving these natively
   removes the guarantee and leaves `e2e-p0-capabilities` green**, because the
   audit checks that a claimed assertion *exists*, not that it is strong. Five of
   the eight are in `P0_CRITICAL_CAPABILITY_IDS`.

   **Obligation:** before either harness is retired, each id must resolve to a
   native assertion of **equal or greater** strength — specifically preserving the
   Call Sheet thumbnail, relaunch durability, the template save/apply round-trip,
   OCR auto-read, multi-tackler attribution with grades and notes, multiple
   independent penalty fouls, all eight structured Special Teams units, and
   player/custom/note field presence. **No two capability ids may share one
   assertion string** — currently 0 of 98 do, and that is the check to re-run.

**Assigned owners (coach's decision, 2026-07-30 — these are decided, not open):**

| Item | Owner in S5 |
|---|---|
| `gamePerspective` | **Shared Break Down context header** |
| `gameDirection` | **Game-level settings/context control, visible from Break Down** |
| Play diagram | **Preserved in advanced tagging**; persistence and the Call Sheet thumbnail are pinned by assertion |
| Scoreboard OCR | **Preserved** unless the coach explicitly approves retirement |
| Templates + Same-as-Last | **Native tagging action row** |
| 20-play multi-select validation | **Codex performs and records it before the S5c handoff; Claude reviews; the coach spot-checks it in the S5d installer** |

Preserve means preserve: none of these may be dropped as a design
simplification. Retiring any of them requires the coach's explicit approval in
writing, recorded here — silence is not a decision (S3's season export).

### 3.3 S6 build contract — Claude builds, Codex reviews (added 2026-08-02)

Five checkpoints, each its own commit. **Review cadence corrected by the coach
2026-08-02: no independent review per commit — S6 is a presentation pass and
per-commit review is excessive.** Codex reviews **once, over the whole S6 range,
immediately before the §8 installer.** That keeps the principle where it earns
its cost (a builder does not accept their own work at an installer, and S7's
deletion follows) without four cycles for styling.

What still runs on every commit, because it is automated and costs nothing:
the full canonical gate, parity against both goldens with no regeneration,
before/after assertion counts stated in the commit message, and a mutation proof
for each new guarantee. If any of those go red the checkpoint stops regardless of
review cadence.

| # | Checkpoint | Carries | Must not |
|---|---|---|---|
| 1 | **Home** | Continue hero with progress by unit; film inbox as honest ready/partial/missing health with resolved path and clip counts (§11) | change film health semantics or any storage read |
| 2 | **Study** | Pivot: any dimension × any dimension, measure switcher, min-sample control, totals, **every cell a cut-up**; under-sampled cells dimmed and labelled, never hidden. Candidate home for the tell surface | change `StudyQuery`/registry results or composite refs |
| 3 | **Plan** | Findings grouped into a real game plan with linked play counts and Watch; presentation preview as a **bottom horizontal strip** — Plan order, horizontal scroll with no page overflow, selection and Watch preserved, keyboard and touch | change the `plans[]` contract or `PlanExport.build()` structure |
| 4 | **Cross-screen consistency audit** | AX-1 · AX-2 · AX-3 · AX-4 · AX-5 · AX-6 · **AX-7 five-lens model**, plus UX-2 (shared game-context control), UX-3 (responsive containment), UX-4 (design-system ownership) | be folded into checkpoint 3 as incidental styling |
| 5 | **Installed milestone smoke** | §8 installer, coach-run, before S7 opens | be skipped or substituted by a browser result |

**Non-negotiable for every checkpoint — this is the whole risk of S6:**

- **No parity-locked formula changes and no film-cohort changes.** `e2e-parity`
  must stay green against both goldens without regeneration. If a golden must
  move, that is a separate reviewed decision, called out in the diff, never a
  side effect of a presentation pass.
- **Every KPI, finding and grouped result keeps its exact composite
  `gameId::playId` refs.** A redesigned cell that plays different film than the
  cell it replaced is the worst possible outcome here.
- **Assertion counts may not fall.** S5d lost 57 sites before anyone counted;
  every S6 checkpoint states before/after counts per touched harness, and any
  removal names the guarantee that replaced it.
- **Screenshot-plus-truth per route** (four viewports + one source-backed value
  check), per the design audit.

**AX-7 is the one to challenge hardest.** Reorganising Reports and Study around
Efficiency / Explosiveness / Situational / Tendencies / Risk is an information-
architecture change over parity-locked numbers. Reviewer question is not "does it
look better" but "does every lens still resolve to the same plays and the same
values it did before".

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
  Break Down ownership flip · **S6 (before S7 opens — coach, 2026-08-02)** ·
  final legacy deletion. Browser tests cannot prove
  Windows folder dialogs, linked-film paths, playback or Tauri lifecycle.
  **The S6 installer is required and non-negotiable:** S7 deletes `#app`,
  `#wsClassicOutlet`, the restore paths, `build.sh` and the dead CSS. That is the
  one irreversible commit in the project, and the coach must have used the
  finished analytics experience on real film **before** the safety net is
  removed — not after.
  **This is an ACCEPTANCE CONDITION, not a suggestion.** Add it to the review
  checklist alongside the gate — it was missed at S2 and again at S3 precisely
  because it lived only in this section.
  **Also build one BEFORE S5d,** not just after: S5a–c are cheaply reversible and
  the ownership flip is not, so the coach should have used the native Break Down
  pieces while backing them out is still cheap.

- **Smoke schedule as of 2026-07-29 (Claude's call).** The first installer is cut
  **at S4 COMPLETE** — after the remaining legacy overlays land, before S5 opens.
  Not mid-milestone: a checkpoint installer interrupts work already in flight and
  buys nothing the next one won't. Not deferred past S5 either — **S5 rebuilds
  Break Down on top of the shell, overlay host, film-navigation service and
  settings layer that no coach has ever touched.** Proving the structural layer
  before more structure lands on it is the entire point.
  **What only the installer can prove**, all of it currently unexecuted anywhere:
  linked film on `D:` (folder dialogs, `convertFileSrc`, asset-protocol playback),
  the SQL catalog against real film, Tauri lifecycle and the updater, the
  Documents mirror, and — new in S4-a — the two **desktop-only** More items
  (`Open data folder`, `Check for updates`) that were just rewired to native
  popover handlers and that **no headless harness can reach**.
- One clean versioned smoke build after the complete migration is accepted.
- **S5d landing sequence and rollback (added 2026-07-30; corrected by the coach
  the same day — the first draft was self-contradictory, saying S5d could not
  land until a smoke passed when the flip must exist before it can be smoked).**
  §4 bars a user-reachable half-migrated route, and §8 requires an installer
  before S5d. S4 needed three attempts (`1.12.0-13`, `-14`, `-15`), so a failed
  smoke is the normal case. **Exact sequence:**
  1. **S5a–c stay internal and reviewed** — built alongside, not user-reachable.
  2. **S5d is one isolated candidate commit** containing only the ownership flip,
     so reverting it cannot take the film, strip, grid and tag-form work with it.
  3. **Claude reviews that commit.**
  4. **Build and smoke immediately** — no gap in which other work lands on top.
  5. **No downstream work begins** until the smoke is recorded.
  6. **If film, data, or route usability fails → revert S5d to the accepted S5c
     baseline.** Not repair-forward: an unusable charting route is not a state to
     iterate on top of.
  7. **Minor non-destructive issues may be repaired forward** — only while the
     route remains usable.
  8. **S5d is accepted only after the installed smoke passes.** The failed
     artifact is recorded FAILED in its own `SMOKE-*.md` and must not be reused.

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
| **Break Down** (S5) | Theater + deck. Drive-grouped play strip, yard grid inside the film, collapsed-field form, pinned commit bar. **Ease of use, speed and accuracy are paramount — nothing may compete with charting.** No suggestion/"tell" surface here (moved out; Study is the candidate home). Open: drive strip may need scroll/zoom at 14 drives. **Inherited ownership (added 2026-07-30, see §3.2): S5c takes `gamePerspective` and `gameDirection` out of `#legacyGameContextState`, and must keep or explicitly retire scoreboard OCR, the play diagram (`play.diagram` is persisted and read by the Call Sheet), templates and Same-as-Last.** Relocated subtrees to replace: `.video-section` (S5a), `#playGridSection` (S5b), `.tag-section` (S5c). |
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

### S5d ownership-flip checkpoint - BUILT; INDEPENDENT REVIEW + INSTALLED SMOKE REQUIRED (this commit, 2026-08-02)
- The native theater, tagging deck, and Film Room are the single visible Break Down owners. Chart/Film Room swaps only the right deck; the canonical media element and selected play do not remount.
- The strip-collapse prerequisite landed separately at `3c251ac`. Route evidence covers 1440x900, 1280x720, 768x1024, and 390x844; no horizontal overflow, mobile controls are at least 44px, and the corrected mobile first viewport includes film, transport, strip, and primary actions.
- Exact parity proof pins three source plays, native row ids `[1,2,3]`, offense filter/Watch refs `[1,3]`, and `2 of 3 plays`. Mount/restore/remount is a season-byte no-op with one owner throughout.
- Gate-discovered production fixes preserve Enter-to-advance and the `Y` yardage shortcut on the visible native field; selected toolbar contrast now passes WCAG AA. Compatibility behavior harnesses unwrap the shell explicitly and cannot be mistaken for coach-facing ownership.
- Mutation proof suppressing native Film Room mount reds the zero-owner and filter journey. Final canonical gate: **78/78 green, 0 skipped, 0 failed**.
- No data model, migration, analytics, film/storage, package, tag, or release changed. Per the rollback contract, Claude reviews next; then one immediate installed smoke decides accept vs revert. S6/S7 remain closed.
### S5d repair checkpoint - BUILT; INDEPENDENT REVIEW REQUIRED (2026-08-02)

Claude's post-flip review found the composed route below the signed film-size floor and four native guarantees still evidenced only by a retired harness. Codex repaired both as one checkpoint:

- Normal charting uses a 420-500px non-overlay deck and meets/exceeds legacy contained-picture dimensions at 1440x900 and 1920x1080.
- Persisted Film Focus removes the deck from layout and collapses the strip, meeting/exceeding the accepted standalone S5a picture target while preserving one canonical video element.
- Native tagging now owns the four migrated capability claims; Save & Next adds visible affirmative feedback without changing persistence semantics.
- Restore-point throttling/cross-season ownership and the colon label convention have focused native proofs.
- Focused checks are 12/12 geometry, 34/34 native tagging, 14/14 native Breakdown, and 5/5 restore-point throttling. Full canonical gate is **80/80 green, 0 skipped**. Both new safety harnesses were mutation-proven.

**Installer remains held.** Next is independent Claude review; acceptance unlocks one local milestone installer and the installed rollback-contract smoke. S6/S7 do not open early.

### S6 end-to-end repair checkpoint — built at `9a75b07`, independent review required

Codex reviewed Claude's full S6 range and repaired the red handoff before any
milestone installer could be considered. The repair restores typed destructive
confirmation, clean and accessible report definitions, native toast treatment,
and a real coarse-pointer tagging proof. The review also found that Delete Game
had been implemented only in a retired compatibility panel; reachable native
Game Settings now owns delete, active-game race protection, Home return, and the
existing 30-second film-safe Undo. No coach data was migrated, cleared, or
rewritten.

The repaired bundle passes the canonical gate **82/82, 0 skipped, 0 failed**,
including analytics parity and the real six-game fixture. S6 remains pending
independent Claude review. The next installer is cut only after that acceptance;
S7 remains closed. `1.12.0-37` is defective and must not be promoted.

Repository-history cleanup is a separate coach decision: `7477fe2` still exposes
unreachable scratch blobs containing real-team captures even though the files
were removed at `db3b606`. No history rewrite or force-push was performed.

### S6 design completion batch 1 — built 2026-08-09; independent review required

Codex implemented the first structural findings from the installed `1.12.0-38`
design audit. Film Room no longer inherits Chart's narrow deck: it is side-by-
side only when both theater and table remain usable, and stacks to a full-width
table at medium desktop widths. Mobile Break Down now presents film context and
workspace mode first, with all four advanced commands retained in a 44px
disclosure.

The screenshot gate was repaired to use live native owners and produced 44
distinct route/viewport captures. Focused geometry and interaction tests pin the
responsive composition and the disclosed command's real hit target above film.
The canonical gate is **82/82 green, 0 skipped, 0 failed** on rebuilt bytes.

No installer, version, tag, release, data migration, storage change, analytics
formula, or film-cohort change is included. Claude reviews this checkpoint next;
S7 remains closed and subsequent design work waits for that verdict.

### S6 design completion batch 1 — review follow-ups closed (2026-08-09)

Claude accepted `25bb158` and identified one product-layout gap plus one
deterministic gate red. Codex repaired the Film Room layout so medium desktop
viewports show real table rows without scrolling past the theater, then replaced
the old box-height assertion with viewport-intersection and visible-row proof.

The delete red was root-caused as a Puppeteer controlled-input race: only `de`
reached the form and the disabled Delete command correctly did nothing. The
production delete path was unchanged; the test now proves the exact phrase arms
the command before asserting overlay cleanup, deletion, Home return, and Undo.

Canonical gate: **82/82 green, 0 skipped, 0 failed**. Independent review is next;
S7 remains closed.

### S6 answer-first composition batch 2 - built; independent review required (2026-08-09)

Codex closed the live S6D-4 typed-confirm focus race before continuing visual
work. Typed confirmation fields now receive explicit focus while Cancel remains
the safe default action. Real-keyboard regressions cover every typed season/game
delete route; ordinary destructive dialogs still default actual focus to Cancel.

The next native composition increment gives Reports an owned square-edged KPI
scan board, closes its odd-mobile-metric hole, compacts Study into a two-column
mobile query workbench, and anchors the Home continuation and Plan empty state
in design-system working bands. Fresh before/after screenshot matrices cover all
11 routes at four viewports (44 distinct captures each) with no page overflow.

The two new responsive guarantees were mutation-proven after rebuilding the
bundle, not against stale source. The first full gate exposed one stale Team Hub
focus expectation; the corrected contract distinguishes a safe default action
from actual typed-field focus. Final canonical gate: **82/82 green, 0 skipped,
0 failed**.

No installer, version, tag, release, schema, migration, analytics formula, film
cohort/ref, storage path, or coach data changed. Claude reviews this checkpoint
next. S7 remains closed.

### S6 closing installer source - 1.12.0-39 (2026-08-09)

Claude independently accepted the answer-first composition and typed-confirm
repair at `93fc675`. Codex then closed the two accepted proof nits: the live
overlay snapshot now pins Cancel as the sole default action, and the mobile KPI
layout proof forces an odd probe without depending on production tile count.
Both additions were mutation-proven against rebuilt bytes.

Canonical gate: **82/82 green, 0 skipped, 0 failed**. P0 exit: 17/17. Cargo
check: clean. All four version owners are `1.12.0-39`. This is the immutable
source checkpoint for the required local unsigned S6 installer. S7 remains
closed until the NSIS/MSI artifacts are built and the coach passes the installed

### S6 closing installer built - 1.12.0-39; coach smoke pending (2026-08-09)

Local unsigned NSIS and MSI artifacts were built from committed source
`6be953c`. Hashes and the six-step real-film acceptance checklist are recorded
in `SMOKE-1.12.0-39.md`. This artifact is not tagged or published.

All pre-package evidence is green: canonical gate 82/82, P0 exit 17/17, cargo
check clean, and both accepted proof nits mutation-verified. The coach now runs
the installed checklist. PASS closes S6 and opens S7; any film, data, route, or
focus failure keeps S7 closed.


---

## 13. S7 execution plan — ACCEPTED 2026-08-09

**Built by Claude, reviewed by Codex across three rounds (each returned CHANGES
REQUESTED and each was substantively right), approved by the coach.** This is the
governing contract for S7 and supersedes the one-line description in §3.1.

## Context

The coach smoked and accepted `1.12.0-43` and opened S7, with Codex reviewing the
S7 work when it is done. S7 is plan §3.1's final milestone: **delete
`#wsClassicOutlet`, `#app`, the restore paths, `build.sh`, and dead CSS.**

It is the least reversible milestone in the project, and this codebase has a
specific history with it: **hidden markup resurfaced twice** when an overlay
revealed the outlet, and a stylesheet that was present, correct and *inert*
looked identical to a working one in a diff three separate times. Absence is the
only state that cannot be un-hidden — which is the argument for doing this, and
the reason to sequence it so every step is independently revertible.

## Measured starting state (not inherited from the plan)

| Thing | Measured |
|---|---|
| Live ids inside `#app` | **218** |
| `football-film-analyzer.html` | 1.80 MB, **tracked**, referenced only by `tools/verify-audit-fixes.mjs:8` (not a gate harness) |
| `build.sh` | 7 KB, **tracked**, referenced by no harness and no CI workflow |
| `css/styles.css` | **253 KB and LIVE** — linked in `index.html` |
| `css/redesign-stats.css` | **21 KB and LIVE** — linked in `index.html` |
| Vite stylesheet ownership | 20/20 reachable — no dead stylesheet in the build today |

**Correction to plan §3.2 item 7, measured against `p0-capability-inventory.mjs`:**
it records eight stranded capability ids; **four** are.
`e2e-breakdown-form.mjs` now claims **zero** (all four moved to
`e2e-native-tagging.mjs`). `e2e-s5c-preflight.mjs` still claims
`breakdown.game-context`, `play-diagram`, `scoreboard-ocr`, `templates`.

**Two findings that change the shape of the work:**

1. **The "dead CSS" is not dead.** Both stylesheets are linked and live. S7's CSS
   half is a *migration*, not a sweep, and 253 KB is far too much to delete in one
   reviewed commit.
2. **`#app` contains live controls.** `videoFileInput` / `videoFolderInput` are
   consumed by `video-controller.js:8-9`, `ui-polish.js:106/128` and
   `wizard.js:180/258` — they are the film-loading inputs. `libraryOverlay` is
   still held by `season-library.js:14`. Deleting `#app` naively breaks film
   loading, which is the single worst outcome available in this app.

## Codex review — CHANGES REQUESTED, all six accepted

Codex reviewed the first draft and returned six findings. All are legitimate and
all are folded in below. **The crucial one was P0-1, and it would have broken the
product:**

I proposed deleting `season-library.js` once its overlay was proven unreachable.
**Overlay-unreachable is not module-dead.** The native Team Hub reaches into
**12 private members** of it, covering team registry, team switching, season
filtering, roster keys, post-wipe recovery and checklist state — the full list is
in S7-c below. The file's own header even says *"SeasonLibrary remains a
temporary registry/data…"*. **I had read that file and missed the sentence
describing precisely what I was proposing to delete.** Executing the original
S7-c would have taken out team switching and recovery while the legacy overlay it
targeted was genuinely dead.

**I under-counted that surface twice.** First at seven, then — after being
corrected — my verification regex still returned seven, because it could not
match past optional chaining (`library?._recoverFromWipe?.()`). The five it
missed include the two with data-safety consequences. Both counts were a pattern
narrower than the claim attached to it, which is the recurring failure mode in
this project and the reason the S7-0 ledger is blocking rather than advisory.

## Approach — S7-0 ledger, then seven sequenced phases

### S7-0 — the dependency ledger (BLOCKING, read-only)
`audit-shell-deps.mjs` counts ids and checks composition; it does **not** map JS
dependencies, so 218 ids is a surface count, not a deletion list. Build a ledger
classifying every legacy subtree/id as exactly one of:

1. **native-owned** — removable outright;
2. **nonvisual host** — rehome (e.g. the film inputs);
3. **engine dependency** — decouple before deletion (e.g. SeasonLibrary's
   registry role);
4. **dead module** — retires together with its imports, constructors, listeners
   and tests.

Cover the boot-time constructors in `app.js` and the surviving restore paths in
`workspace-shell.js` and `breakdown-workspace.js`. **No deletion begins until
every id has a class.**

#### S7-0 RESULT (2026-08-09) — `tools/s7-dependency-ledger.mjs`

Ledger built and run. **213 ids collected from `#app` onward**, classified:

| Bucket | Count | Meaning |
|---|---|---|
| **engine-dep** | **141** | a live module does real work through it — decouple or relocate first |
| nonvisual-host | 2 | `videoFileInput`, `videoFolderInput` — rehomed in S7-b; this bucket is now **0** |
| dead-module-only | 38 | referenced only by `wizard.js` / `season-library.js` — retire together |
| native-owned | 32 | no JS reference — removable with the markup |

**The headline finding, and it resizes S7-d: `#app` cannot simply be deleted.**
The 141 engine dependencies are not a long tail — they are three coherent
families, and two of them are load-bearing:

1. **The canonical media subtree** — `videoContainer`, `videoPlayer`,
   `drawingCanvas`, `angleWrapper1/2`, `videoPlayer2`, the scrub bar and the
   whole transport — owned by `video-controller.js`, `canvas-overlay.js`,
   `multi-angle.js`, `playlist-manager.js`, and **adopted at runtime by
   `breakdown-theater-screen.js`**. This is the film surface the coach watches.
   It must be **relocated out of `#app`**, not deleted, and the S5a adoption
   contract (one canonical `#videoContainer`, canvas inside it, exact restore)
   must survive the move.
2. **The legacy tag-form engines** — `tagForm`, `tagUnit`, `tagPlayer*`,
   `tagGrade*`, `rosterQuickPick`, `templateSelect`, `notesArea`,
   `playDiagram*`, the OCR controls — owned by `play-tagger.js`,
   `roster-manager.js`, `custom-fields.js`, `notes-manager.js`,
   `play-diagram.js`, `scoreboard-ocr.js`. Since S5c these engines are the
   **behavior owners** the native form delegates to, and the markup is their
   off-screen adapter. Deleting the markup requires the engines to stop reading
   the DOM — that is a real refactor, not a deletion.
3. **Legacy chrome** — `btnSave`, `btnShowStats`, `btnQuickChart`,
   `btnUndoAction`, `backendStatusBadge` and similar, already superseded or
   relocated. This family is genuinely removable.

**Consequence for the plan:** S7-d must be split. Relocating the media subtree is
its own checkpoint with its own installer-grade risk, and decoupling the tag-form
engines from the DOM is a larger piece of work than "delete `#app`" implies. The
32 native-owned plus 38 dead-module ids — **70 of 213** — are the genuinely cheap
deletions and should go first, in that order, so the milestone banks safe ground
before touching film.

### S7-a — close the capability floor (BLOCKING, additive only)
Re-prove the four `e2e-s5c-preflight.mjs` ids **in their owning surface**, not
bundled into one harness to retire another: `play-diagram`, `scoreboard-ocr` and
`templates` belong in native tagging; **`breakdown.game-context` belongs in the
workspace/breakdown journey.** `play-diagram` is the dangerous one —
`play.diagram` is a persisted field with a live consumer at
`call-sheet-builder.js:180`, so its proof must assert the **round-trip and the
rendered Call Sheet thumbnail**, not reachability. Diff
`e2e-breakdown-form.mjs`'s assertions against the native ones before retiring it;
it claims nothing now, but assuming equivalence is what caused S5c-1.

### S7-b — rehome the live nonvisual hosts, and retire the wizard here
Move `videoFileInput` / `videoFolderInput` to `body`, as `projectFileInput`
already was. Update `video-controller.js:8-9` and `ui-polish.js:106/128`.

**Retire `wizard.js` and its tests in this phase rather than S7-d.** It is
already approved for retirement and it holds two of the input call sites
(`wizard.js:180/258`); updating and testing that path in S7-b only to delete it
in S7-d is work spent on a surface that disappears. Prove the **surviving native
film-import paths** instead — the empty-state CTA and the Film/Team settings
import — which are what a coach actually uses.

#### S7-b RESULT (2026-08-09) — COMPLETE

Both pickers now sit on `body` beside `projectFileInput`. The ledger's
**nonvisual-host bucket is 0**; ids inside `#app` fell 213 → 211.

`wizard.js` is deleted — module, boot construction, `build.sh` entry, and three
`styles.css` blocks. It was default-dismissed, had no toggle control, and
injected its bar into the hidden outlet (measured 0×0), so no coach could reach
it; but it stayed subscribed to `video-loaded` and called
`stats.hideDashboard()`, which is what rendered native Reports at 0×0 in
`1.12.0-14`. **That defect class is now structurally impossible rather than
guarded**, and `e2e-native-reports` asserts both the coach-facing outcome and the
owner's absence.

**The measurement found a live defect the phase had to answer.** The only `drop`
handler was bound to `#videoDropZone`, the top-bar label — **0×0, hidden
ancestor, inside `#wsClassicOutlet`**. So dropping film had been dead for the
whole shell era while the native empty state still read *"or drop a video or
folder anywhere."* `_bindDropTarget()` is now one implementation applied to both
the label and the live `#videoPlaceholder`, so the advertised behavior works
again and the label becomes optional — S7-d may delete it without decoupling
first. The hint says *"here"* rather than *"anywhere"*, which is what is true.

**Stated limit:** the dropped-**folder** branch cannot be driven headlessly — a
synthetic `DataTransfer`'s `webkitGetAsEntry()` yields an entry whose `file()`
callback never fires, so `_walkEntries` awaits forever. The assertion drives the
flat-files branch, same handler and same import gate.

Three mutations, each reddening exactly its own assertion: removing the
placeholder drop target → the drop assertion, `{"over":false,"received":null}`;
returning the pickers to `#app` → the ownership assertion,
`{"fileOutside":false,"folderOutside":false}`; reintroducing a boot-time hidden
wizard bar that hides the dashboard → both Reports assertions, `sideEffects:1`.

**Assertion counts diffed against the S7-a gate, not eyeballed: two lines differ,
both up.** Film storage 31→34, native Reports 61→62. Zero drops.

**Method note.** The first CSS sweep missed a third wizard block because the
`grep` was piped through `head`. Same mechanism as the S7-c undercount recorded
below — a pattern narrower than the claim attached to it.

### S7-c — extract the team registry, then delete only the overlay
**The dependency surface is 12 members, not 7.** My first count used a regex that
could not match past optional chaining, so it missed five — including the two that
matter most. Complete surface, verified:

| | |
|---|---|
| Load path | `_recoverFromWipe`, `_ensureTeamRegistry`, `_teams`, `_activeTeamId`, `_teamProfile`, `_teamSeasons`, `_checklistItems`, `_checklistDismissed` |
| Mutations | `_saveTeams`, `_saveTeamProfile`, `_teamRosterKey`, `_newTeamId` |

Extract all twelve into a presentation-free `TeamRegistry` / `TeamLibraryService`
with a **public** API and move Team Hub onto it. Tests must cover **post-wipe
recovery** and **registry reconciliation** (the two I missed, and the two with
data-safety consequences), plus reads, team create/switch/delete, roster
switching, season scoping and checklist state. **Only then** delete the legacy
overlay controller and its markup. The service is the deliverable; the deletion
is the by-product.

### S7-d — delete `#app`, `#wsClassicOutlet` and the restore paths
Only after 0/a/b/c. (`wizard.js` is already gone — retired in S7-b with the input
call sites it held.) Assert **absence**, not hiding — the test must red if the
markup is re-inserted hidden.

### S7-e — the CSS migration (reviewed checkpoints, visually lossless)
274 KB across `styles.css` + `redesign-stats.css`, both live. Split into
route/shared-style checkpoints, each reviewed. **Runtime coverage is evidence,
not deletion authority** — it cannot see empty/error/loading states, responsive
rules, focus/hover, Tauri-only states or dynamically generated selectors. Use
static ownership as the primary instrument, backed by a route × state × viewport
screenshot matrix. **The bar is that S7 is visually lossless.**

### S7-f — retire the build artifacts
Delete `build.sh` and `football-film-analyzer.html` (1.80 MB, tracked); remove or
convert `tools/verify-audit-fixes.mjs`, which still opens the bundle; update the
executable references and the deploy documentation. **Decide explicitly how the
GitHub Pages build is produced from Vite afterwards** — the current recipe copies
the bundle, and that recipe stops existing here.

### S7-g — review BEFORE the installer, then package
**Sequence, corrected:** Claude builds and gates → **Codex reviews the S7 range
independently** → repair and re-review if needed → §8 installer → coach smoke →
milestone acceptance.

The earlier draft put the installer before the review, which would have had the
coach installing and testing unreviewed structural demolition. That also
contradicts this project's own §8 rule that a builder does not accept their own
work at an installer — the reason the milestone-installer requirement exists at
all.

## Governance

**Copy this accepted plan into the repository planning document and commit it
before implementation begins.** It currently lives only in
`~/.claude/plans/`, outside the repo — a handoff or reset would lose the
governing contract, which is the same class of problem as an undocumented
requirement change.

## Verification

- Full canonical gate green at every phase boundary; assertion counts **diffed,
  not eyeballed** — zero drops.
- `audit-shell-deps.mjs` ids-inside-`#app` count falls to 0 by S7-d and is
  asserted, so residue cannot creep back.
- Mutation proof per phase: re-inserting the deleted markup *hidden* must red the
  absence assertion; removing a rehomed input must red the film-load assertion;
  bypassing the new TeamRegistry must red team switching and recovery.
- Real-data check (`e2e-realdata`) and parity 2/2 at each boundary.
- **Responsive and density-sensitive checks measured against the coach's real
  season**, per the standing rule added at the charting closeout — a synthetic
  fixture understates string lengths and vocabulary size.
- Route × state × viewport screenshot matrix before and after each CSS
  checkpoint; S7 must be visually lossless.
- **Milestone sequence:** Claude gate → **Codex independent review** →
  repairs / re-review → §8 installer → coach smoke → acceptance. The review comes
  before the installer, never after.

## Explicitly not in scope

No schema, migration, season byte, analytics formula, film cohort, composite ref,
storage path, or film file change. No history rewrite. The 267 scratch artifacts
in `7477fe2` history remain the coach's separate decision.

---
