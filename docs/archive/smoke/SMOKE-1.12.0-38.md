# GridIron IQ 1.12.0-38 - Design Audit Candidate

Date: 2026-08-09
Source: `39e2196` plus the version-only `1.12.0-38` stamp
Purpose: installed real-data baseline for the end-to-end UX/UI design review

This is a local unsigned candidate. It is not a published release. The prior
`1.12.0-37` artifact is defective and must not be reused.

## Verification

- `node tools/e2e-p0-exit.mjs`: 17/17
- Vite production build: passed
- `cargo tauri build --no-sign`: passed; NSIS and MSI produced

## Artifacts

- NSIS: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-38_x64-setup.exe`
  - SHA-256: `326EB7CF94E8A559C1C74EDE2ED18A6EF7B93CB8FCCAD4932C3CE6D0F4445500`
- MSI: `src-tauri/target/release/bundle/msi/GridIron IQ_1.12.0-38_x64_en-US.msi`
  - SHA-256: `53DFDF15867EFE850F4664418A3A2F7BFA2EB265B66CC1B4882EA70668295DAA`

Install over the existing application without deleting application data. This
candidate establishes the installed visual baseline; it does not itself close
the design review.
