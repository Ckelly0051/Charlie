# GridIron IQ Documentation Index

Updated 2026-10-04.

## Current authority

- `CLAUDE.md` - binding rules, owners and process.
- `AGENTS.md` - architecture and module map.
- `GRIDIRON-IQ-PLAN-V2.md` - forward roadmap.
- `docs/OPEN-DEFECTS.md` - open defects, pending smoke items, coach decisions.
- `docs/TESTING.md` - testing tiers and execution rules.
- `docs/REPORTS-CONTRACTS.md`, `docs/HOME-CONTRACTS.md` - Reports and Home rules.
- `docs/VISUAL-SYSTEM-RULES.md` - shared palette, typography, navigation,
  selector and dashboard composition rules.
- `GRIDIRON-IQ-TAG-MODEL.md`, `GRIDIRON-IQ-PENALTY-MODEL.md`,
  `GRIDIRON-IQ-SPECIAL-TEAMS-MODEL.md`, `GRIDIRON-IQ-PLAY-CALL-MODEL.md`,
  `GRIDIRON-IQ-WORKSPACE-CONTRACT.md`, `GRIDIRON-IQ-OVERLAY-SPEC.md`,
  `GRIDIRON-IQ-TEAM-HUB-SPEC.md` - domain and interaction contracts.
- `docs/COLLABORATION.md` - roles, decision rights, when to ask the coach.
- `docs/RELEASE.md` - release cadence, pre-smoke checks, smoke checklist and
  record format.
- `TAURI.md` - desktop build, packaging and installed smoke.
- `design-approvals/APPROVALS.json` and per-surface manifests - design and
  production acceptance status.
- `docs/AI-RECOGNITION-PLAN.md` - parked AI recognition plan.
- `docs/LEGACY-RECHART-LIST.md` - plays the coach still needs to re-chart.
- `docs/HUDL-DEFENSE-REPORTING-REFERENCE.md` - reference for future Defense
  reporting.
- `GRIDIRON-IQ-P0-CAPABILITY-INVENTORY.md` - capability inventory checked by
  `e2e-p0-exit`.

## Current snapshot

The one place release state is kept current. Replace entries; do not append a
log.

- **Latest coach-smoked installer: `1.12.0-108`** (2026-10-01,
  `SMOKE-1.12.0-108.md`). Break Down charting cutover and visual finish, S107
  repairs. Full gate 141/141 at `0163da45`; unsigned NSIS
  `GridIron IQ_1.12.0-108_x64-setup.exe`, 4,041,437 bytes, SHA-256
  `DA6C40A96A553881FFD96A9A6215E6F1CE25DD6FA56BDF3C3FD83FC0F24A2E77`. Tagged
  `v1.12.0-108`.
- **In source since 108, not packaged:** CR-1..CR-8 (`576a0981`), gate
  infrastructure (`f84c8be0`..`06a1ffcf`), Special Teams roster ownership and
  its review repairs (`06b66829`, `76e592f1`, `84b43520`), and Fake tries kept
  out of player credit (`15b03677`). Smoke items are in `docs/OPEN-DEFECTS.md`.
- **Latest full gate:** GREEN, 147/147 at `29cb2768` (2026-10-04), covering
  everything since 108.
- **Organize pass (2026-10-04):** finished plans, old smoke records, the full
  defect history and the full roadmap history moved to `docs/archive/`;
  accumulated test captures moved out of `artifacts/`; dead code, orphaned
  CSS and repair-history comments removed (every comment-only change proven
  by byte-identical JS/CSS bundles); the silent startup `season.json` import
  and the unscoped version read/delete deleted; obsolete worktrees removed;
  the tag and Special Teams model docs rewritten as current contracts and
  reviewed by Codex; four standing-rule docs replaced by `docs/RELEASE.md` and
  `docs/COLLABORATION.md`; the remaining contracts brought to current state;
  five one-time tools deleted.
  All local, not pushed, not packaged.
- **Design registry:** every Reports manifest and Home read
  `productionStatus: REJECTED`; installed smokes approved bounded changes
  without moving the registry.
- Harness inventory is discovered from `tools/e2e-*.mjs`; never a count in
  prose.

## Archive

`docs/archive/` is history, not current authority:

- `CLAUDE-HISTORY-THROUGH-2026-09-02.md`, `CLAUDE-2026-09-27.md`,
  `TESTING-2026-09-27.md` - earlier rule sets and test notes.
- `OPEN-DEFECTS-THROUGH-2026-10-04.md` - every defect record, open and closed.
- `plans/` - finished plans, audits and closeouts, including
  `GRIDIRON-IQ-PLAN-V2-THROUGH-2026-10-04.md` (full roadmap history, the Break
  Down charting comp build contract and milestone acceptance records).
- `smoke/` - installed smoke records before `1.12.0-108`.

## Update discipline

Every milestone handoff updates, in the same commit:

1. The current snapshot above when version or release state changes.
2. `docs/OPEN-DEFECTS.md` for every opened or closed item (closed items are
   deleted there, not kept).
3. `GRIDIRON-IQ-PLAN-V2.md` for roadmap or product-decision changes.
4. The owning approval manifest when canonical evidence or status changes.
5. `docs/TESTING.md` only for changed test contracts.
6. `docs/VISUAL-SYSTEM-RULES.md` when a shared visual decision changes.
7. The owning manifest's `supersededArtifact` when a global token change
   invalidates canonical pixel evidence; regenerate under a new tracked path.

Run `node tools/audit-design-approvals.mjs` after any canonical artifact or
manifest change.
