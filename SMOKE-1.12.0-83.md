# Smoke candidate 1.12.0-83 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `9ab20d5`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-83_x64-setup.exe`
- NSIS bytes: `4,004,150`
- NSIS SHA-256: `ACAC698341567ECEA83673D40E62CFE227B8D10E9755214ECB5AFD5FF83A18DA`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-83_x64_en-US.msi`
- MSI bytes: `5,550,080`
- MSI SHA-256: `9ED425073127AB6120410473EE525F76F1B0B745E73792E8C17408D7C44AA260`

Tauri rebuilt the Vite frontend and produced both unsigned Windows packages.
Updater signing was intentionally skipped with `--no-sign`.

## Correction From 1.12.0-82

The `1.12.0-82` Season Library visual was rejected after inspection. This build
returns to the approved Home composition while preserving the consolidated
single route and single Program/Opponent Scout switch:

- A full-width aggregate band establishes program, season, game, play, and
  storage context.
- Dense operational season rows replace the sparse generic-card presentation.
- The right panel provides one latest-season resume action and aggregate film
  health without duplicating Film & Storage or Manage Program from the rail.
- Unavailable film is neutral; green is reserved for genuinely healthy status.
- The visual fixture contains three seasons and now captures the actual
  1920x1080 first-impression viewport in addition to the four prior widths.

## Verification

- Vite production build: green.
- `e2e-home-review-repair`: 28/0.
- `e2e-home-deferred-repair`: 100/0.
- `e2e-p0-exit`: 19/0.
- Visual capture gate: 60 distinct captures across 1920x1080, 1440x900,
  1280x720, 768x1024, and 390x844; no page-level horizontal overflow.
- The full release gate was not rerun for this Home-only correction.

## Status

This is an unsigned local visual-smoke candidate for coach testing. It is not
accepted, tagged, pushed, or published state. The open season-scoped film-health
defect remains recorded in `docs/OPEN-DEFECTS.md`.
