# SMOKE 1.12.0-102 - Windows x64 Beta (unsigned)

**Source:** `f6e1490` (the four-owner version bump on top of `b452635`), built
from the clean main checkout. **Gate:** full gate at `b452635` 131/131, zero
skipped, zero failed (`e2e-unit-ownership` 28/28 included); `e2e-p0-exit`
19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-102_x64-setup.exe`
(4,027,237 bytes). SHA-256:
`3CCA8C7CDD399359E1770FCB62EB4145AF45A80BE528CE4D35409B59A9F0DF48`.
The built executable reports file and product version `1.12.0-102`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

**This is the re-smoke of `1.12.0-99`**, which stopped at S99-2 to protect the
season's data. It carries the repair of both findings (`48cbf5d`), the Codex
review of that repair (`125c6f5`), and the 2026-09-24 code review's CR-1..3
(`d5b5edd`: the `C` and digit shortcuts, Clear Tags and Save & Next act on the
unit on screen, never the last unit chosen), on top of everything `1.12.0-99`
carried (see `SMOKE-1.12.0-99.md`). It supersedes `1.12.0-100` and
`1.12.0-101`, neither smoked.

## Coach smoke checklist

**S99 repairs (check first)**
1. Film Room, All plays and each unit filter: on a defensive row, Formation, QB Align and
   Personnel show the offense it faced and open their editor; on an offensive
   row, Front and Cover show the defense it faced and edit. Only Special Teams
   rows leave those cells blank.
2. The **Unit** column is first in the table on every column set. Click a
   cell, pick Offense, Defense or Special Teams: the row changes, and Chart
   shows the same unit for that play at once. Change it back in Chart: the Unit
   cell follows. Last change wins either way; nothing reverts.
3. Plays that showed one unit in Chart and another in Film Room now agree in
   both. Choosing the unit Chart already shows now saves it.
4. On a play whose unit was never set (legacy plays show Offense): `C` moves
   it to Defense, not Special Teams, and keeps its formation; digits write no
   Special Teams type unless the play is Special Teams; Clear Tags keeps it
   Offense; Save & Next carries Offense to the next play, never Special Teams.
5. The table's Offense / Defense / Special Teams buttons sit under a
   **Filter plays** label; they only choose which plays show and never change a
   play.

**Carried from `1.12.0-99` (not yet run)**
6. Settings and version history (use the profile that showed `Could not save
   that choice`): add a Front, a Formation and a Coverage from Edit library;
   each appears at once and survives a restart. Recovery lists the game's
   earlier save points; a new one appears; a restore works.
7. View choices survive a restart: Film Room layout, Film focus, the folded
   Play Call / Play Type lists.
8. Chart view works as before; Film Room `Below` / `Beside` / `Reset` and the
   divider work and persist; the play card scrolls and lists the whole play.
9. Shown-plays summary: one unit filtered matches Reports (Defense yards per
   play equals Reports > Defense for the same game); the Yds header reads
   `N.N / play` for one unit and is blank for All plays.
10. Columns per unit: a change under Offense stays with Offense; Defense keeps
   its own set.
11. Film is never reloaded, blanked or covered by switching views, docking,
    dragging the divider or Film focus; fullscreen and playback work.
12. Reports: Matchup's section reads `Coverages`; Offense page 3 is headed
    `Structure and execution`.



Installed smoke pending. Not tagged, pushed or published.

**Coach decision, 2026-09-24 (carried from `1.12.0-99`):** when this smoke
passes, commit the result docs and push the branch. No tag unless the coach
asks for a release.
