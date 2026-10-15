# SMOKE 1.12.0-118 - Windows x64 Beta (unsigned)

## Build Record

- Full gate at `a5238591` (2026-10-14): **166/166 green, 0 skipped, 0 failed**;
  `releaseEligible: true`, source/build/fixture identities unchanged.
  Receipt: `artifacts/gate-logs/2026-10-14T19-46-40-309Z-96k7d5/receipt.json`.
  Analytics parity, integrity and canonical-season checks passed, not skipped.
- Version-only bump: `d8998f22`; all four owners read `1.12.0-118`.
  Fresh-build `e2e-p0-exit`: **20/20**. Receipt:
  `artifacts/gate-logs/2026-10-14T20-03-34-129Z-kjppHQ/receipt.json`.
- Built from the clean bump commit with `cargo tauri build --bundles nsis
  --config <external unsigned config> -- --locked`. The scratch config disables
  `bundle.createUpdaterArtifacts`; dependency resolution is unchanged.
  Packaging frontend matches the focused post-bump build:
  `d2466cbdfd578216d28e321355460dddc52872d08f65481748e5d25435498f01`.
- Installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-118_x64-setup.exe`.
  Size: **4,062,986 bytes**. SHA-256:
  `B72A05220761E051B065F8F35BA5CF9FF50939F5B923F2D1D32F15B876CC9BD5`.
  Installer and application product/file versions verified as `1.12.0-118`.
- Charlie Gate: **PASS**, coach, 2026-10-14, built deck range
  `3fbb8492..c09c4713`. Production remains `IMPLEMENTED_UNVERIFIED`.
- Independent packaged-asset inspection: **pending**. Build identity and
  executable metadata do not certify the assets inside the installer.
- Nothing installed, pushed, tagged or published. No coach data was written.

## Result

**Pending installed smoke.** Latest coach-accepted build remains 117.

## What to Check

1. Install and launch; open real seasons with expected counts. Managed and
   linked film play from their real locations, including after restart.
2. Chart and Save; close with X and reopen. Tags, selected game and film
   survive. Switch games without duplicate clips. Watch opens exactly its
   counted plays and charting stays in the selected set.
3. Whole Chart deck: compare populated desktop and narrow views with the
   approved composition. Chips wrap, read-only names are plain text, labels
   and Situation rows align, Quarter keeps OT with its peers, Edit library
   sits at each label row's right edge, and the compact inset/spacing is even.
   Check coarse targets on suitable hardware; do not infer them from desktop.
4. New/blank play opens Situation; existing-play navigation retains available
   working sections. Opening another module never closes one already open
   on the same play. Edits, Save and refresh retain them. The coach can close
   them. Shortcuts update summaries and header feedback; Y opens and focuses
   the real Yards input without closing other modules.
5. Every real control remains: transport, loop, speed, draw, film tools, expand,
   Mark start/end, Copy last, Clear tags, templates, Previous, Skip, Save and
   Save & Next. Save availability follows the draft. Check Save/Undo, leaving
   unsaved changes, unit-change confirmation and real-film layout/scrolling.
6. Receiver route/release: identify one target, chart route and Inside/Outside,
   Save/reopen, Undo and edit the route library. Multiple receiver numbers
   block only receiver details, not the rest of the play. Study samples and
   Watch open exactly the counted receiver plays. Target/Catch is not built.
7. On disposable test data, verify confirmed clearing and Cancel through
   Chart, Film Room, Quick Chart and scheme copies. A well-shaped mismatched
   receiver detail opens as hidden and drops on the next Save, never refusing
   the whole season. Do not manufacture invalid records in coach data.
8. Keyboard Shortcuts: verify Play Type, Result and Redo labels no longer
   overlap at the observed 1402 x 932 window and when resized; Escape closes
   and restores focus. This repair was not in accepted installer 117.
9. Recovery still lists compatible mirror snapshots; check the usual native
   export dialogs and a Reports/Study/Plan film-linked workflow.

Rapid-scrubbing false "Film unavailable" remains deferred and is not claimed
fixed. Record recurrence without reopening that investigation.

## Findings

Smoke in progress (coach, 2026-10-15). Findings are logged as reported; no
fixes start until the coach closes the list.

1. **Edit library spacing (persistent).** Play Type: the Edit library button
   sits alone at the far right of the label row, above the chip rows and
   disconnected from both its label and its chips, leaving a dead band of
   space across the row. This recurs on every library field. The coach
   understands why it happens (the button is pinned to the label row's right
   edge) and wants a better way to place it within the module: the current
   placement "just plain looks bad."
2. **Try editor: "What happened" label and order.** The label is sloppy
   phrasing for the Bad Snap / Blocked / Defensive Return / Interception /
   Fumble chips (`js/native-tagging.jsx` TryEditor). "Try events" was
   rejected (reads as an instruction); proposed: "Play events" (coach to
   confirm). The group moves to the bottom of the try
   editor, under Points awarded. Note for the fix: Points awarded hides and
   Official return ruling appears when Defensive Return is chosen, so the
   ruling should follow the events group rather than jump above it.
