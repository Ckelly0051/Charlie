# Smoke candidate 1.12.0-82 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `7f22573`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-82_x64-setup.exe`
- NSIS bytes: `4,004,903`
- NSIS SHA-256: `423639775CC05C93C7AAF926428397AAF8D93615E6865E8A2AF53742F627F444`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-82_x64_en-US.msi`
- MSI bytes: `5,550,080`
- MSI SHA-256: `3D39D44FB848CB3E05CDC46844CB10F7B195340353097600997AE86E405ECEF5`

Tauri rebuilt the Vite frontend and produced both unsigned Windows packages.
Updater signing was intentionally skipped with `--no-sign`.

## What Changed

- Season Library stays inside the single Home route; no full-page Team Hub
  renderer or second Program/Opponent Scout switch is mounted.
- The no-open-season state uses Home-owned full-width season rows instead of
  generic Team Hub rows forced into a sparse card grid.
- Each season exposes its full identity, game and play totals, explicit film
  state, a primary open action, and a restrained destructive action.
- A program summary groups season/game/play totals and direct film, program,
  and recovery operations without creating another navigation path.
- At narrower desktop widths the summary stacks below the season list so the
  persistent rail cannot force row actions or labels into another column.

## Verification

- Vite production build: green.
- `e2e-home-review-repair`: 28/0.
- `e2e-home-deferred-repair`: 100/0.
- `e2e-p0-exit`: 19/0.
- Visual capture gate: 48 distinct captures across 1440x900, 1280x720,
  768x1024, and 390x844; no page-level horizontal overflow.
- The full release gate was not rerun for this Home-only visual candidate.

## Status

This is an unsigned local visual-smoke candidate for coach testing. It is not
accepted, tagged, pushed, or published state. The open season-scoped film-health
defect remains recorded in `docs/OPEN-DEFECTS.md` and is not represented as fixed
by this presentation repair.
