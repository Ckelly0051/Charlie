# GridIron IQ — Shell Independence & Redesign Plan

**Plan roles:** Claude authored · Codex reviewed (3 rounds) — *these are not the
implementation roles.*
**Implementation roles:** **Codex builds · Claude independently reviews** each
committed checkpoint.

**Application baseline: `deeb8ba`** — the exact 1.12.0-12 source that passed
60/60 and produced the smoke installer. All runtime measurements are taken
against this commit.
**Planning baseline:** the atomic commit containing this revised plan, the Team
Hub specification, the overlay specification, and the revised Plan design card.

**Status:** P0 IN PROGRESS. **P0-a built; awaiting Claude review. Codex is the builder.**
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

- **P0-a — ACCEPTED (Claude, independent, 2026-07-27):** pinned Vite/Preact build,
  runtime assets, shared loopback test entry, all 41 affected harnesses migrated,
  canonical gate on Vite. Full gate 60/60; Tauri `cargo check` clean. Review
  independently re-ran parity (incl. the real six-game golden), integrity,
  film-room, onboarding, realdata and workspace-shell on the committed bytes.
  **Seven findings; F1 (`build.sh` regenerates a broken bundle — reproduced) and
  F2 (`tools/shots.mjs` still renders the retired artifact) are required before
  P0-b.** Full text in the CLAUDE.md handoff.
- **P0-b — next:** F1/F2 fixes, then the native overlay host + dialog/sheet/toast
  primitives; one explicit DI/unmount proof route.
- **P0-c:** shared film-navigation/cut-up service with exact composite-ref parity.
- **P0-d:** journey capability inventory, operation-scoped data-diff harness,
  design-token enforcement, and final P0 exit audit.
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
