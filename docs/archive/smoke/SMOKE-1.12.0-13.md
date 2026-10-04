# Smoke record - 1.12.0-13

Artifact: `GridIron IQ_1.12.0-13_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-13_x64_en-US.msi`
Reviewed application source: `ed551a8`
Independent review: `acdcf2b` (code accepted)
Built from: `claude/football-film-analyzer-GRiCW`
Date: 2026-07-29
Tester: Coach

## Status: FAILED - REPORTS ROUTE BLANK

This is a local unsigned milestone build, not a tagged or published release.
The installed smoke failed immediately: Reports rendered as a blank route. S4 remains unaccepted and S5 remains closed. This artifact must not be reused.
Do not delete managed film copies based on this build.

## Automated Evidence

- Independent review: final S4 code accepted at `acdcf2b`.
- Canonical gate on reviewed bytes: 74 harnesses, 74 green, 0 skipped, 0 failed.
- Real-data fixture: 13/13.
- Desktop version: `1.12.0-13` in Cargo.toml, Cargo.lock, and tauri.conf.json.
- Frontend: Vite production build ran through Tauri's `beforeBuildCommand`.
- Product/file version: `1.12.0-13`.
- Packaging: `cargo tauri build --no-sign`; EXE and MSI completed.
- Existing Vite chunk-size warning remains; it did not fail the build.

## Artifact Hashes

- EXE SHA-256:
  `D1C83B5AE689649E84F146C73738544D9B81FF516DA9B66B0FE30C7BB181F1DC`
- MSI SHA-256:
  `3655D6449630D0F14B230C46EB19E88A98EA229A74F8263A78BFC14E406F8E6E`
- Application EXE SHA-256:
  `17841EEAAEF4E36656A8A3AD2A89C3BCD534F31B3C748842C853981702412ADE`

## Blocking Failure

- `Home -> Reports` opened an empty route in the installed WebView2 app.
- Opening a real linked game first did not repair Reports; the console showed only the successful D: linked-film auto-load and no report exception.
- Desktop CSP also blocked Tauri `ipc:` / `http://ipc.localhost` and bundled data-font loading.
- Root test gap: `e2e-realdata.mjs` called `StatsEngine.showDashboard()` directly, bypassing the shell Reports route used by the coach.
- Repair is not part of this artifact. A replacement installer requires independent review and a fresh installed smoke.

## Coach Smoke

Use the NSIS `.exe` unless Windows requires the MSI. Batch findings in this
record; do not request or ship one-off releases while smoking.

### Install and lifecycle

| Check | Result | Notes |
|---|---|---|
| Install over the prior beta; launch succeeds and More shows `1.12.0-13` |  |  |
| Existing teams, seasons, games, tags, notes, plans, and roster are present |  |  |
| Close and reopen twice; last team/season/game context is correct |  |  |
| Home is the sole game-entry surface and highlights the actual active game |  |  |
| Settings and More remain available before opening a game and after switching games |  |  |

### Linked film and playback

| Check | Result | Notes |
|---|---|---|
| Settings -> Film shows the intended D: library root and exact per-game linked path |  |  |
| Open at least three linked games; each reports Linked, never Managed |  |  |
| Play first, middle, and last clips in one linked multi-clip game |  |  |
| Restart the app; the same linked clips still play without Repair |  |  |
| A known partial game reports the exact missing count and does not fall back to C: |  |  |
| Play switching, autoplay on/off, speed, seeking, and multi-angle controls behave |  |  |
| Drawing tools draw, erase, clear, and do not interfere with playback |  |  |

### Charting and persistence

| Check | Result | Notes |
|---|---|---|
| Edit one disposable play, Save & Next, restart; the edit survives |  |  |
| Undo then Redo restores that edit as one coherent operation |  |  |
| Switch among offense, defense, and special teams; correct fields remain available |  |  |
| Formation/QB alignment/backfield and coverage/family stay separated after reopen |  |  |
| Structured penalty and special-teams fields save and reopen accurately |  |  |
| Other games retain their play counts and tags after the edited game is saved |  |  |

### Study, Plan, Reports, and Recovery

| Check | Result | Notes |
|---|---|---|
| Study result opens the exact matching film sequence; Next stays within the cut-up |  |  |
| Save a Study finding to Plan; reorder/add notes; restart; Plan survives |  |  |
| Current-game HTML and full-season HTML exports contain the correct scope |  |  |
| Create a current-game quick version, make a disposable edit, restore it, and verify scope |  |  |
| Create a whole-season restore point; Recovery clearly labels it as whole-season |  |  |
| Cancel is initially focused for destructive whole-season restore |  |  |
| Open data folder opens the Documents/GridIron IQ mirror location |  |  |
| Check for updates runs without breaking navigation or current game state |  |  |

### S4 review observations

| Check | Result | Notes |
|---|---|---|
| Mobile/narrow layout: toast does not cover or block the More/Shortcuts launcher |  |  |
| Analysis clearly exposes a usable local CV-server opt-in, or record this as a known P2 |  |  |
| Analysis preferences save and remain truthful after restart |  |  |

## Result: FAIL

Coach recorded FAIL on 2026-07-29. S4 is not accepted; S5 remains closed. No published release or managed-film deletion is authorized.