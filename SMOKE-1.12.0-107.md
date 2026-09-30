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
23 and 60 listed above. Independently verified from the live catalog on
2026-09-30: play 3 Trips / 3x0 / Unbalanced Right; play 4 Tight Bunch / 3x0 /
Unbalanced Left; play 23 Split Back / 1x1 / Left; play 60 Bunch / 3x0 /
Unbalanced Left (Formation / Receiver Alignment / Offensive Line Strength).
The pre-smoke catalog hash is historical after these edits.

Read-only data/browser audit: **1,529 checks passed, zero failures**. Evidence:
`docs/smoke-data-verification-1.12.0-107-2026-09-30.json`. All three seasons
(919 live plays), retained backups and versions pass current-format checks.
Independent run-gap cohort/count/yardage/film-reference checks cover all games
on offense and defense. Actual Offense Structure screens and HTML exports were
checked for the 11 games with classified offensive snaps; four Varsity games
have no classified offensive snaps and were not exercised as populated screens.
No live Gap values or RPO read/decision details are charted, so their absence
is expected. A disposable 2025 JV Week 6 copy with five assigned gaps verifies
populated counts, average yardage and film references without altering coach data.
Live catalog SHA-256 before and after the audit:
`345842261d59ab2545275dcfb2fa06931522eb9c2be58feb198aa2e32eaa6e3f`.
This is not an independent recalculation of every report statistic or proof of
native desktop film playback, filesystem behavior or persistence after restart.
Overall installed smoke remains pending.

Expanded stats-engine arithmetic verification, 2026-09-30: **one P2 defect**,
S107-2 in `docs/OPEN-DEFECTS.md`. The built engine and actual Season report model
collapse pass attempts across games sharing a play number. Live 2025 JV should
read 15/24 completions/attempts, 62.5%, 6.8 yards/attempt; currently 15/20, 75%,
8.2. The registered canonical fixture and a two-game minimal example reproduce
the same root cause. Of 4,344 checks, 4,335 pass and nine fail on that cause.
Independent evidence: `docs/stats-engine-verification-1.12.0-107-2026-09-30.json`.
Existing analytics parity remains 2/2 green without golden changes, so passing
parity alone is not sufficient evidence of arithmetic correctness. No product
repair yet; smoke acceptance must not be inferred from the earlier data audit.

Additional independent arithmetic/data checks, 2026-09-30: **3,300 passed, zero
failures**, no additional engine defect found. Covered charted score ownership
and quarters, Special Teams counts/averages/eligible film references, conversions,
penalty counts/accepted yardage/no-play exclusions, defensive takeaways and
touchdowns, solo/shared tackles and player season-to-game reconciliation. Zero
duplicate roster jerseys or charted jerseys absent from their season roster.
Synthetic cases include a defensive touchdown, safety, ambiguous blocked-return
touchdown, zero-yard return, declined foul and wiped-out try. Live catalog bytes
unchanged. Evidence: `docs/stats-extra-verification-1.12.0-107-2026-09-30.json`.

Charted scoring events differ from saved official scores in four live games
(official -> charted, our points first): 2025 JV Week 1 41-0 -> 42-0;
Week 2 0-13 -> 0-12; Week 5 13-13 -> 14-6; SJM Varsity 2026 Week 3
13-34 -> 12-14. These are recorded data-reconciliation observations, not
additional confirmed arithmetic bugs. No score or scoring event was rewritten;
do not infer an uncharted try/TD or change ownership to force a match.

Coach follow-up, 2026-09-30: OLL discrepancy was a migration-related charting
error, now corrected by the coach; total-points engine confirmed working by the
coach. Audit score observations above describe the earlier captured data only.

**S107-3 - Drive grouping, OPEN.** Assigned drive must take precedence over
play-number order. Reproduced in the shared theater grouping owner: plays 1/2/3
assigned drives 2/1/2 create two separate Drive 2 groups. Current implementation
groups only adjacent runs, not all members of the assigned drive. No repair yet;
keep opposing possession sides separate and never guess blank drive assignments.

**S107-4 - Gap/Direction independence, coach-approved change / OPEN.** Direction
is broad coach judgment; Gap is additional precise lane charting. Neither field
overwrites or clears the other, and Gap is valid without Direction. Middle need
not mean Center. Preserve all existing stored values, including Right; no data
migration or inferred reclassification. Earlier checklist step 4's coupled
direction-clears-gap behavior is superseded. No production repair yet.

**S107-1 - Formation vocabulary, WITHDRAWN by coach, 2026-09-30.** After
reviewing the existing controls, the coach confirmed Bunch and Tight Bunch are
acceptable as separate formations for now. Keep the current single-select
Formation model and vocabulary. No multi-select or new compound names requested;
no repair or coach-data rewrite required. This resolves only this finding, not
the overall smoke acceptance.

Overall smoke approval pending. No push, tag, publication or auto-installation.
