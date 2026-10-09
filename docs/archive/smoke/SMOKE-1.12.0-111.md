# SMOKE 1.12.0-111 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `87612c5a`: **153/153 green, 0 skipped, 0 failed**, 2026-10-06.
- Version-only bump `4ee0595b` (all four owners `1.12.0-111`); `e2e-p0-exit` green.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-111_x64-setup.exe`,
  4,040,492 bytes, SHA-256
  `C98BF2F08AB4FDE0A8D491E4E6E22FDF9381F3141A583C295BD4B7FE94CA1F27`.
  Product and file version `1.12.0-111`. Built from a clean tree at `4ee0595b`
  with `cargo tauri build --bundles nsis` and `createUpdaterArtifacts:false`.
  Nothing pushed, tagged or published.
- Packaged-asset inspection (non-builder, `docs/RELEASE.md`): not recorded.

## Result

**Installed smoke passed - coach approval, 2026-10-06** ("smoke passed").
No findings. This approval does not move the design-approval registry. No
packaged-asset inspection by Codex was recorded before the smoke.

## What to check

Standard smoke (`docs/RELEASE.md`), plus the items since 110:

- **Startup:** launch the app; Home lists your seasons (no "Get started" or
  "Create first season"). A "Loading seasons…" that stays is a new finding.
- **Break Down look** (`design-comps/breakdown-cleanup-2026-10-05`): gold only
  on Save & Next, the route underline, the Offense tab and scoring results;
  selected chips, section labels and the PLAY badge are neutral.
- **Toolbar:** Chart / Film Room, Quick chart and Film focus only. Game
  settings and Customize fields are in More > This game.
- **One Delete:** Delete play in the deck header asks first (try Cancel).
  Save as template and Delete template are inside the Templates menu.
- **Play strip:** results read in full; Special Teams snaps show their unit,
  or "Special Teams" when the event is not charted, with yardage kept.
- **More menu:** title, This game / Season / Export / Tools groups, grey
  details, version at the bottom.
- **Saving:** Save season from More shows Saved; the Break Down indicator reads
  Saving… then Saved while charting.
- **Cut-up export:** the start question and "Save partial video?" appear inside
  the app; cancel a short export.
- **Mark as Final:** in Game settings for a scored game; the season record on
  Home counts it; unchecking removes it.

## Findings

None (coach, 2026-10-06).
