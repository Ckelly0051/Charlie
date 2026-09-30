# SMOKE 1.12.0-107 - Windows x64 Beta (unsigned)

## Build Record

Full gate at `a449b59e`: **140/140 green, 0 skipped, 0 failed**, 2026-09-30.
Built source: `72bea85a`, adding only the four-owner version bump after the
tested cutover source (plus gate/smoke documentation).
Post-bump `e2e-p0-exit`: 19/19, all four version owners match.
Installer built successfully (exit 0) with `cargo tauri build --bundles nsis
--config artifacts/local-installer-config.json`; local override disables
updater-artifact signing. Artifact:
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-107_x64-setup.exe`,
4,037,422 bytes. SHA-256:
`AD3D650E69743E1EE1647C6F287C9E2D22885CC1CD648090CD0977D7EE865290`.
Built executable product/file versions both report `1.12.0-107`.
No installation or installed approval yet. No push, tag or publication.
The working tree was clean for the build; after packaging, the live catalog
still hashes to `770f3cc3b185e2b71e732a841a46e0ebc25859ac7d7beb361a43fb798273469c`.

Live charting conversion is already complete and independently verified:
`docs/charting-live-verification-2026-09-30.json`. There is no converter in the
installer and no automatic coach-data conversion on launch. Old imports and
restore points remain refused before a write. Data-only pre-write backup:
`D:\Football\Film\GridIronIQ-Backups\charting-conversion-2026-09-30`.

## Installed Checks

1. Install this candidate and confirm the displayed version is `1.12.0-107`.
   Open all three seasons: SJM Varsity 2026 (293 plays), SJM JV 2026 (186),
   and 2025 St. Joseph Mavericks - JV (440). Counts are pre-smoke baselines.
2. Confirm linked film plays in place and managed film auto-loads after restart.
   Switch games and seasons; verify the correct clips, tags and selection.
3. Chart Formation from the library, Personnel, QB Alignment, Receiver Alignment
   and Offensive Line Strength. Verify independent fields, custom library edits,
   hidden choices and persistence. Formation & Call labels and 27px desktop
   chips must match the approved comp without shrinking type.
4. Exercise Gap directly under Play Direction: L/R gaps, Center and Other;
   contradictory direction clears Gap in one undo step. Exercise Motion Starts/
   Ends, RPO Give/Keep/Throw and QB Run details, plus Reverse and H/J shortcuts.
   Clearing a trigger with charted details must ask before clearing; Undo works.
5. Check the same fields in Film Room, play detail and theater. Export and
   re-import a current CSV into disposable data; current fields survive and a
   bare old Formation column is refused with nothing written.
6. Inspect Offense Structure, Opponent Offense scout and Defense run-gap reports
   and their white-background HTML exports. Chart a Gap if needed to populate
   the chart; blank gaps must remain uncharted, not inferred.
7. Confirm retained restore-point and game-version lists open without errors;
   retired incompatible records are absent. Test an actual restore only on
   disposable data, not by overwriting the verified live seasons.
8. Chart a play, close and reopen; confirm data and film persist. Run/pass and
   Fake Special Teams tries retain their look but stay outside scrimmage stats.

## Re-Chart After Installing

2025 St. Joseph Mavericks - JV, **Week 6 vs Holy Family Wildcats**:
plays **3, 4, 23 and 60**. Their previous Formation was Unbalanced and was
deliberately left blank under the coach's mapping. These are displayed play
numbers/durable IDs, not array positions. Re-chart during or after smoke,
not before packaging; the verified backup remains unchanged.

## Result

Coach smoke feedback, 2026-09-30: the coach reports re-charting plays 3, 4,
23 and 60 listed above. This is a coach report, not a new catalog audit; the
pre-smoke catalog hash is historical after these edits.

**S107-1 - Formation vocabulary, open.** Bunch is a modifier of Trips. Separate
Trips and Bunch chips cannot represent that combination with the current
single-select Formation field. The coach raised either multiple selection or
distinct Bunch / Tight Bunch selections. Those two names already exist as
standalone Formations; the unresolved issue is representing the complete Trips
formation unambiguously. Recommendation, not yet approved: distinct complete
names Trips Bunch and Trips Tight Bunch, keeping Formation single-select.
No repair or coach-data rewrite while smoke findings are being collected.

Overall smoke approval pending. No push, tag, publication or auto-installation.
