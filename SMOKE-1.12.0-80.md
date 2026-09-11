# GridIron IQ 1.12.0-80 Beta Smoke

## Candidate

- Global secondary-copy repair: `b534a3f`
- Version commit: `2d67515`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-80_x64-setup.exe`
- NSIS bytes: `4,001,864`
- NSIS SHA-256: `F2071A5C4D57B15B8A3277D68BAC5EA4AFEBE2B660926C2732743C434AB593D4`
- MSI package: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-80_x64_en-US.msi`
- MSI bytes: `5,545,984`
- MSI SHA-256: `F26951F54CC3B193669C7DD1421E171984026F15C0F536E84C011821F735C01E`

## Status - LOCAL VISUAL-SMOKE CANDIDATE

The executable FileVersion and ProductVersion both read `1.12.0-80`. Tauri
rebuilt the frontend and produced unsigned NSIS and MSI packages with
`--no-sign`. This candidate is not accepted, tagged, pushed or published.

## Verification

- Production Vite build: passed.
- Design system: 17/17.
- Workspace shell: 91/91.
- Native Breakdown theater: 60/60.
- Native Reports: 99/99.
- Full release gate: not run for this palette-only visual handoff.

## Installed Check

Confirm subdued shell status text such as `No film selected`, context metadata,
and secondary labels now read as neutral gray with no blue cast. Spot-check
Breakdown and Reports to ensure primary copy and semantic blue, cyan, gold,
green and red accents remain unchanged.
