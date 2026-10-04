# Smoke candidate 1.12.0-86 - Windows x64, unsigned

## Artifacts

- Source commit packaged: `b08d89c` (bump on top of `dbd3d8d`)
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-86_x64-setup.exe`
- NSIS bytes: `4,007,914`
- NSIS SHA-256: `3287AB86956B28340830389A0F0906DCE0CC061BECC77E180F93D1221D81ACDA`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-86_x64_en-US.msi`
- MSI bytes: `5,554,176`
- MSI SHA-256: `67766653EC92FE7769D6E563A39E888A288A80437D50B0D0EF9B9E76C092CC14`

`cargo tauri build --no-sign`, exit 0. The exe reports FileVersion and
ProductVersion `1.12.0-86`; the packaged `dist/assets/index-DXfsUq2R.js` carries
the same string beside its `ffa_sql_catalog` seeding. Updater signing was
intentionally skipped.

## What This Build Carries

Everything since `1.12.0-85`, none of which has been in an installed build.

**Film health is season-scoped (B1-1).** `filmHealth(game, seasonId)` carries the
owning season to `listFilmFiles(gameId, seasonId)`, which builds
`seasons/{seasonId}/films/{gameId}` from that id rather than whichever season the
backend points at. Two seasons reusing a game id can no longer answer for each
other. The library label is always an explicit count, never a stuck
`Checking film…`, and `Film needs attention` is now reserved for film that cannot
be COUNTED (unreachable folder, failed listing) rather than any partial season.

**In-flight film operations are season-scoped too (B1-4).** A save running in one
season no longer makes another season reusing that game id report
`Checking film…` over its own settled count.

**Drives belong to possessions (B1-2).** Our Drive 1 and the opponent's Drive 1
are separate groups. The play strip and theater read `Our Drive 1` /
`Opponent Drive 1` on a program season and `Offense` / `Defense` on a scout
season; Study's Drive dimension uses the same owner. A special-teams snap joins
its surrounding drive rather than splitting it, and legacy snaps with no charted
unit keep the plain `Drive N`.

**Extra points are authored only under Try / Defending a Try (B1-3).** The unit
is `Field Goal`; its `Attempt` selector is gone and no route can store an extra
point through it. Historical `unit:'fieldGoal', attemptType:'extraPoint'` records
still read and still score their point.

**FILM-01: linked clip sets are compared both ways.** A clip the game records and
the folder lacks stays `missing`; a folder video the game has no record of - alone
or beside a missing one - is `mismatch` / `Film does not match folder` with an
`extra` count. Managed film keeps its one-way rule. The durable clip index no
longer shrinks on an unloaded save, an intentional in-app deletion now removes the
identity durably (including with film unloaded, and including an uncharted clip,
which previously reached no save at all), a shared clip survives one of its plays,
and Undo restores the live clip AND the play it restored - not the adjacent one.
No coach-owned file is ever deleted, renamed or relinked.

## Verification

- Full canonical gate on `dbd3d8d`: **117 harnesses, 117 green, 0 skipped,
  0 failed**.
- `e2e-p0-exit` 19/0 after the bump - all four version owners match.
- Focused: `e2e-film-clip-set` 45/0, `e2e-data-correctness-batch1` 76/0,
  `e2e-film-health-realdata` 14/0 (read-only against the real 2025 JV sources),
  `e2e-film-room` 174/0, `e2e-delete-undo-film` 15/0, `e2e-linked-film` 40/0.
- The gate was not rerun for the bump, which changes no runtime code.

## What Chromium Could NOT Certify - the point of this smoke

- Tauri's own `fs.readDir` / `exists` behind the managed and linked film lookups.
  Every harness used a stub backend; the real filesystem is only real here.
- The asset protocol, film codecs and media reload from a recreated blob URL -
  which is what an Undo of a loaded-clip deletion depends on.
- A folder edited OUTSIDE the app while it is running.
- App lifecycle: whether a removal that was only scheduled survives a real close.

## Smoke Sequence

1. **2025 JV film health.** Open the season library. OL Lakes should read as not
   fully linked and the season should print `5 of 6 games linked` - an explicit
   count, never `Checking film…` and never `Film needs attention`.
2. **Season scoping.** Check a CLOSED season's count in the library, then open it.
   The two must agree.
3. **Folder-only mismatch.** Copy one extra video into a linked game's folder
   (your own file, your own copy) and recheck that game. It should read
   `Film does not match folder`. Remove the copy and confirm it returns to linked.
4. **Delete a play with film loaded.** Its clip leaves the playlist. Press Undo:
   the clip comes back, it plays, and **you land back on that play**, not the next
   one.
5. **Delete a play with film NOT loaded.** Reopen the game and confirm the clip
   record is gone and nothing else was pruned.
6. **Remove an uncharted clip, then close the app immediately.** Reopen: it must
   stay gone. This is the case that previously came back.
7. **Shared clip.** If two plays reference one clip, delete one - the clip stays.
8. **Drives.** In Break Down, confirm our drives and opponent drives group
   separately and are labeled so.
9. **Field Goal.** Chart a field goal: no Extra Point option. Chart an opponent
   extra point under `Defending a Try` and confirm it scores for them, not us.
10. **Data intact.** Games, film links, tags, rosters and reports unchanged.

**Your source film is never deleted by any of this.** If step 3 or 6 behaves
unexpectedly, stop and report rather than re-linking.

## Status

**FILM-01 installed smoke passed and is accepted for beta use (2026-09-15).**
The coach verified linked-folder equality/mismatch behavior, durable uncharted
clip removal across close/reopen, and loaded delete/Undo with the restored play,
clip, and selection aligned. The intermittent rapid-scrubbing `Film missing`
report could not be reproduced and is tabled rather than closed.

Unsigned local build; not tagged, pushed or published. Home production remains
formally `REJECTED`. The three deferred visual findings from the 1.12.0-85 smoke
(Breakdown viewport overflow and anonymous scrollbar arrows, context-selector
contrast, Home rail truncation) are NOT addressed in this build. Windows
SmartScreen will warn on launch because the build is unsigned.
