# Smoke candidate 1.12.0-84 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `4f5ef9c`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-84_x64-setup.exe`
- NSIS bytes: `4,004,107`
- NSIS SHA-256: `1320678BAE1221F537A2B41A8BE1D5CE913395B2EEC63309781EB837FEFBA2E0`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-84_x64_en-US.msi`
- MSI bytes: `5,550,080`
- MSI SHA-256: `2F7C713CBD9B2C1121D8DEF8F072D3D0A37327C4F49F61FA379582FAA841FC5B`

Tauri rebuilt the Vite frontend and produced both unsigned Windows packages.
Updater signing was intentionally skipped with `--no-sign`. The built exe
reports FileVersion and ProductVersion `1.12.0-84`.

## What This Build Carries

The first packaged build of the roster-ownership and Add Game work. `1.12.0-83`
predates all of it.

**One roster owner.** A roster belongs to one season; that season's games share
it and store none of their own. Promotion from a legacy `games[].roster` happens
at one boundary, `SeasonStore.adoptLegacyRoster()`, which validates every copy in
the season rather than taking the first, removes all of them once settled, and
persists the roster, the `rosterOwnership: 'season'` marker and the removal
before the season is exposed. A settled season never converts again.

**Conflicts and failed migration writes abort.** Disagreeing legacy rosters, or a
migration write that does not land, refuse the operation: the season does not
open, import returns failure, restore aborts, the season already open stays open
with its live roster and loaded game, and the source bytes are untouched.
Conflict state is never editable.

**Add Game asks for no analytics perspective.** The `Film source` selector is
deleted, not renamed. Program versus Opponent Scout derives from the owning
season. The form is rebuilt on the neutral and gold system.

**Navigation containment.** A refused open is not "leaving the season": the
outgoing season keeps its pending deleted game, its managed film, its purge timer
and a working Undo.

**Season-scoped managed-film deletion.** `deleteFilm(gameId, seasonId)` receives
the deleted game's stored season id and resolves the filesystem path from it,
never from whichever season the backend currently points at. Two seasons reusing
one game id can no longer make a switch delete the wrong season's film.

The coach-authorized data normalization behind this work, with its identity proof
and backup hashes, is `docs/ROSTER-NORMALIZATION-2026-09-13.md`.

## Verification

- Full canonical gate on `501e263`: **113 harnesses, 113 green, 0 skipped,
  0 failed**.
- `e2e-roster-ownership`: 71/0. `e2e-delete-undo-film`: 15/0.
  `e2e-game-form-context`: 20/0. `e2e-game-form-visual`: 242/0.
  `e2e-film-persist`: 3/0. `e2e-p0-exit`: 19/0 after the bump.
- Read-only live audit: catalog unchanged — `2026-varsity-demo` (the 2025 JV
  season) 19 players / 6 games / 0 game-level copies; `sjm-jv-2026` and
  `sjm-varsity-2026` empty. No Program game marked scout in any store.
- `library.db` SHA-256 `e349a248701942a8b87c097cecf02b3b52a88fa082ce899d5a3e307d3db42be5`
  and canonical mirror `2025-st-joseph-mavericks-jv/season.json`
  `0e0fa83c174f545116d6a2f6f89e193deec69bc5517a1ed2e585406f808badd4` — both
  unchanged by this work.
- The gate was not rerun for the version bump; `e2e-p0-exit` pins the four
  version owners and was re-run on its own.

## Smoke Sequence

1. **Rosters are season-scoped.** Open 2025 JV — 19 players. Switch to 2026 JV
   and 2026 Varsity — both empty, and they stay empty across a switch and a
   restart. Add a player to one and confirm it appears in no other season.
2. **Add Game.** Open Add Game in a Program season. There must be no `Film
   source` or perspective control, and the saved game must appear in Reports >
   Season totals. Repeat in an Opponent Scout season.
3. **Game delete Undo.** Delete a game with managed film and Undo inside the
   window — the game returns with its film playable.
4. **Navigation.** Home, the Program/Opponent Scout switch, the season picker and
   Season Library. Reports and Break Down render with real film.

Conflicted legacy rosters and reused game ids across seasons are not reachable in
this catalog, so items 5-7 of the written brief cannot be exercised by hand here;
they are covered by harness assertions and the unit-level desktop path check.

## Status

Unsigned local smoke candidate for coach testing. Not accepted, tagged, pushed or
published state. Home production remains `REJECTED` pending coach review, and the
open items in `docs/OPEN-DEFECTS.md` — the blue shared focus ring, the
season-scoped film-health mismatch, the 449-vs-440 canonical fixture drift — are
unchanged by this build.
