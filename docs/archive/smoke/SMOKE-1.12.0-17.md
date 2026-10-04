# Smoke record - 1.12.0-17

Artifact: `GridIron IQ_1.12.0-17_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-17_x64_en-US.msi`
Accepted S5d source: `a4806b5`
Versioned/package source: `2d9e532`
Date: 2026-08-02
Tester: Coach

## Status: PASS - S5 COMPLETE; S6 OPEN

This is the required local unsigned post-S5d milestone build. It is not tagged,
published, or advertised as a stable release. The coach installed the NSIS build
and passed the agreed five-point rollback-contract smoke:

1. Linked D-drive film loaded and played.
2. Fullscreen presentation, edge coverage, and drawing alignment were usable.
3. A play could be charted, saved, and revisited accurately.
4. Film Room, Study, Reports, and Plan all opened and functioned.
5. Game switching and app restart preserved tags and linked film.

The coach reported: "it passes your 5 point checklist." No film, data, or route
usability failure occurred, so S5d is accepted and S5 is complete. S6 may open.
Managed C: film copies remain protected until their separate deletion decision.

## Automated evidence

- Accepted S5d gate at `a4806b5`: 80/80 green, 0 skipped.
- Version/package checkpoint `2d9e532`: native theater 22/22, P0 exit 17/17,
  `cargo check` clean, Vite production build clean.
- The fullscreen box uses containing-block percentages instead of viewport units;
  media has no CSS transform or filter. Installed WebView2 smoke accepted visual
  usability; coverage percentages remain regression instruments, not quality targets.
- Four version owners report `1.12.0-17`.
- `football-film-analyzer.html` was not rebuilt or changed.

## Artifact hashes

- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-17_x64-setup.exe`
  - Size: 3,963,192 bytes
  - SHA-256: `D732B76FAE6D58379842D79688379CD695C3F246AE2D9BFD16321B037C2E1931`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-17_x64_en-US.msi`
  - Size: 5,505,024 bytes
  - SHA-256: `03C018D362FDE94A360A9C78B4F25B3216F41C2050C8543B25A041113DDDC622`

## Next

S6 audits and finishes Home, Study, and Plan. S7 remains closed until S6 is
accepted. Do not begin downstream work by changing the accepted Breakdown route.