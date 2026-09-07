# GridIron IQ 1.12.0-74 Beta Smoke

## Candidate

- Version commit: `c8cb4e3` (`chore: bump to 1.12.0-74`)
- Release-gate repair: `c869140`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-74_x64-setup.exe`
- NSIS bytes: `4,002,757`
- NSIS SHA-256: `69B87E0249EDC258C48EBB5F7D0DD98ED70F995DD051621748430B587A01A873`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-74_x64_en-US.msi`
- MSI bytes: `5,545,984`
- MSI SHA-256: `1361B660BD814A15EF83CD545B354F2BC347226F7D1D094EEC6B3EAC5B2EEB87`

The full release gate passed immediately before packaging: 105 harnesses green,
0 skipped, 0 failed; real-data 10/10; parity 2/2. Tauri completed the release
binary, NSIS, and MSI packages. The command then exited nonzero at the updater
artifact signing step because this machine has the public key but no private
key. `TAURI.md` documents unsigned local smoke candidates; no signed updater
artifact was produced.

## Status

This candidate is **not accepted release state** until the installed WebView2
smoke is complete. The prior `1.12.0-73` package remains superseded.

During initial Reports inspection, the coach rejected Defense's internal
Self-Scout section as an obsolete predictability-only duplicate of part of the
rebuilt top-level Self-Scout report. Record additional observations before
batching any visual repair.

## Installed Smoke

1. Confirm linked film plays from its real drive.
2. Confirm managed film loads after restarting the app.
3. Chart a play, restart, and confirm both data and film persist.
4. Switch seasons and confirm counts, tags, and film identity remain correct.
5. Inspect all eight Our Program Reports tabs with real data: Overview, Offense,
   Defense, Special Teams, Players, Self-Scout, Season, and Matchup.
6. Record each Reports observation as PASS, REVISE, or REJECT. Do not confuse
   Defense's internal fifth section with the top-level Self-Scout tab.

| Area | Result | Notes |
|---|---|---|
| Home | | |
| Break Down | | |
| Study | | |
| Reports: Overview | | |
| Reports: Offense | | |
| Reports: Defense | REVISE | Internal Self-Scout section rejected as duplicate predictability wall. |
| Reports: Special Teams | | |
| Reports: Players | | |
| Reports: Self-Scout | | |
| Reports: Season | | |
| Reports: Matchup | | |
| Plan | | |
