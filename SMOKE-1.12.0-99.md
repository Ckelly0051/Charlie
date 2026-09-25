# SMOKE 1.12.0-99 - Windows x64 Beta (unsigned)

**Source:** `2d13c31` (the four-owner version bump on top of `69db940`), built
from the clean main checkout. **Gate:** full gate at `b7e2f32` 130/130, zero
skipped, zero failed; the only commits after it are docs (`2a6ac80`,
`69db940`) and the bump; `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-99_x64-setup.exe`
(4,027,455 bytes). SHA-256:
`6287A5C5B6A49C1B505716F1FECE6F1E9719532ED910C0B7EE056C0DCF09B73B`.
The built executable reports file and product version `1.12.0-99`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

**This is the Break Down smoke candidate.** It carries everything since
`1.12.0-98`, none of which has been installed before:

- Settings storage: version history moved out of browser storage to disk with
  a once-only migration, and the charting library reports its save errors
  (`9c4371b`, `f437e68`) — the fix for `Could not save that choice`.
- Film Room: video first with the table below (`Below` / `Beside` / `Reset`,
  resizable), the controls and play cards beside the film (`74f9efd`), column
  sets per unit (`c1cce33`, `5cd5313`), the play sheet and shown-plays summary
  (`97b2f37`, `db214d3`).
- The Break Down rebuild (`90ff4c6`..`05560c1`): one tree instead of five
  mounted parts; no visual change intended.
- Reports labels S98-1 and S98-2 (`4c76169`).

## Coach smoke checklist

**Settings and version history (installed only; use the profile that showed
`Could not save that choice`)**
1. Break Down > Edit library: add a Front (for example `Rhino`), a Formation
   and a Coverage. Each saves and appears in the deck at once, and is still
   there after closing and reopening the app.
2. Version history (Recovery): the open game's earlier save points are listed
   after the first launch (the one-time move to disk); a new save point
   appears; restoring one works and offers its backup.
3. Other view choices persist across a restart: Film Room layout, Film focus,
   the folded Play Call / Play Type lists.

**Break Down**
4. Chart view looks and works as before: deck, play strip, transport, chyron,
   Save & Next, More tools (Quick chart, Customize fields, Game settings, Film
   focus), Our Program / Opponent Scout.
5. Film Room: table below by default; `Beside`, `Reset` and dragging the
   divider work and persist.
6. With the table below, the controls card and the play card sit beside the
   film; the play card scrolls and lists the whole play, including grades,
   custom fields and tags, and Special Teams detail.
7. Shown-plays summary: with one unit filtered it matches Reports (Defense
   yards per play equals Reports > Defense for the same game); the Yds header
   reads `N.N / play` for one unit and is blank for All plays.
8. Columns per unit: change columns under Offense, switch to Defense (its own
   set), switch back (kept); the columns chosen before this build show under
   All plays.
9. Film is never reloaded, blanked or covered by switching Chart / Film Room,
   changing the dock, dragging the divider or Film focus; fullscreen and
   playback work.

**Reports**
10. Matchup's section reads `Coverages`; Offense page 3 is headed
    `Structure and execution`.

Installed smoke pending. Not tagged, pushed or published.

**Coach decision, 2026-09-24:** when this smoke passes, commit the result docs
and push the branch. No `v1.12.0-99` tag unless the coach asks for a release.
