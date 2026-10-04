# GridIron IQ 1.12.0-75 Beta Smoke

## Candidate

- Version commit: `0a50e7c` (`chore: bump to 1.12.0-75`)
- Reports title fix: `c9b91cb`
- Release-gate repair: `6eec197`
- Defense calls-by-formation module: `3283bcb`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-75_x64-setup.exe`
- NSIS bytes: `4,000,236`
- NSIS SHA-256: `140BD4B8FFDE07B1082BEE675CA4B61EF49DC4BF82A6FF8A542C3B490281E414`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-75_x64_en-US.msi`
- MSI bytes: `5,545,984`
- MSI SHA-256: `89749F18CDE540495DE4A0C0DE765F4C53434B7FC17AEDCBB781B2C5DDA1F4E5`

The complete release gate passed immediately before packaging: 109 harnesses
green, 0 skipped, 0 failed; real data 10/10; parity 2/2. Tauri completed the
release binary, NSIS, and MSI packages with `--no-sign`; no signed updater
artifact was requested or produced. The built executable's FileVersion and
ProductVersion both read `1.12.0-75`.

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
8. In Defense > Opponent Offense, confirm Calls by formation shows complete looks and their top two exact calls.
9. Record each observation as PASS, REVISE, or REJECT.

| Area | Result | Notes |
|---|---|---|
| Home | | |
| Break Down | | |
| Study | | |
| Reports: Overview | | Full title visible; fixed approved composition. |
| Reports: Offense | | Full title visible; fixed approved composition. |
| Reports: Defense | | Four sections; Calls by formation present; no duplicate Self-Scout. |
| Reports: Special Teams | | Full title visible; fixed approved composition. |
| Reports: Players | | Full title visible; fixed approved composition. |
| Reports: Self-Scout | | Full title visible; canonical predictability report. |
| Reports: Season | | Full title visible; fixed approved composition. |
| Reports: Matchup | | Full title visible; fixed approved composition. |
| Plan | | |
