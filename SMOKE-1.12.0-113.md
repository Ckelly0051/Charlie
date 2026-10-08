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

Coach installed smoke in progress; finding 1 recorded 2026-10-08. Not approved.
Installer 112 was REVISE; this build includes
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

## Codex Installed UI Check - 2026-10-08

Partial, non-destructive smoke through Windows computer use on the installed
app. The More menu identified `1.12.0-113`. No charting fields, playbook entries
or film links were edited; no plays were deleted. Navigation and normal
close-time persistence ran through the app.

- **Playback:** eight forward/backward timeline drags: two on OLV Play 36,
  six on the reported Play 26, at windowed and maximized sizes and during
  playback. Film loaded and frames changed. One buffering state recovered.
  No Film unavailable overlay reproduced. Serial automation with observation
  between inputs does not establish rapid-scrubbing stress coverage. Finding 1
  remains open.
- **Dialogs:** Delete play and Clear tags opened centered. Escape dismissed
  Delete; Cancel dismissed Clear. Pressing H with Clear tags open did not
  change Play 26's Run Outside classification. Play count remained 121.
  Immediate-after-open Escape timing and template prompts were not tested.
- **Reports:** OLV Special Teams showed two returns totaling 31 yards, long
  16. Players showed #13 with 16 return yards and #42 with 15. Defense showed
  seven missed tackles; the all-unit Players rows summed to eight. These are
  observed outputs, not an independent play-by-play formula verification.
  Detail report tabs did not repeat the Overview score banner.
- **Film Room / Watch:** Special Teams filtered to eight plays, numbered
  1, 11, 12, 21, 22, 24, 25 and 36. Watch opened an eight-play set; Next moved
  from Play 1 to Play 11 and loaded its film. Clearing filters restored 121.
- **Restart selection:** switched from OLV to Oakland Christian and back,
  closed with X, confirmed the app exited, and relaunched. Continue Season
  retained OLV as active with 121 plays and 32 charted. Continue charting
  loaded OLV film. This tests selection persistence, not newly charted edits.

Still untested here: chart/save/restart of new edits, Playbook favorite and
default application edits, Drive edits, coverage-penalty editing cases,
CSV/export/import on a disposable copy, and separate managed-film coverage.
Independent packaged-asset inspection also remains pending. No additional
confirmed defect was found in these checks; installed smoke is not approved.

## Coach Findings

1. **Scrubbing shows "Film unavailable"** (coach, 2026-10-08). Installed
   113, SJM Varsity 2026, Week 6 vs Our Lady of Victory Cougars, Play 26.
   Screenshot shows the film frame behind the error, scrubber at 0:04 of
   0:16, and "Couldn't play 20261003_192402. Re-link the film or use MP4,
   MOV, or WebM." Recurrence of the existing timeline-scrubbing defect in
   `docs/OPEN-DEFECTS.md`; exact media error and trigger sequence not captured.
   No new root cause established, no fix made. Smoke remains in progress and
   is not approved.
