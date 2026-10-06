# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Repaired in source, awaiting the next installer and smoke

Latest coach-smoked build: `1.12.0-110` (2026-10-05). These are in source after
it. The next installed smoke must cover each.

- **Break Down cleanup** (comp `design-comps/breakdown-cleanup-2026-10-05`,
  COMP_APPROVED 2026-10-05; production IMPLEMENTED_UNVERIFIED): gold only on
  Save & Next, the route underline, the Offense unit tab and scoring results;
  neutral selected chips, section labels, current-play badge, drive label and
  Film Room filters; Our Program / Opponent Scout removed from the toolbar;
  Game settings and Customize fields in More; one Delete (the deck's Delete
  play; Save and Delete template inside the Templates menu); Save & Next
  without the Enter hint; play-strip cards show the full result and a Special
  Teams snap's unit; More is a titled, grouped menu. Smoke: chart a few plays
  at your normal window size; delete a play from the deck and Cancel; save,
  apply and delete a template; open More and Game settings.
- **Home at startup shows the library, not first-run** (SMOKE-110 finding 1):
  until Team Hub's first load finishes, Home shows "Loading seasons…" instead
  of Get started and "Create first season". Smoke: launch the app; Home lists
  your seasons. If "Loading seasons…" stays for more than a moment, that is a
  slow or stuck first load and is a new finding.

## Open defects

- **LG-1 — plays created without a unit.** SJM Varsity 2026 holds 33 plays whose
  tags are blank with no `unit` key (Week 4 vs Oakland Christian plays 31-34 and
  37-64; vs Romeo play 1). Every `PlayTagger` creation path seeds `unit`, so
  another path writes `{}` (film link or clip import suspected, not confirmed).
  Reading is safe (`countedUnit` treats them as offense). Reproduce, find the
  writer, seed the full tag schema there.
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
