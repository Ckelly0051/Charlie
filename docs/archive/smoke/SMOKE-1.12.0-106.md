# SMOKE 1.12.0-106 - Windows x64 Beta (unsigned)

**Source:** `cbf1889` (`2f309d6` plus the four-owner `1.12.0-106` version bump).
**Gate:** 136/136 green, 0 skipped, 0 failed at `2f309d6`, before the
version-only bump; `e2e-p0-exit` 19/19 after it. **Installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-106_x64-setup.exe`
(4,030,483 bytes), SHA-256
`E5A24C677D4235D0C58300362CDD9E8AD035ED87418DB92D77D9D600FDB8E8CA`.
Built with `cargo tauri build --bundles nsis --config
artifacts/local-installer-config.json` (exit 0); the scratch config disables
updater-artifact signing. The built executable reports product and file version
`1.12.0-106`. Nothing was tagged, pushed, or published.

This candidate repairs S105-1 from the `1.12.0-105` installed smoke. The
approved Break Down charting comp is not implemented in this candidate;
BD-UX-1 remains open.

## Installed Checks

1. Settings > Team: type a different program name, immediately press Escape.
   Reopen Settings and restart the app; the new name must persist. Repeat
   with Done and the close button, without pressing Save team identity.
2. Change the name, switch to Film and back, then close Settings. The typed
   value must remain and persist. A blank program name must not overwrite
   the saved one and must show a clear error.
3. Confirm the prior `1.12.0-105` smoke checks still hold: Special Teams
   tries, custom-field editor, and Recover seasons. Record any regression.
4. Required desktop smoke: open linked film on its real drive and managed
   film, confirm both play; chart a play and restart to confirm data and film;
   switch seasons and confirm counts, tags, and film identity.

## Result (2026-09-28)

The coach approved the `1.12.0-106` installed smoke. S105-1 is accepted in
this build. This approval does not implement or accept the separate Break Down
charting comp or close BD-UX-1. The coach did not provide per-check notes in
the approval message; the checklist above remains the scope of this smoke.
