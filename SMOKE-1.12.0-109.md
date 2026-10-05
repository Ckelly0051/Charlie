# SMOKE 1.12.0-109 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `29cb2768`: **147/147 green, 0 skipped, 0 failed**, 2026-10-04.
- Version-only bump `9a6bc05f` (all four owners `1.12.0-109`); `e2e-p0-exit` green.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-109_x64-setup.exe`,
  4,040,963 bytes, SHA-256
  `D7907EF2C305795D2CB806F18493A6D98AAB72CAC36F9112D22268D011890845`.
  Product and file version `1.12.0-109`. Built from a clean tree at `9a6bc05f`
  with `cargo tauri build --bundles nsis` and `createUpdaterArtifacts:false`.
  Nothing pushed, tagged or published.
- Packaged-asset inspection (non-builder, `docs/RELEASE.md`): pending.

## Result

Pending.

## What to check

Standard smoke (`docs/RELEASE.md`), plus the items since 108:

- **Plan export** opens the native save dialog and the file lands.
- **Multi-clip cut-up** plays in play order.
- **Passing totals** on a game with a screen completed for a loss: the play
  counts as an attempt and a completion.
- **Special Teams players:**
  - Kick Return and Punt Return / Block offer our roster only for our
    Returner. The kicker number is typed and labeled Opponent (Other team in a
    scout season).
  - Kicking units offer our roster only for our Kicker.
  - Rows read Kicker then Returner.
  - Field Goal Block has one Blocker input.
  - The active role holds after edits.
- **Fake try** adds nothing to the Players board; a fake punt rush still counts.
- **Startup:** the library opens normally with no import, and Settings >
  Recovery still lists mirror snapshots.

## Findings

None logged yet.
