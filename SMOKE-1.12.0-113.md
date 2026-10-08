# SMOKE 1.12.0-113 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `d1b553ba`: **156/156 green, 0 skipped, 0 failed**, 2026-10-08.
  Receipt: `artifacts/gate-logs/2026-10-08T03-39-53-496Z-gCtcJr/receipt.json`.
  Source and fixture identities unchanged; release eligible; installed approval
  not assessed.
- Version-only bump `22e83a47`: all four owners `1.12.0-113`;
  `e2e-p0-exit` green, 20/20.
- Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-113_x64-setup.exe`,
  4,036,887 bytes, SHA-256
  `2D93D5950C9B16AF3928C170655534B022B58613EFC2D4C926FC8DD771460E87`.
  Product and file version `1.12.0-113`. Packaging started from a clean tree
  at `22e83a47` using `cargo tauri build --bundles nsis` with an external
  scratch config setting `createUpdaterArtifacts:false`. Tracked source stayed
  unchanged; this smoke document was prepared during compilation.
- Independent packaged-asset inspection (`docs/RELEASE.md`): pending.
- Nothing pushed, tagged or published.

## Result

Pending coach installed smoke. Installer 112 was REVISE; this build includes
its source repairs plus Drive in Situation and kick coverage tackles.

## What to check

Standard smoke (`docs/RELEASE.md`): install and launch; real-season play counts;
managed and linked film playback; chart, close with X and relaunch to verify
saved tags and the selected game; switch games without duplicate clips; Watch
opens exactly the counted plays.

- **Return yards:** Varsity 2026 vs OLV play 1 (possession own 22, end own 38)
  shows a 16-yard return for #13 in Special Teams and Players. No Return Yards
  box; reports use the spots, not the retired stored value.
- **Missed tackles:** on defense and our kick coverage, name three missers
  without a tackler; the count follows the names, with no Count box. On offense
  and receiving units, chart the opponent's count. Check Defense, Players,
  Film Room MTkl, Study and a CSV export/import on a copy.
- **Coverage tackles:** chart our tackler and missers on Kickoff and Punt.
  Check Players > Tackles and Defense player contributions. Team defensive
  Tackling totals exclude coverage. A nullified or unresolved penalty excludes
  coverage tackles and misses; a play that stands retains them.
- **Drive:** the last box on Situation's second row writes the play's drive;
  the play strip groups it. New Drive is gone. Check all four boxes align.
- **Playbook:** star/unstar a call and see Chart favorites update immediately;
  Edit opens the call dialog. Pick a call with a Direction default over a
  charted Middle direction; its defaults replace their fields, while unrelated
  charted Personnel stays.
- **Dialogs:** Delete play opens centered at 520px and defaults to Cancel.
  Immediate Escape closes it. Clear tags and template dialogs are centered;
  charting shortcuts do not edit the play while a dialog is open.
- **Visuals:** Our Defensive Call has cyan padding on both sides; collapsed
  Players & Grades rows remain compact without clipping.
- **Reopen selection:** close on OLV after opening it from Home, then relaunch.
  It should reopen OLV, not St. George. Smoke 112 finding 2 was closed by the
  coach without a reproduced cause or code fix; retain this check.

Known unrelated open items remain in `docs/OPEN-DEFECTS.md`; this build does
not claim to fix the player/Defense tackle discrepancy or renamed HTML export.

## Findings

None recorded yet; smoke pending.
