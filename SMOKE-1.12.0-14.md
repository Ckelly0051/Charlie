# Smoke record - 1.12.0-14

Artifact: `GridIron IQ_1.12.0-14_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-14_x64_en-US.msi`
Reviewed application source: `e45742d`
Independent review: `ba33572` (accepted)
Built from: `ba33572` on `claude/football-film-analyzer-GRiCW`
Date: 2026-07-30
Tester: Coach

## Status: READY FOR COACH SMOKE

This is a local unsigned milestone build, not a tagged or published release.
S4 remains unaccepted and S5 remains closed until this installed smoke passes.
Do not delete managed film copies based on this build.

## Automated Evidence

- Reports repair accepted at `e911b97`; both review findings closed and accepted at `ba33572`.
- Canonical gate on reviewed bytes: 74 harnesses, 74 green, 0 skipped, 0 failed.
- Real-data fixture enters the actual shell Reports route: 13/13 games.
- Native Reports: 19/19; P0 composition: 17/17.
- Every stylesheet is reachable from Vite/Tauri: 16/16.
- All four version owners match `1.12.0-14`; mismatch and dead-CSS guards are mutation-proven.
- `cargo check` clean; `cargo tauri build --no-sign` completed NSIS and MSI bundles.
- Existing Vite chunk-size and macOS identifier warnings remain nonblocking.

## Artifact Hashes

- EXE SHA-256: `7D13E023C28D332A25C0582972C476FFA845D2B6B63F590C49708953E946DCC7`
- MSI SHA-256: `C505F6D43F6B77ADE81BAC886D6FDCFA72282C9A2EC9879E5CC6349D0184D9A2`
- Application EXE SHA-256: `C29A4DC5B62F10BEC30B9063EB4F5B7DC14DEAAF953BE58A2613A2F242852F3D`

## Coach Smoke

Use the NSIS `.exe` unless Windows requires the MSI. Install over the failed
`1.12.0-13`. Batch findings; do not request or ship one-off releases while
smoking.

### Gate 1 - Reports repair (stop immediately on any failure)

| Check | Result | Notes |
|---|---|---|
| Launch; More reports `GridIron IQ v1.12.0-14 · Desktop` |  |  |
| From Home, open Reports: header, perspective selector, tabs, and report content are visible |  |  |
| Open a real tagged game, then Reports: Overview is populated rather than blank |  |  |
| Open Offense, Defense, Special Teams, Players, Self-Scout, Season, and Matchup |  |  |
| Return Home, then reopen Reports; it remains visible and populated |  |  |
| DevTools shows no blocked `ipc.localhost` connection and no blocked bundled font |  |  |

**If any Gate 1 row fails, stop. Record FAIL and a screenshot. Do not continue.**

### Gate 2 - Linked film truth

| Check | Result | Notes |
|---|---|---|
| Settings -> Film shows the intended D: library root and exact per-game linked path |  |  |
| Open St Peter; film is Linked and the first, middle, and last clips play |  |  |
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

### Known nonblocking follow-up

- `S4h-1`: Reports failure and benign empty states share an inert style rule.
  Behavior/text are intact. Split neutral empty styling from danger failure styling
  in the next batched pass; do not reopen this reviewed installer for that P2.

## Result: PENDING

The coach alone changes this result to PASS or FAIL. PASS accepts S4 and opens
S5. FAIL returns a batched finding list; it does not authorize a published
release or deletion of any managed film.