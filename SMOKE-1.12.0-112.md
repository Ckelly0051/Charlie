# SMOKE 1.12.0-112 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `81b327c6`: **156/156 green, 0 skipped, 0 failed**, 2026-10-07.
- Version-only bump `9cdb23f0`: all four owners `1.12.0-112`;
  `e2e-p0-exit` green, 20/20.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-112_x64-setup.exe`,
  4,036,201 bytes, SHA-256
  `B61DCA23A42DBD59A60A621D4AC65C61F06270120F4D80449255E8E8850F6C28`.
  Product and file version `1.12.0-112`. Built from a clean tree at `9cdb23f0`
  with `cargo tauri build --bundles nsis` and an external scratch config setting
  `createUpdaterArtifacts:false`. Source remained clean after packaging.
- Independent packaged-asset inspection (`docs/RELEASE.md`): pending.
- Nothing pushed, tagged or published.

## Result

Coach smoke 2026-10-07: REVISE, eight findings. Seven are repaired in source and wait for the next installer; finding 2 is open.

## What to check

Standard smoke (`docs/RELEASE.md`): install and launch; real-season play counts;
managed and linked film playback; chart, close and relaunch to verify saved tags;
switch games without duplicate clips; Watch opens exactly the counted plays.

- **Missed tackles charting:** name two defenders on a missed tackle, chart an
  exact count, chart zero, then clear the count. Blank must not become zero.
  The picker offers our defenders on defense and kick coverage; offense and
  receiving units offer counts without our roster. Unsupported kick units
  have no missed-tackle row. Try charting remains available without entering
  ordinary player analytics.
- **Film Room and CSV:** MTkl edits the same count as the deck. Export and
  import a copy to verify Missed Tackles and Missed Tacklers are retained.
- **Reports:** Defense has eleven KPI tiles and the six-row Tackling module.
  Check current-game and season scope, Game-by-game and Players > Tackles MTkl.
  Each player's miss is counted once per defensive play named; kick coverage
  is intentionally not included in these report totals yet.
- **Study:** Missed Tackler includes our defense and kick coverage, but no
  run/pass or Fake try enters its missed-tackle or yards-allowed statistics.
- **Shared dialogs:** Delete play, Clear tags and Delete template default to
  Cancel. In the template-name prompt, Tab to Cancel and press R/H: the play
  underneath must not change. Cancel and Escape leave it unchanged. Confirm
  that keyboard shortcuts work after the dialog closes, and ? opens/closes
  the shortcuts legend.
- **Spacing:** collapsed Players & Grades rows are tighter without clipping.
- **Persistence:** check roster and film labels, saving and game switches after
  the service-injection refactors.

## Findings

1. **Reports showed no return yards** (Varsity 2026 vs OLV play 1, a kick
   return with possession own 22, end own 38). Repaired `27de94f2`: the Return
   Yards box is removed; every report measures possession spot to end spot.
   The coach chose to drop two 2025 JV punt returns that had only a stored
   value.
2. **Reopening the app opened the previous game** (closed on Week 6 vs OLV,
   reopened to Week 5 St. George; picking OLV on Home then opened St. George).
   The close-time save wrote St. George as the season's active game; plays
   were intact. Not reproduced in the browser. Open.
3. **A new favorite play call showed in Chart only after a restart.** Repaired
   `16de2ab1`.
4. **The Playbook star did nothing** (every star looked the same). Repaired
   `16de2ab1`.
5. **Edit on a saved play call opened no edit form.** Repaired `16de2ab1`: Edit
   opens a dialog.
6. **A picked play call did not replace charted values.** Repaired `efb416a2`:
   it replaces the fields it has defaults for, nothing else.
7. **The Our Defensive Call heading highlight had no horizontal padding.**
   Repaired `13bab37a`.
8. **Missed tackles named by player number did not count in Reports.**
   Repaired `27b53d4c`: our misses count from the names, with no Count box on
   our snaps; the Count stays for the opponent's misses.

Found during the repairs: every dialog filled the window since `1.12.0-108`.
Repaired `1df5cef8` (centered 520px dialogs; Escape no longer races the
overlay host).
