# Smoke record - 1.12.0-16

Artifact: `GridIron IQ_1.12.0-16_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-16_x64_en-US.msi`
Accepted S5c review: `9f8f065`
Versioned source: `06c3576`
Date: 2026-08-02
Tester: Coach

## Status: PENDING - S5d BLOCKED

This is the required local unsigned pre-S5d milestone build. It is not tagged,
published, or advertised as a release. S5a-c remain internal; this installer
proves that the accepted S5c baseline, real data, linked film, and desktop-only
services still work before the isolated S5d ownership flip.

This smoke does **not** accept the native Breakdown composition. The native
theater, Film Room, and tag form become coach-facing only in S5d and receive a
second installed smoke immediately after that reviewed flip. Do not delete any
managed C: film copy based on this candidate.

## Automated Evidence

- S5c independently accepted at `9f8f065`; canonical gate 78/78 green, 0 skipped.
- Native tagging 22/22, including the persisted 20-play multi-select journey.
- Version consistency: `APP_VERSION`, Cargo.toml, Cargo.lock, and
  tauri.conf.json all report `1.12.0-16`.
- P0 exit 17/17; beta configuration 3/3; `cargo check` clean.
- `cargo tauri build --no-sign` completed NSIS and MSI bundles from `06c3576`.
- Existing Vite chunk-size and macOS identifier warnings remain nonblocking.

## Artifact Hashes

- NSIS EXE: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-16_x64-setup.exe`
  - Size: 3,958,855 bytes
  - SHA-256: `3E66DCF5FF7D25D8F38DB74FA3F4C75838A24131A57ABD3ABFAAB57D5D21AEBC`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-16_x64_en-US.msi`
  - Size: 5,505,024 bytes
  - SHA-256: `2756BDD97D6F4E73298382E610CD81DB3E82DA206D2013536D07AE2CC106117A`
- Application EXE SHA-256:
  `35E34B8ED50C98B08419953B4F29362BFE3558E0FD6CF83ACDA3374E21600AF4`

## Coach Smoke

Install with the NSIS `.exe` over `1.12.0-15`. Stop at the first failure and
record a screenshot. Batch minor visual findings; do not issue one-off releases.

### Gate 1 - Launch, data, and route baseline

| Check | Result | Notes |
|---|---|---|
| Launch; More reports `GridIron IQ v1.12.0-16 · Desktop` | PENDING | |
| Existing teams, seasons, games, tags, notes, plans, roster, and linked-film settings are present | PENDING | |
| Home opens and highlights the actual active game | PENDING | |
| Reports opens from Home and from a loaded game; Overview is populated | PENDING | |
| Study and Plan open, retain their data, and return to Home normally | PENDING | |

**If any Gate 1 row fails, stop. Do not continue to S5d.**

### Gate 2 - Desktop and linked-film truth

| Check | Result | Notes |
|---|---|---|
| Settings -> Film shows the intended D: library root and exact linked game path | PENDING | |
| Open one linked game; first, middle, and last clips play | PENDING | |
| Restart; the same linked clips load without Repair or managed-C: fallback | PENDING | |
| A known partial game reports its missing count honestly | PENDING | |
| More -> Open data folder opens the GridIron IQ data location | PENDING | |
| More -> Check for updates returns a result without breaking the route | PENDING | |

### Gate 3 - Current Breakdown safety baseline

Use a disposable smoke game for edits. This confirms S5c did not regress the
currently accepted route; it is not the S5d native-composition review.

| Check | Result | Notes |
|---|---|---|
| Break Down opens with film, play strip, Film Room, and complete tag controls | PENDING | |
| Existing real-game tags and notes display unchanged | PENDING | |
| On a disposable play, select two Formations and two Play Types; Save & Next preserves all four | PENDING | |
| Restart; the disposable edit survives and the other game remains unchanged | PENDING | |
| Undo/Redo, drawing, and exact Study-to-film navigation still work | PENDING | |
| Structured penalty and Special Teams editors open without clearing existing data | PENDING | |

## Result: PENDING

A PASS unlocks the isolated S5d ownership-flip commit. A failure keeps S5d
closed; diagnose against accepted S5c before changing the coach-facing route.
