# GridIron IQ Documentation Index

Updated 2026-10-12.

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
- **Smoked: `1.12.0-114`** (2026-10-10, `SMOKE-1.12.0-114.md`): Chart's draft
  and Save, unit changes as saves with a charted-data prompt, tacklers on a
  change of possession, Dashboards rev 1. Coach checks 1-2 passed and Claude's
  installed checks 8-10 passed; the coach closed the findings list (six
  findings) for fixing. Packaged-asset inspection PASS.
- **Built, awaiting the coach's smoke: `1.12.0-115`** (2026-10-12,
  `SMOKE-1.12.0-115.md`): the smoke 114 fixes (Dashboards home, read-only
  templates, Special Teams teal, prose, the installed-check defects, bar
  scale) and one yards rule across the reports, Study and Dashboards
  (`docs/REPORTS-CONTRACTS.md` > Yards). Codex review rounds closed with no
  open findings. Built from clean version-bump commit `3788a593`;
  `e2e-p0-exit` 20/20. Artifact:
  `src-tauri/target/release/bundle/nsis/GridIron IQ_1.12.0-115_x64-setup.exe`,
  4,047,120 bytes, SHA-256
  `EE10EAFE802F5ECD05FAF58B156F05F119CE41CCCFAEDBAB3A2009BEF6A7677A`.
  Packaged-asset inspection not run. No push, tag or publication.
- **Latest full gate:** 158/158 green at `216d5426` (2026-10-12). Receipt:
  `artifacts/gate-logs/2026-10-12T06-16-21-359Z-WTtmIO/receipt.json`.
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
