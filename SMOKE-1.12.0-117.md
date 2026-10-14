# SMOKE 1.12.0-117 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `970294b5` (2026-10-13): **162/162 green, 0 skipped, 0 failed**.
  Receipt: `artifacts/gate-logs/2026-10-13T16-47-06-259Z-LeHtWB/receipt.json`.
  `releaseEligible: true`; clean source, build and fixture identities unchanged.
  Analytics parity, integrity and canonical-season checks passed, not skipped.
- The first run stopped after a stale managed-film source-format assertion
  failed. `970294b5` replaces it with owner-path behavior checks; the wrong-owner
  mutation fails the named assertion. Production code was unchanged.
- Claude reported no findings on the reviewed repair batch through `427e906e`.
- Version-only bump: `a60b0809`; all four owners read `1.12.0-117`.
  Fresh-build `e2e-p0-exit` passed 20/20 (focused, not a second full gate).
  Receipt: `artifacts/gate-logs/2026-10-13T17-04-24-999Z-SxHAAX/receipt.json`.
- Built from the clean version-bump commit with `cargo tauri build --bundles
  nsis --config <external unsigned config> -- --locked`; the config disables
  `bundle.createUpdaterArtifacts`. No dependency resolution changes were made.
  The packaging frontend build matches the focused version-check build:
  `bf7de15060c6f7c4e4df69eb4d9b2c81d2bf79cad0dd3b5ab65cd9f364934f3f`.
- Installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-117_x64-setup.exe`.
  Size: **4,060,134 bytes**. SHA-256:
  `04226572261B5FA04ECBD0FC8C4D3AFD474177751B83C2414691B40394778539`.
  Installer and application product/file versions verified as `1.12.0-117`.
- Rust audit: zero vulnerabilities; remaining transitive warnings are tracked
  in `docs/OPEN-DEFECTS.md`, not suppressed.
- Independent packaged-asset inspection: **pending**. Metadata and a clean
  build do not establish that inspection or installed acceptance.
- Nothing installed, pushed, tagged or published. No coach data was changed.

## Result

**PASS - coach-approved installed smoke, 2026-10-14.** Coach: "record 117 as
passed smoke test." This is the latest accepted installer; 116 was not
accepted. The rapid-scrubbing defect remains deferred. The shortcuts-dialog
repair and receiver checkpoint 1 are source-only changes, not in installer
117, and require their next installed smoke.

The read-only Codex checks below remain evidence of that limited pass, not
claims that Codex performed every coach check. Independent packaged-asset
inspection remains pending. The gate's historical `not-assessed` value and
the design approval registry are unchanged by coach acceptance.

## What to Check

1. Install and launch; open real seasons with expected counts. Managed and
   linked film play from their actual locations, including after restart.
2. Chart and Save a play; close with X and reopen. Tags, selected game and film
   survive. Switch games repeatedly without duplicate clips.
3. Check Chart draft/Save, note edits from the first keystroke, leaving with
   unsaved changes, unit-change confirmation and draft recovery. Follow the
   carried checklist in `docs/OPEN-DEFECTS.md`; existing hidden values remain
   the coach's to re-chart.
4. Dashboards rev 2: place offense and defense modules side by side with
   independent units, games and filters. Open/Edit, template-copy editing,
   Rename, Duplicate, Export and typed Delete work; relaunch preserves them.
   Watch opens exactly the counted plays and returns to Dashboards.
5. Compare yards and success/stop rates across Reports, Study and Dashboards
   for identical scopes. Turnovers fail on offense and stop on defense;
   unjudged rates show a dash. Check negative bars and share totals.
6. Save Game, Defense, Season and Dashboards HTML with a new basename lacking
   an extension, then open the files. Check explicit `.html`, cancellation and
   overwrite; also Plan, season-data and cut-up exports. A refused save reports
   failure, never success or an anchor-download fallback.
7. Shared overlays: diagram and analysis review open centered, handle Escape,
   restore focus, and save/cancel as intended. Check native film preview.
8. On disposable data, delete a managed-film game and Undo, preserving sibling
   film. Linked film needs explicit approval; check restart, nested/alias paths,
   an outside-folder picker and library-root rollback. Never test destructive
   paths on coach data.
9. On an isolated test profile, a mirror with unsafe/duplicate IDs reads
   `Invalid IDs`, cannot be recovered and writes nothing. Normal Recovery
   still lists current compatible mirror snapshots.
10. Check startup and the updater's normal check/error behavior with the patched
    Rust dependencies. Do not install an update merely to complete this check.

The intermittent rapid-scrubbing defect remains deferred; this build does not
claim a repair. Record a recurrence without restarting that investigation.

## Findings

1. **Keyboard Shortcuts: overlapping text.** At the observed 1402 x 932
   window, the Play Type and Result key chips overlap their descriptions;
   the long Redo chord overlaps its description too. Reproduced by opening
   the toolbar's Keyboard shortcuts button and confirmed in a second capture.
   Escape dismisses the centered dialog and returns focus to its opener.
   Repaired in source after this smoke; the 117 installer remains unchanged.
   The next package must verify the repaired dialog in WebView2.

## Codex Read-Only Checks

- Installed More menu identifies `1.12.0-117`. Home renders the six-game
  canonical 2025 JV season with film thumbnails and scores.
- The existing Test 1 Dashboard renders its number, bar, share, game and
  table modules. Its Holy Family yards/play point is 7.9, matching Overview.
- Overview, Defense, Special Teams and Players render; the detail tabs do
  not repeat the Overview score banner.
- Linked film visibly advances in Chart and Film Room. Filtering Film Room
  to Offense shows 34 plays, 7.9 yards/play and 59.4% success, matching
  Overview. Watch 34 opens a 34-play film session and plays film; exiting
  removes the session controls. The temporary filter was cleared.
- Dashboard Export opens the native HTML Save As dialog; Escape cancels
  without an error. Renamed-file delivery, overwrite and file contents were
  not verified. No export file was written.
- Study renders its current-game Formation results. Plan renders its empty
  existing plan; its export is disabled, so Plan delivery remains untested.
- No tags, notes, scores, roster, film links or season records were edited or
  deleted. Navigation and film selection may persist ordinary view state.

Save/draft, restart, Dashboard mutations, actual export delivery, diagram and
analysis review, updater, managed-film deletion/Undo and invalid-ID recovery
were not tested by Codex in this read-only pass. Coach approval above is
separate; it does not turn these into independently performed Codex checks.
