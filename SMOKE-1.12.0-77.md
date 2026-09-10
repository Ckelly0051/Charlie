# GridIron IQ 1.12.0-77 Beta Smoke

## Candidate

- Version commit: `15cd78d` (`chore: bump to 1.12.0-77`)
- Reports repair: `0ecec0f`
- NSIS installer: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-77_x64-setup.exe`
- NSIS bytes: `4,003,900`
- NSIS SHA-256: `9C14638C8CCFC01E47C3A90E3469BC751D184EC147C26F3FBB1AEB94B4646795`

## Status - UNGATED LOCAL HANDOFF

Per coach instruction, no harness or release gate was run for this candidate.
Tauri rebuilt the frontend and produced the unsigned NSIS and MSI packages with
`--no-sign`. The built executable's FileVersion and ProductVersion both read
`1.12.0-77`. This candidate is for direct local inspection only; it is not an
accepted, tagged, pushed, or published release.

## Requested Checks

1. Confirm every Attack Direction row shows aggregate snaps, percent of eligible snaps, and yards/play.
2. Confirm the Reports tab strip no longer paints a vertical scrollbar or forces extra vertical space.
3. Do not accept Breakdown: Delete play has a confirmed source defect and remains intentionally unrepaired pending the batch.
