# GridIron IQ Current-Pass Closeout

> **Status:** IMPLEMENTED — awaiting Codex combined review.
>
> **Builder:** Claude
>
> **Independent reviewer:** Codex
>
> **Installed smoke authority:** Coach
>
> This is one batched closeout pass. Do not package or publish individual fixes.
> `GRIDIRON-IQ-PLAN-V2.md` is parked future work and is not part of this pass.
>
> **⚠ AMENDED by `GRIDIRON-IQ-CLOSEOUT-AMENDMENT-2026-07-23.md` (binding; it
> controls on any conflict).** The original C1 below proposed routing the legacy
> and redesigned game-entry paths through one command while KEEPING both
> surfaces. **That "support both routes" interpretation is SUPERSEDED.** C1 now
> RETIRES the obsolete Team/Season Library schedule game-entry route: one
> workspace-entry command, one active-game owner, Home as the sole game entry;
> old season data still loads through the canonical loader, but the old
> game-entry UI does not survive. Read §3 Checkpoint C1 below only as background;
> the amendment's "Revised C1" is the binding spec.
>
> **Implementation result (2026-07-23):**
> - **C1 committed `afb8115`** — legacy schedule retired as a game-entry surface;
>   `App.openGame()` is the one command every route funnels through;
>   `openSchedule()` redirects to Home under the shell so the grid can't be
>   reached/mounted/restored. Mutation-verified. `e2e-workspace-shell` 33/33.
> - **C2 committed `660ccfa` (tests only)** — reproduce-first showed the
>   linked-film production code already correct post-`3a00ddd`; Refuge's false
>   success was the wrong-active-game defect that C1 fixes. Mutation-verified
>   regressions: wrong-active-game reproduction + single-owner fix, real
>   SqlCatalog save→reload keeps a linked game linked, OL Lakes 82/65/17 missing
>   reported, no silent managed-C: fallback. No real data changed.
> - Full canonical gate **59/59 green** on the committed bytes; `cargo check`
>   clean. C1+C2 are one milestone — **no package/tag until Codex accepts**.
>
> **Codex re-review found four issues; all FIXED as one follow-up batch
> (2026-07-23).** (1) P0 overlapping-open film-load race —
> latest-load-wins token in `storage.js`, new `e2e-film-load-race`, mutation-
> verified. (2) Classic layout FULLY retired at the coach's direction ("just
> remove it") — no flag, no "Use classic layout" button, `openSchedule` always
> redirects to Home, one product route on every build; `disable()` kept only as
> the tested internal teardown; engine + onboarding harnesses reworked to the
> shell flow. (3) C2 now proves the REAL path (`app.openGame(Refuge)` → link →
> persist → reopen from the saved payload, zero managed calls). (4) `+ New game`
> is a first-class shell-Home action. Now-inert schedule-view render code is left
> in place (unreachable) as a flagged follow-up cleanup, not deleted mid-milestone.
>
> **With Codex unavailable, Claude self-reviewed that four-fix batch
> adversarially and found + fixed four more issues (2026-07-23).** (a) The P0
> fix's own test had zero coverage on the multi-clip/linked-film branches (your
> six real games are all linked+multi-clip) — AND its timing was silently broken
> by the fix's own messaging guards, masking the deep-guard mutation check; both
> fixed, all three guards (single-video/multi-clip/linked) now mutation-verified
> individually. (b) Superseded loads still toasted the WRONG game's film state —
> every message after an await is now guarded by `!stale()`. (c) A false
> "covered by e2e-breakdown-a11y" claim — fixed by measuring the REAL shell
> mobile Break Down route, which **surfaced a genuine 32px touch-target defect**
> (below the 44px minimum) in the relocated unit toggle, now fixed in CSS. (d) A
> side-effecting default parameter on `_autoLoadLinkedFilm` made required.
>
> **A SECOND self-review then retracted one of those claims and found a real
> defect (2026-07-23).** (i) **RETRACTION:** the "`e2e-film-room` failure is
> PRE-EXISTING" claim was wrong on both counts. The proof was circular (it
> compared against `36540cc` — the same batch's own commit, and the very one
> that moved that harness onto the shell route); the true baseline `e175af7` was
> **179/179 green**. And the diagnosis was wrong: it is an intermittent,
> load-sensitive harness flake (now **5/5 standalone, 4/4 under parallel load,
> full gate green**), not a reproducible grid-editor defect. Hardening that
> section's waits remains a genuine follow-up. (ii) **[High] The redesigned tag
> form missed its FIRST launch** on any fresh profile — `BreakdownForm` reads the
> shell key in its constructor (`app.js:73`) but `shell.init()` writes it at
> `app.js:207`, so session #1 rendered the shell around the CLASSIC form and it
> "fixed itself" on reload. Confirmed empirically, fixed by having `enable()`
> call `breakdownForm.mount()` next to the existing `breakdownVideo.mount()`,
> and mutation-verified. Affects the browser build always and any desktop
> version `beta-config` doesn't pre-seed. (iii) The onboarding W/L assertion,
> silently downgraded to reading fixture data, is restored as a real UI check.
> Full canonical gate green; `cargo check` clean. Re-review pending.

## 1. Goal

Close the remaining gap between what the installed app appears to do and what
its persisted navigation and film-storage state actually says. The result must
be one stable beta candidate with a single game-opening lifecycle, durable
linked-film metadata, visible source truth, and no changes to charted data.

## 2. Installed Evidence To Reproduce

### 2.1 Navigation and active-context defects

1. Entering Break Down from the redesigned Home can omit the Settings/More
   controls that appear when the same game is entered through the older Season
   Library path.
2. Returning Home after opening or linking one game can highlight the previous
   game instead of the current game.
3. The two routes visibly reach overlapping workspaces through different
   lifecycle/state ownership. High CPU/GPU load was initially suspected, but
   route-dependent reproduction makes timing only a possible amplifier, not
   the accepted root cause.

### 2.2 Read-only backend audit, 2026-07-22

Configured library root: `D:\Football\Film`.

The canonical SQLite catalog and JSON safety copy agree:

| Game | Persisted source | Clip audit |
|---|---|---|
| St. Peter | Linked: `St Peter 41-0` | 69/69 exact |
| ND Prep | Linked: `Marist 8-6-2025` | 79/79 exact |
| Refuge | **Managed/default; no saved `filmMode` or `filmDir`** | Intended D: folder contains all 78 charted clip names |
| OL Sorrows | Linked: `Sorrows 18-6` | 72/72 exact |
| OL Lakes | Linked: `OLL 13-13` | 17 of 82 charted clip names absent from D: |
| Holy Family | Linked: `Holy Family` | All 72 charted plays resolve |

Refuge appeared to work because its 78-file managed C: copy remained available;
the attempted D: link did not persist. OL Lakes is genuinely configured to use
D:, but only 65 of its 82 charted clip references resolve there. The 17 missing
filenames were not found elsewhere under `D:\Football\Film` and are also absent
from the old managed copy.

Old managed C: copies still exist for all six games. They must not be deleted in
this pass.

## 3. Scope

### Checkpoint C1: One game-opening lifecycle

Claude must first trace every caller that opens, previews, switches, or restores
a game from Team Hub, Home, Season Library, Break Down, Study, and Plan.

Required implementation outcomes:

- One authoritative command owns active team/season/game selection and the
  transition into the workspace.
- Every supported entry route invokes that command instead of duplicating
  selection, rendering, or restore behavior.
- Settings/More availability is a deterministic workspace state, not an
  incidental result of which route mounted the screen.
- Home distinguishes an intentional preview selection from the active opened
  game. Returning from Break Down highlights the actual current game.
- A stale async render, film-health result, or prior-game callback cannot replace
  current selection or chrome.
- Re-entering the same game is idempotent and does not duplicate listeners,
  subscriptions, saves, or film loads.
- Existing Study and Plan context follows the same active game without changing
  analytics or plan data.

Do not solve this by merely forcing the missing bar visible with CSS. The test
must prove lifecycle/context equality through both entry routes.

### Checkpoint C2: Durable linked-film truth

Reproduce the Refuge failure through the installed-flow equivalent before
changing production code. Determine whether stale active-game context, the link
transaction, rollback, autosave ordering, or route ownership caused the selected
folder to play without persisting `filmMode='linked'` and `filmDir`.

Required implementation outcomes:

- A successful game-folder link persists to both canonical SQLite and the JSON
  safety copy before success is shown.
- Close/reopen resolves the same absolute D: folder and uses the linked branch
  with zero managed import/copy calls.
- A link operation remains scoped to the game the coach selected, even if Home
  preview, active game, or rendering state changes during the async picker/save.
- Cancel, denial, invalid/outside-root selection, game switch, and failed save
  leave root, game metadata, clip references, tags, notes, and current play
  unchanged.
- The active workspace exposes a concise source status that distinguishes
  `Linked` from `Managed`. The exact resolved path remains available in Team &
  Film Settings. Do not build the full Plan V2 diagnostics center here.
- Missing linked clips produce a durable, understandable game-health state. For
  OL Lakes, the app must report 17 missing charted clips rather than silently
  implying complete film.
- The app must never fall back from a persisted linked game to an old managed
  copy without explicitly telling the coach.

OL Lakes is an audit case, not permission to alter data. Do not create phantom
files, rewrite clip identities, clear plays, or silently switch it to managed
mode. The coach will decide what to do with unavailable source film.

## 4. Data-Safety Contract

The repair may change only navigation/UI state and the intended game-level
`filmMode`/`filmDir` link metadata.

It must preserve, byte-for-byte where serialization permits:

- Season, game, and play ids.
- Play order and current-play identity.
- Clip refs, catalog clip ids, clip names, and clip paths.
- Tags, notes, annotations, roster, game information, plans, and versions.
- Library root unless the coach explicitly changes the root.
- Every other game's complete data while linking one game.

No migration, managed-film deletion, bulk repair, or cleanup is authorized.
Any discovered need to clear or rewrite real data stops for coach approval.

## 5. Required Regression Proof

Every new regression must be watched fail against pre-fix behavior and pass
after the repair. At minimum:

1. New Home -> open Game A -> Break Down has the same navigation/settings
   contract as Season Library -> open Game A.
2. Game A -> Home -> open Game B -> Home highlights Game B, never Game A.
3. Rapid A/B switching with delayed film-health and folder-resolution promises
   cannot restore A's selection, source badge, or chrome over B.
4. Repeated open/restore cycles keep one listener/subscription set and one
   logical film load per transition.
5. Link `D:\Football\Film\Refuge 7-13` while the library root remains
   `D:\Football\Film`; save, close/reopen, and assert canonical `linked` metadata
   plus a D:-resolved playback URL and zero managed-copy calls.
6. Switch games while the link picker/save is unresolved; no wrong-game link or
   success message is permitted.
7. Inject a canonical-save failure; both catalog and JSON remain at the prior
   state and the UI reports that the link was not saved.
8. Feed the OL Lakes fixture with 17 missing charted clips; the UI reports the
   incomplete source and does not load those plays from C:.
9. Fingerprint the entire six-game season before and after each link/navigation
   scenario and allow only the explicitly expected metadata changes.

Existing focused suites to extend or run:

- `tools/e2e-workspace-shell.mjs`
- Breakdown workspace/lifecycle harnesses
- `tools/e2e-onboarding.mjs`
- `tools/e2e-film-storage-setup.mjs`
- `tools/e2e-linked-film.mjs`
- Catalog persistence/backend and season durability harnesses
- Full canonical release gate from `GRIDIRON-IQ-RELEASE-GATE.md`
- `cargo check`

The built `football-film-analyzer.html` must be regenerated only after source
tests pass, then the full gate must run against those exact built bytes.

## 6. Existing Uncommitted Work

The shared worktree currently contains an uncommitted Codex navigation draft in:

- `css/workspace-shell.css`
- `js/season-library.js`
- `js/workspace-shell.js`
- `tools/e2e-workspace-shell.mjs`
- the generated `football-film-analyzer.html`

Claude must inspect this diff before editing. It is neither accepted code nor
permission to discard unrelated work. Keep, rewrite, or supersede each hunk only
after tracing it to this contract, and record that decision in the handoff.
Temporary `.tmp-*` directories and untracked `AGENTS.md` remain excluded.
`GRIDIRON-IQ-PLAN-V2.md` is a separate documentation artifact.

## 7. Commit And Review Sequence

1. **C1 internal checkpoint:** navigation/context source + failing-first tests.
2. **C2 internal checkpoint:** link durability/source truth + failing-first tests.
3. **Closeout docs checkpoint:** update this file, `CLAUDE.md`, the redesign
   handoff, smoke findings, and release-gate status with exact SHAs and counts.
4. Claude stops with a clean, committed source state. No tag, deployment, or
   installer publication.
5. Codex independently reviews the combined C1+C2 behavior, checks every changed
   caller and persistence path, reruns focused suites and the full gate, and
   records findings or acceptance.
6. Only after acceptance is one internal candidate packaged.
7. Coach runs the installed smoke and alone authorizes publication or deletion
   of any managed C: film.

Do not publish between C1 and C2. A green unit test or visually successful film
load is not proof of persisted source truth.

## 8. Installed Smoke To Close The Pass

The final candidate passes only when the coach confirms:

1. Open games through Home and the remaining legacy route; navigation and
   Settings/More are identical.
2. Switch among at least three games and return Home after each; the correct game
   is selected every time.
3. Link Refuge to its D: folder, close the application completely, reopen, and
   see `Linked` plus the correct resolved source.
4. Play several Refuge clips after restart with no new managed files created.
5. OL Lakes visibly reports incomplete film; a present clip plays from D: and a
   missing clip does not silently use C:.
6. Edit one tag, Save & Next, restart, and verify the edit plus every other game
   remains intact.
7. Launch one Study result and play its exact film sequence.
8. Create or update one Plan item, save, restart, and verify it remains.
9. Confirm backup/save status and reopen the season successfully.

Passing this smoke closes the current redesign/repair cycle. Further product
work moves to the parked Plan V2 roadmap.

