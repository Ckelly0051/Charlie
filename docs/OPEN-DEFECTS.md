# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Release Status

Latest coach-smoked build: `1.12.0-113` (2026-10-09), PASS with the
intermittent scrubbing defect deferred. Packaged-asset inspection passed.
The smoke record and completed build checklist are in `SMOKE-1.12.0-113.md`.
Installed smoke does not change the design approval registry.

## Built, not yet packaged

- **Chart saves only what a play shows** (coach, 2026-10-10;
  `GRIDIRON-IQ-SAVE-CONTRACT.md`). Chart edits a draft; Save (new button, Save
  & Next) stores exactly what Chart shows; a unit, Special Teams unit or try
  attempt change never asks and is undone by switching back before Save;
  leaving a play with unsaved changes asks Stay / Discard / Save, including
  closing the window; the unsaved draft is saved with its game for recovery.
  Film Room locks what a play cannot show and settles each edit. An offensive
  snap ending in an interception or lost fumble opens Tackler(s). Players and
  the Defense board credit the same tackles: the canonical 2025 JV mismatch
  (#5 41 vs 40, #7 22 vs 21, #82 8 vs 7) is gone. Existing hidden values are
  the coach's to re-chart: `docs/HIDDEN-VALUES-LIST.md` (50 plays). Smoke:
  chart a defensive play with a tackler, switch to Offense and back, then
  Offense and Save; click another play with unsaved changes; close the window
  with unsaved changes; reopen after Discard.

- **Dashboards** (coach, 2026-10-10: self-serve reporting; built overnight
  without a comp, so its composition awaits the coach's review). Reports >
  Dashboards: templates, Number / Bar / Share / Game by game / Heat map /
  Table / Leaders widgets, scope, unit and filters, every value film-linked,
  saved with the season. Smoke: open each template on the real season, add a
  widget, filter to 3rd down, click a bar and a heat-map cell to watch film,
  relaunch and reopen the dashboard.

## Open defects

- **Study groups defensive plays into empty offense-look groups.** Study
  groups through the report cut filters (`StudyQuery._groupPlays` ->
  `StatsEngine._buildCutFilter`), which are unit-gated: an offense look (down,
  formation, play type, run/pass, hash) matches only offensive snaps and a
  defense look only defensive ones. On the canonical season, Study over the
  174 defensive plays lists every down, formation and play type with 0 plays.
  Found 2026-10-10 building Dashboards (which group by registry value
  instead). Fixing it changes Study's report-cut parity contract
  (`e2e-study-query`); not changed.

- **A renamed HTML report does not open after saving.** Coach-reproduced for
  Defense Report and Game Report: the default filename works, a changed one does
  not. Treat as a shared export-delivery defect; do not guess the cause.
- **Rapid timeline scrubbing can falsely show "Film unavailable"** (intermittent,
  deprioritized). Installed WebView2 only; reopening loads the same film. Every
  scrubber `input` sets `video.currentTime`, and `VideoController` treats any
  resulting media `error` as missing film.
  Recurred during installed 113 smoke (2026-10-08), Varsity 2026 vs OLV,
  Play 26, clip `20261003_192402`, at 0:04 of 0:16; see
  `SMOKE-1.12.0-113.md` finding 1. Screenshot confirms the unavailable overlay
  with a film frame still visible; no new root cause established.
  Coach reports another recurrence: quickly seek forward and back; it does
  not fail every time. Investigation is deferred at the coach's request.
  Automated seeks with a screenshot between inputs do not reproduce that
  timing or establish a root cause. No fix or coach-data change made.
- **OCR controls are a visible dead end** (OCR-1, parked by the coach
  2026-09-27). Set region, Read and Auto OCR render into elements that no longer
  exist. Kept for future use; the controls do nothing today.
- **Offense narrow-width exception.** At 1280, eight five-column Offense modules
  keep 12px cells (`gi-off-narrow-fit`). Recomposing that band so the exception
  can be deleted is open.

- **Off-gate persistence matrix: one lock fails at HEAD.**
  `node tools/pc-adversarial-matrix.mjs` (not in the gate): "a commit never
  mirrors an EMPTY roster/playbook over a populated one" reports
  `{"roster":0,"calls":1}`. Same result at `76910435` before the 2026-10-04
  startup-import removal. Determine whether the lock is stale (rosters became
  season-owned) or a real empty-roster overwrite.

## Old patterns to fix when touched

Working code built the old way. A change that edits one of these files fixes
that file's items in the same change, or its commit message says why not.
Read this section before every build. Lower the count here, and in
`tools/legacy-inventory-baseline.json`, in the commit that fixes an item;
delete a line when its count reaches zero. Counts from `tools/audit-legacy.mjs`,
updated 2026-10-07.

**`window.app` reach-through** (25). Code reaching shared services through the
global app instead of its owner or an injected dependency.
- `js/season-manager.js` 8
- `js/version-manager.js` 6
- `js/custom-chips.js` 3
- `js/app.js` 1: the global itself (`window.app = new App()`), which the remaining
  reach-throughs and the test harnesses use; it goes last
- `js/playlist-manager.js` 2
- `js/storage-backend.js` 2
- `js/scoreboard-ocr.js`, `tag-library-settings.js`, `video-controller.js` 1 each

**Raw `innerHTML` writes** (18). HTML built as strings instead of rendered by the
native owner; each one is an escaping risk.
- `js/reports-screen.js` 4
- `js/scoreboard-ocr.js` 4 (OCR is parked)
- `js/auto-detect-screen.js` 2
- `js/ui-polish.js` 2
- `js/workspace-shell.js` 2
- `js/cutup-exporter.js`, `cutup-player.js`, `play-diagram.js`, `updater.js` 1 each

**Native `alert()`** (3). Use the in-app toast or confirm.
- `js/video-controller.js` 2: "No video files found" (folder and drop)
- `js/play-diagram.js` 1: "Select a play first"

**Dialogs outside the overlay spec** (2). They work but miss its focus and Escape
rules; move them to `js/native-overlay-service.js`.
- `js/auto-detect-screen.js` `openReview()` builds its own modal
- `js/play-diagram.js` the diagram editor builds its own modal

**`js/stats-engine.js` size** (6,499 lines). Split by area when a change works in
it, with `e2e-parity` proving no change. Skipped by the missed tackles build
(2026-10-07), which edited the file: a split is a restructure with no visible
change and would bury the feature in a very large diff.

## Stale references found in passing

- Left by the 2026-10-10 save change (fix in the batch):
  `GRIDIRON-IQ-SAVE-CONTRACT.md` §2 says the recovery copy is in browser
  storage (`giq_chart_draft`); it is the game's `chartDraft`.
  `tools/e2e-st-try-charting.mjs:11` says switching to Kick XP asks, then
  clears; it no longer asks. `js/play-tagger.js` `clearCurrentTags` doc says
  it clears the on-screen form and stored tags; it clears the open draft.
  `js/notes-manager.js` `setNotes` doc says it keeps the canonical play
  current; it writes the open draft.
- `design-comps/breakdown-visual-finish-2026-09-28/index.html` loads
  `../../ux-prototype/assets/all22-frame.png`, deleted with `ux-prototype/` in
  `c28e7e26`; the comp now renders without its film frame. The comp is not a
  registered canonical artifact. Not fixed.

## Coach decisions to build (2026-10-10, with the Codex review batch)

- **Missed tackles after a turnover**: an offensive snap ending in a turnover
  also names our missed tacklers (as on defense).
- **Both teams' tacklers after a takeaway**: a play can hold our tackler(s)
  and the opponent's (e.g. our defender strip-sacks, their QB tackles him), so
  a turnover play gets a box for ours and one for theirs.
- **Study's Tackler role** includes kick coverage and offensive turnover
  tackles, like Players.
- **Switching units saves the play** (replaces the draft-only unit switch).
  When the switch would clear values the coach charted, an in-app prompt asks
  first (Cancel default); values the app filled in (Auto D&D down, distance
  and field position, carried quarter and drive, carried unit, Carry
  formation) never trigger it. The Save button (saves, stays on the play) and
  the leave prompt on Previous already exist.
- **Dashboards button in violet** (a new color used only for it, about
  #7f5af0 with white text), replacing the accent blue. Coral was too close
  to the warning orange and offense gold.
- Decided, already built: the Defense board's player lines count turnover
  tackles; a Fake punt or field goal charts Play & Result; Use Play is the
  play-call confirmation and replaces only the fields the call has defaults
  for (current behavior, no prompt).

## Coach decisions pending

- **Focus ring color.** `--gi-focus` resolves to blue (`--gi-9`) app-wide;
  neutralizing it is an app-wide palette change.
- **Special Teams accent.** Special Teams Reports use the neutral line, not an
  accent like Offense gold or Defense cyan.
- **`Option` in fixed report schemas.** It is absent from Overview's approved six
  play-type categories and the Defense dashboard's seven.
- **Home rail at 1280x800.** Two rail panes, tools and footer do not all fit;
  space must come from the tools or footer.
- **Home at 390.** The stacked rail fills the first screen before any workspace
  body.

## Coach-owned data

- Drive-number slips in 2025 JV Week 1: Opponent Drive 3 holds plays 24-28 (Q2)
  and 51-58 (Q3); Our Drive 6 holds 59-60 and 66-69.
- Play 23 is stored as Kick XP; it should be Try, Run/Pass, Converted, 1 Point.
- Plays to re-chart after the legacy conversion: `docs/LEGACY-RECHART-LIST.md`.

## Structural limits (planning inputs, not defects)

- Settings live in localStorage (about 87 call sites): the quota failed once,
  settings do not travel with a season, and nothing syncs them. Blocks the
  mobile companion.
- Chromium harnesses prove behavior and geometry, not installed WebView2
  rendering or visual fidelity; every installer needs an installed smoke.
