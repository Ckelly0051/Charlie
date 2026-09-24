# SMOKE 1.12.0-98 - Windows x64 Beta (unsigned)

**Source:** `6821f07` (the four-owner version bump on top of `b963e66`), built
from the clean main checkout. **Gate:** full gate at `5f208e1` 126/126, zero
skipped, zero failed; the only code after it is test-only (`b30a9c2`,
`e2e-reports-module-system` 40/40); `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-98_x64-setup.exe`
(4,026,148 bytes). SHA-256:
`9E1414234D9D4FA2EA5ACB22F96426FA273E2FFABEBABC219E2AF9190F6FF927`.
The built executable reports file and product version `1.12.0-98`. Built with
`cargo tauri build --bundles nsis` and a local `createUpdaterArtifacts:false`
config file (no signing key); exit 0.

**This is the Reports smoke candidate.** It carries everything in `1.12.0-97`
(global strip, secondary bar, down-and-distance chart, input repair) plus the
repair of `1.12.0-97` smoke finding S97-1. The `1.12.0-97` smoke stopped at
that finding, so its remaining checks carry here.

**New since `1.12.0-97`:** every Reports board except Overview uses the Defense
module system (S97-1, coach direction): Offense (`77aea58`), Special Teams
(`272a62c`), Players (`cba2f4c`), Self-Scout (`cc3db88`), Matchup (`b70b758`),
Season (`75673a2`).

## Coach smoke checklist

**Module system (S97-1)**
1. Offense, Special Teams, Players, Self-Scout, Matchup and Season each open
   every page on a numbered heading with the page name and its count on the
   right, then outlined modules with space between them, a title bar and a
   large sentence-case title. No small all-caps headers, no left accent bars.
2. Offense is gold; Players and Self-Scout modules are gold (offense) or blue
   (defense); Special Teams, Matchup and Season use a neutral gray line.
   **Decision open:** Special Teams has no colour of its own.
3. Players shows full names aligned after one- and two-digit numbers, and the
   longest name fits in Tackles.
4. Season adds a heading only to Overview and Trends; the boards inside it
   keep their own.
5. Chart internals (grid cells, bars, radar) keep their own look; say if they
   should change too. Overview is unchanged.

**Carried from `1.12.0-97`, not yet verdicted**
6. The down-and-distance chart on Offense and Defense > Situations: cells,
   cohort line, detail panel, `Watch N plays`, scope changes, exports.
7. Text and date fields outside Reports (Break Down yardage, Study date
   ranges, saved views and plans) save once and do not fight typing.
8. The secondary bar, page navigation, full-report exports, no game KPI
   banner, the Overview score, and the items carried from `1.12.0-95`
   (see `SMOKE-1.12.0-97.md`).

Installed smoke pending. Not tagged, pushed or published.
