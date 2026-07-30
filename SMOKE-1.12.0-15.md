# Smoke record - 1.12.0-15

Artifact: `GridIron IQ_1.12.0-15_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-15_x64_en-US.msi`
Accepted repair: `f8c5989`
Independent review: `524b00b` (accepted)
Versioned source: `32e05a6`
Date: 2026-07-30
Tester: Coach

## Status: READY FOR COACH SMOKE

This is a local unsigned milestone build, not a tagged or published release.
It replaces failed `1.12.0-14`. S4 remains unaccepted and S5 remains closed
until this installed smoke passes. Do not delete managed film copies based on
this build.

## Automated Evidence

- Installed Reports lifecycle repair independently accepted at `524b00b`.
- Canonical gate on accepted repair: 74 harnesses, 74 green, 0 skipped, 0 failed.
- Native Reports: 21/21, including Home -> linked-film auto-load -> Reports.
- Native Settings: 18/18; Analysis save passed five consecutive focused runs.
- Version consistency: `APP_VERSION`, Cargo.toml, Cargo.lock, and
  tauri.conf.json all report `1.12.0-15`.
- P0 exit 17/17; beta configuration 3/3; `cargo check` clean.
- `cargo tauri build --no-sign` completed NSIS and MSI bundles from `32e05a6`.
- Existing Vite chunk-size and macOS identifier warnings remain nonblocking.

## Artifact Hashes

- NSIS EXE: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-15_x64-setup.exe`
  - Size: 3,941,040 bytes
  - SHA-256: `57C8A9222AFE35E166F7B129ED93BEDFF585AC4EDAFBC12F6016DC2EC669E566`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-15_x64_en-US.msi`
  - Size: 5,488,640 bytes
  - SHA-256: `101465828EA7D723DDD366757C223380549D6BE79BC845130B60A872A9A6B16D`
- Application EXE SHA-256:
  `F3B023EDF9D0E0E033B646A196A56B6605B5E71000A11A31E5011757D893CC07`

## Coach Smoke

Use the NSIS `.exe` unless Windows requires the MSI. Install over the failed
`1.12.0-14`. Test Reports first and stop immediately on any Gate 1 failure.
Batch later findings; do not ship one-off releases while smoking.

### Gate 1 - Reports lifecycle (stop immediately on any failure)

| Check | Result | Notes |
|---|---|---|
| Launch; More reports `GridIron IQ v1.12.0-15 · Desktop` |  |  |
| From Home, open Reports: header, perspective selector, tabs, and content are visible |  |  |
| Open a real linked-film game, wait for film to load, then open Reports; Overview is populated |  |  |
| Open Offense, Defense, Special Teams, Players, Self-Scout, Season, and Matchup |  |  |
| Return Home, switch to another linked game, wait for film, then reopen Reports |  |  |
| Reports remains visible and populated after both linked-film auto-loads |  |  |
| A game with no eligible charted data shows neutral guidance, not a red failure |  |  |

**If any Gate 1 row fails, stop. Record FAIL and a screenshot. Do not continue.**

### Gate 2 - Linked film truth

| Check | Result | Notes |
|---|---|---|
| Settings -> Film shows the intended D: library root and exact per-game linked path |  |  |
| Open St Peter; first, middle, and last clips play |  |  |
| DevTools linked-film log resolves `D:\Football\Film\St Peter 41-0` with no managed-C: fallback |  |  |
| Open two more linked games; each reports Linked and plays without Repair |  |  |
| Restart; the same linked clips still play |  |  |
| Known partial game reports its missing count and does not fall back to C: |  |  |

### Gate 3 - S4 milestone essentials

| Check | Result | Notes |
|---|---|---|
| Existing teams, seasons, games, tags, notes, plans, and roster are present |  |  |
| Home is the sole game-entry surface and highlights the actual active game |  |  |
| Settings and More work before opening a game and after switching games |  |  |
| Edit one disposable play, Save & Next, restart; edit survives; Undo/Redo remains coherent |  |  |
| Study result opens exact matching film; Next remains within the cut-up |  |  |
| Save a Study finding to Plan; reorder/add notes; restart; Plan survives |  |  |
| Current-game and full-season HTML exports contain the correct scope |  |  |
| Recovery distinguishes current-game quick versions from whole-season restore points |  |  |
| Drawing tools draw, erase, clear, and do not interfere with playback |  |  |

## Carried Nonblocking Finding

- `F1`: the dismissed legacy Wizard still receives live events and runs a now-safe
  report side effect. It causes no current product harm and is scheduled for the
  next reviewed code batch or Wizard deletion in S7. It was intentionally not
  slipped into this accepted installer candidate.

## Result: PENDING

The coach alone changes this result to PASS or FAIL. PASS accepts S4 and opens
S5. FAIL returns a batched finding list; it does not authorize publication, data
migration, or deletion of any managed film.