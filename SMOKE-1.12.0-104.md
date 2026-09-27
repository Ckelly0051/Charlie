# SMOKE 1.12.0-104 - Windows x64 Beta (unsigned)

**Source:** `5b694f7` (the four-owner version bump on top of `ec71410`), built
from the clean main checkout. **Gate:** full gate at `ec71410` 137/137, zero
skipped, zero failed; `e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-104_x64-setup.exe`
(4,036,224 bytes). SHA-256:
`121E43F1D8D4DE2C52FE8018EFD09DDCE0FEA3152EE16FBFEFBFB6C14E1E67A6`.
The built executable reports product version `1.12.0-104`. Built with
`cargo tauri build --bundles nsis` and a scratch config setting
`bundle.createUpdaterArtifacts:false` (no signing key); exit 0.

`1.12.0-103` plus the S103-1 repair (`c1e8d2b`, and `ec71410` from the Codex
review). The `1.12.0-103` installed smoke passed (`SMOKE-1.12.0-103.md`); the
coach accepted it on 2026-09-27.

## Check

1. Home > Recover seasons: the two `Old format` rows show `Saved in an old
   GridIron IQ format. It cannot be recovered.` and no button, and no
   `0 games · 0 plays`. Recoverable rows keep their `Recover` action.

Installed check pending. Not tagged, pushed or published.
