# GridIron IQ — Shell Independence & Redesign Plan

**Status:** COMPLETE DRAFT — awaiting Codex review and sign-off. No code authorized.
**Builder:** Codex · **Reviewer:** Claude · **Baseline:** `2362bfb` (gate 60/60, CI green)
**Design system:** live at claude.ai/design → *GridIron IQ — Design System*; source in `design-system/`

**Goal:** the finished application no longer depends on hidden legacy `#app` markup,
`#wsClassicOutlet`, DOM reparenting, or restore/remount lifecycle — and each route
lands in its intended product-quality form rather than being migrated now and
redesigned later.

---

## 0. Scope corrections this plan makes to its own brief

1. **The six-route list is incomplete**, and the omissions are what actually pin
   `#wsClassicOutlet` in place. See §1.3.
2. **Look-and-feel is bundled with the migration, not deferred.** Deferring would
   contradict §5 and §7 of the brief itself. See §10.
3. **The vanilla-JS / single-file / browser-compatibility constraint is retired.**
   It was carried into three design passes before the coach challenged it. The
   web `gh-pages` deploy was intentionally stopped at v1.10.7 (recorded in
   `CLAUDE.md`), and the product is a Windows-only desktop app. A bundler and a
   framework are available; so are webfonts, real charting, and motion.

Everything in §1 is **measured at runtime on `2362bfb`**, not recalled. Prior
handoffs described this DOM incorrectly twice. Re-run `tools/audit-shell-deps.mjs`
after every milestone rather than trusting this table.

---

## 1. Current dependency inventory (MEASURED)

### 1.1 Route hosts — native vs. relocating

| Route | Host | Native? | Relocated legacy nodes |
|---|---|---|---|
| Home | `#wsHome` | **Yes** | none |
| Study | `#wsStudy` | **Yes** | none |
| Plan | `#wsPlan` | **Yes** | none |
| **Reports** | `#wsReports` | No | `#statsDashboard` |
| **Break Down** | `#wsBreakdown` | No | `.video-section`, `.tag-section`, `#playGridSection` |

Home, Study and Plan are genuinely native. Reports and Break Down only *appear*
native — they are hosts wrapped around relocated legacy elements.

### 1.2 Legacy residue: 99 element ids still inside `#app`

`.top-bar` (film-input cluster is LIVE; `btnQuickChart`/`btnShowStats`/`btnSave`
superseded) · `.main-content` (**empty husk**) · `.wizard-bar` (dormant) ·
**`#libraryOverlay`** (LIVE, load-bearing) · **`#seasonOverlay`** (LIVE) ·
`#shortcutsModal` · `#playImportModal` · `#quickChartPanel` · `#undoToast` ·
`#drawerScrim` · `#btnCloseStats`.

Already on `body`: `#settingsDrawer`, `#gameModal`.

### 1.3 The omission that blocks the goal

`WorkspaceShell._openLibrary()` **must** reveal `#wsClassicOutlet` because the
Team Hub / Season Library renders inside the relocated `#app`. This produced the
coach-facing defect found twice by clicking `⋯`. **The outlet cannot be deleted
until Team Hub is native** — and Team Hub is not in the brief's route list, nor
is the modal/overlay layer. Both become milestones (S3, S4).

### 1.4 Per-route dependency detail

- **Home** — native. `WorkspaceContext`, `seasonStore`, `workspace.filmHealth()`,
  `app.openGame()`. Reaches legacy only by invoking the library overlay.
- **Break Down** — deepest. `VideoController`, `CanvasOverlay`, `PlaylistManager`,
  `MultiAngle`, `PlayTagger`/`ChipField`, `PlayGrid`, `RosterManager`,
  `HistoryManager`, `SuggestionEngine`, `NotesManager`, `CustomFieldsManager`,
  `PlayDiagram`, `ScoreboardOCR`, `QuickChart`, `BreakdownVideo`, `BreakdownForm`.
  Global-id coupling is pervasive. **53 tag fields, 151 chips** — see §11.5.
- **Study** — native markup; `StudyQuery`, `AnalyticsRegistry`, `StatsEngine`
  predicates, `CrossGameCutup`, and `_watch` → `switchToGame` + `CutupPlayer`,
  i.e. **the Break Down video stack**. Cross-route controller coupling.
- **Reports** — host + relocated `#statsDashboard`; the whole `StatsEngine` render
  surface and its `.cut-row[data-cut-type]` film drilldowns. `reports-screen.css`
  unwraps legacy modal chrome — compatibility scaffolding by construction.
- **Plan** — native; `SeasonStore` plan seam, `StudyPlan`, `PlanExport`, `_watch`.
- **Team & Film Settings** — in `#settingsDrawer` (already on `body`). Depends on
  `TauriBackend` film APIs, `TagLibrary`, `RosterManager`, `CustomChips`,
  `VersionManager`, `PlayFilter`, and the games panel (which shares
  `_gameRowInfo`/`_scorePillHtml`/`_gameBadgesHtml` with `season-library`).
  **It is a drawer, not a route** — see D2.

---

## 2. Target architecture

**Unchanged and off-limits:** `storage.js`, `season-store.js`, `storage-backend.js`,
`sql-catalog.js`, `catalog-persistence.js`, `stats-engine.js` computation,
`advanced-metrics.js`, `analytics-registry.js`, `study-query.js`,
`tag-projection.js`, `special-teams.js`, `penalty-model.js`, `history-manager.js`
semantics. Shell work must be **provably data-inert** (§6.2).

- **Each route owns** its markup, mount/unmount lifecycle, event binding and
  teardown, responsive layout, and stylesheet.
- **Shared controllers receive explicit elements/state.** Today `VideoController`,
  `PlayTagger`, `HistoryManager` locate DOM by global id in their constructors.
  This is the load-bearing refactor: reparenting exists *precisely because*
  id-bound controllers must keep working.
- **One authoritative route and one owner per visible control**, enforced by a
  machine-checkable capability probe (§7), not by assertion.
- **A framework and bundler are permitted** for the view layer only. Engines stay
  vanilla ES modules. Component encapsulation IS the shell-independence goal —
  doing it by hand means rebuilding what a framework already provides.

---

## 3. Migration sequence

**P0 — foundations, inventory, baseline.**
- Commit `tools/audit-shell-deps.mjs` output as the shrinking-residue metric.
- **Capability inventory:** every coach-visible capability, its owning route, its
  reachable affordance.
- **Markup-agnostic regression baseline** — see D4. Highest risk in the plan.
- **Design primitives** (`design-system/tokens.css`) + embedded Plex via
  `tools/bundle-plex.mjs`, plus a machine-checkable rule that route stylesheets
  consume tokens rather than raw values.

**S1 — native Reports** *(swapped with the brief's S1; see D2)*. Smallest true
route, one relocated node. Establishes the ownership pattern and the deck world.

**S2 — native Team & Film Settings.** Higher data risk; paranoid gate.

**S3 — native Team Hub / Season Library** *(NEW)*. The front door, and the last
thing pinning the outlet.

**S4 — native modal/overlay layer** *(NEW)*. `#seasonOverlay`, `#shortcutsModal`,
`#playImportModal`, `#quickChartPanel`, `#undoToast`, `#drawerScrim`.

**S5 — native Break Down**, deepest and last:
S5a video + play strip + canvas + multi-angle · S5b Film Room grid ·
S5c tag form + roster + penalties + ST + custom fields · **S5d single ownership flip** (D3).

**S6 — audit Home, Study, Plan** for residual coupling (expect controller, not DOM).

**S7 — delete** `#wsClassicOutlet`, `#app`, restore/remount paths, obsolete markup, dead CSS.

---

## 4. Atomic route replacement

- **No user-facing classic/new toggle.**
- A route flips to native ownership only when its full capability checklist passes,
  in one commit.
- **No silent legacy fallback after a route is declared migrated** — a migrated
  route that still calls a legacy path must fail loudly.
- Internal build-alongside is permitted; a *user-reachable* half-migrated route is not.

---

## 5. Capability parity, not visual parity

- Preserve every useful football workflow and data field.
- Do **not** preserve weak layouts because they exist.
- Any intentionally removed or materially changed capability goes on an explicit
  list for coach approval **before** the milestone commits.

---

## 6. Non-negotiable integrity contracts

1. **No season / play / tag / film / catalog / backup / analytics-schema migration**
   without an impact report and explicit coach confirmation.
2. **Shell work is data-inert, and this is checked.** Every milestone shows a
   byte-identical season fingerprint across open → exercise → save → reopen.
   Off-limits files (§2) should not appear in a shell-milestone diff.
3. **Analytics-to-film reference equality stays exact** (composite `gameId::playId`).
4. **Linked film never silently falls back to managed copies.**
5. **Undo, save/reopen, cross-game isolation, failure rollback stay pinned.**
6. Managed C: film copies remain protected throughout.

---

## 7. Definition of done

- No production dependency on `#app` or `#wsClassicOutlet`; both deleted.
- No production DOM reparent/restore lifecycle.
- **No entombed capability** — permanent gate: every capability in the P0 inventory
  has an affordance whose box lands **inside the viewport** on some route. Not
  `offsetParent`, not a non-zero rect: a `transform`-hidden drawer defeats both,
  and that exact false positive has already been produced once.
- No hidden duplicate navigation or controls.
- No legacy CSS governing native screens; **no raw hex in route stylesheets**.
- All capability, integrity, responsive, a11y and real-data gates pass.
- Four-viewport visual review (1440×900 / 1280×800 / 768×1024 / 390×844) and
  installed real-film smoke pass.

---

## 8. Delivery protocol

- **Codex builds; Claude independently reviews each committed milestone.**
- One coherent commit boundary per milestone.
- `CLAUDE.md` + this plan updated at every baton pass.
- **No installer per increment.** One clean versioned smoke build after the
  complete migration is independently accepted.
- Capture full gate output to a file every run (timings + `tail -40` on failure).

---

## 9. Disagreements with the brief

**D1 — The route list is incomplete, and the omissions block the goal.** Team Hub /
Season Library and the modal layer are LIVE inside `#app`. Milestones, not cleanup.
*Measured; highest confidence.*

**D2 — Team & Film Settings is the wrong pattern-setter for S1.** It is a drawer,
not a route: different lifecycle entirely. Reports is a true route with one
relocated node. Settings carries the higher *data* risk and deserves a stricter
gate, not the first slot.

**D3 — "Atomic replacement" and "S3 split into increments" conflict as written.**
A half-native route *is* a hidden fallback. Increments build alongside; the
ownership flip is a single step (S5d).

**D4 — The regression baseline is compromised before it starts. Biggest risk here.**
Many harnesses assert against legacy ids. Migrating markup reds them, and the
natural repair — "update the test to the new markup" — silently discards the
assertion. P0 must produce a **capability/behaviour-level** baseline. Every test
edited during a milestone must be justified as *"the capability changed"* or
*"only the selector changed"*, and reviewed as such.

**D5 — CSS is under-scoped.** ~7.5k lines governing legacy and native together.
Needs per-route stylesheets + a scoping audit from S1, not an S7 sweep. Two
unscoped `.top-bar`-era media rules already followed relocated controls.

**D6 — Break Down is not isolatable.** Its video stack also serves Study Watch and
Plan Watch. S5 changes playback for three routes; state that contract or it breaks
Study/Plan silently.

**D7 — Harden the data contract from a promise into a check** (§6.2).

**D8 — Note:** this reverses the current pass's roles. Structurally healthier —
the builder should not be the reviewer.

---

## 10. Look and feel: bundled, not deferred

**Why bundling is forced:** a native route is new markup by definition, so writing
it to reproduce a look we have decided to abandon means writing it twice; and DoD
"no legacy CSS governing native screens" leaves only two options if the legacy look
is kept — copy the old CSS forward under a new name, or keep referencing it.

**BUNDLE:** applying the approved direction to markup being rewritten anyway, with
a short per-route visual target approved **before** the milestone starts.
**DEFER:** open-ended design exploration, which has no exit criteria.

**Resolving the objection bundling creates** (structural + visual change destroys
visual-diff signal):
- Capability parity is verified **behaviourally** — data, film-ref equality,
  persisted bytes. Never visually.
- **Pixel baselines are captured AFTER a route migrates**, never before.
- What a milestone holds constant: data, film references, capability set. Not pixels.

**Consistency is a per-route exit criterion, not a final phase.** Codex proposed a
closing "application-wide polish" pass for consistency, a11y and empty/error
states. Rejected: the measured token drift (`reports-screen.css` 0 tokens / 23 raw
hex, the newest file being the worst) happened *precisely because* consistency was
not gated per route. Only cross-route motion and the final viewport review belong
at the end.

---

## 11. The design system (DECIDED)

Source of truth: `design-system/tokens.css`. Cards: claude.ai/design.

**11.1 Thesis — broadcast control room, not dashboard.** Two worlds: **THEATER**
(film surfaces, below the app floor, chrome recedes so video is the brightest
object on screen) and **DECK** (data surfaces, denser and brighter). The contrast
between them is the design. Today every surface is the same mid-grey at the same
elevation, which is why nothing dominates.

**11.2 Type — IBM Plex.** Sans for interface, **Condensed for every football
number**, Mono for data/labels. Embedded via `tools/bundle-plex.mjs` exactly as
Barlow is embedded today — production has never fetched a font and will not start.
*Football numbers are atomic: condensed, tabular, `nowrap`, column sized for the
worst real case (`4 & 26`). A football number that reflows is a bug.*

**11.3 Color — Radix-style 12-step role scale, tuned cool.** 1–2 surfaces, 3–5
interactive, 6–8 borders, 9–10 solid, 11–12 text, plus `--gi-film` below step 1.
Roles are assigned so an accent cannot drift into meaning everything — the failure
mode of the current single cyan. **Broadcast semantics:** line-of-scrimmage blue =
CURRENT (selection, active route), first-down yellow = TARGET ACHIEVED (conversion,
commit action, progress), red = turnover and destructive actions, green = system
health only.

**11.4 Density — pointer-dependent.** `--gi-hit` 30px on desktop, 44px under
`@media (pointer:coarse)`. 44px is a finger requirement, not a law, and Break Down
on a desktop is a mouse-and-keyboard surface.

**11.5 The tagging form is the density problem.** Measured: **53 fields, 151 chips.**
At 44px with wrapping that is ~2,500–3,000px of scroll on a form opened 60+ times a
game. Three fixes: pointer-dependent density; **resolved fields collapse to one
line** showing label + chosen value, with only the field being answered open;
**keyboard hints on every chip**, since the app already ships single-letter
shortcuts and a coach charting a game should barely touch the mouse — which is what
justifies compact chips, because chips become confirmation rather than primary input.

**11.6 Geometry and motion.** Square (0 radius). **Exactly one diagonal in the
product** — the broadcast lower-third. Motion tokens for quick/ease/enter, with a
`prefers-reduced-motion` override.

**11.7 Carbon and other systems — take the structure, refuse the brand.** Take
Carbon's layer model, data-table anatomy and 8px rhythm; Radix's color architecture;
Spectrum's content-is-hero principle. **Refuse** Carbon's neutral grey ramp (the
exact quality that makes every Carbon product look like the same admin console),
IBM Blue as primary, and Carbon's 32/40px control sizes. **Carbon governs data
surfaces; it must never govern the theater.** Nothing in Carbon knows what a first
down is — identity comes from the film, the field, and the numerals.

---

## 12. Per-route design direction, and open coach feedback

Each milestone starts from its design-system card. Coach feedback already recorded
against those cards, to be resolved **before** the corresponding milestone:

| Route | Direction | Open items |
|---|---|---|
| **Reports** (S1) | Film-linked analytics deck: KPI strip with deltas, run/pass composition, ranked formation effectiveness, formation × situation predictability heat grid, D&D with inline tendency bars. **Every mark is a cut-up.** | Evaluate Carbon Charts on ONE chart with a real film drilldown + measured bundle delta before taking the dependency (§13.5) |
| **Settings** (S2) | Storage truth: library root and per-game folder as visibly separate scopes; Linked vs Managed copy per game with resolved path and clip count; copy states that linking never copies, root changes never re-link, repair never creates/deletes plays. | — |
| **Team Hub** (S3) | Not yet designed. The identity moment — first screen a coach sees. | **Card still to build** |
| **Overlay layer** (S4) | One owned overlay host on `body`; consistent dialog/sheet/toast. | **Card still to build** |
| **Break Down** (S5) | Theater + deck. Drive-grouped play strip, yard grid inside the film, transport, collapsed-field form, pinned commit bar. **Ease of use, speed and accuracy are paramount — nothing may compete with charting.** | **(a)** Chip fill is too close to the panel background — raise contrast. **(b)** Chips may still be slightly large. **(c)** Suggestion/"tell" banner REMOVED from Break Down — it does not belong there; consider Study. **(d)** Drive-grouped strip may need scroll/zoom at 14 drives. |
| **Study** (S6) | Pivot: any dimension × any dimension, measure switcher, min-sample control, row/column totals, every cell a cut-up. Under-sample cells dimmed and labelled, never hidden. | Candidate home for the suggestion/tell surface |
| **Plan** (S6) | Findings grouped into a real game plan with linked play counts and watch actions. | **Presentation preview moves OUT of the cramped right rail to a bottom horizontal strip that fills as items are added**, leaving full width for the working board |
| **Home** | Continue-where-you-left-off hero with progress by unit; film inbox as honest health surface (ready/partial/missing) with resolved path and clip counts. | — |

---

## 13. What Codex should attack

1. **§1 is measured, but re-measure it.** Two prior handoffs described this DOM wrongly.
2. **D4 — the regression baseline.** Is a capability-level baseline actually
   achievable for 60 harnesses, or does this plan under-cost the biggest risk in it?
3. **D3 — is the S5 split honest**, or does "build alongside" become a permanent
   parallel implementation?
4. **Framework choice and blast radius.** View layer only is the stated boundary —
   is it enforceable, and what stops engines being "just slightly" refactored?
5. **Carbon Charts.** Our charts are film navigation, not decoration. Any library
   must preserve exact composite-ref equality. Prove it on one chart, measure the
   bundle, then decide.
6. **§11.5 density claims.** 53 fields / 151 chips is measured; the collapse-on-
   resolve pattern is not yet validated with a coach charting a real game.
7. **Is the theater/deck split real**, or does Carbon-influenced density quietly
   make Break Down an admin console with a video in it?
8. **What in §12 is still undesigned** (Team Hub, overlay layer) and does that
   sequence safely?
