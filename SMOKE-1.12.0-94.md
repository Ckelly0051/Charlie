# SMOKE 1.12.0-94 - Windows x64 Beta (unsigned)

**Source:** `81fe261`, packaged from a clean detached worktree
(`C:\Users\charl\gridiron-release-94`). The four version owners were bumped to
`1.12.0-94` in that worktree only; **the bump is not yet committed** and lands
with the smoke feedback. Unrelated dirty files in the main checkout were not
part of the package.
**Carries over `1.12.0-93`:** `5d8936a` Breakdown library buttons beside their
labels; `110da67`, `76f00db`, `e299c4a` Reports review and the redesigned HTML
exports; `81fe261` the Balanced strength label in Reports and Study.
**NSIS installer:**
`src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-94_x64-setup.exe`
(4,016,770 bytes). SHA-256:
`17899B1299ED244036FA0C78AD8E2789DC4C934101892121DCE616C4C6B41D6F`.
The built executable reports file and product version `1.12.0-94`.
Built with `cargo tauri build --bundles nsis` and a local
`createUpdaterArtifacts:false` override (no signing key); exit 0.

**Verification:** none before packaging, by the coach's direction. The
canonical gate runs after the smoke feedback is implemented.

## Installed feedback in progress (2026-09-22)

This is not a full installer approval. The coach approved a *new navigation
comp*, `design-comps/reports-global-strip-2026-09-22.html`, for all eight
Reports tabs. The top-level tab strip must stay at one y coordinate with
stable tab positions, put Season last, and leave report-specific controls
below it. Scope-capable boards default to Current game; the game linescore
appears only on Overview. The comp's short tables are placeholders, not a
request to truncate the actual reports. The earlier Offense season-selector
suggestion was withdrawn.

Other open installed findings: recent report boards have a black outer frame
or empty surround, and Players names start at different x positions after
one- versus two-digit jersey numbers. `docs/OPEN-DEFECTS.md` is the current
defect index and `docs/VISUAL-SYSTEM-RULES.md` is the approved strip contract.
No source repair, rebuilt installer, or completed installed verdict is claimed
by this note.

**Update, 2026-09-22:** the strip, Overview-only score, outer-frame and Players
name repairs landed in source after this package, in `160533c` (docs
`c7e9f76`). They are **not in this installer** and need a new package and
installed smoke.

## Coach smoke checklist

1. Breakdown > Defense Edit library: action buttons sit beside their labels;
   Add front persists after reload.
2. Reports > Offense, Self-Scout, Season and Matchup on real data.
3. Export game, season, Defense, Special Teams, Self-Scout and player reports:
   white ruled layout; Special Teams Units ledger inside its chapter.
4. `Balanced` strength reads correctly in Reports and Study.
5. The unsmoked `1.12.0-93` items: season setup readiness, setup type, team
   identity after reopen, and penalty Auto D&D.

Installed for coach smoke by 2026-09-22; full installed verdict pending. Not
tagged, pushed or published.
