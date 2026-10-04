# SMOKE 1.12.0-103 - Windows x64 Beta (unsigned)

**Source:** `b177c91` (the four-owner version bump on top of `1697904`), built
from the clean main checkout. **Gate:** full gate at `1697904` 137/137, zero
skipped, zero failed; `e2e-p0-exit` 19/19 after the bump. Codex reviewed
`2094e42` and the restore-point archive with no code findings; its one
documentation finding is repaired in `1697904`.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-103_x64-setup.exe`
(4,038,145 bytes). SHA-256:
`DA5B31D7B2143296E2786DC049CF45C0891A1DD667FD2457DF773EB1B58FA63C`.
The built executable reports product version `1.12.0-103`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

**This is legacy excision step 8** (`docs/LEGACY-EXCISION-PLAN.md`): the first
package without any old-format reader. It carries Pass 1, Pass 2 steps 1-7,
Pass 2b (the one-time storage cleanup and settings conversion) and rows 9 and
11, on top of everything in `1.12.0-102`, whose installed smoke was never run.
It supersedes `1.12.0-102`.

## Coach smoke checklist

**Legacy excision (check first)**
1. First launch opens normally, with no error toast. The three seasons open
   and chart as before; Reports for 2025 JV match what they showed before.
2. Charting offers no combined formation and no retired Special Teams choice;
   library choices, templates and auto-detect stamp only current values.
3. Settings kept through the one-time conversion: the charting library (added
   choices included), Film Room columns per unit, Study views and the Home
   mode (Our Program / Opponent Scout) are as they were.
4. Recovery lists each game's save points; a restore works. The old file
   restore points are gone from the list (archived and removed, 2026-09-26).
5. Importing an old-format season file is refused with a plain message and
   changes nothing.

After this launch, a read-only copy of the profile is checked for: the
storage-cleanup marker with a written receipt (the unscoped version history
and two retired roster keys removed, matching their archive hashes), and
`giq_settings_format_2026_09_26` with no failed step. When both are confirmed,
`js/storage-cleanup.js` and `js/settings-format.js` are deleted.

**Carried from `1.12.0-102` (never run)**
6. Film Room, All plays and each unit filter: a defensive row shows and edits
   the offense it faced; an offensive row the defense it faced; only Special
   Teams rows leave those cells blank.
7. The **Unit** column is first on every column set; changing it in Film Room
   or Chart changes the other at once; last change wins.
8. On a play with no stored unit: `C` moves it to Defense, digits write no
   Special Teams type, Clear Tags keeps Offense, Save & Next carries Offense.
9. The table's unit buttons sit under **Filter plays** and never change a play.
10. Edit library: add a Front, a Formation and a Coverage; each appears at once
    and survives a restart.
11. View choices survive a restart: Film Room layout, Film focus, folded Play
    Call / Play Type lists; `Below` / `Beside` / `Reset` and the divider work.
12. Shown-plays summary matches Reports for one unit; columns per unit stay
    with their unit.
13. Film is never reloaded, blanked or covered by switching views, docking,
    the divider or Film focus; fullscreen and playback work.
14. Reports: Matchup reads `Coverages`; Offense page 3 is `Structure and
    execution`.

## Result (2026-09-27)

The coach confirmed first launch; the rest was run on the installed build by
Claude on the coach's direction, on 2025 JV (canonical data) with every change
reverted, plus a sample season that was removed afterwards.

- Profile read-back after first launch: the storage cleanup removed its three
  keys with hashes matching their archives and wrote its receipt; the settings
  conversion ran with no failed step. Pass.
- 1. Seasons open, film plays, Reports Overview / Defense / Special Teams
  render (Special Teams 18 snaps, all assigned). Pass.
- 2. Formation offers no Shotgun, Pistol or Empty; adding `Shotgun` as a
  formation is refused and names QB Alignment. Pass.
- 3. Library, Film Room columns, Home mode kept. Pass.
- 4. Season restore points list no July file restore points; a July game
  version is refused (`...cannot be restored. Nothing was changed.`, no backup
  written); a current version saves and restores with `Backup before restore`.
  Pass. Side effect: the test saves pushed Week 1 past the 20-version cap and
  pruned its oldest (old-format) version, Jul 11 04:46Z; a copy is in
  `GridIronIQ-Backups\legacy-conversion-2026-09-26\appdata-seasons\library.db`.
- 5. Old-format file import: not run (the file dialog's process was not
  granted); covered by `e2e-season-format`.
- 6, 7, 9. Unit round trip Film Room <-> Chart on JV Week 1 play 46 (reverted);
  faced looks shown; `Filter plays`. Pass.
- 8. `C` on a unit-less play: not run -- the converted data has none.
- 10. Library add appears at once, survives restart, removes cleanly. Pass.
- 11-13. `Beside` persists across restart; Defense filter `3.9 / play` equals
  Reports > Defense; film kept playing through the divider drag, Beside/Below
  and Film focus. Pass.
- 14. `Coverages`, `Structure and execution`. Pass.

**Finding S103-1** (Recover seasons dead button) -- repaired in source
`c1e8d2b`; see `docs/OPEN-DEFECTS.md`. Not in this installer.

Not tagged, pushed or published.
