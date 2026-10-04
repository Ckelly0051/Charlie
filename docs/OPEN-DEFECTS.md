# GridIron IQ Open Defects

Open items only. When an item closes, delete it here and record the closure in
the commit; history through 2026-10-04 is in
`docs/archive/OPEN-DEFECTS-THROUGH-2026-10-04.md`. Before reporting an item as
open, check its fix and smoke status in git.

## Repaired in source, awaiting the next installer and smoke

Latest coach-smoked build: `1.12.0-108` (2026-10-01). These are in source after
it. The next installed smoke must cover each.

- **CR-1..CR-8** (`576a0981`): a failed season read refuses the open; version
  restore and film repair stop if the game changes; overlapping season opens
  apply only the latest; film repair reports a failed save; a pass completed for
  a loss counts as an attempt and completion; Plan export opens the native save
  dialog; multi-clip cut-ups play in play order. Smoke: Plan export save
  dialog, a multi-clip cut-up's order, passing totals on a game with a screen
  for a loss.
- **ST-ROSTER-1, R1-R4** (`06b66829`, `76e592f1`, `84b43520`): Kick Return and
  Punt Return / Block offer our roster only for our returner; kicking units only
  for our kicker; the opposing number is typed and labeled Opponent (Other team
  in a scout season); row order is Kicker then Returner; Field Goal Block has one
  Blocker input; the active role holds after edits.
- **Gate infrastructure** (`f84c8be0` .. `06a1ffcf`): deadlines, shared
  browsers, run receipts. Test-only; no smoke item.

## Open defects

- **LG-1 — plays created without a unit.** SJM Varsity 2026 holds 33 plays whose
  tags are blank with no `unit` key (Week 4 vs Oakland Christian plays 31-34 and
  37-64; vs Romeo play 1). Every `PlayTagger` creation path seeds `unit`, so
  another path writes `{}` (film link or clip import suspected, not confirmed).
  Reading is safe (`countedUnit` treats them as offense). Reproduce, find the
  writer, seed the full tag schema there.
- **Play strip truncates results and shows "Down -".** Seen 2026-10-04 on 2025 JV
  Week 1: `Run Outs...`, `Gain + Touchdow...`; kickoffs and tries read
  `Down -`. Full text is only in tooltips.
- **Two Delete buttons and two Save & Next affordances on Break Down** (coach
  agreed 2026-10-04). Delete Play sits under the film and Delete in the deck
  header; Save & Next also shows an Enter key hint.
- **Gold marks everything on Break Down** (coach agreed 2026-10-04): active
  route, tabs, selected chips, section headers, drive labels, Edit library and
  Save & Next all use gold, so the primary action does not stand out.
- **Settings sit in the Break Down toolbar** (coach agreed 2026-10-04): Our
  Program / Opponent Scout repeats the Program selector; Customize fields, Game
  settings and Templates are once-a-season actions shown on every play.
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
