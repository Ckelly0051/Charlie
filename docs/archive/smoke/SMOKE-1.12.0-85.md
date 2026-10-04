# Smoke candidate 1.12.0-85 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `130962a`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-85_x64-setup.exe`
- NSIS bytes: `4,008,882`
- NSIS SHA-256: `A341311CC269663EFAA55E89CE6D3ED02D5FED5D843D7A3EEBD0BED306ED5F8A`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-85_x64_en-US.msi`
- MSI bytes: `5,554,176`
- MSI SHA-256: `0084B55544EA82FED7314466490B1F2E378D240FC1643C98A7962995AD7E4086`

Tauri rebuilt the Vite frontend and produced both unsigned Windows packages.
Updater signing was intentionally skipped with `--no-sign`. The built exe reports
FileVersion and ProductVersion `1.12.0-85`.

## What This Build Carries

The opponent-scout ownership model and atomic Home navigation, reviewed and
approved over `2c90b66..c2e088a`. `1.12.0-84` predates all of it.

**A program season is the parent Home context.** Every opponent scout belongs to
exactly one program season through a durable `programSeasonId` stored on its
season body and library row. `WorkspaceContext` is the sole owner of that parent
and of the workspace mode.

**Our Program and Opponent Scout are two views of one parent.** The toggle is one
state change and one render: entering Opponent Scout keeps the parent season OPEN
and shows its own scoped opponent library. It never closes the season, never opens
the library, and never auto-opens a scout. Returning opens a season only when a
scout is open, and then by that scout's exact parent id. Restoring "the most
recently opened season of this kind" from `lastOpened` is retired - recency is not
ownership, and that redirect was the Home/library bounce.

**Scouts with no resolvable parent are surfaced, never attached.** First-launch
scouts, ambiguous legacy records, and scouts whose stored parent no longer exists
appear in Home's `Needs a program season` section with an explicit season
selector. Assignment writes only after the coach confirms, through the canonical
store boundary; a failed write leaves the scout unassigned and says so. Legacy
inference is read-only and only when exactly one program season matches team,
year and level.

**The sample season can never own a scout,** and a program season that owns scouts
cannot be deleted - the command blocks with the scouts named and cascades nothing.

**Also in this range:** a rail row now asks the store whether its season is
already open rather than trusting a cached row flag (rows could appear dead), and
managed-film deletion is scoped to the deleted game's own season id.

## Verification

- Full canonical gate on the approved checkpoint: **114 harnesses, 114 green,
  0 skipped, 0 failed**.
- `e2e-scout-ownership` 91/0, `e2e-home-deferred-repair` 105/0,
  `e2e-home-review-repair` 37/0, `e2e-v2b-control-center` 14/0,
  `e2e-p0-exit` 19/0 after the bump.
- Captures: `artifacts/scout-workspace/` (40 images, eight states at 1920/1440/
  1280/768/390).
- The gate was not rerun for the version bump, which changes no runtime code;
  `e2e-p0-exit` pins the four version owners and was re-run on its own.
- Read-only live audit: catalog unchanged by this work.

## Smoke Sequence

1. **Roster stays season-specific.** Open 2025 JV - 19 players. Switch to 2026 JV
   and 2026 Varsity and confirm each shows its own roster, across a restart.
2. **One transition.** From an open program season click Opponent Scout. Watch for
   any flash of Home, the season library, or another season - there should be
   none, and the parent season stays named on screen.
3. **Scoped list.** The opponent list shows only that season's scouts. Switch to a
   different program season and confirm its Opponent Scout view shows only its own.
4. **Return.** From Opponent Scout click Our Program - it should land directly on
   that same parent season.
5. **Open a scout, then return.** Open a scout from the list, then click Our
   Program: it must return to that scout's own parent season.
6. **Assignment.** If any scout appears under `Needs a program season`, choose a
   season and Assign. With two listed, assign the first and confirm the second
   row's selector is still blank and assigning it needs its own choice.
7. **Sample season.** With the sample season open, try to create an opponent
   scout - it should refuse and tell you to open a program season.
8. **Data intact.** Games, film links, tags and rosters unchanged everywhere.

## Status

Coach-smoked on 2026-09-14 and **APPROVED FOR NOW** for continued beta use. The
three deferred visual findings remain open: Breakdown viewport overflow and
anonymous scrollbar arrows, insufficient context-selector contrast, and early
season-rail truncation. This is not tagged, pushed or published state, and Home
remains formally `REJECTED` in the design registry.

This package predates Repair Batch 1 (`7276d45..7862aa6`). Its Home/game film
labels do not validate the repaired season-scoped health logic. In particular,
the installed OL Lakes game may say `fully linked` even though the app records
`IMG_6690` and the linked folder does not contain it. No surviving play references
that identity. `FILM-01` now defines the unresolved rule: app and folder clip sets
must match exactly; a difference in either direction is an error. The Field
Goal/XP ownership repair is also absent from this build. Custom play Add and the
missing built-in `Option` remain open.
