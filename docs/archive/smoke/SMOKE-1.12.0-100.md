# SMOKE 1.12.0-100 - Windows x64 Beta (unsigned)

**Source:** `64994be` (the four-owner version bump on top of `4dd9681`), built
from the clean main checkout. **Gate:** full gate at `48cbf5d` 131/131, zero
skipped, zero failed (the new `e2e-unit-ownership` 19/19 included); only docs
(`4dd9681`) and the bump after it; `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-100_x64-setup.exe`
(4,031,722 bytes). SHA-256:
`CFA96D417D9E590A63EF1FFFF5988B532092473A5FB44D04236FBF0F3221DEC2`.
The built executable reports file and product version `1.12.0-100`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

**This is the re-smoke of `1.12.0-99`.** That smoke stopped at S99-2 to protect
the season's data. This build adds the repair of both findings (`48cbf5d`) to
everything `1.12.0-99` carried: the settings-storage fix, the Film Room work,
the Break Down rebuild and the S98 labels (see `SMOKE-1.12.0-99.md`).

## Coach smoke checklist

**S99 repairs (check first)**
1. Film Room, All plays: on a defensive row, Formation, QB Align and
   Personnel show the offense it faced and open their editor; on an offensive
   row, Front and Cover show the defense it faced and edit. Only Special Teams
   rows leave those cells blank.
2. The **Unit** column is first in the table on every column set. Click a
   cell, pick Offense, Defense or Special Teams: the row changes, and Chart
   shows the same unit for that play at once. Change it back in Chart: the Unit
   cell follows. Last change wins either way; nothing reverts.
3. Plays that showed one unit in Chart and another in Film Room now agree in
   both. Choosing the unit Chart already shows now saves it.
4. The table's Offense / Defense / Special Teams buttons sit under a
   **Filter plays** label; they only choose which plays show and never change a
   play.

**Carried from `1.12.0-99` (not yet run)**
5. Settings and version history (use the profile that showed `Could not save
   that choice`): add a Front, a Formation and a Coverage from Edit library;
   each appears at once and survives a restart. Recovery lists the game's
   earlier save points; a new one appears; a restore works.
6. View choices survive a restart: Film Room layout, Film focus, the folded
   Play Call / Play Type lists.
7. Chart view works as before; Film Room `Below` / `Beside` / `Reset` and the
   divider work and persist; the play card scrolls and lists the whole play.
8. Shown-plays summary: one unit filtered matches Reports (Defense yards per
   play equals Reports > Defense for the same game); the Yds header reads
   `N.N / play` for one unit and is blank for All plays.
9. Columns per unit: a change under Offense stays with Offense; Defense keeps
   its own set.
10. Film is never reloaded, blanked or covered by switching views, docking,
    dragging the divider or Film focus; fullscreen and playback work.
11. Reports: Matchup's section reads `Coverages`; Offense page 3 is headed
    `Structure and execution`.

**Not in this build:** the Codex-review repair `125c6f5` (a Special Teams column
in a custom Offense set was editable when filtered to Offense; Save & Next's
unit carry now uses the one write). Found after this installer was built.

**Superseded, never smoked:** replaced by `1.12.0-101` (`SMOKE-1.12.0-101.md`),
which adds `125c6f5`. Not tagged, pushed or published.

**Coach decision, 2026-09-24 (carried from `1.12.0-99`):** when this smoke
passes, commit the result docs and push the branch. No tag unless the coach
asks for a release.
