# GridIron IQ Documentation Index

Updated 2026-10-10.

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
  `GRIDIRON-IQ-TEAM-HUB-SPEC.md`, `GRIDIRON-IQ-SAVE-CONTRACT.md` - domain and
  interaction contracts.
- `docs/HIDDEN-VALUES-LIST.md` - plays holding values they cannot show, for
  the coach to re-chart (`node tools/audit-hidden-values.mjs`).
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

- **Latest coach-smoked installer: `1.12.0-113`** (2026-10-09,
  `SMOKE-1.12.0-113.md`): PASS with the intermittent rapid-scrubbing defect
  deferred in `docs/OPEN-DEFECTS.md`; no further coach findings. Includes missed
  tackles, smoke 112 repairs, Drive in Situation and kick coverage tackles.
  Built from clean version-bump commit `22e83a47`; `e2e-p0-exit` passed 20/20.
  Artifact: `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-113_x64-setup.exe`,
  4,036,887 bytes, SHA-256
  `2D93D5950C9B16AF3928C170655534B022B58613EFC2D4C926FC8DD771460E87`.
  Product and file versions verified. Independent packaged-asset inspection
  PASS (2026-10-09). Installed smoke acceptance is separate from the gate
  receipt's historical `installedApproval: not-assessed` and does not move the
  design approval registry. No push, tag or publication authorized here.
- **Built since 113, not packaged (2026-10-10):** Chart's draft and Save
  (`GRIDIRON-IQ-SAVE-CONTRACT.md`) and Dashboards (`docs/REPORTS-CONTRACTS.md`
  > Dashboards). Codex review, full gate and installer pending; focused
  harnesses green.
- **Latest full gate:** GREEN, 156/156 at `d1b553ba` (2026-10-08), no skips or
  failures. Release evidence eligible; installed approval not assessed. Covers
  the smoke 112 repairs, Drive in Situation and kick coverage tackles, each
  reviewed by Codex with no open findings.
- **Organize pass (2026-10-04):** finished plans, old smoke records, the full
  defect history and the full roadmap history moved to `docs/archive/`;
  accumulated test captures moved out of `artifacts/`; dead code, orphaned
  CSS and repair-history comments removed (every comment-only change proven
  by byte-identical JS/CSS bundles); the silent startup `season.json` import
  and the unscoped version read/delete deleted; obsolete worktrees removed;
  the tag and Special Teams model docs rewritten as current contracts and
  reviewed by Codex; four standing-rule docs replaced by `docs/RELEASE.md` and
  `docs/COLLABORATION.md`; the remaining contracts brought to current state;
  five one-time tools deleted. Pushed, and packaged from `1.12.0-110` on.
- **Design registry:** every Reports manifest and Home read
  `productionStatus: REJECTED`; Break Down charting is COMP_APPROVED with
  production DRAFT; the Break Down cleanup is COMP_APPROVED with production
  IMPLEMENTED_UNVERIFIED. Installed smokes approved bounded changes without
  moving the registry.
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
- `smoke/` - earlier passed installed smoke records through `1.12.0-111`.

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
