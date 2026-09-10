# GridIron IQ 1.12.0-76 Beta Smoke

## Candidate

- Version commit: `523d2cd` (`chore: bump to 1.12.0-76`)
- Defense reporting batch: `e0ce2f7`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-76_x64-setup.exe`
- NSIS bytes: `4,001,943`
- NSIS SHA-256: `171AB27DF6A679C696772129128F15E09C20D07E7DA973230764EC6DBC8FA307`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-76_x64_en-US.msi`
- MSI bytes: `5,545,984`
- MSI SHA-256: `CFA4BF6DF519EB2A9739E81E53FD93DE85B6BDA0D1773DCA4C772A7C01428AEF`

The complete release gate passed immediately before packaging: 109 harnesses
green, 0 skipped, 0 failed; Defense real data 42/0; canonical real data 10/10;
parity 2/2. Tauri completed the release binary, NSIS, and MSI packages with
`--no-sign`; no signed updater artifact was requested or produced. The built
executable's FileVersion and ProductVersion both read `1.12.0-76`.

## Status - AWAITING INSTALLED SMOKE

This is an unsigned local candidate, not an accepted release. Windows may show
SmartScreen; use **More info -> Run anyway** for this known local build. Do not
tag, push, publish, or treat it as the visual baseline until the installed
checks below are recorded.

## Installed Smoke

1. Open the canonical `2025 St. Joseph Mavericks - JV` season and its six real games.
2. Confirm linked film plays from its real drive.
3. Confirm managed film loads after restarting the app.
4. Chart a play, restart, and confirm both data and film persist.
5. Switch seasons and confirm counts, tags, and film identity remain correct.
6. Inspect all eight Our Program Reports tabs with real data.
7. Confirm every Reports title is fully visible, including the longest game name; no ellipsis is allowed.
8. In Defense > Current Game > Defensive Performance, confirm Game-by-game has one row and Opponent drive outcomes has seven fixed rows.
9. In Defense > Opponent Offense, confirm Top 6 formations shows all seven play-type count/share columns.
10. Confirm Attack direction shows Left, Middle, Right, Toward Strength, and Away from Strength without clipping.
11. Confirm Reports module titles use the approved sans face consistently.
12. Record each observation as PASS, REVISE, or REJECT.

| Area | Result | Notes |
|---|---|---|
| Home | | |
| Break Down | | |
| Study | | |
| Reports: Overview | | Full title visible; fixed approved composition. |
| Reports: Offense | | Full title visible; fixed approved composition. |
| Reports: Defense | | Four sections; scope-specific fixed schema; complete formation matrix; five direction rows. |
| Reports: Special Teams | | Full title visible; fixed approved composition. |
| Reports: Players | | Full title visible; fixed approved composition. |
| Reports: Self-Scout | | Full title visible; canonical predictability report. |
| Reports: Season | | Full title visible; fixed approved composition. |
| Reports: Matchup | | Full title visible; fixed approved composition. |
| Plan | | |
