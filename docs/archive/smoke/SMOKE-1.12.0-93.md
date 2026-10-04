# SMOKE 1.12.0-93 - Windows x64 Beta (unsigned)

**Purpose:** Installed acceptance for the Home and Breakdown follow-ups found
after the approved `1.12.0-92` Home composition.
**Repair commit:** `a93b38e`. **Version/build commit:** `3c6f34d`.
**Build source:** a clean detached worktree at `3c6f34d`; the unrelated dirty
files in the main checkout were not part of the package. The local packaging
override disabled updater-artifact signing without changing committed config.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-93_x64-setup.exe`
(4,021,489 bytes). SHA-256:
`1F31F9D18C3CD803735341978542FC45865FDAF2CF83A4F6FA8F1CE1F7C58109`.
The built executable reports file and product version `1.12.0-93`.

## Pre-install verification

`cargo tauri build --bundles nsis` with the unsigned local override completed
successfully. From the clean worktree's built assets: `e2e-p0-exit` 19/19,
`e2e-field-fixes` 26/26, `e2e-native-team-hub` 20/20,
`e2e-play-library` 53/53 and `e2e-native-tagging` 76/76. No full gate run.
`npm audit --omit=dev` found no production dependency vulnerabilities.

## Installed smoke - pending

No installation or coach-data changes were made during packaging. In the
installed app, verify these five reported behaviors against real data. A later
coach screenshot shows the Defense Edit library buttons still pushed to the
far edge; the `1.12.0-93` spacing claim is **REVISE**, regardless of the other
checks. The source-only correction made after packaging is not in this installer.

1. Season setup recognizes a configured game after an empty starter and marks
   First game and Ready to chart correctly.
2. Season setup and Edit season details use the current sans type.
3. Team identity saves and remains correct after reopening from both a game
   and Manage program.
4. Defense Edit library spacing is aligned and Add front persists after reload.
5. Dead-ball penalty Actual yards updates the next snap's D&D for both charged
   teams; a counted live-ball spot foul remains blank for coach correction.

This package is not an installed approval, tag, push or published release.
