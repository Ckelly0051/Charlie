# SMOKE 1.12.0-106 - Windows x64 Beta (unsigned)

**Source:** `2f309d6` plus the four-owner `1.12.0-106` version bump.
**Gate:** 136/136 green, 0 skipped, 0 failed at `2f309d6`, before the
version-only bump. **Installer:** pending. No installed smoke or acceptance
is claimed. No tag, push, or publication is planned.

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

Record installer path, size, SHA-256, build revision, and coach's installed
result here after packaging and smoke. A green browser gate does not certify
WebView2 behavior.
