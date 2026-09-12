# Smoke candidate 1.12.0-81 — Windows x64, unsigned

## Artifacts

- Version commit: `674860d`
- Source commit packaged: `674860d` (on top of `5f10e36`)
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-81_x64-setup.exe`
- NSIS bytes: `4,002,006`
- NSIS SHA-256: `42C3F8CBD73F1EE09FCD262F12FE75ED6D831A4E57CC5A4236F311FAEE440544`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-81_x64_en-US.msi`
- MSI bytes: `5,545,984`
- MSI SHA-256: `FFF0ECAEFB7D5368AA43A66F166B8F583AF080B953F1B703CA2FBDAC22A00BEA`

The executable FileVersion and ProductVersion both read `1.12.0-81`. Tauri
rebuilt the frontend itself and produced unsigned NSIS and MSI packages;
updater signing was skipped by `--no-sign`.

## What this build contains that `1.12.0-80` does not

`1.12.0-80` was packaged before the pre-gate review of the shared visual range.
This build is the first installer carrying those repairs:

- **Reports typography.** The 12.5px coach-facing floor is enforced by a
  canonical-season census (`e2e-reports-typefloor-realdata`). Overview and
  Defense retain only approved broadcast micro-labels; Offense retains a named
  1280 exception on eight `gi-off-narrow-fit` modules; Special Teams, Players,
  Self-Scout, Season and Matchup remain deferred with measured counts.
- **The neutral ladder is complete.** `--gi-film`, `--gi-1`..`--gi-8`,
  `--gi-11`, `--gi-12`, `--gi-on-solid` and the whole `--gi-bd-*` broadcast
  family are true grey. `1.12.0-80` shipped the app background at +9 blue and
  the broadcast family as high as +27, which is why it still read blue.
- **Defense cohort contract.** `charted` and `measured` are both named; a look
  charted with no play type shows its real charted count and dashes for
  production instead of a fabricated `0`. The KPI rail no longer synthesizes
  yardage from `ypp × snaps`.
- **Shared Reports chrome composition.** The linescore band holds one row, the
  identity strip is registered to the board's column origin, and the rail and
  the board report the same numbers.
- **Breakdown geometry.** The 1440 charting form no longer overflows its 400px
  deck, and the 1920 picture budget is restored.
- **Shell contrast and selector width.** Disabled route labels moved from
  2.2:1 to 3.7:1, and the Program selector holds `St. Joseph Mavericks`
  unclipped at both desktop widths.

## Verification

Full gate on `5f10e36`, the commit this build's source sits on:
**110 harnesses, 110 green, 0 skipped, 0 failed.** `e2e-p0-exit` 19/0 confirms
all four version sites agree at `1.12.0-81`.

## Status

This is an unsigned local visual-smoke candidate for coach testing. It is not
accepted, tagged, pushed or published state, and no surface advances past its
current approval status on the strength of it. Puppeteer cannot certify
installed WebView2 behavior — film codecs, the asset protocol, native dialogs,
filesystem scope and app lifecycle are only real here.

Open items carried into this smoke are in `docs/OPEN-DEFECTS.md`. The two
largest: recomposing the Offense three-up band so its 1280 type exception can
be deleted, and migrating the five deferred Reports boards to the 12.5px floor.
