# SMOKE 1.12.0-96 - Windows x64 Beta (unsigned)

**Source:** `21f5688` (the four-owner version bump on top of `62fd1d4`), built
from the clean main checkout. **Gate:** not run, by standing direction
(installer before gate); the 27 affected harnesses were green at `0e84464`, and
`e2e-p0-exit` was 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-96_x64-setup.exe`
(4,019,382 bytes). SHA-256:
`A517BED202809181EED2FAC214B55965463513F19D3D9273F59BBD4977EBAEEA`.
The built executable reports file and product version `1.12.0-96`. Built with
`cargo tauri build --bundles nsis` and a local `createUpdaterArtifacts:false`
config file (no signing key); exit 0.

**New since `1.12.0-95`:** the Reports secondary bar (`0e84464`, comp
`design-comps/reports-secondary-nav-2026-09-23`) - coach Reports smoke
Findings 1 and 2 and the Finding 3 Defense wording correction. See
`docs/OPEN-DEFECTS.md`.

## Coach smoke checklist

1. One secondary bar sits directly under the Reports strip, in the same place,
   on Offense, Defense, Special Teams, Players, Self-Scout, Matchup and Season;
   Overview has none.
2. Offense has six pages and Defense four; each page shows its own modules,
   and switching pages or scope never moves the strip or the bar.
3. Export from any Offense or Defense page gives the full report.
4. No detail tab shows the game KPI banner. Overview's score shows the box
   score with Result, Charted and Turnover margin, and no repeated opponent.
5. The Defense board reads `Explosive Plays` / `Explosive Plays Rate` with no
   wrapped KPI tile or header; the Defense export still says `Allowed`.
6. Special Teams' five sections fit the bar at your window size.
7. Carried from `1.12.0-95`, not yet verdicted: strip geometry, Current game
   defaults, outer frame, Players names, and the earlier carried items.

Installed smoke pending. Not tagged, pushed or published.
