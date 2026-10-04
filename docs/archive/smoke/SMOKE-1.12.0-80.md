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

## Status - INSTALLED VISUAL CHECK PASSED (NAMED SCOPE)

The executable FileVersion and ProductVersion both read `1.12.0-80`. Tauri
rebuilt the frontend and produced unsigned NSIS and MSI packages with
`--no-sign`. On 2026-09-11 the coach approved the installed shared typography,
global navigation, context-selector width, graphite chrome, and neutral
secondary-copy result. This is a scoped visual pass, not whole-surface or
release acceptance; the candidate is not tagged, pushed or published.

## Superseded by source — read this first (added 2026-09-11)

**This record describes an installer, not current source.** An independent
non-builder review of `7afa94d..44adcc6` **failed the pre-gate checkpoint**: four
Reports harnesses were red at `44adcc6`, two of them against hash-protected
approved design evidence, behind the six green suites listed below.

The verification list below is accurate and incomplete. It names the suites that
were run; it does not name `e2e-reports-overview` (101/7),
`e2e-reports-offense-realdata` (28/3), `e2e-reports-defense-realdata` (46/4),
`e2e-reports-self-scout` (109/1) or `e2e-reports-season` (97/1), all of which the
range had materially changed.

Those regressions are repaired in source after this installer. **No installed
build contains the repairs.** `1.12.0-80` remains a historical installed
visual-scope pass and is not an accepted release. Detail:
`docs/OPEN-DEFECTS.md`; contract: `docs/VISUAL-SYSTEM-RULES.md`.

## Verification

- Production Vite build: passed.
- Design system: 17/17.
- Workspace shell: 91/91.
- Native Breakdown theater: 60/60.
- Native Reports: 99/99.
- Full release gate: not run for this palette-only visual handoff.

## Installed Result

Passed. Subdued shell status text such as `No film selected`, context metadata,
and secondary labels read as neutral gray with no blue cast. The larger global
route navigation, widened selectors, and Breakdown typography/reflow were also
approved in the installed app. Primary copy and semantic blue, cyan, gold,
green and red accents remain distinct.
