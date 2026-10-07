# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Repaired in source, awaiting the next installer and smoke

None. Latest coach-smoked build: `1.12.0-111` (2026-10-06).

## Open defects

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

**`window.app` reach-through** (66). Code reaching shared services through the
global app instead of its owner or an injected dependency.
- `js/storage.js` 26
- `js/stats-engine.js` 14
- `js/season-manager.js` 8
- `js/version-manager.js` 6
- `js/custom-chips.js` 3
- `js/app.js` 2
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

**Native `alert()`** (7). Use the in-app toast or confirm.
- `js/storage.js` 4: "Invalid project file." (twice), "No video loaded.",
  "No plays to export."
- `js/video-controller.js` 2: "No video files found" (folder and drop)
- `js/play-diagram.js` 1: "Select a play first"

**Dialogs outside the overlay spec** (2). They work but miss its focus and Escape
rules; move them to `js/native-overlay-service.js`.
- `js/auto-detect-screen.js` `openReview()` builds its own modal
- `js/play-diagram.js` the diagram editor builds its own modal

**`js/stats-engine.js` size** (6,499 lines). Split by area when a change works in
it, with `e2e-parity` proving no change.

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
