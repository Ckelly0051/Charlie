# SMOKE 1.12.0-110 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `678da80c`: **149/149 green, 0 skipped, 0 failed**, 2026-10-05.
  The first run at `191384a0` was 148/149 (`e2e-legacy-inventory`: a new
  `window.app` reference in the failed-delete rollback, removed in `678da80c`).
- Version-only bump `5c058b80` (all four owners `1.12.0-110`); `e2e-p0-exit` green.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-110_x64-setup.exe`,
  4,037,382 bytes, SHA-256
  `5262B8F222512617E33349C6B6EAEC9E641B52351FFEC5E2C007FA6285ED7E11`.
  Product and file version `1.12.0-110`. Built from a clean tree at `5c058b80`
  with `cargo tauri build --bundles nsis` and `createUpdaterArtifacts:false`.
  Nothing pushed, tagged or published. Supersedes `1.12.0-109`, which was
  never smoked.
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
- **Saves:** delete a game, then Undo; restore a season restore point; link a
  game folder; add a play call. Each completes normally.
- **Run/Pass:** Week 6 vs Holy Family play 67 counts as the Run/Pass you chart
  on it. Opponent scout run % by down and distance reads from charted run/pass
  plays. Play-action rate stays at or under 100%. A table row with no
  Run/Pass charted shows a dash in its Run/Pass cell.

## Findings

1. **Home > Get started says "Create your first season" with 3 seasons in the
   library** (Claude's read-only check, 2026-10-05). Program St. Joseph
   Mavericks, Get started pane selected: "Start the football year here /
   Create your first season". Season library shows 3 seasons, 17 games,
   1,088 plays.

Claude's read-only check, same date, also passed: 2025 JV opened (6 games, all
film linked); Week 6 Defense reads 35 = 27 rush + 8 pass with "21 charted /
19 with Run/Pass charted"; linked film played in Break Down; Restore points
list 14 saved; More menu reads v1.12.0-110. Nothing was written.
