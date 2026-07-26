# GridIron IQ — Shell Independence Plan (DRAFT for Codex review)

**Author:** Claude (drafting) · **Reviewer:** Codex (aggressive) · **Builder:** Codex
**Status:** DRAFT — not approved, no code authorized
**Baseline:** `2362bfb`, gate 60/60 green, CI green

**Goal:** the finished application no longer depends on hidden legacy `#app`
markup, `#wsClassicOutlet`, DOM reparenting, or restore/remount lifecycle.

---

## 0. What this plan corrects about its own premise

The brief lists six routes: Home, Break Down, Study, Reports, Plan, Team & Film
Settings. **Measured against the running build, that list is incomplete, and the
omissions are what actually pin `#wsClassicOutlet` in place.** See §1.

Everything below is measured at runtime on `2362bfb` with the shell mounted and
a game open — not read from prior handoffs. Prior handoffs in this project have
twice described the DOM incorrectly (the top bar was recorded as "still owning
18 controls / still showing" when it was hidden and entombing four capabilities).
**Re-run the audit rather than trusting this table after any milestone.**

---

## 1. Current dependency inventory (MEASURED, `2362bfb`)

### 1.1 Route hosts — native vs. relocating

| Route | Host | Native markup? | Relocated legacy nodes |
|---|---|---|---|
| Home | `#wsHome` | **Yes** | none |
| Study | `#wsStudy` | **Yes** | none |
| Plan | `#wsPlan` | **Yes** | none |
| **Reports** | `#wsReports` | No | `#statsDashboard` |
| **Break Down** | `#wsBreakdown` | No | `.video-section`, `.tag-section`, `#playGridSection` |

Home, Study and Plan are genuinely native screens: they build their own markup
and own their lifecycle. Reports and Break Down only *appear* native — they are
hosts wrapped around relocated legacy elements.

### 1.2 The legacy residue: 99 element ids still inside `#app`

`#app` (inside `#wsClassicOutlet`, hidden on every route) still contains:

| Node | Status | Notes |
|---|---|---|
| `.top-bar` | partly live | film-input cluster (`videoFileInput`, `videoFolderInput`, `videoDropZone`, `fileLabel`, `btnLoadFolder`, `folderLoadBadge`) is LIVE — the video empty-state CTA clicks it. Plus superseded `btnQuickChart`/`btnShowStats`/`btnSave`, decorative `app-title` |
| `.main-content` | **empty husk** | 0 children — Break Down took them all |
| `.wizard-bar` | dormant | default-dismissed onboarding wizard |
| **`#libraryOverlay`** | **LIVE, load-bearing** | Team Hub / Season Library — team → season → game front door |
| **`#seasonOverlay`** | **LIVE** | Season Stats modal |
| `#shortcutsModal` | LIVE | keyboard legend (`?`) |
| `#playImportModal` | LIVE | CSV / Hudl import |
| `#quickChartPanel` | LIVE | full-screen rapid charting mode |
| `#undoToast` | LIVE | history feedback |
| `#drawerScrim` | LIVE | drawer backdrop |
| `#btnCloseStats` | vestigial | legacy dashboard close |

**Not in `#app` (already relocated to `body`):** `#settingsDrawer` (which hosts
Team & Film Settings), `#gameModal`.

### 1.3 The omission that blocks S5

**`#libraryOverlay` is the reason the outlet still exists.** `WorkspaceShell._openLibrary()`
must reveal `#wsClassicOutlet` because the library renders inside the relocated
`#app` and cannot paint while it is hidden. This produced the coach-facing defect
found twice by clicking `⋯` (retired classic UI left exposed), patched with
`restoreRouteVisibility()`.

So: **`#wsClassicOutlet` cannot be deleted until Team Hub / Season Library is
native.** The brief's route list does not contain it. Neither does it contain the
modal/overlay layer (`#seasonOverlay`, `#shortcutsModal`, `#playImportModal`,
`#quickChartPanel`, `#undoToast`, `#drawerScrim`).

This is the single largest scope correction in this draft.

### 1.4 Per-route dependency detail

**Home** — native. Depends on: `WorkspaceContext` (routes/capabilities),
`storage.seasonStore`, `workspace.filmHealth()`, `app.openGame()`, `library.open()`
for the seasons action. *Legacy DOM: none.* Reaches legacy only by invoking the
library overlay.

**Break Down** — the deepest. Relocates three legacy sections and depends on:
`VideoController`, `CanvasOverlay`, `PlaylistManager`, `MultiAngle`, `PlayTagger`
(+ `ChipField`), `PlayGrid`, `RosterManager`, `HistoryManager`, `SuggestionEngine`,
`NotesManager`, `CustomFieldsManager`, `PlayDiagram`, `ScoreboardOCR`,
`QuickChart`, `BreakdownVideo`, `BreakdownForm`. Global-id coupling is pervasive
(`#videoPlayer`, `#tagForm` and every `#tag*` chip group, `#playGridSection`,
`#videoFileInput`…). CSS: the two-column/single-column/mobile grid blocks plus the
Film Room block in `styles.css`.

**Study** — native markup; depends on `StudyQuery`, `AnalyticsRegistry`,
`StatsEngine` predicates, `CrossGameCutup`, and `studyScreen._watch` → which
routes through `storage.switchToGame()` + `CutupPlayer` → **the Break Down video
stack**. *Cross-route coupling, not DOM coupling.*

**Reports** — host + relocated `#statsDashboard`. Depends on the whole
`StatsEngine` render surface (dashboard tabs, scout/self-scout/defensive reports,
exports) and its `.cut-row[data-cut-type]` film drilldowns → `_watchPlays` →
`CutupPlayer`. CSS: `reports-screen.css` unwraps legacy `.stats-overlay` /
`.stats-container` modal chrome — **compatibility scaffolding by construction.**

**Plan** — native markup; depends on `SeasonStore` plan seam, `StudyPlan`,
`PlanExport`, and `studyScreen._watch` for playback (same cross-route coupling).

**Team & Film Settings** — lives in `#settingsDrawer` (already on `body`, not in
`#app`). Depends on `TauriBackend` film/library APIs, `TagLibrary`,
`RosterManager`, `CustomChips`, `VersionManager`, `PlayFilter`, and the games
panel (`_renderGamesPanel`, which shares `_gameRowInfo`/`_scorePillHtml`/
`_gameBadgesHtml` with `season-library._renderSchedule`). **It is a drawer, not a
route** — see §3 disagreement D2.

---

## 2. Target architecture

**Unchanged and off-limits during this work:** `storage.js`, `season-store.js`,
`storage-backend.js`, `sql-catalog.js`, `catalog-persistence.js`,
`stats-engine.js` computation, `advanced-metrics.js`, `analytics-registry.js`,
`study-query.js`, `tag-projection.js`, `special-teams.js`, `penalty-model.js`,
`history-manager.js` semantics. Shell work must be **provably data-inert** (§6).

**Each route owns:** its markup, its mount/unmount lifecycle, its own event
binding and teardown, its responsive layout, and its own stylesheet.

**Shared controllers receive explicit elements and state.** Today
`VideoController`, `PlayTagger`, `HistoryManager` and friends locate DOM by global
id in their constructors. Target: a controller is constructed with the elements
(or an element-map) it operates on. This is the load-bearing refactor — it is what
makes "no reparenting" possible, because reparenting exists precisely so that
id-bound controllers keep working.

**One authoritative route and one owner per visible control**, enforced by a
machine-checkable capability probe (§7), not by assertion.

---

## 3. Migration sequence (revised from the brief)

**P0 — dependency map, capability inventory, regression baseline.**
- Re-run the measured audit in §1 as a committed tool (`tools/audit-shell-deps.mjs`)
  so every milestone can prove residue is shrinking.
- **Capability inventory:** every coach-visible capability, its owning route, and
  its reachable affordance. Seeded by the entombment probe pattern already proven
  (it found undo/redo/shortcuts/CV-badge reachable on no route).
- **Markup-agnostic regression baseline** — see D4; this is the highest-risk item
  in the entire plan.

**S1 — native Reports.** *(swapped with the brief's S1; see D2)*
Smallest true route, exactly one relocated node, no film-input risk. Establishes
the route-ownership pattern: native markup, own stylesheet, explicit element
wiring, no `.stats-overlay` unwrapping.

**S2 — native Team & Film Settings.**
Higher data risk (film storage, library root, linked-film). Gets the paranoid
gate: linked-vs-managed, root/game-folder scope separation, fail-closed paths.

**S3 — native Team Hub / Season Library.** *(NEW — not in the brief)*
The front door, and the last thing pinning the outlet. Team card, team pills,
seasons list, schedule, demo, Get Started checklist.

**S4 — native modal/overlay layer.** *(NEW — not in the brief)*
`#seasonOverlay`, `#shortcutsModal`, `#playImportModal`, `#quickChartPanel`,
`#undoToast`, `#drawerScrim`. Establishes one owned overlay host on `body`.

**S5 — native Break Down**, deepest and last, internal increments:
- S5a video + play strip + canvas overlay + multi-angle
- S5b Film Room grid
- S5c tag form + roster + penalties + Special Teams + custom fields
- S5d **single ownership flip** — see D3: increments build alongside; the route
  does not switch owner until the whole checklist passes.

**S6 — audit Home, Study, Plan** for residual legacy coupling (expected:
controller coupling via `_watch`/`CutupPlayer`, not DOM).

**S7 — delete `#wsClassicOutlet`, `#app`, restore/remount paths, obsolete markup,
dead CSS.**

---

## 4. Atomic route replacement

- **No user-facing classic/new toggle.** Agreed without reservation.
- A route flips to native ownership only when its full capability checklist
  passes, in one commit.
- **No silent legacy fallback after a route is declared migrated.** A migrated
  route that still calls a legacy path must fail loudly, not degrade.
- Internal build-alongside during a milestone is permitted; a *user-reachable*
  half-migrated route is not (D3).

---

## 5. Capability parity, not visual parity

- Preserve every useful football workflow and data field.
- Do **not** preserve weak layouts because they exist. `GRIDIRON-IQ-REDESIGN-PLAN.md`
  + `ux-prototype-v2/` + coach feedback are the visual direction.
- Any intentionally removed or materially changed capability goes on an explicit
  list for coach approval **before** the milestone commits.

---

## 6. Non-negotiable integrity contracts

1. **No season / play / tag / film / catalog / backup / analytics-schema
   migration** without an impact report and explicit coach confirmation.
2. **Shell work is data-inert, and this is checked, not promised.** Every
   milestone must show a byte-identical season fingerprint across
   open → exercise → save → reopen. Files in §2's off-limits list should not
   appear in a shell-milestone diff; if one must, it is called out and reviewed
   as a data change.
3. **Analytics-to-film reference equality stays exact** — a Study/Reports row
   plays precisely the plays it counts (composite `gameId::playId`).
4. **Linked film never silently falls back to managed copies.**
5. **Undo, save/reopen, cross-game isolation, failure rollback stay pinned** —
   `e2e-integrity`, `e2e-projform-durability`, `e2e-catalog-persistence`.
6. Managed C: film copies remain protected throughout.

---

## 7. Definition of done

- No production dependency on `#app` or `#wsClassicOutlet`; both deleted.
- No production DOM reparent/restore lifecycle (`_remember`/`_restore`/
  `_mountChrome`/`_restoreChrome`/`breakdownWorkspace.restore` gone).
- **No entombed capability** — permanent gate: every capability in the P0
  inventory has an affordance whose box lands inside the viewport on some route.
  (Not `offsetParent`, not a non-zero rect: a `transform`-hidden drawer defeats
  both. This exact false positive was already produced once.)
- No hidden duplicate navigation or controls.
- No legacy CSS governing native screens.
- Full capability, integrity, responsive, a11y and real-data gates pass.
- Four-viewport visual review (1440×900 / 1280×800 / 768×1024 / 390×844) and
  installed real-film smoke pass.

---

## 8. Delivery protocol

- **Codex builds; Claude independently reviews each committed milestone.**
- One coherent commit boundary per milestone.
- `CLAUDE.md` + this plan updated at every baton pass.
- **No installer per increment.** One clean versioned smoke build after the
  complete migration is independently accepted.
- Full gate output captured to a file every run (the runner records per-harness
  timings and prints `tail -40` on failure).

---

## 9. Where I disagree with the brief

**D1 — The route list is incomplete, and the omissions block the goal.**
Team Hub / Season Library, plus the modal/overlay layer, live in `#app` and are
LIVE. `#wsClassicOutlet` cannot be removed until they are native. They need to be
milestones (S3/S4), not S5 cleanup. *Highest-confidence disagreement — measured.*

**D2 — Team & Film Settings is the wrong pattern-setter for S1.**
It is a drawer panel, not a route: different lifecycle (open/close, focus trap,
scrim) from what routes need (mount/show/hide, responsive layout, capability
gating). Reports is a true route with exactly one relocated node. Recommend
Reports first, Settings second — Settings carries the higher *data* risk and
deserves the more paranoid gate, not the first-pattern slot.

**D3 — "Atomic replacement" and "S3 split into increments" conflict as written.**
A route that is half-native mid-milestone *is* a hidden fallback. Resolution:
increments build alongside and the ownership flip is a single step (S5d). Without
this, the rule is satisfied on paper and violated in practice.

**D4 — The regression baseline is compromised before it starts, and this is the
plan's biggest risk.** Many harnesses assert against legacy ids (`.tag-section`,
`#playGridSection`, `#statsDashboard`, `#tag*`). Migrating markup reds them, and
the natural move — "update the test to the new markup" — silently discards the
assertion. P0 must produce a **capability/behaviour-level** baseline (data in,
data out, film refs, persisted bytes) that survives a markup rewrite. Every test
edited during a milestone must be justified as *"the capability changed"* or
*"only the selector changed"*, reviewed as such. I have watched the weaker version
of this failure at small scale in this codebase repeatedly.

**D5 — CSS is under-scoped.** `styles.css` is ~7.5k lines governing legacy and
native together. "No legacy CSS governing native screens" is a workstream needing
its own strategy (per-route stylesheets + scoping audit), started at S1, not an
S7 sweep. Two unscoped `.top-bar`-era media rules already followed relocated
controls into shell chrome — that hazard scales with every migration.

**D6 — Break Down is not isolatable.** The video/canvas/playlist/history/cutup
stack is shared with Study Watch and Plan Watch. "Break Down native" changes
playback for three routes; the plan must state that contract or S5 will break
Study/Plan silently.

**D7 — Strengthen the data contract from a promise into a check.** §6.2 above:
off-limits files should not appear in shell-milestone diffs, and season bytes
must fingerprint identical across a milestone.

**D8 — Note, not objection:** this reverses the current pass's roles (Claude
built, Codex reviewed). Fine — and structurally healthier, since the builder
should not be the reviewer. Recorded so the handoff is unambiguous.

**Where I agree without reservation:** no toggle; capability parity over visual
parity; Break Down deepest and last; storage/analytics engines untouched; one
milestone per commit; single smoke build at the end.
