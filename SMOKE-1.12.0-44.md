# Smoke record - 1.12.0-44

Artifact: `GridIron IQ_1.12.0-44_x64-setup.exe`
Alternative: `GridIron IQ_1.12.0-44_x64_en-US.msi`
Source: `a00c49e` (S7 one-pass demolition `888b27e` + Codex review closeout)
Date: 2026-08-10
Tester: Coach

## Status: READY - S7 DEMOLITION SMOKE CANDIDATE

This is the local unsigned candidate built after Codex's independent review of
the S7 one-pass demolition (`888b27e`) came back **ACCEPTED, no material
findings**. `#app` and `#wsClassicOutlet` are deleted; the tagging domain, Film
Room grid, Reports' legacy render target, and the remaining top-bar chrome now
live in a permanent host outside the shell root. Not tagged, published, or
advertised as a stable release. Install over the existing application without
deleting application data.

## Coach checklist

Same shape as prior milestone smokes, plus items 6-7 target exactly what
changed in this pass — the legacy shell is gone, so anything that used to hide
behind it must still work correctly from its new permanent home.

1. Open a real linked-film game from Home. Confirm D-drive film loads, plays,
   seeks, and follows a selected play without repair or a managed C-drive copy.
2. In Break Down, save one harmless tag edit (including a structured penalty or
   Special Teams field), move between Chart and Film Room, revisit the play,
   and confirm the film position and saved value are intact.
3. In Study, run one real question and Watch its cohort. Open Reports and
   confirm Overview plus one offense/defense report populate; launch one
   film-linked row. Save one Study finding to Plan and confirm its Watch action
   opens the same film.
4. Switch games from the universal context control on at least two routes,
   then return Home. Confirm the active game, score/status, and linked-film
   state agree.
5. Open a typed Delete Game or Delete Season confirmation. Type `dele`
   immediately: Delete must remain disabled. Finish `te`: it may arm, but press
   Escape/Cancel. Confirm nothing was deleted and ordinary navigation still
   owns focus.
6. In Break Down's tag form: change the Offense/Defense/Special Teams unit
   toggle, hit New Drive, insert a note timestamp, and (if you use it) toggle
   Auto D&D / Carry Scheme in settings. All of these now call real methods
   directly instead of clicking a hidden legacy control — confirm each still
   does exactly what it did before.
7. Confirm Undo, Redo, and Shortcuts (top-bar chrome) remain reachable and
   working — they were relocated to a new permanent host in this pass.
8. Restart GridIron IQ. Confirm the harmless tag edit, active season, linked
   film, Study/Reports/Plan routes, and game switching still work.

**Pass condition:** no film, data, route, or focus failure. Cosmetic
observations may be logged for later. A failure in any item is a real
regression from this pass, since nothing else changed.

## Automated evidence

- Canonical gate: 83/83 green, 0 skipped, 0 failed (both on the demolition
  commit and again after the version stamp).
- Focused: native tagging 48/48; workspace shell 76/76.
- `cargo check --manifest-path src-tauri/Cargo.toml`: clean.
- `cargo tauri build --no-sign`: NSIS and MSI produced.
- All four version owners report `1.12.0-44` (`e2e-p0-exit` 17/17).
- Cold-boot probe: `#app` and `#wsClassicOutlet` confirmed absent from the DOM
  at boot, `#giLegacyEngineHost`/`#giMediaHost`/`#workspaceShell` present, zero
  page errors.
- Codex independent review of `888b27e`: ACCEPTED, no material findings.

## Artifact hashes

- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-44_x64-setup.exe`
  - Size: 3,971,014 bytes
  - SHA-256: `E9A12E40E857C36616BF3510C3560FF71FFB01F09E557BAA1322ACEFB1C13ABA`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-44_x64_en-US.msi`
  - Size: 5,517,312 bytes
  - SHA-256: `01735086F8580047BB50C3B89648E6938EA55A30989839B5403FB543CE9483B5`

## Next

Coach records PASS or the exact failed checklist item here. PASS closes the S7
demolition milestone as installed-verified. S7-e (CSS migration), S7-f
(build-artifact retirement), and S7-g remain open regardless of this smoke's
outcome — they are separate, not-yet-started work.
