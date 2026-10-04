# Smoke record - 1.12.0-39

Artifact: `GridIron IQ_1.12.0-39_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-39_x64_en-US.msi`
Source: `6be953c`
Date: 2026-08-09
Tester: Coach

## Status: READY - REQUIRED S6 CLOSING SMOKE

This is the local unsigned S6 milestone candidate required before S7 removes
`#app`, `#wsClassicOutlet`, the restore paths, `build.sh`, and dead legacy CSS.
It is not tagged, published, or advertised as a stable release. Install over
the existing application without deleting application data.

## Coach checklist

1. Open a real linked-film game from Home. Confirm D-drive film loads, plays,
   seeks, and follows a selected play without repair or a managed C-drive copy.
2. In Break Down, save one harmless tag edit, move between Chart and Film Room,
   revisit the play, and confirm the film position and saved value are intact.
3. In Study, run one real question and Watch its cohort. Open Reports and confirm
   Overview plus one offense/defense report populate; launch one film-linked row.
   Save one Study finding to Plan and confirm its Watch action opens the same film.
4. Switch games from the universal context control on at least two routes, then
   return Home. Confirm the active game, score/status, and linked-film state agree.
5. Open a typed Delete Game or Delete Season confirmation. Type `dele` immediately:
   Delete must remain disabled. Finish `te`: it may arm, but press Escape/Cancel.
   Confirm nothing was deleted and ordinary navigation still owns focus.
6. Restart GridIron IQ. Confirm the harmless tag edit, active season, linked film,
   Study/Reports/Plan routes, and game switching still work.

**Pass condition:** no film, data, route, or focus failure. Cosmetic observations
may be logged for later, but they do not block S7 unless they make a workflow
unusable. A failure in any item keeps S7 closed.

## Automated evidence

- Canonical gate: 82/82 green, 0 skipped, 0 failed.
- Focused: Team Hub 21/21; native Reports 61/61; P0 exit 17/17.
- Both final proof additions were mutation-verified against rebuilt bytes.
- `cargo check --manifest-path src-tauri/Cargo.toml`: clean.
- `cargo tauri build --no-sign`: NSIS and MSI produced.
- All four version owners report `1.12.0-39`.

## Artifact hashes

- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-39_x64-setup.exe`
  - Size: 3,981,433 bytes
  - SHA-256: `B5364284B20D4C6BD0C3A2F8A163E4F944A30EB665FEAD3FF72DD7743EF01AD4`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-39_x64_en-US.msi`
  - Size: 5,525,504 bytes
  - SHA-256: `085CD38F8574B01C09EDB983CFF8E408FBF227646CE215FCA55A07AD4F542B6E`

## Next

Coach records PASS or the exact failed checklist item here. PASS closes S6 and
opens S7 legacy deletion. Do not start S7 on an assumed or partial result.
