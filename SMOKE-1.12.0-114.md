# SMOKE 1.12.0-114 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `075522ce` (2026-10-10): **157/158 green, 0 skipped, 1 failed**.
  Receipt: `artifacts/gate-logs/2026-10-10T18-15-13-470Z-eGCXc2/receipt.json`.
  The red harness, `e2e-design-system` (raw colors in the Dashboards styles),
  was fixed in `7dd5dfc5` and re-run green 17/17 with report-builder,
  native-reports, css-ownership and stranded-code. `3977a644` then removed
  two `window.app` reach-throughs from `playlist-manager.js` (Old patterns)
  with 20 clip, film and playlist harnesses green. No full re-run on the final
  bytes; the coach accepted the focused re-runs for this installer.
- Codex reviewed every round of the batch (`8abd06ce..075522ce`); the last
  round had no findings. Analytics parity (`e2e-parity`) green; integrity
  green on the canonical fixture.
- Version-only bump `f310fbf1`: all four owners `1.12.0-114`;
  `e2e-p0-exit` green, 20/20.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-114_x64-setup.exe`,
  4,052,190 bytes, SHA-256
  `1E52536E96FCB8D7B517C8EF4846F620C89BAEE14E93AE0645A6C10A9367CF6D`.
  Product and file version `1.12.0-114` (installer and `gridiron-iq.exe`). Built from a clean tracked tree at
  `f310fbf1` with `cargo tauri build --bundles nsis` and an external scratch
  config setting `createUpdaterArtifacts:false`.
- Packaged-asset inspection by a non-builder reviewer: pending.
- Nothing pushed, tagged or published.

## Result

Pending the coach's smoke.

## What to check

Standard smoke (`docs/RELEASE.md`): install and launch; real-season play counts;
managed and linked film playback; chart, close with X and relaunch to verify
saved tags and the selected game; switch games without duplicate clips; Watch
opens exactly the counted plays.

- **Save:** an edit is unsaved until Save, Save & Next or a confirmed Quick
  Chart entry. Save stays on the play. Reports and Film Room do not change
  until the play is saved.
- **Leaving asks:** with an unsaved edit, select another play, Previous, Skip,
  Next clip and Previous clip, switch game, switch season, edit the play in
  Film Room, and close the window. Each asks Stay / Discard / Save (closing:
  Cancel / Discard / Save); Escape is Stay.
- **Notes:** type a note and click another play at once: it asks.
- **Unit change:** switch a charted defensive play to Offense: it names what
  goes (for example Tackler(s) (5)); Cancel keeps the play as it was. Change
  unit saves it. Then switch a play holding only Save & Next values (carried
  down, distance, formation): no prompt. Repeat on a Special Teams unit change
  and a try's attempt type.
- **Undo:** change a carried formation, Undo, then switch units: no prompt.
  Type in Notes, Undo, type again, Undo: the new typing goes.
- **Recovery:** with an unsaved edit, end the app from Task Manager, relaunch,
  open the play: Restore brings the edit back unsaved; Discard drops it.
- **Turnover tacklers:** chart an offensive interception and a lost fumble with
  our tackler, our missed tackler and their tackler. Players credits our
  tackle and miss; a lost Sack + Fumble gives our return tackler no sack or
  TFL; the opponent's numbers are credited to no one.
- **Tackle match:** Players and the Defense board agree for 2025 JV (#5, #7,
  #82).
- **Dashboards** (no comp yet; composition is the coach's to review): the
  violet Dashboards button in Reports. Open each template on the real season,
  add a widget, filter to 3rd down, click a bar and a heat-map cell to watch
  film, build a penalty foul by ruling heat map, relaunch and reopen the
  dashboard. A defense dashboard's Run % and Pass % read the offense it faced.
- **Study:** group defensive plays by Formation: groups hold the offense's
  looks, not empty rows.

Existing hidden values on 50 plays are the coach's to re-chart
(`docs/HIDDEN-VALUES-LIST.md`); saving one of them drops what it cannot show.
Known open items remain in `docs/OPEN-DEFECTS.md`, including intermittent
rapid scrubbing and the renamed HTML export.

## Coach Findings

1. **Dashboards start page is lost after the first choice** (coach,
   2026-10-10). Reports > Dashboards opens a start page of templates; after
   the first pick there is no way back to it, and the only way to change
   dashboards is the dropdown. The start page should stay reachable as the
   Dashboards home page for creating dashboards. Logged; no fix started.
2. **Dashboards need a saved inventory to pick from** (coach, 2026-10-10).
   Built and saved dashboards should be kept in an inventory, chosen from a
   menu similar to game selection on Home. Today each dashboard is already
   saved with the season (with Rename, Duplicate and Delete), but it is
   reached only through the head dropdown; there is no inventory view.
   Likely one surface with finding 1 (the Dashboards home). Logged; no fix
   started.
3. **Editing a template must save as a new dashboard** (coach, 2026-10-10).
   A built-in template stays unchanged; an edit to it is forced to save as a
   new dashboard, so a coach learning the tool cannot break a template and
   not know how to rebuild it. Today choosing a template makes a saved copy
   named after the template, and edits change that copy at once; the
   built-in definition itself is never changed, but nothing shows the
   difference and the copy reads as the template. Logged; no fix started.
4. **Segmented control borders bleed** (coach, 2026-10-10, screenshot).
   Dashboards head, scope (This game / Last 3 games / Season) and unit
   (Offense / Defense / Special Teams / All units) controls: the selected
   segment's gold border meets the grey borders of its neighbors (Season
   beside Last 3 games, Offense beside Defense), so the line colors run
   together at the shared edges instead of one clean selected outline.
   Logged; no fix started.
5. **Add a built dashboard module to an existing report** (coach,
   2026-10-10; feature request). A coach builds a module in the Dashboards
   builder and saves it to an existing report (for example the Defense
   report); from then on that report always shows it. Not built today:
   Dashboards are separate pages and the fixed reports cannot take added
   modules. Recorded with the reports rebuild (`GRIDIRON-IQ-PLAN-V2.md`
   step 3), whose report sections as specs make it possible. Logged; no
   work started.
