# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Repaired in source, awaiting the next installer and smoke

Latest coach-smoked build: `1.12.0-111` (2026-10-06).

- **Missed tackles** (new, built 2026-10-07): the Players & Grades row on
  every unit, Film Room MTkl, CSV columns, Study's Missed Tackles and Missed
  Tackler, and the defensive Reports (Tackling module with Total Tackles and
  the Missed Tackle rate, the eleven-tile centered KPI strip, Game-by-game,
  Season vs Last 3, player columns, Players > Tackles MTkl). Smoke 112
  finding 8: our misses now count from the players named, with no Count box
  on our snaps; the Count stays for the opponent's misses on offense and
  returns. Smoke: name three defensive missers with no tackler, an offense
  count and a kickoff miss, then read Defense, Players and Study.
- **Return yards from the spots** (smoke 112 finding 1): the Return Yards box
  is gone; every report measures possession spot to end spot. The two 2025 JV
  punt returns with only a stored value now show none (coach, 2026-10-07).
  Smoke: OLV play 1 shows a 16-yard return for #13 in Special Teams and
  Players.
- **Playbook favorites and Edit** (smoke 112 findings 3-5): the star is a
  visible toggle (gold when a favorite), Chart's favorites update as soon as it
  is saved, and Edit opens the call in its own dialog. Smoke: star and unstar
  a call with a play open in Chart; edit a call's concept.
- **Dialogs are centered again** (found during the smoke 112 fixes): since
  `1.12.0-108` every dialog (Delete play, Clear tags, prompts, Remove call)
  filled the window from the top-left because a dead-CSS pass removed its
  placement. Escape pressed the instant a dialog opens now closes it. Smoke:
  Delete play opens a centered 520px dialog.
- **Tighter collapsed player rows** in Players & Grades (all units).
- **Shared dialogs for the tagger**: Delete play, Clear tags, templates and
  the detail-clearing prompts now use the in-app dialog; a destructive one
  defaults to Cancel. Modal dialogs block charting shortcuts, including when
  focus moves to a dialog button or falls outside the dialog.

## Open defects

Installed `1.12.0-112` smoke findings (coach, 2026-10-07), open:

- **2. Reopening the app opens the previous game.** Installed only: closing on
  Week 6 vs OLV wrote Week 5 St. George as the season's active game 8 seconds
  before the next launch; plays were intact. Not reproduced in the browser
  (Home card, Open game, charting, Settings, routes, close flush).
- **6. A play call does not replace charted values.** Decided: picking a call
  overwrites only the fields that call has defaults for.
- **7. The "Our Defensive Call" heading highlight has no horizontal padding.**

- **Players and the Defense board count some tackles differently.** Full
  season on the canonical 2025 JV data: #5 41 vs 40, #7 22 vs 21, #82 8 vs 7
  (Players > Tackles vs Defense > Defensive player contributions). Found
  2026-10-07 during the missed tackles comp; predates it. Not diagnosed.

- **A renamed HTML report does not open after saving.** Coach-reproduced for
  Defense Report and Game Report: the default filename works, a changed one does
  not. Treat as a shared export-delivery defect; do not guess the cause.
- **Rapid timeline scrubbing can falsely show "Film unavailable"** (intermittent,
  deprioritized). Installed WebView2 only; reopening loads the same film. Every
  scrubber `input` sets `video.currentTime`, and `VideoController` treats any
  resulting media `error` as missing film.
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

- `design-comps/breakdown-visual-finish-2026-09-28/index.html` loads
  `../../ux-prototype/assets/all22-frame.png`, deleted with `ux-prototype/` in
  `c28e7e26`; the comp now renders without its film frame. The comp is not a
  registered canonical artifact. Not fixed.

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
