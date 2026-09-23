# SMOKE 1.12.0-95 - Windows x64 Beta (unsigned)

**Source:** `8b926a6` (the four-owner version bump on top of `8ed64ec`), built
from the clean main checkout. **Gate:** 123/123 green, 0 skipped, at `8ed64ec`;
`e2e-p0-exit` 19/19 after the bump.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-95_x64-setup.exe`
(4,023,717 bytes). SHA-256:
`BC0508F0172706837212DEE14922068E12693125CCA6D84CA2A32D3F80909557`.
The built executable reports file and product version `1.12.0-95`. Built with
`cargo tauri build --bundles nsis` and a local `createUpdaterArtifacts:false`
override (no signing key); exit 0.

**New since `1.12.0-94`:** the Reports global strip and the `1.12.0-94` smoke
repairs (`160533c`) - see `docs/OPEN-DEFECTS.md`.

## Coach smoke checklist

1. Reports tabs sit at one height and position on all eight reports;
   Overview to Season is a straight horizontal move; Season is last.
2. The game score shows on Overview only; no detail tab shows a score.
3. Defense and Special Teams open on Current game; a Full season choice sticks.
4. No black empty frame around Players, Self-Scout, Matchup or Season.
5. Players names line up after one- and two-digit jersey numbers.
6. Carried from `1.12.0-94`, not yet verdicted: Breakdown Edit library beside
   labels; Offense, Self-Scout, Season and Matchup on real data; the white
   HTML/PDF exports; `Balanced` strength; the `1.12.0-93` setup, identity and
   penalty Auto D&D items.

Installed smoke pending. Not tagged, pushed or published.
