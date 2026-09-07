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

## Status — REJECTED

The coach rejected this candidate during the installed WebView2 visual smoke
on 2026-09-06. Reports production does not faithfully preserve the individually
approved compositions: production-only composition and nesting appeared,
shared presentation drift remained, and Season child reports produced compound
screens that were never accepted as production. The installed Home screen was
also reported visually off.

`1.12.0-70` remains the last accepted installed smoke candidate. Do not ship,
tag, publish, or use `1.12.0-74` as a visual baseline. Passing behavior gates
remain valid evidence about the tested contracts, but they do not reverse this
visual rejection.

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
| Home | REJECT | Installed presentation reported visually off; compare against the registered 2026-08-31 canonical comp. |
| Break Down | | |
| Study | | |
| Reports: Overview | REJECT | Production does not match the registered Charlie Gate reference. |
| Reports: Offense | REJECT | Production composition rejected during installed review. |
| Reports: Defense | REJECT | Production composition rejected; internal Self-Scout is an obsolete duplicate. |
| Reports: Special Teams | REJECT | Production composition rejected during installed review. |
| Reports: Players | REJECT | Production composition rejected during installed review. |
| Reports: Self-Scout | REJECT | Production composition rejected during installed review. |
| Reports: Season | REJECT | Child reports are compounded inside Season and do not preserve accepted production composition. |
| Reports: Matchup | REJECT | Production composition rejected during installed review. |
| Plan | | |
