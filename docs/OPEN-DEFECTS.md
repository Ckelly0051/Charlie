# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Repaired in source, awaiting the next installer and smoke

None. Latest coach-smoked build: `1.12.0-111` (2026-10-06).

## Open defects

- **`e2e-study-screen` now fails deterministically** (2026-10-06, after the
  gate passed 153/153 at `87612c5a` the same day). Two checks: Season Watch
  reports "1 skipped" (expects 2) and Coverage Family finds 0 plays. It fails
  identically at `87612c5a`, `4ee0595b` and `9ef5673d`, so the stranded-code
  cleanup did not cause it; something outside the code (time, date or local
  state) changed. Not yet diagnosed. The cleanup's full gate is otherwise
  153/154 at `69badd5f`.

- **Native `alert()` remains** in four files (code review 2026-10-06):
  `js/storage.js`, `roster-manager.js`, `video-controller.js` and
  `play-diagram.js`.

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
- **Two dialogs sit outside the overlay spec**: the auto-detect Review dialog and
  `PlayTagger._confirmDialog` / `_promptDialog`. They work but miss the spec's
  focus and Escape rules.
- **Offense narrow-width exception.** At 1280, eight five-column Offense modules
  keep 12px cells (`gi-off-narrow-fit`). Recomposing that band so the exception
  can be deleted is open.

- **Off-gate persistence matrix: one lock fails at HEAD.**
  `node tools/pc-adversarial-matrix.mjs` (not in the gate): "a commit never
  mirrors an EMPTY roster/playbook over a populated one" reports
  `{"roster":0,"calls":1}`. Same result at `76910435` before the 2026-10-04
  startup-import removal. Determine whether the lock is stale (rosters became
  season-owned) or a real empty-roster overwrite.

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
- Screens share live services through `window.app` and `PlayTagger` events
  rather than one state store.
- `stats-engine.js` is about 6,600 lines; splitting it by area is possible with
  `e2e-parity` proving no change.
- Chromium harnesses prove behavior and geometry, not installed WebView2
  rendering or visual fidelity; every installer needs an installed smoke.
